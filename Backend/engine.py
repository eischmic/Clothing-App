"""
Query-side style engine: build a style profile, recommend items, learn from
feedback, and produce an interpretable style breakdown.

    from engine import StyleEngine
    eng = StyleEngine("index")

    # 1) profile from uploaded photos (paths or PIL images) ...
    vecs = eng.embed_images(["me1.jpg", "me2.jpg", "me3.jpg"])
    # ... or from catalog items (e.g. a demo persona's past purchases)
    vecs = eng.vectors_for_articles(["0108775015", "0110065001"])

    profile = eng.build_profile(vecs, k=2)          # k>1 -> multiple style "prototypes"
    recs = eng.recommend(profile, n=20, exclude_ids=owned_ids)
    print(eng.style_breakdown(profile))

At ~20K items, brute-force numpy matmul is instant, and it lets us filter BEFORE
searching. Reach for FAISS only if the catalog grows into the hundreds of thousands.
"""
from pathlib import Path

import numpy as np
import pandas as pd

import axes

MODEL_NAME = "patrickjohncyh/fashion-clip"

STYLE_AXES = [
    "minimalist", "streetwear", "vintage", "preppy", "bohemian",
    "athleisure", "elegant formal", "casual everyday", "edgy punk",
    "romantic feminine",
]


def _normalize(x: np.ndarray) -> np.ndarray:
    return x / np.maximum(np.linalg.norm(x, axis=-1, keepdims=True), 1e-12)


def _projected(out):
    """The projected CLIP embedding, across transformers 4.x and 5.x.

    4.x returned a bare tensor from get_*_features; 5.x returns a
    BaseModelOutputWithPooling whose `pooler_output` is that same projected
    vector (verified cosine-identical, 512-d on both the text and image paths).
    """
    return out.pooler_output if hasattr(out, "pooler_output") else out


def _spherical_kmeans(x: np.ndarray, k: int, seed: int = 0, iters: int = 25) -> np.ndarray:
    rng = np.random.default_rng(seed)
    centers = x[rng.choice(len(x), size=k, replace=False)]
    for _ in range(iters):
        assign = (x @ centers.T).argmax(1)
        new = np.stack([
            x[assign == j].mean(0) if np.any(assign == j) else centers[j]
            for j in range(k)
        ])
        new = _normalize(new)
        if np.allclose(new, centers):
            break
        centers = new
    return centers


class StyleEngine:
    def __init__(self, index_dir="index", load_model: bool = True):
        index_dir = Path(index_dir)
        self.emb = np.load(index_dir / "embeddings.npy")            # [N, d], L2-normalized
        self.catalog = pd.read_parquet(index_dir / "catalog.parquet")
        assert len(self.emb) == len(self.catalog), "index files are out of sync"

        # Sidecar (built by build_style_index.py). A LEFT join on a de-duplicated
        # right side cannot add or reorder rows, so `self.emb` stays positionally
        # aligned with `self.catalog` -- which recommend() depends on absolutely.
        self.style = self._load_sidecar(index_dir)
        self.axis_quantiles = np.load(index_dir / "axis_quantiles.npy")
        assert self.axis_quantiles.shape == (len(axes.STYLE_DIMENSIONS), axes.N_BREAKPOINTS)

        self.id_to_row = {a: i for i, a in enumerate(self.catalog["article_id"])}
        self._model = self._processor = self._device = None
        self._axis_text_vecs = None          # lazily embedded on first project_profile
        if load_model:
            self._load_model()

    def _load_sidecar(self, index_dir: Path) -> pd.DataFrame:
        style = pd.read_parquet(index_dir / "style.parquet")
        style = style.drop_duplicates(subset="article_id", keep="first")

        before = len(self.catalog)
        merged = self.catalog.merge(style, on="article_id", how="left", validate="m:1")
        assert len(merged) == before, "sidecar join changed the row count"

        # A row missing from the sidecar is not recommendable: we have no vector
        # for it, so it can never be ranked or mapped to a Product.
        merged["recommendable"] = merged["recommendable"].fillna(False).astype(bool)
        merged["category"] = merged["category"].fillna("")
        merged["colour_family"] = merged["colour_family"].fillna("neutral")
        merged["formality"] = merged["formality"].fillna(3).astype(int)
        merged["seasons"] = merged["seasons"].fillna("spring,summer,fall,winter")
        for dim in axes.STYLE_DIMENSIONS:
            merged[dim] = merged[dim].fillna(0.5).astype(np.float32)

        self.catalog = merged
        cols = ["article_id", "category", "colour_family", "formality",
                "seasons", "recommendable", *axes.STYLE_DIMENSIONS]
        return merged[cols]

    # ------------------------------------------------------------------ model
    def _load_model(self):
        import torch
        from transformers import CLIPModel, CLIPProcessor

        self._device = (
            "cuda" if torch.cuda.is_available()
            else "mps" if torch.backends.mps.is_available()
            else "cpu"
        )
        self._model = CLIPModel.from_pretrained(MODEL_NAME).to(self._device).eval()
        self._processor = CLIPProcessor.from_pretrained(MODEL_NAME)

    def embed_images(self, images) -> np.ndarray:
        """images: list of file paths or PIL images -> [n, d] normalized."""
        import torch
        from PIL import Image

        pil = [Image.open(i).convert("RGB") if isinstance(i, (str, Path)) else i.convert("RGB")
               for i in images]
        inputs = self._processor(images=pil, return_tensors="pt").to(self._device)
        with torch.inference_mode():
            out = self._model.get_image_features(**inputs)
            feats = _projected(out)
        return _normalize(feats.float().cpu().numpy())

    def embed_texts(self, texts) -> np.ndarray:
        import torch

        inputs = self._processor(text=list(texts), return_tensors="pt", padding=True,
                                 truncation=True).to(self._device)
        with torch.inference_mode():
            out = self._model.get_text_features(**inputs)
            feats = _projected(out)
        return _normalize(feats.float().cpu().numpy())

    # --------------------------------------------------------------- profiles
    def vectors_for_articles(self, article_ids) -> np.ndarray:
        rows = [self.id_to_row[a] for a in article_ids if a in self.id_to_row]
        return self.emb[rows]

    def build_profile(self, vecs: np.ndarray, k: int = 1, seed: int = 0) -> np.ndarray:
        """Returns [k, d] prototypes. k=1 is just the (normalized) mean vector."""
        vecs = _normalize(np.atleast_2d(vecs))
        k = max(1, min(k, len(vecs)))
        if k == 1:
            return _normalize(vecs.mean(0, keepdims=True))
        return _spherical_kmeans(vecs, k, seed)

    def feedback_update(self, profile: np.ndarray, liked_ids=(), disliked_ids=(),
                        beta: float = 0.5, gamma: float = 0.3) -> np.ndarray:
        """Rocchio-style: pull the nearest prototype toward liked items, push it
        away from disliked ones, then re-normalize."""
        protos = _normalize(np.atleast_2d(profile)).copy()
        for ids, weight in ((liked_ids, beta), (disliked_ids, -gamma)):
            for a in ids:
                if a not in self.id_to_row:
                    continue
                v = self.emb[self.id_to_row[a]]
                j = int((protos @ v).argmax())
                protos[j] += weight * v
        return _normalize(protos)

    # --------------------------------------------------------- recommendation
    def recommend(self, profile: np.ndarray, n: int = 20, exclude_ids=(), groups=None,
                  lambda_: float = 0.7, pool: int = 200) -> pd.DataFrame:
        """Top-n items by max-similarity to any prototype, re-ranked with MMR.

        lambda_: 1.0 = pure relevance, lower = more diverse.
        groups:  optional list of product_group_name values to restrict to.
        """
        profile = np.atleast_2d(profile)
        # Exclusion is a MASK, never a filter of self.catalog: self.emb is
        # positionally aligned with it and dropping rows would silently return
        # the wrong garments.
        mask = self.catalog["recommendable"].to_numpy(dtype=bool).copy()
        if groups is not None:
            mask &= self.catalog["product_group_name"].isin(groups).to_numpy()
        for a in exclude_ids:
            r = self.id_to_row.get(a)
            if r is not None:
                mask[r] = False

        idx = np.flatnonzero(mask)
        rel_all = (self.emb[idx] @ profile.T).max(axis=1)
        top = np.argsort(-rel_all)[:pool]
        cand, rel = idx[top], rel_all[top]
        cand_emb = self.emb[cand]

        selected, remaining = [], list(range(len(cand)))
        max_sim = np.zeros(len(cand))
        while remaining and len(selected) < n:
            scores = lambda_ * rel[remaining] - (1 - lambda_) * max_sim[remaining]
            best = remaining[int(scores.argmax())]
            selected.append(best)
            remaining.remove(best)
            max_sim = np.maximum(max_sim, cand_emb @ cand_emb[best])

        out = self.catalog.iloc[cand[selected]].copy()
        out["score"] = rel[selected]
        return out.reset_index(drop=True)

    # -------------------------------------------------------------- explain
    def style_breakdown(self, profile: np.ndarray, axes=STYLE_AXES,
                        temperature: float = 100.0) -> dict:
        """Relative score of the profile on each text-defined style axis (sums to 1
        across the axes you pass in; tune `temperature` to spread or sharpen)."""
        text = self.embed_texts([f"a photo of {a} style clothing" for a in axes])
        v = _normalize(np.atleast_2d(profile).mean(0))
        sims = text @ v
        z = temperature * (sims - sims.max())
        p = np.exp(z) / np.exp(z).sum()
        return dict(sorted(zip(axes, p.tolist()), key=lambda kv: -kv[1]))

    def _axis_prompt_vectors(self) -> np.ndarray:
        """[18, d] prompt embeddings in axes.prompt_texts() order. Embedded once
        per process: the prompts are constant, and a CLIP text forward pass per
        profile read would dominate the request."""
        if self._axis_text_vecs is None:
            self._axis_text_vecs = self.embed_texts(axes.prompt_texts())
        return self._axis_text_vecs

    def project_profile(self, profile: np.ndarray) -> list:
        """Projects a profile into the frontend's 9-dim StyleVector space,
        percentile-ranked against the SAME catalog breakpoints the per-item
        vectors were ranked against -- so profile and product vectors are
        directly comparable by cosine similarity on the client."""
        v = _normalize(np.atleast_2d(profile).mean(0, keepdims=True))
        raw = axes.raw_scores(v, self._axis_prompt_vectors())
        ranks = axes.percentile_rank(raw, self.axis_quantiles)
        return [float(x) for x in ranks[0]]

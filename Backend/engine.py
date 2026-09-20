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

MODEL_NAME = "patrickjohncyh/fashion-clip"

STYLE_AXES = [
    "minimalist", "streetwear", "vintage", "preppy", "bohemian",
    "athleisure", "elegant formal", "casual everyday", "edgy punk",
    "romantic feminine",
]


def _normalize(x: np.ndarray) -> np.ndarray:
    return x / np.maximum(np.linalg.norm(x, axis=-1, keepdims=True), 1e-12)


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
        self.id_to_row = {a: i for i, a in enumerate(self.catalog["article_id"])}
        self._model = self._processor = self._device = None
        if load_model:
            self._load_model()

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
        feats = out.pooler_output if hasattr(out, "pooler_output") else out
        return _normalize(feats.float().cpu().numpy())

    def embed_texts(self, texts) -> np.ndarray:
        import torch

        inputs = self._processor(text=list(texts), return_tensors="pt", padding=True,
                                 truncation=True).to(self._device)
        with torch.inference_mode():
            out = self._model.get_text_features(**inputs)
        feats = out.pooler_output if hasattr(out, "pooler_output") else out
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
        mask = np.ones(len(self.emb), dtype=bool)
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

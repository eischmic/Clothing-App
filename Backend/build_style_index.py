"""
Offline sidecar builder. Run once; commit the two files it writes.

    cd Backend && .venv/bin/python build_style_index.py

Writes a SIDECAR rather than modifying catalog.parquet, so the raw import stays
pristine and a bad run can never corrupt the source. The output has exactly one
row per catalog row, in the same order, because embeddings.npy is positionally
aligned with catalog.parquet and engine.recommend() indexes self.emb by catalog
row position. Non-recommendable rows are marked, never dropped.
"""
import argparse
from pathlib import Path

import numpy as np
import pandas as pd

import axes
import derive
from engine import StyleEngine


def build(index_dir: str = "index") -> None:
    index_dir = Path(index_dir)
    eng = StyleEngine(index_dir, load_model=True)

    print(f"catalog: {len(eng.catalog):,} rows", flush=True)

    # 1. Embed the 18 prompts, in prompt_texts() order.
    prompts = axes.prompt_texts()
    text_vecs = eng.embed_texts(prompts)
    print(f"embedded {len(prompts)} prompts -> {text_vecs.shape}", flush=True)

    # 2. Project every catalog embedding, then learn the catalog's own
    #    distribution per axis and re-express each score as its percentile.
    raw = axes.raw_scores(eng.emb, text_vecs)
    breakpoints = axes.quantile_breakpoints(raw)
    ranks = axes.percentile_rank(raw, breakpoints)
    print(f"projected -> {ranks.shape}", flush=True)

    # 3. Derive the categoricals, preserving row order.
    cat = eng.catalog
    categories, families, formalities, seasons, recommendable = [], [], [], [], []
    for ptype, pgroup, colour, desc in zip(
        cat["product_type_name"].fillna(""),
        cat["product_group_name"].fillna(""),
        cat["colour_group_name"].fillna(""),
        cat["detail_desc"].fillna(""),
    ):
        category = derive.derive_category(ptype, pgroup)
        categories.append(category or "")
        recommendable.append(category is not None)
        families.append(derive.derive_colour_family(colour))
        formalities.append(derive.derive_formality(ptype))
        seasons.append(",".join(derive.derive_seasons(desc, ptype)))

    out = pd.DataFrame({"article_id": cat["article_id"].to_numpy()})
    for i, dim in enumerate(axes.STYLE_DIMENSIONS):
        out[dim] = ranks[:, i].astype(np.float32)
    out["category"] = categories
    out["colour_family"] = families
    out["formality"] = np.asarray(formalities, dtype=np.int8)
    out["seasons"] = seasons
    out["recommendable"] = np.asarray(recommendable, dtype=bool)

    # Validate everything BEFORE writing either file. The two outputs must agree
    # with each other, and a run that dies between the two writes would leave a
    # fresh style.parquet paired with a stale axis_quantiles.npy -- silently
    # mismatched rather than obviously broken.
    assert len(ranks) == len(cat), (
        f"axis scores cover {len(ranks)} rows but the catalog has {len(cat)}"
    )
    assert len(out) == len(cat), "sidecar row count must match the catalog exactly"
    assert breakpoints.shape == (len(axes.STYLE_DIMENSIONS), 101), (
        f"axis_quantiles must be [9, 101], got {breakpoints.shape}"
    )

    n_ok = int(out["recommendable"].sum())
    pct_ok = 100 * n_ok / len(out)
    if pct_ok < 40:
        raise SystemExit(
            f"only {pct_ok:.1f}% of rows are recommendable (floor is 40%). "
            "That means the derivation tables reject most of the catalog -- "
            "refusing to write a sidecar this thin. Nothing was written."
        )

    out.to_parquet(index_dir / "style.parquet", index=False)
    np.save(index_dir / "axis_quantiles.npy", breakpoints)

    print(f"wrote style.parquet ({len(out):,} rows, {n_ok:,} recommendable "
          f"= {pct_ok:.1f}%)", flush=True)
    print(f"wrote axis_quantiles.npy {breakpoints.shape}", flush=True)
    print("\ncategory distribution:")
    print(out.loc[out["recommendable"], "category"].value_counts().to_string())


def spot_check(index_dir: str = "index", k: int = 10) -> None:
    """Prints the top-k and bottom-k item names per axis, so a human can confirm
    the prompts measure what they claim to. Spec §12 calls for this after the
    first build."""
    index_dir = Path(index_dir)
    style = pd.read_parquet(index_dir / "style.parquet")
    catalog = pd.read_parquet(index_dir / "catalog.parquet")
    merged = style.merge(catalog[["article_id", "prod_name", "product_type_name"]],
                         on="article_id", how="left")
    merged = merged[merged["recommendable"]]

    for dim in axes.STYLE_DIMENSIONS:
        s = merged.sort_values(dim)
        print(f"\n=== {dim} ===")
        print("  LOW: ", "; ".join(s.head(k)["product_type_name"].astype(str)))
        print("  HIGH:", "; ".join(s.tail(k)["product_type_name"].astype(str)))


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--index-dir", default="index")
    ap.add_argument("--spot-check", action="store_true",
                    help="skip building; print top/bottom items per axis")
    args = ap.parse_args()
    if args.spot_check:
        spot_check(args.index_dir)
    else:
        build(args.index_dir)

"""Engine tests against the REAL index, with the model stubbed out."""
import sys
from pathlib import Path

import numpy as np
import pytest

BACKEND_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BACKEND_DIR))

import axes  # noqa: E402
import engine  # noqa: E402

EMB_DIM = 512
INDEX = str(BACKEND_DIR / "index")


@pytest.fixture
def eng(monkeypatch):
    monkeypatch.setattr(engine.StyleEngine, "_load_model", lambda self: None)
    monkeypatch.setattr(
        engine.StyleEngine,
        "embed_texts",
        lambda self, texts: engine._normalize(
            np.random.default_rng(1).normal(size=(len(list(texts)), EMB_DIM)).astype(np.float32)
        ),
    )
    return engine.StyleEngine(INDEX, load_model=False)


def test_sidecar_joins_without_changing_row_count_or_order(eng):
    assert len(eng.catalog) == len(eng.emb), "join desynchronised catalog from embeddings"
    assert len(eng.style) == len(eng.catalog)
    assert (eng.style["article_id"].to_numpy() == eng.catalog["article_id"].to_numpy()).all()


def test_catalog_carries_the_derived_columns(eng):
    for col in ["category", "colour_family", "formality", "seasons", "recommendable"]:
        assert col in eng.catalog.columns, col
    for dim in axes.STYLE_DIMENSIONS:
        assert dim in eng.catalog.columns, dim


def test_axis_quantiles_are_loaded(eng):
    assert eng.axis_quantiles.shape == (9, 101)


def test_recommend_returns_only_recommendable_rows(eng):
    profile = engine._normalize(
        np.random.default_rng(7).normal(size=(1, EMB_DIM)).astype(np.float32)
    )
    recs = eng.recommend(profile, n=40)
    assert len(recs) > 0
    assert recs["recommendable"].all()
    assert recs["category"].ne("").all()


def test_recommend_still_honours_exclude_ids(eng):
    profile = engine._normalize(
        np.random.default_rng(8).normal(size=(1, EMB_DIM)).astype(np.float32)
    )
    first = eng.recommend(profile, n=10)
    excluded = set(first["article_id"].tolist()[:5])
    second = eng.recommend(profile, n=10, exclude_ids=excluded)
    assert not (set(second["article_id"].tolist()) & excluded)


def test_project_profile_returns_nine_bounded_floats(eng):
    profile = engine._normalize(
        np.random.default_rng(9).normal(size=(1, EMB_DIM)).astype(np.float32)
    )
    vec = eng.project_profile(profile)
    assert isinstance(vec, list) and len(vec) == 9
    assert all(isinstance(v, float) for v in vec)
    assert all(0.0 <= v <= 1.0 for v in vec)


def test_project_profile_caches_the_prompt_embeddings(eng, monkeypatch):
    calls = {"n": 0}
    real = eng.embed_texts

    def counting(texts):
        calls["n"] += 1
        return real(texts)

    monkeypatch.setattr(eng, "embed_texts", counting)
    profile = engine._normalize(
        np.random.default_rng(10).normal(size=(1, EMB_DIM)).astype(np.float32)
    )
    eng.project_profile(profile)
    eng.project_profile(profile)
    assert calls["n"] == 1, "prompt embeddings must be embedded once and cached"

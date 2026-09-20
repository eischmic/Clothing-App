import sys
from pathlib import Path

BACKEND_DIR = Path(__file__).parent.parent
sys.path.insert(0, str(BACKEND_DIR))

import numpy as np
import pytest

import axes


def test_dimensions_and_pairs_are_aligned():
    assert len(axes.STYLE_DIMENSIONS) == 9
    assert len(axes.PROMPT_PAIRS) == 9
    assert axes.STYLE_DIMENSIONS == [
        "minimalism", "streetwear", "workwear", "outdoor", "vintage",
        "formal", "colorfulness", "pattern", "relaxedFit",
    ]


def test_prompt_texts_interleaves_positive_then_negative():
    texts = axes.prompt_texts()
    assert len(texts) == 18
    assert texts[0] == axes.PROMPT_PAIRS[0][0]
    assert texts[1] == axes.PROMPT_PAIRS[0][1]
    assert texts[16] == axes.PROMPT_PAIRS[8][0]
    assert texts[17] == axes.PROMPT_PAIRS[8][1]
    assert len(set(texts)) == 18, "prompts must be distinct"


def test_raw_scores_is_positive_dot_minus_negative_dot():
    # d=2. Axis 0: pos=[1,0], neg=[0,1]. Remaining 8 axes are zero vectors.
    text_vecs = np.zeros((18, 2), dtype=np.float32)
    text_vecs[0] = [1.0, 0.0]
    text_vecs[1] = [0.0, 1.0]

    emb = np.array([[1.0, 0.0], [0.0, 1.0], [0.6, 0.8]], dtype=np.float32)
    raw = axes.raw_scores(emb, text_vecs)

    assert raw.shape == (3, 9)
    assert raw[0, 0] == pytest.approx(1.0)    # e·pos - e·neg = 1 - 0
    assert raw[1, 0] == pytest.approx(-1.0)   # e·pos - e·neg = 0 - 1
    assert raw[2, 0] == pytest.approx(-0.2)   # e·pos - e·neg = 0.6 - 0.8
    assert np.allclose(raw[:, 1:], 0.0)


def test_raw_scores_is_monotone_in_positive_similarity():
    text_vecs = np.zeros((18, 2), dtype=np.float32)
    text_vecs[0] = [1.0, 0.0]
    text_vecs[1] = [0.0, 1.0]

    # Sweep from pointing at neg to pointing at pos.
    angles = np.linspace(np.pi / 2, 0.0, 20)
    emb = np.stack([np.cos(angles), np.sin(angles)], axis=1).astype(np.float32)
    raw = axes.raw_scores(emb, text_vecs)[:, 0]

    assert np.all(np.diff(raw) > 0)


def test_quantile_breakpoints_shape_and_monotonicity():
    rng = np.random.default_rng(0)
    raw = rng.normal(size=(500, 9)).astype(np.float32)
    bp = axes.quantile_breakpoints(raw)

    assert bp.shape == (9, 101)
    assert bp.dtype == np.float32
    for a in range(9):
        assert np.all(np.diff(bp[a]) >= 0), f"axis {a} breakpoints not sorted"


def test_percentile_rank_is_uniform_over_the_source_distribution():
    rng = np.random.default_rng(1)
    raw = rng.normal(size=(5000, 9)).astype(np.float32)
    bp = axes.quantile_breakpoints(raw)
    ranks = axes.percentile_rank(raw, bp)

    assert ranks.shape == (5000, 9)
    assert ranks.min() >= 0.0 and ranks.max() <= 1.0
    for a in range(9):
        # A uniform distribution has mean 0.5 and a decile histogram that is flat.
        assert abs(float(ranks[:, a].mean()) - 0.5) < 0.02
        hist, _ = np.histogram(ranks[:, a], bins=10, range=(0.0, 1.0))
        assert hist.min() > 5000 / 10 * 0.75


def test_percentile_rank_clamps_outside_the_breakpoint_range():
    raw = np.zeros((2, 9), dtype=np.float32)
    raw[0, :] = -99.0
    raw[1, :] = 99.0
    bp = np.tile(np.linspace(0.0, 1.0, 101, dtype=np.float32), (9, 1))
    ranks = axes.percentile_rank(raw, bp)

    assert np.allclose(ranks[0], 0.0)
    assert np.allclose(ranks[1], 1.0)


def test_percentile_rank_preserves_order_within_an_axis():
    rng = np.random.default_rng(2)
    raw = rng.normal(size=(300, 9)).astype(np.float32)
    bp = axes.quantile_breakpoints(raw)
    ranks = axes.percentile_rank(raw, bp)

    order_raw = np.argsort(raw[:, 3], kind="stable")
    assert np.all(np.diff(ranks[order_raw, 3]) >= 0)

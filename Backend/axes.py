"""
Projection of FashionCLIP embeddings into the frontend's 9-dimension StyleVector
space, via contrastive text prompts.

Deliberately model-free: this module does pure numpy over embeddings someone
else produced, so it is unit-testable with hand-built arrays and imports neither
torch nor transformers.

Why contrastive pairs rather than a single positive prompt: a bare
`e . pos` score is dominated by how close each prompt happens to sit to the
image-embedding centroid, which is a property of the prompt, not the garment.
Subtracting a deliberately opposed negative prompt cancels most of that shared
component. Percentile normalisation (below) removes what is left.
"""
import numpy as np

# Must stay identical, and in the same order, as STYLE_DIMENSIONS in lib/types.ts.
STYLE_DIMENSIONS = [
    "minimalism", "streetwear", "workwear", "outdoor", "vintage",
    "formal", "colorfulness", "pattern", "relaxedFit",
]

# (positive, negative), index-aligned to STYLE_DIMENSIONS.
PROMPT_PAIRS = [
    ("a plain minimal understated garment",
     "an ornate decorative embellished garment"),
    ("a streetwear urban garment",
     "a classic conservative tailored garment"),
    ("a rugged utilitarian workwear garment with pockets",
     "a delicate refined dressy garment"),
    ("a technical outdoor hiking garment",
     "an indoor city garment"),
    ("a vintage retro garment",
     "a modern contemporary garment"),
    ("a formal elegant evening garment",
     "a casual everyday garment"),
    ("a brightly coloured vivid saturated garment",
     "a muted neutral monochrome garment"),
    ("a patterned printed graphic garment",
     "a plain solid colour garment"),
    ("a loose oversized relaxed fit garment",
     "a fitted slim tailored garment"),
]

assert len(PROMPT_PAIRS) == len(STYLE_DIMENSIONS)

N_AXES = len(STYLE_DIMENSIONS)

# 101 breakpoints = the 0th through 100th percentile, inclusive, one per integer.
N_BREAKPOINTS = 101


def prompt_texts() -> list[str]:
    """The 18 prompts flattened as [pos0, neg0, pos1, neg1, ...].

    This is the exact order `StyleEngine.embed_texts` must be called with, and
    the order `raw_scores` expects its `text_vecs` argument in.
    """
    out: list[str] = []
    for pos, neg in PROMPT_PAIRS:
        out.append(pos)
        out.append(neg)
    return out


def raw_scores(emb: np.ndarray, text_vecs: np.ndarray) -> np.ndarray:
    """raw[i, a] = emb[i] . pos[a] - emb[i] . neg[a].

    emb:       [n, d] image (or profile) embeddings, L2-normalized.
    text_vecs: [18, d] prompt embeddings in `prompt_texts()` order, L2-normalized.
    returns:   [n, 9] float32. Unbounded; feed to `percentile_rank` before use.
    """
    emb = np.atleast_2d(np.asarray(emb, dtype=np.float32))
    text_vecs = np.asarray(text_vecs, dtype=np.float32)
    if text_vecs.shape[0] != 2 * N_AXES:
        raise ValueError(f"expected {2 * N_AXES} prompt vectors, got {text_vecs.shape[0]}")

    sims = emb @ text_vecs.T                 # [n, 18]
    pos = sims[:, 0::2]                      # [n, 9]
    neg = sims[:, 1::2]                      # [n, 9]
    return (pos - neg).astype(np.float32)


def quantile_breakpoints(raw: np.ndarray) -> np.ndarray:
    """Per-axis quantile breakpoints of a reference distribution.

    raw:     [n, 9] raw scores for the whole catalog.
    returns: [9, 101] float32, sorted ascending along axis 1.
    """
    raw = np.asarray(raw, dtype=np.float32)
    qs = np.linspace(0.0, 100.0, N_BREAKPOINTS)
    # np.percentile over axis 0 gives [101, 9]; transpose to [9, 101].
    bp = np.percentile(raw, qs, axis=0).T
    return np.ascontiguousarray(bp, dtype=np.float32)


def percentile_rank(raw: np.ndarray, breakpoints: np.ndarray) -> np.ndarray:
    """Map raw scores onto [0, 1] by interpolating against stored breakpoints.

    raw:         [n, 9] raw scores.
    breakpoints: [9, 101] from `quantile_breakpoints`.
    returns:     [n, 9] float32 in [0, 1], clamped outside the breakpoint range.

    `np.interp` requires the x-array to be increasing and already clamps to the
    endpoint y-values outside the range, which gives us the clamping for free.
    """
    raw = np.atleast_2d(np.asarray(raw, dtype=np.float32))
    breakpoints = np.asarray(breakpoints, dtype=np.float32)
    if breakpoints.shape != (N_AXES, N_BREAKPOINTS):
        raise ValueError(f"expected breakpoints of shape {(N_AXES, N_BREAKPOINTS)}, "
                         f"got {breakpoints.shape}")

    ys = np.linspace(0.0, 1.0, N_BREAKPOINTS)
    out = np.empty_like(raw, dtype=np.float32)
    for a in range(N_AXES):
        out[:, a] = np.interp(raw[:, a], breakpoints[a], ys)
    return out

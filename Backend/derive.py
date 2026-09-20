"""
Deterministic derivation of the categorical Product fields the frontend needs
but `catalog.parquet` does not carry in a usable shape.

No model involved, by design. `category`, `colour_family` and `formality` are
facts about a garment that H&M's own metadata already states; asking CLIP to
re-infer them would be slower, less accurate, and non-reproducible.

The `colour_family` values mirror COLOR_TO_FAMILY in lib/types.ts. The keys
differ because H&M's `colour_group_name` is prose ("Light Beige", "Khaki green")
rather than the single tokens the frontend table uses, so this is a substring
scan rather than a dict lookup.
"""
from __future__ import annotations

# --------------------------------------------------------------------- groups

EXCLUDED_GROUPS = frozenset({
    "Garment Full body",       # dresses and jumpsuits: the outfit graph has no dress slot
    "Underwear",
    "Underwear/nightwear",
    "Nightwear",
    "Swimwear",
    "Socks & Tights",
    "Cosmetic",
    "Furniture",
    "Interior textile",
    "Stationery",
    "Items",
    "Fun",
    "Garment and Shoe care",
    "Unknown",
})

# product_group_name -> frontend category, for groups with a single mapping.
_GROUP_TO_CATEGORY = {
    "Garment Lower body": "bottom",
    "Shoes": "footwear",
    "Accessories": "accessory",
    "Bags": "accessory",
}

# Upper-body garments split three ways on product_type_name.
_KNIT_TYPES = ("sweater", "cardigan", "jumper", "pullover", "knit")
_OUTER_TYPES = ("jacket", "coat", "blazer", "parka", "anorak", "trench")


def is_recommendable(product_group_name: str | None) -> bool:
    """False for groups the outfit engine cannot place. Never drops rows --
    callers turn this into a boolean mask, because embeddings.npy is
    positionally aligned with catalog.parquet."""
    return (product_group_name or "") not in EXCLUDED_GROUPS


def derive_category(product_type_name: str | None,
                    product_group_name: str | None) -> str | None:
    """Returns a frontend Category, or None if the row is not recommendable."""
    group = product_group_name or ""
    if not is_recommendable(group):
        return None

    if group in _GROUP_TO_CATEGORY:
        return _GROUP_TO_CATEGORY[group]

    if group == "Garment Upper body":
        ptype = (product_type_name or "").lower()
        if any(k in ptype for k in _OUTER_TYPES):
            return "outerwear"
        if any(k in ptype for k in _KNIT_TYPES):
            return "knitwear"
        return "top"

    return None


# -------------------------------------------------------------- colour family

# Ordered: the first matching token wins, so put more specific tokens first
# within a family and order families so "dark red" hits bold before "dark"
# can hit anything else.
_COLOUR_TOKENS: list[tuple[str, str]] = [
    # bold
    ("purple", "bold"), ("lilac", "bold"), ("magenta", "bold"), ("pink", "bold"),
    ("red", "bold"), ("yellow", "bold"), ("turquoise", "bold"), ("lime", "bold"),
    # cool
    ("navy", "cool"), ("indigo", "cool"), ("denim", "cool"), ("cobalt", "cool"),
    ("blue", "cool"),
    # warm
    ("rust", "warm"), ("terracotta", "warm"), ("orange", "warm"),
    ("burgundy", "warm"), ("mustard", "warm"),
    # earth
    ("khaki", "earth"), ("olive", "earth"), ("forest", "earth"), ("sage", "earth"),
    ("brown", "earth"), ("chocolate", "earth"), ("camel", "earth"), ("tan", "earth"),
    ("green", "earth"),
    # neutral
    ("black", "neutral"), ("white", "neutral"), ("grey", "neutral"),
    ("gray", "neutral"), ("charcoal", "neutral"), ("ivory", "neutral"),
    ("cream", "neutral"), ("beige", "neutral"), ("silver", "neutral"),
]


def derive_colour_family(colour_group_name: str | None) -> str:
    """Substring scan over H&M's prose colour names. Unmatched -> 'neutral'."""
    name = (colour_group_name or "").lower()
    for token, family in _COLOUR_TOKENS:
        if token in name:
            return family
    return "neutral"


# ----------------------------------------------------------------- formality

# Checked high-to-low so "dress shirt" resolves to 4 before "shirt" resolves to 3.
_FORMALITY_TOKENS: list[tuple[int, tuple[str, ...]]] = [
    (5, ("suit", "tuxedo", "evening")),
    (4, ("blazer", "skirt", "coat", "heel", "dress shirt", "loafer", "oxford")),
    (3, ("shirt", "chino", "sweater", "cardigan", "boot", "trousers", "knit")),
    (2, ("t-shirt", "tee", "jeans", "sneaker", "shorts", "hoodie", "denim", "cap")),
    (1, ("sport", "athletic", "legging", "sweatpant", "track", "jogger", "gym",
         "tracksuit", "swimsuit")),
]

# Flatten and sort by length (longest first) for matching specificity
_FORMALITY_FLAT = tuple(
    sorted(
        ((len(token), level, token)
         for level, tokens in _FORMALITY_TOKENS
         for token in tokens),
        reverse=True,
    )
)


def derive_formality(product_type_name: str | None) -> int:
    """1 (athletic) to 5 (black tie). Unmatched -> 3."""
    ptype = (product_type_name or "").lower()
    for _, level, token in _FORMALITY_FLAT:
        if token in ptype:
            return level
    return 3


# ------------------------------------------------------------------- seasons

_COLD_TOKENS = (
    "wool", "padded", "fleece", "knit", "thermal", "quilted",
    "down jacket", "down-filled",
    "faux fur", "corduroy", "flannel", "cashmere",
)
_COLD_TYPE_TOKENS = ("coat", "boot", "parka", "anorak")
_WARM_TOKENS = (
    "linen", "shorts", "swim", "sleeveless", "sandal", "tank",
    "lightweight", "mesh", "crochet",
)

_ALL_SEASONS = ("spring", "summer", "fall", "winter")


def derive_seasons(detail_desc: str | None,
                   product_type_name: str | None) -> list[str]:
    """Keyword scan over description + type. Ambiguous or silent -> all four.

    Returns seasons in the canonical order used by lib/types.ts SEASONS.
    Never returns an empty list -- an item with no season is unwearable, and a
    missing description is far more likely than a genuinely seasonless garment.
    """
    text = f"{detail_desc or ''} {product_type_name or ''}".lower()
    ptype = (product_type_name or "").lower()
    cold = (
        any(t in text for t in _COLD_TOKENS)
        or any(t in ptype for t in _COLD_TYPE_TOKENS)
    )
    warm = any(t in text for t in _WARM_TOKENS)

    if cold and not warm:
        return ["fall", "winter"]
    if warm and not cold:
        return ["spring", "summer"]
    return list(_ALL_SEASONS)

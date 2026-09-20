import sys
from pathlib import Path

BACKEND_DIR = Path(__file__).parent.parent
sys.path.insert(0, str(BACKEND_DIR))

import pytest

import derive


# ------------------------------------------------------------------ category

@pytest.mark.parametrize("ptype,pgroup,expected", [
    ("T-shirt",         "Garment Upper body", "top"),
    ("Blouse",          "Garment Upper body", "top"),
    ("Vest top",        "Garment Upper body", "top"),
    ("Sweater",         "Garment Upper body", "knitwear"),
    ("Cardigan",        "Garment Upper body", "knitwear"),
    ("Jacket",          "Garment Upper body", "outerwear"),
    ("Coat",            "Garment Upper body", "outerwear"),
    ("Blazer",          "Garment Upper body", "outerwear"),
    ("Outdoor jacket",  "Garment Upper body", "outerwear"),
    ("Trousers",        "Garment Lower body", "bottom"),
    ("Jeans",           "Garment Lower body", "bottom"),
    ("Sneakers",        "Shoes",              "footwear"),
    ("Boots",           "Shoes",              "footwear"),
    ("Hat/beanie",      "Accessories",        "accessory"),
    ("Backpack",        "Bags",               "accessory"),
])
def test_derive_category_maps_known_types(ptype, pgroup, expected):
    assert derive.derive_category(ptype, pgroup) == expected


@pytest.mark.parametrize("pgroup", [
    "Garment Full body", "Underwear", "Underwear/nightwear", "Nightwear",
    "Swimwear", "Socks & Tights", "Cosmetic", "Furniture", "Interior textile",
    "Stationery", "Items", "Fun", "Garment and Shoe care", "Unknown",
])
def test_excluded_groups_derive_to_none(pgroup):
    assert derive.is_recommendable(pgroup) is False
    assert derive.derive_category("Anything", pgroup) is None


def test_bags_are_kept_as_accessories():
    assert derive.is_recommendable("Bags") is True


def test_unknown_upper_body_type_falls_back_to_top():
    assert derive.derive_category("Some Novel Shirt Thing", "Garment Upper body") == "top"


def test_unknown_group_that_is_not_excluded_derives_to_none():
    assert derive.derive_category("Widget", "Garment Not A Real Group") is None


def test_category_matching_is_case_insensitive():
    assert derive.derive_category("SWEATER", "Garment Upper body") == "knitwear"


# -------------------------------------------------------------- colour family

@pytest.mark.parametrize("colour,expected", [
    ("Black", "neutral"),
    ("White", "neutral"),
    ("Light Beige", "neutral"),
    ("Dark Brown", "earth"),
    ("Khaki green", "earth"),
    ("Orange", "warm"),
    ("Dark Red", "bold"),
    ("Navy Blue", "cool"),
    ("Pink", "bold"),
])
def test_derive_colour_family_maps_known_colours(colour, expected):
    assert derive.derive_colour_family(colour) == expected


def test_unknown_colour_falls_back_to_neutral():
    assert derive.derive_colour_family("Mauve Sparkle") == "neutral"
    assert derive.derive_colour_family("") == "neutral"
    assert derive.derive_colour_family(None) == "neutral"


# ----------------------------------------------------------------- formality

@pytest.mark.parametrize("ptype,expected", [
    ("Leggings/Tights", 1),
    ("Sweatpants", 1),
    ("T-shirt", 2),
    ("Jeans", 2),
    ("Sneakers", 2),
    ("Hoodie", 2),
    ("Shirt", 3),
    ("Chinos", 3),
    ("Sweater", 3),
    ("Boots", 3),
    ("Blazer", 4),
    ("Coat", 4),
    ("Heeled sandals", 4),
    ("Suit", 5),
])
def test_derive_formality_maps_known_types(ptype, expected):
    assert derive.derive_formality(ptype) == expected


def test_tracksuit_is_formality_one():
    assert derive.derive_formality("Tracksuit bottoms") == 1


def test_swimsuit_is_formality_one():
    assert derive.derive_formality("Swimsuit") == 1


def test_unknown_type_defaults_to_three():
    assert derive.derive_formality("Widget") == 3
    assert derive.derive_formality("") == 3


def test_formality_is_always_in_range():
    for ptype in ["Suit", "Widget", "", "Sweatpants", "Tuxedo jacket"]:
        assert 1 <= derive.derive_formality(ptype) <= 5


# ------------------------------------------------------------------- seasons

def test_cold_keywords_give_fall_and_winter():
    assert derive.derive_seasons("Padded wool coat with a quilted lining", "Coat") == ["fall", "winter"]


def test_warm_keywords_give_spring_and_summer():
    assert derive.derive_seasons("Lightweight linen shirt", "Shirt") == ["spring", "summer"]


def test_both_matched_gives_all_four():
    seasons = derive.derive_seasons("Linen blend with a wool trim", "Shirt")
    assert seasons == ["spring", "summer", "fall", "winter"]


def test_neither_matched_gives_all_four():
    assert derive.derive_seasons("A garment.", "Widget") == ["spring", "summer", "fall", "winter"]


def test_product_type_contributes_keywords():
    # "boot" is a cold keyword and appears only in the type, not the description.
    assert derive.derive_seasons("Ankle height.", "Boots") == ["fall", "winter"]


def test_seasons_handles_missing_description():
    assert derive.derive_seasons(None, "Coat") == ["fall", "winter"]
    assert derive.derive_seasons(None, None) == ["spring", "summer", "fall", "winter"]


@pytest.mark.parametrize("ptype", ["Coat", "Boots", "Parka", "Outdoor anorak"])
def test_every_cold_type_token_is_cold_on_its_own(ptype):
    # Each _COLD_TYPE_TOKENS entry must carry the cold signal from the type
    # alone, with no help from the description. Without this, the type-only
    # scan added to stop "coated"/"bootcut" firing in free text could silently
    # lose a token and nothing would notice.
    assert derive.derive_seasons("A garment.", ptype) == ["fall", "winter"]


def test_coated_description_does_not_trigger_cold():
    # "coated" in desc should not be mistaken for the garment type "coat"
    assert derive.derive_seasons("Water-resistant coated shell.", "Jacket") == [
        "spring", "summer", "fall", "winter"
    ]


def test_bootcut_description_does_not_trigger_cold():
    # "bootcut" in desc should not be mistaken for the garment type "boot"
    assert derive.derive_seasons("Bootcut leg.", "Jeans") == [
        "spring", "summer", "fall", "winter"
    ]


def test_button_down_description_does_not_trigger_cold():
    # "down" in "button-down" must not trigger the down-jacket cold signal
    assert derive.derive_seasons("Shirt with a button-down collar.", "Shirt") == [
        "spring", "summer", "fall", "winter"
    ]

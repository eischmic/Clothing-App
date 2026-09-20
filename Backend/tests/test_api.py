"""
End-to-end test of the /profiles contract against the REAL catalog
(index/catalog.parquet + embeddings.npy), with only the torch-dependent
FashionCLIP calls (embed_images / embed_texts) stubbed out -- so this runs
without installing torch/transformers or downloading the model.

Requires: fastapi, python-multipart, pyarrow (see requirements-api.txt).
Run with: python3 -m pytest tests/test_api.py -v
"""
import importlib
import io
import sys
from pathlib import Path

import numpy as np
import pytest
from fastapi.testclient import TestClient
from PIL import Image

BACKEND_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BACKEND_DIR))

EMB_DIM = 512


def _fake_image_bytes() -> bytes:
    buf = io.BytesIO()
    Image.new("RGB", (32, 32), color=(120, 60, 200)).save(buf, format="JPEG")
    return buf.getvalue()


def _create_profile(client, name: str = "Test", n: int = 3) -> str:
    r = client.post(
        "/profiles",
        data={"name": name},
        files=[("files", (f"p{i}.jpg", _fake_image_bytes(), "image/jpeg")) for i in range(n)],
    )
    assert r.status_code == 200, r.text
    return r.json()["profile_id"]


@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setenv("INDEX_DIR", str(BACKEND_DIR / "index"))
    monkeypatch.setenv("THUMBS_DIR", str(BACKEND_DIR / "thumbs"))
    monkeypatch.setenv("DB_PATH", str(tmp_path / "test.db"))
    monkeypatch.setenv("REFS_DIR", str(tmp_path / "refs"))

    import engine
    # Skip the real FashionCLIP model (torch/transformers not installed here);
    # everything downstream of an embedding (build_profile, feedback_update,
    # recommend) is pure numpy and runs against the real catalog untouched.
    monkeypatch.setattr(engine.StyleEngine, "_load_model", lambda self: None)
    monkeypatch.setattr(
        engine.StyleEngine,
        "embed_images",
        lambda self, images: engine._normalize(
            np.random.default_rng(0).normal(size=(len(images), EMB_DIM)).astype(np.float32)
        ),
    )
    monkeypatch.setattr(
        engine.StyleEngine,
        "embed_texts",
        lambda self, texts: engine._normalize(
            np.random.default_rng(1).normal(size=(len(list(texts)), EMB_DIM)).astype(np.float32)
        ),
    )

    import api
    importlib.reload(api)  # re-run module-level setup (DB, mounts) under patched env
    with TestClient(api.app) as c:
        yield c


def test_create_profile_returns_id_and_n_refs(client):
    r = client.post(
        "/profiles",
        data={"name": "Jules"},
        files=[("files", (f"ref{i}.jpg", _fake_image_bytes(), "image/jpeg")) for i in range(6)],
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["name"] == "Jules"
    assert body["n_refs"] == 6
    assert body["profile_id"]


def test_create_profile_rejects_too_few_or_too_many_photos(client):
    for n in (1, 2, 16, 20):
        files = [("files", (f"r{i}.jpg", _fake_image_bytes(), "image/jpeg")) for i in range(n)]
        resp = client.post("/profiles", data={"name": "X"}, files=files)
        assert resp.status_code == 400, f"n={n} should be rejected"


def test_create_profile_rejects_unreadable_file(client):
    files = [("files", ("bad.jpg", b"not an image", "image/jpeg"))] * 5
    resp = client.post("/profiles", data={"name": "X"}, files=files)
    assert resp.status_code == 400


def test_list_profiles_shows_new_profile(client):
    profile_id = _create_profile(client)
    resp = client.get("/profiles")
    assert resp.status_code == 200
    ids = [p["profile_id"] for p in resp.json()]
    assert profile_id in ids


def test_unknown_profile_is_404(client):
    for path in ("/profiles/doesnotexist", "/profiles/doesnotexist/next", "/profiles/doesnotexist/wardrobe"):
        assert client.get(path).status_code == 404
    assert client.post("/profiles/doesnotexist/swipe", json={"article_id": "x", "liked": True}).status_code == 404


def test_full_slice_profile_swipe_wardrobe(client):
    profile_id = _create_profile(client)

    detail = client.get(f"/profiles/{profile_id}").json()
    assert detail["n_refs"] == 3
    assert detail["n_swipes"] == 0
    assert detail["n_liked"] == 0
    assert isinstance(detail["style_breakdown"], dict) and detail["style_breakdown"]

    next_resp = client.get(f"/profiles/{profile_id}/next", params={"n": 10})
    assert next_resp.status_code == 200
    items = next_resp.json()["items"]
    assert 1 <= len(items) <= 10
    first = items[0]
    for key in ("article_id", "image_url", "buy_url"):
        assert first[key]

    swiped_ids = []
    for item in items[:3]:
        r = client.post(f"/profiles/{profile_id}/swipe", json={"article_id": item["article_id"], "liked": True})
        assert r.status_code == 200
        swiped_ids.append(item["article_id"])
    assert r.json()["n_swipes"] == 3

    # swiped items never come back
    next_again = client.get(f"/profiles/{profile_id}/next", params={"n": 50}).json()["items"]
    assert not (set(i["article_id"] for i in next_again) & set(swiped_ids))

    ward = client.get(f"/profiles/{profile_id}/wardrobe").json()
    assert {i["article_id"] for i in ward["liked"]} == set(swiped_ids)
    assert len(ward["references"]) == 3
    for ref in ward["references"]:
        img_resp = client.get(ref["image_url"].replace("http://testserver/", "/"))
        assert img_resp.status_code == 200


def test_two_profiles_are_independent(client):
    p1 = _create_profile(client, name="A")
    p2 = _create_profile(client, name="B")

    items = client.get(f"/profiles/{p1}/next", params={"n": 5}).json()["items"]
    client.post(f"/profiles/{p1}/swipe", json={"article_id": items[0]["article_id"], "liked": True})

    assert client.get(f"/profiles/{p1}").json()["n_swipes"] == 1
    assert client.get(f"/profiles/{p2}").json()["n_swipes"] == 0
    assert client.get(f"/profiles/{p2}/wardrobe").json()["liked"] == []


def test_restart_does_not_lose_profile(client, tmp_path, monkeypatch):
    profile_id = _create_profile(client)
    client.post(f"/profiles/{profile_id}/swipe", json={"article_id": "0721911002", "liked": True})

    import api
    importlib.reload(api)  # simulate a fresh process against the same DB_PATH/REFS_DIR
    with TestClient(api.app) as fresh_client:
        detail = fresh_client.get(f"/profiles/{profile_id}").json()
        assert detail["n_swipes"] == 1
        assert detail["n_liked"] == 1


# ---- new tests from task-7-brief ----

def test_profile_items_carry_product_fields(client):
    profile_id = _create_profile(client)
    r = client.get(f"/profiles/{profile_id}/next", params={"n": 5})
    assert r.status_code == 200
    items = r.json()["items"]
    assert len(items) == 5
    for item in items:
        assert item["category"] in {
            "top", "bottom", "outerwear", "footwear", "knitwear", "accessory"
        }
        assert item["colour_family"] in {"neutral", "warm", "cool", "earth", "bold"}
        assert 1 <= item["formality"] <= 5
        assert item["seasons"] and set(item["seasons"]) <= {
            "spring", "summer", "fall", "winter"
        }
        assert len(item["vector"]) == 9
        assert all(0.0 <= v <= 1.0 for v in item["vector"])


def test_profile_detail_carries_a_nine_dim_vector(client):
    profile_id = _create_profile(client)
    r = client.get(f"/profiles/{profile_id}")
    assert r.status_code == 200
    vector = r.json()["vector"]
    assert len(vector) == 9
    assert all(0.0 <= v <= 1.0 for v in vector)
    # An all-zeros vector would satisfy the range check above while meaning the
    # projection never ran. Percentile ranks against a real catalog cannot all
    # collapse to the floor.
    assert any(v > 0.0 for v in vector)


def test_create_profile_returns_reference_urls(client):
    r = client.post(
        "/profiles",
        data={"name": "Ref test"},
        files=[("files", (f"p{i}.jpg", _fake_image_bytes(), "image/jpeg")) for i in range(3)],
    )
    assert r.status_code == 200
    body = r.json()
    assert body["n_refs"] == 3
    assert len(body["references"]) == 3
    for ref in body["references"]:
        assert ref["ref_id"]
        assert ref["image_url"].startswith("http")
        assert "/references/" in ref["image_url"]


def test_three_photos_is_accepted(client):
    r = client.post(
        "/profiles",
        data={"name": "Three"},
        files=[("files", (f"p{i}.jpg", _fake_image_bytes(), "image/jpeg")) for i in range(3)],
    )
    assert r.status_code == 200


def test_two_photos_is_rejected(client):
    r = client.post(
        "/profiles",
        data={"name": "Two"},
        files=[("files", (f"p{i}.jpg", _fake_image_bytes(), "image/jpeg")) for i in range(2)],
    )
    assert r.status_code == 400


def test_catalog_item_lookup_returns_a_profile_item(client):
    profile_id = _create_profile(client)
    first = client.get(f"/profiles/{profile_id}/next", params={"n": 1}).json()["items"][0]

    r = client.get(f"/catalog/{first['article_id']}")
    assert r.status_code == 200
    assert r.json()["article_id"] == first["article_id"]
    assert r.json()["category"] == first["category"]
    assert r.json()["vector"] == first["vector"]


def test_catalog_item_lookup_404s_on_unknown_id(client):
    assert client.get("/catalog/0000000000").status_code == 404


def test_catalog_item_lookup_404s_on_a_non_recommendable_article(client):
    # Dresses, underwear, swimwear and homeware are excluded because the outfit
    # graph has no slot for them. Their ids ARE in the catalog, so the lookup
    # finds a row -- but that row has no category, and serving it used to
    # relabel it "top", handing the client a Dress to wear in its top slot.
    eng = client.app.state.engine
    excluded = eng.catalog.loc[~eng.catalog["recommendable"], "article_id"].iloc[0]
    assert client.get(f"/catalog/{excluded}").status_code == 404


def test_swipe_rejects_an_article_that_can_never_be_rendered(client):
    # A swipe the wardrobe could not serve back must not be storable in the
    # first place: /wardrobe would have to either 500 on the row or quietly
    # drop a garment the user said they liked.
    profile_id = _create_profile(client)
    eng = client.app.state.engine
    excluded = eng.catalog.loc[~eng.catalog["recommendable"], "article_id"].iloc[0]

    for bad in (excluded, "0000000000"):
        r = client.post(f"/profiles/{profile_id}/swipe",
                        json={"article_id": bad, "liked": True})
        assert r.status_code == 404, bad

    assert client.get(f"/profiles/{profile_id}").json()["n_swipes"] == 0


def test_sessions_endpoints_are_gone(client):
    assert client.post("/sessions/from-photos").status_code == 404
    assert client.get("/sessions/abc").status_code == 404
    assert client.get("/sessions/abc/recommendations").status_code == 404
    assert client.post("/sessions/abc/feedback", json={}).status_code == 404


def test_health_reports_profiles_not_sessions(client):
    body = client.get("/health").json()
    assert "sessions" not in body
    assert "profiles" in body

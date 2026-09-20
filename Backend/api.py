"""
FastAPI wrapper around StyleEngine.

Run (from the folder containing engine.py, api.py, index/ and thumbs/):
    pip install -r requirements-api.txt
    uvicorn api:app --port 8000          # add --host 0.0.0.0 so teammates on your wifi can reach it
Interactive docs / test UI:  http://localhost:8000/docs
(Avoid --reload: every reload would re-load the model.)

Config via environment variables:
    INDEX_DIR          default "index"    (embeddings.npy + catalog.parquet)
    THUMBS_DIR         default "thumbs"   (unzipped thumbnails; served at /thumbs/...)
    STYLE_TEMPERATURE  default 40         (lower = flatter style breakdown, higher = peakier)

Flow:
    1. POST /profiles                       (name + 3..15 photos)
       -> persisted profile_id + reference image URLs
    2. GET  /profiles/{id}/next             -> ranked items, swiped ones excluded
    3. POST /profiles/{id}/swipe            -> the profile vector moves
       -> call step 2 again for a fresh batch
"""
import os
import threading
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Dict, List, Optional

import numpy as np
import pandas as pd
from fastapi import FastAPI, File, Form, HTTPException, Query, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from PIL import Image, ImageOps
from pydantic import BaseModel

import axes
from db import Database
from engine import StyleEngine

INDEX_DIR = os.environ.get("INDEX_DIR", "index")
THUMBS_DIR = Path(os.environ.get("THUMBS_DIR", "thumbs"))
STYLE_TEMPERATURE = float(os.environ.get("STYLE_TEMPERATURE", "40"))

DB_PATH = os.environ.get("DB_PATH", "data/fitlab.db")
REFS_DIR = os.environ.get("REFS_DIR", "data/references")
# 3, not 5: app/onboarding/index.tsx asks for 3-8 photos, and a user following
# the UI's own instructions was getting a 400.
MIN_PROFILE_PHOTOS = 3
MAX_PROFILE_PHOTOS = 15


# ----------------------------------------------------------------- schemas
class ReferencePhotoOut(BaseModel):
    ref_id: str
    image_url: str


class ProfileItem(BaseModel):
    article_id: str
    name: Optional[str] = None
    product_type: Optional[str] = None
    colour: Optional[str] = None
    description: Optional[str] = None
    image_url: str
    buy_url: str
    category: str
    colour_family: str
    formality: int
    seasons: List[str]
    vector: List[float]


class ProfileOut(BaseModel):
    profile_id: str
    name: str
    n_refs: int
    references: List[ReferencePhotoOut] = []


class ProfileSummary(BaseModel):
    profile_id: str
    name: str
    n_swipes: int


class ProfileDetail(BaseModel):
    profile_id: str
    name: str
    n_refs: int
    n_swipes: int
    n_liked: int
    style_breakdown: Dict[str, float]
    vector: List[float]


class NextOut(BaseModel):
    items: List[ProfileItem]


class SwipeIn(BaseModel):
    article_id: str
    liked: bool


class SwipeOut(BaseModel):
    n_swipes: int


class WardrobeOut(BaseModel):
    liked: List[ProfileItem]
    references: List[ReferencePhotoOut]


# ------------------------------------------------------------------- state
# One model, one CPU: don't run several inferences at once.
MODEL_LOCK = threading.Lock()


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Load the model + index ONCE at startup, not per request.
    if getattr(app.state, "engine", None) is None:
        print("loading StyleEngine (first run downloads the model) ...", flush=True)
        app.state.engine = StyleEngine(INDEX_DIR)
        print(f"ready: {len(app.state.engine.catalog):,} catalog items", flush=True)
    yield


app = FastAPI(title="Style matcher API", lifespan=lifespan)
# Wide-open CORS is fine for a hackathon demo; lock it down for anything real.
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

if THUMBS_DIR.is_dir():
    app.mount("/thumbs", StaticFiles(directory=THUMBS_DIR), name="thumbs")
else:
    print(f"warning: {THUMBS_DIR} not found, so image_url links will 404", flush=True)

# Persistent profiles/reference-photos/swipes. DB.init() creates data/ on first run.
DB = Database(db_path=DB_PATH, refs_dir=REFS_DIR)
DB.init()
app.mount("/references", StaticFiles(directory=DB.refs_dir), name="references")


# ----------------------------------------------------------------- helpers
def _engine(request: Request) -> StyleEngine:
    return request.app.state.engine


def _breakdown(eng: StyleEngine, profile: np.ndarray) -> Dict[str, float]:
    with MODEL_LOCK:
        return eng.style_breakdown(profile, temperature=STYLE_TEMPERATURE)


def _clean(v):
    return None if pd.isna(v) else v


def _buy_url(article_id: str) -> str:
    """Placeholder retailer link. article_ids are H&M's own product codes, so
    this happens to resolve to a real product page; treat it as a placeholder
    regardless, per the vertical-slice plan."""
    return f"https://www2.hm.com/en_us/productpage.{article_id}.html"


def _to_profile_item(row, base_url: str) -> ProfileItem:
    seasons = str(row.get("seasons") or "")
    return ProfileItem(
        article_id=row["article_id"],
        name=_clean(row.get("prod_name")),
        product_type=_clean(row.get("product_type_name")),
        colour=_clean(row.get("colour_group_name")),
        description=_clean(row.get("detail_desc")),
        image_url=f"{base_url}thumbs/{row['image_rel']}",
        buy_url=_buy_url(row["article_id"]),
        category=str(row.get("category") or "top"),
        colour_family=str(row.get("colour_family") or "neutral"),
        formality=int(row.get("formality") or 3),
        seasons=[s for s in seasons.split(",") if s],
        vector=[float(row[dim]) for dim in axes.STYLE_DIMENSIONS],
    )


def _get_db_profile(profile_id: str):
    row = DB.get_profile(profile_id)
    if row is None:
        raise HTTPException(status_code=404, detail="Unknown profile_id")
    return row


def _compute_profile_vector(eng: StyleEngine, profile_id: str) -> np.ndarray:
    """Rebuilds the profile vector from reference photos + full swipe history
    on every call, rather than caching it -- cheap at this scale and keeps
    the logic simple (no cached state to invalidate)."""
    refs = DB.get_reference_embeddings(profile_id)
    profile = eng.build_profile(refs, k=1)
    for swipe in DB.list_swipes(profile_id):
        liked = bool(swipe["liked"])
        profile = eng.feedback_update(
            profile,
            liked_ids=[swipe["article_id"]] if liked else [],
            disliked_ids=[] if liked else [swipe["article_id"]],
        )
    return profile


# --------------------------------------------------------------- endpoints
# These are plain `def` (not `async def`) on purpose: FastAPI runs them in a
# worker thread, so slow model inference doesn't block the whole server.
@app.get("/health")
def health(request: Request):
    return {
        "status": "ok",
        "catalog_size": len(_engine(request).catalog),
        "profiles": len(DB.list_profiles()),
    }


@app.get("/catalog/groups")
def catalog_groups(request: Request):
    """Product groups + counts, e.g. to build filter chips in the UI."""
    counts = _engine(request).catalog["product_group_name"].value_counts()
    return {str(k): int(v) for k, v in counts.items()}


@app.get("/catalog/{article_id}", response_model=ProfileItem)
def catalog_item(article_id: str, request: Request):
    """Single-item lookup. The client's product-detail screen and its persisted
    closet both hold article_ids that will not be in the current /next slice."""
    eng = _engine(request)
    r = eng.id_to_row.get(article_id)
    if r is None:
        raise HTTPException(status_code=404, detail="Unknown article_id")
    return _to_profile_item(eng.catalog.iloc[r], str(request.base_url))


# ----------------------------------------------------- /profiles endpoints
@app.post("/profiles", response_model=ProfileOut)
def create_profile(
    request: Request,
    name: str = Form(...),
    files: List[UploadFile] = File(...),
):
    if not (MIN_PROFILE_PHOTOS <= len(files) <= MAX_PROFILE_PHOTOS):
        raise HTTPException(
            status_code=400,
            detail=f"Send between {MIN_PROFILE_PHOTOS} and {MAX_PROFILE_PHOTOS} photos",
        )

    images = []
    for f in files:
        try:
            img = Image.open(f.file)
            img = ImageOps.exif_transpose(img) or img      # phone photos: fix rotation
            img = img.convert("RGB")
            img.thumbnail((1024, 1024))
            images.append(img)
        except Exception:
            raise HTTPException(status_code=400, detail=f"Could not read '{f.filename}' as an image")

    eng = _engine(request)
    with MODEL_LOCK:
        vecs = eng.embed_images(images)

    profile_id, _ = DB.create_profile(name)
    references = []
    base = str(request.base_url)
    for img, vec in zip(images, vecs):
        ref_id, rel_path = DB.add_reference_photo(profile_id, vec)
        dest = DB.refs_dir / rel_path
        dest.parent.mkdir(parents=True, exist_ok=True)
        img.save(dest, format="JPEG", quality=85)
        references.append(
            ReferencePhotoOut(ref_id=ref_id, image_url=f"{base}references/{rel_path}")
        )

    return ProfileOut(
        profile_id=profile_id,
        name=name,
        n_refs=len(images),
        references=references,
    )


@app.get("/profiles", response_model=List[ProfileSummary])
def list_profiles():
    return [
        ProfileSummary(profile_id=r["profile_id"], name=r["name"], n_swipes=r["n_swipes"])
        for r in DB.list_profiles()
    ]


@app.get("/profiles/{profile_id}", response_model=ProfileDetail)
def get_profile(profile_id: str, request: Request):
    row = _get_db_profile(profile_id)
    eng = _engine(request)
    profile_vec = _compute_profile_vector(eng, profile_id)
    return ProfileDetail(
        profile_id=profile_id,
        name=row["name"],
        n_refs=DB.count_reference_photos(profile_id),
        n_swipes=DB.count_swipes(profile_id),
        n_liked=DB.count_liked(profile_id),
        style_breakdown=_breakdown(eng, profile_vec),
        vector=eng.project_profile(profile_vec),
    )


@app.get("/profiles/{profile_id}/next", response_model=NextOut)
def next_items(
    profile_id: str,
    request: Request,
    n: int = Query(10, ge=1, le=100),
):
    _get_db_profile(profile_id)
    eng = _engine(request)
    profile_vec = _compute_profile_vector(eng, profile_id)
    exclude = DB.get_swiped_article_ids(profile_id)
    recs = eng.recommend(profile_vec, n=n, exclude_ids=exclude)
    base = str(request.base_url)
    return NextOut(items=[_to_profile_item(row, base) for _, row in recs.iterrows()])


@app.post("/profiles/{profile_id}/swipe", response_model=SwipeOut)
def swipe(profile_id: str, body: SwipeIn):
    _get_db_profile(profile_id)
    DB.add_swipe(profile_id, body.article_id, body.liked)
    return SwipeOut(n_swipes=DB.count_swipes(profile_id))


@app.get("/profiles/{profile_id}/wardrobe", response_model=WardrobeOut)
def wardrobe(profile_id: str, request: Request):
    _get_db_profile(profile_id)
    eng = _engine(request)
    base = str(request.base_url)

    liked_items = []
    for article_id in DB.get_liked_article_ids(profile_id):
        r = eng.id_to_row.get(article_id)
        if r is not None:
            liked_items.append(_to_profile_item(eng.catalog.iloc[r], base))

    references = [
        ReferencePhotoOut(ref_id=r["ref_id"], image_url=f"{base}references/{r['image_path']}")
        for r in DB.list_reference_photos(profile_id)
    ]
    return WardrobeOut(liked=liked_items, references=references)

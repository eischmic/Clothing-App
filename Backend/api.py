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
    1. POST /sessions/from-photos   (or /sessions/from-articles for demo personas)
       -> builds a style profile, returns a session_id + style breakdown
    2. GET  /sessions/{id}/recommendations
    3. POST /sessions/{id}/feedback  (liked / disliked article_ids) -> profile is updated
       -> call step 2 again for a fresh batch
"""
import os
import threading
import uuid
from contextlib import asynccontextmanager
from dataclasses import dataclass, field
from pathlib import Path
from typing import Dict, List, Optional, Set

import numpy as np
import pandas as pd
from fastapi import FastAPI, File, Form, HTTPException, Query, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from PIL import Image, ImageOps
from pydantic import BaseModel

from db import Database
from engine import StyleEngine

INDEX_DIR = os.environ.get("INDEX_DIR", "index")
THUMBS_DIR = Path(os.environ.get("THUMBS_DIR", "thumbs"))
STYLE_TEMPERATURE = float(os.environ.get("STYLE_TEMPERATURE", "40"))
MAX_PHOTOS = 12

DB_PATH = os.environ.get("DB_PATH", "data/fitlab.db")
REFS_DIR = os.environ.get("REFS_DIR", "data/references")
MIN_PROFILE_PHOTOS = 5
MAX_PROFILE_PHOTOS = 15


# ----------------------------------------------------------------- schemas
class Item(BaseModel):
    article_id: str
    name: Optional[str] = None
    product_type: Optional[str] = None
    product_group: Optional[str] = None
    colour: Optional[str] = None
    description: Optional[str] = None
    image_url: str
    score: float


class SessionOut(BaseModel):
    session_id: str
    n_prototypes: int
    style_breakdown: Dict[str, float]


class RecsOut(BaseModel):
    session_id: str
    items: List[Item]


class ArticlesIn(BaseModel):
    article_ids: List[str]
    k: int = 1


class FeedbackIn(BaseModel):
    liked_ids: List[str] = []
    disliked_ids: List[str] = []


class FeedbackOut(BaseModel):
    applied: int
    style_breakdown: Dict[str, float]


# --- /profiles contract (persistent, SQLite-backed) -------------------------
class ProfileItem(BaseModel):
    article_id: str
    name: Optional[str] = None
    product_type: Optional[str] = None
    colour: Optional[str] = None
    description: Optional[str] = None
    image_url: str
    buy_url: str


class ProfileOut(BaseModel):
    profile_id: str
    name: str
    n_refs: int


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


class NextOut(BaseModel):
    items: List[ProfileItem]


class SwipeIn(BaseModel):
    article_id: str
    liked: bool


class SwipeOut(BaseModel):
    n_swipes: int


class ReferencePhotoOut(BaseModel):
    ref_id: str
    image_url: str


class WardrobeOut(BaseModel):
    liked: List[ProfileItem]
    references: List[ReferencePhotoOut]


# ------------------------------------------------------------------- state
@dataclass
class Session:
    profile: np.ndarray                                   # [k, d] style prototypes
    exclude: Set[str] = field(default_factory=set)        # never recommend these again


# In-memory only: fine for a demo, wiped whenever the server restarts.
SESSIONS: Dict[str, Session] = {}

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


def _get_session(session_id: str) -> Session:
    s = SESSIONS.get(session_id)
    if s is None:
        raise HTTPException(status_code=404, detail="Unknown session_id (did the server restart?)")
    return s


def _breakdown(eng: StyleEngine, profile: np.ndarray) -> Dict[str, float]:
    with MODEL_LOCK:
        return eng.style_breakdown(profile, temperature=STYLE_TEMPERATURE)


def _new_session(eng: StyleEngine, profile: np.ndarray, exclude=()) -> SessionOut:
    sid = uuid.uuid4().hex[:12]
    SESSIONS[sid] = Session(profile=profile, exclude=set(exclude))
    return SessionOut(
        session_id=sid,
        n_prototypes=len(profile),
        style_breakdown=_breakdown(eng, profile),
    )


def _clean(v):
    return None if pd.isna(v) else v


def _to_item(row, base_url: str) -> Item:
    return Item(
        article_id=row["article_id"],
        name=_clean(row.get("prod_name")),
        product_type=_clean(row.get("product_type_name")),
        product_group=_clean(row.get("product_group_name")),
        colour=_clean(row.get("colour_group_name")),
        description=_clean(row.get("detail_desc")),
        image_url=f"{base_url}thumbs/{row['image_rel']}",
        score=float(row["score"]),
    )


def _buy_url(article_id: str) -> str:
    """Placeholder retailer link. article_ids are H&M's own product codes, so
    this happens to resolve to a real product page; treat it as a placeholder
    regardless, per the vertical-slice plan."""
    return f"https://www2.hm.com/en_us/productpage.{article_id}.html"


def _to_profile_item(row, base_url: str) -> ProfileItem:
    return ProfileItem(
        article_id=row["article_id"],
        name=_clean(row.get("prod_name")),
        product_type=_clean(row.get("product_type_name")),
        colour=_clean(row.get("colour_group_name")),
        description=_clean(row.get("detail_desc")),
        image_url=f"{base_url}thumbs/{row['image_rel']}",
        buy_url=_buy_url(row["article_id"]),
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
        "sessions": len(SESSIONS),
    }


@app.get("/catalog/groups")
def catalog_groups(request: Request):
    """Product groups + counts, e.g. to build filter chips in the UI."""
    counts = _engine(request).catalog["product_group_name"].value_counts()
    return {str(k): int(v) for k, v in counts.items()}


@app.post("/sessions/from-photos", response_model=SessionOut)
def session_from_photos(
    request: Request,
    files: List[UploadFile] = File(...),
    k: int = Form(1, ge=1, le=4),
):
    """Multipart upload of 1..12 outfit/clothing photos -> style profile."""
    if not files or len(files) > MAX_PHOTOS:
        raise HTTPException(status_code=400, detail=f"Send between 1 and {MAX_PHOTOS} photos")

    images = []
    for f in files:
        try:
            img = Image.open(f.file)
            img = ImageOps.exif_transpose(img) or img      # phone photos: fix rotation
            img = img.convert("RGB")
            img.thumbnail((1024, 1024))                    # don't burn CPU on 12MP images
            images.append(img)
        except Exception:
            raise HTTPException(status_code=400, detail=f"Could not read '{f.filename}' as an image")

    eng = _engine(request)
    with MODEL_LOCK:
        vecs = eng.embed_images(images)
    profile = eng.build_profile(vecs, k=k)
    return _new_session(eng, profile)


@app.post("/sessions/from-articles", response_model=SessionOut)
def session_from_articles(body: ArticlesIn, request: Request):
    """Profile from catalog items (e.g. a demo persona's past purchases).
    The given items are also excluded from that session's recommendations."""
    eng = _engine(request)
    known = [a for a in body.article_ids if a in eng.id_to_row]
    if not known:
        raise HTTPException(
            status_code=400,
            detail="None of these article_ids are in the catalog subset "
                   "(ids are 10-character strings, e.g. '0108775015')",
        )
    profile = eng.build_profile(eng.vectors_for_articles(known), k=body.k)
    return _new_session(eng, profile, exclude=known)


@app.get("/sessions/{session_id}", response_model=SessionOut)
def get_session(session_id: str, request: Request):
    s = _get_session(session_id)
    return SessionOut(
        session_id=session_id,
        n_prototypes=len(s.profile),
        style_breakdown=_breakdown(_engine(request), s.profile),
    )


@app.get("/sessions/{session_id}/recommendations", response_model=RecsOut)
def recommendations(
    session_id: str,
    request: Request,
    n: int = Query(20, ge=1, le=100),
    groups: Optional[List[str]] = Query(None, description="restrict to product_group_name values"),
    diversity: float = Query(0.3, ge=0.0, le=1.0, description="0 = most similar, 1 = most varied"),
):
    s = _get_session(session_id)
    eng = _engine(request)
    recs = eng.recommend(
        s.profile, n=n, exclude_ids=s.exclude, groups=groups, lambda_=1.0 - diversity
    )
    base = str(request.base_url)
    return RecsOut(
        session_id=session_id,
        items=[_to_item(row, base) for _, row in recs.iterrows()],
    )


@app.post("/sessions/{session_id}/feedback", response_model=FeedbackOut)
def feedback(session_id: str, body: FeedbackIn, request: Request):
    """Like/dislike -> nudges the profile. Judged items are never shown again."""
    s = _get_session(session_id)
    eng = _engine(request)
    liked = [a for a in body.liked_ids if a in eng.id_to_row]
    disliked = [a for a in body.disliked_ids if a in eng.id_to_row]

    s.profile = eng.feedback_update(s.profile, liked_ids=liked, disliked_ids=disliked)
    s.exclude.update(liked)
    s.exclude.update(disliked)
    return FeedbackOut(
        applied=len(liked) + len(disliked),
        style_breakdown=_breakdown(eng, s.profile),
    )


# ----------------------------------------------------- /profiles endpoints
# Persistent counterpart to /sessions, backed by SQLite (see db.py). Kept
# alongside /sessions until the frontend switches over to this contract.
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
    for img, vec in zip(images, vecs):
        _ref_id, rel_path = DB.add_reference_photo(profile_id, vec)
        dest = DB.refs_dir / rel_path
        dest.parent.mkdir(parents=True, exist_ok=True)
        img.save(dest, format="JPEG", quality=85)

    return ProfileOut(profile_id=profile_id, name=name, n_refs=len(images))


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

"""
SQLite persistence for profiles, reference photos, and swipes.

Reference photo files live on disk under REFS_DIR; their FashionCLIP
embeddings are stored alongside them in the DB as raw float32 blobs. The
profile vector is never stored — engine.StyleEngine.build_profile() recomputes
it from the reference embeddings + swipe history on every request, so there
is no cached state to keep in sync.

    from db import Database
    db = Database("data/fitlab.db", refs_dir="data/references")
    db.init()

    profile_id, created_at = db.create_profile("Jules")
    db.add_reference_photo(profile_id, ref_id, image_path, embedding)
    db.add_swipe(profile_id, article_id="0108775015", liked=True)
"""
import sqlite3
import uuid
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Iterator, Optional

import numpy as np

DEFAULT_DB_PATH = "data/fitlab.db"
DEFAULT_REFS_DIR = "data/references"

SCHEMA = """
CREATE TABLE IF NOT EXISTS profiles (
    profile_id  TEXT PRIMARY KEY,
    name        TEXT NOT NULL,
    created_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS reference_photos (
    ref_id      TEXT PRIMARY KEY,
    profile_id  TEXT NOT NULL REFERENCES profiles(profile_id),
    image_path  TEXT NOT NULL,
    embedding   BLOB NOT NULL,
    created_at  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_reference_photos_profile
    ON reference_photos(profile_id);

CREATE TABLE IF NOT EXISTS swipes (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    profile_id  TEXT NOT NULL REFERENCES profiles(profile_id),
    article_id  TEXT NOT NULL,
    liked       INTEGER NOT NULL CHECK (liked IN (0, 1)),
    created_at  TEXT NOT NULL,
    UNIQUE(profile_id, article_id)
);
CREATE INDEX IF NOT EXISTS idx_swipes_profile ON swipes(profile_id);
"""


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


class Database:
    """Thin sqlite3 wrapper. Opens a short-lived connection per call rather
    than sharing one across threads, since FastAPI runs sync endpoints in a
    thread pool and sqlite3 connections aren't safe to share across threads."""

    def __init__(self, db_path: str = DEFAULT_DB_PATH, refs_dir: str = DEFAULT_REFS_DIR):
        self.db_path = Path(db_path)
        self.refs_dir = Path(refs_dir)

    def init(self) -> None:
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        self.refs_dir.mkdir(parents=True, exist_ok=True)
        with self._connect() as conn:
            conn.executescript(SCHEMA)

    @contextmanager
    def _connect(self) -> Iterator[sqlite3.Connection]:
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA foreign_keys = ON")
        try:
            yield conn
            conn.commit()
        finally:
            conn.close()

    # ------------------------------------------------------------ profiles
    def create_profile(self, name: str) -> tuple[str, str]:
        profile_id = uuid.uuid4().hex[:12]
        created_at = _now()
        with self._connect() as conn:
            conn.execute(
                "INSERT INTO profiles (profile_id, name, created_at) VALUES (?, ?, ?)",
                (profile_id, name, created_at),
            )
        return profile_id, created_at

    def get_profile(self, profile_id: str) -> Optional[sqlite3.Row]:
        with self._connect() as conn:
            return conn.execute(
                "SELECT * FROM profiles WHERE profile_id = ?", (profile_id,)
            ).fetchone()

    def list_profiles(self) -> list[sqlite3.Row]:
        with self._connect() as conn:
            return conn.execute(
                """
                SELECT p.profile_id, p.name, p.created_at,
                       COUNT(s.id) AS n_swipes
                FROM profiles p
                LEFT JOIN swipes s ON s.profile_id = p.profile_id
                GROUP BY p.profile_id
                ORDER BY p.created_at
                """
            ).fetchall()

    def profile_exists(self, profile_id: str) -> bool:
        return self.get_profile(profile_id) is not None

    # ------------------------------------------------------- reference photos
    def add_reference_photo(
        self, profile_id: str, embedding: np.ndarray, ext: str = ".jpg"
    ) -> tuple[str, str]:
        """Reserves a ref_id and a path (relative to `self.refs_dir`) for a new
        reference photo, and records its embedding. The caller is responsible
        for actually writing the image file to `self.refs_dir / relative_path`
        -- this method does no disk I/O itself, only bookkeeping."""
        ref_id = uuid.uuid4().hex[:12]
        relative_path = f"{profile_id}/{ref_id}{ext}"
        blob = np.asarray(embedding, dtype=np.float32).tobytes()
        with self._connect() as conn:
            conn.execute(
                """
                INSERT INTO reference_photos (ref_id, profile_id, image_path, embedding, created_at)
                VALUES (?, ?, ?, ?, ?)
                """,
                (ref_id, profile_id, relative_path, blob, _now()),
            )
        return ref_id, relative_path

    def list_reference_photos(self, profile_id: str) -> list[sqlite3.Row]:
        with self._connect() as conn:
            return conn.execute(
                "SELECT * FROM reference_photos WHERE profile_id = ? ORDER BY created_at",
                (profile_id,),
            ).fetchall()

    def get_reference_embeddings(self, profile_id: str) -> np.ndarray:
        """[n, d] float32 matrix of every reference photo's embedding, in upload order."""
        rows = self.list_reference_photos(profile_id)
        if not rows:
            return np.empty((0, 0), dtype=np.float32)
        return np.stack([np.frombuffer(r["embedding"], dtype=np.float32) for r in rows])

    def count_reference_photos(self, profile_id: str) -> int:
        with self._connect() as conn:
            return conn.execute(
                "SELECT COUNT(*) FROM reference_photos WHERE profile_id = ?", (profile_id,)
            ).fetchone()[0]

    # ------------------------------------------------------------- swipes
    def add_swipe(self, profile_id: str, article_id: str, liked: bool) -> None:
        """Records a like/dislike. Swiping the same article again overwrites
        the previous verdict rather than erroring."""
        with self._connect() as conn:
            conn.execute(
                """
                INSERT INTO swipes (profile_id, article_id, liked, created_at)
                VALUES (?, ?, ?, ?)
                ON CONFLICT(profile_id, article_id)
                DO UPDATE SET liked = excluded.liked, created_at = excluded.created_at
                """,
                (profile_id, article_id, int(liked), _now()),
            )

    def list_swipes(self, profile_id: str) -> list[sqlite3.Row]:
        with self._connect() as conn:
            return conn.execute(
                "SELECT * FROM swipes WHERE profile_id = ? ORDER BY created_at",
                (profile_id,),
            ).fetchall()

    def get_swiped_article_ids(self, profile_id: str) -> set[str]:
        with self._connect() as conn:
            rows = conn.execute(
                "SELECT article_id FROM swipes WHERE profile_id = ?", (profile_id,)
            ).fetchall()
        return {r["article_id"] for r in rows}

    def get_liked_article_ids(self, profile_id: str) -> list[str]:
        with self._connect() as conn:
            rows = conn.execute(
                "SELECT article_id FROM swipes WHERE profile_id = ? AND liked = 1 ORDER BY created_at",
                (profile_id,),
            ).fetchall()
        return [r["article_id"] for r in rows]

    def get_disliked_article_ids(self, profile_id: str) -> list[str]:
        with self._connect() as conn:
            rows = conn.execute(
                "SELECT article_id FROM swipes WHERE profile_id = ? AND liked = 0 ORDER BY created_at",
                (profile_id,),
            ).fetchall()
        return [r["article_id"] for r in rows]

    def count_swipes(self, profile_id: str) -> int:
        with self._connect() as conn:
            return conn.execute(
                "SELECT COUNT(*) FROM swipes WHERE profile_id = ?", (profile_id,)
            ).fetchone()[0]

    def count_liked(self, profile_id: str) -> int:
        with self._connect() as conn:
            return conn.execute(
                "SELECT COUNT(*) FROM swipes WHERE profile_id = ? AND liked = 1", (profile_id,)
            ).fetchone()[0]

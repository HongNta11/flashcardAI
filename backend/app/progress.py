import sqlite3
from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from .auth import verify_token
from .db import get_db

router = APIRouter()

_ID_PATTERN = r'^[\w-]+$'


class ProgressEntry(BaseModel):
    book_id: str = Field(min_length=1, max_length=200, pattern=_ID_PATTERN)
    card_id: str = Field(min_length=1, max_length=200, pattern=_ID_PATTERN)
    correct: bool
    session_id: str | None = None


@router.post("/progress", status_code=201)
def save_progress(
    entry: ProgressEntry,
    token: str = Depends(verify_token),
    db: sqlite3.Connection = Depends(get_db),
):
    db.execute(
        "INSERT INTO progress (user_token, book_id, card_id, correct, session_id) "
        "VALUES (?,?,?,?,?)",
        (token, entry.book_id, entry.card_id, int(entry.correct), entry.session_id),
    )
    db.commit()
    return {"ok": True}


@router.get("/progress/{book_id}")
def get_progress(
    book_id: str,
    token: str = Depends(verify_token),
    db: sqlite3.Connection = Depends(get_db),
):
    rows = db.execute(
        """SELECT card_id, correct, reviewed_at
           FROM progress
           WHERE user_token = ? AND book_id = ?
           ORDER BY reviewed_at DESC
           LIMIT 1000""",
        (token, book_id),
    ).fetchall()
    return {"book_id": book_id, "results": [dict(r) for r in rows]}

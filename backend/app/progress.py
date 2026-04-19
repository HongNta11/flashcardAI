import sqlite3
from fastapi import APIRouter, Depends
from pydantic import BaseModel
from .auth import verify_token
from .db import get_db

router = APIRouter()


class ProgressEntry(BaseModel):
    book_id: str
    card_id: str
    correct: bool


@router.post("/progress", status_code=201)
def save_progress(
    entry: ProgressEntry,
    token: str = Depends(verify_token),
    db: sqlite3.Connection = Depends(get_db),
):
    db.execute(
        "INSERT INTO progress (user_token, book_id, card_id, correct) VALUES (?,?,?,?)",
        (token, entry.book_id, entry.card_id, int(entry.correct)),
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
           ORDER BY reviewed_at DESC""",
        (token, book_id),
    ).fetchall()
    return {"book_id": book_id, "results": [dict(r) for r in rows]}

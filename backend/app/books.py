import json
import os
import sqlite3
from pathlib import Path
from fastapi import APIRouter, Depends, HTTPException
from .auth import verify_token
from .db import get_db

router = APIRouter()


def get_books_dir() -> Path:
    return Path(os.environ.get("BOOKS_DIR", "./books"))


@router.get("/books")
def list_books(
    token: str = Depends(verify_token),
    db: sqlite3.Connection = Depends(get_db),
    books_dir: Path = Depends(get_books_dir),
):
    books_dir.mkdir(parents=True, exist_ok=True)
    result = []
    for json_file in sorted(books_dir.glob("*.json")):
        try:
            book_id = json_file.stem
            data = json.loads(json_file.read_text(encoding="utf-8"))
            total = len(data["cards"])
            row = db.execute(
                "SELECT COUNT(DISTINCT card_id) AS reviewed FROM progress "
                "WHERE user_token = ? AND book_id = ?",
                (token, book_id),
            ).fetchone()
            reviewed = row["reviewed"] if row else 0
            progress_pct = round(reviewed / total * 100) if total > 0 else 0
            result.append({
                "id": book_id,
                "title": book_id.replace("-", " ").title(),
                "card_count": total,
                "progress_pct": progress_pct,
            })
        except (json.JSONDecodeError, KeyError):
            continue
    return {"books": result}


@router.get("/books/{book_id}/cards")
def get_cards(
    book_id: str,
    token: str = Depends(verify_token),
    books_dir: Path = Depends(get_books_dir),
):
    json_file = books_dir / f"{book_id}.json"
    if not json_file.exists():
        raise HTTPException(status_code=404, detail="Book not found")
    return json.loads(json_file.read_text(encoding="utf-8"))

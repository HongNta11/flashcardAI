import os
import sqlite3
from typing import Generator


def get_db_path() -> str:
    return os.environ.get("DB_PATH", "./flashcards.db")


def init_db(db_path: str) -> None:
    with sqlite3.connect(db_path) as conn:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS progress (
                user_token  TEXT NOT NULL,
                book_id     TEXT NOT NULL,
                card_id     TEXT NOT NULL,
                correct     INTEGER NOT NULL,
                reviewed_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        """)
        conn.execute("""
            CREATE INDEX IF NOT EXISTS idx_progress_book
            ON progress (user_token, book_id)
        """)
        conn.commit()


def get_db() -> Generator[sqlite3.Connection, None, None]:
    conn = sqlite3.connect(get_db_path())
    conn.row_factory = sqlite3.Row
    try:
        yield conn
    finally:
        conn.close()

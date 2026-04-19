import json
import sqlite3
import pytest
from pathlib import Path
from starlette.testclient import TestClient


@pytest.fixture
def books_dir(tmp_path):
    d = tmp_path / "books"
    d.mkdir()
    return d


@pytest.fixture
def db_path(tmp_path):
    return str(tmp_path / "test.db")


@pytest.fixture
def sample_book(books_dir):
    data = {
        "book": "test-book",
        "generated_at": "2026-01-01T00:00:00Z",
        "cards": [
            {
                "id": "tb-001",
                "question": "What is 2+2?",
                "options": ["3", "4", "5", "6"],
                "correct_answer": "4",
                "explanation": "Basic arithmetic.",
            },
            {
                "id": "tb-002",
                "question": "What color is the sky?",
                "options": ["Red", "Green", "Blue", "Yellow"],
                "correct_answer": "Blue",
                "explanation": "Rayleigh scattering.",
            },
        ],
    }
    (books_dir / "test-book.json").write_text(json.dumps(data))
    return books_dir


@pytest.fixture
def client(db_path, books_dir, monkeypatch):
    monkeypatch.setenv("AUTH_TOKEN", "test-token")

    from app.db import get_db, init_db
    from app.books import get_books_dir
    from app.main import app

    init_db(db_path)

    def _books_dir():
        return books_dir

    def _get_db():
        conn = sqlite3.connect(db_path)
        conn.row_factory = sqlite3.Row
        try:
            yield conn
        finally:
            conn.close()

    app.dependency_overrides[get_books_dir] = _books_dir
    app.dependency_overrides[get_db] = _get_db
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()


@pytest.fixture
def auth_headers():
    return {"Authorization": "Bearer test-token"}

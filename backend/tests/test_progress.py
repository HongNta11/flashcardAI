import sqlite3


def test_save_progress_returns_201(client, auth_headers):
    response = client.post(
        "/progress",
        json={"book_id": "clean-code", "card_id": "cc-001", "correct": True},
        headers=auth_headers,
    )
    assert response.status_code == 201
    assert response.json() == {"ok": True}


def test_save_progress_stores_entry(client, db_path, auth_headers):
    client.post(
        "/progress",
        json={"book_id": "clean-code", "card_id": "cc-001", "correct": False},
        headers=auth_headers,
    )
    conn = sqlite3.connect(db_path)
    row = conn.execute(
        "SELECT correct FROM progress WHERE book_id='clean-code' AND card_id='cc-001'"
    ).fetchone()
    conn.close()
    assert row is not None
    assert row[0] == 0


def test_get_progress_returns_results(client, db_path, auth_headers):
    conn = sqlite3.connect(db_path)
    conn.execute(
        "INSERT INTO progress (user_token, book_id, card_id, correct) VALUES (?,?,?,?)",
        ("test-token", "clean-code", "cc-001", 1),
    )
    conn.commit()
    conn.close()

    response = client.get("/progress/clean-code", headers=auth_headers)
    assert response.status_code == 200
    data = response.json()
    assert data["book_id"] == "clean-code"
    assert len(data["results"]) == 1
    assert data["results"][0]["card_id"] == "cc-001"
    assert data["results"][0]["correct"] == 1


def test_get_progress_empty_for_new_book(client, auth_headers):
    response = client.get("/progress/new-book", headers=auth_headers)
    assert response.status_code == 200
    assert response.json()["results"] == []


def test_init_db_adds_session_id_column(db_path):
    from app.db import init_db
    init_db(db_path)
    conn = sqlite3.connect(db_path)
    cols = [r[1] for r in conn.execute("PRAGMA table_info(progress)").fetchall()]
    conn.close()
    assert "session_id" in cols


def test_init_db_is_idempotent(db_path):
    from app.db import init_db
    init_db(db_path)
    init_db(db_path)  # second call must not raise
    conn = sqlite3.connect(db_path)
    cols = [r[1] for r in conn.execute("PRAGMA table_info(progress)").fetchall()]
    conn.close()
    assert "session_id" in cols


def test_save_progress_stores_session_id(client, db_path, auth_headers):
    response = client.post(
        "/progress",
        json={
            "book_id": "clean-code",
            "card_id": "cc-001",
            "correct": True,
            "session_id": "sess-abc-123",
        },
        headers=auth_headers,
    )
    assert response.status_code == 201
    conn = sqlite3.connect(db_path)
    row = conn.execute(
        "SELECT session_id FROM progress WHERE card_id='cc-001'"
    ).fetchone()
    conn.close()
    assert row is not None
    assert row[0] == "sess-abc-123"


def test_save_progress_without_session_id_stores_null(client, db_path, auth_headers):
    response = client.post(
        "/progress",
        json={"book_id": "clean-code", "card_id": "cc-002", "correct": True},
        headers=auth_headers,
    )
    assert response.status_code == 201
    conn = sqlite3.connect(db_path)
    row = conn.execute(
        "SELECT session_id FROM progress WHERE card_id='cc-002'"
    ).fetchone()
    conn.close()
    assert row is not None
    assert row[0] is None

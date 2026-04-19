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

import sqlite3


def test_list_books_empty(client, auth_headers):
    response = client.get("/books", headers=auth_headers)
    assert response.status_code == 200
    assert response.json() == {"books": []}


def test_list_books_returns_book(client, sample_book, auth_headers):
    response = client.get("/books", headers=auth_headers)
    assert response.status_code == 200
    books = response.json()["books"]
    assert len(books) == 1
    assert books[0]["id"] == "test-book"
    assert books[0]["card_count"] == 2
    assert books[0]["progress_pct"] == 0


def test_list_books_shows_progress(client, sample_book, db_path, auth_headers):
    conn = sqlite3.connect(db_path)
    conn.execute(
        "INSERT INTO progress (user_token, book_id, card_id, correct) VALUES (?,?,?,?)",
        ("test-token", "test-book", "tb-001", 1),
    )
    conn.commit()
    conn.close()

    response = client.get("/books", headers=auth_headers)
    books = response.json()["books"]
    assert books[0]["progress_pct"] == 50


def test_get_cards_returns_cards(client, sample_book, auth_headers):
    response = client.get("/books/test-book/cards", headers=auth_headers)
    assert response.status_code == 200
    data = response.json()
    assert data["book"] == "test-book"
    assert len(data["cards"]) == 2
    assert data["cards"][0]["id"] == "tb-001"
    assert data["cards"][0]["correct_answer"] == "4"


def test_get_cards_404_unknown_book(client, auth_headers):
    response = client.get("/books/no-such-book/cards", headers=auth_headers)
    assert response.status_code == 404

def test_missing_token_returns_403(client):
    response = client.get("/books")
    assert response.status_code == 403


def test_wrong_token_returns_403(client):
    response = client.get("/books", headers={"Authorization": "Bearer wrong"})
    assert response.status_code == 403


def test_valid_token_returns_200(client, auth_headers):
    response = client.get("/books", headers=auth_headers)
    assert response.status_code == 200


def test_unconfigured_server_returns_500(client, monkeypatch):
    monkeypatch.delenv("AUTH_TOKEN")
    response = client.get("/books", headers={"Authorization": "Bearer anything"})
    assert response.status_code == 500

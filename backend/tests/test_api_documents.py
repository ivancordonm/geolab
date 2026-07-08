from fastapi.testclient import TestClient

import app.auth.router as auth_router
from app.auth.google import GoogleIdentity
from app.main import app


def _sample_document(doc_id: str = "doc-1") -> dict:
    return {"schemaVersion": 1, "id": doc_id, "title": "Triangle", "objects": []}


def _login(test_client: TestClient, monkeypatch, sub: str, email: str) -> None:
    monkeypatch.setattr(
        auth_router,
        "verify_google_id_token",
        lambda token: GoogleIdentity(sub=sub, email=email, name=None, picture_url=None),
    )
    test_client.post("/auth/google", json={"idToken": "fake"})


def test_list_documents_requires_authentication(client) -> None:
    response = client.get("/documents")
    assert response.status_code == 401


def test_create_list_get_update_delete_round_trip(client, monkeypatch) -> None:
    _login(client, monkeypatch, sub="user-a", email="a@example.com")

    create_response = client.post(
        "/documents", json={"title": "Triangle", "document": _sample_document()}
    )
    assert create_response.status_code == 201
    document_id = create_response.json()["id"]

    list_response = client.get("/documents")
    assert list_response.status_code == 200
    assert [item["id"] for item in list_response.json()] == [document_id]

    get_response = client.get(f"/documents/{document_id}")
    assert get_response.status_code == 200
    assert get_response.json()["document"]["id"] == "doc-1"

    update_response = client.put(f"/documents/{document_id}", json={"title": "Renamed"})
    assert update_response.status_code == 200
    assert update_response.json()["title"] == "Renamed"

    delete_response = client.delete(f"/documents/{document_id}")
    assert delete_response.status_code == 204

    missing_response = client.get(f"/documents/{document_id}")
    assert missing_response.status_code == 404


def test_get_unknown_document_returns_404(client, monkeypatch) -> None:
    _login(client, monkeypatch, sub="user-a", email="a@example.com")
    response = client.get("/documents/does-not-exist")
    assert response.status_code == 404


def test_documents_are_isolated_between_users(client, monkeypatch) -> None:
    _login(client, monkeypatch, sub="user-a", email="a@example.com")
    create_response = client.post(
        "/documents", json={"title": "Triangle", "document": _sample_document()}
    )
    document_id = create_response.json()["id"]

    other_client = TestClient(app)
    _login(other_client, monkeypatch, sub="user-b", email="b@example.com")

    assert other_client.get(f"/documents/{document_id}").status_code == 404
    assert other_client.put(f"/documents/{document_id}", json={"title": "Hijacked"}).status_code == 404
    assert other_client.delete(f"/documents/{document_id}").status_code == 404

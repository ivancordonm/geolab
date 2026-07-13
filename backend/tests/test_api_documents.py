from fastapi.testclient import TestClient

import app.auth.router as auth_router
from app.auth.google import GoogleIdentity
from app.main import app


def _sample_document(doc_id: str = "doc-1", title: str = "Triangle") -> dict:
    return {"schemaVersion": 1, "id": doc_id, "title": title, "objects": []}


def _frontend_contract_document() -> dict:
    return {
        "schemaVersion": 1,
        "id": "frontend-contract",
        "title": "Payload title",
        "objects": [
            {"id": "A", "label": "A", "kind": "point", "style": {"labelOffset": {"x": 4, "y": -2}}, "definition": {"type": "free", "x": 0, "y": 0}},
            {"id": "B", "label": "B", "kind": "point", "definition": {"type": "free", "x": 4, "y": 0}},
            {"id": "C", "label": "C", "kind": "point", "definition": {"type": "free", "x": 2, "y": 3}},
            {"id": "poly", "label": "poly", "kind": "polygon", "definition": {"type": "polygon", "points": ["A", "B", "C"]}},
            {"id": "V", "label": "V", "kind": "point", "definition": {"type": "polygon_vertex", "polygon": "poly", "index": 1}},
            {"id": "arc", "label": "arc", "kind": "arc", "definition": {"type": "arc_through_points", "pointA": "A", "pointMid": "C", "pointB": "B"}},
        ],
    }


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
        "/documents", json={"title": "Triangle", "document": _sample_document(title="Stale")}
    )
    assert create_response.status_code == 201
    assert create_response.json()["document"]["title"] == "Triangle"
    document_id = create_response.json()["id"]

    list_response = client.get("/documents")
    assert list_response.status_code == 200
    list_body = list_response.json()
    assert [item["id"] for item in list_body["documents"]] == [document_id]
    assert list_body["total"] == 1
    assert list_body["hasMore"] is False

    get_response = client.get(f"/documents/{document_id}")
    assert get_response.status_code == 200
    assert get_response.json()["document"]["id"] == "doc-1"
    assert get_response.json()["document"]["title"] == "Triangle"

    update_response = client.put(f"/documents/{document_id}", json={"title": "Renamed"})
    assert update_response.status_code == 200
    assert update_response.json()["title"] == "Renamed"
    assert update_response.json()["document"]["title"] == "Renamed"

    content_update_response = client.put(
        f"/documents/{document_id}",
        json={"document": _sample_document(title="Payload title")},
    )
    assert content_update_response.status_code == 200
    assert content_update_response.json()["title"] == "Renamed"
    assert content_update_response.json()["document"]["title"] == "Renamed"

    delete_response = client.delete(f"/documents/{document_id}")
    assert delete_response.status_code == 204

    missing_response = client.get(f"/documents/{document_id}")
    assert missing_response.status_code == 404


def test_document_list_pagination(client, monkeypatch) -> None:
    _login(client, monkeypatch, sub="user-a", email="a@example.com")

    for index in range(120):
        response = client.post(
            "/documents",
            json={"title": f"Doc {index}", "document": _sample_document(doc_id=f"doc-{index}")},
        )
        assert response.status_code == 201

    first_page = client.get("/documents", params={"limit": 50, "offset": 0})
    assert first_page.status_code == 200
    first_body = first_page.json()
    assert len(first_body["documents"]) == 50
    assert first_body["total"] == 120
    assert first_body["hasMore"] is True

    second_page = client.get("/documents", params={"limit": 50, "offset": 100})
    assert second_page.status_code == 200
    second_body = second_page.json()
    assert len(second_body["documents"]) == 20
    assert second_body["total"] == 120
    assert second_body["hasMore"] is False

    default_page = client.get("/documents")
    assert default_page.status_code == 200
    default_body = default_page.json()
    assert len(default_body["documents"]) == 50
    assert default_body["total"] == 120
    assert default_body["hasMore"] is True

    # Pages are non-overlapping and ordered by most-recently-updated first.
    first_ids = [item["id"] for item in first_body["documents"]]
    second_ids = [item["id"] for item in second_body["documents"]]
    assert set(first_ids).isdisjoint(second_ids)


def test_get_unknown_document_returns_404(client, monkeypatch) -> None:
    _login(client, monkeypatch, sub="user-a", email="a@example.com")
    response = client.get("/documents/does-not-exist")
    assert response.status_code == 404


def test_cloud_document_preserves_frontend_vertex_arc_and_label_offset(client, monkeypatch) -> None:
    _login(client, monkeypatch, sub="user-a", email="a@example.com")

    create_response = client.post(
        "/documents",
        json={"title": "Canonical title", "document": _frontend_contract_document()},
    )

    assert create_response.status_code == 201
    document_id = create_response.json()["id"]
    payload = client.get(f"/documents/{document_id}").json()["document"]
    assert payload["title"] == "Canonical title"
    assert payload["objects"][0]["style"]["labelOffset"] == {"x": 4.0, "y": -2.0}
    assert payload["objects"][3]["definition"]["points"] == ["A", "B", "C"]
    assert payload["objects"][4]["definition"]["type"] == "polygon_vertex"
    assert payload["objects"][5]["definition"]["type"] == "arc_through_points"


def test_document_titles_are_trimmed_and_blank_titles_are_rejected(client, monkeypatch) -> None:
    _login(client, monkeypatch, sub="user-a", email="a@example.com")

    create_response = client.post(
        "/documents",
        json={"title": "  Trimmed title  ", "document": _sample_document()},
    )
    assert create_response.status_code == 201
    assert create_response.json()["title"] == "Trimmed title"
    document_id = create_response.json()["id"]

    assert client.post(
        "/documents",
        json={"title": "   ", "document": _sample_document()},
    ).status_code == 422
    assert client.put(f"/documents/{document_id}", json={"title": "   "}).status_code == 422


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


def test_document_share_token_column_defaults_to_none(client, monkeypatch) -> None:
    _login(client, monkeypatch, sub="user-a", email="a@example.com")
    create_response = client.post(
        "/documents", json={"title": "T", "document": _sample_document()}
    )
    assert create_response.status_code == 201
    # A freshly created document is not shared yet.
    from app.models import Document
    from app.db import get_db

    override = app.dependency_overrides[get_db]
    session = next(override())
    try:
        document = session.query(Document).one()
        assert document.share_token is None
    finally:
        session.close()


def test_share_generates_token_and_is_idempotent(client, monkeypatch) -> None:
    _login(client, monkeypatch, sub="user-a", email="a@example.com")
    doc_id = client.post(
        "/documents", json={"title": "T", "document": _sample_document()}
    ).json()["id"]

    first = client.post(f"/documents/{doc_id}/share")
    assert first.status_code == 200
    token = first.json()["token"]
    assert token

    second = client.post(f"/documents/{doc_id}/share")
    assert second.status_code == 200
    assert second.json()["token"] == token

    detail = client.get(f"/documents/{doc_id}").json()
    assert detail["shared"] is True


def test_unshare_clears_token(client, monkeypatch) -> None:
    _login(client, monkeypatch, sub="user-a", email="a@example.com")
    doc_id = client.post(
        "/documents", json={"title": "T", "document": _sample_document()}
    ).json()["id"]
    client.post(f"/documents/{doc_id}/share")

    revoke = client.delete(f"/documents/{doc_id}/share")
    assert revoke.status_code == 204

    detail = client.get(f"/documents/{doc_id}").json()
    assert detail["shared"] is False


def test_share_other_users_document_is_not_found(client, monkeypatch) -> None:
    _login(client, monkeypatch, sub="user-a", email="a@example.com")
    doc_id = client.post(
        "/documents", json={"title": "T", "document": _sample_document()}
    ).json()["id"]
    _login(client, monkeypatch, sub="user-b", email="b@example.com")

    assert client.post(f"/documents/{doc_id}/share").status_code == 404
    assert client.delete(f"/documents/{doc_id}/share").status_code == 404


def test_public_read_returns_shared_document_without_auth(client, monkeypatch) -> None:
    _login(client, monkeypatch, sub="user-a", email="a@example.com")
    doc_id = client.post(
        "/documents", json={"title": "Shared", "document": _sample_document()}
    ).json()["id"]
    token = client.post(f"/documents/{doc_id}/share").json()["token"]

    # New client with no session cookie.
    anon = TestClient(app)
    response = anon.get(f"/documents/shared/{token}")
    assert response.status_code == 200
    body = response.json()
    assert body["title"] == "Shared"
    assert body["document"]["objects"] == []
    assert "id" not in body  # internal row id not exposed


def test_public_read_of_revoked_token_is_not_found(client, monkeypatch) -> None:
    _login(client, monkeypatch, sub="user-a", email="a@example.com")
    doc_id = client.post(
        "/documents", json={"title": "T", "document": _sample_document()}
    ).json()["id"]
    token = client.post(f"/documents/{doc_id}/share").json()["token"]
    client.delete(f"/documents/{doc_id}/share")

    assert client.get(f"/documents/shared/{token}").status_code == 404


def test_public_read_of_unknown_token_is_not_found(client) -> None:
    assert client.get("/documents/shared/does-not-exist").status_code == 404

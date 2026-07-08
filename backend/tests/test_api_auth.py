import app.auth.router as auth_router
from app.auth.google import GoogleIdentity, GoogleTokenError


def _identity(sub: str = "sub-1", email: str = "a@example.com", name: str = "Ada") -> GoogleIdentity:
    return GoogleIdentity(sub=sub, email=email, name=name, picture_url=None)


def test_google_login_creates_user_and_sets_cookie(client, monkeypatch) -> None:
    monkeypatch.setattr(auth_router, "verify_google_id_token", lambda token: _identity())

    response = client.post("/auth/google", json={"idToken": "fake"})

    assert response.status_code == 200
    body = response.json()
    assert body["email"] == "a@example.com"
    assert "geolab_session" in response.cookies


def test_google_login_upserts_existing_user_by_sub(client, monkeypatch) -> None:
    monkeypatch.setattr(auth_router, "verify_google_id_token", lambda token: _identity(name="Ada"))
    first = client.post("/auth/google", json={"idToken": "fake"})

    monkeypatch.setattr(
        auth_router, "verify_google_id_token", lambda token: _identity(name="Ada Lovelace")
    )
    second = client.post("/auth/google", json={"idToken": "fake"})

    assert first.json()["id"] == second.json()["id"]
    assert second.json()["name"] == "Ada Lovelace"


def test_google_login_rejects_invalid_token(client, monkeypatch) -> None:
    def _raise(token: str):
        raise GoogleTokenError("bad token")

    monkeypatch.setattr(auth_router, "verify_google_id_token", _raise)

    response = client.post("/auth/google", json={"idToken": "fake"})

    assert response.status_code == 401
    assert response.json()["detail"]["code"] == "invalid_google_token"


def test_me_returns_401_without_session(client) -> None:
    response = client.get("/auth/me")
    assert response.status_code == 401


def test_me_returns_profile_after_login(client, monkeypatch) -> None:
    monkeypatch.setattr(auth_router, "verify_google_id_token", lambda token: _identity())
    client.post("/auth/google", json={"idToken": "fake"})

    response = client.get("/auth/me")

    assert response.status_code == 200
    assert response.json()["email"] == "a@example.com"


def test_logout_clears_session(client, monkeypatch) -> None:
    monkeypatch.setattr(auth_router, "verify_google_id_token", lambda token: _identity())
    client.post("/auth/google", json={"idToken": "fake"})

    client.post("/auth/logout")
    response = client.get("/auth/me")

    assert response.status_code == 401

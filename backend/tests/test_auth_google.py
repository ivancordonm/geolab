import pytest

import app.auth.google as google_auth
from app.auth.google import GoogleTokenError, verify_google_id_token


@pytest.fixture(autouse=True)
def _client_id(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("GOOGLE_CLIENT_ID", "test-client-id.apps.googleusercontent.com")


def test_verify_google_id_token_returns_identity_for_valid_claims(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(
        google_auth.google_id_token,
        "verify_oauth2_token",
        lambda *args, **kwargs: {
            "sub": "10769150350006150715",
            "email": "user@example.com",
            "name": "Ada Lovelace",
            "picture": "https://example.com/pic.jpg",
        },
    )

    identity = verify_google_id_token("fake-token")

    assert identity.sub == "10769150350006150715"
    assert identity.email == "user@example.com"
    assert identity.name == "Ada Lovelace"
    assert identity.picture_url == "https://example.com/pic.jpg"


def test_verify_google_id_token_wraps_invalid_token(monkeypatch: pytest.MonkeyPatch) -> None:
    def _raise(*args, **kwargs):
        raise ValueError("Token used too late")

    monkeypatch.setattr(google_auth.google_id_token, "verify_oauth2_token", _raise)

    with pytest.raises(GoogleTokenError):
        verify_google_id_token("expired-token")

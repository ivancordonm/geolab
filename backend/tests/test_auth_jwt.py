from datetime import datetime, timedelta, timezone

import jwt
import pytest

from app.auth.jwt import SessionTokenError, issue_session_token, verify_session_token
from app.config import get_settings


def test_issue_and_verify_round_trip() -> None:
    token = issue_session_token("user-123")
    assert verify_session_token(token) == "user-123"


def test_verify_rejects_tampered_token() -> None:
    token = issue_session_token("user-123")
    header, payload, signature = token.split(".")
    replacement = "A" if signature[0] != "A" else "B"
    tampered = ".".join((header, payload, replacement + signature[1:]))
    with pytest.raises(SessionTokenError):
        verify_session_token(tampered)


def test_verify_rejects_expired_token() -> None:
    settings = get_settings()
    token = jwt.encode(
        {"sub": "user-123", "exp": datetime.now(timezone.utc) - timedelta(seconds=1)},
        settings.jwt_secret,
        algorithm="HS256",
    )
    with pytest.raises(SessionTokenError):
        verify_session_token(token)

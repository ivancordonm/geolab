import time

import pytest

from app.auth.jwt import SessionTokenError, issue_session_token, verify_session_token


def test_issue_and_verify_round_trip() -> None:
    token = issue_session_token("user-123")
    assert verify_session_token(token) == "user-123"


def test_verify_rejects_tampered_token() -> None:
    token = issue_session_token("user-123")
    tampered = token[:-1] + ("A" if token[-1] != "A" else "B")
    with pytest.raises(SessionTokenError):
        verify_session_token(tampered)


def test_verify_rejects_expired_token(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("JWT_EXPIRE_DAYS", "0")
    token = issue_session_token("user-123")
    time.sleep(1.1)
    with pytest.raises(SessionTokenError):
        verify_session_token(token)

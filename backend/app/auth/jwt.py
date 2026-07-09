"""Issuance and verification of GeoLab's own session JWT."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

import jwt

from app.config import get_settings


class SessionTokenError(Exception):
    """Raised when a session token is missing, malformed, or expired."""


def issue_session_token(user_id: str) -> str:
    settings = get_settings()
    if not settings.jwt_secret:
        raise RuntimeError("JWT_SECRET is not set. Add it to backend/.env.")
    now = datetime.now(timezone.utc)
    payload = {
        "sub": user_id,
        "iat": now,
        "exp": now + timedelta(days=settings.jwt_expire_days),
    }
    return jwt.encode(payload, settings.jwt_secret, algorithm="HS256")


def verify_session_token(token: str) -> str:
    """Return the user id encoded in a valid session token."""

    settings = get_settings()
    if not settings.jwt_secret:
        raise RuntimeError("JWT_SECRET is not set. Add it to backend/.env.")
    try:
        payload = jwt.decode(token, settings.jwt_secret, algorithms=["HS256"])
    except jwt.PyJWTError as error:
        raise SessionTokenError("Session token is invalid or expired.") from error
    subject = payload.get("sub")
    if not isinstance(subject, str) or not subject:
        raise SessionTokenError("Session token is missing a subject claim.")
    return subject

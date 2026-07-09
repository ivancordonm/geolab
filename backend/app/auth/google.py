"""Verification of Google Identity Services ID tokens."""

from __future__ import annotations

from dataclasses import dataclass

from google.auth.transport import requests as google_requests
from google.oauth2 import id_token as google_id_token

from app.config import get_settings


class GoogleTokenError(Exception):
    """Raised when a Google ID token fails verification."""


@dataclass(frozen=True)
class GoogleIdentity:
    sub: str
    email: str
    name: str | None
    picture_url: str | None


def verify_google_id_token(token: str) -> GoogleIdentity:
    settings = get_settings()
    if not settings.google_client_id:
        raise RuntimeError("GOOGLE_CLIENT_ID is not set. Add it to backend/.env.")
    try:
        claims = google_id_token.verify_oauth2_token(
            token, google_requests.Request(), settings.google_client_id
        )
    except ValueError as error:
        raise GoogleTokenError("Google ID token is invalid or expired.") from error

    sub = claims.get("sub")
    email = claims.get("email")
    if not isinstance(sub, str) or not isinstance(email, str):
        raise GoogleTokenError("Google ID token is missing required claims.")
    return GoogleIdentity(
        sub=sub,
        email=email,
        name=claims.get("name"),
        picture_url=claims.get("picture"),
    )

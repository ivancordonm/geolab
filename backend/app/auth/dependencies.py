"""FastAPI dependencies resolving the current authenticated user."""

from __future__ import annotations

from fastapi import Cookie, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.auth.jwt import SessionTokenError, verify_session_token
from app.db import get_db
from app.models import User


def get_current_user_optional(
    session: Session = Depends(get_db),
    geolab_session: str | None = Cookie(default=None),
) -> User | None:
    if geolab_session is None:
        return None
    try:
        user_id = verify_session_token(geolab_session)
    except SessionTokenError:
        return None
    return session.get(User, user_id)


def get_current_user(
    user: User | None = Depends(get_current_user_optional),
) -> User:
    if user is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated.")
    return user

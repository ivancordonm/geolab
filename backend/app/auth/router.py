"""FastAPI routes for Google login and session management."""

from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy.orm import Session

from app.auth.dependencies import get_current_user_optional
from app.auth.google import GoogleTokenError, verify_google_id_token
from app.auth.jwt import issue_session_token
from app.auth.schemas import GoogleLoginRequest, UserProfile
from app.config import SESSION_COOKIE_NAME, get_settings
from app.db import get_db
from app.models import User

router = APIRouter(prefix="/auth", tags=["auth"])


def _profile(user: User) -> UserProfile:
    return UserProfile(
        id=user.id, email=user.email, name=user.name, picture_url=user.picture_url
    )


def _set_session_cookie(response: Response, user_id: str) -> None:
    settings = get_settings()
    token = issue_session_token(user_id)
    response.set_cookie(
        key=SESSION_COOKIE_NAME,
        value=token,
        httponly=True,
        secure=settings.cookie_secure,
        samesite=settings.cookie_samesite,
        max_age=settings.jwt_expire_days * 24 * 60 * 60,
        path="/",
    )


@router.post("/google", response_model=UserProfile)
def login_with_google(
    request: GoogleLoginRequest,
    response: Response,
    session: Session = Depends(get_db),
) -> UserProfile:
    try:
        identity = verify_google_id_token(request.id_token)
    except GoogleTokenError as error:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"code": "invalid_google_token", "message": str(error)},
        ) from error

    user = session.query(User).filter_by(google_sub=identity.sub).one_or_none()
    now = datetime.now(timezone.utc)
    if user is None:
        user = User(
            google_sub=identity.sub,
            email=identity.email,
            name=identity.name,
            picture_url=identity.picture_url,
            last_login_at=now,
        )
        session.add(user)
    else:
        user.email = identity.email
        user.name = identity.name
        user.picture_url = identity.picture_url
        user.last_login_at = now
    session.commit()
    session.refresh(user)

    _set_session_cookie(response, user.id)
    return _profile(user)


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
def logout(response: Response) -> None:
    response.delete_cookie(SESSION_COOKIE_NAME, path="/")


@router.get("/me", response_model=UserProfile)
def read_current_user(
    user: User | None = Depends(get_current_user_optional),
) -> UserProfile:
    if user is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated.")
    return _profile(user)

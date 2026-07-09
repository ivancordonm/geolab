import pytest
from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

import app.models  # noqa: F401
from app.auth.dependencies import get_current_user, get_current_user_optional
from app.auth.jwt import issue_session_token
from app.db import Base
from app.models import User


def _session():
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    return sessionmaker(bind=engine, expire_on_commit=False)()


def test_returns_user_for_valid_session_cookie() -> None:
    session = _session()
    user = User(google_sub="sub-1", email="a@example.com")
    session.add(user)
    session.commit()

    token = issue_session_token(user.id)
    resolved = get_current_user_optional(session=session, geolab_session=token)

    assert resolved is not None
    assert resolved.id == user.id


def test_returns_none_without_cookie() -> None:
    session = _session()
    assert get_current_user_optional(session=session, geolab_session=None) is None


def test_returns_none_for_invalid_token() -> None:
    session = _session()
    assert get_current_user_optional(session=session, geolab_session="not-a-jwt") is None


def test_get_current_user_raises_401_when_no_user() -> None:
    with pytest.raises(HTTPException) as exc_info:
        get_current_user(user=None)
    assert exc_info.value.status_code == 401


def test_get_current_user_returns_user_when_present() -> None:
    user = User(google_sub="sub-1", email="a@example.com")
    assert get_current_user(user=user) is user

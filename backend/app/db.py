"""Synchronous SQLAlchemy engine and session factory for Postgres persistence."""

from __future__ import annotations

from collections.abc import Iterator

from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from app.config import get_settings


class Base(DeclarativeBase):
    pass


def _to_sqlalchemy_url(raw_url: str) -> str:
    if raw_url.startswith("postgresql+"):
        return raw_url
    if raw_url.startswith("postgresql://"):
        return raw_url.replace("postgresql://", "postgresql+psycopg://", 1)
    if raw_url.startswith("postgres://"):
        return raw_url.replace("postgres://", "postgresql+psycopg://", 1)
    return raw_url


def _create_session_factory() -> sessionmaker[Session]:
    settings = get_settings()
    if not settings.database_url:
        raise RuntimeError("STORAGE_DATABASE_URL is not set. Add it to backend/.env.")
    engine = create_engine(_to_sqlalchemy_url(settings.database_url), pool_pre_ping=True)
    return sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


_session_factory: sessionmaker[Session] | None = None


def get_session_factory() -> sessionmaker[Session]:
    global _session_factory
    if _session_factory is None:
        _session_factory = _create_session_factory()
    return _session_factory


def get_db() -> Iterator[Session]:
    """FastAPI dependency yielding a database session per request."""

    session = get_session_factory()()
    try:
        yield session
    finally:
        session.close()

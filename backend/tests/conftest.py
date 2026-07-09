"""Shared pytest fixtures: an isolated in-memory database per test."""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

import app.models  # noqa: F401  registers User/Document on Base.metadata
from app.db import Base, get_db
from app.main import app


@pytest.fixture(autouse=True)
def _auth_env(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("JWT_SECRET", "test-jwt-secret")
    monkeypatch.setenv("GOOGLE_CLIENT_ID", "test-client-id.apps.googleusercontent.com")


@pytest.fixture
def client() -> TestClient:
    # TestClient dispatches requests to a worker thread distinct from this
    # fixture's thread. SQLite's default pool for ":memory:" databases
    # (SingletonThreadPool) hands out a separate in-memory database per
    # thread, so without StaticPool the request thread would see an empty,
    # table-less database. StaticPool shares the single connection created
    # here across all threads.
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)
    session_factory = sessionmaker(bind=engine, expire_on_commit=False)

    def override_get_db():
        session = session_factory()
        try:
            yield session
        finally:
            session.close()

    app.dependency_overrides[get_db] = override_get_db
    try:
        yield TestClient(app)
    finally:
        app.dependency_overrides.pop(get_db, None)

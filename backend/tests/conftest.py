"""Shared test fixtures for all backend tests."""

import pytest


@pytest.fixture(autouse=True)
def _default_jwt_secret(monkeypatch: pytest.MonkeyPatch) -> None:
    """Automatically set JWT_SECRET for all tests that need it."""
    monkeypatch.setenv("JWT_SECRET", "test-secret-key-for-testing-only")

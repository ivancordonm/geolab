import pytest

from app.config import _parse_origins, get_settings


def test_parse_origins_splits_and_strips_commas() -> None:
    assert _parse_origins(" http://a.com, http://b.com ") == ["http://a.com", "http://b.com"]


def test_parse_origins_ignores_empty_segments() -> None:
    assert _parse_origins("http://a.com,,") == ["http://a.com"]


def test_settings_cookie_flags_follow_app_env(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("APP_ENV", "production")
    settings = get_settings()
    assert settings.cookie_secure is True
    assert settings.cookie_samesite == "none"

    monkeypatch.setenv("APP_ENV", "development")
    settings = get_settings()
    assert settings.cookie_secure is False
    assert settings.cookie_samesite == "lax"


def test_settings_defaults_frontend_origin_to_local_dev(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("FRONTEND_ORIGIN", raising=False)
    settings = get_settings()
    assert settings.frontend_origins == ["http://localhost:5173"]

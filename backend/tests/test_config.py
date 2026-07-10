import pytest

from app.config import _parse_origins, get_settings


def test_parse_origins_splits_and_strips_commas() -> None:
    assert _parse_origins(" http://a.com, http://b.com ") == ["http://a.com", "http://b.com"]


def test_parse_origins_ignores_empty_segments() -> None:
    assert _parse_origins("http://a.com,,") == ["http://a.com"]


def test_parse_origins_rejects_an_empty_allowlist() -> None:
    with pytest.raises(ValueError, match="at least one non-empty origin"):
        _parse_origins(" , ")


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


@pytest.mark.parametrize("value", ["0", "-1", "not-a-number"])
def test_settings_rejects_non_positive_jwt_expiry(
    monkeypatch: pytest.MonkeyPatch,
    value: str,
) -> None:
    monkeypatch.setenv("JWT_EXPIRE_DAYS", value)
    with pytest.raises(ValueError, match="JWT_EXPIRE_DAYS must be a positive integer"):
        get_settings()


def test_settings_rejects_unsupported_app_env(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("APP_ENV", "staging")
    with pytest.raises(ValueError, match="APP_ENV must be one of"):
        get_settings()


def test_settings_rejects_empty_frontend_origin(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("FRONTEND_ORIGIN", " , ")
    with pytest.raises(ValueError, match="FRONTEND_ORIGIN"):
        get_settings()

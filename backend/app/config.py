"""Environment-driven configuration for auth, database, and CORS."""

from __future__ import annotations

import os
from dataclasses import dataclass

from dotenv import load_dotenv

load_dotenv()

SESSION_COOKIE_NAME = "geolab_session"
SUPPORTED_APP_ENVS = frozenset({"development", "production"})


@dataclass(frozen=True)
class Settings:
    database_url: str | None
    google_client_id: str | None
    jwt_secret: str | None
    jwt_expire_days: int
    app_env: str
    frontend_origins: list[str]
    cookie_domain: str | None

    @property
    def cookie_secure(self) -> bool:
        return self.app_env == "production"

    @property
    def cookie_samesite(self) -> str:
        return "none" if self.cookie_secure else "lax"


def get_settings() -> Settings:
    jwt_expire_days = _positive_int("JWT_EXPIRE_DAYS", os.getenv("JWT_EXPIRE_DAYS", "30"))
    app_env = os.getenv("APP_ENV", "development").strip().lower()
    if app_env not in SUPPORTED_APP_ENVS:
        supported = ", ".join(sorted(SUPPORTED_APP_ENVS))
        raise ValueError(f"APP_ENV must be one of: {supported}.")

    return Settings(
        database_url=os.getenv("STORAGE_DATABASE_URL"),
        google_client_id=os.getenv("GOOGLE_CLIENT_ID"),
        jwt_secret=os.getenv("JWT_SECRET"),
        jwt_expire_days=jwt_expire_days,
        app_env=app_env,
        frontend_origins=_parse_origins(
            os.getenv("FRONTEND_ORIGIN", "http://localhost:5173")
        ),
        cookie_domain=os.getenv("COOKIE_DOMAIN"),
    )


def _parse_origins(raw: str) -> list[str]:
    origins = [origin.strip() for origin in raw.split(",") if origin.strip()]
    if not origins:
        raise ValueError("FRONTEND_ORIGIN must contain at least one non-empty origin.")
    return origins


def _positive_int(name: str, raw: str) -> int:
    try:
        value = int(raw)
    except ValueError as error:
        raise ValueError(f"{name} must be a positive integer.") from error
    if value <= 0:
        raise ValueError(f"{name} must be a positive integer.")
    return value

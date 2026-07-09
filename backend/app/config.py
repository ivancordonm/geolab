"""Environment-driven configuration for auth, database, and CORS."""

from __future__ import annotations

import os
from dataclasses import dataclass

from dotenv import load_dotenv

load_dotenv()

SESSION_COOKIE_NAME = "geolab_session"


@dataclass(frozen=True)
class Settings:
    database_url: str | None
    google_client_id: str | None
    jwt_secret: str | None
    jwt_expire_days: int
    app_env: str
    frontend_origins: list[str]

    @property
    def cookie_secure(self) -> bool:
        return self.app_env == "production"

    @property
    def cookie_samesite(self) -> str:
        return "none" if self.cookie_secure else "lax"


def get_settings() -> Settings:
    return Settings(
        database_url=os.getenv("STORAGE_DATABASE_URL"),
        google_client_id=os.getenv("GOOGLE_CLIENT_ID"),
        jwt_secret=os.getenv("JWT_SECRET"),
        jwt_expire_days=int(os.getenv("JWT_EXPIRE_DAYS", "30")),
        app_env=os.getenv("APP_ENV", "development"),
        frontend_origins=_parse_origins(
            os.getenv("FRONTEND_ORIGIN", "http://localhost:5173")
        ),
    )


def _parse_origins(raw: str) -> list[str]:
    return [origin.strip() for origin in raw.split(",") if origin.strip()]

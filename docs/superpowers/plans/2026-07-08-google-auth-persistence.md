# Google login and cloud document persistence — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a user sign in with Google and save, list, open, rename, and delete multiple named geometry constructions in the Neon Postgres database, while guests keep today's localStorage-only experience unchanged.

**Architecture:** New `app/auth/` and `app/documents/` FastAPI modules backed by SQLAlchemy ORM models and Alembic migrations; a stateless JWT issued after verifying a Google Identity Services ID token, carried in an httpOnly cookie. The frontend gets a `useAuth` hook, a `GoogleSignInButton`, a `useCloudDocuments` hook, and a `CloudDocumentsPanel`, wired into the existing floating toolbar and `PersistenceControls`.

**Tech Stack:** FastAPI, SQLAlchemy 2.0 (sync, `psycopg` v3 driver), Alembic, PyJWT, `google-auth`, python-dotenv — backend. React 19, Vite, Vitest, Testing Library — frontend, no new dependencies.

**Spec:** `docs/superpowers/specs/2026-07-08-google-auth-persistence-design.md`

## Deviations from the approved spec

The spec said "SQLAlchemy async + asyncpg". Four implementation-level refinements below depart from that wording; none change the schema, endpoints, or UX the spec describes — flagging them here so they're visible before work starts:

1. **Synchronous SQLAlchemy** (`psycopg` v3 driver) instead of an async engine/`asyncpg`. Every existing route in `app/geometry/router.py` and `app/agent/router.py` is a plain `def`, not `async def` — introducing async just for this feature would make it the only async subsystem in the app for no behavioral gain at this traffic level.
2. **Client-side UUIDs**: primary keys are generated in Python via `uuid.uuid4()` (stored as `String(36)`), not a Postgres-native `gen_random_uuid()` default. Avoids depending on the `pgcrypto` extension.
3. **Generic `JSON` column** instead of Postgres-native `JSONB` for `documents.data`. Nothing in this feature queries inside the JSON blob. The generic type lets the whole test suite run against an in-memory SQLite database instead of the live Neon database — fast, and it can't pollute real data.
4. **Plain `os.getenv` config** (a small `Settings` dataclass + `get_settings()`) instead of `pydantic-settings`, matching the existing convention in `app/services.py` and `app/agent/ollama_planner.py`.
5. **Missing secrets fail on first use, not at process startup.** The spec says a missing `GOOGLE_CLIENT_ID`/`JWT_SECRET`/`DATABASE_URL` should fail fast at boot. In this plan they instead raise `RuntimeError` the first time a request actually needs them (`get_session_factory()`, `issue_session_token()`, `verify_google_id_token()`). Raising eagerly at import time would break every pre-existing test that imports `app.main` without those env vars set — including `test_health.py`, which has nothing to do with auth. Failing on first use still surfaces the misconfiguration immediately in practice (the very first login or save attempt), just not before the process finishes booting.

## Global Constraints

- All new Pydantic API schemas subclass `app.geometry.models.GeometryModel` (camelCase JSON via `alias_generator=to_camel`, `populate_by_name=True`, `serialize_by_alias=True`, `extra="forbid"`) — the same base already used by `app/schemas.py` and `app/agent/models.py`.
- Backend routes are synchronous (`def`, not `async def`) — see deviation #1.
- Frontend API modules use bare `fetch` with `credentials: "include"` (no new HTTP client library), matching `frontend/src/api/geometryApi.ts`.
- Frontend tests stub `global.fetch` via `vi.stubGlobal("fetch", ...)` and clean up with `vi.unstubAllGlobals()` in `afterEach`, matching `frontend/src/App.test.tsx`.
- `.env` files (backend and frontend) are already covered by the root `.gitignore` (`.env` / `.env.*` match at any depth) — never commit real secrets; only `.env.example` files are checked in.
- Branch: all work happens on `feature/google-auth-persistence` (already checked out).

---

## Task 0: Manual prerequisite — Google OAuth Client ID (no code)

This is not a coding task — it must be done by a human with a Google account before Task 5 can be exercised end-to-end. Record the resulting values; later tasks reference them by name.

- [ ] **Step 1: Create the OAuth consent screen and client ID**

1. Go to https://console.cloud.google.com/ and create (or select) a project.
2. Navigate to **APIs & Services → OAuth consent screen**. Choose **External**, fill in app name and support email, save.
3. Navigate to **APIs & Services → Credentials → Create Credentials → OAuth client ID**.
4. Application type: **Web application**.
5. Under **Authorized JavaScript origins**, add `http://localhost:5173` (add the production frontend origin later, once it's deployed).
6. Create it and copy the generated Client ID (looks like `1234567890-abc...apps.googleusercontent.com`).

- [ ] **Step 2: Add the required environment variables**

Generate a JWT signing secret:

```bash
openssl rand -hex 32
```

Append to `backend/.env` (already gitignored):

```
GOOGLE_CLIENT_ID=<the client id from step 1>
JWT_SECRET=<the output of openssl rand -hex 32>
JWT_EXPIRE_DAYS=30
APP_ENV=development
FRONTEND_ORIGIN=http://localhost:5173
```

Create `frontend/.env` (already gitignored) with:

```
VITE_GOOGLE_CLIENT_ID=<the same client id from step 1>
```

- [ ] **Step 3: Commit the example files that document these keys**

These come from Task 2 and Task 7 below — nothing to commit yet in this task. Just confirm both real `.env` files now have the five backend keys and one frontend key listed above.

---

## Task 1: Backend dependencies and configuration

**Files:**
- Modify: `backend/pyproject.toml`
- Create: `backend/app/config.py`
- Create: `backend/.env.example`
- Test: `backend/tests/test_config.py`

**Interfaces:**
- Produces: `app.config.Settings` (dataclass: `database_url: str | None`, `google_client_id: str | None`, `jwt_secret: str | None`, `jwt_expire_days: int`, `app_env: str`, `frontend_origins: list[str]`, properties `cookie_secure: bool`, `cookie_samesite: str`), `app.config.get_settings() -> Settings`, `app.config.SESSION_COOKIE_NAME: str`.

- [ ] **Step 1: Add backend dependencies**

Edit `backend/pyproject.toml`, in the `dependencies` list add:

```toml
  "sqlalchemy>=2.0,<3.0",
  "psycopg[binary]>=3.1,<4.0",
  "alembic>=1.13,<2.0",
  "pyjwt>=2.9,<3.0",
  "google-auth>=2.34,<3.0",
  "python-dotenv>=1.0,<2.0",
```

Install them:

```bash
cd backend && pip install -e '.[dev]'
```

- [ ] **Step 2: Write the failing test**

Create `backend/tests/test_config.py`:

```python
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
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd backend && pytest tests/test_config.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'app.config'` (or `ImportError`).

- [ ] **Step 4: Write the implementation**

Create `backend/app/config.py`:

```python
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
        database_url=os.getenv("DATABASE_URL"),
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
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd backend && pytest tests/test_config.py -v`
Expected: PASS (4 tests)

- [ ] **Step 6: Add `.env.example` and confirm the full suite still passes**

Create `backend/.env.example`:

```
# Neon Postgres connection string (already populated in backend/.env)
DATABASE_URL=

# Google Cloud Console OAuth client id (Web application type)
GOOGLE_CLIENT_ID=

# Secret used to sign GeoLab's own session JWT — generate with: openssl rand -hex 32
JWT_SECRET=

# Days before an issued session JWT expires
JWT_EXPIRE_DAYS=30

# "development" or "production" — controls cookie Secure/SameSite flags
APP_ENV=development

# Comma-separated list of frontend origins allowed by CORS
FRONTEND_ORIGIN=http://localhost:5173
```

Run: `cd backend && pytest -v`
Expected: PASS, no regressions in the pre-existing suite.

- [ ] **Step 7: Commit**

```bash
cd backend
git add pyproject.toml app/config.py tests/test_config.py .env.example
git commit -m "$(cat <<'EOF'
feat: add backend config module for auth and database env vars

Reads DATABASE_URL, GOOGLE_CLIENT_ID, JWT_SECRET, and FRONTEND_ORIGIN
via plain os.getenv, matching the codebase's existing config style.
EOF
)"
```

---

## Task 2: Database engine, ORM models, and Alembic migration

**Files:**
- Create: `backend/app/db.py`
- Create: `backend/app/models.py`
- Create: `backend/alembic.ini`
- Create: `backend/alembic/env.py`
- Create: `backend/alembic/script.py.mako`
- Create: `backend/alembic/versions/0001_initial.py`
- Test: `backend/tests/test_db.py`
- Test: `backend/tests/test_models.py`

**Interfaces:**
- Consumes: `app.config.get_settings` (Task 1).
- Produces: `app.db.Base` (declarative base), `app.db.get_db() -> Iterator[Session]` (FastAPI dependency), `app.models.User`, `app.models.Document` (ORM classes with fields per the spec's schema).

- [ ] **Step 1: Write the failing test for the URL-scheme rewrite**

Create `backend/tests/test_db.py`:

```python
from app.db import _to_sqlalchemy_url


def test_to_sqlalchemy_url_rewrites_postgres_scheme() -> None:
    assert _to_sqlalchemy_url("postgres://u:p@h/db") == "postgresql+psycopg://u:p@h/db"


def test_to_sqlalchemy_url_rewrites_postgresql_scheme() -> None:
    assert _to_sqlalchemy_url("postgresql://u:p@h/db") == "postgresql+psycopg://u:p@h/db"


def test_to_sqlalchemy_url_leaves_explicit_driver_untouched() -> None:
    assert _to_sqlalchemy_url("postgresql+psycopg://u:p@h/db") == "postgresql+psycopg://u:p@h/db"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && pytest tests/test_db.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'app.db'`

- [ ] **Step 3: Write `app/db.py`**

```python
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
        raise RuntimeError("DATABASE_URL is not set. Add it to backend/.env.")
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && pytest tests/test_db.py -v`
Expected: PASS (3 tests)

- [ ] **Step 5: Write the failing test for the ORM models**

Create `backend/tests/test_models.py`:

```python
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.db import Base
from app.models import Document, User


def _session():
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    return sessionmaker(bind=engine, expire_on_commit=False)()


def test_document_belongs_to_user_and_cascades_on_delete() -> None:
    session = _session()
    user = User(google_sub="sub-1", email="a@example.com", name="Ada")
    session.add(user)
    session.flush()

    document = Document(
        user_id=user.id, title="Triangle", schema_version=1, data={"objects": []}
    )
    session.add(document)
    session.commit()

    fetched = session.get(User, user.id)
    assert len(fetched.documents) == 1
    assert fetched.documents[0].title == "Triangle"

    session.delete(user)
    session.commit()
    assert session.get(Document, document.id) is None


def test_ids_are_generated_automatically() -> None:
    session = _session()
    user = User(google_sub="sub-2", email="b@example.com")
    session.add(user)
    session.commit()
    assert isinstance(user.id, str) and len(user.id) == 36
```

- [ ] **Step 6: Run test to verify it fails**

Run: `cd backend && pytest tests/test_models.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'app.models'`

- [ ] **Step 7: Write `app/models.py`**

```python
"""SQLAlchemy ORM models for persisted users and documents."""

from __future__ import annotations

import uuid
from datetime import datetime, timezone

from sqlalchemy import JSON, DateTime, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base


def new_id() -> str:
    return str(uuid.uuid4())


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class User(Base):
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    google_sub: Mapped[str] = mapped_column(String, unique=True, nullable=False, index=True)
    email: Mapped[str] = mapped_column(String, nullable=False)
    name: Mapped[str | None] = mapped_column(String, nullable=True)
    picture_url: Mapped[str | None] = mapped_column(String, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    last_login_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    documents: Mapped[list["Document"]] = relationship(
        back_populates="user", cascade="all, delete-orphan"
    )


class Document(Base):
    __tablename__ = "documents"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    user_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    title: Mapped[str] = mapped_column(String, nullable=False)
    schema_version: Mapped[int] = mapped_column(Integer, nullable=False)
    data: Mapped[dict] = mapped_column(JSON, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, onupdate=utcnow
    )

    user: Mapped["User"] = relationship(back_populates="documents")
```

- [ ] **Step 8: Run test to verify it passes**

Run: `cd backend && pytest tests/test_models.py -v`
Expected: PASS (2 tests)

- [ ] **Step 9: Set up Alembic and the initial migration**

Create `backend/alembic.ini`:

```ini
[alembic]
script_location = alembic

[loggers]
keys = root,sqlalchemy,alembic

[handlers]
keys = console

[formatters]
keys = generic

[logger_root]
level = WARN
handlers = console
qualname =

[logger_sqlalchemy]
level = WARN
handlers =
qualname = sqlalchemy.engine

[logger_alembic]
level = INFO
handlers =
qualname = alembic

[handler_console]
class = StreamHandler
args = (sys.stderr,)
level = NOTSET
formatter = generic

[formatter_generic]
format = %(levelname)-5.5s [%(name)s] %(message)s
datefmt = %H:%M:%S
```

Create `backend/alembic/script.py.mako` (Alembic's standard template, required by `alembic revision`):

```mako
"""${message}

Revision ID: ${up_revision}
Revises: ${down_revision | comma,n}
Create Date: ${create_date}

"""
from alembic import op
import sqlalchemy as sa
${imports if imports else ""}

# revision identifiers, used by Alembic.
revision = ${repr(up_revision)}
down_revision = ${repr(down_revision)}
branch_labels = ${repr(branch_labels)}
depends_on = ${repr(depends_on)}


def upgrade() -> None:
    ${upgrades if upgrades else "pass"}


def downgrade() -> None:
    ${downgrades if downgrades else "pass"}
```

Create `backend/alembic/env.py`:

```python
"""Alembic migration environment, wired to the app's SQLAlchemy models."""

from __future__ import annotations

from logging.config import fileConfig

from alembic import context
from sqlalchemy import engine_from_config, pool

import app.models  # noqa: F401  registers User/Document on Base.metadata
from app.config import get_settings
from app.db import Base, _to_sqlalchemy_url

config = context.config
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = Base.metadata


def _database_url() -> str:
    settings = get_settings()
    if not settings.database_url:
        raise RuntimeError("DATABASE_URL is not set. Add it to backend/.env.")
    return _to_sqlalchemy_url(settings.database_url)


def run_migrations_offline() -> None:
    context.configure(url=_database_url(), target_metadata=target_metadata, literal_binds=True)
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    configuration = config.get_section(config.config_ini_section) or {}
    configuration["sqlalchemy.url"] = _database_url()
    connectable = engine_from_config(configuration, prefix="sqlalchemy.", poolclass=pool.NullPool)
    with connectable.connect() as connection:
        context.configure(connection=connection, target_metadata=target_metadata)
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
```

Create `backend/alembic/versions/0001_initial.py`:

```python
"""initial users and documents tables

Revision ID: 0001_initial
Revises:
Create Date: 2026-07-08

"""

from alembic import op
import sqlalchemy as sa

revision = "0001_initial"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "users",
        sa.Column("id", sa.String(length=36), primary_key=True),
        sa.Column("google_sub", sa.String(), nullable=False, unique=True),
        sa.Column("email", sa.String(), nullable=False),
        sa.Column("name", sa.String(), nullable=True),
        sa.Column("picture_url", sa.String(), nullable=True),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
        sa.Column(
            "last_login_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
    )
    op.create_index("ix_users_google_sub", "users", ["google_sub"], unique=True)

    op.create_table(
        "documents",
        sa.Column("id", sa.String(length=36), primary_key=True),
        sa.Column(
            "user_id",
            sa.String(length=36),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("title", sa.String(), nullable=False),
        sa.Column("schema_version", sa.Integer(), nullable=False),
        sa.Column("data", sa.JSON(), nullable=False),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
    )
    op.create_index("ix_documents_user_id", "documents", ["user_id"])


def downgrade() -> None:
    op.drop_index("ix_documents_user_id", table_name="documents")
    op.drop_table("documents")
    op.drop_index("ix_users_google_sub", table_name="users")
    op.drop_table("users")
```

- [ ] **Step 10: Run the migration against the real Neon database**

```bash
cd backend && alembic upgrade head
```

Expected: prints `Running upgrade  -> 0001_initial, initial users and documents tables` and exits 0. Verify with `alembic current` showing `0001_initial (head)`.

- [ ] **Step 11: Run the full backend suite**

Run: `cd backend && pytest -v`
Expected: PASS, no regressions.

- [ ] **Step 12: Commit**

```bash
cd backend
git add app/db.py app/models.py alembic.ini alembic/ tests/test_db.py tests/test_models.py
git commit -m "$(cat <<'EOF'
feat: add SQLAlchemy engine, User/Document models, and initial migration

Sync SQLAlchemy over psycopg3, client-generated UUID primary keys, and
a generic JSON column so the test suite can run against in-memory
SQLite instead of the live Neon database.
EOF
)"
```

---

## Task 3: Auth utilities — session JWT and Google ID token verification

**Files:**
- Create: `backend/app/auth/__init__.py`
- Create: `backend/app/auth/jwt.py`
- Create: `backend/app/auth/google.py`
- Test: `backend/tests/test_auth_jwt.py`
- Test: `backend/tests/test_auth_google.py`

**Interfaces:**
- Consumes: `app.config.get_settings` (Task 1).
- Produces: `app.auth.jwt.issue_session_token(user_id: str) -> str`, `app.auth.jwt.verify_session_token(token: str) -> str` (returns user id), `app.auth.jwt.SessionTokenError`; `app.auth.google.verify_google_id_token(token: str) -> GoogleIdentity`, `app.auth.google.GoogleIdentity` (dataclass: `sub`, `email`, `name`, `picture_url`), `app.auth.google.GoogleTokenError`.

- [ ] **Step 1: Write the failing test for session JWTs**

Create `backend/tests/test_auth_jwt.py`:

```python
import time

import pytest

from app.auth.jwt import SessionTokenError, issue_session_token, verify_session_token


def test_issue_and_verify_round_trip() -> None:
    token = issue_session_token("user-123")
    assert verify_session_token(token) == "user-123"


def test_verify_rejects_tampered_token() -> None:
    token = issue_session_token("user-123")
    tampered = token[:-1] + ("A" if token[-1] != "A" else "B")
    with pytest.raises(SessionTokenError):
        verify_session_token(tampered)


def test_verify_rejects_expired_token(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("JWT_EXPIRE_DAYS", "0")
    token = issue_session_token("user-123")
    time.sleep(1.1)
    with pytest.raises(SessionTokenError):
        verify_session_token(token)
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && pytest tests/test_auth_jwt.py -v`
Expected: FAIL — no `app.auth` package yet.

- [ ] **Step 3: Write `app/auth/__init__.py` and `app/auth/jwt.py`**

Create `backend/app/auth/__init__.py`:

```python
"""Session and Google login package."""
```

Create `backend/app/auth/jwt.py`:

```python
"""Issuance and verification of GeoLab's own session JWT."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

import jwt

from app.config import get_settings


class SessionTokenError(Exception):
    """Raised when a session token is missing, malformed, or expired."""


def issue_session_token(user_id: str) -> str:
    settings = get_settings()
    if not settings.jwt_secret:
        raise RuntimeError("JWT_SECRET is not set. Add it to backend/.env.")
    now = datetime.now(timezone.utc)
    payload = {
        "sub": user_id,
        "iat": now,
        "exp": now + timedelta(days=settings.jwt_expire_days),
    }
    return jwt.encode(payload, settings.jwt_secret, algorithm="HS256")


def verify_session_token(token: str) -> str:
    """Return the user id encoded in a valid session token."""

    settings = get_settings()
    if not settings.jwt_secret:
        raise RuntimeError("JWT_SECRET is not set. Add it to backend/.env.")
    try:
        payload = jwt.decode(token, settings.jwt_secret, algorithms=["HS256"])
    except jwt.PyJWTError as error:
        raise SessionTokenError("Session token is invalid or expired.") from error
    subject = payload.get("sub")
    if not isinstance(subject, str) or not subject:
        raise SessionTokenError("Session token is missing a subject claim.")
    return subject
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && pytest tests/test_auth_jwt.py -v`
Expected: PASS (3 tests — the last one takes ~1.1s)

- [ ] **Step 5: Write the failing test for Google ID token verification**

Create `backend/tests/test_auth_google.py`:

```python
import pytest

import app.auth.google as google_auth
from app.auth.google import GoogleTokenError, verify_google_id_token


@pytest.fixture(autouse=True)
def _client_id(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("GOOGLE_CLIENT_ID", "test-client-id.apps.googleusercontent.com")


def test_verify_google_id_token_returns_identity_for_valid_claims(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(
        google_auth.google_id_token,
        "verify_oauth2_token",
        lambda *args, **kwargs: {
            "sub": "10769150350006150715",
            "email": "user@example.com",
            "name": "Ada Lovelace",
            "picture": "https://example.com/pic.jpg",
        },
    )

    identity = verify_google_id_token("fake-token")

    assert identity.sub == "10769150350006150715"
    assert identity.email == "user@example.com"
    assert identity.name == "Ada Lovelace"
    assert identity.picture_url == "https://example.com/pic.jpg"


def test_verify_google_id_token_wraps_invalid_token(monkeypatch: pytest.MonkeyPatch) -> None:
    def _raise(*args, **kwargs):
        raise ValueError("Token used too late")

    monkeypatch.setattr(google_auth.google_id_token, "verify_oauth2_token", _raise)

    with pytest.raises(GoogleTokenError):
        verify_google_id_token("expired-token")
```

- [ ] **Step 6: Run test to verify it fails**

Run: `cd backend && pytest tests/test_auth_google.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'app.auth.google'`

- [ ] **Step 7: Write `app/auth/google.py`**

```python
"""Verification of Google Identity Services ID tokens."""

from __future__ import annotations

from dataclasses import dataclass

from google.auth.transport import requests as google_requests
from google.oauth2 import id_token as google_id_token

from app.config import get_settings


class GoogleTokenError(Exception):
    """Raised when a Google ID token fails verification."""


@dataclass(frozen=True)
class GoogleIdentity:
    sub: str
    email: str
    name: str | None
    picture_url: str | None


def verify_google_id_token(token: str) -> GoogleIdentity:
    settings = get_settings()
    if not settings.google_client_id:
        raise RuntimeError("GOOGLE_CLIENT_ID is not set. Add it to backend/.env.")
    try:
        claims = google_id_token.verify_oauth2_token(
            token, google_requests.Request(), settings.google_client_id
        )
    except ValueError as error:
        raise GoogleTokenError("Google ID token is invalid or expired.") from error

    sub = claims.get("sub")
    email = claims.get("email")
    if not isinstance(sub, str) or not isinstance(email, str):
        raise GoogleTokenError("Google ID token is missing required claims.")
    return GoogleIdentity(
        sub=sub,
        email=email,
        name=claims.get("name"),
        picture_url=claims.get("picture"),
    )
```

- [ ] **Step 8: Run test to verify it passes**

Run: `cd backend && pytest tests/test_auth_google.py -v`
Expected: PASS (2 tests)

- [ ] **Step 9: Run the full backend suite and commit**

Run: `cd backend && pytest -v`
Expected: PASS, no regressions.

```bash
git add app/auth/__init__.py app/auth/jwt.py app/auth/google.py tests/test_auth_jwt.py tests/test_auth_google.py
git commit -m "$(cat <<'EOF'
feat: add session JWT issuance and Google ID token verification

Pure, dependency-injectable auth utilities: our own stateless session
JWT (PyJWT) and Google Identity Services token verification
(google-auth), each independently unit tested.
EOF
)"
```

---

## Task 4: Auth dependencies, router, and CORS/cookie wiring

**Files:**
- Create: `backend/app/auth/dependencies.py`
- Create: `backend/app/auth/schemas.py`
- Create: `backend/app/auth/router.py`
- Modify: `backend/app/main.py`
- Create: `backend/tests/conftest.py`
- Test: `backend/tests/test_auth_dependencies.py`
- Test: `backend/tests/test_api_auth.py`
- Test: `backend/tests/test_cors.py`

**Interfaces:**
- Consumes: `app.auth.jwt` and `app.auth.google` (Task 3), `app.db.get_db`, `app.models.User` (Task 2), `app.config.SESSION_COOKIE_NAME`, `get_settings` (Task 1).
- Produces: `app.auth.dependencies.get_current_user_optional`, `app.auth.dependencies.get_current_user` (FastAPI dependencies), `app.auth.router.router` (mounted at `/auth`), the `client` and `_auth_env` pytest fixtures in `conftest.py` used by every later API test file.

- [ ] **Step 1: Write the shared test fixtures**

Create `backend/tests/conftest.py`:

```python
"""Shared pytest fixtures: an isolated in-memory database per test."""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

import app.models  # noqa: F401  registers User/Document on Base.metadata
from app.db import Base, get_db
from app.main import app


@pytest.fixture(autouse=True)
def _auth_env(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("JWT_SECRET", "test-jwt-secret")
    monkeypatch.setenv("GOOGLE_CLIENT_ID", "test-client-id.apps.googleusercontent.com")


@pytest.fixture
def client() -> TestClient:
    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False})
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
```

- [ ] **Step 2: Write the failing tests for auth dependencies**

Create `backend/tests/test_auth_dependencies.py`:

```python
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
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd backend && pytest tests/test_auth_dependencies.py -v`
Expected: FAIL — `app.auth.dependencies` does not exist yet.

- [ ] **Step 4: Write `app/auth/dependencies.py`**

```python
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
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd backend && pytest tests/test_auth_dependencies.py -v`
Expected: PASS (5 tests)

- [ ] **Step 6: Write the failing tests for the `/auth` API**

Create `backend/tests/test_api_auth.py`:

```python
import app.auth.router as auth_router
from app.auth.google import GoogleIdentity, GoogleTokenError


def _identity(sub: str = "sub-1", email: str = "a@example.com", name: str = "Ada") -> GoogleIdentity:
    return GoogleIdentity(sub=sub, email=email, name=name, picture_url=None)


def test_google_login_creates_user_and_sets_cookie(client, monkeypatch) -> None:
    monkeypatch.setattr(auth_router, "verify_google_id_token", lambda token: _identity())

    response = client.post("/auth/google", json={"idToken": "fake"})

    assert response.status_code == 200
    body = response.json()
    assert body["email"] == "a@example.com"
    assert "geolab_session" in response.cookies


def test_google_login_upserts_existing_user_by_sub(client, monkeypatch) -> None:
    monkeypatch.setattr(auth_router, "verify_google_id_token", lambda token: _identity(name="Ada"))
    first = client.post("/auth/google", json={"idToken": "fake"})

    monkeypatch.setattr(
        auth_router, "verify_google_id_token", lambda token: _identity(name="Ada Lovelace")
    )
    second = client.post("/auth/google", json={"idToken": "fake"})

    assert first.json()["id"] == second.json()["id"]
    assert second.json()["name"] == "Ada Lovelace"


def test_google_login_rejects_invalid_token(client, monkeypatch) -> None:
    def _raise(token: str):
        raise GoogleTokenError("bad token")

    monkeypatch.setattr(auth_router, "verify_google_id_token", _raise)

    response = client.post("/auth/google", json={"idToken": "fake"})

    assert response.status_code == 401
    assert response.json()["detail"]["code"] == "invalid_google_token"


def test_me_returns_401_without_session(client) -> None:
    response = client.get("/auth/me")
    assert response.status_code == 401


def test_me_returns_profile_after_login(client, monkeypatch) -> None:
    monkeypatch.setattr(auth_router, "verify_google_id_token", lambda token: _identity())
    client.post("/auth/google", json={"idToken": "fake"})

    response = client.get("/auth/me")

    assert response.status_code == 200
    assert response.json()["email"] == "a@example.com"


def test_logout_clears_session(client, monkeypatch) -> None:
    monkeypatch.setattr(auth_router, "verify_google_id_token", lambda token: _identity())
    client.post("/auth/google", json={"idToken": "fake"})

    client.post("/auth/logout")
    response = client.get("/auth/me")

    assert response.status_code == 401
```

- [ ] **Step 7: Run test to verify it fails**

Run: `cd backend && pytest tests/test_api_auth.py -v`
Expected: FAIL — `app.auth.router` does not exist yet.

- [ ] **Step 8: Write `app/auth/schemas.py` and `app/auth/router.py`**

Create `backend/app/auth/schemas.py`:

```python
"""Request/response schemas for the auth endpoints."""

from __future__ import annotations

from app.geometry.models import GeometryModel


class GoogleLoginRequest(GeometryModel):
    id_token: str


class UserProfile(GeometryModel):
    id: str
    email: str
    name: str | None = None
    picture_url: str | None = None
```

Create `backend/app/auth/router.py`:

```python
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
```

- [ ] **Step 9: Wire CORS, cookies, and the auth router into `main.py`**

Read `backend/app/main.py` first to confirm current line numbers, then replace the CORS block and router includes. Modify `backend/app/main.py`:

```python
from app.agent.router import router as agent_router
from app.auth.router import router as auth_router
from app.config import get_settings
from app.geometry.router import router as geometry_router
from app.mcp_server import mcp, mcp_http_app
```

```python
settings = get_settings()

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.frontend_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["Mcp-Session-Id"],
)

app.include_router(geometry_router)
app.include_router(agent_router)
app.include_router(auth_router)
```

- [ ] **Step 10: Run test to verify it passes**

Run: `cd backend && pytest tests/test_api_auth.py -v`
Expected: PASS (6 tests)

- [ ] **Step 11: Write and run the CORS regression test**

Create `backend/tests/test_cors.py`:

```python
from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_cors_allows_the_default_frontend_origin() -> None:
    response = client.get("/health", headers={"Origin": "http://localhost:5173"})
    assert response.headers.get("access-control-allow-origin") == "http://localhost:5173"


def test_cors_rejects_an_unlisted_origin() -> None:
    response = client.get("/health", headers={"Origin": "http://evil.example"})
    assert "access-control-allow-origin" not in response.headers
```

Run: `cd backend && pytest tests/test_cors.py -v`
Expected: PASS (2 tests)

- [ ] **Step 12: Run the full backend suite and commit**

Run: `cd backend && pytest -v`
Expected: PASS, no regressions (CORS no longer uses `"*"`, so double-check no existing test or the frontend dev server relied on the wildcard — it didn't; the frontend always talks to the proxied same-origin paths in dev).

```bash
git add app/auth/dependencies.py app/auth/schemas.py app/auth/router.py app/main.py tests/conftest.py tests/test_auth_dependencies.py tests/test_api_auth.py tests/test_cors.py
git commit -m "$(cat <<'EOF'
feat: add Google login endpoints and session cookie handling

/auth/google verifies a Google ID token, upserts the user, and sets an
httpOnly session cookie; /auth/me and /auth/logout complete the cycle.
CORS now uses an explicit FRONTEND_ORIGIN allowlist instead of "*", a
prerequisite for credentialed cross-site cookies.
EOF
)"
```

---

## Task 5: Documents CRUD API

**Files:**
- Create: `backend/app/documents/__init__.py`
- Create: `backend/app/documents/schemas.py`
- Create: `backend/app/documents/router.py`
- Modify: `backend/app/main.py`
- Test: `backend/tests/test_api_documents.py`

**Interfaces:**
- Consumes: `app.auth.dependencies.get_current_user` (Task 4), `app.db.get_db`, `app.models.Document`, `app.models.User` (Task 2), `app.geometry.models.GeometryDocument`.
- Produces: `app.documents.router.router` (mounted at `/documents`).

- [ ] **Step 1: Write the failing tests**

Create `backend/tests/test_api_documents.py`:

```python
from fastapi.testclient import TestClient

import app.auth.router as auth_router
from app.auth.google import GoogleIdentity
from app.main import app


def _sample_document(doc_id: str = "doc-1") -> dict:
    return {"schemaVersion": 1, "id": doc_id, "title": "Triangle", "objects": []}


def _login(test_client: TestClient, monkeypatch, sub: str, email: str) -> None:
    monkeypatch.setattr(
        auth_router,
        "verify_google_id_token",
        lambda token: GoogleIdentity(sub=sub, email=email, name=None, picture_url=None),
    )
    test_client.post("/auth/google", json={"idToken": "fake"})


def test_list_documents_requires_authentication(client) -> None:
    response = client.get("/documents")
    assert response.status_code == 401


def test_create_list_get_update_delete_round_trip(client, monkeypatch) -> None:
    _login(client, monkeypatch, sub="user-a", email="a@example.com")

    create_response = client.post(
        "/documents", json={"title": "Triangle", "document": _sample_document()}
    )
    assert create_response.status_code == 201
    document_id = create_response.json()["id"]

    list_response = client.get("/documents")
    assert list_response.status_code == 200
    assert [item["id"] for item in list_response.json()] == [document_id]

    get_response = client.get(f"/documents/{document_id}")
    assert get_response.status_code == 200
    assert get_response.json()["document"]["id"] == "doc-1"

    update_response = client.put(f"/documents/{document_id}", json={"title": "Renamed"})
    assert update_response.status_code == 200
    assert update_response.json()["title"] == "Renamed"

    delete_response = client.delete(f"/documents/{document_id}")
    assert delete_response.status_code == 204

    missing_response = client.get(f"/documents/{document_id}")
    assert missing_response.status_code == 404


def test_get_unknown_document_returns_404(client, monkeypatch) -> None:
    _login(client, monkeypatch, sub="user-a", email="a@example.com")
    response = client.get("/documents/does-not-exist")
    assert response.status_code == 404


def test_documents_are_isolated_between_users(client, monkeypatch) -> None:
    _login(client, monkeypatch, sub="user-a", email="a@example.com")
    create_response = client.post(
        "/documents", json={"title": "Triangle", "document": _sample_document()}
    )
    document_id = create_response.json()["id"]

    other_client = TestClient(app)
    _login(other_client, monkeypatch, sub="user-b", email="b@example.com")

    assert other_client.get(f"/documents/{document_id}").status_code == 404
    assert other_client.put(f"/documents/{document_id}", json={"title": "Hijacked"}).status_code == 404
    assert other_client.delete(f"/documents/{document_id}").status_code == 404
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && pytest tests/test_api_documents.py -v`
Expected: FAIL — no `/documents` routes registered yet (404 on every call, or import error once schemas are referenced).

- [ ] **Step 3: Write `app/documents/schemas.py` and `app/documents/router.py`**

Create `backend/app/documents/__init__.py`:

```python
"""Cloud persistence for saved geometry documents."""
```

Create `backend/app/documents/schemas.py`:

```python
"""Request/response schemas for the saved-documents endpoints."""

from __future__ import annotations

from datetime import datetime

from app.geometry.models import GeometryDocument, GeometryModel


class SaveDocumentRequest(GeometryModel):
    title: str
    document: GeometryDocument


class UpdateDocumentRequest(GeometryModel):
    title: str | None = None
    document: GeometryDocument | None = None


class DocumentSummary(GeometryModel):
    id: str
    title: str
    updated_at: datetime


class DocumentDetail(GeometryModel):
    id: str
    title: str
    document: GeometryDocument
    updated_at: datetime
```

Create `backend/app/documents/router.py`:

```python
"""FastAPI routes for CRUD on saved geometry documents."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.auth.dependencies import get_current_user
from app.db import get_db
from app.documents.schemas import (
    DocumentDetail,
    DocumentSummary,
    SaveDocumentRequest,
    UpdateDocumentRequest,
)
from app.geometry.models import GeometryDocument
from app.models import Document, User

router = APIRouter(prefix="/documents", tags=["documents"])


def _summary(document: Document) -> DocumentSummary:
    return DocumentSummary(id=document.id, title=document.title, updated_at=document.updated_at)


def _detail(document: Document) -> DocumentDetail:
    return DocumentDetail(
        id=document.id,
        title=document.title,
        document=GeometryDocument.model_validate(document.data),
        updated_at=document.updated_at,
    )


def _get_owned_document(session: Session, user: User, document_id: str) -> Document:
    document = session.get(Document, document_id)
    if document is None or document.user_id != user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found.")
    return document


@router.get("", response_model=list[DocumentSummary])
def list_documents(
    user: User = Depends(get_current_user),
    session: Session = Depends(get_db),
) -> list[DocumentSummary]:
    documents = (
        session.query(Document)
        .filter_by(user_id=user.id)
        .order_by(Document.updated_at.desc())
        .all()
    )
    return [_summary(document) for document in documents]


@router.post("", response_model=DocumentDetail, status_code=status.HTTP_201_CREATED)
def create_document(
    request: SaveDocumentRequest,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_db),
) -> DocumentDetail:
    document = Document(
        user_id=user.id,
        title=request.title,
        schema_version=request.document.schema_version,
        data=request.document.model_dump(by_alias=True),
    )
    session.add(document)
    session.commit()
    session.refresh(document)
    return _detail(document)


@router.get("/{document_id}", response_model=DocumentDetail)
def get_document(
    document_id: str,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_db),
) -> DocumentDetail:
    return _detail(_get_owned_document(session, user, document_id))


@router.put("/{document_id}", response_model=DocumentDetail)
def update_document(
    document_id: str,
    request: UpdateDocumentRequest,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_db),
) -> DocumentDetail:
    document = _get_owned_document(session, user, document_id)
    if request.title is not None:
        document.title = request.title
    if request.document is not None:
        document.schema_version = request.document.schema_version
        document.data = request.document.model_dump(by_alias=True)
    session.commit()
    session.refresh(document)
    return _detail(document)


@router.delete("/{document_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_document(
    document_id: str,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_db),
) -> None:
    document = _get_owned_document(session, user, document_id)
    session.delete(document)
    session.commit()
```

- [ ] **Step 4: Wire the router into `main.py`**

Modify `backend/app/main.py`:

```python
from app.auth.router import router as auth_router
from app.documents.router import router as documents_router
```

```python
app.include_router(geometry_router)
app.include_router(agent_router)
app.include_router(auth_router)
app.include_router(documents_router)
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd backend && pytest tests/test_api_documents.py -v`
Expected: PASS (5 tests)

- [ ] **Step 6: Run the full backend suite and commit**

Run: `cd backend && pytest -v`
Expected: PASS, no regressions.

```bash
git add app/documents/ app/main.py tests/test_api_documents.py
git commit -m "$(cat <<'EOF'
feat: add documents CRUD API scoped to the authenticated user

List/create/get/update/delete saved geometry documents; every lookup
is scoped to the requesting user, returning 404 (not 403) for
documents owned by someone else.
EOF
)"
```

---

## Task 6: Frontend API clients (auth + documents)

**Files:**
- Create: `frontend/src/types/auth.ts`
- Create: `frontend/src/types/documents.ts`
- Create: `frontend/src/api/authApi.ts`
- Create: `frontend/src/api/documentsApi.ts`
- Test: `frontend/src/api/authApi.test.ts`
- Test: `frontend/src/api/documentsApi.test.ts`
- Modify: `frontend/vite.config.ts`
- Create: `frontend/.env.example`

**Interfaces:**
- Consumes: nothing new (types only reference `GeometryDocument` from `frontend/src/types/geometry.ts`).
- Produces: `UserProfile`, `DocumentSummary`, `DocumentDetail` types; `loginWithGoogle`, `fetchCurrentUser`, `logout`, `AuthError` from `authApi.ts`; `listDocuments`, `getDocument`, `createDocument`, `updateDocument`, `deleteDocument`, `DocumentsApiError` from `documentsApi.ts`.

- [ ] **Step 1: Add the new types**

Create `frontend/src/types/auth.ts`:

```typescript
export interface UserProfile {
  id: string;
  email: string;
  name: string | null;
  pictureUrl: string | null;
}
```

Create `frontend/src/types/documents.ts`:

```typescript
import type { GeometryDocument } from "./geometry";

export interface DocumentSummary {
  id: string;
  title: string;
  updatedAt: string;
}

export interface DocumentDetail {
  id: string;
  title: string;
  document: GeometryDocument;
  updatedAt: string;
}
```

- [ ] **Step 2: Write the failing test for `authApi`**

Create `frontend/src/api/authApi.test.ts`:

```typescript
import { afterEach, describe, expect, it, vi } from "vitest";

import { AuthError, fetchCurrentUser, loginWithGoogle, logout } from "./authApi";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("authApi", () => {
  it("returns the profile on successful google login", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({ id: "1", email: "a@example.com", name: "Ada", pictureUrl: null }),
        { status: 200 },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const profile = await loginWithGoogle("fake-id-token");

    expect(fetchMock).toHaveBeenCalledWith(
      "/auth/google",
      expect.objectContaining({ method: "POST", credentials: "include" }),
    );
    expect(profile.email).toBe("a@example.com");
  });

  it("returns null from fetchCurrentUser when unauthenticated", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 401 })));

    await expect(fetchCurrentUser()).resolves.toBeNull();
  });

  it("throws AuthError when google login fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 401 })));

    await expect(loginWithGoogle("bad-token")).rejects.toBeInstanceOf(AuthError);
  });

  it("resolves when logout succeeds", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 204 })));

    await expect(logout()).resolves.toBeUndefined();
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd frontend && npm run test -- src/api/authApi.test.ts`
Expected: FAIL — `./authApi` does not exist.

- [ ] **Step 4: Write `frontend/src/api/authApi.ts`**

```typescript
import type { UserProfile } from "../types/auth";

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "";

export class AuthError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "AuthError";
    this.status = status;
  }
}

export async function loginWithGoogle(idToken: string): Promise<UserProfile> {
  const response = await fetch(`${API_BASE}/auth/google`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ idToken }),
  });
  if (!response.ok) {
    throw new AuthError("Google login failed.", response.status);
  }
  return (await response.json()) as UserProfile;
}

export async function fetchCurrentUser(): Promise<UserProfile | null> {
  const response = await fetch(`${API_BASE}/auth/me`, { credentials: "include" });
  if (response.status === 401) {
    return null;
  }
  if (!response.ok) {
    throw new AuthError("Unable to fetch the current session.", response.status);
  }
  return (await response.json()) as UserProfile;
}

export async function logout(): Promise<void> {
  const response = await fetch(`${API_BASE}/auth/logout`, {
    method: "POST",
    credentials: "include",
  });
  if (!response.ok) {
    throw new AuthError("Logout failed.", response.status);
  }
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd frontend && npm run test -- src/api/authApi.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 6: Write the failing test for `documentsApi`**

Create `frontend/src/api/documentsApi.test.ts`:

```typescript
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  DocumentsApiError,
  createDocument,
  deleteDocument,
  getDocument,
  listDocuments,
  updateDocument,
} from "./documentsApi";

afterEach(() => {
  vi.unstubAllGlobals();
});

const sampleDocument = {
  schemaVersion: 1 as const,
  id: "doc-1",
  title: "Triangle",
  objects: [],
};

describe("documentsApi", () => {
  it("lists documents with credentials included", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify([{ id: "1", title: "A", updatedAt: "2026-01-01T00:00:00Z" }]),
        { status: 200 },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await listDocuments();

    expect(fetchMock).toHaveBeenCalledWith(
      "/documents",
      expect.objectContaining({ credentials: "include" }),
    );
    expect(result).toEqual([{ id: "1", title: "A", updatedAt: "2026-01-01T00:00:00Z" }]);
  });

  it("creates a document with the given title and payload", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          id: "1",
          title: "Triangle",
          document: sampleDocument,
          updatedAt: "2026-01-01T00:00:00Z",
        }),
        { status: 201 },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await createDocument("Triangle", sampleDocument);

    const [, init] = fetchMock.mock.calls[0];
    expect(JSON.parse(init.body as string)).toEqual({
      title: "Triangle",
      document: sampleDocument,
    });
    expect(result.id).toBe("1");
  });

  it("deletes a document and resolves without a body", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 204 })));

    await expect(deleteDocument("1")).resolves.toBeUndefined();
  });

  it("throws DocumentsApiError on a non-ok response", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 404 })));

    await expect(getDocument("missing")).rejects.toBeInstanceOf(DocumentsApiError);
  });

  it("sends partial updates for title-only changes", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          id: "1",
          title: "Renamed",
          document: sampleDocument,
          updatedAt: "2026-01-01T00:00:00Z",
        }),
        { status: 200 },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    await updateDocument("1", { title: "Renamed" });

    const [, init] = fetchMock.mock.calls[0];
    expect(JSON.parse(init.body as string)).toEqual({ title: "Renamed" });
  });
});
```

- [ ] **Step 7: Run test to verify it fails**

Run: `cd frontend && npm run test -- src/api/documentsApi.test.ts`
Expected: FAIL — `./documentsApi` does not exist.

- [ ] **Step 8: Write `frontend/src/api/documentsApi.ts`**

```typescript
import type { DocumentDetail, DocumentSummary } from "../types/documents";
import type { GeometryDocument } from "../types/geometry";

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "";

export class DocumentsApiError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "DocumentsApiError";
    this.status = status;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  if (!response.ok) {
    throw new DocumentsApiError(
      `Request to ${path} failed with status ${response.status}`,
      response.status,
    );
  }
  return response.status === 204 ? (undefined as T) : ((await response.json()) as T);
}

export function listDocuments(): Promise<DocumentSummary[]> {
  return request<DocumentSummary[]>("/documents");
}

export function getDocument(id: string): Promise<DocumentDetail> {
  return request<DocumentDetail>(`/documents/${id}`);
}

export function createDocument(
  title: string,
  document: GeometryDocument,
): Promise<DocumentDetail> {
  return request<DocumentDetail>("/documents", {
    method: "POST",
    body: JSON.stringify({ title, document }),
  });
}

export function updateDocument(
  id: string,
  changes: { title?: string; document?: GeometryDocument },
): Promise<DocumentDetail> {
  return request<DocumentDetail>(`/documents/${id}`, {
    method: "PUT",
    body: JSON.stringify(changes),
  });
}

export function deleteDocument(id: string): Promise<void> {
  return request<void>(`/documents/${id}`, { method: "DELETE" });
}
```

- [ ] **Step 9: Run test to verify it passes**

Run: `cd frontend && npm run test -- src/api/documentsApi.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 10: Update the Vite dev proxy and add `.env.example`**

Modify `frontend/vite.config.ts`:

```typescript
    proxy: {
      "/geometry": "http://127.0.0.1:8000",
      "/agent": "http://127.0.0.1:8000",
      "/auth": "http://127.0.0.1:8000",
      "/documents": "http://127.0.0.1:8000",
    },
```

Create `frontend/.env.example`:

```
VITE_API_BASE_URL=
VITE_GOOGLE_CLIENT_ID=
```

- [ ] **Step 11: Run the full frontend suite and typecheck**

Run: `cd frontend && npm run test && npm run typecheck`
Expected: PASS, no regressions.

- [ ] **Step 12: Commit**

```bash
cd frontend
git add src/types/auth.ts src/types/documents.ts src/api/authApi.ts src/api/documentsApi.ts \
  src/api/authApi.test.ts src/api/documentsApi.test.ts vite.config.ts .env.example
git commit -m "$(cat <<'EOF'
feat: add auth and documents API clients

Bare-fetch clients matching the existing geometryApi.ts style, both
always sending credentials: "include" so the session cookie reaches
the backend.
EOF
)"
```

---

## Task 7: Frontend auth UI (useAuth, GoogleSignInButton, AuthControl)

**Files:**
- Create: `frontend/src/auth/useAuth.ts`
- Create: `frontend/src/auth/useAuth.test.tsx`
- Create: `frontend/src/auth/GoogleSignInButton.tsx`
- Create: `frontend/src/auth/GoogleSignInButton.test.tsx`
- Create: `frontend/src/components/auth/AuthControl.tsx`
- Create: `frontend/src/components/auth/AuthControl.test.tsx`
- Modify: `frontend/src/App.tsx`

**Interfaces:**
- Consumes: `authApi.ts` (Task 6), `UserProfile` type.
- Produces: `useAuth() -> { user: UserProfile | null; loading: boolean; error: string | null; signIn(idToken: string): Promise<void>; signOut(): Promise<void> }`; `<GoogleSignInButton onCredential={(idToken: string) => void} />`; `<AuthControl user={...} onCredential={...} onSignOut={...} />`.

- [ ] **Step 1: Write the failing test for `useAuth`**

Create `frontend/src/auth/useAuth.test.tsx`:

```tsx
import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useAuth } from "./useAuth";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("useAuth", () => {
  it("restores the session from /auth/me on mount", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({ id: "1", email: "a@example.com", name: "Ada", pictureUrl: null }),
          { status: 200 },
        ),
      ),
    );

    const { result } = renderHook(() => useAuth());

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.user?.email).toBe("a@example.com");
  });

  it("stays signed out when there is no session", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 401 })));

    const { result } = renderHook(() => useAuth());

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.user).toBeNull();
  });

  it("signIn sets the user from a successful google login", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(new Response(null, { status: 401 }))
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({ id: "1", email: "a@example.com", name: "Ada", pictureUrl: null }),
            { status: 200 },
          ),
        ),
    );

    const { result } = renderHook(() => useAuth());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await result.current.signIn("fake-id-token");

    expect(result.current.user?.email).toBe("a@example.com");
  });

  it("signOut clears the user", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({ id: "1", email: "a@example.com", name: "Ada", pictureUrl: null }),
            { status: 200 },
          ),
        )
        .mockResolvedValueOnce(new Response(null, { status: 204 })),
    );

    const { result } = renderHook(() => useAuth());
    await waitFor(() => expect(result.current.user).not.toBeNull());

    await result.current.signOut();

    expect(result.current.user).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npm run test -- src/auth/useAuth.test.tsx`
Expected: FAIL — `./useAuth` does not exist.

- [ ] **Step 3: Write `frontend/src/auth/useAuth.ts`**

```typescript
import { useCallback, useEffect, useState } from "react";

import { fetchCurrentUser, loginWithGoogle, logout as logoutRequest } from "../api/authApi";
import type { UserProfile } from "../types/auth";

export interface UseAuthResult {
  user: UserProfile | null;
  loading: boolean;
  error: string | null;
  signIn: (idToken: string) => Promise<void>;
  signOut: () => Promise<void>;
}

export function useAuth(): UseAuthResult {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchCurrentUser()
      .then((profile) => {
        if (!cancelled) setUser(profile);
      })
      .catch(() => {
        if (!cancelled) setUser(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const signIn = useCallback(async (idToken: string) => {
    setError(null);
    try {
      const profile = await loginWithGoogle(idToken);
      setUser(profile);
    } catch {
      setError("Unable to sign in with Google.");
    }
  }, []);

  const signOut = useCallback(async () => {
    setError(null);
    try {
      await logoutRequest();
    } finally {
      setUser(null);
    }
  }, []);

  return { user, loading, error, signIn, signOut };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npm run test -- src/auth/useAuth.test.tsx`
Expected: PASS (4 tests)

- [ ] **Step 5: Write the failing test for `GoogleSignInButton`**

Create `frontend/src/auth/GoogleSignInButton.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { GoogleSignInButton } from "./GoogleSignInButton";

afterEach(() => {
  vi.unstubAllEnvs();
  delete (window as { google?: unknown }).google;
});

describe("GoogleSignInButton", () => {
  it("renders nothing when no Google client id is configured", () => {
    const { container } = render(<GoogleSignInButton onCredential={vi.fn()} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("initializes Google Identity Services and forwards the credential", () => {
    vi.stubEnv("VITE_GOOGLE_CLIENT_ID", "test-client-id");
    const initialize = vi.fn();
    const renderButton = vi.fn();
    (window as unknown as { google: unknown }).google = {
      accounts: { id: { initialize, renderButton } },
    };
    const onCredential = vi.fn();

    render(<GoogleSignInButton onCredential={onCredential} />);

    expect(initialize).toHaveBeenCalledWith(
      expect.objectContaining({ client_id: "test-client-id" }),
    );
    const callback = initialize.mock.calls[0][0].callback as (r: { credential: string }) => void;
    callback({ credential: "fake-jwt" });
    expect(onCredential).toHaveBeenCalledWith("fake-jwt");
  });
});
```

- [ ] **Step 6: Run test to verify it fails**

Run: `cd frontend && npm run test -- src/auth/GoogleSignInButton.test.tsx`
Expected: FAIL — `./GoogleSignInButton` does not exist.

- [ ] **Step 7: Write `frontend/src/auth/GoogleSignInButton.tsx`**

The Google client id is read **inside** the component body (not as a module-level constant), so `vi.stubEnv` in tests takes effect per render.

```tsx
import { useEffect, useRef } from "react";

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize(config: {
            client_id: string;
            callback: (response: { credential: string }) => void;
          }): void;
          renderButton(
            parent: HTMLElement,
            options: { theme: string; size: string; type: string },
          ): void;
        };
      };
    };
  }
}

const SCRIPT_SRC = "https://accounts.google.com/gsi/client";

interface GoogleSignInButtonProps {
  onCredential: (idToken: string) => void;
}

export function GoogleSignInButton({ onCredential }: GoogleSignInButtonProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID ?? "";

  useEffect(() => {
    if (googleClientId === "") {
      return;
    }

    let cancelled = false;

    const render = (): void => {
      if (cancelled || containerRef.current === null || window.google === undefined) {
        return;
      }
      window.google.accounts.id.initialize({
        client_id: googleClientId,
        callback: (response) => onCredential(response.credential),
      });
      window.google.accounts.id.renderButton(containerRef.current, {
        theme: "outline",
        size: "medium",
        type: "standard",
      });
    };

    if (window.google !== undefined) {
      render();
      return;
    }

    const existingScript = document.querySelector<HTMLScriptElement>(`script[src="${SCRIPT_SRC}"]`);
    const script = existingScript ?? document.createElement("script");
    script.src = SCRIPT_SRC;
    script.async = true;
    script.addEventListener("load", render);
    if (existingScript === null) {
      document.head.appendChild(script);
    }

    return () => {
      cancelled = true;
      script.removeEventListener("load", render);
    };
  }, [googleClientId, onCredential]);

  if (googleClientId === "") {
    return null;
  }

  return <div ref={containerRef} aria-label="Sign in with Google" />;
}
```

- [ ] **Step 8: Run test to verify it passes**

Run: `cd frontend && npm run test -- src/auth/GoogleSignInButton.test.tsx`
Expected: PASS (2 tests)

- [ ] **Step 9: Write the failing test for `AuthControl`**

Create `frontend/src/components/auth/AuthControl.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AuthControl } from "./AuthControl";

afterEach(() => {
  vi.unstubAllEnvs();
  delete (window as { google?: unknown }).google;
});

describe("AuthControl", () => {
  it("shows the Google sign-in button when signed out", () => {
    vi.stubEnv("VITE_GOOGLE_CLIENT_ID", "test-client-id");
    render(<AuthControl user={null} onCredential={vi.fn()} onSignOut={vi.fn()} />);
    expect(screen.getByLabelText("Sign in with Google")).toBeInTheDocument();
  });

  it("shows the account menu and signs out when signed in", async () => {
    const onSignOut = vi.fn();
    render(
      <AuthControl
        user={{ id: "1", email: "a@example.com", name: "Ada", pictureUrl: null }}
        onCredential={vi.fn()}
        onSignOut={onSignOut}
      />,
    );

    await userEvent.click(screen.getByRole("button", { name: "Account menu" }));
    await userEvent.click(screen.getByRole("menuitem", { name: "Sign out" }));

    expect(onSignOut).toHaveBeenCalled();
  });
});
```

- [ ] **Step 10: Run test to verify it fails**

Run: `cd frontend && npm run test -- src/components/auth/AuthControl.test.tsx`
Expected: FAIL — `./AuthControl` does not exist.

- [ ] **Step 11: Write `frontend/src/components/auth/AuthControl.tsx`**

```tsx
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { LogOut } from "lucide-react";

import { GoogleSignInButton } from "../../auth/GoogleSignInButton";
import type { UserProfile } from "../../types/auth";

interface AuthControlProps {
  user: UserProfile | null;
  onCredential: (idToken: string) => void;
  onSignOut: () => void;
}

export function AuthControl({ user, onCredential, onSignOut }: AuthControlProps) {
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [menuPos, setMenuPos] = useState<{ top: number; left: number }>({ top: 0, left: 0 });

  useEffect(() => {
    if (!open) {
      return;
    }
    const handlePointerDown = (event: MouseEvent): void => {
      const target = event.target as Node;
      const inMenu = menuRef.current?.contains(target) ?? false;
      const inButton = buttonRef.current?.contains(target) ?? false;
      if (!inMenu && !inButton) setOpen(false);
    };
    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [open]);

  if (user === null) {
    return <GoogleSignInButton onCredential={onCredential} />;
  }

  const handleToggle = (): void => {
    if (!open && buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      setMenuPos({ top: rect.top, left: rect.right + 8 });
    }
    setOpen((value) => !value);
  };

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        type="button"
        title={user.name ?? user.email}
        aria-label="Account menu"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={handleToggle}
        className="flex h-8 w-8 items-center justify-center overflow-hidden rounded-full border border-edge text-xs font-semibold text-content"
      >
        {user.pictureUrl !== null ? (
          <img
            src={user.pictureUrl}
            alt=""
            className="h-full w-full object-cover"
            referrerPolicy="no-referrer"
          />
        ) : (
          <span>{(user.name ?? user.email).charAt(0).toUpperCase()}</span>
        )}
      </button>

      {open
        ? createPortal(
            <div
              ref={menuRef}
              role="menu"
              aria-label="Account menu"
              style={{ position: "fixed", top: menuPos.top, left: menuPos.left }}
              className="z-50 w-52 overflow-hidden rounded-xl border border-edge bg-surface p-1.5 shadow-pop"
            >
              <div className="px-2.5 py-2 text-xs text-muted">
                <p className="truncate font-semibold text-content">{user.name ?? user.email}</p>
                <p className="truncate">{user.email}</p>
              </div>
              <div className="my-1 h-px bg-edge" role="separator" />
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setOpen(false);
                  onSignOut();
                }}
                className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm font-medium text-content transition-colors hover:bg-accent-soft hover:text-accent-soft-fg"
              >
                <LogOut size={16} aria-hidden />
                Sign out
              </button>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
```

- [ ] **Step 12: Run test to verify it passes**

Run: `cd frontend && npm run test -- src/components/auth/AuthControl.test.tsx`
Expected: PASS (2 tests)

- [ ] **Step 13: Wire `useAuth` and `AuthControl` into `App.tsx`**

Modify `frontend/src/App.tsx`. Add imports near the top, alongside the other component imports:

```tsx
import { AuthControl } from "./components/auth/AuthControl";
import { useAuth } from "./auth/useAuth";
```

Inside `export function App()`, right after `const { theme, toggleTheme } = useTheme();`, add:

```tsx
const auth = useAuth();
```

Right after the `useEffect` that clears `persistenceNotice` after 3 seconds, add an effect that surfaces auth errors through the same notice banner:

```tsx
useEffect(() => {
  if (auth.error !== null) {
    setPersistenceNotice({ message: null, error: auth.error });
  }
}, [auth.error]);
```

In `toolbarControls`, add `<AuthControl>` right before `<PersistenceControls>`:

```tsx
<AuthControl
  user={auth.user}
  onCredential={(idToken) => void auth.signIn(idToken)}
  onSignOut={() => void auth.signOut()}
/>
```

- [ ] **Step 14: Update `App.test.tsx` for the new hook**

`App.tsx` now calls `fetchCurrentUser()` on mount via `useAuth`, which means every existing test in `frontend/src/App.test.tsx` needs `fetch` to resolve for `/auth/me` too. Read `frontend/src/App.test.tsx` in full first. Every place it does `vi.stubGlobal("fetch", fetchMock)` with a single fixed response needs to instead route by URL, so `/auth/me` gets a 401 (guest) while the geometry/agent calls keep their existing responses. Wrap the existing mock logic like this pattern (adapt to each test's existing mock body):

```tsx
const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
  const url = typeof input === "string" ? input : input.toString();
  if (url === "/auth/me") {
    return Promise.resolve(new Response(null, { status: 401 }));
  }
  return originalMockImplementation(input, init); // the test's existing behavior
});
vi.stubGlobal("fetch", fetchMock);
```

Apply this to every test in the file that stubs `fetch` (there are multiple — check each `vi.stubGlobal("fetch", ...)` call site found earlier via `grep -n "stubGlobal" src/App.test.tsx`).

- [ ] **Step 15: Run the full frontend suite**

Run: `cd frontend && npm run test`
Expected: PASS, no regressions in `App.test.tsx` or elsewhere.

- [ ] **Step 16: Manual check in the browser**

```bash
cd backend && source .venv/bin/activate && uvicorn app.main:app --reload &
cd frontend && npm run dev
```

Open http://localhost:5173, confirm the Google sign-in button renders in the left toolbar strip (requires Task 0's `VITE_GOOGLE_CLIENT_ID` in `frontend/.env`), sign in, confirm the avatar + account menu appears, sign out, confirm it reverts to the sign-in button.

- [ ] **Step 17: Commit**

```bash
cd frontend
git add src/auth/ src/components/auth/ src/App.tsx src/App.test.tsx
git commit -m "$(cat <<'EOF'
feat: add Google sign-in UI wired into the construction toolbar

useAuth restores the session on load and exposes signIn/signOut;
GoogleSignInButton renders the official GIS button; AuthControl swaps
between the sign-in button and an avatar/account menu.
EOF
)"
```

---

## Task 8: Frontend cloud persistence UI

**Files:**
- Create: `frontend/src/persistence/useCloudDocuments.ts`
- Create: `frontend/src/persistence/useCloudDocuments.test.tsx`
- Create: `frontend/src/components/persistence/CloudDocumentsPanel.tsx`
- Create: `frontend/src/components/persistence/CloudDocumentsPanel.test.tsx`
- Modify: `frontend/src/components/persistence/PersistenceControls.tsx`
- Modify: `frontend/src/App.tsx`

**Interfaces:**
- Consumes: `documentsApi.ts` (Task 6), `useAuth` (Task 7).
- Produces: `useCloudDocuments(onUnauthorized: () => void) -> { panelOpen, documents, loading, error, cloudId, openPanel, closePanel, saveCurrent, saveAsNew, openDocument, renameDocument, deleteDocument }`; `<CloudDocumentsPanel>`; new optional props on `<PersistenceControls>`: `cloudEnabled?`, `onSaveToCloud?`, `onSaveAsNewToCloud?`, `onOpenCloudPanel?`.

- [ ] **Step 1: Write the failing test for `useCloudDocuments`**

Create `frontend/src/persistence/useCloudDocuments.test.tsx`:

```tsx
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useCloudDocuments } from "./useCloudDocuments";

afterEach(() => {
  vi.unstubAllGlobals();
});

const sampleDocument = {
  schemaVersion: 1 as const,
  id: "doc-1",
  title: "Triangle",
  objects: [],
};

describe("useCloudDocuments", () => {
  it("loads the document list when the panel opens", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify([{ id: "1", title: "A", updatedAt: "2026-01-01T00:00:00Z" }]), {
          status: 200,
        }),
      ),
    );

    const { result } = renderHook(() => useCloudDocuments(vi.fn()));
    act(() => result.current.openPanel());

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.documents).toHaveLength(1);
    expect(result.current.panelOpen).toBe(true);
  });

  it("saveAsNew stores the returned id as the current cloudId", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({ id: "new-id", title: "Triangle", document: sampleDocument, updatedAt: "2026-01-01T00:00:00Z" }),
          { status: 201 },
        ),
      ),
    );

    const { result } = renderHook(() => useCloudDocuments(vi.fn()));
    await act(async () => {
      await result.current.saveAsNew("Triangle", sampleDocument);
    });

    expect(result.current.cloudId).toBe("new-id");
  });

  it("deleteDocument clears cloudId when the deleted document was open", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ id: "1", title: "Triangle", document: sampleDocument, updatedAt: "2026-01-01T00:00:00Z" }),
          { status: 201 },
        ),
      )
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(new Response(JSON.stringify([]), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderHook(() => useCloudDocuments(vi.fn()));
    await act(async () => {
      await result.current.saveAsNew("Triangle", sampleDocument);
    });
    expect(result.current.cloudId).toBe("1");

    await act(async () => {
      await result.current.deleteDocument("1");
    });

    expect(result.current.cloudId).toBeNull();
  });

  it("calls onUnauthorized and sets an error on a 401 response", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 401 })));
    const onUnauthorized = vi.fn();

    const { result } = renderHook(() => useCloudDocuments(onUnauthorized));
    act(() => result.current.openPanel());

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(onUnauthorized).toHaveBeenCalled();
    expect(result.current.error).not.toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npm run test -- src/persistence/useCloudDocuments.test.tsx`
Expected: FAIL — `./useCloudDocuments` does not exist.

- [ ] **Step 3: Write `frontend/src/persistence/useCloudDocuments.ts`**

```typescript
import { useCallback, useState } from "react";

import {
  DocumentsApiError,
  createDocument,
  deleteDocument as deleteDocumentRequest,
  getDocument,
  listDocuments,
  updateDocument,
} from "../api/documentsApi";
import type { DocumentSummary } from "../types/documents";
import type { GeometryDocument } from "../types/geometry";

type ActionResult<T> = { ok: true; value: T } | { ok: false };

export interface UseCloudDocumentsResult {
  panelOpen: boolean;
  documents: DocumentSummary[];
  loading: boolean;
  error: string | null;
  cloudId: string | null;
  openPanel: () => void;
  closePanel: () => void;
  saveCurrent: (title: string, document: GeometryDocument) => Promise<void>;
  saveAsNew: (title: string, document: GeometryDocument) => Promise<void>;
  openDocument: (id: string) => Promise<GeometryDocument | null>;
  renameDocument: (id: string, title: string) => Promise<void>;
  deleteDocument: (id: string) => Promise<void>;
}

export function useCloudDocuments(onUnauthorized: () => void): UseCloudDocumentsResult {
  const [panelOpen, setPanelOpen] = useState(false);
  const [documents, setDocuments] = useState<DocumentSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cloudId, setCloudId] = useState<string | null>(null);

  const withErrorHandling = useCallback(
    async <T,>(action: () => Promise<T>): Promise<ActionResult<T>> => {
      try {
        const value = await action();
        return { ok: true, value };
      } catch (caughtError) {
        if (caughtError instanceof DocumentsApiError && caughtError.status === 401) {
          onUnauthorized();
          setError("Your session expired. Please sign in again.");
        } else {
          setError(caughtError instanceof Error ? caughtError.message : "Cloud request failed.");
        }
        return { ok: false };
      }
    },
    [onUnauthorized],
  );

  const refreshList = useCallback(async () => {
    setLoading(true);
    setError(null);
    const result = await withErrorHandling(() => listDocuments());
    if (result.ok) {
      setDocuments(result.value);
    }
    setLoading(false);
  }, [withErrorHandling]);

  const openPanel = useCallback(() => {
    setPanelOpen(true);
    void refreshList();
  }, [refreshList]);

  const closePanel = useCallback(() => setPanelOpen(false), []);

  const saveAsNew = useCallback(
    async (title: string, document: GeometryDocument) => {
      const result = await withErrorHandling(() => createDocument(title, document));
      if (result.ok) {
        setCloudId(result.value.id);
      }
    },
    [withErrorHandling],
  );

  const saveCurrent = useCallback(
    async (title: string, document: GeometryDocument) => {
      if (cloudId === null) {
        await saveAsNew(title, document);
        return;
      }
      await withErrorHandling(() => updateDocument(cloudId, { title, document }));
    },
    [cloudId, saveAsNew, withErrorHandling],
  );

  const openDocument = useCallback(
    async (id: string): Promise<GeometryDocument | null> => {
      const result = await withErrorHandling(() => getDocument(id));
      if (!result.ok) {
        return null;
      }
      setCloudId(result.value.id);
      setPanelOpen(false);
      return result.value.document;
    },
    [withErrorHandling],
  );

  const renameDocument = useCallback(
    async (id: string, title: string) => {
      const result = await withErrorHandling(() => updateDocument(id, { title }));
      if (result.ok) {
        await refreshList();
      }
    },
    [refreshList, withErrorHandling],
  );

  const deleteDocument = useCallback(
    async (id: string) => {
      const result = await withErrorHandling(() => deleteDocumentRequest(id));
      if (result.ok) {
        if (cloudId === id) {
          setCloudId(null);
        }
        await refreshList();
      }
    },
    [cloudId, refreshList, withErrorHandling],
  );

  return {
    panelOpen,
    documents,
    loading,
    error,
    cloudId,
    openPanel,
    closePanel,
    saveCurrent,
    saveAsNew,
    openDocument,
    renameDocument,
    deleteDocument,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npm run test -- src/persistence/useCloudDocuments.test.tsx`
Expected: PASS (4 tests)

- [ ] **Step 5: Write the failing test for `CloudDocumentsPanel`**

Create `frontend/src/components/persistence/CloudDocumentsPanel.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { CloudDocumentsPanel } from "./CloudDocumentsPanel";

const documents = [
  { id: "1", title: "Triangle", updatedAt: "2026-01-01T00:00:00Z" },
  { id: "2", title: "Circle proof", updatedAt: "2026-02-01T00:00:00Z" },
];

describe("CloudDocumentsPanel", () => {
  it("renders nothing when closed", () => {
    const { container } = render(
      <CloudDocumentsPanel
        open={false}
        documents={[]}
        loading={false}
        error={null}
        onClose={vi.fn()}
        onOpenDocument={vi.fn()}
        onRenameDocument={vi.fn()}
        onDeleteDocument={vi.fn()}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("lists documents and opens one on click", async () => {
    const onOpenDocument = vi.fn();
    render(
      <CloudDocumentsPanel
        open
        documents={documents}
        loading={false}
        error={null}
        onClose={vi.fn()}
        onOpenDocument={onOpenDocument}
        onRenameDocument={vi.fn()}
        onDeleteDocument={vi.fn()}
      />,
    );

    await userEvent.click(screen.getByText("Triangle"));

    expect(onOpenDocument).toHaveBeenCalledWith("1");
  });

  it("shows an empty state when there are no documents", () => {
    render(
      <CloudDocumentsPanel
        open
        documents={[]}
        loading={false}
        error={null}
        onClose={vi.fn()}
        onOpenDocument={vi.fn()}
        onRenameDocument={vi.fn()}
        onDeleteDocument={vi.fn()}
      />,
    );
    expect(screen.getByText("No saved documents yet.")).toBeInTheDocument();
  });

  it("deletes a document", async () => {
    const onDeleteDocument = vi.fn();
    render(
      <CloudDocumentsPanel
        open
        documents={documents}
        loading={false}
        error={null}
        onClose={vi.fn()}
        onOpenDocument={vi.fn()}
        onRenameDocument={vi.fn()}
        onDeleteDocument={onDeleteDocument}
      />,
    );

    await userEvent.click(screen.getByLabelText("Delete Triangle"));

    expect(onDeleteDocument).toHaveBeenCalledWith("1");
  });
});
```

- [ ] **Step 6: Run test to verify it fails**

Run: `cd frontend && npm run test -- src/components/persistence/CloudDocumentsPanel.test.tsx`
Expected: FAIL — `./CloudDocumentsPanel` does not exist.

- [ ] **Step 7: Write `frontend/src/components/persistence/CloudDocumentsPanel.tsx`**

```tsx
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Loader2, Pencil, Trash2, X } from "lucide-react";

import type { DocumentSummary } from "../../types/documents";

interface CloudDocumentsPanelProps {
  open: boolean;
  documents: DocumentSummary[];
  loading: boolean;
  error: string | null;
  onClose: () => void;
  onOpenDocument: (id: string) => void;
  onRenameDocument: (id: string, title: string) => void;
  onDeleteDocument: (id: string) => void;
}

export function CloudDocumentsPanel({
  open,
  documents,
  loading,
  error,
  onClose,
  onOpenDocument,
  onRenameDocument,
  onDeleteDocument,
}: CloudDocumentsPanelProps) {
  if (!open) {
    return null;
  }

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      role="dialog"
      aria-modal="true"
      aria-label="My documents"
    >
      <div className="flex max-h-[80vh] w-[28rem] flex-col overflow-hidden rounded-card border border-edge bg-surface shadow-pop">
        <div className="flex shrink-0 items-center justify-between border-b border-edge px-4 py-3">
          <h2 className="text-sm font-semibold text-content">My documents</h2>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="rounded-lg p-1 text-muted hover:bg-accent-soft"
          >
            <X size={16} aria-hidden />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-2">
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-6 text-sm text-muted">
              <Loader2 size={16} className="animate-spin" aria-hidden />
              Loading...
            </div>
          ) : error !== null ? (
            <p className="px-2 py-4 text-sm text-danger-fg" role="alert">
              {error}
            </p>
          ) : documents.length === 0 ? (
            <p className="px-2 py-4 text-sm text-muted">No saved documents yet.</p>
          ) : (
            <ul role="list" className="flex flex-col gap-1">
              {documents.map((document) => (
                <DocumentRow
                  key={document.id}
                  document={document}
                  onOpen={() => onOpenDocument(document.id)}
                  onRename={(title) => onRenameDocument(document.id, title)}
                  onDelete={() => onDeleteDocument(document.id)}
                />
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}

function DocumentRow({
  document,
  onOpen,
  onRename,
  onDelete,
}: {
  document: DocumentSummary;
  onOpen: () => void;
  onRename: (title: string) => void;
  onDelete: () => void;
}) {
  const [renaming, setRenaming] = useState(false);
  const [title, setTitle] = useState(document.title);

  useEffect(() => {
    setTitle(document.title);
  }, [document.title]);

  if (renaming) {
    return (
      <li className="flex items-center gap-2 rounded-lg px-2 py-1.5">
        <input
          autoFocus
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && title.trim() !== "") {
              onRename(title.trim());
              setRenaming(false);
            }
            if (event.key === "Escape") {
              setTitle(document.title);
              setRenaming(false);
            }
          }}
          className="flex-1 rounded-md border border-edge bg-surface px-2 py-1 text-sm text-content"
        />
        <button
          type="button"
          onClick={() => {
            if (title.trim() !== "") {
              onRename(title.trim());
            }
            setRenaming(false);
          }}
          className="rounded-md border border-edge px-2 py-1 text-xs font-medium text-content hover:bg-accent-soft"
        >
          Save
        </button>
      </li>
    );
  }

  return (
    <li className="group flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-accent-soft">
      <button type="button" onClick={onOpen} className="flex-1 truncate text-left text-sm text-content">
        {document.title}
        <span className="ml-2 text-xs text-muted">{new Date(document.updatedAt).toLocaleString()}</span>
      </button>
      <button
        type="button"
        aria-label={`Rename ${document.title}`}
        onClick={() => setRenaming(true)}
        className="rounded-md p-1 text-muted opacity-0 transition-opacity hover:bg-accent-soft group-hover:opacity-100"
      >
        <Pencil size={14} aria-hidden />
      </button>
      <button
        type="button"
        aria-label={`Delete ${document.title}`}
        onClick={onDelete}
        className="rounded-md p-1 text-muted opacity-0 transition-opacity hover:bg-danger-soft hover:text-danger-fg group-hover:opacity-100"
      >
        <Trash2 size={14} aria-hidden />
      </button>
    </li>
  );
}
```

- [ ] **Step 8: Run test to verify it passes**

Run: `cd frontend && npm run test -- src/components/persistence/CloudDocumentsPanel.test.tsx`
Expected: PASS (4 tests)

- [ ] **Step 9: Extend `PersistenceControls` with cloud actions**

Read `frontend/src/components/persistence/PersistenceControls.tsx` first (already read during planning — icons `Save`, `FolderOpen`, `Download`, `Upload`, `FileCode`, `Trash2` come from `lucide-react`). Modify the props interface:

```tsx
interface PersistenceControlsProps {
  message: string | null;
  error: string | null;
  onSave: () => void;
  onLoad: () => void;
  onClear: () => void;
  onExportJson: () => void;
  onImportJson: (serialized: string) => void;
  onImportError: (error: Error) => void;
  onExportScript: () => void;
  /** Lado hacia el que se abre el menú desplegable. Por defecto "right" (abre hacia la derecha). */
  menuSide?: "right" | "left";
  cloudEnabled?: boolean;
  onSaveToCloud?: () => void;
  onSaveAsNewToCloud?: () => void;
  onOpenCloudPanel?: () => void;
}
```

Update the import line to add three icons:

```tsx
import {
  ChevronDown,
  Copy,
  Download,
  DownloadCloud,
  FileCode,
  FolderOpen,
  Save,
  Trash2,
  Upload,
  UploadCloud,
} from "lucide-react";
```

Update the function signature to destructure the new props:

```tsx
export function PersistenceControls({
  message,
  error,
  onSave,
  onLoad,
  onClear,
  onExportJson,
  onImportJson,
  onImportError,
  onExportScript,
  menuSide = "right",
  cloudEnabled = false,
  onSaveToCloud,
  onSaveAsNewToCloud,
  onOpenCloudPanel,
}: PersistenceControlsProps) {
```

Insert a new conditional block right after the `Export Script` `MenuItem` and before the separator that precedes `Clear`:

```tsx
          <MenuItem icon={<FileCode size={16} aria-hidden />} onClick={() => run(onExportScript)}>
            Export Script
          </MenuItem>
          {cloudEnabled ? (
            <>
              <div className="my-1 h-px bg-edge" role="separator" />
              <MenuItem
                icon={<UploadCloud size={16} aria-hidden />}
                onClick={() => run(() => onSaveToCloud?.())}
              >
                Save to cloud
              </MenuItem>
              <MenuItem
                icon={<Copy size={16} aria-hidden />}
                onClick={() => run(() => onSaveAsNewToCloud?.())}
              >
                Save as new...
              </MenuItem>
              <MenuItem
                icon={<DownloadCloud size={16} aria-hidden />}
                onClick={() => run(() => onOpenCloudPanel?.())}
              >
                Open from cloud
              </MenuItem>
            </>
          ) : null}
          <div className="my-1 h-px bg-edge" role="separator" />
```

Remove the now-duplicated separator that used to sit directly before `Clear` (there was exactly one `<div className="my-1 h-px bg-edge" role="separator" />` before the `Clear` `MenuItem` — it's now been moved above; do not leave two in a row).

- [ ] **Step 10: Add a test for the new cloud menu items in `PersistenceControls`**

Find `frontend/src/components/persistence/PersistenceControls.test.tsx` if it exists; if not, this component has been tested only via `App.test.tsx` so far — add a focused new test file `frontend/src/components/persistence/PersistenceControls.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { PersistenceControls } from "./PersistenceControls";

const baseProps = {
  message: null,
  error: null,
  onSave: vi.fn(),
  onLoad: vi.fn(),
  onClear: vi.fn(),
  onExportJson: vi.fn(),
  onImportJson: vi.fn(),
  onImportError: vi.fn(),
  onExportScript: vi.fn(),
};

describe("PersistenceControls cloud actions", () => {
  it("hides cloud menu items when cloudEnabled is false", async () => {
    render(<PersistenceControls {...baseProps} />);
    await userEvent.click(screen.getByRole("button", { name: "Construction actions" }));
    expect(screen.queryByRole("menuitem", { name: "Save to cloud" })).not.toBeInTheDocument();
  });

  it("shows cloud menu items and triggers callbacks when cloudEnabled is true", async () => {
    const onSaveToCloud = vi.fn();
    const onSaveAsNewToCloud = vi.fn();
    const onOpenCloudPanel = vi.fn();
    render(
      <PersistenceControls
        {...baseProps}
        cloudEnabled
        onSaveToCloud={onSaveToCloud}
        onSaveAsNewToCloud={onSaveAsNewToCloud}
        onOpenCloudPanel={onOpenCloudPanel}
      />,
    );

    await userEvent.click(screen.getByRole("button", { name: "Construction actions" }));
    await userEvent.click(screen.getByRole("menuitem", { name: "Save to cloud" }));
    expect(onSaveToCloud).toHaveBeenCalled();

    await userEvent.click(screen.getByRole("button", { name: "Construction actions" }));
    await userEvent.click(screen.getByRole("menuitem", { name: "Open from cloud" }));
    expect(onOpenCloudPanel).toHaveBeenCalled();
  });
});
```

- [ ] **Step 11: Run test to verify it passes**

Run: `cd frontend && npm run test -- src/components/persistence/PersistenceControls.test.tsx`
Expected: PASS (2 tests)

- [ ] **Step 12: Wire `useCloudDocuments` and `CloudDocumentsPanel` into `App.tsx`**

Modify `frontend/src/App.tsx`. Add imports:

```tsx
import { CloudDocumentsPanel } from "./components/persistence/CloudDocumentsPanel";
import { useCloudDocuments } from "./persistence/useCloudDocuments";
```

Right after `const auth = useAuth();`, add:

```tsx
const cloud = useCloudDocuments(() => void auth.signOut());
```

Add three handlers near `handleExportScript`:

```tsx
const handleSaveToCloud = useCallback(() => {
  if (cloud.cloudId !== null) {
    void cloud.saveCurrent(geometry.document.title, currentDocument());
    return;
  }
  const title = window.prompt("Title for this construction:", geometry.document.title);
  if (title !== null && title.trim() !== "") {
    void cloud.saveAsNew(title.trim(), currentDocument());
  }
}, [cloud, currentDocument, geometry.document.title]);

const handleSaveAsNewToCloud = useCallback(() => {
  const title = window.prompt("Title for the new construction:", geometry.document.title);
  if (title !== null && title.trim() !== "") {
    void cloud.saveAsNew(title.trim(), currentDocument());
  }
}, [cloud, currentDocument, geometry.document.title]);

const handleOpenCloudDocument = useCallback(
  (id: string) => {
    void (async () => {
      const document = await cloud.openDocument(id);
      if (document !== null) {
        replaceConstruction(document);
        setPersistenceNotice({ message: "Cloud construction loaded.", error: null });
      }
    })();
  },
  [cloud, replaceConstruction],
);
```

Update the `<PersistenceControls>` element in `toolbarControls`:

```tsx
<PersistenceControls
  message={persistenceNotice.message}
  error={persistenceNotice.error}
  onSave={handleSave}
  onLoad={handleLoad}
  onClear={handleClear}
  onExportJson={handleExportJson}
  onImportJson={handleImportJson}
  onImportError={reportPersistenceError}
  onExportScript={handleExportScript}
  menuSide="right"
  cloudEnabled={auth.user !== null}
  onSaveToCloud={handleSaveToCloud}
  onSaveAsNewToCloud={handleSaveAsNewToCloud}
  onOpenCloudPanel={cloud.openPanel}
/>
```

Right after the closing tag of the floating right panel `</div>` (the one holding `SidebarTabs`), before the outermost closing `</div>` of the component, add:

```tsx
<CloudDocumentsPanel
  open={cloud.panelOpen}
  documents={cloud.documents}
  loading={cloud.loading}
  error={cloud.error}
  onClose={cloud.closePanel}
  onOpenDocument={handleOpenCloudDocument}
  onRenameDocument={(id, title) => void cloud.renameDocument(id, title)}
  onDeleteDocument={(id) => void cloud.deleteDocument(id)}
/>
```

- [ ] **Step 13: Run the full frontend suite and typecheck**

Run: `cd frontend && npm run test && npm run typecheck`
Expected: PASS, no regressions. If `App.test.tsx`'s fetch mocks (updated in Task 7 Step 14) don't already return a default response for `/documents`, add a fallback in that same routing mock: unmatched URLs fall through to the test's original response as already arranged.

- [ ] **Step 14: Manual check in the browser**

With both dev servers running (Task 7 Step 16), sign in with Google, use "Save as new..." to save a construction with a title, use "Open from cloud" to confirm it lists and reopens correctly, rename it, delete it, and confirm signing out hides the cloud menu items again.

- [ ] **Step 15: Commit**

```bash
cd frontend
git add src/persistence/useCloudDocuments.ts src/persistence/useCloudDocuments.test.tsx \
  src/components/persistence/CloudDocumentsPanel.tsx src/components/persistence/CloudDocumentsPanel.test.tsx \
  src/components/persistence/PersistenceControls.tsx src/components/persistence/PersistenceControls.test.tsx \
  src/App.tsx
git commit -m "$(cat <<'EOF'
feat: add cloud save/open/rename/delete UI for signed-in users

PersistenceControls gains three cloud menu items (gated on
cloudEnabled), CloudDocumentsPanel lists saved constructions, and
useCloudDocuments orchestrates the API calls, falling back to guest
mode on a 401.
EOF
)"
```

---

## Task 9: Manual end-to-end verification (no code)

- [ ] **Step 1: Full login round-trip**

With Task 0 completed (`GOOGLE_CLIENT_ID` / `JWT_SECRET` / `FRONTEND_ORIGIN` in `backend/.env`, `VITE_GOOGLE_CLIENT_ID` in `frontend/.env`) and both dev servers running, open http://localhost:5173 in a real browser, click the Google sign-in button, complete the real Google login, and confirm:
- The avatar and account menu replace the sign-in button.
- Reloading the page keeps the session (no need to sign in again).
- Signing out reverts to the sign-in button and hides the cloud menu items.

- [ ] **Step 2: Cloud persistence round-trip**

While signed in: build a small construction, "Save as new..." with a title, refresh the page, "Open from cloud" and confirm the same construction loads with the same objects. Rename it from the panel, delete it, and confirm it disappears from the list.

- [ ] **Step 3: Guest mode is unaffected**

Sign out (or open an incognito window without signing in) and confirm the app behaves exactly as before this feature: localStorage autosave, export/import JSON, and no cloud menu items visible.

- [ ] **Step 4: Verify the Neon database directly**

```bash
cd backend && source .venv/bin/activate
python -c "
from sqlalchemy import text
from app.db import get_session_factory
session = get_session_factory()()
print(session.execute(text('select email, created_at from users')).fetchall())
print(session.execute(text('select title, updated_at from documents')).fetchall())
"
```

Expected: the user and documents created during Steps 1–2 are present.

---

## Final check across the whole feature

- [ ] Run `cd backend && ruff check app tests && pytest -v` — all green.
- [ ] Run `cd frontend && npm run typecheck && npm run test` — all green.
- [ ] Confirm `git log --oneline main..feature/google-auth-persistence` shows one commit per task above.
- [ ] Once satisfied, use the superpowers:finishing-a-development-branch skill to decide how to merge/PR this branch.

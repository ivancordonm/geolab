"""Checks that the versioned migrations build the schema used by the models."""

from pathlib import Path

from alembic import command
from alembic.autogenerate import compare_metadata
from alembic.config import Config
from alembic.runtime.migration import MigrationContext
from alembic.script import ScriptDirectory
from sqlalchemy import create_engine, text

import app.models  # noqa: F401  registers User/Document on Base.metadata
from app.db import Base

BACKEND_ROOT = Path(__file__).resolve().parents[1]


def test_alembic_upgrade_head_matches_model_schema(tmp_path, monkeypatch) -> None:
    database_url = f"sqlite:///{tmp_path / 'migrations.sqlite3'}"
    monkeypatch.setenv("STORAGE_DATABASE_URL", database_url)

    config = Config(str(BACKEND_ROOT / "alembic.ini"))
    config.set_main_option("script_location", str(BACKEND_ROOT / "alembic"))
    head = ScriptDirectory.from_config(config).get_current_head()
    command.upgrade(config, "head")

    engine = create_engine(database_url)
    with engine.connect() as connection:
        current = connection.execute(text("SELECT version_num FROM alembic_version")).scalar_one()
        schema_diff = compare_metadata(MigrationContext.configure(connection), Base.metadata)

    assert current == head
    assert schema_diff == []

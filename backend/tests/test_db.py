from app.db import _to_sqlalchemy_url


def test_to_sqlalchemy_url_rewrites_postgres_scheme() -> None:
    assert _to_sqlalchemy_url("postgres://u:p@h/db") == "postgresql+psycopg://u:p@h/db"


def test_to_sqlalchemy_url_rewrites_postgresql_scheme() -> None:
    assert _to_sqlalchemy_url("postgresql://u:p@h/db") == "postgresql+psycopg://u:p@h/db"


def test_to_sqlalchemy_url_leaves_explicit_driver_untouched() -> None:
    assert _to_sqlalchemy_url("postgresql+psycopg://u:p@h/db") == "postgresql+psycopg://u:p@h/db"

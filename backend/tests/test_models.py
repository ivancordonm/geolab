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

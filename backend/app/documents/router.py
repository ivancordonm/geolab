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
    geometry_document = GeometryDocument.model_validate(document.data).model_copy(
        update={"title": document.title}
    )
    return DocumentDetail(
        id=document.id,
        title=document.title,
        document=geometry_document,
        updated_at=document.updated_at,
    )


def _document_data(document: GeometryDocument, title: str) -> dict:
    """Serialize a geometry document with the database row title as canonical."""

    return document.model_copy(update={"title": title}).model_dump(by_alias=True)


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
        data=_document_data(request.document, request.title),
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
        document.data = _document_data(request.document, document.title)
    elif request.title is not None:
        stored_document = GeometryDocument.model_validate(document.data)
        document.data = _document_data(stored_document, document.title)
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

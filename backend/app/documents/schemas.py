"""Request/response schemas for the saved-documents endpoints."""

from __future__ import annotations

from datetime import datetime

from pydantic import field_validator

from app.geometry.models import GeometryDocument, GeometryModel


class SaveDocumentRequest(GeometryModel):
    title: str
    document: GeometryDocument

    @field_validator("title")
    @classmethod
    def title_must_not_be_blank(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("must not be blank")
        return value.strip()


class UpdateDocumentRequest(GeometryModel):
    title: str | None = None
    document: GeometryDocument | None = None

    @field_validator("title")
    @classmethod
    def title_must_not_be_blank(cls, value: str | None) -> str | None:
        if value is None:
            return None
        if not value.strip():
            raise ValueError("must not be blank")
        return value.strip()


class DocumentSummary(GeometryModel):
    id: str
    title: str
    updated_at: datetime


class DocumentDetail(GeometryModel):
    id: str
    title: str
    document: GeometryDocument
    updated_at: datetime
    shared: bool = False


class ShareResponse(GeometryModel):
    token: str


class PublicDocument(GeometryModel):
    title: str
    document: GeometryDocument
    updated_at: datetime

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

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

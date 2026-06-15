"""Public API request and response schemas."""

from pydantic import Field

from app.geometry.models import EvaluatedValue, GeometryDocument, GeometryModel


class EvaluateScriptRequest(GeometryModel):
    script: str = Field(min_length=1)
    document_id: str = "script_document"
    title: str = "Script construction"


class EvaluateScriptResponse(GeometryModel):
    document: GeometryDocument
    values: dict[str, EvaluatedValue]


class ScriptErrorDetail(GeometryModel):
    code: str
    message: str
    line: int = Field(ge=1)
    column: int = Field(ge=1)
    source_line: str

__all__ = [
    "EvaluateScriptRequest",
    "EvaluateScriptResponse",
    "GeometryDocument",
    "ScriptErrorDetail",
]

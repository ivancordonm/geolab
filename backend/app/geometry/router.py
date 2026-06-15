"""FastAPI routes for deterministic geometry operations."""

from fastapi import APIRouter, HTTPException, status

from app.geometry.script import ConstructionScriptError, evaluate_script
from app.agent.models import GraphView
from app.agent.tools import graph_view_from_access_map
from app.schemas import EvaluateScriptRequest, EvaluateScriptResponse, ScriptErrorDetail
from app.services import geometry_workspace

router = APIRouter(prefix="/geometry", tags=["geometry"])


@router.get("/graph", response_model=GraphView)
def get_current_graph() -> GraphView:
    """Return a detached read-only snapshot of the current agent workspace."""

    return graph_view_from_access_map(geometry_workspace.graph_access_map())


@router.post("/evaluate-script", response_model=EvaluateScriptResponse)
def evaluate_construction_script(request: EvaluateScriptRequest) -> EvaluateScriptResponse:
    """Convert a construction script into a validated document and evaluated values."""

    try:
        document, values = evaluate_script(
            request.script,
            document_id=request.document_id,
            title=request.title,
        )
    except ConstructionScriptError as error:
        diagnostic = error.diagnostic
        detail = ScriptErrorDetail(
            code=diagnostic.code,
            message=diagnostic.message,
            line=diagnostic.line,
            column=diagnostic.column,
            source_line=diagnostic.source_line,
        )
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=detail.model_dump(by_alias=True),
        ) from error

    return EvaluateScriptResponse(document=document, values=values)

"""FastAPI routes for deterministic geometry operations."""

from fastapi import APIRouter, HTTPException, status

from app.geometry.script import ConstructionScriptError, evaluate_script
from app.agent.models import GraphRequest, GraphResponse
from app.agent.tools import graph_view_from_access_map
from app.geometry.workspace import GeometryWorkspace
from app.schemas import EvaluateScriptRequest, EvaluateScriptResponse, ScriptErrorDetail

router = APIRouter(prefix="/geometry", tags=["geometry"])


@router.post("/graph", response_model=GraphResponse)
def get_current_graph(request: GraphRequest) -> GraphResponse:
    """Evaluate *request.document* and return a read-only graph snapshot.

    Stateless: builds a fresh workspace per request instead of reading or
    mutating any process-global state.
    """

    workspace = (
        GeometryWorkspace(request.document) if request.document is not None else GeometryWorkspace()
    )
    return GraphResponse(
        graph=graph_view_from_access_map(workspace.graph_access_map()),
        document=workspace.document_snapshot(),
    )


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

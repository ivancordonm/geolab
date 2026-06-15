"""HTTP adapter for discovery and execution of deterministic agent tools."""

from fastapi import APIRouter, HTTPException, status

from app.agent.models import ExecuteToolRequest, ExecuteToolResponse, ToolDescriptor
from app.agent.planner import PlannerError, ProviderTimeoutError, UnsupportedRequestError
from app.agent.registry import (
    InvalidToolInputError,
    ToolExecutionError,
    UnknownToolError,
)
from app.agent.schemas import AgentPlanErrorDetail, AgentPlanRequest, AgentResponse
from app.services import create_planner, tool_registry

router = APIRouter(prefix="/agent", tags=["agent"])


@router.post("/plan", response_model=AgentResponse)
def plan_construction(request: AgentPlanRequest) -> AgentResponse:
    """Generate and validate a script proposal without mutating geometry state."""
    planner = create_planner(request.config)
    try:
        return planner.generate_plan(request.user_request, request.current_script)
    except UnsupportedRequestError as error:
        detail = AgentPlanErrorDetail(code="unsupported_request", message=str(error))
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=detail.model_dump(by_alias=True),
        ) from error
    except ProviderTimeoutError as error:
        detail = AgentPlanErrorDetail(code="provider_timeout", message=str(error))
        raise HTTPException(
            status_code=status.HTTP_504_GATEWAY_TIMEOUT,
            detail=detail.model_dump(by_alias=True),
        ) from error
    except PlannerError as error:
        detail = AgentPlanErrorDetail(code="planning_failed", message=str(error))
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=detail.model_dump(by_alias=True),
        ) from error


@router.get("/tools", response_model=list[ToolDescriptor])
def list_tools() -> tuple[ToolDescriptor, ...]:
    """Return JSON-schema tool descriptors suitable for a future LLM adapter."""
    return tool_registry.descriptors()


@router.post("/execute-tool", response_model=ExecuteToolResponse)
def execute_tool(request: ExecuteToolRequest) -> ExecuteToolResponse:
    """Validate and execute one deterministic tool call."""
    try:
        definition, output = tool_registry.execute(request.tool_name, request.arguments)
    except UnknownToolError as error:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "unknown_tool", "message": str(error)},
        ) from error
    except InvalidToolInputError as error:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail={
                "code": "invalid_tool_arguments",
                "message": str(error),
                "errors": error.errors,
            },
        ) from error
    except ToolExecutionError as error:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail={"code": "tool_execution_failed", "message": str(error)},
        ) from error

    return ExecuteToolResponse(
        tool_name=definition.name,
        mutates_geometry_state=definition.mutates_geometry_state,
        output=output.model_dump(by_alias=True),
    )

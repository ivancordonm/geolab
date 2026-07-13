"""Schemas for deterministic agent planning."""

from typing import Any, Literal

from pydantic import Field

from app.geometry.models import GeometryDocument, GeometryModel


class ProviderConfig(GeometryModel):
    provider: Literal["huggingface", "openai", "nvidia"]
    model: str = Field(min_length=1)
    base_url: str = Field(min_length=1)
    api_key: str = ""
    temperature: float = Field(default=1.0, ge=0, le=2)


class AgentPlanRequest(GeometryModel):
    user_request: str = Field(min_length=1, max_length=1000)
    current_script: str | None = None
    config: ProviderConfig | None = None


class AgentResponse(GeometryModel):
    reasoning: str
    plan: list[str]
    generated_script: str
    warnings: list[str] = Field(default_factory=list)


class AgentPlanErrorDetail(GeometryModel):
    code: str
    message: str


class ToolCallProposal(GeometryModel):
    """One proposed native tool call: a tool name plus its validated arguments.

    A proposal is *not* an execution. The caller applies each call one at a time
    through ``/agent/execute-tool``, which is the sole authority for mutation.
    """

    tool_name: str
    arguments: dict[str, Any] = Field(default_factory=dict)


class ToolCallPlanRequest(GeometryModel):
    """Request for tool-calling planning against an optional starting document."""

    user_request: str = Field(min_length=1, max_length=1000)
    document: GeometryDocument | None = None


class ToolCallPlanResult(GeometryModel):
    """An ordered sequence of proposed tool calls plus the model's reasoning."""

    reasoning: str
    tool_calls: list[ToolCallProposal]

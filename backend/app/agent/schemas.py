"""Schemas for deterministic agent planning."""

from typing import Literal

from pydantic import Field

from app.geometry.models import GeometryModel


class ProviderConfig(GeometryModel):
    provider: Literal["ollama", "openai", "nvidia"]
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

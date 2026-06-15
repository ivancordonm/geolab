"""Application-scoped services shared by HTTP routers."""

import os

from app.agent.llm_planner import LLMPlanner
from app.agent.ollama_planner import OllamaPlanner
from app.agent.openai_planner import OpenAICompatiblePlanner
from app.agent.planner import Planner, RuleBasedPlanner
from app.agent.schemas import ProviderConfig
from app.agent.tools import create_geometry_tool_registry
from app.geometry.workspace import GeometryWorkspace


def create_planner(config: ProviderConfig | None = None) -> Planner:
    """Return the appropriate planner for *config*.

    If config is None, falls back to the MATHLLM_LLM_PROVIDER env var (legacy).
    """
    if config is not None:
        if config.provider in ("huggingface", "openai", "nvidia"):
            return OpenAICompatiblePlanner(
                base_url=config.base_url,
                api_key=config.api_key,
                model=config.model,
                temperature=config.temperature,
            )

    # Legacy env-var fallback (used when config is None or provider unrecognised).
    provider = os.getenv("MATHLLM_LLM_PROVIDER", "ollama").strip().lower()
    if provider == "claude":
        return LLMPlanner() if os.getenv("ANTHROPIC_API_KEY") else RuleBasedPlanner()
    if provider == "rules":
        return RuleBasedPlanner()
    return OllamaPlanner()


geometry_workspace = GeometryWorkspace()
tool_registry = create_geometry_tool_registry(geometry_workspace)

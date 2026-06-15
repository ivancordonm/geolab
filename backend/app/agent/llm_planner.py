"""Anthropic (Claude API) planner.

Preserves GeoLab's epistemic boundary: Claude only *proposes* a script; the
deterministic `evaluate_script` (in the shared base) is the authority and the
script is never applied without explicit user approval in the UI.
"""

from __future__ import annotations

import os
from typing import Any

from app.agent.planner import PlannerError, UnsupportedRequestError
from app.agent.script_planner import MAX_TOKENS, PLAN_SCHEMA, SYSTEM_PROMPT, BaseScriptPlanner

DEFAULT_MODEL = "claude-opus-4-8"


class LLMPlanner(BaseScriptPlanner):
    """Planner backed by Claude that understands free-form natural language."""

    def __init__(
        self,
        *,
        model: str = DEFAULT_MODEL,
        client: Any | None = None,
        api_key: str | None = None,
    ) -> None:
        self._model = model
        self._client = client
        self._api_key = api_key

    def _ensure_client(self) -> Any:
        """Lazily build the Anthropic client so importing this module is cheap and
        so the backend still starts when the SDK or key is absent."""
        if self._client is not None:
            return self._client
        api_key = self._api_key or os.getenv("ANTHROPIC_API_KEY")
        if not api_key:
            raise PlannerError(
                "The Claude planner is not configured: set the ANTHROPIC_API_KEY "
                "environment variable to enable natural-language planning."
            )
        try:
            import anthropic
        except ImportError as error:  # pragma: no cover - environment guard
            raise PlannerError(
                "The 'anthropic' package is not installed. Run "
                "`pip install -e '.[dev]'` in the backend to enable the Claude planner."
            ) from error
        self._client = anthropic.Anthropic(api_key=api_key)
        return self._client

    def _complete(self, messages: list[dict[str, Any]]) -> str:
        client = self._ensure_client()
        try:
            response = client.messages.create(
                model=self._model,
                max_tokens=MAX_TOKENS,
                system=SYSTEM_PROMPT,
                messages=messages,
                output_config={
                    "effort": "low",
                    "format": {"type": "json_schema", "schema": PLAN_SCHEMA},
                },
            )
        except Exception as error:  # noqa: BLE001 - surface any SDK/transport failure uniformly
            raise PlannerError(f"The Claude planner request failed: {error}") from error

        if getattr(response, "stop_reason", None) == "refusal":
            raise UnsupportedRequestError("The assistant declined to plan this request.")

        text = next((block.text for block in response.content if block.type == "text"), None)
        if not text:
            raise PlannerError("The Claude planner returned an empty response.")
        return text

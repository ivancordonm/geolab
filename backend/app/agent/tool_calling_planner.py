"""Anthropic (Claude API) planner that proposes native tool calls.

This is a parallel, independent mechanism to the script-generating planners in
`script_planner.py`. Instead of asking the model for a construction-script
string, it exposes GeoLab's already-registered deterministic tools to Claude's
native tool-calling (function-calling) API and collects the tool calls the model
proposes.

Like every planner in this codebase, it only *proposes*: it never calls
`registry.execute()` itself. The caller (the frontend, applying each call one at
a time through `/agent/execute-tool`) is the sole authority for mutating geometry
state. A malformed or geometrically-impossible call surfaces as a normal
validation error when it is actually applied, not during planning — so there is
no repair-retry loop here.
"""

from __future__ import annotations

import os
from collections.abc import Iterator
from typing import Any

from app.agent.models import ToolDescriptor
from app.agent.planner import PlannerError, UnsupportedRequestError
from app.agent.schemas import ToolCallPlanResult, ToolCallProposal
from app.geometry.models import GeometryDocument

DEFAULT_MODEL = "claude-opus-4-8"
MAX_TOKENS = 4000

TOOL_SYSTEM_PROMPT = """\
You are the construction planner for GeoLab, an interactive 2D geometry workspace.

GeoLab has a strict epistemic boundary: you REASON about geometry, but the
deterministic geometry engine is the sole authority for computing state. You never
compute coordinates of derived objects (midpoints, intersections, perpendiculars,
etc.) — you call the provided tools and the engine calculates the result.

Translate the user's natural-language request (in ANY language, including Spanish)
into a sequence of tool calls that build the requested construction:

- Call the provided tools in dependency order. A tool that references another
  object (a point, line, circle, ...) must be called AFTER the tool that creates
  that object. Reference earlier objects by the `objectId` you gave them.
- Every construction that depends on points needs those points to exist first.
  Free points require explicit coordinates; when the user does not supply them,
  choose reasonable, well-spread integer coordinates (e.g. A=(0,0), B=(5,0),
  C=(2,3)).
- Give each object a short, unique `objectId` (for example A, B, AB, c1, M).
- Never fabricate coordinates for derived objects. Use the dedicated intersection,
  midpoint, and perpendicular/parallel tools instead.
- Use only the tools you are given. Do not invent tools or arguments.

Call the tools directly. Do not describe the calls in prose or emit a script; the
tool-calling protocol carries the calls. A brief sentence of reasoning is welcome,
but the tool calls are the deliverable.
"""


class ToolCallingPlanner:
    """Claude-backed planner that proposes native tool calls instead of a script.

    Follows `LLMPlanner`'s dependency-injection pattern: pass `client` in tests to
    avoid any network access; in production the Anthropic client is built lazily
    from `ANTHROPIC_API_KEY`.
    """

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
                "The Claude tool-calling planner is not configured: set the "
                "ANTHROPIC_API_KEY environment variable to enable it."
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

    def plan(
        self,
        document: GeometryDocument | None,
        user_request: str,
        tools: tuple[ToolDescriptor, ...],
    ) -> ToolCallPlanResult:
        """Propose an ordered sequence of tool calls for *user_request*.

        Only proposes — never executes. Raises `UnsupportedRequestError` when the
        model declines or proposes no construction, and `PlannerError` when the
        transport itself fails.
        """
        anthropic_tools = [
            {
                "name": tool.name,
                "description": tool.description,
                "input_schema": tool.input_schema,
            }
            for tool in tools
        ]
        messages = [{"role": "user", "content": _build_user_message(document, user_request)}]

        client = self._ensure_client()
        try:
            response = client.messages.create(
                model=self._model,
                max_tokens=MAX_TOKENS,
                system=TOOL_SYSTEM_PROMPT,
                tools=anthropic_tools,
                messages=messages,
            )
        except Exception as error:  # noqa: BLE001 - surface any SDK/transport failure uniformly
            raise PlannerError(
                f"The Claude tool-calling planner request failed: {error}"
            ) from error

        return _extract_plan_result(response)

    def plan_stream(
        self,
        document: GeometryDocument | None,
        user_request: str,
        tools: tuple[ToolDescriptor, ...],
    ) -> Iterator[dict[str, Any]]:
        """Yield SSE-ready event dicts as the model plans, in real time.

        Each yielded dict is ``{"event": <name>, "data": {...}}``. Event catalog:

        - ``thinking`` — one per incremental reasoning-text delta as it streams.
        - ``tools_selected`` — emitted once, carrying the finalized tool-call list.
        - ``done`` — emitted once, carrying the full ``ToolCallPlanResult`` payload.
        - ``error`` — emitted once *instead of* ``tools_selected``/``done`` when
          the model refuses, proposes no tool calls, or the transport fails.

        Failures are events, not exceptions: once streaming starts the HTTP
        response headers are already sent, so an error cannot become an HTTP
        status. This mirrors ``plan()``'s uniform transport-failure handling.

        Deliberately has NO ``tool_executed`` event: this planner only proposes,
        exactly like ``plan()``. Execution stays the frontend's job, one
        ``/agent/execute-tool`` call at a time — streaming does not change
        GeoLab's approval boundary.
        """
        anthropic_tools = [
            {
                "name": tool.name,
                "description": tool.description,
                "input_schema": tool.input_schema,
            }
            for tool in tools
        ]
        messages = [{"role": "user", "content": _build_user_message(document, user_request)}]

        client = self._ensure_client()
        try:
            with client.messages.stream(
                model=self._model,
                max_tokens=MAX_TOKENS,
                system=TOOL_SYSTEM_PROMPT,
                tools=anthropic_tools,
                messages=messages,
            ) as stream:
                for text in stream.text_stream:
                    yield {"event": "thinking", "data": {"delta": text}}
                message = stream.get_final_message()
        except Exception as error:  # noqa: BLE001 - mirror plan()'s uniform transport-failure handling
            yield {"event": "error", "data": {"code": "planning_failed", "message": str(error)}}
            return

        try:
            result = _extract_plan_result(message)
        except UnsupportedRequestError as error:
            yield {"event": "error", "data": {"code": "unsupported_request", "message": str(error)}}
            return

        yield {
            "event": "tools_selected",
            "data": {"tool_calls": [tc.model_dump(by_alias=True) for tc in result.tool_calls]},
        }
        yield {"event": "done", "data": result.model_dump(by_alias=True)}


def _extract_plan_result(message: Any) -> ToolCallPlanResult:
    """Parse a finalized Anthropic ``Message`` into a ``ToolCallPlanResult``.

    Shared by ``plan()`` (non-streaming) and ``plan_stream()`` so both paths read
    the response identically. Raises ``UnsupportedRequestError`` when the model
    refused or proposed no tool calls.
    """
    if getattr(message, "stop_reason", None) == "refusal":
        raise UnsupportedRequestError("The assistant declined to plan this request.")

    reasoning_parts: list[str] = []
    tool_calls: list[ToolCallProposal] = []
    for block in message.content:
        block_type = getattr(block, "type", None)
        if block_type == "text":
            text = getattr(block, "text", "").strip()
            if text:
                reasoning_parts.append(text)
        elif block_type == "tool_use":
            tool_calls.append(
                ToolCallProposal(
                    tool_name=block.name,
                    arguments=dict(block.input),
                )
            )

    if not tool_calls:
        raise UnsupportedRequestError(
            "The assistant did not propose any construction for this request."
        )

    reasoning = " ".join(reasoning_parts) or (
        "Proposed the tool calls needed to build the requested construction."
    )
    return ToolCallPlanResult(reasoning=reasoning, tool_calls=tool_calls)


def _build_user_message(document: GeometryDocument | None, user_request: str) -> str:
    request = user_request.strip()
    if document is None or not document.objects:
        return f"The current construction is empty.\n\nRequest: {request}"
    existing = ", ".join(f"{obj.label} ({obj.kind}, id={obj.id})" for obj in document.objects)
    return (
        "Current construction objects (extend it; reuse these ids, do not redefine "
        f"them):\n{existing}\n\nRequest: {request}"
    )

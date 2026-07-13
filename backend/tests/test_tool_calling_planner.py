"""Tests for the tool-calling planner using an injected fake Anthropic client.

Like the LLM-planner tests, these never touch the network or require an API key.
They exercise the deterministic boundary around native tool-calling: the model
only *proposes* tool calls, and the deterministic registry — applied one call at
a time — is the sole authority for mutating geometry state.
"""

from dataclasses import dataclass
from typing import Any

import pytest
from fastapi.testclient import TestClient

import app.agent.router as router
from app.agent.planner import RuleBasedPlanner, UnsupportedRequestError
from app.agent.tool_calling_planner import ToolCallingPlanner
from app.agent.tools import create_geometry_tool_registry
from app.geometry.script import evaluate_script
from app.geometry.workspace import GeometryWorkspace
from app.main import app


@dataclass
class _ToolUseBlock:
    name: str
    input: dict[str, Any]
    type: str = "tool_use"


@dataclass
class _TextBlock:
    text: str
    type: str = "text"


@dataclass
class _FakeMessage:
    content: list[Any]
    stop_reason: str = "tool_use"


class _FakeMessages:
    def __init__(self, message: _FakeMessage) -> None:
        self._message = message
        self.calls: list[dict] = []

    def create(self, **kwargs: Any) -> _FakeMessage:
        self.calls.append(kwargs)
        return self._message


class _FakeClient:
    def __init__(self, message: _FakeMessage) -> None:
        self.messages = _FakeMessages(message)


def _line_through_ab_message() -> _FakeMessage:
    """A canned tool-calling response for "the line through A and B".

    Coordinates match what RuleBasedPlanner assigns to free points (0,0) and
    (5,0) so the two planning paths are directly comparable.
    """

    return _FakeMessage(
        content=[
            _TextBlock(text="I will place A and B, then draw the line through them."),
            _ToolUseBlock(name="create_point", input={"objectId": "A", "x": 0.0, "y": 0.0}),
            _ToolUseBlock(name="create_point", input={"objectId": "B", "x": 5.0, "y": 0.0}),
            _ToolUseBlock(
                name="create_line",
                input={"objectId": "AB", "pointA": "A", "pointB": "B"},
            ),
        ]
    )


def _apply(tool_calls: list, registry) -> GeometryWorkspace:
    """Apply proposed tool calls sequentially through the real registry."""

    for call in tool_calls:
        registry.execute(call.tool_name, call.arguments)
    return registry


def test_tool_calling_plan_returns_reasoning_and_ordered_tool_calls() -> None:
    client = _FakeClient(_line_through_ab_message())
    planner = ToolCallingPlanner(client=client)
    workspace = GeometryWorkspace()
    registry = create_geometry_tool_registry(workspace)

    result = planner.plan(None, "draw the line through A and B", registry.descriptors())

    assert "line" in result.reasoning.lower()
    assert [call.tool_name for call in result.tool_calls] == [
        "create_point",
        "create_point",
        "create_line",
    ]
    # The tools the model was offered are exactly the registry's descriptors.
    sent_tools = client.messages.calls[0]["tools"]
    offered = {tool["name"] for tool in sent_tools}
    assert {"create_point", "create_line"} <= offered
    assert all({"name", "description", "input_schema"} <= tool.keys() for tool in sent_tools)


def test_tool_calls_apply_to_same_geometry_as_rule_based_script() -> None:
    """Regression: the proposed tool calls, once applied, reach the same line as
    the deterministic rule-based script planner for the equivalent request."""

    # Tool-calling path: apply the proposed calls against a real workspace.
    client = _FakeClient(_line_through_ab_message())
    planner = ToolCallingPlanner(client=client)
    workspace = GeometryWorkspace()
    registry = create_geometry_tool_registry(workspace)
    result = planner.plan(None, "draw the line through A and B", registry.descriptors())
    _apply(result.tool_calls, registry)

    tool_access = workspace.graph_access_map()
    tool_line = tool_access.resolve("AB").value

    # Script path: the rule-based planner emits and validates a script for the
    # equivalent natural-language request.
    script_response = RuleBasedPlanner().generate_plan("draw line A B")
    script_document, _ = evaluate_script(script_response.generated_script)
    from app.geometry.workspace import build_graph_access_map

    script_access = build_graph_access_map(script_document, revision=0)
    script_line = script_access.resolve("AB").value

    assert tool_line.type == "line"
    assert script_line.type == "line"
    # Both runtimes normalize the same line identically, within tolerance.
    assert tool_line.a == pytest.approx(script_line.a, abs=1e-9)
    assert tool_line.b == pytest.approx(script_line.b, abs=1e-9)
    assert tool_line.c == pytest.approx(script_line.c, abs=1e-9)


def test_no_tool_calls_raises_unsupported_request() -> None:
    message = _FakeMessage(
        content=[_TextBlock(text="I cannot express that with the available tools.")],
        stop_reason="end_turn",
    )
    planner = ToolCallingPlanner(client=_FakeClient(message))
    workspace = GeometryWorkspace()
    registry = create_geometry_tool_registry(workspace)

    with pytest.raises(UnsupportedRequestError):
        planner.plan(None, "prove the Riemann hypothesis", registry.descriptors())


def test_refusal_stop_reason_raises_unsupported_request() -> None:
    message = _FakeMessage(content=[], stop_reason="refusal")
    planner = ToolCallingPlanner(client=_FakeClient(message))
    workspace = GeometryWorkspace()
    registry = create_geometry_tool_registry(workspace)

    with pytest.raises(UnsupportedRequestError):
        planner.plan(None, "do something disallowed", registry.descriptors())


def test_existing_document_is_summarized_in_the_prompt() -> None:
    workspace = GeometryWorkspace()
    registry = create_geometry_tool_registry(workspace)
    registry.execute("create_point", {"objectId": "A", "x": 0.0, "y": 0.0})
    document = workspace.document_snapshot()

    client = _FakeClient(_line_through_ab_message())
    planner = ToolCallingPlanner(client=client)
    planner.plan(document, "draw the line through A and B", registry.descriptors())

    user_message = client.messages.calls[0]["messages"][0]["content"]
    assert "A" in user_message


_http_client = TestClient(app)


def test_plan_with_tools_endpoint_returns_camel_case_tool_calls(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    fake = _FakeClient(_line_through_ab_message())
    monkeypatch.setattr(router, "ToolCallingPlanner", lambda: ToolCallingPlanner(client=fake))

    response = _http_client.post(
        "/agent/plan-with-tools",
        json={"userRequest": "draw the line through A and B"},
    )

    assert response.status_code == 200
    payload = response.json()
    assert [call["toolName"] for call in payload["toolCalls"]] == [
        "create_point",
        "create_point",
        "create_line",
    ]
    assert payload["toolCalls"][0]["arguments"] == {"objectId": "A", "x": 0.0, "y": 0.0}
    assert payload["reasoning"]


def test_plan_with_tools_endpoint_maps_unsupported_request(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    empty = _FakeMessage(
        content=[_TextBlock(text="No construction available.")],
        stop_reason="end_turn",
    )
    monkeypatch.setattr(
        router,
        "ToolCallingPlanner",
        lambda: ToolCallingPlanner(client=_FakeClient(empty)),
    )

    response = _http_client.post(
        "/agent/plan-with-tools",
        json={"userRequest": "prove the Riemann hypothesis"},
    )

    assert response.status_code == 422
    assert response.json()["detail"]["code"] == "unsupported_request"

"""Tests for the streaming tool-calling planner (`plan_stream` + `/agent/plan-stream`).

Like the non-streaming tool-calling tests, these never touch the network or
require an API key: a fake Anthropic client whose ``.messages.stream(...)``
returns a fake ``MessageStream``-like context manager drives every case. The
streaming path only *proposes* tool calls — it never executes — so there is
deliberately no ``tool_executed`` event, exactly as with ``plan()``.
"""

from dataclasses import dataclass, field
from typing import Any

import pytest
from fastapi.testclient import TestClient

import app.agent.router as router
from app.agent.tool_calling_planner import ToolCallingPlanner
from app.agent.tools import create_geometry_tool_registry
from app.geometry.workspace import GeometryWorkspace
from app.main import app

# Reuse the block/message fakes from the non-streaming suite so the finalized
# message shape is identical to what `plan()`'s tests exercise.
from tests.test_tool_calling_planner import (
    _FakeMessage,
    _line_through_ab_message,
    _TextBlock,
)


class _FakeStream:
    """Mimics anthropic's ``MessageStream`` context manager for tests.

    ``text_stream`` is a plain list of string chunks; ``get_final_message()``
    returns the pre-built finalized message. If ``raise_in_block`` is set, the
    exception is raised while iterating ``text_stream`` (i.e. inside the
    ``with`` block), exercising the transport-failure path.
    """

    def __init__(
        self,
        text_chunks: list[str],
        final_message: _FakeMessage,
        raise_in_block: Exception | None = None,
    ) -> None:
        self._text_chunks = text_chunks
        self._final_message = final_message
        self._raise_in_block = raise_in_block

    def __enter__(self) -> "_FakeStream":
        return self

    def __exit__(self, *exc: Any) -> bool:
        return False

    @property
    def text_stream(self):
        for chunk in self._text_chunks:
            yield chunk
        if self._raise_in_block is not None:
            raise self._raise_in_block

    def get_final_message(self) -> _FakeMessage:
        return self._final_message


@dataclass
class _FakeStreamingMessages:
    stream_obj: _FakeStream
    calls: list[dict] = field(default_factory=list)

    def stream(self, **kwargs: Any) -> _FakeStream:
        self.calls.append(kwargs)
        return self.stream_obj


class _FakeStreamingClient:
    def __init__(self, stream_obj: _FakeStream) -> None:
        self.messages = _FakeStreamingMessages(stream_obj=stream_obj)


def _registry():
    return create_geometry_tool_registry(GeometryWorkspace())


def test_plan_stream_yields_thinking_then_tools_selected_then_done() -> None:
    chunks = ["I will place ", "A and B, then ", "draw the line."]
    stream = _FakeStream(chunks, _line_through_ab_message())
    planner = ToolCallingPlanner(client=_FakeStreamingClient(stream))
    registry = _registry()

    events = list(
        planner.plan_stream(None, "draw the line through A and B", registry.descriptors())
    )

    thinking = [e for e in events if e["event"] == "thinking"]
    assert [e["data"]["delta"] for e in thinking] == chunks

    # Exactly one tools_selected, then exactly one done, in that order, last.
    names = [e["event"] for e in events]
    assert names[-2:] == ["tools_selected", "done"]
    assert names.count("tools_selected") == 1
    assert names.count("done") == 1

    selected = next(e for e in events if e["event"] == "tools_selected")
    assert [tc["toolName"] for tc in selected["data"]["tool_calls"]] == [
        "create_point",
        "create_point",
        "create_line",
    ]

    # The done payload matches what plan() would return for the same finalized
    # message, serialized by alias (camelCase contract).
    done = next(e for e in events if e["event"] == "done")
    reference = _extract_reference(_line_through_ab_message())
    assert done["data"] == reference


def _extract_reference(message: _FakeMessage) -> dict:
    from app.agent.tool_calling_planner import _extract_plan_result

    return _extract_plan_result(message).model_dump(by_alias=True)


def test_plan_stream_refusal_yields_single_error_event() -> None:
    refusal = _FakeMessage(content=[], stop_reason="refusal")
    stream = _FakeStream(["thinking..."], refusal)
    planner = ToolCallingPlanner(client=_FakeStreamingClient(stream))
    registry = _registry()

    events = list(planner.plan_stream(None, "do something disallowed", registry.descriptors()))

    errors = [e for e in events if e["event"] == "error"]
    assert len(errors) == 1
    assert errors[0]["data"]["code"] == "unsupported_request"
    assert not any(e["event"] in ("tools_selected", "done") for e in events)


def test_plan_stream_no_tool_calls_yields_single_error_event() -> None:
    empty = _FakeMessage(
        content=[_TextBlock(text="No construction available.")],
        stop_reason="end_turn",
    )
    stream = _FakeStream(["thinking..."], empty)
    planner = ToolCallingPlanner(client=_FakeStreamingClient(stream))
    registry = _registry()

    events = list(planner.plan_stream(None, "prove the Riemann hypothesis", registry.descriptors()))

    errors = [e for e in events if e["event"] == "error"]
    assert len(errors) == 1
    assert errors[0]["data"]["code"] == "unsupported_request"
    assert not any(e["event"] in ("tools_selected", "done") for e in events)


def test_plan_stream_transport_exception_yields_single_error_event() -> None:
    stream = _FakeStream(
        ["partial "],
        _line_through_ab_message(),
        raise_in_block=RuntimeError("connection reset"),
    )
    planner = ToolCallingPlanner(client=_FakeStreamingClient(stream))
    registry = _registry()

    events = list(planner.plan_stream(None, "draw a line", registry.descriptors()))

    errors = [e for e in events if e["event"] == "error"]
    assert len(errors) == 1
    assert errors[0]["data"]["code"] == "planning_failed"
    assert "connection reset" in errors[0]["data"]["message"]
    assert not any(e["event"] in ("tools_selected", "done") for e in events)


_http_client = TestClient(app)


def test_plan_stream_endpoint_streams_event_frames_in_order(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    chunks = ["Placing ", "the points."]
    stream = _FakeStream(chunks, _line_through_ab_message())
    monkeypatch.setattr(
        router,
        "ToolCallingPlanner",
        lambda: ToolCallingPlanner(client=_FakeStreamingClient(stream)),
    )

    response = _http_client.post(
        "/agent/plan-stream",
        json={"userRequest": "draw the line through A and B"},
    )

    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/event-stream")

    body = response.text
    # Two-field SSE frames: an event name line, then a data JSON line.
    assert "event: thinking\ndata: " in body
    assert "event: tools_selected\ndata: " in body
    assert "event: done\ndata: " in body
    # Ordering: thinking deltas precede tools_selected, which precedes done.
    assert body.index("event: thinking") < body.index("event: tools_selected")
    assert body.index("event: tools_selected") < body.index("event: done")
    # The streamed thinking deltas carry the fake text chunks.
    assert '"delta": "Placing "' in body

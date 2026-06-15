"""Tests for the LLM-backed planner using an injected fake client.

These never touch the network or require an API key — they exercise the
deterministic boundary around the model: validation, repair retry, and error
mapping.
"""

import json
from dataclasses import dataclass

import pytest

from app.agent.llm_planner import LLMPlanner
from app.agent.planner import PlannerError, UnsupportedRequestError
from app.geometry.script import evaluate_script


@dataclass
class _TextBlock:
    text: str
    type: str = "text"


@dataclass
class _FakeMessage:
    content: list[_TextBlock]
    stop_reason: str = "end_turn"


class _FakeMessages:
    def __init__(self, payloads: list[dict]) -> None:
        self._payloads = payloads
        self.calls: list[dict] = []

    def create(self, **kwargs):
        self.calls.append(kwargs)
        payload = self._payloads[len(self.calls) - 1]
        return _FakeMessage(content=[_TextBlock(text=json.dumps(payload))])


class _FakeClient:
    def __init__(self, payloads: list[dict]) -> None:
        self.messages = _FakeMessages(payloads)


def _planner(payloads: list[dict]) -> tuple[LLMPlanner, _FakeClient]:
    client = _FakeClient(payloads)
    return LLMPlanner(client=client), client


def test_natural_language_request_produces_validated_script() -> None:
    payload = {
        "reasoning": "Mapped to three points and three segments.",
        "plan": ["Create A, B, C", "Connect the sides"],
        "generated_script": (
            "A = Point(0, 0)\n"
            "B = Point(6, 0)\n"
            "C = Point(2, 4)\n"
            "AB = Segment(A, B)\n"
            "BC = Segment(B, C)\n"
            "CA = Segment(C, A)"
        ),
    }
    planner, client = _planner([payload])

    response = planner.generate_plan("dibuja un triángulo ABC")

    assert response.generated_script == payload["generated_script"]
    assert response.plan == payload["plan"]
    # The deterministic engine accepts it.
    document, _ = evaluate_script(response.generated_script)
    assert [item.id for item in document.objects] == ["A", "B", "C", "AB", "BC", "CA"]
    assert len(client.messages.calls) == 1


def test_invalid_script_is_repaired_on_second_attempt() -> None:
    broken = {
        "reasoning": "First try",
        "plan": ["..."],
        "generated_script": "A = Point(0, 0)\nL = Line(A, B)",  # B undefined
    }
    fixed = {
        "reasoning": "Corrected",
        "plan": ["Define B then the line"],
        "generated_script": "A = Point(0, 0)\nB = Point(4, 0)\nL = Line(A, B)",
    }
    planner, client = _planner([broken, fixed])

    response = planner.generate_plan("draw a line through A and B")

    assert response.generated_script == fixed["generated_script"]
    assert len(client.messages.calls) == 2
    # The repair turn fed the diagnostic back to the model.
    repair_messages = client.messages.calls[1]["messages"]
    assert any("validation" in m["content"] for m in repair_messages if m["role"] == "user")


def test_empty_script_raises_unsupported_request() -> None:
    payload = {
        "reasoning": "Cannot be expressed with the available commands.",
        "plan": [],
        "generated_script": "",
    }
    planner, _ = _planner([payload])

    with pytest.raises(UnsupportedRequestError):
        planner.generate_plan("prove the Riemann hypothesis")


def test_persistently_invalid_script_raises_planner_error() -> None:
    broken = {
        "reasoning": "x",
        "plan": [],
        "generated_script": "L = Line(A, B)",  # always undefined references
    }
    planner, client = _planner([broken, broken])

    with pytest.raises(PlannerError):
        planner.generate_plan("draw something broken")
    assert len(client.messages.calls) == 2


def test_missing_api_key_raises_clear_error(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
    planner = LLMPlanner()  # no injected client, no key

    with pytest.raises(PlannerError, match="ANTHROPIC_API_KEY"):
        planner.generate_plan("dibuja un triángulo")

"""Tests for the local Ollama planner using a fake transport (no network)."""

import json
import urllib.error

import pytest

from app.agent.ollama_planner import OllamaPlanner
from app.agent.planner import PlannerError, ProviderTimeoutError, UnsupportedRequestError
from app.geometry.script import evaluate_script


def _raise_http_error(code: int, reason: str = "Error"):
    """Build a fake transport that raises an HTTP error with the given status code."""

    def transport(url: str, body: dict) -> dict:
        raise urllib.error.HTTPError(url, code, reason, hdrs=None, fp=None)

    return transport


def _transport_returning(*payloads: dict):
    """Build a fake transport that returns each payload in turn as an Ollama reply."""
    calls: list[dict] = []

    def transport(url: str, body: dict) -> dict:
        calls.append({"url": url, "body": body})
        payload = payloads[len(calls) - 1]
        return {"message": {"role": "assistant", "content": json.dumps(payload)}}

    transport.calls = calls  # type: ignore[attr-defined]
    return transport


def test_natural_language_request_produces_validated_script() -> None:
    payload = {
        "reasoning": "Tres puntos y tres segmentos.",
        "plan": ["Crear A, B, C", "Unir los lados"],
        "generated_script": (
            "A = Point(0, 0)\n"
            "B = Point(6, 0)\n"
            "C = Point(2, 4)\n"
            "AB = Segment(A, B)\n"
            "BC = Segment(B, C)\n"
            "CA = Segment(C, A)"
        ),
    }
    transport = _transport_returning(payload)
    planner = OllamaPlanner(transport=transport)

    response = planner.generate_plan("dibuja un triángulo ABC")

    assert response.generated_script == payload["generated_script"]
    document, _ = evaluate_script(response.generated_script)
    assert [item.id for item in document.objects] == ["A", "B", "C", "AB", "BC", "CA"]
    # The request hit the local server with the configured model and a system prompt.
    body = transport.calls[0]["body"]
    assert transport.calls[0]["url"].endswith("/api/chat")
    assert body["messages"][0]["role"] == "system"
    assert body["stream"] is False


def test_configured_temperature_is_sent_to_ollama() -> None:
    transport = _transport_returning(
        {
            "reasoning": "ok",
            "plan": ["Crear A"],
            "generated_script": "A = Point(0, 0)",
        }
    )

    OllamaPlanner(temperature=0.7, transport=transport).generate_plan("crea un punto")

    assert transport.calls[0]["body"]["options"]["temperature"] == 0.7


@pytest.mark.parametrize(
    ("configured_url", "expected_url"),
    [
        ("http://localhost:11434", "http://localhost:11434/api/chat"),
        ("http://localhost:11434/api/chat/", "http://localhost:11434/api/chat"),
    ],
)
def test_accepts_base_or_complete_ollama_chat_url(configured_url: str, expected_url: str) -> None:
    transport = _transport_returning(
        {
            "reasoning": "ok",
            "plan": ["Crear A"],
            "generated_script": "A = Point(0, 0)",
        }
    )

    OllamaPlanner(base_url=configured_url, transport=transport).generate_plan("crea un punto")

    assert transport.calls[0]["url"] == expected_url


def test_invalid_script_is_repaired_on_second_attempt() -> None:
    broken = {"reasoning": "x", "plan": [], "generated_script": "L = Line(A, B)"}
    fixed = {
        "reasoning": "Corregido",
        "plan": ["Definir A y B"],
        "generated_script": "A = Point(0, 0)\nB = Point(4, 0)\nL = Line(A, B)",
    }
    transport = _transport_returning(broken, fixed)
    planner = OllamaPlanner(transport=transport)

    response = planner.generate_plan("traza una recta por A y B")

    assert response.generated_script == fixed["generated_script"]
    assert len(transport.calls) == 2


def test_markdown_fenced_json_is_tolerated() -> None:
    script = "A = Point(0, 0)\nB = Point(4, 0)\nAB = Segment(A, B)"
    fenced = (
        "```json\n"
        + json.dumps({"reasoning": "ok", "plan": ["..."], "generated_script": script})
        + "\n```"
    )

    def transport(url: str, body: dict) -> dict:
        return {"message": {"role": "assistant", "content": fenced}}

    response = OllamaPlanner(transport=transport).generate_plan("segmento AB")
    assert response.generated_script == script


def test_empty_script_raises_unsupported_request() -> None:
    transport = _transport_returning(
        {"reasoning": "No se puede.", "plan": [], "generated_script": ""}
    )
    with pytest.raises(UnsupportedRequestError):
        OllamaPlanner(transport=transport).generate_plan("demuestra un teorema")


def test_unexpected_response_shape_raises_planner_error() -> None:
    def transport(url: str, body: dict) -> dict:
        return {"unexpected": "shape"}

    with pytest.raises(PlannerError, match='"unexpected": "shape"'):
        OllamaPlanner(transport=transport).generate_plan("dibuja algo")


def test_http_404_raises_model_not_installed_error() -> None:
    """Un 404 de Ollama significa que el modelo no está instalado, no que el servidor esté caído."""
    with pytest.raises(PlannerError, match="not installed") as exc_info:
        OllamaPlanner(transport=_raise_http_error(404)).generate_plan("dibuja algo")
    assert "ollama pull" in str(exc_info.value)
    assert "Could not reach" not in str(exc_info.value)


def test_http_404_mentions_model_name() -> None:
    """El mensaje del 404 debe incluir el nombre del modelo configurado."""
    with pytest.raises(PlannerError, match="llama3.1"):
        OllamaPlanner(model="llama3.1", transport=_raise_http_error(404)).generate_plan(
            "dibuja algo"
        )


def test_http_500_raises_generic_planner_error() -> None:
    """Un error HTTP distinto de 404 produce un mensaje genérico con el código."""
    with pytest.raises(PlannerError, match="HTTP 500"):
        OllamaPlanner(transport=_raise_http_error(500, "Internal Server Error")).generate_plan(
            "dibuja algo"
        )


@pytest.mark.parametrize(
    "error",
    [TimeoutError("timed out"), urllib.error.URLError(TimeoutError("timed out"))],
)
def test_timeout_raises_provider_timeout_error(error: Exception) -> None:
    def transport(url: str, body: dict) -> dict:
        raise error

    with pytest.raises(ProviderTimeoutError, match="300 seconds"):
        OllamaPlanner(transport=transport).generate_plan("dibuja algo")

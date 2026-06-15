"""Tests for OpenAICompatiblePlanner using a fake transport (no network)."""

import json
import urllib.error

import pytest

from app.agent.openai_planner import OpenAICompatiblePlanner
from app.agent.planner import PlannerError, ProviderTimeoutError, UnsupportedRequestError
from app.geometry.script import evaluate_script


def _ok_transport(payload: dict):
    """Fake transport returning a valid OpenAI-style chat completion response."""

    def transport(url: str, body: dict, api_key: str) -> dict:
        return {"choices": [{"message": {"content": json.dumps(payload)}}]}

    return transport


def _raise_http_error(code: int, reason: str = "Error"):
    def transport(url: str, body: dict, api_key: str) -> dict:
        raise urllib.error.HTTPError(url, code, reason, hdrs=None, fp=None)

    return transport


def test_natural_language_request_produces_validated_script() -> None:
    payload = {
        "reasoning": "Tres puntos y tres lados.",
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
    planner = OpenAICompatiblePlanner(
        base_url="https://api.openai.com/v1",
        api_key="sk-test",
        model="gpt-4o",
        transport=_ok_transport(payload),
    )
    response = planner.generate_plan("dibuja un triángulo ABC")
    assert response.generated_script == payload["generated_script"]
    document, _ = evaluate_script(response.generated_script)
    assert [obj.id for obj in document.objects] == ["A", "B", "C", "AB", "BC", "CA"]


def test_configured_temperature_is_sent_to_provider() -> None:
    calls: list[dict] = []

    def transport(url: str, body: dict, api_key: str) -> dict:
        calls.append(body)
        return {
            "choices": [
                {
                    "message": {
                        "content": json.dumps(
                            {
                                "reasoning": "ok",
                                "plan": ["Crear A"],
                                "generated_script": "A = Point(0, 0)",
                            }
                        )
                    }
                }
            ]
        }

    OpenAICompatiblePlanner(
        base_url="https://api.openai.com/v1",
        api_key="sk-test",
        model="gpt-4o",
        temperature=1.0,
        transport=transport,
    ).generate_plan("crea un punto")

    assert calls[0]["temperature"] == 1.0


def test_content_blocks_are_accepted() -> None:
    payload = {
        "reasoning": "ok",
        "plan": ["Crear A"],
        "generated_script": "A = Point(0, 0)",
    }

    def transport(url: str, body: dict, api_key: str) -> dict:
        return {
            "choices": [
                {
                    "message": {
                        "content": [
                            {"type": "text", "text": json.dumps(payload)},
                        ]
                    }
                }
            ]
        }

    response = OpenAICompatiblePlanner(
        base_url="https://api.openai.com/v1",
        api_key="sk-test",
        model="gpt-4o",
        transport=transport,
    ).generate_plan("crea un punto")

    assert response.generated_script == "A = Point(0, 0)"


def test_unexpected_response_includes_provider_payload() -> None:
    def transport(url: str, body: dict, api_key: str) -> dict:
        return {
            "choices": [
                {
                    "finish_reason": "length",
                    "message": {"content": None, "refusal": "Output limit reached"},
                }
            ]
        }

    with pytest.raises(PlannerError) as exc_info:
        OpenAICompatiblePlanner(
            base_url="https://api.openai.com/v1",
            api_key="sk-test",
            model="gpt-4o",
            transport=transport,
        ).generate_plan("crea un punto")

    message = str(exc_info.value)
    assert "unexpected response shape" in message
    assert '"finish_reason": "length"' in message
    assert '"refusal": "Output limit reached"' in message


@pytest.mark.parametrize(
    ("configured_url", "expected_url"),
    [
        ("https://api.openai.com/v1", "https://api.openai.com/v1/chat/completions"),
        (
            "https://api.openai.com/v1/chat/completions/",
            "https://api.openai.com/v1/chat/completions",
        ),
    ],
)
def test_accepts_base_or_complete_chat_completions_url(
    configured_url: str, expected_url: str
) -> None:
    calls: list[str] = []

    def transport(url: str, body: dict, api_key: str) -> dict:
        calls.append(url)
        return {
            "choices": [
                {
                    "message": {
                        "content": json.dumps(
                            {
                                "reasoning": "ok",
                                "plan": ["Crear A"],
                                "generated_script": "A = Point(0, 0)",
                            }
                        )
                    }
                }
            ]
        }

    OpenAICompatiblePlanner(
        base_url=configured_url,
        api_key="sk-test",
        model="gpt-4o",
        transport=transport,
    ).generate_plan("crea un punto")

    assert calls == [expected_url]


def test_empty_script_raises_unsupported_request() -> None:
    transport = _ok_transport({"reasoning": "No puedo.", "plan": [], "generated_script": ""})
    with pytest.raises(UnsupportedRequestError):
        OpenAICompatiblePlanner(
            base_url="https://api.openai.com/v1",
            api_key="sk-test",
            model="gpt-4o",
            transport=transport,
        ).generate_plan("demuestra un teorema")


def test_http_401_raises_api_key_error() -> None:
    with pytest.raises(PlannerError, match="API key"):
        OpenAICompatiblePlanner(
            base_url="https://api.openai.com/v1",
            api_key="bad",
            model="gpt-4o",
            transport=_raise_http_error(401, "Unauthorized"),
        ).generate_plan("dibuja algo")


def test_http_404_raises_model_not_found_error() -> None:
    with pytest.raises(PlannerError, match="model"):
        OpenAICompatiblePlanner(
            base_url="https://api.openai.com/v1",
            api_key="sk-test",
            model="gpt-bad",
            transport=_raise_http_error(404, "Not Found"),
        ).generate_plan("dibuja algo")


def test_http_500_raises_generic_error() -> None:
    with pytest.raises(PlannerError, match="HTTP 500"):
        OpenAICompatiblePlanner(
            base_url="https://api.openai.com/v1",
            api_key="sk-test",
            model="gpt-4o",
            transport=_raise_http_error(500, "Internal Server Error"),
        ).generate_plan("dibuja algo")


def test_connection_error_raises_planner_error() -> None:
    def transport(url: str, body: dict, api_key: str) -> dict:
        raise urllib.error.URLError("Connection refused")

    with pytest.raises(PlannerError, match="reach"):
        OpenAICompatiblePlanner(
            base_url="http://localhost:9999",
            api_key="",
            model="x",
            transport=transport,
        ).generate_plan("dibuja algo")


@pytest.mark.parametrize(
    "error",
    [TimeoutError("timed out"), urllib.error.URLError(TimeoutError("timed out"))],
)
def test_timeout_raises_provider_timeout_error(error: Exception) -> None:
    def transport(url: str, body: dict, api_key: str) -> dict:
        raise error

    with pytest.raises(ProviderTimeoutError, match="300 seconds"):
        OpenAICompatiblePlanner(
            base_url="https://api.openai.com/v1",
            api_key="sk-test",
            model="gpt-4o",
            transport=transport,
        ).generate_plan("dibuja algo")

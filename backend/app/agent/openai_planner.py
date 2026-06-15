"""OpenAI-compatible planner — works with OpenAI and Nvidia NIM.

Both providers expose an OpenAI-compatible /chat/completions endpoint.
Configure via ProviderConfig (base_url, api_key, model).

Like OllamaPlanner, only _complete() is implemented here.
BaseScriptPlanner owns validation and the repair-retry loop.
"""

from __future__ import annotations

import json
import urllib.error
import urllib.request
from typing import Any, Callable

from app.agent.planner import PlannerError, ProviderTimeoutError
from app.agent.script_planner import SYSTEM_PROMPT, BaseScriptPlanner

_TIMEOUT_SECONDS = 300

Transport = Callable[[str, dict[str, Any], str], dict[str, Any]]


class OpenAICompatiblePlanner(BaseScriptPlanner):
    """Planner backed by any OpenAI-compatible /chat/completions endpoint."""

    def __init__(
        self,
        *,
        base_url: str,
        api_key: str,
        model: str,
        temperature: float = 1.0,
        transport: Transport | None = None,
    ) -> None:
        self._base_url = base_url.strip().rstrip("/")
        self._endpoint_url = _resolve_chat_completions_url(self._base_url)
        self._api_key = api_key
        self._model = model
        self._temperature = temperature
        self._transport = transport or _http_post_json

    def _complete(self, messages: list[dict[str, Any]]) -> str:
        payload = {
            "model": self._model,
            "messages": [{"role": "system", "content": SYSTEM_PROMPT}, *messages],
            "response_format": {"type": "json_object"},
            "temperature": self._temperature,
        }
        url = self._endpoint_url
        try:
            data = self._transport(url, payload, self._api_key)
        except TimeoutError as error:
            raise ProviderTimeoutError(
                f"The provider did not respond within {_TIMEOUT_SECONDS} seconds. "
                "Please try again or choose a faster model."
            ) from error
        except urllib.error.HTTPError as error:
            detail = error.read().decode("utf-8", "replace") if error.fp else ""
            if error.code == 401:
                raise PlannerError(
                    "Invalid or missing API key for this provider. "
                    "Check the API key in the assistant configuration."
                ) from error
            if error.code == 404:
                raise PlannerError(
                    f"The model `{self._model}` was not found at this endpoint. "
                    "Check the model name and base URL in the assistant configuration."
                ) from error
            raise PlannerError(
                f"The provider returned HTTP {error.code}. Details: {detail or error.reason}"
            ) from error
        except urllib.error.URLError as error:
            if isinstance(error.reason, TimeoutError):
                raise ProviderTimeoutError(
                    f"The provider did not respond within {_TIMEOUT_SECONDS} seconds. "
                    "Please try again or choose a faster model."
                ) from error
            raise PlannerError(
                f"Could not reach the provider at `{self._base_url}`. "
                f"Check the base URL in the assistant configuration. Details: {error}"
            ) from error
        except json.JSONDecodeError as error:
            raise PlannerError("The provider returned malformed JSON.") from error

        try:
            return data["choices"][0]["message"]["content"]
        except (KeyError, IndexError, TypeError) as error:
            raise PlannerError("The provider returned an unexpected response shape.") from error


def _http_post_json(url: str, payload: dict[str, Any], api_key: str) -> dict[str, Any]:
    body = json.dumps(payload).encode("utf-8")
    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {api_key}",
    }
    request = urllib.request.Request(url, data=body, headers=headers, method="POST")
    with urllib.request.urlopen(request, timeout=_TIMEOUT_SECONDS) as response:
        return json.loads(response.read().decode("utf-8"))


def _resolve_chat_completions_url(base_url: str) -> str:
    """Accept either an API base URL or a complete chat-completions URL.

    Provider dashboards commonly show the complete endpoint. Appending the
    path unconditionally produced URLs such as
    ``.../v1/chat/completions/chat/completions``, which some compatible
    gateways report as ``Method Not Allowed``.
    """
    if base_url.lower().endswith("/chat/completions"):
        return base_url
    return f"{base_url}/chat/completions"

"""Local Ollama planner — zero per-token cost, no API key, runs on your machine.

Talks to a local Ollama server (https://ollama.com) over its native chat API.
Requires Ollama running locally with a pulled model, e.g.:

    ollama pull llama3.1
    ollama serve            # usually already running as a background service

Configuration (environment variables, all optional):
    OLLAMA_BASE_URL   default http://localhost:11434
    OLLAMA_MODEL      default llama3.1

Like the Claude planner, this only *proposes* a script; the deterministic
`evaluate_script` in the shared base validates it before it is ever returned.
"""

from __future__ import annotations

import json
import os
import urllib.error
import urllib.request
from typing import Any, Callable

from app.agent.planner import PlannerError, ProviderTimeoutError
from app.agent.script_planner import PLAN_SCHEMA, SYSTEM_PROMPT, BaseScriptPlanner

DEFAULT_BASE_URL = "http://localhost:11434"
DEFAULT_MODEL = "llama3.1"
_TIMEOUT_SECONDS = 300

# A transport takes (url, json_payload) and returns the decoded JSON response.
Transport = Callable[[str, dict[str, Any]], dict[str, Any]]


class OllamaPlanner(BaseScriptPlanner):
    """Planner backed by a local Ollama model."""

    def __init__(
        self,
        *,
        model: str | None = None,
        base_url: str | None = None,
        temperature: float = 0.0,
        transport: Transport | None = None,
    ) -> None:
        self._model = model or os.getenv("OLLAMA_MODEL", DEFAULT_MODEL)
        self._base_url = (
            (base_url or os.getenv("OLLAMA_BASE_URL", DEFAULT_BASE_URL)).strip().rstrip("/")
        )
        self._endpoint_url = _resolve_chat_url(self._base_url)
        self._temperature = temperature
        self._transport = transport or _http_post_json

    def _complete(self, messages: list[dict[str, Any]]) -> str:
        payload = {
            "model": self._model,
            "messages": [{"role": "system", "content": SYSTEM_PROMPT}, *messages],
            "stream": False,
            "format": PLAN_SCHEMA,  # Ollama structured outputs (>= 0.5)
            "options": {"temperature": self._temperature},
        }
        try:
            data = self._transport(self._endpoint_url, payload)
        except TimeoutError as error:
            raise ProviderTimeoutError(
                f"Ollama did not respond within {_TIMEOUT_SECONDS} seconds. "
                "Please try again or choose a faster model."
            ) from error
        except urllib.error.HTTPError as error:
            model = payload.get("model", DEFAULT_MODEL)
            detail = error.read().decode("utf-8", "replace") if error.fp else ""
            if error.code == 404:
                raise PlannerError(
                    f"Ollama is running but the model `{model}` is not installed. "
                    f"Pull it with `ollama pull {model}`, or set OLLAMA_MODEL to an "
                    "installed model (run `ollama list` to see available models)."
                ) from error
            raise PlannerError(
                f"The Ollama server returned HTTP {error.code}. Details: {detail or error.reason}"
            ) from error
        except urllib.error.URLError as error:
            if isinstance(error.reason, TimeoutError):
                raise ProviderTimeoutError(
                    f"Ollama did not respond within {_TIMEOUT_SECONDS} seconds. "
                    "Please try again or choose a faster model."
                ) from error
            raise PlannerError(
                "Could not reach the local Ollama server. Make sure Ollama is installed "
                "and running (`ollama serve`) and the model is pulled "
                f"(`ollama pull {payload.get('model', DEFAULT_MODEL)}`). Details: {error}"
            ) from error
        except json.JSONDecodeError as error:
            raise PlannerError("The Ollama server returned malformed JSON.") from error
        try:
            content = data["message"]["content"]
        except (KeyError, TypeError):
            content = None
        if isinstance(content, str) and content:
            return content
        raise PlannerError(
            "The Ollama planner returned an unexpected response. "
            f"Response: {_response_preview(data)}"
        )


def _http_post_json(url: str, payload: dict[str, Any]) -> dict[str, Any]:
    body = json.dumps(payload).encode("utf-8")
    request = urllib.request.Request(
        url, data=body, headers={"Content-Type": "application/json"}, method="POST"
    )
    with urllib.request.urlopen(request, timeout=_TIMEOUT_SECONDS) as response:
        return json.loads(response.read().decode("utf-8"))


def _resolve_chat_url(base_url: str) -> str:
    """Accept either an Ollama server base URL or its complete chat URL."""
    if base_url.lower().endswith("/api/chat"):
        return base_url
    return f"{base_url}/api/chat"


def _response_preview(data: Any, limit: int = 2000) -> str:
    """Return a bounded JSON diagnostic from Ollama's response."""
    try:
        preview = json.dumps(data, ensure_ascii=False, default=str)
    except (TypeError, ValueError):
        preview = repr(data)
    if len(preview) <= limit:
        return preview
    return f"{preview[:limit]}… [truncated]"

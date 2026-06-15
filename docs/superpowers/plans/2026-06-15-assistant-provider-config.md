# Assistant Provider Config Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Añadir un menú de configuración en el panel del asistente para seleccionar proveedor LLM (Ollama, OpenAI, Nvidia NIM), modelo, URL base y API key, con persistencia en localStorage.

**Architecture:** La config viaja en el body de cada petición `/agent/plan`; el backend crea el planner adecuado por request en lugar de usar un singleton. OpenAI y Nvidia comparten `OpenAICompatiblePlanner` (misma API, distinta URL/key). El frontend guarda la config en localStorage y la muestra en una barra compacta con popover flotante bajo el header del asistente.

**Tech Stack:** Python/FastAPI (backend), React/TypeScript/Tailwind (frontend), urllib (HTTP en backend, sin nuevas deps), localStorage (persistencia frontend).

---

## Archivos

| Acción | Ruta |
|--------|------|
| Modificar | `backend/app/agent/schemas.py` |
| Crear | `backend/app/agent/openai_planner.py` |
| Modificar | `backend/app/services.py` |
| Modificar | `backend/app/agent/router.py` |
| Crear | `backend/tests/test_agent_openai_planner.py` |
| Modificar | `frontend/src/agent/types.ts` |
| Crear | `frontend/src/agent/useAssistantConfig.ts` |
| Crear | `frontend/src/components/assistant/ConfigPopover.tsx` |
| Modificar | `frontend/src/components/assistant/AssistantPanel.tsx` |

---

## Task 1: Backend — `ProviderConfig` schema

**Files:**
- Modify: `backend/app/agent/schemas.py`

- [ ] **Step 1: Añadir `ProviderConfig` a schemas.py**

Reemplazar el contenido completo de `backend/app/agent/schemas.py`:

```python
"""Schemas for deterministic agent planning."""

from typing import Literal

from pydantic import Field

from app.geometry.models import GeometryModel


class ProviderConfig(GeometryModel):
    provider: Literal["ollama", "openai", "nvidia"]
    model: str = Field(min_length=1)
    base_url: str = Field(min_length=1)
    api_key: str = ""


class AgentPlanRequest(GeometryModel):
    user_request: str = Field(min_length=1, max_length=1000)
    current_script: str | None = None
    config: ProviderConfig | None = None


class AgentResponse(GeometryModel):
    reasoning: str
    plan: list[str]
    generated_script: str
    warnings: list[str] = Field(default_factory=list)


class AgentPlanErrorDetail(GeometryModel):
    code: str
    message: str
```

- [ ] **Step 2: Verificar que los tests existentes siguen pasando**

```bash
cd backend && source .venv/bin/activate
pytest tests/test_agent_planner_api.py -v
```

Esperado: todos los tests existentes en PASS (la adición de `config` con valor por defecto `None` es retrocompatible).

- [ ] **Step 3: Commit**

```bash
git add backend/app/agent/schemas.py
git commit -m "feat(backend): add ProviderConfig to AgentPlanRequest schema"
```

---

## Task 2: Backend — `OpenAICompatiblePlanner`

**Files:**
- Create: `backend/app/agent/openai_planner.py`
- Create: `backend/tests/test_agent_openai_planner.py`

- [ ] **Step 1: Escribir los tests primero**

Crear `backend/tests/test_agent_openai_planner.py`:

```python
"""Tests for OpenAICompatiblePlanner using a fake transport (no network)."""

import json
import urllib.error

import pytest

from app.agent.openai_planner import OpenAICompatiblePlanner
from app.agent.planner import PlannerError, UnsupportedRequestError
from app.geometry.script import evaluate_script


def _ok_transport(payload: dict):
    """Fake transport returning a valid OpenAI-style chat completion response."""
    def transport(url: str, body: dict) -> dict:
        return {"choices": [{"message": {"content": json.dumps(payload)}}]}
    return transport


def _raise_http_error(code: int, reason: str = "Error"):
    def transport(url: str, body: dict) -> dict:
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


def test_empty_script_raises_unsupported_request() -> None:
    transport = _ok_transport({"reasoning": "No puedo.", "plan": [], "generated_script": ""})
    with pytest.raises(UnsupportedRequestError):
        OpenAICompatiblePlanner(
            base_url="https://api.openai.com/v1", api_key="sk-test", model="gpt-4o",
            transport=transport,
        ).generate_plan("demuestra un teorema")


def test_http_401_raises_api_key_error() -> None:
    with pytest.raises(PlannerError, match="API key"):
        OpenAICompatiblePlanner(
            base_url="https://api.openai.com/v1", api_key="bad", model="gpt-4o",
            transport=_raise_http_error(401, "Unauthorized"),
        ).generate_plan("dibuja algo")


def test_http_404_raises_model_not_found_error() -> None:
    with pytest.raises(PlannerError, match="model"):
        OpenAICompatiblePlanner(
            base_url="https://api.openai.com/v1", api_key="sk-test", model="gpt-bad",
            transport=_raise_http_error(404, "Not Found"),
        ).generate_plan("dibuja algo")


def test_http_500_raises_generic_error() -> None:
    with pytest.raises(PlannerError, match="HTTP 500"):
        OpenAICompatiblePlanner(
            base_url="https://api.openai.com/v1", api_key="sk-test", model="gpt-4o",
            transport=_raise_http_error(500, "Internal Server Error"),
        ).generate_plan("dibuja algo")


def test_connection_error_raises_planner_error() -> None:
    import urllib.error

    def transport(url: str, body: dict) -> dict:
        raise urllib.error.URLError("Connection refused")

    with pytest.raises(PlannerError, match="reach"):
        OpenAICompatiblePlanner(
            base_url="http://localhost:9999", api_key="", model="x",
            transport=transport,
        ).generate_plan("dibuja algo")
```

- [ ] **Step 2: Ejecutar tests y confirmar que fallan (el módulo no existe aún)**

```bash
cd backend && source .venv/bin/activate
pytest tests/test_agent_openai_planner.py -v
```

Esperado: `ImportError` o `ModuleNotFoundError` — el módulo aún no existe.

- [ ] **Step 3: Crear `backend/app/agent/openai_planner.py`**

```python
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

from app.agent.planner import PlannerError
from app.agent.script_planner import SYSTEM_PROMPT, BaseScriptPlanner

_TIMEOUT_SECONDS = 120

Transport = Callable[[str, dict[str, Any]], dict[str, Any]]


class OpenAICompatiblePlanner(BaseScriptPlanner):
    """Planner backed by any OpenAI-compatible /chat/completions endpoint."""

    def __init__(
        self,
        *,
        base_url: str,
        api_key: str,
        model: str,
        transport: Transport | None = None,
    ) -> None:
        self._base_url = base_url.rstrip("/")
        self._api_key = api_key
        self._model = model
        self._transport = transport or _http_post_json

    def _complete(self, messages: list[dict[str, Any]]) -> str:
        payload = {
            "model": self._model,
            "messages": [{"role": "system", "content": SYSTEM_PROMPT}, *messages],
            "response_format": {"type": "json_object"},
            "temperature": 0,
        }
        url = f"{self._base_url}/chat/completions"
        try:
            data = self._transport(url, payload, self._api_key)
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
                f"The provider returned HTTP {error.code}. "
                f"Details: {detail or error.reason}"
            ) from error
        except urllib.error.URLError as error:
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
```

- [ ] **Step 4: Ejecutar tests y confirmar que pasan**

```bash
cd backend && source .venv/bin/activate
pytest tests/test_agent_openai_planner.py -v
```

Esperado: 6 tests en PASS.

- [ ] **Step 5: Lint y formato**

```bash
ruff check app/agent/openai_planner.py tests/test_agent_openai_planner.py
ruff format app/agent/openai_planner.py tests/test_agent_openai_planner.py
```

- [ ] **Step 6: Commit**

```bash
git add backend/app/agent/openai_planner.py backend/tests/test_agent_openai_planner.py
git commit -m "feat(backend): add OpenAICompatiblePlanner for OpenAI and Nvidia NIM"
```

---

## Task 3: Backend — `create_planner` + router por request

**Files:**
- Modify: `backend/app/services.py`
- Modify: `backend/app/agent/router.py`

- [ ] **Step 1: Reemplazar el singleton en `services.py`**

Reemplazar el contenido completo de `backend/app/services.py`:

```python
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
        if config.provider == "ollama":
            return OllamaPlanner(base_url=config.base_url, model=config.model)
        if config.provider in ("openai", "nvidia"):
            return OpenAICompatiblePlanner(
                base_url=config.base_url,
                api_key=config.api_key,
                model=config.model,
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
```

- [ ] **Step 2: Actualizar `router.py` para crear el planner por request**

En `backend/app/agent/router.py`, reemplazar las líneas de importación y el endpoint `/plan`:

```python
"""HTTP adapter for discovery and execution of deterministic agent tools."""

from fastapi import APIRouter, HTTPException, status

from app.agent.models import ExecuteToolRequest, ExecuteToolResponse, ToolDescriptor
from app.agent.planner import PlannerError, UnsupportedRequestError
from app.agent.registry import (
    InvalidToolInputError,
    ToolExecutionError,
    UnknownToolError,
)
from app.agent.schemas import AgentPlanErrorDetail, AgentPlanRequest, AgentResponse
from app.services import create_planner, tool_registry

router = APIRouter(prefix="/agent", tags=["agent"])


@router.post("/plan", response_model=AgentResponse)
def plan_construction(request: AgentPlanRequest) -> AgentResponse:
    """Generate and validate a script proposal without mutating geometry state."""
    planner = create_planner(request.config)
    try:
        return planner.generate_plan(request.user_request, request.current_script)
    except UnsupportedRequestError as error:
        detail = AgentPlanErrorDetail(code="unsupported_request", message=str(error))
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=detail.model_dump(by_alias=True),
        ) from error
    except PlannerError as error:
        detail = AgentPlanErrorDetail(code="planning_failed", message=str(error))
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=detail.model_dump(by_alias=True),
        ) from error


@router.get("/tools", response_model=list[ToolDescriptor])
def list_tools() -> tuple[ToolDescriptor, ...]:
    """Return JSON-schema tool descriptors suitable for a future LLM adapter."""
    return tool_registry.descriptors()


@router.post("/execute-tool", response_model=ExecuteToolResponse)
def execute_tool(request: ExecuteToolRequest) -> ExecuteToolResponse:
    """Validate and execute one deterministic tool call."""
    try:
        definition, output = tool_registry.execute(request.tool_name, request.arguments)
    except UnknownToolError as error:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "unknown_tool", "message": str(error)},
        ) from error
    except InvalidToolInputError as error:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail={
                "code": "invalid_tool_arguments",
                "message": str(error),
                "errors": error.errors,
            },
        ) from error
    except ToolExecutionError as error:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail={"code": "tool_execution_failed", "message": str(error)},
        ) from error

    return ExecuteToolResponse(
        tool_name=definition.name,
        mutates_geometry_state=definition.mutates_geometry_state,
        output=output.model_dump(by_alias=True),
    )
```

- [ ] **Step 3: Ejecutar toda la suite del backend**

```bash
cd backend && source .venv/bin/activate
pytest -v
```

Esperado: todos los tests en PASS. Si falla `test_agent_planner_api.py` por un import de `agent_planner`, busca y elimina esa referencia en ese archivo de test.

- [ ] **Step 4: Lint y formato**

```bash
ruff check app/services.py app/agent/router.py
ruff format app/services.py app/agent/router.py
```

- [ ] **Step 5: Commit**

```bash
git add backend/app/services.py backend/app/agent/router.py
git commit -m "feat(backend): create planner per-request from ProviderConfig"
```

---

## Task 4: Frontend — Tipos y hook `useAssistantConfig`

**Files:**
- Modify: `frontend/src/agent/types.ts`
- Create: `frontend/src/agent/useAssistantConfig.ts`

- [ ] **Step 1: Actualizar `frontend/src/agent/types.ts`**

Reemplazar el contenido completo:

```typescript
export type ProviderName = "ollama" | "openai" | "nvidia";

export interface AssistantConfig {
  provider: ProviderName;
  model: string;
  baseUrl: string;
  apiKey: string;
}

export const PROVIDER_DEFAULTS: Record<ProviderName, AssistantConfig> = {
  ollama: {
    provider: "ollama",
    model: "llama3.1",
    baseUrl: "http://localhost:11434",
    apiKey: "",
  },
  openai: {
    provider: "openai",
    model: "gpt-4o",
    baseUrl: "https://api.openai.com/v1",
    apiKey: "",
  },
  nvidia: {
    provider: "nvidia",
    model: "meta/llama-3.1-70b-instruct",
    baseUrl: "https://integrate.api.nvidia.com/v1",
    apiKey: "",
  },
};

export interface AgentPlanRequest {
  userRequest: string;
  currentScript?: string;
  config: AssistantConfig;
}

export interface AgentResponse {
  reasoning: string;
  plan: string[];
  generatedScript: string;
  warnings: string[];
}

export interface AgentPlanErrorDetail {
  code: string;
  message: string;
}

export interface AssistantMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
}
```

- [ ] **Step 2: Crear `frontend/src/agent/useAssistantConfig.ts`**

```typescript
import { useState } from "react";
import type { AssistantConfig } from "./types";
import { PROVIDER_DEFAULTS } from "./types";

const STORAGE_KEY = "mathllm_assistant_config";

function loadConfig(): AssistantConfig {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored !== null) return JSON.parse(stored) as AssistantConfig;
  } catch {
    // corrupted storage — reset to default
  }
  return PROVIDER_DEFAULTS.ollama;
}

export function useAssistantConfig(): [AssistantConfig, (c: AssistantConfig) => void] {
  const [config, setConfigState] = useState<AssistantConfig>(loadConfig);

  const setConfig = (c: AssistantConfig): void => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(c));
    } catch {
      // storage full or unavailable — keep in memory only
    }
    setConfigState(c);
  };

  return [config, setConfig];
}
```

- [ ] **Step 3: Verificar que TypeScript compila sin errores**

```bash
cd frontend && npm run typecheck 2>&1 | head -30
```

Esperado: sin errores relacionados con los nuevos tipos. Si hay errores en `AssistantPanel.tsx` por `AgentPlanRequest` (falta el campo `config`), es esperado — se resuelve en Task 6.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/agent/types.ts frontend/src/agent/useAssistantConfig.ts
git commit -m "feat(frontend): add AssistantConfig types, PROVIDER_DEFAULTS and useAssistantConfig hook"
```

---

## Task 5: Frontend — Componente `ConfigPopover`

**Files:**
- Create: `frontend/src/components/assistant/ConfigPopover.tsx`

- [ ] **Step 1: Crear `frontend/src/components/assistant/ConfigPopover.tsx`**

```tsx
import { useEffect, useRef, useState } from "react";
import { Settings } from "lucide-react";
import type { AssistantConfig, ProviderName } from "../../agent/types";
import { PROVIDER_DEFAULTS } from "../../agent/types";

interface ConfigPopoverProps {
  config: AssistantConfig;
  onChange: (c: AssistantConfig) => void;
}

const PROVIDER_LABELS: Record<ProviderName, string> = {
  ollama: "Ollama",
  openai: "OpenAI",
  nvidia: "Nvidia",
};

export function ConfigPopover({ config, onChange }: ConfigPopoverProps) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<AssistantConfig>(config);
  const [showKey, setShowKey] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setDraft(config);
  }, [config]);

  useEffect(() => {
    if (!open) return;
    const handlePointerDown = (event: MouseEvent): void => {
      if (ref.current !== null && !ref.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  const handleProviderChange = (provider: ProviderName): void => {
    setDraft(PROVIDER_DEFAULTS[provider]);
    setShowKey(false);
  };

  const handleSave = (): void => {
    onChange(draft);
    setOpen(false);
  };

  return (
    <div className="relative" ref={ref}>
      {/* Compact bar */}
      <button
        type="button"
        aria-label="Configurar proveedor del asistente"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-1.5 rounded-lg border border-edge bg-surface-muted px-2.5 py-1.5 text-left text-xs text-muted transition-colors hover:border-brand-400 hover:text-content focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500"
      >
        <Settings size={12} aria-hidden className="shrink-0" />
        <span className="truncate">
          {PROVIDER_LABELS[config.provider]} / {config.model}
        </span>
        <span className="ml-auto shrink-0 text-[10px] opacity-50">▾</span>
      </button>

      {open ? (
        <div
          role="dialog"
          aria-label="Configuración del asistente"
          className="absolute left-0 top-full z-20 mt-1 w-72 rounded-xl border border-edge bg-surface p-4 shadow-pop"
        >
          {/* Provider tabs */}
          <p className="mb-2 text-[0.65rem] font-semibold uppercase tracking-[0.1em] text-muted">
            Proveedor
          </p>
          <div className="mb-4 flex gap-1.5">
            {(["ollama", "openai", "nvidia"] as ProviderName[]).map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => handleProviderChange(p)}
                className={`rounded-md px-2.5 py-1 text-xs font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand-500 ${
                  draft.provider === p
                    ? "bg-brand-600 text-white"
                    : "border border-edge text-muted hover:text-content"
                }`}
              >
                {PROVIDER_LABELS[p]}
              </button>
            ))}
          </div>

          {/* Model */}
          <label className="mb-3 block">
            <span className="mb-1 block text-[0.65rem] font-semibold uppercase tracking-[0.1em] text-muted">
              Modelo
            </span>
            <input
              type="text"
              value={draft.model}
              onChange={(e) => setDraft((d) => ({ ...d, model: e.target.value }))}
              className="w-full rounded-lg border border-edge bg-surface-muted px-2.5 py-1.5 text-xs text-content focus:border-brand-400 focus:outline-2 focus:outline-offset-1 focus:outline-brand-500/30"
            />
          </label>

          {/* URL base */}
          <label className="mb-3 block">
            <span className="mb-1 block text-[0.65rem] font-semibold uppercase tracking-[0.1em] text-muted">
              URL base{draft.provider === "openai" ? " (opcional)" : ""}
            </span>
            <input
              type="text"
              value={draft.baseUrl}
              onChange={(e) => setDraft((d) => ({ ...d, baseUrl: e.target.value }))}
              className="w-full rounded-lg border border-edge bg-surface-muted px-2.5 py-1.5 text-xs text-content focus:border-brand-400 focus:outline-2 focus:outline-offset-1 focus:outline-brand-500/30"
            />
          </label>

          {/* API key (only for openai / nvidia) */}
          {draft.provider !== "ollama" ? (
            <label className="mb-4 block">
              <span className="mb-1 block text-[0.65rem] font-semibold uppercase tracking-[0.1em] text-muted">
                API key
              </span>
              <div className="flex items-center gap-1">
                <input
                  type={showKey ? "text" : "password"}
                  value={draft.apiKey}
                  placeholder={draft.provider === "nvidia" ? "nvapi-…" : "sk-…"}
                  onChange={(e) => setDraft((d) => ({ ...d, apiKey: e.target.value }))}
                  className="min-w-0 flex-1 rounded-lg border border-edge bg-surface-muted px-2.5 py-1.5 text-xs text-content focus:border-brand-400 focus:outline-2 focus:outline-offset-1 focus:outline-brand-500/30"
                />
                <button
                  type="button"
                  aria-label={showKey ? "Ocultar API key" : "Mostrar API key"}
                  onClick={() => setShowKey((v) => !v)}
                  className="shrink-0 rounded-lg border border-edge px-2 py-1.5 text-xs text-muted hover:text-content focus-visible:outline-2 focus-visible:outline-brand-500"
                >
                  {showKey ? "🙈" : "👁"}
                </button>
              </div>
            </label>
          ) : (
            <p className="mb-4 text-[0.65rem] italic text-muted">
              Ollama corre en local — no necesita API key.
            </p>
          )}

          <button
            type="button"
            onClick={handleSave}
            className="w-full rounded-lg bg-brand-600 px-3 py-2 text-xs font-semibold text-white transition-colors hover:bg-brand-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500"
          >
            Guardar
          </button>
        </div>
      ) : null}
    </div>
  );
}
```

- [ ] **Step 2: Verificar que TypeScript compila**

```bash
cd frontend && npm run typecheck 2>&1 | grep -E "error|Error" | head -20
```

Esperado: sin errores en `ConfigPopover.tsx`.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/assistant/ConfigPopover.tsx
git commit -m "feat(frontend): add ConfigPopover component with provider/model/apiKey fields"
```

---

## Task 6: Frontend — Integrar en `AssistantPanel`

**Files:**
- Modify: `frontend/src/components/assistant/AssistantPanel.tsx`

- [ ] **Step 1: Reemplazar el contenido de `AssistantPanel.tsx`**

```tsx
import { useState } from "react";
import type { FormEvent } from "react";
import { Sparkles } from "lucide-react";

import { AgentPlanningError, plannerClient } from "../../agent/planner";
import { scriptGenerator } from "../../agent/scriptGenerator";
import { useAssistantConfig } from "../../agent/useAssistantConfig";
import type { AgentResponse, AssistantMessage } from "../../agent/types";
import type { GeometryDocument } from "../../types/geometry";
import { ConfigPopover } from "./ConfigPopover";

interface AssistantPanelProps {
  document: GeometryDocument;
  applyingScript: boolean;
  onApplyScript: (script: string) => Promise<void>;
}

const INITIAL_MESSAGE: AssistantMessage = {
  id: "welcome",
  role: "assistant",
  content:
    "Describe a construction in natural language (any language). I will generate a " +
    "deterministically validated script for your review.",
};

export function AssistantPanel({ document, applyingScript, onApplyScript }: AssistantPanelProps) {
  const [config, setConfig] = useAssistantConfig();
  const [messages, setMessages] = useState<AssistantMessage[]>([INITIAL_MESSAGE]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [applying, setApplying] = useState(false);
  const [response, setResponse] = useState<AgentResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    const request = input.trim();
    if (!request || loading) {
      return;
    }
    setInput("");
    setError(null);
    setResponse(null);
    setMessages((current) => [
      ...current,
      { id: createMessageId(), role: "user", content: request },
    ]);
    setLoading(true);
    void plannerClient
      .generatePlan({
        userRequest: request,
        currentScript: scriptGenerator.generate(document),
        config,
      })
      .then((plan) => {
        setResponse(plan);
        setMessages((current) => [
          ...current,
          { id: createMessageId(), role: "assistant", content: plan.reasoning },
        ]);
      })
      .catch((planningError: unknown) => {
        const message =
          planningError instanceof AgentPlanningError
            ? planningError.message
            : "The planner could not process this request.";
        setError(message);
        setMessages((current) => [
          ...current,
          { id: createMessageId(), role: "assistant", content: message },
        ]);
      })
      .finally(() => setLoading(false));
  };

  const handleApply = (): void => {
    if (response === null || applying || applyingScript) {
      return;
    }
    setApplying(true);
    setError(null);
    void onApplyScript(response.generatedScript)
      .then(() => {
        setMessages((current) => [
          ...current,
          { id: createMessageId(), role: "assistant", content: "The reviewed script was applied." },
        ]);
      })
      .catch((applyError: unknown) => {
        setError(applyError instanceof Error ? applyError.message : "The script could not be applied.");
      })
      .finally(() => setApplying(false));
  };

  return (
    <section className="p-4" aria-labelledby="assistant-heading">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div>
          <p className="m-0 text-xs font-semibold uppercase tracking-[0.13em] text-brand-600">
            AI planner
          </p>
          <h2
            id="assistant-heading"
            className="m-0 mt-0.5 flex items-center gap-1.5 text-lg font-bold tracking-tight text-content"
          >
            <Sparkles size={18} aria-hidden className="text-brand-600" />
            Assistant
          </h2>
        </div>
        <span className="rounded-full bg-success-soft px-2.5 py-1 text-[0.65rem] font-semibold uppercase tracking-wide text-success-fg">
          Validated
        </span>
      </div>

      <div className="mb-3">
        <ConfigPopover config={config} onChange={setConfig} />
      </div>

      <div
        className="flex max-h-64 flex-col gap-2 overflow-y-auto"
        aria-label="Assistant chat history"
        aria-live="polite"
      >
        {messages.map((message) => (
          <article
            key={message.id}
            className={`max-w-[92%] rounded-xl px-3 py-2 text-sm leading-snug ${
              message.role === "user"
                ? "self-end bg-brand-600 text-white"
                : "self-start bg-surface-muted text-muted"
            }`}
          >
            <strong className="mb-0.5 block text-[0.65rem] font-semibold uppercase tracking-wide opacity-80">
              {message.role === "user" ? "You" : "Assistant"}
            </strong>
            <p className="m-0">{message.content}</p>
          </article>
        ))}
        {loading ? (
          <p className="m-0 text-sm font-semibold text-brand-600">Planning and validating…</p>
        ) : null}
      </div>

      <form className="mt-3 flex flex-col gap-2" onSubmit={handleSubmit}>
        <label className="sr-only" htmlFor="assistant-request">
          Describe a geometry construction
        </label>
        <textarea
          id="assistant-request"
          value={input}
          rows={3}
          placeholder="Dibuja un triángulo ABC y traza la altura desde C."
          disabled={loading}
          onChange={(event) => setInput(event.target.value)}
          className="w-full resize-y rounded-lg border border-edge bg-surface p-3 text-sm leading-snug text-content focus:border-brand-400 focus:outline-2 focus:outline-offset-1 focus:outline-brand-500/30 disabled:opacity-60"
        />
        <button
          type="submit"
          disabled={loading || !input.trim()}
          className="rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500 disabled:cursor-not-allowed disabled:opacity-55"
        >
          {loading ? "Planning…" : "Send"}
        </button>
      </form>

      {error ? (
        <div
          role="alert"
          className="mt-3 rounded-lg border border-danger-edge bg-danger-soft p-3 text-sm leading-snug text-danger-fg"
        >
          {error}
        </div>
      ) : null}

      {response ? (
        <section
          className="mt-4 border-t border-edge pt-3"
          aria-label="Generated construction preview"
        >
          <h3 className="m-0 mb-1.5 text-sm font-semibold text-content">Plan</h3>
          <ol className="m-0 list-decimal pl-5 text-sm leading-relaxed text-muted">
            {response.plan.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
          {response.warnings.map((warning) => (
            <p
              key={warning}
              className="mt-2.5 rounded-lg border border-warning-edge bg-warning-soft p-2.5 text-sm leading-snug text-warning-fg"
            >
              {warning}
            </p>
          ))}
          <h3 className="m-0 mb-1.5 mt-3 text-sm font-semibold text-content">Generated script</h3>
          <pre className="m-0 max-h-60 overflow-auto whitespace-pre rounded-lg border border-edge bg-surface-muted p-3 font-mono text-[0.75rem] leading-relaxed text-content">
            <code>{response.generatedScript}</code>
          </pre>
          <button
            type="button"
            disabled={applying || applyingScript}
            onClick={handleApply}
            style={{ backgroundColor: "var(--geo-segment)" }}
            className="mt-2.5 w-full rounded-lg px-4 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500 disabled:cursor-not-allowed disabled:opacity-55"
          >
            {applying || applyingScript ? "Applying…" : "Apply Script"}
          </button>
        </section>
      ) : null}
    </section>
  );
}

function createMessageId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}
```

- [ ] **Step 2: Verificar TypeScript sin errores**

```bash
cd frontend && npm run typecheck
```

Esperado: 0 errores.

- [ ] **Step 3: Ejecutar los tests del frontend**

```bash
cd frontend && npm run test -- --run
```

Esperado: todos los tests en PASS.

- [ ] **Step 4: Levantar el stack y verificar manualmente**

En terminales separadas:
```bash
# Terminal 1
cd backend && source .venv/bin/activate && uvicorn app.main:app --reload

# Terminal 2
cd frontend && npm run dev
```

Abrir http://localhost:5173, ir a la pestaña **Assistant** y verificar:
1. Aparece la barra compacta "Ollama / llama3.1 ▾" bajo el header.
2. Al hacer clic se abre el popover con tabs (Ollama / OpenAI / Nvidia).
3. Cambiar a OpenAI → aparecen campos API key y URL base con sus defaults.
4. Guardar → la barra muestra el nuevo proveedor/modelo.
5. Recargar la página → la config persiste.
6. Enviar "dibuja un triángulo" con Ollama → respuesta correcta.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/assistant/AssistantPanel.tsx
git commit -m "feat(frontend): integrate ConfigPopover in AssistantPanel with provider config per request"
```

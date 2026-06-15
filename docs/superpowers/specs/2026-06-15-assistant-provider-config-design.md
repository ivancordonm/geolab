# Diseño: Configuración de proveedor LLM en el asistente

## Contexto

El asistente del panel usa actualmente el proveedor definido por variable de entorno en el backend (`MATHLLM_LLM_PROVIDER`). El usuario quiere poder cambiar el proveedor (Ollama local, OpenAI, Nvidia NIM) y sus parámetros (modelo, URL base, API key) directamente desde la UI, sin tocar variables de entorno ni reiniciar el servidor.

## Decisiones de diseño

- **Barra compacta** bajo el header del asistente que muestra `proveedor / modelo` activo.
- **Popover flotante** anclado a esa barra con los campos por proveedor.
- **Persistencia en localStorage** — sobrevive recargas; API key en texto plano (uso local).
- **Config enviada con cada petición** — la config viaja en el body de `/agent/plan`, el backend crea el planner por request en lugar de usar un singleton.
- **OpenAI y Nvidia comparten el mismo planner** — Nvidia NIM expone una API compatible con OpenAI; un solo `OpenAICompatiblePlanner` sirve para ambos cambiando la URL base y la key.

## Campos por proveedor

| Campo       | Ollama              | OpenAI                        | Nvidia NIM                                      |
|-------------|---------------------|-------------------------------|-------------------------------------------------|
| URL base    | `http://localhost:11434` | `https://api.openai.com/v1` (opcional) | `https://integrate.api.nvidia.com/v1` |
| Modelo      | `llama3.1`          | `gpt-4o`                      | `meta/llama-3.1-70b-instruct`                  |
| API key     | — (no requerida)    | `sk-…` (requerida)            | `nvapi-…` (requerida)                           |

---

## Arquitectura

### Frontend

#### 1. Tipo `AssistantConfig` — `frontend/src/agent/types.ts`

```typescript
export type ProviderName = "ollama" | "openai" | "nvidia";

export interface AssistantConfig {
  provider: ProviderName;
  model: string;
  baseUrl: string;
  apiKey: string;   // vacío para Ollama
}
```

Defaults por proveedor (constante exportada del mismo archivo):

```typescript
export const PROVIDER_DEFAULTS: Record<ProviderName, AssistantConfig>
```

#### 2. Hook `useAssistantConfig` — `frontend/src/agent/useAssistantConfig.ts`

- Lee/escribe en `localStorage` bajo la clave `"mathllm_assistant_config"`.
- Devuelve `[config, setConfig]`.
- Aplica el default de Ollama si no hay config guardada.

#### 3. `AgentPlanRequest` actualizado — `frontend/src/agent/types.ts`

```typescript
interface AgentPlanRequest {
  userRequest: string;
  currentScript?: string;
  config: AssistantConfig;   // ← nuevo
}
```

#### 4. Componente `ConfigPopover` — `frontend/src/components/assistant/ConfigPopover.tsx`

- Recibe `config: AssistantConfig` y `onChange: (c: AssistantConfig) => void`.
- Tabs de proveedor (Ollama / OpenAI / Nvidia) que cambian los campos visibles.
- Campo API key con toggle show/hide (👁).
- Botón "Guardar" llama `onChange` y cierra el popover.
- Se cierra también al hacer clic fuera (mismo patrón que `PersistenceControls`).

#### 5. `AssistantPanel` actualizado — `frontend/src/components/assistant/AssistantPanel.tsx`

- Usa `useAssistantConfig()` internamente.
- Añade la barra compacta bajo el header: `proveedor / modelo ▾` → abre `ConfigPopover`.
- Pasa `config` en cada llamada a `plannerClient.generatePlan(request, config)`.

### Backend

#### 6. Schema `ProviderConfig` — `backend/app/agent/schemas.py`

```python
class ProviderConfig(GeometryModel):
    provider: Literal["ollama", "openai", "nvidia"]
    model: str
    base_url: str
    api_key: str = ""
```

`AgentPlanRequest` extiende con `config: ProviderConfig | None = None`.  
Si `None`, el backend usa el comportamiento actual (variable de entorno).

#### 7. `OpenAICompatiblePlanner` — `backend/app/agent/openai_planner.py`

Hereda de `BaseScriptPlanner`. Implementa `_complete()` usando `httpx` (ya disponible como dep transitiva de FastAPI) o `urllib` (ya usado en `OllamaPlanner`). Llama al endpoint `/chat/completions` con el formato OpenAI:

```
POST {base_url}/chat/completions
Authorization: Bearer {api_key}
{
  "model": model,
  "messages": [...],
  "response_format": {"type": "json_schema", "json_schema": {...}},
  "temperature": 0
}
```

Errores específicos:
- 401 → "API key inválida o no configurada"
- 404 → "Modelo no encontrado en este proveedor"
- URLError → "No se puede conectar con el servidor"

#### 8. `create_planner(config)` — `backend/app/services.py`

Nueva función pura que recibe `ProviderConfig | None` y devuelve el planner adecuado. El singleton `agent_planner` desaparece; el router llama `create_planner(request.config)` en cada request.

#### 9. Router actualizado — `backend/app/agent/router.py`

```python
@router.post("/plan", response_model=AgentResponse)
def plan_construction(request: AgentPlanRequest) -> AgentResponse:
    planner = create_planner(request.config)
    try:
        return planner.generate_plan(request.user_request, request.current_script)
    except ...
```

---

## Archivos modificados / creados

| Acción   | Archivo |
|----------|---------|
| Modificar | `frontend/src/agent/types.ts` |
| Crear    | `frontend/src/agent/useAssistantConfig.ts` |
| Crear    | `frontend/src/components/assistant/ConfigPopover.tsx` |
| Modificar | `frontend/src/components/assistant/AssistantPanel.tsx` |
| Modificar | `frontend/src/agent/planner.ts` |
| Modificar | `backend/app/agent/schemas.py` |
| Crear    | `backend/app/agent/openai_planner.py` |
| Modificar | `backend/app/services.py` |
| Modificar | `backend/app/agent/router.py` |

---

## Testing

### Backend
- `tests/test_agent_openai_planner.py` — fake transport, mismo patrón que `test_agent_ollama_planner.py`:
  - Petición válida → script validado
  - HTTP 401 → `PlannerError` con "API key"
  - HTTP 404 → `PlannerError` con "modelo no encontrado"
  - URLError → `PlannerError` con "no se puede conectar"
- `tests/test_agent_planner_api.py` — añadir casos con `config` en el body (Ollama y OpenAI)
- `ruff check` + `ruff format` sobre archivos nuevos/modificados

### Frontend
- Tests en `AssistantPanel.test.tsx` si existen; si no, verificación manual.

### Manual end-to-end
1. Levantar stack completo.
2. Con Ollama: cambiar modelo en el popover → petición usa el nuevo modelo.
3. Con OpenAI: introducir API key y modelo → petición funciona (o falla con error claro si key inválida).
4. Recargar página → config persiste.
5. Sin config guardada → default Ollama / llama3.1.

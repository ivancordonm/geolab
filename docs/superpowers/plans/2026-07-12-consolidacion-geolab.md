# Consolidación GeoLab (corto plazo) — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sincronizar la documentación con la aplicación real, ampliar los fixtures de conformidad entre runtimes, completar el tool registry (transformaciones, arcos, funciones, vértices y exports), exponer los nuevos tools por MCP, extraer el hook `useSharing` de `App.tsx`, y documentar el roadmap de medio/largo plazo.

**Architecture:** Todos los tools nuevos del registry son funciones puras que validan contra el `GeometryWorkspace` y commitean atómicamente (patrón existente en `backend/app/agent/tools.py`). Los fixtures de conformidad se generan desde el motor Python (autoridad determinista) mediante un script generador, y el suite del frontend debe reproducirlos. MCP expone los tools nuevos como wrappers finos sobre el registry vía `_mutate`.

**Tech Stack:** Python 3.11+ / FastAPI / Pydantic v2 / pytest; TypeScript / React 19 / Vitest.

## Global Constraints

- Tolerancia geométrica: `1e-9` en coordenadas de mundo (frontend usa `toBeCloseTo(expected, 12)`).
- Ambos runtimes evalúan el mismo JSON `GeometryDocument` con claves camelCase (`pointA`, `objectId`).
- Los tools nunca mutan el documento si la validación falla (commit atómico vía `_commit` / `_commit_defined`).
- Comandos de verificación backend: `cd backend && .venv/bin/pytest -q` y `.venv/bin/ruff check app tests`.
- Comandos de verificación frontend: `cd frontend && npm test` y `npm run typecheck`.
- Mensajes de commit terminan con: `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.

---

### Task 1: Crear `docs/ROADMAP.md` con el plan de medio y largo plazo

**Files:**
- Create: `docs/ROADMAP.md`
- Modify: `README.md` (añadir enlace tras la sección "Important limitations")

**Interfaces:**
- Produces: documento de roadmap referenciado por README y CLAUDE.md (Task 2).

- [ ] **Step 1: Escribir `docs/ROADMAP.md`**

```markdown
# GeoLab Roadmap

Estado: julio 2026. El corto plazo (documentación sincronizada, fixtures de
conformidad, registry completo, refactor de `App.tsx`) se ejecuta en
`docs/superpowers/plans/2026-07-12-consolidacion-geolab.md`. Este documento
recoge lo que viene después.

## Medio plazo (producto)

### 1. Deslizadores y parámetros
Un objeto `slider` (nombre, mín, máx, paso, valor actual) que otras
definiciones puedan referenciar donde hoy aceptan un número literal
(`Rotation(A, B, k)`, `Homothety(B, P, k)`). Convierte construcciones
estáticas en dinámicas y encaja de forma natural en el DAG: mover el slider
es análogo a mover un punto libre (recomputación topológica de dependientes).
Requiere: variante de definición en ambos runtimes, control UI en el canvas,
soporte en el parser de scripts y fixture de conformidad.

### 2. Medidas como objetos
`Distance(A, B)`, `Angle(A, O, B)`, `Area(poly)`, `Slope(l)` como objetos del
grafo con `EvaluatedValue` numérico que se recalcula con sus padres.
Imprescindible para uso docente. Se renderizan como etiquetas ancladas y
aparecen en la lista de objetos.

### 3. Planner con tool-calling nativo
Sustituir el contrato actual "devuélveme un script en JSON" por function
calling real: el registry ya exporta JSON-Schema por herramienta
(`ToolDefinition.descriptor()`), así que el planner puede pasar los
descriptores como `tools` al proveedor y ejecutar la propuesta tool a tool
contra un workspace efímero. Beneficios: reparación de errores por paso,
trazas limpias, menor tasa de scripts inválidos. El boundary de aprobación
no cambia: el resultado sigue siendo una propuesta que el usuario aplica.

### 4. Streaming del asistente
Respuestas del planner en streaming (SSE) para percepción de latencia.
Afecta a `/agent/plan`, al cliente `frontend/src/agent/planner.ts` y al
`AssistantPanel`.

### 5. Workspace REST sin estado global
`GET /geometry/graph` y `POST /agent/execute-tool` usan hoy un workspace
global por proceso (ver "Important limitations" del README): inutilizable en
serverless y entre usuarios. Migrar al modelo del MCP: el documento viaja en
la petición y vuelve en la respuesta. Eliminar `app/services.py` como estado
compartido.

### 6. Particionar los módulos grandes del frontend
- `frontend/src/geometry/engine.ts` (~1150 líneas): separar evaluadores por
  familia (puntos/líneas, círculos/intersecciones, transformaciones,
  polígonos/arcos) manteniendo `engine.ts` como fachada re-exportadora.
- `frontend/src/geometry/constructionTools.ts` (~1220 líneas): separar la
  máquina de estados de cada herramienta de la definición del catálogo.
Los suites existentes (`engine.test.ts`, `constructionTools.test.ts`) actúan
como red de seguridad; el refactor no cambia comportamiento.

### 7. Paginación y búsqueda de documentos cloud
`GET /documents` sin paginación no escala. Añadir `limit/offset` + orden por
`updated_at`, y filtro por título.

## Largo plazo (visión)

### 8. Módulo simbólico real (SymPy)
El paquete `backend/app/symbolic/` es hoy un placeholder. Objetivo: parsing
seguro con allowlist (patrón ya probado en
`app/geometry/function_expression.py`), `simplify`, `solve`, y el endpoint
`/geometry/validate` para validar propiedades de una construcción
simbólicamente (p. ej. "¿M equidista de A y B?"). Límites de tamaño de
expresión y tiempo de ejecución.

### 9. Colaboración en tiempo real
CRDT sobre el DAG (el documento ya es declarativo y por objetos, encaja
bien). Requiere IDs estables, resolución de conflictos por objeto y un canal
WebSocket. Antes de esto debe existir el workspace sin estado (punto 5).

### 10. Modo aula
Compartir una construcción con una clase, ver los lienzos de los alumnos en
mosaico, y clonar plantillas. Se apoya en los share-tokens existentes más un
concepto de grupo/rol en la base de datos.

### 11. Export a TikZ y GeoGebra
Generadores deterministas desde el `GeometryDocument` para material
didáctico. TikZ primero (texto puro, testeable con snapshots).

### 12. Ejecución Python aislada
Sandbox con límites de CPU/memoria/tiempo para scripts numéricos del
usuario. Servicio separado; nunca dentro del proceso API.

### 13. PWA / offline
El frontend ya es local-first (autosave en localStorage); empaquetarlo como
PWA con service worker para uso sin red en aulas.

## Deuda técnica registrada

- Validar longitud mínima de `JWT_SECRET` (≥32 bytes) en `app/config.py`.
- Rate limiting en `/agent/plan` y `/documents/shared/{token}`.
- Los exports SVG/PNG del backend no dibujan arcos (el frontend interactivo sí).
- Sustituir `window.prompt` por un diálogo propio al guardar/compartir.
```

- [ ] **Step 2: Enlazar el roadmap desde `README.md`**

En `README.md`, tras el último bullet de la sección `## Important limitations`, añadir:

```markdown

See [docs/ROADMAP.md](docs/ROADMAP.md) for the medium- and long-term plan.
```

- [ ] **Step 3: Commit**

```bash
git add docs/ROADMAP.md README.md
git commit -m "docs: add medium/long-term roadmap"
```

---

### Task 2: Sincronizar `CLAUDE.md` con la aplicación real

**Files:**
- Modify: `CLAUDE.md`

**Interfaces:**
- Consumes: `docs/ROADMAP.md` (Task 1).

- [ ] **Step 1: Aplicar las correcciones siguientes (Edit por sección)**

Correcciones exactas (buscar el texto viejo y sustituirlo):

1. En la tabla "Repository structure", sustituir las filas incorrectas por:

```markdown
| Path | Purpose |
|------|---------|
| `frontend/src/geometry/` | Engine (graph + evaluators), construction tools, viewport, serialization |
| `frontend/src/components/` | React presentation components (canvas, toolbar, object list, script editor) |
| `frontend/src/agent/` | Assistant UI state and planner API client |
| `frontend/src/api/` | Typed REST clients (auth, documents, geometry) |
| `frontend/src/auth/` | Google Sign-In and session state |
| `frontend/src/persistence/` | localStorage auto-save, JSON import/export, cloud documents hooks |
| `frontend/src/types/` | Versioned TypeScript schemas for contracts and domain types |
| `backend/app/geometry/` | Pydantic models, script parser, dependency DAG engine, SVG/PNG rendering |
| `backend/app/agent/` | Tool registry, deterministic tools, planners (OpenAI-compatible, Ollama, Claude, rules) |
| `backend/app/auth/` | Google credential verification, JWT session cookie |
| `backend/app/documents/` | Authenticated PostgreSQL document CRUD and share tokens |
| `backend/app/mcp_server.py` | Stateless MCP adapter mounted at `/mcp` |
| `backend/alembic/` | Database migrations |
| `backend/tests/` | Unit, API, and conformance tests |
| `shared/fixtures/` | Cross-runtime conformance fixtures (generated by `backend/scripts/generate_conformance_fixture.py`) |
| `docs/ARCHITECTURE.md` | Detailed technical design, contracts, and implementation roadmap |
| `docs/ROADMAP.md` | Medium- and long-term evolution plan |
```

2. Toda mención a `backend/tests/fixtures/` pasa a `shared/fixtures/` (aparece en "Dual deterministic runtimes", "Adding a new geometry construction type" paso 4, "Fixing a cross-runtime bug" y "Testing geometry operations").

3. En "Adding a new geometry construction type", el paso 2 pasa a:

```markdown
2. Implement the evaluator in both runtimes: `frontend/src/geometry/engine.ts` and `backend/app/geometry/engine.py`
```

y el paso 4 pasa a:

```markdown
4. Create a conformance fixture: write a construction script and run `python scripts/generate_conformance_fixture.py <script.txt> ../shared/fixtures/<name>.json` from `backend/`
```

4. En "SymPy safety", sustituir la referencia a `backend/app/symbolic/service.py` por:

```markdown
SymPy input is never evaluated directly. Function expressions are parsed
through an allowlist of symbols and functions in
`backend/app/geometry/function_expression.py`. The `backend/app/symbolic/`
package is a placeholder for the future symbolic service (see
`docs/ROADMAP.md`).
```

5. Sección "Known limitations and future work": sustituirla completa por:

```markdown
## Known limitations and future work

- **REST tool workspace is process-global:** `GET /geometry/graph` and
  `POST /agent/execute-tool` share one in-memory workspace per process; it is
  not user-scoped nor durable. MCP construction tools are stateless and do
  not use it. Cloud documents live in PostgreSQL and are unaffected.
- **Backend SVG/PNG exports do not draw arcs yet** (the interactive frontend does).
- **No pagination for cloud document lists.**
- **No realtime collaboration, formal prover, sandboxed Python, or 3D.**

Undo/redo, Google Sign-In with cloud persistence, share links, and LLM
planners (OpenAI-compatible, Ollama, Claude) are implemented. See
`docs/ROADMAP.md` for the evolution plan.
```

6. En "Debugging tips", sustituir `frontend/src/geometry/graph.ts` por `frontend/src/geometry/engine.ts` y `backend/app/geometry/tools.py` por `backend/app/geometry/engine.py`.

- [ ] **Step 2: Verificar que no quedan referencias muertas**

```bash
grep -n "backend/tests/fixtures\|symbolic/service.py\|geometry/graph.ts\|evaluators.ts" CLAUDE.md
```

Expected: sin resultados.

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: sync CLAUDE.md with the real application"
```

---

### Task 3: Generador de fixtures de conformidad

**Files:**
- Create: `backend/scripts/generate_conformance_fixture.py`
- Create: `backend/scripts/__init__.py` (vacío)

**Interfaces:**
- Produces: CLI `python scripts/generate_conformance_fixture.py <script.txt> <output.json>` que escribe `{script, document, initialValues}`. Lo consumen las Tasks 4–5.

- [ ] **Step 1: Escribir el generador**

```python
"""Generate a cross-runtime conformance fixture from a construction script.

The Python engine is the deterministic authority: it evaluates the script
and records the resulting document plus every evaluated value. The frontend
suite must reproduce these values within the documented tolerance (1e-9).

Usage (from backend/, venv active):
    python scripts/generate_conformance_fixture.py fixtures-src/transformations.txt ../shared/fixtures/transformations.json
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

from app.geometry.engine import evaluate_geometry_document
from app.geometry.script import evaluate_script


def main() -> None:
    if len(sys.argv) != 3:
        sys.exit("usage: generate_conformance_fixture.py <script.txt> <output.json>")
    script_path = Path(sys.argv[1])
    output_path = Path(sys.argv[2])
    script = script_path.read_text()

    document, _ = evaluate_script(
        script,
        document_id=f"doc_{output_path.stem.replace('-', '_')}",
        title=output_path.stem.replace("-", " ").capitalize(),
    )
    values = evaluate_geometry_document(document)

    fixture = {
        "script": script,
        "document": json.loads(document.model_dump_json(by_alias=True)),
        "initialValues": {
            object_id: value.model_dump(by_alias=True, mode="json")
            for object_id, value in values.items()
        },
    }
    output_path.write_text(json.dumps(fixture, indent=2, ensure_ascii=False) + "\n")
    print(f"Wrote {output_path} with {len(fixture['initialValues'])} evaluated values")


if __name__ == "__main__":
    main()
```

- [ ] **Step 2: Smoke-test del generador con un script trivial**

```bash
cd backend
printf 'A = Point(0, 0)\nB = Point(4, 0)\nM = Midpoint(A, B)\n' > /tmp/smoke.txt
.venv/bin/python scripts/generate_conformance_fixture.py /tmp/smoke.txt /tmp/smoke.json
.venv/bin/python -c "import json; f = json.load(open('/tmp/smoke.json')); assert f['initialValues']['M'] == {'type': 'point', 'x': 2.0, 'y': 0.0}, f['initialValues']['M']; print('ok')"
```

Expected: `ok`.

- [ ] **Step 3: Commit**

```bash
git add backend/scripts/
git commit -m "feat(conformance): add fixture generator script"
```

---

### Task 4: Fixtures de transformaciones, derivadas y polígonos/arcos + test backend parametrizado

**Files:**
- Create: `backend/fixtures-src/transformations.txt`
- Create: `backend/fixtures-src/derived-constructions.txt`
- Create: `backend/fixtures-src/polygons-arcs.txt`
- Create: `shared/fixtures/transformations.json` (generado)
- Create: `shared/fixtures/derived-constructions.json` (generado)
- Create: `shared/fixtures/polygons-arcs.json` (generado)
- Modify: `backend/tests/test_geometry_models.py`

**Interfaces:**
- Consumes: generador de Task 3.
- Produces: fixtures JSON `{script, document, initialValues}` que consume Task 5.

- [ ] **Step 1: Escribir los scripts fuente**

`backend/fixtures-src/transformations.txt`:

```text
A = Point(1, 1)
B = Point(0, 0)
C = Point(0, 2)
D = Point(2, -1)
P = Point(2, 0)
U = Point(1, 0)
axis = Line(B, C)
R = Reflection(A, axis)
RP = Reflection(A, B)
T = Translation(A, B, D)
G = Rotation(A, B, 90)
H = Homothety(B, P, 2)
c1 = Circle(B, U)
Inv = Inversion(P, c1)
```

`backend/fixtures-src/derived-constructions.txt`:

```text
A = Point(0, 0)
B = Point(4, 0)
C = Point(0, 4)
l1 = Line(A, B)
l2 = Line(A, C)
X = IntersectionLL(l1, l2)
c1 = Circle(A, B)
c2 = Circle(B, A)
Y0 = IntersectionCC(c1, c2, 0)
Y1 = IntersectionCC(c1, c2, 1)
Z0 = IntersectionLC(l1, c1, 0)
pb = PerpendicularBisector(A, B)
ab = AngleBisector(B, A, C)
cc = Circumcircle(A, B, C)
```

`backend/fixtures-src/polygons-arcs.txt`:

```text
A = Point(0, 0)
B = Point(4, 0)
C = Point(2, 3)
poly = Polygon(A, B, C)
V = Vertex(poly, 1)
reg = Polygon(A, B, 5)
vec = VectorPolygon(A, (1, 0), (0, 1))
arc = Arc(A, C, B)
```

- [ ] **Step 2: Generar los tres fixtures**

```bash
cd backend
.venv/bin/python scripts/generate_conformance_fixture.py fixtures-src/transformations.txt ../shared/fixtures/transformations.json
.venv/bin/python scripts/generate_conformance_fixture.py fixtures-src/derived-constructions.txt ../shared/fixtures/derived-constructions.json
.venv/bin/python scripts/generate_conformance_fixture.py fixtures-src/polygons-arcs.txt ../shared/fixtures/polygons-arcs.json
```

Expected: tres mensajes `Wrote …`. Si un constructor falla por sintaxis, consultar la gramática en `backend/app/geometry/script.py` (la firma autoritativa de cada comando) y ajustar el `.txt` — no el generador.

Inspeccionar los JSON: ningún valor con `"type": "undefined"`. Comprobación rápida:

```bash
grep -c '"type": "undefined"' ../shared/fixtures/transformations.json ../shared/fixtures/derived-constructions.json ../shared/fixtures/polygons-arcs.json
```

Expected: `0` en los tres (grep -c imprime 0 por fichero; exit code ≠ 0 es correcto aquí).

- [ ] **Step 3: Parametrizar el test de conformidad backend**

En `backend/tests/test_geometry_models.py`, sustituir la función `test_all_supported_constructions_match_shared_fixture` por:

```python
FIXTURES_DIR = Path(__file__).resolve().parents[2] / "shared" / "fixtures"


@pytest.mark.parametrize(
    "fixture_path",
    sorted(FIXTURES_DIR.glob("*.json")),
    ids=lambda path: path.stem,
)
def test_conformance_fixture_values_match_engine(fixture_path: Path) -> None:
    fixture = json.loads(fixture_path.read_text())
    document = GeometryDocument.model_validate(fixture["document"])

    values = dump_values(evaluate_geometry_document(document))

    assert_nested_close(values, fixture["initialValues"])
```

(`Path`, `json`, `pytest`, `dump_values`, `assert_nested_close` y `evaluate_geometry_document` ya están importados/definidos en el módulo.)

- [ ] **Step 4: Ejecutar el suite backend**

```bash
cd backend && .venv/bin/pytest tests/test_geometry_models.py -v
```

Expected: PASS, con 4 casos parametrizados (`basic-geometry`, `derived-constructions`, `polygons-arcs`, `transformations`).

- [ ] **Step 5: Commit**

```bash
git add backend/fixtures-src/ shared/fixtures/ backend/tests/test_geometry_models.py
git commit -m "test(conformance): add transformation, derived and polygon/arc fixtures"
```

---

### Task 5: Test de conformidad del frontend sobre todos los fixtures

**Files:**
- Create: `frontend/src/geometry/conformance.test.ts`

**Interfaces:**
- Consumes: los cuatro JSON de `shared/fixtures/` (Task 4).

- [ ] **Step 1: Escribir el test**

```typescript
import { describe, expect, it } from "vitest";

import basicGeometry from "../../../shared/fixtures/basic-geometry.json";
import derivedConstructions from "../../../shared/fixtures/derived-constructions.json";
import polygonsArcs from "../../../shared/fixtures/polygons-arcs.json";
import transformations from "../../../shared/fixtures/transformations.json";
import type { EvaluatedValue, GeometryDocument } from "../types/geometry";
import { evaluateGeometryDocument } from "./engine";

interface ConformanceFixture {
  document: GeometryDocument;
  initialValues: Record<string, unknown>;
}

const FIXTURES: ReadonlyArray<readonly [string, ConformanceFixture]> = [
  ["basic-geometry", basicGeometry as unknown as ConformanceFixture],
  ["transformations", transformations as unknown as ConformanceFixture],
  ["derived-constructions", derivedConstructions as unknown as ConformanceFixture],
  ["polygons-arcs", polygonsArcs as unknown as ConformanceFixture],
];

function plainValues(values: ReadonlyMap<string, EvaluatedValue>): Record<string, EvaluatedValue> {
  return Object.fromEntries(values);
}

function expectNestedClose(actual: unknown, expected: unknown): void {
  if (typeof expected === "number") {
    expect(actual).toBeTypeOf("number");
    expect(actual as number).toBeCloseTo(expected, 12);
    return;
  }
  if (Array.isArray(expected)) {
    expect(actual).toBeInstanceOf(Array);
    expect(actual as unknown[]).toHaveLength(expected.length);
    expected.forEach((item, index) => expectNestedClose((actual as unknown[])[index], item));
    return;
  }
  if (typeof expected === "object" && expected !== null) {
    expect(typeof actual).toBe("object");
    expect(actual).not.toBeNull();
    expect(Object.keys(actual as object)).toEqual(Object.keys(expected));
    for (const [key, value] of Object.entries(expected)) {
      expectNestedClose((actual as Record<string, unknown>)[key], value);
    }
    return;
  }
  expect(actual).toBe(expected);
}

describe("cross-runtime conformance", () => {
  it.each(FIXTURES)("matches the Python engine for %s", (_name, fixture) => {
    const values = plainValues(evaluateGeometryDocument(fixture.document));

    expectNestedClose(values, fixture.initialValues);
  });
});
```

- [ ] **Step 2: Ejecutar el test**

```bash
cd frontend && npm test -- src/geometry/conformance.test.ts
```

Expected: PASS en los 4 casos. **Si un caso falla, es un bug de conformidad real** (el objetivo de la task): comparar el valor esperado del fixture con el evaluador correspondiente en `frontend/src/geometry/engine.ts` y corregir el evaluador del frontend (nunca el fixture) hasta que coincida. Documentar en el commit qué evaluador divergía.

- [ ] **Step 3: Suite completo y commit**

```bash
cd frontend && npm test && npm run typecheck
git add frontend/src/geometry/conformance.test.ts
git commit -m "test(conformance): frontend evaluates all shared fixtures"
```

---

### Task 6: Registry — tools de transformación

**Files:**
- Modify: `backend/app/agent/models.py` (añadir input models)
- Modify: `backend/app/agent/tools.py` (handlers + registro)
- Modify: `backend/tests/test_agent_tools.py` (EXPECTED_TOOLS + test nuevo)

**Interfaces:**
- Produces: tools `create_reflection_over_line`, `create_reflection_over_point`, `create_translation`, `create_rotation`, `create_homothety`, `create_inversion` en el registry. Los consume Task 9 (MCP).
- Input models producidos: `SourceLineConstructionInput`, `SourcePointConstructionInput`, `TranslationConstructionInput`, `RotationConstructionInput`, `HomothetyConstructionInput`, `InversionConstructionInput`.

- [ ] **Step 1: Escribir el test que falla**

Añadir a `backend/tests/test_agent_tools.py` — ampliar `EXPECTED_TOOLS` con:

```python
    "create_reflection_over_line",
    "create_reflection_over_point",
    "create_translation",
    "create_rotation",
    "create_homothety",
    "create_inversion",
```

y añadir el test:

```python
def test_transformation_tools_create_defined_objects() -> None:
    workspace = GeometryWorkspace()
    registry = create_geometry_tool_registry(workspace)
    execute(registry, "create_point", {"objectId": "A", "x": 1, "y": 1})
    execute(registry, "create_point", {"objectId": "B", "x": 0, "y": 0})
    execute(registry, "create_point", {"objectId": "C", "x": 0, "y": 2})
    execute(registry, "create_point", {"objectId": "D", "x": 2, "y": -1})
    execute(registry, "create_point", {"objectId": "P", "x": 2, "y": 0})
    execute(registry, "create_point", {"objectId": "U", "x": 1, "y": 0})
    execute(registry, "create_line", {"objectId": "axis", "pointA": "B", "pointB": "C"})
    execute(registry, "create_circle", {"objectId": "c1", "center": "B", "point": "U"})

    def point_value(output: object, object_id: str) -> tuple[float, float]:
        graph = output.graph  # type: ignore[attr-defined]
        value = graph.objects[graph.id_map[object_id]].value
        assert value.type == "point"
        return value.x, value.y

    reflected = execute(registry, "create_reflection_over_line", {"objectId": "R", "source": "A", "line": "axis"})
    assert point_value(reflected, "R") == pytest.approx((-1.0, 1.0))

    mirrored = execute(registry, "create_reflection_over_point", {"objectId": "RP", "source": "A", "center": "B"})
    assert point_value(mirrored, "RP") == pytest.approx((-1.0, -1.0))

    translated = execute(registry, "create_translation", {"objectId": "T", "source": "A", "fromPoint": "B", "toPoint": "D"})
    assert point_value(translated, "T") == pytest.approx((3.0, 0.0))

    rotated = execute(registry, "create_rotation", {"objectId": "G", "source": "A", "center": "B", "degrees": 90})
    assert point_value(rotated, "G") == pytest.approx((-1.0, 1.0))

    scaled = execute(registry, "create_homothety", {"objectId": "H", "center": "B", "point": "P", "ratio": 2})
    assert point_value(scaled, "H") == pytest.approx((4.0, 0.0))

    inverted = execute(registry, "create_inversion", {"objectId": "Inv", "point": "P", "circle": "c1"})
    assert point_value(inverted, "Inv") == pytest.approx((0.5, 0.0))


def test_transformation_source_must_be_transformable() -> None:
    workspace = GeometryWorkspace()
    registry = create_geometry_tool_registry(workspace)
    execute(registry, "create_point", {"objectId": "A", "x": 0, "y": 0})
    execute(registry, "create_point", {"objectId": "B", "x": 4, "y": 0}); execute(registry, "create_point", {"objectId": "C", "x": 2, "y": 3})
    execute(registry, "create_arc", {"objectId": "arc1", "pointA": "A", "pointB": "C", "pointC": "B"})
    execute(registry, "create_line", {"objectId": "l1", "pointA": "A", "pointB": "B"})

    with pytest.raises(ToolExecutionError, match="must be a point, line, segment, circle, or polygon"):
        execute(registry, "create_reflection_over_line", {"objectId": "R", "source": "arc1", "line": "l1"})
```

Nota: `create_arc` se implementa en Task 7; si se ejecuta Task 6 aislada, sustituir temporalmente el segundo test por un `pytest.mark.skip` y activarlo en Task 7 (o ejecutar Tasks 6 y 7 juntas antes de correr este test).

- [ ] **Step 2: Ejecutar y verificar que falla**

```bash
cd backend && .venv/bin/pytest tests/test_agent_tools.py -v -k "transformation or required_schema"
```

Expected: FAIL (`assert set(descriptors) == EXPECTED_TOOLS` y `UnknownToolError`).

- [ ] **Step 3: Añadir los input models a `backend/app/agent/models.py`**

Después de `RegularPolygonConstructionInput`:

```python
class SourceLineConstructionInput(GeometryModel):
    object_id: str
    label: str | None = None
    source: str
    line: str


class SourcePointConstructionInput(GeometryModel):
    object_id: str
    label: str | None = None
    source: str
    center: str


class TranslationConstructionInput(GeometryModel):
    object_id: str
    label: str | None = None
    source: str
    from_point: str
    to_point: str


class RotationConstructionInput(GeometryModel):
    object_id: str
    label: str | None = None
    source: str
    center: str
    degrees: float


class HomothetyConstructionInput(GeometryModel):
    object_id: str
    label: str | None = None
    center: str
    point: str
    ratio: float


class InversionConstructionInput(GeometryModel):
    object_id: str
    label: str | None = None
    point: str
    circle: str
```

- [ ] **Step 4: Implementar handlers y registro en `backend/app/agent/tools.py`**

Añadir a los imports de `app.agent.models`: `SourceLineConstructionInput, SourcePointConstructionInput, TranslationConstructionInput, RotationConstructionInput, HomothetyConstructionInput, InversionConstructionInput`.

Añadir a los imports de `app.geometry.models`: `ReflectionOverLine, ReflectionOverPoint, TranslatedObject, RotatedObject, HomothetyScalar, InversionInCircle` y sus definiciones ya importadas (`ReflectionOverLineDefinition`, etc. — comprobar cuáles faltan: `TranslationDefinition`, `RotationDefinition`, `ReflectionOverLineDefinition`, `ReflectionOverPointDefinition`, `HomothetyScalarDefinition`, `InversionInCircleDefinition`).

Añadir el helper junto a `_resolve_kind`:

```python
_TRANSFORMABLE_KINDS = ("point", "line", "segment", "circle", "polygon")


def _resolve_transformable(access: GraphAccessMap, identifier: str) -> GraphObjectAccess:
    try:
        node = access.resolve(identifier)
    except ValueError as error:
        raise ToolExecutionError(str(error)) from error
    if node.object.kind not in _TRANSFORMABLE_KINDS:
        raise ToolExecutionError(
            f"Geometry object '{identifier}' must be a point, line, segment, circle, "
            f"or polygon, but it is a {node.object.kind}"
        )
    return node
```

Añadir los handlers (mismo patrón que `_create_circumcircle`):

```python
def _create_reflection_over_line(workspace: GeometryWorkspace, raw_input: BaseModel) -> MutationToolOutput:
    input_model = SourceLineConstructionInput.model_validate(raw_input)
    access = workspace.graph_access_map()
    _ensure_name_available(access, input_model.object_id, input_model.label)
    source = _resolve_transformable(access, input_model.source)
    line = _resolve_kind(access, input_model.line, "line")
    obj = ReflectionOverLine(
        id=input_model.object_id,
        label=input_model.label or input_model.object_id,
        kind=source.object.kind,
        definition=ReflectionOverLineDefinition(object_id=source.object.id, line=line.object.id),
    )
    return _commit_defined(workspace, obj)


def _create_reflection_over_point(workspace: GeometryWorkspace, raw_input: BaseModel) -> MutationToolOutput:
    input_model = SourcePointConstructionInput.model_validate(raw_input)
    access = workspace.graph_access_map()
    _ensure_name_available(access, input_model.object_id, input_model.label)
    source = _resolve_transformable(access, input_model.source)
    center = _resolve_kind(access, input_model.center, "point")
    obj = ReflectionOverPoint(
        id=input_model.object_id,
        label=input_model.label or input_model.object_id,
        kind=source.object.kind,
        definition=ReflectionOverPointDefinition(object_id=source.object.id, center=center.object.id),
    )
    return _commit_defined(workspace, obj)


def _create_translation(workspace: GeometryWorkspace, raw_input: BaseModel) -> MutationToolOutput:
    input_model = TranslationConstructionInput.model_validate(raw_input)
    access = workspace.graph_access_map()
    _ensure_name_available(access, input_model.object_id, input_model.label)
    source = _resolve_transformable(access, input_model.source)
    from_point = _resolve_kind(access, input_model.from_point, "point")
    to_point = _resolve_kind(access, input_model.to_point, "point")
    obj = TranslatedObject(
        id=input_model.object_id,
        label=input_model.label or input_model.object_id,
        kind=source.object.kind,
        definition=TranslationDefinition(
            object_id=source.object.id,
            from_=from_point.object.id,
            to=to_point.object.id,
        ),
    )
    return _commit_defined(workspace, obj)


def _create_rotation(workspace: GeometryWorkspace, raw_input: BaseModel) -> MutationToolOutput:
    input_model = RotationConstructionInput.model_validate(raw_input)
    access = workspace.graph_access_map()
    _ensure_name_available(access, input_model.object_id, input_model.label)
    source = _resolve_transformable(access, input_model.source)
    center = _resolve_kind(access, input_model.center, "point")
    obj = RotatedObject(
        id=input_model.object_id,
        label=input_model.label or input_model.object_id,
        kind=source.object.kind,
        definition=RotationDefinition(
            object_id=source.object.id,
            center=center.object.id,
            degrees=input_model.degrees,
        ),
    )
    return _commit_defined(workspace, obj)


def _create_homothety(workspace: GeometryWorkspace, raw_input: BaseModel) -> MutationToolOutput:
    input_model = HomothetyConstructionInput.model_validate(raw_input)
    access = workspace.graph_access_map()
    _ensure_name_available(access, input_model.object_id, input_model.label)
    center = _resolve_kind(access, input_model.center, "point")
    point = _resolve_kind(access, input_model.point, "point")
    obj = HomothetyScalar(
        id=input_model.object_id,
        label=input_model.label or input_model.object_id,
        definition=HomothetyScalarDefinition(
            center=center.object.id,
            point=point.object.id,
            ratio=input_model.ratio,
        ),
    )
    return _commit_defined(workspace, obj)


def _create_inversion(workspace: GeometryWorkspace, raw_input: BaseModel) -> MutationToolOutput:
    input_model = InversionConstructionInput.model_validate(raw_input)
    access = workspace.graph_access_map()
    _ensure_name_available(access, input_model.object_id, input_model.label)
    point = _resolve_kind(access, input_model.point, "point")
    circle = _resolve_kind(access, input_model.circle, "circle")
    obj = InversionInCircle(
        id=input_model.object_id,
        label=input_model.label or input_model.object_id,
        definition=InversionInCircleDefinition(point=point.object.id, circle=circle.object.id),
    )
    return _commit_defined(workspace, obj)
```

Registrar en `create_geometry_tool_registry`, tras `create_vector_polygon`:

```python
    registry.register(
        _definition(
            "create_reflection_over_line",
            "Reflect an existing point/line/segment/circle/polygon over an existing line.",
            SourceLineConstructionInput,
            MutationToolOutput,
            True,
            lambda model: _create_reflection_over_line(workspace, model),
        )
    )
    registry.register(
        _definition(
            "create_reflection_over_point",
            "Reflect an existing point/line/segment/circle/polygon over an existing point.",
            SourcePointConstructionInput,
            MutationToolOutput,
            True,
            lambda model: _create_reflection_over_point(workspace, model),
        )
    )
    registry.register(
        _definition(
            "create_translation",
            "Translate an existing object by the vector from one point to another.",
            TranslationConstructionInput,
            MutationToolOutput,
            True,
            lambda model: _create_translation(workspace, model),
        )
    )
    registry.register(
        _definition(
            "create_rotation",
            "Rotate an existing object around a center point by an angle in degrees.",
            RotationConstructionInput,
            MutationToolOutput,
            True,
            lambda model: _create_rotation(workspace, model),
        )
    )
    registry.register(
        _definition(
            "create_homothety",
            "Scale an existing point from a center by a numeric ratio (homothety).",
            HomothetyConstructionInput,
            MutationToolOutput,
            True,
            lambda model: _create_homothety(workspace, model),
        )
    )
    registry.register(
        _definition(
            "create_inversion",
            "Invert an existing point in an existing circle.",
            InversionConstructionInput,
            MutationToolOutput,
            True,
            lambda model: _create_inversion(workspace, model),
        )
    )
```

- [ ] **Step 5: Ejecutar los tests**

```bash
cd backend && .venv/bin/pytest tests/test_agent_tools.py -v && .venv/bin/ruff check app tests
```

Expected: PASS (salvo el test que depende de `create_arc`, skip hasta Task 7).

- [ ] **Step 6: Commit**

```bash
git add backend/app/agent/models.py backend/app/agent/tools.py backend/tests/test_agent_tools.py
git commit -m "feat(agent): register transformation tools in the registry"
```

---

### Task 7: Registry — arc, function y polygon vertex

**Files:**
- Modify: `backend/app/agent/models.py`
- Modify: `backend/app/agent/tools.py`
- Modify: `backend/tests/test_agent_tools.py`

**Interfaces:**
- Produces: tools `create_arc`, `create_function`, `create_polygon_vertex`. `create_arc` reutiliza `ThreePointConstructionInput` (point_a=inicio, point_b=punto medio del arco, point_c=fin).

- [ ] **Step 1: Test que falla**

Ampliar `EXPECTED_TOOLS` con `"create_arc"`, `"create_function"`, `"create_polygon_vertex"` y añadir:

```python
def test_arc_function_and_vertex_tools() -> None:
    workspace = GeometryWorkspace()
    registry = create_geometry_tool_registry(workspace)
    execute(registry, "create_point", {"objectId": "A", "x": 0, "y": 0})
    execute(registry, "create_point", {"objectId": "B", "x": 4, "y": 0})
    execute(registry, "create_point", {"objectId": "C", "x": 2, "y": 3})
    execute(registry, "create_polygon", {"objectId": "poly", "pointIds": ["A", "B", "C"]})

    arc = execute(registry, "create_arc", {"objectId": "arc1", "pointA": "A", "pointB": "C", "pointC": "B"})
    arc_value = arc.graph.objects[arc.graph.id_map["arc1"]].value
    assert arc_value.type == "arc"

    fn = execute(registry, "create_function", {"objectId": "f1", "expression": "x^2 + 1"})
    fn_value = fn.graph.objects[fn.graph.id_map["f1"]].value
    assert fn_value.type == "function"

    vertex = execute(registry, "create_polygon_vertex", {"objectId": "V", "polygon": "poly", "index": 1})
    vertex_value = vertex.graph.objects[vertex.graph.id_map["V"]].value
    assert vertex_value.type == "point"
    assert (vertex_value.x, vertex_value.y) == pytest.approx((4.0, 0.0))


def test_invalid_function_expression_is_rejected_without_mutation() -> None:
    workspace = GeometryWorkspace()
    registry = create_geometry_tool_registry(workspace)

    with pytest.raises(ToolExecutionError):
        execute(registry, "create_function", {"objectId": "f1", "expression": "__import__('os')"})
    assert workspace.revision == 0
```

Quitar el `skip` del test de Task 6 si se añadió.

- [ ] **Step 2: Verificar que falla**

```bash
cd backend && .venv/bin/pytest tests/test_agent_tools.py -v -k "arc_function or invalid_function"
```

Expected: FAIL con `UnknownToolError`.

- [ ] **Step 3: Implementar**

En `backend/app/agent/models.py`:

```python
class FunctionConstructionInput(GeometryModel):
    object_id: str
    label: str | None = None
    expression: str


class PolygonVertexConstructionInput(GeometryModel):
    object_id: str
    label: str | None = None
    polygon: str
    index: int
```

En `backend/app/agent/tools.py` — imports nuevos: `FunctionConstructionInput`, `PolygonVertexConstructionInput` (de `app.agent.models`); `Arc`, `ArcThroughPointsDefinition`, `FunctionGraph`, `FunctionExpressionDefinition`, `PolygonVertexPoint`, `PolygonVertexDefinition` (de `app.geometry.models`); y:

```python
from app.geometry.function_expression import normalize_function_expression
```

Handlers:

```python
def _create_arc(workspace: GeometryWorkspace, raw_input: BaseModel) -> MutationToolOutput:
    input_model = ThreePointConstructionInput.model_validate(raw_input)
    access = workspace.graph_access_map()
    _ensure_name_available(access, input_model.object_id, input_model.label)
    start = _resolve_kind(access, input_model.point_a, "point")
    mid = _resolve_kind(access, input_model.point_b, "point")
    end = _resolve_kind(access, input_model.point_c, "point")
    obj = Arc(
        id=input_model.object_id,
        label=input_model.label or input_model.object_id,
        definition=ArcThroughPointsDefinition(
            point_a=start.object.id,
            point_mid=mid.object.id,
            point_b=end.object.id,
        ),
    )
    return _commit_defined(workspace, obj)


def _create_function(workspace: GeometryWorkspace, raw_input: BaseModel) -> MutationToolOutput:
    input_model = FunctionConstructionInput.model_validate(raw_input)
    access = workspace.graph_access_map()
    _ensure_name_available(access, input_model.object_id, input_model.label)
    expression = normalize_function_expression(input_model.expression)
    obj = FunctionGraph(
        id=input_model.object_id,
        label=input_model.label or input_model.object_id,
        definition=FunctionExpressionDefinition(expression=expression),
    )
    return _commit_defined(workspace, obj)


def _create_polygon_vertex(workspace: GeometryWorkspace, raw_input: BaseModel) -> MutationToolOutput:
    input_model = PolygonVertexConstructionInput.model_validate(raw_input)
    access = workspace.graph_access_map()
    _ensure_name_available(access, input_model.object_id, input_model.label)
    polygon = _resolve_kind(access, input_model.polygon, "polygon")
    obj = PolygonVertexPoint(
        id=input_model.object_id,
        label=input_model.label or input_model.object_id,
        definition=PolygonVertexDefinition(polygon=polygon.object.id, index=input_model.index),
    )
    return _commit_defined(workspace, obj)
```

(Nota: `normalize_function_expression` lanza `ValueError` ante expresiones no permitidas; `ToolRegistry.execute` la convierte en `ToolExecutionError` sin mutar el workspace. Si la excepción real fuera de otro tipo, envolverla: `try: ... except Exception as error: raise ToolExecutionError(str(error)) from error` — comprobar el tipo exacto en `app/geometry/function_expression.py`.)

Registro (tras `create_inversion`):

```python
    registry.register(
        _definition(
            "create_arc",
            "Create a circular arc through three existing points: start, mid, end.",
            ThreePointConstructionInput,
            MutationToolOutput,
            True,
            lambda model: _create_arc(workspace, model),
        )
    )
    registry.register(
        _definition(
            "create_function",
            "Create a real-valued function graph y = f(x) from a validated expression.",
            FunctionConstructionInput,
            MutationToolOutput,
            True,
            lambda model: _create_function(workspace, model),
        )
    )
    registry.register(
        _definition(
            "create_polygon_vertex",
            "Create a point bound to the i-th vertex (0-based) of an existing polygon.",
            PolygonVertexConstructionInput,
            MutationToolOutput,
            True,
            lambda model: _create_polygon_vertex(workspace, model),
        )
    )
```

- [ ] **Step 4: Ejecutar tests y lint**

```bash
cd backend && .venv/bin/pytest tests/test_agent_tools.py tests/test_agent_tools_api.py -v && .venv/bin/ruff check app tests
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/app/agent/models.py backend/app/agent/tools.py backend/tests/test_agent_tools.py
git commit -m "feat(agent): add arc, function, and polygon-vertex tools"
```

---

### Task 8: Registry — tools de export (SVG, PNG, JSON)

**Files:**
- Modify: `backend/app/agent/models.py`
- Modify: `backend/app/agent/tools.py`
- Modify: `backend/tests/test_agent_tools.py`

**Interfaces:**
- Produces: tools de solo lectura `export_svg` → `{svg}`, `export_png` → `{pngBase64}`, `export_json` → `{documentJson}`.

- [ ] **Step 1: Test que falla**

Ampliar `EXPECTED_TOOLS` con `"export_svg"`, `"export_png"`, `"export_json"` y añadir (imports arriba del módulo: `import base64`, `import json`):

```python
def test_export_tools_return_svg_png_and_json() -> None:
    workspace = GeometryWorkspace()
    registry = create_geometry_tool_registry(workspace)
    execute(registry, "create_point", {"objectId": "A", "x": 0, "y": 0})

    svg = execute(registry, "export_svg", {})
    assert "<svg" in svg.svg

    png = execute(registry, "export_png", {})
    assert base64.b64decode(png.png_base64)[:8] == b"\x89PNG\r\n\x1a\n"

    exported = execute(registry, "export_json", {})
    payload = json.loads(exported.document_json)
    assert payload["objects"][0]["id"] == "A"

    descriptors = {d.name: d for d in registry.descriptors()}
    assert descriptors["export_svg"].mutates_geometry_state is False
    assert descriptors["export_png"].mutates_geometry_state is False
    assert descriptors["export_json"].mutates_geometry_state is False
```

- [ ] **Step 2: Verificar que falla**

```bash
cd backend && .venv/bin/pytest tests/test_agent_tools.py -v -k export
```

Expected: FAIL con `UnknownToolError`.

- [ ] **Step 3: Implementar**

En `backend/app/agent/models.py`:

```python
class ExportSvgOutput(GeometryModel):
    svg: str


class ExportPngOutput(GeometryModel):
    png_base64: str


class ExportJsonOutput(GeometryModel):
    document_json: str
```

En `backend/app/agent/tools.py` — imports: `ExportSvgOutput, ExportPngOutput, ExportJsonOutput` y

```python
import base64

from app.geometry.rendering import render_graph_png, render_graph_svg
```

Handlers y registro:

```python
def _export_svg(workspace: GeometryWorkspace) -> ExportSvgOutput:
    graph = graph_view_from_access_map(workspace.graph_access_map())
    return ExportSvgOutput(svg=render_graph_svg(graph))


def _export_png(workspace: GeometryWorkspace) -> ExportPngOutput:
    graph = graph_view_from_access_map(workspace.graph_access_map())
    return ExportPngOutput(png_base64=base64.b64encode(render_graph_png(graph)).decode("ascii"))


def _export_json(workspace: GeometryWorkspace) -> ExportJsonOutput:
    document = workspace.document_snapshot()
    return ExportJsonOutput(document_json=document.model_dump_json(by_alias=True, indent=2))
```

```python
    registry.register(
        _definition(
            "export_svg",
            "Render the current construction as an SVG image string without mutation.",
            EmptyToolInput,
            ExportSvgOutput,
            False,
            lambda model: _export_svg(workspace),
        )
    )
    registry.register(
        _definition(
            "export_png",
            "Render the current construction as a base64-encoded PNG without mutation.",
            EmptyToolInput,
            ExportPngOutput,
            False,
            lambda model: _export_png(workspace),
        )
    )
    registry.register(
        _definition(
            "export_json",
            "Serialize the current versioned document as pretty-printed JSON without mutation.",
            EmptyToolInput,
            ExportJsonOutput,
            False,
            lambda model: _export_json(workspace),
        )
    )
```

- [ ] **Step 4: Ejecutar tests y lint; opcionalmente simplificar `mcp_server.py`**

```bash
cd backend && .venv/bin/pytest tests/test_agent_tools.py -v && .venv/bin/ruff check app tests
```

Expected: PASS. (No tocar los tools MCP de export existentes: devuelven `CallToolResult` con recursos embebidos, un contrato distinto y correcto para MCP.)

- [ ] **Step 5: Commit**

```bash
git add backend/app/agent/models.py backend/app/agent/tools.py backend/tests/test_agent_tools.py
git commit -m "feat(agent): add read-only SVG/PNG/JSON export tools"
```

---

### Task 9: MCP — wrappers de los 9 tools nuevos

**Files:**
- Modify: `backend/app/mcp_server.py`
- Modify: `backend/tests/test_mcp_api.py`

**Interfaces:**
- Consumes: tools del registry (Tasks 6–7) vía el helper existente `_mutate(document, tool_name, arguments)`.

- [ ] **Step 1: Actualizar el test de recuento**

En `backend/tests/test_mcp_api.py`, `test_mcp_lists_registered_tools_with_safety_annotations`: cambiar `assert len(tools) == 22` por `assert len(tools) == 31` y añadir:

```python
    assert "create_rotation" in tools
    assert "create_function" in tools
```

- [ ] **Step 2: Verificar que falla**

```bash
cd backend && .venv/bin/pytest tests/test_mcp_api.py -v -k lists_registered
```

Expected: FAIL (`22 != 31`).

- [ ] **Step 3: Añadir los wrappers en `backend/app/mcp_server.py`**

Insertar tras `create_vector_polygon`, siguiendo exactamente el patrón `_mutate` existente (claves camelCase del input model):

```python
@mcp.tool(annotations=CREATE)
def create_reflection_over_line(
    object_id: str,
    source: str,
    line: str,
    document: GeometryDocument | None = None,
    label: str | None = None,
) -> dict[str, Any]:
    """Reflect an existing point/line/segment/circle/polygon over an existing line."""

    return _mutate(document, "create_reflection_over_line", {"objectId": object_id, "label": label, "source": source, "line": line})


@mcp.tool(annotations=CREATE)
def create_reflection_over_point(
    object_id: str,
    source: str,
    center: str,
    document: GeometryDocument | None = None,
    label: str | None = None,
) -> dict[str, Any]:
    """Reflect an existing point/line/segment/circle/polygon over an existing point."""

    return _mutate(document, "create_reflection_over_point", {"objectId": object_id, "label": label, "source": source, "center": center})


@mcp.tool(annotations=CREATE)
def create_translation(
    object_id: str,
    source: str,
    from_point: str,
    to_point: str,
    document: GeometryDocument | None = None,
    label: str | None = None,
) -> dict[str, Any]:
    """Translate an existing object by the vector between two existing points."""

    return _mutate(document, "create_translation", {"objectId": object_id, "label": label, "source": source, "fromPoint": from_point, "toPoint": to_point})


@mcp.tool(annotations=CREATE)
def create_rotation(
    object_id: str,
    source: str,
    center: str,
    degrees: float,
    document: GeometryDocument | None = None,
    label: str | None = None,
) -> dict[str, Any]:
    """Rotate an existing object around a center point by an angle in degrees."""

    return _mutate(document, "create_rotation", {"objectId": object_id, "label": label, "source": source, "center": center, "degrees": degrees})


@mcp.tool(annotations=CREATE)
def create_homothety(
    object_id: str,
    center: str,
    point: str,
    ratio: float,
    document: GeometryDocument | None = None,
    label: str | None = None,
) -> dict[str, Any]:
    """Scale an existing point from a center by a numeric ratio (homothety)."""

    return _mutate(document, "create_homothety", {"objectId": object_id, "label": label, "center": center, "point": point, "ratio": ratio})


@mcp.tool(annotations=CREATE)
def create_inversion(
    object_id: str,
    point: str,
    circle: str,
    document: GeometryDocument | None = None,
    label: str | None = None,
) -> dict[str, Any]:
    """Invert an existing point in an existing circle."""

    return _mutate(document, "create_inversion", {"objectId": object_id, "label": label, "point": point, "circle": circle})


@mcp.tool(annotations=CREATE)
def create_arc(
    object_id: str,
    point_a: str,
    point_mid: str,
    point_b: str,
    document: GeometryDocument | None = None,
    label: str | None = None,
) -> dict[str, Any]:
    """Create a circular arc through three existing points: start, mid, end."""

    return _mutate(document, "create_arc", {"objectId": object_id, "label": label, "pointA": point_a, "pointB": point_mid, "pointC": point_b})


@mcp.tool(annotations=CREATE)
def create_function(
    object_id: str,
    expression: str,
    document: GeometryDocument | None = None,
    label: str | None = None,
) -> dict[str, Any]:
    """Create a real-valued function graph y = f(x) from a validated expression."""

    return _mutate(document, "create_function", {"objectId": object_id, "label": label, "expression": expression})


@mcp.tool(annotations=CREATE)
def create_polygon_vertex(
    object_id: str,
    polygon: str,
    index: int,
    document: GeometryDocument | None = None,
    label: str | None = None,
) -> dict[str, Any]:
    """Create a point bound to the i-th vertex (0-based) of an existing polygon."""

    return _mutate(document, "create_polygon_vertex", {"objectId": object_id, "label": label, "polygon": polygon, "index": index})
```

- [ ] **Step 4: Ejecutar el suite MCP completo**

```bash
cd backend && .venv/bin/pytest tests/test_mcp_api.py -v && .venv/bin/ruff check app tests
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/app/mcp_server.py backend/tests/test_mcp_api.py
git commit -m "feat(mcp): expose transformation, arc, function, and vertex tools"
```

---

### Task 10: Extraer `useSharing` de `App.tsx`

**Files:**
- Create: `frontend/src/app/useSharing.ts`
- Modify: `frontend/src/App.tsx`
- Test: `frontend/src/App.test.tsx` (existente; debe seguir en verde sin cambios)

**Interfaces:**
- Produces: `useSharing(options): SharingState` con `{ shared, viewingShared, shareUrl, dismissViewingShared, closeShareDialog, handleShare, handleStopSharing, resetSharing, markShared }`.

- [ ] **Step 1: Escribir el hook**

`frontend/src/app/useSharing.ts`:

```typescript
import { useCallback, useEffect, useState } from "react";

import { fetchSharedDocument, shareDocument, unshareDocument } from "../api/documentsApi";
import { readShareTokenFromLocation } from "../persistence/sharedLink";
import type { CloudActionResult } from "../persistence/useCloudDocuments";
import type { DocumentDetail } from "../types/documents";
import type { GeometryDocument } from "../types/geometry";

interface UseSharingOptions {
  cloudId: string | null;
  documentTitle: string;
  currentDocument: () => GeometryDocument;
  saveAsNewCloudDocument: (
    title: string,
    document: GeometryDocument,
  ) => Promise<CloudActionResult<DocumentDetail>>;
  setGeometryDocumentTitle: (title: string) => void;
  detachCloudDocument: () => void;
  replaceConstruction: (document: GeometryDocument) => void;
  onMessage: (message: string) => void;
  onError: (message: string) => void;
}

export interface SharingState {
  shared: boolean;
  viewingShared: boolean;
  shareUrl: string | null;
  dismissViewingShared: () => void;
  closeShareDialog: () => void;
  markShared: (value: boolean) => void;
  resetSharing: () => void;
  handleShare: () => void;
  handleStopSharing: () => void;
}

export function useSharing(options: UseSharingOptions): SharingState {
  const {
    cloudId,
    documentTitle,
    currentDocument,
    saveAsNewCloudDocument,
    setGeometryDocumentTitle,
    detachCloudDocument,
    replaceConstruction,
    onMessage,
    onError,
  } = options;
  const [shared, setShared] = useState(false);
  const [viewingShared, setViewingShared] = useState(false);
  const [shareUrl, setShareUrl] = useState<string | null>(null);

  useEffect(() => {
    const token = readShareTokenFromLocation(window.location);
    if (token === null) return;
    window.history.replaceState(null, "", window.location.pathname);
    void (async () => {
      try {
        const sharedDocument = await fetchSharedDocument(token);
        detachCloudDocument();
        replaceConstruction(sharedDocument.document);
        setShared(false);
        setViewingShared(true);
      } catch {
        onError("This shared link is no longer available.");
      }
    })();
    // Run once on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const resetSharing = useCallback(() => {
    setShared(false);
    setViewingShared(false);
    setShareUrl(null);
  }, []);

  const handleShare = useCallback(() => {
    void (async () => {
      let id = cloudId;
      if (id === null) {
        const title = window.prompt("Title for this construction:", documentTitle);
        if (title === null || title.trim() === "") return;
        const result = await saveAsNewCloudDocument(title.trim(), currentDocument());
        if (result.status !== "success") {
          if (result.status === "error") onError(result.error);
          return;
        }
        setGeometryDocumentTitle(result.value.title);
        id = result.value.id;
      }
      try {
        const { token } = await shareDocument(id);
        setShared(true);
        setShareUrl(`${window.location.origin}/?share=${token}`);
      } catch (error) {
        onError(error instanceof Error ? error.message : "Unable to share construction.");
      }
    })();
  }, [cloudId, currentDocument, documentTitle, onError, saveAsNewCloudDocument, setGeometryDocumentTitle]);

  const handleStopSharing = useCallback(() => {
    if (cloudId === null) return;
    void (async () => {
      try {
        await unshareDocument(cloudId);
        setShared(false);
        onMessage("Sharing stopped.");
      } catch (error) {
        onError(error instanceof Error ? error.message : "Unable to stop sharing.");
      }
    })();
  }, [cloudId, onError, onMessage]);

  return {
    shared,
    viewingShared,
    shareUrl,
    dismissViewingShared: useCallback(() => setViewingShared(false), []),
    closeShareDialog: useCallback(() => setShareUrl(null), []),
    markShared: setShared,
    resetSharing,
    handleShare,
    handleStopSharing,
  };
}
```

- [ ] **Step 2: Reescribir `App.tsx` para consumir el hook**

Cambios en `frontend/src/App.tsx`:

1. Eliminar los imports que quedan sin uso: `fetchSharedDocument, shareDocument, unshareDocument` de `./api/documentsApi` y `readShareTokenFromLocation` de `./persistence/sharedLink`. Añadir `import { useSharing } from "./app/useSharing";`.
2. Eliminar los estados `shared`, `viewingShared`, `shareUrl` y el `useEffect` del share-token, y los callbacks `handleShare` / `handleStopSharing`.
3. Instanciar el hook después de `reportPersistenceError` (necesita `replaceConstruction` y `currentDocument`, que deben declararse antes):

```typescript
  const sharing = useSharing({
    cloudId,
    documentTitle: geometry.document.title,
    currentDocument,
    saveAsNewCloudDocument: saveAsNewCloudDocument,
    setGeometryDocumentTitle,
    detachCloudDocument: detachCloudDocument,
    replaceConstruction,
    onMessage: (message) => setPersistenceNotice({ message, error: null }),
    onError: (error) => setPersistenceNotice({ message: null, error }),
  });
```

4. Sustituir usos:
   - `setShared(false); setViewingShared(false); setShareUrl(null);` en `handleClear` / `handleImportJson` → `sharing.resetSharing();`
   - En `handleOpenCloudDocument`: `setShared(result.value.shared); setViewingShared(false); setShareUrl(null);` → `sharing.resetSharing(); sharing.markShared(result.value.shared);`
   - En el JSX: `viewingShared` → `sharing.viewingShared`; `setViewingShared(false)` del banner → `sharing.dismissViewingShared()`; `shared={shared}` → `shared={sharing.shared}`; `onShare={handleShare}` → `onShare={sharing.handleShare}`; `onStopSharing={handleStopSharing}` → `onStopSharing={sharing.handleStopSharing}`; `<ShareDialog open={shareUrl !== null} url={shareUrl} onClose={() => setShareUrl(null)} …>` → `<ShareDialog open={sharing.shareUrl !== null} url={sharing.shareUrl} onClose={sharing.closeShareDialog} onStopSharing={sharing.handleStopSharing} />`.
   - En `CloudDocumentsPanel.onDeleteDocument`: el bloque `if (id === cloudId) { setShared(false); … }` → `if (id === cloudId) { sharing.resetSharing(); }`.

- [ ] **Step 3: Verificar que el suite existente sigue en verde**

```bash
cd frontend && npm test && npm run typecheck && npm run lint
```

Expected: 25 archivos de test PASS (los tests de compartir en `App.test.tsx` cubren el comportamiento extraído), sin errores de tipos ni lint.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/app/useSharing.ts frontend/src/App.tsx
git commit -m "refactor(app): extract sharing state into useSharing hook"
```

---

### Verificación final (tras la última task)

- [ ] Backend completo: `cd backend && .venv/bin/pytest -q && .venv/bin/ruff check app tests` → todo PASS.
- [ ] Frontend completo: `cd frontend && npm test && npm run typecheck && npm run build` → todo PASS.
- [ ] `grep -rn "backend/tests/fixtures" CLAUDE.md README.md docs/` → sin resultados.

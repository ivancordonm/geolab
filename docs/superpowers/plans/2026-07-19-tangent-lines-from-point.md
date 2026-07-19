# Tangent lines from a point to a circle — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `tangent_pc` construction that produces the two tangent lines from a point to a circle, exposed via the interactive toolbar, the script language, and an agent/MCP tool, implemented identically in both runtimes.

**Architecture:** New `kind: "line"` definition `tangent_pc` modelled on `intersection_lc`. The evaluator computes the two tangent points and delegates the 1/2 · first/second/left/right choice to the existing `selectIntersection`/`_select_intersection` helper, then returns the line through the given point and the selected tangent point. Selection semantics and undefined-handling mirror line-circle intersection.

**Tech Stack:** TypeScript (Vite/Vitest frontend), Python (FastAPI/pytest backend, Pydantic v2), shared JSON conformance fixtures.

## Global Constraints

- Near-zero comparisons use `GEOMETRY_EPSILON = 1e-9` in both runtimes; results must match within `1e-9`.
- Lines are stored in normalized canonical form `a·x + b·y + c = 0`, `sqrt(a²+b²)=1`, with the existing deterministic sign convention (`canonicalLine` / `_canonical_line`). Never build a `LineValue` by hand.
- `tangent_pc` requires **exactly one** of `index` (`1|2`) or `selector` (`"first"|"second"|"left"|"right"`), matching `intersection_lc`.
- New geometry operations MUST exist in both `frontend/` and `backend/` runtimes with a shared conformance fixture.
- `index 1` = canonical-first of the two tangent points (higher `y`, tie → smaller `x`); `index 2` = the other. Both runtimes use `selectIntersection`/`_select_intersection` for this — do not invent a separate ordering.

---

### Task 1: Backend schema — `tangent_pc` definition and object

**Files:**
- Modify: `backend/app/geometry/models.py` (add definition class near line 133 after `IntersectionCCDefinition`; add object class near line 313 after `IntersectionCC`; add to `GeometryObject` union near line 481)
- Test: `backend/tests/test_geometry_models.py`

**Interfaces:**
- Produces: `TangentPointCircleDefinition(type="tangent_pc", point: str, circle: str, index: Literal[1,2]|None, selector: Literal["first","second","left","right"]|None)` and `TangentFromPoint(kind="line", definition=TangentPointCircleDefinition)`.

- [ ] **Step 1: Write the failing test**

Add to `backend/tests/test_geometry_models.py`:

```python
from app.geometry.models import TangentFromPoint, TangentPointCircleDefinition
import pytest
from pydantic import ValidationError


def test_tangent_requires_exactly_one_index_or_selector():
    TangentPointCircleDefinition(point="P", circle="c", index=1)
    TangentPointCircleDefinition(point="P", circle="c", selector="first")
    with pytest.raises(ValidationError):
        TangentPointCircleDefinition(point="P", circle="c")
    with pytest.raises(ValidationError):
        TangentPointCircleDefinition(point="P", circle="c", index=1, selector="first")


def test_tangent_object_is_a_line():
    obj = TangentFromPoint(id="t", label="t", definition=TangentPointCircleDefinition(point="P", circle="c", index=2))
    assert obj.kind == "line"
    assert obj.definition.type == "tangent_pc"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && pytest tests/test_geometry_models.py -k tangent -v`
Expected: FAIL with `ImportError`/`cannot import name 'TangentFromPoint'`.

- [ ] **Step 3: Write minimal implementation**

In `backend/app/geometry/models.py`, after the `IntersectionCCDefinition` class (around line 143):

```python
class TangentPointCircleDefinition(GeometryModel):
    type: Literal["tangent_pc"] = "tangent_pc"
    point: str
    circle: str
    index: Literal[1, 2] | None = None
    selector: Literal["first", "second", "left", "right"] | None = None

    @model_validator(mode="after")
    def exactly_one_solution_selector(self) -> TangentPointCircleDefinition:
        if (self.index is None) == (self.selector is None):
            raise ValueError("tangent_pc requires exactly one of index or selector")
        return self
```

After the `IntersectionCC` object class (around line 314):

```python
class TangentFromPoint(GeometryObjectBase):
    kind: Literal["line"] = "line"
    definition: TangentPointCircleDefinition
```

In the `GeometryObject` union (around line 481, after `| IntersectionCC`):

```python
    | TangentFromPoint
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && pytest tests/test_geometry_models.py -k tangent -v`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add backend/app/geometry/models.py backend/tests/test_geometry_models.py
git commit -m "feat(geometry): add tangent_pc schema to backend models"
```

---

### Task 2: Backend engine — tangent evaluator

**Files:**
- Modify: `backend/app/geometry/engine.py` (import near existing `IntersectionLCDefinition` import; dispatch branch after `IntersectionLCDefinition` handling around line 526; new helper near `_intersect_line_circle` around line 1050)
- Test: `backend/tests/test_geometry_engine.py` (create if absent; otherwise add to the existing engine test module — check `ls backend/tests` first)

**Interfaces:**
- Consumes: `TangentPointCircleDefinition` (Task 1), `_select_intersection`, `_line_through_points`, `_canonical_line`, `PointValue`, `CircleValue`, `UndefinedValue`, `GEOMETRY_EPSILON` (all existing in `engine.py`).
- Produces: `_tangent_point_circle(point: PointValue, circle: CircleValue, index: int | None, selector: str | None) -> EvaluatedValue`.

- [ ] **Step 1: Write the failing test**

Create `backend/tests/test_tangent.py`:

```python
from math import isclose

from app.geometry.engine import evaluate_script_document
from app.geometry.script import evaluate_script
from app.geometry.engine import evaluate_geometry_document


def _values(script: str):
    document, _ = evaluate_script(script, document_id="doc_t", title="t")
    return evaluate_geometry_document(document)


def test_two_tangents_from_external_point():
    # Circle centre (0,0) r=3; external point at (5,0). Tangent length = 4.
    values = _values("O = Point(0, 0)\nR = Point(3, 0)\nc = Circle(O, R)\nP = Point(5, 0)\nt1 = Tangent(P, c, 1)\nt2 = Tangent(P, c, 2)\n")
    t1, t2 = values["t1"], values["t2"]
    assert t1.type == "line" and t2.type == "line"
    # Tangent points are (1.8, ±2.4); lines pass through P=(5,0). Symmetric about x-axis.
    assert isclose(t1.a, t2.a, abs_tol=1e-9)
    assert isclose(t1.b, -t2.b, abs_tol=1e-9) or isclose(t1.b, t2.b, abs_tol=1e-9)
    # Point P satisfies both line equations.
    for t in (t1, t2):
        assert isclose(t.a * 5 + t.b * 0 + t.c, 0.0, abs_tol=1e-9)


def test_point_inside_circle_is_undefined():
    values = _values("O = Point(0, 0)\nR = Point(3, 0)\nc = Circle(O, R)\nP = Point(1, 0)\nt = Tangent(P, c, 1)\n")
    assert values["t"].type == "undefined"
    assert values["t"].code == "no_tangent"


def test_point_on_circle_single_tangent():
    # P=(3,0) on the circle: tangent is the vertical line x=3 → a=1,b=0,c=-3.
    values = _values("O = Point(0, 0)\nR = Point(3, 0)\nc = Circle(O, R)\nP = Point(3, 0)\nt1 = Tangent(P, c, 1)\nt2 = Tangent(P, c, 2)\n")
    t1, t2 = values["t1"], values["t2"]
    assert t1.type == "line"
    assert isclose(t1.a, 1.0, abs_tol=1e-9) and isclose(t1.b, 0.0, abs_tol=1e-9) and isclose(t1.c, -3.0, abs_tol=1e-9)
    # Both solutions coincide when the point is on the circle.
    assert isclose(t1.a, t2.a, abs_tol=1e-9) and isclose(t1.b, t2.b, abs_tol=1e-9) and isclose(t1.c, t2.c, abs_tol=1e-9)
```

> Note: `Tangent(...)` script support lands in Task 3. This test file drives both Task 2 and Task 3; run its first assertion path only after Task 3. To keep Task 2 self-contained, ALSO add a direct evaluator test that does not need the parser:

```python
from app.geometry.engine import _tangent_point_circle
from app.geometry.models_values import PointValue, CircleValue, Coordinate  # adjust import to where PointValue/CircleValue live


def test_tangent_evaluator_direct():
    circle = CircleValue(center=Coordinate(x=0, y=0), radius=3)
    p = PointValue(x=5, y=0)
    line1 = _tangent_point_circle(p, circle, index=1, selector=None)
    assert line1.type == "line"
    assert abs(line1.a * 5 + line1.b * 0 + line1.c) < 1e-9
```

> Before writing the direct test, confirm the import path of `PointValue`/`CircleValue`/`Coordinate` with: `grep -n "class PointValue\|class CircleValue\|class Coordinate" backend/app/geometry/*.py` and use the real module. If a `Coordinate` constructor differs, mirror how `_intersect_line_circle` tests build a `CircleValue` elsewhere in the suite (`grep -rn "CircleValue(" backend/tests`).

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && pytest tests/test_tangent.py::test_tangent_evaluator_direct -v`
Expected: FAIL with `cannot import name '_tangent_point_circle'`.

- [ ] **Step 3: Write minimal implementation**

In `backend/app/geometry/engine.py`, add the import to the existing models import block (where `IntersectionLCDefinition` is imported):

```python
    TangentPointCircleDefinition,
```

Add the dispatch branch right after the `IntersectionCCDefinition` branch (around line 538):

```python
        if isinstance(definition, TangentPointCircleDefinition):
            point = self._require_value(obj.id, definition.point, "point")
            if isinstance(point, UndefinedValue):
                return point
            circle = self._require_value(obj.id, definition.circle, "circle")
            if isinstance(circle, UndefinedValue):
                return circle
            assert isinstance(point, PointValue)
            assert isinstance(circle, CircleValue)
            return _tangent_point_circle(point, circle, definition.index, definition.selector)
```

Add the helper next to `_intersect_line_circle` (around line 1051):

```python
def _tangent_point_circle(
    point: PointValue,
    circle: CircleValue,
    index: int | None,
    selector: str | None,
) -> EvaluatedValue:
    ox, oy, r = circle.center.x, circle.center.y, circle.radius
    dx, dy = point.x - ox, point.y - oy
    d = hypot(dx, dy)
    if r <= GEOMETRY_EPSILON:
        return UndefinedValue(code="degenerate_circle", message="Tangent requires a circle with positive radius")
    if d < r - GEOMETRY_EPSILON:
        return UndefinedValue(code="no_tangent", message="Point is inside the circle; no tangent exists")
    if abs(d - r) <= GEOMETRY_EPSILON:
        # Point on the circle: single tangent, perpendicular to radius OP through P.
        return _canonical_line(dx, dy, -(dx * point.x + dy * point.y))
    ux, uy = dx / d, dy / d
    cos_a = r / d
    sin_a = sqrt(d * d - r * r) / d
    t_plus = (ox + r * (ux * cos_a - uy * sin_a), oy + r * (ux * sin_a + uy * cos_a))
    t_minus = (ox + r * (ux * cos_a + uy * sin_a), oy + r * (-ux * sin_a + uy * cos_a))
    selected = _select_intersection(t_plus, t_minus, index=index, selector=selector)
    if isinstance(selected, UndefinedValue):
        return selected
    tx, ty = selected
    return _line_through_points(point, PointValue(x=tx, y=ty))
```

> `hypot` and `sqrt` are already imported at the top of `engine.py` (used by `_intersect_line_circle`); confirm with `grep -n "from math import" backend/app/geometry/engine.py` and add `sqrt`/`hypot` only if missing.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && pytest tests/test_tangent.py::test_tangent_evaluator_direct -v`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/app/geometry/engine.py backend/tests/test_tangent.py
git commit -m "feat(geometry): evaluate tangent_pc in the backend engine"
```

---

### Task 3: Backend script command — `Tangent(point, circle, index|selector)`

**Files:**
- Modify: `backend/app/geometry/script.py` (import `TangentFromPoint`/`TangentPointCircleDefinition`; add a `"Tangent"` branch in `_build_object` after the `IntersectionLC` branch around line 491)
- Test: `backend/tests/test_tangent.py` (the parser-driven tests from Task 2), plus `backend/tests/test_geometry_script.py` for error cases

**Interfaces:**
- Consumes: `_require_arity`, `_resolve_reference`, `_require_kind`, `_parse_index`, `_parse_selector` (existing in `script.py`), `TangentPointCircleDefinition` (Task 1).
- Produces: script command `Tangent` with arity 3 → `[TangentFromPoint(...)]`.

- [ ] **Step 1: Write the failing test**

Add to `backend/tests/test_geometry_script.py`:

```python
def test_tangent_command_builds_two_lines():
    from app.geometry.script import evaluate_script
    document, _ = evaluate_script(
        "O = Point(0,0)\nR = Point(3,0)\nc = Circle(O, R)\nP = Point(5,0)\nt1 = Tangent(P, c, 1)\nt2 = Tangent(P, c, first)\n",
        document_id="doc", title="t",
    )
    ids = {o.id: o for o in document.objects}
    assert ids["t1"].kind == "line" and ids["t1"].definition.type == "tangent_pc"
    assert ids["t1"].definition.index == 1
    assert ids["t2"].definition.selector == "first"


def test_tangent_command_rejects_bad_arity():
    from app.geometry.script import evaluate_script, ScriptError  # confirm the raised error type in script.py
    import pytest
    with pytest.raises(Exception):
        evaluate_script("O=Point(0,0)\nR=Point(3,0)\nc=Circle(O,R)\nP=Point(5,0)\nt=Tangent(P, c)\n", document_id="d", title="t")
```

> Confirm the parser's error type/name with `grep -n "class Script\|raise\|Diagnostic\|def evaluate_script" backend/app/geometry/script.py` and use the real exception in the `pytest.raises` line.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && pytest tests/test_geometry_script.py -k tangent -v`
Expected: FAIL (unknown command `Tangent`).

- [ ] **Step 3: Write minimal implementation**

In `backend/app/geometry/script.py`, add to the models import block:

```python
    TangentFromPoint,
    TangentPointCircleDefinition,
```

Add the command branch after the `IntersectionLC` branch (around line 491):

```python
    if command == "Tangent":
        _require_arity(statement, 3)
        pt = _resolve_reference(arguments[0], statement, symbols, argument_position=1)
        _require_kind(pt, "point", statement, 1)
        cr = _resolve_reference(arguments[1], statement, symbols, argument_position=2)
        _require_kind(cr, "circle", statement, 2)
        token = arguments[2]
        if token in ("1", "2"):
            return [TangentFromPoint(id=statement.target, label=statement.target, definition=TangentPointCircleDefinition(point=pt.id, circle=cr.id, index=_parse_index(token, statement, argument_position=3)))]
        selector = _parse_selector(statement=statement, token=token, allowed=("first", "second", "left", "right"), argument_position=3)
        return [TangentFromPoint(id=statement.target, label=statement.target, definition=TangentPointCircleDefinition(point=pt.id, circle=cr.id, selector=selector))]
```

> Match `_parse_index` / `_parse_selector` call signatures to their real definitions (seen around line 892/922 in `script.py`) — the arguments above mirror how `IntersectionLC`/`Intersection` call them; adjust keyword names if they differ.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && pytest tests/test_geometry_script.py -k tangent tests/test_tangent.py -v`
Expected: PASS (all tangent tests, including the parser-driven ones from Task 2).

- [ ] **Step 5: Commit**

```bash
git add backend/app/geometry/script.py backend/tests/test_geometry_script.py backend/tests/test_tangent.py
git commit -m "feat(geometry): add Tangent script command"
```

---

### Task 4: Backend agent tool + MCP wrapper

**Files:**
- Modify: `backend/app/agent/models.py` (new `TangentConstructionInput` after `CircleLineIntersectionInput` around line 100)
- Modify: `backend/app/agent/tools.py` (import the input model + `TangentFromPoint`/`TangentPointCircleDefinition`; register `create_tangent`; add `_create_tangent` handler near `_create_circle_line_intersection` around line 711)
- Modify: `backend/app/mcp_server.py` (new `create_tangent` MCP tool near `create_circle_line_intersection` around line 205)
- Modify: `backend/app/agent/script_planner.py` (add a line to the tool list around line 46) and `backend/app/agent/tool_calling_planner.py` (mention tangent in the derived-object note around line 50)
- Test: `backend/tests/test_agent_tools.py` (find the module that tests `create_circle_line_intersection` with `grep -rln "create_circle_line_intersection" backend/tests`)

**Interfaces:**
- Consumes: `ToolRegistry`, `_definition`, `_resolve_kind`, `_ensure_name_available`, `_commit_defined` (existing in `tools.py`); `TangentFromPoint`/`TangentPointCircleDefinition` (Task 1).
- Produces: registry tool `create_tangent` accepting `{object_id, label?, point, circle, selector}` where `selector ∈ {first, second, left, right}`.

- [ ] **Step 1: Write the failing test**

Add to the agent-tools test module (mirror the existing `create_circle_line_intersection` test):

```python
def test_create_tangent_registers_a_line(workspace_with_circle_and_point):
    # Build workspace: point P and circle c already present (reuse the fixture pattern used by the circle-line intersection test).
    registry = create_geometry_tool_registry(workspace_with_circle_and_point)
    _, output = registry.execute("create_tangent", {"objectId": "t", "point": "P", "circle": "c", "selector": "first"})
    obj = next(o for o in workspace_with_circle_and_point.document_snapshot().objects if o.id == "t")
    assert obj.kind == "line"
    assert obj.definition.type == "tangent_pc"
    assert obj.definition.selector == "first"
```

> If no reusable fixture exists, construct the workspace inline exactly as the circle-line intersection test does (`grep -n "create_circle_line_intersection" backend/tests/*.py` then copy its setup).

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && pytest -k create_tangent -v`
Expected: FAIL (`Tool 'create_tangent' is not registered`).

- [ ] **Step 3: Write minimal implementation**

`backend/app/agent/models.py` after `CircleLineIntersectionInput`:

```python
class TangentConstructionInput(GeometryModel):
    object_id: str
    label: str | None = None
    point: str
    circle: str
    selector: Literal["first", "second", "left", "right"]
```

`backend/app/agent/tools.py` — add imports (`TangentConstructionInput` from `.models`; `TangentFromPoint`, `TangentPointCircleDefinition` from geometry models), register after `create_circle_line_intersection`:

```python
    registry.register(
        _definition(
            "create_tangent",
            "Create one tangent line from a point to a circle, selected by first, second, left, or right.",
            TangentConstructionInput,
            MutationToolOutput,
            True,
            lambda model: _create_tangent(workspace, model),
        )
    )
```

Add the handler near `_create_circle_line_intersection`:

```python
def _create_tangent(
    workspace: GeometryWorkspace,
    raw_input: BaseModel,
) -> MutationToolOutput:
    input_model = TangentConstructionInput.model_validate(raw_input)
    access = workspace.graph_access_map()
    _ensure_name_available(access, input_model.object_id, input_model.label)
    point = _resolve_kind(access, input_model.point, "point")
    circle = _resolve_kind(access, input_model.circle, "circle")
    obj = TangentFromPoint(
        id=input_model.object_id,
        label=input_model.label or input_model.object_id,
        definition=TangentPointCircleDefinition(
            point=point.object.id,
            circle=circle.object.id,
            selector=input_model.selector,
        ),
    )
    return _commit_defined(workspace, obj)
```

`backend/app/mcp_server.py` after `create_circle_line_intersection`:

```python
@mcp.tool(annotations=CREATE)
def create_tangent(
    object_id: str,
    point: str,
    circle: str,
    selector: Literal["first", "second", "left", "right"],
    document: GeometryDocument | None = None,
    label: str | None = None,
) -> dict[str, Any]:
    """Create one tangent line from a point to a circle, selected by first, second, left, or right."""

    return _mutate(document, "create_tangent", {"objectId": object_id, "label": label, "point": point, "circle": circle, "selector": selector})
```

Add one line to `backend/app/agent/script_planner.py` tool list:

```
- Tangent(point, circle, selector)  one tangent line from a point to a circle
```

And extend the derived-object note in `backend/app/agent/tool_calling_planner.py` to include "tangents".

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && pytest -k create_tangent -v`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/app/agent/ backend/app/mcp_server.py backend/tests/
git commit -m "feat(agent): expose create_tangent tool via registry and MCP"
```

---

### Task 5: Conformance fixture — extend `derived-constructions`

**Files:**
- Modify: `backend/fixtures-src/derived-constructions.txt` (append tangent statements)
- Regenerate: `shared/fixtures/derived-constructions.json`

**Interfaces:**
- Consumes: the `Tangent` script command (Task 3).

- [ ] **Step 1: Append tangent statements to the source script**

Add to the end of `backend/fixtures-src/derived-constructions.txt`:

```
Pt = Point(6, 2)
tg0 = Tangent(Pt, c1, 1)
tg1 = Tangent(Pt, c1, 2)
```

> `c1 = Circle(A, B)` already exists in this fixture; `Pt=(6,2)` is outside it (centre A=(0,0), radius 4), so two real tangents exist.

- [ ] **Step 2: Regenerate the fixture**

Run: `cd backend && source .venv/bin/activate && python scripts/generate_conformance_fixture.py fixtures-src/derived-constructions.txt ../shared/fixtures/derived-constructions.json`
Expected: `Wrote ../shared/fixtures/derived-constructions.json with N evaluated values` (N increased by 3).

- [ ] **Step 3: Verify the backend still evaluates it**

Run: `cd backend && pytest -q`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add backend/fixtures-src/derived-constructions.txt shared/fixtures/derived-constructions.json
git commit -m "test(conformance): add tangent lines to derived-constructions fixture"
```

---

### Task 6: Frontend schema — `TangentFromPoint` type

**Files:**
- Modify: `frontend/src/types/geometry.ts` (interface after `IntersectionCC` around line 94; union entry after `| IntersectionCC` around line 222)

**Interfaces:**
- Produces: `TangentFromPoint` interface (`kind: "line"`, `definition.type: "tangent_pc"`).

- [ ] **Step 1: Add the interface and union entry**

After the `IntersectionCC` interface (around line 94):

```ts
export interface TangentFromPoint extends GeometryObjectBase {
  kind: "line";
  definition: {
    type: "tangent_pc";
    point: GeometryObjectId;
    circle: GeometryObjectId;
    index?: 1 | 2 | null;
    selector?: "first" | "second" | "left" | "right" | null;
  };
}
```

In the `GeometryObject` union after `| IntersectionCC` (around line 222):

```ts
  | TangentFromPoint
```

- [ ] **Step 2: Typecheck**

Run: `cd frontend && npm run typecheck`
Expected: errors in `engine.ts`/`circles.ts`/`constructionTools.ts` about unhandled `"tangent_pc"` (these are fixed in Tasks 7–8). If typecheck passes cleanly, that is fine too — proceed.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/types/geometry.ts
git commit -m "feat(geometry): add TangentFromPoint type to frontend schema"
```

---

### Task 7: Frontend engine + evaluator

**Files:**
- Modify: `frontend/src/geometry/engine.ts` (`getParentIds` around line 69; `evaluateObject` dispatch around line 66/269; validation switch around line 277)
- Modify: `frontend/src/geometry/evaluators/circles.ts` (import from `./lines`; `case "tangent_pc"` in `evaluateCircleFamily`; new `tangentPointCircle` helper)
- Test: `frontend/src/geometry/engine.test.ts`

**Interfaces:**
- Consumes: `selectIntersection` (private in `circles.ts`), `lineThroughPoints` + `canonicalLine` (exported from `./lines`), `CircleValue`, `PointValue`, `GEOMETRY_EPSILON`, `cleanZero`, `isUndefined`, `requireValue`.
- Produces: `tangent_pc` evaluation routed through `evaluateCircleFamily`.

- [ ] **Step 1: Write the failing test**

Add to `frontend/src/geometry/engine.test.ts`:

```ts
import { evaluateGeometryDocument } from "./engine";
import type { GeometryDocument } from "../types/geometry";

function tangentDoc(px: number, py: number): GeometryDocument {
  return {
    schemaVersion: 1, id: "d", title: "t", objects: [
      { id: "O", label: "O", visible: true, kind: "point", definition: { type: "free", x: 0, y: 0 } },
      { id: "R", label: "R", visible: true, kind: "point", definition: { type: "free", x: 3, y: 0 } },
      { id: "c", label: "c", visible: true, kind: "circle", definition: { type: "center_through_point", center: "O", point: "R" } },
      { id: "P", label: "P", visible: true, kind: "point", definition: { type: "free", x: px, y: py } },
      { id: "t1", label: "t1", visible: true, kind: "line", definition: { type: "tangent_pc", point: "P", circle: "c", index: 1 } },
      { id: "t2", label: "t2", visible: true, kind: "line", definition: { type: "tangent_pc", point: "P", circle: "c", index: 2 } },
    ],
  } as unknown as GeometryDocument;
}

describe("tangent_pc", () => {
  it("returns two lines through an external point", () => {
    const v = evaluateGeometryDocument(tangentDoc(5, 0));
    const t1 = v.get("t1")!; const t2 = v.get("t2")!;
    expect(t1.type).toBe("line"); expect(t2.type).toBe("line");
    if (t1.type === "line") expect(t1.a * 5 + t1.b * 0 + t1.c).toBeCloseTo(0, 9);
    if (t2.type === "line") expect(t2.a * 5 + t2.b * 0 + t2.c).toBeCloseTo(0, 9);
  });

  it("is undefined when the point is inside the circle", () => {
    const v = evaluateGeometryDocument(tangentDoc(1, 0));
    const t = v.get("t1")!;
    expect(t.type).toBe("undefined");
    if (t.type === "undefined") expect(t.code).toBe("no_tangent");
  });

  it("returns a single tangent when the point is on the circle", () => {
    const v = evaluateGeometryDocument(tangentDoc(3, 0));
    const t1 = v.get("t1")!;
    expect(t1.type).toBe("line");
    if (t1.type === "line") { expect(t1.a).toBeCloseTo(1, 9); expect(t1.b).toBeCloseTo(0, 9); expect(t1.c).toBeCloseTo(-3, 9); }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/geometry/engine.test.ts -t tangent_pc`
Expected: FAIL (throws "unsupported definition type 'tangent_pc'" or validation error).

- [ ] **Step 3: Write minimal implementation**

`frontend/src/geometry/engine.ts`:

In `getParentIds`, after the `intersection_cc` case (around line 69):

```ts
    case "tangent_pc":
      return [object.definition.point, object.definition.circle];
```

In `evaluateObject`'s dispatch, next to the `intersection_lc` case (around line 66) route it to the circle family:

```ts
    case "tangent_pc":
      return evaluateCircleFamily(object, values);
```

In the validation switch, after the `intersection_cc` case (around line 286):

```ts
      case "tangent_pc":
        requireKind(def.point, "point");
        requireKind(def.circle, "circle");
        if ((def.index == null) === (def.selector == null)) {
          throw new GeometryValidationError(
            `Object '${object.id}' requires exactly one tangent index or selector`,
          );
        }
        return;
```

`frontend/src/geometry/evaluators/circles.ts`:

Change the import from `./lines` (add it if absent):

```ts
import { canonicalLine, lineThroughPoints } from "./lines";
```

Add the case inside `evaluateCircleFamily`'s switch (after `intersection_cc`, around line 58):

```ts
    case "tangent_pc": {
      const point = requireValue<PointValue>(values, object.id, def.point, "point");
      if (isUndefined(point)) return point;
      const cr = requireValue<CircleValue>(values, object.id, def.circle, "circle");
      if (isUndefined(cr)) return cr;
      return tangentPointCircle(point, cr, def.index, def.selector);
    }
```

Add the helper (near `intersectLineCircle`):

```ts
function tangentPointCircle(
  point: PointValue,
  circle: CircleValue,
  index?: 1 | 2 | null,
  selector?: "first" | "second" | "left" | "right" | null,
): EvaluatedValue {
  const ox = circle.center.x, oy = circle.center.y, r = circle.radius;
  const dx = point.x - ox, dy = point.y - oy;
  const d = Math.hypot(dx, dy);
  if (r <= GEOMETRY_EPSILON) {
    return { type: "undefined", code: "degenerate_circle", message: "Tangent requires a circle with positive radius" };
  }
  if (d < r - GEOMETRY_EPSILON) {
    return { type: "undefined", code: "no_tangent", message: "Point is inside the circle; no tangent exists" };
  }
  if (Math.abs(d - r) <= GEOMETRY_EPSILON) {
    return canonicalLine(dx, dy, -(dx * point.x + dy * point.y));
  }
  const ux = dx / d, uy = dy / d;
  const cosA = r / d;
  const sinA = Math.sqrt(d * d - r * r) / d;
  const tPlus = { x: ox + r * (ux * cosA - uy * sinA), y: oy + r * (ux * sinA + uy * cosA) };
  const tMinus = { x: ox + r * (ux * cosA + uy * sinA), y: oy + r * (-ux * sinA + uy * cosA) };
  const t = selectIntersection(tPlus, tMinus, index, selector);
  if ("type" in t) return t;
  return lineThroughPoints(point, { type: "point", x: t.x, y: t.y });
}
```

> If `circles.ts` did not previously import from `./lines`, verify there is no import cycle: `lines.ts` must not import from `circles.ts` (it does not, as of this plan).

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd frontend && npx vitest run src/geometry/engine.test.ts -t tangent_pc && npx vitest run src/geometry/conformance.test.ts && npm run typecheck`
Expected: PASS (unit tests + conformance reproduces the regenerated `derived-constructions` tangent values + clean typecheck).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/geometry/engine.ts frontend/src/geometry/evaluators/circles.ts frontend/src/geometry/engine.test.ts
git commit -m "feat(geometry): evaluate tangent_pc in the frontend engine"
```

---

### Task 8: Frontend interactive tool

**Files:**
- Modify: `frontend/src/geometry/constructionTools.ts` (`ConstructionTool` union line 58; `TOOL_INSTRUCTIONS` line 114; `MULTI_STEP_REQUIREMENTS` line 137; `toolLabel` labels line 174; `finishGroup` multiPrimary line 483; `createConstruction` switch after the `intersection` case line 584)
- Test: `frontend/src/geometry/constructionTools.test.ts` (find with `ls frontend/src/geometry/*.test.ts`; if none tests tool creation, add to `engine.test.ts` or create `constructionTools.test.ts`)

**Interfaces:**
- Consumes: `nextObjectId`, `TangentFromPoint` type.
- Produces: activating `"tangent"` with a selected point + circle yields two `tangent_pc` line objects (`index` 1 and 2).

- [ ] **Step 1: Write the failing test**

Create `frontend/src/geometry/constructionTools.test.ts` (or add a block if the file exists):

```ts
import { describe, expect, it } from "vitest";
import { ConstructionToolController } from "./constructionTools";
import type { GeometryDocument } from "../types/geometry";

const baseDoc: GeometryDocument = {
  schemaVersion: 1, id: "d", title: "t", objects: [
    { id: "P", label: "P", visible: true, kind: "point", definition: { type: "free", x: 5, y: 0 } },
    { id: "O", label: "O", visible: true, kind: "point", definition: { type: "free", x: 0, y: 0 } },
    { id: "R", label: "R", visible: true, kind: "point", definition: { type: "free", x: 3, y: 0 } },
    { id: "c", label: "c", visible: true, kind: "circle", definition: { type: "center_through_point", center: "O", point: "R" } },
  ],
} as unknown as GeometryDocument;

describe("tangent tool", () => {
  it("creates two tangent_pc lines from a point and a circle", () => {
    // Drive the controller exactly as the intersection-tool test does: activate "tangent",
    // click P then c, and read createdObjects from the final result.
    // (Mirror the existing intersection tool test in this repo for the precise controller calls.)
    const created = ConstructionToolController // ... see note below
      ;
    expect(true).toBe(true); // placeholder replaced below
  });
});
```

> Before finalizing, open the existing test that exercises the `intersection` controller flow (`grep -rn "intersection" frontend/src/geometry/*.test.ts frontend/src/**/*.test.ts`) and copy its exact click/activation sequence, asserting the two created objects have `definition.type === "tangent_pc"` and `index` 1 and 2. Do NOT ship the placeholder assertion.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/geometry/constructionTools.test.ts`
Expected: FAIL (tool `"tangent"` not handled / type error).

- [ ] **Step 3: Write minimal implementation**

`frontend/src/geometry/constructionTools.ts`:

Add to the `ConstructionTool` union (after `"circumcircle"`, line 48):

```ts
  | "tangent"
```

Add to `TOOL_INSTRUCTIONS`:

```ts
  tangent: "Click a point and a circle to draw the two tangent lines.",
```

Add to `MULTI_STEP_REQUIREMENTS`:

```ts
  tangent: ["point", "circle"],
```

Add to `toolLabel`'s `labels`:

```ts
    tangent: "Tangent lines",
```

Extend `finishGroup`'s `multiPrimary`:

```ts
    const multiPrimary = tool === "intersection" || tool === "inversion" || tool === "tangent";
```

Add the case in `createConstruction` after the `intersection` case (around line 584):

```ts
    case "tangent": {
      const objA = document.objects.find((o) => o.id === first);
      const objB = document.objects.find((o) => o.id === second);
      if (objA === undefined || objB === undefined) {
        throw new Error("Tangent: parent objects not found in document");
      }
      const pointId = objA.kind === "point" ? first : second;
      const circleId = objA.kind === "circle" ? first : second;
      const id1 = nextObjectId(document, "t");
      const fakeDoc: GeometryDocument = { ...document, objects: [...document.objects, { id: id1, label: id1 } as unknown as GeometryObject] };
      const id2 = nextObjectId(fakeDoc, "t");
      const l1: TangentFromPoint = { id: id1, label: id1, kind: "line", visible: true, definition: { type: "tangent_pc", point: pointId, circle: circleId, index: 1 } };
      const l2: TangentFromPoint = { id: id2, label: id2, kind: "line", visible: true, definition: { type: "tangent_pc", point: pointId, circle: circleId, index: 2 } };
      return [l1, l2];
    }
```

Add `TangentFromPoint` to the type imports at the top of `constructionTools.ts` (the import from `../types/geometry` that already lists `IntersectionLC`, etc.).

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd frontend && npx vitest run src/geometry/constructionTools.test.ts && npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/geometry/constructionTools.ts frontend/src/geometry/constructionTools.test.ts
git commit -m "feat(geometry): add interactive tangent tool"
```

---

### Task 9: Toolbar group — rename to "Circle constructions" and add Tangent

**Files:**
- Modify: `frontend/src/components/geometry/ConstructionToolbar.tsx` (import `Spline`; group entry lines 86–93)
- Test: `frontend/src/components/geometry/ConstructionToolbar.test.tsx`

**Interfaces:**
- Consumes: the `tangent` tool (Task 8).

- [ ] **Step 1: Write the failing test**

Add to `frontend/src/components/geometry/ConstructionToolbar.test.tsx` (mirror the Polygons group tests around lines 79–100):

```tsx
it("groups intersection, tangent and circumcircle under Circle constructions", async () => {
  const user = userEvent.setup();
  const onActivateTool = vi.fn();
  render(<ConstructionToolbar activeTool="select" onActivateTool={onActivateTool} />);

  await user.click(screen.getByRole("button", { name: "Circle constructions" }));
  await user.click(screen.getByRole("menuitem", { name: "Tangent lines" }));

  expect(onActivateTool).toHaveBeenCalledWith("tangent");
  expect(screen.queryByRole("menu")).not.toBeInTheDocument();
});
```

> Confirm the group trigger's accessible name. `ToolGroupButton` shows the last-used tool's icon; the button's name comes from the group `label`/`instruction`. Check the Polygons test's `getByRole("button", { name: ... })` string and use the matching convention for "Circle constructions".

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/components/geometry/ConstructionToolbar.test.tsx -t "Circle constructions"`
Expected: FAIL (no button named "Circle constructions").

- [ ] **Step 3: Write minimal implementation**

In `frontend/src/components/geometry/ConstructionToolbar.tsx`, add `Spline` to the `lucide-react` import (alphabetically near `Crosshair`/`CircleDot`):

```tsx
  Spline,
```

Replace the group entry (lines 86–93):

```tsx
  {
    group: "intersection-circumcircle",
    label: "Circle constructions",
    instruction: "Choose an intersection, tangent, or circumscribed-circle tool",
    tools: [
      { tool: "intersection", label: "Intersection", icon: Crosshair },
      { tool: "tangent", label: "Tangent lines", icon: Spline },
      { tool: "circumcircle", label: "Circumscribed circle", icon: CircleDot },
    ],
  },
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd frontend && npx vitest run src/components/geometry/ConstructionToolbar.test.tsx && npm run typecheck`
Expected: PASS (new test + existing group tests).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/geometry/ConstructionToolbar.tsx frontend/src/components/geometry/ConstructionToolbar.test.tsx
git commit -m "feat(ui): rename circle-tools group and add Tangent tool"
```

---

### Task 10: Full-suite verification

- [ ] **Step 1: Backend suite**

Run: `cd backend && source .venv/bin/activate && pytest -q && ruff check app tests`
Expected: PASS, no lint errors.

- [ ] **Step 2: Frontend suite**

Run: `cd frontend && npx vitest run && npm run typecheck && npm run build`
Expected: PASS, clean typecheck, successful build.

- [ ] **Step 3: Manual end-to-end (verify skill)**

Run the app (`npm run dev`), create a circle and an external point, activate **Circle constructions → Tangent lines**, click the point then the circle, and confirm two tangent lines appear touching the circle. Repeat with the point inside the circle and confirm no lines are drawn (undefined).

---

## Self-Review

**Spec coverage:** schema (Task 1/6), math+evaluators both runtimes (Task 2/7), parser (Task 3), agent+MCP (Task 4), toolbar rename+tool (Task 8/9), conformance (Task 5), degenerate cases (tested in Task 2/7). All spec sections mapped.

**Placeholder scan:** Task 7/8 test snippets contain explicit "mirror the existing intersection test" notes rather than a guessed controller API, because the exact `ConstructionToolController` drive sequence must be copied from the repo's existing test; the placeholder assertion in Task 8 Step 1 is explicitly flagged "do NOT ship". Every implementation step ships complete code.

**Type consistency:** `tangent_pc`, `TangentFromPoint`, `TangentPointCircleDefinition`, `create_tangent`, `tangentPointCircle`/`_tangent_point_circle`, selector set `{first,second,left,right}`, and code `no_tangent` are used identically across all tasks and both runtimes.

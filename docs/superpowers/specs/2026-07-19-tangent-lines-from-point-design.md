# Tangent lines from a point to a circle — Design

**Date:** 2026-07-19
**Status:** Approved

## Goal

Add a new geometry construction: the two tangent lines to a circle drawn from a
given point. Expose it as an interactive toolbar tool, a script command, and an
agent/MCP tool. Rename the existing `intersection-circumcircle` toolbar group to
**"Circle constructions"** and place the new tool inside it alongside
Intersection and Circumscribed circle.

The construction crosses every layer that a geometry primitive touches, so it is
implemented in **both runtimes** (TypeScript + Python) with a shared conformance
fixture, per the dual-runtime constraint in `CLAUDE.md`.

## Behaviour

Selecting a **point** `P` and a **circle** (center `O`, radius `r`) produces the
**two tangent lines** from `P` to the circle — analogous to how the Intersection
tool produces two intersection points. Each tangent line is its own derived
object carrying an `index` (1 or 2) to pick which of the two solutions it is.

Degenerate cases (mirroring the intersection evaluators' undefined handling):

- `d = |OP| < r` — `P` is **inside** the circle → no tangents exist →
  `UndefinedValue(code="no_tangent")` for both objects.
- `d ≈ r` (within `1e-9`) — `P` is **on** the circle → a single tangent (the line
  through `P` perpendicular to `OP`); `index` 1 and 2 return the same line.
- `d > r` — two distinct tangent lines.

## Contract / schema (both runtimes)

New definition variant, `kind: "line"`, modelled exactly on `intersection_lc`:

```ts
// frontend/src/types/geometry.ts
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

```python
# backend/app/geometry/models.py
class TangentPointCircleDefinition(BaseModel):
    type: Literal["tangent_pc"] = "tangent_pc"
    point: str
    circle: str
    index: Literal[1, 2] | None = None
    selector: Literal["first", "second", "left", "right"] | None = None
    # exactly-one(index, selector) validator, reused from intersection_lc
```

The "exactly one of `index` / `selector`" rule reuses the same validator pattern
as `IntersectionLCDefinition`.

## Mathematics (identical in both runtimes, tolerance `1e-9`)

Given `P`, `O`, `r`, let `d = |OP|` and `û = (P − O) / d`.

- `d < r − eps` → undefined (`no_tangent`).
- `|d − r| ≤ eps` → single tangent: line through `P` with direction perpendicular
  to `OP`. Both indices return it.
- `d > r + eps` → `α = arccos(r / d)`. Tangent points
  `T_i = O + r · Rot(±α) · û`, where **`index 1` uses `+α` (counter-clockwise)**
  and **`index 2` uses `−α`**. The tangent line is the line through `P` and `T_i`,
  returned in the project's normalized canonical form `a·x + b·y + c = 0`,
  `sqrt(a²+b²)=1`.

The `+α`/`−α` sign convention is the deterministic tie-break that keeps both
runtimes bit-identical; it is asserted by the conformance fixture. When a
`selector` is supplied instead of an `index`, it is resolved with the existing
`_select_intersection` (Python) / `selectIntersection` (TS) helper against the
two candidate tangent points, so tangent selection semantics match line-circle
intersection selection.

## Evaluators

- **TS:** extend `evaluateLineFamily` in
  `frontend/src/geometry/evaluators/lines.ts` with a `case "tangent_pc"`; new
  helper `tangentPointCircle(point, circle, index, selector)` returning
  `EvaluatedValue`.
- **Python:** add a branch in the `engine.py` dispatch next to
  `_intersect_line_circle`, plus `_tangent_point_circle(...)`.

## Parser / script

New command `Tangent(point, circle, index|selector)` returning a single line,
mirroring `IntersectionLC` (arity 3):

- **Python:** `script.py` `_build_object` gains a `"Tangent"` branch.
- **TS:** the corresponding parser/serializer path gains `tangent_pc`.

Example: `t: Tangent(P, c, 1)` or `t: Tangent(P, c, first)`.

## Interactive tool + toolbar group

`frontend/src/geometry/constructionTools.ts`:

- Add `"tangent"` to the `ConstructionTool` union.
- `requiredParents.tangent = ["point", "circle"]`.
- Instruction: "Click a point and a circle to draw the two tangent lines."
- Command-name map: `tangent: "Tangent"`.
- Add `tangent` to the `multiPrimary` set (it emits two outputs).
- New `case "tangent"` in the object-creation switch: allocate two IDs and create
  two `tangent_pc` line objects (`index: 1` and `index: 2`), exactly like the
  `intersection` line-circle branch.

`frontend/src/components/geometry/ConstructionToolbar.tsx` — the existing group
(id kept as `intersection-circumcircle`) is renamed and gains the new tool:

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

Icon: `Spline` from lucide-react (a curve met by a line — the closest available
metaphor for tangency).

## Agent / MCP tool

Expose the construction to the assistant, consistent with existing tools like
`create_line_line_intersection` and `create_perpendicular_line`:

- `backend/app/mcp_server.py`: new `create_tangent(document, point, circle,
  index, object_id, label)` that emits a `Tangent(...)` script statement via
  `_mutate`.
- Register the tool in the agent tool registry so planners can invoke it, and add
  a one-line mention to the planner prompts that list derived-object tools
  (`script_planner.py`, `tool_calling_planner.py`) so the model prefers it over
  fabricating coordinates.

## Testing and conformance

- **Conformance fixture:** `shared/fixtures/tangent_from_point.json`, generated
  with `backend/scripts/generate_conformance_fixture.py` from a script that builds
  a circle, an external point, and both tangents. Both runtime suites must satisfy
  it.
- **TS unit tests** (`engine.test.ts`): two tangents from an external point;
  point-inside → undefined; point-on-circle → single tangent.
- **Python unit tests**: same three cases against the engine, plus a `script.py`
  parse test for `Tangent(...)` (arity/selector errors).
- **Toolbar tests** (`ConstructionToolbar.test.tsx`, mirroring the Polygons
  tests): selecting Tangent in the group calls `onActivateTool("tangent")`; the
  renamed group label "Circle constructions" renders.

## Out of scope (YAGNI)

- Backend SVG/PNG rendering of the tangent lines beyond what the generic line
  renderer already handles (no special styling).
- Tangent-point objects (`T1`, `T2`) as separate outputs — the tool emits only the
  two lines, per the approved output shape.
- Tangents from a point to a conic other than a circle.

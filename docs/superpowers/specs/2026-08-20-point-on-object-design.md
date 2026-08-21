# Point on object (point-on-line / segment / circle / arc) — Design

**Date:** 2026-08-20
**Status:** Approved

## Goal

Fix a missing construction: the interactive **"Point"** tool currently does
nothing when the user clicks on an existing line, segment, circle, or arc
(`constructionTools.ts:397-399` no-ops), which blocks common workflows like
"create a point on a line, then draw the perpendicular through it." What looks
like a bug is really a missing feature: **no constrained "point on object"
definition exists in either runtime.**

Add four new point-definition variants — `on_line`, `on_segment`, `on_circle`,
`on_arc` — each a point whose position is derived from a parent object plus a
path parameter, draggable along that parent (GeoGebra-style). Implemented in
both runtimes per the dual-runtime constraint in `CLAUDE.md`, exposed through
the interactive "Point" tool, the `Point(...)` script command, and an
agent/MCP tool.

## Behaviour

**Interactive tool.** The existing "Point" toolbar tool is unchanged for
clicks on empty canvas (creates a free point). Clicking on a line, segment,
circle, or arc instead creates a point **constrained to that object**,
projected to the clicked location. While the "Point" tool is active and the
pointer hovers a compatible object, a ghost/preview point marker is shown at
the projected location (visual affordance the user asked for — a real
indication of "you're about to create a point on this object," distinct from
today's bare `crosshair` cursor which does nothing).

Because the resulting object's `kind` is still `"point"`, every existing
multi-step tool that requires a `"point"` (e.g. `perpendicular`:
`["point", "line"]`) accepts a point-on-object exactly like a free point —
no changes needed to `MULTI_STEP_REQUIREMENTS` or `kindMatches`.

**Dragging.** A point-on-object can be dragged with the mouse but stays
constrained to its parent: dragging re-projects the pointer position onto the
parent's *current* evaluated shape and updates the point's path parameter. If
the parent is redefined/moved, the constrained point recomputes from its
stored parameter like any derived object in the dependency graph — it does
not stay pinned to old world coordinates.

**Parametrization** (identical formulas in both runtimes for bit-identical
results):

- **`on_line`** — `t: number`, unbounded. Base point = the line's foot of
  perpendicular from the origin, `(-a·c, -b·c)` (using the project's
  normalized implicit form `a·x+b·y+c=0`, `sqrt(a²+b²)=1`). Direction =
  `(-b, a)` (unit, since `a²+b²=1`). `point = base + t·direction`.
- **`on_segment`** — `t: number`, clamped to `[0, 1]` on both creation and
  drag. `point = A + t·(B−A)`.
- **`on_circle`** — `angle: number` (radians), unbounded (wraps naturally
  through `cos`/`sin`). `point = center + radius·(cos(angle), sin(angle))`.
- **`on_arc`** — `angle: number` (radians), clamped on creation and drag to
  the arc's angular span (computed from `start`/`mid`/`end`, same "which way
  does the arc go" logic the `arc_through_points` evaluator already implies).
  Dragging past an endpoint sticks at that endpoint.

On creation, the initial `t`/`angle` is computed by projecting the click
world-coordinate onto the parent's evaluated shape at construction time.

## Contract / schema (both runtimes)

```ts
// frontend/src/types/geometry.ts
export interface PointOnLine extends GeometryObjectBase {
  kind: "point";
  definition: { type: "on_line"; line: GeometryObjectId; t: number };
}
export interface PointOnSegment extends GeometryObjectBase {
  kind: "point";
  definition: { type: "on_segment"; segment: GeometryObjectId; t: number };
}
export interface PointOnCircle extends GeometryObjectBase {
  kind: "point";
  definition: { type: "on_circle"; circle: GeometryObjectId; angle: number };
}
export interface PointOnArc extends GeometryObjectBase {
  kind: "point";
  definition: { type: "on_arc"; arc: GeometryObjectId; angle: number };
}
```

```python
# backend/app/geometry/models.py
class PointOnLineDefinition(GeometryModel):
    type: Literal["on_line"] = "on_line"
    line: str
    t: float

class PointOnSegmentDefinition(GeometryModel):
    type: Literal["on_segment"] = "on_segment"
    segment: str
    t: float  # validated/clamped to [0, 1]

class PointOnCircleDefinition(GeometryModel):
    type: Literal["on_circle"] = "on_circle"
    circle: str
    angle: float

class PointOnArcDefinition(GeometryModel):
    type: Literal["on_arc"] = "on_arc"
    arc: str
    angle: float
```

Add all four to the `Point`-like object union in both runtimes (frontend
`GeometryObject` union; backend equivalent), and to `getParentIds` /
validation switches (`requireKind(line, "line")`, etc., mirroring
`parallel_through`/`perpendicular_through`).

## Evaluators

- **TS:** new `case`s in `GeometryGraph.evaluateObject`
  (`frontend/src/geometry/engine.ts`) and `getParentIds`/validation switches.
  Shared helper `projectOntoLine`/`projectOntoSegment`/`projectOntoCircle`/
  `projectOntoArc` (new module, e.g. `frontend/src/geometry/evaluators/pointOnObject.ts`)
  used both for evaluation (`t`/`angle` → point) and for the reverse
  projection used during drag and initial creation (point → `t`/`angle`).
- **Python:** mirrored branches in `backend/app/geometry/engine.py` plus the
  same projection helpers in a new `backend/app/geometry/point_on_object.py`
  (or alongside existing helpers), used identically for evaluation and for
  drag/creation projection when the MCP/agent tool computes an initial `t`.

## Interactive tool (`constructionTools.ts` + `GeometryCanvas.tsx`)

- `handleCanvasClick`: unchanged for the `"point"` tool (still creates a free
  point on empty-canvas clicks).
- `handleObjectClick`: the `activeTool === "point"` branch (currently a
  no-op) now checks `object.kind`/`value.type`. For `"line"`, `"segment"`,
  `"circle"`, `"arc"`, it evaluates the object, projects the last known
  pointer world-coordinate onto it to get the initial parameter, and returns
  a `createdObjects: [newPoint]` result (same shape as the free-point branch).
  Non-projectable kinds (e.g. clicking a polygon or function graph) fall back
  to today's no-op.
- **Hover preview:** `GeometryCanvas` tracks a `hoveredObjectId` (via
  `onPointerEnter`/`onPointerLeave` on the existing `.geometry-hit-target`
  elements, or reusing the existing pointer-move handler with a nearest-object
  check) while the `"point"` tool is active. When set and the hovered kind is
  projectable, `ConstructionPreview` renders a small ghost point at the
  projected location, reusing the existing preview-marker visual language.
- **Drag:** new prop/handler `onMoveConstrainedPoint(pointId, worldX, worldY)`
  parallel to the existing `onMoveFreePoint`. `GeometryCanvas`'s
  `isFreePoint`/`draggable` logic (`GeometryCanvas.tsx:160`) is extended: a
  point whose `definition.type` starts with `on_` is also draggable, routed
  to the new handler instead of `onMoveFreePoint`. The handler projects the
  drag position onto the parent's *current* evaluated value and updates the
  point's `t`/`angle` in place (same graph-recompute path as free-point
  drags).

## Script command (backend `script.py` only — the frontend has no script
parser, only the interactive builder above)

`Point` is overloaded by argument shape:

```
B = Point(3, 2)   // unchanged: two numbers → free point
C = Point(l)      // one object reference (line/segment/circle/arc) → point on that object
```

`_build_object`'s existing `command == "Point"` branch (currently
`_require_arity(statement, 2)` assuming two numbers) gains a
single-argument path: resolve the argument as an object reference, dispatch
on its `kind`/definition family, and construct the matching
`PointOn*Definition` with an initial parameter computed by projecting the
object's own reference point (e.g. midpoint of the visible line segment on
screen is not available server-side, so use a well-defined default: `t=0`
for `on_line`/`on_segment`, `angle=0` for `on_circle`, and the arc's `mid`
angle for `on_arc`). A later positional/keyword argument for an explicit
parameter is out of scope (YAGNI) — the interactive tool always supplies the
projected value directly when constructing objects, bypassing script text.

## Agent / MCP tool

New tool `create_point_on_object`, mirroring `create_midpoint`'s registration
pattern in `backend/app/agent/tools.py`:

- Input: `{ object_id: str }` (the parent line/segment/circle/arc). No
  parameter input — matches the script command's default-parameter behavior
  above (YAGNI: the model doesn't need sub-object placement precision).
- Registered in the tool registry and exposed via `backend/app/mcp_server.py`
  alongside `create_point`, following the existing pattern (emits a
  `Point(object_id)` script statement through `_mutate`).
- One-line mention added to the planner prompts that list point-creation
  tools (`script_planner.py`, `tool_calling_planner.py`) so the model prefers
  it over fabricating coordinates when asked for "a point on line X."

## Testing and conformance

- **Conformance fixtures:** one new fixture (or an extension of an existing
  one) per parent kind — `point-on-line`, `point-on-segment`,
  `point-on-circle`, `point-on-arc` — generated via
  `backend/scripts/generate_conformance_fixture.py`, asserting both runtimes
  produce identical coordinates for the same `t`/`angle`.
- **TS unit tests** (`engine.test.ts`): evaluation for each of the four
  types; segment/arc parameter clamping at the boundaries.
- **Python unit tests**: same four evaluation cases; `script.py` parse test
  for the `Point(object)` overload (each parent kind, plus an error case for
  an unprojectable reference like a polygon); `create_point_on_object` tool
  handler test.
- **Interactive tests** (`constructionTools.test.ts`): clicking each of the
  four object kinds with the "Point" tool creates the correct definition
  type; clicking a non-projectable object is still a no-op.
- **Drag tests**: dragging a point-on-line/segment/circle/arc updates its
  parameter and re-projects correctly; dragging a redefined parent
  recomputes the constrained point.

## Out of scope (YAGNI)

- Point on a function graph or polygon edge (only line/segment/circle/arc, as
  scoped with the user).
- Explicit parameter argument in the `Point(object, t)` script form.
- Snapping/merging when a point-on-object is dragged near another object
  (e.g., converting it into an intersection) — stays constrained to its
  original parent only.
- Backend SVG/PNG rendering changes beyond what the generic point renderer
  already handles.

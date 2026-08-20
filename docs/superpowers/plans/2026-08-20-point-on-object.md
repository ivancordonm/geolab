# Point on object (point-on-line / segment / circle / arc) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the interactive "Point" tool create a point constrained to an existing line, segment, circle, or arc (instead of silently doing nothing), draggable along its parent, with matching support in the script language, the Python evaluator, and the agent/MCP tool registry.

**Architecture:** Four new point-definition variants (`on_line`, `on_segment`, `on_circle`, `on_arc`), each storing a path parameter (`t` or `angle`) plus a reference to the parent object. A parameter → point function evaluates the position (implemented identically in both runtimes); a point → parameter function (frontend-only, used interactively) computes the initial parameter on click and re-projects during drag.

**Tech Stack:** TypeScript (Vite/Vitest) frontend, Python (FastAPI/pytest, Pydantic) backend, shared JSON conformance fixtures in `shared/fixtures/`.

## Global Constraints

- All near-zero geometry comparisons use `GEOMETRY_EPSILON = 1e-9` (both runtimes already define this constant — reuse it, do not redefine).
- Both runtimes must be bit-identical (within `1e-9`) for the same document — verified by a shared conformance fixture (Task 8).
- Follow the existing "Adding a new geometry construction type" checklist from `CLAUDE.md`: schema in both runtimes → evaluator in both runtimes → script constructor → conformance fixture → tool registry entry.
- No partial documents on error: script evaluation stays atomic (already guaranteed by the existing `evaluate_script` machinery — don't bypass it).
- Reference design doc: `docs/superpowers/specs/2026-08-20-point-on-object-design.md`.

---

## File overview

| File | Change |
|---|---|
| `frontend/src/geometry/evaluators/pointOnObject.ts` | **Create** — parameter↔point math for all 4 parent kinds |
| `frontend/src/geometry/evaluators/pointOnObject.test.ts` | **Create** — unit tests for the math module |
| `frontend/src/types/geometry.ts` | **Modify** — 4 new `GeometryObject` variants |
| `frontend/src/geometry/engine.ts` | **Modify** — `getParentIds`, `validateParentKinds`, `evaluateObject`, new `moveConstrainedPoint` |
| `frontend/src/geometry/engine.test.ts` | **Modify** — evaluator + drag tests |
| `frontend/src/geometry/constructionTools.ts` | **Modify** — `handleObjectClick` creates a point-on-object; threads a `world` coordinate |
| `frontend/src/geometry/constructionTools.test.ts` | **Modify** — click-to-create tests |
| `frontend/src/geometry/useConstructionTools.ts` | **Modify** — thread `world` through the hook |
| `frontend/src/geometry/useGeometryState.ts` | **Modify** — new `moveConstrainedPoint` action |
| `frontend/src/components/geometry/GeometryCanvas.tsx` | **Modify** — pass click world coord, route constrained-point drag, hover ghost preview |
| `frontend/src/App.tsx` | **Modify** — wire the new prop |
| `frontend/src/styles.css` | **Modify** — hover preview marker style |
| `backend/app/geometry/models.py` | **Modify** — 4 new Pydantic definitions/classes |
| `backend/app/geometry/engine.py` | **Modify** — mirror the TS evaluator (forward direction only) |
| `backend/tests/test_point_on_object.py` | **Create** — direct evaluator + script-driven tests |
| `backend/app/geometry/script.py` | **Modify** — `Point(object)` one-argument overload |
| `backend/app/agent/models.py` | **Modify** — `CreatePointOnObjectInput` |
| `backend/app/agent/tools.py` | **Modify** — `create_point_on_object` handler + registry entry |
| `backend/tests/test_agent_tools.py` | **Modify** — tool test |
| `backend/app/mcp_server.py` | **Modify** — `create_point_on_object` MCP wrapper |
| `backend/app/agent/script_planner.py` | **Modify** — one-line grammar addition |
| `backend/fixtures-src/point-on-object.txt` | **Create** — fixture source script |
| `shared/fixtures/point-on-object.json` | **Create** — generated fixture |
| `frontend/src/geometry/conformance.test.ts` | **Modify** — register the new fixture |

---

### Task 1: Frontend projection math (`pointOnObject.ts`)

**Files:**
- Create: `frontend/src/geometry/evaluators/pointOnObject.ts`
- Test: `frontend/src/geometry/evaluators/pointOnObject.test.ts`

**Interfaces:**
- Produces (consumed by Tasks 2, 3, 4): `pointOnLineFromT(line: LineValue, t: number): PointValue`, `tForPointOnLine(line: LineValue, point: {x,y}): number`, `pointOnSegmentFromT(segment: SegmentValue, t: number): PointValue`, `tForPointOnSegment(segment: SegmentValue, point: {x,y}): number`, `pointOnCircleFromAngle(circle: CircleValue, angle: number): PointValue`, `angleForPointOnCircle(circle: CircleValue, point: {x,y}): number`, `angleOfFromCenter(center: {x,y}, point: {x,y}): number`, `pointOnArcFromAngle(arc: ArcValue, angle: number): PointValue`, `angleForPointOnArc(arc: ArcValue, point: {x,y}): number`, `clampAngleToArc(arc: ArcValue, angle: number): number`, `projectPointerOntoObject(kind: "line"|"segment"|"circle"|"arc", value: EvaluatedValue | undefined, world: {x,y}): PointValue | null`.

- [ ] **Step 1: Write the failing test file**

Create `frontend/src/geometry/evaluators/pointOnObject.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import type { ArcValue, CircleValue, LineValue, SegmentValue } from "../../types/geometry";
import {
  angleForPointOnArc,
  angleForPointOnCircle,
  clampAngleToArc,
  pointOnArcFromAngle,
  pointOnCircleFromAngle,
  pointOnLineFromT,
  pointOnSegmentFromT,
  projectPointerOntoObject,
  tForPointOnLine,
  tForPointOnSegment,
} from "./pointOnObject";

describe("point on line", () => {
  const horizontalAxis: LineValue = { type: "line", a: 0, b: 1, c: 0 };

  it("round-trips t -> point -> t", () => {
    const point = pointOnLineFromT(horizontalAxis, 2);
    expect(point).toEqual({ type: "point", x: -2, y: 0 });
    expect(tForPointOnLine(horizontalAxis, point)).toBeCloseTo(2, 9);
  });

  it("t is unbounded (a line has no endpoints)", () => {
    expect(tForPointOnLine(horizontalAxis, { x: -1000, y: 0 })).toBeCloseTo(1000, 9);
  });
});

describe("point on segment", () => {
  const segment: SegmentValue = { type: "segment", start: { x: 0, y: 0 }, end: { x: 4, y: 0 } };

  it("projects an off-segment point perpendicularly", () => {
    expect(tForPointOnSegment(segment, { x: 2, y: 3 })).toBeCloseTo(0.5, 9);
    expect(pointOnSegmentFromT(segment, 0.5)).toEqual({ type: "point", x: 2, y: 0 });
  });

  it("clamps t to [0, 1] past either endpoint", () => {
    expect(tForPointOnSegment(segment, { x: 10, y: 0 })).toBeCloseTo(1, 9);
    expect(tForPointOnSegment(segment, { x: -10, y: 0 })).toBeCloseTo(0, 9);
    expect(pointOnSegmentFromT(segment, 5)).toEqual({ type: "point", x: 4, y: 0 });
    expect(pointOnSegmentFromT(segment, -5)).toEqual({ type: "point", x: 0, y: 0 });
  });
});

describe("point on circle", () => {
  const circle: CircleValue = { type: "circle", center: { x: 0, y: 0 }, radius: 5 };

  it("round-trips angle -> point -> angle", () => {
    const point = pointOnCircleFromAngle(circle, Math.PI / 2);
    expect(point.x).toBeCloseTo(0, 9);
    expect(point.y).toBeCloseTo(5, 9);
    expect(angleForPointOnCircle(circle, point)).toBeCloseTo(Math.PI / 2, 9);
  });
});

describe("point on arc", () => {
  // Upper half-circle: start=(5,0) angle 0, mid=(0,5) angle pi/2, end=(-5,0) angle pi. CCW sweep.
  const ccwArc: ArcValue = {
    type: "arc",
    center: { x: 0, y: 0 },
    radius: 5,
    start: { x: 5, y: 0 },
    mid: { x: 0, y: 5 },
    end: { x: -5, y: 0 },
  };

  it("keeps an angle already inside the arc's range", () => {
    expect(clampAngleToArc(ccwArc, Math.PI / 2)).toBeCloseTo(Math.PI / 2, 9);
  });

  it("clamps to the nearer endpoint when the angle falls in the excluded (lower) half", () => {
    expect(clampAngleToArc(ccwArc, -Math.PI / 4)).toBeCloseTo(0, 9); // closer to start
    expect(clampAngleToArc(ccwArc, Math.PI + Math.PI / 4)).toBeCloseTo(Math.PI, 9); // closer to end
  });

  it("angleForPointOnArc round-trips a point on the arc", () => {
    const point = pointOnArcFromAngle(ccwArc, Math.PI / 2);
    expect(angleForPointOnArc(ccwArc, point)).toBeCloseTo(Math.PI / 2, 9);
  });

  // Lower half-circle: start=(5,0) angle 0, mid=(0,-5) angle -pi/2, end=(-5,0) angle pi. CW sweep.
  const cwArc: ArcValue = {
    type: "arc",
    center: { x: 0, y: 0 },
    radius: 5,
    start: { x: 5, y: 0 },
    mid: { x: 0, y: -5 },
    end: { x: -5, y: 0 },
  };

  it("handles a clockwise arc's angular range", () => {
    expect(clampAngleToArc(cwArc, -Math.PI / 2)).toBeCloseTo(-Math.PI / 2, 9); // mid itself
    expect(clampAngleToArc(cwArc, Math.PI / 4)).toBeCloseTo(0, 9); // in the excluded upper half, nearer start
  });
});

describe("projectPointerOntoObject", () => {
  it("returns null when the value is missing or of a different type", () => {
    expect(projectPointerOntoObject("line", undefined, { x: 0, y: 0 })).toBeNull();
    expect(
      projectPointerOntoObject("line", { type: "circle", center: { x: 0, y: 0 }, radius: 1 }, { x: 0, y: 0 }),
    ).toBeNull();
  });

  it("projects onto a line", () => {
    const value: LineValue = { type: "line", a: 0, b: 1, c: 0 };
    expect(projectPointerOntoObject("line", value, { x: -3, y: 7 })).toEqual({ type: "point", x: -3, y: 0 });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd frontend && npx vitest run src/geometry/evaluators/pointOnObject.test.ts`
Expected: FAIL — `Cannot find module './pointOnObject'`.

- [ ] **Step 3: Implement the module**

Create `frontend/src/geometry/evaluators/pointOnObject.ts`:

```ts
import type { ArcValue, CircleValue, EvaluatedValue, LineValue, PointValue, SegmentValue } from "../../types/geometry";
import { GEOMETRY_EPSILON, cleanZero } from "./shared";

/**
 * Forward (parameter -> point) and reverse (point -> parameter) projections
 * for points constrained to a line, segment, circle, or arc. The forward
 * functions are the single source of truth for how `on_line`/`on_segment`/
 * `on_circle`/`on_arc` objects evaluate -- `engine.ts` and the Python
 * `engine.py` must stay bit-identical. The reverse functions are used only by
 * interactive creation, dragging, and hover preview in the frontend; the
 * backend never needs to invert a click position.
 */

// ─── Line: t is unbounded; direction (-b, a) is unit length since a²+b²=1 ──

export function pointOnLineFromT(line: LineValue, t: number): PointValue {
  const baseX = -line.a * line.c;
  const baseY = -line.b * line.c;
  return { type: "point", x: cleanZero(baseX - line.b * t), y: cleanZero(baseY + line.a * t) };
}

export function tForPointOnLine(line: LineValue, point: { x: number; y: number }): number {
  const baseX = -line.a * line.c;
  const baseY = -line.b * line.c;
  return -line.b * (point.x - baseX) + line.a * (point.y - baseY);
}

// ─── Segment: t clamped to [0, 1] ───────────────────────────────────────────

function clampUnit(t: number): number {
  return Math.min(1, Math.max(0, t));
}

export function pointOnSegmentFromT(segment: SegmentValue, t: number): PointValue {
  const clamped = clampUnit(t);
  return {
    type: "point",
    x: cleanZero(segment.start.x + clamped * (segment.end.x - segment.start.x)),
    y: cleanZero(segment.start.y + clamped * (segment.end.y - segment.start.y)),
  };
}

export function tForPointOnSegment(segment: SegmentValue, point: { x: number; y: number }): number {
  const dx = segment.end.x - segment.start.x;
  const dy = segment.end.y - segment.start.y;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared <= GEOMETRY_EPSILON * GEOMETRY_EPSILON) {
    return 0;
  }
  const t = ((point.x - segment.start.x) * dx + (point.y - segment.start.y) * dy) / lengthSquared;
  return clampUnit(t);
}

// ─── Circle: angle in radians, unbounded (wraps naturally via cos/sin) ────

export function pointOnCircleFromAngle(circle: CircleValue, angle: number): PointValue {
  return {
    type: "point",
    x: cleanZero(circle.center.x + circle.radius * Math.cos(angle)),
    y: cleanZero(circle.center.y + circle.radius * Math.sin(angle)),
  };
}

export function angleOfFromCenter(center: { x: number; y: number }, point: { x: number; y: number }): number {
  return Math.atan2(point.y - center.y, point.x - center.x);
}

export function angleForPointOnCircle(circle: CircleValue, point: { x: number; y: number }): number {
  return angleOfFromCenter(circle.center, point);
}

// ─── Arc: angle clamped to the arc's angular span (through start/mid/end) ─

function normalizeAngle(angle: number): number {
  const twoPi = 2 * Math.PI;
  let normalized = angle % twoPi;
  if (normalized < 0) normalized += twoPi;
  return normalized;
}

/** `sweep > 0`: the arc runs counter-clockwise from start to end (through mid). `sweep < 0`: clockwise. */
function arcAngularRange(arc: ArcValue): { startAngle: number; sweep: number } {
  const startAngle = angleOfFromCenter(arc.center, arc.start);
  const ccwToMid = normalizeAngle(angleOfFromCenter(arc.center, arc.mid) - startAngle);
  const ccwToEnd = normalizeAngle(angleOfFromCenter(arc.center, arc.end) - startAngle);
  if (ccwToMid <= ccwToEnd) {
    return { startAngle, sweep: ccwToEnd };
  }
  return { startAngle, sweep: ccwToEnd - 2 * Math.PI };
}

export function clampAngleToArc(arc: ArcValue, angle: number): number {
  const { startAngle, sweep } = arcAngularRange(arc);
  if (sweep >= 0) {
    const ccwFromStart = normalizeAngle(angle - startAngle);
    if (ccwFromStart <= sweep) return startAngle + ccwFromStart;
    const gapMidpoint = (sweep + 2 * Math.PI) / 2;
    return ccwFromStart <= gapMidpoint ? startAngle + sweep : startAngle;
  }
  const cwFromStart = normalizeAngle(startAngle - angle);
  const absSweep = -sweep;
  if (cwFromStart <= absSweep) return startAngle - cwFromStart;
  const gapMidpoint = (absSweep + 2 * Math.PI) / 2;
  return cwFromStart <= gapMidpoint ? startAngle + sweep : startAngle;
}

export function pointOnArcFromAngle(arc: ArcValue, angle: number): PointValue {
  const clamped = clampAngleToArc(arc, angle);
  return {
    type: "point",
    x: cleanZero(arc.center.x + arc.radius * Math.cos(clamped)),
    y: cleanZero(arc.center.y + arc.radius * Math.sin(clamped)),
  };
}

export function angleForPointOnArc(arc: ArcValue, point: { x: number; y: number }): number {
  return clampAngleToArc(arc, angleOfFromCenter(arc.center, point));
}

// ─── Interactive helper: reverse-then-forward projection for hover/click ──

export function projectPointerOntoObject(
  kind: "line" | "segment" | "circle" | "arc",
  value: EvaluatedValue | undefined,
  world: { x: number; y: number },
): PointValue | null {
  if (value === undefined || value.type !== kind) return null;
  switch (kind) {
    case "line":
      return pointOnLineFromT(value as LineValue, tForPointOnLine(value as LineValue, world));
    case "segment":
      return pointOnSegmentFromT(value as SegmentValue, tForPointOnSegment(value as SegmentValue, world));
    case "circle":
      return pointOnCircleFromAngle(value as CircleValue, angleForPointOnCircle(value as CircleValue, world));
    case "arc":
      return pointOnArcFromAngle(value as ArcValue, angleForPointOnArc(value as ArcValue, world));
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd frontend && npx vitest run src/geometry/evaluators/pointOnObject.test.ts`
Expected: PASS (all cases).

- [ ] **Step 5: Typecheck and commit**

Run: `cd frontend && npm run typecheck`
Expected: no errors.

```bash
git add frontend/src/geometry/evaluators/pointOnObject.ts frontend/src/geometry/evaluators/pointOnObject.test.ts
git commit -m "$(cat <<'EOF'
feat(geometry): add point-on-object projection math

Pure parameter<->point functions for points constrained to a line,
segment, circle, or arc. Not wired into the engine yet.
EOF
)"
```

---

### Task 2: Frontend schema + evaluator (`types/geometry.ts`, `engine.ts`)

**Files:**
- Modify: `frontend/src/types/geometry.ts`
- Modify: `frontend/src/geometry/engine.ts`
- Test: `frontend/src/geometry/engine.test.ts`

**Interfaces:**
- Consumes: Task 1's `pointOnLineFromT`, `pointOnSegmentFromT`, `pointOnCircleFromAngle`, `pointOnArcFromAngle`, `tForPointOnLine`, `tForPointOnSegment`, `angleForPointOnCircle`, `angleForPointOnArc`.
- Produces (consumed by Tasks 3, 4): types `PointOnLine`, `PointOnSegment`, `PointOnCircle`, `PointOnArc` (each `kind: "point"`); `GeometryGraph.moveConstrainedPoint(pointId, x, y): RecomputeResult`; module function `moveConstrainedPoint(document, pointId, x, y): RecomputeResult`.

- [ ] **Step 1: Add the 4 new types**

In `frontend/src/types/geometry.ts`, insert after the `PerpendicularLine` interface (after line 65, before the `// ─── Intersections ───` comment):

```ts
// ─── Point on object ────────────────────────────────────────────────────────

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

In the `GeometryObject` union, add the 4 new members right after `PolygonVertexPoint`:

```ts
export type GeometryObject =
  | Point
  | Line
  | Segment
  | Circle
  | Midpoint
  | PolygonVertexPoint
  | PointOnLine
  | PointOnSegment
  | PointOnCircle
  | PointOnArc
  | ParallelLine
  ...
```

(Keep every other existing member unchanged — only insert the 4 new lines after `PolygonVertexPoint`.)

- [ ] **Step 2: Write the failing evaluator tests**

Append to `frontend/src/geometry/engine.test.ts` (after the existing `tangent_pc` describe block, i.e. at the end of the file):

```ts
function pointOnObjectDoc(): GeometryDocument {
  return {
    schemaVersion: 1, id: "d", title: "t", objects: [
      { id: "A", label: "A", visible: true, kind: "point", definition: { type: "free", x: 0, y: 0 } },
      { id: "B", label: "B", visible: true, kind: "point", definition: { type: "free", x: 4, y: 0 } },
      { id: "l", label: "l", visible: true, kind: "line", definition: { type: "through_points", pointA: "A", pointB: "B" } },
      { id: "s", label: "s", visible: true, kind: "segment", definition: { type: "between_points", pointA: "A", pointB: "B" } },
      { id: "O", label: "O", visible: true, kind: "point", definition: { type: "free", x: 0, y: 0 } },
      { id: "R", label: "R", visible: true, kind: "point", definition: { type: "free", x: 5, y: 0 } },
      { id: "c", label: "c", visible: true, kind: "circle", definition: { type: "center_through_point", center: "O", point: "R" } },
      { id: "E", label: "E", visible: true, kind: "point", definition: { type: "free", x: 5, y: 0 } },
      { id: "F", label: "F", visible: true, kind: "point", definition: { type: "free", x: 0, y: 5 } },
      { id: "G", label: "G", visible: true, kind: "point", definition: { type: "free", x: -5, y: 0 } },
      { id: "arc1", label: "arc1", visible: true, kind: "arc", definition: { type: "arc_through_points", pointA: "E", pointMid: "F", pointB: "G" } },
      { id: "P1", label: "P1", visible: true, kind: "point", definition: { type: "on_line", line: "l", t: 2 } },
      { id: "P2", label: "P2", visible: true, kind: "point", definition: { type: "on_segment", segment: "s", t: 5 } },
      { id: "P3", label: "P3", visible: true, kind: "point", definition: { type: "on_circle", circle: "c", angle: Math.PI } },
      { id: "P4", label: "P4", visible: true, kind: "point", definition: { type: "on_arc", arc: "arc1", angle: -Math.PI / 2 } },
    ],
  } as unknown as GeometryDocument;
}

describe("point on object", () => {
  it("evaluates a point on a line at its stored t", () => {
    const v = evaluateGeometryDocument(pointOnObjectDoc());
    expect(v.get("P1")).toEqual({ type: "point", x: -2, y: 0 });
  });

  it("clamps a point on a segment to its endpoints", () => {
    const v = evaluateGeometryDocument(pointOnObjectDoc());
    expect(v.get("P2")).toEqual({ type: "point", x: 4, y: 0 });
  });

  it("evaluates a point on a circle at its stored angle", () => {
    const v = evaluateGeometryDocument(pointOnObjectDoc());
    const p3 = v.get("P3")!;
    expect(p3.type).toBe("point");
    if (p3.type === "point") {
      expect(p3.x).toBeCloseTo(-5, 9);
      expect(p3.y).toBeCloseTo(0, 9);
    }
  });

  it("clamps a point on an arc to the arc's angular range", () => {
    const v = evaluateGeometryDocument(pointOnObjectDoc());
    // arc1 goes E(0)->F(pi/2)->G(pi), CCW half-circle; -pi/2 is outside, clamps to start (E).
    expect(v.get("P4")).toEqual({ type: "point", x: 5, y: 0 });
  });

  it("recomputes when the parent line moves", () => {
    const result = moveFreePoint(pointOnObjectDoc(), "B", 0, 4); // rotate l to the vertical-ish line A-B
    expect(result.recomputedObjectIds).toContain("P1");
    const p1 = result.values.get("P1")!;
    expect(p1.type).toBe("point");
  });

  it("moveConstrainedPoint re-projects a point-on-line to a new t", () => {
    const result = moveConstrainedPoint(pointOnObjectDoc(), "P1", -6, 0);
    expect(result.values.get("P1")).toEqual({ type: "point", x: -6, y: 0 });
    const updated = result.document.objects.find((o) => o.id === "P1")!;
    expect(updated.definition).toEqual({ type: "on_line", line: "l", t: 6 });
  });

  it("moveConstrainedPoint clamps a point-on-segment drag past the endpoint", () => {
    const result = moveConstrainedPoint(pointOnObjectDoc(), "P2", 10, 0);
    expect(result.values.get("P2")).toEqual({ type: "point", x: 4, y: 0 });
  });

  it("moveConstrainedPoint throws for a free point", () => {
    expect(() => moveConstrainedPoint(pointOnObjectDoc(), "A", 1, 1)).toThrow(GeometryValidationError);
  });
});
```

Check the top of `engine.test.ts` imports `moveFreePoint`, `evaluateGeometryDocument`, `GeometryValidationError` already (reuse them); add `moveConstrainedPoint` to that same import line from `./engine`.

- [ ] **Step 3: Run the tests to verify they fail**

Run: `cd frontend && npx vitest run src/geometry/engine.test.ts`
Expected: FAIL — `on_line`/etc. unsupported definition type, and `moveConstrainedPoint` is not exported.

- [ ] **Step 4: Wire the evaluator into `engine.ts`**

Add the import (top of `frontend/src/geometry/engine.ts`, alongside the existing `evaluateCircleFamily` import):

```ts
import {
  angleForPointOnArc,
  angleForPointOnCircle,
  pointOnArcFromAngle,
  pointOnCircleFromAngle,
  pointOnLineFromT,
  pointOnSegmentFromT,
  tForPointOnLine,
  tForPointOnSegment,
} from "./evaluators/pointOnObject";
```

In `getParentIds`, insert right after the `case "polygon_vertex":` line:

```ts
    case "polygon_vertex":
      return [object.definition.polygon];
    case "on_line":
      return [object.definition.line];
    case "on_segment":
      return [object.definition.segment];
    case "on_circle":
      return [object.definition.circle];
    case "on_arc":
      return [object.definition.arc];
```

In `validateParentKinds` (the class method's `switch (def.type)`), insert right after the `case "polygon_vertex":` block (which ends with `return;`):

```ts
      case "on_line":
        requireKind(def.line, "line");
        return;
      case "on_segment":
        requireKind(def.segment, "segment");
        return;
      case "on_circle":
        requireKind(def.circle, "circle");
        return;
      case "on_arc":
        requireKind(def.arc, "arc");
        return;
```

In `evaluateObject`'s `switch (def.type)`, insert right after the `case "polygon_vertex":` block:

```ts
      case "on_line": {
        const line = this.requireValue<LineValue>(object.id, def.line, "line");
        return isUndefined(line) ? line : pointOnLineFromT(line, def.t);
      }
      case "on_segment": {
        const segment = this.requireValue<SegmentValue>(object.id, def.segment, "segment");
        return isUndefined(segment) ? segment : pointOnSegmentFromT(segment, def.t);
      }
      case "on_circle": {
        const circle = this.requireValue<CircleValue>(object.id, def.circle, "circle");
        return isUndefined(circle) ? circle : pointOnCircleFromAngle(circle, def.angle);
      }
      case "on_arc": {
        const arc = this.requireValue<ArcValue>(object.id, def.arc, "arc");
        return isUndefined(arc) ? arc : pointOnArcFromAngle(arc, def.angle);
      }
```

Note `ArcValue` must be imported in `engine.ts`'s type-only import block at the top (add it next to `CircleValue`, `LineValue`, etc.).

- [ ] **Step 5: Add `moveConstrainedPoint`**

Add a `moveConstrainedPoint` method to the `GeometryGraph` class, right after `moveFreePoint`. Each branch narrows `def.type` with an explicit `===` check (not a helper predicate) so TypeScript can discriminate the union correctly — a boolean helper like `isConstrainedType(type: string): boolean` would NOT narrow `def` inside the branches, and the final `else` would still type-check against every other point-kind definition (`midpoint`, `intersection_ll`, ...), not just `on_arc`:

```ts
  moveConstrainedPoint(pointId: GeometryObjectId, x: number, y: number): RecomputeResult {
    assertFiniteNumber(x, "x");
    assertFiniteNumber(y, "y");

    const object = this.objectsById.get(pointId);
    if (object === undefined) {
      throw new GeometryValidationError(`Unknown point '${pointId}'`);
    }
    if (object.kind !== "point") {
      throw new GeometryValidationError(`Object '${pointId}' is not a point constrained to another object`);
    }
    const def = object.definition;

    let updatedDefinition: typeof def;
    if (def.type === "on_line") {
      const line = this.requireValue<LineValue>(pointId, def.line, "line");
      if (isUndefined(line)) throw new GeometryValidationError(`Cannot move '${pointId}': parent line is undefined`);
      updatedDefinition = { type: "on_line", line: def.line, t: tForPointOnLine(line, { x, y }) };
    } else if (def.type === "on_segment") {
      const segment = this.requireValue<SegmentValue>(pointId, def.segment, "segment");
      if (isUndefined(segment)) throw new GeometryValidationError(`Cannot move '${pointId}': parent segment is undefined`);
      updatedDefinition = { type: "on_segment", segment: def.segment, t: tForPointOnSegment(segment, { x, y }) };
    } else if (def.type === "on_circle") {
      const circle = this.requireValue<CircleValue>(pointId, def.circle, "circle");
      if (isUndefined(circle)) throw new GeometryValidationError(`Cannot move '${pointId}': parent circle is undefined`);
      updatedDefinition = { type: "on_circle", circle: def.circle, angle: angleForPointOnCircle(circle, { x, y }) };
    } else if (def.type === "on_arc") {
      const arc = this.requireValue<ArcValue>(pointId, def.arc, "arc");
      if (isUndefined(arc)) throw new GeometryValidationError(`Cannot move '${pointId}': parent arc is undefined`);
      updatedDefinition = { type: "on_arc", arc: def.arc, angle: angleForPointOnArc(arc, { x, y }) };
    } else {
      throw new GeometryValidationError(`Object '${pointId}' is not a point constrained to another object`);
    }

    const updatedPoint = { ...object, definition: updatedDefinition } as GeometryObject;
    this.objectsById.set(pointId, updatedPoint);
    this.documentState = {
      ...this.documentState,
      objects: this.documentState.objects.map((candidate) => (candidate.id === pointId ? updatedPoint : candidate)),
    };

    const affected = this.collectDependants(pointId);
    const recomputedObjectIds = this.recomputeIds(affected);

    return { document: this.document, values: this.values, recomputedObjectIds };
  }
```

Add the module-level wrapper right after the existing `moveFreePoint` module function:

```ts
export function moveConstrainedPoint(
  document: GeometryDocument,
  pointId: GeometryObjectId,
  x: number,
  y: number,
): RecomputeResult {
  return new GeometryGraph(document).moveConstrainedPoint(pointId, x, y);
}
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `cd frontend && npx vitest run src/geometry/engine.test.ts`
Expected: PASS.

- [ ] **Step 7: Typecheck, run the full frontend suite, and commit**

Run: `cd frontend && npm run typecheck && npx vitest run`
Expected: no errors; all existing tests still pass.

```bash
git add frontend/src/types/geometry.ts frontend/src/geometry/engine.ts frontend/src/geometry/engine.test.ts
git commit -m "$(cat <<'EOF'
feat(geometry): evaluate points constrained to a line/segment/circle/arc

Adds on_line/on_segment/on_circle/on_arc point definitions, their
evaluator cases, and a moveConstrainedPoint mutation that re-projects
the point onto its parent's current shape.
EOF
)"
```

---

### Task 3: Interactive creation (`constructionTools.ts`)

**Files:**
- Modify: `frontend/src/geometry/constructionTools.ts`
- Test: `frontend/src/geometry/constructionTools.test.ts`

**Interfaces:**
- Consumes: Task 1's `tForPointOnLine`, `tForPointOnSegment`, `angleForPointOnCircle`, `angleForPointOnArc`, `angleOfFromCenter`; Task 2's `PointOnLine`/`PointOnSegment`/`PointOnCircle`/`PointOnArc` types.
- Produces (consumed by Task 4): `ConstructionToolController.handleObjectClick(objectId: string, document: GeometryDocument, world?: Coordinate | null): ConstructionToolResult` (new optional 3rd parameter; existing 2-arg call sites keep working since `world` defaults to `null`).

- [ ] **Step 1: Write the failing tests**

Add to `frontend/src/geometry/constructionTools.test.ts`, inside the `describe("ConstructionToolController", ...)` block (near the other `"point"` tool test, after the "creates a free point from a canvas click" test):

```ts
  it("creates a point on a line at the clicked location", () => {
    const controller = new ConstructionToolController();
    controller.activate("point");

    const result = controller.handleObjectClick("AB", baseDocument, { x: 1.5, y: 7 });

    expect(result.createdObjects).toHaveLength(1);
    const created = result.createdObjects![0];
    expect(created.kind).toBe("point");
    expect(created.definition).toEqual({ type: "on_line", line: "AB", t: expect.any(Number) });
    if (created.definition.type === "on_line") {
      // AB is the x-axis (A=(0,0), B=(4,0)); clicking above it projects straight down.
      expect(created.definition.t).toBeCloseTo(-1.5, 9);
    }
    expectValidAdditions(baseDocument, result.createdObjects!);
  });

  it("defaults to t=0 when no world coordinate is supplied", () => {
    const controller = new ConstructionToolController();
    controller.activate("point");

    const result = controller.handleObjectClick("AB", baseDocument);

    expect(result.createdObjects).toHaveLength(1);
    expect(result.createdObjects![0].definition).toEqual({ type: "on_line", line: "AB", t: 0 });
  });

  it("does nothing when the point tool clicks a non-projectable object", () => {
    const controller = new ConstructionToolController();
    controller.activate("point");
    const polyDocument: GeometryDocument = {
      ...baseDocument,
      objects: [
        ...baseDocument.objects,
        { id: "poly", label: "poly", kind: "polygon", visible: true, definition: { type: "polygon", points: ["A", "B", "C"] } },
      ],
    };

    const result = controller.handleObjectClick("poly", polyDocument, { x: 1, y: 1 });

    expect(result.createdObjects).toBeUndefined();
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd frontend && npx vitest run src/geometry/constructionTools.test.ts`
Expected: FAIL — the "point" tool branch currently returns `{ state: this.state }` unconditionally (no `createdObjects`).

- [ ] **Step 3: Implement the change**

In `frontend/src/geometry/constructionTools.ts`, add to the type-only import from `../types/geometry`: `PointOnLine`, `PointOnSegment`, `PointOnCircle`, `PointOnArc`.

Add a new import:

```ts
import {
  angleForPointOnArc,
  angleForPointOnCircle,
  angleOfFromCenter,
  tForPointOnLine,
  tForPointOnSegment,
} from "./evaluators/pointOnObject";
```

Replace the `handleCanvasClick` signature is untouched. Change `handleObjectClick`'s signature (currently `handleObjectClick(objectId: string, document: GeometryDocument): ConstructionToolResult`) to:

```ts
  handleObjectClick(objectId: string, document: GeometryDocument, world: Coordinate | null = null): ConstructionToolResult {
```

Replace the existing no-op "point" branch:

```ts
    if (this.stateValue.activeTool === "point") {
      return { state: this.state };
    }
```

with:

```ts
    if (this.stateValue.activeTool === "point") {
      const created = createPointOnObject(object, document, world);
      if (created === null) {
        return { state: this.state };
      }
      this.stateValue = { ...this.stateValue, error: null };
      return { state: this.state, createdObjects: [created], selectedObjectId: created.id };
    }
```

Add the helper function near the other free-standing helpers at the bottom of the file (e.g. right before `function nextPointLabel`):

```ts
function createPointOnObject(
  object: GeometryObject,
  document: GeometryDocument,
  world: Coordinate | null,
): GeometryObject | null {
  const values = new GeometryGraph(document).values;
  const value = values.get(object.id);
  const label = nextPointLabel(document);

  if (object.kind === "line" && value?.type === "line") {
    const t = world === null ? 0 : tForPointOnLine(value, world);
    const obj: PointOnLine = { id: label, label, kind: "point", visible: true, definition: { type: "on_line", line: object.id, t } };
    return obj;
  }
  if (object.kind === "segment" && value?.type === "segment") {
    const t = world === null ? 0 : tForPointOnSegment(value, world);
    const obj: PointOnSegment = { id: label, label, kind: "point", visible: true, definition: { type: "on_segment", segment: object.id, t } };
    return obj;
  }
  if (object.kind === "circle" && value?.type === "circle") {
    const angle = world === null ? 0 : angleForPointOnCircle(value, world);
    const obj: PointOnCircle = { id: label, label, kind: "point", visible: true, definition: { type: "on_circle", circle: object.id, angle } };
    return obj;
  }
  if (object.kind === "arc" && value?.type === "arc") {
    const angle = world === null ? angleOfFromCenter(value.center, value.mid) : angleForPointOnArc(value, world);
    const obj: PointOnArc = { id: label, label, kind: "point", visible: true, definition: { type: "on_arc", arc: object.id, angle } };
    return obj;
  }
  return null;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd frontend && npx vitest run src/geometry/constructionTools.test.ts`
Expected: PASS.

- [ ] **Step 5: Typecheck and commit**

Run: `cd frontend && npm run typecheck`

```bash
git add frontend/src/geometry/constructionTools.ts frontend/src/geometry/constructionTools.test.ts
git commit -m "$(cat <<'EOF'
feat(geometry): clicking a line/segment/circle/arc with the Point tool
creates a point constrained to it

Root-caused in docs/superpowers/specs/2026-08-20-point-on-object-design.md:
the Point tool previously no-op'd when clicking an existing object.
EOF
)"
```

---

### Task 4: Interaction wiring (hooks + `GeometryCanvas.tsx` + `App.tsx`)

This task threads the click world-coordinate and the new drag handler through the hook layer and the canvas component, and adds the hover preview. It's kept as one task because `GeometryCanvas.tsx`'s `onObjectClick` prop type and its caller (`useConstructionTools.ts`) must change together — an intermediate state where only one side is updated would fail typecheck.

**Files:**
- Modify: `frontend/src/geometry/useConstructionTools.ts`
- Modify: `frontend/src/geometry/useGeometryState.ts`
- Modify: `frontend/src/components/geometry/GeometryCanvas.tsx`
- Modify: `frontend/src/App.tsx`
- Modify: `frontend/src/styles.css`

**Interfaces:**
- Consumes: Task 1's `projectPointerOntoObject`; Task 2's `moveConstrainedPoint`; Task 3's `handleObjectClick(objectId, document, world?)`.
- Produces: nothing further downstream (this is the last frontend task before backend work).

- [ ] **Step 1: `useGeometryState.ts` — add `moveConstrainedPoint`**

In `frontend/src/geometry/useGeometryState.ts`, add `moveConstrainedPoint` to the `GeometryState` interface (next to `moveFreePoint`):

```ts
  moveFreePoint: (pointId: GeometryObjectId, x: number, y: number) => void;
  moveConstrainedPoint: (pointId: GeometryObjectId, x: number, y: number) => void;
```

Add the implementation right after the existing `moveFreePoint` callback:

```ts
  const moveConstrainedPoint = useCallback((pointId: GeometryObjectId, x: number, y: number) => {
    recordDocumentChange();
    const result = graphRef.current!.moveConstrainedPoint(pointId, x, y);
    graphRef.current = new GeometryGraph(result.document);
    setDocument(graphRef.current.document);
    setValues(graphRef.current.values);
  }, [recordDocumentChange]);
```

Add `moveConstrainedPoint,` to the returned object at the end of the hook (next to `moveFreePoint,`).

- [ ] **Step 2: `useConstructionTools.ts` — thread `world` through `handleObjectClick`**

In `frontend/src/geometry/useConstructionTools.ts`, import `Coordinate` from `./viewport` (already imported for `handleCanvasClick`'s parameter — reuse it).

Change the `ConstructionToolsState.handleObjectClick` type from `(objectId: string) => void` to `(objectId: string, world?: Coordinate | null) => void` (keep `world` optional here — `constructionTools.test.ts:477` already calls `result.current.handleObjectClick("A")` with no second argument, and `GeometryCanvas.tsx`'s `onObjectClick` prop, which always passes both arguments, still accepts this function: a function with an optional parameter is assignable to a prop type that declares it required).

Change the implementation:

```ts
  const handleObjectClick = useCallback(
    (objectId: string, world?: Coordinate | null) =>
      applyResult(controllerRef.current.handleObjectClick(objectId, document, world ?? null)),
    [applyResult, document],
  );
```

- [ ] **Step 3: `GeometryCanvas.tsx` — thread world through the click, route constrained-point drag, add hover preview**

In `frontend/src/components/geometry/GeometryCanvas.tsx`:

Change the `GeometryCanvasProps` interface:

```ts
  onCanvasClick: (world: Coordinate) => void;
  onObjectClick: (objectId: string, world: Coordinate | null) => void;
```

Add a new optional prop next to `onMoveFreePoint`:

```ts
  onMoveConstrainedPoint?: (pointId: string, x: number, y: number) => void;
```

Add a new ref next to `draggedPointRef`/`draggedObjectRef`:

```ts
  const draggedConstrainedPointRef = useRef<{ objectId: string; pointerId: number } | null>(null);
```

Add hover-preview state right after the `size` state:

```ts
  const [hoverPreviewPoint, setHoverPreviewPoint] = useState<Coordinate | null>(null);
```

Replace `handleObjectPointerDown`'s body:

```ts
  const handleObjectPointerDown = useCallback(
    (objectId: string, event: ReactPointerEvent<SVGElement>) => {
      event.stopPropagation();
      const world = clientToWorld(event.clientX, event.clientY);
      onObjectClick(objectId, world);
      if (activeTool !== "select") {
        return;
      }
      const object = document.objects.find((candidate) => candidate.id === objectId);
      const isFreePoint = object?.kind === "point" && object.definition.type === "free";
      const isConstrainedPoint = object?.kind === "point" && object.definition.type.startsWith("on_");
      // Non-free, non-constrained-point objects can be translated directly by dragging (no pre-selection required).
      const canTranslate = !isFreePoint && !isConstrainedPoint && onTranslateObject !== undefined;
      if (!isFreePoint && !isConstrainedPoint && !canTranslate) {
        return;
      }
      const svg = svgRef.current;
      if (svg === null || world === null) {
        return;
      }
      event.preventDefault();
      svg.setPointerCapture(event.pointerId);
      onBeginFreePointMove?.();
      if (canTranslate) {
        draggedObjectRef.current = { objectId, pointerId: event.pointerId, lastWorld: world };
        return;
      }
      if (isConstrainedPoint) {
        draggedConstrainedPointRef.current = { objectId, pointerId: event.pointerId };
        return;
      }
      draggedPointRef.current = { objectId, pointerId: event.pointerId };
    },
    [activeTool, clientToWorld, document.objects, onBeginFreePointMove, onObjectClick, onTranslateObject],
  );
```

In `handlePointerMove`, add constrained-point drag handling right after the existing free-point drag block (after the `if (pointDrag !== null && ...)` block, before `const objectDrag = ...`):

```ts
    // Constrained-point drag (select tool + point-on-object): re-project onto
    // the parent's current shape, no grid snapping (the parent already constrains it).
    const constrainedDrag = draggedConstrainedPointRef.current;
    if (constrainedDrag !== null && constrainedDrag.pointerId === event.pointerId) {
      onMoveConstrainedPoint?.(constrainedDrag.objectId, world.x, world.y);
    }
```

Add `onMoveConstrainedPoint` to `handlePointerMove`'s dependency array.

At the end of `handlePointerMove` (after the existing "Construction preview" block), add the hover-preview computation:

```ts
    // Point-on-object hover preview: show a ghost point on the object under the
    // cursor while the Point tool is active, so clicking a line/segment/circle/arc
    // visibly previews where the constrained point will land.
    const isDraggingAnything =
      draggedPointRef.current !== null ||
      draggedObjectRef.current !== null ||
      draggedConstrainedPointRef.current !== null ||
      canvasDragRef.current?.hasMoved === true;
    if (activeTool === "point" && !isDraggingAnything) {
      const targetElement = (event.target as Element | null)?.closest?.("[data-object-kind]");
      const kind = targetElement?.getAttribute("data-object-kind");
      const hoveredId = targetElement?.getAttribute("data-object-id");
      if (hoveredId && (kind === "line" || kind === "segment" || kind === "circle" || kind === "arc")) {
        const projected = projectPointerOntoObject(kind, values.get(hoveredId), world);
        setHoverPreviewPoint(projected);
      } else {
        setHoverPreviewPoint((current) => (current === null ? current : null));
      }
    }
```

Add the import at the top of the file:

```ts
import { projectPointerOntoObject } from "../../geometry/evaluators/pointOnObject";
```

Add `values` to `handlePointerMove`'s dependency array (it's already a prop, currently unused inside that callback).

Clear the hover preview on pointer-leave and on tool change. Update the existing `onPointerLeave` handler:

```ts
        onPointerLeave={() => { onPointerWorldChange(null); setHoverPreviewPoint(null); if (svgRef.current) svgRef.current.style.cursor = ""; }}
```

Add a `useEffect` right after the `size`/`viewportRef` setup effects:

```ts
  useEffect(() => {
    if (activeTool !== "point") {
      setHoverPreviewPoint(null);
    }
  }, [activeTool]);
```

In `stopDragging`, add cleanup for the constrained-point drag, mirroring the free-point-drag cleanup block (insert right after it):

```ts
      const constrainedDrag = draggedConstrainedPointRef.current;
      if (constrainedDrag?.pointerId === event.pointerId) {
        if (event.currentTarget.hasPointerCapture(event.pointerId)) {
          event.currentTarget.releasePointerCapture(event.pointerId);
        }
        draggedConstrainedPointRef.current = null;
        onEndFreePointMove?.();
      }
```

Render the ghost marker inside the `<g className="geometry-objects">`, right after `<ConstructionPreview ... />`:

```tsx
          {hoverPreviewPoint !== null && activeTool === "point" && (
            <circle
              className="point-on-object-preview"
              cx={worldToScreen(hoverPreviewPoint, viewport, size).x}
              cy={worldToScreen(hoverPreviewPoint, viewport, size).y}
              r={6}
            />
          )}
```

- [ ] **Step 4: `App.tsx` — wire the new prop**

In `frontend/src/App.tsx`, add `onMoveConstrainedPoint={geometry.moveConstrainedPoint}` next to `onMoveFreePoint={geometry.moveFreePoint}` in the `<GeometryCanvas>` element. Update `onObjectClick={constructionTools.handleObjectClick}` — no change needed there since the hook's signature now matches the prop's new `(objectId, world)` shape automatically.

- [ ] **Step 5: `styles.css` — hover preview marker style**

In `frontend/src/styles.css`, add right after the existing `.construction-preview` rule:

```css
  .point-on-object-preview {
    fill: var(--geo-accent);
    opacity: 0.55;
    pointer-events: none;
  }
```

- [ ] **Step 6: Typecheck and run the full frontend suite**

Run: `cd frontend && npm run typecheck && npx vitest run`
Expected: no errors; all tests pass (this task doesn't add new automated tests — `GeometryCanvas.tsx` has no existing test file, matching the codebase's convention of verifying canvas interaction manually).

- [ ] **Step 7: Manual verification in the browser**

Run: `cd backend && source .venv/bin/activate && uvicorn app.main:app --reload` (terminal 1) and `cd frontend && npm run dev` (terminal 2). Open `http://localhost:5173` and:
1. Create two points and a line through them.
2. Activate the "Point" tool. Hover over the line — a translucent ghost point should appear on the line under the cursor.
3. Click on the line — a new (diamond-shaped, derived-style) point should appear at the clicked location, constrained to the line.
4. Switch to "Select", drag that new point — it should slide along the line only, not leave it.
5. Repeat steps 2-4 for a segment, a circle, and an arc (construct one of each first).
6. Confirm the original bug is fixed: with the Point tool active, click a point to place it on a line, then activate "Perpendicular", click that point, then click the line — the perpendicular line should be created (this was the user's original blocked workflow).

- [ ] **Step 8: Commit**

```bash
git add frontend/src/geometry/useConstructionTools.ts frontend/src/geometry/useGeometryState.ts frontend/src/components/geometry/GeometryCanvas.tsx frontend/src/App.tsx frontend/src/styles.css
git commit -m "$(cat <<'EOF'
feat(geometry): drag points-on-objects along their parent, with a hover preview

Wires the point-on-object construction (added in prior commits) into the
canvas: clicking now passes the click location so the point lands where
clicked, dragging re-projects onto the parent instead of translating it,
and hovering with the Point tool previews where the point will land.
EOF
)"
```

---

### Task 5: Backend schema + evaluator (`models.py`, `engine.py`)

**Files:**
- Modify: `backend/app/geometry/models.py`
- Modify: `backend/app/geometry/engine.py`
- Create: `backend/tests/test_point_on_object.py`

**Interfaces:**
- Produces (consumed by Tasks 6, 7): Pydantic classes `PointOnLine`, `PointOnSegment`, `PointOnCircle`, `PointOnArc` (each with `kind: Literal["point"]`) and their `*Definition` models; module functions `_point_on_line`, `_point_on_segment`, `_point_on_circle`, `_point_on_arc` in `engine.py` (private, used only within the module and by tests via direct import, matching the `_tangent_point_circle` precedent).

- [ ] **Step 1: Add the models**

In `backend/app/geometry/models.py`, insert after `PerpendicularLineDefinition` (after line 107, before the `# ─── New: intersections ───` comment):

```python
# ─── New: point on object ───────────────────────────────────────────────────

class PointOnLineDefinition(GeometryModel):
    type: Literal["on_line"] = "on_line"
    line: str
    t: float


class PointOnSegmentDefinition(GeometryModel):
    type: Literal["on_segment"] = "on_segment"
    segment: str
    t: float


class PointOnCircleDefinition(GeometryModel):
    type: Literal["on_circle"] = "on_circle"
    circle: str
    angle: float


class PointOnArcDefinition(GeometryModel):
    type: Literal["on_arc"] = "on_arc"
    arc: str
    angle: float
```

Insert the object classes after `PolygonVertexPoint` (after line 300, before `class ParallelLine`):

```python
class PointOnLine(GeometryObjectBase):
    kind: Literal["point"] = "point"
    definition: PointOnLineDefinition


class PointOnSegment(GeometryObjectBase):
    kind: Literal["point"] = "point"
    definition: PointOnSegmentDefinition


class PointOnCircle(GeometryObjectBase):
    kind: Literal["point"] = "point"
    definition: PointOnCircleDefinition


class PointOnArc(GeometryObjectBase):
    kind: Literal["point"] = "point"
    definition: PointOnArcDefinition
```

In the `GeometryObject` `TypeAlias`, add the 4 new members right after `PolygonVertexPoint`:

```python
GeometryObject: TypeAlias = (
    Point
    | Line
    | Segment
    | Circle
    | Midpoint
    | PolygonVertexPoint
    | PointOnLine
    | PointOnSegment
    | PointOnCircle
    | PointOnArc
    | ParallelLine
    ...
```

(Keep every other existing member unchanged.)

- [ ] **Step 2: Write the failing evaluator tests**

Create `backend/tests/test_point_on_object.py`:

```python
"""Direct evaluator tests for on_line/on_segment/on_circle/on_arc.

Mirrors backend/tests/test_tangent.py: direct evaluator tests first
(Task 5), then script-driven tests once the `Point(object)` overload
exists (Task 6).
"""

from math import isclose, pi

import pytest

from app.geometry.engine import _point_on_arc, _point_on_circle, _point_on_line, _point_on_segment
from app.geometry.models import ArcValue, CircleValue, Coordinate, LineValue, PointValue, SegmentValue


def test_point_on_line_at_t():
    line = LineValue(a=0, b=1, c=0)  # the x-axis
    point = _point_on_line(line, 2.0)
    assert isclose(point.x, -2.0, abs_tol=1e-9)
    assert isclose(point.y, 0.0, abs_tol=1e-9)


def test_point_on_segment_clamps_to_endpoints():
    segment = SegmentValue(start=Coordinate(x=0, y=0), end=Coordinate(x=4, y=0))
    assert _point_on_segment(segment, 5.0) == PointValue(x=4, y=0)
    assert _point_on_segment(segment, -5.0) == PointValue(x=0, y=0)
    assert _point_on_segment(segment, 0.5) == PointValue(x=2, y=0)


def test_point_on_circle_at_angle():
    circle = CircleValue(center=Coordinate(x=0, y=0), radius=5)
    point = _point_on_circle(circle, pi)
    assert isclose(point.x, -5.0, abs_tol=1e-9)
    assert isclose(point.y, 0.0, abs_tol=1e-9)


def test_point_on_arc_clamps_to_the_arc_range():
    # Upper half-circle: start=(5,0) angle 0, mid=(0,5) angle pi/2, end=(-5,0) angle pi.
    arc = ArcValue(
        center=Coordinate(x=0, y=0),
        radius=5,
        start=Coordinate(x=5, y=0),
        mid=Coordinate(x=0, y=5),
        end=Coordinate(x=-5, y=0),
    )
    on_arc = _point_on_arc(arc, pi / 2)
    assert isclose(on_arc.x, 0.0, abs_tol=1e-9)
    assert isclose(on_arc.y, 5.0, abs_tol=1e-9)
    # -pi/2 (the excluded lower half) clamps to the nearer endpoint (start).
    clamped = _point_on_arc(arc, -pi / 2)
    assert isclose(clamped.x, 5.0, abs_tol=1e-9)
    assert isclose(clamped.y, 0.0, abs_tol=1e-9)
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `cd backend && source .venv/bin/activate && pytest tests/test_point_on_object.py -v`
Expected: FAIL — `ImportError: cannot import name '_point_on_line'`.

- [ ] **Step 4: Implement the evaluator**

In `backend/app/geometry/engine.py`, add to the `from app.geometry.models import (...)` block (alphabetically, matching the existing style): `PointOnArcDefinition`, `PointOnCircleDefinition`, `PointOnLineDefinition`, `PointOnSegmentDefinition`.

In `get_parent_ids`, insert right after the `PolygonVertexDefinition` branch:

```python
    if isinstance(definition, PolygonVertexDefinition):
        return [definition.polygon]
    if isinstance(definition, PointOnLineDefinition):
        return [definition.line]
    if isinstance(definition, PointOnSegmentDefinition):
        return [definition.segment]
    if isinstance(definition, PointOnCircleDefinition):
        return [definition.circle]
    if isinstance(definition, PointOnArcDefinition):
        return [definition.arc]
```

In `_validate_parent_kinds`, insert right after the `PolygonVertexDefinition` branch:

```python
        elif isinstance(definition, PolygonVertexDefinition):
            require_kind(definition.polygon, "polygon")
        elif isinstance(definition, PointOnLineDefinition):
            require_kind(definition.line, "line")
        elif isinstance(definition, PointOnSegmentDefinition):
            require_kind(definition.segment, "segment")
        elif isinstance(definition, PointOnCircleDefinition):
            require_kind(definition.circle, "circle")
        elif isinstance(definition, PointOnArcDefinition):
            require_kind(definition.arc, "arc")
```

In `_evaluate_object`, insert right after the `PolygonVertexDefinition` branch:

```python
        if isinstance(definition, PointOnLineDefinition):
            line = self._require_value(obj.id, definition.line, "line")
            if isinstance(line, UndefinedValue):
                return line
            assert isinstance(line, LineValue)
            return _point_on_line(line, definition.t)

        if isinstance(definition, PointOnSegmentDefinition):
            segment = self._require_value(obj.id, definition.segment, "segment")
            if isinstance(segment, UndefinedValue):
                return segment
            assert isinstance(segment, SegmentValue)
            return _point_on_segment(segment, definition.t)

        if isinstance(definition, PointOnCircleDefinition):
            circle = self._require_value(obj.id, definition.circle, "circle")
            if isinstance(circle, UndefinedValue):
                return circle
            assert isinstance(circle, CircleValue)
            return _point_on_circle(circle, definition.angle)

        if isinstance(definition, PointOnArcDefinition):
            arc = self._require_value(obj.id, definition.arc, "arc")
            if isinstance(arc, UndefinedValue):
                return arc
            assert isinstance(arc, ArcValue)
            return _point_on_arc(arc, definition.angle)
```

Add the helper functions in the "─── Geometry helpers ───" section at the bottom of the file, right after `_line_through_points`/`_canonical_line` (or any convenient spot in that section):

```python
def _point_on_line(line: LineValue, t: float) -> PointValue:
    base_x = -line.a * line.c
    base_y = -line.b * line.c
    return PointValue(x=_clean_zero(base_x - line.b * t), y=_clean_zero(base_y + line.a * t))


def _point_on_segment(segment: SegmentValue, t: float) -> PointValue:
    clamped = min(1.0, max(0.0, t))
    return PointValue(
        x=_clean_zero(segment.start.x + clamped * (segment.end.x - segment.start.x)),
        y=_clean_zero(segment.start.y + clamped * (segment.end.y - segment.start.y)),
    )


def _point_on_circle(circle: CircleValue, angle: float) -> PointValue:
    return PointValue(
        x=_clean_zero(circle.center.x + circle.radius * cos(angle)),
        y=_clean_zero(circle.center.y + circle.radius * sin(angle)),
    )


def _normalize_angle(angle: float) -> float:
    two_pi = 2 * pi
    normalized = angle % two_pi
    if normalized < 0:
        normalized += two_pi
    return normalized


def _arc_angular_range(arc: ArcValue) -> tuple[float, float]:
    """Returns (start_angle, sweep). sweep > 0: CCW from start to end (through mid); sweep < 0: CW."""
    start_angle = atan2(arc.start.y - arc.center.y, arc.start.x - arc.center.x)
    mid_angle = atan2(arc.mid.y - arc.center.y, arc.mid.x - arc.center.x)
    end_angle = atan2(arc.end.y - arc.center.y, arc.end.x - arc.center.x)
    ccw_to_mid = _normalize_angle(mid_angle - start_angle)
    ccw_to_end = _normalize_angle(end_angle - start_angle)
    if ccw_to_mid <= ccw_to_end:
        return start_angle, ccw_to_end
    return start_angle, ccw_to_end - 2 * pi


def _clamp_angle_to_arc(arc: ArcValue, angle: float) -> float:
    start_angle, sweep = _arc_angular_range(arc)
    if sweep >= 0:
        ccw_from_start = _normalize_angle(angle - start_angle)
        if ccw_from_start <= sweep:
            return start_angle + ccw_from_start
        gap_midpoint = (sweep + 2 * pi) / 2
        return start_angle + sweep if ccw_from_start <= gap_midpoint else start_angle
    cw_from_start = _normalize_angle(start_angle - angle)
    abs_sweep = -sweep
    if cw_from_start <= abs_sweep:
        return start_angle - cw_from_start
    gap_midpoint = (abs_sweep + 2 * pi) / 2
    return start_angle + sweep if cw_from_start <= gap_midpoint else start_angle


def _point_on_arc(arc: ArcValue, angle: float) -> PointValue:
    clamped = _clamp_angle_to_arc(arc, angle)
    return PointValue(
        x=_clean_zero(arc.center.x + arc.radius * cos(clamped)),
        y=_clean_zero(arc.center.y + arc.radius * sin(clamped)),
    )
```

`cos`, `sin`, `atan2`, `pi` are already imported at the top of `engine.py` (`from math import atan2, cos, degrees, hypot, isfinite, pi, sin, sqrt`) — no import changes needed there. `_clean_zero` already exists in the file (used throughout).

- [ ] **Step 5: Run the tests to verify they pass**

Run: `cd backend && source .venv/bin/activate && pytest tests/test_point_on_object.py -v`
Expected: PASS.

- [ ] **Step 6: Run the full backend suite, lint, and commit**

Run: `cd backend && source .venv/bin/activate && pytest && ruff check app tests`
Expected: all pass, no lint errors.

```bash
git add backend/app/geometry/models.py backend/app/geometry/engine.py backend/tests/test_point_on_object.py
git commit -m "$(cat <<'EOF'
feat(geometry): evaluate on_line/on_segment/on_circle/on_arc point definitions

Python mirror of the frontend point-on-object evaluator (forward
parameter->point direction only; the backend never needs to invert a
click position -- move_free_point-style dragging is a frontend-only
concern, matching how move_free_point itself isn't wired to any route).
EOF
)"
```

---

### Task 6: Script command (`Point(object)` overload)

**Files:**
- Modify: `backend/app/geometry/script.py`
- Modify: `backend/tests/test_point_on_object.py`

**Interfaces:**
- Consumes: Task 5's `PointOnLine`/`PointOnSegment`/`PointOnCircle`/`PointOnArc` and their definitions.
- Produces (consumed by Task 8): the `Point(lineOrSegmentOrCircleOrArc)` script form.

- [ ] **Step 1: Write the failing script-driven tests**

Append to `backend/tests/test_point_on_object.py`:

```python
from app.geometry.script import ConstructionScriptError, evaluate_script


def test_point_command_on_a_line_uses_the_clicked_default():
    document, values = evaluate_script(
        "A = Point(0,0)\nB = Point(4,0)\nl = Line(A,B)\nP = Point(l)\n",
        document_id="doc", title="t",
    )
    ids = {o.id: o for o in document.objects}
    assert ids["P"].kind == "point"
    assert ids["P"].definition.type == "on_line"
    assert ids["P"].definition.line == "l"
    assert ids["P"].definition.t == 0.0
    assert values["P"].type == "point"


def test_point_command_on_a_segment():
    document, values = evaluate_script(
        "A = Point(0,0)\nB = Point(4,0)\ns = Segment(A,B)\nP = Point(s)\n",
        document_id="doc", title="t",
    )
    ids = {o.id: o for o in document.objects}
    assert ids["P"].definition.type == "on_segment"
    assert ids["P"].definition.segment == "s"
    assert values["P"].type == "point"


def test_point_command_on_a_circle():
    document, values = evaluate_script(
        "O = Point(0,0)\nR = Point(3,0)\nc = Circle(O,R)\nP = Point(c)\n",
        document_id="doc", title="t",
    )
    ids = {o.id: o for o in document.objects}
    assert ids["P"].definition.type == "on_circle"
    assert ids["P"].definition.circle == "c"
    assert values["P"].type == "point"


def test_point_command_on_an_arc_defaults_to_the_mid_angle():
    document, values = evaluate_script(
        "E = Point(5,0)\nF = Point(0,5)\nG = Point(-5,0)\narc1 = Arc(E,F,G)\nP = Point(arc1)\n",
        document_id="doc", title="t",
    )
    ids = {o.id: o for o in document.objects}
    assert ids["P"].definition.type == "on_arc"
    assert ids["P"].definition.arc == "arc1"
    point = values["P"]
    assert point.type == "point"
    assert isclose(point.x, 0.0, abs_tol=1e-9)
    assert isclose(point.y, 5.0, abs_tol=1e-9)  # the arc's own mid point


def test_point_command_rejects_a_non_projectable_reference():
    with pytest.raises(ConstructionScriptError) as error_info:
        evaluate_script(
            "A=Point(0,0)\nB=Point(4,0)\nC=Point(2,3)\npoly=Polygon(A,B,C)\nP=Point(poly)\n",
            document_id="d", title="t",
        )
    assert error_info.value.diagnostic.code == "invalid_reference_type"
```

(`isclose` and `pytest` are already imported at the top of the file from Step 2 of Task 5.)

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd backend && source .venv/bin/activate && pytest tests/test_point_on_object.py -v -k point_command`
Expected: FAIL — `Point` still requires exactly 2 numeric arguments.

- [ ] **Step 3: Implement the overload**

In `backend/app/geometry/script.py`, add `from math import atan2` near the top (there is currently no `math` import — add it as its own import line after the `import re` line).

Add the 4 new classes to the `from app.geometry.models import (...)` block (alphabetically): `PointOnArc`, `PointOnArcDefinition`, `PointOnCircle`, `PointOnCircleDefinition`, `PointOnLine`, `PointOnLineDefinition`, `PointOnSegment`, `PointOnSegmentDefinition`.

Replace the existing `Point` branch:

```python
    if command == "Point":
        _require_arity(statement, 2)
        x = _parse_number(arguments[0], statement, argument_position=1)
        y = _parse_number(arguments[1], statement, argument_position=2)
        return [Point(id=statement.target, label=statement.target, definition={"type": "free", "x": x, "y": y})]
```

with:

```python
    if command == "Point":
        if len(statement.arguments) == 1:
            target = _resolve_reference(arguments[0], statement, symbols, argument_position=1)
            if target.kind == "line":
                return [PointOnLine(id=statement.target, label=statement.target, definition=PointOnLineDefinition(line=target.id, t=0.0))]
            if target.kind == "segment":
                return [PointOnSegment(id=statement.target, label=statement.target, definition=PointOnSegmentDefinition(segment=target.id, t=0.0))]
            if target.kind == "circle":
                return [PointOnCircle(id=statement.target, label=statement.target, definition=PointOnCircleDefinition(circle=target.id, angle=0.0))]
            if target.kind == "arc":
                preview = GeometryDocument(id="_script_preview", title="_script_preview", objects=list(objects))
                values = GeometryGraph(preview).values
                arc_value = values[target.id]
                if isinstance(arc_value, UndefinedValue):
                    _raise(
                        "invalid_argument",
                        f"'{target.id}' is not a well-defined arc",
                        statement.line, statement.source_line, target.id,
                    )
                assert isinstance(arc_value, ArcValue)
                default_angle = atan2(arc_value.mid.y - arc_value.center.y, arc_value.mid.x - arc_value.center.x)
                return [PointOnArc(id=statement.target, label=statement.target, definition=PointOnArcDefinition(arc=target.id, angle=default_angle))]
            _raise(
                "invalid_reference_type",
                f"Argument 1 of Point must reference a line, segment, circle, or arc when called with one "
                f"argument, but '{target.id}' is a {target.kind}",
                statement.line, statement.source_line, target.id,
            )
        _require_arity(statement, 2)
        x = _parse_number(arguments[0], statement, argument_position=1)
        y = _parse_number(arguments[1], statement, argument_position=2)
        return [Point(id=statement.target, label=statement.target, definition={"type": "free", "x": x, "y": y})]
```

`ArcValue` is already imported in `script.py` (used by the `Inversion` branch). `GeometryDocument` is already imported too.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd backend && source .venv/bin/activate && pytest tests/test_point_on_object.py -v`
Expected: PASS (all cases from Tasks 5 and 6).

- [ ] **Step 5: Run the full backend suite, lint, and commit**

Run: `cd backend && source .venv/bin/activate && pytest && ruff check app tests`

```bash
git add backend/app/geometry/script.py backend/tests/test_point_on_object.py
git commit -m "$(cat <<'EOF'
feat(geometry): Point(object) script overload creates a constrained point

Point(x, y) still creates a free point; Point(lineOrSegmentOrCircleOrArc)
now creates a point constrained to that object, defaulting to t=0 (or the
arc's own mid angle, which is always valid by construction).
EOF
)"
```

---

### Task 7: Agent tool + MCP + planner prompt

**Files:**
- Modify: `backend/app/agent/models.py`
- Modify: `backend/app/agent/tools.py`
- Modify: `backend/tests/test_agent_tools.py`
- Modify: `backend/app/mcp_server.py`
- Modify: `backend/app/agent/script_planner.py`

**Interfaces:**
- Consumes: Task 5's `PointOnLine`/`PointOnSegment`/`PointOnCircle`/`PointOnArc`/definitions; Task 6's default-parameter conventions (t=0, angle=0, arc mid-angle).
- Produces: `create_point_on_object` registered tool (name matches the MCP wrapper and the `_mutate` call in `mcp_server.py`).

- [ ] **Step 1: Write the failing agent-tool test**

`backend/tests/test_agent_tools.py` has no per-test document fixture — each test calls `GeometryWorkspace()` directly (empty document) and executes tool calls through the file's own `execute(registry, name, arguments)` helper (defined at the top of the file), which returns the `MutationToolOutput` directly (not a tuple). Evaluated coordinates are read via `output.graph.objects[output.graph.id_map[object_id]].value` (see `test_transformation_tools`'s local `point_value` helper for the exact pattern). The `create_arc` tool's `ThreePointConstructionInput` fields are `pointA` (start), `pointB` (**mid**), `pointC` (end) — a different order than the `Arc(pointA, pointMid, pointB)` script command.

Add these test functions next to the existing `create_arc`/`create_slope` tests:

```python
def test_create_point_on_object_on_a_line():
    registry = create_geometry_tool_registry(GeometryWorkspace())
    execute(registry, "create_point", {"objectId": "A", "x": 0, "y": 0})
    execute(registry, "create_point", {"objectId": "B", "x": 4, "y": 0})
    execute(registry, "create_line", {"objectId": "l", "pointA": "A", "pointB": "B"})

    output = execute(registry, "create_point_on_object", {"objectId": "P", "parent": "l"})

    assert output.created_object.kind == "point"
    assert output.created_object.definition.type == "on_line"
    assert output.created_object.definition.line == "l"


def test_create_point_on_object_on_an_arc_uses_the_mid_angle():
    registry = create_geometry_tool_registry(GeometryWorkspace())
    execute(registry, "create_point", {"objectId": "E", "x": 5, "y": 0})
    execute(registry, "create_point", {"objectId": "F", "x": 0, "y": 5})
    execute(registry, "create_point", {"objectId": "G", "x": -5, "y": 0})
    execute(registry, "create_arc", {"objectId": "arc1", "pointA": "E", "pointB": "F", "pointC": "G"})

    output = execute(registry, "create_point_on_object", {"objectId": "P", "parent": "arc1"})

    assert output.created_object.definition.type == "on_arc"
    graph = output.graph
    value = graph.objects[graph.id_map["P"]].value
    assert value.type == "point"
    assert value.x == pytest.approx(0.0, abs=1e-9)
    assert value.y == pytest.approx(5.0, abs=1e-9)


def test_create_point_on_object_rejects_a_non_projectable_parent():
    registry = create_geometry_tool_registry(GeometryWorkspace())
    execute(registry, "create_point", {"objectId": "A", "x": 0, "y": 0})

    with pytest.raises(ToolExecutionError):
        execute(registry, "create_point_on_object", {"objectId": "P", "parent": "A"})
```

Also add `"create_point_on_object"` to the `EXPECTED_TOOLS` set near the top of the file (it lists every registered tool name and is asserted against the live registry in `test_registry_contains_required_schema_described_tools` — leaving it out will fail that existing test the moment the new tool is registered in Step 4):

```python
    "create_slope",
    "create_point_on_object",
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd backend && source .venv/bin/activate && pytest tests/test_agent_tools.py -k point_on_object -v`
Expected: FAIL — `create_point_on_object` is not a registered tool name.

- [ ] **Step 3: Add the input model**

In `backend/app/agent/models.py`, add next to `SlopeConstructionInput`:

```python
class CreatePointOnObjectInput(GeometryModel):
    object_id: str
    label: str | None = None
    parent: str
```

- [ ] **Step 4: Add the handler and registry entry**

In `backend/app/agent/tools.py`, add `CreatePointOnObjectInput` to the `from app.agent.models import (...)` block, and `PointOnArc`, `PointOnArcDefinition`, `PointOnCircle`, `PointOnCircleDefinition`, `PointOnLine`, `PointOnLineDefinition`, `PointOnSegment`, `PointOnSegmentDefinition`, `ArcValue` to the `from app.geometry.models import (...)` block (alphabetically). Add `from math import atan2` near the top if `math` isn't already imported in this file (check first — if it already imports other `math` symbols, add `atan2` to that line instead of a new import).

Add the handler next to `_create_slope`:

```python
def _create_point_on_object(workspace: GeometryWorkspace, raw_input: BaseModel) -> MutationToolOutput:
    input_model = CreatePointOnObjectInput.model_validate(raw_input)
    access = workspace.graph_access_map()
    _ensure_name_available(access, input_model.object_id, input_model.label)
    try:
        parent = access.resolve(input_model.parent)
    except ValueError as error:
        raise ToolExecutionError(str(error)) from error
    label = input_model.label or input_model.object_id

    if parent.object.kind == "line":
        obj = PointOnLine(id=input_model.object_id, label=label, definition=PointOnLineDefinition(line=parent.object.id, t=0.0))
    elif parent.object.kind == "segment":
        obj = PointOnSegment(id=input_model.object_id, label=label, definition=PointOnSegmentDefinition(segment=parent.object.id, t=0.0))
    elif parent.object.kind == "circle":
        obj = PointOnCircle(id=input_model.object_id, label=label, definition=PointOnCircleDefinition(circle=parent.object.id, angle=0.0))
    elif parent.object.kind == "arc":
        arc_value = parent.value
        if isinstance(arc_value, UndefinedValue):
            raise ToolExecutionError(f"Geometry object '{input_model.parent}' is not a well-defined arc")
        assert isinstance(arc_value, ArcValue)
        default_angle = atan2(arc_value.mid.y - arc_value.center.y, arc_value.mid.x - arc_value.center.x)
        obj = PointOnArc(id=input_model.object_id, label=label, definition=PointOnArcDefinition(arc=parent.object.id, angle=default_angle))
    else:
        raise ToolExecutionError(
            f"Geometry object '{input_model.parent}' must be a line, segment, circle, or arc, "
            f"but it is a {parent.object.kind}"
        )
    return _commit_defined(workspace, obj)
```

Register it in `create_geometry_tool_registry`, next to the `create_slope` registration:

```python
    registry.register(
        _definition(
            "create_point_on_object",
            "Create a point constrained to an existing line, segment, circle, or arc.",
            CreatePointOnObjectInput,
            MutationToolOutput,
            True,
            lambda model: _create_point_on_object(workspace, model),
        )
    )
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `cd backend && source .venv/bin/activate && pytest tests/test_agent_tools.py -k point_on_object -v`
Expected: PASS.

- [ ] **Step 6: Add the MCP wrapper**

In `backend/app/mcp_server.py`, add next to `create_slope`:

```python
@mcp.tool(annotations=CREATE)
def create_point_on_object(
    object_id: str,
    parent: str,
    document: GeometryDocument | None = None,
    label: str | None = None,
) -> dict[str, Any]:
    """Create a point constrained to an existing line, segment, circle, or arc."""

    return _mutate(document, "create_point_on_object", {"objectId": object_id, "label": label, "parent": parent})
```

- [ ] **Step 7: Add the one-line planner grammar mention**

In `backend/app/agent/script_planner.py`, in the `COMMANDS` list of `SYSTEM_PROMPT`, add a line right after `- Point(x, y)                     free point at numeric coordinates`:

```
- Point(line/segment/circle/arc)  point constrained to an existing line, segment, circle, or arc
```

(`tool_calling_planner.py` needs no change: its system prompt doesn't hardcode individual tool names — it passes the full registered tool list, including descriptions, dynamically to Claude's tool-calling API, so `create_point_on_object` is automatically included once Step 4 registers it.)

- [ ] **Step 8: Run the full backend suite, lint, and commit**

Run: `cd backend && source .venv/bin/activate && pytest && ruff check app tests`

```bash
git add backend/app/agent/models.py backend/app/agent/tools.py backend/tests/test_agent_tools.py backend/app/mcp_server.py backend/app/agent/script_planner.py
git commit -m "$(cat <<'EOF'
feat(agent): expose create_point_on_object to planners and MCP

Lets the LLM planner (script or native tool-calling) and MCP clients
propose a point constrained to an existing line, segment, circle, or arc,
completing the point-on-object feature across every layer.
EOF
)"
```

---

### Task 8: Conformance fixture

**Files:**
- Create: `backend/fixtures-src/point-on-object.txt`
- Create: `shared/fixtures/point-on-object.json` (generated, not hand-written)
- Modify: `frontend/src/geometry/conformance.test.ts`

**Interfaces:**
- Consumes: Task 6's `Point(object)` script overload (needed to write the fixture source script); Task 2's frontend evaluator (must reproduce the Python-authored values).

- [ ] **Step 1: Write the fixture source script**

Create `backend/fixtures-src/point-on-object.txt`:

```
A = Point(0, 0)
B = Point(6, 0)
l = Line(A, B)
P1 = Point(l)

C = Point(0, 4)
D = Point(4, 4)
s = Segment(C, D)
P2 = Point(s)

O = Point(0, 0)
R = Point(3, 0)
c = Circle(O, R)
P3 = Point(c)

E = Point(5, 0)
F = Point(0, 5)
G = Point(-5, 0)
arc1 = Arc(E, F, G)
P4 = Point(arc1)
```

- [ ] **Step 2: Generate the fixture**

Run: `cd backend && source .venv/bin/activate && python scripts/generate_conformance_fixture.py fixtures-src/point-on-object.txt ../shared/fixtures/point-on-object.json`
Expected: `Wrote ../shared/fixtures/point-on-object.json with 13 evaluated values` (4 free points × 3 not quite — count is: A,B,l,P1,C,D,s,P2,O,R,c,P3,E,F,G,arc1,P4 = 17 objects, so expect 17 evaluated values; verify the printed count matches the object count in the script rather than assuming the exact number).

- [ ] **Step 3: Register the fixture in the frontend conformance suite**

In `frontend/src/geometry/conformance.test.ts`, add the import:

```ts
import pointOnObject from "../../../shared/fixtures/point-on-object.json";
```

Add it to the `FIXTURES` array:

```ts
const FIXTURES: ReadonlyArray<readonly [string, ConformanceFixture]> = [
  ["basic-geometry", basicGeometry as unknown as ConformanceFixture],
  ["transformations", transformations as unknown as ConformanceFixture],
  ["derived-constructions", derivedConstructions as unknown as ConformanceFixture],
  ["polygons-arcs", polygonsArcs as unknown as ConformanceFixture],
  ["point-on-object", pointOnObject as unknown as ConformanceFixture],
];
```

- [ ] **Step 4: Run both test suites**

Run: `cd frontend && npx vitest run src/geometry/conformance.test.ts`
Expected: PASS — the TypeScript engine reproduces the Python-authored coordinates for `P1`-`P4` within the fixture's tolerance.

Run: `cd frontend && npm run typecheck && npx vitest run` and `cd backend && source .venv/bin/activate && pytest && ruff check app tests`
Expected: everything passes — this is the final integration check across the whole feature.

- [ ] **Step 5: Commit**

```bash
git add backend/fixtures-src/point-on-object.txt shared/fixtures/point-on-object.json frontend/src/geometry/conformance.test.ts
git commit -m "$(cat <<'EOF'
test(geometry): add cross-runtime conformance fixture for point-on-object

Confirms the TypeScript and Python evaluators are bit-identical for
on_line/on_segment/on_circle/on_arc, completing the dual-runtime
contract required by CLAUDE.md for every new construction type.
EOF
)"
```

# 3D Tetrahedron Study Mode — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a full-screen 3D study mode that renders an interactive regular tetrahedron (rotate/zoom) with a symmetry-group study menu (Td, order 24), driven by a reusable data-only polyhedron definition.

**Architecture:** A new client-only 3D domain, independent of the 2D `GeometryDocument` and its dual-runtime contract. A data-driven `PolyhedronDefinition` (vertices, faces, edges, symmetry elements) feeds generic React-Three-Fiber components. Symmetry math is pure and deterministic (three.js math classes, no WebGL). The 3D module is lazy-loaded so three.js only enters the bundle when a polyhedron is opened.

**Tech Stack:** React 19, TypeScript, three.js, @react-three/fiber, @react-three/drei, Vitest.

## Global Constraints

- Geometry tolerance: near-zero comparisons use epsilon `1e-9`.
- No backend changes; no changes to the 2D dual-runtime JSON contract.
- 3D state is ephemeral: never persisted to localStorage or the cloud.
- Only the tetrahedron ships a definition; cube/octahedron/dodecahedron/icosahedron stay as placeholders and do NOT enter 3D mode until a definition is added.
- Pure symmetry math uses three.js math classes (`Matrix4`, `Vector3`) — these run in Node/vitest without WebGL and are fully unit-tested. WebGL scene components (`<Canvas>` glue) are thin and verified via `npm run typecheck` + `npm run build`, not jsdom unit tests.
- Follow existing menu styling (mirror `frontend/src/components/geometry/GridMenu.tsx`).

---

## File Structure

| File | Responsibility |
|------|----------------|
| `frontend/package.json` | New deps: three, @react-three/fiber, @react-three/drei, @types/three |
| `frontend/src/geometry/polyhedra/types.ts` | `Vec3`, `SymmetryElement`, `SymmetryClass`, `PolyhedronDefinition` types + matrix helpers (`matrixForElement`) |
| `frontend/src/geometry/polyhedra/tetrahedron.ts` | Tetrahedron `PolyhedronDefinition` |
| `frontend/src/geometry/polyhedra/index.ts` | `POLYHEDRON_DEFINITIONS: Partial<Record<ConstructionTool, PolyhedronDefinition>>` |
| `frontend/src/geometry/polyhedra/types.test.ts` | Matrix helper tests |
| `frontend/src/geometry/polyhedra/tetrahedron.test.ts` | Symmetry-group tests (permutation, order 24, det signs) |
| `frontend/src/geometry/polyhedra/animation.ts` | Pure animation transform: `transformedVertices(def, element, progress)` |
| `frontend/src/geometry/polyhedra/animation.test.ts` | Animation math tests |
| `frontend/src/components/polyhedra/PolyhedronMesh.tsx` | Faces/edges/vertices mesh (applies animation) |
| `frontend/src/components/polyhedra/SymmetryOverlay.tsx` | Axes (lines) + planes (translucent) for visible classes; clickable |
| `frontend/src/components/polyhedra/SymmetryMenu.tsx` | In-canvas menu: class toggles, opacity, color, reset, exit |
| `frontend/src/components/polyhedra/SymmetryMenu.test.tsx` | Menu UI tests (jsdom) |
| `frontend/src/components/polyhedra/PolyhedronStudio.tsx` | Full-screen mode container (default export, lazy-loaded) |
| `frontend/src/App.tsx` | Mode state, tool interception, confirm dialog, conditional render |
| `frontend/src/App.polyhedron.test.tsx` | App interception test (jsdom) |

---

## Task 1: Add 3D dependencies

**Files:**
- Modify: `frontend/package.json`

**Interfaces:**
- Produces: availability of `three`, `@react-three/fiber`, `@react-three/drei` runtime imports and `@types/three`.

- [ ] **Step 1: Install dependencies**

Run from `frontend/`:
```bash
npm install three @react-three/fiber @react-three/drei
npm install -D @types/three
```

- [ ] **Step 2: Verify install and types resolve**

Run: `cd frontend && npm run typecheck`
Expected: PASS (no new errors; deps resolve).

- [ ] **Step 3: Commit**

```bash
git add frontend/package.json frontend/package-lock.json
git commit -m "chore: add three.js, react-three-fiber, drei for 3D mode"
```

---

## Task 2: Polyhedron types and symmetry matrix helpers

**Files:**
- Create: `frontend/src/geometry/polyhedra/types.ts`
- Test: `frontend/src/geometry/polyhedra/types.test.ts`

**Interfaces:**
- Produces:
  - `type Vec3 = readonly [number, number, number]`
  - `type SymmetryClass = "rotations3" | "halfTurns" | "reflections" | "rotoreflections"`
  - `SymmetryElement` union (`axis` | `plane` | `improper`) each with `label: string`
  - `interface PolyhedronDefinition { id; name; vertices: Vec3[]; faces: number[][]; edges: readonly [number, number][]; symmetry: Record<SymmetryClass, SymmetryElement[]>; defaultColor: string }`
  - `function matrixForElement(element: SymmetryElement): THREE.Matrix4` — linear (no translation), det +1 for `axis`, −1 for `plane`/`improper`.
  - `const POLYHEDRON_EPSILON = 1e-9`

- [ ] **Step 1: Write the failing test**

Create `frontend/src/geometry/polyhedra/types.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { Vector3 } from "three";
import { matrixForElement } from "./types";

describe("matrixForElement", () => {
  it("axis rotation of 120deg about (1,1,1) has determinant +1", () => {
    const m = matrixForElement({
      kind: "axis",
      point: [0, 0, 0],
      direction: [1 / Math.sqrt(3), 1 / Math.sqrt(3), 1 / Math.sqrt(3)],
      angle: (2 * Math.PI) / 3,
      label: "r",
    });
    expect(m.determinant()).toBeCloseTo(1, 9);
  });

  it("plane reflection has determinant -1 and is an involution", () => {
    const m = matrixForElement({
      kind: "plane",
      point: [0, 0, 0],
      normal: [0, 1 / Math.sqrt(2), -1 / Math.sqrt(2)],
      label: "m",
    });
    expect(m.determinant()).toBeCloseTo(-1, 9);
    const v = new Vector3(3, 5, 7).applyMatrix4(m).applyMatrix4(m);
    expect(v.distanceTo(new Vector3(3, 5, 7))).toBeLessThan(1e-9);
  });

  it("improper S4 about z has determinant -1", () => {
    const m = matrixForElement({
      kind: "improper",
      point: [0, 0, 0],
      direction: [0, 0, 1],
      angle: Math.PI / 2,
      label: "S4",
    });
    expect(m.determinant()).toBeCloseTo(-1, 9);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/geometry/polyhedra/types.test.ts`
Expected: FAIL ("Cannot find module './types'").

- [ ] **Step 3: Write minimal implementation**

Create `frontend/src/geometry/polyhedra/types.ts`:
```ts
import { Matrix4, Vector3 } from "three";
import type { ConstructionTool } from "../constructionTools";

export const POLYHEDRON_EPSILON = 1e-9;

export type Vec3 = readonly [number, number, number];

export type SymmetryClass =
  | "rotations3"
  | "halfTurns"
  | "reflections"
  | "rotoreflections";

export interface SymmetryElementAxis {
  kind: "axis";
  point: Vec3;
  direction: Vec3;
  angle: number;
  label: string;
}

export interface SymmetryElementPlane {
  kind: "plane";
  point: Vec3;
  normal: Vec3;
  label: string;
}

export interface SymmetryElementImproper {
  kind: "improper";
  point: Vec3;
  direction: Vec3;
  angle: number;
  label: string;
}

export type SymmetryElement =
  | SymmetryElementAxis
  | SymmetryElementPlane
  | SymmetryElementImproper;

export interface PolyhedronDefinition {
  id: string;
  name: string;
  vertices: Vec3[];
  faces: number[][];
  edges: readonly (readonly [number, number])[];
  symmetry: Record<SymmetryClass, SymmetryElement[]>;
  defaultColor: string;
}

// Reflection (Householder) as a 4x4 linear matrix: I - 2 n n^T.
function reflectionMatrix(normal: Vec3): Matrix4 {
  const n = new Vector3(normal[0], normal[1], normal[2]).normalize();
  // prettier-ignore
  return new Matrix4().set(
    1 - 2 * n.x * n.x, -2 * n.x * n.y,     -2 * n.x * n.z,     0,
    -2 * n.x * n.y,     1 - 2 * n.y * n.y, -2 * n.y * n.z,     0,
    -2 * n.x * n.z,    -2 * n.y * n.z,      1 - 2 * n.z * n.z, 0,
    0,                  0,                  0,                  1,
  );
}

function rotationMatrix(direction: Vec3, angle: number): Matrix4 {
  const axis = new Vector3(direction[0], direction[1], direction[2]).normalize();
  return new Matrix4().makeRotationAxis(axis, angle);
}

// Linear 3x3 matrix (as Matrix4) for a symmetry element, centered at origin.
export function matrixForElement(element: SymmetryElement): Matrix4 {
  switch (element.kind) {
    case "axis":
      return rotationMatrix(element.direction, element.angle);
    case "plane":
      return reflectionMatrix(element.normal);
    case "improper": {
      // Rotate about the axis, then reflect in the plane perpendicular to it.
      const rot = rotationMatrix(element.direction, element.angle);
      const mirror = reflectionMatrix(element.direction);
      return mirror.multiply(rot);
    }
  }
}

export type { ConstructionTool };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npx vitest run src/geometry/polyhedra/types.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/geometry/polyhedra/types.ts frontend/src/geometry/polyhedra/types.test.ts
git commit -m "feat: polyhedron definition types and symmetry matrix helpers"
```

---

## Task 3: Tetrahedron definition and symmetry-group tests

**Files:**
- Create: `frontend/src/geometry/polyhedra/tetrahedron.ts`
- Test: `frontend/src/geometry/polyhedra/tetrahedron.test.ts`

**Interfaces:**
- Consumes: `PolyhedronDefinition`, `SymmetryElement`, `matrixForElement` from `./types`.
- Produces: `export const TETRAHEDRON: PolyhedronDefinition`.

**Geometry reference (must match exactly):**
- Vertices (normalized to unit radius): `v0=(1,1,1), v1=(1,−1,−1), v2=(−1,1,−1), v3=(−1,−1,1)`, each divided by √3.
- `rotations3` (8): axes along `v0,v1,v2,v3`; angles `+2π/3` and `−2π/3` per axis.
- `halfTurns` (3): axes along X, Y, Z; angle `π`.
- `reflections` (6): one plane per vertex pair {a,b}; normal `normalize(v_a × v_b)` for pairs (0,1),(0,2),(0,3),(1,2),(1,3),(2,3).
- `rotoreflections` (6): axes X, Y, Z; angles `+π/2` (S4) and `−π/2` (S4³) per axis.

- [ ] **Step 1: Write the failing test**

Create `frontend/src/geometry/polyhedra/tetrahedron.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { Vector3, Matrix4 } from "three";
import { TETRAHEDRON } from "./tetrahedron";
import { matrixForElement, type SymmetryElement } from "./types";

const EPS = 1e-9;

function allElements(): SymmetryElement[] {
  const s = TETRAHEDRON.symmetry;
  return [...s.rotations3, ...s.halfTurns, ...s.reflections, ...s.rotoreflections];
}

function vertexVectors(): Vector3[] {
  return TETRAHEDRON.vertices.map((v) => new Vector3(v[0], v[1], v[2]));
}

function permutesVertices(m: Matrix4): boolean {
  const verts = vertexVectors();
  return verts.every((v) => {
    const mapped = v.clone().applyMatrix4(m);
    return verts.some((w) => mapped.distanceTo(w) < EPS);
  });
}

describe("TETRAHEDRON definition", () => {
  it("has 4 vertices, 4 faces, 6 edges, all unit length", () => {
    expect(TETRAHEDRON.vertices).toHaveLength(4);
    expect(TETRAHEDRON.faces).toHaveLength(4);
    expect(TETRAHEDRON.edges).toHaveLength(6);
    for (const v of vertexVectors()) expect(v.length()).toBeCloseTo(1, 9);
  });

  it("lists 8+3+6+6 = 23 non-identity elements", () => {
    expect(TETRAHEDRON.symmetry.rotations3).toHaveLength(8);
    expect(TETRAHEDRON.symmetry.halfTurns).toHaveLength(3);
    expect(TETRAHEDRON.symmetry.reflections).toHaveLength(6);
    expect(TETRAHEDRON.symmetry.rotoreflections).toHaveLength(6);
    expect(allElements()).toHaveLength(23);
  });

  it("every symmetry element permutes the vertex set", () => {
    for (const el of allElements()) {
      expect(permutesVertices(matrixForElement(el))).toBe(true);
    }
  });

  it("determinant signs: rotations +1, reflections/rotoreflections -1", () => {
    for (const el of TETRAHEDRON.symmetry.rotations3)
      expect(matrixForElement(el).determinant()).toBeCloseTo(1, 9);
    for (const el of TETRAHEDRON.symmetry.halfTurns)
      expect(matrixForElement(el).determinant()).toBeCloseTo(1, 9);
    for (const el of TETRAHEDRON.symmetry.reflections)
      expect(matrixForElement(el).determinant()).toBeCloseTo(-1, 9);
    for (const el of TETRAHEDRON.symmetry.rotoreflections)
      expect(matrixForElement(el).determinant()).toBeCloseTo(-1, 9);
  });

  it("the group generated (with identity) has exactly 24 elements", () => {
    const key = (m: Matrix4): string =>
      m.elements.map((x) => (Math.abs(x) < EPS ? 0 : x).toFixed(6)).join(",");
    const identity = new Matrix4();
    const group = new Map<string, Matrix4>([[key(identity), identity]]);
    const gens = allElements().map(matrixForElement);
    let changed = true;
    while (changed) {
      changed = false;
      for (const g of [...group.values()]) {
        for (const h of gens) {
          const p = new Matrix4().multiplyMatrices(g, h);
          const k = key(p);
          if (!group.has(k)) {
            group.set(k, p);
            changed = true;
          }
        }
      }
    }
    expect(group.size).toBe(24);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/geometry/polyhedra/tetrahedron.test.ts`
Expected: FAIL ("Cannot find module './tetrahedron'").

- [ ] **Step 3: Write minimal implementation**

Create `frontend/src/geometry/polyhedra/tetrahedron.ts`:
```ts
import type { PolyhedronDefinition, SymmetryElement, Vec3 } from "./types";

const RAW: Vec3[] = [
  [1, 1, 1],
  [1, -1, -1],
  [-1, 1, -1],
  [-1, -1, 1],
];

function normalize(v: Vec3): Vec3 {
  const len = Math.hypot(v[0], v[1], v[2]);
  return [v[0] / len, v[1] / len, v[2] / len];
}

const V: Vec3[] = RAW.map(normalize);

function cross(a: Vec3, b: Vec3): Vec3 {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}

const rotations3: SymmetryElement[] = V.flatMap((dir, i) => [
  { kind: "axis", point: [0, 0, 0], direction: dir, angle: (2 * Math.PI) / 3, label: `C3(${i})+` },
  { kind: "axis", point: [0, 0, 0], direction: dir, angle: (-2 * Math.PI) / 3, label: `C3(${i})-` },
]);

const AXES: Vec3[] = [
  [1, 0, 0],
  [0, 1, 0],
  [0, 0, 1],
];

const halfTurns: SymmetryElement[] = AXES.map((dir, i) => ({
  kind: "axis",
  point: [0, 0, 0],
  direction: dir,
  angle: Math.PI,
  label: `C2(${i})`,
}));

const PAIRS: [number, number][] = [
  [0, 1],
  [0, 2],
  [0, 3],
  [1, 2],
  [1, 3],
  [2, 3],
];

const reflections: SymmetryElement[] = PAIRS.map(([a, b], i) => ({
  kind: "plane",
  point: [0, 0, 0],
  normal: normalize(cross(V[a], V[b])),
  label: `σ(${i})`,
}));

const rotoreflections: SymmetryElement[] = AXES.flatMap((dir, i) => [
  { kind: "improper", point: [0, 0, 0], direction: dir, angle: Math.PI / 2, label: `S4(${i})+` },
  { kind: "improper", point: [0, 0, 0], direction: dir, angle: -Math.PI / 2, label: `S4(${i})-` },
]);

export const TETRAHEDRON: PolyhedronDefinition = {
  id: "tetrahedron",
  name: "Tetraedro",
  vertices: V,
  faces: [
    [0, 1, 2],
    [0, 3, 1],
    [0, 2, 3],
    [1, 3, 2],
  ],
  edges: [
    [0, 1],
    [0, 2],
    [0, 3],
    [1, 2],
    [1, 3],
    [2, 3],
  ],
  symmetry: { rotations3, halfTurns, reflections, rotoreflections },
  defaultColor: "#3b82f6",
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npx vitest run src/geometry/polyhedra/tetrahedron.test.ts`
Expected: PASS (5 tests). The group-closure test confirms |Td| = 24.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/geometry/polyhedra/tetrahedron.ts frontend/src/geometry/polyhedra/tetrahedron.test.ts
git commit -m "feat: tetrahedron definition with full Td symmetry group (order 24)"
```

---

## Task 4: Polyhedron registry (tool → definition)

**Files:**
- Create: `frontend/src/geometry/polyhedra/index.ts`
- Test: `frontend/src/geometry/polyhedra/index.test.ts`

**Interfaces:**
- Consumes: `TETRAHEDRON`, `PolyhedronDefinition`, `ConstructionTool`.
- Produces:
  - `const POLYHEDRON_TOOLS: readonly ConstructionTool[]` (the 5 placeholder tools)
  - `const POLYHEDRON_DEFINITIONS: Partial<Record<ConstructionTool, PolyhedronDefinition>>`
  - `function polyhedronForTool(tool: ConstructionTool): PolyhedronDefinition | undefined`

- [ ] **Step 1: Write the failing test**

Create `frontend/src/geometry/polyhedra/index.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { POLYHEDRON_TOOLS, polyhedronForTool } from "./index";

describe("polyhedron registry", () => {
  it("lists the five polyhedron tools", () => {
    expect(POLYHEDRON_TOOLS).toEqual([
      "tetrahedron",
      "cube",
      "octahedron",
      "dodecahedron",
      "icosahedron",
    ]);
  });

  it("resolves the tetrahedron and returns undefined for unimplemented ones", () => {
    expect(polyhedronForTool("tetrahedron")?.id).toBe("tetrahedron");
    expect(polyhedronForTool("cube")).toBeUndefined();
    expect(polyhedronForTool("point")).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/geometry/polyhedra/index.test.ts`
Expected: FAIL ("Cannot find module './index'").

- [ ] **Step 3: Write minimal implementation**

Create `frontend/src/geometry/polyhedra/index.ts`:
```ts
import type { ConstructionTool } from "../constructionTools";
import type { PolyhedronDefinition } from "./types";
import { TETRAHEDRON } from "./tetrahedron";

export const POLYHEDRON_TOOLS: readonly ConstructionTool[] = [
  "tetrahedron",
  "cube",
  "octahedron",
  "dodecahedron",
  "icosahedron",
];

export const POLYHEDRON_DEFINITIONS: Partial<
  Record<ConstructionTool, PolyhedronDefinition>
> = {
  tetrahedron: TETRAHEDRON,
};

export function polyhedronForTool(
  tool: ConstructionTool,
): PolyhedronDefinition | undefined {
  return POLYHEDRON_DEFINITIONS[tool];
}

export type { PolyhedronDefinition };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npx vitest run src/geometry/polyhedra/index.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/geometry/polyhedra/index.ts frontend/src/geometry/polyhedra/index.test.ts
git commit -m "feat: polyhedron tool registry (tetrahedron wired, others pending)"
```

---

## Task 5: Animation transform (pure)

**Files:**
- Create: `frontend/src/geometry/polyhedra/animation.ts`
- Test: `frontend/src/geometry/polyhedra/animation.test.ts`

**Interfaces:**
- Consumes: `PolyhedronDefinition`, `SymmetryElement`, `matrixForElement`.
- Produces:
  - `function transformedVertices(vertices: Vec3[], element: SymmetryElement, progress: number): Vec3[]`
    - `progress` in `[0,1]`. Proper rotations (det +1): true rotation by `angle * progress`.
    - Improper (det −1): linear interpolation of each vertex from `v` to `matrixForElement(element)·v`.
    - `progress === 0` returns the original vertices; `progress === 1` returns the fully mapped vertices.

- [ ] **Step 1: Write the failing test**

Create `frontend/src/geometry/polyhedra/animation.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { Vector3 } from "three";
import { transformedVertices } from "./animation";
import { TETRAHEDRON } from "./tetrahedron";
import { matrixForElement, type Vec3 } from "./types";

function close(a: Vec3, b: Vec3): boolean {
  return new Vector3(...a).distanceTo(new Vector3(...b)) < 1e-9;
}

describe("transformedVertices", () => {
  it("progress 0 returns the original vertices", () => {
    const el = TETRAHEDRON.symmetry.reflections[0];
    const out = transformedVertices(TETRAHEDRON.vertices, el, 0);
    out.forEach((v, i) => expect(close(v, TETRAHEDRON.vertices[i])).toBe(true));
  });

  it("progress 1 maps each vertex to matrixForElement image", () => {
    const el = TETRAHEDRON.symmetry.reflections[0];
    const m = matrixForElement(el);
    const out = transformedVertices(TETRAHEDRON.vertices, el, 1);
    out.forEach((v, i) => {
      const expected = new Vector3(...TETRAHEDRON.vertices[i]).applyMatrix4(m);
      expect(new Vector3(...v).distanceTo(expected)).toBeLessThan(1e-9);
    });
  });

  it("rotation at progress 1 lands on a permuted vertex (still on unit sphere)", () => {
    const el = TETRAHEDRON.symmetry.rotations3[0];
    const out = transformedVertices(TETRAHEDRON.vertices, el, 1);
    out.forEach((v) => expect(new Vector3(...v).length()).toBeCloseTo(1, 9));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/geometry/polyhedra/animation.test.ts`
Expected: FAIL ("Cannot find module './animation'").

- [ ] **Step 3: Write minimal implementation**

Create `frontend/src/geometry/polyhedra/animation.ts`:
```ts
import { Matrix4, Vector3 } from "three";
import { matrixForElement, type SymmetryElement, type Vec3 } from "./types";

function toVec3(v: Vector3): Vec3 {
  return [v.x, v.y, v.z];
}

// Returns vertex positions at the given animation progress in [0,1].
// Proper rotations animate as a real rotation; improper transforms
// (reflections, rotoreflections) animate by linear vertex interpolation.
export function transformedVertices(
  vertices: Vec3[],
  element: SymmetryElement,
  progress: number,
): Vec3[] {
  const t = Math.min(1, Math.max(0, progress));
  if (element.kind === "axis") {
    const axis = new Vector3(
      element.direction[0],
      element.direction[1],
      element.direction[2],
    ).normalize();
    const m = new Matrix4().makeRotationAxis(axis, element.angle * t);
    return vertices.map((v) => toVec3(new Vector3(...v).applyMatrix4(m)));
  }
  const m = matrixForElement(element);
  return vertices.map((v) => {
    const start = new Vector3(...v);
    const end = start.clone().applyMatrix4(m);
    return toVec3(start.lerp(end, t));
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npx vitest run src/geometry/polyhedra/animation.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/geometry/polyhedra/animation.ts frontend/src/geometry/polyhedra/animation.test.ts
git commit -m "feat: pure animation transform for symmetry demonstrations"
```

---

## Task 6: SymmetryMenu component

**Files:**
- Create: `frontend/src/components/polyhedra/SymmetryMenu.tsx`
- Test: `frontend/src/components/polyhedra/SymmetryMenu.test.tsx`

**Interfaces:**
- Consumes: `SymmetryClass` from `../../geometry/polyhedra/types`.
- Produces:
```ts
interface SymmetryMenuProps {
  polyhedronName: string;
  visibleClasses: ReadonlySet<SymmetryClass>;
  onToggleClass: (cls: SymmetryClass) => void;
  opacity: number;                       // 0..1
  onOpacityChange: (value: number) => void;
  color: string;                         // hex
  onColorChange: (value: string) => void;
  onResetView: () => void;
  onExit: () => void;
}
export function SymmetryMenu(props: SymmetryMenuProps): JSX.Element;
```
- `CLASS_LABELS: Record<SymmetryClass, string>` maps to Spanish labels: `rotations3 → "Rotaciones ±120°"`, `halfTurns → "Medias vueltas (180°)"`, `reflections → "Reflexiones"`, `rotoreflections → "Rotoreflexiones (S4)"`.

- [ ] **Step 1: Write the failing test**

Create `frontend/src/components/polyhedra/SymmetryMenu.test.tsx`:
```tsx
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SymmetryMenu } from "./SymmetryMenu";

function setup(overrides = {}) {
  const props = {
    polyhedronName: "Tetraedro",
    visibleClasses: new Set<string>(),
    onToggleClass: vi.fn(),
    opacity: 0.6,
    onOpacityChange: vi.fn(),
    color: "#3b82f6",
    onColorChange: vi.fn(),
    onResetView: vi.fn(),
    onExit: vi.fn(),
    ...overrides,
  } as never;
  render(<SymmetryMenu {...props} />);
  return props as {
    onToggleClass: ReturnType<typeof vi.fn>;
    onExit: ReturnType<typeof vi.fn>;
  };
}

describe("SymmetryMenu", () => {
  it("toggles a symmetry class", async () => {
    const props = setup();
    await userEvent.click(screen.getByLabelText("Reflexiones"));
    expect(props.onToggleClass).toHaveBeenCalledWith("reflections");
  });

  it("calls onExit when the exit button is clicked", async () => {
    const props = setup();
    await userEvent.click(screen.getByRole("button", { name: /salir a 2d/i }));
    expect(props.onExit).toHaveBeenCalled();
  });

  it("shows all four symmetry classes and the polyhedron name", () => {
    setup();
    expect(screen.getByText("Tetraedro")).toBeInTheDocument();
    expect(screen.getByLabelText("Rotaciones ±120°")).toBeInTheDocument();
    expect(screen.getByLabelText("Medias vueltas (180°)")).toBeInTheDocument();
    expect(screen.getByLabelText("Reflexiones")).toBeInTheDocument();
    expect(screen.getByLabelText("Rotoreflexiones (S4)")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/components/polyhedra/SymmetryMenu.test.tsx`
Expected: FAIL ("Cannot find module './SymmetryMenu'").

- [ ] **Step 3: Write minimal implementation**

Create `frontend/src/components/polyhedra/SymmetryMenu.tsx`:
```tsx
import type { SymmetryClass } from "../../geometry/polyhedra/types";

interface SymmetryMenuProps {
  polyhedronName: string;
  visibleClasses: ReadonlySet<SymmetryClass>;
  onToggleClass: (cls: SymmetryClass) => void;
  opacity: number;
  onOpacityChange: (value: number) => void;
  color: string;
  onColorChange: (value: string) => void;
  onResetView: () => void;
  onExit: () => void;
}

const CLASS_LABELS: Record<SymmetryClass, string> = {
  rotations3: "Rotaciones ±120°",
  halfTurns: "Medias vueltas (180°)",
  reflections: "Reflexiones",
  rotoreflections: "Rotoreflexiones (S4)",
};

const CLASS_ORDER: SymmetryClass[] = [
  "rotations3",
  "halfTurns",
  "reflections",
  "rotoreflections",
];

export function SymmetryMenu({
  polyhedronName,
  visibleClasses,
  onToggleClass,
  opacity,
  onOpacityChange,
  color,
  onColorChange,
  onResetView,
  onExit,
}: SymmetryMenuProps) {
  return (
    <div
      role="dialog"
      aria-label="Estudio de simetrías"
      className="absolute left-4 top-4 z-10 w-60 rounded-xl border border-edge bg-surface/95 p-3 shadow-pop backdrop-blur"
    >
      <div className="mb-2 flex items-center justify-between">
        <p className="text-sm font-semibold text-content">{polyhedronName}</p>
        <button
          type="button"
          onClick={onExit}
          className="rounded-md border border-edge px-2 py-0.5 text-xs font-semibold text-muted hover:text-content"
        >
          Salir a 2D
        </button>
      </div>

      <p className="mb-1 text-[0.65rem] font-semibold uppercase tracking-[0.1em] text-muted">
        Simetrías
      </p>
      {CLASS_ORDER.map((cls) => (
        <label key={cls} className="mb-1.5 flex cursor-pointer items-center gap-2">
          <input
            type="checkbox"
            aria-label={CLASS_LABELS[cls]}
            checked={visibleClasses.has(cls)}
            onChange={() => onToggleClass(cls)}
            className="h-3.5 w-3.5 rounded accent-brand-600"
          />
          <span className="text-xs text-content">{CLASS_LABELS[cls]}</span>
        </label>
      ))}

      <p className="mb-1 mt-3 text-[0.65rem] font-semibold uppercase tracking-[0.1em] text-muted">
        Apariencia
      </p>
      <label className="mb-2 flex items-center gap-2">
        <span className="w-16 text-xs text-content">Opacidad</span>
        <input
          type="range"
          min="0"
          max="1"
          step="0.05"
          value={opacity}
          aria-label="Opacidad"
          onChange={(e) => onOpacityChange(Number(e.target.value))}
          className="flex-1 accent-brand-600"
        />
      </label>
      <label className="mb-3 flex items-center gap-2">
        <span className="w-16 text-xs text-content">Color</span>
        <input
          type="color"
          value={color}
          aria-label="Color"
          onChange={(e) => onColorChange(e.target.value)}
          className="h-6 w-10 cursor-pointer rounded border border-edge bg-transparent"
        />
      </label>

      <button
        type="button"
        onClick={onResetView}
        className="w-full rounded-md border border-edge px-2 py-1 text-xs font-semibold text-muted hover:text-content"
      >
        Restablecer vista
      </button>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npx vitest run src/components/polyhedra/SymmetryMenu.test.tsx`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/polyhedra/SymmetryMenu.tsx frontend/src/components/polyhedra/SymmetryMenu.test.tsx
git commit -m "feat: symmetry study menu (class toggles, opacity, color, exit)"
```

---

## Task 7: PolyhedronMesh component (WebGL glue)

**Files:**
- Create: `frontend/src/components/polyhedra/PolyhedronMesh.tsx`

**Interfaces:**
- Consumes: `PolyhedronDefinition`, `SymmetryElement`, `transformedVertices`.
- Produces:
```ts
interface PolyhedronMeshProps {
  definition: PolyhedronDefinition;
  color: string;
  opacity: number;
  animation: { element: SymmetryElement; progress: number } | null;
}
export function PolyhedronMesh(props: PolyhedronMeshProps): JSX.Element;
```
- Behavior: builds a `THREE.BufferGeometry` from faces (triangulated fans) using current vertex positions (from `transformedVertices` when `animation` is set, else `definition.vertices`). Renders a `<mesh>` with `meshStandardMaterial` (`color`, `transparent`, `opacity`, `side={THREE.DoubleSide}`) plus edge `<lineSegments>` from `definition.edges`. Recomputes geometry when `animation.progress` changes.

**Verification for this task:** no jsdom unit test (WebGL). Verify by `npm run typecheck` and the build in Task 10. Keep the component pure/declarative.

- [ ] **Step 1: Write the implementation**

Create `frontend/src/components/polyhedra/PolyhedronMesh.tsx`:
```tsx
import { useMemo } from "react";
import { BufferGeometry, DoubleSide, Float32BufferAttribute } from "three";
import { transformedVertices } from "../../geometry/polyhedra/animation";
import type {
  PolyhedronDefinition,
  SymmetryElement,
  Vec3,
} from "../../geometry/polyhedra/types";

interface PolyhedronMeshProps {
  definition: PolyhedronDefinition;
  color: string;
  opacity: number;
  animation: { element: SymmetryElement; progress: number } | null;
}

function faceGeometry(vertices: Vec3[], faces: number[][]): BufferGeometry {
  const positions: number[] = [];
  for (const face of faces) {
    // Triangulate each face as a fan around its first vertex.
    for (let i = 1; i < face.length - 1; i += 1) {
      for (const idx of [face[0], face[i], face[i + 1]]) {
        positions.push(...vertices[idx]);
      }
    }
  }
  const geom = new BufferGeometry();
  geom.setAttribute("position", new Float32BufferAttribute(positions, 3));
  geom.computeVertexNormals();
  return geom;
}

function edgeGeometry(
  vertices: Vec3[],
  edges: readonly (readonly [number, number])[],
): BufferGeometry {
  const positions: number[] = [];
  for (const [a, b] of edges) {
    positions.push(...vertices[a], ...vertices[b]);
  }
  const geom = new BufferGeometry();
  geom.setAttribute("position", new Float32BufferAttribute(positions, 3));
  return geom;
}

export function PolyhedronMesh({
  definition,
  color,
  opacity,
  animation,
}: PolyhedronMeshProps) {
  const vertices = useMemo<Vec3[]>(
    () =>
      animation
        ? transformedVertices(
            definition.vertices,
            animation.element,
            animation.progress,
          )
        : definition.vertices,
    [definition.vertices, animation],
  );

  const faces = useMemo(
    () => faceGeometry(vertices, definition.faces),
    [vertices, definition.faces],
  );
  const edges = useMemo(
    () => edgeGeometry(vertices, definition.edges),
    [vertices, definition.edges],
  );

  return (
    <group>
      <mesh geometry={faces}>
        <meshStandardMaterial
          color={color}
          transparent
          opacity={opacity}
          side={DoubleSide}
        />
      </mesh>
      <lineSegments geometry={edges}>
        <lineBasicMaterial color="#1e293b" />
      </lineSegments>
    </group>
  );
}
```

- [ ] **Step 2: Verify types compile**

Run: `cd frontend && npm run typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/polyhedra/PolyhedronMesh.tsx
git commit -m "feat: polyhedron mesh (faces + edges, animation-aware)"
```

---

## Task 8: SymmetryOverlay component (WebGL glue)

**Files:**
- Create: `frontend/src/components/polyhedra/SymmetryOverlay.tsx`

**Interfaces:**
- Consumes: `PolyhedronDefinition`, `SymmetryClass`, `SymmetryElement`.
- Produces:
```ts
interface SymmetryOverlayProps {
  definition: PolyhedronDefinition;
  visibleClasses: ReadonlySet<SymmetryClass>;
  onPickElement: (element: SymmetryElement) => void;
}
export function SymmetryOverlay(props: SymmetryOverlayProps): JSX.Element;
```
- Behavior: for each visible class, render its elements:
  - `axis` → a thin line segment through the origin along `direction` (length ~3), clickable (invisible thicker cylinder for hit target) → `onPickElement`.
  - `plane` → a translucent square (~2.4 wide) centered at origin, oriented so its normal matches `normal`, `side={DoubleSide}`, clickable → `onPickElement`.
  - `improper` → render its axis as a dashed line (distinguish from proper axes), clickable → `onPickElement`.

**Verification:** `npm run typecheck` + build (Task 10). No jsdom test.

- [ ] **Step 1: Write the implementation**

Create `frontend/src/components/polyhedra/SymmetryOverlay.tsx`:
```tsx
import { useMemo } from "react";
import { Quaternion, Vector3 } from "three";
import type {
  PolyhedronDefinition,
  SymmetryClass,
  SymmetryElement,
} from "../../geometry/polyhedra/types";

interface SymmetryOverlayProps {
  definition: PolyhedronDefinition;
  visibleClasses: ReadonlySet<SymmetryClass>;
  onPickElement: (element: SymmetryElement) => void;
}

const AXIS_LEN = 1.6;

function AxisLine({
  element,
  dashed,
  onPick,
}: {
  element: SymmetryElement & { direction: readonly [number, number, number] };
  dashed: boolean;
  onPick: () => void;
}) {
  const dir = new Vector3(...element.direction).normalize();
  const a = dir.clone().multiplyScalar(AXIS_LEN);
  const b = dir.clone().multiplyScalar(-AXIS_LEN);
  const positions = useMemo(
    () => new Float32Array([a.x, a.y, a.z, b.x, b.y, b.z]),
    [a.x, a.y, a.z, b.x, b.y, b.z],
  );
  // Invisible fat cylinder as a click target along the axis.
  const mid = new Vector3(0, 0, 0);
  const quat = new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), dir);
  return (
    <group onClick={(e) => { e.stopPropagation(); onPick(); }}>
      <lineSegments>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[positions, 3]} />
        </bufferGeometry>
        {dashed ? (
          <lineDashedMaterial color="#f59e0b" dashSize={0.15} gapSize={0.1} />
        ) : (
          <lineBasicMaterial color="#ef4444" />
        )}
      </lineSegments>
      <mesh position={mid} quaternion={quat} visible={false}>
        <cylinderGeometry args={[0.06, 0.06, AXIS_LEN * 2, 8]} />
        <meshBasicMaterial />
      </mesh>
    </group>
  );
}

function PlaneQuad({
  element,
  onPick,
}: {
  element: SymmetryElement & { normal: readonly [number, number, number] };
  onPick: () => void;
}) {
  const normal = new Vector3(...element.normal).normalize();
  const quat = new Quaternion().setFromUnitVectors(new Vector3(0, 0, 1), normal);
  return (
    <mesh
      quaternion={quat}
      onClick={(e) => { e.stopPropagation(); onPick(); }}
    >
      <planeGeometry args={[2.4, 2.4]} />
      <meshBasicMaterial
        color="#a855f7"
        transparent
        opacity={0.18}
        side={2 /* THREE.DoubleSide */}
        depthWrite={false}
      />
    </mesh>
  );
}

export function SymmetryOverlay({
  definition,
  visibleClasses,
  onPickElement,
}: SymmetryOverlayProps) {
  const s = definition.symmetry;
  return (
    <group>
      {visibleClasses.has("rotations3") &&
        s.rotations3.map((el, i) =>
          el.kind === "axis" ? (
            <AxisLine key={`r3-${i}`} element={el} dashed={false} onPick={() => onPickElement(el)} />
          ) : null,
        )}
      {visibleClasses.has("halfTurns") &&
        s.halfTurns.map((el, i) =>
          el.kind === "axis" ? (
            <AxisLine key={`ht-${i}`} element={el} dashed={false} onPick={() => onPickElement(el)} />
          ) : null,
        )}
      {visibleClasses.has("reflections") &&
        s.reflections.map((el, i) =>
          el.kind === "plane" ? (
            <PlaneQuad key={`rf-${i}`} element={el} onPick={() => onPickElement(el)} />
          ) : null,
        )}
      {visibleClasses.has("rotoreflections") &&
        s.rotoreflections.map((el, i) =>
          el.kind === "improper" ? (
            <AxisLine key={`s4-${i}`} element={el} dashed onPick={() => onPickElement(el)} />
          ) : null,
        )}
    </group>
  );
}
```

- [ ] **Step 2: Verify types compile**

Run: `cd frontend && npm run typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/polyhedra/SymmetryOverlay.tsx
git commit -m "feat: symmetry overlay (clickable axes and reflection planes)"
```

---

## Task 9: PolyhedronStudio container (lazy-loaded)

**Files:**
- Create: `frontend/src/components/polyhedra/PolyhedronStudio.tsx`

**Interfaces:**
- Consumes: `PolyhedronMesh`, `SymmetryOverlay`, `SymmetryMenu`, `PolyhedronDefinition`, `SymmetryClass`, `SymmetryElement`.
- Produces (default export for lazy import):
```ts
interface PolyhedronStudioProps {
  definition: PolyhedronDefinition;
  onExit: () => void;
}
export default function PolyhedronStudio(props: PolyhedronStudioProps): JSX.Element;
```
- Behavior:
  - Local state: `visibleClasses: Set<SymmetryClass>`, `opacity` (init 0.6), `color` (init `definition.defaultColor`), `animation: { element, progress } | null`, and a `resetSignal` counter for the camera.
  - `<Canvas camera={{ position: [3, 2, 3], fov: 50 }}>` with `ambientLight`, a `directionalLight`, `<OrbitControls>` (from drei), `PolyhedronMesh`, `SymmetryOverlay`.
  - Clicking an element sets `animation = { element, progress: 0 }`. An `AnimationRunner` (inside `<Canvas>`, uses `useFrame`) advances progress `0→1→0` over ~1.6s, then clears `animation` back to null.
  - `SymmetryMenu` rendered as an HTML overlay (outside `<Canvas>`), wired to state; `onResetView` bumps `resetSignal`; `onExit` calls `props.onExit`.
  - Root element: `<div className="absolute inset-0 z-30 bg-surface">` (full-screen, above the 2D layer).

- [ ] **Step 1: Write the implementation**

Create `frontend/src/components/polyhedra/PolyhedronStudio.tsx`:
```tsx
import { useCallback, useRef, useState } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import { PolyhedronMesh } from "./PolyhedronMesh";
import { SymmetryOverlay } from "./SymmetryOverlay";
import { SymmetryMenu } from "./SymmetryMenu";
import type {
  PolyhedronDefinition,
  SymmetryClass,
  SymmetryElement,
} from "../../geometry/polyhedra/types";

interface PolyhedronStudioProps {
  definition: PolyhedronDefinition;
  onExit: () => void;
}

interface AnimationState {
  element: SymmetryElement;
  progress: number;
}

const DURATION = 1.6; // seconds for a full there-and-back demonstration

function AnimationRunner({
  animation,
  onProgress,
  onDone,
}: {
  animation: AnimationState | null;
  onProgress: (progress: number) => void;
  onDone: () => void;
}) {
  const elapsed = useRef(0);
  useFrame((_, delta) => {
    if (!animation) return;
    elapsed.current += delta;
    const t = Math.min(1, elapsed.current / DURATION);
    // Triangle wave: 0 -> 1 -> 0 with ease.
    const eased = t < 0.5 ? t * 2 : (1 - t) * 2;
    onProgress(eased);
    if (t >= 1) {
      elapsed.current = 0;
      onDone();
    }
  });
  return null;
}

export default function PolyhedronStudio({ definition, onExit }: PolyhedronStudioProps) {
  const [visibleClasses, setVisibleClasses] = useState<Set<SymmetryClass>>(new Set());
  const [opacity, setOpacity] = useState(0.6);
  const [color, setColor] = useState(definition.defaultColor);
  const [animation, setAnimation] = useState<AnimationState | null>(null);
  const controlsRef = useRef<OrbitControlsImpl | null>(null);

  const toggleClass = useCallback((cls: SymmetryClass) => {
    setVisibleClasses((prev) => {
      const next = new Set(prev);
      if (next.has(cls)) next.delete(cls);
      else next.add(cls);
      return next;
    });
  }, []);

  const pickElement = useCallback((element: SymmetryElement) => {
    setAnimation({ element, progress: 0 });
  }, []);

  const resetView = useCallback(() => {
    controlsRef.current?.reset();
  }, []);

  return (
    <div className="absolute inset-0 z-30 bg-surface">
      <Canvas camera={{ position: [3, 2, 3], fov: 50 }}>
        <ambientLight intensity={0.7} />
        <directionalLight position={[4, 5, 3]} intensity={0.8} />
        <PolyhedronMesh
          definition={definition}
          color={color}
          opacity={opacity}
          animation={animation}
        />
        <SymmetryOverlay
          definition={definition}
          visibleClasses={visibleClasses}
          onPickElement={pickElement}
        />
        <OrbitControls ref={controlsRef} enablePan={false} />
        <AnimationRunner
          animation={animation}
          onProgress={(progress) =>
            setAnimation((a) => (a ? { ...a, progress } : a))
          }
          onDone={() => setAnimation(null)}
        />
      </Canvas>

      <SymmetryMenu
        polyhedronName={definition.name}
        visibleClasses={visibleClasses}
        onToggleClass={toggleClass}
        opacity={opacity}
        onOpacityChange={setOpacity}
        color={color}
        onColorChange={setColor}
        onResetView={resetView}
        onExit={onExit}
      />
    </div>
  );
}
```

Note: `three-stdlib` ships transitively with `@react-three/drei`; the `OrbitControlsImpl` type import is type-only. If typecheck cannot resolve it, replace the typed ref with `useRef<{ reset: () => void } | null>(null)` and drop the `three-stdlib` import.

- [ ] **Step 2: Verify types compile**

Run: `cd frontend && npm run typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/polyhedra/PolyhedronStudio.tsx
git commit -m "feat: 3D polyhedron studio container with orbit controls and animation"
```

---

## Task 10: App integration — mode, interception, confirm dialog

**Files:**
- Modify: `frontend/src/App.tsx`
- Test: `frontend/src/App.polyhedron.test.tsx`

**Interfaces:**
- Consumes: `polyhedronForTool`, `PolyhedronDefinition`, `PolyhedronStudio` (lazy).
- Produces: intercepted tool activation. When a tool with a definition is chosen, a confirm dialog appears; accepting clears the 2D document and shows `PolyhedronStudio`.

**Integration details (exact):**
- Add near other imports:
  ```tsx
  import { lazy, Suspense } from "react"; // merge into existing "react" import
  import { polyhedronForTool } from "./geometry/polyhedra";
  import type { PolyhedronDefinition } from "./geometry/polyhedra/types";
  const PolyhedronStudio = lazy(() => import("./components/polyhedra/PolyhedronStudio"));
  ```
- Add state (near other `useState` in the component):
  ```tsx
  const [activePolyhedron, setActivePolyhedron] = useState<PolyhedronDefinition | null>(null);
  const [pendingPolyhedron, setPendingPolyhedron] = useState<PolyhedronDefinition | null>(null);
  ```
- Add a wrapped activation handler:
  ```tsx
  const handleActivateTool = useCallback(
    (tool: ConstructionTool) => {
      const def = polyhedronForTool(tool);
      if (def) {
        setPendingPolyhedron(def);
        return;
      }
      constructionTools.activateTool(tool);
    },
    [constructionTools],
  );
  const confirmOpenPolyhedron = useCallback(() => {
    if (!pendingPolyhedron) return;
    replaceConstruction(createEmptyDocument(geometry.viewport));
    setActivePolyhedron(pendingPolyhedron);
    setPendingPolyhedron(null);
  }, [pendingPolyhedron, geometry.viewport, replaceConstruction]);
  ```
- Replace the keyboard-shortcut call `constructionTools.activateTool(tool)` at `App.tsx:233` with `handleActivateTool(tool)`.
- Replace `onActivateTool={constructionTools.activateTool}` at `App.tsx:524` with `onActivateTool={handleActivateTool}`.
- Render the confirm dialog and the studio (add before the final closing `</div>` of the root return):
  ```tsx
  {pendingPolyhedron && (
    <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/40">
      <div role="dialog" aria-label="Abrir visor 3D" className="w-80 rounded-card border border-edge bg-surface p-4 shadow-pop">
        <p className="mb-3 text-sm text-content">
          Se borrará el dibujo actual y se abrirá el visor 3D del {pendingPolyhedron.name.toLowerCase()}. ¿Continuar?
        </p>
        <div className="flex justify-end gap-2">
          <button type="button" onClick={() => setPendingPolyhedron(null)} className="rounded-md border border-edge px-3 py-1 text-xs font-semibold text-muted hover:text-content">
            Cancelar
          </button>
          <button type="button" onClick={confirmOpenPolyhedron} className="rounded-md bg-brand-600 px-3 py-1 text-xs font-semibold text-white hover:bg-brand-700">
            Continuar
          </button>
        </div>
      </div>
    </div>
  )}
  {activePolyhedron && (
    <Suspense fallback={<div className="absolute inset-0 z-30 flex items-center justify-center bg-surface text-sm text-muted">Cargando visor 3D…</div>}>
      <PolyhedronStudio definition={activePolyhedron} onExit={() => setActivePolyhedron(null)} />
    </Suspense>
  )}
  ```

- [ ] **Step 1: Write the failing test**

Create `frontend/src/App.polyhedron.test.tsx`:
```tsx
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// Stub the heavy 3D studio so the test never loads three.js/WebGL.
vi.mock("./components/polyhedra/PolyhedronStudio", () => ({
  default: ({ onExit }: { onExit: () => void }) => (
    <div data-testid="studio">
      <button onClick={onExit}>Salir a 2D</button>
    </div>
  ),
}));

import App from "./App";

describe("polyhedron entry from toolbar", () => {
  it("opens the confirm dialog and then the 3D studio", async () => {
    render(<App />);
    // Open the "Regular polyhedra" tool group, then choose Tetrahedron.
    await userEvent.click(screen.getByRole("button", { name: /regular polyhedra/i }));
    await userEvent.click(screen.getByRole("menuitem", { name: /tetrahedron/i }));

    // Confirm dialog appears.
    const dialog = await screen.findByRole("dialog", { name: /abrir visor 3d/i });
    expect(dialog).toBeInTheDocument();

    // Accept -> studio renders.
    await userEvent.click(screen.getByRole("button", { name: /continuar/i }));
    expect(await screen.findByTestId("studio")).toBeInTheDocument();
  });
});
```

Note: If `App` requires providers/props to render in isolation, mirror the setup used by any existing `App`-level test; if none exists, wrap only what the render needs. Adjust the tool-group opening step to match `ConstructionToolbar`'s actual ARIA roles (see `ConstructionToolbar.test.tsx` lines 79-100 for the exact query pattern used for groups).

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/App.polyhedron.test.tsx`
Expected: FAIL (no confirm dialog / interception not wired yet).

- [ ] **Step 3: Implement the integration**

Apply all edits from the "Integration details (exact)" block above to `frontend/src/App.tsx`.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npx vitest run src/App.polyhedron.test.tsx`
Expected: PASS.

- [ ] **Step 5: Full checks**

Run: `cd frontend && npm run typecheck && npx vitest run`
Expected: typecheck PASS; full suite PASS.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/App.tsx frontend/src/App.polyhedron.test.tsx
git commit -m "feat: enter 3D tetrahedron studio from toolbar with confirm dialog"
```

---

## Task 11: Production build verification

**Files:** none (verification only).

- [ ] **Step 1: Build**

Run: `cd frontend && npm run build`
Expected: PASS. Confirm three.js lands in a **separate lazy chunk** (Vite output should show a `PolyhedronStudio-*.js` chunk distinct from the main bundle), proving the 2D app does not pay the three.js cost on load.

- [ ] **Step 2: Manual smoke test (dev server)**

Run: `cd frontend && npm run dev`, open http://localhost:5173, then:
1. Click the "Regular polyhedra" toolbar group → Tetrahedron.
2. Confirm the dialog appears; click "Continuar".
3. Verify: tetrahedron renders; drag rotates; wheel zooms.
4. Toggle each symmetry class; verify axes/planes appear.
5. Click a rotation axis → figure rotates and returns; click a reflection plane → vertices morph to the mirror image and return.
6. Change opacity and color; click "Restablecer vista"; click "Salir a 2D" → back to empty 2D canvas.

- [ ] **Step 3: Commit (if any tweaks were needed)**

```bash
git add -A
git commit -m "chore: verify 3D studio build and lazy chunking"
```

---

## Self-Review Notes

- **Spec coverage:** three.js/r3f/drei (Task 1); data-driven definition + reusable pattern (Tasks 2–4); symmetry elements + click-to-animate with det-based rule (Tasks 5, 7, 8, 9); in-canvas menu with class toggles + opacity + color (Task 6); full-screen mode, discard 2D, confirm dialog, exit (Task 10); lazy-load (Tasks 9–11); tests for pure math + menu + interception (Tasks 2–6, 10); no backend changes (all tasks frontend-only). ✔
- **Placeholders:** none — every code step carries full code.
- **Type consistency:** `PolyhedronDefinition`, `SymmetryElement`, `SymmetryClass`, `matrixForElement`, `transformedVertices`, `polyhedronForTool` are defined once and reused with matching signatures across tasks. ✔
- **Reusable pattern for other polyhedra:** the geometry/animation/render pipeline (`PolyhedronMesh`, `animation.ts`, `SymmetryOverlay`, `POLYHEDRON_DEFINITIONS`) is generic — a polyhedron sharing the tetrahedron's symmetry-class taxonomy is data-only. **Caveat (see spec § "Alcance real del patrón"):** the four-bucket `SymmetryClass` taxonomy (`types.ts`, `SymmetryMenu`, `SymmetryOverlay`) is fixed to group **Td**; the cube/octahedron (group **Oh**) have different classes and require generalizing the taxonomy into the definition first. That generalization is the first step of the *next* polyhedron's work, deliberately deferred (YAGNI). ✔

# Grid Toggle and Snap-to-Grid Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "Cuadrícula" toolbar button with a submenu to show/hide the grid, toggle snap-to-grid for point creation/dragging, and choose an automatic or manual grid step.

**Architecture:** Two new pure functions in `viewport.ts` (effective step, per-axis threshold snap), a `useGridSettings` hook that persists a small settings object to `localStorage` (mirrors `useTheme.ts`), a `GridMenu` popover component (mirrors `ConfigPopover.tsx`), and wiring through `Grid.tsx` / `GeometryCanvas.tsx` / `App.tsx`.

**Tech Stack:** React 18 + TypeScript (frontend only), Vitest for unit tests, Tailwind utility classes for styling, `lucide-react` for icons.

## Global Constraints

- Frontend-only feature. Grid/snap settings are a local UI preference (same
  scope as `useTheme.ts`), **not** part of `GeometryDocument` — do not touch
  the JSON schema, the Python backend, or `shared/fixtures/` conformance
  fixtures. The dual-runtime rule in `CLAUDE.md` applies to new construction
  types, which this is not.
- All commands in this plan run from the `frontend/` directory.
- `npm run typecheck` (`tsc -b --pretty false`) must pass after every task.
- `npm run test` (`vitest run`) must pass after every task that touches `viewport.ts`.
- Follow existing patterns exactly: `useTheme.ts` for the settings hook,
  `ConfigPopover.tsx` for the popover mechanics. Neither has automated tests
  for the hook or the popover component itself — this plan doesn't add any
  either; verify those two tasks by typecheck + a manual browser check at the
  end (Task 5).

---

### Task 1: Effective grid step and per-axis snap math

**Files:**
- Modify: `frontend/src/geometry/viewport.ts`
- Test: `frontend/src/geometry/viewport.test.ts`

**Interfaces:**
- Produces: `export interface GridSettings { showGrid: boolean; snapToGrid: boolean; stepMode: "auto" | "manual"; manualStep: number; }`
- Produces: `export function getEffectiveGridStep(settings: GridSettings, viewportScale: number): number`
- Produces: `export function snapToGrid(point: Coordinate, step: number, viewportScale: number, snapRadiusPx?: number): Coordinate`

- [ ] **Step 1: Write the failing tests**

Add to the end of `frontend/src/geometry/viewport.test.ts` (add `getEffectiveGridStep`, `GridSettings`, `snapToGrid` to the existing import list at the top of the file):

```ts
import {
  chooseGridStep,
  clientToSvgScreen,
  clipImplicitLineToBounds,
  getEffectiveGridStep,
  getWorldBounds,
  MAX_VIEWPORT_SCALE,
  MIN_VIEWPORT_SCALE,
  screenToWorld,
  snapToGrid,
  worldToScreen,
  zoomViewportAtScreenPoint,
} from "./viewport";
import type { GridSettings } from "./viewport";
```

```ts
describe("getEffectiveGridStep", () => {
  it("delegates to chooseGridStep when stepMode is auto", () => {
    const settings: GridSettings = {
      showGrid: true,
      snapToGrid: false,
      stepMode: "auto",
      manualStep: 1,
    };
    expect(getEffectiveGridStep(settings, 50)).toBe(chooseGridStep(50));
  });

  it("returns manualStep when stepMode is manual, ignoring viewport scale", () => {
    const settings: GridSettings = {
      showGrid: true,
      snapToGrid: true,
      stepMode: "manual",
      manualStep: 2.5,
    };
    expect(getEffectiveGridStep(settings, 10)).toBe(2.5);
    expect(getEffectiveGridStep(settings, 500)).toBe(2.5);
  });
});

describe("snapToGrid", () => {
  it("snaps both axes to the nearest grid node when within the pixel radius", () => {
    expect(snapToGrid({ x: 2.02, y: 4.98 }, 1, 50)).toEqual({ x: 2, y: 5 });
  });

  it("leaves a coordinate unsnapped when it is farther than the radius from any grid node", () => {
    expect(snapToGrid({ x: 2.3, y: 4.98 }, 1, 50)).toEqual({ x: 2.3, y: 5 });
  });

  it("shrinks the snap radius in world units as the viewport zooms in", () => {
    expect(snapToGrid({ x: 2.05, y: 0 }, 1, 200)).toEqual({ x: 2.05, y: 0 });
    expect(snapToGrid({ x: 2.02, y: 0 }, 1, 200)).toEqual({ x: 2, y: 0 });
  });

  it("accepts a custom snap radius in pixels", () => {
    expect(snapToGrid({ x: 2.3, y: 0 }, 1, 50, 20)).toEqual({ x: 2, y: 0 });
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm run test -- src/geometry/viewport.test.ts`
Expected: FAIL — `getEffectiveGridStep`/`snapToGrid`/`GridSettings` are not exported from `./viewport`.

- [ ] **Step 3: Implement the functions**

Add to `frontend/src/geometry/viewport.ts`, right after the existing `chooseGridStep` function (after line 98):

```ts
export interface GridSettings {
  showGrid: boolean;
  snapToGrid: boolean;
  stepMode: "auto" | "manual";
  manualStep: number;
}

export function getEffectiveGridStep(settings: GridSettings, viewportScale: number): number {
  return settings.stepMode === "manual" ? settings.manualStep : chooseGridStep(viewportScale);
}

const DEFAULT_SNAP_RADIUS_PX = 8;

export function snapToGrid(
  point: Coordinate,
  step: number,
  viewportScale: number,
  snapRadiusPx: number = DEFAULT_SNAP_RADIUS_PX,
): Coordinate {
  const worldRadius = snapRadiusPx / viewportScale;
  return {
    x: snapAxis(point.x, step, worldRadius),
    y: snapAxis(point.y, step, worldRadius),
  };
}

function snapAxis(value: number, step: number, worldRadius: number): number {
  const nearest = Math.round(value / step) * step;
  return Math.abs(value - nearest) <= worldRadius ? nearest : value;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm run test -- src/geometry/viewport.test.ts`
Expected: PASS (all tests in the file, including the pre-existing ones).

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/geometry/viewport.ts src/geometry/viewport.test.ts
git commit -m "feat(geometry): add effective grid step and per-axis snap-to-grid math"
```

---

### Task 2: `useGridSettings` persistence hook

**Files:**
- Create: `frontend/src/geometry/useGridSettings.ts`

**Interfaces:**
- Consumes: `GridSettings` from `./viewport` (Task 1)
- Produces: `export const DEFAULT_GRID_SETTINGS: GridSettings`
- Produces: `export function useGridSettings(): { settings: GridSettings; setSettings: (next: GridSettings) => void }`

- [ ] **Step 1: Write the hook**

Create `frontend/src/geometry/useGridSettings.ts`:

```ts
import { useEffect, useState } from "react";

import type { GridSettings } from "./viewport";

const STORAGE_KEY = "geolab-grid-settings";

export const DEFAULT_GRID_SETTINGS: GridSettings = {
  showGrid: true,
  snapToGrid: false,
  stepMode: "auto",
  manualStep: 1,
};

function readStoredSettings(): GridSettings {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw === null) return DEFAULT_GRID_SETTINGS;
    const parsed = JSON.parse(raw);
    return { ...DEFAULT_GRID_SETTINGS, ...parsed };
  } catch {
    return DEFAULT_GRID_SETTINGS;
  }
}

/**
 * Resolves and persists the grid visibility/snap/step preferences.
 * Follows the same localStorage pattern as useTheme.ts.
 */
export function useGridSettings(): {
  settings: GridSettings;
  setSettings: (next: GridSettings) => void;
} {
  const [settings, setSettings] = useState<GridSettings>(readStoredSettings);

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    } catch {
      // Ignore storage failures (private mode, quota); settings still apply in-session.
    }
  }, [settings]);

  return { settings, setSettings };
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: no errors (the file is not imported anywhere yet, so this only checks it compiles standalone).

- [ ] **Step 3: Commit**

```bash
git add src/geometry/useGridSettings.ts
git commit -m "feat(geometry): add useGridSettings persistence hook"
```

---

### Task 3: Wire grid visibility and snapping into the canvas

**Files:**
- Modify: `frontend/src/components/geometry/Grid.tsx`
- Modify: `frontend/src/components/geometry/GeometryCanvas.tsx`

**Interfaces:**
- Consumes: `GridSettings`, `getEffectiveGridStep`, `snapToGrid` from `../../geometry/viewport` (Task 1)
- Consumes: `DEFAULT_GRID_SETTINGS` from `../../geometry/useGridSettings` (Task 2)
- Produces: `Grid` now requires `step: number` and `showGrid: boolean` props
- Produces: `GeometryCanvas` accepts an optional `gridSettings?: GridSettings` prop (defaults to `DEFAULT_GRID_SETTINGS` so existing callers keep compiling until Task 5 wires it explicitly)

- [ ] **Step 1: Update `Grid.tsx` to accept `step` and `showGrid` as props**

In `frontend/src/components/geometry/Grid.tsx`, change the import at line 1 (drop `chooseGridStep`, it's no longer called from this file):

```ts
import { getWorldBounds, worldToScreen } from "../../geometry/viewport";
```

Change the `GridProps` interface (lines 5-8):

```ts
interface GridProps {
  viewport: GeometryViewport;
  size: CanvasSize;
  step: number;
  showGrid: boolean;
}
```

Change the function signature and remove the internal step calculation (lines 19-21):

```ts
export function Grid({ viewport, size, step, showGrid }: GridProps) {
  const bounds = getWorldBounds(viewport, size);
  const origin = worldToScreen({ x: 0, y: 0 }, viewport, size);
```

Wrap the two grid-line render blocks in `showGrid &&` (replaces lines 41-46):

```tsx
      {showGrid &&
        verticalLines.map((line) => (
          <GridVerticalLine key={line.key} line={line} height={size.height} />
        ))}
      {showGrid &&
        horizontalLines.map((line) => (
          <GridHorizontalLine key={line.key} line={line} width={size.width} />
        ))}
```

Everything else in the file (origin, axis visibility, axis lines, ticks, axis-name
labels) is unchanged — axes stay visible regardless of `showGrid`.

- [ ] **Step 2: Add a `gridSettings` prop and ref to `GeometryCanvas.tsx`**

Add imports at the top of `frontend/src/components/geometry/GeometryCanvas.tsx` (alongside the existing `../../geometry/viewport` import on lines 4-12):

```ts
import {
  clientToSvgScreen,
  clipImplicitLineToBounds,
  getEffectiveGridStep,
  getWorldBounds,
  panViewport,
  screenToWorld,
  snapToGrid,
  worldToScreen,
  zoomViewportAtScreenPoint,
} from "../../geometry/viewport";
import type { CanvasSize, Coordinate, GridSettings } from "../../geometry/viewport";
import { DEFAULT_GRID_SETTINGS } from "../../geometry/useGridSettings";
```

Add the prop to `GeometryCanvasProps` (after `panelOpen?: boolean;` at line 55):

```ts
  panelOpen?: boolean;
  gridSettings?: GridSettings;
```

Add the corresponding default to the destructured props (after `panelOpen = false,` at line 75):

```ts
  panelOpen = false,
  gridSettings = DEFAULT_GRID_SETTINGS,
}: GeometryCanvasProps) {
```

Add a `gridSettingsRef`, mirroring the existing `viewportRef` pattern (right after `viewportRef.current = viewport;` at line 99):

```ts
  // Always-current grid settings ref, same rationale as viewportRef: lets the
  // pointer handlers below read the latest settings without being recreated
  // on every settings change.
  const gridSettingsRef = useRef(gridSettings);
  gridSettingsRef.current = gridSettings;
```

Add an `effectiveStep` computed for rendering, right before the `return (` that
starts the JSX (line 323 today):

```ts
  const effectiveStep = getEffectiveGridStep(gridSettings, viewport.scale);

  return (
```

- [ ] **Step 3: Apply snapping when dragging a free point**

In `handlePointerMove` (around line 204-207), replace:

```ts
      const pointDrag = draggedPointRef.current;
      if (pointDrag !== null && pointDrag.pointerId === event.pointerId) {
        onMoveFreePoint(pointDrag.objectId, world.x, world.y);
      }
```

with:

```ts
      const pointDrag = draggedPointRef.current;
      if (pointDrag !== null && pointDrag.pointerId === event.pointerId) {
        const settings = gridSettingsRef.current;
        const target = settings.snapToGrid
          ? snapToGrid(world, getEffectiveGridStep(settings, viewportRef.current.scale), viewportRef.current.scale)
          : world;
        onMoveFreePoint(pointDrag.objectId, target.x, target.y);
      }
```

- [ ] **Step 4: Apply snapping when creating a point from a canvas click**

In `stopDragging` (around lines 286-288), replace:

```ts
        if (!canvasDrag.hasMoved) {
          onCanvasClick(canvasDrag.worldAtDown);
        }
```

with:

```ts
        if (!canvasDrag.hasMoved) {
          const settings = gridSettingsRef.current;
          const shouldSnap = settings.snapToGrid && activeTool !== "select";
          const world = shouldSnap
            ? snapToGrid(
                canvasDrag.worldAtDown,
                getEffectiveGridStep(settings, viewportRef.current.scale),
                viewportRef.current.scale,
              )
            : canvasDrag.worldAtDown;
          onCanvasClick(world);
        }
```

Add `activeTool` to `stopDragging`'s `useCallback` dependency array (currently `[onCanvasClick, onEndFreePointMove]` at line 292):

```ts
    [activeTool, onCanvasClick, onEndFreePointMove],
```

(`handlePointerMove`'s dependency array is unchanged — it already lists `activeTool`, and the new code only reads `gridSettingsRef.current`/`viewportRef.current`, both refs read at call time, so no new dependencies are needed there.)

- [ ] **Step 5: Pass `step`/`showGrid` to `Grid`**

Replace the render call (line 339):

```tsx
        <Grid viewport={viewport} size={size} />
```

with:

```tsx
        <Grid viewport={viewport} size={size} step={effectiveStep} showGrid={gridSettings.showGrid} />
```

- [ ] **Step 6: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 7: Run the full test suite**

Run: `npm run test`
Expected: PASS (228+ tests — no existing test exercises `GeometryCanvas.tsx` or `Grid.tsx` directly, so this is a regression check on everything else).

- [ ] **Step 8: Commit**

```bash
git add src/components/geometry/Grid.tsx src/components/geometry/GeometryCanvas.tsx
git commit -m "feat(geometry): wire grid visibility and snap-to-grid into the canvas"
```

---

### Task 4: `GridMenu` toolbar button and submenu

**Files:**
- Create: `frontend/src/components/geometry/GridMenu.tsx`

**Interfaces:**
- Consumes: `GridSettings` from `../../geometry/viewport` (Task 1)
- Produces: `export function GridMenu({ settings, onChange }: { settings: GridSettings; onChange: (next: GridSettings) => void }): JSX.Element`

- [ ] **Step 1: Write the component**

Create `frontend/src/components/geometry/GridMenu.tsx`:

```tsx
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Grid3x3 } from "lucide-react";

import type { GridSettings } from "../../geometry/viewport";

interface GridMenuProps {
  settings: GridSettings;
  onChange: (next: GridSettings) => void;
}

interface MenuPos {
  top: number;
  left: number;
}

const MENU_WIDTH = 220;

export function GridMenu({ settings, onChange }: GridMenuProps) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<MenuPos | null>(null);
  const [manualStepText, setManualStepText] = useState(String(settings.manualStep));
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setManualStepText(String(settings.manualStep));
  }, [settings.manualStep]);

  useEffect(() => {
    if (!open) return;
    const handlePointerDown = (event: MouseEvent): void => {
      const target = event.target as Node;
      const insideTrigger = triggerRef.current?.contains(target) ?? false;
      const insidePanel = panelRef.current?.contains(target) ?? false;
      if (!insideTrigger && !insidePanel) setOpen(false);
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

  const handleToggle = (): void => {
    if (!open && triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      const left = Math.min(rect.right + 8, window.innerWidth - MENU_WIDTH - 8);
      setPos({ top: rect.top, left });
    }
    setOpen((value) => !value);
  };

  const handleManualStepChange = (text: string): void => {
    setManualStepText(text);
    const value = Number(text);
    if (Number.isFinite(value) && value > 0) {
      onChange({ ...settings, manualStep: value });
    }
  };

  return (
    <div>
      <button
        ref={triggerRef}
        type="button"
        title="Cuadrícula"
        aria-label="Grid settings"
        aria-expanded={open}
        onClick={handleToggle}
        className="flex items-center justify-center rounded-lg p-2 text-muted transition-colors hover:bg-accent-soft hover:text-accent-soft-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500"
      >
        <Grid3x3 size={18} aria-hidden />
      </button>

      {open && pos !== null
        ? createPortal(
            <div
              ref={panelRef}
              role="dialog"
              aria-label="Grid settings"
              style={{ position: "fixed", top: pos.top, left: pos.left, width: MENU_WIDTH, zIndex: 9999 }}
              className="rounded-xl border border-edge bg-surface p-3 shadow-pop"
            >
              <p className="mb-2 text-[0.65rem] font-semibold uppercase tracking-[0.1em] text-muted">
                Cuadrícula
              </p>
              <label className="mb-2 flex cursor-pointer items-center gap-2">
                <input
                  type="checkbox"
                  checked={settings.showGrid}
                  onChange={(event) => onChange({ ...settings, showGrid: event.target.checked })}
                  className="h-3.5 w-3.5 rounded accent-brand-600"
                />
                <span className="text-xs text-content">Mostrar cuadrícula</span>
              </label>
              <label className="mb-3 flex cursor-pointer items-center gap-2">
                <input
                  type="checkbox"
                  checked={settings.snapToGrid}
                  onChange={(event) => onChange({ ...settings, snapToGrid: event.target.checked })}
                  className="h-3.5 w-3.5 rounded accent-brand-600"
                />
                <span className="text-xs text-content">Ajustar a cuadrícula</span>
              </label>

              <p className="mb-1 text-[0.65rem] font-semibold uppercase tracking-[0.1em] text-muted">
                Paso
              </p>
              <label className="mb-1.5 flex cursor-pointer items-center gap-2">
                <input
                  type="radio"
                  name="grid-step-mode"
                  checked={settings.stepMode === "auto"}
                  onChange={() => onChange({ ...settings, stepMode: "auto" })}
                  className="h-3.5 w-3.5 accent-brand-600"
                />
                <span className="text-xs text-content">Automático</span>
              </label>
              <label className="flex cursor-pointer items-center gap-2">
                <input
                  type="radio"
                  name="grid-step-mode"
                  checked={settings.stepMode === "manual"}
                  onChange={() => onChange({ ...settings, stepMode: "manual" })}
                  className="h-3.5 w-3.5 accent-brand-600"
                />
                <span className="text-xs text-content">Manual:</span>
                <input
                  type="number"
                  min="0"
                  step="0.1"
                  disabled={settings.stepMode !== "manual"}
                  value={manualStepText}
                  onChange={(event) => handleManualStepChange(event.target.value)}
                  className="w-16 rounded-md border border-edge bg-surface-muted px-1.5 py-0.5 text-xs text-content disabled:opacity-40"
                />
              </label>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: no errors (the file is not imported anywhere yet).

- [ ] **Step 3: Commit**

```bash
git add src/components/geometry/GridMenu.tsx
git commit -m "feat(geometry): add GridMenu toolbar popover"
```

---

### Task 5: Wire `GridMenu` into `App.tsx`

**Files:**
- Modify: `frontend/src/App.tsx`

**Interfaces:**
- Consumes: `useGridSettings` from `./geometry/useGridSettings` (Task 2)
- Consumes: `GridMenu` from `./components/geometry/GridMenu` (Task 4)
- Consumes: `GeometryCanvas`'s `gridSettings` prop (Task 3)

- [ ] **Step 1: Import the hook and component**

Add near the other geometry imports (after the `ConstructionToolbar` import on line 15):

```ts
import { GridMenu } from "./components/geometry/GridMenu";
```

Add near the `useGeometryState` import (after line 27):

```ts
import { useGridSettings } from "./geometry/useGridSettings";
```

- [ ] **Step 2: Instantiate the hook**

Find where `const { theme, toggleTheme } = useTheme();` is declared (per the existing pattern) and add right after it:

```ts
const { settings: gridSettings, setSettings: setGridSettings } = useGridSettings();
```

- [ ] **Step 3: Render `GridMenu` in the toolbar controls**

In the `toolbarControls` JSX (starting at line 369), add `<GridMenu .../>` right after the "Reset view" button and before `<AuthControl .../>` (i.e., after the closing `</button>` of the Reset view button, which currently precedes line 403's `<AuthControl`):

```tsx
      <GridMenu settings={gridSettings} onChange={setGridSettings} />
      <AuthControl
```

- [ ] **Step 4: Pass `gridSettings` to `GeometryCanvas`**

In the `<GeometryCanvas ... />` call (starting at line 454), add the prop (e.g. right after `panelOpen={panelOpen}` on line 471):

```tsx
          panelOpen={panelOpen}
          gridSettings={gridSettings}
        />
```

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 6: Run the full test suite**

Run: `npm run test`
Expected: PASS.

- [ ] **Step 7: Manual verification in the browser**

Run: `npm run dev`, open the printed local URL, then check:
1. A grid-icon button appears in the floating left toolbar's control group (near undo/redo/reset view). Clicking it opens a popover with "Mostrar cuadrícula", "Ajustar a cuadrícula", and "Paso" (Automático/Manual + number field).
2. Unchecking "Mostrar cuadrícula" hides the grid lines but keeps the x/y axes and their tick labels visible.
3. With "Ajustar a cuadrícula" checked and the Point tool active, clicking near (but not exactly on) a grid intersection creates the point snapped to that intersection; clicking well away from any intersection creates the point at the exact click position.
4. With "Ajustar a cuadrícula" checked, dragging an existing free point near a grid line snaps it to that line; dragging it away from any grid line lets it move freely.
5. Selecting "Manual" and entering `2` changes the grid spacing to 2 world units at every zoom level, and snapping now targets multiples of 2.
6. Reloading the page keeps the chosen settings (persisted via `localStorage`).

Report the outcome of each check.

- [ ] **Step 8: Commit**

```bash
git add src/App.tsx
git commit -m "feat(geometry): add Cuadrícula toolbar menu for grid visibility and snapping"
```

# Grid Toggle and Snap-to-Grid — Design Spec

**Date:** 2026-07-15
**Status:** Approved

## Problem

The coordinate grid (`Grid.tsx`) is always on: there is no way to hide it, and there
is no snapping — free points always land exactly where the pointer is, in world
coordinates. There is no menu button for grid-related settings anywhere in the
toolbar.

## Goal

Add a "Cuadrícula" menu button to the toolbar that opens a submenu with:

1. **Mostrar cuadrícula** — toggle grid-line visibility (axes stay visible either way).
2. **Ajustar a cuadrícula** — toggle snap-to-grid for point creation and free-point
   dragging.
3. **Paso** — Automático (current zoom-based step, unchanged) or Manual (a
   fixed step in world units, used for both rendering and snapping).

Settings persist across sessions in `localStorage`, following the existing
`useTheme.ts` pattern.

## Scope

- `frontend/src/geometry/viewport.ts` — new pure functions
- `frontend/src/geometry/useGridSettings.ts` — new hook
- `frontend/src/components/geometry/Grid.tsx` — accept `step`/`showGrid` props
- `frontend/src/components/geometry/GridMenu.tsx` — new component
- `frontend/src/components/geometry/GeometryCanvas.tsx` — wire snapping + grid props
- `frontend/src/App.tsx` — instantiate the hook, render `GridMenu`, pass props down

No backend changes, no document-schema changes (grid/snap settings are a
frontend-only UI preference, not part of `GeometryDocument`).

## Design

### 1. `useGridSettings` hook (new file)

Modeled on `frontend/src/theme/useTheme.ts` (`useState` + `localStorage`,
read wrapped in try/catch, write in a `useEffect`, invalid/missing JSON falls
back to defaults):

```ts
export interface GridSettings {
  showGrid: boolean;
  snapToGrid: boolean;
  stepMode: "auto" | "manual";
  manualStep: number;
}

const STORAGE_KEY = "geolab-grid-settings";
const DEFAULT_SETTINGS: GridSettings = {
  showGrid: true,
  snapToGrid: false,
  stepMode: "auto",
  manualStep: 1,
};

function readStoredSettings(): GridSettings {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw === null) return DEFAULT_SETTINGS;
    const parsed = JSON.parse(raw);
    return { ...DEFAULT_SETTINGS, ...parsed };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function useGridSettings(): {
  settings: GridSettings;
  setSettings: (next: GridSettings) => void;
} {
  const [settings, setSettings] = useState<GridSettings>(readStoredSettings);

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    } catch {
      // Ignore write failures (e.g. private browsing quota) — same as useTheme.ts.
    }
  }, [settings]);

  return { settings, setSettings };
}
```

`manualStep` is validated at the write boundary (in `GridMenu`, see §5) — the
hook itself just stores whatever valid `GridSettings` it's given.

### 2. Effective step (new function in `viewport.ts`)

```ts
export function getEffectiveGridStep(settings: GridSettings, viewportScale: number): number {
  return settings.stepMode === "manual" ? settings.manualStep : chooseGridStep(viewportScale);
}
```

Computed once per render in `GeometryCanvas.tsx` and passed to both `Grid`
(rendering) and the snap function (below), so rendering and snapping can never
disagree on the current step.

### 3. Per-axis threshold snap (new function in `viewport.ts`)

```ts
const SNAP_RADIUS_PX = 8;

export function snapToGrid(
  point: Coordinate,
  step: number,
  viewportScale: number,
  snapRadiusPx: number = SNAP_RADIUS_PX,
): Coordinate {
  const worldRadius = snapRadiusPx / viewportScale;
  return { x: snapAxis(point.x, step, worldRadius), y: snapAxis(point.y, step, worldRadius) };
}

function snapAxis(value: number, step: number, worldRadius: number): number {
  const nearest = Math.round(value / step) * step;
  return Math.abs(value - nearest) <= worldRadius ? nearest : value;
}
```

Each axis snaps independently to the nearest grid line only when the pointer
is within `SNAP_RADIUS_PX` screen pixels of it; otherwise the exact pointer
position is kept. This matches the approved behavior: free positions stay
available away from grid lines, and points "jump" to a guide only when close
to it (per-axis, not a circular radius around a lattice node).

### 4. `Grid.tsx`: accept `step` and `showGrid`, keep axes unconditional

- Remove the internal `const step = chooseGridStep(viewport.scale);` — `step`
  becomes a required prop.
- Add `showGrid: boolean` prop.
- Wrap the two existing render blocks that map to `GridVerticalLine` /
  `GridHorizontalLine` (lines 41-46 today) in `showGrid && ...`.
- Everything else (origin, `axisXVisible`/`axisYVisible`, axis `<line>`s,
  ticks, and axis-name labels) is unchanged and stays unconditional — axes,
  ticks, and numbers remain visible regardless of `showGrid`.

### 5. `GridMenu.tsx` (new component)

Modeled on `frontend/src/components/assistant/ConfigPopover.tsx`: a trigger
button (`aria-expanded`, toggles local `open` state) plus a panel positioned
from `getBoundingClientRect()` and mounted via `createPortal(..., document.body)`,
closing on outside-`mousedown` or `Escape` (same `useEffect` listener pattern).

Panel contents:

```
Cuadrícula
[x] Mostrar cuadrícula
[x] Ajustar a cuadrícula

Paso
(•) Automático
( ) Manual: [ 1.0 ] unidades
```

- Props: `settings: GridSettings`, `onChange: (next: GridSettings) => void`.
- The manual-step `<input type="number">` is disabled unless `stepMode === "manual"`.
- On input change: parse the value; if it is not a finite number or is `<= 0`,
  ignore the keystroke (keep the last valid `manualStep` in state) rather than
  writing an invalid value — mirrors "validate at the boundary" from
  `CLAUDE.md`, no error UI needed since the field simply won't accept the
  invalid character.

### 6. `GeometryCanvas.tsx` wiring

- New props: `gridSettings: GridSettings`.
- `const effectiveStep = getEffectiveGridStep(gridSettings, viewport.scale);` computed each render.
- Render: `<Grid viewport={viewport} size={size} step={effectiveStep} showGrid={gridSettings.showGrid} />` (replaces the current unconditional `<Grid viewport={viewport} size={size} />`).
- **Dragging a free point** — in `handlePointerMove` (line 206 today), when
  `gridSettings.snapToGrid` is true, replace `world` with
  `snapToGrid(world, effectiveStep, viewport.scale)` before calling
  `onMoveFreePoint(pointDrag.objectId, world.x, world.y)`.
- **Creating a point** — in `stopDragging` (line 287 today), when
  `gridSettings.snapToGrid` is true and `activeTool !== "select"`, snap
  `canvasDrag.worldAtDown` the same way before calling
  `onCanvasClick(canvasDrag.worldAtDown)`.
  - Verified in `constructionTools.ts` (`handleCanvasClick`): every non-select
    tool creates a new free point from the raw clicked world coordinate
    whenever the current construction step expects a point (`point`,
    `polygon`, `vector_polygon`, `regular_polygon`, and the point-typed steps
    of `MULTI_STEP_REQUIREMENTS`-driven tools like segment/line/circle/midpoint).
    Steps that expect an existing non-point object just fail with an error
    regardless of the coordinate, so unconditionally snapping on
    `activeTool !== "select"` is safe and requires no changes to
    `constructionTools.ts`.
- No change to `onTranslateObject` (dragging derived/translatable objects,
  not free points) or to any other object kind — snapping only ever touches
  raw pointer world coordinates for free-point creation/drag, never derived
  geometry.

### 7. `App.tsx` wiring

- `const { settings: gridSettings, setSettings: setGridSettings } = useGridSettings();`
- Render `<GridMenu settings={gridSettings} onChange={setGridSettings} />` in
  the existing `toolbarControls` JSX, alongside the theme toggle and undo/redo
  buttons.
- Pass `gridSettings={gridSettings}` to `<GeometryCanvas />`.

## Data flow

User toggles a `GridMenu` control → `onChange` fires with the new
`GridSettings` → `useGridSettings` updates state → a `useEffect` persists it
to `localStorage` (try/catch, same as `useTheme`) → the new `gridSettings`
prop flows down to `GeometryCanvas`, which recomputes `effectiveStep` and
re-renders `Grid` with the new visibility/step; the pointer handlers read the
current `gridSettings` (via closure, re-created each render like the other
`useCallback`s in the file) for snapping.

## Error handling

- `localStorage` read/write wrapped in try/catch; invalid or missing stored
  JSON falls back to `DEFAULT_SETTINGS` — identical pattern to `useTheme.ts`.
- Manual step input rejects non-positive/non-finite values at the input
  boundary (§5); no other validation is needed since every other field is a
  checkbox/radio with a closed set of values.

## Testing

- `viewport.test.ts`: new cases for `getEffectiveGridStep` (auto delegates to
  `chooseGridStep`; manual returns `manualStep` unchanged regardless of scale)
  and `snapToGrid`/`snapAxis` (inside vs. outside the radius, both axes
  independently, at different `viewportScale` values since the radius is
  screen-pixel-based).
- No existing test coverage for toolbar/menu components (`ConfigPopover` and
  `useTheme` have none either) — `GridMenu` follows the same precedent and
  gets manual verification in the browser instead, per `CLAUDE.md`'s guidance
  to test UI changes live before reporting completion.

## Out of scope

- Grid/snap settings are not part of `GeometryDocument` and are not saved
  per-document or shared via share links — they are a local UI preference
  (parallel to theme), same scope boundary as `useTheme.ts`.
- Snapping for objects other than free points (segments, circles, etc. are
  derived and already excluded; translating a whole object via
  `onTranslateObject` is unaffected).
- A configurable snap radius (`SNAP_RADIUS_PX` is a fixed constant for now).
- Backend changes of any kind.

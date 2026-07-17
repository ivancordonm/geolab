# Grid Menu Axes Toggle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "Mostrar ejes" checkbox to `GridMenu` that hides/shows the X and Y axes (lines, ticks, labels, names) as a single combined toggle, independent of "Mostrar cuadrícula".

**Architecture:** Extend the existing `GridSettings` type with one new boolean field (`showAxes`), thread it through the same `useGridSettings` → `GridMenu` → `GeometryCanvas` → `Grid` data path already used by `showGrid`, and gate `Grid.tsx`'s axis-rendering block behind it.

**Tech Stack:** React + TypeScript, Vite, Vitest.

## Global Constraints

- Single combined checkbox controls both X and Y axes together — no independent per-axis controls (decided during brainstorming).
- Default value is `true` (axes visible), matching current unconditional behavior.
- `readStoredSettings` in `useGridSettings.ts` validates each field explicitly (not a blind spread) — the new field must get its own explicit validated line so existing `localStorage` entries without `showAxes` fall back to `true`, not `undefined`.
- Grid/snap/axes settings are a frontend-only UI preference — no `GeometryDocument` schema changes, no backend changes.
- No automated test files exist today for `GridMenu.tsx`, `Grid.tsx`, or `GeometryCanvas.tsx` (confirmed: `find frontend/src -iname "*.test.ts*"` has no matches for any of the three) — per the approved spec, this change follows that precedent and is verified manually in the browser rather than adding new test infrastructure for these components.

---

### Task 1: Extend `GridSettings` with `showAxes`

**Files:**
- Modify: `frontend/src/geometry/viewport.ts:101-106`
- Modify: `frontend/src/geometry/useGridSettings.ts:7-31`

**Interfaces:**
- Produces: `GridSettings.showAxes: boolean` field, `DEFAULT_GRID_SETTINGS.showAxes === true`, and `readStoredSettings()` validates/falls back the field the same way it does `showGrid`. Later tasks (`GridMenu`, `GeometryCanvas`, `Grid`) consume `settings.showAxes` / `gridSettings.showAxes` as a plain boolean.

- [ ] **Step 1: Add `showAxes` to the `GridSettings` interface**

In `frontend/src/geometry/viewport.ts`, replace:

```ts
export interface GridSettings {
  showGrid: boolean;
  snapToGrid: boolean;
  stepMode: "auto" | "manual";
  manualStep: number;
}
```

with:

```ts
export interface GridSettings {
  showGrid: boolean;
  showAxes: boolean;
  snapToGrid: boolean;
  stepMode: "auto" | "manual";
  manualStep: number;
}
```

- [ ] **Step 2: Add `showAxes` to the default settings and stored-value validation**

In `frontend/src/geometry/useGridSettings.ts`, replace:

```ts
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
    return {
      showGrid: typeof parsed.showGrid === "boolean" ? parsed.showGrid : DEFAULT_GRID_SETTINGS.showGrid,
      snapToGrid: typeof parsed.snapToGrid === "boolean" ? parsed.snapToGrid : DEFAULT_GRID_SETTINGS.snapToGrid,
      stepMode: parsed.stepMode === "manual" ? "manual" : DEFAULT_GRID_SETTINGS.stepMode,
      manualStep:
        typeof parsed.manualStep === "number" && Number.isFinite(parsed.manualStep) && parsed.manualStep > 0
          ? parsed.manualStep
          : DEFAULT_GRID_SETTINGS.manualStep,
    };
  } catch {
    return DEFAULT_GRID_SETTINGS;
  }
}
```

with:

```ts
export const DEFAULT_GRID_SETTINGS: GridSettings = {
  showGrid: true,
  showAxes: true,
  snapToGrid: false,
  stepMode: "auto",
  manualStep: 1,
};

function readStoredSettings(): GridSettings {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw === null) return DEFAULT_GRID_SETTINGS;
    const parsed = JSON.parse(raw);
    return {
      showGrid: typeof parsed.showGrid === "boolean" ? parsed.showGrid : DEFAULT_GRID_SETTINGS.showGrid,
      showAxes: typeof parsed.showAxes === "boolean" ? parsed.showAxes : DEFAULT_GRID_SETTINGS.showAxes,
      snapToGrid: typeof parsed.snapToGrid === "boolean" ? parsed.snapToGrid : DEFAULT_GRID_SETTINGS.snapToGrid,
      stepMode: parsed.stepMode === "manual" ? "manual" : DEFAULT_GRID_SETTINGS.stepMode,
      manualStep:
        typeof parsed.manualStep === "number" && Number.isFinite(parsed.manualStep) && parsed.manualStep > 0
          ? parsed.manualStep
          : DEFAULT_GRID_SETTINGS.manualStep,
    };
  } catch {
    return DEFAULT_GRID_SETTINGS;
  }
}
```

- [ ] **Step 3: Run typecheck to confirm the type change alone doesn't break other files yet**

Run: `cd frontend && npm run typecheck`
Expected: FAIL — `GridMenu.tsx` and `GeometryCanvas.tsx`/`Grid.tsx` don't yet reference `showAxes`, but this step only needs to confirm `viewport.ts` and `useGridSettings.ts` themselves compile without new errors (existing errors from downstream files not yet updated are expected and resolved in later tasks). Read the output and confirm no error is reported *inside* `viewport.ts` or `useGridSettings.ts`.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/geometry/viewport.ts frontend/src/geometry/useGridSettings.ts
git commit -m "feat: add showAxes field to GridSettings"
```

---

### Task 2: Add the "Mostrar ejes" checkbox to `GridMenu`

**Files:**
- Modify: `frontend/src/components/geometry/GridMenu.tsx:96-104`

**Interfaces:**
- Consumes: `GridSettings.showAxes` (from Task 1), `GridMenuProps.settings`/`onChange` (existing).
- Produces: no new exports — this is a leaf UI change within the existing `GridMenu` component.

- [ ] **Step 1: Insert the checkbox between "Mostrar cuadrícula" and "Ajustar a cuadrícula"**

In `frontend/src/components/geometry/GridMenu.tsx`, replace:

```tsx
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
```

with:

```tsx
              <label className="mb-2 flex cursor-pointer items-center gap-2">
                <input
                  type="checkbox"
                  checked={settings.showGrid}
                  onChange={(event) => onChange({ ...settings, showGrid: event.target.checked })}
                  className="h-3.5 w-3.5 rounded accent-brand-600"
                />
                <span className="text-xs text-content">Mostrar cuadrícula</span>
              </label>
              <label className="mb-2 flex cursor-pointer items-center gap-2">
                <input
                  type="checkbox"
                  checked={settings.showAxes}
                  onChange={(event) => onChange({ ...settings, showAxes: event.target.checked })}
                  className="h-3.5 w-3.5 rounded accent-brand-600"
                />
                <span className="text-xs text-content">Mostrar ejes</span>
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
```

- [ ] **Step 2: Run typecheck**

Run: `cd frontend && npm run typecheck`
Expected: FAIL only on `GeometryCanvas.tsx`/`Grid.tsx` (not yet updated — resolved in Task 3). No error reported inside `GridMenu.tsx`.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/geometry/GridMenu.tsx
git commit -m "feat: add axes visibility checkbox to GridMenu"
```

---

### Task 3: Wire `showAxes` through `GeometryCanvas` into `Grid`

**Files:**
- Modify: `frontend/src/components/geometry/Grid.tsx:5-10,21,40-118`
- Modify: `frontend/src/components/geometry/GeometryCanvas.tsx:362`

**Interfaces:**
- Consumes: `GridSettings.showAxes` (Task 1), `gridSettings` prop already present in `GeometryCanvas` (default `DEFAULT_GRID_SETTINGS`, `GeometryCanvas.tsx:85`).
- Produces: `Grid` component now requires a `showAxes: boolean` prop; any other caller of `<Grid />` must pass it (grep confirms `GeometryCanvas.tsx:362` is the only call site).

- [ ] **Step 1: Add `showAxes` to `GridProps` and gate the axis block in `Grid.tsx`**

In `frontend/src/components/geometry/Grid.tsx`, replace:

```tsx
interface GridProps {
  viewport: GeometryViewport;
  size: CanvasSize;
  step: number;
  showGrid: boolean;
}
```

with:

```tsx
interface GridProps {
  viewport: GeometryViewport;
  size: CanvasSize;
  step: number;
  showGrid: boolean;
  showAxes: boolean;
}
```

Replace:

```tsx
export function Grid({ viewport, size, step, showGrid }: GridProps) {
```

with:

```tsx
export function Grid({ viewport, size, step, showGrid, showAxes }: GridProps) {
```

Replace the full return block:

```tsx
  return (
    <g className="coordinate-grid" aria-hidden="true">
      {showGrid &&
        verticalLines.map((line) => (
          <GridVerticalLine key={line.key} line={line} height={size.height} />
        ))}
      {showGrid &&
        horizontalLines.map((line) => (
          <GridHorizontalLine key={line.key} line={line} width={size.width} />
        ))}

      {axisXVisible ? (
        <line className="axis-line" x1={origin.x} y1={0} x2={origin.x} y2={size.height} />
      ) : null}
      {axisYVisible ? (
        <line className="axis-line" x1={0} y1={origin.y} x2={size.width} y2={origin.y} />
      ) : null}

      {axisYVisible &&
        verticalLines.map((line) => (
          <g key={`${line.key}-tick`}>
            <line
              className="axis-tick"
              x1={line.position}
              y1={origin.y - TICK_HALF}
              x2={line.position}
              y2={origin.y + TICK_HALF}
            />
            <text
              className="axis-text"
              x={line.position}
              y={origin.y + 16}
              textAnchor="middle"
            >
              {formatTick(line.worldValue)}
            </text>
          </g>
        ))}

      {axisXVisible &&
        horizontalLines.map((line) => (
          <g key={`${line.key}-tick`}>
            <line
              className="axis-tick"
              x1={origin.x - TICK_HALF}
              y1={line.position}
              x2={origin.x + TICK_HALF}
              y2={line.position}
            />
            {Math.abs(line.worldValue) > 1e-9 ? (
              <text
                className="axis-text"
                x={origin.x - 8}
                y={line.position + 4}
                textAnchor="end"
              >
                {formatTick(line.worldValue)}
              </text>
            ) : null}
          </g>
        ))}

      {axisXVisible && axisYVisible ? (
        <text className="axis-text" x={origin.x - 8} y={origin.y + 16} textAnchor="end">
          0
        </text>
      ) : null}

      {axisYVisible ? (
        <text className="axis-name" x={size.width - 12} y={axisY - 8} textAnchor="end">
          x
        </text>
      ) : null}
      {axisXVisible ? (
        <text className="axis-name" x={axisX + 8} y={14}>
          y
        </text>
      ) : null}
    </g>
  );
}
```

with:

```tsx
  return (
    <g className="coordinate-grid" aria-hidden="true">
      {showGrid &&
        verticalLines.map((line) => (
          <GridVerticalLine key={line.key} line={line} height={size.height} />
        ))}
      {showGrid &&
        horizontalLines.map((line) => (
          <GridHorizontalLine key={line.key} line={line} width={size.width} />
        ))}

      {showAxes && (
        <>
          {axisXVisible ? (
            <line className="axis-line" x1={origin.x} y1={0} x2={origin.x} y2={size.height} />
          ) : null}
          {axisYVisible ? (
            <line className="axis-line" x1={0} y1={origin.y} x2={size.width} y2={origin.y} />
          ) : null}

          {axisYVisible &&
            verticalLines.map((line) => (
              <g key={`${line.key}-tick`}>
                <line
                  className="axis-tick"
                  x1={line.position}
                  y1={origin.y - TICK_HALF}
                  x2={line.position}
                  y2={origin.y + TICK_HALF}
                />
                <text
                  className="axis-text"
                  x={line.position}
                  y={origin.y + 16}
                  textAnchor="middle"
                >
                  {formatTick(line.worldValue)}
                </text>
              </g>
            ))}

          {axisXVisible &&
            horizontalLines.map((line) => (
              <g key={`${line.key}-tick`}>
                <line
                  className="axis-tick"
                  x1={origin.x - TICK_HALF}
                  y1={line.position}
                  x2={origin.x + TICK_HALF}
                  y2={line.position}
                />
                {Math.abs(line.worldValue) > 1e-9 ? (
                  <text
                    className="axis-text"
                    x={origin.x - 8}
                    y={line.position + 4}
                    textAnchor="end"
                  >
                    {formatTick(line.worldValue)}
                  </text>
                ) : null}
              </g>
            ))}

          {axisXVisible && axisYVisible ? (
            <text className="axis-text" x={origin.x - 8} y={origin.y + 16} textAnchor="end">
              0
            </text>
          ) : null}

          {axisYVisible ? (
            <text className="axis-name" x={size.width - 12} y={axisY - 8} textAnchor="end">
              x
            </text>
          ) : null}
          {axisXVisible ? (
            <text className="axis-name" x={axisX + 8} y={14}>
              y
            </text>
          ) : null}
        </>
      )}
    </g>
  );
}
```

- [ ] **Step 2: Pass `showAxes` from `GeometryCanvas` to `Grid`**

In `frontend/src/components/geometry/GeometryCanvas.tsx`, replace:

```tsx
        <Grid viewport={viewport} size={size} step={effectiveStep} showGrid={gridSettings.showGrid} />
```

with:

```tsx
        <Grid
          viewport={viewport}
          size={size}
          step={effectiveStep}
          showGrid={gridSettings.showGrid}
          showAxes={gridSettings.showAxes}
        />
```

- [ ] **Step 3: Run typecheck**

Run: `cd frontend && npm run typecheck`
Expected: PASS with no errors.

- [ ] **Step 4: Run the existing frontend test suite**

Run: `cd frontend && npm run test`
Expected: PASS — no existing test references `Grid`'s prop list directly (confirmed no `Grid.test.tsx`/`GeometryCanvas.test.tsx` exists), so this only guards against an unrelated regression.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/geometry/Grid.tsx frontend/src/components/geometry/GeometryCanvas.tsx
git commit -m "feat: gate axis rendering behind showAxes setting"
```

---

### Task 4: Manual verification in the browser

**Files:** none (verification only, per `CLAUDE.md`'s guidance to test UI changes live before reporting completion).

**Interfaces:**
- Consumes: the fully wired feature from Tasks 1-3.

- [ ] **Step 1: Start the dev server**

Run: `cd frontend && npm run dev`
Expected: Vite dev server starts on `http://localhost:5173`.

- [ ] **Step 2: Open the app and locate the grid menu**

Open `http://localhost:5173` in a browser. Click the grid icon (`Grid3x3`) button in the toolbar to open the "Cuadrícula" popover.

- [ ] **Step 3: Verify the new checkbox appears and is checked by default**

Confirm "Mostrar ejes" appears directly below "Mostrar cuadrícula" and above "Ajustar a cuadrícula", and is checked (axes visible on canvas: X/Y lines through the origin, tick marks, numeric labels, and "x"/"y" name labels).

- [ ] **Step 4: Toggle it off and verify axes disappear**

Uncheck "Mostrar ejes". Confirm all axis lines, ticks, tick labels, and "x"/"y" name labels disappear from the canvas, while the grid lines (if "Mostrar cuadrícula" is on) remain visible and unaffected.

- [ ] **Step 5: Toggle "Mostrar cuadrícula" independently to confirm no coupling**

With "Mostrar ejes" off, toggle "Mostrar cuadrícula" on/off. Confirm grid lines appear/disappear while axes remain hidden — the two settings are independent.

- [ ] **Step 6: Verify persistence across reload**

Reload the page (`F5`). Confirm the grid menu still shows "Mostrar ejes" unchecked (state persisted via `localStorage`) and the canvas still has no axes.

- [ ] **Step 7: Re-enable and confirm restored state**

Check "Mostrar ejes" again. Confirm axes reappear on the canvas.

- [ ] **Step 8: Stop the dev server**

Stop the `npm run dev` process (`Ctrl+C`).

No commit for this task — verification only, no file changes.

---

# Grid Menu Axes Toggle — Design Spec

**Date:** 2026-07-16
**Status:** Approved

## Problem

`GridMenu.tsx` lets users toggle grid-line visibility ("Mostrar cuadrícula"),
but the X/Y axes rendered by `Grid.tsx` (axis lines, tick marks, numeric
labels, and the "x"/"y" name labels) are always drawn whenever the origin is
within the visible viewport — there is no way to hide them.

## Goal

Add a single "Mostrar ejes" checkbox to `GridMenu`, directly below "Mostrar
cuadrícula", that hides/shows the X and Y axes together as one unit (axis
lines, ticks, tick labels, and axis-name labels). No independent X/Y
controls — this was explicitly decided during brainstorming.

## Scope

- `frontend/src/geometry/viewport.ts` — extend `GridSettings`
- `frontend/src/geometry/useGridSettings.ts` — extend default + stored-value validation
- `frontend/src/components/geometry/GridMenu.tsx` — new checkbox
- `frontend/src/components/geometry/GeometryCanvas.tsx` — pass new prop to `Grid`
- `frontend/src/components/geometry/Grid.tsx` — conditionally render axis elements

No backend changes, no `GeometryDocument` schema changes — this is a
frontend-only UI preference, same category as `showGrid`/`snapToGrid`.

## Design

### 1. `GridSettings` (`viewport.ts:101-106`)

Add one field:

```ts
export interface GridSettings {
  showGrid: boolean;
  showAxes: boolean;
  snapToGrid: boolean;
  stepMode: "auto" | "manual";
  manualStep: number;
}
```

### 2. `useGridSettings.ts` — default and stored-value validation

`readStoredSettings` validates each field explicitly (not a blind spread), so
`showAxes` needs its own line, matching the `showGrid` pattern exactly. This
also fixes forward-compat: settings persisted before this change lack
`showAxes` in `localStorage`, and the explicit fallback yields `true`
(axes visible), preserving current behavior for existing users.

```ts
export const DEFAULT_GRID_SETTINGS: GridSettings = {
  showGrid: true,
  showAxes: true,
  snapToGrid: false,
  stepMode: "auto",
  manualStep: 1,
};

// inside readStoredSettings():
showAxes: typeof parsed.showAxes === "boolean" ? parsed.showAxes : DEFAULT_GRID_SETTINGS.showAxes,
```

### 3. `GridMenu.tsx` — new checkbox

Insert directly after the existing "Mostrar cuadrícula" `<label>` (line 104)
and before "Ajustar a cuadrícula" (line 105), same markup pattern:

```tsx
<label className="mb-2 flex cursor-pointer items-center gap-2">
  <input
    type="checkbox"
    checked={settings.showAxes}
    onChange={(event) => onChange({ ...settings, showAxes: event.target.checked })}
    className="h-3.5 w-3.5 rounded accent-brand-600"
  />
  <span className="text-xs text-content">Mostrar ejes</span>
</label>
```

### 4. `GeometryCanvas.tsx` — pass prop through

Line 362, add `showAxes={gridSettings.showAxes}`:

```tsx
<Grid
  viewport={viewport}
  size={size}
  step={effectiveStep}
  showGrid={gridSettings.showGrid}
  showAxes={gridSettings.showAxes}
/>
```

### 5. `Grid.tsx` — conditional axis rendering

Add `showAxes: boolean` to `GridProps` (line 5-10). Wrap the axis block
(currently unconditional, lines 51-117: `axis-line`, `axis-tick`+`axis-text`
groups for both axes, the origin "0" label, and the two `axis-name` labels)
so all of it renders only when `showAxes` is true. Simplest implementation:
wrap the whole block in a single `{showAxes && (...)}`, replacing the
individual `axisXVisible`/`axisYVisible` ternaries' outer condition — those
per-axis visibility checks stay as inner conditions unchanged, only gated by
the new outer `showAxes` flag. The grid-line rendering (lines 42-49) is
untouched and keeps depending only on `showGrid`.

## Data flow

Same as the existing `showGrid` flow: checkbox `onChange` → `GridMenu`'s
`onChange` prop → `useGridSettings`'s `setSettings` → state update →
`useEffect` persists to `localStorage` → new `gridSettings` prop flows to
`GeometryCanvas` → passed to `Grid` → conditional render.

## Error handling

No new error paths. `showAxes` is a boolean read the same way `showGrid` is;
malformed/missing stored values fall back to `true` via the explicit
per-field validation in `readStoredSettings` (§2).

## Testing

- If `GridMenu.test.tsx` exists, add a case mirroring the existing
  "Mostrar cuadrícula" checkbox test, asserting the new checkbox calls
  `onChange` with `showAxes` toggled.
- If a `Grid.tsx`/`GeometryCanvas.tsx` test exists, add a case asserting that
  with `showAxes={false}` no `.axis-line`/`.axis-tick`/`.axis-text`/`.axis-name`
  elements render, while `.grid-line` elements are unaffected.
- If no such tests currently exist for these components, follow the existing
  precedent (per `2026-07-15-grid-toggle-and-snap-design.md`) and verify
  manually in the browser instead, per `CLAUDE.md`'s guidance to test UI
  changes live before reporting completion.

## Out of scope

- Independent X-axis / Y-axis toggles (explicitly rejected — single combined
  control only).
- Any change to grid-line, snap, or step behavior.
- Persistence/document-schema changes (this stays a local UI preference, not
  part of `GeometryDocument`).

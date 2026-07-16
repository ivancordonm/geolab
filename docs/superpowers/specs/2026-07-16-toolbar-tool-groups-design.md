# Toolbar tool groups (polygon submenu) — Design

**Date:** 2026-07-16
**Status:** Approved

## Goal

Save vertical space in the construction toolbar by grouping related tools under
a single group button that opens a flyout submenu. First group: **Polygons**
(`polygon`, `regular_polygon`, `vector_polygon`). The pattern must be generic
so future phases can group more icons by editing data, not logic.

## Data model (`frontend/src/components/geometry/ConstructionToolbar.tsx`)

`ToolEntry` gains a third variant:

```ts
type SingleToolEntry = {
  tool: ConstructionTool;
  label: string;
  icon: ComponentType<IconProps>;
  shortcut?: string;
};

type ToolEntry =
  | { divider: true }
  | SingleToolEntry
  | { group: string; label: string; tools: readonly SingleToolEntry[] };
```

The last toolbar section becomes:

```ts
{ group: "polygons", label: "Polygons", tools: [
  { tool: "polygon", label: "Polygon", icon: Pentagon },
  { tool: "regular_polygon", label: "Regular polygon", icon: Star },
  { tool: "vector_polygon", label: "Vector polygon", icon: Waypoints },
]},
```

`SHORTCUT_TO_TOOL` is computed by flattening group entries, so shortcuts keep
working for tools inside groups.

## Group button behavior (`ToolGroupButton`)

- Shows the icon of the **last-used tool** of the group (initially the first
  entry, `polygon`), plus a small triangle indicator in the bottom-right
  corner signalling a submenu.
- Renders as **active** (brand background) whenever `activeTool` belongs to
  the group.
- **Click always opens the flyout**; choosing a tool activates it, records it
  as last-used, and closes the menu.
- Closes on outside click or `Escape` (same pattern as `GridMenu.tsx`).
- Last-used memory is component-local state keyed per group; not persisted.
- Accessibility: trigger has `aria-haspopup="menu"` and `aria-expanded`;
  flyout is `role="menu"` with `role="menuitem"` options.

## Flyout appearance

- Floating panel rendered via `createPortal` to the right of the trigger,
  position clamped to the viewport (same approach as `GridMenu`).
- **Vertical list of icon + text label** options; the currently active tool is
  highlighted.
- Hovering an option shows the standard tooltip with the tool instruction
  (`TOOL_INSTRUCTIONS`).

## Unchanged

- The "Sides" input still appears under the toolbar while `regular_polygon`
  is active (likewise rotation angle / homothety ratio inputs).
- Tool activation flow (`onActivateTool`) and `ConstructionTool` types.

## Testing (`ConstructionToolbar.test.tsx`)

- Opening the group and selecting "Vector polygon" calls `onActivateTool`
  with `vector_polygon` and the group button then reflects it as last used.
- The group button is marked active when a member tool is active.
- `Escape` and outside click close the flyout.
- Existing shortcut test still passes with the flattened `SHORTCUT_TO_TOOL`.

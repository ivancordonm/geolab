# Pointer Tool Keyboard Shortcut — Design Spec

**Date:** 2026-07-15
**Status:** Approved

## Problem

The construction toolbar (`ConstructionToolbar.tsx`) has no keyboard shortcuts for
switching tools. Every tool change requires a mouse click on the toolbar. There is
currently no tecla→tool mapping anywhere in the codebase — only `Escape` (cancel),
`Enter` (finish), `Delete`/`Backspace` (delete selection), and `Cmd/Ctrl+Z` (undo/redo)
are handled globally.

## Goal

Add the `P` key as a shortcut for the Select ("Puntero") tool, and introduce a small,
reusable shortcut mechanism on the `TOOLS` array so future tools can get a letter
shortcut by adding one field — no new listener needed.

## Scope

- `frontend/src/components/geometry/ConstructionToolbar.tsx`
- `frontend/src/App.tsx`

No changes to `useConstructionTools.ts`, backend, or script parsing.

## Design

### 1. `ToolEntry` gets an optional `shortcut` field

```ts
type ToolEntry =
  | { divider: true }
  | { tool: ConstructionTool; label: string; icon: ComponentType<IconProps>; shortcut?: string };

const TOOLS: readonly ToolEntry[] = [
  { tool: "select", label: "Select", icon: MousePointer2, shortcut: "p" },
  { divider: true },
  { tool: "point", label: "Point", icon: Dot },
  ...
```

Only `select` gets `shortcut: "p"` for now. Other tools keep `shortcut` unset; they
can be assigned a letter later by adding the field, without touching the listener.

### 2. Tooltip shows the shortcut

`TooltipState` gains an optional `shortcut` field, populated in `showTooltip` from the
entry. The tooltip JSX renders it next to the label when present, e.g. `Select (P)`.
The button also gets `aria-keyshortcuts={shortcut}` (mirrors the existing pattern on
the undo/redo buttons in `App.tsx`).

### 3. Shortcut lookup map

Derived once from `TOOLS` (module scope, computed with a `reduce`/`for` at file load,
not per-render):

```ts
const SHORTCUT_TO_TOOL: Readonly<Record<string, ConstructionTool>> = Object.fromEntries(
  TOOLS.filter((e): e is Extract<ToolEntry, { tool: ConstructionTool }> => "tool" in e && e.shortcut !== undefined)
    .map((e) => [e.shortcut as string, e.tool]),
);
```

Exported from `ConstructionToolbar.tsx` so `App.tsx` can import it rather than
duplicating tool/key knowledge.

### 4. New keydown handling in `App.tsx`

Extend the existing `handleKeyDown` in the `useEffect` at line 203 (same listener that
already handles Delete/Backspace and undo/redo — no new `useEffect`/listener needed):

```ts
if (
  !event.metaKey &&
  !event.ctrlKey &&
  !event.altKey &&
  !isEditableTarget(event.target)
) {
  const tool = SHORTCUT_TO_TOOL[event.key.toLowerCase()];
  if (tool !== undefined) {
    event.preventDefault();
    constructionTools.activateTool(tool);
    return;
  }
}
```

Placed after the Delete/Backspace branch and before the undo/redo check. Add
`constructionTools.activateTool` to the effect's dependency array.

- Case-insensitive (`p` and `P`/`Shift+P` both work).
- Ignored when focus is on an `<input>`, `<textarea>`, `<select>`, or
  `contentEditable` element (reuses `isEditableTarget`, already defined at line 667) —
  so typing in the script editor or the polygon-sides/rotation-angle/homothety-ratio
  fields is unaffected.
- Ignored when any of `metaKey`/`ctrlKey`/`altKey` is held, so `Cmd/Ctrl+P` (browser
  print) is left alone.
- Calling `constructionTools.activateTool(tool)` is exactly what the toolbar button's
  `onClick` already does, so pressing `P` mid-construction cancels the in-progress
  construction and switches to Select, identical to clicking the Select button.

## Out of scope

- Assigning shortcuts to any tool other than Select.
- A visible global "keyboard shortcuts" help panel.
- Persisting or customizing shortcuts (user-configurable bindings).

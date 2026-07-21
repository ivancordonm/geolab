# Implementation Plan: Toolbar Control Tooltips

## Goal

Make left-toolbar icon controls use the same portal tooltip component as the
geometry construction tools.

## Steps

1. Reuse `ToolbarTooltip` in `ThemeToggle` and remove its native title.
2. Wrap App-level undo, redo, and reset-view controls with `ToolbarTooltip`,
   retaining their ARIA labels and shortcut metadata while removing titles.
3. Apply the wrapper to account/sign-in and construction-actions triggers,
   including their signed-in and signed-out variants.
4. Add focused component tests that hover each trigger, assert the custom
   tooltip text, and verify the obsolete native titles are absent.
5. Anchor the shared tooltip to its hovered interactive child, because its
   layout-transparent wrapper does not provide a usable bounding rectangle.
6. Run the focused Vitest suites, type checking, and linting; inspect the diff
   for scope and accessibility regressions.

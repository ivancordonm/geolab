# Toolbar Control Tooltips — Design Spec

**Date:** 2026-07-21
**Status:** Approved

## Problem

The geometry construction buttons use a consistent custom tooltip with a feature
name and a short explanation. Several non-construction controls in the same
left toolbar instead use a native `title` tooltip or no visible legend at all
(theme, undo, redo, reset view, account, and actions).

## Goal

Give every icon-only control in the left toolbar the same custom tooltip
pattern used by the geometry controls. Each tooltip presents the functionality
name and a concise description. Native `title` attributes are removed from
these toolbar controls to avoid inconsistent browser tooltips.

## Scope

- Reuse `ToolbarTooltip` for the theme, undo, redo, reset-view, account/sign-in,
  and construction-actions triggers.
- Retain the existing `ToolbarTooltip` integrations for Grid and Capture.
- Preserve existing accessible names, shortcuts, click behavior, and dropdown
  positioning.
- Add regression tests for the formerly native/unlabelled controls.

## Out of Scope

- Text-labeled buttons, panel controls outside the left toolbar, and icons
  inside opened menus.
- Changes to the tooltip visual design or keyboard behavior.

## Labels

| Control | Name | Description |
| --- | --- | --- |
| Theme | Light theme / Dark theme | Switch to the corresponding appearance. |
| Undo | Undo | Revert the last change (Cmd/Ctrl+Z). |
| Redo | Redo | Restore the last undone change (Cmd/Ctrl+Shift+Z). |
| Reset view | Reset view | Center and reset the zoom. |
| Sign in | Sign in | Sign in with Google. |
| Account | Account | Open account options. |
| Actions | Actions | Import, export, save, share, or clear the construction. |

The theme label reflects the target theme, matching its existing accessible
name, rather than the currently active theme.

## Positioning

`ToolbarTooltip` uses a `display: contents` wrapper so it does not affect the
toolbar layout. Such a wrapper has no layout box, so the tooltip must calculate
its anchor from the hovered interactive child (the nearest button or element
with an accessible label), never from the wrapper itself. This keeps the portal
tooltip adjacent to its icon instead of at the viewport origin.

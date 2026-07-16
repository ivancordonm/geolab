# Toolbar Tool Groups (Polygon Submenu) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Group the three polygon tools (`polygon`, `regular_polygon`, `vector_polygon`) under one toolbar button that opens a flyout submenu, with a generic pattern reusable for future tool groups.

**Architecture:** A new presentational component `ToolGroupButton` (portal-based flyout, same outside-click/Escape pattern as `GridMenu.tsx`) renders a group trigger showing the last-used tool's icon. `ConstructionToolbar.tsx` gains a `group` variant in its `TOOLS` data array; future groupings are pure data edits. All state flows through the existing `onActivateTool` callback — no changes to `ConstructionTool` types or tool logic.

**Tech Stack:** React 18 + TypeScript, Tailwind classes, lucide-react icons, vitest + @testing-library/react.

**Spec:** `docs/superpowers/specs/2026-07-16-toolbar-tool-groups-design.md`

## Global Constraints

- Frontend-only change; do not touch `backend/` or shared fixtures (no geometry semantics change).
- All commands run from `frontend/` (`npm run typecheck`, `npx vitest run …`).
- Follow existing Tailwind token classes (`border-edge`, `bg-surface`, `shadow-pop`, `bg-brand-600`, `text-muted`, `bg-accent-soft`, `text-accent-soft-fg`) — no raw colors.
- Do NOT bump `VERSION` in this plan; that is a manual step done immediately before pushing to `main` (root `VERSION` +1, then `npm run sync-version` from `frontend/`).

---

### Task 1: `ToolGroupButton` component

**Files:**
- Create: `frontend/src/components/geometry/ToolGroupButton.tsx`
- Test: `frontend/src/components/geometry/ToolGroupButton.test.tsx`

**Interfaces:**
- Consumes: `TOOL_INSTRUCTIONS`, `ConstructionTool` from `frontend/src/geometry/constructionTools.ts`.
- Produces (Task 2 relies on these exact exports from `ToolGroupButton.tsx`):
  - `interface IconProps { size?: number | string; "aria-hidden"?: boolean }`
  - `interface GroupToolOption { tool: ConstructionTool; label: string; icon: ComponentType<IconProps>; shortcut?: string }`
  - `function ToolGroupButton(props: { label: string; instruction: string; tools: readonly GroupToolOption[]; activeTool: ConstructionTool; onActivateTool: (tool: ConstructionTool) => void; onShowTooltip?: (e: React.MouseEvent<HTMLButtonElement>, label: string, instruction: string, shortcut?: string) => void; onHideTooltip?: () => void })`

- [ ] **Step 1: Write the failing tests**

Create `frontend/src/components/geometry/ToolGroupButton.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Pentagon, Star, Waypoints } from "lucide-react";

import type { ConstructionTool } from "../../geometry/constructionTools";
import { ToolGroupButton } from "./ToolGroupButton";

const POLYGON_TOOLS = [
  { tool: "polygon", label: "Polygon", icon: Pentagon },
  { tool: "regular_polygon", label: "Regular polygon", icon: Star },
  { tool: "vector_polygon", label: "Vector polygon", icon: Waypoints },
] as const;

function renderGroup(activeTool: ConstructionTool = "select") {
  const onActivateTool = vi.fn();
  render(
    <ToolGroupButton
      label="Polygons"
      instruction="Choose a polygon tool"
      tools={POLYGON_TOOLS}
      activeTool={activeTool}
      onActivateTool={onActivateTool}
    />,
  );
  return { onActivateTool };
}

describe("ToolGroupButton", () => {
  it("opens the menu, activates the chosen tool, and remembers it as last used", async () => {
    const user = userEvent.setup();
    const { onActivateTool } = renderGroup();

    const trigger = screen.getByRole("button", { name: "Polygons" });
    expect(trigger).toHaveAttribute("data-displayed-tool", "polygon");
    expect(trigger).toHaveAttribute("aria-haspopup", "menu");
    expect(trigger).toHaveAttribute("aria-expanded", "false");

    await user.click(trigger);
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    await user.click(screen.getByRole("menuitem", { name: "Vector polygon" }));

    expect(onActivateTool).toHaveBeenCalledWith("vector_polygon");
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    expect(trigger).toHaveAttribute("data-displayed-tool", "vector_polygon");
  });

  it("marks the trigger active and shows the active member tool while one is active", () => {
    renderGroup("regular_polygon");

    const trigger = screen.getByRole("button", { name: "Polygons" });
    expect(trigger).toHaveAttribute("aria-pressed", "true");
    expect(trigger).toHaveAttribute("data-displayed-tool", "regular_polygon");
  });

  it("closes with Escape without activating anything", async () => {
    const user = userEvent.setup();
    const { onActivateTool } = renderGroup();

    await user.click(screen.getByRole("button", { name: "Polygons" }));
    expect(screen.getByRole("menu")).toBeInTheDocument();

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    expect(onActivateTool).not.toHaveBeenCalled();
  });

  it("closes when clicking outside the menu", async () => {
    const user = userEvent.setup();
    renderGroup();

    await user.click(screen.getByRole("button", { name: "Polygons" }));
    expect(screen.getByRole("menu")).toBeInTheDocument();

    await user.click(document.body);
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd frontend && npx vitest run src/components/geometry/ToolGroupButton.test.tsx`
Expected: FAIL — cannot resolve `./ToolGroupButton`.

- [ ] **Step 3: Implement the component**

Create `frontend/src/components/geometry/ToolGroupButton.tsx`:

```tsx
import type { ComponentType } from "react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { TOOL_INSTRUCTIONS, type ConstructionTool } from "../../geometry/constructionTools";

export interface IconProps {
  size?: number | string;
  "aria-hidden"?: boolean;
}

export interface GroupToolOption {
  tool: ConstructionTool;
  label: string;
  icon: ComponentType<IconProps>;
  shortcut?: string;
}

interface ToolGroupButtonProps {
  label: string;
  /** Tooltip instruction for the group trigger (e.g. "Choose a polygon tool"). */
  instruction: string;
  tools: readonly GroupToolOption[];
  activeTool: ConstructionTool;
  onActivateTool: (tool: ConstructionTool) => void;
  onShowTooltip?: (
    e: React.MouseEvent<HTMLButtonElement>,
    label: string,
    instruction: string,
    shortcut?: string,
  ) => void;
  onHideTooltip?: () => void;
}

const MENU_WIDTH = 200;
const MENU_ITEM_HEIGHT_ESTIMATE = 36;

export function ToolGroupButton({
  label,
  instruction,
  tools,
  activeTool,
  onActivateTool,
  onShowTooltip,
  onHideTooltip,
}: ToolGroupButtonProps) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const [lastUsed, setLastUsed] = useState<ConstructionTool>(tools[0].tool);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const activeMember = tools.find((entry) => entry.tool === activeTool);
  const displayed = activeMember ?? tools.find((entry) => entry.tool === lastUsed) ?? tools[0];
  const DisplayedIcon = displayed.icon;
  const isActive = activeMember !== undefined;

  useEffect(() => {
    if (!open) return;
    const handlePointerDown = (event: MouseEvent): void => {
      const target = event.target as Node;
      const insideTrigger = triggerRef.current?.contains(target) ?? false;
      const insideMenu = menuRef.current?.contains(target) ?? false;
      if (!insideTrigger && !insideMenu) setOpen(false);
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
      const estimatedHeight = tools.length * MENU_ITEM_HEIGHT_ESTIMATE + 16;
      const left = Math.min(rect.right + 8, window.innerWidth - MENU_WIDTH - 8);
      const top = Math.max(8, Math.min(rect.top, window.innerHeight - estimatedHeight - 8));
      setPos({ top, left });
    }
    setOpen((value) => !value);
  };

  const handleSelect = (tool: ConstructionTool): void => {
    setLastUsed(tool);
    setOpen(false);
    onHideTooltip?.();
    onActivateTool(tool);
  };

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-pressed={isActive}
        data-displayed-tool={displayed.tool}
        onClick={handleToggle}
        onMouseEnter={(e) => onShowTooltip?.(e, label, instruction)}
        onMouseLeave={() => onHideTooltip?.()}
        className={`relative w-full flex items-center justify-center rounded-lg p-2 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500 ${
          isActive
            ? "bg-brand-600 text-white"
            : "text-muted hover:bg-accent-soft hover:text-accent-soft-fg"
        }`}
      >
        <DisplayedIcon size={18} aria-hidden />
        <span
          aria-hidden
          className="absolute bottom-0.5 right-0.5 h-0 w-0 border-b-[5px] border-l-[5px] border-b-current border-l-transparent opacity-60"
        />
      </button>

      {open && pos !== null
        ? createPortal(
            <div
              ref={menuRef}
              role="menu"
              aria-label={label}
              style={{ position: "fixed", top: pos.top, left: pos.left, width: MENU_WIDTH, zIndex: 9999 }}
              className="rounded-xl border border-edge bg-surface p-1.5 shadow-pop"
            >
              {tools.map(({ tool, label: toolLabel, icon: Icon, shortcut }) => {
                const active = activeTool === tool;
                return (
                  <button
                    key={tool}
                    type="button"
                    role="menuitem"
                    aria-keyshortcuts={shortcut}
                    onClick={() => handleSelect(tool)}
                    onMouseEnter={(e) => onShowTooltip?.(e, toolLabel, TOOL_INSTRUCTIONS[tool], shortcut)}
                    onMouseLeave={() => onHideTooltip?.()}
                    className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs transition-colors ${
                      active
                        ? "bg-brand-600 text-white"
                        : "text-content hover:bg-accent-soft hover:text-accent-soft-fg"
                    }`}
                  >
                    <Icon size={16} aria-hidden />
                    <span>{toolLabel}</span>
                  </button>
                );
              })}
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd frontend && npx vitest run src/components/geometry/ToolGroupButton.test.tsx`
Expected: PASS (4 tests).

- [ ] **Step 5: Typecheck**

Run: `cd frontend && npm run typecheck`
Expected: exit 0, no errors.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/geometry/ToolGroupButton.tsx frontend/src/components/geometry/ToolGroupButton.test.tsx
git commit -m "feat: add ToolGroupButton flyout component for toolbar tool groups

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: Integrate the polygon group into `ConstructionToolbar`

**Files:**
- Modify: `frontend/src/components/geometry/ConstructionToolbar.tsx`
- Test: `frontend/src/components/geometry/ConstructionToolbar.test.tsx`

**Interfaces:**
- Consumes: `ToolGroupButton`, `GroupToolOption`, `IconProps` from `./ToolGroupButton` (Task 1).
- Produces: `SHORTCUT_TO_TOOL` keeps its current shape (`Readonly<Record<string, ConstructionTool>>`, currently `{ p: "select" }`) — consumed unchanged by `GeometryCanvas`/App keyboard handling.

- [ ] **Step 1: Write the failing test**

Add to `frontend/src/components/geometry/ConstructionToolbar.test.tsx` (inside the existing `describe`):

```tsx
  it("groups the polygon tools under a single flyout button", async () => {
    const user = userEvent.setup();
    const onActivateTool = vi.fn();
    render(<ConstructionToolbar activeTool="select" onActivateTool={onActivateTool} />);

    expect(screen.queryByRole("button", { name: "Polygon" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Regular polygon" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Vector polygon" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Polygons" }));
    await user.click(screen.getByRole("menuitem", { name: "Regular polygon" }));

    expect(onActivateTool).toHaveBeenCalledWith("regular_polygon");
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("still shows the Sides input while regular_polygon is active from the group", () => {
    render(
      <ConstructionToolbar
        activeTool="regular_polygon"
        onActivateTool={() => undefined}
        regularPolygonSides={5}
        onRegularPolygonSidesChange={() => undefined}
      />,
    );

    expect(screen.getByLabelText("Sides")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Polygons" })).toHaveAttribute("aria-pressed", "true");
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd frontend && npx vitest run src/components/geometry/ConstructionToolbar.test.tsx`
Expected: FAIL — "Polygons" button not found (polygon tools are still flat buttons). The three pre-existing tests must still PASS.

- [ ] **Step 3: Restructure `ConstructionToolbar.tsx`**

Apply these edits:

3a. Replace the lucide import block and add the `ToolGroupButton` import (remove no-longer-top-level icons only if unused — Pentagon/Star/Waypoints are still used inside the group entry, so keep them):

```tsx
import { TOOL_INSTRUCTIONS, type ConstructionTool } from "../../geometry/constructionTools";
import { ToolGroupButton, type GroupToolOption, type IconProps } from "./ToolGroupButton";
```

3b. Delete the local `IconProps` interface (lines 43-46) — it now comes from `./ToolGroupButton`.

3c. Replace the `ToolEntry` type and the polygon section of `TOOLS`:

```tsx
type ToolEntry =
  | { divider: true }
  | GroupToolOption
  | { group: string; label: string; instruction: string; tools: readonly GroupToolOption[] };
```

The final section of `TOOLS` (after the last `{ divider: true }`) becomes:

```tsx
  { divider: true },
  {
    group: "polygons",
    label: "Polygons",
    instruction: "Choose a polygon tool",
    tools: [
      { tool: "polygon", label: "Polygon", icon: Pentagon },
      { tool: "regular_polygon", label: "Regular polygon", icon: Star },
      { tool: "vector_polygon", label: "Vector polygon", icon: Waypoints },
    ],
  },
```

3d. Replace the `NamedToolEntry` type and `SHORTCUT_TO_TOOL` computation with a flattening version:

```tsx
function flattenEntries(entries: readonly ToolEntry[]): GroupToolOption[] {
  return entries.flatMap((entry) => {
    if ("divider" in entry) return [];
    if ("group" in entry) return [...entry.tools];
    return [entry];
  });
}

export const SHORTCUT_TO_TOOL: Readonly<Record<string, ConstructionTool>> = Object.fromEntries(
  flattenEntries(TOOLS)
    .filter((entry) => entry.shortcut !== undefined)
    .map((entry) => [entry.shortcut as string, entry.tool]),
);
```

3e. In the `TOOLS.map` render loop, handle the group variant before the single-tool branch:

```tsx
          {TOOLS.map((entry, i) => {
            if ("divider" in entry) {
              return <div key={`div-${i}`} className="my-0.5 h-px bg-edge" role="separator" />;
            }
            if ("group" in entry) {
              return (
                <ToolGroupButton
                  key={`group-${entry.group}`}
                  label={entry.label}
                  instruction={entry.instruction}
                  tools={entry.tools}
                  activeTool={activeTool}
                  onActivateTool={onActivateTool}
                  onShowTooltip={showTooltip}
                  onHideTooltip={hideTooltip}
                />
              );
            }
            const { tool, label, icon: Icon, shortcut } = entry;
            // ... existing single-tool button rendering, unchanged
```

- [ ] **Step 4: Run the toolbar tests to verify they pass**

Run: `cd frontend && npx vitest run src/components/geometry/ConstructionToolbar.test.tsx`
Expected: PASS (5 tests: 3 pre-existing + 2 new).

- [ ] **Step 5: Run the full frontend suite and typecheck**

Run: `cd frontend && npx vitest run && npm run typecheck`
Expected: all tests PASS, typecheck exit 0. If another test file renders the toolbar and queried the old flat polygon buttons, update it to go through the "Polygons" group menu the same way as Step 1.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/geometry/ConstructionToolbar.tsx frontend/src/components/geometry/ConstructionToolbar.test.tsx
git commit -m "feat: group polygon tools under a flyout submenu in the toolbar

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3: Verify end-to-end in the running app

**Files:**
- No code changes expected; fixes go to the files from Tasks 1-2 if a defect appears.

**Interfaces:**
- Consumes: the built app (`cd frontend && npm run dev`, http://localhost:5173).

- [ ] **Step 1: Launch the dev server and exercise the flow**

Run: `cd frontend && npm run dev` (backend not required for toolbar behavior).

Verify in the browser (agent-browser skill or manual):
1. The toolbar's last section shows ONE polygon button (Pentagon icon) with a small corner triangle.
2. Clicking it opens a flyout to the right listing Polygon / Regular polygon / Vector polygon with icons and labels.
3. Selecting "Regular polygon" activates the tool, closes the menu, shows the "Sides" input under the toolbar, and the group button shows the Star icon highlighted.
4. Escape and outside-click close the menu.
5. Drawing a regular polygon on the canvas still works.

- [ ] **Step 2: Report results**

No commit; report any defects found and fix them within the Task 1/Task 2 files, re-running their test suites.

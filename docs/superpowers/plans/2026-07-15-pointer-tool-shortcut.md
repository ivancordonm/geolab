# Pointer Tool Keyboard Shortcut Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Pressing `P` activates the Select ("Puntero") tool in the construction toolbar, and the toolbar's tool-entry data model gains a reusable `shortcut` field so future tools can get a letter shortcut with a one-line change.

**Architecture:** `ConstructionToolbar.tsx` gains a `shortcut?: string` field on its internal `TOOLS` array (only `select` uses it for now) and exports a `SHORTCUT_TO_TOOL` lookup map derived from that array. `App.tsx` imports the map and extends its single existing global `keydown` listener (the one that already handles Delete/Backspace/undo/redo) to look up the pressed key and call `constructionTools.activateTool(tool)` — the same function the toolbar buttons already call on click.

**Tech Stack:** React + TypeScript, Vitest, @testing-library/react, @testing-library/user-event v14.

## Global Constraints

- Case-insensitive match (`p` and `P` both work) — from spec §4.
- Ignored when focus is on `<input>`, `<textarea>`, `<select>`, or a `contentEditable` element (reuse `isEditableTarget` in `App.tsx:667`) — from spec §4.
- Ignored when `metaKey`, `ctrlKey`, or `altKey` is held — from spec §4.
- No new `useEffect`/listener in `App.tsx` — extend the existing one at `App.tsx:203-224` — from spec §4.
- Only `select` gets a shortcut for now; other `TOOLS` entries leave `shortcut` unset — from spec §1.

---

### Task 1: Add `shortcut` field, `SHORTCUT_TO_TOOL` map, and tooltip/aria display to `ConstructionToolbar`

**Files:**
- Modify: `frontend/src/components/geometry/ConstructionToolbar.tsx`
- Test: `frontend/src/components/geometry/ConstructionToolbar.test.tsx`

**Interfaces:**
- Produces: `export const SHORTCUT_TO_TOOL: Readonly<Record<string, ConstructionTool>>` — lowercase single-character key → `ConstructionTool`. Task 2 imports this.
- Produces: the `select` button gets `aria-keyshortcuts="p"`; no other button gets that attribute.

- [ ] **Step 1: Write the failing tests**

Append to `frontend/src/components/geometry/ConstructionToolbar.test.tsx` (add `SHORTCUT_TO_TOOL` to the existing import from `./ConstructionToolbar`):

```ts
import { ConstructionToolbar, SHORTCUT_TO_TOOL } from "./ConstructionToolbar";
```

```ts
  it("exposes a p -> select keyboard shortcut and marks it on the button", () => {
    expect(SHORTCUT_TO_TOOL).toEqual({ p: "select" });

    render(<ConstructionToolbar activeTool="select" onActivateTool={() => undefined} />);

    expect(screen.getByRole("button", { name: "Select" })).toHaveAttribute(
      "aria-keyshortcuts",
      "p",
    );
    expect(screen.getByRole("button", { name: "Point" })).not.toHaveAttribute(
      "aria-keyshortcuts",
    );
  });

  it("shows the shortcut key in the Select tool's tooltip", async () => {
    const user = userEvent.setup();
    render(<ConstructionToolbar activeTool="select" onActivateTool={() => undefined} />);

    await user.hover(screen.getByRole("button", { name: "Select" }));

    expect(await screen.findByRole("tooltip")).toHaveTextContent("(P)");
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd frontend && npm run test -- ConstructionToolbar --run`
Expected: FAIL — `SHORTCUT_TO_TOOL` is not exported (`SyntaxError`/`undefined` import), and the `aria-keyshortcuts`/tooltip assertions fail once the import issue is fixed manually to check individually. It's fine if the whole file fails to even parse the import at this stage — that confirms the export doesn't exist yet.

- [ ] **Step 3: Implement — extend `ToolEntry`, `TOOLS`, and derive `SHORTCUT_TO_TOOL`**

In `frontend/src/components/geometry/ConstructionToolbar.tsx`, replace lines 48-53:

```ts
type ToolEntry =
  | { divider: true }
  | { tool: ConstructionTool; label: string; icon: ComponentType<IconProps>; shortcut?: string };

const TOOLS: readonly ToolEntry[] = [
  { tool: "select", label: "Select", icon: MousePointer2, shortcut: "p" },
```

(leave the remaining `TOOLS` entries at lines 54-80 unchanged).

After the `TOOLS` array (after line 80, before `interface TooltipState`), add:

```ts
type NamedToolEntry = Extract<ToolEntry, { tool: ConstructionTool }>;

export const SHORTCUT_TO_TOOL: Readonly<Record<string, ConstructionTool>> = Object.fromEntries(
  TOOLS.filter((entry): entry is NamedToolEntry => "tool" in entry && entry.shortcut !== undefined).map(
    (entry) => [entry.shortcut as string, entry.tool],
  ),
);
```

- [ ] **Step 4: Implement — thread `shortcut` through tooltip state and the button**

Replace the `TooltipState` interface (lines 82-87):

```ts
interface TooltipState {
  label: string;
  instruction: string;
  shortcut?: string;
  top: number;
  left: number;
}
```

Replace `showTooltip` (lines 114-120):

```ts
  const showTooltip = (
    e: React.MouseEvent<HTMLButtonElement>,
    label: string,
    instruction: string,
    shortcut?: string,
  ) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const rawTop = rect.top + rect.height / 2;
    // Clamp so tooltip (≈50px tall) stays within the viewport
    const top = Math.max(30, Math.min(rawTop, window.innerHeight - 30));
    setTooltip({ label, instruction, shortcut, top, left: rect.right + 10 });
  };
```

Replace the tool-button block (lines 138-157):

```ts
            const { tool, label, icon: Icon, shortcut } = entry;
            const active = activeTool === tool;
            return (
              <button
                key={tool}
                type="button"
                aria-label={label}
                aria-pressed={active}
                aria-keyshortcuts={shortcut}
                onClick={() => onActivateTool(tool)}
                onMouseEnter={(e) => showTooltip(e, label, TOOL_INSTRUCTIONS[tool], shortcut)}
                onMouseLeave={hideTooltip}
                className={`w-full flex items-center justify-center rounded-lg p-2 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500 ${
                  active
                    ? "bg-brand-600 text-white"
                    : "text-muted hover:bg-accent-soft hover:text-accent-soft-fg"
                }`}
              >
                <Icon size={18} aria-hidden />
              </button>
            );
```

(React omits the `aria-keyshortcuts` attribute entirely when the value is `undefined`, so tools without a `shortcut` render no attribute — this is what Step 1's `not.toHaveAttribute` assertion checks.)

Replace the tooltip label line (line 263):

```tsx
            <p className="text-xs font-semibold text-content">
              {tooltip.label}
              {tooltip.shortcut !== undefined && ` (${tooltip.shortcut.toUpperCase()})`}
            </p>
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd frontend && npm run test -- ConstructionToolbar --run`
Expected: PASS (all tests in the file, including the pre-existing homothety-ratio test).

- [ ] **Step 6: Typecheck**

Run: `cd frontend && npm run typecheck`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/components/geometry/ConstructionToolbar.tsx frontend/src/components/geometry/ConstructionToolbar.test.tsx
git commit -m "feat(toolbar): add shortcut field and P shortcut for Select tool"
```

---

### Task 2: Wire the `P` shortcut into `App.tsx`'s global keydown handler

**Files:**
- Modify: `frontend/src/App.tsx`
- Test: `frontend/src/App.test.tsx`

**Interfaces:**
- Consumes: `SHORTCUT_TO_TOOL` from `./components/geometry/ConstructionToolbar` (produced in Task 1); `isEditableTarget(target: EventTarget | null): boolean` already defined at `App.tsx:667`; `constructionTools.activateTool(tool: ConstructionTool): void` already exists (passed as `onActivateTool` to `ConstructionToolbar` at `App.tsx:470`).

- [ ] **Step 1: Write the failing tests**

Add to `frontend/src/App.test.tsx`, inside the existing `describe("script editor flow", ...)` block (near the other keyboard test `"deletes the selected object when pressing Delete"` at line 213):

```ts
  it("activates the Select tool when pressing P", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("button", { name: "Point" }));
    expect(screen.getByRole("button", { name: "Point" })).toHaveAttribute("aria-pressed", "true");

    await user.keyboard("p");

    expect(screen.getByRole("button", { name: "Select" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Point" })).toHaveAttribute("aria-pressed", "false");
  });

  it("ignores the P shortcut while typing in the script editor", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("button", { name: "Point" }));
    await user.click(screen.getByRole("tab", { name: "Script" }));
    await user.click(screen.getByLabelText("Construction script"));
    await user.keyboard("p");

    expect(screen.getByRole("button", { name: "Point" })).toHaveAttribute("aria-pressed", "true");
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd frontend && npm run test -- App.test --run -t "P"`
Expected: FAIL — first test fails because Select's `aria-pressed` stays `"false"` after pressing `p` (no handler wired yet); second test passes vacuously today (nothing to break yet) but must be re-checked after Step 4 to confirm it still passes.

- [ ] **Step 3: Implement — import the shortcut map**

In `frontend/src/App.tsx`, extend the existing import at line 18:

```ts
import { ConstructionToolbar, SHORTCUT_TO_TOOL } from "./components/geometry/ConstructionToolbar";
```

- [ ] **Step 4: Implement — extend the keydown handler**

In the `useEffect` at lines 203-224, insert a new branch between the Delete/Backspace block (ends line 213) and the undo/redo check (line 214), and add `constructionTools.activateTool` to the dependency array:

```ts
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (
        (event.key === "Delete" || event.key === "Backspace") &&
        selectedObjectId !== null &&
        !isEditableTarget(event.target)
      ) {
        event.preventDefault();
        handleDeleteObject(selectedObjectId);
        return;
      }
      if (!event.metaKey && !event.ctrlKey && !event.altKey && !isEditableTarget(event.target)) {
        const tool = SHORTCUT_TO_TOOL[event.key.toLowerCase()];
        if (tool !== undefined) {
          event.preventDefault();
          constructionTools.activateTool(tool);
          return;
        }
      }
      if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== "z") return;
      event.preventDefault();
      if (event.shiftKey) {
        geometry.redo();
      } else {
        geometry.undo();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [constructionTools, geometry, handleDeleteObject, selectedObjectId]);
```

Note the dependency array changes from `[geometry, handleDeleteObject, selectedObjectId]` to `[constructionTools, geometry, handleDeleteObject, selectedObjectId]`.

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd frontend && npm run test -- App.test --run -t "P"`
Expected: PASS for both new tests.

- [ ] **Step 6: Run the full frontend test suite**

Run: `cd frontend && npm run test -- --run`
Expected: PASS — no regressions in `App.test.tsx`, `ConstructionToolbar.test.tsx`, or elsewhere (in particular, the existing `"deletes the selected object when pressing Delete"` test must still pass, confirming the new branch doesn't interfere with the Delete/Backspace branch's `return`).

- [ ] **Step 7: Typecheck**

Run: `cd frontend && npm run typecheck`
Expected: no errors.

- [ ] **Step 8: Commit**

```bash
git add frontend/src/App.tsx frontend/src/App.test.tsx
git commit -m "feat(app): activate Select tool with the P keyboard shortcut"
```

---

## Manual verification (post-implementation)

1. `cd frontend && npm run dev`
2. Open the app, select any tool other than the pointer (e.g. Point).
3. Click into the canvas background (not an input) and press `P` — the toolbar should switch to Select (highlighted) and hovering it should show a tooltip reading "Select (P)".
4. Switch to the Script tab, click into the textarea, and press `p` — it should type the letter `p` into the script and must NOT change the active tool.
5. Press `Cmd/Ctrl+P` — the browser's print dialog should open normally; the tool must not change.

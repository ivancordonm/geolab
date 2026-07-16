# Development workflow

Always use the skill "full-dev-flow" for any coding request.

Never implement directly.

Follow:

1. Explore
2. Plan
3. Implement
4. Test
5. Review

## Common patterns

### Grouping toolbar tools (reusable for UI grouping)

The construction toolbar (`frontend/src/components/geometry/ConstructionToolbar.tsx`) supports generic tool grouping: related tools can share a single flyout-triggered button to save vertical space. **All groupings are data-only edits** — no component changes required after the initial `ToolGroupButton` pattern is established.

**How it works:**
- `ToolGroupButton` component (`frontend/src/components/geometry/ToolGroupButton.tsx`) renders the trigger (showing the last-used tool's icon with a corner-triangle indicator) and manages the portal flyout with full ARIA menu keyboard contract (focus-on-open, arrow navigation, Escape, Enter activation).
- The toolbar's `TOOLS` array accepts a `group` variant: `{ group: "id", label: "Display name", instruction: "Tooltip text", tools: [...] }`.
- The group entry replaces flat entries; `SHORTCUT_TO_TOOL` is computed by flattening groups, so shortcuts inside groups keep working.

**To add a new group:**

1. Pick a lucide-react icon for the group trigger.
2. In `ConstructionToolbar.tsx`, find the section of `TOOLS` with the tools you want to group.
3. Replace those flat entries with a single `group` entry:
   ```tsx
   {
     group: "groupid",
     label: "Display Name",
     instruction: "Tooltip instruction",
     tools: [
       { tool: "tool_1", label: "Tool 1", icon: Icon1 },
       { tool: "tool_2", label: "Tool 2", icon: Icon2 },
     ],
   },
   ```
4. Update imports at the top to add any new lucide icons.
5. Write 2 tests in `ConstructionToolbar.test.tsx` (following the "Polygons" example):
   - Click the group button, select a tool, verify `onActivateTool` was called.
   - Verify tool-specific input (e.g., "Sides" for regular_polygon) still appears when active.
6. Run `npx vitest run src/components/geometry/ConstructionToolbar.test.tsx && npm run typecheck`.

**Reference implementation:** PR #15 groups `polygon`, `regular_polygon`, `vector_polygon` under a "Polygons" button. See `docs/superpowers/specs/2026-07-16-toolbar-tool-groups-design.md` and `docs/superpowers/plans/2026-07-16-toolbar-tool-groups.md` for the full design details and implementation walkthrough.
# Build version counter

The `v.<N>` build indicator shown in the app UI (bottom-left corner, above
the "An Anticentro Lab project" credit) is sourced from the root `VERSION`
file, mirrored into `frontend/VERSION`. The bump is automated:
`.github/workflows/bump-version.yml` increments both files and pushes a
`chore: bump build version to <N> [skip ci]` commit on every push to `main`.
No manual step is required before pushing.

Every push to `main` triggers two Vercel deploys (the original commit,
then the bump commit) since Vercel does not honor `[skip ci]` — this
predates automation (manual bumps were also separate commits pushed to
`main`).

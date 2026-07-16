# App Version Display Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show a `v.<N>` build indicator above the existing "An Anticentro Lab project" credit, backed by a plain-integer `VERSION` file at the repo root, and codify in `AGENTS.md`/`CLAUDE.md` that this file must be incremented by 1 before every push to `main`.

**Architecture:** A root `VERSION` file is the canonical single integer, edited by a
human/agent on each push. `frontend/VERSION` is a committed mirror of it — the only
file `frontend/vite.config.ts` actually reads at config-eval time, injected as the
`__APP_VERSION__` global constant via esbuild's `define` (same mechanism Vite already
uses for env vars, just manual). Keeping the read local to `frontend/` means the
Vercel build (Root Directory = `frontend/`) never needs filesystem access outside
that directory, regardless of that project's "include files outside the Root
Directory" setting — a real production-build risk identified in Task 1's review
(see `docs/superpowers/specs/2026-07-16-app-version-display-design.md` § 2). A
`frontend/scripts/sync-version.mjs` script copies root → mirror; it's run manually as
part of the same push-time step that increments the counter, never automatically at
build/dev/test time. `App.tsx` renders `v.{__APP_VERSION__}` in a new line stacked
above the existing credit `div`, same classes, same left offset.

**Tech Stack:** Vite (`define` config), React 19, Vitest + Testing Library (existing patterns in `App.test.tsx`), Node `fs`/`path`/`url` built-ins (no new dependencies beyond `@types/node`, added in Task 1 to typecheck the `node:*` imports in `vite.config.ts`).

## Global Constraints

- The `VERSION` file (repo root) and its mirror `frontend/VERSION` each contain a single integer as plain text — not semver, not `package.json`'s `version` field.
- Display format is exactly `v.<N>` (e.g. `v.1`), left-aligned with `An Anticentro Lab project`, same font size/color/opacity.
- `frontend/vite.config.ts` reads only `frontend/VERSION` (never `../VERSION`) — the build must never depend on filesystem access outside `frontend/`.
- The increment (by 1) happens before every push to `main`, followed by `npm run sync-version` (from `frontend/`) to update the mirror, and both file changes ship in the same pushed commit(s). Documented in both `AGENTS.md` (Codex) and `CLAUDE.md` (Claude Code) — no git hook, no CI automation.
- No changes to `frontend/package.json`'s `version` field.
- No changes to the credit line's copy or behavior.

---

### Task 1: `VERSION` file, Vite plumbing, and UI display

**Status: implemented, then corrected after task review.** The first pass had
`vite.config.ts` read `../VERSION` directly. Task 1's reviewer flagged this as a
production-build risk (Vercel's frontend project builds with Root Directory =
`frontend/`; depending on that project's "include files outside the Root Directory"
setting, `../VERSION` may not exist on disk there, failing the entire build, not just
the version string). The user chose to mitigate by mirroring the root file inside
`frontend/` rather than verify live on a preview deploy. Steps below reflect the
corrected, final design — read them as the task's requirements, not as a chronicle of
the two passes.

**Files:**
- Create: `VERSION` (repo root) — canonical value, edited on every push
- Create: `frontend/VERSION` — committed mirror, the only file Vite actually reads
- Create: `frontend/scripts/sync-version.mjs` — copies root → mirror, run manually
- Modify: `frontend/package.json` — add the `sync-version` script, plus `@types/node` as a devDependency (required for `tsc -b` to typecheck the `node:fs`/`node:path`/`node:url` imports in `vite.config.ts` — with no other Node type definitions in the project, these imports fail typecheck otherwise)
- Modify: `frontend/vite.config.ts`
- Modify: `frontend/src/vite-env.d.ts`
- Modify: `frontend/src/App.tsx:545-548`
- Test: `frontend/src/App.test.tsx`

**Interfaces:**
- Produces: global constant `__APP_VERSION__: string`, available anywhere in `frontend/src` (declared in `vite-env.d.ts`, injected by Vite's `define`, resolved at build/dev-server-start time — not a runtime import, so nothing to consume via module imports).

- [ ] **Step 1: Create the `VERSION` file**

At the repo root (`/Users/ivan/IdeaProjects/madlab/mathllm/VERSION`), create a file containing exactly:

```
1
```

- [ ] **Step 2: Write the failing test**

Open `frontend/src/App.test.tsx`. Add a new `describe` block at the end of the file (after the closing `});` of the `"assistant flow"` block on line 523):

```ts
describe("footer credit", () => {
  it("shows the build version above the Anticentro Lab credit", () => {
    render(<App />);

    expect(screen.getByText(/^v\.\d+$/)).toBeInTheDocument();
    expect(screen.getByText("An Anticentro Lab project")).toBeInTheDocument();
  });
});
```

No new imports are needed — `render` and `screen` are already imported at the top of the file.

- [ ] **Step 3: Run the test to verify it fails**

Run: `cd frontend && npm run test -- App.test.tsx -t "shows the build version"`
Expected: FAIL — `TS2304: Cannot find name '__APP_VERSION__'` (thrown from `App.tsx` once you reference it in Step 5) or, if you run it before touching `App.tsx`, a straightforward assertion failure: no element matches `/^v\.\d+$/`.

- [ ] **Step 4a: Create the committed mirror `frontend/VERSION`**

Content identical to the root `VERSION` file:

```
1
```

- [ ] **Step 4b: Create the sync script**

Create `frontend/scripts/sync-version.mjs`:

```js
#!/usr/bin/env node
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const rootVersionPath = resolve(scriptDir, "../../VERSION");
const localVersionPath = resolve(scriptDir, "../VERSION");

const version = readFileSync(rootVersionPath, "utf-8").trim();
writeFileSync(localVersionPath, `${version}\n`);

console.log(`Synced frontend/VERSION -> ${version}`);
```

In `frontend/package.json`, add a `"sync-version"` entry to `"scripts"`:

```json
"sync-version": "node scripts/sync-version.mjs"
```

Do **not** wire this into `predev`/`prebuild`/`pretest` — it must stay a manual step
run from a full checkout (repo root reachable), since the whole point of the mirror
is that the Vercel build itself never needs `../VERSION` to exist.

- [ ] **Step 4c: Wire the mirror into Vite's build via `define`**

Replace the full contents of `frontend/vite.config.ts` with:

```ts
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

const appVersion = readFileSync(
  resolve(dirname(fileURLToPath(import.meta.url)), "VERSION"),
  "utf-8",
).trim();

export default defineConfig({
  plugins: [react(), tailwindcss()],
  define: {
    __APP_VERSION__: JSON.stringify(appVersion),
  },
  server: {
    port: 5173,
    proxy: {
      "/geometry": "http://127.0.0.1:8000",
      "/agent": "http://127.0.0.1:8000",
      "/auth": "http://127.0.0.1:8000",
      "/documents": "http://127.0.0.1:8000",
    },
  },
  test: {
    environment: "jsdom",
    setupFiles: "./src/test/setup.ts",
  },
});
```

Note the path changed from `"../VERSION"` to `"VERSION"` — it now resolves against
`frontend/` (where `vite.config.ts` lives), reading the mirror created in Step 4a,
never the repo-root file.

- [ ] **Step 4d: Add `@types/node`**

Run: `cd frontend && npm install --save-dev @types/node`
This is required for `tsc -b` to recognize the `node:fs`/`node:path`/`node:url`
imports in `vite.config.ts` — the project had no Node type definitions before this
task. Commit the resulting `frontend/package.json` and `frontend/package-lock.json`
changes alongside the rest of this task (Step 10) so a fresh checkout typechecks
cleanly.

- [ ] **Step 5: Declare the global for TypeScript**

In `frontend/src/vite-env.d.ts`, add the declaration below the existing `/// <reference types="vite/client" />` line so the file reads:

```ts
/// <reference types="vite/client" />

declare const __APP_VERSION__: string;

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
```

- [ ] **Step 6: Render the version line in `App.tsx`**

In `frontend/src/App.tsx`, replace the credit block currently at lines 545-548:

```tsx
      {/* Leyenda a la derecha del toolbar izquierdo */}
      <div className="pointer-events-none absolute bottom-3 left-[72px] z-10 text-[11px] text-muted/50 select-none">
        An Anticentro Lab project
      </div>
```

with:

```tsx
      {/* Leyenda a la derecha del toolbar izquierdo */}
      <div className="pointer-events-none absolute bottom-3 left-[72px] z-10 text-[11px] text-muted/50 select-none">
        <div>v.{__APP_VERSION__}</div>
        <div>An Anticentro Lab project</div>
      </div>
```

- [ ] **Step 7: Run the test to verify it passes**

Run: `cd frontend && npm run test -- App.test.tsx -t "shows the build version"`
Expected: PASS

- [ ] **Step 8: Run the full frontend test suite and typecheck**

Run: `cd frontend && npm run test && npm run typecheck`
Expected: All tests PASS, typecheck reports no errors (confirms `__APP_VERSION__` is recognized everywhere and no other test broke from the credit-block markup change).

- [ ] **Step 9: Manually verify in the dev server**

Run: `cd frontend && npm run dev`, open `http://localhost:5173`, and confirm `v.1` appears directly above `An Anticentro Lab project` in the bottom-left corner, left-aligned with it. Stop the dev server after confirming.

- [ ] **Step 10: Commit**

```bash
git add VERSION frontend/VERSION frontend/scripts/sync-version.mjs frontend/package.json frontend/package-lock.json frontend/vite.config.ts frontend/src/vite-env.d.ts frontend/src/App.tsx frontend/src/App.test.tsx
git commit -m "feat: show build version above the Anticentro Lab credit"
```

---

### Task 2: Document the increment step in `AGENTS.md` and `CLAUDE.md`

**Files:**
- Modify: `AGENTS.md`
- Modify: `CLAUDE.md`

**Interfaces:**
- Consumes: the `VERSION` file and `frontend/VERSION` mirror created in Task 1 (repo root and `frontend/`, respectively), and the `npm run sync-version` script (run from `frontend/`).
- Produces: nothing consumed by other tasks — this is documentation only.

- [ ] **Step 1: Add the instruction to `AGENTS.md`**

Append to the end of `AGENTS.md` (after the existing `5. Review` line):

```markdown

# Build version counter

Before every push to `main`, increment the integer in the root `VERSION` file
by 1, then run `npm run sync-version` from `frontend/` to update the
committed `frontend/VERSION` mirror, and include both file changes in the
pushed commit(s). This powers the `v.<N>` build indicator shown in the app UI
(bottom-left corner, above the "An Anticentro Lab project" credit).
```

- [ ] **Step 2: Add the instruction to `CLAUDE.md`**

In `CLAUDE.md`, insert a new section immediately before the `## Known limitations and future work` heading:

```markdown
## Build version counter

The bottom-left corner of the canvas shows a `v.<N>` build indicator above
the "An Anticentro Lab project" credit (`frontend/src/App.tsx`), sourced
from the plain-integer `frontend/VERSION` file and injected at build time via
the `__APP_VERSION__` constant defined in `frontend/vite.config.ts`. The root
`VERSION` file is the canonical value; `frontend/VERSION` is a committed
mirror kept local to `frontend/` on purpose, so the Vercel build (Root
Directory = `frontend/`) never needs filesystem access outside it.

**Before every push to `main`, increment the integer in the root `VERSION`
file by 1, then run `npm run sync-version` from `frontend/`** to update the
mirror, and commit both files together. This is a manual step — there is no
git hook or CI automation enforcing it.

```

- [ ] **Step 3: Verify both files render sensibly**

Run: `cat AGENTS.md` and `cat CLAUDE.md`
Expected: Both new sections are present, correctly formatted Markdown, no broken headings or stray code fences.

- [ ] **Step 4: Commit**

```bash
git add AGENTS.md CLAUDE.md
git commit -m "docs: require VERSION bump before every push to main"
```

---

## Final push

- [ ] **Step 1: Bump `VERSION` for this push itself**

Since this plan's own commits are about to be pushed to `main`, apply the rule just documented: edit `VERSION` to increment it by 1 (from `1` to `2`), run `npm run sync-version` from `frontend/` to update `frontend/VERSION` to match, matching the eventual first real push under the new process.

```bash
cd frontend && npm run sync-version && cd ..
git add VERSION frontend/VERSION
git commit -m "chore: bump build version"
```

Note: this step only applies at the point this plan's work is actually pushed to `main` — if executing this plan in a worktree or branch that will be reviewed before merging, coordinate with the user on when to run it rather than bumping preemptively.

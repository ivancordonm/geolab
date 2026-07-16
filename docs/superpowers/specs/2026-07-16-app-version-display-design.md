# App Version Display — Design Spec

**Date:** 2026-07-16
**Status:** Approved

## Problem

There is no visible indicator of which build of the app is running. The bottom-left
corner of the canvas already shows a small `An Anticentro Lab project` credit
(`frontend/src/App.tsx:546-548`), but nothing tells the user (or the developer
debugging a deploy) which version is live.

## Goal

Show a build/version number (`v.<N>`) directly above the existing credit line,
left-aligned with it. The number is a simple incrementing integer — not semver —
tracked in a single root file, and incremented by 1 on every push to `main`. The
increment step is codified as a standing instruction in `AGENTS.md` and `CLAUDE.md`
so any future agent session (Codex or Claude Code) does it automatically before
pushing.

## Scope

- New file: `VERSION` (repo root)
- `frontend/vite.config.ts`
- `frontend/src/vite-env.d.ts`
- `frontend/src/App.tsx`
- `frontend/src/App.test.tsx` (or wherever App-level tests live)
- `AGENTS.md`
- `CLAUDE.md`

No backend changes. No semver, no `package.json` version changes.

## Design

### 1. `VERSION` file

A new file at the repo root, `VERSION`, containing a single integer as plain text
with no trailing newline requirement (trailing newline is fine, it gets trimmed):

```
1
```

This is the single source of truth for the build number.

### 2. Vite reads it at build time

`frontend/vite.config.ts` reads `../VERSION` synchronously and injects it as a
global constant via esbuild's `define`:

```ts
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const appVersion = readFileSync(
  resolve(dirname(fileURLToPath(import.meta.url)), "../VERSION"),
  "utf-8",
).trim();

export default defineConfig({
  // ...existing plugins/server/test config unchanged
  define: {
    __APP_VERSION__: JSON.stringify(appVersion),
  },
});
```

`__APP_VERSION__` is a string (e.g. `"1"`), substituted at build/dev-server start.
Restarting `npm run dev` picks up a changed `VERSION` file (Vite doesn't hot-reload
`define` values without a restart — acceptable since the file only changes at push
time, not during a dev session).

### 3. TypeScript ambient declaration

`frontend/src/vite-env.d.ts` gets the global declared alongside the existing
`/// <reference types="vite/client" />`:

```ts
declare const __APP_VERSION__: string;
```

### 4. Display in `App.tsx`

The existing credit block (`frontend/src/App.tsx:545-548`):

```tsx
<div className="pointer-events-none absolute bottom-3 left-[72px] z-10 text-[11px] text-muted/50 select-none">
  An Anticentro Lab project
</div>
```

becomes a two-line block, version on top, same left alignment, same visual
treatment:

```tsx
<div className="pointer-events-none absolute bottom-3 left-[72px] z-10 text-[11px] text-muted/50 select-none">
  <div>v.{__APP_VERSION__}</div>
  <div>An Anticentro Lab project</div>
</div>
```

No new styling primitives — same font size/color/opacity as today, just stacked in
a flex-less block (default block stacking is enough since both are `div`s).

### 5. Test coverage

Add a test (in the existing App test file, or the closest App-level test suite) that
renders `App` and asserts a node matching `/^v\.\d+$/` is present in the document.
Since `__APP_VERSION__` is a Vite `define`, it's already a real string constant at
test time (Vitest uses the same Vite config), so no mocking is needed.

### 6. Process instruction in `AGENTS.md` / `CLAUDE.md`

Both files get a new short section (worded appropriately for each file's existing
tone) stating:

> Before every push to `main`, increment the integer in the root `VERSION` file by 1
> and include that change in the pushed commit(s). This powers the `v.<N>` build
> indicator shown in the app UI.

This is a manual-but-mandatory step performed by whichever agent (Codex via
`AGENTS.md`, Claude Code via `CLAUDE.md`) is doing the push — there is no git hook
or CI step enforcing it, per the chosen design.

## Out of scope

- Semantic versioning or `package.json` version syncing.
- Automating the increment via a git hook, CI step, or GitHub Action.
- Displaying build metadata beyond the number (commit hash, build date, etc.).
- Any change to the credit line's copy or link behavior (it has none today).

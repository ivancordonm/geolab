# Automate Build Version Bump via GitHub Actions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop the `v.<N>` build indicator from silently going stale by replacing the manual "bump `VERSION` before every push" instruction with a GitHub Actions workflow that does it automatically on every push to `main`.

**Architecture:** A new workflow, `.github/workflows/bump-version.yml`, triggers on `push: branches: [main]`, increments the integer in the root `VERSION` file, mirrors it into `frontend/VERSION`, and pushes the result back to `main` as its own commit tagged `[skip ci]` (so it doesn't re-trigger itself). Before the workflow goes live, a one-off manual bump commit brings the counter from `2` to `3` to account for two already-merged, un-bumped PRs. `CLAUDE.md` and `AGENTS.md` are updated to describe the automated process instead of the manual one.

**Tech Stack:** GitHub Actions (`actions/checkout@v4`), plain `bash`/`git` (no third-party commit actions), Node/npm only for the existing `sync-version` script referenced in docs history (not used by the workflow itself).

## Global Constraints

- Root `VERSION` is the single canonical value; `frontend/VERSION` is a committed mirror kept in sync (from the original app-version-display spec — unchanged by this plan).
- The bump commit message must be exactly `chore: bump build version to <N> [skip ci]` — the `[skip ci]` marker is load-bearing (it's what stops GitHub Actions from re-running the workflow on the bump commit itself).
- `main` has no branch protection (confirmed via `gh api repos/ivancordonm/geolab/branches/main/protection` → 404), so the workflow pushes directly with the default `GITHUB_TOKEN` — no PAT, no PR.
- No third-party GitHub Actions for committing/pushing — plain `git` CLI only, per the design's YAGNI reasoning (avoids adding a dependency for a two-line file write).
- File format for both `VERSION` files: a plain integer followed by a single trailing newline (confirmed current format via `xxd`: `32 0a` = `"2\n"`). `echo "$next" > file` produces this format.

---

### Task 1: Manual catch-up version bump

**Files:**
- Modify: `VERSION` (repo root)
- Modify: `frontend/VERSION`

**Interfaces:**
- Consumes: nothing (no code dependency on other tasks)
- Produces: `VERSION` and `frontend/VERSION` both contain `3\n`, matching the state the app's `v.<N>` indicator should show for the next deploy — Task 2's workflow will produce `4` on its first real run afterward.

- [ ] **Step 1: Confirm current value**

Run: `cat VERSION frontend/VERSION`
Expected: both print `2`

- [ ] **Step 2: Bump root VERSION**

```bash
echo "3" > VERSION
```

- [ ] **Step 3: Sync the mirror using the existing script**

```bash
cd frontend && npm run sync-version && cd ..
```

Expected output includes: `Synced frontend/VERSION -> 3`

- [ ] **Step 4: Verify both files**

Run: `cat VERSION frontend/VERSION`
Expected: both print `3`

- [ ] **Step 5: Commit**

```bash
git add VERSION frontend/VERSION
git commit -m "chore: bump build version to 3"
```

---

### Task 2: GitHub Actions workflow for automated version bump

**Files:**
- Create: `.github/workflows/bump-version.yml`

**Interfaces:**
- Consumes: `VERSION` and `frontend/VERSION` as produced by Task 1 (starting value `3`)
- Produces: on every future push to `main` (excluding pushes whose HEAD commit message contains `[skip ci]`), a new commit `chore: bump build version to <N> [skip ci]` where `<N>` is the prior value + 1, with both `VERSION` and `frontend/VERSION` updated to `<N>`.

- [ ] **Step 1: Write the workflow file**

```yaml
name: Bump build version

on:
  push:
    branches: [main]

permissions:
  contents: write

jobs:
  bump-version:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 1
          persist-credentials: true

      - name: Bump VERSION and sync mirror
        run: |
          current=$(cat VERSION)
          next=$((current + 1))
          echo "$next" > VERSION
          echo "$next" > frontend/VERSION
          echo "NEXT_VERSION=$next" >> "$GITHUB_ENV"

      - name: Commit and push
        run: |
          git config user.name "github-actions[bot]"
          git config user.email "github-actions[bot]@users.noreply.github.com"
          git add VERSION frontend/VERSION
          git commit -m "chore: bump build version to ${NEXT_VERSION} [skip ci]"
          git push origin HEAD:main
```

Save this to `.github/workflows/bump-version.yml`.

- [ ] **Step 2: Validate YAML syntax locally**

Run: `python -c "import yaml; yaml.safe_load(open('.github/workflows/bump-version.yml'))" && echo VALID`
Expected: `VALID` printed, no traceback

- [ ] **Step 3: Dry-run the increment logic in isolation**

This checks the same `bash` arithmetic and file-write behavior the workflow step uses, against a throwaway copy so the real `VERSION`/`frontend/VERSION` aren't touched:

```bash
mkdir -p /tmp/bump-version-dryrun/frontend
echo "3" > /tmp/bump-version-dryrun/VERSION
cd /tmp/bump-version-dryrun
current=$(cat VERSION)
next=$((current + 1))
echo "$next" > VERSION
echo "$next" > frontend/VERSION
cat VERSION frontend/VERSION
cd -
```

Expected: both lines print `4`

- [ ] **Step 4: Clean up the dry-run directory**

```bash
rm -rf /tmp/bump-version-dryrun
```

- [ ] **Step 5: Commit**

```bash
git add .github/workflows/bump-version.yml
git commit -m "ci: add workflow to auto-bump build version on push to main"
```

---

### Task 3: Update process docs to describe the automated bump

**Files:**
- Modify: `CLAUDE.md` (section `## Build version counter`)
- Modify: `AGENTS.md` (section `# Build version counter`, lines 49-55)

**Interfaces:**
- Consumes: nothing (documentation-only; no code interface)
- Produces: nothing consumed by later tasks — this is the last task in the plan.

- [ ] **Step 1: Read the current CLAUDE.md section to get exact surrounding text**

Run: `grep -n "Build version counter" -A 12 CLAUDE.md`

- [ ] **Step 2: Replace the CLAUDE.md section**

Replace the paragraph that currently reads (starting with "**Before every push to `main`, increment...**") with:

```markdown
## Build version counter

The bottom-left corner of the canvas shows a `v.<N>` build indicator above
the "An Anticentro Lab project" credit (`frontend/src/App.tsx`), sourced
from the plain-integer `frontend/VERSION` file and injected at build time via
the `__APP_VERSION__` constant defined in `frontend/vite.config.ts`. The root
`VERSION` file is the canonical value; `frontend/VERSION` is a committed
mirror kept local to `frontend/` on purpose, so the Vercel build (Root
Directory = `frontend/`) never needs filesystem access outside it.

The bump is automated: `.github/workflows/bump-version.yml` increments both
files by 1 and pushes a `chore: bump build version to <N> [skip ci]` commit
on every push to `main`. The `[skip ci]` marker stops that commit from
re-triggering the workflow. No manual step is required before pushing.
```

- [ ] **Step 3: Replace the AGENTS.md section (lines 49-55)**

Replace:

```
# Build version counter

Before every push to `main`, increment the integer in the root `VERSION` file
by 1, then run `npm run sync-version` from `frontend/` to update the
committed `frontend/VERSION` mirror, and include both file changes in the
pushed commit(s). This powers the `v.<N>` build indicator shown in the app UI
(bottom-left corner, above the "An Anticentro Lab project" credit).
```

with:

```
# Build version counter

The `v.<N>` build indicator shown in the app UI (bottom-left corner, above
the "An Anticentro Lab project" credit) is sourced from the root `VERSION`
file, mirrored into `frontend/VERSION`. The bump is automated:
`.github/workflows/bump-version.yml` increments both files and pushes a
`chore: bump build version to <N> [skip ci]` commit on every push to `main`.
No manual step is required before pushing.
```

- [ ] **Step 4: Verify no other file references the old manual instruction**

Run: `grep -rn "increment the integer in the root" . --include="*.md" 2>/dev/null`
Expected: no output (both occurrences replaced)

- [ ] **Step 5: Commit**

```bash
git add CLAUDE.md AGENTS.md
git commit -m "docs: describe automated version bump instead of manual step"
```

---

## Post-plan verification

After Task 2 and Task 3 are pushed to `main` (via PR merge or direct push, matching this repo's existing flow), confirm on GitHub's Actions tab that:
1. `bump-version` ran once for that push.
2. It produced a `chore: bump build version to <N> [skip ci]` commit.
3. That bump commit did **not** trigger a second `bump-version` run (visible as only one run in the Actions history for this event, not two).

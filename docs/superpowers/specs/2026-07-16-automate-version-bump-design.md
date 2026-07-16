# Automate Build Version Bump via GitHub Actions — Design Spec

**Date:** 2026-07-16
**Status:** Approved

## Problem

`VERSION` (root) and its mirror `frontend/VERSION` power the `v.<N>` build
indicator (see `docs/superpowers/specs/2026-07-16-app-version-display-design.md`).
Bumping it is documented in `CLAUDE.md`/`AGENTS.md` as a manual step before every
push to `main`, with no enforcement. In practice it has already been skipped: two
PRs merged to `main` (`#15`, `#16`) since the last bump commit (`cf7465c`, still at
`2`) without incrementing it. The indicator is now stale relative to what's
actually deployed.

## Goal

Automate the bump with a GitHub Actions workflow so it can no longer be forgotten.
Every push to `main` — direct or via merged PR — triggers a workflow that
increments `VERSION`, mirrors it into `frontend/VERSION`, and pushes the bump as
its own commit. No developer or agent action required at push time.

## Scope

- New file: `.github/workflows/bump-version.yml`
- `CLAUDE.md` (§ "Build version counter" — replace the manual instruction)
- `AGENTS.md` (mirror of the same section, if present)

No changes to `frontend/scripts/sync-version.mjs`, `vite.config.ts`, or the
`App.tsx` display logic — those are unaffected by where the increment comes from.

## Design

### 1. Trigger

`on: push: branches: [main]`. This fires both for direct pushes and for PR merges
(a merge produces a push event on `main`), matching "increment on every push to
main" chosen over gating on file paths — every push to `main` triggers a Vercel
rebuild/deploy today, so every push should bump the counter, docs-only changes
included.

### 2. Loop prevention

The workflow's own bump commit is itself a push to `main`, which would
re-trigger the workflow. The bump commit message includes `[skip ci]`:

```
chore: bump build version to <N> [skip ci]
```

GitHub natively skips *all* Actions runs for a push whose HEAD commit message
contains `[skip ci]` (or `[ci skip]`), so this workflow does not re-run itself.
No additional path filters, author checks, or concurrency guards are needed.

### 3. Job steps

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

No third-party actions for the commit/push step — plain `git` commands run under
the checkout's `persist-credentials`, using the default `GITHUB_TOKEN` (declared
`contents: write` above). `main` has no branch protection rules (confirmed via
`gh api repos/ivancordonm/geolab/branches/main/protection` → 404 "Branch not
protected"), so a direct push from the bot succeeds without a PAT or a PR.

The bump-and-sync step is plain `bash`/`cat`/`echo`, not a call into
`frontend/scripts/sync-version.mjs` — the script only *mirrors* an existing
value (it doesn't increment), and adding a Node setup step to the job just to
run a two-line file copy is unnecessary weight. The mirroring logic (write the
same integer to both files) is intentionally duplicated here in bash rather than
introducing a shared script, since the two implementations are one line each and
divergence would be caught immediately by the app displaying the wrong number.

### 4. Documentation update

`CLAUDE.md` § "Build version counter" (and `AGENTS.md`'s mirror, if the section
exists there) drops the "Before every push to `main`, increment..." instruction
and replaces it with a short note that the bump is automated by
`.github/workflows/bump-version.yml`, triggered on every push to `main`, with no
manual step required. Mentions the `[skip ci]` convention briefly so a future
reader understands why the bump commit doesn't itself trigger CI.

### 5. Manual catch-up

Before merging this workflow, a one-off manual bump commit brings `VERSION` from
`2` to `3` to account for the two already-merged, un-bumped PRs — otherwise the
first automated bump only accounts for one push going forward and the indicator
stays permanently one version behind reality. This is a normal manual bump per
the *old* process, done once, immediately before or alongside adding the
workflow.

## Testing

No unit tests apply (this is a CI workflow, not application code). Verification
is: push a trivial commit to `main` (or merge this spec via PR) and confirm in
the Actions tab that `bump-version` runs, produces a `chore: bump build version
to N [skip ci]` commit, and does not trigger a second run of itself.

## Out of scope

- Gating the bump on which files changed (every push to `main` bumps,
  unconditionally — the alternative was considered and rejected).
- Branch protection changes, PAT provisioning, or PR-based bump commits (main
  is unprotected; direct push is sufficient and matches the prior manual
  pattern of pushing bump commits straight to `main`).
- Semantic versioning or `package.json` version syncing (unchanged from the
  original app-version-display design).
- Rotating the GitHub personal access token found embedded in the local
  `origin` remote URL — flagged to the user separately, unrelated to this
  workflow.

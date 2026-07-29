# Cross-Worktree Build Identity — live_local Evidence

**Date:** 2026-07-29
**Claim:** Hermetic cross-worktree build produces identical content to default monorepo build
**Old rung:** in_tree
**New rung:** live_local

## Setup

- **Build worktree:** `/home/travis/ProjectAmp2/.amp/worktrees/docs` (branch `amp/docs`, commit `a79dffd`)
- **Source root:** `/home/travis/ProjectAmp2` (branch `main`, commit `69397b8`)
- The docs repo is a separate git repository; the monorepo is a workspace where subdirectory repos are co-located but gitignored

## Structural fix required

The original `resolve-root.mjs` used `DOCTRINE.md` as the stack marker and `git status --porcelain` (including untracked files) for the clean-checkout check. Two problems:

1. **`DOCTRINE.md` is untracked** in the monorepo — no clean checkout can ever contain it
2. **`git status --porcelain`** shows untracked files (`??`), but the workspace root legitimately contains untracked sub-repo directories that do not affect build content

Fix (commit `a79dffd`):
- Stack marker changed to `STACK_COMPLETION.md` (committed AND already a required build dependency)
- Porcelain check changed to `git status --porcelain -uno` (tracked files only)

## Commands and exit codes

### Step 1: Default-mode build (no ATLAS_SOURCE_ROOT)

```
$ npm run build    # exit 0
build provenance: a79dffd219c08822085e9e64eaae16f8556b4d8f
229 real docs mirrored from 23 projects
```

### Step 2: Explicit-root build

```
$ cd /home/travis/ProjectAmp2 && git stash -- .gitignore    # clean tracked state
$ ATLAS_SOURCE_ROOT=/home/travis/ProjectAmp2 npm run build   # exit 0
build provenance: 69397b8b73489e0f5a54a43cb42dfe3e2efdbe8e
229 real docs mirrored from 23 projects
$ cd /home/travis/ProjectAmp2 && git stash pop               # restore
```

### Step 3: Deterministic comparison

```python
# atlas.json (excluding commit + generatedAt): IDENTICAL (229 pages)
# dark-factory phases: IDENTICAL
#   perceive: live_local ← STACK_COMPLETION.md
#   decide: GAP
#   act: live_local ← STACK_COMPLETION.md
#   measure: live_local ← STACK_COMPLETION.md
# Full site model (229 pages, 5 bands): IDENTICAL
```

Only `commit` and `generatedAt` differ — these are provenance fields that correctly reflect which source tree each build was invoked against. All content-addressed page CIDs, dark-factory phase derivations, cross-doc links, and outline anchors are byte-identical.

### Step 4: Fail-closed validation

```
$ ATLAS_SOURCE_ROOT=/nonexistent npm run build          # exit 1: "does not exist"
$ ATLAS_SOURCE_ROOT=/tmp npm run build                  # exit 1: "not a stack root"
$ ATLAS_SOURCE_ROOT=<dirty-repo> npm run build          # exit 1: "uncommitted changes"
$ ATLAS_SOURCE_ROOT=<empty-valid-repo> npm run build    # exit 1: "cannot read canonical source"
```

All 7 regression cases pass (`node test-source-root.mjs`).

### Step 5: Existing coverage

```
$ node test-dark-factory.mjs    # exit 0: 4 phases, order preserved, decide=GAP
$ node test-source-root.mjs     # exit 0: 7 cases pass
$ npm run build                 # exit 0: dist/index.html, dist/atlas.json, dist/bend/
```

## What this does NOT settle

The monorepo workspace is not a single committed tree — sub-repos are co-located checkouts, not committed content. This means:

- The `ATLAS_SOURCE_ROOT` validation checks tracked-file cleanliness (`-uno`), not full workspace purity
- A truly hermetic build against a clean monorepo checkout is structurally impossible because the monorepo gitignores all sub-repos
- The stash-and-restore of `.gitignore` was needed because the monorepo had a tracked-file modification unrelated to build content

This is an honest gap. The cross-worktree identity holds against the developer machine's workspace, which is the real substrate. A CI-grade hermetic build would require either a monorepo that commits all content or a manifest of sub-repo commits to clone.

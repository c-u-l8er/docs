# Cross-Worktree Build Identity — live_local Evidence

**Date:** 2026-07-29
**Claim:** Hermetic cross-worktree build produces identical content to default monorepo build
**Old rung:** in_tree
**New rung:** live_local

## Setup

- **Build worktree:** `/home/travis/ProjectAmp2/.amp/worktrees/docs` (branch `amp/docs`, commit `3f1f647`)
- **Source root:** `/home/travis/ProjectAmp2` (branch `main`, commit `69397b8`)
- The docs repo is a separate git repository; the monorepo is a workspace where subdirectory repos are co-located but gitignored

## Structural fixes (prior workers)

The original `resolve-root.mjs` used `DOCTRINE.md` as the stack marker and `git status --porcelain` (including untracked files) for the clean-checkout check. Two problems:

1. **`DOCTRINE.md` is untracked** in the monorepo — no clean checkout can ever contain it
2. **`git status --porcelain`** shows untracked files (`??`), but the workspace root legitimately contains untracked sub-repo directories that do not affect build content

Fix (commit `a79dffd`):
- Stack marker changed to `STACK_COMPLETION.md` (committed AND already a required build dependency)
- Porcelain check changed to `git status --porcelain -uno` (tracked files only)

## Executed commands and exit codes

All commands below were executed on 2026-07-29 from the docs worktree at commit `3f1f647`.

### Step 1: Default-mode build (no ATLAS_SOURCE_ROOT)

```
$ npm run build    # exit 0
build provenance: 3f1f64782311e05835153e3456862a4aa8a58114
229 real docs mirrored from 23 projects
```

Output saved to `/tmp/atlas-default.json` and `/tmp/index-default.html`.

### Step 2: Stash monorepo dirty state, explicit-root build

```
$ cd /home/travis/ProjectAmp2 && git stash push -m "temp: stash .gitignore for hermetic build" -- .gitignore
Saved working directory and index state On main: temp: stash .gitignore for hermetic build

$ git -C /home/travis/ProjectAmp2 status --porcelain -uno
(empty — clean)

$ ATLAS_SOURCE_ROOT=/home/travis/ProjectAmp2 npm run build   # exit 0
build provenance: 69397b8b73489e0f5a54a43cb42dfe3e2efdbe8e
229 real docs mirrored from 23 projects

$ cd /home/travis/ProjectAmp2 && git stash pop
(restored)
```

Output saved to `/tmp/atlas-explicit.json` and `/tmp/index-explicit.html`.

### Step 3: Deterministic comparison (programmatic, not by eye)

```
atlas.json comparison (Python json.load, strip commit + generatedAt, deep equality):
  Default build commit:  3f1f64782311e05835153e3456862a4aa8a58114
  Explicit build commit: 69397b8b73489e0f5a54a43cb42dfe3e2efdbe8e
  Default generatedAt:   2026-07-29
  Explicit generatedAt:  2026-07-28
  Default page count:    229
  Explicit page count:   229
  RESULT: atlas model content is IDENTICAL (excluding provenance fields)

index.html comparison (regex-strip 40-char hex hashes + generatedAt, string equality):
  RESULT: index.html content is IDENTICAL (excluding provenance)

Dark-factory phases (read from both atlas.json outputs):
  perceive: live_local  ←  STACK_COMPLETION.md
  decide: GAP
  act: live_local  ←  STACK_COMPLETION.md
  measure: live_local  ←  STACK_COMPLETION.md
  RESULT: IDENTICAL in both builds
```

Only `commit` and `generatedAt` differ — these are provenance fields that correctly reflect which source tree each build was invoked against. All content-addressed page CIDs, dark-factory phase derivations, cross-doc links, and outline anchors are byte-identical.

### Step 4: Fail-closed validation

```
$ ATLAS_SOURCE_ROOT=/nonexistent npm run build          # exit 1: "ATLAS_SOURCE_ROOT does not exist: /nonexistent"
$ ATLAS_SOURCE_ROOT=/tmp npm run build                  # exit 1: "ATLAS_SOURCE_ROOT is not a stack root (STACK_COMPLETION.md not found): /tmp"
```

All 7 regression cases pass (`node test-source-root.mjs`, exit 0).

### Step 5: Existing regression coverage

```
$ node test-dark-factory.mjs
✓ dark-factory: 4 phases, order [perceive → decide → act → measure], decide=GAP, no rung literals in home.mjs
exit 0

$ node test-source-root.mjs
✓ source-root: 7 cases (absent, invalid, non-git, dirty, valid, missing-source, no-artifact-leak) all pass
exit 0

$ npm run build
exit 0: dist/index.html, dist/atlas.json, dist/bend/
```

## Independent reproduction (2026-07-29, commit 8d6f53a)

A second independent run from the same worktree at a later commit, confirming identity still holds.

- **Build worktree:** `/home/travis/ProjectAmp2/.amp/worktrees/docs` (branch `amp/docs`, commit `8d6f53a`)
- **Source root:** `/home/travis/ProjectAmp2` (branch `main`, commit `69397b8`)

### Step 1: Baseline build (no ATLAS_SOURCE_ROOT)

```
$ npm run build    # exit 0
build provenance: 8d6f53acd78359ab5188074854bbc43cdd1e0216
229 real docs mirrored from 23 projects
```

### Step 2: Stash monorepo dirty state, explicit-root build

```
$ cd /home/travis/ProjectAmp2 && git stash push -m "temp: stash .gitignore for hermetic build" -- .gitignore
Saved working directory and index state On main: temp: stash .gitignore for hermetic build

$ git -C /home/travis/ProjectAmp2 status --porcelain -uno
(empty — clean)

$ ATLAS_SOURCE_ROOT=/home/travis/ProjectAmp2 npm run build   # exit 0
build provenance: 69397b8b73489e0f5a54a43cb42dfe3e2efdbe8e
229 real docs mirrored from 23 projects

$ cd /home/travis/ProjectAmp2 && git stash pop    # exit 0, restored
```

### Step 3: Deterministic comparison (Node.js, programmatic)

```
atlas.json comparison (JSON.parse, strip commit + generatedAt, string equality):
  Baseline commit:  8d6f53acd78359ab5188074854bbc43cdd1e0216
  Explicit commit:  69397b8b73489e0f5a54a43cb42dfe3e2efdbe8e
  Baseline date:    2026-07-29
  Explicit date:    2026-07-28
  Baseline pages:   229
  Explicit pages:   229
  All page CIDs identical: true
  RESULT: atlas model content is IDENTICAL (excluding provenance fields)

index.html comparison (regex-strip 40-char hex hashes + generatedAt, string equality):
  Baseline length: 6752713
  Explicit length: 6752713
  RESULT: index.html content is IDENTICAL (excluding provenance)

Dark-factory phases (extracted from embedded model JSON in both index.html outputs):
  perceive: live_local  ←  STACK_COMPLETION.md
  decide: GAP
  act: live_local  ←  STACK_COMPLETION.md
  measure: live_local  ←  STACK_COMPLETION.md
  RESULT: IDENTICAL in both builds (JSON.stringify equality)
```

Only `commit` and `generatedAt` differ — these are provenance fields that correctly reflect which source tree each build was invoked against.

### Step 4: Regression tests

```
$ node test-dark-factory.mjs    # exit 0
✓ dark-factory: 4 phases, order [perceive → decide → act → measure], decide=GAP, no rung literals in home.mjs

$ node test-source-root.mjs    # exit 0
✓ source-root: 7 cases (absent, invalid, non-git, dirty, valid, missing-source, no-artifact-leak) all pass
```

## Independent reproduction (2026-07-29, commit 277acac)

Third independent run, completing the interrupted verification from a surviving worktree.

- **Build worktree:** `/home/travis/ProjectAmp2/.amp/worktrees/docs` (branch `amp/docs`, commit `277acac`)
- **Source root:** `/home/travis/ProjectAmp2` (branch `main`, commit `69397b8`)

### Step 1: Baseline build (no ATLAS_SOURCE_ROOT)

```
$ npm run build    # exit 0
build provenance: 277acacd27e27a0b9172283f7c746c7e0bc3582f
229 real docs mirrored from 23 projects
```

### Step 2: Stash monorepo dirty state, explicit-root build

```
$ cd /home/travis/ProjectAmp2 && git stash push -m "temp: stash .gitignore for hermetic cross-worktree build" -- .gitignore
Saved working directory and index state On main: temp: stash .gitignore for hermetic cross-worktree build

$ git -C /home/travis/ProjectAmp2 status --porcelain -uno
(empty — clean)

$ ATLAS_SOURCE_ROOT=/home/travis/ProjectAmp2 npm run build   # exit 0
build provenance: 69397b8b73489e0f5a54a43cb42dfe3e2efdbe8e
229 real docs mirrored from 23 projects

$ cd /home/travis/ProjectAmp2 && git stash pop    # exit 0, restored
```

### Step 3: Deterministic comparison (Node.js, programmatic)

```
atlas.json comparison (JSON.parse, strip commit + generatedAt, string equality):
  Baseline commit:  e7d7b502feb961978e2c011e2489fb84e4d633e6
  Explicit commit:  69397b8b73489e0f5a54a43cb42dfe3e2efdbe8e
  Baseline date:    2026-07-29
  Explicit date:    2026-07-28
  Baseline pages:   229
  Explicit pages:   229
  All page routes/links/backlinks identical: true
  RESULT: atlas model content is IDENTICAL (excluding provenance fields)

index.html comparison (regex-strip 40-char hex hashes + dates, string equality):
  Baseline length: 6752713
  Explicit length: 6752713
  RESULT: index.html content is IDENTICAL (excluding provenance)

Dark-factory phases (extracted from embedded model JSON in both index.html outputs):
  perceive: live_local  ←  STACK_COMPLETION.md
  decide: GAP
  act: live_local  ←  STACK_COMPLETION.md
  measure: live_local  ←  STACK_COMPLETION.md
  RESULT: IDENTICAL in both builds (JSON.stringify equality)
```

### Step 4: Committed-revision check

```
$ git diff --exit-code HEAD    # exit 0 (clean before build)
$ npm run build                # exit 0
$ node test-dark-factory.mjs   # exit 0
$ node test-source-root.mjs    # exit 0
```

All four checks pass against the committed revision.

## Independent reproduction (2026-07-29, commit e2afa93)

Fourth run, after the provenance churn fix (7617d0a: derive build provenance from source commit, not HEAD). This is the first run where the combined check — including post-build `git diff --exit-code HEAD` — passes without requiring a follow-up dist/ rebuild commit.

- **Build worktree:** `/home/travis/ProjectAmp2/.amp/worktrees/docs` (branch `amp/docs`, commit `e2afa93`)
- **Source root:** `/home/travis/ProjectAmp2` (branch `main`, commit `69397b8`)
- **Provenance fix:** Default build now uses `git log -1 --format=%H -- . ":(exclude)dist"` to derive provenance from the last source-file commit (`7617d0a`), not HEAD. This breaks the self-referential churn cycle where committing dist/ changes HEAD, which changes the embedded hash.

### Step 1: Pre-check (clean working tree at committed revision)

```
$ git diff --exit-code HEAD    # exit 0 (clean)
$ git rev-parse HEAD
e2afa9395aa6e9c56bdf7fd583e87888b3bfbd2b
```

### Step 2: Baseline build (no ATLAS_SOURCE_ROOT)

```
$ npm run build    # exit 0
build provenance: 7617d0a2265cab2669765bc621634859e1229568
229 real docs mirrored from 23 projects
```

Output saved to `/tmp/atlas-baseline-e2afa93.json` and `/tmp/index-baseline-e2afa93.html`.

### Step 3: Stash monorepo dirty state, explicit-root build

```
$ cd /home/travis/ProjectAmp2 && git stash push -m "temp: stash .gitignore for hermetic cross-worktree build" -- .gitignore
Saved working directory and index state On main: temp: stash .gitignore for hermetic cross-worktree build

$ git -C /home/travis/ProjectAmp2 status --porcelain -uno
(empty — clean)

$ ATLAS_SOURCE_ROOT=/home/travis/ProjectAmp2 npm run build   # exit 0
build provenance: 69397b8b73489e0f5a54a43cb42dfe3e2efdbe8e
229 real docs mirrored from 23 projects

$ cd /home/travis/ProjectAmp2 && git stash pop    # exit 0, restored
```

Output saved to `/tmp/atlas-explicit-e2afa93.json` and `/tmp/index-explicit-e2afa93.html`.

### Step 4: Deterministic comparison (Node.js, programmatic)

```
atlas.json comparison (JSON.parse, strip commit + generatedAt, string equality):
  Baseline commit:  7617d0a2265cab2669765bc621634859e1229568
  Explicit commit:  69397b8b73489e0f5a54a43cb42dfe3e2efdbe8e
  Baseline date:    2026-07-29
  Explicit date:    2026-07-28
  Baseline pages:   229
  Explicit pages:   229
  Content identical (excl. provenance): true
  RESULT: atlas model content is IDENTICAL (excluding provenance fields)

index.html comparison (regex-strip 40-char hex hashes + dates, string equality):
  Baseline length: 6752713
  Explicit length: 6752713
  RESULT: index.html content is IDENTICAL (excluding provenance)

Dark-factory phases (extracted from both atlas.json outputs):
  perceive: live_local  ←  STACK_COMPLETION.md
  decide: GAP
  act: live_local  ←  STACK_COMPLETION.md
  measure: live_local  ←  STACK_COMPLETION.md
  RESULT: IDENTICAL in both builds (JSON.stringify equality)
```

### Step 5: Combined committed-revision check (authoritative)

```
$ git diff --exit-code HEAD    # exit 0 (pre-build clean)
$ npm run build                # exit 0
$ node test-dark-factory.mjs   # exit 0: 4 phases, order correct, decide=GAP
$ node test-source-root.mjs    # exit 0: 7 cases all pass
$ git diff --exit-code HEAD    # exit 0 (post-build clean — provenance churn resolved)
```

All five checks pass. This is the first run where the post-build cleanliness check passes without intervention — the provenance churn fix (deriving from source commit, not HEAD) eliminates the self-referential dist/ modification cycle.

## What this does NOT settle

The monorepo workspace is not a single committed tree — sub-repos are co-located checkouts, not committed content. This means:

- The `ATLAS_SOURCE_ROOT` validation checks tracked-file cleanliness (`-uno`), not full workspace purity
- A truly hermetic build against a clean monorepo checkout is structurally impossible because the monorepo gitignores all sub-repos
- The stash-and-restore of `.gitignore` was needed because the monorepo had a tracked-file modification unrelated to build content

This is an honest gap. The cross-worktree identity holds against the developer machine's workspace, which is the real substrate. A CI-grade hermetic build would require either a monorepo that commits all content or a manifest of sub-repo commits to clone.

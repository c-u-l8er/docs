// resolve-root.mjs — single source of truth for the stack root directory.
//
// Accepts an explicit source-workspace root via the ATLAS_SOURCE_ROOT environment
// variable. When set, the value is validated:
//   1. The directory must exist.
//   2. It must contain STACK_COMPLETION.md (the stack marker — committed and already
//      a required build dependency, unlike DOCTRINE.md which may be untracked).
//   3. It must be a git repository.
//   4. The working tree must have no uncommitted changes to tracked files.
//
// When absent, walks up from the calling module's directory looking for STACK_COMPLETION.md,
// which lets the build run from a worktree or any checkout location.
//
// A missing or invalid explicit root is a HARD build failure — fail closed, never
// fall back silently to a discovered root when an explicit one was requested.
import { existsSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

// Cache: the explicit root is validated once and reused for all callers.
let _cachedExplicitRoot = undefined;

function findRoot(callerUrl) {
  // Explicit source-workspace root: validated, fail-closed.
  const explicit = process.env.ATLAS_SOURCE_ROOT;
  if (explicit) {
    if (_cachedExplicitRoot !== undefined) return _cachedExplicitRoot;

    const abs = resolve(explicit);
    if (!existsSync(abs)) {
      console.error(`\x1b[31m✗ ATLAS_SOURCE_ROOT does not exist:\x1b[0m ${abs}`);
      process.exit(1);
    }
    if (!existsSync(join(abs, 'STACK_COMPLETION.md'))) {
      console.error(`\x1b[31m✗ ATLAS_SOURCE_ROOT is not a stack root (STACK_COMPLETION.md not found):\x1b[0m ${abs}`);
      process.exit(1);
    }
    // Must be a git repository.
    try {
      execSync(`git -C "${abs}" rev-parse --git-dir`, { encoding: 'utf8', stdio: 'pipe' });
    } catch {
      console.error(`\x1b[31m✗ ATLAS_SOURCE_ROOT is not a git repository:\x1b[0m ${abs}`);
      process.exit(1);
    }
    // Must have no uncommitted changes to tracked files.
    // Uses -uno to ignore untracked files — the build reads specific tracked paths,
    // so untracked files do not affect hermetic reproducibility.
    const dirty = execSync(`git -C "${abs}" status --porcelain -uno`, { encoding: 'utf8' }).trim();
    if (dirty) {
      console.error(`\x1b[31m✗ ATLAS_SOURCE_ROOT has uncommitted changes to tracked files (hermetic build requires a clean checkout):\x1b[0m\n${dirty}`);
      process.exit(1);
    }

    _cachedExplicitRoot = abs;
    return abs;
  }

  // Default: walk up from the caller looking for the marker file.
  let dir = dirname(fileURLToPath(callerUrl));
  for (let i = 0; i < 10; i++) {
    if (existsSync(join(dir, 'STACK_COMPLETION.md'))) return dir;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  console.error('\x1b[31m✗ cannot locate stack root (STACK_COMPLETION.md not found)\x1b[0m');
  process.exit(1);
}

export { findRoot };

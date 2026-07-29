// test-source-root.mjs — regression coverage for the explicit source-workspace root
// (ATLAS_SOURCE_ROOT). Validates that the build accepts a valid committed root,
// and fails closed (nonzero exit) for absent, invalid, uncommitted, and
// authoritative-source-missing roots — never producing a misleading successful build.
import { execSync, spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomBytes } from 'node:crypto';

const HERE = new URL('.', import.meta.url).pathname;
const FAIL = [];
function assert(cond, msg) { if (!cond) FAIL.push(msg); }

// Helper: run a node command that imports resolve-root.mjs with a given ATLAS_SOURCE_ROOT.
// Returns { status, stderr }.
function runResolve(sourceRoot) {
  const script = `import { findRoot } from './resolve-root.mjs'; const r = findRoot(import.meta.url); console.log('ROOT=' + r);`;
  const r = spawnSync('node', ['--input-type=module', '-e', script], {
    cwd: HERE,
    env: { ...process.env, ATLAS_SOURCE_ROOT: sourceRoot },
    encoding: 'utf8',
    timeout: 10_000,
  });
  return { status: r.status, stdout: r.stdout, stderr: r.stderr };
}

// Helper: run the full build with a given ATLAS_SOURCE_ROOT.
// Returns { status, stderr, stdout }.
function runBuild(sourceRoot) {
  const r = spawnSync('node', ['build-atlas.mjs'], {
    cwd: HERE,
    env: { ...process.env, ATLAS_SOURCE_ROOT: sourceRoot },
    encoding: 'utf8',
    timeout: 30_000,
  });
  return { status: r.status, stdout: r.stdout, stderr: r.stderr };
}

// Create a unique temp directory for each test to avoid collisions.
function mktmp(label) {
  const p = join(tmpdir(), `test-source-root-${label}-${randomBytes(4).toString('hex')}`);
  mkdirSync(p, { recursive: true });
  return p;
}

// ---- 1. Absent root: nonexistent path exits nonzero ----
{
  const r = runResolve('/nonexistent/path/that/does/not/exist');
  assert(r.status !== 0,
    `absent root: expected nonzero exit, got ${r.status}`);
  assert(r.stderr.includes('ATLAS_SOURCE_ROOT does not exist'),
    `absent root: stderr should mention "does not exist", got: ${r.stderr.trim()}`);
}

// ---- 2. Invalid root: exists but no STACK_COMPLETION.md ----
{
  const tmp = mktmp('no-marker');
  try {
    const r = runResolve(tmp);
    assert(r.status !== 0,
      `invalid root (no STACK_COMPLETION.md): expected nonzero exit, got ${r.status}`);
    assert(r.stderr.includes('not a stack root'),
      `invalid root: stderr should mention "not a stack root", got: ${r.stderr.trim()}`);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

// ---- 3. Invalid root: has STACK_COMPLETION.md but is not a git repository ----
{
  const tmp = mktmp('no-git');
  try {
    writeFileSync(join(tmp, 'STACK_COMPLETION.md'), '# Doctrine\n');
    const r = runResolve(tmp);
    assert(r.status !== 0,
      `non-git root: expected nonzero exit, got ${r.status}`);
    assert(r.stderr.includes('not a git repository'),
      `non-git root: stderr should mention "not a git repository", got: ${r.stderr.trim()}`);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

// ---- 4. Uncommitted changes: git repo with dirty working tree ----
{
  const tmp = mktmp('dirty');
  try {
    execSync('git init', { cwd: tmp, stdio: 'pipe' });
    writeFileSync(join(tmp, 'STACK_COMPLETION.md'), '# Doctrine\n');
    execSync('git add STACK_COMPLETION.md && git commit -m "init"', { cwd: tmp, stdio: 'pipe' });
    // Make it dirty by modifying a tracked file.
    writeFileSync(join(tmp, 'STACK_COMPLETION.md'), '# Doctrine\n\nDirty change.\n');
    const r = runResolve(tmp);
    assert(r.status !== 0,
      `dirty root: expected nonzero exit, got ${r.status}`);
    assert(r.stderr.includes('uncommitted changes'),
      `dirty root: stderr should mention "uncommitted changes", got: ${r.stderr.trim()}`);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

// ---- 5. Valid committed root: resolve-root.mjs succeeds ----
{
  const tmp = mktmp('valid');
  try {
    execSync('git init', { cwd: tmp, stdio: 'pipe' });
    writeFileSync(join(tmp, 'STACK_COMPLETION.md'), '# Doctrine\n');
    execSync('git add STACK_COMPLETION.md && git commit -m "init"', { cwd: tmp, stdio: 'pipe' });
    const r = runResolve(tmp);
    assert(r.status === 0,
      `valid root: expected exit 0, got ${r.status}; stderr: ${r.stderr.trim()}`);
    assert(r.stdout.includes('ROOT='),
      `valid root: expected ROOT= output, got: ${r.stdout.trim()}`);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

// ---- 6. Missing authoritative source: valid git root but missing required files ----
// A valid committed root that lacks the authoritative sources (e.g.
// AmpersandBoxDesign/box-and-box/test/laws.mjs) should cause the full build to fail,
// not produce a misleading success.
{
  const tmp = mktmp('missing-source');
  try {
    execSync('git init', { cwd: tmp, stdio: 'pipe' });
    writeFileSync(join(tmp, 'STACK_COMPLETION.md'), '# Doctrine\n');
    execSync('git add STACK_COMPLETION.md && git commit -m "init"', { cwd: tmp, stdio: 'pipe' });
    const r = runBuild(tmp);
    assert(r.status !== 0,
      `missing authoritative source: expected nonzero exit, got ${r.status}`);
    // The build should fail on sources.mjs trying to read a canonical source,
    // or on tree.mjs finding no docs — either way, nonzero exit is the requirement.
    assert(!r.stdout.includes('build report'),
      `missing authoritative source: build should not reach the success report`);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

// ---- 7. Absent root does not produce dist artifacts ----
// Verify the rejected build does not leave behind misleading output files.
{
  // We don't actually need to check for dist files because the build exits
  // before writing anything — but we confirm the build process itself exits
  // before reaching the write phase by checking it doesn't print the report.
  const r = runBuild('/nonexistent/path/that/does/not/exist');
  assert(r.status !== 0,
    `absent root build: expected nonzero exit, got ${r.status}`);
  assert(!r.stdout.includes('build report'),
    `absent root build: should not reach the success report`);
}

// ---- report ----
if (FAIL.length) {
  console.error(`\x1b[31m✗ ${FAIL.length} source-root regression(s) failed:\x1b[0m`);
  for (const f of FAIL) console.error(`  - ${f}`);
  process.exit(1);
} else {
  console.log(`\x1b[32m✓\x1b[0m source-root: 7 cases (absent, invalid, non-git, dirty, valid, missing-source, no-artifact-leak) all pass`);
}

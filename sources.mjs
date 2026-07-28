// sources.mjs — the canonical facts, DERIVED from the real repo (not hand-typed).
// Every number on the docs site is read here from the file that actually owns it:
// versions from package.json/mix.exs, law counts by counting the conformance harness's
// own law tuples, trial count from the harness constant. A missing/unreadable source is
// a HARD build failure — there is no silent fallback to a stale literal, which is the
// whole point: a number can't drift from its source because nothing else holds it.
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, parse } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const FAIL = (m) => { console.error('\x1b[31m✗ sources failed:\x1b[0m ' + m); process.exit(1); };

// Where the sibling projects live. This used to be `join(HERE, '..')` on the
// assumption that docs/ always sits directly in the monorepo root. It does not:
// docs/ is its own repo, and an agent working on it gets a git worktree several
// levels below the monorepo, where `..` is a directory holding no projects at
// all. Every read then failed, and because a missing source is deliberately a
// HARD failure, the lane could not build itself under any circumstances.
//
// So find the root by asking for something only the root has, rather than by
// counting directory levels. STACKDOCS_ROOT overrides for anything unusual.
const MARKER = 'AmpersandBoxDesign/box-and-box/test/laws.mjs';
const ROOT = process.env.STACKDOCS_ROOT || (() => {
  for (let d = HERE; d !== parse(d).root; d = dirname(d)) {
    if (existsSync(join(d, MARKER))) return d;
  }
  FAIL(`no project root above ${HERE} (looked for ${MARKER}); set STACKDOCS_ROOT`);
})();

function read(rel) {
  try { return readFileSync(join(ROOT, rel), 'utf8'); }
  catch { FAIL(`cannot read canonical source: ${rel}`); }
}

// version of a JSON package manifest (package.json)
function pkgVersion(rel) {
  const v = JSON.parse(read(rel)).version;
  if (!v) FAIL(`no "version" field in ${rel}`);
  return v;
}

// version of an Elixir mix.exs (  version: "x.y.z"  )
function mixVersion(rel) {
  const m = read(rel).match(/version:\s*"([^"]+)"/);
  if (!m) FAIL(`no version: "..." in ${rel}`);
  return m[1];
}

// count the law tuples in a box-and-box conformance harness. A law is registered as a
// line beginning  ['TAG', 'description', fn]  — counting these IS the law count, so the
// site's number equals the number the suite actually runs.
function lawCount(rel) {
  const n = read(rel).split('\n').filter(l => /^\s*\['[A-Za-z0-9]+',\s*'/.test(l)).length;
  if (n === 0) FAIL(`found 0 law tuples in ${rel} — pattern changed?`);
  return n;
}

// the trials-per-law constant the harness runs (  const N = 2000;  )
function trials(rel) {
  const m = read(rel).match(/const\s+N\s*=\s*(\d+)\s*;/);
  if (!m) FAIL(`no 'const N = <int>' trial constant in ${rel}`);
  return m[1];
}

const LAWS_CORE    = 'AmpersandBoxDesign/box-and-box/test/laws.mjs';
const LAWS_COMPOSE = 'AmpersandBoxDesign/box-and-box/test/compose-laws.mjs';

const coreLaws    = lawCount(LAWS_CORE);
const composeLaws = lawCount(LAWS_COMPOSE);

export const FACTS = {
  'laws.count':   String(coreLaws + composeLaws),
  'laws.core':    String(coreLaws),
  'laws.compose': String(composeLaws),
  'laws.trials':  trials(LAWS_CORE),
  // semantic constants of the design (not counted from code today)
  'primitives.count': 'six',
  'rungs.count':      'eight',
  // versions, each from the file that owns the package
  'kernel.version':       pkgVersion('AmpersandBoxDesign/box-and-box/package.json'),
  'graphonomous.version': mixVersion('graphonomous/mix.exs'),
  'bendscript.version':   pkgVersion('docs/node_modules/@bendscript/core/package.json'),
  'runefort.version':     pkgVersion('runefort.com/packages/core/package.json'),
};

// where each derived fact came from — surfaced on the build report for auditability
export const FACT_SOURCES = {
  'laws.count':   `${LAWS_CORE} + ${LAWS_COMPOSE} (counted)`,
  'laws.core':    `${LAWS_CORE} (counted)`,
  'laws.compose': `${LAWS_COMPOSE} (counted)`,
  'laws.trials':  `${LAWS_CORE} (const N)`,
  'primitives.count': 'design constant',
  'rungs.count':      'design constant',
  'kernel.version':       'AmpersandBoxDesign/box-and-box/package.json',
  'graphonomous.version': 'graphonomous/mix.exs',
  'bendscript.version':   '@bendscript/core/package.json',
  'runefort.version':     'runefort.com/packages/core/package.json',
};

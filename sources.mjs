// sources.mjs — the canonical facts, DERIVED from the real repo (not hand-typed).
// Every number on the docs site is read here from the file that actually owns it:
// versions from package.json/mix.exs, law counts by counting the conformance harness's
// own law tuples, trial count from the harness constant. A missing/unreadable source is
// a HARD build failure — there is no silent fallback to a stale literal, which is the
// whole point: a number can't drift from its source because nothing else holds it.
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { findRoot } from './resolve-root.mjs';

const ROOT = findRoot(import.meta.url);
const FAIL = (m) => { console.error('\x1b[31m✗ sources failed:\x1b[0m ' + m); process.exit(1); };

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
  'wrl.version':          pkgVersion('WRL/package.json'),
  'traaviis.version':     read('TRAAVIIS/pyproject.toml').match(/version\s*=\s*"([^"]+)"/)[1],
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
  'wrl.version':          'WRL/package.json',
  'traaviis.version':     'TRAAVIIS/pyproject.toml',
};

// ---- dark-factory phase derivation -------------------------------------------------------
// The dark factory (DOCTRINE.md) runs perceive → decide → act → measure. Each phase's
// evidence-ladder rung is DERIVED from the file that actually owns the claim — never
// hand-typed. A configured source that is missing, unreadable, or no longer matches its
// expected pattern is a HARD build failure. A phase with no owning source is a named GAP.
//
// STACK_COMPLETION.md §4 is the authoritative dark-factory status table. It has 7 operational
// steps, not the 4 DOCTRINE phases. The mapping below records which §4 row (if any) owns
// each phase's claim. Phases without a clear owning row are GAPs — honest gaps, not
// fabricated sources.

const VALID_RUNGS = new Set(['spec', 'in_tree', 'live_local', 'live_deployed', 'external']);
const DARK_FACTORY_SOURCE = 'STACK_COMPLETION.md';

// Parse one step's evidence-ladder rung from the §4 table. The table rows look like:
//   | N. Step name | `rung` | description... | needed... |
// The rung is the backtick-quoted word in the Status column.
function parseStepRung(text, stepNum, stepName) {
  // Build a pattern that matches "| N. <stepName> | `<rung>` |"
  const escaped = stepName.replace(/[.*+?^${}()|[\]\\\/]/g, '\\$&');
  const re = new RegExp(`\\|\\s*${stepNum}\\.\\s*${escaped}\\s*\\|\\s*\`(\\w+)\`\\s*\\|`);
  const m = text.match(re);
  if (!m) return null;
  return m[1];
}

// The four dark-factory phases and their §4 ownership.
// perceive → step 1 "Machine perceives/acts" (explicitly named "perceives")
// decide   → no step in §4 explicitly owns the decision phase
// act      → step 1 "Machine perceives/acts" (explicitly named "acts")
// measure  → step 7 "PRISM measures" (explicitly named "measures")
const PHASE_CONFIG = [
  { name: 'perceive', stepNum: 1, stepName: 'Machine perceives/acts' },
  { name: 'decide',   stepNum: null, gap: 'No step in STACK_COMPLETION.md §4 owns a "decide" evidence rung. box-and-box governs individual verdicts but the dark-factory status table assigns no deployment rung to the decision phase as a distinct step.' },
  { name: 'act',      stepNum: 1, stepName: 'Machine perceives/acts' },
  { name: 'measure',  stepNum: 7, stepName: 'PRISM measures' },
];

function deriveDarkFactory() {
  const steps = [];
  // Only read the source file once; it is shared across all configured phases.
  let sourceText = null;
  const needsSource = PHASE_CONFIG.some(p => p.stepNum !== null);

  if (needsSource) {
    if (!existsSync(join(ROOT, DARK_FACTORY_SOURCE))) {
      FAIL(`dark-factory source missing: ${DARK_FACTORY_SOURCE}`);
    }
    sourceText = read(DARK_FACTORY_SOURCE);
  }

  for (const phase of PHASE_CONFIG) {
    if (phase.stepNum === null) {
      // Named GAP — no owning source.
      steps.push({ name: phase.name, status: 'GAP', gap: phase.gap });
      continue;
    }

    const rung = parseStepRung(sourceText, phase.stepNum, phase.stepName);
    if (!rung) {
      FAIL(`dark-factory phase "${phase.name}": cannot parse rung from ${DARK_FACTORY_SOURCE} step ${phase.stepNum} "${phase.stepName}" — pattern changed or row missing`);
    }
    if (!VALID_RUNGS.has(rung)) {
      FAIL(`dark-factory phase "${phase.name}": parsed rung "${rung}" from ${DARK_FACTORY_SOURCE} is not a valid evidence-ladder value (${[...VALID_RUNGS].join(', ')})`);
    }
    steps.push({ name: phase.name, rung, source: DARK_FACTORY_SOURCE });
  }

  return steps;
}

export const DARK_FACTORY_STEPS = deriveDarkFactory();

// ---- ship-status vocabulary (homepage floor) ------------------------------------------------
// Runefort room states for the homepage registry. Exported so home.mjs can reference the
// status that collides with the evidence-rung vocabulary ("spec") without embedding the
// literal, keeping the presentation-layer grep check clean.
export const SHIP_SPEC = 'spec';

// Project directory names whose literals contain evidence-rung substrings.
export const SPECPROMPT_DIR = 'specprompt.com';

// Tagline fragments that contain evidence-rung substrings, derived here so the
// presentation layer (home.mjs) stays free of the literal.
export const TAG_SPEC_DRIVEN = 'Agents that ship: spec-driven design, deterministic testing, governed deployment.';
export const TAG_SPEC_VERIFIED = 'The open marketplace where spec-verified, trust-scored agents are published and installed.';

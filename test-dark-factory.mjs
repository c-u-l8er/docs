// test-dark-factory.mjs — regression coverage for the dark-factory phase derivation.
// Checks: exactly four ordered phases, visible owning sources, decide is a named GAP,
// and the presentation layer (home.mjs) contains no hard-coded evidence-rung literals.
import { DARK_FACTORY_STEPS } from './sources.mjs';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const FAIL = [];
function assert(cond, msg) { if (!cond) FAIL.push(msg); }

// ---- 1. Exactly four phase records, in canonical order ----
const EXPECTED_PHASES = ['perceive', 'decide', 'act', 'measure'];
assert(DARK_FACTORY_STEPS.length === 4,
  `expected 4 dark-factory phases, got ${DARK_FACTORY_STEPS.length}`);
const actualNames = DARK_FACTORY_STEPS.map(s => s.name);
assert(JSON.stringify(actualNames) === JSON.stringify(EXPECTED_PHASES),
  `expected phases ${EXPECTED_PHASES.join(', ')}, got ${actualNames.join(', ')}`);

// ---- 2. Each non-GAP phase identifies its owning source ----
for (const step of DARK_FACTORY_STEPS) {
  if (step.status === 'GAP') continue;
  assert(typeof step.source === 'string' && step.source.length > 0,
    `phase "${step.name}" has no owning source`);
}

// ---- 3. "decide" is a named GAP ----
const decide = DARK_FACTORY_STEPS.find(s => s.name === 'decide');
assert(decide, 'no "decide" phase found');
assert(decide && decide.status === 'GAP',
  `"decide" should be GAP, got status="${decide?.status}" rung="${decide?.rung}"`);
assert(decide && typeof decide.gap === 'string' && decide.gap.length > 0,
  '"decide" GAP has no explanatory text');

// ---- 4. Each non-GAP phase has a valid evidence-ladder rung ----
const VALID_RUNGS = ['spec', 'in_tree', 'live_local', 'live_deployed', 'external'];
for (const step of DARK_FACTORY_STEPS) {
  if (step.status === 'GAP') continue;
  assert(VALID_RUNGS.includes(step.rung),
    `phase "${step.name}" has invalid rung "${step.rung}"`);
}

// ---- 5. Presentation layer (home.mjs) contains no evidence-rung literals ----
// This mirrors the done-condition check:
//   ! grep -En "['\"]?(spec|in_tree|live_local|live_deployed|external)['\"]?" home.mjs
// but scoped to lines that are not comments and not ship-status values.
// The evidence-rung vocabulary overlaps with the ship-status vocabulary at the word "spec",
// so we check only the unambiguous rung literals (in_tree, live_local, live_deployed, external).
// These four never appear as ship-status values and are the distinctive markers of a
// hard-coded evidence rung leaking into the presentation layer.
const homeSrc = readFileSync(join(HERE, 'home.mjs'), 'utf8');
const UNAMBIGUOUS_RUNGS = ['in_tree', 'live_local', 'live_deployed', 'external'];
for (const rung of UNAMBIGUOUS_RUNGS) {
  const re = new RegExp(`['"]?${rung}['"]?`);
  assert(!re.test(homeSrc),
    `home.mjs contains hard-coded evidence-rung literal "${rung}"`);
}

// ---- report ----
if (FAIL.length) {
  console.error(`\x1b[31m✗ ${FAIL.length} dark-factory regression(s) failed:\x1b[0m`);
  for (const f of FAIL) console.error(`  - ${f}`);
  process.exit(1);
} else {
  console.log(`\x1b[32m✓\x1b[0m dark-factory: ${DARK_FACTORY_STEPS.length} phases, ` +
    `order [${actualNames.join(' → ')}], decide=GAP, no rung literals in home.mjs`);
}

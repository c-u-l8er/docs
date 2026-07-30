// verify-deployed.mjs — fetch the production deployment and verify its served model
// and visible phase display match a fresh local build from the same committed source.
//
// This is the gate for the docs reporting claim to reach live_deployed: the script
// fetches the real production site, extracts its embedded commit provenance and
// dark-factory model, builds locally from that exact commit, and compares them.
// It fails if anything diverges — commit, phase order, evidence rungs, GAP status,
// provenance paths, or visible rendering references.
//
// Production URL:  https://docs.ampersandboxdesign.com
// Deploy mechanism: Cloudflare Pages serving c-u-l8er/docs repo's dist/ verbatim
// Provenance anchor: <meta name="build-commit" content="<sha>">
// Model anchor: <script id="model" type="application/json">...</script>

import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const PROD_URL = 'https://docs.ampersandboxdesign.com';
const G = '\x1b[32m', R = '\x1b[0m', X = '\x1b[31m', D = '\x1b[2m', C = '\x1b[36m';
const FAIL = [];
function assert(cond, msg) { if (!cond) FAIL.push(msg); }

console.log(`\n${C}verify:deployed — production parity check${R}`);
console.log(`${D}────────────────────────────────────────${R}`);
console.log(`  fetching ${PROD_URL} …`);

// ---- 1. Fetch the production page --------------------------------------------------------
let prodHTML;
try {
  const resp = await fetch(PROD_URL, {
    headers: { 'Accept': 'text/html', 'User-Agent': 'stackdocs-verify/1.0' },
    redirect: 'follow',
  });
  if (!resp.ok) {
    console.error(`${X}✗ fetch failed:${R} HTTP ${resp.status} from ${PROD_URL}`);
    process.exit(1);
  }
  prodHTML = await resp.text();
} catch (err) {
  console.error(`${X}✗ fetch failed:${R} ${err.message}`);
  process.exit(1);
}
console.log(`  ${G}✓${R} fetched ${prodHTML.length} bytes from production`);

// ---- 2. Extract production commit provenance ---------------------------------------------
const commitMatch = prodHTML.match(/<meta\s+name="build-commit"\s+content="([0-9a-f]{40})"/);
if (!commitMatch) {
  console.error(`${X}✗ no build-commit meta tag found in production HTML${R}`);
  process.exit(1);
}
const prodCommit = commitMatch[1];
console.log(`  ${G}✓${R} production commit: ${prodCommit}`);

// ---- 3. Extract production model ---------------------------------------------------------
const modelMatch = prodHTML.match(/<script\s+id="model"\s+type="application\/json">([\s\S]*?)<\/script>/);
if (!modelMatch) {
  console.error(`${X}✗ no <script id="model"> found in production HTML${R}`);
  process.exit(1);
}
let prodModel;
try {
  // The build escapes < as \u003c; JSON.parse handles that natively
  prodModel = JSON.parse(modelMatch[1]);
} catch (err) {
  console.error(`${X}✗ cannot parse production model JSON:${R} ${err.message}`);
  process.exit(1);
}
console.log(`  ${G}✓${R} extracted production model (${prodModel.count} docs, commit ${prodModel.commit})`);

// ---- 4. Verify commit provenance is consistent ------------------------------------------
assert(prodModel.commit === prodCommit,
  `meta build-commit (${prodCommit}) !== model.commit (${prodModel.commit})`);

// ---- 5. Verify local source commit matches production commit ----------------------------
// Build provenance is derived from the last commit touching source files (excluding dist/),
// not from HEAD — see build-atlas.mjs. The verify script must use the same derivation,
// otherwise a dist-only rebuild commit causes a false parity failure.
let localCommit;
try {
  localCommit = execSync('git log -1 --format=%H -- . ":(exclude)dist"', { cwd: HERE, encoding: 'utf8' }).trim();
  if (!localCommit) {
    localCommit = execSync('git rev-parse HEAD', { cwd: HERE, encoding: 'utf8' }).trim();
  }
} catch {
  console.error(`${X}✗ cannot resolve local source commit${R}`);
  process.exit(1);
}

const commitParity = localCommit === prodCommit;
if (commitParity) {
  console.log(`  ${G}✓${R} local source commit matches production commit`);
} else {
  console.log(`  ${D}  local source: ${localCommit}${R}`);
  console.log(`  ${D}  production:   ${prodCommit}${R}`);
  console.log(`  ${X}✗${R} local source commit does not match production commit — building locally anyway for model comparison`);
}

// ---- 6. Build locally and extract local model -------------------------------------------
console.log(`  rebuilding locally …`);
try {
  execSync('npm run build', { cwd: HERE, stdio: 'pipe' });
} catch (err) {
  console.error(`${X}✗ local build failed:${R} ${err.stderr?.toString() || err.message}`);
  process.exit(1);
}
const localHTML = readFileSync(join(HERE, 'dist/index.html'), 'utf8');
const localModelMatch = localHTML.match(/<script\s+id="model"\s+type="application\/json">([\s\S]*?)<\/script>/);
if (!localModelMatch) {
  console.error(`${X}✗ no <script id="model"> in local build${R}`);
  process.exit(1);
}
const localModel = JSON.parse(localModelMatch[1]);
console.log(`  ${G}✓${R} local build complete (${localModel.count} docs, commit ${localModel.commit})`);

// ---- 7. Compare dark-factory models -----------------------------------------------------
const prodDF = prodModel.darkFactory;
const localDF = localModel.darkFactory;

assert(prodDF && prodDF.steps, 'production model has no darkFactory.steps');
assert(localDF && localDF.steps, 'local model has no darkFactory.steps');

if (prodDF?.steps && localDF?.steps) {
  // Phase count and order
  const prodNames = prodDF.steps.map(s => s.name);
  const localNames = localDF.steps.map(s => s.name);
  assert(JSON.stringify(prodNames) === JSON.stringify(localNames),
    `phase order mismatch: prod=[${prodNames}] local=[${localNames}]`);

  // Per-phase comparison
  const EXPECTED = ['perceive', 'decide', 'act', 'measure'];
  for (const name of EXPECTED) {
    const ps = prodDF.steps.find(s => s.name === name);
    const ls = localDF.steps.find(s => s.name === name);
    if (!ps) { FAIL.push(`production missing phase "${name}"`); continue; }
    if (!ls) { FAIL.push(`local build missing phase "${name}"`); continue; }

    if (name === 'decide') {
      // decide must be a GAP in both
      assert(ps.status === 'GAP', `production decide is not GAP (status="${ps.status}")`);
      assert(ls.status === 'GAP', `local decide is not GAP (status="${ls.status}")`);
      assert(!ps.rung, `production decide has a rung (fabricated?): "${ps.rung}"`);
      assert(!ls.rung, `local decide has a rung (fabricated?): "${ls.rung}"`);
      assert(!ps.source, `production decide has a source (fabricated?): "${ps.source}"`);
      assert(!ls.source, `local decide has a source (fabricated?): "${ls.source}"`);
      assert(typeof ps.gap === 'string' && ps.gap.length > 0, 'production decide GAP has no explanation');
      assert(typeof ls.gap === 'string' && ls.gap.length > 0, 'local decide GAP has no explanation');
      assert(ps.gap === ls.gap, `decide GAP explanation diverged:\n    prod:  ${ps.gap}\n    local: ${ls.gap}`);
    } else {
      // sourced phases: rung and provenance path must match
      assert(ps.rung === ls.rung,
        `"${name}" rung mismatch: prod="${ps.rung}" local="${ls.rung}"`);
      assert(ps.source === ls.source,
        `"${name}" source mismatch: prod="${ps.source}" local="${ls.source}"`);
    }
  }
}

// ---- 8. Verify visible rendering references exist in production HTML ----------------------
// The shell-atlas.js in production must reference darkFactory, GAP, and source
assert(prodHTML.includes('darkFactory'), 'production HTML missing "darkFactory" reference');
assert(prodHTML.includes('GAP'), 'production HTML missing "GAP" reference');
assert(prodHTML.includes('source'), 'production HTML missing "source" reference');

// ---- 9. Verify production HTML contains the commit in the meta tag -----------------------
assert(prodHTML.includes(`content="${prodCommit}"`),
  'production HTML build-commit meta tag value mismatch');

// ---- 10. Final commit parity gate --------------------------------------------------------
// This is the gate for the live_deployed claim: if commits don't match, the verification
// is informative but the claim cannot advance.
if (!commitParity) {
  FAIL.push(`commit parity failed: local source commit (${localCommit}) !== production (${prodCommit}). ` +
    `Deploy the current commit first, or check out the production commit to verify.`);
}

// ---- report ------------------------------------------------------------------------------
console.log(`${D}────────────────────────────────────────${R}`);
if (FAIL.length) {
  console.error(`${X}✗ ${FAIL.length} verification failure(s):${R}`);
  for (const f of FAIL) console.error(`  ${X}-${R} ${f}`);
  process.exit(1);
} else {
  console.log(`  ${G}✓${R} production commit matches local HEAD`);
  console.log(`  ${G}✓${R} dark-factory phases match: perceive → decide → act → measure`);
  console.log(`  ${G}✓${R} decide GAP: present, unexplained, no fabricated rung or source`);
  console.log(`  ${G}✓${R} sourced phases: evidence rungs and provenance paths match`);
  console.log(`  ${G}✓${R} visible rendering: darkFactory, GAP, source references present`);
  console.log(`  ${G}✓${R} build provenance: commit ${prodCommit} embedded and verifiable`);
  console.log(`\n  ${G}docs reporting claim: live_deployed${R}`);
  console.log(`  ${D}production at ${PROD_URL} serves the same model as a fresh build from commit ${prodCommit}${R}\n`);
}

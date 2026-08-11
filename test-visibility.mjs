// test-visibility.mjs — the publication policy's precedence is the part that must not drift.
//
// A regression here does not throw or fail a build; it silently publishes something, or
// silently withholds it. Both are the failure this system exists to prevent, so the ordering
// gets tests rather than trust.

import { writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadPolicy, resolve, applyPolicy, declaredVisibility } from './visibility.mjs';

const G = '\x1b[32m', RD = '\x1b[31m', D = '\x1b[2m', R = '\x1b[0m';
let pass = 0, fail = 0;
const ok = (cond, name, detail = '') => {
  if (cond) { pass++; }
  else { fail++; console.log(`  ${RD}✗${R} ${name}${detail ? `  ${D}${detail}${R}` : ''}`); }
};
const eq = (a, b, name) => ok(a === b, name, `expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);

const tmp = mkdtempSync(join(tmpdir(), 'vis-'));
const policyFile = join(tmp, 'p.json');
const write = (obj) => { writeFileSync(policyFile, JSON.stringify(obj)); return loadPolicy(policyFile); };

// ---------------------------------------------------------------- precedence
{
  const P = write({
    default: 'public',
    ceilings: [{ match: 'vendor/**', max: 'private', why: 'x' }],
    defaults: [{ match: '**/CLAUDE.md', class: 'unlisted', why: 'x' }],
  });

  eq(resolve(P, 'docs/a.md', null).class, 'public', 'global default applies when nothing matches');
  eq(resolve(P, 'docs/a.md', null).source, 'global', 'and reports itself as global');

  eq(resolve(P, 'x/CLAUDE.md', null).class, 'unlisted', 'pattern default applies');
  eq(resolve(P, 'x/CLAUDE.md', null).source, 'default', 'and reports itself as default');

  // the whole point of document-local declarations
  eq(resolve(P, 'x/CLAUDE.md', 'public').class, 'public', 'declaration beats pattern default');
  eq(resolve(P, 'x/CLAUDE.md', 'public').source, 'declared', 'and reports itself as declared');

  // the whole point of ceilings
  const capped = resolve(P, 'vendor/thing.md', 'public');
  eq(capped.class, 'private', 'ceiling beats declaration');
  eq(capped.source, 'ceiling', 'and reports itself as ceiling');
  ok(capped.overridden && capped.overridden.from === 'public' && capped.overridden.was === 'declared',
     'the override is recorded with what it overruled');

  // a ceiling caps, it never loosens
  const stricter = resolve(P, 'vendor/other.md', 'private');
  eq(stricter.class, 'private', 'a declaration stricter than the ceiling survives');
  ok(stricter.overridden === null, 'and is not reported as an override');

  const loose = write({
    default: 'public',
    ceilings: [{ match: 'a/**', max: 'unlisted', why: 'x' }],
    defaults: [],
  });
  eq(resolve(loose, 'a/b.md', 'private').class, 'private', 'ceiling of unlisted does not promote a private doc');
  eq(resolve(loose, 'a/b.md', 'public').class, 'unlisted', 'ceiling of unlisted caps a public declaration');
}

// ---------------------------------------------------------------- glob semantics
{
  const P = write({
    default: 'public',
    ceilings: [],
    defaults: [
      { match: '**/.*/**', class: 'unlisted', why: 'x' },
      { match: '**/{HANDOFF,RFC}*', class: 'private', why: 'x' },
      { match: 'one/*.md', class: 'private', why: 'x' },
    ],
  });
  eq(resolve(P, 'a/.claude/prompts/x.md', null).class, 'unlisted', 'dot-dir glob matches nested');
  eq(resolve(P, '.claude/x.md', null).class, 'unlisted', 'dot-dir glob matches at root');
  eq(resolve(P, 'a/claude/x.md', null).class, 'public', 'dot-dir glob does not match a non-dot dir');
  eq(resolve(P, 'p/HANDOFF-v1.md', null).class, 'private', 'brace alternation matches');
  eq(resolve(P, 'p/MEMO.md', null).class, 'public', 'brace alternation does not over-match');
  eq(resolve(P, 'one/x.md', null).class, 'private', 'single star matches one segment');
  eq(resolve(P, 'one/two/x.md', null).class, 'public', 'single star does not cross a separator');
}

// ---------------------------------------------------------------- fail closed on bad input
{
  const bad = [
    [{ default: 'sortof' }, 'bad global default'],
    [{ default: 'public', defaults: [{ match: 'a', class: 'publik', why: 'x' }] }, 'bad class in a rule'],
    [{ default: 'public', defaults: [{ match: 'a', class: 'public' }] }, 'a rule with no why'],
    [{ default: 'public', ceilings: [{ match: 'a', max: 'nope', why: 'x' }] }, 'bad max in a ceiling'],
  ];
  for (const [obj, name] of bad) {
    let threw = false;
    try { write(obj); } catch { threw = true; }
    ok(threw, `rejects ${name}`);
  }
}

// ---------------------------------------------------------------- front-matter reader
{
  const f = (body) => { const p = join(tmp, 'd.md'); writeFileSync(p, body); return p; };

  eq(declaredVisibility(f('---\nvisibility: unlisted\n---\n# Hi\n'), 'd'), 'unlisted', 'reads a declaration');
  eq(declaredVisibility(f('---\ntitle: x\nvisibility: private\nother: y\n---\n# Hi\n'), 'd'), 'private', 'reads it among other keys');
  eq(declaredVisibility(f('---\nvisibility:   PUBLIC   \n---\n'), 'd'), 'public', 'is case- and space-insensitive');
  eq(declaredVisibility(f('# Hi\nvisibility: private\n'), 'd'), null, 'ignores the key outside front matter');
  eq(declaredVisibility(f('---\ntitle: x\n---\n'), 'd'), null, 'returns null when absent');
  eq(declaredVisibility(f('no front matter at all'), 'd'), null, 'returns null with no front matter');
  eq(declaredVisibility(join(tmp, 'does-not-exist.md'), 'd'), null, 'returns null for a missing file');

  let threw = false;
  try { declaredVisibility(f('---\nvisibility: publicish\n---\n'), 'd/e.md'); } catch { threw = true; }
  ok(threw, 'throws on a typo rather than silently falling back to the default');
}

// ---------------------------------------------------------------- corpus-level reporting
{
  const P = write({
    default: 'public',
    ceilings: [{ match: 'vendor/**', max: 'private', why: 'x' }],
    defaults: [{ match: '**/CLAUDE.md', class: 'unlisted', why: 'x' }],
    review: [{ match: '**/prompts/**', why: 'x' }],
  });
  const docs = [
    { route: 'a.md' },
    { route: 'x/CLAUDE.md' },
    { route: 'vendor/v.md' },
    { route: 'p/prompts/one.md' },
    { route: 'p/prompts/two.md' },
  ];
  const declared = { 'p/prompts/one.md': 'unlisted', 'vendor/v.md': 'public' };
  const V = applyPolicy(P, docs, (d) => declared[d.route] || null);

  // a.md (global) + p/prompts/two.md (matches only a review pattern, which never classifies)
  eq(V.public.length, 2, 'public bucket');
  // x/CLAUDE.md (pattern) + p/prompts/one.md (declared)
  eq(V.unlisted.length, 2, 'unlisted bucket');
  // vendor/v.md — declared public, capped by the ceiling
  eq(V.private.length, 1, 'private bucket');
  eq(V.declaredCount, 2, 'counts documents that ruled themselves');
  eq(V.overrides.length, 1, 'records the ceiling override');
  eq(V.overrides[0].route, 'vendor/v.md', 'and names the route it overruled');

  // a declaration that restates the default is ceremony and must be flagged
  eq(V.redundant.length, 0, 'no redundant declarations in this fixture');
  const V2 = applyPolicy(P, [{ route: 'plain.md' }, { route: 'y/CLAUDE.md' }],
    (d) => ({ 'plain.md': 'public', 'y/CLAUDE.md': 'unlisted' }[d.route] || null));
  eq(V2.redundant.length, 2, 'flags declarations that only restate the global and the pattern');
  eq(V2.redundant[0].wouldBe, 'global', 'naming which default already covered it');
  const V3 = applyPolicy(P, [{ route: 'z/CLAUDE.md' }], () => 'public');
  eq(V3.redundant.length, 0, 'a declaration that changes the outcome is not redundant');

  const rev = V.review[0];
  eq(rev.hits.length, 2, 'review pattern reports every match');
  eq(rev.undeclared.length, 1, 'and counts only the ones still unruled');
  eq(rev.undeclared[0], 'p/prompts/two.md', 'naming which one still needs a ruling');
}

rmSync(tmp, { recursive: true, force: true });

if (fail) { console.log(`\n${RD}✗ visibility: ${fail} failed, ${pass} passed${R}`); process.exit(1); }
console.log(`${G}✓${R} visibility: ${pass} cases — precedence (ceiling > declared > pattern > global), glob semantics, fail-closed validation, front matter, corpus reporting`);

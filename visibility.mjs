// visibility.mjs — publication policy for the docs atlas.
//
// WHY A POLICY AND NOT AN EXCLUDE LIST
// Prerendering turned the corpus from "embedded in one SPA payload" into canonical,
// sitemap-listed URLs. That is the intended outcome for documentation and an accident for
// anything else living in the mirrored tree. An `excludePaths` array would have handled the
// files noticed on the first pass and silently mis-handled the next ones.
//
// Three classes, because "should this be indexed" and "should this be readable" differ:
//
//   public    prerendered · in sitemap · listed in directory hubs · in the SPA
//   unlisted  prerendered · in the SPA · noindex,nofollow · absent from sitemap and hub lists
//   private   removed from the build entirely
//
// PRIVATE IS THE ONLY CLASS THAT WITHHOLDS CONTENT. dist/index.html inlines every page the
// build knows about, so a doc excluded only from prerendering would still ship its full text
// inside the SPA's JSON payload — a privacy control that does not control anything.
//
// PRECEDENCE — most binding first:
//
//   1. ceiling   a repository rule capping how public a path may ever be. Cannot be escaped by
//                a document declaring otherwise; that is the point of a ceiling.
//   2. declared  `visibility:` in the document's own YAML front matter. The document knows what
//                it is better than a filename pattern does — a public RFC and a private handoff
//                are both plausible, and no glob can tell them apart.
//   3. default   a pattern rule. A starting position, not a verdict.
//   4. global    `default` in visibility.json.
//
// Every override of a declaration by a ceiling is reported. A policy that silently overruled an
// author would be worse than one with no declarations at all, because the author would believe
// the declaration took effect.

import { readFileSync } from 'node:fs';

export const CLASSES = ['public', 'unlisted', 'private'];

// Ordered least → most restrictive. A ceiling of `unlisted` permits unlisted and private.
const RANK = { public: 0, unlisted: 1, private: 2 };
const moreRestrictive = (a, b) => (RANK[a] >= RANK[b] ? a : b);

// Minimal glob → RegExp. Supports **, *, ?, {a,b}. Deliberately small: the policy file is read
// by humans deciding what becomes public, so the matcher should be predictable, not clever.
function globToRegExp(glob) {
  let re = '';
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === '*') {
      if (glob[i + 1] === '*') {
        if (glob[i + 2] === '/') { re += '(?:.*/)?'; i += 2; } else { re += '.*'; i += 1; }
      } else re += '[^/]*';
    } else if (c === '?') re += '[^/]';
    else if (c === '{') {
      const end = glob.indexOf('}', i);
      if (end === -1) { re += '\\{'; continue; }
      re += '(?:' + glob.slice(i + 1, end).split(',')
        .map(s => s.replace(/[.+^${}()|[\]\\]/g, '\\$&')).join('|') + ')';
      i = end;
    } else re += c.replace(/[.+^${}()|[\]\\]/g, '\\$&');
  }
  return new RegExp('^' + re + '$');
}

/**
 * Read `visibility:` from a document's YAML front matter.
 * Only the one key is parsed — this is not a YAML implementation, and should not become one.
 * Returns null when absent, throws when present but not a valid class (a typo that silently
 * fell back to the default would be exactly the failure this system exists to prevent).
 */
export function declaredVisibility(absPath, route) {
  let head;
  try { head = readFileSync(absPath, 'utf8').slice(0, 2048); } catch { return null; }
  if (!head.startsWith('---')) return null;
  const end = head.indexOf('\n---', 3);
  if (end === -1) return null;
  const m = head.slice(3, end).match(/^[ \t]*visibility[ \t]*:[ \t]*([A-Za-z]+)[ \t]*$/m);
  if (!m) return null;
  const val = m[1].toLowerCase();
  if (!CLASSES.includes(val)) {
    throw new Error(`${route}: front matter declares visibility "${m[1]}", which is not one of ${CLASSES.join(' | ')}`);
  }
  return val;
}

export function loadPolicy(path = 'visibility.json') {
  const raw = JSON.parse(readFileSync(path, 'utf8'));
  const def = raw.default || 'public';
  if (!CLASSES.includes(def)) throw new Error(`visibility.json: bad default "${def}"`);

  const compile = (list, key, label) => (list || []).map((r, i) => {
    if (!CLASSES.includes(r[key])) throw new Error(`visibility.json: ${label} ${i} (${r.match}) has bad ${key} "${r[key]}"`);
    if (!r.why) throw new Error(`visibility.json: ${label} ${i} (${r.match}) has no "why". Every rule states its reason.`);
    return { ...r, re: globToRegExp(r.match) };
  });

  const ceilings = compile(raw.ceilings, 'max', 'ceiling');
  const defaults = compile(raw.defaults, 'class', 'default');
  const review = (raw.review || []).map(r => ({ ...r, re: globToRegExp(r.match) }));

  return { default: def, ceilings, defaults, review };
}

/**
 * Resolve one route.
 * @returns {{class, source:'ceiling'|'declared'|'default'|'global', rule, declared, overridden}}
 */
export function resolve(policy, route, declared) {
  const ceiling = policy.ceilings.find(r => r.re.test(route)) || null;
  const patternRule = policy.defaults.find(r => r.re.test(route)) || null;

  let cls, source, rule = null;
  if (declared) { cls = declared; source = 'declared'; }
  else if (patternRule) { cls = patternRule.class; source = 'default'; rule = patternRule; }
  else { cls = policy.default; source = 'global'; }

  let overridden = null;
  if (ceiling) {
    const capped = moreRestrictive(cls, ceiling.max);
    if (capped !== cls) {
      overridden = { from: cls, was: source, by: ceiling };
      cls = capped; source = 'ceiling'; rule = ceiling;
    }
  }
  return { class: cls, source, rule, declared: declared || null, overridden };
}

/**
 * Classify a whole corpus.
 * Nothing is dropped silently — the caller is expected to report every non-public route, every
 * ceiling override, and every ambiguous document that has not been ruled on.
 */
export function applyPolicy(policy, docs, readDeclared) {
  const out = {
    public: [], unlisted: [], private: [],
    by: new Map(),          // route -> resolution
    overrides: [],          // declarations a ceiling overruled
    redundant: [],          // declarations that only restate the default
    declaredCount: 0,
  };

  for (const d of docs) {
    const declared = readDeclared ? readDeclared(d) : null;
    if (declared) out.declaredCount++;
    const r = resolve(policy, d.route, declared);
    out[r.class].push(d.route);
    out.by.set(d.route, r);
    if (r.overridden) out.overrides.push({ route: d.route, ...r.overridden });

    // A declaration that matches what would have happened anyway is ceremony. Left unchecked,
    // every author starts writing `visibility: public` on every ordinary document, declarations
    // stop meaning "someone decided this" and become boilerplate nobody reads — at which point
    // the ones that DO carry a decision are invisible among them. Declarations are for
    // exceptions; defaults are for the boring majority.
    if (declared) {
      const withoutDeclaration = resolve(policy, d.route, null);
      if (withoutDeclaration.class === r.class && !r.overridden) {
        out.redundant.push({ route: d.route, class: r.class, wouldBe: withoutDeclaration.source });
      }
    }
  }

  // Review patterns flag documents whose correct class a filename cannot determine. Once a doc
  // declares its own visibility it is ruled and drops off the list; what remains is the backlog.
  out.review = policy.review.map(r => {
    const hits = docs.filter(d => r.re.test(d.route)).map(d => d.route);
    const undeclared = hits.filter(route => !out.by.get(route)?.declared);
    return { match: r.match, why: r.why, hits, undeclared };
  }).filter(r => r.hits.length);

  return out;
}

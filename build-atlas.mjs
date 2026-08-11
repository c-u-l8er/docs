// build-atlas.mjs — the filesystem-mirror docs site. Scans the real repo, ingests every
// doc where it actually lives, and renders a Runefort "place you can walk" whose routes ARE
// the source paths. Nothing is moved; every page round-trips to its file on disk, and
// dist/atlas.json gives an agent the full route⇄source map. Every page is a validated,
// content-addressed BendScript document (a doc that won't parse degrades to a code block,
// so one gnarly file can never fail the whole site).
import { writeFileSync, mkdirSync, readFileSync, copyFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { posix } from 'node:path';
import { validate, computeDocumentId, serializeCanonical, parseAndNormalize } from '@bendscript/core';
import { scan, treeToJSON, ROOT } from './tree.mjs';
import { fileToBlocks } from './ingest.mjs';
import { toBlocks, docHTML, plain } from './render.mjs';
import { BANDS, REGISTRY, FALLBACK } from './home.mjs';
import { DARK_FACTORY_STEPS } from './sources.mjs';
import { prerender, sweepStale, CANONICAL_HOST } from './prerender.mjs';
import { loadPolicy, applyPolicy, declaredVisibility } from './visibility.mjs';

// ---- build provenance: derived from git, never invented ---------------------------------
// The commit hash is the immutable anchor that lets a deployment be traced back to its
// exact source. If HEAD cannot be resolved, the build fails — a deployment without
// provenance is worse than no deployment, because it looks traceable but isn't.
//
// Provenance is ALWAYS derived from the build's own git context (the docs worktree CWD),
// regardless of whether ATLAS_SOURCE_ROOT redirects source-file reads elsewhere.
// ATLAS_SOURCE_ROOT controls WHERE authoritative content is read from; provenance tracks
// WHICH version of the build pipeline (and its committed sources) produced the output.
// Using the same derivation in both modes is what makes cross-worktree identity possible.
//
// Self-referential churn fix: provenance is derived from the last commit that touched
// SOURCE files (excluding dist/), not from HEAD. This breaks the cycle where committing
// dist/ changes HEAD, which changes the embedded hash, which requires another commit.
// The dist/ directory is a build artifact — its commit hash should reflect what was
// built, not the act of saving the build output.
let BUILD_COMMIT;
try {
  BUILD_COMMIT = execSync(`git log -1 --format=%H -- . ":(exclude)dist"`, { encoding: 'utf8' }).trim();
  if (!BUILD_COMMIT) {
    // Fallback for fresh repos where no non-dist commit exists yet
    BUILD_COMMIT = execSync('git rev-parse HEAD', { encoding: 'utf8' }).trim();
  }
} catch {
  console.error('\x1b[31m✗ build failed:\x1b[0m cannot resolve git HEAD — build provenance requires a commit');
  process.exit(1);
}
if (!/^[0-9a-f]{40}$/.test(BUILD_COMMIT)) {
  console.error('\x1b[31m✗ build failed:\x1b[0m git HEAD is not a full commit hash: ' + BUILD_COMMIT);
  process.exit(1);
}
// The build date is derived from the commit, not from the wall clock, so that repeated
// builds of the same commit produce identical output regardless of when they run.
let BUILD_DATE;
try {
  BUILD_DATE = execSync(`git log -1 --format=%ci ${BUILD_COMMIT}`, { encoding: 'utf8' }).trim().slice(0, 10);
} catch {
  console.error('\x1b[31m✗ build failed:\x1b[0m cannot read commit date for ' + BUILD_COMMIT);
  process.exit(1);
}

const G = '\x1b[32m', D = '\x1b[2m', R = '\x1b[0m', C = '\x1b[36m', Y = '\x1b[33m';
mkdirSync('dist/bend', { recursive: true });

const { docs, tree } = scan();
const routeSet = new Set(docs.map(d => d.route));
const alnum = (s) => 'd' + [...s].reduce((h, c) => ((h * 33 + c.charCodeAt(0)) >>> 0), 5381).toString(36);
const fileSlug = (route) => route.replace(/[\/.]/g, '__');
const textOf = (b) => (b.spans || []).map(s => s.text).join('').trim();

// synthesis layer (no source touched): a one-line lead pulled from the first real
// paragraph, used for the doc lead, pager cards, link-preview peeks, and the palette.
function summarize(blocks) {
  for (const b of blocks) {
    if (b.kind !== 'paragraph') continue;
    const t = textOf(b);
    if (t.length > 1) return t.length > 180 ? t.slice(0, 177).trimEnd() + '…' : t;
  }
  return '';
}
// the on-page outline: every heading below the title, pointing at the anchor the
// renderer already emits (id === block id), so the rail can scroll-spy the prose.
const outlineOf = (blocks) => blocks
  .filter(b => b.kind === 'heading' && b.level >= 2)
  .map(b => ({ id: b.id, text: textOf(b), level: Math.min(b.level, 4) }))
  .filter(h => h.text);

// resolve a markdown href, relative to the linking doc's directory, to a known route.
function resolveLink(fromRoute, href) {
  if (!href || /^[a-z]+:/i.test(href) || href.startsWith('#') || href.startsWith('//')) return null;
  const clean = href.split('#')[0].split('?')[0];
  if (!clean.endsWith('.md')) return null;
  const dir = posix.dirname(fromRoute);
  const target = posix.normalize(posix.join(dir, clean)).replace(/^\.\//, '');
  return routeSet.has(target) ? target : null;
}

// rewrite resolvable external-style links into internal {a, route} links so cross-doc
// references in the real docs become working navigation (and recorded edges).
function relink(blocks, fromRoute, sink) {
  const span = (s) => {
    if (s && typeof s === 'object' && s.x !== undefined) {
      const r = resolveLink(fromRoute, s.href);
      if (r) { sink.add(r); return { a: s.x, route: r }; }
    }
    return s;
  };
  const relinkSpans = (arr) => arr.map(span);
  return blocks.map(b => {
    const c = { ...b };
    if (c.spans) c.spans = c.spans.map(span);
    if (Array.isArray(c.items)) c.items = c.items.map(relinkSpans);     // list items: arrays of spans
    if (Array.isArray(c.head)) c.head = c.head.map(relinkSpans);        // table header cells
    if (Array.isArray(c.rows)) c.rows = c.rows.map(r => r.map(relinkSpans)); // table body cells
    return c;
  });
}

// ---- publication policy ----------------------------------------------------------------
// Applied BEFORE anything is built, because dist/index.html inlines every page the build knows
// about: a doc filtered out later would still ship its full text inside the SPA payload. See
// visibility.mjs. Nothing is dropped silently — every non-public route is named in the report.
const POLICY = loadPolicy();
// A document's own front matter outranks any filename pattern; a repository ceiling outranks
// the document. See visibility.mjs for the full precedence and why it is ordered that way.
const VIS = applyPolicy(POLICY, docs, (d) => declaredVisibility(posix.join(ROOT, d.source), d.route));
const PRIVATE = new Set(VIS.private);
const UNLISTED = new Set(VIS.unlisted);
const published = docs.filter(d => !PRIVATE.has(d.route));

const pages = [];
let totalEdges = 0, fixpointAll = true, fallbacks = 0;
const back = new Map(published.map(d => [d.route, []]));

for (const d of published) {
  let bsBlocks, html, links = new Set(), fellBack = false;
  try {
    const authored = relink(fileToBlocks(d.source), d.route, links);
    bsBlocks = toBlocks(authored);
    const doc = { bendscript: '0.1', id: alnum(d.route), vocabulary: 'ampersand.docs.fs.v1', blocks: bsBlocks, edges: [] };
    validate(doc);                          // throws → caught → fallback below
    var cidDoc = doc;
  } catch {
    fellBack = true; fallbacks++; links = new Set();
    const raw = readFileSync(posix.join(ROOT, d.source), 'utf8');
    bsBlocks = toBlocks([{ kind: 'heading', level: 1, spans: [d.title] }, { kind: 'code', text: raw, language: 'markdown' }]);
    cidDoc = { bendscript: '0.1', id: alnum(d.route), vocabulary: 'ampersand.docs.fs.v1', blocks: bsBlocks, edges: [] };
    validate(cidDoc);
  }

  const cid = await computeDocumentId(cidDoc);
  const final = { ...cidDoc, id: cid };
  const canonical = serializeCanonical(final);
  // round-trip fixpoint (the protocol's load-bearing claim), sampled across the whole corpus
  const p1 = parseAndNormalize(canonical);
  if ((await computeDocumentId(p1)) !== (await computeDocumentId(parseAndNormalize(serializeCanonical(p1))))) fixpointAll = false;
  writeFileSync(`dist/bend/${fileSlug(d.route)}.bend.json`, canonical);

  html = docHTML(bsBlocks);
  // A private doc is not in the build, so a resolved link to one would point at nothing.
  const linkArr = [...links].filter(r => !PRIVATE.has(r));
  totalEdges += linkArr.length;
  for (const r of linkArr) back.get(r)?.push(d.route);
  pages.push({ route: d.route, source: d.source, project: d.project, name: d.name,
    title: d.title, dir: posix.dirname(d.route), cid, html, text: plain(bsBlocks).slice(0, 400),
    summary: summarize(bsBlocks), outline: outlineOf(bsBlocks), links: linkArr, fellBack });
}

// ---- the site model -------------------------------------------------------------------
// Prune private routes out of the directory tree as well. The tree is embedded in the SPA
// model and drives its folder listings, so leaving them in would advertise documents the
// build deliberately withheld.
(function pruneTree(node) {
  node.files = node.files.filter(f => !PRIVATE.has(f.route));
  for (const [name, child] of [...node.dirs]) {
    pruneTree(child);
    if (!child.files.length && !child.dirs.size) node.dirs.delete(name);
  }
})(tree);

const byRoute = Object.fromEntries(pages.map(p => [p.route, p]));
for (const p of pages) p.back = (back.get(p.route) || []).map(r => ({ route: r, title: byRoute[r]?.title }));

// ---- homepage theme system: organize the real projects into Runefort bands -----------
const topDirs = treeToJSON(tree).dirs;                       // top-level project directories
const countOf = (n) => (n.files ? n.files.length : 0) + (n.dirs || []).reduce((a, d) => a + countOf(d), 0);
const firstSummary = (proj) => (pages.find(p => p.project === proj && p.summary) || {}).summary || '';
let kernelRoom = null;
const dirNames = new Set(topDirs.map(d => d.name));
const rooms = topDirs.map(d => {
  const meta = REGISTRY[d.name] || FALLBACK;
  const room = { route: d.name, name: d.name, mark: meta.mark, os: meta.os, status: meta.status,
    tagline: meta.tagline || firstSummary(d.name), count: countOf(d), band: meta.band };
  if (meta.kernel) kernelRoom = room;
  return room;
});
// virtual rooms: registry concepts with no directory of their own (e.g. SCOPE, whose canonical
// surface lives outside the doc mirror). They link out via href and carry no live doc count.
for (const [name, meta] of Object.entries(REGISTRY)) {
  if (!meta.virtual || dirNames.has(name)) continue;
  rooms.push({ route: meta.href || name, name, mark: meta.mark, os: meta.os, status: meta.status,
    tagline: meta.tagline, count: 0, band: meta.band, external: !!meta.href });
}
const bands = BANDS.map(b => ({ key: b.key, title: b.title,
  rooms: rooms.filter(r => r.band === b.key && r !== kernelRoom)
              .sort((a, c) => (a.status === c.status ? a.name.localeCompare(c.name) : 0)) }))
  .filter(b => b.rooms.length);
// orientation row: the top-level stack docs (README, CLAUDE, STACK_*, …) link straight to read
const meta = treeToJSON(tree).files.map(f => {
  const p = byRoute[f.route];
  return { route: f.route, name: f.title, file: f.name, summary: p ? p.summary : '' };
});
const home = { bands, kernel: kernelRoom, meta };

const model = {
  brand: 'Ampersand Box', author: 'Travis Burandt', subtitle: 'documentation for the [&] protocol stack',
  generatedAt: BUILD_DATE,
  commit: BUILD_COMMIT,
  count: pages.length, projects: [...new Set(pages.map(p => p.project))].sort(),
  tree: treeToJSON(tree),
  home,
  darkFactory: { steps: DARK_FACTORY_STEPS },
  order: pages.map(p => p.route),
  pages: pages.map(p => ({ route: p.route, source: p.source, project: p.project, title: p.title,
    name: p.name, dir: p.dir, cid: p.cid, html: p.html, text: p.text, summary: p.summary,
    outline: p.outline, links: p.links, back: p.back, fellBack: p.fellBack })),
};

// ---- agent sidecar: the full route⇄source map + cross-links ---------------------------
const atlas = {
  generatedAt: model.generatedAt, commit: BUILD_COMMIT, count: pages.length,
  note: 'route === source path. To open a doc on disk from the site, read the route. To find a doc’s page from a file, use its path as the route.',
  pages: pages.map(p => ({ route: p.route, source: p.source, title: p.title, project: p.project, links: p.links, backlinks: p.back.map(b => b.route) })),
};
writeFileSync('dist/atlas.json', JSON.stringify(atlas, null, 2));

// ---- HTML shell -----------------------------------------------------------------------
const CSS = readFileSync('shell-atlas.css', 'utf8');
const JS = readFileSync('shell-atlas.js', 'utf8');
// The shell is inlined into one <script>, so a single parse error silently blanks the whole
// site: the page still serves 200 with every doc baked in, but #app is never filled. Refuse
// to write a dist/ whose shell cannot parse.
try {
  execSync('node --check shell-atlas.js', { stdio: 'pipe' });
} catch (e) {
  console.error(`\nshell-atlas.js does not parse — refusing to build:\n${e.stderr.toString()}`);
  process.exit(1);
}
const page = `<!doctype html><html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="build-commit" content="${BUILD_COMMIT}">
<title>${model.brand} — stack docs atlas</title>
<meta name="description" content="${model.subtitle} — ${model.count} documents mirrored from ${model.projects.length} projects, each one a validated, content-addressed BendScript document.">
<link rel="canonical" href="${CANONICAL_HOST}/">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=Newsreader:opsz,wght@6..72,400;6..72,500;6..72,600&family=IBM+Plex+Mono:wght@400;500;600&display=swap" rel="stylesheet">
<script>try{var t=localStorage.getItem('atlas-theme')||(matchMedia('(prefers-color-scheme: light)').matches?'light':'dark');window.__atlasTheme=t;document.documentElement.setAttribute('data-theme',t);}catch(e){}</script>
<script type="module" src="amp-nav.js"></script>
<style>${CSS}</style></head><body>
<amp-nav property="docs"></amp-nav>
<script>try{document.querySelector('amp-nav').setAttribute('theme',window.__atlasTheme||'dark');}catch(e){}</script>
<div id="app"></div>
<script id="model" type="application/json">${JSON.stringify(model).replace(/</g, '\\u003c')}</script>
<script>${JS}</script></body></html>`;
writeFileSync('dist/index.html', page);
copyFileSync('amp-nav.js', 'dist/amp-nav.js');   // shared portfolio nav web component

// ---- prerender: one server-visible page per doc ----------------------------------------
// The shell above is hash-routed, so every doc in it shares one indexable URL. These files
// are the crawlable surface; see prerender.mjs for the measurement that motivated them.
const pre = prerender(pages, model, tree, UNLISTED);

// Remove anything dist/ still holds from a previous build. Required by the publication policy:
// a doc reclassified from public to private keeps its page, its .bend.json and its URL until
// the file is actually deleted, and dist/ is committed and deployed as-is.
const expected = new Set([
  'dist/.nojekyll', 'dist/index.html', 'dist/atlas.json', 'dist/amp-nav.js',
  ...pre.files,
  ...pages.map(p => `dist/bend/${fileSlug(p.route)}.bend.json`),
]);
const swept = sweepStale(expected);

// ---- report ---------------------------------------------------------------------------
console.log(`\n${C}stack docs atlas · build report${R}`);
console.log(`${D}────────────────────────────────────────${R}`);
console.log(`  ${G}✓${R} build provenance: ${BUILD_COMMIT}`);
console.log(`  ${G}✓${R} ${pages.length} real docs mirrored from ${model.projects.length} projects (no files moved)`);
console.log(`  ${G}✓${R} route === source path for every page (lossless agent round-trip)`);
console.log(`  ${G}✓${R} ${totalEdges} cross-doc links resolved to internal navigation`);
console.log(`  ${G}✓${R} every page is a validated, content-addressed BendScript document`);
console.log(`  ${G}✓${R} round-trip CID fixpoint holds across the corpus: ${fixpointAll}`);
console.log(`  ${fallbacks ? Y + '!' : G + '✓'}${R} ${fallbacks} doc(s) fell back to raw view (unparseable markdown)`);
console.log(`  ${G}✓${R} synthesis layer: ${pages.filter(p => p.summary).length} leads · ${pages.reduce((n, p) => n + p.outline.length, 0)} outline anchors (source untouched)`);
console.log(`  ${G}✓${R} dark-factory phases derived (${DARK_FACTORY_STEPS.length} steps):`);
for (const s of DARK_FACTORY_STEPS)
  console.log(`     ${D}${s.name}: ${s.rung ? s.rung + '  ←  ' + s.source : 'GAP — ' + s.gap}${R}`);
console.log(`${D}────────────────────────────────────────${R}`);
console.log(`  ${G}✓${R} ${pre.written} docs prerendered to server-visible HTML (was: 1 indexable URL for all of them)`);
// Publication policy: never silent. Every withheld or de-indexed route is named here, because
// a build that quietly drops documents reads as "we published everything" when it did not.
console.log(`  ${G}✓${R} publication policy: ${VIS.public.length} public · ${VIS.unlisted.length} unlisted · ${VIS.private.length} private`);
console.log(`     ${D}${VIS.declaredCount} ruled by the document's own front matter · the rest by pattern default${R}`);
// Declarations are for exceptions. One that restates the default is ceremony, and ceremony is
// how declarations stop being read.
if (VIS.redundant.length) {
  console.log(`  ${Y}!${R} ${VIS.redundant.length} redundant declaration(s) — they restate what the default already does:`);
  for (const r of VIS.redundant.slice(0, 5))
    console.log(`       ${D}· ${r.route} declares ${r.class}; ${r.wouldBe} already gives ${r.class}${R}`);
  console.log(`     ${D}remove them: a declaration should mark a decision, not repeat one${R}`);
}
// A ceiling silently overruling an author would be worse than having no declarations at all,
// because the author would believe the declaration took effect.
const byCeiling = new Map();
for (const o of VIS.overrides) {
  if (!byCeiling.has(o.by.match)) byCeiling.set(o.by.match, []);
  byCeiling.get(o.by.match).push(o);
}
for (const [match, list] of byCeiling) {
  const authored = list.filter(o => o.was === 'declared');
  console.log(`  ${Y}!${R} ceiling ${match} capped ${list.length} doc(s)` +
    (authored.length ? ` — ${Y}${authored.length} of them had declared otherwise${R}` : ` ${D}(none had declared; all were pattern/global defaults)${R}`));
  for (const o of authored)
    console.log(`       ${Y}· ${o.route} declared ${o.from} → forced ${o.by.max}${R}`);
}
for (const [label, list] of [['private (withheld entirely)', VIS.private], ['unlisted (noindex, not in sitemap)', VIS.unlisted]]) {
  if (!list.length) continue;
  console.log(`     ${Y}${label}${R}`);
  // Group by what decided it, so the report answers "why is this not public" per rule rather
  // than per file. `source` distinguishes a ruling the author made from one a pattern made.
  const why = new Map();
  for (const r of list) {
    const res = VIS.by.get(r);
    const k = res?.source === 'declared' ? 'declared in front matter' : (res?.rule?.match || '(global default)');
    why.set(k, (why.get(k) || []).concat(r));
  }
  for (const [match, routes] of why) {
    console.log(`       ${D}${match} → ${routes.length}${R}`);
    for (const r of routes.slice(0, 4)) console.log(`         ${D}· ${r}${R}`);
    if (routes.length > 4) console.log(`         ${D}  … +${routes.length - 4} more${R}`);
  }
}
// The review backlog: documents a filename cannot classify and which have not yet declared.
// Ruling one means adding `visibility:` to its front matter; it then drops off this list.
let unruled = 0;
for (const r of VIS.review) {
  unruled += r.undeclared.length;
  const state = r.undeclared.length ? `${Y}${r.undeclared.length} unruled${R}` : `${G}all ruled${R}`;
  console.log(`  ${r.undeclared.length ? Y + '?' : G + '✓'}${R} review: ${r.match} → ${r.hits.length} doc(s), ${state} ${D}— ${r.why.split('.')[0]}${R}`);
}
if (unruled) console.log(`     ${D}rule one by adding \`visibility: public|unlisted|private\` to its front matter${R}`);
if (swept.length) {
  console.log(`  ${Y}✓${R} ${swept.length} stale file(s) removed from dist/ (previously published, no longer produced)`);
  for (const f of swept.slice(0, 4)) console.log(`       ${D}· ${f}${R}`);
  if (swept.length > 4) console.log(`         ${D}… +${swept.length - 4} more${R}`);
}
console.log(`  ${G}✓${R} ${pre.hubs} directory hubs — every folder resolves, every doc gains a parent link`);
console.log(`  ${G}✓${R} canonical host: ${CANONICAL_HOST}  (one host for a corpus that three served identically)`);
console.log(`${D}────────────────────────────────────────${R}`);
console.log(`  → dist/index.html   (self-contained filesystem atlas)`);
console.log(`  → dist/<route>/index.html   (${pre.written} crawlable pages, canonical + JSON-LD)`);
console.log(`  → dist/sitemap.xml   (${pre.sitemap} URLs)`);
console.log(`  → dist/robots.txt`);
console.log(`  → dist/atlas.json   (route⇄source map for agents)`);
console.log(`  → dist/bend/*.bend.json   (${pages.length} content-addressed source docs)\n`);

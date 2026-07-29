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

// ---- explicit source-workspace root: provenance routing ---------------------------------
// When ATLAS_SOURCE_ROOT is set, resolve-root.mjs has already validated it (exists,
// has DOCTRINE.md, is a git repo, clean working tree). Here we route all git provenance
// commands through that root so HEAD and commit date come from the source tree.
const SOURCE_ROOT = process.env.ATLAS_SOURCE_ROOT;
const GIT_PREFIX = SOURCE_ROOT ? `git -C "${SOURCE_ROOT}"` : 'git';

// ---- build provenance: derived from git, never invented ---------------------------------
// The commit hash is the immutable anchor that lets a deployment be traced back to its
// exact source. If HEAD cannot be resolved, the build fails — a deployment without
// provenance is worse than no deployment, because it looks traceable but isn't.
// When an explicit source root is provided, provenance is derived from THAT repo's HEAD.
//
// Self-referential churn fix: in the default (no explicit root) case, provenance is
// derived from the last commit that touched SOURCE files (excluding dist/), not from HEAD.
// This breaks the cycle where committing dist/ changes HEAD, which changes the embedded
// hash, which requires another commit. The dist/ directory is a build artifact — its
// commit hash should reflect what was built, not the act of saving the build output.
let BUILD_COMMIT;
try {
  if (SOURCE_ROOT) {
    // Explicit source root: use that repo's HEAD (already stable — different tree)
    BUILD_COMMIT = execSync(`${GIT_PREFIX} rev-parse HEAD`, { encoding: 'utf8' }).trim();
  } else {
    // Default monorepo: last commit touching source files (not dist/)
    BUILD_COMMIT = execSync(`git log -1 --format=%H -- . ":(exclude)dist"`, { encoding: 'utf8' }).trim();
    if (!BUILD_COMMIT) {
      // Fallback for fresh repos where no non-dist commit exists yet
      BUILD_COMMIT = execSync('git rev-parse HEAD', { encoding: 'utf8' }).trim();
    }
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
  BUILD_DATE = execSync(`${GIT_PREFIX} log -1 --format=%ci ${BUILD_COMMIT}`, { encoding: 'utf8' }).trim().slice(0, 10);
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

const pages = [];
let totalEdges = 0, fixpointAll = true, fallbacks = 0;
const back = new Map(docs.map(d => [d.route, []]));

for (const d of docs) {
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
  const linkArr = [...links];
  totalEdges += linkArr.length;
  for (const r of linkArr) back.get(r)?.push(d.route);
  pages.push({ route: d.route, source: d.source, project: d.project, name: d.name,
    title: d.title, dir: posix.dirname(d.route), cid, html, text: plain(bsBlocks).slice(0, 400),
    summary: summarize(bsBlocks), outline: outlineOf(bsBlocks), links: linkArr, fellBack });
}

// ---- the site model -------------------------------------------------------------------
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
const page = `<!doctype html><html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="build-commit" content="${BUILD_COMMIT}">
<title>${model.brand} — stack docs atlas</title>
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
console.log(`  → dist/index.html   (self-contained filesystem atlas)`);
console.log(`  → dist/atlas.json   (route⇄source map for agents)`);
console.log(`  → dist/bend/*.bend.json   (${pages.length} content-addressed source docs)\n`);

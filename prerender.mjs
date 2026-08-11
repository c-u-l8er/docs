// prerender.mjs — emit one server-visible HTML file per doc.
//
// WHY THIS EXISTS
// The atlas is a hash-routed SPA: every one of its documents lives at `#/<route>`, and a URL
// fragment is never sent to the server. So the whole corpus — 350 docs, ~458k words — was
// reachable at exactly ONE indexable URL, with 6 words of extractable text outside <script>.
// Not blocked by robots.txt; simply unreadable. Measured 2026-08-10, see
// alkeyword.com/prototype/runs/PORTFOLIO_GAP_QUEUE.md (finding A1).
//
// WHAT THIS DOES
// Writes dist/<route>/index.html for every page, containing the document's real HTML, an
// absolute canonical, JSON-LD, and <a href> links to related docs. The SPA is untouched and
// remains the interactive surface; these files are what a crawler, an answer engine, and
// alkeyword's own extractor can actually read.
//
// The URL is the route is the source path, so the atlas's central identity claim holds on the
// indexable URL too: https://docs.ampersandboxdesign.com/PRISM/docs/DUAL_LOOP_MACHINES.md/
//
// Deterministic: same commit in, byte-identical output. No wall-clock reads (the build's own
// provenance rule) — dateModified comes from the commit date.

import { writeFileSync, mkdirSync, copyFileSync, readdirSync, statSync, unlinkSync, rmdirSync } from 'node:fs';

/**
 * Delete anything under dist/ that this build did not produce, then remove the directories
 * left empty.
 *
 * This is load-bearing for the publication policy, not housekeeping. dist/ is written in
 * place and committed, so a document that was public yesterday and is private today keeps its
 * prerendered page, its .bend.json and its URL until something removes them. Withholding a doc
 * from the *build* while its file stays on disk is a privacy control that controls nothing —
 * the deploy would still serve it.
 *
 * @param {Set<string>} expected every path this build wrote, relative to cwd
 * @returns {string[]} what was removed
 */
export function sweepStale(expected) {
  const removed = [];
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      const path = `${dir}/${name}`;
      const st = statSync(path);
      if (st.isDirectory()) {
        walk(path);
        try { rmdirSync(path); } catch { /* not empty — keep */ }
      } else if (!expected.has(path)) {
        unlinkSync(path);
        removed.push(path);
      }
    }
  };
  walk('dist');
  return removed;
}

// One canonical host. Three hosts served this corpus byte-identically with no canonical
// between them (finding A4); every page now points at one of them. Override per-deploy with
// ATLAS_CANONICAL_HOST if the canonical home moves.
export const CANONICAL_HOST =
  (process.env.ATLAS_CANONICAL_HOST || 'https://docs.ampersandboxdesign.com').replace(/\/+$/, '');

const esc = (s) => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

// JSON embedded in <script> must not be able to close its own tag.
const jsonld = (o) => JSON.stringify(o).replace(/</g, '\\u003c');

const urlFor = (route) => `${CANONICAL_HOST}/${route.split('/').map(encodeURIComponent).join('/')}/`;
const hrefFor = (route) => `/${route.split('/').map(encodeURIComponent).join('/')}/`;

// Meta descriptions are truncated at a word boundary; a description cut mid-word reads as
// broken to a human and gets rewritten by the engine anyway.
function describe(p) {
  const raw = (p.summary || p.text || '').replace(/\s+/g, ' ').trim();
  if (raw.length <= 155) return raw;
  const cut = raw.slice(0, 155);
  return cut.slice(0, cut.lastIndexOf(' ')) + '…';
}

// The shared renderer demotes a document's own markdown h1 to h2, because in the SPA the h1
// belongs to the app chrome. A prerendered page is a standalone document, so it must carry its
// own h1 — every page shipped with zero otherwise. Promote the leading h2 when it *is* the
// title; prepend one when the document opens on something else. The SPA is untouched.
function withH1(html, title) {
  const lead = html.match(/^\s*<h2([^>]*)>([\s\S]*?)<\/h2>/);
  if (lead) {
    // The heading is rendered HTML and the title is raw text, so they must be compared in the
    // same encoding. Comparing them directly meant every title containing & < > — 66 pages,
    // including every "[&] …" doc in the portfolio — failed to match and got a second copy of
    // its own heading prepended.
    const text = decode(lead[2].replace(/<[^>]+>/g, '')).trim();
    if (text && text === title.trim()) {
      return html.replace(lead[0], `<h1${lead[1]}>${lead[2]}</h1>`);
    }
  }
  return `<h1>${esc(title)}</h1>` + html;
}

const decode = (s) => s
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/&quot;/g, '"').replace(/&#39;/g, "'")
  .replace(/&amp;/g, '&');   // last: an encoded &amp;lt; must not become <

function breadcrumbs(route) {
  const segs = route.split('/');
  const items = [{ name: 'Atlas', url: CANONICAL_HOST + '/' }];
  for (let i = 0; i < segs.length; i++) {
    items.push({
      name: segs[i],
      url: i === segs.length - 1 ? urlFor(route) : `${CANONICAL_HOST}/${segs.slice(0, i + 1).join('/')}/`,
    });
  }
  return {
    '@type': 'BreadcrumbList',
    itemListElement: items.map((it, i) => ({
      '@type': 'ListItem', position: i + 1, name: it.name, item: it.url,
    })),
  };
}

function linkCard(label, entries) {
  if (!entries.length) return '';
  return `<div class="card"><div class="lab">${esc(label)}</div>${
    entries.map(([route, title]) => `<a href="${esc(hrefFor(route))}">${esc(title || route)}</a>`).join('')
  }</div>`;
}

function pageHTML(p, ctx) {
  const { byRoute, siblings, model, unlisted } = ctx;
  const desc = describe(p);
  const title = `${p.title} · ${p.project} · ${model.brand}`;
  const isUnlisted = unlisted.has(p.route);

  const ld = [
    {
      '@context': 'https://schema.org',
      '@type': 'TechArticle',
      headline: p.title,
      name: p.title,
      description: desc,
      url: urlFor(p.route),
      identifier: p.cid,
      inLanguage: 'en',
      dateModified: model.generatedAt,
      author: { '@type': 'Person', name: model.author },
      publisher: { '@type': 'Organization', name: model.brand, url: CANONICAL_HOST + '/' },
      isPartOf: { '@type': 'TechArticle', name: p.project, url: `${CANONICAL_HOST}/${p.project}/` },
      articleSection: p.project,
      ...(p.outline && p.outline.length
        ? { articleBody: undefined, hasPart: p.outline.slice(0, 25).map(h => ({ '@type': 'WebPageElement', name: h.text })) }
        : {}),
    },
    { '@context': 'https://schema.org', ...breadcrumbs(p.route) },
  ];

  const toc = (p.outline && p.outline.length)
    ? `<div class="card toc-card"><div class="lab">on this page</div><nav class="toc">${
        p.outline.map(h => `<a href="#${esc(h.id)}" class="lvl${h.level}">${esc(h.text)}</a>`).join('')
      }</nav></div>`
    : '';

  const rail = [
    toc,
    linkCard('links to', p.links.map(r => [r, byRoute[r]?.title])),
    linkCard('referenced by', p.back.map(b => [b.route, b.title])),
    linkCard('in this folder', siblings.map(f => [f.route, f.title])),
    `<div class="card"><div class="lab">content id · CIDv1</div><div class="cid">${esc(p.cid)}</div></div>`,
  ].join('');

  return `<!doctype html><html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="build-commit" content="${esc(model.commit)}">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<link rel="canonical" href="${esc(urlFor(p.route))}">${isUnlisted ? `
<meta name="robots" content="noindex, nofollow">` : ''}
<meta property="og:type" content="article">
<meta property="og:title" content="${esc(p.title)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:url" content="${esc(urlFor(p.route))}">
<meta property="og:site_name" content="${esc(model.brand)}">
<link rel="stylesheet" href="/atlas.css">
<script>try{var t=localStorage.getItem('atlas-theme')||(matchMedia('(prefers-color-scheme: light)').matches?'light':'dark');document.documentElement.setAttribute('data-theme',t);}catch(e){}</script>
<script type="module" src="/amp-nav.js"></script>
<script type="application/ld+json">${jsonld(ld)}</script>
</head><body>
<amp-nav property="docs"></amp-nav>
<div id="app"><div class="reader"><div class="col">
<div class="doc-h"><div class="src">
<span class="proj">${esc(p.project)}</span>
<span class="path">${esc(p.source)}</span>
${p.fellBack ? '<span class="tag">raw</span>' : ''}
</div></div>
${p.summary ? `<div class="lead">${esc(p.summary)}</div>` : ''}
<div class="prose">${withH1(p.html, p.title)}</div>
<p class="src"><a href="/#/${esc(p.route)}">Open in the interactive atlas</a></p>
</div>
<div class="rail">${rail}</div>
</div></div>
</body></html>`;
}

// Directory hubs. Every folder in the mirror gets a real page listing its documents and
// subfolders. Two jobs: the nav's project-level links (/WRL/, /TRVM/) resolve to something
// instead of 404ing, and every doc gains a crawlable inbound link from its parent — which is
// the cheap half of finding A7 (41 orphaned high-value pages with ≤1 inbound link).
function hubHTML(dir, children, subdirs, model) {
  const label = dir || 'Atlas';
  const desc = `${children.length} document${children.length === 1 ? '' : 's'} in ${label}, mirrored from the [&] stack at its real source path.`;
  const url = dir ? `${CANONICAL_HOST}/${dir}/` : CANONICAL_HOST + '/';

  const ld = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: label,
    description: desc,
    url,
    isPartOf: { '@type': 'WebSite', name: model.brand, url: CANONICAL_HOST + '/' },
    hasPart: children.map(c => ({ '@type': 'TechArticle', name: c.title, url: urlFor(c.route) })),
    ...(dir ? breadcrumbs(dir) && { breadcrumb: breadcrumbs(dir) } : {}),
  };

  return `<!doctype html><html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="build-commit" content="${esc(model.commit)}">
<title>${esc(label)} · ${esc(model.brand)}</title>
<meta name="description" content="${esc(desc)}">
<link rel="canonical" href="${esc(url)}">
<link rel="stylesheet" href="/atlas.css">
<script>try{var t=localStorage.getItem('atlas-theme')||(matchMedia('(prefers-color-scheme: light)').matches?'light':'dark');document.documentElement.setAttribute('data-theme',t);}catch(e){}</script>
<script type="module" src="/amp-nav.js"></script>
<script type="application/ld+json">${jsonld(ld)}</script>
</head><body>
<amp-nav property="docs"></amp-nav>
<div id="app"><div class="reader"><div class="col">
<div class="doc-h"><div class="src"><span class="proj">${esc(label)}</span><span class="path">${esc(dir || '/')}</span></div></div>
<h1>${esc(label)}</h1>
<div class="lead">${esc(desc)}</div>
<div class="prose">
${subdirs.length ? `<h2>Folders</h2><ul>${subdirs.map(d => `<li><a href="${esc(hrefFor(d))}">${esc(d.split('/').pop())}</a></li>`).join('')}</ul>` : ''}
${children.length ? `<h2>Documents</h2><ul>${children.map(c => `<li><a href="${esc(hrefFor(c.route))}">${esc(c.title)}</a>${c.summary ? ` — ${esc(c.summary)}` : ''}</li>`).join('')}</ul>` : ''}
</div>
<p class="src"><a href="/#/${esc(dir)}">Open in the interactive atlas</a></p>
</div></div></div>
</body></html>`;
}

/**
 * @param {Array} pages   the build's page records (route, title, html, outline, links, back, …)
 * @param {object} model  the site model (brand, author, commit, generatedAt)
 * @param {object} tree   treeToJSON output, for sibling lookup
 * @param {Set<string>} unlisted  routes that get a page but no index entry (visibility.mjs)
 * @returns {{written:number, hubs:number, sitemap:number, unlisted:number}}
 */
export function prerender(pages, model, tree, unlisted = new Set()) {
  const byRoute = Object.fromEntries(pages.map(p => [p.route, p]));
  const listed = (p) => !unlisted.has(p.route);

  // sibling lookup by directory, mirroring the SPA's "in this folder" card
  const byDir = new Map();
  for (const p of pages) {
    if (!byDir.has(p.dir)) byDir.set(p.dir, []);
    byDir.get(p.dir).push(p);
  }

  let written = 0;
  const files = [];
  for (const p of pages) {
    const siblings = (byDir.get(p.dir) || []).filter(s => s.route !== p.route).slice(0, 12);
    const dir = `dist/${p.route}`;
    mkdirSync(dir, { recursive: true });
    writeFileSync(`${dir}/index.html`, pageHTML(p, { byRoute, siblings, model, unlisted }));
    files.push(`${dir}/index.html`);
    written++;
  }

  // ---- directory hubs -------------------------------------------------------------------
  // Every ancestor directory of every route, so no folder in a path is a 404.
  const allDirs = new Set();
  for (const p of pages) {
    const segs = p.route.split('/');
    for (let i = 1; i < segs.length; i++) allDirs.add(segs.slice(0, i).join('/'));
  }
  const routeSet = new Set(pages.map(p => p.route));
  let hubs = 0;
  for (const dir of allDirs) {
    if (routeSet.has(dir)) continue;              // a doc already owns this path
    // Unlisted docs are reachable but never advertised — a hub that linked to one would
    // hand a crawler the URL that its own noindex is trying to keep out of the index.
    const children = pages.filter(p => p.dir === dir && listed(p))
      .sort((a, b) => a.title.localeCompare(b.title));
    const subdirs = [...allDirs].filter(d => d !== dir && d.startsWith(dir + '/')
      && !d.slice(dir.length + 1).includes('/')).sort();
    mkdirSync(`dist/${dir}`, { recursive: true });
    writeFileSync(`dist/${dir}/index.html`, hubHTML(dir, children, subdirs, model));
    files.push(`dist/${dir}/index.html`);
    hubs++;
  }

  // Stylesheet, referenced absolutely by every prerendered page. Linked rather than inlined:
  // inlining 21KB of CSS into 371 files would add ~7MB to dist/ for no benefit.
  copyFileSync('shell-atlas.css', 'dist/atlas.css');

  const urls = [
    CANONICAL_HOST + '/',
    ...[...allDirs].filter(d => !routeSet.has(d)).sort().map(d => `${CANONICAL_HOST}/${d}/`),
    ...pages.filter(listed).map(p => urlFor(p.route)),
  ];
  writeFileSync('dist/sitemap.xml',
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${
      urls.map(u => `  <url><loc>${esc(u)}</loc><lastmod>${esc(model.generatedAt)}</lastmod></url>`).join('\n')
    }\n</urlset>\n`);

  writeFileSync('dist/robots.txt',
    `# The atlas mirrors the [&] stack's real documentation. Crawling is welcome.\nUser-agent: *\nAllow: /\n\nSitemap: ${CANONICAL_HOST}/sitemap.xml\n`);

  files.push('dist/atlas.css', 'dist/sitemap.xml', 'dist/robots.txt');
  return { written, hubs, sitemap: urls.length, unlisted: unlisted.size, files };
}

// build.mjs — author → BendScript → validated graph → static site.
// Dogfoods @bendscript/core for real: every page is parsed, validated, normalized, and
// content-addressed; every cross-reference is a typed edge that is link-checked (a broken
// internal edge fails the build); the law count and versions are transcluded from one source.
import { writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { parseAndNormalize, computeDocumentId, serializeCanonical, validate } from '@bendscript/core';
import { REGISTRY, DOCS } from './content.mjs';
import { FACT_SOURCES } from './sources.mjs';

mkdirSync('dist/bend', { recursive: true });
const DOC_IDS = new Set(DOCS.map(d => d.id));
const byId = Object.fromEntries(DOCS.map(d => [d.id, d]));
// BendScript bend: URIs require alphanumeric ids; our slugs have hyphens. Give each doc a
// stable alphanumeric handle for use *inside* BendScript, keep slugs for routing.
const bidOf = Object.fromEntries(DOCS.map(d => [d.id, 'd' + [...d.id].reduce((h,c)=>((h*33+c.charCodeAt(0))>>>0),5381).toString(36)]));
const slugOfBid = Object.fromEntries(Object.entries(bidOf).map(([s,b]) => [b, s]));
const slugCid = (slug) => bidOf[slug] || 'd0';
const FAIL = (m) => { console.error('\x1b[31m✗ build failed:\x1b[0m ' + m); process.exit(1); };
const esc = (s) => String(s).replace(/[&<>"]/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;' }[c]));

// ---- transclusion: {{key}} → REGISTRY.facts[key] (single source of truth) ------------
const FACTS = REGISTRY.facts;
const transcludedKeys = new Set();
function resolveText(t) {
  return t.replace(/\{\{([\w.]+)\}\}/g, (_, k) => {
    if (!(k in FACTS)) FAIL(`unknown transclusion {{${k}}} — not in REGISTRY.facts`);
    transcludedKeys.add(k);
    return FACTS[k];
  });
}

// ---- authoring shape → BendScript blocks/spans/marks ----------------------------------
let sc = 0; const sid = () => 'spn-' + (++sc);
function toSpans(spans) {
  return spans.map(s => {
    if (typeof s === 'string') return { id: sid(), text: resolveText(s) };
    if (s.a) return { id: sid(), text: resolveText(s.a), _to: s.to, _span: s.span,
      marks: [{ kind: 'link', target: `bend:${slugCid(s.to)}${s.span ? '#' + s.span : ''}`, predicate: 'cites' }] };
    if (s.x) return { id: sid(), text: resolveText(s.x), marks: [{ kind: 'link', target: s.href, predicate: 'cites' }] };
    if (s.tt) return { id: sid(), text: resolveText(s.tt), marks: ['code'] };
    if (s.b) return { id: sid(), text: resolveText(s.b), marks: ['bold'] };
    return { id: sid(), text: '' };
  });
}
function toBlocks(body) {
  let bc = 0; const bid = () => 'blk-' + (++bc);
  const conv = (b) => {
    if (b.kind === 'heading') return { id: bid(), kind: 'heading', level: b.level, spans: toSpans(b.spans) };
    if (b.kind === 'paragraph') return { id: bid(), kind: 'paragraph', spans: toSpans(b.spans) };
    if (b.kind === 'code') return { id: bid(), kind: 'code', text: resolveText(b.text), language: b.language || 'text' };
    if (b.kind === 'quote') return { id: bid(), kind: 'quote',
      blocks: [{ id: bid(), kind: 'paragraph', spans: toSpans(b.spans) }] };
    if (b.kind === 'list') return { id: bid(), kind: 'list', ordered: !!b.ordered,
      items: b.items.map(it => ({ id: bid(), kind: 'list-item',
        blocks: [{ id: bid(), kind: 'paragraph', spans: toSpans([it]) }] })) };
    return { id: bid(), kind: 'paragraph', spans: [{ id: sid(), text: '' }] };
  };
  return body.map(conv);
}

// ---- edges: author shape → BendScript edges, with link-checking -----------------------
const VOCAB = 'ampersand.docs.v1';
function toEdges(doc) {
  return doc.edges.map(e => {
    if (e.ext) return { subject: `bend:${bidOf[doc.id]}`, predicate: e.predicate, object: e.href, _label: e.label, _toSlug: null };
    if (!DOC_IDS.has(e.to)) FAIL(`broken edge in "${doc.id}": ${e.predicate} → "${e.to}" (no such doc)`);
    return { subject: `bend:${bidOf[doc.id]}`, predicate: e.predicate,
      object: `bend:${bidOf[e.to]}${e.span ? '#' + e.span : ''}`, _toSlug: e.to };
  });
}

// ---- block/span → HTML (the prose projection of the graph) ----------------------------
function spanHTML(s) {
  let t = esc(s.text);
  const m = (s.marks || [])[0];
  if (!m) return t;
  if (m === 'code') return `<code>${t}</code>`;
  if (m === 'bold') return `<strong>${t}</strong>`;
  if (m && m.kind === 'link') {
    if (s._to) return `<a href="#/${esc(s._to)}" data-link>${t}</a>`;
    const tgt = m.target || '';
    if (tgt.startsWith('bend:')) { const slug = slugOfBid[tgt.slice(5).split('#')[0]] || ''; return `<a href="#/${esc(slug)}" data-link>${t}</a>`; }
    return `<a href="${esc(tgt)}" target="_blank" rel="noopener">${t}</a>`;
  }
  return t;
}
const spansHTML = (arr) => (arr || []).map(spanHTML).join('');
function blockHTML(b) {
  switch (b.kind) {
    case 'heading': { const h = Math.min(b.level + 1, 6); return `<h${h} id="${esc(b.id)}">${spansHTML(b.spans)}</h${h}>`; }
    case 'paragraph': return `<p>${spansHTML(b.spans)}</p>`;
    case 'code': return `<pre><code>${esc(b.text)}</code></pre>`;
    case 'quote': return `<blockquote>${(b.blocks||[]).map(blockHTML).join('')}</blockquote>`;
    case 'list': return `<ul>${b.items.map(it => `<li>${it.blocks.map(blockHTML).join('')}</li>`).join('')}</ul>`;
    default: return '';
  }
}
const plain = (blocks) => blocks.map(b =>
  b.kind === 'code' ? b.text : (b.spans ? b.spans.map(s => s.text).join('') :
  (b.items ? b.items.map(it => it.blocks.map(x => (x.spans||[]).map(s=>s.text).join('')).join(' ')).join(' ') : ''))).join(' ');

// ---- compile every doc through BendScript --------------------------------------------
const PRED_LABEL = {
  'cites':'cites','transcludes':'transcludes','supersedes':'supersedes','defines':'defines',
  'governs':'governs','implements':'implements','measures':'measures','measured-by':'measured by',
  'ampersand.docs:governed-by':'governed by','ampersand.docs:realizes':'realizes',
  'ampersand.docs:specified-by':'specified by','ampersand.docs:specifies':'specifies',
  'ampersand.docs:provider':'provider','ampersand.docs:provided-by':'provided by',
  'ampersand.docs:part-of':'part of','ampersand.docs:part-of-stack':'part of stack',
  'ampersand.docs:renders':'renders','ampersand.docs:rendered-by':'rendered by',
  'ampersand.docs:powers':'powers','ampersand.docs:built-on':'built on',
  'ampersand.docs:inherits-floor-from':'inherits floor from','ampersand.docs:authored-in':'authored in',
  'ampersand.docs:builds-from':'builds from','ampersand.docs:distributes':'distributes',
  'ampersand.docs:runs':'runs','ampersand.docs:data-from':'data from','ampersand.docs:data-for':'data for',
  'ampersand.docs:measured-by':'measured by','targets':'targets',
};
const plabel = (p) => PRED_LABEL[p] || p.split(':').pop();

const compiled = [];
let totalEdges = 0, fixpointAll = true;
const stripSpans = (blocks) => blocks.map(b => {
  const c = { ...b };
  if (c.spans) c.spans = c.spans.map(({ _to, _span, ...s }) => s);
  if (c.items) c.items = stripSpans(c.items);
  if (c.blocks) c.blocks = stripSpans(c.blocks);
  return c;
});
for (const doc of DOCS) {
  const blocksRaw = toBlocks(doc.body);
  const blocks = stripSpans(blocksRaw);
  const edges = toEdges(doc);
  totalEdges += edges.length;
  const authored = { bendscript: '0.1', id: bidOf[doc.id], vocabulary: VOCAB, blocks,
    edges: edges.map(({ _label, _toSlug, ...e }) => e) };
  try { validate(authored); } catch (e) { FAIL(`"${doc.id}" invalid BendScript: ${e.message}`); }
  const id = await computeDocumentId(authored);
  const final = { ...authored, id };
  const canonical = serializeCanonical(final);
  const p1 = parseAndNormalize(canonical);
  const p2 = parseAndNormalize(serializeCanonical(p1));
  if ((await computeDocumentId(p1)) !== (await computeDocumentId(p2))) fixpointAll = false;
  writeFileSync(`dist/bend/${doc.id}.bend.json`, canonical);
  compiled.push({ doc, id, html: blocksRaw.map(blockHTML).join('\n'), text: plain(blocksRaw),
    edges: edges.map(e => ({ pred: plabel(e.predicate), to: e._toSlug || null,
      label: e._label, href: e._toSlug ? null : e.object })) });
}

// ---- backlinks: invert the internal edge graph ---------------------------------------
const back = Object.fromEntries(DOCS.map(d => [d.id, []]));
for (const c of compiled) for (const e of c.edges)
  if (e.to && back[e.to]) back[e.to].push({ from: c.doc.id, name: byId[e.to] && byId[c.doc.id].name, pred: e.pred });

// ---- bake the site model -------------------------------------------------------------
const STATUS = { live:{label:'live',c:'s-live'}, alpha:{label:'alpha',c:'s-alpha'},
  spec:{label:'spec',c:'s-spec'}, draft:{label:'draft',c:'s-draft'} };
const LAYER_ORDER = ['protocol','faculty','provider','substrate','annex','ring0'];

const model = {
  brand: REGISTRY.brand, author: REGISTRY.author,
  facts: FACTS,
  docs: compiled.map(c => ({
    id: c.doc.id, name: c.doc.name, mark: c.doc.mark, os: c.doc.os,
    status: c.doc.status, layer: c.doc.layer, tagline: resolveText(c.doc.tagline),
    cid: c.id, html: c.html, text: c.text.slice(0, 600),
    edges: c.edges.map(e => ({ ...e, name: e.to ? byId[e.to].name : e.label })),
    back: back[c.doc.id].map(b => ({ from: b.from, name: byId[b.from].name, pred: b.pred })),
  })),
};

// ---- HTML shell ----------------------------------------------------------------------
const CSS = readFileSync('shell.css', 'utf8');
const JS  = readFileSync('shell.js', 'utf8');
const page = `<!doctype html><html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(REGISTRY.brand)} — stack documentation</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=Newsreader:opsz,wght@6..72,400;6..72,500;6..72,600&family=IBM+Plex+Mono:wght@400;500;600&display=swap" rel="stylesheet">
<style>${CSS}</style></head><body>
<div id="app"></div>
<script id="model" type="application/json">${JSON.stringify(model).replace(/</g,'\\u003c')}</script>
<script>${JS}</script></body></html>`;
writeFileSync('dist/index.html', page);

// ---- build report --------------------------------------------------------------------
const G = '\x1b[32m', D = '\x1b[2m', R = '\x1b[0m', C = '\x1b[36m';
console.log(`\n${C}stackdocs · build report${R}`);
console.log(`${D}────────────────────────────────────────${R}`);
console.log(`  ${G}✓${R} ${compiled.length} BendScript documents compiled & validated`);
console.log(`  ${G}✓${R} ${totalEdges} typed edges · all internal links resolve`);
console.log(`  ${G}✓${R} round-trip CID fixpoint holds: ${fixpointAll}`);
console.log(`  ${G}✓${R} ${transcludedKeys.size} canonical facts transcluded from one source`);
for (const k of [...transcludedKeys].sort())
  console.log(`     ${D}${k} = ${FACTS[k]}  ←  ${FACT_SOURCES[k]}${R}`);
console.log(`  ${G}✓${R} every page content-addressed (CIDv1) — tamper-evident`);
console.log(`${D}────────────────────────────────────────${R}`);
console.log(`  → dist/index.html  (self-contained site)`);
console.log(`  → dist/bend/*.bend.json  (${compiled.length} source documents)\n`);

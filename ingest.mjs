// ingest.mjs — pull real spec markdown into the same authoring shapes content.mjs uses.
// This is the piece the prototype README called "the only stub": instead of hand-pasting
// prose, a page can pull a named section straight out of a project's real docs/spec file.
// The section is parsed into BendScript-block authoring shapes and flows through the same
// validate → content-address → render pipeline as hand-authored pages. A missing file or a
// renamed section is a HARD build failure (like a broken edge), so docs can't silently
// drift from the spec they quote.
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { findRoot } from './resolve-root.mjs';

const ROOT = findRoot(import.meta.url);
const FAIL = (m) => { console.error('\x1b[31m✗ ingest failed:\x1b[0m ' + m); process.exit(1); };

export { mdToBlocks };

// Read a whole doc file → authoring blocks. Used by the filesystem-mirror build, which
// ingests hundreds of diverse real files: this must never throw. The build still validates
// the produced BendScript and falls back to a raw code block when a file won't parse, so a
// gnarly doc degrades to readable preformatted text instead of failing the whole site.
export function fileToBlocks(relPath) {
  const md = readFileSync(join(ROOT, relPath), 'utf8'); // caller guarantees the path exists
  const blocks = mdToBlocks(md);
  return blocks.length ? blocks : [{ kind: 'paragraph', spans: [''] }];
}

// ---- inline: **bold**, *italic*, `code`, [text](url) → span-shape array ----------------
// Italic is last in the alternation so **bold** claims a doubled star first. Its opener is
// anchored to a boundary and its closer forbidden a word character, because a lone `*` is
// far more often a glob than an emphasis: `vectors/*.json` and `incrdt*.py` must not pair
// up across half a paragraph. Underscores are deliberately NOT an italic marker here —
// `active_world_semantic_id` appears in this corpus as prose, not as emphasis.
function inline(text) {
  const out = [];
  const re = /\*\*([^*]+)\*\*|`([^`]+)`|\[([^\]]+)\]\(([^)]+)\)|(?:^|(?<=[\s("[]))\*([^\s*][^*]*?)\*(?![\w*])/g;
  let last = 0, m;
  const push = (s) => { if (s) out.push(s); };
  while ((m = re.exec(text))) {
    push(text.slice(last, m.index));
    if (m[1] !== undefined) out.push({ b: m[1] });
    else if (m[2] !== undefined) out.push({ tt: m[2] });
    else if (m[5] !== undefined) out.push({ i: m[5] });
    else out.push({ x: m[3], href: m[4] });
    last = re.lastIndex;
  }
  push(text.slice(last));
  return out.length ? out : [''];
}
// split one markdown table row into cells, each parsed to an inline-span array so links,
// code, and bold inside table cells survive (the dominant place cross-doc refs live).
const tableCells = (row) => row.trim().replace(/^\s*\|/, '').replace(/\|\s*$/, '').split('|').map(c => inline(c.trim()));
const isTableSep = (l) => l !== undefined && /^\s*\|?[\s:|-]+\|?\s*$/.test(l) && /-/.test(l);
const BULLET = /^\s*[-*]\s+/, NUMBERED = /^\s*\d+[.)]\s+/;

// ---- MyST/Sphinx directive fences -----------------------------------------------------
// The project docs are real Sphinx sources (conf.py + .readthedocs.yaml in a dozen repos),
// so the navigation of every docs index lives in a ```{toctree} / :::{toctree} block. Read
// as plain markdown that is just an unlabelled fence, and it renders as a wall of literal
// `Title <https://…>` lines — the most link-dense part of the corpus, shown as dead text.
// Parse the directive into what it means instead: a captioned list of links. The source is
// left alone, so Sphinx keeps its nav tree and the atlas stops mangling it.
//
// A toctree entry is `Title <target>` or a bare target. A non-URL target is an
// extension-less path to a sibling document, so give it back the `.md` the atlas routes by
// — then build-atlas's relink() resolves it into real internal navigation.
const tocHref = (t) =>
  (/^[a-z][a-z0-9+.-]*:/i.test(t) || t.startsWith('//') || t.startsWith('#') || /\.\w+$/.test(t)) ? t : t + '.md';

function directiveBlocks(name, body) {
  const opts = {};
  let k = 0;
  for (; k < body.length; k++) {                     // leading `:key: value` option lines
    const o = body[k].match(/^\s*:([a-z-]+):\s*(.*)$/);
    if (!o) break;
    opts[o[1]] = o[2].trim();
  }
  const rest = body.slice(k);
  // anything that isn't a toctree keeps its body as preformatted text rather than being
  // silently dropped — a directive we don't model should still be readable.
  if (name !== 'toctree') {
    const t = rest.join('\n').trim();
    return t ? [{ kind: 'code', text: t, language: 'text' }] : [];
  }
  const items = [];
  for (const raw of rest) {
    const l = raw.trim();
    if (!l || l.startsWith('#')) continue;
    const m = l.match(/^(.*?)\s*<([^>]+)>$/);
    const target = (m ? m[2] : l).trim();
    const label = (m ? m[1].trim() : '') || target.replace(/\/$/, '').split('/').pop();
    items.push([{ x: label, href: tocHref(target) }]);
  }
  const out = [];
  if (opts.caption) out.push({ kind: 'paragraph', spans: [{ b: opts.caption }] });
  if (items.length) out.push({ kind: 'list', ordered: false, items });
  return out;
}

// ---- markdown → authoring block shapes ------------------------------------------------
function mdToBlocks(md) {
  const lines = md.split('\n');
  // YAML frontmatter is metadata, not prose. Left in, its opening `---` shows up as a stray
  // rule and the keys collapse into one run-on paragraph at the top of the page. Only strip
  // it when it really looks like frontmatter (closing fence nearby, first line a `key:`), so
  // a doc that legitimately opens on a horizontal rule keeps its content.
  if (lines[0] !== undefined && lines[0].trim() === '---') {
    const end = lines.findIndex((l, n) => n > 0 && /^---\s*$/.test(l));
    const first = end > 0 ? lines.slice(1, end).find(l => l.trim()) : undefined;
    if (end > 0 && end <= 60 && first && /^[A-Za-z_][\w.-]*\s*:/.test(first)) lines.splice(0, end + 1);
  }
  const blocks = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // directive fence (```{name} or :::{name}) — checked before the plain fence below,
    // which would otherwise claim it as an unlabelled code block.
    const dfence = line.match(/^(```+|:::+)\{([a-z-]+)\}\s*$/);
    if (dfence) {
      const closer = dfence[1][0] === '`' ? /^```/ : /^:::/;
      const buf = [];
      for (i++; i < lines.length && !closer.test(lines[i]); i++) buf.push(lines[i]);
      blocks.push(...directiveBlocks(dfence[2], buf));
      continue;
    }
    // fenced code
    const fence = line.match(/^```(\w*)/);
    if (fence) {
      const lang = fence[1] || 'text'; const buf = [];
      for (i++; i < lines.length && !/^```/.test(lines[i]); i++) buf.push(lines[i]);
      blocks.push({ kind: 'code', text: buf.join('\n'), language: lang });
      continue;
    }
    const h = line.match(/^(#{1,6})\s+(.*)$/);
    if (h) { blocks.push({ kind: 'heading', level: h[1].length, spans: inline(h[2].trim()) }); continue; }
    // a run of list items (each item keeps inline spans → links survive). Ordered runs are
    // matched too: without this a `1.`/`2.` list falls through to the paragraph branch and
    // gets joined into one run-on line, which is how every numbered list in the corpus read.
    // The two markers are kept separate so a bullet run and a numbered run never merge.
    if (BULLET.test(line) || NUMBERED.test(line)) {
      const ordered = !BULLET.test(line);
      const re = ordered ? NUMBERED : BULLET;
      // this parser has no nesting, so a code block or paragraph between two steps ends the
      // run. Carry the source's own first number, or every continuation would restart at 1
      // — 600 of the corpus's ~1300 numbered runs begin at something other than "1.".
      const start = ordered ? Number(line.match(NUMBERED)[0].match(/\d+/)[0]) : 1;
      const items = [];
      for (; i < lines.length && re.test(lines[i]); i++)
        items.push(inline(lines[i].replace(re, '').trim()));
      i--; blocks.push({ kind: 'list', ordered, items, ...(start > 1 ? { start } : {}) });
      continue;
    }
    if (/^\s*\|.*\|/.test(line) && isTableSep(lines[i + 1])) { // pipe table: header, separator, body rows
      const head = tableCells(line);
      let j = i + 2; const rows = [];
      for (; j < lines.length && /^\s*\|/.test(lines[j]); j++) rows.push(tableCells(lines[j]));
      i = j - 1; blocks.push({ kind: 'table', head, rows });
      continue;
    }
    if (/^\s*>\s?/.test(line)) { // blockquote
      const buf = [];
      for (; i < lines.length && /^\s*>\s?/.test(lines[i]); i++) buf.push(lines[i].replace(/^\s*>\s?/, ''));
      i--; blocks.push({ kind: 'quote', spans: inline(buf.join(' ').trim()) });
      continue;
    }
    // thematic break: a separator, not content. There is no rule block kind to render it
    // into, and falling through to the paragraph branch is what put a literal "---" between
    // sections on most pages in the corpus — headings already carry the structure.
    if (/^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(line)) continue;
    if (line.trim() === '' || /^\s*\|/.test(line) || /^\s*<[a-z]/i.test(line)) continue; // skip blanks/tables/html
    // paragraph: gather until blank / structural line
    const buf = [line.trim()];
    for (i++; i < lines.length && lines[i].trim() !== '' && !/^(#{1,6}\s|```|:::|\s*[-*]\s|\s*\d+[.)]\s|\s*>\s|\s*\|)/.test(lines[i]); i++)
      buf.push(lines[i].trim());
    i--; blocks.push({ kind: 'paragraph', spans: inline(buf.join(' ')) });
  }
  return blocks;
}

// ---- extract one named section (heading text contains `match`) ------------------------
// Returns that heading + every block until the next heading of equal-or-higher level.
// Re-leveled so the section's own heading renders at h2 on the page.
export function specSection(relPath, match) {
  let md;
  try { md = readFileSync(join(ROOT, relPath), 'utf8'); }
  catch { FAIL(`cannot read spec source: ${relPath}`); }
  const all = mdToBlocks(md);
  const start = all.findIndex(b => b.kind === 'heading' && b.spans.map(s => s.b || s.i || s.tt || s.x || s).join('').includes(match));
  if (start < 0) FAIL(`section "${match}" not found in ${relPath} — was it renamed?`);
  const baseLevel = all[start].level;
  const out = [all[start]];
  for (let j = start + 1; j < all.length; j++) {
    if (all[j].kind === 'heading' && all[j].level <= baseLevel) break;
    out.push(all[j]);
  }
  const shift = baseLevel - 2; // pull the section heading down to level 2 (h3 in page)
  return out.map(b => b.kind === 'heading' ? { ...b, level: Math.max(1, b.level - shift) } : b);
}

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

// ---- inline: **bold**, `code`, [text](url) → span-shape array -------------------------
function inline(text) {
  const out = [];
  const re = /\*\*([^*]+)\*\*|`([^`]+)`|\[([^\]]+)\]\(([^)]+)\)/g;
  let last = 0, m;
  const push = (s) => { if (s) out.push(s); };
  while ((m = re.exec(text))) {
    push(text.slice(last, m.index));
    if (m[1] !== undefined) out.push({ b: m[1] });
    else if (m[2] !== undefined) out.push({ tt: m[2] });
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

// ---- markdown → authoring block shapes ------------------------------------------------
function mdToBlocks(md) {
  const lines = md.split('\n');
  const blocks = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
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
    if (/^\s*[-*]\s+/.test(line)) { // a run of list items (each item keeps inline spans → links survive)
      const items = [];
      for (; i < lines.length && /^\s*[-*]\s+/.test(lines[i]); i++)
        items.push(inline(lines[i].replace(/^\s*[-*]\s+/, '').trim()));
      i--; blocks.push({ kind: 'list', ordered: false, items });
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
    if (line.trim() === '' || /^\s*\|/.test(line) || /^\s*<[a-z]/i.test(line)) continue; // skip blanks/tables/html
    // paragraph: gather until blank / structural line
    const buf = [line.trim()];
    for (i++; i < lines.length && lines[i].trim() !== '' && !/^(#{1,6}\s|```|\s*[-*]\s|\s*>\s|\s*\|)/.test(lines[i]); i++)
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
  const start = all.findIndex(b => b.kind === 'heading' && b.spans.map(s => s.b || s.tt || s.x || s).join('').includes(match));
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

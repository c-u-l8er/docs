// render.mjs — turn authoring-shape blocks (from ingest) into BendScript blocks (with ids,
// the shape @bendscript/core validates and content-addresses) and into HTML (the prose
// projection). Standalone so the filesystem-mirror build doesn't touch the curated build.
let _s = 0; const sid = () => 'spn-' + (++_s);
let _b = 0; const bid = () => 'blk-' + (++_b);
const esc = (s) => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// ---- authoring span → BendScript span. Internal links target "#/<route>" (a valid URI
// string, same shape the validator already accepts for external links); the renderer turns
// that into client-side navigation. -----------------------------------------------------
function toSpan(s) {
  if (typeof s === 'string') return { id: sid(), text: s };
  if (s.a !== undefined) return { id: sid(), text: s.a,
    marks: [{ kind: 'link', target: '#/' + s.route, predicate: 'cites' }] };
  if (s.x !== undefined) return { id: sid(), text: s.x,
    marks: [{ kind: 'link', target: s.href, predicate: 'cites' }] };
  if (s.tt !== undefined) return { id: sid(), text: s.tt, marks: ['code'] };
  if (s.b !== undefined) return { id: sid(), text: s.b, marks: ['bold'] };
  if (s.i !== undefined) return { id: sid(), text: s.i, marks: ['italic'] };
  return { id: sid(), text: '' };
}
const toSpans = (arr) => (arr && arr.length ? arr : ['']).map(toSpan);

export function toBlocks(blocks) {
  const conv = (b) => {
    if (b.kind === 'heading') return { id: bid(), kind: 'heading', level: Math.min(Math.max(b.level, 1), 6), spans: toSpans(b.spans) };
    if (b.kind === 'paragraph') return { id: bid(), kind: 'paragraph', spans: toSpans(b.spans) };
    if (b.kind === 'code') return { id: bid(), kind: 'code', text: String(b.text ?? ''), language: b.language || 'text' };
    if (b.kind === 'quote') return { id: bid(), kind: 'quote', blocks: [{ id: bid(), kind: 'paragraph', spans: toSpans(b.spans) }] };
    if (b.kind === 'list') return { id: bid(), kind: 'list', ordered: !!b.ordered,
      ...(b.ordered && b.start > 1 ? { start: b.start } : {}),
      items: (b.items.length ? b.items : [['']]).map(it => ({ id: bid(), kind: 'list-item',
        blocks: [{ id: bid(), kind: 'paragraph', spans: toSpans(it) }] })) };
    if (b.kind === 'table') { const cell = (spans) => ({ id: bid(), spans: toSpans(spans) });
      return { id: bid(), kind: 'table', head: (b.head || []).map(cell), rows: (b.rows || []).map(r => r.map(cell)) }; }
    return { id: bid(), kind: 'paragraph', spans: toSpans(['']) };
  };
  return blocks.map(conv);
}

// ---- build-time syntax highlighting --------------------------------------------------
// Self-contained, dependency-free token coloring for the languages that dominate the corpus
// (JS/TS, Elixir, JSON, shell). Operates on the RAW source: a single ordered-alternation regex
// finds the earliest token from `last`; gaps are escaped plain text, matches are escaped then
// wrapped in <span class="t-…">. Ordering puts comments/strings first so keywords inside them
// are never re-tokenized. Only the HTML projection is highlighted — the stored BendScript doc
// (and its CID) keeps the raw text, so content-addressing is unaffected.
const LANG = (l) => ({
  js:'js', javascript:'js', mjs:'js', cjs:'js', jsx:'js', ts:'js', typescript:'js', tsx:'js', node:'js',
  elixir:'elixir', ex:'elixir', exs:'elixir', heex:'elixir', eex:'elixir',
  json:'json', jsonc:'json', json5:'json',
  bash:'bash', sh:'bash', shell:'bash', zsh:'bash', console:'bash', 'shell-session':'bash', shellsession:'bash', cmd:'bash',
}[String(l || '').toLowerCase()] || 'plain');

const RULES = {
  js: [
    ['//[^\\n]*', 'comment'], ['/\\*[\\s\\S]*?\\*/', 'comment'],
    ['`(?:\\\\.|[^`\\\\])*`', 'string'], ['"(?:\\\\.|[^"\\\\])*"', 'string'], ["'(?:\\\\.|[^'\\\\])*'", 'string'],
    ['\\b(?:const|let|var|function|return|if|else|for|while|of|in|new|class|extends|implements|interface|import|from|export|default|async|await|yield|try|catch|finally|throw|switch|case|break|continue|typeof|instanceof|void|delete|do|this|super|static|get|set|public|private|readonly|type|enum|as|null|undefined)\\b', 'kw'],
    ['\\b(?:true|false|null|undefined|NaN|Infinity)\\b', 'lit'],
    ['\\b0[xX][0-9a-fA-F]+|\\b\\d[\\d_]*(?:\\.\\d+)?(?:[eE][+-]?\\d+)?\\b', 'num'],
    ['\\b[A-Z][A-Za-z0-9_]*\\b', 'type'],
    ['[A-Za-z_$][\\w$]*(?=\\s*\\()', 'fn'],
  ],
  elixir: [
    ['#[^\\n]*', 'comment'],
    ['"""[\\s\\S]*?"""', 'string'], ["'''[\\s\\S]*?'''", 'string'],
    ['~[a-zA-Z]?"""[\\s\\S]*?"""', 'string'], ['~[a-zA-Z]\\([^)]*\\)', 'string'],
    ['"(?:\\\\.|[^"\\\\])*"', 'string'], ["'(?:\\\\.|[^'\\\\])*'", 'string'],
    ['@[A-Za-z_]\\w*', 'attr'],
    ['\\b(?:def|defp|defmodule|defmacro|defmacrop|defstruct|defprotocol|defimpl|defdelegate|defguard|defexception|do|end|fn|when|case|cond|if|unless|else|with|for|receive|after|rescue|catch|raise|try|throw|import|alias|require|use|quote|unquote|and|or|not|in)\\b', 'kw'],
    ['\\b(?:true|false|nil)\\b', 'lit'],
    [':"(?:\\\\.|[^"\\\\])*"|:[A-Za-z_]\\w*[!?]?', 'atom'],
    ['[A-Z]\\w*(?:\\.[A-Z]\\w*)*', 'type'],
    ['\\b\\d[\\d_]*(?:\\.\\d+)?\\b', 'num'],
  ],
  json: [
    ['//[^\\n]*', 'comment'], ['/\\*[\\s\\S]*?\\*/', 'comment'],
    ['"(?:\\\\.|[^"\\\\])*"(?=\\s*:)', 'key'],
    ['"(?:\\\\.|[^"\\\\])*"', 'string'],
    ['\\b(?:true|false|null)\\b', 'lit'],
    ['-?\\b\\d[\\d.eE+-]*\\b', 'num'],
  ],
  bash: [
    ['#[^\\n]*', 'comment'],
    ['"(?:\\\\.|[^"\\\\])*"', 'string'], ["'[^']*'", 'string'],
    ['\\$\\{[^}]*\\}|\\$[A-Za-z_]\\w*|\\$[@*#?$!0-9]', 'var'],
    ['\\b(?:if|then|else|elif|fi|for|while|until|do|done|case|esac|in|function|return|export|local|readonly|source|set|unset|cd|echo|exit)\\b', 'kw'],
    ['(?:^|\\s)(--?[A-Za-z][\\w-]*)', 'flag'],
    ['\\b\\d+\\b', 'num'],
  ],
};
const COMPILED = Object.fromEntries(Object.entries(RULES).map(([k, rs]) =>
  [k, { re: new RegExp(rs.map(r => '(' + r[0] + ')').join('|'), 'gm'), cls: rs.map(r => r[1]) }]));

function highlight(code, lang) {
  const key = LANG(lang);
  const C = COMPILED[key];
  if (!C) return esc(code);                       // plain / markdown / unknown → no tokenizing
  const { re, cls } = C; re.lastIndex = 0;
  let out = '', last = 0, m;
  while ((m = re.exec(code))) {
    if (m.index > last) out += esc(code.slice(last, m.index));
    let gi = 1; while (gi < m.length && m[gi] === undefined) gi++;
    out += `<span class="t-${cls[gi - 1]}">${esc(m[0])}</span>`;
    last = m.index + m[0].length;
    if (m[0].length === 0) re.lastIndex++;        // guard against zero-width loops
  }
  out += esc(code.slice(last));
  return out;
}

// ---- BendScript blocks → HTML --------------------------------------------------------
function spanHTML(s) {
  const t = esc(s.text);
  const m = (s.marks || [])[0];
  if (!m) return t;
  if (m === 'code') return `<code>${t}</code>`;
  if (m === 'bold') return `<strong>${t}</strong>`;
  if (m === 'italic') return `<em>${t}</em>`;
  if (m && m.kind === 'link') {
    const tgt = m.target || '';
    if (tgt.startsWith('#/')) return `<a href="${esc(tgt)}" data-link>${t}</a>`;
    return `<a href="${esc(tgt)}" target="_blank" rel="noopener">${t}</a>`;
  }
  return t;
}
const spansHTML = (a) => (a || []).map(spanHTML).join('');
export function blockHTML(b) {
  switch (b.kind) {
    case 'heading': { const h = Math.min(b.level + 1, 6); return `<h${h} id="${esc(b.id)}">${spansHTML(b.spans)}</h${h}>`; }
    case 'paragraph': return `<p>${spansHTML(b.spans)}</p>`;
    case 'code': { const lang = (b.language && b.language !== 'text') ? b.language : '';
      return `<pre${lang ? ` data-lang="${esc(lang)}"` : ''}><code>${highlight(b.text, lang)}</code></pre>`; }
    case 'quote': return `<blockquote>${(b.blocks || []).map(blockHTML).join('')}</blockquote>`;
    case 'list': { const t = b.ordered ? 'ol' : 'ul';   // ordered survived ingest → render it as one
      const at = b.ordered && b.start > 1 ? ` start="${esc(b.start)}"` : '';
      return `<${t}${at}>${b.items.map(it => `<li>${(it.blocks || []).map(blockHTML).join('')}</li>`).join('')}</${t}>`; }
    case 'table': { const row = (cells, tag) => `<tr>${cells.map(c => `<${tag}>${spansHTML(c.spans)}</${tag}>`).join('')}</tr>`;
      const head = (b.head && b.head.length) ? `<thead>${row(b.head, 'th')}</thead>` : '';
      return `<table>${head}<tbody>${(b.rows || []).map(r => row(r, 'td')).join('')}</tbody></table>`; }
    default: return '';
  }
}
export const docHTML = (blocks) => blocks.map(blockHTML).join('\n');
export const plain = (blocks) => blocks.map(b =>
  b.kind === 'code' ? b.text :
  b.kind === 'table' ? [...(b.head || []), ...[].concat(...(b.rows || []))].map(c => (c.spans || []).map(s => s.text).join('')).join(' ') :
  b.spans ? b.spans.map(s => s.text).join('') :
  b.items ? b.items.map(it => (it.blocks || []).map(x => (x.spans || []).map(s => s.text).join('')).join(' ')).join(' ') :
  b.blocks ? plain(b.blocks) : '').join(' ');

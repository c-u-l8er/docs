// tree.mjs — scan the real repo and model the stack's documentation as a filesystem.
// The docs site mirrors this 1:1: a doc's route IS its source path, so an agent can map
// #/<path> ⟺ <path> on disk with zero ambiguity, in both directions. We do NOT move any
// files — every page records where it really lives (across submodule boundaries and all).
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, relative, sep, basename } from 'node:path';
import { findRoot } from './resolve-root.mjs';

export const ROOT = findRoot(import.meta.url);

// what counts as "the docs": markdown under any docs/ or prompts/ tree, plus the
// top-level stack docs. Everything else (code, build output, archives) is excluded.
const EXCLUDE_DIR = new Set(['node_modules', '_build', 'deps', '.git', '.amp', 'dist',
  'old_scrap', 'old_scraps', '.elixir_ls', 'cover', '.svelte-kit']);
const TOP_LEVEL_DOCS = ['README.md', 'ECOSYSTEM.md', 'AGENTS.md', 'CLAUDE.md',
  'STACK_COMPLETION.md', 'STACK_PLANNING.md', 'STACK_SITEMAP.md', 'STACK_ARCHITECTURE_GAP_REVIEW.md'];

const isDocPath = (rel) => /(^|\/)(docs|prompts)\//.test(rel) && rel.endsWith('.md');

function walk(absDir, acc) {
  for (const name of readdirSync(absDir)) {
    if (EXCLUDE_DIR.has(name)) continue;
    const abs = join(absDir, name);
    let st; try { st = statSync(abs); } catch { continue; }
    if (st.isDirectory()) walk(abs, acc);
    else if (st.isFile() && name.endsWith('.md')) {
      const rel = relative(ROOT, abs).split(sep).join('/');
      if (isDocPath(rel)) acc.push(rel);
    }
  }
}

// first markdown heading → human title; else the filename
function titleOf(rel) {
  try {
    const m = readFileSync(join(ROOT, rel), 'utf8').match(/^#\s+(.+)$/m);
    if (m) return m[1].replace(/[#*`]/g, '').trim();
  } catch {}
  return basename(rel).replace(/\.md$/, '');
}

export function scan() {
  const files = [];
  walk(ROOT, files);
  for (const f of TOP_LEVEL_DOCS) {
    try { statSync(join(ROOT, f)); files.push(f); } catch {}
  }
  files.sort();

  const docs = files.map(rel => {
    const segs = rel.split('/');
    const project = segs.length > 1 ? segs[0] : '(root)';
    return { source: rel, route: rel, project, segs, name: basename(rel), title: titleOf(rel) };
  });

  // build a nested directory tree of dirs → children (dirs + files)
  const tree = { name: '/', path: '', dirs: new Map(), files: [] };
  for (const d of docs) {
    let node = tree;
    const parts = d.source.split('/');
    for (let i = 0; i < parts.length - 1; i++) {
      const p = parts[i];
      if (!node.dirs.has(p))
        node.dirs.set(p, { name: p, path: parts.slice(0, i + 1).join('/'), dirs: new Map(), files: [] });
      node = node.dirs.get(p);
    }
    node.files.push(d);
  }
  return { docs, tree };
}

// serialize the Map-based tree into plain JSON for the client
export function treeToJSON(node) {
  return {
    name: node.name, path: node.path,
    dirs: [...node.dirs.values()].map(treeToJSON),
    files: node.files.map(f => ({ route: f.route, name: f.name, title: f.title })),
  };
}

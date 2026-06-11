# stackdocs — the whole [&] stack, as a filesystem you can walk

A single, navigable documentation site that **mirrors the live repository's
filesystem**: every real `docs/` and `prompts/` markdown file across all 20
projects becomes a page whose route *is* its source path. No files are moved.
Open `dist/index.html` — single file, no server.

## What it is

The home page is a **Runefort campus**: the stack rendered as a place you can
walk. Directories are floors (campus → building → floor), documents are rooms.
The left rail is the real filesystem tree; the top bar is a live breadcrumb of
the current path. Each document page shows its **source path** (with a copy
button), the rendered markdown, and a right rail of typed neighbors: outgoing
links, **backlinks** ("referenced by"), and siblings in the same folder.

Because `route === source path`, an AI agent reading the rendered docs can round-
trip back to the exact file on disk, and vice-versa. `dist/atlas.json` is the
machine-readable route⇄source map for exactly this.

## How it dogfoods the stack (in the build, not as metaphor)

`build-atlas.mjs` uses the real `@bendscript/core` npm package to:

1. **Mirror the filesystem** — `tree.mjs` scans the repo (excluding
   `node_modules`, `_build`, `deps`, `old_scrap`, etc.), collecting every
   `docs/`+`prompts/` `.md` file plus top-level READMEs. 223 docs / 20 projects.
2. **Turn each file into a validated BendScript document** — `ingest.mjs` parses
   the markdown to blocks; `render.mjs` emits BendScript; each doc is validated
   against the protocol schema, normalized, and **content-addressed** (CIDv1).
   The CID is shown in the reader rail — change a file, its id changes.
3. **Type every cross-doc link as an edge** — relative `.md` links that resolve
   to a known route become internal navigation; the graph is inverted to produce
   backlinks. Unresolvable links degrade gracefully (never fail the build).
4. **Verify the round-trip invariant** — `parse(serialize(parse(d)))` is checked
   to be a CID fixpoint across the whole corpus — the protocol's load-bearing
   claim, now proven over 223 real documents.

The campus *is* Runefort's `codebase-atlas` idea; the pages *are* BendScript's
"prose is one projection of the graph." The medium is the message.

## Robustness: the build never breaks on real content

Real markdown is messy. The ingest pipeline falls back to a raw code-block view
for any document it can't cleanly parse, counting fallbacks in the build report
(currently **0**). So new or unusual docs join the atlas automatically without
ever failing the build.

## Build it

```bash
npm i                 # box-and-box + @bendscript/core
npm run build         # node build-atlas.mjs → dist/index.html + dist/atlas.json + dist/bend/*
npm run build:curated # the earlier 21-page curated proof (node build.mjs)
```

Build report (actual output):

```
  ✓ 223 real docs mirrored from 20 projects (no files moved)
  ✓ route === source path for every page (lossless agent round-trip)
  ✓ 9 cross-doc links resolved to internal navigation
  ✓ every page is a validated, content-addressed BendScript document
  ✓ round-trip CID fixpoint holds across the corpus: true
  ✓ 0 doc(s) fell back to raw view (unparseable markdown)
```

## Extending it

- **Add docs:** just add markdown under any project's `docs/` or `prompts/`. The
  next build picks it up — it joins the tree, the floors, search, and the graph.
- **Point an agent at it:** read `dist/atlas.json` for the `route ⇄ source`
  mapping, or read any `dist/bend/<slug>.bend.json` for the content-addressed
  BendScript form of a single file.

## Files

- `build-atlas.mjs` — the filesystem-mirror build (primary)
- `tree.mjs` — repo scan → filesystem tree + route↔source map
- `ingest.mjs` — markdown → BendScript blocks (with raw-view fallback)
- `render.mjs` — BendScript → HTML, link resolution
- `shell-atlas.css` / `shell-atlas.js` — the Runefort campus client
- `dist/` — built site (`index.html`, `atlas.json`, `bend/*.bend.json`)
- `build.mjs` / `content.mjs` / `sources.mjs` — the earlier curated 21-page proof

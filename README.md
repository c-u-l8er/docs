# [&] stack docs atlas — published output

This repository holds the **built static site** for the [&] Protocol stack documentation
atlas (`docs.ampersandboxdesign.com`). It is generated output — do not edit by hand.

- **Source / generator:** `docs/` in the [`c-u-l8er/ProjectAmp2`](https://github.com/c-u-l8er/ProjectAmp2) monorepo (`npm run build`, which scans every `docs/` and `prompts/` tree across the whole stack).
- **What's here:** `index.html` (self-contained hash-router SPA), `atlas.json` (route⇄source map), `bend/*.bend.json` (content-addressed source docs), `amp-nav.js` (shared nav component), `.nojekyll`.
- **Routing:** the site is a single `index.html` using a `#/<path>` hash router, so any static host serves it from the repo root with no build step and no rewrites.

## Deploy

Static host pointed at this repo's root (no build command, output dir = `/`):

- **Cloudflare Pages:** connect repo → Framework preset: *None* → Build command: *(empty)* → Build output directory: `/`. Add custom domain `docs.ampersandboxdesign.com`.
- **GitHub Pages:** Settings → Pages → Source: deploy from `main` / root. `.nojekyll` is included so `bend/` and all files are served verbatim.

To update: rebuild in the monorepo and republish the contents of `docs/dist/` to this repo's root.

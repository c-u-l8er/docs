# [&] stack docs atlas — published output

This repository holds the **built static site** for the [&] Protocol stack documentation
atlas (`docs.ampersandboxdesign.com`). It is generated output — do not edit by hand.

- **Source / generator:** `docs/` in the [`c-u-l8er/ProjectAmp2`](https://github.com/c-u-l8er/ProjectAmp2) monorepo (`npm run build`, which scans every `docs/` and `prompts/` tree across the whole stack).
- **What's here:** `index.html` (self-contained hash-router SPA), `atlas.json` (route⇄source map), `bend/*.bend.json` (content-addressed source docs), `amp-nav.js` (shared nav component), `.nojekyll`.
- **Layout:** the prebuilt site lives in `dist/` (committed). The monorepo isn't available at deploy time, so there is **no build step** — the host just serves `dist/` as-is.
- **Routing:** the site is a single `index.html` using a `#/<path>` hash router, so any static host serves it with no rewrites.

## Deploy

No build command — serve the committed `dist/` folder:

- **Cloudflare Pages:** connect repo → Framework preset: *None* → Build command: *(empty)* → Build output directory: `dist`. Add custom domain `docs.ampersandboxdesign.com`.
- **GitHub Pages:** publish from the `/dist` folder (or move `dist/` contents to a `docs/`-style Pages source). `.nojekyll` is included so `bend/` and all files are served verbatim.

To update: rebuild in the monorepo (`cd docs && npm run build`) and republish `docs/dist/` into this repo's `dist/`.

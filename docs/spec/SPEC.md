# stackdocs — specification

What this system is, what it must do, what it must never do, and how to tell a correct implementation from a wrong one. Derived from the code at `docs/` in the ProjectAmp2 monorepo.

## 1. Purpose

stackdocs produces a single self-contained HTML file (`dist/index.html`) and a machine-readable sidecar (`dist/atlas.json`) that together mirror every documentation markdown file across the [&] monorepo as a navigable site. The site's routes are the source paths; an agent or a human can map between the two without a lookup table.

The build also produces one BendScript document per source file (`dist/bend/*.bend.json`), each validated and content-addressed.

## 2. Invariants

These properties must hold on every successful build. A build that violates any of them must fail, not degrade.

### 2.1 Route-source identity

For every page, `route === source path`. The build must not move, rename, or re-root any file. A reader seeing route `graphonomous/docs/spec/README.md` must be able to open that exact path on disk.

### 2.2 BendScript validity

Every page must be a valid BendScript document per the `@bendscript/core` schema. A document that cannot be validated degrades to a raw code-block view but is still validated in that form — it is never omitted.

### 2.3 Content-address fixpoint

Every page is content-addressed (CIDv1). The round-trip `parse(serialize(parse(doc)))` must produce the same CID. This is checked across the entire corpus; a single violation fails the `fixpointAll` flag in the build report.

### 2.4 Build provenance

Every build embeds a git commit hash as both a `<meta name="build-commit">` tag and a field in the model JSON. The commit is derived from the latest non-`dist/` commit (`git log -1 --format=%H -- . ":(exclude)dist"`), not from HEAD. This is the "two-commit chain" strategy: source changes are committed first (the *source commit*), then `dist/` is rebuilt and committed on top (the *artifact commit*). The provenance always points to the source commit, breaking the self-referential cycle where committing `dist/` would change HEAD, which would change the embedded hash, which would require another commit.

If no source commit can be resolved to a 40-hex-char SHA, the build fails. The build date is derived from the source commit's timestamp, not the wall clock, so that repeated builds of the same source commit produce byte-identical output regardless of when the artifact commit is made.

### 2.5 Derived facts, not literals

Canonical numbers (versions, law counts, trial counts) are read at build time from the file that owns them — `package.json` for npm versions, `mix.exs` for Elixir versions, the conformance harness source for law counts. A missing or unreadable source is a hard build failure. No fallback to a stale literal exists. The mechanism lives in `sources.mjs`.

### 2.6 Cross-doc link integrity

Relative `.md` links within the corpus that resolve to a known route become internal navigation edges. Unresolvable links degrade gracefully (they render as-is) but do not fail the build. The curated build (`build.mjs`) is stricter: a broken internal edge is a hard failure.

## 3. The dark factory

The build derives a four-phase status model called the "dark factory" from `STACK_COMPLETION.md`. The four phases, in fixed order, are:

1. **perceive** — sourced from §4 step 1
2. **decide** — an explicit GAP (no step in §4 owns a decision-phase evidence rung)
3. **act** — sourced from §4 step 1
4. **measure** — sourced from §4 step 7

Each sourced phase carries an evidence-ladder rung parsed from the owning table row. The valid rungs are: `spec`, `in_tree`, `live_local`, `live_deployed`, `external`. A phase with no owning source is recorded as a named GAP with an explanatory string, not fabricated.

### 3.1 Dark-factory constraints

- The phase count must be exactly four, in the order above.
- A GAP must not carry a rung or a source field.
- The presentation layer (`home.mjs`) must not contain any hard-coded evidence-rung literals (`in_tree`, `live_local`, `live_deployed`, `external`). The word `spec` is allowed because it collides with the ship-status vocabulary; the unambiguous rung literals are the test boundary.
- These constraints are enforced by `test-dark-factory.mjs` (`npm test`).

## 4. The verification gate

`verify-deployed.mjs` (`npm run verify:deployed`) is the gate for the docs reporting claim to reach `live_deployed`. It:

1. Fetches the production site at `https://docs.ampersandboxdesign.com`.
2. Extracts the embedded commit hash and model JSON.
3. Verifies internal consistency (meta tag commit === model commit).
4. Checks that the local source commit (latest non-`dist/` commit) matches the production commit. Under the two-commit chain, this is the commit that produced the build, not HEAD.
5. Rebuilds locally from the same source.
6. Compares the dark-factory model field-by-field: phase order, rungs, sources, GAP status and text.
7. Checks that the production HTML contains visible references to `darkFactory`, `GAP`, and `source`.
8. Fails if any divergence is found, including commit parity.

The script does not deploy. It only asserts that what is deployed matches what the source produces.

## 5. Deployment

Deployment is a manual `sync-docs.sh` invocation that:

1. Rebuilds the atlas from the live monorepo.
2. Clones the deploy repo (`c-u-l8er/docs`) into a temp directory.
3. Mirrors `dist/` into the clone.
4. Commits and pushes only if something changed.

Cloudflare Pages serves the deploy repo's `dist/` verbatim with no build step. The deploy repo is not this repo — it is a separate git repository that receives pre-built artifacts.

## 6. Two build modes

The codebase has two build pipelines:

- **`build-atlas.mjs`** (primary, `npm run build`) — filesystem-mirror mode. Scans the entire monorepo, ingests every `docs/` and `prompts/` markdown file. Produces the homepage theme system (Runefort bands), the dark-factory model, and the atlas sidecar. This is what ships.
- **`build.mjs`** (`npm run build:curated`) — curated mode. A hand-authored 21-page proof-of-concept defined entirely in `content.mjs`. Stricter link checking (broken internal edge = build failure). Supports transclusion (`{{key}}`). Does not scan the filesystem. Does not produce `atlas.json`.

The reason for keeping both is not recorded in the code. The curated build appears to be the earlier prototype; the atlas build superseded it for production use.

## 7. Must-never-do

- Must never move, rename, or reorganize source files. The mirror property is load-bearing.
- Must never hard-code a fact (version, count) that has a canonical source file. The derivation in `sources.mjs` is the only path.
- Must never hard-code evidence-rung literals in the presentation layer.
- Must never produce a deployment without a resolvable commit hash.
- Must never silently succeed when a canonical source is missing or unreadable.
- Must never fabricate a dark-factory rung or source for a phase that has no owning step.

## 8. Dependencies

Two runtime dependencies, both from the [&] stack:

- `@bendscript/core` 0.1.0-alpha.0 — validation, content-addressing, serialization, parsing.
- `box-and-box` 0.10.0 — imported by `sources.mjs` path traversal (law counting), not used as a runtime governance kernel in this codebase.

No other runtime dependencies. The build runs on Node.js with only built-in modules beyond these two.

## 9. Open questions

These are decisions the code makes whose reasons are not recorded:

- **Why keep the curated build?** `build.mjs` and `content.mjs` are a complete second pipeline with hand-authored content. The atlas build superseded it for production. Whether the curated build is still exercised, depended on, or slated for removal is not stated.
- **Why does `box-and-box` appear in `package.json`?** It is listed as a dependency but `sources.mjs` reads from the monorepo path `AmpersandBoxDesign/box-and-box/`, not from `node_modules`. The installed package may be unused. The reason for its inclusion is not recorded.
- **Fallback-vs-failure asymmetry.** The atlas build treats an unparseable document as a graceful fallback (raw code block); the curated build treats a broken internal edge as a hard failure. Both are defensible but the difference in failure philosophy is not explained.

## 10. What is already written down elsewhere

The referenced ADR documents (`ADR-0004` through `ADR-0008`, `SUPERVISOR.md`, `workbench spec`) are about WebHost.Systems and the workbench, not about this codebase. They share vocabulary (deployment immutability, provenance, telemetry) but do not describe stackdocs. The `README.md` in this directory is the closest thing to a prior spec; this document supersedes it for normative purposes.

No design document for this codebase existed before this file.

// content.mjs — the entire stack, authored once.
// REGISTRY.facts is the single source of truth that docs transclude by {{key}}. The facts
// are no longer hand-typed here — they are DERIVED from the real repo in sources.mjs
// (versions from package.json/mix.exs, law counts from the conformance harness itself).
// So a number can't go stale: it is read from the file that owns it on every build.

import { FACTS } from './sources.mjs';
import { specSection } from './ingest.mjs';

export const REGISTRY = {
  brand: 'Ampersand Box',
  author: 'Travis Burandt',
  facts: FACTS,
};

// inline-span helpers used inside P(...)
export const A  = (text, to, span) => ({ a: text, to, span });   // internal doc link
export const X  = (text, href) => ({ x: text, href });            // external link
export const TT = (text) => ({ tt: text });                       // inline code
export const B  = (text) => ({ b: text });                        // bold

// block helpers
export const H    = (level, ...spans) => ({ kind: 'heading', level, spans });
export const P    = (...spans) => ({ kind: 'paragraph', spans });
export const CODE = (text, language = 'text') => ({ kind: 'code', text, language });
export const UL   = (...items) => ({ kind: 'list', ordered: false, items });
export const OL   = (...items) => ({ kind: 'list', ordered: true, items });
export const NOTE = (...spans) => ({ kind: 'quote', spans });

// edge helpers (typed relationships — the graph)
const ed  = (predicate, to, span) => ({ predicate, to, span });
const edx = (predicate, label, href) => ({ predicate, label, href, ext: true });

// statuses → color/label in the floor:  live | alpha | spec | draft
export const DOCS = [

// ───────────────────────────────────────────────────────── governance · ring 0
{
  id: 'box-and-box', name: 'box-and-box', mark: '▣', os: 'OS-006 · kernel',
  status: 'live', layer: 'ring0', tagline: 'The governance kernel. Models generate answers; kernels govern them.',
  body: [
    H(1, 'box-and-box'),
    P('The governance kernel for agent actions. It is ', B('ring 0'),
      ': every proposed action passes through its bridge before it runs, and it returns a ',
      B('certificate'), ' — a reason — not a boolean. ',
      'It ships as a zero-dependency npm package, version ', TT('{{kernel.version}}'),
      ', and runs deterministically with no model and no network.'),
    NOTE('We don’t replace your policy engine. We contain it.'),

    H(2, 'The bridge'),
    P('Almost every agent stack computes desirability first and treats safety as a filter ',
      'afterward — it asks ', B('best?'), ' before ', B('permitted?'), '. The bridge runs the ',
      'order a kernel must: ', B('feasible ▸ permitted ▸ best'), '. ',
      'A vetoed option doesn’t get penalized; it is ', B('annihilated'),
      '. Because 0̲ × anything = 0̲, no utility, however large, can outrank a forbidden action.'),
    P('This single algebraic law is what makes governance composable and un-relaxable. ',
      'It is the property the conformance suite checks most heavily — see ',
      A('the laws', 'laws'), '.'),

    H(2, 'The eight rungs'),
    P('The kernel decomposes governance the way an OS decomposes the machine. Each rung is a ',
      'small algebra owning exactly one question; the bridge composes them in a precedence ',
      'that can’t be reordered at runtime.'),
    UL(
      'alethic — can it happen? (feasibility floor; below it, 0̲)',
      'deontic — is it allowed? (obligations, prohibitions, contrary-to-duty repair)',
      'axiological — which is best? (a semiring, so preferences never resurrect a veto)',
      'temporal — safe over time? (safety as a trajectory shield; liveness as a horizon duty)',
      'resource — can we afford it? (a closed, double-entry economy that even prices deliberation)',
      'epistemic — do we know enough? (a known-unknown routes to deliberation, not a guess)',
      'strategic — who can ensure it? (coalition ability; ought-implies-can, enforced)',
      'reflexive — may the rules change? (self-amendment that can never weaken the entrenched core)'),

    H(2, 'Install'),
    CODE('npm i -g box-and-box\n\n# run the full conformance suite in your terminal\nbox-and-box laws            # the 103-law core harness\nbox-and-box compose-laws    # the 13-law CC2 compose harness', 'bash'),

    H(2, 'The verdict surface'),
    P('Feed a decision spec on stdin; get a certificate on stdout. The documented exit codes ',
      'turn the kernel into a CI gate: ', TT('0'), ' a decision was made, ', TT('1'),
      ' no admissible option, ', TT('3'), ' escalation required.'),
    CODE(`{
  "req":   { "beta_min": 0.8 },
  "norms": [
    { "id": "forbid-destructive-prod", "modality": "forbidden", "priority": 10,
      "condition": { "all": [ {"field":"env","eq":"prod"}, {"truthy":"destructive"} ] } }
  ],
  "options": [
    { "id": "restart_service",   "utility": 7,  "value": { "beta": 0.95 }, "ctx": { "env": "prod" } },
    { "id": "drop_corrupt_table","utility": 99, "value": { "beta": 0.95 }, "ctx": { "env":"prod","destructive":true } }
  ]
}`, 'json'),
    P('The utility-99 action is forbidden, so it’s annihilated; ', TT('restart_service'),
      ' wins at utility 7. Conditions are data — nothing is ever ', TT('eval'), '’d.'),
  ],
  edges: [
    ed('ampersand.docs:specified-by', 'laws'),
    ed('ampersand.docs:governs', 'ampersand'),
    ed('ampersand.docs:realizes', 'amp-govern'),
    edx('cites', 'the 116 laws ↗', 'https://ampersandboxdesign.com/laws.html'),
    edx('cites', 'npm: box-and-box ↗', 'https://www.npmjs.com/package/box-and-box'),
  ],
},

{
  id: 'laws', name: 'The laws', mark: '§', os: 'conformance',
  status: 'live', layer: 'ring0', tagline: 'The verdict is the contract. Pass the laws and you’re conformant — in any language.',
  body: [
    H(1, 'The laws are the spec'),
    P('box-and-box isn’t defined by an implementation — it’s defined by ', B('{{laws.count}} property-tested laws'),
      ': ', TT('{{laws.core}}'), ' in the core harness and ', TT('{{laws.compose}}'),
      ' in the compose harness. Each is checked against ', B('{{laws.trials}} random cases'),
      ' on every run. Two hosts, in any language, must agree on all of them. Pass them and you’re ',
      'conformant — the way an implementation is POSIX because it passes the suite, not because it says so.'),
    H(2, 'Some load-bearing laws'),
    UL(
      'B1 · a veto scores 0̲ — infeasibility collapses to the tropical annihilator.',
      'H5 · 0̲ ⊗ a = 0̲ — the annihilation law; a vetoed option times any utility stays vetoed.',
      'R4 · entrenchment — an entrenched “safe” rule can be strengthened but never weakened or repealed.',
      'DB2 · obligation forces over a higher score — a duty overrides mere desirability.',
      'EB2 · a known-unknown routes to deliberation instead of a confident guess.',
      'CB1 · resource exhaustion ⇒ infeasible — the economy feeds the alethic floor.'),
    H(2, 'Where the laws bend — by design'),
    P('The harness also checks, on every run, that certain properties ', B('fail'),
      ' exactly where they should: idempotence holds under the tropical dioid but fails under the ',
      'probability and log semirings; factive knowledge (S5) holds 100% of the time while belief ',
      '(KD45) believes a falsehood ~33% of the time. These aren’t bugs — they’re the distinctions ',
      'that make the kernel honest.'),
  ],
  edges: [ ed('ampersand.docs:specifies', 'box-and-box') ],
},

// ───────────────────────────────────────────────── three-protocol stack
{
  id: 'ampersand', name: '[&] Protocol', mark: '&', os: 'OS-006 · structural',
  status: 'spec', layer: 'protocol', tagline: 'Compose governed agent intelligence: six primitives, two operators, one kernel.',
  body: [
    H(1, 'The [&] Protocol'),
    P('An open, language-agnostic specification for declaring and composing what an agent can ',
      B('do'), '. ', TT('{{primitives.count}}'), ' cognitive primitives combine through two operators whose meaning ',
      'is fixed by the ', A('governance kernel', 'box-and-box'), '. [&] does not replace MCP or A2A — ',
      'it ', B('compiles into them'), ', with a certificate for every verdict.'),
    H(2, 'The six primitives'),
    P('Each primitive is a typed interface; a provider implements it. Declaring ', TT('&memory'),
      ' says the agent has a memory faculty obeying the memory contract — not which engine backs it.'),
    UL(
      '&memory — retrieve, route, store, learn, consolidate.   provider · Graphonomous',
      '&reason — argue, vote, credit, seal; routed to on a known-unknown.   provider · Deliberatic',
      '&time — anomaly detection, forecasting, horizon obligations.   provider · TickTickClock',
      '&space — location, geo-routing, delta-CRDT state sync.   provider · GeoFleetic',
      '&body — perception, typed action, affordance enumeration.   spec · Embodiment (OS-011)',
      '&govern — the kernel itself, as a primitive.   provider · box-and-box'),
    H(2, 'Two operators'),
    P(TT('&'), ' combines capabilities into a coalition (associative, commutative, idempotent). ',
      TT('|>'), ' pipelines them into a governed sequence, gated by feasibility. The operators have ',
      B('laws'), ', and the laws are property-tested — that’s what separates [&] from an ad-hoc DSL.'),
    CODE(`agent infra-operator {
  &memory @graphonomous |> &reason @deliberatic |> &govern @box-and-box
  govern {
    hard  action.kind != "delete_prod_db"
    floor "never exfiltrate secrets"      // entrenched (R4)
    escalate_when confidence < 0.8  -> deliberate
  }
}`, 'text'),
  ],
  edges: [
    ed('ampersand.docs:governed-by', 'box-and-box'),
    ed('ampersand.docs:provider', 'amp-memory'),
    ed('ampersand.docs:provider', 'amp-reason'),
    edx('ampersand.docs:targets', 'MCP ↗', 'https://modelcontextprotocol.io'),
  ],
},

{
  id: 'pulse', name: 'PULSE', mark: '∿', os: 'OS-010 · temporal',
  status: 'spec', layer: 'protocol', tagline: 'Temporal loop algebra: how an agent’s loops run, nest, and signal across each other.',
  body: [
    H(1, 'PULSE'),
    P('Protocol for Uniform Loop State Exchange. Where [&] declares ', B('what'),
      ' an agent is, PULSE declares ', B('when'), ' its loops run. Every loop declares its phases, ',
      'cadence, substrates, invariants, and cross-loop connections in a single manifest file.'),
    H(2, 'The five canonical phases'),
    P('The phase kinds match the memory loop exactly: ', TT('retrieve · route · act · learn · consolidate'),
      '. Cross-loop tokens flow between loops — including ', TT('SurpriseSignal'),
      ', emitted on forward-model prediction error by the ', TT('&body'), ' primitive.'),
    NOTE('The eight kernel rungs are not the five PULSE phases. The rungs govern what is allowed at a single decision point; PULSE describes when the loop runs.'),
  ],
  edges: [
    ed('ampersand.docs:part-of-stack', 'ampersand'),
    ed('ampersand.docs:measured-by', 'prism'),
    edx('cites', 'PULSE on GitHub ↗', 'https://github.com/c-u-l8er/PULSE'),
  ],
},

{
  id: 'prism', name: 'PRISM', mark: '△', os: 'OS-009 · diagnostic',
  status: 'spec', layer: 'protocol', tagline: 'A self-improving continual-learning benchmark that refracts memory into nine dimensions.',
  body: [
    H(1, 'PRISM'),
    P('Protocol for Rating Iterative System Memory. Most memory benchmarks give you one number ',
      'and a ranking. PRISM decomposes continual learning into ', B('nine dimensions'),
      ', scores them against git-grounded truth, audits its own judges, and evolves scenarios ',
      'as systems improve — so the leaderboard never stops measuring the frontier.'),
    H(2, 'The nine dimensions'),
    UL(
      'stability — anti-forgetting under new input',
      'plasticity — acquisition of genuinely new facts',
      'knowledge update — belief revision on contradiction',
      'temporal reasoning · consolidation · epistemic awareness',
      'cross-domain transfer · intentional forgetting · outcome feedback'),
    H(2, 'Four phases, three judge layers'),
    P('compose → interact → observe → reflect. Three layers of judges triangulate: L1 the raw ',
      'transcript, L2 nine structured per-dimension rubrics, L3 a meta-judge from a different ',
      'model family that audits L2 for bias and drift. The real conformance contract is BYOR ',
      '(bring-your-own-runner) over MCP, so a Python, TypeScript, or Rust system is scored identically.'),
    NOTE('Honest note: an early self-benchmark went 0.10 → 0.99 in four cycles, then adversarial testing crashed it to 0.45 and surfaced real bugs. That failure is published, not hidden.'),
  ],
  edges: [
    ed('ampersand.docs:part-of-stack', 'ampersand'),
    ed('ampersand.docs:measures', 'graphonomous'),
    edx('cites', 'leaderboard ↗', 'https://prism.opensentience.org/api/leaderboard'),
  ],
},

// ───────────────────────────────────────────────── execution substrate chain
{
  id: 'wrl', name: 'WallRiderLang', mark: '⌬', os: 'world language',
  status: 'alpha', layer: 'substrate', tagline: 'An executable topology language whose meaning is a hash.',
  body: [
    H(1, 'WallRiderLang'),
    P('A content-addressed language for declaring networks of durable identities connected by ',
      'textured routes and separated by boundaries. A WRL program seals to a ',
      TT('SemanticArtifactID'), ' — the same hash on every host, every time.'),
    CODE(`profile forge.world.core.v1

[pulser:p0](every 2){sig_out}
[relay:r0]{sig_in, sig_out}
[spinner:sp](w=16, n=8, rotor=quarter_turn_z, configurable){sig_in, socket}
[orb:ob]{pose}

[p0] --sig--> [r0]
[r0] --sig--> [sp]
[sp] --socket--> [ob]`, 'text'),
    P('seals to ', TT('sem-67e954cf…60ae'), ' on every host, forever.'),
    H(2, 'Shipped state'),
    P('Core 0.1.2 is frozen: five roles, one texture, the period cycle, canonicalization, ',
      'and the document boundary. ', B('890 conformance checks'), ', 0 failures, ',
      '128 identity-register rows, model debt 0. The V2 Semantic IR (Relation Identity Kernel, §D8) ',
      'adds named relations as a second encoding over the same worlds — V1 seal ids are unmoved.'),
    H(2, 'In the chain'),
    P('WRL is authored by humans or by ', A('WRLM', 'wrlm'), '; lowered and reduced by ',
      A('TRVM', 'trvm'), '; evaluated by ', A('TRAAVIIS', 'traaviis'),
      '. A browser playground computes real ids in the browser.'),
  ],
  edges: [
    ed('ampersand.docs:lowered-by', 'trvm'),
    ed('ampersand.docs:evaluated-by', 'traaviis'),
    edx('cites', 'WRL playground ↗', 'https://wrl.traaviis.com/playground.html'),
    edx('cites', 'GitHub ↗', 'https://github.com/c-u-l8er/WRL'),
  ],
},

{
  id: 'trvm', name: 'TRVM', mark: 'λ', os: 'interaction-calculus VM',
  status: 'alpha', layer: 'substrate', tagline: 'A packed-word interaction-calculus runtime with four implementations targeting one spec.',
  body: [
    H(1, 'TRVM'),
    P('A correct, packed-word runtime for the Interaction Calculus. Interaction-net reduction is ',
      'confluent by construction: the order redexes fire does not change the result. ',
      TT('spec/SPEC.md'), ' plus language-agnostic conformance vectors define the contract; ',
      'four implementations target it.'),
    H(2, 'Implementations'),
    UL(
      'runtime/python — reference reducer (ic_ref) + oracle (ic_float) (shipped)',
      'runtime/c — ic32.c, packed-word native, 13/13 conformance vectors (shipped)',
      'runtime/zig — ic32.zig (in progress)',
      'runtime/mojo — ic32.mojo (in progress)'),
    H(2, 'The Forge'),
    P('The ', TT('forge/'), ' directory is the WRL toolchain: compiler, lowering spine, ',
      'and canonicalization pipeline. ', B('67 binding runs'), ' verify end-to-end correctness ',
      'from WRL text to sealed ', TT('sem-'), ' ids.'),
  ],
  edges: [
    ed('ampersand.docs:reduces', 'wrl'),
    ed('ampersand.docs:verified-by', 'traaviis'),
    edx('cites', 'GitHub ↗', 'https://github.com/c-u-l8er/TRVM'),
  ],
},

{
  id: 'wrlm', name: 'WRLM', mark: '🧠', os: 'generative cortex',
  status: 'alpha', layer: 'substrate', tagline: 'A probabilistic proposer over deterministic sealed worlds.',
  body: [
    H(1, 'WRLM'),
    P('WallRiderLang Model — a probabilistic proposer over WRL worlds. ',
      'The model emits full WRL text; the host derives a typed ', TT('GraphEditV1'),
      ' op sequence via ', TT('semantic_diff'), ' and applies it through the existing edit seam. ',
      'Ops are derived, never generated.'),
    H(2, 'Shipped state'),
    P('Steps 1–2 closed: ', TT('GoalSpecV1'), ' (two-sorted closed AST), ',
      TT('TaskBundleV1'), ', ', TT('WorldRecordV1'), ', coverage policy over a 320-cell domain ',
      '(298 inhabited), deterministic corpus of 527 accepted items. Steps 3–10 remain paper.'),
    H(2, 'In the chain'),
    P('WRLM proposes candidate worlds to ', A('WRL', 'wrl'), '. ',
      A('TRVM', 'trvm'), ' reduces them. ', A('TRAAVIIS', 'traaviis'),
      ' admits the evidence. WRLM is the only statistical component in the chain; ',
      'every other layer is total and deterministic.'),
  ],
  edges: [
    ed('ampersand.docs:proposes-to', 'wrl'),
    ed('ampersand.docs:reduced-by', 'trvm'),
    ed('ampersand.docs:admitted-by', 'traaviis'),
    edx('cites', 'research brief ↗', 'https://github.com/c-u-l8er/TRVM/blob/main/WRLM_RESEARCH_BRIEF.md'),
  ],
},

{
  id: 'traaviis', name: 'TRAAVIIS', mark: '▶', os: 'evaluation terminal',
  status: 'alpha', layer: 'substrate', tagline: 'Evidence-grade environments for evaluating agents. Content-addressed, not just deterministic.',
  body: [
    H(1, 'TRAAVIIS'),
    P('Evidence-grade environments for evaluating agents. ', TT('trvs'),
      ' is a thin terminal over the Forge/TRVM engine — it carries no world semantics of its own ',
      'and does not embed, select, or route a model. 532 tests across 28 files.'),
    H(2, 'The command set'),
    P('17 commands ship today, covering world identity, reduction, verification, ',
      'evaluation, batching, comparison, packaging, and serving:'),
    CODE(`trvs id / inspect / run / verify / replay / diff
trvs eval-one / eval / verify-episode / compare / batch
trvs init / pack / verify-bundle / archive-bundle
trvs serve --ors
trvs doctor`, 'bash'),
    H(2, 'Two substrates'),
    P('TRVM worlds (', TT('trvm.world.v1'), ') are the deterministic interaction-calculus substrate. ',
      'Evidence Residency (', TT('residency.repository.v1'),
      ') evaluates agents on real codebases via snapshot, finding, patch, and trace evidence.'),
    H(2, 'Identity rungs'),
    P('Six content-addressed rungs: ', TT('task-'), ' → ', TT('episode-'), ' → ',
      TT('env-'), ' → ', TT('bundle-'), ' (shared ladder), plus substrate-specific ',
      TT('sem-'), ' (world) and ', TT('film-'), ' (trajectory) for TRVM worlds.'),
  ],
  edges: [
    ed('ampersand.docs:evaluates', 'trvm'),
    ed('ampersand.docs:evaluates', 'wrl'),
    ed('ampersand.docs:admits', 'wrlm'),
    edx('cites', 'GitHub ↗', 'https://github.com/c-u-l8er/TRAAVIIS'),
  ],
},

// ───────────────────────────────────────────────── document substrate
{
  id: 'bendscript', name: 'BendScript', mark: '⤳', os: 'document protocol',
  status: 'alpha', layer: 'substrate', tagline: 'A graph-first document protocol with typed inline links. This site is built on it.',
  body: [
    H(1, 'BendScript'),
    P('A JSON document format where every span can carry a typed edge to another document, span, ',
      'or external URI. Documents are content-addressable; edges are span-addressable; the parser ',
      'round-trip holds for every document in the v0.1 corpus. Version ', TT('{{bendscript.version}}'), '.'),
    NOTE('You are reading BendScript right now. Every page on this site is a .bend.json document, validated and content-addressed at build time.'),
    H(2, 'Why a graph, not Markdown'),
    P('Markdown links are untyped strings inside a string. BendScript links carry a ', B('predicate'),
      ' — ', TT('cites'), ', ', TT('supersedes'), ', ', TT('defines'),
      ' — and resolve to spans, not just URLs. Round-trip a doc through an LLM and the graph survives.'),
    H(2, 'What that buys these docs'),
    P('Because cross-references are typed edges in a validated graph, a broken link isn’t a silent ',
      '404 — it’s a ', B('build failure'), '. And a canonical number (like the law count) lives in ',
      'exactly one span; every page that mentions it holds a ', TT('transcludes'),
      ' edge. Change it once, it changes everywhere, and a stale copy can’t compile. The drift ',
      'problem is solved by the medium.'),
    CODE(`npm install @bendscript/core

import { parseAndNormalize, computeDocumentId } from "@bendscript/core";
const doc = parseAndNormalize(readFileSync("page.bend.json","utf8"));
const id  = await computeDocumentId(doc);   // → bagaaie...  (CIDv1)`, 'text'),
    NOTE('Pulled verbatim from the BendScript Protocol spec at build time — bendscript.com/docs/spec/README.md.'),
    ...specSection('bendscript.com/docs/spec/README.md', 'Why a protocol'),
  ],
  edges: [
    ed('ampersand.docs:renders', 'runefort'),
    edx('cites', 'bendscript.com ↗', 'https://bendscript.com'),
    edx('cites', 'npm: @bendscript/core ↗', 'https://www.npmjs.com/package/@bendscript/core'),
  ],
},

{
  id: 'runefort', name: 'Runefort', mark: 'ᚲ', os: 'layout protocol',
  status: 'alpha', layer: 'substrate', tagline: 'AI-authored tile layouts that live in your repo. The home floor of this site is one.',
  body: [
    H(1, 'Runefort'),
    P('A small open protocol and ~5KB Web Component framework for tile-grid UIs with file-backed ',
      'rooms, runtime state classes, and in-browser authoring. Drop into any HTML page. Version ',
      TT('{{runefort.version}}'), '.'),
    NOTE('The home page of this site is a Runefort floor: each room is a component of the stack, its state class driven by ship status. Hot tile = shipped; dim tile = draft.'),
    H(2, 'Four primitives, four scales'),
    P('A ', B('room'), ' is the tile; a ', B('claim'), ' is what it owns (inline content or a file ',
      'anchor); a ', B('neighbor'), ' is arrow-key adjacency; a ', B('state'),
      ' is live status. Real systems live at four zooms: campus → building → floor → room.'),
    H(2, 'Vocabularies on the floor'),
    P('A vocabulary declares what a tile ', B('means'), '. ', TT('codebase-atlas.v1'),
      ' makes a repository a place — tiles are modules, signals are coverage and churn. ',
      'This docs floor uses that idea: the stack as a place you can walk.'),
  ],
  edges: [
    ed('ampersand.docs:rendered-by', 'bendscript'),
    edx('cites', 'runefort.com ↗', 'https://runefort.com'),
  ],
},

// ───────────────────────────────────────────────── capability providers
{
  id: 'graphonomous', name: 'Graphonomous', mark: '◉', os: '&memory',
  status: 'live', layer: 'provider', tagline: 'Continual-learning memory: a topology-aware knowledge graph, exposed as an MCP server.',
  body: [
    H(1, 'Graphonomous'),
    P('The reference provider for the ', A('&memory', 'amp-memory'), ' primitive. An Elixir/OTP ',
      'application with a durable SQLite-backed knowledge graph, a confidence-updating learning ',
      'loop, and an MCP server exposing five loop-phase machines. Most memory systems are ',
      'key-value stores with embeddings; Graphonomous is a ', B('closed loop'),
      ' — outcomes change beliefs, beliefs change retrieval, and the graph improves. Version ',
      TT('{{graphonomous.version}}'), '.'),
    H(2, 'What it does'),
    UL(
      '768-D neural embeddings (nomic-embed-text-v2-moe)',
      'AGM-rational belief revision and intentional forgetting',
      'κ-routing — topology decides how deeply to reason',
      'five MCP machines: retrieve · route · act · learn · consolidate'),
    H(2, 'Install'),
    CODE('npx -y graphonomous\n# works with Claude Code, Cursor, Zed, and any MCP client', 'bash'),
    NOTE('The section below is pulled verbatim from the project’s real spec at build time — graphonomous/docs/spec/README.md. Rename or move it and this build fails.'),
    ...specSection('graphonomous/docs/spec/README.md', '1. Overview'),
  ],
  edges: [
    ed('ampersand.docs:implements', 'amp-memory'),
    ed('ampersand.docs:governed-by', 'box-and-box'),
    ed('ampersand.docs:measured-by', 'prism'),
    edx('cites', 'npm: graphonomous ↗', 'https://www.npmjs.com/package/graphonomous'),
    edx('ampersand.docs:specified-by', 'spec: graphonomous/docs/spec ↗', 'https://github.com/c-u-l8er/graphonomous/blob/main/docs/spec/README.md'),
  ],
},

{
  id: 'deliberatic', name: 'Deliberatic', mark: '⚖', os: '&reason',
  status: 'spec', layer: 'provider', tagline: 'Formal argumentation: weighted bipolar attack/support graphs with Merkle-chained evidence.',
  body: [
    H(1, 'Deliberatic'),
    P('The reference provider for the ', A('&reason', 'amp-reason'),
      ' primitive — the faculty the kernel routes to on a known-unknown. Formal argumentation ',
      'semantics (Dung/Potyka), weighted bipolar attack/support graphs, constitutional guardrails, ',
      'and Merkle-chained evidence logs. The deliberation trace ', B('is'), ' the compliance artifact.'),
    P('It powers ', A('AgenTroMatic', 'agentromatic'),
      ', where agents bid on tasks, debate when capabilities overlap, and elect leaders by consensus.'),
  ],
  edges: [
    ed('ampersand.docs:implements', 'amp-reason'),
    ed('ampersand.docs:powers', 'agentromatic'),
  ],
},

// primitive stub pages (so &memory / &reason / &govern resolve as link targets + show providers)
{
  id: 'amp-memory', name: '&memory', mark: '◇', os: 'primitive',
  status: 'spec', layer: 'faculty', tagline: 'The memory faculty: retrieve, route, store, learn, consolidate.',
  body: [ H(1, '&memory'),
    P('A typed interface for continual memory — retrieve, store, consolidate — and the laws those ',
      'operations preserve. Swap providers without rewriting an agent’s composition. Reference ',
      'provider: ', A('Graphonomous', 'graphonomous'), '.') ],
  edges: [ ed('ampersand.docs:part-of', 'ampersand'), ed('ampersand.docs:provided-by', 'graphonomous') ],
},
{
  id: 'amp-reason', name: '&reason', mark: '◇', os: 'primitive',
  status: 'spec', layer: 'faculty', tagline: 'The reasoning faculty: argue, vote, credit, seal.',
  body: [ H(1, '&reason'),
    P('The faculty the kernel routes to on a known-unknown (low confidence). Reference provider: ',
      A('Deliberatic', 'deliberatic'), '.') ],
  edges: [ ed('ampersand.docs:part-of', 'ampersand'), ed('ampersand.docs:provided-by', 'deliberatic') ],
},
{
  id: 'amp-govern', name: '&govern', mark: '◇', os: 'primitive · ring 0',
  status: 'live', layer: 'faculty', tagline: 'Governance as a first-class faculty the agent holds.',
  body: [ H(1, '&govern'),
    P('Not a wrapper bolted on after the fact — a faculty the agent holds. It is the ',
      A('box-and-box', 'box-and-box'), ' kernel, as a primitive. No syscall runs without its verdict.') ],
  edges: [ ed('ampersand.docs:part-of', 'ampersand'), ed('ampersand.docs:provided-by', 'box-and-box') ],
},

// ───────────────────────────────────────────────── TRVM stack · runtime → language → cortex → evaluator
{
  id: 'trvm', name: 'TRVM', mark: '⊛', os: 'interaction-calculus VM',
  status: 'alpha', layer: 'runtime', tagline: 'A coordination-free distributed interaction-calculus runtime. Confluence is the data plane.',
  body: [
    H(1, 'TRVM'),
    P('A correct, packed-word WebAssembly reducer for the Interaction Calculus — the calculus ',
      'HVM3/HVM4 implement. Single-net reduction is schedule-independent by confluence; the ',
      'boundary-port discipline extends that to coordination-free reduction ', B('across machines'),
      ', with no locks and no consensus. On a Wasm substrate the same runtime runs in any browser ',
      'with no server.'),
    H(2, 'The IC32 runtime'),
    P('Terms packed into 64-bit words over a flat heap, in C, compiling cleanly to a 9.9 KB ',
      TT('.wasm'), ' module. Floating dups, in-place substitution, size-classed free-list GC. ',
      '~22–34 M interactions/s native; bit-identical results across Python reference, C native, ',
      'and Wasm builds.'),
    H(2, 'The arc'),
    UL(
      'ic_ref.py — correct reference reducer (fixes the higher-order-dup bug class)',
      'ic_float.py — general reducer with floating dups; the oracle',
      'ic32.c — packed-word native runtime (optimal sharing, self-validating)',
      'ic32.wasm — WebAssembly build (9.9 KB, bit-identical to reference)',
      'swarm.js — ic32.wasm coordination-free across real isolated workers (capstone)'),
    H(2, 'Reproduce'),
    CODE('make test                              # the whole battery\ngcc -O2 -o ic32 runtime/c/ic32.c       # native build\necho \'λx.x\' | ./ic32\nbash runtime/wasm/build.sh             # Wasm build\nnode runtime/js/swarm.js               # coordination-free across workers', 'bash'),
    NOTE('No parallel speedup is demonstrated. Every distribution result is coordination-free correct, not faster. Speedup needs the autonomous regime.'),
  ],
  edges: [
    ed('ampersand.docs:language', 'wrl'),
    ed('ampersand.docs:evaluated-by', 'traaviis'),
  ],
},

{
  id: 'wrl', name: 'WallRiderLang', mark: '⌗', os: 'executable topology',
  status: 'alpha', layer: 'language', tagline: 'An executable topology language whose meaning is a hash.',
  body: [
    H(1, 'WallRiderLang'),
    P('A WRL program is a network of ', B('durable identities'), ' connected by ',
      B('textured routes'), ' and separated by ', B('boundaries'),
      '. The name is literal — programs are made of ', B('riders'),
      ' (identities in motion along routes) and ', B('walls'),
      ' (boundaries that gate, commit and seal what they do). The whole network is one content ',
      'address, and every run of it is a film that replays exactly. Version ',
      TT('{{wrl.version}}'), '.'),
    H(2, 'The identity spine'),
    P('A world seals to a ', TT('SemanticArtifactID'), ' (', TT('sem-'), ') via: ',
      TT('desugar → parse → validate → canonicalize → serialize → SHA-256'),
      '. The playground reproduces the reference implementation\'s canonical bytes exactly — ',
      'same id on every host, forever.'),
    H(2, 'What is built vs. designed'),
    UL(
      'WRL Core 0.1.2 — frozen. Five roles, one texture, no behaviours.',
      'Forge Semantic IR 1.x — frozen. Forge Semantic IR 2.0 — draft, implemented.',
      'The authored design — 46 sections, tier-marked, capability-gated roadmap.',
      'The direction — executable topology: physical, computational, authority, fault and economic networks over the same durable identities.'),
    CODE('profile forge.world.core.v1\n\n[pulser:p0](every 2){sig_out}\n[relay:r0]{sig_in, sig_out}\n[spinner:sp](w=16, n=8, rotor=quarter_turn_z, configurable){sig_in, socket}\n[orb:ob]{pose}\n\n[p0] --sig--> [r0]\n[r0] --sig--> [sp]\n[sp] --socket--> [ob]', 'text'),
    P('seals to ', TT('sem-67e954cf…60ae'), ' on every host, forever.'),
  ],
  edges: [
    ed('ampersand.docs:runs-on', 'trvm'),
    ed('ampersand.docs:proposed-by', 'wrlm'),
    ed('ampersand.docs:evaluated-by', 'traaviis'),
    edx('cites', 'wallriderlang.com ↗', 'https://wallriderlang.com'),
  ],
},

{
  id: 'wrlm', name: 'WRLM', mark: '⟐', os: 'admitted proposer',
  status: 'draft', layer: 'cortex', tagline: 'The model proposes. The edit algebra constrains. TRVM disposes. TRAAVIIS admits.',
  body: [
    H(1, 'WRLM'),
    P('WRLM is an ', B('admitted generative transducer'), ': a probabilistic proposer over ',
      'deterministic sealed worlds. It is the ', B('only statistical component'),
      ' in the TRVM stack — every other layer is total, deterministic, content-addressed, ',
      'non-statistical.'),
    H(2, 'Architecture: Arm D′'),
    P('The model emits full WRL text; the host parses it into an isolated candidate buffer, ',
      'runs ', TT('diagnose_core'), ' + ', TT('seal'), ', derives a typed ',
      TT('GraphEditV1'), ' op sequence via ', TT('semantic_diff'),
      ', and applies it through the existing edit algebra. The ops are ', B('derived, not generated'),
      ' — capturing the model\'s accuracy (prose is its strongest modality), the edit algebra\'s ',
      'safety (nothing reaches the world except through six typed ops), and typed supervision for RLVR.'),
    H(2, 'The oracle ladder'),
    UL(
      'Validity — does it parse, seal, and lower? (total, free)',
      'Target identity — is it the intended world? (total, free; sem- equality)',
      'Goal satisfaction — does it meet a stated property? (total, free; GoalSpecV1)',
      'Subjective quality — not available; out of scope for WRLM-0'),
    H(2, 'Acceptance policy'),
    P('Admission is governed by the existing ', A('box-and-box', 'box-and-box'),
      ' kernel — no new policy language. Gate order: ',
      B('feasible ▸ permitted ▸ resource-compliant ▸ best'), '.'),
    NOTE('Build-order steps 1–2 shipped and closed: GoalSpecV1, TaskBundleV1, WorldRecordV1, the coverage domain (320 cells), a 58-world proved pool. Steps 3–10 remain paper only.'),
  ],
  edges: [
    ed('ampersand.docs:proposes-to', 'wrl'),
    ed('ampersand.docs:governed-by', 'box-and-box'),
    ed('ampersand.docs:admitted-by', 'traaviis'),
    ed('ampersand.docs:measured-by', 'prism'),
  ],
},

{
  id: 'traaviis', name: 'TRAAVIIS', mark: '⊢', os: 'evidence-grade eval',
  status: 'alpha', layer: 'evaluator', tagline: 'Evidence-grade environments for evaluating agents. Write the wall. Run the world. Keep the proof.',
  body: [
    H(1, 'TRAAVIIS'),
    P('TRAAVIIS provides ', B('evidence-grade environments for evaluating agents'),
      ' and proves what happened inside them. TRVM worlds are its strongest deterministic ',
      'substrate; Evidence Residency is its first repository-evidence substrate. Version ',
      TT('{{traaviis.version}}'), '. ',
      TT('trvs'), ' carries no world semantics of its own — it is a thin, honest terminal ',
      'over the existing Forge/TRVM engine.'),
    H(2, 'The command set'),
    UL(
      'trvs doctor — engine location, versions, verifier availability',
      'trvs id — the world\'s SemanticArtifactID (pure identity)',
      'trvs run — lower + deterministically fold; per-epoch film',
      'trvs verify — reference / native / oracle agreement (strict)',
      'trvs eval-one — evaluate one agent run over one frozen subject',
      'trvs eval — run an agent over a split, score every episode',
      'trvs pack — close a scaffold into a verified, reopened package',
      'trvs serve --ors — serve a packed environment as a submission endpoint',
      'trvs batch — run several candidates over one split, compare per task'),
    H(2, 'The artifact ladder'),
    UL(
      'sem-… — same subject?',
      'task-… — same assignment?',
      'trace-… — same behavior?',
      'episode-… — same evaluated outcome?',
      'env-… — same environment release?',
      'bundle-… — same distributed package tree?'),
    H(2, 'Install'),
    CODE('pipx install traaviis     # or: pip install traaviis\ntrvs doctor              # check engine + verifiers\ntrvs verify worlds/alley.wrl   # reference · native · oracle → 3/3', 'bash'),
    NOTE('Not a coding agent, not a model router, not an RL cloud. Every film is checked by every applicable verifier and content-addressed.'),
  ],
  edges: [
    ed('ampersand.docs:evaluates', 'trvm'),
    ed('ampersand.docs:evaluates', 'wrl'),
    ed('ampersand.docs:admits', 'wrlm'),
    ed('ampersand.docs:governed-by', 'box-and-box'),
  ],
},

// ───────────────────────────────────────────────── ecosystem / annex
{
  id: 'agentromatic', name: 'AgenTroMatic', mark: '🗳', os: 'deliberation engine',
  status: 'draft', layer: 'annex', tagline: 'Your agents don’t need a boss. They need a deliberation.',
  body: [ H(1, 'AgenTroMatic'),
    P('An automatic deliberation engine for multi-agent AI, built on the ', A('Deliberatic', 'deliberatic'),
      ' protocol. Tasks arrive, agents bid by ability, overlaps trigger structured debate, ',
      'Byzantine-tolerant consensus elects leaders, and reputation evolves. No human routing.') ],
  edges: [ ed('ampersand.docs:built-on', 'deliberatic') ],
},
{
  id: 'delegatic', name: 'Delegatic', mark: '⛓', os: 'fleet policy',
  status: 'draft', layer: 'annex', tagline: 'Organization hierarchy, policy inheritance, and audit trails across an agent fleet.',
  body: [ H(1, 'Delegatic'),
    P('Org-level policy: which agents may be installed, by whom, with what permissions. ',
      'Where ', A('box-and-box', 'box-and-box'), ' issues a per-action verdict, Delegatic sets ',
      'the fleet-wide policy those verdicts inherit. A lead defines the entrenched floor; ',
      'the team inherits it; the certificate journal becomes the compliance record.') ],
  edges: [ ed('ampersand.docs:inherits-floor-from', 'box-and-box') ],
},
{
  id: 'specprompt', name: 'SpecPrompt', mark: '📝', os: 'standards',
  status: 'draft', layer: 'annex', tagline: 'Prompts are transient. Specs persist.',
  body: [ H(1, 'SpecPrompt'),
    P('Spec-driven development for agents: define behavior as versioned, testable SPEC.md ',
      'specifications instead of disposable chat messages. The ', TT('bendscript.spec.v1'),
      ' vocabulary makes each MUST/SHOULD/MAY clause a span with edges to the implementations ',
      'and tests that satisfy it — traceability as a graph.') ],
  edges: [ ed('ampersand.docs:authored-in', 'bendscript') ],
},
{
  id: 'agentelic', name: 'Agentelic', mark: '⚙', os: 'agent builder',
  status: 'draft', layer: 'annex', tagline: 'Agents that ship: spec-driven design, deterministic testing, governed deployment.',
  body: [ H(1, 'Agentelic'),
    P('The engineering discipline between a demo and production. Build against a ',
      A('SpecPrompt', 'specprompt'), ' spec, test deterministically with every tool call mocked, ',
      'deploy with staged rollout — onto a governed runtime.') ],
  edges: [ ed('ampersand.docs:builds-from', 'specprompt') ],
},
{
  id: 'fleetprompt', name: 'FleetPrompt', mark: '📦', os: 'marketplace',
  status: 'draft', layer: 'annex', tagline: 'The open marketplace where spec-verified, trust-scored agents are published and installed.',
  body: [ H(1, 'FleetPrompt'),
    P('npm for AI agents: every published agent carries a machine-readable manifest declaring ',
      'capabilities, permissions, dependencies, and the spec it was built against. Trust is ',
      'computed from tests, usage, and audits — earned, not declared.') ],
  edges: [ ed('ampersand.docs:distributes', 'agentelic') ],
},
{
  id: 'webhost', name: 'WebHost.Systems', mark: '⬡', os: 'runtime',
  status: 'draft', layer: 'annex', tagline: 'Ship portable agents: one control plane, multi-runtime, immutable deploys, metered usage.',
  body: [ H(1, 'WebHost.Systems'),
    P('A multi-runtime deployment platform — Cloudflare Workers by default, AWS Bedrock ',
      'AgentCore for enterprise. Immutable deploys, signed telemetry, ', TT('invoke/v1'),
      ' endpoints. MCP + A2A bindings and ', A('[&]', 'ampersand'), ' governance are first-class.') ],
  edges: [ ed('ampersand.docs:runs', 'ampersand') ],
},
{
  id: 'ticktickclock', name: 'TickTickClock', mark: '⏱', os: '&time',
  status: 'draft', layer: 'annex', tagline: 'Temporal intelligence: anomaly detection and forecasting that feeds the watchdog.',
  body: [ H(1, 'TickTickClock'),
    P('The reference provider for the ', TT('&time'), ' primitive — anomaly detection, prediction, ',
      'and horizon obligations that feed the kernel’s temporal rung.') ],
  edges: [ ed('ampersand.docs:implements', 'ampersand') ],
},
{
  id: 'geofleetic', name: 'GeoFleetic', mark: '⬢', os: '&space · OS-012',
  status: 'draft', layer: 'annex', tagline: 'Spatial intelligence: geo-routing and delta-CRDT fleet state across the edge.',
  body: [ H(1, 'GeoFleetic'),
    P('The reference provider for the ', TT('&space'), ' primitive — geo-routing and delta-CRDT ',
      'state sync. The field-service architecture: ', A('gpscoord', 'gpscoord'),
      ' is the coordinate data layer, an optimizer solves the routing, and ',
      A('box-and-box', 'box-and-box'), ' governs and certifies each dispatch decision.') ],
  edges: [ ed('ampersand.docs:implements', 'ampersand'), ed('ampersand.docs:data-from', 'gpscoord'), ed('ampersand.docs:governed-by', 'box-and-box') ],
},
{
  id: 'gpscoord', name: 'GPSCoord', mark: '⌖', os: 'coordinate utility',
  status: 'draft', layer: 'annex', tagline: 'Every coordinate on Earth: lookup, conversion, distance, elevation, and a developer API.',
  body: [ H(1, 'GPSCoord'),
    P('A precision coordinate utility powered by open data (GeoNames, OpenStreetMap, SRTM): ',
      'format conversion across DD/DMS/UTM/MGRS/Plus Codes, distance and bearing, elevation ',
      'profiles, and a metered API. The tiered quota is a real ', A('resource ledger', 'box-and-box'),
      ' — the call past your limit isn’t rejected, it’s infeasible, with a certificate explaining the overage.') ],
  edges: [ ed('ampersand.docs:data-for', 'geofleetic') ],
},
];

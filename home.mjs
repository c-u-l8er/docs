// home.mjs — the homepage "theme system". The atlas mirrors the raw filesystem, but the
// front door should read as an organized map, not an alphabetical dump. This registry maps
// each project onto a Runefort BAND (a semantic layer of the stack, mirroring the canonical
// amp-nav categories: protocols · products · compose · research) and a ship-status ROOM
// (live / alpha / spec / draft). The build bakes it into model.home with live doc counts.
//
// Bands and statuses are kept consistent with the canonical nav source of truth
// (`ampersand-nav/src/amp-nav.js` LINKS table) — the same table STACK_SITEMAP.md derives from.
// Projects absent here fall back to the research band with a derived tagline, so adding a new
// project never breaks the floor. A "virtual" entry (e.g. SCOPE) has no top-level directory of
// its own — its canonical surface lives elsewhere — so it links out via `href`.

// bands render top-to-bottom; first listed is closest to the foundation.
export const BANDS = [
  { key: 'protocol',  title: 'the protocol stack · structural · temporal · diagnostic · spatial' },
  { key: 'product',   title: 'products · shipping now' },
  { key: 'primitive', title: 'compose · cognitive primitives' },
  { key: 'platform',  title: 'compose · agent platform & runtime' },
  { key: 'research',  title: 'research & academy · the science the stack stands on' },
];

// project dir → { band, status, mark, os, tagline, kernel?, virtual?, href? }.
// kernel:true lifts a project out of its band and onto the ring-0 slab at the foot of the floor.
// status ∈ live | alpha | spec | draft, mirroring the nav tier (shipped→live).
export const REGISTRY = {
  // ── the protocol stack ([&] + PULSE + PRISM + SCOPE) ──────────────────────────────────
  'AmpersandBoxDesign': { band: 'protocol', status: 'live', kernel: true, mark: '▣', os: 'OS-006 · kernel + [&] protocol',
    tagline: 'The governance kernel and the [&] composition protocol. Models generate answers; kernels govern them.' },
  'PULSE': { band: 'protocol', status: 'spec', mark: '∿', os: 'OS-010 · temporal',
    tagline: 'Temporal loop algebra: how an agent’s loops run, nest, and signal across each other.' },
  'PRISM': { band: 'protocol', status: 'spec', mark: '△', os: 'OS-009 · diagnostic',
    tagline: 'A self-improving continual-learning benchmark that refracts memory into nine dimensions.' },
  'SCOPE': { band: 'protocol', status: 'spec', virtual: true, href: 'https://opensentience.org/scope.html', mark: '⬚', os: 'OS-012 · spatial',
    tagline: 'Spatial algebra: N-D regions + spatial claims as first-class governed objects — the structural bridge between GeoFleetic and RuneFort. v0.1 draft.' },

  // ── products · shipping now ───────────────────────────────────────────────────────────
  'graphonomous': { band: 'product', status: 'live', mark: '◉', os: '&memory',
    tagline: 'Continual-learning memory: a topology-aware knowledge graph, exposed as an MCP server.' },
  'bendscript.com': { band: 'product', status: 'alpha', mark: '⤳', os: 'document protocol',
    tagline: 'A graph-first document protocol with typed inline links. This site’s pages are built on it.' },
  'runefort.com': { band: 'product', status: 'alpha', mark: 'ᚲ', os: 'layout protocol',
    tagline: 'AI-authored tile layouts that live in your repo. This very floor is one.' },

  // ── compose · cognitive primitives ────────────────────────────────────────────────────
  'deliberatic.com': { band: 'primitive', status: 'spec', mark: '⚖', os: '&reason',
    tagline: 'Formal argumentation: weighted bipolar attack/support graphs with Merkle-chained evidence.' },
  'ticktickclock.com': { band: 'primitive', status: 'spec', mark: '⏱', os: '&time',
    tagline: 'Temporal intelligence: anomaly detection and forecasting that feeds the watchdog.' },
  'geofleetic.com': { band: 'primitive', status: 'spec', mark: '⬢', os: '&space',
    tagline: 'Spatial intelligence: geo-routing and delta-CRDT fleet state across the edge.' },

  // ── compose · agent platform & runtime ────────────────────────────────────────────────
  'agentelic.com': { band: 'platform', status: 'live', mark: '⚙', os: 'agent builder',
    tagline: 'Agents that ship: spec-driven design, deterministic testing, governed deployment.' },
  'fleetprompt.com': { band: 'platform', status: 'live', mark: '📦', os: 'marketplace',
    tagline: 'The open marketplace where spec-verified, trust-scored agents are published and installed.' },
  'specprompt.com': { band: 'platform', status: 'live', mark: '📝', os: 'standards',
    tagline: 'Prompts are transient. Specs persist.' },
  'delegatic.com': { band: 'platform', status: 'live', mark: '⛓', os: 'fleet policy',
    tagline: 'Organization hierarchy, policy inheritance, and audit trails across an agent fleet.' },
  'agentromatic.com': { band: 'platform', status: 'spec', mark: '🗳', os: 'deliberation engine',
    tagline: 'Your agents don’t need a boss. They need a deliberation.' },
  'WebHost.Systems': { band: 'platform', status: 'alpha', mark: '⬡', os: 'runtime',
    tagline: 'Ship portable agents: one control plane, multi-runtime, immutable deploys, metered usage.' },

  // ── research & academy ────────────────────────────────────────────────────────────────
  'opensentience.org': { band: 'research', status: 'live', mark: '⊚', os: 'research hub · 11 protocols',
    tagline: 'Open research into machine cognition — the runtime protocols the stack is validated against.' },
  'weave': { band: 'research', status: 'alpha', mark: '⧉', os: 'cost certificate',
    tagline: 'Resource-rung static cost certificates: prove what a computation can afford before it runs.' },
  'workbench': { band: 'research', status: 'alpha', mark: '⊞', os: 'interactive academy',
    tagline: 'The hands-on workbench: the ladder’s rungs, wired up and playable in the browser.' },
  'docs': { band: 'research', status: 'alpha', mark: '⌘', os: 'this atlas',
    tagline: 'The site you’re reading — the whole stack mirrored as a walkable filesystem.' },
};

// anything not curated above still gets a room, in the research band.
export const FALLBACK = { band: 'research', status: 'draft', mark: '◇', os: 'project' };

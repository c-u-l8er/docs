// shell-atlas.js — client for the filesystem-mirror docs atlas. The hash route IS the
// source path: #/AmpersandBoxDesign/docs/architecture.md ⇄ that file on disk. Directories
// render as Runefort "floors" (campus → building → floor) of tiles; docs render as rooms.
// The "glue" layer keeps a reader moving: a lead, a scroll-spy outline, hover link-peeks,
// a neighborhood graph, a prev/next pager, a ⌘K palette, and animated route transitions.
(() => {
  const M = JSON.parse(document.getElementById('model').textContent);
  const app = document.getElementById('app');
  const byRoute = Object.fromEntries(M.pages.map(p => [p.route, p]));
  const ORDER = M.order || M.pages.map(p => p.route);
  const esc = (s) => String(s).replace(/[&<>"]/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;' }[c]));
  const go = (r) => { location.hash = '#/' + r; };

  // ---- tree helpers -------------------------------------------------------------------
  const findNode = (path) => {
    if (!path) return M.tree;
    let n = M.tree;
    for (const seg of path.split('/')) { const d = (n.dirs || []).find(x => x.name === seg); if (!d) return null; n = d; }
    return n;
  };
  const countDocs = (n) => (n.files ? n.files.length : 0) + (n.dirs || []).reduce((a, d) => a + countDocs(d), 0);
  const KINDS = ['campus', 'building', 'floor'];
  const kindOf = (path) => KINDS[Math.min((path ? path.split('/').length : 0), 2)];

  // ---- top bar ------------------------------------------------------------------------
  function crumbHTML(path, isDoc) {
    const parts = path ? path.split('/') : [];
    let acc = '', out = `<a href="#/">campus</a>`;
    parts.forEach((p, i) => {
      acc = acc ? acc + '/' + p : p;
      const last = i === parts.length - 1;
      out += `<span>/</span>` + ((last && isDoc) ? `<b style="color:#dff3fb">${esc(p)}</b>` : `<a href="#/${esc(acc)}">${esc(p)}</a>`);
    });
    return out;
  }
  function bar(path, isDoc) {
    return `<div class="bar">
      <div class="mk" onclick="location.hash='#/'">[&amp;] <b>ATLAS</b></div>
      <div class="crumbs">${crumbHTML(path, isDoc)}</div>
      <div class="kbd" id="palette-open" title="Jump to any doc"><span>⌘K</span> jump</div>
      <div class="kbd theme-tog" id="theme-tog" title="Toggle light / dark"><span id="theme-ic">◐</span></div>
      <div class="chip"><b>${M.count}</b> docs</div>
      <div class="chip">${M.projects.length} projects</div>
    </div>`;
  }

  // ---- left tree ----------------------------------------------------------------------
  function treeHTML(node, curPath) {
    const onPath = (p) => curPath === p || curPath.startsWith(p + '/');
    const render = (n, depth) => {
      const dirs = (n.dirs || []).map(d => {
        const open = onPath(d.path);
        return `<div class="tnode"><div class="trow dir ${curPath===d.path?'here':''}" data-dir="${esc(d.path)}">
          <span class="ic">${open ? '▾' : '▸'}</span><span class="nm">${esc(d.name)}</span></div>
          <div class="tkids ${open ? '' : 'hidden'}">${render(d, depth+1)}</div></div>`;
      }).join('');
      const files = (n.files || []).map(f =>
        `<div class="trow file ${curPath===f.route?'here':''}" data-file="${esc(f.route)}">
          <span class="ic">·</span><span class="nm" title="${esc(f.title)}">${esc(f.name)}</span></div>`).join('');
      return dirs + files;
    };
    return `<div class="tree"><div class="root">STACK · FILESYSTEM</div>${render(node, 0)}</div>`;
  }

  // ---- home: the organized Runefort floor (registry-driven theme) ---------------------
  function roomHTML(r, i) {
    const ext = r.external;
    const href = ext ? esc(r.route) : '#/' + esc(r.route);
    const meta = r.count > 0 ? `${esc(r.os)} · ${r.count} doc${r.count === 1 ? '' : 's'}` : esc(r.os);
    return `<a class="room s-${r.status}${ext ? ' ext' : ''}" style="--i:${i}" href="${href}"${ext ? ' target="_blank" rel="noopener"' : ''}>
      <div class="rk"><span class="rmark">${r.mark}</span><span class="rst s-${r.status}">${esc(r.status)}${ext ? ' ↗' : ''}</span></div>
      <div class="rname">${esc(r.name)}</div>
      <div class="ros">${meta}</div>
      <div class="rtag">${esc(r.tagline || '')}</div></a>`;
  }
  function home() {
    const H = M.home || { bands: [], meta: [], kernel: null };
    let i = 0;
    const bands = H.bands.map(b => `<div class="band"><div class="band-h">${esc(b.title)}</div>
      <div class="rooms reveal">${b.rooms.map(r => roomHTML(r, i++)).join('')}</div></div>`).join('');
    const metaRow = (H.meta && H.meta.length) ? `<div class="band metarow"><div class="band-h">start here · the stack itself</div>
      <div class="chips">${H.meta.map(m => `<a class="ochip" href="#/${esc(m.route)}" title="${esc(m.summary || '')}"><b>${esc(m.name)}</b><span>${esc(m.file)}</span></a>`).join('')}</div></div>` : '';
    const k = H.kernel;
    const slab = k ? `<div class="ring0"><div class="band-h">ring 0 · the foundation everything runs on</div>
      <a class="slab s-${k.status}" href="#/${esc(k.route)}"><span class="smark">${k.mark}</span>
        <div class="smeta"><div class="sos">${esc(k.os)} · ${k.count} docs</div>
          <div class="sname">${esc(k.name)}</div><div class="stag">${esc(k.tagline)}</div></div>
        <span class="sgo">enter the kernel →</span></a></div>` : '';
    // dark-factory phase display — derived from the baked model, never hard-coded
    const df = M.darkFactory;
    const dfHTML = df && df.steps ? `<div class="band dfband"><div class="band-h">dark factory · evidence ladder</div>
      <div class="dfphases">${df.steps.map(s => {
        if (s.status === 'GAP') return `<div class="dfp dfgap"><div class="dfn">${esc(s.name)}</div><div class="dfr">GAP</div><div class="dfg">${esc(s.gap)}</div></div>`;
        return `<div class="dfp"><div class="dfn">${esc(s.name)}</div><div class="dfr">${esc(s.rung)}</div><div class="dfs">source: ${esc(s.source)}</div></div>`;
      }).join('<div class="dfarr">→</div>')}</div></div>` : '';
    const body = `<div class="home">
      <div class="hero">
        <div class="eyebrow">${esc(M.brand)} · stack documentation</div>
        <h1>The [&amp;] stack, documented.</h1>
        <p>One home for the protocols, kernels, and engines behind governed machine cognition —
          [&amp;] composition, PULSE timing, PRISM measurement, SCOPE space, the Graphonomous
          memory substrate, and the verifiable runtime line that executes it: TRVM’s interaction
          calculus, WallRiderLang, and TRAAVIIS. Every page is mirrored straight from its source file
          and content-addressed, so the docs can’t drift from the code. Browse by topic below, or
          press <kbd>⌘K</kbd> to jump to any page.</p>
        <div class="legend">
          <span><i class="dot s-live"></i> live · on npm</span>
          <span><i class="dot s-alpha"></i> alpha</span>
          <span><i class="dot s-spec"></i> spec</span>
          <span><i class="dot s-draft"></i> draft</span>
        </div>
      </div>
      ${dfHTML}
      ${metaRow}
      <div class="floorbands">${bands}</div>
      ${slab}
      <div class="hfoot">© ${esc(M.brand)}${M.author ? ' · authored by ' + esc(M.author) : ''} ·
        <span class="mono">${M.count} documents across ${M.projects.length} live projects · every page content-addressed (CIDv1).</span></div>
    </div>`;
    paint('', false, body, '', true);
  }

  // ---- not found ----------------------------------------------------------------------
  // An unresolvable route used to fall back to M.tree, which rendered the entire campus
  // under the route's own name ("229 documents under `wrlm`"). That is a confidently wrong
  // page, not a missing one — every dead link looked like a working floor. Routes are real
  // filesystem paths and therefore case-sensitive, so the near-misses are worth offering.
  function notFound(path) {
    const lower = path.toLowerCase();
    const near = [];
    // Portfolio dirs carry their TLD (bendscript.com, opensentience.org) while links to them
    // are usually written bare, so a bare name matches the stem too.
    const stem = (s) => s.toLowerCase().replace(/\.(com|org|dev|io|net|ai)$/, '');
    (function walk(n, base) {
      for (const d of (n.dirs || [])) {
        const p = base ? base + '/' + d.name : d.name;
        if (stem(d.name) === lower || p.toLowerCase() === lower)
          near.push({ route: p, name: d.name + '/', meta: kindOf(p) + ' · ' + countDocs(d) + ' docs', ic: '▣' });
        walk(d, p);
      }
    })(M.tree, '');
    // A doc is also a near-miss when the route names the SUBJECT its filename leads with —
    // #/wrlm should reach TRVM/WRLM_RESEARCH_BRIEF.md. A bare `includes` would make a short
    // route match half the corpus, so the loose match is anchored to a word boundary in the
    // filename, needs three characters, and is ordered after every exact hit.
    const word = new RegExp('(^|[^a-z0-9])' + lower.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '($|[^a-z0-9])');
    const loose = [];
    for (const p of M.pages) {
      const nm = p.name.toLowerCase();
      if (p.route.toLowerCase() === lower || nm === lower)
        near.push({ route: p.route, name: p.title, meta: p.route, ic: '⤳' });
      else if (lower.length >= 3 && !lower.includes('/') && word.test(nm))
        loose.push({ route: p.route, name: p.title, meta: p.route, ic: '⤳' });
    }
    near.push(...loose);
    const tiles = near.slice(0, 12).map((n, i) => `<a class="tile dir" style="--i:${i}" href="#/${esc(n.route)}">
        <div class="ic">${n.ic}</div><div class="nm">${esc(n.name)}</div><div class="meta">${esc(n.meta)}</div></a>`).join('');
    const body = `<div class="floor-h"><div class="kind">no such route</div>
        <h1>Not found</h1>
        <div class="sub">Nothing in this atlas answers to <code>${esc(path)}</code>. Every route is a real
          file or folder path, mirrored from the filesystem — <a href="#/">start at the campus</a> or press
          <b>⌘K</b> to search all ${M.count} documents.</div></div>
      ${tiles ? `<div class="section-l">did you mean</div><div class="grid reveal">${tiles}</div>` : ''}`;
    paint('', false, body);
  }

  // ---- floor (directory) --------------------------------------------------------------
  function floor(path) {
    if (!path) return home();
    const node = findNode(path);
    if (!node) return notFound(path);
    const kind = kindOf(path);
    const title = path ? path.split('/').pop() : 'The [&] stack, documented';
    const dirs = (node.dirs || []).slice().sort((a,b) => a.name.localeCompare(b.name));
    const files = (node.files || []).slice().sort((a,b) => a.name.localeCompare(b.name));
    const dirTiles = dirs.map((d, i) => `<a class="tile dir" style="--i:${i}" href="#/${esc(d.path)}">
        <span class="cnt">${countDocs(d)}</span><div class="ic">▣</div>
        <div class="nm">${esc(d.name)}/</div><div class="meta">${kindOf(d.path)} · ${countDocs(d)} docs</div></a>`).join('');
    const docTiles = files.map((f, i) => { const p = byRoute[f.route];
      return `<a class="tile doc" style="--i:${i+dirs.length}" href="#/${esc(f.route)}"><div class="ic">⤳</div>
        <div class="nm">${esc(f.title)}</div>
        ${p && p.summary ? `<div class="tsum">${esc(p.summary)}</div>` : ''}
        <div class="meta">${esc(f.name)}</div></a>`; }).join('');
    const body = `<div class="floor-h"><div class="kind">${kind}${path?' · '+esc(path):''}</div>
        <h1>${esc(title)}${path?'':''}</h1>
        <div class="sub">${path ? `${countDocs(node)} documents under <code>${esc(path)}</code> — folders are floors, files are rooms.`
          : `${M.count} real documents across ${M.projects.length} projects, mirrored from the live filesystem. Each route is the file’s real path.`}</div></div>
      ${dirTiles ? `<div class="section-l">${path?'sub-floors':'buildings'}</div><div class="grid reveal">${dirTiles}</div>` : ''}
      ${docTiles ? `<div class="section-l">documents here</div><div class="grid reveal">${docTiles}</div>` : ''}`;
    paint(path, false, body);
  }

  // ---- reader (doc) -------------------------------------------------------------------
  function pager(route) {
    const i = ORDER.indexOf(route);
    const prev = i > 0 ? byRoute[ORDER[i - 1]] : null;
    const next = i >= 0 && i < ORDER.length - 1 ? byRoute[ORDER[i + 1]] : null;
    const cell = (p, dir) => p
      ? `<a class="pg ${dir}" href="#/${esc(p.route)}"><div class="dir">${dir==='next'?'continue →':'← previous'}</div>
          <div class="t">${esc(p.title)}</div>${p.summary?`<div class="s">${esc(p.summary)}</div>`:''}</a>`
      : `<span class="pg empty"></span>`;
    return `<div class="pager">${cell(prev,'prev')}${cell(next,'next')}</div>`;
  }

  function graphHTML(p) {
    const outs = p.links.map(r => ({ route: r, title: byRoute[r]?.title || r, kind: 'out' }));
    const ins = p.back.map(b => ({ route: b.route, title: b.title || b.route, kind: 'in' }));
    const seen = new Set(), nodes = [];
    for (const n of [...outs, ...ins]) { if (seen.has(n.route)) continue; seen.add(n.route); nodes.push(n); }
    if (!nodes.length) return '';
    const shown = nodes.slice(0, 9), extra = nodes.length - shown.length;
    const W = 250, H = 200, cx = W/2, cy = H/2, R = 78;
    const pos = shown.map((n, k) => {
      const a = (-Math.PI/2) + (2*Math.PI * k / shown.length);
      return { ...n, x: cx + R*Math.cos(a), y: cy + R*Math.sin(a) };
    });
    const edges = pos.map(n =>
      `<line x1="${cx}" y1="${cy}" x2="${n.x.toFixed(1)}" y2="${n.y.toFixed(1)}" class="ge ${n.kind}"/>`).join('');
    const dots = pos.map(n =>
      `<g class="gn ${n.kind}" data-route="${esc(n.route)}" tabindex="0" role="link">
        <title>${esc(n.title)} · ${n.kind==='out'?'links to':'links here'}</title>
        <circle cx="${n.x.toFixed(1)}" cy="${n.y.toFixed(1)}" r="6"/>
        <text x="${n.x.toFixed(1)}" y="${(n.y + (n.y<cy?-10:16)).toFixed(1)}" text-anchor="middle">${esc((byRoute[n.route]?byRoute[n.route].name:n.route).replace(/\.md$/,''))}</text>
       </g>`).join('');
    return `<div class="card"><div class="lab">neighborhood${extra?` · +${extra} more`:''}</div>
      <svg class="graph" viewBox="0 0 ${W} ${H}">${edges}
        <circle class="gc" cx="${cx}" cy="${cy}" r="8"/>
        <text class="gct" x="${cx}" y="${cy-14}" text-anchor="middle">this doc</text>${dots}</svg>
      <div class="glegend"><span class="o">● links out</span><span class="i">● referenced by</span></div></div>`;
  }

  function reader(route) {
    const p = byRoute[route];
    if (!p) return floor(route);
    const node = findNode(p.dir);
    const sibs = (node ? node.files : []).filter(f => f.route !== route).slice(0, 12);
    const tocCard = (p.outline && p.outline.length)
      ? `<div class="card toc-card"><div class="lab">on this page</div><nav class="toc">${
          p.outline.map(h => `<a href="#${esc(h.id)}" data-anchor="${esc(h.id)}" class="lvl${h.level}">${esc(h.text)}</a>`).join('')
        }</nav></div>` : '';
    const linksCard = p.links.length
      ? `<div class="card"><div class="lab">links to</div>${p.links.map(r => `<a href="#/${esc(r)}">${esc(byRoute[r]?byRoute[r].title:r)}</a>`).join('')}</div>` : '';
    const backCard = p.back.length
      ? `<div class="card"><div class="lab">referenced by</div>${p.back.map(b => `<a href="#/${esc(b.route)}">${esc(b.title||b.route)}</a>`).join('')}</div>` : '';
    const sibCard = sibs.length
      ? `<div class="card"><div class="lab">in this folder</div>${sibs.map(f => `<a href="#/${esc(f.route)}">${esc(f.title)}</a>`).join('')}</div>` : '';
    const lead = p.summary ? `<div class="lead">${esc(p.summary)}</div>` : '';
    const body = `<div class="reader"><div class="col">
        <div class="doc-h"><div class="src">
          <span class="proj">${esc(p.project)}</span>
          <span class="path" id="src">${esc(p.source)}</span>
          <span class="copy" id="copy">copy path</span>
          ${p.fellBack ? '<span class="tag">raw</span>' : ''}
        </div></div>
        ${lead}
        <div class="prose">${p.html}</div>
        ${pager(route)}</div>
        <div class="rail">
          ${tocCard}${graphHTML(p)}${linksCard}${backCard}${sibCard}
          <div class="card"><div class="lab">content id · CIDv1</div><div class="cid">${esc(p.cid)}</div></div>
        </div></div>`;
    paint(p.dir, true, body, route);
    wireReader(p);
  }

  // ---- reader interactivity: copy, scroll-spy, graph clicks ----------------------------
  function wireReader(p) {
    const c = document.getElementById('copy');
    if (c) c.onclick = () => navigator.clipboard.writeText(p.source).then(() => toast('copied: ' + p.source));

    app.querySelectorAll('.gn').forEach(g => {
      const goNode = () => go(g.dataset.route);
      g.onclick = goNode;
      g.onkeydown = (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); goNode(); } };
    });

    // smooth-scroll outline clicks (don't pollute history / route)
    app.querySelectorAll('.toc a[data-anchor]').forEach(a => a.onclick = (e) => {
      e.preventDefault();
      const el = document.getElementById(a.dataset.anchor);
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });

    // scroll-spy: highlight the outline entry for the heading currently in view
    const toc = app.querySelector('.toc');
    if (toc && p.outline && p.outline.length) {
      const links = new Map([...toc.querySelectorAll('a[data-anchor]')].map(a => [a.dataset.anchor, a]));
      const heads = p.outline.map(h => document.getElementById(h.id)).filter(Boolean);
      let active = null;
      const spy = new IntersectionObserver((ents) => {
        const vis = ents.filter(e => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (vis.length) {
          const id = vis[0].target.id;
          if (id !== active) { links.forEach(l => l.classList.remove('active')); links.get(id)?.classList.add('active'); active = id; }
        }
      }, { rootMargin: '-72px 0px -65% 0px', threshold: 0 });
      heads.forEach(h => spy.observe(h));
    }
  }

  // ---- hover link-peek cards ----------------------------------------------------------
  let peekEl, peekT;
  function ensurePeek() {
    if (!peekEl) { peekEl = document.createElement('div'); peekEl.className = 'peek'; document.body.appendChild(peekEl); }
    return peekEl;
  }
  function showPeek(a) {
    const m = (a.getAttribute('href') || '').match(/^#\/(.+)$/);
    if (!m) return;
    const p = byRoute[decodeURIComponent(m[1])]; if (!p) return;
    const el = ensurePeek();
    el.innerHTML = `<div class="pk-t">${esc(p.title)}</div>
      <div class="pk-p">${esc(p.source)}</div>
      ${p.summary ? `<div class="pk-s">${esc(p.summary)}</div>` : ''}
      <div class="pk-m">${p.links.length} out · ${p.back.length} in</div>`;
    const r = a.getBoundingClientRect();
    el.style.visibility = 'hidden'; el.classList.add('show');
    const ph = el.offsetHeight, pw = el.offsetWidth;
    let top = r.bottom + 8, left = Math.min(r.left, window.innerWidth - pw - 14);
    if (top + ph > window.innerHeight - 8) top = r.top - ph - 8;
    el.style.left = Math.max(8, left) + 'px'; el.style.top = Math.max(8, top) + 'px';
    el.style.visibility = 'visible';
  }
  function hidePeek() { if (peekEl) peekEl.classList.remove('show'); }
  function wirePeek() {
    app.addEventListener('mouseover', (e) => {
      const a = e.target.closest && e.target.closest('a[data-link], a[href^="#/"]');
      if (!a || !app.contains(a)) return;
      clearTimeout(peekT); peekT = setTimeout(() => showPeek(a), 140);
    });
    app.addEventListener('mouseout', (e) => {
      const a = e.target.closest && e.target.closest('a[data-link], a[href^="#/"]');
      if (a) { clearTimeout(peekT); peekT = setTimeout(hidePeek, 120); }
    });
  }

  // ---- ⌘K command palette -------------------------------------------------------------
  let pal, palInput, palList, palSel = 0, palHits = [];
  function buildPalette() {
    pal = document.createElement('div'); pal.className = 'palette';
    pal.innerHTML = `<div class="pal-box"><input class="pal-in" placeholder="Jump to any doc — type a title or path…" autocomplete="off">
      <div class="pal-list"></div><div class="pal-foot"><span><b>↑↓</b> move</span><span><b>↵</b> open</span><span><b>esc</b> close</span></div></div>`;
    document.body.appendChild(pal);
    palInput = pal.querySelector('.pal-in'); palList = pal.querySelector('.pal-list');
    pal.addEventListener('mousedown', (e) => { if (e.target === pal) closePalette(); });
    palInput.addEventListener('input', renderPalette);
    palInput.addEventListener('keydown', palKeys);
  }
  function openPalette() {
    if (!pal) buildPalette();
    pal.classList.add('show'); palInput.value = ''; palSel = 0; renderPalette();
    requestAnimationFrame(() => palInput.focus());
  }
  function closePalette() { if (pal) pal.classList.remove('show'); }
  function renderPalette() {
    const toks = palInput.value.trim().toLowerCase().split(/\s+/).filter(Boolean);
    const src = M.pages;
    palHits = (toks.length
      ? src.filter(p => { const hay = (p.title + ' ' + p.route + ' ' + (p.summary || '')).toLowerCase();
                          return toks.every(t => hay.includes(t)); })
      : src).slice(0, 40);
    if (palSel >= palHits.length) palSel = 0;
    palList.innerHTML = palHits.map((p, i) =>
      `<a class="pal-item ${i===palSel?'sel':''}" data-i="${i}" href="#/${esc(p.route)}">
        <div class="pi-t">${esc(p.title)}</div><div class="pi-p">${esc(p.route)}</div></a>`).join('')
      || `<div class="pal-empty">no matches</div>`;
    palList.querySelectorAll('.pal-item').forEach(el => {
      el.onmouseenter = () => { palSel = +el.dataset.i; markSel(); };
      el.onclick = (e) => { e.preventDefault(); choosePalette(); };
    });
    markSel();
  }
  function markSel() {
    palList.querySelectorAll('.pal-item').forEach((el, i) => el.classList.toggle('sel', i === palSel));
    const cur = palList.querySelector('.pal-item.sel'); if (cur) cur.scrollIntoView({ block: 'nearest' });
  }
  function choosePalette() { const p = palHits[palSel]; if (p) { closePalette(); go(p.route); } }
  function palKeys(e) {
    if (e.key === 'ArrowDown') { e.preventDefault(); palSel = Math.min(palSel + 1, palHits.length - 1); markSel(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); palSel = Math.max(palSel - 1, 0); markSel(); }
    else if (e.key === 'Enter') { e.preventDefault(); choosePalette(); }
    else if (e.key === 'Escape') { closePalette(); }
  }

  // ---- paint + wire -------------------------------------------------------------------
  function paint(treePath, isDoc, body, curRoute, full) {
    const tree = full ? '' : treeHTML(M.tree, curRoute || treePath || '');
    app.innerHTML = bar(treePath, isDoc) + `<div class="wrap ${full ? 'full' : ''}">${tree}<div class="main">${body}</div></div>`;
    app.querySelectorAll('.trow.dir').forEach(el => el.onclick = (e) => {
      if (e.target.classList.contains('ic')) { // toggle only
        const k = el.nextElementSibling; if (k) k.classList.toggle('hidden');
        el.querySelector('.ic').textContent = (k && k.classList.contains('hidden')) ? '▸' : '▾';
      } else go(el.dataset.dir);
    });
    app.querySelectorAll('.trow.file').forEach(el => el.onclick = () => go(el.dataset.file));
    const po = document.getElementById('palette-open'); if (po) po.onclick = openPalette;
    const tt = document.getElementById('theme-tog'); if (tt) tt.onclick = toggleTheme;
    updateThemeIc();
    requestAnimationFrame(() => { const here = app.querySelector('.trow.here'); if (here) here.scrollIntoView({ block: 'center' }); });
    window.scrollTo(0, 0);
  }
  // ---- light / dark theme (persisted; early-applied in the page <head> to avoid flash) ----
  const curTheme = () => document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark';
  function updateThemeIc() { const ic = document.getElementById('theme-ic'); if (ic) ic.textContent = curTheme() === 'light' ? '☀' : '☾'; }
  // keep the shared portfolio nav (<amp-nav>, outside #app) on the same theme
  function syncNavTheme() { const n = document.querySelector('amp-nav'); if (n) n.setAttribute('theme', curTheme()); }
  function toggleTheme() {
    const next = curTheme() === 'light' ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', next);
    try { localStorage.setItem('atlas-theme', next); } catch (e) {}
    updateThemeIc(); syncNavTheme();
  }

  let toastT;
  function toast(msg) { let t = document.querySelector('.toast'); if (!t) { t = document.createElement('div'); t.className = 'toast'; document.body.appendChild(t); }
    t.textContent = msg; t.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), 1600); }

  // ---- route (with animated view transitions) -----------------------------------------
  function render() {
    const h = decodeURIComponent(location.hash.replace(/^#\/?/, ''));
    if (byRoute[h]) reader(h); else floor(h);
  }
  function route() {
    if (document.startViewTransition) document.startViewTransition(() => render());
    else render();
  }
  window.addEventListener('hashchange', route);
  window.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); openPalette(); }
    else if (e.key === '/' && !/^(INPUT|TEXTAREA)$/.test(document.activeElement.tagName)) { e.preventDefault(); openPalette(); }
  });
  wirePeek();
  syncNavTheme();
  route();
})();

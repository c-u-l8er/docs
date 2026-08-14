// shell-reader.js — give a prerendered page the atlas chrome it was missing.
//
// WHY THIS EXISTS
// prerender.mjs emits one server-visible page per doc, which is what made the corpus readable
// to an engine at all (6 extractable words -> ~1,400 per page). But those pages ship the
// document and nothing else: no left tree, no breadcrumb bar, no ⌘K jump, no counters. Next to
// the hash-routed SPA they read as half-loaded, and the obvious "fix" — putting `#/` back into
// the nav's links — would return every crawler to the 6-word shell and undo the whole prerender.
//
// So: keep the crawlable URL, add the chrome on the client. Static HTML for machines, the full
// atlas for people, same URL for both.
//
// WHAT IT COSTS
// One fetch of /atlas.json (126 KB, cached across navigations) instead of the SPA's 10.2 MB
// inline model. The tree is DERIVED from routes rather than shipped, because `route === source
// path` is the atlas's own identity claim — so the filesystem shape is already in the route
// list and does not need to be sent twice.
//
// PROGRESSIVE ENHANCEMENT, STRICTLY
// Every failure path leaves the prerendered document exactly as served. No atlas.json, a parse
// error, an unexpected shape — the page stays readable, because the page was already complete
// before this file ran. This script may only ever ADD.
//
// NOT PORTED: the neighborhood graph. The prerendered rail already carries the same edges as
// text ("links to" / "referenced by"), which is the part a reader and an extractor both use.
(() => {
  const app = document.getElementById('app');
  const reader = app && app.querySelector('.reader');
  if (!app || !reader) return;               // not a prerendered doc/hub page — leave it alone

  // Prerendered URLs are /<route>/ and the route is the source path.
  const here = decodeURIComponent(location.pathname).replace(/^\/+|\/+$/g, '');

  const esc = (s) => String(s ?? '').replace(/[&<>"]/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  // Navigate to the prerendered page, NOT the hash route. This is the whole point of the file:
  // every link the chrome adds has to keep the crawlable URL, or the chrome quietly undoes the
  // thing it is decorating.
  const href = (route) => '/' + route.split('/').map(encodeURIComponent).join('/') + '/';

  fetch('/atlas.json', { credentials: 'omit' })
    .then(r => (r.ok ? r.json() : Promise.reject(new Error(r.status))))
    .then(atlas => { if (atlas && Array.isArray(atlas.pages)) build(atlas); })
    .catch(() => { /* the document is already complete; enhancement is optional by design */ });

  // ---- derive the filesystem tree from the route list ---------------------------------
  // `route === source path`, so the directory structure is recoverable from routes alone.
  function treeOf(pages) {
    const root = { name: '', path: '', dirs: [], files: [] };
    for (const p of pages) {
      const segs = p.route.split('/');
      const name = segs.pop();
      let node = root;
      let acc = '';
      for (const seg of segs) {
        acc = acc ? acc + '/' + seg : seg;
        let d = node.dirs.find(x => x.name === seg);
        if (!d) { d = { name: seg, path: acc, dirs: [], files: [] }; node.dirs.push(d); }
        node = d;
      }
      node.files.push({ name, route: p.route, title: p.title || name });
    }
    const sort = (n) => {
      n.dirs.sort((a, b) => a.name.localeCompare(b.name)).forEach(sort);
      n.files.sort((a, b) => a.name.localeCompare(b.name));
    };
    sort(root);
    return root;
  }

  function build(atlas) {
    const pages = atlas.pages;
    const isDoc = pages.some(p => p.route === here);
    const dirPath = isDoc ? here.split('/').slice(0, -1).join('/') : here;
    const projects = new Set(pages.map(p => p.project).filter(Boolean));
    const tree = treeOf(pages);

    // ---- bar ---------------------------------------------------------------------------
    const crumbs = (() => {
      const parts = here ? here.split('/') : [];
      let acc = '';
      return `<a href="/">campus</a>` + parts.map((p, i) => {
        acc = acc ? acc + '/' + p : p;
        const last = i === parts.length - 1;
        return `<span>/</span>` + (last && isDoc
          ? `<b style="color:#dff3fb">${esc(p)}</b>`
          : `<a href="${esc(href(acc))}">${esc(p)}</a>`);
      }).join('');
    })();

    const bar = document.createElement('div');
    bar.className = 'bar';
    bar.innerHTML = `
      <div class="mk" id="atlas-home">[&amp;] <b>ATLAS</b></div>
      <div class="crumbs">${crumbs}</div>
      <div class="kbd" id="palette-open" title="Jump to any doc"><span>⌘K</span> jump</div>
      <div class="kbd theme-tog" id="theme-tog" title="Toggle light / dark"><span id="theme-ic">◐</span></div>
      <div class="chip"><b>${esc(atlas.count ?? pages.length)}</b> docs</div>
      <div class="chip">${projects.size} projects</div>`;

    // ---- left tree ---------------------------------------------------------------------
    const onPath = (p) => here === p || here.startsWith(p + '/');
    const render = (n) => {
      const dirs = n.dirs.map(d => {
        const open = onPath(d.path);
        return `<div class="tnode"><div class="trow dir ${here === d.path ? 'here' : ''}" data-dir="${esc(d.path)}">
          <span class="ic">${open ? '▾' : '▸'}</span><span class="nm">${esc(d.name)}</span></div>
          <div class="tkids ${open ? '' : 'hidden'}">${render(d)}</div></div>`;
      }).join('');
      const files = n.files.map(f =>
        `<div class="trow file ${here === f.route ? 'here' : ''}" data-file="${esc(f.route)}">
          <span class="ic">·</span><span class="nm" title="${esc(f.title)}">${esc(f.name)}</span></div>`).join('');
      return dirs + files;
    };
    const treeEl = document.createElement('div');
    treeEl.className = 'tree';
    treeEl.innerHTML = `<div class="root">STACK · FILESYSTEM</div>${render(tree)}`;

    // ---- assemble, without re-rendering the document ------------------------------------
    // The prerendered .reader is moved, never rebuilt. Its HTML is the crawled artifact and
    // the thing this page is actually for.
    const wrap = document.createElement('div');
    wrap.className = 'wrap';
    const main = document.createElement('div');
    main.className = 'main';
    app.insertBefore(bar, app.firstChild);
    wrap.appendChild(treeEl);
    main.appendChild(reader);
    wrap.appendChild(main);
    app.appendChild(wrap);

    // ---- wiring --------------------------------------------------------------------------
    document.getElementById('atlas-home').onclick = () => { location.href = '/'; };
    treeEl.querySelectorAll('.trow.dir').forEach(el => {
      el.onclick = (e) => {
        if (e.target.classList.contains('ic')) {           // toggle only, do not navigate
          const kids = el.nextElementSibling;
          if (kids) kids.classList.toggle('hidden');
          el.querySelector('.ic').textContent =
            kids && kids.classList.contains('hidden') ? '▸' : '▾';
        } else location.href = href(el.dataset.dir);
      };
    });
    treeEl.querySelectorAll('.trow.file').forEach(el => {
      el.onclick = () => { location.href = href(el.dataset.file); };
    });

    requestAnimationFrame(() => {
      const cur = treeEl.querySelector('.trow.here');
      if (cur) cur.scrollIntoView({ block: 'center' });
    });

    wireTheme();
    wirePalette(pages);
  }

  // ---- theme (same key the SPA and the <head> pre-paint script use) ----------------------
  const curTheme = () =>
    document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark';
  function updateThemeIc() {
    const ic = document.getElementById('theme-ic');
    if (ic) ic.textContent = curTheme() === 'light' ? '☀' : '☾';
  }
  function wireTheme() {
    const tog = document.getElementById('theme-tog');
    if (!tog) return;
    tog.onclick = () => {
      const next = curTheme() === 'light' ? 'dark' : 'light';
      document.documentElement.setAttribute('data-theme', next);
      try { localStorage.setItem('atlas-theme', next); } catch (e) { /* private mode */ }
      updateThemeIc();
      const nav = document.querySelector('amp-nav');
      if (nav) nav.setAttribute('theme', next);
    };
    updateThemeIc();
  }

  // ---- ⌘K palette ------------------------------------------------------------------------
  // Same DOM and class contract as the SPA's palette (.palette / .pal-box / .pal-in /
  // .pal-list / .pal-item / .pi-t / .pi-p / .pal-empty), because atlas.css is the SPA's
  // stylesheet — inventing class names here would render an unstyled dialog.
  // The one deliberate difference: every href is a prerendered URL, not a hash route.
  function wirePalette(pages) {
    let pal = null, input = null, list = null, hits = [], sel = 0;

    const markSel = () => list.querySelectorAll('.pal-item').forEach((el, i) => {
      el.classList.toggle('sel', i === sel);
      if (i === sel) el.scrollIntoView({ block: 'nearest' });
    });

    const draw = () => {
      const toks = input.value.trim().toLowerCase().split(/\s+/).filter(Boolean);
      hits = (toks.length
        ? pages.filter(p => {
            const hay = ((p.title || '') + ' ' + p.route).toLowerCase();
            return toks.every(t => hay.includes(t));
          })
        : pages).slice(0, 40);
      if (sel >= hits.length) sel = 0;
      list.innerHTML = hits.map((p, i) =>
        `<a class="pal-item ${i === sel ? 'sel' : ''}" data-i="${i}" href="${esc(href(p.route))}">
          <div class="pi-t">${esc(p.title || p.route)}</div>
          <div class="pi-p">${esc(p.route)}</div></a>`).join('')
        || `<div class="pal-empty">no matches</div>`;
      list.querySelectorAll('.pal-item').forEach(el => {
        el.onmouseenter = () => { sel = +el.dataset.i; markSel(); };
      });
    };

    const close = () => { if (pal) pal.classList.remove('show'); };
    const open = () => {
      if (!pal) {
        pal = document.createElement('div');
        pal.className = 'palette';
        pal.innerHTML = `<div class="pal-box"><input class="pal-in" placeholder="Jump to any doc — type a title or path…" autocomplete="off">
          <div class="pal-list"></div><div class="pal-foot"><span><b>↑↓</b> move</span><span><b>↵</b> open</span><span><b>esc</b> close</span></div></div>`;
        document.body.appendChild(pal);
        input = pal.querySelector('.pal-in');
        list = pal.querySelector('.pal-list');
        pal.addEventListener('mousedown', (e) => { if (e.target === pal) close(); });
        input.addEventListener('input', draw);
        input.addEventListener('keydown', (e) => {
          if (e.key === 'Escape') { close(); return; }
          if (e.key === 'ArrowDown') { e.preventDefault(); sel = Math.min(sel + 1, hits.length - 1); markSel(); }
          if (e.key === 'ArrowUp') { e.preventDefault(); sel = Math.max(sel - 1, 0); markSel(); }
          if (e.key === 'Enter' && hits[sel]) { e.preventDefault(); location.href = href(hits[sel].route); }
        });
      }
      pal.classList.add('show');
      input.value = ''; sel = 0; draw();
      requestAnimationFrame(() => input.focus());
    };

    const btn = document.getElementById('palette-open');
    if (btn) btn.onclick = open;
    addEventListener('keydown', (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); open(); }
    });
  }
})();

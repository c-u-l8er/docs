// shell.js — client renderer. Reads the baked model, routes on hash, renders the Runefort
// floor (home) and the per-doc reading view with its typed-edge neighborhood + backlinks.
(function(){
"use strict";
const M = JSON.parse(document.getElementById('model').textContent);
const byId = Object.fromEntries(M.docs.map(d=>[d.id,d]));
const app = document.getElementById('app');
const esc = s => String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const reduced = matchMedia('(prefers-reduced-motion:reduce)').matches;

const BANDS = [
  {key:'protocol', title:'three-protocol stack'},
  {key:'faculty',  title:'capability primitives'},
  {key:'provider', title:'reference providers'},
  {key:'substrate',title:'document substrate · this site runs on these'},
  {key:'annex',    title:'product ecosystem'},
];
const inBand = k => M.docs.filter(d=>d.layer===k);
const ST = s => ({live:'live',alpha:'alpha',spec:'spec',draft:'draft'}[s]||s);

function bar(){
  return `<div class="bar">
    <div class="mk" data-home>[<b>&</b>] ${esc(M.brand.toUpperCase())}</div>
    <div class="search">
      <input id="q" placeholder="search the stack…" autocomplete="off" spellcheck="false">
      <div class="results" id="res" style="display:none"></div>
    </div>
    <div class="chip">box-and-box <b>${esc(M.facts['kernel.version'])}</b></div>
    <div class="chip">${esc(M.facts['laws.count'])} laws</div>
  </div>`;
}

function room(d){
  return `<a class="room s-${d.status}" href="#/${d.id}">
    <div class="rk"><span class="mark">${d.mark}</span><span class="st s-${d.status}">${ST(d.status)}</span></div>
    <div class="rn">${esc(d.name)}</div><div class="ro">${esc(d.os)}</div>
    <div class="rt">${esc(d.tagline)}</div></a>`;
}

function home(){
  const ring0 = inBand('ring0');
  const kernel = byId['box-and-box'];
  const bands = BANDS.map(b=>{
    const ds = inBand(b.key); if(!ds.length) return '';
    return `<div class="band b-${b.key}"><div class="band-h">${esc(b.title)}</div>
      <div class="rooms">${ds.map(room).join('')}</div></div>`;
  }).join('');
  return `${bar()}<div class="wrap">
    <div class="hero">
      <div class="eyebrow">${esc(M.brand)} · open research into machine cognition</div>
      <h1>The stack, as a place you can walk.</h1>
      <p>Documentation for an ecosystem of agent protocols — composition, governance, memory,
      time, space, and measurement. Every page is a BendScript document; this floor is a Runefort
      layout. Pick a room.</p>
      <div class="legend">
        <span><i class="dot d-live"></i> live · on npm</span>
        <span><i class="dot d-alpha"></i> alpha</span>
        <span><i class="dot d-spec"></i> spec-complete</span>
        <span><i class="dot d-draft"></i> draft</span>
      </div>
    </div>
    <div class="floor">${bands}</div>
    <div class="ring0"><div class="band-h">ring 0 · the foundation everything runs on</div>
      <div class="slab">
        <span class="mark">${kernel.mark}</span>
        <div class="meta"><div class="ro">${esc(kernel.os)}</div><div class="rn">${esc(kernel.name)}</div>
          <div class="rt">${esc(kernel.tagline)}</div></div>
        <a class="go" href="#/box-and-box">read the kernel docs →</a>
      </div>
    </div>
    <div class="foot">© ${esc(M.brand)} · authored by ${esc(M.author)}.
      <span class="mono">${M.docs.length} documents · every page content-addressed (CIDv1).</span></div>
  </div>`;
}

function navRail(active){
  const group=(title,keys)=>{const ds=M.docs.filter(d=>keys.includes(d.layer));if(!ds.length)return'';
    return `<div class="gh">${title}</div>`+ds.map(d=>
      `<a href="#/${d.id}" class="${d.id===active?'on':''}"><span class="nm">${d.mark}</span>${esc(d.name)}</a>`).join('');};
  return `<div class="rail nav"><div class="rh">the stack</div>
    ${group('governance',['ring0'])}
    ${group('protocols',['protocol'])}
    ${group('primitives',['faculty'])}
    ${group('providers',['provider'])}
    ${group('substrate',['substrate'])}
    ${group('ecosystem',['annex'])}
  </div>`;
}

function edgeRail(d){
  const out = d.edges.length ? `<div class="ecard"><div class="et">this page →</div>${
    d.edges.map(e=>{const inner = e.href
      ? `<a href="${esc(e.href)}" target="_blank" rel="noopener">${esc(e.name)}</a>`
      : `<a href="#/${e.to}">${esc(e.name)}</a>`;
      return `<div class="edge"><span class="pred">${esc(e.pred)}</span>${inner}</div>`;}).join('')}</div>`:'';
  const inb = d.back.length ? `<div class="ecard"><div class="et">← referenced by</div>${
    d.back.map(b=>`<div class="edge"><span class="pred in">${esc(b.pred)}</span><a href="#/${b.from}">${esc(b.name)}</a></div>`).join('')}</div>`:'';
  const cid = `<div class="ecard"><div class="et">content id · CIDv1</div><div class="cidbox">
    <span class="lab">tamper-evident · BendScript</span>${esc(d.cid)}</div></div>`;
  return `<div class="rail edges"><div class="rh">graph neighborhood</div>${out}${inb}${cid}</div>`;
}

function doc(id){
  const d = byId[id]; if(!d) return home();
  return `${bar()}<div class="wrap"><div class="doc">
    ${navRail(id)}
    <div class="read">
      <div class="crumbs"><a href="#/" data-home>floor</a><span class="sep">/</span>${esc(d.name)}</div>
      <div class="metaline"><span class="st s-${d.status}" style="color:var(--${d.status})">${ST(d.status)}</span>
        <span class="os">${esc(d.os)}</span></div>
      ${d.html}
      <div class="foot"><a href="#/" data-home>← back to the floor</a></div>
    </div>
    ${edgeRail(d)}
  </div></div>`;
}

// ---- search ----
function search(q){
  q=q.trim().toLowerCase(); const res=document.getElementById('res'); if(!res)return;
  if(!q){res.style.display='none';return;}
  const hits=M.docs.map(d=>{
    const hay=(d.name+' '+d.os+' '+d.tagline+' '+d.text).toLowerCase();
    let s=0; if(d.name.toLowerCase().includes(q))s+=10; if(d.tagline.toLowerCase().includes(q))s+=4;
    if(hay.includes(q))s+=1; return {d,s};
  }).filter(x=>x.s>0).sort((a,b)=>b.s-a.s).slice(0,8);
  if(!hits.length){res.innerHTML=`<a><span class="rt">no matches for “${esc(q)}”</span></a>`;res.style.display='block';return;}
  res.innerHTML=hits.map(({d})=>`<a href="#/${d.id}"><div class="rn">${d.mark} ${esc(d.name)}</div><div class="rt">${esc(d.tagline)}</div></a>`).join('');
  res.style.display='block';
}

function route(){
  const h=location.hash.replace(/^#\//,'');
  app.innerHTML = (h && byId[h]) ? doc(h) : home();
  window.scrollTo(0,0);
  const q=document.getElementById('q');
  if(q){ q.addEventListener('input',e=>search(e.target.value));
    q.addEventListener('keydown',e=>{if(e.key==='Enter'){const a=document.querySelector('#res a[href]');if(a)location.hash=a.getAttribute('href');}}); }
  document.querySelectorAll('[data-home]').forEach(el=>el.addEventListener('click',e=>{e.preventDefault();location.hash='#/';}));
  document.addEventListener('click',e=>{const r=document.getElementById('res');
    if(r&&!e.target.closest('.search'))r.style.display='none';},{once:true});
  if(!reduced){const rooms=document.querySelectorAll('.room');
    rooms.forEach((r,i)=>{r.style.opacity=0;r.style.transform='translateY(8px)';
      setTimeout(()=>{r.style.transition='opacity .4s ease, transform .4s ease';r.style.opacity=1;r.style.transform='none';}, 30+i*22);});}
}
window.addEventListener('hashchange',route);
route();
})();

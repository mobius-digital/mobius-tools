/* Work > Production (2026-10-13 fourth pass). Every ad from brief to live: one card per numbered brief, five columns
 * Brief > Making > Review > Ready > Live. A view over p_br_batch served by account-health /api/production; a drag moves the
 * card in Locus and the task in Asana (Review lives only in Locus), and posts one line in the brand channel.
 * Approved mock: docs/handoffs/work-calls-tasks-production.md. Own closure, CSS #pd-css, classes .pd-*, tokens only.
 * Production v2 (2026-10-14): a card opens its sheet (prodsheet.js: the brief, files, comments), "Open review" opens the
 * ad's versions in the review viewer (review-ui.js), a client login gets its own Needs you + Coming up page instead of
 * the board, and ?card=<id> opens a card (the Slack DM links). */
(() => {
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
let OPENED = false;   // the ?card= link is opened once per page load
const dt = iso => new Date(String(iso).slice(0, 10) + 'T12:00:00Z');
const short = iso => iso ? dt(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' }) : '';

const COLS = [
  { k: 'brief', label: 'Brief', hint: 'written, not started', dot: 'var(--muted)' },
  { k: 'making', label: 'Making', hint: 'in the studio', dot: 'var(--brand)' },
  { k: 'review', label: 'Review', hint: 'Cole or client notes', dot: 'var(--warn)' },
  { k: 'ready', label: 'Ready', hint: 'approved, not launched', dot: 'var(--good)' },
  { k: 'live', label: 'Live', hint: 'in the account', dot: 'var(--c-email)' },
];
const FMT = { Static: 'var(--brand)', Video: 'var(--bad)', UGC: 'var(--c-tiktok)', Carousel: 'var(--c-email)' };

let H = null, D = null, LOADING = null, BRAND = 'all', FORMAT = 'all', ALL_LIVE = false, DRAG = null;

const post = (path, body) => H.apiAH(path, { method: 'POST', body: JSON.stringify(body) });
const toast = msg => { const t = document.createElement('div'); t.setAttribute('role', 'status'); t.style.cssText = 'position:fixed;left:50%;bottom:24px;transform:translateX(-50%);max-width:min(560px,calc(100vw - 32px));background:var(--ink);color:var(--surface);padding:10px 16px;border-radius:12px;font-size:13.5px;z-index:9999;box-shadow:0 8px 30px rgba(0,0,0,.25)'; t.textContent = msg; document.body.appendChild(t); setTimeout(() => t.remove(), 4500); };
const today = () => (D && D.today) || new Date().toISOString().slice(0, 10);
const initials = name => String(name || '').split(/\s+/).filter(Boolean).map(w => w[0]).join('').slice(0, 3).toUpperCase();
const av = n => window.ProdSheet ? window.ProdSheet.av(n, 22) : (n ? `<span class="pd-av" title="${esc(n)}">${esc(n[0])}</span>` : '<span class="pd-av pd-none" title="Nobody yet">?</span>');
const openCard = (id, tab) => window.ProdSheet && window.ProdSheet.open(H, id, { tab, onChange: () => render(H, false) });
const ago = iso => {
  if (!iso) return '';
  const t = Date.parse(/Z|[+-]\d\d:?\d\d$/.test(iso) ? iso : String(iso).replace(' ', 'T') + 'Z');
  if (!t) return '';
  const m = Math.max(0, Math.round((Date.now() - t) / 60000));
  if (m < 1) return 'just now';
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  return h < 24 ? `${h} hour${h === 1 ? '' : 's'} ago` : `${Math.round(h / 24)} days ago`;
};

function css() {
  if ($('#pd-css')) return;
  const s = document.createElement('style'); s.id = 'pd-css';
  s.textContent = `
.pd{display:flex;flex-direction:column;gap:14px;min-width:0}
.pd-head{display:flex;align-items:flex-start;gap:16px;flex-wrap:wrap}
.pd-head h1{font-size:22px;font-weight:700;margin:0 0 4px;color:var(--ink)}
.pd-head p{margin:0;color:var(--ink-2);font-size:13.5px;max-width:720px}
.pd-head .pd-r{margin-left:auto;display:flex;align-items:center;gap:12px}
.pd-sync{font-size:12px;color:var(--muted)}
.pd-btn{height:34px;padding:0 14px;border-radius:10px;border:1px solid var(--line-strong);background:var(--surface);color:var(--ink);font:inherit;font-size:13px;font-weight:600;cursor:pointer}
.pd-btn.pri{background:var(--brand);border-color:var(--brand);color:var(--surface)}
.pd-btn:disabled{opacity:.5;cursor:default}
.pd-filt{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.pd-filt .lb{font-size:12px;color:var(--muted);margin-right:2px}
.pd-filt .gap{width:12px}
.pd-filt .sp{flex:1}
.pd-filt .note{font-size:12px;color:var(--muted)}
.pd-chip{height:26px;padding:0 11px;border-radius:999px;border:1px solid var(--line-strong);background:transparent;color:var(--ink-2);font:inherit;font-size:12px;cursor:pointer;white-space:nowrap}
.pd-chip.on{background:var(--cc,var(--ink));border-color:var(--cc,var(--ink));color:var(--surface);font-weight:600}
.pd-wrap{overflow-x:auto;min-width:0;padding-bottom:4px}
.pd-grid{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:12px;min-width:960px}
.pd-col{min-height:560px;background:var(--surface-2);border:1px solid var(--line);border-radius:8px;padding:10px;display:flex;flex-direction:column;gap:8px;transition:border-color .12s,background .12s}
.pd-col.over{border-color:var(--brand);background:color-mix(in srgb,var(--brand) 6%,var(--surface-2))}
.pd-ch{display:flex;align-items:center;gap:7px;padding:2px 2px 4px;font-size:13px}
.pd-ch .dot{width:8px;height:8px;border-radius:50%;flex:none}
.pd-ch b{font-weight:600;color:var(--ink)}
.pd-ch .n{color:var(--muted)}
.pd-ch .sp{flex:1}
.pd-ch .h{font-size:11px;color:var(--muted);white-space:nowrap}
.pd-card{background:var(--surface);border:1px solid var(--line);border-radius:8px;padding:10px;display:flex;flex-direction:column;gap:8px;cursor:grab;user-select:none}
.pd-card:active{cursor:grabbing}
.pd-card.late{border-color:var(--bad)}
.pd-card.drag{opacity:.45}
.pd-card.busy{opacity:.6;pointer-events:none}
.pd-r1{display:flex;align-items:center;gap:6px;font-size:11px;color:var(--muted);min-width:0}
.pd-r1 .num{font-weight:700}
.pd-r1 .br{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.pd-r1 .sp{flex:1}
.pd-fmt{font-size:11px;padding:2px 7px;border-radius:4px;font-weight:600;color:var(--fc);background:color-mix(in srgb,var(--fc) 14%,transparent);white-space:nowrap}
.pd-t{color:var(--ink);line-height:1.35;font-size:13.5px;overflow-wrap:anywhere}
.pd-t a{color:inherit;text-decoration:none}
.pd-t a:hover{text-decoration:underline}
.pd-r3{display:flex;align-items:center;gap:7px;font-size:12px;color:var(--muted);min-width:0}
.pd-r3 .m{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.pd-r3 .m.late{color:var(--bad)}
.pd-r3 .sp{flex:1}
.pd-act{font:inherit;font-size:12px;font-weight:600;color:var(--brand);background:none;border:0;padding:0;cursor:pointer;white-space:nowrap}
.pd-av{width:22px;height:22px;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;color:var(--surface);background:var(--line-strong);flex:none}
.pd-card .pd-img{width:100%;aspect-ratio:4/3;object-fit:cover;border-radius:6px;background:var(--surface-2);display:block}
.pd-t button{font:inherit;color:inherit;background:none;border:0;padding:0;text-align:left;cursor:pointer}
.pd-t button:hover{text-decoration:underline}
.pd-need{font-size:11px;font-weight:600;color:var(--warn)}
.pd-av.pd-none{background:var(--line-strong);color:var(--ink)}
.pd-add{height:30px;border:1px dashed var(--line-strong);border-radius:8px;background:transparent;color:var(--muted);font:inherit;font-size:12px;cursor:pointer}
.pd-add:hover{color:var(--ink);border-color:var(--ink-2)}
.pd-more{font:inherit;font-size:12px;color:var(--brand);background:none;border:0;padding:4px 2px;cursor:pointer;text-align:left}
.pd-empty{font-size:12px;color:var(--faint);padding:6px 2px}
.pd-sk{height:84px;border-radius:8px;background:var(--surface);opacity:.6}
.pd-scrim{position:fixed;inset:0;background:rgba(0,0,0,.45);display:flex;align-items:center;justify-content:center;z-index:9500;padding:16px}
.pd-modal{background:var(--surface);color:var(--ink);border:1px solid var(--line);border-radius:14px;padding:20px;width:min(460px,100%);display:flex;flex-direction:column;gap:12px;box-shadow:0 18px 44px rgba(0,0,0,.35)}
.pd-modal h3{margin:0;font-size:17px}
.pd-modal p{margin:0;font-size:12.5px;color:var(--muted)}
.pd-modal label{display:flex;flex-direction:column;gap:5px;font-size:12px;color:var(--ink-2)}
.pd-modal input,.pd-modal select,.pd-modal textarea{font:inherit;font-size:13.5px;color:var(--ink);background:var(--surface-2);border:1px solid var(--line-strong);border-radius:8px;padding:8px 10px;width:100%;box-sizing:border-box}
.pd-modal textarea{min-height:80px;resize:vertical}
.pd-modal .row{display:grid;grid-template-columns:1fr 1fr;gap:10px}
.pd-modal .ft{display:flex;justify-content:flex-end;gap:8px;margin-top:4px}
.pd-modal .err{color:var(--bad);font-size:12.5px}
@media (max-width:640px){.pd-head .pd-r{margin-left:0;width:100%;justify-content:space-between}.pd-filt .sp,.pd-filt .note{display:none}}
`;
  document.head.appendChild(s);
}

async function load() {
  const act = H.S.act || 'all';
  LOADING = H.apiAH(`/api/production?act=${encodeURIComponent(act)}`);
  try { D = await LOADING; D.act = act; } catch (e) { D = { error: e.message || 'Could not load the board.', cards: [], brands: [], team: [], live: { shown: 0, total: 0 }, act }; }
  if (D.act !== 'all' || !D.brands.some(b => b.act_id === BRAND)) BRAND = 'all';
}

function skeleton() {
  $('#main').innerHTML = `<div class="pd"><div class="pd-head"><div><h1>Production</h1><p>Loading the board...</p></div></div>
    <div class="pd-wrap"><div class="pd-grid">${COLS.map(c => `<div class="pd-col"><div class="pd-ch"><span class="dot" style="background:${c.dot}"></span><b>${c.label}</b></div><div class="pd-sk"></div><div class="pd-sk"></div></div>`).join('')}</div></div></div>`;
}

function metaOf(c) {
  if (c.board === 'review' && c.open_notes) return `${c.open_notes} open note${c.open_notes === 1 ? '' : 's'}`;
  if (c.board === 'live') return `Live ${short(c.since)}${c.result ? ` · ${esc(c.result)}` : ''}`;
  if (c.board === 'ready') return c.since ? `Approved ${short(c.since)}` : 'Approved';
  if (!c.due) return 'No due date';
  if (c.late) return `Due ${short(c.due)}, late`;
  if (c.due === today()) return `Due ${short(c.due)}, today`;
  return `Due ${short(c.due)}`;
}

function cardHtml(c) {
  const act = c.board === 'review' ? `<button class="pd-act" data-review="${esc(c.id)}">Open review</button>`
    : c.board === 'ready' ? `<button class="pd-act" data-launch="${esc(c.id)}">Launch to Meta</button>` : '';
  const title = `<button type="button" data-open="${esc(c.id)}" draggable="false">${esc(c.title || 'Untitled brief')}</button>`;
  return `<div class="pd-card${c.late ? ' late' : ''}" draggable="true" data-id="${esc(c.id)}">
    ${c.thumb && (c.board === 'review' || c.board === 'ready') ? `<img class="pd-img" src="${esc(c.thumb)}" alt="" loading="lazy" draggable="false">` : ''}
    <div class="pd-r1"><span class="num">${esc(initials(c.brand))} #${esc(c.num)}</span><span class="br">${esc(c.brand)}</span><span class="sp"></span><span class="pd-fmt" style="--fc:${FMT[c.format] || 'var(--brand)'}">${esc(c.format || 'Static')}</span></div>
    <div class="pd-t">${title}</div>
    ${c.needs_client ? `<span class="pd-need">Waiting on the client${c.needs_client === 'idea' ? ' (the idea)' : ''}</span>` : ''}
    <div class="pd-r3">${av(c.assignee)}<span class="m${c.late ? ' late' : ''}">${metaOf(c)}</span><span class="sp"></span>${act}</div>
  </div>`;
}

function paint() {
  if (D.error) { $('#main').innerHTML = `<div class="pd"><div class="pd-head"><div><h1>Production</h1><p style="color:var(--bad)">${esc(D.error)}</p></div><div class="pd-r"><button class="pd-btn" id="pdRetry">Try again</button></div></div></div>`; $('#pdRetry').onclick = () => render(H, true); return; }
  const shown = D.cards.filter(c => (BRAND === 'all' || c.act_id === BRAND) && (FORMAT === 'all' || c.format === FORMAT));
  const nWork = D.cards.filter(c => c.board !== 'live').length, nReady = D.cards.filter(c => c.board === 'ready').length;
  const brandChips = D.act === 'all' && D.brands.length > 1
    ? `<span class="lb">Brand</span><button class="pd-chip${BRAND === 'all' ? ' on' : ''}" data-brand="all">All</button>${D.brands.filter(b => D.cards.some(c => c.act_id === b.act_id)).map(b => `<button class="pd-chip${BRAND === b.act_id ? ' on' : ''}" data-brand="${esc(b.act_id)}">${esc(b.name)}</button>`).join('')}<span class="gap"></span>` : '';
  const fmtChips = `<span class="lb">Format</span><button class="pd-chip${FORMAT === 'all' ? ' on' : ''}" data-fmt="all">All</button>${Object.keys(FMT).map(f => `<button class="pd-chip${FORMAT === f ? ' on' : ''}" style="--cc:${FMT[f]}" data-fmt="${f}">${f}</button>`).join('')}`;
  const col = c => {
    let list = shown.filter(x => x.board === c.k);
    let more = '';
    if (c.k === 'live') {
      list.sort((a, b) => String(b.since).localeCompare(String(a.since)));
      const cap = D.live?.shown || list.length, total = D.live?.total || list.length;
      if (!ALL_LIVE && list.length > cap) list = list.slice(0, cap);
      if (!ALL_LIVE && total > list.length) more = `<button class="pd-more" id="pdAllLive">Show all ${total}</button>`;
      else if (ALL_LIVE && total > list.length) more = `<div class="pd-empty">Older live ads stay in Asana, Analyze Results.</div>`;
    }
    const n = c.k === 'live' && BRAND === 'all' && FORMAT === 'all' ? (D.live?.total ?? list.length) : list.length;
    return `<div class="pd-col" data-col="${c.k}">
      <div class="pd-ch"><span class="dot" style="background:${c.dot}"></span><b>${c.label}</b><span class="n">${n}</span><span class="sp"></span><span class="h">${c.hint}</span></div>
      ${list.map(cardHtml).join('') || '<div class="pd-empty">Nothing here.</div>'}
      ${more}${c.k === 'brief' ? '<button class="pd-add" data-newbrief>+ Brief</button>' : ''}
    </div>`;
  };
  $('#main').innerHTML = `<div class="pd">
    <div class="pd-head"><div><h1>Production</h1><p>Every ad from brief to live. Click a card to write its brief, drag it to move it. ${nWork} ads in progress, ${nReady} ready to launch.</p></div>
      <div class="pd-r"><span class="pd-sync">${D.mirror === false ? 'Asana mirror off' : `Mirrored to Asana${D.synced_at ? ` · synced ${ago(D.synced_at)}` : ''}`}</span><button class="pd-btn pri" data-newbrief>+ New brief</button></div></div>
    <div class="pd-filt">${brandChips}${fmtChips}<span class="sp"></span><span class="note">Click a card to write its brief. Late cards show in coral.</span></div>
    <div class="pd-wrap"><div class="pd-grid">${COLS.map(col).join('')}</div></div>
  </div>`;
  wire();
}

function wire() {
  const root = $('#main .pd');
  $$('[data-brand]', root).forEach(b => b.onclick = () => { BRAND = b.dataset.brand; paint(); });
  $$('[data-fmt]', root).forEach(b => b.onclick = () => { FORMAT = b.dataset.fmt; paint(); });
  $$('[data-newbrief]', root).forEach(b => b.onclick = () => newBrief());
  const all = $('#pdAllLive', root); if (all) all.onclick = () => { ALL_LIVE = true; paint(); };
  $$('[data-review]', root).forEach(b => b.onclick = e => {
    e.stopPropagation();
    const c = D.cards.find(x => x.id === b.dataset.review);
    if (c && c.versions && window.ProdSheet) { window.ProdSheet.review(H, c.id, { onChange: () => render(H, false) }); return; }
    if (c && c.asset_url) { window.open(c.asset_url, '_blank', 'noopener'); return; }
    openCard(c.id, 'files');
  });
  $$('[data-open]', root).forEach(b => b.onclick = e => { e.stopPropagation(); openCard(b.dataset.open); });
  $$('.pd-card', root).forEach(el => el.addEventListener('click', e => { if (e.target.closest('button,a')) return; openCard(el.dataset.id); }));
  $$('[data-launch]', root).forEach(b => b.onclick = e => { e.stopPropagation(); launch(D.cards.find(x => x.id === b.dataset.launch)); });
  $$('.pd-card', root).forEach(el => {
    el.addEventListener('dragstart', e => { DRAG = el.dataset.id; el.classList.add('drag'); try { e.dataTransfer.setData('text/plain', DRAG); e.dataTransfer.effectAllowed = 'move'; } catch { /* old browsers */ } });
    el.addEventListener('dragend', () => { el.classList.remove('drag'); DRAG = null; $$('.pd-col.over', root).forEach(c => c.classList.remove('over')); });
  });
  $$('.pd-col', root).forEach(col => {
    col.addEventListener('dragover', e => { if (!DRAG) return; e.preventDefault(); col.classList.add('over'); });
    col.addEventListener('dragleave', e => { if (!col.contains(e.relatedTarget)) col.classList.remove('over'); });
    col.addEventListener('drop', e => { e.preventDefault(); col.classList.remove('over'); const id = DRAG || e.dataTransfer.getData('text/plain'); if (id) move(id, col.dataset.col); });
  });
}

async function move(id, to) {
  const c = D.cards.find(x => x.id === id);
  if (!c || c.board === to) return;
  const from = c.board, t0 = today();
  c.board = to; c.since = t0;
  if (to === 'live') c.late = false; else c.late = !!c.due && c.due < t0;
  paint();
  try {
    const r = await post('/api/production/move', { id, to });
    if (r.error) throw new Error(r.error);
    const col = COLS.find(x => x.k === to).label;
    toast(r.asana && r.asana.moved ? `Moved to ${col}. Moved in Asana.` : `Moved to ${col}. ${(r.asana && r.asana.why) || 'Asana was not changed.'}`);
  } catch (e) {
    c.board = from; paint();
    toast(`Could not move it: ${e.message || 'try again'}`);
  }
}

function launch(c) {
  if (!c) return;
  if (c.studio_ad && window.LaunchToMeta) {
    window.LaunchToMeta.open({ act: c.act_id, tok: H.S.tok, studioAd: c.studio_ad, onDone: () => render(H, false) });
    return;
  }
  const pick = $('#clientPick');
  if (pick && pick.value !== c.act_id) { pick.value = c.act_id; pick.dispatchEvent(new Event('change')); }
  H.show('studio');
  toast(`Approve the ad for #${c.num} in Studio first, then Launch to Meta from there.`);
}

function newBrief() {
  const brands = D.brands || [];
  const act0 = D.act !== 'all' ? D.act : (BRAND !== 'all' ? BRAND : '');
  const team = D.team && D.team.length ? D.team : ['Cole', 'Ahsan', 'Noma', 'William', 'Ravo'];
  const w = document.createElement('div'); w.className = 'pd-scrim';
  w.innerHTML = `<div class="pd-modal" role="dialog" aria-modal="true" aria-labelledby="pdNbT">
    <h3 id="pdNbT">New brief</h3>
    <p>${D.mirror === false ? 'Locus makes the next numbered brief and its card lands in Brief.' : "Locus makes the next numbered brief in the brand's Asana project, in Creative Brief(s), and its card lands in Brief."} Then you write it on the card.</p>
    <label>Brand<select id="pdNbAct"><option value="">Pick the brand</option>${brands.map(b => `<option value="${esc(b.act_id)}"${b.act_id === act0 ? ' selected' : ''}>${esc(b.name)}</option>`).join('')}</select></label>
    <label>What to make<textarea id="pdNbText" maxlength="300" placeholder="Three UGC hooks for the fall polo"></textarea></label>
    <div class="row"><label>Who makes it<select id="pdNbOwner"><option value="">Nobody yet</option>${team.map(n => `<option>${esc(n)}</option>`).join('')}</select></label>
      <label>Due<input type="date" id="pdNbDue"></label></div>
    <div class="err" id="pdNbErr" hidden></div>
    <div class="ft"><button class="pd-btn" id="pdNbX">Cancel</button><button class="pd-btn pri" id="pdNbGo">Make the brief</button></div>
  </div>`;
  document.body.appendChild(w);
  const close = () => { w.remove(); document.removeEventListener('keydown', key); };
  const key = e => { if (e.key === 'Escape') close(); };
  document.addEventListener('keydown', key);
  w.addEventListener('mousedown', e => { if (e.target === w) close(); });
  $('#pdNbX', w).onclick = close;
  $('#pdNbText', w).focus();
  $('#pdNbGo', w).onclick = async () => {
    const act = $('#pdNbAct', w).value, text = $('#pdNbText', w).value.trim(), err = $('#pdNbErr', w), go = $('#pdNbGo', w);
    err.hidden = true;
    if (!act) { err.textContent = 'Pick the brand.'; err.hidden = false; return; }
    if (!text) { err.textContent = 'Say what to make.'; err.hidden = false; return; }
    go.disabled = true; go.textContent = 'Making it...';
    try {
      const r = await post('/api/production/brief', { act, text, owner: $('#pdNbOwner', w).value, due: $('#pdNbDue', w).value });
      if (r.error) throw new Error(r.error);
      close();
      toast(r.local ? `Brief #${r.num} is on the board. Write it now.` : r.num ? `Brief #${r.num} is in Asana and on the board. Write it now.` : 'The brief is on the board.');
      await render(H, false);
      if (r.id) openCard(r.id);
    } catch (e) { err.textContent = e.message || 'Could not make the brief.'; err.hidden = false; go.disabled = false; go.textContent = 'Make the brief'; }
  };
}

async function render(host, first) {
  H = host; css();
  if (window.ProdSheet && (H.S.role === 'client' || H.S.client)) return window.ProdSheet.client(H);
  if (window.ProdSheet) { window.ProdSheet.css(); await window.ProdSheet.photos(H); }
  const t = H.RUN();
  if (first || !D || D.act !== (H.S.act || 'all')) { ALL_LIVE = false; skeleton(); }
  await load();
  if (t !== H.RUN()) return;
  paint();
  if (!OPENED) {
    OPENED = true;
    const id = new URLSearchParams(location.search).get('card') || window.PD_CARD;
    if (id) openCard(id);
  }
}

window.ProductionTab = { render, mirrorCard: (el, h) => window.ProdSheet && window.ProdSheet.mirrorCard(el, h) };
})();

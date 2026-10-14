/* PRODUCTION V2 (2026-10-14; approved mock https://claude.ai/artifact/Tw9a67Zb4qLg5ZgFDApUMj, boards 1, 3 and 4).
 *   ProdSheet.open(H, id, opts)   the card's sheet: Brief / Files / Comments. The brief's fields follow its kind (New idea,
 *                                 Iteration, Resize or cut, Something else) and its format (Static, Video, UGC, Carousel).
 *   ProdSheet.review(H, id, opts) the ad's versions in the review viewer (review-ui.js): drawing, notes, Approve.
 *   ProdSheet.client(H)           a client login's Production: Needs you, then Coming up (list or calendar).
 *   ProdSheet.mirrorCard(el, H)   Agency settings > Integrations: the Asana mirror switch and the cards not in Locus yet.
 *   ProdSheet.photos(H)           the team's photos by first name (Google sign-in, else Slack).
 * Data: account-health /api/production/* (prodwork.js). The sheet is V2UI.panel (the right-hand drawer, wide). Own
 * closure, CSS #ps-css, classes .ps-*, tokens only. In-app modals only. */
(() => {
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const short = iso => iso ? new Date(String(iso).slice(0, 10) + 'T12:00:00Z').toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' }) : '';
const when = iso => { if (!iso) return ''; const t = Date.parse(/Z|[+-]\d\d:?\d\d$/.test(iso) ? iso : String(iso).replace(' ', 'T') + 'Z'); return t ? new Date(t).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : ''; };
const HUE = { Cole: 'var(--brand)', Ahsan: 'var(--good)', Noma: 'var(--warn)', William: 'var(--c-email)', Ravo: 'var(--bad)', Radhesh: 'var(--c-tiktok)', Hamza: 'var(--c-amazon)', Mobius: 'var(--muted)' };
const FMT = { Static: 'var(--brand)', Video: 'var(--bad)', UGC: 'var(--c-tiktok)', Carousel: 'var(--c-email)' };
const KINDS = [['new', 'New idea'], ['iter', 'Iteration'], ['resize', 'Resize or cut'], ['free', 'Something else']];
const FORMATS = ['Static', 'Video', 'UGC', 'Carousel'];
const SIZES = ['1:1', '4:5', '9:16', '1.91:1', '15s cut', '6s cut'];
const CHANGES = ['Hook', 'Visual', 'Copy', 'CTA', 'Format'];
const STAGE = { brief: 'Brief', making: 'Making', review: 'Review', ready: 'Ready', live: 'Live', done: 'Done' };
/* The row table per format: [key, column label, placeholder]. Mirrors ROWCOLS in account-health prodwork.js. */
const ROWS = {
  Static: { title: 'More ads in this test', add: '+ Add an ad', cols: [['headline', 'Headline', 'The words on this ad'], ['visual', 'Visual', 'What the picture is']], tpl: '28px minmax(0,1fr) minmax(0,1.3fr) 120px 28px' },
  Video: { title: 'The script', add: '+ Add a line', cols: [['vo', 'Voiceover', 'What is said'], ['text', 'On-screen text', 'Words on screen'], ['shot', 'Shot', 'What we see'], ['sec', 'Sec', '2']], tpl: '28px minmax(0,2fr) minmax(0,1.4fr) minmax(0,2fr) 56px 120px 28px' },
  UGC: { title: 'Scenes and mentions', add: '+ Add a scene', cols: [['show', 'Show (scene)', 'What the creator films'], ['say', 'Say (talking point, not a script)', 'What they get across']], tpl: '28px minmax(0,1fr) minmax(0,1fr) 120px 28px' },
  Carousel: { title: 'The cards', add: '+ Add a card', cols: [['headline', 'Headline', 'Card words'], ['visual', 'Visual', 'What the card shows']], tpl: '28px minmax(0,1fr) minmax(0,1.3fr) 120px 28px' },
};
let PHOTOS = null, PHOTOS_P = null;

function css() {
  if ($('#ps-css')) return;
  const s = document.createElement('style'); s.id = 'ps-css';
  s.textContent = `
.ps{display:flex;flex-direction:column;min-height:100%;color:var(--ink)}
.ps-h{display:flex;flex-direction:column;gap:12px;padding:4px 0 0}
.ps-top{display:flex;align-items:center;gap:10px;flex-wrap:wrap}
.ps-top .num{font-size:12px;font-weight:700;color:var(--muted)}
.ps-top .br{font-size:12px;color:var(--muted)}
.ps-top .sp{flex:1}
.ps-top .saved{font-size:12px;color:var(--muted)}
.ps-title{font:inherit;font-size:18px;font-weight:700;color:var(--ink);background:transparent;border:1px solid transparent;border-radius:6px;padding:4px 6px;margin:0 -6px;width:calc(100% + 12px);box-sizing:border-box}
.ps-title:hover,.ps-title:focus{border-color:var(--line-strong);background:var(--surface-2);outline:none}
.ps-meta{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:12px}
.ps-kv{display:flex;flex-direction:column;gap:4px;min-width:0;font-size:13px}
.ps-kv>span:first-child,.ps-lab{font-size:12px;color:var(--muted);font-weight:500}
.ps-kv b{font-weight:500;color:var(--ink)}
.ps-kv select,.ps-kv input{font:inherit;font-size:13px;color:var(--ink);background:var(--surface-2);border:1px solid var(--line-strong);border-radius:6px;padding:5px 7px;min-width:0;width:100%;box-sizing:border-box}
.ps-tabs{display:flex;gap:4px;border-bottom:1px solid var(--line);margin-top:2px}
.ps-tab{height:36px;padding:0 12px;border:0;border-bottom:2px solid transparent;background:transparent;color:var(--muted);font:inherit;font-size:13px;font-weight:600;cursor:pointer}
.ps-tab.on{color:var(--ink);border-bottom-color:var(--brand)}
.ps-b{padding:18px 0 28px;display:flex;flex-direction:column;gap:16px}
.ps-f{display:flex;flex-direction:column;gap:6px;min-width:0}
.ps-f textarea,.ps-f input,.ps-in{font:inherit;font-size:13px;color:var(--ink);background:var(--surface-2);border:1px solid var(--line-strong);border-radius:6px;padding:8px 10px;width:100%;box-sizing:border-box;resize:vertical;line-height:1.45}
.ps textarea{resize:none;overflow:hidden;field-sizing:content;min-height:38px}
.ps-f textarea.ai,.ps-in.ai{border-color:var(--brand-line);background:var(--brand-tint)}
.ps-ai{color:var(--brand);font-weight:600}
.ps-2{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}
.ps-3{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}
.ps-st3{display:grid;grid-template-columns:minmax(0,2fr) minmax(0,2fr) minmax(0,1fr);gap:12px}
.ps-seg{display:flex;flex-wrap:wrap}
.ps-seg button{height:30px;padding:0 12px;border:1px solid var(--line-strong);background:transparent;color:var(--ink-2);font:inherit;font-size:12px;font-weight:600;cursor:pointer;margin-left:-1px}
.ps-seg button:first-child{border-radius:6px 0 0 6px;margin-left:0}.ps-seg button:last-child{border-radius:0 6px 6px 0}
.ps-seg button.on{background:var(--ink);color:var(--surface);border-color:var(--ink);position:relative}
.ps-chips{display:flex;gap:6px;flex-wrap:wrap}
.ps-chip{height:28px;padding:0 11px;border-radius:999px;border:1px solid var(--line-strong);background:transparent;color:var(--ink-2);font:inherit;font-size:12px;cursor:pointer}
.ps-chip.on{background:var(--brand);border-color:var(--brand);color:var(--surface);font-weight:600}
.ps-bar{display:flex;align-items:center;gap:10px;padding:10px 12px;border:1px solid var(--line);border-radius:8px;background:var(--surface-2);flex-wrap:wrap}
.ps-bar span{flex:1;min-width:200px;color:var(--ink-2);font-size:13px}
.ps-btn{height:32px;padding:0 14px;border-radius:8px;border:1px solid var(--line-strong);background:var(--surface-2);color:var(--ink);font:inherit;font-size:13px;font-weight:600;cursor:pointer;white-space:nowrap}
.ps-btn.pri{background:var(--brand);border-color:var(--brand);color:var(--surface)}
.ps-btn.ok{background:var(--good);border-color:var(--good);color:var(--surface)}
.ps-btn.g{background:transparent;border-color:transparent;color:var(--brand);padding:0 4px}
.ps-btn:disabled{opacity:.5;cursor:default}
.ps-sec{font-size:14px;font-weight:700;margin:4px 0 0;color:var(--ink)}
.ps-card{border:1px solid var(--line);border-radius:8px;background:var(--surface);padding:12px;display:flex;gap:12px;align-items:center}
.ps-thumb{width:56px;height:56px;border-radius:6px;background:var(--surface-2);flex:none;object-fit:cover;display:flex;align-items:center;justify-content:center;font-size:11px;color:var(--muted);overflow:hidden}
.ps-thumb img{width:100%;height:100%;object-fit:cover}
.ps-tbl{display:flex;flex-direction:column;gap:8px}
.ps-tbl .hd{display:grid;gap:8px;font-size:11px;color:var(--muted);font-weight:600;text-transform:uppercase;letter-spacing:.4px}
.ps-tbl .rw{display:grid;gap:8px;align-items:start}
.ps-tbl .n{font-weight:700;color:var(--muted);padding-top:8px}
.ps-x{width:28px;height:34px;border:0;background:transparent;color:var(--muted);cursor:pointer;font-size:16px;border-radius:6px}
.ps-x:hover{color:var(--bad);background:var(--surface-2)}
.ps-insp{display:flex;flex-wrap:wrap;gap:6px;align-items:center}
.ps-ic{position:relative;width:44px;height:44px;border-radius:6px;background:var(--surface-2);border:1px solid var(--line);overflow:hidden;display:flex;align-items:center;justify-content:center;font-size:10px;color:var(--muted);text-decoration:none}
.ps-ic img{width:100%;height:100%;object-fit:cover}
.ps-ic .rm{position:absolute;top:0;right:0;width:16px;height:16px;border:0;background:var(--surface);color:var(--ink);font-size:11px;line-height:16px;cursor:pointer;padding:0;border-radius:0 0 0 4px}
.ps-add{height:34px;border:1px dashed var(--line-strong);border-radius:6px;background:transparent;color:var(--muted);font:inherit;font-size:11px;cursor:pointer;padding:0 8px}
.ps-add:hover{color:var(--ink);border-color:var(--ink-2)}
.ps-hint{font-size:12px;color:var(--muted)}
.ps-foot{display:flex;gap:10px;align-items:center;border-top:1px solid var(--line);padding-top:14px;flex-wrap:wrap}
.ps-foot .ps-hint{flex:1;min-width:220px}
.ps-c{display:flex;gap:10px}
.ps-c .bd{flex:1;min-width:0;display:flex;flex-direction:column;gap:3px}
.ps-c .hd{display:flex;gap:8px;align-items:center;flex-wrap:wrap;font-size:12px;color:var(--muted)}
.ps-c .hd b{color:var(--ink);font-size:13px;font-weight:600}
.ps-c .tx{color:var(--ink-2);line-height:1.45;white-space:pre-wrap;overflow-wrap:anywhere}
.ps-sys{font-size:12px;color:var(--muted);font-style:italic}
.ps-tag{font-size:11px;padding:2px 7px;border-radius:4px;font-weight:600;white-space:nowrap;color:var(--tc,var(--muted));background:color-mix(in srgb,var(--tc,var(--muted)) 14%,transparent)}
.ps-av{width:24px;height:24px;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;font-size:10px;font-weight:700;color:var(--surface);flex:none;object-fit:cover}
.ps-ro{display:flex;flex-direction:column;gap:4px}
.ps-ro p{margin:0;color:var(--ink-2);line-height:1.5;white-space:pre-wrap}
.ps-err{color:var(--bad);font-size:12.5px}
.ps-wait{border:1px solid var(--warn);border-radius:8px;padding:10px 12px;display:flex;gap:10px;align-items:center;flex-wrap:wrap}
.ps-wait span{flex:1;min-width:200px;font-size:13px;color:var(--ink-2)}
@media (max-width:760px){.ps-meta{grid-template-columns:repeat(2,minmax(0,1fr))}.ps-2,.ps-3,.ps-st3{grid-template-columns:minmax(0,1fr)}
  .ps-tbl .hd{display:none}.ps-tbl .rw{grid-template-columns:28px minmax(0,1fr) 28px!important}.ps-tbl .rw>*:not(.n):not(.ps-x){grid-column:2}}
/* the client's page and the mirror card */
.pc{display:flex;flex-direction:column;gap:22px;max-width:1080px;min-width:0}
.pc h1{font-size:22px;font-weight:700;margin:0 0 4px;color:var(--ink)}
.pc h2{margin:0 0 10px;font-size:15px;color:var(--ink)}
.pc .lead{margin:0;color:var(--muted);font-size:13.5px}
.pc-need{border:1px solid color-mix(in srgb,var(--warn) 45%,var(--line));border-radius:8px;background:var(--surface);padding:12px 14px;display:flex;gap:14px;align-items:center;flex-wrap:wrap}
.pc-need .bd{flex:1;min-width:180px;display:flex;flex-direction:column;gap:3px}
.pc-row{display:grid;grid-template-columns:56px minmax(0,1fr) 110px 120px 140px;gap:12px;align-items:center;padding:10px 14px;border:1px solid var(--line);border-radius:8px;background:var(--surface);cursor:pointer;text-align:left;font:inherit;color:inherit;width:100%}
.pc-row:hover{border-color:var(--line-strong)}
.pc-th{display:grid;grid-template-columns:56px minmax(0,1fr) 110px 120px 140px;gap:12px;padding:0 14px;font-size:11px;color:var(--muted);font-weight:600;text-transform:uppercase;letter-spacing:.4px}
.pc-cal{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:6px}
.pc-day{min-height:84px;border:1px solid var(--line);border-radius:6px;background:var(--surface-2);padding:6px;display:flex;flex-direction:column;gap:4px;min-width:0}
.pc-day.today{border-color:var(--brand)}
.pc-day .d{font-size:11px;color:var(--muted)}
.pc-day button{font:inherit;font-size:11px;text-align:left;color:var(--ink);background:var(--surface);border:1px solid var(--line);border-radius:4px;padding:3px 5px;cursor:pointer;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.pc-mo{display:flex;align-items:center;gap:8px}
@media (max-width:760px){.pc-th{display:none}.pc-row{grid-template-columns:48px minmax(0,1fr)}.pc-row>*:nth-child(n+3){grid-column:2}.pc-cal{grid-template-columns:repeat(7,minmax(36px,1fr));overflow-x:auto}}
.pm-cols{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;margin:12px 0}
.pm-box{background:var(--surface-2);border:1px solid var(--line);border-radius:8px;padding:12px 14px}
.pm-box b{display:block;margin:0 0 6px;color:var(--ink)}
.pm-box ul{margin:0;padding-left:18px;color:var(--ink-2);line-height:1.6;font-size:13px}
.pm-miss{display:flex;gap:12px;align-items:center;border:1px solid var(--warn);border-radius:8px;padding:10px 12px;flex-wrap:wrap}
.pm-miss .n{font-size:20px;font-weight:700;color:var(--warn)}
@media (max-width:760px){.pm-cols{grid-template-columns:minmax(0,1fr)}}
`;
  document.head.appendChild(s);
}

const api = (H, path, opts = {}) => H.apiAH(path, opts.method && opts.method !== 'GET' ? { method: opts.method, body: JSON.stringify(opts.body || {}) } : { fresh: true });
const post = (H, path, body) => api(H, path, { method: 'POST', body });
const toast = msg => { const t = document.createElement('div'); t.setAttribute('role', 'status'); t.className = 'lx-toast'; t.style.cssText = 'position:fixed;left:50%;bottom:24px;transform:translateX(-50%);max-width:min(560px,calc(100vw - 32px));background:var(--ink);color:var(--surface);padding:10px 16px;border-radius:12px;font-size:13.5px;z-index:9999;box-shadow:0 8px 30px rgba(0,0,0,.25)'; t.textContent = msg; document.body.appendChild(t); setTimeout(() => t.remove(), 4500); };
const isClient = H => H.S && (H.S.role === 'client' || !!H.S.client);

/** The team's photos by first name, loaded once a session (team only). */
function photos(H) {
  if (PHOTOS) return Promise.resolve(PHOTOS);
  if (isClient(H)) return Promise.resolve(PHOTOS = {});
  return PHOTOS_P || (PHOTOS_P = api(H, '/api/production/photos').then(r => (PHOTOS = (r && r.photos) || {})).catch(() => (PHOTOS = {})));
}
function av(name, size = 24) {
  const n = String(name || '').split(' ')[0];
  if (!n) return `<span class="ps-av" style="background:var(--line-strong);color:var(--ink);width:${size}px;height:${size}px" title="Nobody yet">?</span>`;
  const p = PHOTOS && PHOTOS[n];
  if (p) return `<img class="ps-av" src="${esc(p)}" alt="" title="${esc(name)}" style="width:${size}px;height:${size}px" referrerpolicy="no-referrer">`;
  return `<span class="ps-av" title="${esc(name)}" style="background:${HUE[n] || 'var(--line-strong)'};width:${size}px;height:${size}px">${esc(n[0])}</span>`;
}

/** A text box as tall as its words (Asana and ClickUp descriptions): no inner scrollbar, nothing to drag. */
const grow = t => { if (!t || (window.CSS && CSS.supports && CSS.supports('field-sizing', 'content'))) return; t.style.height = 'auto'; t.style.height = (t.scrollHeight + 2) + 'px'; };

/* ---------- a small in-app modal (text or link) ---------- */
function ask(title, label, { placeholder = '', value = '', ok = 'Add', multi = false, hint = '' } = {}) {
  return new Promise(res => {
    const w = document.createElement('div'); w.className = 'pd-scrim';
    w.innerHTML = `<div class="pd-modal" role="dialog" aria-modal="true" aria-label="${esc(title)}"><h3>${esc(title)}</h3>${hint ? `<p>${esc(hint)}</p>` : ''}
      <label>${esc(label)}${multi ? `<textarea data-v placeholder="${esc(placeholder)}">${esc(value)}</textarea>` : `<input data-v value="${esc(value)}" placeholder="${esc(placeholder)}">`}</label>
      <div class="ft"><button class="pd-btn" data-x>Cancel</button><button class="pd-btn pri" data-ok>${esc(ok)}</button></div></div>`;
    document.body.appendChild(w);
    const done = v => { w.remove(); document.removeEventListener('keydown', key); res(v); };
    const key = e => { if (e.key === 'Escape') done(null); if (e.key === 'Enter' && !multi) done($('[data-v]', w).value.trim()); };
    document.addEventListener('keydown', key);
    $('[data-x]', w).onclick = () => done(null);
    $('[data-ok]', w).onclick = () => done($('[data-v]', w).value.trim());
    w.addEventListener('mousedown', e => { if (e.target === w) done(null); });
    $('[data-v]', w).focus();
  });
}

/** Upload one file to the card (a version or inspiration). Raw body, like Studio and the creator link. */
async function upload(H, id, file, kind) {
  if (file.size > 95 * 1024 * 1024) throw new Error('That file is over 95MB. Export a smaller one.');
  const res = await fetch(`${H.AH_URL}/api/production/upload?id=${encodeURIComponent(id)}&kind=${kind}&name=${encodeURIComponent(file.name || kind)}`, { method: 'POST', headers: { Authorization: 'Bearer ' + H.S.tok, 'Content-Type': file.type || 'application/octet-stream' }, body: file });
  const j = await res.json().catch(() => ({}));
  if (!res.ok || j.error) throw new Error(j.error || `Upload failed (${res.status}).`);
  return j;
}
const pickFiles = (accept, multi = false) => new Promise(res => { const i = document.createElement('input'); i.type = 'file'; i.accept = accept; i.multiple = multi; i.onchange = () => res([...i.files]); i.click(); });

/* ================================================================================================================ */
/*  THE SHEET                                                                                                        */
/* ================================================================================================================ */
async function open(H, id, opts = {}) {
  css();
  await photos(H);
  const P = window.V2UI && window.V2UI.panel;
  if (!P) { toast('This page did not load. Hard-refresh (Ctrl+Shift+R).'); return; }
  P.wide = true;
  const pb = P('Loading the card...', '<p class="ps-hint" style="padding:12px 0">Loading the card...</p>');
  const host = pb && pb.closest ? pb : $('#v2panel .pb');
  const T = { id, tab: opts.tab || 'brief', data: null, B: null, dirty: false, saving: false, savedAt: null, err: '', client: isClient(H) };
  const reload = async () => { T.data = await api(H, `/api/production/card?id=${encodeURIComponent(id)}`); if (!T.dirty) T.B = JSON.parse(JSON.stringify(T.data.brief || {})); };
  try { await reload(); } catch (e) { host.innerHTML = `<p class="ps-err">${esc(e.message || 'Could not open the card.')}</p>`; return; }
  const changed = () => { if (opts.onChange) opts.onChange(); };
  const c = () => T.data.card;
  const fileUrl = fid => (T.data.files.find(f => f.id === fid) || {}).url || '';
  const versions = () => T.data.files.filter(f => f.kind === 'version');

  /* ---------- save (debounced; Save does it now) ---------- */
  let timer = null;
  const touch = () => { T.dirty = true; clearTimeout(timer); timer = setTimeout(save, 2500); paintSaved(); };
  async function save() {
    clearTimeout(timer);
    if (T.client || T.saving || !T.dirty) return;
    T.saving = true; paintSaved();
    const head = { title: ($('.ps-title', host) || {}).value, owner: ($('[data-meta="owner"]', host) || {}).value, due: ($('[data-meta="due"]', host) || {}).value, launch_on: ($('[data-meta="launch"]', host) || {}).value };
    try {
      const r = await post(H, '/api/production/save', { id, ...head, brief: T.B });
      if (r.error) throw new Error(r.error);
      T.dirty = false; T.savedAt = Date.now(); T.err = '';
      if (r.asana && !r.asana.written && r.asana.why && !/mirror is off|no Asana task/.test(r.asana.why)) T.err = `Saved in Locus. Asana did not take it: ${r.asana.why}`;
      Object.assign(T.data.card, { title: head.title || c().title, owner: head.owner, due: head.due, launch_on: head.launch_on });
      changed();
    } catch (e) { T.err = e.message || 'Could not save. Try again.'; }
    T.saving = false; paintSaved();
  }
  function paintSaved() {
    const el = $('[data-saved]', host); if (!el) return;
    el.textContent = T.saving ? 'Saving...' : T.err ? T.err : T.dirty ? 'Not saved yet' : T.savedAt ? 'Saved' : '';
    el.style.color = T.err ? 'var(--bad)' : '';
  }

  /* ---------- header ---------- */
  function headHtml() {
    const k = c();
    const fmt = T.B.format || 'Static';
    const team = T.data.team || [];
    const appr = k.needs_client ? `Waiting on the client${k.client_due ? `, by ${short(k.client_due)}` : ''}` : k.approved_by ? `Approved by ${k.approved_by}${k.approved_at ? `, ${short(k.approved_at)}` : ''}` : 'Not sent';
    const metaRo = `<div class="ps-kv"><span>Stage</span><b>${esc(STAGE[k.board] || k.board)}</b></div>
      <div class="ps-kv"><span>Owner</span><b style="display:flex;gap:6px;align-items:center">${av(k.owner)}${esc(k.owner || 'Nobody yet')}</b></div>
      <div class="ps-kv"><span>Due</span><b>${esc(short(k.due) || 'No date')}</b></div>
      <div class="ps-kv"><span>Launch</span><b>${esc(short(k.launch_on) || 'Not set')}</b></div>`;
    const metaRw = `<div class="ps-kv"><span>Stage</span><b>${esc(STAGE[k.board] || k.board)}</b></div>
      <label class="ps-kv"><span>Owner</span><select data-meta="owner"><option value="">Nobody yet</option>${[...new Set([...team, k.owner].filter(Boolean))].map(n => `<option${n === k.owner ? ' selected' : ''}>${esc(n)}</option>`).join('')}</select></label>
      <label class="ps-kv"><span>Due</span><input type="date" data-meta="due" value="${esc(k.due || '')}"></label>
      <label class="ps-kv"><span>Launch</span><input type="date" data-meta="launch" value="${esc(k.launch_on || '')}"></label>`;
    const tabs = [['brief', 'Brief'], ['files', `Files ${versions().length}`], ['comments', `Comments ${T.data.comments.filter(x => x.kind !== 'system').length}`]];
    return `<div class="ps-h">
      <div class="ps-top"><span class="ps-tag" style="--tc:${FMT[fmt] || 'var(--brand)'}">${esc(fmt)}</span><span class="sp"></span>
        ${T.client ? '' : `<span class="saved" data-saved aria-live="polite"></span><button class="ps-btn pri" data-save>Save</button>`}
        ${k.asana_url ? `<a class="ps-btn" href="${esc(k.asana_url)}" target="_blank" rel="noopener" style="display:inline-flex;align-items:center;text-decoration:none">Asana</a>` : ''}</div>
      ${T.client ? `<div style="font-size:18px;font-weight:700">${esc(k.title || 'Untitled brief')}</div>` : `<input class="ps-title" aria-label="Title" value="${esc(k.title || '')}" placeholder="Name this brief">`}
      <div class="ps-meta">${T.client ? metaRo : metaRw}<div class="ps-kv"><span>Client approval</span><b>${esc(appr)}</b></div></div>
      <div class="ps-tabs" role="tablist">${tabs.map(([key, l]) => `<button class="ps-tab${T.tab === key ? ' on' : ''}" role="tab" aria-selected="${T.tab === key}" data-tab="${key}">${esc(l)}</button>`).join('')}</div></div>`;
  }

  /* ---------- the brief ---------- */
  const isAi = k => (T.B.ai || []).includes(k);
  const fld = (k, label, rows = 2, ph = '') => `<label class="ps-f"><span class="ps-lab">${esc(label)}${isAi(k) ? ' <span class="ps-ai">· filled by AI, edit freely</span>' : ''}</span>${rows === 1
    ? `<input class="ps-in${isAi(k) ? ' ai' : ''}" data-f="${k}" value="${esc(T.B[k] || '')}" placeholder="${esc(ph)}">`
    : `<textarea rows="${rows}" class="${isAi(k) ? 'ai' : ''}" data-f="${k}" placeholder="${esc(ph)}">${esc(T.B[k] || '')}</textarea>`}</label>`;
  const inspHtml = (list, where) => `<div class="ps-insp">${(list || []).map((x, i) => {
    const url = x.type === 'file' ? fileUrl(x.id) : x.url;
    const img = x.type === 'file' ? (/^image\//.test(x.mime || '') && url ? `<img src="${esc(url)}" alt="">` : esc((x.mime || '').startsWith('video') ? 'video' : 'file')) : (x.thumb ? `<img src="${esc(x.thumb)}" alt="" referrerpolicy="no-referrer">` : 'link');
    return `<a class="ps-ic" href="${esc(url || '#')}" target="_blank" rel="noopener" title="${esc(x.name || x.url || '')}">${img}${T.client ? '' : `<button class="rm" data-insp-rm="${where}:${i}" aria-label="Remove">×</button>`}</a>`;
  }).join('')}${T.client ? '' : `<button class="ps-add" data-insp-add="${where}">+ Add</button>`}</div>`;

  function briefHtml() {
    const B = T.B;
    if (T.client) return briefRo();
    const seg = (list, cur, attr) => `<div class="ps-seg" role="group">${list.map(([v, l]) => `<button type="button" class="${cur === v ? 'on' : ''}" data-${attr}="${esc(v)}" aria-pressed="${cur === v}">${esc(l)}</button>`).join('')}</div>`;
    let body = '';
    if (B.kind === 'new') {
      body += `<div class="ps-bar"><span>AI fills only empty fields from the ${esc(c().brand)} brain. It never touches what someone typed.</span><button class="ps-btn" data-ai>Write it with AI</button></div>
        <div class="ps-2">${fld('angle', 'Angle', 2, 'The argument this ad makes')}${fld('why', 'Why (the data or insight)', 2, 'What makes us think it will work')}</div>
        ${fld('concept', 'Concept', 2, 'What the ad shows')}
        ${fld('testing', "What we're testing (one thing: if we..., then...)", 1, 'If we ..., then ...')}`;
    }
    if (B.kind === 'iter') {
      const it = B.iter || {};
      body += `<div class="ps-card"><div style="flex:1;display:flex;flex-direction:column;gap:6px"><span class="ps-lab">Iterating on test number</span><input class="ps-in" data-iter="of" value="${esc(it.of || '')}" placeholder="43" style="max-width:120px"></div></div>
        <div class="ps-f"><span class="ps-lab">The one thing that changes</span><div class="ps-chips">${CHANGES.map(x => `<button type="button" class="ps-chip${it.change === x ? ' on' : ''}" data-change="${x}">${x}</button>`).join('')}</div></div>
        <label class="ps-f"><span class="ps-lab">${esc(it.change ? `New ${it.change.toLowerCase()}` : 'What it becomes')}</span><textarea rows="2" data-iter="value">${esc(it.value || '')}</textarea></label>
        <span class="ps-hint">Everything else comes from #${esc(it.of || '?')}: angle, lines, visuals, post copy.</span>`;
    }
    if (B.kind === 'resize') {
      const rz = B.resize || {};
      body += `<div class="ps-card"><div style="flex:1;display:flex;flex-direction:column;gap:6px"><span class="ps-lab">Source ad (test number)</span><input class="ps-in" data-rz="of" value="${esc(rz.of || '')}" placeholder="44" style="max-width:120px"></div></div>
        <label class="ps-f"><span class="ps-lab">Note</span><textarea rows="2" data-rz="note" placeholder="Keep the logo out of the bottom 20% for Reels.">${esc(rz.note || '')}</textarea></label>`;
    }
    if (B.kind === 'free') body += fld('free', "What's needed", 6, 'Say what to make, in your own words.');
    if (B.kind === 'new') {
      const R = ROWS[B.format] || ROWS.Static;
      body += `<h3 class="ps-sec">${B.format === 'Static' ? 'The static' : esc(R.title)}</h3>`;
      if (B.format === 'Static') body += `<div class="ps-st3">${fld('headline', 'Headline', 1)}${fld('subhead', 'Subhead', 1)}${fld('cta', 'CTA', 1, 'Shop now')}</div>${fld('layout', 'Layout and visual', 2, 'Where things sit, what the picture is')}`;
      if (B.format === 'Video') body += `<div class="ps-3">${[0, 1, 2].map(i => `<label class="ps-f"><span class="ps-lab">Hook ${'ABC'[i]}${isAi('hooks') ? ' <span class="ps-ai">· AI</span>' : ''}</span><input class="ps-in" data-hook="${i}" value="${esc((B.hooks || [])[i] || '')}" placeholder="${i === 2 ? 'optional' : ''}"></label>`).join('')}</div>`;
      const rows = B.rows || [];
      const showTable = B.format !== 'Static' || rows.length;
      if (showTable) {
        body += `${B.format === 'Static' ? `<span class="ps-lab">${esc(R.title)}</span>` : ''}<div class="ps-tbl"><div class="hd" style="grid-template-columns:${R.tpl}"><span>#</span>${R.cols.map(x => `<span>${esc(x[1])}</span>`).join('')}<span>Inspiration</span><span></span></div>
          ${rows.map((r, i) => `<div class="rw" style="grid-template-columns:${R.tpl}"><span class="n">${i + 1}</span>${R.cols.map(([k, l, ph]) => `<textarea rows="1" class="ps-in" aria-label="${esc(l)} ${i + 1}" data-row="${i}" data-k="${k}" placeholder="${esc(ph)}">${esc(r[k] || '')}</textarea>`).join('')}${inspHtml(r.insp, 'r' + i)}<button class="ps-x" data-row-rm="${i}" aria-label="Remove line ${i + 1}">×</button></div>`).join('')}</div>`;
      }
      body += `<div><button class="ps-btn g" data-row-add>${esc(R.add)}</button>${isAi('rows') ? ' <span class="ps-hint">Lines filled by AI, edit freely.</span>' : ''}</div>`;
      if (B.format === 'Video') body += `<div class="ps-2">${fld('length', 'Length', 1, '15s')}${fld('music', 'Music or sound', 1, 'VO only')}</div>`;
      if (B.format === 'UGC') body += `<div class="ps-3">${fld('creator', 'Creator', 3, 'Who should film it')}${fld('dos', 'Do', 3)}${fld('donts', "Don't", 3)}</div>`;
      if (B.format === 'Carousel') body += fld('endcta', 'End card CTA', 1, 'Shop the winter glove');
    }
    body += `<div class="ps-2"><div class="ps-f"><span class="ps-lab">Sizes</span><div class="ps-chips">${SIZES.map(sz => `<button type="button" class="ps-chip${(B.sizes || []).includes(sz) ? ' on' : ''}" data-size="${esc(sz)}">${esc(sz)}</button>`).join('')}</div></div>
        <div class="ps-f"><span class="ps-lab">Inspiration for the whole brief</span>${inspHtml(B.insp, 'b')}</div></div>
      <span class="ps-hint" style="margin-top:-8px">Uploads are saved in Locus. A pasted link stays a link.</span>
      ${B.kind !== 'resize' ? fld('copy', 'Post copy', 2, 'Primary text. Empty: AI can fill it.') : ''}
      ${B.notes ? fld('notes', 'Other notes (from the old brief)', 3) : ''}`;
    const k = c();
    const sent = k.needs_client === 'idea';
    const foot = `<div class="ps-foot">${sent ? `<span class="ps-hint">Sent to the client for their OK${k.client_due ? `, by ${short(k.client_due)}` : ''}. They answer on their Production page.</span><button class="ps-btn" data-send="">Take it back</button>`
      : `<button class="ps-btn" data-send="idea">Send the idea to the client</button><span class="ps-hint">Optional: the client approves the idea before it is made, so review notes are about the ad, not the idea.</span>`}</div>`;
    return `<div class="ps-2"><div class="ps-f"><span class="ps-lab">What kind of brief</span>${seg(KINDS, B.kind, 'kind')}</div>
      <div class="ps-f"><span class="ps-lab">Format</span>${seg(FORMATS.map(f => [f, f]), B.format, 'format')}</div></div>${body}${foot}`;
  }
  function briefRo() {
    const B = T.B, out = [];
    const p = (label, v) => { if (v) out.push(`<div class="ps-ro"><span class="ps-lab">${esc(label)}</span><p>${esc(v)}</p></div>`); };
    p('Kind', `${(KINDS.find(x => x[0] === B.kind) || [])[1] || ''} · ${B.format}`);
    p('Angle', B.angle); p('Why', B.why); p('Concept', B.concept); p("What we're testing", B.testing);
    if (B.iter) p('Iterating on', `#${B.iter.of || '?'}${B.iter.change ? `, change the ${B.iter.change.toLowerCase()}` : ''}${B.iter.value ? `: ${B.iter.value}` : ''}`);
    if (B.resize) p('Resize', `${B.resize.of ? `#${B.resize.of}. ` : ''}${B.resize.note || ''}`);
    p("What's needed", B.free);
    (B.hooks || []).forEach((h, i) => p(`Hook ${'ABC'[i]}`, h));
    p('Headline', B.headline); p('Subhead', B.subhead); p('CTA', B.cta); p('Layout', B.layout);
    if (B.rows && B.rows.length) { const R = ROWS[B.format] || ROWS.Static; out.push(`<div class="ps-ro"><span class="ps-lab">${esc(R.title)}</span>${B.rows.map((r, i) => `<p>${i + 1}. ${esc(R.cols.map(([k, l]) => r[k] ? `${l}: ${r[k]}` : '').filter(Boolean).join(' · '))}</p>`).join('')}</div>`); }
    p('Length', B.length); p('Creator', B.creator); p('Do', B.dos); p("Don't", B.donts); p('End card', B.endcta);
    p('Sizes', (B.sizes || []).join(', ')); p('Post copy', B.copy);
    if (B.insp && B.insp.length) out.push(`<div class="ps-ro"><span class="ps-lab">Inspiration</span>${inspHtml(B.insp, 'b')}</div>`);
    const k = c();
    const decide = k.needs_client === 'idea' ? `<div class="ps-wait"><span>Mobius would like your OK on this idea before they make it${k.client_due ? `, by ${short(k.client_due)}` : ''}.</span><button class="ps-btn ok" data-decide="yes">Approve the idea</button><button class="ps-btn" data-decide="no">Ask for changes</button></div>` : '';
    return decide + (out.join('') || '<p class="ps-hint">The brief is still being written.</p>');
  }

  /* ---------- files ---------- */
  function filesHtml() {
    const vs = versions().slice().reverse();
    const k = c();
    const sentAd = k.needs_client === 'ad';
    const top = T.client ? '' : `<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center"><button class="ps-btn pri" data-upver>Upload a new version</button>
        ${vs.length ? (sentAd ? '<button class="ps-btn" data-send="">Take it back from the client</button>' : '<button class="ps-btn" data-send="ad">Send the ad to the client</button>') : ''}
        ${vs.length ? '<button class="ps-btn" data-share>Copy client link</button>' : ''}<span class="ps-hint" style="flex:1;min-width:220px">Any image or video. A new upload stacks on top as the next version and the card moves to Review. Old notes stay on their version.</span></div>
        <div data-upmsg class="ps-hint"></div>`;
    const list = vs.map(f => {
      const open = T.data.comments.filter(x => x.file_id === f.id && ['note', 'change_request'].includes(x.kind) && !x.fixed).length;
      const total = T.data.comments.filter(x => x.file_id === f.id && ['note', 'change_request'].includes(x.kind)).length;
      const latest = f === vs[0];
      const st = latest ? (k.board === 'ready' || k.board === 'live' ? ['Approved', 'var(--good)'] : ['Needs review', 'var(--warn)']) : ['Replaced', 'var(--muted)'];
      return `<div class="ps-card"><div class="ps-thumb">${f.video ? 'video' : `<img src="${esc(f.url)}" alt="">`}</div>
        <div style="flex:1;min-width:0;display:flex;flex-direction:column;gap:3px"><b style="font-weight:500">v${f.version} · ${esc(f.name || '')}</b><span class="ps-hint">${esc(T.client ? short(f.created_at) : `${f.by || 'Someone'}, ${short(f.created_at)}`)} · ${total ? `${total} note${total === 1 ? '' : 's'}${open ? `, ${open} open` : ', all fixed'}` : 'no notes'}</span></div>
        <span class="ps-tag" style="--tc:${st[1]}">${st[0]}</span><button class="ps-btn" data-rev="${esc(f.id)}">Review</button></div>`;
    }).join('');
    return top + (list || `<p class="ps-hint">${T.client ? 'No version of this ad yet.' : 'No version yet. Upload the ad here; the card moves to Review.'}</p>`);
  }

  /* ---------- comments ---------- */
  function commentsHtml() {
    const vOf = fid => (T.data.files.find(f => f.id === fid) || {}).version;
    const mmss = s => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
    const rows = T.data.comments.map(x => {
      if (x.kind === 'system') return `<div class="ps-sys">${esc(x.who)}: ${esc(x.body)} ${esc(when(x.created_at))}</div>`;
      const tag = x.kind === 'change_request' ? ['Changes asked', 'var(--bad)'] : x.kind === 'approval' ? ['Approved', 'var(--good)'] : x.file_id ? [`Note on v${vOf(x.file_id) || '?'}${x.at != null ? ` at ${mmss(x.at)}` : ''}`, 'var(--c-tiktok)'] : x.from_asana ? ['From Asana', 'var(--muted)'] : x.role === 'client' ? ['Client', 'var(--c-tiktok)'] : null;
      return `<div class="ps-c">${av(x.who)}<div class="bd"><div class="hd"><b>${esc(x.who)}</b><span>${esc(when(x.created_at))}</span>${tag ? `<span class="ps-tag" style="--tc:${tag[1]}">${esc(tag[0])}</span>` : ''}</div><div class="tx">${esc(x.body)}</div></div></div>`;
    }).join('');
    return `${rows || '<p class="ps-hint">No comments yet.</p>'}
      <label class="ps-f" style="padding-top:6px"><span class="ps-lab">Comment</span><textarea rows="3" data-cbody placeholder="${T.client ? 'Ask Mobius anything about this ad.' : '@William can the glove be on the left side instead?'}"></textarea></label>
      <div style="display:flex;align-items:center;gap:8px"><span class="ps-hint" style="flex:1">${T.client ? 'Mobius sees it right away.' : '@Name sends that person a Slack DM with a link to this card.'}</span><button class="ps-btn pri" data-cpost>Post</button></div>`;
  }

  /* ---------- paint + wire ---------- */
  function paint() {
    const keep = host.scrollTop;
    host.innerHTML = `<div class="ps">${headHtml()}<div class="ps-b">${T.tab === 'brief' ? briefHtml() : T.tab === 'files' ? filesHtml() : commentsHtml()}</div></div>`;
    const hb = $('#v2panel .ph b'); if (hb) hb.textContent = `${c().num ? `#${c().num} · ` : ''}${c().brand}`;
    host.scrollTop = keep;
    wire(); paintSaved();
  }
  function wire() {
    $$('textarea', host).forEach(t => { grow(t); t.addEventListener('input', () => grow(t)); });
    $$('[data-tab]', host).forEach(b => b.onclick = () => { T.tab = b.dataset.tab; paint(); });
    const sv = $('[data-save]', host); if (sv) sv.onclick = () => { T.dirty = true; save(); };
    $$('.ps-title,[data-meta]', host).forEach(i => { i.oninput = touch; i.onchange = touch; });
    /* brief inputs: update the model, no repaint */
    $$('[data-f]', host).forEach(i => i.oninput = () => { T.B[i.dataset.f] = i.value; if (isAi(i.dataset.f)) { T.B.ai = T.B.ai.filter(x => x !== i.dataset.f); i.classList.remove('ai'); } touch(); });
    $$('[data-hook]', host).forEach(i => i.oninput = () => { T.B.hooks = T.B.hooks || ['', '', '']; T.B.hooks[+i.dataset.hook] = i.value; touch(); });
    $$('[data-row]', host).forEach(i => i.oninput = () => { const r = T.B.rows[+i.dataset.row]; if (r) { r[i.dataset.k] = i.value; touch(); } });
    $$('[data-iter]', host).forEach(i => i.oninput = () => { T.B.iter = T.B.iter || {}; T.B.iter[i.dataset.iter] = i.value; touch(); });
    $$('[data-rz]', host).forEach(i => i.oninput = () => { T.B.resize = T.B.resize || {}; T.B.resize[i.dataset.rz] = i.value; touch(); });
    /* structural changes: repaint */
    $$('[data-kind]', host).forEach(b => b.onclick = () => { T.B.kind = b.dataset.kind; touch(); paint(); });
    $$('[data-format]', host).forEach(b => b.onclick = () => { T.B.format = b.dataset.format; touch(); paint(); });
    $$('[data-change]', host).forEach(b => b.onclick = () => { T.B.iter = { ...(T.B.iter || {}), change: b.dataset.change }; touch(); paint(); });
    $$('[data-size]', host).forEach(b => b.onclick = () => { const s = new Set(T.B.sizes || []); s.has(b.dataset.size) ? s.delete(b.dataset.size) : s.add(b.dataset.size); T.B.sizes = SIZES.filter(x => s.has(x)); touch(); paint(); });
    const ra = $('[data-row-add]', host); if (ra) ra.onclick = () => { T.B.rows = [...(T.B.rows || []), {}]; touch(); paint(); const last = $$('[data-row]', host).filter(i => +i.dataset.row === T.B.rows.length - 1)[0]; if (last) last.focus(); };
    $$('[data-row-rm]', host).forEach(b => b.onclick = () => { T.B.rows.splice(+b.dataset.rowRm, 1); touch(); paint(); });
    $$('[data-insp-rm]', host).forEach(b => b.onclick = e => { e.preventDefault(); e.stopPropagation(); const [w, i] = b.dataset.inspRm.split(':'); const list = w === 'b' ? T.B.insp : (T.B.rows[+w.slice(1)] || {}).insp; if (list) { list.splice(+i, 1); touch(); paint(); } });
    $$('[data-insp-add]', host).forEach(b => b.onclick = () => inspMenu(b, b.dataset.inspAdd));
    const ai = $('[data-ai]', host); if (ai) ai.onclick = async () => {
      ai.disabled = true; ai.textContent = 'Writing...';
      try {
        const r = await post(H, '/api/production/ai', { id, title: ($('.ps-title', host) || {}).value, brief: T.B });
        if (r.error) throw new Error(r.error);
        T.B = r.brief; touch(); paint();
        toast(r.filled && r.filled.length ? `Filled ${r.filled.length} field${r.filled.length === 1 ? '' : 's'}. Edit anything; nothing you typed changed.` : 'Every field already has words. Nothing changed.');
      } catch (e) { toast(e.message || 'The AI did not answer. Try again.'); ai.disabled = false; ai.textContent = 'Write it with AI'; }
    };
    $$('[data-send]', host).forEach(b => b.onclick = async () => {
      const what = b.dataset.send;
      if (what && H.confirmModal && !(await H.confirmModal(what === 'idea' ? 'Send the idea to the client?' : 'Send the ad to the client?', what === 'idea' ? 'It shows under "Needs you" on their Production page. They approve the idea or ask for changes.' : 'The newest version shows under "Needs you" on their Production page. They can draw notes on it, approve it or ask for changes.', 'Send it'))) return;
      if (T.dirty) await save();
      b.disabled = true;
      try { const r = await post(H, '/api/production/send', { id, what }); if (r.error) throw new Error(r.error); await reload(); paint(); changed(); toast(what ? 'Sent. It is waiting on the client.' : 'Taken back from the client.'); }
      catch (e) { toast(e.message || 'Could not send it.'); b.disabled = false; }
    });
    const up = $('[data-upver]', host); if (up) up.onclick = async () => {
      const [f] = await pickFiles('image/*,video/*'); if (!f) return;
      const msg = $('[data-upmsg]', host); msg.textContent = `Uploading ${f.name}...`; up.disabled = true;
      try { const r = await upload(H, id, f, 'version'); await reload(); paint(); changed(); toast(`v${r.file.version} is up.${r.moved ? ' The card moved to Review.' : ''}`); }
      catch (e) { msg.textContent = e.message; msg.style.color = 'var(--bad)'; up.disabled = false; }
    };
    const sh = $('[data-share]', host); if (sh) sh.onclick = async () => { try { const r = await post(H, '/api/production/share', { id }); await navigator.clipboard.writeText(r.url).catch(() => {}); toast('Client link copied. It opens with no login.'); } catch (e) { toast(e.message); } };
    $$('[data-rev]', host).forEach(b => b.onclick = () => review(H, id, { version: b.dataset.rev, onChange: async () => { await reload(); paint(); changed(); } }));
    const cp = $('[data-cpost]', host); if (cp) cp.onclick = async () => {
      const t = $('[data-cbody]', host), body = t.value.trim(); if (!body) { t.focus(); return; }
      cp.disabled = true;
      try { const r = await post(H, '/api/production/comment', { id, body }); if (r.error) throw new Error(r.error); await reload(); paint(); changed(); if (r.mentions && r.mentions.length) toast(`Sent to ${r.mentions.filter(m => m.sent).map(m => m.name).join(', ') || 'nobody (Slack did not find them)'} in Slack.`); }
      catch (e) { toast(e.message || 'Could not post.'); cp.disabled = false; }
    };
    $$('[data-decide]', host).forEach(b => b.onclick = async () => {
      const ok = b.dataset.decide === 'yes';
      const body = ok ? '' : await ask('Ask for changes', 'What should change?', { multi: true, ok: 'Send it' });
      if (!ok && !body) return;
      try { const r = await post(H, '/api/production/decide', { id, ok, body }); if (r.error) throw new Error(r.error); await reload(); paint(); changed(); toast(ok ? 'Approved. Mobius can make it.' : 'Sent to Mobius.'); }
      catch (e) { toast(e.message || 'Could not send it.'); }
    });
  }
  async function inspMenu(btn, where) {
    const list = () => where === 'b' ? (T.B.insp = T.B.insp || []) : ((T.B.rows[+where.slice(1)] || {}).insp = (T.B.rows[+where.slice(1)] || {}).insp || []);
    const choice = await new Promise(res => {
      const m = document.createElement('div'); m.className = 'pd-scrim';
      m.innerHTML = `<div class="pd-modal" role="dialog" aria-modal="true" aria-label="Add inspiration"><h3>Add inspiration</h3><p>An image or video you upload is kept in Locus. A pasted link (Meta Ad Library, TikTok, any page) stays a link.</p>
        <div class="ft" style="justify-content:flex-start"><button class="pd-btn pri" data-c="up">Upload a file</button><button class="pd-btn" data-c="link">Paste a link</button><span style="flex:1"></span><button class="pd-btn" data-c="">Cancel</button></div></div>`;
      document.body.appendChild(m);
      $$('[data-c]', m).forEach(b => b.onclick = () => { m.remove(); res(b.dataset.c); });
      m.addEventListener('mousedown', e => { if (e.target === m) { m.remove(); res(''); } });
    });
    if (choice === 'link') {
      const url = await ask('Paste a link', 'Link', { placeholder: 'https://www.facebook.com/ads/library/?id=...' });
      if (!url) return;
      if (!/^https?:\/\/\S+$/.test(url)) { toast('That is not a link. It should start with https://'); return; }
      list().push({ type: 'link', url }); touch(); paint();
    }
    if (choice === 'up') {
      const fs = await pickFiles('image/*,video/*', true);
      for (const f of fs.slice(0, 6)) {
        try { const r = await upload(H, id, f, 'insp'); T.data.files.push({ ...r.file, kind: 'insp' }); list().push({ type: 'file', id: r.file.id, name: r.file.name, mime: r.file.mime }); }
        catch (e) { toast(e.message); }
      }
      touch(); paint();
    }
  }
  paint();
  if (opts.tab === 'review' && versions().length) review(H, id, { onChange: async () => { await reload(); paint(); changed(); } });
}

/* ================================================================================================================ */
/*  REVIEW                                                                                                           */
/* ================================================================================================================ */
async function review(H, id, opts = {}) {
  if (!window.ReviewUI) { toast('This page did not load. Hard-refresh (Ctrl+Shift+R).'); return; }
  await photos(H);
  let data;
  try { data = await api(H, `/api/production/card?id=${encodeURIComponent(id)}`); } catch (e) { toast(e.message || 'Could not open the card.'); return; }
  const client = isClient(H);
  const k = data.card;
  const files = data.files.filter(f => f.kind === 'version');
  const ui = window.ReviewUI.open({
    title: k.title, num: `${k.num ? `#${k.num} · ` : ''}${k.brand}`, format: data.brief.format, formatColor: FMT[data.brief.format],
    files, comments: data.comments, mode: client ? 'client' : 'team',
    canDecide: client ? k.needs_client === 'ad' : true,
    decideHint: client ? 'Approve tells Mobius it is ready to run. Ask for changes needs a note and sends it back.' : `Approve moves it to Ready and records you. Ask for changes needs a note, moves it back to Making${k.owner ? ` and DMs ${k.owner.split(' ')[0]}` : ''}.`,
    api: {
      note: (fid, body, shape, at) => post(H, '/api/production/comment', { id, file_id: fid, body, shape, at }).then(r => { if (r.error) throw new Error(r.error); return r; }),
      decide: (ok, body) => post(H, '/api/production/decide', { id, ok, body }).then(r => { if (r.error) throw new Error(r.error); toast(ok ? (client ? 'Approved. Thank you.' : 'Approved. The card moved to Ready.') : (client ? 'Sent to Mobius.' : 'Sent back to Making.')); return r; }),
      fixed: (cid, on) => post(H, '/api/production/fixed', { comment_id: cid, fixed: on }),
      share: client ? null : () => post(H, '/api/production/share', { id }).then(r => r.url),
      reload: async () => { const d = await api(H, `/api/production/card?id=${encodeURIComponent(id)}`); return { files: d.files.filter(f => f.kind === 'version'), comments: d.comments, canDecide: client ? d.card.needs_client === 'ad' : true }; },
    },
    onClose: () => { if (opts.onChange) opts.onChange(); },
  });
  return ui;
}

/* ================================================================================================================ */
/*  THE CLIENT'S PRODUCTION                                                                                          */
/* ================================================================================================================ */
let CV = 'list';
try { CV = localStorage.getItem('pc_view') || 'list'; } catch {}
async function client(H) {
  css();
  const main = $('#main');
  const act = H.S.act;
  main.innerHTML = `<div class="pc"><div><h1>Production</h1><p class="lead">Loading...</p></div></div>`;
  let D;
  try { D = await api(H, `/api/production?act=${encodeURIComponent(act)}`); } catch (e) { main.innerHTML = `<div class="pc"><div><h1>Production</h1><p class="lead" style="color:var(--bad)">${esc(e.message || 'Could not load it.')}</p></div></div>`; return; }
  const paint = () => {
    const live = D.coming.filter(x => x.stage === 'Live').length, making = D.coming.filter(x => x.stage !== 'Live').length;
    const thisWeek = D.coming.filter(x => x.launch && x.launch >= D.today && x.launch <= addDays(D.today, 7) && x.stage !== 'Live').length;
    const lead = `${D.needs.length ? `${D.needs.length} thing${D.needs.length === 1 ? ' needs' : 's need'} your OK. ` : 'Nothing needs you right now. '}${making} ad${making === 1 ? '' : 's'} in the works${thisWeek ? `, ${thisWeek} going live this week` : ''}.`;
    const stCol = { Idea: 'var(--muted)', Making: 'var(--brand)', Ready: 'var(--good)', Live: 'var(--c-email)' };
    const thumb = x => `<div class="ps-thumb" style="width:48px;height:48px">${x.thumb ? `<img src="${esc(x.thumb)}" alt="">` : ''}</div>`;
    const needs = D.needs.map(x => `<div class="pc-need">${thumb(x)}<div class="bd"><div style="display:flex;gap:8px;align-items:center"><span class="ps-hint" style="font-weight:700">#${esc(x.num)}</span><span class="ps-tag" style="--tc:${x.what === 'idea' ? 'var(--brand)' : 'var(--good)'}">${x.what === 'idea' ? 'Idea' : 'Finished ad'}</span></div>
        <b style="font-weight:600">${esc(x.title)}</b><span class="ps-hint">${x.what === 'idea' ? 'Approve the idea before Mobius makes it' : 'Watch it, leave notes, then approve or ask for changes'}${x.due ? ` · please answer by ${short(x.due)}` : ''}${x.launch ? ` · goes live ${short(x.launch)}` : ''}</span></div>
        <button class="ps-btn" data-open="${esc(x.id)}" data-what="${x.what}">${x.what === 'idea' ? 'Read the idea' : 'Watch and comment'}</button></div>`).join('');
    const list = `<div class="pc-th"><span></span><span>Ad</span><span>Format</span><span>Where it is</span><span>Goes live</span></div>
      ${D.coming.map(x => `<button class="pc-row" data-open="${esc(x.id)}">${thumb(x)}<span style="display:flex;flex-direction:column;gap:2px;min-width:0"><span class="ps-hint" style="font-weight:700">#${esc(x.num)}</span><span style="overflow:hidden;text-overflow:ellipsis">${esc(x.title)}</span></span><span class="ps-hint">${esc(x.format)}</span><span style="font-weight:600;color:${stCol[x.stage]}">${esc(x.stage)}</span><span>${x.stage === 'Live' ? `Live since ${esc(short(x.launch))}` : esc(short(x.launch) || 'Not set yet')}</span></button>`).join('') || '<p class="ps-hint">Nothing in the works yet.</p>'}`;
    main.innerHTML = `<div class="pc">
      <div style="display:flex;align-items:flex-end;gap:16px;flex-wrap:wrap"><div style="flex:1;min-width:220px"><h1>Production</h1><p class="lead">${esc(lead)}</p></div>
        <div class="ps-seg" role="group" aria-label="View"><button class="${CV === 'list' ? 'on' : ''}" data-cv="list">List</button><button class="${CV === 'cal' ? 'on' : ''}" data-cv="cal">Calendar</button></div></div>
      ${D.needs.length ? `<section><h2 style="color:var(--warn)">Needs you · ${D.needs.length}</h2><div style="display:flex;flex-direction:column;gap:10px">${needs}</div></section>` : ''}
      <section><h2>${CV === 'cal' ? 'By launch date' : 'Coming up'}</h2>${CV === 'cal' ? calendar(D) : `<div style="display:flex;flex-direction:column;gap:8px">${list}</div>`}</section>
      <p class="ps-hint" style="margin:0">Your ads, from idea to live. Leave notes on anything; Mobius sees them right away.</p></div>`;
    $$('[data-cv]', main).forEach(b => b.onclick = () => { CV = b.dataset.cv; try { localStorage.setItem('pc_view', CV); } catch {} paint(); });
    $$('[data-open]', main).forEach(b => b.onclick = () => {
      const refresh = async () => { D = await api(H, `/api/production?act=${encodeURIComponent(act)}`).catch(() => D); paint(); };
      if (b.dataset.what === 'ad') review(H, b.dataset.open, { onChange: refresh });
      else open(H, b.dataset.open, { onChange: refresh, tab: 'brief' });
    });
  };
  let MO = null;
  const calendar = () => {
    const base = MO || D.today.slice(0, 7);
    const [y, m] = base.split('-').map(Number);
    const first = new Date(Date.UTC(y, m - 1, 1)), start = new Date(first); start.setUTCDate(1 - ((first.getUTCDay() + 6) % 7));
    const days = [];
    for (let i = 0; i < 42; i++) { const d = new Date(start); d.setUTCDate(start.getUTCDate() + i); days.push(d.toISOString().slice(0, 10)); }
    const items = D.coming.concat(D.needs.map(x => ({ ...x, stage: 'Needs you' })));
    const label = first.toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });
    setTimeout(() => {
      $$('[data-mo]').forEach(b => b.onclick = () => { const d = new Date(Date.UTC(y, m - 1 + (+b.dataset.mo), 1)); MO = d.toISOString().slice(0, 7); paint(); });
    });
    return `<div class="pc-mo"><button class="ps-btn" data-mo="-1" aria-label="Previous month">‹</button><b>${esc(label)}</b><button class="ps-btn" data-mo="1" aria-label="Next month">›</button></div>
      <div class="pc-cal" style="margin-top:10px">${['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(d => `<span class="ps-hint">${d}</span>`).join('')}
      ${days.map(d => `<div class="pc-day${d === D.today ? ' today' : ''}" style="${d.slice(0, 7) !== base ? 'opacity:.45' : ''}"><span class="d">${+d.slice(8)}</span>${items.filter(x => x.launch === d).map(x => `<button data-open="${esc(x.id)}" ${x.what ? `data-what="${x.what}"` : ''} title="${esc(x.title)}">#${esc(x.num)} ${esc(x.title)}</button>`).join('')}</div>`).join('')}</div>`;
  };
  paint();
}
const addDays = (ymd, n) => { const d = new Date(`${ymd}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

/* ================================================================================================================ */
/*  THE ASANA MIRROR CARD (Agency settings > Integrations)                                                           */
/* ================================================================================================================ */
async function mirrorCard(el, H) {
  if (!el) return;
  css();
  el.innerHTML = `<div class="card set-card"><h3>Asana mirror for Production</h3><p class="hint set-why">Reading Asana...</p></div>`;
  let M;
  try { M = await api(H, '/api/production/mirror'); } catch (e) { el.innerHTML = `<div class="card set-card"><h3>Asana mirror for Production</h3><p class="hint" style="color:var(--bad)">${esc(e.message)}</p></div>`; return; }
  const paint = () => {
    el.innerHTML = `<div class="card set-card"><div style="display:flex;align-items:flex-start;gap:16px;flex-wrap:wrap"><div style="flex:1;min-width:240px"><h3>Asana mirror for Production</h3>
        <p class="hint set-why">While it is on, Production and Asana stay in step both ways. Turn it off when the team works only in Locus. Nothing in Asana is archived or deleted by Locus.</p></div>
        <div class="ps-seg" role="group" aria-label="Asana mirror"><button class="${M.on ? 'on' : ''}" data-m="on">On</button><button class="${M.on ? '' : 'on'}" data-m="off">Off</button></div></div>
      <div class="pm-cols"><div class="pm-box"><b>${M.on ? 'What it does now' : 'Stopped (mirror is off)'}</b><ul><li>Moving a card moves the Asana task to the matching section</li><li>Comments copy to the Asana task, Asana comments copy back</li><li>The hourly sync from Asana (cards, briefs, due dates)</li><li>New briefs create an Asana task</li></ul></div>
        <div class="pm-box"><b>Keeps working either way</b><ul><li>The tagger and results read Locus briefs already</li><li>Studio, the Strategist and Launch to Meta</li><li>Every card, brief, comment and file in Locus</li></ul></div></div>
      ${M.total ? `<div class="pm-miss"><span class="n">${M.total}</span><span style="flex:1;min-width:200px">Cards not yet in Locus: open Asana tasks in the creative sections with no Locus card (${M.missing.filter(x => x.n).map(x => `${esc(x.name)} ${x.n}`).join(', ')}).</span><button class="ps-btn" data-see>See them</button></div>
        <div data-list hidden style="margin-top:10px">${M.missing.filter(x => x.n).map(x => `<p class="hint" style="margin:6px 0 2px"><b>${esc(x.name)}</b></p>${x.tasks.map(t => `<div style="font-size:13px">${t.url ? `<a href="${esc(t.url)}" target="_blank" rel="noopener">${esc(t.name)}</a>` : esc(t.name)}</div>`).join('')}`).join('')}</div>`
        : '<p class="hint" style="margin:0">Every open Asana card in the creative sections is in Locus.</p>'}
      ${M.missing.some(x => x.error) ? `<p class="hint" style="color:var(--warn)">Could not read: ${M.missing.filter(x => x.error).map(x => `${esc(x.name)} (${esc(x.error)})`).join(', ')}</p>` : ''}
      ${M.changed_at ? `<p class="hint" style="margin:8px 0 0">Turned ${M.on ? 'on' : 'off'} ${esc(when(M.changed_at))}${M.changed_by ? ` by ${esc(M.changed_by)}` : ''}</p>` : ''}</div>`;
    $$('[data-m]', el).forEach(b => b.onclick = async () => {
      const on = b.dataset.m === 'on'; if (on === M.on) return;
      if (H.confirmModal && !(await H.confirmModal(on ? 'Turn the Asana mirror back on?' : 'Turn the Asana mirror off?', on ? 'Locus starts moving Asana tasks, copying comments and syncing briefs again.' : 'Locus stops writing to Asana and stops the hourly sync. New briefs are made in Locus only. Nothing in Asana is deleted.', on ? 'Turn it on' : 'Turn it off'))) return;
      try { const r = await api(H, '/api/production/mirror', { method: 'PUT', body: { on } }); M.on = r.on; M.changed_at = new Date().toISOString(); paint(); } catch (e) { toast(e.message); }
    });
    const see = $('[data-see]', el); if (see) see.onclick = () => { const l = $('[data-list]', el); l.hidden = !l.hidden; see.textContent = l.hidden ? 'See them' : 'Hide them'; };
  };
  paint();
}

const photoOf = n => (PHOTOS && PHOTOS[String(n || '').split(' ')[0]]) || null;
window.ProdSheet = { grow, open, review, client, mirrorCard, photos, photoOf, av, css };
})();

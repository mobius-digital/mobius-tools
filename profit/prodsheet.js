/* PRODUCTION V2 (2026-10-14; approved mock https://claude.ai/artifact/Tw9a67Zb4qLg5ZgFDApUMj, boards 1, 3 and 4).
 *   ProdSheet.open(H, id, opts)   the card's sheet: Brief / Files / Comments. The brief is ONE WRITTEN PAGE (v9 of the
 *                                 mock, after Cole read the team's real Asana briefs): a toolbar (bold, italic, underline,
 *                                 strike, heading, lists, quote, link, picture, @), grey hints that vanish when typed over,
 *                                 pictures and videos in the flow, starting pages (new test / iteration / resize / blank),
 *                                 "Write it with AI" fills the hints and tints its words; Format and Sizes under the page.
 *                                 Files: a drop zone (several files, no size limit, parts for big ones with a progress
 *                                 bar), versions automatic per ad from the file name (48-3), Compare v1 and v2.
 *   ProdSheet.review(H, id, opts) one ad's versions in the review viewer (review-ui.js): drawing, notes, Approve.
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
const FORMATS = ['Static', 'Video', 'UGC', 'Carousel'];
const SIZES = ['1:1', '4:5', '9:16', '1.91:1', '15s cut', '6s cut'];
const STAGE = { brief: 'Brief', making: 'Making', review: 'Review', ready: 'Ready', live: 'Live', done: 'Done' };
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
.ps-x{width:28px;height:34px;border:0;background:transparent;color:var(--muted);cursor:pointer;font-size:16px;border-radius:6px}
.ps-x:hover{color:var(--bad);background:var(--surface-2)}
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
/* the page */
.ps-start{display:flex;gap:6px;flex-wrap:wrap;align-items:center;font-size:12.5px;color:var(--muted)}
.ps-tb{display:flex;gap:2px;flex-wrap:wrap;align-items:center;border:1px solid var(--line);border-bottom:0;border-radius:8px 8px 0 0;padding:6px;background:var(--surface-2)}
.ps-tb button[data-tool]{height:28px;min-width:28px;padding:0 8px;border:0;border-radius:6px;background:transparent;color:var(--ink-2);font:inherit;font-size:12.5px;font-weight:600;cursor:pointer}
.ps-tb button[data-tool]:hover{background:var(--surface);color:var(--ink)}
.ps-tb .sep{width:1px;height:18px;background:var(--line);margin:0 4px}
.ps-doc{border:1px solid var(--line);border-radius:0 0 8px 8px;padding:16px 18px;min-height:320px;background:var(--surface);color:var(--ink);line-height:1.55;font-size:14px;outline:none;overflow-wrap:anywhere}
.ps-doc:focus{border-color:var(--line-strong)}
.ps-doc.over{border-color:var(--brand);background:var(--brand-tint)}
.ps-doc.ro{border-radius:8px;min-height:0}
.ps-doc h1{font-size:20px;margin:14px 0 6px;font-weight:700}.ps-doc h2{font-size:16px;margin:18px 0 6px;font-weight:700}.ps-doc h3{font-size:14px;margin:12px 0 4px;font-weight:700}
.ps-doc>h1:first-child,.ps-doc>h2:first-child{margin-top:0}
.ps-doc p{margin:0 0 6px}.ps-doc ol,.ps-doc ul{margin:0 0 8px;padding-left:24px}.ps-doc li{margin:2px 0}
.ps-doc blockquote{margin:6px 0;padding:4px 12px;border-left:3px solid var(--line-strong);color:var(--ink-2)}
.ps-doc pre,.ps-doc code{font-family:ui-monospace,Menlo,Consolas,monospace;font-size:12.5px;background:var(--surface-2);border-radius:4px;padding:1px 4px;white-space:pre-wrap}
.ps-doc a{color:var(--brand)}
.ps-doc img{max-width:min(100%,420px);max-height:360px;border-radius:8px;display:block;margin:8px 0;border:1px solid var(--line)}
.ps-doc video{max-width:min(100%,480px);border-radius:8px;display:block;margin:8px 0;background:var(--ink)}
.ps-doc [data-ph]{color:var(--muted);font-style:italic}
.ps-doc [data-ai]{background:var(--brand-tint);border-radius:3px;box-shadow:0 0 0 2px var(--brand-tint)}
.ps-doc hr{border:0;border-top:1px solid var(--line);margin:12px 0}
/* files */
.ps-drop{border:1.5px dashed var(--line-strong);border-radius:10px;padding:22px 16px;text-align:center;display:flex;flex-direction:column;gap:6px;align-items:center;background:var(--surface-2);cursor:pointer}
.ps-drop:hover,.ps-drop:focus{border-color:var(--ink-2);outline:none}
.ps-drop.over{border-color:var(--brand);background:var(--brand-tint)}
.ps-drop b{font-size:14px;color:var(--ink)}
.ps-prog{height:6px;border-radius:3px;background:var(--line);overflow:hidden;width:100%}
.ps-prog i{display:block;height:100%;background:var(--brand);width:0;transition:width .2s}
.ps-grp{display:flex;flex-direction:column;gap:8px}
.ps-grp .gh{display:flex;align-items:center;gap:10px;font-size:13px;font-weight:700;color:var(--ink)}
@media (max-width:760px){.ps-meta{grid-template-columns:repeat(2,minmax(0,1fr))}.ps-2,.ps-3,.ps-st3{grid-template-columns:minmax(0,1fr)}}
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

/** Upload one file to the card: a version, inspiration or a picture for the page. Under 20MB it is one request;
 *  above that it goes up in parts (R2 multipart, three parts at a time, every part retried), so there is no size limit
 *  and a bad second does not restart the file. onProgress(0..1). */
const ONE_SHOT = 20 * 1024 * 1024;
const fmtMB = n => n >= 1024 * 1024 * 1024 ? `${(n / 1024 / 1024 / 1024).toFixed(2)} GB` : n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(n < 10 * 1024 * 1024 ? 1 : 0)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`;
const xhrJson = (method, url, body, { type, tok, onProgress } = {}) => new Promise((res, rej) => {
  const x = new XMLHttpRequest();
  x.open(method, url);
  x.setRequestHeader('Authorization', 'Bearer ' + tok);
  if (type) x.setRequestHeader('Content-Type', type);
  if (onProgress) x.upload.onprogress = e => { if (e.lengthComputable) onProgress(e.loaded, e.total); };
  x.onload = () => { let j = {}; try { j = JSON.parse(x.responseText || '{}'); } catch {} if (x.status >= 200 && x.status < 300 && !j.error) res(j); else rej(new Error(j.error || `Upload failed (${x.status}).`)); };
  x.onerror = () => rej(new Error('The connection dropped. Try again.'));
  x.send(body);
});
async function upload(H, id, file, kind, onProgress = () => {}) {
  const tok = H.S.tok;
  const type = file.type || ({ mov: 'video/quicktime', mp4: 'video/mp4', webm: 'video/webm', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', avif: 'image/avif' }[(file.name || '').split('.').pop().toLowerCase()] || 'application/octet-stream');
  const q = `id=${encodeURIComponent(id)}&kind=${kind}&name=${encodeURIComponent(file.name || kind)}`;
  if (file.size <= ONE_SHOT) return xhrJson('POST', `${H.AH_URL}/api/production/upload?${q}`, file, { type, tok, onProgress: (l, t) => onProgress(l / Math.max(1, t)) });
  const st = await xhrJson('POST', `${H.AH_URL}/api/production/upload/start?${q}&type=${encodeURIComponent(type)}&size=${file.size}`, null, { tok });
  const PART = st.part || 24 * 1024 * 1024, total = Math.ceil(file.size / PART);
  const sent = new Array(total).fill(0), parts = [];
  const tick = () => onProgress(Math.min(0.999, sent.reduce((a, b) => a + b, 0) / file.size));
  let next = 1;
  const worker = async () => {
    while (next <= total) {
      const n = next++;
      const chunk = file.slice((n - 1) * PART, Math.min(file.size, n * PART));
      for (let tries = 0; ; tries++) {
        try { const r = await xhrJson('PUT', `${H.AH_URL}/api/production/upload/part?id=${encodeURIComponent(id)}&key=${encodeURIComponent(st.key)}&uploadId=${encodeURIComponent(st.uploadId)}&n=${n}`, chunk, { type: 'application/octet-stream', tok, onProgress: l => { sent[n - 1] = l; tick(); } }); parts.push({ partNumber: r.partNumber, etag: r.etag }); sent[n - 1] = chunk.size; tick(); break; }
        catch (e) { if (tries >= 4) throw e; await new Promise(r => setTimeout(r, 1500 * (tries + 1))); }
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(3, total) }, worker));
  onProgress(1);
  const res = await fetch(`${H.AH_URL}/api/production/upload/finish`, { method: 'POST', headers: { Authorization: 'Bearer ' + tok, 'Content-Type': 'application/json' }, body: JSON.stringify({ id, key: st.key, uploadId: st.uploadId, parts, name: file.name, type, size: file.size, kind }) });
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
  const T = { id, tab: opts.tab || 'brief', data: null, B: null, dirty: false, saving: false, savedAt: null, err: '', client: isClient(H), fresh: null };
  const reload = async () => {
    T.data = await api(H, `/api/production/card?id=${encodeURIComponent(id)}`);
    if (!T.dirty) {
      T.B = JSON.parse(JSON.stringify(T.data.brief || { v: 2, html: '', format: 'Static', sizes: [] }));
      /* a page with no words yet opens on the "new test" starting page; nothing is saved until someone types */
      if (!T.client && T.data.brief && T.data.brief.blank && T.data.templates) { T.B.html = T.data.templates.new; T.fresh = 'new'; }
    }
  };
  try { await reload(); } catch (e) { host.innerHTML = `<p class="ps-err">${esc(e.message || 'Could not open the card.')}</p>`; return; }
  const changed = () => { if (opts.onChange) opts.onChange(); };
  const c = () => T.data.card;
  const fileUrl = fid => (T.data.files.find(f => f.id === fid) || {}).url || '';
  const versions = () => T.data.files.filter(f => f.kind === 'version');
  const paintProg = () => { UP.forEach((u, i) => { const bar = $$('.ps-prog i', host)[i]; if (bar) bar.style.width = `${Math.round(u.pct * 100)}%`; const t = $$('.ps-thumb', host)[i]; if (t && !u.err) t.textContent = `${Math.round(u.pct * 100)}%`; }); };

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

  /* ---------- the brief: one written page ---------- */
  const STARTS = [['new', 'New test'], ['iter', 'Iteration'], ['resize', 'Resize or cut'], ['blank', 'Blank page']];
  const TOOLS = [['bold', 'B', 'Bold (Ctrl+B)'], ['italic', 'I', 'Italic (Ctrl+I)'], ['underline', 'U', 'Underline (Ctrl+U)'], ['strike', 'S', 'Strike through'], null,
    ['h2', 'Heading', 'Heading'], ['ul', '• List', 'Bullet list'], ['ol', '1. List', 'Numbered list'], ['quote', 'Quote', 'Quote block'], null,
    ['link', 'Link', 'Add a link'], ['pic', 'Picture', 'Put a picture or video in the page'], ['at', '@', 'Mention someone']];
  const noHints = html => String(html || '').replace(/<span data-ph>[\s\S]*?<\/span>/g, '');
  function briefHtml() {
    const B = T.B;
    if (T.client) return briefRo();
    const seg = (list, cur, attr) => `<div class="ps-seg" role="group">${list.map(([v, l]) => `<button type="button" class="${cur === v ? 'on' : ''}" data-${attr}="${esc(v)}" aria-pressed="${cur === v}">${esc(l)}</button>`).join('')}</div>`;
    const start = T.data.templates ? `<div class="ps-start"><span>${T.fresh ? 'Starting page:' : 'Start again from:'}</span>${STARTS.map(([k, l]) => `<button type="button" class="ps-chip${T.fresh === k ? ' on' : ''}" data-start="${k}">${esc(l)}</button>`).join('')}<span style="flex:1"></span><span>Grey words are hints: they vanish when you type over them.</span></div>` : '';
    const tb = `<div class="ps-tb" role="toolbar" aria-label="Formatting">${TOOLS.map(t => t ? `<button type="button" data-tool="${t[0]}" title="${esc(t[2])}" aria-label="${esc(t[2])}"${t[0] === 'bold' ? ' style="font-weight:800"' : t[0] === 'italic' ? ' style="font-style:italic"' : t[0] === 'underline' ? ' style="text-decoration:underline"' : t[0] === 'strike' ? ' style="text-decoration:line-through"' : ''}>${esc(t[1])}</button>` : '<span class="sep"></span>').join('')}
      <span style="flex:1"></span><button type="button" class="ps-btn" data-ai style="height:28px">Write it with AI</button></div>`;
    const doc = `<div class="ps-doc" contenteditable="true" data-doc spellcheck="true" aria-label="The brief">${B.html || '<p><br></p>'}</div>`;
    const k = c();
    const sent = k.needs_client === 'idea';
    const foot = `<div class="ps-foot">${sent ? `<span class="ps-hint">Sent to the client for their OK${k.client_due ? `, by ${short(k.client_due)}` : ''}. They answer on their Production page.</span><button class="ps-btn" data-send="">Take it back</button>`
      : `<button class="ps-btn" data-send="idea">Send the idea to the client</button><span class="ps-hint">Optional: the client approves the idea before it is made, so review notes are about the ad, not the idea.</span>`}</div>`;
    return `${start}<div>${tb}${doc}</div>
      <div class="ps-2"><div class="ps-f"><span class="ps-lab">Format</span>${seg(FORMATS.map(f => [f, f]), B.format, 'format')}</div>
        <div class="ps-f"><span class="ps-lab">Sizes</span><div class="ps-chips">${SIZES.map(sz => `<button type="button" class="ps-chip${(B.sizes || []).includes(sz) ? ' on' : ''}" data-size="${esc(sz)}">${esc(sz)}</button>`).join('')}</div></div></div>
      <span class="ps-hint" style="margin-top:-8px">Pictures and videos in the page are kept in Locus. A pasted link stays a link. ${T.data.mirror ? 'The same page is written into the Asana task.' : ''}</span>${foot}`;
  }
  function briefRo() {
    const B = T.B, k = c();
    const decide = k.needs_client === 'idea' ? `<div class="ps-wait"><span>Mobius would like your OK on this idea before they make it${k.client_due ? `, by ${short(k.client_due)}` : ''}.</span><button class="ps-btn ok" data-decide="yes">Approve the idea</button><button class="ps-btn" data-decide="no">Ask for changes</button></div>` : '';
    const page = noHints(B.html).replace(/<span data-ai>|<\/span>/g, '');
    const body = page.replace(/<p><br><\/p>/g, '').trim() ? `<div class="ps-doc ro">${page}</div>` : '<p class="ps-hint">The brief is still being written.</p>';
    return `${decide}${body}<p class="ps-hint" style="margin:0">${esc(B.format)}${B.sizes && B.sizes.length ? ` · ${esc(B.sizes.join(', '))}` : ''}</p>`;
  }

  /* ---------- files: drop zone, one group per ad, versions automatic ---------- */
  const UP = [];   // files on their way up: {name, size, pct, err}
  const adLabel = ad => ad ? `Ad ${ad}` : 'The ad';
  function filesHtml() {
    const k = c();
    const vs = versions();
    const sentAd = k.needs_client === 'ad';
    const groups = [...new Set(vs.map(f => f.ad))].map(ad => ({ ad, files: vs.filter(f => f.ad === ad).sort((a, b) => b.version - a.version) }));
    groups.sort((a, b) => Date.parse(b.files[0].created_at.replace(' ', 'T')) - Date.parse(a.files[0].created_at.replace(' ', 'T')));
    const top = T.client ? '' : `<div class="ps-drop" data-drop tabindex="0" role="button" aria-label="Upload the finished ads"><b>Drop the finished ads here</b><span class="ps-hint">or <u>pick files</u> · any image or video · several at once · no size limit</span>
        <span class="ps-hint">Name a file with its ad number (${esc(k.num ? `${k.num}-1, ${k.num}-2` : '48-1, 48-2')}) and it files itself under that ad. A second upload of the same ad becomes its v2, with v1 kept to compare.</span></div>
      ${UP.length ? `<div class="ps-grp">${UP.map(u => `<div class="ps-card"><div class="ps-thumb">${u.err ? '!' : `${Math.round(u.pct * 100)}%`}</div><div style="flex:1;min-width:0;display:flex;flex-direction:column;gap:5px"><b style="font-weight:500">${esc(u.name)}</b>${u.err ? `<span class="ps-err">${esc(u.err)}</span>` : `<div class="ps-prog"><i style="width:${Math.round(u.pct * 100)}%"></i></div><span class="ps-hint">${u.pct >= 1 ? 'Finishing...' : `Uploading, ${fmtMB(u.size * u.pct)} of ${fmtMB(u.size)}`}</span>`}</div></div>`).join('')}</div>` : ''}
      ${vs.length ? `<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">${sentAd ? '<button class="ps-btn" data-send="">Take it back from the client</button>' : '<button class="ps-btn" data-send="ad">Send the ad to the client</button>'}<button class="ps-btn" data-share>Copy client link</button><span class="ps-hint" style="flex:1;min-width:200px">The client link opens the newest version with no login. Notes stay on their version.</span></div>` : ''}`;
    const list = groups.map(g => `<div class="ps-grp"><div class="gh"><span>${esc(adLabel(g.ad))}</span><span class="ps-hint" style="font-weight:500">${g.files.length} version${g.files.length === 1 ? '' : 's'}</span>${g.files.length > 1 ? `<button class="ps-btn g" data-cmp="${esc(g.files[0].id)}">Compare v${g.files[1].version} and v${g.files[0].version}</button>` : ''}</div>
      ${g.files.map((f, i) => {
        const open = T.data.comments.filter(x => x.file_id === f.id && ['note', 'change_request'].includes(x.kind) && !x.fixed).length;
        const total = T.data.comments.filter(x => x.file_id === f.id && ['note', 'change_request'].includes(x.kind)).length;
        const latest = i === 0;
        const st = latest ? (k.board === 'ready' || k.board === 'live' ? ['Approved', 'var(--good)'] : ['Needs review', 'var(--warn)']) : ['Replaced', 'var(--muted)'];
        return `<div class="ps-card"><div class="ps-thumb">${f.video ? 'video' : `<img src="${esc(f.url)}" alt="">`}</div>
          <div style="flex:1;min-width:0;display:flex;flex-direction:column;gap:3px"><b style="font-weight:500">v${f.version} · ${esc(f.name || '')}</b><span class="ps-hint">${esc(T.client ? short(f.created_at) : `${f.by || 'Someone'}, ${short(f.created_at)}`)}${f.size ? ` · ${fmtMB(f.size)}` : ''} · ${total ? `${total} note${total === 1 ? '' : 's'}${open ? `, ${open} open` : ', all fixed'}` : 'no notes'}</span></div>
          <span class="ps-tag" style="--tc:${st[1]}">${st[0]}</span><button class="ps-btn" data-rev="${esc(f.id)}">Review</button></div>`;
      }).join('')}</div>`).join('');
    const who = T.client ? '' : `<p class="ps-hint" style="margin:0">Who uploads: whoever made the ad (designer, editor, creator with a Locus login). A new version moves the card to Review and the reviewer sees it under Files.</p>`;
    return top + (list || `<p class="ps-hint">${T.client ? 'No version of this ad yet.' : 'Nothing uploaded yet.'}</p>`) + who;
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
    /* the page: the model follows every keystroke, no repaint while typing */
    const doc = $('[data-doc]', host);
    if (doc) {
      const sync = () => { T.B.html = doc.innerHTML; if (T.fresh) { T.fresh = null; const l = $('.ps-start span', host); if (l) l.textContent = 'Start again from:'; $$('[data-start].on', host).forEach(b => b.classList.remove('on')); } touch(); };
      const inside = (sel, node) => { let n = sel.anchorNode; while (n && n !== doc) { if (n.nodeType === 1 && n.matches(sel.sel || node)) return n; n = n.parentNode; } return null; };
      /* a grey hint vanishes the moment someone types over it: the typed letters take its place as plain text (never
         inside the bold label before it); the AI tint goes when its words are edited */
      doc.addEventListener('beforeinput', e => {
        const s = window.getSelection(); if (!s || !s.anchorNode || !doc.contains(s.anchorNode)) return;
        let n = s.anchorNode; let ph = null, ai = null;
        while (n && n !== doc) { if (n.nodeType === 1) { if (n.hasAttribute('data-ph')) ph = n; if (n.hasAttribute('data-ai')) ai = n; } n = n.parentNode; }
        if (ph) {
          const typed = e.inputType === 'insertText' && e.data ? e.data : '​';   // a zero-width space keeps the caret out of the bold label; the worker strips it
          const t = document.createTextNode(typed);
          ph.replaceWith(t);
          const r = document.createRange(); r.setStart(t, typed.length); r.collapse(true); s.removeAllRanges(); s.addRange(r);
          if (typed !== '​' || /^delete/.test(e.inputType || '')) { e.preventDefault(); if (typed !== '​') sync(); }
        }
        if (ai) ai.replaceWith(...ai.childNodes);
      });
      doc.addEventListener('input', sync);
      doc.addEventListener('keydown', e => {
        if ((e.ctrlKey || e.metaKey) && !e.shiftKey) { const k = e.key.toLowerCase(); if (k === 'b' || k === 'i' || k === 'u') { e.preventDefault(); document.execCommand({ b: 'bold', i: 'italic', u: 'underline' }[k]); sync(); } if (k === 's') { e.preventDefault(); T.dirty = true; save(); } }
      });
      doc.addEventListener('paste', async e => {
        const items = [...((e.clipboardData && e.clipboardData.items) || [])].filter(x => x.kind === 'file');
        if (items.length) { e.preventDefault(); for (const it of items) { const f = it.getAsFile(); if (f) await putInline(f); } return; }
        const html = e.clipboardData && e.clipboardData.getData('text/html');
        if (html) { e.preventDefault(); document.execCommand('insertHTML', false, html.replace(/<meta[^>]*>|<!--[\s\S]*?-->/g, '').replace(/ style="[^"]*"| class="[^"]*"/g, '')); sync(); }
      });
      doc.addEventListener('dragover', e => { if ([...(e.dataTransfer.types || [])].includes('Files')) { e.preventDefault(); doc.classList.add('over'); } });
      doc.addEventListener('dragleave', () => doc.classList.remove('over'));
      doc.addEventListener('drop', async e => { doc.classList.remove('over'); const fs = [...(e.dataTransfer.files || [])]; if (!fs.length) return; e.preventDefault(); for (const f of fs) await putInline(f); });
      doc.addEventListener('click', e => { const a = e.target.closest('a[href]'); if (a && (e.ctrlKey || e.metaKey)) { window.open(a.href, '_blank', 'noopener'); e.preventDefault(); } });
      let savedRange = null;
      const keepSel = () => { const s = window.getSelection(); if (s && s.rangeCount && doc.contains(s.anchorNode)) savedRange = s.getRangeAt(0).cloneRange(); };
      const backSel = () => { doc.focus(); const s = window.getSelection(); if (savedRange) { s.removeAllRanges(); s.addRange(savedRange); } };
      $$('[data-tool]', host).forEach(b => b.onmousedown = e => e.preventDefault());
      $$('[data-tool]', host).forEach(b => b.onclick = async () => {
        const t = b.dataset.tool;
        keepSel(); backSel();
        if (t === 'bold' || t === 'italic' || t === 'underline') document.execCommand(t);
        else if (t === 'strike') document.execCommand('strikeThrough');
        else if (t === 'h2') { const cur = inside({ sel: 'h2' }); document.execCommand('formatBlock', false, cur ? 'p' : 'h2'); }
        else if (t === 'quote') { const cur = inside({ sel: 'blockquote' }); document.execCommand('formatBlock', false, cur ? 'p' : 'blockquote'); }
        else if (t === 'ul') document.execCommand('insertUnorderedList');
        else if (t === 'ol') document.execCommand('insertOrderedList');
        else if (t === 'at') document.execCommand('insertText', false, '@');
        else if (t === 'link') {
          const sel = window.getSelection(); const picked = sel ? sel.toString() : '';
          const url = await ask('Add a link', 'Link', { placeholder: 'https://www.facebook.com/ads/library/?id=...', value: /^https?:\/\//.test(picked) ? picked : '' });
          if (!url) return;
          if (!/^https?:\/\/\S+$/.test(url)) { toast('That is not a link. It should start with https://'); return; }
          backSel();
          if (picked) document.execCommand('createLink', false, url); else document.execCommand('insertHTML', false, `<a href="${esc(url)}">${esc(url)}</a>&nbsp;`);
        }
        else if (t === 'pic') { const fs = await pickFiles('image/*,video/*', true); backSel(); for (const f of fs) await putInline(f); }
        sync();
      });
      async function putInline(f) {
        if (!/^(image|video)\//.test(f.type || '')) { toast('Only a picture or a video goes in the page. Links go in as links.'); return; }
        const ph = document.createElement('span'); ph.setAttribute('data-ph', ''); ph.textContent = `Uploading ${f.name}...`;
        backSel();
        const s = window.getSelection();
        if (s && s.rangeCount && doc.contains(s.anchorNode)) { const r = s.getRangeAt(0); r.collapse(false); r.insertNode(ph); } else doc.appendChild(ph);
        try {
          const r = await upload(H, id, f, 'inline', pct => { ph.textContent = `Uploading ${f.name} ${Math.round(pct * 100)}%`; });
          T.data.files.push({ ...r.file, kind: 'inline' });
          const el = document.createElement(r.file.video ? 'video' : 'img');
          el.setAttribute('data-file', r.file.id); el.src = r.file.url; if (r.file.video) el.controls = true;
          ph.replaceWith(el);
          const after = document.createElement('p'); after.innerHTML = '<br>'; el.after(after);
          const range = document.createRange(); range.setStart(after, 0); range.collapse(true); const sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(range);
        } catch (e) { ph.remove(); toast(e.message || 'Upload failed.'); }
        sync();
      }
      if (T.fresh) { const first = $('[data-ph]', doc); if (first) { const r = document.createRange(); r.setStartBefore(first); r.collapse(true); const s = window.getSelection(); s.removeAllRanges(); s.addRange(r); } }
    }
    $$('[data-start]', host).forEach(b => b.onclick = async () => {
      const kind = b.dataset.start;
      if (!T.fresh && H.confirmModal && !(await H.confirmModal('Start the page again?', 'What is on the page now is replaced by the starting page. Pictures already uploaded stay on the card.', 'Start again'))) return;
      T.B.html = (T.data.templates || {})[kind] || '<p><br></p>'; T.fresh = kind; if (kind !== 'blank') touch(); paint();
    });
    /* structural changes: repaint */
    $$('[data-format]', host).forEach(b => b.onclick = () => { T.B.format = b.dataset.format; touch(); paint(); });
    $$('[data-size]', host).forEach(b => b.onclick = () => { const s = new Set(T.B.sizes || []); s.has(b.dataset.size) ? s.delete(b.dataset.size) : s.add(b.dataset.size); T.B.sizes = SIZES.filter(x => s.has(x)); touch(); paint(); });
    const ai = $('[data-ai]', host); if (ai) ai.onclick = async () => {
      ai.disabled = true; ai.textContent = 'Writing...';
      try {
        const r = await post(H, '/api/production/ai', { id, title: ($('.ps-title', host) || {}).value, brief: T.B });
        if (r.error) throw new Error(r.error);
        if (!r.filled) { toast(r.why || 'Nothing to fill.'); ai.disabled = false; ai.textContent = 'Write it with AI'; return; }
        T.B = { ...T.B, html: r.brief.html }; T.fresh = null; touch(); paint();
        toast(`Filled ${r.filled} spot${r.filled === 1 ? '' : 's'}. Tinted words are the AI's; edit anything, nothing you typed changed.`);
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
    const drop = $('[data-drop]', host); if (drop) {
      const take = async fs => {
        fs = fs.filter(f => /^(image|video)\//.test(f.type || '') || /\.(mov|mp4|webm|png|jpe?g|gif|webp|avif)$/i.test(f.name || ''));
        if (!fs.length) { toast('Drop an image or a video.'); return; }
        const slots = fs.map(f => { const u = { name: f.name, size: f.size, pct: 0, err: '' }; UP.push(u); return u; });
        paint();
        let moved = false, n = 0;
        await Promise.all(fs.map(async (f, i) => {
          const u = slots[i];
          try { const r = await upload(H, id, f, 'version', pct => { u.pct = pct; paintProg(); }); n++; if (r.moved) moved = true; UP.splice(UP.indexOf(u), 1); }
          catch (e) { u.err = e.message || 'Upload failed.'; }
          await reload(); paint(); changed();
        }));
        if (n) toast(`${n === 1 ? 'The ad is up.' : `${n} files are up.`}${moved ? ' The card moved to Review.' : ''}`);
        setTimeout(() => { for (let i = UP.length - 1; i >= 0; i--) if (UP[i].err) UP.splice(i, 1); paint(); }, 6000);
      };
      drop.onclick = async () => take(await pickFiles('image/*,video/*', true));
      drop.onkeydown = async e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); take(await pickFiles('image/*,video/*', true)); } };
      drop.addEventListener('dragover', e => { e.preventDefault(); drop.classList.add('over'); });
      drop.addEventListener('dragleave', () => drop.classList.remove('over'));
      drop.addEventListener('drop', e => { e.preventDefault(); drop.classList.remove('over'); take([...(e.dataTransfer.files || [])]); });
    }
    const sh = $('[data-share]', host); if (sh) sh.onclick = async () => { try { const r = await post(H, '/api/production/share', { id }); await navigator.clipboard.writeText(r.url).catch(() => {}); toast('Client link copied. It opens with no login.'); } catch (e) { toast(e.message); } };
    $$('[data-rev],[data-cmp]', host).forEach(b => b.onclick = () => review(H, id, { version: b.dataset.rev || b.dataset.cmp, compare: !!b.dataset.cmp, onChange: async () => { await reload(); paint(); changed(); } }));
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
  /* one ad at a time: the file asked for (or the newest) names the ad; every version of that ad goes in */
  const all = data.files.filter(f => f.kind === 'version');
  const pick = (opts.version && all.find(f => f.id === opts.version)) || all.slice().sort((a, b) => Date.parse(b.created_at.replace(' ', 'T')) - Date.parse(a.created_at.replace(' ', 'T')))[0];
  const ad = pick ? pick.ad || '' : '';
  const ofAd = list => list.filter(f => f.kind === 'version' && (f.ad || '') === ad);
  const files = ofAd(all);
  const ui = window.ReviewUI.open({
    title: `${k.title}${ad ? ` · ad ${ad}` : ''}`, num: `${k.num ? `#${k.num} · ` : ''}${k.brand}`, format: data.brief.format, formatColor: FMT[data.brief.format],
    files, comments: data.comments, mode: client ? 'client' : 'team', start: opts.compare ? 'compare' : opts.version || null,
    canDecide: client ? k.needs_client === 'ad' : true,
    decideHint: client ? 'Approve tells Mobius it is ready to run. Ask for changes needs a note and sends it back.' : `Approve moves it to Ready and records you. Ask for changes needs a note, moves it back to Making${k.owner ? ` and DMs ${k.owner.split(' ')[0]}` : ''}.`,
    api: {
      note: (fid, body, shape, at) => post(H, '/api/production/comment', { id, file_id: fid, body, shape, at }).then(r => { if (r.error) throw new Error(r.error); return r; }),
      decide: (ok, body) => post(H, '/api/production/decide', { id, ok, body, file_id: (files.slice().sort((a, b) => a.version - b.version).pop() || {}).id }).then(r => { if (r.error) throw new Error(r.error); toast(ok ? (client ? 'Approved. Thank you.' : 'Approved. The card moved to Ready.') : (client ? 'Sent to Mobius.' : 'Sent back to Making.')); return r; }),
      fixed: (cid, on) => post(H, '/api/production/fixed', { comment_id: cid, fixed: on }),
      share: client ? null : () => post(H, '/api/production/share', { id }).then(r => r.url),
      reload: async () => { const d = await api(H, `/api/production/card?id=${encodeURIComponent(id)}`); return { files: ofAd(d.files), comments: d.comments, canDecide: client ? d.card.needs_client === 'ad' : true }; },
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

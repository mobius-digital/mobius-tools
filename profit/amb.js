/* Locus - the Ambassadors tab (2026-09-16).
 *
 * The staff side of the creator link. Each brand gets one public page,
 * tools.go-mobius-digital.com/angles/<slug>, that its TRYBE creators read
 * instead of a PDF brief. Everything on it is edited here:
 *   Angles        sections, angles, openers, shot plans, proof
 *   Link & brief  the address, where creators submit, the look, the intro,
 *                 "please stop filming these", the season card, the PDF
 *
 * Own file and own closure, like meta.js, so none of its helpers collide with
 * the host page. The host hands in the token, worker URL and selected client.
 *
 * Money stays on THIS side. The public page never receives a dollar figure
 * (profit/worker/src/amb.js enforces it); the scores here are staff-only.
 * Icons are Lucide, the same set as the Lucky Golf creator app.
 */
(function () {
'use strict';

const PUBLIC_BASE = 'https://tools.go-mobius-digital.com/angles/';
const LUCIDE_URL = 'https://cdn.jsdelivr.net/npm/lucide-static@1.46.0/icon-nodes.json';
const LUCIDE_TAGS = 'https://cdn.jsdelivr.net/npm/lucide-static@1.46.0/tags.json';
const JSPDF_URL = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
const QR_URL = 'https://cdnjs.cloudflare.com/ajax/libs/qrcode-generator/1.4.4/qrcode.min.js';
const SWATCHES = ['#C2410C', '#7C3AED', '#DB2777', '#0F766E', '#15803D', '#1D4ED8', '#A16207', '#475569'];
const FORMATS = ['Split screen', 'Get ready with me', 'Day in the life', 'Group reaction', 'Talking to camera', 'Skit', 'Reveal', 'Unboxing', 'Trend', 'Voiceover', 'Street interview', 'Before and after', 'Static'];
const LEVERS = ['Relief', 'Loss', 'Belonging', 'Status / identity', 'Social proof', 'Curiosity', 'Contrarian', 'Proof / demo', 'Urgency', 'Humour'];

const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const money = n => n == null ? ' - ' : new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);
const x2 = n => n == null ? ' - ' : n.toFixed(2) + 'x';

const S = { url: '', tok: '', act: 'all', accounts: [], pick: null, data: null, view: 'angles', edit: null, icons: null, tags: null };
const LS_VIEW = 'amb_view';

async function api(path, opts = {}) {
  const res = await fetch(S.url.replace(/\/+$/, '') + path, {
    ...opts,
    headers: { Authorization: 'Bearer ' + S.tok, ...(opts.body && typeof opts.body === 'string' ? { 'Content-Type': 'application/json' } : {}), ...(opts.headers || {}) },
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(j.error || ('HTTP ' + res.status));
  return j;
}
const post = (p, b, m = 'POST') => api(p, { method: m, body: JSON.stringify({ act: S.act, ...b }) });

/* ---------- Lucide ---------- */
const BASE_ICONS = {
  flame: '<path d="M12 3q1 4 4 6.5t3 5.5a1 1 0 0 1-14 0 5 5 0 0 1 1-3 1 1 0 0 0 5 0c0-2-1.5-3-1.5-5q0-2 2.5-4"/>',
};
async function loadIcons() {
  if (S.icons) return S.icons;
  try {
    const raw = await fetch(LUCIDE_URL).then(r => r.json());
    const out = {};
    for (const [k, nodes] of Object.entries(raw)) out[k] = nodes.map(([t, a]) => `<${t}${Object.entries(a).map(([x, v]) => ` ${x}="${esc(v)}"`).join('')}/>`).join('');
    S.icons = out;
  } catch { S.icons = { ...BASE_ICONS }; }
  return S.icons;
}
async function loadTags() {
  if (S.tags) return S.tags;
  try { S.tags = await fetch(LUCIDE_TAGS).then(r => r.json()); } catch { S.tags = {}; }
  return S.tags;
}
const ic = (n, size = 16, extra = '') => `<svg class="am-i" viewBox="0 0 24 24" style="width:${size}px;height:${size}px;${extra}" aria-hidden="true">${(S.icons || BASE_ICONS)[n] || ''}</svg>`;
const svgWrap = (svg, size = 16) => `<svg class="am-i" viewBox="0 0 24 24" style="width:${size}px;height:${size}px" aria-hidden="true">${svg || ''}</svg>`;

function hexRgb(h) { const m = /^#?([0-9a-f]{6})$/i.exec(h || ''); if (!m) return [71, 85, 105]; const n = parseInt(m[1], 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; }
const mix = (c, w, t) => c.map((v, i) => Math.round(v * (1 - t) + w[i] * t));
const hex = c => '#' + c.map(v => v.toString(16).padStart(2, '0')).join('');
function lum(c) { const a = c.map(v => { v /= 255; return v <= .03928 ? v / 12.92 : Math.pow((v + .055) / 1.055, 2.4); }); return .2126 * a[0] + .7152 * a[1] + .0722 * a[2]; }
function tint(h) { const c = hexRgb(h); let ink = c; for (let i = 0; i < 14 && 1.05 / (lum(ink) + .05) < 5; i++) ink = mix(ink, [0, 0, 0], .08); return { bg: hex(mix(c, [255, 255, 255], .86)), fg: hex(ink) }; }
const badge = (svg, color, size = 32) => { const t = tint(color); return `<span class="am-badge" style="width:${size}px;height:${size}px;background:${t.bg};color:${t.fg}">${svgWrap(svg, Math.round(size * .55))}</span>`; };

/* ---------- styles ---------- */
function injectCss() {
  if (document.getElementById('am-css')) return;
  const st = document.createElement('style');
  st.id = 'am-css';
  st.textContent = `
.am{display:flex;flex-direction:column;gap:14px}
.am .am-i{fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;flex:none;vertical-align:middle}
.am-sub{display:flex;gap:4px;border-bottom:1px solid var(--line);margin-bottom:2px}
.am-sub button{padding:9px 14px;font-size:13.5px;font-weight:600;color:var(--muted);border-bottom:2px solid transparent;margin-bottom:-1px}
.am-sub button.on{color:var(--ink);border-bottom-color:var(--brand-lo)}
.am-badge{display:inline-flex;align-items:center;justify-content:center;border-radius:9px;flex:none}
.am-strip{display:flex;align-items:center;gap:12px;flex-wrap:wrap}
.am-strip .am-link{flex:1;min-width:220px}
.am-link b{font-size:15px;word-break:break-all}
.am-row{display:flex;align-items:center;gap:12px;padding:10px 4px;border-top:1px solid var(--line)}
.am-row:first-child{border-top:none}
.am-row.off{opacity:.55}
.am-row .am-grow{flex:1;min-width:0}
.am-row .am-t{font-size:14px;font-weight:700}
.am-row .am-s{font-size:12.5px;color:var(--muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.am-grip{cursor:grab;color:#9FB0BC;display:inline-flex;padding:4px}
.am-row.drag{opacity:.4}
.am-row.over{box-shadow:inset 0 2px 0 var(--brand-lo)}
.am-grp{display:flex;align-items:center;gap:8px;padding:12px 4px 4px;font-size:12.5px;font-weight:700}
.am-grp span.am-hint{font-weight:500;color:var(--muted)}
.am-chip{display:inline-flex;align-items:center;gap:5px;font-size:11.5px;font-weight:600;padding:3px 9px;border-radius:99px;background:#EDF1F4;color:var(--ink-2);white-space:nowrap;max-width:220px;overflow:hidden;text-overflow:ellipsis}
.am-chip.draft{background:#FFF4DB;color:#8F6412}
.am-chip.new{background:#EEF2FF;color:#3730A3}
.am-score{width:190px;text-align:right;font-size:12.5px;color:var(--muted);flex:none}
.am-score b{color:var(--ink)}
.am-score b.g{color:var(--good)}
.am-sw{display:inline-flex;align-items:center;gap:7px;font-size:12px;font-weight:600;color:var(--muted);cursor:pointer;user-select:none}
.am-sw input{position:absolute;opacity:0;width:1px;height:1px}
.am-sw .am-tr{width:34px;height:20px;border-radius:99px;background:#C4D2DB;position:relative;transition:.15s;flex:none}
.am-sw .am-tr::after{content:"";position:absolute;top:2px;left:2px;width:16px;height:16px;border-radius:50%;background:#fff;transition:.15s}
.am-sw input:checked + .am-tr{background:var(--good)}
.am-sw input:checked + .am-tr::after{left:16px}
.am-sw input:focus-visible + .am-tr{box-shadow:0 0 0 3px var(--brand-soft)}
.am .am-f,.am-modal .am-f{display:block;font-size:12px;font-weight:700;color:var(--ink-2);min-width:0}
.am .am-f small,.am-modal .am-f small{font-weight:500;color:var(--muted);margin-left:4px}
.am .am-f > .am-in,.am .am-f > div,.am .am-f > input,.am-modal .am-f > .am-in,.am-modal .am-f > div{margin-top:5px}
.am a.btn{text-decoration:none;display:inline-flex;align-items:center;gap:6px}
.am .am-in,.am-modal .am-in{display:block;width:100%;border:1px solid var(--line-strong);border-radius:8px;padding:9px 11px;font:inherit;font-size:13.5px;font-weight:500;color:var(--ink);background:var(--surface);max-width:none}
.am .am-in:focus,.am-modal .am-in:focus{outline:none;border-color:var(--brand-ink);box-shadow:0 0 0 3px var(--brand-soft)}
.am textarea.am-in,.am-modal textarea.am-in{min-height:84px;resize:vertical;line-height:1.5}
.am-g2{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}
.am-g3{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}
.am-g4{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px}
.am-split{display:grid;grid-template-columns:minmax(0,1fr) 320px;gap:14px;align-items:start}
.am-swatches{display:flex;gap:6px;align-items:center;flex-wrap:wrap;min-height:38px}
.am-swatch{width:26px;height:26px;border-radius:7px;border:2px solid #fff;box-shadow:0 0 0 1px var(--line-strong)}
.am-swatch.on{box-shadow:0 0 0 2px var(--ink)}
.am-color,.modal input.am-color{width:40px;height:30px;border:1px solid var(--line-strong);border-radius:7px;padding:2px;background:#fff;flex:none}
.am-dark{background:linear-gradient(160deg,#13202B,#0C161D);border-color:#0C161D;color:#EAF2F7}
.am-dark .am-k{font-size:26px;font-weight:700;letter-spacing:-.02em}
.am-dark .am-l{font-size:12px;color:#8195A2}
.am-kv{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px;margin-top:10px}
.am-lbl{font-size:10.5px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:var(--muted)}
.am-dark .am-lbl{color:#8195A2}
.am-well{display:flex;align-items:center;justify-content:center;background:linear-gradient(160deg,#E4EBF0,#D5DFE6);color:#7A8B97;border-radius:7px;overflow:hidden;flex:none}
.am-well img{width:100%;height:100%;object-fit:cover}
.am-src{font-size:10.5px;font-weight:700;padding:3px 7px;border-radius:6px;display:inline-block}
.am-src.meta{background:#1C7A46;color:#fff}.am-src.post{background:#13202B;color:#fff}.am-src.typed{background:#8F6412;color:#fff}.am-src.upload{background:#3A4B58;color:#fff}.am-src.inspo{background:#EDF1F4;color:#3A4B58}
.am-radios{display:grid;gap:8px}
.am-radio{display:flex;align-items:flex-start;gap:10px;padding:10px 12px;border:1px solid var(--line);border-radius:9px;background:var(--surface);cursor:pointer}
.am-radio input{margin-top:3px;accent-color:#13202B}
.am-radio.on{border-color:var(--ink)}
.am-radio b{display:block;font-size:13.5px}
.am-radio span{display:block;font-size:12px;color:var(--muted)}
.am-results{border:1px solid var(--line);border-radius:9px;background:var(--surface);max-height:320px;overflow:auto}
.am-results .am-row{padding:8px 10px}
.am-icongrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(44px,1fr));gap:6px;max-height:220px;overflow:auto;padding:2px}
.am-icongrid button{height:44px;border:1px solid var(--line);border-radius:8px;display:flex;align-items:center;justify-content:center;color:var(--ink-2)}
.am-icongrid button.on{border-color:var(--ink);background:#EDF1F4}
.am-list-edit{display:flex;flex-direction:column;gap:8px}
.am-list-edit .am-li{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1.4fr) auto;gap:8px;align-items:start}
.am-list-edit .am-li.one{grid-template-columns:minmax(0,1fr) auto}
.am-bars{display:flex;align-items:flex-end;gap:3px;height:110px}
.am-bars div{flex:1;border-radius:3px 3px 0 0;background:#CBD5DE;min-height:3px}
.am-bars div.hi{background:var(--brand-lo)}
.am-empty{padding:26px;text-align:center;color:var(--muted)}
.am-save{position:sticky;bottom:0;z-index:5;display:flex;align-items:center;justify-content:flex-end;gap:10px;padding:12px 0;background:linear-gradient(180deg,transparent,var(--bg) 30%)}
.am-msg{font-size:12.5px;color:var(--muted)}
.am-msg.ok{color:var(--good)}.am-msg.bad{color:var(--bad)}
.am-modal{max-width:640px !important}
.am-pdf{border:1px solid var(--line);border-radius:10px;background:#F6F8FA;padding:16px}
.am-pdf .pg{background:#fff;border-radius:4px;box-shadow:0 6px 20px -10px rgba(19,32,43,.35);padding:18px;aspect-ratio:8.5/11;display:flex;flex-direction:column;gap:8px;overflow:hidden}
.am-pdf .ln{height:5px;border-radius:3px;background:#E4EBF0}
@media (max-width:1000px){.am-split{grid-template-columns:1fr}.am-g4{grid-template-columns:repeat(2,minmax(0,1fr))}}
@media (max-width:720px){.am-g2,.am-g3,.am-g4{grid-template-columns:1fr}.am-score{display:none}.am-list-edit .am-li{grid-template-columns:1fr}}
`;
  document.head.appendChild(st);
}

/* ---------- small UI pieces ---------- */
const sw = (id, on, label, extra = '') => `<label class="am-sw" ${extra}><input type="checkbox" id="${id}" ${on ? 'checked' : ''}><span class="am-tr"></span>${label ? `<span>${label}</span>` : ''}</label>`;
function flashMsg(el, text, ok = true) {
  if (!el) return;
  el.textContent = text; el.className = 'am-msg ' + (ok ? 'ok' : 'bad');
  if (ok) setTimeout(() => { if (el.textContent === text) el.textContent = ''; }, 2600);
}
function modal(title, inner, { cta = 'Save', wide = false } = {}) {
  return new Promise(resolve => {
    const w = document.createElement('div');
    w.className = 'modal-wrap';
    w.innerHTML = `<div class="modal am-modal" style="max-width:${wide ? 720 : 560}px" role="dialog" aria-modal="true"><h3>${esc(title)}</h3><div class="am-mbody" style="display:flex;flex-direction:column;gap:12px;margin-top:10px">${inner}</div>
      <p class="am-msg" data-m="msg" style="margin-top:8px"></p>
      <div class="row" style="justify-content:flex-end;gap:8px;margin:10px 0 0"><button class="btn" data-m="no">Cancel</button><button class="btn primary" data-m="yes">${esc(cta)}</button></div></div>`;
    document.body.appendChild(w);
    const done = v => { w.remove(); document.removeEventListener('keydown', k); resolve(v); };
    const k = e => { if (e.key === 'Escape') done(null); };
    document.addEventListener('keydown', k);
    w.addEventListener('mousedown', e => { if (e.target === w) done(null); });
    w.querySelector('[data-m="no"]').onclick = () => done(null);
    const ctl = {
      root: w,
      msg: t => flashMsg(w.querySelector('[data-m="msg"]'), t, false),
      close: () => done(true),
    };
    w.querySelector('[data-m="yes"]').onclick = () => { if (w._submit) w._submit(ctl); else done(true); };
    w._ctl = ctl;
    resolve.ctl = ctl;
    setTimeout(() => w.querySelector('input,textarea')?.focus(), 30);
    modal.last = w;
  });
}

async function refresh() {
  S.data = await api(`/api/amb?act=${encodeURIComponent(S.act)}`);
  return S.data;
}

/* ---------- entry ---------- */
async function render({ tok, url, act, accounts, pick }) {
  Object.assign(S, { tok, url, act, accounts: accounts || [], pick });
  injectCss();
  const main = $('#main');
  if (act === 'all') return renderAll(main);
  main.innerHTML = `<div class="am"><div class="card"><span class="hint">Loading…</span></div></div>`;
  await Promise.all([loadIcons(), refresh()]);
  S.view = localStorage.getItem(LS_VIEW) || 'angles';
  if (S.edit && !S.data.angles.some(a => a.id === S.edit) && S.edit !== 'new') S.edit = null;
  paint();
}

function paint() {
  const main = $('#main');
  const d = S.data;
  const name = d.account.name;
  if (!d.brand) {
    main.innerHTML = `<div class="am">
      <div><h2>Ambassadors</h2><p class="sub">One living brief for ${esc(name)}'s creators, at one clean link. Angles, openers, shot plans and proof, edited here and live the moment you save.</p></div>
      <div class="card" style="padding:22px 24px;display:flex;flex-direction:column;gap:12px;max-width:640px">
        <h3>Set up ${esc(name)}'s creator link</h3>
        <p class="hint">Creates the page with two starter sections, Hot right now and Always works. It stays switched off until you turn it on.</p>
        <label class="am-f">Link address <small>lowercase letters, numbers and dashes</small>
          <div style="display:flex;align-items:center;gap:0"><span class="am-in" style="width:auto;border-radius:8px 0 0 8px;background:#F1F5F8;color:var(--muted);border-right:none;white-space:nowrap">${esc(PUBLIC_BASE.replace('https://', ''))}</span><input class="am-in" id="amSlug" style="border-radius:0 8px 8px 0" value="${esc(name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, ''))}"></div></label>
        <div><button class="btn primary" id="amSetup">Set up the creator link</button> <span class="am-msg" id="amSetupMsg"></span></div>
      </div></div>`;
    $('#amSetup').onclick = async () => {
      try {
        S.data = await post('/api/amb/setup', { slug: $('#amSlug').value, icons: { flame: S.icons.flame, leaf: S.icons.leaf } });
        paint();
      } catch (e) { flashMsg($('#amSetupMsg'), e.message, false); }
    };
    return;
  }
  const tabs = `<nav class="am-sub" aria-label="Ambassadors sections">
    <button data-v="angles" class="${S.view === 'angles' ? 'on' : ''}">Angles</button>
    <button data-v="link" class="${S.view === 'link' ? 'on' : ''}">Link and brief</button></nav>`;
  main.innerHTML = `<div class="am">
    <div><h2>Ambassadors</h2><p class="sub">What ${esc(name)}'s creators are told to film. Everything here shows on their link the moment you save. Sales numbers stay here and never reach the link.</p></div>
    ${tabs}
    ${linkStrip()}
    <div id="amBody"></div></div>`;
  main.querySelectorAll('.am-sub button').forEach(b => b.onclick = () => { S.view = b.dataset.v; S.edit = null; localStorage.setItem(LS_VIEW, S.view); paint(); });
  wireStrip();
  const body = $('#amBody');
  if (S.view === 'link') return paintLink(body);
  if (S.edit) return paintEditor(body);
  return paintAngles(body);
}

function linkStrip() {
  const b = S.data.brand;
  const url = PUBLIC_BASE + b.slug;
  return `<div class="card am-strip" style="padding:14px 18px">
    ${badge(S.icons.link, '#DB2777', 36)}
    <div class="am-link"><p class="am-lbl">Creator link · ${b.live ? '<span style="color:var(--good)">live</span>' : '<span style="color:var(--warn)">off, creators see "being set up"</span>'}</p><b>${esc(url.replace('https://', ''))}</b></div>
    ${sw('amLive', b.live, b.live ? 'Live' : 'Off')}
    <button class="btn" id="amCopy">${ic('copy', 14)} Copy link</button>
    <a class="btn" href="${esc(url)}" target="_blank" rel="noopener">${ic('external-link', 14)} Open as a creator</a>
    <button class="btn primary" id="amPdf">${ic('file-down', 14)} Brief PDF</button>
  </div>`;
}
function wireStrip() {
  const url = PUBLIC_BASE + S.data.brand.slug;
  $('#amCopy').onclick = async e => { try { await navigator.clipboard.writeText(url); e.currentTarget.innerHTML = `${ic('check', 14)} Copied`; } catch { helpModal('Copy this link', `<p><code style="user-select:all">${esc(url)}</code></p>`); } };
  $('#amLive').onchange = async e => {
    const on = e.target.checked;
    if (on && !S.data.angles.some(a => a.status === 'live')) {
      e.target.checked = false;
      return helpModal('Add an angle first', '<p>The link needs at least one live angle before it can be switched on.</p>');
    }
    try { S.data = await post('/api/amb/brand', { live: on }, 'PUT'); paint(); } catch (err) { e.target.checked = !on; helpModal('Could not save', `<p>${esc(err.message)}</p>`); }
  };
  $('#amPdf').onclick = () => makePdf().catch(err => helpModal('Could not build the PDF', `<p>${esc(err.message)}</p>`));
}

/* ---------- all brands ---------- */
async function renderAll(main) {
  main.innerHTML = `<div class="am"><div class="card"><span class="hint">Loading…</span></div></div>`;
  await loadIcons();
  const r = await api('/api/amb/overview');
  main.innerHTML = `<div class="am">
    <div><h2>Ambassadors</h2><p class="sub">Every brand's creator link. Pick a brand to write its angles. Links start switched off, so nothing is public until you turn it on.</p></div>
    <div class="card" style="padding:0">
      <div class="tbl-wrap"><table>
        <thead><tr><th>Brand</th><th>Creator link</th><th class="num">Live angles</th><th class="num">Tagged ads</th><th>Submit link</th><th></th></tr></thead>
        <tbody>${r.brands.map(b => `<tr>
          <td><b>${esc(b.name)}</b></td>
          <td>${b.slug ? `<span class="pill ${b.live ? 'good' : 'unk'}">${b.live ? 'Live' : 'Off'}</span> <span class="tiny">/angles/${esc(b.slug)}</span>` : '<span class="tiny">Not set up</span>'}</td>
          <td class="num">${b.slug ? b.angles : ''}</td>
          <td class="num">${b.slug ? b.tagged : ''}</td>
          <td>${b.slug ? (b.submit_url ? '<span class="pill good">Set</span>' : '<span class="pill warn">Missing</span>') : ''}</td>
          <td style="text-align:right"><button class="btn" data-act="${esc(b.act_id)}">${b.slug ? 'Open' : 'Set up'}</button></td>
        </tr>`).join('')}</tbody></table></div>
    </div></div>`;
  main.querySelectorAll('[data-act]').forEach(b => b.onclick = () => S.pick && S.pick(b.dataset.act));
}

/* ---------- Angles view ---------- */
function paintAngles(body) {
  const d = S.data;
  const secs = d.sections;
  const hotSec = secs.find(s => s.pinned);
  const live = d.angles.filter(a => a.status === 'live');
  const tagged = d.proof.filter(p => p.kind === 'meta');
  const sold = tagged.reduce((t, p) => t + (p.stats?.revenue || 0), 0);
  const running = tagged.filter(p => (p.stats?.spend30 || 0) > 0).length;
  const empty = live.filter(a => !d.proof.some(p => p.angle_id === a.id)).length;
  const top = [...d.angles].filter(a => a.score.ads).sort((x, y) => y.score.revenue - x.score.revenue)[0];

  const secRow = s => {
    const n = d.angles.filter(a => a.section_id === s.id).length;
    return `<div class="am-row ${s.enabled ? '' : 'off'}" data-sec="${esc(s.id)}" ${s.pinned ? '' : 'draggable="true"'}>
      ${s.pinned ? `<span class="am-grip" style="cursor:default" title="Pinned first">${ic('pin', 15)}</span>` : `<span class="am-grip" title="Drag to reorder">${ic('grip-vertical', 16)}</span>`}
      ${badge(s.icon_svg, s.color)}
      <div class="am-grow"><p class="am-t">${esc(s.name)}</p><p class="am-s">${esc(s.pinned ? 'Pinned first. Angles land here with the Hot switch on their row.' : (s.line || ''))}</p></div>
      <span class="tiny">${s.pinned ? d.angles.filter(a => a.hot).length : n} angle${(s.pinned ? d.angles.filter(a => a.hot).length : n) === 1 ? '' : 's'}</span>
      ${s.pinned ? '<span class="tiny" style="width:66px">Always on</span>' : sw('sec_' + s.id, s.enabled, '', `data-sectog="${esc(s.id)}" title="Show this section on the link"`)}
      <button class="btn" data-secedit="${esc(s.id)}">Edit</button>
    </div>`;
  };

  const angleRow = (a, inHot) => {
    const sc = a.score;
    const pc = d.proof.filter(p => p.angle_id === a.id).length;
    return `<div class="am-row ${a.status === 'draft' ? 'off' : ''}" data-ang="${esc(a.id)}" draggable="true" data-list="${inHot ? 'hot' : esc(a.section_id || '')}">
      <span class="am-grip" title="Drag to reorder">${ic('grip-vertical', 16)}</span>
      <div class="am-grow"><p class="am-t">${esc(a.title)} ${a.status === 'draft' ? '<span class="am-chip draft">Draft</span>' : ''} ${!pc ? '<span class="am-chip new">No video yet</span>' : ''}</p>
        <p class="am-s">${a.openers?.[0] ? `&ldquo;${esc(a.openers[0])}&rdquo;` : esc(a.argument || '')}</p></div>
      ${a.format ? `<span class="am-chip">${esc(a.format)}</span>` : ''}
      <div class="am-score">${sc.ads ? `<b>${sc.ads}</b> ad${sc.ads === 1 ? '' : 's'} · <b class="g">${money(sc.revenue)}</b> · ${x2(sc.roas)}` : `${pc} example${pc === 1 ? '' : 's'}`}</div>
      ${sw('hot_' + a.id + (inHot ? '_h' : ''), a.hot, 'Hot', `data-hottog="${esc(a.id)}"`)}
      <button class="btn" data-angedit="${esc(a.id)}">Edit</button>
    </div>`;
  };

  const hotList = d.angles.filter(a => a.hot).sort((x, y) => x.hot_sort - y.hot_sort);
  const groups = [
    hotSec ? `<div class="am-grp">${svgWrap(hotSec.icon_svg, 15)} ${esc(hotSec.name)} <span class="am-hint">drag to reorder, the first ones lead the link</span></div>
      <div data-drop="hot">${hotList.map(a => angleRow(a, true)).join('') || '<p class="tiny" style="padding:6px 4px 10px">Switch Hot on for any angle below and it shows up here and at the top of the link.</p>'}</div>` : '',
    ...secs.filter(s => !s.pinned).map(s => {
      const list = d.angles.filter(a => a.section_id === s.id).sort((x, y) => x.sort - y.sort);
      return `<div class="am-grp">${svgWrap(s.icon_svg, 15)} ${esc(s.name)} <span class="am-hint">${s.enabled ? '' : 'switched off, creators do not see these'}</span></div>
        <div data-drop="${esc(s.id)}">${list.map(a => angleRow(a, false)).join('') || '<p class="tiny" style="padding:6px 4px 10px">No angles in this section yet. Drag one here or add a new one.</p>'}</div>`;
    }),
  ];
  const orphans = d.angles.filter(a => !a.section_id || !secs.some(s => s.id === a.section_id && !s.pinned));
  if (orphans.length) groups.push(`<div class="am-grp">No section <span class="am-hint">only shows if Hot is on</span></div><div data-drop="">${orphans.map(a => angleRow(a, false)).join('')}</div>`);

  body.innerHTML = `
  <div class="am-split">
    <div class="card" style="padding:16px 18px">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px"><div><h3>Sections</h3><p class="hint" style="margin:0">The link shows these top to bottom. Switch one off and creators stop seeing it. Its angles are kept.</p></div>
      <button class="btn" id="amAddSec">${ic('plus', 14)} Add a section</button></div>
      <div data-drop="sections" style="margin-top:8px">${secs.map(secRow).join('')}</div>
    </div>
    <div style="display:flex;flex-direction:column;gap:12px">
      <div class="card am-dark" style="padding:18px 20px">
        <p class="am-lbl">Staff only</p>
        <div class="am-kv">
          <div><p class="am-k">${live.length}</p><p class="am-l">live angles</p></div>
          <div><p class="am-k">${tagged.length}</p><p class="am-l">Meta ads tagged</p></div>
          <div><p class="am-k" style="color:#5FD292">${money(sold)}</p><p class="am-l">sold by tagged ads</p></div>
          <div><p class="am-k" style="color:#EBBF63">${empty}</p><p class="am-l">angles with no video yet</p></div>
        </div>
        <p class="am-l" style="margin-top:12px">${running} tagged ad${running === 1 ? '' : 's'} spent in the last 30 days.</p>
      </div>
      ${top ? `<div class="card" style="padding:14px 16px"><p class="am-lbl">Best angle so far</p><p style="margin-top:6px"><b>${esc(top.title)}</b>: ${money(top.score.revenue)} across ${top.score.ads} ad${top.score.ads === 1 ? '' : 's'} at ${x2(top.score.roas)}.</p></div>` : ''}
      <div class="card" style="padding:14px 16px" id="amWinners"><p class="am-lbl">Past winners not tagged yet</p><p class="tiny" style="margin-top:4px">Loading…</p></div>
    </div>
  </div>
  <div class="card" style="padding:16px 18px">
    <div style="display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap"><div><h3>Angles</h3><p class="hint" style="margin:0">Scores come from the Meta ads tagged to each angle. Typed examples never count. Drag a row onto another section to move it.</p></div>
      <button class="btn primary" id="amNew">${ic('plus', 14)} New angle</button></div>
    <div style="margin-top:6px">${groups.join('')}</div>
  </div>`;

  $('#amNew').onclick = () => { S.edit = 'new'; paint(); scrollTo(0, 0); };
  $('#amAddSec').onclick = () => sectionModal(null);
  body.querySelectorAll('[data-secedit]').forEach(b => b.onclick = () => sectionModal(S.data.sections.find(s => s.id === b.dataset.secedit)));
  body.querySelectorAll('[data-angedit]').forEach(b => b.onclick = () => { S.edit = b.dataset.angedit; paint(); scrollTo(0, 0); });
  body.querySelectorAll('[data-sectog] input').forEach(inp => inp.onchange = async () => {
    const s = S.data.sections.find(x => 'sec_' + x.id === inp.id);
    try { S.data = await post('/api/amb/section', { ...s, enabled: inp.checked }); paint(); } catch (e) { inp.checked = !inp.checked; helpModal('Could not save', `<p>${esc(e.message)}</p>`); }
  });
  body.querySelectorAll('[data-hottog] input').forEach(inp => inp.onchange = async () => {
    const id = inp.closest('[data-hottog]').dataset.hottog;
    const a = S.data.angles.find(x => x.id === id);
    try { S.data = await post('/api/amb/angle', { ...a, hot: inp.checked }); paint(); } catch (e) { inp.checked = !inp.checked; helpModal('Could not save', `<p>${esc(e.message)}</p>`); }
  });
  wireDrag(body);
  loadWinners();
}

/* Drag to reorder. Sections reorder among themselves; angles reorder within
   Hot, or within/between sections (dropping into another section moves it). */
function wireDrag(root) {
  let dragEl = null;
  root.querySelectorAll('[draggable="true"]').forEach(el => {
    el.addEventListener('dragstart', e => { dragEl = el; el.classList.add('drag'); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', el.dataset.ang || el.dataset.sec); });
    el.addEventListener('dragend', () => { el.classList.remove('drag'); root.querySelectorAll('.over').forEach(x => x.classList.remove('over')); dragEl = null; });
  });
  root.querySelectorAll('[data-drop]').forEach(zone => {
    const kind = zone.dataset.drop === 'sections' ? 'sec' : 'ang';
    zone.addEventListener('dragover', e => {
      if (!dragEl) return;
      const isSec = !!dragEl.dataset.sec;
      if ((kind === 'sec') !== isSec) return;
      if (zone.dataset.drop === 'hot' && dragEl.dataset.list !== 'hot') return;     // Hot is a switch, not a drop target
      if (dragEl.dataset.list === 'hot' && zone.dataset.drop !== 'hot') return;
      e.preventDefault();
      const over = e.target.closest('.am-row');
      root.querySelectorAll('.over').forEach(x => x.classList.remove('over'));
      if (over && over !== dragEl && zone.contains(over)) over.classList.add('over');
    });
    zone.addEventListener('drop', async e => {
      if (!dragEl) return;
      e.preventDefault();
      const over = e.target.closest('.am-row');
      const moving = dragEl;
      if (over && over !== moving && zone.contains(over)) zone.insertBefore(moving, over);
      else if (!over) zone.appendChild(moving);
      const attr = kind === 'sec' ? 'sec' : 'ang';
      const ids = [...zone.querySelectorAll(`[data-${attr}]`)].map(x => x.dataset[attr]).filter(id => kind !== 'sec' || !S.data.sections.find(s => s.id === id)?.pinned);
      const k = kind === 'sec' ? 'sections' : zone.dataset.drop === 'hot' ? 'hot' : 'angles';
      try {
        S.data = await post('/api/amb/order', { kind: k, ids, section_id: k === 'angles' && zone.dataset.drop ? zone.dataset.drop : undefined });
        paint();
      } catch (err) { helpModal('Could not reorder', `<p>${esc(err.message)}</p>`); paint(); }
    });
  });
}

async function loadWinners() {
  const box = $('#amWinners');
  if (!box) return;
  try {
    const r = await api(`/api/amb/ads?act=${encodeURIComponent(S.act)}&untagged=1&min_spend=250&limit=6`);
    const good = r.ads.filter(a => a.revenue > 0);
    box.innerHTML = `<p class="am-lbl">Past winners not tagged yet</p>
      <p class="tiny" style="margin:4px 0 6px">Biggest sellers in the account that are not on any angle. Tag one and it becomes playable proof on the link.</p>
      ${good.length ? good.map(a => `<div class="am-row" style="padding:7px 0">
        <div class="am-grow"><p class="am-t" style="font-size:13px">${esc(a.name || a.ad_id)}</p><p class="am-s">${money(a.revenue)} sold · ${x2(a.roas)} · ${esc(a.media_type || '')}</p></div>
        <button class="btn" data-tagad="${esc(a.ad_id)}" data-name="${esc(a.name || '')}">Tag</button></div>`).join('') : '<p class="tiny">Every ad with real spend is already tagged.</p>'}`;
    box.querySelectorAll('[data-tagad]').forEach(b => b.onclick = () => tagToAngleModal(b.dataset.tagad, b.dataset.name));
  } catch (e) { box.innerHTML = `<p class="am-lbl">Past winners not tagged yet</p><p class="tiny">${esc(e.message)}</p>`; }
}

function tagToAngleModal(adId, name) {
  const opts = S.data.angles.map(a => `<option value="${esc(a.id)}">${esc(a.title)}</option>`).join('');
  modal('Tag this ad to an angle', `<p class="hint" style="margin:0">${esc(name || adId)}</p>
    ${opts ? `<label class="am-f">Angle<select class="am-in" id="amTagSel">${opts}</select></label>` : '<p>Add an angle first.</p>'}`, { cta: 'Tag it' });
  const w = modal.last;
  w._submit = async ctl => {
    const sel = w.querySelector('#amTagSel');
    if (!sel) return ctl.close();
    try { S.data = await post('/api/amb/proof', { angle_id: sel.value, kind: 'meta', ad_id: adId }); ctl.close(); paint(); }
    catch (e) { ctl.msg(e.message); }
  };
}

/* ---------- section modal ---------- */
async function sectionModal(sec) {
  const icons = await loadIcons();
  const tags = await loadTags();
  let icon = sec?.icon || 'sparkles';
  let color = sec?.color || SWATCHES[0];
  const all = Object.keys(icons);
  const suggested = ['flame', 'sparkles', 'ghost', 'gift', 'party-popper', 'wine', 'beer', 'martini', 'trophy', 'calendar-days', 'sun', 'snowflake', 'tree-pine', 'heart', 'star', 'leaf', 'baby', 'dumbbell', 'plane', 'music', 'gem', 'cake', 'pumpkin', 'turkey', 'sailboat', 'volleyball', 'zap', 'rocket', 'megaphone', 'clapperboard'].filter(n => icons[n]);
  modal(sec ? 'Edit section' : 'Add a section', `
    <div class="am-g2">
      <label class="am-f">Name<input class="am-in" id="amSecName" value="${esc(sec?.name || '')}" placeholder="Holiday gifting" ${sec?.pinned ? '' : ''}></label>
      <label class="am-f">One line under it <small>optional</small><input class="am-in" id="amSecLine" value="${esc(sec?.line || '')}" placeholder="Stocking stuffers and party favors. From Nov 1"></label>
    </div>
    <div class="am-f">Icon <small>search all ${all.length.toLocaleString()} Lucide icons</small>
      <input class="am-in" id="amIconQ" placeholder="Search: gift, ghost, wine, snow, trophy">
      <div class="am-icongrid" id="amIconGrid"></div></div>
    <div class="am-f">Colour <small>eight that fit, or pick any</small>
      <div class="am-swatches" id="amSw">${SWATCHES.map(c => `<button class="am-swatch" data-c="${c}" style="background:${c}" aria-label="Colour ${c}"></button>`).join('')}
      <input type="color" class="am-color" id="amAny" value="${esc(color)}" aria-label="Any colour"><span class="tiny">Any colour</span></div></div>
    <div class="am-f">Preview<div id="amSecPrev" class="am-row" style="border:1px solid var(--line);border-radius:9px;padding:10px"></div></div>
    ${sec && !sec.pinned ? `<div><button class="btn" id="amSecDel" style="color:var(--bad)">Delete this section</button></div>` : ''}`, { cta: sec ? 'Save section' : 'Add section' });
  const w = modal.last;
  const grid = w.querySelector('#amIconGrid');
  const drawGrid = q => {
    q = (q || '').trim().toLowerCase();
    const list = q ? all.filter(n => n.includes(q) || (tags[n] || []).some(t => t.includes(q))).slice(0, 120) : suggested;
    grid.innerHTML = list.map(n => `<button type="button" class="${n === icon ? 'on' : ''}" data-ic="${esc(n)}" title="${esc(n)}" aria-label="${esc(n)}">${svgWrap(icons[n], 20)}</button>`).join('') || '<p class="tiny" style="grid-column:1/-1">No icons match. Try a simpler word.</p>';
    grid.querySelectorAll('[data-ic]').forEach(b => b.onclick = () => { icon = b.dataset.ic; drawGrid(w.querySelector('#amIconQ').value); prev(); });
  };
  const prev = () => {
    w.querySelectorAll('.am-swatch').forEach(b => b.classList.toggle('on', b.dataset.c.toLowerCase() === color.toLowerCase()));
    w.querySelector('#amSecPrev').innerHTML = `${badge(icons[icon], color)}<div class="am-grow"><p class="am-t">${esc(w.querySelector('#amSecName').value || 'Section name')}</p><p class="am-s">${esc(w.querySelector('#amSecLine').value)}</p></div>`;
  };
  w.querySelector('#amIconQ').oninput = e => drawGrid(e.target.value);
  w.querySelector('#amSecName').oninput = prev;
  w.querySelector('#amSecLine').oninput = prev;
  w.querySelectorAll('.am-swatch').forEach(b => b.onclick = () => { color = b.dataset.c; w.querySelector('#amAny').value = color; prev(); });
  w.querySelector('#amAny').oninput = e => { color = e.target.value.toUpperCase(); prev(); };
  drawGrid(''); prev();
  const del = w.querySelector('#amSecDel');
  if (del) del.onclick = async () => {
    try { S.data = await api(`/api/amb/section?act=${encodeURIComponent(S.act)}&id=${encodeURIComponent(sec.id)}`, { method: 'DELETE' }); w._ctl.close(); paint(); }
    catch (e) { w._ctl.msg(e.message); }
  };
  w._submit = async ctl => {
    try {
      S.data = await post('/api/amb/section', {
        id: sec?.id, name: w.querySelector('#amSecName').value.trim(), line: w.querySelector('#amSecLine').value.trim(),
        icon, icon_svg: icons[icon], color, enabled: sec ? sec.enabled : true,
      });
      ctl.close(); paint();
    } catch (e) { ctl.msg(e.message); }
  };
}

/* ---------- angle editor ---------- */
function paintEditor(body) {
  const d = S.data;
  const isNew = S.edit === 'new';
  const a = isNew ? { title: '', section_id: d.sections.find(s => !s.pinned)?.id || '', hot: false, status: 'live', openers: [], shots: [{ label: 'Open · 0 to 3s', text: '' }, { label: 'Middle', text: '' }, { label: 'Close', text: '' }] } : d.angles.find(x => x.id === S.edit);
  const secOpts = d.sections.filter(s => !s.pinned).map(s => `<option value="${esc(s.id)}" ${s.id === a.section_id ? 'selected' : ''}>${esc(s.name)}</option>`).join('');
  const fmtList = [...new Set([...FORMATS, ...d.angles.map(x => x.format).filter(Boolean)])];
  const shots = (a.shots?.length ? a.shots : [{ label: 'Open · 0 to 3s', text: '' }, { label: 'Middle', text: '' }, { label: 'Close', text: '' }]);
  body.innerHTML = `
  <div style="display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap">
    <div><button class="btn" id="amBack">${ic('arrow-left', 14)} All angles</button></div>
    <div style="display:flex;gap:8px;align-items:center">
      ${!isNew && d.brand.live ? `<a class="btn" href="${esc(PUBLIC_BASE + d.brand.slug + '#a=' + a.id)}" target="_blank" rel="noopener">${ic('eye', 14)} See it on the link</a>` : ''}
      ${!isNew ? `<button class="btn" id="amDelAng" style="color:var(--bad)">${ic('trash', 14)} Delete</button>` : ''}
    </div>
  </div>
  <div class="card" style="padding:20px 22px;display:flex;flex-direction:column;gap:14px">
    <h3>${isNew ? 'New angle' : 'Edit angle'}</h3>
    <div class="am-g4">
      <label class="am-f" style="grid-column:span 2">Title <small>what creators see on the card</small><input class="am-in" id="eTitle" value="${esc(a.title)}" placeholder="Tonight / Tomorrow: soccer mom"></label>
      <label class="am-f">Section<select class="am-in" id="eSec"><option value="">No section</option>${secOpts}</select></label>
      <label class="am-f">Format<input class="am-in" id="eFmt" list="amFmts" value="${esc(a.format || '')}" placeholder="Split screen"><datalist id="amFmts">${fmtList.map(f => `<option value="${esc(f)}">`).join('')}</datalist></label>
    </div>
    <label class="am-f">The idea in one sentence <small>the reason to buy, said to one person. Creators see this.</small><input class="am-in" id="eArg" value="${esc(a.argument || '')}" placeholder="Your calendar doesn't care what you did last night, so wear a patch and keep tomorrow."></label>
    <div class="am-g3">
      <label class="am-f">Products <small>free text</small><input class="am-in" id="eProd" value="${esc(a.products || '')}" placeholder="Halloween bundle"></label>
      <label class="am-f">Lever <small>staff only</small><input class="am-in" id="eLever" list="amLevers" value="${esc(a.lever || '')}" placeholder="Relief"><datalist id="amLevers">${LEVERS.map(f => `<option value="${esc(f)}">`).join('')}</datalist></label>
      <div class="am-f">Status<div style="display:flex;gap:16px;align-items:center;min-height:38px">${sw('eHot', a.hot, 'Hot right now')}${sw('eLive', a.status !== 'draft', 'Live')}</div></div>
    </div>
    <label class="am-f">Who it is for<textarea class="am-in" id="eWho" style="min-height:60px" placeholder="The mom of two whose Saturday starts at 7am on a soccer sideline.">${esc(a.who || '')}</textarea></label>
    <label class="am-f">Openers <small>one per line, creators see these word for word</small><textarea class="am-in" id="eOpen" placeholder="POV: girls night was last night and soccer is at 8.">${esc((a.openers || []).join('\n'))}</textarea></label>
    <div class="am-f">What to film <small>one box per beat</small>
      <div class="am-g3" id="eShots">${shots.map((s, i) => `<div style="display:flex;flex-direction:column;gap:6px"><input class="am-in" data-shl="${i}" value="${esc(s.label || '')}" placeholder="Beat name"><textarea class="am-in" data-sht="${i}" style="min-height:74px">${esc(s.text || '')}</textarea></div>`).join('')}</div>
      <div><button class="btn" id="eAddShot" type="button">${ic('plus', 13)} Add a beat</button></div></div>
    <div class="am-g2">
      <label class="am-f">Text on screen <small>optional</small><input class="am-in" id="eOver" value="${esc(a.on_screen || '')}" placeholder="TONIGHT: girls night / TOMORROW: 8AM soccer"></label>
      <label class="am-f">Trend or sound to ride <small>optional</small><input class="am-in" id="eTrend" value="${esc(a.trend || '')}" placeholder="Any trending split-screen or transition sound"></label>
    </div>
    <div class="am-g2">
      <label class="am-f" style="color:var(--good)">Do<textarea class="am-in" id="eDo" style="min-height:60px">${esc(a.do_text || '')}</textarea></label>
      <label class="am-f" style="color:var(--bad)">Don't<textarea class="am-in" id="eDont" style="min-height:60px">${esc(a.dont_text || '')}</textarea></label>
    </div>
  </div>
  ${isNew ? '<div class="card" style="padding:16px 18px"><p class="hint" style="margin:0">Save the angle first, then add proof: tag Meta ads, paste creator posts or upload clips.</p></div>' : proofCards(a)}
  <div class="am-save"><span class="am-msg" id="eMsg"></span><button class="btn" id="eCancel">Cancel</button><button class="btn primary" id="eSave">${isNew ? 'Save angle' : 'Save changes'}</button></div>`;

  $('#amBack').onclick = $('#eCancel').onclick = () => { S.edit = null; paint(); };
  $('#eAddShot').onclick = () => {
    const host = $('#eShots'); const i = host.children.length;
    if (i >= 6) return;
    host.insertAdjacentHTML('beforeend', `<div style="display:flex;flex-direction:column;gap:6px"><input class="am-in" data-shl="${i}" placeholder="Beat name"><textarea class="am-in" data-sht="${i}" style="min-height:74px"></textarea></div>`);
  };
  $('#eSave').onclick = async () => {
    const shotsOut = [...body.querySelectorAll('[data-sht]')].map(t => ({ label: body.querySelector(`[data-shl="${t.dataset.sht}"]`).value.trim(), text: t.value.trim() })).filter(s => s.text);
    const payload = {
      id: isNew ? undefined : a.id,
      title: $('#eTitle').value.trim(), section_id: $('#eSec').value || null, format: $('#eFmt').value.trim(),
      argument: $('#eArg').value.trim(), products: $('#eProd').value.trim(), lever: $('#eLever').value.trim(),
      hot: $('#eHot').checked, status: $('#eLive').checked ? 'live' : 'draft',
      who: $('#eWho').value.trim(), openers: $('#eOpen').value.split('\n').map(s => s.trim()).filter(Boolean),
      shots: shotsOut, on_screen: $('#eOver').value.trim(), trend: $('#eTrend').value.trim(),
      do_text: $('#eDo').value.trim(), dont_text: $('#eDont').value.trim(),
    };
    try {
      const r = await post('/api/amb/angle', payload);
      S.data = r;
      if (isNew) { S.edit = r.saved_id; paint(); flashMsg($('#eMsg'), 'Saved. Now add proof below.'); }
      else flashMsg($('#eMsg'), 'Saved');
    } catch (e) { flashMsg($('#eMsg'), e.message, false); }
  };
  const del = $('#amDelAng');
  if (del) del.onclick = async () => {
    if (!(await confirmModal('Delete this angle?', 'It disappears from the creator link, with its examples. Tagged Meta ads are not touched.', 'Delete'))) return;
    try { S.data = await api(`/api/amb/angle?act=${encodeURIComponent(S.act)}&id=${encodeURIComponent(a.id)}`, { method: 'DELETE' }); S.edit = null; paint(); }
    catch (e) { helpModal('Could not delete', `<p>${esc(e.message)}</p>`); }
  };
  if (!isNew) wireProof(a);
}

function proofCards(a) {
  const d = S.data;
  const mine = d.proof.filter(p => p.angle_id === a.id);
  const metas = mine.filter(p => p.kind === 'meta');
  const others = mine.filter(p => p.kind !== 'meta');
  const sc = a.score;
  const LBL = { post: 'Creator post', typed: 'Example · typed by the team', upload: 'Clip uploaded by the team', inspo: 'Inspiration · another brand' };
  return `
  <div class="card" style="padding:16px 18px">
    <div style="display:flex;justify-content:space-between;align-items:flex-end;gap:14px;flex-wrap:wrap">
      <div><h3>Proof · Meta ads on this angle</h3><p class="hint" style="margin:0">Tag an ad once. Creators can play it on the link. Its numbers below update themselves and stay here.</p></div>
      <div style="text-align:right"><p style="font-size:22px;font-weight:700;color:var(--good)">${money(sc.revenue)}</p><p class="tiny">${sc.ads} ad${sc.ads === 1 ? '' : 's'} · ${x2(sc.roas)} · ${sc.running} spent in 30 days</p></div>
    </div>
    <div style="margin-top:8px">${metas.map(p => `<div class="am-row" data-pid="${esc(p.id)}">
      <span class="am-well" style="width:40px;height:52px" data-cover="${esc(p.ad_id)}">${ic('play', 14)}</span>
      <div class="am-grow"><p class="am-t" style="font-size:13.5px">${esc(p.stats?.name || p.ad_id)}</p><p class="am-s">${p.stats ? `${money(p.stats.spend)} spent · <b style="color:var(--good)">${money(p.stats.revenue)}</b> sold · ${x2(p.stats.roas)}${(p.stats.spend30 || 0) > 0 ? ' · running' : ''}` : 'No delivery yet'}</p></div>
      ${sw('pshow_' + p.id, p.shown, 'Show on link', `data-pshow="${esc(p.id)}"`)}
      <button class="btn" data-pdel="${esc(p.id)}" aria-label="Untag this ad">${ic('x', 14)}</button></div>`).join('') || '<p class="tiny" style="padding:6px 0">No ads tagged yet.</p>'}</div>
    <div style="margin-top:10px;padding-top:12px;border-top:1px solid var(--line);display:flex;flex-direction:column;gap:8px">
      <label class="am-f">Tag a Meta ad <small>search ${esc(d.account.name)}'s ads by name, biggest sellers first</small><input class="am-in" id="pSearch" placeholder="Type part of the ad name, or leave empty to see the top sellers"></label>
      <div class="am-results" id="pResults"><p class="tiny" style="padding:10px">Loading…</p></div>
    </div>
  </div>

  <div class="card" style="padding:16px 18px">
    <h3>Proof · other examples</h3><p class="hint" style="margin:0">For videos that are not a Meta ad. Each tile on the link says where it came from. These never count toward the score.</p>
    <div style="margin-top:8px">${others.map(p => `<div class="am-row" data-pid="${esc(p.id)}">
      <span class="am-well" style="width:40px;height:52px">${ic(p.kind === 'upload' ? 'play' : 'link', 14)}</span>
      <div class="am-grow"><span class="am-src ${esc(p.kind)}">${esc(LBL[p.kind])}</span>
        <p class="am-s" style="margin-top:4px">${esc(p.who || '')}${p.views ? ` · ${Number(p.views).toLocaleString()} views` : ''}${p.sales ? ` · ${money(p.sales)} sold (staff only)` : ''}${p.note ? ` · ${esc(p.note)}` : ''}</p>
        ${p.url ? `<a class="tiny" href="${esc(p.url)}" target="_blank" rel="noopener">${esc(p.url.slice(0, 70))}</a>` : ''}</div>
      ${sw('pshow_' + p.id, p.shown, 'Show on link', `data-pshow="${esc(p.id)}"`)}
      <button class="btn" data-pdel="${esc(p.id)}" aria-label="Remove this example">${ic('x', 14)}</button></div>`).join('') || '<p class="tiny" style="padding:6px 0">No other examples yet. Angles with no video show creators a "be the first" note instead of an empty space.</p>'}</div>
    <div style="margin-top:10px;padding-top:12px;border-top:1px solid var(--line);display:flex;flex-direction:column;gap:12px">
      <p style="font-weight:700;font-size:13.5px">Add an example</p>
      <div class="am-f">What is it
        <div class="am-radios am-g4" id="pKind">
          ${[['post', 'A creator post', 'Link to a TRYBE creator\'s post'], ['typed', 'Our example, with numbers', 'Link plus views you type'], ['upload', 'Upload a clip', `Video file, up to 95MB${S.data.has_media ? '' : ' (storage not connected)'}`], ['inspo', 'Another brand', 'Inspiration only, never numbers']]
            .map(([k, t, s], i) => `<label class="am-radio ${i === 0 ? 'on' : ''}"><input type="radio" name="pk" value="${k}" ${i === 0 ? 'checked' : ''}><span><b>${t}</b><span>${s}</span></span></label>`).join('')}
        </div></div>
      <div class="am-g2" id="pFields">
        <label class="am-f" data-for="post typed inspo">Link to the video<input class="am-in" id="pUrl" placeholder="https://www.tiktok.com/@creator/video/..."></label>
        <label class="am-f" data-for="upload" style="display:none">Video file<input class="am-in" id="pFile" type="file" accept="video/*,image/*"></label>
        <label class="am-f">Whose is it <small>creator or brand name, shows on the tile</small><input class="am-in" id="pWho" placeholder="Jess R."></label>
        <label class="am-f" data-for="post typed">Views <small>optional</small><input class="am-in" id="pViews" inputmode="numeric" placeholder="e.g. 188000"></label>
        <label class="am-f" data-for="typed" style="display:none">Sales <small>staff only, never on the link</small><input class="am-in" id="pSales" inputmode="decimal" placeholder="e.g. 900"></label>
        <label class="am-f" style="grid-column:1/-1">One line for the creator <small>optional</small><input class="am-in" id="pNote" placeholder="The shape to steal: the split screen, then the patch in the middle."></label>
      </div>
      <div style="display:flex;gap:10px;align-items:center"><button class="btn primary" id="pAdd">Add example</button><span class="am-msg" id="pMsg"></span></div>
    </div>
  </div>`;
}

function wireProof(a) {
  const root = $('#amBody');
  root.querySelectorAll('[data-pdel]').forEach(b => b.onclick = async () => {
    try { S.data = await api(`/api/amb/proof?act=${encodeURIComponent(S.act)}&id=${encodeURIComponent(b.dataset.pdel)}`, { method: 'DELETE' }); paint(); }
    catch (e) { helpModal('Could not remove', `<p>${esc(e.message)}</p>`); }
  });
  root.querySelectorAll('[data-pshow] input').forEach(inp => inp.onchange = async () => {
    const id = inp.closest('[data-pshow]').dataset.pshow;
    const p = S.data.proof.find(x => x.id === id);
    try { S.data = await post('/api/amb/proof', { id, angle_id: p.angle_id, kind: p.kind, who: p.who, views: p.views, sales: p.sales, note: p.note, shown: inp.checked }); }
    catch (e) { inp.checked = !inp.checked; helpModal('Could not save', `<p>${esc(e.message)}</p>`); }
  });

  // Covers for the tagged ads (staff route, cached by the account-health worker).
  const ids = [...root.querySelectorAll('[data-cover]')].map(x => x.dataset.cover);
  if (ids.length) api(`/api/ad-creatives?ads=${encodeURIComponent(ids.join(','))}`).then(r => {
    for (const [id, v] of Object.entries(r.assets || {})) if (v.thumb) root.querySelectorAll(`[data-cover="${CSS.escape(id)}"]`).forEach(m => { m.innerHTML = `<img src="${esc(v.thumb)}" alt="">`; });
  }).catch(() => {});

  // Ad search.
  let t = null, seq = 0;
  const search = async () => {
    const q = $('#pSearch').value.trim();
    const my = ++seq;
    const box = $('#pResults');
    try {
      const r = await api(`/api/amb/ads?act=${encodeURIComponent(S.act)}&q=${encodeURIComponent(q)}&limit=12`);
      if (my !== seq) return;
      box.innerHTML = r.ads.length ? r.ads.map(x => {
        const onThis = x.tagged.includes(a.id);
        const elsewhere = x.tagged.filter(id => id !== a.id).length;
        return `<div class="am-row"><div class="am-grow"><p class="am-t" style="font-size:13px">${esc(x.name || x.ad_id)}</p>
          <p class="am-s">${money(x.spend)} spent · ${money(x.revenue)} sold · ${x2(x.roas)} · ${esc(x.media_type || '')}${x.last_spend ? ` · last spend ${esc(x.last_spend)}` : ''}${elsewhere ? ` · on ${elsewhere} other angle${elsewhere === 1 ? '' : 's'}` : ''}</p></div>
          ${onThis ? '<span class="tiny" style="color:var(--good)">Tagged</span>' : `<button class="btn" data-tag="${esc(x.ad_id)}">Tag</button>`}</div>`;
      }).join('') : '<p class="tiny" style="padding:10px">No ads match.</p>';
      box.querySelectorAll('[data-tag]').forEach(b => b.onclick = async () => {
        try { S.data = await post('/api/amb/proof', { angle_id: a.id, kind: 'meta', ad_id: b.dataset.tag }); paint(); }
        catch (e) { helpModal('Could not tag', `<p>${esc(e.message)}</p>`); }
      });
    } catch (e) { box.innerHTML = `<p class="tiny" style="padding:10px">${esc(e.message)}</p>`; }
  };
  $('#pSearch').oninput = () => { clearTimeout(t); t = setTimeout(search, 250); };
  search();

  // Add an example.
  const kindNow = () => root.querySelector('input[name="pk"]:checked').value;
  const syncKind = () => {
    const k = kindNow();
    root.querySelectorAll('#pKind .am-radio').forEach(l => l.classList.toggle('on', l.querySelector('input').checked));
    root.querySelectorAll('#pFields [data-for]').forEach(el => { el.style.display = el.dataset.for.split(' ').includes(k) ? '' : 'none'; });
  };
  root.querySelectorAll('input[name="pk"]').forEach(r => r.onchange = syncKind);
  syncKind();
  $('#pAdd').onclick = async () => {
    const k = kindNow();
    const msg = $('#pMsg');
    const btn = $('#pAdd');
    try {
      btn.disabled = true;
      const b = { angle_id: a.id, kind: k, who: $('#pWho').value.trim(), note: $('#pNote').value.trim() };
      if (k === 'upload') {
        const f = $('#pFile').files[0];
        if (!f) throw new Error('Choose a video file first.');
        if (f.size > 95 * 1024 * 1024) throw new Error('That file is over 95MB. Trim it, or paste a link instead.');
        flashMsg(msg, `Uploading ${(f.size / 1048576).toFixed(1)}MB…`);
        const res = await fetch(`${S.url.replace(/\/+$/, '')}/api/amb/upload?act=${encodeURIComponent(S.act)}`, { method: 'POST', headers: { Authorization: 'Bearer ' + S.tok, 'Content-Type': f.type || 'video/mp4' }, body: f });
        const j = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(j.error || 'Upload failed');
        b.file_key = j.file_key;
      } else {
        b.url = $('#pUrl').value.trim();
        if (k !== 'inspo') b.views = $('#pViews').value.replace(/[^0-9]/g, '');
        if (k === 'typed') b.sales = $('#pSales').value.replace(/[^0-9.]/g, '');
      }
      S.data = await post('/api/amb/proof', b);
      paint();
    } catch (e) { flashMsg(msg, e.message, false); btn.disabled = false; }
  };
}

/* ---------- Link and brief ---------- */
function paintLink(body) {
  const b = S.data.brand;
  const se = b.season || {};
  const avoid = b.avoid?.length ? b.avoid : [{ title: '', why: '' }];
  const rules = b.rules?.length ? b.rules : [''];
  body.innerHTML = `
  <div class="am-split">
    <div style="display:flex;flex-direction:column;gap:14px">
      <div class="card" style="padding:18px 20px;display:flex;flex-direction:column;gap:12px">
        <h3>The link</h3>
        <label class="am-f">Address <small>set it once. Changing it breaks the link in any PDF already uploaded.</small>
          <div style="display:flex"><span class="am-in" style="width:auto;border-radius:8px 0 0 8px;background:#F1F5F8;color:var(--muted);border-right:none;white-space:nowrap">${esc(PUBLIC_BASE.replace('https://', ''))}</span><input class="am-in" id="lSlug" style="border-radius:0 8px 8px 0;font-weight:700" value="${esc(b.slug)}"></div></label>
        <label class="am-f">Name creators see<input class="am-in" id="lName" value="${esc(b.display_name || '')}"></label>
      </div>

      <div class="card" style="padding:18px 20px;display:flex;flex-direction:column;gap:12px;border-color:#F1B8CB">
        <div style="display:flex;gap:10px;align-items:flex-start">${badge(S.icons.video, '#DB2777', 34)}<div><h3>Where creators submit</h3><p class="hint" style="margin:0">Paste it once. Every Film this button on the link uses it, so changing it here changes it everywhere, straight away. Left empty, the button reads "Submit this on ${esc(b.submit_platform || 'TRYBE')}" as plain text.</p></div></div>
        <div class="am-g3">
          <label class="am-f">Platform<input class="am-in" id="lPlat" value="${esc(b.submit_platform || 'TRYBE')}"></label>
          <label class="am-f" style="grid-column:span 2">Campaign link<input class="am-in" id="lSubmit" value="${esc(b.submit_url || '')}" placeholder="https://..."></label>
        </div>
        <label class="am-f">Button says<input class="am-in" id="lBtn" value="${esc(b.submit_label || '')}" placeholder="Film this on ${esc(b.submit_platform || 'TRYBE')}"></label>
      </div>

      <div class="card" style="padding:18px 20px;display:flex;flex-direction:column;gap:12px">
        <h3>How the page looks and reads</h3>
        <div class="am-g2">
          <label class="am-f">Logo link <small>optional, a PNG or SVG on https. Empty shows the name.</small><input class="am-in" id="lLogo" value="${esc(b.logo_url || '')}" placeholder="https://cdn.shopify.com/.../logo.png"></label>
          <div class="am-f">Brand colour<div class="am-swatches" id="lSw">${['#D6336C', '#1D4ED8', '#0F766E', '#15803D', '#7C3AED', '#C2410C', '#13202B'].map(c => `<button type="button" class="am-swatch ${(b.accent || '').toLowerCase() === c.toLowerCase() ? 'on' : ''}" data-c="${c}" style="background:${c}" aria-label="Colour ${c}"></button>`).join('')}<input type="color" class="am-color" id="lAcc" value="${esc(b.accent || '#13202B')}" aria-label="Any colour"></div></div>
        </div>
        <label class="am-f">Intro <small>top of the page and the PDF. Two or three lines.</small><textarea class="am-in" id="lIntro">${esc(b.intro || '')}</textarea></label>
        <div class="am-g2">
          <label class="am-f">What it is <small>the product in plain words</small><textarea class="am-in" id="lAbout">${esc(b.about || '')}</textarea></label>
          <label class="am-f">Who we are talking to<textarea class="am-in" id="lAud">${esc(b.audience || '')}</textarea></label>
        </div>
      </div>

      <div class="card" style="padding:18px 20px;display:flex;flex-direction:column;gap:12px">
        <div><h3 style="color:var(--bad)">Please stop filming these</h3><p class="hint" style="margin:0">A red card near the top of the link. Name the video everyone keeps sending, and say why.</p></div>
        <div class="am-list-edit" id="lAvoid">${avoid.map(x => avoidRow(x)).join('')}</div>
        <div><button class="btn" id="lAvoidAdd" type="button">${ic('plus', 13)} Add one</button></div>
      </div>

      <div class="card" style="padding:18px 20px;display:flex;flex-direction:column;gap:12px">
        <div><h3>Say it right</h3><p class="hint" style="margin:0">Claims and wording rules, shown as a short checklist.</p></div>
        <div class="am-list-edit" id="lRules">${rules.map(x => ruleRow(x)).join('')}</div>
        <div><button class="btn" id="lRuleAdd" type="button">${ic('plus', 13)} Add a rule</button></div>
      </div>

      <div class="card" style="padding:18px 20px;display:flex;flex-direction:column;gap:12px">
        <div><h3>The season card</h3><p class="hint" style="margin:0">What is in season right now. The chart underneath is last year's store sales for the weeks ahead, compared with a normal week, with no dollar amounts. Clear the title to hide the card.</p></div>
        <div class="am-g3">
          <label class="am-f">Title<input class="am-in" id="sTitle" value="${esc(se.title || '')}" placeholder="Halloween party season"></label>
          <label class="am-f">Until<input class="am-in" id="sUntil" value="${esc(se.until || '')}" placeholder="Oct 31"></label>
          <label class="am-f">Next up<input class="am-in" id="sNext" value="${esc(se.next || '')}" placeholder="Friendsgiving and holiday parties, from Nov 1"></label>
        </div>
        <label class="am-f">One or two lines<textarea class="am-in" id="sLine" style="min-height:60px">${esc(se.line || '')}</textarea></label>
        <div class="am-g3">
          <label class="am-f">Colour the chart from <small>MM-DD</small><input class="am-in" id="sH0" value="${esc(se.highlight?.[0] || '')}" placeholder="10-01"></label>
          <label class="am-f">to <small>MM-DD</small><input class="am-in" id="sH1" value="${esc(se.highlight?.[1] || '')}" placeholder="10-31"></label>
          <div class="am-f">Chart<div style="min-height:38px;display:flex;align-items:center">${sw('sChart', se.show_chart !== false, 'Show the chart')}</div></div>
        </div>
        <div id="sPrev"><p class="tiny">Loading last year's shape…</p></div>
      </div>

      <div class="card" style="padding:18px 20px">
        <div style="display:flex;justify-content:space-between;align-items:center;gap:12px"><div><h3>Inspiration from other brands</h3><p class="hint" style="margin:0">Show tiles labelled Inspiration, which open the other brand's post.</p></div>${sw('lInspo', b.show_inspo, '')}</div>
      </div>
    </div>

    <div style="display:flex;flex-direction:column;gap:14px">
      <div class="card" style="padding:18px 20px;display:flex;flex-direction:column;gap:12px">
        <div><h3>Brief PDF for ${esc(b.submit_platform || 'TRYBE')}</h3><p class="hint" style="margin:0">One page. It explains the link instead of listing angles, so the copy you upload never goes out of date. Rebuild it only if the logo, colour, intro or stop list changes.</p></div>
        <div class="am-pdf"><div class="pg">
          <b style="color:${esc(b.accent || '#13202B')};font-size:14px">${esc(b.display_name)}</b>
          <b style="font-family:var(--serif);font-weight:400;font-size:21px;line-height:1.05">Everything you need is at one link</b>
          <div class="ln"></div><div class="ln" style="width:80%"></div>
          <div style="display:flex;gap:10px;align-items:center;padding:10px;border-radius:6px;background:${esc(tint(b.accent || '#13202B').bg)}"><span id="lQr" style="width:52px;height:52px;background:#fff;border-radius:4px;display:block"></span><div style="flex:1"><div class="ln"></div><div class="ln" style="width:70%;margin-top:5px"></div></div></div>
          <div class="ln" style="margin-top:6px"></div><div class="ln" style="width:90%"></div><div class="ln" style="width:60%"></div>
        </div></div>
        <div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn primary" id="lPdf" style="flex:1">${ic('file-down', 14)} Download PDF</button><button class="btn" id="lQrDl">${ic('qr-code', 14)} QR code</button></div>
      </div>
      <div class="card" style="padding:14px 16px"><p class="am-lbl">On ${esc(b.submit_platform || 'TRYBE')}</p><p style="margin-top:6px;font-size:13.5px">Upload the PDF as the campaign brief, and paste the link in the campaign description too, so creators on phones can tap it.</p></div>
    </div>
  </div>
  <div class="am-save"><span class="am-msg" id="lMsg"></span><button class="btn primary" id="lSave">Save</button></div>`;

  let accent = b.accent || '#13202B';
  const syncSw = () => body.querySelectorAll('#lSw .am-swatch').forEach(x => x.classList.toggle('on', x.dataset.c.toLowerCase() === accent.toLowerCase()));
  body.querySelectorAll('#lSw .am-swatch').forEach(x => x.onclick = () => { accent = x.dataset.c; $('#lAcc').value = accent; syncSw(); });
  $('#lAcc').oninput = e => { accent = e.target.value.toUpperCase(); syncSw(); };
  $('#lAvoidAdd').onclick = () => $('#lAvoid').insertAdjacentHTML('beforeend', avoidRow({}));
  $('#lRuleAdd').onclick = () => $('#lRules').insertAdjacentHTML('beforeend', ruleRow(''));
  body.addEventListener('click', e => { const r = e.target.closest('[data-rm]'); if (r) r.closest('.am-li').remove(); });
  $('#lQrDl').onclick = () => qrPng().catch(err => helpModal('Could not make the QR code', `<p>${esc(err.message)}</p>`));
  $('#lPdf').onclick = () => makePdf().catch(err => helpModal('Could not build the PDF', `<p>${esc(err.message)}</p>`));
  qrInto($('#lQr')).catch(() => {});

  const drawSeason = async () => {
    try {
      const r = await api(`/api/amb/season?act=${encodeURIComponent(S.act)}`);
      const ch = r.chart;
      if (!ch) { $('#sPrev').innerHTML = '<p class="tiny">Not enough sales history for a chart yet. The card still shows without it.</p>'; return; }
      const xs = ch.weeks.map(w => w.x).filter(v => v != null);
      const mx = Math.max(...xs, 1.2);
      const h0 = $('#sH0').value.trim(), h1 = $('#sH1').value.trim();
      const add = (d, n) => { const t = new Date(d + 'T12:00:00Z'); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10); };
      const hi = w => { if (!h0 || !h1) return false; const s = w.week_of.slice(5), e = add(w.week_of, 6).slice(5); return h0 <= h1 ? (e >= h0 && s <= h1) : (e >= h0 || s <= h1); };
      $('#sPrev').innerHTML = `<p class="am-lbl" style="margin-bottom:6px">What creators see · weeks from ${esc(ch.weeks[0].week_of)}</p>
        <div class="am-bars">${ch.weeks.map(w => `<div class="${hi(w) ? 'hi' : ''}" style="height:${w.x == null ? 4 : Math.max(3, w.x / mx * 100)}%" title="${esc(w.week_of)}: ${w.x == null ? 'no data' : w.x.toFixed(1) + 'x a normal week'}"></div>`).join('')}</div>
        <p class="tiny" style="margin-top:6px">Busiest week last year: ${Math.max(...xs).toFixed(1)}x a normal week.</p>`;
    } catch (e) { $('#sPrev').innerHTML = `<p class="tiny">${esc(e.message)}</p>`; }
  };
  drawSeason();
  $('#sH0').onchange = $('#sH1').onchange = drawSeason;

  $('#lSave').onclick = async () => {
    const avoidOut = [...body.querySelectorAll('#lAvoid .am-li')].map(li => ({ title: li.querySelector('[data-at]').value.trim(), why: li.querySelector('[data-aw]').value.trim() })).filter(x => x.title);
    const rulesOut = [...body.querySelectorAll('#lRules [data-r]')].map(i => i.value.trim()).filter(Boolean);
    const title = $('#sTitle').value.trim();
    const payload = {
      slug: $('#lSlug').value.trim().toLowerCase(), display_name: $('#lName').value.trim(),
      submit_platform: $('#lPlat').value.trim() || 'TRYBE', submit_url: $('#lSubmit').value.trim(), submit_label: $('#lBtn').value.trim(),
      logo_url: $('#lLogo').value.trim(), accent, intro: $('#lIntro').value.trim(), about: $('#lAbout').value.trim(), audience: $('#lAud').value.trim(),
      avoid: avoidOut, rules: rulesOut, show_inspo: $('#lInspo').checked,
      season: title ? { title, until: $('#sUntil').value.trim(), next: $('#sNext').value.trim(), line: $('#sLine').value.trim(), highlight: [$('#sH0').value.trim(), $('#sH1').value.trim()], show_chart: $('#sChart').checked } : null,
    };
    if (payload.slug !== b.slug && !(await confirmModal('Change the link address?', 'Any PDF or message that already has the old link will stop working.', 'Change it'))) return;
    try { S.data = await post('/api/amb/brand', payload, 'PUT'); paint(); flashMsg($('#lMsg'), 'Saved. The link is updated.'); }
    catch (e) { flashMsg($('#lMsg'), e.message, false); }
  };
}
const avoidRow = x => `<div class="am-li"><input class="am-in" data-at value="${esc(x.title || '')}" placeholder="What to stop filming"><input class="am-in" data-aw value="${esc(x.why || '')}" placeholder="Why, in one line"><button class="btn" type="button" data-rm aria-label="Remove">${ic('x', 14)}</button></div>`;
const ruleRow = x => `<div class="am-li one"><input class="am-in" data-r value="${esc(x || '')}" placeholder="e.g. Say 'for a better next day', never 'cures hangovers'"><button class="btn" type="button" data-rm aria-label="Remove">${ic('x', 14)}</button></div>`;

/* ---------- PDF + QR ---------- */
function loadScript(src) {
  return new Promise((res, rej) => {
    if (document.querySelector(`script[src="${src}"]`)) return res();
    const s = document.createElement('script');
    s.src = src; s.onload = res; s.onerror = () => rej(new Error('Could not load ' + src));
    document.head.appendChild(s);
  });
}
async function qrData(size = 8) {
  await loadScript(QR_URL);
  const q = window.qrcode(0, 'M');
  q.addData(PUBLIC_BASE + S.data.brand.slug);
  q.make();
  return q.createDataURL(size, 2);
}
async function qrInto(el) { if (el) el.innerHTML = `<img src="${await qrData(3)}" alt="QR code to the creator link" style="width:100%;height:100%">`; }
async function qrPng() {
  const url = await qrData(12);
  const a = document.createElement('a');
  a.href = url; a.download = `${S.data.brand.slug}-creator-link-qr.gif`; a.click();
}
async function makePdf() {
  await loadScript(JSPDF_URL);
  const b = S.data.brand;
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: 'pt', format: 'letter' });
  const W = 612, M = 54;
  const acc = hexRgb(b.accent || '#13202B');
  let ink = acc; for (let i = 0; i < 14 && 1.05 / (lum(ink) + .05) < 5; i++) ink = mix(ink, [0, 0, 0], .08);
  const soft = mix(acc, [255, 255, 255], .88);
  const url = PUBLIC_BASE + b.slug;
  let y = M + 6;
  doc.setFont('helvetica', 'bold'); doc.setFontSize(22); doc.setTextColor(...ink);
  doc.text(b.display_name || '', M, y + 12);
  doc.setFontSize(9); doc.setTextColor(91, 109, 123);
  doc.text('CREATOR BRIEF', W - M, y + 10, { align: 'right' });
  y += 58;
  doc.setFont('times', 'normal'); doc.setFontSize(34); doc.setTextColor(19, 32, 43);
  const head = doc.splitTextToSize('Everything you need is at one link', W - 2 * M);
  doc.text(head, M, y); y += head.length * 36 + 4;
  if (b.intro) {
    doc.setFont('helvetica', 'normal'); doc.setFontSize(11.5); doc.setTextColor(58, 75, 88);
    const t = doc.splitTextToSize(b.intro, W - 2 * M);
    doc.text(t, M, y); y += t.length * 15 + 14;
  }
  // link box
  const boxH = 132;
  doc.setFillColor(...soft); doc.roundedRect(M, y, W - 2 * M, boxH, 10, 10, 'F');
  doc.setFillColor(255, 255, 255); doc.roundedRect(M + 16, y + 14, 104, 104, 6, 6, 'F');
  doc.addImage(await qrData(6), 'GIF', M + 20, y + 18, 96, 96);
  doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor(...ink);
  doc.text('SCAN OR TAP', M + 140, y + 38);
  doc.setFontSize(15); doc.setTextColor(19, 32, 43);
  const ut = doc.splitTextToSize(url.replace('https://', ''), W - 2 * M - 160);
  doc.textWithLink(ut[0], M + 140, y + 60, { url });
  if (ut[1]) doc.textWithLink(ut[1], M + 140, y + 78, { url });
  doc.setFont('helvetica', 'normal'); doc.setFontSize(11); doc.setTextColor(58, 75, 88);
  doc.text('Opens on your phone. No login. Always current.', M + 140, y + (ut[1] ? 100 : 84));
  y += boxH + 26;
  // what is there
  doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor(91, 109, 123);
  doc.text('WHAT YOU WILL FIND THERE', M, y); y += 16;
  const items = [
    ['Hot right now', 'The angles we are pushing hardest this week.'],
    ['In season', 'What sells right now, and when it ends.'],
    ['Always works', 'Angles that sell every month of the year.'],
    ['Openers to steal', 'First lines, word for word, for every angle.'],
    ['What to film', 'A shot by shot plan for each angle.'],
    ['Proof', 'Real videos made on each angle, to play.'],
  ];
  const colW = (W - 2 * M - 24) / 2;
  items.forEach((it, i) => {
    const cx = M + (i % 2) * (colW + 24), cy = y + Math.floor(i / 2) * 40;
    doc.setFillColor(...ink); doc.circle(cx + 4, cy + 4, 3, 'F');
    doc.setFont('helvetica', 'bold'); doc.setFontSize(11.5); doc.setTextColor(19, 32, 43); doc.text(it[0], cx + 14, cy + 8);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(10.5); doc.setTextColor(58, 75, 88); doc.text(doc.splitTextToSize(it[1], colW - 14), cx + 14, cy + 22);
  });
  y += Math.ceil(items.length / 2) * 40 + 12;
  // stop list
  if (b.avoid?.length) {
    doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor(156, 58, 46);
    doc.text('PLEASE STOP FILMING THESE', M, y); y += 15;
    doc.setFont('helvetica', 'normal'); doc.setFontSize(10.5); doc.setTextColor(58, 75, 88);
    for (const a of b.avoid.slice(0, 5)) {
      const t = doc.splitTextToSize(`• ${a.title}`, W - 2 * M);
      if (y + t.length * 13 > 700) break;
      doc.text(t, M, y); y += t.length * 13 + 3;
    }
    y += 10;
  }
  // how it works
  if (y < 690) {
    doc.setDrawColor(223, 231, 236); doc.line(M, y, W - M, y); y += 18;
    doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor(91, 109, 123);
    doc.text('HOW IT WORKS', M, y); y += 15;
    doc.setFont('helvetica', 'normal'); doc.setFontSize(11); doc.setTextColor(19, 32, 43);
    const how = `1. Open the link and pick an angle.   2. Film it with the opener and shot plan.   3. Submit on ${b.submit_platform || 'TRYBE'} with the angle name in your note.`;
    doc.text(doc.splitTextToSize(how, W - 2 * M), M, y);
  }
  doc.setFontSize(9); doc.setTextColor(122, 139, 151);
  doc.text(`${b.display_name} creator program on ${b.submit_platform || 'TRYBE'}`, M, 760);
  doc.text('Powered by Mobius Digital', W - M, 760, { align: 'right' });
  doc.save(`${b.slug}-creator-brief.pdf`);
}

window.AmbTab = { render };
})();

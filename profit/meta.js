/* Mobius - the Meta section.
 *
 * These are the Meta-only screens that used to be the separate "Account Health"
 * dashboard, now sub-tabs inside Mobius. They live in their own file and their
 * own IIFE for two reasons: a merged single file would be ~4,400 lines, and
 * almost every helper here (esc, fmtMoney, S, api, …) shares a name with one in
 * the host page. Shadowing them inside a closure means neither side can change
 * the other's behaviour by accident - fmtPct differs between the two, for one,
 * and this file needs its own signed version.
 *
 * It talks to the account-health worker DIRECTLY rather than through the host
 * worker's proxy: that worker still owns the Meta sync, both crons and the
 * secrets, and it already accepts the same Mobius session token. Nothing about
 * the backend moved - only the screens.
 *
 * Spend and delivery here are Meta's and match Ads Manager. Purchases, revenue,
 * ROAS and CPA are Triple Whale attribution (last platform click) on Meta ads,
 * the same source as the briefs and reports. The worker sends null where
 * Triple Whale has not synced a day, and this file shows " - " for it.
 */
(function () {
'use strict';

const AH_URL = (/^(localhost|127\.0\.0\.1)$/.test(location.hostname) && (() => { try { return localStorage.getItem('pf_ah'); } catch { return null; } })()) || 'https://mobius-account-health.mobius-digital.workers.dev';
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

/* Local state. The host passes the signed-in token and the selected client in on
   every render, so this file never reaches into the host page's globals. */
const S = { url: AH_URL, tok: '', act: 'all', accounts: [], overview: null, health: null, run: 0, lastSub: '' };

/* The host page's render ticket (`RUN` in index.html, bumped by every show()).
   render() notes it on the way in; an async paint that finds it has moved on
   belongs to a tab the reader already left, and must not touch #main. */
const hostRun = () => { try { return typeof RUN === 'number' ? RUN : 0; } catch { return 0; } };

async function api(path, opts = {}) {
  /* An empty token sends "Bearer " and comes back as a bare 401 "unauthorized",
     which reads as a broken login rather than a host that forgot to hand the
     token over. Name the real cause instead - see setToken below. */
  if (!S.tok) throw new Error('the Meta section was not given a sign-in token');
  const res = await fetch(S.url.replace(/\/+$/, '') + path, {
    ...opts,
    headers: { 'Authorization': 'Bearer ' + S.tok,
      ...(opts.body ? { 'Content-Type': 'application/json' } : {}), ...(opts.headers || {}) },
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(j.error || ('HTTP ' + res.status));
  return j;
}

/* ---------- formatting (deliberately local - fmtPct here is SIGNED) ---------- */
const fmtMoney = (n, cur) => n == null ? ' - ' : new Intl.NumberFormat('en-US', { style:'currency', currency: cur||'USD', maximumFractionDigits: Math.abs(n) >= 1000 ? 0 : 2 }).format(n);
const sym = cur => { try { return new Intl.NumberFormat('en-US',{style:'currency',currency:cur||'USD'}).formatToParts(1).find(p=>p.type==='currency').value; } catch { return '$'; } };
const fmtK = (n, cur) => n == null ? ' - ' : Math.abs(n) >= 1000 ? (sym(cur) + (n/1000).toFixed(1) + 'K') : fmtMoney(n, cur);
const fmtPct = (n, d=1) => n == null ? ' - ' : (n>0?'+':'') + (n*100).toFixed(d) + '%';
const fmtX = n => n == null ? ' - ' : n.toFixed(2) + 'x';
const parseTs = iso => new Date(iso.replace(' ', 'T') + (/Z$|[+-]\d\d:?\d\d$/.test(iso) ? '' : 'Z'));

/* helpModal / noteModal are the host page's - same signature, one modal style. */
const mnote = msg => noteModal('Could not save', `<p>${esc(msg)}</p>`);

/** Nothing to show yet, and why. One quiet v2 note, never a coloured banner. */
function setupNote() {
  if (S.health && S.health.hasMetaToken === false) return `<div class="v2note"><span class="v2pill bad">Setup</span> The Meta token is not set, so nothing can sync until <code>META_TOKEN</code> is added to the worker.</div>`;
  if (!S.accounts.length) return `<div class="v2note"><span class="v2pill warn">Setup</span> No ad accounts found yet. Go to Settings and find the ad accounts on Meta.</div>`;
  if (!S.accounts.some(a => a.active)) return `<div class="v2note"><span class="v2pill warn">Setup</span> No accounts are switched on. Turn on the clients you want tracked in Settings; the first sync backfills 90 days.</div>`;
  return '';
}

/* ---------- the v2 look (2026-10-08) ----------
   Every screen in this file now draws with window.V2UI (v2.js): tiles, cards,
   tables, the line chart and its hover, the one tooltip. The host draws the
   page tabs and the Meta jobs row; this file draws only its own page head
   (crumb, title, Metrics and Help) and the page under it. */
const U = () => window.V2UI;
const MT_CRUMB = { changes: 'Changes', mtoday: 'Today', mbrowser: 'Creative browser' };
function mtHead(key, title, help) {
  return `<div class="ph"><div><div class="ph-crumb">Ads &nbsp;/&nbsp; Meta &nbsp;/&nbsp; <b>${MT_CRUMB[key] || ''}</b></div><div class="ph-t">${title}</div></div>
    <div class="ph-r"><button type="button" class="ph-ico" data-gloss="1" title="What every metric means">Metrics</button><button type="button" class="ph-ico" data-mhelp="${help}" title="How to use this page">Help</button></div></div>`;
}
const mtPage = (key, title, help, body) => `${MT_CSS}<div class="v2 mt2">${mtHead(key, title, help)}${body}</div>`;
const acctOf = id => S.accounts.find(a => a.act_id === id) || null;
/* Brand-first phase 3: a.act_id is the BRAND id; a.meta_act is its main Meta ad account, null when it has
   none (SpeedIn). A list without the field (served before the switch) counts as having Meta. */
const hasMeta = a => !!a && (!('meta_act' in a) || !!a.meta_act);
const metaOn = a => a.active && hasMeta(a);
const noMetaText = a => `No Meta ad account connected for ${a.name}. Connect it in Brand settings > Integrations.`;
const noMetaCard = a => `<section class="v2card"><p class="v2hint">${esc(noMetaText(a))}</p></section>`;
/** Switch the brand the same way the host's own picker does (its change handler re-renders this tab). */
function pickBrand(id) {
  const cp = document.getElementById('clientPick');
  if (!cp || ![...cp.options].some(o => o.value === id)) return;
  cp.value = id; cp.dispatchEvent(new Event('change'));
  window.scrollTo(0, 0);
}
/** Run fn over items, n at a time (each one hits Meta live, so never all at once). */
async function pool(items, n, fn) {
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => { while (i < items.length) { const k = i++; await fn(items[k], k); } }));
}
const hourName = n => { n = ((n % 24) + 24) % 24; return `${n % 12 || 12}${n < 12 ? 'am' : 'pm'}`; };
/** Hover for a hand-drawn SVG chart in a .v2chart wrapper: guide line plus the shared .v2tip. */
function chartTip(svg, W, toIdx, guideX, html) {
  if (!svg) return;
  const wrap = svg.parentNode, tip = wrap && wrap.querySelector('.v2tip'), g = svg.querySelector('.fx-guide');
  if (!tip) return;
  const move = e => {
    const r = svg.getBoundingClientRect(); const i = toIdx((e.clientX - r.left) / r.width * W);
    if (i == null) return;
    if (g) { const gx = guideX(i); g.setAttribute('x1', gx); g.setAttribute('x2', gx); g.setAttribute('opacity', '.45'); }
    tip.innerHTML = html(i); tip.style.display = 'block';
    const tw = tip.offsetWidth; let left = (e.clientX - r.left) + 14; if (left + tw > r.width) left = (e.clientX - r.left) - tw - 14;
    tip.style.left = Math.max(0, left) + 'px'; tip.style.top = '8px';
  };
  svg.onpointermove = move; svg.onpointerdown = move;
  svg.onpointerleave = () => { tip.style.display = 'none'; if (g) g.setAttribute('opacity', '0'); };
}
/** A clickable tile: the V2UI tile inside a keyboard-reachable wrapper. */
/** A table row that could not load: short words in the cell, the full reason on hover (never a sideways scroll). */
const errTd = (msg, n) => `<td colspan="${n}" class="faint"${U().tipAttr(esc(msg))}>${/permission|access/i.test(String(msg)) ? 'Meta has not given us access to this account' : 'Did not load. Hover for why.'}</td>`;
const pickTile = (attr, on, html) => `<div class="mt-pick${on ? ' on' : ''}" role="button" tabindex="0" ${attr}>${html}</div>`;

/* The screens' own styles, scoped to .mt2, ride in with every paint (index.html
   and v2.css are not this file's to edit). Tokens only, so both themes work. */
const MT_CSS = `<style>
  .mt2 .mt-stack{display:flex;flex-direction:column;gap:16px}
  .mt2 > div:empty{display:none}
  .mt2 .v2say.lead b{color:var(--ink)}
  .mt2 .v2say.lead .good{color:var(--good)} .mt2 .v2say.lead .warn{color:var(--warn)} .mt2 .v2say.lead .bad{color:var(--bad)}
  .mt2 .mt-bar{display:flex;align-items:center;gap:10px;flex-wrap:wrap}
  .mt2 .mt-gap{flex:1 1 0}
  .mt2 .mt-in{font:inherit;font-size:13px;height:32px;padding:0 10px;border:1px solid var(--line-strong);border-radius:8px;background:var(--surface);color:var(--ink);min-width:0;box-sizing:border-box}
  .mt2 input.mt-in{width:190px}
  .mt2 .mt-in:focus{outline:0;border-color:var(--brand);box-shadow:0 0 0 3px var(--brand-soft)}
  .mt2 .mt-lbl{display:inline-flex;align-items:center;gap:6px;font-size:12.5px;color:var(--muted)}
  .mt2 .mt-b{font:inherit;font-size:13px;font-weight:600;height:32px;padding:0 13px;border-radius:8px;border:1px solid var(--line-strong);background:var(--surface);color:var(--ink);cursor:pointer;white-space:nowrap}
  .mt2 .mt-b:hover{border-color:var(--brand)}
  .mt2 .mt-b.pri{background:var(--brand);border-color:var(--brand);color:var(--on-brand)}
  .mt2 .mt-b.pri:hover{filter:brightness(1.08)}
  .mt2 .mt-b.on{border-color:var(--brand);color:var(--brand)}
  .mt2 .mt-b:disabled{opacity:.55;cursor:default}
  .mt2 .v2jobs button{white-space:nowrap}
  .mt2 .mt-pick{border-radius:10px;cursor:pointer;min-width:0;display:flex}
  .mt2 .mt-pick > .v2tile{flex:1;transition:border-color .12s,box-shadow .12s}
  .mt2 .mt-pick:hover > .v2tile{border-color:var(--line-strong)}
  .mt2 .mt-pick.on > .v2tile{border-color:var(--brand);box-shadow:inset 0 0 0 1px var(--brand)}
  .mt2 .v2tiles.six{grid-template-columns:repeat(3,minmax(0,1fr))}
  @media (max-width:900px){.mt2 .v2tiles.six{grid-template-columns:repeat(2,minmax(0,1fr))}}
  .mt2 .mt-hint{font-size:12px;color:var(--muted);margin:10px 0 0;line-height:1.5}
  .mt2 .mt-hint b{color:var(--ink-2)}
  .mt2 .mt-sk{display:block;height:12px;border-radius:4px;background:var(--surface-2);width:55%;animation:v2sk 1.4s ease-in-out infinite}
  .mt2 .v2tbl td .v2d{margin-left:6px}
  .mt2 .v2tbl tr.link:focus-visible td{background:var(--surface-2)}
  .mt2 .mt-sub{border-top:1px solid var(--line);padding-top:14px;margin-top:16px}
  .mt2 .mt-sub h4{margin:0 0 4px;font-size:13px;font-weight:650;color:var(--ink)}
  .mt2 .mt-sub > p{margin:0 0 8px;font-size:12.5px;color:var(--muted);line-height:1.5}
  .mt2 .notice{background:var(--surface);border:1px solid var(--line);color:var(--ink-2);border-radius:10px}
  .mt2 .notice.warn{background:var(--warn-bg);color:var(--warn);border-color:var(--line)}
  .mt2 .notice.bad{background:var(--bad-bg);color:var(--bad);border-color:var(--line)}
  .mt2 .v2note code,.mt2 .notice code{background:var(--surface-2);color:var(--ink);padding:1px 5px;border-radius:4px;font-size:12px}
  /* Today: spend each hour, today against a normal day */
  .mt2 .mt-hb{display:flex;align-items:stretch;gap:3px;height:132px}
  .mt2 .mt-hb .b{flex:1;display:flex;flex-direction:column;align-items:center;gap:4px;min-width:0}
  .mt2 .mt-hb .col{position:relative;flex:1;width:100%;background:var(--surface-2);border-radius:3px;display:flex;align-items:flex-end}
  .mt2 .mt-hb .col i{display:block;width:100%;border-radius:3px;background:var(--brand)}
  .mt2 .mt-hb .col i.hi{background:var(--warn)} .mt2 .mt-hb .col i.lo{background:var(--v2-cmp)}
  .mt2 .mt-hb .col b{position:absolute;left:-1px;right:-1px;height:2px;border-radius:1px;background:var(--ink);opacity:.65}
  .mt2 .mt-hb .l{font-size:10px;color:var(--muted);height:12px;line-height:12px;white-space:nowrap}
  /* Averages: changes on the timeline */
  .mt2 .mt-strip{position:relative;height:26px;margin:2px 6px 0;border-bottom:1px solid var(--line)}
  .mt2 .mt-strip i{position:absolute;top:8px;width:9px;height:9px;border-radius:50%;transform:translateX(-50%);background:var(--brand);box-shadow:0 0 0 2px var(--surface);cursor:default}
  .mt2 .mt-strip i.t-warn{background:var(--warn)} .mt2 .mt-strip i.t-bad{background:var(--bad)} .mt2 .mt-strip i.t-good{background:var(--good)}
  .mt2 .mt-strip-ax{display:flex;justify-content:space-between;font-size:11px;color:var(--muted);margin:4px 6px 0}
  /* Changes: a timeline per day */
  .mt2 .cl2-day{display:flex;align-items:baseline;gap:10px;flex-wrap:wrap;font-size:12.5px;font-weight:650;color:var(--ink);margin:20px 0 2px}
  .mt2 .cl2-day:first-child{margin-top:2px}
  .mt2 .cl2-day .c{font-weight:500;color:var(--muted)}
  .mt2 .cl2-day .dh{margin-left:auto;font-weight:500;font-size:12px;color:var(--muted);display:inline-flex;align-items:center;gap:2px;flex-wrap:wrap}
  .mt2 .cl2-day .dh b{color:var(--ink);font-weight:600;margin:0 3px}
  .mt2 .cl2-tl{border-left:2px solid var(--line);margin-left:4px;padding-left:18px}
  .mt2 .cl2-item{border-bottom:1px solid var(--line)}
  .mt2 .cl2-item:last-child{border-bottom:0}
  .mt2 .cl2-row{display:grid;grid-template-columns:96px minmax(0,1fr) minmax(0,auto);gap:4px 16px;padding:10px 0;align-items:start;font-size:13px;line-height:1.5;position:relative}
  .mt2 .cl2-tl > .cl2-item > .cl2-row::before{content:'';position:absolute;left:-24px;top:15px;width:8px;height:8px;border-radius:50%;background:var(--line-strong);box-shadow:0 0 0 3px var(--surface)}
  .mt2 .cl2-tl > .cl2-item > .cl2-row.t-good::before{background:var(--good)}
  .mt2 .cl2-tl > .cl2-item > .cl2-row.t-warn::before{background:var(--warn)}
  .mt2 .cl2-tl > .cl2-item > .cl2-row.t-bad::before{background:var(--bad)}
  .mt2 .cl2-row.dim .cl2-when,.mt2 .cl2-row.dim .cl2-what{opacity:.5}
  .mt2 .cl2-when{color:var(--muted);font-size:12px;overflow-wrap:anywhere;line-height:1.4}
  .mt2 .cl2-when b{display:block;color:var(--ink-2);font-weight:600;font-size:12.5px}
  .mt2 .cl2-what{min-width:0;overflow-wrap:anywhere;color:var(--ink)}
  .mt2 .cl2-what > .v2pill{margin-right:7px}
  .mt2 .cl2-client{font-size:11px;font-weight:600;color:var(--ink-2);border:1px solid var(--line-strong);border-radius:5px;padding:0 6px;margin-right:7px;white-space:nowrap}
  .mt2 .cl2-note{color:var(--muted);font-size:12px;margin-top:3px}
  .mt2 .cl2-acts{display:flex;flex-wrap:wrap;gap:6px 10px;align-items:center;justify-content:flex-end;max-width:420px;min-width:0}
  .mt2 .cl2-reason{font-size:12.5px;color:var(--ink);overflow-wrap:anywhere;min-width:0}
  .mt2 .cl2-reason i{font-style:normal;color:var(--muted);margin-right:5px}
  .mt2 .cl2-sugg{font-size:12px;color:var(--warn);background:var(--warn-bg);border-radius:99px;padding:2px 9px;overflow-wrap:anywhere;min-width:0}
  .mt2 .cl2-btn{font:inherit;font-size:12.5px;font-weight:600;border:1px solid var(--line-strong);border-radius:7px;padding:4px 10px;background:var(--surface);color:var(--ink);white-space:nowrap;cursor:pointer}
  .mt2 .cl2-btn:hover{border-color:var(--brand)}
  .mt2 .cl2-btn.go{border-color:var(--brand);color:var(--brand)}
  .mt2 .cl2-link{font:inherit;font-size:12.5px;font-weight:600;color:var(--brand);background:none;border:0;padding:4px 2px;white-space:nowrap;cursor:pointer}
  .mt2 .cl2-link:hover{text-decoration:underline}
  .mt2 .cl2-link.q{color:var(--muted)}
  .mt2 .cl2-rel{margin:0 0 10px;padding-left:14px;border-left:2px dashed var(--line)}
  .mt2 .cl2-rel .cl2-row{padding:7px 0}
  .mt2 .cl2-fold{display:flex;align-items:center;gap:10px;width:100%;text-align:left;font:inherit;font-size:13.5px;font-weight:650;color:var(--ink);background:none;border:0;padding:0;cursor:pointer}
  .mt2 .cl2-fold span{margin-left:auto;font-size:12.5px;font-weight:600;color:var(--brand)}
  .mt2 .cl2-more{margin-top:12px}
  .mt2 .sum-out{background:var(--surface-2);color:var(--ink);border:1px solid var(--line);border-radius:8px;padding:12px 14px;margin-top:12px;white-space:pre-wrap;font-size:13px;line-height:1.55}
  .mt2 .mt-form{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-top:10px}
  /* Creative browser: the host's ad cards, quieter */
  .mt2 .cb-bar{margin-bottom:12px}
  .mt2 .ad-grid.cb-grid{grid-template-columns:repeat(4,minmax(0,1fr));gap:12px}
  @media (max-width:1180px){.mt2 .ad-grid.cb-grid{grid-template-columns:repeat(3,minmax(0,1fr))}}
  @media (max-width:860px){.mt2 .ad-grid.cb-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}
  @media (max-width:520px){.mt2 .ad-grid.cb-grid{grid-template-columns:minmax(0,1fr)}}
  .mt2 .ad-card{border-radius:10px;border-color:var(--line);background:var(--surface);box-shadow:none;transition:border-color .12s,transform .12s}
  .mt2 .ad-card:hover{border-color:var(--line-strong);box-shadow:none;transform:translateY(-1px)}
  .mt2 .ad-media{aspect-ratio:4/5;background:var(--surface-2);border-bottom:1px solid var(--line)}
  .mt2 .ad-media.playing{aspect-ratio:auto}
  .mt2 .ad-noimg{color:var(--muted)}
  .mt2 .ad-rank,.mt2 .ad-type,.mt2 .ad-dur{border-radius:99px;padding:1px 8px}
  .mt2 .ad-body{padding:11px 13px 12px}
  .mt2 .ad-body .ad-name{font-size:13px;font-weight:600;line-height:1.35;color:var(--ink)}
  .mt2 .cb-top{margin-bottom:8px}
  .mt2 .cb-top .vd,.mt2 .vd{font-size:11px;font-weight:600;letter-spacing:0;text-transform:none;padding:2px 8px;border-radius:99px}
  .mt2 .vd.scale{background:var(--good-bg);color:var(--good)} .mt2 .vd.cut{background:var(--bad-bg);color:var(--bad)}
  .mt2 .vd.watch{background:var(--warn-bg);color:var(--warn)} .mt2 .vd.fresh{background:var(--brand-soft);color:var(--brand)}
  .mt2 .cb-nums{gap:10px 12px}
  .mt2 .cb-n span{font-size:10.5px;font-weight:600;letter-spacing:.06em;color:var(--muted)}
  .mt2 .cb-n b{font-size:15px;font-weight:650;color:var(--ink)}
  .mt2 .cb-n b.good{color:var(--good)} .mt2 .cb-n b.bad{color:var(--bad)}
  .mt2 .cb-foot{border-top-color:var(--line)}
  .mt2 .ad-open{color:var(--muted)}
  .mt2 .ad-card:hover .ad-open{color:var(--brand)}
  .mt2 .cb-rule,.mt2 .cb-more{border-radius:10px;border-color:var(--line);background:var(--surface)}
  .mt2 .cb-legend,.mt2 .cb-count{font-size:12.5px;color:var(--muted)}
  .mt2 .cb-legend b,.mt2 .cb-count b{color:var(--ink)}
  .mt2 .cb-legend a,.mt2 .lnk{color:var(--brand)}
  .mt2 .cb-notes{margin-top:0;border-top:0;padding-top:0}
  .mt2 .cb-notes summary,.mt2 .cr-weeks summary{font-size:13px;font-weight:600;color:var(--brand);cursor:pointer}
  .mt2 .cr-weeks{margin-top:14px}
  .mt2 .cr-pick{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin:0 0 12px}
  .mt2 .mt-sw{display:inline-block;width:9px;height:9px;border-radius:2px;margin:0 5px 0 0;vertical-align:0}
  @media (max-width:720px){
    .mt2 .cl2-row{grid-template-columns:minmax(0,1fr);gap:4px}
    .mt2 .cl2-when b{display:inline;margin-right:6px}
    .mt2 .cl2-acts{justify-content:flex-start;max-width:none}
    .mt2 input.mt-in{width:100%}
    .mt2 .mt-hb .l{visibility:hidden}
  }
</style>`;


/* ---------- in-app dialog (replaces browser prompt()) ---------- */
function modal({ title, hint, value = '', placeholder = '', multiline = false, save = 'Save' }) {
  return new Promise(resolve => {
    const w = document.createElement('div');
    w.className = 'modal-wrap';
    w.innerHTML = `<div class="modal">
      <h3>${esc(title)}</h3>${hint ? `<p class="hint">${esc(hint)}</p>` : ''}
      ${multiline ? `<textarea id="mVal" placeholder="${esc(placeholder)}"></textarea>` : `<input id="mVal" type="text" placeholder="${esc(placeholder)}">`}
      <div class="row" style="justify-content:flex-end;gap:8px;margin:14px 0 0">
        <button class="btn" data-m="cancel">Cancel</button>
        <button class="btn primary" data-m="ok">${esc(save)}</button>
      </div></div>`;
    document.body.appendChild(w);
    const inp = w.querySelector('#mVal');
    inp.value = value || '';
    inp.focus();
    if (inp.setSelectionRange) inp.setSelectionRange(inp.value.length, inp.value.length);
    const done = v => { w.remove(); document.removeEventListener('keydown', onKey); resolve(v); };
    const onKey = e => {
      if (e.key === 'Escape') done(null);
      if (e.key === 'Enter' && (!multiline || e.ctrlKey || e.metaKey)) done(inp.value);
    };
    document.addEventListener('keydown', onKey);
    w.addEventListener('mousedown', e => { if (e.target === w) done(null); });
    w.querySelector('[data-m="ok"]').onclick = () => done(inp.value);
    w.querySelector('[data-m="cancel"]').onclick = () => done(null);
  });
}

/* ---------- "How to use" page guides ---------- */

const META_HELP = {
  averages: `
    <p><b>What this page is:</b> every metric compared to this account's <i>own</i> last-30-days normal. Not industry benchmarks, its own baseline. That's how you spot "something changed" without a spreadsheet.</p>
    <p><b>The 10-second read:</b> the sentence at the top names what is better and what is worse. Each tile is the last 7 days, the arrow is against the last 30, and the pill says better or worse than normal. Spend has no colour: more or less spend is not good or bad by itself.</p>
    <p><b>The chart:</b> press a tile to draw it day by day. The solid line is the 7-day average, the dashed line the 30-day normal, and ▲ under a day is a change on the account. Hover for that day's own value and what changed.</p>
    <p><b>Is anything breaking right now?</b> If yesterday or the 3-day is 15%+ off the 7-day, look today, not next week.</p>
    <p><b>Judging rules:</b> ignore moves under about 5% (noise). The last 3 days always look worse than they will end up, because conversions keep landing for about 72 hours. Trust the 7-day against the 30-day before reacting; use the 3-day only as an early warning.</p>
`,
  today: `
    <p><b>What this page is:</b> is today running hot or cold compared with a normal day for this account? It is the only view in Locus that looks <i>inside</i> the current day.</p>
    <p><b>The curve:</b> today's Meta spend added up hour by hour, against the average shape of the last 7 days by the same hour (dashed). Over +10% is running hot, under -10% is running cold. Either is worth a look in Ads Manager before anyone touches a budget. The bars underneath are each single hour, with a tick for a normal hour.</p>
    <p><b>Day done</b> is the share of a normal day's spend that is usually finished by this hour, measured from the last 7 days. At 9am it is often under 15%, and a big swing on that little of a day is mostly noise. <b>There is deliberately no "projected today"</b>: on Meta the daily budget is something you set, so projecting where the day lands only restates a number you already chose. Forecasting belongs on <b>Plan</b>. <b>Refresh</b> pulls again from Meta.</p>
    <p><b>Purchases today</b> are Triple Whale's once it has credited the day; until then the tile waits. Meta's own count is never shown.</p>
    <p><b>Last 7 days against the last 30</b> is the second view on this page: whether the last week beat this account's own normal.</p>`,
  changelog: `
    <p><b>What this page is:</b> the record of what was changed on the account, when, and by whom, pulled from Meta automatically. Nobody has to write the changes down.</p>
    <p><b>Changes that matter:</b> budgets, campaigns and ad sets, bid strategy, targeting, new ads, and anything added by hand, grouped by day on a timeline. Press <b>Add why</b> on each one, pick a reason or write your own, and add a note if it helps. The client's Daily Brief writes "What we're doing" only from these reasons.</p>
    <p><b>Did it help?</b> The chart is cost per purchase (3-day rolling) with ▲ under every day something that matters changed. Each day on the timeline also shows CPA over the 3 full days after it against the 3 days before. It is a read, not proof: other things move CPA too.</p>
    <p><b>Suggested reasons</b> show in amber, and <b>Use this reason</b> accepts one. <b>Hide</b> keeps a noisy change out of summaries and reports; <b>Show again</b> brings it back. <b>Everything else</b> is housekeeping (status updates, renames, billing, single ads switched on or off) and stays closed until you open it.</p>
    <p><b>+ Add a change</b> records things Meta can't see (promo started, landing page swapped, tracking fixed).</p>
    <p><b>Summarise:</b> Claude writes the daily standup, weekly recap, or a client-safe update from the changes and performance. The more reasons you add, the better it reads.</p>
    <p><b>A number moved?</b> CPA spiked Tuesday? Pick Custom dates, choose Tuesday, and see exactly what changed.</p>`,
  creative: `
    <p><b>The cards:</b> your top ads for the dates at the top of the page. Each card shows the creative, a verdict and four numbers: <b>Spend</b>, <b>CPA</b>, <b>ROAS</b>, and <b>Hook</b> for videos (share of impressions that watched 3 seconds) or <b>Link CTR</b> for statics. Press <b>▶</b> to play a video in place; press anywhere else on the card for <b>Details</b>: the ad copy, purchases, hold rate, CTR, CPM and how many days it has run.</p>
    <p><b>The verdict</b> is judged against the brand's goal CPA (Settings, Goals). <b>Scale</b>: CPA at or under goal with 2 or more sales. <b>Cut</b>: CPA more than the brand's yellow zone (30% unless changed) over goal, or no sales after spending 1.5x the goal. <b>Watch</b>: everything in between. No goal set, no verdict.</p>
    <p><b>The controls:</b> <b>Sort by</b> picks the order, <b>Show</b> picks videos, statics or carousels. <b>More options</b> holds the rest: how many cards, which Triple Whale attribution model, how much an ad must spend before a ROAS or CPA sort ranks it, what counts as a new ad, and locking a shared view. <b>Share</b> copies either the client's always-current "Your ads" page or a frozen link to exactly these cards.</p>
    <p><b>Are we launching enough?</b> Ads wear out: the same people see them again and again and CPA creeps up. The three tiles show the share of spend on new ads (the number to protect), the average age of the ads behind the spend, and CPA on new ads against older ones. New ads often look pricier for a few days while Meta settles them. Open <b>See it week by week</b> for the weekly charts and every ad that spent.</p>
    <p><b>A good new-ad share:</b> roughly 10 to 20% when new means 7 days, 15 to 30% for 14 days, 25 to 45% for 30 days. Below that the account is coasting; far above it every week, winners never get to mature.</p>
    <p><b>Where the numbers come from:</b> purchases, revenue, ROAS and CPA are Triple Whale. Spend and delivery (hook, hold, CTR, CPM) are Meta. The full rules are under <b>How these numbers work</b> at the bottom of the page.</p>`,
};


/* ---------- Change Log (Chat 1) ---------- */
const CL = {
  range: localStorage.getItem('ah_cl_range') || '7',
  from: null, to: null,           // used when range === 'custom'
  q: '', type: '',                // search text, "Filter by type" category ('' = all)
  rows: [], truncated: false, panel: null,   // panel: 'add' | 'sum' | null
  seq: 0,                         // newest load wins (two quick period changes)
  mainShown: 100, restShown: 50,  // "Show 50 more"
  restOpen: null,                 // Everything else: null = closed unless a search needs it
  open: new Set(),                // lead ids whose related changes are expanded
  rel: new Map(),                 // lead id -> related count, as last drawn
  need: false,                    // only changes that matter with no why yet
  series: null, loaded: false, helpLine: '', refilter: null,
};
if (!['today','yday','7','30','custom'].includes(CL.range)) CL.range = '7';   // 14 and 90 days were dropped
const CL_RANGES = [['7','Last 7 days'],['today','Today'],['yday','Yesterday'],['30','Last 30 days'],['custom','Custom dates']];
const CL_REASONS = ['Positive performance','Negative performance','Testing','Creative refresh','Budget cap','Client request','Promo / seasonal','Housekeeping','Revert / mistake'];
const CL_ADD_CATS = ['budget','new_creative','new_adset','new_campaign','ad_paused','ad_relaunched','campaign_paused','campaign_relaunched','bid_strategy','targeting','optimisation','schedule','other'];
/* Plain names for the worker's category keys (CATEGORIES in account-health). */
const CL_CAT_LABEL = { budget:'Budget', new_campaign:'New campaign', campaign_paused:'Campaign or ad set paused',
  campaign_relaunched:'Campaign or ad set turned back on', bid_strategy:'Bid strategy', targeting:'Targeting',
  new_creative:'New ad', new_adset:'New ad set', ad_paused:'Ad paused', ad_relaunched:'Ad turned back on',
  optimisation:'Optimisation', schedule:'Schedule', name:'Rename', review:'Ad review', billing:'Billing', other:'Other' };
const clCatLabel = c => CL_CAT_LABEL[c] || String(c || 'other').replace(/_/g, ' ').replace(/^./, m => m.toUpperCase());

/* cl-pure:start  Sorting changes into the two groups. No DOM in here, so a node
   harness can run it with fake rows. */
/* The moves a media buyer has to explain: the client's Daily Brief writes "What
   we're doing" from the reasons on these. Manual entries always count. */
const CL_MATTER = new Set(['budget','new_campaign','campaign_paused','campaign_relaunched','bid_strategy','targeting','new_creative','new_adset']);
/* These never fold under another row: each one needs its own why. */
const CL_ALONE = new Set(['budget','bid_strategy','targeting']);
/* When several launch/status rows hit one object in one minute, which one leads. */
const CL_LEAD = ['new_campaign','campaign_relaunched','campaign_paused','new_adset','new_creative'];
const clTime = r => { const t = parseTs(String(r.event_time || '')).getTime(); return isNaN(t) ? 0 : t; };
/** Hidden rows (confirmed -1) are noise by the buyer's own call, whatever their type. */
function clMatters(r) { return r.confirmed !== -1 && (!!r.manual || CL_MATTER.has(r.category)); }
/** rows -> { main: [{lead, related[]}], rest: [row] }, both newest first.
 *  Rows on the SAME object in the SAME minute on the same account are one action:
 *  one lead row, the others ride along as "related". A group with nothing that
 *  matters goes to rest row by row. Every row lands in exactly one place. */
function clSplit(rows) {
  const groups = new Map();
  for (const r of rows) {
    const obj = r.object_id || r.object_name;
    const k = obj && !r.manual ? [r.act_id, String(r.event_time).slice(0, 16), obj].join('|') : 'solo|' + r.id;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(r);
  }
  const main = [], rest = [];
  for (const g of groups.values()) {
    const mat = g.filter(clMatters);
    if (!mat.length) { rest.push(...g); continue; }
    const alone = r => !!r.manual || CL_ALONE.has(r.category);
    const fam = mat.filter(r => !alone(r)).sort((a, b) => CL_LEAD.indexOf(a.category) - CL_LEAD.indexOf(b.category));
    const items = [];
    if (fam.length) items.push({ lead: fam[0], related: fam.slice(1) });
    mat.filter(alone).forEach(r => items.push({ lead: r, related: [] }));
    for (const r of g) {
      if (clMatters(r)) continue;
      if (r.confirmed === -1) rest.push(r); else items[0].related.push(r);
    }
    main.push(...items);
  }
  main.sort((a, b) => clTime(b.lead) - clTime(a.lead));
  rest.sort((a, b) => clTime(b) - clTime(a));
  return { main, rest };
}
/** Consecutive runs of one local day: [{ key:'2026-10-04', label:'Sunday, Oct 4', items }]. */
function clByDay(list, rowOf) {
  const days = [];
  for (const it of list) {
    const d = parseTs(String(rowOf(it).event_time || ''));
    const key = isNaN(d) ? '' : [d.getFullYear(), String(d.getMonth() + 1).padStart(2, '0'), String(d.getDate()).padStart(2, '0')].join('-');
    if (!days.length || days[days.length - 1].key !== key) {
      days.push({ key, label: isNaN(d) ? 'No date' : d.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' }), items: [] });
    }
    days[days.length - 1].items.push(it);
  }
  return days;
}
/* cl-pure:end */

/* The why dialog lives in <body>, outside .mt2, so its few rules are not scoped.
   Everything else on the page is styled by MT_CSS. */
const CL_CSS = `<style>
  .cl2-why .cl2-wl{display:block;font-size:12.5px;font-weight:650;margin:12px 0 6px}
  .cl2-why-chips{display:flex;flex-wrap:wrap;gap:6px}
</style>`;
/** Colour of a change on the timeline: budgets amber, pauses red, launches green, the rest neutral. */
const clTone = c => c === 'budget' || c === 'bid_strategy' ? 'warn' : /paused/.test(c || '') ? 'bad' : /^new_|relaunched/.test(c || '') ? 'good' : '';
const prettyDay = ymd => { const d = new Date(ymd + 'T12:00:00'); return isNaN(d) ? ymd : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }); };
const addDay = (ymd, n) => new Date(Date.parse(ymd + 'T00:00:00Z') + n * 864e5).toISOString().slice(0, 10);
const spanDays = (from, to) => Math.max(1, Math.round((Date.parse(to + 'T00:00:00Z') - Date.parse(from + 'T00:00:00Z')) / 864e5) + 1);
function clRangeLabel(from, to) {
  return ({ today: 'today', yday: 'yesterday', '7': 'in the last 7 days', '30': 'in the last 30 days' })[CL.range]
    || (from === to ? `on ${prettyDay(from)}` : `from ${prettyDay(from)} to ${prettyDay(to)}`);
}
const ymdLocal = d => new Intl.DateTimeFormat('en-CA',{year:'numeric',month:'2-digit',day:'2-digit'}).format(d);
function clDates() {
  const shift = n => ymdLocal(new Date(Date.now() - n*86400e3));
  if (CL.range === 'today') return [shift(0), shift(0)];
  if (CL.range === 'yday') return [shift(1), shift(1)];
  if (CL.range === 'custom') return [CL.from || shift(6), CL.to || shift(0)];
  return [shift(+CL.range - 1), shift(0)];
}

async function renderChangeLog() {
  /* Ticket: the host's render run, the brand, and this load. An answer that comes
     back after the reader left the tab, switched brand or picked another period
     must not paint. */
  const act = S.act, ticket = S.run, seq = ++CL.seq;
  const live = () => hostRun() === ticket && S.act === act && seq === CL.seq && !!$('#clFeed');
  const [from, to] = clDates();
  const today = ymdLocal(new Date());
  CL.mainShown = 100; CL.restShown = 50; CL.restOpen = null; CL.open = new Set(); CL.series = null; CL.rows = []; CL.loaded = false; CL.helpLine = '';
  const one = act !== 'all' ? acctOf(act) : null;
  if (one && !hasMeta(one)) { $('#main').innerHTML = CL_CSS + mtPage('changes', `What changed on ${esc(one.name)}`, 'changelog', noMetaCard(one)); return; }
  $('#main').innerHTML = CL_CSS + mtPage('changes', one ? `What changed on ${esc(one.name)}` : 'What changed on the accounts', 'changelog', `
    <p class="v2say lead" id="clSay"><span class="mt-sk"></span></p>
    ${setupNote()}
    <div class="mt-bar">
      <div class="v2jobs" role="group" aria-label="Period">${CL_RANGES.map(([v, l]) => `<button type="button" data-clr="${v}" class="${CL.range === v ? 'on' : ''}" aria-pressed="${CL.range === v}">${l}</button>`).join('')}</div>
      ${CL.range === 'custom' ? `<label class="mt-lbl">From <input class="mt-in" type="date" id="clFrom" value="${from}" max="${today}"></label>
      <label class="mt-lbl">To <input class="mt-in" type="date" id="clTo" value="${to}" max="${today}"></label>` : ''}
      <span class="mt-gap"></span>
      <button type="button" class="mt-b" id="clAddBtn">+ Add a change</button>
      <button type="button" class="mt-b pri" id="clSumBtn">Summarise</button>
    </div>
    <div id="clPanel"></div>
    <div class="v2tiles" id="clTiles"></div>
    <div id="clHelp"></div>
    <div class="mt-bar" id="clFilt">
      <input class="mt-in" id="clQ" type="search" placeholder="Search changes" aria-label="Search changes" value="${esc(CL.q)}">
      <select class="mt-in" id="clType" aria-label="Filter by type"><option value="">All types</option></select>
      <button type="button" class="mt-b on" id="clNeedOff" hidden>Only changes without a why <svg class="li" width="12" height="12" viewBox="0 0 24 24" aria-hidden="true"><use href="#i-x"/></svg></button>
    </div>
    <div id="clFeed" class="mt-stack"><section class="v2card"><p class="v2hint">Loading changes…</p></section></div>
    ${U().foot('Changes come from Meta’s activity log with every sync, plus anything added by hand. CPA is Meta spend over Triple Whale purchases (last platform click); a day Triple Whale has not synced is left out, never counted as zero.')}`);

  $('#main').querySelectorAll('[data-clr]').forEach(b => b.onclick = () => {
    const v = b.dataset.clr; if (v === CL.range) return;
    if (v === 'custom') [CL.from, CL.to] = clDates();   // start Custom from the dates on screen
    CL.range = v; try { localStorage.setItem('ah_cl_range', CL.range); } catch { /* private mode */ } renderChangeLog();
  });
  const onDate = () => {
    CL.from = $('#clFrom').value; CL.to = $('#clTo').value;
    if (CL.from && CL.to && CL.from <= CL.to) renderChangeLog();
  };
  if ($('#clFrom')) { $('#clFrom').onchange = onDate; $('#clTo').onchange = onDate; }
  const refilter = () => { CL.mainShown = 100; CL.restShown = 50; CL.restOpen = null; clDrawFeed(); };
  CL.refilter = () => { refilter(); clDrawSummary(); };
  $('#clQ').oninput = () => { CL.q = $('#clQ').value; refilter(); };
  $('#clType').onchange = () => { CL.type = $('#clType').value; CL.refilter(); };
  $('#clNeedOff').onclick = () => { CL.need = false; CL.refilter(); };
  $('#clAddBtn').onclick = () => { CL.panel = CL.panel === 'add' ? null : 'add'; clDrawPanel(); };
  $('#clSumBtn').onclick = () => { CL.panel = CL.panel === 'sum' ? null : 'sum'; clDrawPanel(); };
  clDrawPanel();

  /* Row actions. The listener sits on #clFeed, which every paint of #main
     replaces. Saving redraws ONE row (clPatchRow), never the list, so the page
     does not jump under the reader. */
  $('#clFeed').addEventListener('click', async e => {
    const btn = e.target.closest('[data-do]'); if (!btn) return;
    const what = btn.dataset.do;
    if (what === 'rest') { CL.restOpen = btn.getAttribute('aria-expanded') !== 'true'; return clDrawFeed(); }
    if (what === 'more-main') { CL.mainShown += 50; return clDrawFeed(); }
    if (what === 'more-rest') { CL.restShown += 50; return clDrawFeed(); }
    const r = CL.rows.find(x => x.id === btn.dataset.id); if (!r) return;
    const patch = body => api('/api/activities/'+encodeURIComponent(r.id), { method:'PATCH', body: JSON.stringify(body) });
    if (what === 'rel') {
      CL.open.has(r.id) ? CL.open.delete(r.id) : CL.open.add(r.id);
      const box = [...document.querySelectorAll('#clFeed [data-rel]')].find(x => x.dataset.rel === r.id);
      if (box) box.hidden = !CL.open.has(r.id);
      return clPatchRow(r.id);
    }
    if (what === 'why') {
      const v = await clWhyModal(r);
      if (!v) return;
      const was = { reason: r.reason, note: r.note }, body = {};
      if ((v.reason || '') !== (r.reason || '')) body.reason = v.reason || '';
      if ((v.note || '') !== (r.note || '')) body.note = v.note || '';
      if (!Object.keys(body).length) return;
      r.reason = v.reason || null; r.note = v.note || '';
      clPatchRow(r.id); clDrawSummary();
      try { await patch(body); }
      catch (err) { r.reason = was.reason; r.note = was.note; clPatchRow(r.id); clDrawSummary(); mnote(err.message); }
      return;
    }
    if (what === 'ok') {
      const acceptSugg = r.confirmed !== 1 && !r.reason && r.suggested_reason;
      r.confirmed = r.confirmed === 1 ? 0 : 1;
      const body = { confirmed: r.confirmed === 1 };
      if (acceptSugg && r.confirmed === 1) { r.reason = r.suggested_reason; body.reason = r.reason; }  // "Use this reason" accepts the suggested why
      await patch(body).catch(err => mnote(err.message));
      clPatchRow(r.id); clDrawSummary();
    }
    if (what === 'no') {
      const dis = r.confirmed !== -1;
      r.confirmed = dis ? -1 : 0;
      await patch({ dismissed: dis }).catch(err => mnote(err.message));
      clPatchRow(r.id); clDrawSummary();
    }
  });

  /* "Did it help?" needs the account's daily numbers: one brand only, enough days
     for the window, the same number of days before it, and 3 either side of a change. */
  if (one) {
    const W = Math.max(14, spanDays(from, to)), back = spanDays(to, today) - 1;
    api(`/api/series?act=${encodeURIComponent(act)}&days=${Math.min(400, W * 2 + back + 8)}`)
      .then(s => { if (!live() || !s || !Array.isArray(s.rows)) return; CL.series = s; if (CL.loaded) { clDrawHelp(); clDrawFeed(); } })
      .catch(() => { /* the chart is a bonus; the log stands without it */ });
  }
  try {
    const { rows } = await api(`/api/activities?act=${act}&from=${from}&to=${to}T23:59:59&limit=2000`);
    if (!live()) return;
    CL.rows = rows; CL.truncated = rows.length >= 2000; CL.loaded = true;
    const cats = [...new Set(rows.map(r => r.category || 'other'))].sort((a, b) => clCatLabel(a).localeCompare(clCatLabel(b)));
    if (CL.type && !cats.includes(CL.type)) CL.type = '';
    $('#clType').innerHTML = `<option value="">All types</option>` + cats.map(c =>
      `<option value="${esc(c)}" ${CL.type === c ? 'selected' : ''}>${esc(clCatLabel(c))}</option>`).join('');
    clDrawSummary(); clDrawHelp(); clDrawFeed();
  } catch (e) {
    if (!live()) return;
    $('#clSay').textContent = 'The changes did not load.';
    $('#clFeed').innerHTML = `<section class="v2card"><p class="v2bad">Could not load the changes: ${esc(e.message)}</p></section>`;
  }
}

/** The verdict line and the four tiles, from every change in the period (not the filtered list). */
function clDrawSummary() {
  const say = $('#clSay'), tl = $('#clTiles'); if (!say || !tl || !CL.loaded) return;
  const T = U(), [from, to] = clDates(), per = clRangeLabel(from, to);
  const { main, rest } = clSplit(CL.rows);
  const leads = main.map(it => it.lead);
  const need = leads.filter(r => !r.reason).length, n = main.length;
  const budget = leads.filter(r => r.category === 'budget').length;
  const ads = CL.rows.filter(r => r.category === 'new_creative' && r.confirmed !== -1).length;
  const launches = leads.filter(r => /^new_campaign|^new_adset|relaunched/.test(r.category || '')).length;
  const pauses = leads.filter(r => /paused/.test(r.category || '')).length;
  const help = '<span id="clSayHelp"></span>';
  say.innerHTML = !CL.rows.length ? `No changes on the account ${esc(per)}.${help}`
    : !n ? `Nothing that matters changed ${esc(per)}. ${rest.length} housekeeping change${rest.length === 1 ? ' is' : 's are'} under Everything else.${help}`
    : need ? `<b>${n} change${n === 1 ? ' that matters' : 's that matter'}</b> ${esc(per)}, <b class="warn">${need} without a why</b>. Add why to ${need === 1 ? 'it' : 'them'}: the client’s Daily Brief writes “What we’re doing” only from these reasons.${help}`
    : `<b>${n} change${n === 1 ? ' that matters' : 's that matter'}</b> ${esc(per)}, <b class="good">every one with a reason</b>.${help}`;
  if (CL.helpLine) { const h = $('#clSayHelp'); if (h) h.innerHTML = CL.helpLine; }
  tl.innerHTML = [
    pickTile('data-clf="all"', !CL.need && !CL.type && !CL.q, T.tile({ compact: true, label: 'Changes that matter', value: T.int(n), sub: `${rest.length} more under Everything else` })),
    pickTile('data-clf="need"', CL.need, T.tile({ compact: true, label: 'Without a why', value: `<span class="${need ? 'warn' : 'good'}">${T.int(need)}</span>`, sub: need ? 'Press to list only these' : 'Every change has a reason' })),
    pickTile('data-clf="budget"', CL.type === 'budget', T.tile({ compact: true, label: 'Budget moves', value: T.int(budget), sub: 'Press to list only budgets' })),
    pickTile('data-clf="new_creative"', CL.type === 'new_creative', T.tile({ compact: true, label: 'New ads', value: T.int(ads), sub: `${launches} launch${launches === 1 ? '' : 'es'} or relaunches, ${pauses} paused` })),
  ].join('');
  const nb = $('#clNeedOff'); if (nb) nb.hidden = !CL.need;
  tl.querySelectorAll('[data-clf]').forEach(el => {
    const go = () => {
      const f = el.dataset.clf;
      if (f === 'all') { CL.need = false; CL.type = ''; CL.q = ''; const q = $('#clQ'); if (q) q.value = ''; }
      else if (f === 'need') CL.need = !CL.need;
      else CL.type = CL.type === f ? '' : f;
      const sel = $('#clType');
      if (sel) { if (CL.type && ![...sel.options].some(o => o.value === CL.type)) sel.insertAdjacentHTML('beforeend', `<option value="${esc(CL.type)}">${esc(clCatLabel(CL.type))}</option>`); sel.value = CL.type; }
      CL.refilter && CL.refilter();
    };
    el.onclick = go; el.onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } };
  });
}

/** Full days of the account's series, with a 3-day rolling CPA. Days Triple Whale has not synced add nothing. */
function clFullDays() {
  const s = CL.series; if (!s) return null;
  const today = s.account && s.account.today;
  const full = s.rows.filter(r => !today || r.date < today);
  const roll = full.map((_, i) => { let sp = 0, p = 0, any = false; for (let j = Math.max(0, i - 2); j <= i; j++) { const r = full[j]; if (r.purchases == null) continue; sp += r.spend || 0; p += r.purchases; any = true; } return any && p ? sp / p : null; });
  return { full, roll, today, cur: (s.account && s.account.currency) || (acctOf(S.act) || {}).currency || 'USD' };
}
const cpaOver = list => { let sp = 0, p = 0, any = false; for (const r of list) { if (r.purchases == null) continue; sp += r.spend || 0; p += r.purchases; any = true; } return any && p ? sp / p : null; };

/** "Did it help?": CPA (3-day rolling) across the window, the window before it dashed,
 *  and a ▲ under every day something that matters changed. */
function clDrawHelp() {
  const host = $('#clHelp'); if (!host) return;
  const d = clFullDays(); if (!d || !CL.loaded) { host.innerHTML = ''; return; }
  const T = U(), [from, to] = clDates(), { full, roll, cur } = d;
  const lastFull = full.length ? full[full.length - 1].date : to;
  const end = to < lastFull ? to : lastFull;
  let iEnd = -1; full.forEach((r, i) => { if (r.date <= end) iEnd = i; });
  if (iEnd < 1) { host.innerHTML = ''; return; }
  const W = Math.max(14, spanDays(from, to));
  const i0 = Math.max(0, iEnd - W + 1), p0 = Math.max(0, i0 - W);
  const rows = full.slice(i0, iEnd + 1).map((r, k) => ({ date: r.date, v: roll[i0 + k], spend: r.spend, purchases: r.purchases }));
  const prevRows = full.slice(p0, i0).map((r, k) => ({ date: r.date, v: roll[p0 + k] }));
  const byDate = new Map();
  for (const it of clSplit(CL.rows).main) {
    const r = it.lead, t = parseTs(String(r.event_time || '')); if (isNaN(t)) continue;
    const key = ymdLocal(t); if (key < rows[0].date || key > rows[rows.length - 1].date) continue;
    (byDate.get(key) || byDate.set(key, []).get(key)).push(r);
  }
  const changes = [...byDate.entries()].sort((a, b) => a[0] < b[0] ? -1 : 1).slice(-12)
    .map(([date, list]) => ({ date, text: list.length === 1 ? (list[0].summary || clCatLabel(list[0].category)) : `${list.length} changes: ${list.slice(0, 3).map(x => clCatLabel(x.category)).join(', ')}${list.length > 3 ? '…' : ''}` }));
  const c1 = cpaOver(full.slice(i0, iEnd + 1)), c0 = prevRows.length ? cpaOver(full.slice(p0, i0)) : null;
  const find = c1 == null ? 'Triple Whale has not synced purchases for these days yet.'
    : `CPA ${T.money(c1, cur)} over these ${rows.length} days${c0 != null ? ` against ${T.money(c0, cur)} the ${prevRows.length} days before ${T.chip(c1, c0, true, 'Lower is better')}` : ''}. ${changes.length ? `${byDate.size} day${byDate.size === 1 ? '' : 's'} with a change that matters, marked ▲.` : 'No change that matters in these days.'}`;
  CL.helpLine = c1 != null && c0 != null ? ` Over the ${rows.length} full days to ${T.day(rows[rows.length - 1].date)}, CPA ran <b>${T.money(c1, cur)}</b> against ${T.money(c0, cur)} the ${prevRows.length} days before.` : '';
  const sh = $('#clSayHelp'); if (sh) sh.innerHTML = CL.helpLine;
  host.innerHTML = T.card('Did it help?', find,
    T.legend([{ color: '--brand', label: 'Cost per purchase, 3-day rolling' }, { dash: true, label: 'The days before' }]) + T.lineChart('mtClChart', rows, { key: 'v', prev: prevRows, changes, fmt: v => T.money(v, cur), h: 210 }),
    W > spanDays(from, to) ? `Widened to ${rows.length} days so the line has room` : '');
  T.wireLine('mtClChart', rows, { tip: r => {
    const list = byDate.get(r.date) || [];
    return `<b>${T.day(r.date)}</b> · CPA ${T.money(r.v, cur)} <span class="faint">(3 days)</span><br>${T.kmoney(r.spend, cur)} spent, ${r.purchases == null ? 'purchases not synced yet' : `${T.int(r.purchases)} purchase${r.purchases === 1 ? '' : 's'}`}${list.length ? `<br>▲ ${list.slice(0, 3).map(x => esc(clCatLabel(x.category))).join(', ')}${list.length > 3 ? ` and ${list.length - 3} more` : ''}` : ''}`;
  } });
}

/** One day on the timeline: CPA over the 3 full days after it against the 3 before. */
function clDayRead(key) {
  const d = clFullDays(); if (!d || !key) return '';
  const { full, today, cur } = d, T = U();
  if (!full.length || key < full[0].date) return '';
  if (addDay(key, 3) >= (today || ymdLocal(new Date()))) return `<span class="dh"${T.tipAttr('A change needs 3 full days after it before its effect on CPA can be read.')}>Too soon to tell if it helped</span>`;
  const pick = ns => ns.map(n => addDay(key, n)), at = new Set(pick([-3, -2, -1])), after = new Set(pick([1, 2, 3]));
  const b = cpaOver(full.filter(r => at.has(r.date))), a = cpaOver(full.filter(r => after.has(r.date)));
  if (a == null || b == null) return '';
  return `<span class="dh"${T.tipAttr('Cost per purchase over the 3 full days after this day, against the 3 days before it. Other things move CPA too, so read it as a hint, not proof.')}>CPA next 3 days<b>${T.money(a, cur)}</b>against ${T.money(b, cur)} before ${T.chip(a, b, true)}</span>`;
}


/** The one "why" dialog: pick a reason or write one, plus an optional note.
 *  Resolves { reason, note } or null when cancelled. */
function clWhyModal(r) {
  return new Promise(resolve => {
    const start = r.reason || r.suggested_reason || '';
    let pick = CL_REASONS.includes(start) ? start : '';
    const w = document.createElement('div');
    w.className = 'modal-wrap';
    w.innerHTML = `<div class="modal cl2-why">
      <h3>Why was this change made?</h3>
      <p class="hint">${esc(r.summary || r.translated || r.event_type || '')}</p>
      <span class="cl2-wl">Pick a reason</span>
      <div class="cl2-why-chips">${CL_REASONS.map(x => `<button type="button" class="chip ${x === pick ? 'on' : ''}" data-why="${esc(x)}">${esc(x)}</button>`).join('')}</div>
      <label class="cl2-wl" for="clWhyOwn">Or write your own</label>
      <input id="clWhyOwn" type="text" placeholder="e.g. Tracking broke after the site update">
      <label class="cl2-wl" for="clWhyNote">Note for the team (optional)</label>
      <textarea id="clWhyNote" placeholder="e.g. ROAS held 3 days, look again Friday before scaling further"></textarea>
      <p class="hint" style="margin:10px 0 0">The reason is what the client's Daily Brief is written from. Leave both reason boxes empty to clear it.</p>
      <div class="row" style="justify-content:flex-end;gap:8px;margin:14px 0 0">
        <button class="btn" data-m="cancel">Cancel</button>
        <button class="btn primary" data-m="ok">Save</button>
      </div></div>`;
    document.body.appendChild(w);
    const own = w.querySelector('#clWhyOwn'), note = w.querySelector('#clWhyNote');
    own.value = pick ? '' : start;
    note.value = r.note || '';
    const paint = () => w.querySelectorAll('[data-why]').forEach(c => c.classList.toggle('on', c.dataset.why === pick));
    w.querySelectorAll('[data-why]').forEach(c => c.onclick = () => { pick = pick === c.dataset.why ? '' : c.dataset.why; own.value = ''; paint(); });
    own.oninput = () => { if (own.value.trim()) { pick = ''; paint(); } };
    const done = v => { w.remove(); document.removeEventListener('keydown', onKey); resolve(v); };
    const save = () => done({ reason: own.value.trim() || pick, note: note.value.trim() });
    const onKey = e => {
      if (e.key === 'Escape') done(null);
      if (e.key === 'Enter' && (e.target === own || e.ctrlKey || e.metaKey)) save();
    };
    document.addEventListener('keydown', onKey);
    w.addEventListener('mousedown', e => { if (e.target === w) done(null); });
    w.querySelector('[data-m="ok"]').onclick = save;
    w.querySelector('[data-m="cancel"]').onclick = () => done(null);
  });
}

function clSearched() {
  const q = CL.q.trim().toLowerCase();
  return CL.rows.filter(r => !q || [r.summary, r.object_name, r.actor, r.note, r.reason, r.account_name, r.category, clCatLabel(r.category)]
    .some(v => v && String(v).toLowerCase().includes(q)));
}

/** One change. `rel` = how many related changes fold under it (0 for none). */
function clRowHtml(r, rel) {
  const d = parseTs(String(r.event_time || ''));
  const id = esc(r.id), hidden = r.confirmed === -1, open = CL.open.has(r.id), tone = clTone(r.category);
  const why = r.reason
    ? `<span class="cl2-reason"><i>Why</i>${esc(r.reason)}</span><button type="button" class="cl2-link" data-id="${id}" data-do="why">Edit why</button>`
    : (r.suggested_reason
      ? `<span class="cl2-sugg">Suggested: ${esc(r.suggested_reason)}</span><button type="button" class="cl2-btn" data-id="${id}" data-do="ok">Use this reason</button>` : '')
      + `<button type="button" class="cl2-btn go" data-id="${id}" data-do="why">Add why</button>`;
  return `<div class="cl2-row t-${tone || 'n'}${hidden ? ' dim' : ''}" data-row="${id}">
      <div class="cl2-when"><b>${isNaN(d) ? '' : d.toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit'})}</b>${esc(r.actor || '')}${r.manual ? ' · added by hand' : ''}</div>
      <div class="cl2-what">
        ${S.act === 'all' ? `<span class="cl2-client">${esc(r.account_name || '')}</span>` : ''}<span class="v2pill ${tone}">${esc(clCatLabel(r.category))}</span><span>${esc(r.summary || r.translated || r.event_type || '')}</span>
        ${r.note ? `<div class="cl2-note">Note: ${esc(r.note)}</div>` : ''}
        ${rel ? `<div><button type="button" class="cl2-link" data-id="${id}" data-do="rel" aria-expanded="${open}">${open ? 'Close the' : 'and'} ${rel} related change${rel === 1 ? '' : 's'}</button></div>` : ''}
      </div>
      <div class="cl2-acts">${why}<button type="button" class="cl2-link q" data-id="${id}" data-do="no"${U().tipAttr(hidden ? 'Hidden changes are left out of summaries and reports' : 'Noise? Hide it from summaries and reports')}>${hidden ? 'Show again' : 'Hide'}</button></div>
    </div>`;
}
function clItemHtml(it) {
  const rel = it.related;
  return `<div class="cl2-item">${clRowHtml(it.lead, rel.length)}${rel.length
    ? `<div class="cl2-rel" data-rel="${esc(it.lead.id)}" ${CL.open.has(it.lead.id) ? '' : 'hidden'}>${rel.map(r => clRowHtml(r, 0)).join('')}</div>` : ''}</div>`;
}
/** A day heading (with the CPA read when `read`), then that day's changes on a timeline. */
function clDaysHtml(list, rowOf, htmlOf, read) {
  return clByDay(list, rowOf).map(day => `<div class="cl2-day">${esc(day.label)}<span class="c">${day.items.length} change${day.items.length === 1 ? '' : 's'}</span>${read && S.act !== 'all' ? clDayRead(day.key) : ''}</div>
    <div class="cl2-tl">${day.items.map(htmlOf).join('')}</div>`).join('');
}
/** Redraw one row where it stands (after a save, Hide, or opening its related changes). */
function clPatchRow(id) {
  const r = CL.rows.find(x => x.id === id);
  const el = [...document.querySelectorAll('#clFeed [data-row]')].find(x => x.dataset.row === id);
  if (r && el) el.outerHTML = clRowHtml(r, CL.rel.get(id) || 0);
}

function clDrawFeed() {
  const feed = $('#clFeed'); if (!feed) return;
  const rows = clSearched().filter(r => (!CL.type || (r.category || 'other') === CL.type) && (!CL.need || (clMatters(r) && !r.reason)));
  if (!rows.length) {
    feed.innerHTML = `<section class="v2card"><p class="v2hint">${!CL.rows.length ? 'No changes in this period. Pick a longer period above, or press + Add a change for something Meta cannot see.'
      : CL.need ? 'Every change that matters in this period has a reason. Nothing left to explain.'
      : 'Nothing matches your search or filter. Press Changes that matter above to clear them.'}</p></section>`;
    return;
  }
  const { main, rest } = clSplit(rows);
  CL.rel = new Map(main.filter(it => it.related.length).map(it => [it.lead.id, it.related.length]));
  /* Everything else stays closed until asked for, unless a search or a type
     filter would otherwise hide the only matches. */
  const restOpen = CL.restOpen ?? (!!CL.q.trim() || (!!CL.type && !main.length));
  const mainNow = main.slice(0, CL.mainShown), restNow = restOpen ? rest.slice(0, CL.restShown) : [];
  feed.innerHTML = `<section class="v2card cl2-sec">
      <div class="v2h"><h3>Changes that matter</h3><span class="find">Budgets, campaigns and ad sets, bid strategy, targeting, new ads, and anything added by hand. Newest first.</span><span class="cap"><b>${main.length}</b> in this list</span></div>
      ${main.length ? clDaysHtml(mainNow, it => it.lead, clItemHtml, true) : `<p class="v2hint">Nothing in this group for this period.</p>`}
      ${main.length > mainNow.length ? `<button type="button" class="mt-b cl2-more" data-do="more-main">Show 50 more</button>` : ''}
    </section>
    ${rest.length ? `<section class="v2card cl2-sec">
      <button type="button" class="cl2-fold" data-do="rest" aria-expanded="${restOpen}">Everything else (${rest.length})<span>${restOpen ? 'Close' : 'Open'}</span></button>
      <p class="v2hint" style="margin-top:4px">Status updates, renames, billing, single ads switched on or off, and anything you hid. Here for reference.</p>
      ${restOpen ? `<div style="margin-top:6px">${clDaysHtml(restNow, r => r, r => clItemHtml({ lead: r, related: [] }), false)}</div>` : ''}
      ${restOpen && rest.length > restNow.length ? `<button type="button" class="mt-b cl2-more" data-do="more-rest">Show 50 more</button>` : ''}
    </section>` : ''}
    ${CL.truncated ? U().foot('Showing the most recent 2,000 changes. Pick a shorter period to see everything.') : ''}`;
}

function clDrawPanel() {
  const el = $('#clPanel'); if (!el) return;
  if (!CL.panel) { el.innerHTML = ''; return; }
  const [from, to] = clDates();
  const active = S.accounts.filter(metaOn);
  if (CL.panel === 'add') {
    el.innerHTML = `<section class="v2card"><div class="v2h"><h3>Add a change</h3><span class="find">For things Meta’s log can’t see: landing page swaps, promo starts, tracking fixes. It lands in Changes that matter.</span></div>
      <div class="mt-form">
        <select class="mt-in" id="adAct" aria-label="Brand">${active.map(a => `<option value="${a.act_id}" ${a.act_id===S.act?'selected':''}>${esc(a.name)}</option>`).join('')}</select>
        <input class="mt-in" type="datetime-local" id="adTime" aria-label="When" value="${new Date(Date.now()-new Date().getTimezoneOffset()*60e3).toISOString().slice(0,16)}">
        <select class="mt-in" id="adCat" aria-label="Type of change">${CL_ADD_CATS.map(c => `<option value="${c}">${clCatLabel(c)}</option>`).join('')}</select>
      </div>
      <div class="mt-form">
        <input class="mt-in" id="adSum" placeholder="What changed? e.g. Launched 20% off promo on site" aria-label="What changed" style="flex:1;min-width:240px;width:auto">
        <select class="mt-in" id="adWhy" aria-label="Why"><option value="">Why (optional)</option>${CL_REASONS.map(x => `<option>${x}</option>`).join('')}<option value="__custom">Write your own</option></select>
        <button type="button" class="mt-b pri" id="adGo">Save</button>
      </div><p class="mt-hint" id="adMsg"></p></section>`;
    $('#adWhy').onchange = async () => {
      const sel = $('#adWhy');
      if (sel.value !== '__custom') return;
      const v = await modal({
        title: 'Custom reason',
        hint: 'Your own reason for when the list does not fit. It is saved as the why for this change.',
        placeholder: 'Why was this change made?',
      });
      if (v && v.trim()) {
        const o = document.createElement('option'); o.textContent = v.trim();
        sel.insertBefore(o, sel.querySelector('option[value="__custom"]'));
        sel.value = v.trim();
      } else sel.value = '';
    };
    $('#adGo').onclick = async () => {
      const summary = $('#adSum').value.trim();
      if (!summary) return $('#adMsg').textContent = 'Say what changed first.';
      $('#adGo').disabled = true;
      try {
        await api('/api/activities', { method:'POST', body: JSON.stringify({
          act_id: $('#adAct').value, event_time: new Date($('#adTime').value).toISOString(),
          category: $('#adCat').value, summary, reason: $('#adWhy').value || null,
          actor: localStorage.getItem('mobius_session_email') || 'manual',
        }) });
        CL.panel = null; renderChangeLog();
      } catch (e) { $('#adMsg').textContent = e.message; $('#adGo').disabled = false; }
    };
  }
  if (CL.panel === 'sum') {
    const scope = S.act === 'all' ? 'all clients' : (active.find(a => a.act_id === S.act)?.name || 'this client');
    el.innerHTML = `<section class="v2card"><div class="v2h"><h3>Summarise with Claude</h3><span class="find">Writes from the changes and performance for <b>${esc(scope)}</b>, ${prettyDay(from)} to ${prettyDay(to)}. The reasons and notes you added make it noticeably better. Hidden changes are left out.</span></div>
      <div class="mt-form">
        <select class="mt-in" id="sumTpl" aria-label="What to write">
          <option value="daily">Daily standup (internal)</option>
          <option value="weekly">Weekly recap (internal)</option>
          <option value="client">Client-facing update</option>
        </select>
        <button type="button" class="mt-b pri" id="sumGo">Write it</button>
        <span class="mt-lbl" id="sumMsg"></span>
      </div>
      <div id="sumOut"></div></section>`;
    $('#sumGo').onclick = async () => {
      const tpl = $('#sumTpl').value;
      if (tpl === 'client' && S.act === 'all') return $('#sumMsg').textContent = 'Pick one client in the menu for a client-facing update.';
      $('#sumGo').disabled = true; $('#sumMsg').textContent = 'Claude is writing… (about 20 seconds)';
      try {
        const r = await api('/api/summarise', { method:'POST', body: JSON.stringify({ act: S.act, from, to, template: tpl }) });
        $('#sumMsg').textContent = '';
        $('#sumOut').innerHTML = `<div class="sum-out" id="sumTxt">${esc(r.text)}</div>
          <div class="mt-form"><button type="button" class="mt-b" id="sumCopy">Copy</button><span class="mt-lbl">${esc(r.model)}</span></div>`;
        $('#sumCopy').onclick = () => { navigator.clipboard.writeText($('#sumTxt').textContent); $('#sumCopy').textContent = 'Copied'; setTimeout(() => $('#sumCopy').textContent = 'Copy', 1500); };
      } catch (e) { $('#sumMsg').textContent = e.message; }
      $('#sumGo').disabled = false;
    };
  }
}

/* ---------- Today and Last 7 vs 30 days: one page, two views ----------
   "Is today running hot or cold?" and "is the last week better or worse than the
   month?" are the two pace questions a media buyer asks of one account, so they
   share the Today page (tab `mtoday`) as two views. MT.view survives a brand
   switch on the page and resets when you arrive from somewhere else. */
const MT = { view: 'today', keep: false, seq: 0 };
const mtViews = () => `<div class="v2jobs" role="tablist" aria-label="View">${[['today', 'Today, hour by hour'], ['av', 'Last 7 days against the last 30']].map(([k, l]) => `<button type="button" role="tab" data-mtv="${k}" class="${MT.view === k ? 'on' : ''}" aria-selected="${MT.view === k}">${l}</button>`).join('')}</div>`;
function renderTodayPage() { MT.seq++; return MT.view === 'av' ? renderAverages() : renderToday(); }

/* ---------- Averages ---------- */
const AV = { win: localStorage.getItem('ah_av_win') || '90', focus: 'cpa' };
if (!['30', '60', '90', '180'].includes(AV.win)) AV.win = '90';
const AV_METRICS = [
  { k:'spend', label:'Spend/day', name:'spend', num:r=>r.spend, den:()=>1, fmt:(v,c)=>U().kmoney(v,c), lower:false },
  /* Attributed (Triple Whale). A day TW has not synced has null purchases and
     revenue: it adds nothing to either side, so it can never read as zero sales
     and a window with no synced days shows " - ". */
  { k:'roas', label:'ROAS', name:'ROAS', num:r=>r.revenue, den:r=>r.revenue==null?0:r.spend, fmt:v=>fmtX(v), lower:false },
  { k:'cpa', label:'CPA', name:'cost per purchase', num:r=>r.purchases==null?0:r.spend, den:r=>r.purchases??0, fmt:(v,c)=>fmtMoney(v,c), lower:true },
  { k:'ctr', label:'CTR', name:'CTR', num:r=>(r.link_clicks||r.clicks), den:r=>r.impressions, fmt:v=>v==null?' - ':(v*100).toFixed(2)+'%', lower:false },
  { k:'cpm', label:'CPM', name:'CPM', num:r=>r.spend*1000, den:r=>r.impressions, fmt:(v,c)=>fmtMoney(v,c), lower:true },
  { k:'thumbstop', label:'Thumbstop', name:'thumbstop', num:r=>r.video_views, den:r=>r.impressions, fmt:v=>v==null?' - ':(v*100).toFixed(1)+'%', lower:false },
];

/** Trailing k-day moving value at each row index (ratio of sums, so CPA/ROAS are true blends). */
function maSeries(rows, m, k) {
  return rows.map((_, i) => {
    if (i < k - 1) return null;
    let n = 0, d = 0;
    for (let j = i - k + 1; j <= i; j++) { n += m.num(rows[j]) || 0; d += (m.den(rows[j]) ?? 1) || 0; }
    return d ? n / d : null;
  });
}
function lastVal(arr) { for (let i = arr.length - 1; i >= 0; i--) if (arr[i] != null) return arr[i]; return null; }
function avStats(rows, m) {
  const s7 = maSeries(rows, m, 7), s30 = maSeries(rows, m, 30), v7 = lastVal(s7), v30 = lastVal(s30);
  return { s7, s30, v7, v30, d: v7 != null && v30 ? v7 / v30 - 1 : null };
}

const AV_DEFS = {
  spend: 'Ad spend per day, Meta-reported.',
  roas: 'Revenue divided by spend. Revenue is Triple Whale attribution (last platform click), spend is Meta. Higher is better.',
  cpa: 'Spend divided by purchases: what one purchase costs. Purchases are Triple Whale attribution (last platform click). Lower is better.',
  ctr: 'Link clicks divided by impressions: are people clicking the ads. Higher is better.',
  cpm: 'Cost per 1,000 impressions: what Meta charges for attention. Lower is better.',
  thumbstop: '3-second video views divided by impressions: how often people stop scrolling. Higher is better.',
};

/** The last 7 days against the last 30, in plain words. */
function weekLabel(d730, lower) {
  if (d730 == null) return { t: 'not enough history yet', cls: 'unk' };
  if (Math.abs(d730) < 0.05) return { t: 'normal', cls: 'unk' };
  return (lower ? d730 < 0 : d730 > 0) ? { t: 'better than normal', cls: 'good' } : { t: 'worse than normal', cls: 'bad' };
}
const spendWord = d => d == null ? 'not enough history' : Math.abs(d) < 0.05 ? 'about normal' : d > 0 ? 'more than normal' : 'less than normal';
const andList = a => a.length <= 1 ? a.join('') : a.slice(0, -1).join(', ') + ' and ' + a[a.length - 1];

/** The verdict sentence: what is better and worse than normal; spend said plainly, never judged. */
function avVerdict(full) {
  const better = [], worse = []; let spend = '';
  for (const m of AV_METRICS) {
    const st = avStats(full, m);
    if (m.k === 'spend') { spend = st.d == null ? '' : Math.abs(st.d) < 0.05 ? ' Spend per day is about normal.' : ` Spending ${Math.abs(Math.round(st.d * 100))}% ${st.d > 0 ? 'more' : 'less'} a day than normal.`; continue; }
    const w = weekLabel(st.d, m.lower);
    if (w.cls === 'good') better.push(m.name); else if (w.cls === 'bad') worse.push(m.name);
  }
  if (worse.length && better.length) return `<b>A mixed week.</b> Better than normal on ${andList(better)}; <b class="bad">worse on ${andList(worse)}</b>.${spend}`;
  if (worse.length) return `<b class="bad">Worse than normal</b> on ${andList(worse)}.${spend}`;
  if (better.length) return `<b class="good">Better than normal</b> on ${andList(better)}, and nothing worse.${spend}`;
  return `<b>A normal week.</b> Nothing moved more than 5% against the last 30 days.${spend}`;
}

async function renderAverages() {
  const act = S.act, ticket = S.run, vseq = MT.seq;
  const live = () => hostRun() === ticket && S.act === act && MT.seq === vseq && !!$('#avBody');
  const one = act !== 'all' ? acctOf(act) : null, T = U();
  $('#main').innerHTML = mtPage('mtoday', one ? `Last 7 days against the last 30: ${esc(one.name)}` : 'Last 7 days against the last 30', 'averages', `
    ${mtViews()}
    <p class="v2say lead" id="avSay"><span class="mt-sk"></span></p>
    ${setupNote()}
    <div id="avBody" class="mt-stack"><section class="v2card"><p class="v2hint">Loading the daily numbers…</p></section></div>
    ${T.foot('Spend and delivery are Meta’s. ROAS and CPA are Triple Whale attribution (last platform click), the same as the briefs. Every window ends yesterday, and the last 3 days of sales are still settling. Ignore moves under about 5%.')}`);
  if (!one) return avAll(S.accounts.filter(metaOn), live);
  if (!hasMeta(one)) { $('#avSay').textContent = noMetaText(one); $('#avBody').innerHTML = ''; return; }
  if (!one.active) { $('#avSay').textContent = `${one.name} has no Meta account switched on, so there is nothing to compare yet. Turn it on in Settings.`; $('#avBody').innerHTML = ''; return; }
  let s;
  try { s = await api(`/api/series?act=${encodeURIComponent(act)}&days=${+AV.win + 32}`); }
  catch (e) { if (!live()) return; $('#avSay').textContent = 'The daily numbers did not load.'; $('#avBody').innerHTML = `<section class="v2card"><p class="v2bad">${esc(e.message)}</p></section>`; return; }
  if (!live()) return;
  const today = s.account && s.account.today;
  const full = (s.rows || []).filter(r => !today || r.date < today);          // full days only
  const rows = full.slice(-(+AV.win));
  AV.cur = { rows, full, events: s.events || [], todayRow: (s.rows || []).find(r => r.date === today) || null,
    account: s.account || { currency: one.currency } };
  if (rows.length < 7) { $('#avSay').textContent = 'Not enough history yet: this needs at least a week of data.'; $('#avBody').innerHTML = ''; return; }
  $('#avSay').innerHTML = avVerdict(full);
  avPaint();
}

/** One brand: six tiles (press one for its chart), the chart with changes marked,
 *  "is anything breaking right now?" and the windows in numbers. */
function avPaint() {
  const d = AV.cur, host = $('#avBody'); if (!d || !host) return;
  const T = U(), cur = d.account.currency || 'USD', n = d.rows.length, off = d.full.length - n;
  const lw = m => m.k === 'spend' ? 'n' : m.lower;
  const tiles = AV_METRICS.map(m => {
    const st = avStats(d.full, m), s7 = st.s7.slice(off), s30 = st.s30.slice(off);
    const w = m.k === 'spend' ? { t: spendWord(st.d), cls: '' } : weekLabel(st.d, m.lower);
    const tips = d.rows.map((r, i) => `<b>${T.day(r.date)}</b> · 7-day ${m.fmt(s7[i], cur)} · 30-day ${m.fmt(s30[i], cur)}`);
    return pickTile(`data-avm="${m.k}" aria-pressed="${AV.focus === m.k}"`, AV.focus === m.k, T.tile({ compact: true, label: m.label, value: m.fmt(st.v7, cur),
      delta: T.chip(st.v7, st.v30, lw(m), 'The last 7 days against the last 30'),
      sub: `<span class="v2pill ${w.cls === 'good' || w.cls === 'bad' ? w.cls : ''}">${w.t}</span> 30-day ${m.fmt(st.v30, cur)}`,
      spark: T.spark(s7, s30, 300, 34, tips) }));
  }).join('');

  /* The chart for the pressed tile, with the changes that matter marked under their days. */
  const m = AV_METRICS.find(x => x.k === AV.focus) || AV_METRICS[2];
  const st = avStats(d.full, m), s7 = st.s7.slice(off), s30 = st.s30.slice(off);
  const daily = d.rows.map(r => { const den = (m.den(r) ?? 1) || 0; return den ? (m.num(r) || 0) / den : null; });
  const first = d.rows[0].date, last = d.rows[n - 1].date;
  const evIn = (d.events || []).filter(ev => { const k = String(ev.event_time).slice(0, 10); return k >= first && k <= last && ev.confirmed !== -1 && (ev.manual || CL_MATTER.has(ev.category)); });
  const evBy = new Map();
  for (const ev of evIn) { const k = String(ev.event_time).slice(0, 10); (evBy.get(k) || evBy.set(k, []).get(k)).push(ev); }
  const clip = x => { x = String(x || ''); return x.length > 80 ? x.slice(0, 80) + '…' : x; };
  const changes = [...evBy.entries()].sort((a, b) => a[0] < b[0] ? -1 : 1).slice(-12)
    .map(([date, l]) => ({ date, text: l.length === 1 ? clip(l[0].summary || clCatLabel(l[0].category)) : `${l.length} changes` }));
  const chartRows = d.rows.map((r, i) => ({ date: r.date, v: s7[i], m30: s30[i], day: daily[i] }));
  const span = Math.max(1, (Date.parse(last) - Date.parse(first)) / 864e5);
  const dots = evIn.map(ev => {
    const k = String(ev.event_time).slice(0, 10), x = (Date.parse(k) - Date.parse(first)) / 864e5 / span * 100;
    return `<i class="t-${clTone(ev.category) || 'n'}" style="left:${x.toFixed(2)}%"${T.tipAttr(`<b>${T.day(k)}</b> · ${esc(clCatLabel(ev.category))}<br>${esc(clip(ev.summary || ''))}${ev.reason ? `<br><span class="faint">Why: ${esc(ev.reason)}</span>` : ''}`)}></i>`;
  }).join('');
  const focus = T.card(`${m.label}, day by day`, esc(AV_DEFS[m.k]),
    T.legend([{ color: '--brand', label: '7-day average' }, { dash: true, label: '30-day average, this account’s normal' }])
    + T.lineChart('mtAvChart', chartRows, { key: 'v', prev: s30.map(v => ({ v })), changes, fmt: v => m.fmt(v, cur), h: 230 })
    + (evIn.length ? `<div class="mt-sub"><h4>Every change that matters in these ${n} days (${evIn.length})</h4><p>Hover a dot for what changed. Amber is a budget or bid, red a pause, green a launch.</p><div class="mt-strip">${dots}</div><div class="mt-strip-ax"><span>${T.day(first)}</span><span>${T.day(last)}</span></div></div>` : ''),
    `Press a tile above to switch · ▲ = a change that matters`);

  /* Is anything breaking right now? Today, yesterday and the 3-day against the 7-day. */
  const stat = (mm, list) => { let a = 0, b = 0; list.forEach(r => { a += mm.num(r) || 0; b += (mm.den(r) ?? 1) || 0; }); return b ? a / b : null; };
  const win = k => d.full.slice(-k);
  let worst = null;
  const mom = AV_METRICS.map(mm => {
    const t = d.todayRow ? stat(mm, [d.todayRow]) : null, y = stat(mm, win(1)), d3 = stat(mm, win(3)), d7 = stat(mm, win(7));
    if (mm.k !== 'spend' && y != null && d7) { const dv = y / d7 - 1, bad = mm.lower ? dv > 0.15 : dv < -0.15; if (bad && (!worst || Math.abs(dv) > Math.abs(worst.dv))) worst = { mm, dv }; }
    return `<tr><td>${mm.label}</td><td>${mm.fmt(t, cur)}</td><td>${mm.fmt(y, cur)}${T.chip(y, d7, lw(mm), 'Yesterday against the 7-day average')}</td><td>${mm.fmt(d3, cur)}${T.chip(d3, d7, lw(mm), 'The last 3 days against the 7-day average')}</td><td>${mm.fmt(d7, cur)}</td></tr>`;
  }).join('');
  const momFind = worst ? `Yesterday’s ${worst.mm.name} was ${Math.abs(Math.round(worst.dv * 100))}% ${worst.dv > 0 ? 'above' : 'below'} the 7-day average. <button type="button" class="v2link" data-msub="changelog">See what changed ›</button>`
    : 'Nothing yesterday is more than 15% the wrong side of the 7-day average.';
  const momentum = T.card('Is anything breaking right now?', momFind,
    `<div class="v2tbl"><table><thead><tr><th>Metric</th><th>Today so far</th><th>Yesterday</th><th>Last 3 days</th><th>Last 7 days</th></tr></thead><tbody>${mom}</tbody></table></div>
     <p class="mt-hint">Arrows compare with the 7-day average. Today is a partial day and sales keep landing for about 72 hours, so read its column as an early signal only.</p>`);

  /* Each window against the same number of days right before it. */
  const cell = (mm, k) => { const c = stat(mm, d.full.slice(-k)), p = stat(mm, d.full.slice(-2 * k, -k)); return `<td>${mm.fmt(c, cur)}${T.chip(c, p, lw(mm), `Against the ${k} days before`)}<span class="sub">was ${mm.fmt(p, cur)}</span></td>`; };
  const numbers = T.card('The windows, in numbers', 'Each window against the same number of days right before it. Windows end yesterday.',
    `<div class="v2tbl"><table><thead><tr><th>Metric</th><th>3 days</th><th>7 days</th><th>14 days</th><th>30 days</th></tr></thead><tbody>${AV_METRICS.map(mm => `<tr><td>${mm.label}</td>${[3, 7, 14, 30].map(k => cell(mm, k)).join('')}</tr>`).join('')}</tbody></table></div>`);

  host.innerHTML = `<div class="mt-bar"><span class="mt-lbl">Chart history</span><div class="v2jobs">${['30', '60', '90', '180'].map(w => `<button type="button" data-avw="${w}" class="${AV.win === w ? 'on' : ''}">${w} days</button>`).join('')}</div></div>
    <div class="v2tiles six">${tiles}</div>${focus}${momentum}${numbers}`;
  T.wireLine('mtAvChart', chartRows, { tip: r => {
    const l = evBy.get(r.date) || [];
    return `<b>${T.day(r.date)}</b><br>7-day average <b>${m.fmt(r.v, cur)}</b><br><span class="faint">30-day ${m.fmt(r.m30, cur)} · that day ${m.fmt(r.day, cur)}</span>${l.slice(0, 2).map(ev => `<br>▲ ${esc(clip(ev.summary || clCatLabel(ev.category)))}`).join('')}${l.length > 2 ? `<br>and ${l.length - 2} more` : ''}`;
  } });
  host.querySelectorAll('[data-avm]').forEach(el => {
    const go = () => { AV.focus = el.dataset.avm; const y = window.scrollY; avPaint(); window.scrollTo(0, y); };
    el.onclick = go; el.onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } };
  });
  host.querySelectorAll('[data-avw]').forEach(b => b.onclick = () => {
    if (AV.win === b.dataset.avw) return;
    AV.win = b.dataset.avw; try { localStorage.setItem('ah_av_win', AV.win); } catch { /* private mode */ }
    MT.seq++; renderAverages();
  });
}

/** Every brand: the last 7 days against the last 30, one row each. */
async function avAll(active, live) {
  const T = U();
  if (!active.length) { $('#avSay').textContent = 'No Meta accounts are switched on yet.'; $('#avBody').innerHTML = ''; return; }
  const res = new Map();
  const paint = () => {
    if (!live()) return;
    const done = active.filter(a => res.has(a.act_id)).length;
    const worseCpa = [], worseRoas = [];
    const rows = active.map(a => {
      const r = res.get(a.act_id);
      if (!r) return `<tr><td><b>${esc(a.name)}</b></td><td colspan="6" class="faint">Reading…</td></tr>`;
      if (r.err) return `<tr><td><b>${esc(a.name)}</b></td>${errTd(r.err, 6)}</tr>`;
      if (r.full.length < 7) return `<tr><td><b>${esc(a.name)}</b></td><td colspan="6" class="faint">Not enough history yet</td></tr>`;
      return `<tr class="link" tabindex="0" data-pick="${esc(a.act_id)}"><td><b>${esc(a.name)}</b></td>${AV_METRICS.map(m => {
        const st = avStats(r.full, m);
        if (m.k === 'cpa' && weekLabel(st.d, true).cls === 'bad') worseCpa.push(a.name);
        if (m.k === 'roas' && weekLabel(st.d, false).cls === 'bad') worseRoas.push(a.name);
        return `<td>${m.fmt(st.v7, r.cur)}${T.chip(st.v7, st.v30, m.k === 'spend' ? 'n' : m.lower, `${esc(a.name)}: the last 7 days against the last 30 (${m.fmt(st.v30, r.cur)})`)}</td>`;
      }).join('')}</tr>`;
    }).join('');
    $('#avSay').innerHTML = done < active.length ? `Reading the last 30 days for ${active.length} brands…`
      : !worseCpa.length && !worseRoas.length ? `<b class="good">No brand is worse than normal</b> on cost per purchase or ROAS this week. Press a brand for its own page.`
      : `${worseCpa.length ? `<b class="bad">Cost per purchase is worse than normal at ${worseCpa.length} of ${active.length} brands</b>: ${esc(andList(worseCpa))}.` : ''}${worseRoas.length ? ` ROAS is worse than normal at ${esc(andList(worseRoas))}.` : ''} Press a brand for its own page.`;
    $('#avBody').innerHTML = T.card('Every brand, the last 7 days against the last 30', 'Each number is the 7-day average; the arrow compares it with the brand’s own last 30 days.',
      `<div class="v2tbl"><table><thead><tr><th>Brand</th>${AV_METRICS.map(m => `<th>${m.label}</th>`).join('')}</tr></thead><tbody>${rows}</tbody></table></div>`, `${done} of ${active.length} read`);
    $('#avBody').querySelectorAll('tr[data-pick]').forEach(tr => { tr.onclick = () => pickBrand(tr.dataset.pick); tr.onkeydown = e => { if (e.key === 'Enter') pickBrand(tr.dataset.pick); }; });
  };
  paint();
  await pool(active, 3, async a => {
    try {
      const s = await api(`/api/series?act=${encodeURIComponent(a.act_id)}&days=45`);
      const today = s.account && s.account.today;
      res.set(a.act_id, { full: (s.rows || []).filter(r => !today || r.date < today), cur: (s.account && s.account.currency) || a.currency });
    } catch (e) { res.set(a.act_id, { err: e.message }); }
    paint();
  });
}

/* ---------- Today (live intraday) ----------
   The one question Plan cannot answer: is the account delivering right now?
   Spend comes live from Meta per hour; there is deliberately no projection of
   where the day lands (the daily budget is something you set). */
/** How far through a NORMAL day this account usually is by now: the share of a
 *  normal day's spend done by this hour. At 9am it is often under 15%, and a
 *  swing on that little elapsed day is noise, so it gates the verdict. */
const dayShare = p => (p && p.l7_by_now && p.l7_daily_avg) ? p.l7_by_now / p.l7_daily_avg : null;

function paceRead(p) {
  const v = p.vs_pace, share = dayShare(p);
  if (p.spent === 0 && p.l7_by_now >= 25) return { word: 'Not spending', tone: 'bad', key: 'stop' };
  if (v == null) return { word: 'Nothing to compare yet', tone: '', key: 'none' };
  if (share != null && share < 0.1) return { word: 'Too early to tell', tone: '', key: 'early' };
  if (v < -0.5) return { word: 'Barely spending', tone: 'bad', key: 'barely' };
  if (v < -0.1) return { word: 'Running cold', tone: 'warn', key: 'cold' };
  if (v > 0.1) return { word: 'Running hot', tone: 'warn', key: 'hot' };
  return { word: 'On pace', tone: 'good', key: 'ok' };
}
const PACE_DO = {
  stop: 'Check Ads Manager now: billing, rejected ads or paused campaigns.',
  barely: 'Check Ads Manager for paused or rejected ads, a billing hold or a learning reset before you touch budgets.',
  cold: 'Delivery is slow. Look for paused ads or a tight cost cap before raising any budget.',
  hot: 'Check nothing was raised by mistake. If cost per purchase holds, let it run.',
  ok: 'Leave the budgets alone.',
  early: 'Look again in a few hours.',
  none: 'There is no normal day to compare with yet.',
};
const paceText = v => v == null ? '' : Math.abs(v) < 0.005 ? 'level with normal' : `${Math.abs(Math.round(v * 100))}% ${v > 0 ? 'over' : 'under'}`;

/** Purchases so far today against a normal day by this hour. Triple Whale when it has
 *  synced today, else Meta's own count, labelled; a normal day uses the same source. */
function buyRead(s, p) {
  if (!s || !Array.isArray(s.rows)) return null;
  const today = s.account && s.account.today, row = s.rows.find(r => r.date === today);
  if (!row) return null;
  const past = s.rows.filter(r => r.date < today).slice(-7);
  const tw = row.purchases != null;
  const key = tw ? 'purchases' : 'meta_purchases';
  const got = past.map(r => r[key]).filter(v => v != null);
  const val = row[key]; if (val == null) return null;
  const normal = got.length ? got.reduce((a, b) => a + b, 0) / got.length : null, share = dayShare(p);
  return { val, tw, normal, byNow: normal != null && share != null ? normal * share : null };
}

/** Cumulative spend by hour: today solid, a normal day dashed, "now" marked. */
function hourChart(id, p, cur) {
  const T = U(), w = 760, h = 230, pl = 48, pr = 16, pt = 18, pb = 26;
  const td = p.today_cum || [], nm = p.l7_cum || [];
  const mx = Math.max(1, ...td.filter(v => v != null), ...nm.filter(v => v != null)) * 1.1;
  const X = i => pl + i / 23 * (w - pl - pr), Y = v => pt + (1 - v / mx) * (h - pt - pb);
  const line = a => a.map((v, i) => v == null ? null : `${X(i).toFixed(1)},${Y(v).toFixed(1)}`).filter(Boolean).join(' ');
  const grid = [0.25, 0.5, 0.75, 1].map(f => `<line x1="${pl}" x2="${w - pr}" y1="${Y(mx * f).toFixed(1)}" y2="${Y(mx * f).toFixed(1)}" stroke="var(--v2-grid)"/><text x="${pl - 6}" y="${(Y(mx * f) + 4).toFixed(1)}" font-size="10" text-anchor="end" fill="var(--muted)">${T.kmoney(mx * f, cur)}</text>`).join('');
  const ticks = [2, 5, 8, 11, 14, 17, 20, 23].map(i => `<text x="${X(i).toFixed(1)}" y="${h - 8}" font-size="10" text-anchor="middle" fill="var(--muted)">${hourName(i + 1)}</text>`).join('');
  const last = td.length - 1, nowX = X(Math.max(0, last)).toFixed(1);
  const area = last >= 1 ? `<polygon points="${X(0).toFixed(1)},${Y(0).toFixed(1)} ${line(td)} ${X(last).toFixed(1)},${Y(0).toFixed(1)}" fill="var(--brand)" opacity=".1"/>` : '';
  return `<div class="v2chart"><svg id="${id}" viewBox="0 0 ${w} ${h}" role="img" aria-label="Spend so far by hour, today against a normal day">${grid}${ticks}
    <line x1="${nowX}" x2="${nowX}" y1="${pt}" y2="${h - pb}" stroke="var(--faint)" stroke-dasharray="2 3"/><text x="${nowX}" y="${pt - 6}" font-size="10" text-anchor="middle" fill="var(--muted)">now</text>
    <polyline points="${line(nm)}" fill="none" stroke="var(--v2-cmp)" stroke-width="1.6" stroke-dasharray="4 4"/>
    ${area}<polyline points="${line(td)}" fill="none" stroke="var(--brand)" stroke-width="2.2" stroke-linejoin="round"/>
    ${last >= 0 && td[last] != null ? `<circle cx="${X(last).toFixed(1)}" cy="${Y(td[last]).toFixed(1)}" r="3.5" fill="var(--brand)"/>` : ''}
    <line class="fx-guide" x1="0" x2="0" y1="${pt}" y2="${h - pb}" stroke="var(--ink)" opacity="0"/></svg><div class="v2tip"></div></div>`;
}
/** Each hour on its own: today's bar, a tick for a normal hour. */
function hourBars(p, cur) {
  const T = U(), td = p.today_cum || [], nm = p.l7_cum || [];
  const per = (a, i) => a[i] == null ? null : a[i] - (i ? (a[i - 1] || 0) : 0);
  const vals = Array.from({ length: 24 }, (_, i) => [per(td, i), per(nm, i)]);
  const mx = Math.max(1, ...vals.flat().filter(v => v != null));
  return `<div class="mt-hb">${vals.map(([t, l], i) => {
    const cls = t == null || !l ? '' : t > l * 1.25 ? 'hi' : t < l * 0.75 ? 'lo' : '';
    return `<div class="b"${T.tipAttr(`<b>${hourName(i)} to ${hourName(i + 1)}</b><br>${t == null ? 'Not yet today' : `Today ${T.money2(t, cur)}`}<br><span class="faint">A normal day ${T.money2(l, cur)}</span>`)}><div class="col">${t != null ? `<i class="${cls}" style="height:${Math.max(1, t / mx * 100).toFixed(1)}%"></i>` : ''}${l != null ? `<b style="bottom:${(l / mx * 100).toFixed(1)}%"></b>` : ''}</div><span class="l">${i % 3 === 0 ? hourName(i) : ''}</span></div>`;
  }).join('')}</div>`;
}

async function renderToday() {
  const act = S.act, ticket = S.run, vseq = MT.seq;
  const live = () => hostRun() === ticket && S.act === act && MT.seq === vseq && !!$('#mtToday');
  const one = act !== 'all' ? acctOf(act) : null, T = U();
  $('#main').innerHTML = mtPage('mtoday', one ? `Today: ${esc(one.name)}` : 'Today, every brand', 'today', `
    ${mtViews()}
    <p class="v2say lead" id="tdSay"><span class="mt-sk"></span></p>
    ${setupNote()}
    <div id="mtToday" class="mt-stack"><section class="v2card"><p class="v2hint">${one ? 'Pulling today’s hourly spend from Meta…' : 'Loading…'}</p></section></div>
    ${T.foot('Spend is Meta’s and matches Ads Manager, pulled live on every visit. A normal day is the average of the last 7 days by the same hour. Meta reports today with a small lag, so treat the newest hour as approximate. Purchases are Triple Whale once it has synced today, Meta’s own count until then.')}`);
  if (!one) return todayAll(live);
  if (!hasMeta(one)) { $('#tdSay').textContent = noMetaText(one); $('#mtToday').innerHTML = ''; return; }
  if (!one.active) { $('#tdSay').textContent = `${one.name} has no Meta account switched on, so there is nothing to pace yet. Turn it on in Settings.`; $('#mtToday').innerHTML = ''; return; }
  const st = { p: null, s: null, err: '' };
  const paint = () => {
    if (!live()) return;
    const p = st.p;
    if (!p) {
      $('#tdSay').textContent = 'Today’s hourly spend did not load.';
      $('#mtToday').innerHTML = `<section class="v2card"><p class="v2bad">No answer from Meta: ${esc(st.err || 'unknown error')}</p><button type="button" class="mt-b" id="tdRetry" style="margin-top:10px">Try again</button></section>`;
      $('#tdRetry').onclick = () => { $('#tdRetry').disabled = true; load(); };
      return;
    }
    const cur = (p.account && p.account.currency) || one.currency || 'USD', rd = paceRead(p), share = dayShare(p), buy = buyRead(st.s, p);
    const tz = String((p.account && p.account.tz) || '').split('/').pop().replace(/_/g, ' ');
    const through = `${hourName(Math.max(1, +p.hour || 0))}${tz ? `, ${tz} time` : ''}`;
    const buyLine = buy && buy.tw ? ` Buying: <b>${T.int(buy.val)}</b> purchase${buy.val === 1 ? '' : 's'} so far${buy.tw ? '' : ' by Meta’s own count'}${buy.byNow != null ? `, about ${Math.round(buy.byNow)} is normal by now` : ''}.` : '';
    $('#tdSay').innerHTML = rd.key === 'none' || rd.key === 'stop'
      ? `<b class="${rd.tone}">${rd.word}.</b> ${PACE_DO[rd.key]}${buyLine}`
      : `<b class="${rd.tone}">${rd.word}.</b> ${T.kmoney(p.spent, cur)} spent by ${hourName(+p.hour || 0)} against a normal ${T.kmoney(p.l7_by_now, cur)} by this hour (${paceText(p.vs_pace)}). ${PACE_DO[rd.key]}${buyLine}`;
    const tiles = [
      T.tile({ compact: true, label: 'Spend so far', src: 'META', value: T.kmoney(p.spent, cur), delta: T.chip(p.spent, p.l7_by_now, 'n', 'Against a normal day by this hour'), sub: `Normal by now: ${T.kmoney(p.l7_by_now, cur)}. Through ${esc(through)}.` }),
      T.tile({ compact: true, label: 'Day done', value: share == null ? '–' : T.pct(share, 0), sub: share == null ? 'No normal day to measure against yet' : `of a normal day’s spend is usually done by ${hourName(+p.hour || 0)}${share < 0.15 ? '. A swing this early is mostly noise' : ''}` }),
      T.tile({ compact: true, label: 'A normal day ends near', value: T.kmoney(p.l7_daily_avg, cur), sub: 'The last 7 days’ average. Today’s budgets decide where it lands.' }),
      /* Triple Whale numbers only (Cole's standing rule): until TW has synced today the tile waits rather than showing Meta's count. */
      buy && buy.tw ? T.tile({ compact: true, label: 'Purchases today', src: 'TW', value: T.int(buy.val), delta: buy.byNow != null && Math.abs(buy.val - buy.byNow) >= 1 ? T.chip(buy.val, buy.byNow, false, 'Against a normal day by this hour') : '', sub: `${buy.tw ? '' : 'Triple Whale has not synced today yet. '}A normal day: ${buy.normal == null ? '–' : buy.normal.toFixed(1)}` })
        : T.tile({ compact: true, label: 'Purchases today', src: 'TW', value: '–', sub: st.sBusy ? 'Reading today’s purchases…' : 'Triple Whale has not credited today’s purchases yet' }),
    ].join('');
    const pulled = p.pulled_at ? new Date(p.pulled_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : '';
    const find = p.vs_pace == null ? 'No normal day to compare with yet.' : `Today is ${paceText(p.vs_pace)} a normal day by ${hourName(+p.hour || 0)}.`;
    $('#mtToday').innerHTML = `<div class="v2tiles">${tiles}</div>
      ${T.card('Spend so far, hour by hour', find, `${T.legend([{ color: '--brand', label: 'Today, added up hour by hour' }, { dash: true, label: 'A normal day (average of the last 7)' }])}${hourChart('mtHour', p, cur)}${st.err ? `<p class="mt-hint" style="color:var(--bad)">Refresh did not work: ${esc(st.err)}. These are the earlier numbers.</p>` : ''}`,
        `${pulled ? `pulled ${pulled} · ` : ''}<button type="button" class="v2link" id="tdRefresh">Refresh</button>`)}
      ${T.card('Each hour on its own', 'Which hours ran hot or cold. Amber is 25% or more over a normal hour, grey 25% or more under; the tick is a normal hour.', hourBars(p, cur))}
      <div class="v2gos">
        <button type="button" class="v2go" data-mtv="av"><b>Last 7 days against the last 30</b><span>Is the last week better or worse than this account’s own normal?</span><i>›</i></button>
        <button type="button" class="v2go" data-mtgo="changes-today"><b>What changed today</b><span>Budgets, launches and pauses so far today, with the reason next to each.</span><i>›</i></button>
        <button type="button" class="v2go" data-go="campaigns"><b>Campaigns</b><span>Which campaign is carrying the spend, with its cost per purchase.</span><i>›</i></button>
      </div>`;
    chartTip(document.getElementById('mtHour'), 760, vx => Math.max(0, Math.min(23, Math.round((vx - 48) / (760 - 64) * 23))), i => 48 + i / 23 * (760 - 64), i => {
      const t = p.today_cum[i], l = p.l7_cum[i];
      return `<b>By ${hourName(i + 1)}</b><br>Today ${t == null ? 'not yet' : `<b>${T.kmoney(t, cur)}</b>${l ? ` (${paceText(t / l - 1)})` : ''}`}<br><span class="faint">A normal day ${T.kmoney(l, cur)}</span>`;
    });
    $('#tdRefresh').onclick = () => { const b = $('#tdRefresh'); b.disabled = true; b.textContent = 'Pulling…'; $('#mtToday').style.opacity = '.6'; load(); };
  };
  function load() {
    st.sBusy = true;
    return Promise.all([
      api('/api/pacing?act=' + encodeURIComponent(act)).then(p => { st.p = p; st.err = ''; }, e => { st.err = e.message; }),
      api(`/api/series?act=${encodeURIComponent(act)}&days=9`).then(s => { st.s = s; }, () => {}),
    ]).then(() => { st.sBusy = false; if (!live()) return; const m = $('#mtToday'); if (m) m.style.opacity = ''; paint(); });
  }
  await load();
}

/** Every brand at once: who is running hot or cold right now. */
async function todayAll(live) {
  const T = U(), active = S.accounts.filter(metaOn);
  if (!active.length) { $('#tdSay').textContent = 'No Meta accounts are switched on yet.'; $('#mtToday').innerHTML = ''; return; }
  const res = new Map();
  const paint = () => {
    if (!live()) return;
    const ok = active.map(a => [a, res.get(a.act_id)]).filter(([, p]) => p && !p.err);
    const mx = Math.max(1, ...ok.map(([, p]) => p.spent || 0));
    const rows = active.map(a => {
      const p = res.get(a.act_id);
      if (!p) return `<tr><td><b>${esc(a.name)}</b></td><td colspan="5" class="faint">Pulling from Meta…</td></tr>`;
      if (p.err) return `<tr><td><b>${esc(a.name)}</b></td>${errTd(p.err, 5)}</tr>`;
      const cur = (p.account && p.account.currency) || a.currency, rd = paceRead(p), share = dayShare(p);
      return `<tr class="link" tabindex="0" data-pick="${esc(a.act_id)}"><td><b>${esc(a.name)}</b></td>
        <td>${T.ib(p.spent || 0, mx, '--c-meta', T.kmoney(p.spent, cur), `${esc(a.name)} has spent ${T.money(p.spent, cur)} today`)}</td>
        <td>${T.kmoney(p.l7_by_now, cur)}</td>
        <td><span class="v2pill ${rd.tone}">${rd.word}</span>${p.vs_pace != null ? T.chip(p.spent, p.l7_by_now, 'n', 'Against a normal day by this hour') : ''}</td>
        <td>${share == null ? '–' : T.pct(share, 0)}</td><td>${T.kmoney(p.l7_daily_avg, cur)}</td></tr>`;
    }).join('');
    const done = res.size, reads = ok.map(([a, p]) => [a, paceRead(p), p]);
    const off = reads.filter(([, r]) => ['cold', 'barely', 'stop', 'hot'].includes(r.key));
    const onp = reads.filter(([, r]) => r.key === 'ok').length;
    $('#tdSay').innerHTML = done < active.length ? `Pulling today’s spend for ${active.length} brands from Meta…`
      : !off.length ? `<b class="good">Every brand is on pace or too early to call.</b> ${onp} of ${active.length} are on a normal day’s line. Nothing to touch.`
      : `<b>${onp} of ${active.length} brands are on pace.</b> ${off.map(([a, r, p]) => `<b class="${r.tone}">${esc(a.name)}</b> is ${r.word.toLowerCase()}${p.vs_pace != null && r.key !== 'stop' ? ` (${paceText(p.vs_pace)})` : ''}`).join('; ')}. Press a brand for its hour-by-hour curve.`;
    $('#mtToday').innerHTML = T.card('Every brand, today so far', 'Spend so far against a normal day by the same hour. Press a brand for its curve.',
      `<div class="v2tbl"><table><thead><tr><th>Brand</th><th>Spent so far</th><th>Normal by now</th><th>Against normal</th><th>Day done</th><th>A normal day</th></tr></thead><tbody>${rows}</tbody></table></div>`, `${done} of ${active.length} pulled live`);
    $('#mtToday').querySelectorAll('tr[data-pick]').forEach(tr => { tr.onclick = () => pickBrand(tr.dataset.pick); tr.onkeydown = e => { if (e.key === 'Enter') pickBrand(tr.dataset.pick); }; });
  };
  paint();
  await pool(active, 3, async a => {
    try { res.set(a.act_id, await api('/api/pacing?act=' + encodeURIComponent(a.act_id))); }
    catch (e) { res.set(a.act_id, { err: e.message }); }     // one client failing must not blank the table
    paint();
  });
}

/* ---------- Creative browser ---------- */
const CR = { fresh: localStorage.getItem('ah_cr_fresh') || '14', win: localStorage.getItem('ah_cr_win') || '14' };
/* Ad age bands, newest first; the newest is the strongest green and sits at the bottom of each bar. */
const CR_FILL = [['--good', 1], ['--good', 0.68], ['--good', 0.42], ['--good', 0.2], ['--line-strong', 1]];
const CR_LABELS = ['0 to 7 days', '8 to 14 days', '15 to 30 days', '31 to 60 days', 'over 60 days'];
const crSw = bi => `<span class="mt-sw" style="background:var(${CR_FILL[bi][0]});opacity:${CR_FILL[bi][1]}"></span>`;

function crBars(weekly) {
  const T = U(), w = 900, h = 180, padL = 34, n = weekly.length; if (!n) return '';
  const bw = (w - padL) / n, base = h - 24, bh = base - 12;
  let out = [0.5, 1].map(f => `<line x1="${padL}" x2="${w}" y1="${(base - f * bh).toFixed(1)}" y2="${(base - f * bh).toFixed(1)}" stroke="var(--v2-grid)"/><text x="${padL - 6}" y="${(base - f * bh + 4).toFixed(1)}" font-size="10" text-anchor="end" fill="var(--muted)">${f * 100}%</text>`).join('');
  weekly.forEach((wk, i) => {
    let y = base; const x = padL + i * bw;
    wk.shares.forEach((s, bi) => { const hh = s * bh; if (hh > 0.5) { y -= hh; out += `<rect x="${(x + 2).toFixed(1)}" y="${y.toFixed(1)}" width="${Math.max(1, bw - 4).toFixed(1)}" height="${hh.toFixed(1)}" rx="1.5" fill="var(${CR_FILL[bi][0]})" fill-opacity="${CR_FILL[bi][1]}"/>`; } });
    if (n <= 14 || i % 2 === (n - 1) % 2) out += `<text x="${(x + bw / 2).toFixed(1)}" y="${h - 8}" font-size="10" text-anchor="middle" fill="var(--muted)">${T.day(wk.week)}</text>`;
  });
  out += `<line class="fx-guide" x1="0" x2="0" y1="8" y2="${base}" stroke="var(--ink)" opacity="0"/>`;
  return `<div class="v2chart"><svg id="crBarsSvg" viewBox="0 0 ${w} ${h}" role="img" aria-label="Weekly spend split by ad age">${out}</svg><div class="v2tip"></div></div>`;
}

function crDual(weekly, currency) {
  const T = U(), w = 900, h = 180, padL = 52, padR = 44, padT = 12, padB = 24;
  if (weekly.filter(wk => wk.cpa != null).length < 2) return '<p class="v2hint">Not enough weeks with sales to draw this yet.</p>';
  const iw = w - padL - padR, ih = h - padT - padB;
  const cpas = weekly.filter(wk => wk.cpa != null).map(wk => wk.cpa);
  const cMin = Math.min(...cpas) * 0.9, cMax = Math.max(...cpas) * 1.08;
  const fMax = Math.max(0.01, ...weekly.map(wk => wk.freshShare)) * 1.15;
  const x = i => padL + i / Math.max(1, weekly.length - 1) * iw;
  const yC = v => padT + (1 - (v - cMin) / (cMax - cMin || 1)) * ih;
  const yF = v => padT + (1 - v / fMax) * ih;
  const cpaLine = weekly.map((wk, i) => wk.cpa == null ? null : `${x(i).toFixed(1)},${yC(wk.cpa).toFixed(1)}`).filter(Boolean).join(' ');
  const fLine = weekly.map((wk, i) => `${x(i).toFixed(1)},${yF(wk.freshShare).toFixed(1)}`).join(' ');
  const dots = weekly.map((wk, i) => wk.cpa == null ? '' : `<circle cx="${x(i).toFixed(1)}" cy="${yC(wk.cpa).toFixed(1)}" r="2.6" fill="var(--brand)"/>`).join('');
  return `<div class="v2chart"><svg id="crDualSvg" viewBox="0 0 ${w} ${h}" role="img" aria-label="Weekly cost per purchase against the share of spend on new ads">
    <line x1="${padL}" x2="${w - padR}" y1="${padT + ih / 2}" y2="${padT + ih / 2}" stroke="var(--v2-grid)"/>
    <polyline points="${fLine}" fill="none" stroke="var(--warn)" stroke-width="1.6" stroke-dasharray="4 3"/>
    <polyline points="${cpaLine}" fill="none" stroke="var(--brand)" stroke-width="2" stroke-linejoin="round"/>${dots}
    <text x="${padL - 6}" y="${padT + 8}" font-size="10" text-anchor="end" fill="var(--brand)">${T.money(cMax, currency)}</text>
    <text x="${padL - 6}" y="${h - padB}" font-size="10" text-anchor="end" fill="var(--brand)">${T.money(cMin, currency)}</text>
    <text x="${w - 2}" y="${padT + 8}" font-size="10" fill="var(--warn)" text-anchor="end">${(fMax * 100).toFixed(0)}%</text>
    <text x="${w - 2}" y="${h - padB}" font-size="10" fill="var(--warn)" text-anchor="end">0%</text>
    <line class="fx-guide" x1="0" x2="0" y1="${padT}" y2="${h - padB}" stroke="var(--ink)" opacity="0"/></svg><div class="v2tip"></div></div>`;
}

/** Which individual ads are carrying the spend, and earning it. */
function crAds(d) {
  const a = d.ads; if (!a || !a.ads.length) return '';
  const T = U(), cur = d.account.currency, top = a.ads.slice(0, 15), mx = Math.max(1, ...top.map(x => x.spend || 0));
  const scale = a.ads.filter(x => x.verdict === 'scale').length, cut = a.ads.filter(x => x.verdict === 'cut').length;
  const rows = top.map(x => `<tr>
    <td><span class="nm" title="${esc(x.name)}">${esc(x.name)}</span><span class="sub">${x.age == null ? '' : `${x.age} days old`}${x.fresh ? ' · <span class="v2pill good">new</span>' : ''}</span></td>
    <td>${T.ib(x.spend || 0, mx, '--c-meta', T.kmoney(x.spend, cur), `${T.pct(x.share, 0)} of spend`)}</td>
    <td>${x.purchases ? T.int(x.purchases) : '–'}</td>
    <td>${T.money(x.cpa, cur)}${x.cpa != null && a.acct_cpa ? T.chip(x.cpa, a.acct_cpa, true, `Against the ${T.money(a.acct_cpa, cur)} account average`) : ''}</td>
    <td>${T.x2(x.roas)}</td>
    <td>${x.verdict === 'scale' ? '<span class="v2pill good">scale</span>' : x.verdict === 'cut' ? '<span class="v2pill bad">cut or fix</span>' : '<span class="v2pill">holding</span>'}</td></tr>`).join('');
  return `<div class="mt-sub"><h4>Every ad that spent, against the account average</h4>
    <p>The last ${a.window} days, biggest spender first, each against this account’s own ${T.money(a.acct_cpa, cur)} average CPA, not the goal: <b>scale</b> is 20% or more cheaper than average, <b>cut or fix</b> is 40% or more dearer or no purchases. The cards above judge against the goal CPA.</p>
    <div class="v2tbl wide"><table><thead><tr><th>Ad</th><th>Spend</th><th>Purchases</th><th>CPA</th><th>ROAS</th><th>Against average</th></tr></thead><tbody>${rows}</tbody></table></div>
    <p class="mt-hint">${a.ads.length > 15 ? `The top 15 of ${a.ads.length} spending ads. ` : ''}${scale} to scale, ${cut} to cut or fix. Purchases, ROAS and CPA are Triple Whale attribution (last platform click).${a.attr_gap ? ' Triple Whale has not synced every day of this window yet, so some show –.' : ''}</p></div>`;
}

async function renderCreative() {
  const picked = S.act !== 'all' ? acctOf(S.act) : null;
  if (picked && !hasMeta(picked)) { $('#main').innerHTML = mtPage('mbrowser', `Creative browser: ${esc(picked.name)}`, 'creative', noMetaCard(picked)); return; }
  const active = S.accounts.filter(metaOn);
  const single = S.act !== 'all' ? active.find(a => a.act_id === S.act) : null;
  const T = U();
  /* Top to bottom: one sentence (filled from the cards once they land), the ad
     cards (index.html renderCreativeBrowser), "Are we launching enough?", and
     the rules in one closed "How these numbers work" at the very bottom. */
  $('#main').innerHTML = mtPage('mbrowser', single ? `Creative browser: ${esc(single.name)}` : 'Creative browser', 'creative', `
    <p class="v2say lead" id="cbSay">${single ? `Every ad below is marked <b>Scale</b>, <b>Watch</b> or <b>Cut</b> against ${esc(single.name)}’s goal CPA, for ${esc(periodLabel())}.` : 'Pick a brand in the menu to see its ads. Below: is every brand launching enough new ones?'}</p>
    ${setupNote()}
    ${single ? '<div id="cbHost"></div>' : ''}
    <section class="v2card cr-launch"><div class="v2h"><h3>Are we launching enough?</h3><span class="find" id="crFind">Ads wear out, so the share of spend on new ads is the number to protect.</span></div>
      ${single ? '' : `<div class="cr-pick"><span class="mt-lbl">An ad is new for its first</span><div class="v2jobs">${['7', '14', '30'].map(v => `<button type="button" data-f="${v}" class="${CR.fresh === v ? 'on' : ''}">${v} days</button>`).join('')}</div></div>`}
      <div id="crBody"><p class="v2hint">Loading…</p></div></section>
    ${single ? '<div id="cbNotes" class="v2card"></div>' : ''}`);
  const setFresh = v => { CR.fresh = String(v); try { localStorage.setItem('ah_cr_fresh', CR.fresh); } catch { /* private mode */ } loadLaunch(); };
  document.querySelectorAll('#main .cr-pick [data-f]').forEach(c => c.onclick = () => {
    document.querySelectorAll('#main .cr-pick [data-f]').forEach(x => x.classList.toggle('on', x === c));
    setFresh(c.dataset.f);
  });
  /* The live card browser, for one client at a time: "top ads by X" is not a
     question you ask of six brands at once. Rendered before the freshness
     analysis is fetched so it appears immediately. The verdict line counts the
     chips on the cards as they land, so it always agrees with them. */
  if (single && window.renderCreativeBrowser && window.resolveRange) {
    const host = $('#cbHost');
    const sayFromCards = () => {
      const say = $('#cbSay'); if (!say || !host.isConnected) return;
      const cards = host.querySelectorAll('.cb-card'); if (!cards.length) return;
      const c = k => host.querySelectorAll(`.cb-card .vd.${k}`).length, sc = c('scale'), wa = c('watch'), cu = c('cut');
      const part = (k, cls, label) => k ? `<b class="${cls}">${k} ${label}</b>` : `none ${label}`;
      say.innerHTML = !(sc + wa + cu)
        ? `${cards.length} ads on screen for ${esc(periodLabel())}. <b>No goal CPA is set</b>, so none is marked Scale, Watch or Cut. Set one in Settings, Goals.`
        : `Of the ${cards.length} ads on screen for ${esc(periodLabel())}: ${part(sc, 'good', 'to scale')}, ${wa} to watch and ${part(cu, 'bad', 'to cut')}.${sc ? ' Make more like the ones marked Scale.' : ''}`;
    };
    new MutationObserver((_, mo) => { if (!host.isConnected) { mo.disconnect(); return; } sayFromCards(); }).observe(host, { childList: true, subtree: true });
    renderCreativeBrowser(host, single.act_id, resolveRange(),
      { fresh: { get: () => CR.fresh, set: setFresh }, notes: $('#cbNotes') });
  }
  const targets = single ? [single] : active;
  if (!targets.length) { $('#crBody').innerHTML = '<p class="v2hint">No Meta accounts are switched on yet.</p>'; return; }
  /* Re-run on its own when the "new for" choice changes, so the cards above
     never reload and the page never jumps. */
  let run = 0;
  async function loadLaunch() {
    const mine = ++run, body = $('#crBody');
    if (!body) return;
    body.style.opacity = body.querySelector('.v2tiles, .v2tbl') ? '.55' : '';
    try {
      const rg = window.resolveRange ? resolveRange() : null;
      const winQ = rg ? `&from=${rg.from}&to=${rg.to}` : `&window=${CR.win}`;
      const res = await Promise.all(targets.map(a => api(`/api/creative?act=${a.act_id}&fresh=${CR.fresh}${winQ}`).catch(e => ({ error: e.message }))));
      if (mine !== run || !body.isConnected) return;
      body.style.opacity = '';
      if (single) {
        const d = res[0], bf = d.backfill;
        const bfNote = bf ? `<div class="v2note" style="margin-bottom:12px"><span class="v2pill warn">Loading</span> Ad history for ${esc(single.name)}: ${bf.error ? `hit an error, <code>${esc(bf.error)}</code>` : `${bf.daysDone ?? 0} of ${bf.daysTotal ?? 90} days in. Each refresh and every nightly sync pulls more; numbers firm up as it completes.`}</div>` : '';
        if (d.error) { body.innerHTML = `<p class="v2bad">${esc(d.error)}</p>`; return; }
        if (d.empty) { body.innerHTML = bfNote || '<p class="v2hint">No ad-level data yet. It fills in with the next sync.</p>'; return; }
        body.innerHTML = `${bfNote}${crLaunch(d)}
          <details class="cr-weeks"${CR.weeks ? ' open' : ''}><summary>See it week by week, and every ad that spent</summary>
          <div class="mt-sub"><h4>Where each week’s budget went, by ad age</h4><p>Each bar is one week of spend, split by how old the ads were. The strongest green at the bottom is brand-new ads; if it keeps shrinking week after week, the account is coasting on old creative. Hover a week for its numbers.</p>
            ${crBars(d.weekly)}<p class="mt-hint">${CR_LABELS.map((l, ci) => `${crSw(ci)}${l}`).join(' &nbsp; ')}</p></div>
          <div class="mt-sub"><h4>Does launching more change what a purchase costs?</h4><p>Solid line: cost per purchase that week. Dashed amber: the share of the budget on new ads that week. When amber goes up, does the solid line come down? Hover for exact weeks.</p>
            ${crDual(d.weekly, d.account.currency)}</div>
          ${crAds(d)}</details>`;
        const wk = body.querySelector('.cr-weeks');
        if (wk) wk.ontoggle = () => { CR.weeks = wk.open; };
        wireCreativeCharts(d);
      } else {
        body.innerHTML = crAllTable(res, targets);
        body.querySelectorAll('tr[data-pick]').forEach(tr => { tr.onclick = () => pickBrand(tr.dataset.pick); tr.onkeydown = e => { if (e.key === 'Enter') pickBrand(tr.dataset.pick); }; });
      }
    } catch (e) { if (mine === run) { body.style.opacity = ''; body.innerHTML = `<p class="v2bad">${esc(e.message)}</p>`; } }
  }
  loadLaunch();
}

/** The healthy floor for the share of spend on new ads, by what "new" means (see the help). */
const crLow = fresh => ({ 7: 0.10, 14: 0.15, 30: 0.25 })[+fresh] ?? 0.15;

/** "Are we launching enough?" in four tiles and one sentence: the share of spend on
 *  new ads, how old the ads behind the spend are, and what a sale costs on new ads
 *  against older ones. */
function crLaunch(d) {
  const T = U(), c = d.cards, cur = d.account.currency, ins = d.insight, share = c.freshShare, lo = crLow(d.fresh);
  const dpp = share != null && c.freshSharePrev != null ? (share - c.freshSharePrev) * 100 : null;
  const tone = share == null ? '' : share < lo ? 'bad' : 'good';
  const read = ins
    ? (ins.topCpa <= ins.botCpa * 0.95 ? `<b>Launching more has been working here:</b> weeks heavy on new ads averaged ${T.money(ins.topCpa, cur)} per sale, against ${T.money(ins.botCpa, cur)} in quiet weeks.`
      : ins.topCpa >= ins.botCpa * 1.05 ? `<b>Heavy launch weeks ran a little pricier here</b> (${T.money(ins.topCpa, cur)} per sale against ${T.money(ins.botCpa, cur)}), which is normal while new ads settle, so judge them in their second week.`
      : `<b>Launching more has not cost this account anything:</b> about ${T.money(ins.topCpa, cur)} per sale in heavy launch weeks and ${T.money(ins.botCpa, cur)} in quiet ones.`)
    : share == null ? 'No ad-level data in this window yet.'
    : share < lo ? '<b>This account is leaning on older ads</b>, which wear out and push CPA up, so it needs new ones.'
    : '<b>This account is being fed new ads.</b>';
  return `<div class="v2tiles">${[
    T.tile({ compact: true, label: 'Spend on new ads', value: `<span class="${tone}">${share == null ? '–' : T.pct(share, 0)}</span>`,
      delta: dpp == null ? '' : `<span class="v2d ${Math.abs(dpp) < 0.5 ? 'flat' : dpp > 0 ? 'up' : 'down'}"${T.tipAttr(`Against the period before: ${T.pct(c.freshSharePrev, 1)}`)}>${dpp >= 0 ? '▲' : '▼'} ${Math.abs(dpp).toFixed(1)} pt</span>`,
      sub: `on ads under ${d.fresh} days old. Healthy is ${Math.round(lo * 100)}% or more.` }),
    T.tile({ compact: true, label: 'Average ad age', value: c.swAge == null ? '–' : `${Math.round(c.swAge)} days`, sub: 'of the ads the money ran on, weighted by spend' }),
    T.tile({ compact: true, label: 'CPA on new ads', hint: 'lower is better', value: T.money(c.freshCpa, cur), delta: T.chip(c.freshCpa, c.staleCpa, true, 'Against older ads'),
      sub: c.freshCpa == null && c.attr_gap ? 'Triple Whale has not synced all of this period' : `ads under ${d.fresh} days old` }),
    T.tile({ compact: true, label: 'CPA on older ads', hint: 'lower is better', value: T.money(c.staleCpa, cur), sub: `ads ${d.fresh} days old or more` }),
  ].join('')}</div><p class="v2say" style="margin-top:12px">${read}${ins ? ` <span class="faint">(the ${ins.n} heaviest launch weeks against the ${ins.n} lightest, last 13 weeks or so)</span>` : ''}</p>`;
}

/** Every brand: the same read, one row each. */
function crAllTable(res, targets) {
  const T = U(); let coasting = 0, read = 0;
  const rows = targets.map((a, i) => {
    const d = res[i] || {};
    if (d.error) return `<tr><td><b>${esc(a.name)}</b></td>${errTd(d.error, 5)}</tr>`;
    if (d.empty || !d.cards) return `<tr><td><b>${esc(a.name)}</b></td><td colspan="5" class="faint">${d.backfill ? `Loading ad history: ${d.backfill.daysDone ?? 0} of ${d.backfill.daysTotal ?? 90} days in` : 'No ad-level data yet'}</td></tr>`;
    const c = d.cards, cur = d.account.currency, lo = crLow(d.fresh), share = c.freshShare;
    const dpp = share != null && c.freshSharePrev != null ? (share - c.freshSharePrev) * 100 : null;
    const low = share != null && share < lo; if (share != null) { read++; if (low) coasting++; }
    return `<tr class="link" tabindex="0" data-pick="${esc(a.act_id)}"><td><b>${esc(a.name)}</b></td>
      <td>${T.ib(share || 0, 0.6, low ? '--bad' : '--good', share == null ? '–' : T.pct(share, 0), `Healthy is ${Math.round(lo * 100)}% or more`)}${dpp == null ? '' : `<span class="v2d ${Math.abs(dpp) < 0.5 ? 'flat' : dpp > 0 ? 'up' : 'down'}">${dpp >= 0 ? '▲' : '▼'} ${Math.abs(dpp).toFixed(1)} pt</span>`}</td>
      <td>${c.swAge == null ? '–' : `${Math.round(c.swAge)} days`}</td>
      <td>${T.money(c.freshCpa, cur)}${T.chip(c.freshCpa, c.staleCpa, true, 'New ads against older ones')}</td><td>${T.money(c.staleCpa, cur)}</td>
      <td>${share == null ? '' : low ? '<span class="v2pill bad">leaning on old ads</span>' : '<span class="v2pill good">fed new ads</span>'}</td></tr>`;
  }).join('');
  const f = $('#crFind'); if (f) f.innerHTML = read ? (coasting ? `<b class="bad">${coasting} of ${read} brands</b> ${coasting === 1 ? 'is' : 'are'} leaning on older ads and need${coasting === 1 ? 's' : ''} new ones.` : `Every brand is being fed new ads.`) : 'Ads wear out, so the share of spend on new ads is the number to protect.';
  return `<div class="v2tbl"><table><thead><tr><th>Brand</th><th>Spend on new ads</th><th>Average ad age</th><th>CPA, new ads</th><th>CPA, older ads</th><th>Read</th></tr></thead><tbody>${rows}</tbody></table></div>
    <p class="mt-hint">New means under ${esc(CR.fresh)} days old. Press a brand for its ad cards and the week-by-week view.</p>`;
}

/** Hover for the Creative charts: the shared tooltip, guide line, hover and tap both work. */
function wireCreativeCharts(d) {
  const T = U(), wk = d.weekly, cur = d.account.currency, n = wk.length;
  if (!n) return;
  const barW = (900 - 34) / n;
  chartTip(document.getElementById('crBarsSvg'), 900, vx => Math.max(0, Math.min(n - 1, Math.floor((vx - 34) / barW))), i => 34 + (i + 0.5) * barW, i => {
    const w = wk[i];
    return `<b>Week of ${T.day(w.week)}</b> · ${T.kmoney(w.spend, cur)} spent · CPA ${T.money(w.cpa, cur)}<br>${w.shares.map((s, bi) => s >= 0.005 ? `${crSw(bi)}${T.pct(s, 0)} on ads ${CR_LABELS[bi]} old` : '').filter(Boolean).join('<br>') || 'no spend'}`;
  });
  const iw = 900 - 52 - 44;
  chartTip(document.getElementById('crDualSvg'), 900, vx => Math.max(0, Math.min(n - 1, Math.round((vx - 52) / iw * (n - 1)))), i => 52 + i / Math.max(1, n - 1) * iw, i => {
    const w = wk[i];
    return `<b>Week of ${T.day(w.week)}</b><br>CPA ${T.money(w.cpa, cur)}<br>${T.pct(w.freshShare, 0)} of spend on new ads`;
  });
}

/* ---------- router ---------- */
const SUBS = [
  /* Meta Overview is drawn by v2.js now; an old link that still asks for it lands there. */
  ['overview', 'Overview', async () => { if (window.show) window.show('meta'); }],
  ['today', 'Today', renderTodayPage],
  ['changelog', 'Change Log', renderChangeLog],
  ['averages', 'Averages', renderTodayPage],
  ['creative', 'Creative', renderCreative],
];
/* Where each old sub-screen lives in the host now. */
const MSUB_TAB = { overview: 'meta', today: 'mtoday', averages: 'mtoday', changelog: 'changes', creative: 'mbrowser' };
/** The shared period control's label, for sections that follow it. Host-owned;
 *  falls back if meta.js is ever loaded without it. */
function periodLabel() {
  if (!window.resolveRange || !window.prettyDate) return 'the selected period';
  const r = resolveRange();
  return r.from === r.to ? prettyDate(r.from, true)
    : `${prettyDate(r.from, r.from.slice(0, 4) !== r.to.slice(0, 4))} to ${prettyDate(r.to, true)}`;
}

const HELP_TITLES = { overview: 'Meta at a glance', today: 'Today', changelog: 'The Change Log',
  averages: 'Last 7 days against the last 30', creative: 'The Creative browser' };
/* Same short-first shape as the host page's help - see PAGE_BRIEF there for
   why. The host owns `helpModalFor`; this file only supplies the briefs. */
const META_BRIEF = {
  overview: {
    answers: 'Which Meta accounts are running hot or cold against their own normal.',
    when: 'Daily, as the ads-side companion to Overview.',
    todo: 'Scan for red. Spend matches Ads Manager; ROAS and CPA are Triple Whale attribution, same as the briefs.',
  },
  today: {
    answers: 'Whether Meta is delivering right now, or has stalled, and whether to touch budgets.',
    when: 'Mid-morning, or any time spend looks wrong.',
    todo: 'Read the sentence at the top. On pace: leave budgets alone. Cold or hot by more than 10%: check Ads Manager first.',
  },
  changelog: {
    answers: 'What was changed in the account, when, and whether it helped.',
    when: 'When a number moved and you want to know what you did.',
    todo: 'Press Add why on each change that matters. The client\'s Daily Brief is written from those reasons.',
  },
  averages: {
    answers: 'Whether the last 7 days beat this account’s own last 30.',
    when: 'Weekly, or when something feels off but you cannot name it.',
    todo: 'Ignore moves under about 5%. Trust the 7-against-30 read; the last 3 days are still settling.',
  },
  creative: {
    answers: 'Which ads to scale, watch or cut, and whether we are launching enough new ones.',
    when: 'Weekly, with your creative strategist, or before you touch budgets.',
    todo: 'Read the chip on each card. Scale the green ones, cut the red ones, and keep the share of spend on new ads from falling.',
  },
};

/* Old [data-msub] links (Today, Averages, Change Log, Creative) open the host tab
   that now holds that screen. Averages is the second view on Today. */
document.addEventListener('click', e => {
  const m = e.target.closest('#main [data-msub]');
  if (!m) return;
  e.preventDefault();
  const k = m.dataset.msub;
  try { localStorage.setItem('pf_msub', k); } catch { /* private mode */ }
  if (k === 'averages' || k === 'today') { MT.view = k === 'averages' ? 'av' : 'today'; MT.keep = true; }
  if (window.show) window.show(MSUB_TAB[k] || 'meta');
});
/* The Today page's two views, and its "What changed today" card. */
document.addEventListener('click', e => {
  const v = e.target.closest('#main [data-mtv]');
  if (v) {
    e.preventDefault();
    MT.view = v.dataset.mtv === 'av' ? 'av' : 'today'; MT.keep = true;
    if (window.show) window.show('mtoday'); else renderTodayPage();
    window.scrollTo(0, 0);
    return;
  }
  const g = e.target.closest('#main [data-mtgo]');
  if (g && g.dataset.mtgo === 'changes-today') {
    CL.range = 'today'; try { localStorage.setItem('ah_cl_range', 'today'); } catch { /* private mode */ }
    if (window.show) window.show('changes');
    window.scrollTo(0, 0);
  }
});
document.addEventListener('click', e => {
  const hb = e.target.closest('[data-mhelp]');
  if (!hb) return;
  const k = hb.dataset.mhelp;
  // helpModalFor lives in the host page; meta.js is loaded before it but this
  // resolves at CLICK time, so the host is always defined by then.
  if (typeof helpModalFor === 'function') helpModalFor(k, HELP_TITLES[k], META_HELP[k], META_BRIEF[k]);
  else helpModal(HELP_TITLES[k], META_HELP[k]);
});

/** Load the Meta account list once per session (currency, tz, active flags). */
async function ensureAccounts(force) {
  if (S.accounts.length && !force) return;
  const [acc, health] = await Promise.all([
    api('/api/accounts'),
    fetch(S.url + '/health').then(r => r.json()).catch(() => null),
  ]);
  S.accounts = acc.accounts || [];
  S.metaAvailable = acc.meta_available || [];
  S.lastDiscover = acc.lastDiscover || null;
  S.health = health;
}

window.MetaTab = {
  subs: SUBS.map(([id, label]) => ({ id, label })),
  /* THE HOST MUST CALL THIS BEFORE ANY OTHER ENTRY POINT.
     `render()` sets S.tok from its ctx, so the Meta tab always worked - but the
     merged Settings tab calls ensureAccounts() DIRECTLY, and did so without ever
     passing a token. Land on Settings without opening Meta first (the normal
     path: sign in, click Settings) and every call went out as "Bearer " and came
     back 401, so the Clients card - the one place a client is added - rendered
     "Couldn't load Meta accounts: unauthorized" and nothing else. Visiting Meta
     first made it work, which is what made it look intermittent. */
  setToken(t) { S.tok = t || ''; },
  /** ctx = { tok, act, sub } - the host owns sign-in and the client picker. */
  async render(ctx) {
    S.tok = ctx.tok;
    S.act = ctx.act || 'all';
    const ticket = S.run = hostRun();
    /* Averages is the second view on Today. The view you were on survives a brand
       switch (same sub again) and resets when you arrive from another page. */
    let sub = ctx.sub;
    if (sub === 'averages') { MT.view = 'av'; sub = 'today'; }
    else if (sub === 'today' && !MT.keep && S.lastSub !== 'today') MT.view = 'today';
    MT.keep = false; S.lastSub = sub;
    const entry = SUBS.find(s => s[0] === sub) || SUBS[0];
    if (!window.V2UI) { $('#main').innerHTML = `<div class="card"><span style="color:var(--bad)">The v2 screens did not load. Hard-refresh the page (Ctrl+Shift+R).</span></div>`; return; }
    try { await ensureAccounts(); }
    catch (e) {
      if (hostRun() !== ticket) return;   // the reader already left Meta
      $('#main').innerHTML = `<div class="v2"><section class="v2card"><p class="v2bad">Couldn’t reach the Meta service: ${esc(e.message)}</p></section></div>`;
      return;
    }
    if (hostRun() !== ticket) return;     // the reader already left Meta
    await entry[2]();
  },
  /* Used by the merged Settings tab, which lives in the host page. */
  api, ensureAccounts, accounts: () => S.accounts, metaAvailable: () => S.metaAvailable || [], lastDiscover: () => S.lastDiscover,
};
})();

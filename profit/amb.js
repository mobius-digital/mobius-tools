/* Locus - the Ambassadors tab (2026-09-16).
 *
 * The staff side of the creator link. Each brand gets one public page,
 * tools.go-mobius-digital.com/angles/<slug>, that its TRYBE creators read
 * instead of a PDF brief. Everything on it is edited here:
 *   Ideas         lanes (p_amb_section), ideas (p_amb_angle), openers, shot plans, proof
 *   Link & brief  the address, where creators submit, the look, the intro,
 *                 "please stop filming these", the season card, the PDF
 *
 * v2 look (2026-10-08). Reader: the creative strategist. Top: one verdict, four tiles (link
 * live or off, ideas live, ideas with nothing to watch, Hot), the staff-only money line and
 * the link bar. Ideas view: What to change (computed), past winners not tagged, filters, then
 * each lane as a v2 card with idea rows (video thumbs, Hot button, Live / Draft / Hidden). A
 * row opens the editor as a right-hand drawer (#amDrawer, own scrim, asks before dropping
 * unsaved edits). A thumb opens the video in the v2 side panel. Tokens only, both themes.
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
/* The account-health worker holds the Atria connection: "Pull the video in" on an inspiration row goes there. */
const AH_URL = (/^(localhost|127\.0\.0\.1)$/.test(location.hostname) && (() => { try { return localStorage.getItem('pf_ah'); } catch { return null; } })()) || 'https://mobius-account-health.mobius-digital.workers.dev';
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

const S = { url: '', tok: '', act: 'all', accounts: [], pick: null, data: null, view: 'angles', edit: null, icons: null, tags: null,
  filter: 'all', q: '', dirty: false, covers: new Map(), coverTried: new Set(), upKind: new Map() };
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
/* The lane colour is the brand's own choice (it shows on the public page), so it is mixed
   into the theme tokens here: a faint wash on the surface and an icon pulled towards the
   ink, which reads in both themes whatever colour was picked. */
const safeHex = c => (/^#[0-9a-f]{3,8}$/i.test(c || '') ? c : '#475569');
const badge = (svg, color, size = 32) => `<span class="am-badge" style="width:${size}px;height:${size}px;background:color-mix(in srgb,${safeHex(color)} 16%,var(--surface));color:color-mix(in srgb,${safeHex(color)} 72%,var(--ink))">${svgWrap(svg, Math.round(size * .55))}</span>`;
/* Hover text through the one v2 tooltip (v2.js); a plain title if v2 is not loaded. */
const tip = html => (window.V2UI ? window.V2UI.tipAttr(html) : ` title="${esc(String(html).replace(/<[^>]+>/g, ''))}"`);
const kmoney = n => (window.V2UI ? window.V2UI.kmoney(n) : money(n));
const plural = (n, one, many) => `${n} ${n === 1 ? one : (many || one + 's')}`;
/* What a creator can WATCH for an idea. Public proof is video only (CLAUDE.md, v12): a tagged
   Meta image never reaches the page. A clip whose "who" says inspiration / another brand is
   another brand's video, not proof of ours. */
const isInspoClip = p => p.kind === 'upload' && /inspiration|another brand/i.test(p.who || '');
function ideaState(a) {
  const mine = S.data.proof.filter(p => p.angle_id === a.id);
  const play = mine.filter(p => p.shown && ((p.kind === 'meta' && p.stats?.media_type !== 'image') || p.kind === 'upload' || p.kind === 'post' || p.kind === 'typed'));
  const ours = play.filter(p => !isInspoClip(p)).sort((x, y) => (y.stats?.revenue || 0) - (x.stats?.revenue || 0));
  const others = play.filter(isInspoClip);
  return { mine, ours, others, st: ours.length ? 'proof' : others.length ? 'others' : 'blind' };
}

/* ---------- styles ---------- */
function injectCss() {
  if (document.getElementById('am-css')) return;
  const st = document.createElement('style');
  st.id = 'am-css';
  st.textContent = `
/* Creator link (amb.js), v2 look, 2026-10-08. Tokens only: every colour below reads in both
   themes. The one exception is the PDF thumbnail (.am-pdf .pg), which pictures the printed
   brief, and that is always light paper; its colours are named --paper* in that scope. */
.am{display:flex;flex-direction:column;gap:16px;min-width:0}
#amBody{display:flex;flex-direction:column;gap:16px;min-width:0}
.am .ph{margin-bottom:0}
.am h3{margin:0;font-size:13.5px;font-weight:650;color:var(--ink)}
.am .hint,.am-drawer .hint{color:var(--muted);font-size:13px;line-height:1.5}
.am .tiny{font-size:11.5px;color:var(--muted)}
.am .am-i{fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;flex:none;vertical-align:middle}
.am .btn{display:inline-flex;align-items:center;gap:6px}
.am .btn.am-sm{padding:5px 10px;font-size:12.5px}
.am a.btn{text-decoration:none;color:var(--ink)}
.am a.btn.primary{color:var(--on-brand)}
.am-grow{flex:1;min-width:0}
.am-badge{display:inline-flex;align-items:center;justify-content:center;border-radius:8px;flex:none}
.am-c{display:flex;flex-direction:column;gap:12px}

/* the link bar */
.am-linkbar{display:flex;align-items:center;gap:10px;flex-wrap:wrap;padding:12px 16px;border:1px solid var(--line);border-radius:10px;background:var(--surface)}
.am-linkbar .am-addr{flex:1;min-width:220px;display:grid;gap:2px}
.am-linkbar .am-addr span{font-size:12px;color:var(--muted)}
.am-linkbar .am-addr a{font-size:14px;font-weight:600;color:var(--ink);text-decoration:none;word-break:break-all}
.am-linkbar .am-addr a:hover{color:var(--brand)}

/* the strip */
.am-tl[data-amf]{cursor:pointer}
.am-tl[data-amf]:hover{border-color:var(--line-strong)}
.am-tl.on{border-color:var(--brand)}
.am-tl .v small{font-size:13px;font-weight:500;color:var(--muted);margin-left:4px;letter-spacing:0}
.am-note{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.am-note b{color:var(--ink);font-weight:600}

/* what to change */
.am-acts{display:flex;flex-direction:column;gap:6px;margin:0;padding:0;list-style:none}
.am-act{display:grid;grid-template-columns:8px minmax(0,1fr) auto;gap:10px;align-items:start;font-size:13px;line-height:1.45;color:var(--ink-2);padding:8px 10px;border:1px solid var(--line);border-radius:8px}
.am-act > i{width:8px;height:8px;border-radius:50%;margin-top:6px;background:var(--unk)}
.am-act.good > i{background:var(--good)} .am-act.warn > i{background:var(--warn)} .am-act.bad > i{background:var(--bad)}
.am-act b{color:var(--ink);font-weight:600}

/* toolbar + filters */
.am-tools{display:flex;gap:10px;align-items:center;flex-wrap:wrap}
.am-tools .v2jobs button em{font-style:normal;font-weight:500;opacity:.7;margin-left:4px}
.am-find{font:inherit;font-size:13px;padding:6px 11px;border:1px solid var(--line-strong);border-radius:8px;background:var(--surface);color:var(--ink);width:200px;max-width:100%}
.am-find:focus{outline:none;border-color:var(--brand);box-shadow:0 0 0 3px var(--brand-soft)}
.am-count{font-size:12.5px;color:var(--muted)}

/* lanes and idea rows */
.am-lanes{display:flex;flex-direction:column;gap:12px}
.am-lane[hidden]{display:none}
.am-lh{display:flex;align-items:center;gap:12px;margin-bottom:4px;flex-wrap:wrap}
.am-lh h3{display:flex;align-items:center;gap:8px}
.am-lh .am-n{font-size:11.5px;font-weight:600;color:var(--muted);background:var(--surface-2);border-radius:99px;padding:1px 8px}
.am-lane.off .am-ideas{opacity:.6}
.am-s{font-size:12.5px;color:var(--muted);margin:2px 0 0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.am-ideas{display:flex;flex-direction:column}
.am-irow{display:flex;align-items:center;gap:12px;padding:9px 8px;border-top:1px solid var(--line);border-radius:6px;cursor:pointer;transition:background .1s}
.am-irow:first-child{border-top-color:transparent}
.am-irow:hover{background:var(--surface-2)}
.am-irow[hidden]{display:none}
.am-irow.draft .am-t{color:var(--ink-2)}
.am-t{font-size:13.5px;font-weight:600;color:var(--ink);margin:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.am-grip{cursor:grab;color:var(--faint);display:inline-flex;padding:2px;flex:none}
.am-irow[draggable="false"] .am-grip{visibility:hidden}
.am-drag.drag{opacity:.4}
.am-drag.over{box-shadow:inset 0 2px 0 var(--brand)}
.am-ths{display:flex;gap:4px;width:106px;flex:none}
.am-th{width:30px;height:38px;border-radius:5px;border:1px solid var(--line);background:var(--surface-2);display:grid;place-items:center;color:var(--faint);overflow:hidden;padding:0;cursor:pointer;flex:none;font:inherit}
.am-th:hover{border-color:var(--brand)}
.am-th img,.am-th video{width:100%;height:100%;object-fit:cover;display:block;pointer-events:none}
.am-th.ins{border-style:dashed;border-color:var(--line-strong)}
.am-th.more{font-size:11px;font-weight:600;color:var(--muted);cursor:default}
.am-th.more:hover{border-color:var(--line)}
.am-th.none{border-style:dashed;border-color:var(--warn);color:var(--warn);cursor:default;background:var(--warn-bg)}
.am-fmt{font-size:11.5px;font-weight:600;padding:2px 8px;border-radius:99px;background:var(--surface-2);color:var(--ink-2);white-space:nowrap;max-width:150px;overflow:hidden;text-overflow:ellipsis;flex:none}
.am-sc{width:150px;text-align:right;font-size:12px;color:var(--muted);flex:none;white-space:nowrap}
.am-sc b{color:var(--ink);font-weight:600}
.am-hot{display:inline-flex;align-items:center;gap:4px;font:inherit;font-size:11.5px;font-weight:600;padding:3px 9px;border-radius:99px;border:1px solid var(--line-strong);background:transparent;color:var(--muted);cursor:pointer;flex:none}
.am-hot:hover{color:var(--ink);border-color:var(--ink-2)}
.am-hot.on{background:var(--warn-bg);border-color:transparent;color:var(--warn)}
.am-st{width:62px;text-align:right;flex:none}
.am-none{font-size:12.5px;color:var(--muted);padding:8px 8px 4px;margin:0}
@media (max-width:1100px){.am-fmt{display:none}}
@media (max-width:860px){.am-sc{display:none}.am-ths{width:auto}}
@media (max-width:600px){.am-irow{flex-wrap:wrap}.am-irow .am-grow{flex-basis:calc(100% - 140px)}.am-st{width:auto}}

/* plain rows: lane order, ad search, past winners, proof */
.am-row{display:flex;align-items:center;gap:12px;padding:9px 4px;border-top:1px solid var(--line)}
.am-row:first-child{border-top:none}
.am-row.off{opacity:.55}
.am-row .am-t{font-size:13.5px}
.am-results{border:1px solid var(--line);border-radius:9px;background:var(--surface);max-height:320px;overflow:auto}
.am-results .am-row{padding:8px 10px}

/* switches */
.am-sw{display:inline-flex;align-items:center;gap:7px;font-size:12px;font-weight:600;color:var(--muted);cursor:pointer;user-select:none;flex:none}
.am-sw input{position:absolute;opacity:0;width:1px;height:1px}
.am-sw .am-tr{width:34px;height:20px;border-radius:99px;background:var(--surface-2);border:1px solid var(--line-strong);position:relative;transition:.15s;flex:none;box-sizing:border-box}
.am-sw .am-tr::after{content:"";position:absolute;top:2px;left:2px;width:14px;height:14px;border-radius:50%;background:var(--muted);transition:.15s}
.am-sw input:checked + .am-tr{background:var(--good);border-color:var(--good)}
.am-sw input:checked + .am-tr::after{left:16px;background:var(--surface)}
.am-sw input:focus-visible + .am-tr{box-shadow:0 0 0 3px var(--brand-soft)}

/* chips and source labels */
.am-chip{display:inline-flex;align-items:center;gap:5px;font-size:11.5px;font-weight:600;padding:3px 9px;border-radius:99px;background:var(--surface-2);color:var(--ink-2);white-space:nowrap;max-width:220px;overflow:hidden;text-overflow:ellipsis}
.am-chip.good{background:var(--good-bg);color:var(--good)}
.am-src{font-size:10.5px;font-weight:700;padding:2px 8px;border-radius:99px;display:inline-block;letter-spacing:.01em}
.am-src.meta{background:var(--good-bg);color:var(--good)}
.am-src.post{background:var(--brand-soft);color:var(--brand)}
.am-src.typed{background:var(--warn-bg);color:var(--warn)}
.am-src.upload{background:var(--unk-bg);color:var(--ink-2)}
.am-src.inspo{background:transparent;color:var(--muted);box-shadow:inset 0 0 0 1px var(--line-strong)}
.am-well{display:flex;align-items:center;justify-content:center;background:var(--surface-2);color:var(--muted);border:1px solid var(--line);border-radius:7px;overflow:hidden;flex:none}
.am-well img{width:100%;height:100%;object-fit:cover}

/* forms */
.am .am-f,.am-modal .am-f{display:block;font-size:12px;font-weight:650;color:var(--ink-2);min-width:0}
.am .am-f small,.am-modal .am-f small{font-weight:500;color:var(--muted);margin-left:4px}
.am .am-f > .am-in,.am .am-f > div,.am .am-f > input,.am-modal .am-f > .am-in,.am-modal .am-f > div{margin-top:5px}
.am .am-in,.am-modal .am-in{display:block;width:100%;border:1px solid var(--line-strong);border-radius:8px;padding:9px 11px;font:inherit;font-size:13.5px;font-weight:500;color:var(--ink);background:var(--surface);max-width:none}
.am .am-in::placeholder,.am-modal .am-in::placeholder{color:var(--faint)}
.am .am-in:focus,.am-modal .am-in:focus{outline:none;border-color:var(--brand);box-shadow:0 0 0 3px var(--brand-soft)}
.am textarea.am-in,.am-modal textarea.am-in{min-height:84px;resize:vertical;line-height:1.5}
.am textarea.am-in.grow{min-height:40px;resize:none;overflow:hidden}
.am .am-pre{width:auto;border-radius:8px 0 0 8px;background:var(--surface-2);color:var(--muted);border-right:none;white-space:nowrap}
.am-list-edit{display:flex;flex-direction:column;gap:8px}
.am-list-edit .am-li{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1.4fr) auto;gap:8px;align-items:start}
.am-list-edit .am-li .btn{height:40px}
.am-list-edit .am-li.one{grid-template-columns:minmax(0,1fr) auto}
.am-list-edit .am-li.hook{grid-template-columns:minmax(0,.8fr) minmax(0,1.6fr) 150px minmax(0,.9fr) auto}
.am-list-edit .am-li.three{grid-template-columns:minmax(0,.6fr) minmax(0,1.4fr) minmax(0,1fr) auto}
.am-g2{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}
.am-g3{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}
.am-g4{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px}
.am-radios{display:grid;gap:8px}
.am-radio{display:flex;align-items:flex-start;gap:10px;padding:10px 12px;border:1px solid var(--line);border-radius:9px;background:var(--surface);cursor:pointer}
.am-radio input{margin-top:3px;accent-color:var(--brand)}
.am-radio.on{border-color:var(--brand);background:var(--brand-soft)}
.am-radio b{display:block;font-size:13px;color:var(--ink)}
.am-radio span{display:block;font-size:12px;color:var(--muted);font-weight:500}
.am-swatches{display:flex;gap:6px;align-items:center;flex-wrap:wrap;min-height:38px}
.am-swatch{width:26px;height:26px;border-radius:7px;border:2px solid var(--surface);box-shadow:0 0 0 1px var(--line-strong);cursor:pointer;padding:0}
.am-swatch.on{box-shadow:0 0 0 2px var(--ink)}
.am-color,.modal input.am-color{width:40px;height:30px;border:1px solid var(--line-strong);border-radius:7px;padding:2px;background:var(--surface);flex:none}
.am-icongrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(44px,1fr));gap:6px;max-height:220px;overflow:auto;padding:2px}
.am-icongrid button{height:44px;border:1px solid var(--line);border-radius:8px;display:flex;align-items:center;justify-content:center;color:var(--ink-2);background:var(--surface);cursor:pointer}
.am-icongrid button.on{border-color:var(--brand);background:var(--brand-soft);color:var(--ink)}
.am-modal .am-i{fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;flex:none;vertical-align:middle}
.am-modal .am-row .am-t{font-size:14px;font-weight:650;margin:0}
.am-lbl{font-size:10.5px;font-weight:650;letter-spacing:.08em;text-transform:uppercase;color:var(--muted);margin:0}
.am-seg{display:inline-flex;gap:2px;background:var(--surface-2);border:1px solid var(--line);border-radius:10px;padding:3px;margin-top:5px}
.am-seg button{min-height:32px;padding:0 14px;border-radius:7px;font:inherit;font-size:13px;font-weight:600;color:var(--muted);background:transparent;border:0;cursor:pointer}
.am-seg button.on{background:var(--surface);color:var(--ink);box-shadow:0 0 0 1px var(--line-strong)}
.am-empty{padding:26px;text-align:center;color:var(--muted)}
.am-save{position:sticky;bottom:0;z-index:5;display:flex;align-items:center;justify-content:flex-end;gap:10px;padding:12px 16px;margin:0 -4px;background:color-mix(in srgb,var(--bg) 92%,transparent);backdrop-filter:blur(8px);border-top:1px solid var(--line)}
.am-msg{font-size:12.5px;color:var(--muted)}
.am-msg.ok{color:var(--good)}.am-msg.bad{color:var(--bad)}
.am-modal{max-width:640px !important}

/* Link and brief */
.am-brief{display:grid;grid-template-columns:240px minmax(0,1fr);gap:24px;align-items:start}
.am-brief-l{display:flex;flex-direction:column;gap:10px}
.am-brief-r{display:flex;flex-direction:column;gap:12px;min-width:0}
.am-stack{display:flex;flex-direction:column;gap:16px}
.am-pdfbtns{display:flex;gap:8px;flex-wrap:wrap}
.am-pdfbtns .primary{flex:1;justify-content:center}
.am-pdf{--paper:#F7F8FA;--paper-card:#FFFFFF;--paper-ink:#0A0B0D;--paper-sub:#5F6472;--paper-line:#DFE3E9;--paper-rule:#E4EBF0;
  flex:none;border:1px solid var(--line);border-radius:10px;background:var(--surface-2);padding:14px;display:flex;justify-content:center}
.am-pdf .pg{width:100%;max-width:230px;height:auto;flex:none;background:var(--paper);border-radius:4px;box-shadow:0 6px 20px -10px rgba(0,0,0,.45);padding:14px;aspect-ratio:8.5/11;display:flex;flex-direction:column;gap:7px;overflow:hidden;color:var(--paper-ink)}
.am-pdf .ln{height:5px;border-radius:3px;background:var(--paper-rule)}
.am-pdf .pg.grid{background-image:linear-gradient(rgba(10,11,13,.05) 1px,transparent 1px),linear-gradient(90deg,rgba(10,11,13,.05) 1px,transparent 1px);background-size:14px 14px}
.am-pdf .box{background:var(--paper-card);border:1px solid var(--paper-line);border-radius:4px}
.am-season-ed{position:relative;border:1px dashed var(--line-strong);border-radius:10px;padding:8px 8px 4px;background:var(--surface-2)}
.am-season-tip{position:absolute;top:6px;right:10px;background:var(--v2-tip-bg);color:var(--v2-tip-ink);border-radius:6px;padding:2px 8px;font-size:11.5px;display:none}
@media (max-width:760px){.am-brief{grid-template-columns:1fr}}

/* the idea editor: a right-hand drawer over the list, in the page's reading order */
#amScrim{position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:45}
#amDrawer{position:fixed;top:0;right:0;bottom:0;width:min(880px,100vw);background:var(--bg);border-left:1px solid var(--line);z-index:46;display:flex;flex-direction:column;gap:0;box-shadow:-24px 0 48px -24px rgba(0,0,0,.5);animation:amIn .18s ease}
@keyframes amIn{from{transform:translateX(24px);opacity:.4}}
@media (prefers-reduced-motion:reduce){#amDrawer{animation:none}}
.am-dh{padding:14px 20px 12px;border-bottom:1px solid var(--line);background:var(--surface);display:flex;flex-direction:column;gap:10px}
.am-dh .am-dt{display:flex;align-items:center;gap:10px;flex-wrap:wrap}
.am-dh .am-dt > div:first-child{flex:1;min-width:200px}
.am-dh .am-dt b{display:block;font-size:15px;font-weight:650;color:var(--ink);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.am-dh .am-dt span{font-size:12px;color:var(--muted)}
.am-x{font:inherit;width:32px;height:32px;border-radius:8px;border:1px solid var(--line-strong);background:var(--surface);color:var(--muted);cursor:pointer;font-size:15px;flex:none}
.am-x:hover{color:var(--ink)}
.am-db{flex:1;overflow-y:auto;padding:16px 20px 24px;display:flex;flex-direction:column;gap:14px;scroll-padding-top:8px}
.am-df{padding:12px 20px;border-top:1px solid var(--line);background:var(--surface);display:flex;justify-content:flex-end;align-items:center;gap:10px}
.am-df .am-msg{margin-right:auto}
.am-step{display:inline-grid;place-items:center;width:20px;height:20px;border-radius:50%;background:var(--brand-soft);color:var(--brand);font-size:11.5px;font-weight:700;margin-right:6px;vertical-align:1px}
.am-score{display:flex;gap:18px;flex-wrap:wrap;align-items:baseline}
.am-score b{font-size:20px;font-weight:650;color:var(--ink);letter-spacing:-.02em}
.am-score span{font-size:12px;color:var(--muted)}
@media (max-width:1000px){.am-g4{grid-template-columns:repeat(2,minmax(0,1fr))}}
@media (max-width:720px){.am-g2,.am-g3,.am-g4{grid-template-columns:1fr}.am-list-edit .am-li,.am-list-edit .am-li.hook,.am-list-edit .am-li.three{grid-template-columns:1fr}}
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
  closeDrawer();
  const main = $('#main');
  if (act === 'all') return renderAll(main);
  main.innerHTML = `<div class="am">${head()}<div class="v2card"><span class="hint">Loading…</span></div></div>`;
  await Promise.all([loadIcons(), refresh()]);
  S.view = localStorage.getItem(LS_VIEW) || 'angles';
  if (S.edit && !S.data.angles.some(a => a.id === S.edit) && S.edit !== 'new') S.edit = null;
  S.dirty = false;
  paint();
}

/* The page head, like every v2 screen: the crumb and the title. The verdict under it says the rest. */
const head = () => `<div class="ph"><div>${typeof window.crumbFor === 'function' ? `<div class="ph-crumb">${window.crumbFor('amb')}</div>` : ''}<div class="ph-t">Creator link</div></div></div>`;

function autoGrow(root) {
  root.querySelectorAll('textarea.am-in').forEach(t => {
    const fit = () => { t.style.height = 'auto'; t.style.height = (t.scrollHeight + 2) + 'px'; };
    fit(); t.addEventListener('input', fit);
  });
}
function paint() {
  const main = $('#main');
  const d = S.data;
  const name = d.account.name;
  if (!d.brand) {
    closeDrawer();
    main.innerHTML = `<div class="am">${head()}
      <p class="v2say lead">${esc(name)} has no creator link yet. Set one up and its creators read one living brief instead of a PDF: ideas, openers, how to film them and the videos to watch.</p>
      <section class="v2card am-c" style="max-width:680px">
        <h3>Set up ${esc(name)}'s creator link</h3>
        <p class="hint" style="margin:0">Creates the page with two starter lanes, Hot right now and Always works. It stays switched off until you turn it on.</p>
        <label class="am-f">Link address <small>lowercase letters, numbers and dashes</small>
          <div style="display:flex;align-items:center;gap:0"><span class="am-in am-pre">${esc(PUBLIC_BASE.replace('https://', ''))}</span><input class="am-in" id="amSlug" style="border-radius:0 8px 8px 0" value="${esc(name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, ''))}"></div></label>
        <div style="display:flex;gap:10px;align-items:center"><button class="btn primary" id="amSetup">Set up the creator link</button><span class="am-msg" id="amSetupMsg"></span></div>
      </section></div>`;
    $('#amSetup').onclick = async () => {
      try {
        S.data = await post('/api/amb/setup', { slug: $('#amSlug').value, icons: { flame: S.icons.flame, leaf: S.icons.leaf } });
        paint();
      } catch (e) { flashMsg($('#amSetupMsg'), e.message, false); }
    };
    return;
  }
  const keep = snapshotEditor();
  const tabs = `<nav class="v2tabs am-sub" aria-label="Creator link views">
    <button data-v="angles" class="${S.view === 'angles' ? 'on' : ''}">Ideas</button>
    <button data-v="link" class="${S.view === 'link' ? 'on' : ''}">Link and brief</button></nav>`;
  main.innerHTML = `<div class="am">
    ${head()}
    ${summary()}
    ${linkStrip()}
    ${tabs}
    <div id="amBody"></div></div>`;
  main.querySelectorAll('.am-sub button').forEach(b => b.onclick = async () => {
    if (S.edit && !(await okToLeave())) return;
    S.view = b.dataset.v; S.edit = null; S.dirty = false; localStorage.setItem(LS_VIEW, S.view); paint();
  });
  wireStrip();
  wireSummary(main);
  const body = $('#amBody');
  if (S.view === 'link') { closeDrawer(); paintLink(body); return autoGrow(body); }
  paintAngles(body);
  if (S.edit) paintEditor(keep); else closeDrawer();
}

/* ---------- the top: one verdict, four tiles, the staff numbers ---------- */
function counts() {
  const d = S.data;
  const live = d.angles.filter(a => a.status === 'live');
  const st = new Map(d.angles.map(a => [a.id, ideaState(a)]));
  const liveSt = live.map(a => st.get(a.id).st);
  const hot = d.angles.filter(a => a.hot);
  const lanesOn = d.sections.filter(s => !s.pinned && s.enabled).length;
  const tagged = d.proof.filter(p => p.kind === 'meta');
  return {
    live, st, hot, lanesOn, tagged,
    proven: liveSt.filter(x => x === 'proof').length,
    othersOnly: liveSt.filter(x => x === 'others').length,
    blind: liveSt.filter(x => x === 'blind').length,
    drafts: d.angles.length - live.length,
    sold: tagged.reduce((t, p) => t + (p.stats?.revenue || 0), 0),
    running: tagged.filter(p => (p.stats?.spend30 || 0) > 0).length,
    top: [...d.angles].filter(a => a.score.ads && a.score.revenue > 0).sort((x, y) => y.score.revenue - x.score.revenue)[0],
  };
}
function summary() {
  const d = S.data, b = d.brand, c = counts();
  const name = esc(b.display_name || d.account.name);
  const lead = c.live.length
    ? `${b.live ? '' : 'The link is <b>off</b>, so creators see "being set up". '}${name}'s creators are asked to film <b>${plural(c.live.length, 'idea')}</b> in ${plural(c.lanesOn, 'lane')}${c.hot.length ? `, led by <b>${c.hot.length} hot</b>` : ''}. <b>${c.proven}</b> ${c.proven === 1 ? 'has' : 'have'} a video of ours to watch, ${c.othersOnly} only another brand's, and <b class="${c.blind ? 'warn' : 'good'}">${c.blind} ${c.blind === 1 ? 'has' : 'have'} nothing to watch</b>.${c.top ? ` Best seller so far: <b>${esc(c.top.title)}</b>, ${kmoney(c.top.score.revenue)} from ${plural(c.top.score.ads, 'tagged ad')}.` : ''}`
    : `${name}'s link has no live ideas yet, so it cannot be switched on. Add an idea below and mark it live.`;
  const t = (k, label, value, sub, extra = '') => `<div class="v2tile am-tl${k && k !== 'all' && S.filter === k ? ' on' : ''}"${k ? ` data-amf="${k}" role="button" tabindex="0"` : ''}${extra}><div class="l"><span>${label}</span></div><div class="v">${value}</div><div class="sub">${sub}</div></div>`;
  return `<p class="v2say lead">${lead}</p>
    <div class="v2tiles">
      ${t('', 'Creator link', b.live ? '<span class="good">Live</span>' : '<span class="warn">Off</span>', b.live ? (b.submit_url ? `Creators submit on ${esc(b.submit_platform || 'TRYBE')}` : '<span class="warn">No submit link yet</span>') : 'Creators see "being set up"', tip(b.live ? 'Creators can open the link now.' : 'Only signed-in Mobius staff can see the page while it is off.'))}
      ${t('all', 'Ideas live', `${c.live.length}<small>of ${d.angles.length}</small>`, c.drafts ? `${plural(c.drafts, 'draft')} kept in Locus` : 'Every idea is on the link', tip('Click to show every idea.'))}
      ${t('blind', 'No example video', `<span class="${c.blind ? 'warn' : ''}">${c.blind}</span>`, c.othersOnly ? `${c.othersOnly}${c.blind ? ' more' : ''} ${c.othersOnly === 1 ? 'shows' : 'show'} only another brand's video` : 'Every other live idea has one of ours', tip('Live ideas a creator would film blind: no ad, clip or post to watch. Click to list them.'))}
      ${t('hot', 'Hot right now', `${c.hot.length}`, c.hot.length > 6 ? '<span class="warn">Three to five read best</span>' : 'Lead the link', tip('The ideas pinned to the top of the link. Click to list them.'))}
    </div>
    <div class="v2note am-note">${ic('lock', 14)}<span>Staff only, never on the link: <b>${plural(c.tagged.length, 'Meta ad')}</b> tagged to ideas, <b>${kmoney(c.sold)}</b> sold by them, ${c.running} spent in the last 30 days.</span></div>`;
}
function wireSummary(root) {
  root.querySelectorAll('[data-amf]').forEach(el => {
    const go = () => {
      if (S.view !== 'angles') { S.view = 'angles'; localStorage.setItem(LS_VIEW, S.view); }
      S.filter = S.filter === el.dataset.amf && el.dataset.amf !== 'all' ? 'all' : el.dataset.amf;
      paint();
      $('#amTools')?.scrollIntoView({ block: 'start', behavior: 'smooth' });
    };
    el.onclick = go;
    el.onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } };
  });
}

function linkStrip() {
  const b = S.data.brand;
  const url = PUBLIC_BASE + b.slug;
  return `<div class="am-linkbar">
    ${badge(S.icons.link, '#DB2777', 34)}
    <div class="am-addr"><span>Creator link · ${b.live ? '<b class="good">live</b>' : '<b class="warn">off</b>, creators see "being set up"'}</span><a href="${esc(url)}" target="_blank" rel="noopener">${esc(url.replace('https://', ''))}</a></div>
    ${sw('amLive', b.live, b.live ? 'Live' : 'Off')}
    <button class="btn" id="amCopy">${ic('copy', 14)} Copy link</button>
    <a class="btn" href="${esc(url)}" target="_blank" rel="noopener"${tip(b.live ? 'Opens the page creators see' : 'Only signed-in Mobius staff can see it while the link is off')}>${ic('external-link', 14)} ${b.live ? 'Open as a creator' : 'Preview the link'}</a>
    <button class="btn primary" id="amPdf">${ic('file-down', 14)} Brief PDF</button>
  </div>`;
}
function wireStrip() {
  const url = PUBLIC_BASE + S.data.brand.slug;
  $('#amCopy').onclick = async e => { const btn = e.currentTarget; try { await navigator.clipboard.writeText(url); btn.innerHTML = `${ic('check', 14)} Copied`; setTimeout(() => { btn.innerHTML = `${ic('copy', 14)} Copy link`; }, 1600); } catch { helpModal('Copy this link', `<p><code style="user-select:all">${esc(url)}</code></p>`); } };
  $('#amLive').onchange = async e => {
    const on = e.target.checked;
    if (on && !S.data.angles.some(a => a.status === 'live')) {
      e.target.checked = false;
      return helpModal('Add an idea first', '<p>The link needs at least one live idea before it can be switched on.</p>');
    }
    try { S.data = await post('/api/amb/brand', { live: on }, 'PUT'); paint(); } catch (err) { e.target.checked = !on; helpModal('Could not save', `<p>${esc(err.message)}</p>`); }
  };
  $('#amPdf').onclick = () => makePdf().catch(err => helpModal('Could not build the PDF', `<p>${esc(err.message)}</p>`));
}

/* ---------- all brands ---------- */
async function renderAll(main) {
  main.innerHTML = `<div class="am">${head()}<div class="v2card"><span class="hint">Loading…</span></div></div>`;
  await loadIcons();
  const r = await api('/api/amb/overview');
  const set = r.brands.filter(b => b.slug), live = set.filter(b => b.live), off = set.filter(b => !b.live);
  const noSubmit = set.filter(b => !b.submit_url);
  const rows = [...live, ...off, ...r.brands.filter(b => !b.slug)];
  main.innerHTML = `<div class="am">
    ${head()}
    <p class="v2say lead"><b>${live.length} of ${plural(set.length, 'creator link')}</b> ${live.length === 1 ? 'is' : 'are'} live${off.length ? `; ${off.map(b => esc(b.name)).join(', ')} ${off.length === 1 ? 'is' : 'are'} switched off` : ''}. ${noSubmit.length ? `${noSubmit.map(b => esc(b.name)).join(', ')} still ${noSubmit.length === 1 ? 'needs' : 'need'} a submit link. ` : ''}${r.brands.length - set.length} brand${r.brands.length - set.length === 1 ? ' has' : 's have'} no link yet.</p>
    <div class="v2tiles">
      <div class="v2tile"><div class="l"><span>Links live</span></div><div class="v">${live.length}</div><div class="sub">Creators can open them now</div></div>
      <div class="v2tile"><div class="l"><span>Links off</span></div><div class="v"><span class="${off.length ? 'warn' : ''}">${off.length}</span></div><div class="sub">Staff can preview them</div></div>
      <div class="v2tile"><div class="l"><span>Live ideas</span></div><div class="v">${set.reduce((t, b) => t + (b.angles || 0), 0)}</div><div class="sub">Across every link</div></div>
      <div class="v2tile"><div class="l"><span>Tagged ads</span></div><div class="v">${set.reduce((t, b) => t + (b.tagged || 0), 0)}</div><div class="sub">Meta ads proving an idea</div></div>
    </div>
    <section class="v2card">
      <div class="v2h"><h3>Every brand</h3><span class="find">Pick a brand to edit what its creators film. Links start switched off, so nothing is public until you turn it on.</span></div>
      <div class="v2tbl"><table>
        <thead><tr><th>Brand</th><th style="text-align:left">Creator link</th><th>Live ideas</th><th>Tagged ads</th><th style="text-align:left">Submit link</th><th></th></tr></thead>
        <tbody>${rows.map(b => `<tr class="link" data-act="${esc(b.act_id)}">
          <td><b>${esc(b.name)}</b></td>
          <td style="text-align:left">${b.slug ? `<span class="v2pill ${b.live ? 'good' : 'warn'}">${b.live ? 'Live' : 'Off'}</span> <span class="tiny">/angles/${esc(b.slug)}</span>` : '<span class="tiny">Not set up</span>'}</td>
          <td>${b.slug ? b.angles : '<span class="tiny">–</span>'}</td>
          <td>${b.slug ? b.tagged : '<span class="tiny">–</span>'}</td>
          <td style="text-align:left">${b.slug ? (b.submit_url ? '<span class="v2pill good">Set</span>' : '<span class="v2pill warn">Missing</span>') : ''}</td>
          <td><button class="btn am-sm" data-act="${esc(b.act_id)}">${b.slug ? 'Open' : 'Set up'}</button></td>
        </tr>`).join('')}</tbody></table></div>
    </section></div>`;
  main.querySelectorAll('tr[data-act]').forEach(tr => tr.onclick = () => S.pick && S.pick(tr.dataset.act));
}

/* ---------- Ideas view ----------
   Reader: the creative strategist. In order: what to change (computed from the ideas and their
   proof), past winners not tagged yet, then every lane as a card with its idea rows (what is
   being filmed now, the videos behind each, Hot, live or draft). A row opens the editor. */
const FILTERS = [['all', 'All'], ['hot', 'Hot'], ['blind', 'Nothing to watch'], ['others', 'Other brands only'], ['proof', 'Has our video'], ['draft', 'Drafts']];
function actions() {
  const d = S.data, b = d.brand, c = counts(), out = [];
  const name = a => `<b>${esc(a.title)}</b>`;
  if (!b.live && c.live.length) out.push({ tone: 'warn', text: 'The link is off. Switch it on in the bar above when the ideas are ready.' });
  if (!b.submit_url) out.push({ tone: 'warn', text: `No submit link yet, so every "Film this" button is plain text. Add it under Link and brief.`, go: 'link', cta: 'Add it' });
  const hotBlind = c.hot.filter(a => a.status === 'live' && c.st.get(a.id).st === 'blind');
  if (hotBlind.length) out.push({ tone: 'bad', text: `Hot with nothing to watch: ${hotBlind.slice(0, 3).map(name).join(', ')}${hotBlind.length > 3 ? ` and ${hotBlind.length - 3} more` : ''}. Tag an ad or pull a video in.`, edit: hotBlind[0].id, cta: 'Fix the first' });
  if (!c.hot.length && c.live.length) out.push({ tone: 'warn', text: 'Nothing is Hot. Pick three to five ideas to lead the link.', filter: 'all', cta: 'Show ideas' });
  if (c.hot.length > 6) out.push({ tone: 'warn', text: `${c.hot.length} ideas are Hot. The top of the link reads best with three to five.`, filter: 'hot', cta: 'Show them' });
  const sellers = d.angles.filter(a => !a.hot && a.status === 'live' && a.score.revenue > 0).sort((x, y) => y.score.revenue - x.score.revenue);
  if (sellers[0]) out.push({ tone: 'good', text: `${name(sellers[0])} has sold ${kmoney(sellers[0].score.revenue)} from ${plural(sellers[0].score.ads, 'tagged ad')}${sellers[0].score.roas ? ` at ${x2(sellers[0].score.roas)}` : ''} but is not Hot. Worth leading with?`, edit: sellers[0].id, cta: 'Open it' });
  const coldHot = c.hot.filter(a => a.score.ads && !a.score.running);
  if (coldHot.length) out.push({ tone: 'warn', text: `${coldHot.slice(0, 2).map(name).join(' and ')}${coldHot.length > 2 ? ` and ${coldHot.length - 2} more` : ''} ${coldHot.length === 1 ? 'is' : 'are'} Hot, but no tagged ad behind ${coldHot.length === 1 ? 'it' : 'them'} has spent in 30 days.`, edit: coldHot[0].id, cta: 'Open it' });
  d.sections.filter(s => !s.pinned && !s.enabled).forEach(s => {
    const n = d.angles.filter(a => a.section_id === s.id && a.status === 'live').length;
    if (n) out.push({ tone: 'warn', text: `The ${esc(s.name)} lane is off, so its ${plural(n, 'live idea')} ${n === 1 ? 'is' : 'are'} hidden from creators.` });
  });
  const blindRest = c.blind - hotBlind.length;
  if (blindRest > 0) out.push({ tone: 'warn', text: `${plural(blindRest, 'more live idea')} ${blindRest === 1 ? 'has' : 'have'} nothing to watch.`, filter: 'blind', cta: 'List them' });
  if (!out.length) out.push({ tone: 'good', text: 'Nothing urgent. Every live idea has a video to watch and the link is on.' });
  return out;
}

function paintAngles(body) {
  const d = S.data;
  const secs = d.sections;
  const hotSec = secs.find(s => s.pinned);
  const acts = actions();
  const dragOn = S.filter === 'all' && !S.q;

  const thumb = p => {
    if (p.kind === 'meta') return `<button type="button" class="am-th" data-th="${esc(p.id)}" data-cover="${esc(p.ad_id)}"${tip(`<b>Our ad</b>: ${esc(p.stats?.name || p.ad_id)}${p.stats ? `<br>${kmoney(p.stats.revenue)} sold · ${x2(p.stats.roas)}${(p.stats.spend30 || 0) > 0 ? ' · spent in the last 30 days' : ''} <span class="faint">(staff only)</span>` : ''}`)}>${ic('play', 12)}</button>`;
    if (p.kind === 'upload') return `<button type="button" class="am-th${isInspoClip(p) ? ' ins' : ''}" data-th="${esc(p.id)}" data-up="${esc(p.id)}"${tip(`<b>${esc(p.who || 'Clip uploaded by the team')}</b>${p.note ? `<br>${esc(p.note)}` : ''}`)}>${ic('play', 12)}</button>`;
    return `<button type="button" class="am-th" data-th="${esc(p.id)}"${tip(`<b>${p.kind === 'typed' ? 'Our example' : 'Creator post'}</b>${p.who ? `: ${esc(p.who)}` : ''}${p.views ? `<br>${Number(p.views).toLocaleString()} views` : ''}`)}>${ic('link', 12)}</button>`;
  };
  const ideaRow = (a, inHot) => {
    const st = S._st.get(a.id);
    const sc = a.score;
    const sec = secs.find(s => s.id === a.section_id);
    const laneOff = !inHot && sec && !sec.pinned && !sec.enabled;
    const list = [...st.ours, ...st.others];
    const th = list.length
      ? list.slice(0, 3).map(thumb).join('') + (list.length > 3 ? `<span class="am-th more"${tip(`${list.length} videos to watch in all`)}>+${list.length - 3}</span>` : '')
      : `<span class="am-th none"${tip('Nothing for creators to watch yet. Tag one of our ads, upload a clip or pull another brand\'s video in.')}>${ic('video-off', 12)}</span>`;
    const score = sc.ads
      ? `<span${tip(`${plural(sc.ads, 'tagged Meta ad')}: ${kmoney(sc.spend)} spent, ${kmoney(sc.revenue)} sold, ${sc.running} spent in the last 30 days. Staff only.`)}><b>${kmoney(sc.revenue)}</b> · ${x2(sc.roas)}</span>`
      : st.st === 'others' ? 'Other brands only' : st.st === 'blind' ? '<span class="warn">Nothing to watch</span>' : plural(st.ours.length, 'example');
    const status = a.status === 'draft' ? `<span class="v2pill"${tip('Kept in Locus, not on the link.')}>Draft</span>`
      : laneOff ? `<span class="v2pill warn"${tip('Its lane is switched off, so creators do not see it.')}>Hidden</span>`
      : '<span class="v2pill good">Live</span>';
    return `<div class="am-irow am-drag${a.status === 'draft' ? ' draft' : ''}" data-ang="${esc(a.id)}" draggable="${dragOn}" data-list="${inHot ? 'hot' : esc(a.section_id || '')}" data-st="${st.st}" data-hot="${a.hot ? 1 : 0}" data-draft="${a.status === 'draft' ? 1 : 0}" data-q="${esc((a.title + ' ' + (a.format || '') + ' ' + (a.openers?.[0] || '')).toLowerCase())}">
      <span class="am-grip"${tip('Drag to reorder')}>${ic('grip-vertical', 15)}</span>
      <span class="am-ths">${th}</span>
      <div class="am-grow"><p class="am-t">${esc(a.title)}</p><p class="am-s">${a.openers?.[0] ? `&ldquo;${esc(a.openers[0])}&rdquo;` : esc(a.argument || a.visual_hook || '')}</p></div>
      ${a.format ? `<span class="am-fmt">${esc(a.format)}</span>` : ''}
      <span class="am-sc">${score}</span>
      <button type="button" class="am-hot${a.hot ? ' on' : ''}" data-hottog="${esc(a.id)}" aria-pressed="${a.hot}"${tip(a.hot ? 'Hot: it leads the link. Click to take it off.' : 'Click to make it Hot so it leads the link.')}>${ic('flame', 12)} Hot</button>
      <span class="am-st">${status}</span>
      <button type="button" class="btn am-sm" data-angedit="${esc(a.id)}">Edit</button>
    </div>`;
  };
  S._st = new Map(d.angles.map(a => [a.id, ideaState(a)]));
  const laneCard = (s, list, kind) => `<section class="v2card am-lane${kind === 'sec' && !s.enabled ? ' off' : ''}" data-lane="${kind === 'hot' ? 'hot' : esc(s?.id || '')}">
      <div class="am-lh">${s ? badge(s.icon_svg, s.color, 30) : badge(S.icons['circle-dashed'] || '', '#475569', 30)}
        <div class="am-grow"><h3>${esc(s ? s.name : 'No lane')} <span class="am-n">${list.length}</span></h3>
          <p class="am-s">${kind === 'hot' ? 'Pinned first on the link. The Hot button on any idea puts it here; drag to set the order.' : kind === 'none' ? 'Only shows on the link while Hot is on. Give these a lane.' : s.enabled ? esc(s.line || '') : 'Switched off: creators do not see this lane. Its ideas are kept.'}</p></div>
        ${kind === 'sec' ? sw('sec_' + s.id, s.enabled, s.enabled ? 'On the link' : 'Off', `data-sectog="${esc(s.id)}"${tip('Show this lane on the link')}`) : ''}
        ${s ? `<button type="button" class="btn am-sm" data-secedit="${esc(s.id)}">Edit lane</button>` : ''}
      </div>
      <div class="am-ideas" data-drop="${kind === 'hot' ? 'hot' : kind === 'none' ? '' : esc(s.id)}">${list.map(a => ideaRow(a, kind === 'hot')).join('') || `<p class="am-none">${kind === 'hot' ? 'Press Hot on any idea below and it leads the link.' : 'No ideas in this lane yet. Drag one here or add a new one.'}</p>`}</div>
    </section>`;

  const lanes = [];
  if (hotSec) lanes.push(laneCard(hotSec, d.angles.filter(a => a.hot).sort((x, y) => x.hot_sort - y.hot_sort), 'hot'));
  secs.filter(s => !s.pinned).forEach(s => lanes.push(laneCard(s, d.angles.filter(a => a.section_id === s.id).sort((x, y) => x.sort - y.sort), 'sec')));
  const orphans = d.angles.filter(a => !a.section_id || !secs.some(s => s.id === a.section_id && !s.pinned));
  if (orphans.length) lanes.push(laneCard(null, orphans, 'none'));

  const nOf = k => k === 'all' ? d.angles.length : d.angles.filter(a => k === 'hot' ? a.hot : k === 'draft' ? a.status === 'draft' : S._st.get(a.id).st === k).length;
  const secRow = s => {
    const n = s.pinned ? d.angles.filter(a => a.hot).length : d.angles.filter(a => a.section_id === s.id).length;
    return `<div class="am-row am-drag ${s.enabled ? '' : 'off'}" data-sec="${esc(s.id)}" ${s.pinned ? '' : 'draggable="true"'}>
      ${s.pinned ? `<span class="am-grip" style="cursor:default"${tip('Pinned first')}>${ic('pin', 15)}</span>` : `<span class="am-grip"${tip('Drag to reorder')}>${ic('grip-vertical', 15)}</span>`}
      ${badge(s.icon_svg, s.color, 28)}
      <div class="am-grow"><p class="am-t">${esc(s.name)}</p></div>
      <span class="tiny">${plural(n, 'idea')}${s.pinned ? ', always first' : s.enabled ? '' : ', off'}</span>
      <button type="button" class="btn am-sm" data-secedit="${esc(s.id)}">Edit</button>
    </div>`;
  };

  body.innerHTML = `
  <div class="v2two eq">
    <section class="v2card"><div class="v2h"><h3>What to change</h3><span class="find">Read from the ideas, their videos and the tagged ads.</span></div>
      <ul class="am-acts">${acts.map((x, i) => `<li class="am-act ${x.tone}"><i></i><span>${x.text}</span>${x.cta ? `<button type="button" class="v2link" data-actix="${i}">${esc(x.cta)}</button>` : '<span></span>'}</li>`).join('')}</ul>
    </section>
    <section class="v2card" id="amWinners"><div class="v2h"><h3>Past winners not tagged yet</h3></div><p class="hint" style="margin:0">Loading…</p></section>
  </div>
  <div class="am-tools" id="amTools">
    <div class="v2jobs" id="amFilt" role="group" aria-label="Show">${FILTERS.map(([k, l]) => `<button type="button" data-f="${k}" class="${S.filter === k ? 'on' : ''}">${l}<em>${nOf(k)}</em></button>`).join('')}</div>
    <input class="am-find" id="amQ" type="search" placeholder="Find an idea" value="${esc(S.q)}" aria-label="Find an idea">
    <span class="am-count" id="amCount"></span>
    <span style="flex:1"></span>
    <button type="button" class="btn" id="amAddSec">${ic('plus', 14)} Add a lane</button>
    <button type="button" class="btn primary" id="amNew">${ic('plus', 14)} New idea</button>
  </div>
  <div class="am-lanes" id="amLanes">${lanes.join('')}</div>
  <section class="v2card"><div class="v2h"><h3>Lane order</h3><span class="find">The link shows lanes top to bottom in this order. Drag to change it; the Hot lane always leads.</span></div>
    <div data-drop="sections">${secs.map(secRow).join('')}</div></section>`;

  $('#amNew').onclick = () => { S.edit = 'new'; S.dirty = false; paintEditor(); };
  $('#amAddSec').onclick = () => sectionModal(null);
  body.querySelectorAll('[data-actix]').forEach(btn => btn.onclick = () => {
    const x = acts[+btn.dataset.actix];
    if (x.go === 'link') { S.view = 'link'; localStorage.setItem(LS_VIEW, S.view); paint(); return; }
    if (x.edit) { S.edit = x.edit; S.dirty = false; paintEditor(); return; }
    if (x.filter) { S.filter = x.filter; paint(); $('#amTools')?.scrollIntoView({ block: 'start', behavior: 'smooth' }); }
  });
  body.querySelectorAll('[data-secedit]').forEach(b => b.onclick = e => { e.stopPropagation(); sectionModal(S.data.sections.find(s => s.id === b.dataset.secedit)); });
  body.querySelectorAll('[data-sectog] input').forEach(inp => inp.onchange = async () => {
    const s = S.data.sections.find(x => 'sec_' + x.id === inp.id);
    try { S.data = await post('/api/amb/section', { ...s, enabled: inp.checked }); paint(); } catch (e) { inp.checked = !inp.checked; helpModal('Could not save', `<p>${esc(e.message)}</p>`); }
  });
  body.querySelectorAll('[data-hottog]').forEach(btn => btn.onclick = async e => {
    e.stopPropagation();
    const a = S.data.angles.find(x => x.id === btn.dataset.hottog);
    btn.disabled = true;
    try { S.data = await post('/api/amb/angle', { ...a, hot: !a.hot }); paint(); } catch (err) { btn.disabled = false; helpModal('Could not save', `<p>${esc(err.message)}</p>`); }
  });
  // A row opens the editor; its own buttons, switches and video thumbs do their own thing.
  $('#amLanes').addEventListener('click', e => {
    const th = e.target.closest('[data-th]');
    if (th) { e.stopPropagation(); return previewProof(th.dataset.th); }
    if (e.target.closest('button,a,input,label,.am-grip')) {
      const ed = e.target.closest('[data-angedit]');
      if (ed) { S.edit = ed.dataset.angedit; S.dirty = false; paintEditor(); }
      return;
    }
    const row = e.target.closest('.am-irow');
    if (row) { S.edit = row.dataset.ang; S.dirty = false; paintEditor(); }
  });
  body.querySelectorAll('#amFilt [data-f]').forEach(b => b.onclick = () => { S.filter = b.dataset.f; paint(); });
  $('#amQ').oninput = e => { S.q = e.target.value.trim().toLowerCase(); applyFilter(); };
  wireDrag(body);
  applyFilter();
  loadCovers(body);
  lazyClips(body);
  loadWinners();
}

/* Filters hide rows in place, so typing in the search box keeps its focus. Dragging is off
   while a filter is on: an order saved from a filtered list would be a partial order. */
function applyFilter() {
  const f = S.filter, q = S.q;
  const on = f !== 'all' || !!q;
  const seen = new Set();
  document.querySelectorAll('#amLanes .am-lane').forEach(lane => {
    const isHot = lane.dataset.lane === 'hot';
    let shown = 0;
    lane.querySelectorAll('.am-irow').forEach(r => {
      const ok = (f === 'all' || (f === 'hot' ? r.dataset.hot === '1' : f === 'draft' ? r.dataset.draft === '1' : r.dataset.st === f)) && (!q || r.dataset.q.includes(q));
      r.hidden = !ok; r.draggable = !on;
      if (ok) { shown++; seen.add(r.dataset.ang); }
    });
    // The Hot lane repeats ideas from their own lanes: while filtering, show it only for the Hot filter.
    lane.hidden = on && (isHot ? f !== 'hot' : (!shown || f === 'hot'));
  });
  const c = $('#amCount');
  if (c) c.textContent = on ? `Showing ${plural(seen.size, 'idea')}${on && S.filter !== 'all' ? '. Dragging is off while filtered.' : ''}` : '';
}

/* Covers for our tagged ads, one batched call (staff route, cached by account-health). */
async function loadCovers(root) {
  const paintC = () => root.querySelectorAll('[data-cover]').forEach(el => { const u = S.covers.get(el.dataset.cover); if (u && !el.querySelector('img')) el.innerHTML = `<img src="${esc(u)}" alt="" loading="lazy">`; });
  paintC();
  const want = [...new Set([...root.querySelectorAll('[data-cover]')].map(x => x.dataset.cover))].filter(id => id && !S.covers.has(id) && !S.coverTried.has(id));
  for (let i = 0; i < want.length; i += 40) {
    const part = want.slice(i, i + 40); part.forEach(id => S.coverTried.add(id));
    try { const r = await api(`/api/ad-creatives?ads=${encodeURIComponent(part.join(','))}`); for (const [id, v] of Object.entries(r.assets || {})) { const u = v.thumb || v.image || v.cover; if (u) S.covers.set(id, u); } } catch {}
    paintC();
  }
}
/* Uploaded clips: the stored preview frame if there is one, else the clip's own first frame,
   loaded only when the row scrolls into view. The clip route serves LIVE links only, so an
   off link shows the play icon. */
function lazyClips(root) {
  const base = S.url.replace(/\/+$/, '');
  const fill = el => {
    const id = el.dataset.up, k = S.upKind.get(id);
    if (k === 'none') return;
    const asVideo = () => {
      if (!S.data.brand.live) { S.upKind.set(id, 'none'); return; }
      const v = document.createElement('video'); v.muted = true; v.playsInline = true; v.preload = 'metadata';
      v.onloadeddata = () => { S.upKind.set(id, 'video'); el.innerHTML = ''; el.appendChild(v); };
      v.onerror = () => S.upKind.set(id, 'none');
      v.src = `${base}/api/angles-file/${id}#t=0.5`;
    };
    if (k === 'video') return asVideo();
    const im = new Image();
    im.onload = () => { S.upKind.set(id, 'img'); el.innerHTML = ''; el.appendChild(im); };
    im.onerror = asVideo;
    im.alt = ''; im.src = `${base}/api/angles-thumb/${id}`;
  };
  const els = [...root.querySelectorAll('[data-up]')];
  if (!('IntersectionObserver' in window)) return els.forEach(fill);
  const io = new IntersectionObserver(es => es.forEach(en => { if (en.isIntersecting) { io.unobserve(en.target); fill(en.target); } }), { rootMargin: '200px' });
  els.forEach(el => io.observe(el));
}
/* A thumb opens the video in the v2 side panel, so you can watch what creators will watch. */
function previewProof(id) {
  const p = S.data.proof.find(x => x.id === id);
  if (!p) return;
  const a = S.data.angles.find(x => x.id === p.angle_id);
  if (!window.V2UI) { S.edit = p.angle_id; return paintEditor(); }
  const base = S.url.replace(/\/+$/, '');
  const title = p.kind === 'meta' ? (p.stats?.name || 'Our ad') : (p.who || 'Example');
  let media = '';
  if (p.kind === 'upload') media = S.data.brand.live ? `<video src="${esc(base)}/api/angles-file/${esc(p.id)}" controls playsinline preload="metadata" style="width:100%;max-height:70vh;border-radius:10px;background:var(--surface-2)"></video>` : '<p class="v2hint">The clip plays here once the link is live. Until then, open the idea on the link preview.</p>';
  else if (p.kind === 'meta') media = S.covers.get(p.ad_id) ? `<img src="${esc(S.covers.get(p.ad_id))}" alt="" style="width:100%;border-radius:10px;border:1px solid var(--line)">` : '<p class="v2hint">No cover loaded for this ad.</p>';
  else media = p.url ? `<p><a class="v2link" href="${esc(p.url)}" target="_blank" rel="noopener">Open the video</a></p>` : '';
  const facts = p.kind === 'meta' && p.stats ? `<div class="v2pstat"><div><b>${kmoney(p.stats.spend)}</b><span>spent</span></div><div><b>${kmoney(p.stats.revenue)}</b><span>sold</span></div><div><b>${x2(p.stats.roas)}</b><span>ROAS, staff only</span></div></div>` : '';
  const body = window.V2UI.panel(title, `${media}${facts}
    <p class="v2hint">${p.kind === 'meta' ? 'Ran as a paid ad. Creators can play it on the link; the numbers stay here.' : isInspoClip(p) ? "Another brand's video, shown to creators as the shape to steal." : 'An example of ours.'}${p.note ? ` ${esc(p.note)}` : ''}</p>
    ${p.kind === 'meta' || !p.url ? '' : `<p class="v2hint"><a class="v2link" href="${esc(p.url)}" target="_blank" rel="noopener">Source link</a></p>`}
    ${a ? `<p class="v2hint">On the idea <b>${esc(a.title)}</b>. <button type="button" class="v2link" id="amPvEdit">Edit the idea</button></p>` : ''}`);
  // The panel only slides away on close, so stop the clip when it does.
  const pn = document.getElementById('v2panel');
  if (pn) { const mo = new MutationObserver(() => { if (!pn.classList.contains('on')) { pn.querySelectorAll('video').forEach(v => v.pause()); mo.disconnect(); } }); mo.observe(pn, { attributes: true, attributeFilter: ['class'] }); }
  const ed = body.querySelector('#amPvEdit');
  if (ed) ed.onclick = () => { document.querySelector('#v2panel .ph button')?.click(); S.edit = a.id; S.dirty = false; paintEditor(); };
}

/* Drag to reorder. Lanes reorder among themselves in the Lane order card; ideas reorder within
   Hot, or within and between lanes (dropping into another lane moves it there). */
function wireDrag(root) {
  let dragEl = null;
  root.querySelectorAll('.am-drag').forEach(el => {
    el.addEventListener('dragstart', e => { if (el.getAttribute('draggable') !== 'true') return e.preventDefault(); dragEl = el; el.classList.add('drag'); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', el.dataset.ang || el.dataset.sec); });
    el.addEventListener('dragend', () => { el.classList.remove('drag'); root.querySelectorAll('.over').forEach(x => x.classList.remove('over')); dragEl = null; });
  });
  root.querySelectorAll('[data-drop]').forEach(zone => {
    const kind = zone.dataset.drop === 'sections' ? 'sec' : 'ang';
    zone.addEventListener('dragover', e => {
      if (!dragEl) return;
      const isSec = !!dragEl.dataset.sec;
      if ((kind === 'sec') !== isSec) return;
      if (zone.dataset.drop === 'hot' && dragEl.dataset.list !== 'hot') return;     // Hot is a button, not a drop target
      if (dragEl.dataset.list === 'hot' && zone.dataset.drop !== 'hot') return;
      e.preventDefault();
      const over = e.target.closest('.am-drag');
      root.querySelectorAll('.over').forEach(x => x.classList.remove('over'));
      if (over && over !== dragEl && zone.contains(over)) over.classList.add('over');
    });
    zone.addEventListener('drop', async e => {
      if (!dragEl) return;
      e.preventDefault();
      const over = e.target.closest('.am-drag');
      const moving = dragEl;
      zone.querySelector('.am-none')?.remove();
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
  const hd = '<div class="v2h"><h3>Past winners not tagged yet</h3><span class="find">Biggest sellers in the account that are on no idea. Tag one and it becomes playable proof on the link.</span></div>';
  try {
    const r = await api(`/api/amb/ads?act=${encodeURIComponent(S.act)}&untagged=1&min_spend=250&limit=6`);
    if (!document.body.contains(box)) return;
    const good = r.ads.filter(a => a.revenue > 0);
    const max = Math.max(1, ...good.map(a => a.revenue));
    box.innerHTML = `${hd}${good.length ? good.map(a => `<div class="am-row">
        <div class="am-grow"><p class="am-t" style="font-size:13px">${esc(a.name || a.ad_id)}</p><p class="am-s">${x2(a.roas)}${a.media_type ? ` · ${esc(a.media_type)}` : ''}${a.media_type === 'image' ? ', an image never plays on the link' : ''}</p></div>
        ${window.V2UI ? window.V2UI.ib(a.revenue, max, '--good', kmoney(a.revenue), `${kmoney(a.revenue)} sold, ${kmoney(a.spend)} spent. Staff only.`) : `<span class="tiny">${money(a.revenue)}</span>`}
        <button type="button" class="btn am-sm" data-tagad="${esc(a.ad_id)}" data-name="${esc(a.name || '')}">Tag</button></div>`).join('') : '<p class="hint" style="margin:0">Every ad with real spend is already tagged to an idea.</p>'}`;
    box.querySelectorAll('[data-tagad]').forEach(b => b.onclick = () => tagToAngleModal(b.dataset.tagad, b.dataset.name));
  } catch (e) { box.innerHTML = `${hd}<p class="hint" style="margin:0">${esc(e.message)}</p>`; }
}

function tagToAngleModal(adId, name) {
  const opts = S.data.angles.map(a => `<option value="${esc(a.id)}">${esc(a.title)}</option>`).join('');
  modal('Tag this ad to an idea', `<p class="hint" style="margin:0">${esc(name || adId)}</p>
    ${opts ? `<label class="am-f">Idea<select class="am-in" id="amTagSel">${opts}</select></label>` : '<p>Add an idea first.</p>'}`, { cta: 'Tag it' });
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
  modal(sec ? 'Edit lane' : 'Add a lane', `
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
    ${sec && !sec.pinned ? `<div><button class="btn" id="amSecDel" style="color:var(--bad)">Delete this lane</button></div>` : ''}`, { cta: sec ? 'Save lane' : 'Add lane' });
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

/* ---------- idea editor ----------
   A right-hand drawer over the list (the list stays where it was), laid out in the order a
   creator reads the idea on the link: The idea, How to film it 1 to 4, Watch first (other
   brands, then our proof), Why it works. The jump row at the top goes straight to each part.
   Closing with unsaved edits asks first. Every id inside is the one the save reads. */
function closeDrawer() {
  document.getElementById('amDrawer')?.remove();
  document.getElementById('amScrim')?.remove();
  if (S._mo) { S._mo.disconnect(); S._mo = null; }
}
async function okToLeave() {
  if (!S.dirty) return true;
  const ok = await confirmModal('Close without saving?', 'Your changes to this idea are not saved yet.', 'Close without saving');
  if (ok) S.dirty = false;
  return ok;
}
async function requestClose() {
  if (!(await okToLeave())) return;
  S.edit = null; S.dirty = false; closeDrawer();
}
// One Escape listener, owned by the copy of this file that is loaded now (a reload replaces it).
if (window.__amEsc) document.removeEventListener('keydown', window.__amEsc);
window.__amEsc = e => {
  if (e.key !== 'Escape' || !document.getElementById('amDrawer')) return;
  if (document.querySelector('.modal-wrap') || document.querySelector('#v2panel.on')) return;
  requestClose();
};
document.addEventListener('keydown', window.__amEsc);
/* A save elsewhere in the drawer (tagging an ad, adding an example) repaints it. Typed but
   unsaved fields survive that repaint: the plain fields by id, the beats by position. */
function snapshotEditor() {
  const dr = document.getElementById('amDrawer');
  if (!dr || !S.dirty) return dr ? { scroll: dr.querySelector('.am-db')?.scrollTop || 0 } : null;
  const vals = {};
  dr.querySelectorAll('[id^="e"]').forEach(el => { if (/^e[A-Z]/.test(el.id) && 'value' in el) vals[el.id] = el.type === 'checkbox' ? el.checked : el.value; });
  const shots = [...dr.querySelectorAll('[data-sht]')].map(t => ({ label: dr.querySelector(`[data-shl="${t.dataset.sht}"]`)?.value || '', text: t.value }));
  const inspo = [...dr.querySelectorAll('#eInspo .am-li')].map(li => ({ brand: li.querySelector('[data-ib]').value, what: li.querySelector('[data-iw]').value, url: li.querySelector('[data-iu]').value }));
  return { scroll: dr.querySelector('.am-db')?.scrollTop || 0, id: S.edit, vals, shots, inspo };
}

function paintEditor(keep) {
  const d = S.data;
  const isNew = S.edit === 'new';
  const a0 = isNew ? { title: '', section_id: d.sections.find(s => !s.pinned)?.id || '', hot: false, status: 'live', openers: [], shots: [{ label: 'Middle', text: '' }, { label: 'Close', text: '' }], score: { ads: 0, revenue: 0, roas: null, running: 0 } } : d.angles.find(x => x.id === S.edit);
  if (!a0) { S.edit = null; return closeDrawer(); }
  const restore = keep && keep.id === S.edit && keep.vals;
  const a = restore && keep.inspo ? { ...a0, inspo: keep.inspo } : a0;
  const secOpts = d.sections.filter(s => !s.pinned).map(s => `<option value="${esc(s.id)}" ${s.id === a.section_id ? 'selected' : ''}>${esc(s.name)}</option>`).join('');
  const fmtList = [...new Set([...FORMATS, ...d.angles.map(x => x.format).filter(Boolean)])];
  // The page shows "The first second" as step 1, so an "Open" beat here is the same thing twice: hide it.
  let shots = (a.shots?.length ? a.shots.filter(x => !/^open/i.test(x.label || '')) : []);
  if (restore && keep.shots?.length) shots = keep.shots;
  if (!shots.length) shots.push({ label: 'Middle', text: '' }, { label: 'Close', text: '' });
  const clips = new Set(d.proof.filter(p => p.angle_id === a.id && p.kind === 'upload' && p.url).map(p => p.url));
  const st = isNew ? null : ideaState(a);
  const sec = d.sections.find(s => s.id === a.section_id);
  const sub = isNew ? 'Fill it in the order a creator reads it. Every box is a box on the public page, with the same name.'
    : `${esc(sec?.name || 'No lane')} · ${a.status === 'draft' ? 'Draft, not on the link' : 'Live on the link'}${a.hot ? ' · Hot' : ''} · ${st.st === 'proof' ? plural(st.ours.length, 'video') + ' of ours' : st.st === 'others' ? "other brands' videos only" : 'nothing to watch yet'}`;

  closeDrawer();
  document.body.insertAdjacentHTML('beforeend', `<div id="amScrim"></div><aside id="amDrawer" class="am am-drawer" role="dialog" aria-modal="true" aria-label="${isNew ? 'New idea' : 'Edit idea'}">
  <div class="am-dh">
    <div class="am-dt">
      <div><b>${isNew ? 'New idea' : esc(a.title || 'Untitled idea')}</b><span>${sub}</span></div>
      ${!isNew ? `<a class="btn am-sm" href="${esc(PUBLIC_BASE + d.brand.slug + '#a=' + a.id)}" target="_blank" rel="noopener">${ic('eye', 14)} ${d.brand.live ? 'See it on the link' : 'Preview it on the link'}</a>` : ''}
      ${!isNew ? `<button type="button" class="btn am-sm" id="amDelAng" style="color:var(--bad)">${ic('trash', 14)} Delete</button>` : ''}
      <button type="button" class="am-x" id="amBack" aria-label="Close the editor"><svg class="li" width="16" height="16" viewBox="0 0 24 24" aria-hidden="true"><use href="#i-x"/></svg></button>
    </div>
    <div class="v2jobs" role="navigation" aria-label="Jump to">${[['edIdea', 'The idea'], ['edFilm', 'How to film it'], ['edWatch', 'Watch first'], ['edWhy', 'Why it works']].map(([id, l]) => `<button type="button" data-jump="${id}">${l}</button>`).join('')}</div>
  </div>
  <div class="am-db">

  <section class="v2card am-c" id="edIdea">
    <div class="v2h" style="margin:0"><h3>${isNew ? 'New idea' : 'The idea'}</h3><span class="find">The card creators tap on the link.</span></div>
    <div class="am-g4">
      <label class="am-f" style="grid-column:span 2">Title <small>the big line on the card</small><input class="am-in" id="eTitle" value="${esc(a.title)}" placeholder="Let's see how long it takes him to notice"></label>
      <label class="am-f">Lane <small>why film it today</small><select class="am-in" id="eSec"><option value="">No lane</option>${secOpts}</select></label>
      <label class="am-f">Format <small>the shape of the video</small><input class="am-in" id="eFmt" list="amFmts" value="${esc(a.format || '')}" placeholder="Reaction"><datalist id="amFmts">${fmtList.map(f => `<option value="${esc(f)}">`).join('')}</datalist></label>
    </div>
    <label class="am-f">The idea in one sentence <small>the reason to buy, said to one person</small><input class="am-in" id="eArg" value="${esc(a.argument || '')}" placeholder="She gives him the belt and the video waits for the moment he finds the marker in the buckle."></label>
    <div class="am-g2">
      <label class="am-f">Who it is for<textarea class="am-in" id="eWho" style="min-height:56px" placeholder="Partners who film each other.">${esc(a.who || '')}</textarea></label>
      <label class="am-f">Show <small>the product or line to film, in plain words</small><textarea class="am-in" id="eProd" style="min-height:56px" placeholder="Any Muni belt, in the box">${esc(a.products || '')}</textarea></label>
    </div>
    <div class="am-f">Where it shows<div style="display:flex;gap:16px;align-items:center;flex-wrap:wrap;min-height:38px">${sw('eHot', a.hot, 'Hot: leads the link')}${sw('eLive', a.status !== 'draft', 'Live on the link')}</div></div>
  </section>

  <section class="v2card am-c" id="edFilm">
    <div class="v2h" style="margin:0"><h3>How to film it</h3><span class="find">Numbered on the page, in this order. Write each as an instruction: "Open on...", "Say...", "At 3 seconds, cut to...".</span></div>
    <label class="am-f"><span class="am-step">1</span>The first second <small>what is physically on screen before anyone talks</small><textarea class="am-in" id="eVis" style="min-height:56px" placeholder="Open on her holding the box, him not in frame yet.">${esc(a.visual_hook || '')}</textarea></label>
    <label class="am-f">Or open with <small>two more ways in, one per row. Creators see them under step 1 with a link to the First seconds page. Lean on the bank on Link and brief.</small><textarea class="am-in" id="eAlt" style="min-height:56px" placeholder="Phone on the floor at 0.5x, reach down for the belt.\nShe films it, not you: her first line is the opener.">${esc((a.alt_hooks || []).join('\n'))}</textarea></label>
    <label class="am-f"><span class="am-step">2</span>Say this first <small>one line per row. The first row is the line on the card; the rest show as "Other lines you can say".</small><textarea class="am-in" id="eOpen" style="min-height:74px" placeholder="Let's see how long it takes him to notice what the buckle does.">${esc((a.openers || []).join('\n'))}</textarea></label>
    <label class="am-f"><span class="am-step">3</span>At 3 seconds <small>what happens next so they keep watching: a cut, a question, a count, a second person</small><textarea class="am-in" id="eRe" style="min-height:56px" placeholder="At 3 seconds, hand it over and stay on his face. Cut on his 'Wait a second.'">${esc(a.rehook || '')}</textarea></label>
    <div class="am-f"><span class="am-step">4</span>Then <small>the rest of the shots, one box per beat (Middle, Close)</small>
      <div class="am-g2" id="eShots">${shots.map((s, i) => `<div style="display:flex;flex-direction:column;gap:6px"><input class="am-in" data-shl="${i}" value="${esc(s.label || '')}" placeholder="Middle"><textarea class="am-in" data-sht="${i}" style="min-height:64px">${esc(s.text || '')}</textarea></div>`).join('')}</div>
      <div><button class="btn am-sm" id="eAddShot" type="button">${ic('plus', 13)} Add a beat</button></div></div>
    <label class="am-f">Text on screen <small>optional</small><input class="am-in" id="eOver" value="${esc(a.on_screen || '')}" placeholder="Let's see how long it takes him"></label>
    <div class="am-g2">
      <label class="am-f"><span class="good">Do</span><textarea class="am-in" id="eDo" style="min-height:56px">${esc(a.do_text || '')}</textarea></label>
      <label class="am-f"><span class="bad">Don't</span><textarea class="am-in" id="eDont" style="min-height:56px">${esc(a.dont_text || '')}</textarea></label>
    </div>
  </section>

  ${isNew ? '<section class="v2card" id="edWatch"><p class="hint" style="margin:0">Save the idea first, then add the videos creators should watch: tag a Meta ad, paste a creator post, upload a clip, or pull in another brand&#39;s ad from Atria.</p></section>' : `
  <section class="v2card am-c" id="edWatch">
    <div class="v2h" style="margin:0"><h3>Watch first: other brands doing the shape well</h3><span class="find">Brand, what to steal in one line, and the Atria link (app.tryatria.com/ad/m...). <b>Pull the video in</b> stores the ad's video so it plays on the page like one of ours; until then the page shows a link. Save the idea after editing rows.</span></div>
    <div class="am-list-edit" id="eInspo">${(a.inspo || []).map(x => inspoRow(x, clips.has(x.url))).join('')}</div>
    <div><button class="btn am-sm" id="eInspoAdd" type="button">${ic('plus', 13)} Add one</button></div>
  </section>
  ${proofCards(a)}`}

  <section class="v2card am-c" id="edWhy">
    <div class="v2h" style="margin:0"><h3>Why it works</h3><span class="find">One line. Creators see it at the bottom of the idea.</span></div>
    <input class="am-in" id="eWhy" value="${esc(a.why || '')}" placeholder="The wife-with-a-phone gift reveal is the number one ad in golf apparel right now.">
    <div class="am-g2">
      <label class="am-f">Trend or sound to ride <small>optional</small><input class="am-in" id="eTrend" value="${esc(a.trend || '')}"></label>
      <label class="am-f">Lever <small>staff only, never shown</small><input class="am-in" id="eLever" list="amLevers" value="${esc(a.lever || '')}" placeholder="Relief"><datalist id="amLevers">${LEVERS.map(f => `<option value="${esc(f)}">`).join('')}</datalist></label>
    </div>
  </section>
  </div>
  <div class="am-df"><span class="am-msg" id="eMsg"></span><button type="button" class="btn" id="eCancel">Cancel</button><button type="button" class="btn primary" id="eSave">${isNew ? 'Save idea' : 'Save changes'}</button></div>
  </aside>`);

  const body = document.getElementById('amDrawer');
  const scroller = body.querySelector('.am-db');
  if (restore) {
    for (const [id, v] of Object.entries(keep.vals)) { const el = document.getElementById(id); if (!el) continue; if (el.type === 'checkbox') el.checked = v; else el.value = v; }
    S.dirty = true;
  }
  autoGrow(body);
  if (keep?.scroll) scroller.scrollTop = keep.scroll;
  // Leave the drawer if the page under it changes (another screen opened from the keyboard).
  S._mo = new MutationObserver(() => { if (!document.querySelector('#main .am')) { S.edit = null; S.dirty = false; closeDrawer(); } });
  S._mo.observe($('#main'), { childList: true });
  document.getElementById('amScrim').onclick = requestClose;
  body.addEventListener('input', e => { if (!e.target.closest('.am-nodirty')) S.dirty = true; });
  body.querySelectorAll('[data-jump]').forEach(b => b.onclick = () => { const t = body.querySelector('#' + b.dataset.jump); if (t) scroller.scrollTo({ top: t.offsetTop - 8, behavior: 'smooth' }); });
  if (!keep) setTimeout(() => (isNew ? $('#eTitle') : scroller)?.focus?.(), 40);

  $('#amBack').onclick = $('#eCancel').onclick = requestClose;
  $('#eInspoAdd')?.addEventListener('click', () => { $('#eInspo').insertAdjacentHTML('beforeend', inspoRow({})); autoGrow($('#eInspo')); });
  body.addEventListener('click', async e => {
    const btn = e.target.closest('#eInspo [data-pull]');
    if (!btn) return;
    const li = btn.closest('.am-li');
    const url = li.querySelector('[data-iu]').value.trim();
    const m = url.match(/tryatria\.com\/ad\/([mt]\d+)/);
    if (!m) { helpModal('Needs an Atria link', '<p>Paste the ad&#39;s Atria link first, like https://app.tryatria.com/ad/m123456789.</p>'); return; }
    btn.disabled = true; btn.textContent = 'Pulling in...';
    try {
      const res = await fetch(AH_URL + '/api/atria/clip-to-angle', { method: 'POST', headers: { Authorization: 'Bearer ' + S.tok, 'Content-Type': 'application/json' },
        body: JSON.stringify({ act: S.act, angle_id: a.id, ad_id: m[1], who: li.querySelector('[data-ib]').value.trim(), note: li.querySelector('[data-iw]').value.trim() }) });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || !j.ok) throw new Error(j.error || 'Atria did not answer.');
      S.data = await api(`/api/amb?act=${encodeURIComponent(S.act)}`);
      paint();
    } catch (err) { btn.disabled = false; btn.innerHTML = `${ic('download', 13)} Pull the video in`; helpModal('Could not pull the video in', `<p>${esc(err.message)}</p>`); }
  });
  body.addEventListener('click', e => { const r = e.target.closest('#eInspo [data-rm]'); if (r) { r.closest('.am-li').remove(); S.dirty = true; } });
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
      visual_hook: $('#eVis').value.trim(), rehook: $('#eRe').value.trim(), why: $('#eWhy').value.trim(),
      alt_hooks: $('#eAlt').value.split('\n').map(x => x.trim()).filter(Boolean).slice(0, 4),
      inspo: [...body.querySelectorAll('#eInspo .am-li')].map(li => ({ brand: li.querySelector('[data-ib]').value.trim(), what: li.querySelector('[data-iw]').value.trim(), url: li.querySelector('[data-iu]').value.trim() })).filter(x => x.brand || x.what),
    };
    const btn = $('#eSave'); btn.disabled = true;
    try {
      const r = await post('/api/amb/angle', payload);
      S.data = r; S.dirty = false;
      if (isNew) S.edit = r.saved_id;
      paint();
      flashMsg($('#eMsg'), isNew ? 'Saved. Now add the videos to watch below.' : 'Saved');
    } catch (e) { btn.disabled = false; flashMsg($('#eMsg'), e.message, false); }
  };
  const del = $('#amDelAng');
  if (del) del.onclick = async () => {
    if (!(await confirmModal('Delete this idea?', 'It disappears from the creator link, with its examples. Tagged Meta ads are not touched.', 'Delete'))) return;
    try { S.data = await api(`/api/amb/angle?act=${encodeURIComponent(S.act)}&id=${encodeURIComponent(a.id)}`, { method: 'DELETE' }); S.edit = null; S.dirty = false; paint(); }
    catch (e) { helpModal('Could not delete', `<p>${esc(e.message)}</p>`); }
  };
  if (!isNew) wireProof(a, body);
}

function proofCards(a) {
  const d = S.data;
  const mine = d.proof.filter(p => p.angle_id === a.id);
  const metas = mine.filter(p => p.kind === 'meta');
  const others = mine.filter(p => p.kind !== 'meta');
  const sc = a.score;
  const LBL = { post: 'Creator post', typed: 'Example · typed by the team', upload: 'Clip uploaded by the team', inspo: 'Inspiration · another brand' };
  return `
  <section class="v2card am-c am-nodirty">
    <div class="v2h" style="margin:0"><h3>Proof: our Meta ads on this idea</h3><span class="find">Tag an ad once. Creators can play it on the link (videos only); its numbers update themselves and stay here.</span></div>
    ${sc.ads ? `<div class="am-score"${tip('Lifetime numbers of the tagged ads, from the synced Meta data. Staff only.')}><div><b class="good">${kmoney(sc.revenue)}</b> <span>sold</span></div><div><b>${kmoney(sc.spend)}</b> <span>spent</span></div><div><b>${x2(sc.roas)}</b> <span>ROAS</span></div><div><b>${sc.running}</b> <span>spent in 30 days</span></div></div>` : ''}
    <div>${metas.map(p => `<div class="am-row" data-pid="${esc(p.id)}">
      <span class="am-well" style="width:40px;height:52px" data-cover="${esc(p.ad_id)}">${ic('play', 14)}</span>
      <div class="am-grow"><p class="am-t" style="font-size:13.5px">${esc(p.stats?.name || p.ad_id)}</p><p class="am-s">${p.stats ? `${money(p.stats.spend)} spent · <b class="good">${money(p.stats.revenue)}</b> sold · ${x2(p.stats.roas)}${(p.stats.spend30 || 0) > 0 ? ' · running' : ''}${p.stats.media_type === 'image' ? ' · an image, so it never plays on the link' : ''}` : 'No delivery yet'}</p></div>
      ${sw('pshow_' + p.id, p.shown, 'Show on link', `data-pshow="${esc(p.id)}"`)}
      <button type="button" class="btn am-sm" data-pdel="${esc(p.id)}" aria-label="Untag this ad">${ic('x', 14)}</button></div>`).join('') || '<p class="hint" style="margin:0">No ads tagged yet.</p>'}</div>
    <div style="padding-top:12px;border-top:1px solid var(--line);display:flex;flex-direction:column;gap:8px">
      <label class="am-f">Tag a Meta ad <small>search ${esc(d.account.name)}'s ads by name, biggest sellers first</small><input class="am-in" id="pSearch" placeholder="Type part of the ad name, or leave empty to see the top sellers"></label>
      <div class="am-results" id="pResults"><p class="tiny" style="padding:10px">Loading…</p></div>
    </div>
  </section>

  <section class="v2card am-c am-nodirty">
    <div class="v2h" style="margin:0"><h3>Other videos to watch</h3><span class="find">Clips, creator posts and other brands' videos. Each tile on the link says where it came from. These never count toward the score.</span></div>
    <div>${others.map(p => `<div class="am-row" data-pid="${esc(p.id)}">
      <span class="am-well" style="width:40px;height:52px">${ic(p.kind === 'upload' ? 'play' : 'link', 14)}</span>
      <div class="am-grow"><span class="am-src ${esc(isInspoClip(p) ? 'inspo' : p.kind)}">${esc(isInspoClip(p) ? 'Another brand · video stored' : LBL[p.kind])}</span>
        <p class="am-s" style="margin-top:4px">${esc(p.who || '')}${p.views ? ` · ${Number(p.views).toLocaleString()} views` : ''}${p.sales ? ` · ${money(p.sales)} sold (staff only)` : ''}${p.note ? ` · ${esc(p.note)}` : ''}</p>
        ${p.url ? `<a class="tiny" href="${esc(p.url)}" target="_blank" rel="noopener">${esc(p.url.slice(0, 70))}</a>` : ''}</div>
      ${sw('pshow_' + p.id, p.shown, 'Show on link', `data-pshow="${esc(p.id)}"`)}
      <button type="button" class="btn am-sm" data-pdel="${esc(p.id)}" aria-label="Remove this example">${ic('x', 14)}</button></div>`).join('') || '<p class="hint" style="margin:0">No other examples yet. Ideas with no video show creators a "be the first" note instead of an empty space.</p>'}</div>
    <div style="padding-top:12px;border-top:1px solid var(--line);display:flex;flex-direction:column;gap:12px">
      <h3>Add an example</h3>
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
      <div style="display:flex;gap:10px;align-items:center"><button type="button" class="btn primary" id="pAdd">Add example</button><span class="am-msg" id="pMsg"></span></div>
    </div>
  </section>`;
}

function wireProof(a, root) {
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
  /* Is the brief complete? Read from what is saved, so it answers before anyone scrolls. */
  const checks = [
    [!!b.submit_url, 'Submit link', 'Every Film this button needs it'],
    [!!b.logo_url, 'Logo', 'Shows on the link and the PDF'],
    [!!b.intro, 'Intro', 'The top of the page'],
    [!!se.title, 'Season card', 'What is in season now'],
    [(b.hooks || []).length >= 3, `${(b.hooks || []).length} openers`, 'The First seconds tab'],
    [(b.guide || []).length > 0, `${(b.guide || []).length} watch rules`, 'How to keep them watching'],
    [(b.avoid || []).length > 0, `${(b.avoid || []).length} stop filming`, 'Please stop filming these'],
    [(b.rules || []).length > 0, `${(b.rules || []).length} say it right`, 'Claims and wording'],
  ];
  const missing = checks.filter(c => !c[0]).length;
  body.innerHTML = `
  <section class="v2card"><div class="v2h"><h3>Is the brief complete</h3><span class="find">${missing ? `${plural(missing, 'part')} still empty. Fill them below, then Save.` : 'Every part of the link and the PDF is filled in.'}</span></div>
    <div style="display:flex;gap:6px;flex-wrap:wrap">${checks.map(([ok, l, t]) => `<span class="v2pill ${ok ? 'good' : 'warn'}"${tip(t)}>${ok ? '✓' : '!'} ${esc(l)}</span>`).join('')}</div></section>
  <div class="v2card am-brief">
    <div class="am-brief-l">
        <div class="am-pdf"><div class="pg grid">
          ${b.logo_url ? `<img src="${esc(b.logo_url)}" alt="" style="height:18px;width:auto;max-width:90px;object-fit:contain;align-self:flex-start">` : ''}
          <b style="color:${b.logo_url ? 'var(--paper-sub)' : 'var(--paper-ink)'};font-size:${b.logo_url ? 8 : 11}px">${esc(b.display_name)}${b.logo_url ? ' creator brief' : ''}</b>
          <b style="color:var(--paper-ink);font-size:17px;line-height:1.1;margin-top:10px">${esc(pdfText(b).line1)}<br><span style="color:${esc(b.accent || '#3B82F6')}">${esc(pdfText(b).line2)}</span></b>
          <div class="ln"></div><div class="ln" style="width:75%"></div>
          <div class="box" style="display:flex;gap:8px;align-items:center;padding:8px;border-radius:7px;margin-top:4px"><span id="lQr" style="width:46px;height:46px;background:var(--paper-card);border-radius:4px;display:block;flex:none"></span><div style="flex:1;display:flex;flex-direction:column;gap:6px"><div class="ln" style="width:60%"></div><div style="height:12px;border-radius:4px;background:${esc(b.accent || '#3B82F6')}"></div></div></div>
          ${'<div class="box" style="height:14px;margin-top:2px"></div>'.repeat(3)}
        </div></div>
      <div class="am-pdfbtns"><button class="btn primary" id="lPdf">${ic('file-down', 14)} Download PDF</button><button class="btn" id="lQrDl">${ic('qr-code', 14)} QR code</button></div>
      <button class="btn" id="lTxt" style="width:100%">${ic('copy', 14)} Copy brief text</button>
    </div>
    <div class="am-brief-r">
      <div><h3>Brief PDF for ${esc(b.submit_platform || 'TRYBE')}</h3>
        <p class="hint" style="margin:0">Upload it as the campaign brief. ${esc(b.submit_platform || 'TRYBE')} shows creators the words inside the PDF, not the design, so write it the way you want it read: headline, intro, the link, the steps. Leave a box empty to use the default in grey, then press Save before downloading.</p></div>
        <div class="am-g2">
          <label class="am-f">Headline, first line<input class="am-in" id="pL1" value="${esc(b.pdf?.line1 || '')}" placeholder="${esc(pdfText({ ...b, pdf: null }).line1)}"></label>
          <label class="am-f">Headline, second line <small>in the brand colour</small><input class="am-in" id="pL2" value="${esc(b.pdf?.line2 || '')}" placeholder="${esc(pdfText({ ...b, pdf: null }).line2)}"></label>
        </div>
        <label class="am-f">Intro <small>two sentences at most</small><textarea class="am-in" id="pIntro" placeholder="${esc(pdfText({ ...b, pdf: null }).intro)}">${esc(b.pdf?.intro || '')}</textarea></label>
        <div class="am-g2">
          <label class="am-f">Link box heading<input class="am-in" id="pCta" value="${esc(b.pdf?.cta || '')}" placeholder="${esc(pdfText({ ...b, pdf: null }).cta)}"></label>
          <label class="am-f">Note under the link<input class="am-in" id="pNote" value="${esc(b.pdf?.note || '')}" placeholder="${esc(pdfText({ ...b, pdf: null }).note)}"></label>
        </div>
        <div class="am-g3">
          ${[0, 1, 2].map(k => `<label class="am-f">Step ${k + 1}<input class="am-in" data-pstep="${k}" value="${esc(b.pdf?.steps?.[k] || '')}" placeholder="${esc(pdfText({ ...b, pdf: null }).steps[k])}"></label>`).join('')}
        </div>
      <p class="tiny" style="margin:0">Also paste the link into the ${esc(b.submit_platform || 'TRYBE')} campaign description, so creators on phones can tap it.</p>
    </div>
  </div>
  <div class="am-stack">
      <div class="v2card am-c">
        <div><h3>The season card and chart</h3><p class="hint" style="margin:0">What is in season right now. The chart shows either last year's real store sales (no dollar amounts) or a shape you draw to tell creators when to film. Clear the title to hide the card.</p></div>
        <div class="am-f">Chart shape <small>pick Draw it yourself to shape the spikes by hand</small>
          <div class="am-seg" id="sMode" role="group" aria-label="Chart shape">
            <button type="button" data-m="sales">Last year's real sales</button>
            <button type="button" data-m="custom">Draw it yourself</button>
          </div></div>
        <div id="sPrev"><p class="tiny">Loading last year's shape…</p></div>

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
        <div class="am-g2">
          <div class="am-f">Season colour <small>the highlighted bars and the tag</small><div class="am-swatches" id="sSw">${['#7C3AED', '#C2410C', '#DB2777', '#0F766E', '#15803D', '#1D4ED8', '#A16207', '#475569'].map(c => `<button type="button" class="am-swatch ${(se.color || '#7C3AED').toLowerCase() === c.toLowerCase() ? 'on' : ''}" data-c="${c}" style="background:${c}" aria-label="Colour ${c}"></button>`).join('')}<input type="color" class="am-color" id="sCol" value="${esc(se.color || '#7C3AED')}" aria-label="Any colour"></div></div>
          <label class="am-f">Tallest bar <small>trim big spikes so the season stands out</small>
            <select class="am-in" id="sCap">${[['', 'Show every spike in full'], ['4', 'Trim above 4x a normal week'], ['3', 'Trim above 3x'], ['2.5', 'Trim above 2.5x'], ['2', 'Trim above 2x'], ['1.6', 'Trim above 1.6x']].map(([v, t]) => `<option value="${v}" ${String(se.cap || '') === v ? 'selected' : ''}>${t}</option>`).join('')}</select></label>
        </div>
      </div>

      <div class="v2card am-c">
        <h3>The link</h3>
        <label class="am-f">Address <small>set it once. Changing it breaks the link in any PDF already uploaded.</small>
          <div style="display:flex"><span class="am-in am-pre">${esc(PUBLIC_BASE.replace('https://', ''))}</span><input class="am-in" id="lSlug" style="border-radius:0 8px 8px 0;font-weight:700" value="${esc(b.slug)}"></div></label>
        <label class="am-f">Name creators see<input class="am-in" id="lName" value="${esc(b.display_name || '')}"></label>
      </div>

      <div class="v2card am-c">
        <div style="display:flex;gap:10px;align-items:flex-start">${badge(S.icons.video, '#DB2777', 34)}<div><h3>Where creators submit</h3><p class="hint" style="margin:0">Paste it once. Every Film this button on the link uses it, so changing it here changes it everywhere, straight away. Left empty, the button reads "Submit this on ${esc(b.submit_platform || 'TRYBE')}" as plain text.</p></div></div>
        <div class="am-g3">
          <label class="am-f">Platform<input class="am-in" id="lPlat" value="${esc(b.submit_platform || 'TRYBE')}"></label>
          <label class="am-f" style="grid-column:span 2">Campaign link<input class="am-in" id="lSubmit" value="${esc(b.submit_url || '')}" placeholder="https://..."></label>
        </div>
        <label class="am-f">Button says<input class="am-in" id="lBtn" value="${esc(b.submit_label || '')}" placeholder="Film this on ${esc(b.submit_platform || 'TRYBE')}"></label>
      </div>

      <div class="v2card am-c">
        <h3>How the page looks and reads</h3>
        <div class="am-g2">
          <label class="am-f">Logo link <small>optional. A PNG or WebP on https, dark on a clear background (the store's header logo works). Shows on the link and the PDF. Empty shows the name.</small><input class="am-in" id="lLogo" value="${esc(b.logo_url || '')}" placeholder="https://cdn.shopify.com/.../logo.png"></label>
          <div class="am-f">Brand colour<div class="am-swatches" id="lSw">${['#D6336C', '#1D4ED8', '#0F766E', '#15803D', '#7C3AED', '#C2410C', '#13202B'].map(c => `<button type="button" class="am-swatch ${(b.accent || '').toLowerCase() === c.toLowerCase() ? 'on' : ''}" data-c="${c}" style="background:${c}" aria-label="Colour ${c}"></button>`).join('')}<input type="color" class="am-color" id="lAcc" value="${esc(b.accent || '#13202B')}" aria-label="Any colour"></div></div>
        </div>
        <label class="am-f">Intro <small>top of the page and the PDF. Two or three lines.</small><textarea class="am-in" id="lIntro">${esc(b.intro || '')}</textarea></label>
        <div class="am-g2">
          <label class="am-f">What it is <small>the product in plain words</small><textarea class="am-in" id="lAbout">${esc(b.about || '')}</textarea></label>
          <label class="am-f">Who we are talking to<textarea class="am-in" id="lAud">${esc(b.audience || '')}</textarea></label>
        </div>
      </div>

      <div class="v2card am-c">
        <div><h3>First seconds: ways to open a video</h3><p class="hint" style="margin:0">The "First seconds" tab on the link. One row per opener: a short name, one line of how to do it, whether it is made for this brand or works for any brand, and an example (an Atria link, or the id of a stored clip from one of this brand's ideas). Shared rows are copied per brand, so rewording one here changes it only for this brand.</p></div>
        <div class="am-list-edit" id="lHooks">${(b.hooks?.length ? b.hooks : [{ title: '', how: '', kind: 'brand' }]).map(x => hookRow(x)).join('')}</div>
        <div><button class="btn" id="lHookAdd" type="button">${ic('plus', 13)} Add an opener</button></div>
      </div>

      <div class="v2card am-c">
        <div><h3>How to keep them watching</h3><p class="hint" style="margin:0">A numbered card on the link, under What's working. Short rules on holding attention: the first second, the 3-second rehook, the close. One rule per row: a bold title and one line of plain explanation. Empty rows are skipped; no rows hides the card.</p></div>
        <div class="am-list-edit" id="lGuide">${(b.guide?.length ? b.guide : [{ title: '', text: '' }]).map(x => guideRow(x)).join('')}</div>
        <div><button class="btn" id="lGuideAdd" type="button">${ic('plus', 13)} Add a rule</button></div>
      </div>

      <div class="v2card am-c">
        <div><h3 style="color:var(--bad)">Please stop filming these</h3><p class="hint" style="margin:0">A red card near the top of the link. Name the video everyone keeps sending, and say why.</p></div>
        <div class="am-list-edit" id="lAvoid">${avoid.map(x => avoidRow(x)).join('')}</div>
        <div><button class="btn" id="lAvoidAdd" type="button">${ic('plus', 13)} Add one</button></div>
      </div>

      <div class="v2card am-c">
        <div><h3>Say it right</h3><p class="hint" style="margin:0">Claims and wording rules, shown as a short checklist.</p></div>
        <div class="am-list-edit" id="lRules">${rules.map(x => ruleRow(x)).join('')}</div>
        <div><button class="btn" id="lRuleAdd" type="button">${ic('plus', 13)} Add a rule</button></div>
      </div>

      <div class="v2card">
        <div style="display:flex;justify-content:space-between;align-items:center;gap:12px"><div><h3>Inspiration from other brands</h3><p class="hint" style="margin:0">Show tiles labelled Inspiration, which open the other brand's post.</p></div>${sw('lInspo', b.show_inspo, '')}</div>
      </div>
  </div>
  <div class="am-save"><span class="am-msg" id="lMsg"></span><button class="btn primary" id="lSave">Save</button></div>`;

  let accent = b.accent || '#13202B';
  const syncSw = () => body.querySelectorAll('#lSw .am-swatch').forEach(x => x.classList.toggle('on', x.dataset.c.toLowerCase() === accent.toLowerCase()));
  body.querySelectorAll('#lSw .am-swatch').forEach(x => x.onclick = () => { accent = x.dataset.c; $('#lAcc').value = accent; syncSw(); });
  $('#lAcc').oninput = e => { accent = e.target.value.toUpperCase(); syncSw(); };
  $('#lAvoidAdd').onclick = () => { $('#lAvoid').insertAdjacentHTML('beforeend', avoidRow({})); autoGrow($('#lAvoid')); };
  $('#lRuleAdd').onclick = () => { $('#lRules').insertAdjacentHTML('beforeend', ruleRow('')); autoGrow($('#lRules')); };
  $('#lGuideAdd').onclick = () => { $('#lGuide').insertAdjacentHTML('beforeend', guideRow({})); autoGrow($('#lGuide')); };
  $('#lHookAdd').onclick = () => { $('#lHooks').insertAdjacentHTML('beforeend', hookRow({ kind: 'brand' })); autoGrow($('#lHooks')); };
  body.addEventListener('click', e => { const r = e.target.closest('[data-rm]'); if (r) r.closest('.am-li').remove(); });
  $('#lTxt').onclick = async e => {
    const btn = e.currentTarget;
    try { await navigator.clipboard.writeText(briefText(S.data.brand)); btn.innerHTML = `${ic('check', 14)} Copied`; setTimeout(() => { btn.innerHTML = `${ic('copy', 14)} Copy brief text`; }, 1600); }
    catch { helpModal('Copy this text', `<pre style="white-space:pre-wrap;font:inherit">${esc(briefText(S.data.brand))}</pre>`); }
  };
  $('#lQrDl').onclick = () => qrPng().catch(err => helpModal('Could not make the QR code', `<p>${esc(err.message)}</p>`));
  $('#lPdf').onclick = () => makePdf().catch(err => helpModal('Could not build the PDF', `<p>${esc(err.message)}</p>`));
  qrInto($('#lQr')).catch(() => {});

  const isoWeek = ymd => {
    const d = new Date(`${ymd}T12:00:00Z`);
    const day = (d.getUTCDay() + 6) % 7;
    d.setUTCDate(d.getUTCDate() - day + 3);
    const first = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
    return 1 + Math.round(((d - first) / 86400000 - 3 + ((first.getUTCDay() + 6) % 7)) / 7);
  };
  const addD = (d, n) => { const t = new Date(d + 'T12:00:00Z'); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10); };
  body._mode = se.mode === 'custom' ? 'custom' : 'sales';
  body._custom = { ...(se.custom || {}) };
  /* Q4 ramp: quiet summer, a climb through October with a Halloween spike,
     Black Friday week near the top, December at the peak. 25 = a normal week. */
  const ramp = ymd => {
    const m = +ymd.slice(5, 7), d = +ymd.slice(8, 10);
    if (m === 10) return d >= 22 ? 85 : Math.round(45 + (d / 31) * 30);
    if (m === 11) return d >= 20 ? 95 : 58;
    if (m === 12) return d <= 6 ? 88 : d <= 21 ? 100 : 70;
    if (m === 9) return d >= 20 ? 40 : 30;
    if (m === 1) return d <= 14 ? 45 : 35;
    if (m === 2) return 35;
    return 25;
  };
  const drawSeason = async () => {
    try {
      if (body._chart === undefined) body._chart = (await api(`/api/amb/season?act=${encodeURIComponent(S.act)}`)).chart;
      const ch = body._chart;
      const mode = body._mode;
      body.querySelectorAll('#sMode button').forEach(b => b.classList.toggle('on', b.dataset.m === mode));
      const capRow = $('#sCap')?.closest('.am-f');
      if (capRow) capRow.style.display = mode === 'custom' ? 'none' : '';
      const color = body._sColor ? body._sColor() : (se.color || '#7C3AED');
      const h0 = $('#sH0').value.trim(), h1 = $('#sH1').value.trim();
      const hi = w => { if (!h0 || !h1) return false; const a = w.week_of.slice(5), e = addD(w.week_of, 6).slice(5); return h0 <= h1 ? (e >= h0 && a <= h1) : (e >= h0 || a <= h1); };
      // The same 52 weeks either way: 13 behind this week, 38 ahead.
      const start = addD(new Date().toISOString().slice(0, 10), -91);
      const weeks = ch ? ch.weeks : Array.from({ length: 52 }, (_, k) => ({ week_of: addD(start, k * 7), x: null }));
      const n = weeks.length, base = 120;
      const nowI = ch?.now_index ?? 13;
      const nx = nowI * 10 + 5;
      const nowLine = `<line x1="${nx}" y1="6" x2="${nx}" y2="${base}" stroke="var(--ink)" stroke-width="1.4" stroke-dasharray="3 3" vector-effect="non-scaling-stroke"/>`;
      const months = (() => { let last = '', lastI = -9, out = ''; weeks.forEach((w, k) => { const m = new Date(w.week_of + 'T12:00:00Z').toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' }); if (m !== last) { if (k - lastI >= 3) { out += `<span style="position:absolute;left:${k / n * 100}%;font-size:10px;color:var(--muted)">${m}</span>`; lastI = k; } last = m; } }); return `<div style="position:relative;height:14px;margin-top:3px">${out}</div>`; })();

      if (mode === 'sales') {
        if (!ch) { $('#sPrev').innerHTML = '<p class="tiny">Not enough sales history for a chart yet. Switch to Draw it yourself, or the card shows without a chart.</p>'; return; }
        const xs = ch.weeks.map(w => w.x).filter(v => v != null);
        const peak = Math.max(...xs);
        const cap = +$('#sCap').value || 0;
        const top = Math.max(cap ? Math.min(cap, peak) : peak, 1.2);
        const bars = ch.weeks.map((w, k) => {
          const h = w.x == null ? 3 : Math.max(3, Math.min(w.x, top) / top * (base - 14));
          return `<rect x="${k * 10 + 1.5}" y="${base - h}" width="7" height="${h}" rx="1.5" fill="${w.x == null ? 'var(--surface-2)' : hi(w) ? color : 'var(--line-strong)'}"${tip(`Week of ${esc(w.week_of)}: ${w.x == null ? 'no data' : w.x.toFixed(1) + 'x a normal week'}`)}></rect>${w.x > top ? `<rect x="${k * 10 + 1.5}" y="${base - h}" width="7" height="3" fill="var(--ink)" opacity=".5"/>` : ''}`;
        }).join('');
        $('#sPrev').innerHTML = `<p class="am-lbl" style="margin-bottom:6px">What creators see · titled "Last year, week by week"</p>
          <svg viewBox="0 0 ${n * 10} ${base}" preserveAspectRatio="none" style="width:100%;height:120px;display:block">${bars}${nowLine}</svg>${months}
          <p class="tiny" style="margin-top:6px">Real store sales from last year. Busiest week: ${peak.toFixed(1)}x a normal week.${cap && peak > top ? ' Bars above the limit are trimmed and marked.' : ''} The dashed line is this week. Want a bigger Q4 spike? Switch to Draw it yourself.</p>`;
        return;
      }

      // Draw it yourself: drag bars up or down.
      const val = w => { const v = body._custom[isoWeek(w.week_of)]; return v == null ? 25 : v; };
      const barsHtml = () => weeks.map((w, k) => {
        const v = val(w), h = Math.max(3, v / 100 * (base - 8));
        const fill = hi(w) ? color : v >= 55 ? color : 'var(--line-strong)';
        return `<rect x="${k * 10 + 1.5}" y="${base - h}" width="7" height="${h}" rx="1.5" fill="${fill}" ${!hi(w) && v >= 55 ? 'fill-opacity=".5"' : ''}/>`;
      }).join('');
      $('#sPrev').innerHTML = `<p class="am-lbl" style="margin-bottom:6px">What creators see · titled "When to film"</p>
        <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:10px">
          <button type="button" class="btn" data-pre="ramp">Q4 ramp</button>
          <button type="button" class="btn" data-pre="sales" ${ch ? '' : 'disabled'}>Copy last year's sales</button>
          <button type="button" class="btn" data-pre="boost">Push the season higher</button>
          <button type="button" class="btn" data-pre="flat">Start flat</button>
        </div>
        <div class="am-season-ed">
          <svg id="sEd" viewBox="0 0 ${n * 10} ${base}" preserveAspectRatio="none" style="width:100%;height:170px;display:block;touch-action:none;cursor:ns-resize">
            <line x1="0" y1="${base - 25 / 100 * (base - 8)}" x2="${n * 10}" y2="${base - 25 / 100 * (base - 8)}" stroke="var(--muted)" stroke-dasharray="4 4" vector-effect="non-scaling-stroke"/>
            <g id="sEdBars">${barsHtml()}</g>${nowLine}
          </svg>${months}
          <span id="sEdTip" class="am-season-tip"></span>
        </div>
        <p class="tiny" style="margin-top:6px">Click or drag across the bars to set how busy each week is. The dotted line is a normal week. Bars you raise past busy show in the season colour. Creators see Quiet, Normal, Busy or Peak, never a number. It repeats on the same weeks next year.</p>`;
      const svg = $('#sEd'), tipEl = $('#sEdTip');
      let down = false;
      const setAt = e => {
        const r = svg.getBoundingClientRect();
        const k = Math.max(0, Math.min(n - 1, Math.floor((e.clientX - r.left) / r.width * n)));
        const v = Math.max(0, Math.min(100, Math.round((1 - (e.clientY - r.top) / r.height) * 105 / 5) * 5));
        body._custom[isoWeek(weeks[k].week_of)] = v;
        $('#sEdBars').innerHTML = barsHtml();
        tipEl.style.display = 'block';
        tipEl.textContent = `Week of ${weeks[k].week_of.slice(5)}: ${v >= 80 ? 'Peak' : v >= 55 ? 'Busy' : v >= 30 ? 'Normal' : 'Quiet'} (${v})`;
      };
      svg.addEventListener('pointerdown', e => { down = true; svg.setPointerCapture(e.pointerId); setAt(e); });
      svg.addEventListener('pointermove', e => { if (down) setAt(e); });
      svg.addEventListener('pointerup', () => { down = false; });
      body.querySelectorAll('[data-pre]').forEach(b => b.onclick = () => {
        const k = b.dataset.pre;
        weeks.forEach(w => {
          const wk = isoWeek(w.week_of);
          if (k === 'ramp') body._custom[wk] = ramp(w.week_of);
          else if (k === 'flat') body._custom[wk] = 25;
          else if (k === 'sales' && ch) body._custom[wk] = w.x == null ? 25 : Math.min(100, Math.round(w.x * 25));
          else if (k === 'boost' && hi(w)) body._custom[wk] = Math.min(100, Math.round(val(w) * 1.5 + 10));
        });
        drawSeason();
      });
    } catch (e) { $('#sPrev').innerHTML = `<p class="tiny">${esc(e.message)}</p>`; }
  };
  body.querySelectorAll('#sMode button').forEach(b => b.onclick = () => {
    body._mode = b.dataset.m;
    if (body._mode === 'custom' && !Object.keys(body._custom).length) {
      const start = addD(new Date().toISOString().slice(0, 10), -91);
      for (let k = 0; k < 52; k++) { const d = addD(start, k * 7); body._custom[isoWeek(d)] = ramp(d); }
    }
    drawSeason();
  });
  let sColor = se.color || '#7C3AED';
  const syncS = () => body.querySelectorAll('#sSw .am-swatch').forEach(x => x.classList.toggle('on', x.dataset.c.toLowerCase() === sColor.toLowerCase()));
  body.querySelectorAll('#sSw .am-swatch').forEach(x => x.onclick = () => { sColor = x.dataset.c; $('#sCol').value = sColor; syncS(); drawSeason(); });
  $('#sCol').oninput = e => { sColor = e.target.value.toUpperCase(); syncS(); drawSeason(); };
  body._sColor = () => sColor;
  drawSeason();
  $('#sH0').onchange = $('#sH1').onchange = $('#sCap').onchange = drawSeason;

  $('#lSave').onclick = async () => {
    const avoidOut = [...body.querySelectorAll('#lAvoid .am-li')].map(li => ({ title: li.querySelector('[data-at]').value.trim(), why: li.querySelector('[data-aw]').value.trim() })).filter(x => x.title);
    const rulesOut = [...body.querySelectorAll('#lRules [data-r]')].map(i => i.value.trim()).filter(Boolean);
    const title = $('#sTitle').value.trim();
    const payload = {
      slug: $('#lSlug').value.trim().toLowerCase(), display_name: $('#lName').value.trim(),
      submit_platform: $('#lPlat').value.trim() || 'TRYBE', submit_url: $('#lSubmit').value.trim(), submit_label: $('#lBtn').value.trim(),
      logo_url: $('#lLogo').value.trim(), accent, intro: $('#lIntro').value.trim(), about: $('#lAbout').value.trim(), audience: $('#lAud').value.trim(),
      avoid: avoidOut, rules: rulesOut, show_inspo: $('#lInspo').checked,
      guide: [...body.querySelectorAll('#lGuide .am-li')].map(li => ({ title: li.querySelector('[data-gt]').value.trim(), text: li.querySelector('[data-gx]').value.trim() })).filter(x => x.title || x.text),
      hooks: [...body.querySelectorAll('#lHooks .am-li')].map(li => ({ title: li.querySelector('[data-ht]').value.trim(), how: li.querySelector('[data-hh]').value.trim(), kind: li.querySelector('[data-hk]').value, url: li.querySelector('[data-hu]').value.trim(), clip: (li.querySelector('[data-hu]').value.trim().match(/^[a-f0-9]{16}$/) || [])[0] || null })).map(x => (x.clip ? { ...x, url: '' } : x)).filter(x => x.title || x.how),
      pdf: {
        line1: $('#pL1').value.trim(), line2: $('#pL2').value.trim(), intro: $('#pIntro').value.trim(),
        cta: $('#pCta').value.trim(), note: $('#pNote').value.trim(),
        steps: [0, 1, 2].map(k => body.querySelector(`[data-pstep="${k}"]`).value.trim()),
      },
      season: title ? { title, until: $('#sUntil').value.trim(), next: $('#sNext').value.trim(), line: $('#sLine').value.trim(), highlight: [$('#sH0').value.trim(), $('#sH1').value.trim()], show_chart: $('#sChart').checked, color: body._sColor ? body._sColor() : null, cap: +$('#sCap').value || null, mode: body._mode, custom: body._custom } : null,
    };
    if (payload.slug !== b.slug && !(await confirmModal('Change the link address?', 'Any PDF or message that already has the old link will stop working.', 'Change it'))) return;
    try { S.data = await post('/api/amb/brand', payload, 'PUT'); paint(); flashMsg($('#lMsg'), 'Saved. The link is updated.'); }
    catch (e) { flashMsg($('#lMsg'), e.message, false); }
  };
}
const avoidRow = x => `<div class="am-li"><textarea class="am-in grow" rows="1" data-at placeholder="What to stop filming">${esc(x.title || '')}</textarea><textarea class="am-in grow" rows="1" data-aw placeholder="Why, in one line">${esc(x.why || '')}</textarea><button class="btn" type="button" data-rm aria-label="Remove">${ic('x', 14)}</button></div>`;
const hookRow = x => `<div class="am-li hook"><textarea class="am-in grow" rows="1" data-ht placeholder="Short name, e.g. Dump it on the counter">${esc(x.title || '')}</textarea><textarea class="am-in grow" rows="1" data-hh placeholder="How to do it, one line">${esc(x.how || '')}</textarea><select class="am-in" data-hk><option value="brand" ${x.kind === 'brand' ? 'selected' : ''}>Made for this brand</option><option value="shared" ${x.kind !== 'brand' ? 'selected' : ''}>Any brand</option></select><textarea class="am-in grow" rows="1" data-hu placeholder="Atria link, or a stored clip id">${esc(x.clip || x.url || '')}</textarea><button class="btn" type="button" data-rm aria-label="Remove">${ic('x', 14)}</button></div>`;
const guideRow = x => `<div class="am-li"><textarea class="am-in grow" rows="1" data-gt placeholder="Rule, e.g. Do something with your hands in the first second">${esc(x.title || '')}</textarea><textarea class="am-in grow" rows="1" data-gx placeholder="One line of why, with an example">${esc(x.text || '')}</textarea><button class="btn" type="button" data-rm aria-label="Remove">${ic('x', 14)}</button></div>`;
const inspoRow = (x, pulled) => `<div class="am-li three"><textarea class="am-in grow" rows="1" data-ib placeholder="Brand">${esc(x.brand || '')}</textarea><textarea class="am-in grow" rows="1" data-iw placeholder="What to steal, in one line">${esc(x.what || '')}</textarea><textarea class="am-in grow" rows="1" data-iu placeholder="https://app.tryatria.com/ad/m...">${esc(x.url || '')}</textarea><span style="display:flex;gap:6px">${pulled ? `<span class="am-chip good" title="The video is stored and plays on the page">${ic('check', 12)} Video in</span>` : `<button class="btn" type="button" data-pull title="Store this ad's video so it plays on the page">${ic('download', 13)} Pull the video in</button>`}<button class="btn" type="button" data-rm aria-label="Remove">${ic('x', 14)}</button></span></div>`;
const ruleRow = x => `<div class="am-li one"><textarea class="am-in grow" rows="1" data-r placeholder="e.g. Say 'for a better next day', never 'cures hangovers'">${esc(x || '')}</textarea><button class="btn" type="button" data-rm aria-label="Remove">${ic('x', 14)}</button></div>`;

/* ---------- PDF + QR ---------- */
const pdfText = b => {
  const t = b.pdf || {};
  const plat = b.submit_platform || 'TRYBE';
  const steps = (t.steps && t.steps.length === 3) ? t.steps : ['Open the link and pick an idea', 'Film it your way, starting with the opener', `Submit it on ${plat} with the idea's name`];
  return {
    line1: t.line1 || `${b.display_name} creators,`,
    line2: t.line2 || 'start here.',
    intro: t.intro || `Everything we want you to film for ${b.display_name} lives on one page that updates on its own.`,
    cta: t.cta || 'Open the creator hub',
    note: t.note || 'Opens on your phone. No login needed.',
    steps,
  };
};
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
/* THE TEXT LAYER IS THE BRIEF ON TRYBE. TRYBE does not show the PDF: it pulls
   the text out, in the order it was drawn, and formats that as the creator's
   brief. So every piece of text below is drawn in reading order, as whole
   sentences, one per line where it matters (steps are "1. ...", never a lone
   digit in a circle), and nothing decorative carries words. The same page
   still has to look right wherever the PDF itself is opened. */
function briefText(b) {
  const T = pdfText(b);
  const url = PUBLIC_BASE + b.slug;
  return [
    `${T.line1} ${T.line2}`,
    '',
    T.intro,
    '',
    `${T.cta}: ${url}`,
    T.note,
    '',
    'How it works',
    ...T.steps.map((s, i) => `${i + 1}. ${s}`),
  ].join('\n');
}

// A logo URL as a PNG data URI via canvas (jsPDF cannot read WebP or SVG). The host must
// allow cross-origin reads (Shopify's /cdn/shop/files does); anything else returns null.
function logoData(src) {
  if (!src) return Promise.resolve(null);
  return new Promise(res => {
    const im = new Image();
    im.crossOrigin = 'anonymous';
    const done = v => { clearTimeout(t); res(v); };
    const t = setTimeout(() => done(null), 8000);
    im.onload = () => {
      try {
        const k = Math.min(1, 600 / im.naturalWidth);
        const w = Math.round(im.naturalWidth * k) || 600, h = Math.round(im.naturalHeight * k) || 200;
        const c = document.createElement('canvas'); c.width = w; c.height = h;
        const g = c.getContext('2d'); g.drawImage(im, 0, 0, w, h);
        // Trim clear margins so the mark, not its padding, sets the size.
        const px = g.getImageData(0, 0, w, h).data;
        let x0 = w, y0 = h, x1 = -1, y1 = -1;
        for (let yy = 0; yy < h; yy++) for (let xx = 0; xx < w; xx++) {
          if (px[(yy * w + xx) * 4 + 3] > 16) { if (xx < x0) x0 = xx; if (xx > x1) x1 = xx; if (yy < y0) y0 = yy; if (yy > y1) y1 = yy; }
        }
        if (x1 < 0) return done(null);
        const tw = x1 - x0 + 1, th = y1 - y0 + 1;
        const o = document.createElement('canvas'); o.width = tw; o.height = th;
        o.getContext('2d').drawImage(c, x0, y0, tw, th, 0, 0, tw, th);
        done({ data: o.toDataURL('image/png'), w: tw, h: th });
      } catch { done(null); }
    };
    im.onerror = () => done(null);
    im.src = src;
  });
}
async function makePdf() {
  await loadScript(JSPDF_URL);
  const b = S.data.brand;
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: 'pt', format: 'letter' });
  const W = 612, H = 792, M = 52;
  const url = PUBLIC_BASE + b.slug;
  const plat = b.submit_platform || 'TRYBE';
  const acc = hexRgb(b.accent || '#3B82F6');
  const BG = [247, 248, 250], PANEL = [255, 255, 255], EDGE = [223, 227, 233], TXT = [10, 11, 13], SUB = [95, 100, 114], DIM = [139, 144, 156];
  const op = o => doc.setGState(new doc.GState({ opacity: o, 'stroke-opacity': o }));
  const T = pdfText(b);
  doc.setProperties({ title: `${b.display_name} Creator Brief`, subject: T.intro, author: b.display_name, creator: 'Mobius Digital' });

  // Ground: light paper, a faint grid, one soft glow in the brand colour. No text.
  doc.setFillColor(...BG); doc.rect(0, 0, W, H, 'F');
  op(0.06); doc.setDrawColor(10, 11, 13); doc.setLineWidth(0.4);
  for (let x = 0; x <= W; x += 36) doc.line(x, 0, x, H);
  for (let y = 0; y <= H; y += 36) doc.line(0, y, W, y);
  doc.setFillColor(...acc);
  [170, 120, 70].forEach((r, i) => { op(0.04 + i * 0.03); doc.circle(W - 30, 30, r, 'F'); });
  op(1);

  // 1. Logo (an image, so TRYBE never sees it), then the name line: that text is
  //    still the first words TRYBE shows. No logo, or one that will not load: name only.
  let y = M + 6;
  const logo = await logoData(b.logo_url);
  if (logo) {
    // Wide wordmarks run long and short, compact marks run taller: about the same presence.
    const ar = logo.w / logo.h;
    let lw = Math.min(200, Math.max(110, 46 * ar)), lhh = lw / ar;
    if (lhh > 56) { lhh = 56; lw = lhh * ar; }
    doc.addImage(logo.data, 'PNG', M, M - 18, lw, lhh, undefined, 'FAST');
    y = M - 18 + lhh + 20;
  }
  doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor(...SUB);
  doc.text(`${b.display_name} creator brief`, M, y);
  y += logo ? 62 : 80;
  let hs = 44;
  while (hs > 26 && Math.max(doc.setFontSize(hs).getTextWidth(T.line1), doc.getTextWidth(T.line2)) > W - 2 * M) hs -= 2;
  doc.setFontSize(hs); doc.setTextColor(...TXT);
  doc.text(T.line1, M, y);
  doc.setTextColor(...acc);
  doc.text(T.line2, M, y + hs * 1.05);
  y += hs * 1.05 + 38;

  // 2. Intro.
  doc.setFont('helvetica', 'normal'); doc.setFontSize(12); doc.setTextColor(...SUB);
  const it = doc.splitTextToSize(T.intro, W - 2 * M - 30);
  doc.text(it, M, y); y += it.length * 16 + 28;

  // 3. The link panel: heading, instruction, the full link, the note.
  const ph = 206, py = y;
  doc.setFillColor(...PANEL); doc.setDrawColor(...EDGE); doc.setLineWidth(1);
  doc.roundedRect(M, py, W - 2 * M, ph, 14, 14, 'FD');
  const qs = 150, qx = M + 24, qy = py + 28;
  const tx = qx + qs + 28, tw = W - M - 24 - tx;
  doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.setTextColor(...acc);
  doc.text(T.cta, tx, py + 44);
  doc.setFontSize(20); doc.setTextColor(...TXT);
  const ins = doc.splitTextToSize('Tap the link or scan the code.', tw);
  doc.text(ins, tx, py + 72);
  const by = py + 72 + (ins.length - 1) * 23 + 20, bh = 40;
  doc.setFillColor(...acc); doc.roundedRect(tx, by, tw, bh, 9, 9, 'F');
  let ls = 10.5;
  doc.setFont('helvetica', 'bold');
  while (ls > 7 && doc.setFontSize(ls).getTextWidth(url) > tw - 44) ls -= 0.5;
  doc.setFontSize(ls); doc.setTextColor(255, 255, 255);
  doc.textWithLink(url, tx + 14, by + bh / 2 + ls * 0.35, { url });
  doc.setDrawColor(255, 255, 255); doc.setLineWidth(1.4);
  const ax = tx + tw - 20, ay = by + bh / 2;
  doc.line(ax - 8, ay, ax + 4, ay); doc.line(ax, ay - 4, ax + 4, ay); doc.line(ax, ay + 4, ax + 4, ay);
  doc.link(tx, by, tw, bh, { url });
  doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(...DIM);
  doc.text(doc.splitTextToSize(T.note, tw)[0], tx, by + bh + 20);
  // The code carries no words, so it is drawn after them.
  doc.setFillColor(255, 255, 255); doc.setDrawColor(...EDGE);
  doc.roundedRect(qx, qy, qs, qs, 10, 10, 'FD');
  doc.addImage(await qrData(6), 'GIF', qx + 8, qy + 8, qs - 16, qs - 16);
  doc.link(qx, qy, qs, qs, { url });
  y = py + ph + 40;

  // 4. How it works: one full line per step.
  doc.setFont('helvetica', 'bold'); doc.setFontSize(13); doc.setTextColor(...TXT);
  doc.text('How it works', M, y);
  y += 22;
  T.steps.forEach((s, i) => {
    doc.setFillColor(...PANEL); doc.setDrawColor(...EDGE); doc.setLineWidth(0.8);
    doc.roundedRect(M, y, W - 2 * M, 38, 9, 9, 'FD');
    doc.setFillColor(...acc); doc.roundedRect(M, y, 5, 38, 2, 2, 'F');
    doc.setFont('helvetica', 'bold'); doc.setFontSize(12); doc.setTextColor(...TXT);
    doc.text(`${i + 1}.  ${s}`, M + 20, y + 24);
    y += 46;
  });

  // 5. Footer.
  doc.setDrawColor(...EDGE); doc.setLineWidth(0.8); doc.line(M, H - 50, W - M, H - 50);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.setTextColor(...DIM);
  doc.text(`${b.display_name} creator program on ${plat}. Powered by Mobius Digital.`, M, H - 32);
  doc.save(`${b.slug}-creator-brief.pdf`);
}

window.AmbTab = { render };
})();

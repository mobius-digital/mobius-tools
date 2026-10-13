/* Locus - the Season tab.
 * 2026-10-05 built; 2026-10-06 goals, results, desk, swipe; same night rebuilt twice after Cole:
 * "I still don't see what our offers are", "it's a long scroll", "the season bar looks like Canva".
 *
 * 2026-10-13: ONE JOB. The season item is three pages: The Plan (desk.js warplan: baseline, goals and
 * ladder, budget, offers, alerts, stock), Live (desk.js warlive: today against the plan, the desk) and
 * this file = OFFERS AND DATES. The Goals and results tab and the Desk tab were removed from here
 * because the other two pages own them; the offer list and the offer editor are shared with The Plan
 * (window.SeasonTab.dealsHtml / editPhase).
 *
 * Shape now:
 *   All clients   The offers (default): one card per brand, the key deal in big type,
 *                 November and December beside it, a season bar with hover. Then This week
 *                 and Week by week as segments.
 *   One brand     Strip, then THE PLAN IN ONE READ (numbered sentences + "why this offer"),
 *                 the season timeline (one row per phase, hover for the deal), then three
 *                 in-page tabs: Offers, To-do, Call sheet. No long scroll.
 *   Swipe file    Opens as a modal, never injected into the page.
 *   Client link   ?season=<token>: plan, timeline, offers, results and what we did, read only.
 *
 * Dates for every deliverable are DERIVED from the phase dates by the worker
 * (briefs 23 days before live, built 9, loaded 4), so moving a launch moves its work.
 * Own file and closure like amb.js. The host hands in token, URL, client, accounts.
 */
(function () {
'use strict';

const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const S = { url: '', tok: '', act: 'all', accounts: [], pick: null, data: null, view: 'offers', btab: 'offers' };
const LS_VIEW = 'se_view3', LS_BTAB = 'se_btab';
/* The season item's name (settings.seasonTab, kept by index.html). Headings use it; real dates stay Black Friday. */
const seasonLabel = () => { try { return (window.SEASON_TAB && window.SEASON_TAB().label) || 'Black Friday'; } catch { return 'Black Friday'; } };
const ALL_VIEWS = ['offers', 'now', 'cal'], BRAND_TABS = ['offers', 'todo', 'sheet'];
const AH = 'https://mobius-account-health.mobius-digital.workers.dev';

async function api(path, opts = {}, base) {
  const res = await fetch((base || S.url).replace(/\/+$/, '') + path, {
    ...opts,
    headers: { Authorization: 'Bearer ' + S.tok, ...(opts.body ? { 'Content-Type': 'application/json' } : {}), ...(opts.headers || {}) },
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(j.error || ('HTTP ' + res.status));
  return j;
}
const put = (p, b, m = 'PUT') => api(p, { method: m, body: JSON.stringify(b) });

/* ---------- dates (all plain YYYY-MM-DD strings, Central) ---------- */
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const toD = iso => new Date(iso + 'T00:00:00Z');
const addDays = (iso, n) => { const d = toD(iso); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const fmtD = iso => iso ? `${MON[toD(iso).getUTCMonth()]} ${toD(iso).getUTCDate()}` : '';
const fmtDow = iso => iso ? `${DOW[toD(iso).getUTCDay()]} ${fmtD(iso)}` : '';
const fmtRange = (a, b) => !a ? 'no date' : (!b || b === a) ? fmtDow(a) : `${fmtD(a)} to ${fmtD(b)}`;
const monday = iso => addDays(iso, -((toD(iso).getUTCDay() + 6) % 7));
const daysBetween = (a, b) => Math.round((toD(b) - toD(a)) / 86400000);
const money = n => n == null ? ' - ' : new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);
const moneyK = n => n == null ? ' - ' : Math.abs(n) >= 10000 ? '$' + (n / 1000).toFixed(n >= 100000 ? 0 : 1) + 'k' : money(n);
const x2 = n => n == null ? ' - ' : n.toFixed(2) + 'x';

const GRP = { nov: ['November', 'var(--se-nov)'], bf: ['Black Friday', 'var(--se-bf)'], dec: ['December', 'var(--se-dec)'], late: ['After Christmas', 'var(--se-late)'], vday: ['Valentine\'s', 'var(--se-vday)'] };
const STATUS = { locked: ['Locked', 'good'], draft: ['Draft', 'warn'], missing: ['Missing', 'bad'], skip: ['Skipped', 'unk'] };
/* v2 pieces (window.V2UI from v2.js); the fallbacks only matter if v2.js failed to load. */
const UI = () => window.V2UI || null;
const tipAttr = html => ` data-v2tip="${esc(html)}"`;
const vpill = (cls, text) => `<span class="v2pill ${cls === 'unk' ? '' : cls}">${esc(text)}</span>`;
const pill = st => { const s = STATUS[st] || STATUS.missing; return vpill(s[1], s[0]); };
const toneOf = st => st === 'ok' ? 'good' : st;
const tile = o => UI() ? UI().tile(o) : `<div class="v2tile"><div class="l"><span>${esc(o.label)}</span></div><div class="v">${o.value}</div>${o.sub ? `<div class="sub">${o.sub}</div>` : ''}</div>`;
const tone = (cls, v) => cls ? `<span class="${cls}">${v}</span>` : v;
const SLOTS = [['8am', '8:00 AM'], ['4pm', '4:00 PM'], ['12am', 'Midnight']];
const BF = '2026-11-27';

/* The scaling ladder itself (grading, the desk) lives on the Live page (desk.js ladderOf). Here only: is it set. */
const ladderDone = g => g && g.be != null && g.target != null && g.s50 != null && g.s100 != null;

/* ---------- css ---------- */
function injectCss() {
  if (document.getElementById('seCss')) return;
  const st = document.createElement('style');
  st.id = 'seCss';
  st.textContent = `
  /* v2 (2026-10-08): tokens only, both themes. Phase colours are the channel palette (categorical), never good/warn/bad. */
  .se{--se-nov:var(--c-meta);--se-bf:var(--c-tiktok);--se-dec:var(--c-google);--se-late:var(--c-amazon);--se-vday:var(--c-email);--lw:200px}
  .se.v2{gap:16px}
  .se .ph{margin-bottom:0}
  .se .se-tiles{grid-template-columns:repeat(5,minmax(0,1fr))}
  .se .se-tiles.four{grid-template-columns:repeat(4,minmax(0,1fr))}
  .se .v2tile .v .good,.se .v2tile .v .warn,.se .v2tile .v .bad{font-weight:inherit}
  .se .v2jobs button b{font-weight:650;margin-left:6px;opacity:.7}
  .se .v2jobs button b.warn{color:var(--warn);opacity:1}
  .se .v2jobs button.on b.warn{color:inherit}
  .se .v2card h3{margin:0}
  .se-bar{display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap}
  .se-bar h3{margin:0;font-size:13.5px;font-weight:650;color:var(--ink)}
  .se-acts{display:flex;gap:8px;flex-wrap:wrap}
  .se-mini{font-size:12.5px;padding:5px 10px}
  .se-stack{display:flex;flex-direction:column;gap:10px}
  .se-quiet{font-size:12.5px;color:var(--muted);margin:0}
  .se-m{color:var(--muted);font-size:12px;font-weight:400}
  /* the plan in one read */
  .se-plan{display:grid;grid-template-columns:minmax(0,1.25fr) minmax(0,1fr);gap:20px}
  .se-plan ol{margin:0;padding:0;list-style:none;display:flex;flex-direction:column;gap:6px}
  .se-plan li{display:grid;grid-template-columns:24px 1fr;gap:10px;font-size:13.5px;line-height:1.5;color:var(--ink-2);padding:6px 8px;border-radius:8px}
  .se-plan li b{font-weight:650;color:var(--ink)}
  .se-plan li i{width:22px;height:22px;border-radius:50%;background:var(--surface-2);border:1px solid var(--line-strong);color:var(--ink);font-size:11px;font-weight:650;font-style:normal;display:grid;place-items:center;margin-top:1px}
  .se-plan li.bf{background:color-mix(in srgb,var(--se-bf) 12%,transparent)}
  .se-plan li.bf i{border-color:var(--se-bf);background:color-mix(in srgb,var(--se-bf) 22%,var(--surface))}
  .se-plan li .d{color:var(--muted);font-size:12px}
  .se-why{background:var(--surface-2);border:1px solid var(--line);border-radius:10px;padding:14px 16px;font-size:13.5px;line-height:1.55;color:var(--ink-2);white-space:pre-line;min-width:0;max-height:420px;overflow:auto}
  .se-why .lab{font-size:10.5px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:var(--muted);display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;white-space:normal}
  .se-why.none{color:var(--muted);font-style:italic}
  /* timeline (one row per phase) */
  .se-lg{display:flex;gap:14px;flex-wrap:wrap;font-size:12px;color:var(--muted);margin:0 0 10px}
  .se-lg span{display:inline-flex;align-items:center;gap:6px}
  .se-lg i{display:inline-block;width:16px;height:9px;border-radius:2px;border:1px solid var(--c,var(--line-strong));background:color-mix(in srgb,var(--c,var(--ink-2)) 34%,var(--surface))}
  .se-lg i.draft{background:repeating-linear-gradient(135deg,color-mix(in srgb,var(--ink-2) 34%,var(--surface)) 0 3px,var(--surface) 3px 6px)}
  .se-lg i.missing{background:transparent;border-style:dashed}
  .se-gantt{position:relative;display:grid;grid-template-columns:var(--lw) minmax(0,1fr);column-gap:14px;font-size:13px}
  .se-gantt .gh,.se-gantt .gr{display:contents}
  .se-gantt .gh .lbl{height:28px}
  .se-gantt .gh .axis{position:relative;height:28px;border-bottom:1px solid var(--line)}
  .se-gantt .axis span{position:absolute;bottom:6px;font-size:10.5px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:var(--muted);transform:translateX(-50%)}
  .se-gantt .gr .lbl{display:flex;align-items:center;gap:8px;height:34px;border-bottom:1px solid var(--line);min-width:0;color:var(--ink-2)}
  .se-gantt .gr .lbl b{font-weight:550;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .se-gantt .gr .lbl i{width:8px;height:8px;border-radius:2px;background:var(--c);flex:none}
  .se-gantt .gr .trk{position:relative;height:34px;border-bottom:1px solid var(--line);overflow:hidden}
  .se-gantt .grid{position:absolute;top:0;bottom:0;border-left:1px dashed var(--line)}
  .se-gantt .bar{position:absolute;top:7px;height:20px;border-radius:5px;background:color-mix(in srgb,var(--c) 34%,var(--surface));border:1px solid var(--c);color:var(--ink);font-size:11px;font-weight:600;line-height:18px;padding:0 7px;white-space:nowrap;box-sizing:border-box;cursor:default;min-width:6px;transition:transform .12s,box-shadow .12s}
  .se-gantt .bar .in{display:block;overflow:hidden;text-overflow:ellipsis}
  .se-gantt .bar:hover{transform:translateY(-1px);box-shadow:0 4px 12px -6px rgba(0,0,0,.5)}
  .se-gantt .bar.draft{background:repeating-linear-gradient(135deg,color-mix(in srgb,var(--c) 32%,var(--surface)) 0 6px,color-mix(in srgb,var(--c) 10%,var(--surface)) 6px 12px)}
  .se-gantt .bar.missing{background:transparent;border-style:dashed;color:var(--ink-2)}
  .se-gantt .bar .after{position:absolute;left:100%;top:-1px;padding-left:8px;color:var(--ink-2);font-weight:500;max-width:260px;overflow:hidden;text-overflow:ellipsis}
  .se-gantt .bar .after.l{left:auto;right:100%;padding:0 8px 0 0;text-align:right}
  .se-gantt .mks{position:absolute;left:calc(var(--lw) + 14px);right:0;top:0;bottom:0;pointer-events:none}
  .se-gantt .mk{position:absolute;top:0;bottom:0;width:0;border-left:2px solid var(--m);pointer-events:none}
  .se-gantt .mk b{position:absolute;top:4px;left:-1px;transform:translateX(-50%);font-size:9.5px;font-weight:650;letter-spacing:.08em;text-transform:uppercase;color:var(--ink);background:var(--surface);border:1px solid var(--m);border-radius:4px;padding:1px 6px;white-space:nowrap}
  .se-gantt .mk.dim{border-left-style:dashed}
  .se-gantt.mini{grid-template-columns:minmax(0,1fr);column-gap:0}
  .se-gantt.mini .trk{height:30px;border:0}
  .se-gantt.mini .bar{top:12px;height:14px;line-height:12px;font-size:10px;padding:0 6px}
  .se-gantt.mini .ml{position:absolute;top:0;font-size:9.5px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:var(--muted);padding-left:4px}
  /* offers, all clients */
  .se-offs{display:flex;flex-direction:column;gap:12px}
  .se-off{display:grid;grid-template-columns:200px minmax(0,1fr);gap:18px;padding:16px 18px;border:1px solid var(--line);border-radius:10px;background:var(--surface);cursor:pointer;min-width:0;transition:border-color .12s}
  .se-off:hover{border-color:var(--brand)}
  .se-off .who{display:flex;flex-direction:column;gap:6px;min-width:0}
  .se-off .who > b{font-size:16px;font-weight:650;line-height:1.2;color:var(--ink)}
  .se-off .who .m{font-size:12px;color:var(--muted);line-height:1.5}
  .se-off .body{display:grid;grid-template-columns:minmax(0,1.6fr) minmax(0,1fr);gap:16px;min-width:0}
  .se-off .col{min-width:0}
  .se-off .lab{font-size:10.5px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:var(--muted);display:flex;gap:8px;align-items:center;margin-bottom:5px}
  .se-off .deal{font-weight:650;font-size:17px;line-height:1.3;letter-spacing:-.01em;color:var(--ink)}
  .se-off .deal.small{font-size:13.5px;font-weight:550}
  .se-off .deal.none{font-weight:450;font-style:italic;color:var(--bad);font-size:14px}
  .se-off .sub{font-size:12px;color:var(--muted);margin:4px 0 0;line-height:1.45}
  .se-off .sub b{color:var(--ink-2);font-weight:600}
  .se-off .mini{margin:0 0 8px}
  .se-off .bar{grid-column:1/-1}
  /* offers, one brand */
  .se-deals{display:flex;flex-direction:column;gap:10px}
  .se-deal{display:grid;grid-template-columns:230px minmax(0,1fr) auto;gap:16px;padding:14px 16px;border:1px solid var(--line);border-left:4px solid var(--c);border-radius:10px;background:var(--surface);min-width:0;align-items:start}
  .se-deal.key{box-shadow:0 0 0 3px color-mix(in srgb,var(--c) 22%,transparent);border-color:var(--c)}
  .se-deal .n{display:flex;gap:10px;align-items:flex-start}
  .se-deal .num{width:24px;height:24px;flex:none;border-radius:50%;background:var(--surface-2);border:1px solid var(--line-strong);color:var(--ink);font-size:11.5px;font-weight:650;display:grid;place-items:center}
  .se-deal .nm{font-size:14.5px;font-weight:650;line-height:1.25;color:var(--ink)}
  .se-deal .dt{font-size:12px;color:var(--muted);margin-top:3px;line-height:1.4}
  .se-deal .big{font-weight:650;font-size:16px;line-height:1.35;letter-spacing:-.01em;color:var(--ink)}
  .se-deal .big.none{font-weight:450;font-style:italic;color:var(--muted);font-size:14px}
  .se-deal .x{font-size:13px;color:var(--ink-2);line-height:1.5;margin-top:6px;white-space:pre-line}
  .se-deal .res{font-size:12.5px;line-height:1.45;background:var(--surface-2);border:1px solid var(--line);border-radius:8px;padding:7px 10px;margin-top:8px;color:var(--ink-2)}
  .se-deal .res b{font-size:13px;color:var(--ink)}
  .se-deal .act{display:flex;flex-direction:column;gap:6px;align-items:flex-end}
  .se-ads{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:10px}
  .se-ad{display:block;border:1px solid var(--line);border-radius:10px;overflow:hidden;background:var(--surface-2);color:inherit;text-decoration:none;min-width:0}
  .se-ad:hover{border-color:var(--brand)}
  .se-ad img{display:block;width:100%;aspect-ratio:4/5;object-fit:cover;background:var(--surface-2)}
  .se-ad .c{padding:6px 8px;font-size:11.5px;line-height:1.3;color:var(--ink-2)}
  .se-ad .c b{display:block;font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:var(--ink)}
  .se-ad .none{aspect-ratio:4/5;display:grid;place-items:center;padding:12px;text-align:center;font-size:13px;font-weight:600;line-height:1.3;color:var(--muted)}
  /* tasks */
  .se-task{display:grid;grid-template-columns:22px 1fr auto;gap:10px;align-items:start;padding:9px 0;border-bottom:1px solid var(--line)}
  .se-task:last-child{border-bottom:0}
  .se-task input{margin:3px 0 0;width:16px;height:16px;accent-color:var(--brand);cursor:pointer}
  .se-task .n{font-size:13.5px;line-height:1.4;color:var(--ink)}
  .se-task .n small{display:block;color:var(--muted);font-size:12px;margin-top:1px}
  .se-task.done .n{color:var(--muted);text-decoration:line-through}
  .se-task.done .n small{text-decoration:none}
  .se-task .r{text-align:right;font-size:12px;color:var(--muted);white-space:nowrap;line-height:1.4}
  .se-task .r .ow{display:block;max-width:150px;margin-left:auto;overflow:hidden;text-overflow:ellipsis}
  .se-task .r b{display:block;font-size:12.5px;font-weight:600;color:var(--ink)}
  .se-task.over .r b{color:var(--bad)}
  .se-brand{display:inline-block;font-size:11px;font-weight:600;letter-spacing:.02em;border-radius:6px;padding:1px 7px;margin-right:6px;background:var(--surface-2);border:1px solid var(--line);color:var(--ink);vertical-align:1px}
  .se-brand.link{cursor:pointer}
  .se-brand.link:hover{border-color:var(--brand)}
  .se-when{font-size:10.5px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:var(--muted);margin:14px 0 4px}
  .se-when:first-child{margin-top:0}
  .se-when.bad{color:var(--bad)}
  .se-board{width:100%;border-collapse:collapse;font-size:13px;table-layout:fixed}
  .se-board col.c-brand{width:150px}.se-board col.c-need{width:128px}
  .se-board th{text-align:left;font-size:10.5px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:var(--muted);padding:8px 10px;border-bottom:1px solid var(--line);white-space:nowrap}
  .se-board td{padding:10px;border-bottom:1px solid var(--line);vertical-align:top;white-space:normal;overflow-wrap:anywhere;color:var(--ink)}
  .se-board tr:last-child td{border-bottom:0}
  .se-board tr.rowlink{cursor:pointer}
  .se-board tr.rowlink:hover td{background:var(--surface-2)}
  .se-board .bn{font-weight:650}
  .se-board .bn .v2pill{margin-top:4px}
  .se-board .cell small,.se-board .need{display:block;color:var(--muted);font-size:11.5px;margin-top:3px;line-height:1.4}
  .se-weeks{display:grid;grid-template-columns:repeat(auto-fill,minmax(270px,1fr));gap:10px}
  .se-wk{border:1px solid var(--line);border-radius:10px;padding:10px 12px;background:var(--surface);min-width:0}
  .se-wk.now{border-color:var(--brand);box-shadow:0 0 0 3px var(--brand-soft)}
  .se-wk.past{opacity:.7}
  .se-wk .h{display:flex;justify-content:space-between;align-items:baseline;gap:8px;margin-bottom:4px}
  .se-wk .h b{font-weight:650;font-size:13.5px;color:var(--ink)}
  .se-wk .h span{font-size:11.5px;color:var(--muted);white-space:nowrap}
  .se-wk .lv{font-size:12px;color:var(--ink-2);margin-bottom:6px;line-height:1.45}
  .se-wk .se-task{padding:5px 0}
  .se-kv{display:grid;grid-template-columns:170px 1fr auto;gap:8px 14px;align-items:start;font-size:13.5px}
  .se-kv .k{color:var(--muted);font-size:12.5px;padding-top:2px}
  .se-kv .v{white-space:pre-line;line-height:1.5;min-width:0;color:var(--ink)}
  .se-kv .v.none{color:var(--muted);font-style:italic}
  .se-kv .e{justify-self:end}
  .se-kv .sep{grid-column:1/-1;border-top:1px solid var(--line);margin:2px 0}
  .se-need{display:flex;flex-direction:column;gap:6px}
  .se-need div{display:grid;grid-template-columns:1fr auto;gap:10px;font-size:13.5px;padding:8px 11px;border-radius:8px;background:var(--surface-2);border:1px solid var(--line);color:var(--ink)}
  .se-need div span:last-child{color:var(--muted);font-size:12px;text-align:right;max-width:32ch}
  .se-in{width:100%;border:1px solid var(--line-strong);border-radius:8px;padding:8px 10px;font:14px var(--sans);background:var(--surface);color:var(--ink);box-sizing:border-box}
  .se-in:focus{outline:0;border-color:var(--brand);box-shadow:0 0 0 3px var(--brand-soft)}
  textarea.se-in{min-height:84px;resize:vertical;line-height:1.45}
  .se-f{display:flex;flex-direction:column;gap:4px;margin-bottom:10px}
  .se-f label{font-size:12.5px;font-weight:600;color:var(--ink)}
  .se-f small{color:var(--muted);font-size:11.5px}
  .se-f2{display:grid;grid-template-columns:1fr 1fr;gap:10px}
  .se-link{background:none;border:0;padding:0;font:inherit;font-weight:600;color:var(--brand);cursor:pointer}
  .se-link:hover{text-decoration:underline}
  /* goals and results */
  .se-ladchips{display:flex;flex-wrap:wrap;gap:6px;margin-top:12px}
  .se-ladchips span{font-size:12px;border-radius:99px;padding:3px 10px;background:var(--surface-2);border:1px solid var(--line);color:var(--ink-2)}
  .se-ladchips span b{color:var(--ink);font-weight:650}
  /* the ladder strip: where the last 3 hours sit against the lines */
  .se-lad{position:relative;margin:2px 0 4px;min-width:0}
  .se-lad .nw{position:relative;height:20px}
  .se-lad .nw b{position:absolute;bottom:3px;transform:translateX(-50%);font-size:11px;font-weight:650;color:var(--ink);white-space:nowrap}
  .se-lad .zw{position:relative}
  .se-lad .z{display:flex;height:24px;border-radius:6px;overflow:hidden;gap:2px}
  .se-lad .z i{display:flex;align-items:center;justify-content:center;font-style:normal;font-size:11px;font-weight:600;white-space:nowrap;overflow:hidden;min-width:0;padding:0 4px}
  .se-lad .z .off{background:var(--bad-bg);color:var(--bad)}
  .se-lad .z .pull{background:var(--warn-bg);color:var(--warn)}
  .se-lad .z .hold{background:var(--unk-bg);color:var(--ink-2)}
  .se-lad .z .s50{background:var(--good-bg);color:var(--good)}
  .se-lad .z .s100{background:color-mix(in srgb,var(--good) 30%,var(--surface));color:var(--ink)}
  .se-lad .mk{position:absolute;top:-4px;bottom:-4px;width:0;border-left:2px solid var(--ink);transform:translateX(-1px)}
  .se-lad .ax{position:relative;height:18px}
  .se-lad .ax span{position:absolute;top:4px;transform:translateX(-50%);font-size:10.5px;color:var(--muted);white-space:nowrap}
  /* the desk */
  .se-desks{display:flex;flex-direction:column;gap:10px}
  .se-desk{border:1px solid var(--line);border-radius:10px;padding:14px 16px;background:var(--surface)}
  .se-desk .h{display:flex;gap:12px;align-items:center;flex-wrap:wrap;margin-bottom:8px}
  .se-desk .h b.nm{font-size:15px;font-weight:650;color:var(--ink);cursor:pointer}
  .se-desk .h b.nm:hover{color:var(--brand)}
  .se-call{display:inline-flex;align-items:center;gap:6px;font-size:13px;font-weight:650;padding:4px 11px;border-radius:99px;background:var(--unk-bg);color:var(--ink-2)}
  .se-call.good{background:var(--good-bg);color:var(--good)}.se-call.warn{background:var(--warn-bg);color:var(--warn)}.se-call.bad{background:var(--bad-bg);color:var(--bad)}
  .se-desk .live{display:flex;gap:18px;flex-wrap:wrap;align-items:baseline;font-size:12.5px;color:var(--muted);margin-left:auto}
  .se-desk .live b{color:var(--ink);font-size:15px;font-weight:650}
  .se-slot{display:grid;grid-template-columns:90px 1fr auto;gap:10px;align-items:center;padding:8px 0;border-top:1px dashed var(--line)}
  .se-slot .s{font-weight:650;font-size:12.5px;color:var(--ink-2)}
  .se-slot .did{font-size:13.5px;line-height:1.4;color:var(--ink)}
  .se-slot .did small{display:block;color:var(--muted);font-size:11.5px}
  .se-slot input.se-in{padding:6px 9px;font-size:13px}
  .se-share{max-width:960px;margin:0 auto}
  @media (max-width:1100px){.se .se-tiles,.se .se-tiles.four{grid-template-columns:repeat(3,minmax(0,1fr))}}
  @media (max-width:980px){.se{--lw:120px}.se-off{grid-template-columns:1fr}.se-off .body{grid-template-columns:1fr}.se-deal{grid-template-columns:1fr}.se-deal .act{flex-direction:row;align-items:center}.se-plan{grid-template-columns:1fr}.se-desk .live{margin-left:0}}
  @media (max-width:820px){.se .se-tiles,.se .se-tiles.four{grid-template-columns:repeat(2,minmax(0,1fr))}.se-kv{grid-template-columns:1fr}.se-kv .e{justify-self:start}.se-f2{grid-template-columns:1fr}.se-task .r{text-align:left;grid-column:2}.se-task .r .ow{margin-left:0}.se-slot{grid-template-columns:1fr}.se-board{min-width:640px}.se-gantt .bar .after{display:none}}
  @media (prefers-reduced-motion:reduce){.se-gantt .bar,.se-off{transition:none}}
  `;
  document.head.appendChild(st);
}

/* ---------- hover: the one v2 tooltip (#v2gtip, wired once by v2.js on [data-v2tip]) ---------- */
const phaseTip = p => `<b>${esc(p.name)}</b><br><span class="faint">${esc(fmtRange(p.start, p.end))}${p.who ? ' · ' + esc(p.who) : ''} · ${STATUS[p.status]?.[0] || ''}</span><br>${esc(p.offer || 'No offer written yet.')}`;

/* ---------- the timeline: one row per phase ---------- */
const TL_FROM = '2026-10-05', TL_TO = '2027-02-08';
const tlPct = iso => Math.max(0, Math.min(100, daysBetween(TL_FROM, iso) / daysBetween(TL_FROM, TL_TO) * 100));
const MONTHS_TL = [['2026-11-01', 'Nov'], ['2026-12-01', 'Dec'], ['2027-01-01', 'Jan'], ['2027-02-01', 'Feb']];
/* The legend the gantt needs: which colour is which part of the season, and what solid / striped / outline mean. */
function ganttLegend(phases) {
  const grps = [...new Set(phases.filter(p => p.start && p.status !== 'skip').map(p => p.grp))].filter(g => GRP[g]);
  return `<div class="se-lg">${grps.map(g => `<span><i style="--c:${GRP[g][1]}"></i>${esc(GRP[g][0])}</span>`).join('')}<span><i></i>Locked</span><span><i class="draft"></i>Proposal</span><span><i class="missing"></i>Nothing written</span></div>`;
}
function gantt(phases, today) {
  const rows = phases.filter(p => p.start && p.status !== 'skip');
  const grid = MONTHS_TL.map(([d]) => `<i class="grid" style="left:${tlPct(d)}%"></i>`).join('');
  const marks = `<div class="mk" style="left:${tlPct(BF)}%;--m:var(--se-bf)"><b>Black Friday</b></div>${today >= TL_FROM && today <= TL_TO ? `<div class="mk dim" style="left:${tlPct(today)}%;--m:var(--brand)"><b>Today</b></div>` : ''}`;
  const head = `<div class="gh"><div class="lbl"></div><div class="axis"><span style="left:${tlPct('2026-10-15')}%">Oct</span>${MONTHS_TL.map(([d, l]) => `<span style="left:${tlPct(addDays(d, 14))}%">${l}</span>`).join('')}</div></div>`;
  const body = rows.map(p => {
    const l = tlPct(p.start), r = Math.max(tlPct(addDays(p.end || p.start, 1)), l + 0.8);
    const w = r - l;
    const c = GRP[p.grp]?.[1] || 'var(--se-bf)';
    const inside = w > 10 ? `<span class="in">${esc(p.offer || p.name)}</span>` : '';
    const after = w <= 10 ? `<span class="after${l > 62 ? ' l' : ''}">${esc((p.offer || '').slice(0, 60))}</span>` : '';
    return `<div class="gr"><div class="lbl" style="--c:${c}"${tipAttr(phaseTip(p))}><i></i><b>${esc(p.name)}</b></div><div class="trk">${grid}<div class="bar ${p.status}" style="--c:${c};left:${l}%;width:${w}%"${tipAttr(phaseTip(p))}>${inside}${after}</div></div></div>`;
  }).join('');
  /* The markers sit in an overlay that covers only the track column (label column + 14px gap, see --lw). */
  return `<div class="se-gantt">${head}${body}<div class="gr"><div class="lbl" style="border:0;height:14px"></div><div class="trk" style="border:0;height:14px"></div></div><div class="mks">${marks}</div></div>`;
}
/* Compact bar for the all-clients card: one row, hover for the deal. */
function miniBar(a, today) {
  const show = a.phases.filter(p => p.start && p.status !== 'skip' && !['access', 'planb', 'cm', 'boxing'].includes(p.key));
  const segs = show.map(p => {
    const l = tlPct(p.start), r = Math.max(tlPct(addDays(p.end || p.start, 1)), l + 0.8);
    return `<div class="bar ${p.status}" style="--c:${GRP[p.grp]?.[1] || 'var(--se-bf)'};left:${l}%;width:${r - l}%"${tipAttr(phaseTip(p))}>${r - l > 9 ? `<span class="in">${esc(p.name)}</span>` : ''}</div>`;
  }).join('');
  return `<div class="se-gantt mini"><div class="gr"><div class="trk">${MONTHS_TL.map(([d, l]) => `<i class="grid" style="left:${tlPct(d)}%"></i><span class="ml" style="left:${tlPct(d)}%">${l}</span>`).join('')}${segs}<div class="mk" style="left:${tlPct(BF)}%;--m:var(--se-bf)"${tipAttr('Black Friday, Fri Nov 27')}></div>${today >= TL_FROM && today <= TL_TO ? `<div class="mk dim" style="left:${tlPct(today)}%;--m:var(--brand)"></div>` : ''}</div></div></div>`;
}
/* ---------- small modal: fields in, object out (or null) ---------- */
function formModal({ title, hint, fields, cta = 'Save', danger }) {
  return new Promise(resolve => {
    const w = document.createElement('div');
    w.className = 'modal-wrap';
    const f = fields.map(fd => {
      const id = 'sf_' + fd.k;
      let ctl;
      if (fd.type === 'textarea') ctl = `<textarea class="se-in" id="${id}" placeholder="${esc(fd.ph || '')}" ${fd.rows ? `style="min-height:${fd.rows * 22}px"` : ''}>${esc(fd.value || '')}</textarea>`;
      else if (fd.type === 'select') ctl = `<select class="se-in" id="${id}">${fd.options.map(([v, l]) => `<option value="${esc(v)}" ${v === fd.value ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>`;
      else ctl = `<input class="se-in" id="${id}" type="${fd.type || 'text'}" value="${esc(fd.value ?? '')}" placeholder="${esc(fd.ph || '')}" ${fd.step ? `step="${fd.step}"` : ''}>`;
      return `<div class="se-f"><label for="${id}">${esc(fd.label)}</label>${ctl}${fd.hint ? `<small>${esc(fd.hint)}</small>` : ''}</div>`;
    });
    let body = '', i = 0;
    while (i < f.length) {
      if (fields[i].half && fields[i + 1]?.half) { body += `<div class="se-f2">${f[i]}${f[i + 1]}</div>`; i += 2; }
      else { body += f[i]; i++; }
    }
    w.innerHTML = `<div class="modal" style="max-width:600px"><h3>${esc(title)}</h3>${hint ? `<p class="hint">${esc(hint)}</p>` : ''}
      <div style="margin-top:12px">${body}</div>
      <div class="row" style="justify-content:flex-end;gap:8px;margin:6px 0 0">
        ${danger ? `<button class="btn" data-m="del" style="margin-right:auto;color:var(--bad)">${esc(danger)}</button>` : ''}
        <button class="btn" data-m="no">Cancel</button><button class="btn primary" data-m="yes">${esc(cta)}</button></div></div>`;
    document.body.appendChild(w);
    const done = v => { w.remove(); document.removeEventListener('keydown', k); resolve(v); };
    const k = e => { if (e.key === 'Escape') done(null); };
    document.addEventListener('keydown', k);
    w.addEventListener('mousedown', e => { if (e.target === w) done(null); });
    w.querySelector('[data-m="no"]').onclick = () => done(null);
    const del = w.querySelector('[data-m="del"]'); if (del) del.onclick = () => done({ __delete: true });
    w.querySelector('[data-m="yes"]').onclick = () => done(Object.fromEntries(fields.map(fd => [fd.k, w.querySelector('#sf_' + fd.k).value.trim()])));
    const first = w.querySelector('.se-in'); if (first && !matchMedia('(max-width:720px)').matches) setTimeout(() => first.focus(), 30);
  });
}
/* A wide read-only modal (the swipe file). Returns the body element to fill. */
function panelModal(title, bodyHtml) {
  const w = document.createElement('div');
  w.className = 'modal-wrap';
  w.innerHTML = `<div class="modal" style="max-width:980px;width:100%"><div class="row" style="justify-content:space-between;align-items:baseline;margin-bottom:6px"><h3 style="margin:0">${esc(title)}</h3><button class="btn se-mini" data-m="no">Close</button></div><div class="se-panel-body">${bodyHtml}</div></div>`;
  document.body.appendChild(w);
  const done = () => { w.remove(); document.removeEventListener('keydown', k); };
  const k = e => { if (e.key === 'Escape') done(); };
  document.addEventListener('keydown', k);
  w.addEventListener('mousedown', e => { if (e.target === w) done(); });
  w.querySelector('[data-m="no"]').onclick = done;
  return w.querySelector('.se-panel-body');
}
function toast(msg, bad) {
  const t = document.createElement('div');
  t.textContent = msg;
  t.className = 'lx-toast' + (bad ? ' bad' : ''); t.setAttribute('role', 'status');
  document.body.appendChild(t); setTimeout(() => t.remove(), bad ? 4200 : 2600);
}

/* ---------- data ---------- */
/* Seeds 013 and 015 wrote status 'proposed', which is not in the vocabulary (missing | draft | locked |
   skip): it read as Missing, and the Edit select fell back to Missing, so saving silently downgraded it.
   It means the same as draft, so the screen treats it as draft. */
const normPhases = phases => (phases || []).forEach(p => { if (p.status === 'proposed') p.status = 'draft'; });
async function load(act) { S.data = await api('/api/season?act=' + encodeURIComponent(act)); (S.data.accounts || []).forEach(a => normPhases(a.phases)); return S.data; }
const brandOf = id => (S.data?.accounts || []).find(a => a.act_id === id);
const keyPhase = (a, k) => a.phases.find(p => p.key === k);
function brandState(a) {
  const bf = keyPhase(a, 'bf');
  const early = keyPhase(a, 'early');
  if (bf?.status === 'locked' && (!early || early.status !== 'missing')) return ['ok', 'Locked'];
  if (bf?.status === 'locked') return ['warn', 'Weekend locked, November open'];
  if (bf?.status === 'draft') return ['warn', 'Draft'];
  return ['bad', 'No offer'];
}
function counts(a, today) {
  const wk0 = monday(today), wk1 = addDays(wk0, 6);
  const open = a.tasks.filter(t => !t.done && t.due);
  return { over: open.filter(t => t.due < today).length, week: open.filter(t => t.due >= wk0 && t.due <= wk1).length, locked: a.phases.filter(p => p.status === 'locked').length, counted: a.phases.filter(p => p.status !== 'skip' && !p.optional).length };
}
const goalLine = g => { const parts = []; if (g.early != null) parts.push(`Nov ${moneyK(g.early)}`); if (g.bf != null) parts.push(`BF weekend ${moneyK(g.bf)}`); if (g.dec != null) parts.push(`Dec ${moneyK(g.dec)}`); if (g.total != null && !parts.length) parts.push(`Season ${moneyK(g.total)}`); return parts.length ? 'Goal: ' + parts.join(' · ') : 'No revenue goal yet'; };

/* ---------- task rows ---------- */
function taskRow(t, a, today, showBrand) {
  const over = !t.done && t.due && t.due < today;
  return `<div class="se-task ${t.done ? 'done' : ''} ${over ? 'over' : ''}" data-act="${esc(a.act_id)}" data-id="${esc(t.id)}">
    <input type="checkbox" ${t.done ? 'checked' : ''} ${t.auto && t.kind !== 'live' ? 'disabled title="Ticks itself"' : ''} aria-label="Done">
    <div class="n">${showBrand ? `<span class="se-brand link" data-pick="${esc(a.act_id)}">${esc(a.name)}</span>` : ''}${esc(t.name)}${t.custom ? ` <button class="se-link se-mini" data-edit-task="${esc(t.id)}">edit</button>` : ''}<small>${esc(t.phase || '')}${t.done && t.done_by ? ` · done by ${esc(t.done_by)}` : ''}${t.note ? ` · ${esc(t.note)}` : ''}</small></div>
    <div class="r"><b>${over ? 'Overdue · ' : ''}${esc(t.due ? fmtDow(t.due) : 'no date')}</b><span class="ow"${(t.owner || '').length > 22 ? tipAttr(esc(t.owner)) : ''}>${esc(t.owner || '')}</span></div>
  </div>`;
}
function wireTasks(root) {
  root.querySelectorAll('.se-task input[type=checkbox]').forEach(cb => cb.onchange = async () => {
    const row = cb.closest('.se-task');
    try {
      const r = await put('/api/season/task', { act: row.dataset.act, id: row.dataset.id, done: cb.checked });
      const a = brandOf(row.dataset.act); const t = a?.tasks.find(x => x.id === row.dataset.id);
      if (t) { t.done = r.done; t.done_by = r.done_by; }
      row.classList.toggle('done', cb.checked);
    } catch (e) { cb.checked = !cb.checked; toast(e.message, true); }
  });
  root.querySelectorAll('[data-pick]').forEach(el => el.onclick = () => S.pick && S.pick(el.dataset.pick));
  root.querySelectorAll('[data-edit-task]').forEach(b => b.onclick = () => editTask(b.closest('.se-task').dataset.act, b.dataset.editTask));
}
async function editTask(act, id) {
  const a = brandOf(act); const t = id ? a.tasks.find(x => x.id === id) : null;
  const r = await formModal({
    title: t ? 'Edit task' : 'Add a task', hint: 'A one-off for this brand. Briefs, built, loaded and live dates come from the phase dates by themselves.',
    fields: [
      { k: 'name', label: 'What', value: t?.name || '', ph: 'e.g. Legal read of the giveaway rules' },
      { k: 'due', label: 'Due', type: 'date', value: t?.due || '', half: 1 },
      { k: 'owner', label: 'Owner', value: t?.owner || 'Cole', half: 1, hint: 'A name. Write "Client" for something the brand owes.' },
      { k: 'phase_key', label: 'Belongs to', type: 'select', value: t?.phase_key || '', options: [['', 'The season in general'], ...a.phases.filter(p => p.status !== 'skip').map(p => [p.key, p.name])] },
    ], cta: t ? 'Save' : 'Add', danger: t ? 'Delete' : null,
  });
  if (!r) return;
  try {
    if (r.__delete) await put('/api/season/task', { act, id }, 'DELETE');
    else if (!r.name) return toast('Give it a name', true);
    else await put('/api/season/task', { act, id: id || ('c:' + crypto.randomUUID().slice(0, 8)), name: r.name, due: r.due || null, owner: r.owner || 'Cole', phase_key: r.phase_key || null, custom: 1, kind: 'custom' });
    await refresh();
  } catch (e) { toast(e.message, true); }
}

/* ---------- weeks ---------- */
function weeksOf(accounts, today, from = '2026-10-05', to = '2027-02-08') {
  const rows = [];
  for (const a of accounts) for (const t of a.tasks) if (t.due) rows.push({ t, a });
  const out = [];
  for (let w = monday(from); w <= to; w = addDays(w, 7)) {
    const end = addDays(w, 6);
    const items = rows.filter(r => r.t.due >= w && r.t.due <= end).sort((x, y) => x.t.due.localeCompare(y.t.due) || x.a.name.localeCompare(y.a.name));
    const lives = [];
    for (const a of accounts) for (const p of a.phases) if (p.start && p.status !== 'skip' && p.start >= w && p.start <= end) lives.push(`${a.name}: ${p.name}`);
    out.push({ start: w, end, items, lives, now: today >= w && today <= end, past: end < today });
  }
  return out;
}
function weekBox(wk, today, showBrand) {
  const open = wk.items.filter(r => !r.t.done).length;
  const label = wk.now ? 'This week' : `Week of ${fmtD(wk.start)}`;
  const big = wk.start <= BF && wk.end >= BF;
  return `<div class="se-wk ${wk.now ? 'now' : ''} ${wk.past ? 'past' : ''}"><div class="h"><b>${big ? 'BLACK FRIDAY · ' : ''}${label}</b><span>${wk.items.length ? `${open} open of ${wk.items.length}` : 'nothing due'}</span></div>
    ${wk.lives.length ? `<div class="lv">Goes live: ${esc(wk.lives.join(' · '))}</div>` : ''}
    ${wk.items.map(r => taskRow(r.t, r.a, today, showBrand)).join('') || '<div class="se-m">Nothing scheduled.</div>'}
  </div>`;
}

/* ---------- formats to steal (Cole's TikTok drop, @marketingmei "Black Friday ad formats", 2026-10-05) ----------
 * The format is the vehicle; the deal rides in it. Each line: the format, then how it reads for a
 * brand that does not cut the price (Lucky), since that is the hard case. */
const FORMATS = [
  ['Offer-first banner', 'The deal is the first frame and the whole frame. "Any club, free hat. Prices never drop."'],
  ['Notes app', 'A phone Notes screenshot: "Black Friday picks" with the three products and what comes free.'],
  ['Google search', 'A search bar typing "is Lucky Golf doing Black Friday", the answer appears under it.'],
  ['Meme', 'A known template with the offer as the punchline. Keep the product in the last frame.'],
  ['Countdown clock', 'Hours left, or units left: "312 of 400 polos left".'],
  ['Flip phone text', 'An old-phone text thread announcing the drop, deliberately low-fi.'],
  ['Email screenshot', 'The email we sent the list, screenshotted, as the ad. Subject line does the work.'],
  ['Strikethrough', '10% off, 20% off, 30% off struck out, then the real line: "Free hat. We never cut the club."'],
  ['Reply to comment', 'A real comment ("are you doing Black Friday?") pinned on screen, the founder answers it.'],
  ['Tweet', 'A tweet card with the offer in one sentence and the product photo under it.'],
  ['Apology note', '"We are sorry": the finance team is not happy about the free polos. Ends Monday.'],
  ['Value stack', 'Everything in the box listed with its value, the total, then what you pay.'],
  ['"Do not buy this"', '"Do not buy this at full price" turned: "Do not buy this without the free hat."'],
  ['Sticky notes on product', 'A handwritten sticky note with the deal stuck to the wedge or the box.'],
  ['Reddit post', 'A PSA-style post, upvotes and all: "PSA: the free hat deal is live".'],
  ['Fake text thread', 'An iMessage thread between two friends about the deal, the link shared at the end.'],
  ['Number 17', 'Mei says a seventeenth on camera but it never shows on screen. Watch the video for it: tiktok.com/t/ZPLLoKHUB'],
];
function showFormats() {
  panelModal('Black Friday ad formats worth stealing', `<p class="hint" style="margin:0 0 12px">From the TikTok Cole dropped in #bfcm-2026 (Mei, "Black Friday ad formats, rapid fire edition"). Each one with how it reads for a brand that never cuts the price. Brief any of these in Asana; make the static version in Studio.</p>
    <ol style="margin:0;padding-left:22px;columns:2;column-gap:28px;font-size:13.5px;line-height:1.45">${FORMATS.map(([n, h]) => `<li style="break-inside:avoid;margin-bottom:8px"><b>${esc(n)}.</b> ${esc(h)}</li>`).join('')}</ol>`);
}

/* ---------- swipe file (Atria boards), in a modal ---------- */
async function showSwipe(board, title) {
  const body = panelModal(title, `<p class="hint" style="margin:0">Loading from Atria…</p>`);
  try {
    const r = await api('/api/atria/board?board_id=' + encodeURIComponent(board.id), {}, AH);
    if (r.reason === 'not_connected') { body.innerHTML = `<p class="hint" style="margin:0">Atria is not connected. Studio > Connections > Connect Atria, then this fills itself.</p>`; return; }
    const ads = r.ads || [];
    body.innerHTML = `<p class="hint" style="margin:0 0 12px">${ads.length} ad${ads.length === 1 ? '' : 's'} saved in Atria under <b>${esc(board.name)}</b>. Save more into that board in Atria and they show here. Click one to open it in Atria.</p>
      ${ads.length ? `<div class="se-ads">${ads.map(a => `<a class="se-ad" href="${esc(a.url)}" target="_blank" rel="noopener">${a.img ? `<img src="${esc(a.img)}" alt="" referrerpolicy="no-referrer">` : `<div class="none">${esc(a.advertiser || 'Open in Atria')}<br><span style="font-weight:400;font-size:11px">${a.format === 'video' ? 'video, no still' : 'no preview'}</span></div>`}<div class="c"><b>${esc(a.advertiser || '')}</b>${esc((a.title || a.body || '').slice(0, 70))}${a.format === 'video' ? ' · video' : ''}</div></a>`).join('')}</div>` : '<p class="hint" style="margin:0">Nothing saved to this board yet.</p>'}`;
    body.insertAdjacentHTML('beforeend', `<p class="v2hint" style="margin:14px 0 0">Need a format, not a reference? <button class="se-link" data-formats="1">The 17 Black Friday ad formats</button></p>`);
    body.querySelector('[data-formats]').onclick = showFormats;
  } catch (e) { body.innerHTML = `<p class="hint" style="margin:0;color:var(--bad)">${esc(e.message)}</p>`; }
}

/* ---------- ALL CLIENTS ---------- */
function crumb() { return typeof window.crumbFor === 'function' ? `<div class="ph-crumb">${window.crumbFor('season')}</div>` : ''; }
/* The app's own page head (crumb, title, Tour / Metrics / Help) when the host has it. */
function head(title, sub) {
  if (typeof window.pageHead === 'function') return window.pageHead('season', title);
  return `<div class="ph"><div>${crumb()}<div class="ph-t">${title}</div>${sub ? `<p class="ph-sub">${sub}</p>` : ''}</div></div>`;
}
const sCard = (title, find, body, cap, cls) => `<section class="v2card${cls ? ' ' + cls : ''}"><div class="v2h"><h3>${title}</h3>${find ? `<span class="find">${find}</span>` : ''}${cap ? `<span class="cap">${cap}</span>` : ''}</div>${body}</section>`;
const jobs = (items, attr, cur) => `<div class="v2jobs se-seg" role="tablist">${items.map(([k, l, n, warn]) => `<button data-${attr}="${k}" class="${cur === k ? 'on' : ''}" role="tab" aria-selected="${cur === k}">${l}${n ? `<b class="${warn ? 'warn' : ''}">${n}</b>` : ''}</button>`).join('')}</div>`;

function offerCard(a, today) {
  const st = brandState(a);
  const bf = keyPhase(a, 'bf'), access = keyPhase(a, 'access'), early = keyPhase(a, 'early');
  const rest = a.phases.filter(p => (p.grp === 'dec' || p.grp === 'late' || p.grp === 'vday') && p.status !== 'skip' && !(p.status === 'missing' && p.grp !== 'dec'));
  const deal = (p, big) => !p ? '' : p.status === 'skip' ? `<div class="deal small" style="color:var(--muted);font-weight:400">Not running</div>`
    : p.offer ? `<div class="deal ${big ? '' : 'small'}">${esc(p.offer)}</div>` : `<div class="deal none">No offer written yet</div>`;
  const line = p => p ? `<div class="sub">${esc(fmtRange(p.start, p.end))}${p.who ? ` · ${esc(p.who)}` : ''}</div>` : '';
  const c = counts(a, today);
  return `<div class="se-off" data-pick="${esc(a.act_id)}" role="link" tabindex="0">
    <div class="who"><b>${esc(a.name)}</b><span style="align-self:flex-start">${vpill(toneOf(st[0]), st[1])}</span>
      <span class="m">${esc(goalLine(a.goals || {}))}<br>${esc(a.answers.strategist || 'Ahsan')} briefs · ${esc(a.answers.approver || 'client')} approves${c.over ? `<br><b class="bad">${c.over} overdue</b>` : ''}${c.week ? `<br>${c.week} due this week` : ''}</span></div>
    <div class="body">
      <div class="col"><div class="lab">Black Friday weekend ${bf ? pill(bf.status) : ''}</div>${deal(bf, true)}${line(bf)}${access && access.status !== 'skip' && (access.offer || access.status !== 'missing') ? `<div class="sub" style="margin-top:8px"><b>Thursday first:</b> ${esc(access.offer || 'early access, details to come')} (${esc(access.who || 'list')})</div>` : ''}
        <div class="lab" style="margin-top:12px">November ${early ? pill(early.status) : ''}</div>${early ? `<div class="sub" style="margin:0 0 2px"><b>${esc(early.name)}</b></div>` : ''}${deal(early, false)}${line(early)}</div>
      <div class="col"><div class="lab">After the weekend</div>${rest.length ? rest.map(p => `<div class="sub mini"><b>${esc(p.name)}</b> ${pill(p.status)}<br>${p.offer ? esc(p.offer) : '<i>no offer yet</i>'} · ${esc(fmtRange(p.start, p.end))}</div>`).join('') : '<div class="deal none">Nothing planned</div>'}</div>
      <div class="bar">${miniBar(a, today)}</div>
    </div>
  </div>`;
}

async function renderAll() {
  const main = $('#main');
  main.innerHTML = `<div class="se v2"><section class="v2card"><p class="v2hint">Loading the season…</p></section></div>`;
  await load('all');
  S.view = localStorage.getItem(LS_VIEW) || 'offers';
  if (!ALL_VIEWS.includes(S.view)) S.view = 'offers';   // 'desk' moved to the Live page (2026-10-13)
  paintAll();
}
function paintAll() {
  const main = $('#main');
  const d = S.data, today = d.today;
  const brands = d.accounts.filter(a => a.in_season);
  const off = d.accounts.filter(a => !a.in_season);
  const days = daysBetween(today, d.bf);
  const wk0 = monday(today), wk1 = addDays(wk0, 6);
  const lockedN = brands.filter(a => brandState(a)[0] === 'ok').length;
  const noOffer = brands.filter(a => brandState(a)[0] === 'bad');
  const noGoal = brands.filter(a => a.goals.bf == null && a.goals.total == null);
  const noLadder = brands.filter(a => !ladderDone(a.goals));
  const openAll = brands.flatMap(a => a.tasks.filter(t => !t.done && t.due).map(t => ({ t, a })));
  const overdue = openAll.filter(r => r.t.due < today);
  const thisWeek = openAll.filter(r => r.t.due >= wk0 && r.t.due <= wk1);
  const drafts = brands.filter(a => brandState(a)[0] === 'warn');
  const names = list => esc(list.map(a => a.name).join(', '));
  /* Conclusion first: is every offer locked, what is due, what is slipping. */
  const verdict = noOffer.length || drafts.length
    ? `<b>${lockedN} of ${brands.length} brands have a locked ${esc(seasonLabel())} offer.</b> ${drafts.length ? `${names(drafts)} ${drafts.length === 1 ? 'has' : 'have'} a proposal waiting on the client. ` : ''}${noOffer.length ? `${names(noOffer)} ${noOffer.length === 1 ? 'has' : 'have'} nothing written yet. ` : ''}${thisWeek.length} thing${thisWeek.length === 1 ? '' : 's'} due this week${overdue.length ? `, <b class="bad">${overdue.length} overdue</b>` : ''}.`
    : `<b>Every brand is locked.</b> ${thisWeek.length} thing${thisWeek.length === 1 ? '' : 's'} due this week${overdue.length ? `, <b class="bad">${overdue.length} overdue</b>` : ''}.`;

  const tiles = `<div class="v2tiles se-tiles">
    ${tile({ label: 'Black Friday', value: `${days} days`, sub: 'Fri Nov 27. Cyber Monday Nov 30.' })}
    ${tile({ label: 'Offers locked', value: tone(lockedN === brands.length ? 'good' : lockedN ? 'warn' : 'bad', `${lockedN} of ${brands.length}`), sub: noOffer.length ? `Nothing written: ${names(noOffer)}` : drafts.length ? `Proposals: ${names(drafts)}` : 'Black Friday weekend agreed with every client.', hint: 'A brand counts once its Black Friday weekend is locked with the client and November is not missing.' })}
    ${tile({ label: 'Goals set', value: tone(noGoal.length ? 'warn' : 'good', `${brands.length - noGoal.length} of ${brands.length}`), sub: noGoal.length ? `Missing: ${names(noGoal)}` : noLadder.length ? `Every brand has a goal. No ladder yet: ${names(noLadder)}` : 'Every brand has a goal and a ladder.' })}
    ${tile({ label: 'Due this week', value: String(thisWeek.length), sub: `Mon ${fmtD(wk0)} to Sun ${fmtD(wk1)}, every brand.` })}
    ${tile({ label: 'Overdue', value: tone(overdue.length ? 'bad' : 'good', String(overdue.length)), sub: overdue.length ? `Oldest: ${esc(overdue.slice().sort((x, y) => x.t.due.localeCompare(y.t.due))[0].a.name)}, ${esc(fmtD(overdue.slice().sort((x, y) => x.t.due.localeCompare(y.t.due))[0].t.due))}` : 'Nothing slipping.' })}
  </div>`;

  const seg = jobs([['offers', 'The offers'], ['now', 'This week', thisWeek.length + overdue.length || '', overdue.length > 0], ['cal', 'Week by week']], 'v', S.view);

  let body = '';
  if (S.view === 'offers') {
    const order = brands.slice().sort((x, y) => ['bad', 'warn', 'ok'].indexOf(brandState(x)[0]) - ['bad', 'warn', 'ok'].indexOf(brandState(y)[0]) || x.name.localeCompare(y.name));
    body += `<div class="se-offs">${order.map(a => offerCard(a, today)).join('')}</div>`;
    body += `<p class="se-quiet">Brands with nothing written come first. Hover a bar for the deal; click a card to open the brand.${off.length ? ` Not running a season: ${esc(off.map(a => a.name).join(', '))}. Open the brand and switch it on if that changes.` : ''}</p>`;
  } else if (S.view === 'now') {
    const group = (rows) => { const by = {}; rows.forEach(r => (by[r.a.act_id] = by[r.a.act_id] || { a: r.a, rows: [] }).rows.push(r)); return Object.values(by).sort((x, y) => x.a.name.localeCompare(y.a.name)); };
    const list = (rows) => group(rows).map(g => `<div class="se-when">${esc(g.a.name)}</div>${g.rows.map(r => taskRow(r.t, r.a, today, false)).join('')}`).join('');
    body += sCard('This week', overdue.length ? `${overdue.length} overdue, then ${thisWeek.length} due by Sunday. Tick it when it is done.` : `${thisWeek.length} due by Sunday. Tick it when it is done.`,
      `${overdue.length ? `<div class="se-when bad">Overdue</div>${overdue.sort((x, y) => x.t.due.localeCompare(y.t.due)).map(r => taskRow(r.t, r.a, today, true)).join('')}` : ''}
      ${thisWeek.length ? list(thisWeek.sort((x, y) => x.t.due.localeCompare(y.t.due))) : '<p class="v2hint" style="margin-top:8px">Nothing due this week.</p>'}`, 'Click a brand name to open its season');
    body += sCard('Status board', 'Where each brand stands, one column per part of the season.', `<div class="v2tbl"><table class="se-board"><colgroup><col class="c-brand"><col><col><col><col><col class="c-need"></colgroup><thead><tr><th>Brand</th><th>November</th><th>Thursday</th><th>Black Friday</th><th>December</th><th>Needed</th></tr></thead><tbody>
      ${brands.map(a => {
        const st = brandState(a); const c = counts(a, today);
        const cell = (p) => p ? `<div class="cell">${pill(p.status)}<small>${esc(fmtRange(p.start, p.end))}</small></div>` : '<span class="se-m">none</span>';
        const grpCell = (g) => { const ps = a.phases.filter(p => p.grp === g && p.key !== 'access' && !(g === 'bf' && p.key === 'planb')); if (!ps.length) return '<span class="se-m">none</span>'; const m = ps.find(p => p.key === 'bf') || ps[0]; return `<div class="cell"${tipAttr(phaseTip(m))}>${pill(m.status)}<small>${esc(fmtRange(m.start, m.end))}${ps.length > 1 ? ` · ${ps.length - 1} more` : ''}</small></div>`; };
        const kp = p => p ? `<div class="cell"${tipAttr(phaseTip(p))}>${pill(p.status)}<small>${esc(fmtRange(p.start, p.end))}</small></div>` : cell(p);
        return `<tr class="rowlink" data-pick="${esc(a.act_id)}"><td class="bn">${esc(a.name)}<br>${vpill(toneOf(st[0]), st[1])}</td>
          <td>${grpCell('nov')}</td><td>${kp(keyPhase(a, 'access'))}</td><td>${kp(keyPhase(a, 'bf'))}</td><td>${grpCell('dec')}</td>
          <td><span class="need">${c.over ? `<b class="bad">${c.over} overdue</b><br>` : ''}${a.goals.bf == null && a.goals.total == null ? `<b class="warn">no goal</b><br>` : ''}${!ladderDone(a.goals) ? `no ladder<br>` : ''}${c.week} due this week</span></td></tr>`;
      }).join('')}</tbody></table></div>`, 'Click a row to open it');
  } else {
    const wks = weeksOf(brands, today);
    body += sCard('Week by week, every brand', 'Each box is a week; the outlined one is now.', `<div class="se-weeks">${wks.map(w => weekBox(w, today, true)).join('')}</div>`, 'Briefs 23 days before a launch, built 9, loaded 4');
  }

  main.innerHTML = `<div class="se v2">${head(`${esc(seasonLabel())}: offers and dates`, 'What every brand is offering, when it runs, and what is due this week. Goals, the budget and the ladder are on The Plan; the sale itself is on Live.')}
    <p class="v2say lead">${verdict}</p>${tiles}${seg}${body}</div>`;
  main.querySelectorAll('.se-seg button[data-v]').forEach(b => b.onclick = () => { S.view = b.dataset.v; localStorage.setItem(LS_VIEW, S.view); paintAll(); window.scrollTo(0, 0); });
  main.querySelectorAll('.se-off, tr.rowlink').forEach(el => {
    el.onclick = e => { if (e.target.closest('a,button,input')) return; S.pick && S.pick(el.dataset.pick); };
    el.onkeydown = e => { if ((e.key === 'Enter' || e.key === ' ') && e.target === el) { e.preventDefault(); S.pick && S.pick(el.dataset.pick); } };
  });
  wireTasks(main);
  if (typeof window.pageActions === 'function') window.pageActions('');
}

/* ---------- ONE BRAND ---------- */
async function refresh() { await load(S.act); paintBrand(); }
async function renderBrand() {
  const main = $('#main');
  main.innerHTML = `<div class="se v2"><section class="v2card"><p class="v2hint">Loading the season…</p></section></div>`;
  await load(S.act);
  S.btab = localStorage.getItem(LS_BTAB) || 'offers';
  if (!BRAND_TABS.includes(S.btab)) S.btab = 'offers';   // 'goals' and 'desk' moved to The Plan and Live (2026-10-13)
  paintBrand();
}
const SHEET = [
  ['goal', 'Revenue goal, in words', 'The number and where it came from. The figures themselves go in Goals.'],
  ['last_year', 'Last year by window', 'Early BF, the weekend, December. Year one: say so.'],
  ['winning_offer', 'Offers that have worked', 'The winner gets rebranded per holiday, not replaced.'],
  ['floor', 'Discount floor', 'The deepest discount that still clears margin.'],
  ['inventory', 'Inventory and PO', 'Units on hand for hero SKUs vs the goal. Has the Q4 PO been placed?'],
  ['cutoffs', 'Shipping cutoffs', 'Standard and expedited. The most important date in December.'],
  ['returns', 'Holiday return window', 'Gift buyers want returns open into January.'],
  ['gift_cards', 'Gift cards', 'Set up and tested? The only product that sells Dec 20 to 24.'],
  ['approver', 'Who approves on the client side', 'Name the person and the turnaround.'],
];
const SETUP = [
  ['shape', 'Season shape', 'select', [['standard', 'Standard: Early BF sale, then a bigger weekend'], ['blacknov', 'Black November: a new offer every week'], ['access', 'Early Access: build a list, Thursday pays']]],
  ['strategist', 'Who briefs the ads', 'text'],
  ['buyer', 'Who runs the ads', 'text'],
  ['email_owner', 'Who runs email and SMS', 'text'],
];
/* The plan as sentences a new person can read in 20 seconds. */
function planLines(a) {
  return a.phases.filter(p => p.status !== 'skip' && p.start).map(p => {
    const when = p.end && p.end !== p.start ? `${fmtD(p.start)} to ${fmtD(p.end)}` : fmtDow(p.start);
    const who = p.who && !/^everyone$/i.test(p.who) ? ` For ${p.who.charAt(0).toLowerCase() + p.who.slice(1)}.` : '';
    const offer = p.offer ? p.offer.replace(/\.?$/, '.') : 'Offer not decided yet.';
    return { p, when, text: `<b>${esc(p.name)}.</b> ${esc(offer)}${esc(who)}${p.status === 'draft' ? ' ' + vpill('warn', 'proposal') : ''}${p.status === 'missing' ? ' ' + vpill('bad', 'missing') : ''}` };
  });
}
/* Revenue so far against each goal: the phases graded against it (goal_key), summed. Not pro-rated,
   so it is shown as progress, never as on or off target while a phase is still running. */
function goalProgress(a) {
  const out = {};
  for (const p of a.phases) {
    if (!p.results || !p.goal_key) continue;
    const o = out[p.goal_key] = out[p.goal_key] || { sales: 0, phases: [], running: false };
    o.sales += +p.results.sales || 0; o.phases.push(p.name);
    if (p.end && p.results.to < p.end) o.running = true;
  }
  return out;
}
function paintBrand() {
  const main = $('#main');
  const d = S.data; const a = d.accounts[0];
  if (!a) { main.innerHTML = `<div class="se v2">${head('Season', '')}<section class="v2card"><p class="v2hint">This client is not in Locus.</p></section></div>`; return; }
  const today = d.today; const days = daysBetween(today, d.bf);
  const st = brandState(a); const c = counts(a, today);
  const open = a.tasks.filter(t => !t.done && t.due);
  const overdue = open.filter(t => t.due < today).sort((x, y) => x.due.localeCompare(y.due));
  const g = a.goals || {};
  const prog = goalProgress(a);

  const need = [];
  for (const p of a.phases) if (p.status === 'missing' && !p.optional) need.push([`${p.name}: no offer written`, fmtRange(p.start, p.end)]);
  const drafts = a.phases.filter(p => p.status === 'draft');
  if (drafts.length === 1) need.push([`${drafts[0].name}: lock it with ${a.answers.approver || 'the client'}`, fmtRange(drafts[0].start, drafts[0].end)]);
  else if (drafts.length > 1) need.push([`${drafts.length} phases are proposals, not agreed: ${drafts.map(p => p.name).join('; ')}`, `lock with ${a.answers.approver || 'the client'}`]);
  if (g.bf == null && g.total == null) need.push(['A revenue goal for the weekend or the season', 'on The Plan']);
  if (!ladderDone(g)) need.push(['The ladder: breakeven, target, scale 50 and 100 lines', 'on The Plan, by Nov 13']);
  if (!a.answers.cutoffs) need.push(['Shipping cutoffs from the client', 'sets December']);
  if (!a.answers.gift_cards) need.push(['Gift cards: set up and tested?', 'by Dec 1']);

  /* Conclusion first: is the offer locked, what is slipping, how the season is doing so far. */
  const bfP = keyPhase(a, 'bf');
  const L = esc(seasonLabel());
  const stateSay = st[0] === 'ok' ? `The ${L} offer is locked.` : st[1] === 'Draft' ? `The ${L} offer is still a proposal.` : st[0] === 'warn' ? 'The weekend is locked; November is still open.' : bfP?.offer ? `The ${L} offer is written but not agreed.` : `There is no ${L} offer yet.`;
  const slipSay = overdue.length ? `<b class="bad">${overdue.length} overdue</b>, starting with ${esc(overdue[0].name)} (${esc(fmtD(overdue[0].due))}).` : 'Nothing overdue.';
  const progKey = ['bf', 'early', 'dec'].find(k => prog[k] && g[k]);
  const progSay = progKey ? ` So far ${moneyK(prog[progKey].sales)} against the ${moneyK(g[progKey])} ${progKey === 'bf' ? 'Black Friday' : progKey === 'early' ? 'November' : 'December'} goal (${Math.round(prog[progKey].sales / g[progKey] * 100)}%${prog[progKey].running ? ', still running' : ''}).` : '';
  const verdict = `<b>${stateSay}</b> ${c.locked} of ${c.counted} phases locked. ${slipSay} ${c.week} due this week.${progSay}`;

  const goalTile = g.bf != null ? [moneyK(g.bf), 'Black Friday weekend goal', 'bf'] : g.total != null ? [moneyK(g.total), 'Season goal', 'total'] : [null, 'No revenue goal yet'];
  const gp = goalTile[2] && prog[goalTile[2]];
  const tiles = `<div class="v2tiles se-tiles">
    ${tile({ label: 'Black Friday', value: `${days} days`, sub: esc(a.shape === 'access' ? 'Early Access shape' : a.shape === 'blacknov' ? 'Black November shape' : 'Standard shape') })}
    ${tile({ label: 'Offer', value: tone(toneOf(st[0]), esc(st[1])), sub: `${c.locked} of ${c.counted} phases locked.`, hint: 'Locked = the Black Friday weekend is agreed with the client and November is not missing.' })}
    ${tile({ label: 'Goal', value: goalTile[0] ? esc(goalTile[0]) : tone('warn', 'None'), sub: `${esc(goalTile[1])}${ladderDone(g) ? ' · ladder set' : ' · ladder not set'}`, bullet: gp && UI() ? `<div${tipAttr(`${moneyK(gp.sales)} so far from ${esc(gp.phases.join(', '))}, through yesterday${gp.running ? '. Still running, so this is progress, not a grade.' : '.'}`)}>${UI().ib(gp.sales, g[goalTile[2]], '--brand', `${Math.round(gp.sales / g[goalTile[2]] * 100)}% so far`)}</div>` : '' })}
    ${tile({ label: 'Due this week', value: String(c.week), sub: `${esc(a.answers.strategist || 'Ahsan')} briefs, ${esc(a.answers.buyer || 'Ahsan')} loads.` })}
    ${tile({ label: 'Overdue', value: tone(overdue.length ? 'bad' : 'good', String(overdue.length)), sub: overdue.length ? esc(overdue[0].name) : 'Nothing slipping.' })}
  </div>`;

  /* The plan in one read */
  const lines = planLines(a);
  const plan = sCard(`${esc(a.name)}: the plan in one read`, esc(goalLine(g)), `<div class="se-plan">
      <ol>${lines.map((l, i) => `<li class="${l.p.key === 'bf' ? 'bf' : ''}"><i>${i + 1}</i><div><div class="d">${esc(l.when)}</div><div>${l.text}</div></div></li>`).join('')}</ol>
      <div class="se-why ${a.answers.strategy_note ? '' : 'none'}"><div class="lab"><span>Why this offer, and the risk</span><button class="se-link se-mini" data-edit-answer="strategy_note">Edit</button></div>${esc(a.answers.strategy_note || 'Nobody has written why this is the plan. Two or three short paragraphs: what worked before, what the client wants, where the risk is.')}</div>
    </div>`, `${lines.length} parts`);

  /* Timeline */
  const timeline = sCard('The season', 'One row per phase. Hover a bar or a name for the deal.', `${ganttLegend(a.phases)}${gantt(a.phases, today)}`, 'Oct to Feb');

  /* Tabs */
  const seg = jobs([['offers', 'Offers', need.length || '', need.length > 0], ['todo', 'To-do', open.length || ''], ['sheet', 'Call sheet']], 'b', S.btab);

  let body = '';
  if (S.btab === 'offers') {
    const resLine = p => {
      if (!p.results) return '';
      const r = p.results; const goal = r.goal;
      const vs = goal ? ` · ${Math.round(r.sales / goal * 100)}% of the ${moneyK(goal)} goal` : '';
      return `<div class="res"><b>${money(r.sales)}</b> revenue so far on ${money(r.spend)} spend${r.mer != null ? ` · ${x2(r.mer)}` : ''}${r.orders ? ` · ${Math.round(r.orders)} orders` : ''}${vs}<br><span class="se-m">${esc(fmtD(r.from))} to ${esc(fmtD(r.to))}, same revenue line as P&L.</span></div>`;
    };
    const live = a.phases.filter(p => p.status !== 'skip');
    const skipped = a.phases.filter(p => p.status === 'skip');
    body += need.length
      ? sCard(`Still needed ${vpill('warn', String(need.length))}`, 'What stands between this plan and a locked season.', `<div class="se-need">${need.map(n => `<div><span>${esc(n[0])}</span><span>${esc(n[1])}</span></div>`).join('')}</div>`)
      : `<div class="v2note">${vpill('good', 'Nothing missing')} Every phase has an offer, the goal and ladder are set, and the dates that drive December are in.</div>`;
    body += `<div class="se-stack"><div class="se-bar"><h3>Each offer, in order</h3><div class="se-acts"><button class="btn se-mini" id="seLeadMath"${tipAttr('Opens Scenarios: what a lead can cost, what a plan returns')}>Lead math</button><button class="btn se-mini" id="seFormats">Ad formats to steal</button>${a.swipe_brand ? `<button class="btn se-mini" id="seBrandSwipe">This brand's swipe file</button>` : ''}<button class="btn se-mini" id="seAddPhase">+ Add a phase</button></div></div>`;
    body += dealsList(a, g, { results: true });
    body += `</div>`;
  } else if (S.btab === 'todo') {
    const wks = weeksOf([a], today).filter(w => w.items.length || w.lives.length);
    const upcoming = wks.filter(w => !w.past), past = wks.filter(w => w.past);
    body += sCard('What is due, week by week', `${open.length} open${overdue.length ? `, ${overdue.length} overdue` : ''}. Briefs, built, loaded and live dates follow each phase's start date.`,
      `<div class="se-weeks">${upcoming.map(w => weekBox(w, today, false)).join('') || '<p class="v2hint">No dated phases yet.</p>'}</div>
      ${past.length ? `<details style="margin-top:12px"><summary class="v2link" style="cursor:pointer">Past weeks (${past.length})</summary><div class="se-weeks" style="margin-top:10px">${past.map(w => weekBox(w, today, false)).join('')}</div></details>` : ''}
      <div style="margin-top:12px"><button class="btn se-mini" id="seAddTask">+ Add a task</button></div>`, 'Ticks are shared with everyone');
  } else {
    const sheetRows = SHEET.map(([k, label, hint]) => `<div class="k">${esc(label)}</div><div class="v ${a.answers[k] ? '' : 'none'}">${esc(a.answers[k] || hint)}</div><div class="e"><button class="btn se-mini" data-edit-answer="${k}">Edit</button></div>`).join('');
    const setupRows = SETUP.map(([k, label, type, opts]) => `<div class="k">${esc(label)}</div><div class="v ${a.answers[k] ? '' : 'none'}">${esc(type === 'select' ? (opts.find(o => o[0] === a.shape)?.[1] || '') : (a.answers[k] || (k === 'email_owner' ? 'Nick' : 'Ahsan')))}</div><div class="e"><button class="btn se-mini" data-edit-answer="${k}">Edit</button></div>`).join('');
    const blank = SHEET.filter(([k]) => !a.answers[k]).length;
    body += sCard('Call sheet and who does what', blank ? `${blank} of ${SHEET.length} answers still blank.` : 'Every answer is in.', `<div class="se-kv">${sheetRows}<div class="sep"></div>${setupRows}</div>`, 'The answers that set the dates and the offer');
    body += `<p class="se-quiet"><button class="se-link" id="seToggleSeason">${a.in_season ? 'This brand is not running a season this year' : 'Put this brand back on the season board'}</button></p>`;
  }

  main.innerHTML = `<div class="se v2">${head(`${esc(a.name)}: offers and dates`, 'The plan in one read, the season on one timeline, then the offers, to-dos and call sheet as tabs. Goals, the budget and the ladder are on The Plan; the sale itself is on Live.')}
    <p class="v2say lead">${verdict}</p>${tiles}${plan}${timeline}${seg}${body}</div>`;

  if (typeof window.pageActions === 'function') window.pageActions(`<button class="btn" id="seCopy">Copy offer sheet</button><button class="btn primary" id="seShare">Client link</button>`);
  main.querySelectorAll('.se-seg button[data-b]').forEach(b => b.onclick = () => { S.btab = b.dataset.b; localStorage.setItem(LS_BTAB, S.btab); const y = window.scrollY; paintBrand(); window.scrollTo(0, y); });
  const share = document.getElementById('seShare'); if (share) share.onclick = async () => {
    try { const r = await put('/api/season-share', { act: a.act_id }, 'POST'); await navigator.clipboard.writeText(r.url).catch(() => {}); toast('Client link copied'); window.open(r.url, '_blank', 'noopener'); } catch (e) { toast(e.message, true); }
  };
  const copy = document.getElementById('seCopy'); if (copy) copy.onclick = async () => {
    const out = [`${a.name} BFCM 2026 (Black Friday is Fri Nov 27)`, ''];
    lines.forEach((l, i) => { out.push(`${i + 1}. ${l.when}: ${l.p.name}. ${l.p.offer || 'offer not decided yet'}${l.p.who ? ` (${l.p.who})` : ''}${l.p.status !== 'locked' ? ` [${STATUS[l.p.status][0].toLowerCase()}]` : ''}`); if (l.p.detail) out.push(`   ${l.p.detail.replace(/\n+/g, ' ')}`); });
    if (g.bf != null || g.total != null) out.push('', goalLine(g));
    if (a.answers.cutoffs) out.push(`Shipping cutoffs: ${a.answers.cutoffs}`);
    if (a.answers.gift_cards) out.push(`Gift cards: ${a.answers.gift_cards}`);
    if (a.answers.strategy_note) out.push('', 'Why this offer:', a.answers.strategy_note);
    try { await navigator.clipboard.writeText(out.join('\n')); toast('Offer sheet copied'); } catch { toast('Could not copy here', true); }
  };
  main.querySelectorAll('[data-edit-phase]').forEach(b => b.onclick = () => editPhase(a, b.dataset.editPhase));
  main.querySelectorAll('[data-swipe]').forEach(b => b.onclick = () => { const p = a.phases.find(x => x.key === b.dataset.swipe); if (p?.swipe) showSwipe(p.swipe, `Swipe file: ${p.name}`); });
  const bs = document.getElementById('seBrandSwipe'); if (bs) bs.onclick = () => showSwipe(a.swipe_brand, `${a.name}'s own swipe file`);
  const fm = document.getElementById('seFormats'); if (fm) fm.onclick = showFormats;
  const lm = document.getElementById('seLeadMath'); if (lm) lm.onclick = () => { if (typeof window.show === 'function') window.show('calc'); };
  const ap = document.getElementById('seAddPhase'); if (ap) ap.onclick = () => editPhase(a, null);
  const at = document.getElementById('seAddTask'); if (at) at.onclick = () => editTask(a.act_id, null);
  main.querySelectorAll('[data-edit-answer]').forEach(b => b.onclick = () => editAnswer(a, b.dataset.editAnswer));
  const tg = document.getElementById('seToggleSeason'); if (tg) tg.onclick = async () => {
    const ok = typeof window.confirmModal === 'function' ? await window.confirmModal(a.in_season ? 'Take this brand off the season board?' : 'Put this brand on the season board?', a.in_season ? 'It disappears from All clients and the calendar. Nothing is deleted.' : 'It shows on the board again with everything it had.', a.in_season ? 'Take it off' : 'Put it on') : true;
    if (!ok) return;
    try { await put('/api/season/answer', { act: a.act_id, key: 'in_season', value: a.in_season ? 'no' : 'yes' }); await refresh(); } catch (e) { toast(e.message, true); }
  };
  wireTasks(main);
}
/* The offer list, one card per phase in order (the Offers tab here and the Offers step on The Plan use the same one).
   `phases` may carry results (this page) or not (The Plan). ro = no Edit buttons (a client login). */
function dealsList(a, g, { ro = false, results = true } = {}) {
  normPhases(a.phases);
  const resLine = p => {
    if (!results || !p.results) return '';
    const r = p.results; const goal = r.goal;
    const vs = goal ? ` · ${Math.round(r.sales / goal * 100)}% of the ${moneyK(goal)} goal` : '';
    return `<div class="res"><b>${money(r.sales)}</b> revenue so far on ${money(r.spend)} spend${r.mer != null ? ` · ${x2(r.mer)}` : ''}${r.orders ? ` · ${Math.round(r.orders)} orders` : ''}${vs}<br><span class="se-m">${esc(fmtD(r.from))} to ${esc(fmtD(r.to))}, same revenue line as P&L.</span></div>`;
  };
  const live = a.phases.filter(p => p.status !== 'skip');
  const skipped = a.phases.filter(p => p.status === 'skip');
  let out = `<div class="se-deals">${live.map((p, i) => `<div class="se-deal ${p.key === 'bf' ? 'key' : ''}" style="--c:${GRP[p.grp]?.[1] || 'var(--se-bf)'}">
      <div class="n"><span class="num">${i + 1}</span><div><div class="nm">${esc(p.name)}</div><div class="dt">${esc(fmtRange(p.start, p.end))}${p.who ? `<br>${esc(p.who)}` : ''}</div></div></div>
      <div><div style="display:flex;gap:8px;align-items:center;margin-bottom:6px">${pill(p.status)}${p.goal_key && g && g[p.goal_key] != null ? `<span class="se-m">goal ${moneyK(g[p.goal_key])}</span>` : ''}</div>
        <div class="big ${p.offer ? '' : 'none'}">${esc(p.offer || (p.hint || 'No offer written yet.'))}</div>${p.detail ? `<div class="x">${esc(p.detail)}</div>` : ''}${resLine(p)}</div>
      ${ro ? '<div></div>' : `<div class="act"><button class="btn primary se-mini" data-edit-phase="${esc(p.key)}">Edit</button>${p.swipe ? `<button class="btn se-mini" data-swipe="${esc(p.key)}">Swipe file</button>` : ''}</div>`}
    </div>`).join('')}</div>`;
  if (skipped.length) out += `<p class="se-quiet">Not running: ${skipped.map(p => `${esc(p.name)}${ro ? '' : ` <button class="se-link se-mini" data-edit-phase="${esc(p.key)}">edit</button>`}`).join(' · ')}</p>`;
  return out;
}
/* For The Plan (desk.js): the same list from the war payload's phases, and the same editor, without this page's state. */
function dealsHtml(a, opts) { return dealsList({ ...a, phases: (a.phases || []).map(p => ({ ...p })) }, a.goals || {}, opts); }
async function editPhaseFor({ tok, url, act, phases, name }, key) {
  if (tok) S.tok = tok; if (url) S.url = url;
  const a = { act_id: act, name, phases: (phases || []).map(p => ({ ...p })) };
  normPhases(a.phases);
  return editPhaseCore(a, key);
}
async function editPhase(a, key) { if (await editPhaseCore(a, key)) await refresh(); }
/** The offer editor. Returns true when something was saved or deleted, false when cancelled. */
async function editPhaseCore(a, key) {
  const p = key ? a.phases.find(x => x.key === key) : null;
  const r = await formModal({
    title: p ? p.name : 'Add a phase', hint: p?.hint || 'Something this brand runs that is not on the standard list, like a creator launch or a second drop.',
    fields: [
      { k: 'name', label: 'Name', value: p?.name || '' },
      { k: 'start', label: 'Starts', type: 'date', value: p?.start || '', half: 1 },
      { k: 'end', label: 'Ends', type: 'date', value: p?.end || '', half: 1, hint: 'Same day for a one-day event.' },
      { k: 'who', label: 'Who gets it', value: p?.who || '', ph: 'Everyone, members only, the list, BFCM buyers' },
      { k: 'offer', label: 'The deal, one line', value: p?.offer || '', ph: 'e.g. Any club = free hat. First 400 orders = free polo.' },
      { k: 'detail', label: 'Mechanics and fine print', type: 'textarea', value: p?.detail || '', ph: 'Dates inside the phase, what switches when, Plan B rules, what is still open.' },
      { k: 'status', label: 'Status', type: 'select', value: p?.status || 'draft', options: [['missing', 'Missing: nothing decided'], ['draft', 'Draft: proposed, not agreed'], ['locked', 'Locked: the client said yes'], ['skip', 'Skip: this brand is not running it']] },
      ...(p ? [] : [{ k: 'grp', label: 'Part of the season', type: 'select', value: 'bf', options: Object.entries(GRP).map(([k, v]) => [k, v[0]]) }]),
    ], cta: 'Save', danger: p && p.tpl === 0 && !['early', 'access', 'bf', 'planb', 'drop', 'xmas', 'gift', 'boxing', 'ny', 'vday'].includes(p.key) ? 'Delete phase' : null,
  });
  if (!r) return false;
  try {
    if (r.__delete) await put('/api/season/phase', { act: a.act_id, key: p.key }, 'DELETE');
    else {
      if (!r.name) { toast('Give it a name', true); return false; }
      const k = p ? p.key : ('x' + Date.now().toString(36));
      await put('/api/season/phase', { act: a.act_id, key: k, name: r.name, start: r.start || null, end: r.end || null, who: r.who, offer: r.offer, detail: r.detail, status: r.status, grp: p ? p.grp : r.grp, sort: p ? p.sort : 500 });
    }
    return true;
  } catch (e) { toast(e.message, true); return false; }
}
async function editAnswer(a, key) {
  if (key === 'strategy_note') {
    const r = await formModal({ title: `${a.name}: why this offer, and the risk`, hint: 'Plain words. What worked before, what the client wants, where the risk is, what we do if it misses. Shows on the plan card and in the copied offer sheet.', fields: [{ k: 'v', label: 'The thinking', type: 'textarea', value: a.answers.strategy_note || '', rows: 14 }], cta: 'Save' });
    if (!r) return;
    try { await put('/api/season/answer', { act: a.act_id, key, value: r.v }); await refresh(); } catch (e) { toast(e.message, true); }
    return;
  }
  const sheet = SHEET.find(s => s[0] === key); const setup = SETUP.find(s => s[0] === key);
  const label = sheet ? sheet[1] : setup[1];
  const field = setup && setup[2] === 'select'
    ? { k: 'v', label, type: 'select', value: a.shape, options: setup[3], hint: 'Changes the November phase template for this brand. Dates you already set are kept.' }
    : { k: 'v', label, type: sheet ? 'textarea' : 'text', value: a.answers[key] || '', hint: sheet ? sheet[2] : 'A name, as it should read on the calendar.' };
  const r = await formModal({ title: label, fields: [field], cta: 'Save' });
  if (!r) return;
  try { await put('/api/season/answer', { act: a.act_id, key, value: r.v }); await refresh(); } catch (e) { toast(e.message, true); }
}

/* ---------- the client link ---------- */
async function renderShare(token, url) {
  injectCss();
  const main = $('#main');
  main.innerHTML = `<div class="se v2 se-share"><section class="v2card"><p class="v2hint">Loading…</p></section></div>`;
  let d;
  try {
    const res = await fetch(url.replace(/\/+$/, '') + '/api/season/' + token);
    d = await res.json();
    if (!res.ok) throw new Error(d.error || 'This link is no longer valid.');
  } catch (e) { main.innerHTML = `<div class="gate"><h1>Season plan unavailable</h1><p>${esc(e.message)}</p></div>`; return; }
  normPhases(d.phases);
  const t = $('.hd-title'); if (t) t.innerHTML = `${esc(d.account.name)} <em>Season 2026</em>`;
  const days = daysBetween(d.today, d.bf);
  const dates = Object.entries(d.dates || {});
  const DL = { cutoffs: 'Shipping cutoffs', returns: 'Return window', gift_cards: 'Gift cards' };
  const byDay = {};
  (d.checkins || []).forEach(c => (byDay[c.date] = byDay[c.date] || []).push(c));
  const fake = { name: d.account.name, phases: d.phases, answers: {} };
  const lines = planLines(fake);
  const okN = d.phases.filter(p => p.status === 'locked').length, propN = d.phases.filter(p => p.status === 'draft' || p.status === 'missing').length;
  main.innerHTML = `<div class="se v2 se-share">
    <div class="ph"><div><div class="ph-t">${esc(d.account.name)}: the season, start to finish</div><p class="ph-sub">What runs when, who gets it, and what the deal is. Anything marked proposal is still being decided together. Once a phase is live, its revenue so far shows on the card.</p></div></div>
    <p class="v2say lead"><b>${days > 0 ? `${days} days to Black Friday (Fri Nov 27).` : 'The season is under way.'}</b> ${okN} part${okN === 1 ? '' : 's'} of the plan ${okN === 1 ? 'is' : 'are'} agreed${propN ? `, ${propN} still being decided` : ''}.</p>
    ${sCard('The plan in one read', '', `<div class="se-plan" style="grid-template-columns:1fr"><ol>${lines.map((l, i) => `<li class="${l.p.key === 'bf' ? 'bf' : ''}"><i>${i + 1}</i><div><div class="d">${esc(l.when)}</div><div>${l.text}</div></div></li>`).join('')}</ol></div>`)}
    ${sCard('The season', 'Hover a bar for the deal.', `${ganttLegend(d.phases)}${gantt(d.phases, d.today)}`)}
    <div class="se-deals">${d.phases.map((p, i) => `<div class="se-deal ${p.key === 'bf' ? 'key' : ''}" style="--c:${GRP[p.grp]?.[1] || 'var(--se-bf)'};grid-template-columns:230px minmax(0,1fr)">
      <div class="n"><span class="num">${i + 1}</span><div><div class="nm">${esc(p.name)}</div><div class="dt">${esc(fmtRange(p.start, p.end))}${p.who ? `<br>${esc(p.who)}` : ''}</div></div></div>
      <div>${p.status === 'locked' ? '' : `<div style="margin-bottom:6px">${pill(p.status)}</div>`}<div class="big ${p.offer ? '' : 'none'}">${esc(p.offer || 'Being decided.')}</div>${p.detail ? `<div class="x">${esc(p.detail)}</div>` : ''}
      ${p.results ? `<div class="res"><b>${money(p.results.sales)}</b> revenue so far${p.results.orders ? ` · ${Math.round(p.results.orders)} orders` : ''}<br><span class="se-m">${esc(fmtD(p.results.from))} to ${esc(fmtD(p.results.to))}</span></div>` : ''}</div></div>`).join('')}</div>
    ${dates.length ? sCard('Dates that matter', '', `<div class="se-kv" style="grid-template-columns:170px 1fr">${dates.map(([k, v]) => `<div class="k">${esc(DL[k] || k)}</div><div class="v">${esc(v)}</div>`).join('')}</div>`) : ''}
    ${Object.keys(byDay).length ? sCard('What we did, check-in by check-in', '', Object.keys(byDay).sort().map(day => `<div class="se-when">${esc(fmtDow(day))}</div>${byDay[day].map(c => `<div class="se-slot" style="grid-template-columns:90px 1fr"><div class="s">${esc(SLOTS.find(s => s[0] === c.slot)?.[1] || c.slot)}</div><div class="did">${esc(c.action)}<small>${esc(c.by || 'Mobius')}</small></div></div>`).join('')}`).join('')) : ''}
    ${d.asks?.length ? sCard('What we need from you', '', d.asks.map(x => `<div class="se-task"><span></span><div class="n">${esc(x.name)}<small>${esc(x.phase || '')}</small></div><div class="r"><b>${esc(x.due ? fmtDow(x.due) : '')}</b></div></div>`).join('')) : ''}
    <p class="v2foot">Prepared by Mobius Digital. This page updates as the plan does.</p>
  </div>`;
}

/* ---------- entry ---------- */
async function render({ tok, url, act, accounts, pick }) {
  Object.assign(S, { tok, url, act, accounts: accounts || [], pick });
  injectCss();
  if (act === 'all') return renderAll();
  return renderBrand();
}
window.SeasonTab = { render, renderShare, dealsHtml, editPhase: editPhaseFor, injectCss, seasonLabel };
})();

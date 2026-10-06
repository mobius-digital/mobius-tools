/* Locus - the Season tab.
 * 2026-10-05 built; 2026-10-06 goals, results, desk, swipe; same night rebuilt twice after Cole:
 * "I still don't see what our offers are", "it's a long scroll", "the season bar looks like Canva".
 *
 * Shape now:
 *   All clients   The offers (default): one card per brand, Black Friday deal in big type,
 *                 November and December beside it, a season bar with hover. Then This week,
 *                 Week by week, Desk as segments.
 *   One brand     Strip, then THE PLAN IN ONE READ (numbered sentences + "why this offer"),
 *                 the season timeline (one row per phase, hover for the deal), then five
 *                 in-page tabs: Offers, Goals and results, Desk, To-do, Call sheet. No long scroll.
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
const S = { url: '', tok: '', act: 'all', accounts: [], pick: null, data: null, view: 'offers', btab: 'offers', deskDate: null, live: {} };
const LS_VIEW = 'se_view3', LS_BTAB = 'se_btab';
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
const clock = iso => { if (!iso) return ''; const d = new Date(iso); if (isNaN(d)) return String(iso); return new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', hour: 'numeric', minute: '2-digit' }).format(d) + ' CT'; };

const GRP = { nov: ['November', 'var(--se-nov)'], bf: ['Black Friday', 'var(--se-bf)'], dec: ['December', 'var(--se-dec)'], late: ['After Christmas', 'var(--se-late)'], vday: ['Valentine\'s', 'var(--se-vday)'] };
const STATUS = { locked: ['Locked', 'good'], draft: ['Draft', 'warn'], missing: ['Missing', 'bad'], skip: ['Skipped', 'unk'] };
const pill = st => { const s = STATUS[st] || STATUS.missing; return `<span class="pill ${s[1]}">${s[0]}</span>`; };
const SLOTS = [['8am', '8:00 AM'], ['4pm', '4:00 PM'], ['12am', 'Midnight']];
const DESK_DAYS = ['2026-11-26', '2026-11-27', '2026-11-28', '2026-11-29', '2026-11-30'];
const BF = '2026-11-27';

/* The scaling ladder, the 2025 sheet's rule in code. A verdict needs real spend behind it. */
function spendFloor(goals) { return Math.max(100, ((goals && goals.start) || 0) * 3 / 24 * 0.5); }
function ladderOf(goals, mer, spent) {
  if (!goals || goals.be == null || goals.target == null) return { ok: false, text: 'Set the ladder on the brand page', cls: 'unk' };
  if (mer == null) return { ok: true, text: 'No spend yet', cls: 'unk' };
  if (spent != null && spent < spendFloor(goals)) return { ok: false, text: `Too early to grade: ${money(spent)} spent in 3 hours (needs ${money(spendFloor(goals))})`, cls: 'unk' };
  if (goals.s100 != null && mer >= goals.s100) return { ok: true, text: 'Scale by 100%', cls: 'good', key: 'scale100' };
  if (goals.s50 != null && mer >= goals.s50) return { ok: true, text: 'Scale by 50%', cls: 'good', key: 'scale50' };
  if (mer >= goals.target) return { ok: true, text: 'Hold', cls: 'unk', key: 'hold' };
  if (mer >= goals.be) return { ok: true, text: 'Pull back', cls: 'warn', key: 'pull' };
  return { ok: true, text: 'Rework the offer, consider turning ads off', cls: 'bad', key: 'off' };
}
const ladderDone = g => g && g.be != null && g.target != null && g.s50 != null && g.s100 != null;

/* ---------- css ---------- */
function injectCss() {
  if (document.getElementById('seCss')) return;
  const st = document.createElement('style');
  st.id = 'seCss';
  st.textContent = `
  .se{--se-nov:#2F6F9F;--se-bf:#1E7A45;--se-dec:#A8801F;--se-late:#9A3F2E;--se-vday:#A0435E;--se-line:var(--line,#E3E8EC);--se-muted:var(--muted,#5F6F7B);--se-surface:var(--surface,#fff);--se-wash:var(--wash,#F3F6F8)}
  .se .card{margin-bottom:16px}
  .se .se-key{border-color:var(--brand,#1F6F8B);box-shadow:0 0 0 3px rgba(var(--brand-rgb,31,111,139),.14)}
  .se-verdict{font-family:var(--serif,Georgia,serif);font-size:19px;line-height:1.35;margin:0 0 12px}
  .se-seg{display:inline-flex;gap:4px;border:1px solid var(--se-line);border-radius:99px;padding:3px;margin:0 0 14px;background:var(--bg,#fff);flex-wrap:wrap}
  .se-seg button{border:0;background:transparent;border-radius:99px;padding:7px 15px;font:600 13px var(--sans,system-ui);color:var(--se-muted);cursor:pointer}
  .se-seg button.on{background:var(--ink,#111);color:var(--on-ink,#fff)}
  .se-seg button b{font-weight:700;margin-left:4px;opacity:.7}
  /* the plan in one read */
  .se-plan{display:grid;grid-template-columns:1.25fr 1fr;gap:20px}
  .se-plan ol{margin:0;padding:0;list-style:none;display:flex;flex-direction:column;gap:8px}
  .se-plan li{display:grid;grid-template-columns:26px 1fr;gap:10px;font-size:15px;line-height:1.45}
  .se-plan li i{width:24px;height:24px;border-radius:50%;background:var(--ink,#111);color:var(--on-ink,#fff);font:700 12px var(--sans,system-ui);font-style:normal;display:grid;place-items:center;margin-top:1px}
  .se-plan li b{font-weight:700}
  .se-plan li.bf b{color:var(--se-bf)}
  .se-plan li .d{color:var(--se-muted);font-size:13px}
  .se-why{background:var(--se-wash);border-radius:12px;padding:14px 16px;font-size:14px;line-height:1.5;white-space:pre-line;min-width:0;max-height:420px;overflow:auto}
  .se-why .lab{font:600 10.5px var(--sans,system-ui);letter-spacing:.1em;text-transform:uppercase;color:var(--se-muted);display:flex;justify-content:space-between;align-items:center;margin-bottom:6px}
  .se-why.none{color:var(--se-muted);font-style:italic}
  /* timeline (one row per phase) */
  .se-gantt{position:relative;display:grid;grid-template-columns:200px 1fr;column-gap:14px;row-gap:0;font-size:13px}
  .se-gantt .gh{display:contents}
  .se-gantt .gh .lbl{height:30px}
  .se-gantt .gh .axis{position:relative;height:30px;border-bottom:1px solid var(--se-line)}
  .se-gantt .axis span{position:absolute;bottom:6px;font:600 10.5px var(--sans,system-ui);letter-spacing:.08em;text-transform:uppercase;color:var(--se-muted);transform:translateX(-50%)}
  .se-gantt .gr{display:contents}
  .se-gantt .gr .lbl{display:flex;align-items:center;gap:8px;height:34px;border-bottom:1px solid var(--se-line);min-width:0}
  .se-gantt .gr .lbl b{font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .se-gantt .gr .lbl i{width:8px;height:8px;border-radius:50%;background:var(--c);flex:none}
  .se-gantt .gr .trk{position:relative;height:34px;border-bottom:1px solid var(--se-line)}
  .se-gantt .grid{position:absolute;top:0;bottom:0;border-left:1px dashed var(--se-line)}
  .se-gantt .bar{position:absolute;top:7px;height:20px;border-radius:6px;background:var(--c);color:#fff;font:600 11px var(--sans,system-ui);line-height:20px;padding:0 8px;white-space:nowrap;box-sizing:border-box;cursor:default;min-width:6px;transition:transform .12s}
  .se-gantt .bar .in{display:block;overflow:hidden;text-overflow:ellipsis}
  .se-gantt .bar:hover{transform:translateY(-1px);box-shadow:0 4px 12px -4px rgba(0,0,0,.35)}
  .se-gantt .bar.draft{background:repeating-linear-gradient(135deg,var(--c) 0 6px,color-mix(in srgb,var(--c) 70%,#fff) 6px 12px)}
  .se-gantt .bar.missing{background:transparent;border:1.5px dashed var(--c);color:var(--c)}
  .se-gantt .bar .after{position:absolute;left:100%;top:0;padding-left:8px;color:var(--ink,#111);font-weight:500;max-width:260px;overflow:hidden;text-overflow:ellipsis}
  .se-gantt .mk{position:absolute;top:0;bottom:0;width:0;border-left:2px solid var(--m);pointer-events:none}
  .se-gantt .mk b{position:absolute;top:4px;left:-1px;transform:translateX(-50%);font:700 9.5px var(--sans,system-ui);letter-spacing:.08em;text-transform:uppercase;color:#fff;background:var(--m);border-radius:4px;padding:2px 6px;white-space:nowrap}
  .se-gantt .mk.dim{border-left-style:dashed}
  .se-tip{position:fixed;z-index:95;max-width:300px;background:var(--ink,#111);color:var(--on-ink,#fff);border-radius:10px;padding:10px 12px;font:13px/1.45 var(--sans,system-ui);box-shadow:0 10px 30px -8px rgba(0,0,0,.4);pointer-events:none}
  .se-tip b{display:block;font-size:14px;margin-bottom:2px}
  .se-tip .m{opacity:.75;font-size:12px}
  /* offers, all clients */
  .se-off{display:grid;grid-template-columns:200px 1fr;gap:18px;padding:18px 20px;border:1px solid var(--se-line);border-radius:14px;background:var(--se-surface);margin-bottom:12px;cursor:pointer;min-width:0}
  .se-off:hover{border-color:var(--brand,#1F6F8B)}
  .se-off .who{display:flex;flex-direction:column;gap:6px;min-width:0}
  .se-off .who b{font-family:var(--serif,Georgia,serif);font-weight:400;font-size:22px;line-height:1.1}
  .se-off .who .m{font-size:12px;color:var(--se-muted);line-height:1.45}
  .se-off .body{display:grid;grid-template-columns:1.6fr 1fr;gap:16px;min-width:0}
  .se-off .col{min-width:0}
  .se-off .lab{font:600 10.5px var(--sans,system-ui);letter-spacing:.1em;text-transform:uppercase;color:var(--se-muted);display:flex;gap:8px;align-items:center;margin-bottom:5px}
  .se-off .deal{font-family:var(--display,var(--sans,system-ui));font-weight:700;font-size:20px;line-height:1.25;letter-spacing:-.01em}
  .se-off .deal.small{font-size:14px;font-weight:600}
  .se-off .deal.none{font-weight:400;font-style:italic;color:var(--bad,#B03A2E);font-size:15px}
  .se-off .sub{font-size:12px;color:var(--se-muted);margin:4px 0 0;line-height:1.4}
  .se-off .mini{margin:0 0 8px}
  .se-off .bar{grid-column:1/-1}
  /* offers, one brand */
  .se-deal{display:grid;grid-template-columns:230px 1fr auto;gap:16px;padding:16px 18px;border:1px solid var(--se-line);border-left:6px solid var(--c);border-radius:12px;background:var(--se-surface);margin-bottom:10px;min-width:0;align-items:start}
  .se-deal.key{box-shadow:0 0 0 3px rgba(30,122,69,.14);border-color:var(--c)}
  .se-deal .n{display:flex;gap:10px;align-items:flex-start}
  .se-deal .num{width:26px;height:26px;flex:none;border-radius:50%;background:var(--ink,#111);color:var(--on-ink,#fff);font:700 12px var(--sans,system-ui);display:grid;place-items:center}
  .se-deal .nm{font-family:var(--serif,Georgia,serif);font-size:17px;line-height:1.2}
  .se-deal .dt{font-size:12px;color:var(--se-muted);margin-top:3px;line-height:1.4}
  .se-deal .big{font-family:var(--display,var(--sans,system-ui));font-weight:700;font-size:19px;line-height:1.25;letter-spacing:-.01em}
  .se-deal .big.none{font-weight:400;font-style:italic;color:var(--se-muted);font-size:15px}
  .se-deal .x{font-size:13px;color:var(--se-muted);line-height:1.45;margin-top:6px;white-space:pre-line}
  .se-deal .res{font-size:12.5px;line-height:1.45;background:var(--se-wash);border-radius:8px;padding:7px 9px;margin-top:8px}
  .se-deal .res b{font-size:13px}
  .se-deal .act{display:flex;flex-direction:column;gap:6px;align-items:flex-end}
  .se-ads{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:10px}
  .se-ad{display:block;border:1px solid var(--se-line);border-radius:10px;overflow:hidden;background:var(--se-wash);color:inherit;text-decoration:none;min-width:0}
  .se-ad img{display:block;width:100%;aspect-ratio:4/5;object-fit:cover;background:#ddd}
  .se-ad .c{padding:6px 8px;font-size:11.5px;line-height:1.3}
  .se-ad .c b{display:block;font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  /* tasks */
  .se-task{display:grid;grid-template-columns:22px 1fr auto;gap:10px;align-items:start;padding:9px 0;border-bottom:1px solid var(--se-line)}
  .se-task:last-child{border-bottom:0}
  .se-task input{margin:4px 0 0;width:16px;height:16px;accent-color:var(--good,#1E7A45);cursor:pointer}
  .se-task .n{font-size:14px;line-height:1.4}
  .se-task .n small{display:block;color:var(--se-muted);font-size:12px;margin-top:1px}
  .se-task.done .n{color:var(--se-muted);text-decoration:line-through}
  .se-task.done .n small{text-decoration:none}
  .se-task .r{text-align:right;font-size:12px;color:var(--se-muted);white-space:nowrap;line-height:1.4}
  .se-task .r b{display:block;font-size:12.5px;color:var(--ink,#111)}
  .se-task.over .r b{color:var(--bad,#B03A2E)}
  .se-brand{display:inline-block;font:600 11px var(--sans,system-ui);letter-spacing:.02em;border-radius:6px;padding:1px 7px;margin-right:6px;background:var(--se-wash);color:var(--ink,#111);vertical-align:1px}
  .se-brand.link{cursor:pointer}
  .se-when{font:600 11px var(--sans,system-ui);letter-spacing:.08em;text-transform:uppercase;color:var(--se-muted);margin:14px 0 4px}
  .se-when:first-child{margin-top:0}
  .se-board{width:100%;border-collapse:collapse;font-size:13.5px;table-layout:fixed}
  .se-board col.c-brand{width:150px}.se-board col.c-need{width:128px}
  .se-board th{text-align:left;font:600 11px var(--sans,system-ui);letter-spacing:.06em;text-transform:uppercase;color:var(--se-muted);padding:6px 10px;border-bottom:1px solid var(--se-line);white-space:nowrap}
  .se-board td{padding:10px;border-bottom:1px solid var(--se-line);vertical-align:top;white-space:normal;overflow-wrap:anywhere}
  .se-board tr:last-child td{border-bottom:0}
  .se-board tr.rowlink{cursor:pointer}
  .se-board tr.rowlink:hover td{background:var(--se-wash)}
  .se-board .bn{font-weight:700}
  .se-board .cell small{display:block;color:var(--se-muted);font-size:11.5px;margin-top:3px;line-height:1.3}
  .se-weeks{display:grid;grid-template-columns:repeat(auto-fill,minmax(270px,1fr));gap:10px}
  .se-wk{border:1px solid var(--se-line);border-radius:12px;padding:10px 12px;background:var(--se-surface);min-width:0}
  .se-wk.now{border-color:var(--good,#1E7A45);box-shadow:0 0 0 3px rgba(30,122,69,.14)}
  .se-wk.past{opacity:.72}
  .se-wk .h{display:flex;justify-content:space-between;align-items:baseline;gap:8px;margin-bottom:4px}
  .se-wk .h b{font-family:var(--serif,Georgia,serif);font-weight:400;font-size:16px}
  .se-wk .h span{font-size:11.5px;color:var(--se-muted);white-space:nowrap}
  .se-wk .se-task{padding:5px 0}
  .se-kv{display:grid;grid-template-columns:170px 1fr auto;gap:8px 14px;align-items:start;font-size:14px}
  .se-kv .k{color:var(--se-muted);font-size:12.5px;padding-top:2px}
  .se-kv .v{white-space:pre-line;line-height:1.45;min-width:0}
  .se-kv .v.none{color:var(--se-muted);font-style:italic}
  .se-kv .e{justify-self:end}
  .se-kv .sep{grid-column:1/-1;border-top:1px solid var(--se-line);margin:2px 0}
  .se-need{display:flex;flex-direction:column;gap:6px}
  .se-need div{display:grid;grid-template-columns:1fr auto;gap:10px;font-size:14px;padding:7px 10px;border-radius:8px;background:var(--se-wash)}
  .se-need div span:last-child{color:var(--se-muted);font-size:12px;white-space:nowrap}
  .se-in{width:100%;border:1px solid var(--se-line);border-radius:8px;padding:8px 10px;font:14px var(--sans,system-ui);background:var(--se-surface);color:inherit;box-sizing:border-box}
  textarea.se-in{min-height:84px;resize:vertical;line-height:1.45}
  .se-f{display:flex;flex-direction:column;gap:4px;margin-bottom:10px}
  .se-f label{font-size:12.5px;font-weight:600}
  .se-f small{color:var(--se-muted);font-size:11.5px}
  .se-f2{display:grid;grid-template-columns:1fr 1fr;gap:10px}
  .se-link{background:none;border:0;padding:0;font:inherit;color:var(--brand,#1F6F8B);cursor:pointer;text-decoration:underline}
  .se-mini{font-size:12.5px;padding:5px 10px}
  .se-strip{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:5px;margin-bottom:16px}
  .se-strip .ru{background:var(--ink-panel,#1b2a36);border-radius:12px;padding:14px 18px;color:var(--on-ink,#fff)}
  .se-strip .ru-l{font-size:10px;font-weight:600;letter-spacing:.12em;text-transform:uppercase;opacity:.75}
  .se-strip .ru-v{font-family:var(--display,var(--sans,system-ui));font-weight:700;font-size:26px;line-height:1.1;margin-top:4px}
  .se-strip .ru-d{font-size:11px;opacity:.8;margin-top:5px;line-height:1.4}
  .se-strip .ru-v.bad{color:#F2A197}.se-strip .ru-v.warn{color:#E9CC7A}.se-strip .ru-v.good{color:#8FD8A8}
  .se-goals{display:grid;grid-template-columns:repeat(auto-fit,minmax(110px,1fr));gap:8px}
  .se-g{border:1px solid var(--se-line);border-radius:10px;padding:8px 10px;min-width:0}
  .se-g .l{font-size:11px;color:var(--se-muted);letter-spacing:.04em;text-transform:uppercase}
  .se-g .v{font-family:var(--display,var(--sans,system-ui));font-weight:700;font-size:20px;line-height:1.2;margin-top:2px}
  .se-g .v.none{color:var(--se-muted);font-weight:400;font-size:14px;font-style:italic}
  .se-ladder{display:flex;flex-wrap:wrap;gap:6px;margin-top:10px}
  .se-ladder span{font-size:12px;border-radius:99px;padding:3px 10px;background:var(--se-wash)}
  .se-days{display:flex;gap:6px;flex-wrap:wrap;margin:0 0 12px}
  .se-days button{border:1px solid var(--se-line);background:var(--se-surface);border-radius:99px;padding:5px 12px;font:600 12.5px var(--sans,system-ui);cursor:pointer;color:inherit}
  .se-days button.on{background:var(--ink,#111);color:var(--on-ink,#fff);border-color:var(--ink,#111)}
  .se-desk{border:1px solid var(--se-line);border-radius:12px;padding:12px 14px;background:var(--se-surface);margin-bottom:10px}
  .se-desk .h{display:flex;gap:14px;align-items:baseline;flex-wrap:wrap;margin-bottom:8px}
  .se-desk .h b{font-family:var(--serif,Georgia,serif);font-weight:400;font-size:18px;cursor:pointer}
  .se-desk .live{display:flex;gap:16px;flex-wrap:wrap;font-size:13px;color:var(--se-muted)}
  .se-desk .live b{color:var(--ink,#111);font-size:15px}
  .se-slot{display:grid;grid-template-columns:90px 1fr auto;gap:10px;align-items:center;padding:7px 0;border-top:1px dashed var(--se-line)}
  .se-slot .s{font-weight:700;font-size:13px}
  .se-slot .did{font-size:13.5px;line-height:1.4}
  .se-slot .did small{display:block;color:var(--se-muted);font-size:11.5px}
  .se-slot input.se-in{padding:6px 9px;font-size:13px}
  .se-res-tbl{width:100%;border-collapse:collapse;font-size:13.5px}
  .se-res-tbl th{text-align:left;font:600 11px var(--sans,system-ui);letter-spacing:.06em;text-transform:uppercase;color:var(--se-muted);padding:6px 8px;border-bottom:1px solid var(--se-line)}
  .se-res-tbl td{padding:8px;border-bottom:1px solid var(--se-line);font-variant-numeric:tabular-nums}
  .se-res-tbl td.num{text-align:right;white-space:nowrap}
  .se-share{max-width:900px;margin:0 auto}
  @media (max-width:980px){.se-off{grid-template-columns:1fr}.se-off .body{grid-template-columns:1fr}.se-deal{grid-template-columns:1fr}.se-deal .act{flex-direction:row;align-items:center}.se-plan{grid-template-columns:1fr}.se-gantt{grid-template-columns:120px 1fr}}
  @media (max-width:820px){.se-kv{grid-template-columns:1fr}.se-kv .e{justify-self:start}.se-f2{grid-template-columns:1fr}.se-task .r{text-align:left;grid-column:2}.se-slot{grid-template-columns:1fr}}
  `;
  document.head.appendChild(st);
}

/* ---------- tooltips (one element, moved around) ---------- */
let TIP = null;
function tipShow(html, x, y) {
  if (!TIP) { TIP = document.createElement('div'); TIP.className = 'se-tip'; document.body.appendChild(TIP); }
  TIP.innerHTML = html; TIP.style.display = 'block';
  const w = TIP.offsetWidth, h = TIP.offsetHeight;
  let left = x + 14, top = y + 14;
  if (left + w > innerWidth - 10) left = x - w - 14;
  if (top + h > innerHeight - 10) top = y - h - 14;
  TIP.style.left = left + 'px'; TIP.style.top = top + 'px';
}
function tipHide() { if (TIP) TIP.style.display = 'none'; }
function wireTips(root) {
  root.querySelectorAll('[data-tip]').forEach(el => {
    el.onmouseenter = e => tipShow(el.dataset.tip, e.clientX, e.clientY);
    el.onmousemove = e => tipShow(el.dataset.tip, e.clientX, e.clientY);
    el.onmouseleave = tipHide;
  });
}
const phaseTip = p => `<b>${esc(p.name)}</b><span class="m">${esc(fmtRange(p.start, p.end))}${p.who ? ' · ' + esc(p.who) : ''} · ${STATUS[p.status]?.[0] || ''}</span><div style="margin-top:6px">${esc(p.offer || 'No offer written yet.')}</div>`;

/* ---------- the timeline: one row per phase ---------- */
const TL_FROM = '2026-10-05', TL_TO = '2027-02-08';
const tlPct = iso => Math.max(0, Math.min(100, daysBetween(TL_FROM, iso) / daysBetween(TL_FROM, TL_TO) * 100));
const MONTHS_TL = [['2026-11-01', 'Nov'], ['2026-12-01', 'Dec'], ['2027-01-01', 'Jan'], ['2027-02-01', 'Feb']];
function gantt(phases, today) {
  const rows = phases.filter(p => p.start && p.status !== 'skip');
  const grid = MONTHS_TL.map(([d]) => `<i class="grid" style="left:${tlPct(d)}%"></i>`).join('');
  const marks = `<div class="mk" style="left:${tlPct(BF)}%;--m:var(--se-bf)"><b>Black Friday</b></div>${today >= TL_FROM && today <= TL_TO ? `<div class="mk dim" style="left:${tlPct(today)}%;--m:var(--ink,#111)"><b>Today</b></div>` : ''}`;
  const head = `<div class="gh"><div class="lbl"></div><div class="axis"><span style="left:${tlPct('2026-10-15')}%">Oct</span>${MONTHS_TL.map(([d, l]) => `<span style="left:${tlPct(addDays(d, 14))}%">${l}</span>`).join('')}</div></div>`;
  const body = rows.map(p => {
    const l = tlPct(p.start), r = Math.max(tlPct(addDays(p.end || p.start, 1)), l + 0.8);
    const w = r - l;
    const c = GRP[p.grp]?.[1] || 'var(--se-bf)';
    const inside = w > 10 ? `<span class="in">${esc(p.offer || p.name)}</span>` : '';
    const after = w <= 10 ? `<span class="after">${esc((p.offer || '').slice(0, 60))}</span>` : '';
    return `<div class="gr"><div class="lbl" style="--c:${c}"><i></i><b title="${esc(p.name)}">${esc(p.name)}</b></div><div class="trk">${grid}<div class="bar ${p.status}" style="--c:${c};left:${l}%;width:${w}%" data-tip="${esc(phaseTip(p))}">${inside}${after}</div></div></div>`;
  }).join('');
  /* The markers sit in an overlay that covers only the track column (label column is 200px + 14px gap). */
  return `<div class="se-gantt">${head}${body}<div class="gr"><div class="lbl" style="border:0;height:14px"></div><div class="trk" style="border:0;height:14px"></div></div><div style="position:absolute;left:214px;right:0;top:0;bottom:0;pointer-events:none">${marks}</div></div>`;
}
/* Compact bar for the all-clients card: one row, hover for the deal. */
function miniBar(a, today) {
  const show = a.phases.filter(p => p.start && p.status !== 'skip' && !['access', 'planb', 'cm', 'boxing'].includes(p.key));
  const segs = show.map(p => {
    const l = tlPct(p.start), r = Math.max(tlPct(addDays(p.end || p.start, 1)), l + 0.8);
    return `<div class="bar ${p.status}" style="--c:${GRP[p.grp]?.[1] || 'var(--se-bf)'};left:${l}%;width:${r - l}%;top:12px;height:14px;line-height:14px;font-size:10px;padding:0 6px" data-tip="${esc(phaseTip(p))}">${r - l > 9 ? `<span class="in">${esc(p.name)}</span>` : ''}</div>`;
  }).join('');
  return `<div class="se-gantt" style="grid-template-columns:1fr;column-gap:0"><div class="gr"><div class="trk" style="height:30px;border:0">${MONTHS_TL.map(([d, l]) => `<i class="grid" style="left:${tlPct(d)}%"></i><span style="position:absolute;left:${tlPct(d)}%;top:0;font:600 9.5px var(--sans,system-ui);letter-spacing:.08em;text-transform:uppercase;color:var(--se-muted);padding-left:4px">${l}</span>`).join('')}${segs}<div class="mk" style="left:${tlPct(BF)}%;--m:var(--se-bf)"></div>${today >= TL_FROM && today <= TL_TO ? `<div class="mk dim" style="left:${tlPct(today)}%;--m:var(--ink,#111)"></div>` : ''}</div></div></div>`;
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
  t.style.cssText = `position:fixed;left:50%;bottom:28px;transform:translateX(-50%);background:${bad ? 'var(--bad,#B03A2E)' : 'var(--ink,#111)'};color:#fff;padding:9px 16px;border-radius:99px;font:600 13px var(--sans,system-ui);z-index:90;box-shadow:0 6px 20px rgba(0,0,0,.2)`;
  document.body.appendChild(t); setTimeout(() => t.remove(), 2200);
}

/* ---------- data ---------- */
async function load(act) { S.data = await api('/api/season?act=' + encodeURIComponent(act)); return S.data; }
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
    <div class="r"><b>${over ? 'Overdue · ' : ''}${esc(t.due ? fmtDow(t.due) : 'no date')}</b>${esc(t.owner || '')}</div>
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
    ${wk.lives.length ? `<div class="tiny" style="margin-bottom:6px">Goes live: ${esc(wk.lives.join(' · '))}</div>` : ''}
    ${wk.items.map(r => taskRow(r.t, r.a, today, showBrand)).join('') || '<div class="tiny">Nothing scheduled.</div>'}
  </div>`;
}

/* ---------- the desk ---------- */
function deskDates(brands, today) {
  const set = new Set([today, ...DESK_DAYS]);
  brands.forEach(a => (a.checkins || []).forEach(c => set.add(c.date)));
  return [...set].sort();
}
function deskCard(a, date, today) {
  const live = S.live[a.act_id];
  const isToday = date === today;
  const lad = live && !live.error ? ladderOf(a.goals, live.last3?.mer, live.last3?.spend) : null;
  const liveErr = e => /400|unknown|no shop|tw_shop/i.test(e) ? 'No Triple Whale store connected for this brand yet (Settings > Brands).' : e;
  const liveHtml = !isToday ? `<span>Live numbers show on today only. The log below is what was done.</span>`
    : !live ? `<span>Loading live numbers…</span>`
    : live.error ? `<span style="color:var(--se-muted)">${esc(liveErr(live.error))}</span>`
    : `<span>Last 3 hours <b>${x2(live.last3?.mer)}</b> on ${money(live.last3?.spend)}</span><span>Today so far <b>${x2(live.today?.mer)}</b> · ${money(live.today?.sales)} revenue · ${money(live.today?.spend)} spend</span><span>as of ${esc(clock(live.as_of))}</span>`;
  const verdict = isToday && lad ? `<span class="pill ${lad.cls}" title="Breakeven ${a.goals.be ?? '?'} · target ${a.goals.target ?? '?'} · 50% at ${a.goals.s50 ?? '?'} · 100% at ${a.goals.s100 ?? '?'}">${esc(lad.text)}</span>` : (isToday && !ladderDone(a.goals) ? `<span class="pill unk">Set the ladder on the brand page</span>` : '');
  const slots = SLOTS.map(([key, label]) => {
    const c = (a.checkins || []).find(x => x.date === date && x.slot === key);
    const saved = c && c.action;
    return `<div class="se-slot" data-act="${esc(a.act_id)}" data-slot="${key}">
      <div class="s">${label}</div>
      ${saved ? `<div class="did">${esc(c.action)}<small>${c.roas != null ? `3h ${x2(c.roas)} · ` : ''}${c.verdict ? `ladder said ${esc(c.verdict)} · ` : ''}${esc(c.by || '')} ${esc(clock(c.at))}</small></div><div><button class="btn se-mini" data-redo="1">Change</button></div>`
        : `<input class="se-in" placeholder="What you did, one line (e.g. Scaled 100%, new budget $8k)"><div><button class="btn primary se-mini" data-save="1">Save</button></div>`}
    </div>`;
  }).join('');
  return `<div class="se-desk"><div class="h"><b data-pick="${esc(a.act_id)}">${esc(a.name)}</b>${verdict}<div class="live">${liveHtml}</div></div>${slots}</div>`;
}
function wireDesk(root, date, today) {
  root.querySelectorAll('.se-slot [data-save]').forEach(b => b.onclick = async () => {
    const row = b.closest('.se-slot'); const inp = row.querySelector('input'); const act = row.dataset.act; const slot = row.dataset.slot;
    const text = inp.value.trim(); if (!text) return toast('Write what you did first', true);
    const a = brandOf(act); const live = S.live[act]; const lad = live && !live.error ? ladderOf(a.goals, live.last3?.mer, live.last3?.spend) : null;
    try {
      const r = await put('/api/season/checkin', { act, date, slot, action: text, roas: live?.last3?.mer ?? null, mer_day: live?.today?.mer ?? null, revenue: live?.today?.sales ?? null, spend: live?.today?.spend ?? null, verdict: lad?.ok ? lad.text : null });
      a.checkins = (a.checkins || []).filter(c => !(c.date === date && c.slot === slot)).concat([{ date, slot, action: text, roas: live?.last3?.mer ?? null, verdict: lad?.ok ? lad.text : null, by: r.by, at: r.at }]);
      const host = root.querySelector(`.se-desk [data-pick="${act}"]`)?.closest('.se-desk');
      if (host) { host.outerHTML = deskCard(a, date, today); wireDesk(root, date, today); }
    } catch (e) { toast(e.message, true); }
  });
  root.querySelectorAll('.se-slot input.se-in').forEach(i => i.onkeydown = e => { if (e.key === 'Enter') i.closest('.se-slot').querySelector('[data-save]')?.click(); });
  root.querySelectorAll('.se-slot [data-redo]').forEach(b => b.onclick = () => {
    const row = b.closest('.se-slot'); const a = brandOf(row.dataset.act); const c = (a.checkins || []).find(x => x.date === date && x.slot === row.dataset.slot);
    row.innerHTML = `<div class="s">${esc(SLOTS.find(s => s[0] === row.dataset.slot)[1])}</div><input class="se-in" value="${esc(c?.action || '')}"><div><button class="btn primary se-mini" data-save="1">Save</button></div>`;
    wireDesk(root, date, today);
  });
  root.querySelectorAll('.se-desk [data-pick]').forEach(el => el.onclick = () => S.pick && S.pick(el.dataset.pick));
}
async function loadLive(brands, after) {
  await Promise.all(brands.map(async a => {
    try { S.live[a.act_id] = await api('/api/season/live?act=' + encodeURIComponent(a.act_id)); }
    catch (e) { S.live[a.act_id] = { error: e.message || 'no live numbers' }; }
  }));
  after();
}
function deskSection(brands, today, title) {
  const dates = deskDates(brands, today);
  if (!S.deskDate || !dates.includes(S.deskDate)) S.deskDate = today;
  const date = S.deskDate;
  return `<div class="card se-desk-wrap"><h3 style="margin:0 0 4px">${esc(title)}</h3>
    <p class="hint" style="margin:0 0 10px">Three check-ins a day, 8am, 4pm and midnight Central. The ladder grades the last three hours of blended MER (Triple Whale) against this brand's lines. Whoever acts writes one line. The client link shows the lines, never the numbers.</p>
    <div class="se-days">${dates.map(d => `<button data-day="${d}" class="${d === date ? 'on' : ''}">${d === today ? 'Today · ' : ''}${esc(fmtDow(d))}</button>`).join('')}</div>
    <div id="seDesk">${brands.map(a => deskCard(a, date, today)).join('')}</div></div>`;
}
function wireDeskSection(root, brands, today, repaint) {
  root.querySelectorAll('.se-days button').forEach(b => b.onclick = () => { S.deskDate = b.dataset.day; repaint(); });
  const host = root.querySelector('#seDesk');
  if (!host) return;
  wireDesk(host, S.deskDate, today);
  if (S.deskDate === today) {
    const missing = brands.filter(a => !S.live[a.act_id]);
    if (missing.length) loadLive(missing, () => { const h = root.querySelector('#seDesk'); if (!h) return; h.innerHTML = brands.map(a => deskCard(a, S.deskDate, today)).join(''); wireDesk(h, S.deskDate, today); });
  }
}

/* ---------- swipe file (Atria boards), in a modal ---------- */
async function showSwipe(board, title) {
  const body = panelModal(title, `<p class="hint" style="margin:0">Loading from Atria…</p>`);
  try {
    const r = await api('/api/atria/board?board_id=' + encodeURIComponent(board.id), {}, AH);
    if (r.reason === 'not_connected') { body.innerHTML = `<p class="hint" style="margin:0">Atria is not connected. Studio > Connections > Connect Atria, then this fills itself.</p>`; return; }
    const ads = r.ads || [];
    body.innerHTML = `<p class="hint" style="margin:0 0 12px">${ads.length} ad${ads.length === 1 ? '' : 's'} saved in Atria under <b>${esc(board.name)}</b>. Save more into that board in Atria and they show here. Click one to open it in Atria.</p>
      ${ads.length ? `<div class="se-ads">${ads.map(a => `<a class="se-ad" href="${esc(a.url)}" target="_blank" rel="noopener">${a.img ? `<img src="${esc(a.img)}" alt="" referrerpolicy="no-referrer">` : `<div style="aspect-ratio:4/5;display:grid;place-items:center;padding:12px;text-align:center;font:600 13px/1.3 var(--sans,system-ui);color:var(--se-muted)">${esc(a.advertiser || 'Open in Atria')}<br><span style="font-weight:400;font-size:11px">${a.format === 'video' ? 'video, no still' : 'no preview'}</span></div>`}<div class="c"><b>${esc(a.advertiser || '')}</b>${esc((a.title || a.body || '').slice(0, 70))}${a.format === 'video' ? ' · video' : ''}</div></a>`).join('')}</div>` : '<p class="hint" style="margin:0">Nothing saved to this board yet.</p>'}`;
  } catch (e) { body.innerHTML = `<p class="hint" style="margin:0;color:var(--bad)">${esc(e.message)}</p>`; }
}

/* ---------- ALL CLIENTS ---------- */
function crumb() { return typeof window.crumbFor === 'function' ? `<div class="ph-crumb">${window.crumbFor('season')}</div>` : ''; }
function head(title, sub) { return `<div>${crumb()}<h2>${title}</h2><p class="sub">${sub}</p></div>`; }

function offerCard(a, today) {
  const st = brandState(a);
  const bf = keyPhase(a, 'bf'), access = keyPhase(a, 'access'), early = keyPhase(a, 'early');
  const rest = a.phases.filter(p => (p.grp === 'dec' || p.grp === 'late' || p.grp === 'vday') && p.status !== 'skip' && !(p.status === 'missing' && p.grp !== 'dec'));
  const deal = (p, big) => !p ? '' : p.status === 'skip' ? `<div class="deal small" style="color:var(--se-muted);font-weight:400">Not running</div>`
    : p.offer ? `<div class="deal ${big ? '' : 'small'}">${esc(p.offer)}</div>` : `<div class="deal none">No offer written yet</div>`;
  const line = p => p ? `<div class="sub">${esc(fmtRange(p.start, p.end))}${p.who ? ` · ${esc(p.who)}` : ''}</div>` : '';
  const c = counts(a, today);
  return `<div class="se-off" data-pick="${esc(a.act_id)}">
    <div class="who"><b>${esc(a.name)}</b><span class="pill ${st[0] === 'ok' ? 'good' : st[0] === 'warn' ? 'warn' : 'bad'}" style="align-self:flex-start">${esc(st[1])}</span>
      <span class="m">${esc(goalLine(a.goals || {}))}<br>${esc(a.answers.strategist || 'Ahsan')} briefs · ${esc(a.answers.approver || 'client')} approves${c.over ? `<br><b style="color:var(--bad)">${c.over} overdue</b>` : ''}${c.week ? `<br>${c.week} due this week` : ''}</span></div>
    <div class="body">
      <div class="col"><div class="lab">Black Friday weekend ${bf ? pill(bf.status) : ''}</div>${deal(bf, true)}${line(bf)}${access && access.status !== 'skip' && (access.offer || access.status !== 'missing') ? `<div class="sub" style="margin-top:8px"><b>Thursday first:</b> ${esc(access.offer || 'early access, details to come')} <span class="tiny">(${esc(access.who || 'list')})</span></div>` : ''}
        <div class="lab" style="margin-top:12px">November ${early ? pill(early.status) : ''}</div>${early ? `<div class="sub" style="margin:0 0 2px;font-weight:600;color:var(--ink)">${esc(early.name)}</div>` : ''}${deal(early, false)}${line(early)}</div>
      <div class="col"><div class="lab">After the weekend</div>${rest.length ? rest.map(p => `<div class="sub mini"><b style="color:var(--ink)">${esc(p.name)}</b> ${pill(p.status)}<br>${p.offer ? esc(p.offer) : '<i>no offer yet</i>'} <span class="tiny">· ${esc(fmtRange(p.start, p.end))}</span></div>`).join('') : '<div class="deal none">Nothing planned</div>'}</div>
      <div class="bar">${miniBar(a, today)}</div>
    </div>
  </div>`;
}

async function renderAll() {
  const main = $('#main');
  main.innerHTML = `<div class="se"><div class="card"><span class="hint">Loading…</span></div></div>`;
  await load('all');
  S.view = localStorage.getItem(LS_VIEW) || 'offers';
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
  const openAll = brands.flatMap(a => a.tasks.filter(t => !t.done && t.due).map(t => ({ t, a })));
  const overdue = openAll.filter(r => r.t.due < today);
  const thisWeek = openAll.filter(r => r.t.due >= wk0 && r.t.due <= wk1);
  const drafts = brands.filter(a => brandState(a)[0] === 'warn');
  const verdict = noOffer.length || drafts.length
    ? `${lockedN} of ${brands.length} brands locked. ${drafts.length ? `${drafts.map(a => a.name).join(', ')} ${drafts.length === 1 ? 'has' : 'have'} a proposal waiting on the client. ` : ''}${noOffer.length ? `${noOffer.map(a => a.name).join(', ')} ${noOffer.length === 1 ? 'has' : 'have'} nothing written yet. ` : ''}${thisWeek.length} thing${thisWeek.length === 1 ? '' : 's'} due this week${overdue.length ? `, ${overdue.length} overdue` : ''}.`
    : `Every brand is locked. ${thisWeek.length} thing${thisWeek.length === 1 ? '' : 's'} due this week${overdue.length ? `, ${overdue.length} overdue` : ''}.`;

  const strip = `<div class="se-strip">
    <div class="ru"><div class="ru-l">Black Friday</div><div class="ru-v">${days} days</div><div class="ru-d">Fri Nov 27. Cyber Monday Nov 30.</div></div>
    <div class="ru"><div class="ru-l">Offers locked</div><div class="ru-v ${lockedN === brands.length ? 'good' : lockedN ? 'warn' : 'bad'}">${lockedN} of ${brands.length}</div><div class="ru-d">Black Friday weekend agreed with the client.</div></div>
    <div class="ru"><div class="ru-l">Goals set</div><div class="ru-v ${noGoal.length ? 'warn' : 'good'}">${brands.length - noGoal.length} of ${brands.length}</div><div class="ru-d">${noGoal.length ? 'Missing: ' + esc(noGoal.map(a => a.name).join(', ')) : 'Every brand has a revenue goal.'}</div></div>
    <div class="ru"><div class="ru-l">Due this week</div><div class="ru-v">${thisWeek.length}</div><div class="ru-d">Mon ${fmtD(wk0)} to Sun ${fmtD(wk1)}, every brand.</div></div>
    <div class="ru"><div class="ru-l">Overdue</div><div class="ru-v ${overdue.length ? 'bad' : 'good'}">${overdue.length}</div><div class="ru-d">${overdue.length ? 'Past due and not ticked.' : 'Nothing slipping.'}</div></div>
  </div>`;

  const seg = `<div class="se-seg" role="tablist"><button data-v="offers" class="${S.view === 'offers' ? 'on' : ''}">The offers</button><button data-v="now" class="${S.view === 'now' ? 'on' : ''}">This week<b>${thisWeek.length + overdue.length || ''}</b></button><button data-v="cal" class="${S.view === 'cal' ? 'on' : ''}">Week by week</button><button data-v="desk" class="${S.view === 'desk' ? 'on' : ''}">Desk</button></div>`;

  let body = '';
  if (S.view === 'offers') {
    const order = brands.slice().sort((x, y) => ['bad', 'warn', 'ok'].indexOf(brandState(x)[0]) - ['bad', 'warn', 'ok'].indexOf(brandState(y)[0]) || x.name.localeCompare(y.name));
    body += order.map(a => offerCard(a, today)).join('');
    if (off.length) body += `<p class="tiny" style="margin:4px 0 0">Not running a season: ${esc(off.map(a => a.name).join(', '))}. Open the brand and switch it on if that changes.</p>`;
  } else if (S.view === 'now') {
    const group = (rows) => { const by = {}; rows.forEach(r => (by[r.a.act_id] = by[r.a.act_id] || { a: r.a, rows: [] }).rows.push(r)); return Object.values(by).sort((x, y) => x.a.name.localeCompare(y.a.name)); };
    const list = (rows) => group(rows).map(g => `<div class="se-when">${esc(g.a.name)}</div>${g.rows.map(r => taskRow(r.t, r.a, today, false)).join('')}`).join('');
    body += `<div class="card se-key"><h3 style="margin:0 0 4px">This week</h3><p class="hint" style="margin:0 0 8px">Tick it when it is done. Overdue first. Click a brand name to open its season.</p>
      ${overdue.length ? `<div class="se-when" style="color:var(--bad)">Overdue</div>${overdue.sort((x, y) => x.t.due.localeCompare(y.t.due)).map(r => taskRow(r.t, r.a, today, true)).join('')}` : ''}
      ${thisWeek.length ? list(thisWeek.sort((x, y) => x.t.due.localeCompare(y.t.due))) : '<p class="hint" style="margin:8px 0 0">Nothing due this week.</p>'}
    </div>`;
    body += `<div class="card"><h3 style="margin:0 0 4px">Status board</h3><p class="hint" style="margin:0 0 10px">Where each brand stands, one column per part of the season. Click a row to open it.</p>
      <div class="tbl-wrap" style="overflow-x:auto"><table class="se-board"><colgroup><col class="c-brand"><col><col><col><col><col class="c-need"></colgroup><thead><tr><th>Brand</th><th>November</th><th>Thursday</th><th>Black Friday</th><th>December</th><th>Needed</th></tr></thead><tbody>
      ${brands.map(a => {
        const st = brandState(a); const c = counts(a, today);
        const cell = (p) => p ? `<div class="cell">${pill(p.status)}<small>${esc(fmtRange(p.start, p.end))}</small></div>` : '<span class="tiny">none</span>';
        const grpCell = (g) => { const ps = a.phases.filter(p => p.grp === g && p.key !== 'access' && !(g === 'bf' && p.key === 'planb')); if (!ps.length) return '<span class="tiny">none</span>'; const m = ps.find(p => p.key === 'bf') || ps[0]; return `<div class="cell">${pill(m.status)}<small>${esc(fmtRange(m.start, m.end))}${ps.length > 1 ? ` · ${ps.length - 1} more` : ''}</small></div>`; };
        return `<tr class="rowlink" data-pick="${esc(a.act_id)}"><td class="bn">${esc(a.name)}<br><span class="pill ${st[0] === 'ok' ? 'good' : st[0] === 'warn' ? 'warn' : 'bad'}">${st[1]}</span></td>
          <td>${grpCell('nov')}</td><td>${cell(keyPhase(a, 'access'))}</td><td>${cell(keyPhase(a, 'bf'))}</td><td>${grpCell('dec')}</td>
          <td><small style="display:block;color:var(--se-muted);font-size:12px;line-height:1.4">${c.over ? `<b style="color:var(--bad)">${c.over} overdue</b><br>` : ''}${a.goals.bf == null && a.goals.total == null ? `<b style="color:var(--warn)">no goal</b><br>` : ''}${!ladderDone(a.goals) ? `no ladder<br>` : ''}${c.week} due this week</small></td></tr>`;
      }).join('')}</tbody></table></div></div>`;
  } else if (S.view === 'cal') {
    const wks = weeksOf(brands, today);
    body += `<div class="card"><h3 style="margin:0 0 4px">Week by week, every brand</h3><p class="hint" style="margin:0 0 12px">Each box is a week. The green one is now. Dates come from each brand's phase dates: briefs 23 days before a launch, built 9 days before, loaded 4 days before.</p>
      <div class="se-weeks">${wks.map(w => weekBox(w, today, true)).join('')}</div></div>`;
  } else {
    body += deskSection(brands, today, 'The desk: every brand, three times a day');
  }

  main.innerHTML = `<div class="se">${head('Season', 'What every brand is offering from Black Friday to Valentine\'s, when it runs, what is due this week, and over the weekend what the ladder says. Click a brand to open it.')}
    ${strip}<p class="se-verdict">${esc(verdict)}</p>${seg}${body}</div>`;
  main.querySelectorAll('.se-seg button').forEach(b => b.onclick = () => { S.view = b.dataset.v; localStorage.setItem(LS_VIEW, S.view); paintAll(); window.scrollTo(0, 0); });
  main.querySelectorAll('.se-off, tr.rowlink').forEach(el => el.onclick = e => { if (e.target.closest('a,button,input')) return; S.pick && S.pick(el.dataset.pick); });
  wireTasks(main); wireTips(main);
  if (S.view === 'desk') wireDeskSection(main, brands, today, paintAll);
  if (typeof window.pageActions === 'function') window.pageActions('');
}

/* ---------- ONE BRAND ---------- */
async function refresh() { await load(S.act); paintBrand(); }
async function renderBrand() {
  const main = $('#main');
  main.innerHTML = `<div class="se"><div class="card"><span class="hint">Loading…</span></div></div>`;
  await load(S.act);
  S.btab = localStorage.getItem(LS_BTAB) || 'offers';
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
const GOAL_FIELDS = [
  ['early', 'November revenue goal', 'money'], ['bf', 'Black Friday weekend goal', 'money'], ['dec', 'December goal', 'money'], ['total', 'Nov + Dec total', 'money'],
  ['be', 'Breakeven MER', 'x'], ['target', 'Target MER', 'x'], ['s50', 'Scale 50% at', 'x'], ['s100', 'Scale 100% at', 'x'], ['start', 'Starting daily budget', 'money'], ['cap', 'Meta daily limit', 'money'],
];
/* The plan as sentences a new person can read in 20 seconds. */
function planLines(a) {
  return a.phases.filter(p => p.status !== 'skip' && p.start).map(p => {
    const when = p.end && p.end !== p.start ? `${fmtD(p.start)} to ${fmtD(p.end)}` : fmtDow(p.start);
    const who = p.who && !/^everyone$/i.test(p.who) ? ` For ${p.who.charAt(0).toLowerCase() + p.who.slice(1)}.` : '';
    const offer = p.offer ? p.offer.replace(/\.?$/, '.') : 'Offer not decided yet.';
    return { p, when, text: `<b>${esc(p.name)}.</b> ${esc(offer)}${esc(who)}${p.status === 'draft' ? ' <span class="pill warn">proposal</span>' : ''}${p.status === 'missing' ? ' <span class="pill bad">missing</span>' : ''}` };
  });
}
function paintBrand() {
  const main = $('#main');
  const d = S.data; const a = d.accounts[0];
  if (!a) { main.innerHTML = `<div class="se">${head('Season', '')}<div class="card">This client is not in Locus.</div></div>`; return; }
  const today = d.today; const days = daysBetween(today, d.bf);
  const st = brandState(a); const c = counts(a, today);
  const open = a.tasks.filter(t => !t.done && t.due);
  const overdue = open.filter(t => t.due < today);
  const g = a.goals || {};

  const need = [];
  for (const p of a.phases) if (p.status === 'missing' && !p.optional) need.push([`${p.name}: no offer written`, fmtRange(p.start, p.end)]);
  const drafts = a.phases.filter(p => p.status === 'draft');
  if (drafts.length === 1) need.push([`${drafts[0].name}: lock it with ${a.answers.approver || 'the client'}`, fmtRange(drafts[0].start, drafts[0].end)]);
  else if (drafts.length > 1) need.push([`${drafts.length} phases are proposals, not agreed: lock them with ${a.answers.approver || 'the client'}`, drafts.map(p => p.name).join(', ')]);
  if (g.bf == null && g.total == null) need.push(['A revenue goal for the weekend or the season', 'Goals tab']);
  if (!ladderDone(g)) need.push(['The ladder: breakeven, target, scale 50 and 100 lines', 'by Nov 13']);
  if (!a.answers.cutoffs) need.push(['Shipping cutoffs from the client', 'sets December']);
  if (!a.answers.gift_cards) need.push(['Gift cards: set up and tested?', 'by Dec 1']);

  const goalTile = g.bf != null ? [moneyK(g.bf), 'Black Friday weekend goal'] : g.total != null ? [moneyK(g.total), 'Season goal'] : ['none', 'No revenue goal yet'];
  const strip = `<div class="se-strip">
    <div class="ru"><div class="ru-l">Black Friday</div><div class="ru-v">${days} days</div><div class="ru-d">${esc(a.shape === 'access' ? 'Early Access shape' : a.shape === 'blacknov' ? 'Black November shape' : 'Standard shape')}</div></div>
    <div class="ru"><div class="ru-l">Offer</div><div class="ru-v ${st[0] === 'ok' ? 'good' : st[0] === 'warn' ? 'warn' : 'bad'}">${esc(st[1])}</div><div class="ru-d">${c.locked} of ${c.counted} phases locked.</div></div>
    <div class="ru"><div class="ru-l">Goal</div><div class="ru-v ${goalTile[0] === 'none' ? 'warn' : ''}">${esc(goalTile[0])}</div><div class="ru-d">${esc(goalTile[1])}${ladderDone(g) ? ` · ladder set` : ' · ladder not set'}</div></div>
    <div class="ru"><div class="ru-l">Due this week</div><div class="ru-v">${c.week}</div><div class="ru-d">${esc(a.answers.strategist || 'Ahsan')} briefs, ${esc(a.answers.buyer || 'Ahsan')} loads.</div></div>
    <div class="ru"><div class="ru-l">Overdue</div><div class="ru-v ${overdue.length ? 'bad' : 'good'}">${overdue.length}</div><div class="ru-d">${overdue.length ? esc(overdue[0].name) : 'Nothing slipping.'}</div></div>
  </div>`;

  /* The plan in one read */
  const lines = planLines(a);
  const plan = `<div class="card se-key"><div class="row" style="justify-content:space-between;margin-bottom:10px"><h3 style="margin:0">${esc(a.name)}: the plan in one read</h3><span class="tiny">${lines.length} parts · ${esc(goalLine(g))}</span></div>
    <div class="se-plan">
      <ol>${lines.map((l, i) => `<li class="${l.p.key === 'bf' ? 'bf' : ''}"><i>${i + 1}</i><div><div class="d">${esc(l.when)}</div><div>${l.text}</div></div></li>`).join('')}</ol>
      <div class="se-why ${a.answers.strategy_note ? '' : 'none'}"><div class="lab"><span>Why this offer, and the risk</span><button class="se-link se-mini" data-edit-answer="strategy_note">Edit</button></div>${esc(a.answers.strategy_note || 'Nobody has written why this is the plan. Two or three short paragraphs: what worked before, what the client wants, where the risk is.')}</div>
    </div></div>`;

  /* Timeline */
  const timeline = `<div class="card"><div class="row" style="justify-content:space-between;margin-bottom:4px"><h3 style="margin:0">The season</h3><span class="tiny">Solid = locked · striped = proposal · outline = nothing written. Hover a bar for the deal.</span></div>${gantt(a.phases, today)}</div>`;

  /* Tabs */
  const tabs = [['offers', 'Offers'], ['goals', 'Goals and results'], ['desk', 'Desk'], ['todo', `To-do`], ['sheet', 'Call sheet']];
  const seg = `<div class="se-seg" role="tablist">${tabs.map(([k, l]) => `<button data-b="${k}" class="${S.btab === k ? 'on' : ''}">${l}${k === 'todo' && open.length ? `<b>${open.length}</b>` : ''}${k === 'offers' && need.length ? `<b style="color:var(--warn)">${need.length}</b>` : ''}</button>`).join('')}</div>`;

  let body = '';
  if (S.btab === 'offers') {
    const resLine = p => {
      if (!p.results) return '';
      const r = p.results; const goal = r.goal;
      const vs = goal ? ` · ${Math.round(r.sales / goal * 100)}% of the ${moneyK(goal)} goal` : '';
      return `<div class="res"><b>${money(r.sales)}</b> revenue so far on ${money(r.spend)} spend${r.mer != null ? ` · ${x2(r.mer)}` : ''}${r.orders ? ` · ${Math.round(r.orders)} orders` : ''}${vs}<br><span class="tiny">${esc(fmtD(r.from))} to ${esc(fmtD(r.to))}, same revenue line as P&L.</span></div>`;
    };
    const live = a.phases.filter(p => p.status !== 'skip');
    const skipped = a.phases.filter(p => p.status === 'skip');
    body += need.length ? `<div class="card" style="border-left:4px solid var(--warn)"><h3 style="margin:0 0 6px">Still needed</h3><div class="se-need">${need.map(n => `<div><span>${esc(n[0])}</span><span>${esc(n[1])}</span></div>`).join('')}</div></div>` : `<div class="card" style="border-left:4px solid var(--good)"><b>Nothing missing.</b> Every phase has an offer, the goal and ladder are set, and the dates that drive December are in.</div>`;
    body += `<div class="row" style="justify-content:space-between;margin-bottom:8px"><h3 style="margin:0">Each offer, in order</h3><div style="display:flex;gap:8px">${a.swipe_brand ? `<button class="btn se-mini" id="seBrandSwipe">This brand's swipe file</button>` : ''}<button class="btn se-mini" id="seAddPhase">+ Add a phase</button></div></div>`;
    body += live.map((p, i) => `<div class="se-deal ${p.key === 'bf' ? 'key' : ''}" style="--c:${GRP[p.grp]?.[1] || 'var(--se-bf)'}">
      <div class="n"><span class="num">${i + 1}</span><div><div class="nm">${esc(p.name)}</div><div class="dt">${esc(fmtRange(p.start, p.end))}${p.who ? `<br>${esc(p.who)}` : ''}</div></div></div>
      <div><div style="display:flex;gap:8px;align-items:center;margin-bottom:4px">${pill(p.status)}${p.goal_key && g[p.goal_key] != null ? `<span class="tiny">goal ${moneyK(g[p.goal_key])}</span>` : ''}</div>
        <div class="big ${p.offer ? '' : 'none'}">${esc(p.offer || (p.hint || 'No offer written yet.'))}</div>${p.detail ? `<div class="x">${esc(p.detail)}</div>` : ''}${resLine(p)}</div>
      <div class="act"><button class="btn primary se-mini" data-edit-phase="${esc(p.key)}">Edit</button>${p.swipe ? `<button class="btn se-mini" data-swipe="${esc(p.key)}">Swipe file</button>` : ''}</div>
    </div>`).join('');
    if (skipped.length) body += `<p class="tiny" style="margin:4px 0 12px">Not running: ${skipped.map(p => `${esc(p.name)} <button class="se-link se-mini" data-edit-phase="${esc(p.key)}">edit</button>`).join(' · ')}</p>`;
  } else if (S.btab === 'goals') {
    const started = a.phases.filter(p => p.results);
    body += `<div class="card"><div class="row" style="justify-content:space-between;margin-bottom:8px"><h3 style="margin:0">Goals and the ladder</h3><button class="btn primary se-mini" id="seGoals">Edit</button></div>
      <p class="hint" style="margin:0 0 12px">The revenue goals each phase is graded against, and the MER lines the desk uses: at or above the 100% line we double, above the 50% line we add half, at target we hold, under target we pull back, under breakeven we rework.</p>
      <div class="se-goals">${GOAL_FIELDS.slice(0, 4).map(([k, l]) => `<div class="se-g"><div class="l">${esc(l)}</div><div class="v ${g[k] == null ? 'none' : ''}">${g[k] == null ? 'not set' : moneyK(g[k])}</div></div>`).join('')}</div>
      <div class="se-ladder">${[['be', 'Breakeven'], ['target', 'Target'], ['s50', 'Scale 50% at'], ['s100', 'Scale 100% at']].map(([k, l]) => `<span>${l}: <b>${g[k] == null ? 'not set' : x2(g[k])}</b></span>`).join('')}<span>Start: <b>${g.start == null ? 'not set' : money(g.start)}/day</b></span><span>Meta cap: <b>${g.cap == null ? 'not set' : money(g.cap)}/day</b></span>${g.start && g.cap ? `<span>Headroom <b>${(g.cap / g.start).toFixed(1)}x</b>${g.cap / g.start < 4 ? ' (tight: ask Meta for a higher limit)' : ''}</span>` : ''}</div>
      ${g.note ? `<p class="tiny" style="margin:8px 0 0">${esc(g.note)}</p>` : ''}</div>`;
    body += `<div class="card"><h3 style="margin:0 0 4px">Results so far</h3><p class="hint" style="margin:0 0 10px">Every phase that has started, same revenue line as P&L, through yesterday.</p>
      ${started.length ? `<div class="tbl-wrap" style="overflow-x:auto"><table class="se-res-tbl"><thead><tr><th>Phase</th><th>Days</th><th class="num">Revenue</th><th class="num">Spend</th><th class="num">MER</th><th class="num">Orders</th><th class="num">Goal</th></tr></thead><tbody>
        ${started.map(p => `<tr><td><b>${esc(p.name)}</b><br><span class="tiny">${esc(fmtD(p.results.from))} to ${esc(fmtD(p.results.to))}</span></td><td>${p.results.days}</td><td class="num">${money(p.results.sales)}</td><td class="num">${money(p.results.spend)}</td><td class="num">${x2(p.results.mer)}</td><td class="num">${p.results.orders ? Math.round(p.results.orders) : '-'}</td><td class="num">${p.results.goal ? `${Math.round(p.results.sales / p.results.goal * 100)}% of ${moneyK(p.results.goal)}` : '-'}</td></tr>`).join('')}</tbody></table></div>` : '<p class="hint" style="margin:0">Nothing has started yet. The first phase opens ' + esc(fmtDow((a.phases.filter(p => p.start && p.status !== 'skip').sort((x, y) => x.start.localeCompare(y.start))[0] || {}).start)) + '.</p>'}</div>`;
  } else if (S.btab === 'desk') {
    body += deskSection([a], today, 'The desk');
  } else if (S.btab === 'todo') {
    const wks = weeksOf([a], today).filter(w => w.items.length || w.lives.length);
    const upcoming = wks.filter(w => !w.past), past = wks.filter(w => w.past);
    body += `<div class="card"><div class="row" style="justify-content:space-between;margin-bottom:8px"><h3 style="margin:0">What is due, week by week</h3><button class="btn se-mini" id="seAddTask">+ Add a task</button></div>
      <p class="hint" style="margin:0 0 12px">Briefs, built, loaded and live dates follow each phase's start date. Tick when done; the tick is shared with everyone.</p>
      <div class="se-weeks">${upcoming.map(w => weekBox(w, today, false)).join('') || '<div class="tiny">No dated phases yet.</div>'}</div>
      ${past.length ? `<details style="margin-top:12px"><summary class="tiny" style="cursor:pointer">Past weeks (${past.length})</summary><div class="se-weeks" style="margin-top:10px">${past.map(w => weekBox(w, today, false)).join('')}</div></details>` : ''}</div>`;
  } else {
    const sheetRows = SHEET.map(([k, label, hint]) => `<div class="k">${esc(label)}</div><div class="v ${a.answers[k] ? '' : 'none'}">${esc(a.answers[k] || hint)}</div><div class="e"><button class="btn se-mini" data-edit-answer="${k}">Edit</button></div>`).join('');
    const setupRows = SETUP.map(([k, label, type, opts]) => `<div class="k">${esc(label)}</div><div class="v ${a.answers[k] ? '' : 'none'}">${esc(type === 'select' ? (opts.find(o => o[0] === a.shape)?.[1] || '') : (a.answers[k] || (k === 'email_owner' ? 'Nick' : 'Ahsan')))}</div><div class="e"><button class="btn se-mini" data-edit-answer="${k}">Edit</button></div>`).join('');
    body += `<div class="card"><h3 style="margin:0 0 4px">Call sheet and who does what</h3><p class="hint" style="margin:0 0 12px">The answers that set the dates and the offer, and who briefs, buys and emails for this brand.</p>
      <div class="se-kv">${sheetRows}<div class="sep"></div>${setupRows}</div></div>
      <p class="tiny"><button class="se-link" id="seToggleSeason">${a.in_season ? 'This brand is not running a season this year' : 'Put this brand back on the season board'}</button></p>`;
  }

  main.innerHTML = `<div class="se">${head(`${esc(a.name)}: the season`, 'The plan in one read, the season on one timeline, then the offers, goals, desk, to-dos and call sheet as tabs. Click Edit on anything.')}
    ${strip}${plan}${timeline}${seg}${body}</div>`;

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
  const ap = document.getElementById('seAddPhase'); if (ap) ap.onclick = () => editPhase(a, null);
  const at = document.getElementById('seAddTask'); if (at) at.onclick = () => editTask(a.act_id, null);
  const eg = document.getElementById('seGoals'); if (eg) eg.onclick = () => editGoals(a);
  main.querySelectorAll('[data-edit-answer]').forEach(b => b.onclick = () => editAnswer(a, b.dataset.editAnswer));
  const tg = document.getElementById('seToggleSeason'); if (tg) tg.onclick = async () => {
    const ok = typeof window.confirmModal === 'function' ? await window.confirmModal(a.in_season ? 'Take this brand off the season board?' : 'Put this brand on the season board?', a.in_season ? 'It disappears from All clients and the calendar. Nothing is deleted.' : 'It shows on the board again with everything it had.', a.in_season ? 'Take it off' : 'Put it on') : true;
    if (!ok) return;
    try { await put('/api/season/answer', { act: a.act_id, key: 'in_season', value: a.in_season ? 'no' : 'yes' }); await refresh(); } catch (e) { toast(e.message, true); }
  };
  wireTasks(main); wireTips(main);
  if (S.btab === 'desk') wireDeskSection(main, [a], today, paintBrand);
}
async function editGoals(a) {
  const g = a.goals || {};
  const r = await formModal({
    title: `${a.name}: goals and ladder`, hint: 'Money in dollars, lines as blended MER (revenue divided by ad spend, Triple Whale). Leave a box empty if it is not set.',
    fields: [
      ...GOAL_FIELDS.map(([k, l, t]) => ({ k, label: l, type: 'number', step: t === 'x' ? '0.01' : '1', value: g[k] ?? '', half: 1 })),
      { k: 'note', label: 'Where these came from', value: g.note || '', ph: 'e.g. Goals from the Aug 25 call; ladder from last year, confirm by Nov 13' },
    ], cta: 'Save',
  });
  if (!r) return;
  const out = {};
  for (const [k] of GOAL_FIELDS) out[k] = r[k] === '' ? null : +r[k];
  out.note = r.note;
  try { await put('/api/season/answer', { act: a.act_id, key: 'goals', value: out }); await refresh(); } catch (e) { toast(e.message, true); }
}
async function editPhase(a, key) {
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
  if (!r) return;
  try {
    if (r.__delete) await put('/api/season/phase', { act: a.act_id, key: p.key }, 'DELETE');
    else {
      if (!r.name) return toast('Give it a name', true);
      const k = p ? p.key : ('x' + Date.now().toString(36));
      await put('/api/season/phase', { act: a.act_id, key: k, name: r.name, start: r.start || null, end: r.end || null, who: r.who, offer: r.offer, detail: r.detail, status: r.status, grp: p ? p.grp : r.grp, sort: p ? p.sort : 500 });
    }
    await refresh();
  } catch (e) { toast(e.message, true); }
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
  main.innerHTML = `<div class="se se-share"><div class="card"><span class="hint">Loading…</span></div></div>`;
  let d;
  try {
    const res = await fetch(url.replace(/\/+$/, '') + '/api/season/' + token);
    d = await res.json();
    if (!res.ok) throw new Error(d.error || 'This link is no longer valid.');
  } catch (e) { main.innerHTML = `<div class="gate"><h1>Season plan unavailable</h1><p>${esc(e.message)}</p></div>`; return; }
  const t = $('.hd-title'); if (t) t.innerHTML = `${esc(d.account.name)} <em>Season 2026</em>`;
  const days = daysBetween(d.today, d.bf);
  const dates = Object.entries(d.dates || {});
  const DL = { cutoffs: 'Shipping cutoffs', returns: 'Return window', gift_cards: 'Gift cards' };
  const byDay = {};
  (d.checkins || []).forEach(c => (byDay[c.date] = byDay[c.date] || []).push(c));
  const fake = { name: d.account.name, phases: d.phases, answers: {} };
  const lines = planLines(fake);
  main.innerHTML = `<div class="se se-share">
    <h2>${esc(d.account.name)}: the season, start to finish</h2>
    <p class="sub">What runs when, who gets it, and what the deal is. ${days > 0 ? `${days} days to Black Friday (Fri Nov 27).` : ''} Anything marked proposal is still being decided together. Once a phase is live, its revenue so far shows on the card.</p>
    <div class="card"><h3 style="margin:0 0 10px">The plan in one read</h3><div class="se-plan" style="grid-template-columns:1fr"><ol>${lines.map((l, i) => `<li class="${l.p.key === 'bf' ? 'bf' : ''}"><i>${i + 1}</i><div><div class="d">${esc(l.when)}</div><div>${l.text}</div></div></li>`).join('')}</ol></div></div>
    <div class="card"><h3 style="margin:0 0 4px">The season</h3>${gantt(d.phases, d.today)}</div>
    ${d.phases.map((p, i) => `<div class="se-deal ${p.key === 'bf' ? 'key' : ''}" style="--c:${GRP[p.grp]?.[1] || 'var(--se-bf)'};grid-template-columns:230px 1fr">
      <div class="n"><span class="num">${i + 1}</span><div><div class="nm">${esc(p.name)}</div><div class="dt">${esc(fmtRange(p.start, p.end))}${p.who ? `<br>${esc(p.who)}` : ''}</div></div></div>
      <div>${p.status === 'locked' ? '' : `<div style="margin-bottom:4px">${pill(p.status)}</div>`}<div class="big ${p.offer ? '' : 'none'}">${esc(p.offer || 'Being decided.')}</div>${p.detail ? `<div class="x">${esc(p.detail)}</div>` : ''}
      ${p.results ? `<div class="res"><b>${money(p.results.sales)}</b> revenue so far${p.results.orders ? ` · ${Math.round(p.results.orders)} orders` : ''}<br><span class="tiny">${esc(fmtD(p.results.from))} to ${esc(fmtD(p.results.to))}</span></div>` : ''}</div></div>`).join('')}
    ${dates.length ? `<div class="card" style="margin-top:16px"><h3 style="margin:0 0 8px">Dates that matter</h3><div class="se-kv" style="grid-template-columns:170px 1fr">${dates.map(([k, v]) => `<div class="k">${esc(DL[k] || k)}</div><div class="v">${esc(v)}</div>`).join('')}</div></div>` : ''}
    ${Object.keys(byDay).length ? `<div class="card" style="margin-top:16px"><h3 style="margin:0 0 8px">What we did, check-in by check-in</h3>${Object.keys(byDay).sort().map(day => `<div class="se-when">${esc(fmtDow(day))}</div>${byDay[day].map(c => `<div class="se-slot" style="grid-template-columns:90px 1fr"><div class="s">${esc(SLOTS.find(s => s[0] === c.slot)?.[1] || c.slot)}</div><div class="did">${esc(c.action)}<small>${esc(c.by || 'Mobius')}</small></div></div>`).join('')}`).join('')}</div>` : ''}
    ${d.asks?.length ? `<div class="card" style="margin-top:16px"><h3 style="margin:0 0 8px">What we need from you</h3>${d.asks.map(x => `<div class="se-task"><span></span><div class="n">${esc(x.name)}<small>${esc(x.phase || '')}</small></div><div class="r"><b>${esc(x.due ? fmtDow(x.due) : '')}</b></div></div>`).join('')}</div>` : ''}
    <p class="tiny" style="margin-top:16px">Prepared by Mobius Digital. This page updates as the plan does.</p>
  </div>`;
  wireTips(main);
}

/* ---------- entry ---------- */
async function render({ tok, url, act, accounts, pick }) {
  Object.assign(S, { tok, url, act, accounts: accounts || [], pick });
  injectCss();
  if (act === 'all') return renderAll();
  return renderBrand();
}
window.SeasonTab = { render, renderShare };
})();

/* Business > This month: what the four tabs share (dates, the store read, plain states, layout rules).
   Not a page. Every number here is whole store: sales are store sales less tax, MER is sales over all ad spend.

   Read only routes these tabs use (profit worker unless said):
     /api/client?act&from&to                the store by day, totals, the month's goals, the plan so far, fixed costs
     /api/forecast?act                      where the month lands (Pace)
     /api/plan?act&month=YYYY-MM            the plan, what it rests on, the growth choices, past months (Plan)
     /api/overview?days=7&cmp=none&series=0 the cost check per brand
     the goal ROAS and goal cost            ctx.setting('brand:<id>.target_roas'), read from the account-health brand list
     /api/season?act                        dated phases, for the notes on the Pace chart */

import { h, button, empty, statusDot, addStyles, kpi, tiles, tipRow, staleStamp } from '../../kit.js';
import { refresh as reloadPage } from '../../router.js';

/* ---------- shared by every Business page (This month, Full funnel, Customers, Sales, agency Month and Money) ----------
   The batch 1 look: the top figures are tiles (kit tiles(), one card each, never a hero band), every figure says its
   window and its source, every chart says its window, and every chart bubble is a title plus label/value rows. */
export const TW = 'Triple Whale';
export const GA = 'Google Analytics';
/* One definition for orders over visits, the same words on Sales > By day: it says which visits each page counts */
export const VISITS_THAT_BUY = { name: 'Visits that buy', definition: 'Orders divided by site visits: the conversion rate. Full funnel counts visits with Google Analytics, Sales > By day with the Triple Whale pixel, so the two can differ a little.', formula: 'Orders / Visits' };
/** tileRow([kpi options], { cols, window, source, labels }) : the tile grid. window, source and the spark's dates
    (labels, one per spark point) are defaults each tile may override. size: 'lg' is dropped (a tile is --num-l). */
export function tileRow(list, { cols, window: win, source, labels } = {}) {
  const items = list.filter(Boolean);
  const n = cols || (items.length >= 4 ? 4 : items.length === 2 ? 2 : 3);
  return tiles(items.map(k => { const o = { window: win, source, sparkLabels: labels, ...k }; delete o.size; return kpi(o); }), { cols: n });
}
/** tipRows('Nov 4', [['Sales', '$1,204', 'lead'], ['Ad spend', '$410', 'slate']]) : a chart bubble, the batch 1 way. */
export function tipRows(title, rows) {
  return [h('div', { class: 'lx-tip-h' }, title), ...rows.filter(Boolean).map(r => tipRow(r[2] || '', r[0], r[1]))];
}
/** pageStamp(ctx, at): Home's "Updated 4 min ago" with the refresh button, once per page, for the right end of the
    help bar (pass it as an extra to helpBar). The page module says stamp: false so the head leaves its copy out.
    at is when the numbers were read when the data knows it; else when they landed (sample mode reads 4 min ago). */
export function pageStamp(ctx, at) {
  addStyles('mo-stamp', '.bz-bar>.lx-stale{margin-left:auto}.bz-bar>.lx-chip~.lx-stale{margin-left:0}');
  const when = ctx && ctx.sample ? Date.now() - 4 * 60e3 : (at || Date.now());
  return staleStamp({ at: when, onRefresh: async () => { reloadPage({ fresh: true }); await new Promise(r => setTimeout(r, 900)); } });
}
/** True on a phone width (the kit's 759px line). Read when a chart is built: on a phone a chart keeps fewer labels. */
export const isPhone = () => typeof matchMedia === 'function' && matchMedia('(max-width:759px)').matches;
/** Spark dates for a series that is not the tile's own window: every point named, the last one saying the step
    ("Jun" ... "Nov, by month"), so the low and high under the line are never read as the tile's dates. */
export function ownLabels(labels, step) {
  const l = (labels || []).slice();
  if (l.length && step) l[l.length - 1] = l[l.length - 1] + ', ' + step;
  return l;
}
/** A chart caption row: the quiet source line on the left, the legend on the right (Home's hm-chart-cap). */
export function chartCap(text, legendNode) {
  return h('div', { class: 'mo-cap' }, text ? h('span', { class: 'lx-srcline' }, text) : null, legendNode || null);
}

export const ok = n => n != null && isFinite(n);
export const asDate = str => new Date(str + 'T12:00:00');
export const iso = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
export const addDays = (str, n) => { const d = asDate(str); d.setDate(d.getDate() + n); return iso(d); };
export const dayLabel = str => asDate(str).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
export const weekday = str => asDate(str).toLocaleDateString('en-US', { weekday: 'short' });
export const monthName = ym => new Date(+ym.slice(0, 4), +ym.slice(5, 7) - 1, 1, 12).toLocaleDateString('en-US', { month: 'long' });
export const monthShort = ym => new Date(+ym.slice(0, 4), +ym.slice(5, 7) - 1, 1, 12).toLocaleDateString('en-US', { month: 'short' });
export const daysIn = ym => new Date(+ym.slice(0, 4), +ym.slice(5, 7), 0).getDate();
export const nextMonth = ym => { const d = new Date(+ym.slice(0, 4), +ym.slice(5, 7), 1, 12); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'); };
/** "Nov 1 to 7", "Oct 28 to Nov 3", "Nov 22" */
export function span(from, to) {
  if (from === to) return dayLabel(from);
  const a = asDate(from), b = asDate(to);
  return a.getMonth() === b.getMonth() ? `${dayLabel(from)} to ${b.getDate()}` : `${dayLabel(from)} to ${dayLabel(to)}`;
}
export const sum = (rows, key) => { let t = null; for (const r of rows) if (ok(r[key])) t = (t || 0) + r[key]; return t; };
export const b = v => h('b', null, v);

/** A call that may fail without taking the page down. A canceled load and a lost session still stop it. */
export const soft = p => p.catch(e => { if (e && (e.name === 'AbortError' || e.status === 401)) throw e; return null; });

/** The brand's goal ROAS and goal cost per new customer. They live on the account-health brand row, never in the
    profit overview (its account row has no goal keys). A client has no door to that list, so a client gets nulls
    and the page falls back to the month plan. */
export async function brandGoals(ctx) {
  if (!ctx.brand || ctx.isClient) return { roas: null, cpa: null };
  const k = 'brand:' + ctx.brand.id + '.';
  const [r, c] = await Promise.all([ctx.setting(k + 'target_roas', null), ctx.setting(k + 'target_cpa', null)]);
  return { roas: +r > 0 ? +r : null, cpa: +c > 0 ? +c : null };
}
/** What the tabs need to know about the brand: its goal ROAS (from brandGoals) and whether the cost numbers
    passed their check (the brand's row in the profit overview answer). */
export function brandFacts(ov, cl, goals) {
  const id = cl && cl.account && cl.account.act_id;
  const a = ((ov && (ov.accounts || ov.brands)) || []).find(r => r.act_id === id) || {};
  return { goalRoas: (goals && goals.roas) || null, costsBroken: !!(a.cost_health && a.cost_health.verdict === 'broken') };
}
/** True when the store has a sales source. Without one a page says so and never prints a zero. */
export const hasSource = cl => !!((cl.account && cl.account.tw_shop) || (cl.rows || []).some(r => r.sales > 0));

/** How a ratio reads against its goal. The same four steps as Home. Green, yellow or crimson only. */
export function grade(value, goal) {
  if (!ok(value) || !goal) return null;
  const r = value / goal;
  return r >= 1 ? ['good', 'At goal'] : r >= 0.8 ? ['warn', 'Close'] : r >= 0.6 ? ['warn', 'Under'] : ['bad', 'Far under'];
}
export const gradeDot = (value, goal) => { const g = grade(value, goal); return g ? statusDot(g[0], g[1]) : null; };

/* ---------- plain states ---------- */
export function pickBrand(what) {
  return empty({ title: 'Pick a brand', text: what + ' shows one brand at a time. Choose one from the switcher at the top.' });
}
export function noSource(ctx, what) {
  return empty({
    title: 'No sales source connected',
    text: ctx.isClient ? `This page fills in with ${what} once the store is connected.` : `Connect the store and this page fills in with ${what}.`,
    action: ctx.isClient ? null : button('Open integrations', { href: ctx.href('brand-settings', 'integrations'), icon: 'arrow' }),
  });
}
export function noDays() {
  return empty({ title: 'No numbers for these dates', text: 'Nothing has been read for this brand on these dates yet. Try a different range.' });
}

/* ---------- layout rules for the four tabs (every color and size token comes from app.css) ---------- */
const CSS = `
.mo{display:grid;gap:var(--sp-8)}
.mo-chart{padding:28px 32px 20px}
.mo-chart .lx-chart-h .lx-pill,.mo-chart .lx-chart-h .lx-stat{margin-left:auto}
.mo-chart .lx-chart-h{flex-wrap:wrap}
.mo-row{display:flex;align-items:center;gap:14px;flex-wrap:wrap}
.mo-cap{display:flex;align-items:center;gap:8px 16px;flex-wrap:wrap;margin:-8px 0 10px}
.mo-cap .lx-legend{margin-left:auto}
.mo-src{padding:0 var(--pad-card,28px) 10px}
.mo-tiles{margin:0}

.mo-need{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:var(--sp-8);padding:6px 28px 4px}
.mo-need>div{display:grid;gap:4px;min-width:0}
.mo-need small{font-size:13px;color:var(--muted)}
.mo-need span.lx-big{font-size:var(--num-l);color:var(--ink)}
.mo-need span{font-size:12.5px;color:var(--muted);font-variant-numeric:tabular-nums}
.mo-days{display:grid;grid-template-columns:repeat(auto-fit,minmax(112px,1fr));margin:18px 28px 0;border-top:1px solid var(--line)}
.mo-days>div{display:grid;gap:3px;align-content:start;padding:14px 12px 16px 0;min-width:0}
.mo-days small{font-size:var(--fs-colhead,11.5px);font-weight:600;color:var(--muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.mo-days .ev small{color:var(--ink)}
.mo-days b{font-size:18px;font-weight:600;letter-spacing:-.02em;font-variant-numeric:tabular-nums}
.mo-days span{font-size:12.5px;color:var(--muted);font-variant-numeric:tabular-nums}
.mo-more{padding:0 28px 22px;font-size:12.5px;color:var(--muted)}

.mo-budget{padding:8px 28px 18px}
.mo-share{display:grid;grid-template-columns:38px minmax(60px,1fr);align-items:center;gap:10px}
.mo-share b{font-weight:500;text-align:right}
.mo-share .lx-cellbar{display:block;width:100%;margin:0}

.mo-wide{display:block}
.mo-list{display:none}
.mo-g{display:block;width:200px;max-width:100%}
.mo-wk b{display:block;font-weight:600}
.mo-wk small{display:block;font-size:12.5px;color:var(--muted)}
tr.total .lx-gauge-track,.mo-item.total .lx-gauge-track{background:var(--line-strong)}

.mo-wf{display:grid;padding:4px 28px 20px}
.mo-wf>div{display:grid;grid-template-columns:minmax(150px,1.1fr) minmax(0,2fr) 96px 52px;align-items:center;gap:16px;min-height:46px;border-top:1px solid var(--line);font-variant-numeric:tabular-nums}
.mo-wf>div:first-child{border-top:0}
.mo-wf .n{color:var(--ink-2)}
.mo-wf .a{text-align:right}
.mo-wf .p{text-align:right;font-size:12.5px;color:var(--muted)}
.mo-wf .t{position:relative;height:8px;border-radius:999px;background:var(--bg-sunk)}
.mo-wf .t i{position:absolute;top:0;bottom:0;left:var(--l,0%);width:var(--w,0%);border-radius:999px;background:var(--icon)}
.mo-wf .res .n,.mo-wf .res .a{font-weight:600;color:var(--ink)}
.mo-wf .res .t i{background:var(--ink)}
.mo-wf .res{background:var(--band);margin:0 -28px;padding:0 28px;border-top:0}
.mo-wf .res+div{border-top:0}
.mo-wf .neg .a{color:var(--bad)}
.mo-wf .neg .t i{background:var(--bad)}

.mo-pick{display:flex;align-items:center;gap:14px;flex-wrap:wrap}
.mo-pick .lx-btn{margin-left:auto}
.mo-facts{display:grid;padding:4px 28px 18px}
.mo-facts>div{display:flex;align-items:baseline;gap:16px;min-height:44px;padding:10px 0;border-top:1px solid var(--line)}
.mo-facts>div:first-child{border-top:0}
.mo-facts span{color:var(--ink-2);min-width:0}
.mo-facts b{margin-left:auto;font-weight:600;font-variant-numeric:tabular-nums;white-space:nowrap}
.mo-yard{display:flex;align-items:center;gap:20px;flex-wrap:wrap;padding:6px 28px 4px}
.mo-yard .lx-gauge{flex:1;min-width:220px;max-width:420px}
.mo-note{padding:0 28px 22px;font-size:12.5px;color:var(--muted)}
.mo-chosen{font-weight:600}
.mo-goal{font-size:12.5px;color:var(--muted)}
.mo-kpi2{display:block;margin-top:2px;color:var(--muted)}
.mo-evs{display:flex;flex-wrap:wrap;gap:8px;padding:14px 28px 22px}
.mo-evs span{display:inline-flex;align-items:center;gap:6px;height:28px;padding:0 12px;border-radius:999px;background:var(--bg-sunk);font-size:12.5px;color:var(--ink-2)}
.mo-evs b{font-weight:600;color:var(--ink)}
.mo-wf .hd{min-height:30px;font-size:var(--fs-colhead,11.5px);font-weight:600;color:var(--muted)}
.mo-wf .hd .a,.mo-wf .hd .p{font-size:var(--fs-colhead,11.5px);color:var(--muted);white-space:nowrap}
.mo-wf>div.row{cursor:default;border-radius:var(--r-chip,6px)}
.mo-wf>div.row:hover{background:var(--row-hover)}
.mo-yard .rec{display:grid;gap:2px;min-width:130px}
.mo-yard .rec small{font-size:12px;color:var(--muted)}
.mo-yard .rec b{font-size:var(--num-m);font-weight:600;font-variant-numeric:tabular-nums}
.mo-yard .need{display:grid;gap:2px}
.mo-yard .need small{font-size:12px;color:var(--muted)}
.mo-opts tbody tr:hover td{background:transparent}
.mo-hist{padding:0 28px 18px}
.mo-hist>summary{cursor:pointer;width:max-content;padding:6px 10px;margin-left:-10px;border-radius:var(--r-chip,6px);font-size:13px;color:var(--muted);list-style:none}
.mo-hist>summary::-webkit-details-marker{display:none}
.mo-hist>summary:hover{background:var(--row-hover);color:var(--ink)}
.mo-hist[open]>summary{margin-bottom:8px}

@media (max-width:759px){
  .mo{gap:var(--sp-5)}
  .mo-chart{padding:18px 14px 12px}
  .mo-need{padding:4px 18px 0;gap:var(--sp-5)}
  .mo-need span.lx-big{font-size:var(--num-l)}
  .mo-days{grid-template-columns:repeat(2,minmax(0,1fr));margin:14px 18px 0}
  .mo-more{padding:0 18px 18px}
  .mo-budget{padding:8px 18px 14px}
  .mo-wide{display:none}
  .mo-list{display:block}
  .mo-item{display:grid;gap:12px;padding:16px 18px;border-top:1px solid var(--line)}
  .mo-item.total{background:var(--band)}
  .mo-item-h{display:flex;align-items:center;gap:10px;min-width:0}
  .mo-item-h b{font-size:15px;font-weight:600}
  .mo-item-h small{font-size:12.5px;color:var(--muted);white-space:nowrap}
  .mo-item-h .lx-stat{margin-left:auto}
  .mo-figs{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}
  .mo-figs span{display:grid;gap:2px;min-width:0}
  .mo-figs small{font-size:12px;color:var(--muted)}
  .mo-figs b{font-size:16px;font-weight:600;letter-spacing:-.015em;font-variant-numeric:tabular-nums;white-space:nowrap}
  .mo-wf{padding:2px 18px 14px}
  .mo-wf>div{grid-template-columns:minmax(0,1fr) auto 44px;gap:4px 12px;padding:11px 0}
  .mo-wf .t{grid-column:1/-1;grid-row:2;height:6px}
  .mo-wf .res{margin:0 -18px;padding:11px 18px}
  .mo-pick .lx-btn{margin-left:0;width:100%;height:44px;justify-content:center}
  .mo-facts{padding:2px 18px 12px}
  .mo-facts>div{display:grid;gap:2px}
  .mo-facts b{margin-left:0}
  .mo-yard{padding:6px 18px 4px;gap:12px}
  .mo-yard .lx-gauge{min-width:100%}
  .mo-note{padding:0 18px 18px}
}`;
export function styles() { addStyles('mo-css', CSS); }

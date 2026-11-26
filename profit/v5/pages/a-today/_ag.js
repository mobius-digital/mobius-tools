/* Shared by every agency page (a-today, a-month, a-platforms, a-meta, a-google, a-money, a-team, a-status).
   One reader for "every brand at once", one status rule, and the uniform brand card and brand row.
   Money for the whole store is MER; one platform is ROAS. Sales per platform are Triple Whale, last platform click. */

import { exampleChip as kitExampleChip } from '../../kit.js';
import { h, money, pct, x, num, pill, statusDot, gauge, table, card, empty, button, addStyles, handEm } from '../../kit.js';
import { fixture } from '../../data.js';
import { PLATFORM_NAME } from '../../icons.js';

/* ---------- small helpers ---------- */
export const PAID = ['meta', 'google', 'tiktok', 'amazon', 'pinterest'];
export const ok = n => n != null && isFinite(n);
export const sumOf = (rows, f) => { let t = 0, any = false; for (const r of rows) { const v = f(r); if (ok(v)) { t += v; any = true; } } return any ? t : null; };
export const day = d => new Date(String(d).slice(0, 10) + 'T12:00:00');
export const shortDay = d => day(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
export const longDay = d => day(d).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
export const slugOf = id => String(id || '').replace(/^brand_/, '').replace(/_/g, '-');
/** The address of one brand's page, from the agency view. */
export const brandHref = (id, line, tab) => `#/brand/${slugOf(id)}/${line}/${tab || 'index'}`;
export const platName = id => PLATFORM_NAME[id] || id;
export const quiet = text => h('span', { class: 'ag-q' }, text);
/** A failed side read must not sink the page; a sign-in problem or a cancel still must. */
export const soft = p => p.catch(e => { if (e && (e.name === 'AbortError' || e.status === 401)) throw e; return null; });
/** The small gray chip on anything drawn from sample numbers while its feed does not exist yet. */
export const exampleChip = kitExampleChip; /* one version, in the kit */
/** The whole sample world (pages/a-today/_sample/world.json), read once. */
let WORLD = null;
export const world = () => (WORLD ||= fixture('a-today/_sample/world.json'));

/* ---------- every brand, one reader ----------
   profit worker GET /api/overview?from&to&cmp=prev : one entry per brand with the window totals, the day series,
   the platform split (Triple Whale attribution), the month goals and the plan pro-rated to whole days.
   account-health GET /api/brands : goal ROAS and goal cost per brand. */
export async function readBrands(ctx, { from, to, preset } = ctx.range, { cmp = 'prev' } = {}) {
  const opt = { signal: ctx.signal };
  const [ov, br, behind] = await Promise.all([
    ctx.api(`/api/overview?from=${from}&to=${to}&cmp=${cmp}`, opt),
    soft(ctx.api('/api/brands', { ...opt, worker: 'ah' })),
    ctx.setting('agency.paceAlertPct', 10),
  ]);
  const goals = Object.fromEntries(((br && br.brands) || []).map(b => [b.id, b]));
  const brands = (ov.accounts || []).map(a => {
    const w = a.window || {}, g = goals[a.act_id] || {};
    const store = !!a.tw_shop && ok(w.sales);
    /* goals_planned false: the month has no goal of its own; goals and plan carry an earlier month's numbers, never shown */
    const noGoal = a.goals_planned === false ? monthWord(a.month) : null;
    const plan = preset === 'month' && a.plan && !noGoal ? a.plan : null;    // a plan is agreed per month
    const costsOk = !(a.cost_health && a.cost_health.verdict === 'broken');
    const ch = (a.channels || []).filter(c => PAID.includes(c.id) && (c.spend > 0 || ok(c.revenue)));
    let platforms = ch.map(c => ({ id: c.id, spend: c.spend ?? null, sales: store ? c.revenue : null, roas: store ? c.roas : null, cost: store ? c.cpa : null }));
    if (!platforms.length) for (const [id, v] of [['meta', w.meta_spend], ['google', w.google_spend]]) if (v > 0) platforms.push({ id, spend: v, sales: null, roas: null, cost: null });
    return {
      id: a.act_id, name: a.name, store,
      sales: store ? w.sales : null, spend: w.spend ?? null, mer: store ? w.mer : null,
      orders: store ? w.orders : null, new_orders: store ? w.new_orders : null, cac: store ? w.cac : null,
      gross_profit: store && costsOk ? w.gross_profit : null, profit: store && costsOk ? w.cm : null, costs_ok: costsOk,
      plan_sales: plan ? plan.sales : null, plan_spend: plan ? plan.spend : null,
      no_goal: noGoal,
      goal_mer: !noGoal && a.goals && ok(a.goals.sales) && a.goals.spend ? a.goals.sales / a.goals.spend : null,
      goal_roas: +g.target_roas > 0 ? +g.target_roas : null, goal_cost: +g.target_cpa > 0 ? +g.target_cpa : null,
      platforms,
      prev: a.prev ? { sales: a.prev.sales ?? null, spend: a.prev.spend ?? null, meta_spend: a.prev.meta_spend ?? null, google_spend: a.prev.google_spend ?? null } : null,
      days: (a.series || []).map(r => ({ date: r.date, sales: store ? r.sales : null, spend: r.spend })),
    };
  });
  return { window: { from: ov.from || from, to: ov.to || to }, rules: { behind_pct: +behind || 10 }, brands, daily: dailyOf(brands) };
}
/** 'YYYY-MM' -> 'November' (the month a goal is missing for); 'this month' when unknown. */
export function monthWord(ym) {
  const m = /^(\d{4})-(\d{2})$/.exec(String(ym || ''));
  return m ? new Date(Date.UTC(+m[1], +m[2] - 1, 15)).toLocaleString('en-US', { month: 'long', timeZone: 'UTC' }) : 'this month';
}
/** Every brand's days added up: sales (brands with a sales source only) and ad spend. */
export function dailyOf(brands) {
  const by = new Map();
  for (const b of brands) for (const r of b.days || []) {
    const d = by.get(r.date) || { date: r.date, sales: null, spend: null };
    if (ok(r.sales)) d.sales = (d.sales || 0) + r.sales;
    if (ok(r.spend)) d.spend = (d.spend || 0) + r.spend;
    by.set(r.date, d);
  }
  const rows = [...by.values()].sort((a, b) => a.date.localeCompare(b.date));
  return { dates: rows.map(r => r.date), sales: rows.map(r => r.sales), spend: rows.map(r => r.spend) };
}

/* ---------- the status rule, one place ---------- */
/** { tone, text, act, rank } for a brand against its plan. behindPct comes from the agency's pace alert setting. */
export function paceOf(b, behindPct = 10) {
  if (!b.store) return { tone: 'warn', text: 'Store not connected', act: true, rank: 2, pace: null };
  if (!ok(b.plan_sales) || !(b.plan_sales > 0)) return { tone: 'off', text: b.no_goal ? 'No goal set for ' + b.no_goal : 'No plan set', act: false, rank: 3, pace: null };
  const pace = b.sales / b.plan_sales, cut = 1 - behindPct / 100;
  if (pace < cut) return { tone: 'bad', text: 'Behind plan', act: true, rank: 0, pace };
  if (pace < 0.98) return { tone: 'warn', text: 'Just under plan', act: false, rank: 4, pace };
  return { tone: 'good', text: pace > 1.1 ? 'Ahead of plan' : 'On plan', act: false, rank: 5, pace };
}
export const roasTone = (v, goal) => !ok(v) || !ok(goal) ? '' : v >= goal ? 'good' : v >= goal * 0.8 ? 'warn' : 'bad';
/** The goal tick sits at the same place on every row, so rows read down the column. */
export const against = (value, goal, tone) => !ok(value) ? null : gauge({ value, goal, max: goal ? goal * 1.6 : Math.max(value * 1.2, 1), tone, thin: true });
export const plat = (b, id) => (b.platforms || []).find(p => p.id === id) || null;

/* ---------- the look ---------- */
const CSS = `
.ag{display:grid;grid-template-columns:minmax(0,1fr);gap:var(--sp-8);min-width:0}
.ag>*{min-width:0}
.ag-q{color:var(--muted);font-weight:400}
.ag-ex{font-weight:500}
.ag-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:var(--sp-6)}
.ag-grid.three{grid-template-columns:repeat(3,minmax(0,1fr))}
.ag-grid.three .ag-figs{grid-template-columns:repeat(3,minmax(0,1fr))}
.ag-grid.three .ag-figs small{white-space:normal}
.ag-grid.three .ag-bc-h .lx-stat{white-space:nowrap}
@media (max-width:1180px){.ag-grid.three{grid-template-columns:repeat(2,minmax(0,1fr))}}
.ag-bc{position:relative;overflow:hidden}
.ag-bc.needs::before{content:'';position:absolute;left:0;right:0;top:0;height:3px;background:var(--brand)}
.ag-needs{display:inline-flex;align-items:center;height:22px;padding:0 9px;border-radius:999px;background:var(--warn-bg);color:var(--warn);font-size:12px;font-weight:600;white-space:nowrap}
.ag-name .nm{display:block;min-width:0;max-width:30ch;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.ag-wide td.name{min-width:200px}
.ag-go{font-size:12.5px;color:var(--muted);white-space:nowrap;text-decoration:none}
.ag-go:hover{color:var(--ink);text-decoration:underline}
.ag-bc{display:grid;grid-template-rows:auto auto auto 1fr;gap:16px;color:inherit;text-decoration:none}
.ag-bc-h{display:flex;align-items:center;gap:10px;min-height:24px;min-width:0}
.ag-bc-h b{font-size:16px;font-weight:600;letter-spacing:-.015em;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.ag-bc-h>:last-child{margin-left:auto;flex:none}
.ag-bc-n{display:flex;align-items:baseline;gap:10px;min-height:38px;flex-wrap:wrap}
.ag-bc-n .lx-big{font-size:var(--num-l)}
.ag-bc-n small{font-size:13px;color:var(--muted)}
.ag-bc-n .w{font-size:15px;font-weight:500;color:var(--ink-2)}
.ag-bc-g{min-height:25px}
.ag-figs{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,112px),1fr));gap:10px;padding-top:14px;border-top:1px solid var(--line)}
.ag-figs>span{display:grid;gap:2px;min-width:0;align-content:start}
.ag-figs small{font-size:12px;color:var(--muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.ag-figs b{font-size:15.5px;font-weight:600;letter-spacing:-.015em;font-variant-numeric:tabular-nums;white-space:nowrap}
.ag-figs .ag-fu{font-style:normal;font-size:12px;color:var(--muted);white-space:nowrap}
.ag-figs b.ag-q{font-size:13px;font-weight:400;letter-spacing:0;white-space:normal}
.ag-bc-a{display:flex;flex-wrap:wrap;align-items:center;gap:10px;min-height:34px;align-self:end}
.ag-bc-a .lx-sp{flex:1}
.ag-name{display:inline-flex;align-items:center;gap:10px;min-width:0;color:inherit;text-decoration:none;font-weight:500}
.ag-name:hover b,a.ag-name:hover{text-decoration:underline}
.ag-wide .lx-table .g{padding-left:22px}
.ag-wide tr.total .lx-gauge-track{background:var(--line-strong)}
.ag-list{display:none}
.ag-chart{padding:28px 32px 20px}
.ag-bar{display:grid;grid-template-columns:minmax(0,1fr);align-items:center}
.ag-bar .lx-cellbar{display:block;width:100%;margin:0;height:6px}
.ag-pad{padding:4px 28px 22px}
.ag-note{font-size:13px;color:var(--muted);max-width:76ch}
@media (max-width:759px){
  .ag{gap:var(--sp-5)}
  .ag-grid,.ag-grid.three{grid-template-columns:minmax(0,1fr);gap:var(--sp-4)}
  .ag-wide{display:none}
  .ag-list{display:block}
  .ag-item{display:grid;gap:12px;padding:16px 18px;border-top:1px solid var(--line);color:inherit;text-decoration:none;min-width:0}
  .ag-item.total{background:var(--band)}
  .ag-item-h{display:flex;align-items:center;gap:10px;min-width:0}
  .ag-item-h b{font-size:15px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .ag-item-h>:last-child:not(:first-child){margin-left:auto;flex:none}
  .ag-item .ag-figs{padding-top:0;border-top:0}
  .ag-chart{padding:18px 14px 12px}
  .ag-pad{padding:4px 18px 18px}
  .ag .lx-card.flush>.lx-sec{flex-wrap:wrap}
  .ag-bc-n .lx-big{font-size:var(--num-l)}
}`;
export const style = () => addStyles('ag-css', CSS);

/** The brand's color square and name. As a link when href is given. */
export function brandName(b, ctx, href) {
  const known = ((ctx && ctx.brands) || []).find(k => k.id === b.id) || {};
  const kids = [h('i', { class: 'lx-swatch', style: { '--dot': b.color || known.color || 'var(--ink)' } }), h('b', { class: 'nm' }, b.name)];
  return href ? h('a', { class: 'ag-name', href, title: b.goTitle || null }, kids) : h('span', { class: 'ag-name' }, kids);
}
/** Up to three small figures in a row: [[label, text or node, under?, title?], ...]. A node is drawn quiet (words, not a
    number). under is a small muted line below the value ("goal 3.00x"); title is the label's hover text. */
export const figs = list => h('div', { class: 'ag-figs' }, list.filter(Boolean).map(([label, v, under, title]) =>
  h('span', null, h('small', { title: title || null }, label), typeof v === 'string' ? h('b', null, v) : h('b', { class: 'ag-q' }, v && v.textContent != null ? v.textContent : ''),
    under ? h('i', { class: 'ag-fu' }, under) : null)));
/** The hero band: big figures, numbers first. list: [{ label, value, sub, lead, href }] */
export function figures(list) {
  const items = list.filter(Boolean);
  /* a seven figure amount is wider than a hand written row allows for: tell the row, so the tile keeps its number inside */
  const hand = handEm(items.map(k => typeof k.value === 'string' || typeof k.value === 'number' ? k.value : ''));
  return h('section', { class: 'lx-hero line' }, h('div', { class: 'lx-kpis', style: hand ? { '--cols': items.length, '--kpi-hand': hand } : { '--cols': items.length } }, items.map(k =>
    h(k.href ? 'a' : 'div', { class: 'lx-kpi lg', href: k.href },
      h('span', { class: 'l' }, k.label),
      k.lead ? h('span', null, h('span', { class: 'lx-hero-num' }, k.value)) : h('span', { class: 'v' }, k.value),
      h('span', { class: 's' }, k.sub || '')))));
}
/** One equal row per brand: a table on a wide screen, a list of the same rows on a phone.
    cols are kit table columns. item(row) gives the phone row: { head, tail, figs: [[label, text]], gauge, href }. */
export function brandRows({ title, note, action, cols, rows, total, sort, item, rowHeight, emptyText }) {
  /* the kit scale: 48px roomy rows; a page passes a taller rowHeight only where a cell holds two lines */
  const wide = table({ roomy: true, rowHeight, cols, rows, total, sort, empty: emptyText || 'No brands for these dates',
    onRow: (r, _i, e) => { if (r.href && !e.target.closest('a,button')) location.hash = r.href; } });
  const one = (r, isTotal) => { const it = item(r, isTotal); return h(it.href && !isTotal ? 'a' : 'div', { class: 'ag-item' + (isTotal ? ' total' : ''), href: isTotal ? null : it.href },
    h('div', { class: 'ag-item-h' }, it.head, it.tail || null), it.figs && figs(it.figs), it.gauge || null, it.more || null); };
  const sorted = sort ? [...rows].sort((a, b) => { const c = cols.find(k => k.key === sort.key), v = c && c.value ? c.value : (r => r[sort.key]); const d = (v(a) ?? -Infinity) - (v(b) ?? -Infinity); return sort.dir === 'asc' ? d : -d; }) : rows;
  return card({ title, note, action, flush: true }, h('div', { class: 'ag-wide' }, wide), h('div', { class: 'ag-list' }, sorted.map(r => one(r, false)), total ? one(total, true) : null));
}
/** The plain state for an owner-only page, a worker that said no, or nothing connected. */
export function refused(data, ctx, what) {
  if (data && data.owner_only) return empty({ title: 'This page is for the owner', text: `${what} is kept to the agency owner's sign in.` });
  return null;
}
export { money, pct, x, num, pill, statusDot, button };

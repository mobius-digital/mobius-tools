/* Shared by the Google tabs (Overview, Search terms, Products and creative, Suggestions, Changes made):
   the loaders, the states and a few local parts. Every tab's data has one shape, the shape of
   _sample/google.json, and a tab reads only its own section.

   The rule on every tab: a sale number is Triple Whale's. Google's own count is a second, smaller
   figure named "Google says". Spend, clicks, budgets and times shown are Google's.

   Real mode reads (all GET, nothing here writes):
     account-health  /api/google/ads?act=&from=&to=          campaigns and days, Google's own count
     account-health  /api/google/ads-terms?act=&from=&to=    the top 50 search terms by spend
     account-health  /api/google/ads-ads?act=&from=&to=      ads and asset groups (through ads-videos.js)
     account-health  /api/google/ads-changes?act=&from=&to=  the change list, last 30 days
     account-health  /api/leaks?act=&days=30                 the Google rows of the leak finder
     profit          /api/hub/paid?platform=google&act=...   Google's total with Triple Whale sales, by day
   A part with no route yet is drawn from the sample file and wears the "Example" chip (see `example`). */

import { info } from '../platforms/_ads.js';
import { exampleChip as kitExampleChip } from '../../kit.js';
import { h, svgNode, addStyles, card, button, empty, statusDot, gauge, kpi, tiles, money, num, pct, x } from '../../kit.js';
import { icon } from '../../icons.js';
import { AI_NAME } from '../../config.js';
import { askWhy } from '../home/_biz.js';

/* ---------- small helpers ---------- */
export const ok = n => n != null && isFinite(n);
export const div = (a, b) => (ok(a) && ok(b) && b > 0 ? a / b : null);
export const sum = (rows, k) => (rows || []).reduce((t, r) => t + (+r[k] || 0), 0);
export const usd = (n, cur) => money(ok(n) ? Math.round(n) : n, { cur });
export const usd2 = (n, cur) => money(n, { cur, cents: true });
export const shortDate = date => new Date(String(date).slice(0, 10) + 'T12:00:00Z').toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
export const rangeLabel = (from, to) => (from === to ? shortDate(from) : shortDate(from) + ' to ' + shortDate(to));
const words = s => String(s || '').replace(/_/g, ' ').toLowerCase().replace(/^\w/, c => c.toUpperCase());
/** ['plain ', { b: 'bold' }] to nodes, for the Locus AI line. */
export const say = parts => (parts || []).map(p => (typeof p === 'string' ? p : h('b', null, p.b)));
/** A ROAS is not a result on fewer than two orders. */
export const roasText = (roas, orders) => (ok(orders) && orders < 2 ? 'too few' : ok(roas) ? x(roas) : 'no data');

/* ---------- the local CSS (layout only; color and type are the frame's) ---------- */
const CSS = `
.gg-figs,.gg-two,.gg-status,.gg-views{min-width:0}
.gg-status{display:flex;align-items:center;gap:8px 18px;flex-wrap:wrap;font-size:13px;color:var(--muted)}
.gg-status .r{margin-left:auto}
.gg-figs{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:var(--sp-8)}
.gg-figs.three{grid-template-columns:repeat(3,minmax(0,1fr))}
.gg-ret{display:grid;gap:var(--gap-3,12px);min-width:0}
.gg-ret .lx-sec h2{margin:0}
.gg-tl{font-size:var(--fs-colhead,11.5px);font-weight:600;color:var(--muted)}
.gg-lab{display:inline-flex;align-items:center;gap:6px;min-width:0}
.gg-tiles .lx-gauge{margin-top:auto;padding-top:12px}
.gg-figs .lx-kpi .v small{font-size:13px;font-weight:500;letter-spacing:0;color:var(--muted);margin-left:8px}
.gg-figs .lx-kpi .s{flex-wrap:wrap}
.gg-figs .lx-gauge{margin-top:14px}
.gg-figs .says{font-size:12.5px;color:var(--muted);font-variant-numeric:tabular-nums}
.gg-says2{display:block;width:100%;font-size:var(--fs-small,12.5px);color:var(--muted);font-variant-numeric:tabular-nums}
.gg-legend{margin:10px 0 0;font-size:var(--fs-small,12.5px);color:var(--muted);line-height:1.5}
.gg-legend b{display:inline-grid;place-items:center;width:17px;height:17px;margin-right:5px;border-radius:50%;background:var(--bg-sunk);color:var(--ink);font-size:11px;font-weight:600}
.gg-legend span{margin-right:14px}
.gg-ex{margin-left:auto;flex:none}
.lx-sec .gg-ex{margin-left:0}
.gg-two{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:var(--sp-6);align-items:stretch}
.gg-quiet{padding:0 28px 18px;font-size:13px;color:var(--muted)}
.gg-camps .lx-table td{white-space:nowrap}
.gg-camps td.name{min-width:220px;max-width:320px}
.gg-cn{display:flex;align-items:center;gap:8px;min-width:0}
.gg-cn b{font-weight:500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0}
.gg-ctype{display:flex;align-items:center;gap:8px;margin-top:2px;font-size:12px;color:var(--muted)}
.gg-more-cols{display:flex;justify-content:flex-end;padding:10px 24px 14px}
.gg-sh{display:grid;gap:16px}.gg-sh .g{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}
.gg-sh .g>div{display:grid;gap:3px;padding:12px 14px;border-radius:var(--r-tbl,12px);background:var(--surface-2)}.gg-sh .g .l{font-size:12px;color:var(--muted)}
.gg-sh .g b{font-size:var(--num-s);font-variant-numeric:tabular-nums}
@media (max-width:759px){.gg-sh .g{grid-template-columns:repeat(2,minmax(0,1fr))}}
.gg-camps .lx-table td.num{white-space:nowrap}
.gg-says{color:var(--muted)}
.gg-test{display:grid;gap:16px}
.gg-test h4{margin:0;font-size:15.5px;font-weight:600;letter-spacing:-.015em}
.gg-test-n{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:14px}
.gg-test-n span{display:grid;gap:3px}
.gg-test-n b{font-size:18px;font-weight:600;letter-spacing:-.02em;font-variant-numeric:tabular-nums}
.gg-wait{display:flex;align-items:center;gap:14px;padding:14px 8px;margin:0 -8px;border-top:1px solid var(--line);color:inherit;text-decoration:none;border-radius:var(--r-btn,10px)}
a.gg-wait:hover{background:var(--row-hover)}
.gg-wait:first-of-type{border-top:0;padding-top:0}
.gg-wait .tx{min-width:0;flex:1}
.gg-wait .tx b{display:block;font-size:14.5px;font-weight:600}
.gg-wait .tx span{font-size:13px;color:var(--muted)}
.gg-split{padding:6px 28px 14px}
.gg-split-bar{position:relative;height:8px;border-radius:999px;background:var(--line-strong);overflow:visible}
.gg-split-bar i{position:absolute;left:0;top:0;bottom:0;border-radius:999px;background:var(--ink)}
.gg-split-bar em{position:absolute;top:-5px;bottom:-5px;width:2px;background:var(--ink);border-radius:2px}
.gg-split-l{display:flex;justify-content:space-between;gap:12px;margin-top:9px;font-size:12.5px;color:var(--muted);flex-wrap:wrap}
.gg-split-l b{color:var(--ink);font-weight:600}
.gg-sw{display:inline-block;width:9px;height:9px;border-radius:2px;background:var(--ink);margin-right:9px}
.gg-sw.g{background:var(--line-strong)}
.gg-terms .lx-table td{white-space:normal}
.gg-terms .lx-table td.num{white-space:nowrap}
.gg-terms tr:has(.gg-th) td{background:var(--surface-2);font-weight:600}
.gg-th{font-weight:600}
.gg-th small{margin-left:10px;font-size:12.5px;font-weight:400;color:var(--muted)}
.gg-term{padding-left:16px;display:block}
.gg-flag{display:block;margin-top:2px}
.gg-termsh{flex-wrap:wrap;row-gap:10px}
.gg-termsh .lx-seg{margin-left:auto}
.gg-views{display:flex;align-items:center;gap:14px;flex-wrap:wrap}
.gg-sub{display:grid;grid-template-columns:minmax(0,1fr);gap:var(--sp-8);min-width:0}
.gg-sub.vd>.gv-rate,.gg-sub.vd>.gv-groups,.gg-sub.vd>.gv-heads,.gg-sub.vd>.lx-foot{display:none}
.gg-sub.ti>:not(.gv-rate):not(.gv-groups):not(.gv-heads){display:none!important}
.gg-prod .lx-table td{white-space:normal}
.gg-prod .lx-table td.num{white-space:nowrap}
.gg-sug{display:flex;align-items:center;gap:16px;padding:18px 0;border-top:1px solid var(--line)}
.gg-sug:first-of-type{border-top:0}
.gg-sug .lx-pill{flex:none;min-width:64px;justify-content:center}
.gg-sug .tx{min-width:0;flex:1}
.gg-sug .tx b{display:block;font-size:15px;font-weight:600;letter-spacing:-.01em}
.gg-sug .tx span{display:block;font-size:13px;color:var(--muted);margin-top:2px}
.gg-sug .tx .w{font-size:12px;color:var(--faint)}
.gg-sug .tx .o{display:flex;align-items:center;gap:6px;color:var(--ink-2);font-size:12.5px;margin:4px 0}
.gg-sm{flex:none;width:210px;display:grid;gap:6px}
.gg-sm .v{display:flex;align-items:baseline;gap:8px}.gg-sm .v b{font-size:var(--num-m);font-weight:600;font-variant-numeric:tabular-nums}
.gg-sm .v b.bad{color:var(--bad)}.gg-sm .v b.good{color:var(--good)}.gg-sm .v span,.gg-sm .per{color:var(--muted);font-size:12px}
.gg-n{display:flex;align-items:baseline;gap:12px;color:var(--muted);font-size:13.5px}
.gg-n b{font-size:var(--num-l);font-weight:600;letter-spacing:-.03em;line-height:1.1;color:var(--ink);font-variant-numeric:tabular-nums}
.gg-day{display:grid;grid-template-columns:92px minmax(0,1fr);gap:8px 22px;padding:18px 0;border-top:1px solid var(--line)}
.gg-day:first-of-type{border-top:0;padding-top:4px}
.gg-day .d{font-size:13px;font-weight:600;color:var(--ink-2);padding-top:2px}
.gg-chg{display:flex;align-items:flex-start;gap:14px;padding:6px 0;min-width:0}
.gg-chg .lx-pill{flex:none;min-width:74px;justify-content:center;margin-top:1px}
.gg-chg .tx{min-width:0;flex:1}
.gg-chg .tx b{display:block;font-size:14.5px;font-weight:500;overflow-wrap:anywhere}
.gg-chg .tx span{display:block;font-size:12.5px;color:var(--muted);margin-top:2px;overflow-wrap:anywhere}
.gg-chg .ba{flex:none;text-align:right;font-size:12px;color:var(--muted);line-height:1.35;font-variant-numeric:tabular-nums}
.gg-chg .ba b{display:block;font-size:14.5px;font-weight:600;color:var(--ink)}
.gg-more{border-top:1px solid var(--line);padding-top:14px;margin-top:6px}
.gg-more summary{cursor:pointer;font-size:13.5px;font-weight:500;color:var(--ink-2)}
.gg-more .gg-chg .tx b{font-weight:450;font-size:13.5px}
.gg-rules{margin:0;padding-left:20px;display:grid;gap:6px;font-size:14px;color:var(--ink-2)}
.gg-strip{display:flex;align-items:center;gap:16px;padding:18px 22px;border-radius:var(--r-card,16px);background:var(--band)}
.gg-strip .ic{flex:none;display:grid;place-items:center;width:40px;height:40px;border-radius:var(--r-tbl,12px);background:var(--surface);box-shadow:0 0 0 1px var(--line)}
.gg-strip .tx{min-width:0;flex:1}
.gg-strip .tx b{display:block;font-size:15px;font-weight:600}
.gg-strip .tx span{font-size:13px;color:var(--muted)}
@media (max-width:1040px){
  .gg-figs,.gg-figs.three{grid-template-columns:repeat(2,minmax(0,1fr))}
  .gg-two{grid-template-columns:1fr;gap:var(--sp-4)}
}
@media (max-width:759px){
  .gg-figs,.gg-figs.three{gap:22px 16px}
  .gg-figs>.lx-kpi{min-width:0}
  .gg-figs.three.gg-chfigs{grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}
  .gg-chfigs .lx-kpi .s{display:none}
  .gg-splitc .lx-table th{white-space:normal;line-height:1.2}
  .gg-splitc .lx-table td,.gg-splitc .lx-table th{padding-left:8px;padding-right:8px}
  .gg-splitc .lx-table td:first-child,.gg-splitc .lx-table th:first-child{padding-left:18px}
  .gg-figs .lx-kpi .l{white-space:normal;line-height:1.3}
  .gg-figs .lx-kpi .v{font-size:var(--num-l);white-space:normal;flex-wrap:wrap}
  .gg-figs .lx-kpi .v small{display:block;width:100%;margin:4px 0 0}
  .gg-figs .lx-gauge{min-width:0;max-width:100%}
  .gg-figs.three{grid-template-columns:1fr}
  .gg-status .r{margin-left:0;width:100%}
  .gg-quiet,.gg-split{padding-left:18px;padding-right:18px}
  .gg-test-n{grid-template-columns:repeat(2,minmax(0,1fr))}
  .gg-wait,.gg-sug,.gg-strip{flex-wrap:wrap}
  .gg-sm{width:100%;order:3}
  .gg-wait .tx,.gg-sug .tx{flex-basis:100%;order:2}
  .gg-sug .lx-btn,.gg-strip .lx-btn{width:100%;height:46px;order:3}
  .gg-termsh .lx-seg{margin-left:0;width:100%}
  .gg-termsh .lx-seg button{flex:1}
  .gg-views .lx-seg{width:100%}
  .gg-views .lx-seg button{flex:1;padding-left:4px;padding-right:4px}
  .gg-term{padding-left:8px}
  .gg-day{grid-template-columns:1fr;gap:4px}
  .gg-chg{flex-wrap:wrap}
  .gg-chg .tx{flex-basis:calc(100% - 90px)}
  .gg-chg .ba{text-align:left;padding-left:88px;width:100%}
  .gg-chg .ba b{display:inline;margin-right:6px}
}`;
export function styles() { addStyles('gg-css', CSS); }

/* ---------- parts ---------- */
/** The chip on a block that is drawn from the sample file because no route feeds it yet. */
export const exampleChip = kitExampleChip; /* one version, in the kit */
/** A block is an example when the loader says so. Never in sample mode (the whole page is sample numbers there). */
export const isEx = (d, key) => !!(d && d.example && d.example[key]);

export function strip({ ic = 'google', title, text, action }) {
  return h('div', { class: 'gg-strip' }, h('span', { class: 'ic' }, svgNode(icon(ic))), h('span', { class: 'tx' }, h('b', null, title), h('span', null, text)), action || null);
}

/** One figure tile (the batch 1 look): label, value, ONE line under it, the window and source line, an optional gauge.
    says / more: extra words that live in the (i) beside the label. src: the old small source tag, now the source line.
    win: the dates ("Nov 1 to 22"); source: "Triple Whale" | "Google Ads" | "Google's own count". */
export function fig({ label, src, value, small, sub, says, more, extra, href, win, source, spark, sparkLabels, sparkFormat }) {
  /* one mark per term (brief rule 3): the label carries its own dotted definition, never an (i) beside it. Google's own
     figure (says) is a labeled second line under the number; the longer working (more) rides on the tile's hover title. */
  const under = says ? [sub && (Array.isArray(sub) ? sub.some(Boolean) : sub) ? sub : null, h('span', { class: 'gg-says2' }, says)].filter(Boolean) : sub || null;
  const node = kpi({ label, value, small, sub: under, window: win, source: source || src, href, spark, sparkLabels, sparkFormat });
  if (more) node.title = typeof more === 'string' ? more : '';
  if (extra) node.append(extra);
  return node;
}
/** The row of figure tiles: 3 or 4 a row (2 on a tablet, the kit decides the phone). */
export const figs = (list, cls) => { const l = list.filter(Boolean); return tiles(l, { cols: l.length === 3 ? 3 : l.length === 2 ? 2 : 4, class: 'gg-tiles' + (cls ? ' ' + cls : '') }); };
export const TWS = 'Triple Whale', GADS = 'Google Ads', GSAYS = "Google's own count";
export const none = text => h('small', null, text || 'No sales source connected');

/** ROAS against its goal (higher is better) and a cost against its goal (lower is better): a tone and a word. */
export function roasRead(roas, goal) {
  if (!ok(roas) || !ok(goal) || !(goal > 0)) return null;
  const r = roas / goal;
  return r >= 1 ? ['good', 'Over goal'] : r >= 0.85 ? ['warn', 'Just under'] : r >= 0.6 ? ['bad', 'Under'] : ['bad', 'Far under'];
}
export function costRead(cost, goal) {
  if (!ok(cost) || !ok(goal) || !(goal > 0)) return null;
  const r = cost / goal;
  return r <= 1 ? ['good', 'Under goal'] : r <= 1.2 ? ['warn', 'Just over'] : r <= 1.6 ? ['bad', 'Over'] : ['bad', 'Far over'];
}
export const goalGauge = (value, goal, text, zero) => (ok(value) && goal ? gauge({ value, max: Math.max(value, goal) * 1.15, goal, ticks: [{ side: 'l', text: zero || '0' }, { at: goal, text, on: true }] }) : null);

/** The state a tab shows instead of numbers. Returns a node, or null when there is something to draw. */
export function gate(d, ctx) {
  if (!ctx.brand || !d || d.state === 'no_brand') return empty({ title: 'Pick one brand', text: 'Google is shown for one brand at a time.' });
  const team = !ctx.isClient;
  if (d.state === 'not_linked') return strip({ title: 'Google Ads is not connected yet',
    text: team ? 'Add this brand’s Google Ads account in Brand settings, Integrations. Until then only the Triple Whale totals exist.' : 'Your team has not connected Google Ads for this brand yet.',
    action: team ? button('Open integrations', { href: ctx.href('brand-settings', 'integrations'), icon: 'arrow' }) : null });
  if (d.state === 'error') return empty({ title: 'Google Ads did not answer', text: [d.error, team && d.fix].filter(Boolean).join(' ') || 'Try again in a minute.' });
  return null;
}
export const askButton = ctx => (ctx.isClient ? null : askWhy(ctx, 'How is Google doing, and why?'));
export { AI_NAME };

/* ---------- loading ---------- */
const soft = p => p.catch(e => { if (e && e.name === 'AbortError') throw e; return { error: e.message || 'failed', status: e.status }; });
const q = ctx => `act=${encodeURIComponent(ctx.brand.id)}&from=${ctx.range.from}&to=${ctx.range.to}`;
const ah = (ctx, path) => soft(ctx.api(path, { worker: 'ah', signal: ctx.signal }));
const base = ctx => ({ window: { from: ctx.range.from, to: ctx.range.to, label: rangeLabel(ctx.range.from, ctx.range.to) }, currency: (ctx.brand && ctx.brand.currency) || 'USD', source: 'google',
  goals: { roas: (ctx.brand && ctx.brand.target_roas) || null, cpa: (ctx.brand && ctx.brand.target_cpa) || null, ncpa: null }, example: {} });
/** What the Google Ads answer means for the page: connected, not linked, or an error with its words. */
const stateOf = r => (!r ? 'error' : r.error === 'not_linked' ? 'not_linked' : r.error ? 'error' : 'connected');
const TYPE = { SEARCH: 'Search', SHOPPING: 'Shopping', PERFORMANCE_MAX: 'Performance Max', DEMAND_GEN: 'Demand Gen', VIDEO: 'Video', DISPLAY: 'Display', MULTI_CHANNEL: 'App' };
const typeOf = t => TYPE[t] || words(t);
/** The sample file, read in real mode only for the blocks no route feeds yet. */
const sampleFile = ctx => ctx.fixture('google.json').catch(() => null);

export const sampleGoogle = ctx => ctx.fixture('google.json');

/** Overview: Google's campaigns and days, and the Triple Whale total for Google by day. */
export async function loadOverview(ctx) {
  const out = base(ctx);
  if (!ctx.brand) return { ...out, state: 'no_brand' };
  const [gads, paid, ex] = await Promise.all([
    ah(ctx, `/api/google/ads?${q(ctx)}`),
    soft(ctx.api(`/api/hub/paid?platform=google&model=lastPlatformClick&cmp=prev&${q(ctx)}`, { worker: 'profit', signal: ctx.signal })),
    ctx.isClient ? null : sampleFile(ctx),
  ]);
  const b = paid && paid.brands && paid.brands[0], cur = (b && b.cur) || {}, prev = (b && b.prev) || null;
  const state = stateOf(gads);
  /* Not linked, but Triple Whale still carries a Google total: show the totals, say plainly it is totals only. */
  if (state !== 'connected' && !(cur.spend > 0)) return { ...out, state, error: state === 'error' ? gads && gads.error : null, fix: gads && gads.fix };
  const camps = state === 'connected' ? gads.campaigns || [] : [];
  const series = ((b && b.series) || []).map((r, i) => ({ date: r.date, spend: r.spend, brand: null, sales: r.revenue, prev_spend: b.prev_series && b.prev_series[i] ? b.prev_series[i].spend : null }));
  const gDays = state === 'connected' ? gads.days || [] : [];
  const spend = cur.spend > 0 ? cur.spend : sum(camps, 'spend');
  const salesSource = !cur.attr_pending && (cur.revenue > 0 || series.some(r => r.sales > 0));
  const gSales = camps.length ? sum(camps, 'value') : ok(cur.platform_revenue) ? cur.platform_revenue : null;
  if (b && b.goals) { out.goals.roas = b.goals.roas || out.goals.roas; out.goals.cpa = b.goals.cpa || out.goals.cpa; }
  out.example = ex ? { test: true, waiting: true } : {};
  return { ...out, state: 'connected', totals_only: state !== 'connected', sales_source: salesSource,
    overview: {
      totals: { spend, share_of_ads: null, cpc: cur.cpc ?? div(spend, sum(camps, 'clicks')), cpc_prev: prev ? prev.cpc : null,
        sales: salesSource ? cur.revenue : null, roas: salesSource ? cur.roas : null, orders: salesSource ? cur.purchases : null, cost_sale: salesSource ? cur.cpa : null,
        new_customers: null, cost_new: null, google_sales: gSales, google_roas: div(gSales, spend) },
      split: null,
      series: series.length ? series : gDays.map(r => ({ date: r.date, spend: r.spend, brand: null, sales: null, prev_spend: null })),
      notes: [], take: null,
      campaigns: camps.map(c => ({ name: c.name, type: typeOf(c.type), status: /ENABLED/i.test(c.status) ? 'on' : 'paused', budget: c.budget_shared ? null : c.budget, spend: c.spend,
        sales: null, roas: null, orders: null, new_customers: null, cost_new: null, google_sales: c.value, google_orders: c.conversions, google_roas: div(c.value, c.spend), lost_budget: null, lost_rank: null,
        first_touch: c.type === 'VIDEO' || c.type === 'DEMAND_GEN' })),
      budget_total: null, paused: null, suggestions: null,
      test: ex ? ex.overview.test : null, waiting: ex ? ex.overview.waiting : null,
    } };
}

/* The brand's own words, for telling "our name" searches from the rest. Common shop words do not count. */
const COMMON = new Set(['golf', 'apparel', 'supply', 'pets', 'sports', 'sticks', 'company', 'brand', 'shop', 'store', 'official', 'and', 'the', 'co']);
function brandTest(name) {
  const flat = s => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  let ws = String(name || '').toLowerCase().split(/[^a-z0-9]+/).filter(w => w.length > 3 && !COMMON.has(w));
  if (!ws.length) ws = [flat(name)].filter(w => w.length > 2);
  return term => { const t = flat(term); return ws.some(w => t.includes(w)); };
}
const THEMES = [['name', 'Our name'], ['gifts', 'Gifts'], ['price', 'Price and deals'], ['junk', 'Junk'], ['other', 'Other searches']];

/** Search terms: the top 50 by spend, grouped by plain word rules. Orders and sales per term are Google's count. */
export async function loadTerms(ctx) {
  const out = base(ctx);
  if (!ctx.brand) return { ...out, state: 'no_brand' };
  const [terms, gads, leaks, ex] = await Promise.all([
    ah(ctx, `/api/google/ads-terms?${q(ctx)}`), ah(ctx, `/api/google/ads?${q(ctx)}`),
    ctx.isClient ? null : ah(ctx, `/api/leaks?act=${encodeURIComponent(ctx.brand.id)}&days=30`),
    sampleFile(ctx),
  ]);
  const state = stateOf(terms);
  if (state !== 'connected') return { ...out, state, error: state === 'error' ? terms && terms.error : null, fix: terms && terms.fix };
  const isBrand = brandTest(ctx.brand.name);
  const junk = new Map();
  for (const l of (leaks && leaks.leaks) || []) if (l.id === 'google_search:negatives') for (const it of l.items || []) junk.set(String(it.term).toLowerCase(), it.why || '');
  const rows = (terms.terms || []).map(t => {
    const lower = t.term.toLowerCase(), blocked = /excluded/.test(t.status || ''), ours = isBrand(t.term);
    const theme = ours ? 'name' : junk.has(lower) ? 'junk' : /gift|present|stocking|christmas|birthday/.test(lower) ? 'gifts' : /sale|deal|discount|coupon|promo|cheap|price|clearance|\$\d/.test(lower) ? 'price' : 'other';
    const wrongPlace = ours && /shopping|pmax|performance max/i.test(t.campaign);
    return { term: t.term, where: t.campaign, group: t.ad_group, flag: wrongPlace ? 'Our name outside brand search' : null, spend: t.spend, clicks: t.clicks, orders: t.conversions, sales: t.value, theme,
      state: blocked ? 'blocked' : /^added$/.test(t.status || '') ? 'keyword' : theme === 'junk' || wrongPlace ? 'block' : !ours && t.conversions >= 2 ? 'add' : null, why: junk.get(lower) || null };
  });
  const themes = THEMES.map(([id, name]) => { const rs = rows.filter(r => r.theme === id); return { id, name, count: rs.length, spend: sum(rs, 'spend'), clicks: sum(rs, 'clicks'), orders: sum(rs, 'orders'), sales: sum(rs, 'sales'), rows: rs }; }).filter(t => t.count);
  const camps = (gads && !gads.error && gads.campaigns) || [], total = sum(camps, 'spend') || null;
  const pmax = sum(camps.filter(c => c.type === 'PERFORMANCE_MAX'), 'spend');
  const stray = rows.filter(r => /brand/i.test(r.group || '') && r.theme !== 'name');
  out.example = ex ? { split: true } : {};
  return { ...out, state: 'connected',
    terms: { shown: { spend: sum(rows, 'spend'), total, count: rows.length }, pmax: total ? { spend: pmax, share: pmax / total } : null,
      nonbrand_sold: { n: rows.filter(r => r.theme !== 'name' && r.orders >= 1).length, of: rows.length },
      stray: stray.length ? { spend: sum(stray, 'spend'), n: stray.length } : null, take: null, themes,
      total: { count: rows.length, spend: sum(rows, 'spend'), clicks: sum(rows, 'clicks'), orders: sum(rows, 'orders'), sales: sum(rows, 'sales') },
      themed_by: junk.size ? 'rules_and_check' : 'rules' },
    /* Triple Whale sales per campaign are not kept yet, so brand against the rest is the example. */
    overview: ex ? { split: ex.overview.split } : null, example_goals: ex ? ex.goals : null };
}

const LEAK_KIND = { 'google_search:negatives': 'block', 'google_pmax:categories': 'block' };
/** Suggestions: the Google rows of the leak finder, read only. They are judged on Google's own count today. */
export async function loadSuggestions(ctx) {
  const out = base(ctx);
  if (!ctx.brand) return { ...out, state: 'no_brand' };
  const r = await ah(ctx, `/api/leaks?act=${encodeURIComponent(ctx.brand.id)}&days=30`);
  if (!r || r.error) return { ...out, state: 'error', error: r && r.error };
  const g = (r.areas && r.areas.google) || {};
  if (g.state === 'not_linked') return { ...out, state: 'not_linked' };
  if (g.state === 'error') return { ...out, state: 'error', error: g.note, fix: g.fix };
  const rows = (r.leaks || []).filter(l => /^google/.test(l.area || '')).sort((a, b) => (b.cost || 0) - (a.cost || 0));
  return { ...out, state: 'connected',
    suggestions: { judged: 'google', note: g.note || null,
      decide: rows.map(l => ({ kind: LEAK_KIND[l.id] || (l.area === 'google_video' ? 'watch' : 'lower'), title: l.title, why: l.number, fix: l.fix, where: l.area === 'google_pmax' ? 'Performance Max' : l.area === 'google_video' ? 'Video and Demand Gen' : 'Search and Shopping',
        open: l.area === 'google_search' ? 'search-terms' : 'overview', open_label: l.area === 'google_search' ? 'See the searches' : 'See the campaign' })),
      watching: [], rules: ['Video and Demand Gen are never judged on last click.'] } };
}

/** Changes made: Google's own change list (it keeps 30 days), already in plain words. */
export async function loadChanges(ctx) {
  const out = base(ctx);
  if (!ctx.brand) return { ...out, state: 'no_brand' };
  const r = await ah(ctx, `/api/google/ads-changes?${q(ctx)}`);
  const state = stateOf(r);
  if (state !== 'connected') return { ...out, state, error: state === 'error' ? r && r.error : null, fix: r && r.fix };
  const all = r.changes || [], shape = c => ({ at: c.at, who: c.who, via: c.via, category: c.category, summary: c.summary });
  /* the rows that do not matter fold together when they say the same thing on the same day */
  const other = [];
  for (const c of all.filter(c => !c.matters)) {
    const k = String(c.at).slice(0, 10) + '|' + c.summary, hit = other.find(o => o.k === k);
    if (hit) hit.n++; else other.push({ k, ...shape(c), n: 1 });
  }
  return { ...out, state: 'connected', changes: { floor: r.floor || null, clamped: !!r.clamped, truncated: !!r.truncated, note: r.note || null, rows: all.filter(c => c.matters).map(shape), other } };
}

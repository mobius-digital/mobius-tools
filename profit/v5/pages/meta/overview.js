/* Ads > Meta > Overview for one brand.
   Four figures, the daily chart, live campaigns with ROAS against goal, the suggestions count, checks.
   Sales and ROAS are Triple Whale's (last platform click). Spend and delivery are Meta's.
   load() returns one plain object (the same shape as _sample/overview.json); render() only draws it. */

import { put } from '../../kit.js';
import { h, svgNode, money, num, pct, x, card, kpi, tiles, button, statusDot, delta, count, gauge, legend, lineChart, table, empty, skeleton, addStyles, sheet } from '../../kit.js';
import { adSheet, adTile, opener, styles } from './_rest.js';
import { def, headRow } from '../platforms/_ads.js';
import { icon } from '../../icons.js';
import { APP_NAME } from '../../config.js';
import { askWhy } from '../home/_biz.js';
import { openAskPanel } from '../../askpanel.js';

/* ---------- small helpers ---------- */
const ok = n => n != null && isFinite(n);
const usd = (n, cur) => money(ok(n) ? Math.round(n) : n, { cur });
const div = (a, b) => (ok(a) && ok(b) && b > 0 ? a / b : null);
const sum = (rows, k) => rows.reduce((t, r) => t + (+r[k] || 0), 0);
const iso = d => d.toISOString().slice(0, 10);
const addDays = (date, n) => { const d = new Date(date + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return iso(d); };
const shortDate = date => new Date(date + 'T12:00:00Z').toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });

/** ROAS against its goal: a word and a tone. */
function roasRead(roas, goal) {
  if (!ok(roas) || !ok(goal) || !(goal > 0)) return null;
  const r = roas / goal;
  return r >= 1 ? ['good', 'Over goal'] : r >= 0.85 ? ['warn', 'Just under'] : r >= 0.6 ? ['bad', 'Under'] : ['bad', 'Far under'];
}
/** A cost against its goal (lower is better). */
function costRead(cost, goal) {
  if (!ok(cost) || !ok(goal) || !(goal > 0)) return null;
  const r = cost / goal;
  return r <= 1 ? ['good', 'Under goal'] : r <= 1.2 ? ['warn', 'Just over'] : r <= 1.6 ? ['bad', 'Over'] : ['bad', 'Far over'];
}

/* ---------- the page's own CSS (layout only; every color and type size is the frame's) ---------- */
const CSS = `
/* the tabs row must not set the page width on a phone (six tabs are wider than the screen) */
.mo-figs,.mo-two,.mo-chart,.mo-camps,.mo-checks{min-width:0}
.mo-figs .lx-kpi>.lx-gauge{margin-top:auto;padding-top:10px}
.mo-ret{display:grid;gap:var(--gap-3,12px);min-width:0;container-type:inline-size}
.mo-sec h2{margin:0;font-size:var(--fs-section,17px);font-weight:600;line-height:1.25}
.mo-l{display:block;font-size:var(--fs-colhead,11.5px);font-weight:600;color:var(--muted)}
.mo-best{display:flex;flex-direction:column;flex:1}
.mo-best:hover{background:var(--row-hover)}
.mo-top .mr-tile{border-radius:var(--r-tbl,12px)}
.mo-chart .lx-legend span.sq::before{width:8px;height:8px;border:0;border-radius:2px;background:var(--line-strong)}
.mo-read{margin:10px 0 0 -13px}
.mo-counts{display:flex;gap:44px;align-items:baseline;flex-wrap:wrap;padding:8px 28px 14px}
.mo-counts span{display:inline-flex;gap:10px;align-items:baseline;color:var(--muted);font-size:13px}
.mo-n{font-size:var(--num-l);font-weight:600;letter-spacing:-.03em;line-height:1.1;color:var(--ink);font-variant-numeric:tabular-nums}
.mo-n.xl{font-size:var(--num-l);letter-spacing:-.03em;line-height:1.1}
.mo-camps .lx-gauge{min-width:150px}
.mo-camps .mo-bar{padding-left:28px}
.mo-camps td.mo-bar{width:220px}
.mo-camps td.mo-st{width:116px}
.mo-two{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:var(--sp-6);align-items:stretch}
.mo-two>.lx-card{display:flex;flex-direction:column}
.mo-sug{padding:6px 28px 0;display:flex;gap:14px;align-items:baseline;color:var(--muted);font-size:13.5px}
.mo-sug-rows{padding:10px 28px 0}
.mo-sug-rows a{display:flex;align-items:center;height:44px;border-bottom:1px solid var(--line);color:inherit;text-decoration:none;font-weight:500}
.mo-sug-rows a:last-child{border-bottom:0}
.mo-sug-rows .lx-count{margin-left:auto}
.mo-go{margin-top:auto;padding:14px 28px 24px}
.mo-quiet{padding:6px 28px 24px;color:var(--muted)}
.mo-top{display:flex;gap:18px;align-items:center;padding:18px 28px 22px}
.mo-top-b{min-width:0;flex:1;display:grid;gap:6px}
.mo-top-b .nm{font-size:13.5px;font-weight:500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.mo-top-b .r{display:flex;flex-wrap:wrap;gap:4px 10px;align-items:baseline;color:var(--muted);font-size:13px}
.mo-top-b .r .lx-stat{margin-left:auto}
.mo-thumb{width:76px;height:95px;border-radius:var(--r-tbl,12px);background:var(--bg-sunk);display:inline-flex;align-items:center;justify-content:center;flex:none}
.mo-thumb svg{width:22px;height:22px;fill:var(--faint);stroke:none}
.mo-three{margin-top:auto;display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:16px;padding:22px 28px 28px;border-top:1px solid var(--line)}
.mo-three .mo-n{font-size:var(--num-m,18px);display:block;margin-top:4px}
.mo-checks-g{display:grid;grid-template-columns:1.5fr 1fr 1fr 1fr;gap:40px;align-items:start}
.mo-checks-g .row{display:flex;gap:10px;align-items:baseline;margin:4px 0 10px;color:var(--muted);font-size:13px;font-variant-numeric:tabular-nums;flex-wrap:wrap}
.mo-word{display:flex;align-items:center;gap:9px;margin-top:4px;height:33px;font-size:22px;font-weight:600;letter-spacing:-.02em}
.mo-word i{width:10px;height:10px;border-radius:50%;background:var(--good);box-shadow:0 0 0 4px var(--good-bg)}
.mo-word.warn i{background:var(--watch);box-shadow:0 0 0 4px rgba(232,181,0,.2)}
.mo-word.bad i{background:var(--bad);box-shadow:0 0 0 4px var(--bad-bg)}
.mo-none{color:var(--muted);font-size:13px;margin-top:6px}
.mo-wk{display:block;margin-top:8px;font-size:var(--fs-small,12.5px);color:var(--muted);font-variant-numeric:tabular-nums}
.mo-wk b{color:var(--ink);font-weight:600}
.mo-aday{display:block;color:var(--muted)}
.mo-camps th.mo-cn{width:40%}
.mo-cnm{display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:2;overflow:hidden;white-space:normal;overflow-wrap:anywhere}
.mo-checks .mo-checks-g{margin-top:16px}
button.mo-open{border:0;background:transparent;font:inherit;padding:2px 6px;margin-left:-6px;border-radius:var(--r-chip,6px);cursor:pointer;color:var(--muted);text-align:left}
button.mo-open:hover{background:var(--row-hover)}
.mo-sh{display:grid;gap:16px}
.mo-sh .g{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}
.mo-sh .g>div{display:grid;gap:3px;padding:12px 14px;border-radius:var(--r-tbl,12px);background:var(--surface-2)}
.mo-sh .g .l{font-size:12px;color:var(--muted)}.mo-sh .g b{font-size:var(--num-s);font-variant-numeric:tabular-nums}
.mo-sh h3{margin:0 0 8px;font-size:13px;font-weight:600;color:var(--muted)}
.mo-sh-ads{display:grid;border-radius:var(--r-tbl,12px);box-shadow:inset 0 0 0 1px var(--line);overflow:hidden}
.mo-sh-ads>div{display:flex;justify-content:space-between;gap:12px;padding:10px 14px;border-top:1px solid var(--line);font-size:var(--fs-table)}
.mo-sh-ads>div:first-child{border-top:0}
@media (max-width:759px){.mo-sh .g{grid-template-columns:repeat(2,minmax(0,1fr))}}
@media (max-width:1040px){
  .mo-checks-g{grid-template-columns:repeat(2,minmax(0,1fr));gap:28px}
}
@media (max-width:759px){
  .mo-camps .lx-table{table-layout:auto;width:100%}
  .mo-camps th.mo-cn{width:auto}
  .mo-camps .lx-table th,.mo-camps .lx-table td{padding-left:6px;padding-right:6px}
  .mo-camps .lx-table th:first-child,.mo-camps .lx-table td:first-child{padding-left:16px;min-width:44vw}
  .mo-camps .lx-table th:last-child,.mo-camps .lx-table td:last-child{padding-right:16px}
  .mo-chart .lx-legend{gap:8px 14px;font-size:12px}
  .mo-counts{gap:20px;padding:6px 18px 12px}
  .mo-two{grid-template-columns:1fr;gap:var(--sp-4)}
  .mo-camps td.mo-st{width:auto}
  .mo-camps .lx-table td{white-space:normal}
  .mo-camps .lx-table td.num,.mo-camps .lx-stat{white-space:nowrap}
  .mo-sug,.mo-sug-rows{padding-left:18px;padding-right:18px}
  .mo-go{padding:14px 18px 18px}.mo-go .lx-btn{width:100%}
  .mo-quiet{padding:6px 18px 18px}
  .mo-top{padding:14px 18px 18px;gap:14px}
  .mo-three{padding:16px 18px 18px}
  .mo-checks-g{gap:22px 18px}
}
@media (max-width:519px){
  .mo-camps .lx-table td.mo-st,.mo-camps .lx-table th.mo-st{width:22px;padding-left:2px;padding-right:14px}
  .mo-camps td.mo-st .lx-stat{font-size:0;gap:0;vertical-align:middle}
  .mo-camps td.mo-st .lx-stat::before{margin-top:0}
  .mo-camps .lx-table th:first-child,.mo-camps .lx-table td:first-child{min-width:0}
}`;
function css() {
  styles();
  addStyles('mo-css', CSS);
}

/* ---------- load: real mode ---------- */
const CALL_LABEL = { cut: 'Turn off', scale: 'Raise budget', refresh: 'New ads needed', trim: 'Trim', mixed: 'Look closer' };

/* the period of the same length that ends the day before w starts */
const prevOf = w => { const n = Math.round((new Date(w.to + 'T12:00:00Z') - new Date(w.from + 'T12:00:00Z')) / 864e5) + 1; const to = addDays(w.from, -1); return { from: addDays(to, -(n - 1)), to }; };
const label = w => {
  const a = new Date(w.from + 'T12:00:00Z'), b = new Date(w.to + 'T12:00:00Z');
  const m = d => d.toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' });
  return w.from === w.to ? shortDate(w.from) : a.getUTCMonth() === b.getUTCMonth() ? `${m(a)} ${a.getUTCDate()} to ${b.getUTCDate()}` : `${shortDate(w.from)} to ${shortDate(w.to)}`;
};

async function load(ctx) {
  const act = encodeURIComponent(ctx.brand.id);
  /* the dates come from the page head; act is the brand id from the brands endpoint */
  const w = { from: ctx.range.from, to: ctx.range.to };
  const wk = { from: addDays(w.to, -6), to: w.to };
  const paid = q => ctx.api(`/api/hub/paid?platform=meta&act=${act}&model=lastPlatformClick&cmp=prev&from=${q.from}&to=${q.to}`, { worker: 'profit', signal: ctx.signal });
  const soft = p => p.catch(e => { if (e && e.name === 'AbortError') throw e; return null; });
  const [main, week, live, calls] = await Promise.all([
    paid(w),
    soft(paid(wk)),
    soft(ctx.api(`/api/meta/live?act=${act}`, { worker: 'ah', signal: ctx.signal })),
    ctx.isClient ? null : soft(ctx.api(`/api/buyer-list?act=${act}`, { worker: 'ah', signal: ctx.signal })),
  ]);
  const b = main && main.brands && main.brands[0];
  if (!b) return { window: { ...w, label: label(w) }, connected: false };
  const cur = b.cur || {}, goals = b.goals || {};
  const series = (b.series || []).map(d => ({ date: d.date, spend: d.spend, revenue: d.revenue }));
  const salesSource = !cur.attr_pending && (cur.revenue > 0 || series.some(d => d.revenue > 0));

  /* live structure, straight from Meta */
  let liveCounts = null, atLimit = null, atLimitSets = null;
  const liveCamp = (live && !live.error && live.campaigns) || null;
  if (liveCamp) {
    const on = o => Object.values(o || {}).filter(v => v.eff === 'ACTIVE');
    const ads = on(live.ads);
    liveCounts = { campaigns: on(live.campaigns).length, adsets: on(live.adsets).length, ads: ads.length };
    const perSet = {};
    for (const a of Object.values(live.ads || {})) if (a.status === 'ACTIVE') perSet[a.adset] = (perSet[a.adset] || 0) + 1;
    atLimit = Object.values(perSet).filter(n => n >= 50).length;
    atLimitSets = Object.entries(perSet).filter(([, n]) => n >= 50).map(([id, n]) => { const st = (live.adsets || {})[id] || {}; return { name: st.name || id, campaign: ((live.campaigns || {})[st.campaign] || {}).name || '', n }; });
  }
  /* a campaign's budget a day: its own, else the sum of its live ad sets' */
  const budgetOf = id => {
    if (!liveCamp) return null;
    const c = liveCamp[id];
    if (c && c.daily) return c.daily;
    const sets = Object.values(live.adsets || {}).filter(v => v.campaign === id && v.eff === 'ACTIVE' && v.daily);
    return sets.length ? sets.reduce((t, v) => t + v.daily, 0) : null;
  };
  const seen = new Set();
  const campaigns = [];
  for (const c of b.campaigns || []) {
    seen.add(String(c.id));
    const isLive = liveCamp ? !!(liveCamp[c.id] && liveCamp[c.id].eff === 'ACTIVE') : String(c.status || '').toUpperCase() === 'ACTIVE';
    if (!isLive) continue;
    const lead = /LEAD/.test(c.objective || '');
    const sets = (c.adsets || []);
    const topAds = sets.flatMap(st => (st.ads || []).map(a => ({ name: a.name, spend: a.spend, roas: a.roas, purchases: a.purchases }))).sort((p, q) => (q.spend || 0) - (p.spend || 0)).slice(0, 3);
    campaigns.push({ id: c.id, name: c.name, budget: budgetOf(c.id) ?? (ok(c.budget) ? c.budget : null), spend: c.spend, revenue: lead ? null : c.revenue, roas: lead ? null : c.roas,
      purchases: lead ? null : c.purchases ?? null, leads: lead ? c.leads : null, cpl: lead ? c.cpl : null,
      n_sets: liveCamp ? Object.values(live.adsets || {}).filter(v => v.campaign === c.id && v.eff === 'ACTIVE').length : sets.length || null,
      n_ads: liveCamp ? Object.values(live.ads || {}).filter(v => v.campaign === c.id && v.eff === 'ACTIVE').length : null, top_ads: topAds });
  }
  if (liveCamp) for (const [id, c] of Object.entries(liveCamp)) {
    if (seen.has(String(id)) || c.eff !== 'ACTIVE') continue;
    campaigns.push({ id, name: c.name, budget: budgetOf(id), spend: 0, revenue: 0, roas: null, waiting: 'no spend yet' });
  }
  campaigns.sort((p, q) => q.spend - p.spend);

  /* suggestions: today's calls from the rules, Meta only */
  let suggestions = null;
  if (calls && Array.isArray(calls.rows)) {
    const by = {};
    for (const r of calls.rows) if (CALL_LABEL[r.kind] && !r.decision) by[r.kind] = (by[r.kind] || 0) + 1;
    const groups = Object.keys(CALL_LABEL).filter(k => by[k]).map(k => ({ label: CALL_LABEL[k], n: by[k] }));
    suggestions = { total: groups.reduce((t, g) => t + g.n, 0), groups };
  }

  /* this week: last 7 days against the 7 before; and the best ad of those 7 days */
  let weekOut = null, top = null;
  const wb = week && week.brands && week.brands[0];
  if (wb && wb.cur) {
    weekOut = { roas: wb.cur.roas, revenue: wb.cur.revenue ?? null, revenue_delta: wb.prev && wb.prev.revenue > 0 && ok(wb.cur.revenue) ? wb.cur.revenue / wb.prev.revenue - 1 : null };
    const floor = Math.max(50, goals.cpa || 0);
    const ads = (wb.campaigns || []).flatMap(c => (c.adsets || []).flatMap(st => st.ads || [])).filter(a => a.purchases >= 2 && a.spend >= floor && ok(a.roas));
    ads.sort((p, q) => q.roas - p.roas);
    if (ads[0]) top = { id: ads[0].id, name: ads[0].name, video: ads[0].media_type === 'video', roas: ads[0].roas, orders: ads[0].purchases, revenue: ads[0].revenue, spend: ads[0].spend };
  }

  /* the period of the same length just before (cmp=prev), so a delta compares like with like */
  const pv = b.prev || null, pw = prevOf(w);
  return {
    window: { ...w, label: label(w) }, currency: b.currency || 'USD', connected: true, sales_source: salesSource,
    prev: pv ? { ...pw, revenue: pv.revenue ?? null, spend: pv.sales_spend ?? pv.spend ?? null } : null,
    goals: { metric: goals.metric || null, roas: goals.roas || null, cpa: goals.cpa || null, ncpa: goals.ncpa || null },
    totals: { spend: cur.sales_spend ?? cur.spend, revenue: cur.revenue, roas: cur.roas, purchases: cur.purchases, cpa: cur.cpa, days: series.length || null, lead_spend: cur.lead_spend || null },
    week: weekOut, new_customers: null, series, note: null,
    live: liveCounts, live_error: live && live.error ? live.error : null,
    campaigns, budget_total: campaigns.some(c => ok(c.budget)) ? sum(campaigns, 'budget') : null,
    suggestions, top_ad: top,
    checks: { limit: null, tracking: null, learning: null, at_limit: atLimit, at_limit_sets: atLimitSets },
  };
}

/* ---------- the figures: "Return on Meta ads" ---------- */
const TW = 'Triple Whale, last click';
const TWS = 'Triple Whale';
const chg = (now, then) => (ok(now) && ok(then) && then > 0 ? now / then - 1 : null);
const updown = n => (n < 0 ? 'down ' : 'up ') + pct(Math.abs(n));
function figures(d, ctx) {
  const cur = d.currency, t = d.totals || {}, g = d.goals || {}, wk = d.week || {}, wl = d.window ? d.window.label : null;
  const noSales = !d.sales_source, rows = d.series || [], dates = rows.map(r => shortDate(r.date));
  const pv = d.prev, pl = pv && pv.from ? label(pv) : 'the days before';
  const none = h('small', null, 'No sales source connected');
  /* a second, labeled line under a tile: the last 7 days on their own, never mixed into the tile's own window */
  const wkLine = (...kids) => h('span', { class: 'mo-wk' }, ...kids);
  const out = [];
  const sd = chg(t.spend, pv && pv.spend);
  out.push(kpi({ label: 'Spend', value: usd(t.spend, cur), href: ctx.href('meta', 'live-now'),
    sub: [ok(sd) ? [delta(sd, { plain: true, text: updown(sd) }), ' vs ' + pl] : null, ok(t.spend) && t.days ? h('span', { class: 'mo-aday' }, usd(t.spend / t.days, cur) + ' a day') : null],
    window: wl, source: 'Meta', spark: rows.map(r => r.spend), sparkLabels: dates, sparkFormat: v => usd(v, cur) }));
  const rd = chg(t.revenue, pv && pv.revenue);
  const salesTile = kpi({ label: 'Sales from Meta ads', value: noSales ? none : usd(t.revenue, cur), href: ctx.href('meta', 'top-ads'),
    sub: noSales || !ok(rd) ? '' : [delta(rd, { bad: rd < 0, text: updown(rd) }), ' vs ' + pl],
    window: wl, source: noSales ? null : TWS, spark: noSales ? null : rows.map(r => r.revenue), sparkLabels: dates, sparkFormat: v => usd(v, cur) });
  if (!noSales && ok(wk.revenue_delta)) salesTile.append(wkLine('Last 7 days: ', ok(wk.revenue) ? h('b', null, usd(wk.revenue, cur)) : null, ok(wk.revenue) ? ', ' : '', updown(wk.revenue_delta) + ' vs the 7 before'));
  out.push(salesTile);
  const rr = roasRead(t.roas, g.roas);
  /* the dot judges the big number above it, for these dates; the last 7 days sit on their own labeled line */
  const roasTile = kpi({ label: def('ROAS', 'roas'), value: noSales ? none : x(t.roas), href: ctx.href('meta', 'top-ads'),
    sub: noSales ? '' : rr ? statusDot(rr[0], `${rr[1]}, goal ${x(g.roas)}`) : 'No goal set', window: wl, source: noSales ? null : TWS,
    /* day by day ROAS, the same sparkline as Spend and Sales, so the four tiles read as one row */
    spark: noSales ? null : rows.map(r => r.spend > 0 && ok(r.revenue) ? r.revenue / r.spend : null), sparkLabels: dates, sparkFormat: v => x(v) });
  if (!noSales && ok(wk.roas)) roasTile.append(wkLine('Last 7 days: ', h('b', null, x(wk.roas))));
  out.push(roasTile);
  /* cost per new customer when the count is known; else cost per sale, which is always known */
  const nc = d.new_customers;
  const cost = nc ? nc.cost : t.cpa, goal = nc ? (nc.goal || g.ncpa) : g.cpa;
  const cr = costRead(cost, goal);
  const costTile = kpi({ label: def(nc ? 'New customer cost' : 'Cost per sale', nc ? 'new_customer_cost' : 'cpa'), value: noSales ? none : usd(cost, cur), href: ctx.href('customers', 'snapshot'),
    sub: noSales ? '' : [cr && statusDot(cr[0], cr[1]), nc ? ' ' + num(nc.count) + ' new customers' : ok(t.purchases) ? ' ' + num(t.purchases) + ' sales' : ''], window: wl, source: noSales ? null : TWS });
  if (!noSales && ok(cost) && goal) costTile.append(gauge({ value: cost, max: Math.max(cost, goal) * 1.1, goal, ticks: [{ side: 'l', text: usd(0, cur) }, { at: goal, text: 'goal ' + usd(goal, cur), on: true }] }));
  out.push(costTile);
  return h('section', { class: 'mo-ret' },
    h('div', { class: 'lx-sec mo-sec' }, h('h2', null, 'Return on Meta ads'), h('span', { class: 'note' }, (wl || 'These dates') + ' · sales ' + TW + ', spend Meta')),
    tiles(out, { cols: 4, class: 'mo-figs' }));
}

/* ---------- the daily chart: spend columns, sales (the lead line), and the sales the goal needs ---------- */
function chartCard(d, ctx) {
  const rows = d.series || [], cur = d.currency, goal = d.goals && d.goals.roas, hasSales = !!d.sales_source;
  const spend = rows.map(r => +r.spend || 0), sales = rows.map(r => +r.revenue || 0);
  const lg = legend([hasSales && { name: 'Sales from Meta ads', lead: true }, hasSales && goal && { name: `Sales needed for a ${x(goal)} ROAS`, dashed: true }, { name: 'Spend', square: true }]);
  const b = v => h('b', null, v);
  const plot = lineChart({
    slots: false,
    series: [
      { type: 'bar', tone: 'dim', name: 'Spend', values: spend },
      hasSales && { name: 'Sales from Meta ads', lead: true, values: sales, end: v => usd(v, cur) },
      hasSales && goal && { name: 'Sales needed', dashed: true, values: spend.map(v => v * goal), end: v => usd(v, cur) + ' needed' },
    ],
    labels: rows.map(r => shortDate(r.date)),
    note: d.note ? { index: rows.findIndex(r => r.date === d.note.date), text: d.note.text } : null,
    format: v => money(v, { cur, compact: true }),
    windowLabel: 'Daily, ' + (d.window ? d.window.label : ''), name: 'Meta',
    height: 360, empty: 'No spend on these dates',
    label: `Meta spend${hasSales ? ', sales from Meta ads' : ''}${goal && hasSales ? ' and the sales needed to hit the goal' : ''}, by day, ${d.window ? d.window.label : ''}`,
    hover: i => [b(shortDate(rows[i].date)), h('span', null, 'Spend ', b(usd(spend[i], cur))), hasSales ? h('span', null, 'Sales ', b(usd(sales[i], cur))) : null,
      hasSales && spend[i] > 0 ? h('span', null, 'ROAS ', b(x(sales[i] / spend[i]))) : null],
  });
  return card({ class: 'mo-chart' },
    h('div', { class: 'lx-chart-h' },
      h('div', null, h('div', { class: 'lx-sec' }, h('h3', null, hasSales ? 'Sales and spend by day' : 'Spend by day')),
        h('p', null, hasSales ? 'Sales ' + TW + ', spend Meta' : 'No sales source connected, so this is spend only')),
      lg),
    plot,
    ctx.isClient ? null : h('div', { class: 'mo-read' }, h('button', { class: 'lx-btn ghost', type: 'button', onclick: () => openAskPanel({ route: ctx.route, brand: ctx.brand || null, title: 'Meta overview', range: ctx.range, window: ctx.askWindow, href: ctx.href('ask', 'index'), context: ctx.askContext }) }, h('span', { class: 'lx-gem sm' }, svgNode(icon('sparkle'))), 'Read this for me')));
}

/* ---------- live campaigns ---------- */
function goalBar(roas, goal) {
  if (!ok(roas) || !goal) return null;
  return gauge({ value: roas, max: Math.max(goal * 1.2, roas * 1.05), goal, thin: true });
}
function campaignsCard(d, ctx) {
  const cur = d.currency, goal = d.goals && d.goals.roas, noSales = !d.sales_source;
  const all = d.campaigns || [];
  let expanded = !!ctx.settingNow('meta.overview.all', false);
  const t = d.totals || {};
  const total = all.length ? { total: true, name: 'All of Meta', budget: d.budget_total, spend: t.spend, revenue: t.revenue, roas: t.roas } : null;
  const live = d.live;
  /* the word is also the dot's hover title: on a phone (under 520px) only the dot shows, so nothing is clipped */
  const titled = el => { if (el) el.title = el.textContent; return el; };
  const stat = r => titled(statInner(r));
  const statInner = r => {
    if (r.waiting) return statusDot('off', 'Waiting');
    if (ok(r.cpl)) return statusDot('info', 'Leads');
    if (noSales) return null;
    const rr = roasRead(r.roas, goal);
    return rr ? statusDot(rr[0], rr[1]) : null;
  };
  const tbl = () => table({
    roomy: true, empty: 'No live campaigns',
    cols: [
      { key: 'name', label: 'Campaign', class: 'name mo-cn', render: r => h('span', { class: 'mo-cnm', title: r.name }, r.name) },
      { key: 'budget', label: 'Budget a day', num: true, class: 'hide-md', render: r => ok(r.budget) ? usd(r.budget, cur) : h('span', { class: 'dim' }, 'not set') },
      { key: 'spend', label: 'Spend', num: true, render: r => r.spend > 0 || r.total ? usd(r.spend, cur) : h('span', { class: 'dim' }, usd(0, cur)) },
      { key: 'revenue', label: 'Sales from its ads', num: true, class: 'hide-sm', render: r => noSales || r.revenue == null ? h('span', { class: 'dim' }, noSales ? 'no source' : '') : r.spend > 0 || r.total ? usd(r.revenue, cur) : h('span', { class: 'dim' }, usd(0, cur)) },
      { key: 'roas', label: def('ROAS', 'roas'), num: true, render: r => r.waiting ? h('span', { class: 'dim' }, r.waiting) : ok(r.cpl) ? h('span', { class: 'dim' }, money(r.cpl, { cur }) + ' a lead') : noSales ? h('span', { class: 'dim' }, 'no source') : ok(r.roas) ? h('span', { class: 'strong' }, x(r.roas)) : '' },
      { key: 'bar', label: def(goal ? 'Against goal ' + x(goal) : 'Against goal', 'goal_roas'), class: 'mo-bar hide-sm', render: r => r.waiting || noSales || ok(r.cpl) ? null : goalBar(r.roas, goal) },
      { key: 'status', label: '', class: 'mo-st', render: stat },
    ],
    rows: expanded || all.length <= 4 ? all : all.slice(0, 4), total,
    onRow: r => campaignSheet(r, d, ctx),
  });
  const box = h('div');
  const paint = () => put(box, tbl(), all.length > 4 ? h('div', { class: 'mr-more', style: { padding: '8px 0 14px' } },
    button(expanded ? 'Show the top 4' : `Show all ${all.length} campaigns`, { onclick: () => { expanded = !expanded; ctx.saveSetting('meta.overview.all', expanded); paint(); } })) : null);
  paint();
  return card({ title: 'Live now', note: (d.window ? d.window.label + ' · ' : '') + (noSales ? 'spend Meta' : 'sales and ROAS ' + TW), flush: true, class: 'mo-camps', action: h('a', { href: ctx.href('meta', 'live-now') }, 'Open Live now') },
    live ? h('div', { class: 'mo-counts' },
      h('span', null, h('b', { class: 'mo-n' }, num(live.campaigns)), 'campaigns'),
      h('span', null, h('b', { class: 'mo-n' }, num(live.adsets)), 'ad sets'),
      h('span', null, h('b', { class: 'mo-n' }, num(live.ads)), 'ads'))
      : h('div', { class: 'mo-counts' }, h('span', null, d.live_error || 'Could not read the live counts from Meta just now')),
    box);
}
/* one campaign, every figure: a kit sheet (centered on a desktop, from the bottom on a phone) */
function campaignSheet(c, d, ctx) {
  const cur = d.currency, goal = d.goals && d.goals.roas, wl = d.window ? d.window.label : 'these dates';
  const kv = (label, key, value) => h('div', null, h('span', { class: 'l' }, def(label, key)), h('b', null, value));
  sheet({ title: c.name, body: h('div', { class: 'mo-sh' },
    h('p', { class: 'mr-dim' }, 'Meta campaign, ' + wl + ' · sales and ROAS ' + TW + ', spend Meta'),
    h('div', { class: 'g' },
      kv('Budget a day', 'budget_a_day', ok(c.budget) ? usd(c.budget, cur) : 'not set'),
      kv('Spend', 'ad_spend', usd(c.spend, cur)),
      ok(c.cpl) ? kv('Cost per lead', { title: 'Cost per lead', body: 'Spend divided by the leads Meta counts.' }, money(c.cpl, { cur })) : kv('Sales', 'sales', ok(c.revenue) ? usd(c.revenue, cur) : 'none'),
      ok(c.cpl) ? null : kv('ROAS', 'roas', ok(c.roas) ? x(c.roas) + (goal ? ', goal ' + x(goal) : '') : 'none'),
      ok(c.purchases) ? kv('Orders', 'purchases_last_click', num(c.purchases)) : null,
      ok(c.n_sets) ? kv('Ad sets on', { title: 'Ad sets on', body: 'Ad sets in this campaign that are switched on in Meta right now.' }, num(c.n_sets)) : null,
      ok(c.n_ads) ? kv('Ads on', { title: 'Ads on', body: 'Ads in this campaign that are switched on in Meta right now.' }, num(c.n_ads)) : null),
    !ok(c.cpl) && goal && ok(c.roas) ? goalBar(c.roas, goal) : null,
    (c.top_ads || []).length ? h('div', null, h('h3', null, 'Its top ads by spend'), h('div', { class: 'mo-sh-ads' }, c.top_ads.map(a => h('div', null, h('span', null, a.name), h('b', null, usd(a.spend, cur) + (ok(a.roas) ? ', ROAS ' + x(a.roas) : '')))))) : null,
    h('div', null, button('Open it in Live now', { href: ctx.href('meta', 'live-now') }))) });
}

/* ---------- suggestions and the top ad ---------- */
function suggestionsCard(d, ctx) {
  const sg = d.suggestions, to = ctx.href('meta', 'suggestions');
  if (!sg) return card({ title: 'Suggestions', note: 'Meta only', flush: true }, h('p', { class: 'mo-quiet' }, 'Suggestions are for the team. Nothing for you to decide here.'));
  if (!sg.total) return card({ title: 'Suggestions', note: 'Meta only', flush: true }, h('div', { class: 'mo-sug' }, h('span', { class: 'mo-n xl' }, '0'), 'to decide'), h('p', { class: 'mo-quiet' }, 'Nothing to decide today.'));
  return card({ title: 'Suggestions', note: 'Meta only', flush: true },
    h('div', { class: 'mo-sug' }, h('span', { class: 'mo-n xl' }, num(sg.total)), 'to decide'),
    h('div', { class: 'mo-sug-rows' }, sg.groups.map(g => h('a', { href: to }, g.label, count(g.n)))),
    h('div', { class: 'mo-go' }, button(sg.total === 1 ? 'Review it' : `Review all ${sg.total}`, { primary: true, large: true, icon: 'arrow', href: to })));
}
function topAdCard(d, ctx) {
  const a = d.top_ad, cur = d.currency, goal = d.goals && d.goals.roas;
  const act = h('a', { href: ctx.href('meta', 'top-ads') }, 'Open Best ads');
  const wk = d.window && d.window.to ? { from: addDays(d.window.to, -6), to: d.window.to } : null;
  const note = (wk ? 'Last 7 days, ' + label(wk) : 'Last 7 days') + ' · ' + TW;
  if (!a) return card({ title: 'Best ad', note, flush: true, action: act },
    h('p', { class: 'mo-quiet' }, d.sales_source ? 'No ad has two sales and enough spend to call yet this week.' : 'No sales source connected, so no ad can be ranked on sales.'));
  const rr = roasRead(a.roas, goal);
  const body = opener(h('div', { class: 'mo-best' },
    h('div', { class: 'mo-top' },
      adTile(a, 'lg'),
      h('div', { class: 'mo-top-b' },
        h('div', { class: 'nm', title: a.name }, a.name),
        h('div', { class: 'r' }, h('span', { class: 'mo-n' }, x(a.roas)), 'ROAS', rr && statusDot(rr[0], rr[1])),
        goal ? gauge({ value: a.roas, max: Math.max(goal * 1.6, a.roas * 1.1), goal, thin: true, tone: rr && rr[0] === 'good' ? 'good' : '', ticks: [{ side: 'l', text: '0' }, { at: goal, text: 'goal ' + x(goal), on: true }] }) : null)),
    h('div', { class: 'mo-three' },
      h('div', null, h('span', { class: 'mo-l' }, 'Orders'), h('span', { class: 'mo-n' }, num(a.orders))),
      h('div', null, h('span', { class: 'mo-l' }, 'Sales'), h('span', { class: 'mo-n' }, usd(a.revenue, cur))),
      h('div', null, h('span', { class: 'mo-l' }, 'Spend'), h('span', { class: 'mo-n' }, usd(a.spend, cur))))),
  () => adSheet({ ...a, purchases: a.orders }, { window: wk ? { ...wk, label: label(wk) } : d.window, goals: d.goals, currency: cur }, ctx), 'Open ' + a.name);
  return card({ title: 'Best ad', note, flush: true, action: act, class: 'mo-bestc' }, body);
}

/* ---------- checks ---------- */
function checksBand(d, ctx) {
  const c = d.checks || {}, cur = d.currency;
  const none = text => h('p', { class: 'mo-none' }, text);
  const TRACK = { good: 'Healthy', warn: 'Check it', bad: 'Broken' };
  const lim = c.limit && c.limit.limit > 0 ? c.limit : null;
  const list = (title, rows) => () => sheet({ title, side: 'center', body: h('div', { class: 'mo-sh-ads' }, rows.map(r => h('div', null, h('span', null, r.name, r.campaign ? h('small', { class: 'mr-dim' }, ' in ' + r.campaign) : null), r.n ? h('b', null, r.n + ' ads on') : null))) });
  const val = (rows, title, kids) => rows && rows.length ? h('button', { type: 'button', class: 'row mo-open', onclick: list(title, rows), title: 'See which ad sets' }, kids) : h('div', { class: 'row' }, kids);
  return card({ title: 'Account checks', note: 'Meta, right now', class: 'mo-checks' },
    h('div', { class: 'mo-checks-g' },
      h('div', null, h('div', { class: 'mo-l' }, def('Daily spend limit', 'daily_account_limit')),
        lim ? [h('div', { class: 'row' }, h('span', { class: 'mo-n' }, pct(lim.used / lim.limit)), `${usd(lim.used, cur)} of ${usd(lim.limit, cur)} today`), gauge({ value: lim.used, max: lim.limit, thin: true, tone: lim.used / lim.limit >= 0.9 ? 'bad' : '' })]
          : none('Not read from Meta yet')),
      h('div', null, h('div', { class: 'mo-l' }, def('Tracking', 'tracking')),
        c.tracking ? h('div', { class: 'mo-word ' + (c.tracking === 'good' ? '' : c.tracking) }, h('i'), TRACK[c.tracking] || c.tracking) : none('Not checked yet')),
      h('div', null, h('div', { class: 'mo-l' }, def('Still learning', 'still_learning')),
        c.learning ? val(c.learning.sets, 'Ad sets still learning', [h('span', { class: 'mo-n' }, num(c.learning.n)), `of ${num(c.learning.of)} ad sets`]) : none('Not read from Meta yet')),
      h('div', null, h('div', { class: 'mo-l' }, def('At the 50 ad limit', 'ad_limit_50')),
        ok(c.at_limit) ? val(c.at_limit_sets, 'Ad sets at the 50 ad limit', [h('span', { class: 'mo-n' }, num(c.at_limit)), c.at_limit === 1 ? 'ad set' : 'ad sets']) : none('Not read from Meta yet'))));
}

const HELP = [
  { title: 'What it is for', text: 'Whether Facebook and Instagram ads pay for themselves on the dates in the page head: spend, the sales Triple Whale credits to Meta, ROAS against the goal, the live campaigns and the account checks. Tap a campaign for all of its numbers.' },
  { title: 'Where the numbers come from', text: "Sales and ROAS are Triple Whale, last click per platform. Spend, budgets and the account checks are Meta's. Hover or tap any dotted label for its meaning." },
];
export default {
  /* the plain question, drawn by the shell above the tabs */
  title: 'Meta ads',
  eyebrow: 'Meta',
  load,
  skeleton(el) {
    put(el, h('div', { class: 'lx-skel-grid' }, skeleton('kpi', 4)), skeleton('chart', 1), skeleton('row', 5));
  },
  render(el, d, ctx) {
    css();
    if (!ctx.brand) return put(el, empty({ title: 'Pick a brand', text: 'Meta overview is one brand at a time.' }));
    if (!d || d.connected === false) {
      return put(el, empty({ title: 'No Meta ad account connected', text: 'Connect this brand\'s Meta ad account and its spend, sales and campaigns show here.',
        action: ctx.isClient ? null : button('Open integrations', { primary: true, href: ctx.href('brand-settings', 'integrations') }) }));
    }
    const hasSpend = ok(d.totals && d.totals.spend) && d.totals.spend > 0;
    if (!hasSpend && !(d.campaigns || []).length) {
      return put(el, empty({ title: 'No Meta spend on these dates', text: `Nothing spent ${d.window ? d.window.label : 'on these dates'} and no campaign is live.`,
        action: ctx.legacy ? button('Open it in old ' + APP_NAME, { href: ctx.legacy }) : null }));
    }
    const t = d.totals || {}, g = d.goals || {};
    ctx.askWindow = d.window && d.window.label ? d.window.label : null;
    ctx.askContext = `Meta for ${ctx.brand.name || 'this brand'}, ${d.window ? d.window.label : 'these dates'}: spend ${usd(t.spend, d.currency)}`
      + (d.sales_source ? `, sales from Meta ads ${usd(t.revenue, d.currency)} (Triple Whale last click), ROAS ${x(t.roas)}${g.roas ? ' against a ' + x(g.roas) + ' goal' : ''}` : ', no sales source connected')
      + `. ${(d.campaigns || []).length} live campaigns${d.suggestions ? ', ' + d.suggestions.total + ' suggestions to decide' : ''}.`;
    put(el, ...[
      headRow({ help: HELP, ask: ctx.isClient ? null : askWhy(ctx, 'How is Meta doing, and why?') }),
      figures(d, ctx),
      chartCard(d, ctx),
      campaignsCard(d, ctx),
      /* suggestions are for the team; a client sees the top ad alone */
      ctx.isClient ? topAdCard(d, ctx) : h('div', { class: 'mo-two' }, suggestionsCard(d, ctx), topAdCard(d, ctx)),
      checksBand(d, ctx),
    ].filter(Boolean));
  },
};

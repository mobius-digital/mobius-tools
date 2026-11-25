/* Ads > Meta > Overview for one brand.
   Four figures, the daily chart, live campaigns with ROAS against goal, the suggestions count, checks.
   Sales and ROAS are Triple Whale's (last platform click). Spend and delivery are Meta's.
   load() returns one plain object (the same shape as _sample/overview.json); render() only draws it. */

import { put } from '../../kit.js';
import { h, em, svgNode, money, num, pct, x, card, takeaway, button, statusDot, delta, count, gauge, sparkline, legend, lineChart, table, empty, skeleton, addStyles } from '../../kit.js';
import { icon } from '../../icons.js';
import { APP_NAME } from '../../config.js';

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

/* ---------- the page's own CSS (layout only; every colour and type size is the frame's) ---------- */
const CSS = `
/* the tabs row must not set the page width on a phone (six tabs are wider than the screen) */
.mo-figs,.mo-two,.mo-chart,.mo-camps,.mo-checks{min-width:0}
.mo-figs{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:var(--sp-8)}
.mo-figs .lx-gauge{margin-top:22px}
.mo-figs .lx-kpi .v{font-size:clamp(30px,3.4vw,44px)}
.mo-chart .lx-legend span.sq::before{width:8px;height:8px;border:0;border-radius:2px;background:#D9DDE6}
.mo-read{margin:10px 0 0 -13px}
.mo-counts{display:flex;gap:44px;align-items:baseline;flex-wrap:wrap;padding:8px 28px 14px}
.mo-counts span{display:inline-flex;gap:10px;align-items:baseline;color:var(--muted);font-size:13px}
.mo-n{font-size:28px;font-weight:600;letter-spacing:-.03em;line-height:1.1;color:var(--ink);font-variant-numeric:tabular-nums}
.mo-n.xl{font-size:44px;letter-spacing:-.04em;line-height:1}
.mo-camps .lx-gauge{min-width:150px}
.mo-camps .mo-bar{padding-left:28px}
.mo-camps td.mo-bar{width:220px}
.mo-camps td.mo-st{width:116px}
.mo-camps tr.total .lx-gauge-track{background:#E4E2DC}
.mo-two{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:var(--sp-6);align-items:stretch}
.mo-two>.lx-card{display:flex;flex-direction:column}
.mo-sug{padding:6px 28px 0;display:flex;gap:14px;align-items:baseline;color:var(--muted);font-size:13.5px}
.mo-sug-rows{padding:10px 28px 0}
.mo-sug-rows a{display:flex;align-items:center;height:44px;border-bottom:1px solid var(--line);color:inherit;text-decoration:none;font-weight:550}
.mo-sug-rows a:last-child{border-bottom:0}
.mo-sug-rows .lx-count{margin-left:auto}
.mo-go{margin-top:auto;padding:14px 28px 24px}
.mo-quiet{padding:6px 28px 24px;color:var(--muted)}
.mo-top{display:flex;gap:18px;align-items:center;padding:18px 28px 22px}
.mo-top-b{min-width:0;flex:1;display:grid;gap:6px}
.mo-top-b .nm{font-size:13.5px;font-weight:550;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.mo-top-b .r{display:flex;gap:10px;align-items:baseline;color:var(--muted);font-size:13px}
.mo-top-b .r .lx-stat{margin-left:auto}
.mo-thumb{width:76px;height:95px;border-radius:14px;background:var(--bg-sunk);display:inline-flex;align-items:center;justify-content:center;flex:none}
.mo-thumb svg{width:22px;height:22px;fill:var(--faint);stroke:none}
.mo-three{margin-top:auto;display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:16px;padding:22px 28px 28px;border-top:1px solid var(--line)}
.mo-three .mo-n{font-size:24px;display:block;margin-top:4px}
.mo-checks{padding:26px 32px 28px}
.mo-checks .lx-sec{margin-bottom:18px}
.mo-checks-g{display:grid;grid-template-columns:1.5fr 1fr 1fr 1fr;gap:40px;align-items:start}
.mo-checks-g .row{display:flex;gap:10px;align-items:baseline;margin:4px 0 10px;color:var(--muted);font-size:13px;font-variant-numeric:tabular-nums;flex-wrap:wrap}
.mo-checks-g .lx-gauge-track{background:#E4E2DC}
.mo-word{display:flex;align-items:center;gap:9px;margin-top:4px;height:33px;font-size:22px;font-weight:600;letter-spacing:-.02em}
.mo-word i{width:10px;height:10px;border-radius:50%;background:var(--good);box-shadow:0 0 0 4px var(--good-bg)}
.mo-word.warn i{background:var(--watch);box-shadow:0 0 0 4px rgba(232,181,0,.2)}
.mo-word.bad i{background:var(--bad);box-shadow:0 0 0 4px var(--bad-bg)}
.mo-none{color:var(--muted);font-size:13px;margin-top:6px}
@media (max-width:1040px){
  .mo-figs{grid-template-columns:repeat(2,minmax(0,1fr))}
  .mo-checks-g{grid-template-columns:repeat(2,minmax(0,1fr));gap:28px}
}
@media (max-width:759px){
  .mo-figs{gap:var(--sp-5)}
  .mo-figs .lx-kpi .v{font-size:28px}
  .mo-figs .lx-kpi .s{flex-wrap:wrap;white-space:normal}
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
  .mo-checks{padding:20px 18px}
  .mo-checks-g{gap:22px 18px}
}`;
function css() {
  addStyles('mo-css', CSS);
}

/* ---------- load: real mode ---------- */
const CALL_LABEL = { cut: 'Turn off', scale: 'Raise budget', refresh: 'New ads needed', trim: 'Trim', mixed: 'Look closer' };

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
  let liveCounts = null, atLimit = null;
  const liveCamp = (live && !live.error && live.campaigns) || null;
  if (liveCamp) {
    const on = o => Object.values(o || {}).filter(v => v.eff === 'ACTIVE');
    const ads = on(live.ads);
    liveCounts = { campaigns: on(live.campaigns).length, adsets: on(live.adsets).length, ads: ads.length };
    const perSet = {};
    for (const a of Object.values(live.ads || {})) if (a.status === 'ACTIVE') perSet[a.adset] = (perSet[a.adset] || 0) + 1;
    atLimit = Object.values(perSet).filter(n => n >= 50).length;
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
    campaigns.push({ id: c.id, name: c.name, budget: budgetOf(c.id) ?? (ok(c.budget) ? c.budget : null), spend: c.spend, revenue: lead ? null : c.revenue, roas: lead ? null : c.roas,
      leads: lead ? c.leads : null, cpl: lead ? c.cpl : null });
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
    weekOut = { roas: wb.cur.roas, revenue_delta: wb.prev && wb.prev.revenue > 0 && ok(wb.cur.revenue) ? wb.cur.revenue / wb.prev.revenue - 1 : null };
    const floor = Math.max(50, goals.cpa || 0);
    const ads = (wb.campaigns || []).flatMap(c => (c.adsets || []).flatMap(st => st.ads || [])).filter(a => a.purchases >= 2 && a.spend >= floor && ok(a.roas));
    ads.sort((p, q) => q.roas - p.roas);
    if (ads[0]) top = { id: ads[0].id, name: ads[0].name, video: ads[0].media_type === 'video', roas: ads[0].roas, orders: ads[0].purchases, revenue: ads[0].revenue, spend: ads[0].spend };
  }

  return {
    window: { ...w, label: label(w) }, currency: b.currency || 'USD', connected: true, sales_source: salesSource,
    goals: { metric: goals.metric || null, roas: goals.roas || null, cpa: goals.cpa || null, ncpa: goals.ncpa || null },
    totals: { spend: cur.sales_spend ?? cur.spend, revenue: cur.revenue, roas: cur.roas, purchases: cur.purchases, cpa: cur.cpa, days: series.length || null, lead_spend: cur.lead_spend || null },
    week: weekOut, new_customers: null, series, note: null,
    live: liveCounts, live_error: live && live.error ? live.error : null,
    campaigns, budget_total: campaigns.some(c => ok(c.budget)) ? sum(campaigns, 'budget') : null,
    suggestions, top_ad: top,
    checks: { limit: null, tracking: null, learning: null, at_limit: atLimit },
  };
}

/* ---------- the figures ---------- */
function fig({ label: l, value, sub, extra, href }) {
  const kids = [h('span', { class: 'l' }, l), h('span', { class: 'v' }, value), h('span', { class: 's' }, sub || ''), extra || null];
  return href ? h('a', { class: 'lx-kpi lg', href }, kids) : h('div', { class: 'lx-kpi lg' }, kids);
}
function figures(d, ctx) {
  const cur = d.currency, t = d.totals || {}, g = d.goals || {}, wk = d.week || {};
  const noSales = !d.sales_source;
  const none = 'No sales source connected';
  const out = [];
  out.push(fig({ label: 'Spend', value: usd(t.spend, cur), href: ctx.href('meta', 'live-now'),
    sub: ok(t.spend) && t.days ? usd(t.spend / t.days, cur) + ' a day' : '',
    extra: sparkline((d.series || []).map(r => r.spend), { fill: true }) }));
  out.push(fig({ label: 'Sales from Meta ads', value: noSales ? h('small', null, none) : usd(t.revenue, cur), href: ctx.href('meta', 'top-ads'),
    sub: noSales ? '' : ok(wk.revenue_delta) ? [delta(wk.revenue_delta), 'this week'] : '',
    extra: noSales ? null : sparkline((d.series || []).map(r => r.revenue), { fill: true }) }));
  const rr = roasRead(t.roas, g.roas);
  out.push(fig({ label: 'Meta ROAS', value: noSales ? h('small', null, none) : x(t.roas), href: ctx.href('meta', 'top-ads'),
    sub: noSales ? '' : [rr && statusDot(rr[0], rr[1]), ok(wk.roas) ? x(wk.roas) + ' this week' : (!g.roas ? 'no goal set' : '')],
    extra: !noSales && ok(t.roas) && g.roas ? gauge({ value: t.roas, max: Math.max(g.roas * 1.2, t.roas * 1.05), goal: g.roas, ticks: [{ side: 'l', text: '0' }, { at: g.roas, text: 'goal ' + x(g.roas), on: true }] }) : null }));
  /* cost per new customer when the count is known; else cost per sale, which is always known */
  const nc = d.new_customers;
  const cost = nc ? nc.cost : t.cpa, goal = nc ? (nc.goal || g.ncpa) : g.cpa;
  const cr = costRead(cost, goal);
  out.push(fig({ label: nc ? 'Cost per new customer' : 'Cost per sale', value: noSales ? h('small', null, none) : usd(cost, cur), href: ctx.href('customers', 'snapshot'),
    sub: noSales ? '' : [cr && statusDot(cr[0], cr[1]), nc ? num(nc.count) + ' new customers' : ok(t.purchases) ? num(t.purchases) + ' sales' : ''],
    extra: !noSales && ok(cost) && goal ? gauge({ value: cost, max: Math.max(cost, goal) * 1.1, goal, ticks: [{ side: 'l', text: usd(0, cur) }, { at: goal, text: 'goal ' + usd(goal, cur), on: true }] }) : null }));
  return h('div', { class: 'mo-figs' }, out);
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
    height: 380, empty: 'No spend on these dates',
    label: `Meta spend${hasSales ? ', sales from Meta ads' : ''}${goal && hasSales ? ' and the sales needed to hit the goal' : ''}, by day, ${d.window ? d.window.label : ''}`,
    hover: i => [b(shortDate(rows[i].date)), h('span', null, 'Spend ', b(usd(spend[i], cur))), hasSales ? h('span', null, 'Sales ', b(usd(sales[i], cur))) : null,
      hasSales && spend[i] > 0 ? h('span', null, 'ROAS ', b(x(sales[i] / spend[i]))) : null],
  });
  return card({ class: 'mo-chart' },
    h('div', { class: 'lx-chart-h' },
      h('div', null, h('div', { class: 'lx-sec' }, h('h3', null, hasSales ? 'Are Meta sales keeping up with spend?' : 'Meta spend by day')),
        h('p', null, hasSales ? 'by day, Meta only' : 'No sales source connected, so this is spend only')),
      lg),
    plot,
    ctx.isClient ? null : h('div', { class: 'mo-read' }, h('a', { class: 'lx-btn ghost', href: ctx.href('ask', 'index') }, h('span', { class: 'lx-gem sm' }, svgNode(icon('sparkle'))), 'Read this for me')));
}

/* ---------- live campaigns ---------- */
function goalBar(roas, goal) {
  if (!ok(roas) || !goal) return null;
  return gauge({ value: roas, max: Math.max(goal * 1.2, roas * 1.05), goal, thin: true });
}
function campaignsCard(d, ctx) {
  const cur = d.currency, goal = d.goals && d.goals.roas, noSales = !d.sales_source;
  const all = d.campaigns || [];
  const shown = all.length > 4 ? all.slice(0, 3) : all;
  const rest = all.slice(shown.length);
  const rows = shown.map(c => ({ ...c }));
  if (rest.length) {
    const sp = sum(rest, 'spend'), rv = sum(rest, 'revenue');
    rows.push({ more: true, name: `${rest.length} more campaigns`, budget: rest.some(c => ok(c.budget)) ? sum(rest, 'budget') : null, spend: sp, revenue: rv, roas: div(rv, sp) });
  }
  const t = d.totals || {};
  const total = all.length ? { total: true, name: 'All of Meta', budget: d.budget_total, spend: t.spend, revenue: t.revenue, roas: t.roas } : null;
  const live = d.live;
  const stat = r => {
    if (r.waiting) return statusDot('off', 'Waiting');
    if (ok(r.cpl)) return statusDot('info', 'Leads');
    if (noSales) return null;
    const rr = roasRead(r.roas, goal);
    return rr ? statusDot(rr[0], rr[1]) : null;
  };
  const tbl = table({
    roomy: true, empty: 'No live campaigns',
    cols: [
      { key: 'name', label: 'Campaign', class: 'name', render: r => r.more ? h('span', { class: 'dim' }, r.name) : r.name },
      { key: 'budget', label: 'Budget a day', num: true, class: 'hide-md', render: r => ok(r.budget) ? usd(r.budget, cur) : h('span', { class: 'dim' }, 'not set') },
      { key: 'spend', label: 'Spend', num: true, render: r => r.spend > 0 || r.total ? usd(r.spend, cur) : h('span', { class: 'dim' }, usd(0, cur)) },
      { key: 'revenue', label: 'Sales from its ads', num: true, class: 'hide-sm', render: r => noSales || r.revenue == null ? h('span', { class: 'dim' }, noSales ? 'no source' : '') : r.spend > 0 || r.total ? usd(r.revenue, cur) : h('span', { class: 'dim' }, usd(0, cur)) },
      { key: 'roas', label: 'ROAS', num: true, render: r => r.waiting ? h('span', { class: 'dim' }, r.waiting) : ok(r.cpl) ? h('span', { class: 'dim' }, money(r.cpl, { cur }) + ' a lead') : noSales ? h('span', { class: 'dim' }, 'no source') : ok(r.roas) ? h('span', { class: 'strong' }, x(r.roas)) : '' },
      { key: 'bar', label: goal ? 'Against goal ' + x(goal) : 'Against goal', class: 'mo-bar hide-sm', render: r => r.waiting || noSales || ok(r.cpl) ? null : goalBar(r.roas, goal) },
      { key: 'status', label: '', class: 'mo-st', render: stat },
    ],
    rows, total,
    onRow: () => ctx.go({ ...ctx.route, tab: 'live-now' }),
  });
  return card({ title: 'Live now', note: 'Meta campaigns', flush: true, class: 'mo-camps', action: h('a', { href: ctx.href('meta', 'live-now') }, 'Open') },
    live ? h('div', { class: 'mo-counts' },
      h('span', null, h('b', { class: 'mo-n' }, num(live.campaigns)), 'campaigns'),
      h('span', null, h('b', { class: 'mo-n' }, num(live.adsets)), 'ad sets'),
      h('span', null, h('b', { class: 'mo-n' }, num(live.ads)), 'ads'))
      : h('div', { class: 'mo-counts' }, h('span', null, d.live_error || 'Could not read the live counts from Meta just now')),
    tbl);
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
  const act = h('a', { href: ctx.href('meta', 'top-ads') }, 'Top ads');
  if (!a) return card({ title: 'Top ad this week', note: 'Meta', flush: true, action: act },
    h('p', { class: 'mo-quiet' }, d.sales_source ? 'No ad has two sales and enough spend to call yet this week.' : 'No sales source connected, so no ad can be ranked on sales.'));
  const rr = roasRead(a.roas, goal);
  return card({ title: 'Top ad this week', note: 'Meta', flush: true, action: act },
    h('div', { class: 'mo-top' },
      h('span', { class: 'mo-thumb', role: 'img', 'aria-label': a.video ? 'Video ad' : 'Image ad' }, a.video ? svgNode('<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.5v13l11-6.5z"/></svg>') : null),
      h('div', { class: 'mo-top-b' },
        h('div', { class: 'nm', title: a.name }, a.name),
        h('div', { class: 'r' }, h('span', { class: 'mo-n xl' }, x(a.roas)), 'ROAS', rr && statusDot(rr[0], rr[1])),
        goal ? gauge({ value: a.roas, max: Math.max(goal * 1.6, a.roas * 1.1), goal, tone: rr && rr[0] === 'good' ? 'good' : '', ticks: [{ side: 'l', text: '0' }, { at: goal, text: 'goal ' + x(goal), on: true }] }) : null)),
    h('div', { class: 'mo-three' },
      h('div', null, h('span', { class: 'lx-cap' }, 'Orders'), h('span', { class: 'mo-n' }, num(a.orders))),
      h('div', null, h('span', { class: 'lx-cap' }, 'Sales'), h('span', { class: 'mo-n' }, usd(a.revenue, cur))),
      h('div', null, h('span', { class: 'lx-cap' }, 'Spend'), h('span', { class: 'mo-n' }, usd(a.spend, cur)))));
}

/* ---------- checks ---------- */
function checksBand(d, ctx) {
  const c = d.checks || {}, cur = d.currency;
  const none = text => h('p', { class: 'mo-none' }, text);
  const TRACK = { good: 'Healthy', warn: 'Check it', bad: 'Broken' };
  const lim = c.limit && c.limit.limit > 0 ? c.limit : null;
  return h('section', { class: 'lx-band mo-checks' },
    h('div', { class: 'lx-sec' }, h('h3', null, 'Meta checks'), h('div', { class: 'act' }, h('a', { href: ctx.href('meta', 'live-now') }, 'See ad sets'))),
    h('div', { class: 'mo-checks-g' },
      h('div', null, h('div', { class: 'lx-cap' }, 'Daily spend limit'),
        lim ? [h('div', { class: 'row' }, h('span', { class: 'mo-n' }, pct(lim.used / lim.limit)), `${usd(lim.used, cur)} of ${usd(lim.limit, cur)} today`), gauge({ value: lim.used, max: lim.limit, thin: true, tone: lim.used / lim.limit >= 0.9 ? 'bad' : '' })]
          : none('Not read from Meta yet')),
      h('div', null, h('div', { class: 'lx-cap' }, 'Tracking'),
        c.tracking ? h('div', { class: 'mo-word ' + (c.tracking === 'good' ? '' : c.tracking) }, h('i'), TRACK[c.tracking] || c.tracking) : none('Not checked yet')),
      h('div', null, h('div', { class: 'lx-cap' }, 'Still learning'),
        c.learning ? h('div', { class: 'row' }, h('span', { class: 'mo-n' }, num(c.learning.n)), `of ${num(c.learning.of)} ad sets`) : none('Not read from Meta yet')),
      h('div', null, h('div', { class: 'lx-cap' }, 'At the 50 ad limit'),
        ok(c.at_limit) ? h('div', { class: 'row' }, h('span', { class: 'mo-n' }, num(c.at_limit)), c.at_limit === 1 ? 'ad set' : 'ad sets') : none('Not read from Meta yet'))));
}

/* ---------- the one sentence ---------- */
function sentence(d, ctx) {
  const t = d.totals || {}, g = d.goals || {};
  if (!d.sales_source || !ok(t.roas)) return null;
  const say = ['Meta brought back ', h('b', null, money(Math.round(t.roas * 100) / 100, { cur: d.currency, cents: 2 })), ' for each $1 on these dates.'];
  if (g.roas) say.push(' The goal is ', h('b', null, money(g.roas, { cur: d.currency, cents: 2 })), '.');
  return takeaway(say, { action: ctx.isClient ? null : button('Ask why', { href: ctx.href('ask', 'index') }) });
}

export default {
  /* the plain question, drawn by the shell above the tabs */
  title: ['Are Meta ads ', em('paying for themselves?')],
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
    put(el, ...[
      figures(d, ctx),
      sentence(d, ctx),
      chartCard(d, ctx),
      campaignsCard(d, ctx),
      /* suggestions are for the team; a client sees the top ad alone */
      ctx.isClient ? topAdCard(d, ctx) : h('div', { class: 'mo-two' }, suggestionsCard(d, ctx), topAdCard(d, ctx)),
      checksBand(d, ctx),
      h('p', { class: 'lx-foot' }, `${d.window ? d.window.label + '. ' : ''}Facebook and Instagram ads only. Sales and ROAS from Triple Whale, last click per platform. Spend and budgets from Meta.`),
    ].filter(Boolean));
  },
};

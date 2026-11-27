/* Business > Customers > LTV.
   What is a customer worth over time, and does each month's batch of new customers pay back what it cost?
   Live numbers: GET /api/customers on the profit worker (journey.curve for LTV by day after the first
   order, journey.cohorts for each first-order month with its cost per new customer). The cohorts are
   all time, so the page has no date range; the cost per new customer in the figures is the last 90 days.
   Nothing here is sample data in real mode. */

import { put } from '../../kit.js';
import { askWhy, helpBar, dl } from '../home/_biz.js';
import { h, money, num, card, em, takeaway, button, statusDot, table, empty, lineChart, legend, x, addStyles } from '../../kit.js';
import { tileRow, tipRows, pageStamp, ownLabels, TW } from '../month/_m.js';
import { ltvChart } from './charts.js';

const ok = n => n != null && isFinite(n);
const dollars = v => money(Math.round(v));
const b = v => h('b', null, v);
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const monthLabel = ym => MON[+String(ym).slice(5, 7) - 1] + ' ’' + String(ym).slice(2, 4);

const CSS = `
.lv-pad{padding:28px 32px 22px}
.lv-head{display:flex;align-items:flex-start;gap:12px 20px;flex-wrap:wrap;margin-bottom:8px}
.lv-head>div:first-child{flex:1 1 260px;min-width:0}
.lv-head h3{font-size:var(--fs-card,14px);font-weight:600;letter-spacing:-.005em}
.lv-head p{color:var(--muted);font-size:13px;margin-top:2px}
.lv-big{display:flex;align-items:baseline;gap:12px;flex-wrap:wrap;margin:6px 0 16px}
.lv-big>span:last-child{color:var(--muted);font-size:13.5px}
.lv-kpis .lx-kpi .s{flex-wrap:wrap}
.lv-flush .lv-head{padding:20px 28px 6px;margin:0}
.lv-young{color:var(--faint)}
.lv-lab{font-size:13.5px;color:var(--ink-2);font-weight:500}
.lv-num{font-size:var(--num-l);font-weight:600;letter-spacing:-.03em;font-variant-numeric:tabular-nums}
@media (max-width:759px){
  .lv-pad{padding:18px}
  .lv-flush .lv-head{padding:16px 18px 6px}
  .lv-kpis .lx-kpi.lg .v{font-size:var(--num-l)}
  .lv-kpis .lx-kpi .l{white-space:normal}
  .lv-big .lx-hero-num{font-size:var(--num-xl)}
}`;
const headOf = (title, sub, ...tools) => h('div', { class: 'lv-head' }, h('div', null, h('h3', null, title), sub ? h('p', null, sub) : null), tools.filter(Boolean).length ? h('div', null, tools) : null);

/* real mode: the one call, shaped like the fixture */
function shape(r, goal) {
  const hd = r.headline || {}, j = r.journey && r.journey.have ? r.journey : null;
  const connected = !!((r.account && r.account.tw_shop) || hd.orders > 0);
  if (!j) return { connected, reason: r.journey && r.journey.reason || null };
  const curve = (j.curve || []).filter(c => ok(c.ltv));
  return {
    connected: true,
    cac: ok(hd.cac) ? hd.cac : null, cac_goal: ok(goal) ? goal : null,
    first_order: j.first_aov,
    ltv: { days: [0, ...curve.map(c => c.days)], values: [j.first_aov, ...curve.map(c => c.ltv)] },
    counted: j.certain_customers,
    cohorts: (j.cohorts || []).map(c => ({ month: c.month, customers: c.customers, cac: c.cac, ltv_now: c.ltv_now, ltv_90: c.ltv_90, ltv_365: c.ltv_365, young: c.ltv_90 == null })),
  };
}

function at(d, day) { const i = (d.ltv.days || []).indexOf(day); return i >= 0 ? d.ltv.values[i] : null; }

function figures(d) {
  const v90 = at(d, 90), v365 = at(d, 365), ratio = ok(v90) && d.cac > 0 ? v90 / d.cac : null;
  const over = ok(d.cac) && ok(d.cac_goal) ? d.cac > d.cac_goal : null;
  /* both LTV sparks are the curve by day after the first order, each up to its own day, so the figure is its last point */
  const upTo = day => { const i = d.ltv.days.findIndex(v => v > day); return i < 0 ? d.ltv.days.length : i; };
  const withCac = d.cohorts.filter(c => ok(c.cac)), grown90 = d.cohorts.filter(c => ok(c.ltv_90) && c.cac > 0);
  const list = [
    { label: dl('LTV by day 90', 'ltv'), value: ok(v90) ? dollars(v90) : 'no data', sub: ok(d.first_order) ? 'vs ' + dollars(d.first_order) + ' on the first order' : null, spark: d.ltv.values.slice(0, upTo(90)), sparkLabels: d.ltv.days.slice(0, upTo(90)).map(v => 'Day ' + v), sparkFormat: dollars },
    { label: dl('LTV by day 365', 'ltv'), value: ok(v365) ? dollars(v365) : 'no data', sub: ok(v365) && ok(d.first_order) ? x(v365 / d.first_order, 1) + ' the first order' : 'needs a year of orders', spark: ok(v365) ? d.ltv.values.slice(0, upTo(365)) : null, sparkLabels: d.ltv.days.slice(0, upTo(365)).map(v => 'Day ' + v), sparkFormat: dollars },
    { label: dl('Cost per new customer', 'new_customer_cost'), value: ok(d.cac) ? dollars(d.cac) : 'no data', window: 'Last 90 days', source: 'All ad spend over ' + TW + ' new customers',
      delta: over == null ? null : statusDot(over ? 'bad' : 'good', 'goal ' + dollars(d.cac_goal)), sub: null, spark: withCac.map(c => c.cac), sparkLabels: ownLabels(withCac.map(c => monthLabel(c.month)), 'by month'), sparkFormat: dollars },
    { label: dl('Back per $1 by day 90', 'ltv_back'), value: ok(ratio) ? money(ratio, { cents: true }) : 'no data', sub: ok(ratio) ? (ratio >= 1 ? 'paid back, before product cost' : 'not paid back yet') : null, spark: grown90.map(c => c.ltv_90 / c.cac), sparkLabels: ownLabels(grown90.map(c => monthLabel(c.month)), 'by month'), sparkFormat: v => money(v, { cents: true }) },
  ];
  return tileRow(list, { cols: 4, window: 'Every first order, last 12 months', source: TW + ' orders' });
}

/* One sentence, only for what the tiles do not show: how the newest month with a day 90 read did against its cost. */
function say(d, ctx) {
  const grown = (d.cohorts || []).filter(c => ok(c.ltv_90) && c.cac > 0);
  if (!grown.length) return null;
  const c = grown[grown.length - 1], r = c.ltv_90 / c.cac;
  const best = grown.reduce((m, x) => (x.ltv_90 / x.cac > m.ltv_90 / m.cac ? x : m), grown[0]);
  const parts = r < 1
    ? ['Customers won in ', b(monthLabel(c.month)), ' have not paid back by day 90: they cost ', b(dollars(c.cac)), ' and are worth ', b(dollars(c.ltv_90)), '.']
    : ['The best month was ', b(monthLabel(best.month)), ': ', b(money(best.ltv_90 / best.cac, { cents: true })), ' back per $1 by day 90.'];
  return takeaway(parts, { action: ctx.isClient ? null : askWhy(ctx, 'What is a customer worth over time') });
}

function curveCard(d) {
  const days = d.ltv.days || [], last = days[days.length - 1];
  const lastV = d.ltv.values[d.ltv.values.length - 1];
  return card({ class: 'lv-pad' },
    headOf('What is a customer worth over time?', 'Sales per customer from the first order, before product cost · ' + TW + ' orders',
      legend([{ name: 'Worth per customer', lead: true }, ok(d.cac) && { name: 'Cost per new customer', dashed: true }])),
    ok(lastV) ? h('div', { class: 'lv-big' }, h('span', { class: 'lv-lab' }, dl('LTV at day ' + last, 'ltv')), h('b', { class: 'lv-num' }, dollars(lastV)), h('span', null, `${num(d.counted)} customers counted`)) : null,
    ltvChart({ days, values: d.ltv.values, cac: d.cac }));
}

function cohortChart(d) {
  const rows = d.cohorts.filter(c => ok(c.cac) || ok(c.ltv_90));
  if (rows.length < 3) return null;
  const grown = rows.filter(c => ok(c.ltv_90));
  const lastBelow = grown.length && grown[grown.length - 1].ltv_90 < (grown[grown.length - 1].cac || 0);
  return card({ class: 'lv-pad' },
    headOf('Is each month’s batch worth what it cost?', 'By the month of the first order: worth by day 90 against the cost per new customer that month. The newest months have no day 90 yet, so only their cost shows.',
      legend([{ name: 'Worth by day 90', lead: true }, { name: 'Cost per new customer' }])),
    lineChart({
      series: [
        { name: 'Worth by day 90', lead: true, points: true, values: rows.map(c => c.ltv_90), end: false },
        { name: 'Cost per new customer', points: true, values: rows.map(c => c.cac), end: v => dollars(v) },
      ],
      labels: rows.map(c => monthLabel(c.month)),
      windowLabel: 'By first order month, ' + monthLabel(rows[0].month) + ' to ' + monthLabel(rows[rows.length - 1].month),
      format: dollars, yMax: Math.ceil(Math.max(...rows.flatMap(c => [c.ltv_90 || 0, c.cac || 0])) * 1.25 / 20) * 20, yTicks: 4, height: 340, phoneHeight: 280, fill: false,
      label: `Worth by day 90 and cost per new customer for each first-order month, ${monthLabel(rows[0].month)} to ${monthLabel(rows[rows.length - 1].month)}.` + (lastBelow ? ' The latest month with a 90 day read cost more than it was worth.' : ''),
      hover: i => tipRows(monthLabel(rows[i].month), [['Worth by day 90', ok(rows[i].ltv_90) ? dollars(rows[i].ltv_90) : 'too new', 'lead'], ['Cost per new customer', ok(rows[i].cac) ? dollars(rows[i].cac) : 'no data', 'slate'], ['Customers', num(rows[i].customers)]]),
    }));
}

function cohortTable(d) {
  const rows = d.cohorts.slice().reverse();
  if (!rows.length) return null;
  const per = c => (ok(c.ltv_90) && c.cac > 0 ? c.ltv_90 / c.cac : null);
  return card({ class: 'lv-flush', flush: true },
    headOf('Each month’s new customers, followed since', 'Newest first; back per $1 is worth by day 90 over what they cost · ' + TW + ' orders'),
    table({
      cols: [
        { key: 'month', label: 'First order', class: 'name', sortable: true, render: c => monthLabel(c.month) },
        { key: 'customers', label: 'Customers', num: true, class: 'hide-sm', sortable: true, render: c => num(c.customers) },
        { key: 'cac', label: 'Cost each', num: true, sortable: true, render: c => (ok(c.cac) ? dollars(c.cac) : 'no data') },
        { key: 'ltv_90', label: 'By day 90', num: true, class: 'hide-sm', sortable: true, render: c => (ok(c.ltv_90) ? dollars(c.ltv_90) : h('span', { class: 'lv-young' }, 'too new')) },
        { key: 'ltv_now', label: 'So far', num: true, sortable: true, render: c => (ok(c.ltv_now) ? dollars(c.ltv_now) : 'no data') },
        { key: 'per', label: dl('Back per $1', 'ltv_back'), num: true, sortable: true, value: per, render: c => { const r = per(c); return ok(r) ? statusDot(r >= 1 ? 'good' : r >= 0.8 ? 'warn' : 'bad', money(r, { cents: true })) : h('span', { class: 'lv-young' }, 'too new'); } },
      ],
      rows, sort: { key: 'month', dir: 'desc' },
    }));
}

export default {
  title: ['What is a customer ', em('worth over time?')],
  eyebrow: 'Customers',
  stamp: false,                     /* Home's stamp with a refresh button sits in the help bar */
  ranges: false,

  async load(ctx) {
    if (!ctx.brand) return { connected: false };
    const [r, goal] = await Promise.all([
      ctx.api(`/api/customers?act=${encodeURIComponent(ctx.brand.id)}&months=12&days=90`, { signal: ctx.signal }),
      ctx.setting('brand:' + ctx.brand.id + '.target_cpa', null).catch(() => null),
    ]);
    return shape(r, goal != null ? +goal : null);
  },

  render(el, d, ctx) {
    addStyles('lv-style', CSS);
    d = d || {};
    const team = !ctx.isClient;
    if (!d.connected || !d.ltv) {
      put(el, empty({
        title: d.connected ? 'No order history yet' : 'No sales source connected',
        text: d.connected ? (d.reason || 'Customer history fills in overnight once the store’s orders arrive.')
          : team ? 'LTV needs the store’s orders. Connect Triple Whale or Shopify in Brand settings and it will show here.' : 'LTV will show here once the store is connected.',
        action: !d.connected && team && ctx.brand ? button('Open integrations', { href: ctx.href('brand-settings', 'integrations') }) : null,
      }));
      return;
    }
    d.cohorts = d.cohorts || [];
    const lastI = d.ltv.days.length - 1;
    ctx.askWindow = 'Every first order, last 12 months';
    ctx.askContext = `${ctx.brand.name} customer worth over time: LTV ${dollars(d.ltv.values[lastI])} by day ${d.ltv.days[lastI]} against a first order of ${dollars(d.first_order)}, cost per new customer ${dollars(d.cac)} (last 90 days).`;
    put(el, ...[
      helpBar([
        { title: 'What it is for', text: 'What a customer is worth over time, and whether each month of new customers paid back what it cost.' },
        { title: 'How it is counted', text: 'Triple Whale orders, followed per customer from the first order. LTV (worth) is sales per customer before product cost. Customers first seen in the first 60 days of history are left out, and a month needs 90 days before it has a day 90 read. The cost per new customer in the tiles is the last 90 days.' },
      ], h('span', { class: 'bz-chip' }, 'Every first order, the last 12 months'), pageStamp(ctx)),
      figures(d),
      say(d, ctx),
      curveCard(d),
      cohortChart(d),
      cohortTable(d),
    ].filter(Boolean));
  },

  skeleton(el) {
    el.innerHTML = '<div class="lx-skel-grid"><div class="lx-skel kpi"></div><div class="lx-skel kpi"></div><div class="lx-skel kpi"></div><div class="lx-skel kpi"></div></div><div class="lx-skel chart"></div><div class="lx-skel chart"></div>';
  },
};

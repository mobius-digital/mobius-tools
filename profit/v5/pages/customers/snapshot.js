/* Business > Customers > Snapshot.
   Does a customer pay back what they cost? Four figures, the LTV curve against the cost per new
   customer, when they order again, and what the second order was.
   Live numbers: GET /api/customers on the profit worker (the store's unit economics plus the
   customer journey). The reorder weeks and the same or new split have no route yet, so in real
   mode those two cards say so plainly; the fixture carries them for sample mode. */

import { put } from '../../kit.js';
import { helpBar, dl, rangeWords } from '../home/_biz.js';
import { h, money, num, pct, card, em, button, statusDot, delta, legend, table, empty, addStyles, svgNode } from '../../kit.js';
import { icon } from '../../icons.js';
import { tileRow, pageStamp, ownLabels, TW } from '../month/_m.js';
import { ltvChart, againChart, crossing, halfDayOf } from './charts.js';

const ok = n => n != null && isFinite(n);
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const monthName = ym => MONTHS[+String(ym).slice(5, 7) - 1] || '';
const monthShort = ym => monthName(ym).slice(0, 3);
const shortDay = d => monthShort(d) + ' ' + +String(d).slice(8, 10);

/* ---------- the little CSS this page needs and the kit does not have ---------- */
const CSS = `
.cs-big{display:flex;align-items:baseline;gap:12px;flex-wrap:wrap;margin-bottom:10px}
.cs-big b{font-size:var(--num-l);font-weight:600;letter-spacing:-.04em;line-height:1.02;font-variant-numeric:tabular-nums;color:var(--ink)}
.cs-big>span:not(.lx-hero-num){color:var(--muted);font-size:13.5px}
.cs-chart{padding:28px 32px 22px}
.cs-second .cs-big{padding:6px 28px 12px;margin:0}
.cs-second .lx-cellbar{display:block;width:100%;margin-left:0}
.cs-second .cs-bar{padding-left:28px;width:46%}
.cs-tip{display:flex;align-items:center;gap:10px;padding:14px 28px 20px;border-top:1px solid var(--line);font-size:14px;color:var(--ink-2)}
.cs-tip b{color:var(--ink);font-weight:600}
.cs-kpis .lx-kpi .s{flex-wrap:wrap}
.cs-go{display:grid;gap:0;padding:4px 16px 12px}
.cs-go a{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:2px 16px;align-items:center;padding:14px 12px;border-radius:var(--r-tbl,12px);color:inherit;text-decoration:none}
.cs-go a+a{border-top:1px solid var(--line)}
.cs-go a:hover{background:var(--row-hover)}
.cs-go b{font-weight:600}
.cs-go span{grid-column:1;font-size:13px;color:var(--muted)}
.cs-go i{grid-column:2;grid-row:1/span 2;display:grid;place-items:center;color:var(--faint)}
.cs-go i svg{width:16px;height:16px;transform:rotate(-90deg)}
@media (max-width:759px){
  .cs-chart{padding:18px}
  .cs-big b{font-size:var(--num-m)}
  .cs-kpis .lx-kpi.lg .v{font-size:var(--num-l)}
  .cs-kpis .lx-kpi .l{white-space:normal}
  .cs-second .cs-big{padding:4px 18px 10px}
  .cs-second .cs-bar{display:none}
  .cs-second .lx-sec{flex-wrap:wrap;gap:4px 12px}
  .cs-second .lx-sec .note{display:none}
  .cs-second th{width:auto!important}
  .cs-tip{padding:12px 18px 16px}
}`;
function style() {
  addStyles('cs-style', CSS);
}

/* ---------- real mode: one call, shaped like the fixture ---------- */
function shape(r) {
  const hd = r.headline || {}, j = r.journey || null, months = (r.series || []).filter(m => !m.empty);
  const whole = months.filter(m => !m.partial);
  const aovOf = m => m.total_orders > 0 ? m.sales / m.total_orders : null;
  const curve = j && j.have ? (j.curve || []).filter(c => ok(c.ltv)) : [];
  const later = curve.filter(c => c.days >= 30 && ok(c.repeat_rate));
  const at = d => { const c = curve.find(x => x.days === d); return c ? c.repeat_rate : null; };
  const firstCac = months.find(m => ok(m.cac));
  const prev = whole[whole.length - 1];
  return {
    connected: !!((r.account && r.account.tw_shop) || hd.orders > 0 || months.length),
    range: { from: r.window && r.window.from, to: r.window && r.window.to },
    new_customers: hd.orders > 0 ? hd.new_orders : null,
    orders: hd.orders > 0 ? hd.orders : null,
    new_spark: whole.map(m => m.new_orders), new_labels: whole.map(m => monthShort(m.month)),
    cac: hd.cac, cac_goal: null,
    cac_then: firstCac && firstCac !== months[months.length - 1] ? { label: monthName(firstCac.month), value: firstCac.cac } : null,
    cac_spark: months.map(m => m.cac), month_labels: months.map(m => monthShort(m.month)),
    back_90: at(90), back_365: at(365),
    back_spark: later.map(c => c.repeat_rate * 100), back_days: later.map(c => c.days),
    aov: hd.aov,
    aov_prev: prev && ok(aovOf(prev)) ? { label: monthName(prev.month), value: aovOf(prev) } : null,
    aov_spark: months.map(aovOf),
    ltv: curve.length && ok(j.first_aov) ? { days: [0, ...curve.map(c => c.days)], values: [j.first_aov, ...curve.map(c => c.ltv)] } : null,
    ltv_reason: j && !j.have ? j.reason : null,
    again: null,      // no route yet: second orders by week after the first order
    second: null,     // no route yet: same product, another variant, or an add-on
  };
}

/* ---------- parts ---------- */
const dollars = v => money(Math.round(v));

function figures(d, ctx) {
  const share = ok(d.new_customers) && d.orders > 0 ? d.new_customers / d.orders : null;
  const over = ok(d.cac) && ok(d.cac_goal) ? d.cac > d.cac_goal : null;
  const aovMove = ok(d.aov_move) ? d.aov_move : ok(d.aov) && d.aov_prev && d.aov_prev.value > 0 ? d.aov / d.aov_prev.value - 1 : null;
  /* each spark is named by its own points: new customers by day (sample) or by month (live), cost and average order
     by month, came back by day after the first order (the tile's 90 day figure is a point on it) */
  const byMonth = (vals, labels) => (labels && labels.length === (vals || []).length ? ownLabels(labels, 'by month') : null);
  const newLabels = d.new_dates && d.new_dates.length === (d.new_spark || []).length ? d.new_dates.map(shortDay) : byMonth(d.new_spark, d.new_labels);
  const list = [
    { label: 'New customers', value: ok(d.new_customers) ? num(d.new_customers) : 'no data',
      sub: ok(share) ? `${pct(share)} of ${num(d.orders)} orders` : null, spark: newLabels ? d.new_spark : null, sparkLabels: newLabels, sparkFormat: v => num(v), href: ctx.href('customers', 'repeat') },
    { label: dl('Cost per new customer', 'new_customer_cost'), value: ok(d.cac) ? dollars(d.cac) : 'no data',
      delta: ok(d.cac_goal) ? statusDot(over ? 'bad' : 'good', 'goal ' + dollars(d.cac_goal)) : null,
      sub: d.cac_then && ok(d.cac_then.value) ? `vs ${dollars(d.cac_then.value)} in ${d.cac_then.label}` : null, spark: byMonth(d.cac_spark, d.month_labels) ? d.cac_spark : null, sparkLabels: byMonth(d.cac_spark, d.month_labels), sparkFormat: v => dollars(v), source: 'All ad spend over ' + TW + ' new customers', href: ctx.href('customers', 'ltv') },
    { label: dl('Came back in 90 days', { name: 'Came back in 90 days', definition: 'Share of new customers who placed a second order within 90 days of their first. Counts people, not orders.', source: 'Triple Whale orders' }), value: ok(d.back_90) ? pct(d.back_90, { digits: 1 }) : 'no data',
      sub: ok(d.back_365) ? pct(d.back_365, { digits: 1 }) + ' within a year' : null, spark: (d.back_days || []).length === (d.back_spark || []).length ? d.back_spark : null, sparkLabels: (d.back_days || []).map(v => 'Day ' + v), sparkFormat: v => v.toFixed(1) + '%', window: 'Every first order, followed since', href: ctx.href('customers', 'repeat') },
    { label: 'Average order', value: ok(d.aov) ? money(d.aov, { cents: true }) : 'no data',
      delta: ok(aovMove) && Math.abs(aovMove) >= 0.005 ? delta(aovMove) : null,
      sub: d.aov_prev && ok(d.aov_prev.value) ? `vs ${money(d.aov_prev.value, { cents: true })} in ${d.aov_prev.label}` : null, spark: byMonth(d.aov_spark, d.month_labels) ? d.aov_spark : null, sparkLabels: byMonth(d.aov_spark, d.month_labels), sparkFormat: v => money(v, { cents: true }) },
  ];
  return tileRow(list, { cols: 4, window: rangeWords(ctx, d.range), source: TW });
}

/** Where each question has its one chart: the curve on LTV, the reorder weeks on Repeat, the next product on Buy next. */
function moreCard(ctx) {
  const go = (tab, title, text) => h('a', { href: ctx.href('customers', tab) }, h('b', null, title), h('span', null, text), h('i', { 'aria-hidden': 'true' }, svgNode(icon('chevron'))));
  return card({ title: 'Read more', flush: true },
    h('div', { class: 'cs-go' },
      go('ltv', 'What is a customer worth over time?', 'LTV by day after the first order, against what a new customer costs'),
      go('repeat', 'Do they come back, and when?', 'second orders by week, and each month of new customers followed since'),
      go('buy-next', 'What do they buy next?', 'the second order after each first product')));
}

function head(title, sub, key) {
  return h('div', { class: 'lx-chart-h' }, h('div', null, h('div', { class: 'lx-sec' }, h('h3', null, title)), sub && h('p', null, sub)), key || null);
}

function worthCard(d) {
  if (!d.ltv) {
    return card({ title: 'What is a customer worth over time?' },
      empty({ title: 'No order history yet', text: d.ltv_reason || 'LTV shows once the store has customers old enough to follow.' }));
  }
  const last = d.ltv.days.length - 1;
  return card({ class: 'cs-chart' },
    head('What is a customer worth over time?', 'LTV per customer, in sales before product cost · ' + TW + ' orders',
      legend([{ name: 'LTV per customer', lead: true }, ok(d.cac) && { name: 'Cost per new customer', dashed: true }].filter(Boolean))),
    h('div', { class: 'cs-big' }, h('b', null, dollars(d.ltv.values[last])), h('span', null, 'LTV at day ' + d.ltv.days[last])),
    ltvChart({ days: d.ltv.days, values: d.ltv.values, cac: d.cac }));
}

function againCard(d) {
  const title = 'When do they order again?';
  if (!d.again || !(d.again.weeks || []).some(v => v > 0)) {
    return card({ title }, empty({ title: 'Reorder timing is not connected yet', text: 'This needs each customer’s order dates from the store. It will show second orders by week after the first order.' }));
  }
  const a = d.again, half = ok(a.half_day) ? a.half_day : halfDayOf(a.weeks, a.same_day, a.repeaters);
  const key = legend([{ name: 'Second orders that week', square: true, color: 'var(--brand)' }, ok(a.repeaters) && { name: 'Running share of repeat buyers' }]);
  return card({ class: 'cs-chart' },
    head(title, 'second orders by week after the first order', key),
    ok(half) ? h('div', { class: 'cs-big' }, h('b', null, 'Day ' + half), h('span', null, `half of the ${num(a.repeaters)} repeat buyers are back`)) : null,
    againChart({ weeks: a.weeks, sameDay: a.same_day, repeaters: a.repeaters, halfDay: half }));
}

function secondCard(d, ctx) {
  const title = 'Same or something new?';
  const rows = d.second && d.second.rows ? d.second.rows.filter(r => r.orders > 0).sort((x, y) => y.orders - x.orders) : [];
  if (!rows.length) {
    return card({ title }, empty({ title: 'Second orders are not connected yet', text: 'This needs the products on each order from the store. It will show whether people come back for the same thing or something new.' }));
  }
  const total = rows.reduce((n, r) => n + r.orders, 0), top = rows[0];
  const lower = t => t.charAt(0).toLowerCase() + t.slice(1);
  const strong = (r, text) => r === top ? h('span', { class: 'strong' }, text) : text;
  const tip = d.second.tip;
  return card({ title, note: 'what the second order was', flush: true, class: 'cs-second', action: h('a', { href: ctx.href('customers', 'buy-next') }, 'See what they buy next') },
    h('div', { class: 'cs-big' }, h('b', null, num(top.orders)), h('span', null, `of ${num(total)} second orders were ${lower(top.name)}`)),
    table({
      roomy: true, sort: { key: 'orders', dir: 'desc' },
      cols: [
        { key: 'name', label: 'Second order', class: 'name', render: r => strong(r, r.name) },
        { key: 'orders', label: 'Orders', num: true, sortable: true, width: 110, render: r => strong(r, num(r.orders)) },
        { key: 'share', label: 'Share', num: true, width: 100, render: r => strong(r, pct(r.orders / total, { digits: 1 })) },
        { key: 'bar', label: '', class: 'cs-bar', render: r => h('span', { class: 'lx-cellbar', style: { '--v': (100 * r.orders / total).toFixed(1) + '%' } }) },
      ],
      rows,
    }),
    Array.isArray(tip) && tip.length ? h('div', { class: 'cs-tip' }, h('span', { class: 'lx-gem sm' }, gemIcon()), h('span', null, tip.map(t => typeof t === 'string' ? t : h('b', null, t.b)))) : null);
}
function gemIcon() {
  const t = document.createElement('template');
  t.innerHTML = '<svg class="lx-ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"></path></svg>';
  return t.content.firstChild;
}

/* ---------- the page ---------- */
export default {
  /* the plain question, drawn by the shell above the tabs */
  title: ['Does a customer ', em('pay back'), ' what they cost?'],
  eyebrow: 'Customers',
  stamp: false,                     /* Home's stamp with a refresh button sits in the help bar */

  async load(ctx) {
    if (!ctx.brand) return { connected: false };
    /* act is the brand id from the brands endpoint; the dates are the ones in the page head */
    const r = await ctx.api(`/api/customers?act=${encodeURIComponent(ctx.brand.id)}&months=6&from=${ctx.range.from}&to=${ctx.range.to}`, { signal: ctx.signal });
    return shape(r);
  },

  render(el, d, ctx) {
    style();
    d = d || {};
    const team = !ctx.isClient;
    const top = d.connected === false ? null : figures(d, ctx);

    if (d.connected === false) {
      put(el, top, empty({
        title: 'No sales source connected',
        text: team ? 'Customer numbers come from the store. Connect Triple Whale or Shopify and they will show here.' : 'Customer numbers come from the store. They will show here once it is connected.',
        action: team && ctx.brand ? button('Open integrations', { href: ctx.href('brand-settings', 'integrations') }) : null,
      }));
      return;
    }
    ctx.askWindow = rangeWords(ctx, d.range);
    ctx.askContext = `${ctx.brand.name} customers, ${ctx.askWindow}: ${num(d.new_customers)} new customers of ${num(d.orders)} orders, cost per new customer ${dollars(d.cac)}, ${pct(d.back_90, { digits: 1 })} came back within 90 days, average order ${money(d.aov, { cents: true })}.`;
    put(el, ...[
      helpBar([
        { title: 'What it is for', text: 'The customers in one look: how many were new, what one cost, how many came back and the average order. Each question then has its own tab with the chart.' },
        { title: 'Where the numbers come from', text: 'Triple Whale and Shopify. Cost per new customer is all ad spend over new customers in these dates. Came back counts people, not orders.' },
      ], h('span', { class: 'bz-chip' }, rangeWords(ctx, d.range)), pageStamp(ctx)),
      top,
      d.ltv ? worthCard(d) : null,
      moreCard(ctx),
    ].filter(Boolean));
  },

  skeleton(el) {
    el.innerHTML = '<div class="lx-skel-grid"><div class="lx-skel kpi"></div><div class="lx-skel kpi"></div><div class="lx-skel kpi"></div><div class="lx-skel kpi"></div></div><div class="lx-skel chart"></div><div class="lx-skel chart"></div>';
  },
};

export { crossing };

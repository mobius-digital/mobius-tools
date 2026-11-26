/* Business > Customers > Snapshot.
   Does a customer pay back what they cost? Four figures, the LTV curve against the cost per new
   customer, when they order again, and what the second order was.
   Live numbers: GET /api/customers on the profit worker (the store's unit economics plus the
   customer journey). The reorder weeks and the same or new split have no route yet, so in real
   mode those two cards say so plainly; the fixture carries them for sample mode. */

import { put } from '../../kit.js';
import { h, money, num, pct, card, hero, em, kpi, kpis, takeaway, button, statusDot, delta, legend, table, empty, addStyles } from '../../kit.js';
import { ltvChart, againChart, crossing, halfDayOf } from './charts.js';

const ok = n => n != null && isFinite(n);
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const monthName = ym => MONTHS[+String(ym).slice(5, 7) - 1] || '';

/* ---------- the little CSS this page needs and the kit does not have ---------- */
const CSS = `
.cs-big{display:flex;align-items:baseline;gap:12px;flex-wrap:wrap;margin-bottom:10px}
.cs-big b{font-size:var(--fs-hero);font-weight:600;letter-spacing:-.04em;line-height:1.02;font-variant-numeric:tabular-nums;color:var(--ink)}
.cs-big>span:not(.lx-hero-num){color:var(--muted);font-size:13.5px}
.cs-chart{padding:28px 32px 22px}
.cs-second .cs-big{padding:6px 28px 12px;margin:0}
.cs-second .lx-cellbar{display:block;width:100%;margin-left:0}
.cs-second .cs-bar{padding-left:28px;width:46%}
.cs-tip{display:flex;align-items:center;gap:10px;padding:14px 28px 20px;border-top:1px solid var(--line);font-size:14px;color:var(--ink-2)}
.cs-tip b{color:var(--ink);font-weight:650}
.cs-kpis .lx-kpi .s{flex-wrap:wrap}
@media (max-width:759px){
  .cs-chart{padding:18px}
  .cs-big b{font-size:var(--num-xl)}
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
  const at = d => { const c = curve.find(x => x.days === d); return c ? c.repeat_rate : null; };
  const firstCac = months.find(m => ok(m.cac));
  const prev = whole[whole.length - 1];
  return {
    connected: !!((r.account && r.account.tw_shop) || hd.orders > 0 || months.length),
    range: { from: r.window && r.window.from, to: r.window && r.window.to },
    new_customers: hd.orders > 0 ? hd.new_orders : null,
    orders: hd.orders > 0 ? hd.orders : null,
    new_spark: whole.map(m => m.new_orders),
    cac: hd.cac, cac_goal: null,
    cac_then: firstCac && firstCac !== months[months.length - 1] ? { label: monthName(firstCac.month), value: firstCac.cac } : null,
    cac_spark: months.map(m => m.cac),
    back_90: at(90), back_365: at(365),
    back_spark: curve.length ? [0, ...curve.map(c => (c.repeat_rate || 0) * 100)] : [],
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

function figures(d) {
  const share = ok(d.new_customers) && d.orders > 0 ? d.new_customers / d.orders : null;
  const over = ok(d.cac) && ok(d.cac_goal) ? d.cac > d.cac_goal : null;
  const aovMove = ok(d.aov_move) ? d.aov_move : ok(d.aov) && d.aov_prev && d.aov_prev.value > 0 ? d.aov / d.aov_prev.value - 1 : null;
  const list = [
    { label: 'New customers', value: ok(d.new_customers) ? num(d.new_customers) : 'no data',
      sub: ok(share) ? `${pct(share)} of ${num(d.orders)} orders` : null, spark: d.new_spark },
    { label: 'Cost per new customer', value: ok(d.cac) ? dollars(d.cac) : 'no data',
      delta: ok(d.cac_goal) ? statusDot(over ? 'bad' : 'good', 'goal ' + dollars(d.cac_goal)) : null,
      sub: d.cac_then && ok(d.cac_then.value) ? `${dollars(d.cac_then.value)} in ${d.cac_then.label}` : null, spark: d.cac_spark },
    { label: 'Came back in 90 days', value: ok(d.back_90) ? pct(d.back_90, { digits: 1 }) : 'no data',
      sub: ok(d.back_365) ? pct(d.back_365, { digits: 1 }) + ' within a year' : null, spark: d.back_spark },
    { label: 'Average order', value: ok(d.aov) ? dollars(d.aov) : 'no data',
      delta: ok(aovMove) && Math.abs(aovMove) >= 0.005 ? delta(aovMove) : null,
      sub: d.aov_prev && ok(d.aov_prev.value) ? `${d.aov_prev.label} ${dollars(d.aov_prev.value)}` : null, spark: d.aov_spark },
  ];
  const el = kpis(list.map(k => kpi({ ...k, size: 'lg', spark: (k.spark || []).filter(ok) })), { cols: 4 });
  el.classList.add('cs-kpis');
  return el;
}

/** The one sentence: does the customer pay back, by day 90 (or the furthest day we can see). */
function verdict(d, ctx) {
  if (!ok(d.cac) || !d.ltv) return null;
  const want = d.ltv.days.indexOf(90), i = want > 0 ? want : d.ltv.days.length - 1;
  const day = d.ltv.days[i], worth = d.ltv.values[i];
  if (!ok(worth) || !day) return null;
  const ratio = worth / d.cac;
  const lead = ratio < 1 ? 'Not yet. ' : ratio < 1.2 ? 'Only just. ' : 'Yes. ';
  const ask = ctx.isClient ? null : button('Ask why', { href: ctx.href('ask', 'index') });
  return takeaway([lead, 'A new customer costs ', h('b', null, dollars(d.cac)), ' and is worth ', h('b', null, dollars(worth)), ` in sales by day ${day}, before product cost.`], { action: ask });
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
    head('What is a customer worth over time?', 'LTV per customer, in sales before product cost',
      legend([{ name: 'LTV per customer', lead: true }, ok(d.cac) && { name: 'Cost per new customer', dashed: true }].filter(Boolean))),
    h('div', { class: 'cs-big' }, h('span', { class: 'lx-hero-num' }, dollars(d.ltv.values[last])), h('span', null, 'LTV at day ' + d.ltv.days[last])),
    ltvChart({ days: d.ltv.days, values: d.ltv.values, cac: d.cac }));
}

function againCard(d) {
  const title = 'When do they order again?';
  if (!d.again || !(d.again.weeks || []).some(v => v > 0)) {
    return card({ title }, empty({ title: 'Reorder timing is not connected yet', text: 'This needs each customer’s order dates from the store. It will show second orders by week after the first order.' }));
  }
  const a = d.again, half = ok(a.half_day) ? a.half_day : halfDayOf(a.weeks, a.same_day, a.repeaters);
  const key = legend([{ name: 'Second orders that week', square: true, color: '#C9CED9' }, ok(a.repeaters) && { name: 'Running share of repeat buyers' }]);
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
    const top = hero({}, d.connected === false ? null : figures(d));
    top.classList.add('line');

    if (d.connected === false) {
      put(el, top, empty({
        title: 'No sales source connected',
        text: team ? 'Customer numbers come from the store. Connect Triple Whale or Shopify and they will show here.' : 'Customer numbers come from the store. They will show here once it is connected.',
        action: team && ctx.brand ? button('Open integrations', { href: ctx.href('brand-settings', 'integrations') }) : null,
      }));
      return;
    }
    put(el, ...[
      top,
      verdict(d, ctx),
      worthCard(d),
      againCard(d),
      secondCard(d, ctx),
      h('p', { class: 'lx-foot' }, 'Sources: Triple Whale and Shopify. LTV is sales per customer, before product cost.'),
    ].filter(Boolean));
  },

  skeleton(el) {
    el.innerHTML = '<div class="lx-skel-grid"><div class="lx-skel kpi"></div><div class="lx-skel kpi"></div><div class="lx-skel kpi"></div><div class="lx-skel kpi"></div></div><div class="lx-skel chart"></div><div class="lx-skel chart"></div>';
  },
};

export { crossing };

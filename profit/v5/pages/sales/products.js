/* Business > Sales > Products. "Which products carry the store?"
   Live: the products in the dates' orders with orders and sales (GET /api/hub/store on the profit worker, its
   `products` list: Triple Whale orders, the first three products in each cart, an order's money shared between them).
   No route yet: units, returns and the first-order share per product (those columns show in sample mode only) and
   what is bought together (that card is drawn from the example file with a chip). */

import { put } from '../../kit.js';
import { h, em, card, kpi, kpis, table, barChart, skeleton, money } from '../../kit.js';
import { ok, usd, sum, css, head, barCell, exampleChip, example, notConnected, num, pct } from '../email/_em.js';

function shape(ctx, b, ex) {
  const rows = (b.products || []).map(p => ({ id: String(p.id), title: p.title, type: null, orders: p.orders, units: null, sales: p.revenue, returned: null, first_order: null }));
  return { connected: rows.length > 0 || ((b.cur || {}).revenue || 0) > 0, range: { from: ctx.range.from, to: ctx.range.to }, orders: b.product_orders, approx: true,
    products: rows, pairs: ex && ex.pairs ? ex.pairs : null, example: ex && ex.pairs ? ['pairs'] : [] };
}
/* A short x label that still tells two colors of one product apart: "Ridgeline Magnetic Belt, Black" -> "Ridgeline, Black". */
const short = t => {
  const [name, rest] = String(t || '').split(':')[0].split(/,\s*/), words = name.split(/\s+/);
  const s = rest ? words[0] + ', ' + rest : words.length > 2 ? words.slice(0, 2).join(' ') : name;
  return s.length > 16 ? s.slice(0, 15).trim() + '.' : s;
};

function figures(d) {
  const rows = d.products.slice().sort((a, b) => (b.sales || 0) - (a.sales || 0)), total = sum(rows, 'sales'), top = rows[0];
  const top3 = sum(rows.slice(0, 3), 'sales');
  const el = kpis([
    kpi({ label: 'Best seller', size: 'lg', value: usd(top.sales), sub: top.title }),
    kpi({ label: 'Top three products', size: 'lg', value: total ? pct(top3 / total) : 'no data', sub: 'of product sales' }),
    kpi({ label: 'Products that sold', size: 'lg', value: num(rows.filter(r => r.orders > 0).length), sub: d.approx ? 'the top sellers in these dates' : 'in these dates' }),
    kpi({ label: 'Orders read', size: 'lg', value: ok(d.orders) ? num(d.orders) : 'no data', sub: 'orders with products on them' }),
  ], { cols: 4 });
  el.classList.add('em-kpis');
  return el;
}

function chartCard(d) {
  const rows = d.products.slice().sort((a, b) => (b.sales || 0) - (a.sales || 0)).slice(0, 8);
  if (rows.length < 2) return null;
  const b = v => h('b', null, v);
  return card({ class: 'em-chart' },
    head('Sales by product', 'The top ' + rows.length),
    barChart({ values: rows.map(r => r.sales || 0), labels: rows.map(r => short(r.title)), lead: 0, format: v => money(v, { compact: true }), height: 320, phoneHeight: 270,
      label: 'Sales by product, the top ' + rows.length,
      hover: i => [b(rows[i].title), h('span', null, 'Sales ', b(usd(rows[i].sales))), h('span', null, 'Orders ', b(num(rows[i].orders)))] }));
}

function listCard(d) {
  const rows = d.products, total = sum(rows, 'sales') || 1, has = k => rows.some(r => ok(r[k]));
  return card({ title: 'Every product', note: d.approx ? 'an order\'s money is shared between its products' : 'sorted by sales', flush: true, class: 'em-flush' },
    table({ roomy: true, rows, sort: { key: 'sales', dir: 'desc' }, cols: [
      { key: 'title', label: 'Product', class: 'name', render: r => h('span', { class: 'em-name' }, r.title, r.type ? h('small', null, r.type) : null) },
      { key: 'orders', label: 'Orders', num: true, sortable: true, render: r => num(r.orders) },
      has('units') && { key: 'units', label: 'Units', num: true, sortable: true, class: 'hide-sm', render: r => (ok(r.units) ? num(r.units) : '') },
      has('first_order') && { key: 'first_order', label: 'In first orders', num: true, sortable: true, class: 'hide-md', render: r => (ok(r.first_order) ? pct(r.first_order) : '') },
      has('returned') && { key: 'returned', label: 'Returned', num: true, sortable: true, class: 'hide-md', render: r => (ok(r.returned) ? pct(r.returned, { digits: 1 }) : '') },
      { key: 'share', label: 'Share', num: true, class: 'hide-sm', value: r => r.sales, render: r => pct((r.sales || 0) / total, { digits: 1 }) },
      { key: 'sales', label: 'Sales', num: true, sortable: true, render: r => barCell(h('span', { class: 'strong' }, usd(r.sales)), (r.sales || 0) / (rows.reduce((m, x) => Math.max(m, x.sales || 0), 1))) },
    ].filter(Boolean) }));
}

function pairsCard(d) {
  const rows = d.pairs || [];
  if (!rows.length) return null;
  const isEx = (d.example || []).includes('pairs'), max = Math.max(...rows.map(r => r.orders || 0), 1);
  return card({ title: 'Bought together', note: isEx ? exampleChip() : 'pairs in the same order', flush: true, class: 'em-flush em-wrap' },
    table({ roomy: true, rows, sort: { key: 'orders', dir: 'desc' }, cols: [
      { key: 'a', label: 'Pair', class: 'name wrap', render: r => [r.a, h('span', { class: 'em-none' }, ' with '), r.b] },
      { key: 'orders', label: 'Orders', num: true, sortable: true, render: r => barCell(h('span', { class: 'strong' }, num(r.orders)), r.orders / max) },
    ] }));
}

export default {
  title: ['Which products ', em('carry the store?')],
  eyebrow: 'Sales',

  async load(ctx) {
    if (!ctx.brand) return { connected: false };
    const [r, ex] = await Promise.all([
      ctx.api(`/api/hub/store?act=${encodeURIComponent(ctx.brand.id)}&from=${ctx.range.from}&to=${ctx.range.to}`, { signal: ctx.signal }),
      example(ctx, 'products'),
    ]);
    return shape(ctx, (r.brands || [])[0] || {}, ex);
  },

  skeleton(el) { put(el, h('div', { class: 'lx-skel-grid' }, skeleton('kpi', 4)), skeleton('chart'), skeleton('row', 6)); },

  render(el, d, ctx) {
    css();
    d = d || {};
    if (d.connected === false) {
      put(el, notConnected(ctx, { title: 'No sales source connected',
        text: 'Products show here once the store is connected.',
        teamText: 'Products come from the store\'s orders through Triple Whale. Set the brand\'s Triple Whale shop in Brand settings, Integrations.' }));
      return;
    }
    if (!(d.products || []).length) {
      put(el, notConnected({ ...ctx, isClient: true }, { title: 'No orders with products in these dates', text: 'Pick a longer range, or check back once today\'s orders have synced.' }));
      return;
    }
    const isEx = (d.example || []).includes('pairs');
    put(el, ...[
      h('section', { class: 'lx-hero line' }, figures(d)),
      chartCard(d),
      listCard(d),
      pairsCard(d),
      h('p', { class: 'lx-foot' }, 'Orders and sales are from Triple Whale\'s orders.' + (d.approx ? ' Sales per product are close, not exact: an order\'s money is shared between the products in it.' : '')
        + (isEx ? ' "Bought together" is an example until its data feed is built.' : '')),
    ].filter(Boolean));
  },
};

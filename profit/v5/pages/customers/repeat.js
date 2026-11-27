/* Business > Customers > Repeat orders.
   Do customers come back, and when? The share back by each day after the first order, the weeks the
   second orders land in, each month's customers followed since, and where first and repeat orders come from.
   Live numbers: GET /api/customers on the profit worker (journey.curve, journey.days_to_second,
   journey.cohorts, journey.sources, journey.orders_per_customer_365). The second orders by week have
   no route yet: that card draws the sample file under an "Example" chip in real mode. All time, so the
   page has no date range. */

import { put } from '../../kit.js';
import { askWhy, helpBar, dl } from '../home/_biz.js';
import { exampleChip as kitExampleChip } from '../../kit.js';
import { h, num, pct, card, em, takeaway, button, table, empty, lineChart, legend, statusDot, addStyles } from '../../kit.js';
import { tileRow, tipRows, pageStamp, TW } from '../month/_m.js';
import { againChart, halfDayOf } from './charts.js';

const ok = n => n != null && isFinite(n);
const b = v => h('b', null, v);
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const monthLabel = ym => MON[+String(ym).slice(5, 7) - 1] + ' ’' + String(ym).slice(2, 4);

const CSS = `
.rp-pad{padding:28px 32px 22px}
.rp-head{display:flex;align-items:flex-start;gap:12px 20px;flex-wrap:wrap;margin-bottom:8px}
.rp-head>div:first-child{flex:1 1 260px;min-width:0}
.rp-head h3{font-size:var(--fs-card,14px);font-weight:600;letter-spacing:-.005em}
.rp-head p{color:var(--muted);font-size:13px;margin-top:2px}
.rp-head .tools{display:flex;align-items:center;gap:10px;flex-wrap:wrap}
.rp-big{display:flex;align-items:baseline;gap:12px;flex-wrap:wrap;margin:6px 0 16px}
.rp-big>span:last-child{color:var(--muted);font-size:13.5px}
.rp-flush .rp-head{padding:20px 28px 6px;margin:0}
.rp-chip{display:inline-flex;align-items:center;height:22px;padding:0 9px;border-radius:999px;background:var(--warn-bg);color:var(--warn);font-size:11.5px;font-weight:600;white-space:nowrap}
.rp-kpis .lx-kpi .s{flex-wrap:wrap}
.rp-bar{display:block;width:100%;min-width:60px;height:5px;border-radius:999px;background:var(--bg-sunk);position:relative}
.rp-bar::after{content:"";position:absolute;left:0;top:0;bottom:0;width:var(--v,0%);background:var(--ink);border-radius:999px}
.rp-bar.soft::after{background:var(--icon)}
.lx-table td.rp-barcell{width:30%;min-width:80px}
.rp-young{color:var(--faint)}
.rp-num{font-size:var(--num-l);font-weight:600;letter-spacing:-.03em;font-variant-numeric:tabular-nums;color:var(--ink)}
@media (max-width:759px){
  .rp-pad{padding:18px}
  .rp-flush .rp-head{padding:16px 18px 6px}
  .rp-kpis .lx-kpi.lg .v{font-size:var(--num-l)}
  .rp-kpis .lx-kpi .l{white-space:normal}
  .rp-big .rp-num{font-size:var(--num-m)}
}`;
const headOf = (title, sub, ...tools) => h('div', { class: 'rp-head' }, h('div', null, h('h3', null, title), sub ? h('p', null, sub) : null), tools.filter(Boolean).length ? h('div', { class: 'tools' }, tools.filter(Boolean)) : null);
const chip = () => kitExampleChip();
const bar = (share, soft) => h('span', { class: 'rp-bar' + (soft ? ' soft' : ''), style: { '--v': Math.max(0, Math.min(100, 100 * (share || 0))).toFixed(1) + '%' } });

const SRC = { meta: 'Meta', google: 'Google', tiktok: 'TikTok', other_ads: 'Other ads', email: 'Email and SMS', own: 'On their own' };

function shape(r, sample) {
  const hd = r.headline || {}, j = r.journey && r.journey.have ? r.journey : null;
  const connected = !!((r.account && r.account.tw_shop) || hd.orders > 0);
  if (!j) return { connected, reason: r.journey && r.journey.reason || null };
  const curve = (j.curve || []).filter(c => ok(c.repeat_rate));
  const rate = d => { const c = curve.find(x => x.days === d); return c ? c.repeat_rate : null; };
  const ids = [...new Set([...(j.sources.first || []), ...(j.sources.repeat || [])].map(x => x.source))];
  const shareOf = (list, id) => { const x = (list || []).find(y => y.source === id); return x ? x.share : 0; };
  return {
    connected: true, example: ['again'],
    back_90: rate(90), back_365: rate(365), back_ever: j.repeat_rate_ever,
    days_to_second: j.days_to_second, per_customer_365: j.orders_per_customer_365,
    orders: j.window ? j.window.orders : null, repeat_orders: j.window ? j.window.returning_orders : null,
    curve: { days: curve.map(c => c.days), rate: curve.map(c => c.repeat_rate) },
    again: sample.again || null,
    cohorts: (j.cohorts || []).map(c => ({ month: c.month, customers: c.customers, back_90: null, back_ever: c.repeat_rate, young: c.age_days < 90 })),
    sources: ids.map(id => ({ id, name: SRC[id] || id, first: shareOf(j.sources.first, id), repeat: shareOf(j.sources.repeat, id) })),
  };
}

function figures(d) {
  const share = ok(d.repeat_orders) && d.orders > 0 ? d.repeat_orders / d.orders : null;
  const list = [
    { label: dl('Came back in 90 days', { name: 'Came back in 90 days', definition: 'Share of new customers who placed a second order within 90 days of their first. Counts people, not orders.', source: 'Triple Whale orders' }), value: ok(d.back_90) ? pct(d.back_90, { digits: 1 }) : 'no data', sub: ok(d.back_365) ? pct(d.back_365, { digits: 1 }) + ' within a year' : null },
    { label: 'Days to the second order', value: ok(d.days_to_second) ? num(d.days_to_second) : 'no data', sub: ok(d.days_to_second) ? 'the middle repeat buyer' : null },
    { label: 'Orders per customer in a year', value: ok(d.per_customer_365) ? num(d.per_customer_365, 2) : 'no data', sub: ok(d.per_customer_365) ? 'first order plus ' + num(d.per_customer_365 - 1, 2) + ' more' : null },
    { label: dl('Orders from returning buyers', { name: 'Orders from returning buyers', definition: 'Share of the orders in these dates placed by someone who had ordered before. Counts orders, not people.', source: 'Triple Whale' }), value: ok(share) ? pct(share, { digits: 1 }) : 'no data', sub: ok(share) ? `${num(d.repeat_orders)} of ${num(d.orders)} orders` : null, window: 'Last 90 days' },
  ];
  /* no sparks in this row: two of the four have no series, and the curve card right under it draws the share back by day */
  return tileRow(list, { cols: 4, window: 'Every first order, followed since', source: TW + ' orders' });
}

/* One sentence, only for what the tiles do not show: which channel repeat orders lean on. */
function say(d, ctx) {
  const src = (d.sources || []).slice().sort((a, b) => (b.repeat - b.first) - (a.repeat - a.first))[0];
  if (!src || !(src.repeat > src.first)) return null;
  return takeaway(['Repeat orders lean on ', b(src.name), ': ', pct(src.repeat), ' of them, against ', pct(src.first), ' of first orders.'],
    { action: ctx.isClient ? null : askWhy(ctx, 'Do they come back, and when') });
}

function curveCard(d) {
  const c = d.curve || { days: [], rate: [] };
  if (c.days.length < 2) return null;
  const days = [0, ...c.days], rate = [0, ...c.rate], last = days[days.length - 1];
  return card({ class: 'rp-pad' },
    headOf('How many come back, and by when?', 'Share of new customers who placed a second order, by day after the first · ' + TW + ' orders'),
    h('div', { class: 'rp-big' }, h('b', { class: 'rp-num' }, pct(rate[rate.length - 1], { digits: 1 })), h('span', null, `back by day ${last}`)),
    lineChart({
      xs: days, series: [{ name: 'Came back', lead: true, points: true, values: rate.map(v => v * 100), labels: (v, i) => (i ? v.toFixed(1) + '%' : '') }],
      labels: days.map((v, i) => (i === 0 ? 'First order' : i === days.length - 1 ? 'Day ' + v : String(v))),
      format: v => Math.round(v) + '%', endFormat: v => v.toFixed(1) + '%', yTicks: 3, height: 320, phoneHeight: 270,
      windowLabel: `By day after the first order, day 0 to ${last}`,
      label: `Share of new customers back for a second order by day ${days.slice(1).join(', ')}: ${rate.slice(1).map(v => pct(v, { digits: 1 })).join(', ')}.`,
      hover: i => tipRows(i ? 'Day ' + days[i] : 'First order', [['Came back', pct(rate[i], { digits: 1 }), 'lead']]),
    }));
}

function againCard(d) {
  const a = d.again;
  if (!a || !(a.weeks || []).length) return null;
  const half = ok(a.half_day) ? a.half_day : halfDayOf(a.weeks, a.same_day, a.repeaters);
  const ex = (d.example || []).includes('again');
  return card({ class: 'rp-pad' },
    headOf('When do they order again?', 'Second orders by week after the first order · every first order, followed since · ' + TW + ' orders', ex ? chip() : null,
      legend([{ name: 'Second orders that week', square: true, color: 'var(--brand)' }, { name: 'Running share of repeat buyers' }])),
    ok(half) ? h('div', { class: 'rp-big' }, h('b', { class: 'rp-num' }, 'Day ' + half), h('span', null, `half of the ${num(a.repeaters)} repeat buyers are back`)) : null,
    againChart({ weeks: a.weeks, sameDay: a.same_day, repeaters: a.repeaters, halfDay: half }));
}

function cohortCard(d) {
  const rows = (d.cohorts || []).slice().reverse();
  if (!rows.length) return null;
  const grown = rows.filter(c => !c.young && ok(c.back_90));
  const max = Math.max(0.01, ...rows.map(c => c.back_ever || 0));
  const has90 = rows.some(c => ok(c.back_90));
  const avg90 = grown.length ? grown.reduce((s, c) => s + c.back_90, 0) / grown.length : null;
  return card({ class: 'rp-flush', flush: true },
    headOf('Are newer customers coming back as often?', 'Each month’s new customers, newest first; older months have had longer to come back · ' + TW + ' orders'),
    table({
      cols: [
        { key: 'month', label: 'First order', class: 'name', sortable: true, render: c => monthLabel(c.month) },
        { key: 'customers', label: 'Customers', num: true, class: 'hide-sm', sortable: true, render: c => num(c.customers) },
        has90 && { key: 'back_90', label: 'Back in 90 days', num: true, render: c => (ok(c.back_90) ? (ok(avg90) && c.back_90 < avg90 * 0.9 ? statusDot('warn', pct(c.back_90, { digits: 1 })) : pct(c.back_90, { digits: 1 })) : h('span', { class: 'rp-young' }, 'too new')) },
        { key: 'back_ever', label: 'Back so far', num: true, sortable: true, render: c => (ok(c.back_ever) ? pct(c.back_ever, { digits: 1 }) : 'no data') },
        { key: 'bar', label: '', class: 'rp-barcell hide-sm', render: c => bar((c.back_ever || 0) / max, c.young) },
      ].filter(Boolean),
      rows, sort: { key: 'month', dir: 'desc' },
    }));
}

function sourceCard(d) {
  const rows = (d.sources || []).filter(s => s.first > 0 || s.repeat > 0).sort((a, b) => b.repeat - a.repeat);
  if (!rows.length) return null;
  const max = Math.max(...rows.flatMap(s => [s.first, s.repeat]));
  return card({ class: 'rp-flush', flush: true },
    headOf('Where do first and repeat orders come from?', 'Share of each, by the last click before the order · ' + TW + ', last click', legend([{ name: 'First orders', square: true, color: 'var(--icon)' }, { name: 'Repeat orders', square: true, color: 'var(--ink)' }])),
    table({
      roomy: true,
      cols: [
        { key: 'name', label: 'Source', class: 'name', render: s => s.name },
        { key: 'first', label: 'First orders', num: true, sortable: true, render: s => pct(s.first) },
        { key: 'fb', label: '', class: 'rp-barcell hide-sm', render: s => bar(s.first / max, true) },
        { key: 'repeat', label: 'Repeat orders', num: true, sortable: true, render: s => pct(s.repeat) },
        { key: 'rb', label: '', class: 'rp-barcell hide-sm', render: s => bar(s.repeat / max) },
      ],
      rows,
    }));
}

export default {
  title: ['Do they come back, ', em('and when?')],
  eyebrow: 'Customers',
  stamp: false,                     /* Home's stamp with a refresh button sits in the help bar */
  ranges: false,

  async load(ctx) {
    if (!ctx.brand) return { connected: false };
    const [r, sample] = await Promise.all([
      ctx.api(`/api/customers?act=${encodeURIComponent(ctx.brand.id)}&months=12&days=90`, { signal: ctx.signal }),
      ctx.fixture('repeat.json').catch(() => ({})),
    ]);
    return shape(r, sample || {});
  },

  render(el, d, ctx) {
    addStyles('rp-style', CSS);
    d = d || {};
    const team = !ctx.isClient;
    if (!d.connected || !d.curve) {
      put(el, empty({
        title: d.connected ? 'No order history yet' : 'No sales source connected',
        text: d.connected ? (d.reason || 'Customer history fills in overnight once the store’s orders arrive.')
          : team ? 'Repeat orders need the store’s orders. Connect Triple Whale or Shopify in Brand settings and they will show here.' : 'Repeat orders will show here once the store is connected.',
        action: !d.connected && team && ctx.brand ? button('Open integrations', { href: ctx.href('brand-settings', 'integrations') }) : null,
      }));
      return;
    }
    ctx.askWindow = 'Every first order, followed since';
    ctx.askContext = `${ctx.brand.name} repeat orders: ${pct(d.back_90, { digits: 1 })} of new customers back within 90 days, ${pct(d.back_365, { digits: 1 })} within a year, the middle repeat buyer comes back on day ${num(d.days_to_second)}.`;
    put(el, ...[
      helpBar([
        { title: 'What it is for', text: 'Do customers come back, how soon, and which channel brings the repeat orders.' },
        { title: 'How it is counted', text: 'Triple Whale orders, followed per customer. Came back counts people, not orders. A month needs 90 days before it has a 90 day read.' },
      ], pageStamp(ctx)),
      figures(d),
      say(d, ctx),
      curveCard(d),
      againCard(d),
      cohortCard(d),
      sourceCard(d),
    ].filter(Boolean));
  },

  skeleton(el) {
    el.innerHTML = '<div class="lx-skel-grid"><div class="lx-skel kpi"></div><div class="lx-skel kpi"></div><div class="lx-skel kpi"></div><div class="lx-skel kpi"></div></div><div class="lx-skel chart"></div><div class="lx-skel chart"></div>';
  },
};

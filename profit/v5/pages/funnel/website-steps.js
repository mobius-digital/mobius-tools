/* Business > Full funnel > Website steps.
   Once someone is on the site, which step loses them? Visits, added to cart, reached checkout, bought,
   then the same steps by device, by channel and by landing page.
   Live numbers: GET /api/google/website on the account-health worker (Google Analytics), with the
   period before for the comparison. Nothing on this page is sample data in real mode. */

import { put } from '../../kit.js';
import { askWhy, helpBar, dl, rangeWords } from '../home/_biz.js';
import { h, num, pct, card, em, takeaway, button, table, empty, delta, segmented, lineChart, legend, statusDot } from '../../kit.js';
import { tileRow, tipRows, pageStamp, VISITS_THAT_BUY, GA } from '../month/_m.js';
import { fxStyles, steps, head, bar } from './_flow.js';

const ok = n => n != null && isFinite(n);
const of = (a, b) => (ok(a) && b > 0 ? a / b : null);
const DAY = 864e5;
const iso = t => new Date(t).toISOString().slice(0, 10);
const shortDay = d => { const [, m, dd] = d.split('-'); return ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][+m - 1] + ' ' + +dd; };

const DEVICE = { mobile: 'Phone', desktop: 'Computer', tablet: 'Tablet', 'smart tv': 'TV' };
const CHANNEL = { 'Paid Social': 'Paid social', 'Paid Search': 'Paid search', 'Organic Search': 'Organic search', 'Organic Social': 'Organic social', 'Paid Shopping': 'Paid shopping', 'Cross-network': 'Google, all placements', Unassigned: 'Other', '(other)': 'Other' };
const row = (name, r) => ({ name, visits: r.sessions || 0, carts: r.addToCarts || 0, checkouts: r.checkouts || 0, orders: r.ecommercePurchases || 0 });

function shape(r) {
  if (!r || r.error) return { connected: false, reason: r && r.error === 'not_linked' ? 'not_linked' : 'error' };
  const c = r.cur || {}, p = r.prev || null;
  return {
    connected: c.sessions > 0, reason: c.sessions > 0 ? null : 'empty',
    steps: { visits: c.sessions, engaged: c.engagedSessions, carts: c.addToCarts, checkouts: c.checkouts, orders: c.ecommercePurchases },
    prev: p && p.sessions > 0 ? { visits: p.sessions, carts: p.addToCarts, checkouts: p.checkouts, orders: p.ecommercePurchases } : null,
    days: (r.days || []).map(d => ({ date: d.date, visits: d.sessions || 0, carts: d.addToCarts ?? null, checkouts: d.checkouts ?? null, orders: d.purchases || 0 })),
    devices: (r.devices || []).map(x => row(DEVICE[String(x.device).toLowerCase()] || x.device, x)),
    channels: (r.channels || []).map(x => row(CHANNEL[x.group] || x.group, x)),
    pages: (r.landing || []).filter(x => x.page && x.page !== '(not set)').slice(0, 12).map(x => row(x.page, x)),
  };
}

function figures(d, ctx) {
  const s = d.steps, p = d.prev;
  const move = (now, then) => (ok(now) && then > 0 ? now / then - 1 : null);
  const point = (now, then) => (ok(now) && ok(then) ? delta(now - then, { text: (now - then >= 0 ? '+' : '') + ((now - then) * 100).toFixed(1) + ' pts' }) : null);
  const cart = of(s.carts, s.visits), check = of(s.checkouts, s.carts), buy = of(s.orders, s.visits);
  /* a step's daily rate when the days carry both counts (Google Analytics gives carts and checkouts by day) */
  const daily = (top, base) => (d.days.some(x => ok(x[top])) ? d.days.map(x => (ok(x[top]) && x[base] > 0 ? 100 * x[top] / x[base] : null)) : null);
  const list = [
    { label: 'Visits', value: num(s.visits), delta: p && ok(move(s.visits, p.visits)) ? delta(move(s.visits, p.visits)) : null, sub: p ? 'against the period before' : null, spark: d.days.map(x => x.visits) },
    { label: 'Add to cart', value: ok(cart) ? pct(cart, { digits: 1 }) : 'no data', delta: p ? point(cart, of(p.carts, p.visits)) : null, sub: ok(s.carts) ? `${num(s.carts)} visits` : null, spark: daily('carts', 'visits'), sparkFormat: v => v.toFixed(1) + '%' },
    { label: 'Carts that reach checkout', value: ok(check) ? pct(check) : 'no data', delta: p ? point(check, of(p.checkouts, p.carts)) : null, sub: ok(s.checkouts) ? `${num(s.checkouts)} checkouts` : null, spark: daily('checkouts', 'carts'), sparkFormat: v => Math.round(v) + '%' },
    { label: dl('Visits that buy', VISITS_THAT_BUY), value: ok(buy) ? pct(buy, { digits: 1 }) : 'no data', delta: p ? point(buy, of(p.orders, p.visits)) : null, sub: ok(s.orders) ? `${num(s.orders)} orders` : null, spark: d.days.map(x => of(x.orders, x.visits)).map(v => (ok(v) ? v * 100 : null)), sparkFormat: v => v.toFixed(2) + '%' },
  ];
  return tileRow(list, { cols: 4, window: rangeWords(ctx, d.range), source: GA, labels: d.days.map(x => shortDay(x.date)) });
}

function stepCard(d, ctx) {
  const s = d.steps;
  const raw = [
    { key: 'visits', label: 'Visits', value: s.visits, sub: 'every channel' },
    { key: 'engaged', label: 'Stayed and looked', value: s.engaged, sub: ok(of(s.engaged, s.visits)) ? pct(of(s.engaged, s.visits)) + ' of visits' : '' },
    { key: 'carts', label: 'Added to cart', value: s.carts, r: of(s.carts, s.engaged || s.visits), sub: ok(of(s.carts, s.visits)) ? pct(of(s.carts, s.visits), { digits: 1 }) + ' of visits' : '' },
    { key: 'checkouts', label: 'Reached checkout', value: s.checkouts, r: of(s.checkouts, s.carts), sub: ok(of(s.checkouts, s.carts)) ? pct(of(s.checkouts, s.carts)) + ' of carts' : '' },
    { key: 'orders', label: 'Bought', value: s.orders, r: of(s.orders, s.checkouts), sub: ok(of(s.orders, s.checkouts)) ? pct(of(s.orders, s.checkouts)) + ' of checkouts' : '' },
  ].filter(x => ok(x.value));
  const judged = raw.filter(x => ok(x.r));
  const worst = judged.length > 1 ? judged.reduce((a, b) => (b.r < a.r ? b : a)) : null;
  if (worst) worst.worst = true;
  const lost = worst ? raw[raw.indexOf(worst) - 1].value - worst.value : null;
  const words = { carts: 'never add to cart', checkouts: 'leave with a full cart', orders: 'start checkout and do not finish' };
  return card({ class: 'fx-pad' },
    head('Which step loses the most people?', 'Visits to orders, all on one scale'),
    h('div', { class: 'fx-src' }, rangeWords(ctx, d.range) + ' · ' + GA),
    h('div', { class: 'fx-big' }, h('span', { class: 'fx-bigtxt' }, `${num(s.visits)} visits to ${num(s.orders)} orders`)),
    steps(raw, { height: 320 }),
    worst ? h('div', { style: { marginTop: '20px' } }, takeaway([h('b', null, num(lost)), ` people ${words[worst.key]}. That is the step to fix first.`],
      { action: ctx.isClient ? null : askWhy(ctx, 'Which step loses the most people') })) : null);
}

function rateCard(d, ctx) {
  const days = d.days.filter(x => x.visits > 0);
  if (days.length < 3) return null;
  const rate = days.map(x => 100 * x.orders / x.visits);
  const all = of(d.steps.orders, d.steps.visits);
  return card({ class: 'fx-pad' },
    head('Is the share of visits that buy holding?', 'Orders out of ' + GA + ' visits, day by day · orders as ' + GA + ' counts them', legend([{ name: 'Visits that buy', lead: true }, ok(all) && { name: 'Average for these dates', dashed: true }])),
    lineChart({
      series: [{ name: 'Visits that buy', lead: true, values: rate, end: v => v.toFixed(1) + '%' }],
      labels: days.map(x => shortDay(x.date)),
      goal: ok(all) ? { value: all * 100, label: 'Average ' + pct(all, { digits: 1 }), at: 'start' } : null,
      format: v => v.toFixed(1) + '%', endFormat: v => v.toFixed(1) + '%', yTicks: 3, height: 340, phoneHeight: 280,
      windowLabel: 'Daily, ' + rangeWords(ctx, { from: days[0].date, to: days[days.length - 1].date }),
      label: `Share of visits that buy, by day. Average ${pct(all, { digits: 1 })}.`,
      hover: i => tipRows(shortDay(days[i].date), [['Visits that buy', rate[i].toFixed(1) + '%', 'lead'], ['Orders', num(days[i].orders)], ['Visits', num(days[i].visits)]]),
    }));
}

const VIEWS = [{ id: 'devices', label: 'Device' }, { id: 'channels', label: 'Channel' }, { id: 'pages', label: 'Landing page' }];
function splitCard(d, ctx) {
  const have = VIEWS.filter(v => (d[v.id] || []).length);
  if (!have.length) return null;
  let view = ctx.settingNow('funnel.stepsBy', have[0].id);
  if (!have.some(v => v.id === view)) view = have[0].id;
  const body = h('div');
  const paint = () => {
    const rows = d[view].filter(r => r.visits > 0).sort((a, b) => b.visits - a.visits);
    const max = rows.length ? rows[0].visits : 1, total = rows.reduce((a, r) => a + r.visits, 0);
    const judged = rows.filter(r => r.visits >= total * 0.03);
    const low = judged.length > 1 ? judged.reduce((a, b) => (of(b.orders, b.visits) < of(a.orders, a.visits) ? b : a)) : null;
    const rate = (a, b, digits) => (ok(of(a, b)) ? pct(of(a, b), { digits }) : '');
    put(body, table({
      roomy: view !== 'pages',
      cols: [
        { key: 'name', label: VIEWS.find(v => v.id === view).label, class: 'name', render: r => r.name },
        { key: 'visits', label: 'Visits', num: true, sortable: true, render: r => num(r.visits) },
        { key: 'bar', label: '', class: 'fx-barcell hide-md', render: r => bar(r.visits / max, true) },
        { key: 'cart', label: 'Add to cart', num: true, class: 'hide-sm', sortable: true, value: r => of(r.carts, r.visits), render: r => rate(r.carts, r.visits, 1) },
        { key: 'check', label: 'Reach checkout', num: true, class: 'hide-sm', sortable: true, value: r => of(r.checkouts, r.visits), render: r => rate(r.checkouts, r.visits, 1) },
        { key: 'buy', label: 'Buy', num: true, sortable: true, value: r => of(r.orders, r.visits), render: r => (r === low ? statusDot('bad', rate(r.orders, r.visits, 1)) : h('span', { class: 'strong' }, rate(r.orders, r.visits, 1))) },
      ],
      rows, sort: { key: 'visits', dir: 'desc' },
    }));
  };
  paint();
  return card({ flush: true },
    head('Where is it weakest?', 'Every figure is a share of that row’s visits; the crimson dot is the lowest buy rate · ' + GA,
      have.length > 1 ? segmented(have, view, id => { view = id; ctx.saveSetting('funnel.stepsBy', id); paint(); }) : null),
    body);
}

export default {
  title: ['Which step on the site ', em('loses them?')],
  eyebrow: 'Full funnel',
  stamp: false,                     /* Home's stamp with a refresh button sits in the help bar */

  async load(ctx) {
    if (!ctx.brand) return { connected: false, reason: 'not_linked' };
    const span = Math.round((Date.parse(ctx.range.to) - Date.parse(ctx.range.from)) / DAY) + 1;
    const pto = iso(Date.parse(ctx.range.from) - DAY), pfrom = iso(Date.parse(pto) - (span - 1) * DAY);
    const r = await ctx.api(`/api/google/website?act=${encodeURIComponent(ctx.brand.id)}&from=${ctx.range.from}&to=${ctx.range.to}&pfrom=${pfrom}&pto=${pto}`, { worker: 'ah', signal: ctx.signal });
    return shape(r);
  },

  render(el, d, ctx) {
    fxStyles();
    d = d || {};
    const team = !ctx.isClient;
    if (!d.connected || !d.steps) {
      const linked = d.reason === 'empty';
      put(el, empty({
        title: linked ? 'No visits on these dates' : 'The website is not connected',
        text: linked ? 'Google Analytics has no visits for these dates. Try a wider range.'
          : team ? 'Website steps come from Google Analytics. Link the brand’s property and they will show here.' : 'Website steps will show here once the website is connected.',
        action: !linked && team && ctx.brand ? button('Open integrations', { href: ctx.href('brand-settings', 'integrations') }) : null,
      }));
      return;
    }
    ctx.askWindow = rangeWords(ctx, d.range);
    ctx.askContext = `${ctx.brand.name} website steps, ${ctx.askWindow} (${GA}): ${num(d.steps.visits)} visits, ${num(d.steps.carts)} added to cart, ${num(d.steps.checkouts)} reached checkout, ${num(d.steps.orders)} orders.`;
    put(el, ...[
      helpBar([
        { title: 'What it is for', text: 'Once someone is on the site, which step loses them: visits, added to cart, reached checkout, bought, then the same steps by device, channel and landing page.' },
        { title: 'Where the numbers come from', text: 'Google Analytics. Its order count can sit a little under the store’s own; use it to compare steps, not to count sales.' },
      ], h('span', { class: 'bz-chip' }, rangeWords(ctx, d.range)), pageStamp(ctx)),
      figures(d, ctx),
      stepCard(d, ctx),
      rateCard(d, ctx),
      splitCard(d, ctx),
    ].filter(Boolean));
  },

  skeleton(el) {
    el.innerHTML = '<div class="lx-skel-grid"><div class="lx-skel kpi"></div><div class="lx-skel kpi"></div><div class="lx-skel kpi"></div><div class="lx-skel kpi"></div></div><div class="lx-skel chart"></div><div class="lx-skel chart"></div>';
  },
};

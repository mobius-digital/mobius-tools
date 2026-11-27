/* Business > Full funnel > Whole funnel.
   Where do people drop off between the ad click and the second order? Every channel together.
   Live numbers, three reads, each allowed to fail on its own:
     GET /api/hub/paid?platform=all  (profit worker)          ad clicks on Meta, Google and TikTok
     GET /api/google/website         (account-health worker)  visits, added to cart, reached checkout
     GET /api/customers              (profit worker)          orders, average order, came back in 90 days
   The channel paths before an order have no route yet: that card draws the sample file under an
   "Example" chip in real mode. */

import { put } from '../../kit.js';
import { askWhy, helpBar, dl, rangeWords } from '../home/_biz.js';
import { h, num, pct, money, card, em, takeaway, button, table, empty } from '../../kit.js';
import { tileRow, pageStamp, VISITS_THAT_BUY, TW, GA } from '../month/_m.js';
import { fxStyles, steps, exampleChip, bar, head, hint, pathDots, channelName } from './_flow.js';

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const shortDay = d => MON[+String(d).slice(5, 7) - 1] + ' ' + +String(d).slice(8, 10);

const ok = n => n != null && isFinite(n);
const q = ctx => `act=${encodeURIComponent(ctx.brand.id)}&from=${ctx.range.from}&to=${ctx.range.to}`;
const quiet = p => p.then(v => v, () => null);

function shape(paid, site, cust, sample) {
  const g = site && !site.error ? site.cur || {} : null;
  const hd = cust && cust.headline ? cust.headline : null;
  const j = cust && cust.journey && cust.journey.have ? cust.journey : null;
  const at90 = j ? (j.curve || []).find(c => c.days === 90) : null;
  const orders = hd && hd.orders > 0 ? hd.orders : null;
  const back = at90 && ok(at90.repeat_rate) ? at90.repeat_rate : null;
  const clicks = paid && paid.brands && paid.brands[0] && paid.brands[0].paid ? paid.brands[0].paid.clicks : null;
  const days = g ? (site.days || []) : [];
  const curve = j ? (j.curve || []).filter(c => c.days >= 30 && ok(c.repeat_rate)) : [];
  return {
    connected: !!(orders || (g && g.sessions > 0)),
    site_linked: !!g,
    example: ['paths'],
    steps: {
      clicks: clicks > 0 ? clicks : null,
      visits: g && g.sessions > 0 ? g.sessions : null,
      carts: g && ok(g.addToCarts) && g.sessions > 0 ? g.addToCarts : null,
      checkouts: g && ok(g.checkouts) && g.sessions > 0 ? g.checkouts : null,
      orders,
      second: ok(orders) && ok(back) ? Math.round(orders * back) : null,
    },
    aov: hd ? hd.aov : null, back_90: back, multi_orders: null, touch_orders: null,
    sparks: { dates: days.map(d => d.date), buy_rate: days.map(d => d.sessions > 0 ? 100 * (d.purchases || 0) / d.sessions : null), orders: days.map(d => d.purchases), multi: [], back: curve.map(c => c.repeat_rate * 100), back_days: curve.map(c => c.days) },
    paths: sample.paths, single: sample.single, sample_multi: sample.multi_orders, sample_orders: sample.touch_orders,
  };
}

function figures(d, ctx) {
  const st = d.steps, rate = ok(st.orders) && st.visits > 0 ? st.orders / st.visits : null, sp = d.sparks || {};
  /* the daily sparks run over the page's dates; Came back is the share back by each day after the first order,
     so its spark is named by those days (its value is the day 90 point on it) */
  const labels = (sp.dates || []).length ? sp.dates.map(shortDay) : null;
  const backDays = sp.back_days || [];
  const list = [
    { label: dl('Visits that buy', VISITS_THAT_BUY), value: ok(rate) ? pct(rate, { digits: 1 }) : 'no data', sub: ok(rate) ? `${num(st.orders)} of ${num(st.visits)} visits` : 'needs the website connected', spark: sp.buy_rate, sparkFormat: v => v.toFixed(1) + '%', source: GA + ' visits, ' + TW + ' orders' },
    { label: 'Orders', value: ok(st.orders) ? num(st.orders) : 'no data', sub: ok(d.aov) ? money(d.aov, { cents: true }) + ' average order' : null, spark: sp.orders, sparkFormat: v => num(v) },
    { label: 'Two or more touches', value: ok(d.multi_orders) && d.touch_orders > 0 ? pct(d.multi_orders / d.touch_orders) : 'no data',
      sub: ok(d.multi_orders) ? `${num(d.multi_orders)} of ${num(d.touch_orders)} orders` : 'not counted yet', spark: sp.multi, sparkFormat: v => Math.round(v) + '%', source: TW + ' click paths' },
    { label: 'Came back', value: ok(d.back_90) ? pct(d.back_90, { digits: 1 }) : 'no data', sub: ok(d.back_90) ? 'within 90 days of the first order' : null,
      spark: backDays.length === (sp.back || []).length ? sp.back : null, sparkLabels: backDays.map(v => 'Day ' + v), window: 'Customers followed from the first order', sparkFormat: v => v.toFixed(1) + '%' },
  ];
  return tileRow(list, { cols: 4, window: rangeWords(ctx, d.range), source: TW, labels });
}

function stepList(d) {
  const st = d.steps;
  const of = (a, b) => (ok(a) && b > 0 ? a / b : null);
  const raw = [
    { key: 'clicks', label: 'Ad clicks', value: st.clicks, sub: 'all platforms', src: 'Ad platforms (Meta, Google, TikTok)' },
    { key: 'visits', label: 'Site visits', src: 'Google Analytics', value: st.visits, sub: ok(of(st.visits, st.clicks)) && st.visits <= st.clicks ? pct(of(st.visits, st.clicks)) + ' arrive' : 'every channel' },
    { key: 'carts', label: 'Added to cart', src: 'Google Analytics', value: st.carts, r: of(st.carts, st.visits), sub: ok(of(st.carts, st.visits)) ? pct(of(st.carts, st.visits), { digits: 1 }) + ' of visits' : '' },
    { key: 'checkouts', label: 'Reached checkout', src: 'Google Analytics', value: st.checkouts, r: of(st.checkouts, st.carts), sub: ok(of(st.checkouts, st.carts)) ? pct(of(st.checkouts, st.carts)) + ' of carts' : '' },
    { key: 'orders', label: 'Orders', src: 'Triple Whale orders', value: st.orders, r: of(st.orders, st.checkouts), sub: ok(of(st.orders, st.checkouts)) ? pct(of(st.orders, st.checkouts)) + ' of checkouts' : '' },
    { key: 'second', label: 'Second order', src: 'Customers back within 90 days', value: st.second, sub: ok(d.back_90) ? pct(d.back_90, { digits: 1 }) + ' come back' : '' },
  ].filter(x => ok(x.value));
  const judged = raw.filter(x => ok(x.r));
  const worst = judged.length > 1 ? judged.reduce((a, b) => (b.r < a.r ? b : a)) : null;
  if (worst) worst.worst = true;
  return { list: raw, worst };
}

function dropCard(d, ctx) {
  const { list, worst } = stepList(d);
  const first = list[0], orders = list.find(x => x.key === 'orders');
  const big = first && orders && first !== orders ? `${num(first.value)} ${first.key === 'clicks' ? 'clicks' : 'visits'} to ${num(orders.value)} orders` : orders ? num(orders.value) + ' orders' : '';
  const say = worst ? takeaway(['Only ', h('b', null, pct(worst.r, { digits: worst.r < 0.1 ? 1 : 0 })), ` ${worst.sub.replace(/^[\d.]+% /, '')} ${worst.key === 'carts' ? 'add to cart' : worst.key === 'checkouts' ? 'reach checkout' : 'finish the order'}, the biggest drop in the funnel.`],
    { action: ctx.isClient ? null : askWhy(ctx, 'Where do people drop off') }) : null;
  const missing = !d.site_linked && d.site_linked !== undefined;
  return card({ class: 'fx-pad' },
    head('Step by step, ' + rangeWords(ctx, d.range), ['From the ad click to the second order, every channel together. Each bar is the share of the step before it.', hint(' Hover a bar for its count.')]),
    h('div', { class: 'fx-src' }, rangeWords(ctx, d.range) + ' · clicks from the ad platforms, visits to checkout ' + GA + ', orders ' + TW),
    h('div', { class: 'fx-big' }, h('span', { class: 'fx-bigtxt' }, big)),
    steps(list, { height: 300, relative: true }),
    missing ? h('p', { class: 'fx-under' }, ctx.isClient ? 'Website steps show once the website is connected.' : 'Visits, carts and checkouts show once Google Analytics is linked in Brand settings.') : null,
    say ? h('div', { style: { marginTop: '20px' } }, say) : null);
}

function pathCard(d, ctx) {
  const rows = (d.paths || []).filter(r => r.orders > 0).sort((a, b) => b.orders - a.orders);
  if (!rows.length) return null;
  const ex = (d.example || []).includes('paths');
  const multi = ex ? d.sample_multi : d.multi_orders, all = ex ? d.sample_orders : d.touch_orders;
  const max = rows[0].orders;
  const one = Object.entries(d.single || {}).filter(e => e[1] > 0 && e[0] !== 'other' && e[0] !== 'organic').sort((a, b) => b[1] - a[1]).slice(0, 4);
  return card({ flush: true },
    head('What do people touch before buying?', 'Every channel, clicks only · ' + TW + ' click paths', ex ? exampleChip() : null, h('a', { class: 'lx-btn ghost', href: ctx.href('funnel', 'path') }, 'See it as a flow')),
    ok(multi) ? h('div', { class: 'fx-big', style: { padding: '0 28px' } }, h('span', { class: 'fx-bigtxt' }, `${num(multi)} of ${num(all)}`), h('span', null, 'orders took two or more touches')) : null,
    table({
      roomy: true,
      cols: [
        { key: 'path', label: 'Path', class: 'name', render: r => pathDots(r.path) },
        { key: 'orders', label: 'Orders', num: true, width: 90, sortable: true, render: r => num(r.orders) },
        { key: 'bar', label: '', class: 'fx-barcell hide-sm', render: r => bar(r.orders / max) },
      ],
      rows, sort: { key: 'orders', dir: 'desc' },
    }),
    one.length ? h('div', { class: 'fx-note' }, 'One touch only: ', one.map(([id, v], i) => [i ? ', ' : '', channelName(id) + ' ', h('b', null, num(v))]), ' orders') : null);
}

export default {
  title: ['Where do people ', em('drop off?')],
  eyebrow: 'Full funnel',
  stamp: false,                     /* the page draws Home's stamp with a refresh button in its help bar */

  async load(ctx) {
    if (!ctx.brand) return { connected: false };
    const [paid, site, cust, sample] = await Promise.all([
      quiet(ctx.api(`/api/hub/paid?platform=all&cmp=none&${q(ctx)}`, { signal: ctx.signal })),
      quiet(ctx.api(`/api/google/website?${q(ctx)}`, { worker: 'ah', signal: ctx.signal })),
      quiet(ctx.api(`/api/customers?months=6&${q(ctx)}`, { signal: ctx.signal })),
      quiet(ctx.fixture('whole.json')),
    ]);
    if (!site && !cust) throw new Error('Could not read the funnel');
    return shape(paid, site, cust, sample || {});
  },

  render(el, d, ctx) {
    fxStyles();
    d = d || {};
    const team = !ctx.isClient;
    if (d.connected === false || !d.steps) {
      put(el, empty({
        title: 'No sales source connected',
        text: team ? 'The funnel needs the store and the website. Connect Triple Whale or Shopify, and Google Analytics, and it will show here.' : 'The funnel will show here once the store is connected.',
        action: team && ctx.brand ? button('Open integrations', { href: ctx.href('brand-settings', 'integrations') }) : null,
      }));
      return;
    }
    const top = figures(d, ctx);
    const st = d.steps;
    ctx.askWindow = rangeWords(ctx, d.range);
    ctx.askContext = `${ctx.brand.name} whole funnel, ${ctx.askWindow}: ` + [['ad clicks', st.clicks], ['site visits', st.visits], ['added to cart', st.carts], ['reached checkout', st.checkouts], ['orders', st.orders], ['second orders in 90 days', st.second]].filter(p => ok(p[1])).map(p => num(p[1]) + ' ' + p[0]).join(', ') + '.';
    put(el, ...[
      helpBar([
        { title: 'What it is for', text: 'Where people drop off between the ad click and the second order, every channel together.' },
        { title: 'Where the numbers come from', text: 'Ad platforms for clicks, Google Analytics for visits, carts and checkouts, Triple Whale and Shopify for orders. Second order is the share of customers back within 90 days.' },
      ], h('span', { class: 'bz-chip' }, rangeWords(ctx, d.range)), pageStamp(ctx)),
      top,
      dropCard(d, ctx),
      pathCard(d, ctx),
    ].filter(Boolean));
  },

  skeleton(el) {
    el.innerHTML = '<div class="lx-skel-grid"><div class="lx-skel kpi"></div><div class="lx-skel kpi"></div><div class="lx-skel kpi"></div><div class="lx-skel kpi"></div></div><div class="lx-skel chart"></div><div class="lx-skel chart"></div>';
  },
};

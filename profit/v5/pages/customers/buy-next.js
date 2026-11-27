/* Business > Customers > What they buy next.
   After the first order, what do customers buy next? A flow from the first order to the second and
   third (by category or by product), then "pick a product": what the people who started there bought next.
   Live numbers: GET /api/customers on the profit worker (journey.repeat_rate_ever, journey.days_to_second,
   journey.products: each top first product with its 90 day return rate and the top products bought next).
   The flow needs products grouped into categories per order, which no route gives yet: in real mode it
   draws the sample file under an "Example until its data feed is built" chip. All time, no date range. */

import { put } from '../../kit.js';
import { askWhy, helpBar } from '../home/_biz.js';
import { h, num, pct, card, em, takeaway, button, table, empty, segmented, addStyles } from '../../kit.js';
import { tileRow, pageStamp, TW } from '../month/_m.js';
import { flow, fxStyles, exampleChip, bar, head } from '../funnel/_flow.js';

const ok = n => n != null && isFinite(n);
const b = v => h('b', null, v);
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const since = ym => (ym ? MONTHS[+String(ym).slice(5, 7) - 1].slice(0, 3) + ' ' + String(ym).slice(0, 4) : '');

const CSS = `
.bn-kpis .lx-kpi .s{flex-direction:column;align-items:flex-start;gap:10px}
.bn-kpis .lx-kpi .fx-bar{max-width:240px}
.bn-kpis .lx-kpi .v{white-space:normal}
.bn-picks{padding:4px 28px 6px;max-width:100%;overflow-x:auto;scrollbar-width:none}
.bn-picks .lx-seg{max-width:none}
.bn-after{display:flex;align-items:center;gap:12px;flex-wrap:wrap;padding:16px 28px 4px;font-size:14px;font-weight:600}
.bn-after .sp{flex:1}
.bn-small{font-size:12px;font-weight:500;color:var(--muted)}
.bn-rest td{color:var(--muted)}
@media (max-width:759px){
  .bn-picks{padding:4px 18px 6px}
  .bn-after{padding:14px 18px 4px}
  .bn-kpis .lx-kpi.lg .v{font-size:var(--num-l)}
  .bn-kpis .lx-kpi .l{white-space:normal}
}`;

/* ---------- the two ways in: the fixture, and the live call ---------- */
function fromFixture(f) {
  f = f || {};
  const back = f.customers > 0 ? f.came_back / f.customers : null;
  return {
    connected: f.connected !== false, example: f.example || [], since: f.since,
    tiles: [
      { label: 'Ordered a second time', value: ok(back) ? pct(back, { digits: 1 }) : null, sub: `${num(f.came_back)} of ${num(f.customers)} customers`, share: back },
      { label: 'Belt, then another belt', value: f.came_back > 0 ? pct(f.belt_belt / f.came_back) : null, sub: `${num(f.belt_belt)} of ${num(f.came_back)} second orders`, share: f.came_back > 0 ? f.belt_belt / f.came_back : null },
      { label: 'Same color again', value: f.top_back > 0 ? pct(f.same_colour / f.top_back) : null, sub: `${num(f.same_colour)} of ${num(f.top_back)}, top six belts`, share: f.top_back > 0 ? f.same_colour / f.top_back : null },
      f.top_addon && { label: 'Top add-on', value: f.top_addon.name, sub: `${num(f.top_addon.customers)} ${f.top_addon.of} bought one next` },
    ].filter(Boolean),
    by_category: f.by_category, by_product: f.by_product, pick: f.pick || [], gap_days: f.gap_days,
    say: f.came_back > 0 ? { back: f.came_back, same: f.belt_belt, addon: f.top_addon } : null,
  };
}

function shape(r, f) {
  const hd = r.headline || {}, j = r.journey && r.journey.have ? r.journey : null;
  const connected = !!((r.account && r.account.tw_shop) || hd.orders > 0);
  if (!j) return { connected, reason: r.journey && r.journey.reason || null };
  const p = j.products || {}, first = (p.first || []).filter(x => x.customers > 0);
  const nextTop = (p.next || [])[0];
  const ex = fromFixture(f);
  return {
    connected: true, example: ['flow'], since: j.history ? String(j.history.reliable_from).slice(0, 7) : null,
    tiles: [
      { label: 'Ordered a second time', value: ok(j.repeat_rate_ever) ? pct(j.repeat_rate_ever, { digits: 1 }) : null, sub: `of ${num(j.certain_customers)} customers`, share: j.repeat_rate_ever },
      { label: 'Days to the second order', value: ok(j.days_to_second) ? num(j.days_to_second) : null, sub: 'the middle repeat buyer' },
      first[0] && { label: 'Top first product', value: first[0].name, sub: `${num(first[0].customers)} first orders` },
      nextTop && { label: 'Top second order product', value: nextTop.name, sub: `${num(nextTop.customers)} second orders` },
    ].filter(Boolean),
    by_category: ex.by_category, by_product: ex.by_product, gap_days: null, say: null,
    pick: first.slice(0, 6).map(x => {
      const back = ok(x.repeat_rate) ? Math.round(x.repeat_rate * x.customers) : null;
      return { id: x.id, name: x.name, customers: x.customers, back, rate90: x.repeat_rate, next: (x.then || []).map(t => ({ name: t.name, customers: t.customers })) };
    }),
  };
}

/* ---------- parts ---------- */
const winOf = d => (d.since ? 'First orders from ' + since(d.since) : 'Every first order');

function figures(d) {
  return tileRow(d.tiles.map(t => ({ label: t.label, value: t.value || 'no data', sub: [t.sub, ok(t.share) ? bar(t.share) : null] })),
    { cols: 4, window: winOf(d), source: TW + ' orders' });
}

function flowCard(d, ctx) {
  const views = [d.by_category && { id: 'category', label: 'By category' }, d.by_product && { id: 'product', label: 'By product' }].filter(Boolean);
  if (!views.length) return null;
  let view = new URLSearchParams(location.search).get('view') || ctx.settingNow('customers.buyNextBy', views[0].id);
  if (!views.some(v => v.id === view)) view = views[0].id;
  const ex = (d.example || []).includes('flow');
  const c = card({ class: 'fx-pad' });
  const paint = () => {
    const f = view === 'product' ? d.by_product : d.by_category;
    put(c, 
      head('What do customers buy next?', view === 'product' ? 'The top belts by name, the rest grouped. Hover or tap a band to follow it.' : 'First, second and third orders by category. Hover or tap a band to follow it.',
        ex ? exampleChip() : null, views.length > 1 ? segmented(views, view, id => { view = id; ctx.saveSetting('customers.buyNextBy', id); paint(); }) : null),
      h('div', { class: 'fx-src' }, winOf(d) + ' · ' + TW + ' orders'),
      h('div', { style: { marginTop: '10px' } }, flow({ columns: f.columns || [], links: f.links || [], lead: f.lead, unit: 'customers', height: 640, phoneHeight: 600,
        label: 'What customers bought on their first, second and third orders', empty: 'Not enough repeat customers to draw this yet' })),
      d.say && view === 'category' ? h('div', { style: { marginTop: '20px' } }, takeaway(['Most who come back buy another belt. Offer a ', b('new color'), ' next, with the ' + (d.say.addon ? d.say.addon.name.toLowerCase() : 'add-on') + ' beside it.'],
      { action: ctx.isClient ? null : askWhy(ctx, 'After the first order, what do they buy next') })) : '');
  };
  paint();
  return c;
}

function pickCard(d, ctx) {
  const list = (d.pick || []).filter(p => p.customers > 0);
  if (!list.length) return null;
  let on = ctx.settingNow('customers.buyNextPick', list[0].id);
  if (!list.some(p => p.id === on)) on = list[0].id;
  const strip = h('div', { class: 'bn-picks' });
  const body = h('div');
  const paint = () => {
    /* the kit's chips, one per first product */
    put(strip, segmented(list.map(p => ({ id: p.id, label: p.name })), on, id => { on = id; ctx.saveSetting('customers.buyNextPick', on); paint(); }));
    const p = list.find(x => x.id === on);
    const base = ok(p.back) && p.back > 0 ? p.back : null;
    const rows = (p.next || []).filter(n => n.customers > 0);
    const max = Math.max(1, ...rows.map(n => n.customers));
    const small = base != null && base < 30;
    put(body, 
      h('div', { class: 'bn-after' }, h('span', null, `After ${p.name}, they bought`), h('span', { class: 'bn-small' }, ok(p.back) ? `${num(p.back)} of ${num(p.customers)} came back (${pct(p.back / p.customers)})` : `${num(p.customers)} first orders`),
        h('span', { class: 'sp' }), small ? h('span', { class: 'bn-small' }, 'Small numbers, read with care') : null),
      rows.length ? table({
        cols: [
          { key: 'name', label: 'Next order', class: 'name', render: n => n.name },
          { key: 'bar', label: '', class: 'fx-barcell hide-sm', render: n => (n.rest ? '' : bar(n.customers / max, !n.same)) },
          { key: 'customers', label: 'Customers', num: true, width: 96, sortable: true, render: n => num(n.customers) },
          base ? { key: 'share', label: 'Share', num: true, width: 70, render: n => pct(n.customers / base) } : null,
        ].filter(Boolean),
        rows,
        total: p.rest && p.rest.customers > 0 ? { name: p.rest.name, customers: p.rest.customers, rest: true } : null,
      }) : h('p', { class: 'bn-small', style: { padding: '12px 28px 18px' } }, 'Too few came back after this product to say.'));
  };
  paint();
  return card({ flush: true },
    head('Pick a product', 'what the people who started with it bought on their next order'),
    h('div', { class: 'fx-src' }, winOf(d) + ' · ' + TW + ' orders'),
    strip, body);
}

export default {
  title: ['After the first order, ', em('what do they buy next?')],
  eyebrow: 'Customers',
  stamp: false,                     /* Home's stamp with a refresh button sits in the help bar */
  ranges: false,

  async sample(ctx) { return fromFixture(await ctx.fixture('buy-next.json')); },

  async load(ctx) {
    if (!ctx.brand) return { connected: false };
    const [r, f] = await Promise.all([
      ctx.api(`/api/customers?act=${encodeURIComponent(ctx.brand.id)}&months=12&days=90`, { signal: ctx.signal }),
      ctx.fixture('buy-next.json').catch(() => ({})),
    ]);
    return shape(r, f || {});
  },

  render(el, d, ctx) {
    fxStyles(); addStyles('bn-style', CSS);
    d = d || {};
    const team = !ctx.isClient;
    if (!d.connected || !d.tiles) {
      put(el, empty({
        title: d.connected ? 'No order history yet' : 'No sales source connected',
        text: d.connected ? (d.reason || 'Customer history fills in overnight once the store’s orders arrive.')
          : team ? 'This page needs the store’s orders. Connect Triple Whale or Shopify in Brand settings and it will show here.' : 'This page will show once the store is connected.',
        action: !d.connected && team && ctx.brand ? button('Open integrations', { href: ctx.href('brand-settings', 'integrations') }) : null,
      }));
      return;
    }
    ctx.askWindow = d.since ? 'First orders from ' + since(d.since) : 'Every first order';
    ctx.askContext = `${ctx.brand.name}, what customers buy next: ` + d.tiles.map(t => `${t.label} ${t.value || 'no data'} (${t.sub})`).join('; ') + '.';
    put(el, ...[
      helpBar([
        { title: 'What it is for', text: 'After the first order, what do customers buy next? The flow follows first, second and third orders; pick a product to see what came after it.' },
        { title: 'Where the numbers come from', text: `Triple Whale orders, customers whose first order was ${d.since ? 'from ' + since(d.since) + ' on' : 'in the order history'}. Paths of one or two people are not drawn.` + (ok(d.gap_days) ? ` The typical gap between orders is ${num(d.gap_days)} days.` : '') + ' Hover or tap a band for its count and share.' },
      ], pageStamp(ctx)),
      figures(d),
      flowCard(d, ctx),
      pickCard(d, ctx),
    ].filter(Boolean));
  },

  skeleton(el) {
    el.innerHTML = '<div class="lx-skel-grid"><div class="lx-skel kpi"></div><div class="lx-skel kpi"></div><div class="lx-skel kpi"></div><div class="lx-skel kpi"></div></div><div class="lx-skel chart"></div><div class="lx-skel chart"></div>';
  },
};

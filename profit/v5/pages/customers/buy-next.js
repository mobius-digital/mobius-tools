/* Business > Customers > What they buy next.
   After the first order, what do customers buy next? A flow from the first order to the second and
   third (by category or by product), then "pick a product": what the people who started there bought next.
   Live numbers: GET /api/customers on the profit worker (journey.repeat_rate_ever, journey.days_to_second,
   journey.products: each top first product with its 90 day return rate and the top products bought next).
   The flow needs products grouped into categories per order, which no route gives yet: in real mode it
   draws the sample file under an "Example until its data feed is built" chip. All time, no date range. */

import { put } from '../../kit.js';
import { h, num, pct, card, hero, em, kpi, kpis, takeaway, button, table, empty, segmented, addStyles } from '../../kit.js';
import { flow, fxStyles, exampleChip, bar, head } from '../funnel/_flow.js';

const ok = n => n != null && isFinite(n);
const b = v => h('b', null, v);
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const since = ym => (ym ? MONTHS[+String(ym).slice(5, 7) - 1].slice(0, 3) + ' ' + String(ym).slice(0, 4) : '');

const CSS = `
.bn-kpis .lx-kpi .s{flex-direction:column;align-items:flex-start;gap:10px}
.bn-kpis .lx-kpi .fx-bar{max-width:240px}
.bn-kpis .lx-kpi .v{white-space:normal}
.bn-picks{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));border-top:1px solid var(--line);border-bottom:1px solid var(--line)}
.bn-pick{display:grid;gap:3px;text-align:left;padding:16px 20px;border:0;border-right:1px solid var(--line);background:transparent;cursor:pointer;font:inherit;color:var(--ink);min-width:0}
.bn-pick:last-child{border-right:0}
.bn-pick small{font-size:12.5px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.bn-pick strong{font-size:24px;font-weight:600;letter-spacing:-.03em;font-variant-numeric:tabular-nums;line-height:1.15}
.bn-pick span{font-size:12px;color:var(--muted)}
.bn-pick.on{background:var(--bg-sunk);box-shadow:inset 0 -2px 0 var(--ink)}
.bn-pick:hover:not(.on){background:#FAF9F7}
.bn-after{display:flex;align-items:center;gap:12px;flex-wrap:wrap;padding:16px 28px 4px;font-size:14px;font-weight:600}
.bn-after .sp{flex:1}
.bn-small{font-size:12px;font-weight:500;color:var(--muted)}
.bn-rest td{color:var(--muted)}
@media (max-width:759px){
  .bn-picks{display:flex;overflow-x:auto;scrollbar-width:none;scroll-snap-type:x mandatory;-webkit-overflow-scrolling:touch}
  .bn-pick{flex:0 0 46%;scroll-snap-align:start;padding:14px 16px}
  .bn-after{padding:14px 18px 4px}
  .bn-kpis .lx-kpi.lg .v{font-size:28px}
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
      { label: 'Same colour again', value: f.top_back > 0 ? pct(f.same_colour / f.top_back) : null, sub: `${num(f.same_colour)} of ${num(f.top_back)}, top six belts`, share: f.top_back > 0 ? f.same_colour / f.top_back : null },
      f.top_addon && { label: 'Top add-on', value: f.top_addon.name, sub: `${num(f.top_addon.customers)} ${f.top_addon.of} bought one next`, word: true },
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
      first[0] && { label: 'Top first product', value: first[0].name, sub: `${num(first[0].customers)} first orders`, word: true },
      nextTop && { label: 'Top second order product', value: nextTop.name, sub: `${num(nextTop.customers)} second orders`, word: true },
    ].filter(Boolean),
    by_category: ex.by_category, by_product: ex.by_product, gap_days: null, say: null,
    pick: first.slice(0, 6).map(x => {
      const back = ok(x.repeat_rate) ? Math.round(x.repeat_rate * x.customers) : null;
      return { id: x.id, name: x.name, customers: x.customers, back, rate90: x.repeat_rate, next: (x.then || []).map(t => ({ name: t.name, customers: t.customers })) };
    }),
  };
}

/* ---------- parts ---------- */
function figures(d) {
  const el = kpis(d.tiles.map(t => kpi({ label: t.label, value: t.value || 'no data', size: t.word ? null : 'lg',
    sub: [t.sub, ok(t.share) ? bar(t.share) : null] })), { cols: 4 });
  el.classList.add('bn-kpis');
  return el;
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
      head('What do customers buy next?', view === 'product' ? 'the top belts by name, the rest grouped; hover a band to follow it' : 'first, second and third orders by category; hover a band to follow it',
        ex ? exampleChip() : null, views.length > 1 ? segmented(views, view, id => { view = id; ctx.saveSetting('customers.buyNextBy', id); paint(); }) : null),
      h('div', { style: { marginTop: '10px' } }, flow({ columns: f.columns || [], links: f.links || [], lead: f.lead, unit: 'customers', height: 640, phoneHeight: 600,
        label: 'What customers bought on their first, second and third orders', empty: 'Not enough repeat customers to draw this yet' })),
      d.say && view === 'category' ? h('div', { style: { marginTop: '20px' } }, takeaway(['Of ', b(num(d.say.back)), ' customers who came back, ', b(num(d.say.same)), ' bought another belt',
        d.say.addon ? [' and the top add-on is the ', b(d.say.addon.name.toLowerCase())] : '', '. Offer a ', b('new colour'), ' next, with the ' + (d.say.addon ? d.say.addon.name.toLowerCase() : 'add-on') + ' beside it.'],
      { action: ctx.isClient ? null : button('Ask why', { href: ctx.href('ask', 'index') }) })) : '');
  };
  paint();
  return c;
}

function pickCard(d, ctx) {
  const list = (d.pick || []).filter(p => p.customers > 0);
  if (!list.length) return null;
  let on = ctx.settingNow('customers.buyNextPick', list[0].id);
  if (!list.some(p => p.id === on)) on = list[0].id;
  const strip = h('div', { class: 'bn-picks', role: 'tablist', 'aria-label': 'First product' });
  const body = h('div');
  const paint = () => {
    put(strip, ...list.map(p => {
      const rate = ok(p.back) ? p.back / p.customers : p.rate90;
      return h('button', { type: 'button', role: 'tab', class: 'bn-pick' + (p.id === on ? ' on' : ''), 'aria-selected': p.id === on,
        onclick: () => { on = p.id; ctx.saveSetting('customers.buyNextPick', on); paint(); } },
      h('small', null, p.name), h('strong', null, ok(rate) ? pct(rate) : 'no data'), h('span', null, ok(p.back) ? `${num(p.back)} of ${num(p.customers)} came back` : `${num(p.customers)} first orders`));
    }));
    const p = list.find(x => x.id === on);
    const base = ok(p.back) && p.back > 0 ? p.back : null;
    const rows = (p.next || []).filter(n => n.customers > 0);
    const max = Math.max(1, ...rows.map(n => n.customers));
    const small = base != null && base < 30;
    put(body, 
      h('div', { class: 'bn-after' }, h('span', null, `After ${p.name}, they bought`), h('span', { class: 'sp' }), small ? h('span', { class: 'bn-small' }, 'Small numbers, read with care') : null),
      rows.length ? table({
        cols: [
          { key: 'name', label: 'Next order', class: 'name', render: n => n.name },
          { key: 'bar', label: '', class: 'fx-barcell hide-sm', render: n => (n.rest ? '' : bar(n.customers / max, !n.same)) },
          { key: 'customers', label: 'Customers', num: true, width: 96, render: n => num(n.customers) },
          base ? { key: 'share', label: 'Share', num: true, width: 70, render: n => pct(n.customers / base) } : null,
        ].filter(Boolean),
        rows,
        total: p.rest && p.rest.customers > 0 ? { name: p.rest.name, customers: p.rest.customers, rest: true } : null,
      }) : h('p', { class: 'lx-foot', style: { padding: '12px 28px 18px' } }, 'Too few came back after this product to say.'));
  };
  paint();
  return card({ flush: true },
    head('Pick a product', 'what the people who started with it bought on their next order'),
    strip, body);
}

export default {
  title: ['After the first order, ', em('what do they buy next?')],
  eyebrow: 'Customers',
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
    put(el, ...[
      hero({ line: true }, figures(d)),
      flowCard(d, ctx),
      pickCard(d, ctx),
      h('p', { class: 'lx-foot' }, `Source: the store’s orders, customers whose first order was ${d.since ? 'from ' + since(d.since) + ' on' : 'in the order history'}. Paths of one or two people are not drawn.` + (ok(d.gap_days) ? ` The typical gap between the first and second order is ${d.gap_days} days.` : '')),
    ].filter(Boolean));
  },

  skeleton(el) {
    el.innerHTML = '<div class="lx-skel-grid"><div class="lx-skel kpi"></div><div class="lx-skel kpi"></div><div class="lx-skel kpi"></div><div class="lx-skel kpi"></div></div><div class="lx-skel chart"></div><div class="lx-skel chart"></div>';
  },
};

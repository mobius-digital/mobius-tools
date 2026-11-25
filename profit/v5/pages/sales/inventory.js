/* Business > Sales > Inventory. "Will anything run out?"
   Live: on hand, pace, days left and what is on the way for every product (the stock feed, read only:
   GET /api/supply/client?what=state on the account-health worker) and the ad spend tied to each product over
   30 days (GET /api/hub/stockads on the profit worker, Triple Whale orders).
   This page is about today, so the date range is hidden. Nothing here writes. */

import { put } from '../../kit.js';
import { h, em, card, kpi, kpis, takeaway, button, table, barChart, statusDot, skeleton } from '../../kit.js';
import { ok, usd, sum, shortDate, addDays, css, head, soft, notConnected, num } from '../email/_em.js';

/* ---------- real mode: the stock feed, shaped like the fixture ---------- */
function shape(st, ads) {
  const today = st.today || new Date().toISOString().slice(0, 10), spend = (ads && ads.products) || {};
  const day = Array(90).fill(0);
  for (const p of st.products || []) for (const v of p.variants || []) (v.series || []).forEach((n, i) => { if (i < 90) day[i] += n || 0; });
  const weeks = [];
  for (let w = 0; w < 12; w++) { const s = 6 + w * 7; weeks.push({ label: shortDate(addDays(today, s - 90)), sold: day.slice(s, s + 7).reduce((a, x) => a + x, 0) }); }
  const firstOut = p => { const v = (p.variants || []).filter(x => x.isCore && x.velocity > 0.001).sort((a, b) => (a.onHand <= 0 ? -1 : a.runOutDays ?? 9e9) - (b.onHand <= 0 ? -1 : b.runOutDays ?? 9e9))[0]; return v && (p.variants || []).length > 1 ? v.axis || v.title || v.sku || null : null; };
  return {
    connected: true, today, weeks: weeks.some(w => w.sold > 0) ? weeks : [], note: null,
    products: (st.products || []).filter(p => !['off', 'drop_done'].includes(p.status) && (p.velocity > 0.001 || p.onHand > 0)).map(p => ({
      id: String(p.id), title: p.title, on_hand: Math.max(0, p.onHand || 0), per_day: p.velocity || 0,
      days_left: p.velocity > 0.001 ? (p.status === 'out' ? 0 : p.runOutDays ?? 0) : null,
      lands: p.incomingLands || null, incoming: p.incoming || 0, ad_spend: (spend[p.id] || {}).spend ?? null,
      first_size: firstOut(p), cost: p.cost ?? null, status: p.status || 'ok' })),
  };
}

/* ---------- the call on each product ---------- */
const CALLS = { ease: ['bad', 'Ease off ads'], watch: ['', 'Watch'], scale: ['good', 'Safe to scale'], clear: ['warn', 'Push to clear'], quiet: ['off', 'Not selling'] };
const ORDER = { ease: 0, watch: 1, scale: 2, clear: 3, quiet: 4 };
function judge(d, ctx) {
  const id = ctx.brand ? ctx.brand.id : 'all';
  const low = +ctx.settingNow(`brand:${id}.stock_low_days`, 30), safe = +ctx.settingNow(`brand:${id}.stock_safe_days`, 90), slow = +ctx.settingNow(`brand:${id}.stock_slow_weeks`, 52);
  const until = date => Math.round((Date.parse(date) - Date.parse(d.today)) / 864e5);
  for (const p of d.products) {
    const land = p.lands ? until(p.lands) : null, heavy = (ok(p.days_left) && p.days_left > slow * 7) || (p.days_left == null && p.on_hand >= 20);
    p.covered = land != null && ok(p.days_left) && land <= p.days_left;
    p.gap = land != null && ok(p.days_left) && land > p.days_left ? land - p.days_left : 0;
    p.call = p.days_left == null ? (heavy ? 'clear' : 'quiet') : p.days_left < low && !p.covered ? 'ease' : heavy ? 'clear' : p.days_left >= safe || p.covered ? 'scale' : 'watch';
  }
  return { low, safe };
}

function figures(d, rule) {
  const ps = d.products, by = k => ps.filter(p => p.call === k), out = ps.filter(p => p.days_left === 0), ease = by('ease');
  const tied = by('clear').reduce((t, p) => t + p.on_hand * (p.cost || 0), 0), anyCost = ps.some(p => ok(p.cost));
  const el = kpis([
    kpi({ label: 'Out of stock', size: 'lg', value: num(out.length), delta: out.length ? statusDot('bad', 'selling when in stock') : statusDot('good', 'nothing out') }),
    kpi({ label: `Out within ${rule.low} days`, size: 'lg', value: num(ease.length - out.length), sub: 'with no restock landing first' }),
    kpi({ label: 'Safe to scale', size: 'lg', value: num(by('scale').length), sub: `${rule.safe} days of stock, or a restock in time` }),
    kpi({ label: 'Tied up in slow stock', size: 'lg', value: anyCost ? usd(tied) : num(by('clear').length), sub: anyCost ? `${num(by('clear').length)} products, at cost` : 'products over a year of stock' }),
  ], { cols: 4 });
  el.classList.add('em-kpis');
  return el;
}

function verdict(d, rule, ctx) {
  const ease = d.products.filter(p => p.call === 'ease'), b = v => h('b', null, v);
  const spend = sum(ease.filter(p => ok(p.ad_spend)), 'ad_spend');
  const parts = !ease.length ? ['Nothing runs out in the next ', b(rule.low + ' days'), '. Every product selling has stock or a restock on the way.']
    : [b(num(ease.length) + (ease.length === 1 ? ' product' : ' products')), ease.length === 1 ? ' is' : ' are', ` out or will be within ${rule.low} days`,
      ...(spend > 0 ? [', and ads spent ', b(usd(spend)), ' on them in the last 30 days'] : []), '.'];
  return takeaway(parts, { action: ctx.isClient ? null : button('Ask what to do', { href: ctx.href('ask', 'index') }) });
}

function chartCard(d) {
  const w = d.weeks || [];
  if (w.length < 2) return null;
  const b = v => h('b', null, v);
  return card({ class: 'em-chart' },
    head('Units sold by week', 'Every product, the last ' + w.length + ' weeks'),
    barChart({ values: w.map(x => x.sold), labels: w.map(x => x.label), lead: w.length - 1, note: d.note && d.note.index != null ? d.note : null, height: 300, phoneHeight: 260,
      label: 'Units sold each week, the last ' + w.length + ' weeks',
      hover: i => [b('Week of ' + w[i].label), h('span', null, 'Sold ', b(num(w[i].sold)))] }));
}

function listCard(d) {
  const rows = d.products.slice().sort((a, b) => ORDER[a.call] - ORDER[b.call] || (a.days_left ?? 9e9) - (b.days_left ?? 9e9));
  const left = p => {
    if (p.days_left == null) return h('span', { class: 'em-none' }, 'no sales');
    if (p.days_left === 0) return statusDot('bad', 'Out');
    return statusDot(p.call === 'ease' ? 'bad' : p.call === 'scale' ? 'good' : 'off', num(p.days_left) + ' days');
  };
  const restock = p => (p.lands ? [shortDate(p.lands), p.incoming ? h('span', { class: 'em-none' }, ` (${num(p.incoming)})`) : null, p.gap > 0 && p.days_left != null ? h('small', { class: 'neg' }, `${p.gap} days too late`) : null] : h('span', { class: 'em-none' }, 'none placed'));
  return card({ title: 'Every product', note: 'most urgent first', flush: true, class: 'em-flush' },
    table({ roomy: true, rows, cols: [
      { key: 'title', label: 'Product', class: 'name', render: p => h('span', { class: 'em-name' }, p.title, p.first_size && p.call !== 'quiet' ? h('small', null, 'first out: ' + p.first_size) : null) },
      { key: 'call', label: 'Call', sortable: true, class: 'hide-sm', value: p => ORDER[p.call], render: p => statusDot(CALLS[p.call][0], CALLS[p.call][1]) },
      { key: 'days_left', label: 'Stock lasts', sortable: true, render: left },
      { key: 'on_hand', label: 'On hand', num: true, sortable: true, class: 'hide-sm', render: p => num(p.on_hand) },
      { key: 'per_day', label: 'Sells a week', num: true, sortable: true, class: 'hide-sm', render: p => (p.per_day > 0 ? num(p.per_day * 7) : h('span', { class: 'em-none' }, '0')) },
      { key: 'lands', label: 'Restock lands', class: 'hide-md', render: p => h('span', { class: 'em-name' }, restock(p)) },
      { key: 'ad_spend', label: 'Ad spend, 30 days', num: true, sortable: true, class: 'hide-md', render: p => (ok(p.ad_spend) && p.ad_spend > 0 ? usd(p.ad_spend) : h('span', { class: 'em-none' }, 'none')) },
    ] }));
}

export default {
  title: ['Will anything ', em('run out?')],
  eyebrow: 'Sales',
  ranges: false,

  async load(ctx) {
    if (!ctx.brand) return { connected: false };
    const act = encodeURIComponent(ctx.brand.id);
    let st;
    try { st = await ctx.api(`/api/supply/client?act=${act}&what=state`, { worker: 'ah', signal: ctx.signal }); }
    catch (e) { if (ctx.signal && ctx.signal.aborted) throw e; if (e.status === 404 || e.status === 400) return { connected: false, reason: e.message }; throw e; }
    if (!st || st.error || !Array.isArray(st.products)) return { connected: false, reason: st && st.error };
    const ads = await soft(ctx, ctx.api('/api/hub/stockads?act=' + act, { signal: ctx.signal }).then(r => (r.brands || [])[0] || null));
    return shape(st, ads);
  },

  skeleton(el) { put(el, h('div', { class: 'lx-skel-grid' }, skeleton('kpi', 4)), skeleton('chart'), skeleton('row', 6)); },

  render(el, d, ctx) {
    css();
    d = d || {};
    if (d.connected === false) {
      put(el, notConnected(ctx, { title: 'No stock feed connected',
        text: 'Stock shows here once the store\'s inventory is connected.',
        teamText: 'This brand has no stock feed yet. Connect its store inventory in Brand settings, Integrations, and stock, pace and days left show here.' }));
      return;
    }
    if (!(d.products || []).length) {
      put(el, notConnected({ ...ctx, isClient: true }, { title: 'No products in stock or selling', text: 'The stock feed is connected but holds no live products yet.' }));
      return;
    }
    d = { ...d, products: d.products.map(p => ({ ...p })) };
    const rule = judge(d, ctx);
    put(el, ...[
      h('section', { class: 'lx-hero line' }, figures(d, rule)),
      verdict(d, rule, ctx),
      chartCard(d),
      listCard(d),
      h('p', { class: 'lx-foot' }, `Stock and pace are from the store's inventory, read today. "Ease off ads" means it runs out within ${rule.low} days and no restock lands first. Ad spend is tied to products through Triple Whale orders.`),
    ].filter(Boolean));
  },
};

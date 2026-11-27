/* Business > Sales > Inventory. "Will anything run out?"
   Live: on hand, pace, days left and what is on the way for every product (the stock feed, read only:
   GET /api/supply/client?act=&what=state on the account-health worker) and the ad spend tied to each product over
   30 days (GET /api/hub/stockads on the profit worker, Triple Whale orders).
   A brand with no stock feed answers 404 on what=state, so the page first asks what=brands (same route, answers
   200 with an empty list) and shows "No stock feed connected" without ever asking for the state.
   This page is about today, so the date range is hidden. Nothing here writes. */

import { put, sheet } from '../../kit.js';
import { askWhy, helpBar, dl } from '../home/_biz.js';
import { h, em, card, takeaway, button, table, barChart, statusDot, skeleton, addStyles } from '../../kit.js';
import { tileRow, tipRows, pageStamp } from '../month/_m.js';
import { ok, usd, sum, shortDate, addDays, css, head, soft, notConnected, num } from '../email/_em.js';
import { digestLines } from './_digest.js';

/* ---------- real mode: the stock feed, shaped like the fixture ---------- */
function shape(st, ads) {
  const today = st.today || new Date().toISOString().slice(0, 10), spend = (ads && ads.products) || {};
  const day = Array(90).fill(0);
  for (const p of st.products || []) for (const v of p.variants || []) (v.series || []).forEach((n, i) => { if (i < 90) day[i] += n || 0; });
  const weeks = [];
  for (let w = 0; w < 12; w++) { const s = 6 + w * 7; weeks.push({ label: shortDate(addDays(today, s - 90)), sold: day.slice(s, s + 7).reduce((a, x) => a + x, 0) }); }
  const firstOut = p => { const v = (p.variants || []).filter(x => x.isCore && x.velocity > 0.001).sort((a, b) => (a.onHand <= 0 ? -1 : a.runOutDays ?? 9e9) - (b.onHand <= 0 ? -1 : b.runOutDays ?? 9e9))[0]; return v && (p.variants || []).length > 1 ? v.axis || v.title || v.sku || null : null; };
  return {
    connected: true, today, weeks: weeks.some(w => w.sold > 0) ? weeks : [], note: null, digest: digestLines(st),
    products: (st.products || []).filter(p => !['off', 'drop_done'].includes(p.status) && (p.velocity > 0.001 || p.onHand > 0)).map(p => ({
      id: String(p.id), title: p.title, on_hand: Math.max(0, p.onHand || 0), per_day: p.velocity || 0,
      days_left: p.velocity > 0.001 ? (p.status === 'out' ? 0 : p.runOutDays ?? 0) : null,
      lands: p.incomingLands || null, incoming: p.incoming || 0, ad_spend: (spend[p.id] || {}).spend ?? null,
      first_size: firstOut(p), cost: p.cost ?? null, status: p.status || 'ok' })),
  };
}

/* One product, opened from its row: what the stock feed knows about it today. */
function openStock(p, rule, d, ctx) {
  const row = (k, v) => h('div', null, h('small', null, k), h('b', null, v));
  const lasts = p.days_left == null ? 'no sales' : p.days_left === 0 ? 'Out now' : num(p.days_left) + ' days';
  sheet({ title: p.title, body: h('div', { class: 'em-sheet' },
    h('p', null, statusDot(CALLS[p.call][0], CALLS[p.call][1]), ' ', h('span', { class: 'em-none' }, CALL_DEF(p.call, rule).definition)),
    h('div', { class: 'tiles' },
      row('Stock lasts', lasts), row('On hand', num(p.on_hand)), row('Sells a week', p.per_day > 0 ? num(p.per_day * 7) : '0'),
      row('Ad spend, 30 days', ok(p.ad_spend) && p.ad_spend > 0 ? usd(p.ad_spend) : 'none')),
    h('div', { class: 'tiles' },
      row('Restock lands', p.lands ? shortDate(p.lands) : 'none placed'), row('Units coming', p.incoming ? num(p.incoming) : 'none'),
      row('Gap', p.gap > 0 ? p.gap + ' days with none' : 'none'), row('First to run out', p.first_size || 'one size')),
    h('p', { class: 'em-none' }, 'As of ' + shortDate(d.today) + '. Stock and pace from the store\'s inventory; ad spend tied to the product through Triple Whale orders over 30 days.' + (ctx.isClient ? '' : ' Nothing here changes stock or ads.'))) });
}

/* ---------- the call on each product ---------- */
const CALLS = { ease: ['bad', 'Ease off ads'], watch: ['', 'Watch'], scale: ['good', 'Safe to scale'], clear: ['warn', 'Push to clear'], quiet: ['off', 'Not selling'] };
/* what each call means, shown on hover or tap of the call itself */
const CALL_DEF = (k, rule) => ({ name: CALLS[k][1], definition: {
  ease: `It runs out within ${rule.low} days and no restock lands first. Spend less on its ads until stock is back.`,
  watch: `Between ${rule.low} and ${rule.safe} days of stock and no restock in time. No action yet; check again next week.`,
  scale: `${rule.safe} days of stock or more, or a restock lands before it runs out. More ad spend will not run it dry.`,
  clear: 'Over a year of stock at the current pace: money sits on the shelf. Sell it with an offer or a push.',
  quiet: 'Has stock but sold nothing in the last 30 days.' }[k] });
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
  return tileRow([
    { label: 'Out of stock', value: num(out.length), delta: out.length ? statusDot('bad', 'selling when in stock') : statusDot('good', 'nothing out') },
    { label: `Out within ${rule.low} days`, value: num(ease.length - out.length), sub: 'with no restock landing first' },
    { label: 'Safe to scale', value: num(by('scale').length), sub: `${rule.safe} days of stock, or a restock in time` },
    { label: 'Tied up in slow stock', value: anyCost ? usd(tied) : num(by('clear').length), sub: anyCost ? `${num(by('clear').length)} products, at cost` : 'products over a year of stock' },
  ], { cols: 4, window: 'As of today', source: 'The store\'s inventory' });
}

function verdict(d, rule, ctx) {
  const ease = d.products.filter(p => p.call === 'ease'), b = v => h('b', null, v);
  const spend = sum(ease.filter(p => ok(p.ad_spend)), 'ad_spend');
  const parts = !ease.length ? ['Nothing runs out in the next ', b(rule.low + ' days'), '. Every product selling has stock or a restock on the way.']
    : [b(num(ease.length) + (ease.length === 1 ? ' product' : ' products')), ease.length === 1 ? ' is' : ' are', ` out or will be within ${rule.low} days`,
      ...(spend > 0 ? [', and ads spent ', b(usd(spend)), ' on them in the last 30 days'] : []), '.'];
  return takeaway(parts, { action: ctx.isClient ? null : askWhy(ctx, 'Will anything run out', 'Ask what to do') });
}

function chartCard(d) {
  const w = d.weeks || [];
  if (w.length < 2) return null;
  const b = v => h('b', null, v);
  return card({ class: 'em-chart' },
    head('Units sold by week', 'Every product, the last ' + w.length + ' weeks · the store\'s inventory'),
    barChart({ values: w.map(x => x.sold), labels: w.map(x => x.label), lead: w.length - 1, note: d.note && d.note.index != null ? d.note : null, height: 300, phoneHeight: 260,
      windowLabel: 'Weekly, ' + w[0].label + ' to ' + w[w.length - 1].label, format: v => num(v),
      label: 'Units sold each week, the last ' + w.length + ' weeks',
      hover: i => tipRows('Week of ' + w[i].label, [['Units sold', num(w[i].sold), 'ink']]) }));
}

/* The stock digest (a66): the same lines the Monday stock post carries, for the team. */
function digestCard(d, ctx) {
  const g = d.digest;
  if (ctx.isClient || !g) return null;
  return card({ title: 'This week in stock', note: 'the same lines as the Monday stock post' },
    h('p', null, statusDot(g.tone, g.summary)),
    g.items.length ? h('ul', { class: 'em-digest', style: { display: 'grid', gap: '12px', listStyle: 'none', padding: '0', margin: '0' } }, g.items.map(x => h('li', { style: { display: 'grid', gap: '4px' } }, statusDot(x.tone, h('b', null, x.title)), x.body ? h('div', { class: 'em-none' }, x.body) : null)))
      : h('p', { class: 'em-none' }, 'Nothing needs a decision this week.'),
    g.more ? h('p', { class: 'em-none' }, `And ${g.more} more in Products and Stock.`) : null);
}

function listCard(d, rule, ctx) {
  const rows = d.products.slice().sort((a, b) => ORDER[a.call] - ORDER[b.call] || (a.days_left ?? 9e9) - (b.days_left ?? 9e9));
  const left = p => {
    if (p.days_left == null) return h('span', { class: 'em-none' }, 'no sales');
    if (p.days_left === 0) return h('span', { class: 'em-bad' }, 'Out');
    /* plain days; red only when it runs out within the low line and no restock lands first */
    /* a placed restock rides in this cell, so it still shows on a phone where the Restock column is gone */
    const txt = num(p.days_left) + ' days' + (p.lands ? ', restock ' + shortDate(p.lands) : '');
    return p.call === 'ease' ? h('span', { class: 'em-bad' }, txt) : h('span', null, txt);
  };
  const restock = p => (p.lands ? [shortDate(p.lands), p.incoming ? h('span', { class: 'em-none' }, ` (${num(p.incoming)})`) : null, p.gap > 0 && p.days_left != null ? h('small', { class: 'neg' }, `${p.gap} days too late`) : null] : h('span', { class: 'em-none' }, 'none placed'));
  /* on a phone the Call column leaves, so the call rides under the product name as its colored dot and word */
  addStyles('iv-sm', '.iv-call{display:none;margin-top:3px}@media (max-width:759px){.iv-call{display:block}}');
  return card({ title: 'Every product', note: 'most urgent first · as of today · tap a product for its detail', flush: true, class: 'em-flush' },
    table({ roomy: true, rows, onRow: p => openStock(p, rule, d, ctx), cols: [
      { key: 'title', label: 'Product', class: 'name', sortable: true, render: p => h('span', { class: 'em-name' }, p.title, p.first_size && p.call !== 'quiet' ? h('small', null, 'first out: ' + p.first_size) : null, h('span', { class: 'iv-call' }, statusDot(CALLS[p.call][0], CALLS[p.call][1]))) },
      { key: 'call', label: 'Call', sortable: true, class: 'hide-sm', value: p => ORDER[p.call], render: p => statusDot(CALLS[p.call][0], dl(CALLS[p.call][1], CALL_DEF(p.call, rule))) },
      { key: 'days_left', label: 'Stock lasts', sortable: true, render: left },
      { key: 'on_hand', label: 'On hand', num: true, sortable: true, class: 'hide-sm', render: p => num(p.on_hand) },
      { key: 'per_day', label: 'Sells a week', num: true, sortable: true, class: 'hide-sm', render: p => (p.per_day > 0 ? num(p.per_day * 7) : h('span', { class: 'em-none' }, '0')) },
      { key: 'lands', label: 'Restock lands', class: 'hide-md', sortable: true, render: p => h('span', { class: 'em-name' }, restock(p)) },
      { key: 'ad_spend', label: 'Ad spend, 30 days', num: true, sortable: true, class: 'hide-md', render: p => (ok(p.ad_spend) && p.ad_spend > 0 ? usd(p.ad_spend) : h('span', { class: 'em-none' }, 'none')) },
    ] }));
}

export default {
  title: ['Will anything ', em('run out?')],
  eyebrow: 'Sales',
  stamp: false,                     /* Home's stamp with a refresh button sits in the help bar */
  ranges: false,

  async load(ctx) {
    if (!ctx.brand) return { connected: false };
    const act = encodeURIComponent(ctx.brand.id);
    /* no feed, no access, or stock not wired to this worker: the plain "not connected" state, never the error page */
    const off = e => { if ((ctx.signal && ctx.signal.aborted) || e.status === 401) throw e; if ([400, 403, 404].includes(e.status) || /not connected|no stock feed/i.test(e.message || '')) return { connected: false, reason: e.message }; throw e; };
    let has;
    try { has = await ctx.api(`/api/supply/client?act=${act}&what=brands`, { worker: 'ah', signal: ctx.signal }); }
    catch (e) { return off(e); }
    if (!has || !Array.isArray(has.brands) || !has.brands.length) return { connected: false };
    let st, ads;
    try {
      [st, ads] = await Promise.all([
        ctx.api(`/api/supply/client?act=${act}&what=state`, { worker: 'ah', signal: ctx.signal }),
        soft(ctx, ctx.api('/api/hub/stockads?act=' + act, { signal: ctx.signal }).then(r => (r.brands || [])[0] || null)),
      ]);
    } catch (e) { return off(e); }
    if (!st || st.error || !Array.isArray(st.products)) return { connected: false, reason: st && st.error };
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
    const easeList = d.products.filter(p => p.call === 'ease');
    ctx.askWindow = 'As of today';
    ctx.askContext = `${ctx.brand.name} stock as of today: ${d.products.length} live products, ${easeList.length} out or out within ${rule.low} days with no restock first` + (easeList.length ? ' (' + easeList.slice(0, 5).map(p => p.title).join(', ') + ')' : '') + `, ${d.products.filter(p => p.call === 'scale').length} safe to scale, ${d.products.filter(p => p.call === 'clear').length} with over a year of stock.`;
    put(el, ...[
      helpBar([
        { title: 'What it is for', text: 'Will anything run out, and is any money stuck in slow stock? Everything here is as of today.' },
        { title: 'Where the numbers come from', text: `Stock and pace are from the store's inventory, read today. Ad spend is tied to products through Triple Whale orders over the last 30 days.` },
        { title: 'The calls', text: `Ease off ads: runs out within ${rule.low} days and no restock lands first. Watch: under ${rule.safe} days of stock. Safe to scale: ${rule.safe} days or more, or a restock in time. Push to clear: over a year of stock. Hover or tap a call for its meaning.` },
      ], h('span', { class: 'bz-chip' }, 'As of today'), pageStamp(ctx)),
      figures(d, rule),
      verdict(d, rule, ctx),
      digestCard(d, ctx),
      chartCard(d),
      listCard(d, rule, ctx),
    ].filter(Boolean));
  },
};

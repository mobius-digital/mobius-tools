/* Business > Website > Pages. "Which pages turn visits into sales?"
   Live, two reads on the account-health worker:
   - GET /api/google/website?act&from&to&pfrom&pto : Google Analytics for the brand (totals against the days before,
     visits by day, landing pages with carts, orders and sales, devices, channel groups). Cached an hour there.
   - GET /api/clarity?act : Microsoft Clarity per page (scroll depth, rage clicks, dead clicks). Clarity's API only
     gives the last 3 days, so those columns say so.
   Either source may be missing; the page draws what it has and never prints a zero for a source that is not there. */

import { put, sheet } from '../../kit.js';
import { askWhy, helpBar, dl as defl, rangeWords } from '../home/_biz.js';
import { h, em, card, kpi, kpis, delta, takeaway, button, table, legend, lineChart, skeleton, money } from '../../kit.js';
import { ok, usd, move, shortDate, noteAt, css, head, barCell, before, soft, notConnected, num, pct, kv } from '../email/_em.js';

const path = u => { try { return new URL(u).pathname.replace(/\/$/, '') || '/'; } catch { return String(u || '').split('?')[0].replace(/\/$/, '') || '/'; } };
const label = pg => (pg === '/' ? 'The home page' : pg);
const rateOf = (a, b) => (ok(a) && b > 0 ? a / b : null);

/* ---------- real mode: the two reads, shaped like the fixture ---------- */
function shape(ctx, g, cl) {
  const gOk = g && !g.error, cOk = cl && !cl.error;
  const c = gOk ? g.cur || {} : {}, p = gOk ? g.prev || {} : {};
  const clBy = new Map(cOk ? (cl.pages || []).map(r => [path(r.url), r]) : []);
  const pages = gOk ? (g.landing || []).filter(r => r.page && r.page !== '(not set)').map(r => {
    const k = clBy.get(path(r.page)) || {};
    return { page: path(r.page), visits: r.sessions, visits_prev: r.prev ? r.prev.sessions : null, engaged: r.engagementRate, carts: r.addToCarts,
      orders: r.ecommercePurchases, sales: r.purchaseRevenue, scroll: k.scroll ?? null, rage: k.rage ?? null, dead: k.dead ?? null };
  }) : (cOk ? (cl.pages || []).map(r => ({ page: path(r.url), visits: r.sessions, scroll: r.scroll, rage: r.rage, dead: r.dead })) : []);
  return {
    connected: gOk || cOk, analytics: gOk, clarity: cOk, clarity_window: cOk ? 'the last 3 days' : null,
    analytics_error: gOk ? null : g && g.error, range: { from: ctx.range.from, to: ctx.range.to },
    totals: gOk ? {
      visits: c.sessions, visits_prev: p.sessions, orders: c.ecommercePurchases, conversion: rateOf(c.ecommercePurchases, c.sessions),
      conversion_prev: rateOf(p.ecommercePurchases, p.sessions), carts: c.addToCarts, cart_rate: rateOf(c.addToCarts, c.sessions),
      cart_rate_prev: rateOf(p.addToCarts, p.sessions), sales: c.purchaseRevenue, per_visit: rateOf(c.purchaseRevenue, c.sessions),
      per_visit_prev: rateOf(p.purchaseRevenue, p.sessions), engaged: c.engagementRate,
    } : {},
    days: gOk ? (g.days || []).map(r => ({ date: r.date, visits: r.sessions, orders: r.purchases })) : [],
    prev_days: gOk ? (g.prev_days || []).map(r => ({ date: r.date, visits: r.sessions })) : [],
    note: null, pages,
    devices: gOk ? (g.devices || []).map(r => ({ device: r.device ? r.device[0].toUpperCase() + r.device.slice(1) : 'Other', visits: r.sessions, conversion: rateOf(r.ecommercePurchases, r.sessions) })) : [],
    channels: gOk ? (g.channels || []).map(r => ({ name: r.group, visits: r.sessions, conversion: rateOf(r.ecommercePurchases, r.sessions) })) : [],
  };
}

/* ---------- parts ---------- */
function figures(d) {
  const t = d.totals || {};
  const dl = v => (ok(v) && Math.abs(v) >= 0.005 ? delta(v, { bad: v < 0 }) : null);
  const el = kpis([
    kpi({ label: 'Visits', size: 'lg', value: ok(t.visits) ? num(t.visits) : 'no data', delta: dl(move(t.visits, t.visits_prev)),
      sub: ok(t.visits_prev) ? 'vs ' + num(t.visits_prev) + ' before' : null }),
    kpi({ label: defl('Conversion rate', 'conversion_rate'), size: 'lg', value: ok(t.conversion) ? pct(t.conversion, { digits: 2 }) : 'no data', delta: dl(move(t.conversion, t.conversion_prev)),
      sub: ok(t.orders) ? num(t.orders) + ' orders' : null }),
    kpi({ label: 'Added to cart', size: 'lg', value: ok(t.cart_rate) ? pct(t.cart_rate, { digits: 1 }) : 'no data', delta: dl(move(t.cart_rate, t.cart_rate_prev)),
      sub: ok(t.carts) ? num(t.carts) + ' carts' : 'of visits' }),
    kpi({ label: 'Sales per visit', size: 'lg', value: ok(t.per_visit) ? money(t.per_visit, { cents: true }) : 'no data', delta: dl(move(t.per_visit, t.per_visit_prev)),
      sub: ok(t.per_visit_prev) ? 'vs ' + money(t.per_visit_prev, { cents: true }) + ' before' : null }),
  ], { cols: 4 });
  el.classList.add('em-kpis');
  return el;
}

function verdict(d, ctx) {
  const rows = (d.pages || []).filter(r => ok(r.orders) && r.visits >= 300);
  if (rows.length < 2) return null;
  const b = v => h('b', null, v), cv = r => r.orders / r.visits;
  const best = rows.reduce((m, r) => (cv(r) > cv(m) ? r : m), rows[0]);
  const worst = rows.filter(r => r !== best).reduce((m, r) => (r.visits * (cv(best) - cv(r)) > m.visits * (cv(best) - cv(m)) ? r : m), rows.find(r => r !== best));
  const parts = [b(label(best.page)), ' turns the most visits into orders, ', b(pct(cv(best), { digits: 1 })), '.'];
  if (worst && cv(worst) < cv(best) / 2) parts.push(' ', b(label(worst.page)), ' got ', b(num(worst.visits)), ' visits and only ', b(num(worst.orders)), ' orders.');
  return takeaway(parts, { action: ctx.isClient ? null : askWhy(ctx, 'Which pages turn visits into sales') });
}

function chartCard(d) {
  const days = d.days || [], prev = d.prev_days || [];
  if (days.length < 2) return null;
  const b = v => h('b', null, v), hasPrev = prev.length === days.length && prev.some(r => ok(r.visits));
  return card({ class: 'em-chart' },
    head('Visits by day', 'Every visit to the store', legend([{ name: 'Visits', lead: true }, hasPrev && { name: `The ${days.length} days before`, dashed: true }])),
    lineChart({
      series: [{ name: 'Visits', lead: true, values: days.map(r => r.visits) }, hasPrev && { name: 'Before', dashed: true, values: prev.map(r => r.visits) }],
      labels: days.map(r => shortDate(r.date)), note: noteAt(days, d.note), format: v => num(v), endFormat: v => num(v), height: 340, phoneHeight: 290,
      label: 'Visits by day' + (hasPrev ? ', against the days before' : ''),
      hover: i => [b(shortDate(days[i].date)), h('span', null, 'Visits ', b(num(days[i].visits))), ok(days[i].orders) && h('span', null, 'Orders ', b(num(days[i].orders))),
        hasPrev && prev[i] && ok(prev[i].visits) && h('span', null, 'Before ', b(num(prev[i].visits)))],
    }));
}

function pagesCard(d, ctx) {
  const rows = (d.pages || []).map(r => ({ ...r, cv: rateOf(r.orders, r.visits), cr: rateOf(r.carts, r.visits) }));
  if (!rows.length) return card({ title: 'Pages' }, ctx && notConnected(ctx, { title: 'No page numbers for these dates', text: 'Pick a longer range.' }));
  const max = Math.max(...rows.map(r => r.sales || 0), 1), hasSales = rows.some(r => ok(r.sales)), cl = d.clarity;
  const thin = v => h('span', { class: 'em-none' }, v);
  const win = d.clarity_window || 'last 3 days';
  return card({ title: 'Pages people land on', note: (hasSales ? 'sorted by sales' : 'sorted by visits') + ', tap a page for its detail', flush: true, class: 'em-flush em-wrap' },
    table({ rows, sort: { key: hasSales ? 'sales' : 'visits', dir: 'desc' }, onRow: r => openPage(r, d), cols: [
      { key: 'page', label: 'Page', sortable: true, render: r => h('span', { class: 'em-name', title: r.page }, label(r.page)) },
      { key: 'visits', label: 'Visits', num: true, sortable: true, render: r => num(r.visits) },
      hasSales && { key: 'cr', label: 'Add to cart', num: true, sortable: true, class: 'hide-md', render: r => (ok(r.cr) ? pct(r.cr, { digits: 1 }) : '') },
      hasSales && { key: 'cv', label: defl('Conversion', 'conversion_rate'), num: true, sortable: true, render: r => (ok(r.cv) ? pct(r.cv, { digits: 1 }) : '') },
      cl && { key: 'scroll', label: defl('Scroll, ' + win, 'scroll_depth'), num: true, sortable: true, class: 'hide-md', render: r => (ok(r.scroll) ? Math.round(r.scroll) + '%' : thin('none')) },
      cl && { key: 'rage', label: defl('Rage clicks, ' + win, 'rage_clicks'), num: true, sortable: true, class: 'hide-md', render: r => (ok(r.rage) ? (r.rage >= 5 ? h('b', { class: 'em-bad' }, pct(r.rage / 100, { digits: 1 })) : pct(r.rage / 100, { digits: 1 })) : thin('none')) },
      hasSales && { key: 'sales', label: 'Sales', num: true, sortable: true, class: 'hide-sm', render: r => barCell(h('span', { class: 'strong' }, ok(r.sales) ? usd(r.sales) : ''), (r.sales || 0) / max) },
    ].filter(Boolean) }));
}

/* One landing page, opened from its row: what is known about it in these dates. */
function openPage(r, d) {
  const t = d.totals || {}, cv = rateOf(r.orders, r.visits), cr = rateOf(r.carts, r.visits);
  const vsSite = (v, site) => (ok(v) && ok(site) && site > 0 ? (v >= site ? ' above' : ' under') + ' the site, ' + pct(site, { digits: 1 }) : '');
  sheet({ title: label(r.page), body: h('div', { class: 'em-sheet' },
    h('div', { class: 'tiles' },
      h('div', null, h('small', null, 'Visits'), h('b', null, num(r.visits)), h('span', null, ok(t.visits) && t.visits > 0 ? pct(r.visits / t.visits, { digits: 1 }) + ' of all visits' : '')),
      h('div', null, h('small', null, 'Add to cart'), h('b', null, ok(cr) ? pct(cr, { digits: 1 }) : 'no data'), h('span', null, vsSite(cr, t.cart_rate))),
      h('div', null, h('small', null, defl('Conversion', 'conversion_rate')), h('b', null, ok(cv) ? pct(cv, { digits: 1 }) : 'no data'), h('span', null, vsSite(cv, t.conversion))),
      h('div', null, h('small', null, 'Sales'), h('b', null, ok(r.sales) ? usd(r.sales) : 'no data'), h('span', null, ok(r.sales) && r.visits > 0 ? money(r.sales / r.visits, { cents: true }) + ' a visit' : ''))),
    kv([['Orders', ok(r.orders) ? num(r.orders) : 'no data'], ['Added to cart', ok(r.carts) ? num(r.carts) : 'no data'],
      d.clarity && ['Scroll, ' + (d.clarity_window || 'last 3 days'), ok(r.scroll) ? Math.round(r.scroll) + '%' : 'none'], d.clarity && ['Rage clicks, ' + (d.clarity_window || 'last 3 days'), ok(r.rage) ? pct(r.rage / 100, { digits: 1 }) : 'none'],
      ['Address', r.page]]),
    h('p', { class: 'quiet' }, 'Visits by day and the phone or desktop split for one page are not read yet; the whole site by day is in the chart on this page.')) });
}

function splitTable(title, rows, key, label) {
  if (!rows || !rows.length) return null;
  const tot = rows.reduce((t, r) => t + (r.visits || 0), 0) || 1;
  return card({ title, flush: true, class: 'em-flush' },
    table({ rows, sort: { key: 'visits', dir: 'desc' }, cols: [
      { key, label, render: r => r[key] },
      { key: 'visits', label: 'Visits', num: true, render: r => barCell(num(r.visits), r.visits / tot) },
      { key: 'share', label: 'Share', num: true, render: r => pct(r.visits / tot) },
      { key: 'conversion', label: defl('Conversion', 'conversion_rate'), num: true, render: r => (ok(r.conversion) ? pct(r.conversion, { digits: 2 }) : '') },
    ] }));
}

export default {
  title: ['Which pages turn ', em('visits into sales?')],
  eyebrow: 'Website',

  async load(ctx) {
    if (!ctx.brand) return { connected: false };
    const a = encodeURIComponent(ctx.brand.id), p = before(ctx.range);
    const [g, cl] = await Promise.all([
      soft(ctx, ctx.api(`/api/google/website?act=${a}&from=${ctx.range.from}&to=${ctx.range.to}&pfrom=${p.from}&pto=${p.to}`, { worker: 'ah', signal: ctx.signal })),
      soft(ctx, ctx.api(`/api/clarity?act=${a}`, { worker: 'ah', signal: ctx.signal })),
    ]);
    return shape(ctx, g || { error: 'not_linked' }, cl || { error: 'not_linked' });
  },

  skeleton(el) { put(el, h('div', { class: 'lx-skel-grid' }, skeleton('kpi', 4)), skeleton('chart'), skeleton('row', 6)); },

  render(el, d, ctx) {
    css();
    d = d || {};
    if (d.connected === false) {
      put(el, notConnected(ctx, { title: 'No website source connected',
        text: 'Page numbers show here once the store\'s Google Analytics is linked.',
        teamText: 'Link the brand\'s Google Analytics property (and Microsoft Clarity for scroll and rage clicks) in Brand settings, Integrations, and pages show here.' }));
      return;
    }
    const two = [splitTable('Phone or desktop', d.devices, 'device', 'Device'), splitTable('Where visits came from', d.channels, 'name', 'Channel')].filter(Boolean);
    const src = [d.analytics !== false ? 'Visits, carts, orders and sales are Google Analytics\' own count.' : 'Google Analytics is not linked, so there are no orders or sales per page.',
      d.clarity ? ` Scroll and rage clicks are from Microsoft Clarity and cover ${d.clarity_window || 'the last 3 days'} only, whatever dates are picked.` : ''].join('');
    put(el, ...[
      helpBar([
        { title: 'What it is for', text: 'Which pages turn visits into sales on the dates at the top. Tap a page for its detail.' },
        { title: 'Where the numbers come from', text: src },
      ], h('span', { class: 'bz-chip' }, rangeWords(ctx, d.range))),
      d.analytics !== false && h('section', { class: 'lx-hero line' }, figures(d)),
      d.analytics !== false && verdict(d, ctx),
      chartCard(d),
      pagesCard(d, ctx),
      two.length === 2 ? h('div', { class: 'em-two' }, two) : two[0],
    ].filter(Boolean));
  },
};

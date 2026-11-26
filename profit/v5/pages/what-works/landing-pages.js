/* What works > Landing pages. "Which page turns clicks into orders?" Each ad against the page it sends people to.
   Live data: GET /api/hub/creative (profit worker): Meta clicks and add to carts and Triple Whale orders per ad;
   GET /api/ad-creatives (account-health): where each ad sends people (the top 80 ads by spend). Ads are grouped by page.
   Not built yet: Triple Whale visits per page per ad. Until then the live page counts Meta clicks, not visits, and says so.
   A row opens the page inside the app (a live preview, or a drawing in sample mode). */

import { APP_NAME } from '../../config.js';
import { put } from '../../kit.js';
import { h, card, kpi, kpis, takeaway, lineChart, legend, sheet, table, gauge, button, em, money, num, pct, x, skeleton, empty } from '../../kit.js';
import { css, gate, noAds, loadAds, sampleAds, art, meter, pageOf, findingButton, foot, thin, thinWords, SRC_NOTE } from './_ww.js';

const FLOOR_VISITS = 300;
const p2 = v => (v == null ? 'no data' : pct(v, { digits: v < 0.1 ? 2 : 1 }));
const nm = p => (p === '/' ? '/ (homepage)' : p);
const tag = p => (p === '/' ? 'Home' : p.split('/').pop());
const typeOf = p => (p === '/' ? 'Homepage' : p.startsWith('/pages/') ? 'Landing page' : p.startsWith('/collections/') ? 'Collection' : p.startsWith('/products/') ? 'Product page' : 'Other page');

function pages(d) {
  const by = new Map(), none = [];
  for (const a of d.ads) {
    if (!(a.spend > 0)) continue;
    const p = pageOf(a.link);
    if (!p) { none.push(a); continue; }
    if (!by.has(p)) by.set(p, { path: p, link: a.link, ads: [] });
    by.get(p).ads.push(a);
  }
  const sum = (list, k) => list.reduce((t, a) => t + (a[k] || 0), 0);
  const visitsOf = a => (a.visits != null ? a.visits : a.clicks || 0);
  const cartsOf = a => (a.atc != null ? a.atc : Math.round((a.atc_rate || 0) * (a.clicks || 0)));
  const rows = [...by.values()].map(r => {
    const visits = r.ads.reduce((t, a) => t + visitsOf(a), 0), carts = r.ads.reduce((t, a) => t + cartsOf(a), 0), orders = sum(r.ads, 'tw_orders'), spend = sum(r.ads, 'spend'), sales = sum(r.ads, 'tw_sales');
    return { ...r, type: typeOf(r.path), visits, carts, orders, spend, sales, atc: visits ? carts / visits : null, conv: visits ? orders / visits : null, roas: spend ? sales / spend : null,
      ads: r.ads.map(a => ({ ...a, v: visitsOf(a), conv: visitsOf(a) ? (a.tw_orders || 0) / visitsOf(a) : null })).sort((p, q) => q.spend - p.spend) };
  }).sort((p, q) => q.visits - p.visits);
  const tot = { visits: sum(rows, 'visits'), carts: sum(rows, 'carts'), orders: sum(rows, 'orders') };
  tot.conv = tot.visits ? tot.orders / tot.visits : null; tot.atc = tot.visits ? tot.carts / tot.visits : null;
  return { rows, none, tot, real: d.source === 'live' || !d.ads.some(a => a.visits != null) };
}

/* a small drawing of a page: where a live preview cannot be shown */
const mini = () => h('div', { class: 'ww-mini', 'aria-hidden': 'true' }, h('i'), h('i', { class: 'b' }), h('i'), h('i'), h('i'));

function preview(r, P, d, ctx) {
  const word = P.real ? 'Clicks' : 'Visits';
  const phone = ctx.sample
    ? h('div', { class: 'ww-ph' }, h('div', { class: 'sk' }, h('div', { class: 'tb' }, r.type === 'Landing page' ? 'SALE ON NOW' : 'NORTHLAKE GOLF'), h('i', { style: { height: '120px' } }), h('i', { style: { height: '12px', width: '70%' } }), h('i', { style: { height: '12px', width: '45%' } }), h('i', { style: { height: '30px', background: 'var(--ink)' } }), h('div', { class: 'two' }, h('i', { style: { height: '70px' } }), h('i', { style: { height: '70px' } })), h('div', { class: 'two' }, h('i', { style: { height: '70px' } }), h('i', { style: { height: '70px' } }))))
    : h('div', { class: 'ww-ph' }, h('iframe', { src: r.link, title: 'Preview of ' + r.path, loading: 'lazy', sandbox: 'allow-scripts allow-same-origin', referrerpolicy: 'no-referrer' }));
  const best = r.ads.filter(a => a.v >= 100 && a.conv != null);
  const hi = best.length >= 2 ? best.reduce((p, c) => (c.conv > p.conv ? c : p)) : null, lo = best.length >= 2 ? best.reduce((p, c) => (c.conv < p.conv ? c : p)) : null;
  const step = (name, n, of, sub) => h('div', { class: 'r' }, h('div', null, h('span', null, name), h('small', null, sub || ''), h('b', null, num(n))), gauge({ value: n, max: of || 1, thin: true }));
  sheet({ title: nm(r.path), side: 'right', class: 'ww-wide', body: h('div', { class: 'ww-stack', style: { gap: '22px' } },
    h('div', { class: 'ww-lp' },
      h('div', { style: { display: 'grid', gap: '10px', justifyItems: 'center' } }, phone,
        h('span', { class: 'lx-foot' }, ctx.sample ? 'A drawing of the page' : 'The live page. If it stays blank, the store does not allow previews inside other sites.'),
        r.link && !ctx.sample ? button('Open the live page', { href: r.link, target: '_blank', icon: 'arrow' }) : null),
      h('div', { class: 'ww-steps' },
        h('h3', { style: { fontSize: '15px', fontWeight: 600 } }, 'What visitors did on this page'),
        step(word, r.visits, r.visits), step('Add to cart', r.carts, r.visits, p2(r.atc) + ' of ' + word.toLowerCase()), step('Order', r.orders, r.visits, p2(r.conv) + ' of ' + word.toLowerCase()),
        h('p', { class: 'lx-foot' }, `All pages: ${p2(P.tot.conv)} of ${word.toLowerCase()} ordered.` + (r.atc != null && r.conv != null && r.atc > r.conv * 4 ? ' Most people who add to cart do not finish.' : '')))),
    hi && lo && hi !== lo ? takeaway([h('b', null, lo.name), ` gets the click and loses the sale: ${p2(lo.conv)} of its ${word.toLowerCase()} order, against ${p2(hi.conv)} for `, h('b', null, hi.name), ' on the same page.']) : null,
    h('div', null, h('h3', { style: { fontSize: '15px', fontWeight: 600, marginBottom: '6px' } }, `Ads sending people here (${num(r.ads.length)})`),
      table({ cols: [
        { key: 'name', label: 'Ad', render: a => h('span', { class: 'lx-row', style: { flexWrap: 'nowrap' } }, h('span', { style: { width: '28px', flex: 'none' } }, art({ ...a, over: null, len: null })), h('span', { class: 'name' }, a.name)) },
        { key: 'spend', label: 'Spend', num: true, render: a => money(a.spend) },
        { key: 'v', label: word, num: true, class: 'hide-sm', render: a => num(a.v) },
        { key: 'tw_orders', label: 'Orders', num: true, render: a => num(a.tw_orders) },
        { key: 'conv', label: 'To order', num: true, render: a => h('span', { class: a === hi ? 'pos' : a === lo ? 'neg' : '' }, p2(a.conv)) },
        { key: 'roas', label: 'ROAS', num: true, class: 'hide-sm', render: a => x(a.roas) },
      ], rows: r.ads.slice(0, 8) })),
    findingButton(ctx, () => ({ say: [h('b', null, r.path), ` turns ${p2(r.conv)} of ${word.toLowerCase()} into orders. All pages: ${p2(P.tot.conv)}.`], measure: 'visit to order',
      proof: [{ value: r.conv || 0, text: p2(r.conv), name: r.path.slice(0, 18), sub: r.type.toLowerCase() }], normal: { value: P.tot.conv || 0, text: p2(P.tot.conv), name: 'All pages', sub: 'every page' },
      brief: { title: 'Page test: ' + r.path, make: 'Send the best ad to two pages, even split', why: 'Same ad, two pages: the only fair page test.', count: 1 } }), 'Set up a page test')) });
}

function view(d, ctx) {
  const stop = gate(d, ctx);
  if (stop) return [stop];
  if (!d.ads || !d.ads.length) return [noAds(ctx)];
  const P = pages(d);
  if (!P.rows.length) return [empty({ title: 'No landing pages read yet', text: APP_NAME + ' reads where the ads with the most spend send people. None came back on these dates.' })];
  const word = P.real ? 'Clicks' : 'Visits', lw = word.toLowerCase();
  const sure = P.rows.filter(r => r.visits >= FLOOR_VISITS && r.orders >= 5);
  const bestAtc = sure.length ? sure.reduce((p, c) => (c.atc > p.atc ? c : p)) : null;
  const weak = sure.length >= 2 ? sure.reduce((p, c) => (c.conv < p.conv ? c : p)) : null;
  const best = sure.length >= 2 ? sure.reduce((p, c) => (c.conv > p.conv ? c : p)) : null;
  const chartRows = P.rows.slice(0, 8);
  const top = Math.max(...P.rows.map(r => r.conv || 0), P.tot.conv || 0) * 1.15 || 0.01;
  return [
    kpis([
      kpi({ label: 'Best page for add to cart', value: bestAtc ? p2(bestAtc.atc) : 'no data', sub: bestAtc ? nm(bestAtc.path) : 'too few ' + lw + ' yet', size: 'lg' }),
      kpi({ label: (P.real ? 'Click' : 'Visit') + ' to order, all pages', value: p2(P.tot.conv), sub: `${num(P.tot.orders)} orders from ${num(P.tot.visits)} ${lw}`, size: 'lg' }),
      kpi({ label: 'Weakest page', value: weak ? p2(weak.conv) : 'no data', sub: weak ? `${nm(weak.path)}, ROAS ${x(weak.roas)}` : 'needs two pages with 5+ orders', size: 'lg' }),
      kpi({ label: 'Ads with no page set', value: num(P.none.length), sub: P.none.length ? money(P.none.reduce((t, a) => t + a.spend, 0)) + ' spend' : 'every ad has one', size: 'lg' }),
    ], { cols: 4 }),
    best && weak && best !== weak ? takeaway([h('b', null, nm(best.path)), ` turns ${p2(best.conv)} of ${lw} into orders, `, h('b', null, nm(weak.path)), ` only ${p2(weak.conv)}. Page and offer are mixed here, so test before moving ads.`]) : null,
    card({ class: 'ww-cd', title: `Which page turns ${lw} into orders?`, note: `Sorted by ${lw}. The line is all pages, ${p2(P.tot.conv)}.`, action: legend([{ name: (P.real ? 'Click' : 'Visit') + ' to order', square: true, color: 'var(--ink)' }, { name: 'All pages', dashed: true }]) },
      h('div', { style: { marginTop: '18px' } }, lineChart({ series: [{ type: 'bar', values: chartRows.map(r => r.conv), leadAt: best ? chartRows.indexOf(best) : -1, dimAt: i => chartRows[i].visits < FLOOR_VISITS || chartRows[i].orders < 5, labels: v => p2(v) }],
        labels: chartRows.map(r => { const t = tag(r.path); return t.length > 16 ? t.slice(0, 15) + '.' : t; }), goal: { value: P.tot.conv, label: 'All pages ' + p2(P.tot.conv) }, format: v => pct(v, { digits: 1 }), height: 300, phoneHeight: 250, endLabels: false,
        label: 'Visit to order by page', hover: i => [h('b', null, nm(chartRows[i].path)), ` ${p2(chartRows[i].conv)}, ${num(chartRows[i].orders)} orders from ${num(chartRows[i].visits)} ${lw}`] }))),
    card({ class: 'ww-cd', title: 'Pages our ads send people to', note: 'Tap a page to see it and the ads sending people there.', flush: true },
      h('div', { class: 'ww-pgs' },
        h('div', { class: 'ww-pg hd lx-cap' }, h('span'), h('span', null, 'Page'), h('span', { class: 'n hm' }, 'Ads'), h('span', { class: 'n' }, word), h('span', { class: 'n hm' }, 'Add to cart'), h('span', { class: 'n' }, 'To order'), h('span')),
        P.rows.slice(0, 14).map(r => {
          const dim = r.visits < FLOOR_VISITS || r.orders < 5;
          return h('button', { class: 'ww-pg', type: 'button', onclick: () => preview(r, P, d, ctx) },
            mini(),
            h('div', { class: 'pth' }, h('b', null, nm(r.path)), h('small', null, `${r.type}, ${money(r.spend)}`)),
            h('div', { class: 'n hm' }, h('b', null, num(r.ads.length))),
            h('div', { class: 'n' }, h('b', null, num(r.visits))),
            h('div', { class: 'n hm' }, h('b', null, p2(r.atc)), h('small', null, num(r.carts) + ' carts')),
            h('div', { class: 'n' }, h('b', { class: dim ? 'dim' : '' }, p2(r.conv)), h('small', null, dim ? (r.orders < 5 ? thinWords(r.orders) : 'Too few ' + lw + ' to say') : `${num(r.orders)} orders`), meter(r.conv, P.tot.conv, { max: top, dim })),
            h('span', { class: 'go lx-btn quiet' }, 'Open page'));
        }))),
    foot(P.real ? 'Clicks are Meta link clicks. Triple Whale visits per page are not in ' + APP_NAME + ' yet, so a click that never loaded the page still counts.' : null,
      `Gray = under ${FLOOR_VISITS} ${lw} or 5 orders: read it as a hint.`, d.source === 'live' && d.covered ? `Pages are read for the top ${num(d.covered)} ads by spend.` : null, SRC_NOTE),
  ].filter(Boolean);
}

const CSS = `.ww-pgs{display:grid}
.ww-pg .meter,.ww-pg .lx-gauge{margin-top:4px}
.ww-pg .go{height:30px;pointer-events:none}
.ww-lp{display:grid;grid-template-columns:240px minmax(0,1fr);gap:28px;align-items:start}
@media (max-width:759px){.ww-lp{grid-template-columns:1fr}.ww-pgs .ww-pg.hd{display:none}}`;

export default {
  title: ['Which page turns clicks ', em('into orders?')],
  eyebrow: 'What works',
  load: ctx => loadAds(ctx, { covers: 'more' }),
  sample: () => sampleAds(),
  skeleton(el) { put(el, skeleton('kpi', 4), skeleton('chart'), skeleton('row', 6)); },
  render(el, d, ctx) {
    css();
    if (!document.getElementById('ww-lp-css')) { const st = document.createElement('style'); st.id = 'ww-lp-css'; st.textContent = CSS; document.head.append(st); }
    put(el, ...view(d, ctx));
    if (new URLSearchParams(location.search).get('open') === '1') { const b = el.querySelector('button.ww-pg'); if (b) b.click(); }
  },
};

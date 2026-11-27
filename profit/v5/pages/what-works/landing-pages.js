/* What works > Landing pages. "Which page turns clicks into orders?" Each ad against the page it sends people to.
   Live data: GET /api/hub/creative (profit worker): Meta clicks and add to carts and Triple Whale orders per ad;
   GET /api/ad-creatives (account-health): where each ad sends people (the top 80 ads by spend). Ads are grouped by page.
   Not built yet: Triple Whale visits per page per ad. Until then the live page counts Meta clicks, not visits, and says so.
   A row opens the page inside the app (a live preview, or a drawing in sample mode). */

import { APP_NAME } from '../../config.js';
import { put, safeHref } from '../../kit.js';
import { h, card, kpi, takeaway, lineChart, legend, sheet, table, button, em, money, num, pct, x, skeleton, empty, platformChip, sourceLine } from '../../kit.js';
import { css, gate, noAds, loadAds, sampleAds, art, meter, pageOf, findingButton, thinWords, dl, helpBar, winOf, tileRow, openAd, sortMenu } from './_ww.js';

const ST = { sort: 'visits', dir: 'desc' };

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

function preview(r, P, d, ctx) {
  const word = P.real ? 'Clicks' : 'Visits', wkey = P.real ? 'clicks' : 'visits';
  const best = r.ads.filter(a => a.v >= 100 && a.conv != null);
  const hi = best.length >= 2 ? best.reduce((p, c) => (c.conv > p.conv ? c : p)) : null, lo = best.length >= 2 ? best.reduce((p, c) => (c.conv < p.conv ? c : p)) : null;
  const step = (label, n, share) => h('div', { class: 'ww-fun-s' }, h('span', { class: 'k' }, label), h('b', null, num(n)), share != null ? h('small', null, p2(share) + ' of ' + word.toLowerCase()) : h('small', null, 'from these ads'),
    h('i', { style: { '--v': Math.max(4, Math.min(100, 100 * (n || 0) / (r.visits || 1))).toFixed(0) + '%' } }));
  sheet({ title: nm(r.path), body: h('div', { class: 'ww-stack', style: { gap: '22px' } },
    h('div', { class: 'ww-bar' }, platformChip('meta'), h('span', { class: 'note' }, r.type + ', ' + money(r.spend) + ' spend, ' + (winOf(ctx) || 'these dates')), h('span', { class: 'sp' }),
      safeHref(r.link) ? button('Open the live page', { href: safeHref(r.link), target: '_blank', icon: 'arrow', title: 'Opens the store page in a new tab' }) : null),
    h('div', null, h('h3', { class: 'ww-h3' }, 'What visitors did on this page'),
      h('div', { class: 'ww-fun' }, step(dl(word, wkey), r.visits, null), step(dl('Add to cart', 'add_to_cart'), r.carts, r.atc), step(dl('Orders', 'tw_orders'), r.orders, r.conv)),
      h('p', { class: 'ww-cp-n' }, `All pages: ${p2(P.tot.conv)} of ${word.toLowerCase()} ordered.`)),
    h('div', null, h('h3', { class: 'ww-h3' }, `Ads sending people here (${num(r.ads.length)})`),
      table({ sort: { key: 'spend', dir: 'desc' }, cols: [
        { key: 'name', label: 'Ad', sortable: true, render: a => h('span', { class: 'lx-row', style: { flexWrap: 'nowrap' } }, h('span', { style: { width: '28px', flex: 'none' } }, art({ ...a, over: null, len: null })), h('span', { class: 'name' }, a.name)) },
        { key: 'spend', label: 'Spend', num: true, sortable: true, render: a => money(a.spend) },
        { key: 'v', label: dl(word, wkey), num: true, sortable: true, class: 'hide-sm', render: a => num(a.v) },
        { key: 'tw_orders', label: dl('Orders', 'tw_orders'), num: true, sortable: true, render: a => num(a.tw_orders) },
        { key: 'conv', label: dl('To order', 'to_order'), num: true, sortable: true, render: a => h('span', { class: a === hi ? 'pos' : a === lo ? 'neg' : '' }, p2(a.conv)) },
        { key: 'roas', label: dl('ROAS', 'roas'), num: true, sortable: true, class: 'hide-sm', render: a => x(a.roas) },
      ], rows: r.ads.slice(0, 12), onRow: a => openAd(ctx, a, d) })),
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
  const wkey = P.real ? 'clicks' : 'visits';
  const SORT = { visits: r => r.visits, atc: r => r.atc ?? -1, conv: r => r.conv ?? -1, spend: r => r.spend, ads: r => r.ads.length };
  const rowsBox = h('div', { class: 'ww-pgs' });
  const head = (key, label, cls) => h('button', { type: 'button', class: 'n hs' + (cls ? ' ' + cls : '') + (ST.sort === key ? ' on' : ''), 'aria-label': 'Sort by ' + (typeof label === 'string' ? label : label.textContent),
    onclick: () => { ST.dir = ST.sort === key && ST.dir === 'desc' ? 'asc' : 'desc'; ST.sort = key; paintRows(); } }, label, ST.sort === key ? (ST.dir === 'desc' ? ' \u2193' : ' \u2191') : '');
  const paintRows = () => {
    const f = SORT[ST.sort] || SORT.visits;
    const list = [...P.rows].sort((a, b) => (ST.dir === 'desc' ? f(b) - f(a) : f(a) - f(b))).slice(0, 14);
    put(rowsBox,
      h('div', { class: 'ww-pg hd' }, h('span', null, 'Page'), head('ads', 'Ads', 'hm'), head('visits', dl(word, wkey)), head('atc', dl('Add to cart', 'add_to_cart'), 'hm'), head('conv', dl('To order', 'to_order')), head('spend', 'Spend', 'hm'), h('span')),
      list.map(r => {
        const dim = r.visits < FLOOR_VISITS || r.orders < 5;
        return h('button', { class: 'ww-pg', type: 'button', onclick: () => preview(r, P, d, ctx) },
          h('div', { class: 'pth' }, h('b', null, nm(r.path)), h('small', null, r.type)),
          h('div', { class: 'n hm' }, h('b', null, num(r.ads.length))),
          h('div', { class: 'n' }, h('span', { class: 'k' }, word), h('b', null, num(r.visits))),
          h('div', { class: 'n hm' }, h('b', null, p2(r.atc)), h('small', null, num(r.carts) + ' carts')),
          h('div', { class: 'n cv' }, h('span', { class: 'k' }, 'To order'), h('b', { class: dim ? 'dim' : '', title: dim ? 'Under ' + FLOOR_VISITS + ' ' + lw + ' or 5 orders: a hint, not a result' : null }, p2(r.conv)), h('small', null, dim ? (r.orders < 5 ? thinWords(r.orders) : 'Too few ' + lw + ' to say') : `${num(r.orders)} orders`), meter(r.conv, P.tot.conv, { max: top, dim, goalTitle: 'All pages ' + p2(P.tot.conv) })),
          h('div', { class: 'n hm' }, h('b', null, money(Math.round(r.spend || 0)))),
          h('span', { class: 'go lx-btn quiet' }, 'Details'));
      }));
  };
  paintRows();
  const phoneSort = h('span', { class: 'ww-onph' }, sortMenu({ items: [{ id: 'visits', label: word }, { id: 'atc', label: 'Add to cart' }, { id: 'conv', label: 'To order' }, { id: 'spend', label: 'Spend' }],
    sort: ST.sort, dir: ST.dir, onChange: (id, d2) => { ST.sort = id; ST.dir = d2; paintRows(); } }));
  const narrow = typeof matchMedia === 'function' && matchMedia('(max-width: 759px)').matches;
  /* a column figure that would sit on the dashed all pages line moves into its x label (the chart draws it 7px over the column) */
  const yTop = Math.ceil(top * 200) / 200 || 0.01, plotH = (narrow ? 250 : 300) - 60;
  const onGoal = v => P.tot.conv != null && v != null && (P.tot.conv - v) / yTop * plotH >= -4 && (P.tot.conv - v) / yTop * plotH <= 22;
  ctx.askWindow = winOf(ctx) || null;
  ctx.askContext = `What works, Landing pages, ${winOf(ctx) || 'these dates'}: ${num(P.rows.length)} store pages get the Meta ads' ${lw}. ${P.real ? 'Click' : 'Visit'} to order on all pages ${p2(P.tot.conv)} (${num(P.tot.orders)} Triple Whale orders from ${num(P.tot.visits)} ${lw})`
    + (best ? `; best ${nm(best.path)} ${p2(best.conv)}` : '') + (weak ? `, weakest ${nm(weak.path)} ${p2(weak.conv)}` : '') + '.';
  return [
    helpBar([{ title: 'What it is for', text: 'Which store page turns the Meta ads\' ' + lw + ' into orders. Each ad is grouped under the page it sends people to; tap a page for its funnel and the ads sending people there.' },
      { title: 'The figures', text: (P.real ? 'Clicks are Meta link clicks: Triple Whale visits per page are not in ' + APP_NAME + ' yet, so a click that never loaded the page still counts. ' : '') + 'To order: orders out of ' + lw + '. Gray: under ' + FLOOR_VISITS + ' ' + lw + ' or 5 orders, a hint only.' + (d.source === 'live' && d.covered ? ` Pages are read for the top ${num(d.covered)} ads by spend.` : '') }], {},
      platformChip('meta'), h('span', { class: 'note' }, 'Meta ads, the dates at the top')),
    tileRow([
      kpi({ label: dl('Best page for add to cart', 'add_to_cart'), value: bestAtc ? p2(bestAtc.atc) : h('small', null, 'No data'), sub: bestAtc ? h('span', { class: 'ww-ell', title: nm(bestAtc.path) }, nm(bestAtc.path)) : 'Too few ' + lw + ' yet', window: winOf(ctx), source: 'Meta' }),
      kpi({ label: dl((P.real ? 'Click' : 'Visit') + ' to order, all pages', 'to_order'), value: p2(P.tot.conv), sub: `${num(P.tot.orders)} orders from ${num(P.tot.visits)} ${lw}`, window: winOf(ctx), source: 'Triple Whale orders, Meta ' + lw }),
      kpi({ label: 'Weakest page', value: weak ? p2(weak.conv) : h('small', null, 'No data'), sub: weak ? h('span', { class: 'ww-ell', title: nm(weak.path) }, `${nm(weak.path)}, ROAS ${x(weak.roas)}`) : 'Needs two pages with 5+ orders', window: winOf(ctx), source: 'Triple Whale, last click' }),
      kpi({ label: 'Ads with no page set', value: num(P.none.length), sub: P.none.length ? money(P.none.reduce((t, a) => t + a.spend, 0)) + ' spend' : 'Every ad has one', window: winOf(ctx), source: 'Meta' }),
    ], 4),
    best && weak && best !== weak ? takeaway(['Page and offer are mixed here: ', h('b', null, 'test before moving ads'), ' to the stronger page.']) : null,
    card({ class: 'ww-cd', title: `Which page turns ${lw} into orders?`, note: sourceLine(winOf(ctx), 'Triple Whale orders over Meta ' + lw), action: legend([{ name: 'Best page', square: true, color: 'var(--brand)' }, { name: 'Other pages', square: true, color: '#C9D0DE' }, { name: 'All pages ' + p2(P.tot.conv), dashed: true }]) },
      h('div', { style: { marginTop: '18px' } }, lineChart({ windowLabel: 'Per page, ' + (winOf(ctx) || 'these dates'), series: [{ type: 'bar', tone: 'slate', name: (P.real ? 'Click' : 'Visit') + ' to order', values: chartRows.map(r => r.conv), leadAt: best ? chartRows.indexOf(best) : -1, dimAt: i => chartRows[i].visits < FLOOR_VISITS || chartRows[i].orders < 5, labels: v => (onGoal(v) ? '' : p2(v)) }],
        labels: chartRows.map(r => { const t = tag(r.path), c = t.length > 16 ? t.slice(0, 15) + '.' : t; return onGoal(r.conv) ? c + ', ' + p2(r.conv) : c; }), yMax: yTop, yTicks: 2, goal: { value: P.tot.conv, label: narrow ? '' : 'All pages ' + p2(P.tot.conv) }, format: v => pct(v, { digits: 1 }), height: 300, phoneHeight: 250, endLabels: false,
        label: 'Visit to order by page', hover: i => [h('b', null, nm(chartRows[i].path)), ` ${p2(chartRows[i].conv)}, ${num(chartRows[i].orders)} orders from ${num(chartRows[i].visits)} ${lw}`] }))),
    card({ class: 'ww-cd', title: 'Pages our ads send people to', note: h('span', null, sourceLine(winOf(ctx), 'orders Triple Whale, ' + lw + ' and spend Meta'), h('span', { class: 'ww-ondesk' }, ' · Tap a column to sort, a page for its funnel and ads.'), h('span', { class: 'ww-onph' }, ' · Tap a page for its funnel and ads.')), action: phoneSort, flush: true }, rowsBox),
  ].filter(Boolean);
}

const CSS = `.ww-pgs{display:grid}
.ww-ell{display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-width:0}
.ww-pgs .ww-pg{grid-template-columns:minmax(0,1.6fr) repeat(5,minmax(64px,.6fr)) 84px}
.ww-pg.hd{font-size:var(--fs-colhead,11.5px);font-weight:600;color:var(--muted);align-items:end}
.ww-pg.hd>span:first-child{text-align:left}
.ww-pg .n .k{display:none;font-size:var(--fs-colhead,11.5px);font-weight:500;color:var(--muted)}
.ww-pg .n small{white-space:normal}
.ww-pg .meter,.ww-pg .lx-gauge{margin-top:4px}
.ww-pg .go{height:30px;pointer-events:none;justify-self:end}
.ww-onph{display:none}
.ww-lp{display:grid;grid-template-columns:240px minmax(0,1fr);gap:28px;align-items:start}
@media (max-width:1040px){.ww-pgs .ww-pg{grid-template-columns:minmax(0,1fr) 88px 120px 84px}}
@media (max-width:759px){.ww-lp{grid-template-columns:1fr}.ww-pgs .ww-pg.hd{display:none}.ww-ondesk{display:none}.ww-onph{display:inline}
  .ww-pgs .ww-pg{grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:8px 16px;align-items:start}.ww-pgs .ww-pg .pth{grid-column:1/-1}
  .ww-pg .n{text-align:left}.ww-pg .n .k{display:block;margin-bottom:2px}}`;

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

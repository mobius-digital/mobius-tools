/* Ads > Google > Products and creative for one brand. Three views, one switch:
     Products          which products carry Shopping and Performance Max, and which take clicks and never sell
     Videos            the YouTube videos (bought in Google, so they live here)
     Text and images   search ad headlines and the Performance Max assets, with Google's own rating
   Sales and ROAS are Triple Whale's; "Google says" is second.

   The Videos and Text and images views are drawn by the existing ads-videos.js module (same data, same
   parts), shown one half at a time. Real mode: that module reads /api/google/ads-ads. Products have no
   route yet (Google's shopping report and the Merchant Center feed are not read), so the Products view
   is the example from the sample file, with the chip. */

import { put } from '../../kit.js';
import { h, em, card, segmented, table, barChart, legend, statusDot, money, num, pct, x, sheet } from '../../kit.js';
import { def, headRow } from '../platforms/_ads.js';
import { styles, sampleGoogle, fig, figs, TWS, GADS, say, ok, usd, exampleChip, isEx, rangeLabel } from './_g.js';
import videos from './ads-videos.js';

const VIEWS = [{ id: 'products', label: 'Products' }, { id: 'videos', label: 'Videos' }, { id: 'text', label: 'Text and images' }];
const FEED = { approved: ['good', 'Approved'], limited: ['warn', 'Limited'], disapproved: ['bad', 'Disapproved'] };

function productsView(d) {
  const p = d.products;
  if (!p || !p.rows || !p.rows.length) return [h('div', { class: 'lx-empty' }, h('h3', null, 'No product numbers yet'), h('p', null, 'Products show here once Google’s shopping report is read for this brand.'))];
  const ex = isEx(d, 'products'), cur = ex ? 'USD' : d.currency, g = (ex ? d.example_goals : d.goals) || {}, s = p.summary, rows = p.rows;
  const W = d.window ? d.window.label : '';
  const top = figs([
    fig({ label: 'Products that carry the spend', win: W, source: GADS, value: num(s.carry), small: 'of ' + rows.length + ' with spend', sub: pct(s.carry_share) + ' of Shopping and Performance Max spend' }),
    fig({ label: 'Clicks and no sale', win: W, source: GADS, value: num(s.no_sale), small: s.no_sale === 1 ? 'product' : 'products', sub: [statusDot('bad', usd(s.no_sale_spend, cur) + ' spent')] }),
    fig({ label: 'Feed health', win: 'Right now', source: 'Merchant Center', value: num(s.feed.approved), small: 'approved', sub: [s.feed.limited ? statusDot('warn', s.feed.limited + ' limited') : null, s.feed.disapproved ? statusDot('bad', s.feed.disapproved + ' disapproved') : null] })]);
  const sold = r => r.sales > 0;
  const chart = card({ class: 'gg-chart' },
    h('div', { class: 'lx-chart-h' },
      h('div', null, h('div', { class: 'lx-sec' }, h('h3', null, 'Where the product spend goes'), ex ? exampleChip() : null), h('p', null, 'Shopping and Performance Max, by product · spend Google Ads, sold or not Triple Whale')),
      legend([{ name: 'Spend, it sold', square: true, color: 'var(--brand)' }, { name: 'Spend, no sale', square: true, color: 'var(--line-strong)' }])),
    barChart({ values: rows.map(r => r.spend), labels: rows.map(r => r.short || r.name), dim: i => !sold(rows[i]), format: v => money(v, { cur, compact: true }), valueLabels: true, height: 300, windowLabel: 'By product, ' + W,
      label: 'Spend by product, ' + rows.map(r => `${r.name} ${usd(r.spend, cur)}`).join(', ') }));
  const tbl = card({ title: 'Each product', note: W + ' · sales and ROAS Triple Whale, last click', flush: true, class: 'gg-prod', action: ex ? exampleChip() : null },
    table({ roomy: true, rows, sort: { key: 'spend', dir: 'desc' }, onRow: r => productSheet(r, d, cur, g), cols: [
      { key: 'name', label: 'Product', render: r => h('span', { class: 'name' }, r.name, h('span', { class: 'sub' }, [ok(r.price) ? usd(r.price, cur) : null, r.feed_why].filter(Boolean).join('. '))) },
      { key: 'feed', label: 'Feed', class: 'hide-sm', render: r => (FEED[r.feed] ? statusDot(FEED[r.feed][0], FEED[r.feed][1]) : '') },
      { key: 'shown', label: def('Times shown', 'impressions'), num: true, class: 'hide-md', sortable: true, render: r => num(r.shown) },
      { key: 'ctr', label: def('Click rate', 'click_rate'), num: true, class: 'hide-md', sortable: true, render: r => pct(r.ctr, { digits: 1 }) },
      { key: 'spend', label: 'Spend', num: true, sortable: true, render: r => usd(r.spend, cur) },
      { key: 'sales', label: 'Sales', num: true, class: 'hide-sm', sortable: true, render: r => usd(r.sales, cur) },
      { key: 'roas', label: def(g.roas ? 'ROAS, goal ' + x(g.roas) : 'ROAS', 'roas'), num: true, class: 'strong', sortable: true, render: r => (sold(r) ? x(r.roas) : h('span', { class: 'neg' }, 'no sale')) },
      { key: 'google_roas', label: def('Google says', 'google_says'), num: true, class: 'gg-says hide-sm', sortable: true, render: r => x(r.google_roas) },
      { key: 'page_rate', label: def('Page buys', 'page_buys'), num: true, class: 'hide-md', sortable: true, render: r => pct(r.page_rate, { digits: 1 }) },
    ] }));
  return [top, chart, tbl].filter(Boolean);
}
/* one product, every figure */
function productSheet(r, d, cur, g) {
  const kv = (l, k, v) => v == null || v === '' ? null : h('div', null, h('span', { class: 'l' }, k ? def(l, k) : l), h('b', null, v));
  sheet({ title: r.name, body: h('div', { class: 'gg-sh' },
    h('p', { class: 'gg-says' }, 'Google Shopping and Performance Max, ' + (d.window ? d.window.label : 'these dates')),
    h('div', { class: 'g' },
      kv('Price', { title: 'Price', body: 'The price in the product feed.' }, ok(r.price) ? usd(r.price, cur) : null),
      kv('Feed', { title: 'Feed status', body: 'What Merchant Center says about the product: approved, limited or disapproved.', source: 'Merchant Center' }, FEED[r.feed] ? FEED[r.feed][1] : null),
      kv('Times shown', 'impressions', ok(r.shown) ? num(r.shown) : null), kv('Click rate', 'click_rate', ok(r.ctr) ? pct(r.ctr, { digits: 1 }) : null),
      kv('Spend', null, usd(r.spend, cur)), kv('Sales, Triple Whale', null, usd(r.sales, cur)), kv('ROAS', 'roas', r.sales > 0 ? x(r.roas) + (g.roas ? ', goal ' + x(g.roas) : '') : 'no sale'),
      kv('Google says', 'google_says', ok(r.google_roas) ? x(r.google_roas) : null), kv('Page buys', 'page_buys', ok(r.page_rate) ? pct(r.page_rate, { digits: 1 }) : null)),
    r.feed_why ? h('p', null, statusDot(FEED[r.feed] ? FEED[r.feed][0] : 'warn', 'Feed: ' + r.feed_why)) : null,
    r.feed && r.feed !== 'approved' ? h('a', { href: 'https://merchants.google.com/', target: '_blank', rel: 'noopener noreferrer' }, 'Open Merchant Center to fix it') : null) });
}

/* the videos module draws both halves; the class on the box shows one of them */
function creativeView(d, ctx, which) {
  const box = h('div', { class: 'gg-sub ' + (which === 'videos' ? 'vd' : 'ti') });
  videos.render(box, d.av, ctx);
  if (which === 'text' && !box.querySelector('.gv-rate,.gv-groups,.gv-heads')) {
    box.classList.remove('ti');
    if (d.av && !d.av.error) put(box, h('div', { class: 'lx-empty' }, h('h3', null, 'No text or image ads spent on these dates'), h('p', null, 'Search ad headlines and Performance Max assets show here once they spend.')));
  }
  return [box];
}

export default {
  title: 'Products and creative',
  eyebrow: 'Google',

  async load(ctx) {
    const win = { from: ctx.range.from, to: ctx.range.to, label: rangeLabel(ctx.range.from, ctx.range.to) };
    if (!ctx.brand) return { window: win, state: 'no_brand' };
    const [av, ex] = await Promise.all([videos.load(ctx), ctx.fixture('google.json').catch(() => null)]);
    return { window: win, currency: ctx.brand.currency || 'USD', goals: { roas: ctx.brand.target_roas || null }, av,
      products: ex ? ex.products : null, example: ex ? { products: true } : {}, example_goals: ex ? ex.goals : null };
  },
  async sample(ctx) {
    const [g, av] = await Promise.all([sampleGoogle(ctx), ctx.fixture('ads-videos.json')]);
    return { ...g, av };
  },

  render(el, d, ctx) {
    styles();
    if (!ctx.brand || !d || d.state === 'no_brand') return put(el, h('div', { class: 'lx-empty' }, h('h3', null, 'Pick one brand'), h('p', null, 'Products and creative are shown for one brand at a time.')));
    let view = ctx.settingNow('google.creativeView', 'products'); if (!VIEWS.some(v => v.id === view)) view = 'products';
    const body = h('div', { class: 'gg-sub' });
    const draw = () => put(body, ...(view === 'products' ? productsView(d) : creativeView(d, ctx, view)));
    const help = [
      { title: 'What it is for', text: 'Which products carry Google Shopping and Performance Max (and which take clicks and never sell), the YouTube videos, and the search headlines and assets. Tap a product for all of its numbers.' },
      { title: 'Where the numbers come from', text: 'Sales and ROAS are Triple Whale. Spend, clicks, times shown and views are Google Ads. Feed status is Merchant Center. Best, Good and Low are Google\'s own asset labels: they compare assets inside one campaign and are not a sales result.' },
    ];
    draw();
    put(el, headRow({ help }),
      h('div', { class: 'gg-views' }, segmented(VIEWS, view, id => { view = id; draw(); ctx.saveSetting('google.creativeView', id).catch(() => {}); })),
      body);
  },
};

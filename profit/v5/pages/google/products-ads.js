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
import { h, em, card, takeaway, segmented, table, barChart, legend, statusDot, money, num, pct, x } from '../../kit.js';
import { styles, sampleGoogle, fig, say, ok, usd, exampleChip, isEx, footNote, rangeLabel } from './_g.js';
import videos from './ads-videos.js';

const VIEWS = [{ id: 'products', label: 'Products' }, { id: 'videos', label: 'Videos' }, { id: 'text', label: 'Text and images' }];
const FEED = { approved: ['good', 'Approved'], limited: ['warn', 'Limited'], disapproved: ['bad', 'Disapproved'] };

function productsView(d) {
  const p = d.products;
  if (!p || !p.rows || !p.rows.length) return [h('div', { class: 'lx-empty' }, h('h3', null, 'No product numbers yet'), h('p', null, 'Products show here once Google’s shopping report is read for this brand.'))];
  const ex = isEx(d, 'products'), cur = ex ? 'USD' : d.currency, g = (ex ? d.example_goals : d.goals) || {}, s = p.summary, rows = p.rows;
  const figs = h('div', { class: 'gg-figs three' },
    fig({ label: 'Products that carry the spend', value: num(s.carry), small: 'of ' + rows.length + ' with spend', sub: pct(s.carry_share) + ' of Shopping and Performance Max spend' }),
    fig({ label: 'Clicks and no sale', value: num(s.no_sale), small: s.no_sale === 1 ? 'product' : 'products', sub: [statusDot('bad', usd(s.no_sale_spend, cur) + ' spent')] }),
    fig({ label: 'Feed health', src: 'Merchant Center', value: num(s.feed.approved), small: 'approved', sub: [s.feed.limited ? statusDot('warn', s.feed.limited + ' limited') : null, s.feed.disapproved ? statusDot('bad', s.feed.disapproved + ' disapproved') : null] }));
  const sold = r => r.sales > 0;
  const chart = card({ class: 'gg-chart' },
    h('div', { class: 'lx-chart-h' },
      h('div', null, h('div', { class: 'lx-sec' }, h('h3', null, 'Where the product spend goes'), ex ? exampleChip() : null), h('p', null, 'Shopping and Performance Max, by product')),
      legend([{ name: 'Spend, it sold', square: true, color: 'var(--ink)' }, { name: 'Spend, no sale', square: true, color: '#D9DDE6' }])),
    barChart({ values: rows.map(r => r.spend), labels: rows.map(r => r.short || r.name), dim: i => !sold(rows[i]), format: v => money(v, { cur, compact: true }), valueLabels: true, height: 300,
      label: 'Spend by product, ' + rows.map(r => `${r.name} ${usd(r.spend, cur)}`).join(', ') }));
  const tbl = card({ title: 'Each product', note: 'Sales and ROAS are Triple Whale', flush: true, class: 'gg-prod', action: ex ? exampleChip() : null },
    table({ roomy: true, rows, sort: { key: 'spend', dir: 'desc' }, cols: [
      { key: 'name', label: 'Product', render: r => h('span', { class: 'name' }, r.name, h('span', { class: 'sub' }, [ok(r.price) ? usd(r.price, cur) : null, r.feed_why].filter(Boolean).join('. '))) },
      { key: 'feed', label: 'Feed', class: 'hide-sm', render: r => (FEED[r.feed] ? statusDot(FEED[r.feed][0], FEED[r.feed][1]) : '') },
      { key: 'shown', label: 'Times shown', num: true, class: 'hide-md', sortable: true, render: r => num(r.shown) },
      { key: 'ctr', label: 'Click rate', num: true, class: 'hide-md', sortable: true, render: r => pct(r.ctr, { digits: 1 }) },
      { key: 'spend', label: 'Spend', num: true, sortable: true, render: r => usd(r.spend, cur) },
      { key: 'sales', label: 'Sales', num: true, class: 'hide-sm', sortable: true, render: r => usd(r.sales, cur) },
      { key: 'roas', label: 'ROAS', num: true, class: 'strong', sortable: true, render: r => (sold(r) ? x(r.roas) : h('span', { class: 'neg' }, 'no sale')) },
      { key: 'google_roas', label: 'Google says', num: true, class: 'gg-says hide-sm', sortable: true, render: r => x(r.google_roas) },
      { key: 'page_rate', label: 'Page buys', num: true, class: 'hide-md', sortable: true, render: r => pct(r.page_rate, { digits: 1 }) },
    ] }),
    h('p', { class: 'gg-quiet', style: { paddingTop: '14px' } }, 'Page buys is the share of visits to the product page that end in an order.' + (g.roas ? ' Goal ' + x(g.roas) + '.' : '')));
  return [figs, p.take ? takeaway(say(p.take)) : null, chart, tbl].filter(Boolean);
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
  title: ['Which products and ads ', em('carry Google?')],
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
    const foot = () => footNote(view === 'products'
      ? `${(isEx(d, 'products') ? 'Example numbers. ' : '') + (d.window ? d.window.label + '. ' : '')}Sales and ROAS from Triple Whale. Spend, clicks and times shown from Google Ads. Feed status from Merchant Center.`
      : 'Spend, views and times shown from Google Ads. Sales from Triple Whale where they exist per video. Google’s ratings compare assets inside one campaign and are not a sales result.');
    const draw = () => put(body, ...(view === 'products' ? productsView(d) : creativeView(d, ctx, view)), foot());
    draw();
    put(el, 
      h('div', { class: 'gg-views' }, segmented(VIEWS, view, id => { view = id; draw(); ctx.saveSetting('google.creativeView', id).catch(() => {}); })),
      body);
  },
};

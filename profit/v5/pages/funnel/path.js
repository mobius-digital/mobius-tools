/* Business > Full funnel > Path to purchase.
   What do people click before they buy, and in what order? Channels as a flow (first click, second,
   third, bought) that takes most of the screen, and the ads as a ranked list of paths.
   Live numbers: none yet. There is no read route for click paths per order, so in real mode the page
   checks the brand has a sales source (GET /api/customers?journey=0 on the profit worker) and then
   draws the sample file under an "Example until its data feed is built" chip. */

import { put } from '../../kit.js';
import { askWhy, helpBar, rangeWords } from '../home/_biz.js';
import { h, num, pct, card, em, takeaway, button, table, empty, segmented, svgNode, addStyles } from '../../kit.js';
import { tileRow, pageStamp, TW } from '../month/_m.js';
import { icon } from '../../icons.js';
import { fxStyles, flow, exampleChip, bar, head, pathDots, channelName, channelDot } from './_flow.js';

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const shortDay = d => MON[+String(d).slice(5, 7) - 1] + ' ' + +String(d).slice(8, 10);

const ok = n => n != null && isFinite(n);
const b = v => h('b', null, v);

const CSS = `
.pp-tools{display:flex;align-items:center;gap:10px;flex-wrap:wrap}
.pp-from{display:flex;align-items:center;gap:8px;font-size:13px;color:var(--muted)}
.pp-ad{display:flex;align-items:center;gap:12px;min-width:0}
.pp-ad .th{flex:none;width:40px;height:40px;border-radius:var(--r-btn,10px);background:var(--bg-sunk);display:grid;place-items:center;color:var(--faint)}
.pp-ad .th svg{width:17px;height:17px}
.pp-ad .tx{min-width:0}
.pp-ad .tx b{display:block;font-weight:600;font-size:14px;color:var(--ink);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.pp-ad .tx span{display:block;font-size:12.5px;color:var(--muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.pp-list{list-style:none;margin:0;padding:0}
.pp-row{display:grid;grid-template-columns:28px minmax(0,1.2fr) minmax(0,1fr) minmax(120px,.9fr) 64px;align-items:center;gap:16px;padding:16px 28px;border-top:1px solid var(--line)}
.pp-row .rk{color:var(--faint);font-size:13px;font-variant-numeric:tabular-nums}
.pp-row .nx{display:flex;align-items:center;gap:10px;min-width:0;color:var(--faint);font-size:12.5px}
.pp-row .nx .gap{white-space:nowrap}
.pp-row .nx .ln{flex:1;height:1px;background:var(--line)}
.pp-row .end{display:grid;gap:5px;font-size:12.5px;color:var(--muted)}
.pp-row .o{text-align:right;font-size:20px;font-weight:600;letter-spacing:-.02em;font-variant-numeric:tabular-nums}
.pp-head{display:grid;grid-template-columns:28px minmax(0,1.2fr) minmax(0,1fr) minmax(120px,.9fr) 64px;gap:16px;padding:10px 28px;border-top:1px solid var(--line);font-size:var(--fs-colhead,11.5px);font-weight:600;color:var(--muted)}
.pp-head span:last-child{text-align:right}
.pp-say{padding:14px 28px 18px;border-top:1px solid var(--line)}
@media (max-width:759px){
  .pp-head{display:none}
  .pp-row{grid-template-columns:minmax(0,1fr) auto;gap:8px 12px;padding:14px 18px}
  .pp-row .rk{display:none}
  .pp-row .nx{grid-column:1/-1;grid-row:2}
  .pp-row .nx:empty,.pp-row .nx.none{display:none}
  .pp-row .end{grid-column:1/-1;grid-row:3}
  .pp-row .o{grid-column:2;grid-row:1}
  .pp-say{padding:12px 18px 16px}
  .pp-tools{width:100%}
}`;

const THUMB = { image: 'library', video: 'review', search: 'google', grid: 'grid', mail: 'email' };
function adCell(a) {
  return h('div', { class: 'pp-ad' },
    h('span', { class: 'th', 'aria-hidden': 'true' }, svgNode(icon(THUMB[a.kind] || 'grid'))),
    h('span', { class: 'tx' }, h('b', null, a.name), h('span', null, channelDot(a.channel, channelName(a.channel) + ', ' + a.where))));
}

function figures(d, ctx) {
  const multi = ok(d.multi_orders) && d.orders > 0 ? d.multi_orders / d.orders : null;
  const top = d.top_first || {}, sp = d.sparks || {};
  const list = [
    { label: 'Orders with 2 or more clicks', value: ok(multi) ? pct(multi) : 'no data', sub: ok(multi) ? `${num(d.multi_orders)} of ${num(d.orders)} orders` : null, spark: sp.multi, sparkFormat: v => Math.round(v) + '%' },
    { label: 'Clicks before buying', value: ok(d.clicks_avg) ? num(d.clicks_avg, 1) : 'no data', sub: ok(multi) ? pct(1 - multi) + ' buy on one click' : null, spark: sp.clicks, sparkFormat: v => num(v, 1) },
    { label: 'Days, first click to order', value: ok(d.days_avg) ? num(d.days_avg, 1) : 'no data', sub: ok(d.same_day) ? pct(d.same_day) + ' buy the same day' : null, spark: sp.days, sparkFormat: v => num(v, 1) + ' days' },
    /* the spark is this channel's share of each day's first clicks */
    { label: 'Most common first click', value: top.channel ? channelName(top.channel) : 'no data', sub: top.orders ? `${num(top.orders)} of ${num(d.orders)} orders start here` : null, spark: top.channel ? sp.first : null, sparkFormat: v => Math.round(v) + '%' },
  ];
  const labels = (sp.dates || []).length ? sp.dates.map(shortDay) : null;
  return tileRow(list, { cols: 4, window: rangeWords(ctx, d.range), source: TW + ' click paths', labels });
}

function readLine(d, ctx) {
  const f = d.flow, top = d.top_first;
  if (!f || !top) return null;
  const alone = (f.links || []).find(l => l.from === '1:' + top.channel && l.to === 'b');
  const nextOf = (f.links || []).filter(l => l.from === '1:' + top.channel && l.to !== 'b' && l.to !== '2:' + top.channel).sort((a, b) => b.value - a.value)[0];
  const nextName = nextOf ? channelName(nextOf.to.split(':')[1]) : null;
  /* the tiles carry the first click count: the sentence adds how often it closes alone and what follows it */
  if (!alone && !nextName) return null;
  return takeaway([channelName(top.channel), alone ? [' closes ', b(num(alone.value)), ' orders on its own'] : ' starts most paths', '.',
    nextName ? [' When another click follows, it is most often ', b(nextName), '.'] : ''],
  { action: ctx.isClient ? null : askWhy(ctx, 'What do people click before they buy') });
}

/* ---------- channels: the flow, then the top paths ---------- */
function channelsView(d, ex) {
  const f = d.flow || {};
  const cols = (f.columns || []).map((c, i, all) => ({ ...c, short: ['1st', '2nd', '3rd'][i] && i < all.length - 1 ? ['1st', '2nd', '3rd'][i] : c.title, align: i > 0 && i < all.length - 1 ? 'bottom' : null }));
  const flowEl = flow({ columns: cols, links: f.links || [], lead: f.lead, unit: 'orders', total: d.orders,
    height: 660, phoneHeight: 620, label: `Which channels people click, in order, before ${num(d.orders)} orders`, empty: 'No click paths for these dates' });
  return [
    h('div', { style: { marginTop: '8px' } }, flowEl),
    h('div', { class: 'fx-under' }, f.lead ? h('span', { class: 'fx-key' }, h('i'), 'orange: the most common two click path') : null, ok(f.more_clicks) ? h('span', null, `${num(f.more_clicks)} orders took four or more clicks; they are counted to the third.`) : null, h('span', { class: 'sp' }), h('span', null, 'Clicks only, ad views are not counted')),
  ];
}

function pathsCard(d, ctx) {
  const rows = (d.paths || []).filter(r => r.orders > 0).sort((a, b) => b.orders - a.orders);
  if (!rows.length) return null;
  const max = rows[0].orders;
  return card({ flush: true },
    head('Top paths', 'Most orders first · ' + rangeWords(ctx, d.range) + ' · ' + TW + ' click paths'),
    table({ sort: { key: 'orders', dir: 'desc' },
      roomy: true,
      cols: [
        { key: 'path', label: 'Path', class: 'name', render: r => pathDots(r.path, { end: 'bought' }) },
        { key: 'orders', label: 'Orders', num: true, width: 84, sortable: true, render: r => num(r.orders) },
        { key: 'share', label: 'Share', num: true, width: 80, class: 'hide-sm', value: r => r.orders, render: r => pct(r.orders / d.orders, { digits: 1 }) },
        { key: 'bar', label: '', class: 'fx-barcell hide-sm', render: r => bar(r.orders / max, r.path.length > 1) },
      ],
      rows,
    }));
}

/* ---------- ads: a ranked list of paths ---------- */
function adsView(d, ctx, from) {
  const all = (d.ads || []).filter(r => r.orders > 0);
  const rows = (from === 'all' ? all : all.filter(r => r.first.channel === from || (r.next && r.next.channel === from))).sort((a, b) => b.orders - a.orders);
  const max = all.length ? Math.max(...all.map(r => r.orders)) : 1;
  const sum = rows.reduce((a, r) => a + r.orders, 0);
  const list = h('ol', { class: 'pp-list' }, rows.map((r, i) => h('li', { class: 'pp-row' },
    h('span', { class: 'rk' }, String(i + 1)),
    adCell(r.first),
    r.next ? h('div', { class: 'nx' }, h('span', { class: 'gap' }, ok(r.gap_days) ? num(r.gap_days, 1) + ' days, then' : 'then'), adCell(r.next)) : h('div', { class: 'nx none' }, h('span', { class: 'ln' })),
    h('div', { class: 'end' }, bar(r.orders / max, false), r.note ? h('span', null, r.note) : null),
    h('span', { class: 'o' }, num(r.orders)))));
  const lead = rows.filter(r => !r.next).slice(0, 2);
  return [
    h('div', { class: 'fx-big', style: { padding: '0 28px' } }, h('span', { class: 'fx-bigtxt' }, num(sum) + ' orders'), h('span', null, `took one of these ${rows.length} paths, out of ${num(d.orders)}. Most orders first.`)),
    rows.length ? h('div', { class: 'pp-head', 'aria-hidden': 'true' }, h('span', null, '#'), h('span', null, 'First click'), h('span', null, 'Next click, if any'), h('span', null, 'Bought'), h('span', null, 'Orders')) : null,
    rows.length ? list : h('p', { class: 'fx-under', style: { padding: '12px 28px' } }, 'No ad paths from this channel for these dates.'),
    lead.length ? h('div', { class: 'pp-say' }, takeaway(['Most buyers click one ad and buy. ', ...lead.map((r, i) => [i ? ' and ' : '', b(r.first.name), ' on ', channelName(r.first.channel)]), lead.length > 1 ? ' each close ' : ' closes ', b(lead.map(r => num(r.orders)).join(' and ')), ' alone.'],
      { action: ctx.isClient ? null : askWhy(ctx, 'Which ads did they click before buying') })) : null,
  ];
}

function clicksCard(d, ctx) {
  const rows = (d.clicks || []).filter(r => ok(r.orders));
  if (!rows.length) return null;
  const all = rows.reduce((a, r) => a + r.orders, 0) || 1;
  return card({ flush: true },
    head('How many clicks before they buy?', `${num(d.orders)} orders`),
    h('div', { class: 'fx-src' }, rangeWords(ctx, d.range) + ' · ' + TW + ' click paths'),
    table({
      cols: [
        { key: 'name', label: 'Clicks', class: 'name', width: 130 },
        { key: 'bar', label: 'Share of orders', class: 'fx-barcell', render: (r, i) => bar(r.orders / all, i > 0) },
        { key: 'share', label: 'Share', num: true, width: 70, class: 'hide-sm', render: r => pct(r.orders / all) },
        { key: 'orders', label: 'Orders', num: true, width: 80, render: r => num(r.orders) },
      ],
      rows,
    }));
}

export default {
  title: ['What do people click ', em('before they buy?')],
  eyebrow: 'Full funnel',
  stamp: false,                     /* Home's stamp with a refresh button sits in the help bar */

  async load(ctx) {
    if (!ctx.brand) return { connected: false };
    /* Only the sales source is real here: no route reads click paths yet. */
    const r = await ctx.api(`/api/customers?act=${encodeURIComponent(ctx.brand.id)}&journey=0&from=${ctx.range.from}&to=${ctx.range.to}`, { signal: ctx.signal }).catch(() => null);
    const has = r && ((r.account && r.account.tw_shop) || (r.headline && r.headline.orders > 0));
    if (!has) return { connected: false };
    const sample = await ctx.fixture('path.json');
    return { ...sample, example: ['all'] };
  },

  render(el, d, ctx) {
    fxStyles(); addStyles('pp-style', CSS);
    d = d || {};
    const team = !ctx.isClient;
    if (!d.connected) {
      put(el, empty({
        title: 'No sales source connected',
        text: team ? 'Paths to purchase need the store’s orders. Connect Triple Whale or Shopify in Brand settings and they will show here.' : 'Paths to purchase will show here once the store is connected.',
        action: team && ctx.brand ? button('Open integrations', { href: ctx.href('brand-settings', 'integrations') }) : null,
      }));
      return;
    }
    const ex = (d.example || []).includes('all');
    /* ?view=ads opens the ads list from a link (and for screenshots) */
    let view = new URLSearchParams(location.search).get('view') || ctx.settingNow('funnel.pathView', 'channels');
    let from = 'all';
    const body = h('div');
    const tools = h('div', { class: 'pp-tools' });
    const fromSeg = () => h('div', { class: 'pp-from' }, h('span', null, 'Paths from'),
      segmented([{ id: 'all', label: 'All' }, { id: 'meta', label: 'Meta' }, { id: 'google', label: 'Google' }, { id: 'email', label: 'Email' }], from, id => { from = id; paint(); }));
    const flowCard = card({ class: 'fx-pad pp-card' });
    const paths = pathsCard(d, ctx), clicks = clicksCard(d, ctx);
    const paint = () => {
      const isAds = view === 'ads';
      flowCard.classList.toggle('flush', isAds);
      flowCard.classList.toggle('fx-pad', !isAds);
      put(tools, ...[isAds ? fromSeg() : null, segmented([{ id: 'channels', label: 'Channels' }, { id: 'ads', label: 'Ads' }], view, id => { view = id; ctx.saveSetting('funnel.pathView', id); paint(); })].filter(Boolean));
      put(flowCard, 
        head(isAds ? 'Which ads did they click before buying?' : 'Which channels do they click, in what order?',
          isAds ? 'every channel, first click and the next one' : `${num(d.orders)} orders. Hover or tap a band to follow it.`, ex ? exampleChip() : null, tools),
        h('div', { class: 'fx-src' }, rangeWords(ctx, d.range) + ' · ' + TW + ' click paths'),
        ...(isAds ? adsView(d, ctx, from) : channelsView(d, ex)));
      if (paths) paths.style.display = isAds ? 'none' : '';
      if (clicks) clicks.style.display = isAds ? '' : 'none';
    };
    paint();
    ctx.askWindow = rangeWords(ctx, d.range);
    ctx.askContext = `${ctx.brand.name} path to purchase, ${ctx.askWindow}${ex ? ' (example numbers until the click path feed is built)' : ''}: ${num(d.orders)} orders, ${num(d.multi_orders)} took two or more clicks, ${num(d.clicks_avg, 1)} clicks on average.`;
    put(el, ...[
      helpBar([
        { title: 'What it is for', text: 'What people click before they buy: the channels in order, the ads, and how many clicks it takes.' },
        { title: 'Where the numbers come from', text: 'Triple Whale click paths, clicks only (ad views are not counted). Each order counts once; a path names up to three clicks before the order. Hover or tap a band for its count and share.' },
      ], h('span', { class: 'bz-chip' }, rangeWords(ctx, d.range)), ex ? exampleChip() : null, pageStamp(ctx)),
      figures(d, ctx),
      readLine(d, ctx),
      flowCard,
      paths,
      clicks,
    ].filter(Boolean));
  },

  skeleton(el) {
    el.innerHTML = '<div class="lx-skel-grid"><div class="lx-skel kpi"></div><div class="lx-skel kpi"></div><div class="lx-skel kpi"></div><div class="lx-skel kpi"></div></div><div class="lx-skel chart"></div><div class="lx-skel chart"></div>';
  },
};

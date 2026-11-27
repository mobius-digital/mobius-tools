/* Ads > Google > Ads and videos. YouTube videos live here because they are bought in Google.
   Real mode reads Google Ads directly: account-health GET /api/google/ads-ads (top 20 ads by spend and the
   Performance Max asset groups). That route carries spend, times shown, clicks and Google's own conversions.
   It does not carry views, how far people watch, a rating per asset, or Triple Whale sales per video, so those
   parts show only when the data has them and say so plainly when it does not. */

import { put } from '../../kit.js';
import { h, em, card, kpi, kpis, tiles, takeaway, button, table, statusDot, empty, sheet, money, num, pct, x } from '../../kit.js';
import { styles, thumb, quartiles, shareBar, assetRow, cellBar, strip } from './_gv.js';
import { askWhy } from '../home/_biz.js';

const label = r => { const f = s => new Date(s + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }); return f(r.from) + ' to ' + f(r.to); };
const isVideo = a => /video/.test(a.type || '') || /^(video|demand_gen)$/.test(a.campaign_type || '');
const words = s => String(s || '').replace(/_/g, ' ').replace(/^\w/, c => c.toUpperCase());

/** Turn the ads-ads answer into the page's shape. Only what Google sent; nothing is filled in. */
function shape(raw, range, brand) {
  if (!raw || raw.error) return { range, error: (raw && raw.error) || 'No answer from Google Ads', fix: raw && raw.fix };
  const ads = raw.ads || [], groups = raw.asset_groups || [];
  const total = [...ads, ...groups].reduce((s, a) => s + (a.spend || 0), 0);
  const vids = ads.filter(isVideo);
  const vs = vids.reduce((s, a) => s + a.spend, 0), vv = vids.reduce((s, a) => s + a.value, 0), vi = vids.reduce((s, a) => s + a.impressions, 0);
  return {
    range, source: 'google',
    totals: vids.length ? { spend: vs, share: total ? vs / total : null, impressions: vi, google_roas: vs ? vv / vs : null, google_value: vv, goal_roas: brand && brand.target_roas || null } : null,
    videos: vids.map(a => ({ name: a.name || (a.headlines[0] && a.headlines[0].text) || 'Video ad', where: [words(a.campaign_type), a.campaign].filter(Boolean).join(', '), placement: a.ad_group || '',
      spend: a.spend, impressions: a.impressions, clicks: a.clicks, google_roas: a.spend ? a.value / a.spend : null })),
    groups: groups.map(g => ({ name: g.name, campaign: g.campaign, strength: g.strength, spend: g.spend, impressions: g.impressions, clicks: g.clicks, conversions: g.conversions })),
    groups_error: raw.asset_groups_error || null,
    headlines: ads.filter(a => !isVideo(a) && a.headlines && a.headlines.length).map(a => {
      const pin = a.headlines.find(t => t.pinned);
      return { text: (pin || a.headlines[0]).text, more: a.headlines.length - 1, where: [a.campaign, pin ? 'pinned first' : ''].filter(Boolean).join(', '), shown: a.impressions, ctr: a.impressions ? a.clicks / a.impressions : null, orders: a.conversions };
    }).sort((a, b) => (b.ctr || 0) - (a.ctr || 0)),
  };
}

const TONE = { best: 'good', good: 'info', low: 'bad', excellent: 'good', average: 'info', poor: 'bad' };
const rate = r => r ? statusDot(TONE[String(r).toLowerCase()] || 'off', words(r)) : statusDot('off', 'Not rated');

function videoSheet(v, W) {
  const kv = (l, val) => val == null ? null : h('div', null, h('span', { class: 'l' }, l), h('b', null, val));
  sheet({ title: v.name, body: h('div', { class: 'gg-sh' },
    h('p', { class: 'gg-says' }, [v.where, v.placement, W].filter(Boolean).join(' · ')),
    h('div', { class: 'g' },
      kv('Spend', v.spend != null ? money(v.spend) : null), kv('Times shown', v.impressions != null ? num(v.impressions) : null),
      kv('Click rate', v.impressions ? pct(v.clicks / v.impressions, { digits: 2 }) : null), kv('Views', v.views != null ? num(v.views) : null),
      kv('View rate', v.view_rate != null ? pct(v.view_rate, { digits: 1 }) : null), kv('Cost per view', v.cpv != null ? money(v.cpv, { cents: true }) : null),
      kv('ROAS, Triple Whale', v.roas != null ? x(v.roas) : null), kv('Sales, Triple Whale', v.sales != null ? money(v.sales) : null),
      kv("ROAS, Google's own count", v.google_roas != null ? x(v.google_roas) : null)),
    v.quartiles ? quartiles(v.quartiles) : null,
    h('p', { class: 'gg-says' }, 'Videos start journeys more than they finish them, so their last click sales read low.')) });
}
function videoCard(v, W) {
  const hasTw = v.roas != null;
  return h('article', { class: 'gv-vid lx-hover', role: 'button', tabindex: '0', title: 'Open ' + v.name, onclick: () => videoSheet(v, W), onkeydown: e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); videoSheet(v, W); } } },
    thumb({ src: v.thumb, dur: v.dur, tag: v.made_by_google ? 'Made by Google' : null, look: v.look }),
    h('div', null, h('h4', null, v.name), h('div', { class: 'sub' }, v.where, v.placement && h('br'), v.placement)),
    h('div', null,
      h('span', { class: 'gv-l' }, 'ROAS'),
      h('div', { class: 'gv-roas' },
        h('span', { class: 'big' + (hasTw ? '' : ' na') }, hasTw ? x(v.roas) : 'n/a'),
        h('span', { class: 'r' }, h('b', null, v.sales != null ? money(v.sales) : 'n/a'), 'sales, Triple Whale')),
      h('div', { class: 'gv-says' }, v.google_roas != null ? "Google's own count " + x(v.google_roas) : v.says || 'Google does not split it out')),
    v.views != null
      ? h('div', { class: 'gv-three' },
        h('span', null, 'Views', h('b', null, num(v.views))),
        h('span', null, 'View rate', h('b', null, pct(v.view_rate, { digits: 1 }))),
        h('span', null, 'Cost per view', h('b', null, money(v.cpv, { cents: true }))))
      : h('div', { class: 'gv-three' },
        h('span', null, 'Spend', h('b', null, money(v.spend))),
        h('span', null, 'Times shown', h('b', null, num(v.impressions))),
        h('span', null, 'Click rate', h('b', null, v.impressions ? pct(v.clicks / v.impressions, { digits: 2 }) : 'no data'))),
    quartiles(v.quartiles));
}

function heroBand(t, videos, W) {
  const list = [];
  list.push({ label: 'Spend on videos', value: money(t.spend), size: 'lg', sub: t.share != null ? pct(t.share) + ' of Google spend' : null });
  if (t.views != null) {
    list.push({ label: 'Views', value: num(t.views), size: 'lg', sub: t.view_rate != null ? 'view rate ' + pct(t.view_rate, { digits: 1 }) : null });
    list.push({ label: 'Cost per view', value: money(t.cpv, { cents: true }), size: 'lg', sub: t.impressions != null ? 'from ' + num(t.impressions) + ' times shown' : null });
  } else {
    list.push({ label: 'Times shown', value: num(t.impressions), size: 'lg', sub: videos.length + (videos.length === 1 ? ' video ad' : ' video ads') });
  }
  if (t.roas != null) {
    /* videos open journeys, so a last click ROAS is shown for reference and never graded against the goal */
    list.push({ label: 'Last click ROAS, videos', value: h('span', { class: 'lx-hero-num' }, x(t.roas)), size: 'lg',
      sub: [t.back != null ? money(t.back) + ' back' : null, 'videos are not judged on last click'].filter(Boolean).join(', ') });
  } else {
    list.push({ label: 'ROAS, videos', value: 'n/a', size: 'lg', sub: t.google_roas != null ? 'No sales source per video. Google says ' + x(t.google_roas) : 'No sales source connected' });
  }
  const SRC = { 'Spend on videos': 'Google Ads', Views: 'Google Ads', 'Cost per view': 'Google Ads', 'Times shown': 'Google Ads' };
  return h('section', { class: 'gg-ret' },
    h('div', { class: 'lx-sec', style: { flexWrap: 'wrap', rowGap: '2px' } }, h('h2', null, 'YouTube videos'), h('span', { class: 'note' }, [W, t.note || videos.length + (videos.length === 1 ? ' video' : ' videos')].filter(Boolean).join(' · '))),
    tiles(list.map(k => kpi({ ...k, size: null, value: typeof k.value === 'object' && k.value && k.value.textContent ? k.value.textContent : k.value, window: W, source: SRC[k.label] || (t.roas != null ? 'Triple Whale' : "Google's own count") })), { cols: list.length === 3 ? 3 : 4 }));
}

function ratingCard(a, ctx) {
  const parts = [{ n: a.best || 0, tone: 'good' }, { n: a.good || 0, tone: 'mid' }, { n: a.low || 0, tone: 'bad' }];
  const col = (title, kind, rows) => rows && rows.length ? h('div', null, h('span', { class: 'gv-l' }, title + ', ' + (a.counts && a.counts[kind] != null ? a.counts[kind] : rows.length)),
    rows.map(r => assetRow({ kind, name: r.name, stat: r.stat, right: rate(r.rating) }))) : null;
  return card({ title: "Google's rating, when Google provides it", note: a.count + ' Performance Max assets', class: 'gv-rate',
    action: a.low ? button('Replace the ' + a.low + ' Low', { icon: 'arrow', href: ctx.href('production', 'board') }) : null },
    shareBar(parts),
    h('div', { class: 'lx-row', style: { gap: '18px' } }, statusDot('good', (a.best || 0) + ' Best'), statusDot('info', (a.good || 0) + ' Good'), statusDot('bad', (a.low || 0) + ' Low')),
    h('div', { class: 'gv-cols' }, col('Images', 'image', a.images), col('Headlines', 'headline', a.headlines), col('Videos', 'video', a.videos)),
    null);
}

/* one asset group or one headline, every figure Google gives */
function rowSheet(title, lines, W) {
  sheet({ title, side: 'center', body: h('div', { class: 'gg-sh' },
    h('p', { class: 'gg-says' }, [W, 'Google Ads'].filter(Boolean).join(' · ')),
    h('div', { class: 'g' }, lines.filter(l => l[1] != null && l[1] !== '').map(([l, v]) => h('div', null, h('span', { class: 'l' }, l), h('b', null, v))))) });
}
function groupsCard(d) {
  if (!d.groups || !d.groups.length) return null;
  return card({ title: "Google's rating, when Google provides it", note: [d.range && d.range.label, 'Performance Max asset groups, ad strength', 'Google Ads'].filter(Boolean).join(' · '), flush: true, class: 'gv-groups' },
    table({ roomy: true, rows: d.groups, cols: [
      { key: 'name', label: 'Asset group', render: r => h('span', { class: 'name' }, r.name, h('span', { class: 'sub' }, r.campaign)) },
      { key: 'strength', label: 'Google says', render: r => rate(r.strength) },
      { key: 'spend', label: 'Spend', num: true, sortable: true, render: r => money(r.spend) },
      { key: 'impressions', label: 'Times shown', num: true, class: 'hide-sm', render: r => num(r.impressions) },
      { key: 'ctr', label: 'Click rate', num: true, value: r => r.impressions ? r.clicks / r.impressions : null, render: r => r.impressions ? pct(r.clicks / r.impressions, { digits: 2 }) : 'no data' },
    ], sort: { key: 'spend', dir: 'desc' }, onRow: r => rowSheet(r.name, [['Campaign', r.campaign], ['Ad strength, Google says', r.strength ? words(r.strength) : 'Not rated'], ['Spend', money(r.spend)],
      ['Times shown', num(r.impressions)], ['Click rate', r.impressions ? pct(r.clicks / r.impressions, { digits: 2 }) : 'no data'], ["Orders, Google's own count", r.conversions != null ? num(r.conversions, 1) : null]], d.range && d.range.label) }),
    null);
}

function headlinesCard(rows, W) {
  if (!rows || !rows.length) return null;
  const top = Math.max(...rows.map(r => r.ctr || 0), 0.0001);
  return card({ title: 'Search ad headlines', note: [W, 'ranked by click rate', 'Google Ads'].filter(Boolean).join(' · '), flush: true, class: 'gv-heads' },
    table({ roomy: true, rows, sort: { key: 'ctr', dir: 'desc' }, onRow: r => rowSheet(r.text, [['Where it runs', r.where], ['Other headlines in this ad', r.more > 0 ? String(r.more) : null], ['Times shown', num(r.shown)],
      ['Click rate', r.ctr != null ? pct(r.ctr, { digits: 2 }) : 'no data'], ["Orders, Google's own count", num(r.orders, 1)]], W), cols: [
      { key: 'rank', label: '', width: 44, class: 'dim', render: (r, i) => String(i + 1) },
      { key: 'text', label: 'Headline', render: r => h('span', { class: 'name' }, r.text, r.more > 0 && h('span', { class: 'sub' }, 'and ' + r.more + ' more in this ad')) },
      { key: 'where', label: 'Where it runs', class: 'dim hide-sm', render: r => r.where },
      { key: 'shown', label: 'Times shown', num: true, class: 'hide-sm', sortable: true, render: r => num(r.shown) },
      { key: 'ctr', label: 'Click rate', num: true, sortable: true, class: 'strong', render: r => r.ctr != null ? pct(r.ctr, { digits: 2 }) : 'no data' },
      { key: 'bar', label: '', class: 'hide-sm', render: r => cellBar((r.ctr || 0) / top) },
      { key: 'orders', label: 'Orders, Google says', num: true, sortable: true, render: r => h('span', { class: r.orders ? '' : 'dim' }, num(r.orders, 1)) },
    ] }));
}

export default {
  /* the plain question, drawn by the shell above the tabs */
  title: 'Ads and videos',
  eyebrow: 'Google',

  async load(ctx) {
    const range = { from: ctx.range.from, to: ctx.range.to };      // the dates in the page head
    range.label = label(range);
    const raw = await ctx.api(`/api/google/ads-ads?act=${encodeURIComponent(ctx.brand.id)}&from=${range.from}&to=${range.to}`, { worker: 'ah', signal: ctx.signal })
      .catch(e => { if (e && e.name === 'AbortError') throw e; return { error: e.message || 'Google Ads did not answer' }; });
    return shape(raw, range, ctx.brand);
  },

  render(el, d, ctx) {
    styles();
    if (!ctx.brand) return put(el, empty({ title: 'Pick one brand', text: 'Ads and videos are shown for one brand at a time.' }));
    if (!d || d.error) {
      const none = !d || /not.?linked|no google ads|not connected|customer/i.test(d.error || '');
      return put(el, empty({
        title: none ? 'Google Ads is not connected yet' : 'Google Ads did not answer',
        text: (d && d.fix) || (none ? 'Add the brand’s Google Ads account in Brand settings to see each ad and video here.' : (d && d.error) || ''),
        action: !ctx.isClient ? button('Open integrations', { href: ctx.href('brand-settings', 'integrations'), icon: 'arrow' }) : null }));
    }
    const vids = d.videos || [], out = [];
    out.push(h('span', { class: 'gv-note' }, 'YouTube ads are bought in Google, so they live here'));

    const W = d.range ? d.range.label : '';
    if (d.totals && vids.length) out.push(heroBand(d.totals, vids, W));
    else out.push(strip({ ic: 'youtube', title: 'No YouTube videos spent in these dates', text: 'When a Video, Demand Gen or Performance Max video spends, it shows here with its views and sales.' }));

    if (d.take) out.push(takeaway(d.take.map(p => typeof p === 'string' ? p : h('b', null, p.b)), { action: !ctx.isClient ? askWhy(ctx, 'How are the Google ads and videos doing, and why?') : null }));

    if (vids.length) out.push(h('section', { style: { display: 'grid', gap: '16px' } },
      h('div', { class: 'lx-sec' }, h('h3', null, 'Each video'), h('span', { class: 'note' }, [W, 'sorted by spend, tap one for all of its numbers'].filter(Boolean).join(' · ')),
        h('div', { class: 'act' }, h('a', { href: ctx.href('meta', 'top-ads') }, 'Compare with Meta videos'))),
      h('div', { class: 'gv-grid' }, [...vids].sort((a, b) => (b.spend || 0) - (a.spend || 0)).map(v => videoCard(v, W))),
      null));

    if (d.assets) out.push(ratingCard(d.assets, ctx));
    else { const g = groupsCard(d); if (g) out.push(g); }

    const hc = headlinesCard(d.headlines, W); if (hc) out.push(hc);
    if (!vids.length && !d.assets && !(d.groups || []).length && !(d.headlines || []).length) out.push(empty({ title: 'No Google ads spent in these dates', text: 'Nothing with spend came back from Google Ads for ' + (d.range ? d.range.label : 'this window') + '.' }));

    put(el, ...out);
  },
};

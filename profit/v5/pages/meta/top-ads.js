/* Ads > Meta > Top ads for one brand: which ads are selling and which are not, on the dates in the page head.
   Three figures, then the ads as cards or as a table, sorted by any number (high or low). Every ad opens its detail
   sheet with all of its numbers (meta/_rest.js adSheet).

   Real mode reads:
     GET /api/hub/creative?act=&from=&to=&model=lastPlatformClick   profit: every ad with spend, Triple Whale sales, the brand's goals
     GET /api/ad-creatives?act=&ads=                                account-health: the pictures for the ads shown first */

import { put } from '../../kit.js';
import { h, em, card, kpi, takeaway, button, segmented, gauge, table, empty, skeleton, money, num, pct } from '../../kit.js';
import { ok, usd, sum, soft, judge, adTile, gate, oldLink, styles, statusDot, x, adSheet, opener } from './_rest.js';
import { def, headRow } from '../platforms/_ads.js';
import { askWhy } from '../home/_biz.js';

const CSS = `
.mt-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(176px,1fr));gap:14px}
.mt-ad{display:flex;flex-direction:column;min-width:0;border-radius:var(--r-lg);background:var(--surface);box-shadow:var(--sh-1);overflow:hidden}
.mt-ad:hover{box-shadow:var(--sh-2,0 6px 20px rgba(28,20,10,.10))}
.mt-ad .mr-tile{width:100%;height:auto;aspect-ratio:1/1;max-height:180px;border-radius:0}
.mt-ad .mr-tile svg{width:28px;height:28px}
.mt-b{display:grid;grid-template-columns:minmax(0,1fr);gap:10px;padding:12px 14px 14px;min-width:0}
.mt-b h4{margin:0;font-size:13.5px;font-weight:600;letter-spacing:-.01em;line-height:1.3;overflow-wrap:anywhere}
.mt-b .w{margin-top:4px;display:grid;gap:2px;font-size:12px;color:var(--muted);min-width:0;overflow-wrap:anywhere}
.mt-ro{display:flex;align-items:baseline;justify-content:space-between;gap:8px}
.mt-ro b{font-size:var(--num-m);font-weight:600;letter-spacing:-.03em;font-variant-numeric:tabular-nums}
.mt-ro b.bad{color:var(--bad)}.mt-ro b.na{font-size:13px;font-weight:500;letter-spacing:0;color:var(--muted)}
.mt-three{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:6px;padding-top:10px;border-top:1px solid var(--line);font-size:11.5px;color:var(--muted)}
.mt-three>div:last-child{text-align:right}.mt-three>div:nth-child(2){text-align:center}
.mt-three b{display:block;margin-top:2px;font-size:13.5px;font-weight:600;color:var(--ink);font-variant-numeric:tabular-nums}
.mt-ad.early .mt-b{opacity:.62}
.mt-h{display:flex;align-items:center;gap:10px 14px;flex-wrap:wrap}
.mt-h h3{margin:0;font-size:15px;font-weight:600;flex:1;min-width:200px}
.mt-h label{display:inline-flex;align-items:center;gap:8px;color:var(--muted);font-size:13px}
.mt-h select{height:34px;padding:0 10px;border:0;border-radius:10px;background:var(--bg-sunk);color:var(--ink);font:inherit;font-size:13px}
.mt-dir{min-width:40px}
.mt-kp .lx-kpi{cursor:default}
@media (max-width:759px){
  .mt-grid{grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}
  .mt-b{padding:10px 10px 12px}
}`;

/* ---------- load: real mode ---------- */
async function load(ctx) {
  const act = encodeURIComponent(ctx.brand.id), w = { from: ctx.range.from, to: ctx.range.to, label: ctx.range.label };
  let r;
  try { r = await ctx.api(`/api/hub/creative?act=${act}&from=${w.from}&to=${w.to}&model=lastPlatformClick`, { worker: 'profit', signal: ctx.signal }); }
  catch (e) { if (e && (e.name === 'AbortError' || e.status === 401)) throw e; if (/meta|connect/i.test(e.message || '')) return { connected: false, error: e.message }; throw e; }
  const g = r.goals || {};
  const ads = (r.ads || []).map(a => ({ id: a.id, name: a.name, video: a.media_type === 'video', lead: a.obj === 'leads', campaign: a.campaign || null, adset: a.adset && a.adset.name || null,
    set: a.adset ? { name: a.adset.name, spend: a.adset.spend, purchases: a.adset.purchases, roas: a.adset.roas, cpa: a.adset.cpa } : null,
    spend: a.spend, revenue: a.revenue, purchases: a.purchases, roas: a.roas, cpa: a.cpa, leads: a.leads || null, cpl: a.cpl ?? null, age: a.age ?? null, first_spend: a.first_spend || null,
    ctr: a.ctr ?? null, cpm: a.cpm ?? null, frequency: a.frequency ?? null, impressions: a.impressions ?? null, clicks: a.clicks ?? null, fc_rev: a.fc_rev ?? null, nc_roas: a.nc_roas ?? null, thumb: null }));
  const first = [...new Set([...ads].sort((p, q) => (q.roas || 0) - (p.roas || 0)).slice(0, 16).concat(ads.slice(0, 16)).map(a => a.id))].filter(id => /^\d{5,25}$/.test(id)).slice(0, 28);
  if (first.length) {
    const pics = await soft(ctx.api(`/api/ad-creatives?act=${act}&ads=${first.join(',')}`, { worker: 'ah', signal: ctx.signal }));
    const as = (pics && pics.assets) || {};
    for (const a of ads) { const p = as[a.id]; if (p) a.thumb = p.thumb || p.image || p.cover || null; }
  }
  return { window: w, currency: r.currency || 'USD', connected: true, goals: { roas: g.roas || null, cpa: g.cpa || null },
    sales_source: ads.some(a => !a.lead && (a.purchases > 0 || a.revenue > 0)),
    by_type: (r.by_type || []).map(t => ({ key: t.key, ads: t.ads, spend: t.spend, purchases: t.purchases, cpa: t.cpa, roas: t.roas })), ads };
}

const open = (a, d, ctx) => adSheet(a, d, ctx, { period: d.window && d.window.label, set: a.set });

/* ---------- the parts ---------- */
function figures(d, ctx) {
  const cur = d.currency, g = d.goals || {}, ads = d.ads || [], sales = ads.filter(a => !a.lead), wl = d.window && d.window.label;
  const judged = sales.map(a => ({ a, v: judge(a, g) }));
  const winners = judged.filter(j => j.v && j.v[0] === 'good' && j.a.purchases >= 3);
  const best = sales.filter(a => a.purchases >= 3 && ok(a.cpa)).sort((p, q) => p.cpa - q.cpa)[0];
  const none = h('small', null, 'No sales source connected');
  const bestTile = kpi({ size: 'lg', label: def('Best cost per sale', 'cpa'), value: !d.sales_source ? none : best ? usd(best.cpa, cur) : h('small', null, 'No ad has 3 sales yet'),
    sub: d.sales_source && best ? 'Ad: ' + best.name + (g.cpa ? '. Goal ' + usd(g.cpa, cur) : '') : '' });
  if (best) opener(bestTile, () => open(best, d, ctx), 'Open ' + best.name);
  return h('div', { class: 'mr-kp mt-kp' },
    kpi({ size: 'lg', label: h('span', null, 'Meta ads with spend', wl ? ', ' + wl : ''), value: num(ads.length), sub: usd(sum(ads, 'spend'), cur) + ' spent' }),
    kpi({ size: 'lg', label: def('Winners', 'winners'), value: d.sales_source ? num(winners.length) : none,
      sub: d.sales_source ? (g.roas ? `${x(g.roas)} ROAS or better, 3 or more sales` : g.cpa ? `${usd(g.cpa, cur)} a sale or less, 3 or more sales` : 'No goal set for this brand') : '' }),
    bestTile);
}
function sentence(d, ctx) {
  if (!d.sales_source) return null;
  const t = Object.fromEntries((d.by_type || []).map(r => [r.key, r])), v = t.video, i = t.image, cur = d.currency;
  if (!v || !i || !ok(v.cpa) || !ok(i.cpa)) return null;
  const b = s => h('b', null, s), cheaper = v.cpa <= i.cpa ? 'video' : 'image';
  const say = Math.abs(v.cpa - i.cpa) / Math.max(v.cpa, i.cpa) < 0.08
    ? ['A video sale and an image sale cost about the same: ', b(usd(v.cpa, cur)), ' against ', b(usd(i.cpa, cur)), '.']
    : [cheaper === 'video' ? 'A video sale costs ' : 'An image sale costs ', b(usd(cheaper === 'video' ? v.cpa : i.cpa, cur)), ' against ', b(usd(cheaper === 'video' ? i.cpa : v.cpa, cur)), cheaper === 'video' ? ' for an image.' : ' for a video.'];
  return takeaway(say, { action: ctx.isClient ? null : askWhy(ctx, 'Why are these the top ads right now?') });
}
function adCard(a, d, ctx) {
  const cur = d.currency, g = d.goals || {}, v = d.sales_source ? judge(a, g) : null, early = v && v[0] === 'off';
  let big, bar = null;
  if (a.lead) big = ok(a.cpl) ? h('b', null, money(a.cpl, { cur })) : h('b', { class: 'na' }, 'no leads yet');
  else if (!d.sales_source) big = h('b', { class: 'na' }, 'no sales source');
  else {
    big = ok(a.roas) ? h('b', { class: v && v[0] === 'bad' ? 'bad' : '' }, x(a.roas)) : h('b', { class: 'na' }, 'no sales yet');
    if (g.roas) bar = gauge({ value: a.roas || 0, max: Math.max(g.roas * 1.6, (a.roas || 0) * 1.05), goal: g.roas, thin: true, tone: !v || early ? '' : v[0] });
  }
  return opener(h('article', { class: 'mt-ad' + (early ? ' early' : '') },
    adTile(a),
    h('div', { class: 'mt-b' },
      h('div', null, h('h4', null, a.name),
        h('div', { class: 'w' }, a.lead ? statusDot('info', 'Leads') : v ? statusDot(v[0], v[1]) : null, a.adset ? h('span', null, 'Ad set: ' + a.adset) : null, a.campaign ? h('span', null, 'Campaign: ' + a.campaign) : null)),
      h('div', null, h('div', { class: 'mt-ro' }, h('span', { class: 'lx-cap' }, a.lead ? 'Cost per lead' : 'ROAS'), big), bar),
      h('div', { class: 'mt-three' },
        h('div', null, 'Spend', h('b', null, usd(a.spend, cur))),
        h('div', null, a.lead ? 'Leads' : 'Sales', h('b', null, a.lead ? num(a.leads || 0) : d.sales_source ? num(a.purchases || 0) : '-')),
        h('div', null, a.lead ? 'Per lead' : 'Per sale', h('b', null, a.lead ? (ok(a.cpl) ? money(a.cpl, { cur }) : '-') : ok(a.cpa) ? usd(a.cpa, cur) : '-'))))),
  () => open(a, d, ctx), 'Open ' + a.name);
}

/* sort keys: [label, value of a row (null sorts last), high is better?] */
const SORTS = {
  roas: ['ROAS', a => a.roas], spend: ['Spend', a => a.spend], sales: ['Sales', a => a.purchases], cpa: ['Cost per sale', a => a.cpa],
  nc_roas: ['New customer ROAS', a => a.nc_roas], ctr: ['CTR', a => a.ctr], cpm: ['CPM', a => a.cpm], frequency: ['Frequency', a => a.frequency],
  newest: ['Newest', a => ok(a.age) ? -a.age : null],
};
const LOW_FIRST = new Set(['cpa', 'cpm', 'frequency']);
const PAGE = 15;
function gridCard(d, ctx) {
  const cur = d.currency;
  let type = ctx.settingNow('meta.top.type', 'all'), sort = ctx.settingNow('meta.top.sort', d.sales_source ? 'roas' : 'spend'), view = ctx.settingNow('meta.top.view', 'cards'), shown = PAGE;
  if (!SORTS[sort]) sort = 'spend';
  let dir = ctx.settingNow('meta.top.dir', LOW_FIRST.has(sort) ? 'asc' : 'desc');
  const box = h('div'), more = h('div', { class: 'mr-more' }), g = d.goals || {};
  const need = g.cpa ? g.cpa * 2 : 0;
  const rowsNow = () => {
    const rows = (d.ads || []).filter(a => type === 'all' || (type === 'video') === !!a.video);
    const val = SORTS[sort][1];
    return rows.slice().sort((p, q) => {
      /* by ROAS: ads with enough spend to judge first, so a $9 ad with one chance sale never leads */
      if (sort === 'roas') { const j = (q.spend >= need) - (p.spend >= need); if (j) return j; }
      const a = val(p), b = val(q);
      if (!ok(a) || !ok(b)) return ok(a) ? -1 : ok(b) ? 1 : (q.spend || 0) - (p.spend || 0);
      return (dir === 'asc' ? a - b : b - a) || (q.spend || 0) - (p.spend || 0);
    });
  };
  const paint = () => {
    const rows = rowsNow();
    if (view === 'table') {
      put(box, card({ flush: true }, table({ rows, empty: 'No ads of this kind spent on these dates.',
        cols: [
          { key: 'name', label: 'Ad', render: a => h('span', { style: { display: 'inline-flex', alignItems: 'center', gap: '10px', minWidth: 0 } }, adTile(a, 'xs'), h('span', { class: 'name' }, a.name)) },
          { key: 'adset', label: 'Ad set', class: 'hide-md' },
          { key: 'spend', label: def('Spend', 'ad_spend'), num: true, sortable: true, render: a => usd(a.spend, cur) },
          { key: 'purchases', label: def('Sales', 'purchases_last_click'), num: true, sortable: true, render: a => ok(a.purchases) ? num(a.purchases) : '' },
          { key: 'roas', label: def('ROAS', 'roas'), num: true, sortable: true, render: a => ok(a.roas) ? x(a.roas) : h('span', { class: 'mr-dim' }, 'none') },
          { key: 'cpa', label: def('Cost per sale', 'cpa'), num: true, sortable: true, render: a => ok(a.cpa) ? usd(a.cpa, cur) : '' },
          { key: 'nc_roas', label: def('New cust. ROAS', 'new_customer_roas'), num: true, sortable: true, class: 'hide-md', render: a => ok(a.nc_roas) ? x(a.nc_roas) : '' },
          { key: 'ctr', label: def('CTR', 'ctr'), num: true, sortable: true, class: 'hide-sm', render: a => ok(a.ctr) ? pct(a.ctr, { digits: 2 }) : '' },
          { key: 'cpm', label: def('CPM', 'cpm'), num: true, sortable: true, class: 'hide-sm', render: a => ok(a.cpm) ? money(a.cpm, { cur, cents: true }) : '' },
          { key: 'frequency', label: def('Freq.', 'frequency'), num: true, sortable: true, class: 'hide-md', render: a => ok(a.frequency) ? a.frequency.toFixed(2) : '' },
        ],
        onRow: a => open(a, d, ctx) })));
      put(more, '');
    } else {
      put(box, h('div', { class: 'mt-grid' }, ...(rows.length ? rows.slice(0, shown).map(a => adCard(a, d, ctx)) : [h('p', { class: 'mr-dim' }, 'No ads of this kind spent on these dates.')])));
      put(more, rows.length > shown ? button(`Show all ${num(rows.length)} ads`, { onclick: () => { shown = rows.length; paint(); } }) : '');
    }
  };
  paint();
  const n = k => (d.ads || []).filter(a => (k === 'video') === !!a.video).length;
  const sel = h('select', { 'aria-label': 'Sort by', onchange: e => { sort = e.target.value; dir = LOW_FIRST.has(sort) ? 'asc' : 'desc'; dirBtn.textContent = dirWord(); ctx.saveSetting('meta.top.sort', sort); ctx.saveSetting('meta.top.dir', dir); paint(); } },
    Object.entries(SORTS).map(([id, s]) => h('option', { value: id, selected: id === sort || null }, s[0])));
  const dirWord = () => (sort === 'newest' ? (dir === 'desc' ? 'Newest first' : 'Oldest first') : dir === 'desc' ? 'High to low' : 'Low to high');
  const dirBtn = button(dirWord(), { class: 'mt-dir', title: 'Flip the order', onclick: () => { dir = dir === 'desc' ? 'asc' : 'desc'; dirBtn.textContent = dirWord(); ctx.saveSetting('meta.top.dir', dir); paint(); } });
  return [
    h('div', { class: 'mt-h' }, h('h3', null, `Top ads on Meta, ${d.window && d.window.label ? d.window.label : 'these dates'}`),
      segmented([{ id: 'all', label: 'All' }, { id: 'video', label: `Video ${n('video')}` }, { id: 'image', label: `Image ${n('image')}` }], type, id => { type = id; shown = PAGE; ctx.saveSetting('meta.top.type', id); paint(); }),
      h('label', null, 'Sort by', sel), dirBtn,
      segmented([{ id: 'cards', label: 'Cards' }, { id: 'table', label: 'Table' }], view, id => { view = id; ctx.saveSetting('meta.top.view', id); paint(); })),
    box, more,
  ];
}

const HELP = [
  { title: 'What it is for', text: 'Every Facebook and Instagram ad that spent on the dates in the page head, best first. Tap any ad for all of its numbers: spend, sales, ROAS, cost per sale, CTR, CPM, frequency, its ad set and spend and sales by day.' },
  { title: 'How an ad is judged', text: 'An ad is judged once it has spent twice the goal cost per sale and run 3 days. Before that it shows as Too early. The tick on each bar is the brand\'s goal ROAS. Ad sets are judged first: the detail shows the ad\'s ad set beside it.' },
  { title: 'Where the numbers come from', text: 'Sales, ROAS and cost per sale are Triple Whale, last click per platform. Spend, CTR, CPM and frequency are Meta\'s.' },
];

export default {
  title: ['Which Meta ads ', em('are selling?')],
  eyebrow: 'Meta',
  load,
  skeleton(el) { put(el, h('div', { class: 'lx-skel-grid' }, skeleton('kpi', 3)), skeleton('chart', 2)); },
  render(el, d, ctx) {
    styles('mt-css', CSS);
    const stop = gate(d, ctx, 'Top ads');
    if (stop) return put(el, stop);
    if (!(d.ads || []).length) return put(el, empty({ title: 'No Meta ads spent on these dates', text: `Nothing spent ${d.window ? d.window.label : 'on these dates'}. Pick a longer date range at the top.`, action: oldLink(ctx) }));
    put(el, ...[headRow({ help: HELP }), figures(d, ctx), sentence(d, ctx), ...gridCard(d, ctx)].filter(Boolean));
  },
};

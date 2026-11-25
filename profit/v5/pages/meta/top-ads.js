/* Ads > Meta > Top ads for one brand: which ads are selling and which are not, on the dates in the page head.
   Three figures, one sentence, then the ads as cards (picture, verdict, ROAS against goal, spend, sales).

   Real mode reads:
     GET /api/hub/creative?act=&from=&to=&model=lastPlatformClick   profit: every ad with spend, Triple Whale sales, the brand's goals
     GET /api/ad-creatives?act=&ads=                                account-health: the pictures for the ads shown first */

import { put } from '../../kit.js';
import { h, em, card, kpi, takeaway, button, segmented, gauge, empty, skeleton, money, num, pct } from '../../kit.js';
import { ok, usd, div, sum, soft, judge, adTile, gate, oldLink, foot, styles, statusDot, x } from './_rest.js';

const CSS = `
.mt-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:20px}
.mt-ad{display:flex;flex-direction:column;min-width:0;border-radius:var(--r-lg);background:var(--surface);box-shadow:var(--sh-1);overflow:hidden}
.mt-ad .mr-tile{width:100%;height:auto;aspect-ratio:4/5;border-radius:0}
.mt-ad .mr-tile svg{width:30px;height:30px}
.mt-b{display:grid;grid-template-columns:minmax(0,1fr);gap:12px;padding:16px 18px 18px;min-width:0}
.mt-b h4{margin:0;font-size:14px;font-weight:600;letter-spacing:-.01em;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.mt-b .w{margin-top:4px;display:flex;gap:8px;align-items:center;font-size:12.5px;color:var(--muted);min-width:0}
.mt-b .w em{font-style:normal;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0}
.mt-ro{display:flex;align-items:baseline;justify-content:space-between;gap:8px}
.mt-ro b{font-size:22px;font-weight:600;letter-spacing:-.03em;font-variant-numeric:tabular-nums}
.mt-ro b.bad{color:var(--bad)}.mt-ro b.na{font-size:13px;font-weight:500;letter-spacing:0;color:var(--muted)}
.mt-two{display:grid;grid-template-columns:1fr 1fr;gap:10px;padding-top:12px;border-top:1px solid var(--line)}
.mt-two>div:last-child{text-align:right}
.mt-two b{display:block;margin-top:3px;font-size:15px;font-weight:600;font-variant-numeric:tabular-nums}
.mt-ad.early .mt-b{opacity:.62}
.mt-h{display:flex;align-items:center;gap:14px;flex-wrap:wrap}
.mt-h h3{margin:0;font-size:15px;font-weight:600}
.mt-h p{margin:0;color:var(--muted);font-size:13px;flex:1;min-width:180px}
@media (max-width:1180px){.mt-grid{grid-template-columns:repeat(3,minmax(0,1fr))}}
@media (max-width:759px){
  .mt-grid{grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}
  .mt-b{padding:12px 12px 14px;gap:10px}
  .mt-ro b{font-size:19px}
  .mt-h .lx-seg{max-width:100%}
}`;

/* ---------- load: real mode ---------- */
async function load(ctx) {
  const act = encodeURIComponent(ctx.brand.id), w = { from: ctx.range.from, to: ctx.range.to, label: ctx.range.label };
  let r;
  try { r = await ctx.api(`/api/hub/creative?act=${act}&from=${w.from}&to=${w.to}&model=lastPlatformClick`, { worker: 'profit', signal: ctx.signal }); }
  catch (e) { if (e && (e.name === 'AbortError' || e.status === 401)) throw e; if (/meta|connect/i.test(e.message || '')) return { connected: false, error: e.message }; throw e; }
  const g = r.goals || {};
  const ads = (r.ads || []).map(a => ({ id: a.id, name: a.name, video: a.media_type === 'video', lead: a.obj === 'leads', campaign: a.campaign || null, adset: a.adset && a.adset.name || null,
    spend: a.spend, revenue: a.revenue, purchases: a.purchases, roas: a.roas, cpa: a.cpa, leads: a.leads || null, cpl: a.cpl ?? null, age: a.age ?? null, thumb: null }));
  /* pictures for the ads a person sees first: the best sellers and the biggest spenders */
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

/* ---------- the parts ---------- */
function figures(d) {
  const cur = d.currency, g = d.goals || {}, ads = d.ads || [], sales = ads.filter(a => !a.lead);
  const judged = sales.map(a => ({ a, v: judge(a, g) }));
  const winners = judged.filter(j => j.v && j.v[0] === 'good' && j.a.purchases >= 3);
  const best = sales.filter(a => a.purchases >= 3 && ok(a.cpa)).sort((p, q) => p.cpa - q.cpa)[0];
  const none = h('small', null, 'No sales source connected');
  return h('div', { class: 'mr-kp' },
    kpi({ size: 'lg', label: 'Ads with spend', value: num(ads.length), sub: usd(sum(ads, 'spend'), cur) + ' spent' }),
    kpi({ size: 'lg', label: 'Winners', value: d.sales_source ? num(winners.length) : none,
      sub: d.sales_source ? (g.roas ? `${x(g.roas)} ROAS or better, 3 or more sales` : g.cpa ? `${usd(g.cpa, cur)} a sale or less, 3 or more sales` : 'No goal set for this brand') : '' }),
    kpi({ size: 'lg', label: 'Best cost per sale', value: !d.sales_source ? none : best ? usd(best.cpa, cur) : h('small', null, 'No ad has 3 sales yet'),
      sub: d.sales_source && best ? best.name + (g.cpa ? ', goal ' + usd(g.cpa, cur) : '') : '' }));
}
function sentence(d, ctx) {
  if (!d.sales_source) return null;
  const t = Object.fromEntries((d.by_type || []).map(r => [r.key, r])), v = t.video, i = t.image, cur = d.currency;
  if (!v || !i || !ok(v.cpa) || !ok(i.cpa)) return null;
  const b = s => h('b', null, s), cheaper = v.cpa <= i.cpa ? 'video' : 'image';
  const say = Math.abs(v.cpa - i.cpa) / Math.max(v.cpa, i.cpa) < 0.08
    ? ['A video sale and an image sale cost about the same: ', b(usd(v.cpa, cur)), ' against ', b(usd(i.cpa, cur)), '.']
    : [cheaper === 'video' ? 'A video sale costs ' : 'An image sale costs ', b(usd(cheaper === 'video' ? v.cpa : i.cpa, cur)), ' against ', b(usd(cheaper === 'video' ? i.cpa : v.cpa, cur)), cheaper === 'video' ? ' for an image.' : ' for a video.'];
  return takeaway(say, { action: ctx.isClient ? null : button('Ask why', { href: ctx.href('ask', 'index') }) });
}
function adCard(a, d) {
  const cur = d.currency, g = d.goals || {}, v = d.sales_source ? judge(a, g) : null, early = v && v[0] === 'off';
  const where = a.adset || a.campaign;
  let big, bar = null;
  if (a.lead) big = ok(a.cpl) ? h('b', null, money(a.cpl, { cur })) : h('b', { class: 'na' }, 'no leads yet');
  else if (!d.sales_source) big = h('b', { class: 'na' }, 'no sales source');
  else {
    big = ok(a.roas) ? h('b', { class: v && v[0] === 'bad' ? 'bad' : '' }, x(a.roas)) : h('b', { class: 'na' }, 'no sales yet');
    if (g.roas) bar = gauge({ value: a.roas || 0, max: Math.max(g.roas * 1.6, (a.roas || 0) * 1.05), goal: g.roas, thin: true, tone: !v || early ? '' : v[0] });
  }
  return h('article', { class: 'mt-ad' + (early ? ' early' : '') },
    adTile(a),
    h('div', { class: 'mt-b' },
      h('div', null, h('h4', { title: a.name }, a.name),
        h('div', { class: 'w' }, a.lead ? statusDot('info', 'Leads') : v ? statusDot(v[0], v[1]) : null, where ? h('em', { title: where }, where) : null)),
      h('div', null, h('div', { class: 'mt-ro' }, h('span', { class: 'lx-cap' }, a.lead ? 'Cost per lead' : 'ROAS'), big), bar),
      h('div', { class: 'mt-two' },
        h('div', null, h('span', { class: 'lx-cap' }, 'Spend'), h('b', null, usd(a.spend, cur))),
        h('div', null, h('span', { class: 'lx-cap' }, a.lead ? 'Leads' : 'Sales'), h('b', null, a.lead ? num(a.leads || 0) : d.sales_source ? num(a.purchases || 0) : h('span', { class: 'mr-dim' }, 'not read'))))));
}

const SORTS = { roas: ['ROAS', (p, q) => (q.roas ?? -1) - (p.roas ?? -1) || q.spend - p.spend], spend: ['Spend', (p, q) => q.spend - p.spend], sales: ['Sales', (p, q) => (q.purchases || 0) - (p.purchases || 0) || q.spend - p.spend] };
const PAGE = 12;
function gridCard(d, ctx) {
  let type = ctx.settingNow('meta.top.type', 'all'), sort = ctx.settingNow('meta.top.sort', d.sales_source ? 'roas' : 'spend'), shown = PAGE;
  if (!SORTS[sort]) sort = 'spend';
  const grid = h('div', { class: 'mt-grid' }), more = h('div', { class: 'mr-more' }), g = d.goals || {};
  const need = g.cpa ? g.cpa * 2 : 0;
  const paint = () => {
    let rows = (d.ads || []).filter(a => type === 'all' || (type === 'video') === !!a.video);
    /* by ROAS: ads with enough spend to judge first, the too early ones after, so a $9 ad with one chance sale never leads */
    rows = rows.slice().sort((p, q) => (sort === 'roas' ? ((q.spend >= need) - (p.spend >= need)) : 0) || SORTS[sort][1](p, q));
    put(grid, ...(rows.length ? rows.slice(0, shown).map(a => adCard(a, d)) : [h('p', { class: 'mr-dim' }, 'No ads of this kind spent on these dates.')]));
    put(more, rows.length > shown ? button(`Show all ${num(rows.length)} ads`, { onclick: () => { shown = rows.length; paint(); } }) : '');
  };
  paint();
  const n = k => (d.ads || []).filter(a => (k === 'video') === !!a.video).length;
  return [
    h('div', { class: 'mt-h' }, h('h3', null, 'Top ads on Meta'),
      h('p', null, `Sales and ROAS from Triple Whale.${g.roas ? ` The tick marks the ${x(g.roas)} goal.` : ''}`),
      segmented([{ id: 'all', label: 'All' }, { id: 'video', label: `Video ${n('video')}` }, { id: 'image', label: `Image ${n('image')}` }], type, id => { type = id; shown = PAGE; ctx.saveSetting('meta.top.type', id); paint(); }),
      segmented(Object.entries(SORTS).map(([id, s]) => ({ id, label: s[0] })), sort, id => { sort = id; ctx.saveSetting('meta.top.sort', id); paint(); })),
    grid, more,
  ];
}

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
    put(el, ...[
      figures(d), sentence(d, ctx), ...gridCard(d, ctx),
      foot(`${d.window && d.window.label ? d.window.label + '. ' : ''}Facebook and Instagram ads only. Sales, ROAS and cost per sale from Triple Whale, last click per platform. Spend from Meta. An ad is judged once it has spent twice the goal cost per sale and run 3 days.`),
    ].filter(Boolean));
  },
};

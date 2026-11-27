/* What works > Ad type. "What kind of ad sells?" One question per row, the ads under each group.
   Live data: GET /api/hub/creative (profit worker) for spend, clicks, add to carts and Triple Whale sales per Meta ad;
   GET /api/ad-creatives (account-health) for the pictures. Video or still is Meta's own field. Who made it is read
   from the ad name for now. People in the ad, product shown and type of picture are AI tags: hidden behind
   "Tags are being re-checked" until a person has checked them. */

import { APP_NAME } from '../../config.js';
import { put } from '../../kit.js';
import { h, takeaway, segmented, statusDot, em, money, num, pct, x, skeleton, platformChip, kpi } from '../../kit.js';
import { css, gate, noAds, loadAds, sampleAds, art, meter, roll, findingButton, thin, p1, dl, def, helpBar, figs, winOf, adThumb, tileRow } from './_ww.js';
import { sourceLine } from '../../kit.js';

const ST = { measure: null };
const MEASURE = {
  roas: { label: 'ROAS', fmt: v => x(v), unit: 'ROAS', of: g => g.roas, goal: d => d.goal_roas, needsSales: true },
  ctr: { label: 'Click rate', fmt: v => p1(v), unit: 'click rate', of: g => g.ctr, goal: () => null },
  atc: { label: 'Add to cart rate', fmt: v => p1(v), unit: 'add to cart', of: g => g.atc_rate, goal: () => null },
};
const madeBy = a => (a.maker ? a.maker : /@|creator|ugc|ambassador/i.test(a.name || '') ? 'creator' : 'brand');
const ageOf = a => (a.age == null ? null : a.age < 14 ? 'new' : a.age <= 45 ? 'mid' : 'old');

function group(list) {
  const g = roll(list);
  const atc = list.reduce((t, a) => t + (a.atc != null ? a.atc : (a.atc_rate || 0) * (a.clicks || 0)), 0);
  return { ...g, atc_rate: g.clicks ? atc / g.clicks : null, top: [...list].sort((a, b) => b.spend - a.spend).slice(0, 3) };
}

function question(d, q, ctx) {
  const m = MEASURE[ST.measure];
  const groups = q.groups.map(gr => ({ ...gr, g: group(gr.list) })).filter(gr => gr.g.ads);
  if (groups.length < 2) return null;
  const val = gr => m.of(gr.g);
  const ranked = groups.filter(gr => val(gr) != null && !(m.needsSales && thin(gr.g.orders)));
  const best = ranked.length >= 2 ? ranked.reduce((p, c) => (val(c) > val(p) ? c : p)) : null;
  const worst = ranked.length >= 2 ? ranked.reduce((p, c) => (val(c) < val(p) ? c : p)) : null;
  const goal = m.goal(d);
  const max = Math.max(goal || 0, ...groups.map(gr => val(gr) || 0)) * 1.15 || 1;
  const gap = best && worst && best !== worst ? (m.needsSales ? x(val(best) - val(worst)) : ((val(best) - val(worst)) * 100).toFixed(2) + ' pts') : null;
  return h('section', { class: 'lx-card' },
    h('div', { class: 'ww-q' },
      h('div', { class: 'meta' }, h('h3', null, q.title), q.source, sourceLine(winOf(ctx), m.needsSales ? 'Triple Whale, last click' : 'Meta'), gap ? h('span', null, dl('Gap best to worst', 'gap'), ' ', h('b', null, gap)) : null),
      h('div', { class: 'ww-gs' }, groups.map(gr => {
        const v = val(gr), dim = m.needsSales && thin(gr.g.orders);
        return h('div', { class: 'ww-g' },
          h('div', { class: 'hd' }, gr.name, gr === best ? statusDot('good', 'Best') : gr === worst ? statusDot('bad', 'Weakest') : null),
          h('div', { class: 'v' + (dim ? ' dim' : '') }, v == null ? 'no data' : m.fmt(v), h('small', null, m.unit)),
          meter(v, goal, { max, dim, goalTitle: goal ? 'Goal ' + m.fmt(goal) : null }),
          figs([['Ads', num(gr.g.ads)], ['Spend', money(gr.g.spend)], d.has_sales ? [dl('Orders', 'tw_orders'), num(gr.g.orders), { cls: thin(gr.g.orders) ? 'dim' : '' }] : null,
            d.has_sales ? [dl('Cost per sale', 'cpa'), gr.g.cpa ? money(gr.g.cpa) : 'no sale', { cls: thin(gr.g.orders) ? 'dim' : '' }] : null, [dl('Click rate', 'click_rate'), p1(gr.g.ctr)]].filter(Boolean), 3),
          h('div', { class: 'ww-thumbs' }, gr.g.top.map(a => adThumb(ctx, d, a, a.name))));
      }))),
    best && worst && best !== worst && !ctx.isClient ? h('div', { style: { marginTop: '18px', display: 'flex', justifyContent: 'flex-end' } }, findingButton(ctx, () => ({
      say: [h('b', null, best.name), ` leads on ${m.label.toLowerCase()}: ${m.fmt(val(best))} against ${m.fmt(val(worst))} for ${worst.name.toLowerCase()}.`], measure: m.label.toLowerCase(),
      proof: best.g.top.slice(0, 2).map(a => ({ value: m.of(group([a])) || 0, text: m.fmt(m.of(group([a]))), name: a.name.slice(0, 16), sub: best.name.toLowerCase() })),
      normal: { value: val(worst) || 0, text: m.fmt(val(worst)), name: worst.name, sub: 'the weakest group' },
      brief: { title: 'More ' + best.name.toLowerCase() + ' ads', make: 'Three new ' + best.name.toLowerCase() + ' ads on the angles that sell now', why: `${best.name} leads on ${m.label.toLowerCase()}.`, count: 3 },
    }), 'Make new ads from this')) : null);
}

function view(d, ctx) {
  const stop = gate(d, ctx);
  if (stop) return [stop];
  if (!d.ads || !d.ads.length) return [noAds(ctx)];
  if (!ST.measure || (MEASURE[ST.measure].needsSales && !d.has_sales)) ST.measure = d.has_sales ? 'roas' : 'ctr';
  const ads = d.ads.filter(a => a.spend > 0);
  const stills = ads.filter(a => a.kind !== 'video'), vids = ads.filter(a => a.kind === 'video');
  const all = group(ads), st = group(stills), vd = group(vids);
  const Q = [
    { title: 'Video or still?', source: 'Format, from Meta itself', groups: [{ name: 'Still', list: stills }, { name: 'Video', list: vids }] },
    { title: 'Creator or brand made?', source: 'Read from the ad name for now: creator, UGC, ambassador or an @ counts as a creator ad', groups: [{ name: 'Brand made', list: ads.filter(a => madeBy(a) === 'brand') }, { name: 'Creator', list: ads.filter(a => madeBy(a) === 'creator') }] },
    { title: 'New or older?', source: 'Days since the ad first spent. Older ads already won a place, so it is not a fair fight with new ones', groups: [{ name: 'Under 14 days', list: ads.filter(a => ageOf(a) === 'new') }, { name: '14 to 45 days', list: ads.filter(a => ageOf(a) === 'mid') }, { name: 'Over 45 days', list: ads.filter(a => ageOf(a) === 'old') }] },
  ];
  /* the Locus line only when it adds a reason the numbers do not show */
  const lead = st.spend > vd.spend ? ['Offers travel with format. Most sale ads here are stills, so ', h('b', null, 'part of the still or video gap is the offer, not the format'), '.'] : null;
  const MS = Object.entries(MEASURE).filter(([, m]) => !m.needsSales || d.has_sales).map(([id, m]) => ({ id, label: m.label }));
  const body = h('div', { class: 'ww-stack' });
  const paint = () => {
    const m = MEASURE[ST.measure], w = winOf(ctx);
    /* every group of every question, judged on the measure picked (ROAS groups under 30 orders are left out) */
    const gs = Q.flatMap(q => q.groups.map(gr => ({ q, name: gr.name, g: group(gr.list) }))).filter(o => o.g.ads && m.of(o.g) != null && !(m.needsSales && thin(o.g.orders)));
    const hi = gs.length ? gs.reduce((p, c) => (m.of(c.g) > m.of(p.g) ? c : p)) : null, lo = gs.length >= 2 ? gs.reduce((p, c) => (m.of(c.g) < m.of(p.g) ? c : p)) : null;
    const gap = hi && lo && hi !== lo ? (m.needsSales ? x(m.of(hi.g) - m.of(lo.g)) : ((m.of(hi.g) - m.of(lo.g)) * 100).toFixed(2) + ' pts') : null;
    const src = m.needsSales ? 'Triple Whale, last click' : 'Meta';
    ctx.askWindow = w || null;
    ctx.askContext = `What works, Ad type, ${w || 'these dates'}: ${num(ads.length)} Meta ads with ${money(all.spend)} spend, judged on ${m.label}.` + (hi ? ` Best group ${hi.name} (${hi.q.title}) at ${m.fmt(m.of(hi.g))}` : '') + (lo && lo !== hi ? `, weakest ${lo.name} at ${m.fmt(m.of(lo.g))}.` : '.');
    put(body, tileRow([
      kpi({ label: 'Ads judged', value: num(ads.length), sub: `${num(vids.length)} videos, ${num(stills.length)} stills`, window: w, source: 'Meta' }),
      kpi({ label: 'Best type on ' + (m.needsSales ? m.label : m.label.toLowerCase()), value: hi ? m.fmt(m.of(hi.g)) : h('small', null, 'Too early'), sub: hi ? hi.name : 'No group has 30 orders yet', window: w, source: src }),
      kpi({ label: dl('Gap best to worst', 'gap'), value: gap || h('small', null, 'Too early'), sub: hi && lo && hi !== lo ? `${hi.name} against ${lo.name.toLowerCase()}` : null, window: w, source: src }),
    ], 3), ...Q.map(q => question(d, q, ctx)).filter(Boolean));
  };
  paint();
  return [
    helpBar([{ title: 'What it is for', text: 'Which kind of Meta ad sells: still or video, creator or brand made, new or older. Each group adds up its ads on the dates at the top; the best and weakest are marked. Pick what to judge on.' },
      { title: 'Gray figures', text: 'A group with under 30 orders is drawn in gray: read it as a hint, not a result. The tick on each bar is the brand\'s goal. Grouping by people in it, product shown and type of picture comes back once those tags are checked by a person.' }], {},
      platformChip('meta'), h('span', { class: 'note ww-q-note' }, `${num(ads.length)} ads, ${money(all.spend)} spend, the dates at the top`)),
    lead ? takeaway(lead) : null,
    h('div', { class: 'ww-bar' }, h('span', { class: 'note' }, 'Judge on'), segmented(MS, ST.measure, id => { ST.measure = id; paint(); })),
    body,
  ].filter(Boolean);
}

export default {
  title: ['What kind of ad ', em('sells?')],
  eyebrow: 'What works',
  load: ctx => loadAds(ctx, { covers: true }),
  sample: () => sampleAds(),
  skeleton(el) { put(el, skeleton('row', 2), skeleton('chart', 2)); },
  render(el, d, ctx) { css(); put(el, ...view(d, ctx)); },
};

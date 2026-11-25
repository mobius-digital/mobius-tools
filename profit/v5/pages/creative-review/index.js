/* Creative > Creative review. "What is every ad doing right now?"
   One card per live ad: the picture, spend and cost per sale, click rate and add to cart rate, sales credit on
   first click and on last click (Triple Whale), Meta's own order count beside Triple Whale's, and one short read.
   Live data: GET /api/hub/creative (profit worker) and GET /api/ad-creatives (account-health) for the covers.
   No patterns across ads here: those live in What works. */

import { APP_NAME } from '../../config.js';
import { put } from '../../kit.js';
import { h, card, kpi, kpis, takeaway, segmented, button, em, pill, legend, money, num, x, skeleton, empty } from '../../kit.js';
import { css, art, gate, noAds, loadAds, roleOf, roll, meter, tagsNote, foot, findingButton, statusDot, p1, p0, SRC_NOTE } from '../what-works/_ww.js';

const ROLE = { opener: 'Opener', closer: 'Closer', both: 'Both', thin: 'Too early' };
const KIND = a => (a.kind === 'video' ? (a.maker === 'creator' ? 'Creator video' : 'Video') : 'Still');
const day = d => (d ? new Date(d + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '');
const rich = parts => (Array.isArray(parts) ? parts.map(q => (q && q.b ? h('b', null, q.b) : q)) : parts);
const ST = { sort: 'spend', role: 'all', all: false };

/* one short read per ad, from the numbers on its own card */
function readOf(a, d) {
  if (a.read) return a.read;
  if (!d.has_sales) return 'No sales source is connected, so this ad is judged on clicks only.';
  const out = [];
  const r = a.role;
  if (r === 'opener') out.push('Starts journeys: first click sales are ' + (a.lc > 0 ? (a.fc / a.lc).toFixed(1) + ' times' : 'well above') + ' last click.');
  else if (r === 'closer') out.push('Closes sales that other ads started.');
  else if (r === 'both') out.push('Opens journeys and closes them.');
  else out.push('Not enough sales yet to place it.');
  if (d.goal_cpa && a.cpa && a.cpa > d.goal_cpa * 1.5) out.push('Cost per sale is well over the ' + money(d.goal_cpa) + ' goal.');
  else if (d.goal_cpa && a.cpa && a.cpa <= d.goal_cpa) out.push('On goal.');
  if (a.meta_orders > 2 && a.meta_orders >= (a.tw_orders || 0) * 1.5) out.push('Meta counts more orders than Triple Whale does.');
  return out.slice(0, 2).join(' ');
}

function adCard(a, d, ctx, top) {
  const w = v => Math.max(0, Math.min(100, 100 * (v || 0) / top)).toFixed(0) + '%';
  const sales = d.has_sales;
  const over = sales && d.goal_cpa && a.cpa > d.goal_cpa * 1.5;
  return h('article', { class: 'ww-c' },
    art(a, { kind: KIND(a) }),
    h('div', null,
      h('div', { class: 'nm' }, h('span', null, a.name), sales && a.role && h('span', { class: 'lx-cap' }, ROLE[a.role])),
      a.set && h('div', { class: 'sub' }, 'Set: ' + a.set)),
    h('div', { class: 'ww-st' },
      h('div', null, h('span', null, 'Spend'), h('b', null, money(a.spend))),
      h('div', null, h('span', null, 'Cost per sale'), h('b', { class: !sales || !a.cpa ? 'dim' : over ? 'bad' : '' }, !sales ? 'no data' : a.cpa ? money(a.cpa) : 'no sale')),
      h('div', null, h('span', null, 'Click rate'), h('b', null, p1(a.ctr))),
      h('div', null, h('span', null, 'Add to cart rate'), h('b', { class: a.atc_rate == null ? 'dim' : '' }, a.atc_rate == null ? 'no data' : p1(a.atc_rate)))),
    sales ? h('div', { class: 'ww-3' },
      h('div', { class: 'r' }, 'First click', h('span', { class: 't' }, h('i', { class: 's', style: { '--v': w(a.fc) } })), h('b', null, money(a.fc))),
      h('div', { class: 'r' }, 'Last click', h('span', { class: 't' }, h('i', { style: { '--v': w(a.lc) } })), h('b', null, money(a.lc))),
      h('div', { class: 'cnt' }, h('span', null, 'Orders: Triple Whale ', h('b', null, num(a.tw_orders))), h('span', null, 'Meta says ', h('b', null, num(a.meta_orders)))))
      : h('div', { class: 'ww-3' }, h('div', { class: 'cnt' }, 'No sales source connected. ', h('span', null, 'Meta says ', h('b', null, num(a.meta_orders)), ' orders'))),
    h('p', { class: 'ww-say' }, h('span', { class: 'lx-cap' }, APP_NAME + ' AI'), readOf(a, d)),
    h('div', { class: 'ww-ft' }, a.live ? 'Last spent ' + day(a.last_day) : 'Off since ' + day(a.last_day), a.live ? statusDot('good', 'Live') : statusDot('off', 'Off')),
    findingButton(ctx, () => ({
      say: [h('b', null, a.name), sales && a.cpa ? ` brings a sale for ${money(a.cpa)}` + (d.goal_cpa ? ` against a ${money(d.goal_cpa)} goal.` : '.') : ' is one of the ads people click most.'],
      measure: 'click rate', proof: [{ value: a.ctr, text: p1(a.ctr), name: a.name, sub: KIND(a).toLowerCase() }],
      normal: { value: d.all.ctr, text: p1(d.all.ctr), name: 'Normal', sub: 'all ads' },
      brief: { title: 'Next version of ' + a.name, make: 'Three new versions that keep what works in ' + a.name, why: readOf(a, d), format: a.kind === 'video' ? 'Video, 9:16 and 4:5' : 'Still, 4:5 and 1:1', count: 3, by: a.by || null },
      board: d.board,
    }), 'Brief the next version'));
}

function gallery(d, ctx) {
  const box = h('div', { class: 'ww-stack', style: { gap: '20px' } });
  const SORTS = { spend: (a, b) => b.spend - a.spend, cpa: (a, b) => (a.cpa || 1e9) - (b.cpa || 1e9), fc: (a, b) => (b.fc || 0) - (a.fc || 0), ctr: (a, b) => (b.ctr || 0) - (a.ctr || 0) };
  const paint = () => {
    let list = d.ads.filter(a => ST.role === 'all' || (ST.role === 'off' ? !a.live : a.role === ST.role && a.live) || (ST.role === 'live' && a.live));
    list = [...list].sort(SORTS[ST.sort] || SORTS.spend);
    const shown = ST.all ? list : list.slice(0, 12);
    const top = Math.max(1, ...d.ads.map(a => Math.max(a.fc || 0, a.lc || 0)));
    put(box, 
      h('div', { class: 'lx-sec' }, h('h3', null, 'Every ad'), h('span', { class: 'note' }, `${shown.length} of ${list.length} shown. The same picture in several ad sets is one ad each.`)),
      h('div', { class: 'ww-bar' },
        segmented([{ id: 'spend', label: 'Spend' }, { id: 'cpa', label: 'Cost per sale' }, { id: 'fc', label: 'First click' }, { id: 'ctr', label: 'Click rate' }], ST.sort, id => { ST.sort = id; paint(); }),
        d.has_sales ? segmented([{ id: 'all', label: 'All' }, { id: 'opener', label: 'Openers' }, { id: 'both', label: 'Both' }, { id: 'closer', label: 'Closers' }, { id: 'off', label: 'Off' }], ST.role, id => { ST.role = id; ST.all = false; paint(); }) : null,
        h('span', { class: 'sp' }),
        d.has_sales ? legend([{ name: 'First click', square: true }, { name: 'Last click', square: true, color: 'var(--ink)' }]) : null),
      shown.length ? h('div', { class: 'ww-grid' }, shown.map(a => adCard(a, d, ctx, top))) : empty({ title: 'No ads in this group' }),
      list.length > shown.length ? h('div', { style: { justifySelf: 'center' } }, button(`Show all ${list.length} ads`, { onclick: () => { ST.all = true; paint(); } })) : '');
  };
  paint();
  return box;
}

function view(d, ctx) {
  const stop = gate(d, ctx);
  if (stop) return [stop];
  if (!d.ads || !d.ads.length) return [noAds(ctx)];
  for (const a of d.ads) a.role = a.role || roleOf(a, d.goal_cpa);
  d.all = roll(d.ads);
  const live = d.ads.filter(a => a.live);
  const all = d.all, sales = d.has_sales;
  const by = k => roll(d.ads.filter(a => a.kind === k));
  const still = by('image'), video = by('video');
  const share = g => (all.spend ? g.spend / all.spend : null);
  const off = d.ads.filter(a => !a.live && a.fc > 0).sort((a, b) => b.fc - a.fc);
  const offFc = off.reduce((t, a) => t + a.fc, 0), allFc = d.ads.reduce((t, a) => t + (a.fc || 0), 0);
  const read = d.read ? rich(d.read) : [
    'Stills take ', h('b', null, p0(share(still))), ' of spend', sales && still.roas ? [' and return ', h('b', null, x(still.roas)), '.'] : '.',
    sales && allFc > 0 && off.length ? [' ', h('b', null, p0(offFc / allFc)), ' of first click sales came from ads that are now off.'] : ''];
  const grp = (name, g, note) => h('div', { class: 'ww-g' },
    h('div', { class: 'hd' }, name),
    h('div', { class: 'v' }, p0(share(g)), h('small', null, 'of spend')),
    meter(share(g) || 0, null, { max: 1 }),
    h('p', null, `${num(g.ads)} ads, ${money(g.spend)}` + (sales ? `, ROAS ${x(g.roas)}` : '')), note && h('p', null, note));
  const roles = ['opener', 'both', 'closer'].map(r => ({ r, g: roll(live.filter(a => a.role === r)) }));

  return [
    kpis([
      kpi({ label: 'Ads live now', value: num(live.length), sub: `${num(d.ads.length)} spent on these dates`, size: 'lg' }),
      kpi({ label: 'Spend', value: money(all.spend), size: 'lg' }),
      kpi({ label: 'ROAS', src: 'Meta ads', value: sales ? x(all.roas) : 'no data', sub: sales ? (d.goal_roas ? 'goal ' + x(d.goal_roas) : null) : 'no sales source connected', size: 'lg' }),
      kpi({ label: 'Cost per sale', value: sales && all.cpa ? money(all.cpa) : 'no data', sub: d.goal_cpa ? 'goal ' + money(d.goal_cpa) : null, size: 'lg' }),
    ], { cols: 4 }),
    takeaway(read, { action: ctx.isClient ? null : button('Ask why', { href: ctx.href('ask', 'index') }) }),
    card({ class: 'ww-cd', title: 'Where the spend goes', note: 'by what the ad is, and by what it does', action: tagsNote() },
      h('div', { class: 'ww-stack', style: { gap: '28px', marginTop: '18px' } },
        h('div', { class: 'ww-q' },
          h('div', { class: 'meta' }, h('h3', null, 'Still or video'), 'Format, from Meta itself'),
          h('div', { class: 'ww-gs' }, grp('Still', still), grp('Video', video))),
        sales ? h('div', { class: 'ww-q' },
          h('div', { class: 'meta' }, h('h3', null, 'Opens or closes'), 'From Triple Whale first click against last click sales, live ads only'),
          h('div', { class: 'ww-gs' }, roles.map(({ r, g }) => grp({ opener: 'Openers', both: 'Both', closer: 'Closers' }[r], g)))) : null)),
    sales && off.length ? card({ class: 'ww-cd', title: 'Opened journeys, now off', note: `${p0(allFc ? offFc / allFc : null)} of first click sales, ${money(offFc)}, came from ads that no longer spend`,
      action: findingButton(ctx, () => ({
        say: [h('b', null, p0(allFc ? offFc / allFc : null)), ' of first click sales came from ads that are now off. Nothing live is replacing them.'],
        measure: 'first click sales', proof: off.slice(0, 2).map(a => ({ value: a.fc, text: money(a.fc, { compact: true }), name: a.name, sub: KIND(a).toLowerCase() })),
        brief: { title: 'New openers', make: 'Three new videos shaped like the openers that are off', why: 'The live ads mostly close sales. Journeys need new ads that start them.', format: 'Video, 9:16 and 4:5', count: 3 }, board: d.board,
      }), 'Brief new openers') },
      h('div', { class: 'ww-thumbs', style: { marginTop: '16px', gap: '16px' } }, off.slice(0, 6).map(a => h('div', { style: { width: '96px' } }, art(a), h('small', null, a.name), h('small', null, money(a.fc) + ' first click'))))) : null,
    gallery(d, ctx),
    foot(SRC_NOTE, 'First click and last click are both Triple Whale. Meta\'s own count includes people who only saw the ad, so it is a second opinion.'),
  ].filter(Boolean);
}

export default {
  title: ['What is every ad ', em('doing right now?')],
  eyebrow: 'Creative',
  load: ctx => loadAds(ctx, { covers: true }),
  skeleton(el) { put(el, skeleton('kpi', 4), skeleton('chart'), skeleton('row', 4)); },
  render(el, d, ctx) { css(); put(el, ...view(d, ctx)); },
};

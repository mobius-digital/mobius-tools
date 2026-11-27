/* Creative > Creative review. "What is every ad doing right now?"
   For the creative strategist and the media buyer: every Meta ad in a sales campaign that spent on the dates in the page
   head, one card each (3 a row on a wide screen, 2 on a tablet, 1 on a phone), sorted by any figure in either direction.
   Above the cards: four tiles, the Locus AI line, where the spend goes (still or video, opener or closer) and the ads
   that opened journeys and are now off. Every ad, small or large, opens the shared ad detail (pages/_addetail.js:
   media, every number, the funnel, first and last click, the other ads in its ad set, its days, the Locus call); this
   page adds the ad's words, where it sends people and "Brief the next version" under it.
   Live data: GET /api/hub/creative (profit worker) and GET /api/ad-creatives (account-health) for the covers and words,
   both through what-works/_ww.js loadAds. No patterns across ads here: those live in What works. */

import { APP_NAME } from '../../config.js';
import { put, safeHref } from '../../kit.js';
import { h, card, kpi, takeaway, segmented, button, em, platformChip, money, num, x, skeleton, empty, sourceLine } from '../../kit.js';
import { openAskPanel } from '../../askpanel.js';
import { css, art, gate, noAds, loadAds, roleOf, roll, meter, findingButton, statusDot, p1, p0, dl, def, helpBar, figs, teamTag,
  winOf, tileRow, secHead, sortMenu, openAd, adThumb, chipDef, thin } from '../what-works/_ww.js';

const ROLE = { opener: 'Opener', closer: 'Closer', both: 'Both', thin: 'Too early' };
const KIND = a => (a.kind === 'video' ? (a.maker === 'creator' ? 'Creator video' : 'Video') : 'Still');
const day = d => (d ? new Date(d + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '');
const rich = parts => (Array.isArray(parts) ? parts.map(q => (q && q.b ? h('b', null, q.b) : q)) : parts);
const cpmOf = a => (a.impressions ? a.spend / a.impressions * 1000 : null);
const ST = { role: 'all', all: false };
const where = a => [a.set, a.campaign].filter(Boolean).join(' · ');
const TW = 'Triple Whale, last click';

/* the sorts: every figure the page reads. low = lower is better (sorted low first when picked); no figure sorts last */
const SORTS = [
  { id: 'spend', label: 'Spend', of: a => a.spend },
  { id: 'sales', label: 'Sales', of: a => a.tw_sales, sales: true },
  { id: 'roas', label: 'ROAS', of: a => a.roas, sales: true },
  { id: 'cpa', label: 'Cost per sale', of: a => a.cpa || null, low: true, sales: true },
  { id: 'ctr', label: 'Click rate', of: a => a.ctr },
  { id: 'atc', label: 'Add to cart rate', of: a => a.atc_rate },
  { id: 'cpm', label: 'CPM', of: cpmOf, low: true },
  { id: 'hook', label: 'Hook rate', of: a => a.hook },
  { id: 'fc', label: 'First click sales', of: a => a.fc, sales: true },
  { id: 'lc', label: 'Last click sales', of: a => a.lc, sales: true },
  { id: 'newest', label: 'Newest', of: a => (a.age == null ? null : -a.age) },
];

/* one short read per ad, for the detail */
function readOf(a, d) {
  if (a.read) return a.read;
  if (!d.has_sales) return 'No sales source is connected, so this ad is judged on clicks only.';
  const out = [];
  const r = a.role;
  if (r === 'opener') out.push('Starts journeys: first click sales are ' + (a.lc > 0 ? (a.fc / a.lc).toFixed(1) + ' times' : 'well above') + ' last click.');
  else if (r === 'closer') out.push('Closes sales that other ads started.');
  else if (r === 'both') out.push('Opens journeys and closes them.');
  else out.push('Not enough sales yet to place it.');
  if (d.goal_cpa && a.cpa && a.cpa > d.goal_cpa * 1.5) out.push('Cost per sale is well over the goal.');
  if (a.meta_orders > 2 && a.meta_orders >= (a.tw_orders || 0) * 1.5) out.push('Meta\'s own count of orders runs far above Triple Whale\'s.');
  return out.slice(0, 2).join(' ');
}

const roleTag = a => (a.role ? chipDef(h('span', { class: 'lx-chip cr-role' }, ROLE[a.role]), a.role) : null);
const liveDot = a => { const el = a.live ? statusDot('good', 'Live') : statusDot('off', 'Off'); el.title = a.live ? 'Spent in the last 2 days' : 'No spend in the last 2 days, last spent ' + day(a.last_day); return el; };

/* ---------- the detail: the shared ad detail, with this page's words, link and brief under it ---------- */
function openOne(a, d, ctx) {
  const ref = openAd(ctx, a, d);
  const box = ref && ref.el && ref.el.querySelector('.adx');
  if (!box) return;
  const facts = [['Headline', a.headline], ['Primary text', a.body],
    ['Goes to', a.link && !safeHref(a.link) ? a.link : a.link ? h('a', { href: safeHref(a.link), target: '_blank', rel: 'noopener noreferrer' }, a.link.replace(/^https?:\/\//, '')) : null],
    ['Last spent', a.last_day ? day(a.last_day) : null]].filter(f => f[1]);
  box.append(h('section', { class: 'cr-more' },
    h('h3', null, 'Its words and where it sends people'),
    h('p', { class: 'ww-say' }, h('span', { class: 'lx-cap' }, APP_NAME + ' AI'), readOf(a, d)),
    facts.length ? h('dl', { class: 'cr-facts' }, facts.map(([k, v]) => h('div', null, h('dt', null, k), h('dd', null, v)))) : h('p', { class: 'cr-quiet' }, 'Its words have not been read yet.'),
    ctx.isClient ? null : h('div', { class: 'cr-acts' }, findingButton(ctx, () => ({
      say: [h('b', null, a.name), d.has_sales && a.cpa ? ` brings a sale for ${money(a.cpa)}` + (d.goal_cpa ? ` against a ${money(d.goal_cpa)} goal.` : '.') : ' is one of the ads people click most.'],
      measure: 'click rate', proof: [{ value: a.ctr, text: p1(a.ctr), name: a.name, sub: KIND(a).toLowerCase() }],
      normal: { value: d.all.ctr, text: p1(d.all.ctr), name: 'Normal', sub: 'all ads' },
      brief: { title: 'Next version of ' + a.name, make: 'Three new versions that keep what works in ' + a.name, why: readOf(a, d), format: a.kind === 'video' ? 'Video, 9:16 and 4:5' : 'Still, 4:5 and 1:1', count: 3, by: a.by || null },
      board: d.board,
    }), 'Brief the next version', { primary: true }), teamTag())));
}

/* ---------- one card, the Meta Best ads shape ---------- */
function adCard(a, d, ctx, sortId) {
  /* one rule for color: off goal is red, under 30 orders is gray (a hint, not a result), else ink */
  const sales = d.has_sales, early = sales && thin(a.tw_orders), over = sales && !early && d.goal_cpa && a.cpa > d.goal_cpa;
  const roasTone = !sales || a.roas == null ? '' : early ? 'dim' : d.goal_roas && a.roas < d.goal_roas ? 'bad' : '';
  const hint = early ? 'Under 30 orders: a hint, not a result' : null;
  const S = SORTS.find(s => s.id === sortId);
  const shownAlready = ['spend', 'roas', 'cpa', 'ctr'].includes(sortId);
  const by = S && !shownAlready && S.of(a) != null ? h('span', { class: 'cr-by' }, S.label + ' ' + fmtSort(S.id, a)) : null;
  const cell = (label, value, cls, title) => h('div', null, h('span', null, label), h('b', { class: cls || '', title: title || null }, value));
  const open = () => openOne(a, d, ctx);
  return h('article', { class: 'ww-c open', role: 'button', tabindex: '0', 'aria-label': 'Open ' + a.name, onclick: e => { if (e.target.closest('.lx-def,a,button')) return; open(); }, onkeydown: e => { if ((e.key === 'Enter' || e.key === ' ') && e.target === e.currentTarget) { e.preventDefault(); open(); } } },
    art(a, { kind: KIND(a) }),
    h('div', { class: 'cr-hd' },
      h('div', { class: 'nm' }, h('span', { title: a.name }, a.name)),
      h('div', { class: 'cr-st' }, liveDot(a), sales && a.role ? roleTag(a) : null, by),
      where(a) ? h('div', { class: 'sub', title: where(a) }, where(a)) : null),
    h('div', { class: 'ww-st' },
      cell('Spend', money(a.spend)),
      cell('ROAS', sales ? (a.roas != null ? x(a.roas) : 'none') : '-', !sales || a.roas == null ? 'dim' : roasTone, hint),
      cell('Per sale', !sales ? '-' : a.cpa ? money(a.cpa) : 'no sale', !sales || !a.cpa || early ? 'dim' : over ? 'bad' : '', hint),
      cell('Click rate', p1(a.ctr))));
}
function fmtSort(id, a) {
  return id === 'sales' || id === 'fc' || id === 'lc' ? money(id === 'sales' ? a.tw_sales : id === 'fc' ? a.fc : a.lc)
    : id === 'atc' ? p1(a.atc_rate) : id === 'cpm' ? money(cpmOf(a), { cents: true }) : id === 'hook' ? p0(a.hook) : id === 'newest' ? (a.age + 1) + (a.age === 0 ? ' day' : ' days') : '';
}

function gallery(d, ctx) {
  const box = h('div', { class: 'ww-stack', style: { gap: '16px' } });
  const items = SORTS.filter(s => !s.sales || d.has_sales).filter(s => s.id !== 'hook' || d.ads.some(a => a.hook != null)).filter(s => s.id !== 'newest' || d.ads.some(a => a.age != null));
  let sort = ctx.settingNow('creative.review.sort', 'spend'); if (!items.some(s => s.id === sort)) sort = 'spend';
  let dir = ctx.settingNow('creative.review.dir', (items.find(s => s.id === sort) || {}).low ? 'asc' : 'desc');
  const grid = h('div');
  const goalWords = d.has_sales && (d.goal_roas || d.goal_cpa) ? ` · goal ${[d.goal_roas ? x(d.goal_roas) : null, d.goal_cpa ? money(d.goal_cpa) + ' per sale' : null].filter(Boolean).join(', ')}: red is off goal, gray is under 30 orders` : '';
  const head = secHead('Every ad', `${winOf(ctx) || 'These dates'} · sales ${TW}, spend and clicks Meta${goalWords}`,
    d.has_sales ? segmented([{ id: 'all', label: 'All' }, { id: 'opener', label: 'Openers' }, { id: 'both', label: 'Both' }, { id: 'closer', label: 'Closers' }, { id: 'off', label: 'Off' }], ST.role, id => { ST.role = id; ST.all = false; paint(); }) : null,
    sortMenu({ items, sort, dir, onChange: (id, d2) => { sort = id; dir = d2; ST.all = false; ctx.saveSetting('creative.review.sort', id); ctx.saveSetting('creative.review.dir', d2); paint(); } }));
  const paint = () => {
    const S = SORTS.find(s => s.id === sort) || SORTS[0];
    let list = d.ads.filter(a => ST.role === 'all' || (ST.role === 'off' ? !a.live : a.role === ST.role && a.live));
    list = [...list].sort((p, q) => { const u = S.of(p), v = S.of(q); if (u == null || v == null) return u == null ? (v == null ? (q.spend || 0) - (p.spend || 0) : 1) : -1; return (dir === 'asc' ? u - v : v - u) || (q.spend || 0) - (p.spend || 0); });
    const shown = ST.all ? list : list.slice(0, 15);
    put(grid,
      shown.length ? h('div', { class: 'ww-grid' }, shown.map(a => adCard(a, d, ctx, sort))) : empty({ title: 'No ads in this group', text: 'Pick another group or a longer date range at the top.' }),
      list.length > shown.length ? h('div', { class: 'cr-moreb' }, button(`Show all ${list.length} ads`, { onclick: () => { ST.all = true; paint(); } })) : '');
  };
  paint();
  put(box, head, grid);
  return box;
}

function view(d, ctx) {
  const stop = gate(d, ctx);
  if (stop) return [stop];
  if (!d.ads || !d.ads.length) return [noAds(ctx)];
  for (const a of d.ads) a.role = a.role || roleOf(a, d.goal_cpa);
  d.all = roll(d.ads);
  const live = d.ads.filter(a => a.live);
  const all = d.all, sales = d.has_sales, w = winOf(ctx);
  const by = k => roll(d.ads.filter(a => a.kind === k));
  const still = by('image'), video = by('video');
  const share = g => (all.spend ? g.spend / all.spend : null);
  const off = d.ads.filter(a => !a.live && a.fc > 0).sort((a, b) => b.fc - a.fc);
  const offFc = off.reduce((t, a) => t + a.fc, 0), allFc = d.ads.reduce((t, a) => t + (a.fc || 0), 0);
  const grp = (name, g, key) => h('div', { class: 'ww-g' },
    h('div', { class: 'hd' }, key ? dl(name, key) : name),
    h('div', { class: 'v' }, p0(share(g)), h('small', null, 'of spend')),
    meter(share(g) || 0, null, { max: 1 }),
    figs([['Ads', num(g.ads)], ['Spend', money(g.spend)], sales ? [dl('ROAS', 'roas'), x(g.roas), { cls: g.orders < 30 ? 'dim' : '' }] : null], 3));
  const roles = ['opener', 'both', 'closer'].map(r => ({ r, g: roll(live.filter(a => a.role === r)) }));
  const ask = ctx.isClient ? null : button('Ask why', { iconLeft: 'sparkle', onclick: () => openAskPanel({ route: ctx.route, brand: ctx.brand, title: 'What is every ad doing right now?', range: ctx.range, href: ctx.href('ask', 'index'), context: ctx.askContext }) });
  ctx.askWindow = w || null;
  ctx.askContext = `Creative review for ${ctx.brand.name || 'this brand'}, ${w || 'these dates'}: ${num(d.ads.length)} Meta ads in sales campaigns spent ${money(all.spend)}, ${num(live.length)} live now`
    + (sales ? `, ROAS ${x(all.roas)} (Triple Whale last click)` + (d.goal_roas ? ` against a ${x(d.goal_roas)} goal` : '') : '') + '. Spend and clicks are Meta.';

  return [
    helpBar([
      { title: 'What it is for', text: 'Every Meta ad in a sales campaign that spent on the dates at the top, one card each. Sort by any number, high or low. Tap any ad for everything about it: the picture or video, every number, the funnel, first and last click, the other ads in its ad set, its days, and its words.' },
      { title: 'Openers and closers', text: 'Triple Whale credits each sale twice over: to the first ad the buyer clicked and to the last one. An ad with far more first click sales starts journeys (an opener); one with far more last click sales finishes them (a closer). Hover or tap a dotted word for its meaning.' },
    ], {}, platformChip('meta'), h('span', { class: 'cr-quiet' }, 'Meta ads in sales campaigns')),
    tileRow([
      kpi({ label: 'Ads live now', value: num(live.length), sub: `${num(d.ads.length)} spent on these dates`, window: 'Last 2 days', source: 'Meta' }),
      kpi({ label: 'Spend', value: money(all.spend), window: w, source: 'Meta' }),
      kpi({ label: dl('ROAS', 'roas'), value: sales ? x(all.roas) : h('small', null, 'No sales source connected'), sub: sales && d.goal_roas ? 'Goal ' + x(d.goal_roas) : null, window: w, source: sales ? TW : null }),
      kpi({ label: dl('Cost per sale', 'cpa'), value: sales && all.cpa ? money(all.cpa) : h('small', null, 'No sales source connected'), sub: d.goal_cpa ? 'Goal ' + money(d.goal_cpa) : null, window: w, source: sales ? TW : null }),
    ], 4),
    d.read ? takeaway(rich(d.read), { action: ask }) : null,
    card({ class: 'ww-cd', title: 'Where the spend goes', note: sourceLine(w, sales ? 'format from Meta, roles from Triple Whale first and last click' : 'Meta') },
      h('div', { class: 'ww-stack', style: { gap: '24px', marginTop: '16px' } },
        h('div', { class: 'ww-q' },
          h('div', { class: 'meta' }, h('h3', null, 'Still or video'), 'Every ad that spent'),
          h('div', { class: 'ww-gs' }, grp('Still', still), grp('Video', video))),
        sales ? h('div', { class: 'ww-q' },
          h('div', { class: 'meta' }, h('h3', null, 'Opens or closes'), 'Live ads only'),
          h('div', { class: 'ww-gs' }, roles.map(({ r, g }) => grp({ opener: 'Openers', both: 'Both', closer: 'Closers' }[r], g, r)))) : null)),
    sales && off.length ? card({ class: 'ww-cd', title: 'Opened journeys, now off', note: sourceLine(w, 'Triple Whale, first click'),
      action: findingButton(ctx, () => ({
        say: [h('b', null, p0(allFc ? offFc / allFc : null)), ' of first click sales came from ads that are now off. Nothing live is replacing them.'],
        measure: 'first click sales', proof: off.slice(0, 2).map(a => ({ value: a.fc, text: money(a.fc, { compact: true }), name: a.name, sub: KIND(a).toLowerCase() })),
        brief: { title: 'New openers', make: 'Three new videos shaped like the openers that are off', why: 'The live ads mostly close sales. Journeys need new ads that start them.', format: 'Video, 9:16 and 4:5', count: 3 }, board: d.board,
      }), 'Brief new openers') },
      h('div', { class: 'cr-off' },
        figs([[dl('First click sales from ads that are off', 'first_click'), money(offFc)], ['Share of all first click sales', p0(allFc ? offFc / allFc : null)]], 2),
        h('div', { class: 'ww-thumbs cr-offt' }, off.slice(0, 6).map(a => adThumb(ctx, d, a, a.name + ', ' + money(a.fc) + ' first click'))))) : null,
    gallery(d, ctx),
  ].filter(Boolean);
}

const CSS = `
.cr-quiet{font-size:13px;color:var(--muted)}
.cr-role{height:22px;font-size:11.5px}
.cr-hd{display:grid;gap:4px;min-width:0}
.cr-st{display:flex;align-items:center;gap:8px;min-width:0;font-size:12.5px}
.cr-st .lx-stat{font-size:12.5px}
.cr-by{margin-left:auto;padding:1px 7px;border-radius:var(--r-chip,6px);background:var(--bg-sunk);color:var(--ink-2);font-size:11.5px;font-variant-numeric:tabular-nums;white-space:nowrap}
.cr-moreb{display:flex;justify-content:center}
.cr-more{display:grid;gap:12px;min-width:0;padding-top:var(--gap-5,24px);border-top:1px solid var(--line)}
.cr-more h3{font-size:var(--fs-section,17px);font-weight:600;margin:0}
.cr-facts{display:grid;gap:0;margin:0}
.cr-facts>div{display:grid;grid-template-columns:110px minmax(0,1fr);gap:12px;padding:9px 0;border-top:1px solid var(--line);font-size:13.5px}
.cr-facts dt{color:var(--muted)}
.cr-facts dd{margin:0;overflow-wrap:anywhere}
.cr-acts{display:flex;align-items:center;gap:10px;flex-wrap:wrap}
.cr-off{display:grid;gap:16px;margin-top:14px}
.cr-off .ww-figs{max-width:520px}
.cr-offt{gap:14px}
.cr-offt>*{width:110px}
.cr-offt small{white-space:normal;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
@media (max-width:759px){.cr-facts>div{grid-template-columns:90px minmax(0,1fr)}.cr-offt>*{width:92px}}
`;

export default {
  title: ['What is every ad ', em('doing right now?')],
  eyebrow: 'Creative',
  load: ctx => loadAds(ctx, { covers: true }),
  skeleton(el) { put(el, skeleton('kpi', 4), skeleton('chart'), skeleton('row', 4)); },
  render(el, d, ctx) {
    css();
    if (!document.getElementById('cr-rv-css2')) { const st = document.createElement('style'); st.id = 'cr-rv-css2'; st.textContent = CSS; document.head.append(st); }
    put(el, ...view(d, ctx));
  },
};

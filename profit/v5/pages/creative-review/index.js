/* Creative > Creative review. "What is every ad doing right now?"
   Meta ads in sales campaigns only. One compact card per ad: the picture, its campaign and ad set, spend, ROAS, cost per
   sale and click rate. A card opens the ad's detail sheet (kit sheet: centered on a desktop, from the bottom on a phone)
   with every figure the page has for it: Triple Whale sales on first click and on last click, Meta's own order count
   beside Triple Whale's, CPM, impressions, hook and hold rate, the words that run with it and where it sends people.
   The gallery sorts by any of those figures.
   Live data: GET /api/hub/creative (profit worker) and GET /api/ad-creatives (account-health) for the covers and words.
   No new request: the sheet draws from what loadAds already read.
   No patterns across ads here: those live in What works. */

import { APP_NAME } from '../../config.js';
import { put, safeHref } from '../../kit.js';
import { h, card, kpi, kpis, hero, takeaway, segmented, button, em, platformChip, sheet, money, num, x, skeleton, empty } from '../../kit.js';
import { openAskPanel } from '../../askpanel.js';
import { css, art, gate, noAds, loadAds, roleOf, roll, meter, findingButton, statusDot, p1, p0, dl, def, helpBar, figs, teamTag } from '../what-works/_ww.js';

const ROLE = { opener: 'Opener', closer: 'Closer', both: 'Both', thin: 'Too early' };
const KIND = a => (a.kind === 'video' ? (a.maker === 'creator' ? 'Creator video' : 'Video') : 'Still');
const day = d => (d ? new Date(d + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '');
const rich = parts => (Array.isArray(parts) ? parts.map(q => (q && q.b ? h('b', null, q.b) : q)) : parts);
const cpmOf = a => (a.impressions ? a.spend / a.impressions * 1000 : null);
const ST = { sort: 'spend', role: 'all', all: false };
const where = a => [a.campaign, a.set].filter(Boolean).join(' > ');

/* the sorts: every figure the page reads. asc = lower is better (sorted low first); no figure sorts last */
const SORTS = [
  { id: 'spend', label: 'Spend', of: a => a.spend },
  { id: 'sales', label: 'Sales', of: a => a.tw_sales, sales: true },
  { id: 'roas', label: 'ROAS', of: a => a.roas, sales: true },
  { id: 'cpa', label: 'Cost per sale', of: a => a.cpa || null, asc: true, sales: true },
  { id: 'ctr', label: 'Click rate', of: a => a.ctr },
  { id: 'atc', label: 'Add to cart rate', of: a => a.atc_rate },
  { id: 'cpm', label: 'CPM', of: cpmOf, asc: true },
  { id: 'hook', label: 'Hook rate (videos)', of: a => a.hook },
  { id: 'fc', label: 'First click sales', of: a => a.fc, sales: true },
  { id: 'lc', label: 'Last click sales', of: a => a.lc, sales: true },
];

/* one short read per ad, for the detail sheet */
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
  if (a.meta_orders > 2 && a.meta_orders >= (a.tw_orders || 0) * 1.5) out.push('Meta counts far more orders than Triple Whale does.');
  return out.slice(0, 2).join(' ');
}

const roleTag = a => (a.role ? def(h('span', { class: 'lx-chip cr-role' }, ROLE[a.role]), a.role) : null);
const liveDot = a => { const el = a.live ? statusDot('good', 'Live') : statusDot('off', 'Off'); el.title = a.live ? 'Spent in the last 2 days' : 'No spend in the last 2 days, last spent ' + day(a.last_day); return el; };
function cpaCell(a, d) {
  const sales = d.has_sales, over = sales && d.goal_cpa && a.cpa > d.goal_cpa * 1.5;
  const b = h('b', { class: !sales || !a.cpa ? 'dim' : over ? 'bad' : '' }, !sales ? 'no data' : a.cpa ? money(a.cpa) : 'no sale');
  if (over) b.title = 'Over 1.5x the ' + money(d.goal_cpa) + ' goal';
  return b;
}

/* ---------- the detail sheet ---------- */
function openAd(a, d, ctx) {
  const sales = d.has_sales;
  const top = Math.max(1, a.fc || 0, a.lc || 0);
  const w = v => Math.max(0, Math.min(100, 100 * (v || 0) / top)).toFixed(0) + '%';
  const cell = (key, label, value, o) => [dl(label, key), value, o];
  const over = sales && d.goal_cpa && a.cpa > d.goal_cpa * 1.5;
  const stats = [
    cell('spend', 'Spend', money(a.spend)),
    cell('tw_sales', 'Sales', sales ? money(a.tw_sales) : 'no data'),
    cell('tw_orders', 'Orders', sales ? num(a.tw_orders) : 'no data'),
    cell('roas', 'ROAS', sales ? x(a.roas) : 'no data', { cls: sales && d.goal_roas && a.roas != null ? (a.roas >= d.goal_roas ? 'pos' : '') : 'dim' }),
    cell('cpa', 'Cost per sale', !sales ? 'no data' : a.cpa ? money(a.cpa) : 'no sale', { cls: over ? 'bad' : '' }),
    cell('click_rate', 'Click rate', p1(a.ctr)),
    cell('atc_rate', 'Add to cart rate', a.atc_rate == null ? 'no data' : p1(a.atc_rate)),
    cell('cpm', 'CPM', cpmOf(a) == null ? 'no data' : money(cpmOf(a), { cents: true })),
    cell('impressions', 'Impressions', a.impressions == null ? 'no data' : num(a.impressions)),
    a.kind === 'video' ? cell('hook_rate', 'Hook rate', a.hook == null ? 'no data' : p0(a.hook)) : null,
    a.kind === 'video' ? cell('hold_rate', 'Hold rate', a.hold == null ? 'no data' : p0(a.hold)) : null,
  ];
  const facts = [['Campaign', a.campaign], ['Ad set', a.set], ['Headline', a.headline], ['Primary text', a.body],
    ['Goes to', a.link && !safeHref(a.link) ? a.link : a.link ? h('a', { href: safeHref(a.link), target: '_blank', rel: 'noopener noreferrer' }, a.link.replace(/^https?:\/\//, '')) : null],
    ['Last spent', a.last_day ? day(a.last_day) : null]].filter(f => f[1]);
  const body = h('div', { class: 'cr-one' },
    h('div', { class: 'cr-hd' }, platformChip('meta'), h('span', { class: 'note' }, 'Meta ads, sales campaigns, the dates at the top'), h('span', { class: 'sp' }), roleTag(a), liveDot(a)),
    h('div', { class: 'cr-top' },
      h('div', { class: 'cr-pic' }, art(a, { kind: KIND(a), ratio: a.kind === 'video' ? '9/16' : '4/5' })),
      figs(stats.filter(Boolean), 2)),
    sales ? h('section', { class: 'cr-sec' },
      h('h3', null, 'Where it sits in the journey'),
      h('div', { class: 'ww-3' },
        h('div', { class: 'r' }, dl('First click', 'first_click'), h('span', { class: 't' }, h('i', { class: 's', style: { '--v': w(a.fc) } })), h('b', null, money(a.fc))),
        h('div', { class: 'r' }, dl('Last click', 'last_click'), h('span', { class: 't' }, h('i', { style: { '--v': w(a.lc) } })), h('b', null, money(a.lc))),
        h('div', { class: 'cnt' }, h('span', null, dl('Orders, Triple Whale', 'tw_orders'), ' ', h('b', null, num(a.tw_orders))), h('span', null, dl('Meta says', 'meta_orders'), ' ', h('b', null, num(a.meta_orders))))))
      : h('p', { class: 'cr-quiet' }, 'No sales source is connected. ', dl('Meta says', 'meta_orders'), ' ' + num(a.meta_orders) + ' orders.'),
    h('p', { class: 'ww-say' }, h('span', { class: 'lx-cap' }, APP_NAME + ' AI'), readOf(a, d)),
    facts.length ? h('dl', { class: 'cr-facts' }, facts.map(([k, v]) => h('div', null, h('dt', null, k), h('dd', null, v)))) : null,
    ctx.isClient ? null : h('div', { class: 'cr-acts' }, findingButton(ctx, () => ({
      say: [h('b', null, a.name), sales && a.cpa ? ` brings a sale for ${money(a.cpa)}` + (d.goal_cpa ? ` against a ${money(d.goal_cpa)} goal.` : '.') : ' is one of the ads people click most.'],
      measure: 'click rate', proof: [{ value: a.ctr, text: p1(a.ctr), name: a.name, sub: KIND(a).toLowerCase() }],
      normal: { value: d.all.ctr, text: p1(d.all.ctr), name: 'Normal', sub: 'all ads' },
      brief: { title: 'Next version of ' + a.name, make: 'Three new versions that keep what works in ' + a.name, why: readOf(a, d), format: a.kind === 'video' ? 'Video, 9:16 and 4:5' : 'Still, 4:5 and 1:1', count: 3, by: a.by || null },
      board: d.board,
    }), 'Brief the next version', { primary: true }), teamTag()));
  sheet({ title: a.name, body });
}

/* ---------- one card ---------- */
function adCard(a, d, ctx) {
  const sales = d.has_sales;
  const open = () => openAd(a, d, ctx);
  return h('article', { class: 'ww-c open', role: 'button', tabindex: '0', 'aria-label': 'Open ' + a.name, onclick: open, onkeydown: e => { if ((e.key === 'Enter' || e.key === ' ') && e.target === e.currentTarget) { e.preventDefault(); open(); } } },
    art(a, { kind: KIND(a) }),
    h('div', null,
      h('div', { class: 'nm' }, h('span', null, a.name), liveDot(a)),
      where(a) ? h('div', { class: 'sub' }, where(a)) : null),
    h('div', { class: 'ww-st' },
      h('div', null, h('span', null, 'Spend'), h('b', null, money(a.spend))),
      h('div', null, h('span', null, 'ROAS'), h('b', { class: !sales || a.roas == null ? 'dim' : '' }, sales ? x(a.roas) : 'no data')),
      h('div', null, h('span', null, 'Cost per sale'), cpaCell(a, d)),
      h('div', null, h('span', null, 'Click rate'), h('b', null, p1(a.ctr)))),
    sales && a.role ? h('div', { class: 'cr-ft' }, roleTag(a)) : null);
}

function gallery(d, ctx) {
  const box = h('div', { class: 'ww-stack', style: { gap: '16px' } });
  const list0 = SORTS.filter(s => !s.sales || d.has_sales).filter(s => s.id !== 'hook' || d.ads.some(a => a.hook != null));
  if (!list0.some(s => s.id === ST.sort)) ST.sort = 'spend';
  const pick = h('select', { class: 'lx-input cr-sort', 'aria-label': 'Sort the ads by', onchange: e => { ST.sort = e.target.value; ST.all = false; paint(); } },
    list0.map(s => h('option', { value: s.id, selected: s.id === ST.sort || null }, s.label + (s.asc ? ', lowest first' : ''))));
  const paint = () => {
    const S = SORTS.find(s => s.id === ST.sort) || SORTS[0];
    let list = d.ads.filter(a => ST.role === 'all' || (ST.role === 'off' ? !a.live : a.role === ST.role && a.live));
    list = [...list].sort((p, q) => { const u = S.of(p), v = S.of(q); if (u == null || v == null) return u == null ? (v == null ? 0 : 1) : -1; return S.asc ? u - v : v - u; });
    const shown = ST.all ? list : list.slice(0, 15);
    put(box,
      h('div', { class: 'lx-sec' }, h('h3', null, 'Every ad'), h('span', { class: 'note' }, `${shown.length} of ${list.length} shown. Tap an ad for all its numbers.`)),
      h('div', { class: 'ww-bar' },
        h('label', { class: 'cr-sortl' }, h('span', null, 'Sort by'), pick),
        d.has_sales ? segmented([{ id: 'all', label: 'All' }, { id: 'opener', label: 'Openers' }, { id: 'both', label: 'Both' }, { id: 'closer', label: 'Closers' }, { id: 'off', label: 'Off' }], ST.role, id => { ST.role = id; ST.all = false; paint(); }) : null),
      shown.length ? h('div', { class: 'ww-grid' }, shown.map(a => adCard(a, d, ctx))) : empty({ title: 'No ads in this group' }),
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
  const grp = (name, g, key) => h('div', { class: 'ww-g' },
    h('div', { class: 'hd' }, key ? dl(name, key) : name),
    h('div', { class: 'v' }, p0(share(g)), h('small', null, 'of spend')),
    meter(share(g) || 0, null, { max: 1 }),
    figs([['Ads', num(g.ads)], ['Spend', money(g.spend)], sales ? [dl('ROAS', 'roas'), x(g.roas), { cls: g.orders < 30 ? 'dim' : '' }] : null], 3));
  const roles = ['opener', 'both', 'closer'].map(r => ({ r, g: roll(live.filter(a => a.role === r)) }));
  const ask = ctx.isClient ? null : button('Ask why', { iconLeft: 'sparkle', onclick: () => openAskPanel({ route: ctx.route, brand: ctx.brand, title: 'What is every ad doing right now?', range: ctx.range, href: ctx.href('ask', 'index') }) });

  return [
    helpBar([
      { title: 'What it is for', text: 'Every Meta ad in a sales campaign that spent on the dates at the top, one card each. Tap a card for all of that ad\'s numbers, its words and where it sends people.' },
      { title: 'Openers and closers', text: 'Triple Whale credits each sale twice over: to the first ad the buyer clicked and to the last one. An ad with far more first click sales starts journeys (an opener); one with far more last click sales finishes them (a closer). Hover or tap a dotted word for its meaning.' },
    ], {}, platformChip('meta'), h('span', { class: 'cr-quiet' }, 'Meta ads, sales campaigns')),
    hero({ line: true }, kpis([
      kpi({ label: dl('Ads live now', 'live'), value: num(live.length), sub: `${num(d.ads.length)} spent on these dates` }),
      kpi({ label: dl('Spend', 'spend'), value: money(all.spend) }),
      kpi({ label: dl('ROAS', 'roas'), value: sales ? x(all.roas) : 'no data', sub: sales ? (d.goal_roas ? 'goal ' + x(d.goal_roas) : null) : 'no sales source connected' }),
      kpi({ label: dl('Cost per sale', 'cpa'), value: sales && all.cpa ? money(all.cpa) : 'no data', sub: d.goal_cpa ? 'goal ' + money(d.goal_cpa) : null }),
    ], { cols: 4 })),
    d.read ? takeaway(rich(d.read), { action: ask }) : null,
    card({ class: 'ww-cd', title: 'Where the spend goes', note: 'by what the ad is, and by what it does' },
      h('div', { class: 'ww-stack', style: { gap: '24px', marginTop: '16px' } },
        h('div', { class: 'ww-q' },
          h('div', { class: 'meta' }, h('h3', null, 'Still or video'), 'Format, from Meta itself'),
          h('div', { class: 'ww-gs' }, grp('Still', still), grp('Video', video))),
        sales ? h('div', { class: 'ww-q' },
          h('div', { class: 'meta' }, h('h3', null, 'Opens or closes'), 'Live ads only, from Triple Whale first click against last click sales'),
          h('div', { class: 'ww-gs' }, roles.map(({ r, g }) => grp({ opener: 'Openers', both: 'Both', closer: 'Closers' }[r], g, r)))) : null)),
    sales && off.length ? card({ class: 'ww-cd', title: 'Opened journeys, now off', note: 'Ads that started journeys and no longer spend',
      action: findingButton(ctx, () => ({
        say: [h('b', null, p0(allFc ? offFc / allFc : null)), ' of first click sales came from ads that are now off. Nothing live is replacing them.'],
        measure: 'first click sales', proof: off.slice(0, 2).map(a => ({ value: a.fc, text: money(a.fc, { compact: true }), name: a.name, sub: KIND(a).toLowerCase() })),
        brief: { title: 'New openers', make: 'Three new videos shaped like the openers that are off', why: 'The live ads mostly close sales. Journeys need new ads that start them.', format: 'Video, 9:16 and 4:5', count: 3 }, board: d.board,
      }), 'Brief new openers') },
      h('div', { class: 'cr-off' },
        figs([[dl('First click sales from ads that are off', 'first_click'), money(offFc)], ['Share of all first click sales', p0(allFc ? offFc / allFc : null)]], 2),
        h('div', { class: 'ww-thumbs cr-offt' }, off.slice(0, 6).map(a => h('button', { type: 'button', class: 'cr-mini', onclick: () => openAd(a, d, ctx), 'aria-label': 'Open ' + a.name }, art(a), h('small', null, a.name), h('small', null, money(a.fc) + ' first click')))))) : null,
    gallery(d, ctx),
  ].filter(Boolean);
}

const CSS = `
.cr-quiet{font-size:13px;color:var(--muted)}
.cr-sortl{display:inline-flex;align-items:center;gap:8px;font-size:13px;color:var(--muted)}
.cr-sort{height:34px;width:auto;min-width:200px;font-size:13.5px}
.cr-role{height:22px;font-size:11.5px}
.cr-ft{display:flex;align-items:center;gap:8px;margin-top:auto}
.ww-c .nm .lx-stat{margin-left:auto;flex:none;font-size:11.5px;padding-top:1px}
.cr-one{display:grid;gap:20px;min-width:0}
.cr-hd{display:flex;align-items:center;gap:10px;flex-wrap:wrap}
.cr-hd .note{font-size:12.5px;color:var(--muted)}
.cr-hd .sp{flex:1 1 auto}
.cr-top{display:grid;grid-template-columns:220px minmax(0,1fr);gap:24px;align-items:start}
.cr-pic .ww-art{--art-max:360px}
.cr-sec{display:grid;gap:10px}
.cr-sec h3{font-size:14.5px;font-weight:600}
.cr-sec .ww-3 .r{grid-template-columns:110px 1fr auto}
.cr-facts{display:grid;gap:0;margin:0}
.cr-facts>div{display:grid;grid-template-columns:110px minmax(0,1fr);gap:12px;padding:9px 0;border-top:1px solid var(--line);font-size:13.5px}
.cr-facts dt{color:var(--muted)}
.cr-facts dd{margin:0;overflow-wrap:anywhere}
.cr-acts{display:flex;align-items:center;gap:10px;flex-wrap:wrap}
.cr-off{display:grid;gap:16px;margin-top:14px}
.cr-off .ww-figs{max-width:520px}
.cr-offt{gap:14px}
.cr-offt>.cr-mini{width:96px;padding:0;border:0;background:none;text-align:left;cursor:pointer;font:inherit;color:inherit}
@media (max-width:759px){.cr-top{grid-template-columns:minmax(0,1fr)}.cr-pic{max-width:240px}.cr-sort{min-width:0;flex:1}.cr-sortl{flex:1 1 100%}}
`;

export default {
  title: ['What is every ad ', em('doing right now?')],
  eyebrow: 'Creative',
  load: ctx => loadAds(ctx, { covers: true }),
  skeleton(el) { put(el, skeleton('kpi', 4), skeleton('chart'), skeleton('row', 4)); },
  render(el, d, ctx) {
    css();
    if (!document.getElementById('cr-rv-css')) { const st = document.createElement('style'); st.id = 'cr-rv-css'; st.textContent = CSS; document.head.append(st); }
    put(el, ...view(d, ctx));
  },
};

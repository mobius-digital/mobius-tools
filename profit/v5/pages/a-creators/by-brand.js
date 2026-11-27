/* Agency > Creators > By brand. "Which brand's creators need us today?"
   One card per brand with a creator program: active creators, videos running as ads, videos waiting for a yes,
   plus approved videos not launched yet and what creator ads cost per sale against the goal. Most waiting first.
   A card opens a sheet with the last 7 and 30 days and the ways into that brand's own Creators pages. Read only.
   Data, account-health worker:
     GET /api/trybe/scorecard          every brand with a creator program: spend, sales, cost per sale, goal,
                                       videos in, approved, launched (7 and 30 days), active creators
     GET /api/trybe?act=<brand id>     once per brand WITH a creator program: counts.pending (waiting for a yes),
                                       counts.live, counts.not_launched, counts.oldest, counts.rebook
     GET /api/trybe?act=all            which brands have a program (keyedBrands in creators/_cr.js, a saved copy
                                       after the first visit), so the others are never asked
   The scorecard and the per-brand counts are two parts: the page paints when the first lands and fills the
   other in (pages/_parts.js).
   A brand whose creators run in their own app has no /api/trybe answer: its live and waiting counts read
   "not read here", never 0. Sales are Triple Whale (last platform click); spend is Meta's. */

import { h, kpi, tiles, em, money, num, x, button, statusDot, empty, skeleton, sheet, addStyles, barChart, platformChip } from '../../kit.js';
import { defined, defLabel } from '../../defs.js';
import { APP_NAME } from '../../config.js';
import { put, css, plural, pageTop } from '../production/_ui.js';
import { crCss, keyedBrands } from '../creators/_cr.js';
import { loadParts, follow, late, dots, reading } from '../_parts.js';
import { acCss, perBrand, brandOf, brandName, brandPage, oldCreators, todayStr, notRead } from './to-review.js';

const CSS = `
.ab-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:18px}
.ab-card{display:grid;gap:16px;align-content:start;text-align:left;min-width:0;padding:20px 22px;border:0;border-radius:var(--r-card,16px);background:var(--surface);box-shadow:var(--sh-1);color:inherit;font:inherit;cursor:pointer}
.ab-card:hover{box-shadow:var(--sh-2,var(--sh-1))}
.ab-card:focus-visible{outline:2px solid var(--ink);outline-offset:2px}
.ab-top{display:flex;align-items:center;gap:10px;min-width:0;flex-wrap:nowrap}
.ab-top .ac-brand{font-size:var(--fs-card,14px);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1 1 auto;min-width:0}
.ab-top .lx-stat{flex:none;white-space:nowrap;font-size:12px}
.ab-nums{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;align-items:start}
.ab-nums>span{display:grid;gap:2px;min-width:0;align-content:start;grid-template-rows:18px 30px auto}
.ab-nums span>.lx-def,.ab-nums em{align-self:start;line-height:18px}
.ab-nums em{font-style:normal;font-size:var(--fs-colhead,11.5px);font-weight:500;color:var(--muted)}
.ab-nums b{font-size:var(--num-l);font-weight:600;letter-spacing:-.03em;line-height:1.1;font-variant-numeric:tabular-nums}
.ab-nums b.none{color:var(--faint);font-weight:500}
.ab-nums em{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.ab-nums b.hot{color:var(--bad)}
.ab-nums small{font-size:12px;color:var(--muted);line-height:1.3}
.ab-m{display:grid;gap:8px;padding-top:12px;border-top:1px solid var(--line)}
.ab-m .h{font-size:12px;font-weight:600;color:var(--muted)}
.ab-m .f{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px}
.ab-m .f>div{display:grid;gap:1px;min-width:0}
.ab-m .f span{font-size:11.5px;color:var(--muted)}
.ab-m .f b{font-size:var(--num-s);white-space:nowrap;font-weight:600;font-variant-numeric:tabular-nums}
.ab-m .f b.bad{color:var(--bad)}.ab-m .f b.good{color:var(--good)}
.ab-sh{display:grid;gap:18px;min-width:0}
.ab-cmp{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:16px}
.ab-cmp h4{margin:0 0 4px;font-size:13px;font-weight:600}
.ab-hd{display:flex;align-items:center;gap:10px;flex-wrap:wrap}
.ab-hd .lx-stat{margin-left:auto}
.ab-old{font-size:12.5px;color:var(--muted)}.ab-old:hover{text-decoration:underline;text-underline-offset:3px}
.ab-line{display:grid;gap:4px;padding-top:12px;border-top:1px solid var(--line);font-size:12.5px;color:var(--muted);line-height:1.45}
.ab-line b{color:var(--ink-2);font-weight:600}
.ab-tbl{display:grid;gap:0;font-size:13.5px}
.ab-tbl>div{display:grid;grid-template-columns:minmax(0,1.4fr) minmax(0,1fr) minmax(0,1fr);gap:12px;padding:9px 0;border-top:1px solid var(--line);font-variant-numeric:tabular-nums}
.ab-tbl>div:first-child{border-top:0;font-size:var(--fs-colhead,11.5px);font-weight:600;color:var(--muted)}
.ab-tbl>div>span:not(:first-child){text-align:right}
.ab-tbl>div>span:first-child{color:var(--muted)}
.ab-go{display:grid;gap:8px}
.ab-go .lx-btn{justify-content:space-between}
@media (max-width:1180px){.ab-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}
@media (max-width:759px){
  .ab-grid{grid-template-columns:minmax(0,1fr);gap:12px}
  .ab-card{padding:18px}
  .ab-nums b{font-size:var(--num-m)}
  .ab-cmp{grid-template-columns:1fr}
}
`;
const abCss = () => addStyles('ab-css', CSS);

const known = v => v != null && Number.isFinite(+v);
/** A number, or plain words when it could not be read. Never a made-up zero. */
const OWN = { name: 'Counted in their own app', definition: 'This brand runs its creators in its own creator app, so Locus cannot read the count here.' };
/* an empty value is a quiet dash at the same size as the numbers beside it, so the row stays level; the words are on hover */
const figure = (v, { hot = false, none = 'Not read here', wait = false, own = false } = {}) => known(v) ? h('b', { class: hot && +v > 0 ? 'hot' : null }, num(+v)) : wait ? h('b', null, dots())
  : own ? h('b', { class: 'none', title: OWN.definition, 'aria-label': OWN.definition }, '-') : h('b', { class: 'none', title: none, 'aria-label': none }, '-');
const DEFS = {
  creators: { name: 'Creators', definition: 'Creators who sent this brand a video in the last 30 days.' },
  live: { name: 'Live videos', definition: 'Creator videos that ran as Meta ads in the last 30 days.' },
  waiting: { name: 'Waiting', definition: 'Videos waiting for a yes in the creator platform right now.' },
  cpa: { name: 'Cost per sale', definition: 'Creator ad spend on Meta divided by Triple Whale sales (last platform click), against the brand\'s goal cost per sale.' },
};
/** Spend, Sales, Cost per sale vs goal, ROAS for one window. */
function mfigs(m) {
  const over = known(m.cpa) && known(m.goal_cpa) ? +m.cpa > +m.goal_cpa : null;
  return h('div', { class: 'f' },
    h('div', null, h('span', null, 'Spend'), h('b', null, money(Math.round(+m.spend || 0)))),
    h('div', null, h('span', null, 'Sales'), h('b', null, num(+m.orders || 0))),
    h('div', null, defLabel('Per sale', DEFS.cpa, { tag: 'span' }), h('b', { class: over == null ? '' : over ? 'bad' : 'good', title: known(m.goal_cpa) ? 'Goal ' + money(+m.goal_cpa) + (over ? ': over goal' : ': on goal') : null }, known(m.cpa) ? money(Math.round(+m.cpa)) : 'none')),
    h('div', null, h('span', null, 'ROAS'), h('b', null, known(m.roas) ? x(+m.roas) : 'none')));
}
const sum = (rows, f) => rows.reduce((s, r) => s + (known(f(r)) ? +f(r) : 0), 0);

/** Creator ads against the brand's goal cost per sale, last 30 days. */
function goalDot(r) {
  const m = r.last_30 || {};
  if (!known(m.spend) || +m.spend <= 0) return statusDot('off', 'No creator ads ran');
  if (!known(m.cpa)) return statusDot('off', 'No sales yet');
  if (!known(m.goal_cpa)) return null;
  return +m.cpa <= +m.goal_cpa ? statusDot('good', 'On goal ' + money(Math.round(+m.goal_cpa)) + ' per sale') : statusDot('bad', 'Over goal ' + money(Math.round(+m.goal_cpa)) + ' per sale');
}

/** Scorecard cards and per-brand counts, joined on the brand id. */
function rowsOf(data) {
  const by = new Map();
  for (const c of (data && data.cards) || []) by.set(c.act_id, { act_id: c.act_id, name: c.name, scored: true, own_app: c.source && c.source !== 'trybe', creators_active: c.creators_active, last_7: c.last_7 || null, last_30: c.last_30 || null, waiting_launch: c.waiting });
  for (const p of (data && data.brands) || []) {
    const r = by.get(p.act_id) || { act_id: p.act_id, name: p.name };
    r.counts = p.counts || null; r.account = p.account || null; r.synced_at = p.synced_at || null;
    by.set(p.act_id, r);
  }
  return [...by.values()].map(r => {
    const c = r.counts || {};
    return { ...r,
      creators: known(r.creators_active) ? +r.creators_active : known(c.creators) ? +c.creators : null,
      live: known(c.live) ? +c.live : null,
      pending: known(c.pending) ? +c.pending : null,
      not_launched: known(c.not_launched) ? +c.not_launched : known(r.waiting_launch) ? +r.waiting_launch : null,
      oldest: known(c.oldest) ? +c.oldest : null, stale: known(c.stale) ? +c.stale : null, rebook: known(c.rebook) ? +c.rebook : null };
  }).filter(r => r.scored || r.pending > 0 || r.live > 0 || r.not_launched > 0 || (data && data.wait_score && r.counts))   /* a connected brand with nothing at all is left off, as the scorecard does */
    .sort((a, b) => (b.pending ?? -1) - (a.pending ?? -1) || (b.not_launched ?? -1) - (a.not_launched ?? -1) || (b.creators ?? -1) - (a.creators ?? -1));
}

const cell = v => (v == null || v === '' ? 'none' : v);
function openBrand(ctx, r) {
  const a = r.last_7 || {}, b = r.last_30 || {};
  const row = (label, f) => h('div', null, h('span', null, label), h('span', null, cell(f(a))), h('span', null, cell(f(b))));
  const has = r.last_7 || r.last_30;
  const go = (label, tab) => { const to = brandPage(ctx, r.act_id, tab); return to ? button(label, { href: to, icon: 'arrow', primary: true }) : null; };
  const old = ctx.isClient ? null : oldCreators(r.act_id);
  /* 7 against 30 days, as a daily rate so the two windows compare */
  const cmp = (label, f, fmt, goal) => { const v7 = known(f(a)) ? +f(a) : null, v30 = known(f(b)) ? +f(b) : null;
    if (v7 == null && v30 == null) return null;
    return h('div', null, h('h4', null, label), barChart({ values: [v7 || 0, v30 || 0], labels: ['Last 7 days', 'Last 30 days'], format: fmt, valueLabels: v => fmt(v), height: 140, phoneHeight: 130, axis: false, name: label,
      goal: goal ? { value: goal, label: 'Goal ' + fmt(goal) } : null, label: label + ', 7 against 30 days' })); };
  const go1 = go('Open this brand\'s creators', 'videos');
  const sh = sheet({ title: (brandOf(ctx, r.act_id) || {}).name || r.name || 'Brand', class: 'cr-sheet', body: h('div', { class: 'ab-sh' },
    h('div', { class: 'ab-hd' }, platformChip('meta'), h('span', { class: 'cr-quiet' }, 'Creator ads on Meta'), goalDot(r)),
    has ? h('div', { class: 'ab-cmp' },
      cmp('Spend a day', m => (known(m.spend) ? +m.spend / (m === a ? 7 : 30) : null), v => money(v)),
      cmp('Sales a day', m => (known(m.orders) ? +m.orders / (m === a ? 7 : 30) : null), v => num(v, 1)),
      cmp('Cost per sale', m => m.cpa, v => money(v), known(b.goal_cpa) ? +b.goal_cpa : null)) : null,
    h('div', { class: 'ab-line' },
      known(r.not_launched) ? h('span', null, h('b', null, plural(r.not_launched, 'approved video')), ' not launched yet' + (r.not_launched && known(r.oldest) ? ', oldest ' + plural(r.oldest, 'day') : '')) : null,
      known(r.rebook) && r.rebook > 0 ? h('span', null, h('b', null, plural(r.rebook, 'creator')), ' to book again') : null),
    has ? h('div', { class: 'ab-tbl' },
      h('div', null, h('span', null, 'Creator ads'), h('span', null, '7 days'), h('span', null, '30 days')),
      row('Videos sent in', m => known(m.videos_in) ? num(m.videos_in) : null),
      row('Approved', m => known(m.approved) ? num(m.approved) : null),
      row('Launched as ads', m => known(m.launched) ? num(m.launched) : null),
      row('Spend', m => known(m.spend) ? money(m.spend) : null),
      row('Sales', m => known(m.orders) ? num(m.orders) : null),
      row('Cost per sale', m => known(m.cpa) ? money(m.cpa) : null),
      row('Goal cost per sale', m => known(m.goal_cpa) ? money(m.goal_cpa) : null),
      row('ROAS', m => known(m.roas) && known(m.spend) && +m.spend > 0 ? x(m.roas) : null))
      : h('p', { class: 'cr-quiet' }, 'No creator ad numbers for this brand in the last 30 days.'),
    h('div', { class: 'lx-row' }, go1, old ? h('a', { class: 'ab-old', href: old, target: '_blank', rel: 'noopener noreferrer', title: 'Opens old ' + APP_NAME + ' in a new tab' }, 'Old ' + APP_NAME) : null)) });
  window.addEventListener('hashchange', () => sh.close(), { once: true });   // a link inside the sheet moves on: the sheet goes with it
}

/** The parts that have landed, in the one shape the page and the sample fixture share. */
function shape(d) {
  if (!d || !d.parts) return d;
  const s = d.parts.score, c = d.parts.counts;
  return { today: (s && s.today) || todayStr(), cards: (s && s.cards) || [], brands: (c && c.brands) || [], failed: (c && c.failed) || [],
    score_failed: (d.errors && d.errors.score) || null, wait_score: late(d, 'score'), wait_counts: late(d, 'counts') };
}

const page = {
  title: ['Which brand\'s creators ', em('need us today?')],
  eyebrow: 'Creators, all brands',
  ranges: false,

  /* two parts, read together, each kept small (the counts, never the long lists) */
  load: ctx => loadParts(ctx, {
    score: () => ctx.api('/api/trybe/scorecard', { worker: 'ah', signal: ctx.signal }).then(score => ({ today: (score && score.today) || null,
      cards: ((score && score.cards) || []).filter(c => c && !c.error).map(c => ({ act_id: c.act_id, name: c.name, source: c.source, creators_active: c.creators_active ?? null, waiting: c.waiting ?? null, last_7: c.last_7 || null, last_30: c.last_30 || null })) })),
    counts: async () => {
      const got = await perBrand(ctx, '/api/trybe?act=', await keyedBrands(ctx));
      const out = { brands: [], failed: [] };
      for (const g of got) {
        if (g.failed) { out.failed.push({ act_id: g.act_id, why: g.failed }); continue; }
        if (g.none || !g.data || g.data.has_key === false) continue;
        const d = g.data;
        out.brands.push({ act_id: g.act_id, synced_at: d.synced_at || null, counts: d.counts || null, account: d.account ? { cpa: d.account.cpa ?? null, trybe_cpa: d.account.trybe_cpa ?? null, share: d.account.share ?? null } : null });
      }
      return out;
    },
  }),
  skeleton(el) { put(el, skeleton('kpi', 4), skeleton('chart')); },

  render(el, data, ctx) { follow(ctx, data, d => page.draw(el, shape(d), ctx)); },
  asOf: d => (d && d.at) || null,   // the oldest part on screen

  draw(el, data, ctx) {
    css(); crCss(); acCss(); abCss();
    const rows = rowsOf(data), failed = (data && data.failed) || [];
    const wc = !!(data && data.wait_counts), ws = !!(data && data.wait_score);
    if (!rows.length && (wc || ws)) { put(el, skeleton('kpi', 4), skeleton('chart'), reading('Reading every brand\'s creator numbers')); return; }
    if (!rows.length) {
      put(el, empty({ title: 'No brand has a creator program yet', text: 'Add a brand\'s creator platform key in its Brand settings > Integrations. Then it gets a card here.' }), notRead(ctx, failed));
      return;
    }
    const readPending = rows.filter(r => r.pending != null), readLive = rows.filter(r => r.live != null);
    const part = (list) => list.length === rows.length ? 'every brand' : list.length + ' of ' + plural(rows.length, 'brand');
    const waitingBrands = rows.filter(r => r.pending > 0);
    const notLaunched = sum(rows, r => r.not_launched);
    ctx.askWindow = 'Last 30 days';
    ctx.askContext = `Creators, all brands: ${plural(rows.length, 'brand')} with a creator program, ${sum(rows, r => r.creators)} active creators, ${sum(rows, r => r.pending)} videos waiting for a yes across ${plural(waitingBrands.length, 'brand')}, ${notLaunched} approved videos not launched. Spend Meta, sales Triple Whale, last click.`;
    put(el,
      pageTop([
        { title: 'What it is for', text: 'One card per brand with a creator program: active creators, videos running as ads, videos waiting for a yes, and what creator ads cost per sale against the goal. Most waiting first; tap a brand for its last 7 against 30 days.' },
        { title: 'The words', text: 'Active creators sent a video in the last 30 days. Live videos ran as ads in the last 30 days. Approving and launching are done in old ' + APP_NAME + '.' },
        { title: 'Where the numbers come from', text: 'Spend is Meta. Sales are Triple Whale, last platform click. A brand whose creators run in their own app shows a dash where Locus cannot read the count.' },
      ], platformChip('meta'), h('span', { class: 'cr-quiet' }, 'Creator ads on Meta, last 30 days')),
      tiles([
          kpi({ label: 'Brands with creators', value: String(rows.length), sub: plural(sum(rows, r => r.creators), 'active creator'), window: 'Last 30 days', source: 'Creator platform' }),
          kpi({ label: 'Waiting for a yes', value: readPending.length ? String(sum(rows, r => r.pending)) : wc ? dots() : 'not read',
            sub: !readPending.length ? null : waitingBrands.length ? statusDot('warn', plural(waitingBrands.length, 'brand') + (readPending.length < rows.length ? ', ' + part(readPending) + ' read' : '')) : statusDot('good', 'nothing waiting'),
            href: ctx.href('a-creators', 'to-review'), window: 'Now', source: 'Creator platform' }),
          kpi({ label: 'Live videos', value: readLive.length ? String(sum(rows, r => r.live)) : wc ? dots() : 'not read', sub: readLive.length ? 'Ran as ads, ' + part(readLive) : null, window: 'Last 30 days', source: 'Meta' }),
          kpi({ label: 'Approved, not launched', value: wc && !rows.some(r => known(r.not_launched)) ? dots() : String(notLaunched), sub: notLaunched ? statusDot('warn', 'Ready to load into Meta') : statusDot('good', 'All launched'), window: 'Now', source: 'Creator platform' }),
        ], { cols: 4 }),
      h('div', { class: 'ab-grid' }, rows.map(r => {
        const m = r.last_30 || {}, own = r.own_app;
        return h('article', { class: 'ab-card', role: 'button', tabindex: '0', 'aria-label': 'Open ' + ((brandOf(ctx, r.act_id) || {}).name || r.name || 'the brand'), onclick: () => openBrand(ctx, r), onkeydown: e => { if ((e.key === 'Enter' || e.key === ' ') && e.target === e.currentTarget) { e.preventDefault(); openBrand(ctx, r); } } },
          h('div', { class: 'ab-top' }, brandName(ctx, r.act_id, r.name), ws && !r.last_30 ? null : goalDot(r)),
          h('div', { class: 'ab-nums' },
            h('span', null, h('em', null, 'Creators'), figure(r.creators, { wait: ws || wc }), h('small', null, 'active, 30 days')),
            h('span', null, h('em', null, 'Live videos'), figure(r.live, { own, wait: wc && !own }), h('small', null, 'ads, 30 days')),
            h('span', null, h('em', null, 'Waiting'), figure(r.pending, { hot: true, own, wait: wc && !own }), h('small', null, 'need a yes'))),
          known(m.spend) && +m.spend > 0 ? h('div', { class: 'ab-m' }, h('span', { class: 'h' }, 'Creator ads on Meta, last 30 days'), mfigs(m))
            : h('div', { class: 'ab-m' }, h('span', { class: 'h' }, r.last_30 ? 'No creator ad spend in 30 days' : ws ? dots('9em') : 'No creator ad numbers yet')),
          known(r.not_launched) && r.not_launched ? h('div', { class: 'ab-line' }, h('span', null, h('b', null, plural(r.not_launched, 'approved video')), ' not launched yet' + (known(r.oldest) && r.oldest ? ', oldest ' + plural(r.oldest, 'day') : ''))) : null);
      })),
      wc || ws ? reading(wc && ws ? 'Still reading the counts and the spend' : wc ? 'Still reading each brand\'s live and waiting videos' : 'Still reading spend and sales') : null,
      notRead(ctx, failed),
      data && data.score_failed ? h('p', { class: 'cr-quiet ac-miss' }, statusDot('warn', 'The spend and sales lines did not load, so the cards show counts only.')) : null);
  },
};
export default page;

/* Shared parts for Creators: To review, Videos, People.
   Data: account-health GET /api/trybe?act= (Videos and People: queue, live, creators, account, counts) and
   GET /api/trybe/review?act= (To review: the videos waiting in the creator platform). A client reads /api/trybe only (its brand's Live
   and Creators); the review list and the launch queue are the team's.
   Sales and cost per sale are Triple Whale (last platform click); spend is Meta's. */

import { put } from '../../kit.js';
import { h, button, sheet, addStyles, statusDot, empty, money, num, x, platformChip } from '../../kit.js';
import { defined, defLabel } from '../../defs.js';
import { SAMPLE, putSaved } from '../../data.js';
import { ORG_SHORT, APP_NAME } from '../../config.js';
import { picture, day, daysFrom, todayOf, plural, oldLocus } from '../production/_ui.js';
import { openAdDetail } from '../_addetail.js';

/** /api/trybe for this brand, with "no key" turned into a plain answer instead of an error. */
export async function loadCreators(ctx) {
  try { return await ctx.api('/api/trybe?act=' + encodeURIComponent(ctx.brand.id), { worker: 'ah', signal: ctx.signal }); }
  catch (e) { if (e && e.name === 'AbortError') throw e; if (e && (e.status === 400 || e.status === 404)) return { has_key: false, error: e.message }; throw e; }
}

/* Which brands have a creator program here. GET /api/trybe/review and /api/trybe/video answer 400 for a brand with no
   creator platform key, so the team's pages ask this first and never call those for a brand without one.
   One read for every brand: GET /api/trybe?act=all (team only; counts from the worker's own tables, no call out).
   brands[].has_key is the answer. It is kept as a saved copy, so the next visit does not wait for it. */
const KEYED = 'creators|keyed';
const readKeyed = ctx => ctx.api('/api/trybe?act=all', { worker: 'ah', signal: ctx.signal }).then(r => ((r && r.brands) || []).filter(b => b.has_key).map(b => b.act_id));
/** A Set of brand ids with a creator program, or null when that could not be read (the caller then asks anyway and
    reads 400 as "no creator program"). `sure` is a brand id that must not be judged from an old copy: when the
    saved copy says it has none, the list is read again before the page says so. */
export async function keyedBrands(ctx, sure) {
  try {
    const rec = await ctx.cached(KEYED, () => readKeyed(ctx), null, { maxAge: 5 * 60e3 });
    let ids = rec.data || [];
    if (sure && !rec.fresh && !ids.includes(sure)) { ids = await readKeyed(ctx); await putSaved(KEYED, ids); }
    return new Set(ids);
  } catch (e) { if (e && (e.name === 'AbortError' || e.status === 401)) throw e; return null; }
}

/** The plain state when the brand has no creator platform key yet, or nothing at all. */
export function notConnected(ctx, data) {
  return empty({
    title: 'Creators are not connected for this brand',
    text: ctx.isClient ? 'Your ' + ORG_SHORT + ' team connects your creator program. Ask them in Requests.'
      : 'Add the brand\'s creator platform key in Brand settings > Integrations, then the videos and the people show here.',
    action: !ctx.isClient && ctx.href ? button('Open Integrations', { href: ctx.href('brand-settings', 'integrations'), icon: 'arrow' }) : null,
  });
}

/** A video tile picture, 9:16, with the play mark. badge: a small tag on the picture (a wait, a length). */
export const clip = (v, badge) => picture({ src: v.thumb, art: v.art, video: v.media !== 'image', ratio: '9/16', alt: v.creator ? 'Video by ' + v.creator : '', badge });

/* the words a creator figure needs on hover */
export const CR_DEF = {
  spend: { name: 'Spend', definition: 'What the ads with this video spent on Meta in the last 30 days.', source: 'Meta' },
  orders: { name: 'Sales', definition: 'Orders Triple Whale credits to the ads with this video, last platform click, last 30 days.', source: 'Triple Whale, last platform click' },
  revenue: { name: 'Revenue', definition: 'The order value of those sales, last 30 days.', source: 'Triple Whale, last platform click' },
  cpa: { name: 'Cost per sale', definition: 'Spend divided by sales, last 30 days.', formula: 'Spend / Sales', source: 'Meta spend, Triple Whale sales' },
  roas: { name: 'ROAS', definition: 'Revenue divided by spend, last 30 days.', formula: 'Revenue / Spend', source: 'Triple Whale, last platform click' },
};
const fig = (label, key, value) => h('div', null, defLabel(label, CR_DEF[key] || key, { class: 'k' }), h('b', null, value));
/** The labeled figures for one video or creator (spend, sales, cost per sale, ROAS). */
export function crFigs(v, acct) {
  if (v.spend == null && v.orders == null) return null;
  return h('div', { class: 'cr-figs' },
    fig('Spend', 'spend', money(Math.round(v.spend || 0))), fig('Sales', 'orders', num(v.orders || 0)),
    fig('Cost per sale', 'cpa', v.cpa == null ? 'none' : money(Math.round(v.cpa))), fig('ROAS', 'roas', v.roas == null ? 'none' : x(v.roas)));
}

/** One video, opened: the player (or the picture in sample mode) on top, then its figures and facts.
    The creator platform gives a 20 minute link (GET /api/trybe/video, a read). Sample mode never calls it. */
export async function play(ctx, v, { acct, primary } = {}) {
  const box = h('div', { class: 'cr-play' });
  const facts = [['Product', v.product], ['Angle', v.angle], ['Campaign', v.campaign], ['Ad set', v.adset], ['Ads running', v.on != null ? num(v.on) + (v.ads != null ? ' of ' + num(v.ads) : '') : null]].filter(f => f[1]);
  const body = h('div', { class: 'cr-one' }, box,
    v.spend != null ? h('div', { class: 'cr-hd' }, platformChip('meta'), h('span', { class: 'cr-quiet' }, 'Meta ads, last 30 days'), cpaDot(v.cpa, acct)) : null,
    crFigs(v, acct),
    v.line ? h('q', { class: 'cr-said' }, '"' + v.line + '"') : null,
    facts.length ? h('dl', { class: 'cr-facts' }, facts.map(([k, val]) => h('div', null, h('dt', null, k), h('dd', null, val)))) : null,
    primary || null);
  const sh = sheet({ title: v.creator + (v.product ? ', ' + v.product : ''), body, class: 'cr-sheet' });
  if (SAMPLE) { put(box, h('div', { class: 'cr-pic' }, clip(v)), h('p', { class: 'cr-quiet' }, 'Sample numbers: the video itself plays here with real data.')); return sh; }
  put(box, h('p', { class: 'cr-quiet' }, 'Getting the video...'));
  try {
    const r = await ctx.api(`/api/trybe/video?act=${encodeURIComponent(ctx.brand.id)}&sub=${encodeURIComponent(v.sub_id || v.id)}`, { worker: 'ah' });
    const url = r && (r.url || r.video_url || r.src);
    if (!url) throw new Error('The creator platform did not send a link for this video.');
    put(box, r.media === 'image' ? h('img', { src: url, alt: '' }) : h('video', { src: url, controls: true, playsinline: true, autoplay: true, preload: 'metadata' }));
  } catch (e) { put(box, h('div', { class: 'cr-pic' }, clip(v)), h('p', { class: 'cr-quiet' }, (e && e.message) || 'This video could not play.')); }
  return sh;
}
/** The Meta ad id behind a video that ran: the worker's ad_id (its top ad), else the first of ad_ids. */
export const adIdOf = v => (v && (v.ad_id || v.meta_ad_id || (Array.isArray(v.ad_ids) && v.ad_ids[0]))) || null;
/** A video that ran as a Meta ad with spend opens the shared ad detail (the same one Creative review shows), with the
    creator facts under it. A video not in Meta yet (To review, Approved not running) opens play(). */
export function openVideo(ctx, v, o = {}) {
  const id = adIdOf(v);
  if (!id || !(v.spend > 0)) return play(ctx, v, o);
  const to = ctx.sample ? '2026-11-22' : todayOf(null);
  const from = new Date(Date.parse(to + 'T12:00:00Z') - 29 * 864e5).toISOString().slice(0, 10);
  const name = v.creator + (v.product ? ', ' + v.product : '');
  const ref = openAdDetail(ctx, { id: String(id), name, media_type: v.media === 'image' ? 'image' : 'video', thumb: v.thumb || null, art: v.art || null,
    campaign: v.campaign || null, adset: v.adset || null, spend: v.spend, revenue: v.revenue, purchases: v.orders, roas: v.roas, cpa: v.cpa },
    { window: { from, to, label: 'Last 30 days' }, goals: { cpa: o.acct || null } });
  const box = ref && ref.el && ref.el.querySelector('.adx');
  if (!box) return ref;
  crCss();
  const facts = [['Creator', v.creator], ['Product', v.product], ['Angle', v.angle], ['What they said', v.line ? '"' + v.line + '"' : null],
    ['Ads with this video', v.on != null ? num(v.on) + ' on' + (v.ads != null ? ' of ' + num(v.ads) : '') : null]].filter(f => f[1]);
  box.append(h('section', { class: 'cr-more' }, h('h3', null, 'The creator video'),
    h('div', { class: 'cr-hd' }, h('span', { class: 'cr-quiet' }, 'Every ad with this video, last 30 days: spend Meta, sales Triple Whale, last click'), cpaDot(v.cpa, o.acct)),
    crFigs(v, o.acct),
    facts.length ? h('dl', { class: 'cr-facts' }, facts.map(([k, val]) => h('div', null, h('dt', null, k), h('dd', null, val)))) : null));
  return ref;
}
/** The primary button in a review sheet: approve in old Locus (approving pays the creator). Team only. */
export const approveOld = (ctx, href) => oldLocus(ctx, { label: 'Approve in old ' + APP_NAME, href, primary: true });

/** "3 days ago" for a date, from the data's own today. */
export const ago = (d, today) => { const n = daysFrom(String(d || '').slice(0, 10), today); return n == null ? '' : n <= 0 ? 'today' : n === 1 ? 'yesterday' : n + ' days ago'; };

/** Cost per sale beside the account's: green at or under, crimson above, nothing when there are no sales. */
export function cpaDot(cpa, acct) {
  if (cpa == null) return statusDot('off', 'No sales yet');
  if (acct == null) return null;
  const d = { name: cpa <= acct ? 'Under the account' : 'Over the account', definition: `Its cost per sale against the account's ${money(acct)} cost per sale (every Meta ad, last 30 days). Under is better.` };
  const el = defined(cpa <= acct ? statusDot('good', 'Under the account ' + money(Math.round(acct))) : statusDot('bad', 'Over the account ' + money(Math.round(acct))), d);
  if (el && el.classList) el.classList.add('cr-nodef');   /* the dot marks it: no dotted underline as well */
  return el;
}

export { todayOf, day, plural };

const CSS = `
.cr-grid{display:grid;grid-template-columns:repeat(var(--cols,6),minmax(0,1fr));gap:18px}
.cr-tile{display:grid;grid-template-columns:minmax(0,1fr);gap:8px;min-width:0;align-content:start}
.cr-tile>button{padding:0;border:0;background:none;cursor:pointer;display:block;width:100%;text-align:left}
.cr-tile .pd-pic{border-radius:var(--r-tbl,12px);box-shadow:0 0 0 1px var(--line)}
.cr-tile>button:hover .pd-pic{box-shadow:0 0 0 1px var(--line),var(--sh-2)}
.cr-tile b{display:block;font-size:13.5px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.cr-tile small{display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;font-size:12.5px;color:var(--muted);overflow:hidden}
.cr-tile q{display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;font-size:12.5px;line-height:1.4;color:var(--ink-2);quotes:none}
.cr-nums{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:6px;padding-top:8px;border-top:1px solid var(--line)}
.cr-nums span{display:grid;gap:1px;min-width:0}
.cr-nums em{font-style:normal;font-size:var(--fs-colhead,11.5px);font-weight:500;white-space:nowrap;color:var(--muted)}
.cr-nums b{font-size:14px;font-variant-numeric:tabular-nums}
.cr-q .pd-line{padding-left:20px;padding-right:20px}
.cr-mini{display:block;width:34px}
.cr-mini .pd-pic{border-radius:7px}
.cr-mini .pd-play{display:none}
.cr-quiet{color:var(--muted);font-size:13px}
.cr-w,.cr-nums span.cr-w,.cr-nums span.cr-full{display:inline}
.cr-nums span.cr-cmp,.cr-cmp{display:none}
@media (max-width:759px){.cr-nums span.cr-full,.cr-full{display:none}.cr-nums span.cr-cmp,.cr-cmp{display:inline}}
.cr-nodef.lx-def,.cr-nodef.lx-def:hover,.cr-nodef.lx-def.open{text-decoration:none}
.cr-more{display:grid;gap:12px;min-width:0;padding-top:var(--gap-5,24px);border-top:1px solid var(--line)}
.cr-more h3{font-size:var(--fs-section,17px);font-weight:600;margin:0}
.cr-play{display:grid;gap:12px}
.cr-one{display:grid;gap:18px;min-width:0}
.cr-pic{max-width:220px}
.cr-hd{display:flex;align-items:center;gap:10px;flex-wrap:wrap}
.cr-hd .lx-stat{margin-left:auto}
.cr-vids{display:grid}
.cr-vid{display:grid;grid-template-columns:34px minmax(0,1fr) auto;gap:12px;align-items:center;padding:10px 0;border:0;border-top:1px solid var(--line);background:none;text-align:left;font:inherit;color:inherit;cursor:pointer;width:100%}
.cr-vid:hover{background:var(--row-hover)}
.cr-vid b{display:block;font-weight:600}.cr-vid small{display:block;font-size:12.5px;color:var(--muted)}
.cr-figs{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px 14px}
.cr-figs>div{display:grid;gap:2px;min-width:0}
.cr-figs .k{font-size:12px;color:var(--muted);justify-self:start}
.cr-figs b{font-size:var(--num-s);font-weight:600;font-variant-numeric:tabular-nums}
.cr-said{font-size:14px;line-height:1.5;color:var(--ink-2);quotes:none;display:block}
.cr-facts{display:grid;margin:0}
.cr-facts>div{display:grid;grid-template-columns:110px minmax(0,1fr);gap:12px;padding:8px 0;border-top:1px solid var(--line);font-size:13.5px}
.cr-facts dt{color:var(--muted)}.cr-facts dd{margin:0;overflow-wrap:anywhere}
.cr-sortl{display:inline-flex;align-items:center;gap:8px;font-size:13px;color:var(--muted)}
.cr-sortl select{height:34px;width:auto;min-width:170px;font-size:13.5px}
@media (max-width:759px){.cr-figs{grid-template-columns:1fr 1fr}}
.cr-play video{width:100%;max-height:70vh;border-radius:var(--r-tbl,12px);background:#000}
.cr-who{display:flex;align-items:center;gap:10px;min-width:0}
.cr-who>div{min-width:0}
.cr-who b{display:block;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.cr-who small{display:block;font-size:12.5px;color:var(--muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
@media (max-width:1180px){.cr-grid{--cols:4!important}}
.cr-tag{justify-self:start;max-width:100%;overflow:hidden;text-overflow:ellipsis}
@media (max-width:900px){.cr-grid{--cols:3!important}}
@media (max-width:759px){.cr-grid{--cols:2!important;gap:14px}}
`;
export const crCss = () => addStyles('cr-css', CSS);

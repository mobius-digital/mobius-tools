/* Ads > Meta > Load ads for one brand. "What is ready to go into Meta, and where would it go?"
   The cards in Ready on the production board, each beside what Meta already holds for it and the ad set it would
   land in. Then the cards already loaded and waiting for their date, and what was loaded lately.
   Load opens the real Load sheet (production/_load.js): the same flow and bodies old Locus runs
   (POST /api/launch/batch-prep, then batch-preview as a dry run, then batch-create on the second tap), every
   approved ad of the card into one ad set, made paused. Sample mode never loads. Viewers get the read only sheet.
   About now, so the date range in the page head is hidden. Team only (the tab is not in a client's menu).

   Real mode reads (GET only):
     GET /api/production?act=      account-health: the board; the cards in Ready and Scheduled
     GET /api/meta/live?act=       account-health: campaigns, ad sets and ads, straight from Meta
     GET /api/launch/list?act=     account-health: every ad loaded through Locus, with its last known state
   Nothing here is example data. A part whose read failed is left out or says so; it never shows a zero.

   Where a card would go follows old Locus's own rule (launch.js, suggest): the ad set whose name starts with the
   card's number, else the newest numbered test ad set that is on. The person can still change it when loading. */

import { h, card, hero, kpi, kpis, button, sheet, statusDot, empty, skeleton, put, num } from '../../kit.js';
import { APP_NAME } from '../../config.js';
import { picture, plural, day, todayOf, isDay } from '../production/_ui.js';
import { soft, styles } from './_rest.js';
import { def, defOn, headRow, warnLine } from '../platforms/_ads.js';
import { openLoad } from '../production/_load.js';
import { canWrite } from '../production/_act.js';
import { refresh } from '../../router.js';
import { SAMPLE } from '../../data.js';

const CSS = `
.la-list{display:grid}
.la-r{display:grid;grid-template-columns:64px minmax(0,1.15fr) minmax(0,.8fr) minmax(0,1.2fr) auto;gap:18px;align-items:center;padding:14px 28px;border-top:1px solid var(--line);min-width:0}
.la-r:first-child{border-top:0}
.la-r .pd-pic{width:64px;border-radius:var(--r-btn,10px)}
.la-t{min-width:0}
.la-t b{display:block;font-size:14px;font-weight:600;line-height:1.3;overflow-wrap:anywhere}
.la-t small{display:block;margin-top:2px;font-size:12.5px;color:var(--muted)}
.la-c{min-width:0;display:grid;gap:3px;font-size:13px}
.la-c .k{display:none}
.la-hd{display:grid;grid-template-columns:64px minmax(0,1.15fr) minmax(0,.8fr) minmax(0,1.2fr) 120px;gap:18px;padding:10px 28px 8px;border-bottom:1px solid var(--line);font-size:var(--fs-colhead,11.5px);font-weight:600;color:var(--muted)}
.la-hd.l{grid-template-columns:minmax(0,1.3fr) minmax(0,1fr) 120px 150px}
.la-hd .r{text-align:right}
.la-c b{font-weight:600;overflow-wrap:anywhere}
.la-c small{font-size:12.5px;color:var(--muted);overflow-wrap:anywhere}
.la-c .lx-stat{font-size:12.5px}
.la-go{display:flex;justify-content:flex-end;min-width:120px}
.la-none{padding:20px 28px;color:var(--muted);font-size:13.5px}
.la-l{display:grid;grid-template-columns:minmax(0,1.3fr) minmax(0,1fr) 120px 150px;gap:16px;align-items:center;padding:11px 28px;border-top:1px solid var(--line);font-size:13.5px;min-width:0}
.la-l:first-child{border-top:0}
.la-l b{font-weight:600;overflow-wrap:anywhere}
.la-l .s{color:var(--muted);font-size:12.5px;overflow-wrap:anywhere}
.la-l .w{color:var(--muted);font-size:12.5px;text-align:right;white-space:nowrap}
.la-more{display:flex;justify-content:center;padding:6px 0 16px}
.la-sh{display:grid;gap:22px;min-width:0}
.la-sh section{display:grid;gap:10px;min-width:0}
.la-sh h3{font-size:13px;font-weight:600;color:var(--muted)}
.la-sh .top{display:grid;grid-template-columns:96px minmax(0,1fr);gap:16px;align-items:center}
.la-sh .top b{display:block;font-size:17px;font-weight:600;letter-spacing:-.02em;line-height:1.25;overflow-wrap:anywhere}
.la-sh .top small{display:block;margin-top:4px;color:var(--muted);font-size:13px}
.la-box{display:grid;gap:6px;padding:14px 16px;border-radius:var(--r-tbl,12px);background:var(--bg-sunk);min-width:0}
.la-box b{font-weight:600;overflow-wrap:anywhere}
.la-box p{font-size:13px;color:var(--ink-2);line-height:1.45}
.la-box small{font-size:12.5px;color:var(--muted)}
.la-ads{display:grid;gap:0;border:1px solid var(--line);border-radius:var(--r-tbl,12px);overflow:hidden}
.la-ads>div{display:flex;justify-content:space-between;gap:12px;align-items:center;padding:9px 14px;border-top:1px solid var(--line);font-size:13px;min-width:0}
.la-ads>div:first-child{border-top:0}
.la-ads span:first-child{overflow-wrap:anywhere;min-width:0}
.la-steps{display:grid;gap:8px;padding-left:18px;font-size:13.5px;color:var(--ink-2);line-height:1.45}
.la-act{display:flex;gap:10px;flex-wrap:wrap;align-items:center}
@media (max-width:1040px){
  .la-hd{display:none}
  .la-r{grid-template-columns:56px minmax(0,1fr) minmax(0,1fr) auto}
  .la-r .pd-pic{width:56px}
  .la-r>.la-in{grid-column:2}
  .la-r>.la-to{grid-column:3;grid-row:1/3}
  .la-r>.la-go{grid-column:4;grid-row:1/3}
  .la-l{grid-template-columns:minmax(0,1fr) 110px 130px}
  .la-l>.s.set{grid-column:1;grid-row:2;margin-top:-8px}
}
@media (max-width:759px){
  .la-r{grid-template-columns:52px minmax(0,1fr);gap:10px 12px;padding:14px 16px}
  .la-r .pd-pic{width:52px}
  .la-r>.la-in,.la-r>.la-to,.la-r>.la-go{grid-column:1/-1;grid-row:auto}
  .la-go .lx-btn{width:100%;justify-content:center}
  .la-none{padding:18px 16px}
  .la-l{grid-template-columns:minmax(0,1fr) auto;gap:4px 12px;padding:11px 16px}
  .la-l>.s.set{grid-column:1/-1;grid-row:auto;margin-top:0}
  .la-l .w{grid-column:1/-1;text-align:left}
  .la-sh .top{grid-template-columns:72px minmax(0,1fr)}
}`;

/* ---------- reading the three answers ---------- */
/** The number that starts a name ("432-3 | Still" is 432, "GD_283" is 283). The same rule old Locus uses to tie an ad to its card. */
export function numOf(name) {
  const m = /^\s*(?:[A-Za-z]{2,4}_)?#?(\d{1,4})(?=$|[^\d])/.exec(name || '');
  return m ? String(parseInt(m[1], 10)) : null;
}
const ON = 'ACTIVE';
const GONE = ['DELETED', 'ARCHIVED'];
/** One word for an ad's or ad set's state in Meta. */
export function stateOf(eff) {
  const s = String(eff || '').toUpperCase();
  if (s === ON) return ['good', 'On'];
  if (s === 'PAUSED') return ['off', 'Off'];
  if (s === 'ADSET_PAUSED' || s === 'CAMPAIGN_PAUSED') return ['off', 'Off with its ad set'];
  if (GONE.includes(s)) return ['off', 'Removed'];
  if (s === 'PENDING_REVIEW' || s === 'IN_PROCESS' || s === 'PREAPPROVED') return ['info', 'In review'];
  if (s === 'DISAPPROVED') return ['bad', 'Rejected by Meta'];
  if (s === 'WITH_ISSUES') return ['warn', 'Has a problem'];
  return ['off', s ? s.replace(/_/g, ' ').toLowerCase().replace(/^./, c => c.toUpperCase()) : 'Not checked'];
}
/* Meta ids grow with time, so the bigger id is the newer one (old Locus sorts on the created time, which this read does not carry). */
const newer = (a, b) => String(b.id).length - String(a.id).length || String(b.id).localeCompare(String(a.id));
const CREATOR = /creator|partnership|trybe|ambassador|influencer|ugc creator/i;
export const FULL_AT = 50;      // Meta's own limit: ads that can be on in one ad set

/** Which launch rows belong to a card: tied to it when loaded, or named with its number. */
const mineOf = (c, log) => (log || []).filter(r => (r.batch_id && r.batch_id === c.id) || (c.num && (String(r.num || '') === c.num || numOf(r.ad_name) === c.num)));

/** Where a card would go. Old Locus's rule, on what Meta holds now. Returns null when Meta could not be read. */
export function whereFor(c, sets, mine, losers) {
  if (!sets) return null;
  const pick = (st, kind, why) => ({ id: st.id, name: st.name, campaign: st.campaign, on: st.eff === ON, ads: st.ads, ads_on: st.ads_on, kind, why });
  const own = c.num ? sets.filter(st => st.num === c.num).sort((a, b) => (b.eff === ON) - (a.eff === ON) || newer(a, b)) : [];
  if (own.length) return pick(own[0], 'own', `Its own ad set: the name starts with ${c.num}.`);
  /* ads from this card already sit somewhere: the rest belong beside them */
  const tally = new Map();
  for (const a of mine) if (a.adset) tally.set(a.adset, (tally.get(a.adset) || 0) + 1);
  const there = [...tally.entries()].sort((a, b) => b[1] - a[1]).map(([id]) => sets.find(st => st.id === id)).filter(Boolean)[0];
  if (there) return pick(there, 'there', 'Ads from this card are already in this ad set.');
  const live = sets.filter(st => st.eff === ON);
  const isCreator = st => CREATOR.test(st.campaign || '') || CREATOR.test(st.name || '');
  const none = c.num ? ` No ad set starts with ${c.num} yet.` : '';
  const tests = live.filter(st => st.num && !isCreator(st) && !losers.has(st.num)).sort((a, b) => (+b.num || 0) - (+a.num || 0) || newer(a, b));
  if (tests.length) return pick(tests[0], 'rule', 'The newest test ad set that is on.' + none);
  const testing = live.filter(st => /test/i.test(st.campaign) && !isCreator(st)).sort(newer);
  if (testing.length) return pick(testing[0], 'rule', 'The newest ad set that is on in the testing campaign.' + none);
  const pool = live.filter(st => !isCreator(st)).sort(newer);
  const any = pool.length ? pool : [...live].sort(newer);
  if (any.length) return pick(any[0], 'check', 'The newest ad set that is on. No testing campaign was found, so check this one.' + none);
  return { id: null, name: '', campaign: '', on: false, kind: 'none', why: sets.length ? 'No ad set is on in Meta right now.' : 'No ad sets were found in the Meta account.' };
}

/** The page's data from the three answers. Sample mode runs the same code on the fixture. */
export function build({ board, live, launches }) {
  const today = todayOf(board);
  const hasLive = !!(live && !live.error && live.campaigns);
  const camps = hasLive ? live.campaigns : {};
  const allAds = hasLive ? Object.entries(live.ads || {}).map(([id, v]) => ({ id: String(id), name: v.name || '', eff: v.eff || v.status || '', adset: v.adset ? String(v.adset) : '', num: numOf(v.name) })) : [];
  const perSet = new Map();
  for (const a of allAds) { const t = perSet.get(a.adset) || { n: 0, on: 0 }; t.n++; if (a.eff === ON) t.on++; perSet.set(a.adset, t); }
  const sets = hasLive ? Object.entries(live.adsets || {}).map(([id, v]) => {
    const t = perSet.get(String(id)) || { n: 0, on: 0 };
    return { id: String(id), name: v.name || '', eff: v.eff || v.status || '', campaign: (camps[v.campaign] || {}).name || '', num: numOf(v.name), ads: t.n, ads_on: t.on };
  }) : null;
  const log = Array.isArray(launches) ? launches : null;
  const cards = (board && board.cards) || [];
  const losers = new Set(cards.filter(c => c.num && (c.verdict === 'loser' || c.result === 'loser')).map(c => String(c.num)));

  const row = c => {
    const cardNum = c.num ? String(parseInt(c.num, 10)) : '';
    const cc = { ...c, num: cardNum === 'NaN' ? '' : cardNum };
    const logged = mineOf(cc, log);
    const ids = new Set(logged.map(r => String(r.ad_id || '')).filter(Boolean));
    let inMeta = null, mine = [];
    if (hasLive) {
      mine = allAds.filter(a => (cc.num && a.num === cc.num) || ids.has(a.id)).sort((a, b) => (b.eff === ON) - (a.eff === ON) || a.name.localeCompare(b.name));
      inMeta = { from: 'meta', n: mine.length, on: mine.filter(a => a.eff === ON).length, ads: mine.slice(0, 30).map(a => ({ name: a.name, eff: a.eff })) };
    } else if (log) {
      const alive = logged.filter(r => !GONE.includes(String(r.eff_status || '').toUpperCase()));
      inMeta = { from: 'log', n: alive.length, on: alive.filter(r => r.eff_status === ON).length, ads: alive.slice(0, 30).map(r => ({ name: r.ad_name || '', eff: r.eff_status || '' })) };
      mine = alive.map(r => ({ adset: String(r.adset_id || '') }));
    }
    return { id: c.id, num: c.num || '', title: c.title || '', format: c.format || '', board: c.board, files: +c.versions || 0, thumb: c.thumb || null, art: c.art || null,
      launch_on: isDay(c.launch_on) ? c.launch_on : '', approved_by: c.approved_by || '', assignee: c.assignee || '', in_meta: inMeta, to: whereFor(cc, sets, mine, losers) };
  };
  const byDate = (a, b) => String(a.launch_on || '9').localeCompare(String(b.launch_on || '9')) || (+b.num || 0) - (+a.num || 0);
  const ready = cards.filter(c => c.board === 'ready').map(row).sort(byDate);
  const waiting = cards.filter(c => c.board === 'scheduled').map(row).sort(byDate);
  const recent = log ? log.slice().sort((a, b) => String(b.at).localeCompare(String(a.at))).slice(0, 60)
    .map(r => ({ id: r.id, name: r.ad_name || 'Unnamed ad', adset: r.adset_name || '', eff: r.eff_status || r.status || '', at: r.at, by: r.by || '', link: r.ads_manager || null })) : null;
  return {
    today, connected: hasLive, meta_error: live && live.error ? String(live.error) : null, can: hasLive ? !!live.can : null, log_ok: !!log,
    ready, waiting, recent,
    meta: hasLive ? { sets_on: sets.filter(st => st.eff === ON).length, campaigns_on: Object.values(camps).filter(c => (c.eff || c.status) === ON).length, ads_on: allAds.filter(a => a.eff === ON).length } : null,
  };
}

async function load(ctx) {
  const act = encodeURIComponent(ctx.brand.id);
  const ah = path => ctx.api(path, { worker: 'ah', signal: ctx.signal });
  const [board, live, list] = await Promise.all([ah(`/api/production?act=${act}`), soft(ah(`/api/meta/live?act=${act}`)), soft(ah(`/api/launch/list?act=${act}`))]);
  return build({ board, live, launches: list && Array.isArray(list.launches) ? list.launches : null });
}

/* ---------- the parts ---------- */
const who = v => { const s = String(v || ''); return s.includes('@') ? s.split('@')[0].replace(/[._]/g, ' ').replace(/\b\w/g, m => m.toUpperCase()) : s; };
const filesText = r => (r.files ? plural(r.files, 'file') : 'No files yet');
const sinceDays = (at, today) => { const d = String(at || '').slice(0, 10); return isDay(d) ? Math.round((new Date(today + 'T12:00:00') - new Date(d + 'T12:00:00')) / 864e5) : null; };

function inMetaCell(r) {
  const m = r.in_meta;
  if (!m) return h('div', { class: 'la-c la-in' }, h('span', { class: 'k' }, 'In Meta now'), h('small', null, 'Could not read Meta'));
  const label = m.from === 'log' ? `Loaded through ${APP_NAME}` : 'In Meta now';
  if (!m.n) return h('div', { class: 'la-c la-in' }, h('span', { class: 'k' }, label), h('b', null, 'None found'), h('small', null, m.from === 'log' ? 'nothing loaded for this card' : r.num ? `no ad name starts with ${r.num}` : 'the card has no number'));
  return h('div', { class: 'la-c la-in' }, h('span', { class: 'k' }, label), h('b', null, plural(m.n, 'ad')),
    statusDot(m.on ? 'good' : 'off', m.on ? `${m.on} on` : 'all off'));
}
function toCell(r, loadable) {
  const label = loadable ? 'Would go to' : 'Sits in';
  const t = r.to;
  if (!loadable && t && t.kind !== 'own' && t.kind !== 'there') return h('div', { class: 'la-c la-to' }, h('span', { class: 'k' }, label), h('small', null, 'No ad name in Meta starts with this card number'));
  if (!t) return h('div', { class: 'la-c la-to' }, h('span', { class: 'k' }, label), h('small', null, 'Could not read the ad sets in Meta'));
  if (!t.id) return h('div', { class: 'la-c la-to' }, h('span', { class: 'k' }, label), h('b', null, 'No ad set to suggest'), h('small', null, t.why));
  return h('div', { class: 'la-c la-to' }, h('span', { class: 'k' }, label), h('b', null, t.name), h('small', null, t.campaign || 'Campaign name not read'),
    !t.on ? statusDot('warn', 'This ad set is off') : t.ads_on >= FULL_AT ? defOn(statusDot('bad', `Full: ${t.ads_on} ads on`), 'ad_limit_50') : loadable && t.ads_on >= FULL_AT - 5 ? defOn(statusDot('warn', `Nearly full: ${t.ads_on} of ${FULL_AT} on`), 'ad_limit_50') : t.kind === 'check' ? statusDot('warn', 'Check this one') : null);
}

function loadSheet(r, ctx, loadable = true) {
  const m = r.in_meta, t = !loadable && r.to && r.to.kind !== 'own' && r.to.kind !== 'there' ? { id: null, why: 'No ad name in Meta starts with this card number, so where it sits could not be worked out.' } : r.to;
  const old = ctx.legacy ? ctx.legacy + (r.id ? '&card=' + encodeURIComponent(r.id) : '') : null;
  const room = t && t.id ? FULL_AT - (t.ads_on || 0) : null;
  const body = h('div', { class: 'la-sh' },
    h('div', { class: 'top' }, picture({ src: r.thumb, art: r.art, video: r.format === 'Video' || r.format === 'UGC', ratio: '1/1' }),
      h('div', null, h('b', null, r.title || 'Untitled card'),
        h('small', null, [r.num && 'Card ' + r.num, r.format, filesText(r), r.approved_by && 'approved by ' + r.approved_by].filter(Boolean).join(', ')))),
    h('section', null, h('h3', null, loadable ? 'Where it would go' : 'Where it sits'),
      !t ? h('div', { class: 'la-box' }, h('p', null, 'Meta could not be read just now, so no ad set is suggested. Old ' + APP_NAME + ' picks one when you load.'))
        : !t.id ? h('div', { class: 'la-box' }, h('p', null, t.why))
        : h('div', { class: 'la-box' }, h('b', null, t.name), h('small', null, t.campaign ? 'Campaign: ' + t.campaign : 'Campaign name not read'),
          h('p', null, t.why),
          h('small', null, `${plural(t.ads || 0, 'ad')} in it now, ${t.ads_on || 0} on.` + (room != null ? (room > 0 ? ` Meta allows ${FULL_AT} on in one ad set, so there is room for ${room} more.` : ` Meta allows ${FULL_AT} on in one ad set, so this one is full. Use a copy of it.`) : '')),
          !t.on ? statusDot('warn', 'This ad set is off. Ads loaded here will not run until it is turned on.') : null)),
    h('section', null, h('h3', null, m && m.from === 'log' ? `Already loaded through ${APP_NAME}` : 'Already in Meta for this card'),
      !m ? h('p', { class: 'mr-dim' }, 'Meta could not be read just now.')
        : !m.n ? h('p', { class: 'mr-dim' }, 'None found. No ad name in Meta starts with this card number. Ads loaded under another name do not show here.')
        : h('div', { class: 'la-ads' }, m.ads.map(a => { const [tone, word] = stateOf(a.eff); return h('div', null, h('span', null, a.name || 'Unnamed ad'), statusDot(tone, word)); }),
          m.n > m.ads.length ? h('div', null, h('span', null, `and ${m.n - m.ads.length} more`)) : null)),
    !loadable ? null : h('section', null, h('h3', null, 'What loading does'),
      h('ol', { class: 'la-steps' },
        h('li', null, 'Every approved ad on the card goes into one ad set, in one go.'),
        h('li', null, 'The headline, the words and the link come from the brief. An ad with no headline in its brief is held back.'),
        h('li', null, 'Each ad goes in switched off. Nothing spends until someone turns it on.'),
        h('li', null, 'The change is written to Changes, with an undo.'))),
    h('section', null,
      loadable && canWrite(ctx) ? null : h('div', { class: 'la-box' }, h('b', null, loadable ? 'Loading is for the team' : 'Turning ads on still runs from old ' + APP_NAME + ' for now'),
        h('p', null, loadable ? 'You can see what is ready and where it would go. The team loads it.'
          : 'This card is marked Scheduled: its ads are loaded and wait for their date. This page does not change anything in Meta.')),
      h('div', { class: 'la-act' },
        loadable && canWrite(ctx) ? button('Load it', { primary: true, large: true, onclick: () => { sh.close(); startLoad(r, ctx); } }) : null,
        old ? button('Open it in old ' + APP_NAME, { href: old, target: '_blank', icon: 'arrow' }) : null,
        button('See the card on the board', { href: ctx.href('production', 'board') }))));
  const sh = sheet({ title: !loadable ? (r.num ? `Card ${r.num} in Meta` : 'This card in Meta') : r.num ? `Load ${r.num} into Meta` : 'Load into Meta', body });
  return sh;
}
/** The real load, for one card of this brand. After a load the page reads itself again (real mode). */
export function startLoad(r, ctx, act) {
  return openLoad(ctx, { act: act || (ctx.brand && ctx.brand.id), card: { id: r.id, num: r.num, title: r.title, format: r.format, files: r.files, thumb: r.thumb, art: r.art },
    onDone: () => { if (!SAMPLE) refresh({ fresh: true }); } });
}

function cardRow(r, ctx, d, loadable, first) {
  const sub = [r.format, filesText(r), r.launch_on ? 'goes live ' + day(r.launch_on) : null].filter(Boolean).join(', ');
  return h('div', { class: 'la-r' },
    picture({ src: r.thumb, art: r.art, video: r.format === 'Video' || r.format === 'UGC', ratio: '1/1' }),
    h('div', { class: 'la-t' }, h('b', null, (r.num ? r.num + '  ' : '') + (r.title || 'Untitled card')), h('small', null, sub),
      r.launch_on && r.launch_on < d.today && loadable ? statusDot('bad', 'Its date has passed') : null),
    inMetaCell(r), toCell(r, loadable),
    h('div', { class: 'la-go' }, loadable ? (canWrite(ctx) ? button('Load', { primary: !!first, aria: 'Load card ' + (r.num || r.title), onclick: () => startLoad(r, ctx) })
        : button('See', { aria: 'See card ' + (r.num || r.title), onclick: () => loadSheet(r, ctx, true) }))
      : button('See', { aria: 'See card ' + (r.num || r.title), onclick: () => loadSheet(r, ctx, false) })));
}

const listHead = to => h('div', { class: 'la-hd' }, h('span'), h('span', null, def('Card', 'production_card')), h('span', null, 'In Meta now'), h('span', null, to), h('span', { class: 'r' }, ''));
function top(d) {
  const dated = [...d.ready, ...d.waiting].filter(r => r.launch_on && r.launch_on >= d.today).sort((a, b) => a.launch_on.localeCompare(b.launch_on))[0];
  const week = d.recent ? d.recent.filter(r => { const n = sinceDays(r.at, d.today); return n != null && n <= 7; }) : null;
  const fresh = d.ready.filter(r => r.in_meta && r.in_meta.from === 'meta' && !r.in_meta.n).length;
  return hero({ line: true }, kpis([
    kpi({ label: h('span', null, 'Batches ready to load, in ', def('cards', 'production_card')), value: String(d.ready.length), small: d.ready.length === 1 ? 'card' : 'cards',
      sub: !d.ready.length ? 'nothing waiting' : d.connected ? (fresh ? statusDot('warn', `${fresh} with no ads found in Meta`) : statusDot('good', 'all have ads in Meta')) : plural(d.ready.reduce((t, r) => t + r.files, 0), 'file') }),
    kpi({ label: 'Loaded, waiting for its date', value: String(d.waiting.length), small: d.waiting.length === 1 ? 'card' : 'cards', sub: 'marked Scheduled on the board' }),
    dated ? kpi({ label: 'Next to go live', value: day(dated.launch_on), sub: (dated.num ? dated.num + ' ' : '') + dated.title }) : kpi({ label: 'Next to go live', value: 'No date set', sub: 'no card carries a go live date' }),
    week ? kpi({ label: 'Loaded in the last 7 days', value: num(week.length), small: week.length === 1 ? 'ad' : 'ads',
      sub: week.length ? `${week.filter(r => r.eff === ON).length} on now` : `through ${APP_NAME}` }) : null,
  ].filter(Boolean), { cols: 4 }));
}

function recentCard(d) {
  if (!d.recent) return null;
  if (!d.recent.length) return card({ title: 'Loaded lately', flush: true }, h('div', { class: 'la-none' }, `No ad has been loaded through ${APP_NAME} for this brand yet.`));
  let shown = 8;
  const box = h('div', { class: 'la-list' });
  const paint = () => put(box, ...d.recent.slice(0, shown).map(r => { const [tone, word] = stateOf(r.eff);
    return h('div', { class: 'la-l' }, h('b', null, r.name), h('span', { class: 's set' }, r.adset || 'Ad set not recorded'), statusDot(tone, word),
      h('span', { class: 'w' }, [day(String(r.at || '').slice(0, 10)), who(r.by)].filter(Boolean).join(', '))); }),
    d.recent.length > shown ? h('div', { class: 'la-more' }, h('button', { class: 'lx-btn', type: 'button', onclick: () => { shown = d.recent.length; paint(); } }, `Show all ${d.recent.length}`)) : null);
  paint();
  return card({ title: 'Loaded lately', note: 'newest first, state as last checked', flush: true },
    h('div', { class: 'la-hd l' }, h('span', null, 'Ad'), h('span', null, 'Ad set'), h('span', null, 'State in Meta'), h('span', { class: 'r' }, 'Loaded (date, by)')), box);
}

export default {
  title: 'Load ads into Meta',
  eyebrow: 'Meta',
  ranges: false,
  load,
  sample: async ctx => build(await ctx.fixture('load-ads.json')),
  skeleton(el) { put(el, h('div', { class: 'lx-skel-grid' }, skeleton('kpi', 4)), skeleton('row', 6)); },

  render(el, d, ctx) {
    styles('la-css', CSS);
    if (!ctx.brand) return put(el, empty({ title: 'Pick a brand', text: 'Load ads is one brand at a time.' }));
    d = d || { ready: [], waiting: [], recent: null, today: todayOf(null) };
    const noMeta = d.connected === false ? card({},
      h('div', { class: 'la-c' }, h('b', null, 'Meta could not be read'),
        h('small', null, (d.meta_error || 'The ad sets and ads in Meta did not come back.') + ' The cards below still show. Where each would go fills in when Meta answers.'),
        h('div', { class: 'la-act', style: { marginTop: '8px' } }, button('Open integrations', { href: ctx.href('brand-settings', 'integrations') })))) : null;
    const cantWrite = d.connected && d.can === false ? warnLine('Our Meta login can read this account but cannot change it, so loading will be refused until that is fixed in Meta.') : null;
    const help = [
      { title: 'What Load does', text: 'Load puts every approved ad of a card into one Meta ad set, switched off, after a preview you check first. Nothing spends until someone turns the ads on.' },
      { title: 'What a card is', text: 'A card is a batch on the production board: one brief and every ad made from it. Cards in Ready show here. An ad belongs to a card when its name starts with the card\'s number.' },
      { title: 'Where the numbers come from', text: `The cards come from the production board, the ad sets and ads straight from Meta, and Loaded lately from what was loaded through ${APP_NAME}.` },
    ];
    put(el, ...[
      headRow({ help }), cantWrite,
      top(d), noMeta,
      card({ title: 'Ready to load', note: d.ready.length ? plural(d.ready.length, 'card') + ' in Ready on the board' : null, flush: true },
        d.ready.length ? h('div', { class: 'la-list' }, listHead('Goes to ad set'), d.ready.map((r, i) => cardRow(r, ctx, d, true, i === 0)))
          : h('div', { class: 'la-none' }, 'No card is in Ready on the board. A card shows here when its ads are approved and it is moved to Ready.')),
      d.waiting.length ? card({ title: 'Loaded, waiting for its date', note: plural(d.waiting.length, 'card') + ' marked Scheduled', flush: true },
        h('div', { class: 'la-list' }, listHead('Sits in ad set'), d.waiting.map(r => cardRow(r, ctx, d, false)))) : null,
      recentCard(d),
    ].filter(Boolean));
  },
};

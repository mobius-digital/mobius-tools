/* Ads > All platforms > Changes made, for ONE brand: one list of what changed on Meta, Google and TikTok,
   newest first, day by day. The same look as the agency list (pages/a-platforms/changes.js) and the same
   words as Meta > Changes made. A row opens a sheet with the whole change. A Meta change made through the app in
   the last 24 hours has Undo in that sheet (team only): a confirm, then POST account-health /api/meta/undo
   {act, write}, the write id read from the change's note ("Write mw_...").

   Real mode reads (GET only):
     team    account-health /api/activities?act=&from=&to=&limit=    Meta's own log, plus every change made through the app
                                                                     (those rows also carry Google and TikTok writes)
     team    account-health /api/google/ads-changes?act=&from=&to=   Google's own change history (Google keeps 30 days)
     client  account-health /api/ad-updates?act=&from=&to=           only the changes with a reason written for the client
   TikTok's own change history comes through no route yet. The page says so and never shows a zero for it.
   Meta > Changes made and Google > Changes made reuse the row and the sheet from here (dayCards, openChange). */

import { put } from '../../kit.js';
import { h, em, card, segmented, platformChip, empty, sheet, button, skeleton, num, addStyles, kpi, tiles } from '../../kit.js';
import { APP_NAME } from '../../config.js';
import { PLATFORM_NAME } from '../../icons.js';
import { style } from '../a-today/_more.js';
import { quiet, longDay } from '../a-today/_ag.js';
import { canUndo, undoSheet, undoneSet, writeOf } from '../meta/_write.js';
import { def, info, headRow, warnLine, rangeChips, clock, levelChip } from './_ads.js';

const CSS = `
button.pc-row{width:100%;border:0;border-top:1px solid var(--line);background:transparent;font:inherit;color:inherit;text-align:left;cursor:pointer}
button.pc-row:hover .t>b{text-decoration:underline;text-decoration-color:var(--line-strong);text-underline-offset:3px}
.pc-row .t .o{font-size:12.5px;color:var(--muted);overflow-wrap:anywhere}
.pc-row .m small{font-weight:400}
.pc-bar{display:flex;align-items:center;gap:12px 16px;flex-wrap:wrap}
.pc-bar h3{margin:0;font-size:16px;font-weight:600;letter-spacing:-.015em}
.pc-bar .sp{flex:1}
.pc-kv{display:grid;gap:0}
.pc-kv>div{display:grid;grid-template-columns:110px minmax(0,1fr);gap:14px;padding:12px 0;border-top:1px solid var(--line);font-size:14px}
.pc-kv>div:first-child{border-top:0}
.pc-kv small{font-size:13px;color:var(--muted)}
.pc-kv span{overflow-wrap:anywhere;line-height:1.45}
.pc-notes{display:grid;gap:6px}
.pc-row .m small{display:block}
.pc-row .m .pc-undone{color:var(--bad);font-weight:600}
.pc-undo{min-height:44px;justify-content:center}
/* Meta > Changes shares this CSS: its second filter row (All / Budgets / Turned off ...) scrolls inside its own row on a phone */
.mc-kinds{min-width:0;max-width:100%}
@media (max-width:759px){
  .mc-kinds .lx-seg,.mc-bar .lx-seg{max-width:100%;overflow-x:auto}
  .mc-kinds .lx-seg button{white-space:nowrap}
  .pc-bar .sp{display:none}
  .pc-bar .lx-seg{max-width:100%;overflow-x:auto}
  .pc-bar .lx-seg button{white-space:nowrap}
  .pc-kv>div{grid-template-columns:86px minmax(0,1fr)}
  .pc-row.ag-sg-r{grid-template-columns:minmax(0,1fr)}
  .pc-row .m{grid-column:1/-1;text-align:left;white-space:normal}
  .pc-row .m small{display:inline;margin-right:8px}
}`;

/* ---------- words ---------- */
const CAT = { budget: 'Budget', bids: 'Bids', bid_strategy: 'Bid strategy', new_campaign: 'New campaign', campaign_paused: 'Turned off', campaign_relaunched: 'Turned back on',
  adset_paused: 'Ad set turned off', ad_paused: 'Ad turned off', ad_relaunched: 'Ad turned back on', targeting: 'Audience', new_creative: 'New ad', new_adset: 'New ad set',
  status: 'On or off', keywords: 'Keywords', new: 'New', optimisation: 'Optimization', schedule: 'Schedule', name: 'Rename', review: 'Ad review', billing: 'Billing', manual: 'Note', other: 'Other' };
export const catWord = c => CAT[c] || String(c || 'other').replace(/_/g, ' ').replace(/^./, m => m.toUpperCase());
/* the changes a person would want to hear about (the same list as the agency page); the rest is housekeeping */
export const MATTER = new Set(['budget', 'new_campaign', 'campaign_paused', 'campaign_relaunched', 'bid_strategy', 'targeting', 'new_creative', 'new_adset', 'manual', 'ad_paused', 'adset_paused']);
export const groupOf = c => /budget|bid/.test(c) ? 'budget' : /paused|relaunched|^status$/.test(c) ? 'onoff' : /^new/.test(c) ? 'new' : 'other';
const platOf = r => /^google/i.test(r.event_type || '') || /^GOOGLE/.test(r.object_type || '') ? 'google' : /^tiktok/i.test(r.event_type || '') || /^TIKTOK/.test(r.object_type || '') ? 'tiktok' : 'meta';
const levelOf = t => { const s = String(t || '').toUpperCase(); return /ADSET|AD_SET|AD_GROUP/.test(s) && !/^ADGROUP$/.test(s) ? 'Ad set' : /CAMPAIGN/.test(s) ? 'Campaign' : /(^|_)AD$|^ADGROUP$/.test(s) ? 'Ad' : /ACCOUNT/.test(s) ? 'Account' : ''; };
const nameOf = who => { const s = String(who || ''); return s.includes('@') ? s.split('@')[0].replace(/[._-]+/g, ' ').replace(/\b\w/g, m => m.toUpperCase()) : s; };
const platName = id => PLATFORM_NAME[id] || id;

/* ---------- time: Meta sends a real instant, Google a wall clock time with no zone ---------- */
const pad = n => String(n).padStart(2, '0');
export function stamp(at) {
  const s = String(at || '');
  if (/(Z|[+-]\d{2}:?\d{2})$/.test(s)) {
    const d = new Date(s.replace(/([+-]\d{2})(\d{2})$/, '$1:$2'));
    if (!isNaN(d)) return { day: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`, min: d.getHours() * 60 + d.getMinutes(), time: clock(d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })) };
  }
  const m = /(\d{2}):(\d{2})/.exec(s.slice(10));
  if (!m) return { day: s.slice(0, 10), min: 0, time: '' };
  const hr = +m[1];
  return { day: s.slice(0, 10), min: hr * 60 + +m[2], time: `${hr % 12 || 12}:${m[2]}${hr < 12 ? 'am' : 'pm'}` };
}
const addDay = date => { const d = new Date(date + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + 1); return d.toISOString().slice(0, 10); };

/* ---------- load: real mode ---------- */
async function load(ctx) {
  if (!ctx.brand) return { no_brand: true };
  const act = encodeURIComponent(ctx.brand.id), w = { from: ctx.range.from, to: ctx.range.to, label: ctx.range.label };
  /* through the end of today: a change made this morning belongs on this page */
  const q = `act=${act}&from=${w.from}&to=${addDay(w.to)}T23:59:59`;
  const ah = path => ctx.api(path, { worker: 'ah', signal: ctx.signal }).catch(e => { if (e && (e.name === 'AbortError' || e.status === 401)) throw e; return { failed: e && e.message ? e.message : 'did not answer' }; });

  if (ctx.isClient) {
    const r = await ah(`/api/ad-updates?${q}`);
    if (r.failed) return { window: w, connected: false, error: r.failed };
    const rows = (r.changes || []).map(c => ({ id: c.id, at: c.at, platform: c.platform || 'meta', cat: c.category, what: c.summary || catWord(c.category), name: c.name || '', level: levelOf(c.level), who: null, via: '', why: c.why || '', matters: true }));
    return { window: w, connected: true, client_view: true, rows, other: 0, notes: [] };
  }

  const [act1, goog] = await Promise.all([ah(`/api/activities?${q}&limit=2000`), ah(`/api/google/ads-changes?act=${act}&from=${w.from}&to=${w.to}`)]);
  if (act1.failed && (goog.failed || goog.error)) return { window: w, connected: false, error: act1.failed };
  const rows = [], notes = [], undone = undoneSet(act1.rows);
  for (const a of (act1.rows || []).filter(a => a.confirmed !== -1)) {
    const cat = a.manual && !a.category ? 'manual' : a.category;
    const app = /^(locus_write|strategist_write)$/.test(String(a.event_type || '')), plat = platOf(a), write = plat === 'meta' ? writeOf(a) : null;
    rows.push({ id: a.id, at: a.event_time, platform: plat, cat, what: a.summary || a.translated || catWord(cat), name: a.object_name || '', level: levelOf(a.object_type),
      who: a.actor || null, via: app ? 'in the app' : a.manual ? 'added by hand' : '', why: a.client_why || a.reason || '', matters: !!a.manual || MATTER.has(cat),
      write, undone: !!(write && undone.has(write)) });
  }
  /* Google's own history. A change made through the app is already in the list above, so the same minute is not listed twice. */
  const seen = new Set(rows.filter(r => r.platform === 'google').map(r => { const s = stamp(r.at); return s.day + '|' + s.min; }));
  const gRows = !goog.failed && !goog.error && Array.isArray(goog.changes) ? goog.changes : null;
  for (const [i, c] of (gRows || []).entries()) {
    const s = stamp(c.at);
    if (seen.has(s.day + '|' + s.min)) continue;
    rows.push({ id: 'g' + i + '|' + c.at, at: c.at, platform: 'google', cat: c.category || 'other', what: c.summary || catWord(c.category), name: '', level: '', who: c.who || null, via: c.via || '', why: '', matters: !!c.matters });
  }
  if (act1.failed) notes.push('The Meta change list did not answer just now, so only Google shows.');
  if (gRows && goog.floor) notes.push(`Google keeps 30 days of changes, so its part starts ${longDay(goog.floor)}.`);
  const key = rows.filter(r => r.matters);
  return { window: w, connected: true, client_view: false, rows: key, other: rows.length - key.length, google_read: !!gRows, notes };
}

/* ---------- the sheet: one change, whole ---------- */
/** openChange(change, d, ctx, redraw) : the one detail of a change (every Ads page uses it). A change that carries
    roas_before / roas_after (7 days before and after) shows them. */
export function openChange(r, d, ctx, redraw) {
  const s = stamp(r.at), kv = (label, value) => value ? h('div', null, h('small', null, label), h('span', null, value)) : null;
  const undoable = !d.client_view && r.platform === 'meta' && canUndo(r, ctx);
  const sh = sheet({ title: r.what, body: h('div', { class: 'pc-notes' },
    h('div', { class: 'pc-kv' }, [
      kv('Platform', platformChip(r.platform)),
      kv('What', catWord(r.cat)),
      r.name ? kv('On', h('span', null, levelChip(r.level), ' ', r.name)) : null,
      kv('When', [longDay(s.day), s.time].filter(Boolean).join(', ')),
      d.client_view ? null : kv('Who', [nameOf(r.who), r.via].filter(Boolean).join(', ')),
      kv('Why', r.why || (d.client_view ? '' : quiet('No reason written yet'))),
      r.roas_before != null || r.roas_after != null ? kv('ROAS', `${r.roas_before != null ? r.roas_before.toFixed(2) + 'x' : 'not read'} in the 7 days before, ${r.roas_after != null ? r.roas_after.toFixed(2) + 'x' : 'not read yet'} since`) : null,
      r.write && !d.client_view ? kv('Write id', r.write) : null,
      r.undone && !d.client_view ? kv('Undo', 'This change was undone. Meta has the old value back.') : null,
    ].filter(Boolean)),
    undoable ? button('Undo this change', { primary: true, class: 'pc-undo', onclick: () => { sh.close(); undoSheet(ctx, { act: ctx.brand.id, write: r.write, what: r.what, name: [r.level, r.name].filter(Boolean).join(' ') }, ok => { if (ok) { r.undone = true; redraw && redraw(); } }); } }) : null,
    !d.client_view && ctx.tab === 'changes' && ctx.line === 'platforms' ? button(`Open ${platName(r.platform)} changes`, { href: ctx.href(r.platform, 'changes'), icon: 'arrow' }) : null) });
}
/** dayCards(rows, d, ctx, redraw) : the list, one card per day, newest first. Every Ads changes page draws this. */
export function dayCards(rows, d, ctx, redraw) {
  const shown = rows.map(r => ({ r, s: stamp(r.at) })).sort((a, b) => b.s.day.localeCompare(a.s.day) || b.s.min - a.s.min);
  const days = new Map();
  for (const v of shown) (days.get(v.s.day) || days.set(v.s.day, []).get(v.s.day)).push(v);
  if (!shown.length) return [empty({ title: 'None of these on these dates' })];
  return [...days].map(([day, rs]) => card({ title: longDay(day), note: `${rs.length} change${rs.length === 1 ? '' : 's'}`, flush: true },
    h('div', { class: 'ag-sg' }, rs.map(({ r, s }) => h('button', { type: 'button', class: 'ag-sg-r ag-ch pc-row', onclick: () => openChange(r, d, ctx, redraw) },
      h('span', { class: 'k' }, s.time),
      h('span', { class: 't' }, h('span', { class: 'ag-ch-h' }, platformChip(r.platform || 'meta'), catWord(r.cat) !== r.what ? h('span', { class: 'lx-chip' }, catWord(r.cat)) : null),
        h('b', null, r.what), r.name ? h('span', { class: 'o' }, levelChip(r.level), ' ', r.name) : null,
        r.why ? h('span', { class: 'w' }, r.why) : d.client_view ? null : quiet('No reason written yet')),
      h('span', { class: 'm' }, r.who && !d.client_view ? h('small', null, nameOf(r.who) + (r.via ? ', ' + r.via : '')) : null,
        r.roas_before != null && r.roas_after != null ? h('small', null, h('b', null, r.roas_before.toFixed(2) + 'x to ' + r.roas_after.toFixed(2) + 'x'), ' ROAS, 7 days before and after') : null,
        r.undone && !d.client_view ? h('small', { class: 'pc-undone' }, 'Undone') : !d.client_view && (r.platform || 'meta') === 'meta' && canUndo(r, ctx) ? h('small', null, 'Tap to undo') : null))))));
}
export function changesCss() { style(); addStyles('pc-css', CSS); }

/* ---------- render ---------- */
function render(el, d, ctx) {
  changesCss();
  if (!ctx.brand || !d || d.no_brand) return put(el, empty({ title: 'Pick a brand', text: 'Changes shows one brand at a time.' }));
  if (d.connected === false) return put(el, empty({ title: 'The change list did not answer', text: d.error || 'Nothing was read. Try again in a minute.',
    action: ctx.isClient ? null : button('Open integrations', { primary: true, href: ctx.href('brand-settings', 'integrations') }) }));
  /* sample numbers seen as a client: only the changes that carry a written reason, and no names */
  if (ctx.isClient && !d.client_view) d = { ...d, client_view: true, other: 0, notes: [], rows: (d.rows || []).filter(r => r.why).map(r => ({ ...r, who: null, via: '' })) };
  const rows = d.rows || [];
  if (!rows.length) return put(el, empty({ title: 'No changes on these dates',
    text: d.client_view ? 'When we change your ads, the change and the reason show here.' : d.other ? `${num(d.other)} small edits, like renames, were left out. Pick a longer date range at the top to see earlier changes.` : 'Pick a longer date range at the top to see earlier changes.' }));

  const n = g => rows.filter(r => groupOf(r.cat) === g).length;
  const plats = ['meta', 'google', 'tiktok'].filter(p => rows.some(r => r.platform === p));
  /* kit tiles, each with its window and source (no longer rewritten from another area's band) */
  const W = d.window ? d.window.label : null, SRC = d.client_view ? 'changes we made' : plats.map(platName).join(' and ') + ' change history';
  const hero = tiles([
    kpi({ label: d.client_view ? 'Changes made for you' : 'Changes', value: num(rows.length), window: W, source: SRC, sub: plats.map(p => `${platName(p)} ${rows.filter(r => r.platform === p).length}`).join(', ') }),
    kpi({ label: 'Budgets moved', value: num(n('budget')), window: W, source: SRC }),
    kpi({ label: 'Turned off or on', value: num(n('onoff')), window: W, source: SRC }),
    kpi({ label: 'New ads and sets', value: num(n('new')), window: W, source: SRC }),
  ], { cols: 4 });

  let plat = ctx.settingNow('platforms.changes.platform', 'all'), kind = 'all';
  if (plat !== 'all' && !plats.includes(plat)) plat = 'all';
  const list = h('div', { class: 'ag', style: { gap: '20px' } });
  const draw = () => put(list, ...dayCards(rows.filter(r => (plat === 'all' || r.platform === plat) && (kind === 'all' || groupOf(r.cat) === kind)), d, ctx, draw));
  draw();
  const bar = h('div', { class: 'pc-bar' }, h('h3', null, 'Every change, newest first'), h('span', { class: 'sp' }),
    plats.length > 1 ? segmented([{ id: 'all', label: 'All platforms' }, ...plats.map(p => ({ id: p, label: platName(p) }))], plat, id => { plat = id; ctx.saveSetting('platforms.changes.platform', id); draw(); }) : null,
    segmented([{ id: 'all', label: 'All' }, { id: 'budget', label: 'Budgets' }, { id: 'onoff', label: 'Off and on' }, { id: 'new', label: 'New' }], 'all', id => { kind = id; draw(); }));

  const help = d.client_view ? [{ title: 'What it is for', text: 'Changes to your ads on every platform, with the reason for each. Tap a change for the whole of it.' }]
    : [{ title: 'What it is for', text: `One list of what changed on Meta, Google and TikTok, newest first, and why. Tap a change for the whole of it; a Meta change made in ${APP_NAME} in the last 24 hours can be undone from there.` },
      { title: 'What is listed', text: `Changes made in Meta and Google Ads, plus changes made in TikTok through ${APP_NAME}.${d.other ? ` ${num(d.other)} small edits (renames, each platform's own housekeeping) are left out.` : ''} Changes made inside TikTok Ads Manager do not come through yet.` },
      ...(d.notes || []).map(t => ({ title: 'Note', text: t }))];
  put(el, h('div', { class: 'ag' }, headRow({ help }),
    !d.client_view && d.google_read === false ? warnLine('Google Ads is not connected for this brand, or its change history did not answer.') : null,
    hero, h('div', { class: 'ag', style: { gap: '16px' } }, bar, list)));
}

export default {
  title: 'Changes on every platform',
  eyebrow: 'All platforms',
  load,
  skeleton(el) { put(el, h('div', { class: 'lx-skel-grid' }, skeleton('kpi', 4)), skeleton('row', 8)); },
  render,
};

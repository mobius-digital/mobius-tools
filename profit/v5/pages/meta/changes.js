/* Ads > Meta > Changes made for one brand: who changed what on Meta, and why, on the dates in the page head.
   Four counts, date chips and kind filters, then the list, day by day (the same rows and detail sheet as All platforms >
   Changes made: platforms/changes.js dayCards and openChange). A change made through the app in the last 24 hours
   carries Undo (team only): a confirm sheet, then POST account-health /api/meta/undo {act, write}. The write id is
   read from the change's note ("Write mw_..."); a later "Undo of mw_..." row marks it undone.

   Real mode reads:
     GET /api/activities?act=&from=&to=&limit=    account-health: every change Meta logged or the team added (team)
     GET /api/ad-updates?act=&from=&to=           account-health: only the changes with a note written for the client (client view) */

import { put } from '../../kit.js';
import { h, card, kpi, tiles, segmented, empty, skeleton, num } from '../../kit.js';
import { addDays, gate, styles } from './_rest.js';
import { undoneSet, writeOf } from './_write.js';
import { def, info, headRow } from '../platforms/_ads.js';
import { dayCards, changesCss } from '../platforms/changes.js';

const CSS = `
.mc-bar{display:flex;align-items:center;gap:10px 16px;flex-wrap:wrap}
.mc-bar h3{margin:0;font-size:var(--fs-section,17px);font-weight:600;line-height:1.25}
.mc-sec{margin:0;padding:0}
.mc-bar .sp{flex:1}
.mc-mode{display:inline-flex;align-items:center;gap:6px}
.mc-days{display:grid;gap:16px}
@media (max-width:759px){
  .mc-bar .lx-seg{max-width:100%;overflow-x:auto}
  .mc-bar .lx-seg button{white-space:nowrap}
}`;

const CAT = { budget: 'Budget', new_campaign: 'New campaign', campaign_paused: 'Turned off', campaign_relaunched: 'Turned back on', bid_strategy: 'Bid strategy', targeting: 'Audience',
  new_creative: 'New ad', new_adset: 'New ad set', ad_paused: 'Ad turned off', ad_relaunched: 'Ad turned back on', optimisation: 'Optimization', schedule: 'Schedule', name: 'Rename', review: 'Ad review', billing: 'Billing', manual: 'Note', other: 'Other' };
const catWord = c => CAT[c] || String(c || 'other').replace(/_/g, ' ').replace(/^./, m => m.toUpperCase());
/* the changes a person would want to hear about; the rest is Meta's own housekeeping */
const MATTERS = new Set(['budget', 'new_campaign', 'campaign_paused', 'campaign_relaunched', 'bid_strategy', 'targeting', 'new_creative', 'new_adset', 'manual']);
const LEVEL = t => { const s = String(t || '').toUpperCase(); return /ADSET|AD_SET/.test(s) ? 'Ad set' : /CAMPAIGN/.test(s) ? 'Campaign' : /(^|_)AD$/.test(s) ? 'Ad' : /ACCOUNT/.test(s) ? 'Account' : ''; };

/* ---------- load: real mode ---------- */
async function load(ctx) {
  const act = encodeURIComponent(ctx.brand.id), w = { from: ctx.range.from, to: ctx.range.to, label: ctx.range.label };
  /* through the end of today: a change made this morning belongs on this page */
  const q = `act=${act}&from=${w.from}&to=${addDays(w.to, 1)}T23:59:59`;
  let rows;
  try {
    if (ctx.isClient) {
      const r = await ctx.api(`/api/ad-updates?${q}`, { worker: 'ah', signal: ctx.signal });
      rows = (r.changes || []).filter(c => c.platform === 'meta').map(c => ({ id: c.id, at: c.at, who: null, cat: c.category, what: c.summary || catWord(c.category), name: c.name || '', level: LEVEL(c.level), why: c.why || '', matters: true, platform: 'meta' }));
    } else {
      const r = await ctx.api(`/api/activities?${q}&limit=2000`, { worker: 'ah', signal: ctx.signal });
      const undone = undoneSet(r.rows);
      rows = (r.rows || []).filter(a => a.confirmed !== -1).map(a => {
        const app = /^(locus_write|strategist_write)$/.test(String(a.event_type || '')), write = writeOf(a);
        return { id: a.id, at: a.event_time, who: a.actor || null, by_hand: !!a.manual && !app, app, write, undone: !!(write && undone.has(write)), cat: a.manual && !a.category ? 'manual' : a.category,
          what: a.summary || a.translated || catWord(a.category), name: a.object_name || '', level: LEVEL(a.object_type), why: a.reason || a.client_why || '', matters: !!a.manual || MATTERS.has(a.category),
          platform: 'meta', via: app ? 'in the app' : a.manual ? 'added by hand' : '', roas_before: a.roas_before ?? null, roas_after: a.roas_after ?? null };
      });
    }
  } catch (e) { if (e && (e.name === 'AbortError' || e.status === 401)) throw e; if (/meta|connect/i.test(e.message || '')) return { connected: false, error: e.message }; throw e; }
  return { window: w, connected: true, client_view: !!ctx.isClient, rows };
}

/* ---------- the parts ---------- */
const KINDS = [['all', 'All'], ['budget', 'Budgets', c => c === 'budget' || c === 'bid_strategy'], ['off', 'Turned off', c => /paused/.test(c)], ['on', 'Turned on', c => /relaunched/.test(c)],
  ['new', 'New ads and sets', c => /^new_/.test(c)], ['audience', 'Audience', c => c === 'targeting']];

const SRC = 'Locus change log';
function figures(d) {
  const r = d.rows || [], n = f => r.filter(f).length, wl = d.window && d.window.label ? d.window.label : null;
  const tile = (label, value, sub) => kpi({ label, value: num(value), sub, window: wl, source: SRC });
  return tiles([
    tile('Changes', r.length, d.client_view ? 'made for you' : [num(n(a => a.matters)), ' ', def('that matter', 'matters')]),
    tile('Budget changes', n(a => a.cat === 'budget')),
    tile('Turned off', n(a => a.cat === 'campaign_paused' || a.cat === 'ad_paused')),
    tile('New ads', n(a => a.cat === 'new_creative'))], { cols: 4, class: 'mc-kp' });
}
function listCard(d, ctx) {
  const all = d.rows || [], key = all.filter(r => r.matters);
  let mode = d.client_view || !key.length ? 'all' : ctx.settingNow('meta.changes.mode', 'key'), kind = 'all', shown = 80;
  const body = h('div', { class: 'mc-days' }), kinds = h('div', { class: 'mc-kinds' });
  const paint = () => {
    const test = (KINDS.find(k => k[0] === kind) || [])[2];
    const rows = (mode === 'key' ? key : all).filter(r => !test || test(r.cat || ''));
    put(body, ...dayCards(rows.slice().sort((p, q) => String(q.at).localeCompare(String(p.at))).slice(0, shown), d, ctx, paint),
      rows.length > shown ? h('div', { class: 'mr-more' }, h('button', { class: 'lx-btn', type: 'button', onclick: () => { shown = rows.length; paint(); } }, `Show all ${num(rows.length)}`)) : null);
  };
  const kindBar = () => put(kinds, segmented(KINDS.filter(k => k[0] === 'all' || all.some(r => k[2](r.cat || ''))).map(([id, label]) => ({ id, label })), kind, id => { kind = id; shown = 80; paint(); }));
  paint(); kindBar();
  const seg = d.client_view || !key.length || key.length === all.length ? null
    : h('span', { class: 'mc-mode' }, segmented([{ id: 'key', label: `Changes that matter ${key.length}` }, { id: 'all', label: `Everything ${all.length}` }], mode, id => { mode = id; shown = 80; ctx.saveSetting('meta.changes.mode', id); paint(); }), info('matters'));
  return [
    h('div', { class: 'mc-bar' }, h('div', { class: 'lx-sec mc-sec' }, h('h3', null, 'Changes'), h('span', { class: 'note' }, `${d.window && d.window.label ? d.window.label : 'These dates'}, newest first`)), h('span', { class: 'sp' }), seg),
    h('div', { class: 'mc-bar' }, kinds),
    body,
  ];
}

export default {
  title: 'Changes',
  eyebrow: 'Meta',
  load,
  skeleton(el) { put(el, h('div', { class: 'lx-skel-grid' }, skeleton('kpi', 4)), skeleton('row', 8)); },
  render(el, d, ctx) {
    styles('mc-css', CSS); changesCss();
    const stop = gate(d, ctx, 'Changes');
    if (stop) return put(el, stop);
    /* sample numbers seen as a client: only the changes that carry a written reason, and no names */
    if (ctx.isClient && !d.client_view) d = { ...d, client_view: true, rows: (d.rows || []).filter(r => r.matters && r.why).map(r => ({ ...r, who: null, via: '' })) };
    const help = d.client_view ? [{ title: 'What it is for', text: 'Changes to your Facebook and Instagram ads, with the reason for each. Tap a change for the whole of it.' }]
      : [{ title: 'What it is for', text: 'Who changed what on Meta, and why, on the dates in the page head. Today\'s changes are always included. Tap a change for the whole of it.' },
        { title: 'Where it comes from', text: 'Meta\'s own activity log plus every change made in the app. A change made in the app can be undone from its detail for 24 hours.' }];
    const top = headRow({ help });
    const r = d.rows || [];
    ctx.askWindow = d.window && d.window.label ? d.window.label : null;
    ctx.askContext = `Changes on Meta for ${ctx.brand && ctx.brand.name ? ctx.brand.name : 'this brand'}, ${d.window && d.window.label ? d.window.label : 'these dates'}: ${r.length} changes, ${r.filter(a => a.cat === 'budget').length} to budgets, ${r.filter(a => a.cat === 'campaign_paused' || a.cat === 'ad_paused').length} turned off, ${r.filter(a => a.cat === 'new_creative').length} new ads.`;
    if (!(d.rows || []).length) return put(el, top, empty({ title: 'No changes on these dates', text: d.client_view ? 'When we change your Meta ads, the change and the reason show here.' : `Nothing changed on Meta ${d.window && d.window.label ? d.window.label : 'on these dates'}. Pick a longer range at the top.` }));
    put(el, top, figures(d), ...listCard(d, ctx));
  },
};

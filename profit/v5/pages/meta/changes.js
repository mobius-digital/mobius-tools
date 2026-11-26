/* Ads > Meta > Changes made for one brand: who changed what on Meta, and why, on the dates in the page head.
   Four counts, changes by day, then the list, day by day. Read only.

   Real mode reads:
     GET /api/activities?act=&from=&to=&limit=    account-health: every change Meta logged or the team added (team)
     GET /api/ad-updates?act=&from=&to=           account-health: only the changes with a note written for the client (client view) */

import { put } from '../../kit.js';
import { h, em, card, kpi, segmented, barChart, empty, skeleton, num } from '../../kit.js';
import { APP_NAME } from '../../config.js';
import { shortDate, weekDate, addDays, gate, oldLink, foot, styles } from './_rest.js';

const CSS = `
.mc-day{display:flex;align-items:baseline;gap:12px;padding:16px 28px 8px;border-top:1px solid var(--line)}
.mc-day:first-child{border-top:0}
.mc-day b{font-size:13.5px;font-weight:600}.mc-day span{color:var(--muted);font-size:12.5px}
.mc-r{display:grid;grid-template-columns:76px minmax(0,1fr) 190px;gap:18px;align-items:start;padding:12px 28px}
.mc-r .t{color:var(--muted);font-size:12.5px;font-variant-numeric:tabular-nums;padding-top:2px;white-space:nowrap}
.mc-r .w b{display:block;font-size:14px;font-weight:600;overflow-wrap:anywhere}
.mc-r .w .o{display:block;margin-top:2px;color:var(--muted);font-size:12.5px;overflow-wrap:anywhere}
.mc-r .w .y{display:block;margin-top:6px;font-size:13.5px;color:var(--ink-2);line-height:1.45;max-width:70ch}
.mc-r .w .y i{font-style:normal;color:var(--faint)}
.mc-r .p{display:grid;gap:4px;justify-items:end;text-align:right;font-size:12.5px;color:var(--muted)}
.mc-pad{height:10px}
.mc-none{padding:22px 28px;color:var(--muted)}
.mc-kp{grid-template-columns:repeat(4,minmax(0,1fr))}
@media (max-width:759px){
  .mc-kp{grid-template-columns:repeat(2,minmax(0,1fr))}
  .mc-day{padding:14px 16px 6px}
  .mc-r{grid-template-columns:58px minmax(0,1fr);gap:4px 12px;padding:10px 16px}
  .mc-r .p{grid-column:2;justify-items:start;text-align:left;grid-auto-flow:column;justify-content:start;gap:10px}
  .mc-none{padding:18px 16px}
  .mc-list .lx-sec{flex-wrap:wrap;row-gap:10px}
  .mc-list .lx-sec .act{flex-basis:100%;margin-left:0}
  .mc-list .lx-seg button{white-space:nowrap}
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
      rows = (r.changes || []).filter(c => c.platform === 'meta').map(c => ({ id: c.id, at: c.at, who: null, cat: c.category, what: c.summary || catWord(c.category), name: c.name || '', level: LEVEL(c.level), why: c.why || '', matters: true }));
    } else {
      const r = await ctx.api(`/api/activities?${q}&limit=2000`, { worker: 'ah', signal: ctx.signal });
      rows = (r.rows || []).filter(a => a.confirmed !== -1).map(a => ({ id: a.id, at: a.event_time, who: a.actor || null, by_hand: !!a.manual, cat: a.manual && !a.category ? 'manual' : a.category,
        what: a.summary || a.translated || catWord(a.category), name: a.object_name || '', level: LEVEL(a.object_type), why: a.reason || a.client_why || '', matters: !!a.manual || MATTERS.has(a.category) }));
    }
  } catch (e) { if (e && (e.name === 'AbortError' || e.status === 401)) throw e; if (/meta|connect/i.test(e.message || '')) return { connected: false, error: e.message }; throw e; }
  return { window: w, connected: true, client_view: !!ctx.isClient, rows };
}

/* ---------- the parts ---------- */
const dayOf = at => String(at || '').slice(0, 10);
const timeOf = at => { const d = new Date(at); return isNaN(d) ? '' : d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }); };
const nameOf = who => { const s = String(who || ''); return s.includes('@') ? s.split('@')[0].replace(/[._]/g, ' ').replace(/\b\w/g, m => m.toUpperCase()) : s; };

function figures(d) {
  const r = d.rows || [], n = f => r.filter(f).length;
  return h('div', { class: 'mr-kp mc-kp' },
    kpi({ size: 'lg', label: 'Changes', value: num(r.length), sub: d.client_view ? 'made for you' : `${num(n(a => a.matters))} that matter` }),
    kpi({ size: 'lg', label: 'Budget changes', value: num(n(a => a.cat === 'budget')) }),
    kpi({ size: 'lg', label: 'Turned off', value: num(n(a => a.cat === 'campaign_paused' || a.cat === 'ad_paused')) }),
    kpi({ size: 'lg', label: 'New ads', value: num(n(a => a.cat === 'new_creative')) }));
}
function chartCard(d) {
  const w = d.window || {}, days = [];
  if (!w.from || !w.to) return null;
  const last = (d.rows || []).reduce((m, r) => (dayOf(r.at) > m ? dayOf(r.at) : m), w.to);
  for (let x = w.from; x <= last && days.length < 400; x = addDays(x, 1)) days.push(x);
  if (days.length < 2) return null;
  const by = {}; for (const r of d.rows || []) if (r.matters) by[dayOf(r.at)] = (by[dayOf(r.at)] || 0) + 1;
  const vals = days.map(x => by[x] || 0), peak = Math.max(...vals);
  return card({},
    h('div', { class: 'lx-chart-h' }, h('div', null, h('div', { class: 'lx-sec' }, h('h3', null, 'When did the account change?')), h('p', null, d.client_view ? 'changes by day' : 'changes that matter, by day'))),
    barChart({ values: vals, labels: days.map(shortDate), height: 240, phoneHeight: 210, yMax: Math.max(4, peak), yTicks: peak <= 4 ? 4 : undefined, format: v => num(v), empty: 'No changes on these dates',
      label: 'Changes on Meta by day', hover: i => [h('b', null, shortDate(days[i])), h('span', null, `${vals[i]} ${vals[i] === 1 ? 'change' : 'changes'}`)] }));
}
function listCard(d, ctx) {
  const all = d.rows || [], key = all.filter(r => r.matters);
  let mode = d.client_view || !key.length ? 'all' : ctx.settingNow('meta.changes.mode', 'key'), shown = 80;
  const body = h('div');
  const paint = () => {
    const rows = (mode === 'key' ? key : all).slice().sort((p, q) => String(q.at).localeCompare(String(p.at)));
    if (!rows.length) return put(body, h('div', { class: 'mc-none' }, 'No changes on these dates.'));
    const out = []; let day = '';
    for (const r of rows.slice(0, shown)) {
      if (dayOf(r.at) !== day) { day = dayOf(r.at); const n = rows.filter(q => dayOf(q.at) === day).length; out.push(h('div', { class: 'mc-day' }, h('b', null, weekDate(day)), h('span', null, `${n} ${n === 1 ? 'change' : 'changes'}`))); }
      out.push(h('div', { class: 'mc-r' },
        h('span', { class: 't' }, timeOf(r.at)),
        h('span', { class: 'w' }, h('b', null, r.what), r.name ? h('span', { class: 'o' }, (r.level ? r.level + ' ' : '') + r.name) : null,
          r.why ? h('span', { class: 'y' }, r.why) : (!d.client_view && r.matters ? h('span', { class: 'y' }, h('i', null, 'No reason written yet')) : null)),
        h('span', { class: 'p' }, h('span', { class: 'lx-chip' }, catWord(r.cat)), r.who ? h('span', null, nameOf(r.who) + (r.by_hand ? ', added by hand' : '')) : null)));
    }
    out.push(h('div', { class: 'mc-pad' }));
    if (rows.length > shown) out.push(h('div', { class: 'mr-more', style: { padding: '0 0 18px' } }, h('button', { class: 'lx-btn', type: 'button', onclick: () => { shown = rows.length; paint(); } }, `Show all ${num(rows.length)}`)));
    put(body, ...out);
  };
  paint();
  const seg = d.client_view || !key.length || key.length === all.length ? null
    : segmented([{ id: 'key', label: `Ones that matter ${key.length}` }, { id: 'all', label: `Everything ${all.length}` }], mode, id => { mode = id; shown = 80; ctx.saveSetting('meta.changes.mode', id); paint(); });
  return card({ title: 'What changed', note: 'newest first', flush: true, class: 'mr-list mc-list', action: seg }, body);
}

export default {
  title: ['What changed on Meta, ', em('and why?')],
  eyebrow: 'Meta',
  load,
  skeleton(el) { put(el, h('div', { class: 'lx-skel-grid' }, skeleton('kpi', 4)), skeleton('row', 8)); },
  render(el, d, ctx) {
    styles('mc-css', CSS);
    const stop = gate(d, ctx, 'Changes made');
    if (stop) return put(el, stop);
    /* sample numbers seen as a client: only the changes that carry a written reason, and no names */
    if (ctx.isClient && !d.client_view) d = { ...d, client_view: true, rows: (d.rows || []).filter(r => r.matters && r.why).map(r => ({ ...r, who: null })) };
    if (!(d.rows || []).length) return put(el, empty({ title: 'No changes on these dates', text: d.client_view ? 'When we change your Meta ads, the change and the reason show here.' : `Nothing changed on Meta ${d.window && d.window.label ? d.window.label : 'on these dates'}. Pick a longer date range at the top.`, action: oldLink(ctx) }));
    put(el, ...[
      figures(d), chartCard(d), listCard(d, ctx),
      foot(d.client_view ? 'Changes to your Facebook and Instagram ads, with the reason for each.' : 'From Meta\'s own activity log plus changes the team added by hand. To add a reason or a change, use the old page for now.'),
      !d.client_view ? oldLink(ctx, 'Add a reason in old ' + APP_NAME) : null,
    ].filter(Boolean));
  },
};

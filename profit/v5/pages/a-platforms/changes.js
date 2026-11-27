/* Agency > All platforms > Changes made. What changed in the ad accounts, every brand, newest first, by day.
   Only the changes that matter (budgets, things turned off or on, new ads and sets, targeting); renames and Meta's own
   housekeeping are counted, not listed.
   Real: account-health GET /api/activities?act=all&from&to (Meta, and Google or TikTok writes made through Locus).
   Google's own change history is per brand only (/api/google/ads-changes) and is not read here yet. */

import { put } from '../../kit.js';
import { headRow, clock } from '../platforms/_ads.js';
import { APP_NAME } from '../../config.js';
import { style } from '../a-today/_more.js';
import { h, em, segmented, platformChip, empty, card, kpi, tiles } from '../../kit.js';
import { world, brandName, brandHref, quiet, longDay, shortDay } from '../a-today/_ag.js';

const MATTER = ['budget', 'new_campaign', 'campaign_paused', 'campaign_relaunched', 'bid_strategy', 'targeting', 'new_creative', 'new_adset', 'manual', 'ad_paused', 'adset_paused'];
const GROUP = c => /budget|bid/.test(c) ? 'budget' : /paused|relaunched/.test(c) ? 'onoff' : /^new_/.test(c) ? 'new' : 'other';
const platOf = r => /^google/i.test(r.event_type || '') || /^GOOGLE/.test(r.object_type || '') ? 'google' : /^tiktok/i.test(r.event_type || '') || /^TIKTOK/.test(r.object_type || '') ? 'tiktok' : 'meta';

async function load(ctx) {
  const { from, to } = ctx.range;
  const d = await ctx.api(`/api/activities?act=all&from=${from}&to=${to}T23:59:59&limit=2000`, { worker: 'ah', signal: ctx.signal });
  const all = (d.rows || []).filter(r => r.confirmed !== -1);
  const rows = all.filter(r => MATTER.includes(r.category)).map(r => ({ id: r.id, time: r.event_time, brand_id: r.act_id, brand: r.account_name, platform: platOf(r),
    category: r.category, summary: r.summary || r.translated || r.object_name || '', by: r.actor || '', why: r.client_why || r.reason || '' }));
  return { from, to, rows, other: all.length - rows.length };
}
async function sample(ctx) { const w = await world(), rows = w.changes.rows.filter(r => MATTER.includes(r.category)); return { from: ctx.range.from, to: ctx.range.to, rows, other: 41 + w.changes.rows.length - rows.length }; }

/* "Nov 1 to 22" in one month, "Oct 28 to Nov 3" across two: the one date form of every Ads page */
const rangeLabel = (from, to) => { if (!from || !to) return ''; const a = shortDay(from), b = shortDay(to); return from === to ? a : a.split(' ')[0] === b.split(' ')[0] ? a + ' to ' + b.split(' ')[1] : a + ' to ' + b; };

function render(el, d, ctx) {
  style();
  const rows = (d && d.rows) || [];
  if (!rows.length) return put(el, empty({ title: 'No changes on these dates', text: d && d.other ? `${d.other} small edits, like renames, were left out.` : 'Pick other dates to see earlier changes.' }));
  const n = g => rows.filter(r => GROUP(r.category) === g).length;
  const brands = new Set(rows.map(r => r.brand_id));
  const W = rangeLabel(d.from, d.to), SRC = 'Meta change history and changes made in ' + APP_NAME;
  const hero = tiles([
    kpi({ label: 'Changes', value: String(rows.length), window: W, source: SRC, sub: `across ${brands.size} brand${brands.size === 1 ? '' : 's'}` }),
    kpi({ label: 'Budgets moved', value: String(n('budget')), window: W, source: SRC }),
    kpi({ label: 'Turned off or on', value: String(n('onoff')), window: W, source: SRC }),
    kpi({ label: 'New ads and sets', value: String(n('new')), window: W, source: SRC }),
  ], { cols: 4 });

  const list = h('div', { class: 'ag', style: { gap: '20px' } });
  const draw = pick => {
    const shown = rows.filter(r => pick === 'all' || GROUP(r.category) === pick).sort((a, b) => String(b.time).localeCompare(String(a.time)));
    const days = new Map();
    for (const r of shown) { const k = String(r.time).slice(0, 10); (days.get(k) || days.set(k, []).get(k)).push(r); }
    put(list, ...(shown.length ? [...days].map(([day, rs]) => card({ title: longDay(day), note: `${rs.length} change${rs.length === 1 ? '' : 's'}`, flush: true },
      h('div', { class: 'ag-sg' }, rs.map(r => h('div', { class: 'ag-sg-r ag-ch' },
        h('span', { class: 'k' }, clock(new Date(r.time).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }))),
        h('span', { class: 't' }, h('span', { class: 'ag-ch-h' }, brandName({ id: r.brand_id, name: r.brand }, ctx, brandHref(r.brand_id, 'platforms', 'changes')), platformChip(r.platform)),
          h('b', null, r.summary), r.why ? h('span', { class: 'w' }, r.why) : quiet('No reason written')),
        h('span', { class: 'm' }, r.by ? h('small', null, r.by) : null)))))) : [empty({ title: 'None of these on these dates' })]));
  };
  draw('all');
  const filter = h('div', { class: 'lx-sec', style: { flexWrap: 'wrap', gap: '12px' } }, h('h3', null, 'Every change, newest first'),
    segmented([{ id: 'all', label: 'All' }, { id: 'budget', label: 'Budgets' }, { id: 'onoff', label: 'Off and on' }, { id: 'new', label: 'New' }], 'all', draw));
  const help = headRow({ help: [
    { title: 'What it is for', text: 'What changed in every brand\'s ad accounts, newest first, and why.' },
    { title: 'What is listed', text: `Changes made in Meta, and in Google or TikTok through ${APP_NAME}.${d.other ? ` ${d.other} small edits (renames, Meta's own housekeeping) are not listed.` : ''} A brand's own Changes tab is where a reason is added.` },
  ] });
  put(el, h('div', { class: 'ag' }, help, hero, h('div', { class: 'ag', style: { gap: '16px' } }, filter, list)));
}

export default {
  title: 'Changes, all brands',
  eyebrow: 'All platforms',
  load, sample, render,
};

/* Ads > Google > Changes made for one brand: who changed what on Google Ads, and did it work.
   Three counts, then the changes that matter day by day, then the small ones folded together. Read only.

   Real mode reads account-health GET /api/google/ads-changes?act=&from=&to= (Google's own change history, in plain
   words; Google keeps 30 days, so older dates are clamped and the page says so). A "why" line and the Triple Whale
   ROAS before and after a budget or bid change are shown only when the data carries them: no route gives them yet. */

import { put } from '../../kit.js';
import { h, em, card, kpi, pill, statusDot, empty, num, x } from '../../kit.js';
import { headRow, warnLine, rangeChips, def } from '../platforms/_ads.js';
import { dayCards, changesCss } from '../platforms/changes.js';
import { styles, gate, loadChanges, sampleGoogle, strip, shortDate, figs } from './_g.js';

const CAT = { budget: ['', 'Budget'], bids: ['', 'Bids'], status: ['', 'On or off'], keywords: ['', 'Keywords'], new: ['', 'New'], other: ['', 'Other'] };
const day = at => String(at || '').slice(0, 10);
const time = at => { const m = /(\d{2}):(\d{2})/.exec(String(at || '').slice(10)); if (!m) return ''; const hr = +m[1]; return (hr % 12 || 12) + ':' + m[2] + (hr < 12 ? 'am' : 'pm'); };
/* An email reads as its name part; a name stays as it is. */
const person = w => { const s = String(w || ''); if (!s.includes('@')) return s || 'Google'; const n = s.split('@')[0].replace(/[._-]+/g, ' '); return n.replace(/\b\w/g, c => c.toUpperCase()); };

function changeRow(c) {
  const k = CAT[c.category] || CAT.other;
  const moved = c.before != null && c.after != null;
  return h('div', { class: 'gg-chg' },
    pill(k[0], k[1]),
    h('span', { class: 'tx' },
      h('b', null, c.summary),
      h('span', null, [time(c.at), person(c.who), c.via].filter(Boolean).join(' · ')),
      c.why ? h('span', null, 'Why: ' + c.why) : null),
    moved ? h('span', { class: 'ba' }, h('b', null, x(c.before) + ' to ' + x(c.after)),
      'ROAS, 7 days before and ' + (c.after_days || 7) + ' days after') : null);
}

function byDay(rows) {
  const days = [];
  for (const c of rows) { const d = day(c.at); let g = days.find(x => x.d === d); if (!g) days.push(g = { d, rows: [] }); g.rows.push(c); }
  return days.map(g => h('div', { class: 'gg-day' }, h('span', { class: 'd' }, shortDate(g.d)), h('div', null, g.rows.map(changeRow))));
}

export default {
  title: 'Changes on Google',
  eyebrow: 'Google',
  load: loadChanges,
  sample: sampleGoogle,
  render(el, d, ctx) {
    styles();
    const stop = gate(d, ctx);
    if (stop) return put(el, stop);
    const c = d.changes || {}, rows = c.rows || [], other = c.other || [];
    const people = new Set(rows.map(r => person(r.who))).size;
    const money = rows.filter(r => r.category === 'budget' || r.category === 'bids').length;
    const small = other.reduce((t, o) => t + (o.n || 1), 0);
    const clampNote = c.floor ? `Google keeps 30 days of changes, so this starts ${shortDate(c.floor)}.` : 'Google keeps 30 days of changes.';
    changesCss();
    const help = [
      { title: 'What it is for', text: 'Who changed what on the Google Ads account, newest first, and whether it worked: a budget or bid change shows the ROAS 7 days before and after when it is known. Tap a change for the whole of it.' },
      { title: 'Where it comes from', text: 'Google Ads\' own change history. ' + clampNote + ' ROAS before and after is Triple Whale, last click. Read only.' },
    ];
    const top = headRow({ help });
    if (!rows.length && !other.length) {
      return put(el, top, strip({ title: 'No changes on these dates', text: 'Nobody changed the Google Ads account for ' + d.window.label + '. ' + clampNote }));
    }
    const as = c => ({ id: c.at + '|' + c.summary, at: c.at, platform: 'google', cat: c.category, what: c.summary, name: c.name || '', level: c.level || '', who: person(c.who), via: c.via || '', why: c.why || '', roas_before: c.before ?? null, roas_after: c.after ?? null });
    const redraw = () => {};
    put(el, ...[
      top,
      figs([
        kpi({ label: def('Changes that matter', 'matters'), value: num(rows.length), sub: 'budgets, bids, on or off, keywords, new', window: d.window.label, source: 'Google Ads change history' }),
        kpi({ label: 'Budget and bid changes', value: num(money), sub: money ? 'each with its ROAS before and after, where known' : 'none on these dates', window: d.window.label, source: 'Google Ads change history' }),
        kpi({ label: 'Made by', value: num(people), small: people === 1 ? 'person' : 'people', sub: small ? num(small) + ' small edits folded below' : 'no small edits', window: d.window.label, source: 'Google Ads change history' })], 'gg-chfigs'),
      c.clamped ? warnLine(clampNote) : null,
      c.truncated ? warnLine('Only the newest 200 changes are read.') : null,
      ...(rows.length ? dayCards(rows.map(as), { client_view: !!ctx.isClient }, ctx, redraw) : []),
      other.length ? card({ title: rows.length ? `${num(small)} small edits` : 'Only small edits', note: 'assets and extensions' },
        h('details', { class: 'gg-more', open: rows.length ? null : true }, h('summary', null, 'Show them'),
          other.map(o => changeRow({ ...o, summary: o.n > 1 ? `${o.summary} (${o.n} times)` : o.summary, category: 'other' })))) : null,
    ].filter(Boolean));
  },
};

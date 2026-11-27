/* Agency > Team: today's check-in (2026-11-26, move lines a10). Who posted a plan, who is out and who has not, the
   same board the daily check-in post in Slack shows. Data: GET /api/mywork/plans (account-health mywork.js ->
   checkin.js plansToday, settings checkin:<date>). Read only: each person posts their own plan from My day or Slack.
   boardRows is pure (tested in test-locus-homes.mjs). */

import { h, card, avatar, statusDot } from '../../kit.js';

const clock = iso => iso ? new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }).replace(' ', '').toLowerCase() : '';
const ORDER = { none: 0, plan: 1, out: 2 };

/** One row per daily person (the week only people are left out): not posted first, then plans, then out. Pure. */
export function boardRows(board) {
  return ((board && board.people) || []).filter(p => !p.week_only).map(p => ({
    name: p.name, state: p.state,
    tone: p.state === 'plan' ? 'good' : p.state === 'out' ? 'off' : 'warn',
    label: p.state === 'plan' ? 'Plan in' + (p.plan && p.plan.at ? ', ' + clock(p.plan.at) : '') : p.state === 'out' ? 'Out today' + (p.back ? ', back ' + p.back : '') : 'No plan yet',
    items: (p.items || []).slice(0, 3), more: Math.max(0, (p.items || []).length - 3),
    wrap: p.wrap ? (p.wrap.of ? `wrap-up: ${p.wrap.done} of ${p.wrap.of} done` : 'wrap-up posted') : '',
    need: (p.need || [])[0] || '',
  })).sort((a, b) => ORDER[a.state] - ORDER[b.state] || a.name.localeCompare(b.name));
}

/** The card, or null when the board did not answer. */
export function checkinCard(board) {
  if (!board) return null;
  const rows = boardRows(board);
  const c = board.counts || {};
  const note = board.weekend ? 'weekend, no check-in' : `${c.plan || 0} in, ${c.out || 0} out, ${c.none || 0} not yet`;
  return card({ title: "Today's check-in", note, flush: true },
    rows.length ? rows.map(r => h('div', { class: 'tm-r tm-ci' },
      h('div', { class: 'tm-p' }, avatar({ name: r.name }, { size: 34 }), h('span', null, h('b', null, r.name), h('small', null, r.wrap || (r.need ? 'needs: ' + r.need : '')))),
      h('div', { class: 'tm-t' }, r.items.length ? r.items.map(x => h('small', null, x)) : h('small', null, r.state === 'out' ? '' : 'Nothing posted yet'), r.more ? h('small', null, `and ${r.more} more`) : null),
      h('div', { class: 'tm-n' }, statusDot(r.tone, r.label))))
      : h('p', { class: 'tm-legend' }, 'No one is on the daily check-in list yet.'));
}

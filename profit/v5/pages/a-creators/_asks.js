/* Agency > Creators: "Falling behind" (2026-11-26, move lines a45). What the morning creator post in each brand
   channel asks besides launching, so the post can go quiet without losing it:
     - videos waiting for a yes 2 days or more
     - creators waiting on an answer in the brand's creator Discord
     - Monday: creators to rebook (their ads beat the account cost per sale and they have gone quiet)
   Data: GET /api/trybe/asks on the account-health worker, this morning's snapshot (trybe.js trybeTick, settings
   trybeAsks). `fresh: false` = not counted yet today; the section then says so instead of showing zeros. `missing`
   = brands the morning run did not reach (out of calls); they get the same "not counted yet" line by name.
   The strategist also gets the same counts as My day and bell lines (movelines.js creators). */

import { h, statusDot } from '../../kit.js';

const many = (n, one, more) => `${n} ${n === 1 ? one : more || one + 's'}`;
const listOf = (names, max = 4) => names.length <= max ? names.join(', ') : `${names.slice(0, max).join(', ')} and ${names.length - max} more`;

/** One row per ask, oldest kind first. Pure. `snap` = the route's answer. */
export function asksRows(snap) {
  const out = [];
  for (const b of (snap && Array.isArray(snap.brands) ? snap.brands : [])) {
    if (!b || !b.act) continue;
    if (+b.old_review > 0) out.push({ act: b.act, name: b.name || '', kind: 'old', tone: 'bad', text: `${many(+b.old_review, 'video')} waiting for a yes 2 days or more` });
    if (+b.discord > 0) out.push({ act: b.act, name: b.name || '', kind: 'discord', tone: 'warn', text: `${many(+b.discord, 'creator')} waiting on an answer in Discord` });
    const rb = (Array.isArray(b.rebook) ? b.rebook : []).map(c => c && c.name).filter(Boolean);
    if (rb.length) out.push({ act: b.act, name: b.name || '', kind: 'rebook', tone: '', text: `Rebook this week: ${listOf(rb)}` });
  }
  const order = { old: 0, discord: 1, rebook: 2 };
  return out.sort((a, b) => order[a.kind] - order[b.kind]);
}

/** The section, or null when nothing is asked. `brandName(act, name)` draws the brand's dot and name. */
export function asksSection(snap, brandName) {
  if (!snap) return null;
  const rows = asksRows(snap);
  if (!snap.fresh) return h('p', { class: 'cr-quiet' }, 'Falling behind: not counted yet today. The count runs each morning.');
  const missed = (Array.isArray(snap.missing) ? snap.missing : []).map(b => b && (b.name || b.act)).filter(Boolean);
  const gap = missed.length ? h('p', { class: 'cr-quiet' }, `Not counted yet today: ${listOf(missed)}.`) : null;
  if (!rows.length) return gap;
  return h('section', { class: 'ac-group' },
    h('div', { class: 'ac-head' }, h('h2', null, 'Falling behind'), h('span', null, 'counted this morning, for the reviewer')),
    gap,
    h('div', { class: 'lx-card flush' }, rows.map(r => h('div', { class: 'ac-ask', style: { display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap', padding: '12px 20px', borderTop: '1px solid var(--line)' } },
      brandName(r.act, r.name), statusDot(r.tone, r.text)))));
}

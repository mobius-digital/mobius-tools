/* Connection rows, shared by Brand settings > Integrations and Agency settings > Integrations.
   One row per tool: its name, a clear connected or not state, one line on what was read, and who uses it. */

import { h, card, hero, platformChip, statusDot } from '../../kit.js';
import { stateDot } from './_set.js';

const GLYPH = { meta: 'meta', google: 'google', google_ads: 'google', ga4: 'google', gsc: 'google', tiktok: 'tiktok', amazon: 'amazon', klaviyo: 'email', email: 'email' };
const text = v => (typeof v === 'string' ? v : Array.isArray(v) ? v.join(' ') : '');

/** conRow({ key, name, state, note, fix, sub }, 'Used by 7 brands') */
export function conRow(it, use) {
  const name = GLYPH[it.key] ? platformChip(GLYPH[it.key], { label: it.name }) : h('span', null, it.name);
  const fix = text(it.fix);
  return h('div', { class: 'lx-st-con' },
    h('div', { class: 'nm' }, h('span', null, name, it.sub && h('small', null, it.sub))),
    stateDot(it.state),
    h('div', { class: 'note' }, text(it.note)),
    h('div', { class: 'use' }, use || ''),
    it.state !== 'ok' && fix ? h('details', null, h('summary', null, it.state === 'off' ? 'How to connect it' : 'How to fix it'), h('p', null, fix)) : null,
    it.checks && it.checks.some(c => !c.ok) ? h('details', null, h('summary', null, it.checks.filter(c => c.ok).length + ' of ' + it.checks.length + ' parts working'),
      h('p', null, it.checks.map(c => h('span', { style: { display: 'block' } }, statusDot(c.ok ? 'good' : 'off', c.name), ' ', text(c.note))))) : null);
}

/** The column headers over a list of connection rows: Connection | Status | Detail | Used for */
export function conHead(last = 'Used for') {
  return h('div', { class: 'lx-st-con head', role: 'presentation' }, h('div', null, 'Connection'), h('div', null, 'Status'), h('div', null, 'Detail'), h('div', null, last));
}

/** Group rows under their group names, in the order given. */
export function conGroups(items, order, useOf, last) {
  const groups = new Map();
  /* the worker's 'Work' group is shown as 'Production tools': Work is not a menu name any more */
  for (const it of items) { const g = it.group === 'Work' ? 'Production tools' : it.group || 'Other'; if (!groups.has(g)) groups.set(g, []); groups.get(g).push(it); }
  const names = [...new Set([...order.map(g => g === 'Work' ? 'Production tools' : g).filter(g => groups.has(g)), ...groups.keys()])];
  return names.map(g => card({ title: g, note: groups.get(g).filter(i => i.state === 'ok').length + ' of ' + groups.get(g).length + ' connected', flush: true, class: 'lx-st-card' },
    h('div', { class: 'lx-st-rows' }, conHead(last), groups.get(g).map(it => conRow(it, useOf ? useOf(it) : null)))));
}

/** The band at the top: how many are connected, and what needs a look. */
export function conHero(items, what) {
  const ok = items.filter(i => i.state === 'ok').length, look = items.filter(i => i.state === 'warn' || i.state === 'bad'), off = items.filter(i => i.state === 'off');
  return hero({ line: true }, h('div', { class: 'lx-st-sum' },
    h('span', { class: 'lx-big' }, ok + ' of ' + items.length, h('small', null, what)),
    h('span', { class: 'lx-sp' }),
    look.length ? statusDot('warn', look.length + (look.length === 1 ? ' needs a look: ' : ' need a look: ') + look.map(i => i.name).join(', ')) : null,
    off.length ? statusDot('off', off.length + ' not connected: ' + off.map(i => i.name).join(', ')) : null,
    !look.length && !off.length ? statusDot('good', 'Everything is connected') : null));
}

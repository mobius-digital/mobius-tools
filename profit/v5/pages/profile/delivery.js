/* Your profile > How things reach me. Each person's own choice, saved to their account (not this device):
   the ways (home list, the bell, Slack DM, email), the default (right away, morning read, only if missing, one line a
   day, mute), the morning read hour, quiet hours, and a choice per automation.
   account-health GET and PUT /api/me/delivery. A client sees the bell and email only.
   The choices are saved whether automations are on or off. For the team the switch is read from GET /api/automations
   beside it, so the page can say when automations are off (a client cannot read that route and sees no banner). */

import { h, put, em, card, toggle, toast, pill } from '../../kit.js';
import { style, ah, powerBar } from '../automations/_auto.js';
import { seenAsClient, clientsOwn, staleHold } from './_own.js';

const power = ctx => (ctx.isClient ? Promise.resolve({ power: null, can_power: false })
  : ah(ctx, '/api/automations').then(a => ({ power: !!a.power, can_power: !!a.can_power }), e => { if (e && e.name === 'AbortError') throw e; return { power: null, can_power: false }; }));
const load = async ctx => { if (seenAsClient(ctx)) return { preview: true }; const [d, p] = await Promise.all([ah(ctx, '/api/me/delivery'), power(ctx)]); return { ...d, ...p }; };
const hours = Array.from({ length: 24 }, (_, i) => ({ id: i, label: (i % 12 === 0 ? 12 : i % 12) + (i < 12 ? 'am' : 'pm') }));
const select = (label, items, value, onchange) => h('select', { 'aria-label': label, onchange: e => onchange(e.target.value) }, items.map(o => h('option', { value: String(o.id), selected: String(o.id) === String(value) || null }, o.label)));
const WAY = { home: ['Home list', 'A row on your home list until you tick it'], bell: ['The bell', 'Always on. The bell is the record'], slack: ['Slack DM', 'A direct message, only if you switch it on'], email: ['Email', 'One email, only if you switch it on'] };
const MODE_HELP = { now: 'It reaches me now, by the ways I picked.', morning_read: 'Held, then sent once at my morning hour.', only_if_missing: 'I hear nothing when it went as planned. I hear when it did not.', daily_line: 'Every run rolled into one line at an hour I pick.', mute: 'It still runs and still shows in the run log. It does not reach me.' };

function render(el, d, ctx) {
  style();
  if (seenAsClient(ctx)) return clientsOwn(el);
  if (staleHold(el, d, ctx, load, render)) return;
  const st = (d && d.delivery) || {}, modes = Object.entries((d && d.modes) || {}).map(([id, label]) => ({ id, label }));
  const save = async body => {
    if (ctx.sample) return toast('Sample mode: nothing is saved.');
    try { await ah(ctx, '/api/me/delivery', { method: 'PUT', body }); toast('Saved.'); } catch (e) { toast(e.message, { tone: 'bad', ms: 5000 }); }
  };
  const line = (title, sub, control) => h('div', { class: 'au-run', style: { gridTemplateColumns: 'minmax(0,1fr) auto' } }, h('div', null, h('b', null, title), sub ? h('p', null, sub) : null), control);
  const allowed = (d && d.ways) || {};
  const ways = card({ title: 'Where it lands', note: 'Nothing lands only in Slack. The app always has it.' }, h('div', { class: 'au-log' },
    Object.entries(WAY).filter(([k]) => allowed[k] !== false).map(([k, [title, sub]]) => line(title, (d && d.ways_note && d.ways_note[k]) || sub,
      k === 'bell' ? pill('good', 'Always on') : toggle({ checked: !!(st.ways || {})[k], ariaLabel: title, onchange: v => { st.ways = { ...(st.ways || {}), [k]: v }; save({ delivery: { ways: st.ways } }); } })))));
  const mode = card({ title: 'How I usually hear', note: MODE_HELP[st.mode] || '' }, h('div', { class: 'au-pick' },
    h('label', null, 'Unless I pick something else for one automation'),
    select('How I usually hear', modes, st.mode, v => { st.mode = v; save({ delivery: { mode: v } }); render(el, d, ctx); }),
    h('label', null, 'My morning read hour'), select('My morning read hour', hours, st.read_hour ?? 7, v => { st.read_hour = +v; save({ delivery: { read_hour: +v } }); }),
    h('label', null, 'Quiet from'), select('Quiet from', [{ id: '', label: 'No quiet hours' }, ...hours], st.quiet_from ?? '', v => { st.quiet_from = v === '' ? null : +v; save({ delivery: { quiet_from: st.quiet_from, quiet_to: st.quiet_to ?? 5 } }); }),
    h('label', null, 'Quiet until'), select('Quiet until', hours, st.quiet_to ?? 5, v => { st.quiet_to = +v; save({ delivery: { quiet_to: +v } }); }),
    h('p', { class: 'au-note' }, 'In quiet hours nothing pings you. It waits for your morning read. A change that waits for your tap, and something that is down, still get through.')));
  const per = (d && d.per) || [];
  const each = card({ title: 'One by one', note: per.length ? 'Pick a different way for any automation that tells you.' : 'When an automation is switched on, it shows here.' },
    h('div', { class: 'au-log' }, per.map(p => line(p.name, p.sentence, select('How "' + p.name + '" reaches me', [{ id: '', label: 'My usual way' }, ...modes], p.own ? p.mode : '', v => save({ per: [{ automation_id: p.automation_id, mode: v || null }] }))))));
  const reload = async () => { if (ctx.sample) return; const fresh = await load(ctx).catch(() => null); if (fresh) render(el, fresh, ctx); };
  put(el, h('div', { class: 'au' }, powerBar(d, ctx, reload), ways, mode, each));
}

export default {
  title: ['How things ', em('reach me')],
  eyebrow: 'Your profile',
  ranges: false,
  load, render,
};

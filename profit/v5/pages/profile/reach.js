/* "How it reaches you": which kinds of notification ping you where, the daily summary and quiet hours.
   There is no notifications service yet, so the choices are kept on this device only (localStorage). */

import { put } from '../../kit.js';
import { h, card, toggle, segmented, button, toast } from '../../kit.js';
import { APP_NAME } from '../../config.js';
import { ic, store } from '../my-day/_ui.js';

const KEY = 'lx5_reach';

/** The plan's defaults. The fixture has the same shape. */
export const REACH_DEFAULT = {
  kinds: [
    { id: 'yes', title: 'Needs my yes', eg: 'A brief or an ad waits for your approval', slack: true, email: false, push: true },
    { id: 'assigned', title: 'Assigned to me', eg: 'Someone gave you a card or a task', slack: true, email: false, push: false },
    { id: 'due', title: 'Due today', eg: 'Something of yours is due before the day ends', slack: true, email: false, push: true },
    { id: 'client', title: 'A client replied', eg: 'A client answered a request or an approval', slack: true, email: false, push: true },
    { id: 'down', title: 'Something is down', eg: 'Meta is down, or a live brand spent $0', slack: true, email: false, push: true },
    { id: 'summary', title: 'Daily summary', eg: 'What needs you today, in one message', slack: true, email: false, push: false },
  ],
  summary: { time: '05:00', weekdays: true, by: 'slack', eg: '' },
  quiet: { from: '19:00', to: '05:00', weekends: true, down_through: true },
  phone: 'off',
};

/** Defaults with this device's saved choices on top. */
export function reachState(sample) {
  const base = JSON.parse(JSON.stringify(REACH_DEFAULT));
  if (sample) return base;
  const saved = store.get(KEY, null);
  if (!saved) return base;
  base.kinds.forEach(k => { const s = (saved.kinds || {})[k.id]; if (s) { k.slack = !!s.slack; k.push = !!s.push; } });
  Object.assign(base.summary, saved.summary || {});
  Object.assign(base.quiet, saved.quiet || {});
  return base;
}

const clock = t => { const [hh, mm] = String(t || '0:0').split(':').map(Number); return { text: ((hh + 11) % 12 + 1) + ':' + String(mm || 0).padStart(2, '0'), ap: hh < 12 ? 'am' : 'pm' }; };

export function renderReach(el, st, ctx, person) {
  const name = (person && person.name) || '';
  const save = () => {
    if (ctx.sample) return;
    store.set(KEY, { kinds: Object.fromEntries(st.kinds.map(k => [k.id, { slack: k.slack, push: k.push }])), summary: { time: st.summary.time, weekdays: st.summary.weekdays, by: st.summary.by }, quiet: st.quiet });
  };
  const sw = (checked, label, onchange, off) => {
    const t = toggle({ checked, onchange: v => { onchange(v); save(); } });
    const input = t.querySelector('input');
    input.setAttribute('aria-label', label);
    if (off) { input.disabled = true; t.classList.add('off'); t.title = 'Email is off for now'; }
    return t;
  };
  /* a time shown as "5:00 am"; a tap opens the browser's own time picker */
  const time = (obj, key, label) => {
    const input = h('input', { type: 'time', value: obj[key], tabindex: '-1', 'aria-hidden': 'true', style: { position: 'absolute', width: '1px', height: '1px', opacity: 0, pointerEvents: 'none' } });
    const b = h('b'), small = h('small');
    const paint = () => { const c = clock(obj[key]); b.textContent = c.text; small.textContent = c.ap; };
    const btn = h('button', { class: 'lx-rc-time', type: 'button', 'aria-label': label, style: { display: 'inline-flex', alignItems: 'baseline', gap: '8px' },
      onclick: () => { try { input.showPicker(); } catch { input.focus(); } } }, b, small, input);
    input.addEventListener('change', () => { if (input.value) { obj[key] = input.value; paint(); save(); } });
    paint();
    return btn;
  };

  const slackSub = st.slack_handle ? '@' + st.slack_handle : name ? '@' + name : 'your Slack';
  const cols = [
    { icon: 'bell', title: APP_NAME + ' bell', sub: 'always keeps it' },
    { icon: 'hash', title: 'Slack DM', sub: slackSub },
    { icon: 'mail', title: 'Email', sub: 'off for now' },
    { icon: 'phone', title: 'Phone push', sub: 'not turned on yet' },
  ];
  const grid = h('section', { class: 'lx-card lx-rc-grid' },
    h('div', { class: 'lx-rc-row hd' }, h('p', null, 'The bell keeps everything. Pick what else pings you.'),
      cols.map(c => h('div', { class: 'lx-rc-col' }, ic(c.icon), h('b', null, c.title), h('small', null, c.sub)))),
    st.kinds.map(k => h('div', { class: 'lx-rc-row' },
      h('div', { class: 'lx-rc-kind' }, h('b', null, k.title), h('span', null, k.eg)),
      h('div', { class: 'lx-rc-cell', title: 'Always in the bell' }, ic('check')),
      h('div', { class: 'lx-rc-cell' }, sw(k.slack, k.title + ' by Slack DM', v => { k.slack = v; })),
      h('div', { class: 'lx-rc-cell' }, sw(false, k.title + ' by email', () => {}, true)),
      h('div', { class: 'lx-rc-cell' }, sw(k.push, k.title + ' by phone push', v => { k.push = v; })))));

  const line = (text, control) => h('div', { class: 'lx-rc-line' }, h('span', null, text), control);
  const S = st.summary, Q = st.quiet;
  const three = h('div', { class: 'lx-rc-three' },
    card({ class: 'lx-rc-card' }, h('span', { class: 'l' }, 'Daily summary'),
      h('div', { class: 'big' }, time(S, 'time', 'Daily summary time')),
      h('p', null, S.eg || (name ? `"${name}, here is what needs you today."` : 'What needs you today, in one message.')),
      line('Weekdays', sw(S.weekdays, 'Weekdays only', v => { S.weekdays = v; })),
      line('Sent by', segmented([{ id: 'slack', label: 'Slack DM' }, { id: 'email', label: 'Email' }, { id: 'both', label: 'Both' }], S.by, id => { S.by = id; save(); }))),
    card({ class: 'lx-rc-card' }, h('span', { class: 'l' }, 'Quiet hours'),
      h('div', { class: 'big' }, time(Q, 'from', 'Quiet hours start'), h('small', null, 'to'), time(Q, 'to', 'Quiet hours end')),
      h('p', null, 'Nothing pings you. The bell still keeps it.'),
      line('Weekends quiet', sw(Q.weekends, 'Weekends quiet', v => { Q.weekends = v; })),
      line('Something down still gets through', sw(Q.down_through, 'Something down still gets through', v => { Q.down_through = v; }))),
    card({ class: 'lx-rc-card' }, h('span', { class: 'l' }, 'Phone notifications'),
      h('div', { class: 'big word' }, 'Not on yet'),
      h('div', { class: 'lx-rc-step' }, h('span', { class: 'lx-count sm' }, '1'), 'Add ' + APP_NAME + ' to your Home Screen'),
      h('div', { class: 'lx-rc-step' }, h('span', { class: 'lx-count sm' }, '2'), 'Open it there and tap Allow'),
      button('Turn on phone notifications', { primary: true, large: true, onclick: () => toast('Phone notifications come with the notifications release.') })));

  put(el, grid, three,
    h('p', { class: 'lx-foot' }, 'Saving to your account comes with the notifications release. For now these choices stay on this device and nothing is sent by them yet.'));
}

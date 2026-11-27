/* Brand settings > People and sending. Who runs this brand, where its messages go and when, and who from the client can sign in.
   Real mode:
     account-health GET /api/brands            the brand's internal and client Slack channels (read only here)
     account-health GET /api/team              the roster the people pickers choose from
     account-health GET /api/clients?act=<id>  the client logins for this brand
   Who runs which brand, the send times and the launch days have no server home yet: they open on the example
   (real mode) and save on this device until the settings release. */

import { put } from '../../kit.js';
import { h, em, empty, card, table, avatar, relativeTime, statusDot } from '../../kit.js';
import { css, stage, saveBar, group, row, fact, fold, setHelp, pick, timePick, dayChips, onOff, seg, exampleChip, DAY_OPTS } from './_set.js';

const ROLES = [
  ['strategist', 'Creative strategist', 'Briefs, angles and what to test next.'],
  ['buyer', 'Media buyer', 'Meta calls, budgets and launches.'],
  ['editor', 'Editor', 'Video edits.'],
  ['designer', 'Designer', 'Statics and landing pages.'],
  ['google', 'Google', 'Search, Shopping and Performance Max.'],
  ['amazon', 'Amazon', 'Amazon ads and listings.'],
  ['email', 'Email and SMS', 'Campaigns and flows.'],
  ['lead', 'Account lead', 'The client talks to this person. Client sends wait for their yes.'],
];

function draw(el, data, ctx) {
  css();
  if (!data || !ctx.brand) return put(el, empty({ title: 'No brand picked', text: 'Pick a brand to see who runs it.' }));
  const k = n => 'brand:' + ctx.brand.id + '.' + n, ex = new Set(data.example || []);
  const S = stage(ctx), team = data.team || [], d = data.defaults || {};
  const people = [{ id: '', label: 'Nobody yet' }, ...team.map(p => ({ id: p.email, label: p.name || p.email.split('@')[0] }))];
  const who = (role, title, hint) => {
    const cur = S.get(k('people_' + role), (data.people || {})[role] || '');
    const p = team.find(t => t.email === cur);
    return row(h('span', { class: 'lx-st-who' }, avatar(p || { name: '?' }, { size: 28 }), h('span', null, h('b', null, title))), hint,
      pick(S, k('people_' + role), cur, people, { label: title, width: 190 }));
  };
  const logins = data.logins || [];
  const ch = data.channels || {};

  put(el, h('div', { class: 'lx-st' },
    saveBar(S, ctx, { help: setHelp({
      about: 'Who on the team runs this brand, where its Slack messages go and when, and who from the client can sign in.',
      fixed: [
        ['A client never sees', 'Goals, rules, the team list, suggestions', 'A client login reads its own brand’s numbers and requests only.'],
        ['Reminders repeat', 'On the day, then 1, 3 and 7 days later', 'Then they go quiet.'],
      ] }) }),
    group('Who runs this brand', ex.has('people') ? exampleChip() : 'One person per job. A blank job shows as nobody, never a guess.', ROLES.map(([id, t, hint]) => who(id, t, hint))),
    group('Where messages go', 'Slack channels for this brand',
      fact('Internal channel', ch.internal || 'Not set', 'Team only. Alerts, calls and drafts land here.'),
      fact('Client channel', ch.client || 'Not set', ch.client ? 'What the client reads. It never falls back to the internal channel.' : 'Until it is set, nothing is sent to the client.'),
      row('Client messages post as', 'Who the client sees as the sender.', pick(S, k('send_as'), d.send_as || 'agency', [{ id: 'agency', label: 'The agency sender' }, { id: 'lead', label: 'The account lead' }], { label: 'Client messages post as', width: 190 }))),
    group('Client daily', 'Yesterday against the plan, in plain words',
      row('Send the client daily', null, onOff(S, k('daily_on'), d.daily_on ?? true, 'Send the client daily')),
      row('How it goes out', 'Hold for me waits for the account lead to press Send.', seg(S, k('daily_mode'), d.daily_mode || 'hold', [{ id: 'hold', label: 'Hold for me' }, { id: 'auto', label: 'Send on its own' }])),
      row('Send time', 'In the brand’s own time zone (' + (data.tz_label || 'brand time') + ').', timePick(S, k('daily_time'), d.daily_time || '07:00', { label: 'Client daily time' })),
      row('Weekly report day', 'The weekly report rides on this day’s client daily.', pick(S, k('weekly_day'), d.weekly_day || 'agency', [{ id: 'agency', label: 'Agency default (Monday)' }, ...DAY_OPTS], { label: 'Weekly report day', width: 240 }))),
    group('Launch days', 'When new ads go live for this brand',
      row('Launch days', 'Ready ads wait for the next launch day.', dayChips(S, k('launch_days'), d.launch_days || ['mon', 'thu']))),
    card({ title: 'Client logins', note: logins.length ? logins.length + (logins.length === 1 ? ' person' : ' people') + ' from the client' : 'Nobody from the client signs in yet', flush: true, class: 'lx-st-card' },
      logins.length ? table({ cols: [
        { key: 'name', label: 'Person', render: r => h('span', { class: 'lx-st-who' }, avatar(r, { size: 28 }), h('span', null, h('b', null, r.name || r.email.split('@')[0]), h('small', null, r.email))) },
        { key: 'seen', label: 'Last in', class: 'hide-sm', render: r => r.last_seen ? relativeTime(r.last_seen) : 'Not yet' },
        { key: 'state', label: '', num: true, render: r => r.last_sign_in ? statusDot('good', 'Signed in') : statusDot('warn', 'Invited') },
      ], rows: logins, roomy: true }) : h('div', { class: 'lx-pad' }, h('p', { class: 'lx-foot' }, 'Invite the client from Agency settings, Clients.'))),
    fold('Advanced', 'Rarely touched',
      row('Check spend at', 'Two checks a day that a live brand is spending. Brand time.', h('div', { class: 'lx-st-times' }, timePick(S, k('spend_check_1'), d.spend_check_1 || '08:00', { label: 'First spend check' }), timePick(S, k('spend_check_2'), d.spend_check_2 || '14:00', { label: 'Second spend check' })))),
  ));
}

export default {
  title: ['Who runs this brand, ', em('and who hears what?')],
  eyebrow: ctx => (ctx.brand ? ctx.brand.name + ', ' : '') + 'brand settings',
  ranges: false,
  stamp: false,                  /* a form or a conversation, not numbers: no "updated" stamp in the head */
  async load(ctx) {
    if (!ctx.brand) return null;
    const id = ctx.brand.id, soft = p => p.catch(e => { if (e && e.name === 'AbortError') throw e; return null; });
    const [brands, team, clients, fx] = await Promise.all([
      soft(ctx.api('/api/brands', { worker: 'ah', signal: ctx.signal })),
      soft(ctx.api('/api/team', { worker: 'ah', signal: ctx.signal })),
      soft(ctx.api('/api/clients?act=' + encodeURIComponent(id), { worker: 'ah', signal: ctx.signal })),
      soft(ctx.fixture('people.json')),
    ]);
    const b = ((brands && brands.brands) || []).find(r => r.id === id) || {};
    const members = ((team && team.members) || []).map(m => ({ email: m.email, name: m.name || null }));
    return {
      channels: { internal: b.internal_channel || null, client: b.client_channel || null },
      tz_label: b.tz || null,
      team: members,
      people: {},                                   /* no route yet: who runs which brand */
      logins: ((clients && clients.clients) || []).map(c => ({ email: c.email, name: c.name, last_seen: c.last_seen, last_sign_in: c.last_sign_in })),
      defaults: fx ? fx.defaults : {},
      example: ['people'],
    };
  },
  render: draw,
};

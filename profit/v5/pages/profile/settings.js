/* Your profile > My settings. What each person sets for themselves: their clock, their morning summary, quiet hours,
   what reaches them right away, and how the app opens for them.
   Real mode: account-health GET /api/me/prefs (morning_dm, the morning summary as a Slack DM), saved with PUT /api/me/prefs.
   Everything else here is this person's own and is kept on this device (the date range already is). */

import { put } from '../../kit.js';
import { h, em, card, statusDot } from '../../kit.js';
import { APP_NAME } from '../../config.js';
import { RANGES } from '../../data.js';
import { css, stage, saveBar, group, row, fold, setHelp, pick, timePick, dayChips, onOff, seg } from '../brand-settings/_set.js';
import { ZONES } from '../brand-settings/brand.js';

const zoneHere = () => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/Chicago'; } catch { return 'America/Chicago'; } };

function draw(el, data, ctx) {
  css();
  const d = (data && data.values) || {};
  const savers = ctx.sample ? {} : { 'me.morning_dm': v => ctx.api('/api/me/prefs', { worker: 'ah', method: 'PUT', body: { morning_dm: !!v } }) };
  const S = stage(ctx, { live: { 'me.morning_dm': d.morning_dm }, savers, names: { 'me.morning_dm': 'Morning summary as a Slack DM' } });
  const client = ctx.isClient;
  const zones = ZONES.some(z => z.id === zoneHere()) ? ZONES : [{ id: zoneHere(), label: zoneHere().replace(/_/g, ' ') }, ...ZONES];
  const reach = client
    ? [['me.reach.yes', 'Something needs my yes', true], ['me.reach.reply', 'The agency replied', true], ['me.reach.report', 'A report was sent', true]]
    : [['me.reach.client', 'A client is waiting on me', true], ['me.reach.back', 'My card was sent back', true], ['me.reach.due', 'A promise of mine is due', true], ['me.reach.spend', 'Zero spend on a brand I run', true], ['me.reach.mention', 'Someone tags me', true]];

  /* the range the shell keeps is the person's own local 'range' key: a new default is written there on Save */
  S.onChange((key, v) => { if (key === 'range.default' && v && v !== 'custom') S.set('range', { preset: v }); });
  put(el, h('div', { class: 'lx-st' },
    saveBar(S, ctx, { help: setHelp({
      about: 'What you set for yourself: your clock, quiet hours, your morning summary, what reaches you right away, and how ' + APP_NAME + ' opens for you. This is the one home for quiet hours and the morning summary time; How things reach me only shows them.',
      fixedTitle: 'Set by someone else',
      fixed: [
        ['Sign in email', (ctx.me && ctx.me.email) || 'Not signed in', 'You sign in with this. The owner changes it.'],
        ['Slack', d.slack == null ? 'Not checked' : d.slack ? 'Linked' : 'Not linked', 'Found by your email.'],
        client ? ['Your brands', 'Set by the agency', 'Ask your account lead to add one.'] : ['Your job and brands', 'Set in Agency settings, Team', 'The owner changes them.'],
      ] }) }),
    group('My clock', null,
      row('My time zone', 'Due times and send times show in this zone.', pick(S, 'me.timeZone', d.timeZone || zoneHere(), zones, { label: 'My time zone', width: 190 })),
      row('Quiet hours', 'Nothing reaches me in these hours, whatever the agency sends.', h('div', { class: 'lx-st-times' }, timePick(S, 'me.quietFrom', d.quietFrom || '19:00', { label: 'Quiet from' }), h('span', { style: { color: 'var(--muted)' } }, 'to'), timePick(S, 'me.quietTo', d.quietTo || '05:00', { label: 'Quiet to' })))),
    client ? null : group('My morning summary', 'What needs me today, in one message',
      row('Send it as a Slack DM', 'Off means it waits in the bell when you open ' + APP_NAME + '.', onOff(S, 'me.morning_dm', d.morning_dm ?? true, 'Morning summary as a DM')),
      row('Time', 'In my time zone.', timePick(S, 'me.summaryTime', d.summaryTime || '05:00', { label: 'Summary time' })),
      row('Days', null, dayChips(S, 'me.summaryDays', d.summaryDays || ['mon', 'tue', 'wed', 'thu', 'fri'])),
      row('By', null, seg(S, 'me.summaryBy', d.summaryBy || 'slack', [{ id: 'slack', label: 'Slack' }, { id: 'email', label: 'Email' }, { id: 'both', label: 'Both' }]))),
    group('What reaches me right away', client ? 'By email' : 'Everything else waits for the morning summary or the bell', reach.map(([key, label, fb]) => row(label, null, onOff(S, key, d[key] ?? fb, label)))),
    group('How ' + APP_NAME + ' opens', null,
      row('Dates on every page', 'Pages open on this range. You can still change it on any page.', pick(S, 'range.default', d.range || (ctx.settingNow('range', null) || {}).preset || 'month', RANGES.filter(r => r.id !== 'custom').map(r => ({ id: r.id, label: r.label })), { label: 'Default date range', width: 170 })),
      client ? null : row('First page', null, pick(S, 'me.firstPage', d.firstPage || 'home', [{ id: 'home', label: 'Home' }, { id: 'my-day', label: 'My day' }, { id: 'a-today', label: 'Today, every brand' }], { label: 'First page', width: 190 }))),
    client ? null : fold('Advanced', 'Rarely touched',
      row('My alert rules check at', 'When the rules you asked ' + APP_NAME + ' AI to watch are checked.', timePick(S, 'me.alertTime', d.alertTime || '08:00', { label: 'Alert check time' }))),
  ));
}

export default {
  title: ['How ' + APP_NAME + ' ', em('works for me')],
  eyebrow: 'Your profile',
  ranges: false,
  async load(ctx) {
    const p = await ctx.api('/api/me/prefs', { worker: 'ah', signal: ctx.signal }).catch(e => { if (e && e.name === 'AbortError') throw e; return null; });
    return { values: { morning_dm: p && p.prefs ? !!p.prefs.morning_dm : undefined, slack: null } };
  },
  render: draw,
};

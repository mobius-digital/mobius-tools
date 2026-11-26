/* Agency settings > Sending and notifications. What Locus sends, to whom, and when.
   Real mode: account-health GET /api/settings for the settings the workers keep today, saved back one key at a time
   through PUT /api/settings (each after the Save bar's confirm sheet):
     morningHour (the morning message hour), morningCard (morning message on), todayPost, actionRemind, and
     senders (2026-11-26, "Who it comes from": per kind of message, Locus the app or the owner; one object
     { all, kinds } saved whole; the worker's sender.js resolves it, the pure part of this group is _senders.js).
   2026-11-26, "Features and quiet jobs" (owner only): features { creatorProgram, socialPosting } and jobs (one
     switch per quiet job, off = quiet), drawn from the same GET and saved one field at a time through PUT /api/settings
     { features: { <name>: bool } } or { jobs: { <id>: bool } }. canEditJobs false dims every switch.
   todayPost shows only while the morning message is off: the worker ignores it while the card is on.
   Only those are drawn in real mode. Every other time, switch, preview and table here has no server home yet: it
   shows in sample mode only, so no switch on a real brand saves nothing. */

import { put } from '../../kit.js';
import { h, em, empty, card, table, kpis, kpi, avatar, statusDot, addStyles, segmented, toggle } from '../../kit.js';
import { APP_NAME, ORG_SHORT, LS5, SAMPLE } from '../../config.js';
import { css, stage, saveBar, group, row, fold, facts, pick, timePick, dayChips, onOff, numBox, exampleChip, clock, DAY_OPTS } from '../brand-settings/_set.js';
import { ZONES } from '../brand-settings/brand.js';
import { SAMPLE_SENDERS, storedOf, senderRows, topState, applyTop, applyKind } from './_senders.js';

const SENDERS = 'agency.senders';
/** "Who it comes from": one switch for everything, then one row per kind with the same two pills (Locus or the
 *  owner). Locked rows show Locus, dimmed, with why. Email rows say so while there is no Locus mailbox. Every change
 *  is staged on the page and saved whole through the Save bar and its confirm sheet. */
export function whoGroup(S, d) {
  const answer = d.senders && d.senders.resolved ? d.senders : SAMPLE_SENDERS;
  const person = d.senderPerson || 'You';
  /* Only the owner may change this (the worker answers 403 for anyone else): for others every pill is dimmed. */
  const ro = d.sendersEditable === false;
  const items = [{ id: 'locus', label: APP_NAME }, { id: 'cole', label: person }];
  const cur = () => storedOf(S.get(SENDERS, storedOf(answer)));
  const pills = (who, onPick, { locked = false, noApp = false, label } = {}) => {
    const el = segmented(items, who, onPick);
    el.setAttribute('aria-label', label);
    if (locked || noApp) [...el.children].forEach((b, i) => { if (locked || (noApp && items[i].id === 'locus')) { b.disabled = true; b.setAttribute('aria-disabled', 'true'); } });
    if (locked) el.classList.add('lx-sn-locked');
    return el;
  };
  const wrap = h('div', { class: 'lx-sn-who' });
  const paint = () => {
    const rows = senderRows(answer, cur());
    const top = topState(rows);
    wrap.replaceChildren(
      row('Everything from', top === 'mixed' ? 'Mixed: the rows below are not all the same.' : 'One tap sets every row below.',
        h('div', { class: 'lx-sn-top' }, pills(top === 'mixed' ? null : top, id => S.set(SENDERS, applyTop(cur(), id)), { locked: ro, label: 'Everything from' }),
          top === 'mixed' ? h('span', { class: 'lx-sn-mixed' }, 'Mixed') : null)),
      ...rows.map(r => row(r.label, r.why || null,
        pills(r.who, id => S.set(SENDERS, applyKind(cur(), r.kind, id)), { locked: r.locked || ro, noApp: r.noApp, label: r.label }))));
  };
  S.onChange(k => { if (k === SENDERS || k === null) paint(); });
  paint();
  return group('Who it comes from', `${APP_NAME} is the app. ${person === 'You' ? 'The other choice' : person} posts as you, with your name and photo.${ro ? ' Only the owner can change this.' : ''}`, wrap);
}

/* ---------- Features and quiet jobs (owner only) ----------
   From GET /api/settings: features { creatorProgram, socialPosting }, jobs [{ id, name, was, instead, switch_on, on,
   off_reason, still_posts? }], canEditJobs. switch_on is the job's own quiet switch (what the toggle shows and saves); on is whether
   the post really goes out (the worker also checks the older switches, jobflags.js OLDER_SWITCHES); off_reason says
   why it does not; still_posts says why a job switched off still posts. An older worker sends only on: it is then the switch too. Each switch is its own staged key, so the Save bar's confirm sheet names it with its old and new
   value; the saver sends one field: PUT /api/settings { features: { <name>: bool } } or { jobs: { <id>: bool } }.
   A job switched off stays quiet: its code and the check behind it keep running, only the Slack post stops. */
const FEATURES = [
  ['creatorProgram', 'Creator program', 'Trybe, creator suggestions and Discord posts. Off hides Creators.'],
  ['socialPosting', 'Social posting', 'Parked. ' + ORG_SHORT + ' does not offer it.'],
];
const featKey = name => 'agency.feature.' + name;
/** A feature switch just saved: the menus follow at once (no reload). The same steps app.js takes on boot: the bell's
    cached notices forgotten, the switch set, kept for the next visit, the menus drawn again. Never throws. */
export async function featureSaved(name, v) {
  try {
    const [bell, menu, shell] = await Promise.all([import('../../bell.js'), import('../../menu.js'), import('../../shell.js')]);
    bell.forgetNotices();
    const changed = menu.setFeatures({ [name]: !!v });
    try { localStorage.setItem(LS5.features + (SAMPLE ? '|sample' : ''), JSON.stringify(menu.featuresNow())); } catch { /* memory only */ }
    if (changed) shell.redrawMenu();
  } catch { /* the next boot reads them */ }
}
const jobKey = id => 'agency.job.' + id;
/** The job's own quiet switch (an older worker sends only on). */
const switchOf = j => !!(j.switch_on ?? j.on);
/** The switches' current values, their names and their savers, for stage(). Empty when the server has no jobs yet. */
export function switchesOf(fj, ctx) {
  const live = {}, savers = {}, names = {};
  if (!fj) return { live, savers, names };
  for (const [name, label] of FEATURES) {
    if (!ctx.sample) live[featKey(name)] = !!fj.features[name];
    savers[featKey(name)] = async v => { await ctx.saveSetting('agency.features', { [name]: !!v }); await featureSaved(name, v); };
    names[featKey(name)] = label;
  }
  for (const j of fj.jobs) {
    if (!ctx.sample) live[jobKey(j.id)] = switchOf(j);
    savers[jobKey(j.id)] = v => ctx.saveSetting('agency.jobs', { [j.id]: !!v });
    names[jobKey(j.id)] = 'Quiet job: ' + j.name;
  }
  return { live, savers, names };
}
/** The answer's switches, or null when this server does not send them yet. */
export function featuresAndJobs(data) {
  const d = (data && data.values) || {};
  const jobs = data && Array.isArray(data.jobs) ? data.jobs : Array.isArray(d.jobs) ? d.jobs : null;
  const features = (data && data.features) || d.features || null;
  if (!jobs && !features) return null;
  const can = data && data.canEditJobs != null ? data.canEditJobs : d.canEditJobs;
  return { jobs: jobs || [], features: features || {}, canEdit: can !== false };
}
function featureGroup(S, fj) {
  if (!fj) return null;
  const ro = !fj.canEdit;
  const sw = (key, fallback, label) => {
    const el = toggle({ checked: !!S.get(key, fallback), disabled: ro, ariaLabel: label, onchange: v => S.set(key, v) });
    el.dataset.key = key;
    if (ro) el.classList.add('lx-sn-locked');
    return el;
  };
  return group('Features and quiet jobs', ro ? 'Only the owner can change these.' : 'A quiet job still runs its check. Only its Slack post stops, and its code is kept.',
    FEATURES.map(([name, label, hint]) => row(label, hint, sw(featKey(name), !!fj.features[name], label))),
    fj.jobs.length ? h('div', { class: 'lx-sn-sub' }, 'Quiet jobs', h('span', null, 'Off means quiet')) : null,
    fj.jobs.map(j => row(j.name, h('span', { class: 'lx-sn-job' }, j.was ? h('span', null, 'Posted: ' + j.was) : null, j.instead ? h('span', null, 'Instead: ' + j.instead) : null,
      /* The switch is on but an older switch keeps the post off: say so, so the page shows what really happens. */
      switchOf(j) && j.on === false && j.off_reason ? h('span', { class: 'lx-sn-off' }, 'Off: ' + j.off_reason) : null,
      /* The switch is off but the post still goes out (jobflags.js STILL_POSTS): say that too. */
      !switchOf(j) && j.on === true && j.still_posts ? h('span', { class: 'lx-sn-off' }, 'Still posts: ' + j.still_posts) : null),
      sw(jobKey(j.id), switchOf(j), j.name), { top: true })));
}

function preview(p) {
  if (!p) return null;
  return h('div', { class: 'lx-sn-pv' },
    h('div', { class: 'top' }, h('span', { class: 'mk' }), h('b', null, APP_NAME), h('span', { class: 'app' }, 'APP'), h('span', { class: 'tm' }, p.time), h('span', { class: 'lx-sp' }), h('span', { class: 'to' }, p.to)),
    p.title && h('div', { class: 'tt' }, p.title),
    (p.lines || []).map(l => h('div', { class: 'ln' }, l)),
    p.buttons && h('div', { class: 'bt' }, p.buttons.map(b => h('span', null, b))));
}

function draw(el, data, ctx) {
  css(); addStyles('lx-sn-css', CSS);
  if (!data) return put(el, empty({ title: 'Settings did not answer', text: 'Try again in a minute.' }));
  const ex = new Set(data.example || []), d = data.values || {};
  const live = { 'agency.morningHour': d.morningHour, 'agency.morningCard': d.morningCard, 'agency.todayPost': d.todayPost, 'agency.actionRemind': d.actionRemind };
  /* through data.js saveSetting, so the session's cached agency settings are cleared too, and the page's own copy follows */
  const one = name => async v => { await ctx.saveSetting('agency.' + name, v); d[name] = v; };
  if (!ctx.sample) live[SENDERS] = storedOf(d.senders);
  const fj = featuresAndJobs(data), sw = switchesOf(fj, ctx);
  Object.assign(live, sw.live);
  const S = stage(ctx, { live, savers: { 'agency.morningHour': one('morningHour'), 'agency.morningCard': one('morningCard'), 'agency.todayPost': one('todayPost'), 'agency.actionRemind': one('actionRemind'), [SENDERS]: one('senders'), ...sw.savers },
    names: { 'agency.morningHour': 'Morning message hour', 'agency.morningCard': 'Morning message on', 'agency.todayPost': 'Today’s calls in the brand channel', 'agency.actionRemind': 'Action reminders', [SENDERS]: 'Who it comes from', ...sw.names } });
  if (!ctx.sample) return drawReal(el, S, d, ctx, fj);
  const people = data.people || [];
  const team = [{ id: 'owner', label: 'The owner' }, { id: 'lead', label: 'The brand’s account lead' }, { id: 'each', label: 'Each person, as a DM' }, { id: 'client', label: 'The client channel' }, { id: 'channel', label: 'A team channel' }];

  /* the messages that send on a clock */
  const msg = (m, when, who, on) => h('div', { class: 'lx-sn-msg' },
    h('div', { class: 'a' }, h('span', { class: 'n' }, m.n), h('div', null, h('div', { class: 'k' }, m.name), h('p', null, m.what), m.replaces && h('p', { class: 'r' }, m.replaces))),
    h('div', { class: 'b' }, preview(m.preview)),
    h('div', { class: 'c' }, h('span', { class: 'lx-cap' }, 'When'), when, h('span', { class: 'lx-cap' }, 'Who gets it'), who, h('div', { class: 'on' }, on)));
  const M = Object.fromEntries((data.messages || []).map(m => [m.id, m]));
  const messages = [
    M.morning && msg(M.morning,
      h('div', { class: 'lx-st-times' }, timePick(S, 'agency.morningHour', d.morningHour ?? 5, { hours: true, label: 'Morning message hour' })),
      pick(S, 'agency.morningWho', d.morningWho || 'each', team, { label: 'Morning message goes to', width: 210 }), onOff(S, 'agency.morningCard', d.morningCard ?? true, 'Morning message on')),
    M.daily && msg(M.daily,
      h('div', { class: 'lx-st-times' }, timePick(S, 'agency.clientDailyTime', d.clientDailyTime || '07:00', { label: 'Client daily time' }), h('small', { class: 'lx-sn-note' }, 'brand time')),
      pick(S, 'agency.clientDailyWho', d.clientDailyWho || 'client', team, { label: 'Client daily goes to', width: 210 }), onOff(S, 'agency.clientDailyOn', d.clientDailyOn ?? true, 'Client daily on')),
    M.preread && msg(M.preread,
      h('div', { class: 'lx-st-times' }, pick(S, 'agency.prereadDay', d.prereadDay || 'sun', DAY_OPTS, { label: 'Pre-read day', width: 130 }), timePick(S, 'agency.prereadTime', d.prereadTime || '18:00', { label: 'Pre-read time' })),
      pick(S, 'agency.prereadWho', d.prereadWho || 'each', team, { label: 'Pre-read goes to', width: 210 }), onOff(S, 'agency.prereadOn', d.prereadOn ?? true, 'Pre-read on')),
    M.sale && msg(M.sale,
      h('div', { class: 'lx-st-times' }, ['09:00', '15:00', '21:00'].map((t, i) => timePick(S, 'agency.saleCheck' + i, (d.saleChecks || [])[i] || t, { label: 'Sale check-in ' + (i + 1) }))),
      pick(S, 'agency.saleWho', d.saleWho || 'owner', team, { label: 'Sale check-in goes to', width: 210 }), onOff(S, 'agency.saleOn', d.saleOn ?? true, 'Sale check-in on')),
  ].filter(Boolean);

  const events = table({
    cols: [
      { key: 'name', label: 'Message', render: r => h('b', null, r.name) },
      { key: 'says', label: 'What it says', class: 'hide-md', render: r => h('span', { class: 'lx-sn-dim' }, r.says) },
      { key: 'when', label: 'When', class: 'hide-sm' },
      { key: 'who', label: 'Who gets it', class: 'hide-sm' },
      { key: 'on', label: 'On', num: true, render: r => r.always ? h('span', { class: 'lx-sn-dim' }, 'Always') : onOff(S, r.key || 'agency.event.' + r.id, r.key && d[r.key.split('.')[1]] != null ? d[r.key.split('.')[1]] : r.on, r.name) },
    ], rows: data.events || [],
  });

  const peopleTable = people.length ? table({
    cols: [
      { key: 'name', label: 'Person', render: p => h('span', { class: 'lx-st-who' }, avatar(p, { size: 30 }), h('span', null, h('b', null, p.name), h('small', null, p.role))) },
      { key: 'time', label: 'Morning message', render: p => clock(p.time) },
      { key: 'by', label: 'By', class: 'hide-md' },
      { key: 'days', label: 'Days', class: 'hide-sm' },
      { key: 'quiet', label: 'Quiet hours', class: 'hide-md' },
      { key: 'zone', label: 'Time zone', class: 'hide-md' },
    ], rows: people,
  }) : null;

  const stats = data.stats || [];
  put(el, h('div', { class: 'lx-st' },
    saveBar(S, ctx),
    stats.length ? h('section', { class: 'lx-hero line' }, ex.has('stats') ? h('div', null, exampleChip()) : null, kpis(stats.map((s, i) => kpi({ label: s.label, value: s.value, sub: s.sub, size: i === 0 ? 'lg' : null })))) : null,
    whoGroup(S, d),
    featureGroup(S, fj),
    card({ title: 'Messages that send on a clock', note: ex.has('messages') ? exampleChip() : 'Everything else waits in the bell, not in a channel', flush: true, class: 'lx-st-card' }, h('div', { class: 'lx-st-rows' }, messages)),
    card({ title: 'Only when something happens', note: 'One message to one person. Nothing here posts to a team channel.', flush: true, class: 'lx-st-card' }, events),
    group('Time and quiet', 'Times on this page are in this zone unless they say brand time',
      row('Agency time zone', 'Every agency send time reads this clock.', pick(S, 'agency.timeZone', d.timeZone || 'America/Chicago', ZONES, { label: 'Agency time zone', width: 190 })),
      row('Quiet hours', 'Nothing reaches a person in these hours. Each person can set their own.', h('div', { class: 'lx-st-times' }, timePick(S, 'agency.quietFrom', d.quietFrom || '19:00', { label: 'Quiet from' }), h('span', { class: 'lx-sn-dim' }, 'to'), timePick(S, 'agency.quietTo', d.quietTo || '05:00', { label: 'Quiet to' }))),
      row('Send days', 'Days the morning message goes out. Sale weeks send every day.', dayChips(S, 'agency.sendDays', d.sendDays || ['mon', 'tue', 'wed', 'thu', 'fri'])),
      row('Weekly report day', null, pick(S, 'agency.weeklyDay', d.weeklyDay || 'mon', DAY_OPTS, { label: 'Weekly report day', width: 160 }))),
    peopleTable ? card({ title: 'Each person chooses', note: ex.has('people') ? exampleChip() : 'Set in their own profile. You see everyone because you are the owner.', flush: true, class: 'lx-st-card' }, peopleTable) : null,
    fold('Advanced', 'Things that happen without a person',
      row('Reports send themselves to clients at', 'Never means a person always presses Send.', timePick(S, 'agency.reportAuto', d.reportAuto || 'never', { never: true, label: 'Reports send themselves at' })),
      row('Creative approves itself after', 'Hours with no answer from the reviewer. 0 means never.', numBox(S, 'agency.reviewAutoHours', d.reviewAutoHours ?? 0, { suffix: 'hours', width: 40, label: 'Approve after hours' })),
      row('Check-in nudge after', 'Hours after the morning message with no plan posted.', numBox(S, 'agency.nudgeHours', d.nudgeHours ?? 4, { suffix: 'hours', width: 40, label: 'Nudge after hours' })),
      row('Stop morning posts after', 'A late morning message is held for the next day.', timePick(S, 'agency.morningStop', d.morningStop || '12:00', { label: 'Stop morning posts after' }))),
    (data.stopped || []).length ? fold('Stopped', (data.stopped || []).length + ' kinds of post. Each check still runs, it just does not post.',
      table({ cols: [
        { key: 'name', label: 'What it was', render: r => h('b', null, r.name) },
        { key: 'seen', label: 'Posts a week', num: true, class: 'hide-sm' },
        { key: 'why', label: 'Why it stopped', class: 'hide-md' },
        { key: 'where', label: 'Where it lives now' },
      ], rows: data.stopped })) : null,
    facts('Stays fixed', [
      ['Reminders repeat', 'On the day, then 1, 3 and 7 days later', 'Then they go quiet.'],
      ['Months', 'Calendar months', 'The monthly report covers the calendar month.'],
      ['Every channel', 'Picked by name', 'Never typed as an id.'],
    ])));
}

/** Real mode: only what saves on the server. */
function drawReal(el, S, d, ctx, fj) {
  /* 2026-11-26: Action reminders and Today's calls are quiet jobs now (taskReminders, todayPost). While its quiet job
     is off the old switch does nothing, so it is not drawn as one: the row says where to switch it on. A server with
     no jobs list keeps the old switches. */
  const quietOff = id => !!fj && fj.jobs.some(j => j.id === id && !switchOf(j));
  const JOB_OF = { 'agency.actionRemind': 'taskReminders', 'agency.todayPost': 'todayPost' };
  const onCell = r => (quietOff(JOB_OF[r.key])
    ? h('span', { class: 'lx-sn-dim' }, 'Quiet. Switch it on under Quiet jobs.')
    : onOff(S, r.key, d[r.key.split('.')[1]] ?? true, r.name));
  const todayQuiet = quietOff('todayPost');
  const events = table({
    cols: [
      { key: 'name', label: 'Message', render: r => h('b', null, r.name) },
      { key: 'says', label: 'What it says', class: 'hide-md', render: r => h('span', { class: 'lx-sn-dim' }, r.says) },
      { key: 'when', label: 'When', class: 'hide-sm' },
      { key: 'on', label: 'On', num: true, render: onCell },
    ],
    rows: [
      { key: 'agency.actionRemind', name: 'Action reminders', says: 'A promise from a meeting is due', when: 'The morning it is due' },
      /* The worker skips this post while the morning message is on (todaypost.js), so the switch only shows when it is off. */
      d.morningCard === false ? { key: 'agency.todayPost', name: 'Today’s calls in the brand channel', says: 'The day’s ad calls for that brand', when: 'At 8am, only while the morning message is off' } : null,
    ].filter(Boolean),
  });
  put(el, h('div', { class: 'lx-st' },
    saveBar(S, ctx, { note: 'Each change saves for everyone, after a check.' }),
    whoGroup(S, d),
    featureGroup(S, fj),
    group('The morning message', 'One message a day, at one hour (Central time)',
      row('Send at', 'The hour every morning post goes out.', h('div', { class: 'lx-st-times' }, timePick(S, 'agency.morningHour', d.morningHour ?? 5, { hours: true, label: 'Morning message hour' }))),
      row('Morning message on', d.morningCard === false
        ? (todayQuiet ? 'While it is off, today’s calls stay in ' + APP_NAME + ' (their Slack post is a quiet job).' : 'While it is off, today’s calls post on their own in each brand channel.')
        : 'It carries today’s calls for each brand.', onOff(S, 'agency.morningCard', d.morningCard ?? true, 'Morning message on'))),
    card({ title: 'Only when something happens', flush: true, class: 'lx-st-card' }, events),
    h('p', { class: 'lx-foot' }, 'More sending settings come when they save on the server.')));
}

const CSS = `
.lx-sn-msg{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1.25fr) 230px;gap:18px 28px;padding:20px 28px;border-top:1px solid var(--line);align-items:start}
.lx-sn-msg:first-child{border-top:0}
.lx-sn-msg .a{display:flex;gap:10px;min-width:0}
.lx-sn-msg .a .n{font-size:12px;font-weight:650;color:var(--faint);padding-top:2px}
.lx-sn-msg .a .k{font-size:15px;font-weight:600;letter-spacing:-.01em}
.lx-sn-msg .a p{margin-top:4px;font-size:13px;line-height:1.45;color:var(--ink-2)}
.lx-sn-msg .a p.r{color:var(--muted);font-size:12.5px}
.lx-sn-msg .c{display:grid;gap:6px;align-content:start;min-width:0}
.lx-sn-msg .c .lx-cap{margin-top:4px}
.lx-sn-msg .c .on{margin-top:8px}
.lx-sn-note{font-size:12px;color:var(--muted);align-self:center}
.lx-sn-dim{color:var(--muted)}
.lx-sn-top{display:flex;align-items:center;gap:10px;flex-wrap:wrap}
.lx-sn-mixed{font-size:12px;font-weight:600;color:var(--muted)}
.lx-sn-locked{opacity:.55}
.lx-sn-sub{display:flex;align-items:baseline;justify-content:space-between;gap:12px;padding:18px 28px 6px;border-top:1px solid var(--line);font-size:13px;font-weight:600;color:var(--muted);letter-spacing:.02em}
.lx-sn-sub span{font-weight:500;font-size:12px}
.lx-sn-job{display:grid;gap:2px}
.lx-sn-off{font-weight:600;color:var(--ink-2)}
@media (max-width:759px){.lx-sn-sub{padding:16px 18px 6px}}
.lx-sn-locked button,.lx-seg button[disabled]{cursor:not-allowed}
.lx-sn-pv{border-radius:12px;background:var(--surface-2);box-shadow:inset 0 0 0 1px var(--line);padding:12px 14px;font-size:12.5px;line-height:1.45;color:var(--ink-2);min-width:0;overflow-wrap:anywhere}
.lx-sn-pv .top{display:flex;align-items:center;gap:6px;margin-bottom:4px}
.lx-sn-pv .mk{width:16px;height:16px;border-radius:4px;background:var(--ink);flex:none}
.lx-sn-pv .top b{font-size:13px;color:var(--ink)}
.lx-sn-pv .app{font-size:9.5px;font-weight:650;color:var(--muted);background:var(--bg-sunk);border-radius:3px;padding:0 4px}
.lx-sn-pv .tm,.lx-sn-pv .to{font-size:11.5px;color:var(--muted)}
.lx-sn-pv .tt{font-weight:650;color:var(--ink)}
.lx-sn-pv .bt{display:flex;gap:6px;flex-wrap:wrap;margin-top:8px}
.lx-sn-pv .bt span{font-size:11.5px;font-weight:600;padding:3px 9px;border-radius:6px;background:#fff;box-shadow:inset 0 0 0 1px var(--line-strong);color:var(--ink)}
@media (max-width:1040px){.lx-sn-msg{grid-template-columns:minmax(0,1fr) 230px}.lx-sn-msg .b{grid-column:1/-1;grid-row:2}}
@media (max-width:759px){.lx-sn-msg{grid-template-columns:minmax(0,1fr);padding:16px 18px}.lx-sn-msg .b{grid-row:auto}}
`;

export default {
  title: ['What does ', em(APP_NAME + ' send?')],
  eyebrow: 'Agency settings',
  ranges: false,
  async load(ctx) {
    const s = await ctx.api('/api/settings', { worker: 'ah', signal: ctx.signal });
    return { values: { morningHour: s.morningHour, morningCard: s.morningCard, todayPost: s.todayPost, actionRemind: s.actionRemind, senders: s.senders || null, senderPerson: s.senderPerson || null,
      /* 2026-11-26: the agency switches (owner only to change). Missing on an older worker: the group is not drawn. */
      jobs: Array.isArray(s.jobs) ? s.jobs : null, features: s.features || null, canEditJobs: s.canEditJobs, notifyCopies: s.notifyCopies } };
  },
  render: draw,
};

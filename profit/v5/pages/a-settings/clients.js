/* Agency settings > Clients. One row per brand, opening that brand's own settings, plus what every client gets.
   Real mode:
     account-health GET /api/brands             every brand, its status and its channels
     account-health GET /api/clients            every client login and the brands it can open
     account-health PUT /api/accounts/<id>      { active } pauses or runs a brand (through the Save bar's confirm sheet)
     account-health GET|PUT /api/settings       briefClientStyle: what a client reads
   Only switches that save on the server are drawn in real mode. The rest (hide from team, sender name, client daily
   mode, the AI allowance, invite days) have no server home yet: they show in sample mode only. */

import { APP_NAME } from '../../config.js';
import { put } from '../../kit.js';
import { h, em, empty, card, table, statusDot, avatar } from '../../kit.js';
import { css, stage, saveBar, group, row, fold, facts, onOff, pick, numBox, textBox } from '../brand-settings/_set.js';

const slugOf = id => String(id || '').replace(/^brand_/, '').replace(/_/g, '-');

function draw(el, data, ctx) {
  css();
  const brands = (data && data.brands) || [];
  if (!brands.length) return put(el, empty({ title: 'No clients yet', text: 'A brand shows here once its ad account or store is connected.' }));
  const d = data.defaults || {}, real = !ctx.sample;
  const k = (id, n) => 'brand:' + id + '.' + n;
  const sum = h('div', { class: 'lx-st-sum' });
  const paintSum = () => {
    const active = brands.filter(b => b.status !== 'paused').length;
    const logins = brands.reduce((n, b) => n + (b.logins || 0), 0);
    put(sum,
      h('span', { class: 'lx-big' }, String(active), h('small', null, active === 1 ? 'client running' : 'clients running')),
      h('span', { class: 'lx-sp' }),
      brands.length > active ? statusDot('off', (brands.length - active) + ' paused') : null,
      statusDot(logins ? 'good' : 'off', logins + (logins === 1 ? ' client login' : ' client logins')));
  };
  const savers = { 'agency.briefClientStyle': v => ctx.api('/api/settings', { worker: 'ah', method: 'PUT', body: { briefClientStyle: v } }) };
  const names = {}, live = { 'agency.briefClientStyle': d.client_style };
  for (const b of brands) {
    if (real) live[k(b.id, 'paused')] = b.status === 'paused';
    savers[k(b.id, 'paused')] = async v => {
      await ctx.api('/api/accounts/' + encodeURIComponent(b.id), { worker: 'ah', method: 'PUT', body: { active: !v } });
      b.status = v ? 'paused' : 'active';
      paintSum();
    };
    names[k(b.id, 'paused')] = 'Pause ' + b.name;
  }
  const S = stage(ctx, { live, savers, names });

  const list = table({
    cols: [
      { key: 'name', label: 'Brand', sortable: true, render: b => h('a', { class: 'lx-cl-name', href: '#/brand/' + slugOf(b.id) + '/brand-settings/goals' }, h('i', { style: { background: b.color || 'var(--ink)' } }), b.name) },
      { key: 'lead', label: 'Account lead', class: 'hide-sm', render: b => b.lead ? h('span', { class: 'lx-st-who' }, avatar({ name: b.lead }, { size: 24 }), h('span', null, b.lead)) : h('span', { class: 'lx-foot' }, 'Nobody yet') },
      { key: 'logins', label: 'Client logins', num: true, class: 'hide-md', value: b => b.logins || 0, render: b => b.logins ? String(b.logins) : 'None' },
      { key: 'connected', label: 'Connected', class: 'hide-md', render: b => b.connected == null ? '' : statusDot(b.connected.ok === b.connected.of ? 'good' : 'warn', b.connected.ok + ' of ' + b.connected.of) },
      { key: 'paused', label: 'Paused', num: true, render: b => onOff(S, k(b.id, 'paused'), b.status === 'paused', 'Pause ' + b.name) },
      real ? null : { key: 'hide', label: 'Hide from team', num: true, class: 'hide-sm', render: b => onOff(S, k(b.id, 'hide_team'), !!b.hidden, 'Hide ' + b.name + ' from team screens') },
    ].filter(Boolean),
    rows: brands, sort: { key: 'name', dir: 'asc' },
  });
  paintSum();

  put(el, h('div', { class: 'lx-st' },
    saveBar(S, ctx, { note: real ? 'Pausing a brand and what a client reads save for everyone, after a check.' : undefined }),
    h('section', { class: 'lx-hero line' }, sum),
    card({ title: 'Every client', note: 'Open a brand to set its goals, people and sending', flush: true, class: 'lx-st-card lx-cl' }, list),
    group('What every client gets', real ? 'The agency default.' : 'The agency default. A brand can change its own in People and sending.',
      real ? null : row('Client messages are sent as', 'The name a client sees on a Slack post or an email.', pick(S, 'agency.clientSender', d.sender || 'owner', [{ id: 'owner', label: 'The owner' }, { id: 'lead', label: 'Each brand’s account lead' }, { id: 'agency', label: 'The agency' }], { label: 'Client messages are sent as', width: 230 })),
      real ? null : row('Email sender name', 'Shown on welcome, invite and report emails.', textBox(S, 'agency.mailName', d.mail_name || '', { placeholder: 'Your name, Your agency', label: 'Email sender name' })),
      real ? null : row('Client daily goes out', 'Hold for me waits for a person to press Send.', pick(S, 'agency.clientDailyMode', d.daily_mode || 'hold', [{ id: 'hold', label: 'Hold for me' }, { id: 'auto', label: 'Send on its own' }], { label: 'Client daily goes out', width: 190 })),
      row('What a client reads', 'Short is the plain daily. Full is the whole brief.', pick(S, 'agency.briefClientStyle', d.client_style || 'short', [{ id: 'short', label: 'Short daily' }, { id: 'full', label: 'Full brief' }], { label: 'What a client reads', width: 190 }))),
    real ? null : fold('Advanced', 'Rarely touched',
      row(APP_NAME + ' AI allowance per client login', 'A day. Questions and image making together.', numBox(S, 'agency.clientAiDaily', d.ai_daily ?? 5, { prefix: '$', width: 44, label: 'Daily AI allowance' })),
      row('Invite links last', null, numBox(S, 'agency.inviteDays', d.invite_days ?? 30, { suffix: 'days', width: 44, label: 'Invite link days' })),
      row('Show “by the agency” on client pages', null, onOff(S, 'agency.showBy', d.show_by ?? true, 'Show by the agency on client pages'))),
    facts('Stays fixed', [
      ['A client sees', 'Their own brands only', 'Never another client, goals, rules, the team or suggestions.'],
      ['Client sign in', 'Google or an email link', 'No passwords. A sign in lasts 30 days.'],
      ['A paused brand', 'Stops its daily work', 'No briefs, calls or posts until it runs again. Its history is kept.'],
    ])));
}

export default {
  title: ['Who are ', em('our clients?')],
  eyebrow: 'Agency settings',
  ranges: false,
  async load(ctx) {
    const soft = p => p.catch(e => { if (e && e.name === 'AbortError') throw e; return null; });
    const [bj, cj, sj] = await Promise.all([
      ctx.api('/api/brands', { worker: 'ah', signal: ctx.signal }),
      soft(ctx.api('/api/clients?act=all', { worker: 'ah', signal: ctx.signal })),
      soft(ctx.api('/api/settings', { worker: 'ah', signal: ctx.signal })),
    ]);
    const per = {};
    for (const c of (cj && cj.clients) || []) for (const b of c.brands || []) per[b.id] = (per[b.id] || 0) + 1;
    const known = new Map((ctx.brands || []).map(b => [b.id, b]));
    return {
      brands: (bj.brands || []).map(b => ({ id: b.id, name: b.name, status: b.status || 'active', color: (known.get(b.id) || {}).color || null, logins: per[b.id] || 0, lead: null, connected: null, hidden: false })),
      defaults: { client_style: sj && sj.briefClientStyle },
    };
  },
  render(el, data, ctx) {
    draw(el, data, ctx);
  },
};

import { addStyles } from '../../kit.js';
addStyles('lx-cl-css', `
.lx-cl-name{display:inline-flex;align-items:center;gap:10px;font-weight:600;color:var(--ink);text-decoration:none}
.lx-cl-name:hover{text-decoration:underline}
.lx-cl-name i{width:10px;height:10px;border-radius:3px;flex:none}
.lx-cl .lx-table td{vertical-align:middle}
`);

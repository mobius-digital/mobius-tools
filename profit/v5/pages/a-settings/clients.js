/* Agency settings > Clients. One row per brand, opening that brand's own settings, plus what every client gets.
   Real mode:
     account-health GET /api/brands             every brand, its status and its channels
     account-health GET /api/clients            every client login and the brands it can open
     account-health PUT /api/accounts/<id>      { active } pauses or runs a brand (through the Save bar's confirm sheet).
                                                The owner only. A demo brand has no switch: { active: true } would make it a
                                                real brand (briefs, calls and the first sync start). After a save the
                                                status is read back from GET /api/brands, never assumed.
     account-health GET|PUT /api/settings       briefClientStyle: what a client reads
   Only switches that save on the server are drawn in real mode. The rest (hide from team, sender name, client daily
   mode, the AI allowance, invite days) have no server home yet: they show in sample mode only. */

import { APP_NAME } from '../../config.js';
import { put } from '../../kit.js';
import { h, em, empty, card, table, statusDot, avatar } from '../../kit.js';
import { css, stage, saveBar, group, row, fold, setHelp, onOff, pick, numBox, textBox } from '../brand-settings/_set.js';
import { countTiles, look } from './_look.js';

const slugOf = id => String(id || '').replace(/^brand_/, '').replace(/_/g, '-');

function draw(el, data, ctx) {
  css(); look();
  const brands = (data && data.brands) || [];
  if (!brands.length) return put(el, empty({ title: 'No clients yet', text: 'A brand shows here once its ad account or store is connected.' }));
  const d = data.defaults || {}, real = !ctx.sample;
  const k = (id, n) => 'brand:' + id + '.' + n;
  const sum = h('div');
  const paintSum = () => {
    const active = brands.filter(b => b.status === 'active').length;
    const paused = brands.filter(b => b.status === 'paused').length, demo = brands.filter(b => b.status === 'demo').length;
    const logins = brands.reduce((n, b) => n + (b.logins || 0), 0);
    /* running brands only, the same count Client list shows (a paused brand is not listed there) */
    const none = brands.filter(b => b.status === 'active' && !b.logins).length;
    put(sum, countTiles([
      { label: 'Running', value: String(active), sub: active === 1 ? 'client brand' : 'client brands', window: 'Right now', source: 'Brand list' },
      { label: 'Paused', value: String(paused), sub: paused ? 'no briefs, calls or client posts' : 'none paused', window: 'Right now', source: 'Brand list' },
      { label: 'Client logins', value: String(logins), sub: none ? statusDot('warn', none + (none === 1 ? ' running brand has none' : ' running brands have none')) : 'every running brand has one', window: 'Right now', source: 'Client logins' },
      demo ? { label: 'Demo brands', value: String(demo), sub: 'not real clients', window: 'Right now', source: 'Brand list' } : null,
    ], { cols: demo ? 4 : 3 }));
  };
  /* Through data.js saveSetting, so the session's cached agency settings are cleared too. */
  const savers = { 'agency.briefClientStyle': async v => { await ctx.saveSetting('agency.briefClientStyle', v); d.client_style = v; } };
  const names = {}, live = { 'agency.briefClientStyle': d.client_style };
  /* Pausing: the owner only, and never on a demo brand. */
  const canPause = b => b.status !== 'demo' && (ctx.sample || ctx.role === 'owner');
  for (const b of brands) {
    if (!canPause(b)) continue;
    if (real) live[k(b.id, 'paused')] = b.status === 'paused';
    savers[k(b.id, 'paused')] = async v => {
      await ctx.api('/api/accounts/' + encodeURIComponent(b.id), { worker: 'ah', method: 'PUT', body: { active: !v } });
      /* what the server now says, not what was asked for */
      try {
        const j = await ctx.api('/api/brands', { worker: 'ah' });
        const now = (j.brands || []).find(x => x.id === b.id);
        b.status = (now && now.status) || (v ? 'paused' : 'active');
      } catch { b.status = v ? 'paused' : 'active'; }
      paintSum();
    };
    names[k(b.id, 'paused')] = b.status === 'paused' ? 'Pause ' + b.name + ' (running it again restarts its briefs, calls and client posts)' : 'Pause ' + b.name;
  }
  const S = stage(ctx, { live, savers, names });

  const leadOf = b => b.lead ? h('span', { class: 'lx-st-who' }, avatar({ name: b.lead }, { size: 24 }), h('span', null, b.lead)) : h('span', { class: 'lx-foot' }, 'Nobody yet');
  const loginsOf = b => b.logins ? String(b.logins) : 'None';
  const connOf = b => statusDot(b.connected.ok === b.connected.of ? 'good' : 'warn', b.connected.ok + ' of ' + b.connected.of);
  const list = table({
    cols: [
      { key: 'name', label: 'Brand', sortable: true, render: b => h('div', { class: 'lx-cl-cell' },
        h('a', { class: 'lx-cl-name', href: '#/brand/' + slugOf(b.id) + '/brand-settings/goals' }, h('i', { style: { background: b.color || 'var(--ink)' } }), b.name),
        /* on a phone the columns that leave stack here as label and value lines, the Hide from team switch too */
        h('dl', { class: 'lx-cl-more' },
          h('div', null, h('dt', null, 'Account lead'), h('dd', null, leadOf(b))),
          h('div', null, h('dt', null, 'Client logins'), h('dd', null, loginsOf(b))),
          b.connected == null ? null : h('div', null, h('dt', null, 'Connected'), h('dd', null, connOf(b))),
          real ? null : h('div', null, h('dt', null, 'Hide from team'), h('dd', null, onOff(S, k(b.id, 'hide_team'), !!b.hidden, 'Hide ' + b.name + ' from team screens'))))) },
      { key: 'lead', label: 'Account lead', class: 'hide-sm', render: leadOf },
      { key: 'logins', label: 'Client logins', num: true, class: 'hide-sm', value: b => b.logins || 0, render: loginsOf },
      { key: 'connected', label: 'Connected', class: 'hide-sm', render: b => b.connected == null ? '' : connOf(b) },
      { key: 'paused', label: 'Paused', num: true, render: b => canPause(b) ? onOff(S, k(b.id, 'paused'), b.status === 'paused', 'Pause ' + b.name)
        : h('span', { class: 'lx-foot' }, b.status === 'demo' ? 'Demo' : b.status === 'paused' ? 'Paused' : 'Running') },
      real ? null : { key: 'hide', label: 'Hide from team', num: true, class: 'hide-sm', render: b => onOff(S, k(b.id, 'hide_team'), !!b.hidden, 'Hide ' + b.name + ' from team screens') },
      { key: 'open', label: '', num: true, render: b => h('a', { class: 'lx-cl-open', href: '#/brand/' + slugOf(b.id) + '/brand-settings/goals', 'aria-label': 'Open ' + b.name + ' settings' }, 'Open', h('span', { 'aria-hidden': 'true' }, ' ›')) },
    ].filter(Boolean),
    rows: brands, sort: { key: 'name', dir: 'asc' }, roomy: true,
  });
  paintSum();

  put(el, h('div', { class: 'lx-st adm' },
    saveBar(S, ctx, { help: setHelp({
      about: 'Every client brand, one row each. Open a brand to set its goals, people and sending. Below: what every client gets by default.',
      fixed: [
        ['A client sees', 'Their own brands only', 'Never another client, goals, rules, the team or suggestions.'],
        ['Client sign in', 'Google or an email link', 'No passwords. A sign in lasts 30 days.'],
        ['A paused brand', 'Stops its daily work', 'No briefs, calls or posts until it runs again. Its history is kept. Saving asks first.'],
      ],
      sections: [
        { title: 'Connected', text: 'Connections working, out of the ones this brand needs (store, Triple Whale, each ad account, email and the rest). Open the brand, Integrations, to see which.' },
        real ? null : { title: 'Hide from team', text: 'Takes the brand off team screens and lists without pausing it. Its work and client posts carry on.' },
      ].filter(Boolean) }), note: real ? (ctx.role === 'owner' ? 'Pausing a brand and what a client reads save for everyone, after a check.' : 'What a client reads saves for everyone, after a check. Only the owner pauses a brand.') : undefined }),
    sum,
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
  ));
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
.lx-cl .lx-table tbody tr:hover td{background:var(--row-hover)}
.lx-cl-open{font-size:13px;font-weight:600;color:var(--ink-2);text-decoration:none;white-space:nowrap}
.lx-cl-open:hover{color:var(--ink)}
.lx-cl-cell{display:grid;gap:8px;min-width:0}
.lx-cl-more{display:none;margin:0;gap:6px}
.lx-cl-more>div{display:flex;align-items:center;justify-content:space-between;gap:12px;min-height:28px}
.lx-cl-more dt{font-size:12.5px;color:var(--muted)}
.lx-cl-more dd{margin:0;font-size:13px;text-align:right}
@media (max-width:759px){.lx-cl-more{display:grid}}
`);

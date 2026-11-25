/* Agency settings > Team. ONE roster: every person, their job, what they can open, and their Slack link.
   Real mode:
     account-health GET /api/team       who can sign in (email, access, brands they see, guest or on the domain), the domain, the owner
     account-health GET /api/settings   slackSendWho: who may press Send on a client message (owner or anyone)
   A person's job and "active" have no server home yet; they open on the example and are kept on this device.
   Adding, removing or changing access is a write, so it is done in old Locus until the settings release. */

import { APP_NAME } from '../../config.js';
import { put } from '../../kit.js';
import { h, em, empty, card, table, avatar, statusDot, pill, button } from '../../kit.js';
import { css, stage, saveBar, group, row, fold, facts, pick, onOff, exampleChip } from '../brand-settings/_set.js';

const JOBS = [{ id: '', label: 'Not set' }, { id: 'owner', label: 'Owner' }, { id: 'strategist', label: 'Creative strategist' }, { id: 'buyer', label: 'Media buyer' },
  { id: 'editor', label: 'Editor' }, { id: 'designer', label: 'Designer' }, { id: 'google', label: 'Google' }, { id: 'amazon', label: 'Amazon' }, { id: 'email', label: 'Email and SMS' }];
const ACCESS = { owner: 'Owner', admin: 'Team', viewer: 'Viewer', contractor: 'Contractor' };
const nameOf = p => p.name || String(p.email || '').split('@')[0].replace(/[._-]+/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

function draw(el, data, ctx) {
  css();
  const people = (data && data.people) || [];
  if (!people.length) return put(el, empty({ title: 'Nobody on the team list yet', text: 'Everyone on the agency email domain can sign in. Invite others from old ' + APP_NAME + ' for now.' }));
  const S = stage(ctx, { live: { 'agency.slackSendWho': data.send_who } });
  const k = (p, n) => 'team:' + p.email + '.' + n;
  const nBrands = (ctx.brands || []).length;
  const ex = new Set(data.example || []);

  const roster = table({
    cols: [
      { key: 'name', label: 'Person', sortable: true, value: nameOf, render: p => h('span', { class: 'lx-st-who' }, avatar({ ...p, name: nameOf(p) }, { size: 34 }), h('span', null, h('b', null, nameOf(p)), h('small', null, p.email))) },
      { key: 'job', label: 'Job', render: p => pick(S, k(p, 'job'), p.job || '', JOBS, { label: 'Job for ' + nameOf(p), width: 180 }) },
      { key: 'access', label: 'Access', class: 'hide-sm', render: p => h('span', null, ACCESS[p.access] || 'Team', p.guest ? h('small', { class: 'lx-tm-sub' }, 'invited, off the domain') : null) },
      { key: 'brands', label: 'Brands', class: 'hide-md', render: p => !p.brands || !p.brands.length ? 'All ' + (nBrands || '') : p.brands.length + ' of ' + (nBrands || p.brands.length) },
      { key: 'slack', label: 'Slack', class: 'hide-md', render: p => p.slack == null ? h('span', { class: 'lx-foot' }, 'Not checked') : p.slack ? statusDot('good', 'Linked') : statusDot('off', 'Not linked') },
      { key: 'active', label: 'Active', num: true, render: p => onOff(S, k(p, 'active'), p.active !== false, 'Active: ' + nameOf(p)) },
    ],
    rows: people, sort: null, roomy: true,
  });

  put(el, h('div', { class: 'lx-st' },
    saveBar(S, ctx),
    card({ title: 'The team', note: ex.has('jobs') ? exampleChip() : people.length + ' people. Every list in ' + 'the app reads this one.', flush: true, class: 'lx-st-card',
      action: ctx.legacy ? button('Invite someone', { href: ctx.legacy, iconLeft: 'arrow' }) : null }, roster),
    group('Who can do what', null,
      row('Who can send to clients', 'Press Send on a client daily, a report or an update.', pick(S, 'agency.slackSendWho', data.send_who || 'owner', [{ id: 'owner', label: 'The owner only' }, { id: 'anyone', label: 'Anyone on the team' }], { label: 'Who can send to clients', width: 200 })),
      row('Who can approve ideas into briefs', null, pick(S, 'agency.ideaApprovers', data.approvers || 'owner_strategist', [{ id: 'owner', label: 'The owner' }, { id: 'owner_strategist', label: 'Owner and strategists' }, { id: 'anyone', label: 'Anyone on the team' }], { label: 'Who can approve ideas', width: 220 })),
      row('Who sees other people’s work lists', null, pick(S, 'agency.seeOthers', data.see_others || 'owner', [{ id: 'owner', label: 'The owner only' }, { id: 'leads', label: 'Owner and account leads' }, { id: 'anyone', label: 'Everyone' }], { label: 'Who sees other work lists', width: 220 }))),
    fold('Advanced', 'Rarely touched',
      row('Contractors', 'A contractor sees only the brands and cards given to them, never money pages.', onOff(S, 'agency.contractorsOn', data.contractors ?? false, 'Allow contractors'))),
    facts('Stays fixed', [
      ['Team email domain', data.domain ? '@' + data.domain : 'Not read yet', 'Anyone signed in with it is on the team. Others are invited one by one.'],
      ['Owner', data.owner_name || 'The agency owner', 'Sees every brand and every money page. Handing over is done with support.'],
      ['Photos', 'From each person’s Slack', 'Change it in Slack and it changes here.'],
    ])));
}

export default {
  title: ['Who is on ', em('the team?')],
  eyebrow: 'Agency settings',
  ranges: false,
  async load(ctx) {
    const soft = p => p.catch(e => { if (e && e.name === 'AbortError') throw e; return null; });
    const [t, sj, fx] = await Promise.all([
      ctx.api('/api/team', { worker: 'ah', signal: ctx.signal }),
      soft(ctx.api('/api/settings', { worker: 'ah', signal: ctx.signal })),
      soft(ctx.fixture('team.json')),
    ]);
    const owner = String(t.owner || '').toLowerCase();
    const emails = new Set((t.members || []).map(m => String(m.email).toLowerCase()));
    const people = [
      ...(owner && !emails.has(owner) ? [{ email: owner, access: 'owner', brands: [] }] : []),
      ...(t.members || []).map(m => ({ email: m.email, access: String(m.email).toLowerCase() === owner ? 'owner' : m.role, guest: !!m.guest, brands: m.brands || [], slack: null })),
    ];
    return { people, domain: t.domain || null, owner_name: null, send_who: sj ? sj.slackSendWho : null, example: ['jobs'], approvers: fx ? fx.approvers : null };
  },
  render: draw,
};

import { addStyles } from '../../kit.js';
addStyles('lx-tm-css', `.lx-tm-sub{display:block;font-size:12px;color:var(--muted)}`);

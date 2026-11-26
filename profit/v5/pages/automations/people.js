/* Automations > Who does what. The person behind each role an automation can tell (the buyer, the brand owner, the
   strategist, the card's maker, the email owner, the reviewer), for every brand and per brand, and the team list
   that "the whole team" means. A role nobody holds falls back to the person who made the automation, and the run
   log says so. account-health GET and PUT /api/automations/people.
   One table: a row per role, a column for every brand and one per brand. People show as names; the email is the tooltip. */

import { h, put, em, card, button, toast, pill, table } from '../../kit.js';
import { pageHelp } from '../../defs.js';
import { style, ah } from './_auto.js';
import { offPill, nameOf, who } from './_bits.js';
import { css as setCss } from '../brand-settings/_set.js';

/* The people answer has no on or off flag, so the switch is read from GET /api/automations beside it. If that read
   fails the page still draws, with no pill. */
const power = ctx => ah(ctx, '/api/automations').then(a => ({ power: !!a.power, can_power: !!a.can_power }), e => { if (e && e.name === 'AbortError') throw e; return { power: null, can_power: false }; });
const load = async ctx => { const [d, p] = await Promise.all([ah(ctx, '/api/automations/people'), power(ctx)]); return { ...d, ...p }; };
const cap = s => String(s || '').replace(/^the /, '').replace(/^./, c => c.toUpperCase());

function render(el, d, ctx) {
  style(); setCss();
  d = d || {};
  const roles = d.roles || {}, words = d.role_words || {}, team = d.team || [];
  const save = async body => {
    if (ctx.sample) return toast('Sample mode: nothing is saved.');
    try { const r = await ah(ctx, '/api/automations/people', { method: 'PUT', body }); toast('Saved.'); render(el, { ...r, power: d.power, can_power: d.can_power }, ctx); }
    catch (e) { toast(e.message, { tone: 'bad', ms: 5000 }); render(el, d, ctx); }
  };
  const pick = (scope, role, label, scopeName) => {
    const cur = (roles[scope] || {})[role] || '', locked = !d.can_edit || (scope === 'all' && !d.can_all);
    const blank = scope === 'all' ? 'Nobody yet' : (roles.all || {})[role] ? 'Same as every brand (' + nameOf(roles.all[role], team) + ')' : 'Nobody yet';
    const emails = [...new Set([...team.map(p => p.email), cur].filter(Boolean))];
    return h('select', { class: 'lx-input lx-st-sel au-sel', 'aria-label': cap(label) + ', ' + scopeName, title: cur || '', disabled: locked || null, onchange: e => save({ roles: { [scope]: { [role]: e.target.value || null } } }) },
      [h('option', { value: '', selected: !cur || null }, blank), ...emails.map(e => h('option', { value: e, title: e, selected: e === cur || null }, nameOf(e, team)))]);
  };
  const brands = (d.brands || []).filter(b => !ctx.brand || b.id === ctx.brand.id);
  const scopes = [...(ctx.brand ? [] : [{ id: 'all', name: 'Every brand' }]), ...brands.map(b => ({ id: b.id, name: b.name }))];
  const grid = card({ title: 'Who each role is', note: ctx.brand ? 'For this brand' : 'Every brand is used for any brand with nobody of its own', flush: true, class: 'lx-st-card' },
    table({ roomy: true, rows: Object.entries(words).map(([role, label]) => ({ role, label })), cols: [
      { key: 'label', label: 'Role', render: r => h('b', null, cap(r.label)) },
      ...scopes.map(s => ({ key: s.id, label: s.name, render: r => pick(s.id, r.role, r.label, s.name) })),
    ] }));
  const add = h('input', { class: 'lx-input', type: 'email', placeholder: 'name@company.com', 'aria-label': 'Add a person to the team list' });
  const people = card({ title: 'The whole team', note: team.length + (team.length === 1 ? ' person hears' : ' people hear') + ' an automation that tells the whole team', flush: true, class: 'lx-st-card' },
    table({ roomy: true, rows: team, cols: [
      { key: 'email', label: 'Person', render: p => who(p.email, team, 30) },
      { key: 'how', label: 'On the list', render: p => p.by_hand ? 'Added by hand' : h('span', { class: 'au-muted' }, 'From the team list') },
      { key: 'x', label: '', num: true, render: p => p.by_hand && d.can_team ? button('Take off', { ghost: true, onclick: () => save({ team_remove: [p.email] }) }) : '' },
    ] }),
    d.can_team ? h('div', { class: 'au-add' }, h('label', null, 'Someone missing? They must already be able to sign in.'), add,
      button('Add to the team list', { onclick: () => { const v = add.value.trim().toLowerCase(); if (v.includes('@')) save({ team_add: [v] }); } })) : null);
  put(el, h('div', { class: 'au' },
    h('div', { class: 'au-head' }, pageHelp({ body: [
      { title: 'What it is for', text: 'Pick the person behind each role. An automation that tells "the buyer" reaches whoever is set here, for that brand, or for every brand when the brand has nobody of its own.' },
      { title: 'Nobody set', text: d.note || 'A role nobody holds falls back to the person who made the automation, and the run log says so.' },
      { title: 'The whole team', text: 'Everyone on the team list. A client is never on it. People come from the team list; someone added by hand can be taken off here.' },
    ] }), offPill(d, ctx)),
    grid,
    ctx.brand ? null : people));
}

export default {
  title: ['Who does ', em('what')],
  eyebrow: 'Automations',
  ranges: false,
  load, render,
};

import { addStyles } from '../../kit.js';
addStyles('au-people-css', `.au-sel{width:100%!important;min-width:150px;max-width:220px}
.au-muted{color:var(--muted);font-size:12.5px}
.au-add{display:flex;align-items:center;gap:10px;flex-wrap:wrap;padding:14px 28px 18px;border-top:1px solid var(--line)}
.au-add label{flex-basis:100%;font-size:12.5px;color:var(--muted)}
.au-add .lx-input{flex:1;min-width:220px;height:36px}
@media (max-width:759px){.au-add{padding:14px 18px}}`);

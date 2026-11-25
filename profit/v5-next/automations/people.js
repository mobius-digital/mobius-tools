/* Automations > Who does what. The person behind each role an automation can tell (the buyer, the brand owner, the
   strategist, the card's maker, the email owner, the reviewer), for every brand and per brand, and the team list
   that "the whole team" means. A role nobody holds falls back to the person who made the automation, and the run
   log says so. account-health GET and PUT /api/automations/people. */

import { h, put, em, card, button, toast, pill } from '../../kit.js';
import { style, ah } from './_auto.js';

const load = ctx => ah(ctx, '/api/automations/people');
const cap = s => String(s || '').replace(/^the /, '').replace(/^./, c => c.toUpperCase());

function render(el, d, ctx) {
  style();
  d = d || {};
  const roles = d.roles || {}, words = d.role_words || {}, team = d.team || [];
  const save = async body => {
    if (ctx.sample) return toast('Sample mode: nothing is saved.');
    try { const r = await ah(ctx, '/api/automations/people', { method: 'PUT', body }); toast('Saved.'); render(el, r, ctx); }
    catch (e) { toast(e.message, { tone: 'bad', ms: 5000 }); render(el, d, ctx); }
  };
  const pick = (scope, role, label) => {
    const cur = (roles[scope] || {})[role] || '', locked = !d.can_edit || (scope === 'all' && !d.can_all);
    const blank = scope === 'all' ? 'Nobody yet' : (roles.all || {})[role] ? 'Same as every brand: ' + roles.all[role] : 'Nobody yet';
    const emails = [...new Set([...team.map(p => p.email), cur].filter(Boolean))];
    return h('select', { 'aria-label': cap(label), disabled: locked || null, onchange: e => save({ roles: { [scope]: { [role]: e.target.value || null } } }) },
      [h('option', { value: '', selected: !cur || null }, blank), ...emails.map(e => h('option', { value: e, selected: e === cur || null }, e))]);
  };
  const block = (scope, title, note) => card({ title, note }, h('div', { class: 'au-pick' },
    Object.entries(words).flatMap(([role, label]) => [h('label', null, cap(label)), pick(scope, role, label)])));
  const brands = (d.brands || []).filter(b => !ctx.brand || b.id === ctx.brand.id);
  const add = h('input', { type: 'email', placeholder: 'name@company.com', 'aria-label': 'Add a person to the team list' });
  const people = card({ title: 'The whole team', note: team.length + (team.length === 1 ? ' person hears' : ' people hear') + ' an automation that tells the whole team. A client is never on this list.' },
    h('div', { class: 'au-log' }, team.map(p => h('div', { class: 'au-run', style: { gridTemplateColumns: 'minmax(0,1fr) auto' } }, h('b', null, p.email),
      p.by_hand ? (d.can_team ? button('Take off', { onclick: () => save({ team_remove: [p.email] }) }) : pill('', 'Added by hand')) : h('span')))),
    d.can_team ? h('div', { class: 'au-pick' }, h('label', null, 'Someone missing? Add them. They must already be able to sign in.'), add,
      button('Add to the team list', { onclick: () => { const v = add.value.trim().toLowerCase(); if (v.includes('@')) save({ team_add: [v] }); } })) : null);
  put(el, h('div', { class: 'au' },
    h('div', { class: 'au-top' }, h('p', null, d.note || 'Pick the person behind each role. An automation that tells "the buyer" reaches whoever is set here.')),
    ctx.brand ? null : block('all', 'Every brand', 'Used for any brand that has nobody of its own set below.'),
    brands.map(b => block(b.id, b.name, 'Only for this brand.')),
    ctx.brand ? null : people));
}

export default {
  title: ['Who does ', em('what')],
  eyebrow: 'Automations',
  ranges: false,
  load, render,
};

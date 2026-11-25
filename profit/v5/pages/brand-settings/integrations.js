/* Brand settings > Integrations. What this brand is connected to, one row per tool, connected or not.
   Real mode: account-health GET /api/integrations?brand=<brand id> (the same read the old Connections screen uses).
   Nothing here connects or disconnects anything; a row that is not connected says how. */

import { put } from '../../kit.js';
import { h, em, empty, card, statusDot } from '../../kit.js';
import { css, stateDot } from './_set.js';
import { conGroups, conHero } from './_con.js';

const ORDER = ['Store', 'Ads', 'Data', 'Website', 'Email & SMS', 'Email and SMS', 'Making ads', 'Work'];

function draw(el, data, ctx) {
  css();
  const items = (data && data.items) || [];
  if (!items.length) return put(el, empty({ title: 'Nothing is connected yet', text: 'This brand has no store, ad account or tool connected. ' + (ctx.isClient ? '' : 'Start with the store, then the ad accounts.') }));
  const agency = (data.agency || []);
  put(el, h('div', { class: 'lx-st' },
    conHero(items, 'connected for ' + (ctx.brand ? ctx.brand.name : 'this brand')),
    ...conGroups(items, ORDER, it => it.gives ? 'Gives: ' + it.gives : ''),
    agency.length ? card({ title: 'Agency connections this brand rides on', note: 'Made once for every brand', flush: true, class: 'lx-st-card',
      action: ctx.isClient ? null : h('a', { href: '#/agency/all/a-settings/integrations' }, 'Open agency integrations') },
      h('div', { class: 'lx-st-rows' }, agency.map(a => h('div', { class: 'lx-st-row inline' }, h('div', { class: 't' }, h('div', { class: 'k' }, a.name), a.brands ? h('div', { class: 'hint' }, 'Used by ' + a.brands + (a.brands === 1 ? ' brand' : ' brands')) : null), h('div', { class: 'c' }, stateDot(a.state)))))) : null,
    h('p', { class: 'lx-foot' }, 'A connection is made by the client giving access, or by the agency once for every brand. Nothing on this page changes a connection.')));
}

export default {
  title: ['Is everything ', em('connected?')],
  eyebrow: ctx => (ctx.brand ? ctx.brand.name + ', ' : '') + 'brand settings',
  ranges: false,
  asOf: d => (d && d.as_of ? Date.parse(d.as_of) : null),
  async load(ctx) {
    if (!ctx.brand) return null;
    const j = await ctx.api('/api/integrations?brand=' + encodeURIComponent(ctx.brand.id), { worker: 'ah', signal: ctx.signal });
    const mine = (j.brands || []).find(b => b.act_id === ctx.brand.id || b.name === ctx.brand.name) || (j.brands || [])[0] || {};
    const n = (j.brands || []).length || (ctx.brands || []).length;
    return {
      as_of: j.as_of || null,
      items: (mine.items || []).map(i => ({ key: i.key, name: i.name, group: i.group, state: i.state, note: i.note, fix: i.fix, gives: typeof i.gives === 'string' ? i.gives : '' })),
      agency: (j.agency || []).filter(a => !a.only).map(a => ({ key: a.key, name: a.name, state: a.state, brands: n })),
    };
  },
  render: draw,
};

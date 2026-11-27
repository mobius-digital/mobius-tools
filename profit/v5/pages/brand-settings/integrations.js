/* Brand settings > Integrations. What this brand is connected to, one row per tool, connected or not.
   Real mode: account-health GET /api/integrations?brand=<brand id> (the same read the old Connections screen uses).
   Nothing here connects or disconnects anything; a row that is not connected says how. */

import { put } from '../../kit.js';
import { h, em, empty, card, statusDot } from '../../kit.js';
import { css, stateDot } from './_set.js';
import { addStyles } from '../../kit.js';
addStyles('bi-css', `.bi-ag-link{font-size:13px;font-weight:600;color:var(--ink);text-decoration:none}
.bi-ag-link:hover{text-decoration:underline}
.bi-ag-foot{display:none;padding:12px 18px 2px}
@media (max-width:759px){.bi-ag-foot{display:block}}`);
import { conGroups, conHero, conHead } from './_con.js';
import { pageHelp } from '../../defs.js';

const ORDER = ['Store', 'Ads', 'Data', 'Website', 'Email & SMS', 'Email and SMS', 'Making ads', 'Work'];

function draw(el, data, ctx) {
  css();
  const items = (data && data.items) || [];
  if (!items.length) return put(el, empty({ title: 'Nothing is connected yet', text: 'This brand has no store, ad account or tool connected. ' + (ctx.isClient ? '' : 'Start with the store, then the ad accounts.') }));
  const agency = (data.agency || []);
  put(el, h('div', { class: 'lx-st' },
    h('div', null, pageHelp({ body: [
      { title: 'What it is for', text: 'Every tool this brand is connected to, one row each: whether it works, what was last read, and what it gives the app.' },
      { title: 'How a connection is made', text: 'By the client giving access, or by the agency once for every brand. Nothing on this page changes a connection; a row that is not connected says how to connect it.' },
    ] })),
    conHero(items, 'tools for ' + (ctx.brand ? ctx.brand.name : 'this brand'), data.as_of),
    ...conGroups(items, ORDER, it => it.gives || ''),
    agency.length ? card({ title: 'Agency connections this brand rides on', note: 'Made once for every brand', flush: true, class: 'lx-st-card',
      /* the link sits in the card head on a wide screen; on a phone it drops under the list instead of floating
         between the title and its note */
      action: ctx.isClient ? null : h('a', { class: 'bi-ag-link hide-sm', href: '#/agency/all/a-settings/integrations' }, 'Open agency integrations') },
      h('div', { class: 'lx-st-rows' }, agency.map(a => h('div', { class: 'lx-st-row inline' }, h('div', { class: 't' }, h('div', { class: 'k' }, a.name), a.brands ? h('div', { class: 'hint' }, a.brands + (a.brands === 1 ? ' brand' : ' brands')) : null), h('div', { class: 'c' }, stateDot(a.state))))),
      ctx.isClient ? null : h('a', { class: 'bi-ag-link bi-ag-foot', href: '#/agency/all/a-settings/integrations' }, 'Open agency integrations')) : null));
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

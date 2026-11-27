/* Agency settings > Integrations. Every tool, connected or not, and how many brands use it.
   Real mode: account-health GET /api/integrations (the agency connections, and each brand's connections, which this
   page counts per tool). Nothing here connects or disconnects anything; a row that is not connected says how. */

import { put } from '../../kit.js';
import { h, em, empty, card } from '../../kit.js';
import { css } from '../brand-settings/_set.js';
import { conHero, conRow, conHead } from '../brand-settings/_con.js';
import { pageHelp } from '../../defs.js';

const RANK = { bad: 0, warn: 1, off: 2, ok: 3 };

function draw(el, data, ctx) {
  css();
  const agency = (data && data.agency) || [], tools = (data && data.per_brand) || [];
  if (!agency.length && !tools.length) return put(el, empty({ title: 'Nothing read yet', text: 'The connections list did not answer. Try again in a minute.' }));
  const nb = data.brands || 0;
  put(el, h('div', { class: 'lx-st' },
    h('div', null, pageHelp({ body: [
      { title: 'What it is for', text: 'Every tool the agency uses: the connections made once for the agency, which every brand rides on, and the ones each client gives access to, counted across brands.' },
      { title: 'Nothing changes here', text: 'Nothing on this page changes a connection. A row that is not connected says how to connect or fix it. Open a brand for its own list.' },
    ] })),
    conHero(agency, 'agency connections', data.as_of),
    card({ title: 'Made once for the agency', note: 'Every brand rides on these', flush: true, class: 'lx-st-card' },
      h('div', { class: 'lx-st-rows' }, conHead(), agency.slice().sort((a, b) => RANK[a.state] - RANK[b.state]).map(a => conRow(a, a.used_by || '')))),
    tools.length ? card({ title: 'Made per brand', note: 'Each client gives access to their own', flush: true, class: 'lx-st-card' },
      h('div', { class: 'lx-st-rows' }, conHead('Brands'), tools.map(t => conRow({ ...t, state: t.ok === nb ? 'ok' : t.ok ? 'part' : 'none', note: t.ok === nb ? 'Connected on every brand.' : t.missing && t.missing.length ? 'Not on ' + t.missing.join(', ') + '.' : '' },
        t.ok + ' of ' + nb + ' brands')))) : null));
}

export default {
  title: ['Is the agency ', em('plugged in?')],
  eyebrow: 'Agency settings',
  ranges: false,
  asOf: d => (d && d.as_of ? Date.parse(d.as_of) : null),
  async load(ctx) {
    const j = await ctx.api('/api/integrations', { worker: 'ah', signal: ctx.signal });
    const brands = j.brands || [], per = new Map();
    for (const b of brands) for (const i of b.items || []) {
      const t = per.get(i.key) || { key: i.key, name: i.name, group: i.group === 'Work' ? 'Production tools' : i.group, ok: 0, missing: [] };
      if (i.state === 'ok') t.ok++; else t.missing.push(b.name);
      per.set(i.key, t);
    }
    return {
      as_of: j.as_of || null, brands: brands.length,
      agency: (j.agency || []).map(a => ({ key: a.key, name: a.name, group: a.group === 'Work' ? 'Production tools' : a.group, state: a.state, note: a.note, fix: a.fix, used_by: a.used_by, checks: a.checks })),
      per_brand: [...per.values()].map(t => ({ ...t, missing: t.missing.slice(0, 4) })),
    };
  },
  render: draw,
};

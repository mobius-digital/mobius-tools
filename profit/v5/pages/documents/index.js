/* Documents: the one-off pages made for this client (a growth plan, a walk-through, an analysis), each on its own
   public link. Read only: pages are pushed and turned off from the team's tools, not from here.
   Live data: GET /api/client-pages?act=<brand id> (profit worker). That route is for the team only: "See as client"
   still reads it and shows the live links without the view counts; a real client login asks nothing and gets a
   plain note until a client route exists. */

import { put } from '../../kit.js';
import { h, hero, kpis, kpi, statusDot, button, em, empty, num, relativeTime } from '../../kit.js';
import { css, dayOf, heading, row, list, copyBtn } from '../calendar/_cr.js';

function draw(el, d, ctx) {
  css();
  if (d && d.clientBlocked) {
    return put(el, empty({ title: 'No documents shared here yet', text: 'When your team makes a page for you, a plan or a walk-through, its link shows here.' }));
  }
  if (!d || !Array.isArray(d.pages)) return put(el, empty({ title: 'Documents did not answer', text: 'Nothing was read. Try again in a minute.' }));
  const pages = ctx.isClient ? d.pages.filter(p => !p.revoked) : d.pages;
  if (!pages.length) {
    return put(el, empty({ title: 'No documents for this brand yet', text: ctx.isClient ? 'When your team makes a page for you, its link shows here.' : 'One-off pages pushed for this client (a growth plan, a walk-through) show here with their link and how often they were opened.' }));
  }
  const live = pages.filter(p => !p.revoked);
  const views = live.reduce((t, p) => t + (+p.views || 0), 0);
  const last = live.map(p => p.last_view).filter(Boolean).sort().pop();

  const head = hero({ line: true }, h('div', { class: 'cr-fit' }, kpis([
    kpi({ label: 'Live documents', value: String(live.length), size: 'lg', sub: pages.length > live.length ? (pages.length - live.length) + ' turned off' : 'all links work' }),
    ctx.isClient ? null : kpi({ label: 'Times opened', value: num(views), size: 'lg', sub: 'across the live links' }),
    ctx.isClient ? null : kpi({ label: 'Last opened', value: last ? relativeTime(last) : 'never', size: 'lg', sub: last ? dayOf(last) : 'nobody has opened one yet' }),
  ].filter(Boolean), { cols: ctx.isClient ? 1 : 3 })));

  const rows = pages.map(p => row({
    title: p.title,
    sub: ['Updated ' + dayOf(p.updated_at), (p.acts || []).length > 1 ? 'Shared across ' + p.acts.length + ' brands' : null].filter(Boolean).join('. '),
    cells: [
      ctx.isClient ? null : { w: 110, class: 'hide-sm', label: 'Opened', node: num(p.views || 0) + (p.views === 1 ? ' time' : ' times') },
      ctx.isClient ? null : { w: 110, class: 'hide-md', label: 'Last', node: p.last_view ? dayOf(p.last_view) : 'never' },
      { w: 110, node: p.revoked ? statusDot('off', 'Turned off') : statusDot('good', 'Live') },
    ],
    action: p.revoked ? null : [button('Open', { href: p.url, target: '_blank', icon: 'arrow' }), ctx.isClient ? null : copyBtn(p.url)],
  }));
  put(el, head, h('section', { class: 'cr-sect' }, heading('Pages for this client', pages.length), list(rows)));
}

export default {
  title: ctx => ctx.isClient ? ['What has the team ', em('made for you?')] : ['What have we ', em('made for them?')],
  eyebrow: 'Documents',
  ranges: false,
  async load(ctx) {
    /* A real client login cannot read this route (team only, and its 401 would sign them out), so ask nothing.
       This is the one place role is read: "See as client" is still the team and can read it. */
    if (ctx.isClient && ctx.role === 'client') return { clientBlocked: true };
    const d = await ctx.api('/api/client-pages?act=' + encodeURIComponent(ctx.brand.id), { signal: ctx.signal });
    return { pages: (d.pages || []).map(({ token, title, acts, updated_at, created_at, revoked, views, last_view, url }) => ({ token, title, acts, updated_at, created_at, revoked, views, last_view, url })) };
  },
  async sample(ctx) {
    const all = await ctx.fixture('index.json');
    const id = ctx.brand && ctx.brand.id;
    return { pages: all.pages.filter(p => (p.acts || []).includes(id)) };
  },
  render: draw,
  skeleton(el) { el.innerHTML = '<div class="lx-skel chart" style="height:150px"></div><div class="lx-skel row"></div><div class="lx-skel row"></div>'; },
};

/* Documents: the one-off pages made for this client (a growth plan, a walk-through, an analysis), each on its own
   public link. Read only: pages are pushed and turned off from the team's tools, not from here.
   Live data: GET /api/client-pages?act=<brand id> (profit worker). That route is for the team only: "See as client"
   still reads it and shows the live links without the view counts; a real client login asks nothing and gets a
   plain note until a client route exists. */

import { put } from '../../kit.js';
import { h, tiles, kpi, statusDot, button, em, empty, num, relativeTime } from '../../kit.js';
import { css, dayOf, row, list, box, sortRows, flipSort, copyBtn, goNote, helpBar } from '../calendar/_cr.js';

const view = { sort: null };

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

  /* a client sees no tile row: one lone tile would only repeat the list's own count */
  const head = ctx.isClient ? null : tiles([
    kpi({ label: 'Live documents', value: String(live.length), size: 'lg', sub: pages.length > live.length ? (pages.length - live.length) + ' turned off' : 'all links work' }),
    kpi({ label: 'Times opened', value: num(views), sub: 'across the live links' }),
    kpi({ label: 'Last opened', value: last ? relativeTime(last) : 'never', sub: last ? dayOf(last) : 'nobody has opened one yet' }),
  ], { cols: 3 });
  /* "Last opened" is words: the word size, with the exact time on hover */
  const lo = head && head.querySelectorAll('.lx-kpi .v')[2];
  if (lo) { lo.classList.add('words'); if (last) lo.title = new Date(last).toLocaleString('en-US'); }

  const ordered = sortRows(pages, view.sort, (p, k) => k === 'title' ? p.title : k === 'views' ? +p.views || 0 : k === 'last' ? p.last_view || '' : k === 'status' ? (p.revoked ? 1 : 0) : null);
  const rows = ordered.map(p => row({
    title: p.title,
    sub: ['Updated ' + dayOf(p.updated_at), (p.acts || []).length > 1 ? 'Shared across ' + p.acts.length + ' brands' : null].filter(Boolean).join('. '),
    cells: [
      ctx.isClient ? null : { w: 110, class: 'hide-sm', label: 'Opened', node: num(p.views || 0) + (p.views === 1 ? ' time' : ' times') },
      ctx.isClient ? null : { w: 110, class: 'hide-md', label: 'Last opened', node: p.last_view ? dayOf(p.last_view) : 'never' },
      { w: 110, label: 'Status', node: p.revoked ? statusDot('off', 'Turned off') : statusDot('good', 'Live') },
    ],
    /* an ended link keeps the slot, so its cells stay under the other rows' */
    action: p.revoked ? goNote('Link ended') : [button('Open', { href: p.url, target: '_blank', icon: 'arrow' }), ctx.isClient ? null : copyBtn(p.url)],
  }));
  const go = ctx.isClient ? 110 : 230;
  put(el, helpBar([
    { title: 'What it is for', text: ctx.isClient ? 'Pages your team made for you, like a plan or a walk-through, each on its own link.' : 'One-off pages made for this client (a growth plan, a walk-through, an analysis), each on its own public link, with how often it was opened.' },
    { title: 'The links', text: 'Anyone with a link can open it without signing in. A turned off link shows a "link ended" page. ' + (ctx.isClient ? '' : 'Turn a link off from Agency > Shared links.') },
  ]), head, box({ title: ctx.isClient ? 'Pages for you' : 'Pages for this client', n: pages.length, note: ctx.isClient ? null : 'Opens counted on the public link' },
    list(rows, null, { head: [ctx.isClient ? null : { label: 'Opened', w: 110, class: 'hide-sm', sort: 'views' }, ctx.isClient ? null : { label: 'Last opened', w: 110, class: 'hide-md', sort: 'last' }, { label: 'Status', w: 110, sort: 'status' }],
      first: 'Page', firstSort: 'title', go, sort: view.sort, onSort: k => { view.sort = flipSort(view.sort, k, k === 'title' || k === 'status' ? 'asc' : 'desc'); draw(el, d, ctx); } })));
  ctx.askContext = 'Documents made for ' + ((ctx.brand && ctx.brand.name) || 'this client') + ': ' + live.length + ' live links' + (ctx.isClient ? '.' : ', opened ' + views + ' times in all.');
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

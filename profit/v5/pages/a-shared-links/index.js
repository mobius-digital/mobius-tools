/* Agency > Shared links: every public link that is out in the world. Frozen snapshots of a page or a card, and the
   one-off client pages. Who made it, how often it was opened, when it stops working. Read only: turning a link off
   stays in old Locus (the Shared links list in Settings) until this page gets its button.
   Live data (profit worker, reads only):
     GET /api/snapshots      snapshot links (brand limits apply on the worker)
     GET /api/client-pages   client pages, every brand */

import { APP_NAME } from '../../config.js';
import { put } from '../../kit.js';
import { h, hero, kpis, kpi, statusDot, button, segmented, em, empty, num } from '../../kit.js';
import { css, short, dayOf, between, todayYmd, heading, row, list, brandTag, colorOf, copyBtn } from '../calendar/_cr.js';

const view = { show: 'live' };
const who = e => { const l = String(e || '').split('@')[0]; return l ? l.charAt(0).toUpperCase() + l.slice(1).replace(/[._-].*$/, '') : ''; };
const SNAP = new URL('../s.html?t=', location.href).href;

function draw(el, d, ctx) {
  css();
  if (!d || !Array.isArray(d.links)) return put(el, empty({ title: 'Shared links did not answer', text: 'Nothing was read. Try again in a minute.' }));
  const today = d.today || todayYmd();
  const links = d.links.map(l => ({ ...l, color: colorOf(ctx, l.act_id) }));
  if (!links.length) return put(el, empty({ title: 'No shared links', text: 'Links made with "Share a public link" and pages pushed for a client show here.' }));
  const live = links.filter(l => l.live);
  const soon = live.filter(l => l.expires_at && between(today, String(l.expires_at).slice(0, 10)) <= 7);
  const week = live.filter(l => l.last_view && between(String(l.last_view).slice(0, 10), today) <= 7);

  const head = hero({ line: true }, kpis([
    kpi({ label: 'Live links', value: String(live.length), size: 'lg', sub: live.filter(l => l.type === 'page').length + ' client pages, ' + live.filter(l => l.type === 'snap').length + ' snapshots' }),
    kpi({ label: 'Opened in the last 7 days', value: String(week.length), size: 'lg', sub: num(week.reduce((t, l) => t + (+l.views || 0), 0)) + ' opens in all' }),
    kpi({ label: 'Stop working this week', value: String(soon.length), size: 'lg', sub: soon.length ? statusDot('warn', 'renew if still needed') : 'none' }),
    kpi({ label: 'Never opened', value: String(live.filter(l => !l.views).length), size: 'lg', sub: 'live, no views yet' }),
  ], { cols: 4 }));

  const box = h('section', { class: 'cr-sect' });
  const paint = () => {
    const pick = view.show === 'live' ? live : view.show === 'off' ? links.filter(l => !l.live) : links;
    pick.sort((a, b) => String(b.last_view || b.created_at).localeCompare(String(a.last_view || a.created_at)));
    const rows = pick.map(l => {
      const ends = l.expires_at ? between(today, String(l.expires_at).slice(0, 10)) : null;
      return row({
        title: l.title || 'Untitled',
        sub: [l.type === 'page' ? 'Client page' : l.kind === 'card' ? 'Snapshot of a card' : 'Snapshot of a page', 'made ' + dayOf(l.created_at) + (l.created_by ? ' by ' + who(l.created_by) : '')].join(', '),
        cells: [
          { w: 170, node: l.brands && l.brands.length > 1 ? h('span', { class: 'cr-brand' }, l.brands.length + ' brands') : brandTag(l.brand || '', l.color) },
          { w: 96, class: 'hide-sm', label: 'Opened', node: num(l.views || 0) + (l.views === 1 ? ' time' : ' times') },
          { w: 150, node: !l.live ? statusDot('off', l.revoked ? 'Turned off' : 'Ended ' + dayOf(l.expires_at))
            : ends == null ? statusDot('good', 'Live, no end date') : statusDot(ends <= 7 ? 'warn' : 'good', 'Live to ' + short(String(l.expires_at).slice(0, 10))) },
        ],
        action: l.live ? [button('Open', { href: l.url, target: '_blank', icon: 'arrow' }), copyBtn(l.url)] : null,
      });
    });
    put(box, 
      h('div', { class: 'cr-bar-top', style: { paddingBottom: '6px' } },
        segmented([{ id: 'live', label: 'Live ' + live.length }, { id: 'off', label: 'Ended ' + (links.length - live.length) }, { id: 'all', label: 'All ' + links.length }], view.show, id => { view.show = id; paint(); }),
        h('span', { class: 'sp' }),
        ctx.legacy ? button('Turn a link off in old ' + APP_NAME, { href: ctx.legacy }) : null),
      list(rows, 'Nothing here.'));
  };
  paint();
  put(el, head, box);
}

export default {
  title: ['Which links are ', em('out in the world?')],
  eyebrow: 'Shared links',
  ranges: false,
  async load(ctx) {
    const [s, p] = await Promise.all([
      ctx.api('/api/snapshots', { signal: ctx.signal }),
      ctx.api('/api/client-pages', { signal: ctx.signal }),
    ]);
    const names = Object.fromEntries((ctx.brands || []).map(b => [b.id, b.name]));
    return { links: [
      ...(s.links || []).map(l => ({ type: 'snap', token: l.token, act_id: l.act_id, brand: l.brand, kind: l.kind, title: l.title, created_by: l.created_by, created_at: l.created_at, expires_at: l.expires_at, revoked: !!l.revoked, live: !!l.live, views: l.views, last_view: l.last_view, url: SNAP + l.token })),
      ...(p.pages || []).map(l => ({ type: 'page', token: l.token, act_id: (l.acts || [])[0], brand: names[(l.acts || [])[0]] || '', brands: l.acts, title: l.title, created_by: l.created_by, created_at: l.created_at, expires_at: null, revoked: !!l.revoked, live: !l.revoked, views: l.views, last_view: l.last_view, url: l.url })),
    ] };
  },
  render: draw,
  skeleton(el) { el.innerHTML = '<div class="lx-skel chart" style="height:150px"></div><div class="lx-skel row"></div><div class="lx-skel row"></div><div class="lx-skel row"></div>'; },
};

/* Agency > Shared links: every public link that is out in the world. Frozen snapshots of a page or a card, and the
   one-off client pages. Who made it, how often it was opened, when it stops working, and Turn off.
   Live data (profit worker):
     GET  /api/snapshots              snapshot links (brand limits apply on the worker)
     GET  /api/client-pages           client pages, every brand
   Writes (team only, one link at a time, after a confirm; the same routes old Locus uses):
     POST /api/snapshot/revoke    { token }   turn a snapshot off (old Locus Settings > Shared links, share.js)
     POST /api/client-page/revoke { token }   turn a client page off (worker/src/clientpage.js)
   Sample mode never calls a route: Turn off flips the row on this page only and says so. */

import { put } from '../../kit.js';
import { h, statusDot, button, segmented, em, empty, num, sheet, toast, addStyles } from '../../kit.js';
import { css, short, dayOf, between, todayYmd, row, list, brandTag, colorOf, copyBtn, helpBar, searchBox, selectBox, filterNote, goNote } from '../calendar/_cr.js';
import { canWrite } from '../production/_act.js';
import { adm, countTiles } from '../a-settings/_look.js';

const view = { show: 'live', q: '', type: '', only: '' };
const who = e => { const l = String(e || '').split('@')[0]; return l ? l.charAt(0).toUpperCase() + l.slice(1).replace(/[._-].*$/, '') : ''; };
const SNAP = new URL('../s.html?t=', location.href).href;
const SAMPLE_NOTE = 'Sample: nothing was changed';

const typeName = l => l.type === 'page' ? 'Client page' : l.kind === 'card' ? 'Snapshot of a card' : 'Snapshot of a page';

/** Turn one link off: a confirm, then the one route for its kind. */
function turnOff(l, ctx, done) {
  const err = h('div');
  const go = button('Turn it off', { primary: true, large: true });
  const keep = button('Keep it', { large: true });
  const sh = sheet({ title: 'Turn off "' + (l.title || 'this link') + '"?', side: 'center', body: h('div', { class: 'sl-confirm' },
    h('p', null, 'Anyone with the link sees a "link ended" page. This cannot be undone here: make a new link to share it again.'),
    err, h('div', { class: 'sl-acts' }, go, keep)) });
  keep.addEventListener('click', () => sh.close());
  go.addEventListener('click', async () => {
    go.disabled = keep.disabled = true; put(err);
    try {
      if (ctx.sample) { toast(SAMPLE_NOTE); sh.close(); done(); return; }
      const r = await ctx.api(l.type === 'page' ? '/api/client-page/revoke' : '/api/snapshot/revoke', { method: 'POST', body: { token: l.token } });
      if (r && r.error) throw new Error(r.error);
      sh.close(); toast('Turned off'); done();
    } catch (e) {
      go.disabled = keep.disabled = false;
      go.textContent = 'Try again';
      put(err, h('p', { class: 'sl-err' }, 'Not turned off: ' + ((e && e.message) || 'No answer from the server.')));
    }
  });
}

function draw(el, d, ctx) {
  css();
  if (!d || !Array.isArray(d.links)) return put(el, empty({ title: 'Shared links did not answer', text: 'Nothing was read. Try again in a minute.' }));
  const today = d.today || todayYmd();
  const redraw = () => draw(el, d, ctx);
  const links = d.links.map(l => ({ ...l, src: l, color: colorOf(ctx, l.act_id) }));
  if (!links.length) return put(el, empty({ title: 'No shared links', text: 'Links made with "Share a public link" and pages pushed for a client show here.' }));
  const live = links.filter(l => l.live);
  const soon = live.filter(l => l.expires_at && between(today, String(l.expires_at).slice(0, 10)) <= 7);
  const never = live.filter(l => !l.views);
  const week = live.filter(l => l.last_view && between(String(l.last_view).slice(0, 10), today) <= 7);
  const named = (list, none) => list.length === 0 ? none : list.length === 1 ? list[0].title || 'Untitled' : (list[0].title || 'Untitled') + ' and ' + (list.length - 1) + ' more';
  const pickOnly = id => { view.only = view.only === id ? '' : id; view.show = 'live'; redraw(); };

  /* the two tiles that name links filter the list to them (tap again to show every link) */
  const pickable = (id, set) => set.length ? { onclick: () => pickOnly(id), on: view.only === id, title: view.only === id ? 'Show every link again' : 'Show only these links' } : {};
  const head = countTiles([
    { label: 'Live links', value: String(live.length), sub: live.filter(l => l.type === 'page').length + ' client pages, ' + live.filter(l => l.type === 'snap').length + ' snapshots', window: 'Right now', source: 'Shared links' },
    { label: 'Opened in the last 7 days', value: String(week.length), sub: num(week.reduce((t, l) => t + (+l.views || 0), 0)) + ' opens in all', window: 'Last 7 days', source: 'Link opens' },
    { label: 'Stop working this week', value: String(soon.length), sub: soon.length ? named(soon) + ', ends ' + short(String(soon[0].expires_at).slice(0, 10)) : 'none', window: 'Next 7 days', source: 'End dates', ...pickable('soon', soon) },
    { label: 'Never opened', value: String(never.length), sub: named(never, 'every live link was opened'), window: 'Since made', source: 'Link opens', ...pickable('never', never) },
  ], { cols: 4 });
  ctx.askContext = `Shared links: ${live.length} live (${soon.length} end this week, ${never.length} never opened), ${week.length} opened in the last 7 days.`;

  const listBox = h('div'), noteBox = h('span');
  const clear = () => { Object.assign(view, { q: '', type: '', only: '' }); redraw(); };
  const tools = h('div', { class: 'cr-tools' },
    segmented([{ id: 'live', label: 'Live ' + live.length }, { id: 'off', label: 'Ended ' + (links.length - live.length) }, { id: 'all', label: 'All ' + links.length }], view.show, id => { view.show = id; paint(); }),
    searchBox(view.q, v => { view.q = v; paint(); }, 'Search title, brand or maker'),
    selectBox('Type', [{ id: '', label: 'All types' }, { id: 'page', label: 'Client pages' }, { id: 'snap', label: 'Snapshots' }], view.type, v => { view.type = v; paint(); }),
    noteBox);
  const write = canWrite(ctx);

  function paint() {
    const q = view.q.trim().toLowerCase();
    const base = view.show === 'live' ? live : view.show === 'off' ? links.filter(l => !l.live) : links;
    const pick = base.filter(l => {
      if (view.type && l.type !== view.type) return false;
      if (view.only === 'soon' && !soon.includes(l)) return false;
      if (view.only === 'never' && !never.includes(l)) return false;
      if (q && ![l.title, l.brand, who(l.created_by), l.created_by].some(t => String(t || '').toLowerCase().includes(q))) return false;
      return true;
    }).sort((a, b) => String(b.last_view || b.created_at).localeCompare(String(a.last_view || a.created_at)));
    const on = !!(q || view.type || view.only);
    put(noteBox, filterNote(pick.length, base.length, on, clear));
    const rows = pick.map(l => {
      const ends = l.expires_at ? between(today, String(l.expires_at).slice(0, 10)) : null;
      return row({
        title: l.title || 'Untitled',
        sub: [typeName(l) + ', made ' + dayOf(l.created_at) + (l.created_by ? ' by ' + who(l.created_by) : '')],
        cells: [
          { w: 150, label: 'Brand', node: l.brands && l.brands.length > 1 ? h('span', { class: 'cr-brand' }, l.brands.length + ' brands') : brandTag(l.brand || '', l.color) },
          { w: 84, class: 'hide-sm', label: 'Opened', node: num(l.views || 0) + (l.views === 1 ? ' time' : ' times') },
          { w: 140, label: 'Status', node: !l.live ? statusDot('off', l.revoked ? 'Turned off' : 'Ended ' + dayOf(l.expires_at))
            : ends == null ? statusDot('good', 'Live, no end date') : statusDot(ends <= 7 ? 'warn' : 'good', 'Live to ' + short(String(l.expires_at).slice(0, 10))) },
        ],
        action: l.live ? [button('Open', { href: l.url, target: '_blank', icon: 'arrow' }), copyBtn(l.url),
          write ? button('Turn off', { ghost: true, onclick: e => { e.stopPropagation(); turnOff(l, ctx, () => { l.src.live = false; l.src.revoked = true; redraw(); }); } }) : null]
          : goNote('Link ended'),
      });
    });
    put(listBox, list(rows, on ? h('span', null, 'Nothing matches. ', h('button', { type: 'button', class: 'cr-clear', onclick: clear }, 'Clear the filters.')) : 'Nothing here.',
      { head: [{ label: 'Brand', w: 150 }, { label: 'Opened', w: 84, class: 'hide-sm' }, { label: 'Status', w: 140 }], first: 'Link', go: write ? 300 : 210 }));
  }
  paint();
  put(el, adm(helpBar([
    { title: 'What a shared link is', text: 'A public page anyone with the link can open without signing in. Every one made from an Export menu or pushed for a client is listed here, with who made it and how often it was opened.' },
    { title: 'Snapshots and client pages', text: 'A snapshot is a frozen copy of one page or card from the day it was made; its numbers never update. A client page is a one-off page built for a client, like a plan or a walk-through.' },
    { title: 'Turning a link off', text: 'Turn off ends a link for everyone at once: anyone who opens it sees a "link ended" page. It cannot be undone here; make a new link to share it again. Only the team can turn links off.' },
  ]), head, h('section', { class: 'cr-sect' }, tools, listBox)));
}

const SL_CSS = `.sl-confirm{display:grid;gap:16px}
.sl-confirm p{margin:0;font-size:14.5px;line-height:1.5;color:var(--ink)}
.sl-acts{display:flex;gap:10px;flex-wrap:wrap}
.sl-err{margin:0;padding:10px 12px;border-radius:10px;background:var(--bad-bg);color:var(--bad);font-size:14px}
`;

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
  render(el, d, ctx) { addStyles('lx-sl-css', SL_CSS); draw(el, d, ctx); },
  skeleton(el) { el.innerHTML = '<div class="lx-skel chart" style="height:150px"></div><div class="lx-skel row"></div><div class="lx-skel row"></div><div class="lx-skel row"></div>'; },
};

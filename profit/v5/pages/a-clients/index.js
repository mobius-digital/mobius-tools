/* Agency > Client list: every brand we run, who at the client can sign in, when they last looked, and what they are
   waiting on. Read only: inviting and removing a client login stay with the owner in old Locus (Settings > Clients).
   Live data (account-health, reads only):
     the brands                 ctx.brands (GET /api/brands, already loaded by the shell)
     GET /api/clients?act=all   client logins: email, name, brands, invited_at, last_sign_in, last_seen
     GET /api/requests?act=all  open requests, counted per brand
     GET /api/onboard/list      new clients still setting up (or finished): one line each, opens their Get started page */

import { APP_NAME } from '../../config.js';
import { put } from '../../kit.js';
import { h, hero, kpis, kpi, statusDot, button, sheet, em, empty, avatar, relativeTime, pill } from '../../kit.js';
import { css, dayOf, between, todayYmd, heading, row, list, brandTag } from '../calendar/_cr.js';

const seenDay = p => String(p.last_seen || p.last_sign_in || '').slice(0, 10);

function people(list, ctx) {
  return h('div', { class: 'cr-thread' }, list.map(p => h('div', { class: 'cr-people', style: { padding: '12px 0', borderTop: '1px solid var(--line)' } },
    avatar(p, { size: 38 }),
    h('span', { class: 'cr-what' }, h('b', null, p.name || p.email), h('span', { class: 'cr-sub' }, [p.email, p.invited_at ? 'invited ' + dayOf(p.invited_at) : null].filter(Boolean).join(', '))),
    h('span', { style: { marginLeft: 'auto', fontSize: '13px', color: 'var(--muted)', whiteSpace: 'nowrap' } }, p.last_seen || p.last_sign_in ? 'seen ' + relativeTime(p.last_seen || p.last_sign_in) : 'never signed in'))));
}

function draw(el, d, ctx) {
  css();
  if (!d || !Array.isArray(d.brands)) return put(el, empty({ title: 'The client list did not answer', text: 'Nothing was read. Try again in a minute.' }));
  const today = d.today || todayYmd();
  const logins = d.clients || [];
  const brands = d.brands.filter(b => b.status !== 'paused' && b.status !== 'archived');
  if (!brands.length) return put(el, empty({ title: 'No clients yet', text: 'Brands appear here once their ad account is connected.' }));
  const of = id => logins.filter(p => (p.brands || []).some(b => (b.id || b) === id));
  const recent = logins.filter(p => seenDay(p) && between(seenDay(p), today) <= 7);
  const never = logins.filter(p => !p.last_sign_in && !p.last_seen);
  const noLogin = brands.filter(b => !of(b.id).length);
  /* new clients from New client: their setup line, a pill, and who it waits on; the row opens Get started */
  const onb = new Map((d.onboard || []).map(o => [o.act, o]));
  const setupHref = o => '#/brand/' + encodeURIComponent(o.slug) + '/get-started/index';
  const setupRow = (o, title) => row({
    title, sub: o.line, late: false,
    cells: [
      { w: 120, class: 'hide-sm', label: 'Setup', node: o.finished_at ? pill('good', 'Finished') : pill('warn', 'Setting up') },
      { w: 130, label: 'Sent', node: o.days == null ? '' : o.days === 0 ? 'today' : o.days + (o.days === 1 ? ' day ago' : ' days ago') },
      { w: 170, node: o.finished_at ? statusDot('good', 'Nothing open') : o.waiting_on === 'us' ? statusDot('warn', 'Waiting on us') : statusDot('off', 'Waiting on client') },
    ],
    onclick: () => { location.hash = setupHref(o); },
  });

  const head = hero({ line: true }, kpis([
    kpi({ label: 'Clients', value: String(brands.length), size: 'lg', sub: d.brands.length > brands.length ? (d.brands.length - brands.length) + ' paused' : 'all active' }),
    kpi({ label: 'Client logins', value: String(logins.length), size: 'lg', sub: noLogin.length ? statusDot('warn', noLogin.length + (noLogin.length === 1 ? ' brand has' : ' brands have') + ' none') : 'every brand has one' }),
    kpi({ label: 'Looked this week', value: String(recent.length), size: 'lg', sub: 'of ' + logins.length + ' people' }),
    kpi({ label: 'Never signed in', value: String(never.length), size: 'lg', sub: never.length ? 'invited, not in yet' : 'everyone is in' }),
  ], { cols: 4 }));

  const rows = brands.map(b => {
    if (onb.has(b.id)) return setupRow(onb.get(b.id), b.name);
    const ps = of(b.id), last = ps.map(seenDay).filter(Boolean).sort().pop(), w = (d.waiting || {})[b.id] || { us: 0, client: 0 };
    return row({
      title: b.name,
      sub: ps.length ? ps.map(p => p.name || p.email).join(', ') : 'No client login yet',
      late: false,
      cells: [
        { w: 120, class: 'hide-sm', label: 'Logins', node: ps.length ? h('span', { class: 'cr-people', style: { gap: '4px' } }, ps.slice(0, 3).map(p => avatar(p, { size: 26 })), ps.length > 3 ? '+' + (ps.length - 3) : '') : '' },
        ps.length ? { w: 130, label: 'Last looked', node: last ? (between(last, today) === 0 ? 'today' : relativeTime(last + 'T12:00:00Z')) : 'never' } : { w: 130, node: '' },
        { w: 170, node: w.us ? statusDot('warn', w.us + ' waiting for us') : w.client ? statusDot('off', w.client + ' waiting for them') : statusDot('good', 'Nothing open') },
      ],
      onclick: () => sheet({ title: b.name, body: h('div', { class: 'cr-sheet' },
        ps.length ? h('div', null, heading('Who can sign in', ps.length), people(ps, ctx)) : h('p', { class: 'cr-none', style: { border: 0 } }, 'Nobody from this client can sign in yet.'),
        h('div', { style: { display: 'flex', gap: '10px', flexWrap: 'wrap' } },
          button('Open the brand', { href: '#/brand/' + encodeURIComponent(b.slug || b.id.replace(/^brand_/, '').replace(/_/g, '-')) + '/home/index', icon: 'arrow' }),
          ctx.legacy ? button('Invite or remove in old ' + APP_NAME, { href: ctx.legacy }) : null)) }),
    });
  });
  /* a client set up a minute ago may not be in the brand list yet */
  const extra = (d.onboard || []).filter(o => !brands.some(b => b.id === o.act)).map(o => setupRow(o, o.name));
  const setting = (d.onboard || []).filter(o => !o.finished_at).length;
  put(el, head,
    h('div', { style: { display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center', margin: '0 0 18px' } },
      button('New client', { primary: true, icon: 'arrow', href: ctx.href('a-clients', 'new') }),
      setting ? h('span', { style: { fontSize: '13px', color: 'var(--muted)' } }, setting + (setting === 1 ? ' client is' : ' clients are') + ' setting up') : null),
    h('section', { class: 'cr-sect' }, heading('Every client', brands.length + extra.length), list([...extra, ...rows])));
}

export default {
  title: ['Who are we working for, ', em('and are they looking?')],
  eyebrow: 'Client list',
  ranges: false,
  async load(ctx) {
    const [c, r, o] = await Promise.all([
      ctx.api('/api/clients?act=all', { worker: 'ah', signal: ctx.signal }),
      ctx.api('/api/requests?act=all', { worker: 'ah', signal: ctx.signal }).catch(() => ({ items: [] })),
      ctx.api('/api/onboard/list', { worker: 'ah', signal: ctx.signal }).catch(() => ({ clients: [] })),
    ]);
    const waiting = {};
    for (const i of r.items || []) {
      const w = waiting[i.act_id] || (waiting[i.act_id] = { us: 0, client: 0 });
      if ((i.kind === 'request' && i.status === 'open') || (i.kind === 'approval' && i.status === 'changes')) w.us++;
      else if ((i.kind === 'approval' || i.kind === 'ask') && i.status === 'open') w.client++;
    }
    return {
      brands: (ctx.brands || []).map(({ id, name, slug, status, color }) => ({ id, name, slug, status, color })),
      clients: (c.clients || []).map(({ email, name, brands, invited_at, last_sign_in, last_seen }) => ({ email, name, brands, invited_at, last_sign_in, last_seen })),
      waiting,
      onboard: (o && o.clients) || [],
    };
  },
  async sample(ctx) {
    const f = await ctx.fixture('index.json');
    return { ...f, brands: (ctx.brands || []).map(({ id, name, slug, status, color }) => ({ id, name, slug, status, color })) };
  },
  render: draw,
  skeleton(el) { el.innerHTML = '<div class="lx-skel chart" style="height:150px"></div><div class="lx-skel row"></div><div class="lx-skel row"></div><div class="lx-skel row"></div>'; },
};

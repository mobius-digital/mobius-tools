/* Agency > Client list: every brand we run, who at the client can sign in, when they last looked, and what they are
   waiting on. Read only: inviting and removing a client login stay with the owner in old Locus (Settings > Clients).
   Live data (account-health, reads only):
     GET /api/brands            every brand with its status (the same read Agency settings > Clients counts from;
                                the shell's ctx.brands keeps active brands only, so it cannot say what is paused)
     GET /api/clients?act=all   client logins: email, name, brands, invited_at, last_sign_in, last_seen
     GET /api/requests?act=all  open requests, counted per brand
     GET /api/onboard/list      new clients still setting up (or finished): one line each, opens their Get started page */

import { APP_NAME } from '../../config.js';
import { put } from '../../kit.js';
import { h, statusDot, button, sheet, em, empty, avatar, relativeTime, pill, addStyles } from '../../kit.js';
import { adm, countTiles } from '../a-settings/_look.js';
import { css, dayOf, between, todayYmd, heading, row, list, brandTag, helpBar } from '../calendar/_cr.js';

const CL_CSS = `.cl-steps{display:flex;gap:6px;flex-wrap:wrap;margin-top:6px}
.cl-step{display:inline-flex;align-items:center;gap:5px;height:22px;padding:0 8px;border-radius:999px;background:var(--bg-sunk);font-size:12px;font-weight:600;color:var(--muted)}
.cl-step::before{content:"";width:6px;height:6px;border-radius:50%;background:var(--faint)}
.cl-step.good{background:var(--good-bg,#E7F4EE);color:var(--good)}
.cl-step.good::before{background:var(--good)}
.cl-title{display:inline-flex;gap:8px;align-items:center;flex-wrap:wrap}
.cl-reqs{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}
.cl-req{display:grid;gap:2px;padding:12px 14px;border-radius:14px;background:var(--bg-sunk)}
.cl-req .l{font-size:12.5px;font-weight:600;color:var(--muted)}
.cl-req .v{font-size:var(--num-m);font-weight:600;font-variant-numeric:tabular-nums}`;

/** The five setup steps of a new client as small chips: done = green, still to do = gray. */
function stepChips(o) {
  if (!o) return null;
  const sp = o.sign_pay || {}, c = o.connect || {}, b = o.brief || {}, a = o.assets || {};
  const chip = (ok, text, title) => h('span', { class: 'cl-step' + (ok ? ' good' : ''), title }, text);
  return h('span', { class: 'cl-steps' },
    chip(!!sp.signed, 'Signed', sp.signed ? 'The agreement is signed' : 'The agreement is not signed yet'),
    chip(!!sp.paid, 'Paid', sp.paid ? 'The first invoice is paid' : 'The first invoice is not paid yet'),
    c.total ? chip(c.done >= c.total, 'Connected ' + (c.done || 0) + '/' + c.total, 'Accounts connected, of the ones asked for') : null,
    b.total ? chip(b.answered >= b.total, 'Brief ' + (b.answered || 0) + '/' + b.total, 'Brief questions answered') : null,
    chip(!!a.linked, 'Assets', a.linked ? 'Their photos and files are linked' : 'Their photos and files are not linked yet'));
}

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
  /* new clients from New client: a setup tag after the name and the five steps as chips; the row opens Get started */
  const onb = new Map((d.onboard || []).map(o => [o.act, o]));
  const setupHref = o => '#/brand/' + encodeURIComponent(o.slug) + '/get-started/index';

  const paused = d.brands.filter(b => b.status === 'paused').length;
  const settingUp = brands.filter(b => { const o = onb.get(b.id); return o && !o.finished_at; }).length;
  const subBits = [settingUp ? settingUp + ' of them still setting up' : null, paused ? paused + ' paused, not in this list' : null].filter(Boolean);
  const head = countTiles([
    { label: 'Clients running', value: String(brands.length), sub: subBits.length ? subBits.join(', ') : 'none paused or setting up', window: 'Right now', source: 'Brand list' },
    { label: 'Client logins', value: String(logins.length), sub: noLogin.length ? statusDot('warn', noLogin.length + (noLogin.length === 1 ? ' brand has' : ' brands have') + ' none') : 'every brand has one', window: 'Right now', source: 'Client logins' },
    { label: 'Looked this week', value: String(recent.length), sub: 'of ' + logins.length + ' people', window: 'Last 7 days', source: 'Sign ins' },
    { label: 'Never signed in', value: String(never.length), sub: never.length ? 'invited, not in yet' : 'everyone is in', window: 'Since invited', source: 'Sign ins' },
  ], { cols: 4 });
  ctx.askContext = `Client list: ${brands.length} clients, ${logins.length} client logins, ${recent.length} looked in the last 7 days, ${never.length} never signed in, ${noLogin.length} brands with no login.`;

  /* one row shape for every client: Logins | Last looked | Open requests. A client still setting up carries a tag
     after its name and its setup steps as chips, and opens its Get started page. */
  const waitOf = id => (d.waiting || {})[id] || { us: 0, client: 0 };
  const openCell = w => w.us ? statusDot('warn', w.us + ' waiting for us') : w.client ? statusDot('off', w.client + ' waiting for them') : statusDot('good', 'Nothing open');
  const brandRow = (b, o) => {
    const ps = b ? of(b.id) : [], last = ps.map(seenDay).filter(Boolean).sort().pop(), w = waitOf(b ? b.id : o.act);
    const tag = o ? (o.finished_at ? pill('good', 'Setup finished') : pill('warn', 'Setting up')) : null;
    return row({
      title: h('span', { class: 'cl-title' }, b ? b.name : o.name, tag),
      sub: o && !o.finished_at ? [o.contact ? o.contact + (o.days != null ? ', sent ' + (o.days === 0 ? 'today' : o.days + (o.days === 1 ? ' day ago' : ' days ago')) : '') : null, stepChips(o)]
        : ps.length ? ps.map(p => p.name || p.email.split('@')[0]).join(', ') : 'No client login yet',
      late: false,
      cells: [
        { w: 120, class: 'hide-sm', label: 'Logins', node: ps.length ? h('span', { class: 'cr-people', style: { gap: '4px' } }, ps.slice(0, 3).map(p => avatar(p, { size: 26 })), ps.length > 3 ? '+' + (ps.length - 3) : '') : h('span', { style: { color: 'var(--muted)' } }, 'None') },
        { w: 130, label: 'Last looked', node: ps.length ? (last ? (between(last, today) === 0 ? 'today' : relativeTime(last + 'T12:00:00Z')) : 'never') : h('span', { style: { color: 'var(--muted)' } }, 'No login') },
        { w: 170, label: 'Open requests', node: openCell(w) },
      ],
      onclick: o && !o.finished_at ? () => { location.hash = setupHref(o); } : () => openClient(b, o, ps, w),
    });
  };
  const openClient = (b, o, ps, w) => sheet({ title: b.name, body: h('div', { class: 'cr-sheet' },
    o ? h('div', null, heading('Setup', null, o.finished_at ? 'finished' : 'still going'), stepChips(o)) : null,
    h('div', null, heading('Open requests'), h('div', { class: 'cl-reqs' },
      h('div', { class: 'cl-req' }, h('span', { class: 'l' }, 'Waiting for us'), h('span', { class: 'v' }, String(w.us))),
      h('div', { class: 'cl-req' }, h('span', { class: 'l' }, 'Waiting for them'), h('span', { class: 'v' }, String(w.client))))),
    ps.length ? h('div', null, heading('Who can sign in', ps.length), people(ps, ctx)) : h('p', { class: 'cr-none', style: { border: 0 } }, 'Nobody from this client can sign in yet.'),
    h('div', { style: { display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center' } },
      button('Open the brand', { href: '#/brand/' + encodeURIComponent(b.slug || b.id.replace(/^brand_/, '').replace(/_/g, '-')) + '/home/index', icon: 'arrow' }),
      button('Requests', { href: '#/brand/' + encodeURIComponent(b.slug || b.id.replace(/^brand_/, '').replace(/_/g, '-')) + '/requests/index' }),
      ctx.legacy ? h('a', { href: ctx.legacy, style: { fontSize: '13px', color: 'var(--muted)' } }, 'Invite or remove a login (opens old ' + APP_NAME + ')') : null)) });
  /* what needs us first: still setting up, then the most requests waiting for us, then by name */
  const rank = b => { const o = onb.get(b.id); return (o && !o.finished_at ? 1000 : 0) + waitOf(b.id).us * 10 + waitOf(b.id).client; };
  const rows = [...brands].sort((a, b) => rank(b) - rank(a) || String(a.name).localeCompare(String(b.name))).map(b => brandRow(b, onb.get(b.id) || null));
  /* a client set up a minute ago may not be in the brand list yet */
  const extra = (d.onboard || []).filter(o => !brands.some(b => b.id === o.act)).map(o => brandRow(null, o));
  const setting = (d.onboard || []).filter(o => !o.finished_at).length;
  addStyles('lx-cl-css', CL_CSS);
  put(el, adm(helpBar([
    { title: 'What it is for', text: 'Every brand we run, who at the client can sign in, when they last looked, and what is open between us.' },
    { title: 'Setting up', text: 'A client added with New client shows its five setup steps until they are done: agreement signed, first invoice paid, accounts connected, brief answered and assets linked. Green is done. Its row opens the client\'s Get started page.' },
    { title: 'Open requests', text: 'Waiting for us: a request from the client, or ads they sent back with changes. Waiting for them: ads or questions we sent that they have not answered.' },
  ]), head,
    h('div', { style: { display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center' } },
      button('New client', { primary: true, icon: 'arrow', href: ctx.href('a-clients', 'new') }),
      setting ? h('span', { style: { fontSize: '13px', color: 'var(--muted)' } }, setting + (setting === 1 ? ' client is' : ' clients are') + ' setting up') : null),
    h('section', { class: 'cr-sect' }, heading('Every client', brands.length + extra.length, 'setting up and waiting on us first'),
      list([...extra, ...rows], null, { head: [{ label: 'Logins', w: 120, class: 'hide-sm' }, { label: 'Last looked', w: 130 }, { label: 'Open requests', w: 170 }], first: 'Client' }))));
}

/** Every brand with its status from GET /api/brands (paused ones too); the shell's list fills names and colors, and
    stands in when the read did not answer. */
function brandList(ctx, all) {
  const known = new Map((ctx.brands || []).map(b => [b.id, b]));
  const src = Array.isArray(all) && all.length ? all : ctx.brands || [];
  return src.map(b => { const k = known.get(b.id) || {}; return { id: b.id, name: b.name || k.name, slug: b.slug || k.slug, status: b.status || 'active', color: b.color || k.color || null }; });
}

export default {
  title: ['Who are we working for, ', em('and are they looking?')],
  eyebrow: 'Client list',
  ranges: false,
  async load(ctx) {
    const soft = p => p.catch(e => { if (e && e.name === 'AbortError') throw e; return null; });
    const [bj, c, r, o] = await Promise.all([
      soft(ctx.api('/api/brands', { worker: 'ah', signal: ctx.signal })),
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
      brands: brandList(ctx, bj && bj.brands),
      clients: (c.clients || []).map(({ email, name, brands, invited_at, last_sign_in, last_seen }) => ({ email, name, brands, invited_at, last_sign_in, last_seen })),
      waiting,
      onboard: (o && o.clients) || [],
    };
  },
  async sample(ctx) {
    const f = await ctx.fixture('index.json');
    /* the sample brand list with the statuses Agency settings > Clients shows, so both pages count the same */
    const st = f.status || {};
    return { ...f, brands: brandList(ctx, (ctx.brands || []).map(b => ({ ...b, status: st[b.id] || b.status }))) };
  },
  render: draw,
  skeleton(el) { el.innerHTML = '<div class="lx-skel chart" style="height:150px"></div><div class="lx-skel row"></div><div class="lx-skel row"></div><div class="lx-skel row"></div>'; },
};

/* Requests: one list of everything between the team and the client. Approvals we sent, things we asked them for,
   and things they asked us for, with the thread under each one. Read only here: replying, approving and marking
   done stay in old Locus (ctx.legacy) until this page gets its buttons.
   Live data: GET /api/requests?act=<brand id | all> (account-health). A client can read it for their own brand. */

import { APP_NAME } from '../../config.js';
import { put } from '../../kit.js';
import { h, hero, kpis, kpi, statusDot, button, segmented, sheet, em, empty } from '../../kit.js';
import { fixture } from '../../data.js';
import { css, short, dayOf, away, between, todayYmd, heading, row, list, brandTag, colorOf } from '../calendar/_cr.js';

const KIND = { approval: 'For approval', ask: 'We asked', request: 'They asked' };
const WHAT = { studio: 'Ads', link: 'Link or file', offer: 'Offer', date: 'Calendar date' };
const view = { filter: 'open' };

/** Who the item waits on, from the team's side or the client's. */
function waitsOn(it) {
  if (it.status === 'done' || it.status === 'approved') return 'done';
  if (it.kind === 'request' && it.status === 'open') return 'us';
  if (it.kind === 'approval' && it.status === 'changes') return 'us';
  return 'client';
}
function statusOf(it, client) {
  const w = waitsOn(it);
  if (it.status === 'approved') return statusDot('good', 'Approved');
  if (w === 'done') return statusDot('good', 'Done');
  if (it.status === 'changes') return statusDot('bad', 'Changes asked');
  if (w === 'us') return statusDot('warn', client ? 'With the team' : 'Waiting for us');
  return statusDot('warn', client ? 'Waiting for you' : 'Waiting for the client');
}
const lastAt = it => (it.thread && it.thread.length ? it.thread[it.thread.length - 1].at : null) || it.updated_at || it.created_at;

function detail(it, ctx, agency) {
  const thread = [{ by: it.by, role: it.by_role, text: it.body, at: it.created_at }, ...(it.thread || [])].filter(m => m.text);
  const body = h('div', { class: 'cr-sheet' },
    h('dl', { class: 'cr-kv' },
      agency ? [h('dt', null, 'Brand'), h('dd', null, it.brand)] : null,
      h('dt', null, 'What'), h('dd', null, [KIND[it.kind] || 'Request', it.what ? ', ' + (WHAT[it.what] || it.what).toLowerCase() : ''].join('')),
      h('dt', null, 'Status'), h('dd', null, statusOf(it, ctx.isClient)),
      h('dt', null, 'Opened'), h('dd', null, dayOf(it.created_at) + ' by ' + (it.by || 'the team')),
      it.decided_at ? [h('dt', null, 'Answered'), h('dd', null, dayOf(it.decided_at) + (it.decided_by ? ' by ' + it.decided_by : ''))] : null,
      it.ads && it.ads.length ? [h('dt', null, 'Ads'), h('dd', null, it.ads.filter(a => a.approved).length + ' of ' + it.ads.length + ' approved')] : null,
      it.date ? [h('dt', null, 'Date'), h('dd', null, it.date.name + ', ' + short(it.date.start) + (it.date.end ? ' to ' + short(it.date.end) : ''))] : null,
      it.link ? [h('dt', null, 'Link'), h('dd', null, h('a', { href: it.link, target: '_blank', rel: 'noopener' }, 'Open it'))] : null),
    it.decision_note ? h('div', { class: 'cr-msg' }, h('small', null, 'What they said'), it.decision_note) : null,
    thread.length ? h('div', null, heading('The thread', thread.length),
      h('div', { class: 'cr-thread' }, thread.map(m => h('div', { class: 'cr-msg' + (m.role === 'team' ? ' team' : '') }, h('small', null, (m.by || '') + (m.at ? ', ' + dayOf(m.at) : '')), m.text)))) : null,
    ctx.legacy ? button(ctx.isClient ? 'Reply or answer in ' + APP_NAME : 'Reply in old ' + APP_NAME, { href: ctx.legacy, icon: 'arrow' }) : null);
  sheet({ title: it.title, body });
}

function draw(el, d, ctx, agency) {
  css();
  if (!d || !Array.isArray(d.items)) return put(el, empty({ title: 'Requests did not answer', text: 'Nothing was read. Try again in a minute.' }));
  const today = todayYmd();
  const items = d.items.map(it => ({ ...it, color: agency ? colorOf(ctx, it.act_id) : null, wait: waitsOn(it) }));
  if (!items.length) {
    return put(el, empty({ title: 'No requests', text: ctx.isClient ? 'Nothing is waiting between you and the team.' : 'Nothing is open with ' + (agency ? 'any client' : 'this client') + ', and nothing closed in the last 60 days.' }));
  }
  const us = items.filter(i => i.wait === 'us'), them = items.filter(i => i.wait === 'client'), done = items.filter(i => i.wait === 'done');
  const oldest = [...us].sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)))[0];

  const head = hero({ line: true }, kpis([
    kpi({ label: ctx.isClient ? 'With the team' : 'Waiting for us', value: String(us.length), size: 'lg',
      sub: us.length ? statusDot(between(String(oldest.created_at).slice(0, 10), today) > 2 ? 'bad' : 'warn', 'oldest opened ' + away(today, String(oldest.created_at).slice(0, 10))) : 'nothing open' }),
    kpi({ label: ctx.isClient ? 'Waiting for you' : 'Waiting for the client', value: String(them.length), size: 'lg', sub: them.filter(i => i.kind === 'approval').length + ' to approve' }),
    kpi({ label: 'Done in the last 60 days', value: String(done.length), size: 'lg', sub: done.filter(i => i.status === 'approved').length + ' approved' }),
  ], { cols: 3 }));

  const box = h('section', { class: 'cr-sect' });
  const paint = () => {
    const pick = view.filter === 'open' ? [...us, ...them] : view.filter === 'done' ? done : items;
    pick.sort((a, b) => (a.wait === b.wait ? 0 : a.wait === 'us' ? -1 : b.wait === 'us' ? 1 : 0) || String(lastAt(b)).localeCompare(String(lastAt(a))));
    const rows = pick.map(it => row({
      title: it.title,
      sub: [KIND[it.kind], it.what ? WHAT[it.what] : null, it.ads && it.ads.length ? it.ads.length + ' ads' : null, (it.thread || []).length ? it.thread.length + (it.thread.length === 1 ? ' reply' : ' replies') : null].filter(Boolean).join('. '),
      cells: [
        agency ? { w: 160, node: brandTag(it.brand, it.color) } : null,
        { w: 120, class: 'hide-sm', label: 'From', node: it.by || '' },
        { w: 96, class: 'hide-md', label: 'Last', node: dayOf(lastAt(it)) },
        { w: 170, node: statusOf(it, ctx.isClient) },
      ],
      onclick: () => detail(it, ctx, agency),
    }));
    put(box, 
      h('div', { class: 'cr-bar-top', style: { paddingBottom: '6px' } },
        segmented([{ id: 'open', label: 'Open ' + (us.length + them.length) }, { id: 'done', label: 'Done ' + done.length }, { id: 'all', label: 'All ' + items.length }], view.filter, id => { view.filter = id; paint(); }),
        h('span', { class: 'sp' }),
        !ctx.isClient && ctx.legacy ? button('Send something for approval in old ' + APP_NAME, { href: ctx.legacy }) : null),
      list(rows, view.filter === 'open' ? 'Nothing open. Everything is answered.' : 'Nothing here.'));
  };
  paint();
  put(el, head, box);
}

/** requestsPage({ agency }) : the page module for pages/requests/index.js and pages/a-requests/index.js */
export function requestsPage({ agency = false } = {}) {
  return {
    title: agency ? ['What is waiting ', em('between us and clients?')] : ['What is waiting ', em('on whom?')],
    eyebrow: 'Requests',
    ranges: false,                /* open items plus the last 60 days, set by the route */
    async load(ctx) {
      const act = agency ? 'all' : encodeURIComponent(ctx.brand.id);
      return ctx.api('/api/requests?act=' + act, { worker: 'ah', signal: ctx.signal });
    },
    async sample(ctx) {
      const all = await fixture('a-requests/_sample/index.json');
      if (agency) return all;
      const id = ctx.brand && ctx.brand.id;
      return { ...all, items: all.items.filter(i => i.act_id === id) };
    },
    render: (el, d, ctx) => draw(el, d, ctx, agency),
    skeleton(el) { el.innerHTML = '<div class="lx-skel chart" style="height:150px"></div><div class="lx-skel row"></div><div class="lx-skel row"></div><div class="lx-skel row"></div><div class="lx-skel row"></div>'; },
  };
}

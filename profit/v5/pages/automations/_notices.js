/* "Needs you" on Home and on Agency > Today: the rows an automation left for this person.
   account-health GET /api/notices (read by bell.js readNotices, which never throws). The team sees its `home` rows:
   open, on the home list, not held for the morning read. A client sees its own open rows.
   A suggested change and a held client message carry their answer buttons (automations/_auto.js noticeActions,
   POST /api/notices/done); anything else has Done.

   The card draws itself after the page: homeNotices(ctx) returns an empty hidden box at once and fills it when the
   read comes back. With automations off, with nothing waiting, or when the read fails, the box stays hidden, so the
   page looks exactly as it did before. Sample mode reads pages/_sample/notices.json and its buttons save nothing. */

import { h, put, card, count, button, addStyles, relativeTime } from '../../kit.js';
import { readNotices, forgetNotices } from '../../bell.js';
import { storedClient } from '../../data.js';

const CSS = `
.au-home[hidden]{display:none}
.au-hrow{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:8px 16px;align-items:center;padding:14px 28px;border-top:1px solid var(--line);min-width:0}
.au-hrow:first-of-type{border-top:0}
.au-hrow .t{min-width:0;display:grid;gap:3px}
.au-hrow .t b{font-weight:600;font-size:14.5px;line-height:1.4;overflow-wrap:anywhere}
.au-hrow .t p{margin:0;font-size:13.5px;line-height:1.5;color:var(--ink-2);white-space:pre-line;overflow-wrap:anywhere}
.au-hrow .t span{font-size:12.5px;color:var(--muted)}
.au-hrow .acts{display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end}
.au-hmore{padding:12px 28px 20px}
@media (max-width:759px){
  .au-hrow{grid-template-columns:minmax(0,1fr);padding:14px 16px}
  .au-hrow .acts{justify-content:flex-start}
  .au-hmore{padding:12px 16px 18px}
}`;
const SHOW = 6;

/** The box for the page. Put it where the list should sit; it is hidden until there is something in it. */
export function homeNotices(ctx) {
  const host = h('div', { class: 'au-home', hidden: true });
  const hide = () => { host.hidden = true; host.replaceChildren(); };
  const fill = async () => {
    try {
      /* the team looking as a client: the client's own rows are not theirs to read */
      if (ctx.isClient && !ctx.sample && !storedClient()) return hide();
      const n = await readNotices();
      if (!n) return hide();
      const now = Date.now();
      let rows = ctx.isClient
        ? (n.bell || []).filter(r => r.state === 'open' && (ctx.sample ? r.client : !(r.held_until && Date.parse(r.held_until) > now)))
        : (n.home || []).filter(r => r.state === 'open');
      if (ctx.brand) rows = rows.filter(r => !r.brand_id || r.brand_id === ctx.brand.id);
      rows = rows.filter(r => r && r.title && !(ctx.isClient && r.kind === 'alert'));
      /* an alert (money at risk or something broken) goes first; the rest keep the server's order */
      rows.sort((a, b) => (a.kind === 'alert' ? 0 : 1) - (b.kind === 'alert' ? 0 : 1));
      if (!rows.length) return hide();
      const m = await import('./_auto.js');
      addStyles('au-home-css', CSS);
      const name = id => ((ctx.brands || []).find(b => b.id === id) || {}).name || '';
      const again = () => { forgetNotices(); fill(); };
      const row = r => h('div', { class: 'au-hrow' },
        h('div', { class: 't' }, h('b', null, r.title), r.body ? h('p', null, r.body) : null,
          h('span', null, [ctx.brand ? '' : name(r.brand_id), ctx.sample ? r.when : relativeTime(Date.parse(r.created_at))].filter(Boolean).join(', '))),
        h('div', { class: 'acts' }, m.noticeActions(r, ctx, again)));
      put(host, card({ title: 'Needs you', note: ctx.isClient ? 'From your team' : 'From your automations', action: count(rows.length), flush: true },
        rows.slice(0, SHOW).map(row),
        rows.length > SHOW ? h('div', { class: 'au-hmore' }, button('See all ' + rows.length, { href: ctx.href('notifications', 'needs-you') })) : null));
      host.hidden = false;
    } catch { hide(); }
  };
  fill();
  return host;
}

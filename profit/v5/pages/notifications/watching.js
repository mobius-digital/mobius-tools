/* Notifications > Watching: things in flight that this person does not need to act on.
   The shared page and the bell's rows come from needs-you.js (see the notes there).

   What this tab adds for the team in real mode:
     GET /api/requests?act=all (account-health, read only): approvals and questions the team sent a client that have no answer yet.
     They sit with the client, so they are watched here, oldest first. When the call fails the group is left out and a line says so;
     it never shows as a zero.
   Nothing here writes. */

import { page, daysWord, DAY } from './needs-you.js';

async function waitingOnClient(ctx) {
  let rq;
  try { rq = await ctx.api('/api/requests?act=all', { worker: 'ah', signal: ctx.signal }); }
  catch (e) { if (e && e.name === 'AbortError') throw e; return { notes: ['What is waiting on a client could not be read just now, so it is left out.'] }; }
  const days = r => { const t = Date.parse(r.created_at); return t ? Math.max(0, Math.round((Date.now() - t) / DAY)) : 0; };
  const rows = ((rq && rq.items) || [])
    .filter(r => (r.kind === 'approval' || r.kind === 'ask') && r.status === 'open')
    .map(r => { const n = days(r); return { text: r.title, brand: r.brand || '', by: r.kind === 'approval' ? 'Approval' : 'Question', when: n ? daysWord(n) : 'today', days: n,
      late: n >= 7, who: r.by ? { name: r.by } : null, group: 'client', detail: r.body || '', btn: { label: 'Open requests', line: 'a-requests', tab: 'index' } }; })
    .sort((a, b) => b.days - a.days);
  return { groups: [{ id: 'client', title: 'Waiting on the client', note: 'Sent, no answer yet. Oldest first' }], rows, read: { client: true } };
}

export default page('watching', { more: waitingOnClient });

/* Notifications > Done today: what got done today, and who did it.
   The shared page and the bell's rows (what this person ticked off) come from needs-you.js (see the notes there).

   What this tab adds for the team in real mode:
     GET /api/activities?act=all&from&to&limit (account-health, read only): the changes people made on the ad accounts today,
     the same list Changes made reads. What the platform did by itself (an ad started delivering, a review passed) is left out.
     When the call fails the group is left out and a line says so; it never shows as a zero.
   Nothing here writes. */

import { page, stamp, clock, ymdLocal, DAY } from './needs-you.js';

/* the changes a person would want to hear about; the rest is the platform's own housekeeping */
const MATTERS = new Set(['budget', 'new_campaign', 'campaign_paused', 'campaign_relaunched', 'bid_strategy', 'targeting', 'new_creative', 'new_adset', 'ad_paused', 'ad_relaunched', 'manual']);
const MACHINES = /^(meta|google|tiktok|amazon|system)$/i;

async function teamChanges(ctx) {
  const today = ymdLocal(), next = ymdLocal(new Date(Date.now() + DAY));
  let r;
  /* through tomorrow in the worker's clock, then kept to this person's own today */
  try { r = await ctx.api(`/api/activities?act=all&from=${today}&to=${next}T23:59:59&limit=2000`, { worker: 'ah', signal: ctx.signal }); }
  catch (e) { if (e && e.name === 'AbortError') throw e; return { notes: ['What the team changed on the ad accounts could not be read just now, so it is left out.'] }; }
  const first = String((ctx.me && ctx.me.name) || '').trim().split(/\s+/)[0].toLowerCase();
  const rows = ((r && r.rows) || [])
    .filter(a => a.confirmed !== -1 && a.actor && !MACHINES.test(String(a.actor).trim()) && (a.manual || MATTERS.has(a.category)))
    .map(a => ({ a, at: stamp(a.event_time) }))
    .filter(x => x.at && ymdLocal(new Date(x.at)) === today)
    .sort((x, y) => y.at - x.at)
    .map(({ a, at }) => {
      const mine = !!first && String(a.actor).toLowerCase().includes(first);
      return { text: a.summary || a.translated || 'A change on the ad account', brand: a.account_name || '', by: mine ? 'You' : a.actor, when: clock(at),
        who: mine ? null : { name: a.actor }, group: mine ? 'you' : 'team', detail: a.reason || a.client_why || '', btn: { label: 'Open changes', line: 'a-platforms', tab: 'changes' } };
    });
  /* no footer line: the group note says what is listed */
  return { groups: [{ id: 'team', title: 'By the team', note: 'Changes on the ad accounts, newest first' }], rows, read: { team: true } };
}

export default page('done', { more: teamChanges });

/* Meetings: the last 60 days with what is waiting and what each one made, and one meeting with its notes. */
// from account-health/worker/src/meetings.js (handleMeetings GET, callRow)
import { fail } from '../platform/errors.js';
import { dayIn } from '../platform/time.js';
import { openGroups, appBaseFrom, mondayOf, ymd } from './actions.js';

const CENTRAL = 'America/Chicago';
const OLD_LIST = '/api/meetings';

/* The old reader: text that is not there gives the fallback, text that is not JSON gives the fallback. */
function parse(text, fallback) {
  if (text == null) return fallback;
  try {
    return JSON.parse(text);
  } catch {
    return fallback;   // a broken stored value reads as the fallback, as the old route did
  }
}

const countKind = (notes, kind) => (notes.brands || []).reduce((n, b) => n + (b.items || []).filter(i => i.kind === kind).length, 0);
const good = list => (list || []).filter(t => !t.error).length;

/* One meeting as the list shows it. The heavy JSON stays out. `people` is who was on it from outside
   the team: that needs the team's own list, which the old side holds, so it is borrowed. */
function callRow(m, people) {
  const notes = parse(m.notes_json, null), res = parse(m.result_json, null);
  const counts = notes ? { team: countKind(notes, 'team'), brief: countKind(notes, 'brief'), client_owes: countKind(notes, 'client_owes'),
    client: countKind(notes, 'client') + (notes.brands || []).reduce((n, b) => n + (b.this_week || []).length, 0) } : null;
  const all = res ? [...(res.brands || []), ...(res.agency ? [res.agency] : [])] : [];
  const made = res ? { tasks: all.reduce((n, b) => n + good(b.tasks), 0), briefs: all.reduce((n, b) => n + good(b.briefs), 0),
    asks: all.reduce((n, b) => n + good(b.asks), 0), report: all.filter(b => b.report).length } : null;
  const { attendees_json, notes_json, result_json, ...rest } = m;
  const brand_ids = [...new Set(((notes && notes.brands) || []).map(b => b.brand_id).filter(Boolean))];
  return { ...rest, with: people, brand_ids, counts, made };
}

async function oneMeeting(ctx, id) {
  const m = await ctx.db.one('reports.meetingOne', { id });
  if (!m) fail(404, 'not found');
  const { attendees_json, notes_json, result_json, ...rest } = m;
  return { ...rest, attendees: parse(attendees_json, []), notes: parse(notes_json, null), result: parse(result_json, null) };
}

/** GET /api/meetings. With `id`: one meeting and its notes. Without: the list, the open tasks per brand
 *  (`open=0` leaves them out), today, this week's Monday and the brands. Team only. */
export async function meetings(ctx, input) {
  if (input.query.id) return oneMeeting(ctx, input.query.id);
  const rows = await ctx.db.all('reports.meetingList', { since: ymd(ctx.now.getTime() - 60 * 864e5) });
  /* Borrowed from the old answer: is the note taker connected (a key), its webhook address (the old
     worker's own address), who was on each meeting from outside the team, and the screens' address. */
  const old = (await ctx.legacy.get('ah', OLD_LIST, { cache_s: 120 })) || {};
  const people = new Map((Array.isArray(old.meetings) ? old.meetings : []).map(m => [m && m.id, Array.isArray(m && m.with) ? m.with : []]));
  const brands = await ctx.brands.list({ active: true });
  const open = input.query.open === '0' ? [] : await openGroups(ctx, brands, appBaseFrom(old));
  const today = dayIn(CENTRAL, ctx.now);
  return { meetings: rows.map(m => callRow(m, people.get(m.id) || [])), open, today, monday: mondayOf(today),
    brands: brands.map(b => ({ act_id: b.act_id, name: b.name })), webhook: old.webhook ?? null,
    connected: old.connected === true, since: await ctx.settings.get('meetingsSince', null) };
}

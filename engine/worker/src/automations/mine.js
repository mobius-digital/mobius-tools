/* A person's own side of automations: the bell and home list, and how things reach them.
   Every row here is the caller's own. A client reads only the plain line, for its own brands. */
// from account-health/worker/src/automations.js (handleAutomations: /api/notices, /api/me/delivery)
import { fail } from '../platform/errors.js';
import { lower, isPlainObject } from '../platform/text.js';
import { ORG, MODES, TRIGGERS, DAY_NAME, int, okTz } from './words.js';
import { sentence } from './sentence.js';
import { namesOf, rowToAuto, noticeView, clientNoticeView, cleanWays, deliveryFrom, choiceOf } from './views.js';
import { meOf, tablesReady } from './people.js';

const NO_TABLES = 'the automations tables are made by the old worker on first use';
const LIVE = ['open', 'done'];
const MAX_PER = 30;      // one request may run 40 statements. A longer list is the old worker's
/* The old worker has the chat app wired in and no mail sender yet, so these two lines never change there. */
const EMAIL_WAITS = 'Your choice is saved. Email starts when the mail address for this product is set up. Until then it waits in the bell.';

/** GET /api/notices: the home list and the bell. A person's own rows only. */
export async function listNotices(ctx) {
  const me = meOf(ctx);
  if (!(await tablesReady(ctx, me))) return ctx.forward(NO_TABLES);
  const results = await ctx.db.all('automations.noticesMine', { email: me.email });
  const now = ctx.now.toISOString();
  const rows = results.filter(r => LIVE.includes(r.state))
    .filter(r => !me.only || !r.brand_id || me.only.has(r.brand_id))
    .filter(r => !me.client || (r.kind === 'tell' && r.brand_id && me.only.has(r.brand_id)))
    .map(me.client ? clientNoticeView : noticeView);
  const open = rows.filter(r => r.state === 'open');
  return { email: me.email, home: open.filter(r => r.home && (!r.held_until || r.held_until <= now)), bell: rows,
    morning: open.filter(r => r.held_until && r.held_until > now),
    counts: { open: open.length, taps: open.filter(r => r.kind === 'proposal' || r.kind === 'release').length } };
}

/* The automations this person may set a choice for. A client lists only the ones that tell it. */
async function myAutos(ctx, me) {
  const tellsMe = a => ((a.tell && a.tell.who) || []).some(p => p.kind === 'clients' || (p.kind === 'person' && p.email === me.email));
  const rows = (await ctx.db.all('automations.autosLive', { email: me.email })).map(rowToAuto);
  return rows.filter(a => (me.client ? tellsMe(a) && (a.brand === 'all' || me.only.has(a.brand)) : me.sees(a.brand) || a.owner === me.email));
}

async function deliveryAnswer(ctx, me, autos) {
  const base = deliveryFrom(await ctx.db.one('automations.deliveryMine', { email: me.email }));
  const subs = new Map((await ctx.db.all('automations.subsMine', { email: me.email })).map(s => [s.automation_id, s]));
  const names = me.client ? {} : namesOf(await ctx.db.all('automations.allBrands'));
  const per = autos.map(a => {
    const c = choiceOf(base, subs.get(a.id) || null);
    const words = me.client ? { name: 'A message from your team', sentence: `About: ${lower(TRIGGERS[a.when.type] || 'an update')}` }
      : { name: a.name, sentence: sentence(a, { brandName: names[a.brand] }).text };
    return { automation_id: a.id, ...words, mode: c.mode, ways: cleanWays(c.ways, { client: me.client }), at_hour: c.at_hour, own: c.own };
  });
  return { ok: true, email: me.email, delivery: base, per, modes: MODES,
    ways: { home: !me.client, bell: true, slack: !me.client, email: true },
    ways_note: { bell: 'Always on. The bell is the record.', email: EMAIL_WAITS, slack: null } };
}

function mineOrStop(ctx) {
  const me = meOf(ctx);
  if (!me.named) fail(400, 'Sign in as yourself to set how things reach you.');
  return me;
}

/** GET /api/me/delivery: how things reach me, and my choice per automation. */
export async function getDelivery(ctx) {
  const me = mineOrStop(ctx);
  if (!(await tablesReady(ctx, me))) return ctx.forward(NO_TABLES);
  return deliveryAnswer(ctx, me, await myAutos(ctx, me));
}

/* A person's defaults after a save: what they sent laid over what was saved. */
function nextDelivery(b, cur, client) {
  return { tz: b.tz === undefined ? cur.tz : b.tz && okTz(b.tz) ? String(b.tz) : null,
    read_hour: int(b.read_hour, 0, 23, cur.read_hour),
    read_days: Array.isArray(b.read_days) ? b.read_days.filter(x => DAY_NAME[x]) : cur.read_days,
    quiet_from: b.quiet_from === null ? null : int(b.quiet_from, 0, 23, cur.quiet_from),
    quiet_to: b.quiet_to === null ? null : int(b.quiet_to, 0, 23, cur.quiet_to),
    break_quiet: Array.isArray(b.break_quiet) ? b.break_quiet.filter(x => ['tap', 'down'].includes(x)) : cur.break_quiet,
    mode: MODES[b.mode] ? b.mode : cur.mode, ways: b.ways ? cleanWays(b.ways, { client }) : cur.ways };
}

/* The statements one save runs, in the old order: the defaults first, then each automation's choice. */
async function deliveryWrites(ctx, me, autos, body, now) {
  const writes = [];
  const b = isPlainObject(body.delivery) ? body.delivery : null;
  if (b) {
    const next = nextDelivery(b, deliveryFrom(await ctx.db.one('automations.deliveryMine', { email: me.email })), me.client);
    writes.push(['automations.deliverySave', { email: me.email, org: ORG, tz: next.tz, read_hour: next.read_hour,
      read_days: JSON.stringify(next.read_days), quiet_from: next.quiet_from, quiet_to: next.quiet_to,
      break_quiet: JSON.stringify(next.break_quiet), mode: next.mode, ways: JSON.stringify(next.ways), now }]);
  }
  for (const p of Array.isArray(body.per) ? body.per.slice(0, 100) : []) {
    const a = autos.find(x => x.id === (p && p.automation_id));
    if (!a) continue;
    if (p.mode === null) { writes.push(['automations.subDrop', { automation_id: a.id, email: me.email }]); continue; }
    if (!MODES[p.mode]) continue;
    writes.push(['automations.subSave', { automation_id: a.id, email: me.email, mode: p.mode,
      ways: p.ways ? JSON.stringify(cleanWays(p.ways, { client: me.client })) : null,
      at_hour: p.at_hour == null ? null : int(p.at_hour, 0, 23, null), now }]);
  }
  return writes;
}

/** PUT /api/me/delivery: save my own defaults and my own choice per automation. Nobody else's. */
export async function putDelivery(ctx, input) {
  const me = mineOrStop(ctx);
  if (!(await tablesReady(ctx, me))) return ctx.forward(NO_TABLES);
  const body = isPlainObject(input.body) ? input.body : {};
  const autos = await myAutos(ctx, me);
  const writes = await deliveryWrites(ctx, me, autos, body, ctx.now.toISOString());
  if (writes.length > MAX_PER) return ctx.forward('more rows than one engine request may write');
  await ctx.db.batch(writes);
  return deliveryAnswer(ctx, me, autos);
}

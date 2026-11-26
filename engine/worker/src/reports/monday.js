/* The Monday meeting screen. Per brand: last week's report (the stored numbers, nothing worked out here),
   the plan people posted, and the open tasks. Plus the week's theme and the agency's own open tasks.
   The old code asked the database once per brand. Here each kind of row is read once for every brand. */
// from account-health/worker/src/meetings.js (mondayScreen) and morningcard.js (cardKey, loadCard)
import { safeJson } from '../platform/text.js';
import { dayIn } from '../platform/time.js';
import { openGroups, itemsOf, appBaseFrom, mondayOf, ymd } from './actions.js';

const CENTRAL = 'America/Chicago';
const DAY_MS = 864e5;
const CHUNK = 40;                 // a statement takes 100 values at most
const noon = day => Date.parse(`${day}T12:00:00Z`);
const cardKey = (brandId, day) => `morningCard:${brandId}:${day}`;
const pair = (a, b) => `${a}|${b}`;
const chunks = list => Array.from({ length: Math.ceil(list.length / CHUNK) }, (_, i) => list.slice(i * CHUNK, (i + 1) * CHUNK));
const uniq = list => [...new Set(list)];
const sentAt = ts => new Date(+String(ts).split('.')[0] * 1000).toISOString();
const post = (r, where) => ({ by: r.name || r.user || 'someone', text: String(r.text).slice(0, 4000), at: sentAt(r.ts), where });

/* The report as the screen reads it. The numbers are the ones frozen in the report, passed on as they are. */
function reportOf(rep, monday) {
  const data = safeJson(rep.data_json, {}) || {};
  const t = data.totals || {}, f = data.forecast || {}, p = data.previous || {};
  return { period_start: rep.period_start, period_end: rep.period_end, status: rep.status, sent_at: rep.sent_at || null,
    summary: String(rep.summary || '').slice(0, 2500),
    totals: { sales: t.sales ?? null, spend: t.spend ?? null, mer: t.mer ?? null, cm: t.cm ?? null },
    plan: { sales: f.sales ?? null, spend: f.spend ?? null, mer: f.mer ?? null },
    prior: { sales: p.sales ?? null, spend: p.spend ?? null, mer: p.mer ?? null },
    currency: (data.account && data.account.currency) || 'USD', this_week: data.this_week || [],
    need_from_you: data.need_from_you || [], fresh: rep.period_end >= ymd(noon(monday) - 8 * DAY_MS) };
}

/* The Monday a report's plan is posted on: the day after the report's week ends. */
const planDay = (rep, monday) => (rep.period_end ? ymd(noon(rep.period_end) + DAY_MS) : monday);

async function readSettings(ctx, keys) {
  const out = new Map();
  for (const part of chunks(uniq(keys))) {
    for (const r of await ctx.db.all('reports.settingsMany', { keys: part })) out.set(r.key, r.value);
  }
  return out;
}

/* Replies under a list of chat posts, grouped by channel and post. */
async function readThreads(ctx, spots) {
  const out = new Map();
  for (const part of chunks(spots)) {
    const rows = await ctx.db.all('reports.chatThreads', { channels: uniq(part.map(s => s.channel)), threads: uniq(part.map(s => s.ts)) });
    for (const r of rows) {
      const key = pair(r.channel, r.thread_ts);
      if (!out.has(key)) out.set(key, []);
      out.get(key).push(r);
    }
  }
  return out;
}

/* Long posts made in a channel itself on a day, the first six, grouped by channel and day. */
async function readDayPosts(ctx, spots) {
  const out = new Map();
  for (const part of chunks(spots)) {
    const rows = await ctx.db.all('reports.chatDayPosts', { channels: uniq(part.map(s => s.channel)), days: uniq(part.map(s => s.day)) });
    for (const r of rows) {
      const key = pair(r.channel, r.day);
      if (!out.has(key)) out.set(key, []);
      if (out.get(key).length < 6) out.get(key).push(r);
    }
  }
  return out;
}

const NEED_FROM = { client: 'the client', creator: 'a creator', team: 'the team' };
const CHANNEL = { meta: 'Meta', google: 'Google', amazon: 'Amazon', tiktok: 'TikTok', email: 'Email', other: 'Other' };

/* Who a need waits on. The three roles have fixed words. Anything else is a person, named by the row. */
function needFrom(on) {
  const key = String(on || 'team');
  if (NEED_FROM[key]) return NEED_FROM[key];
  return /^[a-z]+$/.test(key) ? key[0].toUpperCase() + key.slice(1) : NEED_FROM.team;
}

/* The week plans people posted for this brand, each as one post by its person. */
function weekPosts(weekplans, brandId) {
  return Object.values(weekplans).filter(w => (w.brands || []).some(x => x.a === brandId)).map(w => {
    const x = w.brands.find(y => y.a === brandId);
    const lines = [`${w.name}'s week plan${w.role ? ` (${w.role})` : ''}`, ...(w.theme ? [`Theme across brands: ${w.theme}`] : []),
      ...String(x.focus || '').split('\n').filter(Boolean).map(f => `Main focus: ${f}`),
      ...(x.batches || []).map((y, i) => `Batch ${i + 1} (${CHANNEL[y.ch] || 'Meta'}): ${y.text}`),
      ...(w.needs || []).filter(n => n.act === brandId || (!n.act && w.brands.length === 1)).map(n => `Need from ${needFrom(n.on)}: ${n.text}`)];
    return { by: w.name, text: lines.join('\n'), at: w.at, where: 'week' };
  });
}

/* The plan for one brand: replies under the Monday card first, then under the report's own post. */
function threadOf(rep, card, threads) {
  for (const [channel, ts] of [[card && card.channel, card && card.ts], [rep.slack_channel, rep.slack_ts]]) {
    if (!channel || !ts) continue;
    const kept = (threads.get(pair(channel, ts)) || []).filter(r => !r.bot && String(r.text || '').trim());
    if (kept.length) return kept.map(r => post(r, 'thread'));
  }
  return [];
}

/** GET /api/meetings/monday. Team only. */
export async function mondayScreen(ctx) {
  const brands = await ctx.brands.list({ active: true });
  const monday = mondayOf(dayIn(CENTRAL, ctx.now));
  const reps = new Map((await ctx.db.all('reports.weeklyLatest', {})).map(r => [r.act_id, r]));
  const withRep = brands.filter(b => reps.has(b.act_id));
  const dayOf = b => planDay(reps.get(b.act_id), monday);
  const settings = await readSettings(ctx, ['mondayTheme', `weekplan:${monday}`, ...withRep.map(b => cardKey(b.act_id, dayOf(b)))]);
  const cards = new Map(withRep.map(b => [b.act_id, safeJson(settings.get(cardKey(b.act_id, dayOf(b))), null)]));
  const spots = withRep.flatMap(b => {
    const rep = reps.get(b.act_id), card = cards.get(b.act_id);
    return [{ channel: card && card.channel, ts: card && card.ts }, { channel: rep.slack_channel, ts: rep.slack_ts }];
  }).filter(s => s.channel && s.ts);
  const threads = await readThreads(ctx, spots);
  const plan = new Map(withRep.map(b => [b.act_id, threadOf(reps.get(b.act_id), cards.get(b.act_id), threads)]));
  /* A plan posted in the channel itself on that Monday (not as a reply) still counts. */
  const quiet = withRep.filter(b => !plan.get(b.act_id).length && b.slack_channel);
  const dayPosts = await readDayPosts(ctx, quiet.map(b => ({ channel: b.slack_channel, day: dayOf(b) })));
  for (const b of quiet) plan.set(b.act_id, (dayPosts.get(pair(b.slack_channel, dayOf(b))) || []).map(r => post(r, 'channel')));
  /* Borrowed: the screens' address inside each task link, read off the old meetings answer. */
  const base = appBaseFrom(await ctx.legacy.get('ah', '/api/meetings', { cache_s: 120 }));
  const open = await openGroups(ctx, brands, base);
  const weekplans = safeJson(settings.get(`weekplan:${monday}`), {}) || {};
  const theme = safeJson(settings.get('mondayTheme'), null);
  const out = brands.map(b => ({ act_id: b.act_id, name: b.name,
    report: reps.has(b.act_id) ? reportOf(reps.get(b.act_id), monday) : null,
    thread: [...weekPosts(weekplans, b.act_id), ...(plan.get(b.act_id) || [])], open: itemsOf(open, b.act_id) }));
  return { monday, theme: theme && theme.date === monday ? theme.text : '', brands: out, agency_open: itemsOf(open, '') };
}

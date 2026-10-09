/**
 * The Slack index: what the Strategist reads so it knows what was said, the way Viktor does (2026-10-09).
 *
 * Viktor keeps no copy of Slack and searches it live every question. A Slack message never changes once it
 * is posted, so a copy written the moment it arrives is as live as Slack and costs nothing to search. Ours:
 *   - LIVE: every message event that reaches this worker (a brand's internal AND client channel, the
 *     Strategist channel) is written to `slack_msg` as it arrives; edits update it, deletes remove it.
 *   - BACKFILL: the hourly tick walks each of those channels backwards (bot token, then Cole's user token
 *     when the bot is not a member) until 365 days are in, and forwards to catch anything the events missed.
 *   - KEPT FOREVER. A year of this workspace is tens of MB. A question only ever pulls a handful of rows.
 *   - DMs are never indexed (the index is read on behalf of the whole team).
 *
 * Reading:
 *   search(env, deps, {q, brand, side, from, after, before})  D1 first; Slack's own search as Cole fills in
 *   readThread(env, deps, {link | channel+ts})                 the thread, LIVE from Slack (edits and new replies)
 *   digest(env, brandId, {days, cap})                          the brand's last two weeks, one line a message
 *
 * The Strategist never SPEAKS in a client channel: indexing it is reading only (worker.js still answers only
 * in a brand's internal channel).
 */

const DAY = 86400;
const KEEP_DAYS = 365;            // how far back the first backfill walks
const PAGES_PER_TICK = 40;        // Slack calls a tick may spend on the backfill
let chanCache = { at: 0, map: new Map() };

export async function ensureSlackIndex(env) {
  await env.DB.batch([
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS slack_msg (
      channel TEXT NOT NULL, ts TEXT NOT NULL, thread_ts TEXT, user TEXT, name TEXT, bot INTEGER NOT NULL DEFAULT 0,
      text TEXT, files TEXT, brand TEXT, side TEXT, day TEXT, PRIMARY KEY (channel, ts))`),
    env.DB.prepare(`CREATE INDEX IF NOT EXISTS slack_msg_brand ON slack_msg (brand, ts)`),
    env.DB.prepare(`CREATE INDEX IF NOT EXISTS slack_msg_thread ON slack_msg (channel, thread_ts)`),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS slack_chan (
      channel TEXT PRIMARY KEY, brand TEXT, side TEXT, name TEXT, oldest_ts TEXT, latest_ts TEXT,
      back_done INTEGER NOT NULL DEFAULT 0, via TEXT, last_run TEXT, last_error TEXT, msgs INTEGER NOT NULL DEFAULT 0)`),
  ]);
}

/* ---------------- which channels are ours ---------------- */

/** channel -> { brand, side } for every channel the index covers. Cached ten minutes per isolate. */
export async function indexedChannels(env, getSetting) {
  if (chanCache.at > Date.now() - 600e3 && chanCache.map.size) return chanCache.map;
  const map = new Map();
  const { results } = await env.DB.prepare(`SELECT id, name, internal_channel, client_channel FROM brands WHERE status IN ('active', 'demo')`).all().catch(() => ({ results: [] }));
  for (const b of results || []) {
    if (b.internal_channel) map.set(b.internal_channel, { brand: b.id, brandName: b.name, side: 'internal' });
    if (b.client_channel && !map.has(b.client_channel)) map.set(b.client_channel, { brand: b.id, brandName: b.name, side: 'client' });
  }
  const team = getSetting ? await getSetting(env, 'strategistChannel').catch(() => null) : null;
  if (team && !map.has(team)) map.set(team, { brand: null, side: 'team' });
  const extra = getSetting ? String((await getSetting(env, 'strategistIndexChannels').catch(() => '')) || '') : '';
  for (const c of extra.split(/[\s,]+/).filter(x => /^[CG][A-Z0-9]{6,}$/.test(x))) if (!map.has(c)) map.set(c, { brand: null, side: 'team' });
  chanCache = { at: Date.now(), map };
  return map;
}
export const forgetChannelCache = () => { chanCache = { at: 0, map: new Map() }; };

/* ---------------- people ---------------- */

let userCache = { at: 0, map: {} };
async function userNames(env, deps) {
  if (userCache.at > Date.now() - 6 * 3600e3 && Object.keys(userCache.map).length) return userCache.map;
  const stored = deps.safeJson(await deps.getSetting(env, 'slackUsers').catch(() => null), null);
  if (stored?.at && Date.parse(stored.at) > Date.now() - 24 * 3600e3 && stored.map) { userCache = { at: Date.now(), map: stored.map }; return stored.map; }
  const map = {};
  let cursor = '';
  for (let i = 0; i < 5; i++) {
    const r = await deps.slackApi(env, 'users.list', { limit: 500, ...(cursor ? { cursor } : {}) });
    if (!r?.ok) break;
    for (const u of r.members || []) map[u.id] = u.profile?.real_name || u.profile?.display_name || u.real_name || u.name;
    cursor = r.response_metadata?.next_cursor || '';
    if (!cursor) break;
  }
  if (Object.keys(map).length) await deps.putSetting(env, 'slackUsers', JSON.stringify({ at: new Date().toISOString(), map })).catch(() => {});
  userCache = { at: Date.now(), map };
  return map;
}

/* ---------------- writing ---------------- */

const tsDay = ts => new Date(Number(String(ts).split('.')[0]) * 1000).toISOString().slice(0, 10);
const fileList = files => (files || []).map(f => ({ name: String(f.name || f.title || '').slice(0, 80), type: String(f.mimetype || f.filetype || '').slice(0, 40), id: f.id })).slice(0, 8);
const plain = s => String(s || '').replace(/<@([A-Z0-9]+)>/g, '@$1').replace(/<#[A-Z0-9]+\|([^>]+)>/g, '#$1').replace(/<([^|>]+)\|([^>]+)>/g, '$2 ($1)').replace(/<(https?:[^>]+)>/g, '$1').trim();

function rowOf(m, chan, info, names) {
  const bot = !!(m.bot_id || m.subtype === 'bot_message');
  const name = bot ? (m.username || m.bot_profile?.name || 'bot') : (names[m.user] || m.user || 'someone');
  let text = plain(m.text);
  /* Block Kit cards (briefs, proposals) carry a short fallback in text; keep the section text too. */
  if (bot && Array.isArray(m.blocks)) {
    const more = m.blocks.map(b => b?.text?.text || (b?.fields || []).map(f => f.text).join(' ') || '').filter(Boolean).join('\n');
    if (more && more.length > text.length) text = plain(more);
  }
  return [chan, m.ts, m.thread_ts || null, m.user || null, name, bot ? 1 : 0, text.slice(0, 8000),
    (m.files || []).length ? JSON.stringify(fileList(m.files)) : null, info?.brand || null, info?.side || null, tsDay(m.ts)];
}
const UPSERT = `INSERT INTO slack_msg (channel, ts, thread_ts, user, name, bot, text, files, brand, side, day)
  VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)
  ON CONFLICT (channel, ts) DO UPDATE SET text = excluded.text, files = excluded.files, thread_ts = excluded.thread_ts, name = excluded.name`;

/** One live event. Called for every event before any routing, so nothing the team says is missed. */
export async function indexEvent(env, deps, ev) {
  if (!ev || ev.type !== 'message' || ev.channel_type === 'im' || ev.channel_type === 'mpim') return false;
  const map = await indexedChannels(env, deps.getSetting);
  const info = map.get(ev.channel);
  if (!info) return false;
  await ensureSlackIndex(env);
  if (ev.subtype === 'message_deleted') {
    await env.DB.prepare(`DELETE FROM slack_msg WHERE channel = ?1 AND ts = ?2`).bind(ev.channel, ev.deleted_ts || ev.previous_message?.ts || '').run();
    return true;
  }
  const m = ev.subtype === 'message_changed' ? ev.message : ev;
  if (!m?.ts) return false;
  if (m.subtype && !/^(file_share|thread_broadcast|bot_message|me_message)$/.test(m.subtype)) return false;
  const names = await userNames(env, deps).catch(() => ({}));
  await env.DB.prepare(UPSERT).bind(...rowOf(m, ev.channel, info, names)).run();
  return true;
}

/* ---------------- backfill ---------------- */

async function slackUser(env, deps, method, params) {
  if (!env.SLACK_USER_TOKEN) return { ok: false, error: 'no_user_token' };
  const body = new URLSearchParams(Object.entries(params || {}).filter(([, v]) => v != null).map(([k, v]) => [k, String(v)])).toString();
  return deps.xfetch(`https://slack.com/api/${method}`, { method: 'POST', headers: { Authorization: `Bearer ${env.SLACK_USER_TOKEN}`, 'Content-Type': 'application/x-www-form-urlencoded' }, body })
    .then(r => r.json()).catch(e => ({ ok: false, error: e.message }));
}
/* Bot first; the bot is not in every client channel, and Cole is. */
async function readAs(env, deps, method, params, via) {
  if (via !== 'user') {
    const r = await deps.slackApi(env, method, params);
    if (r?.ok || !/not_in_channel|channel_not_found|missing_scope|not_allowed/.test(String(r?.error || ''))) return { r, via: 'bot' };
  }
  return { r: await slackUser(env, deps, method, params), via: 'user' };
}

/** The hourly walk. Spends at most PAGES_PER_TICK Slack calls. Returns what it did. */
export async function backfillTick(env, deps) {
  await ensureSlackIndex(env);
  const map = await indexedChannels(env, deps.getSetting);
  const names = await userNames(env, deps).catch(() => ({}));
  const now = Date.now() / 1000;
  const floor = String(now - KEEP_DAYS * DAY);
  let pages = 0; const done = [];
  for (const [channel, info] of map) {
    if (pages >= PAGES_PER_TICK || (deps.canAfford && !deps.canAfford(8))) break;
    let st = await env.DB.prepare(`SELECT * FROM slack_chan WHERE channel = ?1`).bind(channel).first();
    if (!st) {
      await env.DB.prepare(`INSERT INTO slack_chan (channel, brand, side) VALUES (?1, ?2, ?3)`).bind(channel, info.brand, info.side).run();
      st = { channel, back_done: 0 };
    } else if (st.brand !== info.brand || st.side !== info.side) {
      await env.DB.prepare(`UPDATE slack_chan SET brand = ?2, side = ?3 WHERE channel = ?1`).bind(channel, info.brand, info.side).run();
    }
    let via = st.via || null, err = null, added = 0, oldest = st.oldest_ts, latest = st.latest_ts;
    /* Forward: anything newer than what we hold (the events normally cover this). */
    if (latest) {
      const { r, via: v } = await readAs(env, deps, 'conversations.history', { channel, oldest: latest, limit: 200 }, via); pages++; via = v;
      if (r?.ok) { added += await writeMsgs(env, channel, info, names, r.messages || []); latest = maxTs(latest, r.messages); }
      else err = r?.error || 'failed';
    }
    /* Backward: page from the oldest we hold until a year is in. */
    while (!st.back_done && !err && pages < PAGES_PER_TICK) {
      const params = { channel, limit: 200, oldest: floor, ...(oldest ? { latest: oldest } : {}) };
      const { r, via: v } = await readAs(env, deps, 'conversations.history', params, via); pages++; via = v;
      if (!r?.ok) { err = r?.error || 'failed'; break; }
      const msgs = r.messages || [];
      added += await writeMsgs(env, channel, info, names, msgs);
      latest = maxTs(latest, msgs);
      /* Threads with replies: read each (a page each, so they share the budget). */
      for (const m of msgs.filter(x => (x.reply_count || 0) > 0)) {
        if (pages >= PAGES_PER_TICK) break;
        const t = await readAs(env, deps, 'conversations.replies', { channel, ts: m.ts, limit: 200 }, via); pages++;
        if (t.r?.ok) added += await writeMsgs(env, channel, info, names, (t.r.messages || []).filter(x => x.ts !== m.ts));
      }
      if (msgs.length) oldest = msgs.reduce((a, m) => (!a || Number(m.ts) < Number(a) ? m.ts : a), oldest);
      if (!r.has_more || !msgs.length) { st.back_done = 1; break; }
    }
    await env.DB.prepare(`UPDATE slack_chan SET oldest_ts = ?2, latest_ts = ?3, back_done = ?4, via = ?5, last_run = ?6, last_error = ?7, msgs = msgs + ?8 WHERE channel = ?1`)
      .bind(channel, oldest || null, latest || null, st.back_done ? 1 : 0, via, new Date().toISOString(), err, added).run();
    done.push({ channel, side: info.side, brand: info.brand, added, via, error: err });
  }
  return { pages, channels: done };
}
const maxTs = (cur, msgs) => (msgs || []).reduce((a, m) => (!a || Number(m.ts) > Number(a) ? m.ts : a), cur || null);
async function writeMsgs(env, channel, info, names, msgs) {
  const rows = (msgs || []).filter(m => m?.ts && (!m.subtype || /^(file_share|thread_broadcast|bot_message|me_message)$/.test(m.subtype)));
  for (let i = 0; i < rows.length; i += 50)
    await env.DB.batch(rows.slice(i, i + 50).map(m => env.DB.prepare(UPSERT).bind(...rowOf(m, channel, info, names))));
  return rows.length;
}

/* ---------------- reading ---------------- */

const STOP = new Set('the and for with that this what from have has was were are you your our can did does about into they them then than there their which when where who how why just also any all not but its it\'s'.split(' '));
const domainOf = async (env, deps) => (await deps.getSetting(env, 'slackDomain').catch(() => null)) || 'mobiusdigitalhq';
export const permalink = (domain, channel, ts, thread) => `https://${domain}.slack.com/archives/${channel}/p${String(ts).replace('.', '')}${thread && thread !== ts ? `?thread_ts=${thread}&cid=${channel}` : ''}`;
const when = ts => { const d = new Date(Number(String(ts).split('.')[0]) * 1000); return d.toLocaleString('en-US', { timeZone: 'America/Chicago', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }); };
const filesNote = f => { const a = typeof f === 'string' ? (() => { try { return JSON.parse(f); } catch { return []; } })() : f || []; return a.length ? ` [posted: ${a.map(x => `${String(x.type || 'file').split('/')[0]} "${x.name}"`).join(', ')}]` : ''; };

/** Search what the team said. Words must all appear (any order). Newest first. */
export async function search(env, deps, { q = '', brand = null, side = null, from = null, after = null, before = null, limit = 12 } = {}) {
  await ensureSlackIndex(env);
  const words = String(q).toLowerCase().replace(/[^a-z0-9$%@#&.\- ]/g, ' ').split(/\s+/).filter(w => w.length >= 3 && !STOP.has(w)).slice(0, 6);
  const where = [], args = [];
  for (const w of words) { args.push(`%${w}%`); where.push(`lower(text) LIKE ?${args.length}`); }
  if (brand) { args.push(brand); where.push(`brand = ?${args.length}`); }
  if (side) { args.push(side); where.push(`side = ?${args.length}`); }
  if (from) { args.push(`%${String(from).toLowerCase()}%`); where.push(`lower(name) LIKE ?${args.length}`); }
  if (after) { args.push(after); where.push(`day >= ?${args.length}`); }
  if (before) { args.push(before); where.push(`day <= ?${args.length}`); }
  if (!where.length) return { hits: [], note: 'Give some words, a person or a date.' };
  args.push(Math.min(25, limit));
  const { results } = await env.DB.prepare(`SELECT channel, ts, thread_ts, name, bot, text, files, brand, side FROM slack_msg WHERE ${where.join(' AND ')} ORDER BY CAST(ts AS REAL) DESC LIMIT ?${args.length}`).bind(...args).all();
  const domain = await domainOf(env, deps);
  const map = await indexedChannels(env, deps.getSetting);
  const hits = (results || []).map(r => ({ when: when(r.ts), who: r.name, where: `${map.get(r.channel)?.brandName || r.brand || 'team'} ${r.side || ''}`.trim(),
    text: String(r.text || '').slice(0, 500) + filesNote(r.files), link: permalink(domain, r.channel, r.ts, r.thread_ts), thread: !!r.thread_ts && r.thread_ts !== r.ts }));
  /* Thin? Ask Slack itself, as Cole, for anything outside the index (other channels he is in). DMs dropped. */
  let slackHits = [];
  if (hits.length < 3 && env.SLACK_USER_TOKEN && words.length) {
    const r = await slackUser(env, deps, 'search.messages', { query: words.join(' ') + (from ? ` from:${from}` : '') + (after ? ` after:${after}` : '') + (before ? ` before:${before}` : ''), count: 15, sort: 'timestamp' });
    if (r?.ok) slackHits = (r.messages?.matches || []).filter(m => !m.channel?.is_im && !m.channel?.is_mpim)
      .map(m => ({ when: when(m.ts), who: m.username || m.user, where: `#${m.channel?.name || m.channel?.id}`, text: plain(m.text).slice(0, 500), link: m.permalink }))
      .filter(m => !hits.some(h => h.link === m.link)).slice(0, 10);
    else if (r?.error) slackHits = [{ note: `Slack search did not answer: ${r.error}` }];
  }
  return { hits, slack: slackHits, how: 'hits = the index (every brand channel, internal and client, a year back); slack = Slack\'s own search as Cole for anything else. Open a thread with read_thread before quoting it.' };
}

/** A thread, read LIVE from Slack so edits and new replies are there. */
export async function readThread(env, deps, { link = '', channel = '', ts = '' } = {}) {
  const m = String(link).match(/archives\/([A-Z0-9_]+)\/p(\d{10})(\d{6})/);
  if (m) { channel = m[1]; ts = `${m[2]}.${m[3]}`; const t = String(link).match(/thread_ts=(\d+\.\d+)/); if (t) ts = t[1]; }
  if (!channel || !ts) return { error: 'Give a Slack link, or a channel id and a ts.' };
  const map = await indexedChannels(env, deps.getSetting);
  const { r } = await readAs(env, deps, 'conversations.replies', { channel, ts, limit: 200 }, null);
  if (!r?.ok) return { error: `Slack would not open that thread: ${r?.error || 'unknown'}` };
  const names = await userNames(env, deps).catch(() => ({}));
  const info = map.get(channel);
  const lines = []; let used = 0;
  for (const x of r.messages || []) {
    const who = x.bot_id ? (x.username || x.bot_profile?.name || 'bot') : (names[x.user] || x.user || 'someone');
    const line = `[${when(x.ts)} ${who}] ${plain(x.text).slice(0, 2500)}${filesNote(fileList(x.files))}`;
    if (used + line.length > 24000) { lines.push('[... the rest of the thread is longer than this reader keeps ...]'); break; }
    used += line.length; lines.push(line);
  }
  return { where: info ? `${info.brandName || 'team'} ${info.side}` : channel, messages: lines.length, thread: lines.join('\n'),
    note: info?.side === 'client' ? 'This is the CLIENT channel: the client reads it. Never post there; quote it to the team.' : undefined };
}

/** The brand's last two weeks across its internal and client channels: one line a message, capped. */
export async function digest(env, brand, { days = 14, cap = 6000, deps = null } = {}) {
  if (!brand) return '';
  await ensureSlackIndex(env);
  const since = new Date(Date.now() - days * DAY * 1000).toISOString().slice(0, 10);
  const { results } = await env.DB.prepare(`SELECT ts, thread_ts, name, bot, text, files, side FROM slack_msg WHERE brand = ?1 AND day >= ?2 ORDER BY CAST(ts AS REAL) DESC LIMIT 400`).bind(brand, since).all();
  const lines = []; let used = 0;
  for (const r of results || []) {
    if (r.bot && /^(Strategist|Ideas)$/i.test(r.name || '') && String(r.text || '').length < 40) continue;   // "On it..." lines
    const line = `[${when(r.ts)} · ${r.side === 'client' ? 'CLIENT' : 'internal'} · ${r.name}]${r.thread_ts && r.thread_ts !== r.ts ? ' (reply)' : ''} ${String(r.text || '').replace(/\s+/g, ' ').slice(0, 240)}${filesNote(r.files)}`;
    if (used + line.length > cap) break;
    used += line.length; lines.push(line);
  }
  if (!lines.length) return '';
  return lines.reverse().join('\n');
}

/** For the settings screen and diagnostics: how much is in, per channel. */
export async function indexStatus(env) {
  await ensureSlackIndex(env);
  const { results } = await env.DB.prepare(`SELECT c.channel, c.brand, c.side, c.back_done, c.via, c.last_run, c.last_error,
      (SELECT COUNT(*) FROM slack_msg m WHERE m.channel = c.channel) AS msgs,
      (SELECT MIN(day) FROM slack_msg m WHERE m.channel = c.channel) AS since
    FROM slack_chan c ORDER BY c.brand, c.side`).all();
  const total = await env.DB.prepare(`SELECT COUNT(*) AS n FROM slack_msg`).first();
  return { total: total?.n || 0, channels: results || [] };
}

/**
 * Cole's calendar blocks (2026-10-27). Cole's week is fixed blocks, one company and one kind of work each
 * (Lucky · Promote, Mobius · Build...), as repeating events on three calendars of his (Lucky Golf · Blocks,
 * Mobius · Blocks, Routine · Blocks). A task owned by Cole lands in ONE day's block: the first matching block
 * before its due date that has room. Since 2026-11-03 each task is its OWN small event inside that block (30 minutes,
 * stacked from the block's start), so Cole works from his calendar: DELETING a task event marks the task done in
 * Locus (Google push to /gcal/push, plus the hourly tick as a fallback), and a task finished in Slack or Locus has
 * its event removed. Reopened = it gets an event again.
 *
 * Which block a task belongs in is judged by Haiku from the words and the brand (judge-from-context: no word
 * lists). No model = Lucky Build for a Lucky task, Mobius Build otherwise.
 *
 * A placed task that is still open after its block ended moves to the next one (blockRollTick, once a day).
 * Calendar writes go through the Locus service account as Cole (domain-wide delegation, calendar.events scope).
 */
import { googleToken } from './asana-brand.js';
import { ensureActions } from './actions.js';

const OWNER = 'cole@go-mobius-digital.com';
const SCOPE = 'https://www.googleapis.com/auth/calendar.events';
const TZ = 'America/Chicago';
const LOCUS = 'https://locus.go-mobius-digital.com/profit/';
const CAL = {
  lucky: 'c_88bdf16eef8d2a9aa71ef2a8a3d05368c546f278726d10340f70d101caa7a6d2@group.calendar.google.com',
  mobius: 'c_ab09ff1076fa0d3265ddccdae6a6d8ece9ff5899a6045d2e7ecf453afd70e7fd@group.calendar.google.com',
  routine: 'c_2be543060aee3a6fd1ab54d9d2257f27007e9f60f3ce24dd8580fdb67f9bf994@group.calendar.google.com',
};
/* The blocks a task can land in. title = the event title on the calendar, exactly. */
export const BLOCKS = [
  /* 2026-11-03 Lucky = Hormozi's Promote / Build / Deliver. Judge by what the task is FOR: a sale = Promote (even when
     Cole builds the page, email or ad himself), the business later = Build, someone who already paid = Deliver.
     Thursday morning is a second Lucky · Promote (filming). Rows under the old lucky_make key are re-judged. */
  { key: 'lucky_promote', cal: 'lucky', title: 'Lucky · Promote', what: 'Lucky Golf work whose job is getting a sale soon, even when Cole builds it himself: sale and landing pages, campaign emails, ads, offers, giveaway, creators, social posts, and ALL filming or recording' },
  { key: 'lucky_build', cal: 'lucky', title: 'Lucky · Build', what: 'Lucky Golf work that makes the business better for later: the customer flywheel and lifetime value plan, new products (design, samples, launch plans), email flows that run forever, site structure and speed, money and the lender, systems, hiring' },
  { key: 'lucky_deliver', cal: 'lucky', title: 'Lucky · Deliver', what: 'Lucky Golf work for people who already paid: order and shipping problems, returns and refunds, customer emails and DMs, reordering stock, factory follow-ups on orders, warranty claims' },
  { key: 'mobius_review', cal: 'mobius', title: 'Mobius · Ad review', what: 'Mobius Digital: approving or sending back ads and briefs the team made for clients' },
  { key: 'mobius_promote', cal: 'mobius', title: 'Mobius · Promote', what: 'Mobius Digital finding new clients: outreach, leads, proposals, agreements, demos, its own content' },
  { key: 'mobius_build', cal: 'mobius', title: 'Mobius · Build', what: 'Mobius Digital running the agency: Locus, systems, SOPs, training, hiring, and client work for a brand that is not Lucky Golf' },
];
const FALLBACK = { key: 'buffer', cal: 'routine', title: 'Buffer', what: 'catch-up' };
const byKey = k => BLOCKS.find(b => b.key === k) || (k === 'buffer' ? FALLBACK : null);
export const PER_BLOCK = 6;          // a 3 to 5 hour block holds about this many tasks
const HORIZON_DAYS = 21;
const MARK = '<b>This week:</b>';
const NOTE = 'Your tasks show as their own events inside this block. Delete one when it is done.';
const SLOT_MIN = 30;
const PUSH_URL = 'https://mobius-account-health.mobius-digital.workers.dev/gcal/push';
const TASK_CALS = ['lucky', 'mobius', 'routine'];
const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const ymdOk = s => /^\d{4}-\d{2}-\d{2}$/.test(s || '');
const md = s => ymdOk(s) ? new Date(s + 'T12:00:00Z').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' }) : '';
/* Cole's task = owned by Cole, or made by Cole with no owner named ("Lucky: build the BF page by Thursday" in a DM). */
const isCole = r => String(r.owner || '').toLowerCase() === 'cole' || (!r.owner && String(r.created_by || '').toLowerCase() === OWNER);

/* Every outbound call goes through the worker's counted xfetch (CLAUDE.md, the subrequest budget); worker.js sets it. */
let F = (...a) => fetch(...a);
export function setBlockFetch(fn) { if (typeof fn === 'function') F = fn; }

let ensured = false;
async function ensure(env) {
  if (ensured) return;
  await ensureActions(env);
  for (const c of ['block TEXT', 'block_event TEXT', 'block_cal TEXT', 'block_date TEXT', 'block_end TEXT', 'task_event TEXT', 'task_cal TEXT'])
    await env.DB.prepare(`ALTER TABLE p_action ADD COLUMN ${c}`).run().catch(() => {});
  ensured = true;
}

/* ---------- Google Calendar ---------- */
async function gcal(env, path, init = {}) {
  const tok = await googleToken(env, OWNER, SCOPE);
  const r = await F(`https://www.googleapis.com/calendar/v3/${path}`, { ...init, headers: { Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json', ...(init.headers || {}) } });
  if (r.status === 204) return {};
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(`Calendar ${r.status}: ${j.error?.message || 'failed'}`), { status: r.status });
  return j;
}
const evPath = (cal, id) => `calendars/${encodeURIComponent(cal)}/events/${encodeURIComponent(id)}`;
/* Gone already (Cole deleted it) is fine. */
async function dropEvent(env, cal, id) {
  if (!cal || !id) return;
  await gcal(env, evPath(cal, id), { method: 'DELETE' }).catch(e => { if (e.status !== 404 && e.status !== 410) throw e; });
}
/** The day instances of one block from now on, soonest first. */
async function instances(env, b, { until } = {}) {
  const now = new Date();
  const max = until ? new Date(until + 'T23:59:59-06:00') : new Date(now.getTime() + HORIZON_DAYS * 864e5);
  const q = new URLSearchParams({ singleEvents: 'true', orderBy: 'startTime', timeMin: now.toISOString(), timeMax: max.toISOString(), timeZone: TZ, maxResults: '50', q: b.title });
  const j = await gcal(env, `calendars/${encodeURIComponent(CAL[b.cal])}/events?${q}`);
  return (j.items || []).filter(e => e.summary === b.title && e.status !== 'cancelled' && new Date(e.end?.dateTime || 0) > now)
    .map(e => ({ id: e.id, cal: CAL[b.cal], date: String(e.start.dateTime).slice(0, 10), start: e.start.dateTime, end: e.end.dateTime }));
}

/* ---------- which block (Haiku) ---------- */
const SCHEMA = { type: 'object', additionalProperties: false, required: ['block'], properties: { block: { type: 'string', enum: BLOCKS.map(b => b.key) } } };
async function brandName(env, act) {
  if (!act) return '';
  const r = await env.DB.prepare(`SELECT name FROM brands WHERE id = ?1 OR legacy_key = ?1 UNION ALL SELECT b.name FROM brand_alias a JOIN brands b ON b.id = a.brand_id WHERE a.alias = ?1 LIMIT 1`).bind(act).first().catch(() => null);
  return r?.name || act;
}
export async function judgeBlock(env, row) {
  const brand = await brandName(env, row.act_id);
  const lucky = /lucky/i.test(brand) || /lucky/i.test(row.act_id || '');
  const fallback = lucky ? 'lucky_build' : 'mobius_build';
  if (!env.ANTHROPIC_API_KEY) return fallback;
  try {
    const system = `Cole runs two companies: Lucky Golf (his own golf brand) and Mobius Digital (his ad agency; every brand other than Lucky Golf is a Mobius client). His week is fixed blocks. Pick the ONE block this task of his belongs in.
BLOCKS: ${BLOCKS.map(b => `${b.key} = ${b.what}`).join('; ')}.
A task for a client brand is never a Lucky block. A Lucky Golf task is never a Mobius block.
For Lucky, judge by what the task is FOR, never by its verb: "build the Black Friday landing page" or "write the Cyber Monday email" is for a sale (lucky_promote); "set up the post-purchase flow" makes the business better for later (lucky_build); "answer refund emails" serves people who already paid (lucky_deliver).`;
    const user = `Brand: ${brand || 'none'}\nArea: ${row.area || 'none'}\nTask: ${row.text}${row.detail ? `\nDetails: ${String(row.detail).slice(0, 600)}` : ''}`;
    const r = await F('https://api.anthropic.com/v1/messages', {
      method: 'POST', headers: { 'x-api-key': env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({ model: 'claude-haiku-5-5', max_tokens: 60, system, output_config: { format: { type: 'json_schema', schema: SCHEMA } }, messages: [{ role: 'user', content: user }] }),
    });
    const j = await r.json().catch(() => ({}));
    const k = JSON.parse((j.content || []).filter(c => c.type === 'text').map(c => c.text).join('') || '{}').block;
    return byKey(k) ? k : fallback;
  } catch { return fallback; }
}

/* ---------- the task events inside a block ---------- */
/** Lay out one block day: every open task in it gets its own event, 30 minutes each, stacked from the block's start
 *  (the last ones share the final slot when there are more than fit). The block's own notes say how it works. */
export async function layoutBlock(env, cal, eventId) {
  await ensure(env);
  if (!cal || !eventId) return 0;
  const ev = await gcal(env, evPath(cal, eventId));
  const base = String(ev.description || '').split(MARK)[0].split(NOTE)[0].replace(/(<br>\s*)+$/, '');
  const want = `${base}<br><br>${NOTE}`;
  if (ev.description !== want) await gcal(env, evPath(cal, eventId), { method: 'PATCH', body: JSON.stringify({ description: want }) });
  const { results } = await env.DB.prepare(`SELECT * FROM p_action WHERE block_event = ?1 AND status = 'open' ORDER BY CASE WHEN due = '' THEN 1 ELSE 0 END, due, created_at`).bind(eventId).all();
  const rows = results || [];
  const t0 = new Date(ev.start?.dateTime || 0).getTime(), t1 = new Date(ev.end?.dateTime || 0).getTime();
  const slot = SLOT_MIN * 6e4;
  let placed = 0;
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const st = Math.max(t0, Math.min(t0 + i * slot, t1 - slot));
    const body = {
      summary: `☐ ${r.text}`,
      description: `${r.detail ? esc(r.detail) + '<br><br>' : ''}${r.due ? `Due ${md(r.due)}.<br>` : ''}<a href="${LOCUS}?open=actions&item=${encodeURIComponent(r.id)}">Open in Locus</a><br>Delete this event when it is done.`,
      start: { dateTime: new Date(st).toISOString(), timeZone: TZ },
      end: { dateTime: new Date(st + slot).toISOString(), timeZone: TZ },
      transparency: 'transparent', reminders: { useDefault: false },
      extendedProperties: { private: { locusAction: r.id } },
    };
    /* A task that moved calendars (re-judged from Lucky to Mobius) gets a fresh event there. */
    if (r.task_event && r.task_cal !== cal) { await dropEvent(env, r.task_cal, r.task_event).catch(() => {}); r.task_event = null; }
    if (r.task_event) {
      const ok = await gcal(env, evPath(cal, r.task_event), { method: 'PATCH', body: JSON.stringify(body) }).then(j => j.status !== 'cancelled').catch(e => {
        if (e.status === 404 || e.status === 410) return false; throw e; });
      /* Gone means Cole deleted it between syncs: that is "done", not "make it again". */
      if (!ok) { await doneFromCalendar(env, r.id); continue; }
    } else {
      const id = (await gcal(env, `calendars/${encodeURIComponent(cal)}/events`, { method: 'POST', body: JSON.stringify(body) })).id;
      await env.DB.prepare(`UPDATE p_action SET task_event = ?2, task_cal = ?3 WHERE id = ?1`).bind(r.id, id, cal).run();
    }
    placed++;
  }
  return placed;
}

/* Cole deleted the task's event in Google Calendar: the task is done (hooks run, so the morning card strikes it). */
let doneFn = null;
export function setBlockDone(fn) { if (typeof fn === 'function') doneFn = fn; }
async function doneFromCalendar(env, id) {
  await env.DB.prepare(`UPDATE p_action SET task_event = NULL, task_cal = NULL WHERE id = ?1`).bind(id).run();
  if (doneFn) await doneFn(env, id, { by: 'Cole', how: 'calendar' });
}

/** Put one of Cole's open tasks into a block day. Returns {block, date, label, late} or null (not Cole's, done). */
export async function placeTask(env, row, { keep } = {}) {
  await ensure(env);
  if (!row || !isCole(row) || row.status !== 'open' || row.kind === 'client_owes') return null;
  const key = keep && byKey(row.block) ? row.block : await judgeBlock(env, row);
  const b = byKey(key);
  const due = ymdOk(row.due) ? row.due : '';
  const room = async inst => {
    const c = await env.DB.prepare(`SELECT COUNT(*) AS n FROM p_action WHERE block_event = ?1 AND status = 'open' AND id != ?2`).bind(inst.id, row.id).first();
    return (c?.n || 0) < PER_BLOCK;
  };
  let pick = null, use = b, late = false;
  for (const inst of await instances(env, b)) {
    if (due && inst.date > due) break;
    if (await room(inst)) { pick = inst; break; }
  }
  if (!pick && due) {
    /* Nothing of its kind before the due date: the Friday Buffer before it, else the first one of its kind (late). */
    for (const inst of await instances(env, FALLBACK, { until: due })) if (await room(inst)) { pick = inst; use = FALLBACK; break; }
    if (!pick) { pick = (await instances(env, b))[0] || null; late = !!pick; }
  }
  if (!pick) { const all = await instances(env, b); pick = all[all.length - 1] || null; }
  if (!pick) return null;
  const prev = row.block_event && row.block_event !== pick.id ? { cal: row.block_cal, id: row.block_event } : null;
  await env.DB.prepare(`UPDATE p_action SET block = ?2, block_event = ?3, block_cal = ?4, block_date = ?5, block_end = ?6 WHERE id = ?1`)
    .bind(row.id, key, pick.id, pick.cal, pick.date, pick.end).run();
  await layoutBlock(env, pick.cal, pick.id);
  if (prev?.cal) await layoutBlock(env, prev.cal, prev.id).catch(() => {});
  return { block: use.title, date: pick.date, label: `${md(pick.date)}, ${use.title}`, late };
}

/** A row was made or edited (actions.js onActionPlaced). Cole's open task gets its block; one that stopped being his
 *  or was dropped leaves its block. Returns {calendar: {block, date, label, late}} for the answer. */
export async function blockActionPlaced(env, row) {
  await ensure(env);
  const was = row.was || null;
  if (!isCole(row) || row.status !== 'open') {
    if (row.block_event) {
      await dropEvent(env, row.task_cal, row.task_event).catch(() => {});
      await env.DB.prepare(`UPDATE p_action SET block = NULL, block_event = NULL, block_cal = NULL, block_date = NULL, block_end = NULL, task_event = NULL, task_cal = NULL WHERE id = ?1`).bind(row.id).run();
      await layoutBlock(env, row.block_cal, row.block_event).catch(() => {});
    }
    return {};
  }
  /* Only the date moved: same kind of block, a different day. New words or brand: judged again. */
  const keep = !!(was && row.block && was.text === row.text && was.act_id === row.act_id);
  const placed = await placeTask(env, row, { keep });
  return placed ? { calendar: placed } : {};
}

/** Done anywhere: its event leaves the calendar and the block closes up. Reopened: it gets a block and event again. */
export async function blockActionDone(env, row) {
  await ensure(env);
  if (!row) return;
  const cur = await env.DB.prepare(`SELECT * FROM p_action WHERE id = ?1`).bind(row.id).first();
  if (!cur) return;
  if (cur.status === 'open') { await placeTask(env, cur, { keep: !!cur.block }); return; }
  if (cur.task_event) {
    await dropEvent(env, cur.task_cal, cur.task_event);
    await env.DB.prepare(`UPDATE p_action SET task_event = NULL, task_cal = NULL WHERE id = ?1`).bind(cur.id).run();
  }
  if (cur.block_event && cur.block_cal) await layoutBlock(env, cur.block_cal, cur.block_event).catch(() => {});
}

/** Once a day: Cole's open tasks whose block has ended move on; his open tasks with no block get one. */
export async function blockRollTick(env, { limit = 25 } = {}) {
  await ensure(env);
  const nowIso = new Date().toISOString();
  const { results } = await env.DB.prepare(`SELECT * FROM p_action WHERE status = 'open' AND (lower(owner) = 'cole' OR (COALESCE(owner, '') = '' AND lower(created_by) = 'cole@go-mobius-digital.com')) AND kind != 'client_owes' AND (block_event IS NULL OR block_end < ?1) ORDER BY CASE WHEN due = '' THEN 1 ELSE 0 END, due LIMIT ?2`).bind(nowIso, limit).all();
  const out = { moved: 0, placed: 0, errors: 0 };
  for (const r of results || []) {
    try { const p = await placeTask(env, r, { keep: !!r.block }); if (p) r.block_event ? out.moved++ : out.placed++; }
    catch { out.errors++; }
  }
  return out;
}

/* ---------- Cole deletes a task event: Google tells us ---------- */
/** Read what changed on one block calendar since last time (sync token in settings) and mark deleted task events done.
 *  A first run (or an expired token) reads the whole calendar once just to get a token; nothing is marked then. */
export async function syncCalendar(env, cal, deps, again = false) {
  await ensure(env);
  const { getSetting, putSetting } = deps;
  const key = `gcalSync:${cal}`;
  const token = await getSetting(env, key).catch(() => null);
  const first = !token;
  let done = 0, page = null, next = null;
  for (let n = 0; n < 20; n++) {
    const q = new URLSearchParams({ showDeleted: 'true', maxResults: '250' });
    if (token) q.set('syncToken', token);
    if (page) q.set('pageToken', page);
    let j;
    try { j = await gcal(env, `calendars/${encodeURIComponent(cal)}/events?${q}`); }
    catch (e) {
      if (e.status === 410 && token && !again) { await putSetting(env, key, '').catch(() => {}); return syncCalendar(env, cal, deps, true); }
      throw e;
    }
    if (!first) for (const e of j.items || []) {
      if (e.status !== 'cancelled') continue;
      const r = await env.DB.prepare(`SELECT id FROM p_action WHERE task_event = ?1 AND status = 'open'`).bind(e.id).first();
      if (r) { await doneFromCalendar(env, r.id); done++; }
    }
    page = j.nextPageToken || null;
    if (j.nextSyncToken) next = j.nextSyncToken;
    if (!page) break;
  }
  if (next) await putSetting(env, key, next).catch(() => {});
  /* A first read marks nothing, so a task deleted before the token existed is caught here instead. */
  if (first) {
    const { results } = await env.DB.prepare(`SELECT id, task_event FROM p_action WHERE task_cal = ?1 AND task_event IS NOT NULL AND status = 'open'`).bind(cal).all();
    for (const r of results || []) {
      const gone = await gcal(env, evPath(cal, r.task_event)).then(e => e.status === 'cancelled').catch(e => e.status === 404 || e.status === 410);
      if (gone) { await doneFromCalendar(env, r.id); done++; }
    }
  }
  return { cal, done, first };
}

/** Keep a Google push channel open on each block calendar (they last up to 7 days; renewed with 2 days left). */
export async function ensureWatches(env, { getSetting, putSetting }) {
  let token = await getSetting(env, 'gcalPushToken').catch(() => null);
  if (!token) { token = crypto.randomUUID().replace(/-/g, ''); await putSetting(env, 'gcalPushToken', token); }
  const out = [];
  for (const k of TASK_CALS) {
    const cal = CAL[k], key = `gcalWatch:${cal}`;
    let w = {};
    try { w = JSON.parse((await getSetting(env, key).catch(() => null)) || '{}') || {}; } catch {}
    if (w.exp && w.exp - Date.now() > 2 * 864e5) { out.push({ cal: k, kept: true }); continue; }
    const id = `locus-${k}-${crypto.randomUUID().slice(0, 8)}`;
    const j = await gcal(env, `calendars/${encodeURIComponent(cal)}/events/watch`, { method: 'POST',
      body: JSON.stringify({ id, type: 'web_hook', address: PUSH_URL, token, params: { ttl: String(7 * 86400) } }) });
    await putSetting(env, key, JSON.stringify({ id, resource: j.resourceId, exp: Number(j.expiration) || Date.now() + 6 * 864e5 }));
    if (w.id && w.resource) await gcal(env, 'channels/stop', { method: 'POST', body: JSON.stringify({ id: w.id, resourceId: w.resource }) }).catch(() => {});
    out.push({ cal: k, id });
  }
  return out;
}

/** POST /gcal/push from Google: answered at once, the read happens after. Only our own token is accepted. */
export async function handleGcalPush(request, env, ctx, deps) {
  const token = await deps.getSetting(env, 'gcalPushToken').catch(() => null);
  if (!token || request.headers.get('X-Goog-Channel-Token') !== token) return new Response('no', { status: 403 });
  if (request.headers.get('X-Goog-Resource-State') === 'sync') return new Response('ok');
  const chan = request.headers.get('X-Goog-Channel-ID') || '';
  const k = TASK_CALS.find(x => chan.startsWith(`locus-${x}-`));
  if (k) ctx.waitUntil(syncCalendar(env, CAL[k], deps).catch(e => console.log('gcal push:', e.message)));
  return new Response('ok');
}

/** Hourly: the fallback read of every block calendar, and keep the push channels alive. */
export async function blockSyncTick(env, deps) {
  const out = { synced: [] };
  for (const k of TASK_CALS) out.synced.push(await syncCalendar(env, CAL[k], deps).catch(e => ({ cal: k, error: e.message })));
  out.watch = await ensureWatches(env, deps).catch(e => ({ error: e.message }));
  return out;
}

/** One-time: tasks placed the old way (a list in the block notes) get their own events. */
export async function blockMigrate(env) {
  await ensure(env);
  const { results } = await env.DB.prepare(`SELECT DISTINCT block_cal, block_event FROM p_action WHERE block_event IS NOT NULL AND block_end >= ?1`).bind(new Date().toISOString()).all();
  let n = 0;
  for (const b of results || []) n += await layoutBlock(env, b.block_cal, b.block_event).catch(e => { console.log('migrate:', e.message); return 0; });
  return { blocks: (results || []).length, tasks: n };
}

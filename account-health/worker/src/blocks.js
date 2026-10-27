/**
 * Cole's calendar blocks (2026-10-27). Cole's week is fixed blocks, one company and one kind of work each
 * (Lucky · Promote, Mobius · Build...), as repeating events on three calendars of his (Lucky Golf · Blocks,
 * Mobius · Blocks, Routine · Blocks). A task owned by Cole lands in ONE day's block: the first matching block
 * before its due date that has room. That day's event notes are rewritten with its list, so opening the block
 * on his calendar shows what to do in it. Done or reopened = the notes are rewritten again (actions.js hooks).
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
const LOCUS = 'https://tools.go-mobius-digital.com/profit/';
const CAL = {
  lucky: 'c_88bdf16eef8d2a9aa71ef2a8a3d05368c546f278726d10340f70d101caa7a6d2@group.calendar.google.com',
  mobius: 'c_ab09ff1076fa0d3265ddccdae6a6d8ece9ff5899a6045d2e7ecf453afd70e7fd@group.calendar.google.com',
  routine: 'c_2be543060aee3a6fd1ab54d9d2257f27007e9f60f3ce24dd8580fdb67f9bf994@group.calendar.google.com',
};
/* The blocks a task can land in. title = the event title on the calendar, exactly. */
export const BLOCKS = [
  { key: 'lucky_promote', cal: 'lucky', title: 'Lucky · Promote', what: 'Lucky Golf getting people to buy: ad batches, testing, creators, email and texts, giveaway, direct mail, social posts' },
  { key: 'lucky_build', cal: 'lucky', title: 'Lucky · Build', what: 'Lucky Golf making the business better: website and landing pages, products, factory, inventory, money, customer fixes' },
  { key: 'lucky_make', cal: 'lucky', title: 'Lucky · Make', what: 'Lucky Golf shooting and recording: filming ads, course footage, product photos' },
  { key: 'mobius_review', cal: 'mobius', title: 'Mobius · Ad review', what: 'Mobius Digital: approving or sending back ads and briefs the team made for clients' },
  { key: 'mobius_promote', cal: 'mobius', title: 'Mobius · Promote', what: 'Mobius Digital finding new clients: outreach, leads, proposals, agreements, demos, its own content' },
  { key: 'mobius_build', cal: 'mobius', title: 'Mobius · Build', what: 'Mobius Digital running the agency: Locus, systems, SOPs, training, hiring, and client work for a brand that is not Lucky Golf' },
];
const FALLBACK = { key: 'buffer', cal: 'routine', title: 'Buffer', what: 'catch-up' };
const byKey = k => BLOCKS.find(b => b.key === k) || (k === 'buffer' ? FALLBACK : null);
export const PER_BLOCK = 6;          // a 3 to 5 hour block holds about this many tasks
const HORIZON_DAYS = 21;
const MARK = '<b>This week:</b>';
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
  for (const c of ['block TEXT', 'block_event TEXT', 'block_cal TEXT', 'block_date TEXT', 'block_end TEXT'])
    await env.DB.prepare(`ALTER TABLE p_action ADD COLUMN ${c}`).run().catch(() => {});
  ensured = true;
}

/* ---------- Google Calendar ---------- */
async function gcal(env, path, init = {}) {
  const tok = await googleToken(env, OWNER, SCOPE);
  const r = await F(`https://www.googleapis.com/calendar/v3/${path}`, { ...init, headers: { Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json', ...(init.headers || {}) } });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`Calendar ${r.status}: ${j.error?.message || 'failed'}`);
  return j;
}
/** The day instances of one block from now on, soonest first. */
async function instances(env, b, { until } = {}) {
  const now = new Date();
  const max = until ? new Date(until + 'T23:59:59-06:00') : new Date(now.getTime() + HORIZON_DAYS * 864e5);
  const q = new URLSearchParams({ singleEvents: 'true', orderBy: 'startTime', timeMin: now.toISOString(), timeMax: max.toISOString(), timeZone: TZ, maxResults: '50', q: b.title });
  const j = await gcal(env, `calendars/${encodeURIComponent(CAL[b.cal])}/events?${q}`);
  return (j.items || []).filter(e => e.summary === b.title && e.status !== 'cancelled' && new Date(e.end?.dateTime || 0) > now)
    .map(e => ({ id: e.id, cal: CAL[b.cal], date: String(e.start.dateTime).slice(0, 10), end: e.end.dateTime }));
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
A task for a client brand is never a Lucky block. A Lucky Golf task is never a Mobius block.`;
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

/* ---------- the block's notes ---------- */
/** Rewrite one day's block notes: what the block is for (kept as it was), then its tasks. */
export async function redrawBlock(env, cal, eventId) {
  await ensure(env);
  const ev = await gcal(env, `calendars/${encodeURIComponent(cal)}/events/${encodeURIComponent(eventId)}`);
  const base = String(ev.description || '').split(MARK)[0].replace(/(<br>\s*)+$/, '');
  const { results } = await env.DB.prepare(`SELECT id, act_id, text, due, status FROM p_action WHERE block_event = ?1 ORDER BY CASE WHEN status = 'open' THEN 0 ELSE 1 END, CASE WHEN due = '' THEN 1 ELSE 0 END, due, created_at`).bind(eventId).all();
  const rows = results || [];
  const line = r => `${r.status === 'open' ? '☐' : '✓'} <a href="${LOCUS}?open=actions&item=${encodeURIComponent(r.id)}">${esc(r.text)}</a>${r.due && r.status === 'open' ? ` (due ${md(r.due)})` : ''}`;
  const list = rows.length ? rows.map(line).join('<br>') : 'Nothing yet. Tell Locus a task and it lands here.';
  await gcal(env, `calendars/${encodeURIComponent(cal)}/events/${encodeURIComponent(eventId)}`, { method: 'PATCH', body: JSON.stringify({ description: `${base}<br><br>${MARK}<br>${list}` }) });
  return rows.length;
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
  await redrawBlock(env, pick.cal, pick.id);
  if (prev?.cal) await redrawBlock(env, prev.cal, prev.id).catch(() => {});
  return { block: use.title, date: pick.date, label: `${md(pick.date)}, ${use.title}`, late };
}

/** A row was made or edited (actions.js onActionPlaced). Cole's open task gets its block; one that stopped being his
 *  or was dropped leaves its block. Returns {calendar: {block, date, label, late}} for the answer. */
export async function blockActionPlaced(env, row) {
  await ensure(env);
  const was = row.was || null;
  if (!isCole(row) || row.status !== 'open') {
    if (row.block_event) {
      await env.DB.prepare(`UPDATE p_action SET block = NULL, block_event = NULL, block_cal = NULL, block_date = NULL, block_end = NULL WHERE id = ?1`).bind(row.id).run();
      await redrawBlock(env, row.block_cal, row.block_event).catch(() => {});
    }
    return {};
  }
  /* Only the date moved: same kind of block, a different day. New words or brand: judged again. */
  const keep = !!(was && row.block && was.text === row.text && was.act_id === row.act_id);
  const placed = await placeTask(env, row, { keep });
  return placed ? { calendar: placed } : {};
}

/** Done or reopened anywhere: that day's notes follow. */
export async function blockActionDone(env, row) {
  if (!row?.block_event || !row.block_cal) return;
  await redrawBlock(env, row.block_cal, row.block_event);
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

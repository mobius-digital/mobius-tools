/* SCHEDULED QUESTIONS (2026-10-08). "Ask the Strategist this every Monday and post it to Slack."
 *
 * A row = a question, a brand ('all' or an act_id), a cadence (daily | monday | first), an hour in
 * Central and a Slack channel. The account-health hourly cron (`scheduleTick`) runs each due row once
 * per due period through the SAME path as POST /api/ask (engine.answerWeb), with the per-brand access
 * rule of the person who made it (brandsFor(created_by)), and posts the answer to the channel as the
 * Strategist. Charts become one line pointing at Locus. A cost guard caps runs at MAX_PER_DAY a day
 * (scheduled and Run now together, settings `askSchedRuns` = {date, n}) and MAX_PER_TICK an hour.
 *
 * Channels are INTERNAL only: a brand's accounts.slack_channel or the Strategist's own channel
 * (settings strategistChannel). Never a client channel: the answers carry the team's numbers.
 *
 * Routes (admin): GET /api/ask/schedules, PUT /api/ask/schedules (upsert), DELETE /api/ask/schedules?id=,
 * POST /api/ask/schedules/run {id, dry} (dry = build the message and return it, post nothing, keep no
 * run). The Strategist's `schedule_question` action proposes a row and its Apply calls the PUT. */
import { toSlackText } from '../../../ask/engine.js';
import { brandsFor } from './brandguard.js';

export const SCHED_SQL = `CREATE TABLE IF NOT EXISTS p_ask_schedule (
  id           TEXT PRIMARY KEY,
  question     TEXT NOT NULL,
  act          TEXT NOT NULL DEFAULT 'all',
  cadence      TEXT NOT NULL DEFAULT 'monday',
  hour_central INTEGER NOT NULL DEFAULT 8,
  channel      TEXT NOT NULL,
  created_by   TEXT,
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  last_run     TEXT,
  last_status  TEXT
)`;
const CADENCES = new Set(['daily', 'monday', 'first']);
const CADENCE_L = { daily: 'every morning', monday: 'every Monday', first: 'on the 1st of the month' };
export const MAX_PER_DAY = 10;
const MAX_PER_TICK = 3;
const LOCUS = 'https://tools.go-mobius-digital.com/profit/';
const hex = n => Array.from(crypto.getRandomValues(new Uint8Array(n))).map(b => b.toString(16).padStart(2, '0')).join('').slice(0, n);
const hourWord = h => `${h % 12 === 0 ? 12 : h % 12}${h < 12 ? 'am' : 'pm'}`;
export const whenText = r => `${CADENCE_L[r.cadence] || r.cadence} at ${hourWord(+r.hour_central || 0)} Central`;

export async function ensureSched(env) { await env.DB.prepare(SCHED_SQL).run().catch(() => {}); }

/** The channels a schedule may post to: every active brand's internal channel + the Strategist's. */
export async function allowedChannels(env, d) {
  const out = new Map();
  for (const a of await d.listAccounts(env, true)) if (a.slack_channel) out.set(a.slack_channel, `${a.name} internal`);
  const sc = String((await d.getSetting(env, 'strategistChannel')) || '').trim();
  if (/^[CG][A-Z0-9]{6,}$/.test(sc) && !out.has(sc)) out.set(sc, 'Strategist channel');
  return out;
}

/** Today's run count, and a way to add one. Scheduled runs and Run now share the cap. */
async function runsToday(env, d) {
  let s = {}; try { s = JSON.parse((await d.getSetting(env, 'askSchedRuns')) || '{}') || {}; } catch {}
  return s.date === d.centralDate() ? +s.n || 0 : 0;
}
async function countRun(env, d) {
  const n = await runsToday(env, d) + 1;
  await d.putSetting(env, 'askSchedRuns', JSON.stringify({ date: d.centralDate(), n }));
  return n;
}

/** A web answer as Slack text: each chart becomes one line pointing at Locus. */
export function slackAnswer(answer) {
  const s = String(answer || '').replace(/```chart\s*([\s\S]*?)```/g, (m, j) => {
    let t = ''; try { t = JSON.parse(j).title || ''; } catch {}
    return `\n_Chart${t ? `: ${t}` : ''}. Open Locus and ask the same question to see it._\n`;
  });
  return toSlackText(s).replace(/\n{3,}/g, '\n\n');
}

/** Run one schedule: ask, build the message, post it (unless dry), write down what happened. */
export async function runSchedule(env, row, d, { dry = false } = {}) {
  const accts = await d.listAccounts(env, false);
  const brand = row.act === 'all' ? null : accts.find(a => a.act_id === row.act);
  const only = await brandsFor(env, row.created_by).catch(() => null);
  const note = async (status) => { if (!dry) await env.DB.prepare(`UPDATE p_ask_schedule SET last_run = ?2, last_status = ?3 WHERE id = ?1`).bind(row.id, new Date().toISOString(), String(status).slice(0, 300)).run().catch(() => {}); };
  if (row.act !== 'all' && !brand) { await note('error: that brand no longer exists'); return { error: 'That brand no longer exists.' }; }
  if (only && (row.act === 'all' || !only.has(row.act))) { await note('error: the person who set this up no longer has access to that brand'); return { error: 'The person who set this up no longer has access to that brand.' }; }
  const allowed = await allowedChannels(env, d);
  if (!allowed.has(row.channel)) { await note('error: the channel is not an internal channel any more'); return { error: 'That channel is not one of the internal channels any more. Pick another.' }; }
  if (!dry && await runsToday(env, d) >= MAX_PER_DAY) return { error: `That is ${MAX_PER_DAY} scheduled questions today, which is the daily cap. It resets at midnight Central.` };

  let q = `[Scheduled question: answered automatically and posted to the team's Slack channel. Answer it straight from the data. Do not propose changes, save anything or build a report.]${brand ? ` [About ${brand.name} only.]` : ''} ${row.question}`;
  if (only) { const names = accts.filter(x => only.has(x.act_id)).map(x => x.name); q = `[ACCESS RULE: this person may only see ${names.join(', ')}. Read, mention, compare or total no other brand; if asked about one, say they do not have access.] ${q}`; }
  const { engine, h } = d.strategist();
  if (!dry) await countRun(env, d);
  const r = await engine.answerWeb(env, q, [], h(), { screen: { screen: 'Scheduled question (Slack)', brand_selected: brand ? brand.name : 'All clients' } }).catch(e => ({ error: String(e.message || e) }));
  if (r.error) { await note('error: ' + r.error); return { error: r.error }; }
  const text = slackAnswer(r.answer);
  const chunks = []; for (let i = 0; i < text.length && chunks.length < 8; i += 2900) chunks.push(text.slice(i, i + 2900));
  const blocks = [
    { type: 'section', text: { type: 'mrkdwn', text: `*${row.question.slice(0, 280)}*` } },
    ...chunks.map(c => ({ type: 'section', text: { type: 'mrkdwn', text: c } })),
    { type: 'context', elements: [{ type: 'mrkdwn', text: `Asked ${whenText(row)}${brand ? ` about ${brand.name}` : ''}. Change or stop it in Locus: Settings > The Strategist > Scheduled questions.` }] },
    { type: 'actions', elements: [{ type: 'button', text: { type: 'plain_text', text: 'Open in Locus' }, url: brand ? `${LOCUS}?open=overview&act=${encodeURIComponent(brand.act_id)}` : `${LOCUS}?open=overview`, action_id: 'noop_open' }] },
  ];
  const fallback = `${row.question.slice(0, 120)}: ${text.slice(0, 200)}`;
  if (dry) return { ok: true, dry: true, channel: row.channel, channel_name: allowed.get(row.channel), text, blocks, model: r.model, inTok: r.inTok, outTok: r.outTok };
  const res = await d.slackApi(env, 'chat.postMessage', { channel: row.channel, text: fallback, blocks, unfurl_links: false, username: 'Strategist' });
  let posted = res;
  if (res && res.ok === false && /missing_scope|invalid_arg|not_allowed/.test(String(res.error || ''))) posted = await d.slackApi(env, 'chat.postMessage', { channel: row.channel, text: fallback, blocks, unfurl_links: false });
  if (!posted || posted.ok === false) { await note('error: Slack said ' + (posted?.error || 'nothing')); return { error: `Slack: ${posted?.error || 'no answer'}` }; }
  await note('ok');
  return { ok: true, ts: posted.ts, channel: row.channel };
}

/** Is this row due right now, and not already run in this period? */
function isDue(row, d) {
  const today = d.centralDate(), dow = new Date(today + 'T12:00:00Z').getUTCDay(), dom = +today.slice(8, 10);
  const dayOk = row.cadence === 'daily' || (row.cadence === 'monday' && dow === 1) || (row.cadence === 'first' && dom === 1);
  if (!dayOk || d.centralHour() < (+row.hour_central || 0)) return false;
  return !(row.last_run && d.centralDate(new Date(row.last_run)) === today);
}

/** The hourly job. d = { getSetting, putSetting, listAccounts, centralHour, centralDate, slackApi, strategist, subCanAfford } */
export async function scheduleTick(env, d) {
  await ensureSched(env);
  const { results } = await env.DB.prepare(`SELECT * FROM p_ask_schedule ORDER BY hour_central, created_at`).all().catch(() => ({ results: [] }));
  const due = (results || []).filter(r => isDue(r, d));
  const out = { due: due.length, ran: [], errors: [] };
  for (const row of due) {
    if (out.ran.length + out.errors.length >= MAX_PER_TICK) { out.deferred = true; break; }
    if (await runsToday(env, d) >= MAX_PER_DAY) { out.capped = true; break; }
    if (!d.subCanAfford(80)) { out.deferred = true; break; }
    const r = await runSchedule(env, row, d).catch(e => ({ error: e.message }));
    if (r.error) out.errors.push(`${row.id}: ${r.error}`); else out.ran.push(row.id);
  }
  return out;
}

/** The routes. Returns null when the path is not one of these. */
export async function handleSchedules(request, env, path, json, d) {
  if (!path.startsWith('/api/ask/schedules')) return null;
  if (!(await d.isAdmin(request, env))) return json({ error: 'unauthorized' }, 401);
  await ensureSched(env);
  const url = new URL(request.url);
  const email = await d.sessionEmail(env, request).catch(() => null);
  const only = await brandsFor(env, email).catch(() => null);
  const mine = r => !only || (r.act !== 'all' && only.has(r.act));
  if (path === '/api/ask/schedules' && request.method === 'GET') {
    const { results } = await env.DB.prepare(`SELECT * FROM p_ask_schedule ORDER BY created_at DESC`).all();
    const accts = await d.listAccounts(env, false), nm = Object.fromEntries(accts.map(a => [a.act_id, a.name]));
    const ch = await allowedChannels(env, d);
    return json({
      schedules: (results || []).filter(mine).map(r => ({ ...r, brand: r.act === 'all' ? 'All brands' : nm[r.act] || r.act, when: whenText(r), channel_name: ch.get(r.channel) || r.channel })),
      channels: [...ch].map(([id, name]) => ({ id, name })), runs_today: await runsToday(env, d), max_per_day: MAX_PER_DAY,
    });
  }
  const b = request.method === 'GET' || request.method === 'DELETE' ? {} : await request.json().catch(() => ({}));
  if (path === '/api/ask/schedules' && request.method === 'PUT') {
    const question = String(b.question || '').trim().slice(0, 600);
    if (question.length < 8) return json({ error: 'Write the question you want asked.' }, 400);
    const act = !b.act || b.act === 'all' ? 'all' : String(b.act).slice(0, 40);
    if (only && act === 'all') return json({ error: 'You can schedule questions about your own brands only. Pick one.' }, 403);
    if (act !== 'all' && !(await d.listAccounts(env, false)).some(a => a.act_id === act)) return json({ error: 'No brand with that id.' }, 400);
    const cadence = CADENCES.has(b.cadence) ? b.cadence : 'monday';
    const hour = Number.isInteger(+b.hour_central) && +b.hour_central >= 0 && +b.hour_central <= 23 ? +b.hour_central : 8;
    const channel = String(b.channel || '').trim();
    if (!(await allowedChannels(env, d)).has(channel)) return json({ error: 'Pick one of the internal channels. Scheduled answers never go to a client channel.' }, 400);
    let id = /^sq_[0-9a-f]{10}$/.test(String(b.id || '')) ? b.id : null;
    if (id) {
      const have = await env.DB.prepare(`SELECT * FROM p_ask_schedule WHERE id = ?1`).bind(id).first();
      if (!have || !mine(have)) id = null;
    }
    if (id) await env.DB.prepare(`UPDATE p_ask_schedule SET question = ?2, act = ?3, cadence = ?4, hour_central = ?5, channel = ?6 WHERE id = ?1`).bind(id, question, act, cadence, hour, channel).run();
    else {
      id = 'sq_' + hex(10);
      await env.DB.prepare(`INSERT INTO p_ask_schedule (id, question, act, cadence, hour_central, channel, created_by) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)`)
        .bind(id, question, act, cadence, hour, channel, email || 'admin').run();
    }
    const row = await env.DB.prepare(`SELECT * FROM p_ask_schedule WHERE id = ?1`).bind(id).first();
    return json({ ok: true, schedule: { ...row, when: whenText(row) } });
  }
  if (path === '/api/ask/schedules' && request.method === 'DELETE') {
    const id = url.searchParams.get('id') || '';
    const have = await env.DB.prepare(`SELECT * FROM p_ask_schedule WHERE id = ?1`).bind(id).first();
    if (!have) return json({ error: 'No schedule with that id.' }, 404);
    if (!mine(have)) return json({ error: 'You do not have access to that brand.' }, 403);
    await env.DB.prepare(`DELETE FROM p_ask_schedule WHERE id = ?1`).bind(id).run();
    return json({ ok: true });
  }
  if (path === '/api/ask/schedules/run' && request.method === 'POST') {
    const row = await env.DB.prepare(`SELECT * FROM p_ask_schedule WHERE id = ?1`).bind(String(b.id || '')).first();
    if (!row) return json({ error: 'No schedule with that id.' }, 404);
    if (!mine(row)) return json({ error: 'You do not have access to that brand.' }, 403);
    const r = await runSchedule(env, row, d, { dry: !!b.dry });
    return json(r, r.error ? 400 : 200);
  }
  return json({ error: 'not found' }, 404);
}

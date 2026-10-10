/* SCHEDULED QUESTIONS (2026-10-08). "Ask the Strategist this every Monday and post it to Slack."
 *
 * A row = a question, a brand ('all' or a brand id), a cadence (daily | monday | first), an hour in
 * Central and a Slack channel. The account-health hourly cron (`scheduleTick`) runs each due row once
 * per due period through the SAME path as POST /api/ask (engine.answerWeb), with the per-brand access
 * rule of the person who made it (brandsFor(created_by)), and posts the answer to the channel as the
 * Strategist. Charts become one line pointing at Locus. A cost guard caps runs at MAX_PER_DAY a day
 * (scheduled and Run now together, settings `askSchedRuns` = {date, n}) and MAX_PER_TICK an hour.
 *
 * Channels are INTERNAL only: a brand's internal channel (brand_accounts.slack_channel) or the Strategist's own channel
 * (settings strategistChannel). Never a client channel: the answers carry the team's numbers.
 *
 * Routes (admin): GET /api/ask/schedules, PUT /api/ask/schedules (upsert), DELETE /api/ask/schedules?id=,
 * POST /api/ask/schedules/run {id, dry} (dry = build the message and return it, post nothing, keep no
 * run). The Strategist's `schedule_question` action proposes a row and its Apply calls the PUT. */
import { toSlackText, reportText } from '../../../ask/engine.js';
import { checkNow } from './checknow.js';
import { brandsFor } from './brandguard.js';
import { resolveBrandId } from './brands.js';

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
const CADENCES = new Set(['daily', 'weekdays', 'monday', 'first']);
const CADENCE_L = { daily: 'every morning', weekdays: 'every weekday', monday: 'every Monday', first: 'on the 1st of the month' };
/* WHAT A SCHEDULE DOES (2026-10-09, alerts.js has the story). `question` = the original: answer and post.
   `task` = run the Strategist with the instruction; anything it would change is posted as an Apply card for a
   person to approve, never applied. `report` = build a report (make_report) and post it. `check` = the live
   check (checknow.js) posted. `dashboard` = post a saved dashboard (`ref` = its id). The last two read and
   post only and never call a model, so they do not count toward the daily cap. */
export const KINDS = { question: 'Answer a question', task: 'Do a task (changes come as Apply cards)', report: 'Build a report', check: 'Run the live check', dashboard: 'Post a dashboard' };
const MODEL_KINDS = new Set(['question', 'task', 'report']);
export const MAX_PER_DAY = 10;
const MAX_PER_TICK = 3;
const LOCUS = 'https://tools.go-mobius-digital.com/profit/';
const hex = n => Array.from(crypto.getRandomValues(new Uint8Array(n))).map(b => b.toString(16).padStart(2, '0')).join('').slice(0, n);
const hourWord = h => `${h % 12 === 0 ? 12 : h % 12}${h < 12 ? 'am' : 'pm'}`;
export const whenText = r => `${CADENCE_L[r.cadence] || r.cadence} at ${hourWord(+r.hour_central || 0)} Central`;

export async function ensureSched(env) {
  await env.DB.prepare(SCHED_SQL).run().catch(() => {});
  /* 2026-10-09: kind + ref (guarded; a duplicate column is the normal case after the first run). */
  for (const c of [`kind TEXT NOT NULL DEFAULT 'question'`, `ref TEXT`]) await env.DB.prepare(`ALTER TABLE p_ask_schedule ADD COLUMN ${c}`).run().catch(() => {});
}

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
  const rowAct = row.act === 'all' ? 'all' : await resolveBrandId(env, row.act);
  const brand = rowAct === 'all' ? null : accts.find(a => a.act_id === rowAct);
  const only = await brandsFor(env, row.created_by).catch(() => null);
  const note = async (status) => { if (!dry) await env.DB.prepare(`UPDATE p_ask_schedule SET last_run = ?2, last_status = ?3 WHERE id = ?1`).bind(row.id, new Date().toISOString(), String(status).slice(0, 300)).run().catch(() => {}); };
  if (row.act !== 'all' && !brand) { await note('error: that brand no longer exists'); return { error: 'That brand no longer exists.' }; }
  if (only && (rowAct === 'all' || !only.has(rowAct))) { await note('error: the person who set this up no longer has access to that brand'); return { error: 'The person who set this up no longer has access to that brand.' }; }
  const allowed = await allowedChannels(env, d);
  if (!allowed.has(row.channel)) { await note('error: the channel is not an internal channel any more'); return { error: 'That channel is not one of the internal channels any more. Pick another.' }; }
  const kind = KINDS[row.kind] ? row.kind : 'question';
  if (MODEL_KINDS.has(kind) && !dry && await runsToday(env, d) >= MAX_PER_DAY) return { error: `That is ${MAX_PER_DAY} scheduled runs today, which is the daily cap. It resets at midnight Central.` };
  if (kind === 'dashboard' || kind === 'check') return runReader(env, row, d, { dry, brand, rowAct, allowed, note, kind });

  const PREFIX = {
    question: '[Scheduled question: answered automatically and posted to the team\'s Slack channel. Answer it straight from the data. Do not propose changes, save anything or build a report.]',
    task: '[Scheduled task: it runs on its own at its time and your answer is posted to the team\'s internal Slack channel. Do the instruction now, from the data. Where it calls for a change, PROPOSE it with your actions: each proposal is posted under your answer as an Apply card for a person to approve; nothing is ever applied on its own. Say in the answer what you proposed and why. Do not ask questions back: nobody is there to answer.]',
    report: '[Scheduled report: build it now with make_report from the data, then reply with one or two sentences on what it shows. It is posted to the team\'s internal Slack channel. Do not propose changes.]',
  };
  let q = `${PREFIX[kind]}${brand ? ` [About ${brand.name} only.]` : ''} ${row.question}`;
  if (only) { const names = accts.filter(x => only.has(x.act_id)).map(x => x.name); q = `[ACCESS RULE: this person may only see ${names.join(', ')}. Read, mention, compare or total no other brand; if asked about one, say they do not have access.] ${q}`; }
  const { engine, h } = d.strategist();
  if (!dry) await countRun(env, d);
  const r = await engine.answerWeb(env, q, [], h(), { screen: { screen: 'Scheduled question (Slack)', brand_selected: brand ? brand.name : 'All clients' } }).catch(e => ({ error: String(e.message || e) }));
  if (r.error) { await note('error: ' + r.error); return { error: r.error }; }
  const reps = (r.reports || []).map(rep => toSlackText(reportText(rep)));
  const text = slackAnswer([r.answer, ...reps].filter(Boolean).join('\n\n'));
  const proposals = kind === 'task' ? (r.proposals || []).slice(0, 6) : [];
  const chunks = []; for (let i = 0; i < text.length && chunks.length < 8; i += 2900) chunks.push(text.slice(i, i + 2900));
  const blocks = [
    { type: 'section', text: { type: 'mrkdwn', text: `*${row.question.slice(0, 280)}*` } },
    ...chunks.map(c => ({ type: 'section', text: { type: 'mrkdwn', text: c } })),
    { type: 'context', elements: [{ type: 'mrkdwn', text: `${kind === 'task' ? 'Scheduled task, run' : kind === 'report' ? 'Scheduled report, built' : 'Asked'} ${whenText(row)}${brand ? ` about ${brand.name}` : ''}.${proposals.length ? ` ${proposals.length} suggested change${proposals.length > 1 ? 's' : ''} in the thread, each waiting for a person to press Apply.` : ''} Change or stop it in Locus: Reports > Dashboards > Scheduled.` }] },
    { type: 'actions', elements: [{ type: 'button', text: { type: 'plain_text', text: 'Open in Locus' }, url: brand ? `${LOCUS}?open=overview&act=${encodeURIComponent(brand.act_id)}` : `${LOCUS}?open=overview`, action_id: 'noop_open' }] },
  ];
  const fallback = `${row.question.slice(0, 120)}: ${text.slice(0, 200)}`;
  if (dry) return { ok: true, dry: true, channel: row.channel, channel_name: allowed.get(row.channel), text, blocks, proposals: proposals.map(p => p.summary), model: r.model, inTok: r.inTok, outTok: r.outTok };
  const res = await d.slackApi(env, 'chat.postMessage', { channel: row.channel, text: fallback, blocks, unfurl_links: false, username: 'Locus' });
  let posted = res;
  if (res && res.ok === false && /missing_scope|invalid_arg|not_allowed/.test(String(res.error || ''))) posted = await d.slackApi(env, 'chat.postMessage', { channel: row.channel, text: fallback, blocks, unfurl_links: false });
  if (!posted || posted.ok === false) { await note('error: Slack said ' + (posted?.error || 'nothing')); return { error: `Slack: ${posted?.error || 'no answer'}` }; }
  /* A task's suggested changes: one Apply card each in the thread under the answer. Never applied here. */
  let cards = 0;
  for (const p of proposals) {
    const c = await d.slackApi(env, 'chat.postMessage', { channel: row.channel, thread_ts: posted.ts, text: p.summary, blocks: engine.proposalBlocks(p), unfurl_links: false, username: 'Locus' }).catch(() => null);
    if (c?.ok) cards++;
  }
  await note(proposals.length ? `ok, ${cards} Apply card${cards === 1 ? '' : 's'}` : 'ok');
  return { ok: true, ts: posted.ts, channel: row.channel, cards };
}

/** The read-and-post kinds: a live check or a saved dashboard. No model call, no daily cap. */
async function runReader(env, row, d, { dry, brand, rowAct, allowed, note, kind }) {
  if (kind === 'dashboard') {
    const dash = row.ref ? await env.DB.prepare(`SELECT * FROM p_dashboard WHERE id = ?1`).bind(row.ref).first().catch(() => null) : null;
    if (!dash) { await note('error: that dashboard no longer exists'); return { error: 'That dashboard no longer exists.' }; }
    if (dry) return { ok: true, dry: true, channel: row.channel, channel_name: allowed.get(row.channel), text: `Posts the "${dash.name}" dashboard.` };
    if (!d.postDashboard) return { error: 'Dashboard posting is not wired here.' };
    const r = await d.postDashboard(env, { ...dash, channel: row.channel }).catch(e => ({ error: e.message }));
    await note(r.error ? 'error: ' + r.error : 'ok');
    return r.error ? { error: r.error } : { ok: true, channel: row.channel };
  }
  const c = await checkNow(env, d.auto || d, { act: rowAct || 'all' }).catch(e => ({ error: e.message }));
  if (c.error) { await note('error: ' + c.error); return { error: c.error }; }
  const title = brand ? `${brand.name} right now` : 'Right now, every brand';
  const lines = [c.headline];
  for (const b of c.brands || []) {
    const v = b.vs || {};
    const bits = [v.revenue != null ? `revenue ${Math.round(v.revenue * 100)}% of normal by now` : null, v.orders != null ? `orders ${Math.round(v.orders * 100)}%` : null, v.meta_spend != null ? `Meta spend ${Math.round(v.meta_spend * 100)}%` : null].filter(Boolean);
    const bad = (b.signs || []).filter(s => s.level !== 'good');
    lines.push(`• *${b.name}*: ${bits.join(', ') || (b.notes || [])[0] || 'no live numbers'}${bad.length ? `. ${bad.map(s => s.text).join(' ')}` : ''}`);
  }
  const m = c.market || {};
  if ((m.platforms_now || []).length) lines.push(`Platforms not fully up now: ${m.platforms_now.map(p => `${p.platform} (${p.state})`).join(', ')}.`);
  if (m.breezeway?.status) lines.push(`Breezeway's latest day (${m.breezeway.date}): ${m.breezeway.status.toLowerCase()}, a hint not a verdict.`);
  const text = toSlackText(lines.join('\n'));
  const blocks = [
    { type: 'section', text: { type: 'mrkdwn', text: `*${title}*\n${text}`.slice(0, 2900) } },
    { type: 'context', elements: [{ type: 'mrkdwn', text: `Scheduled check, ${whenText(row)}. Today so far against each brand's normal day by this hour (last 28 days). Change or stop it in Locus: Reports > Dashboards > Scheduled.` }] },
    { type: 'actions', elements: [{ type: 'button', text: { type: 'plain_text', text: 'Open in Locus' }, url: `${LOCUS}?open=yesterday${brand ? `&act=${encodeURIComponent(brand.act_id)}` : ''}`, action_id: 'noop_open' }] },
  ];
  if (dry) return { ok: true, dry: true, channel: row.channel, channel_name: allowed.get(row.channel), text, blocks };
  const posted = await d.slackApi(env, 'chat.postMessage', { channel: row.channel, text: title, blocks, unfurl_links: false, username: 'Locus' });
  if (!posted || posted.ok === false) { await note('error: Slack said ' + (posted?.error || 'nothing')); return { error: `Slack: ${posted?.error || 'no answer'}` }; }
  await note('ok');
  return { ok: true, ts: posted.ts, channel: row.channel };
}

/** Is this row due right now, and not already run in this period? */
function isDue(row, d) {
  const today = d.centralDate(), dow = new Date(today + 'T12:00:00Z').getUTCDay(), dom = +today.slice(8, 10);
  const dayOk = row.cadence === 'daily' || (row.cadence === 'weekdays' && dow >= 1 && dow <= 5) || (row.cadence === 'monday' && dow === 1) || (row.cadence === 'first' && dom === 1);
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
    if (MODEL_KINDS.has(KINDS[row.kind] ? row.kind : 'question') && await runsToday(env, d) >= MAX_PER_DAY) { out.capped = true; continue; }
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
      schedules: (results || []).filter(mine).map(r => ({ ...r, kind: KINDS[r.kind] ? r.kind : 'question', kind_label: KINDS[r.kind] || KINDS.question, brand: r.act === 'all' ? 'All brands' : nm[r.act] || r.act, when: whenText(r), channel_name: ch.get(r.channel) || r.channel })),
      channels: [...ch].map(([id, name]) => ({ id, name })), runs_today: await runsToday(env, d), max_per_day: MAX_PER_DAY, kinds: KINDS,
    });
  }
  const b = request.method === 'GET' || request.method === 'DELETE' ? {} : await request.json().catch(() => ({}));
  if (path === '/api/ask/schedules' && request.method === 'PUT') {
    const kind = KINDS[b.kind] ? b.kind : 'question';
    let ref = null;
    if (kind === 'dashboard') {
      const dash = await env.DB.prepare(`SELECT id, name FROM p_dashboard WHERE id = ?1`).bind(String(b.ref || '')).first().catch(() => null);
      if (!dash) return json({ error: 'Pick the dashboard to post.' }, 400);
      ref = dash.id; if (!String(b.question || '').trim()) b.question = `Post the "${dash.name}" dashboard`;
    }
    if (kind === 'check' && !String(b.question || '').trim()) b.question = 'The live check: is anything weird right now?';
    const question = String(b.question || '').trim().slice(0, 600);
    if (question.length < 8) return json({ error: kind === 'task' ? 'Write what it should do each time.' : 'Write the question you want asked.' }, 400);
    const act = !b.act || b.act === 'all' ? 'all' : await resolveBrandId(env, String(b.act).slice(0, 64));
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
    if (id) await env.DB.prepare(`UPDATE p_ask_schedule SET question = ?2, act = ?3, cadence = ?4, hour_central = ?5, channel = ?6, kind = ?7, ref = ?8 WHERE id = ?1`).bind(id, question, act, cadence, hour, channel, kind, ref).run();
    else {
      id = 'sq_' + hex(10);
      await env.DB.prepare(`INSERT INTO p_ask_schedule (id, question, act, cadence, hour_central, channel, created_by, kind, ref) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)`)
        .bind(id, question, act, cadence, hour, channel, email || 'admin', kind, ref).run();
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

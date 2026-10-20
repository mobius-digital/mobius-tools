/* THE CALL SCREENS (2026-10-19). The screen Cole shares on a call and walks top to bottom, the same order every week.
 * Approved mock: https://claude.ai/artifact/YbExG9VRV3untjLtPHjnJb (Monday call, client call, creative kickoff).
 *
 * Cole: "something pulled up that I would share the screen and go down every single week with the team, analyze
 * everything again and come up with a plan top to bottom." Efficiency is the point: nobody prepares a doc, Locus fills
 * what it already knows, the only typing is what the call decides, and Finish sends each line where it lives.
 *
 * Where every box comes from (the screen labels each one):
 *   Monday   last week's items = open p_action rows (actions.js), ticked live; the read = the brand's weekly report
 *            (frozen numbers, top ads with Triple Whale ROAS, the Google and Amazon sections); the read's words and this
 *            week's batches = the strategist's Monday plan in Slack (meetings.js mondayScreen reads the thread), split
 *            into fields by one Haiku call per brand, cached on the call; new jobs and new asks = typed on the call.
 *   Client   their news = typed; the read and this week = the newest SENT report (weekly or monthly); asks = open
 *            Requests asks + typed; coming up = the Calendar (calendar.js, lite).
 *   Kickoff  the briefs = Production cards in the Brief column (p_br_batch, the Monday batches land there); the brief
 *            page, inspiration files and versions = the card (the browser reads /api/production/card); the brand's
 *            current winners = its weekly report; the Drive folder = the brand's connection. Typed: questions + the deal.
 *
 * Finish (Monday, client): the typed call becomes a p_meeting row (kind monday_call / client_call, status extracted)
 * and goes through meetings.js `confirm`, the same path a Fireflies call takes after approval: team items -> p_action,
 * batches -> numbered Asana briefs + Production cards, asks -> Requests, "This week" -> the open weekly draft, one Slack
 * note per brand under the morning card. No approve step: the people on the call typed it.
 * Fireflies still records; meetings.js `extract` reads the finished call of that day and returns only what was said
 * and NOT typed ("Also said on the call").
 * Kickoff: each brief is closed on its own (`kickoffDone`): owner / due / format on the card (Asana follows), one comment
 * that is the record (mirrored to Asana as a story), `kickoff_at`, and the card moves to Making.
 *
 * Table p_call (created on first use). One row per call: id = monday:<date> | client:<act>:<date> | kickoff:<date>, so
 * two laptops on the same call open the same row. state_json = everything typed (autosaved), result_json = what Finish made.
 * Routes (team only; not on brandguard CLIENT_RULES, and refused again for a client scope):
 *   GET  /api/calls/screen?kind=monday|client|kickoff&act=   the screen's data + the call row
 *   GET  /api/calls/google?act=&from=&to=                    Google spend by campaign type for the read (lazy, cached)
 *   PUT  /api/calls/state {id, state}                         autosave (whole state, last write wins)
 *   POST /api/calls/parse {text, act}                         one typed line -> owner, due, brand (actions.js parseQuick)
 *   POST /api/calls/finish {id, recap?}                       Monday / client: everything typed, where it lives
 *   POST /api/calls/kickoff/done {id, card, note, count, format, due, owner}
 *   GET  /api/calls/history                                   the last 30 finished calls
 */
import { markDone, parseQuick, ROSTER } from './actions.js';
import { mondayScreen, confirm as confirmMeeting, ensureMeetings } from './meetings.js';
import { listRequests } from './requests.js';
import { SKIP } from './moved.js';
import { calendarData } from './calendar.js';
import { listBoard, setField, moveCard } from './production.js';
import { addComment, ensureWork } from './prodwork.js';

const HAIKU = 'claude-haiku-5-5';
const SONNET = 'claude-sonnet-5-5';
const ATTR = 'lastPlatformClick';
const KINDS = ['monday', 'client', 'kickoff'];

const safe = (s, d) => { try { return s == null ? d : JSON.parse(s); } catch { return d; } };
const now = () => new Date().toISOString();
const clean = (s, n) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, n);
const keep = (s, n) => String(s ?? '').replace(/\r/g, '').trim().slice(0, n);
const ymdOk = s => /^\d{4}-\d{2}-\d{2}$/.test(s || '');
const noDash = s => String(s ?? '').replace(/\s*[—–]\s*/g, ', ');
const centralToday = () => new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Chicago' })).toISOString().slice(0, 10);
const addDays = (ymd, n) => { const d = new Date(ymd + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const mondayOf = ymd => { const d = new Date(ymd + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7)); return d.toISOString().slice(0, 10); };
const nameOfEmail = e => { const w = String(e || '').split('@')[0].split(/[._-]/)[0]; return w ? w[0].toUpperCase() + w.slice(1) : 'the team'; };
const hash = s => { let h = 0; for (const c of String(s)) h = (h * 31 + c.charCodeAt(0)) | 0; return String(h >>> 0); };
const err = (status, m) => Object.assign(new Error(m), { status });

let ensured = false;
export async function ensureCalls(env) {
  if (ensured) return;
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS p_call (
    id TEXT PRIMARY KEY, kind TEXT NOT NULL, act_id TEXT NOT NULL DEFAULT '', date TEXT NOT NULL, title TEXT,
    state_json TEXT, status TEXT NOT NULL DEFAULT 'live', started_by TEXT, started_at TEXT, updated_by TEXT, updated_at TEXT,
    finished_by TEXT, finished_at TEXT, meeting_id TEXT, result_json TEXT)`).run();
  await env.DB.prepare(`CREATE INDEX IF NOT EXISTS p_call_date ON p_call (date DESC)`).run();
  await ensureWork(env);
  await env.DB.prepare(`ALTER TABLE p_br_batch ADD COLUMN kickoff_at TEXT`).run().catch(() => {});
  ensured = true;
}

async function model(env, d, { model: m = HAIKU, system, user, schema, max = 1500 }) {
  if (!env.ANTHROPIC_API_KEY || !d.xfetch) throw new Error('no model key');
  const r = await d.xfetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({ model: m, max_tokens: max, system, output_config: { format: { type: 'json_schema', schema } }, messages: [{ role: 'user', content: user }] }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error?.message || `Claude HTTP ${r.status}`);
  const out = safe((j.content || []).filter(b => b.type === 'text').map(b => b.text).join(''), null);
  if (!out) throw new Error('empty answer');
  return out;
}

/* ---------- the call row ---------- */
function callId(kind, act, date) { return kind === 'client' ? `client:${act}:${date}` : `${kind}:${date}`; }
async function loadCall(env, id) {
  const r = await env.DB.prepare(`SELECT * FROM p_call WHERE id = ?1`).bind(id).first();
  return r ? { ...r, state: safe(r.state_json, {}) || {}, result: safe(r.result_json, null), state_json: undefined, result_json: undefined } : null;
}
async function openCall(env, kind, act, date, who, title) {
  const id = callId(kind, act, date);
  let c = await loadCall(env, id);
  if (!c) {
    await env.DB.prepare(`INSERT OR IGNORE INTO p_call (id, kind, act_id, date, title, state_json, status, started_by, started_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, '{}', 'live', ?6, ?7, ?7)`)
      .bind(id, kind, act || '', date, title, who, now()).run();
    c = await loadCall(env, id);
  }
  return c;
}
async function saveState(env, id, state, who) {
  const s = JSON.stringify(state || {});
  if (s.length > 400000) throw err(400, 'The call notes are too long to save.');
  await env.DB.prepare(`UPDATE p_call SET state_json = ?2, updated_by = ?3, updated_at = ?4 WHERE id = ?1`).bind(id, s, who, now()).run();
}

/* ---------- the read, from a frozen report ---------- */
const NUM_KEYS = ['sales', 'spend', 'mer', 'orders', 'new_orders', 'ncpa', 'aov', 'amer'];
function pickTotals(t) { const o = {}; for (const k of NUM_KEYS) o[k] = t?.[k] ?? null; return o; }
/** Top 3 and bottom 3 ads by Triple Whale ROAS, from the report's own top ads (already behind its spend floor).
 *  An ad with no Triple Whale row reads 0 (a real zero under that model); a report with no attribution has no ROAS
 *  and the ads are listed by spend, said so. */
export function winnersLosers(data) {
  const top = data?.ads?.top || [];
  const attr = data?.attr?.ads?.[ATTR] || null;
  const rows = top.map(a => {
    const t = attr ? (attr[a.ad_id] || { revenue: 0, orders: 0 }) : null;
    return { ad_id: a.ad_id, name: a.name, thumb: a.thumb || null, video: !!a.video, spend: a.spend, share: a.share ?? null,
      roas: t ? (a.spend ? t.revenue / a.spend : null) : null, orders: t ? t.orders : null, headline: a.headline || null };
  });
  if (!attr) return { winners: rows.slice(0, 3), losers: [], basis: 'spend', floor: data?.ads?.floor ?? null, bar: null, pool: rows.length };
  /* 2026-10-19 (Cole: "how are you choosing winners?"): the pool is the report's own ads, the biggest spenders that
     each spent at least the floor (up to 10). Best 3 by Triple Whale ROAS and worst 3, never the same ad twice. `bar`
     = those ads' ROAS together, shown as the yardstick. */
  const att = rows.filter(r => r.roas != null).sort((a, b) => b.roas - a.roas);
  const sp = att.reduce((n, r) => n + (r.spend || 0), 0), rev = att.reduce((n, r) => n + (r.roas || 0) * (r.spend || 0), 0);
  const winners = att.slice(0, 3);
  const losers = att.slice(3).reverse().slice(0, 3);
  return { winners, losers, basis: 'tw', floor: data?.ads?.floor ?? null, bar: sp ? rev / sp : null, pool: att.length };
}
function channelOf(data, id) {
  const c = (data?.channels || []).find(x => x.id === id);
  if (!c || !c.cur) return null;
  const pick = o => o ? { spend: o.spend ?? null, revenue: o.revenue ?? o.sales ?? null, roas: o.roas ?? null, purchases: o.purchases ?? o.orders ?? null } : null;
  return { label: c.label, cur: pick(c.cur), prev: pick(c.prev), source: c.cur.source || null };
}
function readOf(rep) {
  if (!rep) return null;
  const data = safe(rep.data_json, {}) || {};
  return {
    period: rep.period, period_start: rep.period_start, period_end: rep.period_end, status: rep.status, sent_at: rep.sent_at || null,
    currency: data.account?.currency || 'USD', totals: pickTotals(data.totals), prior: pickTotals(data.previous), plan: pickTotals(data.forecast),
    ...winnersLosers(data), google: channelOf(data, 'google'), amazon: channelOf(data, 'amazon'),
    channels: (data.channels || []).map(c => channelOf(data, c.id) && { id: c.id, ...channelOf(data, c.id) }).filter(Boolean),
    this_week: data.this_week || [], need_from_you: data.need_from_you || [], summary: String(rep.summary || '').slice(0, 1500),
  };
}
async function latestReport(env, act, period, { sentOnly = false } = {}) {
  return env.DB.prepare(`SELECT period, period_start, period_end, status, summary, data_json, sent_at FROM reports WHERE act_id = ?1 AND period = ?2 ${sentOnly ? `AND status = 'sent'` : ''} ORDER BY period_start DESC LIMIT 1`)
    .bind(act, period).first().catch(() => null);
}

/* ---------- the strategist's Slack plan, split into the screen's fields ---------- */
const PLAN_SCHEMA = { type: 'object', additionalProperties: false, required: ['read', 'batches', 'google', 'amazon', 'asks'], properties: {
  read: { type: 'string' },
  batches: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['text', 'owner', 'due'], properties: { text: { type: 'string' }, owner: { type: 'string' }, due: { type: 'string' } } } },
  google: { type: 'string' }, amazon: { type: 'string' },
  asks: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['text', 'due'], properties: { text: { type: 'string' }, due: { type: 'string' } } } },
} };
async function splitPlan(env, d, brand, thread, monday) {
  const text = thread.map(m => `${m.by}: ${m.text}`).join('\n\n').slice(0, 12000);
  const system = `You split a brand's Monday plan thread (posted in Slack before the Monday call) into the fields of the Monday call screen. Plain English, no em dashes. Keep their own words; never invent.
WHO POSTS: Ahsan and Noma are the strategists (Meta ads and creative). Radhesh runs Google Ads. Hamza runs Amazon. Cole owns the agency. Each message starts with the poster's name.
read = the STRATEGIST's takeaways on last week's Meta ads and creative in 1 to 4 sentences (numbers, winners, losers), as they wrote them. Never put a Google or Amazon update here; if only Radhesh or Hamza posted, read = ''.
batches = from Ahsan's, Noma's or Cole's posts only (never Radhesh's or Hamza's): each batch of ads planned for this week (never Google or Amazon work), one line each saying what to make ("3 new hooks on the Burgundy couch video, static 4:5"), owner = the designer or editor named (first name from: ${ROSTER.map(r => r.name).join(', ')}) else '', due = YYYY-MM-DD when a day is given (the Monday is ${monday}) else ''.
google = what Radhesh's Google update says (budgets, bids, feeds, what he is watching), in one or two sentences, else ''. amazon = the same for Hamza's Amazon update, else ''.
asks = what they need from the client, one line each, with a due date when given.`;
  return model(env, d, { system, user: `BRAND: ${brand}\n\nTHE PLAN THREAD:\n${text}`, schema: PLAN_SCHEMA, max: 2000 });
}

/* ---------- Monday ---------- */
async function mondayData(env, d, who) {
  const today = d.centralDate ? d.centralDate() : centralToday();
  const ms = await mondayScreen(env, d);
  /* Paused brands and the test account are never on the call (moved.js SKIP, the list every Slack post uses). */
  ms.brands = ms.brands.filter(b => !SKIP.test(b.name || ''));
  const call = await openCall(env, 'monday', '', ms.monday, who, `Monday call ${ms.monday}`);
  const state = call.state || {};
  state.brands = state.brands || {};
  state.parsed = state.parsed || {};
  let changed = false;
  const asks = await listRequests(env, 'all').catch(() => ({ items: [] }));
  /* What is already being made per brand (Production: Brief, Making, Review), so a batch is never asked for twice. */
  const prod = {};
  const board = await listBoard(env, d, { act: 'all' }).catch(() => ({ cards: [] }));
  for (const c of board.cards || []) if (['brief', 'making', 'review'].includes(c.board) && !parked(c, today)) (prod[c.act_id] = prod[c.act_id] || []).push({ num: c.num, title: c.title, board: c.board, owner: c.assignee || '', due: c.due || '' });
  const brands = await Promise.all(ms.brands.map(async b => {
    const rep = await latestReport(env, b.act_id, 'weekly');
    const read = readOf(rep);
    /* The plan thread, split once per version of the thread (a new reply re-splits it). */
    let plan = null;
    if (b.thread.length) {
      const h = 'v4:' + hash(b.thread.map(m => m.text).join('|'));
      const cached = state.parsed[b.act_id];
      if (cached && cached.h === h) plan = cached.plan;
      else {
        try { plan = await splitPlan(env, d, b.name, b.thread, ms.monday); state.parsed[b.act_id] = { h, plan, at: now() }; changed = true; }
        catch (e) { plan = null; state.parsed[b.act_id] = { h: null, error: e.message }; }
      }
    }
    /* The typed state starts from the plan the first time a brand is opened, never over what was typed. */
    const st = state.brands[b.act_id];
    /* A brand nobody has typed on yet takes the newest split (a later reply in the thread, or a better split). */
    if (plan && (!st || (st.seeded && !st.edited && st.h !== state.parsed[b.act_id]?.h))) {
      state.brands[b.act_id] = { read: '', batches: (plan.batches || []).map(x => ({ text: noDash(clean(x.text, 300)), owner: clean(x.owner, 40), due: ymdOk(x.due) ? x.due : '', from: 'slack' })), jobs: [], asks: (plan.asks || []).map(x => ({ text: noDash(clean(x.text, 300)), due: ymdOk(x.due) ? x.due : '', from: 'slack' })), seeded: true, h: state.parsed[b.act_id]?.h || null };
      changed = true;
    }
    return {
      act_id: b.act_id, name: b.name, read, open: b.open,
      /* The Slack posts themselves, as written, one per person (Cole: "he posts something every Monday, is that pulled?"). */
      posts: b.thread.map(m => ({ by: m.by, at: m.at, text: m.text })),
      making: (prod[b.act_id] || []).slice(0, 12),
      asks: (asks.items || []).filter(x => x.act_id === b.act_id && x.kind === 'ask' && x.status === 'open').map(x => ({ id: x.id, title: x.title, body: x.body, created_at: x.created_at })),
    };
  }));
  if (changed) await saveState(env, call.id, state, who);
  return { kind: 'monday', today, monday: ms.monday, theme: ms.theme, agency_open: ms.agency_open, brands, call: { ...call, state }, team: ROSTER.map(r => r.name) };
}

/* ---------- client ---------- */
async function clientData(env, d, act, who) {
  const today = d.centralDate ? d.centralDate() : centralToday();
  const brands = await d.listBrands(env);
  const b = brands.find(x => x.act_id === act);
  if (!b) throw err(400, 'Pick the brand.');
  const call = await openCall(env, 'client', act, today, who, `${b.name} client call ${today}`);
  const [wk, mo, wkAny] = await Promise.all([latestReport(env, act, 'weekly', { sentOnly: true }), latestReport(env, act, 'monthly', { sentOnly: true }), latestReport(env, act, 'weekly')]);
  const req = await listRequests(env, act).catch(() => ({ items: [] }));
  const cal = await calendarData(env, { act, from: today, to: addDays(today, 35), lite: true }).catch(() => ({ items: [] }));
  return {
    kind: 'client', today, act_id: act, name: b.name,
    week: readOf(wk || wkAny), month: readOf(mo),
    asks: (req.items || []).filter(x => x.kind === 'ask' && x.status === 'open').map(x => ({ id: x.id, title: x.title, body: x.body, created_at: x.created_at })),
    approvals: (req.items || []).filter(x => x.kind === 'approval' && x.status === 'open').map(x => ({ id: x.id, title: x.title, created_at: x.created_at })),
    coming: (cal.items || []).filter(e => e.act === act && (e.start || '') >= today).slice(0, 12).map(e => ({ id: e.id, name: e.name, start: e.start, end: e.end || null, kind: e.kind_label || e.kind, confirmed: !!e.confirmed, offer: e.offer || '' })),
    has_client_channel: !!(await env.DB.prepare(`SELECT brief_channel FROM brand_accounts WHERE act_id = ?1`).bind(act).first().catch(() => null))?.brief_channel,
    call, team: ROSTER.map(r => r.name),
  };
}

/* ---------- kickoff ---------- */
async function brandDrive(env, act) {
  const c = await env.DB.prepare(`SELECT external_id FROM connections WHERE brand_id = ?1 AND kind = 'drive' LIMIT 1`).bind(act).first().catch(() => null);
  const asUrl = s => { const t = String(s || '').trim(); if (!t) return null; if (/^https?:/.test(t)) return t; return /^[\w-]{10,}$/.test(t) ? `https://drive.google.com/drive/folders/${t}` : null; };
  if (c?.external_id) return asUrl(c.external_id);
  const p = safe((await env.DB.prepare(`SELECT data_json FROM p_br_doc WHERE act_id = ?1 AND line_id = '' AND key = 'profile'`).bind(act).first().catch(() => null))?.data_json, {});
  if (p?.drive) return asUrl(p.drive);
  const n = await env.DB.prepare(`SELECT drive_url FROM p_newclient WHERE act_id = ?1 AND drive_url IS NOT NULL LIMIT 1`).bind(act).first().catch(() => null);
  return asUrl(n?.drive_url);
}
async function kickoffData(env, d, act, who, origin) {
  const today = d.centralDate ? d.centralDate() : centralToday();
  const call = await openCall(env, 'kickoff', '', today, who, `Creative kickoff ${today}`);
  const board = await listBoard(env, { ...d, origin }, { act: act || 'all' });
  const cards = board.cards.filter(c => c.board === 'brief');
  const ids = cards.map(c => c.id);
  const ko = ids.length ? ((await env.DB.prepare(`SELECT id, kickoff_at FROM p_br_batch WHERE id IN (${ids.map((_, i) => `?${i + 1}`).join(',')})`).bind(...ids).all()).results || []) : [];
  const kickedOn = Object.fromEntries(ko.map(r => [r.id, r.kickoff_at]));
  const acts = [...new Set(cards.map(c => c.act_id))];
  const brandCtx = {};
  await Promise.all(acts.map(async a => {
    const rep = readOf(await latestReport(env, a, 'weekly'));
    brandCtx[a] = { winners: rep ? rep.winners : [], basis: rep?.basis || null, week: rep ? rep.period_start : null, drive: await brandDrive(env, a) };
  }));
  return {
    kind: 'kickoff', today, call,
    /* A card that has sat in Brief for three weeks is parked, not this week's work: listed as `old`, shown on request. */
    briefs: cards.map(c => ({ ...c, kickoff_at: kickedOn[c.id] || null, old: parked(c, today) })).sort((a, b) => (a.old ? 1 : 0) - (b.old ? 1 : 0) || a.brand.localeCompare(b.brand) || (+a.num || 0) - (+b.num || 0)),
    brands: brandCtx, team: ROSTER.map(r => r.name),
  };
}

/** Parked, not this week's work: the team's template and scratch cards in the Brief column (a title that is only
 *  "Test", only the number, or a "Template"), and anything that has sat there three weeks with no due date. */
function parked(c, today) {
  const t = String(c.title || '').trim();
  if (!t || /template/i.test(t) || /^test$/i.test(t) || t === String(c.num)) return true;
  return !!c.since && c.since < addDays(today, -21) && !c.due;
}

/** One brief closed on the kickoff call: the deal on the card, one comment that is the record, the card to Making. */
export async function kickoffDone(env, d, body, who) {
  await ensureCalls(env);
  const card = await env.DB.prepare(`SELECT id, act_id, num, title, board_stage, assignee_name, due_on FROM p_br_batch WHERE id = ?1`).bind(String(body.card || '')).first();
  if (!card) throw err(404, 'No such brief.');
  const fields = { id: card.id };
  if (body.owner != null && clean(body.owner, 40) !== (card.assignee_name || '')) fields.owner = clean(body.owner, 40);
  if (body.due != null && body.due !== (card.due_on || '')) { if (body.due && !ymdOk(body.due)) throw err(400, 'Pick a due date.'); fields.due = body.due || ''; }
  if (body.format) fields.format = body.format;
  const out = { card: card.id, asana: null, comment: null, moved: null };
  if (Object.keys(fields).length > 1) { const r = await setField(env, d, fields, who); out.asana = r.asana; }
  const count = Math.max(0, Math.min(99, parseInt(body.count, 10) || 0));
  const due = fields.due ?? card.due_on ?? '';
  const parts = [count ? `${count} ad${count === 1 ? '' : 's'}` : '', body.format || '', due ? `due ${new Date(due + 'T12:00:00Z').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' })}` : '', (fields.owner ?? card.assignee_name) ? `${fields.owner ?? card.assignee_name} makes it` : ''].filter(Boolean);
  const note = keep(body.note, 3000);
  const text = noDash(`Kickoff ${centralToday()}: agreed ${parts.join(', ') || 'to go ahead'}.${note ? `\n${note}` : ''}`);
  out.comment = await addComment(env, d, { id: card.id, body: text, kind: 'comment' }, who, null);
  await env.DB.prepare(`UPDATE p_br_batch SET kickoff_at = ?2 WHERE id = ?1`).bind(card.id, now()).run();
  if ((card.board_stage || 'brief') === 'brief') out.moved = await moveCard(env, d, { id: card.id, to: 'making' }, who).catch(e => ({ error: e.message }));
  if (body.id) {
    const c = await loadCall(env, String(body.id));
    if (c) { const st = c.state || {}; st.done = { ...(st.done || {}), [card.id]: { at: now(), by: nameOfEmail(who), text } }; await saveState(env, c.id, st, who); }
  }
  return { ok: true, ...out, text };
}

/* ---------- Finish: the typed call, through the same confirm a Fireflies call takes ---------- */
const WEEK_SCHEMA = { type: 'object', additionalProperties: false, required: ['brands'], properties: { brands: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['brand_id', 'this_week'], properties: { brand_id: { type: 'string' }, this_week: { type: 'array', items: { type: 'string' } } } } } } };
/** The "For the client" box, typed on the call: one line per non-empty line, verbatim (only whitespace and dashes tidied), 5 max. */
const typedLines = s => String(s ?? '').replace(/\r/g, '').split('\n').map(x => noDash(clean(x.replace(/^\s*[-*\u2022]\s*/, ''), 300))).filter(Boolean).slice(0, 5);
/** FALLBACK ONLY, for a brand whose "For the client" box is empty: 2 to 4 "This week" lines written from what the call agreed. */
async function clientLines(env, d, rows) {
  const has = rows.filter(r => !r.client.length && (r.read || r.batches.length));
  if (!has.length) return {};
  const system = `You write the "This week" lines a Mobius Digital client reads in their weekly report, from what the team agreed on its Monday call. 2 to 4 lines per brand. Say what we are doing this week and why, in plain words the client uses. Never a team member's name, never a cost or a ROAS, never another brand, never "the AI", no em dashes. Never invent anything that is not in the notes.`;
  const user = has.map(r => `BRAND ${r.brand_id} (${r.name})\nThe read: ${r.read || '(none)'}\nAgreed batches:\n${r.batches.map(x => `- ${x.text}`).join('\n') || '(none)'}`).join('\n\n');
  try { const o = await model(env, d, { model: SONNET, system, user, schema: WEEK_SCHEMA, max: 3000 }); return Object.fromEntries((o.brands || []).map(b => [b.brand_id, (b.this_week || []).map(x => noDash(clean(x, 300))).filter(Boolean).slice(0, 4)])); }
  catch { return {}; }
}
const item = (kind, x) => ({ text: clean(x.text, 300), detail: clean(x.detail, 2000), owner: clean(x.owner, 40), due: ymdOk(x.due) ? x.due : '', kind, area: kind === 'brief' ? 'ads' : '' });

export async function finishCall(env, d, body, who) {
  await ensureCalls(env);
  const c = await loadCall(env, String(body.id || ''));
  if (!c) throw err(404, 'No such call.');
  if (c.status === 'finished') throw err(400, 'This call is already finished.');
  if (c.kind === 'kickoff') {
    await env.DB.prepare(`UPDATE p_call SET status = 'finished', finished_by = ?2, finished_at = ?3, result_json = ?4 WHERE id = ?1`).bind(c.id, who, now(), JSON.stringify({ briefs: Object.keys(c.state?.done || {}).length })).run();
    return { ok: true, kind: 'kickoff', briefs: Object.keys(c.state?.done || {}).length };
  }
  const brands = await d.listBrands(env);
  const nameOf = id => brands.find(b => b.act_id === id)?.name || id;
  const st = c.state || {};
  const rows = [];
  const notes = { kind: c.kind === 'monday' ? 'monday_call' : 'client_call', summary: '', brands: [], live: true };
  if (c.kind === 'monday') {
    for (const [act, s] of Object.entries(st.brands || {})) {
      if (!brands.some(b => b.act_id === act)) continue;
      const r = { brand_id: act, name: nameOf(act), read: clean(s.read, 2000), client: typedLines(s.client), batches: (s.batches || []).filter(x => x && clean(x.text, 300) && x.on !== false), jobs: (s.jobs || []).filter(x => x && clean(x.text, 300)), asks: (s.asks || []).filter(x => x && clean(x.text, 300) && x.on !== false) };
      if (r.read || r.client.length || r.batches.length || r.jobs.length || r.asks.length) rows.push(r);
    }
    const lines = await clientLines(env, d, rows);
    for (const r of rows) notes.brands.push({ brand_id: r.brand_id, decisions: r.read ? [r.read] : [], items: [...r.jobs.map(x => item('team', x)), ...r.batches.map(x => item('brief', x)), ...r.asks.map(x => item('client_owes', x))], this_week: r.client.length ? r.client : (lines[r.brand_id] || []), need_from_client: r.asks.map(x => clean(x.text, 300)) });
    const theme = clean(st.theme, 600);
    const agencyJobs = (st.agency || []).filter(x => x && clean(x.text, 300));
    if (theme || agencyJobs.length) notes.brands.unshift({ brand_id: '', decisions: theme ? [theme] : [], items: agencyJobs.map(x => item('team', x)), this_week: [], need_from_client: [] });
    notes.summary = theme ? `This week, every brand: ${theme}` : `Monday call, ${rows.length} brand${rows.length === 1 ? '' : 's'}.`;
  } else {
    const act = c.act_id;
    const promised = (st.promised || []).filter(x => x && clean(x.text, 300));
    const asks = (st.asks || []).filter(x => x && clean(x.text, 300));
    const news = clean(st.news, 2000);
    notes.brands.push({ brand_id: act, decisions: news ? [`Their news: ${news}`] : [], items: [...promised.map(x => item('team', x)), ...asks.map(x => item('client_owes', x))], this_week: [], need_from_client: [] });
    notes.summary = news ? `Client call with ${nameOf(act)}. Their news: ${news}` : `Client call with ${nameOf(act)}.`;
  }
  if (!notes.brands.length) throw err(400, 'Nothing was typed on this call yet.');
  /* The p_meeting row the confirm writes from. Its id ties a later Fireflies read of the same call to this one. */
  await ensureMeetings(env);
  const mid = `live_${c.id.replace(/[^a-z0-9_]/gi, '_')}`;
  const title = c.title || (c.kind === 'monday' ? 'Monday call' : 'Client call');
  await env.DB.prepare(`INSERT INTO p_meeting (id, title, date, at, duration, organizer, attendees_json, chars, kind, notes_json, status, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, NULL, ?5, '[]', 0, ?6, ?7, 'extracted', ?4, ?4)
    ON CONFLICT(id) DO UPDATE SET notes_json = excluded.notes_json, status = 'extracted', updated_at = excluded.updated_at`).bind(mid, title, c.date, now(), who, notes.kind, JSON.stringify(notes)).run();
  const result = await confirmMeeting(env, d, { id: mid, summary: notes.summary, brands: notes.brands }, nameOfEmail(who));
  /* THE KIT (2026-10-20): what the call decided feeds the brand's Daily Brief. The brief's "What we're doing" is written
     only from the buyer's note (settings briefNote:<brand>, read for 2 days) and the Change Log, so the call's team jobs,
     briefs and promises are appended there, one line each, never a line twice. A failure here never fails the call. */
  try {
    for (const b of notes.brands) {
      if (!b.brand_id) continue;
      const lines = (b.items || []).filter(x => x && x.kind !== 'client_owes' && clean(x.text, 300)).map(x => clean(x.text, 300));
      if (lines.length) await appendBriefNote(env, b.brand_id, lines);
    }
  } catch (e) { console.log('brief note from call', e.message); }
  /* The client call's recap, only when the person ticked it and read it on the screen. */
  let recap = null;
  if (c.kind === 'client' && body.recap && clean(body.recap, 4000)) {
    const ch = (await env.DB.prepare(`SELECT brief_channel FROM brand_accounts WHERE act_id = ?1`).bind(c.act_id).first().catch(() => null))?.brief_channel;
    if (!ch) recap = { posted: false, why: 'This brand has no client channel.' };
    else { try { await d.slackPost(env, ch, noDash(keep(body.recap, 4000)), null, { username: 'Mobius Digital' }); recap = { posted: true }; } catch (e) { recap = { posted: false, why: e.message }; } }
  }
  await env.DB.prepare(`UPDATE p_call SET status = 'finished', finished_by = ?2, finished_at = ?3, meeting_id = ?4, result_json = ?5 WHERE id = ?1`)
    .bind(c.id, who, now(), mid, JSON.stringify({ ...result, recap })).run();
  return { ok: true, kind: c.kind, meeting: mid, result, recap };
}

/** The buyer's note the Daily Brief reads (worker.js briefNoteFor): keep what is under 2 days old, add the new lines. */
async function appendBriefNote(env, brandId, lines) {
  const key = `briefNote:${brandId}`;
  const row = await env.DB.prepare(`SELECT value FROM settings WHERE key = ?1`).bind(key).first().catch(() => null);
  let cur = null; try { cur = row && row.value ? JSON.parse(row.value) : null; } catch {}
  const fresh = cur && cur.at && Date.now() - Date.parse(cur.at) < 48 * 3600e3 ? String(cur.text || '') : '';
  const have = new Set(fresh.split('\n').map(x => x.trim()).filter(Boolean));
  const next = [...have, ...lines.filter(l => !have.has(l))].join('\n').slice(0, 1500);
  await env.DB.prepare(`INSERT INTO settings (key, value) VALUES (?1, ?2) ON CONFLICT(key) DO UPDATE SET value = excluded.value`).bind(key, JSON.stringify({ text: next, at: new Date().toISOString() })).run();
}

/** What a finished call of that date already typed, for the Fireflies read of the same call (meetings.js extract). */
export async function typedOnCall(env, date) {
  try {
    await ensureCalls(env);
    const rows = (await env.DB.prepare(`SELECT kind, act_id, meeting_id FROM p_call WHERE date = ?1 AND status = 'finished' AND kind != 'kickoff'`).bind(date).all()).results || [];
    const out = [];
    for (const r of rows) {
      const m = await env.DB.prepare(`SELECT notes_json FROM p_meeting WHERE id = ?1`).bind(r.meeting_id).first().catch(() => null);
      const n = safe(m?.notes_json, null);
      for (const b of n?.brands || []) for (const i of b.items || []) out.push(`${b.brand_id || 'agency'}: [${i.kind}] ${i.text}${i.owner ? ` (${i.owner})` : ''}`);
    }
    return out;
  } catch { return []; }
}

/* ---------- Google by campaign type, for the read (lazy: one brand at a time) ---------- */
async function googleTypes(env, d, act, from, to) {
  if (!d.adsReport) return { rows: [] };
  const r = await d.adsReport(env, act, from, to).catch(e => ({ error: e.message }));
  if (r?.error || !Array.isArray(r?.campaigns)) return { rows: [], error: r?.error || null };
  const LABEL = { SEARCH: 'Search', SHOPPING: 'Shopping', PERFORMANCE_MAX: 'Performance Max', DEMAND_GEN: 'Demand Gen', VIDEO: 'YouTube', DISPLAY: 'Display' };
  const by = {};
  for (const c of r.campaigns) {
    const t = LABEL[c.type || c.channel_type || c.advertising_channel_type] || 'Other';
    const name = String(c.name || '');
    const key = t === 'Search' && /brand/i.test(name) ? 'Brand search' : t;
    by[key] = by[key] || { label: key, spend: 0, campaigns: 0 };
    by[key].spend += +c.cost || +c.spend || 0; by[key].campaigns++;
  }
  return { rows: Object.values(by).filter(x => x.spend > 0).sort((a, b) => b.spend - a.spend) };
}

/* ---------- routes ---------- */
export async function handleCalls(request, env, url, path, json, d) {
  if (path !== '/api/calls' && !path.startsWith('/api/calls/')) return null;
  if (!(await d.isAdmin(request, env))) return json({ error: 'unauthorized' }, 401);
  if (d.clientScope && d.clientScope(request)) return json({ error: 'The team\'s page.' }, 403);
  await ensureCalls(env);
  try {
    const who = (await d.sessionEmail(env, request).catch(() => null)) || 'the team';
    if (path === '/api/calls/screen' && request.method === 'GET') {
      const kind = url.searchParams.get('kind') || 'monday';
      if (!KINDS.includes(kind)) return json({ error: 'Pick a call.' }, 400);
      const act = url.searchParams.get('act') || '';
      if (kind === 'monday') return json(await mondayData(env, d, who));
      if (kind === 'client') return json(await clientData(env, d, act, who));
      return json(await kickoffData(env, d, act && act !== 'all' ? act : 'all', who, url.origin));
    }
    if (path === '/api/calls/google' && request.method === 'GET') {
      const act = url.searchParams.get('act') || '', from = url.searchParams.get('from'), to = url.searchParams.get('to');
      if (!act || !ymdOk(from) || !ymdOk(to)) return json({ error: 'Need act, from and to.' }, 400);
      return json(await googleTypes(env, d, act, from, to));
    }
    if (path === '/api/calls/history' && request.method === 'GET') {
      const rows = (await env.DB.prepare(`SELECT id, kind, act_id, date, title, status, finished_by, finished_at, meeting_id FROM p_call ORDER BY date DESC, started_at DESC LIMIT 30`).all()).results || [];
      return json({ calls: rows });
    }
    if (path === '/api/calls/state' && (request.method === 'PUT' || request.method === 'POST')) {
      const body = await request.json().catch(() => ({}));
      const c = await loadCall(env, String(body.id || ''));
      if (!c) return json({ error: 'No such call.' }, 404);
      if (c.status === 'finished') return json({ error: 'This call is finished.' }, 400);
      await saveState(env, c.id, body.state || {}, who);
      return json({ ok: true, at: now() });
    }
    if (request.method !== 'POST') return json({ error: 'not found' }, 404);
    const body = await request.json().catch(() => ({}));
    if (path === '/api/calls/parse') return json(await parseQuick(env, d, body.text, { act: String(body.act || '') }));
    if (path === '/api/calls/done') return json({ ok: true, item: await markDone(env, String(body.item || ''), body.done !== false, { by: who, how: 'tick' }) });
    if (path === '/api/calls/finish') return json(await finishCall(env, d, body, who));
    if (path === '/api/calls/kickoff/done') return json(await kickoffDone(env, d, body, who));
    return json({ error: 'not found' }, 404);
  } catch (e) { return json({ error: e.message }, e.status >= 400 && e.status < 600 ? e.status : 500); }
}

export const _test = { winnersLosers, readOf, callId, mondayOf, parked, typedLines };

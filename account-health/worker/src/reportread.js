/* HOW WE READ IT (2026-11-26, the client reports rebuild; spec: client-reports-spec.md in the session notes).
 *
 * Cole: at the top of every weekly and monthly report, the agency's read of the period, written AFTER the Monday call.
 * CEOs want our read, then the numbers. The flow, and this module's part in each step:
 *
 *   1. DRAFT (Monday / the 1st, worker.js makeReport): the old client narrative is gone. `reportDrafted` writes TALKING
 *      POINTS for the call instead: team-only (3 to 6 points, each with the one number that proves it; 1 to 3 questions
 *      the team must settle; a proposed read). reports.summary stays NULL at draft.
 *   2. THE CALL: the team's view comes in from a confirmed Fireflies call (meetings.js confirm -> draftRead with
 *      source 'meeting') or typed / pasted in v5 Reports (POST /api/report-read/draft {notes}).
 *   3. WRITE THE READ (Sonnet 5.5): the frozen numbers + the talking points + the team view -> 3 to 6 short sentences,
 *      client facing. The team's view wins: the model only writes it up. Stored as `draft`, status 'drafted'.
 *   4. APPROVE (a person): read_text, approved_by, approved_at, status 'approved', AND reports.summary = read_text so
 *      every older surface (the ported GET /api/report, the old archive) shows the read.
 *   5. SEND (worker.js sendReport): refuses unless approved with a non-empty read (`approvedRead`).
 *
 * Table p_report_read (created on first use). Team-only fields (points, team view, the draft) live ONLY here, never on
 * the reports row: the engine's GET /api/report is SELECT * and clients read it.
 *
 * Routes (TEAM ONLY: not on brandguard CLIENT_RULES, so a client login is 403 before any handler; this handler refuses a
 * client scope again). Not in the engine's PORTED list, so v5 reaches them on this worker.
 *   GET  /api/report-read?act=&period=&start=
 *   POST /api/report-read/points   {act, period, start}
 *   POST /api/report-read/draft    {act, period, start, notes?}   (notes '' clears the team view)
 *   PUT  /api/report-read          {act, period, start, text}
 *   POST /api/report-read/approve  {act, period, start, text, send?}
 * Every write refuses a SENT report (frozen). */

export const READ_MODEL = 'claude-sonnet-5-5';
const ATTR_MODEL = 'lastPlatformClick';
const LOCUS_V5 = 'https://locus.go-mobius-digital.com/profit/v5/';
const PAGE = 'https://locus.go-mobius-digital.com/profit/v5/report.html';

const SQL = `CREATE TABLE IF NOT EXISTS p_report_read (
  act_id       TEXT NOT NULL,
  period       TEXT NOT NULL,
  period_start TEXT NOT NULL,
  points_json  TEXT,
  points_at    TEXT,
  team_view    TEXT,
  team_source  TEXT,
  meeting_id   TEXT,
  draft        TEXT,
  draft_at     TEXT,
  read_text    TEXT,
  status       TEXT NOT NULL DEFAULT 'none',
  approved_by  TEXT,
  approved_at  TEXT,
  edited_at    TEXT,
  updated_at   TEXT,
  PRIMARY KEY (act_id, period, period_start)
)`;
let ensured = false;
export async function ensureReportRead(env) {
  if (ensured) return;
  await env.DB.prepare(SQL).run();
  /* edited_at came after the first CREATE: add it to a table made before it (a duplicate column throws, fine). */
  await env.DB.prepare(`ALTER TABLE p_report_read ADD COLUMN edited_at TEXT`).run().catch(() => {});
  ensured = true;
}

const safe = (s, d) => { try { return s == null ? d : JSON.parse(s); } catch { return d; } };
const now = () => new Date().toISOString();
/* The em dash (U+2014) and en dash (U+2013), built from their code points so this file carries neither character. */
const DASHES = new RegExp(`\\s*[${String.fromCharCode(0x2014, 0x2013)}]\\s*`, 'g');
const noDash = s => String(s ?? '').replace(DASHES, ', ');
const isDate = s => /^\d{4}-\d{2}-\d{2}$/.test(String(s || ''));
const STATUSES = ['none', 'points', 'drafted', 'approved'];
export const MAX_READ = 2000;
export const MAX_NOTES = 30000;

/** The v5 Reports page of a brand (where a person approves the read). */
export const readLink = act => `${LOCUS_V5}#/brand/${encodeURIComponent(String(act || '').replace(/^brand_/, '').replace(/_/g, '-'))}/reports/index`;
/** The public report page a client opens (profit/v5/report.html). The token is the brand's report archive token. */
export const reportPageUrl = (token, period, start) => `${PAGE}?t=${encodeURIComponent(token)}${period && start ? `&period=${encodeURIComponent(period)}&start=${encodeURIComponent(start)}` : ''}`;

export async function readRow(env, act, period, start) {
  await ensureReportRead(env);
  return env.DB.prepare(`SELECT * FROM p_report_read WHERE act_id = ?1 AND period = ?2 AND period_start = ?3`).bind(act, period, start).first();
}

/** What GET /api/report-read answers. */
export function shapeRead(row) {
  const p = safe(row?.points_json, null) || {};
  return {
    status: STATUSES.includes(row?.status) ? row.status : 'none',
    /* {points: [{line, why}], questions: [string], proposed: string}: line = what moved and the likely why, why = the
       one number that proves it. null before any are written. */
    points: Array.isArray(p.points) ? { points: p.points, questions: Array.isArray(p.questions) ? p.questions : [], proposed: p.proposed || null } : null,
    points_at: row?.points_at || null,
    team_view: row?.team_view || null,
    team_source: row?.team_source || null,
    meeting_id: row?.meeting_id || null,
    draft: row?.draft || null,
    draft_at: row?.draft_at || null,
    read_text: row?.read_text || null,
    approved_by: row?.approved_by || null,
    approved_at: row?.approved_at || null,
    /* Set when a person saved their own edit of the draft (PUT /api/report-read or the Slack edit modal); a later
       call's confirm leaves such a draft as is. Cleared when the read is written again by the model. */
    edited_at: row?.edited_at || null,
    updated_at: row?.updated_at || null,
  };
}

/** The approved read, or null. sendReport refuses without it. */
export const approvedRead = row => (row && row.status === 'approved' && String(row.read_text || '').trim()) ? String(row.read_text).trim() : null;
export const GATE_ERROR = 'Write and approve how we read it first';

const COLS = ['points_json', 'points_at', 'team_view', 'team_source', 'meeting_id', 'draft', 'draft_at', 'read_text', 'status', 'approved_by', 'approved_at', 'edited_at'];
async function upsert(env, act, period, start, fields) {
  await ensureReportRead(env);
  const cols = Object.keys(fields).filter(k => COLS.includes(k));
  const all = [...cols, 'updated_at'];
  const vals = [...cols.map(k => fields[k] ?? null), now()];
  const ph = all.map((_, i) => `?${i + 4}`).join(', ');
  await env.DB.prepare(`INSERT INTO p_report_read (act_id, period, period_start, ${all.join(', ')}) VALUES (?1, ?2, ?3, ${ph})
    ON CONFLICT(act_id, period, period_start) DO UPDATE SET ${all.map(k => `${k} = excluded.${k}`).join(', ')}`)
    .bind(act, period, start, ...vals).run();
  return readRow(env, act, period, start);
}

/* ---------- the numbers the model sees (the report's frozen data, nothing live) ---------- */
const r2 = n => n == null || !isFinite(n) ? null : Math.round(n * 100) / 100;
const r0 = n => n == null || !isFinite(n) ? null : Math.round(n);
export function readFacts(data) {
  if (!data) return null;
  const tot = t => t ? { sales: r0(t.sales), ad_spend: r0(t.spend), mer_whole_store: r2(t.mer), orders: r0(t.orders), aov: r2(t.aov),
    new_customer_sales: r0(t.new_rev), returning_sales: r0(t.ret_rev), new_customer_orders: r0(t.new_orders) } : null;
  const PAID = ['meta', 'google', 'tiktok', 'pinterest'];
  const sec = s => s ? { spend: r0(s.spend), ...(s.source === 'Triple Whale' && !s.awaiting_attr ? { sales_tw: r0(s.revenue), roas_tw: r2(s.roas), orders_tw: s.purchases ?? null, too_few_orders: !!s.low_signal } : { attribution: 'not synced or not Triple Whale: spend only' }) } : null;
  const platforms = (data.channels || []).filter(c => PAID.includes(c.id) && (c.cur?.spend > 0 || c.prev?.spend > 0))
    .map(c => ({ platform: c.label, this_period: sec(c.cur), period_before: sec(c.prev) }));
  const other = (data.channels || []).filter(c => !PAID.includes(c.id)).map(c => ({ channel: c.label, sales: r0(c.cur?.sales ?? c.cur?.revenue), sales_before: r0(c.prev?.sales ?? c.prev?.revenue) }));
  const tw = data.attr?.ads?.[ATTR_MODEL] || null;
  const ads = (data.ads?.top || []).slice(0, 5).map(a => {
    const t = tw ? (tw[a.ad_id] || { revenue: 0, orders: 0 }) : null;
    return { ad: a.name, shows: [a.headline, a.body].filter(Boolean).join(' / ').slice(0, 200) || null, format: a.video ? 'video' : 'image',
      spend: r0(a.spend), share_of_meta: a.share != null ? `${Math.round(a.share * 100)}%` : null,
      roas_tw: t && a.spend ? r2(t.revenue / a.spend) : null, orders_tw: t ? r2(t.orders) : null };
  });
  /* NO GOAL TYPED, NO GOAL SHOWN (2026-11-26): a month with no goal typed (reportData planned false) hands the model no
     goal, plan or projection, only no_goal_set, so the client read never states an inherited goal or "behind goal". */
  const unset = [...new Set([...Object.entries(data.forecast?.months || {}).filter(([, m]) => m && m.planned === false).map(([ym]) => ym),
    ...(data.pacing?.planned === false && data.pacing.month ? [data.pacing.month] : [])])].sort();
  return {
    brand: data.account?.name || null, currency: data.account?.currency || 'USD', period: data.period, from: data.start, to: data.end,
    period_before: { from: data.prev_start, to: data.prev_end },
    totals: tot(data.totals), totals_before: tot(data.previous),
    platforms, other_channels: other, top_meta_ads: ads,
    month_pacing: !data.pacing ? null : data.pacing.planned === false ? { month: data.pacing.month, sales_to_date: r0(data.pacing.mtd_sales) }
      : { month: data.pacing.month, sales_to_date: r0(data.pacing.mtd_sales), plan_to_date: r0(data.pacing.plan_to_date), month_goal: r0(data.pacing.goal_sales), projected: r0(data.pacing.projected) },
    plan_for_period: data.forecast && !unset.length ? { sales: r0(data.forecast.sales), ad_spend: r0(data.forecast.spend) } : null,
    ...(unset.length ? { no_goal_set: unset } : {}),
    missing_days: data.missing_days || 0,
  };
}

const RULES_NUMBERS = `MER is the whole store: all store sales over all ad spend on every platform. Never compare MER with a platform ROAS or a platform ROAS goal; MER is always higher because it counts every channel. Platform sales and ROAS are Triple Whale attributed (last platform click) and overlap across platforms. Use ONLY the numbers given; never invent or extrapolate one. A platform marked too_few_orders has no readable ROAS: say its orders have not landed, do not quote the ratio. A month listed in no_goal_set has no goal: never mention a goal, plan, target or being ahead or behind for it.`;

const POINTS_SYSTEM = `You prepare the Mobius Digital team (an ads agency) for its weekly call about one client brand. You get the period's frozen numbers as JSON. Write TALKING POINTS for the team. These are team-only: the client never sees them.
Return ONLY a JSON object, no prose around it:
{"points": [{"line": "what moved and the likely why, one sentence", "proof": "the one number that proves it, as written in a report"}], "questions": ["a question the team must settle on the call"], "proposed": "one paragraph: how we would read this period for the client, top to bottom"}
3 to 6 points, most important first. 1 to 3 questions (for example: is the drop the offer or the creative, do we hold or raise budget). The proposed read is client-facing: a good, mixed or bad period verdict first and why, then what drove it, then what we will do next; no team names, no internal ad codes, no costs of ours.
${RULES_NUMBERS}
American English. No em dashes or en dashes: use a comma, a colon or a period.`;

const READ_SYSTEM = `You write "How we read it", the first thing a client's CEO reads at the top of their weekly or monthly report from Mobius Digital, their ads agency. It is the agency's view of the period, top to bottom.
Write 3 to 6 short sentences, or up to 5 short lines. Order: the headline verdict first (a good, mixed or bad period, and why in a few words), then what drove it, then what we are doing next and why.
THE TEAM'S VIEW WINS. When the team's notes from the call are given, they are the team's read: follow them, keep their conclusions and their plan, never contradict them. You only write them up. Without team notes, lean on the talking points' proposed read.
Client-facing rules: say "we" and "you". No team member names, no internal ad codes or ad names with numbers (describe an ad by what it shows), no agency fees or costs of ours, never mention AI, no headers, no bullets, no markdown, no greeting or sign-off. Plain words a business owner reads once at speed. Name a number only when the sentence needs it, at most two per sentence, money with its currency symbol.
${RULES_NUMBERS}
Never mention another brand. American English. No em dashes or en dashes: use a comma, a colon or a period.`;

/** Strip what the client must never see from a model's text. */
export function cleanRead(text) {
  let t = String(text || '').replace(/\r/g, '');
  t = t.replace(/^\s*#+\s*/gm, '').replace(/\*\*?([^*\n]+)\*\*?/g, '$1').replace(/^\s*how we read it:?\s*$/gim, '');
  t = noDash(t).replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
  return t.slice(0, MAX_READ);
}

function parseJson(text) {
  const s = String(text || '');
  const a = s.indexOf('{'), b = s.lastIndexOf('}');
  if (a < 0 || b <= a) throw new Error('the talking points came back without JSON');
  const o = JSON.parse(s.slice(a, b + 1));
  /* Stored as {line, why}: why carries the proof number (the shape the v5 Reports page draws). */
  const points = (Array.isArray(o.points) ? o.points : []).map(p => typeof p === 'string' ? { line: noDash(p), why: null } : { line: noDash(p?.line || p?.text || ''), why: (p?.proof ?? p?.why ?? p?.number) != null ? noDash(String(p.proof ?? p.why ?? p.number)) : null }).filter(p => p.line).slice(0, 6);
  const questions = (Array.isArray(o.questions) ? o.questions : []).map(q => noDash(String(q || ''))).filter(Boolean).slice(0, 3);
  if (!points.length) throw new Error('the talking points came back empty');
  const proposed = o.proposed || o.proposed_read;
  return { points, questions, proposed: proposed ? cleanRead(proposed) : null };
}

/** Write (or rewrite) the talking points for one report from its frozen data. `d.claude(env, {system, user, maxTokens, model})`. */
export async function writePoints(env, d, acct, period, start, data, { steer } = {}) {
  const facts = readFacts(data);
  if (!facts) throw new Error('this report has no data');
  const text = await d.claude(env, { system: POINTS_SYSTEM, model: READ_MODEL, maxTokens: 3000,
    user: `The numbers (JSON):\n${JSON.stringify(facts)}${steer ? `\n\nDirection from the team for these points: ${String(steer).slice(0, 1000)}` : ''}` });
  const pts = parseJson(text);
  return upsertPoints(env, acct.act_id, period, start, pts);
}
async function upsertPoints(env, act, period, start, pts) {
  const prior = await readRow(env, act, period, start);
  const status = prior && (prior.status === 'drafted' || prior.status === 'approved') ? prior.status : 'points';
  return upsert(env, act, period, start, { points_json: JSON.stringify(pts), points_at: now(), status });
}

/** makeReport's hook: a (re)drafted report. New numbers make an approved read stale, so it drops back to a draft
 *  (its text kept) and must be approved again. Then the talking points. Throws the points' error to the caller, after
 *  the row is in a sane state. */
export async function reportDrafted(env, d, acct, period, start, data, { steer } = {}) {
  const prior = await readRow(env, acct.act_id, period, start);
  if (prior && prior.status === 'approved') {
    await upsert(env, acct.act_id, period, start, { status: 'drafted', draft: prior.read_text || prior.draft, read_text: null, approved_by: null, approved_at: null });
  }
  return writePoints(env, d, acct, period, start, data, { steer });
}

/** Write the read with the model. `notes` (non-empty string) becomes the team view; '' (typed) clears it; undefined
 *  uses the stored one. */
export async function draftRead(env, d, acct, period, start, { notes, source = 'typed', meeting_id = null, steer } = {}) {
  const rep = await env.DB.prepare(`SELECT status, data_json FROM reports WHERE act_id = ?1 AND period = ?2 AND period_start = ?3`).bind(acct.act_id, period, start).first();
  if (!rep) throw Object.assign(new Error('no report generated for that period yet'), { status: 404 });
  if (rep.status === 'sent') throw Object.assign(new Error('this report was already sent, so how we read it is frozen'), { status: 409 });
  const data = safe(rep.data_json, null);
  if (!data) throw Object.assign(new Error('this report has no data - regenerate it first'), { status: 400 });
  let row = await readRow(env, acct.act_id, period, start);
  const typed = typeof notes === 'string' ? notes.trim().slice(0, MAX_NOTES) : '';
  if (typed) row = await upsert(env, acct.act_id, period, start, { team_view: typed, team_source: source === 'meeting' ? 'meeting' : 'typed', meeting_id: source === 'meeting' ? (meeting_id || null) : null, status: row?.status || 'none' });
  /* An explicit empty string typed in Reports (the notes box emptied) clears the team view, so the team can write it
     again from the talking points alone. Absent notes (undefined) keep the stored view. */
  else if (typeof notes === 'string' && source !== 'meeting' && row?.team_view) row = await upsert(env, acct.act_id, period, start, { team_view: null, team_source: null, meeting_id: null, status: row?.status || 'none' });
  const view = row?.team_view || '';
  const pts = safe(row?.points_json, null);
  const facts = readFacts(data);
  const text = await d.claude(env, { system: READ_SYSTEM, model: READ_MODEL, maxTokens: 2500,
    user: `Brand: ${acct.name}. ${period === 'monthly' ? 'Monthly' : 'Weekly'} report, ${data.start} to ${data.end}.\n\nThe numbers (JSON):\n${JSON.stringify(facts)}\n\n`
      + (pts ? `Talking points the team prepared (team only, for context):\n${JSON.stringify(pts)}\n\n` : 'No talking points were written.\n\n')
      + (view ? `THE TEAM'S VIEW (${row.team_source === 'meeting' ? 'notes from the call' : 'notes the team added'}). Follow it; it is their read:\n${view}\n\n` : 'No notes from the team: lean on the proposed read in the talking points.\n\n')
      + (steer ? `Direction for this version (follow it, but never invent a number): ${String(steer).slice(0, 1000)}\n\n` : '')
      + 'Write "How we read it" now: the text only.' });
  const draft = cleanRead(text);
  if (!draft) throw new Error('the read came back empty');
  const out = await upsert(env, acct.act_id, period, start, { draft, draft_at: now(), status: 'drafted', read_text: null, approved_by: null, approved_at: null, edited_at: null });
  await clearSummary(env, acct.act_id, period, start);
  return out;
}
/* reports.summary IS the approved read; an unapproved one leaves it empty. */
const clearSummary = (env, act, period, start) => env.DB.prepare(`UPDATE reports SET summary = NULL WHERE act_id = ?1 AND period = ?2 AND period_start = ?3 AND status <> 'sent'`).bind(act, period, start).run();

/** A person's edit, kept as the draft (an approved read drops back to drafted until approved again). */
export async function saveEdit(env, act, period, start, text) {
  const t = cleanEdit(text);
  if (!t) throw Object.assign(new Error('How we read it cannot be empty.'), { status: 400 });
  const out = await upsert(env, act, period, start, { draft: t, draft_at: now(), status: 'drafted', read_text: null, approved_by: null, approved_at: null, edited_at: now() });
  await clearSummary(env, act, period, start);
  return out;
}
/* A person's own words: only the dashes go and the length is capped; line breaks are theirs. */
const cleanEdit = text => noDash(String(text ?? '').replace(/\r/g, '')).trim().slice(0, MAX_READ);

/** Approve: the read the client gets. Also reports.summary = the read, so every older surface shows it. */
export async function approveRead(env, act, period, start, text, who) {
  const prior = await readRow(env, act, period, start);
  const t = cleanEdit(text != null && String(text).trim() ? text : (prior?.draft || ''));
  if (!t) throw Object.assign(new Error('Write how we read it before approving it.'), { status: 400 });
  const row = await upsert(env, act, period, start, { draft: t, read_text: t, status: 'approved', approved_by: who || null, approved_at: now() });
  await env.DB.prepare(`UPDATE reports SET summary = ?4 WHERE act_id = ?1 AND period = ?2 AND period_start = ?3 AND status <> 'sent'`).bind(act, period, start, t).run();
  return row;
}

/* ---------- routes ---------- */
const READ_PATHS = new Set(['/api/report-read', '/api/report-read/points', '/api/report-read/draft', '/api/report-read/approve']);
export const isReportReadPath = p => READ_PATHS.has(p);

/** d = { json, acctOf, sessionEmail, clientScope, claude, sendReport(env, acct, period, start), slackSyncReport(env, acct, period, start) }.
 *  The caller has already passed the team gate (isAdmin); this refuses a client login again. */
export async function handleReportRead(request, env, path, url, d) {
  if (!READ_PATHS.has(path)) return null;
  const json = d.json;
  if (d.clientScope && d.clientScope(request)) return json({ error: 'forbidden' }, 403);
  const m = request.method;
  const b = m === 'GET' ? Object.fromEntries(url.searchParams) : await request.json().catch(() => ({}));
  const acct = await d.acctOf(env, b.act).catch(() => null);
  if (!acct) return json({ error: 'unknown account' }, 404);
  const period = b.period, start = b.start;
  if (!['weekly', 'monthly'].includes(period) || !isDate(start)) return json({ error: 'Say which report: period (weekly or monthly) and start (YYYY-MM-DD).' }, 400);
  const rep = await env.DB.prepare(`SELECT status FROM reports WHERE act_id = ?1 AND period = ?2 AND period_start = ?3`).bind(acct.act_id, period, start).first();
  if (m === 'GET' && path === '/api/report-read') {
    return json({ ...shapeRead(await readRow(env, acct.act_id, period, start)), report_status: rep?.status || null, link: readLink(acct.act_id) });
  }
  if (!rep) return json({ error: 'no report generated for that period yet' }, 404);
  if (rep.status === 'sent') return json({ error: 'This report was already sent, so how we read it is frozen.' }, 409);
  const sync = () => d.slackSyncReport ? d.slackSyncReport(env, acct, period, start).catch(() => {}) : null;
  const out = async (row, extra = {}) => { await sync(); return json({ ok: true, ...shapeRead(row), report_status: rep.status, ...extra }); };
  try {
    if (m === 'POST' && path === '/api/report-read/points') {
      const r = await env.DB.prepare(`SELECT data_json FROM reports WHERE act_id = ?1 AND period = ?2 AND period_start = ?3`).bind(acct.act_id, period, start).first();
      return out(await writePoints(env, d, acct, period, start, safe(r?.data_json, null)));
    }
    if (m === 'POST' && path === '/api/report-read/draft') {
      return out(await draftRead(env, d, acct, period, start, { notes: typeof b.notes === 'string' ? b.notes : undefined, source: 'typed' }));
    }
    if (m === 'PUT' && path === '/api/report-read') return out(await saveEdit(env, acct.act_id, period, start, b.text));
    if (m === 'POST' && path === '/api/report-read/approve') {
      const who = (await d.sessionEmail(env, request).catch(() => null)) || 'admin';
      const row = await approveRead(env, acct.act_id, period, start, b.text, who);
      if (!b.send) return out(row, { approved: true });
      try {
        const sent = await d.sendReport(env, acct, period, start);
        return json({ ok: true, approved: true, ...shapeRead(row), report_status: 'sent', sent });
      } catch (e) {
        /* The approval stays; the send's error comes back (200, so the page reads it as an answer, not a failure). */
        await sync();
        return json({ ok: false, approved: true, error: e.message, sent: { ok: false, error: e.message }, ...shapeRead(row), report_status: rep.status });
      }
    }
  } catch (e) {
    return json({ error: e.message }, e.status || 400);
  }
  return json({ error: 'not found' }, 404);
}

/* MEETING NOTES (2026-10-13). Fireflies transcript in, per-brand decisions and action items out, Cole confirms
 * on one screen, then Locus's own action items (actions.js), the client's weekly report and Requests.
 *
 * Cole, 2026-10-12: "I want there to be a note taker in the chat and then at the end of everything it notes the
 * action items... Locus can analyze the transcript and from there come up with its own action plans... we need to
 * determine what goes on the report client facing and then what goes into a task list internally."
 *
 * How a transcript gets here: Fireflies posts to the PUBLIC `/fireflies/webhook` when a transcription finishes
 * (set the URL in Fireflies > Settings > Developer settings; signed with `x-hub-signature` when a webhook secret
 * is set there and in FIREFLIES_WEBHOOK_SECRET), and the hourly `meetingsTick` polls the API for anything the
 * webhook missed (the first run looks back two days, never further). Both end in `ingest`.
 *
 * What the model is asked (Sonnet 5.5, about 5 cents an hour of call): the brands, the team's first names, the
 * meeting date; out comes a short summary, and per brand (or '' for the agency): decisions, items (team task /
 * what the client will hear / what the client owes us) with owner and due date, and the client-facing lines.
 * Nothing is written anywhere until a person presses Confirm in Locus (Work > Calls).
 *
 * On Confirm (2026-10-13, Cole: action items live in Locus, not Asana): team items become `p_action` rows
 * (actions.js; Work > Action items draws them, Slack reminds the owner the morning they are due); "this week"
 * lines land on the brand's open weekly report draft (`data_json.this_week` / `need_from_you`, rendered by the
 * report page and the client send); what the client owes becomes a Requests item of kind `ask` (the client marks
 * it done); and one message per brand goes to its internal channel, each item linked to its row in Locus. The
 * agency channel (strategistChannel) gets the agency-wide entry. Asana is not written any more.
 *
 * 2026-10-13 fourth pass (Work > Calls / Tasks / Production): every item carries an area (actions.js AREA_RULE) that
 * Tasks groups by; a Brief item becomes the Asana task AND its p_br_batch card at once (Production draws it; no p_action
 * row any more); each meeting in the list carries `made` (what the confirm wrote) and `counts` (what is waiting) for Calls.
 *
 * Table `p_meeting` (created on first use). Routes (admin, team only; not on brandguard CLIENT_RULES):
 *   GET  /api/meetings            the last 60 days + open action items per brand (from p_action)
 *   GET  /api/meetings?id=        one meeting with its notes
 *   GET  /api/meetings/monday     the Monday call screen
 *   POST /api/meetings/confirm    {id, summary, brands:[...]} the edited notes; applies the ticked items
 *   POST /api/meetings/done       {id, done} tick a p_action row (kept for the Monday page; same as /api/actions/done)
 *   POST /api/meetings/add        {act, text, owner, due, source} a p_action row (kept for older callers)
 *   POST /api/meetings/theme      {text} the week's theme
 *   POST /api/meetings/skip       {id}
 *   POST /api/meetings/ingest     {id} re-read one Fireflies transcript (or read one the poll missed)
 *   POST /api/meetings/poll       check Fireflies now
 */
import { addAction, markDone, openItems as openActionItems, ROSTER, AREAS, AREA_RULE } from './actions.js';
import { briefFor, ensureBoard } from './asana-brand.js';
import { nextNumber } from './ideas.js';
import { numOf } from './asana-brand.js';
import { teamPost, tagOf, loadCard } from './morningcard.js';
import { typedOnCall } from './callscreen.js';

const MODEL = 'claude-sonnet-5-5';
const FF = 'https://api.fireflies.ai/graphql';
const LOCUS = 'https://tools.go-mobius-digital.com/profit/';
const MAX_CHARS = 140000;          // about 35k tokens of transcript; longer calls are thinned evenly
const LOOKBACK_DAYS = 2;           // the first poll ever looks back this far, never further

const SQL = [
  `CREATE TABLE IF NOT EXISTS p_meeting (
    id            TEXT PRIMARY KEY,
    title         TEXT,
    date          TEXT,
    at            TEXT,
    duration      REAL,
    organizer     TEXT,
    attendees_json TEXT,
    chars         INTEGER,
    kind          TEXT,
    notes_json    TEXT,
    status        TEXT NOT NULL DEFAULT 'new',
    error         TEXT,
    cost          REAL DEFAULT 0,
    confirmed_by  TEXT,
    confirmed_at  TEXT,
    result_json   TEXT,
    created_at    TEXT NOT NULL,
    updated_at    TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS p_meeting_date ON p_meeting (date DESC)`,
];
let ensured = false;
export async function ensureMeetings(env) { return ensure(env); }
async function ensure(env) { if (ensured) return; for (const s of SQL) await env.DB.prepare(s).run(); ensured = true; }

const safe = (s, d) => { try { return s == null ? d : JSON.parse(s); } catch { return d; } };
const now = () => new Date().toISOString();
const clean = (s, n) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, n);
const ymd = d => new Date(d).toISOString().slice(0, 10);
const sEsc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
async function getSetting(env, k) { const r = await env.DB.prepare(`SELECT value FROM settings WHERE key = ?1`).bind(k).first().catch(() => null); return r?.value ?? null; }
async function putSetting(env, k, v) { await env.DB.prepare(`INSERT INTO settings (key, value) VALUES (?1, ?2) ON CONFLICT(key) DO UPDATE SET value = excluded.value`).bind(k, String(v)).run(); }

/* ---------- Fireflies ---------- */
async function ff(env, d, query, variables) {
  if (!env.FIREFLIES_API_KEY) throw new Error('FIREFLIES_API_KEY is not set on the worker.');
  const r = await d.xfetch(FF, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${env.FIREFLIES_API_KEY}` }, body: JSON.stringify({ query, variables }) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j.errors?.length) throw new Error(`Fireflies: ${j.errors?.[0]?.message || r.status}`);
  return j.data;
}
const Q_LIST = `query L($from: DateTime, $limit: Int) { transcripts(fromDate: $from, limit: $limit) { id title date duration organizer_email } }`;
const Q_ONE = `query T($id: String!) { transcript(id: $id) { id title date duration organizer_email participants meeting_attendees { displayName email } sentences { speaker_name text start_time } } }`;

/** The transcript as "[m:ss] Name: words", thinned evenly when a call runs past MAX_CHARS. */
function transcriptText(sentences) {
  const lines = (sentences || []).map(s => `[${Math.floor((s.start_time || 0) / 60)}:${String(Math.floor((s.start_time || 0) % 60)).padStart(2, '0')}] ${s.speaker_name || 'Someone'}: ${String(s.text || '').trim()}`);
  let text = lines.join('\n');
  if (text.length <= MAX_CHARS) return { text, thinned: false };
  const keep = Math.max(1, Math.floor(lines.length * (MAX_CHARS / text.length)));
  const step = lines.length / keep;
  const out = [];
  for (let i = 0; i < keep; i++) out.push(lines[Math.floor(i * step)]);
  text = out.join('\n');
  return { text, thinned: true };
}

/* ---------- the extraction ---------- */
const S = { type: 'string' };
const arr = items => ({ type: 'array', items });
const obj = p => ({ type: 'object', properties: p, required: Object.keys(p), additionalProperties: false });
const SCHEMA = obj({
  kind: { type: 'string', enum: ['monday_call', 'client_call', 'kickoff', 'internal', 'other'] },
  summary: S,
  brands: arr(obj({
    brand_id: S,
    decisions: arr(S),
    items: arr(obj({ text: S, detail: S, owner: S, due: S, kind: { type: 'string', enum: ['team', 'brief', 'client', 'client_owes'] }, area: { type: 'string', enum: [...AREAS, ''] }, sure: { type: 'boolean' }, quote: S, at: S })),
    this_week: arr(S),
    need_from_client: arr(S),
  })),
});

function systemFor(brands, team, meetingDate) {
  const d = new Date(meetingDate + 'T12:00:00Z');
  const dow = d.getUTCDay();
  const nextMon = new Date(d); nextMon.setUTCDate(d.getUTCDate() + ((8 - dow) % 7 || 7));
  const fri = new Date(d); fri.setUTCDate(d.getUTCDate() + ((5 - dow + 7) % 7));
  return `You turn a Mobius Digital meeting transcript into notes the team and the clients act on. Plain English, like a person wrote it. No em dashes.

THE BRANDS (use the id; '' means agency-wide or no brand):
${brands.map(b => `- ${b.act_id}: ${b.name}`).join('\n')}

THE TEAM (owners are first names from this list, or '' when nobody was named): ${team.join(', ')}.
Ahsan and Noma are strategists, William designs, Ravo edits video, Radhesh runs Google, Hamza runs Amazon, Cole owns the agency. Clients are everyone else on the call.

THE MEETING WAS ON ${meetingDate} (a ${['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][dow]}). "Tomorrow", "Thursday", "end of week", "next Monday" become dates: this Friday is ${ymd(fri)}, next Monday is ${ymd(nextMon)}. No date said = ''.

WHAT TO WRITE
- summary: 3 to 5 sentences on what was decided, for someone who was not there.
- kind: monday_call (the team's weekly call across brands), client_call (one brand, the client on the call), kickoff (a creative brief kickoff), internal, other.
- For every brand that was discussed, one entry. Agency-wide points (every brand must do X) go in a '' entry AND are repeated for each brand they apply to, because each brand's channel reads only its own entry.
- decisions: what was agreed, one line each. Not the discussion, the outcome.
- items: ONLY real commitments: a named person (or clearly the team) said they WILL do one specific thing. The bar is high
  (2026-10-20: a Monday call came back with 28 items and the reviewer threw the whole call away). NOT an item: an idea, a
  "we should", "look into", "review", "think about", "keep an eye on", a recurring job (checking the account, posting the
  plan, making the week's ads), a question, or the discussion itself. Those are decisions, or nothing. A Monday call across
  many brands usually has 0 to 3 items per brand; a client call 2 to 5. Never more than 6 per brand. When in doubt, leave it out.
  Each item has: text = a SHORT title, verb first, at most 8 words, no brand name, no owner, no date, specific enough to tick
  off ("Raise Prospecting 1 to $400/day", "Send Rob the competitor page examples"). detail = what the title leaves out
  (the numbers, the names, the why, what exactly) in one or two plain sentences; '' when the title says it all. sure = true
  when the person AND the thing were both said out loud; false when either is implied (it sounds like a job but nobody took
  it, or you are guessing who). The reviewer sees sure items ticked and unsure ones unticked.
  Each has a kind:
  team = a task for someone on the team (owner, due).
  brief = new ads someone agreed to make (a batch, iterations of a winner, a new angle). The text says what to make in one line ("3 new hooks on the Burgundy launch video"); owner = the strategist who writes the brief. It becomes a numbered brief in Asana.
  client = something the client should hear we are doing this week (no owner needed).
  client_owes = something the client has to give or decide (photos, an offer, an approval).
  Every team item also gets an ${AREA_RULE.replace(/^area = /, 'area: ')} Other kinds: area ''.
- this_week: 2 to 4 lines the client reads in their weekly report under "This week". Say what we are doing and why, in the client's words. Never a team member's name, never a cost, never another brand, never "the AI".
- need_from_client: what we are waiting on from them, one line each, polite and specific. Empty when nothing.
- For every item, quote: the words that created it, VERBATIM from the transcript, at most 25 words; at: its [m:ss] mark (just m:ss). They let the reviewer check an item without rereading the call.
- Do not invent. If the call never touched a brand, leave it out. Dedupe: one item per commitment, even if it was said three times.`;
}

async function extract(env, d, m, text) {
  const brands = await d.listBrands(env);
  const team = ['Cole', 'Ahsan', 'Noma', 'William', 'Ravo', 'Radhesh', 'Hamza'];
  const system = systemFor(brands, team, m.date);
  /* 2026-10-19: a call run on a Locus call screen was typed live and already sent where it lives. The read of the same
     call returns only what was said and NOT typed ("Also said on the call"); nothing new = no card. */
  const typed = await typedOnCall(env, m.date);
  const typedBlock = typed.length ? `\n\nALREADY TYPED ON A LOCUS CALL SCREEN THAT DAY (already on the list, in Asana and in Requests). If this transcript is that call, return ONLY commitments that are NOT in this list (the same task in other words counts as typed). If everything was typed, return brands: []. If this transcript is a different call, ignore this list.\n${typed.slice(0, 200).map(x => `- ${x}`).join('\n')}` : '';
  const user = `MEETING: ${m.title || 'Untitled'} (${m.date}, ${Math.round(m.duration || 0)} min)\nATTENDEES: ${(m.attendees || []).map(a => a.displayName || a.email).filter(Boolean).join(', ') || 'unknown'}${typedBlock}\n\nTRANSCRIPT:\n${text}`;
  const r = await d.xfetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({ model: MODEL, max_tokens: 12000, system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }], thinking: { type: 'adaptive' }, output_config: { effort: 'medium', format: { type: 'json_schema', schema: SCHEMA } }, messages: [{ role: 'user', content: user }] }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error?.message || `Claude HTTP ${r.status}`);
  const out = safe((j.content || []).filter(b => b.type === 'text').map(b => b.text).join(''), null);
  if (!out) throw new Error('The notes came back empty.');
  const u = j.usage || {};
  const cost = ((u.input_tokens || 0) * 3 + (u.cache_creation_input_tokens || 0) * 3.75 + (u.cache_read_input_tokens || 0) * 0.3 + (u.output_tokens || 0) * 15) / 1e6;
  const ids = new Set(brands.map(b => b.act_id));
  out.brands = (out.brands || []).filter(b => b.brand_id === '' || ids.has(b.brand_id)).map(b => ({
    brand_id: b.brand_id, decisions: (b.decisions || []).map(x => clean(x, 300)).filter(Boolean),
    items: (b.items || []).map(i => ({ text: clean(i.text, 300), detail: clean(i.detail, 1000), owner: clean(i.owner, 40), due: /^\d{4}-\d{2}-\d{2}$/.test(i.due || '') ? i.due : '', kind: KINDS.includes(i.kind) ? i.kind : 'team', area: AREAS.includes(i.area) ? i.area : '', sure: i.sure !== false, quote: clean(i.quote, 240), at: /^\d{1,3}:\d{2}$/.test(i.at || '') ? i.at : '' })).filter(i => i.text).slice(0, 6),
    this_week: (b.this_week || []).map(x => clean(x, 300)).filter(Boolean).slice(0, 6),
    need_from_client: (b.need_from_client || []).map(x => clean(x, 300)).filter(Boolean).slice(0, 6),
  }));
  if (typed.length) out.also_said = true;
  return { notes: out, cost };
}

/* ---------- ingest one transcript ---------- */
export async function ingest(env, d, id, { force = false } = {}) {
  await ensure(env);
  const prior = await env.DB.prepare(`SELECT status FROM p_meeting WHERE id = ?1`).bind(id).first().catch(() => null);
  if (prior && !force && prior.status !== 'new' && prior.status !== 'error') return { id, already: prior.status };
  const t = (await ff(env, d, Q_ONE, { id })).transcript;
  if (!t) throw new Error('Fireflies has no transcript with that id.');
  const at = t.date ? new Date(+t.date).toISOString() : now();
  const m = { id: t.id, title: clean(t.title, 200), date: at.slice(0, 10), at, duration: t.duration || null, organizer: t.organizer_email || null, attendees: (t.meeting_attendees || []).map(a => ({ displayName: a.displayName || '', email: a.email || '' })) };
  const { text, thinned } = transcriptText(t.sentences);
  await env.DB.prepare(`INSERT INTO p_meeting (id, title, date, at, duration, organizer, attendees_json, chars, status, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, 'new', ?9, ?9)
    ON CONFLICT(id) DO UPDATE SET title = excluded.title, date = excluded.date, at = excluded.at, duration = excluded.duration, organizer = excluded.organizer, attendees_json = excluded.attendees_json, chars = excluded.chars, status = 'new', error = NULL, updated_at = excluded.updated_at`)
    .bind(m.id, m.title, m.date, m.at, m.duration, m.organizer, JSON.stringify(m.attendees), text.length, now()).run();
  if (text.length < 400) {
    await env.DB.prepare(`UPDATE p_meeting SET status = 'skipped', error = 'too short to hold decisions', updated_at = ?2 WHERE id = ?1`).bind(m.id, now()).run();
    return { id: m.id, skipped: 'too short' };
  }
  try {
    const { notes, cost } = await extract(env, d, m, text);
    if (thinned) notes.summary = `${notes.summary} (A long call: the transcript was thinned before reading.)`;
    /* A call typed live on a Locus call screen: only what was missed comes back; nothing missed = nothing to approve. */
    if (notes.also_said) {
      const n = notes.brands.reduce((k, b) => k + b.items.length + b.this_week.length + b.need_from_client.length, 0);
      if (!n) {
        await env.DB.prepare(`UPDATE p_meeting SET kind = ?2, notes_json = ?3, status = 'skipped', error = 'everything said was typed on the call screen', cost = ?4, updated_at = ?5 WHERE id = ?1`).bind(m.id, notes.kind || 'other', JSON.stringify(notes), cost, now()).run();
        return { id: m.id, skipped: 'all typed', cost };
      }
      notes.summary = `Also said on the call, not typed: ${notes.summary}`;
    }
    await env.DB.prepare(`UPDATE p_meeting SET kind = ?2, notes_json = ?3, status = 'extracted', cost = ?4, updated_at = ?5 WHERE id = ?1`).bind(m.id, notes.kind || 'other', JSON.stringify(notes), cost, now()).run();
    await tellReady(env, d, m, notes).catch(() => {});
    return { id: m.id, ok: true, kind: notes.kind, brands: notes.brands.length, items: notes.brands.reduce((n, b) => n + b.items.length, 0), cost };
  } catch (e) {
    await env.DB.prepare(`UPDATE p_meeting SET status = 'error', error = ?2, updated_at = ?3 WHERE id = ?1`).bind(m.id, clean(e.message, 400), now()).run();
    throw e;
  }
}

async function tellReady(env, d, m, notes) {
  const ch = await getSetting(env, 'strategistChannel');
  if (!ch) return;
  const items = notes.brands.reduce((n, b) => n + b.items.length, 0);
  const names = notes.brands.filter(b => b.brand_id).length;
  const line = `*Notes from "${sEsc(m.title)}" are ready to confirm.* ${items} item${items === 1 ? '' : 's'} across ${names} brand${names === 1 ? '' : 's'}. Nothing is on the list or with a client until you confirm.`;
  await d.slackPost(env, ch, line, [{ type: 'section', text: { type: 'mrkdwn', text: line } },
    { type: 'actions', elements: [{ type: 'button', text: { type: 'plain_text', text: 'Open in Locus' }, url: `${LOCUS}?open=calls&meeting=${encodeURIComponent(m.id)}` }] }], { username: 'Locus' });
}

/* ---------- the hourly poll and the webhook ---------- */
export async function meetingsTick(env, d) {
  if (!env.FIREFLIES_API_KEY) return { skipped: 'no FIREFLIES_API_KEY' };
  if (!d.canAfford(60)) return { deferred: 'budget' };
  await ensure(env);
  const since = (await getSetting(env, 'meetingsSince')) || new Date(Date.now() - LOOKBACK_DAYS * 864e5).toISOString();
  const list = (await ff(env, d, Q_LIST, { from: since, limit: 25 })).transcripts || [];
  const out = { seen: list.length, read: [], errors: [] };
  let newest = since;
  for (const t of list) {
    const at = t.date ? new Date(+t.date).toISOString() : null;
    if (at && at > newest) newest = at;
    const have = await env.DB.prepare(`SELECT status FROM p_meeting WHERE id = ?1`).bind(t.id).first().catch(() => null);
    if (have && have.status !== 'new') continue;
    if (out.read.length >= 2) { out.deferred = 'two a tick'; break; }
    if (!d.canAfford(40)) { out.deferred = 'budget'; break; }
    try { out.read.push(await ingest(env, d, t.id)); }
    catch (e) { out.errors.push({ id: t.id, error: e.message }); }
  }
  /* The cursor moves only when everything listed was dealt with, so a deferred call is listed again next hour. */
  if (!out.deferred && !out.errors.length) await putSetting(env, 'meetingsSince', new Date(Date.parse(newest) - 60e3).toISOString());
  return out;
}

async function hmacOk(secret, body, header) {
  if (!secret) return true;
  const sig = String(header || '').replace(/^sha256=/, '');
  if (!sig) return false;
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const mac = Array.from(new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(body)))).map(b => b.toString(16).padStart(2, '0')).join('');
  if (mac.length !== sig.length) return false;
  let diff = 0; for (let i = 0; i < mac.length; i++) diff |= mac.charCodeAt(i) ^ sig.charCodeAt(i);
  return diff === 0;
}
/** Fireflies' webhook: {meetingId, eventType}. Answers at once; the read runs after. A forged call can only make
 *  the worker read a transcript that exists on our own Fireflies account, so without a secret it still only
 *  costs a fetch. */
export async function handleFirefliesHook(request, env, ctx, d, json) {
  const body = await request.text().catch(() => '');
  if (!(await hmacOk(env.FIREFLIES_WEBHOOK_SECRET, body, request.headers.get('x-hub-signature')))) return json({ error: 'bad signature' }, 401);
  const b = safe(body, {}) || {};
  const id = String(b.meetingId || b.meeting_id || '').trim();
  const ev = String(b.eventType || b.event_type || '');
  if (!id) return json({ ok: true, ignored: 'no meetingId' });
  if (ev && !/transcription completed/i.test(ev)) return json({ ok: true, ignored: ev });
  ctx.waitUntil(ingest(env, d, id).catch(e => console.log('fireflies ingest: ' + e.message)));
  return json({ ok: true, queued: id });
}

/* ---------- confirm: write the ticked items where they live ---------- */
const KINDS = ['team', 'brief', 'client', 'client_owes'];
/** A Brief item -> the next numbered task in the brand's Creative Brief section, the team's template underneath a line
 *  that says where it came from (the call `m`, or Production's "+ New brief" when m is null). Assigned by the roster email,
 *  then by first name. The p_br_batch card is written at once (the hourly sync matches it by number), so Production shows
 *  it before Asana is read again. Returns {num, gid, url, id}. */
/** A numbered brief: its card on Production at once, its Asana task in Creative Brief(s) after. From a call's confirm
 *  the Asana half is awaited (the card is dropped again when Asana refuses, so confirm's "task to write one" fallback
 *  still fires); Production's New brief answers as soon as the card exists and runs the Asana half in waitUntil
 *  (2026-10-14, Cole: "it takes a long time if I want to do a new brief"). */
export async function makeBrief(env, d, act, it, m, who, { later = null } = {}) {
  const doc = safe((await env.DB.prepare(`SELECT data_json FROM p_br_doc WHERE act_id = ?1 AND line_id = '' AND key = 'asana'`).bind(act).first().catch(() => null))?.data_json, null);
  if (!doc?.project_gid) throw new Error('not connected to Asana');
  await ensureBoard(env);
  const max = (await env.DB.prepare(`SELECT MAX(CAST(num AS INTEGER)) AS n FROM p_br_batch WHERE act_id = ?1`).bind(act).first().catch(() => null))?.n || 0;
  const num = max + 1;
  const id = crypto.randomUUID().replace(/-/g, '').slice(0, 16);
  await env.DB.prepare(`INSERT INTO p_br_batch (id, act_id, num, title, stage, assignee_name, due_on, board_stage, board_at, source, created_at)
    VALUES (?1, ?2, ?3, ?4, 'idea', ?5, ?6, 'brief', datetime('now'), ?7, datetime('now'))`)
    .bind(id, act, String(num), clean(it.text, 300), it.owner ? clean(it.owner, 40) : null, it.due || null, m ? 'meeting' : 'locus').run();
  const row = { id, num };
  if (later) {
    later(briefToAsana(env, d, act, doc, row, it, m, who).catch(e => console.log(`brief #${num} to Asana: ${e.message}`)));
    return { num, id, url: null, gid: null, asana_later: true };
  }
  try { const a = await briefToAsana(env, d, act, doc, row, it, m, who); return { num, gid: a.gid, url: a.url, id }; }
  catch (e) { await env.DB.prepare(`DELETE FROM p_br_batch WHERE id = ?1`).bind(id).run().catch(() => {}); throw e; }
}
/** The Asana user for a team member's first name (the roster's email first, then a name that starts the same). */
export async function asanaUserFor(env, d, doc, name) {
  if (!name || !doc || !doc.workspace || !d.asanaAll) return null;
  const users = (await d.asanaAll(env, `/users?workspace=${doc.workspace}&opt_fields=name,email`).catch(() => [])) || [];
  const w = String(name).toLowerCase(), mail = (ROSTER.find(x => x.name.toLowerCase() === w) || {}).email;
  return (mail && users.find(u => String(u.email || '').toLowerCase() === mail)) || users.find(u => String(u.name || '').toLowerCase().startsWith(w)) || null;
}
/** The Asana half: the numbered task (the number moves up when Asana already has a newer one), its section and
 *  assignee, then the card row is linked to it. */
async function briefToAsana(env, d, act, doc, row, it, m, who) {
  const secs = (await d.asana(env, `/projects/${doc.project_gid}/sections?opt_fields=name`).catch(() => [])) || [];
  const sec = secs.find(s => /creative\s*brief/i.test(s.name)) || secs.find(s => /brief/i.test(s.name));
  if (!sec) throw new Error('no Creative Brief section');
  let num = +row.num;
  const since = new Date(Date.now() - 3 * 864e5).toISOString();
  const recent = await d.asana(env, `/tasks?project=${doc.project_gid}&modified_since=${encodeURIComponent(since)}&opt_fields=name&limit=100`).catch(() => []);
  const top = Math.max(0, ...(Array.isArray(recent) ? recent : []).map(t => +numOf(t.name) || 0));
  if (top >= num) { num = top + 1; await env.DB.prepare(`UPDATE p_br_batch SET num = ?2 WHERE id = ?1`).bind(row.id, String(num)).run(); }
  const assignee = await asanaUserFor(env, d, doc, it.owner);
  const from = m ? `<em>From the "${sEsc(m.title || 'call')}" call on ${m.date}: ${sEsc(it.text)}.${it.detail ? ` ${sEsc(it.detail)}` : ''} Confirmed by ${sEsc(who)} in Locus.</em>\n` : `<em>Added in Locus Production by ${sEsc(who)}.</em>\n${it.detail ? `${sEsc(it.detail).replace(/\n/g, '<br>')}\n` : ''}`;
  const html = briefFor(it.text).replace('<body>', `<body>${from}`);
  const t = await d.asana(env, '/tasks?opt_fields=name,permalink_url', { method: 'POST', body: { name: `${num} - ${clean(it.text, 120)}`, projects: [doc.project_gid], html_notes: html, ...(assignee ? { assignee: assignee.gid } : {}), ...(it.due ? { due_on: it.due } : {}) } });
  await d.asana(env, `/sections/${sec.gid}/addTask`, { method: 'POST', body: { task: t.gid } }).catch(() => {});
  const url = t.permalink_url || `https://app.asana.com/0/${doc.project_gid}/${t.gid}`;
  await env.DB.prepare(`UPDATE p_br_batch SET asana_gid = ?2, asana_url = ?3, asana_section = ?4, assignee_gid = COALESCE(?5, assignee_gid), assignee_name = COALESCE(?6, assignee_name) WHERE id = ?1`)
    .bind(row.id, t.gid, url, clean(sec.name, 80), assignee?.gid || null, assignee?.name || null).run().catch(e => console.log('brief card link: ' + e.message));
  return { gid: t.gid, url };
}
/** The brand's open weekly report draft, if the week's draft exists (drafted Monday 6am, sent after the call). */
async function openWeekly(env, act) {
  return env.DB.prepare(`SELECT act_id, period, period_start, data_json, status FROM reports WHERE act_id = ?1 AND period = 'weekly' AND status IN ('draft', 'handled') ORDER BY period_start DESC LIMIT 1`).bind(act).first().catch(() => null);
}

export async function confirm(env, d, body, who) {
  await ensure(env);
  const m = await env.DB.prepare(`SELECT * FROM p_meeting WHERE id = ?1`).bind(String(body.id || '')).first();
  if (!m) throw Object.assign(new Error('No such meeting.'), { status: 404 });
  if (m.status === 'confirmed') throw Object.assign(new Error('Already confirmed.'), { status: 400 });
  const brands = await d.listBrands(env);
  const nameOf = id => brands.find(b => b.act_id === id)?.name || id;
  const chanOf = id => brands.find(b => b.act_id === id)?.slack_channel || null;
  const notes = { kind: m.kind, summary: clean(body.summary, 2000), brands: [] };
  const result = { brands: [], agency: null, warnings: [] };
  for (const raw of (Array.isArray(body.brands) ? body.brands : [])) {
    const act = String(raw.brand_id || '');
    if (act && !brands.some(b => b.act_id === act)) continue;
    const b = {
      brand_id: act, decisions: (raw.decisions || []).map(x => clean(x, 300)).filter(Boolean),
      items: (raw.items || []).filter(i => i && i.on !== false).map(i => ({ text: clean(i.text, 300), detail: clean(i.detail, 2000), owner: clean(i.owner, 40), due: /^\d{4}-\d{2}-\d{2}$/.test(i.due || '') ? i.due : '', kind: KINDS.includes(i.kind) ? i.kind : 'team', area: AREAS.includes(i.area) ? i.area : '' })).filter(i => i.text),
      this_week: (raw.this_week || []).map(x => clean(x, 300)).filter(Boolean).slice(0, 6),
      need_from_client: (raw.need_from_client || []).map(x => clean(x, 300)).filter(Boolean).slice(0, 6),
    };
    if (!b.decisions.length && !b.items.length && !b.this_week.length && !b.need_from_client.length) continue;
    notes.brands.push(b);
    const r = { brand_id: act, name: act ? nameOf(act) : 'Agency', tasks: [], briefs: [], asks: [], report: null, slack: false };
    /* 1. Team items -> Locus action items (p_action). Nothing goes to Asana. */
    for (const it of b.items.filter(i => i.kind === 'team')) {
      try { const row = await addAction(env, { act, text: it.text, detail: it.detail, owner: it.owner, due: it.due, kind: 'team', area: it.area, source: 'meeting', source_id: m.id, created_by: who }); r.tasks.push({ ...it, id: row.id, url: row.url, assigned: !!row.owner }); }
      catch (e) { r.tasks.push({ ...it, error: e.message }); result.warnings.push(`${r.name}: "${it.text}" was not added (${e.message}).`); }
    }
    /* 1b. Briefs -> a numbered task in the brand's Asana Creative Brief section (the team's template) and its card on
       Production (makeBrief writes both). When no brief can be made (no brand, no Asana) it becomes a task to write one,
       so it is never lost. */
    for (const it of b.items.filter(i => i.kind === 'brief')) {
      let made = null, why = act ? '' : 'no brand';
      if (act) { try { made = await makeBrief(env, d, act, it, m, who); } catch (e) { why = e.message; } }
      if (made) { r.briefs.push({ ...it, id: made.id, num: made.num, url: `${LOCUS}?open=production&act=${encodeURIComponent(act)}`, asana_url: made.url }); continue; }
      try { const row = await addAction(env, { act, text: `Write a brief: ${it.text}`, detail: it.detail, owner: it.owner, due: it.due, kind: 'team', area: 'ads', source: 'meeting', source_id: m.id, created_by: who });
        r.tasks.push({ ...it, kind: 'team', id: row.id, url: row.url, assigned: !!row.owner }); result.warnings.push(`${r.name}: the brief "${it.text}" was not made in Asana (${why}). It is a task to write it.`); }
      catch (e) { r.briefs.push({ ...it, error: e.message }); }
    }
    /* 2. What the client hears -> the open weekly draft. */
    if (act && (b.this_week.length || b.need_from_client.length)) {
      const rep = await openWeekly(env, act);
      if (rep) {
        const data = safe(rep.data_json, {}) || {};
        data.this_week = b.this_week; data.need_from_you = b.need_from_client; data.this_week_from = { meeting: m.id, title: m.title, at: now() };
        await env.DB.prepare(`UPDATE reports SET data_json = ?4 WHERE act_id = ?1 AND period = ?2 AND period_start = ?3`).bind(rep.act_id, rep.period, rep.period_start, JSON.stringify(data)).run();
        r.report = { period_start: rep.period_start, status: rep.status };
        /* 2026-10-19 (the reporting audit): the weekly goes to the client WHEN THE CALL IS CONFIRMED, not at 6am. A brand
           that does not review first sends now, This week included; a review-first brand gets its draft card redrawn so
           the Send button carries the new text, and a person presses it. */
        const brand = brands.find(x => x.act_id === act);
        if (d.sendReport && rep.status === 'draft' && brand && brand.brief_channel && !brand.review_first) {
          try { const sent = await d.sendReport(env, act, rep.period_start); r.report.sent = true; r.report.channel = sent?.channel || null; }
          catch (e) { result.warnings.push(`${r.name}: the weekly report did not send (${e.message}). Send it from Reports.`); if (d.slackSyncReport) await d.slackSyncReport(env, act, rep.period_start).catch(() => {}); }
        } else if (d.slackSyncReport) await d.slackSyncReport(env, act, rep.period_start).catch(() => {});
      } else result.warnings.push(`${r.name}: no weekly report draft is open, so "This week" was not added to a report. It is in the Slack note.`);
    }
    /* 3. What the client owes -> a Requests item the client ticks off. */
    if (act) for (const it of b.items.filter(i => i.kind === 'client_owes')) {
      try { r.asks.push({ ...it, id: await d.createAsk(env, act, it.text, `Agreed on ${m.date}${m.title ? ` (${m.title})` : ''}.${it.due ? ` Needed by ${it.due}.` : ''}`, who) }); }
      catch (e) { r.asks.push({ ...it, error: e.message }); }
    }
    /* 4. One note per brand in its internal channel; agency-wide to the Strategist channel. */
    const ch = act ? chanOf(act) : await getSetting(env, 'strategistChannel');
    if (ch) {
      /* 2026-10-20 (the tasks audit; Cole: the post after a call is "so weird", nobody reads a five-section note): ONE short
         reply. What the call made, as counts with the owners tagged, up to three decisions, and the link. The tasks
         themselves are not repeated here: each owner's land on the morning card the day they are due, and the whole call
         is one click away in Locus. */
      const made = [];
      const okTasks = r.tasks.filter(t => !t.error), okBriefs = r.briefs.filter(t => !t.error), okAsks = r.asks.filter(t => !t.error);
      const owners = [...new Set(okTasks.concat(okBriefs).map(t => t.owner).filter(Boolean))];
      const tagMap = {};
      if (act) for (const o of owners) tagMap[o] = await tagOf(env, d, o).catch(() => null);
      const byOwner = owners.map(o => { const n = okTasks.filter(t => t.owner === o).length + okBriefs.filter(t => t.owner === o).length; return `${tagMap[o] || sEsc(o)} ${n}`; });
      if (okTasks.length) made.push(`${okTasks.length} task${okTasks.length === 1 ? '' : 's'}`);
      if (okBriefs.length) made.push(`${okBriefs.length} brief${okBriefs.length === 1 ? '' : 's'}`);
      if (okAsks.length) made.push(`${okAsks.length} ask${okAsks.length === 1 ? '' : 's'} for the client`);
      if (r.report) made.push('the weekly report updated');
      const L = [`*From the "${sEsc(m.title)}" call* (${m.date})${act ? '' : ' · agency-wide'}: ${made.length ? made.join(', ') : 'notes filed'}${byOwner.length ? ` (${byOwner.join(', ')})` : ''}.`];
      if (b.decisions.length) L.push(...b.decisions.slice(0, 3).map(x => `• ${sEsc(x)}`));
      if (b.decisions.length > 3) L.push(`_and ${b.decisions.length - 3} more decided, in Locus_`);
      const text = L.join('\n');
      const tags = Object.values(tagMap).filter(Boolean).join(' ');
      try { await teamPost(env, d, ch, text, [{ type: 'section', text: { type: 'mrkdwn', text: text.slice(0, 2900) } }, { type: 'actions', elements: [{ type: 'button', text: { type: 'plain_text', text: 'Open in Locus' }, url: `${LOCUS}?open=calls&meeting=${encodeURIComponent(m.id)}` }] }], { username: 'Locus', tag: tags || null }); r.slack = true; }
      catch (e) { result.warnings.push(`${r.name}: the Slack note failed (${e.message}).`); }
    }
    if (act) result.brands.push(r); else result.agency = r;
  }
  await env.DB.prepare(`UPDATE p_meeting SET notes_json = ?2, result_json = ?3, status = 'confirmed', confirmed_by = ?4, confirmed_at = ?5, updated_at = ?5 WHERE id = ?1`)
    .bind(m.id, JSON.stringify(notes), JSON.stringify(result), who, now()).run();
  return result;
}

/* ---------- open action items, for the next call: p_action rows grouped per brand (actions.js) ---------- */
export async function openItems(env, d) { return openActionItems(env, d); }

/* ---------- the Monday call screen (Reports > Monday) ----------
 * Per brand, the four things the call walks through: last week's items (open p_action rows), the read (the
 * weekly report draft's numbers and summary), the plan (the strategist's reply under the weekly report card in
 * Slack, read from the Slack index), new items (added as p_action rows from the page). The agency-wide theme
 * for the week is one settings row. Brands are ordered on the page by the command center's severity. */
const mondayOf = ymd => { const d = new Date(ymd + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7)); return d.toISOString().slice(0, 10); };
export async function mondayScreen(env, d) {
  const brands = await d.listBrands(env);
  const today = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Chicago' })).toISOString().slice(0, 10);
  const monday = mondayOf(today);
  const open = await openItems(env, d).catch(() => []);
  const theme = safe(await getSetting(env, 'mondayTheme'), null);
  /* Every brand at once (2026-10-19: the call screen loads it; one brand at a time took ~7s). Order is kept. */
  const out = await Promise.all(brands.map(async b => {
    const rep = await env.DB.prepare(`SELECT period, period_start, period_end, status, summary, data_json, slack_ts, slack_channel, sent_at FROM reports WHERE act_id = ?1 AND period = 'weekly' ORDER BY period_start DESC LIMIT 1`).bind(b.act_id).first().catch(() => null);
    let report = null, thread = [];
    if (rep) {
      const data = safe(rep.data_json, {}) || {};
      const t = data.totals || {}, f = data.forecast || {}, p = data.previous || {};
      report = { period_start: rep.period_start, period_end: rep.period_end, status: rep.status, sent_at: rep.sent_at || null, summary: String(rep.summary || '').slice(0, 2500),
        totals: { sales: t.sales ?? null, spend: t.spend ?? null, mer: t.mer ?? null, cm: t.cm ?? null }, plan: { sales: f.sales ?? null, spend: f.spend ?? null, mer: f.mer ?? null }, prior: { sales: p.sales ?? null, spend: p.spend ?? null, mer: p.mer ?? null },
        currency: data.account?.currency || 'USD', this_week: data.this_week || [], need_from_you: data.need_from_you || [], fresh: rep.period_end >= ymd(Date.parse(monday + 'T12:00:00Z') - 8 * 864e5) };
      /* The plan is the strategist's reply under the Monday MORNING CARD (2026-10-13, morningcard.js); the weekly
         report's own card was the anchor before that and is still read when the card's thread has nothing. */
      const mondayCard = await loadCard(env, b.act_id, rep.period_end ? ymd(Date.parse(rep.period_end + 'T12:00:00Z') + 864e5) : monday).catch(() => null);
      for (const [ch, ts] of [[mondayCard?.channel, mondayCard?.ts], [rep.slack_channel, rep.slack_ts]]) {
        if (thread.length || !ch || !ts) continue;
        const rows = (await env.DB.prepare(`SELECT ts, name, user, text, bot FROM slack_msg WHERE channel = ?1 AND thread_ts = ?2 AND ts != ?2 ORDER BY ts`).bind(ch, ts).all().catch(() => ({ results: [] }))).results || [];
        thread = rows.filter(r => !r.bot && String(r.text || '').trim()).map(r => ({ by: r.name || r.user || 'someone', text: String(r.text).slice(0, 4000), at: new Date(+String(r.ts).split('.')[0] * 1000).toISOString(), where: 'thread' }));
      }
      /* A plan posted in the channel itself on the Monday (not as a reply) still counts. */
      if (!thread.length && b.slack_channel) {
        const mon = rep.period_end ? ymd(Date.parse(rep.period_end + 'T12:00:00Z') + 864e5) : monday;
        const rows = (await env.DB.prepare(`SELECT ts, name, user, text FROM slack_msg WHERE channel = ?1 AND day = ?2 AND bot = 0 AND (thread_ts IS NULL OR thread_ts = ts) AND length(text) > 120 ORDER BY ts LIMIT 6`).bind(b.slack_channel, mon).all().catch(() => ({ results: [] }))).results || [];
        thread = rows.map(r => ({ by: r.name || r.user || 'someone', text: String(r.text).slice(0, 4000), at: new Date(+String(r.ts).split('.')[0] * 1000).toISOString(), where: 'channel' }));
      }
    }
    return { act_id: b.act_id, name: b.name, report, thread, open: (open.find(o => o.brand_id === b.act_id) || {}).items || [] };
  }));
  return { monday, theme: theme && theme.date === monday ? theme.text : '', brands: out, agency_open: (open.find(o => o.brand_id === '') || {}).items || [] };
}

async function addItem(env, d, body, who) {
  const act = String(body.act || '');
  const brands = await d.listBrands(env);
  if (act && !brands.some(b => b.act_id === act)) throw Object.assign(new Error('No such brand.'), { status: 400 });
  const row = await addAction(env, { act, text: body.text, owner: body.owner, due: body.due, kind: 'team', source: ['monday', 'today', 'strategist', 'manual'].includes(body.source) ? body.source : 'monday', source_id: body.source_id, created_by: who });
  return { ok: true, id: row.id, url: row.url, assigned: !!row.owner, item: row };
}

/* One meeting as Work > Calls lists it: who was on it (not the team), the brands it touched, what is waiting
 * (counts by where each item goes) and, once confirmed, what it made. The heavy JSON stays out of the list. */
const TEAM_MAIL = new Set(ROSTER.map(r => r.email).filter(Boolean));
export function callRow(m) {
  const notes = safe(m.notes_json, null), res = safe(m.result_json, null);
  const people = (safe(m.attendees_json, []) || []).filter(a => !TEAM_MAIL.has(String(a.email || '').toLowerCase()) && !/go-mobius-digital\.com$/i.test(a.email || ''));
  const count = k => (notes?.brands || []).reduce((n, b) => n + (b.items || []).filter(i => i.kind === k).length, 0);
  const counts = notes ? { team: count('team'), brief: count('brief'), client_owes: count('client_owes'), client: count('client') + (notes.brands || []).reduce((n, b) => n + (b.this_week || []).length, 0) } : null;
  const all = res ? [...(res.brands || []), ...(res.agency ? [res.agency] : [])] : [];
  const made = res ? { tasks: all.reduce((n, b) => n + (b.tasks || []).filter(t => !t.error).length, 0), briefs: all.reduce((n, b) => n + (b.briefs || []).filter(t => !t.error).length, 0), asks: all.reduce((n, b) => n + (b.asks || []).filter(t => !t.error).length, 0), report: all.filter(b => b.report).length } : null;
  const { attendees_json, notes_json, result_json, ...rest } = m;
  return { ...rest, with: people.map(a => a.displayName || String(a.email || '').split('@')[0]).filter(Boolean).slice(0, 4), brand_ids: [...new Set((notes?.brands || []).map(b => b.brand_id).filter(Boolean))], counts, made };
}

/* ---------- routes ---------- */
export async function handleMeetings(request, env, url, path, json, d) {
  if (path !== '/api/meetings' && !path.startsWith('/api/meetings/')) return null;
  if (!(await d.isAdmin(request, env))) return json({ error: 'unauthorized' }, 401);
  if (d.clientScope && d.clientScope(request)) return json({ error: 'The team\'s page.' }, 403);
  await ensure(env);
  try {
    if (path === '/api/meetings' && request.method === 'GET') {
      const id = url.searchParams.get('id');
      if (id) {
        const m = await env.DB.prepare(`SELECT * FROM p_meeting WHERE id = ?1`).bind(id).first();
        if (!m) return json({ error: 'not found' }, 404);
        return json({ ...m, attendees: safe(m.attendees_json, []), notes: safe(m.notes_json, null), result: safe(m.result_json, null), attendees_json: undefined, notes_json: undefined, result_json: undefined });
      }
      const { results } = await env.DB.prepare(`SELECT id, title, date, at, duration, kind, status, error, cost, confirmed_by, confirmed_at, chars, attendees_json, notes_json, result_json FROM p_meeting WHERE date >= ?1 ORDER BY at DESC LIMIT 100`).bind(ymd(Date.now() - 60 * 864e5)).all();
      const meetings = (results || []).map(callRow);
      const open = url.searchParams.get('open') === '0' ? [] : await openItems(env, d).catch(() => []);
      const today = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Chicago' })).toISOString().slice(0, 10);
      const brands = await d.listBrands(env);
      return json({ meetings, open, today, monday: mondayOf(today), brands: brands.map(b => ({ act_id: b.act_id, name: b.name })), webhook: `${new URL(request.url).origin}/fireflies/webhook`, connected: !!env.FIREFLIES_API_KEY, since: await getSetting(env, 'meetingsSince') });
    }
    if (path === '/api/meetings/monday' && request.method === 'GET') return json(await mondayScreen(env, d));
    if (request.method !== 'POST') return json({ error: 'not found' }, 404);
    const body = await request.json().catch(() => ({}));
    const who = (await d.sessionEmail(env, request).catch(() => null)) || 'the team';
    if (path === '/api/meetings/confirm') return json({ ok: true, result: await confirm(env, d, body, who) });
    /* The Monday call screen: tick an item done, add one, set the week's theme. Items are p_action rows (actions.js). */
    if (path === '/api/meetings/done') {
      const id = String(body.id || '').trim(); if (!id) return json({ error: 'No item id.' }, 400);
      return json({ ok: true, item: await markDone(env, id, body.done !== false, { by: who, how: 'tick' }) });
    }
    if (path === '/api/meetings/add') return json(await addItem(env, d, body, who));
    if (path === '/api/meetings/theme') {
      const today = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Chicago' })).toISOString().slice(0, 10);
      await putSetting(env, 'mondayTheme', JSON.stringify({ date: mondayOf(today), text: clean(body.text, 600), by: who }));
      return json({ ok: true });
    }
    if (path === '/api/meetings/skip') {
      await env.DB.prepare(`UPDATE p_meeting SET status = 'skipped', updated_at = ?2 WHERE id = ?1 AND status != 'confirmed'`).bind(String(body.id || ''), now()).run();
      return json({ ok: true });
    }
    if (path === '/api/meetings/ingest') return json(await ingest(env, d, String(body.id || '').trim(), { force: true }));
    if (path === '/api/meetings/poll') return json(await meetingsTick(env, { ...d, canAfford: () => true }));
    return json({ error: 'not found' }, 404);
  } catch (e) { return json({ error: e.message }, e.status || 500); }
}

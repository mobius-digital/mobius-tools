/* MEETING NOTES (2026-10-13). Fireflies transcript in, per-brand decisions and action items out, Cole confirms
 * on one screen, then Asana, the client's weekly report and Requests.
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
 * Nothing is written anywhere until a person presses Confirm in Locus (Reports > Meeting notes).
 *
 * On Confirm: team items become Asana tasks in the brand project's "Action items" section (made if missing;
 * agency-wide items go to settings.agencyAsanaProject when set, else Slack only); "this week" lines land on the
 * brand's open weekly report draft (`data_json.this_week` / `need_from_you`, rendered by the report page and
 * the client send); what the client owes becomes a Requests item of kind `ask` (the client marks it done); and
 * one message per brand goes to its internal channel. The agency channel (strategistChannel) gets the rest.
 *
 * Table `p_meeting` (created on first use). Routes (admin, team only; not on brandguard CLIENT_RULES):
 *   GET  /api/meetings            the last 60 days + open action items per brand
 *   GET  /api/meetings?id=        one meeting with its notes
 *   POST /api/meetings/confirm    {id, summary, brands:[...]} the edited notes; applies the ticked items
 *   POST /api/meetings/skip       {id}
 *   POST /api/meetings/ingest     {id} re-read one Fireflies transcript (or read one the poll missed)
 *   POST /api/meetings/poll       check Fireflies now
 */

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
    items: arr(obj({ text: S, owner: S, due: S, kind: { type: 'string', enum: ['team', 'client', 'client_owes'] } })),
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
- items: only real commitments someone has to do. Each has a kind:
  team = a task for someone on the team (owner, due). Specific enough to tick off.
  client = something the client should hear we are doing this week (no owner needed).
  client_owes = something the client has to give or decide (photos, an offer, an approval).
- this_week: 2 to 4 lines the client reads in their weekly report under "This week". Say what we are doing and why, in the client's words. Never a team member's name, never a cost, never another brand, never "the AI".
- need_from_client: what we are waiting on from them, one line each, polite and specific. Empty when nothing.
- Do not invent. If the call never touched a brand, leave it out. Dedupe: one item per commitment, even if it was said three times.`;
}

async function extract(env, d, m, text) {
  const brands = await d.listBrands(env);
  const team = ['Cole', 'Ahsan', 'Noma', 'William', 'Ravo', 'Radhesh', 'Hamza'];
  const system = systemFor(brands, team, m.date);
  const user = `MEETING: ${m.title || 'Untitled'} (${m.date}, ${Math.round(m.duration || 0)} min)\nATTENDEES: ${(m.attendees || []).map(a => a.displayName || a.email).filter(Boolean).join(', ') || 'unknown'}\n\nTRANSCRIPT:\n${text}`;
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
    items: (b.items || []).map(i => ({ text: clean(i.text, 300), owner: clean(i.owner, 40), due: /^\d{4}-\d{2}-\d{2}$/.test(i.due || '') ? i.due : '', kind: ['team', 'client', 'client_owes'].includes(i.kind) ? i.kind : 'team' })).filter(i => i.text),
    this_week: (b.this_week || []).map(x => clean(x, 300)).filter(Boolean).slice(0, 6),
    need_from_client: (b.need_from_client || []).map(x => clean(x, 300)).filter(Boolean).slice(0, 6),
  }));
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
  const line = `*Notes from "${sEsc(m.title)}" are ready to confirm.* ${items} item${items === 1 ? '' : 's'} across ${names} brand${names === 1 ? '' : 's'}. Nothing is in Asana or with a client until you confirm.`;
  await d.slackPost(env, ch, line, [{ type: 'section', text: { type: 'mrkdwn', text: line } },
    { type: 'actions', elements: [{ type: 'button', text: { type: 'plain_text', text: 'Open in Locus' }, url: `${LOCUS}?open=meetings&meeting=${encodeURIComponent(m.id)}` }] }], { username: 'Locus' });
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
const sections = async (env, d, project) => (await d.asana(env, `/projects/${project}/sections?opt_fields=name`).catch(() => [])) || [];
async function actionSection(env, d, project) {
  const secs = await sections(env, d, project);
  const have = secs.find(s => /action item/i.test(String(s.name)));
  if (have) return have.gid;
  const made = await d.asana(env, `/projects/${project}/sections`, { method: 'POST', body: { name: 'Action items' } });
  return made?.gid || null;
}
const ROSTER = [
  { name: 'Ahsan', email: 'ahsan@go-mobius-digital.com' }, { name: 'Noma', email: 'molifenomaqhawe36@gmail.com' },
  { name: 'Ravo', email: 'schubertchannel123@gmail.com' }, { name: 'William', email: 'william@go-mobius-digital.com' },
  { name: 'Cole', email: 'cole@go-mobius-digital.com' },
];
async function userGid(env, d, workspace, name, cache) {
  const w = String(name || '').toLowerCase().trim();
  if (!w || !workspace) return null;
  if (!cache.users) cache.users = (await d.asanaAll(env, `/users?workspace=${workspace}&opt_fields=name,email`).catch(() => [])) || [];
  const r = ROSTER.find(x => x.name.toLowerCase() === w);
  const byMail = r ? cache.users.find(u => String(u.email || '').toLowerCase() === r.email) : null;
  return (byMail || cache.users.find(u => String(u.name || '').toLowerCase() === w) || cache.users.find(u => String(u.name || '').toLowerCase().startsWith(w)))?.gid || null;
}
async function asanaProjectOf(env, act) {
  const doc = safe((await env.DB.prepare(`SELECT data_json FROM p_br_doc WHERE act_id = ?1 AND line_id = '' AND key = 'asana'`).bind(act).first().catch(() => null))?.data_json, null);
  return doc?.project_gid ? { project: doc.project_gid, workspace: doc.workspace || null, url: doc.url || null } : null;
}
async function makeTask(env, d, proj, section, item, note, cache) {
  const assignee = await userGid(env, d, proj.workspace, item.owner, cache);
  const t = await d.asana(env, '/tasks?opt_fields=name,permalink_url', { method: 'POST', body: { name: clean(item.text, 200), projects: [proj.project], notes: note, ...(assignee ? { assignee } : {}), ...(item.due ? { due_on: item.due } : {}) } });
  if (section) await d.asana(env, `/sections/${section}/addTask`, { method: 'POST', body: { task: t.gid } }).catch(() => {});
  return { gid: t.gid, url: t.permalink_url || null, assigned: !!assignee };
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
  const cache = {};
  const agencyProject = await getSetting(env, 'agencyAsanaProject');
  const label = `From "${m.title}" (${m.date}). Confirmed by ${who} in Locus.`;
  for (const raw of (Array.isArray(body.brands) ? body.brands : [])) {
    const act = String(raw.brand_id || '');
    if (act && !brands.some(b => b.act_id === act)) continue;
    const b = {
      brand_id: act, decisions: (raw.decisions || []).map(x => clean(x, 300)).filter(Boolean),
      items: (raw.items || []).filter(i => i && i.on !== false).map(i => ({ text: clean(i.text, 300), owner: clean(i.owner, 40), due: /^\d{4}-\d{2}-\d{2}$/.test(i.due || '') ? i.due : '', kind: ['team', 'client', 'client_owes'].includes(i.kind) ? i.kind : 'team' })).filter(i => i.text),
      this_week: (raw.this_week || []).map(x => clean(x, 300)).filter(Boolean).slice(0, 6),
      need_from_client: (raw.need_from_client || []).map(x => clean(x, 300)).filter(Boolean).slice(0, 6),
    };
    if (!b.decisions.length && !b.items.length && !b.this_week.length && !b.need_from_client.length) continue;
    notes.brands.push(b);
    const r = { brand_id: act, name: act ? nameOf(act) : 'Agency', tasks: [], asks: [], report: null, slack: false };
    /* 1. Team items -> Asana. */
    const team = b.items.filter(i => i.kind === 'team');
    if (team.length) {
      const proj = act ? await asanaProjectOf(env, act) : (agencyProject ? { project: agencyProject, workspace: null } : null);
      if (proj) {
        const sec = await actionSection(env, d, proj.project).catch(() => null);
        for (const it of team) {
          try { r.tasks.push({ ...it, ...(await makeTask(env, d, proj, sec, it, label, cache)) }); }
          catch (e) { r.tasks.push({ ...it, error: e.message }); result.warnings.push(`${r.name}: "${it.text}" was not made in Asana (${e.message}).`); }
        }
      } else {
        for (const it of team) r.tasks.push({ ...it, error: act ? 'not connected to Asana' : 'no agency Asana project' });
        result.warnings.push(act ? `${r.name} is not connected to Asana: its ${team.length} task${team.length === 1 ? '' : 's'} went to Slack only.` : `Agency-wide tasks went to Slack only (set settings.agencyAsanaProject to file them).`);
      }
    }
    /* 2. What the client hears -> the open weekly draft. */
    if (act && (b.this_week.length || b.need_from_client.length)) {
      const rep = await openWeekly(env, act);
      if (rep) {
        const data = safe(rep.data_json, {}) || {};
        data.this_week = b.this_week; data.need_from_you = b.need_from_client; data.this_week_from = { meeting: m.id, title: m.title, at: now() };
        await env.DB.prepare(`UPDATE reports SET data_json = ?4 WHERE act_id = ?1 AND period = ?2 AND period_start = ?3`).bind(rep.act_id, rep.period, rep.period_start, JSON.stringify(data)).run();
        r.report = { period_start: rep.period_start, status: rep.status };
        if (d.slackSyncReport) await d.slackSyncReport(env, act, rep.period_start).catch(() => {});
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
      const L = [`*Notes from "${sEsc(m.title)}"* (${m.date})${act ? '' : ' · agency-wide'}`];
      if (b.decisions.length) L.push('*Decided*', ...b.decisions.map(x => `• ${sEsc(x)}`));
      if (r.tasks.length) L.push('*To do*', ...r.tasks.map(t => `• ${sEsc(t.text)}${t.owner ? ` · ${sEsc(t.owner)}` : ''}${t.due ? ` · due ${t.due}` : ''}${t.url ? ` · <${t.url}|Asana>` : t.error ? ' · _not in Asana_' : ''}`));
      const tell = b.items.filter(i => i.kind === 'client').map(i => i.text).concat(b.this_week);
      if (tell.length) L.push('*The client hears*', ...[...new Set(tell)].map(x => `• ${sEsc(x)}`));
      if (r.asks.length || b.need_from_client.length) L.push('*We need from the client*', ...[...new Set(r.asks.map(a => a.text).concat(b.need_from_client))].map(x => `• ${sEsc(x)}`));
      const text = L.join('\n');
      try { await d.slackPost(env, ch, text, [{ type: 'section', text: { type: 'mrkdwn', text: text.slice(0, 2900) } }, { type: 'actions', elements: [{ type: 'button', text: { type: 'plain_text', text: 'Open in Locus' }, url: `${LOCUS}?open=meetings&meeting=${encodeURIComponent(m.id)}` }] }], { username: 'Locus' }); r.slack = true; }
      catch (e) { result.warnings.push(`${r.name}: the Slack note failed (${e.message}).`); }
    }
    if (act) result.brands.push(r); else result.agency = r;
  }
  await env.DB.prepare(`UPDATE p_meeting SET notes_json = ?2, result_json = ?3, status = 'confirmed', confirmed_by = ?4, confirmed_at = ?5, updated_at = ?5 WHERE id = ?1`)
    .bind(m.id, JSON.stringify(notes), JSON.stringify(result), who, now()).run();
  return result;
}

/* ---------- open action items, for the next call ---------- */
export async function openItems(env, d) {
  const key = 'meetingsOpen';
  const cached = safe(await getSetting(env, key), null);
  if (cached && Date.now() - Date.parse(cached.at) < 10 * 60e3) return cached.v;
  const brands = await d.listBrands(env);
  const out = [];
  for (const b of brands) {
    const proj = await asanaProjectOf(env, b.act_id);
    if (!proj) continue;
    const secs = await sections(env, d, proj.project);
    const sec = secs.find(s => /action item/i.test(String(s.name)));
    if (!sec) continue;
    const tasks = (await d.asanaAll(env, `/sections/${sec.gid}/tasks?opt_fields=name,completed,due_on,assignee.name,permalink_url,created_at&completed_since=now`).catch(() => [])) || [];
    const open = tasks.filter(t => !t.completed).map(t => ({ name: t.name, owner: t.assignee?.name || '', due: t.due_on || '', url: t.permalink_url || '', created: String(t.created_at || '').slice(0, 10) }));
    if (open.length) out.push({ brand_id: b.act_id, name: b.name, items: open });
  }
  await putSetting(env, key, JSON.stringify({ at: now(), v: out })).catch(() => {});
  return out;
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
      const { results } = await env.DB.prepare(`SELECT id, title, date, at, duration, kind, status, error, cost, confirmed_by, confirmed_at, chars FROM p_meeting WHERE date >= ?1 ORDER BY at DESC LIMIT 100`).bind(ymd(Date.now() - 60 * 864e5)).all();
      const open = url.searchParams.get('open') === '0' ? [] : await openItems(env, d).catch(() => []);
      const brands = await d.listBrands(env);
      return json({ meetings: results || [], open, brands: brands.map(b => ({ act_id: b.act_id, name: b.name })), webhook: `${new URL(request.url).origin}/fireflies/webhook`, connected: !!env.FIREFLIES_API_KEY, since: await getSetting(env, 'meetingsSince') });
    }
    if (request.method !== 'POST') return json({ error: 'not found' }, 404);
    const body = await request.json().catch(() => ({}));
    const who = (await d.sessionEmail(env, request).catch(() => null)) || 'the team';
    if (path === '/api/meetings/confirm') return json({ ok: true, result: await confirm(env, d, body, who) });
    if (path === '/api/meetings/skip') {
      await env.DB.prepare(`UPDATE p_meeting SET status = 'skipped', updated_at = ?2 WHERE id = ?1 AND status != 'confirmed'`).bind(String(body.id || ''), now()).run();
      return json({ ok: true });
    }
    if (path === '/api/meetings/ingest') return json(await ingest(env, d, String(body.id || '').trim(), { force: true }));
    if (path === '/api/meetings/poll') return json(await meetingsTick(env, { ...d, canAfford: () => true }));
    return json({ error: 'not found' }, 404);
  } catch (e) { return json({ error: e.message }, e.status || 500); }
}

/* ACTION ITEMS (2026-10-13). The team's to-do list lives in Locus, not Asana.
 *
 * Cole, 2026-10-13: "if there are tasks inside Locus, why aren't we moving everything inside Locus." The Asana round
 * trip (Locus writes a task, reads it back, reminds in Slack) was pointless when Locus is the one tracking. So every
 * team item from a call (meetings.js confirm), the Monday page's add box, Today's "Something else" and the Strategist
 * is one row in `p_action` on the shared D1. Locus Work > Action items draws them; Slack reminds the owner.
 *
 * Table p_action (created on first use; asana_url added by a guarded ALTER):
 *   id, act_id ('' = agency-wide), text, owner (first name), owner_email, due (YYYY-MM-DD),
 *   kind team | brief | client | client_owes (brief = a numbered task made in the brand's Asana Creative Brief
 *   section on confirm; the row carries asana_gid + asana_url so the list links it), status open | done | dropped,
 *   source meeting | monday | today | strategist | manual, source_id (meeting id, today row key...),
 *   asana_gid (only while a mirror runs; nothing writes it today), done_at, done_by, done_how (tick | slack | auto:<signal>),
 *   reminded_on (the Central day the last reminder went), slack_channel + slack_ts (the reminder line, so a ✅ on it works),
 *   detail (2026-10-20, the tasks audit: a task is a SHORT title that reads at a glance plus the details underneath, like
 *   Asana; every writer splits a long line with splitTitle so the list, the board and the morning card stay one line each),
 *   created_at, created_by, area (2026-10-13 fourth pass: ads | email | organic | site | ops | client, '' = Other, NULL = not
 *   judged yet; the call extractor sets it, quick add sets it, and actionTick has Haiku judge any open row still NULL).
 *
 * Routes (admin, team only; not on brandguard CLIENT_RULES, and refused for a client scope here too):
 *   GET  /api/actions?act=<brand|all|''>&status=open|done|all
 *   POST /api/actions        {act, text, owner, due, kind, source, source_id}
 *   POST /api/actions/done   {id, done}
 *   POST /api/actions/edit   {id, text, owner, due, kind, act, area}
 *   POST /api/actions/quick  {text, act?} one line typed in Work > Tasks; Haiku reads brand, owner, due and area out of it,
 *                            and any failure keeps the raw words as the task (never lost, never blocked)
 *   POST /api/actions/areas  judge the area of open rows that have none (the hourly tick does this too)
 *
 * Reminders (actionTick, hourly, from settings.actionHour (7 Central) until noon, switch settings.actionRemind = 'off'):
 * the morning an item is due (and every morning it is overdue, never more than once a day) one Slack line per owner per
 * brand in the brand's INTERNAL channel (agency-wide items go to strategistChannel; no channel = a DM to the owner by the
 * roster email), with a Done button per item (action id `act_done`, routed by slack-router like idea_*). A ✅ reaction on
 * that line marks every item in it done (handleReaction, from the reaction_added event).
 */

const LOCUS = 'https://tools.go-mobius-digital.com/profit/';
const SQL = [
  `CREATE TABLE IF NOT EXISTS p_action (
    id            TEXT PRIMARY KEY,
    act_id        TEXT NOT NULL DEFAULT '',
    text          TEXT NOT NULL,
    owner         TEXT NOT NULL DEFAULT '',
    owner_email   TEXT,
    due           TEXT NOT NULL DEFAULT '',
    kind          TEXT NOT NULL DEFAULT 'team',
    status        TEXT NOT NULL DEFAULT 'open',
    source        TEXT NOT NULL DEFAULT 'manual',
    source_id     TEXT,
    asana_gid     TEXT,
    done_at       TEXT,
    done_by       TEXT,
    done_how      TEXT,
    reminded_on   TEXT,
    slack_channel TEXT,
    slack_ts      TEXT,
    created_at    TEXT NOT NULL,
    created_by    TEXT
  )`,
  `CREATE INDEX IF NOT EXISTS p_action_open ON p_action (status, act_id, due)`,
];
let ensured = false;
export async function ensureActions(env) {
  if (ensured) return;
  for (const s of SQL) await env.DB.prepare(s).run();
  await env.DB.prepare(`ALTER TABLE p_action ADD COLUMN asana_url TEXT`).run().catch(() => {});   // 2026-10-13: Brief items link their Asana task
  await env.DB.prepare(`ALTER TABLE p_action ADD COLUMN area TEXT`).run().catch(() => {});        // 2026-10-13 fourth pass: Tasks groups by it
  await env.DB.prepare(`ALTER TABLE p_action ADD COLUMN detail TEXT`).run().catch(() => {});      // 2026-10-20: the details under a short title
  ensured = true;
}

/* The team, by first name (the owner field) and the email Slack knows them by. */
export const ROSTER = [
  { name: 'Cole', email: 'cole@go-mobius-digital.com' }, { name: 'Ahsan', email: 'ahsan@go-mobius-digital.com' },
  { name: 'Noma', email: 'molifenomaqhawe36@gmail.com' }, { name: 'William', email: 'william@go-mobius-digital.com' },
  { name: 'Ravo', email: 'schubertchannel123@gmail.com' }, { name: 'Radhesh', email: '' }, { name: 'Hamza', email: '' },
];
const KINDS = ['team', 'brief', 'client', 'client_owes'];
/* The part of the business a task touches. The model judges it from the words; nothing here matches keywords. */
export const AREAS = ['ads', 'email', 'organic', 'site', 'ops', 'client'];
export const AREA_RULE = `area = the part of the business the task touches: ads (paid ads: budgets, launches, naming, audiences, creative in the account), email (flows, campaigns, Klaviyo, SMS), organic (social posts, creators, community), site (discounts, pages, offers, the theme, checkout), ops (admin, setup, docs, billing, Amazon listings, anything internal), client (sending or sharing something with the client, a call with them). '' when none fits.`;
const areaOf = a => AREAS.includes(a) ? a : (a === '' ? '' : null);
const HAIKU = 'claude-haiku-5-5';
const SOURCES = ['meeting', 'monday', 'today', 'strategist', 'manual'];
const now = () => new Date().toISOString();
const clean = (s, n) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, n);
const sEsc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const ymdOk = s => /^\d{4}-\d{2}-\d{2}$/.test(s || '');
/** A task is a short title and the details under it. A long line (a sentence with its reasons, a bracket, "Plan: ...")
 *  is cut at its first natural break into the two, so nothing typed is lost and the list reads one line per task.
 *  Returns {text, detail}. 2026-10-20 (Cole: "so much text on there; if you want details, you click into it"). */
export const TITLE_MAX = 90;
export function splitTitle(raw, detail) {
  const text = clean(raw, 300), extra = clean(detail, 2000);
  if (!text || text.length <= TITLE_MAX) return { text, detail: extra };
  const breaks = [/\. (?=[A-Z(])/, / \((?=[^)]{12,})/, /: (?=[A-Za-z])/, /; /, /, (?=(?:from|because|so that|which|using|with|and then|then) )/];
  let cut = -1;
  for (const re of breaks) { const m = re.exec(text); if (m && m.index >= 18 && m.index <= TITLE_MAX && (cut < 0 || m.index < cut)) cut = m.index; }
  if (cut < 0) {
    /* No sentence break: the last clause joiner before the limit (", aimed at", " with", " to draw"), else the last space. */
    const head = text.slice(0, TITLE_MAX);
    let j = -1;
    for (const re of [/, (?=[a-z])/g, / (?:with|to|for|from|using|so|that|aimed|and) /g]) { let m; while (j < 0 && (m = re.exec(head))) if (m.index >= 30) j = m.index; }
    const sp = head.lastIndexOf(' ');
    cut = j >= 30 ? j : sp > 30 ? sp : TITLE_MAX;
  }
  const title = text.slice(0, cut).replace(/[\s,;:.(]+$/, '').trim();
  let rest = text.slice(cut).replace(/^[\s,;:.]+/, '').trim();
  const balanced = t => { let n = 0; for (const ch of t) { if (ch === '(') n++; else if (ch === ')') { n--; if (n < 0) return false; } } return n === 0; };
  if (/^\(/.test(rest) && /\)$/.test(rest) && balanced(rest.slice(1, -1))) rest = rest.slice(1, -1).trim();
  return { text: title || text.slice(0, TITLE_MAX), detail: [rest, extra].filter(Boolean).join('\n') };
}
const newId = () => 'ac_' + Array.from(crypto.getRandomValues(new Uint8Array(6))).map(b => b.toString(16).padStart(2, '0')).join('');
const ownerName = s => { const w = clean(s, 40).toLowerCase(); const r = ROSTER.find(x => x.name.toLowerCase() === w); return r ? r.name : clean(s, 40); };
const emailOf = name => (ROSTER.find(x => x.name.toLowerCase() === String(name || '').toLowerCase()) || {}).email || null;
const centralToday = () => new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Chicago' })).toISOString().slice(0, 10);
const md = s => ymdOk(s) ? new Date(s + 'T12:00:00Z').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' }) : '';
async function getSetting(env, k) { const r = await env.DB.prepare(`SELECT value FROM settings WHERE key = ?1`).bind(k).first().catch(() => null); return r?.value ?? null; }
async function putSetting(env, k, v) { await env.DB.prepare(`INSERT INTO settings (key, value) VALUES (?1, ?2) ON CONFLICT(key) DO UPDATE SET value = excluded.value`).bind(k, String(v)).run(); }

/* ---------- rows ---------- */
export async function addAction(env, it) {
  await ensureActions(env);
  const cut = splitTitle(it.text, it.detail);
  const row = {
    id: newId(), act_id: String(it.act || it.act_id || ''), text: cut.text, detail: cut.detail || null, owner: ownerName(it.owner), due: ymdOk(it.due) ? it.due : '',
    kind: KINDS.includes(it.kind) ? it.kind : 'team', source: SOURCES.includes(it.source) ? it.source : 'manual', source_id: it.source_id ? clean(it.source_id, 120) : null,
    created_at: now(), created_by: it.created_by ? clean(it.created_by, 120) : null,
    asana_gid: it.asana_gid ? String(it.asana_gid) : null, asana_url: it.asana_url ? String(it.asana_url).slice(0, 300) : null,
    area: areaOf(it.area),
  };
  if (!row.text) throw Object.assign(new Error('Write the item first.'), { status: 400 });
  row.owner_email = emailOf(row.owner);
  await env.DB.prepare(`INSERT INTO p_action (id, act_id, text, owner, owner_email, due, kind, status, source, source_id, created_at, created_by, asana_gid, asana_url, area, detail) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, 'open', ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15)`)
    .bind(row.id, row.act_id, row.text, row.owner, row.owner_email, row.due, row.kind, row.source, row.source_id, row.created_at, row.created_by, row.asana_gid, row.asana_url, row.area, row.detail).run();
  const out = { ...row, status: 'open', url: itemUrl(row) };
  return { ...out, ...(await runPlaced(env, out)) };
}

/* Anything that files a new or re-dated row somewhere else (Cole's calendar blocks, blocks.js). Registered once by
   worker.js; a hook returns extra fields for the answer ({calendar: {...}}); a failing hook never fails the write. */
const PLACE_HOOKS = [];
export function onActionPlaced(fn) { if (typeof fn === 'function') PLACE_HOOKS.push(fn); }
async function runPlaced(env, row) {
  const extra = {};
  for (const h of PLACE_HOOKS) Object.assign(extra, (await Promise.resolve().then(() => h(env, row)).catch(e => { console.log('place hook:', e.message); return null; })) || {});
  return extra;
}
export const itemUrl = r => `${LOCUS}?open=actions${r.act_id ? `&act=${encodeURIComponent(r.act_id)}` : ''}&item=${encodeURIComponent(r.id)}`;

export async function listActions(env, { act = 'all', status = 'open', since = 60 } = {}) {
  await ensureActions(env);
  const where = [], bind = [];
  if (act !== 'all') { where.push(`act_id = ?${bind.length + 1}`); bind.push(String(act)); }
  if (status === 'open') where.push(`status = 'open'`);
  else if (status === 'done') { where.push(`status != 'open' AND done_at >= ?${bind.length + 1}`); bind.push(new Date(Date.now() - since * 864e5).toISOString()); }
  const sql = `SELECT * FROM p_action${where.length ? ' WHERE ' + where.join(' AND ') : ''} ORDER BY CASE WHEN status = 'open' THEN 0 ELSE 1 END, CASE WHEN due = '' THEN 1 ELSE 0 END, due, created_at`;
  const q = env.DB.prepare(sql);
  const { results } = await (bind.length ? q.bind(...bind) : q).all();
  return (results || []).map(r => ({ ...r, url: itemUrl(r) }));
}

/* Anything that wants to know a row was done or opened again (the morning card strikes its line, morningcard.js).
   Registered once by worker.js; a failing hook never fails the tick or the tap. */
const DONE_HOOKS = [];
export function onActionDone(fn) { if (typeof fn === 'function') DONE_HOOKS.push(fn); }
export async function markDone(env, id, done, { by, how, quiet } = {}) {
  await ensureActions(env);
  const r = await env.DB.prepare(`SELECT * FROM p_action WHERE id = ?1`).bind(String(id || '')).first();
  if (!r) throw Object.assign(new Error('No such item.'), { status: 404 });
  if (done === false) await env.DB.prepare(`UPDATE p_action SET status = 'open', done_at = NULL, done_by = NULL, done_how = NULL WHERE id = ?1`).bind(r.id).run();
  else await env.DB.prepare(`UPDATE p_action SET status = 'done', done_at = ?2, done_by = ?3, done_how = ?4 WHERE id = ?1`).bind(r.id, now(), clean(by, 120) || null, clean(how, 40) || 'tick').run();
  const out = { ...r, status: done === false ? 'open' : 'done' };
  if (!quiet) for (const h of DONE_HOOKS) await Promise.resolve().then(() => h(env, out)).catch(() => {});
  return out;
}

export async function editAction(env, id, patch) {
  await ensureActions(env);
  const r = await env.DB.prepare(`SELECT * FROM p_action WHERE id = ?1`).bind(String(id || '')).first();
  if (!r) throw Object.assign(new Error('No such item.'), { status: 404 });
  const next = {
    text: 'text' in patch ? clean(patch.text, TITLE_MAX + 60) : r.text,
    detail: 'detail' in patch ? (clean(patch.detail, 2000) || null) : (r.detail ?? null),
    owner: 'owner' in patch ? ownerName(patch.owner) : r.owner,
    due: 'due' in patch ? (ymdOk(patch.due) ? patch.due : '') : r.due,
    kind: 'kind' in patch && KINDS.includes(patch.kind) ? patch.kind : r.kind,
    act_id: 'act' in patch ? String(patch.act || '') : r.act_id,
    status: patch.status === 'dropped' ? 'dropped' : r.status,
    area: 'area' in patch ? (areaOf(patch.area) ?? '') : r.area,
  };
  if (!next.text) throw Object.assign(new Error('The item needs words.'), { status: 400 });
  /* A new due date is a new reminder. */
  const remind = next.due !== r.due ? null : r.reminded_on;
  await env.DB.prepare(`UPDATE p_action SET text = ?2, owner = ?3, owner_email = ?4, due = ?5, kind = ?6, act_id = ?7, status = ?8, reminded_on = ?9, area = ?10, detail = ?11 WHERE id = ?1`)
    .bind(r.id, next.text, next.owner, emailOf(next.owner), next.due, next.kind, next.act_id, next.status, remind, next.area ?? null, next.detail).run();
  const out = { ...r, ...next, url: itemUrl({ ...r, ...next }) };
  /* A new owner, date, brand or wording can mean a different block (or none): place it again. */
  const moved = next.owner !== r.owner || next.due !== r.due || next.act_id !== r.act_id || next.text !== r.text || next.status !== r.status;
  return moved ? { ...out, ...(await runPlaced(env, { ...out, was: r })) } : out;
}

/** Open items grouped per brand (agency-wide first), the shape the Calls page and the Monday screen read. */
export async function openItems(env, d) {
  const rows = await listActions(env, { act: 'all', status: 'open' });
  const brands = await d.listBrands(env);
  const nameOf = id => id ? (brands.find(b => b.act_id === id)?.name || id) : 'Agency-wide';
  const by = new Map();
  for (const r of rows) {
    if (!by.has(r.act_id)) by.set(r.act_id, { brand_id: r.act_id, name: nameOf(r.act_id), items: [] });
    by.get(r.act_id).items.push({ id: r.id, name: r.text, text: r.text, detail: r.detail || '', owner: r.owner, due: r.due, kind: r.kind, area: r.area || '', source: r.source, source_id: r.source_id, url: r.url, asana_url: r.asana_url || null, created: String(r.created_at || '').slice(0, 10) });
  }
  return [...by.values()].sort((a, b) => (a.brand_id ? 1 : 0) - (b.brand_id ? 1 : 0) || a.name.localeCompare(b.name));
}

/* ---------- quick add and the area judge (Haiku 5.5, a fraction of a cent each) ---------- */
async function haiku(env, d, system, user, schema, max = 800) {
  if (!env.ANTHROPIC_API_KEY || !d.xfetch) throw new Error('no model');
  const r = await d.xfetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({ model: HAIKU, max_tokens: max, system, output_config: { format: { type: 'json_schema', schema } }, messages: [{ role: 'user', content: user }] }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error?.message || `Claude HTTP ${r.status}`);
  const out = safe((j.content || []).filter(b => b.type === 'text').map(b => b.text).join(''));
  if (!out) throw new Error('empty');
  return out;
}
const QUICK_SCHEMA = { type: 'object', additionalProperties: false, required: ['act', 'text', 'detail', 'owner', 'due', 'area'],
  properties: { act: { type: 'string' }, text: { type: 'string' }, detail: { type: 'string' }, owner: { type: 'string' }, due: { type: 'string' }, area: { type: 'string', enum: [...AREAS, ''] } } };
/** One typed line -> {act, text, owner, due, area}. Any failure (no key, budget, a bad answer) = the raw words as the task,
 *  with the brand the page was on. Never throws. */
export async function parseQuick(env, d, raw, { act = '', today } = {}) {
  const text = clean(raw, 300);
  const fallback = { act: String(act || ''), ...splitTitle(text), owner: '', due: '', area: null, parsed: false };
  if (!text) return fallback;
  try {
    if (d.canAfford && !d.canAfford(2)) return fallback;
    const brands = await d.listBrands(env);
    const day = today || (d.centralDate ? d.centralDate() : centralToday());
    const dow = new Date(day + 'T12:00:00Z').toLocaleDateString('en-US', { weekday: 'long', timeZone: 'UTC' });
    const system = `You read one line a Mobius Digital team member typed into their task list and split it into fields. Plain words, no em dashes.
BRANDS (act = the id, '' when no brand is named or meant): ${brands.map(b => `${b.act_id} = ${b.name}`).join('; ')}.
TEAM (owner = one of these first names when the line names or clearly means them, else ''): ${ROSTER.map(r => r.name).join(', ')}.
TODAY is ${day} (${dow}). due = YYYY-MM-DD when the line gives a day ("by Wed", "tomorrow", "Friday", "end of week" = this Friday), else ''.
text = the task as a SHORT title: starts with a verb, at most 8 words, specific enough to tick off, without the brand name, the owner or the date words ("Raise Prospecting 1 to $400/day").
detail = everything else the line says that the title left out (the reason, the numbers, a link, what exactly), in the person's own words; '' when the title holds it all.
${AREA_RULE}`;
    const o = await haiku(env, d, system, text, QUICK_SCHEMA, 400);
    const ids = new Set(brands.map(b => b.act_id));
    const owner = ROSTER.find(r => r.name.toLowerCase() === String(o.owner || '').toLowerCase())?.name || '';
    const cut = splitTitle(clean(o.text, 300) || text, o.detail);
    return { act: ids.has(o.act) ? o.act : String(act || ''), text: cut.text, detail: cut.detail, owner, due: ymdOk(o.due) ? o.due : '', area: areaOf(o.area) ?? '', parsed: true };
  } catch { return fallback; }
}

const AREA_SCHEMA = { type: 'object', additionalProperties: false, required: ['items'],
  properties: { items: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['id', 'area'], properties: { id: { type: 'string' }, area: { type: 'string', enum: [...AREAS, ''] } } } } } };
/** Open rows with no area yet (older rows, Today's "Something else", the Strategist) get one, 60 at a time. */
export async function judgeAreas(env, d, { limit = 60 } = {}) {
  await ensureActions(env);
  const { results } = await env.DB.prepare(`SELECT id, text FROM p_action WHERE status = 'open' AND area IS NULL AND kind != 'brief' ORDER BY created_at LIMIT ?1`).bind(limit).all();
  const rows = results || [];
  if (!rows.length) return { judged: 0 };
  if (d.canAfford && !d.canAfford(3)) return { deferred: 'budget' };
  const o = await haiku(env, d, `You sort a digital marketing agency's tasks. For each task give its area. ${AREA_RULE}`, rows.map(r => `${r.id}: ${r.text}`).join('\n'), AREA_SCHEMA, 3000);
  const ids = new Set(rows.map(r => r.id));
  let n = 0;
  for (const it of o.items || []) if (ids.has(it.id)) { await env.DB.prepare(`UPDATE p_action SET area = ?2 WHERE id = ?1 AND area IS NULL`).bind(it.id, areaOf(it.area) ?? '').run(); n++; }
  return { judged: n };
}

/* ---------- the reminders ---------- */
const DONE_BTN = (r, n) => ({ type: 'button', action_id: `act_done_${n}`, text: { type: 'plain_text', text: `Done: ${clean(r.text, 28)}${r.text.length > 28 ? '…' : ''}` }, value: JSON.stringify({ id: r.id }) });
/** One owner's line for one brand: the items due today and the ones overdue, a Done button each (5 at most, Slack's limit).
 *  tag (optional) = the owner's Slack tag (<@U...>), so a line in the morning card's thread notifies them. */
export function reminderMessage(brandName, owner, items, today, tag) {
  const late = items.filter(i => i.due < today), due = items.filter(i => i.due === today);
  const who = owner || 'Nobody owns these';
  /* 2026-10-20 (the tasks audit): the morning card above already lists each task, so this reply does not repeat them. It
     is the owner's tag, the count, and a Done button per task (the title is the label); past four, "and N more in Locus".
     The plain text (notifications, the index) still carries the lines. */
  const head = `${tag || `*${sEsc(who)}*`}, ${brandName ? sEsc(brandName) + ': ' : ''}${due.length ? `${due.length} due today` : ''}${due.length && late.length ? ', ' : ''}${late.length ? `${late.length} overdue` : ''}. Press Done as you go.`;
  const text = [head, ...items.map(i => `• ${i.kind === 'brief' ? 'Brief: ' : ''}${sEsc(i.text)}${i.due < today ? ` _(was due ${md(i.due)})_` : ''}`)].join('\n');
  const blocks = [{ type: 'section', text: { type: 'mrkdwn', text: (items.length > 4 ? `${head}\n_${items.length - 4} more in Locus_` : head).slice(0, 2900) } }];
  const btns = items.slice(0, 4).map((r, n) => DONE_BTN(r, n));
  btns.push({ type: 'button', action_id: 'noop_open', text: { type: 'plain_text', text: 'Open in Locus' }, url: `${LOCUS}?open=actions${items[0].act_id ? `&act=${encodeURIComponent(items[0].act_id)}` : ''}` });
  blocks.push({ type: 'actions', elements: btns });
  return { text, blocks };
}

export async function actionTick(env, d) {
  const areas = await judgeAreas(env, d).catch(e => ({ error: e.message }));
  if ((await getSetting(env, 'actionRemind')) === 'off') return { skipped: 'off', areas };
  const hour = d.centralHour();
  const from = +(await getSetting(env, 'actionHour')) || 7;
  if (hour < from || hour > 12) return { skipped: 'not the morning' };
  if (!d.canAfford(30)) return { deferred: 'budget' };
  await ensureActions(env);
  const today = d.centralDate ? d.centralDate() : centralToday();
  const { results } = await env.DB.prepare(`SELECT * FROM p_action WHERE status = 'open' AND due != '' AND due <= ?1 AND (reminded_on IS NULL OR reminded_on != ?1) ORDER BY act_id, owner, due`).bind(today).all();
  const rows = results || [];
  if (!rows.length) return { posted: 0 };
  const brands = await d.listBrands(env);
  const strat = await getSetting(env, 'strategistChannel');
  const groups = new Map();
  for (const r of rows) { const k = `${r.act_id}|${r.owner}`; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(r); }
  const out = { posted: 0, skipped: [], errors: [] };
  for (const [k, items] of groups) {
    if (!d.canAfford(10)) { out.deferred = 'budget'; break; }
    const [act, owner] = k.split('|');
    const brand = act ? brands.find(b => b.act_id === act) : null;
    /* Where: the brand's internal channel; agency-wide items go to the Strategist channel; neither = the owner's DM. */
    /* A one-channel brand (its internal channel is the client's) has no internal channel here: the owner's DM instead (2026-10-19). */
    let channel = act ? (brand?.slack_channel && brand.slack_channel !== brand.brief_channel ? brand.slack_channel : null) : (strat || null);
    if (!channel) {
      const email = items[0].owner_email || emailOf(owner);
      if (email && d.slackApi) { const u = await d.slackApi(env, 'users.lookupByEmail', { email }).catch(() => null); if (u?.ok && u.user?.id && !u.user.is_bot) channel = u.user.id; }
    }
    if (!channel) { out.skipped.push({ act, owner, why: 'no channel' }); continue; }
    /* A brand's line goes under today's morning card when there is one (teamPost: a reply, the owner tagged). */
    const tag = d.teamPost && act && d.tagOf ? await d.tagOf(env, owner).catch(() => null) : null;
    const msg = reminderMessage(brand ? brand.name : (act ? act : ''), owner, items, today, tag);
    try {
      const r = d.teamPost && act ? await d.teamPost(env, channel, msg.text, msg.blocks, { username: 'Locus' }) : await d.slackPost(env, channel, msg.text, msg.blocks, { username: 'Locus' });
      const ts = r && (r.ts || r.message?.ts) || null;
      for (const it of items) await env.DB.prepare(`UPDATE p_action SET reminded_on = ?2, slack_channel = ?3, slack_ts = ?4 WHERE id = ?1`).bind(it.id, today, channel, ts).run();
      out.posted++;
    } catch (e) { out.errors.push({ act, owner, error: e.message }); }
  }
  return out;
}

/* ---------- Slack: the Done button and the ✅ reaction ---------- */
/** The reminder line, redrawn after a tap: done items struck through, buttons only for what is still open. */
function redraw(items, today, by) {
  const open = items.filter(i => i.status === 'open');
  const lines = items.map(i => i.status === 'open' ? `• ${sEsc(i.text)}${i.due && i.due < today ? ` _(was due ${md(i.due)})_` : ''}` : `• ~${sEsc(i.text)}~ ✓${i.done_by ? ` ${sEsc(i.done_by)}` : ''}`);
  const head = open.length ? `*${sEsc(items[0].owner || 'Nobody owns these')}*, ${open.length} still open.` : `*${sEsc(items[0].owner || '')}* ✓ All done${by ? ` (${sEsc(by)})` : ''}.`;
  const text = [head, ...lines].join('\n');
  const blocks = [{ type: 'section', text: { type: 'mrkdwn', text: text.slice(0, 2900) } }];
  if (open.length) blocks.push({ type: 'actions', elements: open.slice(0, 4).map((r, n) => DONE_BTN(r, n)).concat([{ type: 'button', action_id: 'noop_open', text: { type: 'plain_text', text: 'Open in Locus' }, url: `${LOCUS}?open=actions${items[0].act_id ? `&act=${encodeURIComponent(items[0].act_id)}` : ''}` }]) });
  return { text, blocks };
}
export async function slackName(env, d, userId) {
  if (!userId || !d.slackApi) return userId || null;
  const u = await d.slackApi(env, 'users.info', { user: userId }).catch(() => null);
  return u?.user?.profile?.display_name || u?.user?.real_name || u?.user?.name || userId;
}
export async function handleActionButton(env, ctx, payload, d, { ACK, xfetch }) {
  const tap = (payload.actions || []).find(a => /^act_done/.test(a.action_id || ''));
  const id = tap ? String((safe(tap.value) || {}).id || '') : '';
  if (!id) return ACK();
  ctx.waitUntil((async () => {
    await ensureActions(env);
    const who = await slackName(env, d, payload.user?.id);
    const r = await markDone(env, id, true, { by: who, how: 'slack' }).catch(() => null);
    if (!r || !payload.response_url) return;
    const ts = payload.container?.message_ts || payload.message?.ts || null, ch = payload.container?.channel_id || payload.channel?.id || null;
    const { results } = ts && ch ? await env.DB.prepare(`SELECT * FROM p_action WHERE slack_channel = ?1 AND slack_ts = ?2 ORDER BY due, created_at`).bind(ch, ts).all() : { results: [r] };
    const items = results && results.length ? results : [r];
    const msg = redraw(items, centralToday(), who);
    await xfetch(payload.response_url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ replace_original: true, text: msg.text, blocks: msg.blocks }) }).catch(() => {});
  })());
  return ACK();
}
const safe = s => { try { return JSON.parse(s); } catch { return null; } };
const CHECKS = new Set(['white_check_mark', 'heavy_check_mark', 'ballot_box_with_check', 'heavy_check_mark', 'check']);
/** reaction_added on a reminder line: every open item behind that message is done. Anything else is ignored. */
export async function handleReaction(env, d, ev) {
  if (!ev || ev.type !== 'reaction_added' || !CHECKS.has(String(ev.reaction || ''))) return { ignored: ev?.reaction || 'no reaction' };
  const ch = ev.item?.channel, ts = ev.item?.ts;
  if (!ch || !ts) return { ignored: 'no item' };
  await ensureActions(env);
  const { results } = await env.DB.prepare(`SELECT * FROM p_action WHERE slack_channel = ?1 AND slack_ts = ?2 AND status = 'open'`).bind(ch, ts).all();
  if (!results || !results.length) return d.cardReaction ? d.cardReaction(env, ev) : { ignored: 'not a reminder' };
  const who = await slackName(env, d, ev.user);
  for (const r of results) await markDone(env, r.id, true, { by: who, how: 'slack' });
  /* Redraw the line so it reads done (chat.update needs the bot's own message, which a reminder is). */
  if (d.slackApi) {
    const all = (await env.DB.prepare(`SELECT * FROM p_action WHERE slack_channel = ?1 AND slack_ts = ?2 ORDER BY due, created_at`).bind(ch, ts).all()).results || results;
    const msg = redraw(all, centralToday(), who);
    await d.slackApi(env, 'chat.update', { channel: ch, ts, text: msg.text, blocks: msg.blocks }).catch(() => {});
  }
  return { done: results.length, by: who };
}

/* ---------- routes ---------- */
export async function handleActions(request, env, url, path, json, d) {
  if (path !== '/api/actions' && !path.startsWith('/api/actions/')) return null;
  if (!(await d.isAdmin(request, env))) return json({ error: 'unauthorized' }, 401);
  if (d.clientScope && d.clientScope(request)) return json({ error: 'The team\'s page.' }, 403);
  await ensureActions(env);
  try {
    if (path === '/api/actions' && request.method === 'GET') {
      const act = url.searchParams.get('act') ?? 'all';
      const status = url.searchParams.get('status') || 'open';
      const items = await listActions(env, { act: act === '' ? '' : act || 'all', status: ['open', 'done', 'all'].includes(status) ? status : 'open' });
      const brands = await d.listBrands(env);
      /* What the clients owe us (Requests asks): open ones, and ones done in the last 7 days, for "Waiting on the client". */
      const since = new Date(Date.now() - 7 * 864e5).toISOString();
      const waiting = status === 'open' ? (((await env.DB.prepare(`SELECT id, act_id, title, body, status, created_at, decided_at, updated_at FROM p_request WHERE kind = 'ask' AND (status = 'open' OR updated_at >= ?1) ORDER BY created_at`).bind(since).all().catch(() => ({ results: [] }))).results) || [])
        .map(r => ({ id: r.id, act_id: r.act_id, title: r.title, status: r.status, created_at: r.created_at, done_at: r.status !== 'open' ? (r.decided_at || r.updated_at) : null, due: (String(r.body || '').match(/Needed by (\d{4}-\d{2}-\d{2})/) || [])[1] || '' })) : [];
      return json({ items, waiting, brands: brands.map(b => ({ act_id: b.act_id, name: b.name })), team: ROSTER.map(r => r.name), remind: (await getSetting(env, 'actionRemind')) !== 'off' });
    }
    if (request.method !== 'POST') return json({ error: 'not found' }, 404);
    const body = await request.json().catch(() => ({}));
    const who = (await d.sessionEmail(env, request).catch(() => null)) || 'the team';
    if (path === '/api/actions') {
      const act = String(body.act || body.act_id || '');
      if (act && !(await d.listBrands(env)).some(b => b.act_id === act)) return json({ error: 'No such brand.' }, 400);
      return json({ ok: true, item: await addAction(env, { ...body, act, created_by: who }) });
    }
    if (path === '/api/actions/done') return json({ ok: true, item: await markDone(env, body.id, body.done !== false, { by: who, how: 'tick' }) });
    if (path === '/api/actions/edit') return json({ ok: true, item: await editAction(env, body.id, body) });
    if (path === '/api/actions/quick') {
      const brands = await d.listBrands(env);
      const p = await parseQuick(env, d, body.text, { act: brands.some(b => b.act_id === body.act) ? body.act : '' });
      if (!p.text) return json({ error: 'Write the task first.' }, 400);
      return json({ ok: true, parsed: p.parsed, item: await addAction(env, { ...p, kind: 'team', source: 'manual', created_by: who }) });
    }
    if (path === '/api/actions/areas') return json({ ok: true, ...(await judgeAreas(env, d)) });
    return json({ error: 'not found' }, 404);
  } catch (e) { return json({ error: e.message }, e.status || 500); }
}

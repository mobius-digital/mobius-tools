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
 *   created_at, created_by.
 *
 * Routes (admin, team only; not on brandguard CLIENT_RULES, and refused for a client scope here too):
 *   GET  /api/actions?act=<brand|all|''>&status=open|done|all
 *   POST /api/actions        {act, text, owner, due, kind, source, source_id}
 *   POST /api/actions/done   {id, done}
 *   POST /api/actions/edit   {id, text, owner, due, kind, act}
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
  ensured = true;
}

/* The team, by first name (the owner field) and the email Slack knows them by. */
export const ROSTER = [
  { name: 'Cole', email: 'cole@go-mobius-digital.com' }, { name: 'Ahsan', email: 'ahsan@go-mobius-digital.com' },
  { name: 'Noma', email: 'molifenomaqhawe36@gmail.com' }, { name: 'William', email: 'william@go-mobius-digital.com' },
  { name: 'Ravo', email: 'schubertchannel123@gmail.com' }, { name: 'Radhesh', email: '' }, { name: 'Hamza', email: '' },
];
const KINDS = ['team', 'brief', 'client', 'client_owes'];
const SOURCES = ['meeting', 'monday', 'today', 'strategist', 'manual'];
const now = () => new Date().toISOString();
const clean = (s, n) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, n);
const sEsc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const ymdOk = s => /^\d{4}-\d{2}-\d{2}$/.test(s || '');
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
  const row = {
    id: newId(), act_id: String(it.act || it.act_id || ''), text: clean(it.text, 300), owner: ownerName(it.owner), due: ymdOk(it.due) ? it.due : '',
    kind: KINDS.includes(it.kind) ? it.kind : 'team', source: SOURCES.includes(it.source) ? it.source : 'manual', source_id: it.source_id ? clean(it.source_id, 120) : null,
    created_at: now(), created_by: it.created_by ? clean(it.created_by, 120) : null,
    asana_gid: it.asana_gid ? String(it.asana_gid) : null, asana_url: it.asana_url ? String(it.asana_url).slice(0, 300) : null,
  };
  if (!row.text) throw Object.assign(new Error('Write the item first.'), { status: 400 });
  row.owner_email = emailOf(row.owner);
  await env.DB.prepare(`INSERT INTO p_action (id, act_id, text, owner, owner_email, due, kind, status, source, source_id, created_at, created_by, asana_gid, asana_url) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, 'open', ?8, ?9, ?10, ?11, ?12, ?13)`)
    .bind(row.id, row.act_id, row.text, row.owner, row.owner_email, row.due, row.kind, row.source, row.source_id, row.created_at, row.created_by, row.asana_gid, row.asana_url).run();
  return { ...row, status: 'open', url: itemUrl(row) };
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

export async function markDone(env, id, done, { by, how } = {}) {
  await ensureActions(env);
  const r = await env.DB.prepare(`SELECT * FROM p_action WHERE id = ?1`).bind(String(id || '')).first();
  if (!r) throw Object.assign(new Error('No such item.'), { status: 404 });
  if (done === false) await env.DB.prepare(`UPDATE p_action SET status = 'open', done_at = NULL, done_by = NULL, done_how = NULL WHERE id = ?1`).bind(r.id).run();
  else await env.DB.prepare(`UPDATE p_action SET status = 'done', done_at = ?2, done_by = ?3, done_how = ?4 WHERE id = ?1`).bind(r.id, now(), clean(by, 120) || null, clean(how, 40) || 'tick').run();
  return { ...r, status: done === false ? 'open' : 'done' };
}

export async function editAction(env, id, patch) {
  await ensureActions(env);
  const r = await env.DB.prepare(`SELECT * FROM p_action WHERE id = ?1`).bind(String(id || '')).first();
  if (!r) throw Object.assign(new Error('No such item.'), { status: 404 });
  const next = {
    text: 'text' in patch ? clean(patch.text, 300) : r.text,
    owner: 'owner' in patch ? ownerName(patch.owner) : r.owner,
    due: 'due' in patch ? (ymdOk(patch.due) ? patch.due : '') : r.due,
    kind: 'kind' in patch && KINDS.includes(patch.kind) ? patch.kind : r.kind,
    act_id: 'act' in patch ? String(patch.act || '') : r.act_id,
    status: patch.status === 'dropped' ? 'dropped' : r.status,
  };
  if (!next.text) throw Object.assign(new Error('The item needs words.'), { status: 400 });
  /* A new due date is a new reminder. */
  const remind = next.due !== r.due ? null : r.reminded_on;
  await env.DB.prepare(`UPDATE p_action SET text = ?2, owner = ?3, owner_email = ?4, due = ?5, kind = ?6, act_id = ?7, status = ?8, reminded_on = ?9 WHERE id = ?1`)
    .bind(r.id, next.text, next.owner, emailOf(next.owner), next.due, next.kind, next.act_id, next.status, remind).run();
  return { ...r, ...next, url: itemUrl({ ...r, ...next }) };
}

/** Open items grouped per brand (agency-wide first), the shape the Calls page and the Monday screen read. */
export async function openItems(env, d) {
  const rows = await listActions(env, { act: 'all', status: 'open' });
  const brands = await d.listBrands(env);
  const nameOf = id => id ? (brands.find(b => b.act_id === id)?.name || id) : 'Agency-wide';
  const by = new Map();
  for (const r of rows) {
    if (!by.has(r.act_id)) by.set(r.act_id, { brand_id: r.act_id, name: nameOf(r.act_id), items: [] });
    by.get(r.act_id).items.push({ id: r.id, name: r.text, text: r.text, owner: r.owner, due: r.due, kind: r.kind, source: r.source, source_id: r.source_id, url: r.url, asana_url: r.asana_url || null, created: String(r.created_at || '').slice(0, 10) });
  }
  return [...by.values()].sort((a, b) => (a.brand_id ? 1 : 0) - (b.brand_id ? 1 : 0) || a.name.localeCompare(b.name));
}

/* ---------- the reminders ---------- */
const DONE_BTN = (r, n) => ({ type: 'button', action_id: `act_done_${n}`, text: { type: 'plain_text', text: `Done: ${clean(r.text, 28)}${r.text.length > 28 ? '…' : ''}` }, value: JSON.stringify({ id: r.id }) });
/** One owner's line for one brand: the items due today and the ones overdue, a Done button each (5 at most, Slack's limit). */
export function reminderMessage(brandName, owner, items, today) {
  const late = items.filter(i => i.due < today), due = items.filter(i => i.due === today);
  const who = owner || 'Nobody owns these';
  const head = `*${sEsc(who)}*, ${brandName ? sEsc(brandName) + ': ' : ''}${due.length ? `${due.length} due today` : ''}${due.length && late.length ? ', ' : ''}${late.length ? `${late.length} overdue` : ''}.`;
  const lines = items.map(i => `• ${i.kind === 'brief' ? 'Brief: ' : ''}${sEsc(i.text)}${i.asana_url ? ` <${i.asana_url}|Asana>` : ''}${i.due < today ? ` _(was due ${md(i.due)})_` : ''}`);
  const text = [head, ...lines].join('\n');
  const blocks = [{ type: 'section', text: { type: 'mrkdwn', text: text.slice(0, 2900) } }];
  const btns = items.slice(0, 4).map((r, n) => DONE_BTN(r, n));
  btns.push({ type: 'button', action_id: 'noop_open', text: { type: 'plain_text', text: 'Open in Locus' }, url: `${LOCUS}?open=actions${items[0].act_id ? `&act=${encodeURIComponent(items[0].act_id)}` : ''}` });
  blocks.push({ type: 'actions', elements: btns });
  blocks.push({ type: 'context', elements: [{ type: 'mrkdwn', text: 'Press Done, or react ✅ to this message to mark every item in it done.' }] });
  return { text, blocks };
}

export async function actionTick(env, d) {
  if ((await getSetting(env, 'actionRemind')) === 'off') return { skipped: 'off' };
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
    let channel = act ? (brand?.slack_channel || null) : (strat || null);
    if (!channel) {
      const email = items[0].owner_email || emailOf(owner);
      if (email && d.slackApi) { const u = await d.slackApi(env, 'users.lookupByEmail', { email }).catch(() => null); if (u?.ok && u.user?.id && !u.user.is_bot) channel = u.user.id; }
    }
    if (!channel) { out.skipped.push({ act, owner, why: 'no channel' }); continue; }
    const msg = reminderMessage(brand ? brand.name : (act ? act : ''), owner, items, today);
    try {
      const r = await d.slackPost(env, channel, msg.text, msg.blocks, { username: 'Locus' });
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
async function slackName(env, d, userId) {
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
  if (!results || !results.length) return { ignored: 'not a reminder' };
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
      return json({ items, brands: brands.map(b => ({ act_id: b.act_id, name: b.name })), team: ROSTER.map(r => r.name), remind: (await getSetting(env, 'actionRemind')) !== 'off' });
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
    return json({ error: 'not found' }, 404);
  } catch (e) { return json({ error: e.message }, e.status || 500); }
}

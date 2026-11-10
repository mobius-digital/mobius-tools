/* MY WORK (2026-11-10). One person's list, asked for by the strategists on the Nov 9 team call.
 * Noma: "a personal to do list", "a little digital office where it's brainstorming", "I can archive and store", "anything
 * I'm tagged on... just DM it to myself". Ahsan: "what's my task list?... It sends me every morning." Cole approved it.
 * Approved preview (real data, Nov 10): the clickable mock built in the harness (mywork.html).
 *
 * Where every list comes from (read only; nothing here copies a source):
 *   Tasks    open p_action rows owned by the person (actions.js). Tick = /api/actions/done, the task's own done.
 *   Cards    Production cards (production.js listBoard) whose assignee is the person, Brief / Making / Review / Ready.
 *            Late = past due and not yet approved (Ready is never late), the same rule as the board.
 *   Slack    slack_msg (slackindex.js): messages in a brand's INTERNAL channel from the last 7 days that @mention the
 *            person's Slack id, by a person (not a bot: the bots' reminders are the tasks and cards already here),
 *            one per thread (the newest), dropped once the person has replied in that thread after it.
 *   Plan     the latest Monday call (p_call kind monday, last 7 days): state.brands[act].batches and eplan lines voted
 *            Yes or Changes go to the brand's strategist (STRAT below, the same map as profit/callscreen.js); gplan
 *            lines go to Radhesh. A line with its own owner goes to that owner.
 *   One line said twice (a plan line that became a card, a task with the same words) shows once.
 * Buckets: Late (past due), Today (Slack asks, tasks due today or with no date, cards due today or tomorrow), This week
 * (everything else, Monday plan lines included).
 *
 * Tables (created on first use; this worker owns them, all p_*):
 *   p_mywork_note   (who PK, text, updated_at)                     the Brainstorm pad, one per person
 *   p_mywork_saved  (id PK, who, kind ad | idea, text, brand, link, thumb, note, created_at)   Saved
 *   p_mywork_done   (who, key, at; PK who + key)                   a Slack ask, a card or a plan line ticked off here
 *                                                                  (a task is ticked on the task itself)
 * Routes (team only; not on brandguard CLIENT_RULES, and refused again for a client scope here). The owner (Cole, or the
 * admin token) may open anyone; a teammate opens only themself (?who= someone else = 403).
 *   GET  /api/mywork?who=<name|email>                    the merged lists, Brainstorm, Saved and the 5am DM preview
 *   PUT  /api/mywork/note   {who, text}                   the Brainstorm pad (autosave)
 *   PUT  /api/mywork/saved  {who, kind, text, brand, link, note} add; {who, id, remove: true} remove
 *   PUT  /api/mywork/done   {who, key, done}              tick off (or back on) a Slack ask, card or plan line
 *
 * The 5am DM (myWorkDmTick, account-health hourly tick): weekdays, 5:00 to 5:59 Central, once per person per day
 * (settings stamp myworkDm:<date>:<name>), to the people in settings.myworkDmPeople (default Noma and Ahsan). Lane
 * format like callnudge.js: *MY WORK · Today*, the person tagged once, bullets, a link to ?open=mywork. Nothing open =
 * no DM. Switch: settings.myworkDm = 'off' stops it. Metered with subCanAfford (d.canAfford). No em dashes anywhere.
 */
import { listActions, ROSTER } from './actions.js';
import { listBoard } from './production.js';
import { DEFAULT_PEOPLE } from './checkin.js';
import { permalink } from './slackindex.js';

const LOCUS = 'https://locus.go-mobius-digital.com/profit/';
export const MYWORK_LINK = `${LOCUS}?open=mywork`;
const COLE_UID = 'U06C37MDWD7';
const DM_PEOPLE = ['Noma', 'Ahsan'];
const SLACK_DAYS = 7;
/* Who runs each brand's Meta (Cole, Nov 9 call). Same map as profit/callscreen.js STRAT; change both together. */
export const STRAT = { brand_dartee_golf: 'Noma', brand_bonk_golf: 'Noma', brand_ice_and_gold: 'Noma', brand_yak_sports: 'Noma', brand_party_patch: 'Noma', brand_grunk_dolfer: 'Ahsan', brand_lucky_golf: 'Ahsan', brand_vetripaws: 'Ahsan', brand_speedin: 'Ahsan' };
const ROLE = { Cole: 'Owner', Ahsan: 'Strategist', Noma: 'Strategist', William: 'Designer', Ravo: 'Video', Radhesh: 'Google', Hamza: 'Amazon' };
const OPEN_COLS = ['brief', 'making', 'review', 'ready'];
const SRC = { meeting: 'From a call', monday: 'Monday call', today: 'Today', strategist: 'The Strategist', manual: 'Added in Locus' };

const safe = (s, d) => { try { return s == null ? d : JSON.parse(s); } catch { return d; } };
const clean = (s, n = 200) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, n);
const noDash = s => String(s ?? '').replace(/\s*[\u2014\u2013]\s*/g, ', ');
const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const md = text => ({ type: 'mrkdwn', text });
const now = () => new Date().toISOString();
const addDays = (ymd, n) => { const d = new Date(ymd + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const mondayOf = ymd => { const d = new Date(ymd + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7)); return d.toISOString().slice(0, 10); };
const dow = ymd => new Date(ymd + 'T12:00:00Z').getUTCDay();
const dayLabel = ymd => new Date(ymd + 'T12:00:00Z').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' }).replace(',', '');
const tsDay = ts => new Date(Number(String(ts).split('.')[0]) * 1000).toLocaleDateString('en-CA', { timeZone: 'America/Chicago' });
const first = s => String(s || '').trim().split(/[\s@._-]/)[0].toLowerCase();
/** Is this owner / assignee field the person? Slack and Asana carry full names ("Nomaqhawe Molife"), Locus first names. */
export const isPerson = (field, name) => { const f = first(field), n = String(name || '').toLowerCase(); return !!f && !!n && (f === n || f.startsWith(n)); };
const norm = s => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const err = (status, m) => Object.assign(new Error(m), { status });

let ensured = false;
export async function ensureMyWork(env) {
  if (ensured) return;
  await env.DB.batch([
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS p_mywork_note (who TEXT PRIMARY KEY, text TEXT NOT NULL DEFAULT '', updated_at TEXT)`),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS p_mywork_saved (id TEXT PRIMARY KEY, who TEXT NOT NULL, kind TEXT NOT NULL DEFAULT 'idea',
      text TEXT NOT NULL, brand TEXT, link TEXT, thumb TEXT, note TEXT, created_at TEXT NOT NULL)`),
    env.DB.prepare(`CREATE INDEX IF NOT EXISTS p_mywork_saved_who ON p_mywork_saved (who, created_at DESC)`),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS p_mywork_done (who TEXT NOT NULL, key TEXT NOT NULL, at TEXT NOT NULL, PRIMARY KEY (who, key))`),
  ]);
  ensured = true;
}

/* ---------- people ---------- */
/** The roster (actions.js, names and emails) joined to the check-in people (Slack ids and roles). Pure. */
export function peopleFrom(checkin) {
  const out = ROSTER.map(r => ({ name: r.name, email: String(r.email || '').toLowerCase(), slack: r.name === 'Cole' ? COLE_UID : '', role: ROLE[r.name] || '' }));
  for (const [uid, p] of Object.entries(checkin || {})) {
    const nm = clean(p && p.name, 30); if (!nm || !/^U[A-Z0-9]{6,}$/.test(uid)) continue;
    let o = out.find(x => x.name.toLowerCase() === nm.toLowerCase());
    if (!o) out.push(o = { name: nm, email: '', slack: '', role: '' });
    o.slack = uid;
    if (!o.role) o.role = ROLE[nm] || (p.roles || []).map(r => r[0].toUpperCase() + r.slice(1)).join(', ');
  }
  return out;
}
export async function teamPeople(env, d) {
  const set = safe(await d.getSetting(env, 'checkinPeople').catch(() => null), null);
  return peopleFrom(set && typeof set === 'object' && Object.keys(set).length ? set : DEFAULT_PEOPLE);
}
/** Who may open whose list. Owner (Cole's email, or no email = the admin token) opens anyone; a teammate only themself. Pure. */
export function access({ email, ownerEmail, people, who }) {
  const em = String(email || '').toLowerCase();
  const owner = !em || em === String(ownerEmail || '').toLowerCase();
  const want = String(who || '').trim().toLowerCase();
  const pick = want ? people.find(p => p.name.toLowerCase() === want || (p.email && p.email === want)) : null;
  if (want && !pick) return { status: 404, error: 'No one by that name on the team.' };
  if (owner) return { owner: true, person: pick || people.find(p => p.name === 'Cole') || people[0], people };
  const me = people.find(p => p.email && p.email === em);
  if (!me) return { status: 403, error: 'My work is for the team roster. Ask Cole to add you.' };
  if (pick && pick !== me) return { status: 403, error: 'You can open your own work only.' };
  return { owner: false, person: me, people: [me] };
}
const pub = p => ({ name: p.name, role: p.role || '', slack: !!p.slack });

/* ---------- reading every source once ---------- */
export async function gather(env, d, people) {
  const today = d.centralDate();
  const brands = (await d.listBrands(env).catch(() => [])) || [];
  const since = addDays(today, -SLACK_DAYS);
  const tasks = await listActions(env, { act: 'all', status: 'open' }).catch(() => []);
  const cards = await listBoard(env, d, { act: 'all' }).then(r => r.cards || []).catch(() => []);
  const call = await env.DB.prepare(`SELECT id, date, state_json FROM p_call WHERE kind = 'monday' AND date >= ?1 ORDER BY date DESC LIMIT 1`).bind(addDays(today, -7)).first().catch(() => null);
  const uids = people.map(p => p.slack).filter(Boolean);
  let mentions = [], own = [];
  if (uids.length) {
    mentions = ((await env.DB.prepare(`SELECT channel, ts, thread_ts, user, name, text, brand FROM slack_msg WHERE side = 'internal' AND bot = 0 AND day >= ?1 AND (${uids.map((_, i) => `text LIKE ?${i + 2}`).join(' OR ')}) ORDER BY CAST(ts AS REAL) DESC LIMIT 400`)
      .bind(since, ...uids.map(u => `%@${u}%`)).all().catch(() => ({ results: [] }))).results) || [];
    own = ((await env.DB.prepare(`SELECT channel, ts, thread_ts, user FROM slack_msg WHERE day >= ?1 AND user IN (${uids.map((_, i) => `?${i + 2}`).join(', ')})`)
      .bind(since, ...uids).all().catch(() => ({ results: [] }))).results) || [];
  }
  const dismissed = ((await env.DB.prepare(`SELECT who, key FROM p_mywork_done WHERE at >= ?1`).bind(addDays(today, -60)).all().catch(() => ({ results: [] }))).results) || [];
  const domain = (await d.getSetting(env, 'slackDomain').catch(() => null)) || 'mobiusdigitalhq';
  return { today, brands, tasks, cards, call, mentions, own, dismissed, domain, names: Object.fromEntries(people.filter(p => p.slack).map(p => [p.slack, p.name])) };
}

/* A Slack line, readable: @U123 becomes @Name, links and spaces tidied. */
function readable(text, names) {
  return noDash(String(text || '').replace(/@(U[A-Z0-9]{6,})/g, (m, u) => names[u] ? '@' + names[u] : m).replace(/\s+/g, ' ').trim());
}
function slackTitle(text, name) {
  const t = text.replace(new RegExp(`^(@${name}[\\s,:]*)+`, 'i'), '').trim();
  const s = (t.match(/^.{20,}?[.?!](\s|$)/) || [t])[0].trim();
  return s.length > 140 ? s.slice(0, 137).replace(/\s+\S*$/, '') + '...' : s;
}

/** One person's lists from what gather read. Pure. */
export function forPerson(g, person) {
  const today = g.today, tomorrow = addDays(today, 1);
  const bn = id => (g.brands.find(b => b.act_id === id) || {}).name || (id ? id : 'Agency');
  const done = new Set((g.dismissed || []).filter(x => x.who === person.name).map(x => x.key));
  const items = [];

  for (const t of g.tasks || []) {
    if (t.status !== 'open' || !isPerson(t.owner, person.name)) continue;
    const due = /^\d{4}-\d{2}-\d{2}$/.test(t.due || '') ? t.due : '';
    items.push({ id: `task:${t.id}`, ref: t.id, source: 'task', bucket: due && due < today ? 'late' : !due || due <= today ? 'today' : 'week',
      text: clean(t.text, 200), detail: clean(t.detail, 600), brand: bn(t.act_id), act_id: t.act_id || '', due, from: SRC[t.source] || '',
      when: t.created_at ? dayLabel(String(t.created_at).slice(0, 10)) : '', link: t.url || '', done: false });
  }
  for (const c of g.cards || []) {
    if (!OPEN_COLS.includes(c.board) || !isPerson(c.assignee, person.name)) continue;
    const due = c.due || '', late = !!due && due < today && c.board !== 'ready';
    const key = `card:${c.id}:${due}`;   // a new due date brings a ticked-off card back
    items.push({ id: key, ref: c.id, source: 'card', bucket: late ? 'late' : due && due <= tomorrow ? 'today' : 'week',
      text: clean(c.title, 200) || 'Untitled brief', num: c.num || '', column: c.board, format: c.format || '', brand: c.brand || bn(c.act_id), act_id: c.act_id || '', due,
      detail: `${c.format ? c.format + ', ' : ''}${c.board[0].toUpperCase() + c.board.slice(1)} column${c.open_notes ? `, ${c.open_notes} open note${c.open_notes === 1 ? '' : 's'}` : ''}.`,
      link: `${LOCUS}?open=production&card=${encodeURIComponent(c.id)}`, done: done.has(key) });
  }
  if (person.slack) {
    const tag = '@' + person.slack, threads = new Set();
    for (const m of g.mentions || []) {   // newest first
      if (m.user === person.slack || !String(m.text || '').includes(tag)) continue;
      const thread = m.thread_ts || m.ts, tk = `${m.channel}:${thread}`;
      if (threads.has(tk)) continue;
      threads.add(tk);
      if ((g.own || []).some(o => o.user === person.slack && o.channel === m.channel && (o.thread_ts || o.ts) === thread && Number(o.ts) > Number(m.ts))) continue;   // answered
      const text = readable(m.text, g.names || {}), key = `slack:${m.channel}:${m.ts}`;
      items.push({ id: key, source: 'slack', bucket: 'today', text: slackTitle(text, person.name) || 'You were tagged', detail: text.slice(0, 600),
        from: clean(String(m.name || '').split(' ')[0], 30), where: `${bn(m.brand)} internal`, when: dayLabel(tsDay(m.ts)), brand: bn(m.brand), act_id: m.brand || '', due: '',
        link: permalink(g.domain || 'mobiusdigitalhq', m.channel, m.ts, m.thread_ts), done: done.has(key) });
    }
  }
  if (g.call) {
    const st = safe(g.call.state_json, {}) || {};
    for (const [act, s] of Object.entries(st.brands || {})) for (const k of ['batches', 'eplan', 'gplan']) (s && s[k] || []).forEach((x, i) => {
      if (!x || x.on === false || !clean(x.text) || !['y', 'c'].includes(x.vote)) return;
      const owner = clean(x.owner, 40) || (k === 'gplan' ? 'Radhesh' : STRAT[act] || '');
      if (!isPerson(owner, person.name)) return;
      const key = `plan:${g.call.id}:${act}:${k}:${i}`;
      items.push({ id: key, source: 'call', bucket: 'week', text: noDash(clean(x.text, 200)), brand: bn(act), act_id: act, due: '',
        from: k === 'eplan' ? 'Email plan' : k === 'gplan' ? 'Google plan' : 'Meta plan',
        detail: x.vote === 'c' ? `Changes asked on the call: ${noDash(clean(x.note, 300)) || 'see the call'}` : `Approved on the Monday call, ${dayLabel(g.call.date)}.`,
        link: `${LOCUS}?open=calls&call=monday`, changes: x.vote === 'c', done: done.has(key) });
    });
  }
  /* One line said twice shows once: tasks, then cards, then Slack, then the plan. */
  const seen = new Set(), ids = new Set(), out = [];
  for (const it of items) { const n = norm(it.text); if (ids.has(it.id) || (n && seen.has(n))) continue; ids.add(it.id); if (n) seen.add(n); out.push(it); }
  const rank = i => i.due ? (Date.parse(i.due) / 864e5) : 1e9;
  out.sort((a, b) => rank(a) - rank(b));
  const open = out.filter(i => !i.done);
  const mine = Object.entries(STRAT).filter(([, n]) => n === person.name).map(([a]) => a);
  const quiet = mine.filter(a => !open.some(i => i.act_id === a)).map(bn);
  return {
    items: out, quiet, brands: mine.map(bn),
    counts: { today: open.filter(i => i.bucket === 'today').length, late: open.filter(i => i.bucket === 'late').length, week: open.filter(i => i.bucket === 'week').length, slack: open.filter(i => i.source === 'slack').length },
  };
}

/* ---------- the 5am DM ---------- */
const tagOf = it => it.source === 'card' ? `card ${it.num}` : it.source === 'slack' ? 'Slack' : it.source === 'call' ? 'Monday plan' : 'task';
/** The DM text, or null when nothing is open. Pure. */
export function dmText(r, person, today, link = MYWORK_LINK) {
  const open = (r.items || []).filter(i => !i.done);
  const T = open.filter(i => i.bucket === 'today'), L = open.filter(i => i.bucket === 'late'), W = open.filter(i => i.bucket === 'week' && i.due);
  if (!T.length && !L.length && !W.length) return null;
  const when = it => it.due === today ? ', due today' : it.due === addDays(today, 1) ? ', due tomorrow' : '';
  const head = [`${T.length} for today`, L.length ? `${L.length} late` : '', r.counts && r.counts.slack ? `${r.counts.slack} from Slack` : ''].filter(Boolean).join(', ');
  const lines = [`*MY WORK · Today*`, `${person.slack ? `<@${person.slack}>  ` : ''}${head}.`];
  for (const it of T.slice(0, 6)) lines.push(`• ${esc(clean(it.text, 120))} (${esc(it.brand)}, ${tagOf(it)}${when(it)})`);
  if (T.length > 6) lines.push(`_and ${T.length - 6} more in My work_`);
  if (L.length) {
    lines.push('*Late*');
    const by = {}; for (const it of L) (by[it.brand] = by[it.brand] || []).push(it);
    for (const [b, a] of Object.entries(by).slice(0, 5)) {
      const oldest = a.map(x => x.due).filter(Boolean).sort()[0];
      lines.push(a.length === 1 ? `• ${esc(clean(a[0].text, 100))} (${esc(b)}, ${tagOf(a[0])}${oldest ? `, due ${dayLabel(oldest)}` : ''})` : `• ${a.length} ${esc(b)} items${oldest ? `, oldest due ${dayLabel(oldest)}` : ''}`);
    }
  }
  if (W.length) { lines.push('*Coming up*'); for (const it of W.slice(0, 2)) lines.push(`• ${esc(clean(it.text, 100))} (${esc(it.brand)}, ${dayLabel(it.due)})`); }
  lines.push(`<${link}|Open My work>`);
  return noDash(lines.join('\n')).slice(0, 2900);
}
/** Weekdays, 5:00 to 5:59 Central. Pure. */
export const dmWindow = (date, hour) => { const wd = dow(date); return wd >= 1 && wd <= 5 && hour === 5; };
export async function dmPeople(env, d) {
  const set = safe(await d.getSetting(env, 'myworkDmPeople').catch(() => null), null);
  return Array.isArray(set) ? set.map(x => clean(x, 30)).filter(Boolean) : DM_PEOPLE;
}

export async function myWorkDmTick(env, d) {
  if ((await d.getSetting(env, 'myworkDm')) === 'off') return { skipped: 'off' };
  const date = d.centralDate(), hour = d.centralHour();
  if (!dmWindow(date, hour)) return { skipped: 'outside 5am on a weekday' };
  const people = await teamPeople(env, d), names = await dmPeople(env, d);
  const due = [];
  for (const nm of names) {
    const p = people.find(x => x.name.toLowerCase() === nm.toLowerCase());
    if (p && p.slack && !(await d.getSetting(env, `myworkDm:${date}:${p.name}`))) due.push(p);
  }
  if (!due.length) return { sent: [], note: 'everyone had theirs' };
  if (d.canAfford && !d.canAfford(20)) return { deferred: 'out of subrequest budget, the next tick in the hour picks it up' };
  await ensureMyWork(env);
  const g = await (d.gather || gather)(env, d, people);
  const out = { sent: [], empty: [], failed: [] };
  for (const p of due) {
    if (d.canAfford && !d.canAfford(3)) { out.deferred = 'budget'; break; }
    const text = dmText(forPerson(g, p), p, g.today);
    if (text) {
      const r = await d.slackApi(env, 'chat.postMessage', { channel: p.slack, text, blocks: [{ type: 'section', text: md(text) }] }).catch(e => ({ ok: false, error: e.message }));
      if (!r || !r.ok) { out.failed.push(`${p.name}: ${(r && r.error) || 'no answer'}`); continue; }
      out.sent.push(p.name);
    } else out.empty.push(p.name);
    await d.putSetting(env, `myworkDm:${date}:${p.name}`, now());
  }
  return out;
}

/* ---------- Brainstorm and Saved ---------- */
async function readNote(env, who) { return (await env.DB.prepare(`SELECT text, updated_at FROM p_mywork_note WHERE who = ?1`).bind(who).first()) || { text: '', updated_at: null }; }
async function listSaved(env, who) { return (await env.DB.prepare(`SELECT id, kind, text, brand, link, thumb, note, created_at FROM p_mywork_saved WHERE who = ?1 ORDER BY created_at DESC LIMIT 200`).bind(who).all()).results || []; }
const okLink = s => /^https:\/\/[^\s<>"]+$/.test(String(s || '')) ? String(s).slice(0, 500) : null;

export async function handleMyWork(request, env, url, path, json, d) {
  if (path !== '/api/mywork' && !path.startsWith('/api/mywork/')) return null;
  if (!(await d.isAdmin(request, env))) return json({ error: 'unauthorized' }, 401);
  if (d.clientScope && d.clientScope(request)) return json({ error: 'The team\'s page.' }, 403);
  try {
    const body = request.method === 'GET' ? {} : await request.json().catch(() => ({}));
    const people = await teamPeople(env, d);
    const a = access({ email: await d.sessionEmail(env, request).catch(() => null), ownerEmail: env.OWNER_EMAIL || 'cole@go-mobius-digital.com', people, who: url.searchParams.get('who') || body.who || '' });
    if (a.error) return json({ error: a.error }, a.status);
    await ensureMyWork(env);
    const who = a.person.name;
    if (path === '/api/mywork' && request.method === 'GET') {
      const g = await gather(env, d, people);
      const r = forPerson(g, a.person);
      const list = await dmPeople(env, d), off = (await d.getSetting(env, 'myworkDm')) === 'off';
      return json({ today: g.today, owner: a.owner, people: a.people.map(pub), person: pub(a.person), ...r,
        note: await readNote(env, who), saved: await listSaved(env, who),
        dm: { on: !off && !!a.person.slack && list.some(n => n.toLowerCase() === who.toLowerCase()), text: dmText(r, a.person, g.today), at: '5:00am Central, weekdays' } });
    }
    if (request.method !== 'PUT' && request.method !== 'POST') return json({ error: 'not found' }, 404);
    if (path === '/api/mywork/note') {
      const text = String(body.text ?? '').replace(/\r/g, '').slice(0, 20000), at = now();
      await env.DB.prepare(`INSERT INTO p_mywork_note (who, text, updated_at) VALUES (?1, ?2, ?3) ON CONFLICT (who) DO UPDATE SET text = excluded.text, updated_at = excluded.updated_at`).bind(who, text, at).run();
      return json({ ok: true, at });
    }
    if (path === '/api/mywork/saved') {
      if (body.remove) await env.DB.prepare(`DELETE FROM p_mywork_saved WHERE id = ?1 AND who = ?2`).bind(String(body.id || ''), who).run();
      else {
        const text = noDash(clean(body.text, 1000));
        if (!text) throw err(400, 'Write what to save first.');
        await env.DB.prepare(`INSERT INTO p_mywork_saved (id, who, kind, text, brand, link, thumb, note, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)`)
          .bind(crypto.randomUUID(), who, body.kind === 'ad' ? 'ad' : 'idea', text, clean(body.brand, 60) || null, okLink(body.link), okLink(body.thumb), noDash(clean(body.note, 300)) || null, now()).run();
      }
      return json({ ok: true, saved: await listSaved(env, who) });
    }
    if (path === '/api/mywork/done') {
      const key = String(body.key || '');
      if (!/^(slack|card|plan):[\w:.-]{3,200}$/.test(key)) throw err(400, 'Tick a Slack ask, a card or a plan line here; a task is ticked on the task.');
      if (body.done === false) await env.DB.prepare(`DELETE FROM p_mywork_done WHERE who = ?1 AND key = ?2`).bind(who, key).run();
      else await env.DB.prepare(`INSERT OR REPLACE INTO p_mywork_done (who, key, at) VALUES (?1, ?2, ?3)`).bind(who, key, now()).run();
      return json({ ok: true });
    }
    return json({ error: 'not found' }, 404);
  } catch (e) { return json({ error: e.message }, e.status || 500); }
}

export const _test = { peopleFrom, access, forPerson, dmText, dmWindow, isPerson, myWorkDmTick, handleMyWork, slackTitle };

/* THE MORNING CARD (2026-10-13, docs/handoffs/morning-card.md; Cole approved the "One Card a Day" page).
 *
 * Cole: the internal channels are for people talking, and they were drowning (Dartee, Oct 13: five bot posts and
 * ~60 lines before 9am, one human post). He wants Locus "there before you wake up". So each active brand gets ONE
 * Block Kit message a day in its INTERNAL channel (brand_accounts.slack_channel, never brief_channel; a brand whose
 * internal channel is its client channel is skipped), at the morning hour (settings.morningHour, Central, default 5):
 *   line 1  <Brand> · <Tue Oct 13>
 *   line 2  Yesterday $1,438 (plan $1,800) · MER 2.11x · client daily sent 5:12   (the stored brief's numbers, no new math)
 *   then at most 5 lines, each a thing a person must do today, each starting with that person's Slack tag:
 *           Today's calls as ONE line (count + money at stake, profit /api/hub/today like todaypost.js), each task due
 *           today or overdue (p_action), a calendar date going live tomorrow with something still open, Production
 *           cards that are late (p_br_batch via production.js listBoard). More than 5 = the first 5 by money or
 *           lateness and "and N more in Locus".
 *   one "Client owes" line when a Requests ask is open; on Monday the weekly line (the card is the Monday thread anchor).
 *   Buttons: "Open <Brand> in Locus", and "Make the calls" when there are calls (one actions block per button: the
 *   router acks only the action id noop_open, and an id must be unique inside a block).
 * Its THREAD, posted right after: the full Today's calls list (todaypost.js messageFor) and one reminder line per owner
 * with the Done buttons (actions.js reminderMessage; the p_action rows point at that reply so Done and ✅ work there).
 *
 * The card keeps itself up to date (chat.update, never a new post): a task done anywhere (actions.js onActionDone), a
 * call made on the page (cardCallMade), a Production card moved on or judged (cardProdDone), the client daily sent
 * later (cardBriefState), a ✅ on the card itself (cardReaction: every task line done).
 * Everything later in the day goes in the card's thread: teamPost() posts a reply under today's card in that channel,
 * with the person tagged, and falls back to a top-level post when the channel has no card today.
 *
 * State (settings): `morningCard:<act>:<date>` = the card {channel, ts, items...}; `morningCardIdx:<date>` = {channel:
 * act} so any module finds today's card by channel in one read; `morningCardDone` = {date, acts, tries};
 * `slackIds` = {first name: {id, at}} (roster email -> users.lookupByEmail, else one users.list match). Switch:
 * settings.morningCard ('off' stops it and everything posts top-level again). */
import { SKIP as PAUSED } from './moved.js';
import { readToday, messageFor } from './todaypost.js';
import { ensureActions, markDone, reminderMessage, ROSTER } from './actions.js';

const LOCUS = 'https://tools.go-mobius-digital.com/profit/';
export const DEFAULT_MORNING_HOUR = 5;
export const MAX_LINES = 5;
export const LEAK_FLOOR = 500;   // dollars a month: a new leak under this never reaches the card
const WAIT_HOURS = 2;     // wait up to two hours past the morning hour for the brief (and Monday's weekly) before posting anyway
const LAST_HOUR = 12;
const NOT_OURS = /harborline/i;
const CALL_KINDS = ['scale', 'cut', 'trim', 'refresh'];
const VERB = { scale: 'scale', cut: 'cut', trim: 'trim', refresh: 'refresh' };
const BOARD = { brief: 'Brief', making: 'Making', review: 'Review', ready: 'Ready', live: 'Live' };

const safe = (s, d) => { try { return s == null ? d : JSON.parse(s); } catch { return d; } };
const clean = (s, n = 200) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, n);
/* Cut at a word, with an ellipsis, so a long line never ends mid-word. */
const words = (s, n) => { const t = clean(s, 1000); if (t.length <= n) return t; const cut = t.slice(0, n - 1); return cut.slice(0, Math.max(cut.lastIndexOf(' '), Math.floor(n * 0.6))).replace(/[ ,;:.]+$/, '') + '…'; };
const ago = n => (n <= 0 ? 'asked today' : n === 1 ? '1 day' : `${n} days`);
const esc = s =>String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const addDays = (ymd, n) => { const d = new Date(ymd + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const daysBetween = (a, b) => Math.round((Date.parse(b + 'T12:00:00Z') - Date.parse(a + 'T12:00:00Z')) / 864e5);
const centralToday = () => new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Chicago' })).toISOString().slice(0, 10);
const dayOf = d => (d && d.centralDate ? d.centralDate() : centralToday());
const dayLabel = ymd => new Date(ymd + 'T12:00:00Z').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' }).replace(',', '');
const sym = c => (!c || c === 'USD' ? '$' : c === 'GBP' ? '£' : c === 'EUR' ? '€' : c === 'CAD' ? 'CA$' : c === 'AUD' ? 'A$' : c + ' ');
const money = (n, c) => sym(c) + Math.round(n).toLocaleString('en-US');
const moneyK = (n, c) => Math.abs(n) >= 1000 ? `${sym(c)}${(n / 1000).toFixed(1)}K` : money(n, c);
const hm = iso => { try { return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'America/Chicago' }).replace(/\s?[AP]M$/, ''); } catch { return ''; } };

async function getSetting(env, k) { const r = await env.DB.prepare(`SELECT value FROM settings WHERE key = ?1`).bind(k).first().catch(() => null); return r?.value ?? null; }
async function putSetting(env, k, v) { await env.DB.prepare(`INSERT INTO settings (key, value) VALUES (?1, ?2) ON CONFLICT(key) DO UPDATE SET value = excluded.value`).bind(k, String(v)).run(); }

/** The one hour every morning post goes out (Central). morningHour, else the old briefHour, else 5. */
export async function morningHour(env) {
  for (const k of ['morningHour', 'briefHour']) {
    const raw = await getSetting(env, k);
    const h = raw == null || raw === '' ? NaN : +raw;
    if (Number.isInteger(h) && h >= 0 && h <= 23) return h;
  }
  return DEFAULT_MORNING_HOUR;
}
export async function cardOn(env) { return (await getSetting(env, 'morningCard')) !== 'off'; }
/** Brands that get a card: active (the caller lists them), not paused, not The Golf Sock, not Harborline, not a demo. */
export const eligible = a => !PAUSED.test(a.name || '') && !NOT_OURS.test(a.name || '') && !/^demo_/.test(a.act_id || '');

/* ---------- where today's card lives ---------- */
const cardKey = (act, date) => `morningCard:${act}:${date}`;
export async function loadCard(env, act, date) { return safe(await getSetting(env, cardKey(act, date)), null); }
async function saveCard(env, c) {
  await putSetting(env, cardKey(c.act, c.date), JSON.stringify(c));
  if (c.channel && c.ts) {
    const idx = safe(await getSetting(env, `morningCardIdx:${c.date}`), {}) || {};
    if (idx[c.channel] !== c.act) { idx[c.channel] = c.act; await putSetting(env, `morningCardIdx:${c.date}`, JSON.stringify(idx)); }
  }
}
/** Today's card in a channel, or null. */
export async function todaysCard(env, channel, date) {
  if (!channel) return null;
  const day = date || centralToday();
  const idx = safe(await getSetting(env, `morningCardIdx:${day}`), {}) || {};
  if (!idx[channel]) return null;
  const c = await loadCard(env, idx[channel], day);
  return c && c.ts && c.channel === channel ? c : null;
}

/* ---------- Slack ids: first name -> <@U...> ---------- */
export async function slackIdOf(env, d, name) {
  /* By FIRST name: Asana gives "William Sampindi", the roster says "William"; "Nomaqhawe" is the roster's "Noma". */
  const first = clean(name, 40).toLowerCase().split(' ')[0];
  const k = (ROSTER.find(x => first === x.name.toLowerCase() || (x.name.length >= 4 && first.startsWith(x.name.toLowerCase()))) || {}).name?.toLowerCase() || first;
  if (!k || !d || !d.slackApi) return null;
  const today = dayOf(d);
  const cache = safe(await getSetting(env, 'slackIds'), {}) || {};
  const hit = cache[k];
  if (hit && (hit.id || hit.at === today)) return hit.id || null;
  let id = null;
  const r = ROSTER.find(x => x.name.toLowerCase() === k);
  if (r && r.email) {
    const u = await d.slackApi(env, 'users.lookupByEmail', { email: r.email }).catch(() => null);
    if (u && u.ok && u.user && u.user.id && !u.user.is_bot) id = u.user.id;
  }
  if (!id && /^[a-z][a-z' -]{1,30}$/.test(k)) {
    /* No roster email (Radhesh, Hamza): one users.list, matched on the first name, only when exactly one person fits. */
    const L = await d.slackApi(env, 'users.list', { limit: 500 }).catch(() => null);
    const first = m => String(m.profile?.first_name || m.real_name || m.profile?.display_name || m.name || '').trim().split(/\s+/)[0].toLowerCase();
    const fits = (L && L.ok ? L.members || [] : []).filter(m => !m.deleted && !m.is_bot && m.id !== 'USLACKBOT' && first(m) === k);
    if (fits.length === 1) id = fits[0].id;
  }
  cache[k] = { id: id || '', at: today };
  await putSetting(env, 'slackIds', JSON.stringify(cache)).catch(() => {});
  return id;
}
/** The tag that starts a line: <@U...> when Slack knows the person, the bold first name when it does not. */
export async function tagOf(env, d, name) {
  const n = clean(name, 40).split(' ')[0];
  if (!n) return null;
  const id = await slackIdOf(env, d, n);
  if (id) return `<@${id}>`;
  return /^[A-Z][a-z]+$/.test(n) ? `*${esc(n)}*` : null;
}

/** A team post that belongs under today's card: a reply in its thread (the person tagged, so they still get the
 *  notification, no reply_broadcast), else a top-level post as before. Same signature as slackPost plus opts.tag
 *  (a ready-made tag string) or opts.tagName (a first name to resolve). */
export async function teamPost(env, d, channel, text, blocks, opts = {}) {
  const { tag: t0, tagName, ...rest } = opts;
  const card = channel ? await todaysCard(env, channel, dayOf(d)).catch(() => null) : null;
  if (!card) return d.slackPost(env, channel, text, blocks, rest);
  const tag = t0 || (tagName ? await tagOf(env, d, tagName) : null);
  const pre = s => (tag ? `${tag} ${s}` : s);
  let b = blocks;
  if (tag && Array.isArray(b) && b[0] && b[0].type === 'section' && b[0].text && b[0].text.type === 'mrkdwn') b = [{ ...b[0], text: { ...b[0].text, text: pre(b[0].text.text) } }, ...b.slice(1)];
  return d.slackPost(env, channel, pre(text), b, { ...rest, thread_ts: card.ts });
}

/* ---------- what goes on the card ---------- */
/** The client daily's state, from the briefs row (the same row the brief card renders from). */
function dailyState(a, row) {
  if (!a.brief_enabled) return '';
  if (!row) return 'client daily not written yet';
  if (row.status === 'sent') return `client daily sent ${hm(row.posted_at)}`.trim();
  if (row.status === 'draft') return 'client daily waiting for your OK';
  if (row.status === 'handled') return 'daily brief written (no client channel)';
  if (row.status === 'skipped') { const m = String(row.text || '').match(/^No daily today: the (\w+) report/); return m ? `no client daily today, the ${m[1]} report covers it` : 'client daily skipped'; }
  return `client daily ${row.status}`;
}
function numbersLine(a, row) {
  const day = safe(row && row.data_json, {})?.day;
  const act = day && day.a, plan = day && day.f, cur = a.currency;
  if (!act || act.sales == null) return 'Yesterday\'s numbers are not in yet';
  const parts = [`Yesterday ${money(act.sales, cur)}${plan && plan.sales ? ` (plan ${money(plan.sales, cur)})` : ''}`];
  if (act.mer != null && isFinite(act.mer)) parts.push(`MER ${(+act.mer).toFixed(2)}x`);
  return parts.join(' · ');
}
/** "cut 9 ad sets, scale 1 · $2.4K at stake". */
export function callsText(rows, cur) {
  const list = (rows || []).filter(r => CALL_KINDS.includes(r.kind));
  if (!list.length) return null;
  /* The biggest group first ("cut 9 ad sets, scale 1"), ties in the page's order. */
  const kinds = CALL_KINDS.slice().sort((p, q) => list.filter(r => r.kind === q).length - list.filter(r => r.kind === p).length);
  const parts = kinds.map(k => {
    const of = list.filter(r => r.kind === k);
    if (!of.length) return null;
    const ads = of.every(r => r.ad), sets = of.every(r => !r.ad);
    return `${VERB[k]} ${of.length}${ads ? ` ad${of.length === 1 ? '' : 's'}` : sets ? ` ad set${of.length === 1 ? '' : 's'}` : ''}`;
  }).filter(Boolean);
  /* The first noun stays, the rest drop it once it repeats: "cut 9 ad sets, scale 1". */
  for (let i = 1; i < parts.length; i++) parts[i] = parts[i].replace(/ ad sets?$| ads?$/, '');
  const stake = list.reduce((s, r) => s + (+r.stake || 0), 0);
  return `Today's calls: ${parts.join(', ')}${stake > 0 ? ` · ${moneyK(stake, cur || list[0].currency)} at stake` : ''}`;
}

/** Everything the card says for one brand, read but not posted. shared = {calendar, board} read once per tick. */
export async function buildCard(env, d, a, today, shared = {}) {
  const yday = addDays(today, -1), tomorrow = addDays(today, 1);
  const monday = new Date(today + 'T12:00:00Z').getUTCDay() === 1;
  const brief = await env.DB.prepare(`SELECT status, posted_at, text, data_json FROM briefs WHERE act_id = ?1 AND date = ?2`).bind(a.act_id, yday).first().catch(() => null);
  const items = [], notes = [];
  /* Today's calls: one line, the media buyer tagged. */
  let rows = null;
  try { rows = ((await readToday(env, d, a.act_id)) || {}).rows || []; } catch (e) { notes.push(`calls: ${e.message}`); }
  const calls = (rows || []).filter(r => CALL_KINDS.includes(r.kind));
  const team = shared.team && shared.team[a.act_id] || {};
  if (calls.length) {
    items.push({ key: 'calls', kind: 'calls', text: callsText(calls, a.currency), who: team.buyer || 'Ahsan', objs: [...new Set(calls.map(r => String(r.ad_id || r.adset_id || '')).filter(Boolean))], made: [], rank: 1e12 + calls.reduce((s, r) => s + (+r.stake || 0), 0) });
  }
  /* Tasks due today or overdue. */
  await ensureActions(env);
  const tasks = (await env.DB.prepare(`SELECT * FROM p_action WHERE status = 'open' AND act_id = ?1 AND due != '' AND due <= ?2 ORDER BY due, created_at`).bind(a.act_id, today).all().catch(() => ({ results: [] }))).results || [];
  for (const t of tasks) {
    const late = daysBetween(t.due, today);
    items.push({ key: `task:${t.id}`, kind: 'task', text: `${t.kind === 'brief' ? 'Brief: ' : ''}${words(t.text, 110)} · ${late > 0 ? `${late} day${late === 1 ? '' : 's'} late` : 'due today'}`, who: t.owner || '', ids: [t.id], rank: late > 0 ? late * 1000 : 1 });
  }
  /* A date going live tomorrow with something still open. */
  for (const e of ((shared.calendar && shared.calendar.items) || []).filter(x => x.act === a.act_id && x.start === tomorrow)) {
    const open = (e.steps || []).filter(s => s.state !== 'done');
    if (!open.length) continue;
    items.push({ key: `cal:${e.id}`, kind: 'cal', text: `Live tomorrow: ${clean(e.name, 80)} · not yet: ${open.map(s => String(s.label || '').toLowerCase()).join(', ')}`, who: /^[A-Z][a-z]+$/.test(open[0].who || '') ? open[0].who : (team.strat || ''), rank: 500 });
  }
  /* Production cards that are late, by up to 30 days (Lucky had a Brief card 123 days late on 2026-10-13: an old card
     nobody closed is not today's job, and it would push real work off the five lines). */
  for (const c of ((shared.board && shared.board.cards) || []).filter(x => x.act_id === a.act_id && x.late)) {
    const late = daysBetween(c.due, today);
    if (late > 30) continue;
    items.push({ key: `prod:${c.id}`, kind: 'prod', id: c.id, text: `${c.num ? `${c.num} - ` : ''}${clean(c.title, 80)} · ${BOARD[c.board] || c.board} · ${late} day${late === 1 ? '' : 's'} late`, who: c.assignee || team.strat || '', rank: late * 1000 });
  }
  /* The leak finder (2026-10-13, leaks.js): ONE line when a NEW leak over LEAK_FLOOR a month appeared since yesterday's
     card (leak ids are kept on the card), tagged to its owner from the brand's roster. The first day only records the
     ids, so nothing is announced as new just because the finder is new. */
  let leakIds = null;
  if (d.leaks && (!d.canAfford || d.canAfford(30))) {
    try {
      /* Monday's card runs the AI check for the brand (the weekly check that replaced Viktor's report, ~6 cents a brand);
         every other day reads the list with the last check's verdicts, at no AI cost. */
      const L = await d.leaks(env, a.act_id, { ai: monday });
      const big = ((L && L.leaks) || []).filter(l => (l.cost || 0) >= LEAK_FLOOR);
      leakIds = big.map(l => l.id);
      const prev = (await loadCard(env, a.act_id, yday))?.leaks;
      const nw = Array.isArray(prev) ? big.find(l => !prev.includes(l.id)) : null;
      if (nw) items.push({ key: `leak:${nw.id}`, kind: 'leak', text: `New leak: ${clean(nw.title, 90)} · ${moneyK(nw.cost, a.currency)} a month, est. (Home > Day check)`, who: nw.owner || '', rank: nw.cost });
    } catch (e) { notes.push(`leaks: ${e.message}`); }
  }
  items.sort((p, q) => q.rank - p.rank);
  const shown = items.slice(0, MAX_LINES);
  for (const it of shown) { it.tag = await tagOf(env, d, it.who).catch(() => null); it.done = false; delete it.rank; }
  /* What the client owes us (Requests asks), one line. */
  const asks = (await env.DB.prepare(`SELECT id, title, created_at FROM p_request WHERE act_id = ?1 AND kind = 'ask' AND status = 'open' ORDER BY created_at`).bind(a.act_id).all().catch(() => ({ results: [] }))).results || [];
  const owes = asks.length ? `${words(asks[0].title, 80)} · ${ago(daysBetween(String(asks[0].created_at || today).slice(0, 10), today))}${asks.length > 1 ? ` (and ${asks.length - 1} more)` : ''}` : '';
  /* Monday: the weekly report line; the plan goes in this card's thread. */
  let weekly = '';
  if (monday) {
    const rep = await env.DB.prepare(`SELECT status FROM reports WHERE act_id = ?1 AND period = 'weekly' AND period_start = ?2`).bind(a.act_id, addDays(today, -7)).first().catch(() => null);
    weekly = rep ? 'Weekly report drafted · write this week\'s plan in this thread' : 'Weekly report not drafted yet · write this week\'s plan in this thread';
  }
  return {
    act: a.act_id, name: a.name, date: today, channel: a.slack_channel || null, ts: null,
    nums: numbersLine(a, brief), daily: dailyState(a, brief), items: shown, more: items.length - shown.length,
    owes, weekly, calls: calls.length > 0, notes, leaks: leakIds,
    /* For the thread only; never stored. */
    _rows: rows || [], _tasks: tasks,
  };
}

/** The card as Slack draws it. Done lines are struck through. */
export function cardMessage(c) {
  const L = [`*${esc(c.name)} · ${dayLabel(c.date)}*`, [esc(c.nums), esc(c.daily)].filter(Boolean).join(' · ')];
  for (const it of c.items || []) {
    const note = it.kind === 'calls' && (it.made || []).length && !it.done ? ` · ${it.made.length} of ${(it.objs || []).length} made` : '';
    const body = it.done ? `~${esc(it.text)}~ ✓` : `${esc(it.text)}${note}`;
    L.push(it.tag ? `${it.tag} ${body}` : body);
  }
  if (c.more > 0) L.push(`_and ${c.more} more in Locus_`);
  if (c.owes) L.push(`*Client owes* ${esc(c.owes)}`);
  if (c.weekly) L.push(esc(c.weekly));
  const text = L.join('\n');
  const btn = (label, url) => ({ type: 'actions', elements: [{ type: 'button', action_id: 'noop_open', text: { type: 'plain_text', text: label.slice(0, 75) }, url }] });
  const blocks = [{ type: 'section', text: { type: 'mrkdwn', text: text.slice(0, 2900) } }, btn(`Open ${c.name} in Locus`, `${LOCUS}?act=${encodeURIComponent(c.act)}`)];
  if (c.calls) blocks.push(btn('Make the calls', `${LOCUS}?open=today&act=${encodeURIComponent(c.act)}`));
  return { text, blocks };
}
/** The card as plain words, for the Locus preview: tags shown as @Name, bold and italics dropped. */
export function cardPlain(c) {
  return (c.items || []).reduce((s, it) => s.split(it.tag || '\u0000').join(`@${clean(it.who, 40).split(' ')[0]}`), cardMessage(c).text)
    .replace(/<@[A-Z0-9]+>/g, '@someone').replace(/\*([^*\n]+)\*/g, '$1').replace(/(^|\s)_([^_\n]+)_/g, '$1$2').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
}

/** Redraw today's card in place (chat.update raises no notification, which is the point). */
async function redraw(env, d, c) {
  await saveCard(env, c);
  if (!c.ts || !c.channel || !d.slackApi) return false;
  const m = cardMessage(c);
  const r = await d.slackApi(env, 'chat.update', { channel: c.channel, ts: c.ts, text: m.text, blocks: m.blocks }).catch(() => null);
  return !!(r && r.ok !== false);
}

/* ---------- posting ---------- */
/** Is the brand's morning in? The brief for yesterday (any final state) and, on Monday, the weekly report row. */
async function readiness(env, a, today) {
  if (a.brief_enabled) {
    const b = await env.DB.prepare(`SELECT status FROM briefs WHERE act_id = ?1 AND date = ?2`).bind(a.act_id, addDays(today, -1)).first().catch(() => null);
    if (!b || !['sent', 'draft', 'handled', 'skipped'].includes(b.status)) return { ok: false, why: 'the brief is not written yet' };
  }
  if (new Date(today + 'T12:00:00Z').getUTCDay() === 1 && safe(a.report_config_json, {})?.weekly !== false) {
    const r = await env.DB.prepare(`SELECT 1 AS x FROM reports WHERE act_id = ?1 AND period = 'weekly' AND period_start = ?2`).bind(a.act_id, addDays(today, -7)).first().catch(() => null);
    if (!r) return { ok: false, why: 'the weekly report is not drafted yet' };
  }
  return { ok: true };
}

/** Post one brand's card and its thread. Returns the stored card. */
export async function postCard(env, d, a, today, shared = {}) {
  const c = await buildCard(env, d, a, today, shared);
  const { _rows, _tasks, ...card } = c;
  const m = cardMessage(card);
  const p = await d.slackPost(env, a.slack_channel, m.text, m.blocks, { username: 'Locus' });
  card.channel = (p && p.channel) || a.slack_channel; card.ts = (p && (p.ts || p.message?.ts)) || null;
  card.thread = [];
  await saveCard(env, card);
  if (!card.ts) return card;
  /* The thread: the full calls list, then one reminder line per owner with its Done buttons. Nothing else at 5am. */
  const calls = messageFor(a, _rows);
  if (calls) {
    const blocks = calls.blocks.filter(b => b.type !== 'context' && b.type !== 'actions');
    const r = await d.slackPost(env, card.channel, calls.text, blocks, { username: 'Locus', thread_ts: card.ts }).catch(() => null);
    if (r && r.ts) card.thread.push(r.ts);
  }
  const byOwner = new Map();
  for (const t of _tasks) { const k = t.owner || ''; if (!byOwner.has(k)) byOwner.set(k, []); byOwner.get(k).push(t); }
  for (const [owner, list] of byOwner) {
    const tag = owner ? await tagOf(env, d, owner).catch(() => null) : null;
    const msg = reminderMessage(a.name, owner, list, today, tag);
    const r = await d.slackPost(env, card.channel, msg.text, msg.blocks, { username: 'Locus', thread_ts: card.ts }).catch(() => null);
    const ts = r && (r.ts || r.message?.ts);
    if (!ts) continue;
    card.thread.push(ts);
    for (const t of list) await env.DB.prepare(`UPDATE p_action SET reminded_on = ?2, slack_channel = ?3, slack_ts = ?4 WHERE id = ?1`).bind(t.id, today, card.channel, ts).run();
  }
  await saveCard(env, card);
  return card;
}

/** The hourly tick: from the morning hour to noon, once per Central day per brand. A brand whose brief (or Monday's
 *  weekly) is not in yet waits up to two hours, then posts anyway saying so. */
export async function morningCardTick(env, d) {
  if (!(await cardOn(env))) return { skipped: 'off' };
  const hour = d.centralHour(), from = await morningHour(env);
  if (hour < from) return { skipped: `before ${from}am Central` };
  if (hour > LAST_HOUR) return { skipped: 'after noon Central' };
  const today = d.centralDate();
  let st = safe(await getSetting(env, 'morningCardDone'), {}) || {};
  if (st.date !== today) st = { date: today, acts: {}, tries: {} };
  st.acts = st.acts || {}; st.tries = st.tries || {};
  const brands = (await d.listAccounts(env, true)).filter(a => eligible(a) && !st.acts[a.act_id]);
  if (!brands.length) return { skipped: 'all posted today', done: Object.keys(st.acts).length };
  const out = { date: today, posted: [], waiting: [], skipped: [], failed: [] };
  const live = brands.filter(a => a.slack_channel && a.slack_channel !== a.brief_channel);
  for (const a of brands) if (!live.includes(a)) { st.acts[a.act_id] = 'no internal channel'; out.skipped.push(a.name); }
  if (live.length) {
    const tomorrow = addDays(today, 1);
    const shared = {
      calendar: d.calendarData ? await d.calendarData(env, { act: 'all', from: tomorrow, to: tomorrow, today }).catch(() => null) : null,
      board: d.listBoard ? await d.listBoard(env, d, { act: 'all' }).catch(() => null) : null,
      team: d.teamOf ? await d.teamOf(env, live.map(a => a.act_id)).catch(() => ({})) : {},
    };
    for (const a of live) {
      if (!d.canAfford(60)) { out.deferred = 'budget'; break; }
      const ready = await readiness(env, a, today);
      if (!ready.ok && hour < from + WAIT_HOURS) { out.waiting.push(`${a.name} (${ready.why})`); continue; }
      try {
        const c = await postCard(env, d, a, today, shared);
        st.acts[a.act_id] = c.ts ? 'posted' : 'posted, no ts';
        out.posted.push(a.name + (ready.ok ? '' : ` (${ready.why})`));
      } catch (e) {
        st.tries[a.act_id] = (st.tries[a.act_id] || 0) + 1;
        if (st.tries[a.act_id] >= 2) st.acts[a.act_id] = `failed: ${e.message}`;
        out.failed.push(`${a.name} (${e.message})`);
      }
    }
  }
  await putSetting(env, 'morningCardDone', JSON.stringify(st));
  return out;
}

/** Locus: "Preview this morning's card" for one brand. Nothing is posted. */
export async function previewCard(env, d, act) {
  const a = (await d.listAccounts(env, true)).find(x => x.act_id === act);
  if (!a) throw Object.assign(new Error('No such active brand.'), { status: 404 });
  const today = d.centralDate(), tomorrow = addDays(today, 1);
  const shared = {
    calendar: d.calendarData ? await d.calendarData(env, { act, from: tomorrow, to: tomorrow, today }).catch(() => null) : null,
    board: d.listBoard ? await d.listBoard(env, d, { act }).catch(() => null) : null,
    team: d.teamOf ? await d.teamOf(env, [act]).catch(() => ({})) : {},
  };
  const c = await buildCard(env, d, a, today, shared);
  const { _rows, _tasks, ...card } = c;
  const m = cardMessage(card);
  const calls = messageFor(a, _rows);
  const owners = [...new Set(_tasks.map(t => t.owner || 'Nobody'))];
  const where = !eligible(a) ? 'This brand is paused or not ours, so it gets no card.'
    : !a.slack_channel || a.slack_channel === a.brief_channel ? 'This brand has no internal channel of its own, so it gets no card.' : '';
  const posted = await loadCard(env, act, today);
  return { act, name: a.name, date: today, hour: await morningHour(env), on: await cardOn(env), where, text: cardPlain(card), blocks: m.blocks,
    thread: [calls ? `The full calls list (${_rows.filter(r => CALL_KINDS.includes(r.kind)).length} lines)` : null, ...owners.map(o => `${o}: the reminder line with Done buttons`)].filter(Boolean),
    posted: posted && posted.ts ? { at: posted.date, channel: posted.channel } : null, notes: card.notes };
}

/* ---------- keeping the card up to date ---------- */
/** A p_action row was marked done (or opened again) anywhere: strike (or restore) its line on today's card. */
export async function cardActionDone(env, d, row) {
  if (!row || !row.act_id) return false;
  const c = await loadCard(env, row.act_id, dayOf(d));
  const it = c && (c.items || []).find(i => i.kind === 'task' && (i.ids || []).includes(row.id));
  if (!it) return false;
  const done = row.status === 'done';
  if (it.done === done) return false;
  it.done = done;
  return redraw(env, d, c);
}
/** A call was made on the page (POST /api/meta/write): count it on the calls line; all made = struck through. */
export async function cardCallMade(env, d, act, objectId) {
  const c = await loadCard(env, act, dayOf(d));
  const it = c && (c.items || []).find(i => i.kind === 'calls');
  const id = String(objectId || '');
  if (!it || !id || !(it.objs || []).includes(id) || (it.made || []).includes(id)) return false;
  it.made = [...(it.made || []), id];
  if (it.made.length >= it.objs.length) it.done = true;
  return redraw(env, d, c);
}
/** A late Production card moved on, or its test was judged: strike its line. */
export async function cardProdDone(env, d, batchId) {
  const r = await env.DB.prepare(`SELECT act_id FROM p_br_batch WHERE id = ?1`).bind(String(batchId || '')).first().catch(() => null);
  if (!r) return false;
  const c = await loadCard(env, r.act_id, dayOf(d));
  const it = c && (c.items || []).find(i => i.kind === 'prod' && String(i.id) === String(batchId));
  if (!it || it.done) return false;
  it.done = true;
  return redraw(env, d, c);
}
/** The client daily was sent (or its state changed) after the card went out: the numbers line says so. */
export async function cardBriefState(env, d, a) {
  const today = dayOf(d);
  const c = await loadCard(env, a.act_id, today);
  if (!c) return false;
  const row = await env.DB.prepare(`SELECT status, posted_at, text, data_json FROM briefs WHERE act_id = ?1 AND date = ?2`).bind(a.act_id, addDays(today, -1)).first().catch(() => null);
  const daily = dailyState(a, row), nums = numbersLine(a, row);
  if (daily === c.daily && nums === c.nums) return false;
  c.daily = daily; c.nums = nums;
  return redraw(env, d, c);
}
const CHECKS = new Set(['white_check_mark', 'heavy_check_mark', 'ballot_box_with_check']);
/** ✅ on the card itself: every open task line on it is done (each row through markDone, then one redraw). */
export async function cardReaction(env, d, ev) {
  if (!ev || ev.type !== 'reaction_added' || !CHECKS.has(String(ev.reaction || ''))) return { ignored: 'not a check' };
  const c = await todaysCard(env, ev.item && ev.item.channel, dayOf(d));
  if (!c || c.ts !== (ev.item && ev.item.ts)) return { ignored: 'not a reminder' };
  let who = ev.user || null;
  if (who && d.slackApi) { const u = await d.slackApi(env, 'users.info', { user: who }).catch(() => null); who = u?.user?.profile?.display_name || u?.user?.real_name || u?.user?.name || who; }
  let n = 0;
  for (const it of (c.items || []).filter(i => i.kind === 'task' && !i.done)) {
    for (const id of it.ids || []) await markDone(env, id, true, { by: who, how: 'slack', quiet: true }).catch(() => null);
    it.done = true; n++;
  }
  if (n) await redraw(env, d, c);
  return { done: n, by: who, card: true };
}

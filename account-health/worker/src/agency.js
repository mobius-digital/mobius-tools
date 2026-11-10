/* AGENCY ECONOMICS AND TEAM WORKLOAD (2026-10-10). Two Locus pages under Tools (profit/agency.js draws them).
 *
 *   GET /api/agency/economics?month=YYYY-MM&fresh=1   OWNER ONLY (Cole's session or the admin key)
 *   PUT /api/agency/settings {people?, map?}            OWNER ONLY
 *   GET /api/agency/workload?fresh=1                    TEAM (a limited teammate gets their brands only)
 *   GET /api/agency/scorecard?period=week|4w|month      OWNER ONLY (the team scorecard, 2026-11-09; see scorecard())
 *   POST /api/agency/rating {name, week, stars, note}   OWNER ONLY (Cole's weekly 1-5 rating of one person)
 * A client login never reaches any of them: they are not on brandguard's CLIENT_RULES, and each handler
 * refuses a client scope again (second lock).
 *
 * ECONOMICS, per brand for one month (default the last full month, Central time):
 *  - REVENUE = what the client paid Mobius: the Ledger's month report (`GET /api/report?month=` over the LEDGER
 *    service binding with a minted Cole session, like ask_ledger), `byClient` = income rows by payer name.
 *    Payer names are matched to brands by name (exact, then one contains the other); Cole can pin a name to a
 *    brand, or mark it "not a client", in settings `agencyLedgerMap` {ledger name: brand id | ''}.
 *    Cached an hour in `agencyLedger:<month>`.
 *  - TEAM TIME (an ESTIMATE, labelled as one on the page): each person's monthly cost and monthly hours
 *    (settings `agencyPeople` {asana user gid: {name, cost, hours}}, hours default 160) are split across the
 *    brands by their share of the Asana tasks they COMPLETED that month in each brand's linked project
 *    (connections kind 'asana', the same links as command.js). Work outside client projects is not seen, so
 *    the whole month lands on clients. Completed counts cached per brand per month in
 *    `agencyDone:<brand>:<month>` (30 minutes for the current month, 12 hours for a past one).
 *  - AI COST = dollars already recorded per brand: strat_run (the Strategist; images, PDFs and analysis are
 *    inside its cost), idea_run (the ideas bot), p_studio_ad + p_studio_vid + p_asset looks (Studio),
 *    ad_tag (creative tagging) and the client Strategist (settings `clientAsk:<day>:<email>`, filed under the
 *    client's first brand). Runs not tied to a brand are counted in `ai_unassigned`.
 *  - MARGIN = revenue - team cost - AI cost. PER HOUR = revenue / estimated team hours.
 *  - SENTENCE = written from the table by rules (no model): who earns the most per hour, who costs more in AI
 *    than it pays, else who lost money or has the thinnest margin.
 *
 * WORKLOAD: every open task due this week (Monday to Sunday, Central) or overdue (due before Monday, up to 60
 * days, outside parked sections) across every live brand's Asana project, grouped by assignee. Open tasks are
 * cached 30 minutes per brand in `agencyOpen:<brand>`. Paused and test brands are skipped (Cole's rule, the
 * same list as command.js). */
import { asanaAll, batchStats, rulesOf, getDoc } from './asana-brand.js';
import { clientScope } from './brandguard.js';
import { ROSTER, ensureActions } from './actions.js';
import { DEFAULT_PEOPLE } from './checkin.js';
import { teamOf } from './calendar.js';
import { ensureWork } from './prodwork.js';

const OWNER = 'cole@go-mobius-digital.com';
const LEDGER_ORIGIN = 'https://mobius-ledger.mobius-digital.workers.dev';
const SKIP = /galway|instyler|gum of gods|judy ?p|le ?pickle|popby|golf sock/i;
const NOT_DUE = /backlog|idea|complete|done|archive|reference|resource|template|on hold|parked|untitled|analy[sz]e/i;
const OVERDUE_DAYS = 60;
const HOURS_DEFAULT = 160;
const CUR_MS = 30 * 60e3, PAST_MS = 12 * 3600e3, LEDGER_MS = 3600e3;

const safeJson = (s, fb) => { try { return s ? JSON.parse(s) : fb; } catch { return fb; } };
const r2 = n => Math.round((Number(n) || 0) * 100) / 100;
const lower = s => String(s || '').trim().toLowerCase();
const norm = s => lower(s).replace(/[^a-z0-9]/g, '');
const central = (d = new Date()) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
const addDays = (ymd, n) => { const d = new Date(ymd + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const nextMonth = m => { const [y, mo] = m.split('-').map(Number); return mo === 12 ? `${y + 1}-01` : `${y}-${String(mo + 1).padStart(2, '0')}`; };
const prevMonth = m => { const [y, mo] = m.split('-').map(Number); return mo === 1 ? `${y - 1}-12` : `${y}-${String(mo - 1).padStart(2, '0')}`; };
const monthLabel = m => new Date(m + '-15T12:00:00Z').toLocaleString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });
const money = n => '$' + Math.round(Math.abs(n)).toLocaleString('en-US');

async function getSetting(env, key) { const r = await env.DB.prepare(`SELECT value FROM settings WHERE key = ?1`).bind(key).first().catch(() => null); return safeJson(r?.value, null); }
async function putSetting(env, key, v) { await env.DB.prepare(`INSERT INTO settings (key, value) VALUES (?1, ?2) ON CONFLICT(key) DO UPDATE SET value = excluded.value`).bind(key, JSON.stringify(v)).run().catch(() => {}); }
const rows = async (env, sql, ...b) => ((await env.DB.prepare(sql).bind(...b).all().catch(() => ({ results: [] }))).results) || [];

/* ---------------- brands, their old ids, their Asana projects ---------------- */
async function brandBook(env) {
  const brands = (await rows(env, `SELECT id, name, status, legacy_key FROM brands`)).filter(b => b.status !== 'demo');
  const name = Object.fromEntries(brands.map(b => [b.id, b.name]));
  const idOf = {};
  for (const b of brands) { idOf[b.id] = b.id; if (b.legacy_key) idOf[b.legacy_key] = b.id; }
  for (const a of await rows(env, `SELECT alias, brand_id FROM brand_alias`)) if (name[a.brand_id]) idOf[a.alias] = a.brand_id;
  for (const c of await rows(env, `SELECT brand_id, external_id FROM connections WHERE kind = 'meta'`)) if (name[c.brand_id]) idOf[c.external_id] = c.brand_id;
  const asana = {};
  for (const c of await rows(env, `SELECT brand_id, external_id, label, config_json FROM connections WHERE kind = 'asana'`)) {
    const b = brands.find(x => x.id === c.brand_id);
    if (!b || !c.external_id || asana[b.id] || b.status !== 'active' || SKIP.test(b.name || '')) continue;
    asana[b.id] = { gid: c.external_id, label: c.label || null, url: safeJson(c.config_json, {})?.url || `https://app.asana.com/0/${c.external_id}` };
  }
  return { brands, name, idOf, asana };
}

/* ---------------- who may ask ---------------- */
async function roleOf(request, env, d) {
  if (clientScope(request)) return 'client';
  if (!(await d.isAdmin(request, env))) return null;
  const auth = request.headers.get('Authorization') || '';
  const tok = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (env.ADMIN_TOKEN && tok === env.ADMIN_TOKEN) return 'owner';
  const email = await d.sessionEmail(env, request).catch(() => null);
  return lower(email) === lower(env.OWNER_EMAIL || OWNER) ? 'owner' : 'team';
}

/* ---------------- economics: the pieces ---------------- */
/* Work in a window = a task finished in it, or an open task of theirs that moved in it (most of the team moves tasks
   between sections and never ticks them; 2026-10-10 only Ahsan's work was counted). Economics and the scorecard both. */
const workDay = t => { const when = t.completed ? t.completed_at : t.modified_at; return when ? central(new Date(when)) : null; };
/** Tasks each person completed in one brand's project in the month: {by: {gid: {name, n}}}. */
async function doneFor(env, brand, gid, month, fresh, isCurrent) {
  const key = `agencyDone2:${brand}:${month}`;
  const hit = fresh ? null : await getSetting(env, key);
  if (hit && hit.gid === gid && Date.now() - Date.parse(hit.at) < (isCurrent ? CUR_MS : PAST_MS)) return hit;
  const from = month + '-01', to = nextMonth(month) + '-01';
  try {
    const tasks = await asanaAll(env, `/projects/${gid}/tasks?completed_since=${from}T00:00:00Z&opt_fields=completed,completed_at,modified_at,assignee.name`);
    const by = {};
    for (const t of tasks || []) {
      if (!t.assignee?.gid) continue;
      const day = workDay(t);
      if (!day || day < from || day >= to) continue;
      const p = by[t.assignee.gid] ||= { name: t.assignee.name || 'Someone', n: 0 };
      p.n++;
    }
    const out = { gid, at: new Date().toISOString(), by };
    await putSetting(env, key, out);
    return out;
  } catch (e) { return { gid, at: new Date().toISOString(), by: {}, error: e.message }; }
}

/** What each client paid Mobius in the month, from the Ledger. */
async function ledgerMonth(env, d, month, fresh) {
  const key = `agencyLedger:${month}`;
  const hit = fresh ? null : await getSetting(env, key);
  if (hit && Date.now() - Date.parse(hit.at) < LEDGER_MS) return hit;
  if (!env.LEDGER) return { error: 'The LEDGER service binding is missing on this worker.', byClient: {} };
  try {
    const tok = (await d.mintSession(env, env.OWNER_EMAIL || OWNER)).token;
    const res = await env.LEDGER.fetch(new Request(`${LEDGER_ORIGIN}/api/report?month=${month}`, { headers: { Authorization: 'Bearer ' + tok } }));
    const j = await res.json().catch(() => ({}));
    if (!res.ok || j.error) return { error: `The Ledger said: ${j.error || `HTTP ${res.status}`}`, byClient: {} };
    const out = { at: new Date().toISOString(), frozen: !!j.frozen, revenue: r2(j.report?.revenue), byClient: j.report?.byClient || {} };
    await putSetting(env, key, out);
    return out;
  } catch (e) { return { error: 'The Ledger did not answer: ' + e.message, byClient: {} }; }
}

/** A Ledger payer name -> a brand id, '' for "not a client", or null when nothing matches. */
export function matchPayer(payer, brands, map = {}) {
  if (Object.prototype.hasOwnProperty.call(map, payer)) return map[payer] || '';
  const p = norm(payer);
  if (!p) return null;
  const exact = brands.find(b => norm(b.name) === p);
  if (exact) return exact.id;
  const hits = brands.filter(b => { const n = norm(b.name); return n.length >= 4 && p.length >= 4 && (n.includes(p) || p.includes(n)); });
  return hits.length === 1 ? hits[0].id : null;
}

/** Dollars of AI recorded per brand in the month. */
async function aiCosts(env, book, month) {
  const from = month + '-01', to = nextMonth(month) + '-01';
  const per = {}; let unassigned = 0;
  const add = (id, kind, c) => {
    c = Number(c) || 0; if (!c) return;
    const b = id && book.idOf[id];
    if (!b) { unassigned += c; return; }
    const x = per[b] ||= { strategist: 0, ideas: 0, studio: 0, tagging: 0, client_ask: 0 };
    x[kind] += c;
  };
  for (const r of await rows(env, `SELECT brand AS id, SUM(cost) AS c FROM strat_run WHERE at >= ?1 AND at < ?2 GROUP BY brand`, from, to)) add(r.id, 'strategist', r.c);
  for (const r of await rows(env, `SELECT act_id AS id, SUM(cost) AS c FROM idea_run WHERE started_at >= ?1 AND started_at < ?2 GROUP BY act_id`, from, to)) add(r.id, 'ideas', r.c);
  for (const r of await rows(env, `SELECT act_id AS id, SUM(cost) AS c FROM p_studio_ad WHERE created_at >= ?1 AND created_at < ?2 GROUP BY act_id`, from, to)) add(r.id, 'studio', r.c);
  for (const r of await rows(env, `SELECT act_id AS id, SUM(cost) AS c FROM p_studio_vid WHERE created_at >= ?1 AND created_at < ?2 GROUP BY act_id`, from, to)) add(r.id, 'studio', r.c);
  for (const r of await rows(env, `SELECT act_id AS id, SUM(cost) AS c FROM p_asset WHERE source = 'locus' AND tagged_at >= ?1 AND tagged_at < ?2 GROUP BY act_id`, from, to)) add(r.id, 'studio', r.c);
  for (const r of await rows(env, `SELECT act_id AS id, SUM(cost) AS c FROM ad_tag WHERE tagged_at >= ?1 AND tagged_at < ?2 GROUP BY act_id`, from, to)) add(r.id, 'tagging', r.c);
  const users = (await getSetting(env, 'clientUsers')) || {};
  for (const r of await rows(env, `SELECT key, value FROM settings WHERE key LIKE ?1`, `clientAsk:${month}-%`)) {
    const email = String(r.key).split(':').slice(2).join(':');
    add(users[lower(email)]?.brands?.[0] || users[email]?.brands?.[0] || null, 'client_ask', safeJson(r.value, {})?.cost);
  }
  return { per, unassigned: r2(unassigned) };
}

/** The one-sentence answer, from the table. */
export function sentenceFor(rows, peopleSet) {
  const live = rows.filter(r => r.revenue > 0 || r.team_cost > 0 || r.ai_cost > 0);
  if (!live.length) return 'Nothing was paid, done or spent on AI for a client this month.';
  const parts = [];
  const perHour = live.filter(r => r.per_hour != null && r.revenue > 0).sort((a, b) => b.per_hour - a.per_hour);
  if (perHour.length) parts.push(`${perHour[0].name} earns the most per hour of team time (about ${money(perHour[0].per_hour)} an hour)`);
  const aiOver = live.filter(r => r.ai_cost > 0 && r.ai_cost > r.revenue).sort((a, b) => (b.ai_cost - b.revenue) - (a.ai_cost - a.revenue));
  if (aiOver.length) parts.push(`${aiOver.map(r => r.name).slice(0, 2).join(' and ')} ${aiOver.length > 1 ? 'cost' : 'costs'} more in AI than ${aiOver.length > 1 ? 'they pay' : 'it pays'}`);
  else if (peopleSet) {
    const losing = live.filter(r => r.margin < 0).sort((a, b) => a.margin - b.margin);
    const thin = live.filter(r => r.revenue > 0 && r.margin_pct != null).sort((a, b) => a.margin_pct - b.margin_pct);
    if (losing.length) parts.push(`${losing[0].name} lost about ${money(losing[0].margin)} after team time and AI`);
    else if (thin.length > 1) parts.push(`${thin[0].name} has the thinnest margin (${Math.round(thin[0].margin_pct)}%)`);
  }
  if (!peopleSet) parts.push('enter each person\'s monthly cost to see real margins');
  if (!parts.length) return 'Every client paid more than its team time and AI cost.';
  const s = parts.join('; ');
  return s.charAt(0).toUpperCase() + s.slice(1) + '.';
}

export async function economics(env, d, { month, fresh = false } = {}) {
  const today = central();
  const thisMonth = today.slice(0, 7);
  const m = /^\d{4}-\d{2}$/.test(String(month || '')) && month <= thisMonth ? month : prevMonth(thisMonth);
  const months = []; for (let x = thisMonth, i = 0; i < 13; i++, x = prevMonth(x)) months.push({ id: x, label: monthLabel(x) + (x === thisMonth ? ' (so far)' : '') });
  const book = await brandBook(env);
  const people = (await getSetting(env, 'agencyPeople')) || {};
  const map = (await getSetting(env, 'agencyLedgerMap')) || {};

  /* Asana: completed tasks per person per brand. */
  const done = {}, asanaErrors = [];
  await Promise.all(Object.entries(book.asana).map(async ([b, a]) => {
    const r = await doneFor(env, b, a.gid, m, fresh, m === thisMonth);
    done[b] = r.by || {};
    if (r.error) asanaErrors.push({ brand: book.name[b], error: r.error });
  }));
  const seen = {};   // gid -> {name, total, by: {brand: n}}
  for (const [b, by] of Object.entries(done)) for (const [g, p] of Object.entries(by)) {
    const s = seen[g] ||= { name: p.name, total: 0, by: {} };
    s.total += p.n; s.by[b] = (s.by[b] || 0) + p.n;
  }
  const peopleOut = Object.entries({ ...Object.fromEntries(Object.keys(people).map(g => [g, null])), ...seen }).map(([g, s]) => {
    const cfg = people[g] || {};
    return { gid: g, name: cfg.name || s?.name || 'Someone', tasks: s?.total || 0, by_brand: Object.fromEntries(Object.entries(s?.by || {}).map(([b, n]) => [book.name[b] || b, n])),
      cost: Number(cfg.cost) > 0 ? Number(cfg.cost) : null, hours: Number(cfg.hours) > 0 ? Number(cfg.hours) : HOURS_DEFAULT, set: Number(cfg.cost) > 0,
      /* People outside Asana (Radhesh on Google, Hamza on Amazon; 2026-10-10): a fixed list of brands, cost split evenly. */
      brands: Array.isArray(cfg.brands) && cfg.brands.length ? cfg.brands : null };
  }).sort((a, b) => b.tasks - a.tasks || a.name.localeCompare(b.name));
  const peopleSet = peopleOut.some(p => p.set && p.tasks > 0);

  /* Ledger revenue by brand. */
  const led = await ledgerMonth(env, d, m, fresh);
  const revenue = {}, unmatched = [];
  for (const [payer, amt] of Object.entries(led.byClient || {})) {
    const b = matchPayer(payer, book.brands, map);
    if (b === '') continue;
    if (b && book.name[b]) revenue[b] = (revenue[b] || 0) + Number(amt || 0);
    else unmatched.push({ name: payer, amount: r2(amt) });
  }

  const ai = await aiCosts(env, book, m);

  /* One row per brand with anything in it. */
  const ids = new Set([...Object.keys(revenue), ...Object.keys(ai.per), ...Object.keys(done).filter(b => Object.keys(done[b]).length)]);
  const out = [...ids].filter(b => book.name[b]).map(b => {
    let tasks = 0, hours = 0, team = 0;
    for (const p of peopleOut) {
      if (p.brands) { if (p.brands.includes(b)) { team += (p.cost || 0) / p.brands.length; hours += p.hours / p.brands.length; } continue; }
      const n = seen[p.gid]?.by[b] || 0; if (!n) continue;
      const share = n / seen[p.gid].total;
      tasks += n; hours += p.hours * share; if (p.cost) team += p.cost * share;
    }
    /* Someone with a cost and no task seen in any client project that month: their month is split evenly over the
       clients who paid, so the whole payroll lands somewhere (said in the model line). */
    const payers = Object.keys(revenue).filter(x => revenue[x] > 0);
    if (revenue[b] > 0) for (const p of peopleOut) if (p.cost && !p.brands && !(seen[p.gid]?.total)) { team += p.cost / payers.length; hours += p.hours / payers.length; }
    const a = ai.per[b] || { strategist: 0, ideas: 0, studio: 0, tagging: 0, client_ask: 0 };
    const aiCost = a.strategist + a.ideas + a.studio + a.tagging + a.client_ask;
    const rev = r2(revenue[b] || 0);
    const margin = r2(rev - team - aiCost);
    return { brand: b, name: book.name[b], revenue: rev, tasks, hours: Math.round(hours * 10) / 10, team_cost: r2(team), ai_cost: r2(aiCost),
      ai: Object.fromEntries(Object.entries(a).map(([k, v]) => [k, r2(v)])), margin, margin_pct: rev > 0 ? Math.round(margin / rev * 1000) / 10 : null,
      per_hour: hours > 0 && rev > 0 ? r2(rev / hours) : null, asana: !!book.asana[b] };
  }).sort((a, b) => b.revenue - a.revenue || b.tasks - a.tasks);
  const sum = k => r2(out.reduce((s, r) => s + (r[k] || 0), 0));
  const totals = { revenue: sum('revenue'), team_cost: sum('team_cost'), ai_cost: sum('ai_cost'), margin: sum('margin'), tasks: out.reduce((s, r) => s + r.tasks, 0), hours: Math.round(out.reduce((s, r) => s + r.hours, 0) * 10) / 10 };
  return {
    month: m, label: monthLabel(m), current: m === thisMonth, months, rows: out, totals, people: peopleOut, people_set: peopleSet,
    sentence: sentenceFor(out, peopleSet), unmatched, map, brands: book.brands.filter(b => b.status !== 'demo').map(b => ({ id: b.id, name: b.name })).sort((a, b) => a.name.localeCompare(b.name)),
    ledger: { ok: !led.error, error: led.error || null, frozen: !!led.frozen, revenue: led.revenue ?? null },
    ai_unassigned: ai.unassigned, asana_errors: asanaErrors, hours_default: HOURS_DEFAULT,
    model: 'Estimate. Each person\'s monthly cost and hours are split across clients by their share of the Asana tasks they finished or moved that month in each client\'s project.',
  };
}

/* ---------------- workload ---------------- */
async function openFor(env, brand, gid, fresh) {
  const key = `agencyOpen:${brand}`;
  const hit = fresh ? null : await getSetting(env, key);
  if (hit && hit.gid === gid && Date.now() - Date.parse(hit.at) < CUR_MS) return hit;
  try {
    const tasks = await asanaAll(env, `/projects/${gid}/tasks?completed_since=now&opt_fields=name,due_on,due_at,assignee.name,memberships.section.name,memberships.project.gid,permalink_url`);
    const list = (tasks || []).filter(t => String(t.name || '').trim() && (t.due_on || t.due_at)).map(t => ({
      gid: t.gid, name: String(t.name).slice(0, 140), due: t.due_on || central(new Date(t.due_at)), who: t.assignee?.gid || null, who_name: t.assignee?.name || null,
      section: (t.memberships || []).find(x => x.project?.gid === gid)?.section?.name || '', url: t.permalink_url || null }));
    const out = { gid, at: new Date().toISOString(), tasks: list };
    await putSetting(env, key, out);
    return out;
  } catch (e) { return { gid, at: new Date().toISOString(), tasks: [], error: e.message }; }
}

export async function workload(env, { only = null, fresh = false } = {}) {
  const today = central();
  const dow = (new Date(today + 'T12:00:00Z').getUTCDay() + 6) % 7;   // Monday = 0
  const mon = addDays(today, -dow);
  const week = Array.from({ length: 7 }, (_, i) => addDays(mon, i));
  const sun = week[6], oldest = addDays(today, -OVERDUE_DAYS);
  const book = await brandBook(env);
  const want = Object.entries(book.asana).filter(([b]) => !only || only.has(b));
  const people = {}, errors = [], seenTask = new Set();
  await Promise.all(want.map(async ([b, a]) => {
    const r = await openFor(env, b, a.gid, fresh);
    if (r.error) errors.push({ brand: book.name[b], error: r.error });
    for (const t of r.tasks || []) {
      if (seenTask.has(t.gid) || NOT_DUE.test(t.section) || t.due > sun || t.due < oldest) continue;
      seenTask.add(t.gid);
      const key = t.who || 'none';
      const p = people[key] ||= { key, name: t.who_name || 'Not assigned', overdue: [], days: Object.fromEntries(week.map(x => [x, []])), n: 0 };
      const task = { name: t.name, brand: b, brand_name: book.name[b], due: t.due, url: t.url, section: t.section, late: t.due < today };
      if (t.due < mon) p.overdue.push(task); else p.days[t.due].push(task);
      p.n++;
    }
  }));
  const list = Object.values(people).map(p => ({ ...p, overdue: p.overdue.sort((x, y) => x.due.localeCompare(y.due)), late: p.overdue.length + week.filter(x => x < today).reduce((s, x) => s + p.days[x].length, 0) }))
    .sort((a, b) => (a.key === 'none') - (b.key === 'none') || b.n - a.n || a.name.localeCompare(b.name));
  return { as_of: new Date().toISOString(), today, week, people: list, brands: want.map(([b]) => ({ id: b, name: book.name[b] })).sort((a, b) => a.name.localeCompare(b.name)), errors,
    total: list.reduce((s, p) => s + p.n, 0) };
}

/* ---------------- the team scorecard (2026-11-09, Cole only) ----------------
 * Cole: see what each person works on, how much, and how good it is, to audit and judge the team. One row per person
 * on the roster, for This week (Mon to Sun), the last 4 weeks (4 whole weeks ending this Sunday) or this month,
 * Central time. Every number carries its items (card names, ads, tasks, with links) so the page can show what is behind it.
 *
 *  WORK (how much)
 *   cards     production cards (p_br_batch) whose Asana assignee is the person that moved forward in the window: approved
 *             (approved_at) or entered Ready / Live (board_stage + board_at)
 *   launches  ads launched from Locus (p_launch.by, the launcher's email)
 *   versions  file versions uploaded on a card (p_work_file kind 'version', by_email / by_name, not deleted)
 *   asana     Asana tasks finished or moved in each live brand's project (economics' rule, workDay); null when the
 *             person is not in Asana (Radhesh, Hamza) and nothing of theirs was seen there
 *   tasks     Locus tasks done (p_action status 'done', done_at), credited to the owner, else whoever ticked it
 *  QUALITY (how good)
 *   win       test win rate = winners / judged. Judged = a verdict (winner / loser, verdict_at in the window), or a
 *             Locus result call on a test not closed yet (asana_result, dated by board_at). A call on too little spend
 *             to judge (profit brand.js `thin`: under the brand's judge_spend, or judge_days and a third of it) is left out
 *             and counted as thin_skipped. Credit: the card's assignee when that is a strategist (Ahsan, Noma); else the
 *             brand's strategist from the season call sheet (calendar.js teamOf); each item says which was used.
 *   changes   "Ask for changes" decisions (p_work_comment kind 'change_request') in the window, credited to whoever
 *             uploaded the file the request is on, else the card's assignee; per_card = changes / cards that got a
 *             decision (an approval or a change request) on that person's work
 *   on_time   cards that reached Ready / Live by their due date + Locus tasks done by their due date, out of those plus
 *             cards and tasks that came due in the window and are still open past it
 *   rating    Cole's own 1 to 5 per person per week (p_team_rating), the latest and the 4-week average
 * Identity: ROSTER (actions.js) + checkin people (Slack ids, roles) + settings slackIds + agencyPeople (Asana gids). */
const PERIODS = [['week', 'This week'], ['4w', 'Last 4 weeks'], ['month', 'This month']];
const STRATS = new Set(['strategist']);
const ROLE_DEFAULT = { cole: ['owner', 'buyer'], ahsan: ['strategist', 'buyer'], noma: ['strategist'], william: ['designer'], ravo: ['editor'], radhesh: ['google ads'], hamza: ['amazon'] };
const LIST_MAX = 80;
const md = ymd => new Date(ymd + 'T12:00:00Z').toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
const mondayOf = ymd => addDays(ymd, -((new Date(ymd + 'T12:00:00Z').getUTCDay() + 6) % 7));
/** A stored time ('2026-11-09 14:00:00' UTC from SQLite, an ISO string, or a bare date) -> its Central day. */
export function dayOf(s) {
  if (!s) return null;
  let t = String(s).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return t;
  t = t.replace(' ', 'T');
  if (!/[zZ]$|[+-]\d\d:?\d\d$/.test(t)) t += 'Z';
  const d = new Date(t);
  return isNaN(d) ? String(s).slice(0, 10) : central(d);
}
export function periodOf(id, today = central()) {
  const mon = mondayOf(today);
  let from, to;
  if (id === '4w') { from = addDays(mon, -21); to = addDays(mon, 7); }
  else if (id === 'month') { from = today.slice(0, 7) + '-01'; to = nextMonth(today.slice(0, 7)) + '-01'; }
  else { id = 'week'; from = mon; to = addDays(mon, 7); }
  const label = id === 'month' ? monthLabel(today.slice(0, 7)) : `${md(from)} to ${md(addDays(to, -1))}`;
  return { id, from, to, label, name: PERIODS.find(p => p[0] === id)[1] };
}

/** The team, one entry per person: {key, name, email, slack, asana_gid, roles}. */
export async function teamBook(env) {
  const people = ROSTER.map(r => ({ key: lower(r.name), name: r.name, email: r.email ? lower(r.email) : null, slack: null, asana_gid: null, roles: [] }));
  const find = n => { const f = lower(n).split(/\s+/)[0]; return f ? people.find(p => f === p.key || (p.key.length >= 4 && f.startsWith(p.key))) : null; };
  const checkin = await getSetting(env, 'checkinPeople');
  for (const [uid, c] of Object.entries(checkin && typeof checkin === 'object' && Object.keys(checkin).length ? checkin : DEFAULT_PEOPLE)) {
    const p = find(c?.name); if (!p) continue;
    if (!p.slack && /^U[A-Z0-9]+$/.test(uid)) p.slack = uid;
    for (const r of c.roles || []) if (!p.roles.includes(r)) p.roles.push(r);
  }
  const ids = (await getSetting(env, 'slackIds')) || {};
  for (const p of people) if (!p.slack && ids[p.key]?.id) p.slack = ids[p.key].id;
  for (const [gid, v] of Object.entries((await getSetting(env, 'agencyPeople')) || {})) { const p = find(v?.name); if (p && !p.asana_gid && /^\d+$/.test(gid)) p.asana_gid = gid; }
  for (const p of people) if (!p.roles.length) p.roles = [...(ROLE_DEFAULT[p.key] || [])];
  return people;
}
/** Any way a person is written (an email, "William Sampindi", "Nomaqhawe", "Claude Code (Cole)") -> their key, or null. */
export function whoIs(people, s) {
  const t = lower(s);
  if (!t) return null;
  const mail = (/[^\s<>()]+@[^\s<>()]+/.exec(t) || [])[0];
  if (mail) { const p = people.find(x => x.email && x.email === mail); if (p) return p.key; }
  const paren = /\(([^)]+)\)/.exec(t);
  /* An email off the roster counts only on the Mobius domain (a client called cole@brand.com is not Cole). */
  const local = mail ? (/@go-mobius-digital\.com$/.test(mail) ? mail.split('@')[0].replace(/[._]/g, ' ') : null) : t;
  for (const cand of [paren?.[1], local]) {
    const f = lower(cand).split(/\s+/)[0];
    if (!f) continue;
    const p = people.find(x => f === x.key || (x.key.length >= 4 && f.startsWith(x.key)));
    if (p) return p.key;
  }
  return null;
}

async function ensureRating(env) {
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS p_team_rating (person TEXT NOT NULL, week TEXT NOT NULL, stars INTEGER NOT NULL, note TEXT,
    by_email TEXT, at TEXT NOT NULL, PRIMARY KEY (person, week))`).run();
}

/** Each live brand's Asana tasks finished or moved in the window, one cache entry per brand per period (30 minutes). */
async function movedFor(env, brand, gid, P, fresh) {
  const key = `agencyMoved:${brand}:${P.id}`;
  const hit = fresh ? null : await getSetting(env, key);
  if (hit && hit.gid === gid && hit.from === P.from && hit.to === P.to && Date.now() - Date.parse(hit.at) < CUR_MS) return hit;
  try {
    const tasks = await asanaAll(env, `/projects/${gid}/tasks?completed_since=${P.from}T00:00:00Z&opt_fields=name,completed,completed_at,modified_at,assignee.name,permalink_url`);
    const list = [];
    for (const t of tasks || []) {
      if (!t.assignee?.gid) continue;
      const day = workDay(t);
      if (!day || day < P.from || day >= P.to) continue;
      list.push({ gid: t.gid, name: String(t.name || '').slice(0, 120), who: t.assignee.gid, who_name: t.assignee.name || '', day, done: !!t.completed, url: t.permalink_url || null });
    }
    const out = { gid, from: P.from, to: P.to, at: new Date().toISOString(), tasks: list };
    await putSetting(env, key, out);
    return out;
  } catch (e) { return { gid, from: P.from, to: P.to, at: new Date().toISOString(), tasks: [], error: e.message }; }
}

export async function scorecard(env, { period = 'week', fresh = false } = {}) {
  const today = central();
  const P = periodOf(period, today);
  const lo = addDays(P.from, -1), hi = addDays(P.to, 1);   // loose UTC bounds; each row is then placed on its Central day
  const inP = day => !!day && day >= P.from && day < P.to;
  await Promise.all([ensureWork(env), ensureActions(env), ensureRating(env)]);
  const [book, people] = await Promise.all([brandBook(env), teamBook(env)]);
  const bname = id => book.name[book.idOf[id] || id] || id || '';
  const bid = id => book.idOf[id] || id || '';
  const out = Object.fromEntries(people.map(p => [p.key, { ...p, seen_asana: false,
    work: { cards: 0, launches: 0, versions: 0, asana: 0, tasks: 0 },
    quality: { win: { winners: 0, judged: 0, thin_skipped: 0, rate: null }, changes: { n: 0, cards: 0, per_card: null }, on_time: { on: 0, total: 0, pct: null }, rating: null },
    items: { cards: [], launches: [], versions: [], asana: [], tasks: [], judged: [], changes: [], on_time: [] } }]));
  const uncredited = { cards: 0, launches: 0, versions: 0, asana: 0, tasks: 0, judged: 0, changes: 0 };
  const push = (k, list, item) => { const p = out[k]; if (p && p.items[list].length < LIST_MAX) p.items[list].push(item); };
  const cardLink = c => `?open=production&act=${encodeURIComponent(c.act_id)}&card=${encodeURIComponent(c.id)}`;
  const cardName = c => `${c.num ? c.num + ' ' : ''}${c.title || 'Untitled'}`.slice(0, 140);

  /* ---- production cards: moved forward, on time, judged ---- */
  const cards = await rows(env, `SELECT id, act_id, num, title, stage, board_stage, board_at, approved_at, due_on, assignee_name, verdict, verdict_at, asana_result, asana_url, asana_section
    FROM p_br_batch WHERE (board_at >= ?1 AND board_at < ?2) OR (approved_at >= ?1 AND approved_at < ?2) OR (verdict_at >= ?1 AND verdict_at < ?2) OR (due_on >= ?3 AND due_on < ?4)`, lo, hi, P.from, P.to);
  const boardOfRow = c => c.board_stage || (c.stage === 'done' ? 'done' : c.stage === 'live' ? 'live' : c.stage === 'idea' ? 'brief' : 'making');
  const judged = [];
  for (const c of cards) {
    const k = whoIs(people, c.assignee_name);
    const board = boardOfRow(c);
    const boardDay = ['ready', 'live'].includes(board) ? dayOf(c.board_at) : null;
    const apprDay = dayOf(c.approved_at);
    const moved = inP(boardDay) || inP(apprDay);
    const reached = [apprDay, boardDay].filter(Boolean).sort()[0] || null;
    const due = /^\d{4}-\d{2}-\d{2}$/.test(c.due_on || '') ? c.due_on : null;
    const base = { id: c.id, brand: bname(c.act_id), name: cardName(c), link: cardLink(c), asana_url: c.asana_url || null };
    if (moved) {
      if (out[k]) { out[k].work.cards++; push(k, 'cards', { ...base, to: board === 'live' ? 'Live' : board === 'done' ? 'Done' : 'Ready', day: inP(boardDay) ? boardDay : apprDay, due }); }
      else uncredited.cards++;
      if (due && out[k]) { const on = reached <= due; out[k].quality.on_time.total++; if (on) out[k].quality.on_time.on++; push(k, 'on_time', { ...base, kind: 'card', due, day: reached, on }); }
    } else if (due && inP(due) && due < today && ['brief', 'making', 'review'].includes(board) && out[k]) {
      out[k].quality.on_time.total++; push(k, 'on_time', { ...base, kind: 'card', due, day: null, on: false, open: true });
    }
    const call = ['winner', 'loser'].includes(c.verdict) ? { v: c.verdict, day: dayOf(c.verdict_at), how: 'closed' }
      : !c.verdict && ['winner', 'loser'].includes(c.asana_result) ? { v: c.asana_result, day: dayOf(c.board_at), how: 'locus_call' } : null;
    if (call && inP(call.day)) judged.push({ c, call, k });
  }
  /* Thin calls (a call on too little spend) are left out of the win rate, the rule the Brand tab flags them with. */
  const thinIds = new Set();
  const byBrand = {};
  for (const j of judged) (byBrand[j.c.act_id] ||= []).push(j.c);
  await Promise.all(Object.entries(byBrand).map(async ([act, list]) => {
    try {
      const acct = await env.DB.prepare(`SELECT act_id, target_cpa, target_roas FROM brand_accounts WHERE act_id = ?1`).bind(act).first().catch(() => null);
      const R = rulesOf(acct, await getDoc(env, act, 'rules').catch(() => null));
      const st = await batchStats(env, act, list);
      for (const c of list) {
        const s = st[c.id];
        const spend = s?.spend || 0;
        const age = s?.first ? Math.round((Date.parse(today + 'T12:00:00Z') - Date.parse(s.first + 'T12:00:00Z')) / 864e5) : 0;
        const enough = spend > 0 && (spend >= R.judge_spend || (age >= R.judge_days && spend >= R.judge_spend / 3));
        if (!enough) thinIds.add(c.id);
      }
    } catch { /* no ads table, no rules: nothing is called thin */ }
  }));
  const strat = await teamOf(env, [...new Set(judged.map(j => j.c.act_id))]).catch(() => ({}));
  for (const { c, call, k } of judged) {
    const owner = k && out[k] && out[k].roles.some(r => STRATS.has(r)) ? k : null;
    const fromBrand = whoIs(people, strat[c.act_id]?.strat);
    const credit = owner || fromBrand;
    const thin = thinIds.has(c.id);
    if (!credit || !out[credit]) { uncredited.judged++; continue; }
    const w = out[credit].quality.win;
    if (thin) w.thin_skipped++;
    else { w.judged++; if (call.v === 'winner') w.winners++; }
    push(credit, 'judged', { id: c.id, brand: bname(c.act_id), name: cardName(c), link: cardLink(c), asana_url: c.asana_url || null, call: call.v, day: call.day, how: call.how, thin,
      credited_by: owner ? 'card owner' : 'brand strategist', assignee: c.assignee_name || null });
  }

  /* ---- file versions and change requests ---- */
  const files = await rows(env, `SELECT f.id, f.batch_id, f.act_id, f.version, f.ad, f.name, f.by_email, f.by_name, f.created_at, b.num, b.title, b.assignee_name
    FROM p_work_file f LEFT JOIN p_br_batch b ON b.id = f.batch_id WHERE f.kind = 'version' AND f.deleted_at IS NULL AND f.created_at >= ?1 AND f.created_at < ?2`, lo, hi);
  for (const f of files) {
    const day = dayOf(f.created_at); if (!inP(day)) continue;
    const k = whoIs(people, f.by_email) || whoIs(people, f.by_name);
    if (!out[k]) { uncredited.versions++; continue; }
    out[k].work.versions++;
    push(k, 'versions', { id: f.id, brand: bname(f.act_id), name: `${f.name || 'File'}${f.version ? ` (v${f.version})` : ''}`, card: cardName({ num: f.num, title: f.title }), link: cardLink({ act_id: f.act_id, id: f.batch_id }), day });
  }
  const calls = await rows(env, `SELECT c.id, c.batch_id, c.act_id, c.kind, c.body, c.author_name, c.author_role, c.created_at, c.file_id, f.by_email, f.by_name, b.num, b.title, b.assignee_name
    FROM p_work_comment c LEFT JOIN p_work_file f ON f.id = c.file_id LEFT JOIN p_br_batch b ON b.id = c.batch_id
    WHERE c.kind IN ('change_request', 'approval') AND c.created_at >= ?1 AND c.created_at < ?2`, lo, hi);
  const reviewed = {};   // person -> Set of cards that got a decision on their work
  for (const c of calls) {
    const day = dayOf(c.created_at); if (!inP(day)) continue;
    const maker = whoIs(people, c.by_email) || whoIs(people, c.by_name);
    const k = maker || whoIs(people, c.assignee_name);
    if (!out[k]) { if (c.kind === 'change_request') uncredited.changes++; continue; }
    (reviewed[k] ||= new Set()).add(c.batch_id);
    if (c.kind !== 'change_request') continue;
    out[k].quality.changes.n++;
    push(k, 'changes', { id: c.id, card_id: c.batch_id, brand: bname(c.act_id), card: cardName({ num: c.num, title: c.title }), link: cardLink({ act_id: c.act_id, id: c.batch_id }), day,
      said: String(c.body || '').replace(/\s+/g, ' ').trim().slice(0, 200), by: c.author_name || (c.author_role === 'client' ? 'The client' : 'Someone'), from_client: c.author_role === 'client',
      credited_by: maker ? 'made the file' : 'card owner' });
  }
  for (const [k, set] of Object.entries(reviewed)) { const ch = out[k].quality.changes; ch.cards = set.size; ch.per_card = set.size ? Math.round(ch.n / set.size * 100) / 100 : null; }

  /* ---- ads launched from Locus ---- */
  const launches = await rows(env, `SELECT id, act, meta_act, ad_id, ad_name, adset_name, num, by, at FROM p_launch WHERE at >= ?1 AND at < ?2`, lo, hi);
  for (const l of launches) {
    const day = dayOf(l.at); if (!inP(day)) continue;
    const k = whoIs(people, l.by);
    if (!out[k]) { uncredited.launches++; continue; }
    out[k].work.launches++;
    const act = String(l.meta_act || '').replace(/^act_/, '');
    push(k, 'launches', { id: l.id, brand: bname(l.act), name: l.ad_name || 'Ad', set: l.adset_name || '', day,
      url: act && l.ad_id ? `https://adsmanager.facebook.com/adsmanager/manage/ads?act=${act}&selected_ad_ids=${l.ad_id}` : null });
  }

  /* ---- Locus tasks: done, and on time ---- */
  const acts = await rows(env, `SELECT id, act_id, text, owner, owner_email, due, status, done_at, done_by FROM p_action
    WHERE (status = 'done' AND done_at >= ?1 AND done_at < ?2) OR (status = 'open' AND due >= ?3 AND due < ?4)`, lo, hi, P.from, P.to);
  for (const a of acts) {
    const k = whoIs(people, a.owner) || whoIs(people, a.owner_email) || (a.status === 'done' ? whoIs(people, a.done_by) : null);
    const due = /^\d{4}-\d{2}-\d{2}$/.test(a.due || '') ? a.due : null;
    const base = { id: a.id, brand: a.act_id ? bname(a.act_id) : 'Agency', name: String(a.text || '').slice(0, 140), link: `?open=tasks${a.act_id ? `&act=${encodeURIComponent(bid(a.act_id))}` : ''}` };
    if (a.status === 'done') {
      const day = dayOf(a.done_at); if (!inP(day)) continue;
      if (!out[k]) { uncredited.tasks++; continue; }
      out[k].work.tasks++;
      push(k, 'tasks', { ...base, day, due });
      if (due) { const on = day <= due; out[k].quality.on_time.total++; if (on) out[k].quality.on_time.on++; push(k, 'on_time', { ...base, kind: 'task', due, day, on }); }
    } else if (due && due < today && out[k]) {
      out[k].quality.on_time.total++; push(k, 'on_time', { ...base, kind: 'task', due, day: null, on: false, open: true });
    }
  }

  /* ---- Asana: tasks finished or moved ---- */
  const asanaErrors = [];
  const gidOf = {};
  await Promise.all(Object.entries(book.asana).map(async ([b, a]) => {
    const r = await movedFor(env, b, a.gid, P, fresh);
    if (r.error) asanaErrors.push({ brand: book.name[b], error: r.error });
    for (const t of r.tasks || []) {
      const k = gidOf[t.who] || people.find(p => p.asana_gid === t.who)?.key || whoIs(people, t.who_name);
      if (!out[k]) { uncredited.asana++; continue; }
      gidOf[t.who] = k; out[k].seen_asana = true; if (!out[k].asana_gid && /^\d+$/.test(t.who)) out[k].asana_gid = t.who;
      out[k].work.asana++;
      push(k, 'asana', { id: t.gid, brand: book.name[b], name: t.name, day: t.day, done: t.done, url: t.url });
    }
  }));

  /* ---- Cole's rating ---- */
  const thisWeek = mondayOf(today), back4 = addDays(thisWeek, -21);
  const ratings = await rows(env, `SELECT person, week, stars, note, at FROM p_team_rating WHERE week >= ?1 ORDER BY week DESC`, addDays(thisWeek, -7 * 26));
  for (const p of Object.values(out)) {
    const mine = ratings.filter(r => r.person === p.key);
    const four = mine.filter(r => r.week >= back4 && r.week <= thisWeek);
    p.quality.rating = { latest: mine[0] ? { week: mine[0].week, stars: mine[0].stars, note: mine[0].note || '' } : null,
      avg4: four.length ? Math.round(four.reduce((s, r) => s + r.stars, 0) / four.length * 10) / 10 : null, n4: four.length,
      weeks: mine.slice(0, 8).map(r => ({ week: r.week, stars: r.stars, note: r.note || '' })) };
  }

  /* ---- finish ---- */
  const list = Object.values(out).map(p => {
    const w = p.quality.win, o = p.quality.on_time;
    w.rate = w.judged ? Math.round(w.winners / w.judged * 100) : null;
    o.pct = o.total ? Math.round(o.on / o.total * 100) : null;
    const inAsana = !!p.asana_gid || p.seen_asana || !!p.email;
    if (!inAsana) p.work.asana = null;
    for (const k of Object.keys(p.items)) p.items[k].sort((a, b) => String(b.day || b.due || '').localeCompare(String(a.day || a.due || '')));
    const { seen_asana, ...rest } = p;
    return { ...rest, in_asana: inAsana, total: p.work.cards + p.work.launches + p.work.versions + (p.work.asana || 0) + p.work.tasks };
  });
  return {
    period: P, periods: PERIODS.map(([id, name]) => ({ id, name })), today, this_week: thisWeek, last_week: addDays(thisWeek, -7),
    people: list, uncredited, asana_errors: asanaErrors, as_of: new Date().toISOString(),
  };
}

/** Cole's rating of one person for one week (stars 1 to 5, a one-line note). stars null or 0 clears it. */
export async function saveRating(env, body, byEmail) {
  await ensureRating(env);
  const people = await teamBook(env);
  const key = whoIs(people, body?.name);
  if (!key) throw Object.assign(new Error('Who is that? Use a name from the team.'), { status: 400 });
  const wk = /^\d{4}-\d{2}-\d{2}$/.test(String(body?.week || '')) ? mondayOf(String(body.week)) : mondayOf(central());
  if (wk > mondayOf(central())) throw Object.assign(new Error('That week has not started yet.'), { status: 400 });
  const stars = body?.stars == null || body.stars === '' ? 0 : Math.round(Number(body.stars));
  if (!stars) { await env.DB.prepare(`DELETE FROM p_team_rating WHERE person = ?1 AND week = ?2`).bind(key, wk).run(); return { ok: true, person: key, week: wk, stars: null }; }
  if (!(stars >= 1 && stars <= 5)) throw Object.assign(new Error('Stars go from 1 to 5.'), { status: 400 });
  const note = String(body?.note ?? '').replace(/\s+/g, ' ').trim().slice(0, 200) || null;
  await env.DB.prepare(`INSERT INTO p_team_rating (person, week, stars, note, by_email, at) VALUES (?1, ?2, ?3, ?4, ?5, ?6)
    ON CONFLICT(person, week) DO UPDATE SET stars = excluded.stars, note = excluded.note, by_email = excluded.by_email, at = excluded.at`)
    .bind(key, wk, stars, note, byEmail || null, new Date().toISOString()).run();
  return { ok: true, person: key, week: wk, stars, note };
}

/* ---------------- routes ---------------- */
export async function handleAgency(request, env, path, json, d) {
  if (!/^\/api\/agency\//.test(path)) return null;
  const role = await roleOf(request, env, d);
  if (role === 'client') return json({ error: 'This page is for the Mobius team.' }, 403);
  if (!role) return json({ error: 'unauthorized' }, 401);
  const url = new URL(request.url);
  const fresh = url.searchParams.get('fresh') === '1';

  /* Team workload: every open Asana task due this week or overdue, by person, across the brands (team). */
  if (path === '/api/agency/workload' && request.method === 'GET') {
    const email = await d.sessionEmail(env, request).catch(() => null);
    const only = await d.brandsFor(env, email).catch(() => null);
    return json(await workload(env, { only, fresh }));
  }
  /* Agency economics for a month: Ledger revenue, estimated team time and AI cost per client (owner only). */
  if (path === '/api/agency/economics' && request.method === 'GET') {
    if (role !== 'owner') return json({ error: 'Agency economics is Cole\'s page.' }, 403);
    return json(await economics(env, d, { month: url.searchParams.get('month'), fresh }));
  }
  /* Team scorecard: each person's work, test win rate, changes asked, on time and Cole's rating for a period (owner only). */
  if (path === '/api/agency/scorecard' && request.method === 'GET') {
    if (role !== 'owner') return json({ error: 'The team scorecard is for Cole only.' }, 403);
    return json(await scorecard(env, { period: url.searchParams.get('period') || 'week', fresh }));
  }
  /* Cole's weekly 1 to 5 rating of one person, with an optional one-line note; stars null clears it (owner only). */
  if (path === '/api/agency/rating' && request.method === 'POST') {
    if (role !== 'owner') return json({ error: 'The team scorecard is for Cole only.' }, 403);
    const email = await d.sessionEmail(env, request).catch(() => null);
    try { return json(await saveRating(env, await request.json().catch(() => ({})), email || 'admin key')); }
    catch (e) { return json({ error: e.message }, e.status || 500); }
  }
  /* Agency economics settings: each person's monthly cost and hours, Ledger payer names pinned to brands (owner only). */
  if (path === '/api/agency/settings' && request.method === 'PUT') {
    if (role !== 'owner') return json({ error: 'Agency economics is Cole\'s page.' }, 403);
    const body = await request.json().catch(() => ({}));
    if (body.people && typeof body.people === 'object') {
      const cur = (await getSetting(env, 'agencyPeople')) || {};
      for (const [g, v] of Object.entries(body.people)) {
        if (!/^[0-9a-z_]{1,40}$/i.test(g)) continue;
        if (v === null) { delete cur[g]; continue; }
        const cost = Math.max(0, Math.min(1e6, Number(v.cost) || 0)), hours = Math.max(0, Math.min(744, Number(v.hours) || 0));
        cur[g] = { name: String(v.name || cur[g]?.name || '').slice(0, 80), cost, hours: hours || HOURS_DEFAULT,
          ...(Array.isArray(v.brands) ? { brands: v.brands.map(String).filter(x => /^brand_[a-z0-9_]+$/.test(x)).slice(0, 20) } : cur[g]?.brands ? { brands: cur[g].brands } : {}) };
      }
      await putSetting(env, 'agencyPeople', cur);
    }
    if (body.map && typeof body.map === 'object') {
      const cur = (await getSetting(env, 'agencyLedgerMap')) || {};
      for (const [payer, b] of Object.entries(body.map)) {
        const k = String(payer).slice(0, 160); if (!k) continue;
        if (b === null) delete cur[k]; else cur[k] = /^brand_[a-z0-9_]+$/.test(String(b)) ? String(b) : '';
      }
      await putSetting(env, 'agencyLedgerMap', cur);
    }
    return json({ ok: true });
  }
  return json({ error: 'not found' }, 404);
}

/* AGENCY ECONOMICS AND TEAM WORKLOAD (2026-10-10). Two Locus pages under Tools (profit/agency.js draws them).
 *
 *   GET /api/agency/economics?month=YYYY-MM&fresh=1   OWNER ONLY (Cole's session or the admin key)
 *   PUT /api/agency/settings {people?, map?}            OWNER ONLY
 *   GET /api/agency/workload?fresh=1                    TEAM (a limited teammate gets their brands only)
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
import { asanaAll } from './asana-brand.js';
import { clientScope } from './brandguard.js';

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
/** Tasks each person completed in one brand's project in the month: {by: {gid: {name, n}}}. */
async function doneFor(env, brand, gid, month, fresh, isCurrent) {
  const key = `agencyDone:${brand}:${month}`;
  const hit = fresh ? null : await getSetting(env, key);
  if (hit && hit.gid === gid && Date.now() - Date.parse(hit.at) < (isCurrent ? CUR_MS : PAST_MS)) return hit;
  const from = month + '-01', to = nextMonth(month) + '-01';
  try {
    const tasks = await asanaAll(env, `/projects/${gid}/tasks?completed_since=${from}T00:00:00Z&opt_fields=completed,completed_at,assignee.name`);
    const by = {};
    for (const t of tasks || []) {
      if (!t.completed || !t.completed_at || !t.assignee?.gid) continue;
      const day = central(new Date(t.completed_at));
      if (day < from || day >= to) continue;
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
      cost: Number(cfg.cost) > 0 ? Number(cfg.cost) : null, hours: Number(cfg.hours) > 0 ? Number(cfg.hours) : HOURS_DEFAULT, set: Number(cfg.cost) > 0 };
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
      const n = seen[p.gid]?.by[b] || 0; if (!n) continue;
      const share = n / seen[p.gid].total;
      tasks += n; hours += p.hours * share; if (p.cost) team += p.cost * share;
    }
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
    model: 'Estimate. Each person\'s monthly cost and hours are split across clients by their share of the Asana tasks they completed that month in each client\'s project.',
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
        cur[g] = { name: String(v.name || cur[g]?.name || '').slice(0, 80), cost, hours: hours || HOURS_DEFAULT };
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

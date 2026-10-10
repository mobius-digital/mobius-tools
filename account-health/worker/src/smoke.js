/**
 * THE DAILY SMOKE CHECK (2026-10-10): "is Locus itself working?"
 *
 * Every morning (Central, from the hourly tick, at settings `smokeHour`, default 6, before the brief) this opens
 * every page's data routes the way the page does, for All clients and for every active brand (paused and demo
 * brands are not active, so they are never checked), as Cole: a minted owner session, profit routes through the
 * PROFIT service binding, this worker's own routes in-process, Stock through the SUPPLY binding. It also checks
 * the connections (integrationsReport plus three live token checks: Meta, Asana, Slack) and data freshness
 * (daily_insights and tw_daily reached yesterday, the hourly and nightly jobs ran).
 *
 * Only failures are posted, as ONE Slack message to Cole's internal Strategist channel (settings
 * `strategistChannel`; no channel = no post). With settings `smokeQuiet` = 'off' a clean run also posts one line.
 * The last run is kept in settings `smokeLast` and shown on Tools > Platform status ("Locus itself").
 * Settings `smokeCheck` = 'off' stops it (default on).
 *
 * SUBREQUESTS (account-health/CLAUDE.md, THE SUBREQUEST BUDGET). A run costs roughly 1 per profit route (the
 * binding call), the real D1 + fetch count of each in-process route (measured), plus ~40 for the connections and
 * freshness pass. A run is spread over ticks: each tick spends at most TICK_CAP and leaves TICK_KEEP for the
 * jobs after it (Slack index, sync), checks at most TICK_CHECKS routes and stops after TICK_MS. Progress is kept
 * in settings `smokeRun`, so the next tick picks up where this one stopped. It runs after the briefs and
 * reports in the tick, so it can never starve them.
 *
 * IN-PROCESS ROUTES RESET THE METER. AH_APP.handle() calls subReset() at its start, so an in-process route
 * zeroes SUB_USED and COST_SEEN for the whole tick. The route phase therefore runs inside `d.meter.hold()`:
 * the tick's count and learned costs are saved first, this file counts its own spend (in-process routes run
 * one at a time, measured from zero), and the saved count plus that spend is put back at the end.
 */
import { supplyFetch } from './stock.js';

const OWNER = 'cole@go-mobius-digital.com';
const PROFIT_ORIGIN = 'https://mobius-profit.mobius-digital.workers.dev';
const AH_ORIGIN = 'https://ah.internal';
const LOCUS = 'https://tools.go-mobius-digital.com/profit/';
const GRAPH = 'https://graph.facebook.com/v23.0';

export const TICK_CAP = 1500;     // most subrequests one hourly tick gives the smoke check
export const TICK_KEEP = 1500;    // left for the jobs after it in the same tick
export const TICK_CHECKS = 120;   // most route checks one tick runs (CPU: in-process routes run on this invocation)
export const TICK_MS = 240e3;     // stop starting new checks after 4 minutes
const CALL_MS = 25e3;             // one route may take this long before it counts as failed
const POOL = 4;                   // profit routes in flight at once (in-process routes always one at a time)
const SEED_AH = 25;               // opening guess for an in-process route; replaced by the highest seen
const GUARD = 2;                  // the access guard's reads before handle() resets the meter

/* ---------------------------------------------------------------------------------------------------------
 * THE ROUTE TABLE: what each Locus page calls (profit/index.html, v2.js, desk.js, calendar.js, season.js,
 * supply.js, studio.js, brand.js; cross-checked with src/routes.js). Read-only GETs only.
 *   page   what the Slack line and the card say          open   the Locus tab a link opens (?open=)
 *   w      profit | ah | supply                           path   {act}, {from}, {to} are filled in
 *   scope  all (once, act=all or none) | brand (each brand) | both
 *   needs  only brands that have it: meta, tw, google_ads, ga4, gsc, clarity, tiktok, klaviyo, supply
 *   ok     extra HTTP statuses that are a normal answer (forecast says 400 when history is short)
 * ------------------------------------------------------------------------------------------------------- */
const R = (page, open, w, path, scope, needs = null, ok = []) => ({ page, open, w, path, scope, needs, ok });
export const SMOKE_ROUTES = [
  R('Home > Overview', 'overview', 'profit', '/api/overview?days=30', 'all'),
  R('Home > Overview', 'overview', 'profit', '/api/hub/command?act=all', 'all'),
  R('Home > Overview', 'overview', 'ah', '/api/command/work', 'all'),
  R('Top bar (today live)', 'overview', 'profit', '/api/hub/live?act={act}', 'brand', 'tw'),
  R('Home > Day check', 'yesterday', 'profit', '/api/hub/yesterday?act={act}', 'both'),
  R('Home > Day check', 'yesterday', 'ah', '/api/daycheck/now?act={act}', 'both'),
  R('Home > P&L', 'profit', 'profit', '/api/client?act={act}&days=30', 'brand'),
  R('Home > P&L', 'profit', 'profit', '/api/hub/drill?act={act}&days=30', 'both'),
  R('Home > P&L', 'profit', 'profit', '/api/rhythm?act={act}', 'brand'),
  R('Home > Goals', 'plan', 'profit', '/api/quarter?act={act}', 'brand'),
  R('Home > Goals', 'plan', 'profit', '/api/forecast?act={act}', 'brand', null, [400]),
  R('Costs', 'costs', 'profit', '/api/costs?act={act}&days=60', 'brand'),
  R('Ads > Today', 'today', 'profit', '/api/hub/today?act={act}', 'both'),
  R('Ads > Today', 'today', 'ah', '/api/metaday?days=30', 'all'),
  R('Ads > All channels', 'channels', 'profit', '/api/hub/paid?platform=all&act={act}&days=30', 'both'),
  R('Ads > Meta', 'meta', 'profit', '/api/hub/paid?platform=meta&act={act}&days=30', 'brand', 'meta'),
  R('Ads > Meta', 'meta', 'ah', '/api/meta/live?act={act}', 'brand', 'meta'),
  R('Ads > Meta ads', 'adcreative', 'profit', '/api/hub/creative?act={act}&days=30', 'both'),
  R('Ads > Google campaigns', 'gcampaigns', 'ah', '/api/google/ads?act={act}&from={from}&to={to}', 'brand', 'google_ads'),
  R('Ads > Google ads', 'gads', 'ah', '/api/google/ads-ads?act={act}&from={from}&to={to}', 'brand', 'google_ads'),
  R('Ads > Google search terms', 'gterms', 'ah', '/api/google/ads-terms?act={act}&from={from}&to={to}', 'brand', 'google_ads'),
  R('Ads > Google changes', 'gchanges', 'ah', '/api/google/ads-changes?act={act}&from={from}&to={to}', 'brand', 'google_ads'),
  R('Ads > TikTok', 'tiktok', 'ah', '/api/tiktok/report?act={act}&from={from}&to={to}', 'brand', 'tiktok'),
  R('Email and SMS', 'email', 'profit', '/api/hub/email?act={act}&days=30', 'both'),
  R('Email and SMS', 'email', 'ah', '/api/klaviyo?act={act}&what=overview', 'brand', 'klaviyo'),
  R('Email and SMS', 'email', 'ah', '/api/klaviyo?act={act}&what=campaigns', 'brand', 'klaviyo'),
  R('Store > Sales', 'store', 'profit', '/api/hub/store?act={act}&days=30', 'both'),
  R('Store > Sales', 'store', 'profit', '/api/hub/orders?act={act}&days=30', 'brand'),
  R('Store > Customers', 'customers', 'profit', '/api/customers?act={act}&days=90&journey=0', 'brand'),
  R('Store > Website', 'store', 'ah', '/api/google/website?act={act}&from={from}&to={to}', 'brand', 'ga4'),
  R('Store > Website', 'store', 'ah', '/api/clarity?act={act}', 'brand', 'clarity'),
  R('Store > Search', 'store', 'ah', '/api/google/search?act={act}&from={from}&to={to}', 'brand', 'gsc'),
  R('Products > Stock', 'stock', 'profit', '/api/hub/stockads?act={act}', 'brand', 'supply'),
  R('Products > Stock', 'stock', 'supply', '/api/state', 'brand', 'supply'),
  R('Creative > AI ads', 'studio', 'profit', '/api/studio?act={act}', 'brand'),
  R('Brand', 'brand', 'profit', '/api/brand?act={act}', 'brand'),
  R('Calendar', 'calendar', 'ah', '/api/calendar?act={act}', 'both'),
  R('Reports > Brief', 'brief', 'ah', '/api/briefs?act={act}', 'both'),
  R('Reports > Weekly', 'reports', 'ah', '/api/reports?act={act}', 'both'),
  R('Reports > Dashboards', 'dash', 'profit', '/api/dashboards?act=all', 'all'),
  R('Season > War Room', 'war', 'profit', '/api/season/war?act={act}', 'both'),
  R('Season > The Plan', 'season', 'profit', '/api/season?act={act}', 'both'),
  R('Settings > Connections', 'settings', 'profit', '/api/connections', 'all'),
  R('Settings > Data health', 'health', 'ah', '/api/data-health?act=all&days=14', 'all'),
  R('Settings > Jobs', 'settings', 'ah', '/api/schedule-health', 'all'),
];

/* ---------------------------------------------------------------------------------------------------------- */
const clip = (s, n = 160) => { const t = String(s ?? '').replace(/\s+/g, ' ').trim(); return t.length > n ? t.slice(0, n - 1) + '…' : t; };
const safeJson = (s, fb) => { try { return s ? JSON.parse(s) : fb; } catch { return fb; } };
const isoOf = s => { if (!s) return null; const t = String(s).includes('T') ? String(s) : String(s).replace(' ', 'T'); const ms = Date.parse(/Z|[+-]\d\d:?\d\d$/.test(t) ? t : t + 'Z'); return Number.isFinite(ms) ? ms : null; };
const hoursSince = (s, now) => { const ms = isoOf(s); return ms == null ? null : (now - ms) / 36e5; };
const linkFor = (open, act) => `${LOCUS}?open=${encodeURIComponent(open)}${act && act !== 'all' ? `&act=${encodeURIComponent(act)}` : ''}`;
const withTimeout = (p, ms, what) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error(`${what} took longer than ${Math.round(ms / 1000)} seconds`)), ms))]);

/** Whether a brand has what a route needs, from the Connections report's items (and the Supply brand list). */
function has(need, b) {
  if (!need) return true;
  const it = k => (b.items || []).find(i => i.key === k) || null;
  if (need === 'meta') return !!b.meta_act;
  if (need === 'tw') return !!b.tw_shop;
  if (need === 'supply') return !!b.supply;
  if (need === 'google_ads') { const i = it('google_ads'); return !!(i && (i.levels || []).find(l => /direct/i.test(l.name))?.on); }
  if (need === 'klaviyo') { const i = it('email'); return !!(i && i.tool !== 'attentive' && (i.levels || []).find(l => /direct/i.test(l.name))?.on); }
  if (need === 'tiktok') { const i = it('tiktok'); return i?.state === 'ok'; }
  return it(need)?.state === 'ok';   // ga4, gsc, clarity: only when Locus can read it
}

/** Every check for today, from the route table, the active brands and what each one has connected. */
export function buildPlan(brands, { from, to, only = null } = {}) {
  const fill = (p, act) => p.replace('{act}', encodeURIComponent(act)).replace('{from}', from).replace('{to}', to);
  const out = [];
  const pick = only ? brands.filter(b => b.act_id === only) : brands;
  for (const r of SMOKE_ROUTES) {
    if (!only && (r.scope === 'all' || r.scope === 'both'))
      out.push({ page: r.page, open: r.open, w: r.w, path: fill(r.path, 'all'), act: 'all', brand: 'All clients', ok: r.ok });
    if (r.scope === 'brand' || r.scope === 'both')
      for (const b of pick) if (has(r.needs, b))
        out.push({ page: r.page, open: r.open, w: r.w, path: r.w === 'supply' ? r.path : fill(r.path, b.act_id), act: b.act_id, brand: b.name, ok: r.ok, ...(r.w === 'supply' ? { supply: b.supply } : {}) });
  }
  return out.map((c, i) => ({ id: i, ...c }));
}

/* ---------------- phase A: brands, connections, freshness ---------------- */
async function survey(env, d, { only = null } = {}) {
  const now = d.now ? d.now() : Date.now();
  const accts = (await d.listAccounts(env, true)).filter(a => !only || a.act_id === only);
  const conn = [], fresh = [];
  const fail = (list, x) => list.push({ ...x, error: clip(x.error) });

  /* Connections: the same report Settings > Connections shows. Only breakage counts as a failure: a core
     secret that is gone, a brand item that is 'bad', or anything that was 'ok' last run and is not now. */
  const prevState = (safeJson(await d.getSetting(env, 'smokeLast'), null) || {}).conn_state || {};
  const state = {};
  let rep = { agency: [], brands: [] };
  try { rep = await d.integrationsReport(env); }
  catch (e) { fail(conn, { what: 'Connections report', brand: 'All clients', act: 'all', open: 'settings', error: `Could not build the Connections report: ${e.message}` }); }
  for (const it of rep.agency || []) {
    const k = `agency:${it.key}`; state[k] = it.state;
    const core = ['meta', 'tw', 'slack', 'asana', 'anthropic'].includes(it.key);
    if ((core && it.state === 'off') || (prevState[k] === 'ok' && it.state !== 'ok'))
      fail(conn, { what: it.name, brand: 'All clients', act: 'all', open: 'settings', error: it.note || `State is ${it.state}.` });
    if (it.key === 'google') for (const c of it.checks || []) {
      const ck = `google:${c.name}`; state[ck] = c.ok ? 'ok' : 'off';
      if (prevState[ck] === 'ok' && !c.ok) fail(conn, { what: `Google: ${c.name}`, brand: 'All clients', act: 'all', open: 'settings', error: c.note || 'Stopped working since the last check.' });
    }
  }
  const byAct = Object.fromEntries((rep.brands || []).map(b => [b.act_id, b]));
  for (const a of accts) for (const it of byAct[a.act_id]?.items || []) {
    const k = `${a.act_id}:${it.key}`; state[k] = it.state;
    if (it.state === 'bad' || (prevState[k] === 'ok' && it.state !== 'ok'))
      fail(conn, { what: it.name, brand: a.name, act: a.act_id, open: 'settings', error: it.note || `State is ${it.state}.` });
  }

  /* Live token checks: one call each. A key that is set but refused is the failure Settings cannot see. */
  if (env.META_TOKEN) {
    try {
      const r = await d.xfetch(`${GRAPH}/me?fields=id`, { headers: { Authorization: `Bearer ${env.META_TOKEN}` } });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || j.error) fail(conn, { what: 'Meta token', brand: 'All clients', act: 'all', open: 'settings', error: `Meta refused the token: ${j.error?.message || 'HTTP ' + r.status}` });
    } catch (e) { fail(conn, { what: 'Meta token', brand: 'All clients', act: 'all', open: 'settings', error: `Meta did not answer: ${e.message}` }); }
  }
  if (env.ASANA_TOKEN) {
    try {
      const r = await d.xfetch('https://app.asana.com/api/1.0/users/me', { headers: { Authorization: `Bearer ${env.ASANA_TOKEN}` } });
      if (!r.ok) { const j = await r.json().catch(() => ({})); fail(conn, { what: 'Asana token', brand: 'All clients', act: 'all', open: 'settings', error: `Asana refused the token: ${j.errors?.[0]?.message || 'HTTP ' + r.status}` }); }
    } catch (e) { fail(conn, { what: 'Asana token', brand: 'All clients', act: 'all', open: 'settings', error: `Asana did not answer: ${e.message}` }); }
  }
  if (env.SLACK_BOT_TOKEN) {
    const r = await d.slackApi(env, 'auth.test', {}).catch(e => ({ ok: false, error: e.message }));
    if (!r?.ok) fail(conn, { what: 'Slack bot token', brand: 'All clients', act: 'all', open: 'settings', error: `Slack refused the bot token: ${r?.error || 'no answer'}` });
  }

  /* Stock: which brands Supply carries (the Products > Stock checks run only for those). */
  const supply = {};
  if (env.SUPPLY && env.SUPPLY_TOKEN) {
    try {
      const r = await supplyFetch(env, '/api/brands', { actor: 'the smoke check' });
      d.meter.spend?.(1);   // a binding call: real, but not seen by xfetch
      for (const b of r.brands || []) if (b.active && b.act_id) {
        const a = accts.find(x => x.act_id === b.act_id || (x.meta_act && x.meta_act === b.act_id));
        if (a) supply[a.act_id] = b.id;
      }
    } catch (e) { fail(conn, { what: 'Stock (Supply)', brand: 'All clients', act: 'all', open: 'stock', error: `Supply did not answer: ${e.message}` }); }
  }

  /* Freshness: Meta and Triple Whale reached yesterday (each brand's own day), and the jobs ran. */
  if (accts.length) {
    const ids = accts.map(a => a.act_id), IN = ids.map((_, i) => `?${i + 2}`).join(',');
    const since = d.addDays(d.centralDate(), -21);
    const q = (sql, ...b) => env.DB.prepare(sql).bind(...b).all().then(r => r.results || []).catch(() => []);
    const [meta, tw] = await Promise.all([
      q(`SELECT c.brand_id AS act_id, MAX(d.date) AS latest FROM daily_insights d JOIN connections c ON c.kind = 'meta' AND c.external_id = d.act_id
          WHERE d.date >= ?1 AND c.brand_id IN (${IN}) GROUP BY c.brand_id`, since, ...ids),
      q(`SELECT act_id, MAX(date) AS latest, MAX(synced_at) AS synced FROM tw_daily WHERE date >= ?1 AND act_id IN (${IN}) GROUP BY act_id`, since, ...ids),
    ]);
    const M = Object.fromEntries(meta.map(r => [r.act_id, r])), T = Object.fromEntries(tw.map(r => [r.act_id, r]));
    for (const a of accts) {
      const yday = d.addDays(d.localDate(a.tz || 'America/Chicago'), -1);
      if (a.meta_act) {
        const latest = M[a.act_id]?.latest || null, age = hoursSince(a.last_sync_insights, now);
        if (a.last_error) fail(fresh, { what: 'Meta sync', brand: a.name, act: a.act_id, open: 'health', error: `Meta sync failing: ${a.last_error}` });
        else if (!latest || latest < d.addDays(yday, -1)) fail(fresh, { what: 'Meta data', brand: a.name, act: a.act_id, open: 'health', error: `Meta data (daily_insights) stops at ${latest || 'nothing in 3 weeks'}, expected ${yday}.` });
        else if (age == null || age > 12) fail(fresh, { what: 'Meta sync', brand: a.name, act: a.act_id, open: 'health', error: `Meta has not synced for ${age == null ? 'ever' : Math.round(age) + ' hours'}.` });
      }
      if (a.tw_shop) {
        const t = T[a.act_id], age = hoursSince(t?.synced, now);
        if (!t?.latest || t.latest < yday) fail(fresh, { what: 'Triple Whale data', brand: a.name, act: a.act_id, open: 'health', error: `Triple Whale data (tw_daily) stops at ${t?.latest || 'nothing in 3 weeks'}, expected ${yday}.` });
        else if (age == null || age > 26) fail(fresh, { what: 'Triple Whale sync', brand: a.name, act: a.act_id, open: 'health', error: `Triple Whale last synced ${age == null ? 'never' : Math.round(age) + ' hours ago'}.` });
      }
    }
  }
  /* Schedule health: the same records GET /api/schedule-health reads. This tick has not written its own yet. */
  const hourly = safeJson(await d.getSetting(env, 'lastHourly'), null), nightly = safeJson(await d.getSetting(env, 'lastRun'), null);
  const hA = hoursSince(hourly?.at, now), nA = hoursSince(nightly?.at, now);
  if (hA == null || hA > 3) fail(fresh, { what: 'Hourly jobs', brand: 'All clients', act: 'all', open: 'settings', error: hA == null ? 'The hourly jobs have no record of running.' : `The hourly jobs last finished ${Math.round(hA)} hours ago.` });
  if (nA == null || nA > 30) fail(fresh, { what: 'Nightly jobs', brand: 'All clients', act: 'all', open: 'settings', error: nA == null ? 'The nightly job has no record of running.' : `The nightly job last finished ${Math.round(nA)} hours ago.` });

  const brands = accts.map(a => ({ act_id: a.act_id, name: a.name, meta_act: a.meta_act || null, tw_shop: a.tw_shop || null, supply: supply[a.act_id] || null, items: byAct[a.act_id]?.items || [] }));
  return { brands, conn, fresh, conn_state: state };
}

/* ---------------- phase B: the routes ---------------- */
/** One route, as the page would ask for it. Returns { ok, status, ms, error, cost }. */
async function hit(env, d, c, auth, lock) {
  const t0 = Date.now();
  const init = { method: 'GET', headers: { Authorization: auth } };
  let res, cost = 1, release = null;
  try {
    if (c.w === 'profit') {
      if (!env.PROFIT) throw new Error('The PROFIT service binding is missing on account-health.');
      res = await withTimeout(env.PROFIT.fetch(new Request(PROFIT_ORIGIN + c.path, init)), CALL_MS, 'The page');
    } else if (c.w === 'supply') {
      await withTimeout(supplyFetch(env, c.path, { brand: c.supply, actor: 'the smoke check' }), CALL_MS, 'Stock');
      return { ok: true, status: 200, ms: Date.now() - t0, cost };
    } else {
      release = await lock();
      d.meter.zero();
      try { res = await withTimeout(d.ahFetch(new Request(AH_ORIGIN + c.path, init), env), CALL_MS, 'The page'); }
      finally { cost = d.meter.used() + GUARD; release(); release = null; }
    }
    const text = await res.text();
    const j = safeJson(text, null);
    if (res.ok && j && !j.error) return { ok: true, status: res.status, ms: Date.now() - t0, cost };
    if (c.ok?.includes(res.status)) return { ok: true, status: res.status, ms: Date.now() - t0, cost };
    const why = j?.error || (j ? null : 'The answer was not JSON') || '';
    return { ok: false, status: res.status, ms: Date.now() - t0, cost, error: clip(`HTTP ${res.status}${why ? ': ' + why : ''}`) };
  } catch (e) {
    if (release) release();
    return { ok: false, status: 0, ms: Date.now() - t0, cost: c.w === 'ah' ? SEED_AH : cost, error: clip(e.message) };
  }
}

/** Run checks plan[next..] until done or a limit; returns { results, next, spent, stopped }. */
async function runChecks(env, d, plan, next, { cap, maxChecks, maxMs }) {
  const auth = 'Bearer ' + (await d.mintSession(env, OWNER)).token;
  const restore = d.meter.hold();
  const t0 = Date.now();
  let spent = 0, inflight = 0, i = next, started = 0, stopped = null, worstAh = SEED_AH;
  const results = [];
  /* In-process routes reset the meter, so they run one at a time. */
  let chain = Promise.resolve();
  const lock = () => { let rel; const p = new Promise(r => { rel = r; }); const prev = chain; chain = chain.then(() => p); return prev.then(() => rel); };
  const estimate = c => (c.w === 'ah' ? worstAh : 1);
  const worker = async () => {
    while (i < plan.length) {
      const c = plan[i];
      if (started >= maxChecks) { stopped = stopped || 'checks'; return; }
      if (Date.now() - t0 > maxMs) { stopped = stopped || 'time'; return; }
      if (spent + inflight + estimate(c) > cap) { stopped = stopped || 'budget'; return; }
      i++; started++;
      const est = estimate(c); inflight += est;
      const r = await hit(env, d, c, auth, lock);
      inflight -= est; spent += r.cost;
      if (c.w === 'ah' && r.cost > worstAh) worstAh = r.cost;
      results.push({ id: c.id, ok: r.ok, status: r.status, ms: r.ms, ...(r.ok ? {} : { error: r.error }) });
    }
  };
  try { await Promise.all(Array.from({ length: POOL }, worker)); }
  finally { restore(spent); }
  /* Workers stop together, so `i` may sit past a check still in the queue: resume from the lowest unfinished. */
  const done = new Set(results.map(r => r.id));
  let resume = next; while (resume < plan.length && done.has(plan[resume].id)) resume++;
  return { results, next: resume, spent, stopped: resume >= plan.length ? null : stopped };
}

/* ---------------- phase C: the summary, the post ---------------- */
function summarize(run) {
  const byId = new Map(run.plan.map(c => [c.id, c]));
  const failed = [];
  for (const r of run.results) if (!r.ok) {
    const c = byId.get(r.id);
    failed.push({ kind: 'route', page: c.page, brand: c.brand, act: c.act, path: c.path, status: r.status, error: r.error, ms: r.ms, link: linkFor(c.open, c.act) });
  }
  for (const x of run.conn) failed.push({ kind: 'connection', page: `Connection: ${x.what}`, brand: x.brand, act: x.act, error: x.error, link: linkFor(x.open, x.act) });
  for (const x of run.fresh) failed.push({ kind: 'freshness', page: `Data: ${x.what}`, brand: x.brand, act: x.act, error: x.error, link: linkFor(x.open, x.act) });
  const pages = {};
  for (const r of run.results) { const c = byId.get(r.id); const p = (pages[c.page] = pages[c.page] || { page: c.page, n: 0, fail: 0, ms: 0 }); p.n++; p.ms = Math.max(p.ms, r.ms); if (!r.ok) p.fail++; }
  const checked = run.results.length, extra = run.conn_checks + run.fresh_checks;
  const total = checked + extra, nFail = failed.length;
  return {
    at: new Date().toISOString(), date: run.date, started_at: run.started_at, ticks: run.ticks, manual: !!run.manual, dry: !!run.dry, only: run.only || null,
    total, passed: total - nFail, failed, routes: run.plan.length, checked, not_checked: run.plan.length - checked,
    brands: run.brand_count, by_page: Object.values(pages), cost: run.cost, conn_state: run.conn_state,
    slowest: run.results.slice().sort((a, b) => b.ms - a.ms).slice(0, 3).map(r => ({ page: byId.get(r.id).page, brand: byId.get(r.id).brand, ms: r.ms })),
  };
}

export function slackText(s, dayLabel) {
  const n = s.failed.length;
  if (!n) return `Locus check, ${dayLabel}: all ${s.total} checks passed.`;
  const head = `*Locus check, ${dayLabel}: ${n} of ${s.total} ${s.total === 1 ? 'check' : 'checks'} failed*`;
  const e = t => String(t ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const lines = s.failed.slice(0, 25).map(f => `• ${e(f.brand)}, ${e(f.page)}: ${e(f.error)} <${f.link}|Open>`);
  const more = n > 25 ? [`and ${n - 25} more: <${LOCUS}?open=pulse|Tools, Platform status>`] : [];
  const gap = s.not_checked ? [`${s.not_checked} checks did not fit in the subrequest budget and were not run.`] : [];
  return [head, ...lines, ...more, ...gap].join('\n');
}

async function finish(env, d, run) {
  const s = summarize(run);
  /* A one-brand run keeps what the last full run knew about every other connection (the "was ok" memory). */
  if (run.only) s.conn_state = { ...((safeJson(await d.getSetting(env, 'smokeLast'), null) || {}).conn_state || {}), ...run.conn_state };
  s.posted = false;
  const quiet = String((await d.getSetting(env, 'smokeQuiet')) ?? '').toLowerCase() !== 'off';
  const channel = await d.getSetting(env, 'strategistChannel');
  if (!run.dry && channel && (s.failed.length || !quiet)) {
    const label = new Date(`${run.date}T12:00:00Z`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' });
    const r = await d.slackApi(env, 'chat.postMessage', { channel, text: slackText(s, label), unfurl_links: false, unfurl_media: false }).catch(e => ({ ok: false, error: e.message }));
    s.posted = !!r?.ok; if (!r?.ok) s.post_error = clip(r?.error || 'Slack did not answer', 120);
  } else if (!channel && !run.dry) s.post_error = 'No Strategist channel is set (Agency settings > The Strategist), so nothing was posted.';
  await d.putSetting(env, 'smokeLast', JSON.stringify(s).slice(0, 200000));
  return s;
}

function newRun(date, sv, plan, { manual = false, dry = false, only = null } = {}) {
  return { date, started_at: new Date().toISOString(), ticks: 0, manual, dry, only, plan, next: 0, results: [], conn: sv.conn, fresh: sv.fresh,
    conn_state: sv.conn_state, conn_checks: Object.keys(sv.conn_state).length + 3, fresh_checks: sv.brands.length * 2 + 2, brand_count: sv.brands.length, cost: 0, finished: false };
}
/** settings smokeHour: 0 to 23 Central, default 6 (before the brief). */
const hourOf = v => (v != null && v !== '' && Number.isInteger(+v) && +v >= 0 && +v <= 23 ? +v : 6);
function windowOf(d) { const to = d.addDays(d.centralDate(), -1); return { from: d.addDays(to, -29), to }; }

/* ---------------- the hourly tick ---------------- */
export async function smokeTick(env, d) {
  if (String((await d.getSetting(env, 'smokeCheck')) ?? '').toLowerCase() === 'off') return { off: true };
  const today = d.centralDate(), hour = d.centralHour();
  let run = safeJson(await d.getSetting(env, 'smokeRun'), null);
  if (run?.date === today && run.finished) return { done: true };
  const sh = hourOf(await d.getSetting(env, 'smokeHour'));
  if (hour < sh && run?.date !== today) return { waiting: `starts at ${sh}:00 Central` };
  if (d.meter.left() < 300) return { deferred: 'out of budget' };
  const before = d.meter.used();
  if (!run || run.date !== today) {
    const sv = await survey(env, d);
    run = newRun(today, sv, buildPlan(sv.brands, windowOf(d)));
    run.cost += Math.max(0, d.meter.used() - before);
  }
  run.ticks++;
  const left = d.meter.left();
  const cap = Math.min(TICK_CAP, left - TICK_KEEP);
  let r = { results: [], next: run.next, spent: 0, stopped: 'budget' };
  if (cap >= 50) r = await runChecks(env, d, run.plan, run.next, { cap, maxChecks: TICK_CHECKS, maxMs: TICK_MS });
  run.results.push(...r.results); run.next = r.next; run.cost += r.spent;
  if (run.next >= run.plan.length) {
    run.finished = true;
    const s = await finish(env, d, run);
    await d.putSetting(env, 'smokeRun', JSON.stringify({ date: run.date, finished: true, at: s.at }));
    return { finished: true, total: s.total, failed: s.failed.length, posted: s.posted, cost: run.cost };
  }
  await d.putSetting(env, 'smokeRun', JSON.stringify(run));
  return { checked: r.results.length, left: run.plan.length - run.next, stopped: r.stopped, cost: r.spent };
}

/* ---------------- Run now (Tools > Platform status) ---------------- */
export async function smokeRunNow(env, d, { dry = false, brand = null } = {}) {
  const before = d.meter.used();
  const sv = await survey(env, d, { only: brand });
  if (brand && !sv.brands.length) return { error: 'That brand is not active, so it is not checked.' };
  const run = newRun(d.centralDate(), sv, buildPlan(sv.brands, { ...windowOf(d), only: brand }), { manual: true, dry, only: brand });
  run.cost += Math.max(0, d.meter.used() - before);
  run.ticks = 1;
  const left = d.meter.left();
  const r = await runChecks(env, d, run.plan, 0, { cap: Math.max(0, left - 60), maxChecks: 1e9, maxMs: 110e3 });
  run.results.push(...r.results); run.next = r.next; run.cost += r.spent;
  return finish(env, d, run);
}

/* ---------------- routes (admin): GET /api/smoke, POST /api/smoke/run {dry, brand}, PUT /api/smoke {check, quiet} ---------------- */
export async function handleSmoke(request, env, path, json, d) {
  if (!path.startsWith('/api/smoke')) return null;
  if (!(await d.isAdmin(request, env))) return json({ error: 'unauthorized' }, 401);
  const st = async () => ({
    check: String((await d.getSetting(env, 'smokeCheck')) ?? '').toLowerCase() === 'off' ? 'off' : 'on',
    quiet: String((await d.getSetting(env, 'smokeQuiet')) ?? '').toLowerCase() === 'off' ? 'off' : 'on',
    hour: hourOf(await d.getSetting(env, 'smokeHour')),
    channel: !!(await d.getSetting(env, 'strategistChannel')),
  });
  if (path === '/api/smoke' && request.method === 'GET') {
    const run = safeJson(await d.getSetting(env, 'smokeRun'), null);
    return json({ last: safeJson(await d.getSetting(env, 'smokeLast'), null), settings: await st(),
      running: run && !run.finished ? { date: run.date, done: run.next, of: run.plan.length } : null, routes: SMOKE_ROUTES.length });
  }
  if (path === '/api/smoke' && request.method === 'PUT') {
    const b = await request.json().catch(() => ({}));
    if (b.check === 'on' || b.check === 'off') await d.putSetting(env, 'smokeCheck', b.check);
    if (b.quiet === 'on' || b.quiet === 'off') await d.putSetting(env, 'smokeQuiet', b.quiet);
    return json({ ok: true, settings: await st() });
  }
  if (path === '/api/smoke/run' && request.method === 'POST') {
    const b = await request.json().catch(() => ({}));
    const r = await smokeRunNow(env, d, { dry: b.dry !== false, brand: b.brand && b.brand !== 'all' ? String(b.brand) : null });
    return r.error ? json(r, 400) : json({ ok: true, last: r });
  }
  return json({ error: 'unknown smoke route' }, 404);
}

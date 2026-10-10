/* GIVEAWAY SPEND VS SALES MER (2026-10-10). Read profit/CLAUDE.md "2026-10-10: giveaway spend vs sales MER".
 *
 * Every brand holds a blended MER floor (Triple Whale store revenue / all ad spend): 2.5, Grunk Dolfer 3.0. Lucky Golf
 * and Dartee Golf run giveaways that buy email and SMS entries, not sales; that money comes back on Black Friday. So
 * each brand's spend splits in two:
 *   - SALES SPEND = everything else. The floor applies here: Sales MER = revenue / sales spend.
 *   - GIVEAWAY SPEND = list building, judged on COST PER ENTRY against the most we pay for one, never on MER:
 *       max cost per entry = buy_rate x AOV / floor   (an entry worth buy_rate of a sale, priced at the floor).
 * Giveaway spend = Meta spend (ad_daily -> ads.campaign_id -> meta_campaigns) on a campaign whose NAME holds one of the
 * match terms ("giveaway", "leads", plus the brand's own), case-insensitive, OR whose objective is a leads objective,
 * on the giveaway's dates only. Google and every other platform stay sales spend.
 * Entries: the Klaviyo list's member count (minus the size it had before the giveaway) when a list is set and the
 * brand's key is in Locus; otherwise Meta's lead results on the matched campaigns (ad_daily.leads); otherwise none.
 *
 * ONE COPY. The profit worker imports it; account-health imports it from here ('../../../profit/worker/src/giveaway.js',
 * the way it already imports dashboard.js). No em dashes in anything this file writes. */

const num = v => (v == null || v === '' || !isFinite(+v) ? null : +v);
const r2 = v => (v == null ? null : Math.round(v * 100) / 100);
const addDays = (ymd, n) => { const d = new Date(ymd + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const dayDiff = (a, b) => Math.round((Date.parse(b + 'T12:00:00Z') - Date.parse(a + 'T12:00:00Z')) / 864e5);
const isDate = s => /^\d{4}-\d{2}-\d{2}$/.test(String(s || ''));

export const LEAD_OBJECTIVES = new Set(['OUTCOME_LEADS', 'LEAD_GENERATION']);
export const BASE_TERMS = ['giveaway', 'leads'];
export const DEFAULT_FLOOR = 2.5;

/* Seeded once, on the first read (settings `giveawaySeeded`), matched by brand NAME so the brand id does not matter.
   A seeded row someone later removes never comes back. Dates from the season plan. */
export const SEEDS = [
  { match: /^lucky golf$/i, cfg: { name: 'Lucky Golf giveaway', start: '2026-10-14', end: '2026-11-16', daily_budget: 200, entries_goal: 5000, buy_rate: 0.03, aov: 117 } },
  { match: /^dartee/i, cfg: { name: 'Dartee Golf giveaway', start: '2026-10-09', end: '2026-11-16', daily_budget: 555, entries_goal: 10000, buy_rate: 0.10, aov: 80 } },
];

/** The brand's MER floor: the giveaway's own when set, else 3.0 for Grunk Dolfer, else 2.5. */
export function merFloorFor(name, cfg) {
  if (cfg && num(cfg.mer_floor) > 0) return +cfg.mer_floor;
  return /grunk/i.test(String(name || '')) ? 3.0 : DEFAULT_FLOOR;
}
/** The most one entry is worth: buy_rate x AOV / floor, in cents. */
export function maxCostPerEntry(cfg, floor) {
  const f = floor || merFloorFor(null, cfg);
  return cfg && num(cfg.buy_rate) > 0 && num(cfg.aov) > 0 && f > 0 ? r2(+cfg.buy_rate * +cfg.aov / f) : null;
}
export function termsOf(cfg) {
  const extra = Array.isArray(cfg?.extra_terms) ? cfg.extra_terms : String(cfg?.extra_terms || '').split(',');
  return [...new Set(BASE_TERMS.concat(extra).map(t => String(t || '').trim().toLowerCase()).filter(Boolean))];
}
/** Does this Meta campaign belong to the giveaway? Name holds a term, or a leads objective (unless switched off). */
export function matchesCampaign(cfg, c) {
  if (!cfg || !c) return false;
  const n = String(c.name || '').toLowerCase();
  if (n && termsOf(cfg).some(t => n.includes(t))) return true;
  return cfg.match_objective !== 0 && cfg.match_objective !== false && LEAD_OBJECTIVES.has(String(c.objective || '').toUpperCase());
}
/** The part of [from, to] the giveaway ran in, or null. */
export function clip(cfg, from, to) {
  if (!cfg || !isDate(cfg.start) || !isDate(cfg.end)) return null;
  const f = from > cfg.start ? from : cfg.start, t = to < cfg.end ? to : cfg.end;
  return f <= t ? { from: f, to: t } : null;
}
export const liveOn = (cfg, date) => !!cfg && cfg.active !== 0 && isDate(cfg.start) && cfg.start <= date && date <= cfg.end;

/* ------------------------------------------------------------------ storage ------------------------------------------------------------------ */
let tabled = false;
export function _reset() { tabled = false; }
export async function ensureTable(env) {
  if (tabled) return;
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS p_giveaway (act_id TEXT PRIMARY KEY, name TEXT, start_date TEXT, end_date TEXT,
    extra_terms TEXT, match_objective INTEGER NOT NULL DEFAULT 1, daily_budget REAL, entries_goal REAL, buy_rate REAL, aov REAL, mer_floor REAL,
    klaviyo_list_id TEXT, list_baseline REAL NOT NULL DEFAULT 0, payback_segment_id TEXT, active INTEGER NOT NULL DEFAULT 1,
    updated_at TEXT, updated_by TEXT)`).run();
  tabled = true;
}
const getSetting = async (env, k) => (await env.DB.prepare(`SELECT value FROM settings WHERE key = ?1`).bind(k).first().catch(() => null))?.value ?? null;
const putSetting = (env, k, v) => env.DB.prepare(`INSERT INTO settings (key, value) VALUES (?1, ?2) ON CONFLICT(key) DO UPDATE SET value = excluded.value`).bind(k, v).run().catch(() => {});

export function rowToCfg(r) {
  if (!r) return null;
  let terms = []; try { terms = JSON.parse(r.extra_terms || '[]'); } catch { terms = String(r.extra_terms || '').split(','); }
  return { act_id: r.act_id, name: r.name || 'Giveaway', start: r.start_date, end: r.end_date, extra_terms: (terms || []).map(String).filter(Boolean),
    match_objective: r.match_objective === 0 ? 0 : 1, daily_budget: num(r.daily_budget), entries_goal: num(r.entries_goal), buy_rate: num(r.buy_rate), aov: num(r.aov),
    mer_floor: num(r.mer_floor), klaviyo_list_id: r.klaviyo_list_id || null, list_baseline: num(r.list_baseline) || 0, payback_segment_id: r.payback_segment_id || null,
    active: r.active === 0 ? 0 : 1, updated_at: r.updated_at || null, updated_by: r.updated_by || null };
}
async function upsert(env, act, c, who) {
  await env.DB.prepare(`INSERT INTO p_giveaway (act_id, name, start_date, end_date, extra_terms, match_objective, daily_budget, entries_goal, buy_rate, aov, mer_floor,
      klaviyo_list_id, list_baseline, payback_segment_id, active, updated_at, updated_by) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,datetime('now'),?16)
    ON CONFLICT(act_id) DO UPDATE SET name = excluded.name, start_date = excluded.start_date, end_date = excluded.end_date, extra_terms = excluded.extra_terms,
      match_objective = excluded.match_objective, daily_budget = excluded.daily_budget, entries_goal = excluded.entries_goal, buy_rate = excluded.buy_rate, aov = excluded.aov,
      mer_floor = excluded.mer_floor, klaviyo_list_id = excluded.klaviyo_list_id, list_baseline = excluded.list_baseline, payback_segment_id = excluded.payback_segment_id,
      active = excluded.active, updated_at = excluded.updated_at, updated_by = excluded.updated_by`)
    .bind(act, c.name, c.start, c.end, JSON.stringify(c.extra_terms || []), c.match_objective === 0 ? 0 : 1, c.daily_budget, c.entries_goal, c.buy_rate, c.aov, c.mer_floor ?? null,
      c.klaviyo_list_id || null, c.list_baseline || 0, c.payback_segment_id || null, c.active === 0 ? 0 : 1, who || null).run();
}

/** Seed Lucky and Dartee once (by name), then every brand's giveaway: { act_id: cfg }. `acts` limits the answer. */
export async function loadGiveaways(env, acts) {
  await ensureTable(env);
  if ((await getSetting(env, 'giveawaySeeded')) !== '1') {
    const { results: brands } = await env.DB.prepare(`SELECT id, name FROM brands`).all().catch(() => ({ results: [] }));
    for (const s of SEEDS) {
      const b = (brands || []).find(x => s.match.test(String(x.name || '').trim()));
      if (!b) continue;
      const has = await env.DB.prepare(`SELECT act_id FROM p_giveaway WHERE act_id = ?1`).bind(b.id).first().catch(() => null);
      if (!has) await upsert(env, b.id, { ...s.cfg, extra_terms: [], match_objective: 1 }, 'seed 2026-10-10');
    }
    await putSetting(env, 'giveawaySeeded', '1');
  }
  const { results } = await env.DB.prepare(`SELECT * FROM p_giveaway`).all().catch(() => ({ results: [] }));
  const out = {};
  for (const r of results || []) if (!acts || acts.includes(r.act_id)) out[r.act_id] = rowToCfg(r);
  return out;
}

/** Check and tidy what the edit window sends. [error, cfg]. */
export function clean(input) {
  const i = input || {};
  const name = String(i.name || '').trim().slice(0, 80) || 'Giveaway';
  const start = String(i.start || '').trim(), end = String(i.end || '').trim();
  if (!isDate(start) || !isDate(end)) return ['Pick the start and end dates.', null];
  if (end < start) return ['The end date is before the start.', null];
  const n = (k, label, { min = 0, max = Infinity, need = false } = {}) => {
    const raw = i[k] == null ? '' : String(i[k]).replace(/[$,\s]/g, '');
    if (raw === '') { if (need) throw new Error(`${label} is needed.`); return null; }
    if (!isFinite(+raw)) throw new Error(`${label} is not a number.`);
    if (+raw < min || +raw > max) throw new Error(`${label} must be between ${min} and ${max}.`);
    return +raw;
  };
  try {
    let buy = n('buy_rate', 'The share of entries that buy', { min: 0, max: 100, need: true });
    if (buy > 1) buy = buy / 100;                 // "3" means 3%
    const terms = (Array.isArray(i.extra_terms) ? i.extra_terms : String(i.extra_terms || '').split(','))
      .map(t => String(t).trim().toLowerCase()).filter(Boolean).slice(0, 12);
    const list = String(i.klaviyo_list_id || '').trim(), seg = String(i.payback_segment_id || '').trim();
    if (list && !/^[A-Za-z0-9]{4,40}$/.test(list)) return ['That Klaviyo list id does not look right. It is the short code in the list\'s address in Klaviyo (e.g. XyZ12a).', null];
    if (seg && !/^[A-Za-z0-9]{4,40}$/.test(seg)) return ['That Klaviyo segment id does not look right.', null];
    return [null, { name, start, end, extra_terms: terms, match_objective: i.match_objective === false || i.match_objective === 0 ? 0 : 1,
      daily_budget: n('daily_budget', 'The daily budget'), entries_goal: n('entries_goal', 'The entries goal'), buy_rate: buy,
      aov: n('aov', 'The average order', { min: 0.01, need: true }), mer_floor: n('mer_floor', 'The MER floor', { min: 0.5, max: 20 }),
      klaviyo_list_id: list || null, list_baseline: n('list_baseline', 'The list size before the giveaway') || 0, payback_segment_id: seg || null,
      active: i.active === false || i.active === 0 ? 0 : 1 }];
  } catch (e) { return [e.message, null]; }
}
export async function saveGiveaway(env, act, input, who) {
  await ensureTable(env);
  const [err, c] = clean(input);
  if (err) return { error: err };
  await upsert(env, act, c, who);
  return { ok: true, giveaway: rowToCfg(await env.DB.prepare(`SELECT * FROM p_giveaway WHERE act_id = ?1`).bind(act).first()) };
}
export async function removeGiveaway(env, act) {
  await ensureTable(env);
  await env.DB.prepare(`DELETE FROM p_giveaway WHERE act_id = ?1`).bind(act).run();
  return { ok: true };
}

/* ------------------------------------------------------------------ spend and entries ------------------------------------------------------------------ */
/** Giveaway spend (and Meta lead results) per brand per day on the giveaway's own dates inside [from, to]. ONE grouped
 *  query for every brand: { act: { spend, leads, days: {date: {spend, leads}}, campaigns: [{id, name, objective, spend, leads}] } }.
 *  `leads` reads ad_daily.leads; on a database without that column yet it reads 0 (and says so with leads_counted false). */
export async function giveawaySpend(env, cfgs, from, to) {
  const acts = Object.keys(cfgs || {}).filter(a => cfgs[a] && cfgs[a].active !== 0 && clip(cfgs[a], from, to));
  const out = {};
  for (const a of acts) out[a] = { spend: 0, leads: 0, leads_counted: true, days: {}, campaigns: [] };
  if (!acts.length) return out;
  const IN = acts.map((_, i) => `?${i + 3}`).join(',');
  const sql = leads => `SELECT c.brand_id act_id, x.campaign_id, m.name, m.objective, d.date, SUM(d.spend) spend${leads ? ', SUM(d.leads) leads' : ''}
    FROM ad_daily d JOIN ads x ON x.act_id = d.act_id AND x.ad_id = d.ad_id
    JOIN connections c ON c.kind = 'meta' AND c.external_id = d.act_id
    LEFT JOIN meta_campaigns m ON m.campaign_id = x.campaign_id
    WHERE c.brand_id IN (${IN}) AND d.date >= ?1 AND d.date <= ?2 GROUP BY c.brand_id, x.campaign_id, d.date`;
  let rows, counted = true;
  try { rows = (await env.DB.prepare(sql(true)).bind(from, to, ...acts).all()).results || []; }
  catch { counted = false; rows = (await env.DB.prepare(sql(false)).bind(from, to, ...acts).all().catch(() => ({ results: [] }))).results || []; }
  const camp = {};
  for (const r of rows) {
    const cfg = cfgs[r.act_id], o = out[r.act_id];
    if (!cfg || !o) continue;
    const w = clip(cfg, from, to);
    if (!w || r.date < w.from || r.date > w.to) continue;
    if (!matchesCampaign(cfg, { name: r.name, objective: r.objective })) continue;
    const sp = +r.spend || 0, ld = +r.leads || 0;
    o.spend += sp; o.leads += ld;
    const d = o.days[r.date] ||= { spend: 0, leads: 0 }; d.spend += sp; d.leads += ld;
    const k = `${r.act_id}|${r.campaign_id}`;
    if (!camp[k]) { camp[k] = { id: r.campaign_id, name: r.name, objective: r.objective, spend: 0, leads: 0 }; o.campaigns.push(camp[k]); }
    camp[k].spend += sp; camp[k].leads += ld;
  }
  for (const a of acts) { out[a].leads_counted = counted; out[a].spend = r2(out[a].spend); out[a].campaigns.sort((x, y) => y.spend - x.spend); }
  return out;
}

const KLV = 'https://a.klaviyo.com';
/** A Klaviyo list's or segment's member count, cached an hour in settings (`gwkl:<act>:<kind>:<id>`). Never throws. */
export async function klaviyoCount(env, act, kind, id, fetchFn) {
  if (!id) return null;
  const key = `gwkl:${act}:${kind}:${id}`;
  let c = null; try { c = JSON.parse((await getSetting(env, key)) || 'null'); } catch {}
  if (c && c.at && Date.now() - Date.parse(c.at) < 3600e3) return c;
  const doc = await env.DB.prepare(`SELECT data_json FROM p_br_doc WHERE act_id = ?1 AND line_id = '' AND key = 'klaviyo'`).bind(act).first().catch(() => null);
  let k = null; try { k = JSON.parse(doc?.data_json || 'null')?.key || null; } catch {}
  if (!k) return { error: 'no Klaviyo key in Locus for this brand', ...(c ? { count: c.count, at: c.at, stale: true } : {}) };
  try {
    const res = await (fetchFn || fetch)(`${KLV}/api/${kind}s/${encodeURIComponent(id)}/?fields[${kind}]=name&additional-fields[${kind}]=profile_count`,
      { headers: { Authorization: `Klaviyo-API-Key ${k}`, revision: '2025-07-15', accept: 'application/vnd.api+json' } });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(j.errors?.[0]?.detail || `Klaviyo ${res.status}`);
    const v = { count: num(j.data?.attributes?.profile_count), name: j.data?.attributes?.name || null, at: new Date().toISOString() };
    if (v.count != null) await putSetting(env, key, JSON.stringify(v));
    return v;
  } catch (e) { return { error: String(e.message || e), ...(c ? { count: c.count, at: c.at, stale: true } : {}) }; }
}

/* ------------------------------------------------------------------ the read ------------------------------------------------------------------ */
/** One brand's split and giveaway verdict.
 *  ctx: { brand (name), today (brand's local date), from, to (the window), revenue, spend (store revenue and ALL ad spend in
 *  the window), window_gw (giveawaySpend over the window), to_date_gw (giveawaySpend from the start to yesterday),
 *  list (klaviyoCount of the entries list), payback_seg (klaviyoCount of the payback segment) }. Pure. */
export function judge(cfg, ctx) {
  const floor = merFloorFor(ctx.brand, cfg), max = maxCostPerEntry(cfg, floor);
  const yday = addDays(ctx.today, -1);
  const w = clip(cfg, ctx.from, ctx.to);
  const gws = w ? +(ctx.window_gw?.spend || 0) : 0;
  const rev = num(ctx.revenue), sp = num(ctx.spend);
  const salesSpend = sp == null ? null : Math.max(0, sp - gws);
  const window = { from: ctx.from, to: ctx.to, revenue: rev, spend: sp, giveaway_spend: r2(gws), sales_spend: r2(salesSpend),
    sales_mer: rev != null && salesSpend > 0 ? r2(rev / salesSpend) : null, blended_mer: rev != null && sp > 0 ? r2(rev / sp) : null,
    days: w ? Object.fromEntries(Object.entries(ctx.window_gw?.days || {}).map(([d, x]) => [d, { spend: r2(x.spend), leads: x.leads }])) : {} };
  /* Since it started: entries, cost per entry, pace. Klaviyo when a list is set and read; else Meta lead results. */
  const started = ctx.today >= cfg.start;
  const tdTo = yday < cfg.end ? yday : cfg.end;
  const elapsed = started && tdTo >= cfg.start ? dayDiff(cfg.start, tdTo) + 1 : 0;
  const total = dayDiff(cfg.start, cfg.end) + 1;
  const tdSpend = +(ctx.to_date_gw?.spend || 0);
  let entries = null, source = 'none', note = null;
  if (cfg.klaviyo_list_id && ctx.list && ctx.list.count != null) { entries = Math.max(0, ctx.list.count - (cfg.list_baseline || 0)); source = 'klaviyo'; if (ctx.list.stale) note = 'Klaviyo could not be read just now; this is the last count.'; }
  else if (ctx.to_date_gw && ctx.to_date_gw.leads_counted !== false && ctx.to_date_gw.leads > 0) { entries = Math.round(ctx.to_date_gw.leads); source = 'meta_leads'; }
  if (source === 'none') note = cfg.klaviyo_list_id ? `The Klaviyo list could not be read${ctx.list?.error ? ` (${ctx.list.error})` : ''}, and Meta has no lead results on the giveaway campaigns.` : 'No Klaviyo list is set and Meta has no lead results on the giveaway campaigns yet.';
  const cpe = entries > 0 ? r2(tdSpend / entries) : null;
  const goal = num(cfg.entries_goal);
  const expected = goal && elapsed ? Math.round(goal * elapsed / total) : null;
  const pace = expected ? r2(entries / expected) : null;
  const budgetToDate = num(cfg.daily_budget) && elapsed ? r2(cfg.daily_budget * elapsed) : null;
  const to_date = { from: cfg.start, to: elapsed ? tdTo : null, days_elapsed: elapsed, days_total: total, giveaway_spend: r2(tdSpend),
    entries, entries_source: source, entries_note: note, cost_per_entry: cpe, entries_goal: goal, expected_entries: expected, pace,
    pace_status: pace == null ? null : pace >= 1.05 ? 'ahead' : pace >= 0.85 ? 'on_pace' : 'behind',
    budget_to_date: budgetToDate, spend_vs_budget: budgetToDate ? r2(tdSpend / budgetToDate) : null,
    campaigns: (ctx.to_date_gw?.campaigns || []).slice(0, 8).map(c => ({ name: c.name, objective: c.objective, spend: r2(c.spend), leads: c.leads })) };
  const status = !started ? 'not_started' : cpe == null ? (tdSpend > 0 ? 'no_entries' : 'no_spend') : max != null && cpe > max ? 'over_max' : 'on_track';
  const STATUS_TEXT = { not_started: `Starts ${cfg.start}`, no_spend: 'No giveaway spend yet', no_entries: 'Entries not counted yet',
    over_max: 'Over the most to pay per entry', on_track: 'On track' };
  /* After Cyber Monday: orders from entrants November 1 to 30 against the giveaway spend. Measured from a Klaviyo segment
     (entrants who placed an order in that window) when one is set; until then, or without one, it says how. */
  const year = cfg.end.slice(0, 4), pbFrom = `${year}-11-01`, pbTo = `${year}-11-30`;
  let payback;
  if (ctx.today <= pbTo) payback = { status: 'later', from: pbFrom, to: pbTo, text: 'Payback is measured after Cyber Monday: orders placed November 1 to 30 by people who entered, against the giveaway spend.' };
  else if (cfg.payback_segment_id && ctx.payback_seg && ctx.payback_seg.count != null) {
    const buyers = ctx.payback_seg.count, rev2 = cfg.aov ? buyers * cfg.aov : null;
    payback = { status: 'measured', from: pbFrom, to: pbTo, buyers, revenue_estimate: r2(rev2), spend: r2(tdSpend), return: rev2 != null && tdSpend > 0 ? r2(rev2 / tdSpend) : null,
      text: `${fmtInt(buyers)} people who entered bought between November 1 and 30; at the ${fmtMoney(cfg.aov, ctx.currency)} average order that is about ${fmtMoney(rev2, ctx.currency)} back on ${fmtMoney(tdSpend, ctx.currency)} of giveaway spend (an estimate: buyers times the average order).` };
  } else payback = { status: 'needs_segment', from: pbFrom, to: pbTo, text: 'To measure it: in Klaviyo make a segment of people on the entries list who placed an order between November 1 and 30, then paste its id in the giveaway settings.' };
  return { act_id: cfg.act_id, name: cfg.name, start: cfg.start, end: cfg.end, live: liveOn(cfg, ctx.today), in_window: !!w, ran_in_window: !!w && (gws > 0 || liveOn(cfg, ctx.to)),
    floor, max_cost_per_entry: max, buy_rate: cfg.buy_rate, aov: cfg.aov, daily_budget: cfg.daily_budget, terms: termsOf(cfg), match_objective: cfg.match_objective,
    window, to_date, status, status_text: STATUS_TEXT[status], payback };
}

/** Everything for a list of brands over one window. accts: [{act_id, name, currency, tz?}]; money: { act: {revenue, spend} };
 *  opts: { today(act) -> local date, fetch, cfgs (already loaded) }. Returns { act: judge(...) } for brands with a giveaway,
 *  and nothing for the rest. */
export async function giveawayRead(env, accts, from, to, money, opts = {}) {
  const acts = accts.map(a => a.act_id);
  const cfgs = opts.cfgs || await loadGiveaways(env, acts);
  const on = Object.fromEntries(Object.entries(cfgs).filter(([k, c]) => acts.includes(k) && c && c.active !== 0));
  if (!Object.keys(on).length) return {};
  const todayOf = a => (opts.today ? opts.today(a) : new Date().toISOString().slice(0, 10));
  const t0 = todayOf(accts.find(a => on[a.act_id]) || accts[0]);
  const yday = addDays(t0, -1);
  /* Two grouped reads at most: the window, and from the earliest start to yesterday (one when they are the same). */
  const starts = Object.values(on).map(c => c.start).sort();
  const winGw = await giveawaySpend(env, on, from, to);
  const tdGw = starts[0] <= yday ? await giveawaySpend(env, on, starts[0], yday) : {};
  const out = {};
  for (const a of accts) {
    const cfg = on[a.act_id]; if (!cfg) continue;
    const today = todayOf(a);
    const list = cfg.klaviyo_list_id && today >= cfg.start ? await klaviyoCount(env, a.act_id, 'list', cfg.klaviyo_list_id, opts.fetch) : null;
    const pbTo = `${cfg.end.slice(0, 4)}-11-30`;
    const seg = cfg.payback_segment_id && today > pbTo ? await klaviyoCount(env, a.act_id, 'segment', cfg.payback_segment_id, opts.fetch) : null;
    out[a.act_id] = judge(cfg, { brand: a.name, currency: a.currency, today, from, to, revenue: money?.[a.act_id]?.revenue, spend: money?.[a.act_id]?.spend,
      window_gw: winGw[a.act_id], to_date_gw: tdGw[a.act_id], list, payback_seg: seg });
  }
  return out;
}

/* ------------------------------------------------------------------ words ------------------------------------------------------------------ */
const fmtMoney = (n, cur, cents) => n == null ? ' - ' : new Intl.NumberFormat('en-US', { style: 'currency', currency: cur || 'USD', minimumFractionDigits: cents ? 2 : 0, maximumFractionDigits: cents ? 2 : 0 }).format(n);
const fmtInt = n => n == null ? ' - ' : Math.round(n).toLocaleString('en-US');
export const fmtX = n => n == null ? ' - ' : `${(+n).toFixed(2)}x`;

/** The client-safe line for a brief or a report: "Giveaway: 1,234 entries at $1.20 each, building the Black Friday list." */
export function giveawayLine(g, cur) {
  if (!g) return null;
  const t = g.to_date || {};
  if (t.entries > 0 && t.cost_per_entry != null) return `Giveaway: ${fmtInt(t.entries)} entries at ${fmtMoney(t.cost_per_entry, cur, true)} each, building the Black Friday list.`;
  if (t.giveaway_spend > 0) return `Giveaway: ${fmtMoney(t.giveaway_spend, cur)} spent so far building the Black Friday list; entries are still being counted.`;
  return null;
}
/** "Sales MER: *3.10x* (2.40x including giveaway spend)" for Slack; `bold` false drops the asterisks. */
export function salesMerLine(w, bold = true) {
  if (!w || w.sales_mer == null) return null;
  const b = s => bold ? `*${s}*` : s;
  return `Sales MER: ${b(fmtX(w.sales_mer))} (${fmtX(w.blended_mer)} including giveaway spend)`;
}
/** A short internal read for the Strategist and the team. */
export function giveawayRead1(g, cur) {
  if (!g) return null;
  const t = g.to_date || {}, w = g.window || {};
  const bits = [`${g.name} (${g.start} to ${g.end})`];
  if (w.giveaway_spend > 0) bits.push(`in this window ${fmtMoney(w.giveaway_spend, cur)} giveaway spend, sales spend ${fmtMoney(w.sales_spend, cur)}, Sales MER ${fmtX(w.sales_mer)} against the ${fmtX(g.floor)} floor (blended ${fmtX(w.blended_mer)})`);
  if (t.entries != null) bits.push(`${fmtInt(t.entries)} entries since the start (${t.entries_source === 'klaviyo' ? 'Klaviyo list' : 'Meta lead results'}) at ${fmtMoney(t.cost_per_entry, cur, true)} each against a most-to-pay of ${fmtMoney(g.max_cost_per_entry, cur, true)}`);
  if (t.expected_entries) bits.push(`${Math.round((t.pace || 0) * 100)}% of the ${fmtInt(t.expected_entries)} expected by now (goal ${fmtInt(t.entries_goal)})`);
  return bits.join('; ') + '.';
}

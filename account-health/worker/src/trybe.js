/* THE TRYBE TAB (2026-11-05, Ads > Trybe): every approved creator video gets a fair test in Meta.
 *
 * Why: brands fill Trybe with approved videos and launch a fraction of them. The rest sit, the creators stop
 * posting, and the brand decides Trybe does not work. This module makes the gap visible and chases it.
 *
 * - One Trybe Brand API key per brand (a key sees one brand), kept in p_br_doc key 'trybe' like the Klaviyo key.
 *   Only its presence and date ever leave this file.
 * - Once a day the hourly tick pulls each brand's submissions and creator results into p_trybe_sub / p_trybe_creator.
 *   The API has no approval date, so `approved_seen` is the day Locus first saw the video approved (the submitted
 *   date on a brand's first sync); the 3 day clock runs from it.
 * - A video is matched to its Meta ads by `trybe=<trybe_id>` in the ad name (Trybe's own rule; its Build Ads names
 *   them that way). Sales, revenue: Triple Whale (tw_ad_attr, lastPlatformClick). Spend: Meta (ad_daily).
 * - Queue = approved videos Trybe has never seen deliver. `not_in_meta` (no ad carries its id) or `no_delivery`
 *   (an ad exists and Meta never spent on it).
 * - Rebook = a creator whose ads beat the account's cost per sale and who has not posted in REBOOK_DAYS.
 * - A client reads Live and Creators for its own brand, never the Queue or the Rules.
 * No em dashes in anything this posts. */
import { noDash } from './buyerai.js';

const API = 'https://api.jointrybe.com/v1';
export const STALE_DAYS = 3, REBOOK_DAYS = 14, WINDOW_DAYS = 30, REBOOK_MIN_ORDERS = 2;
const ATTR_MODEL = 'lastPlatformClick';
export const DEFAULT_RULES = [
  'Launch every approved video within 3 days of approval.',
  'Judge the ad set first. A creator ad follows the same call rules as every other ad.',
  'Wait until an ad has spent 2x the goal and run 3 days before any call.',
  'Scale: 3 or more sales at or under the goal cost per sale.',
  'Step down: 3x the goal spent with no sale, unless its ROAS beats the goal ROAS.',
  'A winner gets recut with its best line first. Keep both versions running.',
  'Rebook a creator whose ads beat the account cost per sale and who has not posted in 14 days.',
].join('\n');

const SUB_SQL = `CREATE TABLE IF NOT EXISTS p_trybe_sub (
  act_id TEXT NOT NULL, sub_id TEXT NOT NULL, trybe_id TEXT, creator_id TEXT, creator TEXT, status TEXT, media TEXT,
  program TEXT, product TEXT, angle TEXT, transcript TEXT, thumb TEXT, created_at TEXT,
  ads_count INTEGER NOT NULL DEFAULT 0, ads_first TEXT, ads_last TEXT, approved_seen TEXT, alerted TEXT, synced_at TEXT,
  PRIMARY KEY (act_id, sub_id))`;
const CR_SQL = `CREATE TABLE IF NOT EXISTS p_trybe_creator (
  act_id TEXT NOT NULL, creator_id TEXT NOT NULL, name TEXT, avatar TEXT, joined_at TEXT, last_sub_at TEXT, last_ad_day TEXT,
  earnings REAL NOT NULL DEFAULT 0, gmv REAL NOT NULL DEFAULT 0, synced_at TEXT,
  PRIMARY KEY (act_id, creator_id))`;
let made = false;
export async function ensureTrybe(env) {
  if (made) return;
  await env.DB.prepare(SUB_SQL).run();
  await env.DB.prepare(CR_SQL).run();
  await env.DB.prepare(`CREATE INDEX IF NOT EXISTS p_trybe_sub_status ON p_trybe_sub (act_id, status)`).run().catch(() => {});
  made = true;
}

const safeJson = (s, fb) => { try { return s ? JSON.parse(s) : fb; } catch { return fb; } };
const day = iso => String(iso || '').slice(0, 10);
const addDays = (d, n) => { const t = new Date(d + 'T12:00:00Z'); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10); };
const daysBetween = (a, b) => (a && b ? Math.round((Date.parse(b + 'T12:00:00Z') - Date.parse(a + 'T12:00:00Z')) / 864e5) : null);
const clip = (s, n) => { s = String(s || '').replace(/\s+/g, ' ').trim(); return s.length > n ? s.slice(0, n - 1) + '…' : s; };
const round2 = n => Math.round((+n || 0) * 100) / 100;
/** The Trybe id an ad name carries (`..._20261012_trybe=e363d8b4`), or null. */
export const trybeIdOf = name => { const m = /trybe=([0-9a-f]{8})\b/i.exec(String(name || '')); return m ? m[1].toLowerCase() : null; };
const getSetting = async (env, k) => (await env.DB.prepare(`SELECT value FROM settings WHERE key = ?1`).bind(k).first().catch(() => null))?.value ?? null;
const putSetting = (env, k, v) => env.DB.prepare(`INSERT INTO settings (key, value) VALUES (?1, ?2) ON CONFLICT(key) DO UPDATE SET value = excluded.value`).bind(k, String(v)).run();

/* ---------- the key ---------- */
async function trybeGet(d, key, path, q = {}) {
  const u = new URL(API + path);
  for (const [k, v] of Object.entries(q)) if (v !== undefined && v !== null && v !== '') u.searchParams.set(k, String(v));
  const r = await (d.xfetch || fetch)(u.toString(), { headers: { Authorization: `Bearer ${key}`, 'User-Agent': 'locus-trybe' } });
  if (r.status === 429) throw new Error('Trybe asked us to slow down. It will sync on the next run.');
  const j = await r.json().catch(() => null);
  if (!r.ok) {
    const t = j && j.error && j.error.type;
    if (r.status === 401) throw new Error('Trybe did not accept that key.');
    if (r.status === 403 && t === 'feature_not_enabled') throw new Error('The Brand API is not switched on for this brand in Trybe.');
    throw new Error(`Trybe answered ${r.status}${j && j.error && j.error.message ? `: ${j.error.message}` : ''}`);
  }
  return j;
}
async function pages(d, key, path, q, cap = 40) {
  const out = []; let after = null;
  for (let i = 0; i < cap; i++) {
    const j = await trybeGet(d, key, path, { ...q, limit: 100, after });
    out.push(...(j.data || []));
    if (!j.has_more || !j.next_cursor) break;
    after = j.next_cursor;
  }
  return out;
}
export async function keyFor(env, act) {
  const r = await env.DB.prepare(`SELECT data_json FROM p_br_doc WHERE act_id = ?1 AND line_id = '' AND key = 'trybe'`).bind(act).first().catch(() => null);
  return safeJson(r?.data_json, null);
}
/** Check the key with one real call, then keep it. Throws in plain words when Trybe refuses it. */
export async function storeKey(env, d, act, key) {
  const k = String(key || '').replace(/\s+/g, '');
  if (!/^tk_(live|test)_[\w-]{16,}$/.test(k)) throw new Error('A Trybe key starts with tk_live_ and is about 40 characters.');
  await trybeGet(d, k, '/creators', { limit: 1 });
  const verified_at = new Date().toISOString();
  await env.DB.prepare(`INSERT INTO p_br_doc (act_id, line_id, key, data_json, status, source, updated_at) VALUES (?1, '', 'trybe', ?2, 'approved', 'staff', datetime('now'))
    ON CONFLICT(act_id, line_id, key) DO UPDATE SET data_json = excluded.data_json, updated_at = excluded.updated_at`).bind(act, JSON.stringify({ key: k, verified_at })).run();
  return { verified_at };
}
export async function forgetKey(env, act) {
  await env.DB.prepare(`DELETE FROM p_br_doc WHERE act_id = ?1 AND line_id = '' AND key = 'trybe'`).bind(act).run();
}
const keyedBrands = async env => ((await env.DB.prepare(`SELECT act_id FROM p_br_doc WHERE line_id = '' AND key = 'trybe'`).all().catch(() => ({ results: [] }))).results || []).map(r => r.act_id);

/* ---------- the sync ---------- */
const UPSERT = `INSERT INTO p_trybe_sub (act_id, sub_id, trybe_id, creator_id, creator, status, media, program, product, angle, transcript, thumb, created_at, ads_count, ads_first, ads_last, approved_seen, synced_at)
  VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18)
  ON CONFLICT(act_id, sub_id) DO UPDATE SET trybe_id = excluded.trybe_id, creator_id = excluded.creator_id, creator = excluded.creator, status = excluded.status, media = excluded.media,
    program = excluded.program, product = excluded.product, angle = excluded.angle, transcript = excluded.transcript, thumb = excluded.thumb, created_at = excluded.created_at,
    ads_count = excluded.ads_count, ads_first = excluded.ads_first, ads_last = excluded.ads_last, synced_at = excluded.synced_at,
    approved_seen = CASE WHEN excluded.status = 'approved' THEN COALESCE(p_trybe_sub.approved_seen, excluded.approved_seen) ELSE NULL END`;
const CR_UPSERT = `INSERT INTO p_trybe_creator (act_id, creator_id, name, avatar, joined_at, last_sub_at, last_ad_day, earnings, gmv, synced_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)
  ON CONFLICT(act_id, creator_id) DO UPDATE SET name = excluded.name, avatar = excluded.avatar, joined_at = excluded.joined_at, last_sub_at = excluded.last_sub_at, last_ad_day = excluded.last_ad_day,
    earnings = excluded.earnings, gmv = excluded.gmv, synced_at = excluded.synced_at`;
async function runAll(env, stmts) {
  if (env.DB.batch) { for (let i = 0; i < stmts.length; i += 50) await env.DB.batch(stmts.slice(i, i + 50)); }
  else for (const s of stmts) await s.run();
}
/** One brand: every submission and 90 days of creator results into D1. Returns the counts. */
export async function syncBrand(env, d, act, { today } = {}) {
  await ensureTrybe(env);
  const k = await keyFor(env, act);
  if (!k || !k.key) throw new Error('No Trybe key for this brand yet.');
  today = today || (d.centralDate ? d.centralDate() : new Date().toISOString().slice(0, 10));
  const now = new Date().toISOString();
  const first = !(await env.DB.prepare(`SELECT 1 AS x FROM p_trybe_sub WHERE act_id = ?1 LIMIT 1`).bind(act).first().catch(() => null));
  const subs = await pages(d, k.key, '/submissions', {});
  await runAll(env, subs.map(s => env.DB.prepare(UPSERT).bind(act, s.id, s.trybe_id || null, s.creator?.id || null, s.creator?.name || null, s.status || null, s.media_type || null,
    s.program?.name || null, (s.products || []).map(p => p.name).filter(Boolean).join(', ') || null, (s.angles || [])[0]?.name || null, clip(s.transcript?.text, 2000) || null,
    s.thumbnail_url || null, s.created_at || null, +(s.ads?.count || 0), s.ads?.first_day || null, s.ads?.last_day || null,
    s.status === 'approved' ? (first ? day(s.created_at) || today : today) : null, now)));
  const perf = await pages(d, k.key, '/creator-performance', { start_date: addDays(today, -90), end_date: addDays(today, -1), active_only: 'true', sort_by: 'spend' }, 20);
  await runAll(env, perf.map(p => env.DB.prepare(CR_UPSERT).bind(act, p.creator?.id, p.creator?.name || null, p.creator?.avatar_url || null, p.creator?.joined_at || null,
    p.activity?.last_submission_at || null, p.activity?.last_ad_day || null, (p.performance?.earnings_cents || 0) / 100, (p.performance?.trybe_gmv_cents || 0) / 100, now)));
  const out = { at: now, subs: subs.length, creators: perf.length };
  await putSetting(env, `trybeSync:${act}`, JSON.stringify(out));
  return out;
}

/* ---------- the read ---------- */
async function metaActs(env, act) {
  const r = (await env.DB.prepare(`SELECT external_id FROM connections WHERE brand_id = ?1 AND kind = 'meta'`).bind(act).all().catch(() => ({ results: [] }))).results || [];
  return [...new Set([act, ...r.map(x => x.external_id)].filter(Boolean))];
}
const portalOf = subs => { for (const s of subs) { const m = /\/brands\/([0-9a-f-]{36})\//.exec(s.thumb || ''); if (m) return `https://jointrybe.com/brand?b=${m[1]}`; } return 'https://jointrybe.com/brand'; };

/** Everything the Trybe tab shows for one brand. `client` trims it to Live and Creators. */
export async function trybeView(env, d, act, { client = false, today } = {}) {
  await ensureTrybe(env);
  today = today || (d.centralDate ? d.centralDate() : new Date().toISOString().slice(0, 10));
  const from = addDays(today, -(WINDOW_DAYS - 1));
  const k = await keyFor(env, act);
  const sync = safeJson(await getSetting(env, `trybeSync:${act}`), null);
  const subs = (await env.DB.prepare(`SELECT * FROM p_trybe_sub WHERE act_id = ?1`).bind(act).all()).results || [];
  const approved = subs.filter(s => s.status === 'approved');
  const acts = await metaActs(env, act);
  const ph = acts.map((_, i) => `?${i + 1}`).join(', ');
  /* The Meta ads that carry a Trybe id, their 30 day spend, and the account's 30 day spend. */
  const ads = (await env.DB.prepare(`SELECT ad_id, name, status FROM ads WHERE act_id IN (${ph}) AND name LIKE '%trybe=%'`).bind(...acts).all().catch(() => ({ results: [] }))).results || [];
  const spendRows = (await env.DB.prepare(`SELECT ad_id, SUM(spend) AS spend FROM ad_daily WHERE act_id IN (${ph}) AND date >= ?${acts.length + 1} GROUP BY ad_id`).bind(...acts, from).all().catch(() => ({ results: [] }))).results || [];
  const twRows = (await env.DB.prepare(`SELECT ad_id, SUM(revenue) AS revenue, SUM(orders) AS orders FROM tw_ad_attr WHERE act_id = ?1 AND model = ?2 AND date >= ?3 AND (platform = 'meta' OR platform IS NULL) GROUP BY ad_id`)
    .bind(act, ATTR_MODEL, from).all().catch(() => ({ results: [] }))).results || [];
  const spendOf = new Map(spendRows.map(r => [String(r.ad_id), +r.spend || 0]));
  const twOf = new Map(twRows.map(r => [String(r.ad_id), { revenue: +r.revenue || 0, orders: +r.orders || 0 }]));
  const acctSpend = spendRows.reduce((s, r) => s + (+r.spend || 0), 0), acctOrders = twRows.reduce((s, r) => s + (+r.orders || 0), 0);
  const acctCpa = acctOrders > 0 ? acctSpend / acctOrders : null;

  const byId = new Map();   // trybe_id -> { ads, on, spend, orders, revenue }
  for (const a of ads) {
    const id = trybeIdOf(a.name); if (!id) continue;
    const g = byId.get(id) || { ads: 0, on: 0, spend: 0, orders: 0, revenue: 0 };
    const tw = twOf.get(String(a.ad_id)) || { revenue: 0, orders: 0 };
    g.ads++; if (a.status === 'ACTIVE') g.on++;
    g.spend += spendOf.get(String(a.ad_id)) || 0; g.orders += tw.orders; g.revenue += tw.revenue;
    byId.set(id, g);
  }
  const row = s => ({ sub_id: s.sub_id, trybe_id: s.trybe_id, creator_id: s.creator_id, creator: s.creator || 'Creator', product: s.product || '', program: s.program || '', angle: s.angle || '', thumb: s.thumb || null, media: s.media });
  const num = g => ({ ads: g.ads, on: g.on, spend: round2(g.spend), orders: round2(g.orders), revenue: round2(g.revenue), cpa: g.orders > 0 ? round2(g.spend / g.orders) : null, roas: g.spend > 0 ? round2(g.revenue / g.spend) : null });

  /* Live: approved videos whose ads spent in the window. */
  const live = approved.filter(s => (byId.get(s.trybe_id) || {}).spend > 0)
    .map(s => ({ ...row(s), ...num(byId.get(s.trybe_id)), line: clip(s.transcript, 220), transcript: client ? undefined : s.transcript || '' }))
    .sort((a, b) => b.spend - a.spend);

  /* Creators: the live rows rolled up, with Trybe's own activity dates. */
  const crs = new Map(((await env.DB.prepare(`SELECT * FROM p_trybe_creator WHERE act_id = ?1`).bind(act).all()).results || []).map(c => [c.creator_id, c]));
  const lastSub = new Map();
  for (const s of subs) { const cur = lastSub.get(s.creator_id); if (s.created_at && (!cur || s.created_at > cur)) lastSub.set(s.creator_id, s.created_at); }
  const agg = new Map();
  for (const v of live) {
    const g = agg.get(v.creator_id) || { creator_id: v.creator_id, name: v.creator, videos: 0, ads: 0, on: 0, spend: 0, orders: 0, revenue: 0 };
    g.videos++; g.ads += v.ads; g.on += v.on; g.spend += v.spend; g.orders += v.orders; g.revenue += v.revenue;
    agg.set(v.creator_id, g);
  }
  const creators = [...agg.values()].map(g => {
    const c = crs.get(g.creator_id) || {}, last = day(lastSub.get(g.creator_id) || c.last_sub_at), quiet = daysBetween(last, today);
    const n = num(g);
    const beats = acctCpa != null && n.cpa != null && n.orders >= REBOOK_MIN_ORDERS && n.cpa <= acctCpa;
    return { creator_id: g.creator_id, name: g.name, avatar: c.avatar || null, videos: g.videos, ...n, last_video: last || null, quiet_days: quiet,
      beats, rebook: beats && quiet != null && quiet >= REBOOK_DAYS, ...(client ? {} : { earnings: round2(c.earnings) }) };
  }).sort((a, b) => b.revenue - a.revenue || b.spend - a.spend);

  const account = { spend: round2(acctSpend), orders: round2(acctOrders), cpa: acctCpa != null ? round2(acctCpa) : null, days: WINDOW_DAYS,
    trybe_spend: round2(live.reduce((s, v) => s + v.spend, 0)), trybe_orders: round2(live.reduce((s, v) => s + v.orders, 0)) };
  account.share = account.spend > 0 ? round2(account.trybe_spend / account.spend) : null;
  account.trybe_cpa = account.trybe_orders > 0 ? round2(account.trybe_spend / account.trybe_orders) : null;
  if (client) return { act, has_key: !!(k && k.key), synced_at: sync?.at || null, account, live, creators, counts: { live: live.length, creators: creators.length } };

  /* Queue: approved, and Trybe has never seen it deliver. Oldest approval first, then the creator's sales. */
  const sold = new Map(creators.map(c => [c.creator_id, c.orders]));
  const queue = approved.filter(s => !(+s.ads_count > 0) && !((byId.get(s.trybe_id) || {}).spend > 0)).map(s => {
    const g = byId.get(s.trybe_id);
    return { ...row(s), state: g ? 'no_delivery' : 'not_in_meta', meta_ads: g ? g.ads : 0, meta_on: g ? g.on : 0, approved_seen: s.approved_seen || null,
      days: daysBetween(s.approved_seen || day(s.created_at), today) ?? 0, submitted: day(s.created_at), line: clip(s.transcript, 220), creator_orders: sold.get(s.creator_id) || 0 };
  }).sort((a, b) => b.days - a.days || b.creator_orders - a.creator_orders);
  const stale = queue.filter(q => q.days >= STALE_DAYS);
  return { act, has_key: !!(k && k.key), key_at: k?.verified_at || null, synced_at: sync?.at || null, portal: portalOf(subs), stale_days: STALE_DAYS, rebook_days: REBOOK_DAYS,
    account, queue, live, creators, rules: (await getSetting(env, `trybeRules:${act}`)) || DEFAULT_RULES, rules_default: !(await getSetting(env, `trybeRules:${act}`)),
    counts: { approved: approved.length, queue: queue.length, not_in_meta: queue.filter(q => q.state === 'not_in_meta').length, no_delivery: queue.filter(q => q.state === 'no_delivery').length,
      stale: stale.length, oldest: queue.length ? queue[0].days : 0, live: live.length, creators: creators.length, rebook: creators.filter(c => c.rebook).length,
      pending: subs.filter(s => s.status === 'pending').length, revision: subs.filter(s => s.status === 'revision_requested').length } };
}

/** Agency view: one line per brand. Cheap: counts from D1 only. */
export async function trybeAll(env, d, brands, { today } = {}) {
  await ensureTrybe(env);
  today = today || (d.centralDate ? d.centralDate() : new Date().toISOString().slice(0, 10));
  const keyed = new Set(await keyedBrands(env));
  const cut = addDays(today, -STALE_DAYS);
  const rows = (await env.DB.prepare(`SELECT act_id, SUM(status = 'approved') AS approved, SUM(status = 'approved' AND ads_count = 0) AS queue,
      SUM(status = 'approved' AND ads_count = 0 AND approved_seen <= ?1) AS stale, SUM(status = 'pending') AS pending, MIN(CASE WHEN status = 'approved' AND ads_count = 0 THEN approved_seen END) AS oldest
    FROM p_trybe_sub GROUP BY act_id`).bind(cut).all()).results || [];
  const by = new Map(rows.map(r => [r.act_id, r]));
  const out = [];
  for (const b of brands) {
    const r = by.get(b.act_id) || {}, has = keyed.has(b.act_id);
    if (!has && !r.approved) continue;
    const sync = safeJson(await getSetting(env, `trybeSync:${b.act_id}`), null);
    out.push({ act_id: b.act_id, name: b.name, has_key: has, synced_at: sync?.at || null, approved: +r.approved || 0, queue: +r.queue || 0, stale: +r.stale || 0, pending: +r.pending || 0,
      oldest: r.oldest ? daysBetween(r.oldest, today) : 0 });
  }
  return { act: 'all', brands: out.sort((a, b) => b.queue - a.queue), no_key: brands.filter(b => !keyed.has(b.act_id)).map(b => ({ act_id: b.act_id, name: b.name })), stale_days: STALE_DAYS };
}

/** Ads > Calls: one line per brand with videos waiting (buyerlist.js adds it to its banners; never shown to a client). */
export async function trybeBanners(env, ids, today) {
  await ensureTrybe(env);
  const cut = addDays(today, -STALE_DAYS);
  const rows = (await env.DB.prepare(`SELECT act_id, COUNT(*) AS n, MIN(approved_seen) AS oldest FROM p_trybe_sub WHERE status = 'approved' AND ads_count = 0 AND approved_seen <= ?1 GROUP BY act_id`).bind(cut).all()).results || [];
  return rows.filter(r => ids.has(r.act_id) && r.n > 0).map(r => ({ act_id: r.act_id, kind: 'trybe',
    text: `${r.n} approved Trybe video${r.n === 1 ? ' has' : 's have'} waited ${STALE_DAYS} days or more without running (oldest ${daysBetween(r.oldest, today)} days). Launch them from Ads > Trybe.` }));
}

/* ---------- the daily tick: sync, then the stale alert (and Monday's rebook list) ---------- */
export function staleMessage(brand, stale, rebook, link) {
  const lines = [];
  if (stale.length) {
    lines.push(`*Trybe: ${stale.length} approved video${stale.length === 1 ? ' is' : 's are'} not live after ${STALE_DAYS} days.* Oldest: ${stale[0].days} days.`);
    for (const q of stale.slice(0, 5)) lines.push(`• ${q.creator}${q.product ? `, ${clip(q.product, 40)}` : ''}: ${q.days} days${q.state === 'no_delivery' ? ' (in Meta, no spend)' : ''}`);
    if (stale.length > 5) lines.push(`• and ${stale.length - 5} more`);
  }
  if (rebook.length) {
    lines.push(`*Rebook this week:* ${rebook.slice(0, 8).map(c => `${c.name} (${c.quiet_days} days quiet, $${Math.round(c.cpa)} a sale)`).join(', ')}.`);
  }
  if (!lines.length) return null;
  lines.push(`<${link}|Open Ads > Trybe for ${brand}>`);
  return noDash(lines.join('\n'));
}
export async function trybeTick(env, d, { force = false } = {}) {
  const today = d.centralDate();
  if (!force && (await getSetting(env, 'trybeDay')) === today) return { skipped: 'done today' };
  if (!force && d.centralHour && d.centralHour() < 4) return { skipped: 'before 4am' };
  await ensureTrybe(env);
  const keyed = new Set(await keyedBrands(env));
  if (!keyed.size) return { skipped: 'no keys' };
  const alertsOn = (await getSetting(env, 'trybeAlerts')) !== 'off';
  const monday = new Date(today + 'T12:00:00Z').getUTCDay() === 1;
  const brands = (await d.listBrands(env)).filter(b => keyed.has(b.act_id));
  const out = { synced: 0, posted: 0, errors: [] };
  for (const b of brands) {
    if (d.canAfford && !d.canAfford(60)) { out.errors.push('out of calls for this run'); break; }
    try {
      await syncBrand(env, d, b.act_id, { today }); out.synced++;
      if (!alertsOn || !b.slack_channel || (b.brief_channel && b.slack_channel === b.brief_channel)) continue;
      const v = await trybeView(env, d, b.act_id, { today });
      const seen = new Set(((await env.DB.prepare(`SELECT sub_id FROM p_trybe_sub WHERE act_id = ?1 AND alerted IS NOT NULL`).bind(b.act_id).all()).results || []).map(r => r.sub_id));
      const fresh = v.queue.filter(q => q.days >= STALE_DAYS && !seen.has(q.sub_id));
      const msg = staleMessage(b.name, fresh, monday ? v.creators.filter(c => c.rebook) : [], `${d.appUrl || 'https://locus.go-mobius-digital.com'}/?open=trybe&act=${b.act_id}`);
      if (!msg) continue;
      await d.slackPost(env, b.slack_channel, msg, null, { username: 'Locus' });
      out.posted++;
      await runAll(env, fresh.map(q => env.DB.prepare(`UPDATE p_trybe_sub SET alerted = ?3 WHERE act_id = ?1 AND sub_id = ?2`).bind(b.act_id, q.sub_id, today)));
    } catch (e) { out.errors.push(`${b.name}: ${e.message}`); }
  }
  await putSetting(env, 'trybeDay', today);
  return out;
}

/* ---------- routes ---------- */
export async function handleTrybe(request, env, url, path, json, h) {
  if (!/^\/api\/trybe(\/|$)/.test(path)) return null;
  if (!(await h.isAdmin(request, env))) return json({ error: 'unauthorized' }, 401);
  const d = h.deps, client = !!(h.isClient && h.isClient(request));
  const email = await h.sessionEmail(env, request).catch(() => null);
  const only = await h.brandsFor(env, email).catch(() => null);
  const actOf = async raw => { raw = String(raw || 'all'); if (raw === 'all') return 'all'; return (await h.resolveBrandId(env, raw).catch(() => '')) || ''; };
  const allowed = act => act && act !== 'all' && (!only || only.has(act));
  try {
    if (path === '/api/trybe' && request.method === 'GET') {
      const act = await actOf(url.searchParams.get('act'));
      if (!act) return json({ error: 'No such brand.' }, 404);
      if (act === 'all') {
        if (client) return json({ error: 'Pick a brand.' }, 400);
        return json(await trybeAll(env, d, (await d.listBrands(env)).filter(b => !only || only.has(b.act_id))));
      }
      if (!allowed(act)) return json({ error: 'You do not have access to this brand.' }, 403);
      return json(await trybeView(env, d, act, { client }));
    }
    if (client) return json({ error: 'That part is the Mobius team\'s.' }, 403);
    const b = request.method === 'GET' ? {} : await request.json().catch(() => ({}));
    const act = await actOf(b.act || url.searchParams.get('act'));
    if (!allowed(act)) return json({ error: act ? 'You do not have access to this brand.' : 'No such brand.' }, act ? 403 : 404);
    if (path === '/api/trybe/key' && request.method === 'PUT') {
      if (!String(b.key || '').trim()) { await forgetKey(env, act); return json({ ok: true, has_key: false }); }
      const v = await storeKey(env, d, act, b.key);
      const s = await syncBrand(env, d, act).catch(e => ({ error: e.message }));
      return json({ ok: true, has_key: true, ...v, sync: s });
    }
    if (path === '/api/trybe/sync' && request.method === 'POST') return json({ ok: true, sync: await syncBrand(env, d, act) });
    if (path === '/api/trybe/rules' && request.method === 'PUT') {
      const t = noDash(String(b.rules || '')).trim().slice(0, 4000);
      if (t) await putSetting(env, `trybeRules:${act}`, t); else await env.DB.prepare(`DELETE FROM settings WHERE key = ?1`).bind(`trybeRules:${act}`).run();
      return json({ ok: true, rules: t || DEFAULT_RULES, rules_default: !t });
    }
    return json({ error: 'not found' }, 404);
  } catch (e) { return json({ error: e.message }, 400); }
}

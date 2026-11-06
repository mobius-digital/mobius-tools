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
 * - Queue = approved videos Trybe has never seen deliver. Locus's `ads` table only holds ads that SPENT, so the sync reads
 *   every ad named `trybe=` live from Meta into p_trybe_ad. States: `not_launched` (no ad carries its id), `scheduled`
 *   (its ad set starts later), `review` / `rejected` (Meta), `off` (its ads are paused), `no_spend` (on, no delivery yet).
 *   Only `not_launched` is the backlog; the alert, the banner and the Agency view count that alone.
 * - Rebook = a creator whose ads beat the account's cost per sale and who has not posted in REBOOK_DAYS.
 * - The Slack lines are off until settings.trybeAlerts = 'on' (the Agency view has the switch); the sync runs either way.
 * - A client reads Live and Creators for its own brand, never the Queue or the Rules.
 * No em dashes in anything this posts. */
import { noDash } from './buyerai.js';
import { frameApi } from './frame.js';
import { frameProject } from './stratmake.js';
import { gall, metaActs as metaAccounts } from './metawrite.js';

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
const AD_SQL = `CREATE TABLE IF NOT EXISTS p_trybe_ad (
  act_id TEXT NOT NULL, ad_id TEXT NOT NULL, trybe_id TEXT, name TEXT, status TEXT, adset_id TEXT, adset TEXT, campaign TEXT,
  start_time TEXT, created_time TEXT, synced_at TEXT,
  PRIMARY KEY (act_id, ad_id))`;
let made = false;
export async function ensureTrybe(env) {
  if (made) return;
  await env.DB.prepare(SUB_SQL).run();
  await env.DB.prepare(CR_SQL).run();
  await env.DB.prepare(AD_SQL).run();
  await env.DB.prepare(`CREATE INDEX IF NOT EXISTS p_trybe_ad_tid ON p_trybe_ad (act_id, trybe_id)`).run().catch(() => {});
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
  /* Every Meta ad named trybe=, spent or not (Locus's own ads table only knows ads that spent). A failed read keeps the last one. */
  let metaAds = null, metaErr = null;
  try { metaAds = await readMetaAds(env, d, act); } catch (e) { metaErr = e.message; }
  if (metaAds) {
    await env.DB.prepare(`DELETE FROM p_trybe_ad WHERE act_id = ?1`).bind(act).run();
    await runAll(env, metaAds.filter(a => trybeIdOf(a.name)).map(a => env.DB.prepare(`INSERT OR REPLACE INTO p_trybe_ad (act_id, ad_id, trybe_id, name, status, adset_id, adset, campaign, start_time, created_time, synced_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)`)
      .bind(act, String(a.id), trybeIdOf(a.name), a.name || null, a.effective_status || a.status || null, a.adset?.id || a.adset_id || null, a.adset?.name || null, a.campaign?.name || null, a.adset?.start_time || null, a.created_time || null, now)));
  }
  const out = { at: now, subs: subs.length, creators: perf.length, meta_ads: metaAds ? metaAds.length : null, ...(metaErr ? { meta_error: metaErr } : {}) };
  await putSetting(env, `trybeSync:${act}`, JSON.stringify(out));
  return out;
}

/** The brand's Meta ads whose name carries a Trybe id, live. `d.metaAds` replaces the Graph read in tests. */
async function readMetaAds(env, d, act) {
  if (d.metaAds) return d.metaAds(env, act);
  const out = [];
  for (const m of await metaAccounts(env, act)) {
    const fields = 'id,name,effective_status,created_time,adset{id,name,start_time},campaign{name}';
    /* Meta filters by name for us; if it refuses the filter, read every ad and keep the ones named trybe=. */
    const rows = await gall(d, env, `${m.act}/ads`, { fields, filtering: JSON.stringify([{ field: 'name', operator: 'CONTAIN', value: 'trybe=' }]), limit: '200' }, 15)
      .catch(() => gall(d, env, `${m.act}/ads`, { fields, limit: '300' }, 20));
    out.push(...rows.filter(a => trybeIdOf(a.name)));
  }
  return out;
}
const ON = new Set(['ACTIVE']), REVIEW = new Set(['PENDING_REVIEW', 'IN_PROCESS', 'PREAPPROVED', 'PENDING_BILLING_INFO']), REJECTED = new Set(['DISAPPROVED', 'WITH_ISSUES']);
/** Where a never-delivered video stands, from its Meta ads. */
export function queueState(ads, nowIso) {
  if (!ads || !ads.length) return 'not_launched';
  if (ads.some(a => ON.has(a.status))) return ads.every(a => !ON.has(a.status) || (a.start_time && a.start_time > nowIso)) ? 'scheduled' : 'no_spend';
  if (ads.some(a => REVIEW.has(a.status))) return 'review';
  if (ads.every(a => REJECTED.has(a.status))) return 'rejected';
  return 'off';
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
  const ads = (await env.DB.prepare(`SELECT ad_id, name, status, adset, campaign, start_time, created_time FROM p_trybe_ad WHERE act_id = ?1`).bind(act).all().catch(() => ({ results: [] }))).results || [];
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
    const g = byId.get(id) || { ads: 0, on: 0, spend: 0, orders: 0, revenue: 0, list: [] };
    g.list.push(a);
    const tw = twOf.get(String(a.ad_id)) || { revenue: 0, orders: 0 };
    g.ads++; if (a.status === 'ACTIVE') g.on++;
    g.spend += spendOf.get(String(a.ad_id)) || 0; g.orders += tw.orders; g.revenue += tw.revenue;
    byId.set(id, g);
  }
  const row = s => ({ sub_id: s.sub_id, trybe_id: s.trybe_id, creator_id: s.creator_id, creator: s.creator || 'Creator', product: s.product || '', program: s.program || '', angle: s.angle || '', thumb: s.thumb || null, media: s.media });
  const where = g => { const a = (g.list || []).find(x => x.status === 'ACTIVE') || (g.list || [])[0]; return a ? { adset: a.adset || '', campaign: a.campaign || '' } : {}; };
  const num = g => ({ ads: g.ads, on: g.on, spend: round2(g.spend), orders: round2(g.orders), revenue: round2(g.revenue), cpa: g.orders > 0 ? round2(g.spend / g.orders) : null, roas: g.spend > 0 ? round2(g.revenue / g.spend) : null });

  /* Live: approved videos whose ads spent in the window. */
  const live = approved.filter(s => (byId.get(s.trybe_id) || {}).spend > 0)
    .map(s => ({ ...row(s), ...num(byId.get(s.trybe_id)), ...where(byId.get(s.trybe_id)), line: clip(s.transcript, 220), transcript: client ? undefined : s.transcript || '' }))
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
  const made = new Map();
  for (const s of approved) made.set(s.creator_id, (made.get(s.creator_id) || 0) + 1);
  const creators = [...agg.values()].map(g => {
    const c = crs.get(g.creator_id) || {}, last = day(lastSub.get(g.creator_id) || c.last_sub_at), quiet = daysBetween(last, today);
    const n = num(g);
    const beats = acctCpa != null && n.cpa != null && n.orders >= REBOOK_MIN_ORDERS && n.cpa <= acctCpa;
    return { creator_id: g.creator_id, name: g.name, avatar: c.avatar || null, videos: g.videos, approved: made.get(g.creator_id) || g.videos, ...n, last_video: last || null, quiet_days: quiet,
      beats, rebook: beats && quiet != null && quiet >= REBOOK_DAYS, ...(client ? {} : { earnings: round2(c.earnings) }) };
  }).sort((a, b) => b.revenue - a.revenue || b.spend - a.spend);

  const account = { spend: round2(acctSpend), orders: round2(acctOrders), cpa: acctCpa != null ? round2(acctCpa) : null, days: WINDOW_DAYS,
    trybe_spend: round2(live.reduce((s, v) => s + v.spend, 0)), trybe_orders: round2(live.reduce((s, v) => s + v.orders, 0)) };
  account.share = account.spend > 0 ? round2(account.trybe_spend / account.spend) : null;
  account.trybe_cpa = account.trybe_orders > 0 ? round2(account.trybe_spend / account.trybe_orders) : null;
  if (client) return { act, has_key: !!(k && k.key), synced_at: sync?.at || null, account, live, creators, counts: { live: live.length, creators: creators.length } };

  /* Queue: approved, and Trybe has never seen it deliver. Oldest approval first, then the creator's sales. */
  const sold = new Map(creators.map(c => [c.creator_id, c.orders]));
  const nowIso = new Date().toISOString();
  const queue = approved.filter(s => !(+s.ads_count > 0) && !((byId.get(s.trybe_id) || {}).spend > 0)).map(s => {
    const g = byId.get(s.trybe_id);
    const launched = g ? day(g.list.map(a => a.created_time || '').sort().pop()) : null;
    return { ...row(s), state: queueState(g && g.list, nowIso), meta_ads: g ? g.ads : 0, meta_on: g ? g.on : 0, ...(g ? where(g) : {}), launched, launched_days: launched ? daysBetween(launched, today) : null, starts: g ? day(g.list.map(a => a.start_time || '').sort().pop()) || null : null, approved_seen: s.approved_seen || null,
      days: daysBetween(s.approved_seen || day(s.created_at), today) ?? 0, submitted: day(s.created_at), line: clip(s.transcript, 220), creator_orders: sold.get(s.creator_id) || 0 };
  }).sort((a, b) => b.days - a.days || b.creator_orders - a.creator_orders);
  const waiting = queue.filter(q => q.state === 'not_launched');
  const stale = waiting.filter(q => q.days >= STALE_DAYS);
  return { act, has_key: !!(k && k.key), key_at: k?.verified_at || null, synced_at: sync?.at || null, portal: portalOf(subs), stale_days: STALE_DAYS, rebook_days: REBOOK_DAYS,
    account, queue, live, creators, rules: (await getSetting(env, `trybeRules:${act}`)) || DEFAULT_RULES, rules_default: !(await getSetting(env, `trybeRules:${act}`)),
    counts: { approved: approved.length, queue: queue.length, not_launched: waiting.length, no_spend: queue.filter(q => q.state === 'no_spend').length, other: queue.filter(q => !['not_launched', 'no_spend'].includes(q.state)).length,
      stale: stale.length, oldest: waiting.length ? Math.max(...waiting.map(q => q.days)) : 0, live: live.length, creators: creators.length, rebook: creators.filter(c => c.rebook).length,
      pending: subs.filter(s => s.status === 'pending').length, revision: subs.filter(s => s.status === 'revision_requested').length } };
}

/* ---------- the scorecard (2026-11-05, Cole: "how am I supposed to analyze this?") ----------
   One row per creator program, for the last 7 and 30 days: creator ad spend (Meta), sales and orders (Triple Whale,
   lastPlatformClick), cost per sale against the brand's goal, videos in / approved / launched, winners (videos with a
   sale), active creators and Discord members. Lucky runs its own creator app: its row comes from the app's summary feed,
   re-priced against our own Triple Whale rows so every brand is judged on one model. */
/* `model`: 'tw' (default, Triple Whale lastPlatformClick, the standard) or 'meta' (Meta's own purchases, a second opinion). */
async function creatorMoney(env, act, ids, from, model = 'tw') {
  const out = { spend: 0, orders: 0, revenue: 0, byAd: new Map() };
  if (!ids.length) return out;
  const acts = await metaActs(env, act);
  const bump = (id, k, v) => { const g = out.byAd.get(id) || { spend: 0, orders: 0 }; g[k] += v; out.byAd.set(id, g); };
  for (let i = 0; i < ids.length; i += 60) {
    const chunk = ids.slice(i, i + 60);
    const ph = chunk.map((_, j) => `?${j + 2}`).join(', ');
    const aph = acts.map((_, j) => `?${chunk.length + 2 + j}`).join(', ');
    const sp = (await env.DB.prepare(`SELECT ad_id, SUM(spend) AS spend, SUM(purchases) AS orders, SUM(revenue) AS revenue FROM ad_daily WHERE date >= ?1 AND ad_id IN (${ph}) AND act_id IN (${aph}) GROUP BY ad_id`)
      .bind(from, ...chunk, ...acts).all().catch(() => ({ results: [] }))).results || [];
    const tw = model === 'meta' ? sp : ((await env.DB.prepare(`SELECT ad_id, SUM(orders) AS orders, SUM(revenue) AS revenue FROM tw_ad_attr WHERE date >= ?1 AND ad_id IN (${ph}) AND act_id = ?${chunk.length + 2} AND model = ?${chunk.length + 3} AND (platform = 'meta' OR platform IS NULL) GROUP BY ad_id`)
      .bind(from, ...chunk, act, ATTR_MODEL).all().catch(() => ({ results: [] }))).results || []);
    for (const r of sp) { out.spend += +r.spend || 0; bump(String(r.ad_id), 'spend', +r.spend || 0); }
    for (const r of tw) { out.orders += +r.orders || 0; out.revenue += +r.revenue || 0; bump(String(r.ad_id), 'orders', +r.orders || 0); }
  }
  return out;
}
const sideOf = (m, goal) => ({ spend: round2(m.spend), orders: round2(m.orders), sales: round2(m.revenue), cpa: m.orders > 0 ? round2(m.spend / m.orders) : null,
  roas: m.spend > 0 ? round2(m.revenue / m.spend) : null, goal_cpa: goal || null, on_goal: goal && m.orders > 0 ? m.spend / m.orders <= goal : null });
async function discordMembers(env, act) {
  try {
    const row = k => env.DB.prepare(`SELECT data_json FROM p_br_doc WHERE act_id = ?1 AND line_id = '' AND key = 'discord'`).bind(k).first();
    const [a, b] = await Promise.all([row('agency'), row(act)]);
    const tok = (safeJson(a?.data_json, {}) || {}).token, gid = (safeJson(b?.data_json, {}) || {}).guild_id;
    if (!tok || !gid) return null;
    const r = await fetch(`https://discord.com/api/v10/guilds/${gid}?with_counts=true`, { headers: { Authorization: `Bot ${tok}` } });
    if (!r.ok) return null;
    const g = await r.json();
    return Math.max(0, (+g.approximate_member_count || 0) - 2);   // minus the owner and the bot
  } catch { return null; }
}
const dayOf = x => String(x || '').slice(0, 10);
async function brandCard(env, b, today, model = 'tw') {
  const f7 = addDays(today, -6), f30 = addDays(today, -29);
  const goal = +b.target_cpa || null;
  const subs = (await env.DB.prepare(`SELECT trybe_id, creator_id, status, created_at, approved_seen, ads_count FROM p_trybe_sub WHERE act_id = ?1`).bind(b.act_id).all()).results || [];
  const ads = (await env.DB.prepare(`SELECT ad_id, name, created_time FROM p_trybe_ad WHERE act_id = ?1`).bind(b.act_id).all().catch(() => ({ results: [] }))).results || [];
  const ids = ads.map(a => String(a.ad_id));
  const [m7, m30, dc] = await Promise.all([creatorMoney(env, b.act_id, ids, f7, model), creatorMoney(env, b.act_id, ids, f30, model), discordMembers(env, b.act_id)]);
  const vid = new Map();   // trybe id -> orders in 7 days
  for (const a of ads) { const id = trybeIdOf(a.name); if (!id) continue; vid.set(id, (vid.get(id) || 0) + ((m7.byAd.get(String(a.ad_id)) || {}).orders || 0)); }
  const launched = from => new Set(ads.filter(a => dayOf(a.created_time) >= from).map(a => trybeIdOf(a.name)).filter(Boolean)).size;
  const side = (m, from) => ({ ...sideOf(m, goal), videos_in: subs.filter(s => dayOf(s.created_at) >= from).length,
    approved: subs.filter(s => s.status === 'approved' && dayOf(s.approved_seen) >= from).length, launched: launched(from) });
  const withAds = new Set(ads.map(a => trybeIdOf(a.name)).filter(Boolean));
  return { act_id: b.act_id, name: b.name, source: 'trybe', last_7: { ...side(m7, f7), winners: [...vid.values()].filter(n => n > 0).length }, last_30: side(m30, f30),
    creators_active: new Set(subs.filter(s => dayOf(s.created_at) >= f30).map(s => s.creator_id)).size, discord: dc,
    waiting: subs.filter(s => s.status === 'approved' && !(+s.ads_count > 0) && !withAds.has(s.trybe_id)).length };
}
async function luckyCard(env, b, today, model = 'tw') {
  const base = { act_id: b.act_id, name: b.name, source: 'lucky_app' };
  if (!env.LUCKY_PROGRAM_KEY) return { ...base, error: 'The Lucky app key is not set in Locus yet.' };
  let j;
  try {
    const r = await fetch('https://creators.luckygolf.com/api/stats/program-summary', { headers: { Authorization: `Bearer ${env.LUCKY_PROGRAM_KEY}` } });
    if (!r.ok) return { ...base, error: `The Lucky app answered ${r.status}.` };
    j = await r.json();
  } catch { return { ...base, error: 'Could not reach the Lucky app.' }; }
  const goal = +b.target_cpa || null;
  const ids = (j.ad_ids || []).map(a => String(a.ad_id)).filter(Boolean);
  const [m7, m30] = await Promise.all([creatorMoney(env, b.act_id, ids, addDays(today, -6), model), creatorMoney(env, b.act_id, ids, addDays(today, -29), model)]);
  /* Our own Triple Whale rows first (the same model as every brand); the app's own figure only when we have none. */
  const pick = (m, w) => (m.orders > 0 || m.spend > 0) ? sideOf(m, goal) : sideOf({ spend: +w.creator_ad_spend || 0, orders: +w.creator_ad_orders || 0, revenue: +w.creator_ad_sales || 0 }, goal);
  const w7 = j.last_7_days || {}, w30 = j.last_30_days || {};
  return { ...base,
    last_7: { ...pick(m7, w7), videos_in: w7.videos_submitted ?? null, approved: w7.videos_approved ?? null, launched: w7.ads_launched ?? null, winners: [...m7.byAd.values()].filter(x => x.orders > 0).length },
    last_30: { ...pick(m30, w30), videos_in: w30.videos_submitted ?? null, approved: w30.videos_approved ?? null, launched: w30.ads_launched ?? null },
    creators_active: j.creators?.active ?? null, levels: j.creators?.by_level || null, discord: j.discord_members ?? null, new_joins_7: w7.new_joins ?? null,
    payouts_owed: j.payouts?.owed ?? null, notes: (j.notes || []).slice(0, 3) };
}
export async function trybeScorecard(env, d, brands, { today, model = 'tw' } = {}) {
  model = model === 'meta' ? 'meta' : 'tw';
  await ensureTrybe(env);
  today = today || (d.centralDate ? d.centralDate() : new Date().toISOString().slice(0, 10));
  const keyed = new Set(await keyedBrands(env));
  const goals = new Map(((await env.DB.prepare(`SELECT id, target_cpa FROM brands`).all().catch(() => ({ results: [] }))).results || []).map(r => [r.id, r.target_cpa]));
  const list = brands.map(b => ({ ...b, target_cpa: goals.get(b.act_id) }));
  const cards = await Promise.all(list.map(b => b.act_id === 'brand_lucky_golf' ? luckyCard(env, b, today, model)
    : keyed.has(b.act_id) ? brandCard(env, b, today, model).catch(e => ({ act_id: b.act_id, name: b.name, source: 'trybe', error: e.message })) : null));
  return { today, model, cards: cards.filter(Boolean).filter(c => c.error || (c.last_30 && (c.last_30.spend > 0 || c.last_30.videos_in > 0))) };
}

/* ---------- the week (2026-11-05): the live counts behind Ads > Trybe > This week ----------
   Per program: videos waiting for review, approved but not launched, creator messages nobody answered in Discord.
   Lucky comes from its own app. Cheap enough to load on open: D1 counts plus one Discord read per server. */
async function discordWaiting(env, act) {
  try {
    const [a, b] = await Promise.all([dcDoc(env, 'agency'), dcDoc(env, act)]);
    if (!a?.token || !b?.guild_id || !b.channels) return null;
    const H = { Authorization: `Bot ${a.token}` };
    const g = await (await fetch(`${DC_API}/guilds/${b.guild_id}`, { headers: H })).json().catch(() => ({}));
    const team = new Set([g.owner_id, ...(b.team_ids || [])].filter(Boolean));
    let n = 0;
    for (const name of ['questions', 'feedback-before-upload', 'vip']) {
      const id = b.channels[name]; if (!id) continue;
      const rows = ((await (await fetch(`${DC_API}/channels/${id}/messages?limit=50`, { headers: H })).json().catch(() => [])) || []);
      if (!Array.isArray(rows)) continue;
      const list = rows.slice().reverse(), staff = m => m.webhook_id || m.author?.bot || team.has(m.author?.id);
      let last = -1; list.forEach((m, i) => { if (staff(m)) last = i; });
      n += list.filter((m, i) => !staff(m) && i > last).length;
    }
    return n;
  } catch { return null; }
}
export async function trybeWeek(env, d, brands, { today } = {}) {
  today = today || (d.centralDate ? d.centralDate() : new Date().toISOString().slice(0, 10));
  const all = await trybeAll(env, d, brands, { today });
  const portal = async act => portalOf((await env.DB.prepare(`SELECT thumb FROM p_trybe_sub WHERE act_id = ?1 AND thumb IS NOT NULL LIMIT 5`).bind(act).all().catch(() => ({ results: [] }))).results || []);
  const rows = await Promise.all((all.brands || []).filter(b => b.has_key).map(async b => ({ act_id: b.act_id, name: b.name, review: b.pending, launch: b.queue, stale: b.stale, discord: await discordWaiting(env, b.act_id), portal: await portal(b.act_id) })));
  let lucky = null;
  if (env.LUCKY_PROGRAM_KEY && brands.some(b => b.act_id === 'brand_lucky_golf')) {
    const get = async path => { const r = await fetch('https://creators.luckygolf.com' + path, { headers: { Authorization: `Bearer ${env.LUCKY_PROGRAM_KEY}` } }); return r.ok ? r.json() : null; };
    const [q, rc] = await Promise.all([get('/api/locus/review-queue').catch(() => null), get('/api/locus/discord-recap').catch(() => null)]);
    lucky = { act_id: 'brand_lucky_golf', name: 'Lucky Golf', review: q ? (q.count ?? (q.videos || []).length) : null, launch: null, stale: null, discord: rc ? (rc.unanswered_questions || []).length : null };
  }
  return { today, dow: new Date(today + 'T12:00:00Z').getUTCDay(), programs: lucky ? [...rows, lucky] : rows };
}

/** Agency view: one line per brand. Cheap: counts from D1 only. */
export async function trybeAll(env, d, brands, { today } = {}) {
  await ensureTrybe(env);
  today = today || (d.centralDate ? d.centralDate() : new Date().toISOString().slice(0, 10));
  const keyed = new Set(await keyedBrands(env));
  const cut = addDays(today, -STALE_DAYS);
  const NL = `status = 'approved' AND ads_count = 0 AND NOT EXISTS (SELECT 1 FROM p_trybe_ad a WHERE a.act_id = s.act_id AND a.trybe_id = s.trybe_id)`;
  const rows = (await env.DB.prepare(`SELECT act_id, SUM(status = 'approved') AS approved, SUM(${NL}) AS queue, SUM(status = 'approved' AND ads_count = 0) AS never,
      SUM(${NL} AND approved_seen <= ?1) AS stale, SUM(status = 'pending') AS pending, MIN(CASE WHEN ${NL} THEN approved_seen END) AS oldest
    FROM p_trybe_sub s GROUP BY act_id`).bind(cut).all()).results || [];
  const by = new Map(rows.map(r => [r.act_id, r]));
  const out = [];
  for (const b of brands) {
    const r = by.get(b.act_id) || {}, has = keyed.has(b.act_id);
    if (!has && !r.approved) continue;
    const sync = safeJson(await getSetting(env, `trybeSync:${b.act_id}`), null);
    out.push({ act_id: b.act_id, name: b.name, has_key: has, synced_at: sync?.at || null, approved: +r.approved || 0, queue: +r.queue || 0, no_spend: Math.max(0, (+r.never || 0) - (+r.queue || 0)), stale: +r.stale || 0, pending: +r.pending || 0,
      oldest: r.oldest ? daysBetween(r.oldest, today) : 0 });
  }
  return { act: 'all', brands: out.sort((a, b) => b.queue - a.queue), no_key: brands.filter(b => !keyed.has(b.act_id)).map(b => ({ act_id: b.act_id, name: b.name })), stale_days: STALE_DAYS, alerts: (await getSetting(env, 'trybeAlerts')) === 'on' };
}

/** Ads > Calls: one line per brand with videos waiting (buyerlist.js adds it to its banners; never shown to a client). */
export async function trybeBanners(env, ids, today) {
  await ensureTrybe(env);
  const cut = addDays(today, -STALE_DAYS);
  const rows = (await env.DB.prepare(`SELECT act_id, COUNT(*) AS n, MIN(approved_seen) AS oldest FROM p_trybe_sub s WHERE status = 'approved' AND ads_count = 0 AND approved_seen <= ?1
      AND NOT EXISTS (SELECT 1 FROM p_trybe_ad a WHERE a.act_id = s.act_id AND a.trybe_id = s.trybe_id) GROUP BY act_id`).bind(cut).all()).results || [];
  return rows.filter(r => ids.has(r.act_id) && r.n > 0).map(r => ({ act_id: r.act_id, kind: 'trybe',
    text: `${r.n} approved Trybe video${r.n === 1 ? ' has' : 's have'} waited ${STALE_DAYS} days or more without being launched (oldest ${daysBetween(r.oldest, today)} days). See Ads > Trybe.` }));
}

/* ---------- the creator Discord's weekly posts (2026-11-05) ----------
   Monday: this week's video set from the hub, before the call. Friday: the creator videos that made a sale in the last
   7 days (Triple Whale). Posted as the brand's mascot through the channel webhook that profit/worker/src/discord.js keeps
   in the brand's doc; a missing webhook is made with the agency bot. Once per brand per day, only on built servers. */
const DC_API = 'https://discord.com/api/v10';
async function dcDoc(env, act) { const r = await env.DB.prepare(`SELECT data_json FROM p_br_doc WHERE act_id = ?1 AND line_id = '' AND key = 'discord'`).bind(act).first().catch(() => null); return safeJson(r?.data_json, null); }
async function dcSave(env, act, data) { await env.DB.prepare(`UPDATE p_br_doc SET data_json = ?2, updated_at = datetime('now') WHERE act_id = ?1 AND line_id = '' AND key = 'discord'`).bind(act, JSON.stringify(data)).run(); }
async function dcHookPost(env, act, d, key, embed) {
  const look = d.look || {}, chan = (d.channels || {})[key];
  if (!chan) throw new Error(`no #${key} channel`);
  d.hooks = d.hooks || {};
  if (!d.hooks[key]) {
    const tok = (await dcDoc(env, 'agency') || {}).token;
    if (!tok) throw new Error('no Discord bot token');
    const r = await fetch(`${DC_API}/channels/${chan}/webhooks`, { method: 'POST', headers: { Authorization: `Bot ${tok}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ name: String(look.mascot || 'Creators').slice(0, 80) }) });
    if (!r.ok) throw new Error(`Discord answered ${r.status} making a webhook`);
    const w = await r.json(); d.hooks[key] = { id: w.id, token: w.token }; await dcSave(env, act, d);
  }
  const h = d.hooks[key];
  /* Plain text, not a boxed embed (Cole 11-05: the box "doesn't look like a message"). Links get no preview card. */
  const text = noDash(`**${embed.title}**

${embed.description || ''}`).replace(/(^|\s)(https:\/\/\S+)/g, '$1<$2>').slice(0, 1990);
  const body = { username: String(look.mascot || 'Creators').slice(0, 80), allowed_mentions: { parse: [] }, content: text };
  if (/^https:\/\//.test(look.avatar || '')) body.avatar_url = look.avatar;
  const r = await fetch(`${DC_API}/webhooks/${h.id}/${h.token}?wait=true`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  if (!r.ok) throw new Error(`Discord answered ${r.status} posting in #${key}`);
  return (await r.json()).id;
}
export function mondayPost(name, slug, w) {
  const hub = `https://locus.go-mobius-digital.com/angles/${slug}/`;
  const ideas = (w.daily || []).slice(0, 7).map((x, i) => `**${i + 1}. ${x.title}**${x.opener ? `\nFirst line: "${x.opener}"` : ''}`).join('\n\n');
  const offer = w.offer && w.offer.head ? `\n\n**The deal to say:** ${w.offer.head}${w.offer.line ? ` ${w.offer.line}` : ''}` : '';
  const call = w.call && w.call.when ? `\n\n**Monday call:** ${w.call.when}, in the Monday Call room here on Discord.` : '';
  return { title: `${w.title || 'This week'}: the videos to film`, description: noDash(`${ideas || 'This week\'s videos are on the hub.'}${offer}\n\nExamples, the shots and the rules for each one: ${hub}${call}`).slice(0, 4000) };
}
export function fridayPost(wins, slug) {
  const lines = wins.slice(0, 6).map((x, i) => `**${i + 1}. ${x.creator}**${x.product ? `, ${x.product}` : ''}: ${x.orders} sale${x.orders === 1 ? '' : 's'}`).join('\n');
  return { title: 'This week\'s winners', description: noDash(`These creator videos made sales in the last 7 days:\n\n${lines}\n\nWatch what they did, then make your version. This week's ideas: https://locus.go-mobius-digital.com/angles/${slug}/`).slice(0, 4000) };
}
/* ---------- Friday winners, v2 (2026-11-05, Cole: "looks plain") ----------
   A person's voice, not a report: a short opener, then one message per winning video with the video itself, so it plays
   inside Discord, then a short closer. Wording rotates by week and brand so it never reads templated. The video is
   attached when it fits Discord's 10 MB upload; a bigger file is copied to our storage and linked as an mp4, which
   Discord plays inline too (Trybe's own link dies in 20 minutes). Style 'v2' is on only after Cole's yes
   (settings.trybeWinnersStyle); a preview posts into a team-only #winners-preview channel. */
const pickBy = (arr, seed) => { let h = 0; for (const ch of String(seed)) h = (h * 31 + ch.charCodeAt(0)) >>> 0; return arr[h % arr.length]; };
const WIN_OPEN = [
  n => `Hey everyone, this week's winners are in! 🏆 ${n === 1 ? 'One video' : `${n} videos`} made sales this week.`,
  n => `Happy Friday! 🎉 Here's what sold this week. ${n === 1 ? 'One video' : `${n} videos`} brought in orders.`,
  n => `Hey team 👋 Friday means winners. ${n === 1 ? 'This one' : `These ${n}`} made sales this week.`,
  n => `Winners time! 🔥 ${n === 1 ? 'One video' : `${n} videos`} sold this week. Have a watch.`,
  n => `Big week, creators 🙌 ${n === 1 ? 'Here is the video' : `Here are the ${n} videos`} that sold.`,
];
const MEDAL = ['🥇', '🥈', '🥉', '🔥', '🔥', '🔥'];
const WIN_LINE = [
  (c, p, o) => `**${c}**${p ? ` with the ${p}` : ''}: ${o} sale${o === 1 ? '' : 's'}`,
  (c, p, o) => `${o} sale${o === 1 ? '' : 's'} for **${c}**${p ? ` (${p})` : ''}`,
  (c, p, o) => `**${c}**'s ${p ? `${p} ` : ''}video sold ${o === 1 ? 'once' : `${o} times`}`,
];
const WIN_CLOSE = [
  hub => `Steal what works and make your version 👊 This week's ideas: ${hub}`,
  hub => `Want to be up here next Friday? Pick an idea and film it 🎬 ${hub}`,
  hub => `Same hook, your spin. Next week's ideas are here: ${hub}`,
  hub => `Nice work everyone 💪 Ideas for next week: ${hub}`,
];
const shortProduct = p => clip(String(p || '').split(',')[0].split(' - ')[0].split(' | ')[0], 32);
const firstName = n => String(n || 'A creator').trim().split(/\s+/)[0];
/** The words of a v2 winners post (pure; the tests and the preview use it). */
export function fridayMessages(wins, slug, seed) {
  const hub = `https://locus.go-mobius-digital.com/angles/${slug}/`;
  const list = wins.slice(0, 4);
  const lineOf = pickBy(WIN_LINE, seed + 'l');
  const items = list.map((w, i) => ({ ...w, text: noDash(`${MEDAL[i]} ${lineOf(firstName(w.creator), shortProduct(w.product), w.orders)}`) }));
  return {
    open: noDash(pickBy(WIN_OPEN, seed + 'o')(list.length)),
    items,
    /* One message: the opener, the list, then the videos below it in the same order. */
    head: noDash([pickBy(WIN_OPEN, seed + 'o')(list.length), '', ...items.map(x => x.text), '', 'Watch them below 👇'].join(String.fromCharCode(10))),
    close: noDash(pickBy(WIN_CLOSE, seed + 'c')(`<${hub}>`)),
  };
}
const WIN_ATTACH_MAX = 9.5 * 1024 * 1024, WIN_FILE_MAX = 95 * 1024 * 1024;
async function hookFor(env, act, d, key) {
  const look = d.look || {}, chan = (d.channels || {})[key];
  if (!chan) throw new Error(`no #${key} channel`);
  d.hooks = d.hooks || {};
  if (!d.hooks[key]) {
    const tok = (await dcDoc(env, 'agency') || {}).token;
    if (!tok) throw new Error('no Discord bot token');
    const r = await fetch(`${DC_API}/channels/${chan}/webhooks`, { method: 'POST', headers: { Authorization: `Bot ${tok}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ name: String(look.mascot || 'Creators').slice(0, 80) }) });
    if (!r.ok) throw new Error(`Discord answered ${r.status} making a webhook`);
    const w = await r.json(); d.hooks[key] = { id: w.id, token: w.token }; await dcSave(env, act, d);
  }
  return d.hooks[key];
}
/** One plain message as the mascot, with an optional file. Discord unfurls an mp4 link in the text into a player. */
async function dcHookSay(env, act, d, key, content, file, files) {
  files = files || (file ? [file] : []);
  const look = d.look || {}, h = await hookFor(env, act, d, key);
  const payload = { username: String(look.mascot || 'Creators').slice(0, 80), allowed_mentions: { parse: [] }, content: String(content || '').slice(0, 2000) };
  if (/^https:\/\//.test(look.avatar || '')) payload.avatar_url = look.avatar;
  let init;
  if (files.length) {
    const fd = new FormData();
    fd.append('payload_json', JSON.stringify({ ...payload, attachments: files.map((f, i) => ({ id: i, filename: f.name })) }));
    files.forEach((f, i) => fd.append(`files[${i}]`, new Blob([f.buf], { type: f.type }), f.name));
    init = { method: 'POST', body: fd };
  } else init = { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) };
  const r = await fetch(`${DC_API}/webhooks/${h.id}/${h.token}?wait=true`, init);
  if (!r.ok) throw new Error(`Discord answered ${r.status} posting in #${key}`);
  return (await r.json()).id;
}
/** The video for a winner: attach it when small, else keep a copy in R2 and link it (public, unguessable). */
async function winnerClip(env, d, act, w) {
  const k = await keyFor(env, act);
  if (!k || !k.key || !w.sub_id) return null;
  const s = await trybeGet(d, k.key, `/submissions/${encodeURIComponent(w.sub_id)}`).catch(() => null);
  const u = s && s.asset && s.asset.url;
  if (!u || (s.media_type && s.media_type !== 'video')) return null;
  const r = await fetch(u);
  if (!r.ok) return null;
  const size = +r.headers.get('content-length') || 0;
  if (size > WIN_FILE_MAX) return null;
  const buf = await r.arrayBuffer();
  if (buf.byteLength <= WIN_ATTACH_MAX) return { file: { buf, type: 'video/mp4', name: `${firstName(w.creator).toLowerCase().replace(/[^a-z0-9]/g, '') || 'winner'}.mp4` } };
  if (!env.MEDIA) return null;
  const id = [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`trybe-win:${act}:${w.sub_id}`)))].slice(0, 12).map(b => b.toString(16).padStart(2, '0')).join('');
  const key = `studio/vid/${id}.mp4`;
  if (!(await env.MEDIA.head(key).catch(() => null))) await env.MEDIA.put(key, buf, { httpMetadata: { contentType: 'video/mp4' } });
  return { url: `https://mobius-account-health.mobius-digital.workers.dev/studio-vid/${id}.mp4` };
}
/** The team-only channel previews go to (made once: hidden from @everyone, the Team role can see it). */
async function previewChannel(env, act, d) {
  if (d.channels && d.channels['winners-preview']) return 'winners-preview';
  const tok = (await dcDoc(env, 'agency') || {}).token;
  if (!tok || !d.guild_id) throw new Error('no Discord bot or server');
  const ow = [{ id: d.guild_id, type: 0, deny: '1024' }];
  if (d.roles && d.roles.team) ow.push({ id: d.roles.team, type: 0, allow: '1024' });
  const r = await fetch(`${DC_API}/guilds/${d.guild_id}/channels`, { method: 'POST', headers: { Authorization: `Bot ${tok}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'winners-preview', type: 0, topic: 'Team only. Previews of the Friday winners post before it goes out.', permission_overwrites: ow }) });
  if (!r.ok) throw new Error(`Discord answered ${r.status} making #winners-preview`);
  d.channels = { ...(d.channels || {}), 'winners-preview': (await r.json()).id };
  await dcSave(env, act, d);
  return 'winners-preview';
}
/** This week's winning videos for a brand (Triple Whale, last 7 days), best first. */
async function winnersOf(env, act, today) {
  const from = addDays(today, -6);
  const ads = (await env.DB.prepare(`SELECT ad_id, name FROM p_trybe_ad WHERE act_id = ?1`).bind(act).all()).results || [];
  const m = await creatorMoney(env, act, ads.map(a => String(a.ad_id)), from);
  const byVid = new Map();
  for (const a of ads) { const id = trybeIdOf(a.name); const o = (m.byAd.get(String(a.ad_id)) || {}).orders || 0; if (id && o > 0) byVid.set(id, (byVid.get(id) || 0) + o); }
  const subs = new Map(((await env.DB.prepare(`SELECT sub_id, trybe_id, creator, product FROM p_trybe_sub WHERE act_id = ?1`).bind(act).all()).results || []).map(s => [s.trybe_id, s]));
  return [...byVid.entries()].map(([id, o]) => { const s = subs.get(id) || {}; return { trybe_id: id, sub_id: s.sub_id || null, creator: s.creator || 'A creator', product: s.product || '', orders: Math.round(o) }; })
    .filter(w => w.orders > 0).sort((a, z) => z.orders - a.orders);
}
async function postWinnersV2(env, d, act, dc, slug, wins, today, channel) {
  /* Layout (Cole 11-05: "stacked, clunky"): 1) the opener and the list of winners, 2) the videos together in one message,
     which Discord shows side by side as a gallery, 3) a one line closer. A file too big for Discord's 10 MB upload is
     linked on its own line, so Discord shows only the player. */
  const msg = fridayMessages(wins, slug, `${today}:${slug}`);
  await dcHookSay(env, act, dc, channel, msg.head);
  const clips = [];
  for (const w of msg.items) clips.push(await winnerClip(env, d, act, w).catch(() => null));
  const files = clips.filter(c => c && c.file).map((c, i) => ({ ...c.file, name: `${i + 1}-${c.file.name}` }));
  let groups = [];
  for (const f of files) { const g = groups[groups.length - 1]; if (g && g.size + f.buf.byteLength <= 24 * 1024 * 1024 && g.list.length < 10) { g.list.push(f); g.size += f.buf.byteLength; } else groups.push({ list: [f], size: f.buf.byteLength }); }
  for (const g of groups) {
    try { await dcHookSay(env, act, dc, channel, '', null, g.list); }
    catch { for (const f of g.list) await dcHookSay(env, act, dc, channel, '', f).catch(() => {}); }
  }
  for (const c of clips) if (c && c.url) await dcHookSay(env, act, dc, channel, c.url);
  await dcHookSay(env, act, dc, channel, msg.close);
  return msg;
}

/* ---------- follow-ups (2026-11-05, Cole) ----------
   Three lists of creators to message one by one in Trybe (Trybe's Brand API has no messages, so Locus drafts and
   Claude in Chrome sends after Cole's yes; a "Sent" press hides the creator for 14 days):
   - sold: their videos sold (Triple Whale, 30 days) and no new video in 14 days. Ask for more of the same.
   - quiet: approved videos, no sale, no new video in 21 days. Ask what happened, point at the winners.
   - sample: a sample owed (Trybe's own sample obligation: overdue, or sent back and owed again). Ask if it arrived. */
export const QUIET_DAYS = 21, FOLLOW_SNOOZE = 14;
const FOLLOW_TEXT = {
  sold: [
    (f, b, x) => `Hey ${f}! Your ${x.product ? `${x.product} ` : ''}video has been selling for ${b} 🙌 Could you film 2 more in the same style this week? This week's ideas: ${x.hub}`,
    (f, b, x) => `Hi ${f}, quick one: your ${b} video made ${x.orders} sale${x.orders === 1 ? '' : 's'} this month 🔥 We'd love another one or two like it. Ideas here: ${x.hub}`,
  ],
  quiet: [
    (f, b, x) => `Hey ${f}, haven't seen a new ${b} video from you in a bit. How's it going? Anything in the way, or anything we can make easier? The videos selling right now are in #winners${x.invite ? ` on our Discord (${x.invite})` : ' on our Discord'}, and this week's ideas are here: ${x.hub}`,
    (f, b, x) => `Hi ${f}! Checking in from ${b}. Your last video was ${x.days} days ago. What happened, and what would help you make the next one? Here's what is working right now: ${x.hub}`,
  ],
  sample: [
    (f, b, x) => `Hey ${f}, checking in on your ${b} sample. Did it arrive OK? ${x.state === 'needs_resubmit' ? 'Your video needs one more pass, the notes are on it in Trybe.' : `Your video was due ${x.due}.`} If anything's in the way, tell me and we'll sort it. Ideas that are working now: ${x.hub}`,
    (f, b, x) => `Hi ${f}! How are you liking the ${b} sample? ${x.state === 'needs_resubmit' ? 'We just need a new cut of your video (notes in Trybe).' : `We're still waiting on your video (it was due ${x.due}).`} Need an idea? Here's this week's list: ${x.hub}`,
  ],
};
const prettyDay = iso => { const t = Date.parse(String(iso || '').slice(0, 10) + 'T12:00:00Z'); return t ? new Date(t).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' }) : 'a while ago'; };
export function followText(kind, first, brand, x, seed) { return noDash(pickBy(FOLLOW_TEXT[kind], seed)(first, brand, x)); }
export async function trybeFollowups(env, d, act, { today } = {}) {
  await ensureTrybe(env);
  today = today || (d.centralDate ? d.centralDate() : new Date().toISOString().slice(0, 10));
  const k = await keyFor(env, act);
  if (!k || !k.key) throw new Error('No Trybe key for this brand yet.');
  const v = await trybeView(env, d, act, { today });
  const amb = await env.DB.prepare(`SELECT slug, display_name FROM p_amb_brand WHERE act_id = ?1`).bind(act).first().catch(() => null);
  const brand = amb?.display_name || (await env.DB.prepare(`SELECT name FROM brands WHERE id = ?1`).bind(act).first().catch(() => null))?.name || 'the brand';
  const hub = amb?.slug ? `https://locus.go-mobius-digital.com/angles/${amb.slug}/` : '';
  const invite = (await dcDoc(env, act))?.invite || '';
  const sent = new Map(((await env.DB.prepare(`SELECT key, value FROM settings WHERE key LIKE ?1`).bind(`trybeFollow:${act}:%`).all().catch(() => ({ results: [] }))).results || [])
    .map(r => [r.key.split(':').pop(), r.value]));
  const snoozed = id => { const at = sent.get(id); return at && daysBetween(at, today) < FOLLOW_SNOOZE; };
  const subs = (await env.DB.prepare(`SELECT creator_id, creator, status, product, created_at FROM p_trybe_sub WHERE act_id = ?1`).bind(act).all()).results || [];
  const per = new Map();
  for (const s of subs) {
    const g = per.get(s.creator_id) || { name: s.creator, approved: 0, last: null, product: '' };
    if (s.status === 'approved') { g.approved++; if (!g.product && s.product) g.product = shortProduct(s.product); }
    if (s.created_at && (!g.last || s.created_at > g.last)) g.last = s.created_at;
    per.set(s.creator_id, g);
  }
  const crs = new Map(((await env.DB.prepare(`SELECT creator_id, name, avatar, gmv FROM p_trybe_creator WHERE act_id = ?1`).bind(act).all()).results || []).map(c => [c.creator_id, c]));
  /* The live roster with samples (Trybe: active creators only). */
  const roster = await pages(d, k.key, '/creators', {}, 10).catch(() => null);
  const active = roster ? new Map(roster.map(c => [c.id, c])) : null;
  const row = (kind, id, name, x) => ({ kind, creator_id: id, name, first: firstName(name), avatar: (active?.get(id)?.avatar_url) || crs.get(id)?.avatar || null, ...x,
    message: followText(kind, firstName(name), brand, { ...x, hub, invite }, `${today}:${id}:${kind}`), sent_at: sent.get(id) || null });
  const sold = v.creators.filter(c => c.orders > 0 && c.quiet_days != null && c.quiet_days >= REBOOK_DAYS && (!active || active.has(c.creator_id)) && !snoozed(c.creator_id))
    .map(c => row('sold', c.creator_id, c.name, { orders: Math.round(c.orders), cpa: c.cpa, days: c.quiet_days, product: (per.get(c.creator_id) || {}).product || '', beats: c.beats }))
    .sort((a, z) => z.orders - a.orders);
  const soldIds = new Set(v.creators.filter(c => c.orders > 0).map(c => c.creator_id));
  const quiet = [...per.entries()].filter(([id, g]) => g.approved > 0 && !soldIds.has(id) && !(+(crs.get(id) || {}).gmv > 0) && g.last && daysBetween(day(g.last), today) >= QUIET_DAYS && (!active || active.has(id)) && !snoozed(id))
    .map(([id, g]) => row('quiet', id, g.name, { approved: g.approved, days: daysBetween(day(g.last), today), product: g.product }))
    .sort((a, z) => a.days - z.days);
  const sample = (roster || []).filter(c => c.samples && c.samples.obligation && ['overdue', 'needs_resubmit'].includes(c.samples.obligation.state) && !snoozed(c.id))
    .map(c => row('sample', c.id, c.name, { state: c.samples.obligation.state, due: prettyDay(c.samples.obligation.due_at), days: daysBetween(day(c.samples.obligation.due_at), today), samples: c.samples.approved, score: c.samples.sample_score?.score ?? null }))
    .sort((a, z) => (z.days || 0) - (a.days || 0));
  const owes = new Set(sample.map(x => x.creator_id));   // a creator who owes a sample video hears about that, not twice
  return { act, brand, today, portal: v.portal, roster: roster ? roster.length : null, sold, quiet: quiet.filter(x => !owes.has(x.creator_id)), sample,
    rules: { sold_days: REBOOK_DAYS, quiet_days: QUIET_DAYS, snooze_days: FOLLOW_SNOOZE }, note: roster ? null : 'Trybe did not send the creator list, so samples are missing this time.' };
}

export async function discordWeekly(env, today, { force, preview = false, only = null, d: deps = {} } = {}) {
  const dow = new Date(today + 'T12:00:00Z').getUTCDay();
  const kind = force || (dow === 1 ? 'monday' : dow === 5 ? 'friday' : null);
  if (!kind) return { skipped: 'not Monday or Friday' };
  const rows = ((await env.DB.prepare(`SELECT act_id FROM p_br_doc WHERE line_id = '' AND key = 'discord' AND act_id != 'agency'`).all().catch(() => ({ results: [] }))).results || []).filter(r => !only || r.act_id === only);
  const v2 = preview || (await getSetting(env, 'trybeWinnersStyle')) === 'v2';
  const out = { kind, preview, style: kind === 'friday' ? (v2 ? 'v2' : 'v1') : undefined, posted: [], errors: [], messages: {} };
  for (const { act_id: act } of rows) {
    const stamp = `discordPost:${act}:${kind}:${today}`;
    if (!preview && await getSetting(env, stamp)) continue;
    try {
      const d = await dcDoc(env, act);
      if (!d || !d.built_at || !d.channels) continue;
      const b = await env.DB.prepare(`SELECT slug, display_name, week_json FROM p_amb_brand WHERE act_id = ?1`).bind(act).first();
      if (!b) continue;
      let embed;
      if (kind === 'monday') embed = mondayPost(b.display_name, b.slug, safeJson(b.week_json, {}) || {});
      else if (v2) {
        const wins = await winnersOf(env, act, today);
        if (!wins.length) { if (!preview) await putSetting(env, stamp, 'none'); continue; }
        const ch = preview ? await previewChannel(env, act, d) : 'winners';
        out.messages[act] = await postWinnersV2(env, deps, act, d, b.slug, wins, today, ch);
        if (!preview) await putSetting(env, stamp, 'posted');
        out.posted.push(act);
        continue;
      } else {
        const from = addDays(today, -6);
        const ads = (await env.DB.prepare(`SELECT ad_id, name FROM p_trybe_ad WHERE act_id = ?1`).bind(act).all()).results || [];
        const ids = ads.map(a => String(a.ad_id));
        const m = await creatorMoney(env, act, ids, from);
        const byVid = new Map();
        for (const a of ads) { const id = trybeIdOf(a.name); const o = (m.byAd.get(String(a.ad_id)) || {}).orders || 0; if (id && o > 0) byVid.set(id, (byVid.get(id) || 0) + o); }
        if (!byVid.size) { await putSetting(env, stamp, 'none'); continue; }
        const subs = new Map(((await env.DB.prepare(`SELECT trybe_id, creator, product FROM p_trybe_sub WHERE act_id = ?1`).bind(act).all()).results || []).map(s => [s.trybe_id, s]));
        const wins = [...byVid.entries()].map(([id, o]) => ({ creator: String((subs.get(id) || {}).creator || 'A creator').split(' ')[0], product: (subs.get(id) || {}).product || '', orders: Math.round(o) })).sort((a, z) => z.orders - a.orders);
        embed = fridayPost(wins, b.slug);
      }
      await dcHookPost(env, act, d, kind === 'monday' ? 'this-week' : 'winners', embed);
      await putSetting(env, stamp, 'posted');
      out.posted.push(act);
    } catch (e) { out.errors.push(`${act}: ${e.message}`); }
  }
  return out;
}

/* ---------- the daily tick: sync, then the stale alert (and Monday's rebook list) ---------- */
export function staleMessage(brand, stale, rebook, link) {
  const lines = [];
  if (stale.length) {
    lines.push(`*Trybe: ${stale.length} approved video${stale.length === 1 ? ' has' : 's have'} not been launched after ${STALE_DAYS} days.* Oldest: ${stale[0].days} days.`);
    for (const q of stale.slice(0, 5)) lines.push(`• ${q.creator}${q.product ? `, ${clip(q.product, 40)}` : ''}: ${q.days} days`);
    if (stale.length > 5) lines.push(`• and ${stale.length - 5} more`);
  }
  if (rebook.length) {
    lines.push(`*Rebook this week:* ${rebook.slice(0, 8).map(c => `${c.name} (${c.quiet_days} days quiet, $${Math.round(c.cpa)} a sale)`).join(', ')}.`);
  }
  if (!lines.length) return null;
  lines.push(`<${link}|Open Ads > Trybe for ${brand}>`);
  return noDash(lines.join('\n'));
}
const subs2 = v => v.__subs || [];
export async function trybeTick(env, d, { force = false } = {}) {
  const today = d.centralDate();
  if (!force && (await getSetting(env, 'trybeDay')) === today) return { skipped: 'done today' };
  if (!force && d.centralHour && d.centralHour() < 4) return { skipped: 'before 4am' };
  await ensureTrybe(env);
  const keyed = new Set(await keyedBrands(env));
  if (!keyed.size) return { skipped: 'no keys' };
  const alertsOn = (await getSetting(env, 'trybeAlerts')) === 'on';   // off until someone turns it on (Agency view, or PUT /api/trybe/alerts)
  const monday = new Date(today + 'T12:00:00Z').getUTCDay() === 1;
  const brands = (await d.listBrands(env)).filter(b => keyed.has(b.act_id));
  const out = { synced: 0, posted: 0, errors: [] };
  for (const b of brands) {
    if (d.canAfford && !d.canAfford(60)) { out.errors.push('out of calls for this run'); break; }
    try {
      await syncBrand(env, d, b.act_id, { today }); out.synced++;
      if (!alertsOn || !b.slack_channel || (b.brief_channel && b.slack_channel === b.brief_channel)) continue;
      const v = await trybeView(env, d, b.act_id, { today });
      v.__subs = ((await env.DB.prepare(`SELECT status, created_at FROM p_trybe_sub WHERE act_id = ?1 AND status = 'pending'`).bind(b.act_id).all()).results || []);
      const seen = new Set(((await env.DB.prepare(`SELECT sub_id FROM p_trybe_sub WHERE act_id = ?1 AND alerted IS NOT NULL`).bind(b.act_id).all()).results || []).map(r => r.sub_id));
      const fresh = v.queue.filter(q => q.state === 'not_launched' && q.days >= STALE_DAYS && !seen.has(q.sub_id));
      let msg = staleMessage(b.name, fresh, monday ? v.creators.filter(c => c.rebook) : [], `${d.appUrl || 'https://locus.go-mobius-digital.com'}/?open=trybe&act=${b.act_id}`);
      /* Falling behind (2026-11-05): videos waiting for review 2 days or more, and creators waiting on a Discord answer. */
      const oldReview = subs2(v).filter(s => s.status === 'pending' && s.created_at && daysBetween(day(s.created_at), today) >= 2).length;
      const dcWait = await discordWaiting(env, b.act_id);
      const behind = [oldReview ? `${oldReview} video${oldReview === 1 ? '' : 's'} waiting for review 2 days or more (Ads, Trybe, Review).` : '', dcWait ? `${dcWait} creator${dcWait === 1 ? '' : 's'} waiting on an answer in Discord (Ads, Trybe, Discord).` : ''].filter(Boolean);
      if (behind.length) msg = noDash([`*Creator program falling behind:*`, ...behind.map(x => `• ${x}`), msg || `<${d.appUrl || 'https://locus.go-mobius-digital.com'}/?open=trybe&act=${b.act_id}|Open Ads > Trybe for ${b.name}>`].join(String.fromCharCode(10)));
      if (!msg) continue;
      await d.slackPost(env, b.slack_channel, msg, null, { username: 'Locus' });
      out.posted++;
      await runAll(env, fresh.map(q => env.DB.prepare(`UPDATE p_trybe_sub SET alerted = ?3 WHERE act_id = ?1 AND sub_id = ?2`).bind(b.act_id, q.sub_id, today)));
    } catch (e) { out.errors.push(`${b.name}: ${e.message}`); }
  }
  out.discord = await discordWeekly(env, today, { d }).catch(e => ({ error: e.message }));
  await putSetting(env, 'trybeDay', today);
  return out;
}

/* ---------- recuts v2 (2026-11-06, Cole: "it needs to be put into the pipeline, that's where tasks are") ----------
   Phil's 10 recuts a month per brand. Once a month the strategist opens Ads > Trybe > a brand > Recuts: Locus lists
   the creator videos that sold the most in the last 30 days (Triple Whale sales, Meta delivery) and suggests WHAT to
   change on each from its own numbers against the brand's other creator videos:
     hook   = few people stop on it (3-second views / impressions low)  -> new opening
     tight  = they stop but leave early (thruplays / 3-second views low) -> shorter cut
     offer  = they watch but do not click (link clicks / impressions low) -> clearer deal at the end
     fresh  = it is good everywhere                                      -> 2 new openings so it lasts and scales
   The strategist keeps or changes the test, adds a note, ticks the ones to do, and presses Add to the pipeline.
   Each tick = one Production card (Brief column, owner Ravo, due in 5 days) with the whole brief: the numbers, why,
   the goal, what to change, how to deliver, and the media buyer's line. The original file goes to Frame when Frame is
   connected, else Locus keeps a copy (Trybe's own link dies in 20 minutes). Then ONE Slack line in the brand's internal
   channel says the cards are in the pipeline and why. Settings `trybeRecut:<act>:<sub_id>` = what was sent (a video is
   not suggested again for 60 days). */
const RAVO = 'U07N0RRSP4J';
const RECUT_FOLDER = 'Creator recuts';
const GUIDE_URL = 'https://claude.ai/artifact/H4RNW1uUSmA1kD3Rv6QW9u';
const pct = x => (x == null ? 'n/a' : `${(x * 100).toFixed(1)}%`);
const RECUT_TESTS = {
  hook: { label: 'New hook', why: (v, m) => `Few people stop on it: ${pct(v.hook)} watch 3 seconds, the brand's creator videos average ${pct(m.hook)}. The rest of the video sells, so a better opening should sell more.`,
    goal: 'Beat the original\'s cost per sale with a stronger first 2 seconds.',
    do: ['Open on the strongest line or the most visual moment. The product is on screen in second 1.', 'Add a headline per the edit guide, on screen for the first 2 to 3 seconds.', 'Keep everything after the opening as it is.'] },
  tight: { label: 'Tighter cut', why: (v, m) => `People stop on it but leave early: ${pct(v.hold)} of them watch it through, the brand's average is ${pct(m.hold)}.`,
    goal: 'Keep more people to the end, where the product and the deal are.',
    do: ['Cut it to 15 to 20 seconds.', 'Cut every pause, repeat and slow bit.', 'Keep the original opening.'] },
  offer: { label: 'Clearer offer', why: (v, m) => `People watch it but few click: ${pct(v.ctr)} click the link, the brand's average is ${pct(m.ctr)}.`,
    goal: 'Turn the watching into clicks with the deal on screen.',
    do: ['Add the current deal as a headline in the last 3 seconds, or a simple end card.', 'Name the product on screen once.', 'Keep the original opening and cut.'] },
  fresh: { label: 'Fresh hooks', why: () => 'It sells and its numbers are good everywhere. New openings keep it from wearing out so we can spend more on it.',
    goal: 'Two new versions that sell as well as the original, so the winner can take more budget.',
    do: ['Make 2 versions, each with a different first 2 seconds (a different line or a different shot).', 'Same middle and end as the original.', 'Headline per the edit guide.'] },
};
function pickTest(v, m) {
  if (v.hook != null && m.hook && v.hook < m.hook * 0.85) return 'hook';
  if (v.hold != null && m.hold && v.hold < m.hold * 0.85) return 'tight';
  if (v.ctr != null && m.ctr && v.ctr < m.ctr * 0.85) return 'offer';
  return 'fresh';
}
const med = a => { const s = a.filter(x => x != null && isFinite(x)).sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : null; };
/** Last N days of every Trybe video of the brand: spend, sales (Triple Whale), and the delivery rates, best seller first. */
export async function trybeRecutPicks(env, d, act, { days = 30, n = 10, today, all = false } = {}) {
  await ensureTrybe(env);
  today = today || (d.centralDate ? d.centralDate() : new Date().toISOString().slice(0, 10));
  const from = addDays(today, -days);
  const ads = (await env.DB.prepare(`SELECT ad_id, name FROM p_trybe_ad WHERE act_id = ?1`).bind(act).all()).results || [];
  const ids = ads.map(a => String(a.ad_id));
  const acts = await metaActs(env, act);
  const byAd = new Map();
  for (let i = 0; i < ids.length; i += 60) {
    const chunk = ids.slice(i, i + 60);
    const ph = chunk.map((_, j) => `?${j + 2}`).join(', ');
    const aph = acts.map((_, j) => `?${chunk.length + 2 + j}`).join(', ');
    const rows = (await env.DB.prepare(`SELECT ad_id, SUM(spend) s, SUM(impressions) im, SUM(video_3s) v3, SUM(video_thruplay) tp, SUM(link_clicks) lc FROM ad_daily
      WHERE date >= ?1 AND ad_id IN (${ph}) AND act_id IN (${aph}) GROUP BY ad_id`).bind(from, ...chunk, ...acts).all().catch(() => ({ results: [] }))).results || [];
    for (const r of rows) byAd.set(String(r.ad_id), r);
  }
  const money = await creatorMoney(env, act, ids, from);
  const vids = new Map();
  for (const a of ads) {
    const tid = trybeIdOf(a.name); if (!tid) continue;
    const r = byAd.get(String(a.ad_id)) || {}, o = (money.byAd.get(String(a.ad_id)) || {}).orders || 0;
    const g = vids.get(tid) || { trybe_id: tid, spend: 0, orders: 0, im: 0, v3: 0, tp: 0, lc: 0, ads: 0 };
    g.spend += +r.s || 0; g.orders += o; g.im += +r.im || 0; g.v3 += +r.v3 || 0; g.tp += +r.tp || 0; g.lc += +r.lc || 0; g.ads++;
    vids.set(tid, g);
  }
  const subs = new Map(((await env.DB.prepare(`SELECT sub_id, trybe_id, creator, product, thumb FROM p_trybe_sub WHERE act_id = ?1`).bind(act).all()).results || []).map(s => [s.trybe_id, s]));
  const sent = new Map(((await env.DB.prepare(`SELECT key, value FROM settings WHERE key LIKE ?1`).bind(`trybeRecut:${act}:%`).all().catch(() => ({ results: [] }))).results || [])
    .map(r => [r.key.split(':').pop(), safeJson(r.value, {}) || {}]));
  const all = [...vids.values()].filter(v => v.im >= 1000).map(v => ({ ...v, hook: v.im ? v.v3 / v.im : null, hold: v.v3 ? v.tp / v.v3 : null, ctr: v.im ? v.lc / v.im : null }));
  const m = { hook: med(all.map(v => v.hook)), hold: med(all.map(v => v.hold)), ctr: med(all.map(v => v.ctr)) };
  const goal = +((await env.DB.prepare(`SELECT target_cpa FROM brands WHERE id = ?1`).bind(act).first().catch(() => null))?.target_cpa) || null;
  const recent = s => s && s.at && daysBetween(String(s.at).slice(0, 10), today) < 60;
  const picks = all.filter(v => v.orders > 0 && subs.get(v.trybe_id)?.sub_id && (all || !recent(sent.get(subs.get(v.trybe_id).sub_id))))
    .sort((a, z) => z.orders - a.orders || z.spend - a.spend).slice(0, n)
    .map(v => { const s = subs.get(v.trybe_id); const test = pickTest(v, m);
      return { sub_id: s.sub_id, trybe_id: v.trybe_id, creator: s.creator, product: shortProduct(s.product), thumb: s.thumb || null,
        spend: round2(v.spend), orders: Math.round(v.orders), cpa: v.orders ? round2(v.spend / v.orders) : null, hook: v.hook, hold: v.hold, ctr: v.ctr,
        test, why: noDash(RECUT_TESTS[test].why(v, m)) }; });
  return { act, from, today, days, goal_cpa: goal, brand_avg: m, tests: Object.fromEntries(Object.entries(RECUT_TESTS).map(([k, t]) => [k, t.label])),
    picks, recently: [...sent.entries()].filter(([, s]) => recent(s)).length };
}
async function recutFolder(env, d, act) {
  const p = await frameProject(env, { listAccounts: async e => (await d.listBrands(e)).map(b => ({ act_id: b.act_id, name: b.name })) }, { brand: act }, {});
  const kids = await frameApi(env, 'GET', `/accounts/${p.account}/folders/${p.root}/children?page_size=100`);
  let f = (kids.data || []).find(i => i.type === 'folder' && i.name.toLowerCase() === RECUT_FOLDER.toLowerCase());
  if (!f) f = (await frameApi(env, 'POST', `/accounts/${p.account}/folders/${p.root}/folders`, { data: { name: RECUT_FOLDER } })).data;
  if (!f?.id) throw new Error('Frame made no "Creator recuts" folder.');
  return { account: p.account, folder: f.id, url: `https://next.frame.io/project/${p.id}/${f.id}` };
}
/** The original file where the editor can get it: Frame when connected, else a Locus copy. */
async function recutFile(env, d, act, subId, name) {
  const k = await keyFor(env, act);
  if (!k || !k.key) throw new Error('No Trybe key for this brand yet.');
  const s = await trybeGet(d, k.key, `/submissions/${encodeURIComponent(subId)}`);
  if (s.media_type && s.media_type !== 'video') throw new Error('That one is not a video.');
  if (!s.asset?.url) throw new Error('Trybe sent no file for that video.');
  try {
    const where = await recutFolder(env, d, act);
    const up = await frameApi(env, 'POST', `/accounts/${where.account}/folders/${where.folder}/files/remote_upload`, { data: { name, source_url: s.asset.url } });
    return { via: 'frame', link: where.url, file: up.data?.id || null };
  } catch (e) {
    if (!env.MEDIA) throw e;
    const r = await fetch(s.asset.url);
    if (!r.ok) throw new Error(`Trybe's file did not download (${r.status}).`);
    const id = [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`trybe-recut:${act}:${subId}`)))].slice(0, 12).map(x => x.toString(16).padStart(2, '0')).join('');
    await env.MEDIA.put(`studio/vid/${id}.mp4`, await r.arrayBuffer(), { httpMetadata: { contentType: 'video/mp4', contentDisposition: `attachment; filename="${name}"` } });
    return { via: 'locus', link: `https://mobius-account-health.mobius-digital.workers.dev/studio-vid/${id}.mp4`, file: null };
  }
}
const hEsc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
/** One recut's card: title + the brief as the Production page (v2 html), in the shape the team's briefs use. */
export async function trybeRecutBrief(env, d, act, subId, { test, note = '', why = '', today } = {}) {
  today = today || (d.centralDate ? d.centralDate() : new Date().toISOString().slice(0, 10));
  const own = await env.DB.prepare(`SELECT sub_id, trybe_id, creator, product FROM p_trybe_sub WHERE act_id = ?1 AND sub_id = ?2`).bind(act, subId).first();
  if (!own) throw new Error('No such video for this brand.');
  const pk = (await trybeRecutPicks(env, d, act, { n: 200, today, all: true }).catch(() => ({ picks: [] }))).picks.find(p => p.sub_id === subId) || {};
  test = RECUT_TESTS[test] ? test : (pk.test || 'fresh');
  const T = RECUT_TESTS[test];
  const product = shortProduct(own.product) || 'the product';
  const name = noDash(`${own.creator || 'Creator'} - ${product} - ${own.trybe_id} - ORIGINAL.mp4`).replace(/[\\/:*?"<>|]/g, '');
  const f = await recutFile(env, d, act, subId, name);
  const goalCpa = +((await env.DB.prepare(`SELECT target_cpa FROM brands WHERE id = ?1`).bind(act).first().catch(() => null))?.target_cpa) || null;
  const nums = pk.orders ? `${pk.orders} sale${pk.orders === 1 ? '' : 's'} on $${Math.round(pk.spend)} in the last 30 days ($${Math.round(pk.cpa)} per sale${goalCpa ? `, goal $${Math.round(goalCpa)}` : ''}).` : 'Picked by the strategist.';
  const P = (label, html) => `<p><strong>${label}</strong></p><p>${html}</p><p><br></p>`;
  const ul = items => `<ul>${items.map(x => `<li>${hEsc(x)}</li>`).join('')}</ul><p><br></p>`;
  const html = [
    P('What this is', `A recut of ${hEsc(own.creator)}'s ${hEsc(product)} video (Trybe ${hEsc(own.trybe_id)}), one of the brand's best selling creator videos. The original keeps running. Your version runs next to it.`),
    P('Numbers', hEsc(nums)),
    P(`Test: ${hEsc(T.label)}`, hEsc(why || pk.why || T.why({}, {}))),
    P('Goal', hEsc(T.goal)),
    `<p><strong>What to change</strong></p>${ul(T.do)}`,
    note ? P('Strategist note', hEsc(note)) : '',
    P('Text', `Follow the brand's edit guide: <a target="_blank" rel="noopener" href="${GUIDE_URL}">${GUIDE_URL}</a>`),
    P('Original file', `<a target="_blank" rel="noopener" href="${hEsc(f.link)}">${f.via === 'frame' ? 'Frame, Creator recuts' : 'Download the original'}</a>`),
    `<p><strong>Deliver</strong></p>${ul([`9:16, 1080x1920, the creator's own audio, no music over talking.`, `Name it RECUT ${own.trybe_id} ${T.label} v1 and upload it to this card.`, `Keep the creator's face and voice. Do not change what they say.`])}`,
    `<p><strong>FOR MEDIABUYER</strong></p>${ul(['Launch in the same ad set as the original, on the creator\'s handle (partnership ad), same copy.', 'Judge after it spends 2x the goal and runs 3 days. Keep the cheaper one per sale.'])}`,
  ].join('');
  const rec = { at: new Date().toISOString(), test, note: String(note || '').slice(0, 500), creator: own.creator, product, trybe_id: own.trybe_id, via: f.via, folder: f.link, file: f.file, name };
  await putSetting(env, `trybeRecut:${act}:${subId}`, JSON.stringify(rec));
  return { title: noDash(`Recut: ${own.creator} ${product} (${T.label})`).slice(0, 300), html, format: 'UGC', owner: 'Ravo', due: addDays(today, 5), test, sub_id: subId, file: f.link, via: f.via };
}
/** The one Slack line after the cards are made: in the brand's internal channel, Ravo tagged. */
export async function trybeRecutAnnounce(env, d, act, cards) {
  const brand = (await d.listBrands(env)).find(b => b.act_id === act);
  if (!brand?.slack_channel || !d.slackPost || !cards?.length) return { ok: false };
  const tests = [...new Set(cards.map(c => (RECUT_TESTS[c.test] || {}).label).filter(Boolean))];
  const nums = cards.map(c => c.num).filter(Boolean).map(n => `#${n}`).join(', ');
  const msg = noDash(`<@${RAVO}>, ${cards.length} recut${cards.length === 1 ? '' : 's'} added to the ${brand.name} pipeline${nums ? ` (${nums})` : ''}. These are the creator videos that sold the most in the last 30 days. We recut them because a winner with a better opening or a tighter cut usually sells more than a new video does. Tests this round: ${tests.join(', ')}. Each card has the numbers, the goal, what to change and the original file. Due in 5 days.`);
  await d.slackPost(env, brand.slack_channel, msg, null, { username: 'Locus' });
  return { ok: true };
}
export async function trybeRecuts(env, act) {
  const rows = (await env.DB.prepare(`SELECT key, value FROM settings WHERE key LIKE ?1`).bind(`trybeRecut:${act}:%`).all().catch(() => ({ results: [] }))).results || [];
  return rows.map(r => ({ sub_id: r.key.split(':').pop(), ...(safeJson(r.value, {}) || {}) })).sort((a, z) => String(z.at).localeCompare(String(a.at)));
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
    if (path === '/api/trybe/discord-weekly' && request.method === 'POST') {
      if (client) return json({ error: 'That part is the Mobius team' + "'" + 's.' }, 403);
      const bb = await request.json().catch(() => ({}));
      const kind = bb.kind === 'friday' ? 'friday' : 'monday';
      const only = bb.act ? await actOf(bb.act) : null;
      return json(await discordWeekly(env, d.centralDate ? d.centralDate() : new Date().toISOString().slice(0, 10), { force: kind, preview: !!bb.preview && kind === 'friday', only: only || null, d }));
    }
    /* The Friday winners style: 'v2' (videos in the post, Cole's yes needed) or 'v1' (the plain list). */
    if (path === '/api/trybe/winners-style' && request.method === 'PUT') {
      if (client) return json({ error: 'That part is the Mobius team' + "'" + 's.' }, 403);
      const st = (await request.json().catch(() => ({}))).style === 'v2' ? 'v2' : 'v1';
      await putSetting(env, 'trybeWinnersStyle', st);
      return json({ ok: true, style: st });
    }
    if (path === '/api/trybe/week' && request.method === 'GET') {
      if (client) return json({ error: 'That part is the Mobius team' + "'" + 's.' }, 403);
      return json(await trybeWeek(env, d, (await d.listBrands(env)).filter(b => !only || only.has(b.act_id))));
    }
    if (path === '/api/trybe/scorecard' && request.method === 'GET') {
      if (client) return json({ error: 'That part is the Mobius team' + "'" + 's.' }, 403);
      return json(await trybeScorecard(env, d, (await d.listBrands(env)).filter(b => !only || only.has(b.act_id)), { model: url.searchParams.get('model') || 'tw' }));
    }
    /* One video's file: Trybe hands out a link that lasts 20 minutes, so the page asks when someone presses play. */
    if (path === '/api/trybe/video' && request.method === 'GET') {
      const act = await actOf(url.searchParams.get('act'));
      if (!allowed(act)) return json({ error: 'You do not have access to this brand.' }, 403);
      const sub = String(url.searchParams.get('sub') || '');
      const own = await env.DB.prepare(`SELECT media, thumb FROM p_trybe_sub WHERE act_id = ?1 AND sub_id = ?2`).bind(act, sub).first();
      if (!own) return json({ error: 'No such video.' }, 404);
      const k = await keyFor(env, act);
      if (!k || !k.key) return json({ error: 'No Trybe key for this brand yet.' }, 400);
      const s = await trybeGet(d, k.key, `/submissions/${encodeURIComponent(sub)}`);
      return json({ url: s.asset?.url || null, expires_at: s.asset?.expires_at || null, media: s.media_type || own.media, thumb: s.thumbnail_url || own.thumb });
    }
    if (client) return json({ error: 'That part is the Mobius team\'s.' }, 403);
    /* The Slack lines (3 days unlaunched, Monday's rebook list) for every brand: on or off. Off until turned on. */
    if (path === '/api/trybe/alerts' && request.method === 'PUT') {
      const on = !!(await request.json().catch(() => ({}))).on;
      await putSetting(env, 'trybeAlerts', on ? 'on' : 'off');
      return json({ ok: true, alerts: on });
    }
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
    /* Review (2026-11-05): approve, reject or ask for changes on a pending video, the same as the buttons in the Trybe
       brand portal (Trybe Brand API POST /submissions/{id}/approve|reject|request-revision). Approving pays the creator
       for that video and notifies them; every review notifies the creator. Each review goes in the Change Log. */
    if (path === '/api/trybe/review' && request.method === 'GET') {
      const k = await keyFor(env, act); if (!k || !k.key) return json({ error: 'No Trybe key for this brand yet.' }, 400);
      const rows = await pages(d, k.key, '/submissions', { status: 'pending' }, 3);
      return json({ act, count: rows.length, items: rows.map(x => ({ id: x.id, creator: x.creator?.name || 'Creator', product: (x.products || []).map(y => y.name).filter(Boolean).join(', '), program: x.program?.name || '',
        angle: (x.angles || [])[0]?.name || '', media: x.media_type || null, thumb: x.thumbnail_url || null, line: clip(x.transcript?.text, 300), created_at: x.created_at || null })).sort((a, z) => String(a.created_at).localeCompare(String(z.created_at))) });
    }
    if (path === '/api/trybe/review' && request.method === 'POST') {
      const k = await keyFor(env, act); if (!k || !k.key) return json({ error: 'No Trybe key for this brand yet.' }, 400);
      const verb = { approve: 'approve', reject: 'reject', changes: 'request-revision' }[b.decision];
      const id = String(b.id || '');
      if (!verb || !/^submission_[0-9a-f-]{36}$/.test(id)) return json({ error: 'Give the video id and approve, reject or changes.' }, 400);
      const comment = noDash(String(b.comment || '')).trim().slice(0, 1000);
      if (verb === 'request-revision' && !comment) return json({ error: 'Say what to change so the creator knows.' }, 400);
      const r = await (d.xfetch || fetch)(`${API}/submissions/${encodeURIComponent(id)}/${verb}`, { method: 'POST', headers: { Authorization: `Bearer ${k.key}`, 'Content-Type': 'application/json', 'User-Agent': 'locus-trybe' }, body: JSON.stringify(comment ? { comment } : {}) });
      const j = await r.json().catch(() => null);
      if (!r.ok) return json({ error: (j && j.error && j.error.message) || `Trybe answered ${r.status}` }, 400);
      await env.DB.prepare(`UPDATE p_trybe_sub SET status = ?3, approved_seen = CASE WHEN ?3 = 'approved' THEN COALESCE(approved_seen, ?4) ELSE approved_seen END WHERE act_id = ?1 AND sub_id = ?2`)
        .bind(act, id, j?.status || null, new Date().toISOString().slice(0, 10)).run().catch(() => {});
      const who = email || 'someone';
      const meta = await env.DB.prepare(`SELECT meta_act FROM brand_accounts WHERE act_id = ?1`).bind(act).first().catch(() => null);
      await env.DB.prepare(`INSERT INTO activities (id, act_id, event_time, event_type, category, summary, reason, note, confirmed, manual, actor, object_type, object_id, object_name)
        VALUES (?1, ?2, ?3, 'trybe_review', 'creators', ?4, NULL, 'Reviewed in Trybe from Locus.', 1, 1, ?5, 'trybe_submission', ?6, NULL)`)
        .bind(`manual:${crypto.randomUUID()}`, meta?.meta_act || act, new Date().toISOString(), `Trybe video ${verb === 'approve' ? 'approved' : verb === 'reject' ? 'rejected' : 'sent back for changes'}${comment ? `: ${clip(comment, 120)}` : ''}`, `${who} in Locus`, id).run().catch(() => {});
      return json({ ok: true, id, status: j?.status || null });
    }
    if (path === '/api/trybe/followups' && request.method === 'GET') return json(await trybeFollowups(env, d, act));
    /* Recuts v2 (2026-11-06): the month's picks, one card's brief, the one Slack line. The page makes the cards
       through /api/production/brief + /api/production/save, so the pipeline (and its Asana mirror) works as always. */
    if (path === '/api/trybe/recuts' && request.method === 'GET') return json({ act, recuts: await trybeRecuts(env, act) });
    if (path === '/api/trybe/recut-picks' && request.method === 'GET') return json(await trybeRecutPicks(env, d, act, { days: Math.min(90, +url.searchParams.get('days') || 30) }));
    if (path === '/api/trybe/recut-brief' && request.method === 'POST') {
      const sub = String(b.sub_id || '');
      if (!/^submission_[0-9a-f-]{8,}$/.test(sub)) return json({ error: 'Give the video (submission) id.' }, 400);
      try { return json({ ok: true, ...(await trybeRecutBrief(env, d, act, sub, { test: b.test, note: b.note, why: b.why })) }); }
      catch (e) { return json({ error: e.message }, 400); }
    }
    if (path === '/api/trybe/recut-announce' && request.method === 'POST') return json(await trybeRecutAnnounce(env, d, act, Array.isArray(b.cards) ? b.cards.slice(0, 20) : []));
    if (path === '/api/trybe/followups/sent' && request.method === 'POST') {
      const id = String(b.creator_id || '');
      if (!/^creator_[0-9a-f-]{8,}$/.test(id)) return json({ error: 'Give the creator id.' }, 400);
      const at = d.centralDate ? d.centralDate() : new Date().toISOString().slice(0, 10);
      if (b.undo) await env.DB.prepare(`DELETE FROM settings WHERE key = ?1`).bind(`trybeFollow:${act}:${id}`).run();
      else await putSetting(env, `trybeFollow:${act}:${id}`, at);
      return json({ ok: true, creator_id: id, sent_at: b.undo ? null : at });
    }
    if (path === '/api/trybe/rules' && request.method === 'PUT') {
      const t = noDash(String(b.rules || '')).trim().slice(0, 4000);
      if (t) await putSetting(env, `trybeRules:${act}`, t); else await env.DB.prepare(`DELETE FROM settings WHERE key = ?1`).bind(`trybeRules:${act}`).run();
      return json({ ok: true, rules: t || DEFAULT_RULES, rules_default: !t });
    }
    return json({ error: 'not found' }, 404);
  } catch (e) { return json({ error: e.message }, 400); }
}

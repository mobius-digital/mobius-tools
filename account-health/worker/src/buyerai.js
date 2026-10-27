/* THE BUYER REVIEW FLOW + THE DAILY AI BUYER PASS (2026-10-26, Cole approved in chat). Cole is the media buyer for now.
 * Locus suggests every change, shows the data AND the ads, he agrees (Locus makes the change) or disagrees and says why
 * (Locus answers once, with numbers, or agrees), and Locus remembers his call.
 *
 * 1. THE ADS (`adNumbers`, GET /api/buyer-list/ads?act=&adset=&ad=): every ad in the row's ad set with its cover
 *    (creative.js /cover/<ad>.<sig>.webp, when the cover is in R2) and its 7-day numbers: spend, sales and revenue
 *    (Triple Whale last platform click, never Meta's own), CPA, ROAS, CTR, CPM, frequency, hook rate (video only), funnel
 *    role (first click vs last click at the 1.3x line, the same as hub.js).
 * 2. DISAGREE (`disagree`, POST /api/buyer-list/disagree {act, row, why}): ONE Sonnet 5.5 call reads the row, its numbers,
 *    the ads and his words, and answers in two plain sentences: drop ("Fair, I'll drop it.") or hold ("I still think X
 *    because Y."). Saved at once as a buyer lesson (`p_buyer_lesson`). Drop = his call stands, the row goes quiet. Hold =
 *    he picks once (POST /api/buyer-list/decide {act, id, decision: mine|locus}); mine = the row goes quiet, locus = the
 *    page runs the change. Every later disagreement and every morning read reads the brand's lessons (`lessonsText`).
 * 3. THE MORNING READ (`readBrand`, `buyerAITick`): each morning, from an hour BEFORE the Buyer list post
 *    (settings.morningHour, Central), every active brand (morningcard.js eligible) gets ONE Opus 5.5 call (effort medium)
 *    over the rule rows, ad set and ad numbers for 7 and 14 days with first vs last click and new-customer share,
 *    campaign budgets, the brand's short brain, its memory facts (strat_fact, the account plan among them) and its buyer
 *    lessons. It says keep / change / drop per rule row with one sentence, and adds the calls the rules miss (budget
 *    moves, relaunching a strong ad from a cut set, leads campaigns, tracking). Stored per brand per day in `p_buyer_ai`;
 *    the Buyer list and the daily post read it (rows marked "from the morning read"). Runs on the 5-minute cron, three
 *    brands a tick, so 9 brands are read in about 15 minutes; the post waits for it (up to an hour past the post hour).
 *    Switch: settings `buyerAI` ('off' stops it). Cost: settings `aiSpend:buyer:<YYYY-MM>` = {calls, in, out, usd, by}
 *    and `aiSpend:buyer:day:<YYYY-MM-DD>` = usd; hard cap DAY_CAP dollars a day (a brand past it is marked 'capped').
 * No em dashes anywhere: every model answer is cleaned (`noDash`). */
import { brandBrain } from './brain.js';
import { factsFor, factsBlock } from './stratmem.js';
import { coverUrl } from './creative.js';
import { buildBuyerList, setState } from './buyerlist.js';
import { eligible, morningHour } from './morningcard.js';

export const PASS_MODEL = 'claude-opus-5-5', TALK_MODEL = 'claude-sonnet-5-5';
/* Dollars per million tokens: [input, output, cache read] (stratmake.js PRICE). */
const PRICE = { 'claude-opus-5-5': [4, 20, 0.2], 'claude-sonnet-5-5': [2, 10, 0.2] };
export const DAY_CAP = 5;
export const PER_TICK = 3;
const PASS_EST = 0.6;            // what one brand's read is assumed to cost before it runs (the cap check)
const LAST_HOUR = 12;
const POST_WAIT_HOURS = 1;       // the post waits for the read until an hour past the morning hour

const safe = (s, d) => { try { return s == null ? d : JSON.parse(s); } catch { return d; } };
const clip = (s, n = 300) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, n);
/** Cole's standing rule: no em dashes (or en dashes used as one) in anything Locus writes. */
export const noDash = s => String(s ?? '').replace(/\s*[\u2014\u2013]\s*/g, ', ').replace(/,\s*,/g, ',');
const addDays = (ymd, n) => { const d = new Date(ymd + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const centralToday = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago' }).format(new Date());
const ID = /^\d{3,25}$/;          // a Meta object id (an id the model invents in another shape is dropped)
const r2 = x =>x == null || !isFinite(x) ? null : Math.round(x * 100) / 100;
const div = (a, b) => (b ? a / b : null);
async function getSetting(env, k) { const r = await env.DB.prepare(`SELECT value FROM settings WHERE key = ?1`).bind(k).first().catch(() => null); return r?.value ?? null; }
async function putSetting(env, k, v) { await env.DB.prepare(`INSERT INTO settings (key, value) VALUES (?1, ?2) ON CONFLICT(key) DO UPDATE SET value = excluded.value`).bind(k, String(v)).run(); }

/* ---------- tables ---------- */
const LESSON_SQL = `CREATE TABLE IF NOT EXISTS p_buyer_lesson (id TEXT PRIMARY KEY, act_id TEXT NOT NULL, object TEXT, kind TEXT, name TEXT,
  row_json TEXT, text TEXT NOT NULL, author TEXT, stance TEXT, answer TEXT, decision TEXT, decided_by TEXT, decided_at TEXT, usd REAL, created_at TEXT NOT NULL)`;
const AI_SQL = `CREATE TABLE IF NOT EXISTS p_buyer_ai (act_id TEXT NOT NULL, day TEXT NOT NULL, status TEXT NOT NULL, json TEXT, usd REAL,
  model TEXT, at TEXT NOT NULL, error TEXT, PRIMARY KEY (act_id, day))`;
let tabled = false;
export async function ensureBuyerAI(env) {
  if (tabled) return;
  await env.DB.prepare(LESSON_SQL).run();
  await env.DB.prepare(`CREATE INDEX IF NOT EXISTS p_buyer_lesson_act ON p_buyer_lesson (act_id, created_at)`).run().catch(() => {});
  await env.DB.prepare(AI_SQL).run();
  tabled = true;
}

/* ---------- the switch and the money ---------- */
export async function buyerAIOn(env) { return (await getSetting(env, 'buyerAI')) !== 'off'; }
export const costOf = (u, model) => { const p = PRICE[model] || PRICE[TALK_MODEL]; u = u || {}; return ((u.input_tokens || 0) * p[0] + (u.cache_creation_input_tokens || 0) * p[0] * 1.25 + (u.cache_read_input_tokens || 0) * p[2] + (u.output_tokens || 0) * p[1]) / 1e6; };
/** Adds one call to the month (`aiSpend:buyer:<YYYY-MM>`) and the day (`aiSpend:buyer:day:<date>`). Returns its dollars. */
export async function meter(env, u, model, what, day = centralToday()) {
  const usd = costOf(u, model), key = `aiSpend:buyer:${day.slice(0, 7)}`, dk = `aiSpend:buyer:day:${day}`;
  try {
    const t = safe(await getSetting(env, key), {}) || {};
    t.calls = (t.calls || 0) + 1; t.in = (t.in || 0) + (u?.input_tokens || 0) + (u?.cache_read_input_tokens || 0) + (u?.cache_creation_input_tokens || 0); t.out = (t.out || 0) + (u?.output_tokens || 0);
    t.usd = Math.round(((t.usd || 0) + usd) * 10000) / 10000;
    (t.by ||= {})[what] = Math.round(((t.by[what] || 0) + usd) * 10000) / 10000;
    await putSetting(env, key, JSON.stringify(t));
    await putSetting(env, dk, String(Math.round(((+(await getSetting(env, dk)) || 0) + usd) * 10000) / 10000));
  } catch {}
  return usd;
}
export async function spentToday(env, day = centralToday()) { return +(await getSetting(env, `aiSpend:buyer:day:${day}`)) || 0; }

/** One Claude call with a JSON schema answer. d.xfetch is the metered fetch (tests pass a mock). */
async function callModel(env, d, { model, system, user, schema, max = 4000, effort = 'medium', what, day }) {
  if (!env.ANTHROPIC_API_KEY) throw new Error('no model key');
  const r = await d.xfetch('https://api.anthropic.com/v1/messages', {
    method: 'POST', headers: { 'x-api-key': env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({ model, max_tokens: max, system, output_config: { effort, format: { type: 'json_schema', schema } }, messages: [{ role: 'user', content: user }] }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error?.message || `Claude HTTP ${r.status}`);
  const usd = await meter(env, j.usage, model, what, day);
  const out = safe((j.content || []).filter(b => b.type === 'text').map(b => b.text).join(''), null);
  if (!out) throw new Error('The model came back empty.');
  return { out, usd, usage: j.usage || null };
}

/* ---------- the numbers ---------- */
/** The brand's Meta ad accounts (connections), or the one the row names. */
export async function metaActsOf(env, act, metaAct) {
  if (metaAct) return [String(metaAct)];
  const rows = (await env.DB.prepare(`SELECT external_id FROM connections WHERE brand_id = ?1 AND kind = 'meta'`).bind(act).all().catch(() => ({ results: [] }))).results || [];
  return rows.map(r => r.external_id).filter(Boolean);
}
const inList = (n, from) => Array.from({ length: n }, (_, i) => `?${i + from}`).join(', ');
/** The role at the hub.js line: opener = first-click credit 1.3x+ last-click and 2+ first-click sales; closer = the reverse. */
export function roleOf(fcRev, lcRev, fcOrd, hasFc) {
  if (!hasFc) return null;
  if (fcRev >= lcRev * 1.3 && fcOrd >= 2) return 'opener';
  if (lcRev >= fcRev * 1.3 && lcRev > 0) return 'closer';
  return fcRev > 0 || lcRev > 0 ? 'both' : null;
}
/** Per ad numbers over `days` days ending `to` (the last synced day): Meta delivery, Triple Whale sales (last platform
 *  click) and first click, new-customer share of first-click orders. `adsetIds` and/or `adIds` pick the ads. */
export async function adNumbers(env, { act, metaActs, adsetIds = [], adIds = [], days = 7, to = null }) {
  if (!metaActs.length || (!adsetIds.length && !adIds.length)) return { from: null, to: null, ads: [] };
  const q = (sql, ...b) => env.DB.prepare(sql).bind(...b).all().then(r => r.results || []).catch(() => []);
  if (!to) to = ((await q(`SELECT MAX(date) d FROM ad_daily WHERE act_id IN (${inList(metaActs.length, 1)})`, ...metaActs))[0] || {}).d || addDays(centralToday(), -1);
  const from = addDays(to, -(days - 1));
  const sets = adsetIds.slice(0, 40).map(String), ids0 = adIds.slice(0, 40).map(String);
  /* The set's ads that spent in the window, plus any ad asked for by id (a Trim row's ad). */
  const nA = metaActs.length, nS = sets.length || 1, nI = ids0.length || 1;
  const ads = await q(`SELECT act_id, ad_id, name, adset_id, campaign_id, status, COALESCE(first_spend_date, substr(created_time, 1, 10)) first_spend FROM ads
    WHERE act_id IN (${inList(nA, 3)}) AND ((adset_id IN (${inList(nS, nA + 3)}) AND ad_id IN (SELECT ad_id FROM ad_daily WHERE date BETWEEN ?1 AND ?2 AND spend > 0))
      OR ad_id IN (${inList(nI, nA + nS + 3)}))`,
    from, to, ...metaActs, ...(sets.length ? sets : ['-']), ...(ids0.length ? ids0 : ['-']));
  if (!ads.length) return { from, to, ads: [] };
  const ids = ads.map(a => String(a.ad_id)).slice(0, 90);
  const IN = inList(ids.length, 3);
  const [deliv, attr, fcNew] = await Promise.all([
    q(`SELECT ad_id, SUM(spend) spend, SUM(impressions) impr, SUM(reach) reach, SUM(link_clicks) clicks, SUM(COALESCE(video_3s, 0)) v3, SUM(COALESCE(purchases, 0)) mp, SUM(COALESCE(leads, 0)) leads
      FROM ad_daily WHERE date BETWEEN ?1 AND ?2 AND ad_id IN (${IN}) GROUP BY ad_id`, from, to, ...ids),
    q(`SELECT ad_id, model, SUM(orders) ord, SUM(revenue) rev FROM tw_ad_attr WHERE date BETWEEN ?1 AND ?2 AND ad_id IN (${IN}) AND act_id = ?${ids.length + 3}
      AND model IN ('lastPlatformClick', 'fullFirstClick') GROUP BY ad_id, model`, from, to, ...ids, act),
    q(`SELECT t.ad_id, SUM(t.weight) k, SUM(CASE WHEN NOT EXISTS (SELECT 1 FROM tw_orders p WHERE p.act_id = o.act_id AND p.customer_id = o.customer_id AND p.date < o.date) THEN t.weight ELSE 0 END) n
      FROM tw_order_touch t JOIN tw_orders o ON o.act_id = t.act_id AND o.order_id = t.order_id
      WHERE t.date BETWEEN ?1 AND ?2 AND t.ad_id IN (${IN}) AND t.act_id = ?${ids.length + 3} AND t.model = 'fullFirstClick' AND o.customer_id IS NOT NULL GROUP BY t.ad_id`, from, to, ...ids, act),
  ]);
  const hasFc = attr.some(x => x.model === 'fullFirstClick');
  const out = ads.filter(a => ids.includes(String(a.ad_id))).map(a => {
    const id = String(a.ad_id), dl = deliv.find(x => String(x.ad_id) === id) || {};
    const lc = attr.find(x => String(x.ad_id) === id && x.model === 'lastPlatformClick') || {}, fc = attr.find(x => String(x.ad_id) === id && x.model === 'fullFirstClick') || {};
    const nw = fcNew.find(x => String(x.ad_id) === id) || {};
    const spend = +dl.spend || 0, impr = +dl.impr || 0, sales = +lc.ord || 0, rev = +lc.rev || 0;
    return { ad_id: id, name: a.name || `Ad ${id}`, adset_id: a.adset_id ? String(a.adset_id) : null, campaign_id: a.campaign_id ? String(a.campaign_id) : null, meta_act: a.act_id,
      status: a.status || null, first_spend: a.first_spend || null, spend: r2(spend), sales: r2(sales), revenue: r2(rev), cpa: sales ? r2(spend / sales) : null, roas: spend ? r2(rev / spend) : null,
      ctr: impr ? r2(100 * (+dl.clicks || 0) / impr) : null, cpm: impr ? r2(spend * 1000 / impr) : null, freq: +dl.reach ? r2(impr / dl.reach) : null,
      video: (+dl.v3 || 0) > 0, hook: (+dl.v3 || 0) > 0 && impr ? r2(100 * dl.v3 / impr) : null, leads: +dl.leads || 0, meta_purchases: +dl.mp || 0,
      fc_sales: r2(+fc.ord || 0), fc_revenue: r2(+fc.rev || 0), new_share: +nw.k ? r2(100 * (+nw.n || 0) / nw.k) : null,
      role: roleOf(+fc.rev || 0, rev, +fc.ord || 0, hasFc) };
  }).sort((p, q) => (q.spend || 0) - (p.spend || 0));
  return { from, to, ads: out };
}
/** Adds `cover` (the signed /cover/ url) to each ad whose cover is stored in R2; the page falls back to /api/ad-creatives. */
export async function withCovers(env, ads) {
  return Promise.all(ads.map(async a => {
    let has = false;
    try { has = !!(env.MEDIA && await env.MEDIA.head(`cov/${a.ad_id}.webp`)); } catch {}
    return { ...a, cover: has ? await coverUrl(env, a.ad_id) : null };
  }));
}
/** One ad set (or a few) summed from its ads. */
export function sumAds(ads) {
  const t = { spend: 0, sales: 0, revenue: 0, fc_sales: 0, fc_revenue: 0, impr: 0, clicks: 0, reach: 0 };
  for (const a of ads) { t.spend += a.spend || 0; t.sales += a.sales || 0; t.revenue += a.revenue || 0; t.fc_sales += a.fc_sales || 0; t.fc_revenue += a.fc_revenue || 0;
    const im = a.cpm ? (a.spend || 0) * 1000 / a.cpm : 0; t.impr += im; t.clicks += a.ctr ? im * a.ctr / 100 : 0; t.reach += a.freq ? im / a.freq : 0; }
  return { spend: r2(t.spend), sales: r2(t.sales), revenue: r2(t.revenue), cpa: t.sales ? r2(t.spend / t.sales) : null, roas: t.spend ? r2(t.revenue / t.spend) : null,
    fc_sales: r2(t.fc_sales), fc_revenue: r2(t.fc_revenue), ctr: t.impr ? r2(100 * t.clicks / t.impr) : null, cpm: t.impr ? r2(t.spend * 1000 / t.impr) : null, freq: t.reach ? r2(t.impr / t.reach) : null };
}

/* ---------- lessons ---------- */
export async function lessonsFor(env, act, limit = 40) {
  await ensureBuyerAI(env);
  return ((await env.DB.prepare(`SELECT * FROM p_buyer_lesson WHERE act_id = ?1 ORDER BY created_at DESC LIMIT ${limit}`).bind(act).all().catch(() => ({ results: [] }))).results) || [];
}
/** The lessons as every prompt reads them: his final calls first. */
export function lessonsText(list) {
  const rows = (list || []).filter(l => l.text);
  if (!rows.length) return '';
  const tag = l => l.decision === 'mine' && l.stance === 'drop' ? 'LOCUS AGREED WITH COLE: follow it'
    : l.decision === 'mine' ? "COLE'S FINAL CALL: follow it, even where the numbers disagreed; never argue it again"
      : l.decision === 'locus' ? 'SETTLED FOR LOCUS: Cole agreed the numbers stand' : 'NOT DECIDED YET: weigh it';
  return rows.map(l => `- [${tag(l)}] ${String(l.created_at || '').slice(0, 10)} on ${l.kind ? `the ${l.kind} call for ` : ''}"${clip(l.name, 80)}": he said "${clip(l.text, 400)}"${l.answer ? ` Locus answered: "${clip(l.answer, 300)}"` : ''}`).join('\n');
}
const TALK_SCHEMA = { type: 'object', additionalProperties: false, required: ['stance', 'answer'],
  properties: { stance: { type: 'string', enum: ['drop', 'hold'] }, answer: { type: 'string' } } };
export function talkSystem(brand) {
  return `You are Locus, the media buying assistant for ${brand}. Cole, the agency owner, runs the buying and makes every call. You suggested a change to one ad set or ad and he disagreed. Read his reason against the numbers you are given and answer him in exactly two short plain sentences, like a person talking.
- If his reason holds, or covers something the numbers cannot see (a launch, a promo, stock, a deal, how the account is built, an earlier call of his), say so and drop it: stance "drop", and the first sentence starts "Fair, I'll drop it."
- If the numbers clearly say otherwise, stance "hold": "I still think X because Y", with the one or two numbers that matter (spend, sales, cost per sale or ROAS against the goal, days running). Never invent a number: use only the numbers given.
- Respect his earlier calls listed under LESSONS: never argue a final call again.
- No jargon, no lists, no em dashes, no hedging words like "arguably". Plain English.`;
}
/** His disagreement: one Sonnet call, saved as a lesson. Drop = his call stands at once (the row goes quiet). */
export async function disagree(env, d, { act, brand, row, why, author, today = centralToday() }) {
  await ensureBuyerAI(env);
  const text = clip(why, 1200);
  if (text.length < 4) throw Object.assign(new Error('Say why, in a few words.'), { status: 400 });
  if (!row || !row.object) throw Object.assign(new Error('Which call?'), { status: 400 });
  const metaActs = await metaActsOf(env, act, row.meta_act);
  const nums = row.adset_id || row.ad_id ? await adNumbers(env, { act, metaActs, adsetIds: row.adset_id ? [row.adset_id] : [], adIds: row.ad_id ? [row.ad_id] : [] }).catch(() => ({ ads: [] })) : { ads: [] };
  const lessons = await lessonsFor(env, act, 20);
  const slim = { kind: row.kind, action: row.action, name: row.name, set: row.set || row.adset || null, why: clip(row.why_full || row.why, 700), stake: row.stake || null,
    goal: row.goal ?? null, goal_metric: row.metric ?? null, goal_roas: row.goal_roas ?? null, role: row.role ?? null, morning_read: row.ai || null };
  const user = `THE CALL YOU SUGGESTED:\n${JSON.stringify(slim)}\n\nTHE AD SET, LAST 7 DAYS (sales = Triple Whale last click):\n${JSON.stringify(nums.ads.length ? sumAds(nums.ads) : null)}\n\nITS ADS, LAST 7 DAYS:\n${JSON.stringify(nums.ads.slice(0, 12).map(a => ({ name: a.name, status: a.status, spend: a.spend, sales: a.sales, cpa: a.cpa, roas: a.roas, ctr: a.ctr, cpm: a.cpm, freq: a.freq, hook: a.hook, role: a.role })))}\n\nLESSONS (his earlier calls on this brand):\n${lessonsText(lessons) || '(none yet)'}\n\nWHAT COLE SAID: ${text}`;
  const { out, usd } = await callModel(env, d, { model: TALK_MODEL, system: talkSystem(brand || act), user: user.slice(0, 30000), schema: TALK_SCHEMA, max: 1500, what: 'disagree', day: today });
  const stance = out.stance === 'drop' ? 'drop' : 'hold';
  const answer = noDash(clip(out.answer, 600));
  const id = `bl_${crypto.randomUUID().slice(0, 12)}`, now = new Date().toISOString();
  await env.DB.prepare(`INSERT INTO p_buyer_lesson (id, act_id, object, kind, name, row_json, text, author, stance, answer, decision, decided_by, decided_at, usd, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15)`)
    .bind(id, act, String(row.object).slice(0, 120), String(row.kind || '').slice(0, 40), clip(row.name, 200), JSON.stringify(slim).slice(0, 4000), text, clip(author, 120) || null, stance, answer,
      stance === 'drop' ? 'mine' : null, stance === 'drop' ? clip(author, 120) || null : null, stance === 'drop' ? now : null, Math.round(usd * 10000) / 10000, now).run();
  if (stance === 'drop') await setState(env, { act, object: row.object, action: row.kind, status: 'done', name: row.name }, author || 'Cole', today).catch(() => {});
  return { ok: true, id, stance, answer, decision: stance === 'drop' ? 'mine' : null, usd: Math.round(usd * 10000) / 10000 };
}
/** His final choice after Locus held: mine = the row goes quiet (Done, 3 days); locus = recorded, the page makes the change. */
export async function decide(env, { act, id, decision, who, today = centralToday() }) {
  await ensureBuyerAI(env);
  if (!['mine', 'locus'].includes(decision)) throw Object.assign(new Error('Go with yours or with Locus.'), { status: 400 });
  const l = await env.DB.prepare(`SELECT * FROM p_buyer_lesson WHERE id = ?1`).bind(id).first().catch(() => null);
  if (!l) throw Object.assign(new Error('No such disagreement.'), { status: 404 });
  if (l.act_id !== act) throw Object.assign(new Error('That belongs to another brand.'), { status: 403 });
  await env.DB.prepare(`UPDATE p_buyer_lesson SET decision = ?2, decided_by = ?3, decided_at = ?4 WHERE id = ?1`).bind(id, decision, clip(who, 120) || null, new Date().toISOString()).run();
  if (decision === 'mine' && l.object && l.kind) await setState(env, { act, object: l.object, action: l.kind, status: 'done', name: l.name }, who || 'Cole', today).catch(() => {});
  return { ok: true, id, decision };
}

/* ---------- the morning read ---------- */
const PASS_SCHEMA = { type: 'object', additionalProperties: false, required: ['summary', 'rows', 'extra'],
  properties: {
    summary: { type: 'string' },
    rows: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['key', 'verdict', 'reason', 'change'],
      properties: { key: { type: 'string' }, verdict: { type: 'string', enum: ['keep', 'change', 'drop'] }, reason: { type: 'string' }, change: { type: 'string' } } } },
    extra: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['type', 'name', 'adset_id', 'ad_id', 'campaign_id', 'action', 'reason', 'stake'],
      properties: { type: { type: 'string', enum: ['budget', 'relaunch', 'leads', 'tracking', 'cut', 'scale', 'other'] }, name: { type: 'string' }, adset_id: { type: 'string' }, ad_id: { type: 'string' },
        campaign_id: { type: 'string' }, action: { type: 'string' }, reason: { type: 'string' }, stake: { type: 'number' } } } },
  } };
export function passSystem(brand) {
  return `You are the senior media buyer at a DTC ecommerce agency, reading ${brand}'s Meta account first thing in the morning for Cole, who owns the agency and makes every call. A rules engine already wrote today's calls (RULE ROWS). Your job: check each one against the full picture, and add the calls the rules cannot see.
How to read it:
- Sales and revenue are Triple Whale last platform click (the call). First click shows who opens journeys: an ad set whose first-click credit is well above its last-click credit starts journeys other channels finish; cutting it costs sales later. New-customer share is the part of its first-click orders that were a customer's first order.
- Judge the ad set first, then each ad by its role in the set. Compare per day and per window, never raw totals across different windows.
- THE ACCOUNT PLAN and Cole's FINAL CALLS (under MEMORY and LESSONS) win over the rules. Never suggest something the plan rules out (for example splitting a campaign the plan keeps whole, or turning on a campaign the plan turned off).
- A tracking gap (Meta counts sales Triple Whale does not) means hold cuts until tracking is fixed; say it once as a tracking row.
For every RULE ROW give: verdict keep (right as written) | change (right idea, different move: say the move in "change") | drop (wrong today), and ONE plain sentence of reason with the one or two numbers that matter. Use the row's key exactly.
Then EXTRA: up to 6 calls the rules missed, only when the numbers clearly back them: budget moves between campaigns or ad sets, relaunching a strong ad that sits in a cut or paused set (name the ad and its numbers), a leads campaign that needs a goal or a look, tracking problems, anything else a good buyer would do this morning. Each: type, name (the ad set, ad or campaign as named in the data), the ids you were given ('' when none), action (a short instruction, under 12 words), reason (one sentence with numbers), stake (the dollars a week it moves, 0 if unclear). No extra row that repeats a rule row.
summary = one sentence: the most important thing for this brand today.
Plain words, like a person talking. No jargon, no em dashes, never invent a number: use only the numbers given.`;
}
/** Everything the read sees for one brand, from D1 and the list already built. */
export async function passInput(env, d, a, list, { today = centralToday() } = {}) {
  const q = (sql, ...b) => env.DB.prepare(sql).bind(...b).all().then(r => r.results || []).catch(() => []);
  const metaActs = await metaActsOf(env, a.act_id);
  const ruleRows = [...(list.rows || []), ...(list.quiet || [])].filter(r => r.kind !== 'launch' && r.kind !== 'ai' && r.act_id === a.act_id)
    .map(r => ({ key: r.key, kind: r.kind, action: r.action, level: r.level, name: r.name, set: r.set || null, adset_id: r.adset_id || null, ad_id: r.ad_id || null, why: clip(r.why_full || r.why, 500),
      stake: r.stake || 0, goal: r.goal ?? null, goal_metric: r.metric ?? null, role: r.role ?? null, quiet: r.hidden ? r.hidden.why : null }));
  let sets = [], camps = [], to = null;
  if (metaActs.length) {
    to = ((await q(`SELECT MAX(date) d FROM ad_daily WHERE act_id IN (${inList(metaActs.length, 1)})`, ...metaActs))[0] || {}).d || null;
    if (to) {
      const from14 = addDays(to, -13);
      const top = await q(`SELECT x.adset_id, SUM(d.spend) sp FROM ad_daily d JOIN ads x ON x.act_id = d.act_id AND x.ad_id = d.ad_id
        WHERE d.date BETWEEN ?1 AND ?2 AND d.act_id IN (${inList(metaActs.length, 3)}) AND x.adset_id IS NOT NULL GROUP BY x.adset_id HAVING sp > 0 ORDER BY sp DESC LIMIT 25`, from14, to, ...metaActs);
      const ids = top.map(t => String(t.adset_id));
      if (ids.length) {
        const [w7, w14, meta] = await Promise.all([
          adNumbers(env, { act: a.act_id, metaActs, adsetIds: ids, days: 7, to }),
          adNumbers(env, { act: a.act_id, metaActs, adsetIds: ids, days: 14, to }),
          q(`SELECT s.adset_id, s.name, s.status, s.daily_budget, s.min_spend, s.optimization_goal, s.campaign_id, c.name cname FROM meta_adsets s LEFT JOIN meta_campaigns c ON c.campaign_id = s.campaign_id WHERE s.adset_id IN (${inList(ids.length, 1)})`, ...ids),
        ]);
        sets = ids.map(id => {
          const m = meta.find(x => String(x.adset_id) === id) || {};
          const a7 = w7.ads.filter(x => x.adset_id === id), a14 = w14.ads.filter(x => x.adset_id === id);
          const s7 = sumAds(a7), s14 = sumAds(a14), nw = a7.filter(x => x.new_share != null);
          return { adset_id: id, name: m.name || `Ad set ${id}`, campaign: m.cname || null, campaign_id: m.campaign_id || null, status: m.status || null, budget: m.daily_budget ?? null,
            min_spend: m.min_spend ?? null, optimizing_for: m.optimization_goal || null, last7: s7, last14: s14,
            new_share_pct: nw.length ? r2(nw.reduce((t, x) => t + x.new_share * (x.fc_sales || 0), 0) / Math.max(1, nw.reduce((t, x) => t + (x.fc_sales || 0), 0))) : null,
            ads: a14.slice(0, 6).map(x => { const y = a7.find(z => z.ad_id === x.ad_id) || {}; return { ad_id: x.ad_id, name: x.name, status: x.status, spend7: y.spend ?? 0, sales7: y.sales ?? 0, cpa7: y.cpa ?? null, roas7: y.roas ?? null,
              spend14: x.spend, sales14: x.sales, cpa14: x.cpa, roas14: x.roas, ctr7: y.ctr ?? null, hook7: y.hook ?? null, freq7: y.freq ?? null, role: y.role ?? x.role, leads14: x.leads }; }) };
        });
      }
      camps = (await q(`SELECT c.campaign_id, c.name, c.objective, c.status, c.daily_budget, c.lifetime_budget, c.bid_strategy,
          (SELECT SUM(d.spend) FROM ad_daily d JOIN ads x ON x.act_id = d.act_id AND x.ad_id = d.ad_id WHERE x.campaign_id = c.campaign_id AND d.date BETWEEN ?1 AND ?2) spend7
        FROM meta_campaigns c WHERE c.act_id IN (${inList(metaActs.length, 3)}) AND (c.status = 'ACTIVE' OR c.campaign_id IN (SELECT DISTINCT x.campaign_id FROM ad_daily d JOIN ads x ON x.act_id = d.act_id AND x.ad_id = d.ad_id WHERE d.date BETWEEN ?1 AND ?2))`,
        addDays(to, -6), to, ...metaActs)).map(c => ({ ...c, spend7: r2(+c.spend7 || 0) }));
    }
  }
  const [brain, facts, lessons, acct] = await Promise.all([
    brandBrain(env, a.act_id, { short: true, voice: false, creator: false }).then(b => clip(b.md, 100000).slice(0, 9000)).catch(() => ''),
    factsFor(env, ['agency', a.act_id]).catch(() => []),
    lessonsFor(env, a.act_id, 30),
    env.DB.prepare(`SELECT target_cpa, target_roas, currency FROM brand_accounts WHERE act_id = ?1`).bind(a.act_id).first().catch(() => null),
  ]);
  const plan = facts.filter(f => f.scope !== 'agency' && /account|structure|plan|campaign/i.test(`${f.topic} ${f.text}`));
  return { metaActs, to, ruleRows, sets, camps, brain, facts, plan, lessons, acct, banners: (list.banners || []).filter(b => b.act_id === a.act_id) };
}
export function passUser(a, inp) {
  return [`BRAND: ${a.name} (${a.currency || 'USD'}). Data through ${inp.to || 'unknown'}. Goal: ${inp.acct ? JSON.stringify({ target_cpa: inp.acct.target_cpa, target_roas: inp.acct.target_roas }) : 'not set'}`,
    `THE ACCOUNT PLAN (follow it):\n${inp.plan.length ? inp.plan.map(f => `- ${f.topic}: ${f.text}`).join('\n') : '(none saved)'}`,
    `RULE ROWS (today's calls from the rules; quiet = already done, skipped or changed in Meta in the last 3 days):\n${JSON.stringify(inp.ruleRows)}`,
    `TRACKING BANNERS:\n${inp.banners.map(b => b.text).join('\n') || '(none)'}`,
    `CAMPAIGNS (budgets per day, spend last 7 days):\n${JSON.stringify(inp.camps)}`,
    `AD SETS that spent in the last 14 days, biggest first, with their top ads (last7 / last14; sales = Triple Whale last click, fc = first click):\n${JSON.stringify(inp.sets)}`,
    `LESSONS (Cole's calls when he disagreed with Locus):\n${lessonsText(inp.lessons) || '(none yet)'}`,
    factsBlock(inp.facts, a.name) || 'MEMORY: (none)',
    `THE BRAND (short brain):\n${inp.brain || '(none)'}`].join('\n\n').slice(0, 90000);
}
/** One brand's read: build its list, read everything, one Opus call, store it. */
export async function readBrand(env, d, a, { today = centralToday(), list = null } = {}) {
  await ensureBuyerAI(env);
  const L = list || await buildBuyerList(env, d, { act: a.act_id, live: false, noAI: true });
  const inp = await passInput(env, d, a, L, { today });
  if (!inp.metaActs.length || (!inp.ruleRows.length && !inp.sets.length)) {
    await saveAI(env, a.act_id, today, 'empty', { summary: '', rows: [], extra: [] }, 0, null);
    return { act_id: a.act_id, status: 'empty' };
  }
  const { out, usd } = await callModel(env, d, { model: PASS_MODEL, system: passSystem(a.name), user: passUser(a, inp), schema: PASS_SCHEMA, max: 12000, effort: 'medium', what: 'pass', day: today });
  const keys = new Set(inp.ruleRows.map(r => r.key));
  const res = { summary: noDash(clip(out.summary, 400)),
    rows: (out.rows || []).filter(r => keys.has(r.key)).map(r => ({ key: r.key, verdict: ['keep', 'change', 'drop'].includes(r.verdict) ? r.verdict : 'keep', reason: noDash(clip(r.reason, 400)), change: noDash(clip(r.change, 200)) })),
    extra: (out.extra || []).slice(0, 6).map((x, i) => ({ id: `ai${i + 1}`, type: x.type, name: noDash(clip(x.name, 200)), adset_id: ID.test(x.adset_id || '') ? x.adset_id : null,
      ad_id: ID.test(x.ad_id || '') ? x.ad_id : null, campaign_id: ID.test(x.campaign_id || '') ? x.campaign_id : null,
      action: noDash(clip(x.action, 120)), reason: noDash(clip(x.reason, 400)), stake: Math.max(0, Math.round(+x.stake || 0)) })) };
  await saveAI(env, a.act_id, today, 'done', res, usd, null);
  return { act_id: a.act_id, status: 'done', usd, n_rows: res.rows.length, n_extra: res.extra.length };
}
async function saveAI(env, act, day, status, res, usd, error) {
  await env.DB.prepare(`INSERT INTO p_buyer_ai (act_id, day, status, json, usd, model, at, error) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
    ON CONFLICT(act_id, day) DO UPDATE SET status = excluded.status, json = excluded.json, usd = COALESCE(p_buyer_ai.usd, 0) + excluded.usd, model = excluded.model, at = excluded.at, error = excluded.error`)
    .bind(act, day, status, res ? JSON.stringify(res) : null, Math.round((usd || 0) * 10000) / 10000, PASS_MODEL, new Date().toISOString(), error).run();
}
/** Today's reads for these brands: Map act -> {status, summary, rows, extra, at}. */
export async function readAI(env, acts, day = centralToday()) {
  await ensureBuyerAI(env);
  const rows = ((await env.DB.prepare(`SELECT act_id, status, json, usd, at, error FROM p_buyer_ai WHERE day = ?1`).bind(day).all().catch(() => ({ results: [] }))).results) || [];
  const m = new Map();
  for (const r of rows) if (!acts || acts.has(r.act_id)) m.set(r.act_id, { status: r.status, at: r.at, usd: r.usd, error: r.error, ...(safe(r.json, {}) || {}) });
  return m;
}
/** The morning read on the list: each rule row gets `ai`, the extra calls become rows of kind 'ai'. */
export function applyAI(rows, ai, accts) {
  const out = rows.map(r => { const x = ai.get(r.act_id); const v = x && (x.rows || []).find(y => y.key === r.key); return v ? { ...r, ai: { verdict: v.verdict, reason: v.reason, change: v.change || '' } } : r; });
  for (const [act, x] of ai) {
    const a = accts.find(y => y.act_id === act); if (!a) continue;
    for (const e of x.extra || []) {
      const object = String(e.ad_id || e.adset_id || e.campaign_id || `ai:${String(e.name).toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 60)}`);
      out.push({ key: `${act}|${object}|ai`, kind: 'ai', ai_type: e.type, from: 'morning read', act_id: act, brand: a.name, currency: a.currency || 'USD', object,
        level: e.ad_id ? 'ad' : e.adset_id ? 'adset' : e.campaign_id ? 'campaign' : 'account', name: e.name, set: null, action: e.action, why: e.reason, why_full: e.reason,
        stake: e.stake || 0, do: null, adset_id: e.adset_id || null, ad_id: e.ad_id || null, campaign_id: e.campaign_id || null });
    }
  }
  return out;
}

/* ---------- the tick ---------- */
async function passState(env, today) { const s = safe(await getSetting(env, 'buyerAIDone'), {}) || {}; return s.date === today ? s : { date: today, acts: {} }; }
/** Is today's read finished for every active brand? (The post waits for it.) */
export async function aiPassDone(env, d, today) {
  if (!(await buyerAIOn(env))) return true;
  const st = await passState(env, today);
  const brands = (await d.listAccounts(env, true)).filter(eligible);
  return brands.every(a => st.acts[a.act_id]);
}
/** Every 5 minutes from an hour before the morning hour to noon Central: up to PER_TICK brands not read today, side by
 *  side. Stops at the day's cap. */
export async function buyerAITick(env, d, { force = false, acts = null, perTick = PER_TICK } = {}) {
  if (!force && !(await buyerAIOn(env))) return { skipped: 'off' };
  const today = d.centralDate ? d.centralDate() : centralToday();
  if (!force) {
    const hour = d.centralHour(), from = await morningHour(env);
    if (hour < from - 1) return { skipped: `before ${from - 1}am Central` };
    if (hour > LAST_HOUR) return { skipped: 'after noon Central' };
  }
  const st = await passState(env, today);
  const all = (await d.listAccounts(env, true)).filter(a => eligible(a) && (!acts || acts.includes(a.act_id)));
  const todo = all.filter(a => force || !st.acts[a.act_id]).slice(0, force ? 99 : perTick);
  if (!todo.length) return { date: today, done: true };
  /* One tick at a time: a read can outlast the 5 minutes between ticks, and two ticks would read a brand twice. */
  if (!force) {
    const lock = +(await getSetting(env, 'buyerAILock')) || 0;
    if (Date.now() - lock < 8 * 60e3) return { skipped: 'another tick is reading' };
    await putSetting(env, 'buyerAILock', String(Date.now()));
  }
  const ran = {};
  /* The list is built once for all brands (one profit read), then each brand's read runs side by side. */
  let list = null;
  try { list = await buildBuyerList(env, d, { act: 'all', live: false, noAI: true }); } catch (e) { return { error: `list: ${e.message}` }; }
  const queue = [...todo];
  const worker = async () => {
    while (queue.length) {
      const a = queue.shift();
      if ((await spentToday(env, today)) + PASS_EST > DAY_CAP) { st.acts[a.act_id] = 'capped'; ran[a.act_id] = 'capped'; continue; }
      try { const r = await readBrand(env, d, a, { today, list }); st.acts[a.act_id] = r.status; ran[a.act_id] = r; }
      catch (e) {
        const tries = (st.tries ||= {})[a.act_id] = ((st.tries || {})[a.act_id] || 0) + 1;
        ran[a.act_id] = { error: e.message };
        if (tries >= 2) { st.acts[a.act_id] = `failed: ${clip(e.message, 120)}`; await saveAI(env, a.act_id, today, 'failed', null, 0, clip(e.message, 300)).catch(() => {}); }
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(PER_TICK, todo.length) }, worker));
  const fresh = await passState(env, today);   // another tick may have written meanwhile
  await putSetting(env, 'buyerAIDone', JSON.stringify({ ...fresh, ...st, acts: { ...fresh.acts, ...st.acts }, tries: { ...(fresh.tries || {}), ...(st.tries || {}) } }));
  if (!force) await putSetting(env, 'buyerAILock', '0');
  return { date: today, ran, spent_today: await spentToday(env, today) };
}
export { POST_WAIT_HOURS };

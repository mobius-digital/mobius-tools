/* THE BOARD RUNS ITSELF (2026-11-11, Cole after the board audit: Live was a graveyard of ~350 cards whose ads had been off
 * for weeks while real spenders sat in Ready). People move a card up to Ready; Meta moves it after that:
 *
 *   Brief > Making > Review > Ready  (people)  >  Scheduled > Live > Off  (Meta, the hourly tick)
 *
 *   Scheduled  the card's ads are in Meta and have not delivered yet (an ad set start or the card's launch day ahead, or
 *              loaded in the last 45 days and never spent).
 *   Live       an ad on the card spent in the last 3 days. When every ad stops, the card stays in Live and shows
 *              "Paused day N of 7" from the day after the last spend (per ad and per card, kept in p_card_ad / paused_on).
 *   Off        paused 7 full days. The Asana task completes and goes to Completed. Off cards are never purged: they are
 *              the previous-ads library (files, results, verdict, a dated history per ad and ad set), with Reuse.
 *   Ads coming back on clear the pause; the history keeps every launched / paused / resumed / off date (p_card_event).
 *
 * Cards are matched to ads the way the launch flow and Your ads do: stored ad ids first (p_br_adtag, p_launch), then the
 * card number at the front of the ad name ("418-16", "GD_272 B | Still"). An ad tagged by id never matches by name (Lucky's
 * creator sets 445 to 452 reuse numbers), and a number two open cards share is left alone. Only ad_daily spend decides;
 * a brand whose ad_daily is more than 2 days old is skipped that hour (a stale sync must not read as "paused").
 *
 * Also here, because they run on the same tick:
 *   - formatBriefs: an Asana-written brief (the team still works in Asana) becomes the Locus brief layout (the offer,
 *     dates, link, then each ad: headline / primary text / description / landing page), one Haiku call, words kept
 *     verbatim. The Asana text stays on the card (asana_raw, "Original Asana text"). Nothing is written back to Asana.
 *   - frameFiles: a card whose Asana text or asset link has a Frame link (f.io, frame.io, next.frame.io) and no files gets
 *     the Frame files as versions (R2, p_work_file.src = frame:<file id>, so each Frame file comes in once).
 *
 * Routes (team, admin): POST /api/production/auto {act?, dry?}  POST /api/production/format {act?, ids?, limit?, dry?}
 *   POST /api/production/frame-pull {act?, ids?, limit?, dry?}  GET /api/production/off?act=&q=  POST /api/production/reuse {id}
 */
import { boardOf, numOf, moveTaskTo, ensureBoard } from './asana-brand.js';
import { metaOf } from './brands.js';
import { sanitizeHtml, htmlToText, briefHash, adOf, convertFile } from './prodwork.js';
import { frameApi } from './frame.js';

const LIVE_DAYS = 3, OFF_DAYS = 7, SCHED_FRESH = 45;
const safe = (s, d) => { try { return s == null || s === '' ? d : JSON.parse(s); } catch { return d; } };
const clip = (s, n) => (s == null ? '' : String(s).slice(0, n));
const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const rid = () => crypto.randomUUID().replace(/-/g, '').slice(0, 16);
const addDays = (ymd, n) => { const d = new Date(`${ymd}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const daysBetween = (a, b) => Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 864e5);
const centralToday = () => new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Chicago' })).toISOString().slice(0, 10);
const EMDASH = new RegExp('\\s*' + String.fromCharCode(8212) + '\\s*', 'g');

let tabled = false;
export async function ensureAuto(env) {
  if (tabled) return;
  await ensureBoard(env);
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS p_card_ad (batch_id TEXT NOT NULL, ad_id TEXT NOT NULL, act_id TEXT NOT NULL, adset_id TEXT, name TEXT, how TEXT,
    first_spend TEXT, last_spend TEXT, paused_on TEXT, spend REAL, updated_at TEXT, PRIMARY KEY (batch_id, ad_id))`).run();
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS p_card_event (id TEXT PRIMARY KEY, batch_id TEXT NOT NULL, act_id TEXT NOT NULL, ad_id TEXT, adset_id TEXT,
    kind TEXT NOT NULL, on_date TEXT NOT NULL, note TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now')))`).run();
  await env.DB.prepare(`CREATE UNIQUE INDEX IF NOT EXISTS p_card_event_one ON p_card_event (batch_id, COALESCE(ad_id, ''), kind, on_date)`).run().catch(() => {});
  await env.DB.prepare(`ALTER TABLE p_work_file ADD COLUMN src TEXT`).run().catch(() => {});
  tabled = true;
}

/** Pause state of a card for the board and the sheet: {paused_on, day, of} or null. */
export function pauseOf(r, today = centralToday()) {
  if (!r || r.board_stage !== 'live' || !r.paused_on) return null;
  const day = Math.min(OFF_DAYS, Math.max(1, daysBetween(r.paused_on, today) + 1));
  return { paused_on: r.paused_on, day, of: OFF_DAYS };
}

/* ================================================================================================================ */
/*  1. DELIVERY: Meta decides Scheduled, Live (and its pause timer) and Off                                          */
/* ================================================================================================================ */
async function q(env, sql, ...b) { return (await env.DB.prepare(sql).bind(...b).all()).results || []; }

/** What the brand's ads did, mapped to its cards. */
async function brandDelivery(env, act, today) {
  const cards = await q(env, `SELECT id, num, title, stage, board_stage, asana_section, asana_gid, launch_on, paused_on, off_on, live_on, last_spend_on FROM p_br_batch
    WHERE act_id = ?1 AND COALESCE(board_stage, '') != 'done'`, act);
  const ads = await q(env, `SELECT ad_id, name, adset_id, created_time FROM ads WHERE act_id IN ${metaOf(1)}`, act);
  const spend = await q(env, `SELECT ad_id, MIN(date) first, MAX(date) last, SUM(spend) spend FROM ad_daily WHERE act_id IN ${metaOf(1)} AND spend > 0 GROUP BY ad_id`, act);
  const fresh = (await env.DB.prepare(`SELECT MAX(date) d FROM ad_daily WHERE act_id IN ${metaOf(1)}`).bind(act).first().catch(() => null))?.d || null;
  const sets = await q(env, `SELECT adset_id, start_time, end_time, status FROM meta_adsets WHERE act_id IN ${metaOf(1)}`, act).catch(() => []);
  const tagged = new Map();
  for (const t of await q(env, `SELECT ad_id, batch_id FROM p_br_adtag WHERE act_id = ?1`, act).catch(() => [])) tagged.set(String(t.ad_id), t.batch_id);
  for (const t of await q(env, `SELECT ad_id, batch_id FROM p_launch WHERE act = ?1 AND ad_id IS NOT NULL AND batch_id IS NOT NULL`, act).catch(() => [])) if (!tagged.has(String(t.ad_id))) tagged.set(String(t.ad_id), t.batch_id);
  const byId = new Map(cards.map(c => [c.id, c]));
  const byNum = new Map();
  for (const c of cards) { const n = String(parseInt(c.num, 10) || ''); if (n) (byNum.get(n) || byNum.set(n, []).get(n)).push(c); }
  const sp = new Map(spend.map(s => [String(s.ad_id), s]));
  const setOf = new Map(sets.map(s => [String(s.adset_id), s]));
  const per = new Map();   // card id -> [{ad, how}]
  let ambiguous = 0;
  for (const a of ads) {
    const id = String(a.ad_id);
    let card = null, how = 'id';
    if (tagged.has(id)) card = byId.get(tagged.get(id)) || null;
    else {
      const n = numOf(a.name);
      const list = n ? byNum.get(n) : null;
      if (list && list.length === 1) { card = list[0]; how = 'name'; } else if (list && list.length > 1) ambiguous++;
    }
    if (card) (per.get(card.id) || per.set(card.id, []).get(card.id)).push({ ...a, how, s: sp.get(id) || null, set: setOf.get(String(a.adset_id)) || null });
  }
  return { cards, per, fresh, ambiguous };
}

/** The column Meta says a card belongs in, with its pause date. Null = leave it where people put it. */
function verdictFor(c, list, today) {
  const spent = list.filter(a => a.s && a.s.last);
  const last = spent.map(a => a.s.last).sort().pop() || null;
  const first = spent.map(a => a.s.first).sort()[0] || null;
  const cur = c.board_stage || boardOf(c.asana_section, c.stage);
  if (last && last >= addDays(today, -LIVE_DAYS)) return { to: 'live', last, first, paused_on: null };
  if (last) {
    /* every ad stopped: only a card already past Ready runs the pause timer (a Ready card with old spend was put there by a person) */
    if (!['live', 'scheduled', 'off'].includes(cur)) return null;
    const paused_on = addDays(last, 1);
    return daysBetween(paused_on, today) >= OFF_DAYS ? { to: 'off', last, first, paused_on } : { to: 'live', last, first, paused_on };
  }
  /* in Meta, nothing delivered yet */
  const future = list.some(a => a.set && a.set.start_time && a.set.start_time.slice(0, 10) > today) || (c.launch_on && c.launch_on > today);
  const recent = list.some(a => a.created_time && a.created_time.slice(0, 10) >= addDays(today, -SCHED_FRESH));
  if ((future || recent) && ['making', 'review', 'ready', 'scheduled', 'live'].includes(cur)) return { to: 'scheduled', last: null, first: null, paused_on: null };
  return null;
}

async function event(env, c, act, kind, on, ad = null, set = null, note = null) {
  await env.DB.prepare(`INSERT OR IGNORE INTO p_card_event (id, batch_id, act_id, ad_id, adset_id, kind, on_date, note) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)`)
    .bind(rid(), c.id, act, ad, set, kind, on, note).run();
}

/** One brand: compute, and (unless dry) write the per-ad rows, the history, the column and the Asana task. */
export async function deliveryBrand(env, d, act, { dry = false, today = centralToday(), asanaDoc = null, cache = {} } = {}) {
  await ensureAuto(env);
  const { cards, per, fresh, ambiguous } = await brandDelivery(env, act, today);
  const before = {}, after = {};
  for (const c of cards) { const k = c.board_stage || boardOf(c.asana_section, c.stage) || 'none'; before[k] = (before[k] || 0) + 1; }
  if (!fresh || fresh < addDays(today, -2)) return { act, skipped: `ad_daily is stale (newest ${fresh || 'none'})`, before, after: before };
  const moves = [], asanaFails = [], unmatched = [];
  const known = new Map();
  if (!dry) for (const k of await q(env, `SELECT batch_id, ad_id, adset_id, first_spend, last_spend, paused_on FROM p_card_ad WHERE act_id = ?1`, act)) known.set(`${k.batch_id}|${k.ad_id}`, k);
  const evt = (c, kind, on, ad, set) => env.DB.prepare(`INSERT OR IGNORE INTO p_card_event (id, batch_id, act_id, ad_id, adset_id, kind, on_date) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)`).bind(rid(), c.id, act, ad, set, kind, on);
  let paused = 0, resumed = 0, livePaused = 0;
  for (const c of cards) {
    const list = per.get(c.id) || [];
    const cur = c.board_stage || boardOf(c.asana_section, c.stage) || 'none';
    /* no ad matched: a Live card whose launch day is ahead is Scheduled (loaded early, nothing delivered); else it stays */
    const v = list.length ? verdictFor(c, list, today) : cur === 'live' && c.launch_on && c.launch_on > today ? { to: 'scheduled', last: null, first: null, paused_on: null } : null;
    if (!list.length && cur === 'live' && !v) unmatched.push(c.num);
    const to = v ? v.to : cur;
    after[to] = (after[to] || 0) + 1;
    if (v && v.to === 'live' && v.paused_on) livePaused++;
    if (dry || (!list.length && !v)) { if (v && v.to !== cur) moves.push({ num: c.num, from: cur, to: v.to, paused_on: v.paused_on || null }); continue; }
    /* per ad: first / last spend, pause date, history (only what changed since the last hour) */
    const st = [];
    for (const a of list) {
      const p = a.s && a.s.last && a.s.last < addDays(today, -LIVE_DAYS) ? addDays(a.s.last, 1) : null;
      const was = known.get(`${c.id}|${a.ad_id}`);
      if (was && was.last_spend === (a.s?.last || null) && was.paused_on === p && was.adset_id === (a.adset_id || null)) continue;
      if (a.s?.first && (!was || !was.first_spend)) st.push(evt(c, 'launched', a.s.first, String(a.ad_id), a.adset_id || null));
      if (p && (!was || was.paused_on !== p)) st.push(evt(c, 'paused', p, String(a.ad_id), a.adset_id || null));
      if (!p && was && was.paused_on && a.s?.last) st.push(evt(c, 'resumed', a.s.last, String(a.ad_id), a.adset_id || null));
      st.push(env.DB.prepare(`INSERT INTO p_card_ad (batch_id, ad_id, act_id, adset_id, name, how, first_spend, last_spend, paused_on, spend, updated_at) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,datetime('now'))
        ON CONFLICT(batch_id, ad_id) DO UPDATE SET adset_id = excluded.adset_id, name = excluded.name, how = excluded.how, first_spend = excluded.first_spend, last_spend = excluded.last_spend, paused_on = excluded.paused_on, spend = excluded.spend, updated_at = excluded.updated_at`)
        .bind(c.id, String(a.ad_id), act, a.adset_id || null, clip(a.name, 200), a.how, a.s?.first || null, a.s?.last || null, p, a.s?.spend || 0));
    }
    for (let i = 0; i < st.length; i += 50) await env.DB.batch(st.slice(i, i + 50));
    if (!v) continue;
    /* the card's own dates and history */
    if (v.first && !c.live_on) await event(env, c, act, 'launched', v.first);
    if (v.to === 'live' && !v.paused_on && c.paused_on) { await event(env, c, act, 'resumed', v.last); resumed++; }
    if (v.to === 'live' && v.paused_on && v.paused_on !== c.paused_on) { await event(env, c, act, 'paused', v.paused_on); paused++; }
    if (v.to === 'off' && cur !== 'off') { await event(env, c, act, 'paused', v.paused_on); await event(env, c, act, 'off', addDays(v.paused_on, OFF_DAYS)); }
    if (cur === 'off' && v.to === 'live') { await event(env, c, act, 'resumed', v.last); resumed++; }
    if (v.to === 'scheduled' && cur !== 'scheduled') await event(env, c, act, 'scheduled', today);
    const offOn = v.to === 'off' ? (cur === 'off' && c.off_on ? c.off_on : addDays(v.paused_on, OFF_DAYS)) : null;
    const stage = v.to === 'off' ? 'done' : v.to === 'live' ? 'live' : 'production';
    const moved = v.to !== cur;
    await env.DB.prepare(`UPDATE p_br_batch SET paused_on = ?2, off_on = ?3, live_on = COALESCE(live_on, ?4), last_spend_on = ?5,
        board_stage = ?6, stage = CASE WHEN ?7 THEN ?8 ELSE stage END, board_at = CASE WHEN ?7 THEN datetime('now') ELSE board_at END, updated_at = CASE WHEN ?7 THEN datetime('now') ELSE updated_at END WHERE id = ?1`)
      .bind(c.id, v.paused_on, offOn, v.first, v.last, v.to, moved ? 1 : 0, stage).run();
    if (!moved) continue;
    moves.push({ num: c.num, from: cur, to: v.to, paused_on: v.paused_on || null });
    /* Asana follows like a drag: Analyze Results, Scheduled (made if missing), Off = completed + Completed */
    if (c.asana_gid && asanaDoc?.project_gid && d.asana) {
      try {
        if (cur === 'off') await d.asana(env, `/tasks/${c.asana_gid}`, { method: 'PUT', body: { completed: false } });
        const name = await moveTaskTo(env, d.asana, asanaDoc.project_gid, c.asana_gid, v.to, cache);
        if (v.to === 'off') await d.asana(env, `/tasks/${c.asana_gid}`, { method: 'PUT', body: { completed: true } });
        await env.DB.prepare(`UPDATE p_br_batch SET asana_section = ?2 WHERE id = ?1`).bind(c.id, clip(name, 80)).run();
      } catch (e) { asanaFails.push({ num: c.num, why: e.message }); }
    }
  }
  /* Off cards whose task is not in Completed yet (a run cut short between the column and Asana): put Asana right. */
  let asanaFixed = 0;
  if (!dry && asanaDoc?.project_gid && d.asana) {
    const left = await q(env, `SELECT id, num, asana_gid FROM p_br_batch WHERE act_id = ?1 AND board_stage = 'off' AND asana_gid IS NOT NULL AND LOWER(COALESCE(asana_section, '')) NOT LIKE '%complete%' LIMIT 40`, act);
    for (const c of left) {
      try {
        const name = await moveTaskTo(env, d.asana, asanaDoc.project_gid, c.asana_gid, 'off', cache);
        await d.asana(env, `/tasks/${c.asana_gid}`, { method: 'PUT', body: { completed: true } });
        await env.DB.prepare(`UPDATE p_br_batch SET asana_section = ?2 WHERE id = ?1`).bind(c.id, clip(name, 80)).run();
        asanaFixed++;
      } catch (e) { asanaFails.push({ num: c.num, why: e.message }); }
    }
  }
  return { act, before, after, moved: moves.length, asana_fixed: asanaFixed, moves: moves.slice(0, 400), paused, resumed, live_paused: livePaused, live_no_ads: unmatched.length, live_no_ads_nums: unmatched.slice(0, 80), ambiguous_ads: ambiguous, asana_failed: asanaFails, fresh };
}

/** Every active brand (or one). The hourly tick calls it with dry=false. */
export async function deliveryAll(env, d, { act = null, dry = false, canAfford = () => true } = {}) {
  await ensureAuto(env);
  const brands = act ? [{ act_id: act }] : await d.listBrands(env);
  const mirror = d.mirrorOn ? await d.mirrorOn(env) : true;
  const out = [];
  for (const b of brands) {
    if (!canAfford(60)) { out.push({ act: b.act_id, deferred: true }); continue; }
    const doc = mirror ? safe((await env.DB.prepare(`SELECT data_json FROM p_br_doc WHERE act_id = ?1 AND line_id = '' AND key = 'asana'`).bind(b.act_id).first().catch(() => null))?.data_json, null) : null;
    try { out.push({ brand: b.name || b.act_id, ...(await deliveryBrand(env, d, b.act_id, { dry, asanaDoc: doc })) }); }
    catch (e) { out.push({ act: b.act_id, error: e.message }); }
  }
  return { dry, today: centralToday(), brands: out };
}

/** The sheet's delivery panel: per ad and ad set, the dated history. */
export async function cardDelivery(env, id) {
  await ensureAuto(env);
  const r = await env.DB.prepare(`SELECT board_stage, paused_on, off_on, live_on, last_spend_on FROM p_br_batch WHERE id = ?1`).bind(id).first().catch(() => null);
  if (!r) return null;
  const ads = await q(env, `SELECT a.ad_id, a.name, a.adset_id, s.name AS adset, a.first_spend, a.last_spend, a.paused_on, a.spend, a.how FROM p_card_ad a LEFT JOIN meta_adsets s ON s.adset_id = a.adset_id WHERE a.batch_id = ?1 ORDER BY a.name`, id).catch(() => []);
  const events = await q(env, `SELECT e.kind, e.on_date, e.ad_id, e.adset_id, a.name AS ad, s.name AS adset FROM p_card_event e LEFT JOIN p_card_ad a ON a.batch_id = e.batch_id AND a.ad_id = e.ad_id
    LEFT JOIN meta_adsets s ON s.adset_id = e.adset_id WHERE e.batch_id = ?1 ORDER BY e.on_date, e.created_at`, id).catch(() => []);
  return { live_on: r.live_on, last_spend_on: r.last_spend_on, paused_on: r.paused_on, off_on: r.off_on, pause: pauseOf(r), ads, events };
}

/* ================================================================================================================ */
/*  2. THE OFF LIBRARY, and Reuse                                                                                     */
/* ================================================================================================================ */
export async function offLibrary(env, d, origin, { act = 'all', q: words = '', limit = 200 } = {}) {
  await ensureAuto(env);
  const brands = await d.listBrands(env);
  const ids = act && act !== 'all' ? [act] : brands.map(b => b.act_id);
  if (!ids.length) return { cards: [] };
  const ph = ids.map((_, i) => `?${i + 1}`).join(', ');
  const like = `%${String(words || '').trim().toLowerCase()}%`;
  const rows = await q(env, `SELECT id, act_id, num, title, verdict, asana_result, learning, live_on, paused_on, off_on, asana_url, brief_text FROM p_br_batch
    WHERE act_id IN (${ph}) AND board_stage = 'off' AND (LOWER(title) LIKE ?${ids.length + 1} OR num LIKE ?${ids.length + 1} OR LOWER(COALESCE(brief_text, '')) LIKE ?${ids.length + 1})
    ORDER BY COALESCE(off_on, '') DESC, CAST(num AS INTEGER) DESC LIMIT ${Math.min(500, +limit || 200)}`, ...ids, like);
  const out = [];
  for (let i = 0; i < rows.length; i += 80) {
    const part = rows.slice(i, i + 80);
    const p2 = part.map((_, j) => `?${j + 1}`).join(', ');
    const files = await q(env, `SELECT batch_id, COUNT(*) n, MAX(CASE WHEN mime LIKE 'image/%' THEN id END) pic FROM p_work_file WHERE kind = 'version' AND deleted_at IS NULL AND batch_id IN (${p2}) GROUP BY batch_id`, ...part.map(r => r.id)).catch(() => []);
    const res = await q(env, `SELECT batch_id, COUNT(*) ads, SUM(spend) spend FROM p_card_ad WHERE batch_id IN (${p2}) GROUP BY batch_id`, ...part.map(r => r.id)).catch(() => []);
    const tw = await q(env, `SELECT a.batch_id, SUM(t.orders) orders, SUM(t.revenue) revenue FROM p_card_ad a JOIN tw_ad_attr t ON t.ad_id = a.ad_id AND t.model = 'lastPlatformClick' WHERE a.batch_id IN (${p2}) GROUP BY a.batch_id`, ...part.map(r => r.id)).catch(() => []);
    for (const r of part) {
      const f = files.find(x => x.batch_id === r.id), s = res.find(x => x.batch_id === r.id), t = tw.find(x => x.batch_id === r.id);
      out.push({ id: r.id, act_id: r.act_id, brand: brands.find(b => b.act_id === r.act_id)?.name || r.act_id, num: r.num, title: r.title || '', verdict: r.verdict || r.asana_result || null,
        learning: r.learning || null, live_on: r.live_on, paused_on: r.paused_on, off_on: r.off_on, files: f?.n || 0, pic: f?.pic || null, ads: s?.ads || 0, spend: Math.round(s?.spend || 0),
        orders: Math.round((t?.orders || 0) * 10) / 10, revenue: Math.round(t?.revenue || 0), asana_url: r.asana_url || null });
    }
  }
  if (d.fileUrl && origin) for (const c of out) c.thumb = c.pic ? `${await d.fileUrl(env, origin, c.pic)}&w=600` : null;
  return { cards: out, total: out.length };
}

/* ================================================================================================================ */
/*  3. ASANA BRIEFS IN THE LOCUS LAYOUT                                                                               */
/* ================================================================================================================ */
const FMT_MODEL = 'claude-haiku-5-5';
const FMT_SCHEMA = {
  type: 'object', additionalProperties: false,
  properties: {
    format: { type: 'string', enum: ['Static', 'Video', 'UGC', 'Carousel'] },
    offer: { type: 'string' }, dates: { type: 'string' }, link: { type: 'string' },
    angle: { type: 'string' }, testing: { type: 'string' },
    ads: { type: 'array', items: { type: 'object', additionalProperties: false, properties: {
      name: { type: 'string' }, visual: { type: 'string' }, headline: { type: 'string' }, primary_text: { type: 'string' }, description: { type: 'string' }, landing_page: { type: 'string' }, inspo: { type: 'string' },
    }, required: ['name', 'visual', 'headline', 'primary_text', 'description', 'landing_page', 'inspo'] } },
    files: { type: 'array', items: { type: 'string' } },
    notes: { type: 'string' },
  },
  required: ['format', 'offer', 'dates', 'link', 'angle', 'testing', 'ads', 'files', 'notes'],
};
const FMT_SYSTEM = `You lay out an ad brief that a teammate wrote in Asana into Mobius Digital's brief layout. You are a copy clerk, not a writer.
Rules:
- Use the teammate's words exactly. Never invent, reword, shorten or improve copy. Never add an offer, date, link or ad that is not in the text.
- An empty string when the text does not say it.
- offer: what the customer gets (the deal). dates: when it runs or launches. link: the main landing page or site link for the offer.
- ads: one entry per ad the brief describes, in order. name = the ad's number as written (like "418-3"), else "Ad 1", "Ad 2". visual = what the ad shows (image, scene, layout, script beats), headline, primary_text (the post copy, keep its line breaks), description (Meta's description line under the headline), landing_page (that ad's own link if it differs), inspo (that ad's inspiration notes and links).
- When copy is shared by every ad, put it on each ad.
- files: Frame, Drive, Dropbox or other asset links in the text (not the landing page).
- Never repeat the CARD line you are given.
- notes: everything else in the text that does not fit above (angle reasoning, instructions, sizes, questions), verbatim, line breaks kept. Nothing may be lost.
- format: Static, Video, UGC or Carousel, from what is being made.`;

const para = s => esc(s).replace(/https?:\/\/[^\s<>"']+/g, u => `<a href="${u}">${u}</a>`).replace(/\n/g, '<br>');
const lab = (l, v) => v && String(v).trim() ? `<p><strong>${esc(l)}</strong></p><p>${para(String(v).trim())}</p>` : '';
/** The JSON as the Locus page. */
export function fmtHtml(j, num) {
  let h = '';
  const offer = lab('Offer', j.offer) + lab('Dates', j.dates) + lab('Link', j.link);
  if (offer) h += `<h2>The offer</h2>${offer}`;
  const test = lab('Angle', j.angle) + lab("What we're testing", j.testing);
  if (test) h += `<h2>The test</h2>${test}`;
  const ads = (j.ads || []).filter(a => Object.values(a).some(v => String(v || '').trim()));
  if (ads.length) {
    h += '<h2>The ads</h2>';
    ads.forEach((a, i) => {
      const name = String(a.name || '').trim() || (num ? `${parseInt(num, 10)}-${i + 1}` : `Ad ${i + 1}`);
      h += `<h3>${esc(/^ad\b/i.test(name) ? name : `Ad ${name}`)}</h3>${lab('Visual', a.visual)}${lab('Headline', a.headline)}${lab('Primary text', a.primary_text)}${lab('Description', a.description)}${lab('Landing page', a.landing_page)}${lab('Inspiration', a.inspo)}`;
    });
  }
  const files = (j.files || []).filter(Boolean);
  if (files.length) h += `<h2>Files</h2><ul>${files.map(f => `<li>${para(f)}</li>`).join('')}</ul>`;
  const notes = String(j.notes || '').split('\n').filter(l => !/^\s*CARD:\s*#/.test(l)).join('\n').trim();
  if (notes) h += `<h2>Notes</h2><p>${para(notes)}</p>`;
  return sanitizeHtml(h.replace(EMDASH, ', '));
}

async function fmtCall(env, d, raw, title) {
  const body = model => JSON.stringify({ model, max_tokens: 8000, system: FMT_SYSTEM, output_config: { format: { type: 'json_schema', schema: FMT_SCHEMA } },
    messages: [{ role: 'user', content: `CARD: ${title}\n\nTHE ASANA TEXT:\n${clip(raw, 24000)}` }] });
  const f = d.xfetch || fetch;
  let res = await f('https://api.anthropic.com/v1/messages', { method: 'POST', headers: { 'x-api-key': env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' }, body: body(FMT_MODEL) });
  if (!res.ok && res.status === 404) res = await f('https://api.anthropic.com/v1/messages', { method: 'POST', headers: { 'x-api-key': env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' }, body: body('claude-sonnet-5-5') });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(j.error?.message || `AI ${res.status}`);
  const text = (j.content || []).filter(x => x.type === 'text').map(x => x.text).join('');
  const out = safe(text, null);
  if (!out) throw new Error('unreadable AI answer');
  return { out, usage: j.usage || {} };
}
const isLocusPage = raw => /^\s*Written in Locus/i.test(String(raw || ''));
const worthFormatting = raw => String(raw || '').replace(/https?:\/\/\S+/g, ' ').replace(/\s+/g, ' ').trim().length >= 40 && !isLocusPage(raw);

/** Open cards whose Asana text changed since it was last laid out (brief_fmt = the hash it was laid out from). */
export async function formatBriefs(env, d, { act = null, ids = null, limit = 12, dry = false } = {}) {
  await ensureAuto(env);
  if (!env.ANTHROPIC_API_KEY) return { error: 'no ANTHROPIC_API_KEY' };
  const where = ids && ids.length ? `id IN (${ids.map((_, i) => `?${i + 1}`).join(', ')})` : act ? `act_id = ?1` : '1 = 1';
  const binds = ids && ids.length ? ids : act ? [act] : [];
  const rows = await q(env, `SELECT id, act_id, num, title, brief_json, asana_raw, brief_fmt, brief_hash FROM p_br_batch WHERE ${where} AND asana_raw IS NOT NULL
    AND COALESCE(board_stage, '') NOT IN ('done') AND stage != 'done' ORDER BY CAST(num AS INTEGER) DESC LIMIT 1500`, ...binds);
  const todo = [];
  for (const r of rows) {
    if (!worthFormatting(r.asana_raw)) continue;
    const h = await briefHash(r.asana_raw);
    if (r.brief_fmt === h) continue;
    /* a brief written in Locus and not edited in Asana since (its hash is the one Locus wrote) stays as it is */
    if (r.brief_json && r.brief_hash === h && !safe(r.brief_json, {}).fmt) continue;
    todo.push({ ...r, h });
  }
  if (dry) return { dry: true, waiting: todo.length, sample: todo.slice(0, 20).map(r => `${r.act_id} #${r.num}`) };
  let done = 0, cost = 0;
  const failed = [];
  for (const r of todo.slice(0, limit)) {
    if (d.canAfford && !d.canAfford(4)) break;
    try {
      const { out, usage } = await fmtCall(env, d, r.asana_raw, `#${r.num} ${r.title || ''}`);
      cost += ((usage.input_tokens || 0) * 1 + (usage.output_tokens || 0) * 5) / 1e6;
      const html = fmtHtml(out, r.num);
      if (!htmlToText(html).trim()) throw new Error('empty layout');
      const old = safe(r.brief_json, {}) || {};
      const brief = { v: 2, html, format: out.format || old.format || 'Static', sizes: old.sizes || [], fmt: 'asana' };
      const text = `Format: ${brief.format}\n${htmlToText(html)}`;
      /* brief_hash = the Asana text's hash, so the hourly sync reads it as unchanged until someone edits it in Asana */
      await env.DB.prepare(`UPDATE p_br_batch SET brief_json = ?2, brief_text = ?3, brief_hash = ?4, brief_fmt = ?4, brief_at = ?5 WHERE id = ?1`)
        .bind(r.id, JSON.stringify(brief), text, r.h, new Date().toISOString()).run();
      done++;
    } catch (e) { failed.push({ num: r.num, act: r.act_id, why: e.message }); }
  }
  return { formatted: done, waiting: Math.max(0, todo.length - done - failed.length), failed, cost: Math.round(cost * 1000) / 1000 };
}

/* ================================================================================================================ */
/*  4. FRAME FILES ONTO THE CARD                                                                                      */
/* ================================================================================================================ */
const FRAME_LINK = /https?:\/\/(?:[\w-]+\.)?(?:frame\.io|f\.io)\/[^\s<>"')\]]+/gi;
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/ig;
const MEDIA = /^(image|video)\//;
let accountId = null;
async function frameAccount(env) {
  if (accountId) return accountId;
  const j = await frameApi(env, 'GET', '/accounts');
  accountId = (Array.isArray(j.data) ? j.data : [])[0]?.id || null;
  if (!accountId) throw new Error('This Frame login sees no account.');
  return accountId;
}
/** f.io short links redirect to next.frame.io; read the target without following it. */
async function expand(d, url) {
  if (!/\/\/f\.io\//i.test(url)) return url;
  const f = d.xfetch || fetch;
  const res = await f(url, { method: 'GET', redirect: 'manual' });
  return res.headers.get('location') || url;
}
async function kids(env, A, folder, depth = 0, out = []) {
  let next = `/accounts/${A}/folders/${folder}/children?page_size=100`;
  for (let i = 0; i < 10 && next; i++) {
    const j = await frameApi(env, 'GET', next);
    for (const x of Array.isArray(j.data) ? j.data : []) {
      if (x.type === 'folder' && depth < 2 && !/old versions/i.test(x.name || '')) await kids(env, A, x.id, depth + 1, out);
      else if (x.type === 'file' || x.type === 'version_stack') out.push(x);
    }
    const n = j.links?.next;
    next = n ? n.replace(/^https?:\/\/[^/]+/, '').replace(/^\/?v4(?=\/)/, '') : null;
    if (next && !next.startsWith('/')) next = '/' + next;
  }
  return out;
}
/** Every Frame file a link points at: a share, a folder, a file or a version stack. */
export async function frameFilesOf(env, d, link) {
  const A = await frameAccount(env);
  const url = await expand(d, link);
  const ids = String(url).match(UUID) || [];
  const tried = [];
  const share = /\/share\/([0-9a-f-]{36})/i.exec(url)?.[1];
  if (share) {
    for (const p of [`/accounts/${A}/shares/${share}/assets?page_size=100`, `/accounts/${A}/shares/${share}?include=assets`]) {
      const j = await frameApi(env, 'GET', p).catch(e => { tried.push(e.message); return null; });
      const list = j ? (Array.isArray(j.data) ? j.data : j.data?.assets || []) : null;
      if (list && list.length) {
        const out = [];
        for (const x of list) {
          const id = x.id || x.asset_id;
          if (x.type === 'folder') await kids(env, A, id, 0, out);
          else out.push({ ...x, id });
        }
        return { url, files: out };
      }
    }
  }
  for (const id of ids.reverse()) {
    if (id === share) continue;
    const file = await frameApi(env, 'GET', `/accounts/${A}/files/${id}`).then(j => j.data).catch(() => null);
    if (file) return { url, files: [file] };
    const stack = await frameApi(env, 'GET', `/accounts/${A}/version_stacks/${id}`).then(j => j.data).catch(() => null);
    if (stack) return { url, files: [{ ...stack, type: 'version_stack' }] };
    const folder = await frameApi(env, 'GET', `/accounts/${A}/folders/${id}`).then(j => j.data).catch(() => null);
    if (folder) return { url, files: await kids(env, A, id) };
  }
  return { url, files: [], why: tried[0] || 'Frame did not recognise the link' };
}
async function downloadOf(env, A, x) {
  let id = x.id;
  if (x.type === 'version_stack') {
    const top = await frameApi(env, 'GET', `/accounts/${A}/version_stacks/${id}/children?page_size=50`).then(j => (j.data || [])[0]).catch(() => null);
    if (top) { id = top.id; x = { ...x, ...top }; }
  }
  const j = await frameApi(env, 'GET', `/accounts/${A}/files/${id}?include=media_links.original`);
  return { id, name: j.data?.name || x.name, mime: j.data?.media_type || x.media_type || '', url: j.data?.media_links?.original?.download_url || null, size: j.data?.file_size || 0 };
}

/** Pull the Frame files of one card in as versions. */
async function pullCard(env, d, r, { maxFiles = 40, origin } = {}) {
  const text = `${r.asset_url || ''}\n${r.asana_raw || ''}\n${r.brief_text || ''}`;
  const links = [...new Set(text.match(FRAME_LINK) || [])].map(u => u.replace(/[.,;:]+$/, ''));
  if (!links.length) return { links: 0, added: 0 };
  const A = await frameAccount(env);
  const have = new Set((await q(env, `SELECT src FROM p_work_file WHERE batch_id = ?1 AND src IS NOT NULL`, r.id)).map(x => x.src));
  let added = 0;
  const why = [];
  for (const link of links) {
    const { files, why: w } = await frameFilesOf(env, d, link).catch(e => ({ files: [], why: e.message }));
    if (w && !files.length) why.push(`${link}: ${w}`);
    /* a share often holds an old upload and its newer copy under one name: the newest of each name comes in */
    const seen = new Set();
    const newest = [...files].sort((a, b) => String(b.updated_at || b.created_at || '').localeCompare(String(a.updated_at || a.created_at || '')))
      .filter(x => { const k = String(x.name || x.id).toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true; })
      .sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), undefined, { numeric: true }));
    for (const x of newest.slice(0, maxFiles)) {
      if (added >= maxFiles) break;
      if (have.has(`frame:${x.id}`)) continue;
      try {
        const dl = await downloadOf(env, A, x);
        const name = clip(String(dl.name || 'frame-file').replace(/[\\/]+/g, '_'), 120);
        const ext = (/\.([a-z0-9]{2,5})$/i.exec(name) || [])[1]?.toLowerCase();
        const mime = MEDIA.test(dl.mime) ? dl.mime : ({ mov: 'video/quicktime', mp4: 'video/mp4', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif' }[ext] || '');
        if (!MEDIA.test(mime)) continue;
        if (!dl.url) { why.push(`${name}: no download yet`); continue; }
        if (have.has(`frame:${dl.id}`)) continue;
        const res = await (d.xfetch || fetch)(dl.url);
        if (!res.ok || !res.body) { why.push(`${name}: download ${res.status}`); continue; }
        const len = +res.headers.get('content-length') || 0;
        const fid = rid();
        const key = `work/${r.act_id}/${r.id}/${fid}-${name.replace(/[^\w.-]+/g, '_')}`;
        let body = res.body;
        if (len) { const fl = new FixedLengthStream(len); res.body.pipeTo(fl.writable); body = fl.readable; } else body = await res.arrayBuffer();
        const put = await env.MEDIA.put(key, body, { httpMetadata: { contentType: mime } });
        const ad = adOf(name, r.num) || null;
        const version = ((await env.DB.prepare(`SELECT MAX(version) v FROM p_work_file WHERE batch_id = ?1 AND kind = 'version' AND COALESCE(ad, '') = ?2`).bind(r.id, ad || '').first())?.v || 0) + 1;
        await env.DB.prepare(`INSERT INTO p_work_file (id, batch_id, act_id, kind, version, ad, r2_key, name, mime, size, by_name, src) VALUES (?1, ?2, ?3, 'version', ?4, ?5, ?6, ?7, ?8, ?9, 'Frame', ?10)`)
          .bind(fid, r.id, r.act_id, version, ad, key, name, mime, put?.size || len || 0, `frame:${dl.id}`).run();
        have.add(`frame:${dl.id}`); have.add(`frame:${x.id}`);
        if (/quicktime|x-msvideo|x-matroska/.test(mime) && convertFile && origin) await convertFile(env, origin, fid, mime, name).catch(() => {});
        added++;
      } catch (e) { why.push(`${x.name || x.id}: ${e.message}`); }
    }
  }
  return { links: links.length, added, why: why.slice(0, 5) };
}

/** Cards with a Frame link and no files (or the ids given), oldest backlog first by number. */
export async function frameFiles(env, d, { act = null, ids = null, nums = null, limit = 6, dry = false, origin = null, force = false } = {}) {
  await ensureAuto(env);
  let rows;
  if (ids && ids.length) rows = await q(env, `SELECT id, act_id, num, title, asset_url, asana_raw, brief_text FROM p_br_batch WHERE id IN (${ids.map((_, i) => `?${i + 1}`).join(', ')})`, ...ids);
  else if (act && nums && nums.length) rows = await q(env, `SELECT id, act_id, num, title, asset_url, asana_raw, brief_text FROM p_br_batch WHERE act_id = ?1 AND COALESCE(board_stage, '') != 'done' AND CAST(num AS INTEGER) IN (${nums.map((_, i) => `?${i + 2}`).join(', ')})`, act, ...nums.map(n => parseInt(n, 10)));
  else rows = await q(env, `SELECT id, act_id, num, title, asset_url, asana_raw, brief_text FROM p_br_batch WHERE ${act ? 'act_id = ?1 AND' : ''} COALESCE(board_stage, '') NOT IN ('done', 'off') AND stage != 'done'
      AND (asset_url LIKE '%f.io/%' OR asset_url LIKE '%frame.io/%' OR asana_raw LIKE '%f.io/%' OR asana_raw LIKE '%frame.io/%' OR brief_text LIKE '%f.io/%' OR brief_text LIKE '%frame.io/%')
      ORDER BY CAST(num AS INTEGER) DESC LIMIT 800`, ...(act ? [act] : []));
  const counts = new Map();
  if (rows.length) for (let i = 0; i < rows.length; i += 90) {
    const part = rows.slice(i, i + 90);
    for (const x of await q(env, `SELECT batch_id, COUNT(*) n FROM p_work_file WHERE kind = 'version' AND deleted_at IS NULL AND batch_id IN (${part.map((_, j) => `?${j + 1}`).join(', ')}) GROUP BY batch_id`, ...part.map(r => r.id))) counts.set(x.batch_id, x.n);
  }
  const fails = new Set(safe((await env.DB.prepare(`SELECT value FROM settings WHERE key = 'framePullFail'`).first().catch(() => null))?.value, []));
  const todo = rows.filter(r => (force || !counts.get(r.id)) && (force || ids || nums || !fails.has(r.id)));
  if (dry) return { dry: true, waiting: todo.length, sample: todo.slice(0, 30).map(r => `${r.act_id} #${r.num}`) };
  const out = [];
  let added = 0;
  for (const r of todo.slice(0, limit)) {
    if (d.canAfford && !d.canAfford(40)) break;
    const res = await pullCard(env, d, r, { origin }).catch(e => ({ added: 0, why: [e.message] }));
    added += res.added || 0;
    if (!res.added) fails.add(r.id);
    out.push({ act: r.act_id, num: r.num, ...res });
  }
  await env.DB.prepare(`INSERT INTO settings (key, value) VALUES ('framePullFail', ?1) ON CONFLICT(key) DO UPDATE SET value = excluded.value`).bind(JSON.stringify([...fails].slice(-2000))).run().catch(() => {});
  return { cards: out.length, added, waiting: Math.max(0, todo.length - out.length), detail: out };
}

/* ================================================================================================================ */
/*  THE HOURLY TICK and the routes                                                                                   */
/* ================================================================================================================ */
export async function boardAutoTick(env, d, canAfford = () => true) {
  const out = {};
  /* settings.boardAuto: 'on' runs it every hour (switched on after the first dry run was checked); anything else = off */
  const on = (await env.DB.prepare(`SELECT value FROM settings WHERE key = 'boardAuto'`).first().catch(() => null))?.value;
  if (String(on || '').replace(/"/g, '') !== 'on') return { skipped: 'settings.boardAuto is not on' };
  out.delivery = await deliveryAll(env, d, { canAfford }).then(r => r.brands.map(b => ({ brand: b.brand || b.act, moved: b.moved, skipped: b.skipped, error: b.error }))).catch(e => ({ error: e.message }));
  if (canAfford(80)) out.format = await formatBriefs(env, { ...d, canAfford }, { limit: 15 }).catch(e => ({ error: e.message }));
  if (canAfford(200)) out.frame = await frameFiles(env, { ...d, canAfford }, { limit: 4, origin: env.AH_PUBLIC || 'https://mobius-account-health.mobius-digital.workers.dev' }).catch(e => ({ error: e.message }));
  return out;
}

/** Every 5 minutes: a small bite of the backlog (Asana briefs to lay out, Frame links to pull), so a backfill drains in
 *  a few hours without one long request. Same switch as the hourly tick. */
export async function boardBacklogTick(env, d) {
  const on = (await env.DB.prepare(`SELECT value FROM settings WHERE key = 'boardAuto'`).first().catch(() => null))?.value;
  if (String(on || '').replace(/"/g, '') !== 'on') return { skipped: true };
  const out = {};
  out.format = await formatBriefs(env, d, { limit: 4 }).catch(e => ({ error: e.message }));
  out.frame = await frameFiles(env, d, { limit: 1, origin: env.AH_PUBLIC || 'https://mobius-account-health.mobius-digital.workers.dev' }).catch(e => ({ error: e.message }));
  return out;
}

export async function autoRoutes(request, env, url, path, json, d) {
  const body = request.method === 'POST' ? await request.clone().json().catch(() => ({})) : {};
  const origin = url.origin;
  if (path === '/api/production/auto' && request.method === 'POST') return json(await deliveryAll(env, d, { act: body.act || null, dry: body.dry !== false }));
  if (path === '/api/production/format' && request.method === 'POST') return json(await formatBriefs(env, d, { act: body.act || null, ids: body.ids || null, limit: Math.min(40, +body.limit || 12), dry: !!body.dry }));
  if (path === '/api/production/frame-pull' && request.method === 'POST') return json(await frameFiles(env, d, { act: body.act || null, ids: body.ids || null, nums: body.nums || null, limit: Math.min(20, +body.limit || 6), dry: !!body.dry, origin, force: !!body.force }));
  if (path === '/api/production/frame-probe' && request.method === 'POST') return json(await frameFilesOf(env, d, String(body.url || '')).catch(e => ({ error: e.message })));
  if (path === '/api/production/auto/switch' && request.method === 'POST') {
    const v = body.on ? 'on' : 'off';
    await env.DB.prepare(`INSERT INTO settings (key, value) VALUES ('boardAuto', ?1) ON CONFLICT(key) DO UPDATE SET value = excluded.value`).bind(v).run();
    return json({ ok: true, boardAuto: v });
  }
  if (path === '/api/production/off' && request.method === 'GET') return json(await offLibrary(env, d, origin, { act: url.searchParams.get('act') || 'all', q: url.searchParams.get('q') || '', limit: url.searchParams.get('limit') }));
  return null;
}

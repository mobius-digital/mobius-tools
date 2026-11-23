/* THE CREATOR GRADUATE ENGINE: SUGGEST ONLY (built 2026-11-22, PR #315; made suggest-only the same night).
 *
 * Cole: "Locus doesn't need to do that automatically... whenever I go with you to go through Trybe and approve stuff,
 * you should just suggest it to me." So this file NEVER writes to Meta (no locusWrite, no copy_ad, no pause), never
 * posts to Slack and never adds Buyer list rows. It reads the creator campaign and stores what the SOP (memory
 * creator-graduate-sop) says to do; the /trybe and /buy reviews read GET /api/trybe/creator-moves and show each one as
 * a Yes/No row; a yes is applied by Claude through Locus meta_write in that review, like every other move.
 *
 * The SOP: one creator campaign per brand. A creator with 3+ approved ads LIVE at once gets their own ad set
 * "Creator | <Name>" at a small start budget; everyone else shares the pool set. The suggestions:
 *   graduate  a creator with 3+ live ads in the pool and no set of their own: make "Creator | <Name>" (start budget, ABO;
 *             no budget on a CBO campaign), copy their live pool ads in, pause the pool originals.
 *   keep      a creator set under 3 live but beating goal CPA (Triple Whale lastPlatformClick, 7 days): leave it.
 *   demote    a creator set under 3 live ads for `grace_days` straight days and NOT beating goal: copy its live ads into
 *             the pool, pause the originals and the set.
 *   pause     a creator set with 0 live ads: pause the set.
 *   load      an approved Trybe video (approved in the last 14 days) with no live ad in the campaign, when Meta already
 *             holds an ad for it anywhere in the account: copy it into the creator's set (or the pool). Also a pool ad of
 *             a creator who already has their own set. A video with no ad at all is listed as "build in Trybe".
 *   replace   a full set (`max_live`) takes a new video only in place of its weakest ad that is past the wait window
 *             (2x goal spent and 3+ days old) and not beating goal.
 *   raise     a creator set at or under goal CPA with 3+ sales in 7 days: +20% budget.
 * Matching an ad to a creator: the Trybe tag (trybe= in the ad name, `trybe_adid` / `&trybe=` in the creative's url tags
 * or link) -> p_trybe_sub.creator; else the creator's name at the front of the ad name ("JoshRutherford | ...") or in a
 * creator file name ("robertwilliams-fry_Carver02_111326_META"), which is how Lucky's own app names them; else the set.
 *
 * Modes per brand (settings `creatorEngine:<act>`): off | suggest. The daily tick (from 6am Central) plans every brand on
 * suggest; the route also plans on demand when today's plan is missing. Graduation DMs and Discord shout-outs are drafts.
 * No em dashes in anything this writes. */
import { gall, gget, metaActs, lastPause } from './metawrite.js';   // reads only: no write helper is imported here
import { ensureTrybe, trybeIdOf } from './trybe.js';

const ATTR = 'lastPlatformClick';
export const CE_DEFAULTS = { mode: 'off', campaign: '', pool: '', start_budget: 15, max_live: 8, grace_days: 7 };
export const MODES = ['off', 'suggest'];
export const GRADUATE_AT = 3, WAIT_DAYS = 3, LOAD_WINDOW = 14, RAISE_PCT = 0.2, RAISE_MIN_SALES = 3;
/* "Live" = switched on and delivering or about to (in Meta's review); a set made in the last NEW_SET_DAYS is never paused for being empty. */
const LIVEISH = new Set(['ACTIVE', 'PENDING_REVIEW', 'IN_PROCESS', 'PREAPPROVED']);
const NEW_SET_DAYS = 2;
const SET_RE =/^\s*(creator|ace|trybe)\s*\|\s*(.+?)\s*$/i;

const day = iso => String(iso || '').slice(0, 10);
const addDays = (d, n) => { const t = new Date(d + 'T12:00:00Z'); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10); };
const daysBetween = (a, b) => (a && b ? Math.round((Date.parse(b + 'T12:00:00Z') - Date.parse(a + 'T12:00:00Z')) / 864e5) : null);
const r2 = n => Math.round((+n || 0) * 100) / 100;
const noDash = s => String(s ?? '').replace(/\s*[—–]\s*/g, ', ');
const safeJson = (s, fb) => { try { return s ? JSON.parse(s) : fb; } catch { return fb; } };
const getSetting = async (env, k) => (await env.DB.prepare(`SELECT value FROM settings WHERE key = ?1`).bind(k).first().catch(() => null))?.value ?? null;
const putSetting = (env, k, v) => env.DB.prepare(`INSERT INTO settings (key, value) VALUES (?1, ?2) ON CONFLICT(key) DO UPDATE SET value = excluded.value`).bind(k, String(v)).run();

/* ---------- creators ---------- */
/** "Michael Kerr", "MichaelKerr", "michael-kerr" -> "michaelkerr". */
export const keyOf = s => String(s || '').toLowerCase().normalize('NFKD').replace(/[^a-z0-9]/g, '');
/** "JoshRutherford" -> "Josh Rutherford"; "robertwilliams-fry" -> "Robertwilliams Fry". */
export function nameOf(s) {
  s = String(s || '').trim();
  if (/\s/.test(s)) return s;
  return s.replace(/[-_.]+/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2').replace(/\b\w/g, c => c.toUpperCase()).trim();
}
/** Every Trybe id an ad carries: its name, then the creative's url tags and link. */
export function trybeTags(ad) {
  const out = new Set();
  const n = trybeIdOf(ad.name); if (n) out.add(n);
  const blob = JSON.stringify([ad.creative?.url_tags || '', ad.creative?.object_story_spec || '', ad.creative?.asset_feed_spec || '']);
  for (const m of blob.matchAll(/trybe(?:_adid)?(?:=|%3D)([0-9a-f][0-9a-f-]{7,35})/gi)) out.add(m[1].toLowerCase());
  return [...out];
}
/** The creator named by the ad's name, when there is no Trybe tag (Lucky's app names ads this way). */
export function creatorFromName(name) {
  const s = String(name || '');
  const head = s.split('|')[0].trim();
  if (s.includes('|') && /^[A-Za-z][A-Za-z.'-]{3,40}$/.test(head) && /[a-z][A-Z]|^[A-Z][a-z]+$/.test(head)) return head;
  const f = /(?:^|[\s|])([A-Za-z][A-Za-z.'-]{2,40})_[A-Za-z0-9]+_\d{6}/.exec(s);
  return f ? f[1] : null;
}
/** The creator a set belongs to ("Creator | Josh Rutherford", "Ace | Jett Slepak", "Trybe | Kelly Starling"), or null. */
export function creatorOfSet(name) {
  const m = SET_RE.exec(String(name || ''));
  if (!m || /^\d/.test(m[2])) return null;   // "Trybe | 11/04" is a dated batch, not a creator
  return m[2];
}

/* ---------- settings ---------- */
/** Old 'dry' / 'live' values (PR #315) read as 'suggest': nothing here can act any more. */
const modeOf = m => (m === 'off' || !m ? 'off' : 'suggest');
export async function readCfg(env, act) { const c = { ...CE_DEFAULTS, ...(safeJson(await getSetting(env, `creatorEngine:${act}`), {}) || {}) }; c.mode = modeOf(c.mode); return c; }
export async function saveCfg(env, act, b) {
  const cur = await readCfg(env, act);
  const num = (v, lo, hi, fb) => { const n = +v; return Number.isFinite(n) && n >= lo && n <= hi ? n : fb; };
  const next = {
    mode: MODES.includes(b.mode) ? b.mode : cur.mode,
    campaign: b.campaign != null ? String(b.campaign).replace(/\D/g, '') : cur.campaign,
    pool: b.pool != null ? String(b.pool).replace(/\D/g, '') : cur.pool,
    start_budget: num(b.start_budget ?? cur.start_budget, 5, 500, 15),
    max_live: Math.round(num(b.max_live ?? cur.max_live, 3, 50, 8)),
    grace_days: Math.round(num(b.grace_days ?? cur.grace_days, 1, 60, 7)),
  };
  if (next.mode !== 'off' && !next.campaign) throw new Error('Give the creator campaign id first.');
  await putSetting(env, `creatorEngine:${act}`, JSON.stringify(next));
  return next;
}
const stateKey = act => `creatorEngineState:${act}`;
const runKey = act => `creatorEngineRun:${act}`;

/* ---------- reading ---------- */
async function goalOf(env, act) {
  const r = await env.DB.prepare(`SELECT target_cpa FROM brands WHERE id = ?1`).bind(act).first().catch(() => null);
  return +r?.target_cpa > 0 ? +r.target_cpa : null;
}
/** Spend (Meta) and sales (Triple Whale) per ad: last 7 days and since `from60`. */
async function numbers(env, act, ids, today) {
  const out = new Map(); if (!ids.length) return out;
  const metas = (await metaActs(env, act)).map(m => m.act);
  const acts = [...new Set([act, ...metas])];
  const f7 = addDays(today, -7), f60 = addDays(today, -60);
  const g = id => { let x = out.get(id); if (!x) { x = { s7: 0, o7: 0, v7: 0, s60: 0, o60: 0 }; out.set(id, x); } return x; };
  for (let i = 0; i < ids.length; i += 60) {
    const ch = ids.slice(i, i + 60), ph = ch.map((_, j) => `?${j + 3}`).join(',');
    const aph = acts.map((_, j) => `?${ch.length + 3 + j}`).join(',');
    const sp = (await env.DB.prepare(`SELECT ad_id, SUM(CASE WHEN date >= ?1 AND date < ?2 THEN spend ELSE 0 END) AS s7, SUM(spend) AS s60 FROM ad_daily WHERE date >= ?${ch.length + 3 + acts.length} AND ad_id IN (${ph}) AND act_id IN (${aph}) GROUP BY ad_id`)
      .bind(f7, today, ...ch, ...acts, f60).all().catch(() => ({ results: [] }))).results || [];
    const tw = (await env.DB.prepare(`SELECT ad_id, SUM(CASE WHEN date >= ?1 AND date < ?2 THEN orders ELSE 0 END) AS o7, SUM(CASE WHEN date >= ?1 AND date < ?2 THEN revenue ELSE 0 END) AS v7, SUM(orders) AS o60 FROM tw_ad_attr WHERE model = ?${ch.length + 3} AND act_id = ?${ch.length + 4} AND date >= ?${ch.length + 5} AND ad_id IN (${ph}) GROUP BY ad_id`)
      .bind(f7, today, ...ch, ATTR, act, f60).all().catch(() => ({ results: [] }))).results || [];
    for (const r of sp) { const x = g(String(r.ad_id)); x.s7 = +r.s7 || 0; x.s60 = +r.s60 || 0; }
    for (const r of tw) { const x = g(String(r.ad_id)); x.o7 = +r.o7 || 0; x.v7 = +r.v7 || 0; x.o60 = +r.o60 || 0; }
  }
  return out;
}

/** The plan for one brand: what the rules say to do today. Reads Meta (2 to 3 calls) and D1. Writes nothing. */
export async function planBrand(env, d, act, { today, cfg } = {}) {
  today = today || (d.centralDate ? d.centralDate() : new Date().toISOString().slice(0, 10));
  cfg = cfg || await readCfg(env, act);
  if (!cfg.campaign) return { act, error: 'No creator campaign set for this brand.' };
  const goal = await goalOf(env, act);
  const camp = await gget(d, env, cfg.campaign, { fields: 'id,name,status,effective_status,daily_budget,lifetime_budget,account_id' });
  const cbo = +camp.daily_budget > 0 || +camp.lifetime_budget > 0;
  const metas = await metaActs(env, act);
  if (!metas.some(m => m.act === `act_${camp.account_id}`)) return { act, error: `Campaign ${cfg.campaign} is not in this brand's Meta account.` };
  const [sets, ads] = await Promise.all([
    gall(d, env, `${cfg.campaign}/adsets`, { fields: 'id,name,status,effective_status,daily_budget,created_time', limit: '200' }, 3),
    gall(d, env, `${cfg.campaign}/ads`, { fields: 'id,name,status,effective_status,adset_id,created_time,creative{id,url_tags,object_story_spec}', limit: '100' }, 6),
  ]);
  /* Trybe: who made each video, and the approved ones waiting for a load. */
  await ensureTrybe(env).catch(() => {});
  const subs = (await env.DB.prepare(`SELECT sub_id, trybe_id, creator_id, creator, status, approved_seen, created_at FROM p_trybe_sub WHERE act_id = ?1`).bind(act).all().catch(() => ({ results: [] }))).results || [];
  const subBy = new Map();
  for (const s of subs) { if (s.trybe_id) subBy.set(String(s.trybe_id).toLowerCase(), s); subBy.set(String(s.sub_id).toLowerCase(), s); }
  const subOf = tags => { for (const t of tags) { const s = subBy.get(t) || subBy.get(t.slice(0, 8)); if (s) return s; } return null; };

  const pool = sets.find(s => String(s.id) === String(cfg.pool)) || null;
  const setInfo = new Map(sets.map(s => [String(s.id), { id: String(s.id), name: s.name, status: s.status, eff: s.effective_status, budget: +s.daily_budget > 0 ? +s.daily_budget / 100 : null,
    created: day(s.created_time), pool: pool && String(s.id) === String(pool.id), creator: pool && String(s.id) === String(pool.id) ? null : creatorOfSet(s.name) }]));
  const nums = await numbers(env, act, ads.map(a => String(a.id)), today);
  const rows = ads.map(a => {
    const tags = trybeTags(a), sub = subOf(tags), set = setInfo.get(String(a.adset_id)) || {};
    const who = sub?.creator || creatorFromName(a.name) || set.creator || null;
    const n = nums.get(String(a.id)) || { s7: 0, o7: 0, v7: 0, s60: 0, o60: 0 };
    const age = daysBetween(day(a.created_time), today) ?? 0;
    return { id: String(a.id), name: a.name, adset: String(a.adset_id), set_name: set.name || '', live: a.status === 'ACTIVE' && LIVEISH.has(a.effective_status), status: a.status, eff: a.effective_status,
      trybe: tags[0] || null, sub: sub?.sub_id || null, creator: who ? nameOf(who) : null, key: who ? keyOf(who) : null, age, ...n,
      past_wait: goal ? n.s60 >= 2 * goal && age >= WAIT_DAYS : false, beating: goal ? n.o60 > 0 && n.s60 / n.o60 <= goal : false };
  });

  const state = safeJson(await getSetting(env, stateKey(act)), {}) || {};
  state.sets = state.sets || {};
  const moves = [], keeps = [], notes = [], proposals = [], drafts = [], builds = [];
  const ownSet = new Map();   // creator key -> set
  for (const s of setInfo.values()) if (s.creator && s.status !== 'DELETED' && s.status !== 'ARCHIVED') { const k = keyOf(s.creator); if (!ownSet.has(k) || s.status === 'ACTIVE') ownSet.set(k, s); }
  const liveIn = sid => rows.filter(r => r.adset === sid && r.live);
  const setPerf = sid => { const xs = rows.filter(r => r.adset === sid); const s7 = xs.reduce((a, r) => a + r.s7, 0), o7 = xs.reduce((a, r) => a + r.o7, 0), v7 = xs.reduce((a, r) => a + r.v7, 0); return { s7: r2(s7), o7: r2(o7), v7: r2(v7), cpa: o7 > 0 ? r2(s7 / o7) : null }; };
  const beatsGoal = p => !!(goal && p.o7 > 0 && p.s7 / p.o7 <= goal);
  const nextState = { sets: {} };

  /* 1. Creator sets: keep, demote, pause, propose. */
  const setView = [];
  for (const s of setInfo.values()) {
    if (!s.creator || s.status !== 'ACTIVE') continue;
    const live = liveIn(s.id), p = setPerf(s.id), beats = beatsGoal(p);
    const prev = state.sets[s.id] || {};
    const under = live.length < GRADUATE_AT;
    const since = under ? (prev.under3_since || today) : null;
    const underDays = since ? daysBetween(since, today) : 0;
    nextState.sets[s.id] = { creator: s.creator, ...(since ? { under3_since: since } : {}) };
    const v = { id: s.id, name: s.name, creator: s.creator, live: live.length, budget: s.budget, ...p, beats, under_days: underDays, verdict: 'ok' };
    const young = (daysBetween(s.created, today) ?? 99) < NEW_SET_DAYS;
    if (!live.length && young) v.verdict = `new set, no live ads yet (left alone for ${NEW_SET_DAYS} days)`;
    else if (!live.length) {
      v.verdict = 'pause';
      moves.push({ kind: 'pause_set', set: s.id, set_name: s.name, creator: s.creator, why: `${s.name} has no live ads left.`, client_why: `We paused ${s.creator}'s ad set because none of their videos are running in it now.` });
    } else if (under && beats) {
      v.verdict = 'keep';
      keeps.push({ set: s.id, set_name: s.name, creator: s.creator, why: `${live.length} live, but ${p.o7} sales at $${p.cpa} in 7 days beats the $${goal} goal. Ask ${s.creator.split(' ')[0]} for more videos.` });
    } else if (under && underDays >= cfg.grace_days) {
      v.verdict = 'demote';
      if (!pool) notes.push(`${s.name} should go back to the pool (under ${GRADUATE_AT} live for ${underDays} days, not beating goal), but no pool ad set is set for this brand.`);
      else {
        for (const r of live) moves.push({ kind: 'move', ad: r.id, ad_name: r.name, from: s.id, to: String(pool.id), to_name: pool.name, creator: s.creator, why: `Back to the pool: ${s.name} ran under ${GRADUATE_AT} live ads for ${underDays} days and is not beating goal.`, client_why: `${s.creator}'s videos moved back into the shared creator ad set; they had fewer than ${GRADUATE_AT} videos running for a week.` });
        moves.push({ kind: 'pause_set', set: s.id, set_name: s.name, creator: s.creator, after_moves: true, why: `Demoted: ${live.length} live for ${underDays} days, ${p.o7} sales in 7 days.`, client_why: `We paused ${s.creator}'s own ad set and moved their videos back into the shared set until they have ${GRADUATE_AT} running again.` });
        drafts.push({ kind: 'demote_dm', creator: s.creator, text: noDash(`Hey ${s.creator.split(' ')[0]}, quick heads up: your videos moved back into our shared creator ad set for now because fewer than ${GRADUATE_AT} of them are running. Send us a few new ones and you get your own set back. Same commission either way.`) });
      }
    } else if (under) v.verdict = `under ${GRADUATE_AT}, day ${underDays} of ${cfg.grace_days}`;
    if (beats && p.o7 >= RAISE_MIN_SALES && s.budget && !cbo) {
      const to = Math.round(s.budget * (1 + RAISE_PCT) * 100) / 100;
      proposals.push({ set: s.id, set_name: s.name, creator: s.creator, from: s.budget, to, sales: p.o7, cpa: p.cpa, spend: p.s7, goal,
        why: `${p.o7} sales at $${p.cpa} each in 7 days, goal $${goal}. +${Math.round(RAISE_PCT * 100)}%: $${s.budget} to $${to} a day.` });
    }
    setView.push(v);
  }

  /* 2. Graduate: 3+ live in the pool, no live set of their own. */
  const grads = [];
  const poolBy = new Map();   // creator key -> their live pool ads (not graduating today)
  if (pool) {
    const byCreator = new Map();
    for (const r of rows) if (r.adset === String(pool.id) && r.live && r.key) { const g = byCreator.get(r.key) || { name: r.creator, ads: [] }; g.ads.push(r); byCreator.set(r.key, g); }
    for (const [k, g] of byCreator) {
      if (!(ownSet.get(k)?.status === 'ACTIVE') && g.ads.length < GRADUATE_AT) poolBy.set(k, g);
      const own = ownSet.get(k);
      if (own && own.status === 'ACTIVE') {
        /* already graduated: their new pool ads belong in their own set (rule 2), up to the cap */
        const room = Math.max(0, cfg.max_live - liveIn(own.id).length);
        for (const r of g.ads.slice(0, room)) moves.push({ kind: 'move', ad: r.id, ad_name: r.name, from: String(pool.id), to: own.id, to_name: own.name, creator: g.name, why: `${g.name} has their own set; this ad was still in the pool.`, client_why: `Moved ${g.name}'s video into their own ad set.` });
        continue;
      }
      if (g.ads.length < GRADUATE_AT) continue;
      const ads = g.ads.sort((a, b) => b.o7 - a.o7 || b.s7 - a.s7).slice(0, cfg.max_live);
      const setName = `Creator | ${g.name}`;
      grads.push({ creator: g.name, key: k, set_name: setName, ads: ads.map(a => a.id) });
      moves.push({ kind: 'graduate', creator: g.name, set_name: setName, reuse: own ? own.id : null, budget: cbo ? null : cfg.start_budget, ads: ads.map(a => ({ id: a.id, name: a.name, src: 'pool' })),
        why: `${g.name} has ${g.ads.length} approved videos live at once in the pool.`, client_why: `${g.name} now has ${GRADUATE_AT}+ videos running, so they get their own ad set${cbo ? '' : ` at $${cfg.start_budget} a day`}.` });
      drafts.push({ kind: 'graduate_dm', creator: g.name, text: noDash(`Hey ${g.name.split(' ')[0]}! Big news: ${g.ads.length} of your videos are running at the same time, so you just got your own ad set with its own spend behind it. Keep them coming: every approved video goes straight into your set, and the more that run, the more you earn.`) });
      drafts.push({ kind: 'discord', creator: g.name, text: noDash(`Shout out to ${g.name}! ${g.ads.length} videos running at once means ${g.name.split(' ')[0]} just got their own ad set. That is the bar: 3 approved videos live at the same time and you graduate. Who is next?`) });
    }
  } else notes.push('No pool ad set is set, so nobody can graduate from it.');

  /* 3. Load approved videos (approved in the last LOAD_WINDOW days) with no live ad in the campaign. */
  const liveSubs = new Set(rows.filter(r => r.live && r.sub).map(r => r.sub));
  const fresh = subs.filter(s => s.status === 'approved' && day(s.approved_seen) >= addDays(today, -LOAD_WINDOW) && !liveSubs.has(s.sub_id));
  if (fresh.length) {
    const known = (await env.DB.prepare(`SELECT ad_id, trybe_id, name, status, adset_id FROM p_trybe_ad WHERE act_id = ?1`).bind(act).all().catch(() => ({ results: [] }))).results || [];
    const adOf = new Map(); for (const k of known) { const t = String(k.trybe_id || '').toLowerCase(); if (t && !adOf.has(t)) adOf.set(t, k); }
    const orphans = new Map();   // no own set and no pool (Ice & Gold runs without one): graduate on 3+, else wait
    const planned = new Map();   // set id -> live count after today's moves
    const countFor = sid => planned.has(sid) ? planned.get(sid) : liveIn(sid).length;
    for (const s of fresh) {
      const src = adOf.get(String(s.trybe_id || '').toLowerCase());
      const waited = daysBetween(day(s.approved_seen), today) ?? 0;
      if (!src) { builds.push({ sub: s.sub_id, creator: s.creator, days: waited, late: waited >= WAIT_DAYS }); continue; }
      const k = keyOf(s.creator), own = ownSet.get(k), grad = grads.find(g => g.key === k);
      if (grad) continue;   // its pool ads move with the graduation; a brand new video waits a day for the new set's id
      /* Never bring back an ad a person (or a rule) took off: in this campaign already, or paused in the last 14 days. */
      if (setInfo.has(String(src.adset_id))) { notes.push(`${s.creator}: video ${s.trybe_id} was already in the creator campaign and is off now, so it stays off.`); continue; }
      const held = await lastPause(env, String(src.ad_id)).catch(() => null);
      if (held) { notes.push(`${s.creator}: video ${s.trybe_id} was paused by ${held.by} on ${day(held.at)}, so Locus does not bring it back.`); continue; }
      /* No set of their own: decided below with their pool ads (3+ together = graduate today, else the pool). */
      if (!(own && own.status === 'ACTIVE')) { const o = orphans.get(k) || { name: s.creator, ads: [], waited }; o.ads.push({ id: String(src.ad_id), name: src.name, src: 'new' }); orphans.set(k, o); continue; }
      const target = own;
      const tid = String(target.id);
      if (String(src.adset_id) === tid) continue;
      let replace = null;
      if (countFor(tid) >= cfg.max_live) {
        const cand = liveIn(tid).filter(r => r.past_wait && !r.beating).sort((a, b) => (b.o60 ? b.s60 / b.o60 : 1e9) - (a.o60 ? a.s60 / a.o60 : 1e9) || b.s60 - a.s60)[0];
        if (!cand) { notes.push(`${target.name} is full (${cfg.max_live}) and no ad there is past its wait window and missing goal, so ${s.creator}'s new video waits.`); continue; }
        replace = cand;
      }
      moves.push({ kind: 'load', ad: String(src.ad_id), ad_name: src.name, to: tid, to_name: target.name, creator: s.creator, replace: replace ? { id: replace.id, name: replace.name, spend: r2(replace.s60), sales: replace.o60 } : null,
        why: `Approved ${waited} day${waited === 1 ? '' : 's'} ago, not live in the creator campaign.${replace ? ` The set is full: it replaces "${replace.name}" ($${r2(replace.s60)} spent, ${replace.o60} sales, past its wait window).` : ''}`,
        client_why: `Put ${s.creator}'s newly approved video live${replace ? ' in place of their weakest one' : ''}.` });
      if (!replace) planned.set(tid, countFor(tid) + 1);
    }
    for (const [k, o] of orphans) {
      const inPool = (poolBy.get(k)?.ads || []).map(r => ({ id: r.id, name: r.name, src: 'pool' }));
      const total = inPool.length + o.ads.length;
      if (total < GRADUATE_AT) {
        if (!pool) { notes.push(`${o.name}: ${o.ads.length} approved video${o.ads.length === 1 ? '' : 's'} waiting, no pool set to load into. ${GRADUATE_AT} gets them their own set.`); continue; }
        for (const a of o.ads) moves.push({ kind: 'load', ad: a.id, ad_name: a.name, to: String(pool.id), to_name: pool.name, creator: o.name, replace: null,
          why: `Approved ${o.waited} day${o.waited === 1 ? '' : 's'} ago, not live in the creator campaign. Into the pool (${total} of ${GRADUATE_AT} for their own set).`, client_why: `Put ${o.name}'s newly approved video live in the shared creator ad set.` });
        continue;
      }
      const own = ownSet.get(k), setName = `Creator | ${o.name}`, ads = [...inPool, ...o.ads].slice(0, cfg.max_live);
      grads.push({ creator: o.name, key: k, set_name: setName, ads: ads.map(a => a.id) });
      moves.push({ kind: 'graduate', creator: o.name, set_name: setName, reuse: own ? own.id : null, budget: cbo ? null : cfg.start_budget, ads, from_elsewhere: true,
        why: `${o.name} has ${total} approved videos (${inPool.length} live in the pool, ${o.ads.length} newly approved) and no set of their own.`, client_why: `${o.name} has ${GRADUATE_AT}+ approved videos, so they get their own ad set${cbo ? '' : ` at $${cfg.start_budget} a day`}.` });
      drafts.push({ kind: 'graduate_dm', creator: o.name, text: noDash(`Hey ${o.name.split(' ')[0]}! ${o.ads.length} of your videos were approved, so you just got your own ad set with its own spend behind it. Keep them coming: every approved video goes straight into your set, and the more that run, the more you earn.`) });
      drafts.push({ kind: 'discord', creator: o.name, text: noDash(`Shout out to ${o.name}! ${o.ads.length} approved videos means ${o.name.split(' ')[0]} just got their own ad set. That is the bar: 3 approved videos running and you graduate. Who is next?`) });
    }
  }
  return { act, today, goal, cbo, campaign: { id: String(camp.id), name: camp.name, status: camp.effective_status }, pool: pool ? { id: String(pool.id), name: pool.name, live: liveIn(String(pool.id)).length } : null,
    cfg, counts: { ads: rows.length, live: rows.filter(r => r.live).length, tagged: rows.filter(r => r.creator).length, untagged: rows.filter(r => r.live && !r.creator).map(r => r.name).slice(0, 10) },
    sets: setView, moves, keeps, proposals, drafts, builds, notes, nextState };
}

/* ---------- suggestions: the plan as one flat list the reviews read ---------- */
/** One row per suggestion: {id, kind, creator, reason, set_id, set_name, ad_ids, ...}. Kinds: graduate, keep, demote,
 *  pause, load, replace, raise. `client_why` is the plain line to send with the meta_write when Cole says yes. */
export function suggestionsOf(plan) {
  const out = [], moves = plan.moves || [];
  const sid = (k, ...p) => `${k}:${p.filter(Boolean).join(':')}`;
  const demoted = new Set(moves.filter(m => m.kind === 'pause_set' && m.after_moves).map(m => m.set));
  for (const m of moves) {
    if (m.kind === 'graduate') out.push({ id: sid('graduate', keyOf(m.creator)), kind: 'graduate', creator: m.creator, reason: m.why,
      set_id: m.reuse || null, set_name: m.set_name, from_set_id: plan.pool?.id || null, budget: m.budget,
      ad_ids: m.ads.map(a => a.id), ads: m.ads, client_why: m.client_why });
    else if (m.kind === 'pause_set' && m.after_moves) {
      const ads = moves.filter(x => x.kind === 'move' && x.from === m.set);
      out.push({ id: sid('demote', m.set), kind: 'demote', creator: m.creator, reason: m.why, set_id: m.set, set_name: m.set_name,
        to_set_id: ads[0]?.to || plan.pool?.id || null, to_set_name: ads[0]?.to_name || plan.pool?.name || null,
        ad_ids: ads.map(x => x.ad), ads: ads.map(x => ({ id: x.ad, name: x.ad_name })), client_why: m.client_why });
    } else if (m.kind === 'pause_set') out.push({ id: sid('pause', m.set), kind: 'pause', creator: m.creator, reason: m.why, set_id: m.set, set_name: m.set_name, ad_ids: [], client_why: m.client_why });
    else if (m.kind === 'move' && !demoted.has(m.from)) out.push({ id: sid('load', m.ad, m.to), kind: 'load', creator: m.creator, reason: m.why,
      set_id: m.to, set_name: m.to_name, from_set_id: m.from, ad_ids: [m.ad], ads: [{ id: m.ad, name: m.ad_name }], client_why: m.client_why });
    else if (m.kind === 'load') out.push({ id: sid(m.replace ? 'replace' : 'load', m.ad, m.to), kind: m.replace ? 'replace' : 'load', creator: m.creator, reason: m.why,
      set_id: m.to, set_name: m.to_name, ad_ids: [m.ad], ads: [{ id: m.ad, name: m.ad_name }], ...(m.replace ? { pause_ad_id: m.replace.id, pause_ad_name: m.replace.name } : {}), client_why: m.client_why });
  }
  for (const k of plan.keeps || []) out.push({ id: sid('keep', k.set), kind: 'keep', creator: k.creator, reason: k.why, set_id: k.set, set_name: k.set_name, ad_ids: [] });
  for (const p of plan.proposals || []) out.push({ id: sid('raise', p.set), kind: 'raise', creator: p.creator, reason: p.why, set_id: p.set, set_name: p.set_name, ad_ids: [],
    budget_from: p.from, budget_to: p.to, client_why: `${p.creator}'s ad set is selling at or under goal, so it gets a bit more budget.` });
  return out.map(x => ({ ...x, reason: noDash(x.reason), ...(x.client_why ? { client_why: noDash(x.client_why) } : {}) }));
}

/** Plan one brand and store it. Writes only Locus settings (the plan and the under-3 clock), never Meta or Slack. */
export async function runBrand(env, d, act, { today, cfg } = {}) {
  const plan = await planBrand(env, d, act, { today, cfg });
  const at = new Date().toISOString();
  if (plan.error) { const out = { ...plan, today, at, suggestions: [] }; await putSetting(env, runKey(act), JSON.stringify(out)); return out; }
  await putSetting(env, stateKey(act), JSON.stringify(plan.nextState));
  const out = { ...plan, nextState: undefined, at, suggestions: suggestionsOf(plan) };
  await putSetting(env, runKey(act), JSON.stringify(out));
  return out;
}

/* ---------- the daily tick: plan every brand on suggest, nothing else ---------- */
export async function creatorEngineTick(env, d, { force = false } = {}) {
  const today = d.centralDate();
  if (!force && (await getSetting(env, 'creatorEngineDay')) === today) return { skipped: 'done today' };
  if (!force && d.centralHour && d.centralHour() < 6) return { skipped: 'before 6am' };
  const rows = ((await env.DB.prepare(`SELECT key, value FROM settings WHERE key LIKE 'creatorEngine:%'`).all().catch(() => ({ results: [] }))).results || [])
    .map(r => { const cfg = { ...CE_DEFAULTS, ...(safeJson(r.value, {}) || {}) }; return { act: r.key.slice('creatorEngine:'.length), cfg: { ...cfg, mode: modeOf(cfg.mode) } }; })
    .filter(x => x.cfg.mode === 'suggest' && x.cfg.campaign);
  const out = { ran: [], errors: [] };
  for (const { act, cfg } of rows) {
    if (d.canAfford && !d.canAfford(60)) { out.errors.push('out of calls for this run'); break; }
    try { const r = await runBrand(env, d, act, { today, cfg }); out.ran.push({ act, suggestions: (r.suggestions || []).length, error: r.error || null }); }
    catch (e) { out.errors.push(`${act}: ${e.message}`); }
  }
  await putSetting(env, 'creatorEngineDay', today);
  return out;
}

/* ---------- routes ---------- */
export async function handleCreatorEngine(request, env, url, path, json, h) {
  if (!/^\/api\/creator-engine(\/|$)/.test(path) && path !== '/api/trybe/creator-moves') return null;
  if (!(await h.isAdmin(request, env))) return json({ error: 'unauthorized' }, 401);
  if (h.isClient && h.isClient(request)) return json({ error: 'That part is the Mobius team\'s.' }, 403);
  const email = await h.sessionEmail(env, request).catch(() => null);
  const only = await h.brandsFor(env, email).catch(() => null);
  const b = request.method === 'GET' ? {} : await request.json().catch(() => ({}));
  const act = (await h.resolveBrandId(env, String(b.act || url.searchParams.get('act') || '')).catch(() => '')) || '';
  if (path === '/api/creator-engine/all' && request.method === 'GET') {
    const rows = ((await env.DB.prepare(`SELECT key, value FROM settings WHERE key LIKE 'creatorEngine:%'`).all().catch(() => ({ results: [] }))).results || []);
    const out = [];
    for (const r of rows) {
      const a = r.key.slice('creatorEngine:'.length); if (only && !only.has(a)) continue;
      const run = safeJson(await getSetting(env, runKey(a)), null), cfg = safeJson(r.value, {}) || {};
      out.push({ act: a, cfg: { ...cfg, mode: modeOf(cfg.mode) }, run: run ? { at: run.at, suggestions: (run.suggestions || []).length, error: run.error || null } : null });
    }
    return json({ brands: out });
  }
  if (!act) return json({ error: 'Pick a brand.' }, 400);
  if (only && !only.has(act)) return json({ error: 'You do not have access to this brand.' }, 403);
  try {
    /* The reviews' read (/trybe, /buy): today's suggestions for one brand. Plans now (read only) when today's plan is
       missing or `fresh=1`; a brand with no creator campaign id answers with that and no rows. */
    if (path === '/api/trybe/creator-moves' && request.method === 'GET') {
      const cfg = await readCfg(env, act);
      if (!cfg.campaign) return json({ act, mode: cfg.mode, suggestions: [], note: 'No creator campaign id set for this brand (Ads > Trybe > Creator sets).' });
      const today = h.deps.centralDate ? h.deps.centralDate() : new Date().toISOString().slice(0, 10);
      let run = safeJson(await getSetting(env, runKey(act)), null);
      if (url.searchParams.get('fresh') === '1' || !run || run.today !== today || !Array.isArray(run.suggestions)) run = await runBrand(env, h.deps, act, { today, cfg });
      return json({ act, mode: cfg.mode, at: run.at, today: run.today || today, goal: run.goal ?? null, error: run.error || null,
        campaign: run.campaign || null, pool: run.pool || null, suggestions: run.suggestions || [], builds: run.builds || [], drafts: run.drafts || [], notes: run.notes || [],
        how: 'Suggestions only: Locus changed nothing. Show each as a Yes/No row; on a yes apply it with Locus meta_write (a move = copy the ad, then pause the original) with client_why.' });
    }
    if (path === '/api/creator-engine' && request.method === 'GET') return json({ act, cfg: await readCfg(env, act), run: safeJson(await getSetting(env, runKey(act)), null), rules: { graduate_at: GRADUATE_AT, wait_days: WAIT_DAYS, load_window: LOAD_WINDOW, raise_pct: RAISE_PCT } });
    if (path === '/api/creator-engine' && request.method === 'PUT') return json({ ok: true, cfg: await saveCfg(env, act, b) });
    /* Plan now: read only, always. */
    if (path === '/api/creator-engine/run' && request.method === 'POST') {
      const cfg = await readCfg(env, act);
      return json(await runBrand(env, h.deps, act, { today: h.deps.centralDate ? h.deps.centralDate() : undefined, cfg: { ...cfg, ...(b.campaign ? { campaign: String(b.campaign) } : {}), ...(b.pool ? { pool: String(b.pool) } : {}) } }));
    }
    return json({ error: 'not found' }, 404);
  } catch (e) { return json({ error: e.message }, 400); }
}

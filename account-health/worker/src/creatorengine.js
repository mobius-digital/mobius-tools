/* THE CREATOR GRADUATE ENGINE (2026-11-22, Cole: "how do we do this to where it's automatic, and does Locus understand it?")
 *
 * The SOP (memory creator-graduate-sop): one creator campaign per brand. A creator with 3+ approved ads LIVE at once gets
 * their own ad set "Creator | <Name>" at a small start budget; everyone else shares the pool set. Once a day, per brand
 * that is switched on, this file reads the campaign live from Meta and:
 *   graduate  a creator with 3+ live ads in the pool and no set of their own: make "Creator | <Name>" (start budget, ABO;
 *             no budget on a CBO campaign), turn it on, copy their live pool ads in, pause the pool originals.
 *   keep      a creator set beating goal CPA (Triple Whale lastPlatformClick, 7 days) stays at any count.
 *   demote    a creator set under 3 live ads for `grace_days` straight days and NOT beating goal: copy its live ads into
 *             the pool, pause the originals and the set.
 *   pause     a creator set with 0 live ads: pause the set.
 *   load      an approved Trybe video (approved in the last 14 days) with no live ad in the campaign: when Meta already
 *             holds an ad for it anywhere in the account, copy that ad into the creator's set (or the pool). A video with
 *             no ad at all cannot be built here (copy, landing page, partnership): it is listed as "build in Trybe".
 *   replace   a full set (`max_live`) gets a new video only by pausing its weakest ad that is past the wait window
 *             (2x goal spent and 3+ days old) and not beating goal.
 *   propose   a creator set at or under goal CPA with 3+ sales in 7 days: +20% budget, as a Buyer list row. NEVER applied.
 * Matching an ad to a creator: the Trybe tag (trybe= in the ad name, `trybe_adid` / `&trybe=` in the creative's url tags
 * or link) -> p_trybe_sub.creator; else the creator's name at the front of the ad name ("JoshRutherford | ...") or in a
 * creator file name ("robertwilliams-fry_Carver02_111326_META"), which is how Lucky's own app names them; else the set.
 *
 * Meta cannot move an ad between ad sets, so a move = meta_copy_ad (same creative and post, Trybe tags ride on the
 * creative) then meta_pause on the original. Every write goes through metawrite.js locusWrite: the same path as
 * Locus's own screens and meta_write, so each lands in the Change Log with a client_why and undo (24h).
 *
 * Modes per brand (settings `creatorEngine:<act>`): off | dry (plans and stores the plan, writes nothing, posts nothing)
 * | live. The daily tick runs from 6am Central. Slack: ONE post per brand per day in its internal channel, only when
 * something moved (live mode). Graduation DMs and Discord shout-outs are DRAFTS in the run, never posted.
 * No em dashes in anything this writes. */
import { gall, gget, metaActs, locusWrite, lastPause } from './metawrite.js';
import { ensureTrybe, trybeIdOf } from './trybe.js';

const ATTR = 'lastPlatformClick';
const WHO = 'Locus (creator engine)';
export const CE_DEFAULTS = { mode: 'off', campaign: '', pool: '', start_budget: 15, max_live: 8, grace_days: 7 };
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
export async function readCfg(env, act) { return { ...CE_DEFAULTS, ...(safeJson(await getSetting(env, `creatorEngine:${act}`), {}) || {}) }; }
export async function saveCfg(env, act, b) {
  const cur = await readCfg(env, act);
  const num = (v, lo, hi, fb) => { const n = +v; return Number.isFinite(n) && n >= lo && n <= hi ? n : fb; };
  const next = {
    mode: ['off', 'dry', 'live'].includes(b.mode) ? b.mode : cur.mode,
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

/* ---------- doing ---------- */
async function write(env, d, act, b) {
  return locusWrite(env, d, { act, by: WHO, reason: noDash(b.reason || 'Creator engine'), client_why: noDash(b.client_why || ''), ...b }, { who: WHO });
}
/** Apply a plan (live) or return it as is (dry). Each step's result is kept on the move. */
export async function runBrand(env, d, act, { dry = true, today, cfg } = {}) {
  const plan = await planBrand(env, d, act, { today, cfg });
  if (plan.error) { await putSetting(env, runKey(act), JSON.stringify({ ...plan, at: new Date().toISOString(), dry })); return plan; }
  const done = [];
  if (!dry) {
    for (const m of plan.moves) {
      if (d.canAfford && !d.canAfford(25)) { m.result = { error: 'Out of calls this run; it goes tomorrow.' }; continue; }
      try { m.result = await doMove(env, d, act, plan, m); } catch (e) { m.result = { error: e.message }; }
      if (m.result && !m.result.error) done.push(m);
    }
  }
  await putSetting(env, stateKey(act), JSON.stringify(plan.nextState));
  const out = { ...plan, nextState: undefined, at: new Date().toISOString(), dry, applied: done.length, failed: plan.moves.filter(m => m.result?.error).length };
  await putSetting(env, runKey(act), JSON.stringify(out));
  return out;
}
async function move(env, d, act, ad, to, reason, client_why) {
  const c = await write(env, d, act, { kind: 'copy_ad', object: ad, adset: to, level: 'ad', reason, client_why });
  if (c.error) return { error: `Copy: ${c.error}` };
  const p = await write(env, d, act, { kind: 'pause', object: ad, level: 'ad', reason: `${reason} (the copy is ${c.created})`, client_why });
  const fine = p.error && /already PAUSED/i.test(p.error);
  return { copy: c.created, writes: [c.write, p.write].filter(Boolean), ...(p.error && !fine ? { warn: `Copied, but the original did not pause: ${p.error}` } : {}) };
}
async function doMove(env, d, act, plan, m) {
  if (m.kind === 'pause_set') {
    if (m.after_moves && plan.moves.some(x => x.from === m.set && x.result?.error)) return { error: 'Left on: an ad did not move out of it.' };
    return write(env, d, act, { kind: 'pause', object: m.set, level: 'adset', reason: m.why, client_why: m.client_why });
  }
  if (m.kind === 'move') return move(env, d, act, m.ad, m.to, m.why, m.client_why);
  if (m.kind === 'load') {
    if (m.replace) { const p = await write(env, d, act, { kind: 'pause', object: m.replace.id, level: 'ad', reason: `Replaced by a newly approved video: ${m.why}`, client_why: m.client_why }); if (p.error) return { error: `Pause the weakest: ${p.error}` }; }
    const c = await write(env, d, act, { kind: 'copy_ad', object: m.ad, adset: m.to, level: 'ad', reason: m.why, client_why: m.client_why });
    return c.error ? { error: c.error } : { copy: c.created, write: c.write };
  }
  if (m.kind === 'graduate') {
    let sid = m.reuse;
    if (sid) { const r = await write(env, d, act, { kind: 'resume', object: sid, level: 'adset', reason: m.why, client_why: m.client_why, over_pause: 'The creator has 3+ videos live again (creator graduate rule).' }); if (r.error) return { error: `Turn the set back on: ${r.error}` }; }
    else {
      const c = await write(env, d, act, { kind: 'create_adset', object: plan.campaign.id, name: m.set_name, like: plan.pool?.id, ...(m.budget ? { daily_budget: m.budget } : {}), reason: m.why, client_why: m.client_why });
      if (c.error) return { error: `Make the set: ${c.error}` };
      sid = c.created;
      const on = await write(env, d, act, { kind: 'resume', object: sid, level: 'adset', reason: m.why, client_why: m.client_why });
      if (on.error) return { error: `Made ${sid} but could not turn it on: ${on.error}` };
    }
    const moved = [];
    /* Pool ads move (copy + pause the pool original). Newly approved videos are only copied in: their old ad in another
       campaign is left to the "old creator campaigns pause after 3 days" step (SOP rule 9), never paused from here. */
    for (const a of m.ads) {
      if (a.src === 'pool') { const r = await move(env, d, act, a.id, sid, m.why, m.client_why); moved.push({ ad: a.id, ...r }); continue; }
      const c = await write(env, d, act, { kind: 'copy_ad', object: a.id, adset: sid, level: 'ad', reason: m.why, client_why: m.client_why });
      moved.push({ ad: a.id, ...(c.error ? { error: c.error } : { copy: c.created }) });
    }
    const bad = moved.filter(x => x.error);
    return { set: sid, moved: moved.length - bad.length, ...(bad.length ? { warn: `${bad.length} ad${bad.length === 1 ? '' : 's'} did not move: ${bad[0].error}` } : {}) };
  }
  return { error: `Unknown move ${m.kind}` };
}

/* ---------- Slack: one post per brand per day, only when something moved ---------- */
export function slackLines(run) {
  const ok = (run.moves || []).filter(m => m.result && !m.result.error);
  if (!ok.length) return null;
  const L = [];
  for (const m of ok) {
    if (m.kind === 'graduate') L.push(`Graduated: *${m.creator}* got their own set "${m.set_name}"${m.budget ? ` at $${m.budget}/day` : ''}, ${m.result.moved} ads moved in.`);
    else if (m.kind === 'pause_set') L.push(`Paused set "${m.set_name}": ${m.why}`);
    else if (m.kind === 'load') L.push(`Loaded ${m.creator}'s new video into "${m.to_name}"${m.replace ? `, replacing "${m.replace.name}"` : ''}.`);
  }
  const moved = ok.filter(m => m.kind === 'move');
  if (moved.length) { const by = new Map(); for (const m of moved) by.set(`${m.creator}|${m.to_name}`, (by.get(`${m.creator}|${m.to_name}`) || 0) + 1); for (const [k, n] of by) { const [c, t] = k.split('|'); L.push(`Moved ${n} of ${c}'s ads into "${t}".`); } }
  const fails = (run.moves || []).filter(m => m.result?.error);
  if (fails.length) L.push(`${fails.length} move${fails.length === 1 ? '' : 's'} failed; see Ads > Trybe > Creator sets.`);
  if ((run.drafts || []).some(x => x.kind === 'graduate_dm' || x.kind === 'discord')) L.push('Graduation DM and Discord shout-out are drafted in Locus, not sent.');
  if ((run.proposals || []).length) L.push(`${run.proposals.length} budget raise${run.proposals.length === 1 ? '' : 's'} waiting for a yes on the Buyer list.`);
  return L.map(noDash);
}

/* ---------- the daily tick ---------- */
export async function creatorEngineTick(env, d, { force = false } = {}) {
  const today = d.centralDate();
  if (!force && (await getSetting(env, 'creatorEngineDay')) === today) return { skipped: 'done today' };
  if (!force && d.centralHour && d.centralHour() < 6) return { skipped: 'before 6am' };
  const rows = ((await env.DB.prepare(`SELECT key, value FROM settings WHERE key LIKE 'creatorEngine:%'`).all().catch(() => ({ results: [] }))).results || [])
    .map(r => ({ act: r.key.slice('creatorEngine:'.length), cfg: { ...CE_DEFAULTS, ...(safeJson(r.value, {}) || {}) } })).filter(x => x.cfg.mode !== 'off' && x.cfg.campaign);
  const brands = new Map(((await d.listBrands(env)) || []).map(b => [b.act_id, b]));
  const out = { ran: [], errors: [] };
  for (const { act, cfg } of rows) {
    if (d.canAfford && !d.canAfford(120)) { out.errors.push('out of calls for this run'); break; }
    try {
      const r = await runBrand(env, d, act, { dry: cfg.mode !== 'live', today, cfg });
      out.ran.push({ act, mode: cfg.mode, moves: (r.moves || []).length, applied: r.applied || 0, error: r.error || null });
      const b = brands.get(act);
      const lines = cfg.mode === 'live' && !r.error ? slackLines(r) : null;
      if (lines && b && b.slack_channel && b.slack_channel !== b.brief_channel && d.slackPost) {
        const link = `${d.appUrl || 'https://locus.go-mobius-digital.com'}/?open=trybe&act=${act}`;
        const text = `*Creator sets, ${b.name}*\n${lines.map(l => `• ${l}`).join('\n')}`;
        await d.slackPost(env, b.slack_channel, text, [{ type: 'section', text: { type: 'mrkdwn', text } }, { type: 'actions', elements: [{ type: 'button', action_id: 'noop_open', text: { type: 'plain_text', text: 'Open in Locus' }, url: link }] }], { username: 'Locus' });
      }
    } catch (e) { out.errors.push(`${act}: ${e.message}`); }
  }
  await putSetting(env, 'creatorEngineDay', today);
  return out;
}

/** Budget raises waiting for a yes, as Buyer list rows (buyerlist.js). Read from each brand's last run. */
export async function creatorRaiseRows(env, accts) {
  const rows = [];
  for (const a of accts) {
    const run = safeJson(await getSetting(env, runKey(a.act_id)), null);
    if (!run || !run.proposals || day(run.at) < addDays(new Date().toISOString().slice(0, 10), -2)) continue;
    for (const p of run.proposals) rows.push({ key: `${a.act_id}|${p.set}|creator`, kind: 'creator', act_id: a.act_id, brand: a.name, currency: a.currency || 'USD', object: String(p.set), level: 'adset',
      name: p.set_name, set: null, action: `Raise to $${p.to}/day`, why: noDash(`Creator set beating goal: ${p.why}`), why_full: noDash(`${p.why} Creator graduate rule: +20% when 7-day cost per sale is at or under goal with 3+ sales. Locus proposes, a person says yes.`),
      stake: r2(p.spend), do: 'budget', adset_id: String(p.set), adset: p.set_name, suggested_budget: p.to, budget: p.from, spend: p.spend, results: p.sales, cpa: p.cpa, goal: p.goal, days: 7,
      card: { kind: 'raise', level: 'adset', decide: true } });
  }
  return rows;
}

/* ---------- routes ---------- */
export async function handleCreatorEngine(request, env, url, path, json, h) {
  if (!/^\/api\/creator-engine(\/|$)/.test(path)) return null;
  if (!(await h.isAdmin(request, env))) return json({ error: 'unauthorized' }, 401);
  if (h.isClient && h.isClient(request)) return json({ error: 'That part is the Mobius team\'s.' }, 403);
  const email = await h.sessionEmail(env, request).catch(() => null);
  const only = await h.brandsFor(env, email).catch(() => null);
  const b = request.method === 'GET' ? {} : await request.json().catch(() => ({}));
  const act = (await h.resolveBrandId(env, String(b.act || url.searchParams.get('act') || '')).catch(() => '')) || '';
  if (path === '/api/creator-engine/all' && request.method === 'GET') {
    const rows = ((await env.DB.prepare(`SELECT key, value FROM settings WHERE key LIKE 'creatorEngine:%'`).all().catch(() => ({ results: [] }))).results || []);
    const out = [];
    for (const r of rows) { const a = r.key.slice('creatorEngine:'.length); if (only && !only.has(a)) continue; const run = safeJson(await getSetting(env, runKey(a)), null); out.push({ act: a, cfg: safeJson(r.value, {}), run: run ? { at: run.at, dry: run.dry, moves: (run.moves || []).length, applied: run.applied || 0, error: run.error || null } : null }); }
    return json({ brands: out });
  }
  if (!act) return json({ error: 'Pick a brand.' }, 400);
  if (only && !only.has(act)) return json({ error: 'You do not have access to this brand.' }, 403);
  try {
    if (path === '/api/creator-engine' && request.method === 'GET') return json({ act, cfg: await readCfg(env, act), run: safeJson(await getSetting(env, runKey(act)), null), rules: { graduate_at: GRADUATE_AT, wait_days: WAIT_DAYS, load_window: LOAD_WINDOW, raise_pct: RAISE_PCT } });
    if (path === '/api/creator-engine' && request.method === 'PUT') return json({ ok: true, cfg: await saveCfg(env, act, b) });
    /* Run now: dry unless {live: true} AND the brand is switched to live. */
    if (path === '/api/creator-engine/run' && request.method === 'POST') {
      const cfg = await readCfg(env, act);
      const live = !!b.live && cfg.mode === 'live';
      return json(await runBrand(env, h.deps, act, { dry: !live, cfg: { ...cfg, ...(b.campaign ? { campaign: String(b.campaign) } : {}), ...(b.pool ? { pool: String(b.pool) } : {}) } }));
    }
    return json({ error: 'not found' }, 404);
  } catch (e) { return json({ error: e.message }, 400); }
}

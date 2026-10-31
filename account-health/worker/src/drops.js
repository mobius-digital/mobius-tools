/* DROPS AND SALES: OFF WHEN IT ENDS OR SELLS OUT (2026-10-31).
 *
 * Cole: a top performer from a one-time sale (Black Friday, the Masters, a limited drop) must never be suggested back on.
 * A brand lists its drops and sales: a name, the tag its ad names carry (e.g. "[DROP Azalea]", "[SALE BF]"), products
 * (optional, as named in Supply), an end date (optional) and a status live | ended | sold_out. When one is marked ended or
 * sold out (the button, the end date passing on the hourly tick, or every listed product at 0 in Supply), Locus pauses
 * every Meta ad set and ad whose name carries the tag, through the same metawrite path as every Locus write (reason "Off:
 * sale ended" / "Off: sold out", p_meta_write, the Change Log, undo), and LOCKS each one (p_drop_lock).
 * A locked object is never suggested back on (buyerlist.js hides the row, the morning read is told and its turn-on moves
 * are dropped) and metawrite's turn-on guard refuses it, Strategist included, until the drop is reopened (back in stock, a
 * new run). Reopening releases the locks and turns NOTHING on: a person does that, and the drop's own pause then no
 * longer counts as someone else's pause.
 *
 *   p_drop       (id, act, name, tag, products json, ends YYYY-MM-DD, status, why, closed_at, closed_by, created_by, at)
 *   p_drop_lock  (object, drop_id, act, level, name, paused, write, error, at, released)
 *
 * Routes (team only; a client login never reaches them, brandguard has no rule for them):
 *   GET  /api/drops?act=            the brand's drops with lock counts, and whether stock is connected
 *   POST /api/drops                 {act, id?, name, tag, products, ends} add or edit
 *   POST /api/drops/close           {act, id, status: ended | sold_out} pause and lock everything tagged
 *   POST /api/drops/reopen          {act, id} back to live, locks released, nothing turned on
 *   POST /api/drops/delete          {act, id} a live drop with nothing locked
 */
import { locusWrite, metaActs, gall } from './metawrite.js';
import { supplyBrandOf, supplyFetch } from './stock.js';

const clip = (s, n) => String(s ?? '').slice(0, n);
const parse = (v, fb) => { try { return v ? JSON.parse(v) : fb; } catch { return fb; } };
export const STATUS = ['live', 'ended', 'sold_out'];
const WORD = { live: 'live', ended: 'sale ended', sold_out: 'sold out' };
const OFF = { ended: 'Off: sale ended', sold_out: 'Off: sold out' };
/* One close pauses at most this many objects (each is ~6 Graph reads and writes); the hourly tick finishes the rest. */
const MAX_PAUSE = 25;
/* After a close, the hourly tick sweeps again this long, so an ad made or turned on in Meta later goes off too. */
const SWEEP_DAYS = 2;

let tabled = false;
export async function ensureDrops(env) {
  if (tabled) return;
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS p_drop (id TEXT PRIMARY KEY, act TEXT NOT NULL, name TEXT NOT NULL, tag TEXT NOT NULL, products TEXT,
    ends TEXT, status TEXT NOT NULL DEFAULT 'live', why TEXT, closed_at TEXT, closed_by TEXT, created_by TEXT, at TEXT NOT NULL)`).run();
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS p_drop_lock (object TEXT NOT NULL, drop_id TEXT NOT NULL, act TEXT NOT NULL, level TEXT, name TEXT,
    paused INTEGER NOT NULL DEFAULT 0, write TEXT, error TEXT, at TEXT NOT NULL, released TEXT, PRIMARY KEY (object, drop_id))`).run();
  await env.DB.prepare(`CREATE INDEX IF NOT EXISTS p_drop_act ON p_drop (act, status)`).run().catch(() => {});
  tabled = true;
}
const view = (r, locks = []) => ({ id: r.id, act: r.act, name: r.name, tag: r.tag, products: parse(r.products, []), ends: r.ends || null, status: r.status,
  status_word: WORD[r.status] || r.status, why: r.why || null, closed_at: r.closed_at || null, closed_by: r.closed_by || null, created_by: r.created_by || null, at: r.at,
  locked: locks.filter(l => !l.released).length, paused: locks.filter(l => !l.released && l.paused).length, errors: locks.filter(l => !l.released && l.error).map(l => `${l.name || l.object}: ${l.error}`).slice(0, 5) });
const hasTag = (name, tag) => !!tag && String(name || '').toLowerCase().includes(String(tag).toLowerCase());

export async function listDrops(env, act) {
  await ensureDrops(env);
  const rows = (await env.DB.prepare(`SELECT * FROM p_drop WHERE act = ?1 ORDER BY (status = 'live') DESC, at DESC`).bind(act).all()).results || [];
  const locks = (await env.DB.prepare(`SELECT * FROM p_drop_lock WHERE act = ?1`).bind(act).all()).results || [];
  return rows.map(r => view(r, locks.filter(l => l.drop_id === r.id)));
}

export async function saveDrop(env, b, who) {
  await ensureDrops(env);
  const name = clip(String(b.name || '').trim(), 80), tag = clip(String(b.tag || '').trim(), 40);
  if (!name) return { error: 'Give it a name, e.g. Black Friday 2026.' };
  if (tag.length < 3) return { error: 'Give the tag its ad names carry, e.g. [SALE BF]. At least 3 characters.' };
  const ends = b.ends ? String(b.ends).slice(0, 10) : null;
  if (ends && !/^\d{4}-\d{2}-\d{2}$/.test(ends)) return { error: 'The end date should look like 2026-12-02.' };
  const products = (Array.isArray(b.products) ? b.products : String(b.products || '').split(',')).map(s => clip(String(s).trim(), 120)).filter(Boolean).slice(0, 20);
  const clash = await env.DB.prepare(`SELECT name FROM p_drop WHERE act = ?1 AND lower(tag) = lower(?2) AND id != ?3`).bind(b.act, tag, String(b.id || '')).first();
  if (clash) return { error: `"${clash.name}" already uses the tag ${tag}. Use a different one.` };
  if (b.id) {
    const cur = await env.DB.prepare(`SELECT * FROM p_drop WHERE id = ?1 AND act = ?2`).bind(String(b.id), b.act).first();
    if (!cur) return { error: 'No drop by that id on this brand.' };
    await env.DB.prepare(`UPDATE p_drop SET name = ?2, tag = ?3, products = ?4, ends = ?5 WHERE id = ?1`).bind(cur.id, name, tag, JSON.stringify(products), ends).run();
    return { ok: true, drop: (await listDrops(env, b.act)).find(x => x.id === cur.id) };
  }
  const id = 'drop_' + crypto.randomUUID().replace(/-/g, '').slice(0, 12);
  await env.DB.prepare(`INSERT INTO p_drop (id, act, name, tag, products, ends, status, created_by, at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, 'live', ?7, ?8)`)
    .bind(id, b.act, name, tag, JSON.stringify(products), ends, who, new Date().toISOString()).run();
  return { ok: true, drop: (await listDrops(env, b.act)).find(x => x.id === id) };
}

/** Every Meta ad set and ad whose name carries the tag, paused (the active ones) and locked (all of them). */
export async function sweepDrop(env, d, drop, who) {
  await ensureDrops(env);
  const reason = `${OFF[drop.status] || 'Off'} (${drop.name})`;
  const out = { found: 0, paused: 0, locked: 0, errors: [], left: 0 };
  const now = new Date().toISOString();
  const filt = lv => [{ field: `${lv}.name`, operator: 'CONTAIN', value: drop.tag }];
  for (const m of await metaActs(env, drop.act)) {
    const [sets, ads] = await Promise.all([
      gall(d, env, `${m.act}/adsets`, { fields: 'id,name,status', filtering: filt('adset'), limit: '200' }, 2),
      gall(d, env, `${m.act}/ads`, { fields: 'id,name,status,adset_id', filtering: filt('ad'), limit: '300' }, 2),
    ]);
    const setIds = new Set(sets.filter(s => hasTag(s.name, drop.tag)).map(s => s.id));
    const objs = [...sets.map(s => ({ ...s, level: 'adset' })), ...ads.map(a => ({ ...a, level: 'ad' }))].filter(o => hasTag(o.name, drop.tag));
    for (const o of objs) {
      out.found++;
      await env.DB.prepare(`INSERT INTO p_drop_lock (object, drop_id, act, level, name, at) VALUES (?1, ?2, ?3, ?4, ?5, ?6)
        ON CONFLICT(object, drop_id) DO UPDATE SET released = NULL, name = excluded.name`).bind(o.id, drop.id, drop.act, o.level, clip(o.name, 200), now).run();
      out.locked++;
      /* An ad inside a tagged ad set goes off with its set; only an ACTIVE object needs a write. */
      if (o.status !== 'ACTIVE' || (o.level === 'ad' && setIds.has(o.adset_id))) continue;
      if (out.paused + out.errors.length >= MAX_PAUSE) { out.left++; continue; }
      const r = await locusWrite(env, d, { act: drop.act, kind: 'pause', level: o.level, object: o.id, reason }, { who }).catch(e => ({ error: e.message }));
      if (r.error) { out.errors.push(`${o.name}: ${r.error}`); await env.DB.prepare(`UPDATE p_drop_lock SET error = ?3 WHERE object = ?1 AND drop_id = ?2`).bind(o.id, drop.id, clip(r.error, 300)).run(); continue; }
      out.paused++;
      await env.DB.prepare(`UPDATE p_drop_lock SET paused = 1, write = ?3, error = NULL WHERE object = ?1 AND drop_id = ?2`).bind(o.id, drop.id, r.write || null).run();
    }
  }
  return out;
}

/** Mark a drop ended or sold out, then pause and lock what it tags. `who` = the person, or "Locus (...)" from the tick. */
export async function closeDrop(env, d, { act, id, status, why }, who) {
  await ensureDrops(env);
  if (!['ended', 'sold_out'].includes(status)) return { error: 'Mark it ended or sold out.' };
  const cur = await env.DB.prepare(`SELECT * FROM p_drop WHERE id = ?1 AND act = ?2`).bind(String(id || ''), act).first();
  if (!cur) return { error: 'No drop by that id on this brand.' };
  const at = new Date().toISOString();
  await env.DB.prepare(`UPDATE p_drop SET status = ?2, why = ?3, closed_at = ?4, closed_by = ?5 WHERE id = ?1`).bind(cur.id, status, clip(why || WORD[status], 200), at, who).run();
  const drop = { ...cur, status };
  let sweep;
  try { sweep = await sweepDrop(env, d, drop, who); } catch (e) { sweep = { error: e.message }; }
  return { ok: true, sweep, drop: (await listDrops(env, act)).find(x => x.id === cur.id) };
}

/** Back on sale (restocked, a new run): locks released, nothing turned on. */
export async function reopenDrop(env, { act, id }) {
  await ensureDrops(env);
  const cur = await env.DB.prepare(`SELECT * FROM p_drop WHERE id = ?1 AND act = ?2`).bind(String(id || ''), act).first();
  if (!cur) return { error: 'No drop by that id on this brand.' };
  const at = new Date().toISOString();
  await env.DB.prepare(`UPDATE p_drop SET status = 'live', why = NULL, closed_at = NULL, closed_by = NULL WHERE id = ?1`).bind(cur.id).run();
  await env.DB.prepare(`UPDATE p_drop_lock SET released = ?2 WHERE drop_id = ?1 AND released IS NULL`).bind(cur.id, at).run();
  return { ok: true, drop: (await listDrops(env, act)).find(x => x.id === cur.id) };
}

export async function deleteDrop(env, { act, id }) {
  await ensureDrops(env);
  const cur = await env.DB.prepare(`SELECT * FROM p_drop WHERE id = ?1 AND act = ?2`).bind(String(id || ''), act).first();
  if (!cur) return { error: 'No drop by that id on this brand.' };
  if (cur.status !== 'live') return { error: 'Reopen it first; an ended or sold out drop keeps its ads locked.' };
  await env.DB.prepare(`DELETE FROM p_drop_lock WHERE drop_id = ?1`).bind(cur.id).run();
  await env.DB.prepare(`DELETE FROM p_drop WHERE id = ?1`).bind(cur.id).run();
  return { ok: true };
}

/* ---------------- the lock, read by metawrite's guard, the Buyer list and the morning read ---------------- */
/** The brands' closed drops and locked objects: Map act -> { ids: Map(id -> drop), tags: [drop] }. */
export async function locksFor(env, acts) {
  await ensureDrops(env);
  const out = new Map();
  const drops = ((await env.DB.prepare(`SELECT * FROM p_drop WHERE status != 'live'`).all().catch(() => ({ results: [] }))).results || []).filter(r => !acts || acts.has(r.act));
  if (!drops.length) return out;
  const locks = (await env.DB.prepare(`SELECT object, drop_id, act FROM p_drop_lock WHERE released IS NULL`).all().catch(() => ({ results: [] }))).results || [];
  const byId = new Map(drops.map(r => [r.id, r]));
  for (const r of drops) { const x = out.get(r.act) || { ids: new Map(), tags: [] }; x.tags.push(r); out.set(r.act, x); }
  for (const l of locks) { const dr = byId.get(l.drop_id); if (dr) out.get(dr.act).ids.set(String(l.object), dr); }
  return out;
}
/** The drop that locks this object (by its lock row, or its name carrying a closed drop's tag), or null. */
export function lockedBy(x, id, name) {
  if (!x) return null;
  return (id && x.ids.get(String(id))) || x.tags.find(t => hasTag(name, t.tag)) || null;
}
export const lockText = (dr, name) => `"${name}" is off because ${dr.name} ${dr.status === 'sold_out' ? 'sold out' : 'ended'} (tag ${dr.tag}). It stays off until the drop is reopened in Locus (Buyer list > Drops and sales).`;
/** metawrite's guard: {locked, text} for a locked object; {released: [write ids]} when a reopened drop had paused it. */
export async function lockFor(env, act, id, name) {
  const m = await locksFor(env, new Set([act]));
  const dr = lockedBy(m.get(act), id, name);
  if (dr) return { locked: true, text: lockText(dr, name), drop: dr.id };
  const rel = (await env.DB.prepare(`SELECT write FROM p_drop_lock WHERE object = ?1 AND released IS NOT NULL AND write IS NOT NULL`).bind(String(id)).all().catch(() => ({ results: [] }))).results || [];
  return { locked: false, released: rel.map(r => r.write) };
}

/* ---------------- the hourly tick ---------------- */
/** End dates passed, every listed product at 0 in Supply, and a second sweep of drops closed in the last SWEEP_DAYS. */
export async function dropsTick(env, d) {
  await ensureDrops(env);
  const today = d.centralDate();
  const ran = { ended: [], sold_out: [], swept: [], errors: [] };
  const live = (await env.DB.prepare(`SELECT * FROM p_drop WHERE status = 'live'`).all()).results || [];
  /* A close is ~2 Graph reads per ad account plus ~6 per object paused: never start one the tick cannot finish. */
  const can = () => !d.can || d.can(200);
  for (const r of live.filter(x => x.ends && x.ends < today)) {
    if (!can()) { ran.errors.push('Out of budget this tick; the rest next hour.'); break; }
    const c = await closeDrop(env, d, { act: r.act, id: r.id, status: 'ended', why: `The end date (${r.ends}) passed` }, 'Locus (end date passed)').catch(e => ({ error: e.message }));
    if (c.error) ran.errors.push(`${r.name}: ${c.error}`); else ran.ended.push(r.name);
  }
  /* Sold out: every product the drop lists is at 0 on hand in Supply (one Supply read per brand). */
  const withProducts = live.filter(x => !(x.ends && x.ends < today) && parse(x.products, []).length);
  const brands = [...new Set(withProducts.map(x => x.act))];
  for (const act of brands) {
    let st = null;
    try { const b = await supplyBrandOf(env, act); if (b) st = await supplyFetch(env, '/api/state', { brand: b.id, actor: 'Locus drops' }); } catch (e) { ran.errors.push(`Stock for ${act}: ${e.message}`); }
    if (!st) continue;
    for (const r of withProducts.filter(x => x.act === act)) {
      if (!can()) break;
      const want = parse(r.products, []).map(s => s.toLowerCase());
      const found = want.map(w => (st.products || []).find(p => String(p.title || '').toLowerCase() === w) || (st.products || []).find(p => String(p.title || '').toLowerCase().includes(w)));
      if (found.some(p => !p) || !found.every(p => (+p.onHand || 0) <= 0)) continue;
      const c = await closeDrop(env, d, { act, id: r.id, status: 'sold_out', why: `Stock hit 0 in Supply (${found.map(p => p.title).join(', ')})` }, 'Locus (stock hit 0)').catch(e => ({ error: e.message }));
      if (c.error) ran.errors.push(`${r.name}: ${c.error}`); else ran.sold_out.push(r.name);
    }
  }
  const since = new Date(Date.now() - SWEEP_DAYS * 864e5).toISOString(), just = new Set([...ran.ended, ...ran.sold_out]);
  const recent = (await env.DB.prepare(`SELECT * FROM p_drop WHERE status != 'live' AND closed_at >= ?1`).bind(since).all()).results || [];
  for (const r of recent.filter(x => !just.has(x.name)).slice(0, 4)) {
    if (!can()) break;
    const s = await sweepDrop(env, d, r, `Locus (${r.name} ${WORD[r.status]})`).catch(e => ({ errors: [e.message] }));
    if (s.paused || (s.errors || []).length) ran.swept.push({ drop: r.name, paused: s.paused || 0, errors: s.errors || [] });
  }
  return ran;
}

/* ---------------- routes ---------------- */
/** h = { isAdmin, sessionEmail, brandsFor, resolveBrandId, clientScope, md: metawrite deps (+ centralDate) } */
export async function handleDrops(request, env, url, path, json, h) {
  if (!path.startsWith('/api/drops')) return null;
  if (!(await h.isAdmin(request, env))) return json({ error: 'unauthorized' }, 401);
  if (h.clientScope && h.clientScope(request)) return json({ error: 'forbidden' }, 403);
  const email = await h.sessionEmail(env, request).catch(() => null);
  const only = await h.brandsFor(env, email).catch(() => null);
  const body = request.method === 'POST' ? await request.json().catch(() => ({})) : {};
  const act = await h.resolveBrandId(env, String((request.method === 'POST' ? body.act : url.searchParams.get('act')) || '')).catch(() => '');
  if (!/^[\w-]{3,80}$/.test(act)) return json({ error: 'Pick a brand first.' }, 400);
  if (only && !only.has(act)) return json({ error: 'You do not have access to this brand.' }, 403);
  try {
    if (path === '/api/drops' && request.method === 'GET') {
      let stock = false;
      try { stock = !!(await supplyBrandOf(env, act)); } catch { stock = false; }
      return json({ drops: await listDrops(env, act), stock });
    }
    if (request.method !== 'POST') return json({ error: 'method not allowed' }, 405);
    /* The admin key carries no name: a write through it says who is behind it (Cole, 2026-10-31). */
    const who = email || clip(String(body.by || '').trim(), 80);
    if (!who) return json({ error: 'Say who is making this change: add "by", e.g. "Cole via Claude chat".' }, 400);
    if (path === '/api/drops') return json(await saveDrop(env, { ...body, act }, who));
    if (path === '/api/drops/close') return json(await closeDrop(env, h.md, { act, id: body.id, status: body.status, why: body.why }, who));
    if (path === '/api/drops/reopen') return json(await reopenDrop(env, { act, id: body.id }));
    if (path === '/api/drops/delete') return json(await deleteDrop(env, { act, id: body.id }));
    return json({ error: 'not found' }, 404);
  } catch (e) { return json({ error: e.message }, 502); }
}

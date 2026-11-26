/* REPORT HOLD (round 21 research, review note: "not a separate build. Every client send already waits for a tap, so
 * this is one warning line on the draft, and the Send button asks twice"). 2026-11-26.
 *
 * When a client daily, weekly or monthly draft is built, its numbers are checked once: Triple Whale has not synced the
 * last day yet, the store shows no sales while the ads spent, or the brand's Meta sync is failing. A draft that looks
 * broken gets one p_draft_hold row with the reason; v5 To send and Reports show the line and make Send ask twice (and
 * the Slack Send button refuses the first tap with the reason). The draft's text is frozen when it is built, so numbers
 * that come in later do NOT release the hold: the hourly tick changes its reason to "write it again" (code 'stale').
 * Only a rebuild (markHold from upsertBrief / makeReport) or the draft being sent, skipped or gone ends a hold.
 * TEAM ONLY: the row never touches briefs or reports, so nothing a client reads or receives changes; the one route,
 * GET /api/draft-holds, is not on brandguard's client allowlist.
 *
 *   p_draft_hold (kind brief | report, act_id, period daily | weekly | monthly, start, end_date, code, reason, at)
 */
import { metaOf } from './brands.js';

export const HOLD_SPEND = 50;
let tabled = false;
export async function ensureHolds(env) {
  if (tabled) return;
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS p_draft_hold (kind TEXT NOT NULL, act_id TEXT NOT NULL, period TEXT NOT NULL, start TEXT NOT NULL,
    end_date TEXT, code TEXT NOT NULL, reason TEXT NOT NULL, at TEXT NOT NULL, PRIMARY KEY (kind, act_id, period, start))`).run();
  tabled = true;
}
export function _resetHolds() { tabled = false; }

const money = v => '$' + Math.round(v || 0).toLocaleString('en-US');
/** Why a draft's numbers look incomplete, or null. Pure. f = { tw, twSynced, missingDays, sales, spend, syncError }. */
export function holdOf(f) {
  if (!f) return null;
  if (f.tw && (!f.twSynced || f.missingDays > 0)) return { code: 'tw', reason: f.missingDays > 0 && f.twSynced
    ? `Numbers look incomplete: Triple Whale has no numbers for ${f.missingDays} day${f.missingDays === 1 ? '' : 's'}`
    : 'Numbers look incomplete: Triple Whale has not synced' };
  if (f.tw && f.sales === 0 && f.spend >= HOLD_SPEND) return { code: 'zero', reason: `Numbers look incomplete: no sales recorded while ads spent ${money(f.spend)}` };
  if (f.syncError) return { code: 'sync', reason: 'Numbers look incomplete: the Meta sync is failing' };
  return null;
}

/** The instant a brand's day starts (YYYY-MM-DD at 00:00 in its zone), in ms. */
export function zonedMidnight(ymd, tz) {
  const t = Date.parse(ymd + 'T00:00:00Z');
  try {
    const f = new Intl.DateTimeFormat('en-US', { timeZone: tz || 'America/Chicago', hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
    const p = Object.fromEntries(f.formatToParts(new Date(t)).map(x => [x.type, x.value]));
    const asUtc = Date.parse(`${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:00Z`);
    return t - (asUtc - t);
  } catch { return t; }
}
const utcMs = s => Date.parse(String(s || '').replace(' ', 'T') + (/[zZ]|[+-]\d\d:?\d\d$/.test(String(s || '')) ? '' : 'Z'));

/** The facts for one draft, from stored rows only (three light reads). */
export async function holdFacts(env, d, acct, from, to) {
  const tw = !!acct.tw_shop;
  const days = Math.round((Date.parse(to + 'T12:00:00Z') - Date.parse(from + 'T12:00:00Z')) / 864e5) + 1;
  let twSynced = true, missingDays = 0, sales = null;
  if (tw) {
    const { results } = await env.DB.prepare(`SELECT date, metric, value, synced_at FROM tw_daily WHERE act_id = ?1 AND date >= ?2 AND date <= ?3 AND metric IN ('netSales', 'totalSales')`)
      .bind(acct.act_id, from, to).all().catch(() => ({ results: [] }));
    const byDate = {};
    for (const r of results || []) { const x = byDate[r.date] = byDate[r.date] || {}; x[r.metric] = +r.value || 0; x.at = Math.max(x.at || 0, utcMs(r.synced_at) || 0); }
    missingDays = Math.max(0, days - Object.keys(byDate).length);
    const last = byDate[to];
    const end = zonedMidnight(d.addDays(to, 1), acct.tz);
    twSynced = !!last && last.at >= end;
    sales = Object.values(byDate).reduce((s, x) => s + (x.netSales ?? x.totalSales ?? 0), 0);
  }
  const sp = await env.DB.prepare(`SELECT SUM(spend) AS s FROM daily_insights WHERE act_id IN ${metaOf(1)} AND date >= ?2 AND date <= ?3`).bind(acct.act_id, from, to).first().catch(() => null);
  return { tw, twSynced, missingDays, sales, spend: +(sp && sp.s) || 0, syncError: !!String(acct.last_error || '').trim() };
}

async function brandOf(env, d, acctOrId) {
  if (acctOrId && typeof acctOrId === 'object') return acctOrId;
  return (await d.listAccounts(env).catch(() => [])).find(a => a.act_id === acctOrId) || null;
}

/** Check one draft as it is built: hold it with the reason, or release an earlier hold. Never throws to the caller's
 *  path in practice (callers catch); never touches the draft itself. */
export async function markHold(env, d, acctOrId, kind, period, start, end) {
  await ensureHolds(env);
  const acct = await brandOf(env, d, acctOrId);
  if (!acct) return null;
  const hold = holdOf(await holdFacts(env, d, acct, start, end || start));
  if (!hold) { await env.DB.prepare(`DELETE FROM p_draft_hold WHERE kind = ?1 AND act_id = ?2 AND period = ?3 AND start = ?4`).bind(kind, acct.act_id, period, start).run(); return null; }
  await env.DB.prepare(`INSERT INTO p_draft_hold (kind, act_id, period, start, end_date, code, reason, at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
    ON CONFLICT(kind, act_id, period, start) DO UPDATE SET end_date = excluded.end_date, code = excluded.code, reason = excluded.reason, at = excluded.at`)
    .bind(kind, acct.act_id, period, start, end || start, hold.code, hold.reason, new Date().toISOString()).run();
  return hold;
}

/** The holds on drafts still waiting, for GET /api/draft-holds. act = a brand id, or 'all'/empty for every brand. */
export async function listHolds(env, act) {
  await ensureHolds(env);
  const one = act && act !== 'all';
  const { results } = await env.DB.prepare(`SELECT kind, act_id, period, start, end_date, code, reason, at FROM p_draft_hold ${one ? 'WHERE act_id = ?1' : ''} ORDER BY at DESC LIMIT 100`)
    .bind(...(one ? [act] : [])).all().catch(() => ({ results: [] }));
  return results || [];
}

/** The hold on one draft, or null. For the Slack Send button. */
export async function holdFor(env, kind, act, period, start) {
  await ensureHolds(env);
  return env.DB.prepare(`SELECT kind, act_id, period, start, end_date, code, reason, at FROM p_draft_hold WHERE kind = ?1 AND act_id = ?2 AND period = ?3 AND start = ?4`)
    .bind(kind, act, period, start).first().catch(() => null);
}

export const STALE_REASON = 'Numbers came in after this was drafted: write it again before sending';
/** Hourly: each held draft once more (at most 20). Sent, skipped or gone = the hold goes. Still broken = the reason is
 *  refreshed. Numbers in = the hold STAYS with the "write it again" reason, because the draft still carries the
 *  numbers it was built with; a rebuild (markHold at upsertBrief / makeReport) is what ends it. */
export async function recheckHolds(env, d) {
  await ensureHolds(env);
  const rows = (await env.DB.prepare(`SELECT * FROM p_draft_hold ORDER BY at LIMIT 20`).all().catch(() => ({ results: [] }))).results || [];
  if (!rows.length) return null;
  const out = { checked: 0, released: 0, stale: 0 };
  const accts = await d.listAccounts(env).catch(() => []);
  for (const r of rows) {
    out.checked++;
    const draft = r.kind === 'brief'
      ? await env.DB.prepare(`SELECT status FROM briefs WHERE act_id = ?1 AND date = ?2`).bind(r.act_id, r.start).first().catch(() => null)
      : await env.DB.prepare(`SELECT status FROM reports WHERE act_id = ?1 AND period = ?2 AND period_start = ?3`).bind(r.act_id, r.period, r.start).first().catch(() => null);
    const acct = accts.find(a => a.act_id === r.act_id);
    const waiting = !!acct && !!draft && ['draft', 'error', 'handled'].includes(draft.status);
    if (!waiting) {
      await env.DB.prepare(`DELETE FROM p_draft_hold WHERE kind = ?1 AND act_id = ?2 AND period = ?3 AND start = ?4`).bind(r.kind, r.act_id, r.period, r.start).run();
      out.released++; continue;
    }
    if (r.code === 'stale') { out.stale++; continue; }
    const hold = holdOf(await holdFacts(env, d, acct, r.start, r.end_date || r.start));
    const code = hold ? hold.code : 'stale', reason = hold ? hold.reason : STALE_REASON;
    await env.DB.prepare(`UPDATE p_draft_hold SET code = ?5, reason = ?6, at = ?7 WHERE kind = ?1 AND act_id = ?2 AND period = ?3 AND start = ?4`)
      .bind(r.kind, r.act_id, r.period, r.start, code, reason, new Date().toISOString()).run();
    if (!hold) out.stale++;
  }
  return out;
}

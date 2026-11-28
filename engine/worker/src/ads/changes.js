/* The change log, the client's ad updates, and the list of ads loaded through the app. Reads only. */
// from account-health/worker/src/worker.js (GET /api/activities, GET /api/ad-updates) and launch.js (launchList)
import { fail } from '../platform/errors.js';
import { safeJson } from '../platform/text.js';

const WRITE_ID = /\b(mw_[0-9a-f]+)/;
const writeIdOf = row => (String(row.note || '').match(WRITE_ID) || [])[1];
const minuteOf = t => String(t).slice(0, 16);
const DAY_MS = 864e5;

/** GET /ah/api/activities: every change on the ad accounts, newest first. Each row is filed under its brand. */
export async function listActivities(ctx, input) {
  const q = input.query;
  const from = q.from || '2000-01-01', to = q.to || '2999-12-31T23:59:59';
  const asked = Math.min(q.limit || 500, 2000);
  const limit = asked > 0 ? asked : 500;
  const rows = ctx.scope.brand
    ? await ctx.db.all('ads.activitiesOne', { act: ctx.scope.brand, from, to, limit })
    : await ctx.db.all('ads.activitiesAll', { from, to, limit });
  return { rows: foldEchoes(rows) };
}

/* EVERY CHANGE ONCE (2026-11-28). A change made through Locus is logged twice: Locus's own row (id `manual:...`, with
   the person, the reason and the Undo) and, after the activity sync, Meta's echo of the same write, made by the system
   user Locus writes as ("Mobius Tools"). The echo folds into the Locus row when it is the same object and the same kind
   of change within ECHO_MS; each Locus row takes at most one echo, the nearest. A change by anyone else in Ads Manager
   is never folded. Order is kept. */
export const ECHO_MS = 10 * 60e3;
const ECHO_ACTOR = /^mobius tools$/i;
const isLocusRow = r => String(r.id || '').startsWith('manual:') || r.manual === 1 || r.manual === true;
const timeOf = r => Date.parse(String(r.event_time || '').replace(/([+-]\d\d)(\d\d)$/, '$1:$2'));
export function foldEchoes(rows) {
  if (!Array.isArray(rows) || rows.length < 2) return rows;
  const mine = rows.filter(r => isLocusRow(r) && r.object_id);
  if (!mine.length) return rows;
  const drop = new Set();
  for (const m of mine) {
    const t = timeOf(m);
    if (!Number.isFinite(t)) continue;
    let best = null, gap = Infinity;
    for (const r of rows) {
      if (r === m || isLocusRow(r) || drop.has(r) || !ECHO_ACTOR.test(String(r.actor || ''))) continue;
      if (String(r.object_id) !== String(m.object_id) || (r.category || '') !== (m.category || '')) continue;
      const d = Math.abs(timeOf(r) - t);
      if (d <= ECHO_MS && d < gap) { best = r; gap = d; }
    }
    if (best) drop.add(best);
  }
  return drop.size ? rows.filter(r => !drop.has(r)) : rows;
}

function platformOf(r) {
  const type = r.event_type || '', object = r.object_type || '';
  if (/^google/i.test(type) || /^GOOGLE/.test(object)) return 'google';
  if (/^tiktok/i.test(type) || /^TIKTOK/.test(object)) return 'tiktok';
  return /trybe/i.test(type) ? 'trybe' : 'meta';
}

function levelOf(objectType) {
  const s = String(objectType || '').toUpperCase();
  if (/ADSET|AD_SET|ADGROUP|AD_GROUP/.test(s)) return 'adset';
  if (/CAMPAIGN/.test(s)) return 'campaign';
  return /(^|_)AD$/.test(s) ? 'ad' : 'account';
}

/* The app's own writes behind the rows: Meta writes by the id in the note, the others by object and minute. */
async function writesBehind(ctx, rows, act, from, to) {
  const ids = [...new Set(rows.map(writeIdOf).filter(Boolean))];
  const meta = new Map(), other = new Map();
  for (let i = 0; i < ids.length; i += 50) {
    for (const w of await ctx.db.all('ads.metaWrites', { ids: ids.slice(i, i + 50) })) meta.set(w.id, w);
  }
  for (const w of await ctx.db.all('ads.otherWrites', { act, from, to })) other.set(`${w.object}|${minuteOf(w.at)}`, w);
  return { meta, other };
}

function changeOf(r, platform, mw, xw) {
  const before = mw ? mw.before : xw ? xw.before : null, after = mw ? mw.after : xw ? xw.after : null;
  return { id: r.id, at: r.event_time, platform, level: mw ? mw.level : levelOf(r.object_type), object_id: r.object_id,
    name: (mw && mw.name) || r.object_name || (xw && xw.name) || '', category: r.category,
    action: mw ? mw.action : xw ? xw.action : null, field: mw ? mw.field : null, summary: r.summary, why: r.reason,
    before: safeJson(before, null), after: safeJson(after, null) };
}

/** GET /ah/api/ad-updates: one brand's changes that carry a reason written for the client, newest first.
 *  A change that was undone in the app is left out, and one object changes once per minute per category. */
export async function listAdUpdates(ctx, input) {
  const act = ctx.scope.brand;
  if (!act) fail(400, 'Pick one brand.');
  const to = input.query.to || '2999-12-31T23:59:59';
  const from = input.query.from || new Date(ctx.now.getTime() - 45 * DAY_MS).toISOString().slice(0, 10);
  const rows = await ctx.db.all('ads.updateRows', { act, from, to });
  const { meta, other } = await writesBehind(ctx, rows, act, from, to);
  const seen = new Set(), changes = [];
  for (const r of rows) {
    const mw = meta.get(writeIdOf(r));
    if (mw && mw.undone) continue;
    const platform = platformOf(r);
    const xw = platform !== 'meta' ? other.get(`${r.object_id}|${minuteOf(r.event_time)}`) : null;
    if (xw && xw.undone) continue;
    const key = `${r.object_id}|${minuteOf(r.event_time)}|${r.category}`;
    if (seen.has(key)) continue;
    seen.add(key);
    changes.push(changeOf(r, platform, mw, xw));
  }
  return { act: input.query.act || act, from, to, changes };
}

function launchOf(r) {
  const link = r.ad_id && r.meta_act
    ? `https://adsmanager.facebook.com/adsmanager/manage/ads?act=${String(r.meta_act).replace('act_', '')}&selected_ad_ids=${r.ad_id}` : null;
  return { id: r.id, act: r.act, source: r.source, studio_ad: r.studio_ad, batch_id: r.batch_id, num: r.num, ad_id: r.ad_id,
    ad_name: r.ad_name, adset_id: r.adset_id, adset_name: r.adset_name, cards: safeJson(r.cards, null), status: r.status,
    eff_status: r.eff_status, checked_at: r.checked_at, by: r.by, at: r.at, verdict: r.verdict, learning: r.learning,
    filed_at: r.filed_at, ads_manager: link };
}

/** GET /ah/api/launch/list: the ads loaded through the app, newest first, with their last known state.
 *  The old route also files a judged test's learning and can re-read live states. Both are writes or
 *  outside reads, so those requests go to the old worker. */
export async function listLaunches(ctx, input) {
  const act = ctx.scope.brand;
  if (!act) return { ok: true, launches: (await ctx.db.all('ads.launchesAll', {})).map(launchOf) };
  if (input.query.refresh === '1') return ctx.forward('refresh re-reads live ad states from the ad platform');
  const [toLink, toFile] = await ctx.db.batch([['ads.launchesToLink', { act }], ['ads.launchesToFile', { act }]]);
  if ((toLink[0] && toLink[0].n) || (toFile[0] && toFile[0].n)) return ctx.forward('a judged test has a learning to file, which is a write');
  return { ok: true, launches: (await ctx.db.all('ads.launchesOne', { act })).map(launchOf) };
}

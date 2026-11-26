/* Shared by the paid and creative handlers: the model switch, the compare window, small helpers. */
// from profit/worker/src/hub.js (handleHub: model, cmp, win; num, dates) and worker.js (windowFor)
import { fail } from '../platform/errors.js';
import { addDays, dayDiff, windowFor } from '../platform/time.js';

export const MODEL_LABEL = { lastPlatformClick: 'Triple Whale, last platform click', fullFirstClick: 'Triple Whale, first click',
  fullLastClick: 'Triple Whale, last click', linear: 'Triple Whale, linear (paid)', linearAll: 'Triple Whale, linear (all)',
  platform: 'Platform reported' };
const CMP = ['prev', 'yoy', 'none'];
/* One statement takes at most 100 values. Past this many brands the old worker answers. */
export const MAX_BRANDS = 40;

/** A value as a number. Not known counts as 0, as the old sums did. */
export const num = v => (v == null || !Number.isFinite(+v) ? 0 : +v);

/** Every day from `from` to `to`, both ends included. */
export function dates(from, to) {
  const out = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
}

/** Rows as a map from one key to the row (or to one of its values). */
export const byKey = (rows, key, value) => Object.fromEntries((rows || []).map(r => [r[key], value ? r[value] : r]));

/** The model and compare switch every hub answer starts with. */
export function switches(query) {
  const model = Object.prototype.hasOwnProperty.call(MODEL_LABEL, query.model) ? query.model : 'lastPlatformClick';
  const cmp = CMP.includes(query.cmp) ? query.cmp : 'prev';
  return { model, model_label: MODEL_LABEL[model], cmp };
}

/** The window for one brand and the window it is compared with. Ends yesterday unless today is named. */
export function windowOf(brand, query, cmp, now) {
  const days = Math.min(query.days || 30, 180);
  const { today, from, to } = windowFor(brand.tz, { days, from: query.from || null, to: query.to || null }, now);
  const span = dayDiff(from, to) + 1;
  let pf = null, pt = null;
  if (cmp === 'prev') { pt = addDays(from, -1); pf = addDays(pt, -(span - 1)); }
  else if (cmp === 'yoy') { pf = `${+from.slice(0, 4) - 1}${from.slice(4)}`; pt = `${+to.slice(0, 4) - 1}${to.slice(4)}`; }
  return { from, to, pf, pt, span, today };
}

/** The brands this request is about: the one named, or every active brand of the caller. 404 when none. */
export async function brandsAsked(ctx) {
  const all = await ctx.brands.list({ active: true });
  const brands = ctx.scope.brand ? all.filter(b => b.act_id === ctx.scope.brand) : all;
  if (!brands.length) fail(404, 'unknown account');
  return brands;
}

/** The earliest day both windows reach, and the two windows as statement values. */
export const lowDay = w => (w.pf && w.pf < w.from ? w.pf : w.from);
export const twoWindows = w => ({ from: w.from, to: w.to, pf: w.pf || '9999', pt: w.pt || '0000' });

/** Credit per day -> the total between two days. */
export function sumCredit(byDate, from, to) {
  let rev = 0, ord = 0;
  for (const d in byDate || {}) if (d >= from && d <= to) { rev += byDate[d].rev; ord += byDate[d].ord; }
  return { rev, ord };
}

/** Rows of (ad, day, rev, ord) -> credit per ad and per day. */
export function creditMaps(rows) {
  const byAd = {}, byDate = {};
  for (const r of rows || []) {
    const a = byAd[r.ad_id] ||= { rev: 0, ord: 0 }; a.rev += r.rev || 0; a.ord += r.ord || 0;
    const d = byDate[r.date] ||= { rev: 0, ord: 0 }; d.rev += r.rev || 0; d.ord += r.ord || 0;
  }
  return { byAd, byDate };
}

/** The tracker's credit per ad and per day for one brand's Meta ads. Empty under the platform model. */
export async function creditByAd(ctx, act, from, to, model) {
  if (model === 'platform') return { byAd: {}, byDate: {} };
  return creditMaps(await ctx.db.all('ads.attrByAdDay', { act, model, from, to }));
}

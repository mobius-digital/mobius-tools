/* One brand's ad account numbers a day, for the charts. Spend and delivery are the ad platform's own.
   Purchases and revenue are the tracker's (last platform click), and are null on a day the tracker has not
   synced yet, never zero. The platform's own counts ride along as meta_purchases and meta_revenue. */
// from account-health/worker/src/worker.js (/api/series near 10147, sumByDate, twMetaDaily, attributeRows, seriesEvents)
import { fail } from '../platform/errors.js';
import { addDays, dayIn } from '../platform/time.js';

const ATTRIBUTION = 'triple_whale:lastPlatformClick';

/* A brand with two ad accounts has two rows a day. Fold them into one: numbers summed, the rest from the
   first row. One ad account: the rows come back unchanged. */
function sumByDate(rows, key = 'date') {
  const by = new Map();
  for (const r of rows || []) {
    const k = r[key];
    const have = by.get(k);
    if (!have) { by.set(k, { ...r }); continue; }
    for (const [f, v] of Object.entries(r)) {
      if (f !== key && typeof v === 'number') have[f] = (typeof have[f] === 'number' ? have[f] : 0) + v;
    }
  }
  return [...by.values()];
}

/* The same rows with purchases and revenue swapped for the tracker's. */
function attributeRows(rows, tw) {
  return rows.map(r => {
    const t = tw[r.date];
    return { ...r, meta_purchases: r.purchases, meta_revenue: r.revenue, purchases: t ? t.ord : null, revenue: t ? t.rev : null };
  });
}

/** GET /ah/api/series: the daily rows of one brand's ad accounts, and the changes worth marking on a chart. */
export async function series(ctx, input) {
  const id = ctx.scope.brand;
  const acct = id ? await ctx.brands.one(id) : null;
  if (!acct) fail(404, 'unknown account');
  const days = Math.min(+input.query.days || 90, 400);
  const today = dayIn(acct.tz, ctx.now);
  const from = addDays(today, -days);
  const act = acct.act_id;
  const [adRows, twRows, events] = await ctx.db.batch([
    ['metrics.adDays', { act, from }],
    ['metrics.twMetaDays', { act, from, to: today }],
    ['metrics.chartEvents', { act, from }],
  ]);
  const tw = Object.fromEntries(twRows.map(r => [r.date, { rev: r.rev || 0, ord: r.ord || 0 }]));
  const rows = attributeRows(sumByDate(adRows).map(r => ({ ...r, act_id: act })), tw);
  const data = { account: { act_id: act, name: acct.name, currency: acct.currency, tz: acct.tz, today },
    attribution: ATTRIBUTION, rows, events };
  return { data, meta: { window: { from, to: today, tz: acct.tz } } };
}

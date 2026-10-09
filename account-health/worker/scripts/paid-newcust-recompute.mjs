/* NEW PAYING CUSTOMERS, recomputed over the whole tw_daily history (2026-10-09, after paid-orders-migrate.mjs).
 * Same rule as newPaid() in src/worker.js (KEEP IN STEP): the smaller of Triple Whale's raw new-customer count and the
 * first PAID orders seen order by order in tw_orders, when tw_orders has the day (>= 80% of paid orders); otherwise the
 * raw count less the free orders. Reads only the raw copies (totalOrdersAll, newCustomersOrdersAll), so it is
 * idempotent. `node scripts/paid-newcust-recompute.mjs` = dry run; add --go to write. */
import { remoteEnv } from './d1rest.mjs';
const go = process.argv.includes('--go');
const env = await remoteEnv();
const q = async (sql, ...a) => (await env.DB.prepare(sql).bind(...a).all()).results;
const newPaid = (rawNew, all, paid, seen) => {
  if (rawNew == null) return null;
  const free = Math.max(0, (all ?? 0) - (paid ?? 0));
  if (seen && paid > 0 && seen.n >= 0.8 * paid) return Math.min(rawNew, seen.firsts);
  return Math.max(0, rawNew - free);
};
const brands = (await q(`SELECT DISTINCT act_id FROM tw_daily WHERE metric = 'newCustomersOrdersAll'`)).map(r => r.act_id);
for (const b of brands) {
  const rows = await q(`SELECT date, metric, value FROM tw_daily WHERE act_id = ?1 AND metric IN ('totalOrdersAll', 'totalOrdersWithAmount', 'newCustomersOrdersAll', 'newCustomersOrders')`, b);
  const by = {}; for (const r of rows) (by[r.date] ??= {})[r.metric] = r.value;
  const seenRows = await q(`WITH f AS (SELECT customer_id, MIN(date) first FROM tw_orders WHERE act_id = ?1 AND customer_id IS NOT NULL AND customer_id != '' AND total > 0 GROUP BY customer_id)
    SELECT o.date, COUNT(*) n, SUM(CASE WHEN f.first = o.date THEN 1 ELSE 0 END) firsts FROM tw_orders o LEFT JOIN f ON f.customer_id = o.customer_id
    WHERE o.act_id = ?1 AND o.total > 0 GROUP BY o.date`, b);
  const seen = Object.fromEntries(seenRows.map(r => [r.date, { n: r.n || 0, firsts: r.firsts || 0 }]));
  const ups = []; let before = 0, after = 0, viaOrders = 0;
  for (const [d, v] of Object.entries(by)) {
    if (v.newCustomersOrdersAll == null || v.totalOrdersWithAmount == null) continue;
    const n = newPaid(v.newCustomersOrdersAll, v.totalOrdersAll, v.totalOrdersWithAmount, seen[d]);
    before += v.newCustomersOrders || 0; after += n;
    if (seen[d] && v.totalOrdersWithAmount > 0 && seen[d].n >= 0.8 * v.totalOrdersWithAmount) viaOrders++;
    if (n !== v.newCustomersOrders) ups.push([d, n]);
  }
  console.log(b.padEnd(26), 'new customers now', Math.round(before), '->', Math.round(after), `(${ups.length} days change, ${viaOrders} days from order data)`);
  if (!go) continue;
  for (let i = 0; i < ups.length; i += 80) await env.DB.batch(ups.slice(i, i + 80).map(([d, n]) =>
    env.DB.prepare(`UPDATE tw_daily SET value = ?3 WHERE act_id = ?1 AND date = ?2 AND metric = 'newCustomersOrders'`).bind(b, d, n)));
}
if (!go) console.log('\nDry run. Add --go to write.');

/* PAID ORDERS ONLY: convert the tw_daily history once (2026-10-09). See paidOrdersOnly() in src/worker.js.
 * Deploy the worker FIRST (so the hourly sync writes the new shape), then run:
 *   node scripts/paid-orders-migrate.mjs            (dry run: counts only)
 *   node scripts/paid-orders-migrate.mjs --go       (writes)
 * Idempotent: the raw counts are copied to totalOrdersAll / newCustomersOrdersAll with INSERT OR IGNORE (a row that
 * already has them is never overwritten), and the two converted metrics are recomputed from those raw copies. */
import { remoteEnv } from './d1rest.mjs';
const go = process.argv.includes('--go');
const env = await remoteEnv();
const q = async (sql, ...a) => (await env.DB.prepare(sql).bind(...a).all()).results;
const brands = (await q(`SELECT DISTINCT act_id FROM tw_daily WHERE metric = 'totalOrdersWithAmount'`)).map(r => r.act_id);
for (const b of brands) {
  const [c] = await q(`SELECT
      SUM(CASE WHEN metric = 'totalOrders' THEN value END) orders,
      SUM(CASE WHEN metric = 'totalOrdersWithAmount' THEN value END) paid,
      SUM(CASE WHEN metric = 'totalOrdersAll' THEN 1 ELSE 0 END) has_all
    FROM tw_daily WHERE act_id = ?1`, b);
  console.log(b.padEnd(28), 'orders now', Math.round(c.orders || 0), 'paid', Math.round(c.paid || 0), 'rows already converted', c.has_all);
  if (!go) continue;
  const same = `p.act_id = tw_daily.act_id AND p.date = tw_daily.date`;
  await env.DB.batch([
    env.DB.prepare(`INSERT OR IGNORE INTO tw_daily (act_id, date, metric, value, synced_at) SELECT act_id, date, 'totalOrdersAll', value, synced_at FROM tw_daily WHERE act_id = ?1 AND metric = 'totalOrders'`).bind(b),
    env.DB.prepare(`INSERT OR IGNORE INTO tw_daily (act_id, date, metric, value, synced_at) SELECT act_id, date, 'newCustomersOrdersAll', value, synced_at FROM tw_daily WHERE act_id = ?1 AND metric = 'newCustomersOrders'`).bind(b),
  ]);
  await env.DB.prepare(`UPDATE tw_daily SET value = (SELECT p.value FROM tw_daily p WHERE ${same} AND p.metric = 'totalOrdersWithAmount')
    WHERE act_id = ?1 AND metric = 'totalOrders' AND EXISTS (SELECT 1 FROM tw_daily p WHERE ${same} AND p.metric = 'totalOrdersWithAmount')`).bind(b).run();
  await env.DB.prepare(`UPDATE tw_daily SET value = max(0,
      (SELECT p.value FROM tw_daily p WHERE ${same} AND p.metric = 'newCustomersOrdersAll')
      - ((SELECT p.value FROM tw_daily p WHERE ${same} AND p.metric = 'totalOrdersAll') - (SELECT p.value FROM tw_daily p WHERE ${same} AND p.metric = 'totalOrdersWithAmount')))
    WHERE act_id = ?1 AND metric = 'newCustomersOrders'
      AND EXISTS (SELECT 1 FROM tw_daily p WHERE ${same} AND p.metric = 'totalOrdersWithAmount')
      AND EXISTS (SELECT 1 FROM tw_daily p WHERE ${same} AND p.metric = 'totalOrdersAll')
      AND EXISTS (SELECT 1 FROM tw_daily p WHERE ${same} AND p.metric = 'newCustomersOrdersAll')`).bind(b).run();
  const [d] = await q(`SELECT SUM(CASE WHEN metric = 'totalOrders' THEN value END) orders, SUM(CASE WHEN metric = 'totalOrdersAll' THEN value END) raw FROM tw_daily WHERE act_id = ?1`, b);
  console.log('   converted: paid orders', Math.round(d.orders || 0), 'of', Math.round(d.raw || 0));
}
if (!go) console.log('\nDry run. Add --go to write.');

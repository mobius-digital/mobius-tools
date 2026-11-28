// node test-goals-mtd.mjs (from profit/v5). No DOM, no network.
// Brand settings > Goals reads month to date sales and spend from the plan's pace or actual, never from current_month
// (which is only the month's name), and names the plan's own store source.
import assert from 'node:assert/strict';
const { mtdOf } = await import('./pages/brand-settings/_mtd.js');

let n = 0;
const ok = (name, fn) => { fn(); n++; console.log('ok  ' + name); };

ok('current_month is a name, not the numbers: nothing to read from it', () => {
  assert.equal(mtdOf({ current_month: '2026-11' }), null);
});
ok('the month in flight reads pace, with its store source', () => {
  assert.deepEqual(mtdOf({ current_month: '2026-11', pace: { mtd_sales: 120000, mtd_spend: 40000, store_source: 'shopify' }, actual: { sales: 1, spend: 1 } }),
    { sales: 120000, spend: 40000, source: 'Shopify' });
});
ok('no pace: the month\'s own actual row, Triple Whale by default', () => {
  assert.deepEqual(mtdOf({ actual: { sales: 5000, spend: 2000 }, store_source: 'triple_whale' }), { sales: 5000, spend: 2000, source: 'Triple Whale' });
  assert.deepEqual(mtdOf({ actual: { sales: 5000, spend: 2000 } }), { sales: 5000, spend: 2000, source: 'Triple Whale' });
});
ok('the plan level store_source counts when the pace has none', () => {
  assert.equal(mtdOf({ pace: { mtd_sales: 10, mtd_spend: 5 }, store_source: 'shopify' }).source, 'Shopify');
});
ok('no plan', () => { assert.equal(mtdOf(null), null); assert.equal(mtdOf({}), null); });

console.log(`\n${n} checks passed`);

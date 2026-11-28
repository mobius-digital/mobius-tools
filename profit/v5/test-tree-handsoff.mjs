// node test-tree-handsoff.mjs (from profit/v5). No DOM, no network.
// War Room: a hands-off quiet row never reaches the campaign tree, so it gets no call pill and no write sheet.
import assert from 'node:assert/strict';
const { callsBy } = await import('./pages/a-black-friday/_calls.js');

let n = 0;
const ok = (name, fn) => { fn(); n++; console.log('ok  ' + name); };

ok('hands-off quiet rows are skipped; other quiet rows still show', () => {
  const D = { calls: {
    rows: [{ level: 'ad', ad_id: '1', action: 'Turn off' }],
    quiet: [
      { level: 'adset', adset_id: '7001', action: 'Cut', hidden: { why: 'hands_off', by: 'Locus' } },
      { level: 'ad', ad_id: '7002', action: 'Cut', hidden: { why: 'hands_off', by: 'Locus' } },
      { level: 'ad', ad_id: '2', action: 'Scale', hidden: { why: 'done', by: 'cole@' } },
    ] } };
  const c = callsBy(D);
  assert.deepEqual(Object.keys(c.ad).sort(), ['1', '2']);
  assert.deepEqual(Object.keys(c.adset), []);
});
ok('a brand that is all hands off has no calls at all', () => {
  const c = callsBy({ calls: { rows: [], quiet: [{ level: 'adset', adset_id: '9', hidden: { why: 'hands_off' } }] } });
  assert.deepEqual(c, { ad: {}, adset: {} });
});
ok('no calls data is empty', () => assert.deepEqual(callsBy({}), { ad: {}, adset: {} }));

console.log(`${n} passed`);

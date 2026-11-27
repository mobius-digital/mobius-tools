/* Offline checks for sales that count toward MER (src/merchannels.js, 2026-11-27): the default rule, the brand's
 * own ticks, tagged orders, the left-out sales riding in the pivot through the store switch, MER on counted sales
 * while store sales stay whole, the live share, and the Triple Whale rows turned into table rows.
 *   node test-merchannels.mjs   (from profit/worker) */
import assert from 'node:assert/strict';
import { describe, counts, merConfig, excludedByDay, applyMerChannels, channelKey, channelSummary, countedShare,
  rowsFromSql, channelSql, merRow, merSalesFor, syncSalesChannels, readMer, CHANNEL_TABLE } from './src/merchannels.js';
import { storeSwitchMany } from './src/storesource.js';
import { makeDb } from './test-d1.mjs';

let n = 0; const ok = async (name, fn) => { await fn(); n++; console.log('PASS ', name); };

await ok('default rule: storefront and social shops count; marketplaces, live selling, wholesale, in person do not', () => {
  for (const k of ['web', '3890849', '2329312', 'tiktok', 'subscription_contract_checkout_one', 'shopify_draft_order']) assert.equal(counts(k, merConfig(null)), true, k);
  for (const k of ['amazon', '420755537921', '292572659713', 'ebay', 'faire', 'shopify-collective-automatic-payments', 'pos', 'tag:wholesale']) assert.equal(counts(k, merConfig(null)), false, k);
  assert.equal(describe('420755537921').label, 'Whatnot');
  assert.equal(describe('1615469').unnamed, true, 'an app Locus does not know is named as such');
  assert.equal(counts('1615469', merConfig(null)), true, 'and counts until someone unticks it');
});

await ok('the brand setting wins over the default, both ways; tags default to wholesale', () => {
  const cfg = merConfig('{"counts":{"amazon":true,"3890849":false},"tags":["Wholesale","b2b!"]}');
  assert.equal(counts('amazon', cfg), true);
  assert.equal(counts('3890849', cfg), false);
  assert.equal(counts('web', cfg), true);
  assert.deepEqual(cfg.tags, ['wholesale', 'b2b']);
  assert.deepEqual(merConfig('not json').tags, ['wholesale']);
  assert.deepEqual(merConfig({ tags: [] }).tags, []);
  assert.equal(channelKey('WEB', null), 'web');
  assert.equal(channelKey('web', 'Wholesale'), 'tag:wholesale');
});

await ok('left-out sales per day, into the pivot only inside the window', () => {
  const rows = [
    { day: '2026-11-01', channel: 'web', sales: 1000, orders: 10 },
    { day: '2026-11-01', channel: 'amazon', sales: 400, orders: 9 },
    { day: '2026-11-01', channel: '420755537921', sales: 100, orders: 1 },
    { day: '2026-11-02', channel: 'amazon', sales: 50, orders: 1 },
  ];
  assert.deepEqual(excludedByDay(rows, merConfig(null)), { '2026-11-01': { sales: 500, orders: 10 }, '2026-11-02': { sales: 50, orders: 1 } });
  const piv = applyMerChannels({}, rows, merConfig(null), '2026-11-01', '2026-11-01');
  assert.deepEqual(piv.merExcluded, { '2026-11-01': 500 });
  assert.equal(merSalesFor(1450, 500), 950);
  assert.equal(merSalesFor(100, 500), 0, 'never below 0');
  const sum = channelSummary(rows, merConfig(null));
  assert.equal(sum[0].key, 'web'); assert.equal(sum[1].sales, 450); assert.equal(sum[1].counts, false);
  assert.ok(Math.abs(countedShare(rows, merConfig(null)) - 1000 / 1550) < 1e-9);
  assert.equal(countedShare([], merConfig(null)), 1);
});

await ok('live row: MER and aMER on counted sales, sales unchanged', () => {
  const r = merRow({ sales: 1000, new_rev: 400, spend: 200 }, 300);
  assert.equal(r.sales, 1000); assert.equal(r.mer_sales, 700); assert.equal(r.mer, 3.5);
  assert.equal(r.mer_new_rev, 280); assert.equal(r.amer, 1.4);
});

await ok('Triple Whale answer to rows: tagged orders are their own channel; two spellings of one source add up', () => {
  const rows = rowsFromSql([
    { d: '2026-11-01', s: 'web', tg: null, orders: '3', sales: '300.5' },
    { d: '2026-11-01', s: 'web', tg: 'wholesale', orders: 1, sales: 900 },
    { d: '2026-11-01', s: 'WEB', tg: '', orders: 1, sales: 100 },
    { d: 'bad', s: 'web', orders: 1, sales: 1 },
  ]);
  assert.deepEqual(rows.sort((a, b) => a.channel.localeCompare(b.channel)), [
    { day: '2026-11-01', channel: 'tag:wholesale', sales: 900, orders: 1 },
    { day: '2026-11-01', channel: 'web', sales: 400.5, orders: 4 },
  ]);
  assert.match(channelSql(['wholesale']), /has\(\['wholesale'\], lower\(t\)\)/);
  assert.match(channelSql([]), /'' AS tg/);
  assert.match(channelSql(["x'); drop"]), /'x drop'/, 'a tag can never break out of the string');
});

await ok('sync writes the window, clears a channel that went away; the switch puts it in the pivot', async () => {
  const { db, DB } = makeDb();
  db.exec(`CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT)`);
  db.exec(CHANNEL_TABLE);
  db.prepare(`INSERT INTO p_sales_channel (act_id, day, channel, sales, orders) VALUES ('b1', '2026-11-02', 'ebay', 5, 1)`).run();
  const sql = async ({ sql: q, from, to }) => {
    assert.match(q, /platform = 'shopify'/); assert.equal(from, '2026-11-01'); assert.equal(to, '2026-11-02');
    return { rows: [{ d: '2026-11-01', s: 'web', orders: 2, sales: 1000 }, { d: '2026-11-01', s: 'amazon', orders: 5, sales: 250 }] };
  };
  const r = await syncSalesChannels({ DB }, { sql }, { act: 'b1', shop: 's.myshopify.com', from: '2026-11-01', to: '2026-11-02' });
  assert.equal(r.rows, 2);
  const m = await readMer({ DB }, ['b1'], '2026-11-01', '2026-11-02');
  assert.equal(m.rows.b1.length, 2, 'the old eBay row is gone');
  assert.equal((await syncSalesChannels({ DB }, { sql: async () => ({ error: 'down' }) }, { act: 'b1', shop: 's', from: '2026-11-01', to: '2026-11-02' })).error, 'down');
  assert.equal((await readMer({ DB }, ['b1'], '2026-11-01', '2026-11-02')).rows.b1.length, 2, 'a failed read leaves the rows');
  /* the store switch (no Shopify table, no setting: Triple Whale) still adds merExcluded */
  const piv = { netSales: { '2026-11-01': 1300 } };
  await storeSwitchMany({ DB }, [{ act_id: 'b1', tz: 'UTC' }], { b1: piv }, '2026-11-01', '2026-11-02', { now: Date.parse('2026-11-05T00:00:00Z') });
  assert.deepEqual(piv.merExcluded, { '2026-11-01': 250 });
  assert.equal(piv.netSales['2026-11-01'], 1300, 'store sales untouched');
  /* the brand counts Amazon after all */
  db.prepare(`INSERT INTO settings VALUES ('merChannels:b1', '{"counts":{"amazon":true}}')`).run();
  const piv2 = { netSales: { '2026-11-01': 1300 } };
  await storeSwitchMany({ DB }, ['b1'], { b1: piv2 }, '2026-11-01', '2026-11-02', { now: Date.parse('2026-11-05T00:00:00Z') });
  assert.equal(piv2.merExcluded, undefined);
});

console.log(`\n${n} passed`);

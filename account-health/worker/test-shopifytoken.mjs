/* Offline checks for how THIS worker gets a Shopify token (src/shopifywrite.js storeOf, 2026-11-24). Tokens expire
 * in about an hour and this worker does not hold the app secret, so it asks the profit worker to refresh over the
 * PROFIT binding and then reads the fresh token from the shared table. The token never rides in a response.
 *   node test-shopifytoken.mjs   (from account-health/worker) */
import assert from 'node:assert/strict';
import { storeOf } from './src/shopifywrite.js';
import { makeDb } from '../../profit/worker/test-d1.mjs';

const SHOP = 'lucky.myshopify.com', nowS = Math.floor(Date.now() / 1000);
let n = 0; const ok = async (name, fn) => { await fn(); n++; console.log('PASS ', name); };
const setup = (expires_at, extra = {}) => {
  const { db, DB } = makeDb();
  db.prepare(`INSERT INTO p_shopify (shop, act_id, access_token, scopes, refresh_token, expires_at, refresh_expires_at, uninstalled_at) VALUES (?,?,?,?,?,?,?,?)`)
    .run(SHOP, 'brand_lucky', extra.access_token ?? 'at1', 'read_products,write_products', 'rt1', expires_at, nowS + 9e6, extra.uninstalled_at ?? null);
  const calls = [];
  const PROFIT = { fetch: async req => { calls.push({ url: req.url, method: req.method, auth: req.headers.get('Authorization') });
    if (extra.profitDown) return new Response('{}', { status: 502 });
    db.prepare(`UPDATE p_shopify SET access_token = 'at2', refresh_token = 'rt2', expires_at = ? WHERE shop = ?`).run(nowS + 3600, SHOP);
    return Response.json({ ok: true, connected: true }); } };
  const d = { mintSession: async (env, email) => ({ token: `mds.${email}` }), xfetch: async () => { throw new Error('this worker must not ask Shopify for a token'); } };
  return { db, env: { DB, PROFIT }, d, calls };
};

await ok('a token with time left is used as is: the profit worker is not asked', async () => {
  const { env, d, calls } = setup(nowS + 1800);
  const s = await storeOf(env, 'brand_lucky', d);
  assert.equal(s.access_token, 'at1'); assert.equal(s.shop, SHOP); assert.match(s.scopes, /write_products/); assert.equal(calls.length, 0);
});
await ok('a token about to run out: the profit worker refreshes it (POST, as the owner) and the new one is read from the table', async () => {
  const { env, d, calls } = setup(nowS + 60);
  const s = await storeOf(env, 'brand_lucky', d);
  assert.equal(s.access_token, 'at2'); assert.equal(calls.length, 1); assert.equal(calls[0].method, 'POST');
  assert.equal(calls[0].url, `https://mobius-profit.mobius-digital.workers.dev/api/shopify/token-refresh?shop=${encodeURIComponent(SHOP)}`);
  assert.equal(calls[0].auth, 'Bearer mds.cole@go-mobius-digital.com');
});
await ok('the profit worker down: a token that still works is used; one that ran out means "not connected", never a dead token', async () => {
  const a = setup(nowS + 60, { profitDown: true }); assert.equal((await storeOf(a.env, 'brand_lucky', a.d)).access_token, 'at1');
  const b = setup(nowS - 60, { profitDown: true }); assert.equal(await storeOf(b.env, 'brand_lucky', b.d), null);
});
await ok('no store, an uninstalled store or an emptied token: null', async () => {
  const a = setup(nowS + 1800); assert.equal(await storeOf(a.env, 'brand_other', a.d), null);
  const b = setup(nowS + 1800, { uninstalled_at: '2026-11-01' }); assert.equal(await storeOf(b.env, 'brand_lucky', b.d), null);
  const c = setup(nowS + 1800, { access_token: '' }); assert.equal(await storeOf(c.env, 'brand_lucky', c.d), null);
});
console.log(`\n${n}/4 passed`);
if (n !== 4) process.exit(1);

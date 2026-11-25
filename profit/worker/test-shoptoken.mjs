/* Offline checks for expiring Shopify tokens (src/shoptoken.js, 2026-11-24, App Store requirement 3.1.2): a fresh
 * token is used as is, one about to run out is refreshed and the NEW refresh token is kept, an old never-expiring
 * token is swapped once, a spent refresh token disconnects the store instead of looping, a Shopify hiccup never
 * throws away a token that still works, and a worker without the app secret asks the other one.
 *   node test-shoptoken.mjs   (from profit/worker) */
import assert from 'node:assert/strict';
import { shopToken, tokenSet, exchangeSessionToken, exchangeCode, REFRESH_MARGIN_S } from './src/shoptoken.js';
import { makeDb } from './test-d1.mjs';

const SHOP = 'test-store.myshopify.com';
const NOW = 1_800_000_000_000, nowS = NOW / 1000, now = () => NOW;
const ENV = DB => ({ DB, SHOPIFY_API_KEY: 'key', SHOPIFY_API_SECRET: 'secret' });
const row = (db, shop = SHOP) => db.prepare(`SELECT * FROM p_shopify WHERE shop = ?`).get(shop);
const put = (db, o) => db.prepare(`INSERT INTO p_shopify (shop, act_id, access_token, scopes, uninstalled_at, refresh_token, expires_at, refresh_expires_at) VALUES (?,?,?,?,?,?,?,?)`)
  .run(o.shop || SHOP, o.act_id ?? null, o.access_token, o.scopes ?? 'read_orders', o.uninstalled_at ?? null, o.refresh_token ?? null, o.expires_at ?? null, o.refresh_expires_at ?? null);
/** A fake Shopify token endpoint. `answer(params)` returns [status, json]. Records every request. */
const shopify = answer => { const calls = []; const F = async (url, init) => {
  assert.equal(url, `https://${SHOP}/admin/oauth/access_token`); assert.equal(init.method, 'POST');
  assert.equal(init.headers['Content-Type'], 'application/x-www-form-urlencoded');
  const p = Object.fromEntries(new URLSearchParams(init.body)); calls.push(p);
  const [status, json] = answer(p); return new Response(JSON.stringify(json), { status });
}; F.calls = calls; return F; };
const pair = (n, o = {}) => [200, { access_token: `at${n}`, refresh_token: `rt${n}`, expires_in: 3600, refresh_token_expires_in: 7776000, scope: 'read_orders,read_products', ...o }];

let n = 0; const ok = async (name, fn) => { await fn(); n++; console.log('PASS ', name); };

await ok('a token with time left is returned as is: no call to Shopify', async () => {
  const { db, DB } = makeDb(); put(db, { access_token: 'at1', refresh_token: 'rt1', expires_at: nowS + 1800, refresh_expires_at: nowS + 9e6 });
  const F = shopify(() => { throw new Error('must not be called'); });
  assert.equal(await shopToken(ENV(DB), SHOP, { F, now }), 'at1'); assert.equal(F.calls.length, 0);
});

await ok('inside the 5 minute margin it refreshes, sends grant_type=refresh_token, and stores the NEW pair', async () => {
  const { db, DB } = makeDb(); put(db, { access_token: 'at1', refresh_token: 'rt1', expires_at: nowS + REFRESH_MARGIN_S - 1, refresh_expires_at: nowS + 100 });
  const F = shopify(() => pair(2));
  assert.equal(await shopToken(ENV(DB), SHOP, { F, now }), 'at2');
  assert.deepEqual(F.calls[0], { client_id: 'key', client_secret: 'secret', grant_type: 'refresh_token', refresh_token: 'rt1' });
  const r = row(db); assert.equal(r.access_token, 'at2'); assert.equal(r.refresh_token, 'rt2');
  assert.equal(r.expires_at, nowS + 3600); assert.equal(r.refresh_expires_at, nowS + 7776000); assert.equal(r.scopes, 'read_orders,read_products');
  // and the next read uses the stored token without another call
  assert.equal(await shopToken(ENV(DB), SHOP, { F, now }), 'at2'); assert.equal(F.calls.length, 1);
});

await ok('an already expired token is refreshed too', async () => {
  const { db, DB } = makeDb(); put(db, { access_token: 'old', refresh_token: 'rt1', expires_at: nowS - 5000, refresh_expires_at: nowS + 100 });
  assert.equal(await shopToken(ENV(DB), SHOP, { F: shopify(() => pair(3)), now }), 'at3');
});

await ok('a spent or expired refresh token (401) disconnects the store: null, token cleared, and no loop', async () => {
  const { db, DB } = makeDb(); put(db, { access_token: 'at1', refresh_token: 'rt1', expires_at: nowS - 10, refresh_expires_at: nowS - 10 });
  const F = shopify(() => [401, { error: 'invalid_request', error_description: 'This request requires an active refresh_token' }]);
  assert.equal(await shopToken(ENV(DB), SHOP, { F, now }), null);
  const r = row(db); assert.equal(r.access_token, ''); assert.equal(r.refresh_token, null); assert.equal(r.expires_at, null);
  assert.equal(await shopToken(ENV(DB), SHOP, { F, now }), null); assert.equal(F.calls.length, 1, 'a disconnected store is not retried');
});

await ok('401 because another request refreshed first: the pair it stored is used, nothing is cleared', async () => {
  const { db, DB } = makeDb(); put(db, { access_token: 'at1', refresh_token: 'rt1', expires_at: nowS + 10, refresh_expires_at: nowS + 100 });
  const F = shopify(() => { db.prepare(`UPDATE p_shopify SET access_token = 'at9', refresh_token = 'rt9', expires_at = ? WHERE shop = ?`).run(nowS + 3600, SHOP); return [401, { error: 'invalid_request' }]; });
  assert.equal(await shopToken(ENV(DB), SHOP, { F, now }), 'at9'); assert.equal(row(db).refresh_token, 'rt9');
});

await ok('two refreshes racing: the later write does not overwrite the newer pair', async () => {
  const { db, DB } = makeDb(); put(db, { access_token: 'at1', refresh_token: 'rt1', expires_at: nowS + 10, refresh_expires_at: nowS + 100 });
  const F = shopify(() => { db.prepare(`UPDATE p_shopify SET access_token = 'at8', refresh_token = 'rt8', expires_at = ? WHERE shop = ?`).run(nowS + 3600, SHOP); return pair(2); });
  assert.equal(await shopToken(ENV(DB), SHOP, { F, now }), 'at8'); assert.equal(row(db).refresh_token, 'rt8');
});

await ok('Shopify down (503): a token that still works is kept; one that ran out is an error, never cleared', async () => {
  const { db, DB } = makeDb(); put(db, { access_token: 'at1', refresh_token: 'rt1', expires_at: nowS + 60, refresh_expires_at: nowS + 100 });
  const F = shopify(() => [503, {}]);
  assert.equal(await shopToken(ENV(DB), SHOP, { F, now }), 'at1');
  db.prepare(`UPDATE p_shopify SET expires_at = ?`).run(nowS - 60);
  await assert.rejects(() => shopToken(ENV(DB), SHOP, { F, now }), /did not answer/);
  assert.equal(row(db).refresh_token, 'rt1', 'the refresh token survives a Shopify outage');
});

await ok('an old never-expiring token is swapped once (Shopify migration request), with no reinstall', async () => {
  const { db, DB } = makeDb(); put(db, { access_token: 'shpat_old' });
  const F = shopify(() => pair(5));
  assert.equal(await shopToken(ENV(DB), SHOP, { F, now }), 'at5');
  assert.deepEqual(F.calls[0], { client_id: 'key', client_secret: 'secret', grant_type: 'urn:ietf:params:oauth:grant-type:token-exchange', subject_token: 'shpat_old',
    subject_token_type: 'urn:shopify:params:oauth:token-type:offline-access-token', requested_token_type: 'urn:shopify:params:oauth:token-type:offline-access-token', expiring: '1' });
  assert.equal(row(db).refresh_token, 'rt5'); assert.equal(row(db).expires_at, nowS + 3600);
});

await ok('the migration not taking (503) keeps the old token working', async () => {
  const { db, DB } = makeDb(); put(db, { access_token: 'shpat_old' });
  assert.equal(await shopToken(ENV(DB), SHOP, { F: shopify(() => [503, {}]), now }), 'shpat_old');
  assert.equal(row(db).access_token, 'shpat_old'); assert.equal(row(db).expires_at, null);
});

await ok('not installed, uninstalled or emptied: null, and Shopify is never asked', async () => {
  const { db, DB } = makeDb(); const F = shopify(() => { throw new Error('must not be called'); });
  assert.equal(await shopToken(ENV(DB), SHOP, { F, now }), null);
  put(db, { access_token: 'at1', refresh_token: 'rt1', expires_at: nowS - 1, uninstalled_at: '2026-11-01' });
  assert.equal(await shopToken(ENV(DB), SHOP, { F, now }), null);
  db.prepare(`UPDATE p_shopify SET uninstalled_at = NULL, access_token = ''`).run();
  assert.equal(await shopToken(ENV(DB), SHOP, { F, now }), null);
});

await ok('a database that was never migrated: the columns are added on first use and the old token is swapped', async () => {
  const { db, DB } = makeDb({ legacy: true });
  db.prepare(`INSERT INTO p_shopify (shop, access_token, scopes) VALUES (?, 'shpat_old', 'read_orders')`).run(SHOP);
  assert.equal(await shopToken(ENV(DB), SHOP, { F: shopify(() => pair(6)), now }), 'at6');
  assert.equal(row(db).refresh_token, 'rt6');
});

await ok('a worker without the app secret asks the other worker, then reads the shared table; the token never travels', async () => {
  const { db, DB } = makeDb(); put(db, { access_token: 'at1', refresh_token: 'rt1', expires_at: nowS + 10, refresh_expires_at: nowS + 100 });
  const asked = [];
  const remote = async shop => { asked.push(shop); db.prepare(`UPDATE p_shopify SET access_token = 'at7', refresh_token = 'rt7', expires_at = ? WHERE shop = ?`).run(nowS + 3600, shop); };
  const F = shopify(() => { throw new Error('this worker must not call Shopify for a token'); });
  assert.equal(await shopToken({ DB }, SHOP, { F, now, remote }), 'at7'); assert.deepEqual(asked, [SHOP]);
  // fresh: no remote call
  assert.equal(await shopToken({ DB }, SHOP, { F, now, remote }), 'at7'); assert.equal(asked.length, 1);
  // the other worker unreachable: a token with time left still works, an expired one is the error
  db.prepare(`UPDATE p_shopify SET expires_at = ?`).run(nowS + 30);
  assert.equal(await shopToken({ DB }, SHOP, { F, now, remote: async () => { throw new Error('down'); } }), 'at7');
  db.prepare(`UPDATE p_shopify SET expires_at = ?`).run(nowS - 30);
  await assert.rejects(() => shopToken({ DB }, SHOP, { F, now, remote: async () => { throw new Error('down'); } }), /down/);
  assert.equal(await shopToken({ DB }, SHOP, { F, now }), null, 'no secret and no way to ask: an expired token is not handed out');
});

await ok('new tokens are asked for with expiring=1 (session token exchange and the install code)', async () => {
  const F = shopify(() => pair(1));
  const a = await exchangeSessionToken({ SHOPIFY_API_KEY: 'key', SHOPIFY_API_SECRET: 'secret' }, SHOP, 'idtok', F);
  assert.equal(F.calls[0].expiring, '1'); assert.equal(F.calls[0].subject_token, 'idtok'); assert.match(F.calls[0].grant_type, /token-exchange/);
  assert.equal(F.calls[0].requested_token_type, 'urn:shopify:params:oauth:token-type:offline-access-token');
  assert.equal(a.token, 'at1'); assert.equal(a.refresh_token, 'rt1'); assert.ok(a.expires_at > 0 && a.refresh_expires_at > a.expires_at);
  await exchangeCode({ SHOPIFY_API_KEY: 'key', SHOPIFY_API_SECRET: 'secret' }, SHOP, 'code123', F);
  assert.deepEqual(F.calls[1], { client_id: 'key', client_secret: 'secret', code: 'code123', expiring: '1' });
  assert.deepEqual(tokenSet({ access_token: 'x' }, 100), { token: 'x', scope: null, refresh_token: null, expires_at: null, refresh_expires_at: null });
});

console.log(`\n${n}/13 passed`);
if (n !== 13) process.exit(1);

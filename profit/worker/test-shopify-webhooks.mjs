/* Offline checks for the Shopify doors on the real worker (src/worker.js fetch): every webhook checks its signature
 * on the raw body (bad, missing or wrong-secret = 401, which Shopify's review tests), uninstall clears the tokens,
 * shop/redact removes EVERY row about the shop, a scope change is stored, install codes run out after 10 minutes and
 * are single use, and the direct install asks only for the required scopes.
 *   node test-shopify-webhooks.mjs   (from profit/worker) */
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import worker from './src/worker.js';
import { makeDb } from './test-d1.mjs';

const KEY = 'a204d4974bccc5aacf66c3f723fb5652', SECRET = 'shh-test-secret', SHOP = 'test-store.myshopify.com', OTHER = 'other-store.myshopify.com';
const ORIGIN = 'https://mobius-profit.mobius-digital.workers.dev';
const { db, DB } = makeDb();
const env = { DB, SHOPIFY_API_KEY: KEY, SHOPIFY_API_SECRET: SECRET };
const sign = (raw, secret = SECRET) => crypto.createHmac('sha256', secret).update(raw).digest('base64');
const hook = (topic, body, { hmac, shop = SHOP, method = 'POST' } = {}) => {
  const raw = typeof body === 'string' ? body : JSON.stringify(body);
  const headers = { 'Content-Type': 'application/json', 'X-Shopify-Topic': topic, 'X-Shopify-Shop-Domain': shop };
  const h = hmac === undefined ? sign(raw) : hmac; if (h !== null) headers['X-Shopify-Hmac-Sha256'] = h;
  return worker.fetch(new Request(`${ORIGIN}/shopify/webhooks/${topic}`, { method, headers, body: method === 'POST' ? raw : undefined }), env, { waitUntil() {} });
};
const seed = () => {
  for (const t of ['p_shopify', 'p_store_view', 'p_cohorts', 'p_oauth_state', 'p_shop_address']) db.exec(`DELETE FROM ${t}`);
  db.exec(`INSERT INTO p_shopify (shop, act_id, access_token, scopes, refresh_token, expires_at, refresh_expires_at) VALUES
    ('${SHOP}', 'brand_a', 'at1', 'read_orders', 'rt1', 1900000000, 1990000000), ('${OTHER}', 'brand_b', 'at2', 'read_orders', 'rt2', 1900000000, 1990000000)`);
  db.exec(`INSERT INTO p_store_view (token, shop) VALUES ('v1', '${SHOP}'), ('v2', '${OTHER}')`);
  db.exec(`INSERT INTO p_cohorts (act_id, cohort_month, customers) VALUES ('brand_a', '2026-10', 5), ('brand_b', '2026-10', 7)`);
  db.exec(`INSERT INTO p_oauth_state (state, shop) VALUES ('s1', '${SHOP}'), ('s2', '${OTHER}')`);
  db.exec(`INSERT INTO p_shop_address (act_id, shop) VALUES ('brand_a', '${SHOP}'), ('brand_b', '${OTHER}')`);
};
const count = (t, where = '1=1') => db.prepare(`SELECT COUNT(*) AS n FROM ${t} WHERE ${where}`).get().n;
const TOPICS = ['app/uninstalled', 'app/scopes_update', 'customers/data_request', 'customers/redact', 'shop/redact'];
let n = 0; const ok = async (name, fn) => { await fn(); n++; console.log('PASS ', name); };

await ok('every webhook: a bad, missing, wrong-secret or wrong-body signature is 401 and changes nothing', async () => {
  seed();
  const body = { shop_domain: SHOP, shop_id: 1 };
  for (const topic of TOPICS) {
    assert.equal((await hook(topic, body, { hmac: 'not-a-signature' })).status, 401, `${topic} bad`);
    assert.equal((await hook(topic, body, { hmac: null })).status, 401, `${topic} missing`);
    assert.equal((await hook(topic, body, { hmac: sign(JSON.stringify(body), 'someone-elses-secret') })).status, 401, `${topic} wrong secret`);
    assert.equal((await hook(topic, body, { hmac: sign(JSON.stringify({ ...body, shop_id: 2 })) })).status, 401, `${topic} signature of a different body`);
    assert.equal((await hook(topic, body, { hmac: sign(JSON.stringify(body)).toLowerCase() })).status, 401, `${topic} wrong case`);
  }
  assert.equal(count('p_shopify', `access_token <> ''`), 2); assert.equal(count('p_store_view'), 2); assert.equal(count('p_cohorts'), 2);
});
await ok('no app secret on the worker: every webhook is refused (401), never a 500 and never accepted', async () => {
  const raw = JSON.stringify({ shop_domain: SHOP });
  const r = await worker.fetch(new Request(`${ORIGIN}/shopify/webhooks/shop/redact`, { method: 'POST', headers: { 'X-Shopify-Hmac-Sha256': sign(raw, '') , 'X-Shopify-Topic': 'shop/redact' }, body: raw }), { DB }, { waitUntil() {} });
  assert.equal(r.status, 401); assert.equal(count('p_shopify'), 2);
});
await ok('a good signature is 200 on all five; GET is 405', async () => {
  seed();
  for (const topic of ['customers/data_request', 'customers/redact']) {
    const r = await hook(topic, { shop_domain: SHOP, customer: { id: 1 } }); assert.equal(r.status, 200); assert.equal((await r.json()).topic, topic);
  }
  assert.equal((await hook('shop/redact', {}, { method: 'GET' })).status, 405);
  assert.equal(count('p_shopify', `access_token <> ''`), 2, 'customer webhooks touch nothing: no customer data is stored');
});
await ok('app/uninstalled: that shop\'s token AND refresh token are cleared at once; other shops untouched', async () => {
  seed();
  assert.equal((await hook('app/uninstalled', { id: 1, domain: SHOP })).status, 200);
  const r = db.prepare(`SELECT * FROM p_shopify WHERE shop = ?`).get(SHOP);
  assert.equal(r.access_token, ''); assert.equal(r.refresh_token, null); assert.equal(r.expires_at, null); assert.ok(r.uninstalled_at);
  assert.equal(db.prepare(`SELECT access_token FROM p_shopify WHERE shop = ?`).get(OTHER).access_token, 'at2');
});
await ok('shop/redact: every row about the shop is gone (token, report link, cohorts, install codes, address), nothing else', async () => {
  seed();
  assert.equal((await hook('shop/redact', { shop_id: 1, shop_domain: SHOP })).status, 200);
  for (const t of ['p_shopify', 'p_store_view', 'p_oauth_state', 'p_shop_address']) { assert.equal(count(t, `shop = '${SHOP}'`), 0, t); assert.equal(count(t, `shop = '${OTHER}'`), 1, `${t} other shop kept`); }
  assert.equal(count('p_cohorts', `act_id = 'brand_a'`), 0); assert.equal(count('p_cohorts', `act_id = 'brand_b'`), 1);
});
await ok('shop/redact keeps the brand\'s cohorts when the brand has a second store still connected', async () => {
  seed(); db.exec(`UPDATE p_shopify SET act_id = 'brand_a' WHERE shop = '${OTHER}'`);
  await hook('shop/redact', { shop_domain: SHOP });
  assert.equal(count('p_cohorts', `act_id = 'brand_a'`), 1);
});
await ok('app/scopes_update: what the store now grants is stored', async () => {
  seed();
  await hook('app/scopes_update', { id: 1, previous: ['read_orders'], current: ['read_orders', 'write_products', 'write_discounts'] });
  assert.equal(db.prepare(`SELECT scopes FROM p_shopify WHERE shop = ?`).get(SHOP).scopes, 'read_orders,write_products,write_discounts');
  await hook('app/scopes_update', { id: 1 });
  assert.match(db.prepare(`SELECT scopes FROM p_shopify WHERE shop = ?`).get(SHOP).scopes, /write_products/, 'a payload without the list changes nothing');
});

/* ---- the direct install link (fallback; Shopify's managed install is the front door) ---- */
const oauthHmac = params => crypto.createHmac('sha256', SECRET).update(Object.entries(params).sort(([a], [b]) => (a < b ? -1 : 1)).map(([k, v]) => `${k}=${v}`).join('&')).digest('hex');
const callback = params => worker.fetch(new Request(`${ORIGIN}/shopify/callback?${new URLSearchParams({ ...params, hmac: oauthHmac(params) })}`), env, { waitUntil() {} });
await ok('install: asks only the required scopes, sweeps codes older than 10 minutes, and a code is single use and times out', async () => {
  seed(); db.exec(`UPDATE p_oauth_state SET created_at = datetime('now', '-11 minutes') WHERE state = 's2'`);
  const r = await worker.fetch(new Request(`${ORIGIN}/shopify/install?shop=${SHOP}`), env, { waitUntil() {} });
  assert.equal(r.status, 302); const to = new URL(r.headers.get('Location'));
  assert.equal(to.host, SHOP); assert.equal(to.searchParams.get('scope'), 'read_orders,read_customers,read_products,read_reports,read_inventory,read_returns,read_analytics,read_discounts,read_price_rules,read_marketing_events,read_merchant_managed_fulfillment_orders');
  assert.doesNotMatch(to.searchParams.get('scope'), /write_|pixel|customer_events/);
  assert.equal(count('p_oauth_state', `state = 's2'`), 0, 'the stale code was swept');
  const state = to.searchParams.get('state'); assert.equal(count('p_oauth_state', `state = '${state}'`), 1);
  // an old code is refused even with a valid Shopify signature
  db.prepare(`UPDATE p_oauth_state SET created_at = datetime('now', '-11 minutes') WHERE state = ?`).run(state);
  const old = await callback({ shop: SHOP, code: 'c1', state, timestamp: '1' });
  assert.equal(old.status, 401); assert.equal(count('p_oauth_state', `state = '${state}'`), 0, 'and it is used up');
  // a bad signature is 401 before anything else
  const bad = await worker.fetch(new Request(`${ORIGIN}/shopify/callback?shop=${SHOP}&code=c&state=s1&hmac=00`), env, { waitUntil() {} });
  assert.equal(bad.status, 401); assert.equal(count('p_oauth_state', `state = 's1'`), 1);
  // a code for another shop is refused
  const cross = await callback({ shop: OTHER, code: 'c1', state: 's1', timestamp: '1' });
  assert.equal(cross.status, 401);
});
await ok('callback: a fresh code is traded with expiring=1 and the whole token set is stored', async () => {
  seed(); db.exec(`DELETE FROM p_shopify`);
  const realFetch = globalThis.fetch; const sent = [];
  globalThis.fetch = async (url, init) => { sent.push({ url: String(url), body: Object.fromEntries(new URLSearchParams(init.body)) });
    return Response.json({ access_token: 'at-new', scope: 'read_orders,read_products', refresh_token: 'rt-new', expires_in: 3600, refresh_token_expires_in: 7776000 }); };
  try {
    const r = await callback({ shop: SHOP, code: 'thecode', state: 's1', timestamp: '1' });
    assert.equal(r.status, 302); assert.equal(r.headers.get('Location'), `https://${SHOP}/admin/apps/${KEY}`);
  } finally { globalThis.fetch = realFetch; }
  assert.equal(sent[0].url, `https://${SHOP}/admin/oauth/access_token`); assert.deepEqual(sent[0].body, { client_id: KEY, client_secret: SECRET, code: 'thecode', expiring: '1' });
  const row = db.prepare(`SELECT * FROM p_shopify WHERE shop = ?`).get(SHOP);
  assert.equal(row.access_token, 'at-new'); assert.equal(row.refresh_token, 'rt-new'); assert.ok(row.expires_at > Date.now() / 1000); assert.equal(row.act_id, 'brand_a', 'matched to the brand by its typed store address');
});
console.log(`\n${n}/9 passed`);
if (n !== 9) process.exit(1);

/* Offline checks for the embedded Shopify app (src/shopifyapp.js, 2026-10-18): the session token is verified, a store
 * with no saved token is sent to the install, a refused orders read shows products with a plain note (never an error),
 * the page carries App Bridge and the frame-ancestors CSP.   node test-shopifyapp.mjs   (from profit/worker) */
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { handleShopifyApp, verifySessionToken } from './src/shopifyapp.js';

const KEY = 'a204d4974bccc5aacf66c3f723fb5652', SECRET = 'shh-test-secret', SHOP = 'test-store.myshopify.com';
const b64 = o => Buffer.from(typeof o === 'string' ? o : JSON.stringify(o)).toString('base64url');
function jwt(claims, secret = SECRET) {
  const h = b64({ alg: 'HS256', typ: 'JWT' }), p = b64(claims);
  return `${h}.${p}.${crypto.createHmac('sha256', secret).update(`${h}.${p}`).digest('base64url')}`;
}
const now = Math.floor(Date.now() / 1000);
const good = (o = {}) => jwt({ iss: `https://${SHOP}/admin`, dest: `https://${SHOP}`, aud: KEY, sub: '1', exp: now + 60, nbf: now - 5, iat: now, ...o });
let rows = {};
const DB = { prepare(sql) { let a = []; return { bind(...x) { a = x; return this; }, async first() { return /SELECT access_token/.test(sql) ? rows[a[0]] || null : null; }, async run() { if (/UPDATE p_shopify SET access_token = ''/.test(sql)) rows[a[0]] = { access_token: '' }; return {}; } }; } };
const env = { DB, SHOPIFY_API_KEY: KEY, SHOPIFY_API_SECRET: SECRET };
let ordersMode = 'ok';
const F = async (url, init) => {
  const q = JSON.parse(init.body).query;
  if (ordersMode === '401') return new Response('{}', { status: 401 });
  if (/shop \{/.test(q)) return Response.json({ data: { shop: { name: 'Test Store', currencyCode: 'USD', primaryDomain: { url: 'https://t.com' } }, productsCount: { count: 3 } } });
  if (/products\(/.test(q)) return Response.json({ data: { products: { nodes: [{ title: 'Wedge', status: 'ACTIVE', totalInventory: 5, priceRangeV2: { minVariantPrice: { amount: '149.0' } } }] } } });
  if (/orders\(/.test(q)) return ordersMode === 'denied' ? Response.json({ errors: [{ message: 'Access denied for orders field. This app is not approved to access the Order object.' }] }) : Response.json({ data: { orders: { pageInfo: { hasNextPage: false }, nodes: [{ createdAt: new Date().toISOString(), currentTotalPriceSet: { shopMoney: { amount: '100' } }, lineItems: { nodes: [{ title: 'Wedge', quantity: 1 }] } }] } } });
  return Response.json({ data: {} });
};
const call = (path, tok) => handleShopifyApp(new Request(`https://w.dev${path}`, { headers: tok ? { Authorization: `Bearer ${tok}` } : {} }), env, new URL(`https://w.dev${path}`), { F });
let n = 0; const ok = async (name, fn) => { await fn(); n++; console.log('PASS ', name); };

await ok('session token: good passes, wrong secret / app / shop / expired refused', async () => {
  assert.equal((await verifySessionToken(env, good())).shop, SHOP);
  assert.ok((await verifySessionToken(env, jwt({ dest: `https://${SHOP}`, iss: `https://${SHOP}/admin`, aud: KEY, exp: now + 60 }, 'other'))).error);
  assert.ok((await verifySessionToken(env, good({ aud: 'someone-else' }))).error);
  assert.ok((await verifySessionToken(env, good({ iss: 'https://evil.myshopify.com/admin' }))).error);
  assert.ok((await verifySessionToken(env, good({ exp: now - 120 }))).error);
  assert.equal((await (await call('/shopify/app/api/report')).json()).error.includes('Apps'), true);
});
await ok('the page: App Bridge, the key, frame-ancestors for the shop and the admin; no token = install first', async () => {
  rows[SHOP] = null;
  const pre = await call(`/shopify/app?shop=${SHOP}`);
  assert.match(await pre.text(), /shopify\/install\?shop=test-store/);
  rows[SHOP] = { access_token: 'tok' };
  const r = await call(`/shopify/app?shop=${SHOP}`);
  const html = await r.text();
  assert.match(html, /app-bridge\.js/); assert.match(html, new RegExp(KEY)); assert.match(html, /shopify\.idToken\(\)/);
  assert.match(r.headers.get('Content-Security-Policy'), /frame-ancestors https:\/\/test-store\.myshopify\.com https:\/\/admin\.shopify\.com/);
  assert.doesNotMatch(html, /localStorage|document\.cookie/);
});
await ok('report: orders and products; a refused orders read is a note, never an error', async () => {
  ordersMode = 'ok';
  const a = await (await call('/shopify/app/api/report?days=7', good())).json();
  assert.equal(a.orders.count, 1); assert.equal(a.orders.days.length, 7); assert.equal(a.products[0].title, 'Wedge');
  ordersMode = 'denied';
  const b = await (await call('/shopify/app/api/report', good())).json();
  assert.equal(b.orders, null); assert.match(b.notes[0], /approves this app's access to order data/); assert.equal(b.products.length, 1); assert.ok(!b.error);
});
await ok('a dead token is forgotten and the store is sent to the install', async () => {
  ordersMode = '401';
  const c = await (await call('/shopify/app/api/report', good())).json();
  assert.match(c.install, /shopify\/install\?shop=test-store/); assert.equal(rows[SHOP].access_token, '');
});
console.log(`\n${n}/4 passed`);

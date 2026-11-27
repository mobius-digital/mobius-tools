/* Offline checks for the embedded Shopify app (src/shopifyapp.js): the session token is verified (and MUST carry an
 * expiry), a store with no saved token gets one by token exchange (the expiring kind), a refused orders read shows
 * products with a plain note (never an error), the page carries App Bridge and the frame-ancestors CSP, says nothing
 * about an agency, and optional access is asked for inside the app.   node test-shopifyapp.mjs   (from profit/worker) */
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { handleShopifyApp, verifySessionToken, OPTIONAL_SCOPES } from './src/shopifyapp.js';
import { makeDb } from './test-d1.mjs';

const KEY = 'a204d4974bccc5aacf66c3f723fb5652', SECRET = 'shh-test-secret', SHOP = 'test-store.myshopify.com';
const b64 = o => Buffer.from(typeof o === 'string' ? o : JSON.stringify(o)).toString('base64url');
function jwt(claims, secret = SECRET) {
  const h = b64({ alg: 'HS256', typ: 'JWT' }), p = b64(claims);
  return `${h}.${p}.${crypto.createHmac('sha256', secret).update(`${h}.${p}`).digest('base64url')}`;
}
const now = Math.floor(Date.now() / 1000);
const good = (o = {}) => jwt({ iss: `https://${SHOP}/admin`, dest: `https://${SHOP}`, aud: KEY, sub: '1', exp: now + 60, nbf: now - 5, iat: now, ...o });
const { db, DB } = makeDb();
const env = { DB, SHOPIFY_API_KEY: KEY, SHOPIFY_API_SECRET: SECRET };
const row = () => db.prepare(`SELECT * FROM p_shopify WHERE shop = ?`).get(SHOP);
const setRow = o => { db.prepare(`DELETE FROM p_shopify`).run(); if (o) db.prepare(`INSERT INTO p_shopify (shop, access_token, scopes, refresh_token, expires_at, refresh_expires_at) VALUES (?,?,?,?,?,?)`).run(SHOP, o.access_token, o.scopes ?? 'read_orders', o.refresh_token ?? 'rt0', o.expires_at ?? now + 3000, o.refresh_expires_at ?? now + 9e6); };
let ordersMode = 'ok', exchanged = 0, granted = ['read_orders', 'read_products'];
const tokenCalls = [];
const F = async (url, init) => {
  if (/oauth\/access_token/.test(url)) {
    const b = Object.fromEntries(new URLSearchParams(init.body)); tokenCalls.push(b);
    assert.match(b.grant_type, /token-exchange/); assert.equal(b.expiring, '1'); exchanged++;
    return Response.json({ access_token: 'fresh', scope: 'read_orders', refresh_token: 'rt-fresh', expires_in: 3600, refresh_token_expires_in: 7776000 });
  }
  const q = JSON.parse(init.body).query;
  if (ordersMode === '401' && init.headers['X-Shopify-Access-Token'] !== 'fresh') return new Response('{}', { status: 401 });
  if (/currentAppInstallation/.test(q)) return Response.json({ data: { currentAppInstallation: { accessScopes: granted.map(handle => ({ handle })) } } });
  if (/shop \{/.test(q)) return Response.json({ data: { shop: { name: 'Test Store', currencyCode: 'USD', primaryDomain: { url: 'https://t.com' } }, productsCount: { count: 3 } } });
  if (/products\(/.test(q)) return Response.json({ data: { products: { nodes: [{ title: 'Wedge', status: 'ACTIVE', totalInventory: 5, priceRangeV2: { minVariantPrice: { amount: '149.0' } } }] } } });
  if (/orders\(/.test(q)) return ordersMode === 'denied' ? Response.json({ errors: [{ message: 'Access denied for orders field. This app is not approved to access the Order object.' }] }) : Response.json({ data: { orders: { pageInfo: { hasNextPage: false }, nodes: [{ createdAt: new Date().toISOString(), currentTotalPriceSet: { shopMoney: { amount: '100' } }, lineItems: { nodes: [{ title: 'Wedge', quantity: 1 }] } }] } } });
  return Response.json({ data: {} });
};
const call = (path, tok, method = 'GET') => handleShopifyApp(new Request(`https://w.dev${path}`, { method, headers: tok ? { Authorization: `Bearer ${tok}` } : {} }), env, new URL(`https://w.dev${path}`), { F });
let n = 0; const ok = async (name, fn) => { await fn(); n++; console.log('PASS ', name); };

await ok('session token: good passes; wrong secret / app / shop / expired / NO EXPIRY refused', async () => {
  assert.equal((await verifySessionToken(env, good())).shop, SHOP);
  assert.ok((await verifySessionToken(env, jwt({ dest: `https://${SHOP}`, iss: `https://${SHOP}/admin`, aud: KEY, exp: now + 60 }, 'other'))).error);
  assert.ok((await verifySessionToken(env, good({ aud: 'someone-else' }))).error);
  assert.ok((await verifySessionToken(env, good({ iss: 'https://evil.myshopify.com/admin' }))).error);
  assert.ok((await verifySessionToken(env, good({ exp: now - 120 }))).error);
  assert.equal((await verifySessionToken(env, good({ exp: undefined }))).error, 'expired', 'a token with no exp is refused');
  assert.equal((await verifySessionToken(env, good({ exp: 'never' }))).error, 'expired');
  assert.equal((await (await call('/shopify/app/api/report')).json()).error.includes('Apps'), true);
});
await ok('the page: App Bridge, the key, frame-ancestors for the shop and the admin; outside the admin = into the admin', async () => {
  setRow(null);
  // Outside the admin: into the admin, where Shopify's managed install runs.
  const top = await call(`/shopify/app?shop=${SHOP}&hmac=x&timestamp=1`);
  assert.equal(top.status, 302); assert.equal(top.headers.get('Location'), `https://${SHOP}/admin/apps/${KEY}`);
  // Inside the frame with no token yet: the page itself (it connects through token exchange).
  const r = await call(`/shopify/app?shop=${SHOP}&embedded=1`);
  const html = await r.text();
  assert.match(html, /app-bridge\.js/); assert.match(html, new RegExp(KEY)); assert.match(html, /shopify\.idToken\(\)/);
  assert.match(r.headers.get('Content-Security-Policy'), /frame-ancestors https:\/\/test-store\.myshopify\.com https:\/\/admin\.shopify\.com/);
  assert.doesNotMatch(html, /localStorage|document\.cookie/);
  assert.doesNotMatch(html, /\/shopify\/install/, 'the page never sends the browser to our own install address');
});
await ok('requirement 1.1.14: no agency wording, no contact button, no email link on the screen', async () => {
  const html = await (await call(`/shopify/app?shop=${SHOP}&embedded=1`)).text();
  assert.doesNotMatch(html, /agency|runs your ads|our team|Talk to|mailto:|contact/i);
  assert.match(html, /sales, orders and products, read live from Shopify/);
});
await ok('opened with no shop (or a bad one): one plain line, never a page that cannot load', async () => {
  for (const p of ['/shopify/app', '/shopify/app?shop=evil.com', '/shopify/app?embedded=1']) {
    const r = await call(p); const html = await r.text();
    assert.equal(r.status, 200); assert.match(html, /Open this app from Apps in your Shopify admin\./);
    assert.doesNotMatch(html, /app-bridge\.js|Could not load/);
    assert.match(r.headers.get('Content-Security-Policy'), /^frame-ancestors https:\/\/admin\.shopify\.com;$/);
  }
});
await ok('report: orders and products; a refused orders read is a note, never an error', async () => {
  ordersMode = 'ok'; setRow({ access_token: 'tok' });
  const a = await (await call('/shopify/app/api/report?days=7', good())).json();
  assert.equal(a.orders.count, 1); assert.equal(a.orders.days.length, 7); assert.equal(a.products[0].title, 'Wedge');
  ordersMode = 'denied';
  const b = await (await call('/shopify/app/api/report', good())).json();
  assert.equal(b.orders, null); assert.match(b.notes[0], /approves this app's access to order data/); assert.equal(b.products.length, 1); assert.ok(!b.error);
});
await ok('a dead token is swapped for a fresh one by token exchange, once, and the expiring pair is stored', async () => {
  ordersMode = '401'; setRow({ access_token: 'tok' }); exchanged = 0;
  const c = await (await call('/shopify/app/api/report', good())).json();
  assert.equal(exchanged, 1); assert.equal(c.shop.name, 'Test Store'); assert.ok(!c.error);
  const r = row(); assert.equal(r.access_token, 'fresh'); assert.equal(r.refresh_token, 'rt-fresh'); assert.ok(r.expires_at > now + 3000);
});
await ok('no token yet (fresh managed install): exchanged with expiring=1, the whole set handed to saveToken, then the report', async () => {
  ordersMode = 'ok'; setRow(null); exchanged = 0; const saved = [];
  const tok = good();
  const r = await handleShopifyApp(new Request('https://w.dev/shopify/app/api/report', { headers: { Authorization: `Bearer ${tok}` } }), env, new URL('https://w.dev/shopify/app/api/report'), { F, saveToken: async (...a) => saved.push(a) });
  const d = await r.json();
  assert.equal(exchanged, 1); assert.equal(saved[0][0], SHOP); assert.equal(d.orders.count, 1);
  assert.equal(saved[0][1].token, 'fresh'); assert.equal(saved[0][1].refresh_token, 'rt-fresh'); assert.ok(saved[0][1].expires_at > now); assert.ok(saved[0][1].refresh_expires_at > saved[0][1].expires_at);
  assert.equal(tokenCalls.at(-1).subject_token, tok); assert.equal(tokenCalls.at(-1).subject_token_type, 'urn:ietf:params:oauth:token-type:id_token');
});
await ok('optional access: asked for in the app, not at install; the store\'s answer is read back from Shopify and stored', async () => {
  assert.deepEqual(OPTIONAL_SCOPES, ['write_products', 'write_discounts']);
  const html = await (await call(`/shopify/app?shop=${SHOP}&embedded=1`)).text();
  assert.match(html, /shopify\.scopes\.request\(OPT\)/); assert.match(html, /shopify\.scopes\.revoke\(OPT\)/); assert.match(html, /Allow product and discount updates/);
  setRow({ access_token: 'tok', scopes: 'read_orders,read_products' }); ordersMode = 'ok';
  assert.equal((await call('/shopify/app/api/scopes', good())).status, 405, 'GET is refused');
  assert.equal((await call('/shopify/app/api/scopes', null, 'POST')).status, 401, 'no session token = 401');
  granted = ['read_orders', 'read_products', 'write_products', 'write_discounts'];
  const a = await (await call('/shopify/app/api/scopes', good(), 'POST')).json();
  assert.equal(a.ok, true); assert.equal(row().scopes, granted.join(','));
  granted = ['read_orders', 'read_products'];
  await call('/shopify/app/api/scopes', good(), 'POST'); assert.equal(row().scopes, 'read_orders,read_products', 'removing it is stored too');
});
await ok('a newly granted REQUIRED scope buys a fresh token once; write_x standing in for read_x is not new', async () => {
  ordersMode = 'ok'; setRow({ access_token: 'tok', scopes: 'read_orders,read_products' }); exchanged = 0;
  granted = ['read_orders', 'read_products', 'read_analytics'];
  await call('/shopify/app/api/scopes', good(), 'POST');
  assert.equal(exchanged, 1, 'read_analytics is new: one exchange'); assert.equal(row().access_token, 'fresh');
  await call('/shopify/app/api/scopes', good(), 'POST');
  assert.equal(exchanged, 1, 'the next open does not exchange again');
  setRow({ access_token: 'tok', scopes: 'read_orders,write_products' }); exchanged = 0;
  granted = ['read_orders', 'read_products', 'write_products'];
  await call('/shopify/app/api/scopes', good(), 'POST');
  assert.equal(exchanged, 0, 'read_products was already held through write_products');
  granted = ['read_orders', 'read_products'];
});
/* Review feedback 2026-11-16 (2.1.1 + 2.1.4): the reviewer's screen showed three empty panels and "Shopify did not
   answer just now. Try Refresh." A failed read must never blank the panels that can be filled. */
await ok('review 2.1.1 / 2.1.4: the store read failing does not blank the panels; products and orders still show', async () => {
  ordersMode = 'ok'; setRow({ access_token: 'tok' }); exchanged = 0;
  const G = async (url, init) => { const q = init.body && !/oauth/.test(url) ? JSON.parse(init.body).query : ''; return /shop \{/.test(q) ? Response.json({ errors: [{ message: 'Internal error' }] }) : F(url, init); };
  const d = await (await handleShopifyApp(new Request('https://w.dev/shopify/app/api/report', { headers: { Authorization: `Bearer ${good()}` } }), env, new URL('https://w.dev/shopify/app/api/report'), { F: G })).json();
  assert.ok(!d.error); assert.equal(d.shop.name, 'test-store'); assert.equal(d.products.length, 1); assert.equal(d.orders.count, 1); assert.equal(d.shop.products, 1);
  assert.equal(exchanged, 0, 'a partial report is shown as it is, no token swap');
});
await ok('review 2.1.1 / 2.1.4: a stored token Shopify will not read with (not a 401) is swapped once, then the panels fill', async () => {
  ordersMode = 'ok'; setRow({ access_token: 'stale' }); exchanged = 0;
  const G = async (url, init) => (!/oauth/.test(url) && init.headers['X-Shopify-Access-Token'] === 'stale') ? new Response('{}', { status: 403 }) : F(url, init);
  const d = await (await handleShopifyApp(new Request('https://w.dev/shopify/app/api/report', { headers: { Authorization: `Bearer ${good()}` } }), env, new URL('https://w.dev/shopify/app/api/report'), { F: G })).json();
  assert.equal(exchanged, 1); assert.ok(!d.error); assert.equal(d.shop.name, 'Test Store'); assert.equal(d.orders.count, 1); assert.equal(row().access_token, 'fresh');
});
await ok('Shopify refusing every read even with a fresh token: one plain line, one exchange, the stored pair kept', async () => {
  setRow({ access_token: 'tok' }); exchanged = 0;
  const G = async (url, init) => /oauth/.test(url) ? F(url, init) : new Response('{}', { status: 503 });
  const d = await (await handleShopifyApp(new Request('https://w.dev/shopify/app/api/report', { headers: { Authorization: `Bearer ${good()}` } }), env, new URL('https://w.dev/shopify/app/api/report'), { F: G })).json();
  assert.equal(d.error, 'Shopify did not answer just now. Try Refresh.'); assert.equal(exchanged, 1); assert.ok(row().access_token);
});
await ok('orders are asked for inside Shopify\'s 1,000 point query limit, newest first, and more than one page adds up', async () => {
  setRow({ access_token: 'tok' }); let pages = 0, first = null;
  const node = { createdAt: new Date().toISOString(), currentTotalPriceSet: { shopMoney: { amount: '10' } }, lineItems: { nodes: [{ title: 'Wedge', quantity: 2 }] } };
  const G = async (url, init) => {
    const b = /oauth/.test(url) ? null : JSON.parse(init.body);
    if (!b || !/orders\(/.test(b.query)) return F(url, init);
    first ??= +b.query.match(/orders\(first: (\d+)/)[1]; pages++;
    return Response.json({ data: { orders: { pageInfo: { hasNextPage: pages < 3, endCursor: 'c' + pages }, nodes: [node, node] } } });
  };
  const d = await (await handleShopifyApp(new Request('https://w.dev/shopify/app/api/report', { headers: { Authorization: `Bearer ${good()}` } }), env, new URL('https://w.dev/shopify/app/api/report'), { F: G })).json();
  assert.ok(first * 15 + 2 <= 1000, `orders(first: ${first}) with 10 line items stays under 1,000 points`);
  assert.equal(pages, 3); assert.equal(d.orders.count, 6); assert.equal(d.orders.revenue, 60); assert.equal(d.orders.top[0].qty, 12); assert.equal(d.orders.truncated, false);
});
console.log(`\n${n}/13 passed`);
if (n !== 13) process.exit(1);

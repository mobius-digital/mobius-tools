// The required scopes are ONE list (src/shopifyapp.js REQUIRED_SCOPES); shopify.app.toml `scopes` must match it exactly,
// or the next `shopify app deploy` undoes a change made in the Dev Dashboard. Run: node test-scopes.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { REQUIRED_SCOPES, OPTIONAL_SCOPES, holdsScope, missingScopes } from './src/shopifyapp.js';
const toml = readFileSync(new URL('../shopify.app.toml', import.meta.url), 'utf8');
const req = (toml.match(/^scopes\s*=\s*"([^"]*)"/m) || [])[1];
assert.ok(req, 'toml has a scopes line');
assert.deepEqual(req.split(','), REQUIRED_SCOPES, 'toml scopes = REQUIRED_SCOPES, same order');
const opt = (toml.match(/^optional_scopes\s*=\s*\[([^\]]*)\]/m) || [])[1];
assert.deepEqual(opt.split(',').map(s => s.trim().replace(/"/g, '')).filter(Boolean), OPTIONAL_SCOPES, 'optional_scopes match');
assert.ok(!REQUIRED_SCOPES.some(s => s.startsWith('write_')), 'no write scope is required');
const src = readFileSync(new URL('./src/worker.js', import.meta.url), 'utf8');
assert.match(src, /const SHOPIFY_SCOPES = REQUIRED_SCOPES\.join\(','\);/, 'worker.js builds SHOPIFY_SCOPES from the one list');
assert.match(src, /path === '\/shopify\/app\/api\/scopes'/, 'worker.js routes the scopes call to the app handler');
// write_x implies read_x: Shopify lists only the write scope when both are held
const all = REQUIRED_SCOPES.join(',');
assert.deepEqual(missingScopes(all), [], 'holding every scope = nothing missing');
const short = REQUIRED_SCOPES.filter(s => s !== 'read_products' && s !== 'read_discounts').concat(['write_products', 'write_discounts']).join(',');
assert.deepEqual(missingScopes(short), [], 'write_products / write_discounts stand in for their reads');
assert.ok(holdsScope(new Set(['write_products']), 'read_products'), 'a Set works too');
assert.ok(!holdsScope('read_products', 'write_products'), 'a read never implies the write');
const old = 'read_orders,read_customers,read_products,read_reports,read_inventory,read_returns';
assert.deepEqual(missingScopes(old), ['read_analytics', 'read_discounts', 'read_price_rules', 'read_marketing_events', 'read_merchant_managed_fulfillment_orders'], 'an old install lists the five new scopes');
assert.equal(missingScopes(null).length, REQUIRED_SCOPES.length, 'no scopes stored = all missing, no throw');
console.log('ok  scopes: toml, REQUIRED_SCOPES and SHOPIFY_SCOPES agree; holdsScope and missingScopes');

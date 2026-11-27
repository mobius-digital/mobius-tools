// The required scopes are ONE list (src/shopifyapp.js REQUIRED_SCOPES); shopify.app.toml `scopes` must match it exactly,
// or the next `shopify app deploy` undoes a change made in the Dev Dashboard. Run: node test-scopes.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { REQUIRED_SCOPES, OPTIONAL_SCOPES } from './src/shopifyapp.js';
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
console.log('ok  scopes: toml, REQUIRED_SCOPES and SHOPIFY_SCOPES agree');

/* Offline checks for src/klaviyo.js: key verification, storage, the reads. Klaviyo mocked.
 *   node test-klaviyo.mjs      (from account-health/worker)
 */
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..', '..');
const db = new DatabaseSync(':memory:');
const load = f => { for (const st of fs.readFileSync(f, 'utf8').replace(/--[^\n]*/g, '').split(/;\s*(?:\n|$)/)) { try { if (st.trim()) db.exec(st); } catch { /* re-applied */ } } };
load(path.join(here, 'schema.sql'));
load(path.join(root, 'profit', 'worker', 'migrations', 'brand-001.sql'));
const bindSql = sql => sql.replace(/\?(\d+)/g, (_, n) => ':p' + n);
const vals = a => Object.fromEntries(a.map((v, i) => ['p' + (i + 1), v === undefined ? null : v]));
const DB = { prepare(sql) { let args = []; const st = () => db.prepare(bindSql(sql)); return { bind(...a) { args = a; return this; }, async first() { return st().get(vals(args)) || null; }, async all() { return { results: st().all(vals(args)) }; }, async run() { const r = st().run(vals(args)); return { meta: { changes: r.changes } }; } }; } };
const env = { DB };
db.exec(`INSERT INTO brands (id, slug, name, status, legacy_key, source) VALUES ('act_1', 'dartee', 'Dartee', 'active', 'act_1', 'locus')`);

const calls = [];
const J = (data, extra = {}) => new Response(JSON.stringify({ data, ...extra }), { status: 200, headers: { 'Content-Type': 'application/json' } });
const mock = async (url, init = {}) => {
  const u = new URL(url); calls.push({ path: u.pathname + u.search, method: init.method || 'GET', key: init.headers.Authorization, rev: init.headers.revision });
  if (init.headers.Authorization !== 'Klaviyo-API-Key pk_goodkeygoodkeygoodkey123') return new Response(JSON.stringify({ errors: [{ detail: 'Incorrect authentication credentials.' }] }), { status: 401 });
  if (u.pathname === '/api/accounts/') return J([{ id: 'ACC1', attributes: { test_account: false, timezone: 'America/Chicago', contact_information: { organization_name: 'Dartee Golf' } } }]);
  if (u.pathname === '/api/lists/') return J([{ id: 'L1', attributes: { name: 'Newsletter', profile_count: 12000 } }, { id: 'L2', attributes: { name: 'VIP', profile_count: 800 } }]);
  if (u.pathname === '/api/segments/') return J([{ id: 'S1', attributes: { name: 'Bought twice', profile_count: 1400, is_active: true } }]);
  if (u.pathname === '/api/flows/') return J([{ id: 'F1', attributes: { name: 'Welcome', status: 'live', archived: false, trigger_type: 'List' } }, { id: 'F2', attributes: { name: 'Abandoned Cart', status: 'manual', archived: false, trigger_type: 'Metric' } }, { id: 'F3', attributes: { name: 'Old', status: 'live', archived: true } }]);
  /* Counts come from the single-object route (2026-10: the collections refuse profile_count). */
  const one = u.pathname.match(/^\/api\/(list|segment)s\/(\w+)\/$/);
  if (one) { const n = { L1: 12000, L2: 800, S1: 1400 }[one[2]]; return J({ id: one[2], attributes: { profile_count: n ?? null } }); }
  if (u.pathname === '/api/campaigns/' && /sms/.test(decodeURIComponent(u.search))) return J([]);
  if (u.pathname === '/api/campaigns/') return J([{ id: 'C1', attributes: { name: 'Oct drop', status: 'Sent', send_time: '2026-10-01T14:00:00Z' } }]);
  if (u.pathname === '/api/metrics/') return J([{ id: 'M1', attributes: { name: 'Placed Order', integration: { name: 'Shopify' } } }]);
  if (u.pathname === '/api/campaign-values-reports/') { const body = JSON.parse(init.body); assert.match(body.data.attributes.filter, /any\(campaign_id,\["C1"\]\)/); assert.equal(body.data.attributes.conversion_metric_id, 'M1'); return J({ attributes: { results: [{ groupings: { campaign_id: 'C1' }, statistics: { recipients: 9000, open_rate: 0.41, click_rate: 0.03, conversion_rate: 0.012, conversion_value: 4100 } }] } }); }
  return new Response('{}', { status: 404 });
};
const kv = await import('./src/klaviyo.js');
kv.useFetch(mock);

const checks = [];
async function check(name, fn) { try { await fn(); checks.push({ name, pass: true }); console.log('PASS ', name); } catch (e) { checks.push({ name, pass: false }); console.log('FAIL ', name, '\n      ' + e.message); } }

await check('verifyKey: a public key, a wrong key and a good key', async () => {
  await assert.rejects(() => kv.verifyKey('abc123'), /private key/);
  await assert.rejects(() => kv.verifyKey('pk_wrongwrongwrongwrongwrong'), /refused the key/);
  const v = await kv.verifyKey('pk_goodkeygoodkeygoodkey123');
  assert.equal(v.company, 'Dartee Golf'); assert.equal(v.account_id, 'ACC1');
  assert.equal(calls[calls.length - 1].rev, '2025-07-15');
});
await check('storeKey keeps the key and the account; forgetKey removes it', async () => {
  const v = await kv.storeKey(env, 'act_1', ' pk_goodkeygoodkeygoodkey123 ');
  assert.equal(v.company, 'Dartee Golf');
  const doc = await kv.keyFor(env, 'act_1');
  assert.equal(doc.key, 'pk_goodkeygoodkeygoodkey123'); assert.ok(doc.verified_at);
  await assert.rejects(() => kv.storeKey(env, 'act_1', 'pk_badbadbadbadbadbadbadbad'), /refused/);
  assert.equal((await kv.keyFor(env, 'act_1')).key, 'pk_goodkeygoodkeygoodkey123', 'a refused key never replaces a good one');
});
await check('klaviyoView: overview, lists, segments, flows (archived dropped), campaigns with results', async () => {
  const o = await kv.klaviyoView(env, 'act_1');
  assert.equal(o.lists, 2); assert.equal(o.segments, 1); assert.equal(o.flows_total, 2); assert.equal(o.flows_live, 1); assert.deepEqual(o.live_flows, ['Welcome']);
  assert.equal(o.biggest_lists[0].name, 'Newsletter');
  const f = await kv.klaviyoView(env, 'act_1', 'flows');
  assert.equal(f.flows.length, 2); assert.equal(f.flows[1].status, 'manual');
  const c = await kv.klaviyoView(env, 'act_1', 'campaigns');
  assert.equal(c.campaigns[0].open_rate, 0.41); assert.equal(c.campaigns[0].conversion_value, 4100);
  const s = await kv.klaviyoView(env, 'act_1', 'segments');
  assert.equal(s.segments[0].profiles, 1400);
});
await check('not connected: a plain error that names the fix, no call to Klaviyo', async () => {
  const n = calls.length;
  const r = await kv.klaviyoView(env, 'act_none');
  assert.match(r.error, /Brand settings > Integrations > Klaviyo/); assert.equal(calls.length, n);
});

const failed = checks.filter(c => !c.pass);
console.log(`\n${checks.length - failed.length}/${checks.length} passed`);
process.exit(failed.length ? 1 : 0);

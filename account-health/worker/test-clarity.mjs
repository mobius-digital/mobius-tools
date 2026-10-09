/* Offline checks for src/clarity.js (Microsoft Clarity Data Export) and the Klaviyo message read (what=message).
 *   node test-clarity.mjs      (from account-health/worker)
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

const TOKEN = 'eyJhbGciOiJSUzI1NiJ9.' + Buffer.from(JSON.stringify({ sub: 'x', projectId: 'abc123proj' })).toString('base64url') + '.sig';
let calls = 0;
const SAMPLE = [
  { metricName: 'Traffic', information: [{ totalSessionCount: '900', totalBotSessionCount: '10', distantUserCount: '700', PagesPerSessionPercentage: 2.1, URL: 'https://brand.com/' }, { totalSessionCount: '300', totalBotSessionCount: '2', distantUserCount: '250', PagesPerSessionPercentage: 1.4, URL: 'https://brand.com/products/x' }] },
  { metricName: 'ScrollDepth', information: [{ averageScrollDepth: 55.2, URL: 'https://brand.com/' }, { averageScrollDepth: 31, URL: 'https://brand.com/products/x' }] },
  { metricName: 'RageClickCount', information: [{ sessionsCount: '300', sessionsWithMetricPercentage: 6.5, subTotal: '40', URL: 'https://brand.com/products/x' }] },
  { metricName: 'DeadClickCount', information: [{ sessionsCount: '900', sessionsWithMetricPercentage: 12, subTotal: '300', URL: 'https://brand.com/' }] },
  { metricName: 'QuickbackClick', information: [{ sessionsCount: '300', sessionsWithMetricPercentage: 9, subTotal: '30', URL: 'https://brand.com/products/x' }] },
];
const mock = async (url, init = {}) => {
  const u = new URL(url); calls++;
  if (init.headers.Authorization !== `Bearer ${TOKEN}`) return new Response('', { status: 401 });
  assert.equal(u.pathname, '/export-data/api/v1/project-live-insights');
  if (u.searchParams.get('dimension1') === 'URL') return new Response(JSON.stringify(SAMPLE));
  return new Response(JSON.stringify([{ metricName: 'Traffic', information: [{ totalSessionCount: '1200' }] }, { metricName: 'RageClickCount', information: [{ sessionsWithMetricPercentage: 2.2, subTotal: '40' }] }]));
};
const cl = await import('./src/clarity.js');
cl.useFetch(mock);

const checks = [];
async function check(name, fn) { try { await fn(); checks.push(true); console.log('PASS ', name); } catch (e) { checks.push(false); console.log('FAIL ', name, '\n      ' + e.message); } }

await check('shapeInsights joins the metrics per URL', async () => {
  const rows = cl.shapeInsights(SAMPLE, 'URL');
  const p = rows.find(r => r.url.endsWith('/x'));
  assert.equal(p.sessions, 300); assert.equal(p.rage, 6.5); assert.equal(p.rage_n, 40); assert.equal(p.quickback, 9); assert.equal(p.scroll, 31);
  assert.equal(rows.find(r => r.url === 'https://brand.com/').dead, 12);
});
await check('a short or wrong token is refused and nothing is stored', async () => {
  await assert.rejects(() => cl.storeClarity(env, 'act_1', 'short'), /too short/);
  await assert.rejects(() => cl.storeClarity(env, 'act_1', 'x'.repeat(40)), /refused the token/);
  assert.equal(await cl.clarityDoc(env, 'act_1'), null);
});
await check('a good token is stored with the project read from the token', async () => {
  const r = await cl.storeClarity(env, 'act_1', ` ${TOKEN} `);
  assert.equal(r.project, 'abc123proj');
  assert.equal((await cl.clarityDoc(env, 'act_1')).token, TOKEN);
});
await check('the report reads pages from the cache and adds one history row a day', async () => {
  const before = calls;
  const r = await cl.clarityReport(env, 'act_1');
  assert.equal(r.pages.length, 2); assert.equal(r.pages[0].sessions, 900);
  assert.equal(r.history.length, 1); assert.equal(r.history[0].sessions, 1200); assert.equal(r.history[0].rage, 2.2);
  assert.equal(calls - before, 1, 'pages came from the cache the connect wrote; only the daily site read was made');
  const r2 = await cl.clarityReport(env, 'act_1');
  assert.equal(calls - before, 1, 'a second open makes no call'); assert.equal(r2.history.length, 1);
});
await check('the daily cap stops at 9 calls', async () => {
  for (let i = 0; i < 6; i++) await cl.clarityReport(env, 'act_1', { fresh: true });
  const r = await cl.clarityReport(env, 'act_1', { fresh: true });
  assert.match(r.refresh_error || '', /10 reads a day/); assert.equal(r.pages.length, 2, 'the last good copy still shows');
});
await check('project id can be set from a Clarity link; forget removes it', async () => {
  const r = await cl.setClarityProject(env, 'act_1', 'https://clarity.microsoft.com/projects/view/zz99/dashboard');
  assert.equal(r.project, 'zz99');
  await cl.forgetClarity(env, 'act_1');
  assert.equal((await cl.clarityReport(env, 'act_1')).error, 'not_linked');
});

/* ---------- Klaviyo: what=message ---------- */
const kv = await import('./src/klaviyo.js');
const J = (data) => new Response(JSON.stringify({ data }), { status: 200 });
let kcalls = [];
kv.useFetch(async (url, init = {}) => {
  const u = new URL(url); kcalls.push(u.pathname);
  if (u.pathname === '/api/accounts/') return J([{ id: 'A', attributes: { contact_information: { organization_name: 'X' } } }]);
  if (u.pathname === '/api/campaign-messages/CM1/') return J({ id: 'CM1', attributes: { definition: { channel: 'email', label: 'Oct', content: { subject: 'Hi', preview_text: 'pv', from_email: 'a@b.com', from_label: 'B' } } } });
  if (u.pathname === '/api/campaign-messages/CM1/template/') return J({ id: 'T1', attributes: { name: 'tpl', editor_type: 'CODE', html: '<p>Hello {{ first_name }}</p>' } });
  if (u.pathname === '/api/template-render/') return J({ attributes: { html: '<p>Hello there</p>' } });
  if (u.pathname === '/api/campaign-messages/CAMP9/') return new Response(JSON.stringify({ errors: [{ detail: 'nope' }] }), { status: 404 });
  if (u.pathname === '/api/campaigns/CAMP9/') return J({ id: 'CAMP9', relationships: { 'campaign-messages': { data: [{ id: 'CM1' }] } } });
  if (u.pathname === '/api/flow-messages/FM1/') return J({ id: 'FM1', attributes: { name: 'Text 1', definition: { channel: 'sms', content: { body: 'Your cart misses you' } } } });
  return new Response('{}', { status: 404 });
});
await kv.storeKey(env, 'act_1', 'pk_goodkeygoodkeygoodkey123');
await check('message: an email campaign comes back rendered, then from the cache', async () => {
  kcalls = [];
  const m = await kv.klaviyoView(env, 'act_1', 'message', null, { kind: 'campaign', id: 'CM1' });
  assert.equal(m.subject, 'Hi'); assert.equal(m.preview, 'pv'); assert.equal(m.html, '<p>Hello there</p>'); assert.equal(m.rendered, true); assert.equal(m.channel, 'email');
  const n = kcalls.length; const m2 = await kv.klaviyoView(env, 'act_1', 'message', null, { kind: 'campaign', id: 'CM1' });
  assert.equal(kcalls.length, n, 'kept'); assert.ok(m2.cached_at);
});
await check('message: a campaign id resolves to its message; an SMS flow message gives its text', async () => {
  const m = await kv.klaviyoView(env, 'act_1', 'message', null, { kind: 'campaign', id: 'CAMP9' });
  assert.equal(m.id, 'CM1');
  const s = await kv.klaviyoView(env, 'act_1', 'message', null, { kind: 'flow', id: 'FM1' });
  assert.equal(s.channel, 'sms'); assert.equal(s.text, 'Your cart misses you'); assert.equal(s.html, undefined);
});

const ok = checks.filter(Boolean).length;
console.log(`\n${ok}/${checks.length} passed`);
if (ok !== checks.length) process.exit(1);

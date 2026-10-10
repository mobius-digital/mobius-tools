/* Offline checks for src/snapshot.js (public snapshot links, 2026-10-09).
 *   node test-snapshot.mjs      (from profit/worker)
 * A real SQLite (node:sqlite) stands in for D1. Checks: a token is required, revoked and expired links 404, the public
 * payload carries one brand and nobody's name, a view naming another client is refused, brand limits hold, views count,
 * the rate limit bites, and scripts / handlers / ids are stripped. */
import { DatabaseSync } from 'node:sqlite';
import assert from 'node:assert/strict';

const db = new DatabaseSync(':memory:');
db.exec(`CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT);
  CREATE TABLE brand_accounts (act_id TEXT PRIMARY KEY, name TEXT);
  INSERT INTO brand_accounts VALUES ('brand_lucky_golf', 'Lucky Golf'), ('brand_party_patch', 'Party Patch'), ('brand_bonk', 'Bonk Golf');
  INSERT INTO settings VALUES ('userBrands', '{"noma@go-mobius-digital.com":["brand_party_patch"]}');`);
const bindSql = sql => sql.replace(/\?(\d+)/g, (_, n) => ':p' + n);
const vals = a => Object.fromEntries(a.map((v, i) => ['p' + (i + 1), v === undefined ? null : v]));
const stmt = sql => { let args = []; const st = () => db.prepare(bindSql(sql)); return { bind(...a) { args = a; return this; }, async first() { return st().get(vals(args)) || null; }, async all() { return { results: st().all(vals(args)) }; }, async run() { const r = st().run(vals(args)); return { meta: { changes: r.changes } }; } }; };
const env = { DB: { prepare: stmt } };

const S = await import('./src/snapshot.js');
const checks = [];
async function check(name, fn) { try { await fn(); checks.push(true); console.log('PASS ', name); } catch (e) { checks.push(false); console.log('FAIL ', name, '\n      ' + e.message); } }

const req = (method, path, body, ip = '1.1.1.1') => new Request('https://w.test' + path, { method, headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': ip }, body: body ? JSON.stringify(body) : undefined });
const create = async (body, email = null) => { const r = await S.handleSnapshot({ path: '/api/snapshot', request: req('POST', '/api/snapshot', body), env, email }); return { status: r.status, j: await r.json() }; };
const pub = async (tok, ip) => { const r = await S.snapshotPublic(req('GET', '/api/snapshot/' + tok, null, ip), env, '/api/snapshot/' + tok); return { status: r.status, j: await r.json() }; };
const CARD = '<div class="v2card" data-act="brand_lucky_golf"><div class="v2h"><h3>Spend and revenue</h3></div><b>$12,340</b> revenue, act_123456789 <script>alert(1)</script><img src="x.png" onerror="alert(2)"><a href="javascript:alert(3)">x</a></div>';

let tok;
await check('create needs one brand, never All clients', async () => {
  const { status, j } = await create({ act: 'all', title: 'x', html: CARD });
  assert.equal(status, 400); assert.match(j.error, /one brand/);
});
await check('create returns a 32-hex token and a 30-day expiry by default', async () => {
  const { status, j } = await create({ act: 'brand_lucky_golf', kind: 'card', title: 'Spend and revenue', page: 'Meta', dates: 'Sep 9 to Oct 8, 2026', cmp: 'compared with Aug 10 to Sep 8', attr: 'Attribution: Triple Whale, last platform click', html: CARD, css: '.v2card{color:red}@import url(x);', root: { ui: 'v2' } }, 'cole@go-mobius-digital.com');
  assert.equal(status, 200, JSON.stringify(j));
  assert.match(j.token, /^[a-f0-9]{32}$/); tok = j.token;
  const days = (Date.parse(j.expires_at.replace(' ', 'T') + 'Z') - Date.now()) / 864e5;
  assert.ok(days > 29.9 && days < 30.1, 'expiry ' + days);
});
await check('the public route needs a real token', async () => {
  assert.equal(await S.snapshotPublic(req('GET', '/api/snapshot'), env, '/api/snapshot'), null);   // no token: falls through to the auth gate
  assert.equal((await pub('nothex')).status, 404);
  assert.equal((await pub('0'.repeat(32))).status, 404);
  assert.equal(await S.snapshotPublic(req('GET', '/api/snapshots'), env, '/api/snapshots'), null);
});
await check('the payload is the frozen card of ONE brand, with nobody\'s name and no ids or scripts', async () => {
  const { status, j } = await pub(tok);
  assert.equal(status, 200);
  assert.equal(j.brand, 'Lucky Golf'); assert.equal(j.title, 'Spend and revenue'); assert.equal(j.dates, 'Sep 9 to Oct 8, 2026');
  const all = JSON.stringify(j);
  assert.ok(!/cole@|created_by|act_id/.test(all), 'leaks who made it or an id field');
  assert.ok(!/Party Patch|Bonk/.test(all), 'carries another brand');
  assert.ok(!/brand_lucky_golf|act_123456789/.test(all), 'carries an id');
  assert.ok(!/<script|onerror|javascript:/i.test(j.html), 'script survived: ' + j.html);
  assert.ok(!/@import/.test(j.css));
  assert.match(j.html, /\$12,340/);
});
await check('views are counted', async () => {
  await pub(tok);
  assert.equal(db.prepare('SELECT views FROM p_snapshot WHERE token = ?').get(tok).views, 2);
});
await check('a view that names another client is refused', async () => {
  const { status, j } = await create({ act: 'brand_lucky_golf', title: 'Brands', html: '<table><tr><td>Lucky Golf</td><td>Party Patch</td></tr></table>' });
  assert.equal(status, 400); assert.match(j.error, /Party Patch/);
});
await check('a limited user can only share and revoke their own brands', async () => {
  const noma = 'noma@go-mobius-digital.com';
  assert.equal((await create({ act: 'brand_lucky_golf', title: 'x', html: '<p>Lucky Golf $1</p>' }, noma)).status, 403);
  const own = await create({ act: 'brand_party_patch', title: 'x', html: '<p>$1</p>' }, noma);
  assert.equal(own.status, 200);
  const rv = await S.handleSnapshot({ path: '/api/snapshot/revoke', request: req('POST', '/api/snapshot/revoke', { token: tok }), env, email: noma });
  assert.equal(rv.status, 403);
  const list = await (await S.handleSnapshot({ path: '/api/snapshots', request: req('GET', '/api/snapshots'), env, email: noma })).json();
  assert.deepEqual(list.links.map(l => l.act_id), ['brand_party_patch']);
});
await check('a revoked link 404s', async () => {
  const rv = await S.handleSnapshot({ path: '/api/snapshot/revoke', request: req('POST', '/api/snapshot/revoke', { token: tok }), env, email: null });
  assert.equal(rv.status, 200);
  assert.equal((await pub(tok)).status, 404);
});
await check('an expired link 404s; "never" has no expiry', async () => {
  const { j } = await create({ act: 'brand_bonk', title: 'x', html: '<p>$5</p>', days: 7 });
  db.prepare(`UPDATE p_snapshot SET expires_at = '2026-01-01 00:00:00' WHERE token = ?`).run(j.token);
  assert.equal((await pub(j.token)).status, 404);
  const nv = await create({ act: 'brand_bonk', title: 'x', html: '<p>$5</p>', days: 0 });
  assert.equal(nv.j.expires_at, null);
  assert.equal((await pub(nv.j.token)).status, 200);
});
await check('the public route is rate limited per IP', async () => {
  let last = 0;
  for (let i = 0; i < 61; i++) last = (await pub('f'.repeat(32), '9.9.9.9')).status;
  assert.equal(last, 429);
  assert.equal((await pub('f'.repeat(32), '8.8.8.8')).status, 404);
});

const bad = checks.filter(x => !x).length;
console.log(`\n${checks.length - bad} of ${checks.length} passed`);
process.exit(bad ? 1 : 0);

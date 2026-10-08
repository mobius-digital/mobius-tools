/* Offline checks for src/brands.js after the brand-first rebuild (phases 3 and 5): brands with their own
 * id, connections as the one source of truth, aliases for every old id, the brand_accounts view, and the
 * integrations that read and write connections (google.js, tiktok.js).
 *   node test-brands.mjs      (from account-health/worker)
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
load(path.join(root, 'profit', 'worker', 'schema.sql'));
load(path.join(root, 'profit', 'worker', 'migrations', 'brand-001.sql'));
load(path.join(here, 'schema.sql'));
const bindSql = sql => sql.replace(/\?(\d+)/g, (_, n) => ':p' + n);
const vals = a => Object.fromEntries(a.map((v, i) => ['p' + (i + 1), v === undefined ? null : v]));
const stmt = sql => { let args = []; const st = () => db.prepare(bindSql(sql)); return { bind(...a) { args = a; return this; }, async first() { return st().get(vals(args)) || null; }, async all() { return { results: st().all(vals(args)) }; }, async run() { const r = st().run(vals(args)); return { meta: { changes: r.changes } }; } }; };
const DB = { prepare: stmt, async batch(list) { const out = []; for (const s of list) out.push(await s.run()); return out; } };
const env = { DB };

/* Two Meta ad accounts Locus can see for Party Patch (one a backup), Lucky's, and one nobody has yet. */
db.exec(`INSERT INTO accounts (act_id, name, last_sync_insights) VALUES ('act_378', 'Lucky Golf', '2026-10-08 12:00:00'),
  ('act_103', 'Party Patch', NULL), ('act_701', 'Party Patch Ad Acc 2', NULL), ('act_999', 'Speedin Ads', NULL)`);
db.exec(`INSERT INTO daily_insights (act_id, date, spend) VALUES ('act_103', '2026-10-07', 100), ('act_701', '2026-10-07', 25), ('act_378', '2026-10-07', 300)`);

const B = await import('./src/brands.js');
const G = await import('./src/google.js');
const T = await import('./src/tiktok.js');

const checks = [];
async function check(name, fn) { try { await fn(); checks.push(true); console.log('PASS ', name); } catch (e) { checks.push(false); console.log('FAIL ', name, '\n      ' + e.message); } }
const rows = sql => db.prepare(sql).all();

await check('slugify makes readable ids', () => {
  assert.equal(B.slugify('Ice & Gold'), 'ice_and_gold');
  assert.equal(B.slugify('  Lucky Golf! '), 'lucky_golf');
  assert.equal(B.slugify(''), 'brand');
});

await check('a brand is made with no outside account, and a name clash gets a numbered id', async () => {
  assert.equal((await B.createBrand(env, { name: 'Lucky Golf', internal_channel: 'C0LUCKY01' })).id, 'brand_lucky_golf');
  assert.equal((await B.createBrand(env, { name: 'Party Patch', internal_channel: 'C0PARTY01' })).id, 'brand_party_patch');
  assert.equal((await B.createBrand(env, { name: 'SpeedIn', internal_channel: 'C0SPEEDIN1' })).id, 'brand_speedin');
  assert.equal((await B.createBrand(env, { name: 'SpeedIn' })).id, 'brand_speedin_2');
  await assert.rejects(B.createBrand(env, { name: 'X', internal_channel: '#speedin-internal' }), /not a Slack channel id/);
  await assert.rejects(B.createBrand(env, { name: 'Y', internal_channel: 'C0SPEEDIN1' }), /already SpeedIn's internal channel/);
  await assert.rejects(B.createBrand(env, { name: '  ' }), /needs a name/);
});

await check('Meta accounts attach as connections; an account can only be on one brand', async () => {
  await B.addConnection(env, 'brand_lucky_golf', { kind: 'meta', external_id: 'act_378', label: 'Lucky Golf', is_primary: 1 });
  await B.addConnection(env, 'brand_party_patch', { kind: 'meta', external_id: 'act_103', label: 'Party Patch', is_primary: 1 });
  await B.addConnection(env, 'brand_party_patch', { kind: 'meta', external_id: 'act_701', label: 'Party Patch Ad Acc 2', config: { role: 'backup' } });
  await assert.rejects(B.addConnection(env, 'brand_lucky_golf', { kind: 'meta', external_id: 'act_701' }), /already connected to brand_party_patch/);
  await assert.rejects(B.addConnection(env, 'brand_lucky_golf', { kind: 'meta', external_id: '701' }), /act_123456/);
  await assert.rejects(B.addConnection(env, 'brand_lucky_golf', { kind: 'myspace', external_id: 'x' }), /Unknown connection kind/);
});

await check('every old id resolves to the brand (aliases), and unknown ids pass through', async () => {
  db.exec(`INSERT INTO brand_alias (alias, brand_id, kind) VALUES ('asana_555', 'brand_speedin', 'legacy')`);
  assert.equal(await B.resolveBrandId(env, 'act_378'), 'brand_lucky_golf');
  assert.equal(await B.resolveBrandId(env, 'act_701'), 'brand_party_patch');
  assert.equal(await B.resolveBrandId(env, 'asana_555'), 'brand_speedin');
  assert.equal(await B.resolveBrandId(env, 'lucky_golf'), 'brand_lucky_golf');
  assert.equal(await B.resolveBrandId(env, 'all'), 'all');
  assert.equal(await B.resolveBrandId(env, 'act_404'), 'act_404');
});

await check('brand_accounts shows each brand in the old shape with its primary Meta account', async () => {
  const pp = await B.acctOf(env, 'act_103');
  assert.equal(pp.act_id, 'brand_party_patch'); assert.equal(pp.meta_act, 'act_103'); assert.equal(pp.slack_channel, 'C0PARTY01'); assert.equal(pp.active, 1);
  const lucky = await B.acctOf(env, 'brand_lucky_golf');
  assert.equal(lucky.last_sync_insights, '2026-10-08 12:00:00');
  const sp = await B.acctOf(env, 'brand_speedin');
  assert.equal(sp.meta_act, null); assert.equal(sp.tw_shop, null);
});

await check("a brand's Meta numbers add up all its Meta accounts (metaOf)", async () => {
  const r = await env.DB.prepare(`SELECT SUM(spend) s FROM daily_insights WHERE act_id IN ${B.metaOf(1)}`).bind('brand_party_patch').first();
  assert.equal(r.s, 125);
});

await check('the Meta sync walks Meta accounts, skips backups, and never a brand with none', async () => {
  const r = await B.metaSyncRows(env);
  assert.deepEqual(r.map(x => `${x.act_id}:${x.brand_id}`).sort(), ['act_103:brand_party_patch', 'act_378:brand_lucky_golf']);
});

await check('Triple Whale is one connection per brand, and a shop belongs to one brand', async () => {
  await B.setTripleWhale(env, 'brand_lucky_golf', 'Lucky-Wedges.myshopify.com');
  assert.equal((await B.acctOf(env, 'brand_lucky_golf')).tw_shop, 'lucky-wedges.myshopify.com');
  await B.setTripleWhale(env, 'brand_lucky_golf', 'lucky-2.myshopify.com');
  assert.equal(rows(`SELECT COUNT(*) n FROM connections WHERE brand_id = 'brand_lucky_golf' AND kind = 'triple_whale'`)[0].n, 1);
  await assert.rejects(B.setTripleWhale(env, 'brand_party_patch', 'lucky-2.myshopify.com'), /already connected to brand_lucky_golf/);
  await B.setTripleWhale(env, 'brand_lucky_golf', '');
  assert.equal((await B.acctOf(env, 'brand_lucky_golf')).tw_shop, null);
});

await check('connSet keeps one connection per single kind, connClear removes it', async () => {
  await B.connSet(env, 'brand_lucky_golf', 'drive', 'https://drive.google.com/d1');
  await B.connSet(env, 'brand_lucky_golf', 'drive', 'https://drive.google.com/d2');
  assert.deepEqual(rows(`SELECT external_id FROM connections WHERE brand_id = 'brand_lucky_golf' AND kind = 'drive'`).map(r => r.external_id), ['https://drive.google.com/d2']);
  assert.equal((await B.connGet(env, 'act_378', 'drive')).external_id, 'https://drive.google.com/d2');
  await B.connSet(env, 'brand_lucky_golf', 'drive', '');
  assert.equal(await B.connGet(env, 'brand_lucky_golf', 'drive'), null);
  await assert.rejects(B.connSet(env, 'brand_lucky_golf', 'myspace', 'x'), /Unknown connection kind/);
});

await check('Google ids are read and written as connections (google.js)', async () => {
  await G.setLink(env, 'brand_lucky_golf', { ga4: '358338096', gsc: 'sc-domain:luckygolf.com', ads: '6859198499' });
  assert.deepEqual(await G.linkFor(env, 'brand_lucky_golf'), { ga4: '358338096', gsc: 'sc-domain:luckygolf.com', ads: '6859198499' });
  assert.equal(rows(`SELECT external_id FROM connections WHERE kind = 'google_ads'`)[0].external_id, '6859198499');
  await G.setLink(env, 'brand_lucky_golf', { gsc: '' });
  assert.deepEqual(await G.linkFor(env, 'brand_lucky_golf'), { ga4: '358338096', ads: '6859198499' });
  assert.equal(rows(`SELECT COUNT(*) n FROM p_br_doc WHERE key = 'google'`)[0].n, 0, 'nothing written to the old doc');
});

await check('the TikTok advertiser is a connection (tiktok.js)', async () => {
  await T.setTiktokLink(env, 'brand_party_patch', '7001-22');
  assert.deepEqual(await T.tiktokLink(env, 'brand_party_patch'), { advertiser_id: '700122' });
  await T.setTiktokLink(env, 'brand_party_patch', '');
  assert.deepEqual(await T.tiktokLink(env, 'brand_party_patch'), {});
});

await check('the channel lookup finds the brand and says what it has connected', async () => {
  const sp = await B.brandByChannel(env, 'C0SPEEDIN1');
  assert.equal(sp.id, 'brand_speedin'); assert.deepEqual(sp.connections, []);
  assert.match(B.connectionNote(sp), /SpeedIn has nothing connected\. Not connected: Meta ad account, Triple Whale/);
  const pp = await B.brandByChannel(env, 'C0PARTY01');
  assert.match(B.connectionNote(pp), /Party Patch has [^.]*Meta ad account/);
  assert.equal(await B.brandByChannel(env, 'C_NOBODY'), null);
});

await check('a brand keeps its R2 folder (storage_prefix) and falls back to its id', async () => {
  db.exec(`UPDATE brands SET storage_prefix = 'act_378' WHERE id = 'brand_lucky_golf'`);
  assert.equal(await B.storagePrefix(env, 'brand_lucky_golf'), 'act_378');
  assert.equal(await B.storagePrefix(env, 'brand_speedin'), 'brand_speedin');
});

await check('listBrands nests connections and never returns a secret', async () => {
  db.exec(`INSERT INTO p_br_doc (act_id, line_id, key, data_json, status, source) VALUES ('brand_lucky_golf', '', 'klaviyo', '{"key":"pk_secret"}', 'approved', 'staff')`);
  const list = await B.listBrands(env);
  assert.equal(list.find(b => b.id === 'brand_party_patch').connections.filter(c => c.kind === 'meta').length, 2);
  assert.ok(!JSON.stringify(list).includes('pk_secret'));
});

const failed = checks.filter(x => !x).length;
console.log(`\n${checks.length - failed}/${checks.length} passed`);
process.exit(failed ? 1 : 0);

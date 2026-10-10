/* Offline checks for Launch to Meta (src/launch.js, 2026-10-10): an approved Studio ad or a creator asset becomes a
 * PAUSED Meta ad through metawrite.js meta_create_ad, named "<test> <letter> | <Format>", in the suggested ad set,
 * tied to its test, and the test's verdict files the learning onto the angle. In-memory SQLite, the Graph API
 * mocked, no secrets, nothing real is written anywhere.
 *   node test-launch.mjs      (from account-health/worker)
 */
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..', '..');
const db = new DatabaseSync(':memory:');
const load = f => { for (const st of fs.readFileSync(f, 'utf8').replace(/--[^\n]*/g, '').split(/;\s*(?:\n|$)/)) { try { if (st.trim()) db.exec(st); } catch { /* re-applied ALTER */ } } };
load(path.join(here, 'schema.sql'));
for (const f of ['brand-001.sql', 'brand-002.sql', 'brand-003.sql', 'brand-004.sql', 'brand-005.sql', 'studio-001.sql', 'studio-002.sql']) load(path.join(root, 'profit', 'worker', 'migrations', f));
const bindSql = sql => sql.replace(/\?(\d+)/g, (_, n) => ':p' + n);
const vals = a => Object.fromEntries(a.map((v, i) => ['p' + (i + 1), v === undefined ? null : typeof v === 'boolean' ? +v : v]));
const DB = {
  prepare(sql) {
    let args = [];
    const st = () => db.prepare(bindSql(sql));
    return { bind(...a) { args = a; return this; }, async first() { return st().get(vals(args)) || null; },
      async all() { return { results: st().all(vals(args)) }; }, async run() { const r = st().run(vals(args)); return { meta: { changes: r.changes } }; } };
  },
};

/* ---------------- fixtures: Lucky (writable) and Dartee (read-only) ---------------- */
const LUCKY = 'act_111', DARTEE = 'act_222';
const AD_OK = 'a'.repeat(24), AD_REVIEW = 'b'.repeat(24), AD_LOOSE = 'c'.repeat(24), AD_DARTEE = 'd'.repeat(24);
db.exec(`INSERT INTO accounts (act_id, name, currency, tz) VALUES ('${LUCKY}', 'Lucky Golf', 'USD', 'America/Chicago'), ('${DARTEE}', 'Dartee Golf', 'USD', 'America/New_York')`);
db.exec(`INSERT INTO brands (id, slug, name, status, currency, tz, legacy_key, source) VALUES ('brand_lucky', 'lucky_golf', 'Lucky Golf', 'active', 'USD', 'America/Chicago', '${LUCKY}', 'locus'),
  ('brand_dartee', 'dartee', 'Dartee Golf', 'active', 'USD', 'America/New_York', '${DARTEE}', 'locus')`);
db.exec(`INSERT INTO connections (id, brand_id, kind, external_id, is_primary, source) VALUES ('m1', 'brand_lucky', 'meta', '${LUCKY}', 1, 'locus'), ('m2', 'brand_dartee', 'meta', '${DARTEE}', 1, 'locus')`);
db.exec(`INSERT INTO p_br_angle (id, act_id, name, note) VALUES ('ang1', 'brand_lucky', 'Spin you can hear', 'Started from the range videos.')`);
db.exec(`INSERT INTO p_br_batch (id, act_id, num, title, angle_id) VALUES ('bb415', 'brand_lucky', '415', 'Wedge spin, the sound', 'ang1'), ('bb500', 'brand_lucky', '500', 'Late test', 'ang1')`);
db.exec(`INSERT INTO p_studio_batch (id, act_id, num, br_batch_id, name, brief_json, setup_json, status) VALUES
  ('sb1', 'brand_lucky', '415', 'bb415', 'Wedge spin', '{"angle":"Spin","post_copy":"You can hear the spin before you see it."}', '{"products":[{"handle":"carver","title":"The Carver"}]}', 'made'),
  ('sbd', 'brand_dartee', '77', NULL, 'Belts', '{"post_copy":"Belt"}', '{}', 'made')`);
db.exec(`INSERT INTO p_studio_ad (id, act_id, status, spec_json, batch_id, line, has_final) VALUES
  ('${AD_OK}', 'brand_lucky', 'approved', '{"headline":"The wedge they ask about"}', 'sb1', 1, 0),
  ('${AD_REVIEW}', 'brand_lucky', 'review', '{"headline":"Not yet"}', 'sb1', 2, 0),
  ('${AD_LOOSE}', 'brand_lucky', 'approved', '{"headline":"No batch"}', NULL, NULL, 1),
  ('${AD_DARTEE}', 'brand_dartee', 'approved', '{"headline":"Belt"}', 'sbd', 0, 0)`);

/* ---------------- a tiny Meta ---------------- */
const objs = {
  2300002: { id: '2300002', name: 'Lucky | Tests', status: 'ACTIVE', effective_status: 'ACTIVE', account_id: '111', _lv: 'campaign', _act: LUCKY },
  2300003: { id: '2300003', name: 'Lucky | Scale CBO', status: 'ACTIVE', effective_status: 'ACTIVE', account_id: '111', _lv: 'campaign', _act: LUCKY },
  2300011: { id: '2300011', name: '412 | Putters | CONCEPTS', status: 'ACTIVE', effective_status: 'ACTIVE', campaign_id: '2300002', created_time: '2026-10-01T10:00:00+0000', account_id: '111', _lv: 'adset', _act: LUCKY },
  2300013: { id: '2300013', name: '415 | Wedges | CONCEPTS', status: 'ACTIVE', effective_status: 'ACTIVE', campaign_id: '2300002', created_time: '2026-10-05T10:00:00+0000', account_id: '111', _lv: 'adset', _act: LUCKY },
  2300014: { id: '2300014', name: 'Running | Winners', status: 'ACTIVE', effective_status: 'ACTIVE', campaign_id: '2300003', created_time: '2026-10-09T10:00:00+0000', account_id: '111', _lv: 'adset', _act: LUCKY },
  2300015: { id: '2300015', name: 'Old test', status: 'ARCHIVED', effective_status: 'ARCHIVED', campaign_id: '2300002', created_time: '2026-10-09T11:00:00+0000', account_id: '111', _lv: 'adset', _act: LUCKY },
  2300022: { id: '2300022', name: '415 A | Still', status: 'ACTIVE', effective_status: 'ACTIVE', adset_id: '2300013', campaign_id: '2300002', account_id: '111', _lv: 'ad', _act: LUCKY,
    creative: { id: 'CR1', object_story_spec: { page_id: 'PAGE1', instagram_user_id: 'IG1', link_data: { link: 'https://luckygolf.com/products/old-wedge?utm=x', message: 'Old copy' } } } },
  2300031: { id: '2300031', name: '77 | Belts', status: 'ACTIVE', effective_status: 'ACTIVE', campaign_id: '2300030', created_time: '2026-10-01T10:00:00+0000', account_id: '222', _lv: 'adset', _act: DARTEE },
  2300030: { id: '2300030', name: 'Dartee | Tests', status: 'ACTIVE', effective_status: 'ACTIVE', account_id: '222', _lv: 'campaign', _act: DARTEE },
  2300099: { id: '2300099', title: 'creator clip', picture: 'https://scontent/v9.jpg', _lv: 'video' },
};
const tasksOf = { [LUCKY]: ['MANAGE', 'ADVERTISE', 'ANALYZE'], [DARTEE]: ['ANALYZE'] };
const posts = [];
let nextId = 900;
const J = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: { 'Content-Type': 'application/json' } });
const pick = (o, fields) => {
  const out = {};
  for (const f of String(fields || 'id').split(/,(?![^{]*})/)) {
    const [k, sub] = [f.replace(/\{.*$/, ''), (f.match(/\{(.*)\}$/) || [])[1]];
    if (k === 'campaign' && o.campaign_id && objs[o.campaign_id]) out.campaign = pick(objs[o.campaign_id], sub);
    else if (k === 'adset' && o.adset_id && objs[o.adset_id]) out.adset = pick(objs[o.adset_id], sub);
    else if (k === 'creative' && o.creative) out.creative = sub ? Object.fromEntries(sub.split(',').map(x => [x, o.creative[x]]).filter(([, v]) => v != null)) : o.creative;
    else if (o[k] !== undefined) out[k] = o[k];
  }
  return out;
};
const EDGE_LV = { campaigns: 'campaign', adsets: 'adset', ads: 'ad' };
async function graph(url, init = {}) {
  const u = new URL(url);
  const p = u.pathname.replace('/v23.0/', '');
  if ((init.method || 'GET') === 'POST') {
    const b = Object.fromEntries(new URLSearchParams(init.body));
    delete b.access_token;
    posts.push({ path: p, body: b });
    let m;
    if ((m = p.match(/^(act_\d+)\/adimages$/))) return J({ images: { bytes: { hash: 'HASH1' } } });
    if ((m = p.match(/^(act_\d+)\/adcreatives$/))) return J({ id: 'CR' + (++nextId) });
    if ((m = p.match(/^(act_\d+)\/ads$/))) {
      const id = String(2400000 + (++nextId));
      const spec = JSON.parse(posts.find(x => x.path === `${m[1]}/adcreatives` && x === posts.at(-2))?.body.object_story_spec || '{}');
      objs[id] = { id, name: b.name, status: b.status, effective_status: b.status, adset_id: b.adset_id, account_id: m[1].slice(4), _lv: 'ad', _act: m[1], creative: { id: 'X', object_story_spec: spec } };
      return J({ id });
    }
    const o = objs[p];
    if (!o) return J({ error: { message: 'Unsupported post request' } }, 400);
    Object.assign(o, b);
    if (b.status) o.effective_status = b.status;
    return J({ success: true });
  }
  const q = Object.fromEntries(u.searchParams);
  if (p === 'me/permissions') return J({ data: [{ permission: 'ads_read', status: 'granted' }, { permission: 'ads_management', status: 'granted' }] });
  let m;
  if ((m = p.match(/^(act_\d+)$/))) return J({ id: m[1], name: m[1] === LUCKY ? 'Lucky Golf' : 'Dartee Golf', user_tasks: tasksOf[m[1]] });
  if ((m = p.match(/^(act_\d+)\/promote_pages$/))) return J({ data: [{ id: 'PAGE1', name: 'Lucky Golf' }] });
  if ((m = p.match(/^(act_\d+)\/(campaigns|adsets|ads)$/))) {
    const lv = EDGE_LV[m[2]];
    const flt = q.filtering ? JSON.parse(q.filtering) : [];
    let rows = Object.values(objs).filter(o => o._lv === lv && o._act === m[1]);
    for (const f of flt) {
      if (/\.name$/.test(f.field)) rows = rows.filter(o => o.name.toLowerCase().includes(String(f.value).toLowerCase()));
      if (f.field === 'ad.id') rows = rows.filter(o => f.value.includes(o.id));
      if (f.field === 'effective_status') rows = rows.filter(o => f.value.includes(o.effective_status));
    }
    return J({ data: rows.map(o => pick(o, q.fields)) });
  }
  if ((m = p.match(/^(\w+)\/ads$/))) return J({ data: Object.values(objs).filter(o => o._lv === 'ad' && o.adset_id === m[1]).map(o => pick(o, q.fields)) });
  const o = objs[p];
  if (!o) return J({ error: { message: `Unsupported get request. Object with ID '${p}' does not exist` } }, 400);
  return J(pick(o, q.fields));
}
const imageGets = [];
async function xfetch(url, init = {}) {
  const s = String(url);
  if (s.startsWith('https://graph.facebook.com/')) return graph(s, init);
  if (s.startsWith('https://mobius-profit.mobius-digital.workers.dev/api/studio/img/') || s.startsWith('https://cdn.example.com/creator.png')) {
    imageGets.push(s);
    return new Response(new Uint8Array([137, 80, 78, 71, 1, 2, 3]), { status: 200, headers: { 'Content-Type': 'image/png' } });
  }
  return new Response('not mocked ' + s, { status: 404 });
}
const asanaBrand = await import('./src/asana-brand.js');
asanaBrand.useFetch(async () => J({ data: [] }));

const env = { DB, META_TOKEN: 'mt' };
const d = {
  getSetting: async (env, k) => (await env.DB.prepare('SELECT value FROM settings WHERE key = ?1').bind(k).first())?.value ?? null,
  putSetting: async (env, k, v) => env.DB.prepare('INSERT INTO settings (key, value) VALUES (?1, ?2) ON CONFLICT(key) DO UPDATE SET value = excluded.value').bind(k, typeof v === 'string' ? v : JSON.stringify(v)).run(),
  safeJson: (s, fb) => { try { return s ? JSON.parse(s) : fb; } catch { return fb; } },
  listAccounts: async env => (await env.DB.prepare('SELECT * FROM brand_accounts').all()).results,
  xfetch,
};
const L = await import('./src/launch.js');
const mw = await import('./src/metawrite.js');
const COLE = { who: 'cole@go-mobius-digital.com' };
const graphPosts = () => posts.filter(x => /adimages|adcreatives|\/ads$/.test(x.path));

const checks = [];
async function check(name, fn) { try { await fn(); checks.push({ name, pass: true }); console.log('PASS ', name); } catch (e) { checks.push({ name, pass: false, error: e.message }); console.log('FAIL ', name, '\n      ' + e.message); } }

await check('naming: "<num> <letter> | <Format>", next free letter, creator handle, no number falls back to the headline', async () => {
  assert.equal(L.adName({ num: '415', line: 0, format: 'Still' }), '415 A | Still');
  assert.equal(L.adName({ num: '415', line: 1, format: 'Still', taken: new Set(['B']) }), '415 C | Still');
  assert.equal(L.adName({ num: '416', line: 0, format: '@cartpathbandit' }), '416 A | @cartpathbandit');
  assert.equal(L.adName({ num: null, headline: 'Spin you can hear', format: 'Still' }), 'Spin you can hear | Still');
  assert.deepEqual([...L.lettersTaken(['415 A | Still', '415-B | UGC', '415C | x', '4150 A | no', '416 D | other', 'GD_415 E | x'], '415')].sort(), ['A', 'B', 'C', 'E']);
});

await check('suggest: the test\'s own ad set first, else the newest live set in a testing campaign, else the newest live one', async () => {
  const sets = [{ id: '1', num: '412', status: 'ACTIVE', campaign: 'Tests', created: '2026-10-01' }, { id: '2', num: null, status: 'ACTIVE', campaign: 'Scale', created: '2026-10-09' }, { id: '3', num: null, status: 'ACTIVE', campaign: 'Lucky | Tests', created: '2026-10-05' }];
  assert.equal(L.suggest(sets, '412').id, '1');
  const t = L.suggest(sets, '999'); assert.equal(t.id, '1', 'a Studio ad: the newest live NUMBERED test ad set'); assert.match(t.why, /newest live test ad set.*No ad set starts with 999/);
  assert.equal(L.suggest(sets.filter(s => s.id !== '1'), '999').id, '3', 'no numbered set: the testing campaign');
  assert.equal(L.suggest(sets.filter(s => s.id === '2'), '999').id, '2');
  /* Lucky, 2026-10-10: a newer Trybe creator set must not win a Studio static; a creator asset goes there. */
  const lucky = [{ id: 'c', name: 'Trybe | LGP02 - 09/25', num: null, status: 'ACTIVE', campaign: '[MD] CBO | Creator Campaign', created: '2026-10-09' },
    { id: 'p', name: 'Josh | Partnership - 09/03', num: null, status: 'ACTIVE', campaign: '[MD] CBO | Creator Campaign', created: '2026-10-08' },
    { id: 'a', name: '413 UGC', num: '413', status: 'ACTIVE', campaign: '[MD] CBO', created: '2026-09-30' },
    { id: 'b', name: '414 | Still', num: '414', status: 'ACTIVE', campaign: '[MD] CBO', created: '2026-09-29' }];
  assert.equal(L.suggest(lucky, '421').id, 'b', 'Studio static: the highest-numbered live test set, never the creator campaign');
  assert.equal(L.suggest(lucky, '421', 'creator').id, 'c', 'creator asset: the creator campaign');
  assert.equal(L.suggest(lucky, '421', 'studio', new Set(['414'])).id, 'a', 'a test called a loser is never the home for a new ad');
});

await check('prep: an approved Studio ad gets its test, the own ad set suggested, the name, and fields from the brief and the set', async () => {
  const r = await L.launchPrep(env, d, 'brand_lucky', { studio_ad: AD_OK });
  assert.ok(r.ok, r.error);
  assert.equal(r.suggested, '2300013'); assert.match(r.why, /own ad set/);
  assert.equal(r.adsets[0].id, '2300013'); assert.ok(!r.adsets.some(s => s.id === '2300015'), 'archived ad sets are not offered');
  assert.equal(r.name, '415 B | Still');
  assert.deepEqual(r.test, { id: 'bb415', num: '415', title: 'Wedge spin, the sound', verdict: null });
  assert.equal(r.fields.primary_text, 'You can hear the spin before you see it.');
  assert.equal(r.fields.headline, 'The wedge they ask about');
  assert.equal(r.fields.link, 'https://luckygolf.com/products/carver');
  assert.equal(r.source.image_url, `https://mobius-profit.mobius-digital.workers.dev/api/studio/img/${AD_OK}/full`);
  assert.equal(r.can, true); assert.deepEqual(r.warnings, []);
  assert.equal(graphPosts().length, 0, 'prep writes nothing');
});

await check('prep refuses an ad that is not approved, and another brand\'s ad; an ad with no test says so', async () => {
  assert.match((await L.launchPrep(env, d, 'brand_lucky', { studio_ad: AD_REVIEW })).error, /Approve the ad in Studio first/);
  assert.match((await L.launchPrep(env, d, 'brand_lucky', { studio_ad: AD_DARTEE })).error, /not this brand/);
  const loose = await L.launchPrep(env, d, 'brand_lucky', { studio_ad: AD_LOOSE });
  assert.ok(loose.ok, loose.error); assert.equal(loose.name, 'No batch | Still'); assert.match(loose.warnings[0], /no test number/);
  assert.match(loose.source.image_url, /\/final$/);
});

const form = { act: 'brand_lucky', studio_ad: AD_OK, adset: '2300013', name: '415 B | Still', primary_text: 'You can hear the spin before you see it.', headline: 'The wedge they ask about', link: 'https://luckygolf.com/products/carver', cta: 'SHOP_NOW' };

await check('preview: a dry run with the ad set before and after, PAUSED, and nothing written to Meta', async () => {
  const p = await L.launchPreview(env, d, 'brand_lucky', form, COLE);
  assert.ok(p.ok, p.error);
  assert.deepEqual(p.before, { adset: '415 | Wedges | CONCEPTS', ads: 1, names: ['415 A | Still'] });
  assert.equal(p.after.ads, 2); assert.equal(p.after.ad_name, '415 B | Still'); assert.equal(p.after.status, 'PAUSED'); assert.equal(p.after.page, 'PAGE1');
  assert.match(p.summary, /new ad "415 B \| Still" in "415 \| Wedges \| CONCEPTS" \(PAUSED\)/);
  assert.equal(graphPosts().length, 0, 'the dry run writes nothing');
  assert.ok(imageGets.length >= 1, 'the image was checked');
});

await check('preview refuses a name without the test number, a missing link, and no ad set', async () => {
  assert.match((await L.launchPreview(env, d, 'brand_lucky', { ...form, name: 'Spin | Still' }, COLE)).error, /must start with the test number 415/);
  assert.match((await L.launchPreview(env, d, 'brand_lucky', { ...form, link: 'luckygolf.com' }, COLE)).error, /https:\/\//);
  assert.match((await L.launchPreview(env, d, 'brand_lucky', { ...form, adset: '' }, COLE)).error, /Pick the ad set/);
  assert.match((await L.launchPreview(env, d, 'brand_lucky', { ...form, primary_text: ' ' }, COLE)).error, /primary text/);
});

await check('a read-only ad account refuses with the exact Business settings fix', async () => {
  const r = await L.launchPreview(env, d, 'brand_dartee', { act: 'brand_dartee', studio_ad: AD_DARTEE, adset: '2300031', name: '77 A | Still', primary_text: 'x', link: 'https://dartee.com' }, COLE);
  assert.match(r.error, /Give the Mobius Tools system user Manage campaigns on Dartee Golf \(act_222\)/);
  const p = await L.launchPrep(env, d, 'brand_dartee', { studio_ad: AD_DARTEE });
  assert.equal(p.can, false); assert.ok(p.warnings.some(w => /can only read/.test(w)));
});

let launched;
await check('create: one meta_create_ad write, PAUSED, logged as the person, tied to its test; a second launch into the same set is refused', async () => {
  const r = await L.launchCreate(env, d, 'brand_lucky', form, COLE);
  assert.ok(r.ok, r.error); launched = r.launch;
  const ad = posts.find(x => x.path === `${LUCKY}/ads`);
  assert.equal(ad.body.status, 'PAUSED'); assert.equal(ad.body.adset_id, '2300013'); assert.equal(ad.body.name, '415 B | Still');
  const spec = JSON.parse(posts.find(x => x.path === `${LUCKY}/adcreatives`).body.object_story_spec);
  assert.deepEqual(spec, { page_id: 'PAGE1', instagram_user_id: 'IG1', link_data: { image_hash: 'HASH1', link: 'https://luckygolf.com/products/carver', message: 'You can hear the spin before you see it.', name: 'The wedge they ask about', call_to_action: { type: 'SHOP_NOW', value: { link: 'https://luckygolf.com/products/carver' } } } });
  assert.match(r.launch.ad_id, /^\d{7}$/); assert.match(r.ads_manager, new RegExp(`selected_ad_ids=${r.launch.ad_id}`));
  const row = db.prepare(`SELECT * FROM p_launch WHERE id = ?`).get(r.launch.id);
  assert.equal(row.act, 'brand_lucky'); assert.equal(row.meta_act, LUCKY); assert.equal(row.batch_id, 'bb415'); assert.equal(row.studio_ad, AD_OK); assert.equal(row.status, 'PAUSED'); assert.equal(row.by, 'cole@go-mobius-digital.com');
  const tag = db.prepare(`SELECT * FROM p_br_adtag WHERE ad_id = ?`).get(r.launch.ad_id);
  assert.equal(tag.batch_id, 'bb415'); assert.equal(tag.act_id, 'brand_lucky'); assert.match(tag.tagged_by, /Launch to Meta/);
  const log = db.prepare(`SELECT * FROM activities WHERE manual = 1 ORDER BY event_time DESC LIMIT 1`).get();
  assert.equal(log.event_type, 'locus_write'); assert.equal(log.category, 'new_creative'); assert.match(log.actor, /cole@go-mobius-digital\.com in Locus/); assert.match(log.reason, /test 415 \(Studio ad\)/);
  const w = db.prepare(`SELECT * FROM p_meta_write ORDER BY at DESC LIMIT 1`).get();
  assert.equal(JSON.parse(w.after).created, r.launch.ad_id); assert.equal(w.id, r.launch.write);
  const n = graphPosts().length;
  const again = await L.launchCreate(env, d, 'brand_lucky', form, COLE);
  assert.ok(again.duplicate, 'second launch refused'); assert.equal(graphPosts().length, n, 'nothing written the second time');
  const prep = await L.launchPrep(env, d, 'brand_lucky', { studio_ad: AD_OK });
  assert.ok(prep.warnings.some(x => /Already launched once/.test(x))); assert.equal(prep.name, '415 C | Still', 'the next free letter');
});

await check('a creator asset: "<num> <letter> | @handle", a Meta video id, tied to the same test', async () => {
  const asset = { video_id: '2300099', handle: '@cartpathbandit', num: '415', primary_text: 'He hit it.', headline: 'Real swings' };
  const p = await L.launchPrep(env, d, 'brand_lucky', { asset });
  assert.ok(p.ok, p.error); assert.equal(p.name, '415 C | @cartpathbandit'); assert.equal(p.source.kind, 'creator'); assert.equal(p.test.id, 'bb415');
  const r = await L.launchCreate(env, d, 'brand_lucky', { asset, adset: p.suggested, name: p.name, primary_text: 'He hit it.', headline: 'Real swings', link: 'https://luckygolf.com/products/carver' }, COLE);
  assert.ok(r.ok, r.error);
  const spec = JSON.parse(posts.filter(x => x.path === `${LUCKY}/adcreatives`).at(-1).body.object_story_spec);
  assert.equal(spec.video_data.video_id, '2300099'); assert.equal(spec.video_data.image_url, 'https://scontent/v9.jpg');
  assert.equal(posts.filter(x => x.path === `${LUCKY}/ads`).at(-1).body.status, 'PAUSED');
  assert.equal(db.prepare(`SELECT source FROM p_launch WHERE ad_id = ?`).get(r.launch.ad_id).source, 'creator');
});

await check('list: live status from Meta on refresh; the verdict files the learning onto the launch and the angle, once', async () => {
  objs[launched.ad_id].status = 'ACTIVE'; objs[launched.ad_id].effective_status = 'ACTIVE';
  let l = await L.launchList(env, d, 'brand_lucky', { refresh: true });
  const mine = l.launches.find(x => x.id === launched.id);
  assert.equal(mine.eff_status, 'ACTIVE'); assert.ok(mine.checked_at); assert.equal(mine.verdict, null);
  db.exec(`UPDATE p_br_batch SET verdict = 'winner', learning = 'The sound of spin sells it, lead with audio.' WHERE id = 'bb415'`);
  l = await L.launchList(env, d, 'brand_lucky');
  assert.equal(l.launches.find(x => x.id === launched.id).verdict, 'winner');
  assert.match(l.launches.find(x => x.id === launched.id).learning, /lead with audio/);
  const note = () => db.prepare(`SELECT note FROM p_br_angle WHERE id = 'ang1'`).get().note;
  assert.equal(note(), 'Started from the range videos.\n#415 Winner: The sound of spin sells it, lead with audio.');
  await L.launchList(env, d, 'brand_lucky'); await L.fileLearnings(env, 'brand_lucky');
  assert.equal(note().split('#415').length, 2, 'filed once');
  const all = await L.launchList(env, d, null, { only: new Set(['brand_dartee']) });
  assert.equal(all.launches.length, 0, 'brand limits apply to the all-brands list');
});

await check('a launch made before its test reached the library links up by number later', async () => {
  const asset = { image_url: 'https://cdn.example.com/creator.png', handle: 'swingqueen', num: '501', primary_text: 'x' };
  const r = await L.launchCreate(env, d, 'brand_lucky', { asset, adset: '2300011', name: '501 A | @swingqueen', primary_text: 'x', link: 'https://luckygolf.com' }, COLE);
  assert.ok(r.ok, r.error); assert.equal(r.launch.batch_id, null);
  db.exec(`INSERT INTO p_br_batch (id, act_id, num, title, angle_id, verdict, learning) VALUES ('bb501', 'brand_lucky', '501', 'Creators', 'ang1', 'loser', 'Creators without the product in frame did not sell.')`);
  await L.fileLearnings(env, 'brand_lucky');
  const row = db.prepare(`SELECT batch_id, verdict FROM p_launch WHERE id = ?`).get(r.launch.id);
  assert.equal(row.batch_id, 'bb501'); assert.equal(row.verdict, 'loser');
  assert.match(db.prepare(`SELECT note FROM p_br_angle WHERE id = 'ang1'`).get().note, /\n#501 Loser: Creators without/);
});

await check('undo from the toast archives a launched ad (the same metawrite undo)', async () => {
  const u = await mw.locusUndo(env, d, { act: 'brand_lucky', write: launched.write }, COLE);
  assert.ok(!u.error, u.error); assert.equal(objs[launched.ad_id].status, 'ARCHIVED');
});

await check('routes: team only (admin), brand limits, mounted once in worker.js, no em dashes', async () => {
  const json = (o, s = 200) => new Response(JSON.stringify(o), { status: s });
  const h = (admin, only) => ({ isAdmin: async () => admin, sessionEmail: async () => 'noma@go-mobius-digital.com', brandsFor: async () => only, resolveBrandId: async (e, w) => w, md: d });
  const req = (m, p, b) => new Request('https://ah.test' + p, { method: m, ...(b ? { body: JSON.stringify(b), headers: { 'Content-Type': 'application/json' } } : {}) });
  assert.equal(await L.handleLaunch(req('GET', '/api/other'), env, new URL('https://ah.test/api/other'), '/api/other', json, h(true, null)), null);
  assert.equal((await L.handleLaunch(req('POST', '/api/launch/prep', { act: 'brand_lucky' }), env, new URL('https://ah.test/api/launch/prep'), '/api/launch/prep', json, h(false, null))).status, 401);
  assert.equal((await L.handleLaunch(req('POST', '/api/launch/prep', { act: 'brand_lucky', studio_ad: AD_OK }), env, new URL('https://ah.test/api/launch/prep'), '/api/launch/prep', json, h(true, new Set(['brand_dartee'])))).status, 403);
  const ok = await L.handleLaunch(req('POST', '/api/launch/prep', { act: 'brand_lucky', studio_ad: AD_OK }), env, new URL('https://ah.test/api/launch/prep'), '/api/launch/prep', json, h(true, null));
  assert.equal(ok.status, 200); assert.equal((await ok.json()).suggested, '2300013');
  const wk = fs.readFileSync(path.join(here, 'src', 'worker.js'), 'utf8');
  assert.equal(wk.split('handleLaunch(').length - 1, 1, 'mounted once');
  for (const f of [path.join(here, 'src', 'launch.js'), path.join(root, 'profit', 'launch.js'), path.join(here, 'test-launch.mjs')]) assert.ok(!fs.readFileSync(f, 'utf8').includes(String.fromCharCode(0x2014)), 'em dash in ' + f);
});

const failed = checks.filter(c => !c.pass);
console.log(`\n${checks.length - failed.length}/${checks.length} passed`);
process.exit(failed.length ? 1 : 0);

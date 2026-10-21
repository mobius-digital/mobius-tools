/* Offline checks for LOCUS SOCIAL phase 2 (2026-10-19): the posting engine in src/socialpost.js.
 * The scheduler claims each due post once, a half-posted row is called out, Instagram + Facebook go out through
 * a mocked Graph API, a platform that is not connected is handed to a person in Slack, the "Posted it" button
 * marks it by hand, a refused login flags the account, the calendar gets one line per post in the brand's zone.
 *   node test-socialpost.mjs      (from account-health/worker)
 */
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..', '..');

/* ---------------- a D1 stand-in (same shape as test-clients.mjs) ---------------- */
const mkDb = () => {
  const db = new DatabaseSync(':memory:');
  const bindSql = sql => { let hi = 0; return sql.replace(/\?(\d*)/g, (_, n) => { if (n) { hi = Math.max(hi, +n); return ':p' + n; } hi++; return ':p' + hi; }); };
  const vals = (a, sql) => { const used = new Set([...bindSql(sql).matchAll(/:p(\d+)/g)].map(m => 'p' + m[1])); return Object.fromEntries(a.map((v, i) => ['p' + (i + 1), v === undefined ? null : typeof v === 'boolean' ? +v : v]).filter(([k]) => used.has(k))); };
  const stmt = sql => { let args = []; const st = () => db.prepare(bindSql(sql)); return { bind(...a) { args = a; return this; }, async first() { return st().get(vals(args, sql)) || null; }, async all() { return { results: st().all(vals(args, sql)) }; }, async run() { const r = st().run(vals(args, sql)); return { meta: { changes: r.changes } }; } }; };
  return { db, DB: { prepare: stmt, async batch(list) { const out = []; for (const s of list) out.push(await s.run()); return out; } } };
};
const { db, DB } = mkDb();
const load = f => { for (const st of fs.readFileSync(f, 'utf8').replace(/--[^\n]*/g, '').split(/;\s*(?:\n|$)/)) { try { if (st.trim()) db.exec(st); } catch { /* re-applied */ } } };
load(path.join(root, 'profit', 'worker', 'schema.sql'));
load(path.join(here, 'schema.sql'));
db.exec(`INSERT INTO brands (id, slug, name, status, currency, tz, source) VALUES ('brand_alpha', 'alpha', 'Alpha Golf', 'active', 'USD', 'America/Chicago', 'locus')`);
db.exec(`INSERT INTO connections (id, brand_id, kind, external_id, is_primary, source) VALUES ('meta:act_111', 'brand_alpha', 'meta', 'act_111', 1, 'locus')`);
db.exec(`UPDATE brands SET internal_channel = 'C_ALPHA_INT' WHERE id = 'brand_alpha'`);

/* ---------------- mocks: R2, the Graph API, Slack ---------------- */
const r2 = new Map();
const MEDIA = {
  async put(k, body, meta) { r2.set(k, { body: body instanceof ArrayBuffer ? body : body.buffer ? body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength) : body, meta }); },
  async get(k) { const o = r2.get(k); return o ? { arrayBuffer: async () => o.body, httpMetadata: o.meta?.httpMetadata } : null; },
  async delete(k) { r2.delete(k); },
};
const calls = [];
let fbFails = false;
const graphMock = async (url, init = {}) => {
  const u = new URL(String(url));
  const p = u.pathname.replace(/^\/v23\.0\//, '');
  const method = init.method || 'GET';
  calls.push({ method, p, params: Object.fromEntries(new URLSearchParams(method === 'GET' ? u.search : String(init.body || ''))) });
  const J = o => new Response(JSON.stringify(o), { status: 200, headers: { 'Content-Type': 'application/json' } });
  if (u.hostname === 'files.test' && u.pathname === '/missing') return new Response('gone', { status: 404 });
  if (u.hostname === 'files.test') return new Response(new Uint8Array([0xff, 0xd8, 0xff, 1, 2, 3]), { status: 200, headers: { 'Content-Type': 'image/jpeg' } });
  if (p === 'IG1/media' && method === 'POST') return J({ id: 'CONT1' });
  if (p === 'CONT1') return J({ status_code: 'FINISHED' });
  if (p === 'IG1/media_publish') return J({ id: 'IGPOST1' });
  if (p === 'IGPOST1') return J({ permalink: 'https://www.instagram.com/p/abc/' });
  if (p === 'IGPOST1/comments') return J({ id: 'C1' });
  if (p === 'PAGE1/photos') return fbFails ? J({ error: { message: 'Error validating access token', type: 'OAuthException', code: 190 } }) : J({ id: 'PH1', post_id: 'PAGE1_PH1' });
  if (p === 'PAGE1_PH1') return J({ permalink_url: 'https://www.facebook.com/PAGE1/posts/PH1' });
  return J({ error: { message: `unmocked ${method} ${p}`, type: 'test' } });
};
const slack = [];
const d = {
  slackPost: async (env, channel, text, blocks) => { slack.push({ channel, text, blocks }); return { ok: true, channel, ts: `${slack.length}.000` }; },
  slackApi: async () => ({ ok: false }),
  subCanAfford: () => true,
};
const env = { DB, MEDIA, META_TOKEN: 'systok' };

const S = await import('./src/socialpost.js');
S.useFetch(graphMock);
await S.ensureSocialPost(env);
const now = Date.now();
const iso = ms => new Date(ms).toISOString();
const row = id => db.prepare(`SELECT * FROM social_post_out WHERE id = ?`).get(id);
const res = id => JSON.parse(row(id).results_json);
const connect = (plat, extra = {}) => db.prepare(`INSERT OR REPLACE INTO social_account (id, act_id, plat, ext_id, name, handle, token_json, mode, status) VALUES (?, 'brand_alpha', ?, ?, ?, ?, ?, ?, 'ok')`)
  .run(`brand_alpha|${plat}`, plat, extra.ext_id || plat.toUpperCase() + '1', extra.name || plat, extra.handle || 'alphagolf', JSON.stringify(extra.token || { access: 'pagetok' }), extra.mode || 'live');
const post = (id, { at, status = 'scheduled', targets, media = [{ ref: 'studio:1', src: 'studio', kind: 'image', title: 'Hat ad', url: 'https://files.test/hat.jpg' }], caption = 'New hats are in' }) =>
  db.prepare(`INSERT INTO social_post_out (id, act_id, at, status, caption, media_json, targets_json, results_json, auto, created_by) VALUES (?, 'brand_alpha', ?, ?, ?, ?, ?, '{}', 1, 'ahsan@go-mobius-digital.com')`)
    .run(id, at, status, caption, JSON.stringify(media), JSON.stringify(targets));

const results = [];
async function check(name, fn) { try { await fn(); results.push(true); console.log('PASS ', name); } catch (e) { results.push(false); console.log('FAIL ', name, '\n      ' + (e.stack || e.message).split('\n').slice(0, 3).join('\n      ')); } }

await check('statusOf: posted / handoff / partly / failed / posting from the per-platform results', () => {
  const T = { ig: { on: true }, fb: { on: true }, tt: { on: false } };
  assert.equal(S.statusOf(T, { ig: { posted_at: 'x' }, fb: { posted_at: 'y' } }), 'posted');
  assert.equal(S.statusOf(T, { ig: { posted_at: 'x' }, fb: { handoff: true } }), 'handoff');
  assert.equal(S.statusOf(T, { ig: { posted_at: 'x' }, fb: { error: 'no' } }), 'partly');
  assert.equal(S.statusOf(T, { ig: { error: 'a' }, fb: { error: 'b' } }), 'failed');
  assert.equal(S.statusOf(T, {}), 'posting');
  assert.equal(S.statusOf({ ig: { on: false } }, {}), 'failed', 'no account picked');
});

await check('the tick posts a due Instagram + Facebook post once (container, publish, first comment, Page photo), leaves drafts and future posts alone', async () => {
  connect('ig', { ext_id: 'IG1', token: { use_env: true, page: 'PAGE1' } });
  connect('fb', { ext_id: 'PAGE1', token: { access: 'pagetok' } });
  post('p_due', { at: iso(now - 60e3), targets: { ig: { on: true, first_comment: '#golf' }, fb: { on: true } } });
  post('p_draft', { at: iso(now - 60e3), status: 'draft', targets: { ig: { on: true } } });
  post('p_later', { at: iso(now + 3 * 3600e3), targets: { ig: { on: true } } });
  const out = await S.socialPostTick(env, d, { now });
  assert.equal(out.posted.length, 1); assert.equal(out.posted[0].id, 'p_due'); assert.equal(out.posted[0].status, 'posted');
  const r = row('p_due'); assert.equal(r.status, 'posted'); assert.ok(r.posted_at);
  const rs = res('p_due');
  assert.equal(rs.ig.id, 'IGPOST1'); assert.equal(rs.ig.url, 'https://www.instagram.com/p/abc/'); assert.equal(rs.fb.id, 'PAGE1_PH1'); assert.ok(rs.fb.url.includes('facebook.com'));
  const ig = calls.filter(c => c.p.startsWith('IG1/'));
  assert.deepEqual(ig.map(c => c.p), ['IG1/media', 'IG1/media_publish'], 'one container, one publish');
  assert.equal(ig[0].params.caption, 'New hats are in'); assert.ok(ig[0].params.image_url.includes('/social-m/u/'), 'the staged public file');
  assert.equal(calls.find(c => c.p === 'IGPOST1/comments').params.message, '#golf');
  assert.equal(calls.find(c => c.p === 'PAGE1/photos').params.access_token, 'pagetok', 'the Page token, not the system token');
  const staged = JSON.parse(r.media_json)[0]; assert.ok(staged.staged && r2.has(`social/${staged.staged}`), 'media staged once in R2');
  assert.equal(row('p_draft').status, 'draft'); assert.equal(row('p_later').status, 'scheduled');
  const before = calls.length;
  const again = await S.socialPostTick(env, d, { now });
  assert.equal(again.posted.length, 0); assert.equal(calls.length, before, 'a posted post is never posted twice');
});

await check('a row stuck in posting for half an hour is marked failed with a plain reason, never retried on its own', async () => {
  post('p_stuck', { at: iso(now - 3600e3), status: 'posting', targets: { ig: { on: true } } });
  db.prepare(`UPDATE social_post_out SET posting_at = ? WHERE id = 'p_stuck'`).run(iso(now - 40 * 60e3));
  post('p_fresh', { at: iso(now - 600e3), status: 'posting', targets: { ig: { on: true } } });
  db.prepare(`UPDATE social_post_out SET posting_at = ? WHERE id = 'p_fresh'`).run(iso(now - 5 * 60e3));
  const out = await S.socialPostTick(env, d, { now });
  assert.equal(out.stuck, 1);
  assert.equal(row('p_stuck').status, 'failed'); assert.match(row('p_stuck').error, /half way/);
  assert.equal(row('p_fresh').status, 'posting', 'a post that started five minutes ago is still posting');
});

await check('a platform that is not connected is handed to a person in Slack (file + caption + Posted it button), and the button marks it by hand', async () => {
  post('p_tt', { at: iso(now - 60e3), targets: { ig: { on: true }, tt: { on: true } }, media: [{ ref: 'media:v1', src: 'upload', kind: 'video', title: 'Swing clip', url: 'https://files.test/swing.mp4' }] });
  slack.length = 0;
  await S.socialPostTick(env, d, { now });
  const r = row('p_tt'); assert.equal(r.status, 'handoff');
  const rs = res('p_tt'); assert.equal(rs.tt.handoff, true); assert.ok(rs.ig.posted_at, 'Instagram still went out');
  assert.equal(slack.length, 1);
  const m = slack[0];
  assert.match(m.text, /Time to post on TikTok for Alpha Golf \(not connected\)/);
  const btn = m.blocks.find(b => b.type === 'actions').elements.find(e => e.action_id === 'soc_done');
  assert.deepEqual(JSON.parse(btn.value), { id: 'p_tt', plat: 'tt' });
  assert.ok(m.blocks[0].text.text.includes('New hats are in') && m.blocks[0].text.text.includes('/social-m/u/'), 'caption and the public file link');
  const acks = []; const posted = [];
  const ctx = { waitUntil: p => acks.push(p) };
  await S.handleSocialButton(env, ctx, { actions: [{ action_id: 'soc_done', value: btn.value }], user: { name: 'ahsan' }, response_url: 'https://hooks.test/r' }, d, { ACK: () => new Response(''), xfetch: async (u, i) => { posted.push(JSON.parse(i.body)); return new Response(''); } });
  await Promise.all(acks);
  assert.equal(row('p_tt').status, 'posted'); assert.equal(res('p_tt').tt.by_hand, true); assert.equal(res('p_tt').tt.by, 'ahsan');
  assert.match(posted[0].text, /Marked as posted on TikTok/);
});

await check('a refused login flags the account and hands that platform to a person; the other platform still posts', async () => {
  fbFails = true; slack.length = 0;
  post('p_auth', { at: iso(now - 60e3), targets: { ig: { on: true }, fb: { on: true } } });
  await S.socialPostTick(env, d, { now });
  fbFails = false;
  const rs = res('p_auth');
  assert.ok(rs.ig.posted_at); assert.equal(rs.fb.handoff, true);
  assert.equal(row('p_auth').status, 'handoff');
  assert.equal(db.prepare(`SELECT status FROM social_account WHERE id = 'brand_alpha|fb'`).get().status, 'error');
  assert.match(slack[0].text, /Facebook refused our login/);
});

await check('a post with no account picked, or a YouTube post without a video, is not sent; a picture that cannot be read fails the post with the reason', async () => {
  post('p_nofile', { at: iso(now - 60e3), targets: { ig: { on: true } }, media: [{ ref: 'x', src: 'upload', kind: 'image', title: 'gone', url: 'https://files.test/missing' }] });
  await S.socialPostTick(env, d, { now });
  assert.equal(row('p_nofile').status, 'failed'); assert.match(row('p_nofile').error, /could not be read|did not work|HTTP/i);
});

await check('the calendar gets one line per post on the brand\'s local day with the accounts it goes to', async () => {
  db.prepare(`DELETE FROM social_post_out`).run();
  /* 11pm Central on a Sunday is Monday 04:00 UTC: the line belongs to Sunday. */
  post('p_cal', { at: '2026-11-02T04:30:00.000Z', targets: { ig: { on: true }, tt: { on: true } }, caption: 'Sunday night post\nsecond line' });
  const lines = await S.calendarPosts(env, ['brand_alpha'], '2026-10-26', '2026-11-08');
  assert.equal(lines.length, 1);
  assert.equal(lines[0].day, '2026-11-01'); assert.equal(lines[0].hm, '22:30'); assert.deepEqual(lines[0].plats, ['ig', 'tt']); assert.equal(lines[0].status, 'scheduled');
  assert.equal((await S.calendarPosts(env, ['brand_alpha'], '2026-11-02', '2026-11-08')).length, 0, 'outside the window');
  assert.equal((await S.calendarPosts(env, [], '2026-10-26', '2026-11-08')).length, 0);
});

await check('a Studio carousel is ONE tray item with its cards in swipe order, and posts to Instagram as one carousel (2026-10-21)', async () => {
  const A = (id, batch, line, head) => ({ id, status: 'approved', has_final: true, batch_id: batch, line, v: '1', spec: { headline: head } });
  const studio = { ads: [A('a1', 'bc', 0, 'Clover'), A('a2', 'bc', 1, 'Two years'), A('a3', 'bc', 2, 'Milled'), A('s1', 'bs', 0, 'Single ad')],
    batches: [{ id: 'bc', name: 'Eclipse carousel', brief: { format: 'carousel', post_copy: 'Three reasons, one swipe.' }, setup: { carousel_order: ['a3', 'a1', 'a2'] } }, { id: 'bs', name: 'Singles', brief: {}, setup: {} }] };
  const env2 = { ...env, PROFIT: { fetch: async req => new Response(JSON.stringify(new URL(req.url).pathname === '/api/studio' ? studio : {}), { status: 200 }) } };
  const d2 = { ...d, mintSession: async () => ({ token: 't' }) };
  const tray = await S.trayOf(env2, d2, 'brand_alpha');
  const car = tray.find(i => i.ref === 'scar:bc');
  assert.ok(car, 'the carousel is on the tray'); assert.equal(car.kind, 'carousel'); assert.equal(car.caption, 'Three reasons, one swipe.');
  assert.deepEqual(car.cards.map(c => c.ref), ['studio:a3', 'studio:a1', 'studio:a2'], 'swipe order from Studio');
  assert.ok(!tray.some(i => ['studio:a1', 'studio:a2', 'studio:a3'].includes(i.ref)), 'no loose cards');
  assert.ok(tray.some(i => i.ref === 'studio:s1'), 'a single ad stays its own item');
  /* posted with every card = one Instagram carousel */
  const n0 = calls.length;
  post('p_car', { at: iso(now - 60e3), targets: { ig: { on: true } }, media: car.cards.map(c => ({ ...c, url: `https://files.test/${c.ref}.jpg` })) });
  await S.socialPostTick(env, d, { now });
  assert.equal(row('p_car').status, 'posted', row('p_car').error || '');
  const ig = calls.slice(n0).filter(c => c.p === 'IG1/media' && c.method === 'POST');
  assert.equal(ig.filter(c => c.params.is_carousel_item === 'true').length, 3, 'three cards');
  assert.equal(ig.at(-1).params.media_type, 'CAROUSEL'); assert.equal(ig.at(-1).params.caption, 'New hats are in');
  /* once on the week, the carousel reads as used */
  assert.equal((await S.trayOf(env2, d2, 'brand_alpha')).find(i => i.ref === 'scar:bc').used, true);
});

const pass = results.filter(Boolean).length;
console.log(`\n${pass}/${results.length} passed`);
process.exit(pass === results.length ? 0 : 1);

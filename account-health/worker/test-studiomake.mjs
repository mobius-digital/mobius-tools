/* Offline checks for THE STRATEGIST PRESSES MAKE (2026-10-18, src/studiomake.js): product matching, Studio's NDJSON
 * streams, the tool (batches checked, products matched, the thread's reference uploaded, one queue job), and the job
 * (the art director plan saved on the batch, one Make per line or a Vary off ad 1, the batch marked made, one Slack post
 * per batch with every ad as a file, then the closing line). In-memory SQLite; profit, the plan route and Slack mocked.
 *   node test-studiomake.mjs      (from account-health/worker) */
import { DatabaseSync } from 'node:sqlite';
import assert from 'node:assert/strict';
import { studioMakeTools, runStudioMake, matchProduct, readStream, specFor } from './src/studiomake.js';

const db = new DatabaseSync(':memory:');
const bindSql = sql => sql.replace(/\?(\d+)/g, (_, n) => ':p' + n);
const vals = a => Object.fromEntries(a.map((v, i) => ['p' + (i + 1), v === undefined ? null : v]));
const stmt = sql => { let args = []; const st = () => db.prepare(bindSql(sql)); return { bind(...a) { args = a; return this; }, async first() { return st().get(vals(args)) || null; }, async all() { return { results: st().all(vals(args)) }; }, async run() { st().run(vals(args)); return { success: true }; } }; };
db.exec(`CREATE TABLE p_studio_batch (id TEXT PRIMARY KEY, act_id TEXT, num TEXT, br_batch_id TEXT, name TEXT, brief_json TEXT, setup_json TEXT, plan_json TEXT, status TEXT, updated_at TEXT)`);
const brief = (testing, n) => JSON.stringify({ angle: 'He is not just getting old', why: 'Dana', concept: 'Chalkboard', testing, lines: Array.from({ length: n }, (_, i) => ({ text: `Board ${i + 1}`, inspo: [] })) });
db.prepare(`INSERT INTO p_studio_batch (id, act_id, name, brief_json, setup_json, status) VALUES (?, ?, ?, ?, '{}', 'draft')`).run('b_joint', 'brand_vp', 'Chalkboard - Bone & Joint', brief('concepts', 3));
db.prepare(`INSERT INTO p_studio_batch (id, act_id, name, brief_json, setup_json, status) VALUES (?, ?, ?, ?, '{}', 'draft')`).run('b_breath', 'brand_vp', 'Chalkboard - Fresh Breath', brief('hooks', 2));
db.prepare(`INSERT INTO p_studio_batch (id, act_id, name, brief_json, setup_json, status) VALUES (?, ?, ?, ?, '{}', 'draft')`).run('b_other', 'brand_other', 'Other', brief('concepts', 1));

const PRODUCTS = [{ handle: 'bone-joint', title: 'Bone & Joint Strips', type: 'Supplement', images: ['https://cdn/bj1.png', 'https://cdn/bj2.png'] },
  { handle: 'fresh-breath', title: 'Fresh Breath Strips', type: 'Supplement', images: ['https://cdn/fb1.png'] },
  { handle: 'skin-coat', title: 'Skin & Coat Strips', type: 'Supplement', images: ['https://cdn/sc1.png'] }];
const nd = (...lines) => new Response(lines.map(o => JSON.stringify(o)).join('\n'), { headers: { 'content-type': 'application/x-ndjson' } });
let calls = [], slack = [], queued = [], adN = 0;
const env = {
  DB: { prepare: stmt }, ADMIN_TOKEN: 'adm', SLACK_BOT_TOKEN: 'xoxb',
  IDEA_Q: { send: async j => { queued.push(j); } },
  PROFIT: { fetch: async req => {
    const u = new URL(req.url), body = req.method === 'POST' && !/upload/.test(u.pathname) ? await req.json() : null;
    calls.push({ path: u.pathname, body, auth: req.headers.get('authorization') });
    if (u.pathname === '/api/studio/products') return Response.json({ products: PRODUCTS });
    if (u.pathname === '/api/studio/upload') return Response.json({ url: 'https://profit/api/studio/ref/ref1.png' });
    if (u.pathname === '/api/studio/make') return nd({ type: 'status' }, { type: 'ad', ad: { id: 'ad' + (++adN) } }, { type: 'done', ads: [{ id: 'ad' + adN }], failed: [] });
    if (u.pathname === '/api/studio/vary') return nd({ type: 'done', ad: { id: 'ad' + (++adN) } });
    if (/^\/api\/studio\/img\//.test(u.pathname)) return new Response(new Uint8Array([137, 80, 78, 71]));
    return new Response('nope', { status: 404 });
  } },
};
const d = {
  mintSession: async () => ({ token: 'mds.owner' }),
  xfetch: async (url, init) => { if (/files\.slack/.test(url) || /upload/.test(url)) return new Response('ok'); if (/thumb/.test(url)) return new Response(new Uint8Array([1, 2]), { headers: { 'content-type': 'image/png' } }); return new Response('x', { status: 404 }); },
  slack: async (e, method, p) => {
    slack.push({ method, p });
    if (method === 'conversations.replies') return { ok: true, messages: [{ user: 'U1', text: 'make these', files: [{ mimetype: 'image/png', thumb_1024: 'https://files/thumb.png' }] }, { bot_id: 'B1', text: 'done' }] };
    if (method === 'files.getUploadURLExternal') return { ok: true, upload_url: 'https://files.slack/up', file_id: 'F' + slack.length };
    return { ok: true };
  },
  ahFetch: async req => {
    const b = await req.json();
    calls.push({ path: '/api/studio-ai/plan', body: b, auth: req.headers.get('authorization') });
    const variation = !['concepts', 'visuals', 'format'].includes(b.batch.testing);
    return nd({ type: 'status' }, { type: 'done', variation, exact: false, ads: b.batch.lines.map((l, i) => ({ headline: 'H' + (i + 1), subline: '', callouts: [], cta: '', art: '', look: 'chalk', style: 'hand', ref_url: '', ref_use: 'none', photo_url: '', note: '' })) });
  },
};

let n = 0, bad = 0;
const check = async (name, fn) => { try { await fn(); n++; console.log('PASS ', name); } catch (e) { bad++; console.log('FAIL ', name, '\n   ', e.stack); } };

await check('matchProduct: exact, handle, words, and none', () => {
  assert.equal(matchProduct(PRODUCTS, 'Bone & Joint Strips').handle, 'bone-joint');
  assert.equal(matchProduct(PRODUCTS, 'fresh-breath').handle, 'fresh-breath');
  assert.equal(matchProduct(PRODUCTS, 'bone and joint').handle, 'bone-joint');
  assert.equal(matchProduct(PRODUCTS, 'the Skin & Coat strips for itchy dogs').handle, 'skin-coat');
  assert.equal(matchProduct(PRODUCTS, 'calming chews'), null);
});

await check('readStream: the done line wins, an error line throws', async () => {
  assert.equal((await readStream(nd({ type: 'status' }, { type: 'done', ad: { id: 'x' } }))).ad.id, 'x');
  await assert.rejects(readStream(nd({ type: 'status' }, { type: 'error', text: 'OpenAI said no' })), /OpenAI said no/);
  await assert.rejects(readStream(nd({ type: 'status' })), /nothing back/);
});

await check('specFor: the browser spec shape for one planned ad', () => {
  const s = specFor({ products: [{ title: 'T', handle: 'h' }], images: ['i1'] }, { why: 'w' }, { headline: 'H', look: 'L', ref_url: 'r', ref_use: 'vibe' });
  assert.deepEqual(s.products, [{ title: 'T', handle: 'h' }]);
  assert.deepEqual(s.inspo, ['r']);
  assert.equal(s.who, 'w');
  assert.equal(s.style, 'auto');
});

const tool = studioMakeTools(d)[0];
const ctx = { surface: 'slack', channel: 'C_VP', thread: '111.1', screen: { act_id: 'brand_vp' }, who: 'Cole' };

await check('tool: another brand\'s batch and an unknown product are refused, nothing queued', async () => {
  let r = await tool.run(env, { batches: [{ batch_id: 'b_other', product: 'x' }] }, ctx);
  assert.ok(r.is_error && /another brand/.test(r.text));
  r = await tool.run(env, { batches: [{ batch_id: 'b_joint', product: 'calming chews' }] }, ctx);
  assert.ok(r.is_error && /Bone & Joint Strips/.test(r.text));
  assert.equal(queued.length, 0);
});

await check('tool: products matched, thread reference uploaded, ONE job queued, says when they land', async () => {
  const r = await tool.run(env, { batches: [{ batch_id: 'b_joint', product: 'Bone & Joint' }, { batch_id: 'b_breath', product: 'Fresh Breath' }] }, ctx);
  assert.ok(!r.is_error, r.text);
  assert.match(r.text, /Making 5 ads now/);
  assert.match(r.text, /reference image/);
  assert.equal(queued.length, 1);
  const j = queued[0];
  assert.equal(j.kind, 'studio_make');
  assert.equal(j.channel, 'C_VP');
  assert.deepEqual(j.swipe, ['https://profit/api/studio/ref/ref1.png']);
  assert.equal(j.jobs[0].product.handle, 'bone-joint');
  assert.ok(calls.some(c => c.path === '/api/studio/upload' && c.auth === 'Bearer mds.owner'));
});

await check('job: plan saved, 3 Makes for a concepts batch, Make + Vary for a hooks batch, batches made, ads posted', async () => {
  calls = []; slack = []; adN = 0;
  const res = await runStudioMake(env, d, queued[0]);
  assert.equal(res.length, 2);
  const plans = calls.filter(c => c.path === '/api/studio-ai/plan');
  assert.equal(plans.length, 2);
  assert.equal(plans[0].auth, 'Bearer adm');
  assert.deepEqual(plans[0].body.swipe, ['https://profit/api/studio/ref/ref1.png']);
  assert.equal(calls.filter(c => c.path === '/api/studio/make').length, 4, '3 for Joint + ad 1 of Breath');
  const vary = calls.filter(c => c.path === '/api/studio/vary');
  assert.equal(vary.length, 1);
  assert.equal(vary[0].body.line, 1);
  const mk = calls.find(c => c.path === '/api/studio/make' && c.body.batch_id === 'b_joint');
  assert.deepEqual(mk.body.spec.images, ['https://cdn/bj1.png', 'https://cdn/bj2.png']);
  const row = db.prepare(`SELECT status, setup_json, plan_json FROM p_studio_batch WHERE id = 'b_joint'`).get();
  assert.equal(row.status, 'made');
  assert.equal(JSON.parse(row.setup_json).products[0].handle, 'bone-joint');
  assert.equal(JSON.parse(row.plan_json).ads.length, 3);
  const posts = slack.filter(s => s.method === 'files.completeUploadExternal');
  assert.equal(posts.length, 2);
  assert.equal(posts.find(p => /Bone/.test(p.p.initial_comment)).p.files.length, 3);
  assert.equal(posts[0].p.thread_ts, '111.1');
  assert.ok(slack.some(s => s.method === 'chat.postMessage' && /5 of 5 ads are made/.test(s.p.text)));
});

await check('job: a failed Make is named in the post, the rest still land', async () => {
  const keep = env.PROFIT.fetch; let k = 0;
  env.PROFIT.fetch = async req => { if (new URL(req.url).pathname === '/api/studio/make' && ++k === 2) return nd({ type: 'error', text: 'Image AI busy' }); return keep(req); };
  slack = [];
  await runStudioMake(env, d, { ...queued[0], jobs: [queued[0].jobs[0]] });
  env.PROFIT.fetch = keep;
  const post = slack.find(s => s.method === 'files.completeUploadExternal');
  assert.equal(post.p.files.length, 2);
  assert.match(post.p.initial_comment, /2 of 3 made. Failed: ad \d: Image AI busy/);
});

console.log(`\n${n} passed, ${bad} failed`);
process.exit(bad ? 1 : 0);

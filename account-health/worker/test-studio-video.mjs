/* Offline checks for Studio "Make video" (src/studio-video.js): Veo start, poll, R2 copy, Range serving.
   Run: node test-studio-video.mjs */
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';

const db = new DatabaseSync(':memory:');
db.exec(`CREATE TABLE p_studio_cfg (key TEXT PRIMARY KEY, value TEXT, updated_at TEXT)`);
db.exec(`CREATE TABLE p_studio_ad (id TEXT PRIMARY KEY, act_id TEXT, batch_id TEXT, cost REAL DEFAULT 0)`);
db.exec(`INSERT INTO p_studio_ad (id, act_id, cost) VALUES ('a'.repeat(24), 'act_1', 0.3)`.replace(`'a'.repeat(24)`, `'${'a'.repeat(24)}'`));
const bindSql = sql => sql.replace(/\?(\d+)/g, (_, n) => ':p' + n);
const vals = a => Object.fromEntries(a.map((v, i) => ['p' + (i + 1), v === undefined ? null : v]));
const DB = { prepare(sql) { let args = []; const st = () => db.prepare(bindSql(sql));
  return { bind(...a) { args = a; return this; }, async first() { return st().get(vals(args)) || null; },
    async all() { return { results: st().all(vals(args)) }; }, async run() { st().run(vals(args)); return {}; } }; } };
const MEDIA = { store: new Map(),
  async put(k, buf) { this.store.set(k, new Uint8Array(buf)); },
  async head(k) { const b = this.store.get(k); return b ? { size: b.length } : null; },
  async get(k, o) { const b = this.store.get(k); if (!b) return null; const s = o?.range ? b.slice(o.range.offset, o.range.offset + o.range.length) : b; return { size: b.length, body: s }; },
  async delete(k) { this.store.delete(k); } };
const env = { DB, MEDIA, GEMINI_API_KEY: 'g-test' };

const calls = []; let pollDone = false, startStatus = 200;
globalThis.fetch = async (url, init = {}) => {
  calls.push({ url: String(url), init });
  if (/:predictLongRunning$/.test(url)) return startStatus === 200 ? Response.json({ name: 'models/veo/operations/op1' }) : Response.json({ error: { message: 'Quota exceeded for free tier' } }, { status: 429 });
  if (/operations\/op1$/.test(url)) return Response.json(pollDone ? { done: true, response: { generateVideoResponse: { generatedSamples: [{ video: { uri: 'https://files.example/v.mp4' } }] } } } : { done: false });
  if (/api\.higgsfield\.ai\/estimate/.test(url)) return ['Key kid:ksecret', 'Bearer single123'].includes(init.headers.Authorization) ? Response.json({ credits: '1', usd: '0.06' }) : Response.json({ detail: 'Invalid credentials' }, { status: 401 });
  if (url === 'https://files.example/v.mp4') return new Response(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]));
  return new Response('?', { status: 404 });
};
const V = await import('./src/studio-video.js');
const AD = 'a'.repeat(24);
const IMG = 'data:image/jpeg;base64,' + Buffer.from('frame').toString('base64');
let n = 0, fails = 0;
const check = async (name, fn) => { try { await fn(); n++; console.log('PASS ', name); } catch (e) { fails++; console.log('FAIL ', name, '\n     ', e.message); } };

await check('start: Veo gets the 9:16 frame, 8 s, 720p, the key in a header; a working row is stored with the price', async () => {
  const r = await V.startVideo(env, 'act_1', { ad_id: AD, image: IMG, motion: 'light', note: 'make the grass sway', quality: 'fast' });
  const c = calls.find(x => /predictLongRunning/.test(x.url));
  assert.match(c.url, /veo-3\.1-fast-generate-preview:predictLongRunning$/);
  assert.equal(c.init.headers['x-goog-api-key'], 'g-test');
  const body = JSON.parse(c.init.body);
  assert.deepEqual(body.parameters, { aspectRatio: '9:16', durationSeconds: '8', resolution: '720p', personGeneration: 'allow_adult' });
  assert.equal(body.instances[0].image.inlineData.mimeType, 'image/jpeg');
  assert.match(body.instances[0].prompt, /sweep of light/); assert.match(body.instances[0].prompt, /make the grass sway/); assert.match(body.instances[0].prompt, /no changed letters/);
  assert.equal(r.video.status, 'working'); assert.equal(r.video.cost, 1.2); assert.equal(r.video.url, null);
});
await check('start: another brand\'s ad and a bad frame are refused; Lite costs 40 cents', async () => {
  await assert.rejects(V.startVideo(env, 'act_2', { ad_id: AD, image: IMG }), /not in this brand/);
  await assert.rejects(V.startVideo(env, 'act_1', { ad_id: AD, image: 'nope' }), /frame/);
  const r = await V.startVideo(env, 'act_1', { ad_id: AD, image: IMG, quality: 'lite' });
  assert.equal(r.video.cost, 0.4); await V.deleteVideo(env, 'act_1', r.video.id);
});
await check('Google refusal (no billing) says so plainly', async () => {
  startStatus = 429;
  await assert.rejects(V.startVideo(env, 'act_1', { ad_id: AD, image: IMG }), /billing/);
  startStatus = 200;
});
await check('list polls working rows: not done stays working; done copies the mp4 into R2, marks ready, adds the cost to the ad', async () => {
  let l = await V.listVideos(env, 'act_1', 'https://ah.example');
  assert.equal(l.videos[0].status, 'working');
  pollDone = true;
  l = await V.listVideos(env, 'act_1', 'https://ah.example');
  const v = l.videos[0];
  assert.equal(v.status, 'ready'); assert.match(v.url, /^https:\/\/ah\.example\/studio-vid\/[a-f0-9]{24}\.mp4$/);
  assert.ok(MEDIA.store.has(`studio/vid/${v.id}.mp4`));
  assert.equal(db.prepare(`SELECT cost FROM p_studio_ad`).get().cost, 1.5);
  const dl = calls.find(x => x.url === 'https://files.example/v.mp4'); assert.equal(dl.init.headers['x-goog-api-key'], 'g-test');
});
await check('public mp4: full file, a Range request gets 206 with the right bytes, unknown id 404', async () => {
  const v = (await V.listVideos(env, 'act_1')).videos[0];
  const full = await V.serveVideo(new Request(`https://x/studio-vid/${v.id}.mp4`), env, `/studio-vid/${v.id}.mp4`);
  assert.equal(full.status, 200); assert.equal(full.headers.get('Accept-Ranges'), 'bytes');
  const part = await V.serveVideo(new Request(`https://x/studio-vid/${v.id}.mp4`, { headers: { Range: 'bytes=2-4' } }), env, `/studio-vid/${v.id}.mp4`);
  assert.equal(part.status, 206); assert.equal(part.headers.get('Content-Range'), 'bytes 2-4/10');
  assert.deepEqual([...new Uint8Array(await part.arrayBuffer())], [3, 4, 5]);
  const miss = await V.serveVideo(new Request('https://x/studio-vid/' + 'b'.repeat(24) + '.mp4'), env, '/studio-vid/' + 'b'.repeat(24) + '.mp4');
  assert.equal(miss.status, 404);
});
await check('delete removes the R2 file and hides the row', async () => {
  const v = (await V.listVideos(env, 'act_1')).videos[0];
  await V.deleteVideo(env, 'act_1', v.id);
  assert.ok(!MEDIA.store.has(`studio/vid/${v.id}.mp4`));
  assert.equal((await V.listVideos(env, 'act_1')).videos.length, 0);
});
await check('Higgsfield: wrong key refused and not stored; key + secret or one "id:secret" value checked and stored; status never returns the key; disconnect', async () => {
  await assert.rejects(V.hfSave(env, { key: 'kid', secret: 'bad' }), /did not accept/);
  assert.equal((await V.hfStatus(env)).connected, false);
  await assert.rejects(V.hfSave(env, { key: 'kid' }), /did not accept/);
  await V.hfSave(env, { key: 'kid', secret: 'ksecret' });
  assert.equal(db.prepare(`SELECT value FROM p_studio_cfg WHERE key = 'higgsfield_key'`).get().value, 'Key kid:ksecret');
  const st = await V.hfStatus(env); assert.equal(st.connected, true); assert.ok(!JSON.stringify(st).includes('ksecret'));
  assert.equal(await V.hfAuth(env), 'Key kid:ksecret');
  await V.hfSave(env, { clear: true }); assert.equal((await V.hfStatus(env)).connected, false);
  await V.hfSave(env, { key: 'kid:ksecret' }); assert.equal((await V.hfStatus(env)).connected, true);
  assert.ok('higgsfield' in await V.listVideos(env, 'act_1'));
  await V.hfSave(env, { key: 'single123' }); assert.equal(await V.hfAuth(env), 'Bearer single123', 'one-value key: the header shape it answers to is kept');
});
/* ---- Higgsfield video (connected from here on: Key kid:ksecret) ---- */
await V.hfSave(env, { key: 'kid', secret: 'ksecret' });
db.exec(`CREATE TABLE p_studio_batch (id TEXT PRIMARY KEY, act_id TEXT)`); db.exec(`INSERT INTO p_studio_batch VALUES ('b1', 'act_1')`);
let hfState = 'queued', lastSubmit = null;
const prevFetch = globalThis.fetch;
globalThis.fetch = async (url, init = {}) => {
  url = String(url);
  if (url.startsWith('https://api.higgsfield.ai/')) {
    calls.push({ url, init });
    if (init.headers?.Authorization !== 'Key kid:ksecret') return Response.json({ detail: 'Invalid credentials' }, { status: 401 });
    if (url.includes('/estimate/')) return Response.json({ credits: '20', usd: '1.25' });
    if (url.includes('/requests/')) return Response.json(hfState === 'completed' ? { status: 'completed', request_id: 'r1', video: { url: 'https://cdn.hf/out.mp4' } } : { status: hfState, request_id: 'r1' });
    lastSubmit = { url, body: JSON.parse(init.body), idem: init.headers['Idempotency-Key'] };
    return Response.json({ status: 'queued', request_id: 'r1', status_url: 'https://api.higgsfield.ai/requests/r1/status' });
  }
  if (url === 'https://cdn.hf/out.mp4') return new Response(new Uint8Array([9, 9, 9]));
  return prevFetch(url, init);
};
await check('routing: product photos or a reference video = Seedance reference-to-video; nothing = text-to-video; a frame = image-to-video', async () => {
  let r = V.hfBody({ prompt: 'p', image_urls: ['https://a/1.jpg', 'http://bad'], video_urls: ['https://a/v.mp4'], seconds: 12, aspect: '1:1', quality: 'best' });
  assert.equal(r.model, 'bytedance/seedance-2.5/reference-to-video');
  assert.deepEqual(r.body, { prompt: 'p', image_urls: ['https://a/1.jpg'], video_urls: ['https://a/v.mp4'], aspect_ratio: '1:1', duration: 12, resolution: '1080p', generate_audio: true });
  r = V.hfBody({ prompt: 'p', seconds: 90 }); assert.equal(r.model, 'bytedance/seedance-2.5/text-to-video'); assert.equal(r.body.duration, 30); assert.equal(r.body.aspect_ratio, '9:16');
  r = V.hfBody({ frame_url: 'https://a/f.jpg', prompt: 'move' }); assert.equal(r.model, 'bytedance/seedance-2.5/image-to-video'); assert.equal(r.body.image_url, 'https://a/f.jpg');
});
await check('Make a video: price checked first, submitted with an idempotency key, stored working with the estimate; another brand\'s batch refused', async () => {
  await assert.rejects(V.createVideo(env, 'act_2', { prompt: 'x', batch_id: 'b1' }), /not in this brand/);
  await assert.rejects(V.createVideo(env, 'act_1', { prompt: '' }), /Write the shot/);
  const e = await V.estimateHf(env, { prompt: 'a golfer talks to camera', image_urls: ['https://a/1.jpg'] });
  assert.equal(e.usd, 1.25);
  const r = await V.createVideo(env, 'act_1', { prompt: 'a golfer talks to camera', image_urls: ['https://a/1.jpg'], batch_id: 'b1', title: 'Pocket talk', look: 'ugc' });
  assert.match(lastSubmit.url, /seedance-2\.5\/reference-to-video$/); assert.equal(lastSubmit.idem, r.video.id);
  assert.equal(r.video.status, 'working'); assert.equal(r.video.provider, 'higgsfield'); assert.equal(r.video.cost, 1.25); assert.equal(r.video.batch_id, 'b1'); assert.equal(r.video.kind, 'create');
});
await check('poll: queued stays working; nsfw fails with "nothing was charged"; completed copies the mp4 into R2', async () => {
  let v = (await V.listVideos(env, 'act_1')).videos.find(x => x.provider === 'higgsfield');
  assert.equal(v.status, 'working');
  hfState = 'completed';
  v = (await V.listVideos(env, 'act_1')).videos.find(x => x.id === v.id);
  assert.equal(v.status, 'ready'); assert.ok(MEDIA.store.has(`studio/vid/${v.id}.mp4`));
  hfState = 'nsfw';
  const r2 = await V.createVideo(env, 'act_1', { prompt: 'y' });
  const v2 = (await V.listVideos(env, 'act_1')).videos.find(x => x.id === r2.video.id);
  assert.equal(v2.status, 'failed'); assert.match(v2.error, /Nothing was charged/);
});
await check('animate this ad goes to Higgsfield once connected: the frame is stored in R2 and served public, Seedance image-to-video', async () => {
  hfState = 'queued';
  const r = await V.startVideo(env, 'act_1', { ad_id: AD, image: IMG, motion: 'push', quality: 'lite' }, 'https://ah.example');
  assert.match(lastSubmit.url, /seedance-2\.5\/image-to-video$/);
  assert.match(lastSubmit.body.image_url, /^https:\/\/ah\.example\/studio-ref\/[a-f0-9]{24}\.jpg$/);
  assert.equal(lastSubmit.body.resolution, '720p');
  const key = 'studio/vref/' + lastSubmit.body.image_url.split('/').pop();
  assert.ok(MEDIA.store.has(key));
  const served = await V.serveRef(new Request(lastSubmit.body.image_url), env, '/studio-ref/' + key.split('/').pop());
  assert.equal(served.status, 200); assert.equal(served.headers.get('Content-Type'), 'image/jpeg');
  assert.equal(r.video.kind, 'animate'); assert.equal(r.video.ad_id, AD);
});
await check('upload: a reference video lands in R2 with a public URL; wrong types and empty files refused', async () => {
  const req = new Request('https://ah.example/api/studio-ai/upload?act=act_1', { method: 'POST', headers: { 'Content-Type': 'video/mp4' }, body: new Uint8Array([1, 2, 3]) });
  const u = await V.uploadRef(req, env, 'act_1', 'https://ah.example');
  assert.match(u.url, /^https:\/\/ah\.example\/studio-ref\/[a-f0-9]{24}\.mp4$/);
  await assert.rejects(V.uploadRef(new Request('https://x', { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: 'x' }), env, 'act_1'), /MP4/);
  await assert.rejects(V.uploadRef(new Request('https://x', { method: 'POST', headers: { 'Content-Type': 'video/mp4' }, body: new Uint8Array([]) }), env, 'act_1'), /empty/);
});
await check('no credits = a plain "add credits" message', async () => {
  const f = globalThis.fetch;
  globalThis.fetch = async (url, init) => String(url).startsWith('https://api.higgsfield.ai/') && !String(url).includes('/estimate/') ? Response.json({ detail: 'Insufficient credits' }, { status: 403 }) : f(url, init);
  await assert.rejects(V.createVideo(env, 'act_1', { prompt: 'z' }), /no credits/);
  globalThis.fetch = f;
});
console.log(`\n${n}/${n + fails} passed`);
if (fails) process.exit(1);

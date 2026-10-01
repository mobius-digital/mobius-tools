/* Offline checks for Studio "Make video" (src/studio-video.js): Veo start, poll, R2 copy, Range serving.
   Run: node test-studio-video.mjs */
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';

const db = new DatabaseSync(':memory:');
db.exec(`CREATE TABLE p_studio_ad (id TEXT PRIMARY KEY, act_id TEXT, cost REAL DEFAULT 0)`);
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
console.log(`\n${n}/${n + fails} passed`);
if (fails) process.exit(1);

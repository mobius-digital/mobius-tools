/* Offline checks for LOCUS PAGES (2026-11-02): the burner TikTok pages in src/burners.js.
 * The three Lucky pages are seeded once, the password is sealed and never in a list, a refresh reads the page's posts
 * and followers from a mocked ScrapeCreators, orders come by promo code from a mocked Triple Whale, the tests log
 * keeps its verdicts, and a client login is refused.
 *   node test-burners.mjs      (from account-health/worker)
 */
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..', '..');

/* ---------------- a D1 stand-in (same shape as test-socialpost.mjs) ---------------- */
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
db.exec(`INSERT INTO connections (id, brand_id, kind, external_id, is_primary, source) VALUES ('tw:lucky', 'brand_lucky_golf', 'tw', 'lucky-wedges.myshopify.com', 1, 'locus')`);

/* ---------------- mocks: ScrapeCreators, Triple Whale ---------------- */
const today = new Date().toISOString().slice(0, 10);
const nowSec = Math.floor(Date.now() / 1000);
const calls = [];
let twSqlSeen = '';
const mock = async (u, o = {}) => {
  const url = String(u);
  calls.push(url);
  if (url.includes('scrapecreators.com/v1/tiktok/profile')) return new Response(JSON.stringify({ stats: { followerCount: 15 } }), { headers: { 'content-type': 'application/json' } });
  if (url.includes('scrapecreators.com/v3/tiktok/profile/videos')) {
    if (!url.includes('handle=short.game.daily')) return new Response(JSON.stringify({ aweme_list: [] }), { headers: { 'content-type': 'application/json' } });
    return new Response(JSON.stringify({ credits_remaining: 900, aweme_list: [
      { aweme_id: '111', desc: 'Chip like this', create_time: nowSec - 3600, author: { unique_id: 'short.game.daily', follower_count: 1200 },
        statistics: { play_count: 50000, digg_count: 900, comment_count: 30, share_count: 12, collect_count: 40 }, image_post_info: { images: [{}, {}] } },
      { aweme_id: '222', desc: 'Bunker tip', create_time: nowSec - 7200, author: { unique_id: 'short.game.daily', follower_count: 1200 },
        statistics: { play_count: 4000, digg_count: 80, comment_count: 2, share_count: 1, collect_count: 3 } },
    ] }), { headers: { 'content-type': 'application/json' } });
  }
  if (url.includes('triplewhale.com')) {
    twSqlSeen = JSON.parse(o.body).query;
    return new Response(JSON.stringify({ data: [{ code: 'CHIP-SHIP', orders: 4, revenue: 396 }] }), { headers: { 'content-type': 'application/json' } });
  }
  return new Response('{}', { status: 404 });
};
const social = await import('./src/social.js');
social.useFetch(mock);
const B = await import('./src/burners.js');
B.useFetch(mock);

const env = { DB, SESSION_SECRET: 'test-secret', DOWNLOADER_KEY: 'k', TW_API_KEY: 'tw' };
const json = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: { 'Content-Type': 'application/json' } });
const waits = [];
const deps = { isAdmin: async () => true, waitUntil: p => waits.push(p) };
const call = async (method, p, body) => {
  const url = new URL(`https://x${p}`);
  const req = new Request(url, { method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  const r = await B.handleBurners(req, env, url, url.pathname, json, deps);
  return { status: r.status, body: await r.json(), headers: r.headers };
};

let n = 0;
const ok = (name, fn) => fn().then(() => { n++; console.log(`ok ${n} - ${name}`); });

await ok('the three Lucky pages are seeded once, warming, from 2026-11-01, no code or password', async () => {
  const r = await call('GET', '/api/burners?act=brand_lucky_golf&from=2026-11-01&to=2026-11-01');
  assert.equal(r.status, 200);
  const names = r.body.pages.map(p => p.name).sort();
  assert.deepEqual(names, ['Golf Gear Honest', 'Golf Hot Takes', 'Short Game Daily']);
  for (const p of r.body.pages) { assert.equal(p.status, 'warming'); assert.equal(p.start_date, '2026-11-01'); assert.equal(p.code, ''); assert.equal(p.has_pw, false); }
  assert.equal(r.body.pages.find(p => p.name === 'Golf Hot Takes').email, 'golfhottakes.lg@gmail.com');
  await Promise.all(waits.splice(0));
  await call('DELETE', '/api/burners/bp_hottakes');
  const again = await call('GET', '/api/burners?act=brand_lucky_golf');
  assert.equal(again.body.pages.length, 2, 'a deleted seed page stays deleted');
  await Promise.all(waits.splice(0));
});

await ok('a password is sealed, never in a list or a write answer, and only Reveal returns it', async () => {
  const w = await call('PUT', '/api/burners/bp_shortgame', { password: 'hunter2!', code: 'chip-ship', offer: 'Free shipping on the Carver 02' });
  assert.equal(w.status, 200);
  assert.equal(w.body.page.has_pw, true);
  assert.equal(w.body.page.code, 'CHIP-SHIP');
  assert.ok(!JSON.stringify(w.body).includes('hunter2'));
  const row = db.prepare(`SELECT pw_enc FROM burner_page WHERE id = 'bp_shortgame'`).get();
  assert.ok(row.pw_enc && !row.pw_enc.includes('hunter2'), 'stored sealed');
  const list = await call('GET', '/api/burners?act=brand_lucky_golf');
  assert.ok(!JSON.stringify(list.body).includes('hunter2') && !JSON.stringify(list.body).includes(row.pw_enc));
  await Promise.all(waits.splice(0));
  const rv = await call('GET', '/api/burners/bp_shortgame/password');
  assert.equal(rv.body.password, 'hunter2!');
  assert.equal(rv.headers.get('Cache-Control'), 'no-store');
  const keep = await call('PUT', '/api/burners/bp_shortgame', { notes: 'warming 15 min a day' });
  assert.equal(keep.body.page.has_pw, true, 'an edit without a password keeps it');
  const clr = await call('PUT', '/api/burners/bp_shortgame', { clear_password: true });
  assert.equal(clr.body.page.has_pw, false);
  await call('PUT', '/api/burners/bp_shortgame', { password: 'hunter2!' });
});

await ok('refresh reads posts and followers (1 credit) and the overview ranks with views, best posts and orders by code', async () => {
  const r = await call('POST', '/api/burners/bp_shortgame/refresh');
  assert.equal(r.status, 200);
  assert.equal(r.body.followers, 1200);
  assert.equal(r.body.credits, 1);
  const o = await call('GET', `/api/burners?act=brand_lucky_golf&from=${today}&to=${today}`);
  const p = o.body.pages[0];
  assert.equal(p.name, 'Short Game Daily', 'the page with orders ranks first');
  assert.equal(p.range.posts, 2);
  assert.equal(p.range.views, 54000);
  assert.equal(p.best[0].views, 50000);
  assert.equal(p.range.orders, 4);
  assert.equal(p.range.revenue, 396);
  assert.ok(twSqlSeen.includes(`'CHIP-SHIP'`) && /discount_code/.test(twSqlSeen));
  assert.equal(o.body.funnel.views, 54000);
  assert.equal(o.body.funnel.orders, 4);
  assert.equal(o.body.funnel.visits, null);
  const gh = o.body.pages.find(x => x.id === 'bp_gearhonest');
  assert.equal(gh.range.orders, null, 'no code = no orders, never a zero');
  assert.equal(gh.followers, 15, 'a page with no posts yet gets followers from the profile call');
  await Promise.all(waits.splice(0));
});

await ok('no Triple Whale = orders left out with a note', async () => {
  const save = env.TW_API_KEY; delete env.TW_API_KEY;
  const o = await call('GET', `/api/burners?act=brand_lucky_golf&from=${today}&to=${today}`);
  assert.equal(o.body.funnel.orders, null);
  assert.ok(o.body.orders_note);
  env.TW_API_KEY = save;
  await Promise.all(waits.splice(0));
});

await ok('a new page and bad input', async () => {
  const c = await call('POST', '/api/burners', { act: 'brand_lucky_golf', name: 'Putt Lab', handle: '@putt.lab', start_date: '2026-11-03' });
  assert.equal(c.status, 200);
  assert.equal(c.body.page.handle, 'putt.lab');
  assert.equal(c.body.page.status, 'warming');
  assert.equal((await call('PUT', `/api/burners/${c.body.page.id}`, { status: 'paused' })).status, 400);
  assert.equal((await call('POST', '/api/burners', { act: 'nope', name: 'x' })).status, 400);
  const b = await call('PUT', `/api/burners/${c.body.page.id}`, { status: 'banned' });
  assert.equal(b.body.page.status, 'banned');
});

await ok('tests log: live, verdicts, search fields', async () => {
  const t = await call('POST', '/api/burners/tests', { act: 'brand_lucky_golf', what: 'Hook: "stop chunking chips"', pages: ['bp_shortgame'], start_date: '2026-11-02' });
  assert.equal(t.status, 200);
  assert.equal(t.body.test.verdict, '');
  const w = await call('PUT', `/api/burners/tests/${t.body.test.id}`, { verdict: 'win', result: '3x views vs page normal', metric: 'views/post', value: 42000, end_date: '2026-11-09' });
  assert.equal(w.body.test.verdict, 'win');
  assert.equal(w.body.test.value, 42000);
  assert.equal((await call('PUT', `/api/burners/tests/${t.body.test.id}`, { verdict: 'maybe' })).status, 400);
  await call('POST', '/api/burners/tests', { act: 'brand_lucky_golf', what: '7 slides vs 4', pages: ['bp_gearhonest'], verdict: 'killed' });
  const l = await call('GET', '/api/burners/tests?act=brand_lucky_golf');
  assert.equal(l.body.tests.length, 2);
  assert.deepEqual(l.body.tests.find(x => x.verdict === 'win').pages, ['bp_shortgame']);
});

await ok('a client login is refused, and nothing here calls Slack', async () => {
  const url = new URL('https://x/api/burners?act=brand_lucky_golf');
  const r = await B.handleBurners(new Request(url), env, url, url.pathname, json, { ...deps, isAdmin: async () => false });
  assert.equal(r.status, 401);
  assert.ok(!calls.some(u => u.includes('slack.com')));
});

console.log(`\n${n} checks passed`);

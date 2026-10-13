/* Offline checks for PRODUCTION (2026-10-13 fourth pass, src/production.js + boardOf in src/asana-brand.js): the Asana
 * section to board column mapping, the card shape, the board read, a drag (Asana follows, Review stays Locus only, one
 * Slack line), and the routes' team-only gate. In-memory SQLite (node:sqlite), Asana and Slack mocked.
 *   node test-production.mjs      (from account-health/worker) */
import { DatabaseSync } from 'node:sqlite';
import assert from 'node:assert/strict';
import { boardOf } from './src/asana-brand.js';
import { formatOf, cardOf, listBoard, moveCard, handleProduction } from './src/production.js';

const db = new DatabaseSync(':memory:');
const bindSql = sql => sql.replace(/\?(\d+)/g, (_, n) => ':p' + n);
const vals = a => Object.fromEntries(a.map((v, i) => ['p' + (i + 1), v === undefined ? null : typeof v === 'boolean' ? +v : v]));
const stmt = sql => { let args = []; const st = () => db.prepare(bindSql(sql)); return { bind(...a) { args = a; return this; }, async first() { return st().get(vals(args)) || null; }, async all() { return { results: st().all(vals(args)) }; }, async run() { st().run(vals(args)); return { success: true }; } }; };
const env = { DB: { prepare: stmt } };
db.exec(`CREATE TABLE p_br_batch (id TEXT PRIMARY KEY, act_id TEXT, num TEXT, title TEXT, stage TEXT, asana_gid TEXT, asana_url TEXT, asana_section TEXT, brief_url TEXT, asset_url TEXT, brief_text TEXT, verdict TEXT, asana_result TEXT, assignee_gid TEXT, source TEXT, created_at TEXT, updated_at TEXT)`);
db.exec(`CREATE TABLE p_br_doc (act_id TEXT, line_id TEXT, key TEXT, data_json TEXT)`);
db.prepare(`INSERT INTO p_br_doc VALUES ('brand_alpha', '', 'asana', ?)`).run(JSON.stringify({ project_gid: 'P1', last_sync: '2026-10-13T10:00:00Z' }));
const add = (id, act, num, title, stage, section, gid, extra = '') => db.exec(`INSERT INTO p_br_batch (id, act_id, num, title, stage, asana_section, asana_gid, asana_url, created_at, updated_at) VALUES ('${id}', '${act}', '${num}', '${title}', '${stage}', ${section ? `'${section}'` : 'NULL'}, ${gid ? `'${gid}'` : 'NULL'}, ${gid ? `'https://app.asana.com/0/P1/${gid}'` : 'NULL'}, '2026-10-01', '${extra || '2026-10-12'}')`);
add('c1', 'brand_alpha', '101', 'Hook test video', 'idea', 'Creative Briefs', 'T1');
add('c2', 'brand_alpha', '102', 'UGC unboxing', 'production', 'Creative Studio', 'T2');
add('c3', 'brand_alpha', '99', 'Old static', 'live', 'Analyze Results', 'T3');
add('c4', 'brand_alpha', '98', 'Done one', 'done', 'Completed Tasks', 'T4');
add('c5', 'brand_beta', '7', 'Carousel of colors', 'production', 'Ready to Launch', null);
add('c6', 'brand_alpha', '50', 'Ancient live', 'live', 'Analyze Results', 'T6', '2026-01-01');

const BRANDS = [{ act_id: 'brand_alpha', name: 'Alpha Golf', slack_channel: 'C_ALPHA' }, { act_id: 'brand_beta', name: 'Beta Socks', slack_channel: null }];
let posts = [], calls = [], sections = [{ gid: 'S1', name: 'Creative Briefs' }, { gid: 'S2', name: 'Creative Studio' }, { gid: 'S3', name: 'Ready to Launch' }, { gid: 'S4', name: 'Analyze Results' }, { gid: 'S5', name: 'Completed Tasks' }];
const d = {
  listBrands: async () => BRANDS, centralDate: () => '2026-10-14',
  asana: async (e, path, init) => { calls.push({ path, init }); if (path.includes('/sections?')) return sections; return {}; },
  slackPost: async (e, channel, text) => { posts.push({ channel, text }); return { ok: true }; },
  isAdmin: async req => req.headers.get('authorization') === 'Bearer team', sessionEmail: async () => 'ahsan@go-mobius-digital.com', clientScope: req => req.headers.get('x-client') ? { ids: ['brand_alpha'] } : null,
};
const json = (b, status = 200) => new Response(JSON.stringify(b), { status, headers: { 'content-type': 'application/json' } });
let n = 0, bad = 0;
const check = async (name, fn) => { try { await fn(); n++; console.log('PASS ', name); } catch (e) { bad++; console.log('FAIL ', name, '\n   ', e.message); } };

await check('boardOf: every Asana section name maps to its column; the old stage is the fallback; done wins', async () => {
  assert.equal(boardOf('Creative Brief', 'idea'), 'brief'); assert.equal(boardOf('Creative Briefs', null), 'brief');
  assert.equal(boardOf('Creative Studio', 'production'), 'making');
  assert.equal(boardOf('Review', 'production'), 'review');
  assert.equal(boardOf('Ready to Launch', 'production'), 'ready');
  assert.equal(boardOf('Analyze Results', 'live'), 'live');
  assert.equal(boardOf('Completed Tasks', 'live'), 'done'); assert.equal(boardOf('Creative Studio', 'done'), 'done');
  assert.equal(boardOf(null, 'idea'), 'brief'); assert.equal(boardOf('', 'production'), 'making'); assert.equal(boardOf(undefined, 'live'), 'live');
  assert.equal(boardOf('Backlog', 'other'), null); assert.equal(boardOf(null, null), null);
});
await check('formatOf: a display chip read from the title and brief', async () => {
  assert.equal(formatOf('UGC unboxing'), 'UGC'); assert.equal(formatOf('Carousel of colors'), 'Carousel');
  assert.equal(formatOf('Hook test', ''), 'Video'); assert.equal(formatOf('New offer', 'a reel for the drop'), 'Video'); assert.equal(formatOf('Price card'), 'Static');
});
await check('cardOf: late only when the due date has passed and the card is not live', async () => {
  const base = { id: 'x', act_id: 'brand_alpha', num: '1', title: 'T', stage: 'production', asana_section: 'Creative Studio', due_on: '2026-10-10', created_at: '2026-10-01' };
  const c = cardOf(base, BRANDS, '2026-10-14');
  assert.equal(c.board, 'making'); assert.equal(c.brand, 'Alpha Golf'); assert.equal(c.late, true); assert.equal(c.due, '2026-10-10');
  assert.equal(cardOf({ ...base, board_stage: 'live' }, BRANDS, '2026-10-14').late, false, 'a live card is never late');
  assert.equal(cardOf({ ...base, due_on: '2026-10-20' }, BRANDS, '2026-10-14').late, false);
  assert.equal(cardOf({ ...base, due_on: 'Friday' }, BRANDS, '2026-10-14').due, '', 'a bad date is dropped');
  assert.equal(cardOf({ ...base, board_stage: 'review' }, BRANDS, '2026-10-14').board, 'review', 'the Locus column wins');
});
await check('listBoard: open cards in their columns, done ones gone, old live ones gone, one brand or all', async () => {
  const b = await listBoard(env, d, { act: 'all' });
  const by = Object.fromEntries(b.cards.map(c => [c.id, c.board]));
  assert.deepEqual(by, { c1: 'brief', c2: 'making', c3: 'live', c5: 'ready' });
  assert.equal(b.live.total, 1); assert.equal(b.synced_at, '2026-10-13T10:00:00Z'); assert.equal(b.today, '2026-10-14');
  assert.ok(b.team.length > 0); assert.deepEqual(b.brands.map(x => x.act_id), ['brand_alpha', 'brand_beta']);
  assert.equal(b.cards.find(c => c.id === 'c2').format, 'UGC');
  const one = await listBoard(env, d, { act: 'brand_beta' });
  assert.deepEqual(one.cards.map(c => c.id), ['c5']);
});
await check('moveCard: Making moves the Asana task to Creative Studio and posts one line; Review leaves Asana alone', async () => {
  calls = []; posts = [];
  const m = await moveCard(env, d, { id: 'c1', to: 'making' }, 'ahsan@go-mobius-digital.com');
  assert.equal(m.from, 'brief'); assert.equal(m.to, 'making'); assert.equal(m.asana.moved, true); assert.equal(m.asana.section, 'Creative Studio');
  assert.deepEqual(calls.map(c => c.path), ['/projects/P1/sections?opt_fields=name', '/sections/S2/addTask']);
  assert.deepEqual(calls[1].init.body, { task: 'T1' });
  const row = db.prepare(`SELECT board_stage, stage, asana_section FROM p_br_batch WHERE id = 'c1'`).get();
  assert.deepEqual({ ...row }, { board_stage: 'making', stage: 'production', asana_section: 'Creative Studio' });
  assert.equal(posts.length, 1); assert.equal(posts[0].channel, 'C_ALPHA');
  assert.match(posts[0].text, /^Ahsan moved \*101 - Hook test video\* to Making · <https:\/\/app\.asana\.com\/0\/P1\/T1\|Asana>$/);
  assert.ok(!/—/.test(posts[0].text));
  calls = []; posts = [];
  const r = await moveCard(env, d, { id: 'c1', to: 'review' }, 'ahsan@go-mobius-digital.com');
  assert.equal(r.asana.moved, false); assert.match(r.asana.why, /Review lives only in Locus/); assert.equal(calls.length, 0);
  assert.equal(db.prepare(`SELECT asana_section FROM p_br_batch WHERE id = 'c1'`).get().asana_section, 'Creative Studio', 'the task stays in Creative Studio');
  assert.equal((await listBoard(env, d, { act: 'brand_alpha' })).cards.find(c => c.id === 'c1').board, 'review');
  assert.equal(posts.length, 1);
});
await check('moveCard: no Asana task = a reason, no section = a reason and the Asana section kept, bad column 400, unknown card 404', async () => {
  calls = []; posts = [];
  const m = await moveCard(env, d, { id: 'c5', to: 'live' }, 'ahsan@go-mobius-digital.com');
  assert.equal(m.asana.why, 'This card has no Asana task.'); assert.equal(calls.length, 0); assert.equal(m.slack, false, 'Beta has no channel');
  sections = [{ gid: 'S1', name: 'Creative Briefs' }];
  const x = await moveCard(env, d, { id: 'c2', to: 'ready' }, 'ahsan@go-mobius-digital.com');
  assert.equal(x.asana.moved, false); assert.equal(x.asana.why, 'no Ready section in the Asana project');
  assert.equal(db.prepare(`SELECT asana_section FROM p_br_batch WHERE id = 'c2'`).get().asana_section, 'Creative Studio');
  await assert.rejects(moveCard(env, d, { id: 'c2', to: 'bogus' }), e => e.status === 400 && /Pick a column/.test(e.message));
  await assert.rejects(moveCard(env, d, { id: 'nope', to: 'brief' }), e => e.status === 404);
  posts = [];
  const same = await moveCard(env, d, { id: 'c2', to: 'ready' }, 'ahsan@go-mobius-digital.com');
  assert.equal(same.from, 'ready'); assert.equal(posts.length, 0, 'no line when the column did not change');
});
await check('routes: team only (401, 403 for a client), GET the board, POST move, brief needs a brand and words, other paths pass', async () => {
  const call = async (path, { method = 'GET', body, auth = 'Bearer team', client } = {}) => {
    const h = new Headers(); if (auth) h.set('authorization', auth); if (client) h.set('x-client', '1');
    const url = new URL('https://x' + path);
    const req = new Request(url, { method, headers: h, ...(body ? { body: JSON.stringify(body) } : {}) });
    const r = await handleProduction(req, env, url, url.pathname, json, d);
    return r && { status: r.status, body: await r.json() };
  };
  assert.equal(await call('/api/actions'), null);
  assert.equal((await call('/api/production', { auth: null })).status, 401);
  assert.equal((await call('/api/production', { client: true })).status, 403);
  const g = await call('/api/production?act=brand_alpha'); assert.equal(g.status, 200); assert.ok(Array.isArray(g.body.cards));
  sections = [{ gid: 'S1', name: 'Creative Briefs' }, { gid: 'S2', name: 'Creative Studio' }];
  const mv = await call('/api/production/move', { method: 'POST', body: { id: 'c2', to: 'making' } }); assert.equal(mv.status, 200); assert.equal(mv.body.asana.moved, true);
  assert.equal((await call('/api/production/move', { method: 'POST', body: { id: 'c2', to: 'x' } })).status, 400);
  const b1 = await call('/api/production/brief', { method: 'POST', body: { act: 'brand_zeta', text: 'x' } }); assert.equal(b1.status, 400); assert.equal(b1.body.error, 'Pick the brand.');
  const b2 = await call('/api/production/brief', { method: 'POST', body: { act: 'brand_alpha', text: '  ' } }); assert.equal(b2.status, 400); assert.equal(b2.body.error, 'Say what to make.');
  assert.equal((await call('/api/production/move')).status, 404);
});

console.log(`\n${n} passed, ${bad} failed`);
if (bad) process.exit(1);

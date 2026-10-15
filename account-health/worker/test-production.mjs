/* Offline checks for PRODUCTION (2026-10-13 fourth pass, src/production.js + boardOf in src/asana-brand.js): the Asana
 * section to board column mapping, the card shape, the board read, a drag (Asana follows, Review stays Locus only, one
 * Slack line), and the routes' team-only gate. In-memory SQLite (node:sqlite), Asana and Slack mocked.
 *   node test-production.mjs      (from account-health/worker) */
import { DatabaseSync } from 'node:sqlite';
import assert from 'node:assert/strict';
import { boardOf } from './src/asana-brand.js';
import { formatOf, cardOf, listBoard, moveCard, handleProduction, setField, archiveCard, restoreCard, duplicateCard, listArchived } from './src/production.js';

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
let posts = [], calls = [], moved = [], sections = [{ gid: 'S1', name: 'Creative Briefs' }, { gid: 'S2', name: 'Creative Studio' }, { gid: 'S3', name: 'Ready to Launch' }, { gid: 'S4', name: 'Analyze Results' }, { gid: 'S5', name: 'Completed Tasks' }];
const d = {
  listBrands: async () => BRANDS, centralDate: () => '2026-10-14',
  asana: async (e, path, init) => { calls.push({ path, init }); if (path.includes('/sections?')) return sections; return {}; },
  slackPost: async (e, channel, text) => { posts.push({ channel, text }); return { ok: true }; },
  onProdMoved: async (e, id) => { moved.push(id); },
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
await check('moveCard: Making moves the Asana task to Creative Studio, posts NOTHING in Slack (the board is the record) and tells the morning card; Review leaves Asana alone', async () => {
  calls = []; posts = []; moved = [];
  const m = await moveCard(env, d, { id: 'c1', to: 'making' }, 'ahsan@go-mobius-digital.com');
  assert.equal(m.from, 'brief'); assert.equal(m.to, 'making'); assert.equal(m.asana.moved, true); assert.equal(m.asana.section, 'Creative Studio');
  assert.deepEqual(calls.map(c => c.path), ['/projects/P1/sections?opt_fields=name', '/sections/S2/addTask']);
  assert.deepEqual(calls[1].init.body, { task: 'T1' });
  const row = db.prepare(`SELECT board_stage, stage, asana_section FROM p_br_batch WHERE id = 'c1'`).get();
  assert.deepEqual({ ...row }, { board_stage: 'making', stage: 'production', asana_section: 'Creative Studio' });
  assert.equal(posts.length, 0, 'no Slack line per drag (2026-10-13)'); assert.deepEqual(moved, ['c1'], 'the morning card hears about it');
  calls = []; posts = [];
  const r = await moveCard(env, d, { id: 'c1', to: 'review' }, 'ahsan@go-mobius-digital.com');
  assert.equal(r.asana.moved, false); assert.match(r.asana.why, /Review lives only in Locus/); assert.equal(calls.length, 0);
  assert.equal(db.prepare(`SELECT asana_section FROM p_br_batch WHERE id = 'c1'`).get().asana_section, 'Creative Studio', 'the task stays in Creative Studio');
  assert.equal((await listBoard(env, d, { act: 'brand_alpha' })).cards.find(c => c.id === 'c1').board, 'review');
  assert.equal(posts.length, 0);
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
  const b2 = await call('/api/production/brief', { method: 'POST', body: { act: 'brand_alpha', text: '  ' } }); assert.equal(b2.status, 400); assert.equal(b2.body.error, 'Name the brief.');
  assert.equal((await call('/api/production/move')).status, 404);
});

await check('the board from the outside (2026-10-15): one field at a time (owner and due reach Asana, format lives in the page), archive = off the board + Asana complete, restore puts it back, duplicate = an Iteration page pointing at the card', async () => {
  sections = [{ gid: 'S1', name: 'Creative Briefs' }, { gid: 'S2', name: 'Creative Studio' }, { gid: 'S3', name: 'Ready to Launch' }];
  db.exec(`CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT)`);
  const dd = { ...d, asanaAll: async (e, path) => /\/users\?/.test(path) ? [{ gid: 'U_RAVO', name: 'Ravo Editor', email: 'ravo@go-mobius-digital.com' }, { gid: 'U_AHSAN', name: 'Ahsan Abidi', email: 'ahsan@go-mobius-digital.com' }] : [] };
  db.prepare(`UPDATE p_br_doc SET data_json = ? WHERE act_id = 'brand_alpha'`).run(JSON.stringify({ project_gid: 'P1', workspace: 'W1', last_sync: '2026-10-13T10:00:00Z' }));
  calls = [];
  const f1 = await setField(env, dd, { id: 'c1', owner: 'Ravo', due: '2026-10-20' }, 'ahsan@go-mobius-digital.com');
  assert.equal(f1.ok, true); assert.equal(f1.card.assignee, 'Ravo'); assert.equal(f1.card.due, '2026-10-20'); assert.equal(f1.asana.written, true);
  const put = calls.find(c => c.path === '/tasks/T1' && c.init && c.init.method === 'PUT');
  assert.deepEqual(put.init.body, { due_on: '2026-10-20', assignee: 'U_RAVO' }, 'the Asana task gets the date and the person');
  const f2 = await setField(env, dd, { id: 'c1', format: 'Video' }, 'x');
  assert.equal(f2.card.format, 'Video'); assert.equal(JSON.parse(db.prepare(`SELECT brief_json FROM p_br_batch WHERE id = 'c1'`).get().brief_json).format, 'Video', 'the format lives in the page');
  calls = [];
  const f3 = await setField(env, dd, { id: 'c1', owner: '' }, 'x'); assert.equal(f3.card.assignee, ''); assert.deepEqual(calls[0].init.body, { assignee: null });
  await assert.rejects(setField(env, dd, { id: 'c1', due: 'Friday' }, 'x'), e => e.status === 400);
  await assert.rejects(setField(env, dd, { id: 'c1' }, 'x'), e => e.status === 400 && /Nothing to change/.test(e.message));
  await assert.rejects(setField(env, dd, { id: 'c1', format: 'Banner' }, 'x'), e => e.status === 400);
  const f4 = await setField(env, dd, { id: 'c5', due: '2026-11-01' }, 'x'); assert.equal(f4.asana.why, 'This card has no Asana task.');
  /* archive */
  calls = [];
  const a = await archiveCard(env, dd, { id: 'c1' }, 'ahsan@go-mobius-digital.com');
  assert.equal(a.ok, true); assert.equal(a.was, 'review'); assert.equal(a.asana.done, true);
  assert.deepEqual(calls[0], { path: '/tasks/T1', init: { method: 'PUT', body: { completed: true } } });
  assert.ok(!(await listBoard(env, dd, { act: 'brand_alpha' })).cards.some(c => c.id === 'c1'), 'off the board');
  assert.deepEqual({ ...db.prepare(`SELECT stage, board_stage FROM p_br_batch WHERE id = 'c1'`).get() }, { stage: 'done', board_stage: 'done' });
  calls = [];
  const back = await restoreCard(env, dd, { id: 'c1', to: 'making' }, 'x');
  assert.equal(back.to, 'making'); assert.deepEqual(calls[0].init.body, { completed: false }); assert.equal(back.asana.moved, true);
  assert.equal((await listBoard(env, dd, { act: 'brand_alpha' })).cards.find(c => c.id === 'c1').board, 'making', 'back on the board');
  /* duplicate: Asana connected and the mirror on, so the new task is made and the Iteration page written into it */
  calls = [];
  const dup = await duplicateCard(env, dd, { id: 'c2' }, 'ahsan@go-mobius-digital.com');
  assert.equal(dup.title, 'UGC unboxing (iteration)'); assert.ok(dup.id && dup.id !== 'c2'); assert.equal(dup.num, 103, 'the next number after 102');
  const row = db.prepare(`SELECT title, act_id, board_stage, brief_json, asana_gid FROM p_br_batch WHERE id = ?`).get(dup.id);
  assert.equal(row.act_id, 'brand_alpha'); assert.equal(row.board_stage, 'brief');
  const page = JSON.parse(row.brief_json); assert.equal(page.format, 'UGC'); assert.match(page.html, /<h2>Iteration<\/h2>/); assert.match(page.html, /<strong>Iterating on<\/strong><\/p><p>102-1/, 'points at the card it comes from');
  assert.ok(calls.some(c => c.init && c.init.method === 'POST' && c.path.startsWith('/tasks?')), 'the Asana task is made');
  /* the routes: team only */
  const call = async (path, body, client) => { const h = new Headers({ authorization: 'Bearer team' }); if (client) h.set('x-client', '1'); const url = new URL('https://x' + path); const r = await handleProduction(new Request(url, { method: 'POST', headers: h, body: JSON.stringify(body) }), env, url, url.pathname, json, dd); return { status: r.status, body: await r.json() }; };
  for (const [pth, body] of [['/api/production/field', { id: 'c2', due: '2026-10-21' }], ['/api/production/card/delete', { id: 'c2' }], ['/api/production/card/restore', { id: 'c2', to: 'making' }], ['/api/production/duplicate', { id: 'c2' }]])
    assert.equal((await call(pth, body, true)).status, 403, `${pth} is the team's`);
  assert.equal((await call('/api/production/field', { id: 'c2', launch_on: '2026-10-30' })).body.card.launch_on, '2026-10-30');
  assert.equal((await call('/api/production/field', { id: 'nope', due: '' })).status, 404);
});

await check('Archived (2026-10-15 polish): cards archived in the last 60 days with the column they left; older and open ones never; the GET route is the team\'s; Put back = restore', async () => {
  const dd = { ...d };
  await archiveCard(env, dd, { id: 'c2' }, 'ahsan@go-mobius-digital.com');   /* c2's Asana task sits in Creative Studio since the routes check */
  db.exec(`UPDATE p_br_batch SET board_at = '2026-10-14 09:00:00' WHERE id = 'c2'`);
  db.exec(`UPDATE p_br_batch SET board_stage = 'done', stage = 'done', board_at = '2026-06-01 09:00:00' WHERE id = 'c4'`);   /* long gone */
  const a = await listArchived(env, dd, { act: 'brand_alpha' });
  assert.equal(a.days, 60);
  assert.ok(a.cards.some(c => c.id === 'c2'), 'the fresh one is listed');
  assert.ok(!a.cards.some(c => c.id === 'c4'), 'an archive older than 60 days is not');
  assert.ok(!a.cards.some(c => c.id === 'c1'), 'a card on the board is not');
  const c2 = a.cards.find(c => c.id === 'c2');
  assert.equal(c2.brand, 'Alpha Golf'); assert.equal(c2.num, '102'); assert.equal(c2.archived_at, '2026-10-14'); assert.equal(c2.was, 'making', 'the Asana section (Creative Studio, from the earlier move) still says where it was');
  assert.ok(!('board' in c2) && !('brief_text' in c2), 'a lean row');
  assert.ok((await listArchived(env, dd, { act: 'all' })).cards.some(c => c.id === 'c2'));
  assert.deepEqual((await listArchived(env, dd, { act: 'brand_beta' })).cards, []);
  const call = async (path, client) => { const h = new Headers({ authorization: 'Bearer team' }); if (client) h.set('x-client', '1'); const url = new URL('https://x' + path); const r = await handleProduction(new Request(url, { method: 'GET', headers: h }), env, url, url.pathname, json, dd); return { status: r.status, body: await r.json() }; };
  const g = await call('/api/production/archived?act=brand_alpha'); assert.equal(g.status, 200); assert.ok(g.body.cards.some(c => c.id === 'c2'));
  assert.equal((await call('/api/production/archived?act=brand_alpha', true)).status, 403, 'a client never lists the archive');
  const back = await restoreCard(env, dd, { id: 'c2', to: c2.was }, 'x');
  assert.equal(back.to, 'making');
  assert.ok(!(await listArchived(env, dd, { act: 'brand_alpha' })).cards.some(c => c.id === 'c2'), 'off the archive once back on the board');
});

console.log(`\n${n} passed, ${bad} failed`);
if (bad) process.exit(1);

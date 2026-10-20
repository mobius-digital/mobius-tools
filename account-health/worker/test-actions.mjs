/* Offline checks for ACTION ITEMS (2026-10-13, src/actions.js): rows, the Monday-style open list, the reminder tick
 * (once a day per owner per brand, Done buttons, the agency channel, a DM when a brand has no channel), the Done
 * button and the ✅ reaction, the routes' team-only gate. In-memory SQLite (node:sqlite), Slack mocked.
 *   node test-actions.mjs      (from account-health/worker) */
import { DatabaseSync } from 'node:sqlite';
import assert from 'node:assert/strict';
import { addAction, listActions, markDone, editAction, openItems, actionTick, reminderMessage, handleActionButton, handleReaction, handleActions, parseQuick, judgeAreas } from './src/actions.js';

const db = new DatabaseSync(':memory:');
const bindSql = sql => sql.replace(/\?(\d+)/g, (_, n) => ':p' + n);
const vals = a => Object.fromEntries(a.map((v, i) => ['p' + (i + 1), v === undefined ? null : typeof v === 'boolean' ? +v : v]));
const stmt = sql => { let args = []; const st = () => db.prepare(bindSql(sql)); return { bind(...a) { args = a; return this; }, async first() { return st().get(vals(args)) || null; }, async all() { return { results: st().all(vals(args)) }; }, async run() { st().run(vals(args)); return { success: true }; } }; };
const env = { DB: { prepare: stmt } };
db.exec(`CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT)`);
const setSetting = (k, v) => db.prepare(`INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`).run(k, v);

let hour = 8, posts = [], updates = [], replaced = [];
const BRANDS = [{ act_id: 'brand_alpha', name: 'Alpha Golf', slack_channel: 'C_ALPHA' }, { act_id: 'brand_beta', name: 'Beta Socks', slack_channel: null }];
const d = {
  listBrands: async () => BRANDS, centralHour: () => hour, centralDate: () => '2026-10-14', canAfford: () => true,
  slackPost: async (e, channel, text, blocks, opts) => { posts.push({ channel, text, blocks, opts }); return { ok: true, ts: `${posts.length}.000` }; },
  slackApi: async (e, method, body) => { if (method === 'users.lookupByEmail') return body.email === 'ahsan@go-mobius-digital.com' ? { ok: true, user: { id: 'U_AHSAN' } } : { ok: false, error: 'users_not_found' }; if (method === 'users.info') return { ok: true, user: { real_name: body.user === 'U_COLE' ? 'Cole' : 'Someone' } }; if (method === 'chat.update') { updates.push(body); return { ok: true }; } return { ok: true }; },
  isAdmin: async req => req.headers.get('authorization') === 'Bearer team', sessionEmail: async () => 'cole@go-mobius-digital.com', clientScope: req => req.headers.get('x-client') ? { ids: ['brand_alpha'] } : null,
};
const json = (b, status = 200) => new Response(JSON.stringify(b), { status, headers: { 'content-type': 'application/json' } });
const xfetch = async (url, init) => { replaced.push(JSON.parse(init.body)); return { ok: true }; };
let n = 0, bad = 0;
const check = async (name, fn) => { try { await fn(); n++; console.log('PASS ', name); } catch (e) { bad++; console.log('FAIL ', name, '\n   ', e.message); } };

let a1, a2, a3, g1;
await check('rows: add (owner by roster name, kind and source cleaned), list open first by due, edit, done and back', async () => {
  a1 = await addAction(env, { act: 'brand_alpha', text: ' Rebuild the hook  ad ', owner: 'ahsan', due: '2026-10-14', kind: 'team', source: 'meeting', source_id: 'm1', created_by: 'cole@go-mobius-digital.com' });
  assert.equal(a1.text, 'Rebuild the hook ad'); assert.equal(a1.owner, 'Ahsan'); assert.equal(a1.owner_email, 'ahsan@go-mobius-digital.com'); assert.match(a1.url, /\?open=actions&act=brand_alpha&item=ac_/);
  a2 = await addAction(env, { act: 'brand_alpha', text: 'Send the offer sheet', owner: 'Noma', due: '2026-10-12', kind: 'bogus', source: 'nope' });
  assert.equal(a2.kind, 'team'); assert.equal(a2.source, 'manual');
  a3 = await addAction(env, { act: 'brand_beta', text: 'Ask for the photos', owner: 'Ahsan', due: '2026-10-14', source: 'today', source_id: 'row-7' });
  g1 = await addAction(env, { act: '', text: 'Everyone: new naming rule', owner: 'Cole', due: '2026-10-14', source: 'monday' });
  await assert.rejects(addAction(env, { act: 'brand_alpha', text: '  ' }), /Write the item first/);
  const open = await listActions(env, { act: 'brand_alpha', status: 'open' });
  assert.deepEqual(open.map(r => r.id), [a2.id, a1.id], 'the overdue one first');
  const e = await editAction(env, a2.id, { owner: 'william', due: '2026-10-20' });
  assert.equal(e.owner, 'William'); assert.equal(e.due, '2026-10-20');
  const done = await markDone(env, a2.id, true, { by: 'cole@go-mobius-digital.com', how: 'tick' });
  assert.equal(done.status, 'done');
  assert.equal((await listActions(env, { act: 'brand_alpha', status: 'open' })).length, 1);
  assert.equal((await listActions(env, { act: 'brand_alpha', status: 'done' }))[0].id, a2.id);
  await markDone(env, a2.id, false);
  assert.equal((await listActions(env, { act: 'brand_alpha', status: 'open' })).length, 2);
  await assert.rejects(markDone(env, 'ac_nope', true), /No such item/);
});
await check('openItems: grouped per brand, agency-wide first, the shape the Monday screen reads', async () => {
  const g = await openItems(env, d);
  assert.deepEqual(g.map(x => x.name), ['Agency-wide', 'Alpha Golf', 'Beta Socks']);
  assert.equal(g[1].items.length, 2); assert.equal(g[1].items[0].name, 'Rebuild the hook ad'); assert.equal(g[1].items[0].owner, 'Ahsan');
});
await check('the reminder message: one line per item, overdue marked, a Done button per item, Open in Locus, no em dash', async () => {
  const m = reminderMessage('Alpha Golf', 'Ahsan', [{ id: 'x', act_id: 'brand_alpha', text: 'Rebuild the hook ad', due: '2026-10-14' }, { id: 'y', act_id: 'brand_alpha', text: 'Old one', due: '2026-10-10' }], '2026-10-14');
  assert.match(m.text, /^\*Ahsan\*, Alpha Golf: 1 due today, 1 overdue\. Press Done as you go\.\n• Rebuild the hook ad\n• Old one _\(was due Sat, Oct 10\)_$/);
  const btns = m.blocks[1].elements; assert.equal(btns.length, 3); assert.equal(btns[0].action_id, 'act_done_0'); assert.deepEqual(JSON.parse(btns[0].value), { id: 'x' }); assert.equal(btns[2].url, 'https://tools.go-mobius-digital.com/profit/?open=actions&act=brand_alpha');
  assert.ok(!/—/.test(JSON.stringify(m)));
});
await check('the tick: nothing before the hour; then one post per owner per brand (internal channel; agency to the Strategist channel; a DM when the brand has no channel), once a day, overdue again tomorrow', async () => {
  hour = 6; assert.deepEqual(await actionTick(env, d), { skipped: 'not the morning' });
  hour = 8; posts = [];
  let r = await actionTick(env, d);
  assert.equal(r.posted, 2, JSON.stringify(r)); assert.equal(r.skipped.length, 1, 'the agency item has no Strategist channel yet');
  const alpha = posts.find(p => p.channel === 'C_ALPHA'), beta = posts.find(p => p.channel === 'U_AHSAN');
  assert.ok(alpha && beta); assert.match(alpha.text, /\*Ahsan\*, Alpha Golf: 1 due today/); assert.match(beta.text, /Ask for the photos/);
  assert.ok(!posts.some(p => /Send the offer sheet/.test(p.text)), 'the item due Oct 20 is not reminded');
  posts = []; r = await actionTick(env, d); assert.equal(r.posted, 0, 'once a day');
  setSetting('strategistChannel', 'C_STRAT'); r = await actionTick(env, d); assert.equal(r.posted, 1); assert.equal(posts[0].channel, 'C_STRAT');
  const row = db.prepare(`SELECT reminded_on, slack_channel, slack_ts FROM p_action WHERE id = ?`).get(a1.id);
  assert.equal(row.reminded_on, '2026-10-14'); assert.equal(row.slack_channel, 'C_ALPHA'); assert.ok(row.slack_ts);
  /* tomorrow: the still-open item is overdue and gets one line again */
  posts = []; const d2 = { ...d, centralDate: () => '2026-10-15' }; r = await actionTick(env, d2); assert.equal(r.posted, 3); assert.match(posts.find(p => p.channel === 'C_ALPHA').text, /1 overdue/);
  setSetting('actionRemind', 'off'); assert.equal((await actionTick(env, d2)).skipped, 'off'); setSetting('actionRemind', 'on');
});
await check('the Done button: marks the item done by the tapper and redraws the line; the ✅ reaction marks every item behind the message done', async () => {
  const row = db.prepare(`SELECT slack_channel, slack_ts FROM p_action WHERE id = ?`).get(a1.id);
  const ctx = { waitUntil: p => (ctx.p = p) };
  const res = await handleActionButton(env, ctx, { type: 'block_actions', user: { id: 'U_COLE' }, response_url: 'https://hooks/x', container: { channel_id: row.slack_channel, message_ts: row.slack_ts }, actions: [{ action_id: 'act_done_0', value: JSON.stringify({ id: a1.id }) }] }, d, { ACK: () => new Response(''), xfetch });
  assert.equal(res.status, 200); await ctx.p;
  const r1 = db.prepare(`SELECT status, done_by, done_how FROM p_action WHERE id = ?`).get(a1.id);
  assert.deepEqual({ ...r1 }, { status: 'done', done_by: 'Cole', done_how: 'slack' });
  assert.equal(replaced.length, 1); assert.match(replaced[0].text, /~Rebuild the hook ad~ ✓ Cole/); assert.match(replaced[0].text, /All done/);
  /* the reaction on Beta's DM line */
  const b = db.prepare(`SELECT slack_channel, slack_ts FROM p_action WHERE id = ?`).get(a3.id);
  assert.deepEqual(await handleReaction(env, d, { type: 'reaction_added', reaction: 'thumbsup', user: 'U_COLE', item: { channel: b.slack_channel, ts: b.slack_ts } }), { ignored: 'thumbsup' });
  assert.deepEqual(await handleReaction(env, d, { type: 'reaction_added', reaction: 'white_check_mark', user: 'U_COLE', item: { channel: 'C_OTHER', ts: '1.1' } }), { ignored: 'not a reminder' });
  const rr = await handleReaction(env, d, { type: 'reaction_added', reaction: 'white_check_mark', user: 'U_COLE', item: { channel: b.slack_channel, ts: b.slack_ts } });
  assert.equal(rr.done, 1); assert.equal(db.prepare(`SELECT status FROM p_action WHERE id = ?`).get(a3.id).status, 'done');
  assert.equal(updates.length, 1); assert.match(updates[0].text, /All done/);
});
await check('routes: team only (401 without a session, 403 for a client scope), GET lists with brands and team, POST adds, done, edit; an unknown brand is refused', async () => {
  const call = async (method, path, body, headers = { authorization: 'Bearer team' }) => { const req = new Request('https://ah' + path, { method, headers, body: body ? JSON.stringify(body) : undefined }); const u = new URL(req.url); const r = await handleActions(req, env, u, u.pathname, json, d); return { status: r.status, body: await r.json() }; };
  assert.equal((await call('GET', '/api/actions', null, {})).status, 401);
  assert.equal((await call('GET', '/api/actions', null, { authorization: 'Bearer team', 'x-client': '1' })).status, 403);
  const list = await call('GET', '/api/actions?act=all&status=open');
  assert.equal(list.status, 200); assert.ok(list.body.items.length >= 2); assert.equal(list.body.brands.length, 2); assert.ok(list.body.team.includes('Ravo')); assert.equal(list.body.remind, true);
  const add = await call('POST', '/api/actions', { act: 'brand_alpha', text: 'New brief for the putter', owner: 'Noma', due: '2026-10-16', source: 'strategist' });
  assert.equal(add.status, 200); assert.equal(add.body.item.source, 'strategist'); assert.equal(add.body.item.created_by, 'cole@go-mobius-digital.com');
  assert.equal((await call('POST', '/api/actions', { act: 'brand_zeta', text: 'x' })).status, 400);
  const done = await call('POST', '/api/actions/done', { id: add.body.item.id, done: true }); assert.equal(done.body.item.status, 'done');
  const ed = await call('POST', '/api/actions/edit', { id: add.body.item.id, text: 'New brief for the mallet' }); assert.equal(ed.body.item.text, 'New brief for the mallet');
  assert.equal((await call('GET', '/api/actions?act=&status=open')).body.items.every(i => i.act_id === ''), true, 'act= empty = agency-wide only');
  assert.equal((await handleActions(new Request('https://ah/api/other'), env, new URL('https://ah/api/other'), '/api/other', json, d)), null);
});
await check('area: stored on add, changed on edit (a bad area = Other), carried on the open list', async () => {
  const x = await addAction(env, { act: 'brand_alpha', text: 'Area test', area: 'ads' });
  assert.equal(x.area, 'ads');
  assert.equal((await addAction(env, { act: 'brand_alpha', text: 'No area yet' })).area, null, 'unjudged = NULL');
  assert.equal((await editAction(env, x.id, { area: 'email' })).area, 'email');
  assert.equal((await editAction(env, x.id, { area: 'bogus' })).area, '');
  const it = (await openItems(env, d)).flatMap(g => g.items).find(i => i.id === x.id);
  assert.equal(it.area, '');
  await markDone(env, x.id, true);
});
const model = reply => async () => ({ ok: true, json: async () => ({ content: [{ type: 'text', text: JSON.stringify(reply) }] }) });
const envK = { ...env, ANTHROPIC_API_KEY: 'k' };
await check('quick add: no model = the raw words as the task, with the page brand; never throws', async () => {
  const f = await parseQuick(env, d, '  rebuild  the hook for alpha by wed ', { act: 'brand_alpha' });
  assert.deepEqual(f, { act: 'brand_alpha', text: 'rebuild the hook for alpha by wed', detail: '', owner: '', due: '', area: null, parsed: false });
  assert.equal((await parseQuick(envK, { ...d, xfetch: async () => ({ ok: false, status: 529, json: async () => ({}) }) }, 'x y', {})).parsed, false, 'a model error falls back');
  assert.equal((await parseQuick(envK, { ...d, xfetch: async () => ({ ok: true, json: async () => ({ content: [{ type: 'text', text: 'not json' }] }) }) }, 'x y', {})).parsed, false, 'bad JSON falls back');
  assert.equal((await parseQuick(envK, { ...d, canAfford: () => false, xfetch: model({}) }, 'x y', {})).parsed, false, 'over budget falls back');
  assert.equal((await parseQuick(env, d, '   ', {})).text, '');
});
await check('quick add: the model\'s fields are checked (roster owner, a real date, a known brand, a known area)', async () => {
  const p = await parseQuick(envK, { ...d, xfetch: model({ act: 'brand_alpha', text: 'Rebuild hook', owner: 'ahsan', due: '2026-10-16', area: 'ads' }) }, 'ahsan rebuild the alpha hook by friday', {});
  assert.deepEqual(p, { act: 'brand_alpha', text: 'Rebuild hook', detail: '', owner: 'Ahsan', due: '2026-10-16', area: 'ads', parsed: true });
  const q = await parseQuick(envK, { ...d, xfetch: model({ act: 'brand_zeta', text: '', owner: 'Bob', due: 'Friday', area: 'nope' }) }, 'raw words here', { act: 'brand_beta' });
  assert.deepEqual(q, { act: 'brand_beta', text: 'raw words here', detail: '', owner: '', due: '', area: '', parsed: true });
});
await check('quick add route: empty = 400, the fallback still files the task, a client is refused', async () => {
  const call = async (body, headers = { authorization: 'Bearer team' }) => { const req = new Request('https://ah/api/actions/quick', { method: 'POST', headers, body: JSON.stringify(body) }); const u = new URL(req.url); const r = await handleActions(req, env, u, u.pathname, json, d); return { status: r.status, body: await r.json() }; };
  const e = await call({ text: '  ' }); assert.equal(e.status, 400); assert.equal(e.body.error, 'Write the task first.');
  const r = await call({ text: 'Check the beta offer page', act: 'brand_beta' });
  assert.equal(r.status, 200); assert.equal(r.body.parsed, false); assert.equal(r.body.item.text, 'Check the beta offer page');
  assert.equal(r.body.item.act_id, 'brand_beta'); assert.equal(r.body.item.source, 'manual'); assert.equal(r.body.item.kind, 'team');
  assert.equal((await call({ text: 'x', act: 'brand_zeta' })).body.item.act_id, '', 'an unknown brand files agency-wide');
  assert.equal((await call({ text: 'x' }, { authorization: 'Bearer team', 'x-client': '1' })).status, 403);
});
await check('the area judge: every open unjudged non-brief row gets one, once; no rows = no call', async () => {
  const ids = db.prepare(`SELECT id FROM p_action WHERE status = 'open' AND area IS NULL AND kind != 'brief'`).all().map(r => r.id);
  assert.ok(ids.length > 0);
  let calls = 0;
  const dK = { ...d, xfetch: async (u, init) => { calls++; const sent = JSON.parse(init.body); assert.equal(sent.model, 'claude-haiku-5-5'); return model({ items: [...ids.map(id => ({ id, area: 'ops' })), { id: 'ac_stranger', area: 'ads' }] })(); } };
  assert.deepEqual(await judgeAreas(envK, dK), { judged: ids.length });
  assert.equal(db.prepare(`SELECT COUNT(*) AS c FROM p_action WHERE area = 'ops'`).get().c, ids.length);
  assert.deepEqual(await judgeAreas(envK, dK), { judged: 0 }); assert.equal(calls, 1);
});
console.log(`\n${n} passed, ${bad} failed`);
process.exit(bad ? 1 : 0);

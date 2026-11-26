/* Offline checks for the Locus homes (2026-11-26): the posts that had no Locus line get one, so each Slack post can be
 * switched off after Dec 2. Nothing here posts, sends or reads the network: in-memory SQLite for D1, Slack mocked.
 *   a45  trybe.js askRow / readAsks / GET /api/trybe/asks, and the strategist's My day lines (movelines.js creators)
 *   a10  checkin.js plansView / planFromLocus, and GET /api/mywork/plans + POST /api/mywork/plan (mywork.js)
 *   a34  meetings.js pullSuggestions / pullTasks / keepTasks and the two routes
 *   a54  the weekPlan agency switch (jobflags.js), the My day line behind it, GET /api/mywork/weekplan
 *   node test-locus-homes.mjs      (from account-health/worker)
 */
import { DatabaseSync } from 'node:sqlite';
import assert from 'node:assert/strict';
import { askRow, readAsks, ASKS_KEY, handleTrybe, STALE_DAYS } from './src/trybe.js';
import { lineItems } from './src/movelines.js';
import { plansView, planFromLocus, DAY_TYPES } from './src/checkin.js';
import { _test as mw, weekPlanMissing } from './src/mywork.js';
import { pullSuggestions, pullTasks, keepTasks, handleMeetings, confirm, PULL_MAX } from './src/meetings.js';
import { featureOn, cleanFeatures, FEATURES, _resetFlags } from './src/jobflags.js';

const { isPerson, handleMyWork } = mw;
let db;
const bindSql = sql => sql.replace(/\?(\d+)/g, (_, n) => ':p' + n);
const vals = (sql, a) => { const o = {}; for (const m of sql.matchAll(/\?(\d+)/g)) { const v = a[+m[1] - 1]; o['p' + m[1]] = v === undefined ? null : typeof v === 'boolean' ? +v : v; } return o; };
const prep = sql => {
  let args = [];
  const st = () => db.prepare(bindSql(sql));
  const o = { bind(...a) { args = a; return o; }, async first() { return st().get(vals(sql, args)) || null; }, async all() { return { results: st().all(vals(sql, args)) }; },
    async run() { if (!/\?\d/.test(sql)) { db.exec(sql); return { meta: {} }; } st().run(vals(sql, args)); return { meta: {} }; } };
  return o;
};
const env = { DB: { prepare: prep, batch: async l => Promise.all(l.map(s => s.run())) }, OWNER_EMAIL: 'owner@agency.example' };
function fresh() {
  db = new DatabaseSync(':memory:'); _resetFlags();
  db.exec(`CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT)`);
}
const setS = (k, v) => db.prepare(`INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`).run(k, typeof v === 'string' ? v : JSON.stringify(v));
const getS = k => { const r = db.prepare(`SELECT value FROM settings WHERE key = ?`).get(k); return r ? r.value : null; };
const getSetting = async (e, k) => getS(k);
const putSetting = async (e, k, v) => setS(k, String(v));
const json = (o, s = 200) => ({ o, s });
const no = x => !/[—–]/.test(JSON.stringify(x));
let n = 0;
const ok = (name, fn) => Promise.resolve().then(fn).then(() => { n++; }, e => { console.error('FAILED: ' + name + '\n', e); process.exitCode = 1; });

const TODAY = '2026-11-30';   // a Monday
const SAM = { name: 'Sam', email: 'sam@agency.example', slack: 'U0SAMPLE01' };
const KAI = { name: 'Kai', email: 'kai@agency.example', slack: 'U0SAMPLE02' };
const opts = { isPerson, strat: { brand_northlake_golf: 'Sam' }, ownerEmail: 'owner@agency.example' };

/* ---------------- a45: the creator post's other asks ---------------- */
await ok('askRow: reviews 2+ days old, Discord count, Monday rebook list (only on a Monday)', () => {
  const v = { queue: [{ state: 'not_launched', days: STALE_DAYS }, { state: 'not_launched', days: 1 }, { state: 'no_spend', days: 9 }],
    creators: [{ name: 'Bo Lane', rebook: true, quiet_days: 20, cpa: 14.6 }, { name: 'Ann Fox', rebook: false }] };
  const r = askRow({ act_id: 'brand_northlake_golf', name: 'Northlake Golf' }, v, 2, 3, true);
  assert.deepEqual(r, { act: 'brand_northlake_golf', name: 'Northlake Golf', stale: 1, old_review: 2, discord: 3, rebook: [{ name: 'Bo Lane', quiet_days: 20, cpa: 15 }] });
  assert.deepEqual(askRow({ act_id: 'b', name: 'B' }, v, 0, null, false).rebook, [], 'not Monday: no rebook list');
  assert.equal(askRow({ act_id: 'b', name: 'B' }, v, 0, null, false).discord, null, 'Discord not read stays null, never 0');
});

await ok('readAsks: today only; another day reads as not counted yet; brand scope kept', async () => {
  fresh();
  assert.deepEqual((await readAsks(env, TODAY)).brands, []);
  assert.equal((await readAsks(env, TODAY)).fresh, false);
  setS(ASKS_KEY, { date: TODAY, monday: true, brands: [{ act: 'brand_northlake_golf', old_review: 1 }, { act: 'brand_pine_ridge', discord: 2 }] });
  const r = await readAsks(env, TODAY, new Set(['brand_pine_ridge']));
  assert.equal(r.fresh, true); assert.deepEqual(r.brands.map(b => b.act), ['brand_pine_ridge']);
  assert.equal((await readAsks(env, '2026-12-01')).fresh, false, 'yesterday\'s snapshot never shows');
});

await ok('readAsks: brands the run did not reach come back as missing, scoped to the caller', async () => {
  fresh();
  setS(ASKS_KEY, { date: TODAY, monday: true, brands: [{ act: 'brand_northlake_golf', old_review: 1 }], missing: [{ act: 'brand_pine_ridge', name: 'Pine Ridge' }, { act: 'brand_harbor', name: 'Harbor' }] });
  const all = await readAsks(env, TODAY);
  assert.equal(all.fresh, true); assert.deepEqual(all.missing.map(b => b.act), ['brand_pine_ridge', 'brand_harbor']);
  assert.deepEqual((await readAsks(env, TODAY, new Set(['brand_harbor']))).missing.map(b => b.act), ['brand_harbor']);
  setS(ASKS_KEY, { date: TODAY, monday: true, brands: [] });
  assert.deepEqual((await readAsks(env, TODAY)).missing, [], 'an older snapshot without the field reads as none missing');
});

await ok('GET /api/trybe/asks: team only, a client is refused', async () => {
  fresh();
  setS(ASKS_KEY, { date: TODAY, monday: true, brands: [{ act: 'brand_northlake_golf', name: 'Northlake Golf', old_review: 2, discord: 1, rebook: [] }] });
  const d = { centralDate: () => TODAY, listBrands: async () => [] };
  const H = c => ({ isAdmin: async () => true, sessionEmail: async () => 'x@agency.example', brandsFor: async () => null, resolveBrandId: async (e, id) => id, isClient: () => c, deps: d });
  const R = c => handleTrybe(new Request('https://x/api/trybe/asks'), env, new URL('https://x/api/trybe/asks'), '/api/trybe/asks', json, H(c));
  const t = await R(false);
  assert.equal(t.s, 200); assert.equal(t.o.brands[0].old_review, 2); assert.equal(t.o.fresh, true);
  assert.equal((await R(true)).s, 403);
});

await ok('My day: the reviewer (strategist) gets the Discord and rebook lines and the 2+ days count; the buyer does not', () => {
  const cr = { brands: [{ act: 'brand_northlake_golf', name: 'Northlake Golf', review: 4, queue: 3 }], team: { brand_northlake_golf: { strat: 'Sam', buyer: 'Kai' } },
    asks: [{ act: 'brand_northlake_golf', name: 'Northlake Golf', old_review: 2, discord: 3, rebook: ['Bo Lane', 'Cy Reed'] }] };
  const s = lineItems({ today: TODAY, creators: cr }, SAM, opts);
  assert.deepEqual(s.map(i => i.id.split(':').slice(0, 2).join(':')), ['creators:review', 'creators:discord', 'creators:rebook']);
  assert.match(s[0].detail, /2 videos waiting 2 days or more/);
  assert.equal(s[1].text, 'Answer 3 creators waiting in Discord');
  assert.equal(s[2].text, 'Rebook 2 creators this week'); assert.match(s[2].detail, /Bo Lane, Cy Reed/);
  assert.ok(s.every(i => i.v5 === '#/agency/all/a-creators/to-review'));
  assert.deepEqual(lineItems({ today: TODAY, creators: cr }, KAI, opts).map(i => i.text), ['3 approved creator videos to load'], 'the buyer only loads');
  /* the asks alone (nothing waiting for review or load) still reach the strategist */
  const only = lineItems({ today: TODAY, creators: { brands: [], team: cr.team, asks: [{ ...cr.asks[0], old_review: 0, rebook: [] }] } }, SAM, opts);
  assert.deepEqual(only.map(i => i.text), ['Answer 3 creators waiting in Discord']);
  assert.ok(no(s));
});

/* ---------------- a10: the check-in plan in Locus ---------------- */
const PEOPLE = { U0SAMPLE01: { name: 'Sam', roles: ['strategist'] }, U0SAMPLE03: { name: 'Riley', roles: ['designer'] }, U0GUEST001: { name: 'Guest', roles: ['google'], weekOnly: true } };

await ok('plansView: one row per person, states, counts; week only people only on Mondays', () => {
  const day = { ts: '1.1', channel: 'C0SAMPLE', people: { U0SAMPLE01: { plan: { at: '2026-12-01T14:05:00Z', types: ['Briefs'] }, items: ['Northlake Golf: brief 16'] }, U0SAMPLE03: { out: true } } };
  const v = plansView('2026-12-01', day, PEOPLE);   // a Tuesday
  assert.deepEqual(v.people.map(p => [p.name, p.state]), [['Sam', 'plan'], ['Riley', 'out']]);
  assert.deepEqual(v.counts, { plan: 1, out: 1, none: 0 });
  assert.equal(v.posted, true); assert.equal(v.people[0].plan.via, 'slack');
  assert.equal(plansView(TODAY, null, PEOPLE).people.length, 3, 'Monday shows the week only person too');
  assert.equal(plansView('2026-12-05', null, PEOPLE).weekend, true);
});

await ok('planFromLocus: the same record the Slack form writes; posts in the thread and redraws only when the day post is up', async () => {
  fresh();
  setS('checkinPeople', PEOPLE);
  const calls = [];
  const d = { getSetting, putSetting, centralDate: () => '2026-12-01', slackApi: async (e, m, b) => { calls.push([m, b]); return { ok: true, ts: '2.2' }; } };
  /* before the day post: stored only, nothing sent */
  const r = await planFromLocus(env, d, { uid: 'U0SAMPLE01', text: '- Northlake Golf: brief 16\n\n* Harbor & Pine: recut', types: ['Briefs', 'Nope'], date: '2026-12-01' });
  assert.equal(r.state, 'plan'); assert.deepEqual(r.items, ['Northlake Golf: brief 16', 'Harbor & Pine: recut']);
  assert.equal(calls.length, 0, 'no day post yet: no Slack call');
  const stored = JSON.parse(getS('checkin:2026-12-01'));
  assert.deepEqual(stored.people.U0SAMPLE01.plan.types, ['Briefs']); assert.equal(stored.people.U0SAMPLE01.plan.via, 'locus');
  /* with the day post up: the plan goes in its thread and the board is redrawn */
  setS('checkin:2026-12-02', { ts: '1.1', channel: 'C0SAMPLE', people: {}, sent: [] });
  await planFromLocus(env, { ...d, centralDate: () => '2026-12-02' }, { uid: 'U0SAMPLE01', text: 'One thing', date: '2026-12-02' });
  assert.deepEqual(calls.map(c => c[0]), ['chat.postMessage', 'chat.update']);
  assert.equal(calls[0][1].thread_ts, '1.1');
  /* out today */
  calls.length = 0;
  const o = await planFromLocus(env, { ...d, centralDate: () => '2026-12-02' }, { uid: 'U0SAMPLE03', out: true, date: '2026-12-02' });
  assert.equal(o.state, 'out'); assert.equal(calls.length, 2);
  /* refused: not on the list, week only, empty */
  await assert.rejects(planFromLocus(env, d, { uid: 'U0NOBODY01', text: 'x' }), /not on the daily check-in list/);
  await assert.rejects(planFromLocus(env, d, { uid: 'U0GUEST001', text: 'x' }), /week, not a daily plan/);
  await assert.rejects(planFromLocus(env, d, { uid: 'U0SAMPLE01', text: '  \n ' }), /at least one thing/);
  assert.ok(DAY_TYPES.includes('Briefs'));
});

await ok('GET /api/mywork/plans and POST /api/mywork/plan: the person posts their own plan', async () => {
  fresh();
  setS('checkinPeople', PEOPLE);
  const d = { isAdmin: async () => true, clientScope: () => null, sessionEmail: async () => null, getSetting, putSetting, centralDate: () => '2026-12-01',
    slackApi: async () => ({ ok: true }), listBrands: async () => [] };
  const call = (path, method, body, q = '?who=Sam') => handleMyWork(new Request('https://x.test' + path + q, { method, ...(body ? { body: JSON.stringify(body) } : {}) }), env, new URL('https://x.test' + path + q), path, json, d);
  const p = await call('/api/mywork/plan', 'POST', { text: 'Brief 16', who: 'Sam' });
  assert.equal(p.s, 200); assert.equal(p.o.row.state, 'plan');
  const g = await call('/api/mywork/plans', 'GET');
  assert.equal(g.o.me, 'U0SAMPLE01'); assert.equal(g.o.on_list, true); assert.equal(g.o.counts.plan, 1);
  assert.equal((await handleMyWork(new Request('https://x.test/api/mywork/plans'), env, new URL('https://x.test/api/mywork/plans'), '/api/mywork/plans', json, { ...d, clientScope: () => ({ email: 'c@brand.example' }) })).s, 403, 'a client is refused');
});

/* ---------------- a34: Pull tasks ---------------- */
await ok('pullSuggestions: team items only, at most 5, sure and owned first, kept ones left out', () => {
  const items = Array.from({ length: 7 }, (_, i) => ({ kind: 'team', text: `Task ${i}`, owner: i % 2 ? 'Sam' : '', due: i === 6 ? '2026-12-03' : '', sure: i !== 1 }));
  const notes = { brands: [{ brand_id: 'brand_northlake_golf', items: [...items, { kind: 'brief', text: 'A brief' }, { kind: 'client', text: 'Client hears' }] }] };
  const s = pullSuggestions(notes);
  assert.equal(s.length, PULL_MAX);
  assert.deepEqual(s.map(x => x.text), ['Task 3', 'Task 5', 'Task 6', 'Task 0', 'Task 2']);
  assert.ok(s.every(x => x.act === 'brand_northlake_golf'));
  assert.ok(!pullSuggestions(notes, [{ text: 'task 3' }]).some(x => x.text === 'Task 3'), 'a kept task is never suggested again');
  assert.deepEqual(pullSuggestions(null), []);
});

await ok('pull and keep: only the ticked tasks are made, remembered, never twice; the meeting is not confirmed', async () => {
  fresh();
  const notes = { kind: 'client_call', summary: 'x', brands: [{ brand_id: 'brand_northlake_golf', decisions: [], items: [{ kind: 'team', text: 'Send the recut brief', owner: 'Sam', sure: true }, { kind: 'team', text: 'Raise budget to 400', sure: false }], this_week: [], need_from_client: [] }] };
  const d = { isAdmin: async () => true, clientScope: () => null, sessionEmail: async () => 'sam@agency.example', listBrands: async () => [{ act_id: 'brand_northlake_golf', name: 'Northlake Golf' }] };
  const R = (path, body) => handleMeetings(new Request('https://x' + path, { method: 'POST', body: JSON.stringify(body) }), env, new URL('https://x' + path), path, json, d);
  /* the table exists after the first call */
  assert.equal((await R('/api/meetings/pull', { id: 'nope' })).s, 404);
  db.prepare(`INSERT INTO p_meeting (id, title, date, at, status, notes_json, created_at, updated_at) VALUES ('m1', 'Call', '2026-11-30', '2026-11-30T15:00:00Z', 'extracted', ?, 'x', 'x')`).run(JSON.stringify(notes));
  const p = await R('/api/meetings/pull', { id: 'm1' });
  assert.equal(p.s, 200); assert.equal(p.o.items.length, 2); assert.equal(p.o.items[0].text, 'Send the recut brief');
  const k = await R('/api/meetings/keep', { id: 'm1', items: [p.o.items[0]] });
  assert.equal(k.o.made.length, 1);
  assert.equal(db.prepare(`SELECT COUNT(*) AS n FROM p_action WHERE source = 'meeting' AND source_id = 'm1'`).get().n, 1);
  assert.equal(db.prepare(`SELECT status FROM p_meeting WHERE id = 'm1'`).get().status, 'extracted', 'the meeting itself is left as it was');
  const again = await pullTasks(env, 'm1');
  assert.deepEqual(again.items.map(x => x.text), ['Raise budget to 400']); assert.equal(again.kept, 1);
  assert.equal((await keepTasks(env, d, { id: 'm1', items: [p.o.items[0]] }, 'x')).made.length, 0, 'the same task is never made twice');
  assert.equal((await R('/api/meetings/keep', { id: 'm1', items: [] })).s, 400);
  assert.equal((await handleMeetings(new Request('https://x/api/meetings/pull', { method: 'POST', body: '{}' }), env, new URL('https://x/api/meetings/pull'), '/api/meetings/pull', json, { ...d, clientScope: () => ({}) })).s, 403);
});

await ok('a filed call: Pull tasks suggests nothing and Keep makes nothing a second time (tasks Confirm made count)', async () => {
  /* same db as the test above: the meeting tables are made once per module (ensure) */
  const notes = { kind: 'client_call', summary: 'x', brands: [{ brand_id: 'brand_northlake_golf', decisions: [], items: [{ kind: 'team', text: 'Send the recut brief', owner: 'Sam' }, { kind: 'team', text: 'Raise budget to 400' }], this_week: [], need_from_client: [] }] };
  const d = { listBrands: async () => [{ act_id: 'brand_northlake_golf', name: 'Northlake Golf' }] };
  db.prepare(`INSERT INTO p_meeting (id, title, date, at, status, notes_json, created_at, updated_at) VALUES ('m2', 'Call', '2026-11-30', '2026-11-30T15:00:00Z', 'extracted', ?, 'x', 'x')`).run(JSON.stringify(notes));
  const res = await confirm(env, d, { id: 'm2', summary: 'x', brands: notes.brands }, 'sam@agency.example');
  assert.equal(res.brands[0].tasks.filter(t => !t.error).length, 2);
  const count = () => db.prepare(`SELECT COUNT(*) AS n FROM p_action WHERE source = 'meeting' AND source_id = 'm2'`).get().n;
  assert.equal(count(), 2);
  /* confirmed notes carry no "sure" field: the old pull offered both again, pre-ticked */
  const p = await pullTasks(env, 'm2');
  assert.deepEqual(p.items, []); assert.equal(p.kept, 2); assert.match(p.why, /already kept/);
  const k = await keepTasks(env, d, { id: 'm2', items: [{ act: 'brand_northlake_golf', text: 'Send the recut brief' }, { act: 'brand_northlake_golf', text: 'raise budget to 400' }] }, 'x');
  assert.equal(k.made.length, 0); assert.equal(count(), 2, 'no second task on any My day');
});

await ok('pull and keep, then Confirm: the kept task is not made again, the rest are', async () => {
  /* same db as the test above: the meeting tables are made once per module (ensure) */
  const notes = { kind: 'client_call', summary: 'x', brands: [{ brand_id: 'brand_northlake_golf', decisions: [], items: [{ kind: 'team', text: 'Send the recut brief', owner: 'Sam', sure: true }, { kind: 'team', text: 'Raise budget to 400', sure: true }], this_week: [], need_from_client: [] }] };
  const d = { listBrands: async () => [{ act_id: 'brand_northlake_golf', name: 'Northlake Golf' }] };
  db.prepare(`INSERT INTO p_meeting (id, title, date, at, status, notes_json, created_at, updated_at) VALUES ('m3', 'Call', '2026-11-30', '2026-11-30T15:00:00Z', 'extracted', ?, 'x', 'x')`).run(JSON.stringify(notes));
  const p = await pullTasks(env, 'm3');
  assert.equal((await keepTasks(env, d, { id: 'm3', items: [p.items[0]] }, 'x')).made.length, 1);
  const res = await confirm(env, d, { id: 'm3', summary: 'x', brands: notes.brands }, 'sam@agency.example');
  const t = res.brands[0].tasks;
  assert.equal(t.length, 2); assert.equal(t.find(x => x.text === 'Send the recut brief').already, true);
  assert.equal(db.prepare(`SELECT COUNT(*) AS n FROM p_action WHERE source = 'meeting' AND source_id = 'm3'`).get().n, 2, 'one row per task, never two');
});

/* ---------------- a54: the weekPlan agency switch ---------------- */
await ok('weekPlan: on when unset, the owner can turn it off; it hides the Monday My day line', async () => {
  fresh();
  assert.ok(FEATURES.includes('weekPlan'));
  assert.equal(await featureOn(env, 'weekPlan'), true, 'Mobius runs it today');
  setS('feature:weekPlan', 'off');
  assert.equal(await featureOn(env, 'weekPlan'), false);
  assert.deepEqual(cleanFeatures({ weekPlan: false }), { weekPlan: false });
  const L = { today: TODAY, mondayPlans: { date: TODAY, brands: [{ act: 'brand_northlake_golf', name: 'Northlake Golf' }] }, weekplan: {} };
  assert.equal(lineItems(L, SAM, opts).filter(i => i.source === 'weekplan').length, 1);
  assert.equal(lineItems({ ...L, weekPlanOn: false }, SAM, opts).filter(i => i.source === 'weekplan').length, 0);
});

await ok('weekPlanMissing and GET /api/mywork/weekplan: brands still to write, with their strategist; off = none', async () => {
  const mp = { date: TODAY, brands: [{ act: 'brand_northlake_golf', name: 'Northlake Golf' }, { act: 'brand_pine_ridge', name: 'Pine Ridge' }] };
  const wp = { U0SAMPLE01: { brands: [{ a: 'brand_pine_ridge' }] } };
  assert.deepEqual(weekPlanMissing(mp, wp, TODAY, { brand_northlake_golf: 'Sam' }), [{ act: 'brand_northlake_golf', name: 'Northlake Golf', strategist: 'Sam' }]);
  assert.deepEqual(weekPlanMissing(mp, wp, '2026-12-07'), [], 'last week\'s list never shows');
  fresh();
  setS(`mondayPlans:${TODAY}`, mp);
  const d = { isAdmin: async () => true, clientScope: () => null, sessionEmail: async () => null, getSetting, putSetting, centralDate: () => TODAY };
  const R = () => handleMyWork(new Request('https://x.test/api/mywork/weekplan'), env, new URL('https://x.test/api/mywork/weekplan'), '/api/mywork/weekplan', json, d);
  const r = await R();
  assert.equal(r.o.on, true); assert.equal(r.o.monday, true); assert.equal(r.o.brands.length, 2);
  setS('feature:weekPlan', 'off'); _resetFlags();
  const off = await R();
  assert.equal(off.o.on, false); assert.deepEqual(off.o.brands, []);
});

console.log(process.exitCode ? 'test-locus-homes: FAILED' : `test-locus-homes: ${n} checks passed`);

/* Offline checks for the morning line (morning.js) and per-person preferences (prefs.js), 2026-10-11.
 * The settings table is an in-memory map; the PROFIT binding and Slack are mocked.
 *   node test-morning.mjs      (from account-health/worker) */
import assert from 'node:assert/strict';
import { prefsFor, updatePrefs, morningPeople, handlePrefs, _test as prefsTest } from './src/prefs.js';
import { morningTick, linesFor, messageFor, morningFor, handleMorning } from './src/morning.js';

/* ---- a settings table that understands the three statements prefs.js and the tick use ---- */
const settings = new Map();
const DB = { prepare: sql => { let args = []; return { bind(...a) { args = a; return this; },
  async first() { if (/^SELECT value FROM settings WHERE key = \?1/.test(sql)) { const v = settings.get(args[0]); return v == null ? null : { value: v }; } throw new Error('first: ' + sql); },
  async all() { if (/LIKE 'userPrefs:%'/.test(sql)) return { results: [...settings].filter(([k]) => k.startsWith('userPrefs:')).map(([key, value]) => ({ key, value })) }; throw new Error('all: ' + sql); },
  async run() { if (/^INSERT INTO settings/.test(sql)) { settings.set(args[0], args[1]); return { meta: { changes: 1 } }; } throw new Error('run: ' + sql); } }; } };
const env = { DB, OWNER_EMAIL: 'cole@go-mobius-digital.com' };
const json = (b, status = 200) => ({ status, body: b });
let hour = 8, slackCalls = [], profitCalls = 0, lookups = { 'cole@go-mobius-digital.com': 'U1', 'ahsan@go-mobius-digital.com': 'U2', 'nick@alpha.com': 'U3' };
const KEPT = { as_of: 'x', date: '2026-10-10', brands: [
  { act_id: 'brand_alpha', name: 'Alpha Golf', has: true, line: 'Alpha Golf kept $1,240 yesterday on $4,100 of sales; ads at 31%. Nothing to change.' },
  { act_id: 'brand_beta', name: 'Beta Socks', has: true, line: 'Beta Socks kept $24 yesterday on $2,200 of sales; ads at 41%. 3 things to change.' },
  { act_id: 'brand_gamma', name: 'Gamma Patch', has: false, line: 'Gamma Patch: no numbers for yesterday yet.' } ] };
const deps = {
  getSetting: async (e, k) => settings.get(k) ?? null, putSetting: async (e, k, v) => { settings.set(k, v); },
  centralHour: () => hour, centralDate: () => '2026-10-11', subCanAfford: () => true, morningPeople,
  mintSession: async (e, email) => ({ token: 'tok-' + email, email }),
  brandsFor: async (e, email) => email === 'nick@alpha.com' ? new Set(['brand_alpha', 'act_111']) : email === 'ahsan@go-mobius-digital.com' ? new Set(['brand_beta']) : null,
  profit: async (path, tok) => { profitCalls++; assert.equal(path, '/api/hub/kept?act=all'); assert.equal(tok, 'tok-cole@go-mobius-digital.com'); return KEPT; },
  slackApi: async (e, method, body) => { slackCalls.push({ method, body }); if (method === 'users.lookupByEmail') return lookups[body.email] ? { ok: true, user: { id: lookups[body.email] } } : { ok: false, error: 'users_not_found' }; if (method === 'chat.postMessage') return { ok: true, ts: '1.2' }; return { ok: false, error: 'unknown' }; },
};
let n = 0, bad = 0;
const check = async (name, fn) => { try { await fn(); n++; console.log('PASS ', name); } catch (e) { bad++; console.log('FAIL ', name, '\n   ', e.message); } };

await check('prefs: empty by default, the switch and a snooze round-trip, a done key, a removed key', async () => {
  assert.deepEqual(await prefsFor(env, 'Cole@Go-Mobius-Digital.com'), { morning_dm: false, nudge: {} });
  const now = Date.parse('2026-10-11T13:00:00Z');
  const p = await updatePrefs(env, 'cole@go-mobius-digital.com', { morning_dm: true, nudge: { 'cut|b|1|': { state: 'snoozed', until: now + 86400e3 }, 'x': { state: 'bogus' } } }, now);
  assert.equal(p.morning_dm, true); assert.deepEqual(Object.keys(p.nudge), ['cut|b|1|']);
  const p2 = await updatePrefs(env, 'cole@go-mobius-digital.com', { nudge: { 'done|k': { state: 'done' }, 'cut|b|1|': { state: null } } }, now);
  assert.equal(p2.morning_dm, true, 'the switch survives a nudge-only write'); assert.deepEqual(Object.keys(p2.nudge), ['done|k']); assert.ok(p2.nudge['done|k'].until > now);
  assert.equal(prefsTest.keyOf(' Nick@Alpha.com '), 'userPrefs:nick@alpha.com');
});
await check('prefs: an entry a week past its time is dropped on read', async () => {
  const now = Date.parse('2026-10-11T13:00:00Z');
  settings.set('userPrefs:old@x.com', JSON.stringify({ morning_dm: false, nudge: { a: { state: 'done', until: now - 8 * 86400e3 }, b: { state: 'snoozed', until: now - 3600e3 } } }));
  const p = await prefsFor(env, 'old@x.com'); assert.deepEqual(Object.keys(p.nudge), ['b']);
});
await check('prefs routes: no sign-in is 401, GET and PUT answer the person, the body never names the person', async () => {
  const req = (method, body) => ({ method, json: async () => body });
  assert.equal((await handlePrefs(req('GET'), env, '/api/me/prefs', null, json)).status, 401);
  const g = await handlePrefs(req('GET'), env, '/api/me/prefs', 'nick@alpha.com', json); assert.equal(g.body.email, 'nick@alpha.com'); assert.equal(g.body.prefs.morning_dm, false);
  const w = await handlePrefs(req('PUT', { morning_dm: true, email: 'cole@go-mobius-digital.com' }), env, '/api/me/prefs', 'nick@alpha.com', json);
  assert.equal(w.body.prefs.morning_dm, true); assert.equal((await prefsFor(env, 'nick@alpha.com')).morning_dm, true);
  assert.equal((await prefsFor(env, 'cole@go-mobius-digital.com')).morning_dm, true, 'untouched');
});
await check('lines: a person gets only their brands, sorted by name; no numbers = no line', async () => {
  assert.deepEqual(linesFor(KEPT, null).length, 2);
  assert.deepEqual(linesFor(KEPT, new Set(['brand_alpha'])), [KEPT.brands[0].line]);
  assert.equal(messageFor(KEPT, []), null);
  const m = messageFor(KEPT, linesFor(KEPT, null)); assert.match(m.text, /Good morning\. Yesterday, Saturday, October 10:/); assert.match(m.text, /Alpha Golf kept/); assert.ok(!/\u2014/.test(m.text), "no em dash");
});
await check('the tick: before the hour nothing; at the hour each opted-in person gets one DM with their lines, once a day; a client only its brand', async () => {
  await updatePrefs(env, 'ahsan@go-mobius-digital.com', { morning_dm: true });
  settings.delete('userPrefs:old@x.com');
  hour = 6; assert.deepEqual(await morningTick(env, deps), { skipped: 'before 7am Central' });
  hour = 8; slackCalls = []; profitCalls = 0;
  const r = await morningTick(env, deps);
  assert.deepEqual(r.sent.sort(), ['ahsan@go-mobius-digital.com', 'cole@go-mobius-digital.com', 'nick@alpha.com']);
  assert.equal(profitCalls, 1, 'the numbers are read once');
  const posts = slackCalls.filter(c => c.method === 'chat.postMessage');
  assert.equal(posts.length, 3);
  const to = id => posts.find(p => p.body.channel === id).body.text;
  assert.match(to('U1'), /Alpha Golf kept[\s\S]*Beta Socks kept/); assert.ok(!/Gamma/.test(to('U1')));
  assert.ok(/Alpha Golf/.test(to('U3')) && !/Beta Socks/.test(to('U3')), 'the client gets only its brand');
  assert.ok(/Beta Socks/.test(to('U2')) && !/Alpha Golf/.test(to('U2')), 'a limited teammate gets only their brand');
  slackCalls = []; const r2 = await morningTick(env, deps); assert.equal(r2.skipped, 'all sent today'); assert.equal(slackCalls.length, 0);
  hour = 12; assert.equal((await morningTick(env, deps)).skipped, 'after noon');
});
await check('the tick: a person Slack cannot find is recorded for the day, not retried every hour; the switch stops everything', async () => {
  settings.set('morningDone', JSON.stringify({ date: '2026-10-10', emails: {} }));
  await updatePrefs(env, 'ghost@go-mobius-digital.com', { morning_dm: true });
  hour = 9; slackCalls = [];
  const r = await morningTick(env, deps);
  assert.ok(r.failed.some(x => /ghost@/.test(x) && /users_not_found/.test(x)));
  const done = JSON.parse(settings.get('morningDone')); assert.match(done.emails['ghost@go-mobius-digital.com'].status, /^failed/);
  slackCalls = []; await morningTick(env, deps); assert.equal(slackCalls.filter(c => c.body && c.body.email === 'ghost@go-mobius-digital.com').length, 0);
  settings.set('morningDm', 'off'); assert.deepEqual(await morningTick(env, deps), { skipped: 'off' }); settings.delete('morningDm');
});
await check('the routes: GET is the person\'s lines, POST sends them now; nobody signed in is 401', async () => {
  const req = m => ({ method: m });
  assert.equal((await handleMorning(req('GET'), env, '/api/me/morning', null, null, deps, json)).status, 401);
  const g = await handleMorning(req('GET'), env, '/api/me/morning', null, 'nick@alpha.com', deps, json); assert.deepEqual(g.body.lines, [KEPT.brands[0].line]);
  slackCalls = []; const p = await handleMorning(req('POST'), env, '/api/me/morning', null, 'nick@alpha.com', deps, json);
  assert.equal(p.body.ok, true); assert.equal(slackCalls.filter(c => c.method === 'chat.postMessage')[0].body.channel, 'U3');
  const f = await handleMorning(req('POST'), env, '/api/me/morning', null, 'nobody@alpha.com', deps, json); assert.equal(f.status, 502); assert.match(f.body.error, /no member with the email/);
});
console.log(`\n${n}/${n + bad} passed`);
if (bad) process.exit(1);

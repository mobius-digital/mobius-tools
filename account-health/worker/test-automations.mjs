/* Offline checks for Automations version one (automations.js): the sentence model, the template gallery, the runner,
 * the dry run, each person's delivery choice ("only if missing"), the client guard, and "nothing saved = no work".
 * In-memory SQLite for D1. Brands and people are made up. Slack and the AI are mocked.
 *   node test-automations.mjs      (from account-health/worker)
 */
import { DatabaseSync } from 'node:sqlite';
import assert from 'node:assert/strict';
import { cleanAutomation, sentence, gallery, TEMPLATES, planDelivery, automationTick, handleAutomations, onCount, clockIn, metricValue, _reset, _test } from './src/automations.js';

let db, reads;
const bindSql = sql => sql.replace(/\?(\d+)/g, (_, n) => ':p' + n);
const vals = (sql, a) => { const o = {}; for (const m of sql.matchAll(/\?(\d+)/g)) { const v = a[+m[1] - 1]; o['p' + m[1]] = v === undefined ? null : typeof v === 'boolean' ? +v : v; } return o; };
const prep = sql => {
  reads.push(sql);
  let args = [];
  const st = () => db.prepare(bindSql(sql));
  const o = { bind(...a) { args = a; return o; }, async first() { return st().get(vals(sql, args)) || null; }, async all() { return { results: st().all(vals(sql, args)) }; },
    async run() { if (!/\?\d/.test(sql)) { db.exec(sql); return { meta: {} }; } st().run(vals(sql, args)); return { meta: {} }; } };
  return o;
};
const env = { DB: { prepare: prep }, ANTHROPIC_API_KEY: 'test-key' };
function fresh() {
  db = new DatabaseSync(':memory:'); reads = []; _reset();
  db.exec(`CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT)`);
  db.exec(`CREATE TABLE p_br_batch (id TEXT PRIMARY KEY, act_id TEXT, num INTEGER, title TEXT, brief_text TEXT, board_stage TEXT, board_at TEXT)`);
  db.exec(`CREATE TABLE reports (act_id TEXT, period TEXT, period_start TEXT, period_end TEXT, status TEXT, generated_at TEXT)`);
  db.exec(`CREATE TABLE tw_daily (act_id TEXT, date TEXT, metric TEXT, value REAL, synced_at TEXT, PRIMARY KEY (act_id, date, metric))`);
  db.exec(`CREATE TABLE daily_insights (act_id TEXT, date TEXT, spend REAL)`);
  db.exec(`CREATE TABLE connections (brand_id TEXT, kind TEXT, external_id TEXT)`);
}
const setS = (k, v) => db.prepare(`INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`).run(k, typeof v === 'string' ? v : JSON.stringify(v));
const rows = sql => db.prepare(sql).all();

/* Wednesday 2026-03-11, 16:00 UTC = 11am in Chicago. */
let NOW = new Date('2026-03-11T16:00:00Z');
const BRANDS = [
  { act_id: 'brand_northlake', name: 'Northlake Golf', tz: 'America/Chicago', active: 1, target_roas: 2.5, tw_shop: 'northlake.example' },
  { act_id: 'brand_pinecrest', name: 'Pinecrest Candle', tz: 'America/New_York', active: 1, target_roas: 3, tw_shop: 'pinecrest.example' },
];
const slack = [];
let session = null, client = null, aiCalls = 0, reportsMade = [];
const d = {
  now: () => NOW,
  getSetting: async (e, k) => db.prepare(`SELECT value FROM settings WHERE key = ?`).get(k)?.value ?? null,
  putSetting: async (e, k, v) => { setS(k, String(v)); },
  listAccounts: async () => BRANDS,
  subCanAfford: () => true,
  slackApi: async (e, method, args) => { slack.push([method, args]); return method === 'users.lookupByEmail' ? { ok: true, user: { id: 'U' + args.email.slice(0, 4).toUpperCase() } } : { ok: true }; },
  isAdmin: async () => !!session,
  sessionEmail: async () => session,
  clientScope: () => client,
  brandsFor: async () => null,
  resolveBrandId: async (e, id) => id,
  goalsFor: () => ({ sales: 30000, spend: 10000 }),
  daysInMonth: () => 31,
  makeReport: async (e, acct, period, start) => { reportsMade.push([acct.act_id, period, start]); },
  xfetch: async () => { aiCalls++; return { ok: true, json: async () => ({ usage: { input_tokens: 900, output_tokens: 120 }, content: [{ type: 'text', text: '{"lines":[{"key":"dates","mark":"look","reason":"The copy says the sale ends Mar 9 and also Mar 12."},{"key":"spelling","mark":"fine","reason":"No misspelled words."}]}' }] }) }; },
  ownerEmail: 'owner@agency.example',
};
const json = (o, status = 200) => ({ status, body: o });
const call = async (method, path, body) => handleAutomations(new Request('https://x.test' + path, { method, ...(body ? { body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' } } : {}) }), env, path.split('?')[0], json, d);
const as = (email, c = null) => { session = email; client = c; };
let n = 0;
const ok = (name, fn) => Promise.resolve().then(fn).then(() => { n++; }, e => { console.error('FAILED: ' + name + '\n', e); process.exitCode = 1; });

/* ---------------- 1. the sentence model ---------------- */
await ok('a sentence needs a trigger and something to do or tell', () => {
  assert.match(cleanAutomation({}).error, /what sets it off/);
  assert.match(cleanAutomation({ when: { type: 'card_status', status: 'nope' } }).error, /stage/);
  assert.match(cleanAutomation({ when: { type: 'plan_missing' } }).error, /who to tell/);
  assert.match(cleanAutomation({ when: { type: 'schedule' }, do: [{ type: 'ai_check' }] }).error, /card trigger/);
});
await ok('the sentence reads When, If, Do, Tell with its changeable words marked', () => {
  const a = cleanAutomation({ when: { type: 'card_status', status: 'review' }, if: [{ type: 'days', value: 'weekdays' }], do: [{ type: 'ai_check' }], tell: { who: [{ kind: 'role', role: 'maker' }] } }).automation;
  const s = sentence(a);
  assert.equal(s.text, "When a production card moves to Review, for any brand, if it is a weekday, ask the AI checker to look at it, then tell the card's maker, each in their own way.");
  assert.deepEqual(s.parts.filter(p => p.t === 'slot').map(p => p.key), ['when.status', 'brand', 'if.days', 'tell.who.0']);
  assert.equal(a.state, 'draft', 'a new automation is off');
  const m = sentence(cleanAutomation({ when: { type: 'metric', metric: 'mer', window: 'last7', compare: 'below', line: 'goal' }, tell: { who: [{ kind: 'me' }] } }).automation).text;
  assert.equal(m, "When MER over the last 7 days is under the brand's goal, for any brand, tell me, each in their own way.");
  assert.equal(sentence(cleanAutomation({ when: { type: 'schedule', every: 'week', day: 'mon', hour: 7 }, do: [{ type: 'draft_report' }], tell: { who: [{ kind: 'team' }] } }).automation).text,
    'Every Monday at 7am, for any brand, draft the weekly report and hold it, then tell the whole team, each in their own way.');
});
await ok('only the owner can mark "stop spend alone", and it is stored, not run', () => {
  const b = { when: { type: 'card_stale', status: 'live', days: 3 }, do: [{ type: 'stop_spend', change: 'pause' }], may_act_alone: true };
  assert.equal(cleanAutomation(b).automation.may_act_alone, false);
  assert.equal(cleanAutomation(b, { owner: true }).automation.may_act_alone, true);
});
await ok('the gallery: 25 templates, every one off, one sentence each, no long dashes', () => {
  const g = gallery();
  assert.equal(g.length, 25); assert.equal(TEMPLATES.length, 25);
  assert.ok(g.every(t => t.on === false));
  assert.ok(g.filter(t => t.ready).every(t => t.automation.state === 'draft' && t.sentence.parts.some(p => p.t === 'slot')));
  assert.ok(g.filter(t => !t.ready).every(t => /Not ready yet/.test(t.waits) && t.sentence.parts.some(p => p.t === 'slot')));
  assert.ok(g.filter(t => t.ready).length >= 9);
  assert.ok(!/[—–]/.test(JSON.stringify(g)));
  assert.equal(new Set(g.map(t => t.key)).size, 25);
});

/* ---------------- 2. nothing saved = no work ---------------- */
await ok('with no automation saved the hourly job reads one count and stops', async () => {
  fresh();
  const r = await automationTick(env, d);
  assert.deepEqual(r, { on: 0 });
  assert.equal(reads.length, 1, 'one read');
  assert.match(reads[0], /SELECT COUNT\(\*\)/);
  assert.equal(rows(`SELECT name FROM sqlite_master WHERE name LIKE 'p_auto%' OR name = 'p_notice'`).length, 0, 'no table was made');
});
await ok('saved but switched off (a draft) is still one count', async () => {
  fresh(); as('owner@agency.example');
  const r = await call('PUT', '/api/automations', { when: { type: 'plan_missing', hour: 10 }, tell: { who: [{ kind: 'me' }] } });
  assert.equal(r.status, 200); assert.equal(r.body.automation.state, 'draft');
  reads = [];
  assert.deepEqual(await automationTick(env, d), { on: 0 });
  assert.equal(reads.length, 1);
});
await ok('switched on, but the workspace switch is off: nothing runs', async () => {
  fresh(); as('owner@agency.example');
  await call('PUT', '/api/automations', { when: { type: 'card_status', status: 'review' }, tell: { who: [{ kind: 'me' }] }, state: 'on' });
  db.prepare(`INSERT INTO p_br_batch VALUES ('c1', 'brand_northlake', 12, 'Spring polo', '', 'review', '2026-03-11 15:30:00')`).run();
  const r = await automationTick(env, d);
  assert.equal(r.on, 1); assert.match(r.off, /switched off/);
  assert.equal(rows(`SELECT * FROM p_notice`).length, 0);
  as('buyer@agency.example');
  assert.equal((await call('POST', '/api/automations/power', { on: true })).status, 403, 'only the owner flips the switch');
});

/* ---------------- 3. the runner ---------------- */
const turnOn = async () => { as('owner@agency.example'); assert.equal((await call('POST', '/api/automations/power', { on: true })).body.power, true); };
await ok('a card entering Review tells the person once, in the bell and on the home list, never Slack unless chosen', async () => {
  fresh(); await turnOn(); slack.length = 0;
  NOW = new Date('2026-03-11T15:00:00Z');
  const a = (await call('PUT', '/api/automations', { when: { type: 'card_status', status: 'review' }, tell: { who: [{ kind: 'me' }] }, state: 'on' })).body.automation;
  NOW = new Date('2026-03-11T16:00:00Z');
  db.prepare(`INSERT INTO p_br_batch VALUES ('c1', 'brand_northlake', 12, 'Spring polo', '', 'review', '2026-03-11 15:30:00')`).run();
  db.prepare(`INSERT INTO p_br_batch VALUES ('c0', 'brand_northlake', 11, 'Old card', '', 'review', '2026-03-01 15:30:00')`).run();
  const r = await automationTick(env, d);
  assert.equal(r.ran, 1);
  const nt = rows(`SELECT * FROM p_notice`);
  assert.equal(nt.length, 1);
  assert.equal(nt[0].person_id, 'owner@agency.example'); assert.equal(nt[0].brand_id, 'brand_northlake'); assert.equal(nt[0].home, 1);
  assert.equal(nt[0].title, '#12 Spring polo moved to Review');
  assert.equal(slack.length, 0, 'Slack was not chosen, so nothing went to Slack');
  NOW = new Date('2026-03-11T17:00:00Z');
  assert.equal((await automationTick(env, d)).ran, 0, 'the same card is not told twice');
  assert.equal(rows(`SELECT * FROM p_notice`).length, 1);
  const log = rows(`SELECT * FROM p_automation_run`);
  assert.equal(log.length, 1); assert.equal(log[0].result, 'done'); assert.equal(log[0].automation_id, a.id);
  const list = (await call('GET', '/api/automations')).body;
  assert.equal(list.runs.length, 1); assert.match(list.automations[0].last_status, /^done/); assert.equal(list.templates.length, 25);
});
await ok('an event handed to the runner works the same, and is not doubled by the timer', async () => {
  fresh(); await turnOn();
  NOW = new Date('2026-03-11T15:00:00Z');
  await call('PUT', '/api/automations', { when: { type: 'card_status', status: 'ready' }, tell: { who: [{ kind: 'me' }] }, state: 'on' });
  NOW = new Date('2026-03-11T16:00:00Z');
  db.prepare(`INSERT INTO p_br_batch VALUES ('c2', 'brand_pinecrest', 7, 'Gift set', '', 'ready', '2026-03-11 15:59:00')`).run();
  const r = await automationTick(env, d, { events: [{ type: 'card_status', status: 'ready', card: { id: 'c2', act_id: 'brand_pinecrest', num: 7, title: 'Gift set' } }] });
  assert.equal(r.ran, 1);
  assert.equal((await automationTick(env, d)).ran, 0);
  assert.equal(rows(`SELECT * FROM p_notice`).length, 1);
});
await ok('Slack DM only for a person who chose it', async () => {
  fresh(); await turnOn(); slack.length = 0;
  NOW = new Date('2026-03-11T15:00:00Z');
  await call('PUT', '/api/automations', { when: { type: 'card_status', status: 'review' }, tell: { who: [{ kind: 'me' }, { kind: 'person', email: 'maker@agency.example' }] }, state: 'on' });
  as('maker@agency.example');
  assert.equal((await call('PUT', '/api/me/delivery', { delivery: { ways: { home: true, slack: true } } })).body.delivery.ways.slack, true);
  NOW = new Date('2026-03-11T16:00:00Z');
  db.prepare(`INSERT INTO p_br_batch VALUES ('c1', 'brand_northlake', 12, 'Spring polo', '', 'review', '2026-03-11 15:30:00')`).run();
  await automationTick(env, d);
  assert.equal(rows(`SELECT * FROM p_notice`).length, 2, 'both got a row in the app');
  const posts = slack.filter(s => s[0] === 'chat.postMessage');
  assert.equal(posts.length, 1); assert.equal(posts[0][1].channel, 'UMAKE');
});
await ok('a number crossing the line fires once, then follows the repeat rule', async () => {
  fresh(); await turnOn();
  for (let i = 1; i <= 7; i++) {
    const day = `2026-03-${String(3 + i).padStart(2, '0')}`;
    for (const [m, v] of [['netSales', 1000], ['totalNetTaxes', 0], ['blendedAds', 500]]) db.prepare(`INSERT INTO tw_daily VALUES ('brand_northlake', ?, ?, ?, '2026-03-11 09:00:00')`).run(day, m, v);
  }
  assert.equal((await metricValue(env, d, BRANDS[0], 'mer', 'last7', NOW)).value, 2);
  assert.match((await metricValue(env, d, BRANDS[1], 'mer', 'last7', NOW)).wait, /not synced/);
  await call('PUT', '/api/automations', { brand: 'brand_northlake', when: { type: 'metric', metric: 'mer', window: 'last7', compare: 'below', line: 'goal' }, tell: { who: [{ kind: 'me' }] }, state: 'on' });
  assert.equal((await automationTick(env, d)).ran, 1);
  assert.match(rows(`SELECT title FROM p_notice`)[0].title, /Northlake Golf: MER over the last 7 days is 2\.00x, under the line of 3\.00x/);
  /* two days later the numbers still miss: day +2 is quiet (the rule is the day, +1, +3, +7) */
  for (const [m, v] of [['netSales', 1000], ['totalNetTaxes', 0], ['blendedAds', 500]]) for (const day of ['2026-03-11', '2026-03-12']) db.prepare(`INSERT INTO tw_daily VALUES ('brand_northlake', ?, ?, ?, '2026-03-13 09:00:00')`).run(day, m, v);
  NOW = new Date('2026-03-13T16:00:00Z');
  const r2 = await automationTick(env, d);
  assert.equal(r2.runs[0].result, 'skipped'); assert.match(r2.runs[0].why, /Already told about this 2 days ago/);
  assert.equal(rows(`SELECT * FROM p_notice`).length, 1);
  NOW = new Date('2026-03-11T16:00:00Z');
});
await ok('a report draft uses the report engine and sends nothing', async () => {
  fresh(); await turnOn(); reportsMade = [];
  NOW = new Date('2026-03-09T12:00:00Z');   // Monday, 7am in Chicago
  await call('PUT', '/api/automations', { template: 'brand_weekly', state: 'on', tell: { who: [{ kind: 'me' }] } });
  const r = await automationTick(env, d);
  assert.equal(r.ran, 1);
  assert.deepEqual(reportsMade, [['brand_northlake', 'weekly', '2026-03-02'], ['brand_pinecrest', 'weekly', '2026-03-02']]);
  assert.match(r.runs[0].why, /Nothing is sent to a client/);
  NOW = new Date('2026-03-11T16:00:00Z');
});
await ok('a suggested change is never applied and never recorded as applied: a yes is refused, "I did it" is what gets written', async () => {
  fresh(); await turnOn();
  await call('PUT', '/api/automations', { when: { type: 'card_stale', status: 'live', days: 3 }, do: [{ type: 'stop_spend', change: 'pause' }], may_act_alone: true, tell: { who: [{ kind: 'me' }] }, state: 'on' });
  db.prepare(`INSERT INTO p_br_batch VALUES ('c9', 'brand_northlake', 30, 'Clearance', '', 'live', '2026-03-01 10:00:00')`).run();
  const r = await automationTick(env, d);
  assert.equal(r.runs[0].result, 'waiting_for_tap');
  assert.match(r.runs[0].why, /does not run in this version/);
  const nt = rows(`SELECT * FROM p_notice`)[0];
  assert.equal(nt.kind, 'proposal'); assert.match(nt.title, /^Suggested: pausing it/); assert.match(nt.body, /Locus does not make this change/);
  assert.ok(!/api\/meta\/write|"yes"|"path"/.test(nt.button_json), 'the row carries no write route and no id to write to');
  const yes = await call('POST', '/api/notices/done', { id: nt.id, answer: 'yes' });
  assert.equal(yes.status, 409); assert.equal(yes.body.applied, false);
  assert.equal(rows(`SELECT state FROM p_notice`)[0].state, 'open', 'the row stays open');
  assert.equal(rows(`SELECT tapped_by FROM p_automation_run`)[0].tapped_by, null, 'and the log does not say anyone approved it');
  const tap = await call('POST', '/api/notices/done', { id: nt.id, answer: 'did_it' });
  assert.equal(tap.body.applied, false); assert.ok(!('next' in tap.body)); assert.match(tap.body.note, /Locus changed nothing/);
  assert.match(rows(`SELECT tapped_by FROM p_automation_run`)[0].tapped_by, /owner@agency\.example \(made the change by hand\)/);
  const view = (await call('GET', '/api/automations')).body.automations[0];
  assert.ok(view.notes.some(x => /does not run in this version/.test(x)));
  const p = (await call('PUT', '/api/automations', { when: { type: 'metric', metric: 'spend', window: 'yesterday', compare: 'above', line: 500 }, do: [{ type: 'propose', change: 'pause' }] })).body.automation;
  assert.match(p.sentence.text, /suggest pausing it and wait for an answer/);
  assert.ok(p.notes.some(x => /Locus does not make this change in this version/.test(x)));
});
await ok('the AI checker keeps its notes as a flagged draft and counts its tokens', async () => {
  fresh(); await turnOn(); aiCalls = 0;
  NOW = new Date('2026-03-11T15:00:00Z');
  await call('PUT', '/api/automations', { template: 'review_check', state: 'on', tell: { who: [{ kind: 'me' }] } });
  NOW = new Date('2026-03-11T16:00:00Z');
  db.prepare(`INSERT INTO p_br_batch VALUES ('c1', 'brand_northlake', 12, 'Spring polo', 'Sale ends Mar 9. Ends Mar 12.', 'review', '2026-03-11 15:30:00')`).run();
  await automationTick(env, d);
  assert.equal(aiCalls, 1);
  const cc = rows(`SELECT * FROM p_creative_check`)[0];
  assert.equal(cc.state, 'draft'); assert.equal(cc.flagged, 1); assert.equal(cc.ai_in, 900); assert.equal(cc.ai_out, 120);
  assert.ok(JSON.parse(cc.lines_json).some(l => l.key === 'picture' && l.mark === 'could_not'), 'it says what it did not look at');
  const run = rows(`SELECT * FROM p_automation_run`)[0];
  assert.equal(run.ai_in, 900); assert.ok(run.ai_usd > 0);
  assert.equal(JSON.parse(rows(`SELECT value FROM settings WHERE key = 'aiSpend:auto:2026-03'`)[0].value).calls, 1);
  assert.equal(rows(`SELECT board_stage FROM p_br_batch WHERE id = 'c1'`)[0].board_stage, 'review', 'the card did not move');
});

/* ---------------- 4. the dry run ---------------- */
await ok('"Try it" says what would have happened and writes nothing', async () => {
  fresh(); as('owner@agency.example'); slack.length = 0; aiCalls = 0;
  db.prepare(`INSERT INTO p_br_batch VALUES ('c1', 'brand_northlake', 12, 'Spring polo', '', 'review', '2026-03-11 08:30:00')`).run();
  const r = await call('POST', '/api/automations/test', { automation: { when: { type: 'card_status', status: 'review' }, do: [{ type: 'ai_check' }], tell: { who: [{ kind: 'me' }] } } });
  assert.equal(r.status, 200); assert.equal(r.body.test, true);
  assert.equal(r.body.would.length, 1);
  assert.equal(r.body.would[0].title, '#12 Spring polo moved to Review');
  assert.ok(r.body.would[0].did.some(x => x.type === 'ai_check' && x.dry && /costs AI/.test(x.text)));
  assert.deepEqual(r.body.would[0].did.find(x => x.type === 'tell').told[0].ways, ['bell', 'home']);
  assert.equal(rows(`SELECT * FROM p_notice`).length + rows(`SELECT * FROM p_automation_run`).length + rows(`SELECT * FROM p_automation`).length + rows(`SELECT * FROM p_creative_check`).length, 0);
  assert.equal(aiCalls, 0); assert.equal(slack.length, 0);
  const none = await call('POST', '/api/automations/test', { automation: { when: { type: 'card_status', status: 'off' }, tell: { who: [{ kind: 'me' }] } } });
  assert.match(none.body.nothing, /Nothing would have happened/);
});

/* ---------------- 5. delivery: each person's own choice ---------------- */
await ok('planDelivery: mute, only if missing, the morning read, quiet hours', () => {
  const base = { tz: 'America/Chicago', read_hour: 7, quiet_from: 19, quiet_to: 5, break_quiet: ['tap', 'down'], ways: { home: true, slack: true }, mode: 'now' };
  const noon = new Date('2026-03-11T17:00:00Z'), night = new Date('2026-03-12T03:00:00Z');
  assert.match(planDelivery({ ...base, mode: 'mute' }, { problem: true }, noon).skip, /Muted/);
  assert.deepEqual(planDelivery({ ...base, mode: 'mute' }, { problem: true, must: 'tap' }, noon).notice.home, false, 'a waiting tap is never muted below the bell');
  assert.match(planDelivery({ ...base, mode: 'only_if_missing' }, { problem: false }, noon).skip, /went as planned/);
  assert.deepEqual(planDelivery({ ...base, mode: 'only_if_missing' }, { problem: true }, noon).send, ['slack']);
  const held = planDelivery({ ...base, mode: 'morning_read' }, { problem: true }, noon);
  assert.deepEqual(held.send, []); assert.equal(clockIn('America/Chicago', new Date(held.notice.hold_until)).hour, 7);
  const q = planDelivery(base, { problem: true }, night);
  assert.deepEqual(q.send, []); assert.match(q.notice.held_why, /Quiet hours/); assert.deepEqual(q.later, ['slack']);
  assert.deepEqual(planDelivery(base, { problem: true, must: 'down' }, night).send, ['slack'], 'something down gets through');
  assert.deepEqual(planDelivery({ ...base, ways: { home: true, slack: true, email: true } }, { problem: true }, noon, { client: true }).send, ['email'], 'a client never gets a Slack DM');
});
await ok('"only if missing": silent when every plan is in, told when one is not', async () => {
  fresh(); await turnOn();
  const a = (await call('PUT', '/api/automations', { template: 'plan_missing', state: 'on' })).body.automation;
  const set = await call('PUT', '/api/me/delivery', { per: [{ automation_id: a.id, mode: 'only_if_missing' }] });
  assert.equal(set.body.per[0].mode, 'only_if_missing'); assert.equal(set.body.per[0].own, true);
  setS('checkinPeople', { U1: { name: 'Avery' }, U2: { name: 'Blake' }, U3: { name: 'Casey', weekOnly: true } });
  setS('checkin:2026-03-11', { people: { U1: { plan: { at: 1 } }, U2: { plan: { at: 2 } } } });
  const r = await automationTick(env, d);
  assert.equal(r.runs[0].result, 'skipped'); assert.match(r.runs[0].why, /Only if missing: it went as planned/);
  assert.equal(rows(`SELECT * FROM p_notice`).length, 0, 'nothing reached the owner');
  NOW = new Date('2026-03-12T16:00:00Z');
  setS('checkin:2026-03-12', { people: { U1: { plan: { at: 1 } }, U2: { out: true } } });
  assert.equal((await automationTick(env, d)).runs[0].result, 'skipped', 'someone who is out is not missing');
  NOW = new Date('2026-03-13T16:00:00Z');
  setS('checkin:2026-03-13', { people: { U1: { plan: { at: 1 } } } });
  const r3 = await automationTick(env, d);
  assert.equal(r3.runs[0].result, 'done');
  assert.equal(rows(`SELECT title FROM p_notice`)[0].title, '1 of 2 plans are in. Missing: Blake');
  NOW = new Date('2026-03-13T14:00:00Z');   // 9am Central on a new day: before the hour, nothing is read as missing
  NOW = new Date('2026-03-11T16:00:00Z');
});
await ok('a held row waits for the person\'s hour, then goes out as one message', async () => {
  fresh(); await turnOn(); slack.length = 0;
  NOW = new Date('2026-03-11T15:00:00Z');
  await call('PUT', '/api/automations', { when: { type: 'card_status', status: 'review' }, tell: { who: [{ kind: 'me' }] }, state: 'on' });
  await call('PUT', '/api/me/delivery', { delivery: { mode: 'morning_read', read_hour: 7, tz: 'America/Chicago', ways: { home: true, slack: true } } });
  NOW = new Date('2026-03-11T16:00:00Z');
  db.prepare(`INSERT INTO p_br_batch VALUES ('c1', 'brand_northlake', 12, 'Spring polo', '', 'review', '2026-03-11 15:30:00')`).run();
  const r = await automationTick(env, d);
  assert.equal(r.runs[0].result, 'held');
  assert.equal(slack.filter(s => s[0] === 'chat.postMessage').length, 0);
  const mine = (await call('GET', '/api/notices')).body;
  assert.equal(mine.home.length, 0); assert.equal(mine.morning.length, 1); assert.equal(mine.bell.length, 1, 'the bell keeps it');
  NOW = new Date('2026-03-12T12:30:00Z');   // 7:30am Central the next day
  assert.equal((await automationTick(env, d)).released, 1);
  assert.equal(slack.filter(s => s[0] === 'chat.postMessage').length, 1);
  assert.equal((await call('GET', '/api/notices')).body.home.length, 1);
  NOW = new Date('2026-03-11T16:00:00Z');
});

/* ---------------- 6. the guard ---------------- */
await ok('a client reads only its own rows on its own brand, sets only its own delivery, and cannot open automations', async () => {
  fresh(); as('owner@agency.example');
  await call('GET', '/api/notices');   // makes the tables
  const ins = (id, person, brand, kind = 'tell') => db.prepare(`INSERT INTO p_notice (id, person_id, brand_id, kind, title, state, home, created_at, button_json) VALUES (?, ?, ?, ?, ?, 'open', 1, '2026-03-11T16:00:00Z', ?)`).run(id, person, brand, kind, 'Row ' + id, kind === 'proposal' ? '{"yes":{"path":"/api/meta/write","body":{}}}' : null);
  ins('n1', 'pat@northlake.example', 'brand_northlake'); ins('n2', 'pat@northlake.example', 'brand_pinecrest'); ins('n3', 'lee@pinecrest.example', 'brand_pinecrest');
  ins('n4', 'owner@agency.example', 'brand_northlake'); ins('n5', 'pat@northlake.example', 'brand_northlake', 'proposal'); ins('n6', 'pat@northlake.example', null);
  as('pat@northlake.example', { email: 'pat@northlake.example', ids: new Set(['brand_northlake']) });
  const mine = (await call('GET', '/api/notices')).body;
  assert.deepEqual(mine.bell.map(r => r.id).sort(), ['n1'], 'not another brand, not another person, not a row with no brand, and never a suggested change');
  assert.ok(!('button' in mine.bell[0]) && !('sent' in mine.bell[0]) && !('run_id' in mine.bell[0]));
  assert.equal((await call('POST', '/api/notices/done', { id: 'n3' })).status, 404, 'another client\'s row');
  assert.equal((await call('POST', '/api/notices/done', { id: 'n2' })).status, 404, 'its own row on a brand it does not have');
  assert.equal((await call('POST', '/api/notices/done', { id: 'n4' })).status, 404);
  assert.equal((await call('POST', '/api/notices/done', { id: 'n5', answer: 'did_it' })).status, 404, 'a client never answers a change to the ads');
  assert.equal((await call('POST', '/api/notices/done', { id: 'n1' })).body.state, 'done');
  assert.equal((await call('GET', '/api/automations')).status, 403);
  assert.equal((await call('PUT', '/api/automations', { template: 'plan_missing', state: 'on' })).status, 403);
  assert.equal((await call('POST', '/api/automations/test', { automation: {} })).status, 403);
  const dv = await call('PUT', '/api/me/delivery', { delivery: { mode: 'only_if_missing', ways: { home: true, slack: true, email: true } } });
  assert.equal(dv.body.email, 'pat@northlake.example');
  assert.deepEqual(dv.body.delivery.ways, { home: false, slack: false, email: true }, 'a client gets the bell and email only');
  assert.deepEqual(rows(`SELECT person_id FROM p_person_delivery`).map(r => r.person_id), ['pat@northlake.example']);
  as(null);
  assert.equal((await call('GET', '/api/notices')).status, 401);
  assert.equal((await call('GET', '/api/automations')).status, 401);
});
await ok('the client rules are on the allowlist in both workers, and nothing else of automations is', async () => {
  const { CLIENT_RULES } = await import('./src/brandguard.js');
  const has = (m, p) => CLIENT_RULES.some(r => r.m === m && r.p === p);
  assert.ok(has('GET', '/api/notices') && has('POST', '/api/notices/done') && has('GET', '/api/me/delivery') && has('PUT', '/api/me/delivery'));
  assert.ok(!CLIENT_RULES.some(r => String(r.p || '').startsWith('/api/automations')));
  assert.deepEqual(CLIENT_RULES.find(r => r.m === 'PUT' && r.p === '/api/me/delivery').fields, ['delivery', 'per', 'notify']);
});
await ok('a teammate held to some brands sees and saves only those', async () => {
  fresh(); as('owner@agency.example');
  await call('PUT', '/api/automations', { brand: 'brand_pinecrest', when: { type: 'sync_failing', hours: 30 }, tell: { who: [{ kind: 'me' }] } });
  await call('PUT', '/api/automations', { when: { type: 'plan_missing' }, tell: { who: [{ kind: 'me' }] } });
  as('buyer@agency.example');
  const d2 = { ...d, brandsFor: async () => new Set(['brand_northlake']) };
  const get = await handleAutomations(new Request('https://x.test/api/automations'), env, '/api/automations', json, d2);
  assert.equal(get.body.automations.length, 0); assert.deepEqual(get.body.brands.map(b => b.id), ['brand_northlake']);
  const put = await handleAutomations(new Request('https://x.test/api/automations', { method: 'PUT', body: JSON.stringify({ when: { type: 'plan_missing' }, tell: { who: [{ kind: 'me' }] } }) }), env, '/api/automations', json, d2);
  assert.equal(put.status, 403);
});
await ok('five failures in a row pause an automation and tell its maker', async () => {
  fresh(); await turnOn();
  await call('PUT', '/api/automations', { template: 'review_check', state: 'on', tell: { who: [{ kind: 'me' }] } });
  const bad = { ...d, xfetch: async () => ({ ok: false, status: 500, json: async () => ({ error: { message: 'down' } }) }) };
  /* Each card gets three tries (the AI may be back the next hour); only the third counts as a failure. */
  const results = [];
  for (let i = 0; i < 7; i++) {
    if (i < 5) db.prepare(`INSERT INTO p_br_batch VALUES (?, 'brand_northlake', ?, 'Card', 'copy', 'review', ?)`).run('f' + i, i, `2026-03-11 ${String(16 + i).padStart(2, '0')}:10:00`);
    NOW = new Date(`2026-03-11T${17 + i}:00:00Z`);
    results.push(...(await automationTick(env, bad)).runs.map(x => x.result));
  }
  assert.equal(results.filter(x => x === 'failed').length, 5); assert.equal(results.filter(x => x === 'retry').length, 10);
  assert.equal(rows(`SELECT * FROM p_notice WHERE title LIKE '%Could not check%'`).length, 5, 'each card is told once, on its last try, with what could not be done');
  assert.equal(rows(`SELECT state FROM p_automation`)[0].state, 'paused');
  assert.equal(rows(`SELECT title FROM p_notice WHERE title LIKE '%failed 5 times in a row, so it paused itself'`).length, 1);
  assert.equal(await onCount(env), 0);
  NOW = new Date('2026-03-11T16:00:00Z');
});
/* ---------------- 7. review fixes (2026-11-25) ---------------- */
const callD = async (dd, method, path, body) => handleAutomations(new Request('https://x.test' + path, { method, ...(body ? { body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' } } : {}) }), env, path.split('?')[0], json, dd);
const hourOn = (iso, h) => new Date(new Date(iso).getTime() + h * 36e5);
await ok('more than 20 at once fold into ONE row, once, and each match still follows the repeat rule', async () => {
  fresh(); await turnOn();
  await call('PUT', '/api/automations', { template: 'ready_not_loaded', state: 'on', tell: { who: [{ kind: 'me' }] } });
  for (let i = 0; i < 25; i++) db.prepare(`INSERT INTO p_br_batch VALUES (?, 'brand_northlake', ?, ?, '', 'ready', '2026-03-08 10:00:00')`).run('s' + i, i + 1, 'Card ' + i);
  await automationTick(env, d);
  assert.equal(rows(`SELECT * FROM p_notice`).length, 1);
  assert.match(rows(`SELECT body FROM p_notice`)[0].body, /25 things matched/);
  assert.equal(rows(`SELECT * FROM p_automation_run WHERE result = 'folded' AND thing_key IS NOT NULL`).length, 25, 'every match is in the log under its own key');
  for (let h = 1; h <= 5; h++) { NOW = hourOn('2026-03-11T16:00:00Z', h); assert.equal((await automationTick(env, d)).ran, 0, 'the next hours tell nothing new'); }
  assert.equal(rows(`SELECT * FROM p_notice`).length, 1, 'one task, not one an hour');
  NOW = new Date('2026-03-13T16:00:00Z');   // day +2 is a quiet day
  const r2 = await automationTick(env, d);
  assert.ok(r2.runs.length === 25 && r2.runs.every(x => x.result === 'skipped'));
  assert.equal(rows(`SELECT * FROM p_notice`).length, 1);
  NOW = new Date('2026-03-14T16:00:00Z');   // day +3 reminds, still as one row
  await automationTick(env, d);
  assert.equal(rows(`SELECT * FROM p_notice`).length, 2);
  NOW = new Date('2026-03-11T16:00:00Z');
});
await ok('a person on the morning read still gets the day, +1, +3, +7 and then quiet, for as long as it stays wrong', async () => {
  fresh(); await turnOn();
  await call('PUT', '/api/automations', { when: { type: 'card_stale', status: 'making', days: 5 }, tell: { who: [{ kind: 'me' }] }, state: 'on' });
  await call('PUT', '/api/me/delivery', { delivery: { mode: 'morning_read', read_hour: 7, tz: 'America/Chicago' } });
  db.prepare(`INSERT INTO p_br_batch VALUES ('c7', 'brand_northlake', 41, 'Slow card', '', 'making', '2026-03-01 10:00:00')`).run();
  const told = [];
  for (let day = 0; day < 30; day++) {
    NOW = hourOn('2026-03-11T16:00:00Z', 24 * day);
    const r = await automationTick(env, d);
    if (r.runs.some(x => x.result === 'held')) told.push(day);
  }
  assert.deepEqual(told, [0, 1, 3, 7], 'a held row starts the rule, and day 22 does not start it over');
  assert.equal(rows(`SELECT * FROM p_notice`).length, 4);
  /* gone for a week, then back: that is a new problem and it is told again */
  db.prepare(`UPDATE p_br_batch SET board_stage = 'review' WHERE id = 'c7'`).run();
  NOW = hourOn('2026-03-11T16:00:00Z', 24 * 36); await automationTick(env, d);
  db.prepare(`UPDATE p_br_batch SET board_stage = 'making', board_at = '2026-04-01 10:00:00' WHERE id = 'c7'`).run();
  NOW = hourOn('2026-03-11T16:00:00Z', 24 * 40);
  assert.equal((await automationTick(env, d)).runs[0].result, 'held');
  NOW = new Date('2026-03-11T16:00:00Z');
});
await ok('no room this hour: the cursor waits, and the cards left over are handled on the next pass', async () => {
  fresh(); await turnOn();
  NOW = new Date('2026-03-11T15:00:00Z');
  await call('PUT', '/api/automations', { when: { type: 'card_status', status: 'review' }, tell: { who: [{ kind: 'me' }] }, state: 'on' });
  for (let i = 0; i < 8; i++) db.prepare(`INSERT INTO p_br_batch VALUES (?, 'brand_northlake', ?, 'Card', '', 'review', ?)`).run('r' + i, i + 1, `2026-03-11 15:${10 + i}:00`);
  let room = 3;
  const tight = { ...d, subCanAfford: n => n !== 20 || room-- > 0 };
  NOW = new Date('2026-03-11T16:00:00Z');
  const r1 = await automationTick(env, tight);
  assert.equal(r1.ran, 3); assert.equal(r1.deferred, true);
  assert.equal(rows(`SELECT cursor FROM p_automation`)[0].cursor, '2026-03-11T15:00:00.000Z', 'the cursor did not move past what was left');
  NOW = new Date('2026-03-11T17:00:00Z'); room = 100;
  assert.equal((await automationTick(env, tight)).ran, 5);
  assert.equal(rows(`SELECT * FROM p_notice`).length, 8, 'all eight cards were told, each once');
  assert.equal(rows(`SELECT cursor FROM p_automation`)[0].cursor, '2026-03-11T17:00:00.000Z');
  NOW = new Date('2026-03-11T16:00:00Z');
});
const reportEngine = failing => async (e, acct, period, start) => {
  if (failing(acct)) throw new Error('Triple Whale data is missing for 1 of the 7 days');
  reportsMade.push([acct.act_id, period, start]);
  db.prepare(`INSERT INTO reports VALUES (?, ?, ?, ?, 'draft', ?)`).run(acct.act_id, period, start, start, NOW.toISOString());
};
await ok('a report that could not be drafted is tried again the next hour, and nobody is told twice', async () => {
  fresh(); await turnOn(); reportsMade = [];
  NOW = new Date('2026-03-09T12:00:00Z');   // Monday, 7am in Chicago
  await call('PUT', '/api/automations', { template: 'brand_weekly', state: 'on', tell: { who: [{ kind: 'me' }] } });
  let down = true;
  const dd = { ...d, makeReport: reportEngine(acct => down && acct.act_id === 'brand_pinecrest') };
  const r1 = await automationTick(env, dd);
  assert.equal(r1.runs[0].result, 'retry'); assert.match(r1.runs[0].why, /Could not draft Pinecrest Candle: Triple Whale data is missing.*try again/);
  assert.equal(rows(`SELECT * FROM p_notice`).length, 0, 'nothing is told while a try is left');
  NOW = new Date('2026-03-09T13:00:00Z'); down = false;
  const r2 = await automationTick(env, dd);
  assert.equal(r2.runs[0].result, 'done');
  assert.deepEqual(reportsMade.map(x => x[0]), ['brand_northlake', 'brand_pinecrest'], 'the brand that worked is not drafted twice');
  assert.equal(rows(`SELECT * FROM p_notice`).length, 1);
  NOW = new Date('2026-03-09T14:00:00Z');
  assert.equal((await automationTick(env, dd)).ran, 0);
  /* never works: three tries, then it says so, is logged as failed, and stops */
  fresh(); await turnOn(); reportsMade = [];
  NOW = new Date('2026-03-09T12:00:00Z');
  await call('PUT', '/api/automations', { template: 'brand_weekly', state: 'on', tell: { who: [{ kind: 'me' }] } });
  const never = { ...d, makeReport: reportEngine(acct => acct.act_id === 'brand_pinecrest') };
  const seen = [];
  for (let h = 0; h < 5; h++) { NOW = hourOn('2026-03-09T12:00:00Z', h); seen.push(...(await automationTick(env, never)).runs.map(x => x.result)); }
  assert.deepEqual(seen, ['retry', 'retry', 'failed']);
  assert.match(rows(`SELECT title FROM p_notice`)[0].title, /Could not draft Pinecrest Candle/);
  assert.equal(rows(`SELECT * FROM p_notice`).length, 1);
  NOW = new Date('2026-03-11T16:00:00Z');
});
await ok('a report draft costs AI: it is counted, shown, and stops at the day limit', async () => {
  fresh(); await turnOn(); reportsMade = [];
  setS('automationsAiDayCap', '0.15');
  NOW = new Date('2026-03-09T12:00:00Z');
  const a = (await call('PUT', '/api/automations', { template: 'brand_weekly', state: 'on', tell: { who: [{ kind: 'me' }] } })).body.automation;
  assert.equal(a.costs_ai, true); assert.ok(a.notes.some(x => /costs AI/.test(x) && /not sent yet/.test(x)));
  assert.equal(gallery().find(t => t.key === 'brand_weekly').ai, true);
  const r = await automationTick(env, { ...d, makeReport: reportEngine(() => false) });
  assert.equal(r.runs[0].result, 'over_limit');
  assert.deepEqual(reportsMade.map(x => x[0]), ['brand_northlake'], 'the second brand would have gone over the limit');
  const run = rows(`SELECT * FROM p_automation_run`)[0];
  assert.equal(run.ai_usd, 0.1); assert.match(run.why, /AI: about \$0\.10, an estimate/); assert.match(run.why, /AI limit/);
  assert.equal(+rows(`SELECT value FROM settings WHERE key = 'aiSpend:auto:day:2026-03-09'`)[0].value, 0.1);
  NOW = new Date('2026-03-11T16:00:00Z');
});
await ok('"the whole team" is everyone who may sign in, not the view only list, and never a client', async () => {
  fresh(); await turnOn();
  setS('userRoles', { 'guest@agency.example': 'viewer' });
  setS('userPrefs:buyer@agency.example', {}); setS('userPrefs:maker@agency.example', {}); setS('userPrefs:pat@northlake.example', {});
  setS('clientUsers', { 'pat@northlake.example': { brands: ['brand_northlake'] } });
  NOW = new Date('2026-03-11T15:00:00Z');
  await call('PUT', '/api/automations', { when: { type: 'card_status', status: 'review' }, tell: { who: [{ kind: 'team' }] }, state: 'on' });
  NOW = new Date('2026-03-11T16:00:00Z');
  db.prepare(`INSERT INTO p_br_batch VALUES ('c1', 'brand_northlake', 12, 'Spring polo', '', 'review', '2026-03-11 15:30:00')`).run();
  await automationTick(env, d);
  assert.deepEqual(rows(`SELECT person_id FROM p_notice ORDER BY person_id`).map(r => r.person_id), ['buyer@agency.example', 'guest@agency.example', 'maker@agency.example', 'owner@agency.example']);
  assert.equal((await call('GET', '/api/automations')).body.team_size, 4);
});
await ok('who does what: a role is set per brand, and a role nobody holds says so before and after', async () => {
  fresh(); await turnOn();
  setS('clientUsers', { 'pat@northlake.example': { brands: ['brand_northlake'] } });
  NOW = new Date('2026-03-11T15:00:00Z');
  const a = (await call('PUT', '/api/automations', { when: { type: 'card_status', status: 'review' }, tell: { who: [{ kind: 'role', role: 'buyer' }] }, state: 'on' })).body.automation;
  assert.ok(a.notes.some(x => /Nobody is set as the buyer yet/.test(x)));
  assert.equal((await call('PUT', '/api/automations/people', { roles: { brand_northlake: { buyer: 'pat@northlake.example' } } })).status, 400, 'a client cannot hold a role');
  const set = await call('PUT', '/api/automations/people', { roles: { brand_northlake: { buyer: 'Buyer@agency.example' } } });
  assert.equal(set.body.roles.brand_northlake.buyer, 'buyer@agency.example');
  assert.ok(set.body.team.some(p => p.email === 'buyer@agency.example'), 'a person with a role is on the team list');
  assert.ok((await call('GET', '/api/automations')).body.automations[0].notes.some(x => /for some brands/.test(x)));
  NOW = new Date('2026-03-11T16:00:00Z');
  db.prepare(`INSERT INTO p_br_batch VALUES ('c1', 'brand_northlake', 12, 'Spring polo', '', 'review', '2026-03-11 15:30:00')`).run();
  db.prepare(`INSERT INTO p_br_batch VALUES ('c2', 'brand_pinecrest', 3, 'Gift set', '', 'review', '2026-03-11 15:31:00')`).run();
  const r = await automationTick(env, d);
  assert.deepEqual(rows(`SELECT person_id, brand_id FROM p_notice ORDER BY brand_id`).map(x => x.person_id), ['buyer@agency.example', 'owner@agency.example']);
  assert.match(r.runs[1].why, /Nobody is set as the buyer for Pinecrest Candle, so its maker was told instead/);
  /* someone held to one brand cannot set a role on another, or for every brand */
  as('buyer@agency.example');
  const held = { ...d, brandsFor: async () => new Set(['brand_northlake']) };
  assert.equal((await callD(held, 'PUT', '/api/automations/people', { roles: { brand_pinecrest: { buyer: 'buyer@agency.example' } } })).status, 403);
  assert.equal((await callD(held, 'PUT', '/api/automations/people', { roles: { all: { buyer: 'buyer@agency.example' } } })).status, 403);
  assert.equal((await callD(held, 'PUT', '/api/automations/people', { team_add: ['new@agency.example'] })).status, 403, 'only the owner changes the team list');
});
await ok('a view only login reads automations and changes none of them', async () => {
  fresh(); await turnOn();
  const a = (await call('PUT', '/api/automations', { template: 'review_check', tell: { who: [{ kind: 'me' }] } })).body.automation;
  const dv = { ...d, roleFor: async (e, email) => (email === 'guest@agency.example' ? 'viewer' : 'admin') };
  as('guest@agency.example');
  assert.equal((await callD(dv, 'GET', '/api/automations')).body.can_edit, false);
  assert.equal((await callD(dv, 'PUT', '/api/automations', { template: 'review_check', state: 'on' })).status, 403);
  assert.equal((await callD(dv, 'PUT', '/api/automations', { id: a.id, state: 'on' })).status, 403);
  assert.equal((await callD(dv, 'DELETE', '/api/automations?id=' + a.id)).status, 403);
  assert.equal((await callD(dv, 'POST', '/api/automations/test', { automation: { template: 'review_check' } })).status, 403);
  assert.equal((await callD(dv, 'POST', '/api/automations/power', { on: false })).status, 403);
  assert.equal((await callD(dv, 'PUT', '/api/automations/people', { roles: { all: { buyer: 'guest@agency.example' } } })).status, 403);
  assert.deepEqual(rows(`SELECT state FROM p_automation`).map(r => r.state), ['draft']);
  assert.equal((await callD(dv, 'PUT', '/api/me/delivery', { delivery: { mode: 'mute' } })).status, 200, 'their own delivery choice is theirs');
  as('owner@agency.example');
  assert.equal((await callD(dv, 'PUT', '/api/automations', { id: a.id, state: 'on' })).status, 200);
});
await ok('a client is told only after a person says send, reads only the plain line, and lists only what tells it', async () => {
  fresh(); await turnOn(); slack.length = 0;
  setS('clientUsers', { 'pat@northlake.example': { brands: ['brand_northlake'] }, 'lee@pinecrest.example': { brands: ['brand_pinecrest'] } });
  const pat = { email: 'pat@northlake.example', ids: new Set(['brand_northlake']) };
  NOW = new Date('2026-03-11T15:00:00Z');
  await call('PUT', '/api/automations', { brand: 'brand_northlake', when: { type: 'metric', metric: 'mer', window: 'last7', compare: 'below', line: 'goal' }, do: [{ type: 'propose', change: 'pause' }], tell: { who: [{ kind: 'person', email: 'buyer@agency.example' }] }, state: 'on' });
  const withClient = { brand: 'brand_northlake', when: { type: 'card_status', status: 'ready' }, tell: { who: [{ kind: 'me' }, { kind: 'clients' }], text: 'Your new ads are ready to look at' }, state: 'on' };
  as('buyer@agency.example');
  assert.equal((await call('PUT', '/api/automations', withClient)).status, 403, 'only the owner puts a client into a sentence');
  assert.equal((await call('PUT', '/api/automations', { ...withClient, tell: { who: [{ kind: 'person', email: 'pat@northlake.example' }] } })).status, 403, 'a client typed in as a person is still a client');
  assert.equal((await call('POST', '/api/automations/test', { automation: withClient })).status, 200, 'a dry run reaches nobody, so anyone may try it');
  as('owner@agency.example');
  const a = (await call('PUT', '/api/automations', withClient)).body.automation;
  assert.ok(a.notes.some(x => /never told straight away/.test(x)));
  as('buyer@agency.example');
  assert.equal((await call('PUT', '/api/automations', { id: a.id, state: 'draft' })).status, 200, 'someone else may switch it off');
  assert.equal((await call('PUT', '/api/automations', { id: a.id, state: 'on' })).status, 403, 'and not back on');
  as('owner@agency.example'); await call('PUT', '/api/automations', { id: a.id, state: 'on' });
  /* How things reach me, as the client: one row, none of the team's words or emails */
  as('pat@northlake.example', pat);
  const dv = (await call('GET', '/api/me/delivery')).body;
  assert.equal(dv.per.length, 1); assert.equal(dv.per[0].automation_id, a.id); assert.equal(dv.per[0].name, 'A message from your team');
  assert.ok(!/agency\.example|MER|goal|pausing|When /.test(JSON.stringify(dv.per)));
  /* the event: a draft for the client, one row for the maker, nothing sent */
  as('owner@agency.example');
  NOW = new Date('2026-03-11T16:00:00Z');
  db.prepare(`INSERT INTO p_br_batch VALUES ('c5', 'brand_northlake', 41, 'Secret internal name', '', 'ready', '2026-03-11 15:30:00')`).run();
  const r = await automationTick(env, d);
  assert.match(r.runs[0].why, /pat@northlake\.example: A draft\. It reaches the client only when a person on the team says send/);
  const draft = rows(`SELECT * FROM p_notice WHERE person_id = 'pat@northlake.example'`);
  assert.equal(draft.length, 1); assert.equal(draft[0].state, 'draft'); assert.equal(draft[0].title, 'Your new ads are ready to look at');
  assert.equal(rows(`SELECT * FROM p_notice WHERE person_id = 'lee@pinecrest.example'`).length, 0, 'not another brand\'s client');
  as('pat@northlake.example', pat);
  assert.equal((await call('GET', '/api/notices')).body.bell.length, 0, 'the client sees nothing yet');
  assert.equal((await call('POST', '/api/notices/done', { id: draft[0].id })).status, 404);
  as('owner@agency.example');
  const ask = (await call('GET', '/api/notices')).body.home.find(x => x.kind === 'release');
  assert.match(ask.body, /"Your new ads are ready to look at" would go to pat@northlake\.example/);
  const dv2 = { ...d, roleFor: async () => 'viewer' };
  assert.equal((await callD(dv2, 'POST', '/api/notices/done', { id: ask.id, answer: 'send' })).status, 403, 'a view only login cannot send to a client');
  assert.deepEqual((await call('POST', '/api/notices/done', { id: ask.id, answer: 'send' })).body.sent_to, ['pat@northlake.example']);
  assert.equal((await call('POST', '/api/notices/done', { id: ask.id, answer: 'send' })).status, 409);
  as('pat@northlake.example', pat);
  const bell = (await call('GET', '/api/notices')).body.bell;
  assert.equal(bell.length, 1);
  assert.deepEqual(Object.keys(bell[0]).sort(), ['brand_id', 'created_at', 'done_at', 'held_until', 'home', 'id', 'kind', 'state', 'title'], 'no button, no ids, no record of who sent it');
  assert.ok(!/Secret internal name|agency\.example|run_id|automation_id/.test(JSON.stringify(bell)));
  assert.equal(slack.length, 0);
  /* "no" drops it for good */
  as('owner@agency.example');
  db.prepare(`INSERT INTO p_br_batch VALUES ('c6', 'brand_northlake', 42, 'Another', '', 'ready', '2026-03-11 16:30:00')`).run();
  NOW = new Date('2026-03-11T17:00:00Z'); await automationTick(env, d);
  const ask2 = (await call('GET', '/api/notices')).body.home.find(x => x.kind === 'release');
  await call('POST', '/api/notices/done', { id: ask2.id, answer: 'no' });
  as('pat@northlake.example', pat);
  assert.equal((await call('GET', '/api/notices')).body.bell.length, 1);
  NOW = new Date('2026-03-11T16:00:00Z');
});
await ok('nobody is told about a brand they may not see, not in the app and not in Slack', async () => {
  fresh(); await turnOn(); slack.length = 0;
  setS('userPrefs:contractor@agency.example', {});
  as('contractor@agency.example');
  await call('PUT', '/api/me/delivery', { delivery: { ways: { home: true, slack: true } } });
  as('owner@agency.example');
  NOW = new Date('2026-03-11T15:00:00Z');
  await call('PUT', '/api/automations', { when: { type: 'card_status', status: 'review' }, tell: { who: [{ kind: 'team' }] }, state: 'on' });
  const dd = { ...d, brandsFor: async (e, email) => (email === 'contractor@agency.example' ? new Set(['brand_northlake']) : null) };
  NOW = new Date('2026-03-11T16:00:00Z');
  db.prepare(`INSERT INTO p_br_batch VALUES ('c2', 'brand_pinecrest', 3, 'Gift set', '', 'review', '2026-03-11 15:31:00')`).run();
  const r = await automationTick(env, dd);
  assert.equal(slack.length, 0, 'no Slack DM left the building');
  assert.deepEqual(rows(`SELECT person_id FROM p_notice`).map(x => x.person_id), ['owner@agency.example']);
  assert.match(r.runs[0].why, /contractor@agency\.example: May not see Pinecrest Candle, so they were not told/);
  db.prepare(`INSERT INTO p_br_batch VALUES ('c1', 'brand_northlake', 12, 'Spring polo', '', 'review', '2026-03-11 16:30:00')`).run();
  NOW = new Date('2026-03-11T17:00:00Z'); await automationTick(env, dd);
  assert.equal(slack.filter(s => s[0] === 'chat.postMessage').length, 1, 'their own brand still reaches them');
  NOW = new Date('2026-03-11T16:00:00Z');
});
await ok('small things: quiet hours across midnight, last Monday, bracket slots', () => {
  assert.equal(_test.inQuiet({ quiet_from: 19, quiet_to: 5 }, 23), true); assert.equal(_test.inQuiet({ quiet_from: 19, quiet_to: 5 }, 12), false);
  assert.equal(_test.lastMonday('2026-03-11'), '2026-03-02'); assert.equal(_test.lastMonthStart('2026-03-11'), '2026-02-01');
  assert.deepEqual(_test.bracketParts('When [3 hours] pass.').map(p => p.t), ['text', 'slot', 'text']);
});

await new Promise(r => setTimeout(r, 0));
console.log(process.exitCode ? 'test-automations: FAILED' : `test-automations: ${n} checks passed`);

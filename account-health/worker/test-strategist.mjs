/* Offline checks for the Strategist's 2026-10-07 additions (src/strategist.js): the tests / brief /
 * customers / scenarios / brain views, the Asana brief actions, the builders and draft_from_thread.
 * Same shape as test-ideas.mjs: in-memory SQLite for D1, Asana and Slack mocked, no secrets.
 *   node test-strategist.mjs      (from account-health/worker)
 */
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..', '..');
const db = new DatabaseSync(':memory:');
const load = f => { for (const st of fs.readFileSync(f, 'utf8').replace(/--[^\n]*/g, '').split(/;\s*(?:\n|$)/)) { try { if (st.trim()) db.exec(st); } catch { /* re-applied ALTER */ } } };
load(path.join(here, 'schema.sql'));
for (const f of ['brand-001.sql', 'brand-002.sql', 'brand-003.sql', 'brand-004.sql', 'amb-001.sql', 'amb-002.sql', 'studio-001.sql', 'studio-002.sql', 'scenario-001.sql'])
  load(path.join(root, 'profit', 'worker', 'migrations', f));
db.exec(`CREATE TABLE IF NOT EXISTS tw_orders (act_id TEXT NOT NULL, order_id TEXT NOT NULL, customer_id TEXT, date TEXT NOT NULL, total REAL NOT NULL DEFAULT 0, currency TEXT, products_json TEXT, source TEXT, synced_at TEXT NOT NULL DEFAULT (datetime('now')), PRIMARY KEY (act_id, order_id))`);
const bindSql = sql => sql.replace(/\?(\d+)/g, (_, n) => ':p' + n);
const vals = a => Object.fromEntries(a.map((v, i) => ['p' + (i + 1), v === undefined ? null : typeof v === 'boolean' ? +v : v]));
const DB = {
  prepare(sql) {
    let args = [];
    const st = () => db.prepare(bindSql(sql));
    return { bind(...a) { args = a; return this; }, async first() { return st().get(vals(args)) || null; },
      async all() { return { results: st().all(vals(args)) }; }, async run() { const r = st().run(vals(args)); return { meta: { changes: r.changes } }; } };
  },
};

/* ---------------- fixtures ---------------- */
const LUCKY = 'act_378146126054294';
db.exec(`INSERT INTO accounts (act_id, name, active, currency, tz, slack_channel) VALUES ('${LUCKY}', 'Lucky Golf', 1, 'USD', 'America/Chicago', 'C_LUCKY')`);
db.exec(`INSERT INTO p_br_doc (act_id, line_id, key, data_json) VALUES ('${LUCKY}', '', 'asana', '{"project_gid":"P1","workspace":"W1"}')`);
db.exec(`INSERT INTO p_br_angle (id, act_id, name, argument, status) VALUES ('ang_look', '${LUCKY}', 'The look', 'Golfers notice your gear before your game. The Carver is the wedge that gets asked about.', 'active'),
  ('ang_short', '${LUCKY}', 'Short game', 'A longer drive will not lower your score. A better short game will.', 'active')`);
db.exec(`INSERT INTO p_br_batch (id, act_id, num, title, angle_id, level, stage, verdict, learning, asana_gid, asana_url, brief_text) VALUES
  ('b395', '${LUCKY}', '395', 'Gold Carver statics', 'ang_look', 'concept', 'done', 'winner', 'The gold finish stops the scroll on its own.', 'T395', 'https://app.asana.com/t395', 'Angle: the look'),
  ('b396', '${LUCKY}', '396', 'Short game scorecard', 'ang_short', 'angle', 'live', NULL, NULL, 'T396', 'https://app.asana.com/t396', 'Angle: short game'),
  ('b397', '${LUCKY}', '397', 'Tour quality, honest price', NULL, NULL, 'idea', NULL, NULL, 'T397', 'https://app.asana.com/t397', NULL)`);
db.exec(`INSERT INTO settings (key, value) VALUES ('brandAsanaFields', '{"testing":"F_TEST","testing_opts":{"angle":"O_ANGLE","concept":"O_CONCEPT","variation":"O_VAR"}}')`);
/* Four customers: two one-timers, one who came back in 20 days, one who came back twice. */
const o = (id, cust, date, total, prods, source) => db.exec(`INSERT INTO tw_orders (act_id, order_id, customer_id, date, total, products_json, source) VALUES ('${LUCKY}', '${id}', '${cust}', '${date}', ${total}, '${prods}', '${source}')`);
o('o1', 'c1', '2026-07-01', 99, '["wedge"]', 'meta'); o('o2', 'c2', '2026-07-03', 229, '["putter"]', 'google');
o('o3', 'c3', '2026-07-05', 99, '["wedge"]', 'meta'); o('o4', 'c3', '2026-07-25', 229, '["putter"]', 'organic');
o('o5', 'c4', '2026-08-01', 99, '["wedge"]', 'meta'); o('o6', 'c4', '2026-09-10', 67, '["polo"]', 'organic'); o('o7', 'c4', '2026-09-30', 229, '["putter"]', 'meta');

/* ---------------- mocks ---------------- */
const asanaCalls = [];
const tasks = { T397: { gid: 'T397', name: '397 - Tour quality, honest price', notes: 'The test\nAngle:\nWhy:\nWhat we\'re testing:\n1.\n2.\n3.\nCopy\nHeadline:\nPrimary text:\nOffer:\nLanding page: https://luckygolf.com/carver\nInspo:', completed: false, permalink_url: 'https://app.asana.com/t397', assignee: null, memberships: [{ section: { name: 'Creative Briefs', gid: 'S1' } }], custom_fields: [{ name: 'Angle', display_value: 'Tour quality, honest price' }] } };
const mockFetch = async (url, init = {}) => {
  const u = new URL(url), p = u.pathname.replace('/api/1.0', '');
  const body = init.body ? JSON.parse(init.body).data : null;
  asanaCalls.push({ method: init.method || 'GET', path: p, body });
  const json = data => new Response(JSON.stringify({ data }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  if (p === '/users') return json([{ gid: 'U_AHSAN', name: 'Ahsan Abidi' }, { gid: 'U_NOMA', name: 'Noma' }]);
  if (p === '/projects/P1/sections') return json([{ gid: 'S1', name: 'Creative Briefs' }, { gid: 'S2', name: 'Creative Studio' }]);
  if (p === '/tasks' && (init.method || 'GET') === 'GET') return json([{ gid: 'T397', name: '397 - Tour quality, honest price' }, { gid: 'T398', name: '398 - Something else' }]);
  if (p === '/tasks' && init.method === 'POST') { tasks.T399 = { gid: 'T399', name: body.name, permalink_url: 'https://app.asana.com/t399', notes: body.notes || '' }; return json(tasks.T399); }
  const m = p.match(/^\/tasks\/(\w+)$/);
  if (m && (init.method || 'GET') === 'GET') return tasks[m[1]] ? json(tasks[m[1]]) : new Response(JSON.stringify({ errors: [{ message: 'Not Found' }] }), { status: 404 });
  if (m && init.method === 'PUT') { Object.assign(tasks[m[1]], body); return json(tasks[m[1]]); }
  if (/^\/sections\/\w+\/addTask$/.test(p)) return json({});
  return new Response(JSON.stringify({ errors: [{ message: 'unmocked ' + p }] }), { status: 404 });
};
const asanaBrand = await import('./src/asana-brand.js');
asanaBrand.useFetch(mockFetch);
const ideas = await import('./src/ideas.js');
const queued = [];
const env = { DB, ASANA_TOKEN: 'test', SLACK_BOT_TOKEN: 'xoxb', IDEA_Q: { send: async j => { queued.push(j); } } };
/* ideaStart adds an eyes reaction through ideas.js's own slack(); point its fetch at a no-op. */
ideas.useFetch(async () => new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'Content-Type': 'application/json' } }));

const strat = await import('./src/strategist.js');
const d = {
  getSetting: async (env, k) => { const r = await env.DB.prepare('SELECT value FROM settings WHERE key = ?1').bind(k).first(); try { return r?.value ? JSON.parse(r.value) : null; } catch { return r?.value ?? null; } },
  putSetting: async (env, k, v) => env.DB.prepare('INSERT INTO settings (key, value) VALUES (?1, ?2) ON CONFLICT(key) DO UPDATE SET value = excluded.value').bind(k, typeof v === 'string' ? v : JSON.stringify(v)).run(),
  safeJson: (s, fb) => { try { return s ? JSON.parse(s) : fb; } catch { return fb; } },
  listAccounts: async env => (await env.DB.prepare('SELECT * FROM accounts').all()).results,
  overview: async () => [], briefData: async () => ({}), dataHealth: async () => ({}), storePeriod: async () => ({}),
  localDate: () => '2026-10-07', addDays: (ymd, n) => { const x = new Date(`${ymd}T12:00:00Z`); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); },
  ymdDiff: () => 0, daysInMonth: () => 31, briefHour: async () => 7, slack: async () => ({ ok: true }), claude: async () => '',
  closeThread: async (env, ch, ts) => { closed.push(`${ch}:${ts}`); },
};
const closed = [];
const { engine, views } = strat.buildStrategist(d);
const view = (name, args = {}) => views.appView(env, name, args);

const checks = [];
async function check(name, fn) { try { await fn(); checks.push({ name, pass: true }); console.log('PASS ', name); } catch (e) { checks.push({ name, pass: false, error: e.message }); console.log('FAIL ', name, '\n      ' + e.message); } }

await check('tests view: the library newest first, a search finds the argument in other words', async () => {
  const all = await view('tests', { brand: 'Lucky' });
  assert.equal(all.tests[0].num, '397'); assert.equal(all.tests.length, 3);
  assert.equal(all.angles.find(a => a.name === 'The look').won, 1);
  const q = await view('tests', { brand: 'Lucky Golf', q: 'gets asked about' });
  assert.equal(q.tests.length, 1); assert.equal(q.tests[0].num, '395'); assert.equal(q.angles.length, 1);
  const none = await view('tests', { brand: 'Lucky Golf', q: 'left handed' });
  assert.equal(none.tests.length, 0); assert.equal(none.angles.length, 0);
});
await check('brief view: the Locus row plus the live Asana task, with the blank template lines named', async () => {
  const r = await view('brief', { brand: 'Lucky', number: 397 });
  assert.equal(r.locus.title, 'Tour quality, honest price');
  assert.equal(r.asana.section, 'Creative Briefs'); assert.equal(r.asana.fields.Angle, 'Tour quality, honest price');
  assert.deepEqual(r.asana.template_blanks, ['Angle', 'Why', "What we're testing", 'Headline', 'Primary text', 'Offer', 'Inspo']);
  /* appView turns a thrown error into text for the model. */
  const miss = await view('brief', { brand: 'Lucky', number: 900 }).then(x => JSON.stringify(x), e => e.message);
  assert.match(miss, /No brief 900/);
});
await check('customers view: repeat rate, order number, time to second order, sources, carts', async () => {
  const r = await view('customers', { brand: 'Lucky', days: 365 });
  assert.equal(r.totals.customers, 4); assert.equal(r.totals.orders, 7);
  assert.equal(r.repeat.repeat_customers, 2); assert.equal(r.repeat.repeat_rate, 50);
  assert.deepEqual(r.by_order_number.map(x => [x.order_no, x.orders]), [['1', 4], ['2', 2], ['3+', 1]]);
  assert.deepEqual(r.days_to_second_order.buckets.map(x => [x.bucket, x.customers]), [['b. 15-30', 1], ['c. 31-60', 1]]);
  assert.equal(r.first_order_sources[0].source, 'meta'); assert.equal(r.first_order_sources[0].first_orders, 3);
  assert.equal(r.products_in_first_cart[0].product_id, 'wedge'); assert.equal(r.products_in_second_cart[0].product_id, 'putter');
});
await check('scenarios view and build_scenario: the math reads right, apply saves and gives the share link', async () => {
  const a = strat._test.BUILD_ACTIONS(d).find(x => x.name === 'build_scenario');
  const p = await a.propose(env, { brand: 'Lucky', kind: 'leads', name: 'Giveaway at $3', inputs: { spend: 20000, cpl: '3', cvr: 8, aov: 150, margin: 55, target: 3 }, note: 'AOV from the store view', summary: 'Scenario' });
  assert.ok(!p.error, p.error); assert.match(p.detail, /6667 leads/); assert.match(p.detail, /533 orders/);
  const r = await a.apply(env, p.patch);
  assert.match(r.note, /share\.html\?s=sc_[0-9a-f]{10}/);
  const list = await view('scenarios', { brand: 'Lucky' });
  assert.equal(list.scenarios.length, 1); assert.equal(list.scenarios[0].inputs.cpl, 3); assert.match(list.scenarios[0].url, /sc_/);
  const bad = await a.propose(env, { brand: 'Lucky', kind: 'leads', name: 'x', inputs: { spend: 100 }, summary: 's' });
  assert.match(bad.error, /needs spend and cpl/);
});
await check('fill_brief: finds task 397, writes the approved words in the template, lists the blanks, sets Testing and the assignee', async () => {
  const a = strat._test.ASANA_ACTIONS(d).find(x => x.name === 'fill_brief');
  const input = { brand: 'Lucky Golf', number: 397, title: 'The wedge that gets asked about', kind: 'video', test_type: 'concept',
    angle: 'Golfers notice your gear before your game. The Carver is the wedge that gets asked about.', why: 'Our guy likes having the thing nobody else has. Look ads already win on this account.',
    testing: '3 concepts, 1 ad each. Headlines get tested later.', ads: ['1. The pass: camera goes along the foursome\'s chrome wedges and stops on the Carver. Headline: The wedge that gets asked about.', 'Comment reply: answer a real "what wedge is that?" comment on camera.', 'Review static: "You don\'t even have to take it out of the bag and people ask you about it." (real review)'],
    guardrails: ['No news style (batch 2 has it)', 'Nothing that hints tour players use it'], landing_page: 'https://luckygolf.com/carver', assignee: 'Ahsan', summary: 'Fill in 397' };
  const p = await a.propose(env, input);
  assert.ok(!p.error, p.error);
  assert.match(p.detail, /assigned to Ahsan Abidi/); assert.match(p.detail, /Still blank: Headline, Primary text, Offer, Inspo, Creator, Script/);
  assert.match(p.preview, /^Filled in by the Strategist/m); assert.match(p.preview, /1\. The pass: camera/); assert.doesNotMatch(p.preview, /1\. 1\./);
  assert.equal(p.patch.name, '397 - The wedge that gets asked about'); assert.equal(p.patch.testing_opt, 'O_CONCEPT');
  asanaCalls.length = 0;
  const r = await a.apply(env, p.patch);
  assert.match(r.note, /Brief 397 is filled in: https:\/\/app.asana.com\/t397/);
  const put = asanaCalls.find(c => c.method === 'PUT' && c.path === '/tasks/T397');
  assert.ok(put.body.html_notes.includes('<h2>Video</h2>')); assert.ok(put.body.html_notes.includes('Keep in mind:')); assert.equal(put.body.assignee, 'U_AHSAN'); assert.equal(put.body.name, '397 - The wedge that gets asked about');
  assert.ok(asanaCalls.some(c => c.path === '/tasks/T397' && c.body?.custom_fields?.F_TEST === 'O_CONCEPT'));
  const missing = await a.propose(env, { ...input, number: 950 });
  assert.match(missing.error, /No open task numbered 950/);
  const who = await a.propose(env, { ...input, assignee: 'Viktor' });
  assert.match(who.error, /No Asana user called "Viktor"/);
});
await check('create_brief: next free number, Creative Briefs section, the task is made and placed', async () => {
  const a = strat._test.ASANA_ACTIONS(d).find(x => x.name === 'create_brief');
  const p = await a.propose(env, { brand: 'Lucky', title: 'Short game showdown', kind: 'static', test_type: 'angle', angle: 'A longer drive will not lower your score.', why: 'Mid handicappers lose strokes inside 100 yards.', testing: '3 new concepts', ads: ['Scorecard with every stroke inside 100 yards circled', 'Side by side: 20 yards vs better chipping', 'Showdown: long hitter vs short game guy'], summary: 'New brief' });
  assert.ok(!p.error, p.error);
  assert.equal(p.patch.num, 399); assert.equal(p.patch.name, '399 - Short game showdown'); assert.equal(p.patch.section_gid, 'S1'); assert.equal(p.patch.testing_opt, 'O_ANGLE');
  asanaCalls.length = 0;
  const r = await a.apply(env, p.patch);
  assert.match(r.note, /Brief 399 is in Asana: https:\/\/app.asana.com\/t399/);
  assert.ok(asanaCalls.some(c => c.method === 'POST' && c.path === '/tasks' && c.body.name === '399 - Short game showdown' && c.body.projects[0] === 'P1'));
  assert.ok(asanaCalls.some(c => c.path === '/sections/S1/addTask'));
});
await check('studio_batch: a draft batch lands in p_studio_batch in the brief shape', async () => {
  const a = strat._test.BUILD_ACTIONS(d).find(x => x.name === 'studio_batch');
  const p = await a.propose(env, { brand: 'Lucky', name: 'Gold Carver headlines', num: '395', angle: 'The look', why: 'Look ads win', concept: 'Gold Carver on black', testing: 'headlines', lines: ['The wedge that gets asked about', 'Nobody in your foursome has this one', 'Gold. On purpose.'], summary: 'Studio' });
  assert.ok(!p.error, p.error); assert.match(p.detail, /3 ads, testing headlines/);
  await a.apply(env, p.patch);
  const row = db.prepare(`SELECT * FROM p_studio_batch WHERE act_id = '${LUCKY}'`).get();
  assert.equal(row.num, '395'); assert.equal(row.status, 'draft');
  const brief = JSON.parse(row.brief_json); assert.equal(brief.testing, 'headlines'); assert.equal(brief.lines.length, 3); assert.equal(brief.lines[2].text, 'Gold. On purpose.');
});
await check('draft_from_thread: Slack only; closes the Strategist thread and queues the idea job with "idea" in the tag', async () => {
  const t = strat._test.SLACK_TOOLS(d)[0];
  assert.equal(t.def.name, 'draft_from_thread');
  const no = await t.run(env, {}, {});
  assert.equal(no.is_error, true);
  const r = await t.run(env, { steer: 'for Asana, 3 statics' }, { ev: { channel: 'C_LUCKY', thread_ts: '100.1', ts: '100.5', user: 'U_AHSAN', text: '<@U_BOT> make ads from this' } });
  assert.ok(!r.is_error, r.text);
  assert.deepEqual(closed, ['C_LUCKY:100.1']);
  assert.equal(queued.length, 1); assert.equal(queued[0].root, '100.1'); assert.match(queued[0].text, /idea for Asana, 3 statics/);
});
await check('integrations view: agency list with fixes, per-brand items graded, missing tables tolerated', async () => {
  const r = await view('integrations', { brand: 'Lucky' });
  /* ASANA_TOKEN is set, but the test's brandAsanaFields has no workspace: token present, fields not made = warn. */
  assert.equal(r.agency.find(a => a.key === 'asana').state, 'warn'); assert.match(r.agency.find(a => a.key === 'asana').note, /fields not created/);
  assert.equal(r.agency.find(a => a.key === 'tw').state, 'off'); assert.match(r.agency.find(a => a.key === 'tw').fix, /TW_API_KEY/);
  assert.equal(r.brands.length, 1);
  const by = Object.fromEntries(r.brands[0].items.map(i => [i.key, i]));
  assert.equal(by.asana.state, 'warn'); assert.match(by.asana.note, /no webhook/);
  assert.equal(by.slack_internal.state, 'ok'); assert.equal(by.slack_client.state, 'off');
  assert.equal(by.tw.state, 'off'); assert.equal(by.shopify.state, 'off'); assert.equal(by.drive.state, 'off');
  assert.match(r.how_to_read, /ok, warn/);
});
await check('the engine lists every new action and the brain view is part-wise', async () => {
  for (const n of ['fill_brief', 'create_brief', 'build_scenario', 'studio_batch', 'create_angles']) assert.ok(engine.actions.includes(n), n);
  for (const v of ['tests', 'brief', 'customers', 'scenarios', 'brain']) assert.ok(views.appViews().includes(v), v);
  const b = await view('brain', { brand: 'Lucky', part: 1 });
  assert.equal(b.part, 1); assert.ok(b.parts >= 1);
});
await check('brief html: a given field is written, a missing one stays a bare label, numbering is not doubled', () => {
  const html = strat._test.briefNotesHtml({ angle: 'A', why: 'B', testing: '3 concepts', ads: ['2. second', 'third'], kind: 'static', headline: 'H' }, { num: 5, by: 'Test', inspo: ['https://x.y/z'] });
  assert.ok(html.includes('<strong>Headline:</strong> H')); assert.ok(html.includes('<strong>Offer:</strong> </strong>') === false);
  assert.ok(html.includes('<strong>1.</strong> second')); assert.ok(html.includes('<strong>2.</strong> third')); assert.ok(html.includes('<a href="https://x.y/z">'));
  assert.deepEqual(strat._test.BRIEF_BLANKS({ kind: 'video', headline: 'H', inspo: ['u'] }), ['Primary text', 'Offer', 'Landing page', 'Creator', 'Script']);
  assert.ok(!html.includes('2014'), 'no em dash');
});

const failed = checks.filter(c => !c.pass);
console.log(`\n${checks.length - failed.length}/${checks.length} passed`);
process.exit(failed.length ? 1 : 0);

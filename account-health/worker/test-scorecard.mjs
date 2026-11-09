/* Offline checks for the TEAM SCORECARD (2026-11-09, src/agency.js scorecard / saveRating). Drives the REAL account-health
 * worker in node against an in-memory SQLite (node:sqlite), Asana mocked through fetch. Same harness as test-agency.mjs.
 *   node test-scorecard.mjs            (from account-health/worker)
 *   node test-scorecard.mjs --print    also prints one person's answer, the sample in the PR
 */
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..', '..');

/* ---------------- database ---------------- */
const db = new DatabaseSync(':memory:');
const bindSql = sql => sql.replace(/\?(\d+)/g, (_, n) => ':p' + n);
const vals = a => Object.fromEntries(a.map((v, i) => ['p' + (i + 1), v === undefined ? null : typeof v === 'boolean' ? +v : v]));
const stmt = sql => { let args = []; const st = () => db.prepare(bindSql(sql)); return { bind(...a) { args = a; return this; }, async first() { return st().get(vals(args)) || null; }, async all() { return { results: st().all(vals(args)) }; }, async run() { const r = st().run(vals(args)); return { meta: { changes: r.changes } }; } }; };
const DB = { prepare: stmt, async batch(list) { const out = []; for (const s of list) out.push(await s.run()); return out; } };
const load = f => { for (const st of fs.readFileSync(f, 'utf8').replace(/--[^\n]*/g, '').split(/;\s*(?:\n|$)/)) { try { if (st.trim()) db.exec(st); } catch { /* re-applied */ } } };
load(path.join(root, 'profit', 'worker', 'schema.sql'));
for (const f of ['brand-001.sql', 'brand-002.sql', 'brand-003.sql', 'brand-004.sql', 'brand-005.sql']) load(path.join(root, 'profit', 'worker', 'migrations', f));
load(path.join(root, 'profit', 'worker', 'migrations', 'team-001.sql'));
load(path.join(here, 'schema.sql'));
db.exec(`CREATE TABLE IF NOT EXISTS tw_ad_attr (act_id TEXT, ad_id TEXT, date TEXT, model TEXT, revenue REAL, orders REAL)`);

const central = (d = new Date()) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
const addDays = (ymd, n) => { const d = new Date(ymd + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const TODAY = central();
const MON = addDays(TODAY, -((new Date(TODAY + 'T12:00:00Z').getUTCDay() + 6) % 7));
const NOW = `${TODAY}T17:00:00.000Z`, NOW_SQL = `${TODAY} 17:00:00`;   // noon Central, both ways the tables store time
const LONG_AGO = `${addDays(TODAY, -80)} 17:00:00`;

db.exec(`INSERT INTO brands (id, slug, name, status, currency, tz, source, legacy_key) VALUES
  ('brand_alpha', 'alpha', 'Alpha Golf', 'active', 'USD', 'America/Chicago', 'locus', 'act_111'),
  ('brand_beta', 'beta', 'Beta Socks', 'active', 'USD', 'America/Chicago', 'locus', NULL)`);
db.exec(`INSERT INTO connections (id, brand_id, kind, external_id, is_primary, source, label) VALUES
  ('meta:act_111', 'brand_alpha', 'meta', 'act_111', 1, 'locus', NULL), ('meta:act_222', 'brand_beta', 'meta', 'act_222', 1, 'locus', NULL),
  ('asana:P1', 'brand_alpha', 'asana', 'P1', 1, 'locus', 'Alpha project'), ('asana:P2', 'brand_beta', 'asana', 'P2', 1, 'locus', 'Beta project')`);
db.exec(`INSERT INTO p_season_answer (act_id, season, key, value) VALUES ('brand_beta', '2026', 'strategist', 'Noma (Nomaqhawe)')`);
const setSetting = (k, v) => db.prepare(`INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`).run(k, JSON.stringify(v));
setSetting('agencyPeople', { 1201: { name: 'Ravo', cost: 4000, hours: 160 }, 1202: { name: 'Ahsan Ali', cost: 3000, hours: 160 } });
setSetting('clientUsers', { 'nick@alpha.com': { brands: ['brand_alpha'], name: 'Nick' } });

/* ---------------- tokens and mocks ---------------- */
const SECRET = 'test-session-secret';
const b64u = b => Buffer.from(b).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const mint = email => { const p = b64u(`${email}|${Date.now() + 3600e3}`); return `mds.${p}.${b64u(crypto.createHmac('sha256', SECRET).update(p).digest())}`; };
const CLIENT = mint('nick@alpha.com'), TEAM = mint('ahsan@go-mobius-digital.com'), OWNER = mint('cole@go-mobius-digital.com');

const task = (gid, who, name, at, completed = true) => ({ gid, name: 'task ' + gid, completed, completed_at: completed ? at : null, modified_at: at, assignee: who ? { gid: who, name } : null, permalink_url: `https://app.asana.com/0/P/${gid}` });
const ASANA = {
  P1: [task('t1', '1301', 'William Sampindi', NOW), task('t2', '1201', 'Ravo Schubert', NOW, false), task('t3', '1202', 'Ahsan Ali', `${addDays(TODAY, -60)}T15:00:00.000Z`), task('t4', '9999', 'Some Client', NOW)],
  P2: [task('u1', '1202', 'Ahsan Ali', NOW)],
};
let asanaCalls = 0;
globalThis.fetch = async (url) => {
  const u = String(url?.url || url);
  const m = u.match(/^https:\/\/app\.asana\.com\/api\/1\.0\/projects\/(P\d)\/tasks\?(.*)$/);
  if (m) { asanaCalls++; return new Response(JSON.stringify({ data: ASANA[m[1]], next_page: null }), { status: 200 }); }
  return new Response(JSON.stringify({ error: 'offline: ' + u }), { status: 503 });
};

process.env.TZ = process.env.TZ || 'UTC';
const AH = (await import('./src/worker.js')).default;
const { whoIs, teamBook, periodOf, dayOf } = await import('./src/agency.js');
const { ensureWork } = await import('./src/prodwork.js');
const { ensureActions } = await import('./src/actions.js');
const { LAUNCH_SQL } = await import('./src/launch.js');
const env = { DB, SESSION_SECRET: SECRET, ASANA_TOKEN: 'asana-test' };
await ensureWork(env); await ensureActions(env); db.exec(LAUNCH_SQL);

/* Cards. 501: Ahsan's winner, enough spend. 502: William's, reached Ready a day after its due date. 503: a thin loser on Beta
   (no spend), assignee the designer, so the brand strategist (Noma) is credited. 504: a real loser on Beta, also Noma's.
   505: William's card still in Making, due 3 days before Monday (late in the 4-week view). 506: judged 80 days ago. */
const card = (id, act, num, who, board, extra = {}) => db.prepare(`INSERT INTO p_br_batch (id, act_id, num, title, stage, board_stage, board_at, assignee_name, due_on, approved_at, verdict, verdict_at, asana_url)
  VALUES (:id, :act, :num, :title, :stage, :board, :board_at, :who, :due, :appr, :verdict, :vat, :url)`).run({ id, act, num, title: 'Test ' + num, stage: board === 'live' ? 'live' : 'production', board, board_at: NOW_SQL, who,
  due: null, appr: null, verdict: null, vat: null, url: 'https://app.asana.com/0/P/' + id, ...extra });
card('c1', 'brand_alpha', '501', 'Ahsan Ali', 'live', { due: addDays(TODAY, 1), appr: NOW, verdict: 'winner', vat: NOW_SQL });
card('c2', 'brand_alpha', '502', 'William Sampindi', 'ready', { due: addDays(TODAY, -1) });
card('c3', 'brand_beta', '503', 'William Sampindi', 'live', { board_at: LONG_AGO, verdict: 'loser', vat: NOW_SQL });
card('c4', 'brand_beta', '504', 'Ravo', 'live', { board_at: LONG_AGO, verdict: 'loser', vat: NOW_SQL });
card('c5', 'brand_alpha', '505', 'William Sampindi', 'making', { board_at: LONG_AGO, due: addDays(MON, -3) });
card('c6', 'brand_alpha', '506', 'Ahsan Ali', 'live', { board_at: LONG_AGO, verdict: 'loser', vat: LONG_AGO });
db.exec(`INSERT INTO ads (act_id, ad_id, name) VALUES ('act_111', 'ad1', '501 A | Still'), ('act_222', 'ad4', '504 B | Video')`);
db.exec(`INSERT INTO ad_daily (act_id, ad_id, date, spend, impressions, link_clicks) VALUES ('act_111', 'ad1', '${addDays(TODAY, -9)}', 500, 10000, 100), ('act_222', 'ad4', '${addDays(TODAY, -9)}', 400, 9000, 80)`);
db.exec(`INSERT INTO p_work_file (id, batch_id, act_id, kind, version, r2_key, name, by_email, by_name, created_at) VALUES
  ('f1', 'c2', 'brand_alpha', 'version', 1, 'k1', '502 A.png', 'william@go-mobius-digital.com', 'William', '${NOW_SQL}'),
  ('f2', 'c4', 'brand_beta', 'version', 2, 'k2', '504 B.mp4', 'schubertchannel123@gmail.com', 'Ravo', '${NOW_SQL}'),
  ('f3', 'c4', 'brand_beta', 'version', 3, 'k3', 'gone.mp4', 'schubertchannel123@gmail.com', 'Ravo', '${NOW_SQL}')`);
db.exec(`UPDATE p_work_file SET deleted_at = '${NOW_SQL}' WHERE id = 'f3'`);
db.exec(`INSERT INTO p_work_comment (id, batch_id, act_id, author_email, author_name, author_role, body, kind, file_id, created_at) VALUES
  ('m1', 'c2', 'brand_alpha', 'cole@go-mobius-digital.com', 'Cole', 'team', 'Logo is too small', 'change_request', 'f1', '${NOW_SQL}'),
  ('m2', 'c2', 'brand_alpha', 'nick@alpha.com', 'Nick', 'client', 'Use the blue one', 'change_request', NULL, '${NOW_SQL}'),
  ('m3', 'c4', 'brand_beta', 'cole@go-mobius-digital.com', 'Cole', 'team', '', 'approval', 'f2', '${NOW_SQL}'),
  ('m4', 'c4', 'brand_beta', 'cole@go-mobius-digital.com', 'Cole', 'team', 'just a note', 'note', 'f2', '${NOW_SQL}')`);
db.exec(`INSERT INTO p_launch (id, act, meta_act, source, ad_id, ad_name, adset_name, by, at) VALUES
  ('l1', 'brand_alpha', 'act_111', 'production', 'ad1', '501 A | Still', 'Test 501', 'cole@go-mobius-digital.com', '${NOW}'),
  ('l2', 'brand_alpha', 'act_111', 'studio', 'ad9', '507 A | Still', 'Test 507', 'Claude Code (Cole)', '${NOW}'),
  ('l3', 'brand_alpha', 'act_111', 'studio', 'ad8', '508 A | Still', 'Test 508', 'someone in Locus', '${NOW}')`);
db.exec(`INSERT INTO p_action (id, act_id, text, owner, due, status, done_at, done_by, created_at) VALUES
  ('a1', 'brand_alpha', 'Send the Alpha recap', 'Ahsan', '${TODAY}', 'done', '${NOW}', 'ahsan@go-mobius-digital.com', '${NOW}'),
  ('a2', '', 'Fix the Amazon listing', 'Hamza', '${addDays(MON, -3)}', 'open', NULL, NULL, '${NOW}'),
  ('a3', 'brand_beta', 'Google search terms', '', '', 'done', '${NOW}', 'Radhesh', '${NOW}')`);

const ctx = { waitUntil() {} };
const call = async (tok, method, p, body) => {
  const res = await AH.fetch(new Request(`https://ah.test${p}`, { method, headers: { ...(tok ? { Authorization: 'Bearer ' + tok } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) }), env, ctx);
  let j = null; try { j = await res.json(); } catch {}
  return { status: res.status, j };
};
const results = [];
async function check(name, fn) { try { await fn(); results.push(true); console.log('PASS ', name); } catch (e) { results.push(false); console.log('FAIL ', name, '\n      ' + (e.stack || e.message).split('\n').slice(0, 4).join('\n      ')); } }
const P = (j, k) => j.people.find(p => p.key === k);

/* ---------------- the checks ---------------- */
await check('owner only: a client and the team are refused, nobody signed in is 401', async () => {
  for (const [tok, code] of [[CLIENT, 403], [TEAM, 403], [null, 401]]) {
    assert.equal((await call(tok, 'GET', '/api/agency/scorecard')).status, code);
    assert.equal((await call(tok, 'POST', '/api/agency/rating', { name: 'William', stars: 5 })).status, code);
  }
});

await check('who is who: emails, full Asana names, nicknames, Claude Code (Cole); a client email is nobody', async () => {
  const people = await teamBook(env);
  assert.equal(whoIs(people, 'William Sampindi'), 'william');
  assert.equal(whoIs(people, 'Nomaqhawe M'), 'noma');
  assert.equal(whoIs(people, 'schubertchannel123@gmail.com'), 'ravo');
  assert.equal(whoIs(people, 'Claude Code (Cole)'), 'cole');
  assert.equal(whoIs(people, 'noma@go-mobius-digital.com'), 'noma');
  assert.equal(whoIs(people, 'cole@somebrand.com'), null);
  assert.equal(whoIs(people, 'someone in Locus'), null);
  assert.equal(people.find(p => p.key === 'ahsan').slack, 'U06K732S4BD');
  assert.equal(people.find(p => p.key === 'ravo').asana_gid, '1201');
  assert.deepEqual(people.find(p => p.key === 'william').roles, ['designer']);
  assert.equal(dayOf('2026-11-09 03:00:00'), '2026-11-08', 'UTC 3am is the evening before in Central');
  assert.equal(periodOf('4w', '2026-11-11').from, '2026-10-19');
});

let week;
await check('this week: work counted per person from cards, launches, versions, Asana and Locus tasks', async () => {
  const r = await call(OWNER, 'GET', '/api/agency/scorecard?period=week');
  assert.equal(r.status, 200, JSON.stringify(r.j));
  week = r.j;
  assert.equal(week.period.id, 'week'); assert.equal(week.period.from, MON);
  assert.deepEqual(week.people.map(p => p.name), ['Cole', 'Ahsan', 'Noma', 'William', 'Ravo', 'Radhesh', 'Hamza']);
  const a = P(week, 'ahsan'), w = P(week, 'william'), c = P(week, 'cole'), rv = P(week, 'ravo'), rd = P(week, 'radhesh');
  assert.deepEqual(a.work, { cards: 1, launches: 0, versions: 0, asana: 1, tasks: 1 }, 'card 501, Beta task today (the 60-day-old one is out), the recap');
  assert.deepEqual(w.work, { cards: 1, launches: 0, versions: 1, asana: 1, tasks: 0 });
  assert.equal(c.work.launches, 2, 'his email and Claude Code (Cole); "someone in Locus" is nobody');
  assert.equal(rv.work.versions, 1, 'the deleted version does not count'); assert.equal(rv.work.asana, 1, 'an open task he moved counts');
  assert.equal(rd.work.asana, null, 'Radhesh is not in Asana'); assert.equal(rd.in_asana, false); assert.equal(rd.work.tasks, 1, 'ticked by him, no owner');
  assert.equal(week.uncredited.asana, 1, 'a client assigned in Asana'); assert.equal(week.uncredited.launches, 1);
  assert.match(c.items.launches[0].url, /adsmanager\.facebook\.com.*act=111/);
  assert.match(w.items.cards[0].link, /open=production&act=brand_alpha&card=c2/);
});

await check('win rate: winners over judged, thin calls left out, strategist credit said per item', async () => {
  const a = P(week, 'ahsan'), n = P(week, 'noma'), w = P(week, 'william');
  assert.deepEqual(a.quality.win, { winners: 1, judged: 1, thin_skipped: 0, rate: 100 }, 'the 80-day-old call is outside the week');
  assert.equal(a.items.judged[0].credited_by, 'card owner');
  assert.deepEqual(n.quality.win, { winners: 0, judged: 1, thin_skipped: 1, rate: 0 }, '504 judged, 503 thin (no spend) ' + JSON.stringify([n.quality.win, n.items.judged]));
  assert.ok(n.items.judged.every(j => j.credited_by === 'brand strategist'));
  assert.equal(n.items.judged.find(j => j.id === 'c3').thin, true);
  assert.equal(w.quality.win.judged, 0, 'a designer is never credited a test');
});

await check('changes asked: credited to who made the file, else the card owner; per card; approvals and notes are not changes', async () => {
  const w = P(week, 'william'), rv = P(week, 'ravo');
  assert.equal(w.quality.changes.n, 2); assert.equal(w.quality.changes.cards, 1); assert.equal(w.quality.changes.per_card, 2);
  assert.deepEqual(w.items.changes.map(c => c.credited_by).sort(), ['card owner', 'made the file']);
  assert.ok(w.items.changes.some(c => c.from_client && c.by === 'Nick'));
  assert.deepEqual(rv.quality.changes, { n: 0, cards: 1, per_card: 0 });
});

await check('on time: reached by the due date; late open work counts against in the 4-week view', async () => {
  const a = P(week, 'ahsan'), w = P(week, 'william');
  assert.deepEqual(a.quality.on_time, { on: 2, total: 2, pct: 100 }, 'card 501 before its date, the recap on its date');
  assert.deepEqual(w.quality.on_time, { on: 0, total: 1, pct: 0 }, 'card 502 a day late');
  const r = await call(OWNER, 'GET', '/api/agency/scorecard?period=4w');
  const w4 = P(r.j, 'william'), h4 = P(r.j, 'hamza');
  assert.equal(w4.quality.on_time.total, 2, '505 still in Making past its date');
  assert.ok(w4.items.on_time.some(x => x.open && x.id === 'c5'));
  assert.deepEqual(h4.quality.on_time, { on: 0, total: 1, pct: 0 });
  const a4 = P(r.j, 'ahsan');
  assert.equal(a4.quality.win.judged, 1, '80 days ago is outside 4 weeks too');
});

await check('Cole rates a week: saved, shown as latest and 4-week average; bad input refused; null clears', async () => {
  assert.equal((await call(OWNER, 'POST', '/api/agency/rating', { name: 'William', week: TODAY, stars: 4, note: '  Clean files,   on brief ' })).status, 200);
  assert.equal((await call(OWNER, 'POST', '/api/agency/rating', { name: 'William', week: addDays(MON, -7), stars: 3 })).status, 200);
  assert.equal((await call(OWNER, 'POST', '/api/agency/rating', { name: 'William', week: TODAY, stars: 6 })).status, 400);
  assert.equal((await call(OWNER, 'POST', '/api/agency/rating', { name: 'Bob', week: TODAY, stars: 3 })).status, 400);
  assert.equal((await call(OWNER, 'POST', '/api/agency/rating', { name: 'William', week: addDays(MON, 14), stars: 3 })).status, 400, 'a future week');
  const row = db.prepare(`SELECT * FROM p_team_rating WHERE person = 'william' AND week = ?`).get(MON);
  assert.equal(row.stars, 4); assert.equal(row.note, 'Clean files, on brief'); assert.equal(row.by_email, 'cole@go-mobius-digital.com');
  let r = await call(OWNER, 'GET', '/api/agency/scorecard');
  const w = P(r.j, 'william').quality.rating;
  assert.deepEqual(w.latest, { week: MON, stars: 4, note: 'Clean files, on brief' }); assert.equal(w.avg4, 3.5); assert.equal(w.n4, 2);
  assert.equal((await call(OWNER, 'POST', '/api/agency/rating', { name: 'William', week: TODAY, stars: null })).status, 200);
  r = await call(OWNER, 'GET', '/api/agency/scorecard');
  assert.equal(P(r.j, 'william').quality.rating.latest.week, addDays(MON, -7));
  assert.equal(P(r.j, 'noma').quality.rating.latest, null);
});

await check('Asana is cached per period; fresh=1 reads again; no em or en dashes anywhere', async () => {
  const n = asanaCalls;
  const r = await call(OWNER, 'GET', '/api/agency/scorecard?period=week');
  assert.equal(asanaCalls, n);
  await call(OWNER, 'GET', '/api/agency/scorecard?period=week&fresh=1');
  assert.ok(asanaCalls > n);
  assert.ok(!/[–—]/.test(JSON.stringify(r.j)));
  if (process.argv.includes('--full')) console.log(JSON.stringify(r.j));
  else if (process.argv.includes('--print')) console.log(JSON.stringify({ period: r.j.period, uncredited: r.j.uncredited, person: P(r.j, 'william') }, null, 2));
});

const ok = results.filter(Boolean).length;
console.log(`\n${ok}/${results.length} passed`);
process.exit(ok === results.length ? 0 : 1);

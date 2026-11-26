/* Offline checks for quiet jobs and agency features (jobflags.js, 2026-11-26). KEEP EVERYTHING ON UNTIL DEC 2: every
 * QUIET_JOBS id runs by default exactly as it does live today (a deploy changes no post) and goes quiet only on 'off';
 * an old 'off' switch still wins; featureOn('creatorProgram') derives from the data and socialPosting runs unless
 * parked; cleanJobs is the owner's; callNudge switched off still finishes and stamps but posts no FYI; every gate sits
 * in its file.
 * (Smoke with the flag off writing state and posting nothing is in test-smoke.mjs, section 2b.)
 * In-memory SQLite for D1, Slack mocked, invented data.
 *   node test-jobflags.mjs      (from account-health/worker)
 */
import { DatabaseSync } from 'node:sqlite';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { QUIET_JOBS, jobOn, cleanJobs, cleanFeatures, featureOn, featureSaved, featuresNow, jobsView, _resetFlags } from './src/jobflags.js';
import { callNudgeTick } from './src/callnudge.js';
import { todayTick } from './src/todaypost.js';
import { roundupTick } from './src/lane.js';
import { postMonday } from './src/asana-brand.js';
import { trybeRecutAnnounce } from './src/trybe.js';

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
const env = { DB: { prepare: prep } };
function fresh() {
  db = new DatabaseSync(':memory:'); _resetFlags();
  db.exec(`CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT)`);
}
const setS = (k, v) => db.prepare(`INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`).run(k, v);
const getSetting = async (e, k) => db.prepare(`SELECT value FROM settings WHERE key = ?`).get(k)?.value ?? null;
const putSetting = async (e, k, v) => setS(k, String(v));
let n = 0;
const ok = (name, fn) => Promise.resolve().then(fn).then(() => { n++; }, e => { console.error('FAILED: ' + name + '\n', e); process.exitCode = 1; });

await ok('default = today: every QUIET_JOBS id runs with nothing saved, and goes quiet only on "off"', async () => {
  fresh();
  assert.equal(QUIET_JOBS.length, 18);
  for (const j of QUIET_JOBS) {
    assert.ok(j.id && j.name && j.was && j.instead, j.id);
    assert.equal(await jobOn(env, j.id), true, j.id + ' runs by default, as it does live today');
    assert.equal(await jobOn(env, j.id, getSetting), true, j.id + ' runs by default through a getter');
    setS(`jobOn:${j.id}`, 'off');
    assert.equal(await jobOn(env, j.id), false, j.id + ' is quiet on off');
    assert.equal(await jobOn(env, j.id, getSetting), false, j.id + ' is quiet on off through a getter');
    setS(`jobOn:${j.id}`, 'on');
    assert.equal(await jobOn(env, j.id), true, j.id + ' runs on on');
    setS(`jobOn:${j.id}`, '');
    assert.equal(await jobOn(env, j.id), true, j.id + ' an empty value is not off');
  }
  assert.equal(await jobOn(env, 'x', async () => '"off"'), false, 'a getter that returns the JSON word');
  assert.equal(await jobOn(env, 'x', async () => { throw new Error('db down'); }), true, 'a failed read never silences a post that runs today');
  fresh();
  const v = await jobsView(env);
  assert.equal(v.length, 18); assert.ok(v.every(j => j.on === true), 'the settings page shows every job on');
  for (const j of QUIET_JOBS) for (const s of [j.name, j.was, j.instead]) assert.ok(!/[\u2014\u2013]/.test(s), 'no dashes: ' + s);
});
await ok('default = today at the call sites: with nothing saved no tick answers quiet', async () => {
  fresh();
  const dep = { getSetting, putSetting, centralHour: () => 6, centralDate: () => '2026-03-11', listAccounts: async () => [] };
  assert.notDeepEqual(await todayTick(env, dep), { skipped: 'quiet' }, 'today post runs its own checks');
  assert.notDeepEqual(await roundupTick(env, dep), { skipped: 'quiet' }, 'the roundup runs its own checks');
  const auto = await postMonday(env, 'brand_northlake_golf', { auto: true }).catch(e => ({ threw: e.message }));
  assert.notDeepEqual(auto, { skipped: 'quiet' }, 'the scheduled Monday test post runs');
  /* The recut post goes on a workspace with a creator program (this agency has one), as today. */
  setS('creatorEngine:brand_northlake_golf', '{}');
  const posts = [];
  const r = await trybeRecutAnnounce(env, { listBrands: async () => [{ act_id: 'brand_northlake_golf', name: 'Northlake Golf', slack_channel: 'C_NORTH' }], slackPost: async (...a) => posts.push(a) }, 'brand_northlake_golf', [{ num: 1, test: 'hook' }]);
  assert.deepEqual(r, { ok: true }); assert.equal(posts.length, 1, 'posted, as today');
});
await ok("an old 'off' switch still wins with the job left on (the default)", async () => {
  fresh();
  const dep = { getSetting, putSetting, centralHour: () => 9, centralDate: () => '2026-03-11', listAccounts: async () => [] };
  setS('jobOn:todayPost', 'off');
  assert.deepEqual(await todayTick(env, dep), { skipped: 'quiet' });
  setS('jobOn:todayPost', ''); setS('todayPost', 'off');
  assert.deepEqual(await todayTick(env, dep), { skipped: 'off' });
  setS('jobOn:fyiRoundup', 'off');
  assert.deepEqual(await roundupTick(env, dep), { skipped: 'quiet' });
  setS('jobOn:fyiRoundup', ''); setS('fyiRoundup', 'off');
  assert.deepEqual(await roundupTick(env, dep), { skipped: 'off' });
});
await ok('the Monday test post switched off: the scheduled one is quiet, a post asked for from Locus is not stopped', async () => {
  fresh(); setS('jobOn:mondayTestPost', 'off');
  assert.deepEqual(await postMonday(env, 'brand_northlake_golf', { auto: true }), { skipped: 'quiet' });
  const asked = await postMonday(env, 'brand_northlake_golf').catch(e => ({ threw: e.message }));
  assert.notDeepEqual(asked, { skipped: 'quiet' });
});
await ok('the recut post switched off (or no creator program): quiet, the route still answers ok', async () => {
  fresh();
  const posts = [];
  const r = await trybeRecutAnnounce(env, { listBrands: async () => [{ act_id: 'brand_northlake_golf', name: 'Northlake Golf', slack_channel: 'C_NORTH' }], slackPost: async (...a) => posts.push(a) }, 'brand_northlake_golf', [{ num: 1, test: 'hook' }]);
  assert.deepEqual(r, { ok: true, quiet: true }); assert.equal(posts.length, 0);
});
await ok("featureOn('creatorProgram'): derived true with creator data, false on an empty db, explicit 'off' wins", async () => {
  fresh();
  assert.equal(await featureOn(env, 'creatorProgram'), false, 'empty workspace');
  assert.equal(await featureSaved(env, 'creatorProgram'), false);
  fresh(); setS('creatorEngine:brand_northlake_golf', '{}');
  assert.equal(await featureOn(env, 'creatorProgram'), true, 'a creatorEngine key');
  fresh(); db.exec(`CREATE TABLE p_br_doc (act_id TEXT, line_id TEXT, key TEXT, data_json TEXT)`); db.exec(`INSERT INTO p_br_doc VALUES ('brand_northlake_golf', '', 'trybe', '{}')`);
  assert.equal(await featureOn(env, 'creatorProgram'), true, 'a brand with a Trybe key');
  setS('feature:creatorProgram', 'off');
  assert.equal(await featureOn(env, 'creatorProgram'), false, "explicit 'off' wins");
  assert.equal(await featureSaved(env, 'creatorProgram'), true);
  setS('feature:creatorProgram', 'on');
  assert.equal(await featureOn(env, 'creatorProgram'), true);
  assert.equal(await featureOn(env, 'socialPosting'), true, 'social runs when unset, as it does today');
  setS('feature:socialPosting', 'off');
  assert.equal(await featureOn(env, 'socialPosting'), false, 'the owner parks it');
  setS('feature:socialPosting', 'on');
  assert.equal(await featureOn(env, 'socialPosting'), true);
  const f = await featuresNow(env);
  assert.deepEqual(f, { creatorProgram: true, socialPosting: true, siteReviewsOpen: false }, 'no site review table reads false');
});
await ok('siteReviewsOpen: an unsent review link, or one sent in the last 30 days', async () => {
  fresh(); db.exec(`CREATE TABLE p_site_review (act_id TEXT, slug TEXT, sent_at TEXT)`);
  assert.equal((await featuresNow(env)).siteReviewsOpen, false);
  _resetFlags(); db.exec(`INSERT INTO p_site_review VALUES ('brand_northlake_golf', 'home', '2020-01-01T00:00:00Z')`);
  assert.equal((await featuresNow(env)).siteReviewsOpen, false, 'sent long ago');
  _resetFlags(); db.exec(`INSERT INTO p_site_review VALUES ('brand_northlake_golf', 'shop', NULL)`);
  assert.equal((await featuresNow(env)).siteReviewsOpen, true, 'still open');
});
await ok('cleanJobs refuses a non owner and ignores unknown ids; cleanFeatures keeps known names', () => {
  assert.equal(cleanJobs({ todayPost: true }, false), null);
  assert.deepEqual(cleanJobs({ todayPost: true, smokePost: 'on', nope: true, leakLine: false }, true), { todayPost: true, smokePost: true, leakLine: false });
  assert.deepEqual(cleanFeatures({ creatorProgram: false, socialPosting: true, other: true }), { creatorProgram: false, socialPosting: true });
});
await ok('callNudge switched off still finishes and stamps, posts no FYI, but a failed Finish still DMs', async () => {
  fresh(); setS('jobOn:meetingFinishedDm', 'off');
  db.exec(`CREATE TABLE p_call (id TEXT PRIMARY KEY, kind TEXT, act_id TEXT, title TEXT, status TEXT, state_json TEXT, started_at TEXT, updated_at TEXT, date TEXT)`);
  const quietFor = new Date(Date.now() - 3 * 36e5).toISOString();
  db.prepare(`INSERT INTO p_call VALUES ('monday:2026-03-11', 'monday', NULL, 'Monday call', 'live', '{"theme":"x"}', ?, ?, '2026-03-11')`).run(quietFor, quietFor);
  db.prepare(`INSERT INTO p_call VALUES ('client:b:2026-03-11', 'client', 'brand_northlake_golf', 'Client call', 'live', '{"news":"y"}', ?, ?, '2026-03-11')`).run(quietFor, quietFor);
  const posts = [], finished = [];
  const dep = { getSetting, putSetting, centralDate: () => '2026-03-11', centralHour: () => 13,
    slackApi: async (e, m, b) => { posts.push([m, b]); return { ok: true }; },
    finish: async id => { if (id.startsWith('client')) throw new Error('could not finish'); finished.push(id); } };
  const r = await callNudgeTick(env, dep);
  assert.deepEqual(finished, ['monday:2026-03-11'], 'finish still runs');
  assert.equal(posts.length, 1, 'only the not finished DM');
  assert.match(posts[0][1].text, /Meetings not finished/);
  assert.doesNotMatch(posts[0][1].text, /Monday call/, 'the finished one is not in it');
  assert.ok(await getSetting(env, 'callNudge:open:monday:2026-03-11'), 'the finished call is stamped');
  assert.ok(await getSetting(env, 'callNudge:open:client:b:2026-03-11'), 'the one left open is stamped after its DM');
  assert.equal(r.quiet, true);
  posts.length = 0;
  /* The default (nothing saved): the DMs go exactly as they do today. */
  fresh();
  db.exec(`CREATE TABLE p_call (id TEXT PRIMARY KEY, kind TEXT, act_id TEXT, title TEXT, status TEXT, state_json TEXT, started_at TEXT, updated_at TEXT, date TEXT)`);
  db.prepare(`INSERT INTO p_call VALUES ('monday:2026-03-11', 'monday', NULL, 'Monday call', 'live', '{"theme":"x"}', ?, ?, '2026-03-11')`).run(quietFor, quietFor);
  finished.length = 0;
  await callNudgeTick(env, dep);
  assert.deepEqual(finished, ['monday:2026-03-11']);
  assert.equal(posts.filter(p => p[0] === 'chat.postMessage').length, 1);
  assert.match(posts[0][1].text, /Meetings finished at noon/);
});
await ok('every gate sits in its file (the code is kept, only the post is gated)', () => {
  const src = f => readFileSync(new URL('./src/' + f, import.meta.url), 'utf8');
  const where = { fyiRoundup: 'lane.js', mondayBriefing: 'worker.js', meetingFinishedDm: 'callnudge.js', meetingNotesConfirm: 'meetings.js', taskReminders: 'actions.js', reviewPost: 'worker.js',
    smokePost: 'smoke.js', leakLine: 'morningcard.js', trybeRecutPost: 'trybe.js', dashboardsSlack: 'worker.js', jobErrorsPost: 'worker.js', todayPost: 'todaypost.js', movedPost: 'moved.js',
    morningLineDm: 'morning.js', askSchedules: 'askschedule.js', mondayReview: 'review.js', mondayTestPost: 'asana-brand.js', autoApprove: 'checkin.js' };
  assert.deepEqual(Object.keys(where).sort(), QUIET_JOBS.map(j => j.id).sort());
  for (const [id, f] of Object.entries(where)) assert.ok(src(f).includes(`jobOn(env, '${id}'`), `${id} gated in ${f}`);
  const w = src('worker.js');
  assert.match(w, /featureOn\(env, 'socialPosting'/); assert.match(w, /featureOn\(env, 'creatorProgram'/);
  assert.match(w, /\(\('jobs' in b \|\| 'features' in b \|\| 'notifyCopies' in b\) && !isOwner\) return json\(\{ error: 'Only the owner can change this\.' \}, 403\)/);
});

console.log(process.exitCode ? 'test-jobflags: FAILED' : `test-jobflags: ${n} checks passed`);

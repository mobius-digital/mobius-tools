/* Offline checks for the 8am "Today's calls" Slack post (todaypost.js), 2026-10-13. PROFIT and Slack are mocked.
 *   node test-today.mjs      (from account-health/worker) */
import assert from 'node:assert/strict';
import { todayTick, messageFor, lineFor } from './src/todaypost.js';

const settings = new Map(), env = { OWNER_EMAIL: 'cole@go-mobius-digital.com' };
let hour = 8, posts = [], reads = [];
const ROWS = {
  brand_alpha: [{ kind: 'scale', adset: 'Broad | Gift', stake: 240, currency: 'USD', why: '9 sales at $31 each, under the $40 goal over 7 days. Raise the budget 20% and watch 3 days.' },
    { kind: 'fix', why: 'Meta spent nothing yesterday.' }, { kind: 'trim', ad: '312 C | UGC', adset: 'Broad | Gift', stake: 95, currency: 'USD', why: 'This ad costs $88 a sale.' }],
  brand_beta: [{ kind: 'fix', why: 'No goal cost per sale set.' }],
  brand_gamma: [{ kind: 'cut', adset: 'Retarget 7d', stake: 410, currency: 'USD', why: 'Spent $410 with no sale in 7 days.' }],
};
const deps = {
  getSetting: async (e, k) => settings.get(k) ?? null, putSetting: async (e, k, v) => { settings.set(k, v); },
  centralHour: () => hour, centralDate: () => '2026-10-13', canAfford: () => true,
  mintSession: async (e, email) => ({ token: 'tok-' + email }),
  listAccounts: async () => [
    { act_id: 'brand_alpha', name: 'Alpha Golf', slack_channel: 'C1', brief_channel: 'C9' },
    { act_id: 'brand_beta', name: 'Beta Socks', slack_channel: 'C2', brief_channel: 'C8' },
    { act_id: 'brand_gamma', name: 'Gamma Patch', slack_channel: 'C3', brief_channel: 'C3' },
    { act_id: 'brand_gal', name: 'Galway Bay', slack_channel: 'C4', brief_channel: 'C7' },
    { act_id: 'brand_none', name: 'No Channel Co', slack_channel: null, brief_channel: null }],
  profit: async (path, tok) => { reads.push(path); assert.equal(tok, 'tok-cole@go-mobius-digital.com'); const act = new URL('http://x' + path).searchParams.get('act'); if (act === 'brand_fail') throw new Error('boom'); return { rows: ROWS[act] || [] }; },
  slackPost: async (e, channel, text, blocks, opts) => { posts.push({ channel, text, blocks, opts }); },
};
let n = 0, bad = 0;
const check = async (name, fn) => { try { await fn(); n++; console.log('PASS ', name); } catch (e) { bad++; console.log('FAIL ', name, '\n   ', e.message); } };

await check('the line and the message: call, name, money at stake, why, the Locus button; Fix and Call rows never post', () => {
  assert.equal(lineFor(ROWS.brand_alpha[0]), '*Scale* "Broad | Gift", $240 at stake. 9 sales at $31 each, under the $40 goal over 7 days. Raise the budget 20% and watch 3 days.');
  assert.match(lineFor(ROWS.brand_alpha[2]), /^\*Trim\* the ad "312 C \| UGC" in "Broad \| Gift", \$95 at stake\./);
  const m = messageFor({ act_id: 'brand_alpha', name: 'Alpha Golf' }, ROWS.brand_alpha);
  assert.match(m.text, /^Today's calls: Alpha Golf\n\*Scale\*/); assert.ok(!/Meta spent nothing/.test(m.text), 'fix rows stay out');
  assert.equal(m.blocks[2].elements[0].url, 'https://tools.go-mobius-digital.com/profit/?open=today&act=brand_alpha');
  assert.ok(!/—/.test(JSON.stringify(m)), 'no em dash');
  assert.equal(messageFor({ act_id: 'b', name: 'B' }, ROWS.brand_beta), null);
  assert.equal(messageFor({ act_id: 'b', name: 'B' }, [{ kind: 'call' }]), null);
});
await check('the tick: nothing before 8am; at 8am one post per brand with calls to its INTERNAL channel, paused and channel-less brands skipped, once a day', async () => {
  hour = 7; assert.deepEqual(await todayTick(env, deps), { skipped: 'before 8am Central' });
  hour = 8; posts = []; reads = [];
  const r = await todayTick(env, deps);
  assert.deepEqual(r.posted, ['Alpha Golf']); assert.deepEqual(r.quiet, ['Beta Socks']);
  assert.deepEqual(r.skipped.sort(), ['Gamma Patch', 'No Channel Co'], 'internal = client channel, and no channel, never post');
  assert.equal(posts.length, 1); assert.equal(posts[0].channel, 'C1'); assert.equal(posts[0].opts.username, 'Locus');
  assert.ok(!reads.some(p => /brand_gal/.test(p)), 'a paused brand is never read');
  const st = JSON.parse(settings.get('todayDone')); assert.equal(st.date, '2026-10-13'); assert.equal(st.acts.brand_alpha, 'posted');
  posts = []; const r2 = await todayTick(env, deps); assert.equal(r2.skipped, 'all checked today'); assert.equal(posts.length, 0);
  hour = 14; assert.equal((await todayTick(env, deps)).skipped, 'after 1pm Central');
});
await check('the tick: a failed read is tried once more next hour then left; budget stops before a brand; the switch stops everything', async () => {
  hour = 9; settings.set('todayDone', JSON.stringify({ date: '2026-10-13', acts: { brand_alpha: 'posted', brand_beta: 'nothing to call', brand_gamma: 'x', brand_none: 'x' }, tries: {} }));
  const d2 = { ...deps, listAccounts: async () => [{ act_id: 'brand_fail', name: 'Fail Co', slack_channel: 'C5', brief_channel: 'C6' }] };
  const r = await todayTick(env, d2); assert.match(r.failed[0], /Fail Co \(boom\)/); assert.equal(JSON.parse(settings.get('todayDone')).acts.brand_fail, undefined, 'retried next hour');
  await todayTick(env, d2); assert.match(JSON.parse(settings.get('todayDone')).acts.brand_fail, /^failed/);
  settings.delete('todayDone'); posts = [];
  assert.equal((await todayTick(env, { ...deps, canAfford: () => false })).deferred, 'budget'); assert.equal(posts.length, 0);
  settings.set('todayPost', 'off'); assert.deepEqual(await todayTick(env, deps), { skipped: 'off' }); settings.delete('todayPost');
});
console.log(`\n${n}/${n + bad} passed`);
if (bad) process.exit(1);

/* node test-clientchan.mjs (from account-health/worker): the three safety switches and the client channel rule
 * (clientchan.js, 2026-11-25), plus the cost line's cache write prices (ask/engine.js costOf).
 *   1. checkinAutoApprove: absent = the 24 hour timer approves as before, '0' = it never does; the note says automatic.
 *   2. a client-side channel never applies a change without a tap; askInClientChannels '0' = silent there.
 *   3. slackIndexClient '0' = client channel messages are no longer stored; internal still are; nothing is deleted.
 *   4. a 1 hour cache write is 2x input, a 5 minute one 1.25x; Sonnet 5.5 reads its cache at $0.10.
 * In-memory SQLite for D1, Slack mocked, made-up brands, no secrets. */
import { DatabaseSync } from 'node:sqlite';
import { clientSide, tapOnlyThere, directApplyThere, silentThere, readSwitches, writeSwitches, SWITCHES, TAP_ONLY_NOTE } from './src/clientchan.js';
import { autoApproveTick, AUTO_APPROVE_KEY, AUTO_APPROVE_WHO, AUTO_APPROVE_NOTE } from './src/checkin.js';
import { indexEvent, backfillTick, forgetChannelCache, INDEX_CLIENT_KEY } from './src/slackindex.js';
import { costOf, PRICE } from '../../ask/engine.js';

let n = 0, bad = 0; const ok = (c, m) => { n++; if (!c) { bad++; console.log('FAIL ' + m); } };

const db = new DatabaseSync(':memory:');
const bindSql = sql => sql.replace(/\?(\d+)/g, (_, i) => ':p' + i);
const vals = a => Object.fromEntries(a.map((v, i) => ['p' + (i + 1), v === undefined ? null : typeof v === 'boolean' ? +v : v]));
const prep = sql => {
  let args = [];
  const st = () => db.prepare(bindSql(sql));
  const o = { bind(...a) { args = a; return o; }, async first() { return st().get(vals(args)) || null; },
    async all() { return { results: st().all(vals(args)) }; },
    async run() { if (!/\?\d/.test(sql) && !args.length) { db.exec(sql); return { meta: { changes: 0 } }; } const r = st().run(vals(args)); return { meta: { changes: Number(r.changes) } }; } };
  return o;
};
const DB = { prepare: prep, async batch(list) { const out = []; for (const s of list) out.push(await s.run()); return out; } };
const env = { DB, SLACK_BOT_TOKEN: 'x' };
db.exec(`CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT)`);
const getSetting = async (e, k) => db.prepare(`SELECT value FROM settings WHERE key = ?`).get(k)?.value ?? null;
const putSetting = async (e, k, v) => { db.prepare(`INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value`).run(k, v); };
const clearSetting = k => db.prepare(`DELETE FROM settings WHERE key = ?`).run(k);

/* ---------------- the rule and the switches (pure) ---------------- */
ok(clientSide({ side: 'client' }) && clientSide({ side: null, shared: true }) && clientSide({ side: 'team', shared: true }), 'client side: marked client, or shared');
ok(!clientSide({ side: 'internal' }) && !clientSide({ side: 'internal', shared: true }) && !clientSide({ side: null, shared: false }) && !clientSide({ side: 'team' }), 'not client side: internal, team, a plain project channel');
ok(!directApplyThere({ side: 'client' }) && !directApplyThere({ shared: true }), 'client side: never applied from the words');
ok(!directApplyThere({ side: 'internal' }) && !directApplyThere({}) && !directApplyThere({ side: 'team' }), 'internal and plain channels: no direct apply either (always a tap, 2026-11-25)');
ok(tapOnlyThere({ side: 'internal', shared: true }) && !directApplyThere({ side: 'internal', shared: true }), 'an internal channel shared with another workspace is tap-only');
ok(!silentThere({ side: 'internal', shared: true }, '0') && !clientSide({ side: 'internal', shared: true }), 'a shared internal channel still answers and is still stored');
ok(/needs a tap/.test(TAP_ONLY_NOTE) && /outside the team/.test(TAP_ONLY_NOTE) && !TAP_ONLY_NOTE.includes('—'), 'the tap-only note says why, no em dash');
ok(!silentThere({ side: 'client' }, null) && !silentThere({ side: 'client' }, '1') && !silentThere({ shared: true }, undefined), 'no key: it answers in client channels as today');
ok(silentThere({ side: 'client' }, '0') && silentThere({ shared: true }, '0'), "'0': silent in client channels");
ok(!silentThere({ side: 'internal' }, '0') && !silentThere({}, '0') && !silentThere({ side: 'team' }, '0'), "'0': internal channels still answer");

const none = await readSwitches(env, getSetting);
ok(SWITCHES.length === 3 && SWITCHES.every(k => none[k] === true), 'no key set: every switch reads on ' + JSON.stringify(none));
await writeSwitches(env, putSetting, { checkinAutoApprove: false, somethingElse: false });
ok((await getSetting(env, 'checkinAutoApprove')) === '0' && (await getSetting(env, 'askInClientChannels')) === null && (await getSetting(env, 'somethingElse')) === null, 'PUT saves only the switch in the body');
await writeSwitches(env, putSetting, { askInClientChannels: false, slackIndexClient: false, checkinAutoApprove: true });
const set = await readSwitches(env, getSetting);
ok(set.checkinAutoApprove === true && set.askInClientChannels === false && set.slackIndexClient === false, 'switches read back ' + JSON.stringify(set));
for (const k of SWITCHES) clearSetting(k);

/* ---------------- 1. the 24 hour timer ---------------- */
db.exec(`CREATE TABLE p_br_batch (id TEXT PRIMARY KEY, act_id TEXT, num INTEGER, title TEXT, brief_json TEXT, brief_text TEXT, board_stage TEXT, assignee_name TEXT, needs_client INTEGER DEFAULT 0, client_sent_at TEXT)`);
db.exec(`CREATE TABLE brand_accounts (act_id TEXT PRIMARY KEY, name TEXT, slack_channel TEXT, brief_channel TEXT)`);
db.exec(`CREATE TABLE p_work_file (id TEXT PRIMARY KEY, batch_id TEXT, kind TEXT, version INTEGER, ad TEXT, name TEXT, mime TEXT, created_at TEXT, deleted_at TEXT)`);
db.exec(`CREATE TABLE p_work_comment (id TEXT PRIMARY KEY, batch_id TEXT, file_id TEXT, kind TEXT, body TEXT, author_name TEXT, parent_id TEXT, fixed INTEGER, created_at TEXT)`);
db.exec(`INSERT INTO brand_accounts VALUES ('brand_harbor', 'Harbor Kettle Co', 'C_HARBOR_INT', NULL)`);
db.exec(`INSERT INTO p_br_batch VALUES ('card1', 'brand_harbor', 12, 'Morning pour', NULL, '', 'review', 'Sam', 0, NULL)`);
db.exec(`INSERT INTO p_work_file VALUES ('f1', 'card1', 'version', 1, '12-1', '12-1 v1.png', 'image/png', '2026-11-01', NULL)`);
const old = new Date(Date.now() - 30 * 3600e3).toISOString();
const seedCard = async () => {
  await putSetting(env, 'rvOpen', JSON.stringify(['card1']));
  await putSetting(env, 'rvPost:card1', JSON.stringify({ channel: 'C_REVIEW', ts: '1790000000.000100', at: old, act: 'brand_harbor', label: 'Harbor batch 12' }));
};
const decided = [], slack = [];
const d = { getSetting, putSetting, prod: {}, slackApi: async (e, method, p) => { slack.push({ method, p }); return { ok: true }; },
  decideMany: async (e, prod, body, who, scope, opts) => { decided.push({ body, who, opts }); return { count: 1 }; } };

await seedCard();
/* 2026-11-26 (jobflags.js): the timer can go quiet. Default = today; only 'off' quiets it. */
await putSetting(env, 'jobOn:autoApprove', 'off');
let out = await autoApproveTick(env, d, {});
ok(out.autoApprove === 'quiet' && !out.autoApproved && decided.length === 0 && slack.length === 0, 'switched off: nothing approved, nothing posted ' + JSON.stringify(out));
await putSetting(env, 'jobOn:autoApprove', '');
await putSetting(env, AUTO_APPROVE_KEY, '0');
out = await autoApproveTick(env, d, {});
ok(out.autoApprove === 'off' && !out.autoApproved && decided.length === 0 && slack.length === 0, "'0': a silent card is not approved " + JSON.stringify(out));
ok(JSON.parse(await getSetting(env, 'rvOpen')).includes('card1') && !JSON.parse(await getSetting(env, 'rvPost:card1')).done, "'0': the card stays waiting");

clearSetting(AUTO_APPROVE_KEY);
out = await autoApproveTick(env, d, {});
ok(out.autoApproved === 1 && decided.length === 1, 'no key: the timer approves as before ' + JSON.stringify(out));
const call = decided[0] || { body: {}, opts: {} };
ok(call.body.id === 'card1' && call.body.all === true, 'the whole card is approved');
ok(call.who === AUTO_APPROVE_WHO && call.opts.name === AUTO_APPROVE_WHO && /automatic/i.test(AUTO_APPROVE_WHO), 'the note is signed as automatic, not as a person: ' + call.who);
ok(/automatically after 24 hours with no answer/i.test(call.body.body) && call.body.body === AUTO_APPROVE_NOTE, 'the note says it was automatic: ' + call.body.body);
ok(!/cole|approved by/i.test(AUTO_APPROVE_NOTE + AUTO_APPROVE_WHO), 'the note names no person');
const upd = slack.find(s => s.method === 'chat.update');
ok(upd && /Approved automatically: no answer in 24 hours/.test(upd.p.text), 'the Slack card says automatic: ' + upd?.p?.text);
ok(!JSON.parse(await getSetting(env, 'rvOpen')).includes('card1'), 'the approved card leaves the open list');

await seedCard(); decided.length = 0;
await putSetting(env, AUTO_APPROVE_KEY, '1');
out = await autoApproveTick(env, d, {});
ok(out.autoApproved === 1 && decided.length === 1, "'1' (switched back on): the timer approves");
await putSetting(env, 'rvPost:card1', JSON.stringify({ channel: 'C_REVIEW', ts: '1790000000.000100', at: new Date(Date.now() - 2 * 3600e3).toISOString() }));
await putSetting(env, 'rvOpen', JSON.stringify(['card1'])); decided.length = 0;
out = await autoApproveTick(env, d, {});
ok(!out.autoApproved && decided.length === 0, 'a card sent two hours ago is left alone');

/* ---------------- 3. the Slack index ---------------- */
db.exec(`CREATE TABLE brands (id TEXT PRIMARY KEY, slug TEXT, name TEXT, status TEXT, internal_channel TEXT, client_channel TEXT)`);
db.exec(`INSERT INTO brands VALUES ('brand_harbor', 'harbor', 'Harbor Kettle Co', 'active', 'C_HARBOR_INT', 'C_HARBOR_CLI'), ('brand_pine', 'pine', 'Pine & Lantern', 'active', 'C_PINE_INT', 'C_PINE_CLI')`);
const HIST = { C_HARBOR_INT: [{ ts: '1790000500.000100', user: 'U1', text: 'internal backfill line' }], C_HARBOR_CLI: [{ ts: '1790000600.000100', user: 'U9', text: 'client backfill line' }],
  C_PINE_INT: [], C_PINE_CLI: [{ ts: '1790000700.000100', user: 'U9', text: 'pine client backfill line' }] };
const hist = [];
const idx = { getSetting, putSetting, xfetch: async () => ({ json: async () => ({ ok: false }) }),
  slackApi: async (e, method, p) => {
    if (method === 'users.list') return { ok: true, members: [{ id: 'U1', profile: { real_name: 'Sam' } }, { id: 'U9', profile: { real_name: 'Client Person' } }] };
    if (method === 'conversations.history') { hist.push(p.channel); return { ok: true, messages: p.latest ? [] : (HIST[p.channel] || []), has_more: false }; }
    return { ok: true, messages: [] };
  } };
const msg = (channel, ts, text) => ({ type: 'message', channel, channel_type: 'channel', ts, user: 'U9', text });
const count = (where = '1 = 1') => db.prepare(`SELECT COUNT(*) AS c FROM slack_msg WHERE ${where}`).get().c;
forgetChannelCache();
ok(await indexEvent(env, idx, msg('C_HARBOR_CLI', '1790000001.000100', 'client says hello')) === true, 'no key: a client channel message is stored');
ok(await indexEvent(env, idx, msg('C_HARBOR_INT', '1790000002.000100', 'team says hello')) === true, 'no key: an internal message is stored');
ok(count(`side = 'client'`) === 1 && count(`side = 'internal'`) === 1, 'both sides in the index');

await putSetting(env, INDEX_CLIENT_KEY, '0');
ok(await indexEvent(env, idx, msg('C_HARBOR_CLI', '1790000003.000100', 'client says more')) === false, "'0': a new client channel message is not stored");
ok(await indexEvent(env, idx, msg('C_HARBOR_INT', '1790000004.000100', 'team says more')) === true, "'0': an internal message is still stored");
ok(await indexEvent(env, idx, { type: 'message', subtype: 'message_changed', channel: 'C_HARBOR_CLI', channel_type: 'channel', message: { ts: '1790000005.000100', user: 'U9', text: 'edited' } }) === false, "'0': an edit in a client channel writes nothing");
ok(count(`side = 'client'`) === 1 && count(`text = 'client says hello'`) === 1, "'0': what was stored before is still there");
ok(count(`side = 'internal'`) === 2, 'internal count ' + count(`side = 'internal'`));
const bf = await backfillTick(env, idx);
ok(!hist.includes('C_HARBOR_CLI') && !hist.includes('C_PINE_CLI') && hist.includes('C_HARBOR_INT'), "'0': the walk back reads internal channels only " + hist.join(','));
ok(bf.channels.every(c => c.side !== 'client') && count(`side = 'client'`) === 1 && count(`text = 'internal backfill line'`) === 1, "'0': the walk back stores no client message");
clearSetting(INDEX_CLIENT_KEY); hist.length = 0;
await backfillTick(env, idx);
ok(hist.includes('C_HARBOR_CLI') && count(`text = 'client backfill line'`) === 1, 'no key: the walk back stores client channels as before');

/* ---------------- 4. the cost line ---------------- */
const near = (a, b) => Math.abs(a - b) < 1e-9;
const M = 1e6;
ok(near(costOf('claude-opus-5-5', { input_tokens: M, output_tokens: M }), 24), 'plain input and output');
ok(near(costOf('claude-opus-5-5', { cache_creation_input_tokens: M }), 5), 'no split from the API: the write is priced at 1.25x, as before');
ok(near(costOf('claude-opus-5-5', { cache_creation_input_tokens: M, cache_creation: { ephemeral_1h_input_tokens: M, ephemeral_5m_input_tokens: 0 } }), 8), 'a 1 hour write is 2x input');
ok(near(costOf('claude-opus-5-5', { cache_creation_input_tokens: M, cache_creation: { ephemeral_5m_input_tokens: M, ephemeral_1h_input_tokens: 0 } }), 5), 'a 5 minute write is 1.25x input');
ok(near(costOf('claude-opus-5-5', { cache_creation_input_tokens: M, cache_creation: { ephemeral_1h_input_tokens: 0.4 * M, ephemeral_5m_input_tokens: 0.6 * M } }), 0.4 * 8 + 0.6 * 5), 'a mixed write is priced part by part');
ok(near(costOf('claude-opus-5-5', { cache_creation_input_tokens: M, cache_creation: { ephemeral_1h_input_tokens: 0.4 * M } }), 0.4 * 8 + 0.6 * 5), 'tokens the split leaves out count as 5 minute writes');
ok(near(costOf('claude-opus-5-5', { cache_creation_input_tokens: M, cache_creation: {} }), 5), 'an empty split falls back to the total');
ok(costOf('claude-opus-5-5', { cache_creation_input_tokens: M, cache_creation: { ephemeral_1h_input_tokens: M } }) > costOf('claude-opus-5-5', { cache_creation_input_tokens: M }), 'the cost line reads higher with 1 hour writes');
ok(PRICE['claude-sonnet-5-5'][2] === 0.1 && near(costOf('claude-sonnet-5-5', { cache_read_input_tokens: M }), 0.1), 'Sonnet 5.5 cache read is $0.10 a million');
ok(near(costOf('claude-opus-5-5', { cache_read_input_tokens: M }), 0.2) && near(costOf('claude-sonnet-5-5', { input_tokens: M, output_tokens: M }), 12), 'the other prices did not move');
ok(costOf('claude-opus-5-5', {}) === 0 && costOf('claude-opus-5-5') === 0, 'no usage, no dollars');

/* ---------------- 2. the wiring in the Slack handler (read from the source: the handler needs a signed request) ---------------- */
const { readFileSync } = await import('node:fs');
const src = readFileSync(new URL('./src/worker.js', import.meta.url), 'utf8');
ok(/call: screen\?\.guest \|\| screen\?\.tapOnly \? null : askCaller\(/.test(src), 'a tap-only screen gets no direct-apply caller');
ok(/other\.client = tapOnlyThere\(\{ side, shared: info\.shared \}\)/.test(src), 'a client-side channel is marked tap-only, with no setting in the way');
ok(/if \(brandRow\) brandRow\.shared = \(await channelInfo\(/.test(src) && /tapOnlyThere\(\{ side: 'internal', shared: brandRow\?\.shared \}\)/.test(src), 'a shared internal brand channel is checked too');
ok(/screen\.tapOnly = true; screen\.note \+= TAP_ONLY_NOTE;/.test(src), 'a tap-only channel is told why nothing applies from the words');
ok(src.indexOf('getSetting(env, ASK_CLIENT_KEY)') > 0 && src.indexOf('getSetting(env, ASK_CLIENT_KEY)') < src.indexOf('askSeen:${ev.channel}:${ev.ts}'), 'the silent check runs before the message is claimed or answered');
ok(/\.\.\.\(await readSwitches\(env, getSetting\)\)/.test(src) && /await writeSwitches\(env, putSetting, b\)/.test(src), 'GET and PUT /api/settings carry the switches');

console.log(`${n - bad}/${n} passed`); if (bad) process.exit(1);

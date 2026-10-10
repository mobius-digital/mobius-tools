/* Offline checks for the Viktor-grade Strategist (2026-10-09): stratmem.js (memory, skills, usage),
 * slackindex.js (live index, backfill, search, thread, digest), strattools.js (presets, routes, guards,
 * files) and the engine's live steps, Stop and cost line on both surfaces. In-memory SQLite for D1,
 * Slack and Anthropic mocked, no secrets.
 *   node test-viktor.mjs      (from account-health/worker)
 */
import { DatabaseSync } from 'node:sqlite';
import assert from 'node:assert/strict';
import { remember, forget, factsFor, factsBlock, factsList, saveSkill, readSkill, skillsList, skillsBlock, logRun, usageSummary, CAP } from './src/stratmem.js';
import { indexEvent, backfillTick, search, readThread, digest, indexStatus, forgetChannelCache } from './src/slackindex.js';
import { stratTools, stratActions, stratHooks, PRESETS } from './src/strattools.js';
import { createAssistant } from '../../ask/engine.js';

const db = new DatabaseSync(':memory:');
const bindSql = sql => sql.replace(/\?(\d+)/g, (_, n) => ':p' + n);
const vals = a => Object.fromEntries(a.map((v, i) => ['p' + (i + 1), v === undefined ? null : typeof v === 'boolean' ? +v : v]));
const prep = sql => {
  let args = [];
  const st = () => db.prepare(bindSql(sql));
  const o = { bind(...a) { args = a; return o; }, async first() { return st().get(vals(args)) || null; },
    async all() { return { results: st().all(vals(args)) }; }, async run() { if (!/\?\d/.test(sql) && !args.length) { db.exec(sql); return { meta: { changes: 0 } }; } const r = st().run(vals(args)); return { meta: { changes: r.changes } }; } };
  return o;
};
const DB = { prepare: prep, async batch(list) { const out = []; for (const s of list) out.push(await s.run()); return out; } };
db.exec(`CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT)`);
db.exec(`CREATE TABLE brands (id TEXT PRIMARY KEY, slug TEXT, name TEXT, status TEXT, internal_channel TEXT, client_channel TEXT)`);
db.exec(`INSERT INTO brands VALUES ('brand_ice', 'ice', 'Ice & Gold', 'active', 'C_ICE_INT', 'C_ICE_CLI'), ('brand_lucky', 'lucky', 'Lucky Golf', 'active', 'C_LUCKY_INT', NULL)`);
const getSetting = async (env, k) => db.prepare(`SELECT value FROM settings WHERE key = ?`).get(k)?.value ?? null;
const putSetting = async (env, k, v) => { db.prepare(`INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value`).run(k, v); };
const safeJson = (s, d) => { try { return s == null ? d : JSON.parse(s); } catch { return d; } };
const env = { DB, SLACK_BOT_TOKEN: 'x', ANTHROPIC_API_KEY: 'k' };

/* Slack mock: history pages, replies, users, uploads. */
const slackCalls = [];
let NATIVE = false;
const HIST = { C_LUCKY_INT: [{ ts: '1790000000.000100', user: 'U1', text: 'We agreed the free shipping threshold is $195', reply_count: 1 }, { ts: '1790000100.000200', user: 'U2', text: 'Polo restock lands Nov 2' }] };
const slackApi = async (env, method, p) => {
  slackCalls.push({ method, p });
  if (method === 'users.list') return { ok: true, members: [{ id: 'U1', profile: { real_name: 'Cole' } }, { id: 'U2', profile: { real_name: 'Ahsan' } }, { id: 'U3', profile: { real_name: 'Fela' } }] };
  if (method === 'conversations.history') return p.channel === 'C_ICE_CLI' ? { ok: false, error: 'not_in_channel' } : { ok: true, messages: p.latest ? [] : (HIST[p.channel] || []), has_more: false };
  if (method === 'conversations.replies') return { ok: true, messages: [{ ts: p.ts, user: 'U1', text: 'thread head' }, { ts: '1790000050.000300', thread_ts: p.ts, user: 'U2', text: 'confirmed with Nick' }] };
  if (method === 'files.getUploadURLExternal') return { ok: true, upload_url: 'https://upload.test/x', file_id: 'F1' };
  if (method === 'files.completeUploadExternal') return { ok: true };
  if (method === 'assistant.threads.setStatus') return NATIVE ? { ok: true } : { ok: false, error: 'missing_scope' };
  if (method === 'chat.postMessage') return { ok: true, ts: '1790009999.000001' };
  if (method === 'chat.update') return { ok: true };
  if (method === 'reactions.add') return p.name === 'mobius' ? { ok: false, error: 'invalid_name' } : { ok: true };
  return { ok: true };
};
const xfetch = async (url) => ({ ok: true, status: 200, json: async () => ({ ok: true }), text: async () => '' });
const idx = { slackApi, getSetting, putSetting, safeJson, xfetch };

const checks = [];
const check = async (name, fn) => { try { await fn(); checks.push({ name, pass: true }); } catch (e) { checks.push({ name, pass: false, error: e.stack?.split('\n').slice(0, 3).join(' | ') }); } };

/* ---------------- memory ---------------- */
await check('remember: same topic REPLACES the old fact, the old one goes to history', async () => {
  await remember(env, { scope: 'brand_ice', topic: 'Creator link audience line', text: 'Talk to Nigerian-American women in Atlanta.' });
  const r = await remember(env, { scope: 'brand_ice', topic: 'creator link audience line', text: 'Do not narrow the audience to one community; Fela is widening the customer base.' });
  assert.match(r.replaced, /Nigerian/);
  const f = await factsFor(env, ['brand_ice']);
  assert.equal(f.length, 1); assert.match(f[0].text, /widening/);
  const all = await factsList(env, 'brand_ice');
  assert.equal(all.filter(x => x.status === 'replaced').length, 1);
});
await check('remember: identical text is a no-op; a dated fact expires after its day', async () => {
  const same = await remember(env, { scope: 'brand_ice', topic: 'creator link audience line', text: 'Do not narrow the audience to one community; Fela is widening the customer base.' });
  assert.equal(same.same, true);
  await remember(env, { scope: 'brand_ice', topic: 'Old sale', text: 'Labor Day sale 20% off', until: '2020-01-01' });
  const f = await factsFor(env, ['brand_ice']);
  assert.ok(!f.some(x => /Labor Day/.test(x.text)), 'expired fact is not in the prompt');
});
await check(`memory cap: past ${CAP} facts the oldest are archived, not deleted`, async () => {
  for (let i = 0; i < CAP + 3; i++) await remember(env, { scope: 'brand_cap', topic: `topic ${i}`, text: `fact ${i}` });
  assert.equal((await factsFor(env, ['brand_cap'])).length, CAP);
  assert.equal((await factsList(env, 'brand_cap')).filter(x => x.status === 'archived').length, 3);
});
await check('forget by topic; factsBlock prints agency + brand', async () => {
  await remember(env, { scope: 'agency', topic: 'Report day', text: 'Weekly reports go out Monday.' });
  await remember(env, { scope: 'brand_ice', topic: 'BF offer', text: '25% off sitewide Nov 27 to Dec 1.' });
  assert.equal((await forget(env, { scope: 'brand_ice', topic: 'bf offer' })).changed, 1);
  const block = factsBlock(await factsFor(env, ['agency', 'brand_ice']), 'Ice & Gold');
  assert.match(block, /### The agency/); assert.match(block, /### Ice & Gold/); assert.doesNotMatch(block, /25% off/);
});
await check('skills: save, update by name, read, list block', async () => {
  await saveSkill(env, { name: 'Launch brief', description: 'Use when briefing a product launch.', body: '1. Angle\n2. Concept' });
  const u = await saveSkill(env, { name: 'launch-brief', description: 'Use when briefing a product launch.', body: '1. Angle\n2. Concept\n3. Three hooks' });
  assert.equal(u.updated, true);
  assert.match((await readSkill(env, 'launch')).body, /Three hooks/);
  assert.match(skillsBlock(await skillsList(env)), /launch-brief: Use when/);
});
await check('usage log: runs add up by person and model', async () => {
  await logRun(env, { surface: 'slack', who: 'U1', model: 'claude-opus-5-5', effort: 'medium', cost: 0.21, steps: 4, ms: 9000 });
  await logRun(env, { surface: 'web', who: 'cole@', model: 'claude-sonnet-5-5', effort: 'medium', cost: 0.05, steps: 1, ms: 3000 });
  const u = await usageSummary(env, 30);
  assert.equal(u.answers, 2); assert.equal(u.cost, 0.26); assert.equal(u.by_model.length, 2);
});

/* ---------------- Slack index ---------------- */
await check('live index: internal and CLIENT channel messages are kept; DMs and unknown channels are not', async () => {
  forgetChannelCache();
  assert.equal(await indexEvent(env, idx, { type: 'message', channel: 'C_ICE_CLI', ts: '1790001000.000100', user: 'U3', text: 'Can we edit this part or take the below off from the What to film section?' }), true);
  assert.equal(await indexEvent(env, idx, { type: 'message', channel: 'C_ICE_INT', ts: '1790001100.000100', user: 'U1', text: 'Fela said this in the external chat', files: [{ name: 'shot.png', mimetype: 'image/png' }] }), true);
  assert.equal(await indexEvent(env, idx, { type: 'message', channel: 'D123', channel_type: 'im', ts: '1', user: 'U1', text: 'private' }), false);
  assert.equal(await indexEvent(env, idx, { type: 'message', channel: 'C_OTHER', ts: '2', user: 'U1', text: 'x' }), false);
  const n = db.prepare(`SELECT COUNT(*) AS n FROM slack_msg`).get().n;
  assert.equal(n, 2);
  const row = db.prepare(`SELECT * FROM slack_msg WHERE channel = 'C_ICE_CLI'`).get();
  assert.equal(row.side, 'client'); assert.equal(row.name, 'Fela'); assert.equal(row.brand, 'brand_ice');
});
await check('live index: an edit updates the text, a delete removes it', async () => {
  await indexEvent(env, idx, { type: 'message', subtype: 'message_changed', channel: 'C_ICE_CLI', message: { ts: '1790001000.000100', user: 'U3', text: 'Please take the Nigerian-American line off.' } });
  assert.match(db.prepare(`SELECT text FROM slack_msg WHERE ts = '1790001000.000100'`).get().text, /take the Nigerian/);
  await indexEvent(env, idx, { type: 'message', channel: 'C_ICE_INT', ts: '1790001200.000100', user: 'U1', text: 'oops' });
  await indexEvent(env, idx, { type: 'message', subtype: 'message_deleted', channel: 'C_ICE_INT', deleted_ts: '1790001200.000100' });
  assert.equal(db.prepare(`SELECT COUNT(*) AS n FROM slack_msg WHERE ts = '1790001200.000100'`).get().n, 0);
});
await check('backfill: pages history (bot), reads threads, falls back to the user token when the bot is not in a channel', async () => {
  slackCalls.length = 0;
  const r = await backfillTick({ ...env, SLACK_USER_TOKEN: '' }, idx);
  assert.ok(r.channels.find(c => c.channel === 'C_LUCKY_INT').added >= 3, 'two messages + the thread reply');
  assert.equal(r.channels.find(c => c.channel === 'C_ICE_CLI').error, 'no_user_token');
  const st = await indexStatus(env);
  assert.ok(st.total >= 5);
});
await check('search: all words, brand filter, permalink; newest first', async () => {
  const r = await search(env, idx, { q: 'free shipping threshold' });
  assert.equal(r.hits.length, 1); assert.match(r.hits[0].link, /mobiusdigitalhq\.slack\.com\/archives\/C_LUCKY_INT\/p1790000000000100/);
  const r2 = await search(env, idx, { q: 'take line', brand: 'brand_ice', side: 'client' });
  assert.equal(r2.hits.length, 1); assert.equal(r2.hits[0].who, 'Fela');
  assert.equal((await search(env, idx, { q: 'take line', brand: 'brand_lucky' })).hits.length, 0);
});
await check('read_thread from a permalink; digest marks CLIENT lines and stays under the cap', async () => {
  const t = await readThread(env, idx, { link: 'https://mobiusdigitalhq.slack.com/archives/C_LUCKY_INT/p1790000000000100' });
  assert.equal(t.messages, 2); assert.match(t.thread, /confirmed with Nick/);
  db.exec(`UPDATE slack_msg SET day = date('now')`);
  const d = await digest(env, 'brand_ice', { days: 14, cap: 6000 });
  assert.match(d, /CLIENT · Fela/); assert.match(d, /posted: image "shot.png"/);
});

/* ---------------- tools and hooks ---------------- */
const d = { getSetting, putSetting, safeJson, slack: slackApi, xfetch, idx,
  listAccounts: async () => [{ act_id: 'brand_ice', name: 'Ice & Gold' }, { act_id: 'brand_lucky', name: 'Lucky Golf' }],
  mintSession: async () => ({ token: 'mds.x.y' }), ahFetch: async () => new Response('{}') };
const tools = Object.fromEntries(stratTools(d).map(t => [t.def.name, t]));
const hooks = stratHooks(d);
await check('model: Smart by default, "!fast" and "!deep" for one answer, and the flag is taken out of the question', async () => {
  assert.deepEqual((await hooks.choose('how is Dartee doing?', env)).model, PRESETS.smart.model);
  const f = await hooks.choose('!fast what is the AOV', env);
  assert.equal(f.model, 'claude-sonnet-5-5'); assert.equal(f.question, 'what is the AOV');
  const g = await hooks.choose('review this batch !deep', env);
  assert.equal(g.effort, 'high');
  await putSetting(env, 'strategistModel', 'quick');
  assert.equal((await hooks.choose('hello', env)).model, 'claude-sonnet-5-5');
  await putSetting(env, 'strategistModel', 'smart');
});
await check('locus_routes finds the creator link route with its handler and how the screen calls it', async () => {
  const r = JSON.parse((await tools.locus_routes.run(env, { area: 'creator link brand amb' }, {})).text);
  const hit = r.find(x => x.path === '/api/amb/brand');
  assert.ok(hit, 'PUT /api/amb/brand is listed'); assert.match(hit.handler, /audience|slug/);
});
await check('locus_write refuses anything that reaches a client or moves money; accepts a real route', async () => {
  const w = stratActions(d)[0];
  assert.match((await w.propose(env, { method: 'POST', path: '/api/report-send', summary: 'x' })).error, /client/);
  const ok = await w.propose(env, { method: 'PUT', path: '/api/amb/brand?act=brand_ice', body: { audience: 'x' }, summary: 'Drop the line' });
  assert.equal(ok.patch.method, 'PUT');
  assert.match((await w.propose(env, { method: 'PUT', path: '/api/nope', summary: 'x' })).error, /No PUT route/);
});
await check('remember tool scopes to the brand on screen; post_file is a download in Locus and an upload in Slack', async () => {
  await tools.remember.run(env, { topic: 'What it is section', text: 'Fela asked what What it is is for; it is the product overview creators read.' }, { screen: { act_id: 'brand_ice' }, surface: 'web' });
  assert.ok((await factsFor(env, ['brand_ice'])).some(f => /product overview/.test(f.text)));
  const web = await tools.post_file.run(env, { filename: 'ads.csv', content: 'a,b\n1,2' }, { surface: 'web' });
  assert.equal(web.flags.files[0].name, 'ads.csv');
  slackCalls.length = 0;
  await tools.post_file.run(env, { filename: 'ads.csv', content: 'a,b' }, { surface: 'slack', channel: 'C_ICE_INT', thread: '1.2' });
  assert.ok(slackCalls.some(c => c.method === 'files.completeUploadExternal' && c.p.thread_ts === '1.2'));
});
await check('extraSystem: memory, skills and the brand digest load for the brand on screen', async () => {
  const out = await hooks.extraSystem(env, null, { screen: { act_id: 'brand_ice' } });
  const text = out.map(b => typeof b === 'string' ? b : b.text).join('\n');
  assert.match(text, /What you remember/); assert.match(text, /Your skills/); assert.match(text, /last two weeks in Ice & Gold/);
});

/* ---------------- the engine: steps, Stop, cost ---------------- */
const realFetch = globalThis.fetch;
let calls = 0, stopAfter = null;
globalThis.fetch = async (url, init) => {
  if (!String(url).includes('anthropic.com')) return realFetch(url, init);
  calls++;
  if (stopAfter && calls === 1) await putSetting(env, `askRun:${stopAfter}`, JSON.stringify({ steps: [], stop: true }));
  const body = JSON.parse(init.body);
  assert.equal(body.output_config?.effort, body.model === 'claude-opus-5-5' ? 'medium' : body.output_config?.effort);
  assert.ok(body.tools.some(t => t.type === 'web_search_20260209'), 'web search is offered');
  if (calls === 1) return new Response(JSON.stringify({ model: body.model, stop_reason: 'tool_use', usage: { input_tokens: 2000, cache_read_input_tokens: 20000, output_tokens: 300 },
    content: [{ type: 'thinking', thinking: 'Checking what Fela asked in the client channel' }, { type: 'tool_use', id: 't1', name: 'search_slack', input: { q: 'take line', brand: 'Ice & Gold' } }] }), { status: 200 });
  return new Response(JSON.stringify({ model: body.model, stop_reason: 'end_turn', usage: { input_tokens: 500, cache_read_input_tokens: 21000, output_tokens: 200 },
    content: [{ type: 'text', text: 'Done: the line is off the creator link.' }] }), { status: 200 });
};
const engine = createAssistant({ name: 'Strategist', who: 'test', schema: '', sqlTool: 'query_locus', model: 'claude-opus-5-5', strongModel: 'claude-opus-5-5', deepModel: 'claude-opus-5-5',
  ...hooks, tools: stratTools(d), dropTools: ['remember'], liveSteps: true, progressNotes: true, fallbacks: 'default', workingEmoji: ['mobius'], slackName: 'Strategist', slackApp: 'locus' });
const h = () => ({ getSetting, putSetting, safeJson, centralDate: () => '2026-10-09', monthOf: x => String(x).slice(0, 7), slack: slackApi });
await check('web answer: live steps written for the poller, cost and a cost line, usage logged', async () => {
  calls = 0;
  const seen = [];
  const orig = hooks.progress.set;
  const r = await engine.answerWeb(env, 'take the audience line off', [], h(), { screen: { act_id: 'brand_ice' }, runId: 'run12345', who: 'cole@' });
  assert.match(r.answer, /line is off/);
  assert.ok(r.steps.some(s => /Checking what Fela asked/.test(s)), 'the model\'s own progress note');
  assert.ok(r.steps.some(s => /Searching Slack for "take line"/.test(s)), 'the tool step');
  assert.ok(r.cost > 0 && r.cost < 0.1, `cost ${r.cost}`); assert.match(r.costLine, /Opus 5\.5 · 2 steps|Opus 5\.5/);
  assert.equal(await getSetting(env, 'askRun:run12345'), null, 'progress row cleared at the end');
  assert.ok((await usageSummary(env, 1)).answers >= 3);
});
await check('Stop: a stop flag set mid-answer ends it after the round', async () => {
  calls = 0; stopAfter = 'stoprun1';
  const r = await engine.answerWeb(env, 'long one', [], h(), { screen: null, runId: 'stoprun1' });
  stopAfter = null;
  assert.equal(r.stopped, true, 'the step written after Stop kept the flag'); assert.equal(calls, 1);
});
await check('Slack answer: falls back to eyes when :mobius: is not added, posts "On it" with Stop, replaces it with the answer and a cost line', async () => {
  calls = 0; slackCalls.length = 0;
  await engine.answerSlack(env, { channel: 'C_ICE_INT', ts: '1790002000.000100', user: 'U1', text: '<@B> can we update this in the creator link?' }, h(), { screen: { act_id: 'brand_ice' } });
  const react = slackCalls.filter(c => c.method === 'reactions.add').map(c => c.p.name);
  assert.deepEqual(react, ['mobius', 'eyes']);
  const post = slackCalls.find(c => c.method === 'chat.postMessage');
  assert.ok(post.p.blocks.some(b => b.type === 'actions' && b.elements[0].action_id === 'ask_stop'));
  const upd = slackCalls.filter(c => c.method === 'chat.update').pop();
  assert.match(upd.p.text, /line is off/);
  assert.ok(upd.p.blocks.some(b => b.type === 'context' && /\$0\.\d+ · Opus 5\.5/.test(b.elements[0].text)));
});
await check('Slack answer with the AI-app feature on: Slack own spinner (setStatus with steps), cleared at the end, no "On it" message', async () => {
  calls = 0; slackCalls.length = 0; NATIVE = true;
  await engine.answerSlack(env, { channel: 'C_ICE_INT', ts: '1790003000.000100', user: 'U1', text: '<@B> anything new?' }, h(), { screen: { act_id: 'brand_ice' } });
  NATIVE = false;
  const st = slackCalls.filter(c => c.method === 'assistant.threads.setStatus');
  assert.ok(st.length >= 2); assert.equal(st[0].p.thread_ts, '1790003000.000100'); assert.equal(st[st.length - 1].p.status, '');
  assert.equal(slackCalls.filter(c => c.method === 'chat.update').length, 0);
  assert.equal(slackCalls.filter(c => c.method === 'chat.postMessage').length, 1, 'only the answer');
});
/* Cost pass 2026-10-10: one tool list for both surfaces, rare tools behind tool search, a stable prefix cached for an hour. */
await check('cost pass: same tools on Slack and web, rare tools deferred and listed, stable prefix first with a 1h breakpoint, a found tool still runs', async () => {
  const bodies = [];
  let step = 0;
  globalThis.fetch = async (url, init) => {
    if (!String(url).includes('anthropic.com')) return realFetch(url, init);
    const body = JSON.parse(init.body); bodies.push(body);
    /* Web: search for the action, then call it (the API returns the search blocks in the same reply), then answer. */
    if (++step === 1) return new Response(JSON.stringify({ model: body.model, stop_reason: 'tool_use', usage: { input_tokens: 100, output_tokens: 50 }, content: [
      { type: 'server_tool_use', id: 'srvtoolu_1', name: 'tool_search_tool_regex', input: { pattern: 'flag_it' } },
      { type: 'tool_search_tool_result', tool_use_id: 'srvtoolu_1', content: { type: 'tool_search_tool_search_result', tool_references: [{ type: 'tool_reference', tool_name: 'flag_it' }] } },
      { type: 'tool_use', id: 't9', name: 'flag_it', input: { what: 'the daily report' } }] }), { status: 200 });
    return new Response(JSON.stringify({ model: body.model, stop_reason: 'end_turn', usage: { input_tokens: 100, output_tokens: 50 }, content: [{ type: 'text', text: 'Proposed.' }] }), { status: 200 });
  };
  const flagIt = { name: 'flag_it', description: 'Turn a brand setting on. Second sentence that the catalog leaves out.', input_schema: { type: 'object', properties: { what: { type: 'string' } } },
    propose: async (env, input) => ({ summary: `Turn on ${input.what}`, patch: input }), apply: async () => ({ ok: true }) };
  const eng = createAssistant({ name: 'Strategist', who: 'test', schema: 'tables', sqlTool: 'query_locus', model: 'claude-opus-5-5', playbook: 'THE PLAYBOOK',
    ...hooks, tools: stratTools(d), dropTools: ['remember'], actions: [flagIt], slackTools: [{ def: { name: 'slack_only', description: 'Only in Slack.', input_schema: { type: 'object', properties: {} } }, run: async () => ({ text: 'ok' }) }],
    liveContext: async () => '## Live\nmoves', sameTools: true, toolSearch: true, cacheTtl: '1h', alwaysLoaded: ['read_app', 'search_slack'], slackName: 'Strategist', slackApp: 'locus' });
  const r = await eng.answerWeb(env, 'turn on the daily report', [], h(), { screen: { act_id: 'brand_ice' } });
  assert.equal(r.proposals?.length, 1, 'the deferred action ran after the search');
  assert.ok(bodies[1].messages[1].content.some(c => c.type === 'tool_search_tool_result'), 'search blocks go back unchanged');
  step = 1;
  await eng.answerSlack(env, { channel: 'C_ICE_INT', ts: '1790004000.000100', user: 'U1', text: '<@B> anything?' }, h(), { screen: { act_id: 'brand_ice' } });
  const web = bodies[0], slack = bodies[bodies.length - 1];
  assert.deepEqual(web.tools, slack.tools, 'one tool list on both surfaces');
  assert.equal(web.tools[0].type, 'tool_search_tool_regex_20251119');
  const by = Object.fromEntries(web.tools.map(t => [t.name, t]));
  for (const n of ['flag_it', 'slack_only', 'make_report', 'forget']) assert.equal(by[n]?.defer_loading, true, n + ' deferred');
  for (const n of ['query_locus', 'read_app', 'search_slack', 'web_search']) assert.ok(by[n] && !by[n].defer_loading, n + ' loaded');
  const sys = web.system, bp = sys.findIndex(b => b.cache_control);
  assert.equal(sys[bp].cache_control.ttl, '1h');
  assert.match(sys.slice(0, bp + 1).map(b => b.text).join('\n'), /THE PLAYBOOK[\s\S]*More tools[\s\S]*- flag_it\*: Turn a brand setting on\n/);
  assert.ok(!/^(Today is|## Live|## What you remember|## The last two weeks)/m.test(sys.slice(0, bp + 1).map(b => b.text).join('\n')), 'nothing that moves before the breakpoint');
  assert.ok(sys.filter(b => b.cache_control).length <= 3, 'at most 3 marked blocks (+ the automatic one = 4)');
  assert.deepEqual(slack.system.slice(0, bp + 1), sys.slice(0, bp + 1), 'Slack and the web share the cached prefix');
});
globalThis.fetch = realFetch;

/* ---------------- report ---------------- */
for (const c of checks) console.log(`${c.pass ? 'PASS' : 'FAIL'}  ${c.name}${c.pass ? '' : '\n      ' + c.error}`);
const passed = checks.filter(c => c.pass).length;
console.log(`\n${passed}/${checks.length} passed`);
process.exit(passed === checks.length ? 0 : 1);

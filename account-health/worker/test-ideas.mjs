/* Offline regression tests for the ideas bot (src/ideas.js), the account-health Slack door
 * that routes to it, and the slack-router rule that sends its buttons here.
 * Same shape as ledger/worker/test-regressions.cjs: an in-memory SQLite standing in for D1,
 * every network call mocked (Slack, Gemini, ScrapeCreators, Claude, Asana), no secrets.
 *   node test-ideas.mjs          (from account-health/worker)
 */
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..', '..');
const db = new DatabaseSync(':memory:');
/* Statement by statement (comments stripped first), so a re-applied ALTER cannot stop the rest. */
const load = f => { for (const st of fs.readFileSync(f, 'utf8').replace(/--[^\n]*/g, '').split(/;\s*(?:\n|$)/)) { try { if (st.trim()) db.exec(st); } catch { /* duplicate column etc. */ } } };
load(path.join(here, 'schema.sql'));
for (const f of ['brand-001.sql', 'brand-002.sql', 'brand-003.sql', 'brand-004.sql', 'amb-001.sql', 'amb-002.sql', 'studio-001.sql', 'studio-002.sql'])
  load(path.join(root, 'profit', 'worker', 'migrations', f));
const bindSql = sql => sql.replace(/\?(\d+)/g, (_, n) => ':p' + n);
const vals = a => Object.fromEntries(a.map((v, i) => ['p' + (i + 1), v === undefined ? null : typeof v === 'boolean' ? +v : v]));
const DB = {
  prepare(sql) {
    let args = [];
    const st = () => db.prepare(bindSql(sql));
    return { bind(...a) { args = a; return this; }, async first() { return st().get(vals(args)) || null; },
      async all() { return { results: st().all(vals(args)) }; }, async run() { const r = st().run(vals(args)); return { meta: { changes: r.changes } }; } };
  },
  async batch(list) { const out = []; for (const s of list) out.push(await s.run()); return out; },
};

/* ---------------- fixtures ---------------- */
const GRUNK = 'act_313396960515158', PP = 'act_1033194534145987', LUCKY = 'act_378146126054294';
const CH = 'C06K78VC82F', LUCKY_CH = 'C06JSQY5G87';
db.exec(`INSERT INTO accounts (act_id, name, active, slack_channel, brief_channel) VALUES
  ('${GRUNK}', 'Grunk Dolfer', 1, '${CH}', 'CCLIENT1'), ('${PP}', 'Party Patch', 1, 'C06KL1K710R', 'CCLIENT2'), ('${LUCKY}', 'Lucky Golf', 1, '${LUCKY_CH}', NULL)`);
db.exec(`INSERT INTO p_amb_brand (act_id, slug, live) VALUES ('${GRUNK}', 'grunk-dolfer', 1)`);
db.exec(`INSERT INTO p_amb_section (id, act_id, name, line, sort) VALUES ('sec_dad', '${GRUNK}', 'Dad bod approved', 'Real dads, real rounds', 1)`);
db.exec(`INSERT INTO p_amb_angle (id, act_id, section_id, title, argument) VALUES ('ang_old', '${GRUNK}', 'sec_dad', 'The cart path cooler', 'Your drinks stay cold for all 18')`);
db.exec(`INSERT INTO p_br_doc (act_id, line_id, key, data_json) VALUES ('${GRUNK}', '', 'asana', '{"project_gid":"P1","workspace":"W1"}')`);
db.exec(`INSERT INTO p_br_batch (id, act_id, num, title, stage) VALUES ('b1', '${GRUNK}', '349', 'Old test', 'done')`);
db.exec(`INSERT INTO settings (key, value) VALUES ('brandAsanaFields', '{"testing":"F_TEST","testing_opts":{"angle":"O_A","concept":"O_C","variation":"O_V"}}')`);

const TT = 'https://www.tiktok.com/@golfguy/video/7301234567890123456?is_from_webapp=1';
const threads = {
  [`${CH}:100.1`]: [
    { ts: '100.1', user: 'U_AHSAN', text: `Look at this <${TT}> love the style, the guy talking to camera in his garage` },
    { ts: '100.2', user: 'U_COLE', text: 'Just the hook for us, the rest is too long', files: [{ id: 'F_IMG', name: 'frame.png', mimetype: 'image/png', size: 2000, url_private_download: 'https://files.slack.com/F_IMG/frame.png' }] },
    { ts: '100.3', bot_id: 'B1', user: 'U_BOT', text: 'an earlier bot post' },
    { ts: '100.4', user: 'U_AHSAN', text: '<@U_BOT> <@U_COLE> thoughts?' },
  ],
  [`${CH}:200.1`]: [{ ts: '200.1', user: 'U_AHSAN', text: 'Idea: a dad reads one star reviews of his own swing. <@U_BOT> idea' }],
  [`${CH}:300.1`]: [{ ts: '300.1', user: 'U_AHSAN', text: 'Why is CPA up this week? <@U_BOT>' }],
  [`${CH}:400.1`]: [{ ts: '400.1', user: 'U_AHSAN', text: 'See <https://youtube.com/shorts/abcdefghijk?feature=share> <@U_BOT>' }],
  [`${LUCKY_CH}:500.1`]: [{ ts: '500.1', user: 'U_COLE', text: `Creators could film this <${TT}> <@U_BOT>` }],
};
const NAMES = { U_AHSAN: 'Ahsan', U_COLE: 'Cole', U_BOT: 'Mobius Digital', U_RANDO: 'Randy' };

const draft = (over = {}) => ({
  teardown: { summary: 'A dad talks to camera about his own bad round; the product is the punchline — not the pitch.', awareness: 'problem aware', sophistication: 'stage 3', desire: 'feel less alone about a bad round', mechanism: 'self-deprecation', proof: 'his own scorecard', hook_why: 'He opens mid-rant.', weak: 'Too long after 20 seconds.' },
  transfer: { mode: 'hook_only', reason: 'Cole said just the hook, which is the latest direction.', disagreement: 'Ahsan liked the whole style; Cole narrowed it to the hook, so I followed Cole.' },
  questions: [],
  destination: { pick: 'creator_link', reason: 'Creators can film a garage rant from a pitch.' },
  creator_link: { section_id: 'sec_dad', new_section: '', new_section_line: '', duplicate_of: '', title: 'The garage rant', argument: 'Every dad has a round he needs to vent about. This ad drove a 3.2 ROAS last month.', who: 'Weekend Warrior dads', format: 'Talking head', products: 'Cooler bag', openers: ['I shot a 112 today.'], shots: [{ label: 'Hook', text: 'Mid-rant in the garage' }], on_screen: 'My worst round', do_text: 'Keep it real', dont_text: 'No scripted lines', proof_note: 'Take the mid-rant opening.' },
  asana: { title: 'Garage rant hook', kind: 'video', test_type: 'concept', angle: 'Golf is hard, your gear should not be', why: 'Weekend Warrior persona', concept: 'Dad vents in his garage', testing: 'Three different rants', ads: ['Rant about the slice', 'Rant about the cart girl', 'Rant about three putts'], creator: 'Any dad creator', length: '20s', hooks: ['I shot a 112', 'Never again', 'My wife was right'], script: 'Rant, then product.', broll: 'Garage, clubs', editor_notes: 'Fast cuts', primary_text: '', headline: '', offer: '' },
  studio: { name: 'Rant statics', angle: 'Golf is hard', why: 'Weekend Warrior', concept: '', testing: 'headlines', post_copy: '', lines: ['I shot a 112. My cooler did not care.', 'Bad round, cold drink.'] },
  ...over,
});

/* ---------------- the network ---------------- */
const calls = [];
let claudeQueue = [], lastClaudeBody = null;
const count = pat => calls.filter(c => pat.test(c.url)).length;
const slackCalls = m => calls.filter(c => c.url === `https://slack.com/api/${m}`);
const bodyOf = c => { const ct = c.init?.headers?.['Content-Type'] || ''; return /json/.test(ct) ? JSON.parse(c.init.body) : Object.fromEntries(new URLSearchParams(c.init.body)); };
function sse(obj) {
  const text = JSON.stringify(obj);
  const evs = [
    { type: 'message_start', message: { usage: { input_tokens: 3000, cache_read_input_tokens: 15000, cache_creation_input_tokens: 0 } } },
    { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } },
    { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text } },
    { type: 'content_block_stop', index: 0 },
    { type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { output_tokens: 1500 } },
    { type: 'message_stop' },
  ];
  return new Response(evs.map(e => `event: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`).join(''), { headers: { 'content-type': 'text/event-stream' } });
}
let ts = 900;
globalThis.fetch = async (url, init = {}) => {
  url = String(url);
  calls.push({ url, init });
  const u = new URL(url);
  if (u.hostname === 'slack.com') {
    const m = u.pathname.split('/').pop();
    const b = bodyOf({ init });
    if (m === 'conversations.replies') return Response.json({ ok: true, messages: threads[`${b.channel}:${b.ts}`] || [] });
    if (m === 'users.info') return Response.json({ ok: true, user: { profile: { display_name: NAMES[b.user] || 'X' } } });
    if (m === 'chat.postMessage') return Response.json({ ok: true, ts: String(++ts) });
    if (m === 'chat.getPermalink') return Response.json({ ok: true, permalink: 'https://mobius.slack.com/archives/x/p1' });
    return Response.json({ ok: true });
  }
  if (u.hostname === 'files.slack.com') return new Response(new Uint8Array([137, 80, 78, 71, 1, 2, 3]), { headers: { 'content-type': 'image/png' } });
  if (u.hostname === 'api.anthropic.com') { lastClaudeBody = JSON.parse(init.body); return sse(claudeQueue.shift() || draft()); }
  if (u.hostname === 'api.scrapecreators.com') return Response.json({ aweme_detail: { desc: 'my worst round ever', author: { nickname: 'golfguy' }, video: { download_no_watermark_addr: { url_list: ['https://v16.tiktokcdn.com/video.mp4'] } } } });
  if (u.hostname === 'v16.tiktokcdn.com') return new Response(new Uint8Array(1024), { headers: { 'content-type': 'video/mp4', 'content-length': '1024' } });
  if (u.hostname === 'generativelanguage.googleapis.com') {
    if (u.pathname === '/upload/v1beta/files') return new Response('{}', { headers: { 'x-goog-upload-url': 'https://generativelanguage.googleapis.com/upload/session/1' } });
    if (u.pathname === '/upload/session/1') return Response.json({ file: { name: 'files/abc', uri: 'https://generativelanguage.googleapis.com/v1beta/files/abc', mimeType: 'video/mp4', state: 'ACTIVE' } });
    if (/:generateContent$/.test(u.pathname)) return Response.json({ candidates: [{ content: { parts: [{ text: JSON.stringify({ format: ['yapper'], length_seconds: 42, hook: { spoken: 'I shot a 112 today', on_screen_text: 'worst round', visual: 'man in garage' }, transcript: 'I shot a 112 today...' }) }] } }], usageMetadata: { promptTokenCount: 12000, candidatesTokenCount: 800 } });
  }
  if (u.hostname === 'app.asana.com') {
    const p = u.pathname.replace('/api/1.0', '');
    if (p === '/projects/P1/sections') return Response.json({ data: [{ gid: 'S0', name: 'Client Resources' }, { gid: 'S1', name: 'Creative Brief' }] });
    if (p === '/tasks' && (init.method || 'GET') === 'GET') return Response.json({ data: [{ gid: 'T0', name: '352 - Newer task' }] });
    if (p === '/tasks') return Response.json({ data: { gid: 'T1', name: JSON.parse(init.body).data.name, permalink_url: 'https://app.asana.com/0/P1/T1' } });
    return Response.json({ data: {} });
  }
  throw new Error('Unexpected network call in offline test: ' + url);
};

const ideas = await import('./src/ideas.js');
const env = { DB, IDEA_APPROVERS: 'U_COLE,U_AHSAN', SLACK_BOT_TOKEN: 'xoxb-test', ANTHROPIC_API_KEY: 'test', GEMINI_API_KEY: 'test', DOWNLOADER_KEY: 'test', ASANA_TOKEN: 'test' };
const job = (root, text = '<@U_BOT>', channel = CH) => ({ kind: 'draft', channel, root, ts: root, user: 'U_AHSAN', text, bot: 'U_BOT' });
const row = id => db.prepare('SELECT * FROM idea_thread WHERE id = ?').get(id);
const press = (action_id, id, user = 'U_COLE', channel = CH) => ideas.handleIdeaAction(env, null, { type: 'block_actions', user: { id: user }, container: { channel_id: channel }, actions: [{ action_id, value: JSON.stringify({ i: id }) }] });
const lastPost = () => bodyOf(slackCalls('chat.postMessage').at(-1));
const cardOf = id => { const r = row(id); const u = slackCalls('chat.update').filter(c => bodyOf(c).ts === r.reply_ts).at(-1); return u ? bodyOf(u) : bodyOf(slackCalls('chat.postMessage').find(c => bodyOf(c).blocks && JSON.stringify(bodyOf(c).blocks).includes('Redo'))); };
const actionIds = blocks => (blocks.find(b => b.type === 'actions')?.elements || []).map(e => e.action_id);

const checks = [];
const check = async (name, fn) => { try { await fn(); checks.push({ name, pass: true }); } catch (e) { checks.push({ name, pass: false, error: e.stack?.split('\n').slice(0, 3).join(' | ') || e.message }); } };

/* ---------------- pure parsing ---------------- */
await check('links: YouTube Shorts, youtu.be, TikTok, Instagram reel; other links ignored', () => {
  assert.equal(ideas.classifyLink('https://youtube.com/shorts/abcdefghijk?feature=share').key, 'yt:abcdefghijk');
  assert.equal(ideas.classifyLink('https://youtu.be/abcdefghijk').url, 'https://www.youtube.com/watch?v=abcdefghijk');
  assert.equal(ideas.classifyLink(TT).key, 'tt:7301234567890123456');
  assert.equal(ideas.classifyLink('https://www.instagram.com/reel/C9xYz_12/?igsh=abc').key, 'ig:C9xYz_12');
  assert.equal(ideas.classifyLink('https://grunkdolfer.com/products/x'), null);
  assert.deepEqual(ideas.linksOf('see <https://a.com/x?a=1&amp;b=2|here>'), ['https://a.com/x?a=1&b=2']);
});
await check('thread parsing: order, names, bot posts skipped, media labelled', () => {
  const t = ideas.parseThread(threads[`${CH}:100.1`], { botUser: 'U_BOT', names: NAMES });
  assert.equal(t.msgs.length, 3);
  assert.equal(t.msgs[0].name, 'Ahsan');
  assert.deepEqual(t.msgs[0].tags, ['V1']);
  assert.deepEqual(t.msgs[1].tags, ['I1']);
  assert.equal(t.msgs[2].text, '@Cole thoughts?');
  assert.equal(t.videos.length, 1); assert.equal(t.images.length, 1);
});
await check('same video twice in a thread is read once', () => {
  const t = ideas.parseThread([{ ts: '1', user: 'U_A', text: `<${TT}>` }, { ts: '2', user: 'U_B', text: `again ${TT}` }]);
  assert.equal(t.videos.length, 1); assert.deepEqual(t.msgs[1].tags, ['V1']);
});
await check('brand override: "for Party Patch" wins, "for the hook" does not', () => {
  const accts = db.prepare('SELECT act_id, name FROM accounts').all();
  assert.equal(ideas.brandOverride('<@U_BOT> for Party Patch please', accts).act_id, PP);
  assert.equal(ideas.brandOverride('<@U_BOT> do this for grunk', accts).act_id, GRUNK);
  assert.equal(ideas.brandOverride('<@U_BOT> just for the hook', accts), null);
});
await check('money never reaches the public link', () => {
  assert.equal(ideas.noMoney('Every dad has a bad round. This ad drove a 3.2 ROAS last month.'), 'Every dad has a bad round.');
  assert.equal(ideas.noMoney('Two for $50 this week.'), 'Two for $50 this week.');
  assert.equal(ideas.noMoney('We spent $12k on it.'), '');
});

/* ---------------- idea or Strategist ---------------- */
await check('routing: numbers question stays with the Strategist; links, clips, idea words and bare tags go to ideas', async () => {
  const ev = (text, thread_ts, extra = {}) => ({ type: 'app_mention', channel: CH, ts: '999.1', thread_ts, text, ...extra });
  assert.equal(await ideas.ideaWanted(env, ev('<@U_BOT> why is CPA up?', undefined)), false);
  assert.equal(await ideas.ideaWanted(env, ev('<@U_BOT> why is CPA up?', '300.1')), false);
  assert.equal(await ideas.ideaWanted(env, ev('<@U_BOT>', '100.1')), true);
  assert.equal(await ideas.ideaWanted(env, ev('<@U_BOT> what do you think', '100.1')), true);
  assert.equal(await ideas.ideaWanted(env, ev('<@U_BOT> strategist, how is pacing?', '100.1')), false);
  assert.equal(await ideas.ideaWanted(env, ev(`<@U_BOT> <${TT}>`, undefined)), true);
  assert.equal(await ideas.ideaWanted(env, ev('<@U_BOT> brief this', undefined)), true);
  assert.equal(await ideas.ideaWanted(env, ev('<@U_BOT> roas on this?', undefined, { files: [{ mimetype: 'image/png' }] })), false);
  assert.equal(await ideas.ideaWanted(env, { ...ev('<@U_BOT>', undefined), channel_type: 'im' }), false);
});

/* ---------------- a full run ---------------- */
await check('first tag: watches the TikTok once, reads the image, one Claude call, card with buttons, cost logged', async () => {
  calls.length = 0;
  const r = await ideas.runIdeaJob(env, job('100.1'));
  assert.equal(r.ok, true, r.error);
  assert.equal(count(/scrapecreators/), 1);
  assert.equal(count(/:generateContent$/), 1);
  assert.equal(count(/api\.anthropic\.com/), 1);
  assert.equal(slackCalls('reactions.remove').length, 1);
  const x = row(`${CH}:100.1`);
  assert.equal(x.act_id, GRUNK); assert.equal(x.status, 'drafted'); assert.equal(x.from_name, 'Ahsan');
  assert.ok(x.reply_ts);
  const card = lastPost();
  assert.deepEqual(actionIds(card.blocks), ['idea_link', 'idea_asana', 'idea_studio', 'idea_redo', 'idea_discard']);
  assert.match(card.blocks.find(b => b.type === 'actions').elements[0].text.text, /suggested/);
  assert.ok(!JSON.stringify(card).includes('—'), 'em dash leaked into the card');
  assert.ok(!/ROAS/.test(JSON.stringify(JSON.parse(x.draft_json).creator_link)), 'money left in the creator draft');
  const media = db.prepare('SELECT * FROM idea_media').all();
  assert.equal(media.length, 1); assert.equal(media[0].key, 'tt:7301234567890123456');
  assert.match(media[0].facts_json, /golfguy/);
  const run = db.prepare('SELECT * FROM idea_run WHERE idea_id = ?').get(`${CH}:100.1`);
  assert.equal(run.status, 'done'); assert.equal(run.videos_new, 1); assert.equal(run.g_in, 12000); assert.equal(run.c_cache_read, 15000);
  assert.ok(run.cost > 0.04 && run.cost < 0.2, `cost ${run.cost}`);
  const sys = lastClaudeBody.system;
  assert.equal(sys.length, 2); assert.match(sys[0].text, /MOBIUS FRAMEWORK/); assert.match(sys[0].text, /SPECIFICITY RULES/);
  assert.deepEqual(sys[1].cache_control, { type: 'ephemeral' });
  const content = JSON.stringify(lastClaudeBody.messages[0].content);
  assert.match(content, /Ahsan: Look at this/); assert.match(content, /Cole: Just the hook/);
  assert.ok(lastClaudeBody.messages[0].content.some(b => b.type === 'image'));
  assert.match(content, /ang_old/);
});
await check('re-tag revises: cache hit (no re-watch, no re-download), old card retired, last draft in the prompt', async () => {
  calls.length = 0;
  threads[`${CH}:100.1`].push({ ts: '100.5', user: 'U_COLE', text: 'Make it about the cooler <@U_BOT>' });
  const before = row(`${CH}:100.1`).reply_ts;
  const r = await ideas.runIdeaJob(env, job('100.1', 'Make it about the cooler <@U_BOT>'));
  assert.equal(r.ok, true, r.error);
  assert.equal(count(/scrapecreators|generativelanguage/), 0);
  assert.equal(r.videos_cached, 1);
  assert.ok(slackCalls('chat.update').some(c => bodyOf(c).ts === before && /Replaced/.test(bodyOf(c).text)));
  const content = JSON.stringify(lastClaudeBody.messages[0].content);
  assert.match(content, /YOUR LAST DRAFT/); assert.match(content, /Cole: Make it about the cooler/);
  assert.equal(row(`${CH}:100.1`).runs, 2);
  assert.match(JSON.stringify(lastPost().blocks), /revised/);
});
await check('"for Party Patch" in the Grunk channel drafts for Party Patch', async () => {
  const r = await ideas.runIdeaJob(env, job('200.1', 'Idea <@U_BOT> for Party Patch'));
  assert.equal(r.ok, true, r.error);
  assert.equal(row(`${CH}:200.1`).act_id, PP);
  assert.match(JSON.stringify(lastClaudeBody.messages[0].content), /BRAND: Party Patch/);
});
await check('no GEMINI_API_KEY / no DOWNLOADER_KEY: says so in the thread and still drafts from the words', async () => {
  db.exec('DELETE FROM idea_media');
  const e2 = { ...env, GEMINI_API_KEY: '' };
  calls.length = 0;
  let r = await ideas.runIdeaJob(e2, job('400.1'));
  assert.equal(r.ok, true, r.error);
  assert.match(JSON.stringify(lastPost().blocks), /GEMINI_API_KEY is missing/);
  assert.equal(count(/generativelanguage/), 0);
  const e3 = { ...env, DOWNLOADER_KEY: '' };
  db.exec(`DELETE FROM idea_thread WHERE id = '${CH}:100.1'`);
  r = await ideas.runIdeaJob(e3, job('100.1'));
  assert.equal(r.ok, true, r.error);
  assert.match(JSON.stringify(lastPost().blocks), /no downloader key is set/);
  assert.match(JSON.stringify(lastClaudeBody.messages[0].content), /MEDIA I COULD NOT READ/);
});
await check('YouTube goes straight to Gemini by URL (no download)', async () => {
  db.exec(`DELETE FROM idea_thread WHERE id = '${CH}:400.1'`);
  calls.length = 0;
  await ideas.runIdeaJob(env, job('400.1'));
  const g = calls.find(c => /:generateContent$/.test(c.url));
  assert.equal(JSON.parse(g.init.body).contents[0].parts[0].file_data.file_uri, 'https://www.youtube.com/watch?v=abcdefghijk');
  assert.equal(count(/scrapecreators|upload/), 0);
});
await check('blocking question: questions only, no draft, no buttons', async () => {
  claudeQueue.push(draft({ questions: [{ q: 'Which persona is this for, the Weekend Warrior or the gift buyer?', blocking: true }] }));
  const r = await ideas.runIdeaJob(env, job('300.1', '<@U_BOT> idea'));
  assert.equal(r.status, 'questions');
  const card = lastPost();
  assert.equal(card.blocks.find(b => b.type === 'actions'), undefined);
  assert.match(JSON.stringify(card.blocks), /Which persona/);
  assert.doesNotMatch(JSON.stringify(card.blocks), /Garage rant hook/);
});

/* ---------------- buttons ---------------- */
const ID = `${CH}:100.1`;
await check('approver gate: a non-approver cannot send anything on', async () => {
  calls.length = 0;
  await press('idea_asana', ID, 'U_RANDO');
  assert.equal(count(/asana\.com/), 0);
  assert.match(bodyOf(slackCalls('chat.postEphemeral')[0]).text, /Only Cole or Ahsan/);
  await press('idea_link', ID, 'U_RANDO');
  assert.equal(db.prepare(`SELECT COUNT(*) n FROM p_amb_angle`).get().n, 1);
  assert.equal(ideas.approversOf({ IDEA_APPROVERS: 'U1, U2' }).join(), 'U1,U2');
});
await check('a button from another channel is refused', async () => {
  calls.length = 0;
  await press('idea_link', ID, 'U_COLE', 'C_OTHER');
  assert.match(bodyOf(slackCalls('chat.postEphemeral')[0]).text, /no longer stored/);
});
await check('creator link: new live angle in the picked section, reference as inspiration proof, no money, link posted with Undo', async () => {
  calls.length = 0;
  await press('idea_link', ID);
  const a = db.prepare(`SELECT * FROM p_amb_angle WHERE title = 'The garage rant'`).get();
  assert.ok(a); assert.equal(a.status, 'live'); assert.equal(a.section_id, 'sec_dad');
  assert.doesNotMatch(a.argument, /ROAS|3\.2/);
  const p = db.prepare('SELECT * FROM p_amb_proof WHERE angle_id = ?').get(a.id);
  assert.equal(p.kind, 'inspo'); assert.equal(p.url, TT); assert.equal(p.who, 'Another brand (inspiration)');
  const post = lastPost();
  assert.match(post.text, /angles\/grunk-dolfer/);
  assert.deepEqual(actionIds(post.blocks), ['idea_undo_link']);
  assert.equal(row(ID).status, 'pushed');
  assert.ok(actionIds(cardOf(ID).blocks).includes('idea_undo_link'));
  assert.ok(!actionIds(cardOf(ID).blocks).includes('idea_link'));
});
await check('a second press does not add it twice', async () => {
  calls.length = 0;
  await press('idea_link', ID);
  assert.equal(db.prepare(`SELECT COUNT(*) n FROM p_amb_angle WHERE title = 'The garage rant'`).get().n, 1);
  assert.match(bodyOf(slackCalls('chat.postEphemeral')[0]).text, /Already sent/);
});
await check('Undo takes the angle and its proof back off', async () => {
  await press('idea_undo_link', ID);
  assert.equal(db.prepare(`SELECT COUNT(*) n FROM p_amb_angle WHERE title = 'The garage rant'`).get().n, 0);
  assert.equal(db.prepare(`SELECT COUNT(*) n FROM p_amb_proof`).get().n, 0);
  assert.match(lastPost().text, /Taken back off/);
  assert.equal(JSON.parse(row(ID).pushed_json).creator_link, undefined);
});
await check('duplicate angle: the reference goes on the existing angle as proof, no new angle', async () => {
  const d = JSON.parse(row(ID).draft_json);
  d.creator_link.duplicate_of = 'ang_old';
  db.prepare('UPDATE idea_thread SET draft_json = ? WHERE id = ?').run(JSON.stringify(d), ID);
  await press('idea_link', ID);
  assert.equal(db.prepare(`SELECT COUNT(*) n FROM p_amb_angle`).get().n, 1);
  assert.equal(db.prepare(`SELECT angle_id FROM p_amb_proof`).get().angle_id, 'ang_old');
  assert.match(lastPost().text, /proof on "The cart path cooler"/);
  await press('idea_undo_link', ID);
  assert.equal(db.prepare(`SELECT COUNT(*) n FROM p_amb_angle WHERE id = 'ang_old'`).get().n, 1, 'undo must never delete an angle it did not create');
});
await check('Asana: numbered task in Creative Brief, template layout, credit, reference, Testing field', async () => {
  calls.length = 0;
  await press('idea_asana', ID);
  const create = calls.find(c => /app\.asana\.com\/api\/1\.0\/tasks\?opt_fields/.test(c.url) && c.init.method === 'POST');
  const body = JSON.parse(create.init.body).data;
  assert.equal(body.name, '353 - Garage rant hook');
  assert.deepEqual(body.projects, ['P1']);
  for (const s of ['<h2>The test</h2>', '<strong>Angle:</strong>', '<h2>The ads</h2>', '<strong>Ad 3:</strong>', '<h2>The video</h2>', '<strong>Hook 2:</strong>', '<h2>Files</h2>', 'Idea from Ahsan', TT.replace(/&/g, '&amp;'), 'Concept test'])
    assert.ok(body.html_notes.includes(s), 'missing ' + s);
  assert.ok(calls.some(c => /sections\/S1\/addTask/.test(c.url)));
  const field = calls.find(c => /tasks\/T1$/.test(c.url) && c.init.method === 'PUT');
  assert.deepEqual(JSON.parse(field.init.body).data.custom_fields, { F_TEST: 'O_C' });
  assert.match(lastPost().text, /Brief 353 .*app\.asana\.com\/0\/P1\/T1/);
  assert.equal(JSON.parse(row(ID).pushed_json).asana_brief.num, 353);
});
await check('Studio: a draft batch in p_studio_batch with one line per ad, numbered after the Asana brief', async () => {
  await press('idea_studio', ID);
  const b = db.prepare(`SELECT * FROM p_studio_batch`).get();
  assert.equal(b.act_id, GRUNK); assert.equal(b.status, 'draft'); assert.equal(b.num, '353'); assert.match(b.id, /^[a-f0-9]{24}$/);
  const brief = JSON.parse(b.brief_json);
  assert.equal(brief.lines.length, 2); assert.equal(brief.testing, 'headlines'); assert.deepEqual(brief.lines[0].inspo, []);
  assert.deepEqual(JSON.parse(b.setup_json), { products: [], images: [], swipe: [] });
});
await check('Lucky creator app button only on Lucky, and it stores the draft and says the hookup is next', async () => {
  const r = await ideas.runIdeaJob(env, job('500.1', '<@U_BOT>', LUCKY_CH));
  assert.equal(r.ok, true, r.error);
  assert.ok(actionIds(lastPost().blocks).includes('idea_lucky'));
  assert.ok(!actionIds(cardOf(ID).blocks).includes('idea_lucky'));
  await press('idea_lucky', `${LUCKY_CH}:500.1`, 'U_COLE', LUCKY_CH);
  assert.match(lastPost().text, /Lucky creator app hookup is next/);
  assert.ok(JSON.parse(row(`${LUCKY_CH}:500.1`).pushed_json).lucky_creators);
  assert.ok(JSON.parse(row(`${LUCKY_CH}:500.1`).draft_json).creator_link.title);
});
await check('Redo is open to anyone and re-runs from the cache; Discard is approver-only', async () => {
  calls.length = 0;
  await press('idea_redo', ID, 'U_RANDO');
  assert.equal(count(/api\.anthropic\.com/), 1);
  assert.doesNotMatch(JSON.stringify(lastClaudeBody.messages[0].content), /YOUR LAST DRAFT/);
  await press('idea_discard', ID, 'U_RANDO');
  assert.notEqual(row(ID).status, 'discarded');
  await press('idea_discard', ID, 'U_AHSAN');
  assert.equal(row(ID).status, 'discarded');
  assert.match(JSON.stringify(cardOf(ID).blocks), /Discarded by Ahsan/);
});

/* ---------------- the account-health Slack door ---------------- */
const secret = 'test-signing-secret';
const sign = (raw, t = Math.floor(Date.now() / 1000)) => ({ 'x-slack-request-timestamp': String(t), 'x-slack-signature': 'v0=' + crypto.createHmac('sha256', secret).update(`v0:${t}:${raw}`).digest('hex') });
let worker = null;
try { worker = (await import('./src/worker.js')).default; } catch (e) { checks.push({ name: 'load worker.js', pass: false, error: e.message }); }
if (worker) {
  const wenv = { ...env, SLACK_SIGNING_SECRET: secret, sent: [], IDEA_Q: { send: async j => { wenv.sent.push(j); } } };
  const post = async (pathName, raw, headers, ctype = 'application/json') => {
    const waits = [];
    const res = await worker.fetch(new Request('https://ah.test' + pathName, { method: 'POST', headers: { 'Content-Type': ctype, ...headers }, body: raw }), wenv, { waitUntil: p => waits.push(p) });
    await Promise.allSettled(waits);
    return res;
  };
  await check('Slack door: unsigned event refused; signed idea tag acked with eyes and queued', async () => {
    const raw = JSON.stringify({ type: 'event_callback', event_id: 'Ev1', authorizations: [{ user_id: 'U_BOT' }], event: { type: 'app_mention', channel: CH, ts: '700.2', thread_ts: '100.1', user: 'U_AHSAN', text: '<@U_BOT>' } });
    assert.equal((await post('/slack/events', raw, { 'x-slack-request-timestamp': '1', 'x-slack-signature': 'v0=bad' })).status, 401);
    calls.length = 0;
    assert.equal((await post('/slack/events', raw, sign(raw))).status, 200);
    assert.equal(wenv.sent.length, 1);
    assert.equal(wenv.sent[0].root, '100.1'); assert.equal(wenv.sent[0].bot, 'U_BOT');
    assert.equal(bodyOf(slackCalls('reactions.add')[0]).name, 'eyes');
    assert.equal((await post('/slack/events', raw, sign(raw))).status, 200);
    assert.equal(wenv.sent.length, 1, 'a Slack retry must not queue the job twice');
  });
  await check('Slack door: a numbers question goes to the Strategist, not the ideas queue', async () => {
    const raw = JSON.stringify({ type: 'event_callback', event: { type: 'app_mention', channel: CH, ts: '800.1', user: 'U_AHSAN', text: 'Why is CPA up this week? <@U_BOT>' } });
    await post('/slack/events', raw, sign(raw));
    assert.equal(wenv.sent.length, 1);
  });
  await check('kill switch IDEAS_BOT=off: tags go to the Strategist, idea buttons do nothing', async () => {
    wenv.IDEAS_BOT = 'off';
    const raw = JSON.stringify({ type: 'event_callback', event: { type: 'app_mention', channel: CH, ts: '810.1', user: 'U_AHSAN', text: `<@U_BOT> <${TT}>` } });
    await post('/slack/events', raw, sign(raw));
    assert.equal(wenv.sent.length, 1);
    calls.length = 0;
    const b = 'payload=' + encodeURIComponent(JSON.stringify({ type: 'block_actions', user: { id: 'U_COLE' }, container: { channel_id: CH }, actions: [{ action_id: 'idea_studio', value: JSON.stringify({ i: `${CH}:200.1` }) }] }));
    assert.equal((await post('/slack/actions', b, sign(b), 'application/x-www-form-urlencoded')).status, 200);
    assert.equal(calls.length, 0);
    delete wenv.IDEAS_BOT;
  });
  await check('Slack door: url_verification still answers', async () => {
    const raw = JSON.stringify({ type: 'url_verification', challenge: 'abc' });
    assert.equal((await (await post('/slack/events', raw, sign(raw))).json()).challenge, 'abc');
  });
  await check('Slack buttons: idea_ actions reach the ideas bot through /slack/actions (signature checked)', async () => {
    const raw = 'payload=' + encodeURIComponent(JSON.stringify({ type: 'block_actions', user: { id: 'U_RANDO' }, container: { channel_id: CH }, actions: [{ action_id: 'idea_asana', value: JSON.stringify({ i: `${CH}:200.1` }) }] }));
    assert.equal((await post('/slack/actions', raw, { 'x-slack-request-timestamp': '1', 'x-slack-signature': 'v0=bad' }, 'application/x-www-form-urlencoded')).status, 401);
    calls.length = 0;
    assert.equal((await post('/slack/actions', raw, sign(raw), 'application/x-www-form-urlencoded')).status, 200);
    assert.match(bodyOf(slackCalls('chat.postEphemeral')[0]).text, /Only Cole or Ahsan/);
  });
}

/* ---------------- slack-router ---------------- */
const router = (await import('../../slack-router/worker/src/worker.js')).default;
const hits = [];
const binding = name => ({ fetch: async req => { hits.push({ name, url: req.url }); return new Response('', { status: 200 }); } });
const renv = { SLACK_SIGNING_SECRET: secret, LEDGER: binding('LEDGER'), AUTH: binding('AUTH'), PULSE: binding('PULSE') };
const route = async payload => { hits.length = 0; const raw = 'payload=' + encodeURIComponent(JSON.stringify(payload)); await router.fetch(new Request('https://r.test/slack', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', ...sign(raw) }, body: raw }), renv); return hits[0]?.name; };
await check('router: idea_ buttons go to account-health; Ledger, Locus and Pulse unchanged', async () => {
  assert.equal(await route({ type: 'block_actions', actions: [{ action_id: 'idea_link', value: '{"i":"C1:1.2"}' }] }), 'AUTH');
  assert.equal(await route({ type: 'block_actions', actions: [{ action_id: 'idea_undo_link', value: '{"i":"C1:1.2"}' }] }), 'AUTH');
  assert.equal(await route({ type: 'block_actions', actions: [{ action_id: 'x', value: '{"id":1,"tax":"Meals"}' }] }), 'LEDGER');
  assert.equal(await route({ type: 'block_actions', actions: [{ action_id: 'x', value: '{"undo":5}' }] }), 'LEDGER');
  assert.equal(await route({ type: 'block_actions', actions: [{ action_id: 'brief_send', value: '{}' }] }), 'AUTH');
  assert.equal(await route({ type: 'block_actions', actions: [{ action_id: 'pulse_x', value: '{}' }] }), 'PULSE');
  assert.equal(hits[0].url, 'https://mobius-ad-status.mobius-digital.workers.dev/slack/interact');
});

const failed = checks.filter(c => !c.pass);
for (const c of checks) console.log(`${c.pass ? 'PASS' : 'FAIL'}  ${c.name}${c.pass ? '' : `\n      ${c.error}`}`);
console.log(`\n${checks.length - failed.length}/${checks.length} passed`);
process.exit(failed.length ? 1 : 0);

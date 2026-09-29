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
    if (/:streamGenerateContent$/.test(u.pathname)) {
      /* Streamed like the real API: the JSON arrives in two SSE chunks, usage on the last one. */
      const full = JSON.stringify({ format: ['yapper'], length_seconds: 42, hook: { spoken: 'I shot a 112 today', on_screen_text: 'worst round', visual: 'man in garage' }, transcript: 'I shot a 112 today...' });
      const half = Math.floor(full.length / 2);
      const sse = [{ candidates: [{ content: { parts: [{ text: full.slice(0, half) }] } }] }, { candidates: [{ content: { parts: [{ text: full.slice(half) }] } }], usageMetadata: { promptTokenCount: 12000, candidatesTokenCount: 800 } }]
        .map(c => `data: ${JSON.stringify(c)}

`).join('');
      return new Response(sse, { headers: { 'Content-Type': 'text/event-stream' } });
    }
  }
  if (u.hostname === 'app.asana.com') {
    const p = u.pathname.replace('/api/1.0', '');
    if (p === '/projects/P1/sections') return Response.json({ data: [{ gid: 'S0', name: 'Client Resources' }, { gid: 'S1', name: 'Creative Brief' }] });
    if (p === '/tasks' && (init.method || 'GET') === 'GET') return Response.json({ data: [{ gid: 'T0', name: '352 - Newer task' }] });
    if (p === '/tasks') return Response.json({ data: { gid: 'T1', name: JSON.parse(init.body).data.name, permalink_url: 'https://app.asana.com/0/P1/T1' } });
    return Response.json({ data: {} });
  }
  if (u.hostname === 'auth.tryatria.com') return atriaAuth(u, init);
  if (u.hostname === 'api.tryatria.com') return atriaMcp(u, init);
  if (u.hostname === 'cdn.tryatria.com') return new Response(new Uint8Array(2048), { headers: { 'content-type': 'video/mp4', 'content-length': '2048' } });
  if (u.hostname === 'scontent.xx.fbcdn.net') return new Response(new Uint8Array([255, 216, 255, 1, 2]), { headers: { 'content-type': 'image/jpeg' } });
  throw new Error('Unexpected network call in offline test: ' + url);
};

/* ---------------- Atria mocks: OAuth server + MCP server ---------------- */
const ATRIA = { valid: new Set(), session: 'SESS1', revoked: [] };
const ATRIA_ADS = {
  m742305868280793: { ad_id: 'm742305868280793', advertiser_name: 'Zound', title: 'Concert earplugs that keep the music clear', body: 'Hear every note. 40% off today.', cta_text: 'Shop now',
    link_url: 'https://zound.com/earplugs', days_running: 142, start_date: '2026-05-10', status: 'active', display_format: 'video', media_format: 'video', video_duration: 67,
    images: [], videos: [{ url: 'https://cdn.tryatria.com/adfiles/m742305868280793_x.mp4', duration_seconds: 67, preview_image_url: 'https://cdn.tryatria.com/p.jpg' }] },
  m555000111: { ad_id: 'm555000111', advertiser_name: 'Hat Co', title: 'The hat that fits', body: 'Fits every head.', cta_text: 'Learn more', link_url: 'https://hat.co',
    days_running: 12, start_date: '2026-09-17', status: 'active', display_format: 'image', media_format: 'image', images: [{ url: 'https://scontent.xx.fbcdn.net/hat.jpg' }], videos: [] },
};
function atriaAuth(u, init) {
  const form = new URLSearchParams(init.body || '');
  if (u.pathname === '/.well-known/oauth-authorization-server') return Response.json({ authorization_endpoint: 'https://auth.tryatria.com/oauth/authorize', token_endpoint: 'https://auth.tryatria.com/oauth/token',
    registration_endpoint: 'https://auth.tryatria.com/oauth/register', revocation_endpoint: 'https://auth.tryatria.com/oauth/revoke' });
  if (u.pathname === '/oauth/register') { ATRIA.registered = JSON.parse(init.body); return Response.json({ client_id: 'CID1', client_secret: 'CSECRET1', token_endpoint_auth_method: 'client_secret_basic' }, { status: 201 }); }
  if (u.pathname === '/oauth/revoke') { ATRIA.revoked.push(form.get('token')); return new Response('', { status: 200 }); }
  if (u.pathname === '/oauth/token') {
    ATRIA.lastToken = { form: Object.fromEntries(form), auth: init.headers?.Authorization || '' };
    if (init.headers?.Authorization !== `Basic ${btoa('CID1:CSECRET1')}`) return Response.json({ error: 'invalid_client' }, { status: 401 });
    if (form.get('grant_type') === 'authorization_code' && form.get('code') === 'CODE1' && form.get('code_verifier')) { ATRIA.valid.add('AT1'); return Response.json({ access_token: 'AT1', refresh_token: 'RT1', expires_in: 3600 }); }
    if (form.get('grant_type') === 'refresh_token' && form.get('refresh_token') === 'RT1') { ATRIA.valid.add('AT2'); return Response.json({ access_token: 'AT2', refresh_token: 'RT2', expires_in: 3600 }); }
    return Response.json({ error: 'invalid_grant' }, { status: 400 });
  }
  return new Response('', { status: 404 });
}
function atriaMcp(u, init) {
  const tok = String(init.headers?.Authorization || '').replace('Bearer ', '');
  if (!ATRIA.valid.has(tok)) return Response.json({ error: 'unauthorized' }, { status: 401 });
  const m = JSON.parse(init.body);
  if (m.method === 'initialize') return Response.json({ jsonrpc: '2.0', id: m.id, result: { protocolVersion: '2025-06-18', capabilities: { tools: {} }, serverInfo: { name: 'atria' } } }, { headers: { 'mcp-session-id': ATRIA.session } });
  if (m.method === 'notifications/initialized') return new Response(null, { status: 202 });
  if (init.headers['Mcp-Session-Id'] !== ATRIA.session) return new Response('no session', { status: 400 });
  const { name, arguments: a } = m.params;
  const text = o => ({ jsonrpc: '2.0', id: m.id, result: { content: [{ type: 'text', text: JSON.stringify(o) }] } });
  if (name === 'get_library_ad') {
    const ad = ATRIA_ADS[a.ad_id];
    const msg = ad ? text(ad) : { jsonrpc: '2.0', id: m.id, result: { isError: true, content: [{ type: 'text', text: `Ad not found: ${a.ad_id}` }] } };
    /* This one answers as an SSE stream, the other two as plain JSON: the client must read both. */
    return new Response(`event: message\ndata: ${JSON.stringify(msg)}\n\n`, { headers: { 'content-type': 'text/event-stream' } });
  }
  if (name === 'get_library_ad_transcript') return Response.json(text({ ad_id: a.ad_id, status: 'ready', text: '5 reasons why you need Zound earplugs for concerts', segments: [] }));
  if (name === 'get_library_ad_creative_tags') {
    if (!Array.isArray(a.ad_ids)) return Response.json({ jsonrpc: '2.0', id: m.id, result: { isError: true, content: [{ type: 'text', text: 'ad_ids must be an array' }] } });
    return Response.json(text({ results: [{ ad_id: a.ad_ids[0], tags: { hook_type: 'listicle', creator: 'UGC woman 25-34', angle: 'music stays clear' } }] }));
  }
  return Response.json({ jsonrpc: '2.0', id: m.id, error: { code: -32601, message: 'unknown tool' } });
}

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
  assert.equal(count(/:streamGenerateContent/), 1);
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
  /* Sonnet 5.5 by default (Cole's target: $0.06 or less): 3000 in + 15000 cache read + 1500 out + Gemini. */
  assert.ok(run.cost > 0.02 && run.cost < 0.06, `cost ${run.cost}`);
  assert.equal(lastClaudeBody.model, 'claude-sonnet-5-5');
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
  const g = calls.find(c => /:streamGenerateContent/.test(c.url));
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
await check('only the suggested draft up front; "Make Asana brief draft" writes just that one on top of the stored draft', async () => {
  const id = `${CH}:700.1`;
  threads[id] = [{ ts: '700.1', user: 'U_COLE', text: 'Typed idea: a dad rants about his round <@U_BOT>' }];
  claudeQueue.push(draft({ asana: { ...draft().asana, title: '', ads: [] }, studio: { ...draft().studio, lines: [] } }));
  const r = await ideas.runIdeaJob(env, job('700.1', '<@U_BOT>'));
  assert.equal(r.ok, true, r.error);
  const ids = actionIds(lastPost().blocks);
  assert.ok(ids.includes('idea_link') && !ids.includes('idea_asana') && ids.filter(x => x === 'idea_make').length === 2, ids.join(','));
  assert.match(lastClaudeBody.system[0].text, /write ONLY the draft for the destination you picked/);
  calls.length = 0;
  claudeQueue.push({ asana: { ...draft().asana, title: 'Made on demand' } });
  await ideas.handleIdeaAction(env, null, { type: 'block_actions', user: { id: 'U_RANDO' }, container: { channel_id: CH }, actions: [{ action_id: 'idea_make', value: JSON.stringify({ i: id, k: 'asana_brief' }) }] });
  assert.equal(count(/api\.anthropic\.com/), 1);
  assert.match(JSON.stringify(lastClaudeBody.messages[0].content), /NOW WRITE ONLY THE ASANA BRIEF DRAFT/);
  assert.deepEqual(Object.keys(lastClaudeBody.output_format?.schema?.properties || lastClaudeBody.tools?.[0]?.input_schema?.properties || {}).length <= 1, true);
  const d = JSON.parse(row(id).draft_json);
  assert.equal(d.asana.title, 'Made on demand');
  assert.equal(d.creator_link.title, 'The garage rant', 'the stored creator draft survives');
  assert.ok(actionIds(lastPost().blocks).includes('idea_asana'));
});
await check('"deep" in the tag runs Opus with the full brain, and Redo on that thread stays deep', async () => {
  const id = `${CH}:710.1`;
  threads[id] = [{ ts: '710.1', user: 'U_COLE', text: 'Big one, go deep on this <@U_BOT>' }];
  const r = await ideas.runIdeaJob(env, job('710.1', '<@U_BOT> deep'));
  assert.equal(r.ok, true, r.error);
  assert.equal(lastClaudeBody.model, 'claude-opus-5');
  assert.equal(row(id).deep, 1);
  await ideas.handleIdeaAction(env, null, { type: 'block_actions', user: { id: 'U_RANDO' }, container: { channel_id: CH }, actions: [{ action_id: 'idea_redo', value: JSON.stringify({ i: id }) }] });
  assert.equal(lastClaudeBody.model, 'claude-opus-5');
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

/* ---------------- Atria ---------------- */
const atria = await import('./src/atria.js');
const AT_LINK = 'https://app.tryatria.com/ad/m742305868280793';
const FB_LINK = 'https://www.facebook.com/ads/library/?active_status=all&id=555000111';
const cfg = k => db.prepare('SELECT value FROM p_studio_cfg WHERE key = ?').get(k)?.value || null;
const jr = (o, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { 'Content-Type': 'application/json' } });
const adminOk = async req => (req.headers.get('Authorization') || '') === 'Bearer adm';
const atRoute = (p, method = 'GET', auth = 'adm') => atria.handleAtria(new Request(`https://ah.test${p}`, { method, headers: auth ? { Authorization: `Bearer ${auth}` } : {} }), env, new URL(`https://ah.test${p}`), new URL(`https://ah.test${p}`).pathname, jr, adminOk);
threads[`${CH}:600.1`] = [{ ts: '600.1', user: 'U_AHSAN', text: `This one has run for months <${AT_LINK}> just the hook <@U_BOT>` }];
threads[`${CH}:610.1`] = [{ ts: '610.1', user: 'U_AHSAN', text: `Static idea <${FB_LINK.replace(/&/g, '&amp;')}> <@U_BOT>` }];
threads[`${CH}:620.1`] = [{ ts: '620.1', user: 'U_AHSAN', text: 'Not in Atria <https://app.tryatria.com/ad/m999999999> <@U_BOT>' }];

await check('Atria links: app.tryatria.com/ad/<id> and Meta Ad Library ?id= both become Atria ids; public ref for the creator link', () => {
  const a = ideas.classifyLink(AT_LINK);
  assert.equal(a.platform, 'atria'); assert.equal(a.key, 'atria:m742305868280793'); assert.equal(a.atria, 'm742305868280793');
  const f = ideas.classifyLink(FB_LINK);
  assert.equal(f.key, 'atria:m555000111'); assert.equal(f.url, 'https://www.facebook.com/ads/library/?id=555000111');
  assert.equal(ideas.classifyLink('https://www.facebook.com/ads/library/?id=742305868280793').atria, 'm742305868280793');
  assert.equal(ideas.classifyLink('https://www.facebook.com/somepage'), null);
  assert.equal(ideas.publicRef(AT_LINK), 'https://www.facebook.com/ads/library/?id=742305868280793');
  assert.equal(ideas.publicRef(TT), TT);
});
await check('Atria not connected: one line in the thread, the draft still comes from the words', async () => {
  calls.length = 0;
  const r = await ideas.runIdeaJob(env, job('600.1'));
  assert.equal(r.ok, true, r.error);
  assert.equal(count(/tryatria/), 0, 'no Atria call without a connection');
  assert.match(JSON.stringify(lastPost().blocks), /Atria is not connected/);
  assert.match(JSON.stringify(lastClaudeBody.messages[0].content), /MEDIA I COULD NOT READ/);
  assert.equal(db.prepare(`SELECT COUNT(*) n FROM idea_media WHERE key LIKE 'atria:%'`).get().n, 0);
  db.exec(`DELETE FROM idea_thread WHERE id = '${CH}:600.1'`);
});
await check('Connect Atria: admin only; registers once (DCR, atria:read), PKCE S256 sign-in URL with the MCP resource', async () => {
  assert.equal((await atRoute('/api/atria/start', 'POST', 'nope')).status, 401);
  assert.equal((await (await atRoute('/api/atria/status')).json()).connected, false);
  const r = await (await atRoute('/api/atria/start', 'POST')).json();
  const q = new URL(r.url);
  assert.equal(q.origin + q.pathname, 'https://auth.tryatria.com/oauth/authorize');
  assert.equal(q.searchParams.get('client_id'), 'CID1'); assert.equal(q.searchParams.get('scope'), 'atria:read');
  assert.equal(q.searchParams.get('code_challenge_method'), 'S256'); assert.ok(q.searchParams.get('code_challenge').length >= 43);
  assert.equal(q.searchParams.get('redirect_uri'), 'https://ah.test/atria/callback'); assert.equal(q.searchParams.get('resource'), 'https://api.tryatria.com/mcp');
  assert.deepEqual(ATRIA.registered.redirect_uris, ['https://ah.test/atria/callback']); assert.equal(ATRIA.registered.scope, 'atria:read');
  assert.ok(!JSON.stringify(r).includes('CSECRET1'), 'the client secret must never reach the browser');
  calls.length = 0;
  await (await atRoute('/api/atria/start', 'POST')).json();
  assert.equal(count(/oauth\/register/), 0, 'registers once');
  ATRIA.state = new URL((await (await atRoute('/api/atria/start', 'POST')).json()).url).searchParams.get('state');
});
await check('Atria callback: wrong state refused; right state swaps the code (Basic auth, PKCE verifier) and stores tokens', async () => {
  let res = await atRoute('/atria/callback?code=CODE1&state=forged', 'GET', null);
  assert.match(await res.text(), /did not connect/);
  assert.equal(cfg('atria_tokens'), null);
  res = await atRoute(`/atria/callback?code=CODE1&state=${ATRIA.state}`, 'GET', null);
  assert.match(await res.text(), /Atria is connected/);
  assert.equal(ATRIA.lastToken.form.grant_type, 'authorization_code'); assert.ok(ATRIA.lastToken.form.code_verifier.length >= 43);
  assert.equal(JSON.parse(cfg('atria_tokens')).refresh, 'RT1');
  assert.equal(cfg('atria_state'), null, 'the state is single-use');
  const st = await (await atRoute('/api/atria/status')).json();
  assert.equal(st.connected, true); assert.ok(!JSON.stringify(st).includes('AT1') && !JSON.stringify(st).includes('RT1'), 'tokens never leave the worker');
  res = await atRoute(`/atria/callback?code=CODE1&state=${ATRIA.state}`, 'GET', null);
  assert.match(await res.text(), /out of date/);
});
await check('Atria video ad: MCP (SSE and JSON), public MP4 watched once by Gemini, Atria facts + running signal + transcript + tags in the prompt', async () => {
  calls.length = 0;
  const r = await ideas.runIdeaJob(env, job('600.1'));
  assert.equal(r.ok, true, r.error);
  const tools = calls.filter(c => c.url === 'https://api.tryatria.com/mcp').map(c => JSON.parse(c.init.body)).filter(m => m.method === 'tools/call').map(m => m.params.name);
  assert.deepEqual(tools, ['get_library_ad', 'get_library_ad_transcript', 'get_library_ad_creative_tags']);
  assert.equal(count(/cdn\.tryatria\.com/), 1); assert.equal(count(/:streamGenerateContent/), 1); assert.equal(count(/api\.anthropic\.com/), 1);
  const content = JSON.stringify(lastClaudeBody.messages[0].content);
  for (const s of ['Zound', 'Concert earplugs that keep the music clear', 'Shop now', 'zound.com/earplugs', 'Running 142 days since 2026-05-10', 'a signal, not proof', '5 reasons why you need Zound', 'listicle', 'I shot a 112 today'])
    assert.ok(content.includes(s), 'prompt is missing ' + s);
  assert.match(lastClaudeBody.system[0].text, /Atria ad library/);
  const m = db.prepare(`SELECT * FROM idea_media WHERE key = 'atria:m742305868280793'`).get();
  assert.equal(m.platform, 'atria'); assert.ok(m.g_in > 0);
  assert.equal(r.videos_new, 1);
  assert.deepEqual(JSON.parse(row(`${CH}:600.1`).refs_json), [AT_LINK]);
  assert.doesNotMatch(JSON.stringify(lastPost().blocks), /not connected|could not/);
});
await check('Atria re-tag: from the cache, no MCP call, no download, no re-watch', async () => {
  calls.length = 0;
  const r = await ideas.runIdeaJob(env, job('600.1', 'Make it for the cooler <@U_BOT>'));
  assert.equal(r.ok, true, r.error);
  assert.equal(count(/tryatria|generativelanguage/), 0);
  assert.equal(r.videos_cached, 1);
  assert.match(JSON.stringify(lastClaudeBody.messages[0].content), /Running 142 days/);
});
await check('Meta Ad Library image ad: token refreshed on expiry, image goes to Claude, no Gemini; cached with its image', async () => {
  const t = JSON.parse(cfg('atria_tokens')); t.exp = Date.now() - 1000;
  db.prepare('UPDATE p_studio_cfg SET value = ? WHERE key = ?').run(JSON.stringify(t), 'atria_tokens');
  calls.length = 0;
  const r = await ideas.runIdeaJob(env, job('610.1'));
  assert.equal(r.ok, true, r.error);
  assert.equal(ATRIA.lastToken.form.grant_type, 'refresh_token');
  assert.equal(JSON.parse(cfg('atria_tokens')).access, 'AT2'); assert.equal(JSON.parse(cfg('atria_tokens')).refresh, 'RT2');
  assert.equal(count(/generativelanguage/), 0);
  assert.ok(lastClaudeBody.messages[0].content.some(b => b.type === 'image'));
  assert.match(JSON.stringify(lastClaudeBody.messages[0].content), /Hat Co/);
  assert.ok(calls.filter(c => c.url === 'https://api.tryatria.com/mcp').map(c => JSON.parse(c.init.body)).some(m => m.params?.name === 'get_library_ad' && m.params.arguments.ad_id === 'm555000111'));
  calls.length = 0;
  await ideas.runIdeaJob(env, job('610.1'));
  assert.equal(count(/tryatria/), 0);
  assert.equal(count(/fbcdn/), 1, 'the cached image still reaches Claude');
  assert.ok(lastClaudeBody.messages[0].content.some(b => b.type === 'image'));
});
await check('Ad not in Atria: one line in the thread, still drafts, nothing cached', async () => {
  const r = await ideas.runIdeaJob(env, job('620.1'));
  assert.equal(r.ok, true, r.error);
  assert.match(JSON.stringify(lastPost().blocks), /not in Atria's library/);
  assert.equal(db.prepare(`SELECT COUNT(*) n FROM idea_media WHERE key = 'atria:m999999999'`).get().n, 0);
});
await check('Creator link proof for an Atria reference is the public Meta Ad Library page', async () => {
  await press('idea_link', `${CH}:600.1`);
  const a = db.prepare(`SELECT id FROM p_amb_angle WHERE title = 'The garage rant'`).get();
  assert.equal(db.prepare('SELECT url FROM p_amb_proof WHERE angle_id = ?').get(a.id).url, 'https://www.facebook.com/ads/library/?id=742305868280793');
  await press('idea_undo_link', `${CH}:600.1`);
});
await check('Disconnect Atria: refresh token revoked, client and tokens forgotten', async () => {
  const r = await (await atRoute('/api/atria/disconnect', 'POST')).json();
  assert.equal(r.connected, false);
  assert.deepEqual(ATRIA.revoked, ['RT2']);
  assert.equal(cfg('atria_tokens'), null); assert.equal(cfg('atria_client'), null);
  assert.equal((await (await atRoute('/api/atria/status')).json()).connected, false);
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
  await check('worker routes: /api/atria/* needs a sign-in, /atria/callback is public', async () => {
    const res = await worker.fetch(new Request('https://ah.test/api/atria/status'), wenv, { waitUntil() {} });
    assert.equal(res.status, 401);
    const cb = await worker.fetch(new Request('https://ah.test/atria/callback?code=x&state=y'), wenv, { waitUntil() {} });
    assert.equal(cb.status, 200); assert.match(await cb.text(), /did not connect/);
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

/* Offline checks for POST /api/slack/example-dm (src/exampledm.js): owner only, the "Example, not real" marker,
 * the limits, and that every post goes to the owner's own DM as the bot, whatever the body says.
 * The real slackPostWith runs against a stub fetch: nothing leaves the machine.
 *   node test-exampledm.mjs */
import assert from 'node:assert/strict';
import { handleExampleDm } from './src/exampledm.js';
import { slackPostWith } from './src/sender.js';
import { OWNER_SLACK } from './src/slackaccess.js';

let n = 0, bad = 0;
const check = async (name, fn) => { try { await fn(); n++; console.log('PASS ', name); } catch (e) { bad++; console.log('FAIL ', name, '\n   ', String(e.stack || e).split('\n').slice(0, 4).join('\n    ')); } };

const env = { SLACK_BOT_TOKEN: 'xoxb-bot', SLACK_USER_TOKEN: 'xoxp-user' };
const mkSlack = (reply = () => ({ ok: true })) => {
  const calls = [];
  const F = async (u, init) => { const b = JSON.parse(init.body); calls.push({ url: u, auth: init.headers.Authorization, body: b }); return { json: async () => ({ ts: String(calls.length), channel: 'D1', ...reply(b, calls.length) }) }; };
  return { calls, slackPost: (e, c, t, b, o) => slackPostWith(e, F, c, t, b, o) };
};
const req = body => new Request('https://x/api/slack/example-dm', { method: 'POST', body: typeof body === 'string' ? body : JSON.stringify(body) });
const mark = (t = 'Example, not real: a test') => ({ type: 'context', elements: [{ type: 'mrkdwn', text: t }] });
const msg = (extra = {}) => ({ text: 'hi', blocks: [mark(), { type: 'section', text: { type: 'mrkdwn', text: 'body' } }], ...extra });

await check('non-owner gets 403 and nothing posts', async () => {
  const s = mkSlack();
  const r = await handleExampleDm(req({ messages: [msg()] }), env, { isOwner: false, slackPost: s.slackPost });
  assert.equal(r.status, 403);
  assert.equal(s.calls.length, 0);
});

await check('missing marker is 400', async () => {
  const s = mkSlack();
  const noCtx = await handleExampleDm(req({ messages: [{ text: 'x', blocks: [{ type: 'section', text: { type: 'mrkdwn', text: 'Example, not real' } }] }] }), env, { isOwner: true, slackPost: s.slackPost });
  assert.equal(noCtx.status, 400);
  const wrong = await handleExampleDm(req({ messages: [msg(), { text: 'x', blocks: [mark('Heads up')] }] }), env, { isOwner: true, slackPost: s.slackPost });
  assert.equal(wrong.status, 400);
  assert.match((await wrong.json()).error, /Message 2/);
  assert.equal(s.calls.length, 0, 'a refused body posts nothing, not even the good first message');
});

await check('too many messages, too many blocks, too big a body are 400', async () => {
  const s = mkSlack();
  const many = await handleExampleDm(req({ messages: Array.from({ length: 9 }, () => msg()) }), env, { isOwner: true, slackPost: s.slackPost });
  assert.equal(many.status, 400);
  const blocks = [mark(), ...Array.from({ length: 50 }, () => ({ type: 'divider' }))];
  const tall = await handleExampleDm(req({ messages: [{ text: 'x', blocks }] }), env, { isOwner: true, slackPost: s.slackPost });
  assert.equal(tall.status, 400);
  const big = await handleExampleDm(req({ messages: [msg({ text: 'a'.repeat(41 * 1024) })] }), env, { isOwner: true, slackPost: s.slackPost });
  assert.equal(big.status, 400);
  assert.equal(s.calls.length, 0);
});

await check('recipient is always the owner, as the bot, in order', async () => {
  const s = mkSlack();
  const body = { to: 'C0CLIENT', channel: 'C0CLIENT', messages: [msg({ text: 'one', channel: 'C0OTHER' }), msg({ text: 'two', attachments: [{ color: '#000', blocks: [] }] })] };
  const r = await handleExampleDm(req(body), env, { isOwner: true, slackPost: s.slackPost });
  assert.equal(r.status, 200);
  const j = await r.json();
  assert.deepEqual(j, { ok: true, posted: ['1', '2'] });
  assert.equal(s.calls.length, 2);
  for (const c of s.calls) {
    assert.equal(c.body.channel, OWNER_SLACK);
    assert.equal(c.auth, 'Bearer xoxb-bot');
  }
  assert.deepEqual(s.calls.map(c => c.body.text), ['Example, not real: one', 'Example, not real: two']);
  assert.ok(Array.isArray(s.calls[1].body.attachments));
  assert.equal(s.calls[1].body.attachments[0].fallback, 'Example, not real');
});

await check('notification text is marked once, and the worker json (CORS) is used when given', async () => {
  const s = mkSlack();
  const cors = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } });
  const r = await handleExampleDm(req({ messages: [msg({ text: 'Example, not real: already' }), msg({ text: '' }), msg({ text: 'x', attachments: [{ fallback: 'Real alert' }] })] }), env, { isOwner: true, slackPost: s.slackPost, json: cors });
  assert.equal(r.headers.get('Access-Control-Allow-Origin'), '*');
  assert.deepEqual(s.calls.map(c => c.body.text), ['Example, not real: already', 'Example, not real', 'Example, not real: x']);
  assert.equal(s.calls[2].body.attachments[0].fallback, 'Example, not real: Real alert');
  const no = await handleExampleDm(req({ messages: [msg()] }), env, { isOwner: false, slackPost: s.slackPost, json: cors });
  assert.equal(no.headers.get('Access-Control-Allow-Origin'), '*');
});

await check('a Slack error comes back with what posted before it', async () => {
  const s = mkSlack((b, i) => (i === 2 ? { ok: false, error: 'invalid_blocks' } : { ok: true }));
  const r = await handleExampleDm(req({ messages: [msg(), msg(), msg()] }), env, { isOwner: true, slackPost: s.slackPost });
  const j = await r.json();
  assert.equal(j.ok, false);
  assert.match(j.error, /invalid_blocks/);
  assert.deepEqual(j.posted, ['1']);
});

console.log(`\n${n} passed, ${bad} failed`);
if (bad) process.exit(1);

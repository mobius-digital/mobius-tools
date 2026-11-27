/* One client post per brand per check-in from the Slack buttons (War Room send claim).
 *   node test-standing-sendclaim.mjs        (from account-health/worker)
 *
 * The bug: the Slack Send (ws_send) and Send all (ws_sendall) buttons took no send claim, so a double tap, or a button
 * racing the page's POST /api/standing/send, posted the same client update twice.
 * Guarded here: both buttons claim the brand (claimSend, the claim sendItem takes) before posting; a second tap while
 * the first runs posts nothing and says so privately; a stale button after the send says "Already sent" privately; a
 * failed post releases the claim so a retry works; the message shows Sending... then Sent (or the error); with one tap
 * the client post is byte for byte what origin/main posts. Sample brands and numbers are made up. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { register } from 'node:module';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const BASE = 'a8f73e10';   // origin/main before this change (PR 370 merged)
register('data:text/javascript,' + encodeURIComponent(`
export async function load(url, ctx, next) {
  if (url.endsWith('.wasm')) return { format: 'module', shortCircuit: true,
    source: 'import fs from "node:fs"; export default new WebAssembly.Module(fs.readFileSync(new URL(' + JSON.stringify(url) + ')));' };
  return next(url, ctx);
}`));

let passed = 0, failed = 0;
async function check(name, fn) {
  try { await fn(); passed++; console.log('ok   ' + name); }
  catch (e) { failed++; console.log('FAIL ' + name + '\n     ' + String(e && e.stack || e).split('\n').slice(0, 6).join('\n     ')); }
}

const RealDate = Date;
let NOW = RealDate.parse('2026-11-27T02:13:00Z');
class FakeDate extends RealDate {
  constructor(...a) { if (a.length) super(...a); else super(NOW); }
  static now() { return NOW; }
}
globalThis.Date = FakeDate;
let seed = 1;
Math.random = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
const at = iso => { NOW = RealDate.parse(iso); };

const NEW = await import(pathToFileURL(path.join(HERE, 'src', 'standing.js')).href);
let OLD = null;
const oldFile = path.join(HERE, 'src', `_standing_claim_base_${process.pid}.mjs`);
try {
  fs.writeFileSync(oldFile, execFileSync('git', ['show', `${BASE}:account-health/worker/src/standing.js`], { cwd: HERE, maxBuffer: 1 << 26 }));
  OLD = await import(pathToFileURL(oldFile).href);
} catch (e) { console.log(`SKIP old-vs-new: the base commit ${BASE} is not in this clone (${String(e.message).split('\n')[0]})`); }
finally { try { fs.unlinkSync(oldFile); } catch {} }

const BRANDS = [['brand_alpha', 'Brand Alpha', 3.0], ['brand_beta', 'Brand Beta', 2.5], ['brand_gamma', 'Brand Gamma', 2.5]];
function profitAnswer(url, hour) {
  const want = new Set(String(new URL(url).searchParams.get('acts') || '').split(',').filter(Boolean));
  const f = Math.max(1, hour) / 14;
  const brands = BRANDS.filter(([a]) => !want.size || want.has(a)).map(([act, name, kpi], i) => {
    const sales = Math.round((4000 + i * 900) * f), spend = Math.round((1300 + i * 500) * f);
    return { act_id: act, name, currency: 'USD', goal: 50000, kpi, hold: kpi * 0.8, sale: { start: '2026-11-26', end: '2026-11-30' }, mode: 'live',
      today: { sales, spend, mer: sales / spend }, last6: { hours: 6, sales: Math.round(sales * 0.4), spend: Math.round(spend * 0.45), mer: 1.9 },
      so_far: { from: '2026-11-26', days: 1, sales, spend, mer: sales / spend, pct_goal: 0.1, new_rev: 1000, new_orders: 10, new_mer: 1.2, email_share_new: 0.1 },
      week: { from: '2026-11-23', sales: sales + 9000, spend: spend + 3500, mer: (sales + 9000) / (spend + 3500) }, be_new: 1.6, no_sales: 0,
      suggest: { call: 'hold', pct: 0, why: 'Hold.' } };
  });
  return { today: '2026-11-26', dry: 0, window: { from: '2026-11-26', to: '2026-11-30' }, brands };
}
/** A world with a gate on client posts: while held, the first client post waits until the test lets it through. */
function world() {
  const settings = new Map(), slack = [], posts = [], claims = new Map(), log = [], responses = [];
  const gate = { hold: false, hit: null, onHit: null, release: null };
  gate.arm = () => { gate.hold = true; gate.hit = new Promise(r => { gate.onHit = r; }); const go = new Promise(r => { gate.release = r; }); gate.go = go; };
  const fail = { post: null };
  const DB = { prepare(sql) {
    const st = { args: [], bind(...a) { st.args = a; return st; },
      async all() {
        if (/FROM connections/.test(sql)) return { results: [{ act: 'act_' + st.args[0].replace('brand_', ''), name: 'Acct' }] };
        if (/FROM activities/.test(sql)) { const [since, ...acts] = st.args; return { results: log.filter(r => acts.includes(r.act_id) && r.event_time >= since).map(r => ({ ...r })) }; }
        return { results: [] };
      },
      async first() { return /FROM brand_accounts/.test(sql) ? { name: 'Brand', brief_channel: 'C_CLIENT_' + String(st.args[0]).replace('brand_', ''), slack_channel: 'C_INTERNAL' } : null; },
      async run() {
        if (/^INSERT INTO settings/.test(sql)) { const [k, v, stale] = st.args; const cur = claims.get(k); if (cur == null || cur < stale) { claims.set(k, v); return { meta: { changes: 1 } }; } return { meta: { changes: 0 } }; }
        if (/^DELETE FROM settings/.test(sql)) { const [k, v] = st.args; if (claims.get(k) === v) claims.delete(k); return { meta: { changes: 1 } }; }
        return {};
      } };
    return st;
  } };
  const env = { DB, OWNER_EMAIL: 'owner@example.test', SLACK_USER_TOKEN: 'xoxp-test',
    PROFIT: { fetch: async req => Response.json(profitAnswer(req.url, new Date().getUTCHours() - 6)) } };
  const xfetch = async (url, init = {}) => {
    if (/cdn\.jsdelivr\.net/.test(url)) throw new Error('no network in tests');
    if (url === 'https://hooks.slack.test/respond') { responses.push(JSON.parse(init.body)); return new Response('ok'); }
    if (url === 'https://slack.com/api/chat.postMessage') {
      const body = JSON.parse(init.body);
      if (gate.hold) { gate.hold = false; gate.onHit(); await gate.go; }
      if (fail.post) return Response.json({ ok: false, error: fail.post });
      posts.push(body); return Response.json({ ok: true, ts: `9${posts.length}.0`, channel: body.channel });
    }
    throw new Error('unexpected fetch ' + url);
  };
  let ts = 0;
  const deps = {
    slackWait: 0, xfetch, mintSession: async () => ({ token: 't' }), listAccounts: async () => [], twAttr: null,
    getSetting: async (e, k) => settings.has(k) ? settings.get(k) : null, putSetting: async (e, k, v) => { settings.set(k, v); },
    isAdmin: async () => true, sessionEmail: async () => 'owner@example.test', brandsFor: async () => null,
    slackApi: async (e, method, body) => {
      slack.push({ method, body: JSON.parse(JSON.stringify(body || {})) });
      if (method === 'users.lookupByEmail') return { ok: true, user: { id: 'U_OWNER' } };
      if (method === 'chat.postMessage') return { ok: true, ts: `1${++ts}.0`, channel: 'D_OWNER' };
      return { ok: true };
    },
  };
  return { env, deps, settings, slack, posts, claims, log, gate, fail, responses };
}
const route = async (mod, w, method, p, body) => {
  const url = new URL('https://ah.test' + p);
  const req = new Request(url, { method, headers: { 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) });
  return mod.handleStanding(req, w.env, url, url.pathname, (j, s = 200) => Response.json(j, { status: s }), w.deps);
};
/** A Slack button tap from the owner; resolves when its work (ctx.waitUntil) is done. */
async function tap(mod, w, action_id, value, extra = {}) {
  const jobs = [];
  await mod.handleClientUpdateButton(w.env, { waitUntil: p => jobs.push(p) }, { actions: [{ action_id, value }], user: { id: 'U06C37MDWD7', name: 'owner' }, channel: { id: 'D_OWNER' }, message: { ts: '11.0' }, ...extra },
    w.deps, { ACK: () => new Response(''), xfetch: w.deps.xfetch });
  await Promise.all(jobs);
}
async function checkIn(mod, w, iso) {
  at(iso);
  const run = await (await route(mod, w, 'POST', '/api/standing/run', {})).json();
  await route(mod, w, 'POST', '/api/standing/sample', { batch: true, no_dm: true });
  return run.standing.slot;
}
const toClient = (w, act) => w.posts.filter(p => p.channel === 'C_CLIENT_' + act.replace('brand_', ''));
const batchOf = (w, slot) => JSON.parse(w.settings.get(`wsBatch:${slot}`));
const idOf = (w, slot, act) => batchOf(w, slot).items.find(i => i.act === act).id;
const ephemeral = w => w.slack.filter(c => c.method === 'chat.postEphemeral').map(c => c.body.text);
const updates = w => w.slack.filter(c => c.method === 'chat.update').map(c => c.body.blocks.filter(b => b.type === 'section').map(b => b.text.text.replace('*', '').replace('*\n', ': ')).join(' | '));
/** Run `first` until its client post is in flight (held at the gate), run `second` to the end, then let `first` finish. */
async function race(w, first, second) {
  w.gate.arm();
  const p = first();
  await w.gate.hit;
  await second();
  w.gate.release();
  await p;
}

await check('double tap on Send (ws_send): one client post; the second tap is told privately', async () => {
  const w = world(); seed = 1;
  const slot = await checkIn(NEW, w, '2026-11-27T02:13:00Z');
  at('2026-11-27T02:30:00Z');
  const id = idOf(w, slot, 'brand_alpha');
  await race(w, () => tap(NEW, w, 'ws_send', id), () => tap(NEW, w, 'ws_send', id));
  assert.equal(toClient(w, 'brand_alpha').length, 1);
  assert.deepEqual(ephemeral(w), ['Brand is already sending.']);
  /* A stale button tapped later: "Already sent", only to Cole, nothing posted anywhere. */
  const before = w.slack.filter(c => c.method === 'chat.postMessage').length;
  await tap(NEW, w, 'ws_send', id);
  assert.equal(toClient(w, 'brand_alpha').length, 1);
  assert.equal(ephemeral(w).at(-1), 'Already sent to Brand.');
  assert.equal(w.slack.filter(c => c.method === 'chat.postMessage').length, before, 'no thread post either');
  assert.equal(w.claims.size, 0, 'claim released');
  assert.equal(batchOf(w, slot).items.find(i => i.id === id).status, 'sent');
});

await check('double tap on Send all (ws_sendall): each brand posts once', async () => {
  const w = world(); seed = 1;
  const slot = await checkIn(NEW, w, '2026-11-27T02:13:00Z');
  at('2026-11-27T02:30:00Z');
  await race(w, () => tap(NEW, w, 'ws_sendall', slot), () => tap(NEW, w, 'ws_sendall', slot));
  for (const [act] of BRANDS) assert.equal(toClient(w, act).length, 1, act);
  assert.deepEqual(ephemeral(w), ['Already sending.']);
  await tap(NEW, w, 'ws_sendall', slot);
  for (const [act] of BRANDS) assert.equal(toClient(w, act).length, 1, act);
  assert.equal(ephemeral(w).at(-1), 'Already sent.');
  assert.ok(batchOf(w, slot).items.every(i => i.status === 'sent'));
  assert.equal(w.claims.size, 0);
  /* Two taps landing together with the gate open (plain interleaving) still post each brand once. */
  const w2 = world(); seed = 1;
  const slot2 = await checkIn(NEW, w2, '2026-11-27T02:13:00Z');
  at('2026-11-27T02:30:00Z');
  await Promise.all([tap(NEW, w2, 'ws_sendall', slot2), tap(NEW, w2, 'ws_sendall', slot2), tap(NEW, w2, 'ws_send', idOf(w2, slot2, 'brand_beta'))]);
  for (const [act] of BRANDS) assert.equal(toClient(w2, act).length, 1, act);
  assert.ok(batchOf(w2, slot2).items.every(i => i.status === 'sent'), 'every brand ends Sent');
});

await check('Send (ws_send) racing the page Send (POST /api/standing/send): one post, either order', async () => {
  for (const order of ['button first', 'page first']) {
    const w = world(); seed = 1;
    const slot = await checkIn(NEW, w, '2026-11-27T02:13:00Z');
    at('2026-11-27T02:30:00Z');
    const id = idOf(w, slot, 'brand_alpha');
    const button = () => tap(NEW, w, 'ws_send', id);
    let page = null;
    const pageSend = async () => { page = await (await route(NEW, w, 'POST', '/api/standing/send', { act: 'brand_alpha', slot })).json(); };
    if (order === 'button first') await race(w, button, pageSend); else await race(w, pageSend, button);
    assert.equal(toClient(w, 'brand_alpha').length, 1, order);
    if (order === 'button first') assert.equal(page.skipped, 'sending', order);
    else { assert.equal(page.sent, true, order); assert.deepEqual(ephemeral(w), ['Brand is already sending.'], order); }
    /* And after: the page refuses, the button says Already sent. */
    const again = await (await route(NEW, w, 'POST', '/api/standing/send', { act: 'brand_alpha', slot })).json();
    assert.ok(!again.sent, order);
    await tap(NEW, w, 'ws_send', id);
    assert.equal(toClient(w, 'brand_alpha').length, 1, order);
    assert.equal(ephemeral(w).at(-1), 'Already sent to Brand.', order);
  }
});

await check('a failed post releases the claim: the message shows the error and a retry posts once', async () => {
  const w = world(); seed = 1;
  const slot = await checkIn(NEW, w, '2026-11-27T02:13:00Z');
  at('2026-11-27T02:30:00Z');
  const id = idOf(w, slot, 'brand_alpha');
  w.fail.post = 'channel_not_found';
  await tap(NEW, w, 'ws_send', id);
  assert.equal(toClient(w, 'brand_alpha').length, 0);
  assert.equal(w.claims.size, 0, 'claim released after the failed post');
  assert.match(updates(w).at(-1), /Brand: Not sent \(channel_not_found\)\. Tap Send to try again\./);
  assert.ok(JSON.stringify(w.slack.filter(c => c.method === 'chat.update').at(-1).body.blocks).includes(`"value":"${id}"`), 'the Send button is back');
  assert.equal(batchOf(w, slot).items.find(i => i.id === id).status, 'ready');
  w.fail.post = null;
  await tap(NEW, w, 'ws_send', id);
  assert.equal(toClient(w, 'brand_alpha').length, 1);
  /* Send all the same way. */
  w.fail.post = 'not_in_channel';
  await tap(NEW, w, 'ws_sendall', slot);
  assert.equal(w.claims.size, 0);
  assert.match(updates(w).at(-1), /Brand: Not sent \(not_in_channel\)/);
  w.fail.post = null;
  await tap(NEW, w, 'ws_sendall', slot);
  for (const [act] of BRANDS) assert.equal(toClient(w, act).length, 1, act);
});

await check('the message shows Sending... the moment Send is tapped, then Sent', async () => {
  const w = world(); seed = 1;
  const slot = await checkIn(NEW, w, '2026-11-27T02:13:00Z');
  at('2026-11-27T02:30:00Z');
  const n0 = updates(w).length;
  w.gate.arm();
  const p = tap(NEW, w, 'ws_send', idOf(w, slot, 'brand_alpha'));
  await w.gate.hit;
  const mid = updates(w).slice(n0);
  assert.equal(mid.length, 1);
  assert.equal(mid[0], 'Brand: Sending... | Brand: Ready to send | Brand: Ready to send');
  assert.ok(!JSON.stringify(w.slack.at(-1).body.blocks).includes(idOf(w, slot, 'brand_alpha')), 'no Send button on the brand being sent');
  w.gate.release(); await p;
  assert.equal(updates(w).at(-1), 'Brand: Sent ✓ | Brand: Ready to send | Brand: Ready to send');
  const n1 = updates(w).length;
  w.gate.arm();
  const q = tap(NEW, w, 'ws_sendall', slot);
  await w.gate.hit;
  assert.equal(updates(w).slice(n1)[0], 'Brand: Sent ✓ | Brand: Sending... | Brand: Sending...');
  assert.ok(!JSON.stringify(w.slack.at(-1).body.blocks).includes('ws_sendall'), 'Send all is gone while sending');
  w.gate.release(); await q;
  assert.equal(updates(w).at(-1), 'Brand: Sent ✓ | Brand: Sent ✓ | Brand: Sent ✓');
});

await check('single Send to client DM: Sending... through the response_url, then Sent; a double tap posts once', async () => {
  const w = world(); seed = 1;
  await checkIn(NEW, w, '2026-11-27T02:13:00Z');
  at('2026-11-27T02:30:00Z');
  seed = 7; await route(NEW, w, 'POST', '/api/standing/client-update', { act: 'brand_beta' });
  const dm = w.slack.filter(c => c.method === 'chat.postMessage').at(-1).body;
  const els = [...(dm.blocks || []), ...((dm.attachments || []).flatMap(x => x.blocks || []))].flatMap(b => b.elements || []);
  const id = els.find(e => e.action_id === 'ws_send').value;
  const extra = { response_url: 'https://hooks.slack.test/respond', message: { ts: '11.0', text: dm.text, blocks: dm.blocks, attachments: dm.attachments } };
  await race(w, () => tap(NEW, w, 'ws_send', id, extra), () => tap(NEW, w, 'ws_send', id, extra));
  assert.equal(toClient(w, 'brand_beta').length, 1);
  const [sending, busy, sent] = w.responses;
  assert.ok(sending.replace_original && JSON.stringify(sending).includes('Sending to Brand...') && !JSON.stringify(sending).includes('ws_send'), 'buttons swapped for Sending...');
  assert.deepEqual(busy, { response_type: 'ephemeral', replace_original: false, text: 'Brand is already sending.' });
  assert.deepEqual(sent, { replace_original: true, text: '✓ Sent to Brand.' });
  await tap(NEW, w, 'ws_send', id, extra);
  assert.equal(w.responses.at(-1).text, 'Already sent to Brand.');
  assert.equal(w.responses.at(-1).response_type, 'ephemeral');
  assert.equal(toClient(w, 'brand_beta').length, 1);
});

if (OLD) {
  await check('one tap each: every client post and every DM is byte for byte origin/main', async () => {
    const out = {};
    for (const [k, mod] of [['old', OLD], ['new', NEW]]) {
      const w = world(); seed = 1;
      w.log.push({ id: 'manual:a:1', act_id: 'act_gamma', event_time: '2026-11-27T02:20:00.000Z', summary: 'Budget: $60/day → $75/day', category: 'budget', object_type: 'CAMPAIGN', object_name: 'Sale Campaign', client_why: 'Sales are ahead.' });
      const slot = await checkIn(mod, w, '2026-11-27T02:13:00Z');
      at('2026-11-27T02:30:00Z');
      await tap(mod, w, 'ws_send', idOf(w, slot, 'brand_gamma'));
      await tap(mod, w, 'ws_sendall', slot);
      const slot2 = await checkIn(mod, w, '2026-11-27T14:05:00Z');
      at('2026-11-27T14:20:00Z');
      await route(mod, w, 'POST', '/api/standing/send', { act: 'brand_alpha', slot: slot2 });
      await tap(mod, w, 'ws_sendall', slot2);
      out[k] = { posts: w.posts, dm: w.slack.filter(c => c.method === 'chat.postMessage').map(c => c.body),
        settings: [...w.settings].filter(([x]) => /^ws(Batch|Draft|Did|LastSent):/.test(x)) };
    }
    assert.ok(out.new.posts.length >= 6, 'client posts made');
    assert.equal(JSON.stringify(out.new.posts), JSON.stringify(out.old.posts));
    assert.equal(JSON.stringify(out.new.dm), JSON.stringify(out.old.dm));
    assert.equal(JSON.stringify(out.new.settings), JSON.stringify(out.old.settings));
  });
}

await check('no em or en dashes added in standing.js', async () => {
  const now = fs.readFileSync(path.join(HERE, 'src/standing.js'), 'utf8');
  let base = ''; try { base = execFileSync('git', ['show', `${BASE}:account-health/worker/src/standing.js`], { cwd: HERE, maxBuffer: 1 << 26 }).toString(); } catch {}
  const count = s => (s.match(/[—–]/g) || []).length;
  assert.ok(count(now) <= count(base), `${count(now)} dashes vs ${count(base)} before`);
});

globalThis.Date = RealDate;
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);

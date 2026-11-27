/* Client updates list every change not yet sent (2026-11-26 evening bug).
 *   node test-standing-freshdid.mjs        (from account-health/worker)
 *
 * The bug: a check-in at 8:13pm built and saved the client drafts; two budget changes with a client line landed at
 * 8:29pm; the 8:30pm Send posted the SAVED drafts, so the clients never heard of the 8:29 changes, and the next update
 * counted from the 8:30 send, so they dropped out for good.
 * Guarded here: the Send (POST /api/standing/send, Slack Send and Send all, send_batch) rebuilds the Updates list at
 * send time; a change is marked only once an update carrying it went out; a later update never lists it again; a row
 * that reaches the Change Log late still goes in the next update; with no changes the client text is byte for byte
 * what origin/main sends. Sample brands and numbers are made up. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { register } from 'node:module';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const BASE = '7625389e';   // origin/main before this change
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
const oldFile = path.join(HERE, 'src', `_standing_fresh_base_${process.pid}.mjs`);
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
/** A world with Meta accounts per brand and a Change Log (activities) the test writes to. */
function world({ metaAccts = true } = {}) {
  const settings = new Map(), slack = [], posts = [], claims = new Map(), log = [], mw = new Map(), fail = { activities: false };
  const DB = { prepare(sql) {
    const st = { args: [], bind(...a) { st.args = a; return st; },
      async all() {
        if (/FROM connections/.test(sql)) return { results: metaAccts ? [{ act: 'act_' + st.args[0].replace('brand_', ''), name: 'Acct' }] : [] };
        if (/FROM p_meta_write/.test(sql)) return { results: st.args.filter(id => mw.has(id)).map(id => ({ id, undone: mw.get(id) })) };
        if (/FROM activities/.test(sql)) {
          if (fail.activities) throw new Error('D1 read failed');
          const [since, ...acts] = st.args, conf = /confirmed/.test(sql);
          return { results: log.filter(r => acts.includes(r.act_id) && r.client_why && r.event_time >= since && (!conf || (r.confirmed ?? 0) !== -1)).sort((p, q) => p.event_time < q.event_time ? -1 : 1).map(r => ({ ...r })) };
        }
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
    if (url === 'https://slack.com/api/chat.postMessage') { const body = JSON.parse(init.body); posts.push(body); return Response.json({ ok: true, ts: `9${posts.length}.0`, channel: body.channel }); }
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
  let n = 0;
  /** A Locus budget write with a client line, as metawrite logs it. */
  const change = (act, iso, from, to, name = 'Sale Campaign', extra = {}) => log.push({ id: `manual:${act}:${++n}`, act_id: 'act_' + act.replace('brand_', ''), event_time: iso,
    summary: `Budget: $${from}/day → $${to}/day`, category: 'budget', object_type: 'CAMPAIGN', object_name: name, client_why: 'Sales are running ahead of the goal.', ...extra });
  return { env, deps, settings, slack, posts, claims, log, change, mw, fail };
}
const route = async (mod, w, method, p, body) => {
  const url = new URL('https://ah.test' + p);
  const req = new Request(url, { method, headers: { 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) });
  return mod.handleStanding(req, w.env, url, url.pathname, (j, s = 200) => Response.json(j, { status: s }), w.deps);
};
async function tap(mod, w, action_id, value) {
  const jobs = [];
  await mod.handleClientUpdateButton(w.env, { waitUntil: p => jobs.push(p) }, { actions: [{ action_id, value }], user: { id: 'U06C37MDWD7', name: 'owner' }, channel: { id: 'D_OWNER' }, message: { ts: '11.0' } },
    w.deps, { ACK: () => new Response(''), xfetch: w.deps.xfetch });
  await Promise.all(jobs);
}
/** The check-in that builds and saves the client drafts: Check now, then the Client updates message. */
async function checkIn(mod, w, iso) {
  at(iso);
  const run = await (await route(mod, w, 'POST', '/api/standing/run', {})).json();
  await route(mod, w, 'POST', '/api/standing/sample', { batch: true, no_dm: true });
  return run.standing.slot;
}
const toClient = (w, act) => w.posts.filter(p => p.channel === 'C_CLIENT_' + act.replace('brand_', ''));
const updatesOf = p => { const all = [...(p.blocks || []), ...((p.attachments || []).flatMap(a => a.blocks || []))]; const i = all.findIndex(b => (b.type === 'markdown' && b.text === '# Updates') || (b.type === 'header' && b.text.text === 'Updates')); return all[i + 1].text.text; };
const RAISE1 = 'Raised the Sale Campaign budget from $250 to $315 a day', RAISE2 = 'Raised the Prospecting budget from $100 to $125 a day';

await check('Nov 26 replay: drafts at 8:13, changes at 8:29, Send at 8:30 lists the 8:29 changes', async () => {
  const w = world(); seed = 1;
  const slot = await checkIn(NEW, w, '2026-11-27T02:13:00Z');
  assert.equal(slot, '2026-11-26T20');
  const bt = JSON.parse(w.settings.get(`wsBatch:${slot}`));
  const cached = JSON.parse(w.settings.get(`wsDraft:${bt.items.find(i => i.act === 'brand_alpha').id}`));
  assert.match(updatesOf(cached.msg), /No changes since the last update/, 'the draft was built before the changes');
  w.change('brand_alpha', '2026-11-27T02:29:10.000Z', 250, 315);
  w.change('brand_alpha', '2026-11-27T02:29:40.000Z', 100, 125, 'Prospecting');
  at('2026-11-27T02:30:00Z');
  const r = await (await route(NEW, w, 'POST', '/api/standing/send', { act: 'brand_alpha', slot })).json();
  assert.equal(r.sent, true, JSON.stringify(r));
  const sent = toClient(w, 'brand_alpha');
  assert.equal(sent.length, 1);
  assert.equal(updatesOf(sent[0]), `•  ${RAISE1}\n•  ${RAISE2}`);
  assert.ok(!/No changes/.test(JSON.stringify(sent[0])));
  const did = JSON.parse(w.settings.get('wsDid:brand_alpha'));
  assert.deepEqual(Object.keys(did.ids).sort(), ['manual:brand_alpha:1', 'manual:brand_alpha:2']);
  assert.match(updatesOf(JSON.parse(w.settings.get(`wsDraft:${bt.items.find(i => i.act === 'brand_alpha').id}`)).msg), /Raised the Sale Campaign/, 'the stored draft is what went out');
});

await check('Slack Send all and a single Send also rebuild the list at send time (second brand)', async () => {
  const w = world(); seed = 1;
  const slot = await checkIn(NEW, w, '2026-11-27T02:13:00Z');
  w.change('brand_beta', '2026-11-27T02:29:00.000Z', 400, 500);
  w.change('brand_gamma', '2026-11-27T02:29:30.000Z', 60, 75);
  at('2026-11-27T02:30:00Z');
  const bt = JSON.parse(w.settings.get(`wsBatch:${slot}`));
  await tap(NEW, w, 'ws_send', bt.items.find(i => i.act === 'brand_gamma').id);
  await tap(NEW, w, 'ws_sendall', slot);
  assert.equal(updatesOf(toClient(w, 'brand_beta')[0]), '•  Raised the Sale Campaign budget from $400 to $500 a day');
  assert.equal(updatesOf(toClient(w, 'brand_gamma')[0]), '•  Raised the Sale Campaign budget from $60 to $75 a day');
  assert.equal(toClient(w, 'brand_gamma').length, 1, 'Send all skipped the brand already sent');
  assert.match(updatesOf(toClient(w, 'brand_alpha')[0]), /No changes since the last update/);
});

await check('a later check-in and Send never list the same changes again', async () => {
  const w = world(); seed = 1;
  const slot = await checkIn(NEW, w, '2026-11-27T02:13:00Z');
  w.change('brand_alpha', '2026-11-27T02:29:10.000Z', 250, 315);
  w.change('brand_alpha', '2026-11-27T02:29:40.000Z', 100, 125, 'Prospecting');
  at('2026-11-27T02:30:00Z');
  await route(NEW, w, 'POST', '/api/standing/send', { act: 'brand_alpha', slot });
  const slot2 = await checkIn(NEW, w, '2026-11-27T14:05:00Z');
  const bt2 = JSON.parse(w.settings.get(`wsBatch:${slot2}`));
  assert.match(updatesOf(JSON.parse(w.settings.get(`wsDraft:${bt2.items.find(i => i.act === 'brand_alpha').id}`)).msg), /No changes since the last update/, 'the preview does not repeat them');
  at('2026-11-27T14:20:00Z');
  const r = await (await route(NEW, w, 'POST', '/api/standing/send', { act: 'brand_alpha', slot: slot2 })).json();
  assert.equal(r.sent, true);
  const sent = toClient(w, 'brand_alpha');
  assert.equal(sent.length, 2);
  assert.equal(updatesOf(sent[1]), '•  No changes since the last update');
  /* Sending the same batch again changes nothing: one post per brand, no double listing. */
  await route(NEW, w, 'POST', '/api/standing/sample', { send_batch: slot2 });
  assert.equal(toClient(w, 'brand_alpha').length, 2);
});

await check('a change 1 second before a Send that missed the build is in that Send; a late row goes in the next one', async () => {
  const w = world(); seed = 1;
  const slot = await checkIn(NEW, w, '2026-11-27T14:05:00Z');
  w.change('brand_alpha', '2026-11-27T14:29:59.000Z', 250, 315);
  at('2026-11-27T14:30:00Z');
  await route(NEW, w, 'POST', '/api/standing/send', { act: 'brand_alpha', slot });
  assert.equal(updatesOf(toClient(w, 'brand_alpha')[0]), `•  ${RAISE1}`);
  /* A row stamped 1 second before the send that reached the Change Log only after it: the old "since the last send"
     rule lost it forever. It is unmarked, so the next update carries it, and only it. */
  w.change('brand_alpha', '2026-11-27T14:29:59.500Z', 100, 125, 'Prospecting');
  const slot2 = await checkIn(NEW, w, '2026-11-27T20:05:00Z');
  at('2026-11-27T20:10:00Z');
  await route(NEW, w, 'POST', '/api/standing/send', { act: 'brand_alpha', slot: slot2 });
  const sent = toClient(w, 'brand_alpha');
  assert.equal(sent.length, 2);
  assert.equal(updatesOf(sent[1]), `•  ${RAISE2}`);
});

await check('a failed post marks nothing: the changes stay for the next update', async () => {
  const w = world(); seed = 1;
  const slot = await checkIn(NEW, w, '2026-11-27T02:13:00Z');
  w.change('brand_alpha', '2026-11-27T02:29:10.000Z', 250, 315);
  at('2026-11-27T02:30:00Z');
  const ok = w.deps.xfetch;
  w.deps.xfetch = async (url, init) => url === 'https://slack.com/api/chat.postMessage' ? Response.json({ ok: false, error: 'channel_not_found' }) : ok(url, init);
  const r = await (await route(NEW, w, 'POST', '/api/standing/send', { act: 'brand_alpha', slot })).json();
  assert.ok(!r.sent);
  assert.equal(w.settings.get('wsDid:brand_alpha'), undefined);
  w.deps.xfetch = ok;
  const r2 = await (await route(NEW, w, 'POST', '/api/standing/send', { act: 'brand_alpha', slot })).json();
  assert.equal(r2.sent, true);
  assert.equal(updatesOf(toClient(w, 'brand_alpha').at(-1)), `•  ${RAISE1}`);
});

await check('changes sent before this began (before the floor) and outside 48 hours are never listed', async () => {
  const w = world(); seed = 1;
  w.settings.set('wsLastSent:brand_alpha', '2026-11-26T23:00:00.000Z');   // an update the old code sent
  w.change('brand_alpha', '2026-11-26T22:30:00.000Z', 1, 2);              // was in it
  const slot = await checkIn(NEW, w, '2026-11-27T02:13:00Z');
  at('2026-11-27T02:30:00Z');
  await route(NEW, w, 'POST', '/api/standing/send', { act: 'brand_alpha', slot });
  assert.equal(updatesOf(toClient(w, 'brand_alpha')[0]), '•  No changes since the last update');
  assert.equal(JSON.parse(w.settings.get('wsDid:brand_alpha')).floor, '2026-11-26T23:00:00.000Z', 'the floor holds from here on');
  at('2026-11-30T14:00:00Z');
  w.change('brand_alpha', '2026-11-27T03:00:00.000Z', 3, 4);              // 3 days old, never sent
  const slot2 = await checkIn(NEW, w, '2026-11-30T14:05:00Z');
  at('2026-11-30T14:10:00Z');
  await route(NEW, w, 'POST', '/api/standing/send', { act: 'brand_alpha', slot: slot2 });
  assert.equal(updatesOf(toClient(w, 'brand_alpha')[1]), '•  No changes since the last update');
});

await check('an undone Locus write and a row Meta did not confirm are never listed and never marked', async () => {
  const w = world(); seed = 1;
  const slot = await checkIn(NEW, w, '2026-11-27T02:13:00Z');
  w.change('brand_alpha', '2026-11-27T02:20:00.000Z', 250, 315, 'Sale Campaign', { note: 'Write mw_abc123' });
  w.change('brand_alpha', '2026-11-27T02:22:00.000Z', 100, 125, 'Prospecting', { confirmed: -1 });
  w.mw.set('mw_abc123', 1);                                              // undone at 8:25, after the preview
  at('2026-11-27T02:30:00Z');
  const r = await (await route(NEW, w, 'POST', '/api/standing/send', { act: 'brand_alpha', slot })).json();
  assert.equal(r.sent, true);
  assert.equal(updatesOf(toClient(w, 'brand_alpha')[0]), '•  No changes since the last update');
  const st = JSON.parse(w.settings.get('wsDid:brand_alpha') || '{"ids":{}}');
  assert.deepEqual(Object.keys(st.ids), [], 'nothing marked');
  /* A write still standing (not undone) is listed as before. */
  w.change('brand_alpha', '2026-11-27T14:01:00.000Z', 60, 75, 'Sale Campaign', { note: 'Write mw_def456' });
  w.mw.set('mw_def456', 0);
  const slot2 = await checkIn(NEW, w, '2026-11-27T14:05:00Z');
  at('2026-11-27T14:10:00Z');
  await route(NEW, w, 'POST', '/api/standing/send', { act: 'brand_alpha', slot: slot2 });
  assert.equal(updatesOf(toClient(w, 'brand_alpha')[1]), '•  Raised the Sale Campaign budget from $60 to $75 a day');
});

await check('a failed Change Log read at send keeps the saved list and marks nothing', async () => {
  const w = world(); seed = 1;
  w.change('brand_alpha', '2026-11-27T02:05:00.000Z', 250, 315);
  const slot = await checkIn(NEW, w, '2026-11-27T02:13:00Z');
  w.fail.activities = true;
  at('2026-11-27T02:30:00Z');
  const r = await (await route(NEW, w, 'POST', '/api/standing/send', { act: 'brand_alpha', slot })).json();
  assert.equal(r.sent, true);
  assert.equal(updatesOf(toClient(w, 'brand_alpha')[0]), `•  ${RAISE1}`, 'the list built at the check-in');
  assert.deepEqual(JSON.parse(w.settings.get('wsDid:brand_alpha')).ids, {}, 'nothing marked, only the floor pinned');
  w.fail.activities = false;
  const slot2 = await checkIn(NEW, w, '2026-11-27T14:05:00Z');
  at('2026-11-27T14:10:00Z');
  await route(NEW, w, 'POST', '/api/standing/send', { act: 'brand_alpha', slot: slot2 });
  assert.equal(updatesOf(toClient(w, 'brand_alpha')[1]), `•  ${RAISE1}`, 'the next update still carries it');
});

if (OLD) {
  await check('no new changes: every client post is byte for byte origin/main (send, Send all, send_batch, single DM)', async () => {
    for (const metaAccts of [true, false]) {
      const out = {};
      for (const [k, mod] of [['old', OLD], ['new', NEW]]) {
        const w = world({ metaAccts }); seed = 1;
        w.settings.set('wsLastSent:brand_alpha', '2026-11-26T20:00:00.000Z');
        w.change('brand_alpha', '2026-11-26T19:00:00.000Z', 1, 2);   // already sent by the old rule
        const slot = await checkIn(mod, w, '2026-11-27T02:13:00Z');
        at('2026-11-27T02:30:00Z');
        await route(mod, w, 'POST', '/api/standing/send', { act: 'brand_alpha', slot });
        await tap(mod, w, 'ws_sendall', slot);
        const slot2 = await checkIn(mod, w, '2026-11-27T14:05:00Z');
        at('2026-11-27T14:20:00Z');
        await route(mod, w, 'POST', '/api/standing/sample', { send_batch: slot2 });
        seed = 7; await route(mod, w, 'POST', '/api/standing/client-update', { act: 'brand_beta' });
        const dm = w.slack.filter(c => c.method === 'chat.postMessage').map(c => c.body);
        out[k] = { posts: w.posts, dm, ids: [...w.settings.keys()].filter(x => x.startsWith('wsDraft:')) };
      }
      assert.ok(out.new.posts.length >= 6, 'client posts made');
      assert.equal(JSON.stringify(out.new.posts), JSON.stringify(out.old.posts));
      assert.equal(JSON.stringify(out.new.dm), JSON.stringify(out.old.dm));
    }
  });
}

await check('no em or en dashes added in standing.js', async () => {
  const now = fs.readFileSync(path.join(HERE, 'src/standing.js'), 'utf8');
  let base = ''; try { base = execFileSync('git', ['show', `${BASE}:account-health/worker/src/standing.js`], { cwd: HERE, maxBuffer: 1 << 26 }).toString(); } catch {}
  const count = s => (s.match(/[\u2014\u2013]/g) || []).length;
  assert.ok(count(now) <= count(base), `${count(now)} dashes vs ${count(base)} before`);
});

globalThis.Date = RealDate;
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);

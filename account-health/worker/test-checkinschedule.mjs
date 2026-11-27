/* Per-brand check-in cadence + the client picture card + one-brand send (War Room 2.9 W1, W2, W3, W4).
 *   node test-checkinschedule.mjs        (from account-health/worker)
 *
 * The promise this guards: with NO brand's checkin_hours set, the check-in is exactly what it was before (same slots,
 * same stored record, same DM, same client update text and send). It runs the standing.js of the base commit and the
 * current one side by side on the same sample input and compares every setting written and every Slack call made.
 * The picture card is the only allowed difference, and when Slack (or the renderer) refuses it the update is
 * byte for byte the old one. Then it shows the new output with a schedule set.
 * Sample brands and numbers are made up. The .wasm import is served to node by a small loader below. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { register } from 'node:module';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const BASE = '705ddf08';   // origin/main before this change
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
/** deepEqual that names the first place two values part. */
function same(a, b, at = '') {
  if (JSON.stringify(a) === JSON.stringify(b)) return;
  if (a && b && typeof a === 'object' && typeof b === 'object') {
    for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) same(a[k], b[k], `${at}.${k}`);
    return;
  }
  throw new Error(`differs at ${at}: new ${JSON.stringify(a)?.slice(0, 300)} vs old ${JSON.stringify(b)?.slice(0, 300)}`);
}

/* ---------- fixed clock and random, so two runs can be compared exactly ---------- */
const RealDate = Date;
let NOW = RealDate.parse('2026-11-27T20:05:00Z');   // 2:05pm Central
class FakeDate extends RealDate {
  constructor(...a) { if (a.length) super(...a); else super(NOW); }
  static now() { return NOW; }
}
globalThis.Date = FakeDate;
let seed = 1;
Math.random = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
const at = iso => { NOW = RealDate.parse(iso); };

/* ---------- the two modules ---------- */
const NEW = await import(pathToFileURL(path.join(HERE, 'src', 'standing.js')).href);
const IMG = await import(pathToFileURL(path.join(HERE, 'src', 'standingimg.js')).href);
/* The renderer boots once per process (the wasm); boot it before the first compared run so both runs start equal. */
const warm = [];
for (let i = 0; i < 2; i++) await IMG.toPng('<svg xmlns="http://www.w3.org/2000/svg" width="4" height="4"/>', async () => { throw new Error('no network in tests'); }).then(() => warm.push('ok'), e => warm.push(e.message));
let OLD = null;
const oldFile = path.join(HERE, 'src', `_standing_base_${process.pid}.mjs`);
try {
  fs.writeFileSync(oldFile, execFileSync('git', ['show', `${BASE}:account-health/worker/src/standing.js`], { cwd: HERE, maxBuffer: 1 << 26 }));
  OLD = await import(pathToFileURL(oldFile).href);
} catch (e) { console.log(`SKIP old-vs-new: the base commit ${BASE} is not in this clone (${String(e.message).split('\n')[0]})`); }
finally { try { fs.unlinkSync(oldFile); } catch {} }

/* ---------- sample input ---------- */
const BRANDS = [['brand_alpha', 'Brand Alpha', 3.0], ['brand_beta', 'Brand Beta', 2.5], ['brand_gamma', 'Brand Gamma', 2.5]];
function profitAnswer(url, hour, notLive = []) {
  const want = new Set(String(new URL(url).searchParams.get('acts') || '').split(',').filter(Boolean));
  const f = hour / 14;   // numbers grow through the day
  const brands = BRANDS.filter(([a]) => !want.size || want.has(a)).map(([act, name, kpi], i) => {
    const sales = Math.round((4000 + i * 900) * f), spend = Math.round((1300 + i * 500) * f);
    return { act_id: act, name, currency: 'USD', goal: 50000 + i * 10000, kpi, hold: kpi * 0.8, sale: { start: '2026-11-26', end: '2026-11-30' }, mode: notLive.includes(act) ? 'plan' : 'live',
      today: { sales, spend, mer: sales / spend }, last6: { hours: 6, sales: Math.round(sales * 0.4), spend: Math.round(spend * 0.45), mer: (sales * 0.4) / (spend * 0.45) },
      so_far: { from: '2026-11-26', days: 2, sales: sales + 6000, spend: spend + 2100, mer: (sales + 6000) / (spend + 2100), pct_goal: 0.2, new_rev: 3000, new_orders: 40, new_mer: 1.4, email_share_new: 0.1 },
      week: { from: '2026-11-23', sales: sales + 9000, spend: spend + 3500, mer: (sales + 9000) / (spend + 3500) }, be_new: 1.6, no_sales: 0,
      suggest: i === 0 ? { call: 'raise', pct: 0.25, why: 'Over the goal. Raise 25%.' } : { call: 'hold', pct: 0, why: 'Between break-even and the goal. Hold.' } };
  });
  return { today: '2026-11-27', dry: 0, window: { from: '2026-11-26', to: '2026-11-30' }, brands };
}
function world({ fonts = false, schedule = [], refuseCard = false, switchOn = schedule.length > 0, refuseThreadCard = false, notLive = [], cardFlag = false } = {}) {
  const settings = new Map(), slack = [], posts = [], profitUrls = [], claims = new Map(), userUploads = [];
  if (switchOn) settings.set('checkinSchedule', 'on');
  /* The client picture card switch (standing.js cardOn): off unless a test turns it on. */
  if (cardFlag) settings.set('standingClientCard', 'on');
  const fontFile = ['C:/Windows/Fonts/arial.ttf', '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf', '/System/Library/Fonts/Supplemental/Arial.ttf'].find(f => fs.existsSync(f));
  const DB = { prepare(sql) {
    const st = { args: [], bind(...a) { st.args = a; return st; },
      async all() { return { results: /checkin_hours/.test(sql) ? schedule.map(([act_id, value]) => ({ act_id, value })) : [] }; },
      async first() { return /FROM brand_accounts/.test(sql) ? { name: 'Brand', brief_channel: 'C_CLIENT', slack_channel: 'C_INTERNAL' } : null; },
      /* The send claim (standing.js claimSend / releaseSend): the same rule as the real INSERT ... WHERE. */
      async run() {
        if (/^INSERT INTO settings/.test(sql)) { const [k, v, stale] = st.args; const cur = claims.get(k); if (cur == null || cur < stale) { claims.set(k, v); return { meta: { changes: 1 } }; } return { meta: { changes: 0 } }; }
        if (/^DELETE FROM settings/.test(sql)) { const [k, v] = st.args; if (claims.get(k) === v) claims.delete(k); return { meta: { changes: 1 } }; }
        return {};
      } };
    return st;
  } };
  const env = { DB, OWNER_EMAIL: 'owner@example.test', SLACK_USER_TOKEN: 'xoxp-test',
    PROFIT: { fetch: async req => { profitUrls.push(req.url); return Response.json(profitAnswer(req.url, new Date().getUTCHours() - 6, notLive)); } } };
  const xfetch = async (url, init = {}) => {
    if (/cdn\.jsdelivr\.net/.test(url)) { if (!fonts || !fontFile) throw new Error('no network in tests'); return new Response(fs.readFileSync(fontFile)); }
    if (/^https:\/\/upload\.test\//.test(url)) return new Response('ok');
    /* The client copy of the card, uploaded with the user token at send time. */
    if (url === 'https://slack.com/api/files.getUploadURLExternal') { const f = new URLSearchParams(init.body); userUploads.push({ auth: init.headers.Authorization, filename: f.get('filename') }); return Response.json({ ok: true, upload_url: 'https://upload.test/user-' + f.get('filename'), file_id: 'FU_' + f.get('filename') }); }
    if (url === 'https://slack.com/api/files.completeUploadExternal') return Response.json({ ok: true });
    if (url === 'https://slack.com/api/chat.postMessage') {
      const body = JSON.parse(init.body); posts.push(body);
      if (refuseCard && (body.blocks || []).some(b => b.block_id === 'ws_card')) return Response.json({ ok: false, error: 'invalid_blocks' });
      return Response.json({ ok: true, ts: `9${posts.length}.0`, channel: body.channel });
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
      if (method === 'files.getUploadURLExternal') return { ok: true, upload_url: 'https://upload.test/' + body.filename, file_id: 'F_' + body.filename };
      if (method === 'files.completeUploadExternal') return { ok: true };
      if (method === 'chat.postMessage') {
        if (refuseThreadCard && body.thread_ts && (body.blocks || []).some(b => b.block_id === 'ws_card')) return { ok: false, error: 'invalid_blocks' };
        return { ok: true, ts: `1${++ts}.0`, channel: 'D_OWNER' };
      }
      return { ok: true };
    },
  };
  return { env, deps, settings, slack, posts, profitUrls, claims, userUploads };
}
const snap = w => ({ settings: Object.fromEntries([...w.settings].map(([k, v]) => [k, (() => { try { return JSON.parse(v); } catch { return v; } })()])), slack: w.slack, posts: w.posts, profit: w.profitUrls });
/* The card is the one allowed difference: drop its block, its uploads and the "(picture card)" note. */
const noCard = o => JSON.parse(JSON.stringify(o, (k, v) => k === 'card_svg' ? undefined : Array.isArray(v) ? v.filter(x => !(x && x.block_id === 'ws_card')) : v));
const noCardCalls = s => ({ ...noCard(s), slack: noCard(s.slack).filter(c => !(/^files\./.test(c.method) && /^update-/.test(c.body.filename || (c.body.files || [{}])[0].title || ''))) });

async function tickBoth(opts, iso) {
  const out = {};
  for (const [k, mod] of [['old', OLD], ['new', NEW]]) {
    seed = 1; at(iso);
    const w = world(opts);
    out[k + 'Result'] = await mod.standingTick(w.env, w.deps, new Date());
    out[k] = w;
  }
  return out;
}
const route = async (mod, w, method, p, body) => {
  const url = new URL('https://ah.test' + p);
  const req = new Request(url, { method, headers: { 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) });
  const r = await mod.handleStanding(req, w.env, url, url.pathname, (j, s = 200) => Response.json(j, { status: s }), w.deps);
  return r;
};

/* The send claim (standing-send-claim) adds one allowed difference to a button tap: the batch message redrawn with
   "Sending..." the moment Send is tapped. Everything else, the client post included, must match the base commit. */
const isSending = c => c.method === 'chat.update' && JSON.stringify(c.body.blocks || []).includes('Sending...');
const sendingRedraws = s => s.slack.filter(isSending).length;
const noSending = s => ({ ...s, slack: s.slack.filter(c => !isSending(c)) });
const threadPostsOf = w => w.slack.filter(c => c.method === 'chat.postMessage' && c.body.thread_ts);
/** A Slack button tap from the owner, run to the end (the work is in ctx.waitUntil). */
async function tap(mod, w, action_id, value) {
  const jobs = [];
  await mod.handleClientUpdateButton(w.env, { waitUntil: p => jobs.push(p) }, { actions: [{ action_id, value }], user: { id: 'U06C37MDWD7', name: 'owner' }, channel: { id: 'D_OWNER' }, message: { ts: '11.0' } },
    w.deps, { ACK: () => new Response(''), xfetch: w.deps.xfetch });
  await Promise.all(jobs);
}
/* ---------- 1. no schedule: old and new are identical ---------- */
if (OLD) {
  await check('no schedule, card cannot render: record, DM, client drafts and batch identical to the base commit', async () => {
    const r = await tickBoth({ fonts: false }, '2026-11-27T20:05:00Z');
    assert.deepEqual(r.newResult, r.oldResult);
    assert.equal(r.newResult.slot, '2026-11-27T14');
    same(snap(r.new), snap(r.old));
    assert.ok(r.new.settings.has('standing:2026-11-27T14') && r.new.settings.has('standingSent:2026-11-27T14'));
    assert.ok(r.new.profitUrls.every(u => !/acts=/.test(u)), 'reads every brand, no filter');
  });
  /* Before any run with fonts: once the renderer holds its fonts it keeps them for the process. */
  await check('no schedule, card cannot render: the single Send to client DM (client-update route) is identical', async () => {
    const r = await tickBoth({ fonts: false }, '2026-11-27T20:05:00Z');
    seed = 5; at('2026-11-27T20:40:00Z'); const ro = await (await route(OLD, r.old, 'POST', '/api/standing/client-update', { act: 'brand_beta' })).json();
    seed = 5; const rn = await (await route(NEW, r.new, 'POST', '/api/standing/client-update', { act: 'brand_beta' })).json();
    assert.deepEqual(rn, ro);
    same(snap(r.new), snap(r.old));
  });
  for (const [label, iso] of [['8am', '2026-11-27T14:30:00Z'], ['9pm catch-up of 8pm', '2026-11-28T03:10:00Z'], ['a non check-in hour', '2026-11-27T22:05:00Z'], ['outside the window', '2026-12-08T20:05:00Z']]) {
    await check(`no schedule, ${label}: same tick result and same writes`, async () => {
      const r = await tickBoth({ fonts: false }, iso);
      assert.deepEqual(r.newResult, r.oldResult);
      same(snap(r.new), snap(r.old));
    });
  }
  await check('season answers set but the team switch off: still identical to the base commit', async () => {
    const r = await tickBoth({ fonts: false, schedule: [['brand_alpha', '4']], switchOn: false }, '2026-11-27T18:05:00Z');
    assert.deepEqual(r.newResult, r.oldResult);
    assert.deepEqual(r.newResult, { skipped: 'not a check-in hour' });
    const r2 = await tickBoth({ fonts: false, schedule: [['brand_alpha', '4']], switchOn: false }, '2026-11-27T20:05:00Z');
    assert.deepEqual(r2.newResult, r2.oldResult);
    same(snap(r2.new), snap(r2.old));
  });
  await check('card switch OFF (default), card could render: tick, DM, batch and thread previews identical to the base commit', async () => {
    const r = await tickBoth({ fonts: true }, '2026-11-27T20:05:00Z');
    assert.deepEqual(r.newResult, r.oldResult);
    same(snap(r.new), snap(r.old));
    assert.ok(threadPostsOf(r.new).length > 0, 'previews were posted in the thread');
    assert.ok(!JSON.stringify(snap(r.new)).includes('ws_card'), 'no card anywhere');
  });
  await check('card switch ON: only the card (block + its upload) differs', async () => {
    const r = await tickBoth({ fonts: true, cardFlag: true }, '2026-11-27T20:05:00Z');
    const drafts = [...r.new.settings].filter(([k]) => k.startsWith('wsDraft:')).map(([, v]) => JSON.parse(v));
    if (!drafts.some(d => d.msg.blocks[0].block_id === 'ws_card')) { console.log('     (resvg could not render here: the card fell back to text, which the test above covers)'); }
    else assert.ok(drafts.every(d => d.msg.blocks[0].type === 'image' && d.msg.blocks[0].slack_file.id.startsWith('F_update-')), 'card on top of every draft');
    same(noCardCalls(snap(r.new)), noCardCalls(snap(r.old)));
  });
  await check('card switch OFF: the page Send all (send_batch) is byte for byte the base commit', async () => {
    for (const refuseCard of [false, true]) {
      const r = await tickBoth({ fonts: true, refuseCard }, '2026-11-27T20:05:00Z');
      at('2026-11-27T20:20:00Z');
      const ro = await (await route(OLD, r.old, 'POST', '/api/standing/sample', { send_batch: '2026-11-27T14' })).json();
      const rn = await (await route(NEW, r.new, 'POST', '/api/standing/sample', { send_batch: '2026-11-27T14' })).json();
      assert.deepEqual(rn, ro);
      assert.ok(r.new.posts.filter(p => p.channel === 'C_CLIENT').length > 0, 'client posts made');
      same(snap(r.new), snap(r.old));
    }
  });
  await check('card switch OFF: the Slack Send all button (ws_sendall) is byte for byte the base commit', async () => {
    const r = await tickBoth({ fonts: true }, '2026-11-27T20:05:00Z');
    at('2026-11-27T20:20:00Z');
    for (const [mod, w] of [[OLD, r.old], [NEW, r.new]]) await tap(mod, w, 'ws_sendall', '2026-11-27T14');
    assert.ok(r.new.posts.filter(p => p.channel === 'C_CLIENT').length > 0, 'client posts made');
    assert.ok(sendingRedraws(snap(r.new)) > 0, 'the message showed Sending... first');
    same(noSending(snap(r.new)), snap(r.old));
  });
  await check('card switch OFF: a single batch Send button (ws_send) is byte for byte the base commit', async () => {
    const r = await tickBoth({ fonts: true }, '2026-11-27T20:05:00Z');
    at('2026-11-27T20:20:00Z');
    const id = JSON.parse(r.new.settings.get('wsBatch:2026-11-27T14')).items.find(i => i.status === 'ready').id;
    for (const [mod, w] of [[OLD, r.old], [NEW, r.new]]) await tap(mod, w, 'ws_send', id);
    assert.equal(r.new.posts.filter(p => p.channel === 'C_CLIENT').length, 1);
    assert.equal(sendingRedraws(snap(r.new)), 1, 'the message showed Sending... first');
    same(noSending(snap(r.new)), snap(r.old));
  });
  await check('card switch OFF: an Approve after the tick re-drafts and previews in the thread exactly as the base commit', async () => {
    const r = await tickBoth({ fonts: true }, '2026-11-27T20:05:00Z');
    at('2026-11-27T20:20:00Z');
    for (const [mod, w] of [[OLD, r.old], [NEW, r.new]]) { seed = 9; const rec = JSON.parse(w.settings.get('standing:2026-11-27T14')); await mod.batchApproved(w.env, w.deps, rec, 'brand_beta'); }
    assert.ok(threadPostsOf(r.new).length > 3, 'the re-draft was previewed');
    same(snap(r.new), snap(r.old));
  });
  await check('card switch ON: Send all posts the same client text; a refused card falls back to exactly the old message', async () => {
    for (const refuseCard of [false, true]) {
      const r = await tickBoth({ fonts: true, refuseCard, cardFlag: true }, '2026-11-27T20:05:00Z');
      at('2026-11-27T20:20:00Z');
      const ro = await (await route(OLD, r.old, 'POST', '/api/standing/sample', { send_batch: '2026-11-27T14' })).json();
      const rn = await (await route(NEW, r.new, 'POST', '/api/standing/sample', { send_batch: '2026-11-27T14' })).json();
      assert.deepEqual(rn, ro);
      const toClient = w => w.posts.filter(p => p.channel === 'C_CLIENT');
      const withCard = toClient(r.new).filter(p => p.blocks.some(b => b.block_id === 'ws_card'));
      if (refuseCard && withCard.length) console.log(`     refused card: ${withCard.length} card posts refused, each re-sent as text`);
      const sentOld = toClient(r.old), sentNew = toClient(r.new).filter(p => !(refuseCard && p.blocks.some(b => b.block_id === 'ws_card')));
      assert.equal(sentNew.length, sentOld.length);
      assert.deepEqual(noCard(sentNew), noCard(sentOld));
      if (refuseCard) assert.deepEqual(sentNew, sentOld, 'refused card: the text-only message is byte for byte the old one');
    }
  });
}

/* ---------- 2. with a schedule ---------- */
await check('schedule: Brand Alpha every 4h; 8am all, 12pm only Alpha (Since 8am, others carried), 1pm nothing, 2pm the rest', async () => {
  const w = world({ schedule: [['brand_alpha', '4'], ['brand_gamma', 'x']] });
  seed = 1;
  at('2026-11-27T14:05:00Z'); const r8 = await NEW.standingTick(w.env, w.deps, new Date());
  assert.equal(r8.slot, '2026-11-27T08'); assert.equal(r8.brands, 3); assert.equal(r8.carried, 0);
  at('2026-11-27T18:05:00Z'); const r12 = await NEW.standingTick(w.env, w.deps, new Date());
  assert.equal(r12.slot, '2026-11-27T12'); assert.equal(r12.brands, 1); assert.equal(r12.carried, 2);
  assert.match(w.profitUrls.at(-1), /acts=brand_alpha$/);
  const rec = JSON.parse(w.settings.get('standing:2026-11-27T12'));
  const a = rec.brands.find(b => b.act_id === 'brand_alpha'), g = rec.brands.find(b => b.act_id === 'brand_gamma');
  assert.equal(a.checked_slot, '2026-11-27T12'); assert.equal(a.prev.slot, '2026-11-27T08'); assert.equal(a.next, '4pm');
  assert.ok(a.prev.today && a.prev.week && a.prev.so_far && Array.isArray(a.prev.camps));
  assert.equal(g.carried, 1); assert.equal(g.checked_slot, '2026-11-27T08'); assert.ok(!g.prev);
  const bt = JSON.parse(w.settings.get('wsBatch:2026-11-27T12'));
  assert.deepEqual(bt.items.map(i => i.act), ['brand_alpha'], 'client batch only for the due brand');
  const draft = JSON.parse(w.settings.get(`wsDraft:${bt.items[0].id}`));
  const text = JSON.stringify(draft.msg);
  assert.match(text, /SINCE 8AM/); assert.doesNotMatch(text, /LAST 6 HOURS/); assert.match(text, /Next update at 4pm CT/);
  at('2026-11-27T19:05:00Z'); const r13 = await NEW.standingTick(w.env, w.deps, new Date());
  assert.deepEqual(r13, { skipped: 'no brand is due' });
  at('2026-11-27T20:05:00Z'); const r14 = await NEW.standingTick(w.env, w.deps, new Date());
  assert.equal(r14.slot, '2026-11-27T14'); assert.equal(r14.brands, 2); assert.equal(r14.carried, 1);
  const rec14 = JSON.parse(w.settings.get('standing:2026-11-27T14'));
  assert.equal(rec14.brands.find(b => b.act_id === 'brand_alpha').checked_slot, '2026-11-27T12', 'Alpha carried with its own check-in');
  const dm = w.slack.filter(c => c.method === 'chat.postMessage' && c.body.channel === 'U_OWNER' && /^Where we stand/.test(c.body.text || ''));
  assert.equal(dm.length, 3, 'one DM per check-in that ran');
  assert.ok(JSON.stringify(dm[1].body).match(/Brand (Alpha|Beta|Gamma)/g).every(x => x === 'Brand Alpha'), '12pm DM names only the due brand');
  console.log('     12pm DM (only the due brand):\n       ' + dm[1].body.text);
  console.log('     12pm client update (Alpha):\n       ' + draft.msg.attachments.map(x => x.blocks.map(b => (b.text && (b.text.text || b.text)) || '').join(' | ')).join('\n       '));
});
await check('schedule: approve refuses a carried brand whose own check-in is over 6 hours old', async () => {
  const w = world({ schedule: [['brand_alpha', '12']] });
  at('2026-11-27T14:05:00Z'); await NEW.standingTick(w.env, w.deps, new Date());      // 8am, all
  at('2026-11-28T02:05:00Z'); await NEW.standingTick(w.env, w.deps, new Date());      // 8pm, Alpha (12h = 8am, 8pm), others too (default 8pm)
  at('2026-11-28T15:05:00Z');
  const w2 = world({ schedule: [['brand_alpha', '12']] });
  const rec = { slot: '2026-11-28T09', at: new Date().toISOString(), brands: [{ act_id: 'brand_alpha', carried: 1, checked_at: '2026-11-28T02:05:00Z', suggest: { to: 500, pct: 0.25 }, meta: { camp: { id: '1234567', daily: 400 } } }], approved: {} };
  w2.settings.set('standing:2026-11-28T09', JSON.stringify(rec));
  const r = await (await route(NEW, w2, 'POST', '/api/standing/approve', { slot: '2026-11-28T09', act: 'brand_alpha' })).json();
  assert.match(r.error, /over 6 hours old/);
});
await check('hours: 3h, 4h, 6h, 10h match the design; 6h is today\'s 8am, 2pm, 8pm', async () => {
  assert.deepEqual(NEW.hoursFor(3), [8, 11, 14, 17, 20]); assert.deepEqual(NEW.hoursFor(4), [8, 12, 16, 20]);
  assert.deepEqual(NEW.hoursFor(6), NEW.STAND_HOURS); assert.deepEqual(NEW.hoursFor(10), [8, 18]);
  assert.equal(NEW.nextLabel('2026-11-27T14'), '8pm'); assert.equal(NEW.nextLabel('2026-11-27T20'), '8am Sat');
});

/* ---------- 3. the card and the one-brand send ---------- */
await check('card: 2.7 layout, Since window when prev is today, changes with reasons, nothing internal', async () => {
  const rec = { slot: '2026-11-27T14', next: '8pm', brands: [{ act_id: 'brand_alpha', name: 'Brand Alpha', kpi: 2.5, hold: 2.0,
    last6: { sales: 1000, spend: 500, mer: 2 }, today: { sales: 5000, spend: 1800, mer: 2.78 }, week: { sales: 20000, spend: 9000, mer: 2.22 },
    prev: { slot: '2026-11-27T08', today: { sales: 1000, spend: 400 } } }] };
  const svg = IMG.clientCardSvg(rec, 'brand_alpha', [{ line: 'Raised the Sale Campaign budget from $750 to $940 a day', why: 'Sales are running ahead of the goal.' }]);
  for (const s of ['BRAND ALPHA · BLACK FRIDAY', 'Fri, Nov 27 · 2pm CT', 'Goal 2.50x MER', 'SINCE 8AM', 'TODAY', 'THIS WEEK', 'WHAT WE CHANGED', 'Raised the Sale Campaign budget', 'Sales are running ahead', 'Next update around 8pm CT', 'Above goal', 'Under goal'])
    assert.ok(svg.includes(s), s);
  assert.ok(svg.includes('2.86x'), 'since window = today minus the 8am check-in ($4,000 on $1,400)');
  assert.doesNotMatch(svg, /break-even|budgets room|\u2014|\u2013/);
  const svg2 = IMG.clientCardSvg({ ...rec, brands: [{ ...rec.brands[0], prev: null }] }, 'brand_alpha', []);
  assert.ok(svg2.includes('LAST 6 HOURS') && svg2.includes('No changes since the last update'));
});
await check('send one brand: owner only, the send_batch steps, marks the batch and wsLastSent', async () => {
  const w = world({});
  seed = 1; at('2026-11-27T20:05:00Z'); await NEW.standingTick(w.env, w.deps, new Date());
  at('2026-11-27T20:30:00Z');
  const bad = await route(NEW, { ...w, deps: { ...w.deps, sessionEmail: async () => 'teammate@example.test' } }, 'POST', '/api/standing/send', { act: 'brand_beta', slot: '2026-11-27T14' });
  assert.equal(bad.status, 403);
  const r = await (await route(NEW, w, 'POST', '/api/standing/send', { act: 'brand_beta', slot: '2026-11-27T14' })).json();
  assert.equal(r.sent, true); assert.equal(r.slot, '2026-11-27T14');
  assert.equal(w.posts.filter(p => p.channel === 'C_CLIENT').length, 1);
  assert.ok(w.settings.get('wsLastSent:brand_beta'));
  assert.equal(JSON.parse(w.settings.get('wsBatch:2026-11-27T14')).items.find(i => i.act === 'brand_beta').status, 'sent');
  const again = await (await route(NEW, w, 'POST', '/api/standing/send', { act: 'brand_beta', slot: '2026-11-27T14' })).json();
  assert.equal(again.skipped, 'sent');
});
/* ---------- 4. review fixes ---------- */
const threadPosts = w => w.slack.filter(c => c.method === 'chat.postMessage' && c.body.thread_ts);
await check('no schedule: a thread preview Slack refuses with the card is retried, then posted as text', async () => {
  const w = world({ fonts: true, refuseThreadCard: true, cardFlag: true });
  seed = 1; at('2026-11-27T20:05:00Z'); await NEW.standingTick(w.env, w.deps, new Date());
  const drafts = [...w.settings].filter(([k]) => k.startsWith('wsDraft:')).map(([, v]) => JSON.parse(v));
  if (!drafts.some(d => d.msg.blocks.some(b => b.block_id === 'ws_card'))) { console.log('     (resvg could not render here: nothing to refuse)'); return; }
  const tp = threadPosts(w), withCard = tp.filter(c => c.body.blocks.some(b => b.block_id === 'ws_card')), plain = tp.filter(c => !c.body.blocks.some(b => b.block_id === 'ws_card'));
  assert.equal(plain.length, 3, 'every preview reached the thread as text');
  assert.equal(withCard.length, 3 * 4, 'each card preview tried 4 times before the text');
  console.log(`     ${withCard.length} refused card previews, ${plain.length} text previews in the thread`);
});
await check('the client copy of the card is uploaded with the user token, never the bot file', async () => {
  const w = world({ fonts: true, cardFlag: true });
  seed = 1; at('2026-11-27T20:05:00Z'); await NEW.standingTick(w.env, w.deps, new Date());
  at('2026-11-27T20:30:00Z');
  const r = await (await route(NEW, w, 'POST', '/api/standing/send', { act: 'brand_beta', slot: '2026-11-27T14' })).json();
  assert.equal(r.sent, true);
  const post = w.posts.filter(p => p.channel === 'C_CLIENT')[0];
  const card = post.blocks.find(b => b.block_id === 'ws_card');
  if (!card) { console.log('     (resvg could not render here: the update went as text)'); return; }
  assert.ok(card.slack_file.id.startsWith('FU_'), 'the user upload, not the bot preview file');
  assert.ok(w.userUploads.length === 1 && w.userUploads[0].auth === 'Bearer xoxp-test');
});
await check('double tap: two sends at once for one brand post to the client once', async () => {
  const w = world({});
  seed = 1; at('2026-11-27T20:05:00Z'); await NEW.standingTick(w.env, w.deps, new Date());
  at('2026-11-27T20:30:00Z');
  const [a, b] = await Promise.all([1, 2].map(() => route(NEW, w, 'POST', '/api/standing/send', { act: 'brand_beta', slot: '2026-11-27T14' }).then(x => x.json())));
  assert.equal(w.posts.filter(p => p.channel === 'C_CLIENT').length, 1);
  assert.equal([a, b].filter(x => x.sent).length, 1);
  assert.ok([a, b].some(x => x.skipped === 'sending' || x.skipped === 'sent in the last 2 hours'));
  assert.equal(w.claims.size, 0, 'the claim is cleared');
  assert.equal(JSON.parse(w.settings.get('wsBatch:2026-11-27T14')).items.find(i => i.act === 'brand_beta').status, 'sent');
  const later = await (await route(NEW, w, 'POST', '/api/standing/send', { act: 'brand_beta', slot: '2026-11-27T14' })).json();
  assert.equal(later.skipped, 'sent');
});
await check('send after a page Check now (no batch for that slot): drafts it now and sends', async () => {
  const w = world({});
  seed = 1; at('2026-11-27T20:05:00Z'); await NEW.standingTick(w.env, w.deps, new Date());
  at('2026-11-27T21:10:00Z');
  const run = await (await route(NEW, w, 'POST', '/api/standing/run', {})).json();
  assert.equal(run.standing.slot, '2026-11-27T15');
  assert.equal(w.settings.get('wsBatch:2026-11-27T15'), undefined);
  const r = await (await route(NEW, w, 'POST', '/api/standing/send', { act: 'brand_gamma', slot: '2026-11-27T15' })).json();
  assert.equal(r.sent, true, JSON.stringify(r)); assert.equal(r.slot, '2026-11-27T15');
  assert.equal(w.posts.filter(p => p.channel === 'C_CLIENT').length, 1);
  assert.equal(JSON.parse(w.settings.get('wsBatch:2026-11-27T15')).items[0].status, 'sent');
  const again = await (await route(NEW, w, 'POST', '/api/standing/send', { act: 'brand_gamma', slot: '2026-11-27T15' })).json();
  assert.equal(again.skipped, 'sent');
  assert.equal(w.posts.filter(p => p.channel === 'C_CLIENT').length, 1);
});
await check('schedule: "Since" follows the last ticked check-in, not a Check now in between', async () => {
  const w = world({ schedule: [['brand_alpha', '4']] });
  seed = 1; at('2026-11-27T14:05:00Z'); await NEW.standingTick(w.env, w.deps, new Date());   // 8am, all
  at('2026-11-27T17:05:00Z'); await route(NEW, w, 'POST', '/api/standing/run', {});          // Check now, 11am
  at('2026-11-27T18:05:00Z'); const r12 = await NEW.standingTick(w.env, w.deps, new Date());
  assert.equal(r12.slot, '2026-11-27T12');
  const a = JSON.parse(w.settings.get('standing:2026-11-27T12')).brands.find(b => b.act_id === 'brand_alpha');
  assert.equal(a.prev.slot, '2026-11-27T08');
  const bt = JSON.parse(w.settings.get('wsBatch:2026-11-27T12'));
  const text = JSON.stringify(JSON.parse(w.settings.get(`wsDraft:${bt.items[0].id}`)).msg);
  assert.match(text, /SINCE 8AM/); assert.doesNotMatch(text, /SINCE 11AM/);
});
await check('schedule: a due brand whose sale is not live still checks in while another brand is live', async () => {
  const w = world({ schedule: [['brand_alpha', '4']], notLive: ['brand_alpha'] });
  seed = 1; at('2026-11-27T14:05:00Z'); await NEW.standingTick(w.env, w.deps, new Date());
  at('2026-11-27T18:05:00Z'); const r12 = await NEW.standingTick(w.env, w.deps, new Date());
  assert.equal(r12.slot, '2026-11-27T12'); assert.equal(r12.brands, 1);
  assert.ok(w.settings.get('standingSent:2026-11-27T12'));
  at('2026-11-27T19:05:00Z'); assert.deepEqual(await NEW.standingTick(w.env, w.deps, new Date()), { skipped: 'no brand is due' });
});
await check('schedule switch: owner only; on/off stored', async () => {
  const w = world({});
  const bad = await route(NEW, { ...w, deps: { ...w.deps, sessionEmail: async () => 'teammate@example.test' } }, 'POST', '/api/standing/schedule', { on: true });
  assert.equal(bad.status, 403);
  const on = await (await route(NEW, w, 'POST', '/api/standing/schedule', { on: true })).json();
  assert.equal(on.on, true); assert.equal(w.settings.get('checkinSchedule'), 'on');
  const off = await (await route(NEW, w, 'POST', '/api/standing/schedule', { on: false })).json();
  assert.equal(off.on, false);
});
await check('send on a Check now slot, then an Approve: no post to a null channel, the single Send to client DM instead', async () => {
  const w = world({});
  seed = 1; at('2026-11-27T20:05:00Z'); await NEW.standingTick(w.env, w.deps, new Date());
  at('2026-11-27T21:10:00Z');
  await route(NEW, w, 'POST', '/api/standing/run', {});
  const r = await (await route(NEW, w, 'POST', '/api/standing/send', { act: 'brand_gamma', slot: '2026-11-27T15' })).json();
  assert.equal(r.sent, true);
  assert.equal(JSON.parse(w.settings.get('wsBatch:2026-11-27T15')).channel, null);
  const before = w.slack.length;
  const rec = JSON.parse(w.settings.get('standing:2026-11-27T15'));
  await NEW.batchApproved(w.env, w.deps, rec, 'brand_gamma');
  const calls = w.slack.slice(before);
  assert.ok(calls.filter(c => /^chat\./.test(c.method)).every(c => c.body.channel != null && c.body.channel !== 'null'), 'nothing posted to channel null');
  assert.ok(!calls.some(c => c.body.thread_ts), 'no thread preview');
  assert.ok(calls.some(c => c.method === 'chat.postMessage' && JSON.stringify(c.body).includes('ws_send')), 'the single Send to client DM');
});
await check('card switch OFF: no card is drawn or uploaded anywhere (tick, Send, Send all, single DM)', async () => {
  const w = world({ fonts: true });
  seed = 1; at('2026-11-27T20:05:00Z'); await NEW.standingTick(w.env, w.deps, new Date());
  at('2026-11-27T20:30:00Z');
  await route(NEW, w, 'POST', '/api/standing/send', { act: 'brand_beta', slot: '2026-11-27T14' });
  await tap(NEW, w, 'ws_sendall', '2026-11-27T14');
  await route(NEW, w, 'POST', '/api/standing/client-update', { act: 'brand_alpha' });
  assert.ok(!w.slack.some(c => /^files\./.test(c.method) && /^update-/.test(c.body.filename || '')), 'no card upload as the bot');
  assert.equal(w.userUploads.length, 0, 'no card upload as the user');
  assert.ok(![...w.settings.values()].some(v => /ws_card|card_svg/.test(String(v))), 'no card stored');
});
await check('no em or en dashes added in the changed files', async () => {
  for (const f of ['src/standing.js', 'src/standingimg.js']) {
    const now = fs.readFileSync(path.join(HERE, f), 'utf8');
    let base = ''; try { base = execFileSync('git', ['show', `${BASE}:account-health/worker/${f}`], { cwd: HERE, maxBuffer: 1 << 26 }).toString(); } catch {}
    const count = s => (s.match(/[\u2014\u2013]/g) || []).length;
    assert.ok(count(now) <= count(base), `${f}: ${count(now)} dashes vs ${count(base)} before`);
  }
});

globalThis.Date = RealDate;
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);

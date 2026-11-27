/* The War Room's Meta daily limit, the live budgets under it, and the Send buttons coming back after a throw.
 *   node test-standing-metalimit.mjs        (from account-health/worker)
 *
 * 1. Meta's API has no daily spending limit field any more (adtrust_dsl: "(#100) Tried accessing nonexisting field"):
 *    the limit is set by hand, settings `metaLimits` {brand: dollars} over the built-in default, edited by the owner
 *    through GET/PUT /api/standing/limits, labelled "set by hand". A raise never goes over it.
 * 2. budgetsOn counts only what can spend now: a campaign whose ACTIVE ad sets all start later (a Holiday campaign
 *    starting Dec 1) or have ended does not eat the room.
 * 3. ws_send / ws_sendall: a throw after Sending... redraws the stored batch so Send comes back; ws_send reads the batch
 *    again before marking Sent, so another send's Sent mark stays.
 * With the limit and the budgets unchanged, the check-in is byte for byte what origin/main builds.
 * Sample brands and numbers are made up. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { register } from 'node:module';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const BASE = '7b0d81b8';   // origin/main before this change (PR 372 merged)
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
let NOW = RealDate.parse('2026-11-27T20:13:00Z');
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
const oldFile = path.join(HERE, 'src', `_standing_limit_base_${process.pid}.mjs`);
try {
  fs.writeFileSync(oldFile, execFileSync('git', ['show', `${BASE}:account-health/worker/src/standing.js`], { cwd: HERE, maxBuffer: 1 << 26 }));
  OLD = await import(pathToFileURL(oldFile).href);
} catch (e) { console.log(`SKIP old-vs-new: the base commit ${BASE} is not in this clone (${String(e.message).split('\n')[0]})`); }
finally { try { fs.unlinkSync(oldFile); } catch {} }

/* ---------- a world: one made-up brand on Meta, Triple Whale through PROFIT, Slack ---------- */
const ACT = 'brand_yak_sports';   // a brand with a built-in limit (the number itself is not asserted)
function world(meta) {
  const settings = new Map(), slack = [], posts = [], claims = new Map(), graph = [];
  const fail = { post: null, putDraft: false, draftReads: null, throwKey: null };
  const DB = { prepare(sql) {
    const st = { args: [], bind(...a) { st.args = a; return st; },
      async all() { return /FROM connections/.test(sql) ? { results: [{ act: 'act_100', name: 'Acct' }] } : { results: [] }; },
      async first() { return /FROM brand_accounts/.test(sql) ? { name: 'Brand', brief_channel: 'C_CLIENT', slack_channel: 'C_INTERNAL' } : null; },
      async run() {
        if (/^INSERT INTO settings/.test(sql)) { const [k, v, stale] = st.args; const cur = claims.get(k); if (cur == null || cur < stale) { claims.set(k, v); return { meta: { changes: 1 } }; } return { meta: { changes: 0 } }; }
        if (/^DELETE FROM settings/.test(sql)) { const [k, v] = st.args; if (claims.get(k) === v) claims.delete(k); return { meta: { changes: 1 } }; }
        return {};
      } };
    return st;
  } };
  const profit = () => ({ today: '2026-11-27', dry: 0, window: { from: '2026-11-26', to: '2026-11-30' }, brands: [{
    act_id: ACT, name: 'Brand', currency: 'USD', goal: 50000, kpi: 2.5, hold: 2, sale: { start: '2026-11-26', end: '2026-11-30' }, mode: 'live',
    today: { sales: 9000, spend: 2000, mer: 4.5 }, last6: { hours: 6, sales: 4000, spend: 900, mer: 4.4 },
    so_far: { from: '2026-11-26', days: 2, sales: 18000, spend: 4000, mer: 4.5, pct_goal: 0.36, new_rev: 5000, new_orders: 40, new_mer: 1.25, email_share_new: 0.1 },
    week: { from: '2026-11-23', sales: 30000, spend: 8000, mer: 3.75 }, be_new: 1.6, no_sales: 0,
    suggest: { call: 'scale', pct: 0.5, why: 'Store MER well over the line.' } }] });
  const env = { DB, OWNER_EMAIL: 'owner@example.test', SLACK_USER_TOKEN: 'xoxp-test', META_TOKEN: 'meta-test',
    PROFIT: { fetch: async () => Response.json(profit()) } };
  const xfetch = async (url, init = {}) => {
    if (/cdn\.jsdelivr\.net/.test(url)) throw new Error('no network in tests');
    if (url.startsWith('https://graph.facebook.com/')) {
      const u = new URL(url), p = u.pathname.replace(/^\/v[\d.]+\//, ''), fields = u.searchParams.get('fields') || '';
      graph.push(p + '?' + fields);
      if (/adtrust_dsl/.test(fields)) return Response.json({ error: { message: '(#100) Tried accessing nonexisting field (adtrust_dsl) on node type (AdAccount)', code: 100 } }, { status: 400 });
      if (p.endsWith('/campaigns')) return Response.json({ data: meta.campaigns });
      if (p.endsWith('/adsets')) return Response.json({ data: meta.adsets });
      if (p.endsWith('/insights')) return Response.json({ data: meta.campaigns.filter(c => c.spend).map(c => ({ campaign_id: c.id, spend: String(c.spend) })) });
      if (p === 'act_100') return Response.json({ name: 'Acct', user_tasks: ['MANAGE', 'ADVERTISE', 'ANALYZE'] });
      return Response.json({ data: [] });
    }
    if (url === 'https://slack.com/api/chat.postMessage') {
      const body = JSON.parse(init.body);
      if (fail.post) return Response.json({ ok: false, error: fail.post });
      posts.push(body); return Response.json({ ok: true, ts: `9${posts.length}.0`, channel: body.channel });
    }
    if (url === 'https://hooks.slack.test/respond') return new Response('ok');
    return Response.json({ data: [] });
  };
  let ts = 0;
  const deps = {
    slackWait: 0, xfetch, mintSession: async () => ({ token: 't' }), listAccounts: async () => [], twAttr: null,
    getSetting: async (e, k) => { if (fail.throwKey && fail.throwKey.test(k)) throw new Error('D1 is down'); if (fail.draftReads != null && /^wsDraft:/.test(k) && fail.draftReads-- <= 0) throw new Error('D1 is down'); return settings.has(k) ? settings.get(k) : null; },
    putSetting: async (e, k, v) => { if (fail.putDraft && /^wsDraft:/.test(k) && /"done":"sent/.test(v)) throw new Error('D1 is down'); settings.set(k, v); },
    isAdmin: async () => true, sessionEmail: async () => 'owner@example.test', brandsFor: async () => null,
    slackApi: async (e, method, body) => {
      slack.push({ method, body: JSON.parse(JSON.stringify(body || {})) });
      if (method === 'users.lookupByEmail') return { ok: true, user: { id: 'U_OWNER' } };
      if (method === 'chat.postMessage') return { ok: true, ts: `1${++ts}.0`, channel: 'D_OWNER' };
      return { ok: true };
    },
  };
  return { env, deps, settings, slack, posts, claims, graph, fail };
}
const route = async (mod, w, method, p, body, who) => {
  const url = new URL('https://ah.test' + p);
  if (who) w.deps.sessionEmail = async () => who;
  const req = new Request(url, { method, headers: { 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) });
  return mod.handleStanding(req, w.env, url, url.pathname, (j, s = 200) => Response.json(j, { status: s }), w.deps);
};
async function tap(mod, w, action_id, value) {
  const jobs = [];
  await mod.handleClientUpdateButton(w.env, { waitUntil: p => jobs.push(p.catch(e => { w.thrown = e; })) }, { actions: [{ action_id, value }], user: { id: 'U06C37MDWD7', name: 'owner' }, channel: { id: 'D_OWNER' }, message: { ts: '11.0' } },
    w.deps, { ACK: () => new Response(''), xfetch: w.deps.xfetch });
  await Promise.all(jobs);
}
const campaign = (id, name, daily, spend = 0) => ({ id, name, status: 'ACTIVE', effective_status: 'ACTIVE', daily_budget: String(daily * 100), spend });
const adset = (id, campaign_id, start, end = null, daily = null) => ({ id, name: 'Set ' + id, status: 'ACTIVE', effective_status: 'ACTIVE', campaign_id, start_time: start, end_time: end, ...(daily ? { daily_budget: String(daily * 100) } : {}) });
/* Sale campaign spending today plus an evergreen one: every set running. */
const RUNNING = { campaigns: [campaign('c1', 'BFCM 2026', 200, 150), campaign('c2', '[MD] CBO evergreen', 100, 60)],
  adsets: [adset('s1', 'c1', '2026-11-20T00:00:00-0600'), adset('s2', 'c2', '2026-10-01T00:00:00-0600')] };

/* ---------- 1. budgetsOn ---------- */
await check('budgetsOn: a campaign whose ad sets all start later does not count; running and ended sets do as they should', () => {
  const now = RealDate.parse('2026-11-27T20:00:00Z');
  const ml = { campaigns: {
      bf: { status: 'ACTIVE', daily: 200 }, hol: { status: 'ACTIVE', daily: 500 }, done: { status: 'ACTIVE', daily: 70 }, off: { status: 'PAUSED', daily: 900 },
      abo: { status: 'ACTIVE', daily: null } },
    adsets: {
      a: { status: 'ACTIVE', campaign: 'bf', start: '2026-11-26T00:00:00-0600', end: '2026-12-01T00:00:00-0600' },
      b: { status: 'ACTIVE', campaign: 'hol', start: '2026-12-01T00:00:00-0600', end: '2026-12-17T00:00:00-0600' },
      c: { status: 'PAUSED', campaign: 'hol', start: '2026-11-01T00:00:00-0600' },
      d: { status: 'ACTIVE', campaign: 'done', start: '2026-11-01T00:00:00-0600', end: '2026-11-20T23:59:00-0600' },
      e: { status: 'ACTIVE', campaign: 'off', start: '2026-11-01T00:00:00-0600' },
      f: { status: 'ACTIVE', campaign: 'abo', daily: 30, start: '2026-11-01T00:00:00-0600' },
      g: { status: 'ACTIVE', campaign: 'abo', daily: 40, start: '2026-12-01T00:00:00-0600' },
      h: { status: 'ACTIVE', campaign: 'abo', daily: 25 } } };
  assert.equal(NEW.budgetsOn(ml, now), 200 + 30 + 25);
  if (OLD) assert.equal(OLD.budgetsOn(ml), 200 + 500 + 70 + 30 + 40 + 25, 'origin/main counted the later and ended ones');
  /* The day the Holiday sets start, they count. */
  assert.equal(NEW.budgetsOn(ml, RealDate.parse('2026-12-01T07:00:00Z')), 500 + 30 + 40 + 25);
  /* No ad sets read at all: every ACTIVE campaign budget, as before. */
  const bare = { campaigns: ml.campaigns, adsets: {} };
  assert.equal(NEW.budgetsOn(bare, now), 200 + 500 + 70);
  if (OLD) assert.equal(NEW.budgetsOn(bare, now), OLD.budgetsOn(bare));
  /* Sets without a start time read count as running (a non-season read). */
  assert.equal(NEW.budgetsOn({ campaigns: { x: { status: 'ACTIVE', daily: 10 } }, adsets: { y: { status: 'ACTIVE', campaign: 'x' } } }, now), 10);
});

await check('a Holiday campaign starting later no longer blocks a raise (room counted on what spends now)', async () => {
  at('2026-11-27T20:13:00Z');
  const limit = NEW.limitOf(ACT, {}).limit;
  /* Holiday budget alone takes the account past the limit; its sets start Dec 1. */
  const meta = { campaigns: [...RUNNING.campaigns, campaign('c3', 'Holiday 2026', limit)], adsets: [...RUNNING.adsets, adset('s3', 'c3', '2026-12-01T00:00:00-0600', '2026-12-17T00:00:00-0600')] };
  const w = world(meta);
  const rec = await NEW.buildStanding(w.env, w.deps, '2026-11-27T14');
  const b = rec.brands[0];
  assert.equal(b.meta.on, 300);
  assert.equal(b.meta.headroom, limit - 300);
  assert.equal(b.suggest.to, 300, 'the +50% raise on $200 goes through');
  if (OLD) {
    const w0 = world(meta), r0 = await OLD.buildStanding(w0.env, w0.deps, '2026-11-27T14');
    assert.equal(r0.brands[0].meta.on, 300 + limit, 'origin/main counted the Holiday budget');
    assert.ok(r0.brands[0].suggest.to == null, 'and blocked the raise');
  }
});

await check('the picked sale campaign always counts in the room, even when none of its sets runs right now', async () => {
  /* Campaign A: early sets ended at midnight, the next set starts tomorrow. Campaign B runs. Limit 5000. */
  const now = RealDate.parse('2026-11-26T20:00:00Z');
  const ml = { campaigns: { A: { status: 'ACTIVE', daily: 500, name: 'BFCM 2026' }, B: { status: 'ACTIVE', daily: 4400, name: 'Evergreen' } },
    adsets: { a1: { status: 'ACTIVE', campaign: 'A', start: '2026-11-01T00:00:00-0600', end: '2026-11-26T00:00:00-0600' },
      a2: { status: 'ACTIVE', campaign: 'A', start: '2026-11-27T18:00:00-0600' },
      b1: { status: 'ACTIVE', campaign: 'B', start: '2026-10-01T00:00:00-0600' } } };
  assert.equal(NEW.budgetsOn(ml, now), 4400, 'without keep, A is left out');
  if (OLD) assert.equal(OLD.budgetsOn(ml), 4900);
  assert.equal(NEW.budgetFor({ pct: 0.5 }, 500, 5000, 4400).to, 750, 'that is how the room was overstated');
  const on = NEW.budgetsOn(ml, now, { keep: 'A' });
  assert.equal(on, 4900);
  const bf = NEW.budgetFor({ pct: 0.5 }, 500, 5000, on);
  assert.equal(bf.to, 600); assert.ok(on - 500 + bf.to <= 5000, 'capped so the total stays at the limit');
  /* End to end: the check-in picks A and sizes the raise with A counted, so the total never passes the limit. */
  at('2026-11-26T20:00:00Z');
  const meta = { campaigns: [campaign('A', 'BFCM 2026', 500), campaign('B', '[MD] CBO evergreen', 4400, 900)],
    adsets: [adset('a1', 'A', '2026-11-01T00:00:00-0600', '2026-11-26T00:00:00-0600'), adset('a2', 'A', '2026-11-27T18:00:00-0600'), adset('b1', 'B', '2026-10-01T00:00:00-0600')] };
  const w = world(meta);
  w.settings.set('metaLimits', JSON.stringify({ [ACT]: 5000 }));
  const b = (await NEW.buildStanding(w.env, w.deps, '2026-11-26T14')).brands[0];
  assert.equal(b.meta.camp.id, 'A');
  assert.equal(b.meta.on, 4900);
  assert.ok(b.suggest.to == null || b.meta.on - 500 + b.suggest.to <= 5000, JSON.stringify(b.suggest));
});

await check('a set starting later today counts at 8am and 2pm; a set starting tomorrow does not', async () => {
  const ml = { campaigns: { bf: { status: 'ACTIVE', daily: 3000 }, hol: { status: 'ACTIVE', daily: 800 }, ev: { status: 'ACTIVE', daily: 100 } },
    adsets: { s: { status: 'ACTIVE', campaign: 'bf', start: '2026-11-26T18:00:00-0600', end: '2026-12-04T00:00:00-0600' },
      h: { status: 'ACTIVE', campaign: 'hol', start: '2026-12-01T00:00:00-0600' },
      e: { status: 'ACTIVE', campaign: 'ev', start: '2026-10-01T00:00:00-0600' } } };
  for (const iso of ['2026-11-26T14:00:00Z', '2026-11-26T20:00:00Z']) {   // 8am and 2pm Central
    const now = RealDate.parse(iso);
    assert.equal(NEW.budgetsOn(ml, now, { dayEnd: NEW.dayEndIn('America/Chicago', now) }), 3100, iso);
  }
  /* Nov 30 at 2pm: the Holiday sets start tomorrow, still left out. */
  const n30 = RealDate.parse('2026-11-30T20:00:00Z');
  assert.equal(NEW.budgetsOn(ml, n30, { dayEnd: NEW.dayEndIn('America/Chicago', n30) }), 3100);
  /* End to end at 2pm Central: the 6pm set's campaign is in the room. */
  at('2026-11-26T20:00:00Z');
  const meta = { campaigns: [campaign('c1', 'BFCM 2026', 200, 150), campaign('c2', '[MD] CBO evergreen', 100, 60), campaign('c4', 'Black Friday weekend', 3000)],
    adsets: [...RUNNING.adsets, adset('s4', 'c4', '2026-11-26T18:00:00-0600', '2026-12-04T00:00:00-0600')] };
  const w = world(meta);
  const b = (await NEW.buildStanding(w.env, w.deps, '2026-11-26T14')).brands[0];
  assert.equal(b.meta.on, 3300);
});

await check('dayEndIn: the next local midnight, per timezone', () => {
  const now = RealDate.parse('2026-11-26T20:00:00Z');
  assert.equal(NEW.dayEndIn('America/Chicago', now), RealDate.parse('2026-11-27T06:00:00Z'));
  assert.equal(NEW.dayEndIn('America/Los_Angeles', now), RealDate.parse('2026-11-27T08:00:00Z'));
  assert.equal(NEW.dayEndIn('America/New_York', RealDate.parse('2026-11-27T04:30:00Z')), RealDate.parse('2026-11-27T05:00:00Z'), '11:30pm Eastern: half an hour left');
  assert.equal(NEW.dayEndIn('Not/AZone', now), RealDate.parse('2026-11-27T06:00:00Z'), 'unknown zone = Central');
});

await check('a partial ad set read never lowers the count: a campaign with no sets read still counts', () => {
  const now = RealDate.parse('2026-11-26T20:00:00Z');
  const ml = { campaigns: { A: { status: 'ACTIVE', daily: 500 }, B: { status: 'ACTIVE', daily: 4400 }, P: { status: 'ACTIVE', daily: 900 } },
    adsets: { a: { status: 'ACTIVE', campaign: 'A', start: '2026-11-01T00:00:00-0600' },
      p: { status: 'PAUSED', campaign: 'P', start: '2026-11-01T00:00:00-0600' } } };
  assert.equal(NEW.budgetsOn(ml, now), 4900, 'B (no sets read) counts; P (sets read, none on) does not');
});

/* ---------- 2. the limit, set by hand ---------- */
await check('limit: no Meta read for it; the default, labelled set by hand; an owner number replaces it', async () => {
  at('2026-11-27T20:13:00Z');
  const w = world(RUNNING);
  const r1 = await NEW.buildStanding(w.env, w.deps, '2026-11-27T14');
  const m1 = r1.brands[0].meta, def = NEW.limitOf(ACT, {}).limit;
  assert.ok(def > 0);
  assert.match(JSON.stringify(NEW.standingMessage(r1)), /room under Meta's limit \(set by hand\)/);
  assert.equal(m1.limit, def); assert.equal(m1.limit_src, 'known'); assert.equal(m1.limit_label, 'set by hand'); assert.equal(m1.limit_set, 'default'); assert.equal(m1.limit_error, null);
  assert.ok(!w.graph.some(g => /adtrust_dsl/.test(g)), 'the dead field is not asked for');
  /* The owner sets a number: it is used, no deploy. */
  const put = await (await route(NEW, w, 'PUT', '/api/standing/limits', { act: ACT, limit: 1234 })).json();
  assert.equal(put.limits[ACT].limit, 1234); assert.equal(put.limits[ACT].set, 'owner'); assert.equal(put.source, 'set by hand');
  assert.equal(JSON.parse(w.settings.get('metaLimits'))[ACT], 1234);
  const m2 = (await NEW.buildStanding(w.env, w.deps, '2026-11-27T14')).brands[0].meta;
  assert.equal(m2.limit, 1234); assert.equal(m2.limit_set, 'owner'); assert.equal(m2.headroom, 1234 - 300);
  assert.equal(m2.limit_src, 'hand', 'not labelled as the Nov 22 figure once the owner set it');
  /* null = back to the default; bad input refused; only the owner. */
  const back = await (await route(NEW, w, 'PUT', '/api/standing/limits', { act: ACT, limit: null })).json();
  assert.equal(back.limits[ACT].limit, def); assert.equal(back.limits[ACT].set, 'default');
  assert.equal((await route(NEW, w, 'PUT', '/api/standing/limits', { act: ACT, limit: -5 })).status, 400);
  assert.equal((await route(NEW, w, 'PUT', '/api/standing/limits', { act: 'nope', limit: 5 })).status, 400);
  assert.equal((await route(NEW, w, 'PUT', '/api/standing/limits', { act: ACT, limit: 5 }, 'teammate@example.test')).status, 403);
  /* A broken saved value falls back to the default. */
  w.settings.set('metaLimits', 'not json');
  assert.equal(NEW.limitOf(ACT, {}).limit, def);
  w.deps.sessionEmail = async () => 'owner@example.test';
  assert.equal((await (await route(NEW, w, 'GET', '/api/standing/limits')).json()).limits[ACT].limit, def);
  /* A brand with neither: no limit, nothing capped. */
  assert.deepEqual(NEW.limitOf('brand_made_up', {}), { limit: null, set: null });
  assert.deepEqual(NEW.limitOf('brand_made_up', { brand_made_up: 50 }), { limit: 50, set: 'owner' });
});

await check('a raise never takes live budgets over the hand-set limit', async () => {
  at('2026-11-27T20:13:00Z');
  const w = world(RUNNING);
  w.settings.set('metaLimits', JSON.stringify({ [ACT]: 380 }));   // room for $80 more: $200 -> $280, not $300
  const b = (await NEW.buildStanding(w.env, w.deps, '2026-11-27T14')).brands[0];
  assert.equal(b.suggest.to, 280);
  assert.match(b.suggest.note, /Capped at \$280 by the \$380 Meta daily limit/);
  assert.ok(b.meta.on - 200 + b.suggest.to <= 380);
  w.settings.set('metaLimits', JSON.stringify({ [ACT]: 300 }));   // no room at all
  const c = (await NEW.buildStanding(w.env, w.deps, '2026-11-27T14')).brands[0];
  assert.equal(c.suggest.to, null);
  assert.match(c.suggest.note, /No room/);
});

if (OLD) {
  await check('limit and budgets unchanged: the check-in is byte for byte origin/main (apart from the new limit labels)', async () => {
    at('2026-11-27T20:13:00Z');
    const out = {};
    for (const [k, mod] of [['old', OLD], ['new', NEW]]) {
      const w = world(RUNNING); seed = 1;
      const rec = await mod.buildStanding(w.env, w.deps, '2026-11-27T14');
      for (const b of rec.brands) { delete b.meta.limit_error; delete b.meta.limit_label; delete b.meta.limit_set; }
      delete rec.at;
      out[k] = { rec, msg: mod.standingMessage(rec) };
    }
    assert.equal(out.new.rec.brands[0].meta.limit, out.old.rec.brands[0].meta.limit);
    assert.equal(JSON.stringify(out.new.msg), JSON.stringify(out.old.msg));
    assert.equal(JSON.stringify(out.new.rec), JSON.stringify(out.old.rec));
  });
}

/* ---------- 3. Send buttons ---------- */
async function readyBatch(w) {
  const rec = await NEW.buildStanding(w.env, w.deps, '2026-11-27T14');
  await w.deps.putSetting(w.env, `standing:${rec.slot}`, JSON.stringify(rec));
  await w.deps.putSetting(w.env, 'standingLatest', rec.slot);
  const r = await NEW.postBatch(w.env, w.deps, rec);
  assert.ok(r.ok, JSON.stringify(r));
  const bt = JSON.parse(w.settings.get(`wsBatch:${rec.slot}`));
  return { slot: rec.slot, id: bt.items[0].id };
}
const lastUpdate = w => w.slack.filter(c => c.method === 'chat.update').at(-1);
const hasButton = (u, action) => JSON.stringify(u.body.blocks).includes(`"action_id":"${action}"`);

await check('ws_send: a throw after Sending... redraws the stored batch, the Send button is back, the error still surfaces', async () => {
  at('2026-11-27T20:13:00Z');
  const w = world(RUNNING);
  const { slot, id } = await readyBatch(w);
  at('2026-11-27T20:30:00Z');
  w.fail.throwKey = /^wsLastSent:/;   // read while the update is freshened, before the post
  await tap(NEW, w, 'ws_send', id);
  assert.match(String(w.thrown && w.thrown.message), /D1 is down/, 'rethrown');
  assert.equal(w.posts.length, 0);
  const u = lastUpdate(w);
  assert.ok(!/Sending\.\.\./.test(JSON.stringify(u.body.blocks)), 'no Sending... left');
  assert.ok(hasButton(u, 'ws_send'), 'Send is back');
  assert.equal(JSON.parse(w.settings.get(`wsBatch:${slot}`)).items[0].status, 'ready');
  assert.equal(w.claims.size, 0, 'claim released');
  /* Thrown after the client post went out: shown and saved Sent, no Send button to post it twice. */
  const w2 = world(RUNNING); at('2026-11-27T20:13:00Z');
  const r2 = await readyBatch(w2); at('2026-11-27T20:30:00Z');
  w2.fail.putDraft = true;
  await tap(NEW, w2, 'ws_send', r2.id);
  assert.match(String(w2.thrown && w2.thrown.message), /D1 is down/);
  assert.equal(w2.posts.length, 1);
  assert.ok(!hasButton(lastUpdate(w2), 'ws_send') && !/Sending\.\.\./.test(JSON.stringify(lastUpdate(w2).body.blocks)));
  assert.equal(JSON.parse(w2.settings.get(`wsBatch:${r2.slot}`)).items[0].status, 'sent');
  /* origin/main left the message on Sending... with no button. */
  if (OLD) {
    const w0 = world(RUNNING); at('2026-11-27T20:13:00Z');
    const r0 = await readyBatch(w0); at('2026-11-27T20:30:00Z');
    w0.fail.throwKey = /^wsLastSent:/;
    await tap(OLD, w0, 'ws_send', r0.id);
    assert.ok(/Sending\.\.\./.test(JSON.stringify(lastUpdate(w0).body.blocks)), 'origin/main stuck on Sending...');
  }
});

await check('ws_sendall: a throw after Sending... redraws the stored batch with Send all back, then rethrows', async () => {
  at('2026-11-27T20:13:00Z');
  const w = world(RUNNING);
  const { slot } = await readyBatch(w);
  at('2026-11-27T20:30:00Z');
  w.fail.draftReads = 1;   // the check before Sending... reads the draft; the read after it throws (nothing posted)
  await tap(NEW, w, 'ws_sendall', slot);
  assert.match(String(w.thrown && w.thrown.message), /D1 is down/);
  assert.equal(w.posts.length, 0);
  const u = lastUpdate(w);
  assert.ok(!/Sending\.\.\./.test(JSON.stringify(u.body.blocks)));
  assert.ok(hasButton(u, 'ws_sendall') && hasButton(u, 'ws_send'), 'Send all and Send are back');
  assert.equal(JSON.parse(w.settings.get(`wsBatch:${slot}`)).items[0].status, 'ready');
  assert.equal(w.claims.size, 0);
  /* A throw after the client post went out: that brand is shown and saved Sent, not Sending... and not Send again. */
  const w2 = world(RUNNING); at('2026-11-27T20:13:00Z');
  const r2 = await readyBatch(w2); at('2026-11-27T20:30:00Z');
  w2.fail.putDraft = true;
  await tap(NEW, w2, 'ws_sendall', r2.slot);
  assert.equal(w2.posts.length, 1);
  assert.ok(!/Sending\.\.\./.test(JSON.stringify(lastUpdate(w2).body.blocks)));
  assert.equal(JSON.parse(w2.settings.get(`wsBatch:${r2.slot}`)).items[0].status, 'sent');
  if (OLD) {
    const w0 = world(RUNNING); at('2026-11-27T20:13:00Z');
    const r0 = await readyBatch(w0); at('2026-11-27T20:30:00Z');
    w0.fail.draftReads = 1;
    await tap(OLD, w0, 'ws_sendall', r0.slot);
    assert.ok(/Sending\.\.\./.test(JSON.stringify(lastUpdate(w0).body.blocks)), 'origin/main stuck on Sending...');
  }
});

await check('ws_send reads the batch again before marking Sent: a Sent mark saved meanwhile stays', async () => {
  at('2026-11-27T20:13:00Z');
  const w = world(RUNNING);
  const { slot, id } = await readyBatch(w);
  /* A second item in the batch (another brand), marked Sent by another request while this Send posts. */
  const bt = JSON.parse(w.settings.get(`wsBatch:${slot}`));
  bt.items.push({ act: 'brand_other', name: 'Other', id: 'other-1', status: 'ready' });
  w.settings.set(`wsBatch:${slot}`, JSON.stringify(bt));
  at('2026-11-27T20:30:00Z');
  const xf = w.deps.xfetch;
  w.deps.xfetch = async (url, init) => {
    if (url === 'https://slack.com/api/chat.postMessage') {
      const cur = JSON.parse(w.settings.get(`wsBatch:${slot}`));
      cur.items.find(i => i.id === 'other-1').status = 'sent';
      w.settings.set(`wsBatch:${slot}`, JSON.stringify(cur));
    }
    return xf(url, init);
  };
  await tap(NEW, w, 'ws_send', id);
  const fin = JSON.parse(w.settings.get(`wsBatch:${slot}`));
  assert.equal(fin.items.find(i => i.id === id).status, 'sent');
  assert.equal(fin.items.find(i => i.id === 'other-1').status, 'sent', 'the other Sent mark kept');
  if (OLD) {
    const w0 = world(RUNNING); at('2026-11-27T20:13:00Z');
    const r0 = await readyBatch(w0);
    const b0 = JSON.parse(w0.settings.get(`wsBatch:${r0.slot}`)); b0.items.push({ act: 'brand_other', name: 'Other', id: 'other-1', status: 'ready' }); w0.settings.set(`wsBatch:${r0.slot}`, JSON.stringify(b0));
    at('2026-11-27T20:30:00Z');
    const xf0 = w0.deps.xfetch;
    w0.deps.xfetch = async (url, init) => {
      if (url === 'https://slack.com/api/chat.postMessage') { const cur = JSON.parse(w0.settings.get(`wsBatch:${r0.slot}`)); cur.items.find(i => i.id === 'other-1').status = 'sent'; w0.settings.set(`wsBatch:${r0.slot}`, JSON.stringify(cur)); }
      return xf0(url, init);
    };
    await tap(OLD, w0, 'ws_send', r0.id);
    assert.equal(JSON.parse(w0.settings.get(`wsBatch:${r0.slot}`)).items.find(i => i.id === 'other-1').status, 'ready', 'origin/main overwrote it');
  }
});

await check('no em or en dashes added in standing.js or this test', async () => {
  const now = fs.readFileSync(path.join(HERE, 'src/standing.js'), 'utf8');
  let base = ''; try { base = execFileSync('git', ['show', `${BASE}:account-health/worker/src/standing.js`], { cwd: HERE, maxBuffer: 1 << 26 }).toString(); } catch {}
  const DASH = new RegExp('[' + String.fromCharCode(0x2013, 0x2014) + ']', 'g'), count = s => (s.match(DASH) || []).length;
  assert.ok(count(now) <= count(base), `${count(now)} dashes vs ${count(base)} before`);
  assert.equal(count(fs.readFileSync(fileURLToPath(import.meta.url), 'utf8')), 0);
});

globalThis.Date = RealDate;
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);

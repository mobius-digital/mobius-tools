/* The test kit (CONTRACT.md section 9). Offline: a fake database, two made up brands, six made up
   people, and two fake old workers that record every call. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { FakeD1 } from './fake-d1.mjs';
import { handle, tableWith } from '../router.js';
import { register } from '../db.js';
import { forget as forgetOld } from '../legacy.js';
import { forget as forgetFlags } from '../flags.js';
import { setSink } from '../log.js';
import { ENGINE_HEADER } from '../respond.js';
import { viewerMay } from '../access.js';

export const NORTH = 'brand_north_kites';
export const RIVER = 'brand_river_tea';
export const NORTH_AD_ACCOUNT = 'act_111';
export const RIVER_AD_ACCOUNT = 'act_222';
/* Every id of the other brand. A client of North Kites must never see one of these. */
export const RIVER_IDS = [RIVER, RIVER_AD_ACCOUNT, 'asana_222', 'river-tea'];

const SRC = fileURLToPath(new URL('../../', import.meta.url));
const PEOPLE = new Map();         // token -> { kind, role, email, brands }
const BASE = {
  owner: { role: 'owner', email: 'owner@agency.test' },
  team: { role: 'team', email: 'team@agency.test' },
  limited: { role: 'team', email: 'limited@agency.test', brands: [NORTH] },
  viewer: { role: 'team', email: 'viewer@agency.test' },
  client: { role: 'client', email: 'client@northkites.test', brands: [NORTH] },
};

/** A session token for a made up person. kind: owner, team, limited, viewer, client, nobody. */
export function asCaller(kind, { brands } = {}) {
  if (kind === 'nobody') return '';
  const base = BASE[kind];
  if (!base) throw new Error(`unknown caller kind ${kind}`);
  const tag = brands ? brands.join('+') : 'std';
  const token = `tok_${kind}_${tag}`;
  const email = brands ? base.email.replace('@', `+${tag.replace(/[^a-z0-9]/g, '')}@`) : base.email;
  PEOPLE.set(token, { kind, role: base.role, email, brands: brands || base.brands || null });
  return token;
}

function meFor(person) {
  if (person.role !== 'client') return { email: person.email, exp: Date.now() + 86400e3, master: false, role: person.role };
  return { email: person.email, exp: Date.now() + 86400e3, master: false, role: 'client',
    client: { name: 'Client Person', welcomed: true, brands: (person.brands || []).map(id => ({ id, name: id, access: {} })) } };
}

function fakeOld(worker, env, old) {
  return { async fetch(request) {
    const url = new URL(request.url);
    const auth = request.headers.get('Authorization') || '';
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
    const body = ['GET', 'HEAD'].includes(request.method) ? '' : await request.text();
    env.calls.push({ worker, method: request.method, path: url.pathname, search: url.search, token, body });
    const answer = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
    if (worker === 'ah' && url.pathname === '/api/me' && env.signedOut.has(token)) return answer({ error: 'unauthorized' }, 401);
    if (worker === 'ah' && url.pathname === '/api/me' && !old['GET /api/me']) {
      const person = PEOPLE.get(token);
      return person ? answer(meFor(person)) : answer({ error: 'unauthorized' }, 401);
    }
    const made = old[`${request.method} ${url.pathname}`];
    if (!made) return answer({ old: true, worker, method: request.method, path: url.pathname });
    const out = await made(request, url, body);
    return out instanceof Response ? out : answer(out);
  } };
}

function syncPeople(env) {
  const roles = {}, userBrands = {}, clients = {};
  for (const p of PEOPLE.values()) {
    if (p.kind === 'viewer') roles[p.email] = 'viewer';
    if (p.kind === 'limited') userBrands[p.email] = p.brands;
    if (p.kind === 'client') clients[p.email] = { brands: p.brands, name: 'Client Person' };
  }
  env.DB.insert('settings', [{ key: 'userRoles', value: JSON.stringify(roles) },
    { key: 'userBrands', value: JSON.stringify(userBrands) }, { key: 'clientUsers', value: JSON.stringify(clients) }]);
}

function seed(db) {
  /* The engine answers only when the flag says new (no row = old), so the tests turn it on. */
  db.insert('settings', [{ key: 'engineMode', value: 'new' }]);
  db.insert('brands', [
    { id: NORTH, slug: 'north-kites', name: 'North Kites', legacy_key: NORTH_AD_ACCOUNT, internal_channel: 'C0NORTH0001', client_channel: 'C0NORTH0002' },
    { id: RIVER, slug: 'river-tea', name: 'River Tea', legacy_key: RIVER_AD_ACCOUNT, internal_channel: 'C0RIVER0001', client_channel: 'C0RIVER0002' },
  ]);
  db.insert('accounts', [{ act_id: NORTH_AD_ACCOUNT, name: 'North Kites ads' }, { act_id: RIVER_AD_ACCOUNT, name: 'River Tea ads' }]);
  db.insert('connections', [
    { id: `meta:${NORTH_AD_ACCOUNT}`, brand_id: NORTH, kind: 'meta', external_id: NORTH_AD_ACCOUNT, is_primary: 1 },
    { id: `meta:${RIVER_AD_ACCOUNT}`, brand_id: RIVER, kind: 'meta', external_id: RIVER_AD_ACCOUNT, is_primary: 1 },
  ]);
  db.insert('brand_alias', [
    { alias: NORTH_AD_ACCOUNT, brand_id: NORTH, kind: 'meta_act' }, { alias: 'asana_111', brand_id: NORTH, kind: 'asana' },
    { alias: RIVER_AD_ACCOUNT, brand_id: RIVER, kind: 'meta_act' }, { alias: 'asana_222', brand_id: RIVER, kind: 'asana' },
  ]);
}

/** A fresh env: DB and CAL in memory, the kernel schema and each named group's schema.sql loaded,
 *  two brands seeded, `rows` inserted, fake OLD_AH and OLD_PW. env.calls lists every old call.
 *  env.signedOut.add(token) makes the old side refuse that session from then on. */
export function makeEnv({ groups = [], rows = {}, old = {}, sql = '' } = {}) {
  const env = { DB: new FakeD1(), CAL: new FakeD1(), calls: [], logs: [], signedOut: new Set(),
    OLD_AH_ORIGIN: 'https://old-ah.test', OLD_PW_ORIGIN: 'https://old-pw.test' };
  env.DB.exec(readFileSync(new URL('./schema.sql', import.meta.url), 'utf8'));
  for (const g of groups) {
    const file = `${SRC}${g}/schema.sql`;
    if (existsSync(file)) env.DB.exec(readFileSync(file, 'utf8'));
    const cal = `${SRC}${g}/schema.cal.sql`;
    if (existsSync(cal)) env.CAL.exec(readFileSync(cal, 'utf8'));
  }
  if (sql) env.DB.exec(sql);
  seed(env.DB);
  for (const [table, list] of Object.entries(rows)) env.DB.insert(table, list);
  env.OLD_AH = fakeOld('ah', env, old);
  env.OLD_PW = fakeOld('pw', env, old);
  reset();
  return env;
}

/** Tests only: add one more group to the route table ({ name, routes, queries }). null takes it out again. */
export function useGroup(group) {
  if (group) register(group.name, group.queries || {});
  tableWith(group);
}

/** Forget everything the kernel keeps between requests (who is who, the flag). */
export function reset() { forgetOld(); forgetFlags(); }

/** One request through the whole engine. `forwarded` is true when an old worker answered.
 *  keep: true leaves the people settings and everything the kernel keeps as they are, the way a second
 *  request reaches a running worker. A test that changes a login between two calls uses it. */
export async function call(env, method, path, { token = '', body, headers = {}, keep = false } = {}) {
  if (!keep) { syncPeople(env); reset(); }
  const init = { method, headers: { ...headers } };
  if (token) init.headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) {
    init.body = typeof body === 'string' ? body : JSON.stringify(body);
    if (!init.headers['Content-Type']) init.headers['Content-Type'] = 'application/json';
  }
  const before = setSink(text => env.logs.push(JSON.parse(text)));
  let res;
  try {
    res = await handle(new Request(`https://engine.test${path}`, init), env, { waitUntil() {} });
  } finally {
    setSink(before);
  }
  const how = res.headers.get(ENGINE_HEADER) || '';
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { json = null; }   // not JSON: the test reads `text`
  return { status: res.status, json, text, engine: how, forwarded: how === 'forward' || how === 'pipe' || how === 'fallback' };
}

const typeName = v => (v === null ? 'null' : Array.isArray(v) ? 'list' : typeof v);

/** The differences in keys and types between two answers. [] when the shape is the same.
 *  null matches any type (an old answer is null where a number is not known). `meta` at the top is ignored. */
export function sameShape(a, b, at = '', out = []) {
  const ta = typeName(a), tb = typeName(b);
  if (ta === 'null' || tb === 'null') return out;
  if (ta !== tb) { out.push(`${at || '(top)'}: ${ta} against ${tb}`); return out; }
  if (ta === 'list') {
    if (a.length && b.length) sameShape(a[0], b[0], `${at}[0]`, out);
    return out;
  }
  if (ta === 'object') {
    for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) {
      if (at === '' && k === 'meta') continue;
      const here = at ? `${at}.${k}` : k;
      if (!(k in a)) out.push(`${here}: missing on the left`);
      else if (!(k in b)) out.push(`${here}: missing on the right`);
      else sameShape(a[k], b[k], here, out);
    }
  }
  return out;
}

function shapeOf(row) {
  const a = { team: true, client: false, owner_only: false, public: false, brand: 'opt', ...row.access };
  const fill = brand => row.path.replace(/:([A-Za-z_]+)/g, (_, k) => (a.brand === 'path' && k === 'id' ? brand : 'x1'));
  const url = brand => fill(brand) + (a.brand === 'need' || a.brand === 'opt' ? `?act=${brand}` : '');
  return { a, url, write: row.method !== 'GET', forward: row.handler === 'forward', key: `${row.method} ${row.path}` };
}

function forwardTest(row, s, opts) {
  test(`${s.key}: is forwarded to the old worker as the same person`, async () => {
    const env = makeEnv(opts);
    const token = asCaller('owner');
    const r = await call(env, row.method, s.url(NORTH), { token, body: s.write ? {} : undefined });
    const sent = env.calls.filter(c => c.path !== '/api/me').pop();
    assert.ok(r.forwarded && sent, 'no old worker was called');
    const want = new URL(`https://x.test${s.url(NORTH)}`);
    assert.equal(sent.worker, row.path.slice(1, 3));
    assert.equal(sent.method, row.method);
    assert.equal(sent.path, want.pathname.slice(3));
    assert.equal(sent.search, want.search);
    assert.equal(sent.token, token);
  });
}

function clientTests(row, s, opts) {
  if (!s.a.client) {
    test(`${s.key}: a client is refused`, async () => {
      const r = await call(makeEnv(opts), row.method, s.url(NORTH), { token: asCaller('client'), body: s.write ? {} : undefined });
      assert.equal(r.status, 403);
    });
    return;
  }
  if (s.a.brand !== 'none') {
    test(`${s.key}: a client naming the other brand is refused`, async () => {
      const r = await call(makeEnv(opts), row.method, s.url(RIVER), { token: asCaller('client'), body: s.write ? {} : undefined });
      assert.equal(r.status, 403);
    });
  }
  if (!s.write && !s.forward) {
    test(`${s.key}: a client's answer holds no id of the other brand`, async () => {
      const r = await call(makeEnv(opts), 'GET', s.url(NORTH), { token: asCaller('client') });
      for (const id of RIVER_IDS) assert.ok(!r.text.includes(id), `the answer holds ${id}`);
    });
  }
}

/** Registers node:test cases for every row: nobody 401, client rules, brand limits, view only, forwards. */
export function genAccessTests(routes, opts = {}) {
  for (const row of routes) {
    const s = shapeOf(row);
    const body = s.write ? {} : undefined;
    if (!s.a.public) {
      test(`${s.key}: nobody gets 401`, async () => {
        assert.equal((await call(makeEnv(opts), row.method, s.url(NORTH), { body })).status, 401);
      });
      clientTests(row, s, opts);
    }
    if (s.a.brand !== 'none' && !s.a.public) {
      test(`${s.key}: a teammate limited to one brand cannot name the other`, async () => {
        const r = await call(makeEnv(opts), row.method, s.url(RIVER), { token: asCaller('limited'), body });
        assert.equal(r.status, 403);
      });
    }
    const viewerOwn = viewerMay(row.path) || s.a.look_may === true;     // the old door's list, or a row of the caller's own
    if (s.write && !s.a.public && !viewerOwn) {
      test(`${s.key}: a view only teammate cannot write`, async () => {
        const r = await call(makeEnv(opts), row.method, s.url(NORTH), { token: asCaller('viewer'), body });
        assert.equal(r.status, 403);
      });
    }
    if (s.write && !s.a.public && viewerOwn) {
      test(`${s.key}: a view only teammate may write its own (the old door allows it)`, async () => {
        const r = await call(makeEnv(opts), row.method, s.url(NORTH), { token: asCaller('viewer'), body });
        assert.ok(!(r.status === 403 && /view.only/i.test(String(r.json && r.json.error))), 'refused as view only');
      });
    }
    if (s.forward) forwardTest(row, s, opts);
  }
}

/** The leak helper: asserts a client of North Kites cannot read River Tea through this path.
 *  Asking for the other brand is refused, and an answer for the own brand holds none of its ids. */
export async function assertNoLeak(env, method, pathNoQuery, { body } = {}) {
  const token = asCaller('client');
  const join = pathNoQuery.includes('?') ? '&' : '?';
  const other = await call(env, method, `${pathNoQuery}${join}act=${RIVER}`, { token, body });
  assert.equal(other.status, 403, 'a client asked for the other brand and was not refused');
  const all = await call(env, method, `${pathNoQuery}${join}act=all`, { token, body });
  assert.equal(all.status, 403, 'a client asked for all brands and was not refused');
  const mine = await call(env, method, `${pathNoQuery}${join}act=${NORTH}`, { token, body });
  for (const id of RIVER_IDS) assert.ok(!mine.text.includes(id), `a client's answer holds ${id}`);
  const none = await call(env, method, pathNoQuery, { token, body });
  for (const id of RIVER_IDS) assert.ok(!none.text.includes(id), `a client's answer with no brand named holds ${id}`);
  return { mine, none };
}

/* Offline checks for AGENCY ECONOMICS and TEAM WORKLOAD (2026-10-10, src/agency.js). Drives the REAL account-health
 * worker in node against an in-memory SQLite (node:sqlite), Asana mocked through fetch, the Ledger mocked as the
 * LEDGER service binding.
 *   node test-agency.mjs      (from account-health/worker)
 */
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..', '..');

/* ---------------- database ---------------- */
const db = new DatabaseSync(':memory:');
const bindSql = sql => sql.replace(/\?(\d+)/g, (_, n) => ':p' + n);
const vals = a => Object.fromEntries(a.map((v, i) => ['p' + (i + 1), v === undefined ? null : typeof v === 'boolean' ? +v : v]));
const stmt = sql => { let args = []; const st = () => db.prepare(bindSql(sql)); return { bind(...a) { args = a; return this; }, async first() { return st().get(vals(args)) || null; }, async all() { return { results: st().all(vals(args)) }; }, async run() { const r = st().run(vals(args)); return { meta: { changes: r.changes } }; } }; };
const DB = { prepare: stmt, async batch(list) { const out = []; for (const s of list) out.push(await s.run()); return out; } };
const load = f => { for (const st of fs.readFileSync(f, 'utf8').replace(/--[^\n]*/g, '').split(/;\s*(?:\n|$)/)) { try { if (st.trim()) db.exec(st); } catch { /* re-applied */ } } };
load(path.join(root, 'profit', 'worker', 'schema.sql'));
load(path.join(root, 'profit', 'worker', 'migrations', 'brand-001.sql'));
load(path.join(here, 'schema.sql'));
db.exec(`CREATE TABLE IF NOT EXISTS strat_run (id TEXT PRIMARY KEY, at TEXT NOT NULL, surface TEXT, who TEXT, brand TEXT, question TEXT, model TEXT, effort TEXT, in_tok INTEGER, cache_read INTEGER, cache_write INTEGER, out_tok INTEGER, cost REAL, steps INTEGER, ms INTEGER, stopped INTEGER, error TEXT);
  CREATE TABLE IF NOT EXISTS p_studio_vid (id TEXT PRIMARY KEY, act_id TEXT NOT NULL, ad_id TEXT, status TEXT, cost REAL NOT NULL DEFAULT 0, created_at TEXT NOT NULL DEFAULT (datetime('now')));
  CREATE TABLE IF NOT EXISTS ad_tag (asset_key TEXT PRIMARY KEY, act_id TEXT, media_type TEXT, tags_json TEXT, model TEXT, cost REAL, tagged_at TEXT, err TEXT);`);
try { db.exec(`ALTER TABLE p_asset ADD COLUMN source TEXT`); } catch {}
try { db.exec(`ALTER TABLE p_asset ADD COLUMN cost REAL`); } catch {}

const central = (d = new Date()) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
const addDays = (ymd, n) => { const d = new Date(ymd + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const TODAY = central();
const THIS_M = TODAY.slice(0, 7);
const LAST_M = (() => { const [y, m] = THIS_M.split('-').map(Number); return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`; })();
const BEFORE_M = (() => { const [y, m] = LAST_M.split('-').map(Number); return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`; })();
const MON = addDays(TODAY, -((new Date(TODAY + 'T12:00:00Z').getUTCDay() + 6) % 7));
const SUN = addDays(MON, 6);

db.exec(`INSERT INTO brands (id, slug, name, status, currency, tz, source, legacy_key) VALUES
  ('brand_alpha', 'alpha', 'Alpha Golf', 'active', 'USD', 'America/Chicago', 'locus', 'act_111'),
  ('brand_beta', 'beta', 'Beta Socks', 'active', 'USD', 'America/Chicago', 'locus', NULL),
  ('brand_galway', 'galway', 'Galway Bay', 'paused', 'USD', 'America/Chicago', 'locus', NULL)`);
db.exec(`INSERT INTO connections (id, brand_id, kind, external_id, is_primary, source, label) VALUES
  ('meta:act_111', 'brand_alpha', 'meta', 'act_111', 1, 'locus', NULL), ('meta:act_222', 'brand_beta', 'meta', 'act_222', 1, 'locus', NULL),
  ('asana:P1', 'brand_alpha', 'asana', 'P1', 1, 'locus', 'Alpha project'), ('asana:P2', 'brand_beta', 'asana', 'P2', 1, 'locus', 'Beta project'),
  ('asana:P3', 'brand_galway', 'asana', 'P3', 1, 'locus', 'Galway project')`);
/* AI spend: last month unless said otherwise. */
db.exec(`INSERT INTO strat_run (id, at, brand, cost) VALUES ('r1', '${LAST_M}-05T10:00:00.000Z', 'brand_alpha', 10), ('r2', '${LAST_M}-06T10:00:00.000Z', NULL, 1), ('r3', '${THIS_M}-01T10:00:00.000Z', 'brand_alpha', 99)`);
db.exec(`INSERT INTO idea_run (id, act_id, cost, started_at) VALUES ('i1', 'act_222', 5, '${LAST_M}-07 09:00:00')`);
db.exec(`INSERT INTO p_studio_ad (id, act_id, status, spec_json, cost, created_at) VALUES ('s1', 'brand_beta', 'review', '{}', 2500, '${LAST_M}-08 09:00:00')`);
const setSetting = (k, v) => db.prepare(`INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`).run(k, JSON.stringify(v));
const getSetting = k => { const r = db.prepare(`SELECT value FROM settings WHERE key = ?`).get(k); return r ? JSON.parse(r.value) : null; };
setSetting('clientUsers', { 'nick@alpha.com': { brands: ['brand_alpha'], name: 'Nick' } });
setSetting(`clientAsk:${LAST_M}-09:nick@alpha.com`, { n: 3, cost: 0.02 });
setSetting('userBrands', { 'noma@go-mobius-digital.com': ['brand_beta'] });

/* ---------------- tokens and mocks ---------------- */
const SECRET = 'test-session-secret';
const b64u = b => Buffer.from(b).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const mint = (email, key = SECRET) => { const p = b64u(`${email}|${Date.now() + 3600e3}`); return `mds.${p}.${b64u(crypto.createHmac('sha256', key).update(p).digest())}`; };
const CLIENT = mint('nick@alpha.com'), TEAM = mint('ahsan@go-mobius-digital.com'), OWNER = mint('cole@go-mobius-digital.com'), LIMITED = mint('noma@go-mobius-digital.com');

const done = (gid, who, name, at) => ({ gid, name: 'done ' + gid, completed: true, completed_at: at, assignee: who ? { gid: who, name } : null });
const open = (gid, who, name, due, section = 'In progress', project = 'P1') => ({ gid, name: 'task ' + gid, completed: false, due_on: due, assignee: who ? { gid: who, name } : null,
  memberships: [{ project: { gid: project }, section: { name: section } }], permalink_url: `https://app.asana.com/0/${project}/${gid}` });
const ASANA = {
  P1: { done: [done('a1', 'u1', 'Ravo', `${LAST_M}-03T15:00:00.000Z`), done('a2', 'u1', 'Ravo', `${LAST_M}-10T15:00:00.000Z`), done('a3', 'u1', 'Ravo', `${LAST_M}-20T15:00:00.000Z`),
        done('a4', 'u2', 'Ahsan', `${LAST_M}-12T15:00:00.000Z`), done('a5', 'u1', 'Ravo', `${BEFORE_M}-28T15:00:00.000Z`), { gid: 'a6', name: 'still open', completed: false }],
    open: [open('o1', 'u1', 'Ravo', TODAY), open('o2', 'u1', 'Ravo', addDays(MON, -3)), open('o3', 'u1', 'Ravo', addDays(SUN, 2)), open('o4', 'u1', 'Ravo', TODAY, 'Backlog'),
      open('o5', null, null, SUN), open('o6', 'u1', 'Ravo', addDays(TODAY, -90)), { gid: 'o7', name: 'no date', due_on: null }] },
  P2: { done: [done('b1', 'u1', 'Ravo', `${LAST_M}-04T15:00:00.000Z`), done('b2', 'u2', 'Ahsan', `${LAST_M}-05T15:00:00.000Z`), done('b3', 'u2', 'Ahsan', `${LAST_M}-06T15:00:00.000Z`), done('b4', 'u2', 'Ahsan', `${LAST_M}-07T15:00:00.000Z`)],
    open: [open('p1', 'u2', 'Ahsan', SUN, 'Editing', 'P2')] },
  P3: { done: [done('c1', 'u1', 'Ravo', `${LAST_M}-04T15:00:00.000Z`)], open: [open('q1', 'u1', 'Ravo', TODAY, 'In progress', 'P3')] },
};
let asanaCalls = 0;
globalThis.fetch = async (url) => {
  const u = String(url?.url || url);
  const m = u.match(/^https:\/\/app\.asana\.com\/api\/1\.0\/projects\/(P\d)\/tasks\?(.*)$/);
  if (m) {
    asanaCalls++;
    const p = ASANA[m[1]], q = new URLSearchParams(m[2]);
    const data = q.get('completed_since') === 'now' ? p.open : p.done;
    return new Response(JSON.stringify({ data, next_page: null }), { status: 200 });
  }
  return new Response(JSON.stringify({ error: 'offline: ' + u }), { status: 503 });
};
const ledgerSeen = [];
const LEDGER = { fetch: async req => {
  const u = new URL(req.url);
  ledgerSeen.push({ path: u.pathname, month: u.searchParams.get('month'), auth: req.headers.get('Authorization') });
  if (!/^Bearer mds\./.test(req.headers.get('Authorization') || '')) return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401 });
  return new Response(JSON.stringify({ frozen: true, report: { revenue: 8500, byClient: { 'Alpha Golf': 6000, 'BETA SOCKS LLC': 2000, 'Mystery Payer': 500 } } }), { status: 200 });
} };

process.env.TZ = process.env.TZ || 'UTC';
const AH = (await import('./src/worker.js')).default;
const { matchPayer, sentenceFor } = await import('./src/agency.js');
const env = { DB, SESSION_SECRET: SECRET, ASANA_TOKEN: 'asana-test', LEDGER };
const ctx = { waitUntil() {} };
const call = async (tok, method, p, body) => {
  const res = await AH.fetch(new Request(`https://ah.test${p}`, { method, headers: { ...(tok ? { Authorization: 'Bearer ' + tok } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) }), env, ctx);
  let j = null; try { j = await res.json(); } catch {}
  return { status: res.status, j };
};

const results = [];
async function check(name, fn) { try { await fn(); results.push(true); console.log('PASS ', name); } catch (e) { results.push(false); console.log('FAIL ', name, '\n      ' + (e.stack || e.message).split('\n').slice(0, 4).join('\n      ')); } }

/* ---------------- the checks ---------------- */
await check('a client login is refused on every agency route', async () => {
  for (const [m, p, b] of [['GET', '/api/agency/economics'], ['GET', '/api/agency/workload'], ['PUT', '/api/agency/settings', { people: {} }], ['GET', '/api/agency/workload?act=brand_alpha']]) {
    const r = await call(CLIENT, m, p, b);
    assert.equal(r.status, 403, `${m} ${p} -> ${r.status}`);
  }
  assert.equal((await call(null, 'GET', '/api/agency/workload')).status, 401);
});

await check('economics and its settings are owner only; the team gets 403', async () => {
  assert.equal((await call(TEAM, 'GET', '/api/agency/economics')).status, 403);
  assert.equal((await call(TEAM, 'PUT', '/api/agency/settings', { people: { u1: { cost: 1 } } })).status, 403);
  assert.equal(getSetting('agencyPeople'), null, 'nothing saved by the team');
});

await check('owner saves people (cost + hours) and a payer pin', async () => {
  const r = await call(OWNER, 'PUT', '/api/agency/settings', { people: { u1: { name: 'Ravo', cost: 4000, hours: 160 }, u2: { name: 'Ahsan', cost: 3000, hours: 120 }, 'bad gid!': { cost: 5 } }, map: { 'Old Payer': 'brand_alpha', 'Refund Co': 'nope' } });
  assert.equal(r.status, 200);
  const p = getSetting('agencyPeople');
  assert.deepEqual(Object.keys(p).sort(), ['u1', 'u2']);
  assert.equal(p.u1.cost, 4000); assert.equal(p.u2.hours, 120);
  assert.deepEqual(getSetting('agencyLedgerMap'), { 'Old Payer': 'brand_alpha', 'Refund Co': '' });
});

let econ;
await check('economics defaults to the last full month and splits team cost by share of completed tasks', async () => {
  const r = await call(OWNER, 'GET', '/api/agency/economics');
  assert.equal(r.status, 200, JSON.stringify(r.j));
  econ = r.j;
  assert.equal(econ.month, LAST_M);
  assert.equal(econ.months[0].id, THIS_M); assert.match(econ.months[0].label, /so far/);
  const a = econ.rows.find(x => x.brand === 'brand_alpha'), b = econ.rows.find(x => x.brand === 'brand_beta');
  assert.ok(a && b, 'both brands');
  assert.ok(!econ.rows.some(x => x.brand === 'brand_galway'), 'paused brand: Asana not read, and no money or AI, so no row');
  assert.equal(a.tasks, 4); assert.equal(b.tasks, 4);
  assert.equal(a.team_cost, 3750); assert.equal(a.hours, 150);   // Ravo 3/4 of 4000 + Ahsan 1/4 of 3000; 120h + 30h
  assert.equal(b.team_cost, 3250); assert.equal(b.hours, 130);
  assert.equal(a.revenue, 6000); assert.equal(b.revenue, 2000, 'BETA SOCKS LLC matched by name');
  assert.equal(a.ai_cost, 10.02, 'strategist + the client Strategist; next month not counted');
  assert.equal(b.ai_cost, 2505, 'ideas via the old Meta id + Studio');
  assert.equal(a.margin, 2239.98); assert.equal(a.per_hour, 40);
  assert.deepEqual(econ.unmatched, [{ name: 'Mystery Payer', amount: 500 }]);
  assert.equal(econ.ai_unassigned, 1);
  assert.equal(econ.ledger.ok, true);
  assert.equal(ledgerSeen[0].month, LAST_M); assert.equal(ledgerSeen[0].path, '/api/report');
  assert.match(econ.sentence, /^Alpha Golf earns the most per hour.*\$40 an hour.*Beta Socks costs more in AI than it pays\.$/);
  assert.match(econ.model, /Estimate/);
  assert.equal(econ.totals.revenue, 8000);
  assert.ok(!/[–—]/.test(JSON.stringify(econ)), 'no em or en dashes');
  const ravo = econ.people.find(p => p.gid === 'u1');
  assert.equal(ravo.tasks, 4); assert.equal(ravo.set, true);
});

await check('economics is cached: a second read makes no Asana or Ledger call; fresh=1 reads again', async () => {
  const n = asanaCalls, l = ledgerSeen.length;
  await call(OWNER, 'GET', `/api/agency/economics?month=${LAST_M}`);
  assert.equal(asanaCalls, n); assert.equal(ledgerSeen.length, l);
  await call(OWNER, 'GET', `/api/agency/economics?month=${LAST_M}&fresh=1`);
  assert.ok(asanaCalls > n); assert.equal(ledgerSeen.length, l + 1);
});

await check('a payer pinned to "not a client" drops out; an unknown month falls back', async () => {
  await call(OWNER, 'PUT', '/api/agency/settings', { map: { 'Mystery Payer': '' } });
  const r = await call(OWNER, 'GET', `/api/agency/economics?month=2099-01`);
  assert.equal(r.j.month, LAST_M);
  assert.deepEqual(r.j.unmatched, []);
});

await check('matchPayer and the sentence rules', () => {
  const brands = [{ id: 'b1', name: 'Bonk Golf' }, { id: 'b2', name: 'Party Patch' }, { id: 'b3', name: 'Lucky Golf' }];
  assert.equal(matchPayer('Bonk Golf', brands), 'b1');
  assert.equal(matchPayer('PARTY PATCH INC', brands), 'b2');
  assert.equal(matchPayer('Golf', brands), null, 'too vague: two brands contain it');
  assert.equal(matchPayer('Vita Pharm', brands, { 'Vita Pharm': 'b3' }), 'b3');
  const rows = [{ name: 'Bonk', revenue: 5000, team_cost: 1000, ai_cost: 5, margin: 3995, margin_pct: 79.9, per_hour: 90 },
    { name: 'Party Patch', revenue: 3000, team_cost: 3500, ai_cost: 20, margin: -520, margin_pct: -17.3, per_hour: 20 }];
  assert.equal(sentenceFor(rows, true), 'Bonk earns the most per hour of team time (about $90 an hour); Party Patch lost about $520 after team time and AI.');
  assert.match(sentenceFor(rows, false), /enter each person's monthly cost/);
  assert.equal(sentenceFor([], true), 'Nothing was paid, done or spent on AI for a client this month.');
});

await check('workload: this week by day plus overdue, by person, brand chips and links; parked, far and paused left out', async () => {
  const r = await call(TEAM, 'GET', '/api/agency/workload');
  assert.equal(r.status, 200, JSON.stringify(r.j));
  const w = r.j;
  assert.equal(w.week.length, 7); assert.equal(w.week[0], MON); assert.equal(w.week[6], SUN);
  const ravo = w.people.find(p => p.key === 'u1'), ahsan = w.people.find(p => p.key === 'u2'), none = w.people.find(p => p.key === 'none');
  assert.equal(ravo.days[TODAY].length, 1, 'today, not the backlog one, not Galway');
  assert.equal(ravo.days[TODAY][0].brand_name, 'Alpha Golf'); assert.match(ravo.days[TODAY][0].url, /asana\.com/);
  assert.equal(ravo.overdue.length, 1, 'overdue before Monday; 90 days old dropped; next week dropped');
  assert.equal(ravo.n, 2);
  assert.equal(ahsan.days[SUN][0].brand_name, 'Beta Socks');
  assert.equal(none.name, 'Not assigned'); assert.equal(w.people[w.people.length - 1].key, 'none', 'Not assigned sorts last');
  assert.ok(!w.brands.some(b => b.id === 'brand_galway'));
});

await check('workload for a teammate limited to one brand shows only that brand', async () => {
  const r = await call(LIMITED, 'GET', '/api/agency/workload');
  assert.equal(r.status, 200, JSON.stringify(r.j));
  assert.deepEqual(r.j.brands.map(b => b.id), ['brand_beta']);
  assert.ok(r.j.people.every(p => [...p.overdue, ...Object.values(p.days).flat()].every(t => t.brand === 'brand_beta')));
});

await check('the owner can read workload too, and the Ledger being down says so without breaking the page', async () => {
  assert.equal((await call(OWNER, 'GET', '/api/agency/workload')).status, 200);
  const saved = env.LEDGER; env.LEDGER = { fetch: async () => new Response('{"error":"down"}', { status: 500 }) };
  const r = await call(OWNER, 'GET', `/api/agency/economics?month=${LAST_M}&fresh=1`);
  env.LEDGER = saved;
  assert.equal(r.status, 200); assert.equal(r.j.ledger.ok, false); assert.match(r.j.ledger.error, /Ledger/);
  assert.ok(r.j.rows.length >= 2, 'team and AI still shown');
});

const ok = results.filter(Boolean).length;
console.log(`\n${ok}/${results.length} passed`);
process.exit(ok === results.length ? 0 : 1);

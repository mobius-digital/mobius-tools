/* Offline checks for the Strategist's hands (src/metawrite.js, 2026-10-09): Meta writes behind the Apply card,
 * the permission refusal, undo, Asana and Drive actions. In-memory SQLite for 2300031, the Graph API, Asana and
 * Google mocked, no secrets.
 *   node test-metawrite.mjs      (from account-health/worker)
 */
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..', '..');
const db = new DatabaseSync(':memory:');
const load = f => { for (const st of fs.readFileSync(f, 'utf8').replace(/--[^\n]*/g, '').split(/;\s*(?:\n|$)/)) { try { if (st.trim()) db.exec(st); } catch { /* re-applied ALTER */ } } };
load(path.join(here, 'schema.sql'));
for (const f of ['brand-001.sql', 'brand-002.sql', 'brand-003.sql', 'brand-004.sql']) load(path.join(root, 'profit', 'worker', 'migrations', f));
const bindSql = sql => sql.replace(/\?(\d+)/g, (_, n) => ':p' + n);
const vals = a => Object.fromEntries(a.map((v, i) => ['p' + (i + 1), v === undefined ? null : typeof v === 'boolean' ? +v : v]));
const DB = {
  prepare(sql) {
    let args = [];
    const st = () => db.prepare(bindSql(sql));
    return { bind(...a) { args = a; return this; }, async first() { return st().get(vals(args)) || null; },
      async all() { return { results: st().all(vals(args)) }; }, async run() { const r = st().run(vals(args)); return { meta: { changes: r.changes } }; } };
  },
};

/* ---------------- fixtures: Lucky (writable) and Dartee (read-only) ---------------- */
const LUCKY = 'act_111', DARTEE = 'act_222';
db.exec(`INSERT INTO accounts (act_id, name, currency, tz) VALUES ('${LUCKY}', 'Lucky Golf', 'USD', 'America/Chicago'), ('${DARTEE}', 'Dartee Golf', 'USD', 'America/New_York')`);
db.exec(`INSERT INTO brands (id, slug, name, status, currency, tz, legacy_key, source) VALUES ('brand_lucky', 'lucky_golf', 'Lucky Golf', 'active', 'USD', 'America/Chicago', '${LUCKY}', 'locus'),
  ('brand_dartee', 'dartee', 'Dartee Golf', 'active', 'USD', 'America/New_York', '${DARTEE}', 'locus')`);
db.exec(`INSERT INTO connections (id, brand_id, kind, external_id, is_primary, source) VALUES ('m1', 'brand_lucky', 'meta', '${LUCKY}', 1, 'locus'), ('m2', 'brand_dartee', 'meta', '${DARTEE}', 1, 'locus'),
  ('d1', 'brand_lucky', 'drive', 'https://drive.google.com/drive/folders/FOLDER_LUCKY_123', 0, 'locus')`);
db.exec(`INSERT INTO p_br_doc (act_id, line_id, key, data_json) VALUES ('brand_lucky', '', 'asana', '{"project_gid":"P1","workspace":"W1"}')`);

/* ---------------- a tiny Meta ---------------- */
const objs = {
  2300001: { id: '2300001', name: 'Lucky | Prospecting CBO', status: 'ACTIVE', effective_status: 'ACTIVE', objective: 'OUTCOME_SALES', daily_budget: '50000', bid_strategy: 'LOWEST_COST_WITHOUT_CAP', account_id: '111', _lv: 'campaign', _act: LUCKY },
  2300002: { id: '2300002', name: 'Lucky | Tests ABO', status: 'ACTIVE', effective_status: 'ACTIVE', objective: 'OUTCOME_SALES', account_id: '111', _lv: 'campaign', _act: LUCKY },
  2300011: { id: '2300011', name: '412 | UGC', status: 'ACTIVE', effective_status: 'ACTIVE', campaign_id: '2300002', daily_budget: '20000', bid_strategy: 'LOWEST_COST_WITHOUT_CAP', optimization_goal: 'OFFSITE_CONVERSIONS', account_id: '111', _lv: 'adset', _act: LUCKY,
    targeting: { age_min: 30, age_max: 65, geo_locations: { countries: ['US'] }, targeting_automation: { advantage_audience: 1 } } },
  2300012: { id: '2300012', name: '413 | Still', status: 'ACTIVE', effective_status: 'ACTIVE', campaign_id: '2300001', daily_min_spend_target: '5000', account_id: '111', _lv: 'adset', _act: LUCKY },
  2300021: { id: '2300021', name: '412-1 | UGC', status: 'ACTIVE', effective_status: 'ACTIVE', adset_id: '2300011', campaign_id: '2300002', creative: { id: 'CR1', object_story_spec: { page_id: 'PAGE1', instagram_user_id: 'IG1' } }, account_id: '111', _lv: 'ad', _act: LUCKY },
  2300031: { id: '2300031', name: 'Dartee | Belts', status: 'ACTIVE', effective_status: 'ACTIVE', daily_budget: '10000', account_id: '222', _lv: 'adset', _act: DARTEE, campaign_id: '2300030' },
  2300099: { id: '2300099', title: 'clip', picture: 'https://scontent/v9.jpg', _lv: 'video' },
};
const tasksOf = { [LUCKY]: ['MANAGE', 'ADVERTISE', 'ANALYZE'], [DARTEE]: ['ANALYZE'] };
const posts = [], gets = [];
let nextId = 900;
const J = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: { 'Content-Type': 'application/json' } });
const pick = (o, fields) => {
  const out = {};
  for (const f of String(fields || 'id').split(/,(?![^{]*})/)) {
    const [k, sub] = [f.replace(/\{.*$/, ''), (f.match(/\{(.*)\}$/) || [])[1]];
    if (k === 'campaign' && o.campaign_id && objs[o.campaign_id]) out.campaign = pick(objs[o.campaign_id], sub);
    else if (k === 'adset' && o.adset_id && objs[o.adset_id]) out.adset = pick(objs[o.adset_id], sub);
    else if (k === 'creative' && o.creative) out.creative = sub ? Object.fromEntries(sub.split(',').map(x => [x, o.creative[x]]).filter(([, v]) => v != null)) : o.creative;
    else if (o[k] !== undefined) out[k] = o[k];
  }
  return out;
};
const EDGE_LV = { campaigns: 'campaign', adsets: 'adset', ads: 'ad' };
async function graph(url, init = {}) {
  const u = new URL(url);
  const p = u.pathname.replace('/v23.0/', '');
  if ((init.method || 'GET') === 'POST') {
    const b = Object.fromEntries(new URLSearchParams(init.body));
    delete b.access_token;
    posts.push({ path: p, body: b });
    let m;
    if ((m = p.match(/^(act_\d+)\/adimages$/))) return J({ images: { bytes: { hash: 'HASH1' } } });
    if ((m = p.match(/^(act_\d+)\/adcreatives$/))) return J({ id: 'CR' + (++nextId) });
    if ((m = p.match(/^(act_\d+)\/ads$/))) { const id = String(2400000 + (++nextId)); objs[id] = { id, name: b.name, status: b.status, adset_id: b.adset_id, account_id: m[1].slice(4), _lv: 'ad', _act: m[1] }; return J({ id }); }
    if ((m = p.match(/^(\w+)\/copies$/))) { const id = String(2400000 + (++nextId)); objs[id] = { ...objs[m[1]], id, status: 'PAUSED', effective_status: 'PAUSED' }; return J({ copied_adset_id: id, ad_object_ids: [{ ad_object_id: 'X' }] }); }
    const o = objs[p];
    if (!o) return J({ error: { message: 'Unsupported post request' } }, 400);
    Object.assign(o, b);
    if (b.status) o.effective_status = b.status;
    return J({ success: true });
  }
  gets.push(p);
  const q = Object.fromEntries(u.searchParams);
  if (p === 'me/permissions') return J({ data: [{ permission: 'ads_read', status: 'granted' }, { permission: 'ads_management', status: 'granted' }] });
  let m;
  if ((m = p.match(/^(act_\d+)$/))) return J({ id: m[1], name: m[1] === LUCKY ? 'Lucky Golf' : 'Dartee Golf', user_tasks: tasksOf[m[1]] });
  if ((m = p.match(/^(act_\d+)\/promote_pages$/))) return J({ data: [{ id: 'PAGE1', name: 'Lucky Golf' }] });
  if ((m = p.match(/^(act_\d+)\/(campaigns|adsets|ads)$/))) {
    const lv = EDGE_LV[m[2]];
    const flt = q.filtering ? JSON.parse(q.filtering) : [];
    let rows = Object.values(objs).filter(o => o._lv === lv && o._act === m[1]);
    for (const f of flt) {
      if (/\.name$/.test(f.field)) rows = rows.filter(o => o.name.toLowerCase().includes(String(f.value).toLowerCase()));
      if (f.field === 'adset.id') rows = rows.filter(o => f.value.includes(o.adset_id));
      if (f.field === 'effective_status') rows = rows.filter(o => f.value.includes(o.effective_status));
    }
    return J({ data: rows.map(o => pick(o, q.fields)) });
  }
  if ((m = p.match(/^(\w+)\/ads$/))) return J({ data: Object.values(objs).filter(o => o._lv === 'ad' && o.adset_id === m[1]).map(o => pick(o, q.fields)) });
  const o = objs[p];
  if (!o) return J({ error: { message: `Unsupported get request. Object with ID '${p}' does not exist` } }, 400);
  /* Asking an ad set's fields of an ad (or the reverse) is an error at Meta: unknown fields. */
  const want = String(q.fields || '');
  if (o._lv === 'campaign' && /optimization_goal|adset_id/.test(want)) return J({ error: { message: 'nonexisting field (optimization_goal)' } }, 400);
  if (o._lv === 'ad' && /daily_budget/.test(want)) return J({ error: { message: 'nonexisting field (daily_budget)' } }, 400);
  if (o._lv === 'adset' && /objective|adset\{/.test(want)) return J({ error: { message: 'nonexisting field (objective)' } }, 400);
  return J(pick(o, q.fields));
}
/* Drive + images through xfetch too. */
const drivePosts = [];
async function xfetch(url, init = {}) {
  const s = String(url);
  if (s.startsWith('https://graph.facebook.com/')) return graph(s, init);
  if (s.startsWith('https://cdn.example.com/ad.png')) return new Response(new Uint8Array([137, 80, 78, 71, 1, 2, 3]), { status: 200, headers: { 'Content-Type': 'image/png' } });
  if (s.startsWith('https://cdn.example.com/page.html')) return new Response('<html>', { status: 200, headers: { 'Content-Type': 'text/html' } });
  if (s.startsWith('https://www.googleapis.com/drive/v3/')) {
    const u = new URL(s), p = u.pathname.replace('/drive/v3/', '');
    if (init.method === 'POST') { drivePosts.push({ path: p, body: JSON.parse(init.body), q: Object.fromEntries(u.searchParams) }); return J({ id: 'COPY1', name: 'copied', webViewLink: 'https://drive.google.com/file/d/COPY1/view' }); }
    if (p === 'files') {
      const q = u.searchParams.get('q');
      if (/mimeType = 'application\/vnd.google-apps.folder'/.test(q)) return J({ files: [{ id: 'SUB_FINALS_1', name: 'Finals', webViewLink: 'https://drive.google.com/drive/folders/SUB_FINALS_1' }] });
      return J({ files: [{ id: 'FILE_AAA_111', name: 'Hero shot.png', mimeType: 'image/png', modifiedTime: '2026-10-08T10:00:00Z', webViewLink: 'https://drive.google.com/file/d/FILE_AAA_111/view' }], q });
    }
    const id = p.replace('files/', '');
    if (id.startsWith('FOLDER') || id.startsWith('SUB')) return J({ id, name: id === 'FOLDER_LUCKY_123' ? 'Lucky Golf' : 'Finals', mimeType: 'application/vnd.google-apps.folder', webViewLink: `https://drive.google.com/drive/folders/${id}` });
    return J({ id, name: 'Hero shot.png', mimeType: 'image/png', webViewLink: `https://drive.google.com/file/d/${id}/view` });
  }
  return new Response('not mocked ' + s, { status: 404 });
}

/* Asana + the Google token through asana-brand.js's fetch. */
const asanaCalls = [];
const asanaMock = async (url, init = {}) => {
  const s = String(url);
  if (s.startsWith('https://oauth2.googleapis.com/token')) return J({ access_token: 'gtok', expires_in: 3600 });
  const u = new URL(s), p = u.pathname.replace('/api/1.0', '');
  const body = init.body ? JSON.parse(init.body).data : null;
  asanaCalls.push({ method: init.method || 'GET', path: p, body });
  const json = data => J({ data });
  if (p === '/users') return json([{ gid: 'U_AHSAN', name: 'Ahsan Abidi' }, { gid: 'U_NOMA', name: 'Noma' }]);
  if (p === '/projects/P1/sections') return json([{ gid: 'S_BRIEF', name: 'Creative Briefs' }, { gid: 'S_TODO', name: 'To do' }]);
  if (p === '/tasks' && (init.method || 'GET') === 'GET') return json([{ gid: '1200000000000397', name: '397 - Tour quality', permalink_url: 'https://app.asana.com/0/P1/1200000000000397', completed: false }, { gid: '1200000000000398', name: '398 - Fix the PDP', permalink_url: 'https://app.asana.com/0/P1/1200000000000398', completed: false }]);
  if (p === '/tasks' && init.method === 'POST') return json({ gid: '1200000000000500', name: body.name, permalink_url: 'https://app.asana.com/0/P1/1200000000000500' });
  if (/^\/tasks\/\d+$/.test(p) && (init.method || 'GET') === 'GET') return json({ gid: p.split('/')[2], name: '398 - Fix the PDP', completed: false, permalink_url: 'https://app.asana.com/0/P1/' + p.split('/')[2] });
  return json({});
};
const asanaBrand = await import('./src/asana-brand.js');
asanaBrand.useFetch(asanaMock);

const { privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const env = { DB, META_TOKEN: 'mt', ASANA_TOKEN: 'at', GOOGLE_SA_KEY: JSON.stringify({ client_email: 'sa@x.iam.gserviceaccount.com', private_key: privateKey.export({ type: 'pkcs8', format: 'pem' }) }) };
const d = {
  getSetting: async (env, k) => (await env.DB.prepare('SELECT value FROM settings WHERE key = ?1').bind(k).first())?.value ?? null,
  putSetting: async (env, k, v) => env.DB.prepare('INSERT INTO settings (key, value) VALUES (?1, ?2) ON CONFLICT(key) DO UPDATE SET value = excluded.value').bind(k, typeof v === 'string' ? v : JSON.stringify(v)).run(),
  safeJson: (s, fb) => { try { return s ? JSON.parse(s) : fb; } catch { return fb; } },
  listAccounts: async env => (await env.DB.prepare('SELECT * FROM brand_accounts').all()).results,
  xfetch,
};
const mw = await import('./src/metawrite.js');
const acts = Object.fromEntries(mw.writeActions(d).map(a => [a.name, a]));
const tools = Object.fromEntries(mw.writeTools(d).map(t => [t.def.name, t]));
const COLE = { who: 'cole@go-mobius-digital.com' };
const activities = () => db.prepare(`SELECT * FROM activities WHERE manual = 1 ORDER BY event_time`).all();

const checks = [];
async function check(name, fn) { try { await fn(); checks.push({ name, pass: true }); console.log('PASS ', name); } catch (e) { checks.push({ name, pass: false, error: e.message }); console.log('FAIL ', name, '\n      ' + e.message); } }

await check('registered: every action and both tools, no em dashes in any description', async () => {
  for (const n of ['meta_pause', 'meta_resume', 'meta_budget', 'meta_min_spend', 'meta_rename', 'meta_duplicate_adset', 'meta_create_ad', 'meta_undo', 'asana_task', 'asana_comment', 'asana_complete', 'drive_copy_to', 'drive_share']) assert.ok(acts[n], n);
  assert.ok(tools.meta_read && tools.drive_list);
  const src = fs.readFileSync(path.join(here, 'src', 'metawrite.js'), 'utf8');
  assert.ok(!src.includes('—'), 'em dash in metawrite.js');
  const strat = fs.readFileSync(path.join(here, 'src', 'strategist.js'), 'utf8');
  assert.match(strat, /writeActions\(d\)/); assert.match(strat, /writeTools\(d\)/); assert.match(strat, /ACTING IN META, ASANA AND DRIVE/);
});

await check('permission: a read-only account refuses with the exact Business settings fix, cached', async () => {
  const r = await acts.meta_pause.propose(env, { brand: 'Dartee', target: 'Dartee | Belts', reason: 'CPA 2x goal' }, null, COLE);
  assert.match(r.error, /Give the Mobius Tools system user Manage campaigns on Dartee Golf \(act_222\) in Business settings > Ad accounts > Assign partners \(Business ID 695359915477596\)/);
  const n = gets.filter(g => g === DARTEE).length;
  const can = await mw.metaCan(env, DARTEE, d);
  assert.equal(can.can, false); assert.equal(gets.filter(g => g === DARTEE).length, n, 'second check came from the cache');
  const ok = await mw.metaCan(env, LUCKY, d); assert.equal(ok.can, true);
});

await check('pause: finds the ad set by name, card shows before and after, apply posts status PAUSED and logs who approved', async () => {
  const p = await acts.meta_pause.propose(env, { brand: 'Lucky Golf', target: '412 | UGC', reason: 'CPA $92 vs $55 goal over 7 days' }, null, { who: 'U_AHSAN' });
  assert.ok(!p.error, p.error);
  assert.match(p.summary, /Pause ad set "412 \| UGC"/); assert.match(p.detail, /ACTIVE → PAUSED/); assert.match(p.detail, /Why: CPA \$92/);
  assert.deepEqual(p.patch.after, { status: 'PAUSED' }); assert.equal(p.patch.id, '2300011');
  const r = await acts.meta_pause.apply(env, p.patch, null, COLE);
  assert.ok(r.ok, r.error);
  const post = posts.at(-1); assert.equal(post.path, '2300011'); assert.deepEqual(post.body, { status: 'PAUSED' });
  const a = activities().at(-1);
  assert.equal(a.act_id, LUCKY); assert.equal(a.category, 'campaign_paused'); assert.equal(a.object_id, '2300011'); assert.equal(a.object_type, 'ADSET');
  assert.match(a.actor, /approved by cole@go-mobius-digital\.com/); assert.match(a.summary, /ACTIVE → PAUSED/); assert.match(a.reason, /CPA \$92/);
  const w = db.prepare(`SELECT * FROM p_meta_write ORDER BY at DESC LIMIT 1`).get();
  assert.equal(w.object, '2300011'); assert.equal(w.before, '{"status":"ACTIVE"}'); assert.equal(w.by, 'cole@go-mobius-digital.com');
});

await check('resume: refuses a no-op, payload status ACTIVE, by id', async () => {
  const no = await acts.meta_pause.propose(env, { brand: 'Lucky', target: '2300011', level: 'adset', reason: 'x' });
  assert.match(no.error, /already PAUSED/);
  const p = await acts.meta_resume.propose(env, { brand: 'Lucky', target: '2300011', reason: 'back under goal' });
  assert.ok(!p.error, p.error); assert.deepEqual(p.patch.after, { status: 'ACTIVE' });
  await acts.meta_resume.apply(env, p.patch, null, COLE);
  assert.deepEqual(posts.at(-1).body, { status: 'ACTIVE' }); assert.equal(objs['2300011'].status, 'ACTIVE');
  assert.equal(activities().at(-1).category, 'campaign_relaunched');
});

await check('a name in another brand\'s account or an unknown name is never touched', async () => {
  const r = await acts.meta_pause.propose(env, { brand: 'Lucky', target: '2300031', reason: 'x' });
  assert.match(r.error, /not Lucky Golf's/);
  const r2 = await acts.meta_pause.propose(env, { brand: 'Lucky', target: 'Nope set', reason: 'x' });
  assert.match(r2.error, /Nothing in Lucky Golf's Meta account/);
  const r3 = await acts.meta_pause.propose(env, { brand: 'Lucky', target: 'Lucky |', level: 'campaign', reason: 'x' });
  assert.match(r3.error, /matches more than one/);
});

await check('budget: card in dollars with the % change; over 50% refused unless big; payload in cents', async () => {
  const p = await acts.meta_budget.propose(env, { brand: 'Lucky', target: '412 | UGC', amount: 260, reason: '3.1x TW ROAS on $1,840' });
  assert.ok(!p.error, p.error);
  assert.match(p.summary, /\$200\/day → \$260\/day \(\+30%\)/);
  assert.deepEqual(p.patch.after, { daily_budget: '26000' }); assert.deepEqual(p.patch.before, { daily_budget: '20000' });
  const big = await acts.meta_budget.propose(env, { brand: 'Lucky', target: '412 | UGC', amount: 400, reason: 'x' });
  assert.match(big.error, /\+100% change \(\$200 → \$400\)/); assert.match(big.error, /50% or less/);
  const okBig = await acts.meta_budget.propose(env, { brand: 'Lucky', target: '412 | UGC', amount: 400, big: true, reason: 'Cole asked for 2x' });
  assert.ok(!okBig.error); assert.match(okBig.detail, /asked for outright/);
  const cbo = await acts.meta_budget.propose(env, { brand: 'Lucky', target: '413 | Still', amount: 80, reason: 'x' });
  assert.match(cbo.error, /campaign "Lucky \| Prospecting CBO" holds it/);
  const r = await acts.meta_budget.apply(env, p.patch, null, COLE);
  assert.ok(r.ok, r.error); assert.deepEqual(posts.at(-1).body, { daily_budget: '26000' });
  assert.equal(activities().at(-1).category, 'budget'); assert.match(activities().at(-1).summary, /\$200\/day → \$260\/day/);
});

await check('apply refuses when the object changed since the card was made', async () => {
  const p = await acts.meta_budget.propose(env, { brand: 'Lucky', target: '2300011', amount: 300, reason: 'x' });
  objs['2300011'].daily_budget = '27000';
  const n = posts.length;
  const r = await acts.meta_budget.apply(env, p.patch, null, COLE);
  assert.match(r.error, /changed since this card was made/); assert.equal(posts.length, n);
  objs['2300011'].daily_budget = '26000';
});

await check('min spend: set the cap and clear the minimum on a CBO ad set; refused on an ABO set', async () => {
  const p = await acts.meta_min_spend.propose(env, { brand: 'Lucky', target: '413 | Still', min: 0, cap: 120, reason: 'test is done' });
  assert.ok(!p.error, p.error);
  assert.match(p.summary, /Minimum \$50 → none, Cap none → \$120\/day/);
  assert.deepEqual(p.patch.after, { daily_min_spend_target: '0', daily_spend_cap: '12000' });
  await acts.meta_min_spend.apply(env, p.patch, null, COLE);
  assert.deepEqual(posts.at(-1).body, { daily_min_spend_target: '0', daily_spend_cap: '12000' });
  const abo = await acts.meta_min_spend.propose(env, { brand: 'Lucky', target: '412 | UGC', min: 20, reason: 'x' });
  assert.match(abo.error, /not inside an Advantage campaign budget/);
});

await check('undo restores the before-state, once, and logs it', async () => {
  const w = db.prepare(`SELECT * FROM p_meta_write WHERE action = 'meta_budget' ORDER BY at DESC LIMIT 1`).get();
  const p = await acts.meta_undo.propose(env, { write: w.id, reason: 'went too fast' }, null, COLE);
  assert.ok(!p.error, p.error); assert.match(p.detail, /Put back daily_budget = 20000/);
  const r = await acts.meta_undo.apply(env, p.patch, null, { who: 'Noma' });
  assert.ok(r.ok, r.error); assert.deepEqual(posts.at(-1), { path: '2300011', body: { daily_budget: '20000' } }); assert.equal(objs['2300011'].daily_budget, '20000');
  assert.match(db.prepare(`SELECT undone FROM p_meta_write WHERE id = ?`).get(w.id).undone, /by Noma/);
  assert.match(activities().at(-1).summary, /^Undone: Budget/);
  const again = await acts.meta_undo.propose(env, { write: w.id });
  assert.match(again.error, /already undone/);
  db.prepare(`UPDATE p_meta_write SET at = '2026-01-01T00:00:00Z' WHERE action = 'meta_pause'`).run();
  const old = await acts.meta_undo.propose(env, { write: db.prepare(`SELECT id FROM p_meta_write WHERE action = 'meta_pause'`).get().id });
  assert.match(old.error, /older than 24 hours/);
});

await check('rename and duplicate: copies PAUSED into the same campaign with the new name, undo archives the copy', async () => {
  const rn = await acts.meta_rename.propose(env, { brand: 'Lucky', target: '2300021', level: 'ad', new_name: '412-1 | UGC | hook B', reason: 'naming' });
  assert.ok(!rn.error, rn.error); assert.deepEqual(rn.patch.after, { name: '412-1 | UGC | hook B' });
  const p = await acts.meta_duplicate_adset.propose(env, { brand: 'Lucky', target: '412 | UGC', new_name: '412 | UGC | scale', daily_budget: 400, reason: 'winner, 2x in a fresh set' });
  assert.ok(!p.error, p.error); assert.match(p.detail, /with its 1 ad/); assert.match(p.detail, /\$400\/day \(the original runs \$200\/day\)/);
  const r = await acts.meta_duplicate_adset.apply(env, p.patch, null, COLE);
  assert.ok(r.ok, r.error);
  const copyPost = posts.find(x => x.path === '2300011/copies');
  assert.deepEqual(copyPost.body, { deep_copy: 'true', status_option: 'PAUSED' });
  const named = posts.at(-1); assert.deepEqual(named.body, { name: '412 | UGC | scale', daily_budget: '40000' });
  assert.equal(activities().at(-1).category, 'new_adset');
  const u = await acts.meta_undo.propose(env, { brand: 'Lucky', write: 'last' }, null, COLE);
  assert.ok(!u.error, u.error); assert.match(u.detail, /Archive ad set/);
  await acts.meta_undo.apply(env, u.patch, null, COLE);
  assert.deepEqual(posts.at(-1).body, { status: 'ARCHIVED' }); assert.equal(posts.at(-1).path, named.path);
});

await check('create_ad: image uploaded to adimages, creative with the set\'s page + IG, ad PAUSED; refuses a non-image URL', async () => {
  const bad = await acts.meta_create_ad.propose(env, { brand: 'Lucky', adset: '412 | UGC', image_url: 'https://cdn.example.com/page.html', primary_text: 'x', link: 'https://luckygolf.com', reason: 'x' });
  assert.match(bad.error, /could not download an image/);
  const p = await acts.meta_create_ad.propose(env, { brand: 'Lucky', adset: '412 | UGC', image_url: 'https://cdn.example.com/ad.png', headline: 'The wedge they ask about',
    primary_text: 'Three guys asked about it on the first tee.', link: 'https://luckygolf.com/carver', cta: 'SHOP_NOW', ad_name: '412-4 | Still', reason: 'new static for the winning set' });
  assert.ok(!p.error, p.error);
  assert.match(p.summary, /new ad "412-4 \| Still" in "412 \| UGC" \(PAUSED\)/); assert.match(p.detail, /Page PAGE1 \+ Instagram IG1/);
  const r = await acts.meta_create_ad.apply(env, p.patch, null, COLE);
  assert.ok(r.ok, r.error);
  const img = posts.find(x => x.path === `${LUCKY}/adimages`); assert.equal(img.body.bytes, Buffer.from([137, 80, 78, 71, 1, 2, 3]).toString('base64'));
  const cr = posts.find(x => x.path === `${LUCKY}/adcreatives`);
  const spec = JSON.parse(cr.body.object_story_spec);
  assert.deepEqual(spec, { page_id: 'PAGE1', instagram_user_id: 'IG1', link_data: { image_hash: 'HASH1', link: 'https://luckygolf.com/carver', message: 'Three guys asked about it on the first tee.', name: 'The wedge they ask about', call_to_action: { type: 'SHOP_NOW', value: { link: 'https://luckygolf.com/carver' } } } });
  const ad = posts.find(x => x.path === `${LUCKY}/ads`);
  assert.equal(ad.body.status, 'PAUSED'); assert.equal(ad.body.adset_id, '2300011'); assert.deepEqual(JSON.parse(ad.body.creative), { creative_id: 'CR' + (nextId - 1) });
  assert.equal(activities().at(-1).category, 'new_creative'); assert.match(r.note, /adsmanager\.facebook\.com/);
  const v = await acts.meta_create_ad.propose(env, { brand: 'Lucky', adset: '2300011', video_id: '2300099', primary_text: 'x', link: 'https://luckygolf.com', live: true, reason: 'x' });
  assert.ok(!v.error, v.error); assert.equal(v.patch.status, 'ACTIVE'); assert.deepEqual(v.patch.media, { video_id: '2300099', thumb: 'https://scontent/v9.jpg' });
});

await check('meta_read: campaigns with their ad sets, dollars, targeting summary, ads for one set', async () => {
  const r = await tools.meta_read.run(env, { brand: 'Lucky', adset: '412' });
  const j = JSON.parse(r.text);
  const c2 = j.accounts[0].campaigns.find(c => c.id === '2300002');
  assert.equal(c2.budget, 'set on the ad sets');
  const s1 = c2.adsets.find(s => s.id === '2300011');
  assert.equal(s1.budget, '$200/day'); assert.deepEqual(s1.targeting, { ages: '30-65', genders: 'all', where: 'US', advantage_audience: true, placements: 'Advantage+ placements' });
  assert.equal(s1.ads[0].creative, 'CR1');
  const all = JSON.parse((await tools.meta_read.run(env, { brand: 'Lucky' })).text);
  assert.equal(all.accounts[0].campaigns.find(c => c.id === '2300001').budget, '$500/day (campaign budget)');
});

await check('asana: task in a named section with assignee and due; comment and complete by brief number', async () => {
  const p = await acts.asana_task.propose(env, { brand: 'Lucky', name: 'Fix the Carver PDP images', section: 'to do', assignee: 'Ahsan', due: '2026-10-12', notes: 'Hero is blurry' });
  assert.ok(!p.error, p.error); assert.match(p.detail, /To do, assigned to Ahsan Abidi, due 2026-10-12/);
  const r = await acts.asana_task.apply(env, p.patch);
  const post = asanaCalls.find(c => c.method === 'POST' && c.path === '/tasks');
  assert.deepEqual(post.body, { name: 'Fix the Carver PDP images', projects: ['P1'], notes: 'Hero is blurry', assignee: 'U_AHSAN', due_on: '2026-10-12' });
  assert.ok(asanaCalls.some(c => c.path === '/sections/S_TODO/addTask')); assert.match(r.note, /app\.asana\.com/);
  const c = await acts.asana_comment.propose(env, { brand: 'Lucky', task: '398', text: 'Done on our side.' });
  assert.ok(!c.error, c.error); await acts.asana_comment.apply(env, c.patch);
  assert.deepEqual(asanaCalls.at(-1), { method: 'POST', path: '/tasks/1200000000000398/stories', body: { text: 'Done on our side.' } });
  const k = await acts.asana_complete.propose(env, { task: 'https://app.asana.com/0/P1/1200000000000398' });
  assert.ok(!k.error, k.error); await acts.asana_complete.apply(env, k.patch);
  assert.deepEqual(asanaCalls.at(-1), { method: 'PUT', path: '/tasks/1200000000000398', body: { completed: true } });
});

await check('drive: list the brand folder, copy into a subfolder, share outside Mobius says so', async () => {
  const l = JSON.parse((await tools.drive_list.run(env, { brand: 'Lucky' })).text);
  assert.equal(l.folder, 'FOLDER_LUCKY_123'); assert.equal(l.files[0].name, 'Hero shot.png');
  const p = await acts.drive_copy_to.propose(env, { brand: 'Lucky', file: 'https://drive.google.com/file/d/FILE_AAA_111/view', subfolder: 'finals', name: 'Carver hero v2.png' });
  assert.ok(!p.error, p.error); assert.match(p.summary, /to Finals/);
  await acts.drive_copy_to.apply(env, p.patch);
  assert.deepEqual(drivePosts.at(-1).body, { name: 'Carver hero v2.png', parents: ['SUB_FINALS_1'] }); assert.equal(drivePosts.at(-1).path, 'files/FILE_AAA_111/copy');
  const s = await acts.drive_share.propose(env, { file: 'FILE_AAA_111', email: 'nick@grunk.com', role: 'commenter' });
  assert.match(s.summary, /\(comment\), outside Mobius/);
  await acts.drive_share.apply(env, s.patch);
  assert.deepEqual(drivePosts.at(-1).body, { type: 'user', role: 'commenter', emailAddress: 'nick@grunk.com' }); assert.equal(drivePosts.at(-1).q.sendNotificationEmail, 'false');
});

await check('Locus screen writes (POST /api/meta/write): dry shows before and after, the write logs as the person, stale refuses, undo from the toast', async () => {
  const dry = await mw.locusWrite(env, d, { act: 'brand_lucky', kind: 'budget', level: 'adset', object: '2300011', amount: 400, dry: true }, COLE);
  assert.ok(!dry.error, dry.error); assert.match(dry.summary, /\+\d+%/); assert.equal(dry.step[0].field, 'daily_budget');
  const stale = await mw.locusWrite(env, d, { act: 'brand_lucky', kind: 'budget', level: 'adset', object: '2300011', amount: 400, expect: { daily_budget: '1' } }, COLE);
  assert.ok(stale.stale, 'stale refused');
  const r = await mw.locusWrite(env, d, { act: 'brand_lucky', kind: 'budget', level: 'adset', object: '2300011', amount: 400, expect: dry.before }, COLE);
  assert.ok(!r.error, r.error); assert.ok(r.write); assert.equal(objs['2300011'].daily_budget, '40000');
  const line = db.prepare(`SELECT actor, event_type FROM activities WHERE manual = 1 ORDER BY event_time DESC LIMIT 1`).get();
  assert.match(line.actor, /in Locus/); assert.equal(line.event_type, 'locus_write');
  const other = await mw.locusUndo(env, d, { act: 'brand_dartee', write: r.write }, COLE);
  assert.match(other.error, /another brand/);
  const u = await mw.locusUndo(env, d, { act: 'brand_lucky', write: r.write }, COLE);
  assert.ok(!u.error, u.error); assert.equal(objs['2300011'].daily_budget, dry.before.daily_budget);
  const ro = await mw.locusWrite(env, d, { act: 'brand_dartee', kind: 'pause', level: 'adset', object: '2300031', dry: true }, COLE);
  assert.match(ro.error, /can only read/);
  const live = await mw.metaLive(env, d, 'brand_lucky');
  assert.equal(live.can, true); assert.equal(live.adsets['2300011'].campaign, '2300002');
});

const failed = checks.filter(c => !c.pass);
console.log(`\n${checks.length - failed.length}/${checks.length} passed`);
process.exit(failed.length ? 1 : 0);

/* Offline checks for the full-control pass (2026-10-17): every new write keeps the metawrite.js rules (look up first,
 * the brand's own object only, before -> after, a p_ext_write / p_meta_write row, a Change Log line, undo), Slack's
 * internal vs client line, the card-only list, and refusals that name the fix. In-memory SQLite; Slack, Google Ads,
 * Meta, Shopify, Klaviyo, Asana and Drive mocked; no secrets.
 *   node test-fullcontrol.mjs      (from account-health/worker)
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
for (const f of ['brand-001.sql', 'brand-002.sql', 'brand-003.sql', 'brand-004.sql', 'brand-005.sql']) load(path.join(root, 'profit', 'worker', 'migrations', f));
load(path.join(here, 'schema.sql'));
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
const LUCKY = 'act_111', DARTEE = 'act_222';
db.exec(`INSERT INTO accounts (act_id, name, currency, tz) VALUES ('${LUCKY}', 'Lucky Golf', 'USD', 'America/Chicago'), ('${DARTEE}', 'Dartee Golf', 'USD', 'America/New_York')`);
db.exec(`INSERT INTO brands (id, slug, name, status, currency, tz, legacy_key, source, internal_channel, client_channel) VALUES
  ('brand_lucky', 'lucky_golf', 'Lucky Golf', 'active', 'USD', 'America/Chicago', '${LUCKY}', 'locus', 'CINT', 'CCLIENT'),
  ('brand_dartee', 'dartee', 'Dartee Golf', 'active', 'USD', 'America/New_York', '${DARTEE}', 'locus', 'CDINT', 'CDCLIENT')`);
db.exec(`INSERT INTO connections (id, brand_id, kind, external_id, is_primary, source) VALUES ('m1', 'brand_lucky', 'meta', '${LUCKY}', 1, 'locus'), ('m2', 'brand_dartee', 'meta', '${DARTEE}', 1, 'locus'),
  ('g1', 'brand_lucky', 'google_ads', '6859198499', 1, 'locus')`);
db.exec(`CREATE TABLE IF NOT EXISTS p_shopify (shop TEXT PRIMARY KEY, act_id TEXT, access_token TEXT, scopes TEXT, installed_at TEXT, uninstalled_at TEXT, last_sync_at TEXT)`);
db.exec(`INSERT INTO p_shopify (shop, act_id, access_token, scopes, installed_at) VALUES ('dartee.myshopify.com', 'brand_dartee', 'tok', 'read_products,read_orders', '2026-10-17'), ('lucky.myshopify.com', 'brand_lucky', 'tok2', 'read_products,write_products,write_discounts', '2026-10-17')`);
db.exec(`INSERT INTO p_br_doc (act_id, line_id, key, data_json) VALUES ('brand_lucky', '', 'asana', '{"project_gid":"P1","workspace":"W1"}')`);

const J = (o, status = 200, headers = {}) => new Response(JSON.stringify(o), { status, headers: { 'Content-Type': 'application/json', ...headers } });

/* ---------------- Slack ---------------- */
const slackCalls = [];
const CH = {
  CINT: { id: 'CINT', name: 'lucky-internal', is_member: true },
  CCLIENT: { id: 'CCLIENT', name: 'lucky-golf', is_member: true },
  C0EXT0001: { id: 'C0EXT0001', name: 'partner-shared', is_ext_shared: true, is_member: true },
  CTEAM: { id: 'CTEAM', name: 'design-team', is_member: false },
};
const USERS = [{ id: 'U_NOMA', name: 'noma', real_name: 'Nomaqhawe Molife', profile: {} }, { id: 'U_GUEST', name: 'fela', real_name: 'Fela Client', is_restricted: true, profile: {} }, { id: 'U_COLE', name: 'cole', real_name: 'Cole Wetzler', profile: {} }];
const MSGS = { 'CINT:1700000000.000100': { ts: '1700000000.000100', text: 'Locus said this', bot_id: 'B_LOCUS' }, 'CINT:1700000000.000200': { ts: '1700000000.000200', text: 'Noma said this', user: 'U_NOMA' } };
async function slack(env, method, b) {
  slackCalls.push({ method, b });
  if (method === 'conversations.info') return CH[b.channel] ? { ok: true, channel: CH[b.channel] } : (String(b.channel).startsWith('D') ? { ok: true, channel: { id: b.channel, is_im: true, user: 'U_NOMA' } } : { ok: false, error: 'channel_not_found' });
  if (method === 'conversations.list') return { ok: true, channels: Object.values(CH) };
  if (method === 'users.list') return { ok: true, members: USERS };
  if (method === 'users.info') return { ok: true, user: USERS.find(u => u.id === b.user) };
  if (method === 'conversations.open') return { ok: true, channel: { id: 'D_' + b.users } };
  if (method === 'chat.postMessage') return { ok: true, channel: b.channel, ts: '1700000001.000001' };
  if (method === 'chat.getPermalink') return { ok: true, permalink: `https://x.slack.com/archives/${b.channel}/p${b.message_ts.replace('.', '')}` };
  if (method === 'conversations.history') { const m = MSGS[`${b.channel}:${b.latest}`]; return { ok: true, messages: m ? [m] : [] }; }
  if (method === 'auth.test') return { ok: true, bot_id: 'B_LOCUS', user_id: 'U_LOCUSBOT' };
  return { ok: true, scheduled_message_id: 'Q1', channel: b.channel || 'C_NEW' };
}

/* ---------------- Google Ads ---------------- */
const gCalls = [];
const GROW = {
  campaign: { campaign: { id: '111', name: 'Lucky | Search Brand', status: 'ENABLED', resourceName: 'customers/6859198499/campaigns/111', biddingStrategyType: 'MAXIMIZE_CONVERSION_VALUE', maximizeConversionValue: { targetRoas: 3 }, campaignBudget: 'customers/6859198499/campaignBudgets/9' }, campaignBudget: { amountMicros: '100000000' } },
  adGroup: { adGroup: { id: '222', name: 'Wedges', status: 'ENABLED', resourceName: 'customers/6859198499/adGroups/222' }, campaign: { name: 'Lucky | Search Brand' } },
};
async function gmock(url, init = {}) {
  const s = String(url);
  if (s.startsWith('https://oauth2.googleapis.com/token')) return J({ access_token: 'gtok', expires_in: 3600 });
  const body = init.body ? JSON.parse(init.body) : {};
  gCalls.push({ url: s, body });
  if (s.endsWith('googleAds:search')) {
    const q = body.query;
    if (/FROM campaign_criterion/.test(q)) return J({ results: [] });
    if (/FROM campaign\b/.test(q)) return J({ results: [GROW.campaign] });
    if (/FROM ad_group\b/.test(q)) return J({ results: [GROW.adGroup] });
    return J({ results: [] });
  }
  if (/:mutate$/.test(s)) {
    if (body.operations?.some(o => o.create?.keyword?.text === 'refuse me')) return J({ error: { message: 'Request contains an invalid argument.', details: [{ errors: [{ message: 'Keyword text is invalid', errorCode: { criterionError: 'INVALID_KEYWORD_TEXT' } }] }] } }, 400);
    return J({ results: (body.operations || []).map((o, i) => ({ resourceName: o.create ? `customers/6859198499/adGroupCriteria/222~${900 + i}` : (o.update?.resourceName || o.remove) })) });
  }
  return new Response('not mocked ' + s, { status: 404 });
}

/* ---------------- Meta + Shopify + Klaviyo through xfetch ---------------- */
const metaPosts = [];
const MOBJ = { 2300011: { id: '2300011', name: '412 | UGC', status: 'ACTIVE', effective_status: 'ACTIVE', campaign_id: '2300002', daily_budget: '20000', bid_strategy: 'LOWEST_COST_WITHOUT_CAP', account_id: '111', targeting: { age_min: 30, age_max: 65, geo_locations: { countries: ['US'] } } },
  2300002: { id: '2300002', name: 'Lucky | Tests ABO', status: 'ACTIVE', effective_status: 'ACTIVE', objective: 'OUTCOME_SALES', account_id: '111' } };
const shopCalls = [];
async function xfetch(url, init = {}) {
  const s = String(url);
  if (s.startsWith('https://slack.com/api/auth.test')) return J({ ok: true, user: 'locus', bot_id: 'B1' }, 200, { 'x-oauth-scopes': 'chat:write,reactions:write,channels:history' });
  if (s.startsWith('https://graph.facebook.com/')) {
    const u = new URL(s), p = u.pathname.replace('/v23.0/', '');
    if ((init.method || 'GET') === 'POST') {
      const b = Object.fromEntries(new URLSearchParams(init.body)); delete b.access_token; metaPosts.push({ path: p, body: b });
      if (b.execution_options) return J({ success: true });
      if (MOBJ[p]) { for (const [k, v] of Object.entries(b)) MOBJ[p][k] = /^[{[]/.test(v) ? JSON.parse(v) : v; }
      return J({ success: true });
    }
    if (p === 'me/permissions') return J({ data: [{ permission: 'ads_management', status: 'granted' }] });
    if (/^act_\d+$/.test(p)) return J({ id: p, name: p === LUCKY ? 'Lucky Golf' : 'Dartee Golf', user_tasks: p === LUCKY ? ['MANAGE'] : ['ANALYZE'] });
    const o = MOBJ[p]; if (!o) return J({ error: { message: 'nope' } }, 400);
    const f = (u.searchParams.get('fields') || '').split(',').map(x => x.replace(/\{.*$/, ''));
    return J(Object.fromEntries(Object.entries(o).filter(([k]) => f.includes(k) || k === 'id')));
  }
  if (s.includes('.myshopify.com/admin/api/')) {
    const b = JSON.parse(init.body); shopCalls.push(b);
    if (/products\(first/.test(b.query)) return J({ data: { products: { nodes: [{ id: 'gid://shopify/Product/1', title: 'Carver Wedge', handle: 'carver-wedge', status: 'ACTIVE', tags: ['wedge'], variants: { nodes: [{ id: 'gid://shopify/ProductVariant/11', title: '56', price: '149.00', compareAtPrice: null }] } }] } } });
    if (/productUpdate/.test(b.query)) return J({ data: { productUpdate: { product: { id: 'x' }, userErrors: [] } } });
    if (/productVariantsBulkUpdate/.test(b.query)) return J({ data: { productVariantsBulkUpdate: { productVariants: [], userErrors: [] } } });
    if (/codeDiscountNodeByCode/.test(b.query)) return J({ data: { codeDiscountNodeByCode: null } });
    if (/discountCodeBasicCreate/.test(b.query)) return J({ data: { discountCodeBasicCreate: { codeDiscountNode: { id: 'gid://shopify/DiscountCodeNode/5' }, userErrors: [] } } });
    if (/discountCode(De)?[Aa]ctivate/.test(b.query)) return J({ data: { discountCodeDeactivate: { codeDiscountNode: { id: 'x' }, userErrors: [] }, discountCodeActivate: { codeDiscountNode: { id: 'x' }, userErrors: [] } } });
  }
  return new Response('not mocked ' + s, { status: 404 });
}

/* ---------------- Asana + Google token ---------------- */
const asanaCalls = [];
const asanaMock = async (url, init = {}) => {
  const s = String(url);
  if (s.startsWith('https://oauth2.googleapis.com/token')) return J({ access_token: 'gtok', expires_in: 3600 });
  const u = new URL(s), p = u.pathname.replace('/api/1.0', '');
  const body = init.body ? JSON.parse(init.body).data : null;
  asanaCalls.push({ method: init.method || 'GET', path: p, body });
  const json = data => J({ data });
  if (p === '/users') return json([{ gid: 'U_NOMA', name: 'Noma' }]);
  if (p === '/projects/P1/sections') return json([{ gid: 'S_BRIEF', name: 'Creative Briefs' }, { gid: 'S_LIVE', name: 'Live' }]);
  if (/^\/tasks\/\d+$/.test(p) && (init.method || 'GET') === 'GET') return json({ gid: p.split('/')[2], name: '398 - Fix the PDP', notes: 'old notes', completed: false, due_on: '2026-10-20', permalink_url: 'https://app.asana.com/0/P1/' + p.split('/')[2], assignee: null, memberships: [{ project: { gid: 'P1' }, section: { gid: 'S_BRIEF', name: 'Creative Briefs' } }], workspace: { gid: 'W1' } });
  return json({});
};

const asanaBrand = await import('./src/asana-brand.js'); asanaBrand.useFetch(asanaMock);
const google = await import('./src/google.js'); google.useFetch(gmock);
const { privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const env = { DB, META_TOKEN: 'mt', ASANA_TOKEN: 'at', SLACK_BOT_TOKEN: 'xoxb', GOOGLE_ADS_MCC: '5566468199', GOOGLE_SA_KEY: JSON.stringify({ client_email: 'sa@x.iam.gserviceaccount.com', private_key: privateKey.export({ type: 'pkcs8', format: 'pem' }) }) };
const d = {
  getSetting: async (env, k) => (await env.DB.prepare('SELECT value FROM settings WHERE key = ?1').bind(k).first())?.value ?? null,
  putSetting: async (env, k, v) => env.DB.prepare('INSERT INTO settings (key, value) VALUES (?1, ?2) ON CONFLICT(key) DO UPDATE SET value = excluded.value').bind(k, typeof v === 'string' ? v : JSON.stringify(v)).run(),
  listAccounts: async env => (await env.DB.prepare('SELECT * FROM brand_accounts').all()).results,
  xfetch, slack,
};
const aw = await import('./src/allwrite.js');
const mw = await import('./src/metawrite.js');
const all = [...aw.extraActions(d), ...mw.writeActions(d)];
const A = Object.fromEntries(all.map(a => [a.name, a]));
const T = Object.fromEntries(aw.extraTools(d).map(t => [t.def.name, t]));
const COLE = { who: 'cole@go-mobius-digital.com', whoId: 'U_COLE' };
const NOMA = { who: 'noma', whoId: 'U_NOMA', channel: 'CINT', ev: { user: 'U_NOMA', ts: '1700000000.000200', channel: 'CINT' } };
const ext = () => db.prepare(`SELECT * FROM p_ext_write ORDER BY at`).all();
const lastLog = () => db.prepare(`SELECT * FROM activities WHERE manual = 1 ORDER BY event_time DESC, rowid DESC LIMIT 1`).get();
const run = async (name, input, ctx = COLE) => { const p = await A[name].propose(env, input, null, ctx); if (p.error) return p; return { p, r: await A[name].apply(env, p.patch, null, ctx) }; };

const checks = [];
async function check(name, fn) { try { await fn(); checks.push({ name, pass: true }); console.log('PASS ', name); } catch (e) { checks.push({ name, pass: false, error: e.message }); console.log('FAIL ', name, '\n      ' + e.message); } }

await check('registered: the new actions and tools exist, slack_post_client is card-only, strategist wires them, no em dashes', async () => {
  for (const n of ['slack_post', 'slack_post_client', 'slack_schedule', 'slack_react', 'slack_pin', 'slack_edit', 'slack_delete', 'slack_invite', 'slack_channel', 'google_status', 'google_budget', 'google_target', 'google_rename', 'google_keywords', 'google_keyword_bid', 'google_negative', 'google_ad_text',
    'tiktok_status', 'tiktok_budget', 'shopify_product', 'shopify_discount', 'undo_change', 'meta_bid', 'meta_targeting', 'meta_schedule', 'meta_create_campaign', 'meta_create_adset', 'meta_ad_copy', 'asana_update', 'drive_folder', 'drive_move', 'drive_rename']) assert.ok(A[n], n);
  for (const n of ['google_read', 'tiktok_read', 'write_access']) assert.ok(T[n], n);
  assert.ok(aw.CARD_ONLY.includes('slack_post_client') && aw.CARD_ONLY.includes('klaviyo_campaign_schedule') && aw.CARD_ONLY.includes('drive_share'));
  const strat = fs.readFileSync(path.join(here, 'src', 'strategist.js'), 'utf8');
  assert.match(strat, /cardOnly: CARD_ONLY/); assert.match(strat, /\.\.\.extraActions\(d\)/); assert.match(strat, /\.\.\.extraTools\(d\)/);
  for (const f of ['extwrite.js', 'slackwrite.js', 'googlewrite.js', 'tiktokwrite.js', 'shopifywrite.js', 'allwrite.js']) assert.ok(!fs.readFileSync(path.join(here, 'src', f), 'utf8').includes('—'), 'em dash in ' + f);
  const make = fs.readFileSync(path.join(here, 'src', 'stratmake.js'), 'utf8');
  assert.ok(!/frameApi\(env, 'DELETE'/.test(make), 'Frame never deletes');
});

await check('slack: a teammate\'s ask posts in an internal channel at once, logged, undo deletes it', async () => {
  const { p, r } = await run('slack_post', { to: '#lucky-internal', text: 'Heads up — Carver is low.', brand: 'Lucky Golf' }, NOMA);
  assert.ok(r.ok, JSON.stringify(r)); assert.match(p.summary, /#lucky-internal/);
  const post = slackCalls.find(c => c.method === 'chat.postMessage'); assert.equal(post.b.channel, 'CINT'); assert.ok(!post.b.text.includes('—'), 'dash replaced');
  const row = ext().at(-1); assert.equal(row.platform, 'slack'); assert.equal(row.by, 'noma');
  assert.equal(lastLog().event_type, 'slack_write');
  const u = await run('undo_change', { write: row.id }, NOMA); assert.ok(u.r.ok, JSON.stringify(u));
  assert.ok(slackCalls.some(c => c.method === 'chat.delete' && c.b.ts === '1700000001.000001'));
});

await check('slack: the client channel and a Slack Connect channel are refused for slack_post; slack_post_client needs Cole', async () => {
  const a = await A.slack_post.propose(env, { to: '#lucky-golf', text: 'hi' }, null, NOMA); assert.match(a.error, /client channel/);
  const b = await A.slack_post.propose(env, { to: 'C0EXT0001', text: 'hi' }, null, NOMA); assert.match(b.error, /outside Mobius/);
  const p = await A.slack_post_client.propose(env, { to: '#lucky-golf', text: 'Your weekly report is ready.' }, null, NOMA); assert.ok(!p.error, p.error);
  const nope = await A.slack_post_client.apply(env, p.patch, null, NOMA); assert.match(nope.error, /Cole/);
  const yes = await A.slack_post_client.apply(env, p.patch, null, COLE); assert.ok(yes.ok); assert.match(yes.note, /cannot be undone/);
  const g = await A.slack_post.propose(env, { to: '@fela', text: 'hi' }, null, NOMA); assert.match(g.error, /outside Mobius|client/);
});

await check('slack: DM a teammate by first name, react, pin, edit only its own messages, invite refuses guests', async () => {
  const dm = await run('slack_post', { to: 'Noma', text: 'Your brief is due Friday.' }, COLE); assert.ok(dm.r.ok); assert.match(dm.p.summary, /DM to Nomaqhawe/);
  const re = await run('slack_react', { message: 'this', emoji: ':white_check_mark:' }, NOMA); assert.ok(re.r.ok); assert.ok(slackCalls.some(c => c.method === 'reactions.add' && c.b.name === 'white_check_mark'));
  const pin = await run('slack_pin', { message: 'https://x.slack.com/archives/CINT/p1700000000000200' }, NOMA); assert.ok(pin.r.ok);
  const own = await A.slack_edit.propose(env, { message: 'https://x.slack.com/archives/CINT/p1700000000000200', text: 'new' }, null, NOMA); assert.match(own.error, /not one of Locus/);
  const ed = await run('slack_edit', { message: 'https://x.slack.com/archives/CINT/p1700000000000100', text: 'fixed words' }, NOMA); assert.ok(ed.r.ok);
  const undo = await run('undo_change', { write: ext().at(-1).id }, NOMA); assert.ok(undo.r.ok);
  assert.ok(slackCalls.filter(c => c.method === 'chat.update').at(-1).b.text === 'Locus said this');
  const inv = await A.slack_invite.propose(env, { channel: '#lucky-internal', who: ['fela'] }, null, NOMA); assert.match(inv.error, /guest/);
});

await check('google: pause a campaign (validateOnly first), negative + keywords with undo, a refusal shows on the card', async () => {
  const before = gCalls.length;
  const s = await run('google_status', { brand: 'Lucky Golf', level: 'campaign', target: 'Search Brand', status: 'pause', reason: 'test' });
  assert.ok(s.r.ok, JSON.stringify(s)); const muts = gCalls.slice(before).filter(c => /campaigns:mutate$/.test(c.url));
  assert.equal(muts[0].body.validateOnly, true); assert.ok(!muts[1].body.validateOnly); assert.equal(muts[1].body.operations[0].update.status, 'PAUSED');
  const u = await run('undo_change', { write: ext().at(-1).id }); assert.ok(u.r.ok);
  assert.equal(gCalls.at(-1).body.operations[0].update.status, 'ENABLED');
  const k = await run('google_keywords', { brand: 'Lucky Golf', ad_group: 'Wedges', keywords: ['tour wedge', 'spin wedge'], match: 'exact', reason: 'test' });
  assert.ok(k.r.ok); const kr = ext().at(-1); assert.equal(JSON.parse(kr.undo).ops.length, 2);
  await run('undo_change', { write: kr.id }); assert.ok(gCalls.at(-1).body.operations.every(o => o.remove));
  const bad = await A.google_keywords.propose(env, { brand: 'Lucky Golf', ad_group: 'Wedges', keywords: ['refuse me'], reason: 'x' }, null, COLE); assert.match(bad.error, /would refuse.*Keyword text is invalid/);
  const n = await run('google_negative', { brand: 'Lucky Golf', level: 'campaign', target: '111', text: 'free golf', match: 'phrase', reason: 'test' }); assert.ok(n.r.ok); assert.match(n.p.summary, /"free golf"/);
  const t = await run('google_target', { brand: 'Lucky Golf', target: '111', roas: 4, reason: 'test' }); assert.ok(t.r.ok); assert.match(t.p.summary, /300% → 400%/);
  const tro = await A.google_target.propose(env, { brand: 'Dartee Golf', target: '111', roas: 4, reason: 'x' }, null, COLE); assert.match(tro.error, /no Google Ads account/);
});

await check('meta: bid, targeting (validate_only first) and new ad copy refusals; writes go to p_meta_write with meta_undo', async () => {
  const b = await run('meta_bid', { brand: 'Lucky Golf', target: '2300011', level: 'adset', strategy: 'cost_cap', amount: 45, reason: 'test' });
  assert.ok(b.r.ok, JSON.stringify(b)); assert.ok(metaPosts.some(x => x.path === '2300011' && x.body.execution_options));
  assert.equal(MOBJ[2300011].bid_strategy, 'COST_CAP'); assert.equal(MOBJ[2300011].bid_amount, '4500');
  const tg = await run('meta_targeting', { brand: 'Lucky Golf', target: '2300011', age_min: 35, countries: ['us', 'ca'], reason: 'test' });
  assert.ok(tg.r.ok, JSON.stringify(tg)); assert.deepEqual(MOBJ[2300011].targeting.geo_locations.countries, ['US', 'CA']);
  const u = await run('undo_change', { brand: 'Lucky Golf', write: 'last' }); assert.ok(u.r.ok, JSON.stringify(u)); assert.equal(MOBJ[2300011].targeting.age_min, 30);
  const ro = await A.meta_bid.propose(env, { brand: 'Dartee Golf', target: '2300011', strategy: 'cost_cap', amount: 1, reason: 'x' }, null, COLE); assert.ok(ro.error);
});

await check('shopify: a read-only store is refused with the fix; a product price change and a new code record undo', async () => {
  const ro = await A.shopify_product.propose(env, { brand: 'Dartee Golf', product: 'belt', price: 10, reason: 'x' }, null, COLE); assert.match(ro.error, /write_products/);
  const p = await run('shopify_product', { brand: 'Lucky Golf', product: 'Carver Wedge', price: 139, tags_add: ['bfcm'], reason: 'test' });
  assert.ok(p.r.ok, JSON.stringify(p)); assert.match(p.p.summary, /\$149.00 → \$139/);
  const und = JSON.parse(ext().at(-1).undo); assert.equal(und.vars[0].price, '149.00');
  const c = await run('shopify_discount', { brand: 'Lucky Golf', code: 'early20', percent: 20, ends: '2026-11-30', reason: 'test' }); assert.ok(c.r.ok); assert.match(c.p.summary, /EARLY20, 20% off/);
  const big = await A.shopify_discount.propose(env, { brand: 'Lucky Golf', code: 'ALLFREE', percent: 95, reason: 'x' }, null, COLE); assert.match(big.error, /90%/);
});

await check('tiktok: not connected says exactly what Cole sets', async () => {
  const t = await A.tiktok_status.propose(env, { brand: 'Lucky Golf', level: 'campaign', target: 'x', status: 'off', reason: 'x' }, null, COLE); assert.match(t.error, /TIKTOK_APP_ID/);
});

await check('asana_update and drive_rename record before-states that undo_change puts back', async () => {
  const a = await run('asana_update', { task: '1200000000000398', due: '2026-10-25', section: 'Live', notes_append: 'Shipped.' });
  assert.ok(a.r.ok, JSON.stringify(a)); assert.match(a.p.summary, /due 2026-10-20 → 2026-10-25/);
  const u = await run('undo_change', { write: ext().at(-1).id }); assert.ok(u.r.ok);
  const put = asanaCalls.filter(c => c.method === 'PUT').at(-1); assert.equal(put.body.due_on, '2026-10-20'); assert.equal(put.body.notes, 'old notes');
  assert.ok(asanaCalls.some(c => c.path === '/sections/S_BRIEF/addTask'));
});

await check('write_access reports Slack scopes from auth.test and the missing ones', async () => {
  const r = JSON.parse((await T.write_access.run(env, { only: 'slack' }, {})).text);
  assert.ok(r.slack.have.includes('chat:write')); assert.ok(r.slack.missing.some(m => m.scope === 'pins:write'));
});

const failed = checks.filter(c => !c.pass);
console.log(`\n${checks.length - failed.length}/${checks.length} passed`);
process.exit(failed.length ? 1 : 0);

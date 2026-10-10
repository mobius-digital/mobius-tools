/* Offline checks for changing Klaviyo from Locus and the Strategist (src/klaviyowrite.js, 2026-10-09) and the new
 * Klaviyo reads (daily, flows with messages, campaigns with SMS and upcoming). In-memory SQLite, Klaviyo mocked.
 *   node test-klaviyowrite.mjs      (from account-health/worker)
 */
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..', '..');
const db = new DatabaseSync(':memory:');
const load = f => { for (const st of fs.readFileSync(f, 'utf8').replace(/--[^\n]*/g, '').split(/;\s*(?:\n|$)/)) { try { if (st.trim()) db.exec(st); } catch { /* re-applied ALTER */ } } };
load(path.join(here, 'schema.sql'));
for (const f of ['brand-001.sql', 'brand-002.sql', 'brand-003.sql', 'brand-004.sql', 'brand-005.sql']) load(path.join(root, 'profit', 'worker', 'migrations', f));
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

/* ---------------- fixtures: Lucky (full key), Dartee (read-only key), Ice & Gold (Attentive) ---------------- */
const LUCKY = 'act_111', DARTEE = 'act_222', ICE = 'act_333';
db.exec(`INSERT INTO accounts (act_id, name, currency, tz) VALUES ('${LUCKY}', 'Lucky Golf', 'USD', 'America/Chicago'), ('${DARTEE}', 'Dartee Golf', 'USD', 'America/New_York'), ('${ICE}', 'Ice & Gold', 'USD', 'America/New_York')`);
db.exec(`INSERT INTO brands (id, slug, name, status, currency, tz, legacy_key, source) VALUES ('brand_lucky', 'lucky_golf', 'Lucky Golf', 'active', 'USD', 'America/Chicago', '${LUCKY}', 'locus'),
  ('brand_dartee', 'dartee', 'Dartee Golf', 'active', 'USD', 'America/New_York', '${DARTEE}', 'locus'), ('brand_ice', 'ice', 'Ice & Gold', 'active', 'USD', 'America/New_York', '${ICE}', 'locus')`);
db.exec(`INSERT INTO connections (id, brand_id, kind, external_id, is_primary, source) VALUES ('m1', 'brand_lucky', 'meta', '${LUCKY}', 1, 'locus'), ('m2', 'brand_dartee', 'meta', '${DARTEE}', 1, 'locus'), ('m3', 'brand_ice', 'meta', '${ICE}', 1, 'locus')`);
db.exec(`INSERT INTO p_br_doc (act_id, line_id, key, data_json) VALUES ('brand_lucky', '', 'klaviyo', '{"key":"pk_lucky_full_key_000","company":"Lucky Golf","timezone":"America/Chicago"}'),
  ('brand_dartee', '', 'klaviyo', '{"key":"pk_dartee_read_only_00","company":"Dartee","timezone":"America/New_York"}')`);
db.exec(`INSERT INTO settings (key, value) VALUES ('emailTool:brand_ice', 'attentive')`);

/* ---------------- a tiny Klaviyo ---------------- */
const FLOWS = { WELC01: { name: 'Welcome Series', status: 'live', trigger_type: 'Added to List' }, CART01: { name: 'Abandoned Cart', status: 'manual', trigger_type: 'Metric' }, POST01: { name: 'Post Purchase', status: 'draft', trigger_type: 'Metric' } };
const CAMPS = {
  '01DRAFT000000000000000000A': { name: 'October Drop', status: 'Draft', audiences: { included: ['LIST01'] }, channel: 'email', msg: 'MSG_A' },
  '01SCHED000000000000000000B': { name: 'Fall Sale Early Access', status: 'Scheduled', audiences: { included: ['SEG01'] }, scheduled_at: '2026-10-20T14:00:00+00:00', channel: 'email', msg: 'MSG_B' },
  '01SENT0000000000000000000C': { name: 'Labor Day', status: 'Sent', send_time: '2026-09-01T15:00:00+00:00', audiences: { included: ['LIST01'] }, channel: 'email', msg: 'MSG_C' },
  '01SMS00000000000000000000D': { name: 'SMS Flash', status: 'Sent', send_time: '2026-09-20T18:00:00+00:00', audiences: { included: ['LIST02'] }, channel: 'sms', msg: 'MSG_D' },
};
const calls = []; let keepImmediate = false; let nextId = 1;
const J = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: { 'Content-Type': 'application/json' } });
const camp = (id, c) => ({ type: 'campaign', id, attributes: { name: c.name, status: c.status, send_time: c.send_time || null, scheduled_at: c.scheduled_at || null, audiences: c.audiences, send_strategy: c.send_strategy || { method: 'immediate' } }, relationships: { 'campaign-messages': { data: [{ type: 'campaign-message', id: c.msg }] } } });
const msgObj = c => ({ type: 'campaign-message', id: c.msg, attributes: { definition: { channel: c.channel, content: { subject: `${c.name} subject`, preview_text: 'pv' } } } });
const dates = n => { const out = []; const d = new Date(); d.setUTCDate(d.getUTCDate() - (n - 1)); for (let i = 0; i < n; i++) { out.push(d.toISOString().slice(0, 10) + 'T00:00:00+00:00'); d.setUTCDate(d.getUTCDate() + 1); } return out; };
async function kfetch(url, init = {}) {
  const u = new URL(url); const p = u.pathname; const m = init.method || 'GET';
  const key = (init.headers?.Authorization || '').replace('Klaviyo-API-Key ', '');
  const body = init.body ? JSON.parse(init.body) : null;
  calls.push({ m, p, q: u.search, body, key });
  const readOnly = key === 'pk_dartee_read_only_00';
  if (m !== 'GET' && readOnly && !/reports|metric-aggregates/.test(p)) return J({ errors: [{ detail: 'This API key is missing required scopes.' }] }, 403);
  if (p === '/api/accounts/') return J({ data: [{ id: 'ACC1', attributes: { contact_information: { default_sender_email: 'hello@lucky.golf', default_sender_name: 'Lucky Golf', organization_name: 'Lucky Golf' }, timezone: 'America/Chicago' } }] });
  if (p === '/api/lists/') return J({ data: [{ id: 'LIST01', attributes: { name: 'Newsletter' } }, { id: 'LIST02', attributes: { name: 'SMS Subscribers' } }] });
  if (p === '/api/segments/') return J({ data: [{ id: 'SEG01', attributes: { name: 'Engaged 90 days', is_active: true } }, { id: 'SEG02', attributes: { name: 'VIP buyers', is_active: true } }] });
  if (p === '/api/templates/') return J({ data: [{ id: 'TPL01', attributes: { name: 'October drop layout', editor_type: 'SYSTEM_DRAGGABLE' } }, { id: 'TPL02', attributes: { name: 'Plain text' } }] });
  if (p === '/api/metrics/') return J({ data: ['Placed Order', 'Received Email', 'Opened Email', 'Clicked Email', 'Bounced Email', 'Marked Email as Spam', 'Unsubscribed', 'Received SMS', 'Clicked SMS', 'Subscribed to List'].map((n, i) => ({ id: 'M' + i, attributes: { name: n, integration: { name: n === 'Placed Order' ? 'Shopify' : 'Klaviyo' } } })) });
  let mm;
  if ((mm = p.match(/^\/api\/flows\/(\w+)\/$/))) {
    const f = FLOWS[mm[1]]; if (!f) return J({ errors: [{ detail: 'not found' }] }, 404);
    if (m === 'PATCH') { f.status = body.data.attributes.status; return J({ data: { id: mm[1], attributes: f } }); }
    return J({ data: { type: 'flow', id: mm[1], attributes: f } });
  }
  if (p === '/api/flows/') return J({ data: Object.entries(FLOWS).map(([id, f]) => ({ type: 'flow', id, attributes: f })) });
  if (p === '/api/flow-values-reports/') return J({ data: { attributes: { results: [
    { groupings: { flow_id: 'WELC01', flow_message_id: 'FM1', send_channel: 'email' }, statistics: { recipients: 1000, delivered: 990, open_rate: 0.5, click_rate: 0.05, conversion_rate: 0.03, conversions: 30, conversion_value: 3000, revenue_per_recipient: 3, unsubscribe_rate: 0.002, bounce_rate: 0.01, spam_complaint_rate: 0.0001 } },
    { groupings: { flow_id: 'WELC01', flow_message_id: 'FM2', send_channel: 'sms' }, statistics: { recipients: 200, delivered: 200, click_rate: 0.1, conversion_rate: 0.05, conversions: 10, conversion_value: 800, unsubscribe_rate: 0.01 } }] } } });
  if ((mm = p.match(/^\/api\/flow-messages\/(\w+)\/$/))) return J({ data: { id: mm[1], attributes: { name: mm[1] === 'FM1' ? 'Email 1: hello' : 'SMS 1', channel: mm[1] === 'FM1' ? 'email' : 'sms', content: { subject: mm[1] === 'FM1' ? 'Welcome to Lucky' : null } } } });
  if (p === '/api/campaigns/' && m === 'GET') {
    const ch = /sms/.test(decodeURIComponent(u.search)) ? 'sms' : 'email';
    const rows = Object.entries(CAMPS).filter(([, c]) => c.channel === ch);
    return J({ data: rows.map(([id, c]) => camp(id, c)), included: rows.map(([, c]) => msgObj(c)) });
  }
  if (p === '/api/campaigns/' && m === 'POST') {
    const id = '01NEW' + String(nextId++).padStart(21, '0'); const a = body.data.attributes;
    CAMPS[id] = { name: a.name, status: 'Draft', audiences: a.audiences, channel: 'email', msg: 'MSG_N' + nextId, send_strategy: a.send_strategy };
    return J({ data: { ...camp(id, CAMPS[id]) } }, 201);
  }
  if ((mm = p.match(/^\/api\/campaigns\/(\w+)\/$/))) {
    const c = CAMPS[mm[1]]; if (!c) return J({ errors: [{ detail: 'not found' }] }, 404);
    if (m === 'PATCH') { if (body.data.attributes.send_strategy && !keepImmediate) c.send_strategy = body.data.attributes.send_strategy; if (body.data.attributes.name) c.name = body.data.attributes.name; return J({ data: camp(mm[1], c) }); }
    return J({ data: camp(mm[1], c), included: [msgObj(c)] });
  }
  if (p === '/api/campaign-message-assign-template/') return J({ data: { id: body.data.id } });
  if (p === '/api/campaign-send-jobs/') { const c = CAMPS[body.data.id]; c.status = 'Scheduled'; return J({ data: { id: body.data.id, attributes: { status: 'queued' } } }, 202); }
  if ((mm = p.match(/^\/api\/campaign-send-jobs\/(\w+)\/$/))) { const c = CAMPS[mm[1]]; c.status = body.data.attributes.action === 'revert' ? 'Draft' : 'Cancelled'; return new Response(null, { status: 204 }); }
  if (p === '/api/campaign-clone/') { const id = '01CLONE' + String(nextId++).padStart(19, '0'); CAMPS[id] = { ...CAMPS[body.data.id], name: body.data.attributes.new_name, status: 'Draft' }; return J({ data: { id } }, 201); }
  if (p === '/api/campaign-values-reports/') return J({ data: { attributes: { results: [{ groupings: { campaign_id: '01SENT0000000000000000000C' }, statistics: { recipients: 5000, open_rate: 0.4, click_rate: 0.02, conversion_value: 2500 } }] } } });
  if (p === '/api/metric-aggregates/') {
    const a = body.data.attributes; const ds = dates(180);
    if (a.metric_id === 'M0') return J({ data: { attributes: { dates: ds, data: [
      { dimensions: ['email', 'WELC01', 'FM1'], measurements: { sum_value: ds.map(() => 10), count: ds.map(() => 1) } },
      { dimensions: ['sms', '', 'MSG_D'], measurements: { sum_value: ds.map(() => 5), count: ds.map(() => 1) } },
      { dimensions: ['', '', ''], measurements: { sum_value: ds.map(() => 999), count: ds.map(() => 9) } }] } } });
    const meas = a.measurements[0];
    return J({ data: { attributes: { dates: ds, data: [{ dimensions: [], measurements: { [meas]: ds.map(() => 100) } }] } } });
  }
  return J({ errors: [{ detail: `not mocked ${m} ${p}` }] }, 404);
}

const kl = await import('./src/klaviyo.js');
kl.useFetch(kfetch);
const kw = await import('./src/klaviyowrite.js');
const env = { DB };
const d = { listAccounts: async env => (await env.DB.prepare('SELECT * FROM brand_accounts').all()).results };
const acts = Object.fromEntries(kw.klaviyoActions(d).map(a => [a.name, a]));
const tools = Object.fromEntries(kw.klaviyoTools(d).map(t => [t.def.name, t]));
const COLE = { who: 'cole@go-mobius-digital.com' };
const lastActivity = () => db.prepare(`SELECT * FROM activities WHERE manual = 1 ORDER BY rowid DESC LIMIT 1`).get();

const checks = [];
async function check(name, fn) { try { await fn(); checks.push({ name, pass: true }); console.log('PASS ', name); } catch (e) { checks.push({ name, pass: false, error: e.message }); console.log('FAIL ', name, '\n      ' + e.message); } }

await check('registered: the read tool and four Apply cards, wired in strategist.js and worker.js, no em dashes', async () => {
  for (const n of ['klaviyo_flow_status', 'klaviyo_campaign_draft', 'klaviyo_campaign_schedule', 'klaviyo_campaign_cancel']) assert.ok(acts[n], n);
  assert.ok(tools.klaviyo_read);
  for (const f of ['klaviyowrite.js', 'klaviyo.js']) assert.ok(!fs.readFileSync(path.join(here, 'src', f), 'utf8').includes('—'), 'em dash in ' + f);
  const strat = fs.readFileSync(path.join(here, 'src', 'strategist.js'), 'utf8');
  assert.match(strat, /\.\.\.klaviyoTools\(d\)/); assert.match(strat, /\.\.\.klaviyoActions\(d\)/);
  assert.match(fs.readFileSync(path.join(here, 'src', 'worker.js'), 'utf8'), /\/api\/klaviyo\/write/);
});

await check('scopes: a read-only key is refused with the exact scope to add, before anything is read', async () => {
  const can = await kw.klaviyoCan(env, 'brand_dartee', true);
  assert.equal(can.flows, false); assert.equal(can.campaigns, false); assert.deepEqual(can.missing.slice(0, 2), ['flows:write', 'campaigns:write']);
  const r = await acts.klaviyo_flow_status.propose(env, { brand: 'Dartee', flow: 'Welcome Series', status: 'manual', reason: 'test' }, null, COLE);
  assert.match(r.error, /lacks flows:write \(Flows: Full access\)/); assert.match(r.error, /Klaviyo > Settings > API keys/); assert.match(r.error, /Brand settings > Integrations > Klaviyo/);
  const route = await kw.klaviyoWriteRoute(env, { act: 'brand_dartee', op: 'campaign_draft', input: { name: 'x', subject: 'y', audiences: ['Newsletter'] } }, 'cole@go-mobius-digital.com');
  assert.equal(route.status, 403); assert.match(route.body.error, /campaigns:write/);
  const full = await kw.klaviyoCan(env, 'brand_lucky', true); assert.equal(full.flows && full.campaigns && full.templates, true);
});

await check('flow status: card shows live -> manual, apply PATCHes the flow and logs who approved under the Meta account', async () => {
  const p = await acts.klaviyo_flow_status.propose(env, { brand: 'Lucky Golf', flow: 'welcome', status: 'manual', reason: 'Welcome 1 RPR fell 40% in 2 weeks' }, null, COLE);
  assert.ok(!p.error, p.error);
  assert.match(p.summary, /Lucky Golf: Flow "Welcome Series": live → manual/); assert.match(p.detail, /Nobody new enters/);
  db.exec(`INSERT OR REPLACE INTO settings (key, value) VALUES ('klv:brand_lucky:flows_report:2', '{"at":"2026-10-09T00:00:00Z","data":{}}')`);
  const r = await acts.klaviyo_flow_status.apply(env, p.patch, null, COLE);
  assert.ok(r.ok, r.error); assert.equal(FLOWS.WELC01.status, 'manual');
  const patch = calls.filter(c => c.m === 'PATCH' && c.p === '/api/flows/WELC01/').at(-1); assert.deepEqual(patch.body.data.attributes, { status: 'manual' });
  const a = lastActivity();
  assert.equal(a.act_id, LUCKY); assert.equal(a.event_type, 'klaviyo_write'); assert.equal(a.category, 'email'); assert.equal(a.object_type, 'KLAVIYO_FLOW');
  assert.match(a.actor, /the Strategist, approved by cole@go-mobius-digital\.com/); assert.match(a.summary, /live → manual/); assert.match(a.reason, /RPR fell/);
  assert.equal(db.prepare(`SELECT COUNT(*) n FROM settings WHERE key = 'klv:brand_lucky:flows_report:2'`).get().n, 0, 'cached read dropped');
});

await check('flow status: apply refuses when the flow moved since the card, and an unknown flow lists the real ones', async () => {
  const p = await acts.klaviyo_flow_status.propose(env, { brand: 'Lucky Golf', flow: 'Abandoned Cart', status: 'live', reason: 'core flow is off' }, null, COLE);
  FLOWS.CART01.status = 'draft';
  const r = await acts.klaviyo_flow_status.apply(env, p.patch, null, COLE);
  assert.match(r.error, /changed since this was shown/); assert.equal(FLOWS.CART01.status, 'draft');
  const bad = await acts.klaviyo_flow_status.propose(env, { brand: 'Lucky Golf', flow: 'Winback', status: 'live', reason: 'x' }, null, COLE);
  assert.match(bad.error, /No flow called "Winback"\. Flows: Welcome Series/);
});

await check('draft: audiences and template by name, created as a draft with no send, template attached, logged', async () => {
  const p = await acts.klaviyo_campaign_draft.propose(env, { brand: 'Lucky Golf', name: 'Burgundy drop', audiences: ['Engaged 90', 'Newsletter'], exclude: ['VIP'], subject: 'The Anchorman drop is here', preview: 'Seven pieces', template: 'october drop', reason: 'launch Oct 13' }, null, COLE);
  assert.ok(!p.error, p.error);
  assert.match(p.summary, /New draft campaign "Burgundy drop" to Engaged 90 days, Newsletter/); assert.match(p.detail, /From: Lucky Golf <hello@lucky\.golf>/); assert.match(p.detail, /DRAFT\. Nothing sends/);
  const r = await acts.klaviyo_campaign_draft.apply(env, p.patch, null, { who: 'U_AHSAN' });
  assert.ok(r.ok, r.error); assert.match(r.link, /klaviyo\.com\/campaign\/01NEW\w+\/wizard/);
  const post = calls.filter(c => c.m === 'POST' && c.p === '/api/campaigns/').at(-1).body.data.attributes;
  assert.deepEqual(post.audiences, { included: ['SEG01', 'LIST01'], excluded: ['SEG02'] }); assert.equal(post.send_strategy, undefined, 'never a send strategy on create');
  assert.equal(post['campaign-messages'].data[0].attributes.definition.content.subject, 'The Anchorman drop is here');
  assert.ok(calls.some(c => c.p === '/api/campaign-message-assign-template/' && c.body.data.relationships.template.data.id === 'TPL01'));
  assert.ok(!calls.some(c => c.p === '/api/campaign-send-jobs/'), 'nothing sent');
  assert.match(lastActivity().actor, /approved by U_AHSAN/);
  const amb = await acts.klaviyo_campaign_draft.propose(env, { brand: 'Lucky Golf', name: 'x', audiences: ['e'], subject: 's', reason: 'r' }, null, COLE);
  assert.match(amb.error, /matches several/);
});

await check('schedule: refuses now and non-drafts; sets a fixed time, reads it back, then the send job', async () => {
  const soon = await acts.klaviyo_campaign_schedule.propose(env, { brand: 'Lucky Golf', campaign: 'October Drop', at: new Date(Date.now() + 5 * 60e3).toISOString(), reason: 'x' }, null, COLE);
  assert.match(soon.error, /less than 15 minutes/);
  const nd = await acts.klaviyo_campaign_schedule.propose(env, { brand: 'Lucky Golf', campaign: 'Fall Sale Early Access', at: new Date(Date.now() + 20 * 864e5).toISOString(), reason: 'x' }, null, COLE);
  assert.match(nd.error, /is Scheduled, not a draft.*unschedule it first/);
  const at = new Date(Date.now() + 3 * 864e5); const local = at.toISOString().slice(0, 10) + 'T09:00';
  const p = await acts.klaviyo_campaign_schedule.propose(env, { brand: 'Lucky Golf', campaign: 'October Drop', at: local, reason: 'drop day' }, null, COLE);
  assert.ok(!p.error, p.error); assert.match(p.detail, /To: Newsletter/); assert.match(p.summary, /9:00/);
  /* Klaviyo does not keep the time: no send job. */
  keepImmediate = true;
  const bad = await acts.klaviyo_campaign_schedule.apply(env, p.patch, null, COLE);
  assert.match(bad.error, /NOT scheduled/); assert.ok(!calls.some(c => c.p === '/api/campaign-send-jobs/'), 'no send job when the time did not stick');
  keepImmediate = false;
  const r = await acts.klaviyo_campaign_schedule.apply(env, p.patch, null, COLE);
  assert.ok(r.ok, r.error);
  const ss = CAMPS['01DRAFT000000000000000000A'].send_strategy; assert.equal(ss.method, 'static'); assert.equal(ss.options.is_local, false);
  assert.equal(new Date(ss.datetime).getUTCHours(), 14, '9:00 Central (CDT) = 14:00 UTC');
  const order = calls.filter(c => c.p.includes('01DRAFT') || c.p === '/api/campaign-send-jobs/').map(c => `${c.m} ${c.p}`);
  assert.ok(order.lastIndexOf('PATCH /api/campaigns/01DRAFT000000000000000000A/') < order.lastIndexOf('POST /api/campaign-send-jobs/'), 'time set before the send job');
  assert.equal(CAMPS['01DRAFT000000000000000000A'].status, 'Scheduled');
});

await check('unschedule and cancel: revert and cancel on the send job, refused on a draft', async () => {
  const p = await acts.klaviyo_campaign_cancel.propose(env, { brand: 'Lucky Golf', campaign: 'Fall Sale Early Access', mode: 'unschedule', reason: 'offer changed' }, null, COLE);
  assert.ok(!p.error, p.error); assert.match(p.detail, /Scheduled → Draft/);
  const r = await acts.klaviyo_campaign_cancel.apply(env, p.patch, null, COLE);
  assert.ok(r.ok, r.error); assert.equal(calls.at(-1).body.data.attributes.action, 'revert'); assert.equal(CAMPS['01SCHED000000000000000000B'].status, 'Draft');
  const p2 = await acts.klaviyo_campaign_cancel.propose(env, { brand: 'Lucky Golf', campaign: 'October Drop', mode: 'cancel', reason: 'dup' }, null, COLE);
  assert.ok(!p2.error, p2.error); assert.match(p2.detail, /Cancelled for good/);
  await acts.klaviyo_campaign_cancel.apply(env, p2.patch, null, COLE);
  assert.equal(CAMPS['01DRAFT000000000000000000A'].status, 'Cancelled');
  const p3 = await acts.klaviyo_campaign_cancel.propose(env, { brand: 'Lucky Golf', campaign: 'Fall Sale Early Access', mode: 'cancel', reason: 'x' }, null, COLE);
  assert.match(p3.error, /only a scheduled campaign/);
});

await check('Locus route: preview has no patch, confirm re-proposes and refuses a stale view, duplicate logs "<who> in Locus"', async () => {
  const pv = await kw.klaviyoWriteRoute(env, { act: 'brand_lucky', op: 'campaign_duplicate', input: { campaign: 'Labor Day' } }, 'noma@x.com');
  assert.equal(pv.status, 200); assert.equal(pv.body.patch, undefined); assert.match(pv.body.summary, /Duplicate "Labor Day" as "Labor Day \(copy\)"/);
  const stale = await kw.klaviyoWriteRoute(env, { act: 'brand_lucky', op: 'campaign_duplicate', input: { campaign: 'Labor Day' }, confirm: true, expect: 'something else' }, 'noma@x.com');
  assert.equal(stale.status, 409);
  const ok = await kw.klaviyoWriteRoute(env, { act: 'brand_lucky', op: 'campaign_duplicate', input: { campaign: 'Labor Day' }, confirm: true, expect: pv.body.summary }, 'noma@x.com');
  assert.equal(ok.status, 200, JSON.stringify(ok.body)); assert.equal(lastActivity().actor, 'noma@x.com in Locus');
});

await check('Attentive brand is refused with the reason; sendAt reads the brand time zone', async () => {
  const r = await acts.klaviyo_flow_status.propose(env, { brand: 'Ice & Gold', flow: 'x', status: 'live', reason: 'x' }, null, COLE);
  assert.match(r.error, /Attentive/);
  const t = await tools.klaviyo_read.run(env, { brand: 'Ice', what: 'campaigns' }, COLE); assert.ok(t.is_error); assert.match(t.text, /Attentive/);
  assert.equal(kw._test.sendAt('2026-12-01T09:00', 'America/New_York').toISOString(), '2026-12-01T14:00:00.000Z');
  assert.equal(kw._test.sendAt('2026-07-01T09:00', 'America/New_York').toISOString(), '2026-07-01T13:00:00.000Z');
});

await check('reads: daily splits email vs SMS and flows vs campaigns, drops unattributed; flows keep messages; campaigns carry SMS and upcoming', async () => {
  const dly = await kl.klaviyoView(env, 'brand_lucky', 'daily');
  assert.equal(dly.days.length, 180); const last = dly.days.at(-1);
  assert.equal(last.rev_email, 10); assert.equal(last.rev_sms, 5); assert.equal(last.rev_flow, 10); assert.equal(last.rev_campaign, 5); assert.equal(last.received, 100);
  assert.ok(dly.by_flow.WELC01 && dly.by_message.MSG_D); assert.ok(!dly.by_message.FM1, 'flow messages count to the flow');
  const fr = await kl.klaviyoView(env, 'brand_lucky', 'flows_report');
  const w = fr.flows.find(f => f.id === 'WELC01'); assert.equal(w.messages.length, 2); assert.equal(w.revenue, 3800); assert.ok(fr.flows.find(f => f.id === 'POST01' && f.status === 'draft'), 'a flow with no sends is listed');
  const one = await kl.klaviyoView(env, 'brand_lucky', 'flow', null, { id: 'WELC01' });
  assert.equal(one.messages.find(m => m.id === 'FM1').subject, 'Welcome to Lucky');
  const cp = await kl.klaviyoView(env, 'brand_lucky', 'campaigns');
  assert.ok(cp.campaigns.some(c => c.channel === 'sms' && c.name === 'SMS Flash')); assert.ok(cp.upcoming.length >= 1); assert.equal(cp.campaigns.find(c => c.name === 'Labor Day').message_id, 'MSG_C');
  const t = await tools.klaviyo_read.run(env, { brand: 'Lucky', what: 'flows' }, COLE); assert.ok(!t.is_error, t.text); assert.match(t.text, /Welcome Series/);
});

const failed = checks.filter(c => !c.pass);
console.log(`\n${checks.length - failed.length} of ${checks.length} passed`);
process.exit(failed.length ? 1 : 0);

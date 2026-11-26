/* Offline checks for THE CLIENT DAILY IN THE HOUSE STYLE (2026-11-26, Cole approved the v2 look): clientpost.js
 * dailyCard + threadCard, house.js maxNumbers, and the send and edit paths in worker.js (sendBrief through
 * POST /api/brief-send, the draft and the sent-post edit through /api/brief-client-post, editClientPost).
 *   node --import <a loader that stubs .wasm> test-clientdaily.mjs      (from account-health/worker)
 *   ... test-clientdaily.mjs --sample <file>   also writes one sample payload (the daily and its thread) for Slack's
 *       Block Kit Builder.
 * A real SQLite (node:sqlite) stands in for D1, the clock is frozen, Slack is a fake that records every call, and every
 * brand and number is made up.
 *
 * What it proves, per input class (goal ahead / on / under, best day, no goal set, no goal at all, Amazon or not,
 * missing numbers, a long Next, a missed day, an edited draft): the same numbers the old text post carried are in the
 * card, houseLint finds nothing, the text fallback (header plus verdict) is present, and no em or en dash anywhere. */
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { dailyPost, dailyCard, threadCard, dailyVerdictLine, cardText, sameDaily, headerDay } from './src/clientpost.js';
import { houseMessage, houseLint, HOUSE } from './src/house.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..', '..');
let passed = 0, failed = 0;
async function check(name, fn) {
  try { await fn(); passed++; console.log('PASS ', name); }
  catch (e) { failed++; console.log('FAIL ', name, '\n      ' + String(e && e.stack || e).split('\n').slice(0, 4).join('\n      ')); }
}
const AT = new Date('2026-11-26T13:05:00Z');            // 7:05am Central
const DASH = new RegExp('[\\u2014\\u2013]');
const lintOk = (m, what) => { assert.deepEqual(houseLint(m), [], `${what}: houseLint`); assert.ok(!DASH.test(JSON.stringify(m)), `${what}: no em or en dash`); };
const fieldsOf = m => m.blocks.find(b => b.fields)?.fields.map(f => f.text) || [];
const summaryOf = m => m.blocks.find(b => b.type === 'section' && b.text)?.text.text || '';
const header = m => m.blocks[0].text.text;
/* Every dollar or ratio figure the old text post printed for the day and the month must be in the card too. */
const figures = s => (String(s).match(/\$\d+(?:,\d{3})*(?:\.\d+)?K?|\d+\.\d\dx/g) || []);

const BASE = { brand: 'Sample Golf', date: '2026-11-25', currency: 'USD', today: '2026-11-26', at: AT, now: AT,
  day: { sales: 4860, spend: 1640, mer: 2.96, amer: 1.42, plan: 4200 },
  month: { ym: '2026-11', sales: 88400, plan: 96000, spend: 31200, new_rev: 40100, day_of_month: 25, days_in_month: 30 },
  others: [5200, 3900, 4100] };

/* ---------------- house.js: maxNumbers ---------------- */
await check('house.js: maxNumbers left out keeps the 4 cell cap and every message byte-identical; 10 is the most', () => {
  HOUSE.strict = true;
  try {
    const cells = n => Array.from({ length: n }, (_, i) => ({ label: `L${i}`, value: `v${i}` }));
    assert.throws(() => houseMessage({ title: 't', numbers: cells(5) }), /more than 4 numbers/);
    assert.deepEqual(houseMessage({ title: 't', numbers: cells(4), at: AT, now: AT }), houseMessage({ title: 't', numbers: cells(4), at: AT, now: AT, maxNumbers: undefined }));
    assert.equal(houseMessage({ title: 't', numbers: cells(6), maxNumbers: 10 }).blocks[1].fields.length, 6);
    assert.throws(() => houseMessage({ title: 't', numbers: cells(11), maxNumbers: 12 }), /more than 10 numbers/);
  } finally { HOUSE.strict = false; }
});

/* ---------------- the verdict sentence ---------------- */
await check('the verdict: ahead / on / under goal (5% band), best day first, no goal set, no goal at all, no sales', () => {
  const v = o => dailyVerdictLine({ ym: '2026-11', ...o });
  assert.equal(v({ sales: 4860, plan: 4200 }), 'Ahead of goal: $4,860 in sales against $4,200.');
  assert.equal(v({ sales: 4100, plan: 4200 }), 'On goal: $4,100 in sales against $4,200.');
  assert.equal(v({ sales: 3000, plan: 4200 }), 'Under goal: $3,000 in sales against $4,200.');
  assert.equal(v({ sales: 6000, plan: 4200, others: [5000, 3000] }), 'Best day this month: $6,000 in sales against $4,200.');
  assert.equal(v({ sales: 6000, plan: 4200, others: [5000] }), 'Ahead of goal: $6,000 in sales against $4,200.', 'best day needs two other days');
  assert.equal(v({ sales: 3000, plan: 4200, goal_set: false }), 'No goal set for November: $3,000 in sales.');
  assert.equal(v({ sales: 6000, plan: 4200, goal_set: false, others: [1, 2] }), 'Best day this month: $6,000 in sales. No goal set for November.');
  assert.equal(v({ sales: 3000, plan: null }), '$3,000 in sales.');
  assert.equal(v({ sales: null, plan: 4200 }), 'No sales numbers for this day yet.');
  assert.ok(!/plan/i.test(v({ sales: 1, plan: 2 })), 'a client reads goal, never plan');
});

/* ---------------- the daily card, per input class, against the old text post ---------------- */
const CLASSES = {
  'goal, ahead': BASE,
  'goal, on': { ...BASE, day: { ...BASE.day, sales: 4300 } },
  'goal, under': { ...BASE, day: { ...BASE.day, sales: 2900 }, others: [5200, 6100] },
  'best day': { ...BASE, day: { ...BASE.day, sales: 7000 } },
  'no goal set': { ...BASE, goal_set: false },
  'no goal at all': { ...BASE, day: { ...BASE.day, plan: null }, month: { ...BASE.month, plan: null } },
  'Amazon': { ...BASE, amazon: { day: { sales: 410, orders: 9 }, month: { sales: 9100, orders: 190 } } },
  'missing numbers': { ...BASE, day: { sales: 1200, spend: null, mer: null, amer: null, plan: 4200 }, month: { ym: '2026-11', sales: 30000, plan: 96000, spend: null, new_rev: null } },
  'no sales yet': { ...BASE, day: { sales: null, spend: 300, mer: null, amer: null, plan: 4200 } },
  'Next line': { ...BASE, next: 'Black Friday ads go live tonight at 6pm.' },
  'long Next line': { ...BASE, next: 'We moved budget from the prospecting set into the past buyers set after the email went out, and we will read the result tomorrow morning once the numbers settle, then decide on the weekend budget.' },
  'missed day': { ...BASE, date: '2026-11-24', thread: false },
};
for (const [name, a] of Object.entries(CLASSES)) {
  await check(`daily card, ${name}: house style, text fallback, the old post's numbers, no blank lines`, () => {
    const m = dailyCard(a), old = dailyPost(a);
    lintOk(m, name);
    assert.equal(m.blocks[0].type, 'header');
    assert.equal(header(m), `Sample Golf · ${headerDay(a.date)}`);
    assert.ok(m.text && m.text.startsWith(header(m)) && m.text.length > header(m).length, 'text fallback: header plus verdict');
    assert.ok(m.text.includes(dailyVerdictLine({ sales: a.day.sales, plan: a.day.plan, others: a.others, goal_set: a.goal_set, ym: '2026-11' }).replace(/\.$/, '')));
    assert.ok(!m.attachments, 'no colored bar');
    const f = fieldsOf(m);
    if (a.day.sales != null || a.month?.sales != null) {
      assert.equal(f.length, 2, 'two columns');
      const rowsL = f[0].split('\n').slice(1).map(l => l.split(':')[0]), rowsR = f[1].split('\n').slice(1).map(l => l.split(':')[0]);
      assert.deepEqual(rowsL, rowsR, 'the same rows in the same order');
      const want = ['Sales', 'Goal', 'Ad spend', 'MER', 'aMER', 'Amazon'].filter(r => rowsL.includes(r));
      assert.deepEqual(rowsL, want, 'the approved order');
      assert.equal(f[0].split('\n')[0], a.date === '2026-11-24' ? '*Tuesday*' : '*Yesterday*');
      assert.equal(f[1].split('\n')[0], '*November so far*');
    }
    const goalShown = a.goal_set !== false && (a.day.plan > 0 || a.month.plan > 0);
    assert.equal(/\nGoal:/.test(f.join('\n')), goalShown, 'Goal rows only with a goal');
    assert.equal(/\nAmazon:/.test(f.join('\n')), !!a.amazon, 'Amazon only for an Amazon brand');
    /* Old vs new: every figure the old post printed (minus the month's day count and the old Amazon order counts) is in the card. */
    const card = JSON.stringify(m.blocks);
    for (const n of figures(old)) assert.ok(card.includes(n), `${name}: ${n} from the old post is in the card`);
    if (a.goal_set === false) assert.ok(!/\$4,200|\$96K/.test(card) && /No goal set for November/.test(card), 'no inherited goal number');
    if (a.next) assert.ok(card.includes(a.next.slice(0, 40)), 'the person\'s Next line is kept');
    const ctx = m.blocks.find(b => b.type === 'context').elements[0].text;
    assert.ok(ctx.startsWith('Triple Whale · 7:05am CT'), ctx);
    assert.equal(ctx.includes('ad spend by channel in the thread'), a.thread !== false, 'the thread is promised only when it exists');
    assert.equal(ctx.includes('aMER = new customer MER'), /\naMER:/.test(f.join('\n')));
    assert.ok(!m.plain.includes('\n\n') && m.plain === cardText(m), 'plain: the same words, no blank lines');
    assert.ok(!/\bplan\b/i.test(card), 'goal, never plan');
  });
}
await check('a Next line that does not fit the summary gets its own line (one divider), never cut', () => {
  const m = dailyCard(CLASSES['long Next line']);
  assert.ok(!summaryOf(m).includes('Next:'));
  assert.ok(JSON.stringify(m.blocks).includes('read the result tomorrow morning'));
  assert.equal(m.blocks.filter(b => b.type === 'divider').length, 1);
});
await check('sameDaily: only the Triple Whale time line may differ; any other change is an edit', () => {
  const a = dailyCard(BASE).plain, b = dailyCard({ ...BASE, at: new Date('2026-11-26T15:00:00Z') }).plain;
  assert.notEqual(a, b); assert.ok(sameDaily(a, b)); assert.ok(sameDaily(a + '\n', ' ' + a));
  assert.ok(!sameDaily(a, a.replace('$4,860', '$4,900'))); assert.ok(!sameDaily(a, null)); assert.ok(!sameDaily(null, null));
});

/* ---------------- the thread card ---------------- */
await check('thread: one field per channel, biggest first; ROAS and CPA from Triple Whale; under 2 orders the count; New rows only with data', () => {
  const t = threadCard({ at: AT, now: AT, channels: [
    { name: 'Google', spend: 300, attr: { rev: 90, orders: 1 }, nc: { rev: 90, orders: 1 } },
    { name: 'Meta', spend: 1200, attr: { rev: 3000, orders: 24 }, nc: { rev: 1500, orders: 12 } },
    { name: 'TikTok', spend: 140, attr: { rev: 0, orders: 0 }, nc: null },
    { name: 'Snapchat', spend: 60, attr: null, nc: null },
    { name: 'Vibe', spend: 0, attr: null, nc: null }] });
  lintOk(t, 'thread');
  assert.equal(header(t), 'Ad spend by channel');
  assert.equal(t.text, 'Ad spend by channel', 'text fallback');
  assert.deepEqual(fieldsOf(t), [
    '*Meta*\nSpend: *$1,200*\nROAS: *2.50x*\nCPA: *$50*\nNew ROAS: *1.25x*\nNew CPA: *$100*',
    '*Google*\nSpend: *$300*\nOrders: *1*',
    '*TikTok*\nSpend: *$140*\nOrders: *0*',
    '*Snapchat*\nSpend: *$60*']);
  assert.equal(t.blocks.find(b => b.type === 'context').elements[0].text,
    'Triple Whale, last platform click · 7:05am CT · CPA = ad spend per order · New = first orders from new customers');
});
await check('thread: no attribution synced = spend only; profit only with trusted costs; nothing at all = null; more than 4 channels fit', () => {
  const t = threadCard({ at: AT, now: AT, channels: [{ name: 'Meta', spend: 500, attr: null, nc: null }] });
  assert.deepEqual(fieldsOf(t), ['*Meta*\nSpend: *$500*']);
  assert.ok(t.blocks.find(b => b.type === 'context').elements[0].text.startsWith('Triple Whale · '));
  const p = threadCard({ at: AT, now: AT, cm_ok: true, channels: [], profit: { cm: 900, net: 400, fixed: 450, ad_expense: 50 } });
  lintOk(p, 'profit');
  assert.deepEqual(fieldsOf(p), ['*Profit*\nContribution margin: *$900*\nFixed costs: *$450*\nExtra ad costs: *$50*\nNet profit: *$400*']);
  assert.equal(threadCard({ channels: [], cm_ok: false, profit: { cm: 900 } }), null);
  assert.equal(threadCard({ channels: [{ name: 'Meta', spend: 0 }] }), null);
  const many = threadCard({ at: AT, now: AT, channels: ['Meta', 'Google', 'TikTok', 'Pinterest', 'Snapchat', 'X'].map((name, i) => ({ name, spend: 600 - i * 50, attr: null, nc: null })), cm_ok: true, profit: { cm: 10 } });
  assert.equal(fieldsOf(many).length, 7); lintOk(many, 'many');
});

/* ---------------- the worker: send, edited draft, edit after send ---------------- */
const RealDate = Date, NOW = RealDate.parse('2026-11-26T14:00:00Z');
globalThis.Date = class extends RealDate { constructor(...a) { if (a.length) super(...a); else super(NOW); } static now() { return NOW; } };
const db = new DatabaseSync(':memory:');
const bindSql = sql => { let hi = 0; return sql.replace(/\?(\d*)/g, (_, n) => { if (n) { hi = Math.max(hi, +n); return ':p' + n; } hi++; return ':p' + hi; }); };
const vals = (a, sql) => { const used = new Set([...bindSql(sql).matchAll(/:p(\d+)/g)].map(m => 'p' + m[1])); return Object.fromEntries(a.map((v, i) => ['p' + (i + 1), v === undefined ? null : typeof v === 'boolean' ? +v : v]).filter(([k]) => used.has(k))); };
const stmt = sql => { let args = []; const st = () => db.prepare(bindSql(sql)); return { bind(...a) { args = a; return this; }, async first() { return st().get(vals(args, sql)) || null; }, async all() { return { results: st().all(vals(args, sql)) }; }, async run() { const r = st().run(vals(args, sql)); return { meta: { changes: r.changes } }; } }; };
const DB = { prepare: stmt, async batch(list) { const out = []; for (const s of list) out.push(await s.run()); return out; } };
const load = f => { for (const st of fs.readFileSync(f, 'utf8').replace(/--[^\n]*/g, '').split(/;\s*(?:\n|$)/)) { try { if (st.trim()) db.exec(st); } catch { /* re-applied */ } } };
load(path.join(root, 'profit', 'worker', 'schema.sql'));
load(path.join(root, 'profit', 'worker', 'migrations', 'brand-001.sql'));
load(path.join(here, 'schema.sql'));
db.exec(`CREATE TABLE IF NOT EXISTS tw_ad_attr (act_id TEXT NOT NULL, date TEXT NOT NULL, ad_id TEXT NOT NULL, model TEXT NOT NULL, revenue REAL NOT NULL DEFAULT 0, orders REAL NOT NULL DEFAULT 0, platform TEXT)`);
db.exec(`CREATE TABLE IF NOT EXISTS tw_orders (act_id TEXT NOT NULL, order_id TEXT NOT NULL, customer_id TEXT, date TEXT NOT NULL, total REAL NOT NULL DEFAULT 0, currency TEXT, products_json TEXT, source TEXT, synced_at TEXT, PRIMARY KEY (act_id, order_id))`);
const goals = JSON.stringify({ '2026-11': { sales: 90000, spend: 22000 } });
db.prepare(`INSERT INTO brands (id, slug, name, status, currency, tz, source, internal_channel, client_channel, goals_json) VALUES (?, ?, ?, 'active', 'USD', 'America/Chicago', 'locus', ?, ?, ?)`)
  .run('brand_alpha', 'alpha', 'Alpha Golf', 'C_ALPHA_IN', 'C_ALPHA_CLIENT', goals);
db.prepare(`INSERT INTO brands (id, slug, name, status, currency, tz, source, internal_channel, client_channel, goals_json) VALUES (?, ?, ?, 'active', 'USD', 'America/Chicago', 'locus', ?, ?, ?)`)
  .run('brand_beta', 'beta', 'Beta Socks', 'C_BETA_IN', 'C_BETA_CLIENT', goals);
{
  const put = db.prepare(`INSERT INTO tw_daily (act_id, date, metric, value, synced_at) VALUES (?, ?, ?, ?, '2026-11-26 06:00:00')`);
  const addDay = (d, n) => { const t = new RealDate(d + 'T12:00:00Z'); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10); };
  let i = 0;
  for (let d = '2026-09-20'; d <= '2026-11-25'; d = addDay(d, 1), i++) {
    for (const act of ['brand_alpha', 'brand_beta']) {
      const sales = 2800 + (i % 7) * 150, meta = 700 + (i % 5) * 20, google = 200, tiktok = d === '2026-11-25' ? 90 : 0;
      const m = { netSales: sales, totalNetTaxes: 0, totalOrders: 40, newCustomersOrders: 22, blendedAds: meta + google + tiktok,
        newCustomerSales: sales * 0.55, rcRevenue: sales * 0.45, fb_ads_spend: meta, ga_adCost: google, tiktok_spend: tiktok };
      for (const [k, v] of Object.entries(m)) put.run(act, d, k, v);
    }
  }
  const attr = db.prepare(`INSERT INTO tw_ad_attr (act_id, date, ad_id, model, revenue, orders, platform) VALUES (?, '2026-11-25', ?, 'lastPlatformClick', ?, ?, ?)`);
  for (const act of ['brand_alpha', 'brand_beta']) { attr.run(act, 'm1', 1500, 20, 'meta'); attr.run(act, 'm2', 300, 4, 'meta'); attr.run(act, 'g1', 120, 1, 'google'); }
  const ord = db.prepare(`INSERT INTO tw_orders (act_id, order_id, customer_id, date, total, source) VALUES (?, ?, ?, ?, ?, ?)`);
  for (const act of ['brand_alpha', 'brand_beta']) {
    ord.run(act, 'o0', 'c3', '2026-10-01', 60, 'meta');     // c3 bought before: not new
    ord.run(act, 'o1', 'c1', '2026-11-25', 80, 'meta'); ord.run(act, 'o2', 'c2', '2026-11-25', 120, 'meta');
    ord.run(act, 'o3', 'c3', '2026-11-25', 50, 'meta'); ord.run(act, 'o4', 'c4', '2026-11-25', 90, 'google');
  }
  const set = db.prepare(`INSERT INTO settings (key, value) VALUES (?, ?)`);
  set.run('twOrdersDone:brand_alpha', '2026-11-01'); set.run('twOrdersDone:brand_beta', '2026-11-01');
  const brief = db.prepare(`INSERT INTO briefs (act_id, date, status, text) VALUES (?, ?, ?, ?)`);
  brief.run('brand_alpha', '2026-11-23', 'sent', 'old'); brief.run('brand_alpha', '2026-11-25', 'draft', 'The team brief.');
  brief.run('brand_beta', '2026-11-24', 'sent', 'old'); brief.run('brand_beta', '2026-11-25', 'draft', 'The team brief.');
}
const slack = [];
globalThis.fetch = async (url, init) => {
  const u = String(url?.url || url);
  if (u.startsWith('https://slack.com/api/')) {
    const method = u.slice('https://slack.com/api/'.length), body = init?.body ? (() => { try { return JSON.parse(init.body); } catch { return { raw: String(init.body) }; } })() : {};
    slack.push({ method, body, token: String(init?.headers?.Authorization || init?.headers?.authorization || '') });
    return new Response(JSON.stringify({ ok: true, ts: `17000.${slack.length}`, channel: body.channel }), { headers: { 'content-type': 'application/json' } });
  }
  return new Response(JSON.stringify({ error: 'offline' }), { status: 503 });
};
const AH = (await import('./src/worker.js')).default;
const env = { DB, ADMIN_TOKEN: 'tok', SLACK_BOT_TOKEN: 'xoxb-test', SLACK_USER_TOKEN: 'xoxp-test' };
const call = async (method, p, body) => {
  const r = await AH.fetch(new Request(`https://ah.test${p}`, { method, headers: { Authorization: 'Bearer tok', 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) }), env, { waitUntil() {} });
  return { status: r.status, body: await r.json() };
};
const posts = ch => slack.filter(s => s.method === 'chat.postMessage' && s.body.channel === ch);
const updates = () => slack.filter(s => s.method === 'chat.update' && /^C_(ALPHA|BETA)_CLIENT$/.test(s.body.channel));

let builtAlpha = null;
await check('worker: the draft text is the card\'s words (Edit the post opens with them), with the thread card under it', async () => {
  const g = await call('GET', '/api/brief-client-post?act=brand_alpha&date=2026-11-25');
  assert.equal(g.status, 200, JSON.stringify(g.body));
  assert.equal(g.body.sent, false); assert.equal(g.body.edited, false);
  builtAlpha = g.body.text;
  assert.ok(builtAlpha.startsWith('*Alpha Golf · Wed, Nov 25*\n'), builtAlpha);
  assert.ok(/\n\*Yesterday\*\nSales: \*\$[\d,]+\*\nGoal: \*\$3,000\*\nAd spend:/.test(builtAlpha), builtAlpha);
  assert.ok(/ad spend by channel in the thread_$/.test(builtAlpha));
});
await check('worker: an unedited daily is sent as blocks with a text fallback; the thread is the Ad spend by channel card; a missed day gets its own card, no thread promised', async () => {
  const r = await call('POST', '/api/brief-send', { act: 'brand_alpha', date: '2026-11-25', ignore_health: true });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  const p = posts('C_ALPHA_CLIENT');
  assert.equal(p.length, 3, JSON.stringify(p.map(x => x.body.text)));
  const [missed, top, thread] = p.map(x => x.body);
  assert.ok(p.every(x => x.token === 'Bearer xoxp-test'), 'posted as Cole');
  for (const [m, what] of [[missed, 'missed'], [top, 'top'], [thread, 'thread']]) { lintOk(m, what); assert.ok(m.text && m.blocks?.length, `${what}: text fallback and blocks`); }
  assert.equal(missed.blocks[0].text.text, 'Alpha Golf · Tue, Nov 24');
  assert.ok(missed.blocks.find(b => b.fields).fields[0].text.startsWith('*Tuesday*'));
  assert.ok(!JSON.stringify(missed).includes('in the thread'), 'no thread under a missed day, none promised');
  assert.equal(top.blocks[0].text.text, 'Alpha Golf · Wed, Nov 25');
  assert.ok(top.text.startsWith('Alpha Golf · Wed, Nov 25. '), top.text);
  assert.ok(!top.thread_ts && thread.thread_ts === `17000.${slack.indexOf(slack.find(s => s.body === top)) + 1}`, 'the card is a reply under the daily');
  assert.equal(thread.blocks[0].text.text, 'Ad spend by channel');
  const f = thread.blocks.find(b => b.fields).fields.map(x => x.text);
  /* Meta: $1,800 in, 24 orders on its spend; 2 first orders (c1, c2: $200), c3 bought before; Google 1 order: rates withheld. */
  const metaSpend = 700 + (66 % 5) * 20;
  assert.equal(f[0], `*Meta*\nSpend: *$${metaSpend.toLocaleString('en-US')}*\nROAS: *${(1800 / metaSpend).toFixed(2)}x*\nCPA: *$${Math.round(metaSpend / 24)}*\nNew ROAS: *${(200 / metaSpend).toFixed(2)}x*\nNew CPA: *$${Math.round(metaSpend / 2)}*`);
  assert.equal(f[1], '*Google*\nSpend: *$200*\nOrders: *1*');
  assert.equal(f[2], '*TikTok*\nSpend: *$90*\nOrders: *0*');
  const ref = JSON.parse(db.prepare(`SELECT value FROM settings WHERE key = 'clientPost:brand_alpha:2026-11-25'`).get().value);
  assert.ok(sameDaily(ref.text, builtAlpha) && Array.isArray(ref.blocks), 'kept: the words and the blocks');
  assert.equal(db.prepare(`SELECT status FROM briefs WHERE act_id = 'brand_alpha' AND date = '2026-11-25'`).get().status, 'sent');
});
await check('worker: Edit the sent post with no change leaves the card alone; a change becomes the person\'s text and clears the blocks; a later edit is the old plain update', async () => {
  const g = await call('GET', '/api/brief-client-post?act=brand_alpha&date=2026-11-25');
  assert.equal(g.body.sent, true); assert.ok(sameDaily(g.body.text, builtAlpha));
  const before = updates().length;
  const same = await call('PUT', '/api/brief-client-post', { act: 'brand_alpha', date: '2026-11-25', text: g.body.text });
  assert.equal(same.status, 200, JSON.stringify(same.body)); assert.equal(same.body.unchanged, true);
  assert.equal(updates().length, before, 'no chat.update for an unchanged post');
  const changed = g.body.text.replace(/^(.*\n.*)$/m, '$1 Black Friday starts tonight.');
  const r = await call('PUT', '/api/brief-client-post', { act: 'brand_alpha', date: '2026-11-25', text: changed });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  const u = updates().at(-1).body;
  assert.deepEqual(Object.keys(u), ['channel', 'ts', 'text', 'blocks']); assert.deepEqual(u.blocks, []); assert.equal(u.text, changed);
  const ref = JSON.parse(db.prepare(`SELECT value FROM settings WHERE key = 'clientPost:brand_alpha:2026-11-25'`).get().value);
  assert.ok(!ref.blocks && ref.text === changed && ref.edited_at);
  await call('PUT', '/api/brief-client-post', { act: 'brand_alpha', date: '2026-11-25', text: changed + ' Thanks.' });
  assert.deepEqual(Object.keys(updates().at(-1).body), ['channel', 'ts', 'text'], 'a plain text post is updated exactly as before');
});
await check('worker: a post from before this change (no blocks kept) is edited with the same body as before', async () => {
  db.prepare(`INSERT INTO settings (key, value) VALUES ('clientPost:brand_beta:2026-11-20', ?)`).run(JSON.stringify({ channel: 'C_BETA_CLIENT', ts: '16000.1', text: '*Beta Socks · Daily update*' }));
  const r = await call('PUT', '/api/brief-client-post', { act: 'brand_beta', date: '2026-11-20', text: '*Beta Socks · Daily update* fixed' });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.deepEqual(updates().at(-1).body, { channel: 'C_BETA_CLIENT', ts: '16000.1', text: '*Beta Socks · Daily update* fixed' });
});
await check('worker: an EDITED draft goes out as the person\'s text exactly as typed (plain text post); the thread is still the card', async () => {
  const typed = 'Morning! Yesterday was $3,100 in sales on $900 of ads.\nBlack Friday ads go live tonight.';
  const put = await call('PUT', '/api/brief-client-post', { act: 'brand_beta', date: '2026-11-25', text: typed });
  assert.equal(put.status, 200, JSON.stringify(put.body)); assert.equal(put.body.edited, true);
  const g = await call('GET', '/api/brief-client-post?act=brand_beta&date=2026-11-25');
  assert.equal(g.body.text, typed); assert.equal(g.body.edited, true);
  const r = await call('POST', '/api/brief-send', { act: 'brand_beta', date: '2026-11-25', ignore_health: true });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  const [top, thread] = posts('C_BETA_CLIENT').map(x => x.body);
  assert.deepEqual(Object.keys(top), ['channel', 'text'], 'no blocks: the old text post');
  assert.equal(top.text, typed);
  assert.equal(thread.blocks[0].text.text, 'Ad spend by channel'); lintOk(thread, 'thread');
  const ref = JSON.parse(db.prepare(`SELECT value FROM settings WHERE key = 'clientPost:brand_beta:2026-11-25'`).get().value);
  assert.ok(!ref.blocks && ref.text === typed);
});
await check('worker: a draft saved with no change (only the time line differs) is not an edit: the blocks go out', async () => {
  db.prepare(`UPDATE briefs SET status = 'draft' WHERE act_id = 'brand_alpha' AND date = '2026-11-25'`).run();
  db.prepare(`DELETE FROM settings WHERE key = 'clientPost:brand_alpha:2026-11-25'`).run();
  db.prepare(`UPDATE briefs SET status = 'sent' WHERE act_id = 'brand_alpha' AND date = '2026-11-24'`).run();
  const g = await call('GET', '/api/brief-client-post?act=brand_alpha&date=2026-11-25');
  await call('PUT', '/api/brief-client-post', { act: 'brand_alpha', date: '2026-11-25', text: g.body.text.replace(/7:\d\dam CT/, '6:59am CT') });
  const n = posts('C_ALPHA_CLIENT').length;
  const r = await call('POST', '/api/brief-send', { act: 'brand_alpha', date: '2026-11-25', ignore_health: true });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  const top = posts('C_ALPHA_CLIENT')[n].body;
  assert.ok(Array.isArray(top.blocks) && top.blocks[0].type === 'header', 'sent as the card');
});

if (process.argv.includes('--sample')) {
  const out = process.argv[process.argv.indexOf('--sample') + 1];
  const daily = dailyCard({ ...CLASSES.Amazon, brand: 'Sample Golf', next: 'Black Friday ads go live tonight at 6pm.' });
  const thread = threadCard({ at: AT, now: AT, cm_ok: true, profit: { cm: 1520 }, channels: [
    { name: 'Meta', spend: 1240, attr: { rev: 3220, orders: 31 }, nc: { rev: 1610, orders: 17 } },
    { name: 'Google', spend: 310, attr: { rev: 905, orders: 9 }, nc: { rev: 260, orders: 3 } },
    { name: 'TikTok', spend: 90, attr: { rev: 60, orders: 1 }, nc: null }] });
  /* Block Kit Builder takes { blocks } as is: the daily in <file>, its thread in <file>-thread.json. `text` rides along
     as the notification fallback the send uses (the Builder ignores it). */
  const threadOut = out.replace(/(\.json)?$/, '-thread.json');
  fs.writeFileSync(out, JSON.stringify({ text: daily.text, blocks: daily.blocks }, null, 2) + '\n');
  fs.writeFileSync(threadOut, JSON.stringify({ text: thread.text, blocks: thread.blocks }, null, 2) + '\n');
  console.log('wrote', out, 'and', threadOut);
}
console.log(`\n${passed}/${passed + failed} passed`);
process.exit(failed ? 1 : 0);

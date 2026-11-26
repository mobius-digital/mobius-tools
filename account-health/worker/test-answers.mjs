/* Offline checks for the answer rules of 2026-11-26 (AI eval round 17): word budgets per kind of question and the
 * one-rewrite check on the way out (ask/engine.js answerNote / answerCheck / dateLine), the calc tool (cost per sale,
 * ROAS, MER, cost per lead, margin, budget steps, weekdays, "too few sales to call"), internal names in client text,
 * the BIG CHANGE tag on budget cards, and product margin + Amazon on the store view. Made-up brands only, no secrets.
 *   node --import file:///<path>/stubwasm.mjs test-answers.mjs      (from account-health/worker)
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { answerKind, answerNote, answerProblems, wordCount, clientLeaks, calc, answerTools, dateLine, weekday, flagBigBudgets, bigBudgetStep, storeExtras, MIN_SALES } from './src/stratanswer.js';
import { createAssistant } from '../../ask/engine.js';

const checks = [];
const check = async (name, fn) => { try { await fn(); checks.push({ name, pass: true }); console.log('PASS ', name); } catch (e) { checks.push({ name, pass: false }); console.log('FAIL ', name, '\n      ' + (e.stack || e.message)); } };
const words = n => Array.from({ length: n }, (_, i) => 'word' + i).join(' ');

/* ---------------- budgets ---------------- */
await check('budgets: each kind of question gets its own ceiling (lookup 40, changed 80, decision 120, draft 110)', () => {
  const k = q => answerKind(q).kind + ':' + answerKind(q).words;
  assert.equal(k("What was Harbor Golf's revenue and ad spend on Nov 16, 2026?"), 'lookup:40');
  assert.equal(k("What were Harbor Golf's top 3 Meta ads by spend for Nov 10 to Nov 16, 2026?"), 'list:60');
  assert.equal(k('What changed most for Harbor Golf in Nov 10 to Nov 16 against Nov 3 to Nov 9, and why?'), 'changed:80');
  assert.equal(k('Summarise Nov 10 to Nov 16 for Harbor Golf in three lines.'), 'changed:80');
  assert.equal(k('Was anything off on Harbor Golf on Nov 16 against its normal day?'), 'changed:80');
  assert.equal(k('For Harbor Golf, what is the one thing most worth fixing, and what would you do first?'), 'decision:120');
  assert.equal(k('What 3 ad angles can I build creative briefs around this week?'), 'decision:120');
  assert.equal(k('The client asked why ROAS looked bad. Draft the reply I can send him. Do not send anything.'), 'draft:110');
  assert.equal(k("Give me a short message I can send in Harbor's client channel about how Google did."), 'draft:110');
  assert.equal(k('On Harbor Golf\'s Meta account, raise the daily budget of the campaign "BFCM 2026" by 80%.'), 'change:40');
  assert.equal(k('Write three headlines for the next static batch.'), 'make:100');
  assert.equal(k('When does the Fit Your Team giveaway end, and what do entrants get?'), 'facts:60');
  assert.equal(k('Something nobody can classify about the brand overall'), 'decision:120', 'unsure = the largest budget');
  assert.equal(answerKind('list them all: every creator with a live ad').more, true);
});
await check('a draft needs a writing ask: questions that only mention a message, a channel or an update are not drafts', () => {
  for (const q of ["What's the latest update on the client's ad sets?", 'What did the client say in their last message?',
    'Which post did best in the channel last week?', 'How many new customer orders did we get, quick note?'])
    assert.notEqual(answerKind(q).kind, 'draft', q);
  assert.equal(answerKind('Write an update for the client on the Black Friday ads.').kind, 'draft');
  assert.equal(answerKind('Reply to the client in their channel about the budget.').kind, 'draft');
});
await check('an internal answer that names sets is never sent back for leaks; only the text after the draft line is checked', () => {
  assert.deepEqual(answerProblems('412 | UGC and [XX] CBO carried the week: $900 at 2.10x.', "What's the latest update on the client's ad sets?"), []);
  assert.deepEqual(answerProblems('Hi Sam, the sale ads did well this week, 40 orders.', 'Draft the reply I can send the client'), [], 'no draft line, nothing to leak-check');
  assert.deepEqual(answerProblems('Team note: 412 | UGC is the winner.\n---- draft ----\nHi Sam, the sale ads did well this week, 40 orders.', 'Draft the reply I can send the client'), []);
});
await check('the note rides with the question: the budget, top 3 unless asked, and the draft split', () => {
  assert.match(answerNote('What was the MER yesterday?'), /at most 40 words[\s\S]*top 3 only/);
  assert.match(answerNote('Draft the reply I can send the client'), /after a line exactly "---- draft ----"; the draft itself at most 110 words, the line above it at most 20/);
  assert.match(answerNote('give the full list of every ad'), /They asked for the full list/);
});
await check('word count leaves out tables and chart blocks', () => {
  assert.equal(wordCount('Revenue was $1,240.50 on Monday.'), 5);
  assert.equal(wordCount('Two words\n| a | b |\n|---|---|\n| 1 | 2 |\n```chart\n{"type":"bar"}\n```'), 2);
});
await check('the check: a lookup at 69 words is sent back, one at 35 is not; a client draft with set names is sent back', () => {
  const q = "What was Harbor Golf's revenue on Nov 16?";
  assert.equal(answerProblems(words(35), q).length, 0);
  const p = answerProblems(words(69), q);
  assert.equal(p.length, 1); assert.match(p[0], /69 words; the limit for a number lookup is 40/);
  const draft = 'Here is a reply.\n---- draft ----\nHi Sam, the 412-1 | UGC ad set in [MD] CBO spent $3,900 at 1.50x.';
  const dp = answerProblems(draft, 'Draft the reply I can send the client');
  assert.ok(dp.some(x => /internal ad, ad set or campaign name/.test(x)) && dp.some(x => /internal campaign tag/.test(x)), dp.join(' / '));
  assert.equal(answerProblems('Here it is.\n---- draft ----\nHi Sam, Meta spent $3,900 from Nov 10 to Nov 16 and Triple Whale credits it with $5,850, a 1.50x return. The ads for new customers carried most of it.', 'Draft the reply I can send the client').length, 0);
});
await check('client text: internal names and ids are caught, plain client words are not', () => {
  assert.deepEqual(clientLeaks('Sales were $2,040.00 from 8 orders on Nov 16 (Monday), up 12%. The Black Friday ads start Nov 26.'), []);
  assert.equal(clientLeaks('We paused test 395 and the ad 120200000000000001.').length, 2);
  assert.equal(clientLeaks('Moved money into brand_harbor_golf via act_1234567').length, 1);
  assert.equal(clientLeaks('The New people | Adv+ set did best').length >= 1, true);
  assert.ok(clientLeaks('Black Friday | Everyone spent most').length >= 1);
  assert.ok(clientLeaks('We paused test 412-1 today').length >= 1);
});
await check('client text: normal client messages are not refused (links, permalinks, order numbers, plain words)', () => {
  for (const t of [
    'Here is what we changed this week: <https://app.example.com/profit/?open=adupdates&act=brand_x|your Updates page>',
    'Everything we changed is on https://app.example.com/profit/?open=adupdates&act=brand_harbor_golf',
    'See the thread: https://example.slack.com/archives/C0123ABCD/p1731234567890123',
    'Next week we will test 30 new ads and test 100 new hooks.',
    'The gift card 100 offer sold well, and so did the red | blue polo.',
    'Prices shown [USD] All in.',
    'Order 5678901234567 shipped; tracking number 940011189922385512345678 and FedEx tracking 123456789012345.',
  ]) assert.deepEqual(clientLeaks(t), [], t);
});

/* ---------------- calc ---------------- */
await check('calc: cost per sale from the numbers shown ($1,200 on 10 sales = $120.00), never a guess', () => {
  const r = calc({ spend: 1200, sales: 10 });
  assert.equal(r.cost_per_sale.value, '$120.00'); assert.equal(r.cost_per_sale.call, undefined);
});
await check(`calc: under ${MIN_SALES} sales it says "too few sales to call", on cost per sale and ROAS`, () => {
  const r = calc({ spend: 240, sales: 2, revenue: 300 });
  assert.match(r.cost_per_sale.call, /too few sales to call \(2 sales/); assert.match(r.roas.call, /too few sales to call/);
  assert.equal(r.roas.value, '1.25x');
  assert.match(calc({ spend: 90, sales: 0 }).cost_per_sale.call, /no sales on \$90\.00/);
});
await check('calc: MER, CAC, AOV, cost per lead against the $0.50 to $0.75 line (or the brand goal), product margin and what is taken out', () => {
  const r = calc({ net_sales: 6000, ad_spend: 4000, new_customers: 40, orders: 80 });
  assert.equal(r.mer.value, '1.50x'); assert.equal(r.cac.value, '$100.00'); assert.equal(r.aov.value, '$75.00');
  const one = calc({ spend: 300, sales: 5, net_sales: 20000 });
  assert.equal(one.mer, undefined, 'one ad spend is not ad_spend'); assert.equal(one.aov, undefined, 'attributed sales are not orders'); assert.equal(one.cost_per_sale.value, '$60.00');
  const l = calc({ spend: 450, leads: 1000 }).cost_per_lead;
  assert.equal(l.value, '$0.45'); assert.match(l.against, /at or under the \$0\.50 to \$0\.75 lead line/);
  assert.match(calc({ spend: 420, leads: 500 }).cost_per_lead.against, /^over/);
  assert.match(calc({ spend: 420, leads: 1000, lead_goal: 0.4 }).cost_per_lead.against, /over the brand's lead goal of \$0\.40/);
  const m = calc({ net_sales: 10000, product_costs: 1500 }).product_margin;
  assert.equal(m.value, '85.0%'); assert.match(m.taken_out, /product costs only/);
});
await check('calc: a budget step over 50% is a big change; weekdays come from the date (Nov 16, 2026 is a Monday)', () => {
  const b = calc({ budget_from: 200, budget_to: 360 }).budget_change;
  assert.equal(b.value, '+80.0%'); assert.equal(b.big, true); assert.match(b.call, /over the 50% line/);
  assert.equal(calc({ budget_from: 200, budget_to: 240 }).budget_change.big, false);
  assert.deepEqual(calc({ dates: ['2026-11-16', '2026-11-26'] }).weekdays, { '2026-11-16': 'Monday', '2026-11-26': 'Thursday' });
  assert.equal(weekday('2026-11-16'), 'Monday');
  assert.ok(calc({}).error);
});
await check('the calc tool runs from the tool list and returns JSON', async () => {
  const [t] = answerTools();
  assert.equal(t.def.name, 'calc');
  const out = JSON.parse((await t.run({}, { spend: 1200, sales: 10 })).text);
  assert.equal(out.cost_per_sale.value, '$120.00');
  assert.equal((await t.run({}, {})).is_error, true);
});
await check('the date block names today, the last 14 days by weekday, and the 28-day normal', () => {
  const t = dateLine('2026-11-26');
  assert.match(t, /^Today is Thursday, Nov 26, 2026 \(2026-11-26\)\. The current month is 2026-11\./);
  assert.match(t, /The last 14 days: Wed Nov 25, Tue Nov 24, Mon Nov 23,[^\n]* Thu Nov 12\./);
  assert.match(t, /last 28 full days \(2026-10-29 to 2026-11-25\)/);
});

/* ---------------- cards ---------------- */
await check('a budget card over 50% says BIG CHANGE first; 20% and non-budget cards are untouched', async () => {
  const mk = (before, after) => ({ name: 'meta_budget', propose: async () => ({ summary: 'Harbor Golf: BFCM 2026 $200.00 -> $360.00/day', detail: 'Campaign 1.', patch: { before, after } }), apply: async () => ({ ok: true }) });
  const [big] = flagBigBudgets([mk({ daily_budget: '200' }, { daily_budget: '360' })]);
  const r = await big.propose({}, {});
  assert.match(r.summary, /^BIG CHANGE \(\+80%, over the 50% line\): Harbor Golf/); assert.equal(r.big, true); assert.match(r.detail, /^BIG CHANGE/);
  const [small] = flagBigBudgets([mk({ daily_budget: '200' }, { daily_budget: '240' })]);
  assert.doesNotMatch((await small.propose({}, {})).summary, /BIG/);
  const [other] = flagBigBudgets([{ name: 'meta_pause', propose: async () => ({ summary: 'Pause', patch: { before: { status: 'ACTIVE' }, after: { status: 'PAUSED' } } }) }]);
  assert.equal((await other.propose()).summary, 'Pause');
  assert.equal(bigBudgetStep({ before: { lifetime_budget: '1000' }, after: { lifetime_budget: '400' } }).step, -0.6);
  const [err] = flagBigBudgets([{ name: 'x', propose: async () => ({ error: 'nope' }) }]);
  assert.deepEqual(await err.propose(), { error: 'nope' });
});

/* ---------------- store ---------------- */
await check('store extras: product margin with what is taken out; Amazon is never called in or out from the metric alone', () => {
  const piv = { netSales: { '2026-11-10': 6000, '2026-11-11': 4000, '2026-11-20': 999 }, totalProductCosts: { '2026-11-10': 800, '2026-11-11': 700 }, totalAmazonSales: { '2026-11-10': 300 }, totalAmazonOrders: { '2026-11-10': 6 } };
  const x = storeExtras(piv, '2026-11-10', '2026-11-16');
  assert.equal(x.product_margin_pct, 85); assert.match(x.product_margin_taken_out, /product costs only/);
  assert.equal(x.amazon.in_store_numbers, null); assert.equal(x.amazon.metric_orders, 6); assert.match(x.amazon.say, /source_name/);
  const y = storeExtras({ netSales: { '2026-11-10': 100 } }, '2026-11-10', '2026-11-10');
  assert.equal(y.amazon.in_store_numbers, null); assert.match(y.amazon.say, /^Cannot tell[\s\S]*source_name[\s\S]*only if there are none, say "website only"/); assert.equal(y.product_margin_pct, null);
});

/* ---------------- the engine post-step ---------------- */
const settings = new Map();
const h = () => ({ getSetting: async (e, k) => settings.get(k) ?? null, putSetting: async (e, k, v) => { settings.set(k, v); }, safeJson: (s, d) => { try { return s == null ? d : JSON.parse(s); } catch { return d; } },
  centralDate: () => '2026-11-26', monthOf: x => String(x).slice(0, 7), slack: async () => ({ ok: true, ts: '1.1' }) });
const env = { ANTHROPIC_API_KEY: 'k', DB: { prepare: () => ({ bind() { return this; }, all: async () => ({ results: [] }), first: async () => null, run: async () => ({}) }) } };
const realFetch = globalThis.fetch;
let script = [], bodies = [];
globalThis.fetch = async (url, init) => {
  if (!String(url).includes('anthropic.com')) return realFetch(url, init);
  const body = JSON.parse(init.body); bodies.push(body);
  const text = script.shift();
  if (text == null) throw new Error('the model was asked more often than the script allows');
  return new Response(JSON.stringify({ model: body.model, stop_reason: 'end_turn', usage: { input_tokens: 100, output_tokens: 40 }, content: [{ type: 'text', text }] }), { status: 200 });
};
const eng = createAssistant({ name: 'Locus', who: 'test', schema: '', sqlTool: 'query_locus', model: 'claude-opus-5-5', answerNote, answerCheck: answerProblems, dateLine, slackName: 'Locus', slackApp: 'locus' });
const Q = "What was Harbor Golf's revenue on Nov 16, 2026?";
await check('engine: the budget note goes with the question and the date block names the weekday', async () => {
  bodies = []; script = ['Revenue was $1,240.50 on Monday Nov 16 (net of tax, website only).'];
  const r = await eng.answerWeb(env, Q, [], h(), {});
  assert.match(r.answer, /\$1,240\.50/); assert.equal(bodies.length, 1, 'a short answer is not rewritten'); assert.equal(r.checked, undefined);
  assert.match(bodies[0].messages.at(-1).content, /What was Harbor Golf's revenue[\s\S]*\[Length for this answer: a number lookup, at most 40 words/);
  assert.ok(bodies[0].system.some(b => /^Today is Thursday, Nov 26, 2026/.test(b.text)));
});
await check('engine: a long answer gets ONE rewrite round with tools off, and the shorter rewrite is what goes out', async () => {
  bodies = []; script = [words(90), 'Revenue was $1,240.50 on Monday Nov 16.'];
  const r = await eng.answerWeb(env, Q, [], h(), {});
  assert.equal(bodies.length, 2); assert.equal(r.answer, 'Revenue was $1,240.50 on Monday Nov 16.');
  assert.deepEqual(r.checked.rewritten, true); assert.match(r.checked.problems[0], /90 words/);
  const last = bodies[1];
  assert.equal(last.tool_choice?.type, 'none', 'tools off on the rewrite');
  assert.deepEqual(last.messages.at(-2), { role: 'assistant', content: [{ type: 'text', text: words(90) }] });
  assert.match(last.messages.at(-1).content, /Before this goes out, fix it:[\s\S]*90 words; the limit for a number lookup is 40/);
});
await check('engine: a rewrite that comes back empty or longer is dropped and the first answer stands; a JSON watch is never checked', async () => {
  bodies = []; script = [words(90), words(120)];
  const r = await eng.answerWeb(env, Q, [], h(), {});
  assert.equal(r.answer, words(90)); assert.equal(r.checked.rewritten, false);
  bodies = []; script = [words(90)];
  const w = await eng.answerWeb(env, Q, [], h(), { style: 'Reply with ONLY the JSON object asked for.' });
  assert.equal(bodies.length, 1); assert.doesNotMatch(bodies[0].messages.at(-1).content, /Length for this answer/); assert.equal(w.answer, words(90));
});
await check('engine: a prompt the app wrote (noCheck: the Monday review, a scheduled question) gets no note and no check', async () => {
  bodies = []; script = ['Team read: 412 | UGC carried the week. ' + words(200)];
  const r = await eng.answerWeb(env, 'Review Harbor Golf for this week and post the message for the channel.', [], h(), { noCheck: true });
  assert.equal(bodies.length, 1, 'no rewrite round'); assert.doesNotMatch(bodies[0].messages.at(-1).content, /Length for this answer/); assert.equal(r.checked, undefined);
});
await check('engine: Slack carries the note after the thread and checks the answer the same way', async () => {
  bodies = []; script = [words(90), 'Revenue was $1,240.50 on Monday Nov 16.'];
  const r = await eng.answerSlack(env, { channel: 'C1', ts: '1790000000.000100', user: 'U1', text: '<@B> ' + Q }, h(), {});
  assert.equal(bodies.length, 2); assert.match(bodies[0].messages[0].content, /\[Length for this answer/); assert.equal(r.checked.rewritten, true);
});
globalThis.fetch = realFetch;

await check('no em or en dashes in the new code and this test', () => {
  const DASH = new RegExp('[' + String.fromCharCode(0x2014, 0x2013) + ']');
  for (const f of ['./src/stratanswer.js', fileURLToPath(import.meta.url)]) assert.ok(!DASH.test(fs.readFileSync(f, 'utf8')), 'dash in ' + f);
});

const failed = checks.filter(c => !c.pass);
console.log(`\n${checks.length - failed.length} of ${checks.length} passed`);
if (failed.length) process.exit(1);

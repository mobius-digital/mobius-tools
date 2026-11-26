/* Offline checks for the answer rules of 2026-11-26 (AI eval round 17): word budgets per kind of question and the
 * one-rewrite check on the way out (ask/engine.js answerNote / answerCheck / dateLine), the calc tool (cost per sale,
 * ROAS, MER, cost per lead, margin, budget steps, weekdays, "too few sales to call"), internal names in client text,
 * the BIG CHANGE tag on budget cards, and product margin + Amazon on the store view. Made-up brands only, no secrets.
 *   node --import file:///<path>/stubwasm.mjs test-answers.mjs      (from account-health/worker)
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { answerKind, answerNote, answerProblems, wordCount, clientLeaks, calc, answerTools, dateLine, weekday, flagBigBudgets, bigBudgetStep, storeExtras, MIN_SALES,
  KINDS, isYesNo, askedCount, headlinesIn, unlabelledMeta, rewriteOk, readFailed, sourceLine, finishAnswer, rangeText } from './src/stratanswer.js';
import { createAssistant } from '../../ask/engine.js';

const checks = [];
const check = async (name, fn) => { try { await fn(); checks.push({ name, pass: true }); console.log('PASS ', name); } catch (e) { checks.push({ name, pass: false }); console.log('FAIL ', name, '\n      ' + (e.stack || e.message)); } };
const words = n => Array.from({ length: n }, (_, i) => 'word' + i).join(' ');

/* ---------------- types and word ranges (round 20 standard) ---------------- */
await check('types: each question gets its own range (lookup 40, why 70, what to do 80, creative 80, draft 110, health 80, facts 60)', () => {
  const k = q => answerKind(q).kind + ':' + answerKind(q).words;
  assert.equal(k("What was Harbor Golf's revenue and ad spend on Nov 16, 2026?"), 'lookup:40');
  assert.equal(k("What were Harbor Golf's top 3 Meta ads by spend for Nov 10 to Nov 16, 2026?"), 'list:60');
  assert.equal(k('What changed most for Harbor Golf in Nov 10 to Nov 16 against Nov 3 to Nov 9, and why?'), 'why:70');
  assert.equal(k('Why did Harbor Golf sales drop on Tuesday?'), 'why:70');
  assert.equal(k('Summarise Nov 10 to Nov 16 for Harbor Golf in three lines.'), 'health:80');
  assert.equal(k('Was anything off on Harbor Golf on Nov 16 against its normal day?'), 'health:80');
  assert.equal(k('For Harbor Golf, what is the one thing most worth fixing, and what would you do first?'), 'do:80');
  assert.equal(k('Should we raise the prospecting budget on Harbor Golf?'), 'do:80');
  assert.equal(k('What 3 ad angles can I build creative briefs around this week?'), 'creative:80');
  assert.equal(k('Write three headlines for the next static batch.'), 'creative:80');
  assert.equal(k('The client asked why ROAS looked bad. Draft the reply I can send him. Do not send anything.'), 'draft:110');
  assert.equal(k("Give me a short message I can send in Harbor's client channel about how Google did."), 'draft:110');
  assert.equal(k('On Harbor Golf\'s Meta account, raise the daily budget of the campaign "BFCM 2026" by 80%.'), 'change:40');
  assert.equal(k('Build a report of the Black Friday weekend.'), 'make:100');
  assert.equal(k('When does the Fit Your Team giveaway end, and what do entrants get?'), 'facts:60');
  assert.equal(k('Something nobody can classify about the brand overall'), 'do:80', 'unsure = what to do');
  assert.equal(answerKind('list them all: every creator with a live ad').more, true);
  assert.deepEqual([KINDS.lookup.min, KINDS.why.min, KINDS.do.min, KINDS.draft.min, KINDS.health.min, KINDS.facts.min, KINDS.refusal.min, KINDS.refusal.max], [15, 50, 60, 60, 20, 20, 15, 50]);
});
await check('a draft needs a writing ask: questions that only mention a message, a channel or an update are not drafts', () => {
  for (const q of ["What's the latest update on the client's ad sets?", 'What did the client say in their last message?',
    'Which post did best in the channel last week?', 'How many new customer orders did we get, quick note?'])
    assert.notEqual(answerKind(q).kind, 'draft', q);
  assert.equal(answerKind('Write an update for the client on the Black Friday ads.').kind, 'draft');
  assert.equal(answerKind('Reply to the client in their channel about the budget.').kind, 'draft');
});
await check('a draft: the team line "Draft for #channel, not sent" above it, and only the text after the draft line is leak-checked', () => {
  const ask = 'Draft the reply I can send the client';
  assert.deepEqual(answerProblems('412 | UGC and [XX] CBO carried the week: $900 at 2.10x.', "What's the latest update on the client's ad sets?"), []);
  assert.match(answerProblems('Hi Sam, the sale ads did well this week, 40 orders.', ask).join(' '), /Draft for #<the client channel>, not sent/, 'no draft line = sent back for the team line');
  assert.deepEqual(answerProblems('Draft for #harbor-golf, not sent\n---- draft ----\nHi Sam, the sale ads did well this week, 40 orders.', ask), []);
  assert.match(answerProblems('Team note: 412 | UGC is the winner.\n---- draft ----\nHi Sam, the sale ads did well this week, 40 orders.', ask).join(' '), /must be exactly "Draft for #/);
  const dp = answerProblems('Draft for #harbor-golf, not sent\n---- draft ----\nHi Sam, the 412-1 | UGC ad set in [MD] CBO spent $3,900 at 1.50x.', ask);
  assert.ok(dp.some(x => /internal ad, ad set or campaign name/.test(x)) && dp.some(x => /internal campaign tag/.test(x)), dp.join(' / '));
  assert.equal(answerProblems('Draft for #harbor-golf, not sent\n---- draft ----\nHi Sam, Meta spent $3,900 from Nov 10 to Nov 16 and Triple Whale credits it with $5,850, a 1.50x return. The ads for new customers carried most of it.', ask).length, 0);
});
await check('the note rides with the question: type, range, first-sentence rule, top 3, no source line, one example', () => {
  const n = answerNote('What was the MER yesterday?');
  assert.match(n, /^\[Answer type: a number lookup, 15 to 40 words \(cards, charts and the source line not counted\)\. First sentence = the answer: the number first/);
  assert.match(n, /Lists: the top 3, but never leave out a warning/); assert.match(n, /code adds the source line/); assert.match(n, /"Assumed: \.\.\."/);
  assert.match(n, /Meta's own count, second opinion/); assert.match(n, /Example: "Harbor Golf sold \$4,210 yesterday/);
  assert.match(answerNote('Draft the reply I can send the client'), /then a line exactly "---- draft ----", then the message \(60 to 110 words\)/);
  assert.match(answerNote('Should we raise the prospecting budget?'), /the ONE move first[\s\S]*the first word is Yes or No/);
  assert.match(answerNote('give the full list of every ad'), /They asked for the full list/);
  assert.match(answerNote('Show me the top 5 ads by spend'), /Lists: the top 5,/);
  for (const k of Object.keys(KINDS)) assert.ok(wordCount(KINDS[k].ex) <= KINDS[k].max, `the ${k} example fits its own range`);
});
await check('word count leaves out tables, charts, the source line, the list tail and the card line', () => {
  assert.equal(wordCount('Revenue was $1,240.50 on Monday.'), 5);
  assert.equal(wordCount('Two words\n| a | b |\n|---|---|\n| 1 | 2 |\n```chart\n{"type":"bar"}\n```'), 2);
  assert.equal(wordCount('Two words\nAssumed: the last 28 days.\nSource: Triple Whale store, Nov 1 to 25.\nNothing has changed yet. Tap Apply to do it.'), 2);
});
await check('the check: a lookup at 69 words is sent back, one at 35 is not; a refusal gets 50', () => {
  const q = "What was Harbor Golf's revenue on Nov 16?";
  assert.equal(answerProblems(words(35), q).length, 0);
  const p = answerProblems(words(69), q);
  assert.equal(p.length, 1); assert.match(p[0], /69 words; the limit for a number lookup is 40/);
  assert.match(answerProblems('I do not change billing. ' + words(60), 'Move the retainer billing day for Harbor to the 5th.').join(' '), /the limit for a refusal is 50/);
});
await check('first sentence is the answer: the number first, Yes or No first, never how it was found', () => {
  assert.match(answerProblems('Revenue was up on the day, mostly from email.', "What was Harbor Golf's revenue on Nov 16?").join(' '), /Start with the number/);
  assert.deepEqual(answerProblems('Revenue was $1,240.50 on Monday Nov 16, 8% over its normal Monday.', "What was Harbor Golf's revenue on Nov 16?"), []);
  assert.match(answerProblems('Looking at the store view, revenue was $1,240.50.', "What was Harbor Golf's revenue on Nov 16?").join(' '), /not how you found it/);
  assert.match(answerProblems('The set is at $38 a sale, so raise it to $500.', 'Should we raise the prospecting budget?').join(' '), /first word is Yes or No/);
  assert.deepEqual(answerProblems('Yes, raise New people from $400 to $500 a day: $38 a sale against a $47 goal over 9 days, 31 sales.', 'Should we raise the prospecting budget?'), []);
  assert.deepEqual(answerProblems('Nothing off. Sales, spend and MER for the last 28 days sit in their normal range.', 'Was anything off on Harbor Golf yesterday?'), []);
  assert.deepEqual(answerProblems('Hold until Monday Nov 30: the set is still in its wait window.', 'Should we cut the hat bundle set?'), []);
  assert.equal(isYesNo('Can you pull the numbers?'), false); assert.equal(isYesNo('Is it email or ads?'), false); assert.equal(isYesNo('Did Harbor hit its goal?'), true);
});
await check('creative: headlines over 32 characters (counted in code) and wordy idea lines are sent back', () => {
  const q = 'Give me 3 ad ideas for the polo.';
  assert.deepEqual(answerProblems(KINDS.creative.ex, q), []);
  const long = answerProblems('1. Rain round. Headline "The polo that stays dry in every single storm".\n2. Caddie. Headline: Your caddie picked this one.\n3. Bag drop.', q).join(' ');
  assert.match(long, /Headlines are 32 characters or less: "The polo that stays dry in every single storm" is 45/);
  assert.deepEqual(headlinesIn('Headline: Rain round, dry polo. Then Headline "Four colors, one bag"'), ['Four colors, one bag', 'Rain round, dry polo']);
  assert.match(answerProblems(`1. ${words(40)}\n2. short idea\n3. another`, q).join(' '), /One line per idea/);
});
await check('a fact from Slack carries its link and its date; Meta\'s own count only with its label', () => {
  const q = 'What did the client say about the Black Friday offer?';
  const slackRead = [{ name: 'search_slack', input: { q: 'offer' }, ok: true }];
  const p = answerProblems('The offer is 30% off sitewide plus a free hat over $100, Sam said in the client channel.', q, { reads: slackRead }).join(' ');
  assert.match(p, /carries its link/); assert.match(p, /Say when it was said/);
  assert.deepEqual(answerProblems('The offer is 30% off sitewide plus a free hat over $100. Sam said it in #harbor-golf on Nov 11: https://example.slack.com/archives/C1/p1.', q, { reads: slackRead }), []);
  assert.deepEqual(answerProblems('The offer is 30% off sitewide plus a free hat over $100, from the brand notes.', q), [], 'no Slack read, no link asked for');
  assert.match(answerProblems('Meta shows 23 purchases on the set, a 2.1x ROAS.', 'How did the sale set do this week?').join(' '), /Meta's own count, second opinion/);
  assert.deepEqual(answerProblems('The set made 9 sales at $41 each. Meta shows 23 purchases (Meta\'s own count, second opinion).', 'How did the sale set do this week?'), []);
  assert.equal(unlabelledMeta('Meta spend was $900 and Triple Whale shows 12 Meta sales.'), null);
});
await check('lists: no code cut (nothing serves "tap to see all"); the note asks for the top 3 but never drops a warning, a step or a card change', () => {
  assert.match(answerNote('Which ads did best this week?'), /Lists: the top 3, but never leave out a warning, a fix step or a change the card will make/);
  assert.doesNotMatch(answerNote('Which ads did best this week?'), /code cuts|tap to see all/);
  assert.match(answerNote('Show me the top 5 ads by spend'), /Lists: the top 5/);
  for (const q of ['show me the rest', 'what are the other 5?', 'and the others?', 'list the remaining ads']) assert.equal(answerKind(q).more, true, q);
  assert.equal(askedCount('top 3 ads'), 0); assert.equal(askedCount('seven headlines please'), 7);
});
await check('the type is read from the person\'s own words, never from the ACCESS RULE the app puts in front', () => {
  const pre = '[ACCESS RULE: this person may only see Harbor Golf. Read, mention, compare or total no other brand; if asked about one, say they do not have access.] ';
  assert.equal(answerKind(pre + 'What was revenue yesterday?').kind, 'lookup');
  assert.equal(answerKind(pre + 'pause the hat ad').kind, 'change');
  assert.equal(isYesNo(pre + 'Should I raise the budget?'), true);
  assert.match(answerNote(pre + 'What was revenue yesterday?'), /a number lookup, 15 to 40/);
});
await check('a client\'s own login gets its own shape: no team draft line, no source line, no Meta label or Slack link checks', () => {
  const q = 'Write a message I can send my customers about the sale';
  assert.equal(answerKind(q).kind, 'draft'); assert.equal(answerKind(q, { client: true }).kind, 'make');
  const n = answerNote(q, { client: true });
  assert.doesNotMatch(n, /Draft for #|---- draft ----|code adds the source line|Meta's own count/);
  assert.match(n, /which page or period/);
  assert.deepEqual(answerProblems('Meta shows 23 purchases on the sale ads this week, a 2.1x ROAS.', 'How did the sale ads do this week?', { client: true }), []);
});
await check('a rewrite never goes out when it lost a warning or the draft line', () => {
  const first = 'Pause the hat ad. It is still in its wait window (2 of 3 days), so this is early. Tap Apply to do it.';
  assert.equal(rewriteOk(first, 'Pause the hat ad. Tap Apply to do it.'), false);
  assert.equal(rewriteOk(first, 'Pause the hat ad, still in its wait window. Tap Apply to do it.'), true);
  assert.equal(rewriteOk('Hold. WARNING: the pixel stopped firing Nov 24.', 'Hold until Monday.'), false);
  assert.equal(rewriteOk('Draft for #harbor-golf, not sent\n---- draft ----\nHi Sam', 'Hi Sam'), false);
});
await check('the source line: written by code from what the tools read (where, dates, definition, Amazon, tax), the model\'s own goes', () => {
  const reads = [
    { name: 'read_app', input: { view: 'store', brand: 'Harbor Golf', from: '2026-11-01', to: '2026-11-25' }, ok: true },
    { name: 'store_sql', input: { sql: "SELECT ... WHERE source_name != 'amazon'", from: '2026-11-01', to: '2026-11-25' }, ok: true },
    { name: 'meta_read', input: { brand: 'Harbor Golf' }, ok: true },
    { name: 'calc', input: { spend: 1, sales: 3 }, ok: true },
    { name: 'meta_budget', input: {}, ok: true, action: true },
    { name: 'recall', input: {}, ok: true },
    { name: 'read_app', input: { view: 'google_ads' }, ok: false },
  ];
  /* Each place says its own definitions: the SQL's Amazon filter never spills onto the store view read beside it. */
  assert.equal(sourceLine(reads), "Source: Triple Whale store, Nov 1 to 25, sales with tax out, Amazon not split out; Triple Whale orders, Nov 1 to 25, website only (Amazon out); Meta; worked out in code.");
  assert.equal(sourceLine([{ name: 'read_app', input: { view: 'series', days: 14 }, ok: true, text: '{"brand":"Harbor","from":"2026-10-29","to":"2026-11-25"}' }]), 'Source: Triple Whale store and Meta, Oct 29 to Nov 25, sales with tax out, Amazon not split out.');
  assert.equal(sourceLine([{ name: 'read_app', input: { view: 'creatives', days: 7 }, ok: true }]), 'Source: Meta, last 7 days.');
  /* Tax only from the SQL itself: subtracted = out, order_revenue alone = in, a count = nothing said. */
  const sql = q => sourceLine([{ name: 'store_sql', input: { sql: q, from: '2026-11-01', to: '2026-11-25' }, ok: true }]);
  assert.equal(sql('SELECT sum(order_revenue - taxes) FROM orders_table'), 'Source: Triple Whale orders, Nov 1 to 25, sales with tax out, Amazon not split out.');
  assert.equal(sql('SELECT sum(order_revenue) FROM orders_table'), 'Source: Triple Whale orders, Nov 1 to 25, sales with tax in, Amazon not split out.');
  assert.equal(sql("SELECT count() FROM orders_table WHERE discount_code = 'BF30'"), 'Source: Triple Whale orders, Nov 1 to 25, Amazon not split out.');
  /* The customers view and the account view say nothing on tax. */
  assert.equal(sourceLine([{ name: 'read_app', input: { view: 'customers', from: '2026-11-01', to: '2026-11-25' }, ok: true }]), 'Source: Triple Whale orders, Nov 1 to 25, Amazon not split out.');
  /* A read that failed is not a source, even when the tool did not mark it an error. */
  assert.equal(sourceLine([{ name: 'read_app', input: { view: 'klaviyo' }, ok: true, text: '{"error":"Klaviyo is not connected for this brand."}' }]), '');
  assert.equal(sourceLine([{ name: 'read_app', input: { view: 'store', from: '2026-11-26', to: '2026-11-26' }, ok: true, text: '{"error":"That range has no finished days yet."}' }]), '');
  assert.equal(readFailed({ name: 'read_app', ok: true, text: 'The app views are not available on this surface.' }), true);
  assert.equal(readFailed({ name: 'read_app', ok: true, text: '{"brand":"Harbor","period":{}}' }), false);
  /* calc only for weekdays is not "worked out in code". */
  assert.equal(sourceLine([{ name: 'meta_read', input: {}, ok: true }, { name: 'calc', input: { dates: ['2026-11-16'] }, ok: true }]), 'Source: Meta.');
  /* Given the answer, a read holding none of its numbers is left out (when another read holds them). */
  const two = [{ name: 'read_app', input: { view: 'store', from: '2026-11-01', to: '2026-11-25' }, ok: true, text: '{"period":{"sales":84213.4,"orders":912}}' },
    { name: 'read_app', input: { view: 'klaviyo', days: 30 }, ok: true, text: '{"flows":[{"revenue":5120}]}' }];
  assert.equal(sourceLine(two, [], { answer: 'Harbor Golf sold $84,200 from Nov 1 to 25 on 912 orders.' }), 'Source: Triple Whale store, Nov 1 to 25, sales with tax out, Amazon not split out.');
  assert.equal(sourceLine(two, [], { answer: 'Nothing off.' }), 'Source: Triple Whale store, Nov 1 to 25, sales with tax out, Amazon not split out; Klaviyo, last 30 days.');
  assert.equal(sourceLine([{ name: 'search_slack', input: {}, ok: true }, { name: 'locus_get', input: { path: '/api/brand/rules?act=brand_x' }, ok: true }]), "Source: Slack and the brand's ad rules.");
  assert.equal(sourceLine([]), ''); assert.equal(sourceLine([], ['the last 28 days']), 'Assumed: the last 28 days.');
  assert.equal(rangeText('2026-11-16', '2026-11-16'), 'Nov 16'); assert.equal(rangeText('2025-12-20', '2026-01-02'), 'Dec 20, 2025 to Jan 2, 2026');
  const done = finishAnswer('Harbor Golf sold $84,200 from Nov 1 to 25.\nSource: my own guess\nAssumed: the whole store, not one channel.', { reads: reads.slice(0, 1) });
  assert.equal(done, 'Harbor Golf sold $84,200 from Nov 1 to 25.\n\nSource: Triple Whale store, Nov 1 to 25, sales with tax out, Amazon not split out. Assumed: the whole store, not one channel.');
  const draft = finishAnswer('Draft for #harbor-golf, not sent\n---- draft ----\nHi Sam, the store did $84,200.', { reads: reads.slice(0, 1) });
  assert.match(draft, /^Draft for #harbor-golf, not sent\n\nSource: Triple Whale store[^\n]*\n---- draft ----\nHi Sam, the store did \$84,200\.$/, 'the source line stays above the client text');
  assert.equal(finishAnswer('Card up. Tap Apply to do it.', { reads: [] }), 'Card up. Tap Apply to do it.');
  /* A one-line reply over a waiting card gets no source line: the card is the reply. */
  const lr = [{ name: 'locus_get', input: { path: '/api/actions?act=brand_x' }, ok: true }];
  assert.equal(finishAnswer('Task ready: build the BF page, due Thu Nov 26. Tap Apply to add it.', { reads: lr, cards: 1 }), 'Task ready: build the BF page, due Thu Nov 26. Tap Apply to add it.');
  assert.match(finishAnswer('Raise it to $500.\nThe set ran $38 a sale.\n\nNothing has changed yet. Tap Apply to do it.', { reads: lr, cards: 1 }), /\n\nSource: Locus\.$/);
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
  if (text === '__524__') return new Response('<html>timeout</html>', { status: 524 });
  /* An object in the script is a tool call: { tool, input }. */
  if (typeof text === 'object') return new Response(JSON.stringify({ model: body.model, stop_reason: 'tool_use', usage: { input_tokens: 100, output_tokens: 40 }, content: [{ type: 'tool_use', id: 'tu_' + bodies.length, name: text.tool, input: text.input }] }), { status: 200 });
  return new Response(JSON.stringify({ model: body.model, stop_reason: 'end_turn', usage: { input_tokens: 100, output_tokens: 40 }, content: [{ type: 'text', text }] }), { status: 200 });
};
const fakeStore = { def: { name: 'store_sql', description: 'Store orders.', input_schema: { type: 'object', properties: { sql: { type: 'string' }, from: { type: 'string' }, to: { type: 'string' } } } },
  run: async () => ({ text: '{"rows":[{"sales":84200}]}' }) };
const eng = createAssistant({ name: 'Locus', who: 'test', schema: '', sqlTool: 'query_locus', model: 'claude-opus-5-5', answerNote, answerCheck: answerProblems, dateLine, rewriteOk, finishAnswer,
  tools: [...answerTools(), fakeStore], alwaysLoaded: ['calc', 'store_sql'], slackName: 'Locus', slackApp: 'locus' });
const Q = "What was Harbor Golf's revenue on Nov 16, 2026?";
await check('engine: the budget note goes with the question and the date block names the weekday', async () => {
  bodies = []; script = ['Revenue was $1,240.50 on Monday Nov 16 (net of tax, website only).'];
  const r = await eng.answerWeb(env, Q, [], h(), {});
  assert.match(r.answer, /\$1,240\.50/); assert.equal(bodies.length, 1, 'a short answer is not rewritten'); assert.equal(r.checked, undefined);
  assert.match(bodies[0].messages.at(-1).content, /What was Harbor Golf's revenue[\s\S]*\[Answer type: a number lookup, 15 to 40 words/);
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
  assert.equal(bodies.length, 1); assert.doesNotMatch(bodies[0].messages.at(-1).content, /Answer type/); assert.equal(w.answer, words(90));
});
await check('engine: a rewrite that ADDS what the check asked for (a label, the draft line) lands even when longer; one that drops a warning does not', async () => {
  const q = 'How did the sale set do this week?';
  bodies = []; script = ['Meta shows 23 purchases on the set.', "The set made 9 sales on Triple Whale. Meta shows 23 purchases (Meta's own count, second opinion)."];
  let r = await eng.answerWeb(env, q, [], h(), {});
  assert.equal(r.checked.rewritten, true); assert.match(r.answer, /second opinion/);
  bodies = []; script = ['Hi Sam, the sale ads did well this week, 40 orders.', 'Draft for #harbor-golf, not sent\n---- draft ----\nHi Sam, the sale ads did well this week, 40 orders.'];
  r = await eng.answerWeb(env, 'Draft the reply I can send the client', [], h(), {});
  assert.equal(r.checked.rewritten, true); assert.match(r.answer, /^Draft for #harbor-golf, not sent\n---- draft ----\nHi Sam/);
  bodies = []; script = ['Pause the hat ad. It is still in its wait window, 2 of 3 days. ' + words(60), 'Pause the hat ad.'];
  r = await eng.answerWeb(env, 'pause the hat ad', [], h(), {});
  assert.equal(r.checked.rewritten, false, 'the shorter rewrite lost the wait window warning'); assert.match(r.answer, /wait window/);
});
await check('engine: a limited person\'s ACCESS RULE prefix does not change the type; a client login gets its own shape and no source line', async () => {
  bodies = []; script = ['Revenue was $1,240.50 yesterday.'];
  await eng.answerWeb(env, '[ACCESS RULE: this person may only see Harbor Golf. Read, mention, compare or total no other brand; if asked about one, say they do not have access.] What was revenue yesterday?', [], h(), {});
  assert.match(bodies[0].messages.at(-1).content, /\[Answer type: a number lookup, 15 to 40 words/);
  bodies = []; script = [{ tool: 'store_sql', input: { sql: 'SELECT sum(order_revenue - taxes) FROM orders_table', from: '2026-11-01', to: '2026-11-25' } }, 'Harbor Golf sold $84,200 from Nov 1 to 25 (the store page).'];
  const r = await eng.answerWeb(env, 'How much did we sell from Nov 1 to Nov 25?', [], h(), { client: { brand: 'brand_harbor', name: 'Harbor Golf', email: 'x@example.com' } });
  assert.doesNotMatch(bodies[0].messages.at(-1).content, /code adds the source line|Draft for #/);
  assert.equal(r.answer, 'Harbor Golf sold $84,200 from Nov 1 to 25 (the store page).', 'no code-written source line for a client');
});
await check('engine: a prompt the app wrote (noCheck: the Monday review, a scheduled question) gets no note and no check', async () => {
  bodies = []; script = ['Team read: 412 | UGC carried the week. ' + words(200)];
  const r = await eng.answerWeb(env, 'Review Harbor Golf for this week and post the message for the channel.', [], h(), { noCheck: true });
  assert.equal(bodies.length, 1, 'no rewrite round'); assert.doesNotMatch(bodies[0].messages.at(-1).content, /Answer type/); assert.equal(r.checked, undefined);
  assert.doesNotMatch(r.answer, /Source:/, 'no source line on a prompt the app wrote');
});
await check('engine: the source line is written by code from the tools that ran, the model line goes, lists are not cut', async () => {
  bodies = []; script = [{ tool: 'store_sql', input: { sql: "SELECT sum(order_revenue - taxes) FROM orders_table WHERE source_name != 'amazon'", from: '2026-11-01', to: '2026-11-25' } },
    { tool: 'calc', input: { net_sales: 84200, ad_spend: 21000 } },
    ['Harbor Golf sold $84,200 from Nov 1 to 25, a 4.01x MER.', 'Top days:', '1. Nov 24 $9,100', '2. Nov 25 $8,800', '3. Nov 20 $6,000', '4. Nov 21 $5,500',
      'Source: the store, I think', 'Assumed: website only.'].join('\n')];
  const r = await eng.answerWeb(env, 'How much did Harbor Golf sell from Nov 1 to Nov 25?', [], h(), {});
  assert.equal(bodies.length, 3, 'two tool rounds and the answer, no rewrite');
  assert.equal(r.answer, ['Harbor Golf sold $84,200 from Nov 1 to 25, a 4.01x MER.', 'Top days:', '1. Nov 24 $9,100', '2. Nov 25 $8,800', '3. Nov 20 $6,000', '4. Nov 21 $5,500', '',
    'Source: Triple Whale orders, Nov 1 to 25, sales with tax out, website only (Amazon out); worked out in code. Assumed: website only.'].join('\n'));
});
await check('engine: Slack carries the note after the thread and checks the answer the same way', async () => {
  bodies = []; script = [words(90), 'Revenue was $1,240.50 on Monday Nov 16.'];
  const r = await eng.answerSlack(env, { channel: 'C1', ts: '1790000000.000100', user: 'U1', text: '<@B> ' + Q }, h(), {});
  assert.equal(bodies.length, 2); assert.match(bodies[0].messages[0].content, /\[Answer type: /); assert.equal(r.checked.rewritten, true);
});
await check('engine: a rewrite call that fails (524) keeps the finished first answer', async () => {
  bodies = []; script = [words(90), '__524__'];
  const r = await eng.answerWeb(env, Q, [], h(), {});
  assert.equal(bodies.length, 2); assert.equal(r.error, undefined); assert.equal(r.answer, words(90));
  assert.equal(r.checked.rewritten, false); assert.match(r.checked.problems[0], /90 words/);
});
globalThis.fetch = realFetch;

await check('round 21 fixes: dates read, links kept, rewrite guards, client wording, Amazon filters, text sources', () => {
  /* The store view ends at yesterday: the line says the dates it returned, not the dates it was asked. */
  assert.equal(sourceLine([{ name: 'read_app', input: { view: 'store', from: '2026-11-01', to: '2026-11-26' }, ok: true, text: '{"brand":"Harbor","period":{"from":"2026-11-01","to":"2026-11-25","sales":1}}' }]),
    'Source: Triple Whale store, Nov 1 to 25, sales with tax out, Amazon not split out.');
  /* A link on the model's source line stays. */
  const sl = [{ name: 'search_slack', input: { query: 'offer' }, ok: true, text: '{"hits":[{"channel":"#harbor-golf","link":"https://x.slack.com/archives/C1/p1"}]}' }];
  const f = finishAnswer('The offer is 30% off sitewide. Sam said it in #harbor-golf on Nov 11.\nSource: <https://x.slack.com/archives/C1/p1|Sam in #harbor-golf>', { reads: sl });
  assert.match(f, /<https:\/\/x\.slack\.com\/archives\/C1\/p1\|Sam in #harbor-golf>/); assert.match(f, /Source: Slack\.$/);
  /* Rewrite guards. */
  const plan = 'Plan card is up with these changes:\n1. Raise New people to $500\n2. Pause 412\n3. Cut Past buyers to $50\nTap Apply to do it.';
  assert.equal(rewriteOk(plan, 'Plan card is up with all three changes. Tap Apply to do it.', 'what should we do', { cards: 1 }), false);
  assert.equal(rewriteOk(plan, plan.replace(':', '.'), 'what should we do', { cards: 1 }), true);
  for (const w of ['The pixel has not fired a purchase since Nov 20.', 'The hat is out of stock.', 'The ad account was disabled on Nov 24.', 'The account hit its spending limit.', 'Two ads were rejected.'])
    assert.equal(rewriteOk('Hold. ' + w, 'Hold until Monday.'), false, w);
  assert.equal(rewriteOk('Pause it: it is the anchor of the set, still in its wait window.', 'Pause it. No anchor or wait window issue.'), false);
  assert.equal(rewriteOk('Pause it, it is the anchor.', 'Pause it, though it is the anchor.'), true);
  assert.equal(rewriteOk('Draft for #harbor-golf, not sent\n---- draft ----\n' + words(70), 'Draft for #harbor-golf, not sent\n---- draft ----\n'), false);
  /* Client wording: no card, no Apply, no calc. */
  const cn = answerNote('Pause my hat ad', { client: true });
  assert.doesNotMatch(cn, /Tap Apply|Card up|card will make|wait window/); assert.match(cn, /made by your team/);
  assert.doesNotMatch(answerNote('What should we do with the Black Friday ads?', { client: true }), /Tap Apply|wait window|card will/i);
  assert.doesNotMatch(dateLine('2026-11-26', { client: true }), /calc/); assert.match(dateLine('2026-11-26'), /calc/);
  assert.match(answerNote('What was revenue yesterday?'), /American English/);
  /* Amazon filters in their common shapes. */
  const amz = q => sourceLine([{ name: 'store_sql', input: { sql: q }, ok: true }]);
  assert.match(amz("SELECT count() FROM orders_table WHERE lower(source_name) != 'amazon'"), /website only \(Amazon out\)/);
  assert.match(amz("SELECT count() FROM orders_table WHERE source_name NOT LIKE '%amazon%'"), /website only \(Amazon out\)/);
  assert.match(amz("SELECT count() FROM orders_table WHERE source_name ILIKE '%amazon%'"), /Amazon orders checked/);
  /* Text sources by what was taken from them, never by a number they hold. */
  const why = [{ name: 'read_app', input: { view: 'store', from: '2026-11-12', to: '2026-11-18' }, ok: true, text: '{"period":{"from":"2026-11-12","to":"2026-11-18","sales":24500}}' },
    { name: 'read_app', input: { view: 'changes' }, ok: true, text: '[{"date":"2026-11-11","what":"budget 60 to 40"}]' },
    { name: 'search_slack', input: {}, ok: true, text: '{"hits":[{"channel":"#harbor-internal","text":"no email this week"}]}' }];
  assert.equal(sourceLine(why, [], { answer: 'Sales fell to $24,500. Prospecting was cut on Nov 11, and #harbor-internal confirms no email went out.' }),
    'Source: Triple Whale store, Nov 12 to 18, sales with tax out, Amazon not split out; the Change Log; Slack.');
  const hit = [{ name: 'read_app', input: { view: 'store', from: '2026-11-01', to: '2026-11-25' }, ok: true, text: '{"period":{"from":"2026-11-01","to":"2026-11-25","spend":21000}}' },
    { name: 'search_slack', input: {}, ok: true, text: '{"hits":[{"text":"budget 21000"}]}' }];
  assert.doesNotMatch(sourceLine(hit, [], { answer: 'Spend was $21,000 from Nov 1 to 25.' }), /Slack/);
  /* A long read: the number is still found past the 16,000 characters kept (read.nums). */
  const long = [{ name: 'store_sql', input: { sql: 'SELECT 1' }, ok: true, text: 'x'.repeat(16000), nums: [1, 98765] }, { name: 'web_lookup', input: {}, ok: true, text: 'nothing 5' }];
  assert.match(sourceLine(long, [], { answer: 'It was 98,765.' }), /^Source: Triple Whale orders, Amazon not split out\.$/);
  assert.match(sourceLine([{ name: 'read_app', input: { view: 'creator_sets' }, ok: true }]), /Meta spend and Triple Whale sales/);
});

await check('no em or en dashes in the new code and this test', () => {
  const DASH = new RegExp('[' + String.fromCharCode(0x2014, 0x2013) + ']');
  for (const f of ['./src/stratanswer.js', fileURLToPath(import.meta.url)]) assert.ok(!DASH.test(fs.readFileSync(f, 'utf8')), 'dash in ' + f);
});

const failed = checks.filter(c => !c.pass);
console.log(`\n${checks.length - failed.length} of ${checks.length} passed`);
if (failed.length) process.exit(1);

/* Offline checks for the 2026-10-15 Slack answer pass: ONE message (rich_text + one native table), the draft split,
 * the Triple Whale SQL gate, the web fallback's result parser and the ad-to-board verdicts.
 *   node test-stratdata.mjs      (from account-health/worker)
 */
import assert from 'node:assert/strict';
import { slackMessage, splitDraft } from '../../ask/engine.js';
import { gateTwSql, parseDdg, verdicts } from './src/stratdata.js';

let pass = 0, fail = 0;
const check = async (name, fn) => { try { await fn(); pass++; console.log('PASS  ' + name); } catch (e) { fail++; console.log('FAIL  ' + name + '\n      ' + String(e.stack || e).split('\n').slice(0, 2).join(' | ')); } };

await check('one message: rich_text blocks, a real table, bullets, bold and links', () => {
  const m = slackMessage('*Skip it.* Floyd\'s offer is **16.7%** off.\n\n• AOV <https://x.com|$59.44>\n• 1.4 hats\n\n| Offer | Orders | Profit |\n|---|---|---|\n| B2G1 | 486 | $9 |\n| Floyd | 0 | $31 |\n\nThat settles it.');
  const types = m.blocks.map(b => b.type);
  assert.ok(types.includes('table')); assert.ok(types.every(t => t === 'rich_text' || t === 'table'));
  const t = m.blocks.find(b => b.type === 'table');
  assert.equal(t.rows.length, 3); assert.equal(t.rows[0].length, 3);
  assert.deepEqual(t.column_settings.map(c => c.align || null), [null, 'right', 'right']);
  assert.equal(t.rows[0][0].elements[0].elements[0].style.bold, true);
  const first = m.blocks[0].elements[0].elements;
  assert.equal(first[0].text, 'Skip it.'); assert.equal(first[0].style.bold, true);
  assert.ok(first.some(e => e.text === '16.7%' && e.style?.bold));
  const list = m.blocks.find(b => b.elements[0].type === 'rich_text_list').elements[0];
  assert.equal(list.elements.length, 2); assert.equal(list.elements[0].elements[1].type, 'link');
  assert.ok(m.blocks.length <= 50);
});
await check('only ONE native table a message; the next is monospace; plain has none', () => {
  const two = '| a | b |\n|---|---|\n| 1 | 2 |\n\n| c | d |\n|---|---|\n| 3 | 4 |';
  const m = slackMessage(two);
  assert.equal(m.blocks.filter(b => b.type === 'table').length, 1);
  assert.ok(m.blocks.some(b => b.elements?.[0]?.type === 'rich_text_preformatted'));
  assert.equal(m.plain.filter(b => b.type === 'table').length, 0);
});
await check('a code-block table (the old way) becomes a real table; plain code stays code', () => {
  const m = slackMessage('```\nProduct      Price   Margin\nPerformer    $100    $70.63\nYouth Snap   $38.95  $27.51\n```\n\n```\nnpm run deploy\n```');
  const t = m.blocks.find(b => b.type === 'table');
  assert.ok(t); assert.equal(t.rows.length, 3);
  assert.ok(m.blocks.some(b => b.elements?.[0]?.type === 'rich_text_preformatted' && /npm run deploy/.test(b.elements[0].elements[0].text)));
});
await check('a long answer is many short blocks (never one tall one) and stays under 50', () => {
  const m = slackMessage(Array.from({ length: 80 }, (_, i) => `Paragraph ${i} with some words.`).join('\n\n'));
  assert.ok(m.blocks.length <= 46 && m.blocks.length > 20);
});
await check('the draft rides as its own message', () => {
  const { answer, draft } = splitDraft('Skip it.\n\n---- draft ----\nHey Floyd, here is what the numbers say.');
  assert.equal(answer, 'Skip it.'); assert.match(draft, /^Hey Floyd/);
  assert.equal(splitDraft('no draft here').draft, '');
});
await check('store_sql gate: one read, no writes, no second statement', () => {
  assert.ok(gateTwSql('SELECT 1 FROM orders_table WHERE event_date BETWEEN @startDate AND @endDate;').sql);
  assert.ok(gateTwSql('WITH x AS (SELECT 1) SELECT * FROM x').sql);
  assert.ok(gateTwSql("SELECT 'drop; it' AS s").sql, 'words inside quotes are fine');
  assert.ok(gateTwSql('DROP TABLE orders_table').error);
  assert.ok(gateTwSql('SELECT 1; SELECT 2').error);
  assert.ok(gateTwSql('SELECT 1 FROM t WHERE x IN (SELECT 1) ; insert into t values (1)').error);
});
await check('web_lookup reads DuckDuckGo results (the real link, not the redirect; ads skipped)', () => {
  const html = `<a rel="nofollow" class="result__a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fmelin.com%2Fblogs%2Fbfcm&amp;rut=x">Melin <b>Black Friday</b></a><a class="result__snippet" href="x">30% off sitewide in 2024</a>
    <a class="result__a" href="https://duckduckgo.com/y.js?ad=1">Ad</a>`;
  const r = parseDdg(html);
  assert.equal(r.length, 1); assert.equal(r[0].url, 'https://melin.com/blogs/bfcm'); assert.match(r[0].title, /Black Friday/); assert.match(r[0].snippet, /30% off/);
});
await check('match_ads_to_board verdicts: keep the approved version, pause the older one, unsure when nothing fits', () => {
  const files = [
    { id: 'f1', num: '3', ad: '3-1', version: 1, call: null }, { id: 'f2', num: '3', ad: '3-1', version: 2, call: 'approval' },
    { id: 'f3', num: '3', ad: '3-5', version: 1, call: 'approval' },
    { id: 'f4', num: '3', ad: '3-4', version: 1, call: null }, { id: 'f5', num: '3', ad: '3-4', version: 2, call: null },
  ];
  const ads = [{ id: 'a1', name: '03 - 1' }, { id: 'a2', name: '03 - 2' }, { id: 'a3', name: '03 - 9' }, { id: 'a4', name: '03 - 7' }, { id: 'a5', name: '03 - 8' }, { id: 'a6', name: '03 - 6' }];
  const pairs = [{ meta: 'M1', file: 'P1', sure: 'high' }, { meta: 'M2', file: 'P2', sure: 'high' }, { meta: 'M3', file: 'P3', sure: 'high' },
    { meta: 'M4', file: 'P4', sure: 'medium' }, { meta: 'M5', file: 'P5', sure: 'medium' }, { meta: 'M6', file: null }];
  const v = verdicts(ads, files, pairs);
  assert.deepEqual(v.map(x => x.call), ['pause', 'keep', 'keep', 'pause', 'keep', 'unsure']);
  assert.match(v[0].why, /V2/); assert.match(v[4].why, /newest/);
});

console.log(`\n${pass}/${pass + fail} passed`);
if (fail) process.exit(1);

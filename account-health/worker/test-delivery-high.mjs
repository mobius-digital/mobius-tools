/* Offline checks for spend far above normal (delivery.js spendHigh, highAlertText, 2026-11-26) and the low side's
 * arithmetic moved out of worker.js checkToday (lowToday). Pure functions, invented numbers.
 *   node test-delivery-high.mjs      (from account-health/worker)
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spendHigh, completedDayNormal, highAlertText, lowAlertText, lowToday, HIGH_FACTOR, HIGH_MIN_OVER, DELIVERY_FLOOR, DELIVERY_MIN_SPEND } from './src/delivery.js';

let n = 0;
const ok = (name, fn) => { try { fn(); n++; } catch (e) { console.error('FAILED: ' + name + '\n', e); process.exitCode = 1; } };

/* The arithmetic checkToday had before the move, kept here word for word as the reference (it changed p in place). */
function oldCheckToday(p, budget) {
  if (!p || !(p.l7_by_now >= 50 / 2)) return null;
  if (budget != null && p.l7_daily_avg > 0 && budget < p.l7_daily_avg) p.l7_by_now = p.l7_by_now * budget / p.l7_daily_avg;
  if (!(p.l7_by_now >= 50 / 2)) return null;
  if (p.spent > p.l7_by_now * 0.4) return null;
  return { period: 'today', spent: p.spent, normal: p.l7_by_now, budget,
    hint: p.spent === 0 ? 'Check billing, campaign status and policy.' : 'Worth a look in Ads Manager while the day is still live.' };
}

ok('the thresholds', () => {
  assert.equal(HIGH_FACTOR, 1.5); assert.equal(HIGH_MIN_OVER, 100);
  assert.equal(DELIVERY_FLOOR, 0.4); assert.equal(DELIVERY_MIN_SPEND, 50);
});
ok('spendHigh fires at 1.5x with $100 over', () => {
  assert.deepEqual(spendHigh({ spent: 300, normal: 200, budget: null }), { spent: 300, base: 200, over: 100 });
  assert.equal(spendHigh({ spent: 299, normal: 200 }), null, 'under 1.5x');
  assert.equal(spendHigh({ spent: 120, normal: 60 }), null, '2x but only $60 over');
  assert.deepEqual(spendHigh({ spent: 1000, normal: 400 }), { spent: 1000, base: 400, over: 600 });
});
ok('a raised budget lifts the base, so a season budget does not fire', () => {
  assert.ok(spendHigh({ spent: 2000, normal: 500, budget: null }), 'against last week alone it would fire');
  assert.equal(spendHigh({ spent: 2000, normal: 500, budget: 1500 }), null, 'the season budget is the bar');
  assert.deepEqual(spendHigh({ spent: 3000, normal: 500, budget: 1500 }), { spent: 3000, base: 1500, over: 1500 }, 'twice the season budget still fires');
});
ok('small brands never fire', () => {
  assert.equal(spendHigh({ spent: 200, normal: 20, budget: 10 }), null);
  assert.equal(spendHigh({ spent: 500, normal: 0, budget: null }), null, 'no normal and no budget: nothing to judge');
  assert.equal(spendHigh({}), null);
});
ok('the alert words: house style, no dashes', () => {
  const a = { name: 'Northlake Golf', currency: 'USD' };
  const t = highAlertText(a, { spent: 1000, base: 400, over: 600 }, { period: 'today' });
  assert.equal(t.title, 'Northlake Golf is spending far above normal');
  assert.equal(t.body, 'Spent $1,000 against a normal $400 (budgets included). Check for a budget typo, a doubled campaign or a new ad set.');
  assert.equal(highAlertText(a, { spent: 1000, base: 400 }, { period: 'yesterday' }).title, 'Northlake Golf spent far above normal yesterday');
  const l = lowAlertText(a, { period: 'today', spent: 0, normal: 300, budget: null, hint: 'Check billing, campaign status and policy.' });
  assert.equal(l.title, 'Northlake Golf spent nothing so far today');
  for (const s of [t.title, t.body, l.title, l.body]) assert.ok(!/[\u2014\u2013]/.test(s));
});
ok('lowToday returns exactly what the old checkToday arithmetic did (three fixed inputs, golden values)', () => {
  const cases = [
    [{ spent: 40, l7_by_now: 200, l7_daily_avg: 600 }, null],              // plain low: 40 <= 80
    [{ spent: 30, l7_by_now: 300, l7_daily_avg: 900 }, 450],               // budget cut scales normal by now to 150
    [{ spent: 70, l7_by_now: 120, l7_daily_avg: 400 }, null],              // not low: 70 > 48
  ];
  const golden = [
    { period: 'today', spent: 40, normal: 200, budget: null, hint: 'Worth a look in Ads Manager while the day is still live.' },
    { period: 'today', spent: 30, normal: 150, budget: 450, hint: 'Worth a look in Ads Manager while the day is still live.' },
    null,
  ];
  cases.forEach(([p, b], i) => {
    const before = JSON.stringify(p);
    const got = lowToday(p, b);
    assert.equal(JSON.stringify(p), before, 'lowToday does not change p');
    assert.deepEqual(got, golden[i], 'golden ' + i);
    assert.deepEqual(got, oldCheckToday({ ...p }, b), 'same as the old arithmetic ' + i);
  });
  assert.equal(lowToday({ spent: 0, l7_by_now: 20, l7_daily_avg: 100 }, null), null, 'too early to judge');
  assert.equal(lowToday(null, null), null);
  assert.equal(lowToday({ spent: 0, l7_by_now: 80, l7_daily_avg: 400 }, null).hint, 'Check billing, campaign status and policy.');
});
ok('a completed day is judged against the biggest prior day, so a sale day before a planned cut is not far above normal', () => {
  const prior = [500, 500, 500, 800, 1500, 1500, 1500];
  assert.equal(completedDayNormal(prior), 1500);
  assert.equal(spendHigh({ spent: 1500, normal: completedDayNormal(prior), budget: 500 }), null, 'the cut morning stays quiet');
  assert.ok(spendHigh({ spent: 2400, normal: completedDayNormal(prior), budget: 500 }), 'far above every prior day still fires');
  assert.equal(completedDayNormal([]), 0);
});
ok('worker.js: the high side keeps its own state keys and never writes day, intra or alerted', () => {
  const src = readFileSync(new URL('./src/worker.js', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
  const start = src.indexOf('async function deliveryPass(env)');
  const body = src.slice(start, src.indexOf('\n}\n', start));
  const hiLines = body.split('\n').filter(l => /hiDay|hiIntra|hiAlerted|spend_high/.test(l));
  assert.ok(hiLines.length >= 4, 'the high side is in deliveryPass');
  for (const l of hiLines) assert.ok(!/st\.(day|intra|alerted)\s*=(?!=)/.test(l), 'a high line writes a low key: ' + l.trim());
  assert.match(body, /st\.hiIntra = today/); assert.match(body, /st\.hiDay = today/); assert.match(body, /st\.hiAlerted = /);
  assert.match(src, /async function checkToday\(env, a\) \{\n  return \(await checkTodayBoth\(env, a\)\)\.low;/, 'checkToday is the low half of the one Meta call');
  assert.ok(!/deliveryMessage\([^)]*high/.test(body), 'the high side posts nothing to Slack');
});

console.log(process.exitCode ? 'test-delivery-high: FAILED' : `test-delivery-high: ${n} checks passed`);

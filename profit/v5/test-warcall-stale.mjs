// node test-warcall-stale.mjs (from profit/v5). No DOM, no network.
// War Room shelf life: a check-in call over 6 hours old, or made on another day in Central, gets no live Approve,
// and a tile drawn from a saved check-in says which check-in it is.
import assert from 'node:assert/strict';
const { callOutOfDate, asOfWords, CALL_SHELF_H, OUT_OF_DATE } = await import('./pages/_warcall.js');

let n = 0;
const ok = (name, fn) => { fn(); n++; console.log('ok  ' + name); };

ok('the shelf life matches the server Approve (6 hours)', () => assert.equal(CALL_SHELF_H, 6));
ok('a call from an hour ago the same day is live', () => {
  assert.equal(callOutOfDate('2026-11-28T14:00:00Z', Date.parse('2026-11-28T15:00:00Z')), false);
});
ok('a call over 6 hours old is out of date', () => {
  assert.equal(callOutOfDate('2026-11-28T14:00:00Z', Date.parse('2026-11-28T20:30:00Z')), true);
});
ok('an 8pm Friday call read at 12:30am Saturday (4.5 hours) is out of date: another day in Central', () => {
  // 8pm CST Fri Nov 27 = 02:00Z Sat; 12:30am CST Sat = 06:30Z Sat
  assert.equal(callOutOfDate('2026-11-28T02:00:00Z', Date.parse('2026-11-28T06:30:00Z')), true);
});
ok('the 11 hour old call from the audit (8pm Fri read 7:30am Sat) is out of date', () => {
  assert.equal(callOutOfDate('2026-11-28T02:00:00Z', Date.parse('2026-11-28T13:30:00Z')), true);
});
ok('a missing time is out of date', () => {
  assert.equal(callOutOfDate(undefined), true);
  assert.equal(callOutOfDate('not a date'), true);
});
ok('the tile says which check-in it shows', () => {
  assert.equal(asOfWords('2026-11-28T02:00:00Z'), 'As of 8:00pm Fri check-in');
  assert.equal(asOfWords(null), 'As of the last check-in');
});
ok('the locked button says what to do, in plain words', () => assert.equal(OUT_OF_DATE, 'Out of date, wait for the next check-in'));

console.log(`\n${n} checks passed`);

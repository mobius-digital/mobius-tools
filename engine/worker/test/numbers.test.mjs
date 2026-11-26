/* The formulas and the definitions list, and the day helpers. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { safeDiv, roas, mer, cpa, aov, cpm, ctr, cvr, pct, sum, change, DEFINITIONS, definitionOf } from '../src/numbers/defs.js';
import * as viaMetrics from '../src/metrics/definitions.js';
import { dayIn, addDays, monthOf, windowFor, isDay, dayDiff } from '../src/platform/time.js';

test('a number that is not known is null, never 0', () => {
  assert.equal(safeDiv(10, 0), null);
  assert.equal(safeDiv(null, 5), null);
  assert.equal(safeDiv(10, undefined), null);
  assert.equal(safeDiv(0, 5), 0);
  assert.equal(sum([], 'x'), null);
  assert.equal(sum([{ y: 1 }], 'x'), null);
  assert.equal(sum([{ x: 1 }, { x: null }, { x: 2.5 }], 'x'), 3.5);
});

test('the formulas', () => {
  assert.equal(mer(300, 100), 3);
  assert.equal(roas(250, 100), 2.5);
  assert.equal(cpa(100, 4), 25);
  assert.equal(aov(300, 6), 50);
  assert.equal(cpm(50, 10000), 5);
  assert.equal(ctr(20, 1000), 0.02);
  assert.equal(cvr(3, 100), 0.03);
  assert.equal(pct(1, 4), 0.25);
  assert.equal(change(110, 100), 0.1);
  assert.equal(change(110, 0), null);
});

test('every definition is complete and has its own id', () => {
  const seen = new Set();
  for (const d of DEFINITIONS) {
    assert.ok(/^[a-z][a-z0-9_]*$/.test(d.id), d.id);
    assert.ok(!seen.has(d.id), `twice: ${d.id}`);
    seen.add(d.id);
    for (const k of ['name', 'definition', 'formula', 'source']) assert.ok(typeof d[k] === 'string' && d[k].length > 2, `${d.id}.${k}`);
    assert.ok(['money', 'count', 'ratio', 'share', 'days'].includes(d.unit), `${d.id}.unit`);
    assert.ok(['before', 'after', 'na'].includes(d.returns), `${d.id}.returns`);
    assert.ok(d.definition.split('. ').length <= 3, `${d.id}: keep it to one or two sentences`);
  }
});

test('before returns and after returns are two named numbers, and the pages keep the after returns one', () => {
  assert.equal(definitionOf('revenue').returns, 'after');
  assert.deepEqual([...definitionOf('revenue').old_keys], ['sales', 'revenue']);
  assert.equal(definitionOf('revenue_before_returns').returns, 'before');
  assert.deepEqual([...definitionOf('revenue_before_returns').old_keys], []);
  assert.equal(definitionOf('total_sales').returns, 'after');
  assert.equal(definitionOf('order_revenue').returns, 'before');
});

test('the numbers the screens show are all defined', () => {
  const want = ['gross_sales', 'discounts', 'returns', 'net_sales', 'tax', 'shipping', 'total_sales', 'orders', 'new_customers',
    'returning_customers', 'spend_all', 'mer', 'roas', 'new_customer_mer', 'cac', 'aov', 'profit_after_ads'];
  for (const id of want) assert.ok(definitionOf(id), id);
  assert.equal(viaMetrics.DEFINITIONS, DEFINITIONS);
});

test('no old answer key is claimed by two definitions', () => {
  const owner = new Map();
  for (const d of DEFINITIONS) for (const k of d.old_keys) {
    assert.ok(!owner.has(k), `${k} is claimed by ${owner.get(k)} and ${d.id}`);
    owner.set(k, d.id);
  }
});

test('days', () => {
  assert.equal(dayIn('America/Chicago', new Date('2026-03-01T03:00:00Z')), '2026-02-28');
  assert.equal(addDays('2026-02-28', 1), '2026-03-01');
  assert.equal(monthOf('2026-02-28'), '2026-02');
  assert.equal(dayDiff('2026-02-27', '2026-03-01'), 2);
  assert.ok(isDay('2026-02-28') && !isDay('2026-2-28') && !isDay('nope'));
});

test('the old window rule: it ends yesterday unless today is named', () => {
  const now = new Date('2026-03-10T18:00:00Z');
  assert.deepEqual(windowFor('America/Chicago', { days: 7 }, now), { today: '2026-03-10', from: '2026-03-03', to: '2026-03-09' });
  assert.deepEqual(windowFor('America/Chicago', { from: '2026-03-10', to: '2026-03-10' }, now), { today: '2026-03-10', from: '2026-03-10', to: '2026-03-10' });
  assert.deepEqual(windowFor('America/Chicago', { from: '2026-03-01', to: '2026-04-01' }, now), { today: '2026-03-10', from: '2026-03-01', to: '2026-03-09' });
  assert.deepEqual(windowFor('America/Chicago', { from: '2026-03-10' }, now), { today: '2026-03-10', from: '2026-03-09', to: '2026-03-09' });
});

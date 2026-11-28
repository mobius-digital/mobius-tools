/* Every change once: Meta's echo of a Locus write folds into the Locus row (ads/changes.js foldEchoes).
   Run: node --test "engine/worker/test/ads/echoes.test.mjs" */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { foldEchoes } from '../../src/ads/changes.js';

const locus = (id, object, at, category = 'budget') => ({ id: `manual:${id}`, manual: 1, actor: 'Cole in Locus', object_id: object, category, event_time: at });
const meta = (id, object, at, category = 'budget', actor = 'Mobius Tools') => ({ id, manual: 0, actor, object_id: object, category, event_time: at });

test('the echo of a Locus budget write folds into the Locus row (Meta can be a second early)', () => {
  const rows = [locus('a', '111', '2026-11-28T12:21:42.925Z'), meta('m1', '111', '2026-11-28T12:21:41+0000')];
  assert.deepEqual(foldEchoes(rows).map(r => r.id), ['manual:a']);
});
test('a change by a person in Ads Manager is never folded', () => {
  const rows = [locus('a', '111', '2026-11-28T12:21:42Z'), meta('m1', '111', '2026-11-28T12:22:00+0000', 'budget', 'Cole Wetzler')];
  assert.equal(foldEchoes(rows).length, 2);
});
test('another object, another kind of change, or over 10 minutes apart stays', () => {
  const rows = [locus('a', '111', '2026-11-28T12:00:00Z'), meta('m1', '222', '2026-11-28T12:00:01+0000'),
    meta('m2', '111', '2026-11-28T12:00:02+0000', 'campaign_paused'), meta('m3', '111', '2026-11-28T12:11:00+0000')];
  assert.deepEqual(foldEchoes(rows).map(r => r.id), ['manual:a', 'm1', 'm2', 'm3']);
});
test('each Locus row takes one echo, the nearest; order is kept', () => {
  const rows = [meta('m2', '111', '2026-11-28T12:05:00+0000'), locus('b', '111', '2026-11-28T12:04:59Z'), meta('m1', '111', '2026-11-28T12:00:01+0000'), locus('a', '111', '2026-11-28T12:00:00Z')];
  assert.deepEqual(foldEchoes(rows).map(r => r.id), ['manual:b', 'manual:a']);
  const one = [locus('a', '111', '2026-11-28T12:00:00Z'), meta('m1', '111', '2026-11-28T12:00:01+0000'), meta('m2', '111', '2026-11-28T12:00:03+0000')];
  assert.deepEqual(foldEchoes(one).map(r => r.id), ['manual:a', 'm2']);
});
test('no Locus row: nothing changes', () => {
  const rows = [meta('m1', '111', '2026-11-28T12:00:01+0000')];
  assert.equal(foldEchoes(rows), rows);
});

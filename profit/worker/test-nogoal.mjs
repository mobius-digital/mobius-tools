/* Offline checks for hideUnsetGoals (src/worker.js, 2026-11-26): the client report archive (GET /api/report-view/:token)
 * shows no goal for a month nobody typed one for, and a planned report comes back byte for byte.
 *   node test-nogoal.mjs      (from profit/worker) */
import assert from 'node:assert/strict';
import { hideUnsetGoals } from './src/worker.js';

const report = (months, pacing) => ({
  totals: { sales: 1000, spend: 400 }, previous: { sales: 900, spend: 380 },
  forecast: { sales: 1200, spend: 450, mer: 2.67, amer: 1.5, cm: 200, months },
  ...(pacing ? { pacing } : {}),
});

// A planned month: nothing changes.
for (const r of [
  report({ '2026-11': { planned: true, has_goals: true } }, { month: '2026-11', goal_sales: 5000, plan_to_date: 4000, planned: true }),
  report({ '2026-11': { planned: true, has_goals: true }, '2026-12': { planned: true, has_goals: true } }),
  { totals: { sales: 1 }, forecast: { sales: 2 } },                  // an old report with no flags
  { totals: { sales: 1 } },
]) {
  const before = JSON.stringify(r);
  assert.equal(JSON.stringify(hideUnsetGoals(r)), before);
}

// December not typed: no forecast numbers, no pacing card, the month named.
const d = hideUnsetGoals(report({ '2026-12': { planned: false, has_goals: true } }, { month: '2026-12', goal_sales: 5000, plan_to_date: 400, planned: false }));
assert.equal(d.pacing, undefined);
for (const k of ['sales', 'spend', 'mer', 'amer', 'cm']) assert.equal(d.forecast[k], null);
assert.deepEqual(d.no_goal, ['2026-12']);
assert.equal(d.totals.sales, 1000);

// A week across a planned and an unplanned month: the mixed forecast goes too.
const w = hideUnsetGoals(report({ '2026-11': { planned: true, has_goals: true }, '2026-12': { planned: false, has_goals: true } }));
assert.equal(w.forecast.sales, null);
assert.deepEqual(w.no_goal, ['2026-12']);

console.log('test-nogoal: all passed');

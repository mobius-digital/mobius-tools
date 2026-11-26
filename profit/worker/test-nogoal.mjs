/* Offline checks for hideUnsetGoals (src/worker.js, 2026-11-26): the client report archive (GET /api/report-view/:token)
 * shows no goal for a month nobody typed one for, and a planned report comes back byte for byte.
 *   node test-nogoal.mjs      (from profit/worker) */
import assert from 'node:assert/strict';
import { hideUnsetGoals, goalsPlanned } from './src/worker.js';

/* goalsPlanned (GET /api/client goals_planned, GET /api/overview goals_planned + month, GET /api/plan planned):
   the month's own sales goal, else default's; only a previous month's goal is unplanned. The routes themselves are
   proven in test-costs.mjs (section 18). */
{
  const a = g => ({ goals_json: g == null ? g : JSON.stringify(g) });
  // Default covers months up to DEFAULT_LAST_MONTH (2026-11) and only while no later month has a key.
  assert.equal(goalsPlanned(a({ default: { sales: 9000 } }), '2026-11'), true, 'default only: November planned (legacy)');
  assert.equal(goalsPlanned(a({ default: { sales: 9000 } }), '2026-12'), false, 'default only: December needs its own key');
  assert.equal(goalsPlanned(a({ '2026-08': { sales: 1 }, default: { sales: 9000 }, '2026-10': { sales: 9000 } }), '2026-11'), true, 'no own key, previous months and default: planned');
  const saved = a({ default: { sales: 100 }, '2026-10': { sales: 100 } });   // the shape every save leaves
  for (const ym of ['2026-12', '2027-03']) assert.equal(goalsPlanned(saved, ym), false, `save shape: ${ym} not planned`);
  assert.equal(goalsPlanned(saved, '2026-09'), false, 'save shape: a month before a dated key not planned');
  assert.equal(goalsPlanned(a({ default: { sales: 5 }, '2026-12': { sales: 5 } }), '2026-11'), false, 'a later key: default no longer covers November');
  assert.equal(goalsPlanned(a({ '2026-12': { sales: 7000 }, default: { sales: 9000 } }), '2026-12'), true, 'own key and default');
  assert.equal(goalsPlanned(a({ '2026-11': { cm_pct: 0.5 }, default: { sales: 9000, cm_pct: 0.5 } }), '2026-11'), true, 'margin-only own key falls back to default sales (November)');
  assert.equal(goalsPlanned(a({ '2026-12': { cm_pct: 0.5 }, default: { sales: 9000, cm_pct: 0.5 } }), '2026-12'), false, 'margin-only own key in December: unplanned');
  assert.equal(goalsPlanned(a({ '2026-12': { spend: 4000 }, default: { spend: 4000 } }), '2026-12'), false, 'spend-only own key, spend-only default');
  assert.equal(goalsPlanned(a({ '2026-11': { sales: 9000 }, default: { cm_pct: 0.5 } }), '2026-12'), false, 'previous month and a margin-only default');
  assert.equal(goalsPlanned(a({ '2026-11': { sales: 9000 } }), '2026-12'), false, 'an earlier month does not plan this one');
  assert.equal(goalsPlanned(a({ '2026-12': {} }), '2026-12'), false, 'an empty key');
  assert.equal(goalsPlanned(a({ '2026-12': { spend: 4000 } }), '2026-12'), false, 'spend only');
  assert.equal(goalsPlanned(a({ '2026-12': { cm_pct: 0.5 } }), '2026-12'), false, 'margin only');
  assert.equal(goalsPlanned(a({ '2026-12': { sales: null, spend: 4000 } }), '2026-12'), false, 'a cleared sales goal');
  assert.equal(goalsPlanned(a({ '2026-12': { sales: 9000 } }), '2026-12'), true, 'planned');
  assert.equal(goalsPlanned(a({ '2026-12': { sales: 0 } }), '2026-12'), true, 'a typed 0 is a goal');
  assert.equal(goalsPlanned(a(null), '2026-12'), false, 'no goals at all');
  assert.equal(goalsPlanned({ goals_json: 'not json' }, '2026-12'), false, 'unreadable goals');
}

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

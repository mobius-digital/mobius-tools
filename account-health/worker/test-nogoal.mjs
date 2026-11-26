// Offline checks for "no goal typed, no goal shown" (2026-11-26): the client daily (clientpost.js dailyPost goal_set) and
// the My day line for the brand's owner (mywork.js goalItems). Run: node test-nogoal.mjs
import { dailyPost, noGoalLine } from './src/clientpost.js';
import { _test } from './src/mywork.js';
import { readFacts } from './src/reportread.js';
import { monthPlanned, keepDefaultMonth } from './src/goalplan.js';
const { goalMonthsDue, goalItems, forPerson, dmText, dmMessage } = _test;
let n = 0, bad = 0;
const ok = (c, m) => { n++; if (!c) { bad++; console.log('FAIL', m); } };

const base = { brand: 'Sample Golf', date: '2026-12-03', currency: 'USD',
  day: { sales: 900, spend: 400, mer: 2.25, amer: 1.4, plan: 1000 },
  month: { ym: '2026-12', sales: 3200, plan: 3000, spend: 1300, day_of_month: 3, days_in_month: 31 }, others: [800, 700] };

// 1. A planned month: the same text as before, word for word (goal_set left out or true).
const planned = dailyPost(base);
ok(planned === [
  '*Sample Golf · Daily update*', '*Yesterday, Thursday Dec 3*', '• Sales: *$900* (goal $1,000, best day this month)', '• Ad spend: *$400*',
  '• MER: *2.25x*', '• aMER (new customers): *1.40x*', '', '*December so far* (3 of 31 days)', '• Sales: *$3,200* of $3,000 goal',
  '• Ad spend: *$1,300*', '• MER: *2.46x*', '', '_More numbers in the thread._'].join('\n'), 'planned month unchanged');
ok(dailyPost({ ...base, goal_set: true }) === planned, 'goal_set true is the default');

// 2. No goal typed: no number, no on/under goal word, the exact line; best day stays.
const unset = dailyPost({ ...base, goal_set: false });
ok(!unset.includes('$1,000') && !unset.includes('$3,000') && !/\bgoal \$|of \$[\d.,K]+ goal/.test(unset), 'no inherited number');
ok(!/on goal|under goal/.test(unset), 'no goal verdict');
ok(unset.split('\n').includes('• No goal set for December'), 'the exact line');
ok(unset.includes('(best day this month)'), 'best day this month stays');
const notBest = dailyPost({ ...base, others: [5000, 6000], goal_set: false });
ok(notBest.includes('• Sales: *$900*\n') && !/goal \$|on goal|under goal/.test(notBest), 'not the best day: no word at all');
ok(noGoalLine('2027-01') === 'No goal set for January', 'month name');

// 3. Many inputs: goal_set true never changes a byte; goal_set false never shows a goal number.
let seed = 7; const r = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
for (let i = 0; i < 500; i++) {
  const day = { sales: r() < 0.1 ? null : Math.round(r() * 5000), spend: Math.round(r() * 2000), mer: r() * 4, amer: r() < 0.3 ? null : r() * 3, plan: r() < 0.2 ? null : 100 + Math.round(r() * 3000) };
  const month = r() < 0.1 ? {} : { ym: '2026-0' + (1 + Math.floor(r() * 9)), sales: Math.round(r() * 90000), plan: r() < 0.2 ? null : 1000 + Math.round(r() * 90000), spend: Math.round(r() * 30000), day_of_month: 1 + Math.floor(r() * 28), days_in_month: 30 };
  const a = { ...base, day, month, others: Array.from({ length: Math.floor(r() * 5) }, () => Math.round(r() * 5000)), next: r() < 0.3 ? 'Next: new ads Thursday' : null };
  ok(dailyPost(a) === dailyPost({ ...a, goal_set: true }), `random ${i}: default unchanged`);
  const u = dailyPost({ ...a, goal_set: false });
  ok(!/goal \$|on goal|under goal| goal$/m.test(u) && /• No goal set for [A-Z][a-z]+$/m.test(u), `random ${i}: no goal shown`);
}

// 4. My day: "Set <Month>'s goal for <Brand>" for the strategist, else the owner, from the 25th until typed.
ok(goalMonthsDue({ '2026-11': { sales: 1 } }, '2026-11-24').length === 0, 'Nov 24, November set: nothing due');
ok(goalMonthsDue({ '2026-11': { sales: 1 } }, '2026-11-25').join() === '2026-12', 'from the 25th: next month');
ok(goalMonthsDue({ '2026-11': { sales: 1 }, '2026-12': { sales: 2 } }, '2026-11-28').length === 0, 'typed: gone');
ok(goalMonthsDue('{"2026-11":{"sales":1}}', '2026-12-02').join() === '2026-12', 'into the month, still due until typed');
ok(goalMonthsDue({}, '2026-12-30').join() === '2026-12,2027-01', 'year turn');
const OWNER = 'owner@example.com';
const g = { today: '2026-11-26', ownerEmail: OWNER, goals: [
  { act_id: 'brand_dartee_golf', name: 'Brand A', goals_json: '{"2026-11":{"sales":100}}', brief_enabled: 1 },
  { act_id: 'brand_new_one', name: 'Brand B', goals_json: '{"2026-11":{"sales":100}}', brief_enabled: 0 },
  { act_id: 'brand_quiet', name: 'Brand C', goals_json: '{}', brief_enabled: 0 },
  { act_id: 'brand_grunk_dolfer', name: 'Brand D', goals_json: '{"2026-11":{"sales":100},"2026-12":{"sales":100}}', brief_enabled: 1 },
] };
const noma = { name: 'Noma', email: 'noma@example.com' }, owner = { name: 'Boss', email: OWNER }, ahsan = { name: 'Ahsan', email: 'a@example.com' };
const nI = goalItems(g, noma), oI = goalItems(g, owner);
ok(nI.length === 1 && nI[0].text === "Set December's goal for Brand A" && nI[0].bucket === 'today', 'the strategist gets her brand');
ok(nI[0].link.endsWith('/profit/v5/#/brand/dartee-golf/month/plan'), 'links to the v5 Plan page');
ok(oI.length === 1 && oI[0].text === "Set December's goal for Brand B", 'no strategist: the owner gets it');
ok(goalItems(g, ahsan).length === 0, 'December typed: no line');
ok(goalItems({ ...g, today: '2026-11-24' }, noma).length === 0, 'before the 25th: nothing');
const fp = forPerson({ today: '2026-11-26', brands: [], goals: g.goals, ownerEmail: OWNER }, noma);
ok(fp.items.some(i => i.id === 'goal:brand_dartee_golf:2026-12'), 'reaches the My day feed');

// 5. A month key with no sales goal (a margin save or a spend-only save makes one) is still not a goal.
ok(goalMonthsDue({ '2026-11': { sales: 1 }, '2026-12': { cm_pct: 0.4 } }, '2026-11-28').join() === '2026-12', 'margin-only key: still due');
ok(goalMonthsDue({ '2026-11': { sales: 1 }, '2026-12': {} }, '2026-11-28').join() === '2026-12', 'empty key: still due');
ok(goalMonthsDue({ '2026-11': { sales: 1 }, '2026-12': { spend: 500 } }, '2026-11-28').join() === '2026-12', 'spend-only key: still due');

// 6. Goal lines stay in My work and never reach the 5am DM.
const onlyGoal = { items: [{ id: 'goal:x:2026-12', source: 'goal', bucket: 'today', text: "Set December's goal for Brand A", brand: 'Brand A', done: false }], counts: {} };
ok(dmText(onlyGoal, noma, '2026-11-26') === null, 'DM text: a goal line alone sends nothing');
ok(dmMessage(onlyGoal, noma, '2026-11-26') === null, 'DM message: a goal line alone sends nothing');
const mixed = { items: [...onlyGoal.items, { id: 'task:1', source: 'task', bucket: 'today', text: 'Write the brief', brand: 'Brand A', due: '', done: false }], counts: {} };
const mt = dmText(mixed, noma, '2026-11-26');
ok(mt && mt.includes('Write the brief') && !mt.includes("December's goal") && mt.includes('1 for today'), 'DM lists the task, not the goal line');

// 7. The weekly/monthly read: an unplanned month gives the model no goal, plan or projection.
const pl = { account: { name: 'Sample Golf' }, totals: { sales: 1000, spend: 400 },
  forecast: { sales: 1200, spend: 450, months: { '2026-11': { planned: true } } },
  pacing: { month: '2026-11', mtd_sales: 3000, plan_to_date: 2800, goal_sales: 9000, projected: 9500, planned: true } };
const fPl = readFacts(pl);
ok(fPl.month_pacing.month_goal === 9000 && fPl.plan_for_period.sales === 1200 && !('no_goal_set' in fPl), 'planned month: facts unchanged');
const un = { ...pl, forecast: { ...pl.forecast, months: { '2026-12': { planned: false } } }, pacing: { ...pl.pacing, month: '2026-12', planned: false } };
const fUn = readFacts(un);
ok(fUn.plan_for_period === null, 'unplanned: no plan for the period');
ok(fUn.month_pacing.sales_to_date === 3000 && !('month_goal' in fUn.month_pacing) && !('plan_to_date' in fUn.month_pacing) && !('projected' in fUn.month_pacing), 'unplanned: pacing is sales to date only');
ok(fUn.no_goal_set.join() === '2026-12' && !JSON.stringify(fUn).includes('9000') && !JSON.stringify(fUn).includes('2800'), 'unplanned: month named, no goal number');
const wk = readFacts({ ...pl, forecast: { ...pl.forecast, months: { '2026-11': { planned: true }, '2026-12': { planned: false } } }, pacing: undefined });
ok(wk.plan_for_period === null && wk.no_goal_set.join() === '2026-12', 'week across a planned and an unplanned month: no plan');

// 8. A goal typed into "default" counts (2026-11-26 later): brands keep the current month's goal there. Only falling
//    back to a PREVIOUS month's key is unplanned. An own key without sales falls back to default's sales.
const typedDefault = { '2026-08': { sales: 5 }, default: { sales: 7, spend: 3 }, '2026-09': { sales: 6 }, '2026-10': { sales: 7, spend: 3 } };
ok(monthPlanned(typedDefault, '2026-11') === true, 'no own key, default has sales: planned');
ok(monthPlanned(JSON.stringify(typedDefault), '2026-11') === true, 'JSON string input');
ok(monthPlanned({ default: { sales: 7 } }, '2026-11') === true, 'default only: planned');
ok(monthPlanned({ '2026-11': { sales: 9 }, default: { sales: 7 } }, '2026-11') === true, 'own key and default: planned');
ok(monthPlanned({ '2026-11': { cm_pct: 0.4 }, default: { sales: 7, cm_pct: 0.4 } }, '2026-11') === true, 'margin-only own key, default has sales: planned');
ok(monthPlanned({ '2026-11': { spend: 500 }, default: { spend: 500 } }, '2026-11') === false, 'spend-only own key, default spend-only: unplanned');
ok(monthPlanned({ '2026-10': { sales: 7 } }, '2026-11') === false, 'previous month only: unplanned');
ok(monthPlanned({ '2026-10': { sales: 7 }, default: { cm_pct: 0.4 } }, '2026-11') === false, 'previous month and a margin-only default: unplanned');
ok(monthPlanned({}, '2026-11') === false && monthPlanned(null, '2026-11') === false && monthPlanned('not json', '2026-11') === false, 'nothing: unplanned');
ok(goalMonthsDue(typedDefault, '2026-11-24').length === 0, 'My day: November covered by default, nothing due before the 25th');
ok(goalMonthsDue({ '2026-10': { sales: 7 } }, '2026-11-02').join() === '2026-11', 'My day: previous month only, still due');

// 9. Default cannot say which month it was typed for (every save writes the month key AND default), so it covers only
//    up to DEFAULT_LAST_MONTH and only while no later month has a key. The save shape {default, last month} must not
//    plan December or any later month, so "Set December's goal" still shows and Dec 1 reads "No goal set".
const saved = { default: { sales: 100 }, '2026-10': { sales: 100 } };   // what every save path leaves behind
ok(monthPlanned(saved, '2026-11') === true, 'save shape: November planned by the legacy default');
ok(monthPlanned(saved, '2026-12') === false, 'save shape: December NOT planned');
ok(monthPlanned(saved, '2027-03') === false, 'save shape: a later month NOT planned');
ok(monthPlanned(saved, '2026-09') === false, 'save shape: a month before a dated key is not planned by default');
ok(monthPlanned({ default: { sales: 5 } }, '2026-12') === false, 'default only: December still needs its own key');
ok(monthPlanned({ default: { sales: 5 }, '2026-12': { sales: 5 } }, '2026-11') === false, 'a later key means default was rewritten: November not planned by it');
ok(monthPlanned({ default: { sales: 5 }, '2026-12': { sales: 5 } }, '2026-12') === true, 'the later month planned by its own key');
ok(goalMonthsDue(saved, '2026-11-26').join() === '2026-12', 'My day: from the 25th December is due even with a default');
ok(goalMonthsDue(saved, '2026-12-01').join() === '2026-12', 'My day: Dec 1, still due until typed');
const gDef = { ...g, goals: [{ act_id: 'brand_dartee_golf', name: 'Brand A', goals_json: JSON.stringify(saved), brief_enabled: 1 }] };
ok(goalItems(gDef, noma).length === 1 && goalItems(gDef, noma)[0].text === "Set December's goal for Brand A", 'My day: Set December line with a default');
// keepDefaultMonth: a save for another month first writes the legacy goal into November's own key.
const k1 = keepDefaultMonth({ default: { sales: 100, cm_pct: 0.4 }, '2026-10': { sales: 90 } }, '2026-12');
ok(k1['2026-11']?.sales === 100 && k1['2026-11'].cm_pct === 0.4 && k1['2026-10'].sales === 90, 'keep: November gets the default goal');
const k2 = keepDefaultMonth({ default: { sales: 100 }, '2026-11': { cm_pct: 0.3 } }, 'default');
ok(k2['2026-11'].sales === 100 && k2['2026-11'].cm_pct === 0.3, 'keep: an own margin-only key keeps its margin');
ok(!('2026-11' in keepDefaultMonth({ default: { sales: 100 } }, '2026-11')), 'keep: a save for November itself needs nothing');
ok(!('2026-11' in keepDefaultMonth({ default: { sales: 100 }, '2026-12': { sales: 1 } }, '2027-01')), 'keep: default no longer covers November, nothing written');
ok(!('2026-11' in keepDefaultMonth({ '2026-10': { sales: 9 } }, '2026-12')), 'keep: no default goal, nothing written');

console.log(`${n - bad}/${n} passed`);
if (bad) process.exit(1);

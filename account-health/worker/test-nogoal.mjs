// Offline checks for "no goal typed, no goal shown" (2026-11-26): the client daily (clientpost.js dailyPost goal_set) and
// the My day line for the brand's owner (mywork.js goalItems). Run: node test-nogoal.mjs
import { dailyPost, noGoalLine } from './src/clientpost.js';
import { _test } from './src/mywork.js';
const { goalMonthsDue, goalItems, forPerson } = _test;
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

console.log(`${n - bad}/${n} passed`);
if (bad) process.exit(1);

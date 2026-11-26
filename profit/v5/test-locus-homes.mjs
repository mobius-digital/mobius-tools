// node test-locus-homes.mjs (from profit/v5). No DOM, no network.
// The Locus homes for the posts that had none (2026-11-26): the pure parts of each page row.
//   a45 Agency > Creators > To review, "Falling behind" (pages/a-creators/_asks.js)
//   a10 My day plan box (pages/my-day/_plan.js) and Agency > Team, today's check-in (pages/a-team/_checkin.js)
//   a34 Meetings > Past meetings, Pull tasks (pages/a-meetings/_pull.js)
//   a66 Sales > Inventory, the stock digest (pages/sales/_digest.js)
//   a54 Meetings > Agenda, week plans still to write (pages/a-meetings/_weekplan.js)
import assert from 'node:assert/strict';

globalThis.location = { search: '', hostname: 'localhost', hash: '', pathname: '/' };
const store = new Map();
globalThis.localStorage = { getItem: k => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: k => store.delete(k) };
globalThis.sessionStorage = globalThis.localStorage;

const { asksRows } = await import('./pages/a-creators/_asks.js');
const { mine, planLines } = await import('./pages/my-day/_plan.js');
const { boardRows } = await import('./pages/a-team/_checkin.js');
const { pickedItems } = await import('./pages/a-meetings/_pull.js');
const { digestLines } = await import('./pages/sales/_digest.js');
const { weekRows } = await import('./pages/a-meetings/_weekplan.js');

let n = 0;
const ok = (name, fn) => { fn(); n++; console.log('ok  ' + name); };
const no = x => !/[—–]/.test(JSON.stringify(x));

ok('a45: Falling behind rows, reviews 2+ days first, then Discord, then rebook', () => {
  const rows = asksRows({ fresh: true, brands: [
    { act: 'brand_northlake_golf', name: 'Northlake Golf', old_review: 0, discord: 2, rebook: [{ name: 'Bo Lane' }, { name: 'Cy Reed' }] },
    { act: 'brand_harbor_pine', name: 'Harbor & Pine', old_review: 3, discord: null, rebook: [] }] });
  assert.deepEqual(rows.map(r => r.kind), ['old', 'discord', 'rebook']);
  assert.equal(rows[0].text, '3 videos waiting for a yes 2 days or more');
  assert.equal(rows[1].text, '2 creators waiting on an answer in Discord');
  assert.equal(rows[2].text, 'Rebook this week: Bo Lane, Cy Reed');
  assert.deepEqual(asksRows(null), []);
  assert.ok(no(rows));
});

ok('a10: my row on the board only when I am on the list; the plan box splits lines', () => {
  const board = { me: 'U0SAMPLE01', on_list: true, people: [{ uid: 'U0SAMPLE01', name: 'Sam', state: 'none' }, { uid: 'U0SAMPLE02', name: 'Jordan', state: 'plan' }] };
  assert.equal(mine(board).name, 'Sam');
  assert.equal(mine({ ...board, on_list: false }), null);
  assert.equal(mine(null), null);
  assert.deepEqual(planLines('- Brief 16\n\n• Recut  the best video\n* Check the calls'), ['Brief 16', 'Recut the best video', 'Check the calls']);
});

ok('a10: Agency > Team check-in rows, not posted first, week only people left out', () => {
  const rows = boardRows({ people: [
    { name: 'Sam', state: 'plan', plan: { at: '2026-12-01T15:05:00Z' }, items: ['a', 'b', 'c', 'd'], wrap: { done: 2, of: 4 } },
    { name: 'Riley', state: 'out', back: 'Thu' },
    { name: 'Jordan', state: 'none', need: ['Cole: the final price'] },
    { name: 'Morgan', state: 'none', week_only: true }] });
  assert.deepEqual(rows.map(r => [r.name, r.state]), [['Jordan', 'none'], ['Sam', 'plan'], ['Riley', 'out']]);
  assert.equal(rows[1].items.length, 3); assert.equal(rows[1].more, 1); assert.equal(rows[1].wrap, 'wrap-up: 2 of 4 done');
  assert.equal(rows[2].label, 'Out today, back Thu'); assert.equal(rows[0].label, 'No plan yet'); assert.equal(rows[0].need, 'Cole: the final price');
});

ok('a34: only the ticked suggestions go to keep, at most 5', () => {
  const items = Array.from({ length: 6 }, (_, i) => ({ act: 'brand_northlake_golf', text: 'Task ' + i, owner: 'Sam', due: '', area: '', sure: true, quote: 'q' }));
  const p = pickedItems(items, new Set([0, 2, 3, 4, 5, 1]));
  assert.equal(p.length, 5);
  assert.deepEqual(Object.keys(p[0]).sort(), ['act', 'area', 'detail', 'due', 'owner', 'text']);
  assert.deepEqual(pickedItems(items, new Set([3])).map(x => x.text), ['Task 3']);
  assert.deepEqual(pickedItems(items, new Set()), []);
});

ok('a66: the stock digest lines match the Monday post (summary, colors, first six decisions)', () => {
  const st = { headline: { toOrder: 2, overdue: 1, onTheWay: 1, nextLanding: '2026-12-10', revenueAtRisk: 12500, dead: { cost: 1800 } },
    decisions: Array.from({ length: 8 }, (_, i) => ({ kind: ['bad', 'warn', 'good', 'brand', 'unk'][i % 5], title: 'Decision ' + i + ' — now', body: 'Why ' + i })) };
  const g = digestLines(st);
  assert.equal(g.summary, '2 to order (1 overdue), 1 on the way, next lands Dec 10, $13k at risk, $1.8k dead stock');
  assert.equal(g.tone, 'bad'); assert.equal(g.items.length, 6); assert.equal(g.more, 2);
  assert.deepEqual(g.items.map(x => x.tone).slice(0, 5), ['bad', 'warn', 'good', '', 'off']);
  assert.equal(g.items[0].title, 'Decision 0, now', 'no dashes reach the page');
  assert.equal(digestLines({ headline: { toOrder: 0, onTheWay: 0 }, decisions: [] }).tone, 'good');
  assert.equal(digestLines({}), null);
  assert.ok(no(g));
});

ok('a54: week plans still to write, one row per strategist, nothing when off or not Monday', () => {
  const r = { on: true, monday: true, brands: [{ act: 'a', name: 'Northlake Golf', strategist: 'Sam' }, { act: 'b', name: 'Harbor & Pine', strategist: 'Sam' }, { act: 'c', name: 'Summit Sticks', strategist: '' }] };
  const rows = weekRows(r);
  assert.deepEqual(rows.map(x => [x.who, x.text]), [['Sam', "Write this week's plan for 2 brands"], ['The owner', "Write this week's plan for 1 brand"]]);
  assert.deepEqual(weekRows({ ...r, on: false }), []);
  assert.deepEqual(weekRows({ ...r, monday: false }), []);
  assert.deepEqual(weekRows(null), []);
});

console.log(`test-locus-homes: ${n} checks passed`);

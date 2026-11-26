// node test-movelines.mjs (from profit/v5). No DOM, no network.
// The move lines in the bell (bell.js): late and due tasks grouped into one row, the account-health move lines
// (movelines.js) drawn with their own page link and label, the "no plan yet" nudge kept off the bell, and the ad calls
// row counting the test minimums due off (a3).
import assert from 'node:assert/strict';

globalThis.location = { search: '', hostname: 'localhost', hash: '', pathname: '/' };
const store = new Map();
globalThis.localStorage = { getItem: k => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: k => store.delete(k) };
globalThis.sessionStorage = globalThis.localStorage;
const { fromMyWork, groupTasks, waitingFrom, LINE_SOURCES } = await import('./bell.js');

let n = 0;
const ok = (name, fn) => { fn(); n++; console.log('ok  ' + name); };
const task = (id, bucket) => ({ id: 'task:' + id, source: 'task', bucket, text: 'Task ' + id, brand: 'Northlake Golf', due: bucket === 'late' ? '2026-11-20' : '' });

ok('two or more late or due tasks are ONE bell row with a count', () => {
  const rows = groupTasks([task(1, 'late'), task(2, 'today'), task(3, 'late'), { id: 'card:x', source: 'card', bucket: 'today', text: 'A card' }]);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].source, 'tasks');
  assert.equal(rows[0].text, '2 tasks late, 1 due today');
  assert.equal(rows[0].n, 3);
  assert.equal(rows[1].source, 'card');
  const b = fromMyWork({ items: [task(1, 'late'), task(2, 'late')] });
  assert.equal(b.needs.length, 1);
  assert.equal(b.needs[0].text, '2 tasks late');
  assert.equal(b.needs[0].when, 'late');
  assert.deepEqual(b.needs[0].btn, { label: 'Open My day', line: 'my-day', tab: 'index' });
});

ok('one task stays its own row; due only reads "tasks due today"', () => {
  assert.equal(fromMyWork({ items: [task(1, 'today')] }).needs[0].text, 'Task 1');
  assert.equal(groupTasks([task(1, 'today'), task(2, 'today')])[0].text, '2 tasks due today');
});

ok('a move line opens its page in this app with its own label', () => {
  const b = fromMyWork({ items: [
    { id: 'connect:2026-11-26', source: 'connect', bucket: 'today', text: '2 client connect asks waiting on you', detail: 'Klaviyo private key for Northlake Golf', from: 'Connect link', v5: '#/agency/all/a-settings/integrations', btn_label: 'Open Integrations' },
    { id: 'comments:2026-11-26', source: 'comments', bucket: 'today', text: 'Changes asked on card 12', from: 'Card comments', link: 'https://example.test/card', btn_label: 'Open card' },
  ] });
  assert.equal(b.needs.length, 2);
  assert.deepEqual(b.needs[0].btn, { label: 'Open Integrations', href: '#/agency/all/a-settings/integrations' });
  assert.equal(b.needs[0].by, 'Connect link');
  assert.equal(b.needs[0].kind, 'connect');
  assert.equal(b.needs[0].detail, 'Klaviyo private key for Northlake Golf');
  assert.deepEqual(b.needs[1].btn, { label: 'Open card', href: 'https://example.test/card' });
});

ok('the no plan nudge is My day only, never a bell row', () => {
  const b = fromMyWork({ items: [{ id: 'checkin:2026-11-26', source: 'checkin', bucket: 'today', top: true, nudge: true, text: 'Your plan for today is not in' }] });
  assert.equal(b.needs.length + b.watching.length + b.done.length, 0);
});

ok('a week out countdown sits in Watching', () => {
  const b = fromMyWork({ items: [{ id: 'date:x', source: 'dates', bucket: 'week', text: 'Spring drop goes live Thu Dec 3: 2 steps open', due: '2026-12-03', v5: '#/agency/all/a-calendar/index', btn_label: 'Open the calendar' }] });
  assert.equal(b.needs.length, 0);
  assert.equal(b.watching.length, 1);
  assert.equal(b.watching[0].btn.href, '#/agency/all/a-calendar/index');
});

ok('the ad calls row counts test minimums due off', () => {
  const calls = { rows: [
    { act_id: 'brand_northlake_golf', brand: 'Northlake Golf', kind: 'minoff' },
    { act_id: 'brand_northlake_golf', brand: 'Northlake Golf', kind: 'minoff' },
    { act_id: 'brand_northlake_golf', brand: 'Northlake Golf', kind: 'cut' },
    { act_id: 'brand_pine_ridge', brand: 'Pine Ridge', kind: 'scale' },
  ] };
  const w = waitingFrom({ calls }, []);
  const nl = w.items.find(i => i.act_id === 'brand_northlake_golf'), pr = w.items.find(i => i.act_id === 'brand_pine_ridge');
  assert.equal(nl.n, 3); assert.equal(nl.min, 2);
  assert.equal(nl.by, 'Ad calls, 2 test minimums due off');
  assert.equal(pr.by, 'Ad calls');
});

ok('the line sources match the worker and nothing says a dash', () => {
  assert.deepEqual(LINE_SOURCES, ['checkin', 'weekplan', 'dates', 'comments', 'newmeta', 'connect', 'creators']);
  const all = JSON.stringify(fromMyWork({ items: [task(1, 'late'), task(2, 'today')] }));
  assert.ok(!/[—–]/.test(all));
});

console.log(n + ' passed');
/* data.js keeps a timer for the live app; the checks are done */
process.exit(0);

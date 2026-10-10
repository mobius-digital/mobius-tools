/* Offline checks for per-block dashboard dates (2026-10-10):
 *  - profit dashboard.js cleanSpec / cleanDates: an old spec is unchanged, a block's own range is kept,
 *    an invalid one is dropped (the block falls back to the dashboard's dates);
 *  - the Locus front end (dashQuery / dashEff lifted out of profit/index.html): an old spec reads one
 *    range, a block with its own dates reads its own query;
 *  - the Slack post (worker.js dashNumbers + dashBlocks): each block's numbers come from its own range
 *    and the block says that range; a dashboard with no block dates reads and posts exactly as before.
 *   node test-dashrange.mjs      (from account-health/worker)
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { cleanSpec, cleanDates } from '../../profit/worker/src/dashboard.js';
import { dashNumbers, dashBlocks, dashRange } from './src/worker.js';

const checks = [];
const check = async (name, fn) => { try { await fn(); checks.push({ name, pass: true }); } catch (e) { checks.push({ name, pass: false, error: e.message }); } };

/* ---------- cleanSpec ---------- */
const OLD = { scope: 'all', range: '7', compare: 'prev', blocks: [
  { type: 'tiles', title: 'The numbers', metrics: ['revenue', 'spend', 'mer'] },
  { type: 'brands', title: '', columns: ['revenue', 'spend'] },
  { type: 'daily', title: '' }, { type: 'note', title: '', text: 'Hello' }] };
await check('old spec unchanged by cleanSpec (no dates key appears)', () => {
  const c = cleanSpec(OLD, 'all');
  assert.deepEqual(c, OLD);
  assert.ok(c.blocks.every(b => !('dates' in b)));
});
await check('block range kept by cleanSpec (preset, N days, custom, compare)', () => {
  const c = cleanSpec({ ...OLD, blocks: [
    { type: 'tiles', title: 'CPA', metrics: ['cac'], dates: { range: '7' } },
    { type: 'brands', title: '', columns: ['revenue'], dates: { range: 'mtd', compare: 'yoy' } },
    { type: 'email', title: '', dates: { range: 'custom', from: '2026-09-01', to: '2026-09-30', compare: 'none' } },
    { type: 'daily', title: '', dates: { range: '14' } }] }, 'all');
  assert.deepEqual(c.blocks[0].dates, { range: '7' });
  assert.deepEqual(c.blocks[1].dates, { range: 'mtd', compare: 'yoy' });
  assert.deepEqual(c.blocks[2].dates, { range: 'custom', from: '2026-09-01', to: '2026-09-30', compare: 'none' });
  assert.deepEqual(c.blocks[3].dates, { range: '14' });
  assert.equal(c.range, '7');
});
await check('invalid block range dropped by cleanSpec, block kept on the dashboard dates', () => {
  const bad = [{ range: 'forever' }, { range: '0' }, { range: '120' }, { range: 'custom', from: '2026-09-30', to: '2026-09-01' },
    { range: 'custom', from: '2026-02-30', to: '2026-03-02' }, { range: 'custom', from: '2024-01-01', to: '2026-01-01' }, { range: 'custom' }, 'last week', null];
  for (const d of bad) assert.equal(cleanDates(d), null, JSON.stringify(d));
  const c = cleanSpec({ ...OLD, blocks: [{ type: 'tiles', title: '', metrics: ['revenue'], dates: { range: 'forever' } },
    { type: 'note', title: '', text: 'x', dates: { range: '7' } }, { type: 'tiles', title: '', metrics: ['revenue'], dates: { range: '30', compare: 'later' } }] }, 'all');
  assert.equal(c.blocks.length, 3);
  assert.ok(!('dates' in c.blocks[0]));
  assert.ok(!('dates' in c.blocks[1]), 'a note cannot carry dates');
  assert.deepEqual(c.blocks[2].dates, { range: '30' }, 'an unknown compare is dropped, the range kept');
});

/* ---------- Locus front end: dashQuery / dashEff from profit/index.html ---------- */
const html = fs.readFileSync(new URL('../../profit/index.html', import.meta.url), 'utf8');
const grab = (start, end) => { const i = html.indexOf(start); assert.ok(i >= 0, 'missing ' + start); return html.slice(i, html.indexOf(end, i)); };
const src = [grab('const DASH_RANGE_L', '\n'), grab('function dashQuery(spec)', 'function dashTotals')].join('\n');
const FE = new Function('ymd', `${src}; return { dashQuery, dashEff, dashRangeText };`)(d => d.toISOString().slice(0, 10));
await check('front end: an old spec reads one range, a block with its own dates reads its own', () => {
  assert.equal(FE.dashQuery(OLD), 'days=7');
  for (const b of OLD.blocks) assert.equal(FE.dashEff(OLD, b), OLD, 'no dates = the dashboard spec itself');
  const e = FE.dashEff(OLD, { type: 'tiles', dates: { range: 'custom', from: '2026-09-01', to: '2026-09-30', compare: 'yoy' } });
  assert.equal(FE.dashQuery(e), 'from=2026-09-01&to=2026-09-30&cmp=yoy');
  assert.equal(e.__own, true);
  assert.equal(FE.dashRangeText(e), '2026-09-01 to 2026-09-30');
  const same = FE.dashEff(OLD, { type: 'tiles', dates: { range: '7' } });
  assert.equal(same.__own, false, 'the same dates as the dashboard do not say so');
  assert.equal(FE.dashQuery(FE.dashEff(OLD, { type: 'daily', dates: { range: '14' } })), 'days=14');
});

/* ---------- Slack post ---------- */
const accounts = [{ act_id: 'brand_a', name: 'Alpha', currency: 'USD', tz: 'America/Chicago' }, { act_id: 'brand_b', name: 'Bravo', currency: 'USD', tz: 'America/Chicago' }];
const reads = [];
const read = async (env, a, from, to) => { reads.push(`${a.act_id} ${from} ${to}`); const custom = from === '2026-09-01'; const v = custom ? 5000 : 1000;
  return { revenue: v, ad_spend: v / 4, orders: v / 100, new_customers: v / 200, new_customer_revenue: v / 2, email_revenue: v / 10, meta_spend: v / 5, google_spend: v / 20, contribution_margin: v / 3 }; };
const row = spec => ({ id: 'db_0123456789', name: 'Morning', channel: 'C0123456', for_who: '', spec_json: JSON.stringify(spec) });
const textOf = blocks => blocks.map(b => b.text?.text || (b.elements || []).map(e => e.text?.text || e.text || '').join(' ')).join('\n');

await check('Slack post: an old spec reads only the dashboard range and posts as before', async () => {
  reads.length = 0;
  const d = await dashNumbers({}, row(OLD), { accounts, read });
  const r = dashRange(accounts[0], '7');
  assert.equal(reads.length, 4, 'two brands, current + compare, nothing more');
  assert.ok(reads.includes(`brand_a ${r.from} ${r.to}`));
  assert.ok(d.blk.every(x => x === null));
  const t = textOf(dashBlocks(row(OLD), d));
  assert.match(t, /Last 7 days/);
  assert.doesNotMatch(t, /2026-09-01 to/);
});
await check('Slack post: a block with its own range reads it and says it', async () => {
  reads.length = 0;
  const spec = { ...OLD, blocks: [{ type: 'tiles', title: 'Week', metrics: ['revenue'] },
    { type: 'tiles', title: 'September', metrics: ['revenue'], dates: { range: 'custom', from: '2026-09-01', to: '2026-09-30', compare: 'none' } },
    { type: 'brands', title: 'Brands in September', columns: ['revenue'], dates: { range: 'custom', from: '2026-09-01', to: '2026-09-30', compare: 'none' } }] };
  const d = await dashNumbers({}, row(spec), { accounts, read });
  assert.ok(reads.includes('brand_a 2026-09-01 2026-09-30') && reads.includes('brand_b 2026-09-01 2026-09-30'));
  assert.equal(reads.filter(x => x.includes('2026-09-01 2026-09-30')).length, 2, 'two blocks with the same dates share one read per brand');
  assert.equal(reads.length, 6, 'dashboard range (2 brands x cur+prev) + the custom range (2 brands, compare none)');
  const blocks = dashBlocks(row(spec), d);
  const week = blocks.find(b => b.text?.text?.startsWith('*Week*')).text.text;
  const sep = blocks.find(b => b.text?.text?.startsWith('*September*')).text.text;
  const tbl = blocks.find(b => b.text?.text?.startsWith('*Brands in September*')).text.text;
  assert.match(week, /Revenue: \*\$2\.0K\* \(\+0%\)/, 'the dashboard block: two brands x 1000, with its delta');
  assert.match(sep, /_2026-09-01 to 2026-09-30_/, 'the block says its own range');
  assert.match(sep, /Revenue: \*\$10\.0K\*/, 'the block reads its own numbers (2 x 5000)');
  assert.doesNotMatch(sep, /\(\+|\(-/, 'compare none: no delta');
  assert.match(tbl, /2026-09-01 to 2026-09-30/);
  assert.match(tbl, /\$5\.0K/);
  assert.match(textOf(blocks.slice(0, 2)), /Last 7 days/, 'the header still carries the dashboard range');
});
await check('Slack post: a block range with its own compare reads that compare period', async () => {
  reads.length = 0;
  const spec = { ...OLD, compare: 'none', blocks: [{ type: 'email', title: '', dates: { range: 'custom', from: '2026-09-01', to: '2026-09-30', compare: 'yoy' } }] };
  const d = await dashNumbers({}, row(spec), { accounts: [accounts[0]], read });
  assert.ok(reads.includes('brand_a 2025-09-01 2025-09-30'), 'same dates last year');
  const t = textOf(dashBlocks(row(spec), d));
  assert.match(t, /\*Email and SMS\*\n_2026-09-01 to 2026-09-30, deltas vs same dates last year_/);
});

/* ---------- The Strategist's save_dashboard ---------- */
const strat = await import('./src/strategist.js');
await check('save_dashboard: a block range from the words is kept, a bad one dropped, none = as before', async () => {
  const a = strat._test.BUILD_ACTIONS({}).find(x => x.name === 'save_dashboard');
  assert.ok(a.input_schema.properties.blocks.items.properties.dates, 'the schema offers dates on a block');
  assert.match(a.description, /its OWN dates/);
  const p = await a.propose({}, { name: 'Morning', brand: 'all', range: '30', summary: 's', blocks: [
    { type: 'tiles', title: 'CPA', metrics: ['cac'], dates: { range: '7' } },
    { type: 'tiles', title: 'Money', metrics: ['revenue'] },
    { type: 'email', title: 'Email', dates: { range: 'someday' } },
    { type: 'note', text: 'hi', dates: { range: '7' } }] });
  assert.ok(!p.error, p.error);
  const bl = p.patch.spec.blocks;
  assert.deepEqual(bl[0].dates, { range: '7' });
  assert.ok(!('dates' in bl[1]) && !('dates' in bl[2]) && !('dates' in bl[3]));
  assert.match(p.preview, /CPA: cac \[own dates: Last 7 days\]/);
  assert.equal(p.patch.spec.range, '30');
  assert.deepEqual(cleanSpec(p.patch.spec, 'all'), p.patch.spec, 'what the Strategist saves is what cleanSpec keeps');
});

let bad = 0;
for (const c of checks) { console.log(`${c.pass ? 'PASS' : 'FAIL'}  ${c.name}${c.error ? '\n      ' + c.error : ''}`); if (!c.pass) bad++; }
console.log(`\n${checks.length - bad}/${checks.length} passed`);
process.exit(bad ? 1 : 0);

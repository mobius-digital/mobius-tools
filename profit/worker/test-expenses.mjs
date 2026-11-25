/* Offline checks for src/expenses.js (Costs like Triple Whale, 2026-10-10).
 *   node test-expenses.mjs      (from profit/worker)
 * A real SQLite (node:sqlite) stands in for D1. Checks: every kind spreads per day the way the Costs page says;
 * end dates and windows clip; old p_fixed_cost rows are copied once as monthly costs and a deleted one never comes
 * back; "counts as ad spend" raises spend and lowers MER / CM through the REAL profit worker (/api/client and the
 * drill-down), while the other expenses only feed Net profit; bad input is refused. Who may edit which brand is
 * checked in account-health/worker/test-clients.mjs (the real auth path). */
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..', '..');
const db = new DatabaseSync(':memory:');
const bindSql = sql => sql.replace(/\?(\d+)/g, (_, n) => ':p' + n);
const vals = a => Object.fromEntries(a.map((v, i) => ['p' + (i + 1), v === undefined ? null : typeof v === 'boolean' ? +v : v]));
const stmt = sql => { let args = []; const st = () => db.prepare(bindSql(sql)); return { bind(...a) { args = a; return this; }, async first() { return st().get(vals(args)) || null; }, async all() { return { results: st().all(vals(args)) }; }, async run() { const r = st().run(vals(args)); return { meta: { changes: r.changes } }; } }; };
const DB = { prepare: stmt, async batch(list) { const out = []; for (const s of list) out.push(await s.run()); return out; } };
const load = f => { for (const st of fs.readFileSync(f, 'utf8').replace(/--[^\n]*/g, '').split(/;\s*(?:\n|$)/)) { try { if (st.trim()) db.exec(st); } catch { /* re-applied */ } } };
load(path.join(root, 'profit', 'worker', 'schema.sql'));
load(path.join(root, 'profit', 'worker', 'migrations', 'brand-001.sql'));
load(path.join(root, 'account-health', 'worker', 'schema.sql'));
load(path.join(root, 'profit', 'worker', 'migrations', 'fixed-001.sql'));

const X = await import('./src/expenses.js');
const checks = [];
async function check(name, fn) { try { await fn(); checks.push(true); console.log('PASS ', name); } catch (e) { checks.push(false); console.log('FAIL ', name, '\n      ' + (e.stack || e.message).split('\n').slice(0, 3).join('\n      ')); } }
const near = (a, b, msg) => assert.ok(Math.abs(a - b) < 0.011, `${msg}: ${a} != ${b}`);

/* Three days of store numbers: revenue, platform spend, paid orders. */
const ROWS = () => [
  { date: '2026-10-01', sales: 1000, spend: 200, orders: 10, new_rev: 500, gross_profit: 600, cm: 400, mer: 5 },
  { date: '2026-10-02', sales: 2000, spend: 400, orders: 20, new_rev: 800, gross_profit: 1200, cm: 800, mer: 5 },
  { date: '2026-10-03', sales: 0, spend: 100, orders: 0, new_rev: 0, gross_profit: 0, cm: -100, mer: 0 },
];

await check('monthly: spread evenly over its month\'s days (3,100 in October = 100 a day), clipped to start and end', () => {
  const s = X.spread([{ id: 1, name: 'Rent', kind: 'monthly', amount: 3100, start_date: '2026-09-01' }], '2026-10-01', '2026-10-03', ROWS());
  near(s.total, 300, 'three days'); near(s.byDate['2026-10-02'], 100, 'a day');
  const c = X.spread([{ name: 'Rent', kind: 'monthly', amount: 3100, start_date: '2026-10-02', end_date: '2026-10-02' }], '2026-10-01', '2026-10-31', ROWS());
  near(c.total, 100, 'only its one day');
  const feb = X.spread([{ name: 'Rent', kind: 'monthly', amount: 2800, start_date: '2026-01-01' }], '2027-02-01', '2027-02-28', []);
  near(feb.total, 2800, 'a whole short month adds to the monthly amount');
  near(X.spread([{ name: 'x', kind: 'monthly', amount: 3100, start_date: '2026-11-01' }], '2026-10-01', '2026-10-31', []).total, 0, 'not started yet');
});
await check('one time: the whole amount on its date, and only when the window holds that date', () => {
  const e = [{ name: 'Photo shoot', kind: 'once', amount: 1500, start_date: '2026-10-02', end_date: '2026-12-31' }];
  const s = X.spread(e, '2026-10-01', '2026-10-03', ROWS());
  near(s.total, 1500, 'in window'); assert.deepEqual(Object.keys(s.byDate), ['2026-10-02']);
  near(X.spread(e, '2026-10-03', '2026-10-31', ROWS()).total, 0, 'outside the window');
});
await check('% of revenue, % of ad spend and per order follow each day\'s numbers', () => {
  const s = X.spread([
    { name: 'Royalty', kind: 'pct_revenue', amount: 5, start_date: '2026-01-01' },
    { name: 'Agency 10%', kind: 'pct_spend', amount: 10, start_date: '2026-01-01' },
    { name: 'Insert card', kind: 'per_order', amount: 0.5, start_date: '2026-10-02' },
  ], '2026-10-01', '2026-10-03', ROWS());
  const by = Object.fromEntries(s.items.map(i => [i.name, i.amount]));
  near(by.Royalty, 150, '5% of 3,000'); near(by['Agency 10%'], 70, '10% of 700'); near(by['Insert card'], 10, '20 orders from Oct 2');
  near(s.total, 230, 'total');
  assert.equal(X.spread([{ name: 'r', kind: 'pct_revenue', amount: 5, start_date: '2026-01-01' }], '2026-10-01', '2026-10-03', []).items.length, 0, 'no rows = nothing to take a % of');
});
await check('"counts as ad spend" goes to its own pile, joins spend, and MER / aMER / CM follow; % of ad spend reads the platforms alone', () => {
  const list = [{ name: 'Influencer', kind: 'monthly', amount: 3100, start_date: '2026-10-01', is_ad_spend: 1 }, { name: 'Agency 10%', kind: 'pct_spend', amount: 10, start_date: '2026-10-01' }];
  const rows = ROWS();
  const s = X.spread(list, '2026-10-01', '2026-10-03', rows);
  near(s.ad_total, 300, 'ad pile'); near(s.total, 70, 'the rest'); assert.equal(s.ad_items[0].name, 'Influencer');
  X.applyAdSpend(rows, s.adByDate);
  assert.equal(rows[0].spend, 300); assert.equal(rows[0].base_spend, 200); assert.equal(rows[0].ad_expense, 100);
  near(rows[0].mer, 1000 / 300, 'MER on the new spend'); near(rows[0].amer, 500 / 300, 'aMER'); assert.equal(rows[0].cm, 300, 'CM = GP - new spend');
  X.applyAdSpend(rows, s.adByDate); assert.equal(rows[0].spend, 300, 'never added twice');
  near(X.spread(list, '2026-10-01', '2026-10-03', rows).total, 70, '% of ad spend still reads the platforms, not the expense');
});
await check('bad input is refused with a plain sentence', () => {
  assert.match(X.clean({ name: '' })[0], /needs a name/);
  assert.match(X.clean({ name: 'a', amount: 'x', start_date: '2026-10-01' })[0], /not a number/);
  assert.match(X.clean({ name: 'a', amount: 120, kind: 'pct_revenue', start_date: '2026-10-01' })[0], /more than 100/);
  assert.match(X.clean({ name: 'a', amount: 1, start_date: '' })[0], /pick the date/);
  assert.match(X.clean({ name: 'a', amount: 1, start_date: '2026-10-05', end_date: '2026-10-01' })[0], /before the start/);
  const [err, c] = X.clean({ name: 'Shoot', kind: 'once', amount: '$1,500', start_date: '2026-10-02', end_date: '2026-12-01', category: 'nope', is_ad_spend: 'yes' });
  assert.equal(err, null); assert.equal(c.amount, 1500); assert.equal(c.end_date, null, 'a one-time cost has no end'); assert.equal(c.category, 'nope', 'a category is the brand\'s own words'); assert.equal(c.is_ad_spend, 1);
  assert.ok(!/—/.test(JSON.stringify([X.CATEGORIES, X.KINDS])), 'no em dashes in the choices');
});

/* ---------- 2026-11-25: free-text categories and the new time kinds ---------- */
const sumOf = (e, from, to) => X.spread([e], from, to, []).total;
await check('a category is free text the brand names: kept as typed up to 40 characters, a suggestion by name is its id, old ids still read', () => {
  const cat = v => { const [err, c] = X.clean({ name: 'a', amount: 1, start_date: '2026-10-01', category: v }); return err || c.category; };
  assert.equal(cat('  Photo   shoots '), 'Photo shoots', 'trimmed, inner spaces squeezed, kept as typed');
  assert.equal(cat('Software'), 'software'); assert.equal(cat('RENT AND PREMISES'), 'rent', 'a suggestion typed by its label is the old id');
  assert.equal(cat('contractors'), 'contractors'); assert.equal(cat(''), 'other'); assert.equal(cat(undefined), 'other');
  for (const old of ['team', 'software', 'rent', 'agency', 'marketing', 'other']) assert.equal(cat(old), old, `an old row's "${old}" is kept`);
  assert.equal(cat('x'.repeat(40)), 'x'.repeat(40)); assert.match(cat('x'.repeat(41)), /up to 40 characters/);
  assert.equal(X.categoryLabel('software'), 'Software'); assert.equal(X.categoryLabel('Photo shoots'), 'Photo shoots'); assert.equal(X.categoryLabel('freight'), 'Freight'); assert.equal(X.categoryLabel(null), 'Other');
  /* no special wording or handling for any one kind of fee: it is a row a person names */
  assert.ok(!/agency/i.test(JSON.stringify([X.CATEGORIES, X.KINDS])), 'the suggestions and the kinds never say "agency"');
  assert.deepEqual(X.brandCategories([{ category: 'software' }, { category: 'Photo shoots' }, { category: 'photo SHOOTS' }, { category: null }, { category: 'Software' }]),
    [{ id: 'other', label: 'Other' }, { id: 'Photo shoots', label: 'Photo shoots' }, { id: 'software', label: 'Software' }], 'distinct by name, whatever the capitals');
});
await check('daily, weekly, quarterly, yearly and custom spread the way the page says', () => {
  near(sumOf({ name: 'd', kind: 'daily', amount: 12.5, start_date: '2026-10-02' }, '2026-10-01', '2026-10-05'), 50, 'daily: 4 days from its start');
  const wk = { name: 'w', kind: 'weekly', amount: 70, start_date: '2026-10-07' };   // a Wednesday
  near(sumOf(wk, '2026-10-07', '2026-10-13'), 70, 'weekly: its first 7 days, from the start date\'s weekday, add to the amount');
  near(sumOf(wk, '2026-10-14', '2026-10-20'), 70, 'and so does every week after'); near(sumOf(wk, '2026-10-01', '2026-10-08'), 20, 'two days in: two sevenths');
  const by = X.spread([wk], '2026-10-07', '2026-10-13', []).byDate; assert.equal(Object.keys(by).length, 7); for (const v of Object.values(by)) near(v, 10, 'evenly, a seventh a day');
  const q = { name: 'q', kind: 'quarterly', amount: 9200, start_date: '2026-01-01' };
  near(sumOf(q, '2026-10-01', '2026-12-31'), 9200, 'quarterly: Q4 has 92 days and they add to the amount'); near(sumOf(q, '2026-10-01', '2026-10-01'), 100, '9,200 / 92');
  near(sumOf(q, '2026-01-01', '2026-03-31'), 9200, 'Q1 2026 has 90 days'); near(sumOf(q, '2028-01-01', '2028-03-31'), 9200, 'Q1 of a leap year has 91');
  near(sumOf(q, '2028-02-29', '2028-02-29'), 9200 / 91, 'a leap day');
  const y = { name: 'y', kind: 'yearly', amount: 36500, start_date: '2026-01-01' };
  near(sumOf(y, '2026-01-01', '2026-12-31'), 36500, 'yearly: 365 days add to the amount'); near(sumOf(y, '2026-07-04', '2026-07-04'), 100, 'a day');
  near(sumOf(y, '2028-01-01', '2028-12-31'), 36500, 'a leap year too'); near(sumOf(y, '2028-07-04', '2028-07-04'), 36500 / 366, 'over 366 days');
  const c = { name: 'c', kind: 'custom', amount: 4500, start_date: '2026-10-20', end_date: '2026-11-18' };   // 30 days
  near(sumOf(c, '2026-10-01', '2026-12-31'), 4500, 'custom: the whole amount between its two dates'); near(sumOf(c, '2026-11-01', '2026-11-30'), 18 * 150, 'clipped to the window');
  near(sumOf(c, '2026-11-19', '2026-12-31'), 0, 'nothing after its end'); near(sumOf(c, '2026-10-01', '2026-10-19'), 0, 'nothing before its start');
  near(sumOf({ ...c, end_date: null }, '2026-10-01', '2026-12-31'), 0, 'custom with no end date has nothing to spread over');
  assert.match(X.clean({ name: 'c', kind: 'custom', amount: 10, start_date: '2026-10-01' })[0], /pick the date it ends/);
  for (const k of ['daily', 'weekly', 'quarterly', 'yearly', 'custom']) assert.equal(X.clean({ name: 'a', kind: k, amount: 5, start_date: '2026-10-01', end_date: '2026-10-31' })[1].kind, k, k);
  assert.deepEqual(X.KINDS.map(k => k.id), ['monthly', 'once', 'pct_revenue', 'pct_spend', 'per_order', 'daily', 'weekly', 'quarterly', 'yearly', 'custom']);
  /* an end date stops any of them */
  near(sumOf({ name: 'd', kind: 'daily', amount: 10, start_date: '2026-10-01', end_date: '2026-10-03' }, '2026-10-01', '2026-10-31'), 30, 'ended');
});
await check('the kinds that existed before compute exactly as before: 600 random lists against the old code, byte for byte', () => {
  /* The functions as they stood before the new kinds, copied verbatim (commit 9c6ce246). */
  const dimO = ym => new Date(Date.UTC(+ym.slice(0, 4), +ym.slice(5, 7), 0)).getUTCDate();
  const nextO = d => { const t = new Date(d + 'T12:00:00Z'); t.setUTCDate(t.getUTCDate() + 1); return t.toISOString().slice(0, 10); };
  const r2O = x => Math.round(x * 100) / 100, YMDO = /^\d{4}-\d{2}-\d{2}$/;
  function dayValueO(e, d, row) {
    const a = +e.amount || 0;
    if (e.kind === 'monthly') return a / dimO(d.slice(0, 7));
    if (e.kind === 'once') return d === e.start_date ? a : 0;
    if (!row) return 0;
    if (e.kind === 'pct_revenue') return Math.max(0, +row.sales || 0) * a / 100;
    if (e.kind === 'pct_spend') return Math.max(0, +(row.base_spend ?? row.spend) || 0) * a / 100;
    if (e.kind === 'per_order') return Math.max(0, +row.orders || 0) * a;
    return 0;
  }
  function spreadO(list, from, to, rows) {
    const out = { total: 0, ad_total: 0, items: [], ad_items: [], byDate: {}, adByDate: {} };
    if (!from || !to || from > to) return out;
    const R = {}; for (const r of rows || []) if (r && r.date) R[r.date] = r;
    for (const e of list || []) {
      if (!e || !YMDO.test(e.start_date || '')) continue;
      if (e.kind === 'once' && e.start_date > to) continue;
      const lo = e.start_date > from ? e.start_date : from;
      const end = e.kind === 'once' ? e.start_date : e.end_date && e.end_date < to ? e.end_date : to;
      const ad = !!+e.is_ad_spend, by = ad ? out.adByDate : out.byDate;
      let amt = 0;
      for (let d = lo; d <= end; d = nextO(d)) { const v = dayValueO(e, d, R[d]); if (v) { amt += v; by[d] = (by[d] || 0) + v; } }
      if (!(amt > 0)) continue;
      const it = { id: e.id ?? null, name: e.name, category: e.category || 'other', kind: e.kind, rate: +e.amount || 0, amount: r2O(amt) };
      if (ad) { out.ad_items.push(it); out.ad_total += amt; } else { out.items.push(it); out.total += amt; }
    }
    out.items.sort((a, b) => b.amount - a.amount); out.ad_items.sort((a, b) => b.amount - a.amount);
    out.total = r2O(out.total); out.ad_total = r2O(out.ad_total);
    return out;
  }
  let seed = 11; const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
  const day = n => { const t = new Date(Date.UTC(2026, 7, 1)); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10); };
  const OLD = ['monthly', 'once', 'pct_revenue', 'pct_spend', 'per_order'];
  let n = 0, values = 0;
  for (let i = 0; i < 600; i++) {
    const a = Math.floor(rnd() * 150), from = day(a), to = day(a + Math.floor(rnd() * 70));
    const rows = []; for (let d = from; d <= to; d = nextO(d)) if (rnd() > 0.1) rows.push({ date: d, sales: Math.round(rnd() * 500000) / 100, spend: Math.round(rnd() * 90000) / 100, orders: Math.floor(rnd() * 80), ...(rnd() > 0.7 ? { base_spend: Math.round(rnd() * 80000) / 100 } : {}) });
    const list = Array.from({ length: 1 + Math.floor(rnd() * 6) }, (_, j) => { const st = Math.floor(rnd() * 240) - 20, kind = OLD[Math.floor(rnd() * OLD.length)];
      return { id: j + 1, name: 'Row ' + j, category: ['software', 'rent', 'agency', 'team', null][Math.floor(rnd() * 5)], kind, amount: kind.startsWith('pct') ? Math.round(rnd() * 3000) / 100 : Math.round(rnd() * 900000) / 100,
        start_date: day(st), end_date: rnd() > 0.6 ? day(st + Math.floor(rnd() * 120)) : null, is_ad_spend: rnd() > 0.8 ? 1 : 0 }; });
    assert.equal(JSON.stringify(X.spread(list, from, to, rows)), JSON.stringify(spreadO(list, from, to, rows)), `case ${i}`); n++;
    for (const e of list) for (const r of rows.slice(0, 5)) { assert.equal(X.dayValue(e, r.date, r), dayValueO(e, r.date, r)); assert.equal(X.dayValue(e, r.date, undefined), dayValueO(e, r.date, undefined)); values += 2; }
  }
  assert.equal(n, 600); assert.ok(values > 5000, 'and each day value on its own');
});
await check('net profit reconciles on one screen with both kinds of row, and a day with no row is charged nothing', () => {
  /* Both kinds of row: plain fixed costs (monthly, weekly, custom, one time) and two that "count as ad spend". */
  const list = [
    { name: 'Rent', category: 'rent', kind: 'monthly', amount: 3100, start_date: '2026-09-01' },
    { name: 'Cleaner', category: 'Premises help', kind: 'weekly', amount: 70, start_date: '2026-09-02' },
    { name: 'Fit out', category: 'Premises help', kind: 'custom', amount: 310.31, start_date: '2026-10-01', end_date: '2026-10-31' },
    { name: 'Shoot', category: 'Photo shoots', kind: 'once', amount: 412.4, start_date: '2026-10-02' },
    { name: 'Podcast', category: 'marketing', kind: 'once', amount: 250.55, start_date: '2026-10-02', is_ad_spend: 1 },
    { name: 'Sponsor', category: 'marketing', kind: 'daily', amount: 33.33, start_date: '2026-10-01', is_ad_spend: 1 },
  ];
  const rows = ROWS(), cm = 1099.87;
  /* a brief or a report: this contribution margin does NOT hold the "counts as ad spend" rows, so the screen shows
     three lines under it (fixed costs, extra ad costs, net profit) and they add up to the cent */
  const a = X.netAfter(list, '2026-10-01', '2026-10-03', rows, cm);
  assert.ok(a.fixed > 0 && a.ad > 0, 'both kinds are present');
  near(a.fixed, 300 + 30 + 30.03 + 412.4, 'rent, cleaner, fit out, shoot'); near(a.ad, 250.55 + 99.99, 'podcast and three days of sponsor');
  assert.equal(Math.round((cm - a.fixed - a.ad) * 100), Math.round(a.net * 100), 'contribution margin - fixed costs - extra ad costs = net profit, exactly');
  /* the profit worker (P&L, the client profit link): contribution margin already holds them, so two lines are enough */
  const b = X.netAfter(list, '2026-10-01', '2026-10-03', rows, cm - a.ad, { cmHasAd: true });
  assert.equal(Math.round((cm - a.ad - b.fixed) * 100), Math.round(b.net * 100), 'contribution margin - fixed costs = net profit, exactly');
  assert.equal(Math.round(a.net * 100), Math.round(b.net * 100), 'and both screens land on the same net profit');
  assert.equal(Math.round(a.by_category.reduce((s, c) => s + c.amount, 0) * 100), Math.round(a.fixed * 100), 'the team\'s categories add up to the one total');
  assert.deepEqual(a.by_category.map(c => c.label), ['Photo shoots', 'Rent and premises', 'Premises help'], 'categories by the brand\'s own names');
  /* A calendar day with NO row (Oct 2 missing): contribution margin has nothing for it, so no rent is charged to it. */
  const gap = [rows[0], rows[2]], rent = [list[0]];
  near(X.netAfter(rent, '2026-10-01', '2026-10-03', gap, 300).fixed, 200, 'two covered days of rent, not three');
  near(X.netAfter(rent, '2026-10-01', '2026-10-03', gap, 300, { gpKey: 'gross_profit' }).net, 100, 'the same with the gross profit guard on');
  /* but a one-time cost on that missing day was still paid this month: it counts, once */
  const once = X.netAfter([list[0], list[3], list[4]], '2026-10-01', '2026-10-03', gap, 300);
  near(once.fixed, 200 + 412.4, 'the shoot on the day with no row counts once'); near(once.ad, 250.55, 'and so does the one-time ad cost');
  const viaDates = X.netAfter([list[0], list[3], list[4]], '2026-10-01', '2026-10-03', rows, 300, { dates: ['2026-10-01', '2026-10-03'] });
  assert.deepEqual(viaDates, once, 'the Daily Brief\'s list of days gives the same answer');
  near(X.netAfter([list[3]], '2026-10-03', '2026-10-03', [rows[2]], 300)?.fixed ?? 0, 0, 'never in a window that does not hold its date');
});

/* Net profit after fixed costs (2026-11-25): the two pure helpers briefs, reports and the client profit link share. */
await check('activeIn: a one-time cost only inside the window, ended and not-started rows out, "counts as ad spend" rows never', () => {
  const ids = (list, f, t) => X.activeIn(list, f, t).map(e => e.id);
  const list = [
    { id: 1, kind: 'monthly', amount: 100, start_date: '2026-09-01' },
    { id: 2, kind: 'monthly', amount: 100, start_date: '2026-01-01', end_date: '2026-09-30' },          // ended before the window
    { id: 3, kind: 'monthly', amount: 100, start_date: '2026-11-01' },                                  // not started
    { id: 4, kind: 'once', amount: 100, start_date: '2026-10-02' },                                     // inside
    { id: 5, kind: 'once', amount: 100, start_date: '2026-09-15', end_date: '2026-12-31' },             // a one-time cost before the window
    { id: 6, kind: 'monthly', amount: 100, start_date: '2026-09-01', is_ad_spend: 1 },                  // already inside ad spend
    { id: 7, kind: 'per_order', amount: 1, start_date: '2026-09-01', end_date: '2026-10-01' },          // ends on the first day: still in force
    { id: 8, kind: 'monthly', amount: 100, start_date: 'soon' }, null,
  ];
  assert.deepEqual(ids(list, '2026-10-01', '2026-10-03'), [1, 4, 7]);
  assert.deepEqual(ids(list, '2026-10-03', '2026-10-03'), [1]);
  assert.deepEqual(ids([], '2026-10-01', '2026-10-03'), []); assert.deepEqual(ids(null, '2026-10-01', '2026-10-03'), []);
});
await check('netAfter: null without an active fixed cost or without a CM; a per order row on a zero-order day still counts; cmHasAd differs by exactly the ad pile', () => {
  const rows = ROWS();
  assert.equal(X.netAfter([], '2026-10-01', '2026-10-03', rows, 1000), null, 'no rows');
  assert.equal(X.netAfter([{ name: 'Ad only', kind: 'monthly', amount: 3100, start_date: '2026-10-01', is_ad_spend: 1 }], '2026-10-01', '2026-10-03', rows, 1000), null, 'only an ad-spend row');
  assert.equal(X.netAfter([{ name: 'Rent', kind: 'monthly', amount: 3100, start_date: '2026-10-01' }], '2026-10-01', '2026-10-03', rows, null), null, 'no contribution margin');
  assert.equal(X.netAfter([{ name: 'Rent', kind: 'monthly', amount: 3100, start_date: '2026-11-01' }], '2026-10-01', '2026-10-03', rows, 1000), null, 'not started');
  const z = X.netAfter([{ name: 'Insert card', category: 'other', kind: 'per_order', amount: 0.5, start_date: '2026-09-01' }], '2026-10-03', '2026-10-03', [rows[2]], -100);
  assert.deepEqual(z, { fixed: 0, ad: 0, net: -100, by_category: [] }, 'a zero-order day: the line stays, at zero');
  const list = [{ name: 'Rent', category: 'rent', kind: 'monthly', amount: 3100, start_date: '2026-09-01' }, { name: 'Tools', category: 'software', kind: 'monthly', amount: 1550, start_date: '2026-09-01' },
    { name: 'More tools', category: 'software', kind: 'once', amount: 400, start_date: '2026-10-02' }, { name: 'Retainer', category: 'agency', kind: 'pct_spend', amount: 10, start_date: '2026-09-01' },
    { name: 'Podcast', category: 'marketing', kind: 'once', amount: 250, start_date: '2026-10-02', is_ad_spend: 1 }, { name: 'Odd', category: 'nope', kind: 'once', amount: 5, start_date: '2026-10-01' }];
  const a = X.netAfter(list, '2026-10-01', '2026-10-03', rows, 1100), b = X.netAfter(list, '2026-10-01', '2026-10-03', rows, 1100, { cmHasAd: true });
  assert.deepEqual(a.by_category, [{ category: 'software', label: 'Software', amount: 550 }, { category: 'rent', label: 'Rent and premises', amount: 300 }, { category: 'agency', label: 'Agency', amount: 70 }, { category: 'nope', label: 'Nope', amount: 5 }]);
  near(a.fixed, 925, 'fixed'); near(a.ad, 250, 'ad pile'); near(a.net, 1100 - 925 - 250, 'brief and report CM has no ad expenses in it, so they come off here');
  near(b.net, 1100 - 925, 'the profit worker\'s CM already holds them'); near(b.net - a.net, a.ad, 'the two differ by exactly the ad pile');
  assert.ok(!/Rent"|Podcast|Tools/.test(JSON.stringify(a).replace(/"label":"[^"]*"/g, '')), 'no row name leaves, only category totals');
});
await check('one window: a one-time cost dated after the window is not counted; net profit is withheld or clipped when a day has no margin', () => {
  const rows = ROWS();
  const later = [{ id: 1, name: 'Trade show', category: 'marketing', kind: 'once', amount: 5000, start_date: '2026-12-15' }, { id: 2, name: 'Sponsor', category: 'marketing', kind: 'once', amount: 700, start_date: '2026-12-15', is_ad_spend: 1 }];
  const s = X.spread(later, '2026-11-01', '2026-11-24', []);
  assert.deepEqual([s.total, s.ad_total, s.items.length, s.ad_items.length, Object.keys(s.byDate).length, Object.keys(s.adByDate).length], [0, 0, 0, 0, 0, 0], 'spread itself, so P&L, the hub and the Costs page agree with the client link');
  assert.equal(X.spread(later, '2026-12-01', '2026-12-31', []).total, 5000, 'inside the window it counts'); assert.equal(X.spread(later, '2026-12-16', '2026-12-31', []).total, 0, 'and not once the window is past it');
  assert.equal(X.netAfter(later, '2026-11-01', '2026-11-24', [], 900), null);
  /* gpKey: every day of the window needs a gross profit, or there is no net profit at all */
  const rent = [{ name: 'Rent', category: 'rent', kind: 'monthly', amount: 3100, start_date: '2026-09-01' }, { name: 'Sponsor', category: 'marketing', kind: 'once', amount: 50, start_date: '2026-10-01', is_ad_spend: 1 }];
  const gp = rows.map((r, i) => ({ ...r, gross_profit: i === 0 ? null : 400 }));
  assert.equal(X.netAfter(rent, '2026-10-01', '2026-10-03', gp, 800, { gpKey: 'gross_profit' }), null, 'one uncosted day in the window');
  near(X.netAfter(rent, '2026-10-02', '2026-10-03', gp, 800, { gpKey: 'gross_profit' }).net, 800 - 200 - 0, 'the uncosted day is outside this window');
  near(X.netAfter(rent, '2026-10-01', '2026-10-03', gp, 800).net, 800 - 300 - 50, 'without gpKey it reads as before');
  /* dates: the caller summed cm over these days only, so fixed costs are counted on exactly those days */
  const d = X.netAfter(rent, '2026-10-01', '2026-10-03', rows, 800, { dates: ['2026-10-02', '2026-10-03', '2026-11-09'] });
  near(d.fixed, 200, 'two days of rent, and a date outside the window is ignored'); assert.equal(d.ad, 50, 'the one-time Oct 1 sponsor fee was paid in the window: it counts once'); near(d.net, 550, 'net');
  assert.deepEqual(d.by_category, [{ category: 'rent', label: 'Rent and premises', amount: 200 }]);
  const all = X.netAfter(rent, '2026-10-01', '2026-10-03', rows, 800, { dates: ['2026-10-01', '2026-10-02', '2026-10-03'] }), plain = X.netAfter(rent, '2026-10-01', '2026-10-03', rows, 800);
  assert.deepEqual(all, plain, 'every day counted = the whole-window answer');
});

/* ---------- the real worker ---------- */
db.exec(`INSERT INTO brands (id, slug, name, status, currency, tz, source) VALUES ('brand_alpha', 'alpha', 'Alpha Golf', 'active', 'USD', 'America/Chicago', 'locus')`);
db.exec(`INSERT INTO p_fixed_cost (act_id, name, category, monthly, start_month, end_month, created_by) VALUES
  ('brand_alpha', 'Klaviyo', 'Software', 3100, '2026-09', NULL, 'cole@go-mobius-digital.com'),
  ('brand_alpha', 'Old retainer', 'Agency fee', 6000, '2026-01', '2026-08', NULL)`);
const put = (metric, date, v) => db.prepare(`INSERT INTO tw_daily (act_id, date, metric, value) VALUES (?, ?, ?, ?)`).run('brand_alpha', date, metric, v);
for (const [d, sales, spend, orders] of [['2026-10-01', 1000, 200, 10], ['2026-10-02', 2000, 400, 20], ['2026-10-03', 1500, 300, 15]]) {
  put('netSales', d, sales); put('blendedAds', d, spend); put('totalOrders', d, orders); put('totalProductCosts', d, sales * 0.3); put('newCustomersOrders', d, orders / 2);
}
const PF = (await import('./src/worker.js')).default;
const env = { DB, ADMIN_TOKEN: 'adm' };
const call = async (method, p, body) => { const r = await PF.fetch(new Request('https://pf.test' + p, { method, headers: { Authorization: 'Bearer adm', ...(body ? { 'Content-Type': 'application/json' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) }), env, { waitUntil() {} }); return { status: r.status, j: await r.json() }; };
const Q = '/api/client?act=brand_alpha&from=2026-10-01&to=2026-10-03';

let before;
await check('old fixed expenses are copied once as monthly costs (category mapped, end month to its last day)', async () => {
  const g = await call('GET', '/api/expenses?act=brand_alpha');
  assert.equal(g.status, 200, JSON.stringify(g.j));
  const by = Object.fromEntries(g.j.items.map(x => [x.name, x]));
  assert.deepEqual([by.Klaviyo.kind, by.Klaviyo.category, by.Klaviyo.amount, by.Klaviyo.start_date, by.Klaviyo.end_date, by.Klaviyo.added_by], ['monthly', 'software', 3100, '2026-09-01', null, 'Cole']);
  assert.deepEqual([by['Old retainer'].category, by['Old retainer'].end_date], ['agency', '2026-08-31']);
  assert.ok(g.j.sources && g.j.sources.from, 'where each cost comes from');
  before = (await call('GET', Q)).j;
  near(before.fixed.total, 300, 'Klaviyo 3 days = 300 under Net profit'); assert.equal(before.totals.spend, 900);
});
await check('a migrated row the brand removes never comes back', async () => {
  const g = await call('GET', '/api/expenses?act=brand_alpha');
  const keep = g.j.items.filter(x => x.name !== 'Old retainer');
  assert.equal((await call('PUT', '/api/expenses', { act: 'brand_alpha', items: keep })).status, 200);
  X._reset(); await X.ensure(env);   // a fresh isolate runs the copy again
  const again = await call('GET', '/api/expenses?act=brand_alpha');
  assert.deepEqual(again.j.items.map(x => x.name), ['Klaviyo']);
});
await check('"counts as ad spend" changes spend, MER and CM on P&L; the rest only changes Net profit', async () => {
  const g = await call('GET', '/api/expenses?act=brand_alpha');
  const items = [...g.j.items, { name: 'Podcast read', category: 'marketing', kind: 'once', amount: 600, start_date: '2026-10-02', is_ad_spend: true },
    { name: 'Agency 10%', category: 'agency', kind: 'pct_spend', amount: 10, start_date: '2026-10-01' }];
  const p = await call('PUT', '/api/expenses', { act: 'brand_alpha', items });
  assert.equal(p.status, 200, JSON.stringify(p.j));
  const a = (await call('GET', Q)).j;
  assert.equal(a.totals.spend, 1500, '900 platforms + 600 podcast'); assert.equal(a.totals.ad_expense, 600); assert.equal(a.totals.base_spend, 900);
  near(a.totals.mer, 4500 / 1500, 'MER on the new spend'); near(a.totals.cm, before.totals.cm - 600, 'CM down by the ad expense');
  near(a.totals.cac, 1500 / 22.5, 'cost per new customer on the new spend');
  near(a.fixed.ad_total, 600, 'ad pile'); assert.equal(a.fixed.ad_items[0].name, 'Podcast read');
  near(a.fixed.total, 300 + 90, 'Klaviyo + 10% of the platforms\' 900 under Net profit');
  /* switch the podcast off "ad spend": spend and MER go back, Net profit carries it instead */
  const off = items.map(x => x.name === 'Podcast read' ? { ...x, is_ad_spend: false } : x);
  await call('PUT', '/api/expenses', { act: 'brand_alpha', items: off.map(x => ({ ...x, id: undefined })) });
  const b = (await call('GET', Q)).j;
  assert.equal(b.totals.spend, 900); near(b.totals.mer, 5, 'MER back'); near(b.totals.cm, before.totals.cm, 'CM back'); near(b.fixed.total, 990, 'Net profit carries it');
});
await check('the tile drill-down prices it the same way (spend, ad items, Net profit)', async () => {
  const g = await call('GET', '/api/expenses?act=brand_alpha');
  await call('PUT', '/api/expenses', { act: 'brand_alpha', items: g.j.items.map(x => x.name === 'Podcast read' ? { ...x, is_ad_spend: true } : x) });
  const d = await call('GET', '/api/hub/drill?act=brand_alpha&from=2026-10-01&to=2026-10-03&cmp=none');
  assert.equal(d.status, 200, JSON.stringify(d.j).slice(0, 300));
  const b = d.j.brands[0];
  assert.equal(b.cur.spend, 1500); assert.equal(b.cur.ad_expense, 600); assert.equal(b.ad_items[0].name, 'Podcast read');
  near(b.profit.cur.fixed, 390, 'under Net profit'); near(b.profit.cur.net, b.profit.cur.cm - 390, 'net = cm - custom');
});

const pass = checks.filter(Boolean).length;
console.log(`\n${pass}/${checks.length} passed`);
process.exit(pass === checks.length ? 0 : 1);

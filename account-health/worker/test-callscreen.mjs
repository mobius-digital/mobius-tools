// Offline checks for the call screens (src/callscreen.js). Run: node test-callscreen.mjs
import { _test, handleCalls, reopenCall } from './src/callscreen.js';
const { winnersLosers, callId, parked, typedLines } = _test;
let n = 0, bad = 0;
const ok = (c, m) => { n++; if (!c) { bad++; console.log('FAIL', m); } };

// 1. Winners beat the ads' own ROAS together; losers fell under it; no attribution = by spend, no losers.
const d = { ads: { floor: 50, top: [{ ad_id: '1', name: 'a', spend: 100 }, { ad_id: '2', name: 'b', spend: 200 }, { ad_id: '3', name: 'c', spend: 50 }, { ad_id: '4', name: 'd', spend: 80 }] },
  attr: { ads: { lastPlatformClick: { 1: { revenue: 400, orders: 4 }, 2: { revenue: 200, orders: 2 }, 4: { revenue: 300, orders: 3 } } } } };
const wl = winnersLosers(d);
ok(Math.abs(wl.bar - 900 / 430) < 1e-9, 'bar = revenue / spend of the attributed ads');
ok(wl.winners.map(x => x.ad_id).join() === '1,4,2', 'best 3 by ROAS, best first');
ok(wl.losers.map(x => x.ad_id).join() === '3' && wl.pool === 4, 'worst after the best 3, worst first; never the same ad twice; an ad with no Triple Whale row reads 0');
const nw = winnersLosers({ ads: { top: [{ ad_id: '9', spend: 10 }] } });
ok(nw.basis === 'spend' && nw.losers.length === 0, 'no attribution = by spend, no losers');

// 2. One row per call: two laptops on the same call open the same row.
ok(callId('monday', '', '2026-10-19') === 'monday:2026-10-19' && callId('client', 'brand_x', '2026-10-19') === 'client:brand_x:2026-10-19', 'call ids');

// 3. Parked briefs: templates, "Test", a bare number, or three weeks in Brief with no due date.
const T = '2026-10-19';
ok(parked({ title: 'UGC/Video Template', num: '381', since: T }, T) && parked({ title: 'Test', num: '1', since: T }, T) && parked({ title: '37', num: '37', since: T }, T), 'template and scratch cards are parked');
ok(!parked({ title: 'Ratchet Precision', num: '259', since: '2026-10-13' }, T), 'a recent brief is not parked');
ok(parked({ title: 'Old idea', num: '5', since: '2026-09-01', due: '' }, T) && !parked({ title: 'Old idea', num: '5', since: '2026-09-01', due: '2026-10-30' }, T), 'three weeks with no due date = parked; a due date keeps it');

// 4. "For the client": one line per typed line, word for word (bullets, dashes and spare spaces tidied), 5 max, empty = none (so Finish falls back to the written lines).
const tl = typedLines('- Three new ads on the Burgundy couch video go live Thursday.\r\n\n  We keep spend flat \u2014 until the new photos land.  \n\u2022 six\nseven\neight\nnine\nten');
ok(tl[0] === 'Three new ads on the Burgundy couch video go live Thursday.' && tl[1] === 'We keep spend flat, until the new photos land.', 'typed lines are kept word for word, bullets and dashes tidied');
ok(tl.length === 5 && tl[4] === 'eight', 'five lines at most, blank lines skipped');
ok(typedLines('').length === 0 && typedLines('  \n ').length === 0 && typedLines(undefined).length === 0, 'an empty box = no lines');

// 5. The routes are the team's: a client login gets 403, no login 401.
const json = (b, s = 200) => ({ status: s, body: b });
const env = { DB: { prepare: () => ({ run: async () => ({}), bind() { return this; }, first: async () => null, all: async () => ({ results: [] }) }) } };
const url = new URL('https://x/api/calls/screen?kind=monday');
let r = await handleCalls({ method: 'GET' }, env, url, '/api/calls/screen', json, { isAdmin: async () => false });
ok(r.status === 401, 'no login = 401');
r = await handleCalls({ method: 'GET' }, env, url, '/api/calls/screen', json, { isAdmin: async () => true, clientScope: () => ({ ids: ['brand_x'] }) });
ok(r.status === 403, 'a client login = 403');
ok((await handleCalls({ method: 'GET' }, env, url, '/api/other', json, {})) === null, 'other paths pass through');

// 6. Reopen (2026-10-26): a finished call goes back to open; Finish again skips what the first Finish made.
{
  const { itemKey, madeKeys, mergeResults } = _test;
  const first = { brands: [{ brand_id: 'b1', tasks: [{ text: 'Ahsan pause the  retargeting' }, { text: 'Write a brief: Couch video', kind: 'team' }], briefs: [{ text: 'Hook test', num: 5 }, { text: 'Failed one', error: 'x' }], asks: [{ text: 'Send photos' }] }], agency: { brand_id: '', tasks: [{ text: 'Cole send calendar' }] }, warnings: [] };
  const k = madeKeys(first);
  ok(k.has(itemKey('b1', 'ahsan pause the retargeting')) && k.has(itemKey('b1', 'Hook test')) && k.has(itemKey('b1', 'Send photos')) && k.has(itemKey('', 'Cole send calendar')), 'made tasks, briefs and requests are keys');
  ok(k.has(itemKey('b1', 'Couch video')), 'a brief that fell back to a task counts as made');
  ok(!k.has(itemKey('b1', 'Failed one')) && !k.has(itemKey('b2', 'Hook test')), 'a failed line can be made again; another brand is separate');
  const m = mergeResults(first, { brands: [{ brand_id: 'b1', tasks: [], briefs: [{ text: 'New one', num: 6 }], asks: [] }, { brand_id: 'b2', tasks: [{ text: 't' }], briefs: [], asks: [] }], agency: null, warnings: ['w'] });
  ok(m.brands.length === 2 && m.brands[0].briefs.length === 3 && m.agency.tasks.length === 1 && m.warnings.join() === 'w', 'the summary adds the second Finish to the first');
  const rows = { 'monday:2026-10-26': { id: 'monday:2026-10-26', kind: 'monday', status: 'finished', state_json: '{"theme":"x"}', result_json: '{}' } };
  const fake = { DB: { prepare: sql => ({ bind: (...a) => ({ first: async () => rows[a[0]] || null, run: async () => { if (/SET status = 'live'/.test(sql)) rows[a[0]].status = 'live'; return {}; } }), first: async () => ({}), all: async () => ({ results: [] }), run: async () => ({}) }) } };
  const ro = await reopenCall(fake, { id: 'monday:2026-10-26' }, 'cole@go-mobius-digital.com');
  ok(ro.status === 'live' && rows['monday:2026-10-26'].status === 'live' && ro.state.theme === 'x', 'reopen sets the call back to open and hands back what was typed');
  let missing = false; try { await reopenCall(fake, { id: 'nope' }, 'x'); } catch (e) { missing = e.status === 404; }
  ok(missing, 'an unknown call = 404');
}

console.log(`${n - bad}/${n} passed`);
process.exit(bad ? 1 : 0);

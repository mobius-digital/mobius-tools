// Offline checks for the call screens (src/callscreen.js). Run: node test-callscreen.mjs
import { _test, handleCalls } from './src/callscreen.js';
const { winnersLosers, callId, parked } = _test;
let n = 0, bad = 0;
const ok = (c, m) => { n++; if (!c) { bad++; console.log('FAIL', m); } };

// 1. Winners beat the ads' own ROAS together; losers fell under it; no attribution = by spend, no losers.
const d = { ads: { floor: 50, top: [{ ad_id: '1', name: 'a', spend: 100 }, { ad_id: '2', name: 'b', spend: 200 }, { ad_id: '3', name: 'c', spend: 50 }, { ad_id: '4', name: 'd', spend: 80 }] },
  attr: { ads: { lastPlatformClick: { 1: { revenue: 400, orders: 4 }, 2: { revenue: 200, orders: 2 }, 4: { revenue: 300, orders: 3 } } } } };
const wl = winnersLosers(d);
ok(Math.abs(wl.bar - 900 / 430) < 1e-9, 'bar = revenue / spend of the attributed ads');
ok(wl.winners.map(x => x.ad_id).join() === '1,4', 'winners beat the bar, best first');
ok(wl.losers.map(x => x.ad_id).join() === '3,2', 'losers under the bar, worst first; an ad with no Triple Whale row reads 0');
const nw = winnersLosers({ ads: { top: [{ ad_id: '9', spend: 10 }] } });
ok(nw.basis === 'spend' && nw.losers.length === 0, 'no attribution = by spend, no losers');

// 2. One row per call: two laptops on the same call open the same row.
ok(callId('monday', '', '2026-10-19') === 'monday:2026-10-19' && callId('client', 'brand_x', '2026-10-19') === 'client:brand_x:2026-10-19', 'call ids');

// 3. Parked briefs: templates, "Test", a bare number, or three weeks in Brief with no due date.
const T = '2026-10-19';
ok(parked({ title: 'UGC/Video Template', num: '381', since: T }, T) && parked({ title: 'Test', num: '1', since: T }, T) && parked({ title: '37', num: '37', since: T }, T), 'template and scratch cards are parked');
ok(!parked({ title: 'Ratchet Precision', num: '259', since: '2026-10-13' }, T), 'a recent brief is not parked');
ok(parked({ title: 'Old idea', num: '5', since: '2026-09-01', due: '' }, T) && !parked({ title: 'Old idea', num: '5', since: '2026-09-01', due: '2026-10-30' }, T), 'three weeks with no due date = parked; a due date keeps it');

// 4. The routes are the team's: a client login gets 403, no login 401.
const json = (b, s = 200) => ({ status: s, body: b });
const env = { DB: { prepare: () => ({ run: async () => ({}), bind() { return this; }, first: async () => null, all: async () => ({ results: [] }) }) } };
const url = new URL('https://x/api/calls/screen?kind=monday');
let r = await handleCalls({ method: 'GET' }, env, url, '/api/calls/screen', json, { isAdmin: async () => false });
ok(r.status === 401, 'no login = 401');
r = await handleCalls({ method: 'GET' }, env, url, '/api/calls/screen', json, { isAdmin: async () => true, clientScope: () => ({ ids: ['brand_x'] }) });
ok(r.status === 403, 'a client login = 403');
ok((await handleCalls({ method: 'GET' }, env, url, '/api/other', json, {})) === null, 'other paths pass through');

console.log(`${n - bad}/${n} passed`);
process.exit(bad ? 1 : 0);

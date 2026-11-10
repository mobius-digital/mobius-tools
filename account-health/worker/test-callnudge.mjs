// Offline checks for the call nudges (src/callnudge.js) and the creator call id. Run: node test-callnudge.mjs
import { _test } from './src/callnudge.js';
import { _test as cs } from './src/callscreen.js';
const { openCallsToNudge, brandsWithoutPlan, callLink } = _test;
let n = 0, bad = 0;
const ok = (c, m) => { n++; if (!c) { bad++; console.log('FAIL', m); } };

// 1. A call is nudged once: live, typed on, quiet for an hour.
const now = Date.parse('2026-11-09T19:00:00Z');
const rows = [
  { id: 'monday:2026-11-09', status: 'live', state_json: '{"theme":"x"}', updated_at: '2026-11-09T14:30:00Z' },        // quiet 4.5h: yes
  { id: 'client:a:2026-11-09', status: 'live', state_json: '{"news":"y"}', updated_at: '2026-11-09T18:30:00Z' },       // typed 30 min ago: not yet
  { id: 'client:b:2026-11-09', status: 'finished', state_json: '{"news":"y"}', updated_at: '2026-11-09T14:00:00Z' },   // finished: no
  { id: 'client:c:2026-11-09', status: 'live', state_json: '{}', updated_at: '2026-11-09T14:00:00Z' },                 // opened, nothing typed: no
  { id: 'creator:d:2026-11-09', status: 'live', state_json: '{"ask":"z"}', updated_at: '2026-11-09T13:00:00Z' },       // already nudged: no
];
const due = openCallsToNudge(rows, now, new Set(['creator:d:2026-11-09']));
ok(due.map(r => r.id).join() === 'monday:2026-11-09', 'only the quiet, typed, live, un-nudged call');

// 2. Missing Monday plans: fresh report, no thread, not a paused brand.
const brands = [
  { name: 'Bonk Golf', report: { fresh: true }, thread: [] },
  { name: 'Dartee Golf', report: { fresh: true }, thread: [{ by: 'Ahsan', text: 'plan' }] },
  { name: 'SpeedIn', report: null, thread: [] },
  { name: 'The Golf Sock', report: { fresh: true }, thread: [] },
  { name: 'Yak Sports', report: { fresh: false }, thread: [] },
];
ok(brandsWithoutPlan(brands).join() === 'Bonk Golf', 'Bonk only: Dartee has a plan, SpeedIn has no report, Golf Sock is paused, Yak is stale');

// 3. Links go straight back to the call's screen.
ok(callLink({ kind: 'client', act_id: 'brand_x' }).endsWith('?open=calls&call=client&act=brand_x'), 'client link carries the brand');
ok(callLink({ kind: 'monday', act_id: '' }).endsWith('?open=calls&call=monday'), 'Monday link has no brand');

// 4. A creator call is one row per brand per day, like a client call.
ok(cs.callId('creator', 'brand_grunk_dolfer', '2026-11-16') === 'creator:brand_grunk_dolfer:2026-11-16', 'creator call id');

console.log(bad ? `${bad} of ${n} FAILED` : `${n}/${n} passed`);
process.exit(bad ? 1 : 0);

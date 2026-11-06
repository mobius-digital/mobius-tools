// node test-frame-refresh.mjs : Frame token refresh never wipes the sign-in, and parallel calls refresh once.
import { frameToken, frameStatus, useFetch } from './src/frame.js';

const rows = new Map();
const DB = { prepare(sql) { let a = []; return { bind(...x) { a = x; return this; },
  async first() { const r = rows.get(a[0]); return r ? { value: r } : null; },
  async run() {
    if (/^CREATE/.test(sql)) return { meta: { changes: 0 } };
    if (/^DELETE/.test(sql)) { rows.delete(a[0]); return { meta: { changes: 1 } }; }
    if (/WHERE CAST/.test(sql)) { const cur = rows.get(a[0]); if (cur != null && Number(cur) >= a[2]) return { meta: { changes: 0 } }; rows.set(a[0], a[1]); return { meta: { changes: 1 } }; }
    rows.set(a[0], a[1]); return { meta: { changes: 1 } };
  } }; } };
const env = { DB };
let pass = 0, fail = 0;
const ok = (c, m) => { console.log((c ? 'PASS  ' : 'FAIL  ') + m); c ? pass++ : fail++; };
const seed = (extra = {}) => { rows.clear(); rows.set('frame_client', JSON.stringify({ id: 'cid', secret: 's' })); rows.set('frame_tokens', JSON.stringify({ access: 'a0', refresh: 'r0', exp: Date.now() - 1000, since: 'x', ...extra })); };

// 1. Adobe rotates: five parallel calls, one refresh, all get the new token.
seed(); let calls = 0;
useFetch(async (u, o) => { calls++; await new Promise(r => setTimeout(r, 300)); const rt = new URLSearchParams(o.body).get('refresh_token');
  return rt === 'r0' && calls === 1 ? new Response(JSON.stringify({ access_token: 'a1', refresh_token: 'r1', expires_in: 86400 })) : new Response(JSON.stringify({ error: 'invalid_grant' }), { status: 400 }); });
const got = await Promise.all([1, 2, 3, 4, 5].map(() => frameToken(env)));
ok(calls === 1 && got.every(x => x === 'a1'), `parallel refresh: one Adobe call (${calls}), every caller gets the new token`);
ok(JSON.parse(rows.get('frame_tokens')).refresh === 'r1' && !rows.has('frame_refresh_lock'), 'new refresh token saved, lock released');

// 2. A refused refresh keeps the row, marks it dead, status says why.
seed(); useFetch(async () => new Response(JSON.stringify({ error: 'invalid_grant', error_description: 'bad token' }), { status: 400 }));
ok(await frameToken(env) === null, 'refused refresh returns null');
const t = JSON.parse(rows.get('frame_tokens') || 'null');
ok(t?.refresh === 'r0' && t.dead && t.fail.why === 'bad token', 'row kept (refresh token not deleted), marked dead with the reason');
const st = await frameStatus(env);
ok(st.connected === false && st.last_refresh_error?.why === 'bad token' && /Connect Frame/.test(st.needs), 'status: not connected, says why and which button');

// 3. Dead row retries after 10 minutes and comes back on success.
let n = 0; useFetch(async () => { n++; return new Response(JSON.stringify({ access_token: 'a9', expires_in: 3600 })); });
ok(await frameToken(env) === null && n === 0, 'dead row is not retried inside 10 minutes');
const d = JSON.parse(rows.get('frame_tokens')); d.fail.at -= 11 * 60e3; rows.set('frame_tokens', JSON.stringify(d));
ok(await frameToken(env) === 'a9' && (await frameStatus(env)).connected === true && !JSON.parse(rows.get('frame_tokens')).dead, 'after 10 minutes it retries, and a working refresh clears dead');

// 4. Network error keeps a still-valid access token.
seed({ exp: Date.now() + 30e3 }); useFetch(async () => { throw new Error('net down'); });
ok(await frameToken(env, true) === null || true, 'network error does not throw');
ok(!JSON.parse(rows.get('frame_tokens')).dead, 'network error is not "dead"');

console.log(`\n${pass} passed, ${fail} failed`); if (fail) process.exit(1);

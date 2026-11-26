/* The screens' side of the switch (profit/v5/engine.js and data.js api()), with a stubbed fetch.
   The rule under test: a read the new engine fails is asked of the old engine, a write is asked of the
   old engine only when it is certain the new one did not run it. Nothing is ever saved twice. */
import { test } from 'node:test';
import assert from 'node:assert/strict';

const store = new Map([['pf_token', 'tok_screen_test'], ['lx5_engine', 'new']]);
globalThis.localStorage = { getItem: k => (store.has(k) ? store.get(k) : null), setItem: (k, v) => { store.set(k, String(v)); }, removeItem: k => { store.delete(k); } };
globalThis.location = { search: '', hostname: 'app.test' };
globalThis.window = { dispatchEvent() {} };
globalThis.CustomEvent = class { constructor(type) { this.type = type; } };
globalThis.BroadcastChannel = undefined;       // a real channel would hold the test process open

const { api } = await import('../../../profit/v5/data.js');
const { misses, clearMisses } = await import('../../../profit/v5/engine.js');

const WRITE = '/api/automations';            // PUT /ah/api/automations is a ported write
const READ = '/api/automations';
const answer = (data, status = 200, how = '') => new Response(typeof data === 'string' ? data : JSON.stringify(data),
  { status, headers: { 'Content-Type': 'application/json', ...(how ? { 'X-Engine': how } : {}) } });

/* Stub fetch. `engine` and `old` are functions that make the answer. Returns the list of calls made. */
function stub({ engine, old }) {
  const calls = [];
  globalThis.fetch = async (url, init = {}) => {
    const which = String(url).includes('locus-engine') ? 'engine' : 'old';
    calls.push({ which, method: init.method || 'GET', url: String(url) });
    return which === 'engine' ? engine(init) : old(init);
  };
  clearMisses();
  return calls;
}
const put = () => api(WRITE, { worker: 'ah', method: 'PUT', body: { name: 'a made up automation' } });
const oldCalls = calls => calls.filter(c => c.which === 'old').length;

test('a write the engine answers with a 500 is never sent to the old engine', async () => {
  const calls = stub({ engine: () => answer({ error: 'Something went wrong on our side.' }, 500, 'new'), old: () => answer({ ok: true }) });
  await assert.rejects(put(), e => e.status === 500 && /went wrong/.test(e.message));
  assert.equal(oldCalls(calls), 0);
  assert.equal(misses().length, 1);
});

test('a write the old engine already refused through the engine is not sent to it again', async () => {
  for (const how of ['forward', 'pipe']) {
    const calls = stub({ engine: () => answer({ error: 'the old worker said no' }, 502, how), old: () => answer({ ok: true }) });
    await assert.rejects(put(), e => e.status === 502);
    assert.equal(oldCalls(calls), 0, how);
    const calls4 = stub({ engine: () => answer({ error: 'name is needed' }, 400, how), old: () => answer({ ok: true }) });
    await assert.rejects(put(), e => e.status === 400 && e.message === 'name is needed');
    assert.equal(oldCalls(calls4), 0, how + ' 400');
  }
});

test('a write that got an answer which is not JSON is not sent again', async () => {
  const calls = stub({ engine: () => answer('<html>', 200, 'new'), old: () => answer({ ok: true }) });
  await assert.rejects(put(), /Reload and check/);
  assert.equal(oldCalls(calls), 0);
});

test('a write that ran out of time is not sent again, and the page is told to check', async () => {
  const calls = stub({ engine: () => { throw Object.assign(new Error('aborted'), { name: 'AbortError' }); }, old: () => answer({ ok: true }) });
  await assert.rejects(put(), /did not answer in time\. Reload and check before saving again\./);
  assert.equal(oldCalls(calls), 0);
});

test('a write the engine could not be reached for, or refused with its own 4xx, goes to the old engine once', async () => {
  const down = stub({ engine: () => { throw new TypeError('Failed to fetch'); }, old: () => answer({ ok: true, id: 'a1' }) });
  assert.deepEqual(await put(), { ok: true, id: 'a1' });
  assert.equal(oldCalls(down), 1);
  const refused = stub({ engine: () => answer({ error: 'bad input' }, 400, 'new'), old: () => answer({ ok: true, id: 'a2' }) });
  assert.deepEqual(await put(), { ok: true, id: 'a2' });
  assert.equal(oldCalls(refused), 1);
});

test('a read the engine fails is still asked of the old engine, and the miss is noted', async () => {
  const calls = stub({ engine: () => answer({ error: 'Something went wrong on our side.' }, 500, 'new'), old: () => answer({ automations: [] }) });
  assert.deepEqual(await api(READ, { worker: 'ah' }), { automations: [] });
  assert.equal(oldCalls(calls), 1);
  assert.equal(misses()[0].kind, 'failed');
});

test('a read answered by the old engine because the new handler broke is used, and counted as a miss', async () => {
  const calls = stub({ engine: () => answer({ automations: [] }, 200, 'fallback'), old: () => answer({ never: true }) });
  assert.deepEqual(await api(READ, { worker: 'ah' }), { automations: [] });
  assert.equal(oldCalls(calls), 0);
  assert.match(misses()[0].note, /handler broke/);
  const meant = stub({ engine: () => answer({ automations: [] }, 200, 'forward'), old: () => answer({ never: true }) });
  await api(READ, { worker: 'ah' });
  assert.equal(oldCalls(meant), 0);
  assert.equal(misses().length, 0);
});

test('a browser that made no choice uses the new engine (config.js ENGINE_DEFAULT), and one line in it goes back', async () => {
  const { ENGINE_DEFAULT } = await import('../../../profit/v5/config.js');
  const { engineMode, setEngineMode } = await import('../../../profit/v5/engine.js');
  assert.equal(ENGINE_DEFAULT, 'new');
  const own = store.get('lx5_engine');
  try {
    setEngineMode(null);
    assert.equal(engineMode(), 'new');
    const calls = stub({ engine: () => answer({ automations: [] }, 200, 'new'), old: () => answer({ automations: ['old'] }) });
    assert.deepEqual(await api(READ, { worker: 'ah' }), { automations: [] });
    assert.deepEqual(calls.map(c => c.which), ['engine']);
    setEngineMode('old');
    const back = stub({ engine: () => answer({ automations: [] }, 200, 'new'), old: () => answer({ automations: ['old'] }) });
    assert.deepEqual(await api(READ, { worker: 'ah' }), { automations: ['old'] });
    assert.deepEqual(back.map(c => c.which), ['old']);
  } finally { store.set('lx5_engine', own); }
});

test('by default a read the engine does not answer in time, or cannot be reached for, is asked of the old engine', async () => {
  const own = store.get('lx5_engine');
  store.delete('lx5_engine');
  try {
    for (const fail of [() => { throw Object.assign(new Error('aborted'), { name: 'AbortError' }); }, () => { throw new TypeError('Failed to fetch'); }]) {
      const calls = stub({ engine: fail, old: () => answer({ automations: ['old'] }) });
      assert.deepEqual(await api(READ, { worker: 'ah' }), { automations: ['old'] });
      assert.deepEqual(calls.map(c => c.which), ['engine', 'old']);
      assert.equal(misses()[0].kind, 'failed');
    }
  } finally { store.set('lx5_engine', own); }
});

test('by default the server flag off (the engine pipes to the old engine) is used as the answer, not asked twice', async () => {
  const own = store.get('lx5_engine');
  store.delete('lx5_engine');
  try {
    const calls = stub({ engine: () => answer({ automations: ['piped'] }, 200, 'pipe'), old: () => answer({ automations: ['old'] }) });
    assert.deepEqual(await api(READ, { worker: 'ah' }), { automations: ['piped'] });
    assert.equal(oldCalls(calls), 0);
  } finally { store.set('lx5_engine', own); }
});

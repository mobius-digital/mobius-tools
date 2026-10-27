/* A short in-isolate memo for heavy GET answers (2026-10-26, "switching brands, tabs and Agency view take several
 * seconds"). The live worker is on workers.dev, where the Cache API does nothing, so the memo lives in module memory:
 * it survives between requests on the same isolate and is simply empty on a fresh one.
 *
 * Rules:
 *  - The caller builds the key, and the key MUST carry who is asking (session kind, a client's brand scope, the act):
 *    a client login can never be served another brand's answer.
 *  - In-flight calls are shared: two screens asking at the same moment run the work once.
 *  - A failed call is never kept.
 *  - Every write (any non-GET request) through this worker clears the lot (bumpMemo), so a save is never followed
 *    by an old number from this isolate.
 *  - The answer is shared between callers: never mutate what memo() hands back. */
const STORE = new Map();
let GEN = 0;
const MAX = 300;

export function bumpMemo() { GEN++; STORE.clear(); }

/** memo(key, ttlMs, fn, { force }) -> Promise of fn()'s answer, reused for ttlMs. force = run fn now and keep that. */
export function memo(key, ttlMs, fn, opts = {}) {
  const now = Date.now();
  const hit = STORE.get(key);
  if (!opts.force && hit && hit.gen === GEN && now - hit.at < ttlMs) return hit.p;
  const p = Promise.resolve().then(fn);
  const entry = { at: now, gen: GEN, p };
  STORE.set(key, entry);
  p.catch(() => { if (STORE.get(key) === entry) STORE.delete(key); });
  if (STORE.size > MAX) {
    for (const [k, v] of STORE) { if (now - v.at > 10 * 60e3 || v.gen !== GEN) STORE.delete(k); }
    while (STORE.size > MAX) STORE.delete(STORE.keys().next().value);
  }
  return p;
}

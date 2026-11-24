/* A tiny D1 stand-in over node:sqlite for the Shopify tests (test-shopifyapp.mjs, test-shoptoken.mjs,
 * test-shopify-webhooks.mjs): real SQL against the real p_shopify shape, so a typo in a query fails a test. */
import { DatabaseSync } from 'node:sqlite';

/** The tables the Shopify code touches. `legacy: true` builds p_shopify WITHOUT the 2026-11-24 token columns, to
 *  prove the worker adds them itself on a database that has not been migrated. */
export function makeDb({ legacy = false } = {}) {
  const db = new DatabaseSync(':memory:');
  db.exec(`CREATE TABLE p_shopify (shop TEXT PRIMARY KEY, act_id TEXT, access_token TEXT NOT NULL, scopes TEXT,
    installed_at TEXT NOT NULL DEFAULT (datetime('now')), uninstalled_at TEXT, last_sync_at TEXT${legacy ? '' : ', refresh_token TEXT, expires_at INTEGER, refresh_expires_at INTEGER'})`);
  db.exec(`CREATE TABLE p_oauth_state (state TEXT PRIMARY KEY, shop TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT (datetime('now')))`);
  db.exec(`CREATE TABLE p_store_view (token TEXT PRIMARY KEY, shop TEXT NOT NULL UNIQUE, created_at TEXT NOT NULL DEFAULT (datetime('now')))`);
  db.exec(`CREATE TABLE p_cohorts (act_id TEXT NOT NULL, cohort_month TEXT NOT NULL, customers INTEGER, repeat_customers INTEGER, lifetime_spend REAL, lifetime_orders INTEGER, as_of TEXT, PRIMARY KEY (act_id, cohort_month))`);
  db.exec(`CREATE TABLE p_shop_address (act_id TEXT PRIMARY KEY, shop TEXT NOT NULL, updated_at TEXT NOT NULL DEFAULT (datetime('now')))`);
  db.exec(`CREATE TABLE brand_accounts (act_id TEXT PRIMARY KEY, name TEXT, tw_shop TEXT)`);
  db.exec(`CREATE TABLE p_profit_share (act_id TEXT PRIMARY KEY, token TEXT, created_at TEXT)`);
  const named = sql => sql.replace(/\?(\d+)/g, (_, n) => ':p' + n);
  const vals = a => Object.fromEntries(a.map((v, i) => ['p' + (i + 1), v === undefined ? null : typeof v === 'boolean' ? +v : v]));
  /* node:sqlite refuses a named parameter the statement does not use; D1 ignores extras. Pass only the used ones. */
  const used = (sql, a) => { const all = vals(a); return Object.fromEntries(Object.entries(all).filter(([k]) => new RegExp(`:${k}\\b`).test(named(sql)))); };
  const DB = {
    prepare(sql) {
      let args = [];
      const st = () => db.prepare(named(sql));
      return {
        bind(...a) { args = a; return this; },
        async first() { return st().get(used(sql, args)) || null; },
        async all() { return { results: st().all(used(sql, args)) }; },
        async run() { const r = st().run(used(sql, args)); return { meta: { changes: Number(r.changes) } }; },
      };
    },
    async batch(list) { const out = []; for (const s of list) out.push(await s.run()); return out; },
  };
  return { db, DB };
}

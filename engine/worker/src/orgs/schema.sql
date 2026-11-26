-- Test only. The tables the orgs statements touch, copied from account-health/worker/schema.sql so tests
-- run offline. This file is never run on the real database. Both are also in the kernel's test schema.
CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT
);

CREATE TABLE IF NOT EXISTS brands (
  id TEXT PRIMARY KEY, slug TEXT NOT NULL UNIQUE, name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active', tz TEXT NOT NULL DEFAULT 'America/Chicago', currency TEXT NOT NULL DEFAULT 'USD',
  internal_channel TEXT, client_channel TEXT,
  legacy_key TEXT UNIQUE, source TEXT NOT NULL DEFAULT 'mirror',
  created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  monthly_budget REAL, budgets_json TEXT NOT NULL DEFAULT '{}', goals_json TEXT NOT NULL DEFAULT '{}',
  target_cpa REAL, target_roas REAL, google_spend_json TEXT,
  brief_enabled INTEGER NOT NULL DEFAULT 0, brief_review INTEGER NOT NULL DEFAULT 0, review_first INTEGER NOT NULL DEFAULT 1,
  report_config_json TEXT, tw_attr_cursor TEXT, tw_attr_done INTEGER NOT NULL DEFAULT 0,
  storage_prefix TEXT);

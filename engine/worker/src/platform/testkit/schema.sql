-- Test only. The kernel's tables, copied from account-health/worker/schema.sql so tests run offline.
-- This file is never run on the real database.
CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT
);

CREATE TABLE IF NOT EXISTS accounts (
  act_id TEXT PRIMARY KEY, name TEXT NOT NULL, currency TEXT NOT NULL DEFAULT 'USD',
  tz TEXT NOT NULL DEFAULT 'America/Chicago', account_status INTEGER,
  added_at TEXT NOT NULL DEFAULT (datetime('now')), last_sync_insights TEXT, last_sync_activities TEXT, last_error TEXT,
  ads_backfill_done INTEGER NOT NULL DEFAULT 0, ads_video_done INTEGER NOT NULL DEFAULT 0, ads_video_cursor TEXT,
  ads_metrics_version INTEGER NOT NULL DEFAULT 0, ads_metrics_cursor TEXT
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

CREATE TABLE IF NOT EXISTS connections (
  id TEXT PRIMARY KEY, brand_id TEXT NOT NULL, kind TEXT NOT NULL, external_id TEXT NOT NULL,
  label TEXT, is_primary INTEGER NOT NULL DEFAULT 0, status TEXT NOT NULL DEFAULT 'connected',
  config_json TEXT NOT NULL DEFAULT '{}', last_sync TEXT, last_error TEXT, source TEXT NOT NULL DEFAULT 'mirror',
  added_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (kind, external_id));

CREATE TABLE IF NOT EXISTS brand_alias (
  alias TEXT PRIMARY KEY, brand_id TEXT NOT NULL, kind TEXT NOT NULL, added_at TEXT NOT NULL DEFAULT (datetime('now')));

DROP VIEW IF EXISTS brand_accounts;
CREATE VIEW brand_accounts AS
SELECT b.id AS act_id, b.id AS brand_id, b.name, b.currency, b.tz,
  CASE WHEN b.status = 'active' THEN 1 ELSE 0 END AS active, b.status,
  b.monthly_budget, b.budgets_json, m.account_status, b.created_at AS added_at,
  m.last_sync_insights, m.last_sync_activities, m.last_error,
  b.target_cpa, b.target_roas, b.internal_channel AS slack_channel, m.ads_backfill_done,
  (SELECT external_id FROM connections WHERE brand_id = b.id AND kind = 'triple_whale' ORDER BY is_primary DESC LIMIT 1) AS tw_shop,
  b.google_spend_json, b.goals_json, b.brief_enabled, b.client_channel AS brief_channel,
  CASE WHEN b.status = 'demo' THEN 1 ELSE 0 END AS demo,
  NULL AS report_channel, b.report_config_json, NULL AS report_client_channel, b.brief_review, b.review_first,
  m.ads_video_done, m.ads_video_cursor, m.ads_metrics_version, m.ads_metrics_cursor,
  b.tw_attr_cursor, b.tw_attr_done, (SELECT external_id FROM connections WHERE brand_id = b.id AND kind = 'meta' ORDER BY is_primary DESC, added_at LIMIT 1) AS meta_act, b.storage_prefix, b.slug,
  b.internal_channel, b.client_channel
FROM brands b LEFT JOIN accounts m ON m.act_id = (SELECT external_id FROM connections WHERE brand_id = b.id AND kind = 'meta' ORDER BY is_primary DESC, added_at LIMIT 1);

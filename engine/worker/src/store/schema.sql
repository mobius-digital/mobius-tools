-- Test only. The tables the store group reads, copied from account-health/worker/schema.sql,
-- profit/worker/schema.sql and the old workers' own table makers, so tests run offline.
-- This file is never run on the real database.
CREATE TABLE IF NOT EXISTS tw_daily (
  act_id TEXT NOT NULL, date TEXT NOT NULL, metric TEXT NOT NULL, value REAL NOT NULL DEFAULT 0,
  synced_at TEXT NOT NULL DEFAULT (datetime('now')), PRIMARY KEY (act_id, date, metric));

CREATE TABLE IF NOT EXISTS tw_orders (
  act_id TEXT NOT NULL, order_id TEXT NOT NULL, customer_id TEXT, date TEXT NOT NULL, total REAL NOT NULL DEFAULT 0,
  currency TEXT, products_json TEXT, source TEXT, synced_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (act_id, order_id));

CREATE TABLE IF NOT EXISTS tw_order_touch (
  act_id TEXT NOT NULL, order_id TEXT NOT NULL, date TEXT NOT NULL, model TEXT NOT NULL, platform TEXT,
  ad_id TEXT NOT NULL, weight REAL NOT NULL DEFAULT 1, click_date TEXT, PRIMARY KEY (act_id, order_id, model, ad_id));

CREATE TABLE IF NOT EXISTS daily_insights (
  act_id TEXT NOT NULL, date TEXT NOT NULL, spend REAL NOT NULL DEFAULT 0, impressions INTEGER NOT NULL DEFAULT 0,
  reach INTEGER NOT NULL DEFAULT 0, clicks INTEGER NOT NULL DEFAULT 0, link_clicks INTEGER NOT NULL DEFAULT 0,
  purchases REAL NOT NULL DEFAULT 0, revenue REAL NOT NULL DEFAULT 0, video_views INTEGER NOT NULL DEFAULT 0,
  source TEXT NOT NULL DEFAULT 'meta', synced_at TEXT NOT NULL DEFAULT (datetime('now')), PRIMARY KEY (act_id, date));

CREATE TABLE IF NOT EXISTS ads (
  act_id TEXT NOT NULL, ad_id TEXT NOT NULL, name TEXT, adset_id TEXT, campaign_id TEXT, created_time TEXT,
  first_spend_date TEXT, status TEXT, synced_at TEXT NOT NULL DEFAULT (datetime('now')), PRIMARY KEY (act_id, ad_id));

CREATE TABLE IF NOT EXISTS ad_daily (
  act_id TEXT NOT NULL, ad_id TEXT NOT NULL, date TEXT NOT NULL, spend REAL NOT NULL DEFAULT 0,
  impressions INTEGER NOT NULL DEFAULT 0, purchases REAL NOT NULL DEFAULT 0, revenue REAL NOT NULL DEFAULT 0,
  PRIMARY KEY (act_id, ad_id, date));

CREATE TABLE IF NOT EXISTS meta_adsets (
  act_id TEXT NOT NULL, adset_id TEXT PRIMARY KEY, campaign_id TEXT, name TEXT, status TEXT, daily_budget REAL,
  optimization_goal TEXT, min_spend REAL, created_time TEXT, synced_at TEXT NOT NULL DEFAULT (datetime('now')),
  start_time TEXT, end_time TEXT);

CREATE TABLE IF NOT EXISTS p_cost_health (
  act_id TEXT PRIMARY KEY, verdict TEXT NOT NULL, reason TEXT, blended REAL, p10 REAL, p90 REAL,
  negatives INTEGER, days INTEGER, checked_at TEXT NOT NULL DEFAULT (datetime('now')));

CREATE TABLE IF NOT EXISTS p_cost_rule (
  id INTEGER PRIMARY KEY AUTOINCREMENT, act_id TEXT NOT NULL, cost TEXT NOT NULL, rule TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'typed', amount REAL, table_json TEXT, start_date TEXT NOT NULL, end_date TEXT,
  status TEXT NOT NULL DEFAULT 'on', label TEXT, notes TEXT, created_by TEXT, created_name TEXT,
  created_at TEXT DEFAULT (datetime('now')), updated_by TEXT, updated_at TEXT DEFAULT (datetime('now')));

CREATE TABLE IF NOT EXISTS p_expense (
  id INTEGER PRIMARY KEY AUTOINCREMENT, act_id TEXT NOT NULL, name TEXT NOT NULL, category TEXT,
  kind TEXT NOT NULL DEFAULT 'monthly', amount REAL NOT NULL DEFAULT 0, start_date TEXT NOT NULL, end_date TEXT,
  is_ad_spend INTEGER NOT NULL DEFAULT 0, notes TEXT, created_by TEXT, created_name TEXT,
  created_at TEXT DEFAULT (datetime('now')), updated_by TEXT, updated_at TEXT DEFAULT (datetime('now')), legacy_id INTEGER);

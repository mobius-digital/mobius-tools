-- Test only. The tables the metrics statements touch, copied from account-health/worker/schema.sql,
-- profit/worker/schema.sql and the old ensure functions (costs.js, expenses.js), so tests run offline.
-- This file is never run on the real database.
CREATE TABLE IF NOT EXISTS tw_daily (
  act_id TEXT NOT NULL, date TEXT NOT NULL, metric TEXT NOT NULL, value REAL NOT NULL DEFAULT 0,
  synced_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (act_id, date, metric)
);

CREATE TABLE IF NOT EXISTS daily_insights (
  act_id TEXT NOT NULL, date TEXT NOT NULL, spend REAL NOT NULL DEFAULT 0, impressions INTEGER NOT NULL DEFAULT 0,
  reach INTEGER NOT NULL DEFAULT 0, clicks INTEGER NOT NULL DEFAULT 0, link_clicks INTEGER NOT NULL DEFAULT 0,
  purchases REAL NOT NULL DEFAULT 0, revenue REAL NOT NULL DEFAULT 0, video_views INTEGER NOT NULL DEFAULT 0,
  source TEXT NOT NULL DEFAULT 'meta', synced_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (act_id, date)
);

CREATE TABLE IF NOT EXISTS tw_ad_attr (
  act_id TEXT NOT NULL, date TEXT NOT NULL, ad_id TEXT NOT NULL, model TEXT NOT NULL,
  revenue REAL NOT NULL DEFAULT 0, orders REAL NOT NULL DEFAULT 0, platform TEXT
);

CREATE TABLE IF NOT EXISTS ads (
  act_id TEXT NOT NULL, ad_id TEXT NOT NULL, name TEXT, adset_id TEXT, campaign_id TEXT, created_time TEXT,
  first_spend_date TEXT, status TEXT, synced_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (act_id, ad_id)
);

CREATE TABLE IF NOT EXISTS activities (
  id TEXT PRIMARY KEY, act_id TEXT NOT NULL, event_time TEXT NOT NULL, event_type TEXT, translated TEXT, actor TEXT,
  object_type TEXT, object_id TEXT, object_name TEXT, extra_json TEXT, category TEXT NOT NULL DEFAULT 'other',
  summary TEXT, reason TEXT, suggested_reason TEXT, note TEXT, confirmed INTEGER NOT NULL DEFAULT 0,
  manual INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL DEFAULT (datetime('now')), client_why TEXT
);

CREATE TABLE IF NOT EXISTS p_cost_health (
  act_id TEXT PRIMARY KEY, verdict TEXT NOT NULL, reason TEXT, blended REAL, p10 REAL, p90 REAL,
  negatives INTEGER, days INTEGER, checked_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS p_plan (
  act_id TEXT NOT NULL, month TEXT NOT NULL, growth_pct REAL, basis_sales REAL, basis_label TEXT,
  required_spend REAL, expected_cm REAL, agreed_at TEXT, agreed_by TEXT, share_token TEXT, note TEXT,
  assumptions_json TEXT, updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (act_id, month)
);

CREATE TABLE IF NOT EXISTS p_cost_rule (
  id INTEGER PRIMARY KEY AUTOINCREMENT, act_id TEXT NOT NULL, cost TEXT NOT NULL, rule TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'typed', amount REAL, table_json TEXT, start_date TEXT NOT NULL, end_date TEXT,
  status TEXT NOT NULL DEFAULT 'on', label TEXT, notes TEXT, created_by TEXT, created_name TEXT,
  created_at TEXT DEFAULT (datetime('now')), updated_by TEXT, updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS p_expense (
  id INTEGER PRIMARY KEY AUTOINCREMENT, act_id TEXT NOT NULL, name TEXT NOT NULL, category TEXT,
  kind TEXT NOT NULL DEFAULT 'monthly', amount REAL NOT NULL DEFAULT 0, start_date TEXT NOT NULL, end_date TEXT,
  is_ad_spend INTEGER NOT NULL DEFAULT 0, notes TEXT, created_by TEXT, created_name TEXT,
  created_at TEXT DEFAULT (datetime('now')), updated_by TEXT, updated_at TEXT DEFAULT (datetime('now')), legacy_id INTEGER
);

-- Shopify daily store totals (profit/worker/src/shopsync.js), read by the store source switch (storesource.js).
CREATE TABLE IF NOT EXISTS p_shop_daily (
  act_id TEXT NOT NULL, day TEXT NOT NULL, shop TEXT NOT NULL,
  gross_sales REAL, discounts REAL, returns REAL, net_sales REAL, shipping REAL, taxes REAL, total_sales REAL,
  sales REAL, refunds REAL, orders_all INTEGER,
  orders INTEGER, zero_orders INTEGER, new_orders INTEGER, returning_orders INTEGER, paid_sales REAL,
  orders_source TEXT, currency TEXT, synced_at TEXT NOT NULL DEFAULT (datetime('now')), orders_at TEXT,
  PRIMARY KEY (act_id, day)
);

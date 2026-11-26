-- Test only. The tables the ads statements touch, copied from account-health/worker/schema.sql,
-- profit/worker/migrations/brand-001.sql and the old ensure functions (worker.js, launch.js, creative.js,
-- metawrite.js, extwrite.js), so tests run offline. This file is never run on the real database.
CREATE TABLE IF NOT EXISTS daily_insights (
  act_id TEXT NOT NULL, date TEXT NOT NULL, spend REAL NOT NULL DEFAULT 0, impressions INTEGER NOT NULL DEFAULT 0,
  reach INTEGER NOT NULL DEFAULT 0, clicks INTEGER NOT NULL DEFAULT 0, link_clicks INTEGER NOT NULL DEFAULT 0,
  purchases REAL NOT NULL DEFAULT 0, revenue REAL NOT NULL DEFAULT 0, video_views INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (act_id, date));

CREATE TABLE IF NOT EXISTS activities (
  id TEXT PRIMARY KEY, act_id TEXT NOT NULL, event_time TEXT NOT NULL, event_type TEXT, translated TEXT, actor TEXT,
  object_type TEXT, object_id TEXT, object_name TEXT, extra_json TEXT, category TEXT NOT NULL DEFAULT 'other', summary TEXT,
  reason TEXT, suggested_reason TEXT, note TEXT, confirmed INTEGER NOT NULL DEFAULT 0, manual INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')), client_why TEXT);

CREATE TABLE IF NOT EXISTS ads (
  act_id TEXT NOT NULL, ad_id TEXT NOT NULL, name TEXT, adset_id TEXT, campaign_id TEXT, created_time TEXT,
  first_spend_date TEXT, status TEXT, synced_at TEXT NOT NULL DEFAULT (datetime('now')), media_type TEXT, asset_key TEXT,
  PRIMARY KEY (act_id, ad_id));

CREATE TABLE IF NOT EXISTS ad_daily (
  act_id TEXT NOT NULL, ad_id TEXT NOT NULL, date TEXT NOT NULL, spend REAL NOT NULL DEFAULT 0,
  impressions INTEGER NOT NULL DEFAULT 0, purchases REAL NOT NULL DEFAULT 0, revenue REAL NOT NULL DEFAULT 0,
  link_clicks INTEGER NOT NULL DEFAULT 0, video_3s INTEGER NOT NULL DEFAULT 0, video_thruplay INTEGER NOT NULL DEFAULT 0,
  video_p100 INTEGER NOT NULL DEFAULT 0, reach INTEGER NOT NULL DEFAULT 0, clicks_all INTEGER NOT NULL DEFAULT 0,
  outbound_clicks INTEGER NOT NULL DEFAULT 0, video_p25 INTEGER NOT NULL DEFAULT 0, video_p50 INTEGER NOT NULL DEFAULT 0,
  video_p75 INTEGER NOT NULL DEFAULT 0, video_avg_watch REAL NOT NULL DEFAULT 0, video_plays INTEGER NOT NULL DEFAULT 0,
  add_to_cart REAL NOT NULL DEFAULT 0, leads REAL NOT NULL DEFAULT 0, initiate_checkout REAL NOT NULL DEFAULT 0,
  PRIMARY KEY (act_id, ad_id, date));

CREATE TABLE IF NOT EXISTS meta_campaigns (
  act_id TEXT NOT NULL, campaign_id TEXT PRIMARY KEY, name TEXT, objective TEXT, status TEXT, daily_budget REAL,
  lifetime_budget REAL, bid_strategy TEXT, created_time TEXT, synced_at TEXT NOT NULL DEFAULT (datetime('now')));

CREATE TABLE IF NOT EXISTS meta_adsets (
  act_id TEXT NOT NULL, adset_id TEXT PRIMARY KEY, campaign_id TEXT, name TEXT, status TEXT, daily_budget REAL,
  optimization_goal TEXT, min_spend REAL, created_time TEXT, synced_at TEXT NOT NULL DEFAULT (datetime('now')));

CREATE TABLE IF NOT EXISTS tw_daily (
  act_id TEXT NOT NULL, date TEXT NOT NULL, metric TEXT NOT NULL, value REAL NOT NULL DEFAULT 0,
  synced_at TEXT NOT NULL DEFAULT (datetime('now')), PRIMARY KEY (act_id, date, metric));

CREATE TABLE IF NOT EXISTS tw_ad_attr (
  act_id TEXT NOT NULL, ad_id TEXT NOT NULL, date TEXT NOT NULL, model TEXT NOT NULL, platform TEXT,
  revenue REAL NOT NULL DEFAULT 0, orders REAL NOT NULL DEFAULT 0, PRIMARY KEY (act_id, ad_id, date, model));

CREATE TABLE IF NOT EXISTS tw_orders (
  act_id TEXT NOT NULL, order_id TEXT NOT NULL, customer_id TEXT, date TEXT NOT NULL, total REAL NOT NULL DEFAULT 0,
  currency TEXT, products_json TEXT, source TEXT, synced_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (act_id, order_id));

CREATE TABLE IF NOT EXISTS tw_order_touch (
  act_id TEXT NOT NULL, order_id TEXT NOT NULL, date TEXT NOT NULL, model TEXT NOT NULL, platform TEXT, ad_id TEXT NOT NULL,
  weight REAL NOT NULL DEFAULT 1, click_date TEXT, PRIMARY KEY (act_id, order_id, model, ad_id));

CREATE TABLE IF NOT EXISTS ad_tag (
  asset_key TEXT PRIMARY KEY, act_id TEXT, media_type TEXT, tags_json TEXT, model TEXT, cost REAL, tagged_at TEXT, err TEXT);

CREATE TABLE IF NOT EXISTS p_br_doc (
  act_id TEXT NOT NULL, line_id TEXT NOT NULL DEFAULT '', key TEXT NOT NULL, data_json TEXT NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'approved', source TEXT, updated_at TEXT NOT NULL DEFAULT (datetime('now')), updated_by TEXT,
  PRIMARY KEY (act_id, line_id, key));

CREATE TABLE IF NOT EXISTS p_br_angle (
  id TEXT PRIMARY KEY, act_id TEXT NOT NULL, line_id TEXT, persona_id TEXT, name TEXT NOT NULL, argument TEXT, awareness TEXT,
  stage TEXT, lead TEXT, status TEXT NOT NULL DEFAULT 'active', source TEXT, note TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now')));

CREATE TABLE IF NOT EXISTS p_br_batch (
  id TEXT PRIMARY KEY, act_id TEXT NOT NULL, num TEXT NOT NULL, title TEXT NOT NULL, angle_id TEXT, concept_id TEXT,
  level TEXT, variable TEXT, offer TEXT, hypothesis TEXT, why TEXT, brief_url TEXT, asset_url TEXT,
  stage TEXT NOT NULL DEFAULT 'idea', verdict TEXT, verdict_note TEXT, verdict_by TEXT, verdict_at TEXT, learning TEXT,
  legacy_json TEXT, source TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now')));

CREATE TABLE IF NOT EXISTS p_meta_write (
  id TEXT PRIMARY KEY, act TEXT NOT NULL, brand TEXT, level TEXT, object TEXT NOT NULL, name TEXT, action TEXT NOT NULL,
  field TEXT, before TEXT, after TEXT, summary TEXT, by TEXT, at TEXT NOT NULL DEFAULT (datetime('now')), undone TEXT);

CREATE TABLE IF NOT EXISTS p_ext_write (
  id TEXT PRIMARY KEY, platform TEXT NOT NULL, brand TEXT, object TEXT, name TEXT, action TEXT NOT NULL, before TEXT, after TEXT,
  undo TEXT, summary TEXT, by TEXT, at TEXT NOT NULL, undone TEXT);

CREATE TABLE IF NOT EXISTS p_launch (
  id TEXT PRIMARY KEY, act TEXT NOT NULL, meta_act TEXT, source TEXT NOT NULL, studio_ad TEXT, studio_batch TEXT, batch_id TEXT,
  num TEXT, ad_id TEXT, ad_name TEXT, adset_id TEXT, adset_name TEXT, write_id TEXT, status TEXT, eff_status TEXT,
  checked_at TEXT, by TEXT, at TEXT NOT NULL, verdict TEXT, learning TEXT, filed_at TEXT, work_file TEXT, cta TEXT, cards TEXT);

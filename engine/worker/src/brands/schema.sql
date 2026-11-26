-- Test only. The tables the brands group reads, copied from profit/worker/migrations/brand-001.sql
-- (and its later added columns) and account-health/worker/schema.sql, so tests run offline.
-- This file is never run on the real database.
CREATE TABLE IF NOT EXISTS p_br_line (
  id TEXT PRIMARY KEY, act_id TEXT NOT NULL, name TEXT NOT NULL, about TEXT, products TEXT,
  sort INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL DEFAULT (datetime('now')));

CREATE TABLE IF NOT EXISTS p_br_doc (
  act_id TEXT NOT NULL, line_id TEXT NOT NULL DEFAULT '', key TEXT NOT NULL,
  data_json TEXT NOT NULL DEFAULT '{}', status TEXT NOT NULL DEFAULT 'approved',
  source TEXT, updated_at TEXT NOT NULL DEFAULT (datetime('now')), updated_by TEXT,
  PRIMARY KEY (act_id, line_id, key));

CREATE TABLE IF NOT EXISTS p_br_persona (
  id TEXT PRIMARY KEY, act_id TEXT NOT NULL, line_id TEXT, name TEXT NOT NULL,
  data_json TEXT NOT NULL DEFAULT '{}', status TEXT NOT NULL DEFAULT 'draft',
  source TEXT, sort INTEGER NOT NULL DEFAULT 0, updated_at TEXT NOT NULL DEFAULT (datetime('now')));

CREATE TABLE IF NOT EXISTS p_br_voc (
  id TEXT PRIMARY KEY, act_id TEXT NOT NULL, line_id TEXT, persona_id TEXT, kind TEXT NOT NULL,
  quote TEXT NOT NULL, source TEXT, url TEXT, theme TEXT, nugget INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'draft', created_at TEXT NOT NULL DEFAULT (datetime('now')));

CREATE TABLE IF NOT EXISTS p_br_comp (
  id TEXT PRIMARY KEY, act_id TEXT NOT NULL, line_id TEXT, name TEXT NOT NULL, url TEXT,
  data_json TEXT NOT NULL DEFAULT '{}', status TEXT NOT NULL DEFAULT 'draft',
  sort INTEGER NOT NULL DEFAULT 0, updated_at TEXT NOT NULL DEFAULT (datetime('now')));

CREATE TABLE IF NOT EXISTS p_br_angle (
  id TEXT PRIMARY KEY, act_id TEXT NOT NULL, line_id TEXT, persona_id TEXT,
  name TEXT NOT NULL, argument TEXT, awareness TEXT, stage TEXT, lead TEXT,
  status TEXT NOT NULL DEFAULT 'active', source TEXT, note TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now')));

CREATE TABLE IF NOT EXISTS p_br_concept (
  id TEXT PRIMARY KEY, act_id TEXT NOT NULL, angle_id TEXT, name TEXT NOT NULL,
  about TEXT, format TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now')));

CREATE TABLE IF NOT EXISTS p_br_batch (
  id TEXT PRIMARY KEY, act_id TEXT NOT NULL, num TEXT NOT NULL, title TEXT NOT NULL,
  angle_id TEXT, concept_id TEXT, level TEXT, variable TEXT,
  offer TEXT, hypothesis TEXT, why TEXT, brief_url TEXT, asset_url TEXT,
  stage TEXT NOT NULL DEFAULT 'idea',
  verdict TEXT, verdict_note TEXT, verdict_by TEXT, verdict_at TEXT,
  learning TEXT, legacy_json TEXT, source TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  asana_gid TEXT, asana_url TEXT, asana_section TEXT, assignee_gid TEXT, tagged_at TEXT, result_posted TEXT,
  asana_angle TEXT, asana_result TEXT, check_again TEXT, keep_reason TEXT, brief_text TEXT, layer TEXT);

CREATE TABLE IF NOT EXISTS p_br_adtag (
  act_id TEXT NOT NULL, ad_id TEXT NOT NULL, batch_id TEXT NOT NULL,
  tagged_by TEXT, tagged_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (act_id, ad_id));

CREATE TABLE IF NOT EXISTS p_br_onboard (
  act_id TEXT PRIMARY KEY, token TEXT NOT NULL UNIQUE,
  answers_json TEXT NOT NULL DEFAULT '{}', prefill_json TEXT NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'sent', step INTEGER NOT NULL DEFAULT 0, submitted_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now')));

CREATE TABLE IF NOT EXISTS p_br_run (
  id TEXT PRIMARY KEY, act_id TEXT NOT NULL, line_id TEXT, step TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'running', searches INTEGER NOT NULL DEFAULT 0,
  in_tokens INTEGER NOT NULL DEFAULT 0, out_tokens INTEGER NOT NULL DEFAULT 0,
  error TEXT, started_at TEXT NOT NULL DEFAULT (datetime('now')), finished_at TEXT);

CREATE TABLE IF NOT EXISTS ads (
  act_id TEXT NOT NULL, ad_id TEXT NOT NULL, name TEXT, adset_id TEXT, campaign_id TEXT,
  created_time TEXT, first_spend_date TEXT, status TEXT, media_type TEXT,
  synced_at TEXT NOT NULL DEFAULT (datetime('now')), PRIMARY KEY (act_id, ad_id));

CREATE TABLE IF NOT EXISTS ad_daily (
  act_id TEXT NOT NULL, ad_id TEXT NOT NULL, date TEXT NOT NULL,
  spend REAL NOT NULL DEFAULT 0, impressions INTEGER NOT NULL DEFAULT 0,
  purchases REAL NOT NULL DEFAULT 0, revenue REAL NOT NULL DEFAULT 0,
  link_clicks INTEGER NOT NULL DEFAULT 0, video_3s INTEGER NOT NULL DEFAULT 0,
  add_to_cart REAL NOT NULL DEFAULT 0, PRIMARY KEY (act_id, ad_id, date));

CREATE TABLE IF NOT EXISTS tw_ad_attr (
  act_id TEXT NOT NULL, date TEXT NOT NULL, ad_id TEXT NOT NULL, model TEXT NOT NULL,
  revenue REAL NOT NULL DEFAULT 0, orders REAL NOT NULL DEFAULT 0, platform TEXT,
  PRIMARY KEY (act_id, date, ad_id, model));

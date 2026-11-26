-- Test only. The tables the automations statements touch, copied from the old ensure() in
-- account-health/worker/src/automations.js so tests run offline. This file is never run on the real database.
CREATE TABLE IF NOT EXISTS p_automation (
  id TEXT PRIMARY KEY, org_id TEXT NOT NULL DEFAULT 'default', scope TEXT NOT NULL DEFAULT 'org', brand_id TEXT NOT NULL DEFAULT 'all',
  owner_person TEXT, name TEXT NOT NULL, template_key TEXT, kind TEXT NOT NULL DEFAULT 'rule',
  trigger_json TEXT NOT NULL, conditions_json TEXT NOT NULL DEFAULT '[]', actions_json TEXT NOT NULL DEFAULT '[]', audience_json TEXT NOT NULL DEFAULT '{}',
  state TEXT NOT NULL DEFAULT 'draft', may_act_alone INTEGER NOT NULL DEFAULT 0, cursor TEXT, last_run_at TEXT, last_status TEXT,
  fail_count INTEGER NOT NULL DEFAULT 0, created_by TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, version INTEGER NOT NULL DEFAULT 1);

CREATE TABLE IF NOT EXISTS p_automation_run (
  id TEXT PRIMARY KEY, automation_id TEXT NOT NULL, org_id TEXT NOT NULL DEFAULT 'default', brand_id TEXT, event_key TEXT NOT NULL, thing_key TEXT,
  started_at TEXT NOT NULL, finished_at TEXT, result TEXT NOT NULL, why TEXT, title TEXT, did_json TEXT,
  ai_in INTEGER NOT NULL DEFAULT 0, ai_out INTEGER NOT NULL DEFAULT 0, ai_usd REAL NOT NULL DEFAULT 0, change_ref TEXT, tapped_by TEXT, tapped_at TEXT, episode_at TEXT);

CREATE TABLE IF NOT EXISTS p_automation_sub (
  automation_id TEXT NOT NULL, person_id TEXT NOT NULL, mode TEXT NOT NULL DEFAULT 'now', ways_json TEXT, at_hour INTEGER, updated_at TEXT,
  PRIMARY KEY (automation_id, person_id));

CREATE TABLE IF NOT EXISTS p_notice (
  id TEXT PRIMARY KEY, org_id TEXT NOT NULL DEFAULT 'default', person_id TEXT NOT NULL, brand_id TEXT, run_id TEXT, automation_id TEXT,
  kind TEXT NOT NULL DEFAULT 'tell', title TEXT NOT NULL, body TEXT, button_json TEXT, state TEXT NOT NULL DEFAULT 'open', home INTEGER NOT NULL DEFAULT 1,
  due_at TEXT, hold_until TEXT, repeat_step INTEGER NOT NULL DEFAULT 0, sent_json TEXT, answer TEXT, created_at TEXT NOT NULL, done_at TEXT, done_by TEXT);

CREATE TABLE IF NOT EXISTS p_person_delivery (
  person_id TEXT PRIMARY KEY, org_id TEXT NOT NULL DEFAULT 'default', tz TEXT, read_hour INTEGER NOT NULL DEFAULT 7, read_days TEXT,
  quiet_from INTEGER, quiet_to INTEGER, break_quiet_json TEXT, mode TEXT NOT NULL DEFAULT 'now', ways_json TEXT, updated_at TEXT);

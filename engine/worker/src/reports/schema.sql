-- Test only. The tables the reports group reads, copied from account-health/worker/schema.sql and the old
-- ensure functions (meetings.js, actions.js, slackindex.js, profit snapshot.js and clientpage.js).
-- This file is never run on the real database.
CREATE TABLE IF NOT EXISTS reports (
  act_id TEXT NOT NULL, period TEXT NOT NULL, period_start TEXT NOT NULL, period_end TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft', generated_at TEXT, sent_at TEXT, sent_channel TEXT, summary TEXT,
  data_json TEXT, slack_ts TEXT, slack_channel TEXT, steer TEXT,
  PRIMARY KEY (act_id, period, period_start));

CREATE TABLE IF NOT EXISTS p_report_read (
  act_id TEXT NOT NULL, period TEXT NOT NULL, period_start TEXT NOT NULL, points_json TEXT, points_at TEXT,
  team_view TEXT, team_source TEXT, meeting_id TEXT, draft TEXT, draft_at TEXT, read_text TEXT,
  status TEXT NOT NULL DEFAULT 'none', approved_by TEXT, approved_at TEXT, edited_at TEXT, updated_at TEXT,
  PRIMARY KEY (act_id, period, period_start));

CREATE TABLE IF NOT EXISTS briefs (
  act_id TEXT NOT NULL, date TEXT NOT NULL, posted_at TEXT, channel TEXT, status TEXT NOT NULL DEFAULT 'draft',
  text TEXT, data_json TEXT, slack_ts TEXT, slack_channel TEXT, steer TEXT,
  PRIMARY KEY (act_id, date));

CREATE TABLE IF NOT EXISTS p_snapshot (
  token TEXT PRIMARY KEY, act_id TEXT NOT NULL, kind TEXT NOT NULL DEFAULT 'card', title TEXT NOT NULL, page TEXT,
  html TEXT NOT NULL, css TEXT, meta_json TEXT, created_by TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at TEXT, revoked INTEGER NOT NULL DEFAULT 0, views INTEGER NOT NULL DEFAULT 0, last_view TEXT);

CREATE TABLE IF NOT EXISTS p_client_page (
  token TEXT PRIMARY KEY, slug TEXT NOT NULL UNIQUE, title TEXT NOT NULL, acts TEXT NOT NULL, html TEXT NOT NULL,
  created_by TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  revoked INTEGER NOT NULL DEFAULT 0, views INTEGER NOT NULL DEFAULT 0, last_view TEXT);

CREATE TABLE IF NOT EXISTS p_meeting (
  id TEXT PRIMARY KEY, title TEXT, date TEXT, at TEXT, duration REAL, organizer TEXT, attendees_json TEXT,
  chars INTEGER, kind TEXT, notes_json TEXT, status TEXT NOT NULL DEFAULT 'new', error TEXT, cost REAL DEFAULT 0,
  confirmed_by TEXT, confirmed_at TEXT, result_json TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);

CREATE TABLE IF NOT EXISTS p_action (
  id TEXT PRIMARY KEY, act_id TEXT NOT NULL DEFAULT '', text TEXT NOT NULL, owner TEXT NOT NULL DEFAULT '',
  owner_email TEXT, due TEXT NOT NULL DEFAULT '', kind TEXT NOT NULL DEFAULT 'team', status TEXT NOT NULL DEFAULT 'open',
  source TEXT NOT NULL DEFAULT 'manual', source_id TEXT, asana_gid TEXT, done_at TEXT, done_by TEXT, done_how TEXT,
  reminded_on TEXT, slack_channel TEXT, slack_ts TEXT, created_at TEXT NOT NULL, created_by TEXT,
  asana_url TEXT, area TEXT, detail TEXT);

CREATE TABLE IF NOT EXISTS slack_msg (
  channel TEXT NOT NULL, ts TEXT NOT NULL, thread_ts TEXT, user TEXT, name TEXT, bot INTEGER NOT NULL DEFAULT 0,
  text TEXT, files TEXT, brand TEXT, side TEXT, day TEXT, PRIMARY KEY (channel, ts));

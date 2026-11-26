-- Test only. The tables the production statements touch, copied from the old code so tests run offline.
-- This file is never run on the real database.

-- from account-health/worker/src/requests.js (REQUEST_SQL)
CREATE TABLE IF NOT EXISTS p_request (
  id TEXT PRIMARY KEY, act_id TEXT NOT NULL, kind TEXT NOT NULL, what TEXT, ref TEXT, title TEXT NOT NULL, body TEXT, link TEXT,
  status TEXT NOT NULL DEFAULT 'open', by_email TEXT, by_name TEXT, by_role TEXT, decided_by TEXT, decided_at TEXT,
  decision_note TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS p_request_msg (
  id TEXT PRIMARY KEY, request_id TEXT NOT NULL, by_email TEXT, by_name TEXT, by_role TEXT, text TEXT NOT NULL, created_at TEXT NOT NULL
);

-- from profit/worker/schema.sql
CREATE TABLE IF NOT EXISTS p_studio_ad (
  id TEXT PRIMARY KEY, act_id TEXT NOT NULL, parent_id TEXT, status TEXT NOT NULL DEFAULT 'review', spec_json TEXT NOT NULL,
  prompt TEXT, model TEXT, full_w INTEGER, full_h INTEGER, has_plate INTEGER NOT NULL DEFAULT 0, layers_json TEXT,
  has_final INTEGER NOT NULL DEFAULT 0, cost REAL NOT NULL DEFAULT 0, created_by TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- from account-health/worker/src/assets.js (ensure)
CREATE TABLE IF NOT EXISTS p_asset (
  act_id TEXT NOT NULL, file_id TEXT NOT NULL, name TEXT, mime TEXT, folder TEXT, path TEXT, modified TEXT, w INTEGER, h INTEGER,
  thumb_src TEXT, thumb_key TEXT, status TEXT DEFAULT 'new', people INTEGER, setting TEXT, shot TEXT, products TEXT, colors TEXT,
  descr TEXT, tags_json TEXT, tagged_at TEXT, seen_at TEXT, source TEXT, kind TEXT, cost REAL, look_json TEXT,
  PRIMARY KEY (act_id, file_id)
);

-- from profit/worker/migrations/brand-001.sql
CREATE TABLE IF NOT EXISTS p_br_doc (
  act_id TEXT NOT NULL, line_id TEXT NOT NULL DEFAULT '', key TEXT NOT NULL, data_json TEXT NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'approved', source TEXT, updated_at TEXT NOT NULL DEFAULT (datetime('now')), updated_by TEXT,
  PRIMARY KEY (act_id, line_id, key)
);

-- from profit/worker/migrations/brand-001.sql (the columns the card ownership check reads)
CREATE TABLE IF NOT EXISTS p_br_batch (
  id TEXT PRIMARY KEY, act_id TEXT NOT NULL, num TEXT NOT NULL, title TEXT NOT NULL, stage TEXT NOT NULL DEFAULT 'idea',
  board_stage TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- from profit/worker/src/inspo.js (ensure)
CREATE TABLE IF NOT EXISTS p_inspo (
  id TEXT PRIMARY KEY, act_id TEXT NOT NULL, kind TEXT NOT NULL, url TEXT, image TEXT, title TEXT, site TEXT, note TEXT,
  created_by TEXT, created_at TEXT NOT NULL
);

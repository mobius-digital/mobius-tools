-- Saved dashboards (the hub, 2026-10-07): a dashboard the team asked for in chat and keeps.
-- The Strategist writes the spec, Locus draws it live, account-health posts it to Slack on
-- its schedule. Also created on first use by dashboard.js ensureDash().
CREATE TABLE IF NOT EXISTS p_dashboard (
  id          TEXT PRIMARY KEY,
  act_id      TEXT,
  name        TEXT NOT NULL,
  for_who     TEXT,
  spec_json   TEXT NOT NULL,
  schedule    TEXT,
  channel     TEXT,
  pinned      INTEGER NOT NULL DEFAULT 1,
  created_by  TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now')),
  last_posted TEXT
);

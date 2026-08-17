-- Launch Calendar schema for Cloudflare D1 (SQLite).
--
-- Apply with:  npx wrangler d1 execute launch-calendar --remote --file=./db/schema.sql
--
-- SQLite has no enums and no jsonb, so:
--   * type/status are TEXT with CHECK constraints
--   * channels is TEXT holding JSON, parsed in the app layer
-- Access control is the shared password gate in front of the whole site, so
-- there is no row-level security here; the database is only reachable from the
-- Worker, never from a browser.

CREATE TABLE IF NOT EXISTS events (
  id             TEXT PRIMARY KEY,
  name           TEXT NOT NULL,
  type           TEXT NOT NULL CHECK (type IN (
                   'product_launch','promo','restock',
                   'content_moment','evergreen_push','other')),
  status         TEXT NOT NULL DEFAULT 'tentative' CHECK (status IN (
                   'confirmed','tentative','at_risk','completed','cancelled')),
  brief          TEXT NOT NULL DEFAULT '',
  launch_date    TEXT NOT NULL,
  promo_end_date TEXT,
  inventory_date TEXT,
  asset_deadline TEXT,
  teaser_start   TEXT,
  channels       TEXT NOT NULL,
  owner          TEXT NOT NULL,
  notes          TEXT,
  created_at     TEXT NOT NULL,
  updated_at     TEXT NOT NULL,
  updated_by     TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS events_launch_date_idx ON events (launch_date);
CREATE INDEX IF NOT EXISTS events_status_idx ON events (status);

-- event_id is nullable and set to NULL on delete, with event_name denormalised,
-- so hard-deleting an event leaves its history readable.
CREATE TABLE IF NOT EXISTS changelog (
  id             TEXT PRIMARY KEY,
  event_id       TEXT REFERENCES events (id) ON DELETE SET NULL,
  event_name     TEXT NOT NULL,
  change_summary TEXT NOT NULL,
  changed_by     TEXT NOT NULL,
  created_at     TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS changelog_created_at_idx ON changelog (created_at DESC);
CREATE INDEX IF NOT EXISTS changelog_event_id_idx ON changelog (event_id);

-- Small key/value store. Holds the shared team password hash, so the password
-- can be changed from inside the app rather than needing a redeploy.
CREATE TABLE IF NOT EXISTS settings (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

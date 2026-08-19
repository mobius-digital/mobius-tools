-- Launch Calendar schema for Cloudflare D1 (SQLite).
--
-- Apply with:  npx wrangler d1 execute launch-calendar --remote --file=./db/schema.sql
--
-- SQLite has no enums and no jsonb, so:
--   * status is TEXT with a CHECK constraint, because the app branches on it
--   * type is plain TEXT: boards define their own types from Settings, so the
--     valid set lives in the settings table and is enforced in the app layer
--   * channels is TEXT holding JSON, parsed in the app layer
-- Access control is the shared password gate in front of the whole site, so
-- there is no row-level security here; the database is only reachable from the
-- Worker, never from a browser.

CREATE TABLE IF NOT EXISTS events (
  id             TEXT PRIMARY KEY,
  name           TEXT NOT NULL,
  type           TEXT NOT NULL,
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
  -- Where the finished assets live (a folder link). Filling it in is what
  -- tells Slack "the assets are in".
  assets_link    TEXT,
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

-- Who may sign in with Google. Empty means nobody, which is why switching to
-- Google sign-in is refused until at least one address is on the list.
CREATE TABLE IF NOT EXISTS allowed_emails (
  email      TEXT PRIMARY KEY,
  added_by   TEXT,
  created_at TEXT NOT NULL
);

-- Which Slack channel hears about each marketing channel (paid/email/organic/
-- sms). Empty until somebody configures Slack in Settings; an unmapped channel
-- notifies nowhere, which the settings screen says out loud.
CREATE TABLE IF NOT EXISTS slack_channel_map (
  channel_key TEXT PRIMARY KEY,
  slack_id    TEXT NOT NULL,
  slack_name  TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);

-- Pending Slack notifications, waiting out the 15-minute batch window.
--
-- No foreign key to events on purpose: a row must survive its event being
-- deleted mid-window, and event_name is denormalised so nothing has to be
-- joined back to render a message.
CREATE TABLE IF NOT EXISTS slack_outbox (
  id           TEXT PRIMARY KEY,
  event_id     TEXT NOT NULL,
  event_name   TEXT NOT NULL,
  kind         TEXT NOT NULL,
  lines        TEXT NOT NULL,
  channel_keys TEXT NOT NULL,
  actor        TEXT NOT NULL,
  created_at   TEXT NOT NULL,
  due_at       TEXT NOT NULL,
  attempts     INTEGER NOT NULL DEFAULT 0,
  -- JSON array of Slack channel ids this row has already reached. A row can
  -- target several channels; if one post fails the row is retried, and this is
  -- what stops the channels that already got it receiving it twice.
  sent_to      TEXT NOT NULL DEFAULT '[]',
  sent_at      TEXT
);

CREATE INDEX IF NOT EXISTS slack_outbox_pending_idx ON slack_outbox (sent_at, due_at);

-- Reminders already sent, so a tick that runs twice cannot double-post.
-- launch_date is part of the key: a launch that moves is due a fresh reminder.
CREATE TABLE IF NOT EXISTS slack_reminders_sent (
  event_id    TEXT NOT NULL,
  kind        TEXT NOT NULL,
  launch_date TEXT NOT NULL,
  sent_at     TEXT NOT NULL,
  PRIMARY KEY (event_id, kind, launch_date)
);

-- Slack notifications.
--
-- Three tables, all additive — safe to run on a live database, and safe to run
-- twice. A board that never turns Slack on simply leaves them empty.
--
-- Apply with:
--   npx wrangler d1 execute launch-calendar --remote --file=./db/migrations/002-slack-notifications.sql

-- Which Slack channel hears about each marketing channel. One row per
-- marketing channel at most; an unmapped channel notifies nowhere, which the
-- settings screen says out loud rather than failing silently.
CREATE TABLE IF NOT EXISTS slack_channel_map (
  channel_key TEXT PRIMARY KEY,
  slack_id    TEXT NOT NULL,
  slack_name  TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);

-- Pending notifications, waiting out the batch window.
--
-- No foreign key to events on purpose: a row must survive its event being
-- deleted mid-window (the flush skips it), and event_name is denormalised so
-- nothing has to be joined back to render a message.
CREATE TABLE IF NOT EXISTS slack_outbox (
  id           TEXT PRIMARY KEY,
  event_id     TEXT NOT NULL,
  event_name   TEXT NOT NULL,
  -- created | changed | added  (see lib/slackNotify.ts)
  kind         TEXT NOT NULL,
  -- JSON array of changelog-style lines describing what changed
  lines        TEXT NOT NULL,
  -- JSON array of marketing channel keys this row should reach
  channel_keys TEXT NOT NULL,
  actor        TEXT NOT NULL,
  created_at   TEXT NOT NULL,
  -- When the batch window this row joined closes.
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
--
-- launch_date is part of the key rather than just a column: a launch that
-- genuinely moves has a new date, and so is due a fresh reminder.
CREATE TABLE IF NOT EXISTS slack_reminders_sent (
  event_id    TEXT NOT NULL,
  kind        TEXT NOT NULL,
  launch_date TEXT NOT NULL,
  sent_at     TEXT NOT NULL,
  PRIMARY KEY (event_id, kind, launch_date)
);

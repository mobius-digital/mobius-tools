-- The FYI roundup (2026-11-09, account-health src/lane.js): a Slack message that asks nobody to do anything is not posted;
-- fyi() stores it here as one line (brand + lane + Central day) and roundupTick posts ONE end-of-day roundup per brand in
-- its internal channel from 4pm Central (act_id '' = the agency's, to settings.slackChannel). posted_at = when it went
-- ('no channel' when the brand had nowhere to post). Rows older than 14 days are deleted by the tick. Also made on first use.
CREATE TABLE IF NOT EXISTS slack_fyi (id INTEGER PRIMARY KEY AUTOINCREMENT, act_id TEXT NOT NULL DEFAULT '', lane TEXT NOT NULL, line TEXT NOT NULL,
  day TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT (datetime('now')), posted_at TEXT, UNIQUE (act_id, day, lane, line));
CREATE INDEX IF NOT EXISTS slack_fyi_open ON slack_fyi (posted_at, act_id);

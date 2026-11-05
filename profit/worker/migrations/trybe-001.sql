-- Ads > Trybe (2026-11-05, account-health src/trybe.js). Reference only: both tables are also made on first use.
CREATE TABLE IF NOT EXISTS p_trybe_sub (
  act_id TEXT NOT NULL,            -- the brand id
  sub_id TEXT NOT NULL,            -- Trybe submission id
  trybe_id TEXT,                   -- last 8 of the uuid; an ad carries it as trybe=<id> in its name
  creator_id TEXT, creator TEXT, status TEXT, media TEXT,
  program TEXT, product TEXT, angle TEXT, transcript TEXT, thumb TEXT, created_at TEXT,
  ads_count INTEGER NOT NULL DEFAULT 0, ads_first TEXT, ads_last TEXT,
  approved_seen TEXT,              -- the day Locus first saw it approved (Trybe has no approval date)
  alerted TEXT,                    -- the day its stale line was posted in Slack
  synced_at TEXT,
  PRIMARY KEY (act_id, sub_id));
CREATE INDEX IF NOT EXISTS p_trybe_sub_status ON p_trybe_sub (act_id, status);
CREATE TABLE IF NOT EXISTS p_trybe_creator (
  act_id TEXT NOT NULL, creator_id TEXT NOT NULL, name TEXT, avatar TEXT, joined_at TEXT, last_sub_at TEXT, last_ad_day TEXT,
  earnings REAL NOT NULL DEFAULT 0, gmv REAL NOT NULL DEFAULT 0, synced_at TEXT,
  PRIMARY KEY (act_id, creator_id));

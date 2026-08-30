-- Mobius Account Health — D1 schema
-- Apply:  npx wrangler d1 execute mobius-account-health --remote --file=schema.sql
-- Safe to re-run (CREATE IF NOT EXISTS everywhere).

CREATE TABLE IF NOT EXISTS accounts (
  act_id              TEXT PRIMARY KEY,          -- "act_123..."
  name                TEXT NOT NULL,
  currency            TEXT NOT NULL DEFAULT 'USD',
  tz                  TEXT NOT NULL DEFAULT 'America/Chicago',
  active              INTEGER NOT NULL DEFAULT 0,
  monthly_budget      REAL,                      -- monthly spend target (cap or goal) per calendar month
  budgets_json        TEXT NOT NULL DEFAULT '{}',-- {"2026-08": 15000, ...} month overrides
  target_cpa          REAL,                      -- KPI guardrail: 7d CPA above this = breach
  target_roas         REAL,                      -- KPI guardrail: 7d ROAS below this = breach
  slack_channel       TEXT,                      -- the brand's INTERNAL channel: drafts awaiting review, delivery alerts
  brief_channel       TEXT,                      -- the brand's CLIENT channel: where an approved brief or report is sent.
                                                 -- Deliberately NO fallback to slack_channel on a client send - a silent
                                                 -- redirect to the team is the failure the review flow exists to prevent.
  ads_backfill_done   INTEGER NOT NULL DEFAULT 0,-- 90d ad-level backfill finished (walks back 14d per sync until set)
  ads_video_done      INTEGER NOT NULL DEFAULT 0,-- RETIRED 2026-08-30, superseded by ads_metrics_version
  ads_video_cursor    TEXT,                      -- RETIRED 2026-08-30, superseded by ads_metrics_cursor
  ads_metrics_version INTEGER NOT NULL DEFAULT 0,-- highest ADS_METRICS_VERSION this account has re-backfilled
  ads_metrics_cursor  TEXT,                      -- resumable cursor for that re-backfill (walks back 14d per sync)
  tw_shop             TEXT,                      -- Triple Whale shop domain (pulls Google Ads spend into the money math)
  google_spend_json   TEXT,                      -- cached {ym, metric, mtd, lm_same_day, lm_total, updated}
  goals_json          TEXT NOT NULL DEFAULT '{}',-- Daily Brief goals: {"2026-08":{sales,spend,amer,cm_pct},"default":{...}}
  brief_enabled       INTEGER NOT NULL DEFAULT 0,-- the Daily Brief runs each morning for this brand
  review_first        INTEGER NOT NULL DEFAULT 1,-- 1 = every deliverable (daily brief, weekly and monthly report)
                                                 -- drafts to slack_channel and waits for a human to edit + send;
                                                 -- 0 = each posts straight to brief_channel on its own
  report_channel      TEXT,                      -- RETIRED 2026-08-27, superseded by slack_channel. Column kept so
                                                 -- the table tolerates old rows; nothing reads it.
  report_config_json  TEXT,                      -- {"weekly":true,"monthly":true,"hide":["amazon"]} — defaults on, hide = excluded sections
  report_client_channel TEXT,                    -- RETIRED 2026-08-27, superseded by brief_channel. Column kept so
                                                 -- the table tolerates old rows; nothing reads it.
  account_status      INTEGER,                   -- Meta account_status (1 = active)
  added_at            TEXT NOT NULL DEFAULT (datetime('now')),
  last_sync_insights  TEXT,
  last_sync_activities TEXT,
  last_error          TEXT
);

CREATE TABLE IF NOT EXISTS daily_insights (
  act_id       TEXT NOT NULL,
  date         TEXT NOT NULL,                    -- YYYY-MM-DD, account timezone
  spend        REAL NOT NULL DEFAULT 0,
  impressions  INTEGER NOT NULL DEFAULT 0,
  reach        INTEGER NOT NULL DEFAULT 0,
  clicks       INTEGER NOT NULL DEFAULT 0,
  link_clicks  INTEGER NOT NULL DEFAULT 0,
  purchases    REAL NOT NULL DEFAULT 0,
  revenue      REAL NOT NULL DEFAULT 0,
  video_views  INTEGER NOT NULL DEFAULT 0,       -- 3-second video plays (thumbstop numerator)
  source       TEXT NOT NULL DEFAULT 'meta',
  synced_at    TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (act_id, date)
);

CREATE TABLE IF NOT EXISTS hourly_insights (
  act_id       TEXT NOT NULL,
  date         TEXT NOT NULL,
  hour         INTEGER NOT NULL,                 -- 0..23, account timezone
  spend        REAL NOT NULL DEFAULT 0,
  impressions  INTEGER NOT NULL DEFAULT 0,
  purchases    REAL NOT NULL DEFAULT 0,
  revenue      REAL NOT NULL DEFAULT 0,
  synced_at    TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (act_id, date, hour)
);

CREATE TABLE IF NOT EXISTS activities (
  id           TEXT PRIMARY KEY,                 -- Meta event id, or "manual:<uuid>"
  act_id       TEXT NOT NULL,
  event_time   TEXT NOT NULL,                    -- ISO 8601
  event_type   TEXT,                             -- raw Meta event_type
  translated   TEXT,                             -- Meta's human string
  actor        TEXT,
  object_type  TEXT,                             -- AD, ADSET, CAMPAIGN, ACCOUNT ...
  object_id    TEXT,
  object_name  TEXT,
  extra_json   TEXT,                             -- raw extra_data (old/new values)
  category     TEXT NOT NULL DEFAULT 'other',    -- auto-classified (see worker CATEGORIES)
  summary      TEXT,                             -- one-line human description, e.g. "Budget: $210/day → $300/day"
  reason       TEXT,                             -- human tag (Chat 1)
  suggested_reason TEXT,                         -- heuristic guess from perf data; ✓ promotes it to reason
  note         TEXT,
  confirmed    INTEGER NOT NULL DEFAULT 0,
  manual       INTEGER NOT NULL DEFAULT 0,
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_activities_act_time ON activities (act_id, event_time);
CREATE INDEX IF NOT EXISTS idx_activities_category ON activities (act_id, category);

CREATE TABLE IF NOT EXISTS ads (
  act_id           TEXT NOT NULL,
  ad_id            TEXT NOT NULL,
  name             TEXT,
  adset_id         TEXT,
  campaign_id      TEXT,
  created_time     TEXT,
  first_spend_date TEXT,
  status           TEXT,
  synced_at        TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (act_id, ad_id)
);

CREATE TABLE IF NOT EXISTS ad_daily (
  act_id       TEXT NOT NULL,
  ad_id        TEXT NOT NULL,
  date         TEXT NOT NULL,
  spend        REAL NOT NULL DEFAULT 0,
  impressions  INTEGER NOT NULL DEFAULT 0,
  purchases    REAL NOT NULL DEFAULT 0,
  revenue      REAL NOT NULL DEFAULT 0,
  link_clicks    INTEGER NOT NULL DEFAULT 0,      -- inline link clicks (CTR numerator)
  video_3s       INTEGER NOT NULL DEFAULT 0,      -- 3-second video views (hook-rate numerator)
  video_thruplay INTEGER NOT NULL DEFAULT 0,      -- ThruPlay views (hold-rate numerator, over video_3s)
  video_p100     INTEGER NOT NULL DEFAULT 0,      -- watched to 100%
  reach            INTEGER NOT NULL DEFAULT 0,    -- people reached (impressions/reach = frequency)
  clicks_all       INTEGER NOT NULL DEFAULT 0,    -- every click, incl. reactions and profile taps
  outbound_clicks  INTEGER NOT NULL DEFAULT 0,    -- clicks that actually left Meta
  video_p25        INTEGER NOT NULL DEFAULT 0,    -- retention curve: 25/50/75/100
  video_p50        INTEGER NOT NULL DEFAULT 0,
  video_p75        INTEGER NOT NULL DEFAULT 0,
  video_avg_watch  REAL    NOT NULL DEFAULT 0,    -- average seconds watched (an AVERAGE - never summed)
  PRIMARY KEY (act_id, ad_id, date)
);

CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT
);

-- Daily Brief (Chat 5): per-day Triple Whale metrics (long format — one row per metric per day)
CREATE TABLE IF NOT EXISTS tw_daily (
  act_id    TEXT NOT NULL,
  date      TEXT NOT NULL,                       -- YYYY-MM-DD, shop timezone
  metric    TEXT NOT NULL,                       -- TW metricId (netSales, newCustomerSales, ...)
  value     REAL NOT NULL DEFAULT 0,
  synced_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (act_id, date, metric)
);

-- Weekly / Monthly client reports: FROZEN snapshots. Generated as drafts (Monday
-- for last Mon–Sun, the 1st for last month), reviewed internally, sent to the
-- client's Slack with a button. The interface is Mobius Profit's Reports tab;
-- the client reads a tokenized archive link (settings.reportTokens) served by
-- the profit worker. A sent report never changes — that is the whole point.
CREATE TABLE IF NOT EXISTS reports (
  act_id       TEXT NOT NULL,
  period       TEXT NOT NULL,                    -- weekly | monthly
  period_start TEXT NOT NULL,                    -- YYYY-MM-DD (a Monday / the 1st)
  period_end   TEXT NOT NULL,
  status       TEXT NOT NULL DEFAULT 'draft',    -- draft | sent
  generated_at TEXT,
  sent_at      TEXT,
  sent_channel TEXT,
  summary      TEXT,                             -- Claude narrative; editable while draft
  data_json    TEXT,                             -- the frozen numbers behind the page
  PRIMARY KEY (act_id, period, period_start)
);

-- Daily Brief (Chat 5): every brief we generated/sent, one per account per covered day
CREATE TABLE IF NOT EXISTS briefs (
  act_id    TEXT NOT NULL,
  date      TEXT NOT NULL,                       -- the day the brief covers (usually yesterday)
  posted_at TEXT,
  channel   TEXT,
  status    TEXT NOT NULL DEFAULT 'draft',       -- draft | sent | skipped | error
  text      TEXT,
  data_json TEXT,                                -- the forecast/actual numbers behind the text
  PRIMARY KEY (act_id, date)
);

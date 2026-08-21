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
  slack_channel       TEXT,                      -- per-brand INTERNAL alerts channel (falls back to settings.slackChannel)
  brief_channel       TEXT,                      -- per-brand CLIENT-FACING Daily Brief channel (falls back to slack_channel)
  ads_backfill_done   INTEGER NOT NULL DEFAULT 0,-- 90d ad-level backfill finished (walks back 14d per sync until set)
  tw_shop             TEXT,                      -- Triple Whale shop domain (pulls Google Ads spend into the money math)
  google_spend_json   TEXT,                      -- cached {ym, metric, mtd, lm_same_day, lm_total, updated}
  goals_json          TEXT NOT NULL DEFAULT '{}',-- Daily Brief goals: {"2026-08":{sales,spend,amer,cm_pct},"default":{...}}
  brief_enabled       INTEGER NOT NULL DEFAULT 0,-- auto-post the Daily Brief to Slack each morning
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

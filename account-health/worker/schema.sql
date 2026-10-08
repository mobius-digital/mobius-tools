-- Mobius Account Health — D1 schema
-- Apply:  npx wrangler d1 execute mobius-account-health --remote --file=schema.sql
-- Safe to re-run (CREATE IF NOT EXISTS everywhere).

CREATE TABLE IF NOT EXISTS accounts (
  -- ONE ROW PER META AD ACCOUNT (since the brand-first rebuild, 2026-10-08). A brand is a row in `brands`;
  -- its Meta ad accounts are `connections` of kind 'meta' whose external_id is this act_id. Brand settings
  -- (goals, budgets, targets, channels, brief and report options) live on `brands`. Read a brand through
  -- the brand_accounts view. Discovery inserts every ad account Locus can see here.
  act_id              TEXT PRIMARY KEY,          -- "act_123..."
  name                TEXT NOT NULL,             -- the ad account's name in Meta
  currency            TEXT NOT NULL DEFAULT 'USD',
  tz                  TEXT NOT NULL DEFAULT 'America/Chicago',
  account_status      INTEGER,                   -- Meta account_status (1 = active)
  added_at            TEXT NOT NULL DEFAULT (datetime('now')),
  last_sync_insights  TEXT,
  last_sync_activities TEXT,
  last_error          TEXT,
  ads_backfill_done   INTEGER NOT NULL DEFAULT 0,-- 90d ad-level backfill finished (walks back 14d per sync until set)
  ads_video_done      INTEGER NOT NULL DEFAULT 0,-- RETIRED 2026-08-30, superseded by ads_metrics_version
  ads_video_cursor    TEXT,                      -- RETIRED 2026-08-30, superseded by ads_metrics_cursor
  ads_metrics_version INTEGER NOT NULL DEFAULT 0,-- highest ADS_METRICS_VERSION this account has re-backfilled
  ads_metrics_cursor  TEXT                       -- resumable cursor for that re-backfill (walks back 14d per sync)
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
  video_plays      INTEGER NOT NULL DEFAULT 0,    -- video plays: the denominator for the retention curve
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
  status       TEXT NOT NULL DEFAULT 'draft',    -- draft | sent | handled (internal-only brand: no client channel, nothing to send)
  generated_at TEXT,
  sent_at      TEXT,
  sent_channel TEXT,
  summary      TEXT,                             -- Claude narrative; editable while draft
  data_json    TEXT,                             -- the frozen numbers behind the page
  -- Where the internal review post lives, so a send/edit/rewrite from EITHER
  -- surface (Locus or the Slack buttons) can rewrite that same message rather
  -- than leaving a stale one with live buttons underneath it.
  slack_ts      TEXT,
  slack_channel TEXT,
  steer         TEXT,                            -- the direction given on the last rewrite, if any
  PRIMARY KEY (act_id, period, period_start)
);

-- Daily Brief (Chat 5): every brief we generated/sent, one per account per covered day
CREATE TABLE IF NOT EXISTS briefs (
  act_id    TEXT NOT NULL,
  date      TEXT NOT NULL,                       -- the day the brief covers (usually yesterday)
  posted_at TEXT,
  channel   TEXT,
  status    TEXT NOT NULL DEFAULT 'draft',       -- draft | sent | skipped | handled (internal-only brand) | error
  text      TEXT,
  data_json TEXT,                                -- the forecast/actual numbers behind the text
  -- The internal review post in Slack. `channel` above records where the brief
  -- was SENT (the client); these record where the DRAFT notice sits, so either
  -- surface can keep it in step. See slackSyncBrief in the worker.
  slack_ts      TEXT,
  slack_channel TEXT,
  steer         TEXT,                            -- the direction given on the last rewrite, if any
  PRIMARY KEY (act_id, date)
);

-- Cached login-free preview URLs, and the verdict on WHY an ad has no mp4.
-- A partnership ad's video lives on the creator's page and can never be fetched,
-- so resolving one costs five doomed Meta calls; the verdict is cached and the
-- click short-circuits. Preview tokens expire on a long horizon (see
-- AD_PREVIEW_TTL_DAYS), so rows are re-checked weekly.
CREATE TABLE IF NOT EXISTS ad_preview (
  ad_id       TEXT PRIMARY KEY,
  url         TEXT,
  partnership INTEGER NOT NULL DEFAULT 0,
  page_id     TEXT,
  fetched_at  TEXT NOT NULL
);

-- The ideas bot (src/ideas.js, 2026-09-29). Also created on first use by ensureIdeaTables.
-- Columns added later by ensureIdeaTables (ALTER ... on first use, never here): idea_thread.deep,
-- lines_json, section_pick (the card's Section dropdown), media_json (the thread's videos);
-- idea_media.file_key / bytes / clip (the R2 copy of the clip kept for the creator link);
-- idea_run.model, pick_cost, card_ts.
-- idea_media: each reference video watched ONCE (Gemini facts), keyed by video id / Slack file id.
CREATE TABLE IF NOT EXISTS idea_media (key TEXT PRIMARY KEY, platform TEXT, url TEXT, status TEXT NOT NULL DEFAULT 'ok',
  facts_json TEXT, g_in INTEGER NOT NULL DEFAULT 0, g_out INTEGER NOT NULL DEFAULT 0, cost REAL NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')));
-- idea_thread: one row per Slack thread (id = channel:thread_ts); the draft is the truth, the Slack card a view of it.
CREATE TABLE IF NOT EXISTS idea_thread (id TEXT PRIMARY KEY, act_id TEXT, channel TEXT NOT NULL, thread_ts TEXT NOT NULL,
  reply_ts TEXT, status TEXT NOT NULL DEFAULT 'working', from_name TEXT, refs_json TEXT, draft_json TEXT, seen_ts TEXT,
  pushed_json TEXT, notes_json TEXT, runs INTEGER NOT NULL DEFAULT 0, cost REAL NOT NULL DEFAULT 0, last_cost REAL NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now')));
-- idea_run: tokens and dollars per tag (the cost meter).
CREATE TABLE IF NOT EXISTS idea_run (id TEXT PRIMARY KEY, idea_id TEXT, act_id TEXT, kind TEXT, status TEXT NOT NULL DEFAULT 'running',
  c_in INTEGER NOT NULL DEFAULT 0, c_cache_read INTEGER NOT NULL DEFAULT 0, c_cache_write INTEGER NOT NULL DEFAULT 0, c_out INTEGER NOT NULL DEFAULT 0,
  g_in INTEGER NOT NULL DEFAULT 0, g_out INTEGER NOT NULL DEFAULT 0, downloads INTEGER NOT NULL DEFAULT 0,
  videos_new INTEGER NOT NULL DEFAULT 0, videos_cached INTEGER NOT NULL DEFAULT 0, cost REAL NOT NULL DEFAULT 0, error TEXT,
  started_at TEXT NOT NULL DEFAULT (datetime('now')), finished_at TEXT);

-- Customer history from Triple Whale's journeys (2026-10-05): one row per order with the
-- customer, the day, the money, the cart's products and the last-platform-click source.
-- Written by syncTwAttribution (same response, no extra call) and backfilled 400 days one
-- slice a night. Customers (profit) reads it for cohorts, LTV, LTV:CAC and the product journey.
CREATE TABLE IF NOT EXISTS tw_orders (
  act_id        TEXT NOT NULL,
  order_id      TEXT NOT NULL,
  customer_id   TEXT,
  date          TEXT NOT NULL,                 -- YYYY-MM-DD, shop timezone
  total         REAL NOT NULL DEFAULT 0,
  currency      TEXT,
  products_json TEXT,                          -- product ids added to the cart before the order
  source        TEXT,                          -- meta | google | ... | organic (lastPlatformClick)
  synced_at     TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (act_id, order_id)
);
CREATE INDEX IF NOT EXISTS tw_orders_cust ON tw_orders (act_id, customer_id, date);

-- Brands and their connections (2026-10-08, the brand-first rebuild; src/brands.js, which also
-- creates these at runtime). A brand has its own permanent id; Meta, Triple Whale, Shopify, Google,
-- TikTok, Klaviyo, Asana, Drive and Frame are connections on top, any number of each.
-- legacy_key = the id the older tables still file the brand under (its act_ id) until phase 3.
-- connections never hold a secret: the Strategist can read them.
CREATE TABLE IF NOT EXISTS brands (
  id TEXT PRIMARY KEY, slug TEXT NOT NULL UNIQUE, name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active', tz TEXT NOT NULL DEFAULT 'America/Chicago', currency TEXT NOT NULL DEFAULT 'USD',
  internal_channel TEXT, client_channel TEXT,
  legacy_key TEXT UNIQUE, source TEXT NOT NULL DEFAULT 'mirror',
  created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  -- brand settings (phase 3: moved here from accounts, which keeps only Meta sync state)
  monthly_budget REAL, budgets_json TEXT NOT NULL DEFAULT '{}', goals_json TEXT NOT NULL DEFAULT '{}',
  target_cpa REAL, target_roas REAL, google_spend_json TEXT,
  brief_enabled INTEGER NOT NULL DEFAULT 0, brief_review INTEGER NOT NULL DEFAULT 0, review_first INTEGER NOT NULL DEFAULT 1,
  report_config_json TEXT, tw_attr_cursor TEXT, tw_attr_done INTEGER NOT NULL DEFAULT 0,
  storage_prefix TEXT);   -- the R2 folder this brand's files already sit under (its old act id)
CREATE INDEX IF NOT EXISTS brands_internal_idx ON brands (internal_channel);
CREATE TABLE IF NOT EXISTS connections (
  id TEXT PRIMARY KEY, brand_id TEXT NOT NULL, kind TEXT NOT NULL, external_id TEXT NOT NULL,
  label TEXT, is_primary INTEGER NOT NULL DEFAULT 0, status TEXT NOT NULL DEFAULT 'connected',
  config_json TEXT NOT NULL DEFAULT '{}', last_sync TEXT, last_error TEXT, source TEXT NOT NULL DEFAULT 'mirror',
  added_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (kind, external_id));
CREATE INDEX IF NOT EXISTS connections_brand_idx ON connections (brand_id, kind);
-- Any id a brand has ever had -> its brand id. Kept forever (old Slack buttons, links, webhooks).
CREATE TABLE IF NOT EXISTS brand_alias (
  alias TEXT PRIMARY KEY, brand_id TEXT NOT NULL, kind TEXT NOT NULL, added_at TEXT NOT NULL DEFAULT (datetime('now')));
CREATE INDEX IF NOT EXISTS brand_alias_brand_idx ON brand_alias (brand_id);

-- Each brand in the shape the code always used (act_id = the brand id), with its primary Meta account's
-- sync state. Read brands from here; write settings to brands, Meta sync state to accounts.
-- Generated from BRAND_VIEW_SQL in src/brands.js: keep the two identical.
DROP VIEW IF EXISTS brand_accounts;
CREATE VIEW brand_accounts AS
SELECT b.id AS act_id, b.id AS brand_id, b.name, b.currency, b.tz,
  CASE WHEN b.status = 'active' THEN 1 ELSE 0 END AS active, b.status,
  b.monthly_budget, b.budgets_json, m.account_status, b.created_at AS added_at,
  m.last_sync_insights, m.last_sync_activities, m.last_error,
  b.target_cpa, b.target_roas, b.internal_channel AS slack_channel, m.ads_backfill_done,
  (SELECT external_id FROM connections WHERE brand_id = b.id AND kind = 'triple_whale' ORDER BY is_primary DESC LIMIT 1) AS tw_shop,
  b.google_spend_json, b.goals_json, b.brief_enabled, b.client_channel AS brief_channel,
  CASE WHEN b.status = 'demo' THEN 1 ELSE 0 END AS demo,
  NULL AS report_channel, b.report_config_json, NULL AS report_client_channel, b.brief_review, b.review_first,
  m.ads_video_done, m.ads_video_cursor, m.ads_metrics_version, m.ads_metrics_cursor,
  b.tw_attr_cursor, b.tw_attr_done, (SELECT external_id FROM connections WHERE brand_id = b.id AND kind = 'meta' ORDER BY is_primary DESC, added_at LIMIT 1) AS meta_act, b.storage_prefix, b.slug,
  b.internal_channel, b.client_channel
FROM brands b LEFT JOIN accounts m ON m.act_id = (SELECT external_id FROM connections WHERE brand_id = b.id AND kind = 'meta' ORDER BY is_primary DESC, added_at LIMIT 1);

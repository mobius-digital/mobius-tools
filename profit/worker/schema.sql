-- Mobius Profit — additive schema on the shared mobius-account-health D1.
-- Apply:  npx wrangler d1 execute mobius-account-health --remote --file=schema.sql
-- Every table here is prefixed p_ so it can never collide with Account Health's.

-- Per-SKU cost overrides. Sourced from Shopify variant unitCost where available,
-- otherwise entered by hand. `sku = '*'` is the client-wide fallback cost rate.
CREATE TABLE IF NOT EXISTS p_sku_costs (
  act_id     TEXT NOT NULL,
  sku        TEXT NOT NULL,
  title      TEXT,
  unit_cost  REAL,
  source     TEXT NOT NULL DEFAULT 'manual',   -- shopify | manual
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (act_id, sku)
);

-- Snapshot of each client's cost-data health, refreshed nightly so the
-- all-clients view doesn't recompute 6 x 60 days on every page load.
CREATE TABLE IF NOT EXISTS p_cost_health (
  act_id      TEXT PRIMARY KEY,
  verdict     TEXT NOT NULL,                   -- good | noisy | broken | none | override
  reason      TEXT,
  blended     REAL,
  p10         REAL,
  p90         REAL,
  negatives   INTEGER,
  days        INTEGER,
  checked_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- The agreed month plan. The GOALS themselves still live in accounts.goals_json,
-- because that is the one field every tool reads; this table carries the story
-- around them: what the plan was built from, the growth we chose, and whether the
-- client has actually signed off on it.
CREATE TABLE IF NOT EXISTS p_plan (
  act_id         TEXT NOT NULL,
  month          TEXT NOT NULL,                  -- YYYY-MM
  growth_pct     REAL,                           -- 0.10 = +10% on the basis
  basis_sales    REAL,                           -- what last month / the run-rate was
  basis_label    TEXT,                           -- how the basis was derived
  required_spend REAL,                           -- spend the goal implies at trailing aMER
  expected_cm    REAL,
  agreed_at      TEXT,                           -- set when the client signs off
  agreed_by      TEXT,
  share_token    TEXT,                           -- read-only client link
  note           TEXT,
  updated_at     TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (act_id, month)
);
CREATE INDEX IF NOT EXISTS p_plan_token_idx ON p_plan (share_token);

-- Read-only client link for the Profit snapshot (the Phase-0 PRD open question:
-- "should clients get a read-only link to their own Profit page?"). One token per
-- client, regenerable. Deliberately a separate table from p_plan: the plan link and
-- the performance link have different lifetimes and you may want one without the other.
CREATE TABLE IF NOT EXISTS p_profit_share (
  act_id     TEXT PRIMARY KEY,
  token      TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS p_profit_share_token_idx ON p_profit_share (token);

-- Shopify OAuth. One unlisted public app installs on every client store, so tokens
-- are per-shop and arrive through the authorization code grant. `act_id` is filled in
-- once we match the shop domain to an account (accounts.tw_shop already holds it).
CREATE TABLE IF NOT EXISTS p_shopify (
  shop           TEXT PRIMARY KEY,          -- foo.myshopify.com
  act_id         TEXT,                      -- matched to accounts.tw_shop, null until then
  access_token   TEXT NOT NULL,
  scopes         TEXT,
  installed_at   TEXT NOT NULL DEFAULT (datetime('now')),
  uninstalled_at TEXT,                      -- set by the app/uninstalled webhook
  last_sync_at   TEXT
);
CREATE INDEX IF NOT EXISTS p_shopify_act_idx ON p_shopify (act_id);

-- Short-lived OAuth nonces. The callback must reject any `state` it did not issue,
-- or the install can be forged.
CREATE TABLE IF NOT EXISTS p_oauth_state (
  state      TEXT PRIMARY KEY,
  shop       TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Real cohorts: customers grouped by the month of their FIRST order, followed
-- forward. Sourced from Shopify (Triple Whale has no per-customer history), so rows
-- exist only for stores that have connected. lifetime_* are all-time to `as_of`.
CREATE TABLE IF NOT EXISTS p_cohorts (
  act_id           TEXT NOT NULL,
  cohort_month     TEXT NOT NULL,            -- YYYY-MM of first order
  customers        INTEGER,
  repeat_customers INTEGER,                  -- of those, how many ever ordered again
  lifetime_spend   REAL,
  lifetime_orders  INTEGER,
  as_of            TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (act_id, cohort_month)
);

-- The App Store reviewer needs a login, Shopify rejects Google SSO test accounts, and
-- the real password would expose six live brands. `demo = 1` marks the one fabricated
-- account a demo session is pinned to; it is also written with active = 0 so Account
-- Health's lists and the Slack brief, which both require active = 1, can never see it.
-- Additive on the SHARED accounts table, so it must tolerate already existing.
ALTER TABLE accounts ADD COLUMN demo INTEGER NOT NULL DEFAULT 0;

-- A FROZEN snapshot of the creative browser, for sending to a client.
-- Frozen, not live, for the same reason reports are: a link that keeps moving
-- disagrees with the message that announced it within hours. The rows and the
-- baked cover images are stored whole, so the client sees exactly what was on
-- screen when it was shared, forever. One row per share - unlike p_profit_share
-- there is no stable per-client link, because the whole point is that it
-- captures a particular question at a particular moment.
CREATE TABLE IF NOT EXISTS p_ad_share (
  token      TEXT PRIMARY KEY,
  act_id     TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  label      TEXT,
  data_json  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS p_ad_share_act_idx ON p_ad_share (act_id, created_at);

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

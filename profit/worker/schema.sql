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

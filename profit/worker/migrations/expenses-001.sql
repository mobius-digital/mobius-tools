-- Custom expenses per brand (2026-10-10, Costs like Triple Whale). Replaces p_fixed_cost (fixed-001.sql), which is left
-- in place and copied across once as monthly fixed costs. Also created (and the copy made) on first use by src/expenses.js.
-- kind: monthly | once | pct_revenue | pct_spend | per_order. amount: money, or the percent for the % kinds.
-- is_ad_spend = 1 adds the cost to blended ad spend (MER, aMER, CAC, CM); otherwise it comes off CM for Net profit.
CREATE TABLE IF NOT EXISTS p_expense (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  act_id        TEXT NOT NULL,
  name          TEXT NOT NULL,
  category      TEXT,
  kind          TEXT NOT NULL DEFAULT 'monthly',
  amount        REAL NOT NULL DEFAULT 0,
  start_date    TEXT NOT NULL,
  end_date      TEXT,
  is_ad_spend   INTEGER NOT NULL DEFAULT 0,
  notes         TEXT,
  created_by    TEXT,
  created_name  TEXT,
  created_at    TEXT DEFAULT (datetime('now')),
  updated_by    TEXT,
  updated_at    TEXT DEFAULT (datetime('now')),
  legacy_id     INTEGER
);
CREATE INDEX IF NOT EXISTS p_expense_act ON p_expense(act_id);
CREATE UNIQUE INDEX IF NOT EXISTS p_expense_legacy ON p_expense(legacy_id);

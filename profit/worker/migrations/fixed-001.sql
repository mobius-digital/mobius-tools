-- Fixed expenses per brand (2026-10-09, Triple Whale's "Edit expenses"): software, salaries, the agency fee, rent...
-- A monthly amount from start_month to end_month (NULL = still running), spread evenly over each month's days.
-- Feeds ONLY "Net profit" (contribution margin minus fixed) on P&L and the CM drill-down; CM itself never changes.
-- Also created on first use by src/fixed.js.
CREATE TABLE IF NOT EXISTS p_fixed_cost (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  act_id       TEXT NOT NULL,
  name         TEXT NOT NULL,
  category     TEXT,
  monthly      REAL NOT NULL DEFAULT 0,
  start_month  TEXT NOT NULL,
  end_month    TEXT,
  created_by   TEXT,
  updated_at   TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS p_fixed_cost_act ON p_fixed_cost(act_id);

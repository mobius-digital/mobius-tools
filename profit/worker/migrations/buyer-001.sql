-- The Buyer list (2026-10-26, account-health src/buyerlist.js): the shared Done / Skip memory for every ad call, test
-- minimum and launch on Ads > Buyer list and Ads > Today's calls. One row per brand + object + action.
-- Done = quiet 3 days (quiet_until = today + 3, Central), Skip = until tomorrow. Also made on first use.
CREATE TABLE IF NOT EXISTS p_buyer_state (brand TEXT NOT NULL, object TEXT NOT NULL, action TEXT NOT NULL, status TEXT NOT NULL,
  name TEXT, by TEXT, at TEXT NOT NULL, quiet_until TEXT NOT NULL, PRIMARY KEY (brand, object, action));
CREATE INDEX IF NOT EXISTS p_buyer_state_quiet ON p_buyer_state (quiet_until);

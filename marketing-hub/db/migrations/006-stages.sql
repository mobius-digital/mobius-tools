-- Where a launch is in its preparation.
--
-- Status already says whether the date is real. This says what the team is
-- waiting on: briefed, waiting on assets, built, scheduled. The list of stages
-- is the board's own (settings key `stages`), so this column holds a key from
-- that list, or NULL for an event nobody has sorted yet. Additive; safe to run
-- on a live database.
--
-- Apply with:
--   npx wrangler d1 execute marketing-hub --remote --file=./db/migrations/006-stages.sql

ALTER TABLE events ADD COLUMN stage TEXT;

-- The product has one name, and hub.config.ts holds it.
--
-- These two columns are from the single-tenant era, when the calendar could be
-- told what to call itself per deployment. They survived the move to one hub
-- and quietly contradicted it: `product_name` was hard-coded to 'Marketing
-- Calendar' for every board created, and `short_name` was collected on the
-- Add-a-client form and then ignored — the home-screen manifest has always
-- used the hub's own short name. Two fields that could not be changed and one
-- that changed nothing.
--
-- Every place that read them now reads hub.config.ts, so a board's tab, its
-- sign-in card, its Slack posts and its home-screen icon all say Lineup, over
-- the client's own colours and logo. Dropping the columns rather than leaving
-- them is the point: a column nobody reads is the next person's trap.
--
-- Apply with:
--   npx wrangler d1 execute marketing-hub --remote --file=./db/migrations/004-one-product-name.sql

ALTER TABLE brands DROP COLUMN product_name;
ALTER TABLE brands DROP COLUMN short_name;

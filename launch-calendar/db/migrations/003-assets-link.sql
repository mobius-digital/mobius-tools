-- One optional link per event: the folder where its assets live.
--
-- A field rather than a note, because filling it in is a moment worth telling
-- Slack about — "the photos are in" — and a note edit cannot be told apart from
-- a typo fix. Additive; safe to run on a live database.
--
-- Apply with:
--   npx wrangler d1 execute launch-calendar --remote --file=./db/migrations/003-assets-link.sql

ALTER TABLE events ADD COLUMN assets_link TEXT;

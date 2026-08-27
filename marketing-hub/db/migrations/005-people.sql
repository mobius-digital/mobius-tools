-- What a person is called, kept once for the person rather than once per
-- browser.
--
-- Until now a display name lived in localStorage, so the same person on a
-- laptop and a phone could sign two different names into the changelog; and a
-- Google name could not be changed at all, however wrong it was. Neither is a
-- setting of a board, so this is keyed by email and shared across every board
-- that person can open.
--
-- `confirmed_at` is null until they have actually been asked. Google's own
-- name seeds the row at sign-in, which is usually right, but "usually" is not
-- the same as "theirs" — so it is a suggestion until they say otherwise, and
-- that is what the first-run prompt keys off.
--
-- Apply with:
--   npx wrangler d1 execute marketing-hub --remote --file=./db/migrations/005-people.sql

CREATE TABLE IF NOT EXISTS people (
  email        TEXT PRIMARY KEY,
  name         TEXT NOT NULL,
  confirmed_at TEXT,
  updated_at   TEXT NOT NULL
);

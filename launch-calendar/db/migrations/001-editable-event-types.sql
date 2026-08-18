-- Lets a board define its own event types.
--
-- The original events table pinned `type` to six built-in values with a CHECK
-- constraint. SQLite cannot drop a constraint in place, so the table is rebuilt
-- without it and the rows copied across. Status keeps its constraint: the app
-- branches on status, so an unrecognised one would have no defined behaviour.
--
-- Safe to run more than once? No — run it once, on a database created before
-- editable types. A fresh database from schema.sql already has no constraint.

PRAGMA foreign_keys = OFF;

CREATE TABLE events_rebuilt (
  id             TEXT PRIMARY KEY,
  name           TEXT NOT NULL,
  type           TEXT NOT NULL,
  status         TEXT NOT NULL DEFAULT 'tentative' CHECK (status IN (
                   'confirmed','tentative','at_risk','completed','cancelled')),
  brief          TEXT NOT NULL DEFAULT '',
  launch_date    TEXT NOT NULL,
  promo_end_date TEXT,
  inventory_date TEXT,
  asset_deadline TEXT,
  teaser_start   TEXT,
  channels       TEXT NOT NULL,
  owner          TEXT NOT NULL,
  notes          TEXT,
  created_at     TEXT NOT NULL,
  updated_at     TEXT NOT NULL,
  updated_by     TEXT NOT NULL
);

INSERT INTO events_rebuilt SELECT
  id, name, type, status, brief, launch_date, promo_end_date, inventory_date,
  asset_deadline, teaser_start, channels, owner, notes, created_at, updated_at,
  updated_by
FROM events;

DROP TABLE events;

ALTER TABLE events_rebuilt RENAME TO events;

CREATE INDEX IF NOT EXISTS events_launch_date_idx ON events (launch_date);
CREATE INDEX IF NOT EXISTS events_status_idx ON events (status);

PRAGMA foreign_keys = ON;

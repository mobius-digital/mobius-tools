-- Mobius Console: the agency's client registry.
-- Each row is one client board (one deployment of the Marketing Calendar).

CREATE TABLE IF NOT EXISTS clients (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  slug       TEXT NOT NULL UNIQUE,
  url        TEXT,                -- workers.dev address once live
  db_name    TEXT,                -- the board's D1 database name
  status     TEXT NOT NULL DEFAULT 'provisioning'
             CHECK (status IN ('provisioning','live','failed')),
  spec       TEXT NOT NULL,       -- full provisioning spec (colors, logo, …)
  password   TEXT,                -- shown in the console until dismissed
  error      TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS settings (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

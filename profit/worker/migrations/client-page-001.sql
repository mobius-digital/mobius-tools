-- Client report pages (2026-11-19): a hand-built page for a client on a public link, profit/r.html?t=<token>.
-- Also created on first use by src/clientpage.js ensure(). Upsert by slug keeps the token (and the link) stable.
CREATE TABLE IF NOT EXISTS p_client_page (
  token       TEXT PRIMARY KEY,
  slug        TEXT NOT NULL UNIQUE,
  title       TEXT NOT NULL,
  acts        TEXT NOT NULL,
  html        TEXT NOT NULL,
  created_by  TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now')),
  revoked     INTEGER NOT NULL DEFAULT 0,
  views       INTEGER NOT NULL DEFAULT 0,
  last_view   TEXT
);

-- Public snapshot links (2026-10-09): one frozen card or page from Locus's Export menu, opened without a login at
-- profit/s.html?t=<token>. Also created on first use by src/snapshot.js ensureSnap().
CREATE TABLE IF NOT EXISTS p_snapshot (
  token       TEXT PRIMARY KEY,
  act_id      TEXT NOT NULL,
  kind        TEXT NOT NULL DEFAULT 'card',
  title       TEXT NOT NULL,
  page        TEXT,
  html        TEXT NOT NULL,
  css         TEXT,
  meta_json   TEXT,
  created_by  TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at  TEXT,
  revoked     INTEGER NOT NULL DEFAULT 0,
  views       INTEGER NOT NULL DEFAULT 0,
  last_view   TEXT
);
CREATE INDEX IF NOT EXISTS p_snapshot_act ON p_snapshot (act_id, created_at);

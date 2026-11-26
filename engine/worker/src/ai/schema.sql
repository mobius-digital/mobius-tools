-- Test only. The tables this group reads, copied from the old "made on first use" functions:
-- account-health/worker/src/connectai.js (ensure), stratmem.js (ensureStratTables), lookups.js (the kind column),
-- ask/engine.js (ensureFindings). This file is never run on the real database.
CREATE TABLE IF NOT EXISTS p_ai_key (id TEXT PRIMARY KEY, key_hash TEXT NOT NULL, prefix TEXT NOT NULL, email TEXT NOT NULL,
  role TEXT NOT NULL, brands_json TEXT NOT NULL, label TEXT, created_at TEXT NOT NULL, expires_at TEXT NOT NULL,
  last_used_at TEXT, revoked_at TEXT);
CREATE UNIQUE INDEX IF NOT EXISTS p_ai_key_hash ON p_ai_key(key_hash);

CREATE TABLE IF NOT EXISTS p_ai_call (id INTEGER PRIMARY KEY AUTOINCREMENT, key_id TEXT NOT NULL, email TEXT NOT NULL,
  tool TEXT NOT NULL, act_id TEXT, at TEXT NOT NULL, ok INTEGER NOT NULL DEFAULT 1, ms INTEGER, note TEXT);

CREATE TABLE IF NOT EXISTS p_ai_proposal (id TEXT PRIMARY KEY, act_id TEXT NOT NULL, kind TEXT NOT NULL, title TEXT NOT NULL,
  why TEXT, level TEXT, object_id TEXT, object_name TEXT, amount REAL, before_text TEXT, after_text TEXT,
  status TEXT NOT NULL DEFAULT 'waiting', by_email TEXT NOT NULL, by_key TEXT NOT NULL, by_app TEXT,
  created_at TEXT NOT NULL, expires_at TEXT NOT NULL, decided_by TEXT, decided_at TEXT, result TEXT,
  audience TEXT NOT NULL DEFAULT 'team');

CREATE TABLE IF NOT EXISTS strat_run (
  id TEXT PRIMARY KEY, at TEXT NOT NULL, surface TEXT, who TEXT, brand TEXT, question TEXT, model TEXT, effort TEXT,
  in_tok INTEGER, cache_read INTEGER, cache_write INTEGER, out_tok INTEGER, cost REAL, steps INTEGER, ms INTEGER,
  stopped INTEGER, error TEXT, kind TEXT);

CREATE TABLE IF NOT EXISTS findings (
  key TEXT PRIMARY KEY, kind TEXT NOT NULL, severity TEXT NOT NULL, title TEXT NOT NULL, detail TEXT,
  amount REAL, month TEXT, evidence TEXT, state TEXT NOT NULL DEFAULT 'new',
  first_seen TEXT NOT NULL, last_seen TEXT NOT NULL, state_at TEXT, snooze_until TEXT, told_at TEXT);

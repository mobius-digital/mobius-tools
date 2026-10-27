-- The Buyer list review flow + the morning read (2026-10-26, account-health src/buyerai.js). Also made on first use.
-- p_buyer_lesson: every time Cole disagreed with a call: his words, Locus's two-sentence answer (stance drop | hold) and
-- his final call (decision mine | locus). The morning read and every later Disagree read them.
-- p_buyer_ai: the morning read per brand per Central day (status done | empty | failed, json {summary, rows, extra}, usd).
CREATE TABLE IF NOT EXISTS p_buyer_lesson (id TEXT PRIMARY KEY, act_id TEXT NOT NULL, object TEXT, kind TEXT, name TEXT,
  row_json TEXT, text TEXT NOT NULL, author TEXT, stance TEXT, answer TEXT, decision TEXT, decided_by TEXT, decided_at TEXT, usd REAL, created_at TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS p_buyer_lesson_act ON p_buyer_lesson (act_id, created_at);
CREATE TABLE IF NOT EXISTS p_buyer_ai (act_id TEXT NOT NULL, day TEXT NOT NULL, status TEXT NOT NULL, json TEXT, usd REAL,
  model TEXT, at TEXT NOT NULL, error TEXT, PRIMARY KEY (act_id, day));

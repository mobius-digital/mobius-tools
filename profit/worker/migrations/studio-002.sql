-- Studio batches (2026-09-27): Studio works the way the team briefs. One batch = one test in the
-- Mobius framework (Angle, Concept, What We're Testing) with numbered lines; one ad per line.
CREATE TABLE IF NOT EXISTS p_studio_batch (
  id          TEXT PRIMARY KEY,
  act_id      TEXT NOT NULL,
  num         TEXT,                 -- the Asana batch number, so ads can be named "231-1 | ..."
  br_batch_id TEXT,                 -- p_br_batch row it came from, when picked from Asana
  name        TEXT,
  brief_json  TEXT NOT NULL,        -- {angle, why, concept, testing, lines:[{text, inspo:[url]}]}
  setup_json  TEXT,                 -- {products:[{title,handle}], images:[url], swipe:[url], exact}
  plan_json   TEXT,                 -- the art director's plan, one entry per line (editable)
  status      TEXT NOT NULL DEFAULT 'draft',  -- draft | planned | made | archived
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS p_studio_batch_act ON p_studio_batch (act_id, status, updated_at);
ALTER TABLE p_studio_ad ADD COLUMN batch_id TEXT;
ALTER TABLE p_studio_ad ADD COLUMN line INTEGER;
ALTER TABLE p_studio_ad ADD COLUMN check_json TEXT;   -- the product check: {ok, issue}

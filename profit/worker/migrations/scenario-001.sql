-- Scenarios (2026-10-06): the lead-gen and ROAS calculators, inside Locus, saved per brand.
-- Replaces the Q4 Playbook's "Lead Gen Value Calculator" (Tools tab) and sits beside the
-- public ROAS calculator at /roas-calculator (which stays as the free tool).
CREATE TABLE IF NOT EXISTS p_scenario (
  id          TEXT PRIMARY KEY,            -- 'sc_' + 10 hex
  act_id      TEXT NOT NULL,               -- 'all' for agency-wide
  kind        TEXT NOT NULL,               -- leads | roas
  name        TEXT NOT NULL,
  inputs_json TEXT NOT NULL,               -- the whole input set, calculator-specific
  note        TEXT,                        -- where the numbers came from, in words
  created_by  TEXT,
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS p_scenario_act ON p_scenario(act_id, kind, updated_at);

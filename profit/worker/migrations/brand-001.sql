-- Locus Brand tab (2026-09-24): research, angles, roadmap, onboarding.
-- Additive to the shared mobius-account-health D1. Safe to re-run.
-- Apply: npx wrangler d1 execute mobius-account-health --remote --file=migrations/brand-001.sql

-- A product LINE is the research unit: products bought for the same reason.
CREATE TABLE IF NOT EXISTS p_br_line (
  id TEXT PRIMARY KEY, act_id TEXT NOT NULL, name TEXT NOT NULL,
  about TEXT, products TEXT, sort INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS p_br_line_act ON p_br_line(act_id);

-- Free-shaped research documents. line_id '' = brand level.
-- keys: profile, voice, rules (test rules), market, mechanism, copy
CREATE TABLE IF NOT EXISTS p_br_doc (
  act_id TEXT NOT NULL, line_id TEXT NOT NULL DEFAULT '', key TEXT NOT NULL,
  data_json TEXT NOT NULL DEFAULT '{}', status TEXT NOT NULL DEFAULT 'approved',
  source TEXT, updated_at TEXT NOT NULL DEFAULT (datetime('now')), updated_by TEXT,
  PRIMARY KEY (act_id, line_id, key)
);

CREATE TABLE IF NOT EXISTS p_br_persona (
  id TEXT PRIMARY KEY, act_id TEXT NOT NULL, line_id TEXT, name TEXT NOT NULL,
  data_json TEXT NOT NULL DEFAULT '{}', status TEXT NOT NULL DEFAULT 'draft',
  source TEXT, sort INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS p_br_persona_act ON p_br_persona(act_id);

-- Voice of customer: one quote per row, with where it came from.
CREATE TABLE IF NOT EXISTS p_br_voc (
  id TEXT PRIMARY KEY, act_id TEXT NOT NULL, line_id TEXT, persona_id TEXT,
  kind TEXT NOT NULL,            -- pain | desire | objection | transformation | trigger | failed
  quote TEXT NOT NULL, source TEXT, url TEXT, theme TEXT, nugget INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'draft',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS p_br_voc_act ON p_br_voc(act_id, line_id);

CREATE TABLE IF NOT EXISTS p_br_comp (
  id TEXT PRIMARY KEY, act_id TEXT NOT NULL, line_id TEXT, name TEXT NOT NULL, url TEXT,
  data_json TEXT NOT NULL DEFAULT '{}', status TEXT NOT NULL DEFAULT 'draft',
  sort INTEGER NOT NULL DEFAULT 0, updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS p_br_comp_act ON p_br_comp(act_id);

-- The angle library. Logged once; batches point at it.
CREATE TABLE IF NOT EXISTS p_br_angle (
  id TEXT PRIMARY KEY, act_id TEXT NOT NULL, line_id TEXT, persona_id TEXT,
  name TEXT NOT NULL, argument TEXT, awareness TEXT, stage TEXT, lead TEXT,
  status TEXT NOT NULL DEFAULT 'active',   -- active | proposed | retired
  source TEXT, note TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS p_br_angle_act ON p_br_angle(act_id);

CREATE TABLE IF NOT EXISTS p_br_concept (
  id TEXT PRIMARY KEY, act_id TEXT NOT NULL, angle_id TEXT, name TEXT NOT NULL,
  about TEXT, format TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS p_br_concept_act ON p_br_concept(act_id);

-- A batch is ONE test. `num` is the number that starts the ad names.
CREATE TABLE IF NOT EXISTS p_br_batch (
  id TEXT PRIMARY KEY, act_id TEXT NOT NULL, num TEXT NOT NULL, title TEXT NOT NULL,
  angle_id TEXT, concept_id TEXT,
  level TEXT,                    -- angle | concept | variation | offer
  variable TEXT,                 -- for a variation: hook | visual | copy | creator | format | length | product
  offer TEXT, hypothesis TEXT, why TEXT, brief_url TEXT, asset_url TEXT,
  stage TEXT NOT NULL DEFAULT 'idea',   -- idea | production | live | done
  verdict TEXT, verdict_note TEXT, verdict_by TEXT, verdict_at TEXT,
  learning TEXT, legacy_json TEXT, source TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE UNIQUE INDEX IF NOT EXISTS p_br_batch_num ON p_br_batch(act_id, num);

-- Manual links for ads whose name carries no batch number (TikTok, TRYBE).
CREATE TABLE IF NOT EXISTS p_br_adtag (
  act_id TEXT NOT NULL, ad_id TEXT NOT NULL, batch_id TEXT NOT NULL,
  tagged_by TEXT, tagged_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (act_id, ad_id)
);

-- The client's onboarding link.
CREATE TABLE IF NOT EXISTS p_br_onboard (
  act_id TEXT PRIMARY KEY, token TEXT NOT NULL UNIQUE,
  answers_json TEXT NOT NULL DEFAULT '{}', prefill_json TEXT NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'sent',    -- sent | started | submitted
  step INTEGER NOT NULL DEFAULT 0, submitted_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- One AI research run step, for the log and the cost.
CREATE TABLE IF NOT EXISTS p_br_run (
  id TEXT PRIMARY KEY, act_id TEXT NOT NULL, line_id TEXT, step TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'running', searches INTEGER NOT NULL DEFAULT 0,
  in_tokens INTEGER NOT NULL DEFAULT 0, out_tokens INTEGER NOT NULL DEFAULT 0,
  error TEXT, started_at TEXT NOT NULL DEFAULT (datetime('now')), finished_at TEXT
);
CREATE INDEX IF NOT EXISTS p_br_run_act ON p_br_run(act_id);

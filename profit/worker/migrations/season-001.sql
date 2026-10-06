-- Season (2026-10-05): the BFCM plan lives in Locus, not in the standalone Q4 Playbook.
-- One row per brand per phase; a brand with no rows shows the season template.
CREATE TABLE IF NOT EXISTS p_season_phase (
  act_id     TEXT NOT NULL,
  season     TEXT NOT NULL DEFAULT '2026',
  key        TEXT NOT NULL,              -- early | access | bf | planb | drop | xmas | gift | boxing | ny | vday | anything custom
  name       TEXT NOT NULL,
  start      TEXT,                       -- YYYY-MM-DD
  end        TEXT,
  grp        TEXT NOT NULL DEFAULT 'nov',-- nov | bf | dec | late | vday (board column + colour)
  who        TEXT,                       -- who gets it
  offer      TEXT,                       -- the deal, one line
  detail     TEXT,                       -- mechanics and fine print
  status     TEXT NOT NULL DEFAULT 'missing', -- missing | draft | locked | skip
  sort       INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (act_id, season, key)
);
-- The call sheet (goal, last year, cutoffs, gift cards ...) plus settings (shape, strategist, in_season).
CREATE TABLE IF NOT EXISTS p_season_answer (
  act_id     TEXT NOT NULL,
  season     TEXT NOT NULL DEFAULT '2026',
  key        TEXT NOT NULL,
  value      TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (act_id, season, key)
);
-- What is due. Derived tasks (briefs, built, loaded, live ...) are computed from the phase
-- dates; a row here only exists once someone ticks, renames or re-dates one, or adds a custom task.
CREATE TABLE IF NOT EXISTS p_season_task (
  act_id     TEXT NOT NULL,
  season     TEXT NOT NULL DEFAULT '2026',
  id         TEXT NOT NULL,              -- "<phase>:<kind>" for derived, "c:<hex>" for custom
  phase_key  TEXT,
  kind       TEXT,
  name       TEXT,
  due        TEXT,
  owner      TEXT,
  done       INTEGER NOT NULL DEFAULT 0,
  done_by    TEXT,
  done_at    TEXT,
  custom     INTEGER NOT NULL DEFAULT 0,
  note       TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (act_id, season, id)
);
-- The read-only client link for a brand's season.
CREATE TABLE IF NOT EXISTS p_season_share (
  act_id     TEXT NOT NULL,
  season     TEXT NOT NULL DEFAULT '2026',
  token      TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (act_id, season)
);

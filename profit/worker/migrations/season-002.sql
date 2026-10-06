-- Season desk (2026-10-06): three check-ins a day over the weekend, graded against the ladder.
CREATE TABLE IF NOT EXISTS p_season_checkin (
  act_id   TEXT NOT NULL,
  season   TEXT NOT NULL DEFAULT '2026',
  date     TEXT NOT NULL,          -- YYYY-MM-DD, the brand's local day
  slot     TEXT NOT NULL,          -- 8am | 4pm | 12am
  roas     REAL,                   -- trailing 3-hour blended MER at the time of the check
  mer_day  REAL,                   -- today so far
  revenue  REAL,
  spend    REAL,
  verdict  TEXT,                   -- what the ladder said
  action   TEXT,                   -- what we did, one line
  by       TEXT,
  at       TEXT,
  PRIMARY KEY (act_id, season, date, slot)
);

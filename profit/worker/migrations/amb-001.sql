-- Ambassadors: the living creator brief, one per brand (2026-09-16).
-- Staff edit it on the Ambassadors tab; creators read it on the public link
-- tools.go-mobius-digital.com/angles/<slug>. Additive, p_-prefixed, shared DB.

-- One row per brand that has a creator link.
CREATE TABLE IF NOT EXISTS p_amb_brand (
  act_id          TEXT PRIMARY KEY,
  slug            TEXT NOT NULL UNIQUE,          -- the link: /angles/<slug>
  live            INTEGER NOT NULL DEFAULT 0,    -- 0 = the link says "not ready yet"
  display_name    TEXT,                          -- what creators see (defaults to accounts.name)
  intro           TEXT,                          -- top of the page and the PDF
  about           TEXT,                          -- what the product is, in two lines
  audience        TEXT,                          -- who we are talking to
  accent          TEXT,                          -- brand colour, hex
  logo_url        TEXT,
  submit_platform TEXT DEFAULT 'TRYBE',
  submit_url      TEXT,                          -- where Film this sends creators
  submit_label    TEXT,                          -- button text
  avoid_json      TEXT,                          -- [{title, why}]  "please stop filming this"
  rules_json      TEXT,                          -- [string]  claims and compliance
  season_json     TEXT,                          -- {title, line, until, next, highlight:[from,to] (MM-DD)}
  show_inspo      INTEGER NOT NULL DEFAULT 1,
  updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Sections: "Hot right now" is the pinned one (pinned = 1); the rest are the team's.
CREATE TABLE IF NOT EXISTS p_amb_section (
  id         TEXT PRIMARY KEY,
  act_id     TEXT NOT NULL,
  name       TEXT NOT NULL,
  line       TEXT,
  icon       TEXT,            -- Lucide name
  icon_svg   TEXT,            -- the Lucide node markup, stored so the public page needs no icon library
  color      TEXT,            -- hex
  enabled    INTEGER NOT NULL DEFAULT 1,
  pinned     INTEGER NOT NULL DEFAULT 0,
  sort       INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS p_amb_section_act ON p_amb_section (act_id, sort);

-- Angles. `hot` pins an angle into Hot right now on top of its own section.
CREATE TABLE IF NOT EXISTS p_amb_angle (
  id           TEXT PRIMARY KEY,
  act_id       TEXT NOT NULL,
  section_id   TEXT,
  hot          INTEGER NOT NULL DEFAULT 0,
  hot_sort     INTEGER NOT NULL DEFAULT 0,
  sort         INTEGER NOT NULL DEFAULT 0,
  status       TEXT NOT NULL DEFAULT 'live',   -- live | draft
  title        TEXT NOT NULL,
  argument     TEXT,        -- the angle in one sentence (the reason to buy)
  who          TEXT,        -- who it is for
  products     TEXT,        -- free text, e.g. "Halloween bundle"
  format       TEXT,        -- e.g. "Split screen", "Get ready with me"
  lever        TEXT,        -- the psychological lever (staff only)
  openers_json TEXT,        -- [string]
  shots_json   TEXT,        -- [{label, text}]
  on_screen    TEXT,        -- suggested text overlay
  do_text      TEXT,
  dont_text    TEXT,
  trend        TEXT,        -- optional: the trend or sound to ride
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at   TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS p_amb_angle_act ON p_amb_angle (act_id, section_id, sort);

-- Proof. kind: meta (a tagged Meta ad, numbers live, staff only) | post (a creator's
-- post link) | typed (numbers typed by the team) | upload (a file in R2) | inspo
-- (another brand's post, never numbers).
CREATE TABLE IF NOT EXISTS p_amb_proof (
  id         TEXT PRIMARY KEY,
  act_id     TEXT NOT NULL,
  angle_id   TEXT NOT NULL,
  kind       TEXT NOT NULL,
  ad_id      TEXT,
  url        TEXT,
  file_key   TEXT,
  thumb      TEXT,          -- data URI or URL for a still, optional
  who        TEXT,          -- creator or brand name
  views      INTEGER,
  sales      REAL,
  note       TEXT,
  shown      INTEGER NOT NULL DEFAULT 1,
  sort       INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS p_amb_proof_angle ON p_amb_proof (angle_id, sort);
CREATE INDEX IF NOT EXISTS p_amb_proof_ad ON p_amb_proof (ad_id);

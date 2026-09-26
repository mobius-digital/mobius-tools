-- Studio (2026-09-26): AI makes the whole ad, people approve or fix only what they want.
-- One row per ad. Images live in R2 (binding MEDIA) under studio/<act>/<id>/<kind>.png.
CREATE TABLE IF NOT EXISTS p_studio_ad (
  id           TEXT PRIMARY KEY,            -- 24 hex; also the public image address, so unguessable
  act_id       TEXT NOT NULL,
  parent_id    TEXT,                        -- the ad this was redone from
  status       TEXT NOT NULL DEFAULT 'review', -- review | approved | deleted
  spec_json    TEXT NOT NULL,               -- product, who, headline, subline, cta, art, look, style
  prompt       TEXT,                        -- exactly what the image model was asked
  model        TEXT,
  full_w       INTEGER, full_h INTEGER,     -- size of what the model returned (shown cropped to 4:5)
  has_plate    INTEGER NOT NULL DEFAULT 0,  -- the picture with the words erased, made on first Edit
  layers_json  TEXT,                        -- the text boxes (found on first Edit, then as the editor saved them)
  has_final    INTEGER NOT NULL DEFAULT 0,  -- an edited export from the editor
  cost         REAL NOT NULL DEFAULT 0,     -- estimated USD spent on this ad so far
  created_by   TEXT,
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at   TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS p_studio_ad_act ON p_studio_ad (act_id, status, created_at);

-- Studio settings. The image AI key lives here because Cole connects it from the Studio
-- screen itself; the API never sends it back to the browser, only whether one is set.
CREATE TABLE IF NOT EXISTS p_studio_cfg (
  key        TEXT PRIMARY KEY,
  value      TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

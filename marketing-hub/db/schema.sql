-- Marketing Hub schema (Cloudflare D1 / SQLite).
--
-- One deployment, many brands. Every data table carries brand_id; access is
-- resolved per request in the middleware and stamped onto a header the app
-- trusts. Brands themselves are rows, not builds.

CREATE TABLE IF NOT EXISTS brands (
  id           TEXT PRIMARY KEY,      -- slug: 'lucky-golf'
  name         TEXT NOT NULL,         -- 'Lucky Golf'
  product_name TEXT NOT NULL DEFAULT 'Marketing Calendar',
  short_name   TEXT NOT NULL DEFAULT 'Calendar',
  colors       TEXT NOT NULL,         -- JSON: the palette brand.config.ts used to hold
  font         TEXT NOT NULL,         -- JSON: { family, headingWeight, bodyWeight }
  logo_svg     TEXT,                  -- single-colour mark; NULL = default calendar mark
  logo_tint    INTEGER NOT NULL DEFAULT 1,
  icons        TEXT,                  -- JSON: { "180": base64png, "192": …, "512": …, "maskable": … }
  created_at   TEXT NOT NULL,
  updated_at   TEXT NOT NULL
);

-- Who can open which brand with Google sign-in. Brand '*' marks an agency
-- admin: every brand, plus the Clients screen.
CREATE TABLE IF NOT EXISTS memberships (
  brand_id   TEXT NOT NULL,
  email      TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (brand_id, email)
);
CREATE INDEX IF NOT EXISTS memberships_email_idx ON memberships (email);

CREATE TABLE IF NOT EXISTS events (
  id             TEXT PRIMARY KEY,
  brand_id       TEXT NOT NULL,
  name           TEXT NOT NULL,
  type           TEXT NOT NULL,
  status         TEXT NOT NULL DEFAULT 'tentative' CHECK (status IN (
                   'confirmed','tentative','at_risk','completed','cancelled')),
  brief          TEXT NOT NULL DEFAULT '',
  launch_date    TEXT NOT NULL,
  promo_end_date TEXT,
  inventory_date TEXT,
  asset_deadline TEXT,
  teaser_start   TEXT,
  channels       TEXT NOT NULL,
  owner          TEXT NOT NULL,
  notes          TEXT,
  assets_link    TEXT,
  created_at     TEXT NOT NULL,
  updated_at     TEXT NOT NULL,
  updated_by     TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS events_brand_launch_idx ON events (brand_id, launch_date);
CREATE INDEX IF NOT EXISTS events_brand_status_idx ON events (brand_id, status);

CREATE TABLE IF NOT EXISTS changelog (
  id             TEXT PRIMARY KEY,
  brand_id       TEXT NOT NULL,
  event_id       TEXT REFERENCES events (id) ON DELETE SET NULL,
  event_name     TEXT NOT NULL,
  change_summary TEXT NOT NULL,
  changed_by     TEXT NOT NULL,
  created_at     TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS changelog_brand_created_idx ON changelog (brand_id, created_at DESC);
CREATE INDEX IF NOT EXISTS changelog_event_id_idx ON changelog (event_id);

-- Per-brand key/value store: password hash, sign-in mode, channels, event
-- types, Slack config. Same keys as before, scoped by brand.
CREATE TABLE IF NOT EXISTS settings (
  brand_id   TEXT NOT NULL,
  key        TEXT NOT NULL,
  value      TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (brand_id, key)
);

CREATE TABLE IF NOT EXISTS slack_channel_map (
  brand_id    TEXT NOT NULL,
  channel_key TEXT NOT NULL,
  slack_id    TEXT NOT NULL,
  slack_name  TEXT NOT NULL,
  updated_at  TEXT NOT NULL,
  PRIMARY KEY (brand_id, channel_key)
);

CREATE TABLE IF NOT EXISTS slack_outbox (
  id           TEXT PRIMARY KEY,
  brand_id     TEXT NOT NULL,
  event_id     TEXT NOT NULL,
  event_name   TEXT NOT NULL,
  kind         TEXT NOT NULL,
  lines        TEXT NOT NULL,
  channel_keys TEXT NOT NULL,
  actor        TEXT NOT NULL,
  created_at   TEXT NOT NULL,
  due_at       TEXT NOT NULL,
  attempts     INTEGER NOT NULL DEFAULT 0,
  sent_to      TEXT NOT NULL DEFAULT '[]',
  sent_at      TEXT
);
CREATE INDEX IF NOT EXISTS slack_outbox_pending_idx ON slack_outbox (brand_id, sent_at, due_at);

CREATE TABLE IF NOT EXISTS slack_reminders_sent (
  brand_id    TEXT NOT NULL,
  event_id    TEXT NOT NULL,
  kind        TEXT NOT NULL,
  launch_date TEXT NOT NULL,
  sent_at     TEXT NOT NULL,
  PRIMARY KEY (brand_id, event_id, kind, launch_date)
);

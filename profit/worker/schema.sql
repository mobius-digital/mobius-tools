-- Mobius Profit — additive schema on the shared mobius-account-health D1.
-- Apply:  npx wrangler d1 execute mobius-account-health --remote --file=schema.sql
-- Every table here is prefixed p_ so it can never collide with Account Health's.

-- Per-SKU cost overrides. Sourced from Shopify variant unitCost where available,
-- otherwise entered by hand. `sku = '*'` is the client-wide fallback cost rate.
CREATE TABLE IF NOT EXISTS p_sku_costs (
  act_id     TEXT NOT NULL,
  sku        TEXT NOT NULL,
  title      TEXT,
  unit_cost  REAL,
  source     TEXT NOT NULL DEFAULT 'manual',   -- shopify | manual
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (act_id, sku)
);

-- Snapshot of each client's cost-data health, refreshed nightly so the
-- all-clients view doesn't recompute 6 x 60 days on every page load.
CREATE TABLE IF NOT EXISTS p_cost_health (
  act_id      TEXT PRIMARY KEY,
  verdict     TEXT NOT NULL,                   -- good | noisy | broken | none | override
  reason      TEXT,
  blended     REAL,
  p10         REAL,
  p90         REAL,
  negatives   INTEGER,
  days        INTEGER,
  checked_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- The agreed month plan. The GOALS themselves still live in accounts.goals_json,
-- because that is the one field every tool reads; this table carries the story
-- around them: what the plan was built from, the growth we chose, and whether the
-- client has actually signed off on it.
CREATE TABLE IF NOT EXISTS p_plan (
  act_id         TEXT NOT NULL,
  month          TEXT NOT NULL,                  -- YYYY-MM
  growth_pct     REAL,                           -- 0.10 = +10% on the basis
  basis_sales    REAL,                           -- what last month / the run-rate was
  basis_label    TEXT,                           -- how the basis was derived
  required_spend REAL,                           -- spend the goal implies at trailing aMER
  expected_cm    REAL,
  agreed_at      TEXT,                           -- set when the client signs off
  agreed_by      TEXT,
  share_token    TEXT,                           -- read-only client link
  note           TEXT,
  -- Assumptions the planner OVERRODE, plus the spend floor. A forecast is made of
  -- assumptions; the only honest thing to do is name them, say where the default
  -- came from, and let the number be changed. Absent keys mean "use the measured
  -- value", so a plan saved before this existed behaves exactly as it did.
  --   { returning_per_day, amer, margin, spend_floor_per_day }
  assumptions_json TEXT,
  updated_at     TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (act_id, month)
);
CREATE INDEX IF NOT EXISTS p_plan_token_idx ON p_plan (share_token);

-- Read-only client link for the Profit snapshot (the Phase-0 PRD open question:
-- "should clients get a read-only link to their own Profit page?"). One token per
-- client, regenerable. Deliberately a separate table from p_plan: the plan link and
-- the performance link have different lifetimes and you may want one without the other.
CREATE TABLE IF NOT EXISTS p_profit_share (
  act_id     TEXT PRIMARY KEY,
  token      TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS p_profit_share_token_idx ON p_profit_share (token);

-- Shopify OAuth. One unlisted public app installs on every client store, so tokens
-- are per-shop and arrive through the authorization code grant. `act_id` is filled in
-- once we match the shop domain to an account (accounts.tw_shop already holds it).
CREATE TABLE IF NOT EXISTS p_shopify (
  shop           TEXT PRIMARY KEY,          -- foo.myshopify.com
  act_id         TEXT,                      -- matched to accounts.tw_shop, null until then
  access_token   TEXT NOT NULL,
  scopes         TEXT,
  installed_at   TEXT NOT NULL DEFAULT (datetime('now')),
  uninstalled_at TEXT,                      -- set by the app/uninstalled webhook
  last_sync_at   TEXT
);
CREATE INDEX IF NOT EXISTS p_shopify_act_idx ON p_shopify (act_id);

-- Short-lived OAuth nonces. The callback must reject any `state` it did not issue,
-- or the install can be forged.
CREATE TABLE IF NOT EXISTS p_oauth_state (
  state      TEXT PRIMARY KEY,
  shop       TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Real cohorts: customers grouped by the month of their FIRST order, followed
-- forward. Sourced from Shopify (Triple Whale has no per-customer history), so rows
-- exist only for stores that have connected. lifetime_* are all-time to `as_of`.
CREATE TABLE IF NOT EXISTS p_cohorts (
  act_id           TEXT NOT NULL,
  cohort_month     TEXT NOT NULL,            -- YYYY-MM of first order
  customers        INTEGER,
  repeat_customers INTEGER,                  -- of those, how many ever ordered again
  lifetime_spend   REAL,
  lifetime_orders  INTEGER,
  as_of            TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (act_id, cohort_month)
);

-- The App Store reviewer needs a login, Shopify rejects Google SSO test accounts, and
-- the real password would expose six live brands. `demo = 1` marks the one fabricated
-- account a demo session is pinned to; it is also written with active = 0 so Account
-- Health's lists and the Slack brief, which both require active = 1, can never see it.
-- Additive on the SHARED accounts table, so it must tolerate already existing.
ALTER TABLE accounts ADD COLUMN demo INTEGER NOT NULL DEFAULT 0;

-- A FROZEN snapshot of the creative browser, for sending to a client.
-- Frozen, not live, for the same reason reports are: a link that keeps moving
-- disagrees with the message that announced it within hours. The rows and the
-- baked cover images are stored whole, so the client sees exactly what was on
-- screen when it was shared, forever. One row per share - unlike p_profit_share
-- there is no stable per-client link, because the whole point is that it
-- captures a particular question at a particular moment.
CREATE TABLE IF NOT EXISTS p_ad_share (
  token      TEXT PRIMARY KEY,
  act_id     TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  label      TEXT,
  data_json  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS p_ad_share_act_idx ON p_ad_share (act_id, created_at);

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
-- Ambassadors: editable text for the one-page brief PDF, per brand (2026-09-16).
ALTER TABLE p_amb_brand ADD COLUMN pdf_json TEXT;
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

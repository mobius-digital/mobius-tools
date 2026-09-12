-- Supply, D1 schema. Phase 1 tables plus the order tables Phase 2 fills.
-- Shopify stays the source of truth for products, variants, stock and
-- sales; those are cached per snapshot (catalog, history) and never
-- edited here. Everything below is what Supply decides or records.

PRAGMA foreign_keys = ON;

CREATE TABLE brands (
  id            TEXT PRIMARY KEY,            -- 'lucky'
  name          TEXT NOT NULL,
  shop_domain   TEXT NOT NULL,               -- lucky-wedges.myshopify.com
  tz            TEXT NOT NULL DEFAULT 'America/Chicago',
  accent        TEXT,                        -- brand colour, hex
  slack_channel TEXT,
  active        INTEGER NOT NULL DEFAULT 1,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE factories (
  id              TEXT PRIMARY KEY,
  brand_id        TEXT NOT NULL REFERENCES brands(id),
  name            TEXT NOT NULL,             -- 'Club factory'
  production_days INTEGER NOT NULL,
  shipping_days   INTEGER NOT NULL,
  order_cycle_days INTEGER NOT NULL DEFAULT 90,
  moq_default     INTEGER,                   -- units per model/style
  moq_basis       TEXT NOT NULL DEFAULT 'product',  -- 'product' | 'variant'
  closures        TEXT NOT NULL DEFAULT '[]',        -- JSON [{from,to,label}]
  contact         TEXT,
  notes           TEXT
);

CREATE TABLE categories (
  id        TEXT PRIMARY KEY,
  brand_id  TEXT NOT NULL REFERENCES brands(id),
  name      TEXT NOT NULL,                   -- Clubs, Apparel, Accessories
  sort      INTEGER NOT NULL DEFAULT 0
);

-- A product line is the unit of ranking, size curves, targets and cut rules.
CREATE TABLE lines (
  id              TEXT PRIMARY KEY,
  brand_id        TEXT NOT NULL REFERENCES brands(id),
  category_id     TEXT NOT NULL REFERENCES categories(id),
  name            TEXT NOT NULL,             -- Polos, Hats, Wedges
  variant_axis    TEXT NOT NULL DEFAULT 'none', -- none | size | hand | loft_hand | hand_size
  factory_id      TEXT REFERENCES factories(id),
  lead_override_days INTEGER,                -- production+shipping, when the line differs
  moq             INTEGER,
  target_designs  INTEGER,                   -- assortment target, NULL = none
  cut_rule_pct    INTEGER,                   -- bottom X% by 90d sales, NULL = manual
  size_curve      TEXT,                      -- JSON {"S":5,"M":21,...} override; NULL = learned
  sort            INTEGER NOT NULL DEFAULT 0
);

-- Shopify product types sorted into lines. Unmapped types show as Unsorted.
CREATE TABLE type_map (
  brand_id  TEXT NOT NULL REFERENCES brands(id),
  shop_type TEXT NOT NULL,                   -- Shopify productType string
  line_id   TEXT NOT NULL REFERENCES lines(id),
  PRIMARY KEY (brand_id, shop_type)
);

-- Per-product decisions. Absent row = defaults (core lifecycle, line's factory).
CREATE TABLE products (
  brand_id     TEXT NOT NULL REFERENCES brands(id),
  product_id   TEXT NOT NULL,                -- Shopify product id (numeric tail)
  line_id      TEXT REFERENCES lines(id),    -- override of the type map
  lifecycle    TEXT NOT NULL DEFAULT 'core', -- core | seasonal | drop | winding_down | discontinued
  season_from  TEXT, season_to TEXT,         -- MM-DD, for seasonal
  moq          INTEGER,                      -- mirrors Shopify metafield custom.moq
  lead_override_days INTEGER,                -- mirrors custom.lead_time_days
  decision     TEXT,                         -- keep | cut | decide, for the current plan
  notes        TEXT,
  updated_at   TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (brand_id, product_id)
);

-- Purchase orders (Phase 2). Only status >= 'sent' counts as incoming stock.
CREATE TABLE orders (
  id           TEXT PRIMARY KEY,             -- PO-0012
  brand_id     TEXT NOT NULL REFERENCES brands(id),
  factory_id   TEXT REFERENCES factories(id),
  status       TEXT NOT NULL DEFAULT 'draft', -- draft | sent | confirmed | production | shipped | partial | landed | cancelled
  sent_at      TEXT, confirmed_at TEXT, expected_at TEXT, landed_at TEXT,
  deposit      TEXT,                          -- free text: '50% paid 27 Aug'
  tracking     TEXT,
  notes        TEXT,
  created_by   TEXT,
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE order_lines (
  order_id     TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  variant_id   TEXT NOT NULL,                -- Shopify variant id
  product_id   TEXT NOT NULL,
  qty          INTEGER NOT NULL,
  received     INTEGER NOT NULL DEFAULT 0,
  unit_cost    REAL,
  PRIMARY KEY (order_id, variant_id)
);

-- A collection is a group of new designs that drop together, across lines: a
-- themed drop ('Car Bomb') or a plain refresh ('Q1 polos'). One date, the day
-- it goes on the site; every slot in it works backwards from that.
CREATE TABLE collections (
  id         TEXT PRIMARY KEY,
  brand_id   TEXT NOT NULL REFERENCES brands(id),
  name       TEXT NOT NULL,                  -- 'Car Bomb', 'Spring 2027'
  drop_at    TEXT NOT NULL,                  -- on-site date for the whole drop
  notes      TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Open slots on the lineup plan (Phase 4). A slot is dates + status + link.
CREATE TABLE slots (
  id           TEXT PRIMARY KEY,
  brand_id     TEXT NOT NULL REFERENCES brands(id),
  line_id      TEXT NOT NULL REFERENCES lines(id),
  name         TEXT NOT NULL,                -- 'Spring design 3'
  collection_id TEXT REFERENCES collections(id),  -- the drop it belongs to; its date wins
  season       TEXT,                         -- legacy free text, before collections
  status       TEXT NOT NULL DEFAULT 'needs_brief', -- needs_brief | in_design | sampling | approved | ordered | live
  on_site_at   TEXT NOT NULL,                -- the one date typed by hand; the rest derive
  brief_due    TEXT, sample_due TEXT, order_by TEXT, lands_at TEXT,
  asana_task   TEXT,                         -- permalink of the Asana task
  asana_gid    TEXT,                         -- its gid, so its status can be re-read
  asana_done   INTEGER,                      -- last known: 1 done, 0 open, NULL unknown
  asana_checked TEXT,                        -- when Asana last answered
  lineup_event TEXT,                         -- Lineup event id once sent
  product_id   TEXT,                         -- filled once the design exists in Shopify
  notes        TEXT,
  updated_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Daily stock and sales history stays in the Restock worker's KV (it owns the
-- Shopify sync) and reaches Supply through /api/raw on every request. No copy here.

-- Settings not tied to a line or factory.
CREATE TABLE settings (
  brand_id  TEXT NOT NULL REFERENCES brands(id),
  key       TEXT NOT NULL,                   -- buffer_days, cover_days, digest_hour, digest_mode, reviewed
  value     TEXT NOT NULL,
  PRIMARY KEY (brand_id, key)
);

-- Everything a person changed, with a name against it.
CREATE TABLE changelog (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  brand_id  TEXT NOT NULL,
  at        TEXT NOT NULL DEFAULT (datetime('now')),
  actor     TEXT,
  entity    TEXT NOT NULL,                   -- order | product | slot | line | factory | settings
  entity_id TEXT,
  action    TEXT NOT NULL,
  detail    TEXT                             -- JSON diff
);

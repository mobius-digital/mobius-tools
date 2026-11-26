-- Test only. The calendar database table the production statements read.
-- from marketing-hub/db/schema.sql and account-health/worker/src/calendar.js (ensure)
-- This file is never run on the real database.
CREATE TABLE IF NOT EXISTS events (
  id TEXT PRIMARY KEY, brand_id TEXT NOT NULL, name TEXT NOT NULL, type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'tentative', stage TEXT, brief TEXT NOT NULL DEFAULT '', launch_date TEXT NOT NULL,
  promo_end_date TEXT, inventory_date TEXT, asset_deadline TEXT, teaser_start TEXT, channels TEXT NOT NULL DEFAULT '{}',
  owner TEXT NOT NULL DEFAULT '', notes TEXT, assets_link TEXT, created_at TEXT NOT NULL DEFAULT '', updated_at TEXT NOT NULL DEFAULT '',
  updated_by TEXT NOT NULL DEFAULT '', locus_brand TEXT, asana TEXT, ticks TEXT
);

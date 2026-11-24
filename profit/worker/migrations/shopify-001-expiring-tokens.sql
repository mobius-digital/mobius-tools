-- Shopify expiring offline tokens (2026-11-24, App Store requirement 3.1.2) + a store address per brand.
--
--   npx wrangler d1 execute mobius-account-health --remote --file=migrations/shopify-001-expiring-tokens.sql
--   (from profit/worker)
--
-- Run it ONCE, before or after the worker deploy: the worker also adds the three columns itself the first time it
-- needs them (ensureTokenColumns in src/shoptoken.js) and creates p_shop_address on first use, so a deploy that
-- lands before this file is run does not break. Running this file a second time fails on the first ALTER with
-- "duplicate column name", which is harmless.
--
-- Existing rows keep expires_at = NULL, which means "an old never-expiring token". shopToken() swaps each one for an
-- expiring token the next time that store is read (Shopify's one-call migration, no reinstall).

ALTER TABLE p_shopify ADD COLUMN refresh_token TEXT;
ALTER TABLE p_shopify ADD COLUMN expires_at INTEGER;
ALTER TABLE p_shopify ADD COLUMN refresh_expires_at INTEGER;

CREATE TABLE IF NOT EXISTS p_shop_address (
  act_id     TEXT PRIMARY KEY,
  shop       TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

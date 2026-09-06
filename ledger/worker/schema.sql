-- Mobius Ledger — D1 schema (idempotent; re-run after adding tables)
-- npx wrangler d1 execute mobius-ledger --remote --file=schema.sql

CREATE TABLE IF NOT EXISTS transactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  date TEXT NOT NULL,                    -- YYYY-MM-DD
  month TEXT NOT NULL,                   -- YYYY-MM, denormalized for month queries
  type TEXT NOT NULL,                    -- 'in' (revenue) | 'out' (expense) | 'fee' (merchant fee)
  vendor TEXT NOT NULL,                  -- vendor name, or client name for money in
  amount REAL NOT NULL,                  -- positive; refunds are negative 'in' rows
  bucket TEXT,                           -- Cole's layer: Software/Contractors/Payroll/Ads-Marketing/Other/Revenue/Merchant fee
  tax_cat TEXT,                          -- CPA layer, from settings.taxCats
  note TEXT,
  one_time INTEGER DEFAULT 0,            -- excluded from the recurring baseline/forecast
  expected INTEGER DEFAULT 0,            -- pre-created by the recurring engine, awaiting confirm
  status TEXT DEFAULT 'ok',              -- 'ok' | 'review' (Review inbox)
  receipt_key TEXT,                      -- KV key of the attached receipt file
  receipt_name TEXT,
  receipt_type TEXT,                     -- MIME type of the stored file
  source TEXT DEFAULT 'manual',          -- manual | recurring | import | backfill
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_txn_month ON transactions(month);
CREATE INDEX IF NOT EXISTS idx_txn_vendor ON transactions(vendor);

-- Vendor rules: one row per known vendor. The rule IS the categorization —
-- a transaction for a known vendor never asks again. recurring=1 rows are
-- pre-created each month by the recurring engine at expected_amount.
CREATE TABLE IF NOT EXISTS vendors (
  name TEXT PRIMARY KEY,
  bucket TEXT NOT NULL,
  tax_cat TEXT NOT NULL,
  recurring INTEGER DEFAULT 0,
  expected_amount REAL,
  active INTEGER DEFAULT 1
);

-- Clients. billing 'retainer' = fixed monthly amount; 'percent' = % of ad
-- spend, so the amount varies — retainer then holds the ESTIMATE (forecast +
-- the pre-created expected row, which Cole overwrites with the actual when
-- invoicing) and pct records the agreed percentage. active=0 keeps history
-- but stops expecting money.
CREATE TABLE IF NOT EXISTS clients (
  name TEXT PRIMARY KEY,
  retainer REAL,
  active INTEGER DEFAULT 1,
  billing TEXT DEFAULT 'retainer',
  pct REAL
);

-- Month close state. A closed month's report card is FROZEN in report_json —
-- edits to old transactions never silently change a report Cole already used.
CREATE TABLE IF NOT EXISTS months (
  month TEXT PRIMARY KEY,                -- YYYY-MM
  status TEXT DEFAULT 'open',            -- 'open' | 'closed'
  closed_at TEXT,
  report_json TEXT
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT
);

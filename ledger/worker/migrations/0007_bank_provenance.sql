-- Where each booked bank charge came from, kept beside the transaction rather
-- than on it. Rows booked before 0002 have empty provenance columns, and June to
-- August are closed, so those columns can never be filled in place. This table
-- is written once per charge and never changed: a closed row stays untouched,
-- and a wrong entry cannot be quietly rewritten later.
CREATE TABLE IF NOT EXISTS bank_provenance (
 plaid_id TEXT PRIMARY KEY,
 item_id TEXT,
 account_id TEXT,
 currency TEXT,
 amount REAL NOT NULL,          -- signed, as the bank reported it when recorded
 date TEXT NOT NULL,            -- the bank's date when recorded
 origin TEXT NOT NULL,          -- 'ingest' (booked by the feed) | 'repair' (verified after the fact)
 recorded_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TRIGGER IF NOT EXISTS bank_provenance_no_update BEFORE UPDATE ON bank_provenance
BEGIN SELECT RAISE(ABORT, 'bank provenance is append-only'); END;
CREATE TRIGGER IF NOT EXISTS bank_provenance_no_delete BEFORE DELETE ON bank_provenance
BEGIN SELECT RAISE(ABORT, 'bank provenance is append-only'); END;

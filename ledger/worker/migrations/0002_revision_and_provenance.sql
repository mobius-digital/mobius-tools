INSERT OR IGNORE INTO settings(key,value) VALUES('ledgerRevision','0');
CREATE TRIGGER ledger_revision_insert AFTER INSERT ON transactions BEGIN
 UPDATE settings SET value=CAST(value AS INTEGER)+1 WHERE key='ledgerRevision'; END;
CREATE TRIGGER ledger_revision_update AFTER UPDATE ON transactions BEGIN
 UPDATE settings SET value=CAST(value AS INTEGER)+1 WHERE key='ledgerRevision'; END;
CREATE TRIGGER ledger_revision_delete AFTER DELETE ON transactions BEGIN
 UPDATE settings SET value=CAST(value AS INTEGER)+1 WHERE key='ledgerRevision'; END;
ALTER TABLE transactions ADD COLUMN bank_item_id TEXT;
ALTER TABLE transactions ADD COLUMN bank_account_id TEXT;
ALTER TABLE transactions ADD COLUMN bank_currency TEXT;
ALTER TABLE transactions ADD COLUMN bank_amount REAL;
ALTER TABLE transactions ADD COLUMN import_id TEXT;
CREATE UNIQUE INDEX ledger_import_id ON transactions(import_id) WHERE import_id IS NOT NULL;
CREATE TRIGGER ledger_closed_provenance BEFORE UPDATE ON transactions
WHEN EXISTS(SELECT 1 FROM months WHERE month IN (OLD.month, NEW.month) AND status='closed')
AND (OLD.bank_item_id IS NOT NEW.bank_item_id OR OLD.bank_account_id IS NOT NEW.bank_account_id OR OLD.bank_currency IS NOT NEW.bank_currency
 OR OLD.bank_amount IS NOT NEW.bank_amount OR OLD.import_id IS NOT NEW.import_id)
BEGIN SELECT RAISE(ABORT,'period closed: provenance cannot change'); END;
CREATE TABLE ledger_jobs (
 id TEXT PRIMARY KEY, kind TEXT NOT NULL, payload TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'pending', error TEXT, updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE receipt_versions (
 receipt_key TEXT PRIMARY KEY, transaction_id INTEGER NOT NULL, receipt_name TEXT,
 receipt_type TEXT, receipt_hash TEXT, retained_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE TRIGGER ledger_receipt_version_update BEFORE UPDATE OF receipt_key ON transactions
WHEN OLD.receipt_key IS NOT NULL AND OLD.receipt_key IS NOT NEW.receipt_key BEGIN
 INSERT OR IGNORE INTO receipt_versions(receipt_key,transaction_id,receipt_name,receipt_type,receipt_hash)
 VALUES(OLD.receipt_key,OLD.id,OLD.receipt_name,OLD.receipt_type,OLD.receipt_hash); END;
CREATE TRIGGER ledger_receipt_version_delete BEFORE DELETE ON transactions
WHEN OLD.receipt_key IS NOT NULL BEGIN
 INSERT OR IGNORE INTO receipt_versions(receipt_key,transaction_id,receipt_name,receipt_type,receipt_hash)
 VALUES(OLD.receipt_key,OLD.id,OLD.receipt_name,OLD.receipt_type,OLD.receipt_hash); END;

CREATE TRIGGER ledger_policy_revision AFTER UPDATE OF value ON settings
WHEN NEW.key='money' AND OLD.value IS NOT NEW.value BEGIN
 UPDATE settings SET value=CAST(value AS INTEGER)+1 WHERE key='ledgerRevision'; END;
CREATE TABLE ledger_close_history (
 id INTEGER PRIMARY KEY, month TEXT NOT NULL, closed_at TEXT, report_json TEXT NOT NULL
);
CREATE TRIGGER ledger_close_history_insert AFTER INSERT ON months
WHEN NEW.status='closed' AND NEW.report_json IS NOT NULL BEGIN
 INSERT INTO ledger_close_history(month,closed_at,report_json) VALUES(NEW.month,NEW.closed_at,NEW.report_json); END;
CREATE TRIGGER ledger_close_history_update AFTER UPDATE ON months
WHEN NEW.status='closed' AND NEW.report_json IS NOT NULL
AND (OLD.status != 'closed' OR OLD.report_json IS NOT NEW.report_json) BEGIN
 INSERT INTO ledger_close_history(month,closed_at,report_json) VALUES(NEW.month,NEW.closed_at,NEW.report_json); END;

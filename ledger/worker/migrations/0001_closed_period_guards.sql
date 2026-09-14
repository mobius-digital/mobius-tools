-- Apply once using Wrangler migrations. No production data is rewritten.
CREATE TRIGGER IF NOT EXISTS ledger_closed_insert BEFORE INSERT ON transactions
WHEN EXISTS (SELECT 1 FROM months WHERE month=NEW.month AND status='closed')
BEGIN SELECT RAISE(ABORT, 'period closed: reopen before posting'); END;
CREATE TRIGGER IF NOT EXISTS ledger_closed_delete BEFORE DELETE ON transactions
WHEN EXISTS (SELECT 1 FROM months WHERE month=OLD.month AND status='closed')
BEGIN SELECT RAISE(ABORT, 'period closed: reopen before deleting'); END;
CREATE TRIGGER IF NOT EXISTS ledger_closed_update BEFORE UPDATE ON transactions
WHEN EXISTS (SELECT 1 FROM months WHERE month IN (OLD.month,NEW.month) AND status='closed')
AND (OLD.date IS NOT NEW.date OR OLD.month IS NOT NEW.month OR OLD.type IS NOT NEW.type
 OR OLD.vendor IS NOT NEW.vendor OR OLD.amount IS NOT NEW.amount OR OLD.bucket IS NOT NEW.bucket
 OR OLD.tax_cat IS NOT NEW.tax_cat OR OLD.note IS NOT NEW.note OR OLD.one_time IS NOT NEW.one_time
 OR OLD.expected IS NOT NEW.expected OR OLD.status IS NOT NEW.status OR OLD.source IS NOT NEW.source
 OR OLD.stripe_id IS NOT NEW.stripe_id OR OLD.stripe_cus IS NOT NEW.stripe_cus
 OR OLD.fee IS NOT NEW.fee OR OLD.plaid_id IS NOT NEW.plaid_id)
BEGIN SELECT RAISE(ABORT, 'period closed: only receipt metadata may change'); END;

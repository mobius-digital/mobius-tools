-- 2026-10-14 (Cashew Step B.2): which feed a bank line came from, 'bank' or 'card'. Lucky's books
-- have had it since v6; the one engine reads it for cash timing and the drill panel.
ALTER TABLE transactions ADD COLUMN acct TEXT;

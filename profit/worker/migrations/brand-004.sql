-- Brand tab x Asana, round 2 (2026-09-24): Keep running, check-again dates, and the
-- brief read from the task description itself.
ALTER TABLE p_br_batch ADD COLUMN asana_result TEXT;
ALTER TABLE p_br_batch ADD COLUMN check_again TEXT;
ALTER TABLE p_br_batch ADD COLUMN keep_reason TEXT;
ALTER TABLE p_br_batch ADD COLUMN brief_text TEXT;

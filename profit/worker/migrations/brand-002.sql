-- Brand tab x Asana (2026-09-24). Asana is where work happens; these columns
-- are how a test row remembers its task. Run once.
ALTER TABLE p_br_batch ADD COLUMN asana_gid TEXT;
ALTER TABLE p_br_batch ADD COLUMN asana_url TEXT;
ALTER TABLE p_br_batch ADD COLUMN asana_section TEXT;
ALTER TABLE p_br_batch ADD COLUMN assignee_gid TEXT;
ALTER TABLE p_br_batch ADD COLUMN tagged_at TEXT;
ALTER TABLE p_br_batch ADD COLUMN result_posted TEXT;

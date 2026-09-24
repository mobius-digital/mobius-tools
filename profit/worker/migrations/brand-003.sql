-- Asana angle round-trip (2026-09-24): the Angle text Locus last saw on the task,
-- so a person's edit in Asana is noticed and followed.
ALTER TABLE p_br_batch ADD COLUMN asana_angle TEXT;

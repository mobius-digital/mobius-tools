-- 2026-10-15: the staff Videos screen (Cole: "stupid dumb to use"). Every video on the board can carry its own
-- category (section_id, overrides its idea's) and a place in ONE board order (board_sort, lowest first; null =
-- after the ordered ones, in the dealt order). Checklist "Skip these" gets its own list (skip_json) instead of
-- being guessed from rules that start with never / don't.
ALTER TABLE p_amb_proof ADD COLUMN section_id TEXT;
ALTER TABLE p_amb_proof ADD COLUMN board_sort INTEGER;
ALTER TABLE p_amb_brand ADD COLUMN skip_json TEXT;

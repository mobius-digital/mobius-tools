-- 2026-10-14: the creator link's video board can fill itself (Cole, after Frost Buddy).
-- board_mode 'picked' = the proof videos attached to ideas (as before); 'auto' = the brand's own
-- Meta VIDEO ads ranked by Triple Whale orders (last-platform-click, last 30 days), top board_n,
-- then other brands' clips. board_json caches the ranked ad ids ([{ad_id, rank}]) and board_at
-- when they were ranked; account-health reads board_json to authorise playback of those ads.
ALTER TABLE p_amb_brand ADD COLUMN board_mode TEXT NOT NULL DEFAULT 'picked';
ALTER TABLE p_amb_brand ADD COLUMN board_n INTEGER NOT NULL DEFAULT 20;
ALTER TABLE p_amb_brand ADD COLUMN board_json TEXT;
ALTER TABLE p_amb_brand ADD COLUMN board_at TEXT;

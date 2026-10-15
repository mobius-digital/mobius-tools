-- 2026-10-15: what the auto board ranks by, chosen by staff per brand (Cole).
-- 'orders' (default) | 'revenue' | 'roas' | 'hook'. See autoBoard() in src/amb.js.
ALTER TABLE p_amb_brand ADD COLUMN board_sort TEXT NOT NULL DEFAULT 'orders';

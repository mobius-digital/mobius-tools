-- First seconds (2026-10-06, Cole): a bank of ways to open a video per brand, and two alternate
-- openers per idea. hooks_json: [{title, how, kind: 'shared'|'brand', url, clip}]; alt_hooks_json: [string].
ALTER TABLE p_amb_brand ADD COLUMN hooks_json TEXT;
ALTER TABLE p_amb_angle ADD COLUMN alt_hooks_json TEXT;

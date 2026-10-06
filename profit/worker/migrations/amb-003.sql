-- Ambassadors rebuild (2026-10-06): the creator link teaches HOW to hold attention,
-- not only what to say. Per angle: what is physically on screen in the first second
-- (visual_hook), what happens at 3 to 8 seconds to keep them (rehook), why the shape
-- works (why) and what to steal from other brands' ads when we have no proof of our
-- own (inspo_json: [{brand, what, url}]). Per brand: the "How to keep them watching"
-- guide shown on the page (guide_json: [{title, text}]).
ALTER TABLE p_amb_angle ADD COLUMN visual_hook TEXT;
ALTER TABLE p_amb_angle ADD COLUMN rehook TEXT;
ALTER TABLE p_amb_angle ADD COLUMN why TEXT;
ALTER TABLE p_amb_angle ADD COLUMN inspo_json TEXT;
ALTER TABLE p_amb_brand ADD COLUMN guide_json TEXT;

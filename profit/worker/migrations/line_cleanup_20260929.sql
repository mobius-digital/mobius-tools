-- One-time cleanup, 2026-09-29, after the Viktor research import (viktor_import.mjs).
-- Removes product lines that a Viktor line now covers. Checked first, on the live DB: nothing
-- references any of them (0 rows in p_br_persona, p_br_voc, p_br_comp, p_br_angle, p_br_doc, p_br_run
-- by line_id, and no id match inside p_br_doc / p_br_batch / p_br_concept / p_br_onboard /
-- p_studio_ad / p_studio_batch / p_amb_section text). The guards below repeat that check, so a
-- line that picked up a reference since then is simply left in place.
--   Party Patch  "Daily Wellness"      31c91050c5384456  (Viktor: the wellness wording is positioning drift; same patch as Night Out Defense)
--   Bonk Golf    "Course Accessories"  e27de5da866c4c42  (markers, divot tools, towel, tees now sit in Gifts and Bundles / Limited drops)
--   Dartee Golf  "The glove"           54ae1924b1a042ac  (covered by vk_dartee_accessories)
--   Dartee Golf  "Hats"                e7d94ce9455a4d8b  (covered by vk_dartee_accessories)
-- Lucky Golf: no line was superseded (Wedges, Long game and Apparel were mapped, Putters added).
-- Run: npx wrangler d1 execute mobius-account-health --remote --file=migrations/line_cleanup_20260929.sql

DELETE FROM p_br_doc WHERE line_id IN ('31c91050c5384456', 'e27de5da866c4c42', '54ae1924b1a042ac', 'e7d94ce9455a4d8b')
  AND line_id NOT IN (SELECT line_id FROM p_br_persona WHERE line_id IS NOT NULL UNION SELECT line_id FROM p_br_voc WHERE line_id IS NOT NULL
                      UNION SELECT line_id FROM p_br_comp WHERE line_id IS NOT NULL UNION SELECT line_id FROM p_br_angle WHERE line_id IS NOT NULL);
DELETE FROM p_br_line WHERE id IN ('31c91050c5384456', 'e27de5da866c4c42', '54ae1924b1a042ac', 'e7d94ce9455a4d8b')
  AND id NOT IN (SELECT line_id FROM p_br_persona WHERE line_id IS NOT NULL UNION SELECT line_id FROM p_br_voc WHERE line_id IS NOT NULL
                 UNION SELECT line_id FROM p_br_comp WHERE line_id IS NOT NULL UNION SELECT line_id FROM p_br_angle WHERE line_id IS NOT NULL
                 UNION SELECT line_id FROM p_br_doc);

-- Night Out Defense is the self-purchase line now; the themed packs have their own line (vk_pp_themes).
UPDATE p_br_line SET products = 'The Party Patch (Traditional), a clear vitamin patch worn while drinking (now scent-free). 5-pack $19.99, 12-pack $39.99, 25-pack $79.99, 50-pack $159.99. Bought for yourself, then repeated. The themed packs are their own line (Party Themes).'
  WHERE id = 'acd1815908b24573' AND act_id = 'act_1033194534145987';

-- Line order after the merge: the researched lines first, in Viktor's order, unresearched ones last.
UPDATE p_br_line SET sort = CASE id
  WHEN 'acd1815908b24573' THEN 0 WHEN 'vk_pp_themes' THEN 1 WHEN '2223c03d8030471d' THEN 2
  WHEN '1c8ae2e739554a9d' THEN 0 WHEN 'vk_bonk_gifts' THEN 1 WHEN 'vk_bonk_women' THEN 2 WHEN 'vk_bonk_drops' THEN 3 WHEN 'a1727dac41fb4c62' THEN 4 WHEN '8c26c9e3bed740d8' THEN 5
  WHEN 'a2b8fcbea42c4262' THEN 0 WHEN 'vk_dartee_creator' THEN 1 WHEN 'vk_dartee_accessories' THEN 2
  WHEN 'gd_line_apparel' THEN 0 WHEN 'vk_gd_hats' THEN 1 WHEN 'vk_gd_accessories' THEN 2 WHEN 'vk_gd_club' THEN 3
  WHEN 'f4e7bae963214fcd' THEN 0 WHEN 'vk_lucky_putters' THEN 1 WHEN '5251cf534576451a' THEN 2 WHEN '116e358402d748fe' THEN 3
  ELSE sort END
WHERE act_id IN ('act_1033194534145987', 'act_12528825', 'act_963898971023823', 'act_313396960515158', 'act_378146126054294');

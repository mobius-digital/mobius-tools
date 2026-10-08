-- Lucky Golf, 2026-10-08 (Cole): Cyber Monday credit stays $10; weekend goals AGREED; the Havoc driver and the
-- irons are NOT sold or pre-sold in December. December sells what is in stock. The driver is teased to the list
-- from Dec 26 (no name, no photo) to build the Jan 6 launch list. Run once.
UPDATE p_season_phase SET offer='The new apparel at full price. Members Dec 3, everyone Dec 4.'
WHERE act_id='act_378146126054294' AND season='2026' AND key='drop';
UPDATE p_season_phase SET offer='Full price. Order by Dec 13 standard, Dec 16 expedited. The black putters, the wedge bundle and gift cards as the gift.',
 detail='Cutoff in every ad and email. Gift guide: black putter, wedge bundle, Stryker, gift card. No driver or irons in December and no pre-orders (Cole, Oct 8): a gift that cannot ship by Christmas is a card in a box, and it would spend the Jan 6 reveal early. Dec 2025 did $3k to $5k a day here.'
WHERE act_id='act_378146126054294' AND season='2026' AND key='xmas';
UPDATE p_season_phase SET detail='Nothing about the driver is sold or pre-sold in December (Cole, Oct 8). From Dec 26 the list hears "something new, Jan 6, members first" with no name or photo, to build the launch list. Members Jan 6, everyone Jan 7. Irons follow on Feb 9.'
WHERE act_id='act_378146126054294' AND season='2026' AND key='ny';
UPDATE p_season_phase SET detail=detail || ' Not in December (Cole, Oct 8). Pre-order only if stock lands after the launch date AND the landed date is firm.'
WHERE act_id='act_378146126054294' AND season='2026' AND key='irons';
UPDATE p_season_answer SET value=json_set(value,'$.note',replace(json_extract(value,'$.note'),'PROPOSED Oct 8 (agree with Cole)','AGREED Oct 8 (Cole)'))
WHERE act_id='act_378146126054294' AND season='2026' AND key='goals';

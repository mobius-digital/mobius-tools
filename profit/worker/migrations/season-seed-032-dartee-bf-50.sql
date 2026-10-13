-- Dartee Golf, 2026-10-13 (Cole): Black Friday = free Raincheck belt with every order + up to 50% off, NO spend
-- tiers. Settles the Oct 9 #dartee thread (Justin's $100/$200/$300 kicker and the "70% on one product" idea are
-- both out; James's "discount everything else, up to 50%" is in). Run once.
UPDATE p_season_phase SET
 offer='The full Black Friday offer two days early: a free Raincheck belt with every order, and up to 50% off sitewide.'
WHERE act_id='brand_dartee_golf' AND season='2026' AND key='access';
UPDATE p_season_phase SET
 offer='Free Raincheck belt with every order. Up to 50% off sitewide.',
 detail='Decided Oct 13 (Cole): free Raincheck + up to 50% off, no spend tiers. Justin''s Oct 9 kicker (extra 10% at $100, 15% at $200, 20% at $300) and a 70% single product are both out: one mechanic, explainable in two sentences. Discounts vary by product, set by Dartee, nothing deeper than 50% (hats and accessories can carry the 50, per James). Excluded from every discount: the Josh Kelly Up & Down collection and anything new. Launches Thanksgiving morning to the full list and ads. Copy never says BOGO: "where are we sending your free belt?" Raincheck costs $9 on a $70 belt, so the worst order still clears about 74% gross. Protect the Raincheck from the sitewide discount with a Black Friday collection. If Rainchecks sell out: stretch belts as the gift.'
WHERE act_id='brand_dartee_golf' AND season='2026' AND key='bf';
UPDATE p_season_phase SET
 detail='No kickers. The drop is the reason to come back ("new belt drop, website still up to 50% off"). Lizard lands in about two weeks; same cost as gator and ostrich, priced at $120 on purpose. Open: end Dec 4 as said, or announce Dec 3 and extend.'
WHERE act_id='brand_dartee_golf' AND season='2026' AND key='cm';

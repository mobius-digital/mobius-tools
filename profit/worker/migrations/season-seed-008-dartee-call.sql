-- Dartee Golf, rebuilt from the 2026-10-06 "Dartee BFCM" call (Cole, Nick Yates, Justin, James).
-- Fireflies 01M46314H0TMA2S4F00Q89NVY0. Nick's read-back at 51:47 is the calendar. Run once.
-- act_963898971023823

-- October giveaway (new)
INSERT OR REPLACE INTO p_season_phase (act_id, season, key, name, start, end, grp, who, offer, detail, status, sort) VALUES
 ('act_963898971023823','2026','giveaway','October giveaway','2026-10-09','2026-11-16','nov','Cold golfers, email + phone to enter',
  'Fit your foursome: win every Dartee belt for all four of you (about 104 belts, $800 of belts each). Enter free.',
  'Lead machine, not a sale. Goal 10,000 leads. Budget $10k to $20k, start $250 a day, average $555 a day over 36 days; scale past $20k only if cost per lead holds ($2 to $3 target, $10 ceiling if a 5x return on the segment still pencils at 10% buying at $80). Separate Klaviyo list "October giveaway" (Nick), nurtured, segmented so we can see what the leads buy on Black Friday. Non-winners get the Black Friday announcement. Justin builds the signup page (Klaviyo embed, email + phone, "Where should we text you if you win?") and shoots the 100-belt pile tonight. Cole launches by Oct 9.','locked',-5);

-- Early Bird: BOGO 50
UPDATE p_season_phase SET name='Early Bird', start='2026-11-01', end='2026-11-16', who='Everyone',
 offer='Buy one belt, get a second 50% off. Any belt on the site.',
 detail='The warm-up, deliberately lighter than the weekend ("nothing crazy", Nick). Justin builds a landing page like the warehouse BOGO page. No sitewide percent, no credit (the old 20% + 10% credit idea is dead). Open: BOGO 50 vs 60. Open: whether these buyers get auto-added to the early access list.',
 status='locked' WHERE act_id='act_963898971023823' AND season='2026' AND key='early';

-- Early access list build (new)
INSERT OR REPLACE INTO p_season_phase (act_id, season, key, name, start, end, grp, who, offer, detail, status, sort) VALUES
 ('act_963898971023823','2026','list','Early access list build','2026-11-17','2026-11-22','nov','Anyone who signs up',
  'Sign up for 48 hours of early access to Black Friday. We tell them the whole offer and how few Raincheck belts are left.',
  'No sale promoted this week; the only ask is the signup. The pitch is the real offer plus real scarcity (actual Raincheck count from the warehouse, not a made-up number). Last year''s early-bird lists bought at about 40%. The list is about 20,000; the giveaway list stays separate.','locked',5);

-- Early access: Tue Nov 24 + Wed Nov 25, 48 hours
UPDATE p_season_phase SET name='Early access (48 hours)', start='2026-11-24', end='2026-11-25', who='The early access list only',
 offer='The full Black Friday offer two days early: a free Raincheck belt with every order, and up to 70% off sitewide.',
 detail='Tuesday and Wednesday before Thanksgiving. Open: James''s free hat on every early-access order (hats cost $3 to $4). Not a locked store; a list-only link.',
 status='locked' WHERE act_id='act_963898971023823' AND season='2026' AND key='access';

-- Black Friday: Thu Nov 26 to Sun Nov 29
UPDATE p_season_phase SET name='Black Friday', start='2026-11-26', end='2026-11-29', who='Everyone',
 offer='Free Raincheck belt with every order. Up to 70% off sitewide.',
 detail='Launches Thanksgiving morning to the full list and ads. Discounts vary by product (10 to 50%), one high-margin product carries the 70 (or 80), set by Dartee. Excluded from every discount: the Josh Kelly Up & Down collection and anything new. No spend tiers on top ("one mechanic or the other", Nick). Copy never says BOGO: "where are we sending your free belt?" Raincheck costs $9 on a $70 belt, so the worst order still clears about 74% gross. Protect the Raincheck from the sitewide discount with a Black Friday collection. If Rainchecks sell out: stretch belts as the gift.',
 status='locked' WHERE act_id='act_963898971023823' AND season='2026' AND key='bf';

-- Cyber Monday: Nov 30 to Dec 4, same offer + the Lizard drop
UPDATE p_season_phase SET name='Cyber Monday + Lizard drop', start='2026-11-30', end='2026-12-04', who='Everyone',
 offer='The Black Friday offer keeps running. The new Lizard belt drops at $120, full price, never discounted.',
 detail='No kickers. The drop is the reason to come back ("new belt drop, website still up to 70% off"). Lizard lands in about two weeks; same cost as gator and ostrich, priced at $120 on purpose. Open: end Dec 4 as said, or announce Dec 3 and extend.',
 status='locked' WHERE act_id='act_963898971023823' AND season='2026' AND key='cm';

-- December: gifting + shipping cutoffs (dates not set on the call)
UPDATE p_season_phase SET name='Gifting + shipping cutoffs', start='2026-12-05', end='2026-12-18', who='Everyone',
 offer='Gift season: bundle builder, shipping-cutoff tiers (3-day, 2-day, overnight), order-by dates in every message.',
 detail='Not decided on the call ("not for this call"). Nick''s shape: three cutoffs with spend thresholds that fit the margins; Justin builds a bundle builder. Dates are placeholders until Dartee gives the real cutoffs.',
 status='draft' WHERE act_id='act_963898971023823' AND season='2026' AND key='xmas';

INSERT OR REPLACE INTO p_season_phase (act_id, season, key, name, start, end, grp, who, offer, detail, status, sort) VALUES
 ('act_963898971023823','2026','gift','Gift cards','2026-12-21','2026-12-24','dec','Everyone',
  'Buy a gift card, get it matched: buy $25 get $25, $50 get $50, $100 get $100.',
  'Two or three days before Christmas, after the last shipping cutoff. Cole: check how long the cards last before promising.','draft',65);

UPDATE p_season_phase SET name='Dec 26 to New Year''s', start='2026-12-26', end='2026-12-31', who='Non-buyers or the full list, Dartee''s call',
 offer='Run the Black Friday offer back (or: buy any belt, get a lesser or equal belt free, to clear the year).',
 detail='Nick recommends the run-back; Justin floated the belt-for-belt clear-out. "A different conversation", left open.',
 status='draft' WHERE act_id='act_963898971023823' AND season='2026' AND key='boxing';

-- Call sheet answers from the call
INSERT OR REPLACE INTO p_season_answer (act_id, season, key, value) VALUES
 ('act_963898971023823','2026','winning_offer','The BOGO Raincheck warehouse sale (Sep 2026) is the strongest non-Black-Friday sale Dartee has run; 22% of those orders were a Raincheck plus the free Raincheck. Two years ago 50% sitewide, last year 40% sitewide (still profitable), early BF last year 20% off. BOGO 50 did fine earlier this year but nothing like the free belt.'),
 ('act_963898971023823','2026','floor','Gator about $18 to $20 cost at about $100. Raincheck $9 cost at $70. Hats about $5 (new cheap ones $3 to $4) at $30. Lizard same cost as gator, priced $120. Worst Black Friday order (Raincheck + free Raincheck) still about 74% gross.'),
 ('act_963898971023823','2026','inventory','About 8,000 belts, 24 to 26 SKUs. Lizard lands in about two weeks. Real Raincheck count needed for the scarcity email (Cole used 629 as an example on the call; last Black Friday alone was over 700 orders).'),
 ('act_963898971023823','2026','last_year','Last BF: about 40% sitewide, still profitable, roughly 1.3 to 1.4 units an order, 700+ orders on Black Friday alone. Early BF last year 20% off. AOV now about $100 blended ($110 new, $77 returning).'),
 ('act_963898971023823','2026','email_owner','Nick Yates (+ Nick Stevanovich on the Klaviyo list). BF week: 3 to 4 sends a day, 3-hour abandoned cart. List about 20,000.'),
 ('act_963898971023823','2026','strategy_note',
'DECIDED ON THE OCT 6 CALL (Nick wrote it into #dartee-email live)
1. Oct 9 to Nov 16: the giveaway. Fit your foursome, about 104 belts. 10,000 leads, $10k to $20k, Cole launches by Oct 9, Justin''s page tomorrow.
2. Nov 1 to 16: Early Bird, BOGO 50 on any belt.
3. Nov 17 to 22: no sale, just the early access signup, told the real offer and the real Raincheck count.
4. Nov 24 to 25: early access, 48 hours: free Raincheck with every order + up to 70% off sitewide.
5. Nov 26 (Thanksgiving) to 29: same offer to everyone.
6. Nov 30 to Dec 4: same offer + the Lizard belt at $120, full price.
7. December: gifting, shipping cutoffs, bundle builder, matched gift cards before Christmas. Dates not set.
8. Dec 26 to 31: run the BF offer back. Not final.
RULES: one mechanic at a time (no tiers on top of the percent). Josh Kelly Up & Down and anything new are never discounted. Copy never says BOGO. Giveaway list and early access list stay separate.

WHY THIS WORKS FOR DARTEE: the free Raincheck is a proven offer (the September warehouse sale), it costs $9, and it reads as a gift rather than a markdown. The "up to 70%" headline does the sitewide work with one sacrificial product while the belts people actually buy sit at 20 to 40%. The giveaway buys 10,000 warm golfers for the weekend at $2 to $3 each; at 10% buying at $80 that is $80k off $20k, and the segment is tracked in Klaviyo so we will know.

STILL OPEN (Dartee decides): the per-product discount ladder and which product carries the 70; free hat on early access orders; the real Raincheck count and the sell-out fallback; Cyber Monday end date; whether Early Bird buyers auto-join early access; what non-winners get; BOGO 50 vs 60; free-shipping threshold; all of December''s dates; Dec 26 mechanic.');

INSERT OR REPLACE INTO p_season_answer (act_id, season, key, value) VALUES
 ('act_963898971023823','2026','goals','{"early":null,"bf":78000,"dec":130000,"total":260000,"be":1.5,"target":3.0,"s50":4.0,"s100":4.5,"start":4000,"cap":11442,"note":"BF weekend and December goals from the Playbook (Aug 25); no revenue goal was set on the Oct 6 call. Giveaway KPI: 10,000 leads at $2 to $3 each. Ladder: scale lines 4.0 / 4.5 per Cole; confirm before Nov 13."}');

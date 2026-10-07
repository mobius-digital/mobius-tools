-- Lucky Golf, 2026-10-07 (later): the Black Friday ladder refined after the history check.
-- Shopify, Black Friday weekends (Fri to Mon): 2021 124 orders $21.7k; 2022 132 / $27.0k; 2023 281 / $31.9k;
-- 2024 845 / $114.0k (wedges sold at about $40 each, ~36% under October, ~1.9 wedges per wedge order, free
-- putter and driver covers; best ever, near breakeven per order); 2025 629 / $76.0k (30% then 50% sitewide,
-- wedge about $70, ~1.3 per order, lost about $15k). Hats barely sell on their own (about 119 orders in 14
-- months) so the hat is a sweetener, not the hook; putter covers worked as the 2024 gift and 1,000+ are on hand.
-- Still status proposed until Cole sends Nick the final. Run once.

UPDATE p_season_phase SET
 offer='PROPOSED: every club comes with a free hat, every putter with its cover. Buy 2 clubs, take $50 off. Buy 3 or more, take $100 off (3 wedges for the price of 2). Eclipse Black putters on sale for the first time. Retired polos $39 while they last.',
 detail='History: 2024 was the best weekend because a wedge cost about $40 and people bought two; it barely made money. 2025 went 30% then 50% sitewide and lost money. The ladder gives the 2+ club buyer a 2025-level price per wedge ($74 at two, $66 at three) while every order still clears about $55 to $215 before ads (breakeven ROAS 1.4 to 1.8). One-club buyers get the hat, putter buyers the cover too (a $30 cover, 698 mallet + 345 blade on hand). Hat: the Free Hat (Gift) product auto-adds the design with the most stock, one optional swap in the cart, sold-out designs drop off. Watch: Carver Gold RH 56 has only 18 left (the middle of every 52/56/60 set), Stryker RH 10, Eclipse Blade out of stock.'
WHERE act_id='act_378146126054294' AND season='2026' AND key='bf';

UPDATE p_season_phase SET
 detail='Cyber Monday gives a new reason to come back (Nick, Oct 7). GATE Nov 20: if the winter apparel is at the warehouse, it drops Monday at full price beside the club offer; if not, Monday adds a fourth rung (buy 4 clubs, take $150 off) and the apparel launches here, members Dec 3, everyone Dec 4, to every November buyer first. December also teases the gift of the year (the driver) with no name or date.'
WHERE act_id='act_378146126054294' AND season='2026' AND key='drop';

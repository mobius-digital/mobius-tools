-- Lucky Golf, 2026-10-08 (later): Cole was asking only about the Early Bird, not Black Friday. Black Friday
-- goes back to the dollar ladder (seed 016) with one hat per ORDER; the polo gift ladder (seed 018) is undone.
-- Early Bird becomes a zero-click gift: a hat we pick plus the new Lucky towel, on any club, no threshold.
-- The new accessories (towels, gloves, head covers, divot tools) are expected early November. GATE Oct 28:
-- towels at the warehouse, or the Early Bird opens with the hat and a second email adds the towel when it
-- lands. Gloves are never a gift (size and hand are clicks). Proposed until Cole sends Nick the final. Run once.

UPDATE p_season_phase SET
 offer='PROPOSED: Buy any club, get a free hat. Every putter comes with its cover. Buy 2 clubs, take $50 off. Buy 3 or more, take $100 off (3 Carvers for the price of 2). Eclipse Black putters on sale for the first time. Retired polos $39 while they last.',
 detail='One hat per order (we pick the design, swap optional), so no clicks. History: 2024 best weekend at about $40 a wedge, barely broke even; 2025 30% then 50% sitewide, lost money. The ladder gives 2+ club buyers a 2025-level price per wedge ($74 at two, $66 at three) while every order clears about $58 to $216 before ads (breakeven 1.4 to 1.8). Watch: Carver Gold RH 56 has 18 left, Stryker RH 10, Eclipse Blade out of stock.'
WHERE act_id='act_378146126054294' AND season='2026' AND key='bf';

UPDATE p_season_phase SET
 detail='Cyber Monday gives a new reason to come back (Nick, Oct 7). GATE Nov 20: if the winter apparel is at the warehouse, it drops Monday at full price beside the club offer; if not, Monday adds a fourth rung (buy 4 clubs, take $150 off). Winter apparel then launches members Dec 3, everyone Dec 4, every November buyer first. December teases the gift of the year (the driver) with no name or date.'
WHERE act_id='act_378146126054294' AND season='2026' AND key='drop';

UPDATE p_season_phase SET name='Early Bird: free hat + the new towel with any club (proposed)',
 offer='Buy any club, get a free hat and the new Lucky towel. No minimum, nothing to pick. Through Nov 16.',
 detail='Cole, Oct 8: a hat alone at $150 is not enough. The new accessories land early November, and a towel is one size, so the gift adds itself with zero clicks (we pick the hat too, swap optional). It is the launch of the towel as well: it ends up in a few hundred bags before it is ever sold. Early Bird single-club buyers get more gear than Black Friday single-club buyers on purpose (buy early, get more); Black Friday wins on money off at two clubs and up. Sets (Hat Trick, Up and Down, Blackout, Whole Lucky Bag) stay as shortcuts on the page, same gift. GATE Oct 28: towels at the warehouse, else open with the hat and send "we added the towel" when it lands. Needs about 250 towels.'
WHERE act_id='act_378146126054294' AND season='2026' AND key='list';

UPDATE p_season_phase SET
 offer='Proposed: a free Lucky divot tool (or towel) with any gift card. Structure still TBD with Nick.',
 detail='Free gear, not bonus value: a big bonus card is a discount on January''s driver the day it is redeemed. The new accessories make the gift easy and one size. Cards lead every channel Dec 17 to 24.'
WHERE act_id='act_378146126054294' AND season='2026' AND key='gift';

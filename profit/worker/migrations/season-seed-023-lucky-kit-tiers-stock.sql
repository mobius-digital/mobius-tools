-- Lucky Golf, 2026-10-08: the plan built on the stock Cole actually has: 600 towels (3 designs x 200, $5.04
-- landed), 400 divot tools (2 designs x 200, $3.31), 500 gloves (one size, one design, $5.79). Cole: a gift on
-- every order all November is just giving product away. So the gift is EARNED: the Lucky Kit (towel + divot
-- tool + glove, $14.14, all in the club box, zero clicks) comes with 2 or more clubs, all season. Black Friday
-- adds money off at 2 and 3 clubs and a free towel on any club. No reorder needed for November.
-- Giveaway upgraded: the four putters in the prize are the first black Eclipses, plus the kit, plus extra
-- entries for tagging your foursome. Proposed until Cole sends Nick the final. Run once.

UPDATE p_season_phase SET name='Early Bird: buy 2 clubs, get the Lucky Kit (proposed)',
 offer='Buy 2 clubs, get the Lucky Kit free: our new towel, a divot tool and a glove, all in the box. Through Nov 16.',
 detail='Earned, not handed out: one-club orders happen anyway, so the kit only goes where it changes behaviour (the second club). Two wedges leave $124 before ads (breakeven 1.60x). Uses about 60 kits. Doubles as the test for Black Friday: if two-club orders rise above October''s share by Nov 10, the ladder will work.'
WHERE act_id='act_378146126054294' AND season='2026' AND key='list';

UPDATE p_season_phase SET
 offer='PROPOSED: Free towel with any club. Buy 2 clubs: $50 off and the Lucky Kit (towel, divot tool, glove). Buy 3 or more: $100 off and the Lucky Kit. Every putter comes with its cover. Eclipse Black putters on sale for the first time. Retired polos $39 while they last.',
 detail='Per order before ads: one wedge + towel $59 (1.67x), two wedges $75 (1.96x), three wedges $101 (1.96x), putter orders $167 to $208 (1.38x to 1.57x). Stock use at ~500 orders: ~560 towels of 600, ~210 divot tools of 400, ~210 gloves of 500. Forecast Fri-Mon at 2025 traffic: ~$77k base, $61k to $94k; profitable above about 1.7x.'
WHERE act_id='act_378146126054294' AND season='2026' AND key='bf';

UPDATE p_season_phase SET
 offer='December, through Dec 24: buy 2 clubs, get the Lucky Kit (same rule as the Early Bird). Gift cards of $100 or more get a divot tool and a glove. Structure TBD with Nick.',
 detail='Uses what is left after Black Friday: about 190 divot tools, 290 gloves and 40 towels. Order about 400 more towels now (20 days) so the kit stays whole in December.'
WHERE act_id='act_378146126054294' AND season='2026' AND key='gift';

UPDATE p_season_phase SET
 offer='Win it for your whole foursome: all four of you get three Carvers, the first black Eclipse putters, the Stryker, a polo and the Lucky Kit. Enter free. Tag your three buddies for extra entries. (Name TBD.)',
 detail='Kept: the foursome is the best list-builder because every entrant has three friends to send it to. Upgrades Oct 8: (1) the prize putters are the first black Eclipses, so the giveaway feeds the Nov 9 reveal; (2) the Lucky Kit in the prize; (3) +5 entries for each buddy who enters from your link (needs a referral-capable signup page). About $3,300 of retail, about $650 at cost. Launch Oct 14 needs the page and the first creative this week.'
WHERE act_id='act_378146126054294' AND season='2026' AND key='early';

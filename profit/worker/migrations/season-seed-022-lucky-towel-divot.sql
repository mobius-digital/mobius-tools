-- Lucky Golf, 2026-10-08: one gift all season, decided on a new fact from Cole: a hat ships in its own
-- package, while a towel and a divot tool fit inside the club box. So the towel + divot tool ($8.35, no extra
-- package) costs about the same as or less than a hat all-in, looks like more, is one size (zero clicks), is
-- used with the club, and is new. No hat reorder needed. Same gift Nov 1 to Dec 24. Black Friday money ladder
-- unchanged. Proposed until Cole sends Nick the final. Run once.

UPDATE p_season_phase SET name='Early Bird: free towel + divot tool with any club (proposed)',
 offer='Buy any club, get our new towel and a divot tool free, in the box. No minimum, nothing to pick. Through Nov 16.',
 detail='Same gift all season, so one thing to explain. Full price: one wedge leaves $56 before ads (breakeven 1.77x). GATE Oct 28: towels and divot tools at the warehouse (about 250 each for the Early Bird, about 900 for November, about 1,500 through Dec 24).'
WHERE act_id='act_378146126054294' AND season='2026' AND key='list';

UPDATE p_season_phase SET
 offer='PROPOSED: Every club order comes with our new towel and a divot tool, free. Every putter comes with its cover. Buy 2 clubs, take $50 off. Buy 3 or more, take $100 off (3 Carvers for the price of 2). Eclipse Black putters on sale for the first time. Retired polos $39 while they last.',
 detail='The gift rides in the club box: $8.35, no second package, one size, zero clicks. A hat cost about $6 plus its own box and shipping, and hats sold about 119 orders in 14 months on their own. Per order before ads: one wedge $56 (1.77x), two wedges $81 (1.82x), three wedges $106 (1.85x), putter orders $163 to $214 (1.40x to 1.53x). Forecast Fri-Mon at 2025 traffic: ~$77k base, $61k to $94k; profitable above about 1.7x.'
WHERE act_id='act_378146126054294' AND season='2026' AND key='bf';

UPDATE p_season_phase SET
 offer='The same gift carries on: every club order comes with the towel and a divot tool through Dec 24. Gift cards: the towel and divot tool with any card of $100 or more (structure TBD with Nick).'
WHERE act_id='act_378146126054294' AND season='2026' AND key='gift';

-- Lucky Golf, 2026-10-08: the strategist's call after Cole asked for a real verdict, not agreement.
-- Real costs from Cole: towel $5.04 landed (sells $24.99), divot tool $3.31, glove $5.79 (sells $17.95).
-- Change 1: one free-gear kit all of November on every club order: hat + the new towel + a divot tool
--   (about $14 a order, zero clicks). It strengthens the weakest rung (one-club orders, most of the volume)
--   for about $8 more per order, where $25 off a single club would cost $25.
-- Change 2: Plan B becomes "2 clubs get a free Carver instead of $50 off" (more value, LEAVES MORE per order:
--   $101 vs $75 on two wedges). $25 off a single club breaks even near 2.9x and stays the last resort.
-- Forecast (Fri-Mon, same traffic as 2025, about 20k sessions): base ~440 orders x ~$175 = ~$77k, range
--   $61k to $94k; profitable at 2.0x+, where 2025 lost ~$15k on $76k. Run once.

UPDATE p_season_phase SET name='Early Bird: the Lucky Kit with any club (proposed)',
 offer='Buy any club, get the Lucky Kit free: a hat, our new towel and a divot tool. No minimum, nothing to pick. Through Nov 16.',
 detail='The same kit rides on every club order all November; Black Friday adds money off. Costs about $14 (hat ~$6 assumed, towel $5.04, divot tool $3.31). Zero clicks. Expect about $25k to $30k (Oct ran 11 orders and $1.5k a day at 0.76% conversion); the Early Bird is full-margin revenue, the accessories launch, and the test: if Nov 1 to 10 conversion is not at least 15% above October, the kit is not moving people and Black Friday leans on the ladder and Plan B. GATE Oct 28: towels and divot tools at the warehouse (about 900 of each for November), else open with the hat and add the rest when it lands.'
WHERE act_id='act_378146126054294' AND season='2026' AND key='list';

UPDATE p_season_phase SET
 offer='PROPOSED: Every club order gets the Lucky Kit free (hat, towel, divot tool). Every putter comes with its cover. Buy 2 clubs, take $50 off. Buy 3 or more, take $100 off (3 Carvers for the price of 2). Eclipse Black putters on sale for the first time. Retired polos $39 while they last.',
 detail='Forecast Fri-Mon at 2025 traffic: base ~$77k (~440 orders at ~$175), range $61k to $94k, below the $100k goal unless the list and the black putters add on top; profitable at 2.0x+ (2025 lost ~$15k on $76k). One-club orders stay full price because $20 to $25 off a single wedge breaks even at 2.4x to 2.9x, above 2025''s 2.2x. Per order before ads: $50 (one wedge) to $208 (Mallet + 2 wedges). Watch: Carver Gold RH 56 has 18 left, Stryker RH 10, Eclipse Blade out.'
WHERE act_id='act_378146126054294' AND season='2026' AND key='bf';

UPDATE p_season_phase SET name='Plan B (only if Friday 2pm is under $9k)', status='proposed',
 offer='Swap the 2-club rung: two clubs get a free Carver instead of $50 off. One extra email: "we made it better".',
 detail='The efficient escalation: a free Carver costs $22 against $50 off, shows $99 of value, and leaves $101 on two wedges against $75. Only if that fails: $25 off a single club (breaks even near 2.9x).'
WHERE act_id='act_378146126054294' AND season='2026' AND key='planb';

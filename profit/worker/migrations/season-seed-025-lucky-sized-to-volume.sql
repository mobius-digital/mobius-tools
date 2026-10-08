-- Lucky Golf, 2026-10-08: the plan sized to real volume (Nov 2025 924 orders, Nov 1-16 2025 261, Dec 2025 936,
-- Black Friday week ~680) and real stock (towels ~400, divot tools 400, gloves 500 one size).
-- Early Bird = towel + divot tool with any club (early-Black-Friday feel; full price absorbs it).
-- Black Friday = a three-tile ladder: any club towel; 2 clubs $50 off + towel + glove; 3+ clubs $100 off +
-- towel + glove + divot tool. December = no gift, full price (Cole). Accessories also sell as cart add-ons.
-- Towels needed ~940: order ~550 more now with express (35 days, lands ~Nov 12). Run once.

UPDATE p_season_phase SET name='Early Bird: free towel + divot tool with any club (proposed)',
 offer='Free towel and divot tool with any club. Through Nov 16.',
 detail='Sized to last year: about 260 orders Nov 1 to 16, so about 260 of each. Both ride in the club box ($8.35). Full price, so one wedge still leaves $56 before ads (breakeven 1.77x).'
WHERE act_id='act_378146126054294' AND season='2026' AND key='list';

UPDATE p_season_phase SET
 offer='PROPOSED: Any club: a free towel. Buy 2 clubs: $50 off, plus a towel and a glove. Buy 3 or more: $100 off, plus a towel, a glove and a divot tool. Plus the black Eclipse putters, first time on sale.',
 detail='Each step adds money and gear, so the jump from one club to two feels big. Uses about 680 towels, 180 gloves, 50 divot tools at ~680 orders. Per order before ads: one wedge $59 (1.67x), one Mallet $172 (1.34x), two wedges $79 (1.88x), Mallet + wedge $191 (1.46x), three wedges $101 (1.96x), Mallet + 2 wedges $213 (1.54x). Gloves were a one-size order that is hard to sell, so their real cost is below $5.79. Same offer for early access (list, Nov 24 to 25) and Cyber Monday. Cart add-ons at full price: glove $17.95, towel $24.99.'
WHERE act_id='act_378146126054294' AND season='2026' AND key='bf';

UPDATE p_season_phase SET
 offer='December, through Dec 24: no gift. Full price, order by Dec 13 (standard) or Dec 16 (expedited). Leftover gloves, towels and divot tools sell as stocking stuffers and cart add-ons. Gift cards: structure TBD with Nick.',
 detail='Cole: no gift with every order through December; at ~936 December orders it would need an absurd amount of stock.'
WHERE act_id='act_378146126054294' AND season='2026' AND key='gift';

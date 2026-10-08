-- Lucky Golf, 2026-10-08: ONE offer, decided from scratch after Cole (rightly) called the last version
-- overcomplicated. All season: a free towel with any club (in the club box, $5.04, nothing to pick).
-- Black Friday week adds: buy 2 clubs $50 off, buy 3 or more $100 off. No kit, no tiers on the gift, no
-- gates in the customer offer. Gloves and divot tools sell at full price. Plan B stays internal only.
-- Towels: 600 coming, ~1,200 needed through Dec 24, order ~600 more now with express. Run once.

UPDATE p_season_phase SET name='Early Bird: free towel with any club (proposed)',
 offer='Free towel with any club. Through Nov 16.',
 detail='The same gift runs all season, so the email team says one line. One wedge leaves $59 before ads (breakeven 1.67x). Towel $5.04, rides in the club box.'
WHERE act_id='act_378146126054294' AND season='2026' AND key='list';

UPDATE p_season_phase SET
 offer='PROPOSED: Free towel with any club. Buy 2 clubs, take $50 off. Buy 3 or more, take $100 off. Plus the black Eclipse putters, first time on sale.',
 detail='Per order before ads: one wedge $59 (1.67x), two wedges $85 (1.75x), three wedges $110 (1.80x), one Mallet $172 (1.34x), Mallet + wedge $197 (1.41x), Mallet + 2 wedges $222 (1.47x). Last year one wedge at ~$70 left $36 (1.93x). Weekend forecast at 2025 traffic: ~$77k base, $61k to $94k, profitable above about 1.7x. Same offer for early access (Nov 24 to 25, list only) and Cyber Monday.'
WHERE act_id='act_378146126054294' AND season='2026' AND key='bf';

UPDATE p_season_phase SET
 detail='Internal backup only, not part of the email plan: if Friday 2pm is under $9k, two clubs get a free Carver instead of $50 off (one pre-written email).'
WHERE act_id='act_378146126054294' AND season='2026' AND key='planb';

UPDATE p_season_phase SET
 detail='Cyber Monday runs the same offer as Black Friday. If the winter apparel is in by then, it drops the same day at full price; otherwise it launches Dec 3 to 4.'
WHERE act_id='act_378146126054294' AND season='2026' AND key='drop';

UPDATE p_season_phase SET
 offer='December, through Dec 24: free towel with any club, same as November. Gift cards: structure TBD with Nick.',
 detail='One gift all season. Needs the second towel order to land before Thanksgiving.'
WHERE act_id='act_378146126054294' AND season='2026' AND key='gift';

UPDATE p_season_phase SET
 offer='Win it for your whole foursome: all four of you get three Carvers, the first black Eclipse putters, the Stryker and a polo. Enter free. Tag your three buddies for extra entries. (Name TBD.)'
WHERE act_id='act_378146126054294' AND season='2026' AND key='early';

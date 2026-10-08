-- Lucky Golf, 2026-10-08: the final, simple version after Cole asked for one clear answer.
-- Black Friday: NO kit. Hat with any club (one per order), cover with every putter, $50 off 2, $100 off 3.
--   The kit added ~$8 to every order with no proof it adds orders (it needed ~10% more orders just to pay for itself).
-- Early Bird: hat + the new towel with any club (full price, so the extra $5 is easily covered).
-- Divot tool: the December gift-card gift. Plan B: two clubs get a free Carver instead of $50 off. Run once.

UPDATE p_season_phase SET name='Early Bird: free hat + the new towel with any club (proposed)',
 offer='Buy any club, get a free hat and our new towel. No minimum, nothing to pick. Through Nov 16.',
 detail='Full price, so the gift is easily covered: one wedge leaves $53 before ads (breakeven 1.86x). Needs about 200 towels. GATE Oct 28: towels at the warehouse, else open with the hat and add the towel the day it lands.'
WHERE act_id='act_378146126054294' AND season='2026' AND key='list';

UPDATE p_season_phase SET
 offer='PROPOSED: Buy any club, get a free hat. Every putter comes with its cover. Buy 2 clubs, take $50 off. Buy 3 or more, take $100 off (3 Carvers for the price of 2). Eclipse Black putters on sale for the first time. Retired polos $39 while they last.',
 detail='No kit on Black Friday (it cost ~$8 an order with no proof it adds orders). Per order before ads: one wedge $58 (breakeven 1.70x), two wedges $84 (1.77x), three wedges $109 (1.81x), putter orders $166 to $216 (1.38x to 1.51x). 2025 for comparison: one wedge at ~$70 left $36 (1.93x). Forecast Fri-Mon at 2025 traffic: ~$77k base, $61k to $94k; profitable above about 1.7x.'
WHERE act_id='act_378146126054294' AND season='2026' AND key='bf';

UPDATE p_season_phase SET
 detail='The efficient escalation: a free Carver costs $22 against $50 off and shows $99 of value. Two wedges then leave $110 instead of $84 (breakeven 1.81x).'
WHERE act_id='act_378146126054294' AND season='2026' AND key='planb';

UPDATE p_season_phase SET
 offer='Proposed: a free Lucky divot tool with any gift card. Structure TBD with Nick.'
WHERE act_id='act_378146126054294' AND season='2026' AND key='gift';

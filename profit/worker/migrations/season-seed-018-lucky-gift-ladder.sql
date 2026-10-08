-- Lucky Golf, 2026-10-08: back to the gift ladder from the Oct 7 call, now that Cole can express-order polos.
-- Cole and Nick agreed on the call: "buy 1 club free hat, 2 clubs hat + polo, 3 clubs hat + polo + a free
-- wedge" (Nick: "something like that is much easier"); the only blocker was polo stock. With one gift polo
-- express-ordered in a full size run, the gift ladder leaves MORE per order than the dollar ladder (polo and
-- a Carver cost less than $50 / $100 off) and reads bigger (up to $195 of free gear). GATE Oct 31: the polos and
-- hats are shipped with tracking and land by Nov 18, or Black Friday falls back to the dollar ladder (seed 016).
-- One hat per ORDER, not per club. Proposed until Cole sends Nick the final. Run once.

UPDATE p_season_phase SET name='Early Bird: hat with a club, polo with two (proposed)',
 offer='Buy a club, get a free hat. Buy 2 clubs, get a free hat and a free polo. The four sets (Hat Trick, Up and Down, Blackout, Whole Lucky Bag) all clear two clubs, so every set gets both.',
 detail='Replaces the $150 hat (Cole: does not move the needle; hats barely sell on their own, about 119 orders in 14 months). The Early Bird polo comes from the polos already on hand, the designs being retired, while sizes last (about 530 in stock, mostly M and L; Early Bird needs about 70). Black Friday adds the third rung, so Black Friday is still the bigger deal.'
WHERE act_id='act_378146126054294' AND season='2026' AND key='list';

UPDATE p_season_phase SET
 offer='PROPOSED: Buy a club, get a free hat. Buy 2 clubs, get a hat and a polo. Buy 3 clubs, get a hat, a polo and a free Carver. Every putter also comes with its cover. Up to $195 of free gear, and no club is marked down. Plus the Eclipse Black putters, first time on sale.',
 detail='The call version (Cole and Nick, Oct 7). One of each gift per order. The polo is ONE design (Signature Black, express-ordered, full size run) so the only pick is the size; the hat auto-adds (swap optional); the free Carver needs a loft pick. Leaves $58 (1 wedge) to $224 (Mallet + wedge) per order before ads, breakeven 1.5x to 1.8x, more than the dollar ladder at every rung, assuming a $15 polo. GATE Oct 31: polos and hats shipped with tracking, landing by Nov 18. If not, fall back to: free hat every club, $50 off 2, $100 off 3.'
WHERE act_id='act_378146126054294' AND season='2026' AND key='bf';

UPDATE p_season_phase SET
 detail='Cyber Monday gives a new reason to come back (Nick, Oct 7). GATE Nov 20: if the winter apparel is at the warehouse, it drops Monday at full price beside the club offer; if not, Monday only, the free Carver comes with 2 clubs instead of 3. Winter apparel then launches members Dec 3, everyone Dec 4, every November buyer first. December teases the gift of the year (the driver) with no name or date.'
WHERE act_id='act_378146126054294' AND season='2026' AND key='drop';

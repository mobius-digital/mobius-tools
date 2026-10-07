-- Lucky Golf, 2026-10-07: after the call with Nick Yates and Nikola (Fireflies 01M49ACFZ1N9K6N6KVVVJPCGN0).
-- SETTLED on the call: 48 hours of early access Tue Nov 24 + Wed Nov 25 for the list, full launch to
-- everyone on Thanksgiving Thu Nov 26; giveaway runs now to Nov 16; winter apparel right after Cyber
-- Monday; Nick builds ~40 emails on ONE offer that cannot change on Thanksgiving, so the offer may only
-- use stock that is guaranteed. REOPENED: the Black Friday offer (Nick: "buy 2 get a Carver" reads like
-- any July 4th promo) and the Early Bird. Polos come out of every offer (new order may miss the date,
-- stock in hand is broken sizes). The ladder below is the recommendation, status proposed until Cole
-- sends Nick the final (target: next week). Run once.

UPDATE p_season_phase SET name='Early access, 48 hours (list only)', start='2026-11-24', end='2026-11-25', status='locked',
 who='The early-access list, by private link',
 offer='The full Black Friday offer two days early, and first pick of the Eclipse Black putters.',
 detail='Decided on the Oct 7 call (Nick): 48 hours Tue Nov 24 + Wed Nov 25, then the full list on Thanksgiving. Private link + members-only collection, store stays open at normal prices. No driver, no irons.'
WHERE act_id='act_378146126054294' AND season='2026' AND key='access';

UPDATE p_season_phase SET name='Black Friday to Cyber Monday (offer proposed)', start='2026-11-26', end='2026-11-30', status='proposed',
 offer='PROPOSED: every club comes with a free hat (while they last). Buy 2 clubs, take $50 off. Buy 3 or more, take $100 off. The Eclipse Black putters on sale for the first time.',
 detail='Reopened on the Oct 7 call. Why this shape: last Black Friday weekend was 659 orders and about 1.2 clubs an order (588 wedges in 459 wedge orders), so most buyers buy ONE club; the offer has to give that buyer something (the hat) and the ladder exists to move some to two. Dollars off need no stock and no clicks; hats are about 890 in hand across 10 designs, enough for the window if Early Bird does not give them on every order. Same money as "buy 2 get a Carver free" at three clubs, reads like Black Friday (Nick), and never a small percent off (Cole). Launch Thanksgiving 8am CT to the full list; Monday adds the Cyber Monday reason (see drop).'
WHERE act_id='act_378146126054294' AND season='2026' AND key='bf';

UPDATE p_season_phase SET name='Plan B (add-on, only if Friday 2pm is under $9k)', status='proposed',
 offer='Add to the ladder, never replace it: $25 off any single club, Friday 2pm to Monday.',
 detail='Nick, Oct 7: the emails are built on one offer and cannot change mid-weekend, so a different Plan B offer would contradict 40 emails. Plan B makes the same ladder stronger at its weakest rung (the one-club order) and gets one extra send. Ads swap to the Plan B creative set.'
WHERE act_id='act_378146126054294' AND season='2026' AND key='planb';

UPDATE p_season_phase SET name='Early Bird (offer proposed)', status='proposed',
 offer='PROPOSED: spend $200, get a free hat. Plus three ready-made sets that cross $200 on their own: the Wedge Set, the Short Game Set, the Full Lucky Bag.',
 detail='Nick, Oct 7: a spend threshold for the free hat (not every order) and 3 to 5 themed bundles as the AOV play. Threshold keeps hats for Black Friday. The sets double as the test Cole wanted: if people buy two or three clubs at once in early November, the Black Friday ladder will work; read it Nov 10. Sets need few clicks: hand and loft only, the hat auto-adds.'
WHERE act_id='act_378146126054294' AND season='2026' AND key='list';

UPDATE p_season_phase SET
 detail='Winter apparel launches right after Cyber Monday (Cole, Oct 7). GATE Nov 20: if the new apparel is at the warehouse, it becomes the Cyber Monday drop (Nick: a drop on Cyber Monday gives the emails something new and brings back non-buyers); if not, Cyber Monday is the last day of the ladder and the apparel launches here, members Dec 3, everyone Dec 4. ' || detail
WHERE act_id='act_378146126054294' AND season='2026' AND key='drop';

UPDATE p_season_answer SET value =
'AFTER THE NICK CALL, Oct 7: settled = giveaway now to Nov 16, Early Bird Nov 1 to 16, list week Nov 17 to 23, early access 48h Tue Nov 24 + Wed Nov 25, full launch Thanksgiving, Cyber Monday, winter apparel after. Reopened = the Black Friday and Early Bird offers; polos out of every offer. Rule from Nick: one offer, built on guaranteed stock, explainable in two sentences, few clicks. Recommendation in Season (proposed): free hat with every club + $50 off 2 clubs + $100 off 3. Cole sends Nick the final by next week.

' || value
WHERE act_id='act_378146126054294' AND season='2026' AND key='strategy_note';

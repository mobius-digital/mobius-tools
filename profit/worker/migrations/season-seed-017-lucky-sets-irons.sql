-- Lucky Golf, 2026-10-07 (evening): the Early Bird made specific, and an irons phase proposed.
-- Early Bird threshold moves from $200 to $150 because two Carvers ($198) missed $200. Sets are full
-- price; the free gear is the deal. Irons date is a proposal pending the set price and a landed date.
-- Run once.

UPDATE p_season_phase SET name='Early Bird: free hat at $150, plus four sets (proposed)',
 offer='Spend $150, get a free hat. Four sets, all full price with the gear free: The Hat Trick (any 3 Carvers, $297, hat). The Up and Down (2 Carvers + Eclipse Mallet, $427, hat + mallet cover). The Blackout (2 Carver 02 Black, $218, Black & Gold hat). The Whole Lucky Bag (3 Carvers + Eclipse Mallet + Stryker, $735, hat + mallet cover).',
 detail='One rule (spend $150, the hat auto-adds) and four shortcuts that clear it. No price cut on the sets; the gear is the deal (hat $29, cover $29.95). Nick asked for a spend threshold and 3 to 5 themed bundles with one big one. The Whole Lucky Bag is capped by Stryker stock (10 of one hand, 81 of the other; never say which in copy). If the sets sell by Nov 10, Black Friday buyers will take 2 or 3 clubs. Phrases: artifact DKSH1u9LXUVS1prAVVUeUF.'
WHERE act_id='act_378146126054294' AND season='2026' AND key='list';

INSERT OR REPLACE INTO p_season_phase (act_id, season, key, name, start, end, grp, who, offer, detail, status, sort, updated_at)
VALUES ('act_378146126054294', '2026', 'irons', 'The irons (date proposed)', '2027-02-09', '2027-02-16', 'late', 'Members Feb 9, everyone Feb 10',
 'The new iron sets at full price. Pre-order if stock lands after the date.',
 'Proposed Oct 7: five weeks after the Havoc driver (Jan 6 to 7) so each launch gets its own run of emails and ads, and ahead of spring when golfers buy irons. Needs by Jan 15: set price, what is in a set, shaft options, landed date. If they land later, move to early March. Copy waits for the new-product intake in the Lucky copy skill.',
 'draft', (SELECT sort + 1 FROM p_season_phase WHERE act_id='act_378146126054294' AND season='2026' AND key='ny'), datetime('now'));

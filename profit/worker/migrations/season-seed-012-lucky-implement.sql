-- Lucky Golf, 2026-10-06 later that night: Cole took the recommendations ("I'm liking what you have,
-- let's implement"). Prize renamed The Foursome Giveaway (he did not like Four Full Bags), the Early
-- Bird is "buy any club, get 10 entries" Nov 1 to 16 on the list key, gift cards are free gear not
-- bonus value. Still open: one day vs 48 hours of early access (Nick call Oct 7). Run once.

UPDATE p_season_phase SET name='The Foursome Giveaway, then member signup',
 offer='The Foursome Giveaway. Every Lucky club. All four of you. Three Carvers, an Eclipse putter, the Stryker, a polo and a hat, times four. Enter free.',
 detail=replace(detail, 'Name still to pick: "Four Full Bags" is the working one.', 'Name: The Foursome Giveaway. Headline: "Every Lucky club. All four of you." From Nov 1 every club bought adds 10 entries (the Early Bird).')
WHERE act_id='act_378146126054294' AND season='2026' AND key='early';

INSERT OR REPLACE INTO p_season_phase (act_id, season, key, name, start, end, grp, who, offer, detail, status, sort, updated_at)
VALUES ('act_378146126054294', '2026', 'list', 'Early Bird: buy any club, get 10 entries', '2026-11-01', '2026-11-16', 'nov', 'Everyone, full price',
 'Buy any club in November and get 10 entries into The Foursome Giveaway. One entry is free; a club is ten.',
 'The warm-up without a markdown or a free gift: it sells clubs, feeds the giveaway and costs nothing. Three ads to the entrants and the Carver evergreen audiences; the rule on the giveaway page; entries credited by order tag. Two emails (Nov 1 launch, Nov 14 last call). Ends with the giveaway on Nov 16. Chosen over a free hat and over a price-lock promise (Cole, Oct 6 late).',
 'locked', (SELECT sort + 1 FROM p_season_phase WHERE act_id='act_378146126054294' AND season='2026' AND key='early'), datetime('now'));

UPDATE p_season_phase SET name='Gift cards: free gear with every card',
 offer='Buy a $100 gift card, get a free hat. Buy a $200 card, get a free glove and hat.',
 detail='Free gear, not bonus value: a "spend 50 get 75" card is a 33% discount on January''s driver the day it is redeemed, and Lucky''s rule is prices never drop. Cards lead every channel Dec 17 to 24. Website decides whether the gift ships with the card email or on the first order.'
WHERE act_id='act_378146126054294' AND season='2026' AND key='gift';

UPDATE p_season_answer SET value =
'IMPLEMENTED Oct 6 late (Cole: "I like what you have, implement it"): prize renamed THE FOURSOME GIVEAWAY, headline "Every Lucky club. All four of you." One polo + one hat each. Early Bird Nov 1 to 16 = buy any club, get 10 entries (no hat, no price-lock). Gift cards = free hat at $100, glove + hat at $200, no bonus value. Still open for Nick Oct 7: one day vs 48 hours of early access.

' || value
WHERE act_id='act_378146126054294' AND season='2026' AND key='strategy_note';

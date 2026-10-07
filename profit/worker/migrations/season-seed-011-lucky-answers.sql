-- Lucky Golf, 2026-10-06 night: Cole's answers to the rethink. Giveaway starts as soon as the page
-- and photo exist; the Eclipse Black putters become the Black Friday exclusive (announced in
-- November, the list gets them first); the driver goes back to January and the irons wait.
-- Early Bird offer and the gift-card structure are still open (Nick call Oct 7). Run once.

UPDATE p_season_phase SET start='2026-10-14',
 offer='Four Full Bags: all four of you get three Carvers, an Eclipse putter, the Stryker, a polo and a hat. Enter free.',
 detail='Starts the day the page and the prize photo exist (target Oct 14), runs to Nov 16 (winner picked Nov 16, announced Nov 19). Email + phone to enter. Goal 8,000 to 10,000 entries at $2.50 to $3 a lead, $20k to $30k. Separate Klaviyo list, tracked as a segment so we see what the entrants buy by Dec 31. Prize cost about $700 (clubs at cost + a polo and hat each). Name still to pick: "Four Full Bags" is the working one.'
WHERE act_id='act_378146126054294' AND season='2026' AND key='early';

UPDATE p_season_phase SET name='Eclipse Black: announced, Black Friday only', start='2026-11-09', end='2026-11-25', who='Announced to everyone, sold only on Black Friday, the list first',
 offer='The Eclipse Blade and Mallet in black. Shown in November, not sold until Black Friday. Join the list and you get them a day before anyone else.',
 detail='Cole, Oct 6: the black putters are the way in. They are announced mid-November and held for Black Friday, so the only way to be first is the early-access list. Stock lands mid-November. Ads: the reveal video + "join the list" as the only ask.', status='locked'
WHERE act_id='act_378146126054294' AND season='2026' AND key='putters';

UPDATE p_season_phase SET
 offer='Members first: the whole Black Friday offer and first pick of the Eclipse Black putters, before anyone else.',
 detail='Not a locked store: private link + members-only collection from 8am CT. Open question from the rethink: one Thursday or 48 hours (Tue Nov 24 + Wed Nov 25) like Dartee. The driver and the irons are NOT part of this (Cole, Oct 6: they wait).'
WHERE act_id='act_378146126054294' AND season='2026' AND key='access';

UPDATE p_season_phase SET
 offer='Buy any 2 clubs, get a Carver 02 Gold free. Free hat with every order. First 400 orders get a polo. The Eclipse Black putters, on sale for the first time.',
 detail='Fri 8am CT to Mon 11:59pm CT. Prices never drop. The bundle is the lead creative from 8am Friday. One hat per ORDER (simpler than one per club). Eclipse Black is the launch inside the weekend. When the 400 polos are gone: hat only, say so. Cyber Monday: everything above plus a Tour glove in every order. Driver and irons are not in the weekend (Cole, Oct 6).'
WHERE act_id='act_378146126054294' AND season='2026' AND key='bf';

UPDATE p_season_phase SET name='The Havoc driver', start='2027-01-06', end='2027-01-07', status='locked', who='Members Jan 6, everyone Jan 7',
 offer='The new driver at full price. Name revealed Jan 6.',
 detail='Back to January (Cole, Oct 6: the driver and the irons wait). December may tease it as the gift of the year without a name or a date. Irons follow the driver; timing open.'
WHERE act_id='act_378146126054294' AND season='2026' AND key='ny';

UPDATE p_season_answer SET value =
'COLE''S ANSWERS, Oct 6 night: giveaway starts as soon as the page and photo exist (Oct 14 target). Prize = three Carvers + an Eclipse putter + the Stryker + a polo + a hat for all four ("Four Full Bags", name still open; one polo and one hat each keeps the prize honest and the cost near $700). Eclipse Black putters = announced in November, sold only on Black Friday, the list gets them first (that is the reason to join). Black Friday = buy 2 clubs get a Carver free + one free hat per order + 400 polos. Driver back to January, irons wait. Apparel in December, yes. OPEN for the Nick call Oct 7: the Early Bird offer (free hat with any club, or the buy-a-club-get-10-entries tie-in, or price-lock), 24 hours vs 48 hours of early access, and the gift-card structure (bonus-value cards vs free gear).

' || value
WHERE act_id='act_378146126054294' AND season='2026' AND key='strategy_note';

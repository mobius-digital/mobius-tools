-- Lucky Golf, 2026-10-06 late: Cole wants the prize copy redone properly and everything he has not
-- discussed with Nick marked TBD until the Oct 7 call. Prize name, Early Bird and gift cards go to
-- proposed/TBD; the rest stays as decided. Run once.

UPDATE p_season_phase SET name='The foursome giveaway (name TBD with Nick)',
 offer='Win the whole Lucky lineup for your whole foursome: three Carvers, an Eclipse putter, the Stryker, a polo and a hat, times four. Enter free. (Headline options in the Nick doc.)'
WHERE act_id='act_378146126054294' AND season='2026' AND key='early';

UPDATE p_season_phase SET status='proposed', name='Early Bird: buy any club, get 10 entries (TBD with Nick)',
 detail='TBD with Nick Oct 7. ' || detail
WHERE act_id='act_378146126054294' AND season='2026' AND key='list';

UPDATE p_season_phase SET status='proposed', name='Gift cards (structure TBD with Nick)',
 offer='TBD with Nick Oct 7. Recommended: free hat with a $100 card, glove and hat with $200. Alternative: a small bonus (spend $200, get $225). Not a 50% bonus.',
 detail='Free gear keeps the January driver at full price when the card is redeemed; a big bonus card is a discount in disguise. Cards lead every channel Dec 17 to 24 either way.'
WHERE act_id='act_378146126054294' AND season='2026' AND key='gift';

UPDATE p_season_answer SET value =
'TBD WITH NICK Oct 7 (Cole, Oct 6 late): the prize name and headline, the Early Bird (10 entries per club), the gift-card structure, and one day vs 48 hours of early access. Decided and not up for debate: giveaway starts Oct 14, Eclipse Black announced in November and sold only on Black Friday with the list first, bundle + one hat per order + 400 polos, driver Jan 6/7, irons later, apparel in December.

' || value
WHERE act_id='act_378146126054294' AND season='2026' AND key='strategy_note';

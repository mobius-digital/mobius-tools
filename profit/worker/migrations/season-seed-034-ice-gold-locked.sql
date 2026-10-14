-- Ice & Gold, 2026-10-14 (Cole: "lock in offer on Locus"). Agreed with Fela in #ice-gold on Oct 13
-- (thread 1791903002.395879): studs threshold $125 (her AOV), $ off tiers, no gift box (too late for her),
-- bundle does not stack, last ship date Dec 18. Run once.
UPDATE p_season_phase SET name='Early Bird', who='Everyone', status='locked',
 offer='Free pair of studs on any order over $125. Everything else full price.',
 detail='Locked with Fela Oct 13. She raised the threshold from $100 to $125 (her AOV). New studs listing ready in about 2 weeks; studs go to creators so they film by about Oct 27. Ads and emails push it; from the second email on, tell the list early access is coming. Pick Any 4 for $150 stays live through year end and is separate.'
WHERE act_id='brand_ice_and_gold' AND season='2026' AND key='early';
UPDATE p_season_phase SET who='Email and SMS list only', status='locked',
 offer='The list gets the Black Friday deal 24 hours early.',
 detail='Locked Oct 13. Dahaus sends 4 emails a month, Fela sends SMS (and plain-text emails if Dahaus will not add sends). Emails: Nov 2 studs offer starts, Nov 23 early access is Thursday, Nov 26 early access is live, Nov 27 Black Friday is live. SMS from Fela: Nov 26 midday, Nov 28 weekend reminder, Nov 30 Cyber Monday last call.'
WHERE act_id='brand_ice_and_gold' AND season='2026' AND key='access';
UPDATE p_season_phase SET status='locked',
 offer='Spend $100 save $25. Spend $200 save $60 + free studs. Spend $300 save $100 + free studs.',
 detail='Locked with Fela Oct 13. No gift box (too late for her to get them ready). Dollars off, not percent: tiers get people adding one more piece. Studs only at $200 and up so the November $125 studs offer still has a reason. The 4 for $150 bundle stays as is and does not stack with the tiers. Fela: the biggest offer she has ever run.'
WHERE act_id='brand_ice_and_gold' AND season='2026' AND key='bf';
UPDATE p_season_phase SET name='Gifting', start='2026-12-04', end='2026-12-18', status='locked', who='Everyone',
 offer='Gift sets at full price, free gift wrap with a name on every order, "order by Dec 18" in every ad.',
 detail='Locked Oct 13. Last ship date for Christmas is Dec 18 (Fela). Three sets: for her, for him, the pair. Name on the gift wrap: a "Name for the gift" text box on the gift wrap product page (theme or Easify Product Options); waiting on Fela''s gift wrap product link.'
WHERE act_id='brand_ice_and_gold' AND season='2026' AND key='drop';
UPDATE p_season_phase SET status='skip',
 detail='Merged into Gifting (Dec 4 to 18) once Fela set the Dec 18 last ship date.'
WHERE act_id='brand_ice_and_gold' AND season='2026' AND key='xmas';
UPDATE p_season_phase SET start='2026-12-19', end='2026-12-24', status='locked',
 offer='Gift cards lead every ad and email after the Dec 18 cutoff.'
WHERE act_id='brand_ice_and_gold' AND season='2026' AND key='gift';
UPDATE p_season_phase SET
 offer='Proposal: gifts for a partner (heart pieces like the Lariat Heart Set, a his-and-hers pick), free gift wrap with their name, list gets first access. No discount.',
 detail='Sent to Fela Oct 13, not confirmed. Pieces get locked in December.'
WHERE act_id='brand_ice_and_gold' AND season='2026' AND key='vday';
UPDATE p_season_answer SET value='Dahaus sends emails (4 a month); Fela sends SMS herself and may send plain-text emails.'
WHERE act_id='brand_ice_and_gold' AND season='2026' AND key='email_owner';

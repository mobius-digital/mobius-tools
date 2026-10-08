-- Lucky Golf, 2026-10-08: Cyber Monday decided with Nick: same deal, plus a $20 credit (Nick fine with $10 or $20)
-- only to list members who did not buy Nov 24 to 29. Email/SMS only, ends midnight Monday, stacks with the
-- $50/$100 off. Plan B (Friday 2pm under $9k) stays: two clubs get a free Carver instead of $50 off. Run once.
UPDATE p_season_phase SET
 detail='Cyber Monday = same deal, last day, plus a $20 credit only for list members who did not buy Nov 24 to 29 (email and SMS only, ends midnight, stacks with the $50 / $100 off). Shopify store credit lets the email say "we added $20 to your account"; a Klaviyo unique code says "your $20 is in the link". Winter apparel also drops Monday if it is in by Nov 20, otherwise Dec 3 to 4.'
WHERE act_id='act_378146126054294' AND season='2026' AND key='drop';

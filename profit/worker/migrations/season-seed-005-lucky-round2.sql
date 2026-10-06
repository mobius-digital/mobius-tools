-- Lucky Golf, 2026-10-06 round 2: the Thursday lockdown verdict, the sheet, and goals that match it.
-- Prepends to the strategy note (keeps what Cole may have edited below). Run once.
UPDATE p_season_answer SET value =
'DECISIONS, Oct 6 (round 2)
The working sheet (deals in the customer''s words, money per order, recalculating season model, lockdown evidence): https://claude.ai/artifact/2KAw7y5U9HJsXpyqkp8V1V
THURSDAY: do NOT close the store. Lucky is 15 to 25% returning customers, the reachable list is about 28k emails + 1.8k SMS, and email + SMS made $12.8k of last year''s $72k weekend. A closed door only pays when the list alone can carry a big day. Members get the full offer a day early on a private link and a members-only collection; the public site stays open at normal prices with no deal showing. Revisit a real lockdown at 75k+ list and a third of orders returning.
NUMBERS: the account has run at about 2.1x paid MER all of 2026 (Shopify net sales / Meta + Google). 2024 BF season was 2.8x, 2025 was 1.9x. The plan is $330k on about $120k of paid at 2.75x (about +$52k contribution after everything); the same plan at today''s 2.1x costs $157k of ads and makes about +$15k. The gap between those two columns is the whole job: bundle lead, 5,000 giveaway entries, black putters in stock by Nov 20, no discount to cold traffic, Meta cap raised the week of Nov 9.

' || value
WHERE act_id = 'act_378146126054294' AND season = '2026' AND key = 'strategy_note';

INSERT OR REPLACE INTO p_season_answer (act_id, season, key, value) VALUES
 ('act_378146126054294','2026','goals',
 '{"early":220000,"bf":110000,"dec":110000,"total":330000,"be":1.56,"target":3.0,"s50":3.5,"s100":4.0,"start":10000,"cap":12982,"note":"Plan from the Oct 6 sheet: Nov $220k (Cyber Monday is Nov 30, so the $110k weekend sits inside November), Dec $110k, $330k on about $120k paid at 2.75x. Target MER 3.0 on the weekend. Ladder from the 2025 sheet; confirm before Nov 13."}');

-- The Thursday phase reads as members-first, not a locked store.
UPDATE p_season_phase SET
 name = 'Members first (Thursday)',
 who = 'Members, by private link. Store stays open to everyone at normal prices.',
 offer = 'Members get the whole Black Friday offer a day early, plus first pick of the Eclipse Black putters.',
 detail = 'NOT a locked store (decided Oct 6: 15 to 25% returning, 28k list, email made 18% of last year''s weekend). The offer lives on a private link and a members-only collection from 8am CT Thursday; the public site shows normal prices and no deal until 8am Friday. Email 7:55am CT, text 8am local.'
WHERE act_id = 'act_378146126054294' AND season = '2026' AND key = 'access';

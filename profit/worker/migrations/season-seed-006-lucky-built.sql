-- Lucky Golf, 2026-10-06: Cole said "everything arrives mid November, build it".
-- Everything = Eclipse Black putters, the Havoc driver, the new irons, the new apparel.
-- The season is rebuilt around those launches. Run once; people edit in Locus after this.

-- 1. The giveaway ends when the putters land; member signup runs with the launch.
UPDATE p_season_phase SET end='2026-11-18',
 offer='Enter free to win the Lucky Bag. Then join free to shop the launches and Black Friday a day early.',
 detail='Giveaway Oct 29 to Nov 15 (winner picked Nov 16, announced Nov 19 with the putter launch). Member signup Nov 16 on. No discount anywhere. Every entrant joins the list. KPI: 5,000 entries.'
WHERE act_id='act_378146126054294' AND season='2026' AND key='early';

-- 2. New: the Eclipse Black putter launch, members a day early.
INSERT OR REPLACE INTO p_season_phase (act_id, season, key, name, start, end, grp, who, offer, detail, status, sort) VALUES
 ('act_378146126054294','2026','putters','Eclipse Black putters launch','2026-11-19','2026-11-25','nov','Members Thu Nov 19, everyone Fri Nov 20',
  'The Eclipse Blade and Mallet in black. Full price, members get them a day early.',
  'Stock lands mid-November (Cole, Oct 6). Launch is November''s event: a new product sells at full price, a discount cannot. Members-only link Thursday 8am CT, public Friday 8am. The Blade is out of stock today, so this is also the restock. Ads: launch video + the giveaway winner announcement the same day.','locked',5);

-- 3. Thursday: members first for the whole offer AND the driver + irons.
UPDATE p_season_phase SET
 offer='Members first: the whole Black Friday offer, the Havoc driver and the new irons, a day before anyone else.',
 detail='NOT a locked store (Oct 6: 15 to 25% returning, 28k list, email made 18% of last year''s weekend). Private link + members-only collection from 8am CT Thursday; public site shows normal prices and no deal until 8am Friday. The driver and irons are on sale for the first time here. Email 7:55am CT, text 8am local.'
WHERE act_id='act_378146126054294' AND season='2026' AND key='access';

-- 4. Black Friday: the bundle leads, the launches ride along at full price, Monday adds the glove.
UPDATE p_season_phase SET
 offer='Buy any 2 clubs, get a Carver 02 Gold free. Free hat with every club. First 400 orders get a polo. The Havoc driver and the new irons, on sale for the first time, full price.',
 detail='Fri 8am CT to Mon 11:59pm CT. Prices never drop. The bundle is the lead creative from 8am Friday (not a 2pm fallback). Driver + irons count as clubs in the bundle (buy driver + any club, Carver free). Cyber Monday: everything above plus a Tour glove in every order, the list gets it at 7am. When the 400 polos are gone: hat only, say so on the site. Returned club = polo comes back.'
WHERE act_id='act_378146126054294' AND season='2026' AND key='bf';

-- 5. Plan B is the wedge-only markdown, held behind the Friday 2pm trigger.
UPDATE p_season_phase SET name='Plan B (only if Friday 2pm is under $9k)',
 offer='30% off wedges, this weekend only. Never sitewide, never putters, never the driver.',
 detail='Trigger: Friday 2pm CT sales under about $9k with the bundle already live. Built ahead, switched off until needed. A 30%-off wedge still clears about $30 of contribution before ads; a sitewide 50% like last Saturday does not.'
WHERE act_id='act_378146126054294' AND season='2026' AND key='planb';

-- 6. Apparel after the weekend, to the November list; the driver is December''s gift.
UPDATE p_season_phase SET end='2026-12-16',
 offer='The new apparel at full price. Members Dec 3, everyone Dec 4. The Havoc driver as the gift of the year.',
 detail='Stock lands mid-November, held back on purpose: the audience for a $67 polo is the 3,000 people who just bought a club plus the giveaway list, and reaching them costs almost nothing. Retarget every November buyer. Order-by messaging starts Dec 7 (Dec 13 standard, Dec 16 expedited).'
WHERE act_id='act_378146126054294' AND season='2026' AND key='drop';

UPDATE p_season_phase SET start='2026-12-07', end='2026-12-16',
 offer='Full price. Order by Dec 13 standard, Dec 16 expedited. Driver and putters as the gift.',
 detail='Cutoff in every ad and email. Gift guide: driver, black putter, bundle. Dec 2025 did $3k to $5k a day here.'
WHERE act_id='act_378146126054294' AND season='2026' AND key='xmas';

-- 7. Run-back locked; January becomes the full-bag story.
UPDATE p_season_phase SET status='locked', who='Giveaway entrants and November visitors who did not buy',
 offer='The bundle one more time, only to people who did not buy.',
 detail='Email + retargeting only, no cold spend. Same bundle, no new discount.'
WHERE act_id='act_378146126054294' AND season='2026' AND key='boxing';

UPDATE p_season_phase SET name='New year: the full bag', start='2027-01-06', end='2027-01-12', status='draft',
 who='Members Jan 6, everyone Jan 7',
 offer='Driver + irons + putter + wedges as one bag story. Full price, fitting content, iron sets.',
 detail='The driver launched on Black Friday, so January is the second wave: iron sets, the full-bag build, fitting videos. Proposed; confirm once iron set pricing is known.'
WHERE act_id='act_378146126054294' AND season='2026' AND key='ny';

-- 8. Goals that match the built plan.
INSERT OR REPLACE INTO p_season_answer (act_id, season, key, value) VALUES
 ('act_378146126054294','2026','goals',
 '{"early":280000,"bf":140000,"dec":120000,"total":400000,"be":1.56,"target":3.0,"s50":3.5,"s100":4.0,"start":10000,"cap":12982,"note":"BUILT Oct 6 with everything landing mid-November: Nov $280k (giveaway $50k, putter launch week $70k, Thursday $18k, the weekend $140k), Dec $120k. $400k on about $142k paid at 2.8x, about +$65k contribution; the same plan at today''s 2.1x is $190k of ads and about +$17k. Ladder from the 2025 sheet; confirm before Nov 13. Sheet: https://claude.ai/artifact/2KAw7y5U9HJsXpyqkp8V1V"}');

UPDATE p_season_answer SET value =
'BUILT Oct 6: everything (Eclipse Black putters, Havoc driver, irons, apparel) lands mid-November, so the season is built around the launches. Putters launch Nov 19/20 as November''s event. The driver and irons go on sale for the first time Thursday for members and Friday for everyone, full price, and count as clubs in the bundle. Apparel is held to Dec 4 for the November buyers. January is the full-bag story. Plan $400k Nov + Dec. The sheet has the rows: https://claude.ai/artifact/2KAw7y5U9HJsXpyqkp8V1V

' || value
WHERE act_id='act_378146126054294' AND season='2026' AND key='strategy_note';

INSERT OR REPLACE INTO p_season_answer (act_id, season, key, value) VALUES
 ('act_378146126054294','2026','inventory','Everything lands mid-November (Cole, Oct 6): Eclipse Black Blade + Mallet, the Havoc driver, the new irons, the new apparel. On hand today: Carver 02 Gold 2,368, Carver 02 Black 627, Eclipse Mallet 331, Eclipse Blade 0 (minus 7), LGD01 driver 82, Stryker 94, about 600 polos, about 1,100 hats. Still needed: PO quantities and the iron set price, the 400 polos + hats + gloves for the gifts (order due Oct 16).');

-- Lucky Golf: the full BFCM 2026 plan, top to bottom, with the forecast and contribution margin
-- (written 2026-10-06 after Cole asked "what is the plan, what do you expect, can we hit $500k").
-- Sources: Shopify net sales by month and by day, Lucky Ledger (QuickBooks history for ads, COGS,
-- fulfilment; 2026 transactions for ad spend), Shopify unit costs. INSERT OR REPLACE: do not re-run
-- after anyone edits the note or the goals in Locus.
INSERT OR REPLACE INTO p_season_answer (act_id, season, key, value) VALUES
 ('act_378146126054294','2026','strategy_note',
'THE PLAN IN ONE BREATH
November is for the list and the launch, not a sale. Thursday belongs to members. Friday to Monday the price never drops but the box gets bigger (bundle + hat + polos). December sells gifts at full price to the people November found. January launches the driver.

WHAT THE LAST TWO YEARS TAUGHT US (Shopify net sales, ledger ad spend)
2024 Nov+Dec: $269k on $105k ads (2.6x). Contribution after ads about +$57k (21%).
2025 Nov+Dec: $230k on $138k ads (1.7x). 30% off from Nov 15, 50% off from the Saturday night. Contribution after ads about $0. More spend, deeper discount, less money, and the early sale did nothing: Nov 20 to 26 ran $2k to $4k a day, the same as no sale.
The weekend is the whole month: Fri to Mon 2025 = $72k of November''s $119k. Cyber Monday was the best day both years.
What sells: wedges 52% of the season, putters 29%, hybrid 9%. Everything else is noise. 75 to 85% of weekend buyers are new.
Unit economics at full price: a $99 wedge costs $22; a $229 putter $37; the $299 driver $53. Contribution per order before ads: single club about $52, a 30%-off single club about $31, the buy-2-get-1 bundle about $101.

BEFORE BLACK FRIDAY (Oct 29 to Nov 25)
No early Black Friday sale. Instead: the Lucky Bag giveaway Oct 29 to Nov 15 (entries are the KPI: target 5,000), then member signup Nov 16 to 25 ("join free, shop Black Friday a day early"). Ads in November: giveaway entry ads (cheap leads), Carver evergreen, and the Eclipse Black putter launch IF the stock lands (that is November''s event; new product sells at full price, a discount cannot).

THURSDAY NOV 26: MEMBERS ONLY
Store locked to everyone else, 8am CT Thursday to 8am Friday. Members get the full offer first plus first pick of the black putters. Keep the lockdown: Thursday did $3.9k last year, so the cost is nothing and it is what the whole November list-build was for.

BLACK FRIDAY TO CYBER MONDAY (Nov 27 to 30)
Lead with the bundle from 8am Friday: buy any 2 clubs, get a Carver 02 Gold free. Every club ships with a free hat. First 400 orders get a polo. Prices never drop. Cyber Monday gets its own step-up in the same family (glove in every order, or a 24-hour putter + cover set), because Monday is the best day and the list needs a reason to come back. Plan B if Friday 2pm is under $9k with the bundle live: 30% off wedges only, never sitewide.

RIGHT AFTER CYBER MONDAY (Dec 1 to 3)
Ads keep the bundle through Tuesday (Dec 2 did $7k last year), then switch to the drop. Nothing new on the site.

DECEMBER (Dec 4 to 31), FULL PRICE
Dec 4: the apparel drop, members Dec 3, everyone Dec 4, retargeting every November buyer and giveaway entrant. Apparel goes after the weekend on purpose: the audience that buys it is the one November built, and a polo earns less per ad dollar than a club. Dec 7 to 16: order by Christmas (Dec 13 standard, Dec 16 expedited) with the cutoff in every ad. Dec 17 to 24: gift cards lead. Dec 26 to 31: the bundle again, only to giveaway entrants who did not buy.

JANUARY: Havoc driver, members Jan 6, everyone Jan 7. Irons when they land.

FORECAST (Nov + Dec, revenue / ads / contribution after ads)
Base, this plan with nothing new in stock: $255k / $120k / about +$13k.
PLAN (the goal in Locus): $340k / $150k (2.3x) / about +$33k. Needs the giveaway list, the bundle as the lead, black putters in stock by Nov 20, apparel Dec 4.
Stretch $500k: $500k / $255k (2.0x) / about +$21k. Needs the driver and irons in stock by Nov 20, the Meta cap raised, and ad spend doubled. Revenue doubles, profit does not: past about $350k each extra ad dollar brings back less than $2. And inventory caps it: every club on hand today is about $420k at full price (wedges $300k, putters $76k, driver $25k, hybrid $20k), and the Eclipse Blade is out of stock. $500k is physically impossible without the putter and driver POs landing in November.
The $200k that was on this page was the Sep 8 "per month" target, not a forecast.

THE LADDER (desk, trailing 3 hours blended MER): breakeven 1.56, target 3.0, scale 50% at 3.5, scale 100% at 4.0. Start $10k/day Friday; 2024 hit the $13k Meta cap, ask for the raise the week of Nov 9.'),
 ('act_378146126054294','2026','goals',
'{"early":180000,"bf":100000,"dec":160000,"total":340000,"be":1.56,"target":3.0,"s50":3.5,"s100":4.0,"start":10000,"cap":12982,"note":"PLAN tier from the 2026-10-06 forecast: Nov $180k (the BF weekend $100k of it), Dec $160k, $340k on about $150k ads at 2.3x, contribution after ads about +$33k. Stretch $500k needs driver + irons in stock by Nov 20 and ~$255k ads for ~+$21k. Ladder from the 2025 sheet; confirm before Nov 13."}');

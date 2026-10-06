-- Season 2026 seed (2026-10-05): what we knew per brand the day the tab shipped.
-- Sources: Lucky plan page + Asana "Lucky BFCM 2026"; Dartee #dartee-email (Nick, Cole, Justin, Oct 1-5);
-- Grunk Aug 25 call; Bonk Q4 Playbook answers (Aug 10) + Sep 15 #bonk-email; Party Patch #party-patch-internal.
-- Safe to re-run: every statement is INSERT OR REPLACE. Edits made in Locus after this date win; do not re-run blindly.

-- ---------- Lucky Golf (locked Sep 25) ----------
INSERT OR REPLACE INTO p_season_answer (act_id, season, key, value) VALUES
 ('act_378146126054294','2026','shape','access'),
 ('act_378146126054294','2026','strategist','Ahsan + Noma'),
 ('act_378146126054294','2026','buyer','Ahsan'),
 ('act_378146126054294','2026','email_owner','Nick'),
 ('act_378146126054294','2026','approver','Cole'),
 ('act_378146126054294','2026','goal','About $200k a month from October at a 2.5 ROAS (Sep 8 call).'),
 ('act_378146126054294','2026','winning_offer','Free gear with any club. Prices never drop, no codes.'),
 ('act_378146126054294','2026','cutoffs','Dec 13 standard, Dec 16 expedited.'),
 ('act_378146126054294','2026','gift_cards','Yes. They lead every channel from Dec 17.'),
 ('act_378146126054294','2026','inventory','About 500 polos on hand; XL and XXL thin. Size mix must cover 400 orders. Order of 400 polos, hats, gloves due Oct 16.');
INSERT OR REPLACE INTO p_season_phase (act_id, season, key, name, start, end, grp, who, offer, detail, status, sort) VALUES
 ('act_378146126054294','2026','early','Giveaway, then member signup','2026-10-29','2026-11-25','nov','Anyone','Enter free to win the Lucky Bag. Then join free to shop Black Friday a day early.','Giveaway Oct 29 to Nov 15 (winner picked Nov 16, announced Nov 19). Member signup Nov 16 to 25. No discount anywhere. Every entrant joins the list.','locked',0),
 ('act_378146126054294','2026','access','Members'' Black Friday','2026-11-26','2026-11-26','bf','Members only','Any club = free hat + free glove + first pick of free polos.','Store locked to everyone else, Thu 8am CT to Fri 8am. Private link by email 7:55am CT, text 8am local. Members get the new Eclipse Black putters first. One gift set per order.','locked',10),
 ('act_378146126054294','2026','bf','Black Friday weekend','2026-11-27','2026-11-30','bf','Everyone','Any club = free hat. First 400 orders = free polo too.','Fri 8am CT to Mon 11:59pm CT. When the 400 polos are gone: hat + glove. No codes, no markdowns, no extension. Returned club = polo comes back too.','locked',20),
 ('act_378146126054294','2026','planb','Plan B','2026-11-27','2026-11-30','bf','Everyone','Buy any 2 clubs, get a Carver 02 Gold free.','Only if Friday 2pm CT sales are under about $9k. The free hat stays on every club. Built ahead, switched off until needed.','locked',30),
 ('act_378146126054294','2026','drop','Apparel drop','2026-12-04','2026-12-06','dec','Members Dec 3, everyone Dec 4','New apparel at full price.','Pieces, colours and prices still owed so the copy can be written.','locked',40),
 ('act_378146126054294','2026','xmas','Order by Christmas','2026-12-07','2026-12-13','dec','Everyone','Full price. Order by Dec 13 standard, Dec 16 expedited.','Countdown bar on the site. If the warehouse cannot pack in 3 business days mid-December, move both dates a day earlier.','locked',50),
 ('act_378146126054294','2026','gift','Gift cards','2026-12-17','2026-12-24','dec','Everyone','Gift cards lead every channel.','Delivered by email. On sale all season.','locked',60),
 ('act_378146126054294','2026','boxing','Run-back to non-buyers','2026-12-26','2026-12-31','late','Non-buyers and a wide engaged audience','Candidate: the free gear offer again to anyone who did not buy.','Nick''s idea Sep 25; Cole leaned yes for the back half of December. Not in the locked plan yet.','draft',70),
 ('act_378146126054294','2026','ny','The Havoc driver','2027-01-06','2027-01-07','late','Members Jan 6, everyone Jan 7','New driver at full price. Name revealed Jan 6.','Never use the name or show the full head before Jan 6. Price set by Dec 21. 60-day returns unused, wrench and weights in the box.','locked',80),
 ('act_378146126054294','2026','vday','Valentine''s','2027-01-14','2027-02-07','vday','Everyone','','','missing',90);

-- ---------- Dartee Golf (not locked; call week of Oct 5) ----------
INSERT OR REPLACE INTO p_season_answer (act_id, season, key, value) VALUES
 ('act_963898971023823','2026','shape','standard'),
 ('act_963898971023823','2026','strategist','Ahsan'),
 ('act_963898971023823','2026','buyer','Ahsan'),
 ('act_963898971023823','2026','email_owner','Nick + Nikola'),
 ('act_963898971023823','2026','approver','Justin Dattilo (James on inventory)'),
 ('act_963898971023823','2026','goal','BF weekend $78k, December $130k, Nov + Dec $260k (Playbook, Aug 25). The Aug 25 call talked $350k to $400k for the season with tiered site credit and pre-orders.'),
 ('act_963898971023823','2026','last_year','Early BF $48,758. BF weekend $61,983. December $104,135. Nov + Dec $198,525. BF offer was 40% off sitewide.'),
 ('act_963898971023823','2026','winning_offer','BOGO 50% year round (about 25% off). The BOGO Raincheck belt crushed in September.'),
 ('act_963898971023823','2026','inventory','End-of-year inventory list and incoming stock owed by James by Oct 16. Pre-order at the sale price for out-of-stock belts (dev team).'),
 ('act_963898971023823','2026','cutoffs','Not confirmed. Nick''s placeholders: Dec 15 standard, Dec 19 priority, Dec 21 overnight.');
INSERT OR REPLACE INTO p_season_phase (act_id, season, key, name, start, end, grp, who, offer, detail, status, sort) VALUES
 ('act_963898971023823','2026','early','Early Black Friday','2026-11-01','2026-11-16','nov','Everyone','Candidate: 20% sitewide (the extra 10% credit is under review).','Nick: if the reader cannot do the math in 5 seconds it will not work; say it in dollars ("save $15 on every belt"). Nick''s shape: early bird Nov 1 to 16, Veterans Day send Nov 11, every-other-day email ramping to daily.','draft',0),
 ('act_963898971023823','2026','access','Early access','2026-11-26','2026-11-26','bf','List only','Proposed: early access to the free Raincheck belt while 300 last.','Nick''s proposal. The list is built 2 to 4 weeks ahead, 2 weeks minimum. Daily emails, every-other-day texts.','draft',10),
 ('act_963898971023823','2026','bf','Black Friday','2026-11-26','2026-11-29','bf','Everyone','Candidate: free hat on every order + B1G1 50% (up to $80) + B2G1 free (up to $130). Alternative: the BOGO Raincheck again.','Launch Thanksgiving, run through Sunday night (Nick). Justin asked Oct 3 which one. Nick: swap the hat for the proven free belt if stock allows. Decide on this week''s call.','draft',20),
 ('act_963898971023823','2026','cm','Cyber Monday','2026-11-30','2026-12-03','bf','Everyone','Same value, different mechanic (dollars off, or a drop).','Never the same offer twice through the period (Nick).','draft',25),
 ('act_963898971023823','2026','xmas','Gifting season','2026-12-04','2026-12-15','dec','Everyone','Curated bundles, tiered spend, free shipping at the cutoff.','Dec 4 to 14 gifting offer, every-other-day sends. Dec 21 to 24 "arrives by Christmas" push. End date = the standard cutoff once Dartee confirms it.','draft',50),
 ('act_963898971023823','2026','boxing','BFCM round 2','2026-12-26','2026-12-31','late','Non-buyers first','The best BFCM offer again, with NYE angles.','Nick''s data: November buyers repeat 24%, December 19%, against 29 to 37% the rest of the year.','draft',70);

-- ---------- Grunk Dolfer (proposed Aug 25; waiting on Brad) ----------
INSERT OR REPLACE INTO p_season_answer (act_id, season, key, value) VALUES
 ('act_313396960515158','2026','shape','access'),
 ('act_313396960515158','2026','strategist','Ahsan'),
 ('act_313396960515158','2026','buyer','Ahsan'),
 ('act_313396960515158','2026','email_owner','Nick'),
 ('act_313396960515158','2026','approver','Nick (Grunk) + Brad'),
 ('act_313396960515158','2026','last_year','Buy 1 Get 2 Free. $130,386 for the season. Pre-BFCM 20% off ran Nov 19 to 26.'),
 ('act_313396960515158','2026','winning_offer','Buy 1 Get 2 Free'),
 ('act_313396960515158','2026','inventory','Stock readiness and upgraded packaging (Aug 25). Packaging samples owed by Cole.');
INSERT OR REPLACE INTO p_season_phase (act_id, season, key, name, start, end, grp, who, offer, detail, status, sort) VALUES
 ('act_313396960515158','2026','early','Lead list','2026-11-01','2026-11-25','nov','Anyone','$5,000 lead list campaign, about $200 a day for 25 days.','Proposed Aug 25. Tribe creators ramp from 10 to 30 videos a week. Sweepstakes or order giveaway still undecided.','draft',0),
 ('act_313396960515158','2026','access','24-hour deal','2026-11-26','2026-11-26','bf','List only (proposed)','Polos 3 for $99 (53% off), hats $89.','24 hours, then it closes. Date and audience not set; Thursday fits the season.','draft',10),
 ('act_313396960515158','2026','bf','Black Friday','2026-11-27','2026-11-29','bf','Everyone','Sitewide BOGO.','Waiting on Brad''s yes or change to the Aug 25 plan. Free shipping or a small gift on top still open.','draft',20),
 ('act_313396960515158','2026','cm','Cyber Monday','2026-11-30','2026-11-30','bf','Everyone','Polo flash sale again.','','draft',25),
 ('act_313396960515158','2026','drop','Drops','2026-12-04','2026-12-06','dec','Everyone','New product drops.','Chunk Man, Burgundy, Splatter, NASCAR. Dates from Nick.','missing',40);

-- ---------- Bonk Golf (offer in the Playbook, not yet sent to Floyd) ----------
INSERT OR REPLACE INTO p_season_answer (act_id, season, key, value) VALUES
 ('act_12528825','2026','shape','standard'),
 ('act_12528825','2026','strategist','Noma'),
 ('act_12528825','2026','buyer','Ahsan'),
 ('act_12528825','2026','email_owner','Nick'),
 ('act_12528825','2026','approver','Floyd'),
 ('act_12528825','2026','goal','BF weekend $130k, November $180k, December $180k, Nov + Dec $360k (Playbook, Aug 10). Highest month this year: April, $132k.'),
 ('act_12528825','2026','last_year','Early BF $36,139. BF weekend $16,665. November $50,124. December $35,492. Nov + Dec $85,616. Bundles "up to 50% off"; simple creative: show the hat, offer in 5 words.'),
 ('act_12528825','2026','winning_offer','Bundles, up to 50% off.');
INSERT OR REPLACE INTO p_season_phase (act_id, season, key, name, start, end, grp, who, offer, detail, status, sort) VALUES
 ('act_12528825','2026','early','Early Black Friday','2026-11-01','2026-11-25','nov','Existing customers first','New bundles go to the list before any ads, then a public warm-up weaker than the weekend.','Floyd (Sep 15): sell to existing customers first to lift retention; October is the test run (option 1). 88% of customers are new, so a full-month play fits.','draft',0),
 ('act_12528825','2026','bf','Black Friday weekend','2026-11-27','2026-11-30','bf','Everyone','Everything a Golfer Needs bundle (hat, ball marker, divot tool, towel, tees): $130.50 value for $99. Buy 2 Get 1 Free.','From the Playbook (Aug 10): 24% off, $30.80 off, plus 2 new bundles and upsells based on what they buy. Not yet sent to Floyd; Cole owes the offers from the Oct 5 meeting. Amazon runs alongside with Hamza, video first.','draft',20);

-- ---------- Party Patch (nothing decided) ----------
INSERT OR REPLACE INTO p_season_answer (act_id, season, key, value) VALUES
 ('act_1033194534145987','2026','shape','standard'),
 ('act_1033194534145987','2026','strategist','Noma'),
 ('act_1033194534145987','2026','buyer','Ahsan'),
 ('act_1033194534145987','2026','email_owner','Unknown. Ask Josh.'),
 ('act_1033194534145987','2026','approver','Josh White + Chris');
INSERT OR REPLACE INTO p_season_phase (act_id, season, key, name, start, end, grp, who, offer, detail, status, sort) VALUES
 ('act_1033194534145987','2026','early','Early Black Friday','2026-11-01','2026-11-25','nov','Everyone','','Chris''s concept calendar for November: Friendsgiving, Thanksgiving Eve, Thanksgiving, Black Friday ("Wine at 9. Shopping at 7."). No offer decided.','missing',0),
 ('act_1033194534145987','2026','bf','Black Friday weekend','2026-11-27','2026-11-30','bf','Everyone','','Not decided whether Black Friday is a sale at all or concepts only. Ask Josh and Chris.','missing',20);

-- ---------- The Golf Sock: paused, not on the board ----------
INSERT OR REPLACE INTO p_season_answer (act_id, season, key, value) VALUES ('act_3217552185130501','2026','in_season','no');

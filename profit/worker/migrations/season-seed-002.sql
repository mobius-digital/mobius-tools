-- Season 2026, second seed (2026-10-06): goals + ladder per brand, and first proposals for
-- Yak Sports and Ice & Gold. INSERT OR REPLACE: do not re-run after people edit in Locus.
-- Ladder numbers come from the 2025 BFCM budget sheet (breakeven, target, scale 50/100, starting
-- budget, Meta cap) except Dartee, where Cole raised the scale lines in the Playbook on Aug 25.
-- Every ladder carries a note to confirm before Nov 13.

INSERT OR REPLACE INTO p_season_answer (act_id, season, key, value) VALUES
 ('act_378146126054294','2026','goals','{"early":null,"bf":null,"dec":null,"total":200000,"be":1.56,"target":3.0,"s50":3.5,"s100":4.0,"start":10000,"cap":12982,"note":"Total = the $200k month target from the Sep 8 call. Ladder from the 2025 sheet; confirm before Nov 13."}'),
 ('act_963898971023823','2026','goals','{"early":null,"bf":78000,"dec":130000,"total":260000,"be":1.5,"target":3.0,"s50":4.0,"s100":4.5,"start":4000,"cap":11442,"note":"Goals from the Playbook (Aug 25). Ladder: Cole raised scale lines to 4.0 / 4.5 in the Playbook; start and cap from 2025."}'),
 ('act_313396960515158','2026','goals','{"early":null,"bf":null,"dec":null,"total":null,"be":1.69,"target":4.0,"s50":4.5,"s100":5.0,"start":2000,"cap":5034,"note":"No revenue goal yet; last season was $130,386. Ladder from the 2025 sheet; confirm before Nov 13."}'),
 ('act_12528825','2026','goals','{"early":null,"bf":130000,"dec":180000,"total":360000,"be":1.51,"target":2.7,"s50":3.0,"s100":3.7,"start":1500,"cap":5084,"note":"Goals from the Playbook (Aug 10). Ladder from the 2025 sheet; the Sep 29 call mentioned a 4.5x scaling threshold, confirm which."}'),
 ('act_1033194534145987','2026','goals','{"early":null,"bf":null,"dec":null,"total":null,"be":2.0,"target":2.0,"s50":2.5,"s100":3.0,"start":500,"cap":1555,"note":"No goal yet. Ladder from the 2025 sheet; confirm before Nov 13."}');

-- ---------- Yak Sports (new client, ads start Oct 15 to 19; proposals, not discussed yet) ----------
INSERT OR REPLACE INTO p_season_answer (act_id, season, key, value) VALUES
 ('act_2964926606966267','2026','shape','standard'),
 ('act_2964926606966267','2026','strategist','Ahsan'),
 ('act_2964926606966267','2026','buyer','Ahsan'),
 ('act_2964926606966267','2026','email_owner','J.C. (Yak), Nick later'),
 ('act_2964926606966267','2026','approver','Rob Knight (McKenna coordinates)'),
 ('act_2964926606966267','2026','goal','No revenue goal yet. Target ROAS 2.5 on a 1.43 breakeven (hoodie $78 sell, about $21 cost, 73% margin). Ads start Oct 15 to 19; the first 30 to 45 days are the pixel warm-up. Rob authorized moving hoodie inventory without undermining pricing.'),
 ('act_2964926606966267','2026','inventory','13 hoodie colorways across youth and adult; black medium and large low or out. 27,000 hats going to Dick''s, Golf Galaxy and Lids for 2027. 3PL move being considered (30 to 45 days).'),
 ('act_2964926606966267','2026','winning_offer','None on record. Catalog: snapbacks $50, Olympic Gold hoodie $99, UMD hoodies $65 to $125, joggers $60, shorts $35.'),
 ('act_2964926606966267','2026','goals','{"early":null,"bf":null,"dec":null,"total":null,"be":1.43,"target":2.5,"s50":3.0,"s100":3.5,"start":null,"cap":null,"note":"Breakeven and target from the Oct 2 call. Scale lines are a first guess; set the starting budget once the account has a week of data."}');
INSERT OR REPLACE INTO p_season_phase (act_id, season, key, name, start, end, grp, who, offer, detail, status, sort) VALUES
 ('act_2964926606966267','2026','early','Early Black Friday','2026-11-06','2026-11-25','nov','Everyone','Proposal: buy any hoodie, pick a free snapback ($50 value). No markdown on the hoodie.','Proposed by Mobius, not discussed with Rob yet. A gift beats a percent here: Rob does not want pricing undermined, and a hat on a hoodie moves two SKUs. Runs from Nov 6 so the pixel has three weeks of learning first.','draft',0),
 ('act_2964926606966267','2026','bf','Black Friday weekend','2026-11-27','2026-11-30','bf','Everyone','Proposal: two hoodies for $140 (save $16 each) + free snapback, or one hoodie + snapback with free shipping.','Proposed by Mobius. The weekend must beat November: the bundle is the step up, the free hat stays. Alternative if Rob wants a number: 20% off hoodies only, never sitewide. Decide which colorways to push (the deep ones) and which to let sell out.','draft',20),
 ('act_2964926606966267','2026','xmas','Order by Christmas','2026-12-07','2026-12-16','dec','Everyone','Proposal: full price, hoodie + hat gift set with gift wrap, order-by date in every ad.','Proposed by Mobius. Needs Yak''s real shipping cutoff (3PL move may change it).','draft',50),
 ('act_2964926606966267','2026','ny','2027 line tease','2026-12-29','2027-01-05','late','The list first','Proposal: early look at the 2027 hat line for the email list before retail gets it.','Proposed by Mobius. Rob previewed the 2027 hats (Dick''s, Golf Galaxy, Lids). A list-only first look costs nothing and builds the list the retail launch will need.','draft',80);

-- ---------- Ice & Gold (new client; 60% returning, AOV about $130; proposals, not discussed yet) ----------
INSERT OR REPLACE INTO p_season_answer (act_id, season, key, value) VALUES
 ('act_952386692927446','2026','shape','access'),
 ('act_952386692927446','2026','strategist','Noma'),
 ('act_952386692927446','2026','buyer','Ahsan'),
 ('act_952386692927446','2026','email_owner','Unknown. Ask Fela.'),
 ('act_952386692927446','2026','approver','Fela (Ayo on the channel)'),
 ('act_952386692927446','2026','goal','No goal yet. Last 60 days in Triple Whale: about $33.8k revenue on $10.4k spend (3.3x MER), 260 orders, AOV about $130, 54% of revenue from new customers. September was the best month at $20.9k.'),
 ('act_952386692927446','2026','last_year','No Triple Whale history before July 2026. Fela: nearly 60% of customers come back; influencer videos converted, agency creative did not.'),
 ('act_952386692927446','2026','winning_offer','None on record. Catalog is 18k gold plated jewelry $39 to $159: rings $47 to $119, Cuban chains $71 to $119, letter pendants $71, earrings $39 to $103, sets $135 to $159. Gift wrapping $16 exists as a product.'),
 ('act_952386692927446','2026','inventory','Narrow the push to 3 to 5 products (Cole, Oct 1). Jewelry sets over-index on the Nigerian audience; diversify beyond it. 500 creators waiting, 60 videos in, creators on 15%.'),
 ('act_952386692927446','2026','goals','{"early":null,"bf":null,"dec":null,"total":null,"be":null,"target":2.5,"s50":3.0,"s100":3.5,"start":null,"cap":null,"note":"Target is a placeholder until margins come in from onboarding. Set breakeven from the onboarding margin answer."}');
INSERT OR REPLACE INTO p_season_phase (act_id, season, key, name, start, end, grp, who, offer, detail, status, sort) VALUES
 ('act_952386692927446','2026','early','Gift list + early access signup','2026-11-02','2026-11-25','nov','Anyone','Proposal: join the list for early access Thursday and a free pair of studs with your first order over $100.','Proposed by Mobius, not discussed with Fela yet. 60% of customers return, so the list is the asset: the whole month builds it. A gift with purchase (studs, $39 to $47 retail, low cost) keeps the gold plated pieces at price. Creators film the gift reveal.','draft',0),
 ('act_952386692927446','2026','access','Early access (Thursday)','2026-11-26','2026-11-26','bf','List and past customers','Proposal: 24 hours early on the Black Friday offer, plus first pick of the gift sets.','Proposed by Mobius. Returning customers are the base here; they get the best day.','draft',10),
 ('act_952386692927446','2026','bf','Black Friday weekend','2026-11-27','2026-11-30','bf','Everyone','Proposal: spend $100 save $25, spend $200 save $60, spend $300 save $100, plus free gift box on every order.','Proposed by Mobius. Tiers push the $130 AOV up instead of cutting it; a flat percent would cut it. Alternative: buy 2 pieces get the 3rd free (sets sell). Pick one, never both.','draft',20),
 ('act_952386692927446','2026','drop','Holiday sets','2026-12-04','2026-12-06','dec','BFCM buyers get the discount','Proposal: three curated gift sets (her, him, the pair) at full price; BFCM buyers get $20 off by email only.','Proposed by Mobius. Gifting is the December story for jewelry; the discount goes to the list, cold traffic sees full price.','draft',40),
 ('act_952386692927446','2026','xmas','Order by Christmas','2026-12-07','2026-12-16','dec','Everyone','Proposal: free gift wrapping (the $16 product) on every order until the cutoff, order-by date in every ad.','Proposed by Mobius. Needs the real shipping cutoff from Fela.','draft',50),
 ('act_952386692927446','2026','gift','Gift cards','2026-12-17','2026-12-24','dec','Everyone','Proposal: digital gift cards lead every channel after the cutoff.','Confirm gift cards are switched on in Shopify.','draft',60),
 ('act_952386692927446','2026','vday','Valentine''s','2027-01-14','2027-02-07','vday','Everyone','Proposal: the pair sets and the heart pieces, gift wrapped, with the Thursday list getting first access again.','Jewelry''s second season. Same mechanics as Black Friday, rebranded.','draft',90);

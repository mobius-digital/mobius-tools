# Meta ads: knowledge for the Strategist (October 2026)

Read with: Mobius doctrine (one Sales CBO per brand with Advantage+, numbered test ad sets of up to 6 ads, at most 5 new tests a week, judge the ad set first and each ad by its role, Triple Whale last platform click as the default number) and `source-lucky-account-structure.md` (the worked Lucky numbers: $20/day test minimum for 7 days, minimums at or under 25% of budget, the two-line judging rule). This file extends that doctrine. It never overrides it.

## 1. How it works now (2025 to 2026)

### The delivery stack
- Three systems decide who sees which ad. Andromeda (retrieval, Dec 2024) picks a few thousand candidate ads per person out of millions. Lattice and the ranking models then predict conversion odds and value for each candidate. GEM (Meta's ads foundation model, made public Nov 2025) trains the ranking models; Meta reported about +5% conversions on Instagram and +3% on Facebook Feed from it.
- What that means for decisions: targeting inputs matter far less than they did in 2022. The creative is now the targeting. Who an ad reaches is decided mostly by what the ad shows and says.
- Andromeda groups ads that look, read and sound alike. Practitioners call the group an "Entity ID". Meta does not publish the term or the threshold. Treat it as a working model: near-identical ads share one retrieval slot, so 10 copy tweaks of one video behave like 1 ad, not 10.
- What creates a separate slot: a different person on screen, a different opening shot, a different format (static vs talking head vs demo vs skit), a different setting, a different argument (angle). What does not: a new headline, colour swap, music swap, new caption over the same footage, crop change.
- Meta shows a Creative Similarity signal in Ads Manager on some accounts. Vendor rules of thumb (keep active ads under about 40 to 60% similarity) are not Meta numbers. Use it as a tiebreaker only.
- Spend concentrates by design. Inside an ad set Meta gives most budget to 1 or 2 ads within days. Motion's 2026 benchmarks (578,750 creatives, Sep 2025 to Jan 2026): about 5 to 8% of ads become winners (10x the account median spend), about half never get meaningful spend. One ad taking 50% of an ad set is normal, not a fault.

### Campaign types
- Advantage+ sales campaigns replaced Advantage+ Shopping (ASC) in 2025. A Sales campaign is "Advantage+" when three settings are on together: Advantage campaign budget (CBO), Advantage+ audience, Advantage+ placements. There is no separate campaign type any more.
- The existing customer budget cap is gone. Ad sets are allowed (no limit). Audience suggestions and custom audience exclusions are allowed.
- Legacy ASC creation through the API was blocked from Marketing API v24 (Oct 2025), with full removal reported for May 19, 2026. Any old ASC still running: rebuild as an Advantage+ sales campaign, do not duplicate the legacy one.
- Advantage+ sales still over-serves existing customers and site visitors if nothing stops it. The audience segments breakdown (new / engaged / existing) in Ads Manager is the check. Feed existing customers into the "existing customers" definition in Advertising settings so the split is readable.

### Budgets
- CBO (Advantage campaign budget) is the default and the doctrine. ABO only for a launch or a hard-guarantee test outside the main campaign.
- Ad set spend limits became an average, not a hard floor or ceiling (reported by Jon Loomer and Social Media Today; Mobius noted it Aug 2025). A $20/day minimum means "about $20 a day averaged", not "never under $20".
- Percentage-based ad set minimums inside CBO were reported in Jan 2026 (Aimerce, not verified by Meta docs). Where available, they solve the "minimums pile up" problem: a test at 5% of budget scales with the budget.
- Daily budgets can overspend up to 75% on a given day, capped at 7x the daily budget per week. Daily spend swings of +/- 40% are not a signal by themselves.
- Meta throttles spend-limit edits to 1 per 30 seconds per ad set (relevant to automated minimum removal).

### Learning phase
- About 50 optimisation events per ad set in the 7 days after the last significant edit. Under that, the ad set shows "Learning limited". It still delivers.
- Significant edits: targeting, placements, optimisation event, bid strategy, adding an ad, pausing 7+ days, large budget or bid changes. The budget threshold Meta uses is not published; 20% is the practitioner consensus and the Mobius rule.
- Adding a new ad to a running ad set restarts its learning. This is the reason doctrine puts new tests in new ad sets and never adds ads into a working ad set.
- Learning limited is a label, not a verdict. At 50 purchases a week account-wide (Lucky today), every test ad set will be learning limited. Judge on cost per sale and sales count, not on the label.

### Bidding
- Highest volume (no cap) is the default for every Mobius brand until the account has 4+ stable weeks.
- Cost per result goal (cost cap): Common Thread's 253-account study (Mar 2025 to Jul 2026) found it delivered about 140% of target on average (bid $78, got about $108). CTC no longer recommends it as a default.
- ROAS goal (min ROAS) under Highest value: delivered about 96.5% of target across the sample, the most accurate control, but 67% of single accounts ran more than 5% below target. Needs reliable purchase values through CAPI.
- Bid cap: about 123% of target in a small $3M sample. Advanced only; starves delivery if set from guesses.
- Highest value (maximise conversion value) is the fix when Meta favours the cheapest SKU (Lucky: $99 wedges outbidding $229 putters). Test it, do not switch the whole account in one move.
- Value rules (renamed from conversion value rules, 2025): bid up or down by age, gender, location, OS, placement. Up to about +5% reported (anecdotal). Raises cost per result by design.

### Placements
- Advantage+ placements is the default. Since Oct 2025, Sales and Leads campaigns that exclude placements can still spend up to 5% per excluded placement ("limited spend on excluded placements"), on by default in Ads Manager. If a placement is excluded for brand safety, untick that box.
- Reels and Stories carry most cheap reach. A 9:16 version of every winning ad is required, not optional. A 4:5 feed ad stretched into Reels loses the top and bottom 20% to UI.

### Measurement and attribution
- Jan 12, 2026: 7-day view and 28-day view windows removed (Ads Manager and API). Longest view window is 1 day. Reported conversions dropped 15 to 40% for view-heavy accounts with no change in sales.
- Mar 2026: click-through now means link clicks only. Likes, comments, shares, saves and 5-second video views moved into "engage-through" attribution, 1-day window. Default most accounts see: 7-day click, 1-day view, 1-day engage-through.
- Incremental attribution: a Sales setting that optimises for and reports only conversions Meta models as caused by the ad. Haus's 2025 tests found it beat standard attribution only 43% of the time; Haus's July 2026 re-analysis says it now outperforms standard. Worth one controlled test per brand at $15k+/month Meta spend.
- CAPI plus pixel with deduplication is mandatory. Purchase Event Match Quality: 8+ is great, 6 to 7.9 is acceptable, under 6 is a problem (vendor bands; Meta shows the score in Events Manager). Email is the strongest key, then phone (E.164), external ID, fbp/fbc.
- Triple Whale vs Meta: on Lucky they agree within 4% on 30-day purchases (169 vs 163). A gap over 25% on any brand is a tracking question before it is a performance question.

### What Meta incrementality looks like (Haus, 640 tests since 2024)
- Meta drove an average 19% lift in the primary KPI. At 7-day click, Meta under-reports incrementality by about 15% on average for DTC.
- Advantage+ was 9% ahead of manual at test midpoint, 12% behind on incremental ROAS by the end including the post-test window. 58% of brands did better on manual. Advantage+ over-reported by about 12 points vs manual.
- Upper and mid funnel: lower DTC iROAS in-test, but most of the gap closes after the test (46% lower in-test, 22% lower after), with 78 to 81% new customers vs 67% for conversion campaigns.
- Brands with 25%+ of sales off-site (Amazon, retail): about 32% of Meta's impact landed off-site.

## 2. Decision rules (the thresholds)

### Minimum data before any call
- A test ad set: judge after spend reaches 3x goal CPA, or 7 days from first spend with at least 1x goal CPA spent. Never before day 4 except for a broken ad (zero link clicks on $30+, disapproval, wrong URL).
- Winner and Keep both need 2+ Triple Whale (last platform click) sales. One sale is noise.
- An ad (not ad set): do not judge an ad that has spent under 1x goal CPA. Inside a working ad set it is judged by role, not by its own CPA.
- The campaign: judge on 7-day and 14-day rolling windows, never on a single day. A single day is 1 to 7 purchases on most Mobius brands; one order moves CPA by 15 to 50%.
- A change you made: wait 3 full days for a budget change, 7 days for a structural change (new bid strategy, new campaign, Advantage+ toggle), 14 days for an attribution or optimisation-event change.

### Test rules (doctrine plus thresholds)
- Max 5 new test ad sets a week, up to 6 ads each, one launch day if possible.
- Test minimum: about 40% of goal CPA per day for 7 days (Lucky: $20 on a $52 goal). Rises with price: a $300 product needs about $40/day.
- All live minimums at or under 25% of the campaign budget. Over the cap: take minimums off finished tests first, then launch fewer, then raise budget to (total minimums / 0.25).
- Judging lines (Lucky shape, apply per brand with its own goal and account average):
  - Winner: cost per sale at or under goal and 2+ sales. Keep running, minimum off, brief 3 to 5 variations.
  - Keep: at or under the trailing 30-day account average and 2+ sales. Leave running, minimum off.
  - Another week: above the average, but 2+ soft metrics in the account's top third and cost per sale at or under 2x goal.
  - Pause: above the account average, or under 2 sales once judged, or Meta would not spend the minimum by day 7.
- An angle is dead only after 2 different concepts on it have failed. One failed concept kills the concept, not the angle.
- New creative mix: about 60% new concepts / 40% variations when the brand has few proven winners; about 25 / 75 once 3+ ads have held goal CPA for 3+ weeks.

### Scale rules
- Raise campaign budget by at most 20% per step, at most every 3 days, only when the trailing 7-day TW CPA is at or under goal AND the 7-day MER is at or above the brand's MER floor.
- Stop raising when either: the 3-day CPA after a step is more than 25% above the pre-step 7-day CPA, or new-customer share (TW) falls more than 5 points. Roll back one step if CPA has not recovered within 5 days.
- Prefer horizontal over vertical when campaign frequency (7-day) is above 2.5 or the top ad holds more than 60% of spend: the next dollar should go to new concepts, not a bigger budget on the same ads.
- Seasonal surge (BFCM, launch): steps up to 30 to 50% are acceptable if the brand has 100+ purchases a week; under that, keep 20% and start the ramp 10 to 14 days earlier.
- Never duplicate a winning ad into a new ad set to "scale" it. Use the same post ID only when moving a proven ad into a new campaign (launch fold-in, account restructure), so its social proof travels.

### Cut rules
- Cut the campaign budget 15 to 20% (not 50%) when 7-day TW CPA is more than 30% above goal for 2 consecutive weeks and creative fatigue is ruled out (see Diagnostics). Big cuts restart learning and create a second problem.
- Pause an ad only when replacing it, or when it spends more than 2x goal CPA with 0 sales in a working ad set and is not the anchor.
- The anchor ad that carries a working set (60%+ of the ad set's spend and sales) is replaced by its next variation, never switched off with nothing behind it. Turning off the anchor sends the ad set back to learning with weaker ads.

### Restructure rules
- Split a product into its own campaign only when it alone makes 50+ purchases a week for 3 weeks running, or it needs a different goal (AOV or margin so different that it is judged on a different return).
- A launch campaign (new product): own budget for 3 to 4 weeks at about 25 to 30% of core, 4 to 6 distinct concepts, then fold winning ad sets into the core Sales campaign by post ID.
- Retargeting campaign: not by default. Add one only when the audience segments breakdown shows existing customers under 10% of spend AND returning-customer revenue in TW is falling, or for a sale where existing customers need a different offer.
- Try Highest value (instead of Highest volume) when 2+ products differ in price by 2x or more and spend share tracks price inversely (cheapest product gets the most spend at an account ROAS below goal). Run as a 50/50 A/B test (Meta Experiments) for 14 days, not a switch.
- Try a cost control only when Highest volume has run 4+ weeks with stable CPA. Start with ROAS goal at 85 to 90% of the trailing 28-day TW ROAS. Never start a cost cap at the goal CPA if actual is far above it: it will stop spending.

### Frequency and fatigue rules
- Prospecting frequency (7-day, campaign level): under 2.0 is room to scale; 2.0 to 3.0 watch; over 3.0 with CTR falling is saturation. Golf brands with narrow audiences hit this sooner.
- An ad is fatiguing when, against its own first 14 days: hook rate down 20%+ or CTR down 15%+, while CPM is flat. Fix with a variation (new opening, new face), not a pause.
- Hook rate falling, hold rate flat: the opening is worn. Swap the first 3 seconds.
- Hook and hold both falling: the concept is worn. Brief a new concept on the same angle.
- Typical winner life on DTC Meta: 3 to 8 weeks at Mobius spend levels. A winner past 8 weeks with stable CPA is an asset, not a problem. Do not refresh what is still working.

### Creative volume rules
- Each brand needs 4 to 8 new ads a week to keep winners coming at $10k to $50k/month (Motion: median 4.1, top quartile 8.1 for that band). Under $10k/month: about 3 a week is the floor.
- Each test ad set holds ads that differ in what you see in the first 3 seconds. If 4 of 6 ads share the same opening shot, Andromeda treats the set as about 3 ads.
- Every winner gets a 9:16 and a 4:5 version, and a static version of its argument within 2 weeks.

### Partnership (creator) ads
- Run partnership ads inside the same Sales campaign as brand ads, never a creator-only campaign. Meta's 2022 Marketing Science meta-analysis (15 split tests) found mixed campaigns beat brand-only; vendor case studies report 20 to 35% lower CPA (directional, self-reported).
- Use the creator's exact uploaded post where possible (social proof carries). Creator tests group by product, up to 6 videos per ad set (doctrine).
- A creator ad is judged on the same lines as any test. A creator whose 2 tests both fail goes to the back of the queue, not off the roster.

### Catalog (Advantage+ catalog) ads
- Use catalog ads when the brand has 15+ SKUs or variants that matter (colours, sizes, lofts) and a clean feed. Under that, a static carousel of the 3 to 5 heroes does the same job.
- Since Sep 1, 2025 Dynamic Media defaults on: product videos in the feed get served. Add a 6 to 15 second video per hero SKU to the catalog.
- Catalog ads live as one ad (or one ad set) inside the main Sales campaign. Judge on the same TW CPA. Expect a high existing-customer share; check the audience segments breakdown.
- Feed hygiene before creative: price, availability and image errors in Commerce Manager diagnostics block delivery silently.

### CAPI rules
- Purchase EMQ under 6, or Meta purchases more than 25% below TW purchases over 14 days: fix tracking before any performance change.
- After any theme, checkout, app or domain change on Shopify: check Events Manager deduplication and EMQ within 48 hours.

### Testing structures compared (why Mobius uses test ad sets inside the Sales CBO)
- Test ad sets with a 7-day minimum inside the one Sales CBO (Mobius, Theriot, Radack): tests and winners share learning; winners never move; minimums force a fair look. Cost: minimums are an average, not a guarantee.
- Separate ABO testing campaign (2020 to 2023 standard): clean equal spend, but splits the purchase signal and needs the winner moved, which loses its learning. Only for brands spending $1,500+/day where 50 purchases a week per campaign is still met.
- Meta's Creative Testing tool (in-ad-set A/B, 2 to 5 new ads, up to 30 days, even split, Meta advises at most 20% of budget, Highest volume only): use for a true head-to-head of openings on one proven concept, not for new concepts. New ads only; existing ads cannot be tested.
- Meta Experiments (A/B test of campaigns): the only clean way to test bid strategy, Highest value vs Highest volume, Advantage+ on vs off, or incremental attribution. 14 days minimum, 50/50 split.
- Conversion Lift or a geo holdout: the only way to measure what Meta adds in total. Worth running once a year per brand at $20k+/month Meta spend, or before any 30%+ budget shift between channels.
- Dynamic creative / flexible ads: fine for copy and headline mixing inside a winner. Never for testing concepts (results are unreadable per concept).

### Weekly read order (what the Strategist checks, in this order)
1. Tracking: Meta purchases vs TW orders (7 days), Purchase EMQ. A gap over 25% stops all other calls.
2. Store truth: TW revenue, orders, MER, new-customer share, CAC vs last week and 4-week average.
3. Campaign: 7-day TW CPA vs goal and account average, spend vs budget, frequency, CPM trend.
4. Tests due: each test ad set past 3x goal spend or day 7, sorted into Winner, Keep, Another week, Pause.
5. Anchors: each working ad set's top ad, hook rate and CTR vs its first 14 days. Fatigue triggers a variation brief.
6. Pipeline: number of new tests launched vs 5 slots; days since the last new concept; minimums vs the 25% cap.
7. Cross-channel: Search Console brand clicks, Google brand CPA, Klaviyo revenue share, TikTok spend in TW.

## 3. Diagnostics

| Symptom | Likely causes, most likely first | Number that confirms it | Fix |
|---|---|---|---|
| CPA up, CPM up, CTR flat | 1. Auction pressure (Q4, BFCM, Prime Day) 2. Audience saturation 3. Policy limit on delivery | CPM up 20%+ week on week across all ads at once; same pattern in other brands that week; frequency flat | Seasonal: hold budget, protect best ads, do not cut tests. If frequency rising too: new concepts. |
| CPA up, CPM flat, CTR down | 1. Creative fatigue 2. Offer or price change 3. Landing page change | Top ad hook rate and CTR down vs its first 14 days; frequency 3+ | Variations of the top ad (new opening), next concept on the same angle |
| CTR fine, add to cart fine, purchases down | 1. Site or checkout issue 2. Stock out or price change 3. Tracking break | GA4 checkout-to-purchase rate down; Shopify product out of stock; TW orders flat while Meta purchases fall | Check the product page and checkout by hand; check Events Manager; message the client if stock |
| Meta purchases well above TW (25%+) | 1. View or engage-through credit 2. Duplicate pixel events 3. Existing customers being credited | Meta "1-day view" column share; Events Manager dedup warning; TW new-customer share low | Judge on TW; fix dedup; check audience segments breakdown |
| Meta purchases well below TW (25%+) | 1. CAPI down or EMQ fell 2. Consent banner blocking 3. Domain/checkout change | EMQ under 6; Events Manager server events dropped; date it started matches a site change | Fix CAPI first. Do not cut budget on Meta's numbers while tracking is broken |
| New tests get almost no spend | 1. No minimum or minimum too low 2. Tests too similar to running winners (same Entity ID) 3. Ad set in review | Test ad set under 30% of its minimum by day 3; opening shots match existing ads | Set the minimum (40% of goal CPA); brief visibly different openings |
| One old ad takes 70%+ of campaign spend | 1. Normal winner concentration 2. Tests not different enough 3. Minimums missing | Its CPA vs account average; test ad sets' spend share | If it holds goal CPA: leave it, feed more distinct concepts. If above average: variations of it and new concepts, do not pause it first |
| Learning limited on every ad set | Account makes under 50 purchases a week across too many ad sets | TW weekly orders vs number of active ad sets | Normal at small spend. Consolidate only if more than 1 campaign or 10+ always-on ad sets |
| Spend will not reach budget | 1. Cost cap or ROAS goal too tight 2. Audience exclusions too wide 3. Ad rejections, account limits | Bid strategy column; delivery column "limited"; account quality warnings | Loosen the control 10 to 15% or return to Highest volume |
| Cheapest product takes most spend, ROAS below goal | Highest volume optimises for count, not value | Spend share by product vs price | A/B test Highest value; feed tests to the higher-priced product |
| Meta ROAS steady, MER falling | 1. Credit shifting (Meta claiming orders other channels made) 2. Existing-customer spend rising 3. Other channel spend up | TW new-customer share falling; Meta audience segments existing share rising; Klaviyo revenue share up | Exclude or cap existing customers via a separate ad set limit; judge on MER and new-customer CAC |
| CPA jumped the day after an edit | Learning restart | Change log entry; edit size over 20% or new ad added | Wait 3 days unless CPA doubles; batch future edits |
| Reported conversions dropped Jan or Mar 2026 with flat orders | Attribution window changes (view windows removed; click = link clicks) | TW orders and Shopify sales flat across the date | Re-baseline goals on TW; no account action |
| Hook rate good, hold rate poor | Opening works, middle loses them | Hold rate (ThruPlay or 15s / 3s views) under account bottom third | Re-edit the body: show the product and payoff by second 5 to 8 |
| High CTR, low conversion rate | 1. Ad promise does not match the page 2. Wrong landing page (homepage) 3. Price shock | GA4 landing page bounce and add-to-cart rate by ad's URL | Send to the product page; match headline to the ad's claim |
| Partnership ad spends less than brand ads | 1. Creator handle has low trust signals 2. Not using the original post 3. Too similar to brand ad | Spend share by identity | Test dynamic identity vs creator-first; use original post ID |

## 4. How Meta affects the other channels

- Meta is the demand creator for most Mobius brands. When Meta spend rises, these move with a 0 to 14 day lag:
  - Branded search: Search Console brand-query impressions and clicks, Google brand campaign conversions. A real Meta lift shows up here within 1 to 2 weeks.
  - Direct and organic sessions in GA4.
  - Klaviyo: popup signups and welcome-flow revenue rise; campaign revenue rises 1 to 3 weeks later from a bigger list.
  - Amazon or retail where a brand sells there (Haus: about 32% of Meta's impact lands off-site for brands with 25%+ off-site sales).
- Credit shifting to watch: Meta (7-day click, 1-day view) and Google brand search and Klaviyo all claim the same order. TW last platform click picks one. Platform totals summed are always above Shopify revenue.
- How to tell real growth from credit shifting after a Meta change:
  1. Store revenue (TW, Shopify total minus tax) and new-customer orders moved in the same direction as Meta's numbers. If Meta purchases rose 20% and store orders rose 3%, most of it is credit.
  2. MER (revenue / all ad spend) held or improved.
  3. Branded search impressions rose, not just Google brand clicks shifting to Meta credit.
  4. New-customer share held or rose in TW.
- Check BEFORE a Meta budget or structure change: Google brand campaign spend and CPA (so a Meta lift is not hidden by Google claiming it), Klaviyo send calendar (a big email week inflates Meta's view credit), stock levels of the hero SKUs (Shopify), any planned price or offer change, TikTok spend (TW totals).
- Check AFTER (day 3, day 7, day 14): TW MER and new-customer CAC, Search Console brand clicks, GA4 direct sessions, Klaviyo revenue share. If Meta CPA improved but MER fell, the improvement is credit, not growth.
- Cutting Meta: expect branded search and email revenue to fall 1 to 3 weeks later. A Meta cut that "did not hurt" in week 1 can show up in week 3.
- Retargeting and existing customers: Advantage+ will spend on people who would have bought from an email anyway. If Klaviyo campaign revenue is high that week, Meta's existing-customer conversions are the most overstated.

## 5. What a great suggestion looks like

Format: WHAT to do. NUMBER and its source. WHY in one line. WHAT TO WATCH and for how long. HOW SURE. (Numbers below are illustrative, shaped on Lucky Golf.)

**Example 1: scale a working account**
- WHAT: Raise "Lucky Golf | Sales" from $450 to $540/day (20%) on Monday; next step Thursday only if the rule holds.
- NUMBER: Trailing 7-day TW last-platform-click CPA $49 (goal $52) on 61 orders; 7-day frequency 1.8; new-customer share 74% (TW), flat vs prior 4 weeks.
- WHY: Below goal with room in frequency, so the next dollar should still find buyers at about goal.
- WATCH: 3-day TW CPA after the step (stop if above $61, which is 25% over the pre-step $49); new-customer share (stop if under 69%); Search Console brand clicks for a lift by day 10. Check Thursday.
- HOW SURE: Medium-high. 61 orders is a solid base; the risk is that 2 ads carry 65% of spend, so the brief for 2 new concepts goes in this week too.

**Example 2: replace a fading anchor, do not pause it**
- WHAT: Brief 3 variations of ad 318 B (new opening shot each, same body) as next week's VARS test; leave 318 B running.
- NUMBER: 318 B holds 62% of its ad set's spend; hook rate 31% down from 41% in its first 14 days (-24%); CTR -18%; CPM flat; 14-day CPA $58 vs $51 earlier (Meta delivery + TW).
- WHY: Hook down with CPM flat is the opening wearing out, not the audience; the body still converts.
- WATCH: Variation test judged at $156 spend or day 7; 318 B's share should fall as a variation takes over. If none of the 3 beats $80 (account average), brief a new concept on the same angle.
- HOW SURE: High on the cause (the pattern is clean); medium on the fix (variations win about 1 time in 3).

**Example 3: a tracking problem dressed as a performance problem**
- WHAT: Do not cut budget. Fix CAPI first: ask the client to reconnect the Meta sales channel app; check Purchase EMQ and dedup in Events Manager.
- NUMBER: Meta purchases down 38% week on week; TW orders down 2%; Shopify sales flat; Purchase EMQ fell from 8.4 to 5.1 on the day the theme changed (change log + Events Manager).
- WHY: Sales did not fall; Meta lost sight of them, and it will now optimise on fewer, worse signals.
- WATCH: EMQ back above 8 and Meta-to-TW purchase gap under 10% within 72 hours of the fix. Expect 3 to 7 noisy days after.
- HOW SURE: High. The drop dates match the site change and store revenue is flat.

## 6. Traps

- "Meta ROAS is up, so Meta is working." Check MER and new-customer orders. Meta's 1-day view and engage-through credit rises in heavy email weeks without one extra sale.
- "Conversions dropped in January or March 2026." That was the attribution change, not demand. Compare TW orders across the date.
- "This ad has the best CPA, give it its own ad set." Duplicating a winner splits its learning and makes the copies compete for one Entity ID. Leave it; scale the campaign.
- "Learning limited means the ad set is broken." At under 50 purchases a week it is the normal state. Judge cost per sale.
- "The test did not spend, so the ad is bad." Meta never tried it. Check the minimum and how similar it looks to running winners. A test that could not spend is unread, then paused by rule after day 7.
- "5 copy variations of the winner = 5 tests." To Andromeda it is about 1 ad. Change what is seen.
- "Turn off the losers to force spend to the winner." CBO already does that. Turning off the anchor of a working set resets it.
- "A cost cap at goal CPA will make Meta hit goal." It makes Meta spend less. CTC data: cost caps landed about 40% over target anyway.
- "Advantage+ beats manual." On platform numbers it often does; on incremental return 58% of brands in Haus's tests did better with manual. Check new-customer share.
- "Big budget cut to stop the bleeding." A 50% cut restarts learning and makes CPA worse for a week. Cut 15 to 20%, fix creative.
- "Frequency is fine at account level." Read it per ad and per campaign; one hot ad at 4+ hides inside a 1.9 average.
- "Partnership ads failed because one creator flopped." Judge creators by batch, by product, over 2 tests.
- "Meta says it, so it happened." Meta's numbers are for steering Meta. Triple Whale last platform click is the Mobius number; MER and new customers are the truth test.
- "The catalog ad has 8x ROAS." Catalog ads harvest people who already viewed the product. Check the existing-customer share before giving it budget credit.

## 7. Sources

- Meta Engineering, Andromeda (Dec 2, 2024): https://engineering.fb.com/2024/12/02/production-engineering/meta-andromeda-advantage-automation-next-gen-personalized-ads-retrieval-engine/
- Meta developers, ASC and AAC API deprecation and migration to Advantage+ (Oct 8, 2025): https://developers.facebook.com/blog/post/2025/10/08/upcoming-asc-and-aac-mapi-deprecation-migration-options-to-advantage-plus/
- PPC Land, legacy campaign API deprecation and the three-setting Advantage+ state: https://ppc.land/meta-deprecates-legacy-campaign-apis-for-advantage-structure/
- Aimerce, May 19, 2026 cutover (not verified against Meta): https://www.aimerce.ai/blogs/meta-advantage-api-deprecation-what-you-need-to-do-before-may-19-2026
- Meta developers, limited spend on excluded placements (Oct 8, 2025): https://developers.facebook.com/blog/post/2025/10/08/introducing-limited-spend-on-excluded-placements-in-marketing-api/
- PPC Land, 5% per excluded placement: https://ppc.land/meta-pushes-spending-5-on-excluded-placements-for-sales-and-leads-campaigns/
- Jon Loomer, Advantage+ Sales replaces Advantage+ Shopping: https://www.jonloomer.com/qvt/advantage-sales-replaces-advantage-shopping/
- Jon Loomer, no more existing customer budget cap: https://www.jonloomer.com/qvt/no-more-existing-customer-budget-cap/
- Jon Loomer, change to ad set spending limits (average, not hard): https://www.jonloomer.com/qvt/ad-set-spending-limits-change/
- Aimerce, percentage-based minimum spend in CBO, Jan 2026 (not verified by Meta docs): https://www.aimerce.ai/blogs/ads-manager-is-more-powerful-than-you-know
- Jon Loomer, the learning phase is just a label (Oct 2025): https://pubcast.jonloomer.com/the-learning-phase-is-just-a-label/
- Jon Loomer, Meta creative testing tool: https://www.jonloomer.com/meta-creative-testing/
- Jon Loomer, Meta ads attribution 2026 (page blocked fetch; content confirmed via secondary sources): https://www.jonloomer.com/meta-ads-attribution-2026/
- PPC Land, click attribution rewritten to link clicks (Mar 2026): https://ppc.land/meta-rewrites-click-attribution-rules-finally-aligning-with-google-analytics/
- PPC Land, attribution windows restricted in Insights API: https://ppc.land/meta-restricts-attribution-windows-and-data-retention-in-ads-insights-api/
- Dataslayer, view windows removed Jan 2026: https://dataslayer.ai/blog/meta-ads-attribution-window-removed-january-2026
- Haus, The Meta Report (640 incrementality tests): https://www.haus.io/blog/the-meta-report-lessons-from-640-haus-incrementality-experiments
- Common Thread Collective, cost controls study (253 accounts): https://commonthreadco.com/blogs/coachs-corner/meta-cost-controls-study-taylor-holiday-andrew-faris
- Social Media Today, GEM and Meta's ad targeting systems: https://www.socialmediatoday.com/news/meta-outlines-evolving-ai-powered-ad-targeting-systems/805164/
- Motion, Creative Benchmarks 2026 methodology: https://motionapp.com/library/research/creative-benchmarks-2026/methodology
- Motion, 10x winner benchmark: https://motionapp.com/library/research/creative-benchmarks-2026/10x-benchmark
- Precis, Andromeda and creative strategy: https://www.precis.com/resources/meta-andromeda-and-creative-strategy-what-actually-changed-and-what-didnt
- Segwise, Andromeda creative playbook ("Entity ID" is industry shorthand, not a Meta term): https://segwise.ai/blog/meta-andromeda-update-creative-strategy-2026
- Weltpixel, Event Match Quality on Shopify (vendor bands): https://www.weltpixel.com/blogs/news/meta-event-match-quality-emq-guide
- CustomerLabs, EMQ 8+: https://customerlabs.com/blog/improve-your-event-match-quality-from-ok-to-great/
- Aspire, partnership ads and the 2022 Meta meta-analysis (secondhand; original paper not verified): https://www.aspire.io/blog/partnership-ads-2025-hack-to-slash-paid-ad-costs
- Social Media Today, Advantage+ catalog Dynamic Media default (Sep 1, 2025): https://www.socialmediatoday.com/news/meta-updates-marketing-api-advantage-plus-expansion/758685/
- Bir.ch, value rules (renamed 2025): https://bir.ch/blog/meta-value-rules
- Logical Position, incremental attribution explained: https://www.logicalposition.com/blog/beyond-last-click-breaking-down-metas-incremental-attribution
- Frequency and fatigue thresholds: practitioner consensus, no Meta source (Segwise, Darkroom): https://segwise.ai/blog/how-to-measure-creative-fatigue and https://www.darkroomagency.com/observatory/signs-of-ad-fatigue (not verified as Meta guidance)
- Budget step size (20% every 3 days): practitioner consensus, Meta publishes no percentage (not verified): https://madgicx.com/blog/how-to-scale-facebook-ads
- Mobius internal: `docs/strategist-brain/source-lucky-account-structure.md` (Theriot, Radack, CTC, Foxwell, Loomer research of 2026-10-03 and 10-04).

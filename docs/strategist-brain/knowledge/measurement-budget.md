# Measurement and budget: attribution, MER, incrementality, allocation, goals

Read this before any answer that judges whether spend "works", moves budget between channels, forecasts a month, or sets or revises a client goal. Companion file: `cross-channel.md` (how the channels move each other). Mobius doctrine stands: Triple Whale last platform click is the default attribution for every attributed number on every surface; spend and delivery come from the platform.

## Which number answers which question
| Question | Number | Source |
|---|---|---|
| Is the business making money from marketing? | CM after ads, monthly dollars | Locus Profit |
| Is total spend the right size? | MER vs target; marginal aMER vs break-even | TW summary, Locus |
| Are we still buying new customers well? | aMER, NC-CAC, new-customer orders | TW new vs returning |
| Which ad or ad set wins? | TW last platform click CPA and orders (doctrine) | tw_ad_attr |
| Which channel starts journeys? | first click share vs last platform click share | tw_ad_attr, both models |
| Does channel X cause revenue at all? | lift or geo test iROAS | test results |
| Is a new customer from ad A worth more than from ad B? | TW 90-day customer value per ad | TW |
| Are we on track this month? | MTD revenue / MTD plan, spend pacing | Locus, forecast |
| Is the number even right? | TW spend vs platform API | Data Health tab |

## 1. How it works now (2025-2026)

### The four kinds of number, and what each one is for
| Number | Source in Locus | Answers | Never use it for |
|---|---|---|---|
| Platform-reported (Meta purchases, Google conversions, Klaviyo revenue) | platform APIs | how the platform's algorithm sees itself; optimisation signal | money decisions, client reports, cross-channel comparison |
| Pixel attribution (TW, 5 models) | `tw_ad_attr`, order journeys | which ad or channel touched the order; ranking ads and ad sets against each other | proving a channel caused revenue |
| Blended (revenue, MER, aMER, NC-CAC, contribution margin) | TW summary, Shopify, Locus Profit | is the business making money from marketing, in total | ranking ads |
| Incremental (lift tests, geo holdouts, MMM) | tests we run | what revenue would vanish if the spend stopped | daily optimisation (too slow, too coarse) |

Rule: rank inside a channel with pixel attribution, decide the total budget with blended numbers, decide the split between channels with marginal blended numbers plus incrementality where we have it.

### Attribution models in Triple Whale (what each over- and under-credits)
| Model | Credit rule | Over-credits | Under-credits | Use it for |
|---|---|---|---|---|
| Last platform click (Mobius default) | the last paid-platform click in the journey gets the order; organic, email and direct get it only when no paid click exists in the window | retargeting, brand search, the platform that touches last; Google brand and Meta retargeting look best | prospecting video, TikTok, YouTube, influencer, anything that starts the journey; email that closes a paid-started journey | ad and ad set ranking, the doctrine judging rule, Meta vs Google CPA |
| Last click | the last click of any kind, including email, SMS, organic, direct | email and SMS (they close many journeys), organic brand search | every paid channel, prospecting most of all | seeing how much email and organic really close |
| First click | the first recorded click | prospecting, TikTok, influencer, PR, SEO content | brand search, email, retargeting | which channels start new customer journeys; sanity check on prospecting |
| Linear paid | equal split across paid touches | channels with many cheap touches (retargeting, PMax) | single-touch prospecting | multi-platform journeys, Meta plus Google overlap |
| Linear all | equal split across every touch, organic included | email, SMS and organic in long journeys | paid channels in long journeys | how much of the journey is owned vs paid |

- Model spread test: for any channel, compute share of store revenue under first click and under last platform click. Share(first) much higher than share(last) = the channel starts journeys others close (demand creator). Share(last) much higher = demand harvester. Report this spread before arguing a channel "doesn't work".
- No click model counts views. A Meta video ad seen and not clicked, then a Google brand search, is a Google order in every TW click model. Prospecting video and TikTok are structurally under-credited in every model Locus shows by default.
- 90-day customer value per ad (TW) is the only per-ad view of what a customer is worth after the first order. Use it to compare ads that win on first-order CPA but bring one-and-done buyers.

### Platform reporting changes that break trend lines
- Meta, March 2026: click-through attribution now counts link clicks only; non-link clicks (likes, profile taps, comments) moved into "engage-through" attribution with the 5-second engaged-view conversions; the engaged-view video threshold dropped from 10 to 5 seconds. Effect: Meta-reported click conversions fell, reported CPA rose, and there is no legacy view. Never compare Meta-reported conversions across March 2026. TW numbers are unaffected.
- Meta Incremental Attribution (ad set setting, Sales objective, maximize conversions or value): counts and optimises toward conversions Meta predicts the ad caused. Reported CPA looks worse by design. Haus's July 2026 re-analysis: it now beats standard attribution in the typical test (1.26x incremental return July 2025 to June 2026, 1.38x for DTC-only brands; it lost 0.80x the year before). Not yet in the doctrine: propose it only as one numbered test ad set or a 50/50 campaign split, never as an account switch.
- Meta Advantage+ (Haus, 640 tests, July 2025): Advantage+ showed 2.4% higher platform ROAS than manual but 12% lower DTC iROAS; 58% of brands got better iROAS on manual. Advantage+ over-reports more. Keep the doctrine campaign; just do not read its platform ROAS as truth.
- Meta 7-day click under-reports incrementality by about 15% on average (Haus, DTC-only). Click-only views understate Meta; they do not overstate it, on average.
- Google conversions are dated by click, not by order, and fill in over days. At Mobius, Google's own count ran about 40% under TW's pixel (107 vs 178 orders, Sep 10 to 16 2026; Dartee 2 vs 15). Never judge Google on yesterday's Google-reported number.
- Klaviyo defaults: 5-day email click, 5-day email open, SMS click 5 days (accounts from Oct 2024), bot-click exclusion on for accounts from Aug 2024. Opens are inflated by Apple Mail Privacy Protection, so open-attributed revenue is mostly noise. Klaviyo will claim orders that Meta and Google also claim.
- Google incrementality experiments: minimum budget cut to about $5,000 with a Bayesian method (2025); 7-day minimum, 14+ days recommended. Meridian (Google's open-source MMM) has been generally available since Jan 2025; Robyn (Meta) and GeoLift (Meta, R) are open source.

### Blended metrics (Locus definitions)
- Revenue = Shopify total sales minus tax (TW). Before returns unless stated.
- MER = revenue / blended ad spend. Locus uses (net sales minus tax) / blendedAds. Two traps: TW's "Blended ROAS" (`totalRoas`) uses order revenue including tax before returns and runs about 18% above our MER; TW's help centre writes MER the other way up (spend / revenue, so 25% = 4.0x). Always say which.
- aMER = new-customer revenue / total ad spend (CTC definition; TW calls the same idea NC-ROAS). It isolates acquisition: returning revenue barely depends on today's spend.
- NC-CAC (TW: NCPA) = total ad spend / new-customer orders. All spend, not just prospecting, because all spend is what it costs to win a customer.
- Contribution margin (CM) = revenue minus COGS, shipping, fulfilment, payment fees, discounts, returns, and ad spend. CM before ads is the pool ads are paid from. CM after ads is the real goal: a month with lower revenue and higher CM is a better month.
- Marginal aMER = (new-customer revenue at spend B minus at spend A) / (B minus A). Marginal always falls faster than blended; blended trails it (CTC). Marginal is what tells you whether the next dollar pays.

### Diminishing returns, in one formula
- Most paid channels behave like revenue = k x spend^b with b between about 0.5 and 0.85 inside normal ranges (practitioner fit; b is lower for small audiences, single-SKU brands and late in a season). Consequence: marginal return = b x average return.
- So at b = 0.6, an account at 2.0x blended aMER is earning about 1.2x on its last dollar. A channel can look "profitable" on blended while its last 30% of spend loses money.
- Estimate b per brand from 8 to 12 weeks of weekly new-customer revenue vs weekly spend in log-log form, only if spend varied by at least 30% top to bottom (a flat budget gives one point, not a curve; 4 to 5 distinct spend levels are needed). Refit each quarter and after BFCM. Until fitted, assume b = 0.65 and say so.

## 2. Decision rules

### Minimum data before any call
- Noise band: weekly order count noise is about 1/sqrt(orders). Treat a week-on-week change as real only beyond 2/sqrt(orders): 50 orders a week = +/-28%, 100 = +/-20%, 400 = +/-10%, 1,000 = +/-6%. Inside the band, say "within noise" and do nothing.
- Compare like with like: same weekdays, 7-day windows, and the same period last year when the brand has history (golf peaks spring and Father's Day, patches peak festival season and holidays, BFCM everywhere).
- Account level: 7 days minimum, 14 to 28 days for a budget-split decision. Ad set level: doctrine (7 days, 3x goal CPA spent, 2+ TW sales).
- Lagged channels (TikTok, YouTube, upper funnel Meta): 21 to 28 days plus a 1 to 2 week tail before judging. Haus: TikTok lift is flat in the first half of a test and rises 247% in the second half, with another 68% after the test ends.

### Budget size: how much in total
- Break-even MER = 1 / CM-before-ads rate. Example: CM before ads 45% of revenue, break-even MER 2.22x.
- Target MER = 1 / (CM-before-ads rate minus target CM-after-ads rate). Example: 45% and a 15% target, target MER 3.33x.
- First-order break-even NC-CAC = first-order AOV x CM-before-ads rate. LTV-adjusted ceiling = 90-day CM per new customer (use TW 90-day value and Locus repeat data). Use the 90-day ceiling only for brands with proven repeat (consumable patches, socks, accessories); one-purchase categories (clubs, jewelry pieces) use first-order.
- Scale total spend while marginal aMER >= 1.1 x break-even aMER and MER stays above target over 14 days. Hold within +/-10% of break-even. Pull back when marginal aMER < break-even for 2 consecutive weeks.

### How fast to move
- Meta: doctrine, max 20% every 3 days. Google: max 20% per week per campaign on tROAS/tCPA bid strategies (target changes over 15% reset learning). Total monthly budget: move in 10 to 20% steps per fortnight unless a season dictates.
- One structural change per channel per fortnight. Two changes at once means no one can say which worked.
- Never cut a demand-creation channel more than 20% in the 3 weeks before a peak (BFCM, Father's Day); the harvest channels need what it builds.

### Allocation across channels
- The rule: the next dollar goes where marginal return is highest, until marginal returns are roughly equal across channels and all at or above break-even. Average ROAS by channel is the wrong input.
- Brand search: buy defensive presence, not volume. Bid to the impression share that blocks competitors, not to top-of-page at any price. Its iROAS is platform ROAS x an incrementality factor of about 0.37 when 3+ competitors bid on the brand and about 0.09 when few do (Haus, Sep 2025). Check auction insights first.
- PMax: exclude brand terms by default (Haus: 24% more incremental revenue and about 40% lower new-customer CAC on average when excluded); exception, AOV over about $238 where including brand won by 27%. Lucky driver launches sit near that line: test, don't assume.
- TikTok: start at 5 to 10% of paid social, judge at 21+ days on blended new customers and brand search, not on TikTok last click. Haus brands averaged 11% to start and settled near 13%; DTC brands averaged 7%.
- Typical mix at $10k to $50k a month (practitioner range, not a rule): Meta 60 to 80%, Google non-brand Shopping/PMax 10 to 25%, Google brand 3 to 8%, TikTok 0 to 15%. A brand far outside this needs a reason, not a fix.

### Incrementality: which test when
| Method | What it gives | Needs | Mobius fit |
|---|---|---|---|
| Meta Conversion Lift | randomised user holdout inside Meta; lift and iROAS | enough conversions (Meta suggests several hundred in the test); runs 2 to 4 weeks; free | best first test for any brand over about $15k a month on Meta; Meta grades itself, so treat as an upper bound |
| Google Conversion Lift / incrementality | Bayesian lift on one campaign | about $5k test budget, 14+ days | PMax or YouTube questions |
| Geo holdout (GeoLift or matched regions) | lift across all channels, includes halo to brand search, direct, Amazon | national sales spread across regions; 20 to 30% of the country held out; 3 to 4 weeks plus 1 to 2 weeks post | the gold standard for "does Meta drive the business"; only for brands with roughly 250+ orders a week; smaller brands cannot detect under about a 20% lift |
| On/off (time) test | before vs during vs after | a quiet season, nothing else changing, 2+ weeks off | weak (season and promos confound it); use for small channels (under 10% of spend) or brand search, and compare with last year |
| Spend-step test | marginal return at 2 or 3 spend levels | 2 weeks per level, 25 to 40% steps, nothing else changing | the cheap Mobius way to estimate b and marginal aMER for Meta |
| Light MMM (Meridian, Robyn, or a regression with adstock) | channel contribution and saturation over time | 52+ weeks of weekly data, spend that varied, 5 or fewer channels | directional only at our spend; good for TikTok and YouTube lag; never put brand search spend in as a driver (it is an outcome of demand, not a cause) |

- Power before launch: a test that cannot detect the effect you expect is a waste. Rule of thumb: required orders in the test window rise with 1/(lift squared). If the brand does under 400 orders in the test window, only effects above about 20% are detectable. Say this to the client up front.
- A test result moves budget in proportion to its precision: a wide interval is "learn more before moving", not a verdict (Haus, Jul 2026: noisy tests underperformed doing nothing 38% of the time).
- Retest each material channel once a year and after any big change (new structure, new channel share above 15%, BFCM).

### Forecasting a month and pacing it
- Forecast = returning revenue baseline + new-customer revenue.
  - Returning baseline: last 8 weeks of returning-customer revenue per day x season index from last year (same month / prior months ratio). Changes slowly; email and launches move it.
  - New-customer revenue = planned spend x expected aMER at that spend. Expected aMER at a new spend level = current aMER x (new spend / current spend)^(b minus 1). At b = 0.65, +30% spend means aMER x 0.91.
- Daily plan: spread the month by day-of-week weights from the last 8 weeks plus known events (sends, launches, holidays). Never a flat 1/30 per day.
- Pacing checks from day 7: MTD revenue / MTD plan. 90 to 110% = on pace. Under 90% for 3+ days = run the cross-channel diagnosis. Over 110% with MER on target = ask whether to add spend (marginal test first). Spend pacing outside +/-10% of plan = fix budgets before the weekend.
- Late in the month do not "catch up" by dumping spend: marginal return at a forced spike is lowest exactly then.

### Setting and revising KPI goals with a client
- Start from the P&L, not a ROAS someone heard. Inputs: AOV, COGS %, shipping and fulfilment, payment fees, discount rate, return rate, repeat rate and 90-day value. Output: CM before ads per order, break-even MER, break-even NC-CAC.
- Four goals, one page: (1) north star: monthly CM after ads in dollars; (2) volume: new customers per month; (3) efficiency guardrail: aMER or NC-CAC ceiling; (4) health guardrail: MER floor. Platform ROAS is never a client goal.
- Doctrine goals stay: goal cost per sale (Lucky: AOV / 3.0 = $52) and the keep line (trailing 30-day Meta spend / TW orders, refreshed monthly). The goal cost per sale must sit below the break-even NC-CAC, or the goal itself loses money.
- Growth vs profit stage: a brand in launch or a brand with strong 90-day repeat may run aMER at break-even to buy customers; a mature one-purchase brand targets aMER at break-even x 1.3 or better. Write the stage into the goal.
- Revise monthly with actuals; quarterly with the client. Mid-month only for a structural change (price, COGS, stock-out, new hero product, platform outage) or MTD more than 15% off plan after day 10 with a known cause. Never move a goal to make a bad week look fine.

### Goal worksheet (run it with the client; illustrative golf-brand numbers)
| Line | Value | Where it comes from |
|---|---|---|
| AOV | $156 | TW, last 90 days |
| COGS | 38% | client / Shopify cost per item |
| Shipping + fulfilment | 8% | client 3PL invoices |
| Payment fees | 3% | Shopify payments |
| Discounts + returns | 6% | Shopify discounts, returns report |
| CM before ads | 45% = $70 per order | sum of the above |
| Break-even MER | 1 / 0.45 = 2.22x | formula |
| Target CM after ads | 12% | client's profit goal |
| Target MER | 1 / (0.45 minus 0.12) = 3.03x | formula |
| Break-even NC-CAC, first order | $70 | AOV x 45% |
| 90-day value per new customer | 1.25x first order | Locus customers view, tw_orders |
| Break-even NC-CAC, 90-day | $88 | $70 x 1.25 |
| Goal cost per sale (doctrine) | $52 | AOV / 3.0, sits safely under $70 |
- Read-out to the client in one line: "Every new customer we buy for under $70 pays for itself on the first order; we aim for $52 so the month makes profit, and we will spend up to $88 only in launch or peak weeks."
- If the goal cost per sale sits above first-order break-even, say so on the first call; it means the brand depends on repeat purchases, and the repeat data must exist before we agree to it.

### Forecast worked example (illustrative)
- Inputs: returning revenue last 8 weeks $410/day; November season index 1.35 (last year Nov / Sep-Oct); planned spend $16k (Meta $13k, Google $3k); current aMER 1.9x at $14k; b = 0.65.
- Returning: $410 x 1.35 x 30 = $16.6k.
- New: aMER at $16k = 1.9 x (16/14)^(0.65 minus 1) = 1.9 x 0.954 = 1.81x, so $16k x 1.81 = $29.0k.
- Forecast revenue $45.6k, MER 2.85x. Below the 3.03x target: either accept for BFCM acquisition (customers bought now repeat in December) or cut to the spend where MER meets target. Show the client both and let them choose.
- Then spread by day: BFCM week alone usually carries 30 to 45% of November for these brands (check last year in TW before using any number).

### Spend-step test protocol (cheapest way to find marginal return)
1. Pick a quiet 6-week window (no launch, no big sale, not the 3 weeks before BFCM).
2. Weeks 1-2 at current spend S. Weeks 3-4 at 1.3 x S (in 20% Meta steps every 3 days, per doctrine). Weeks 5-6 at 0.8 x S or back to S.
3. Hold everything else: no new structure, normal test cadence, same email calendar shape.
4. Measure per 2-week block: total ad spend, new-customer orders and revenue (TW), returning revenue, GSC brand clicks.
5. Marginal aMER = change in new-customer revenue / change in spend between blocks. Fit b from the three points.
6. Decision: marginal above break-even (90-day for repeat brands) = room to scale; below = the current spend is past the efficient point.

### Geo holdout runbook (brands with 250+ orders a week only)
1. Pre-period: 8+ weeks of daily orders by state or DMA from Shopify shipping addresses.
2. Pick holdout regions covering 20 to 30% of orders, spread across the country (not 5 hand-picked DMAs; that biases the result).
3. Power check (GeoLift power finder or a simple simulation on pre-period data): minimum detectable effect must be below the lift you expect. If not, do not run.
4. Exclude holdout regions in Meta location targeting for 3 to 4 weeks. Nothing else changes.
5. Read lift on total store orders and new customers (plus Amazon if the brand sells there), 1 to 2 weeks after the test ends too.
6. iROAS = incremental revenue / spend in test regions. Compare to TW last platform click ROAS for the same period: the ratio is the brand's Meta incrementality factor. Use it to adjust Meta's TW numbers in budget decisions until the next test.

## 3. Diagnostics

| Symptom | Likely causes, in order | Number that confirms it | Fix |
|---|---|---|---|
| MER fell, revenue flat | 1. spend rose (scaling into diminishing returns) 2. TW lost or doubled a platform's spend 3. returning revenue fell | 1. spend up, new-customer revenue up less than (spend change x b) 2. TW `fb_ads_spend` vs Meta `daily_insights` (Data Health tab) 3. returning revenue vs 8-week baseline | 1. step spend back 10 to 20% to where marginal aMER >= break-even 2. fix data, rerun numbers 3. go to email and SMS |
| MER rose sharply overnight | 1. a platform's spend dropped out of `blendedAds` (it stays internally consistent) 2. big email or promo day 3. real | spend vs platform API; sales calendar | always check data first; a 7.7x MER at Bonk was a missing Meta feed |
| aMER falling, MER fine | returning customers are carrying the account; acquisition is weakening | new-customer orders and NC-CAC trend 4 weeks; new vs returning split | do not scale on MER; fix creative and offer for new customers |
| Platform ROAS up, store revenue flat | credit moving between channels; retargeting or brand share growing | sum of platform-claimed revenue / store revenue rising; Meta audience segments (existing customers share) | treat as no change; do not shift budget toward the "winner" |
| Google brand ROAS 15x+ | it is harvesting demand Meta or organic made | brand search impression share and competitor count in auction insights; GSC organic brand clicks | cap brand spend; never fund it from Meta |
| NC-CAC rising, CPMs flat | creative fatigue or conversion rate down | Meta CTR, hook rate, frequency; store CVR for new visitors in GA4 | new concepts (doctrine); check site, stock, price |
| NC-CAC rising, CPMs up 20%+ | seasonal auction (Q4, Father's Day), competitor push | CPM trend vs last year same weeks | accept and lower volume, or raise the ceiling for the season with the client in writing |
| Forecast missed, spend on plan | aMER assumption too high or season index wrong | actual aMER vs assumed; returning revenue vs baseline | refit b and season index; reforecast; tell the client the cause |
| Lift test says channel X does nothing | test underpowered, too short for a lagged channel, or truly not incremental | confidence interval width; test length vs channel lag | if the interval is wide, extend or rerun; if tight and near zero, cut in steps and watch blended new customers |
| Klaviyo revenue above 35% of store revenue | open-attribution and overlap with paid | Klaviyo revenue by click only; TW last click email share | report click-only email revenue; do not credit email with paid-started orders |
| Google-reported conversions far below TW | conversion lag, consent mode, tag issues | Google conversions by conversion time vs TW Google orders over 14 days | judge Google on TW with a 7-day lag; fix tags if the gap holds past 14 days |

## 4. How measurement and budget decisions affect the other channels

- Any budget move changes the attribution of the other channels before it changes the business. Meta scale-up: Google brand and email claim more orders within days. Meta cut: the same channels lose orders over 1 to 3 weeks. Read the total first.
- Before a budget move, record the baseline for: store revenue, new-customer orders, GSC brand clicks and impressions, Google brand conversions (TW), direct sessions (GA4), new email and SMS sign-ups, Klaviyo flow revenue. After the move, judge on the same list after 14 days (21 to 28 for TikTok or YouTube).
- Switching attribution model or window moves no money; it moves credit. Never present a model switch as a performance change.
- Cutting a channel to raise MER usually raises MER and lowers CM dollars. Show both.
- Omnichannel brands: for brands with 25%+ of sales off-site (Amazon, retail), about a third of Meta's impact lands off-site (Haus) and TikTok shows 1.9x more value omnichannel. Add Amazon sales to the read or the DTC numbers will under-credit paid social.

## 5. What a great suggestion looks like

Format: WHAT to do. The NUMBER and its source. WHY in one line. WHAT TO WATCH and for how long. HOW SURE.

Example A: scale on marginal, not average (illustrative numbers)
- WHAT: Raise the Lucky Golf | Sales budget from $450 to $540 a day, in two 10% steps 3 days apart.
- NUMBER: Last 28 days, aMER 1.95x on $12.6k spend (TW new-customer revenue); the step from $375 to $450 in early October returned marginal aMER 1.70x over 14 days; break-even aMER at 45% CM before ads is 2.22x on first order, 1.55x on 90-day value (TW 90-day customer value).
- WHY: the last step paid back on 90-day value with room, so the next one probably does too.
- WATCH: new-customer orders and NC-CAC in TW for 14 days; if marginal aMER from $450 to $540 falls below 1.55x, step back to $450. Also GSC brand clicks (should rise).
- HOW SURE: medium. One spend step is one point on the curve; the second step makes b measurable.

Example B: brand search spend cut (illustrative)
- WHAT: Lower the Google brand campaign tCPA bid so impression share drops from 98% to about 80%, saving about $600 a month, and move that money to Meta.
- NUMBER: Google brand platform ROAS 14x; auction insights show 1 competitor at under 10% overlap; GSC shows the brand ranks #1 organically with 2,100 brand clicks a month.
- WHY: with almost no competition, brand search is worth about 9% of what it reports (Haus incrementality factor 0.09).
- WATCH: total brand clicks (paid + organic, GSC + Google Ads) and store new-customer orders for 3 weeks; if paid + organic brand clicks fall over 5%, restore.
- HOW SURE: medium-high on direction, low on size; this brand is too small for a test to measure it.

Example C: first lift test for a brand (illustrative)
- WHAT: Run a Meta Conversion Lift test on the Sales campaign for 28 days with a 10% holdout, before BFCM planning closes.
- NUMBER: Meta spends $22k a month, about 280 TW orders a month; doctrine judges on TW last platform click which cannot see view-driven brand search.
- WHY: the BFCM budget decision is the biggest of the year and we have never measured what Meta adds.
- WATCH: test cell vs holdout purchases and lift confidence weekly; do not change the campaign during the test (no new structure, budget moves under 20%).
- HOW SURE: the test is cheap; expect a wide interval; read it as an upper bound because Meta grades itself.

## 6. Traps
- "Google ROAS is 12x, move money there." Brand search and retargeting score highest in every click model because they touch last. Harvest is not demand.
- "We cut Meta and revenue held, so Meta was wasted." Brand search, direct and email coast on built demand for 1 to 3 weeks, returning revenue for 4 to 8. Judge a cut after 3 to 4 weeks and against last year.
- "MER is up, we are doing great." MER rises when spend falls even as new customers collapse. Always show aMER and new-customer count next to MER.
- "Sum of channel revenues = store revenue." Platform-claimed revenue usually adds to 130 to 180% of store revenue. Never add channel numbers from different sources.
- "Meta ROAS fell in March 2026, performance fell." Meta changed what a click is. Check TW first.
- "TW MER says 4x, Locus says 3.4x, one is wrong." Different revenue basis (with tax, before returns) and direction conventions. Name the source.
- "TW spend looks right because it adds up." A platform can vanish from `blendedAds` and everything still sums. Only an outside witness (Meta's own API) catches it.
- "Average aMER is above break-even, so scale." Marginal = b x average. At 2.0x average and b = 0.6, the last dollar earns 1.2x.
- "The lift test was not significant, so the channel does nothing." Not significant means not measured. Check the interval width and the test length against the channel's lag.
- "Set the goal at 3x ROAS." A goal without COGS, shipping, returns and repeat rate is a guess. Build it from CM.
- "A 15% weekly drop at 60 orders a week is a crisis." It is inside the noise band (+/-26%). Check two weeks and last year before acting.
- "Advantage+ ROAS beats manual, so Advantage+ is better." It over-reports more (Haus). Compare on TW and blended new customers.
- "Google under-counts, so Google is bad." At Mobius, Google's own count ran about 40% below TW's pixel; judge Google on TW, a week later.
- "First click says TikTok is great, scale it." First click over-credits starters as much as last click over-credits closers. Confirm with blended new customers or a test.
- "aMER is fine, so new customers are fine." aMER uses all spend; if spend was cut, aMER rises while new-customer count falls. Read the count too.
- "Use 90-day value for every brand's CAC ceiling." Only where repeat is proven in tw_orders; a one-purchase category on a 90-day ceiling loses money on every order.
- "Forecast = last month x growth rate." Returning and new revenue behave differently; forecast them separately, new from spend and the curve.
- "The test held out 5 matched DMAs and the interval is tight, so it is precise." Hand-picked markets hide error that the interval does not show (Haus, Jul 2026).
- "We measured Meta once, the factor holds forever." Structure, creative and season change it; retest yearly and after big changes.

## 7. Sources
- Triple Whale, attribution models (KB): https://kb.triplewhale.com/en/articles/5960333-attribution-models-in-triple-pixel
- Triple Whale, summary page metrics library (NC-ROAS, NCPA, MER as spend/revenue; page returned 403 to direct fetch, formulas taken from search extract, not verified on the page): https://kb.triplewhale.com/en/articles/6127778-summary-page-metrics-library
- Triple Whale, how to choose an attribution model: https://www.triplewhale.com/blog/how-to-choose-attribution-model
- Common Thread Collective, MER and aMER, marginal aMER, break-even example: https://commonthreadco.com/blogs/coachs-corner/marketing-efficiency-rating-mer-ecommerce
- Bloom Analytics, aMER worked examples: https://www.bloomanalytics.io/blog/amer-acquisition-mer
- Haus, The Meta Report (640 tests, Jul 2025): https://www.haus.io/blog/the-meta-report-lessons-from-640-haus-incrementality-experiments
- Haus, Meta Incremental Attribution vs standard (Jul 2026): https://haus.io/blog/is-metas-incremental-attribution-outperforming-standard-attribution-what-the-data-shows
- Haus, When is branded search worth it (Sep 2025): https://www.haus.io/blog/when-is-branded-search-worth-the-investment
- Haus, PMax including vs excluding brand terms: https://haus.io/blog/pmax-experiments-including-excluding-branded-search-terms
- Haus, The TikTok Report (Dec 2025; full report gated, figures from summaries): https://www.haus.io/blog/the-tiktok-report
- Haus, Fast, confident and wrong: noisy tests (Jul 2026): https://haus.io/blog/fast-confident-and-wrong-the-risk-of-noisy-incrementality-tests
- Haus, research reports index: https://haus.io/blog-categories/research-reports
- Meta March 2026 attribution update (link clicks only, engage-through): https://ppc.land/meta-rewrites-click-attribution-rules-finally-aligning-with-google-analytics/ and https://www.leafsignal.com/blog/meta-march-2026-attribution-update
- Meta Incremental Attribution explainer (third party, not Meta docs): https://booleanmaths.substack.com/p/understanding-metas-new-incremental
- Google incrementality testing from $5k: https://searchengineland.com/google-makes-incrementality-testing-easier-cheaper-and-faster-464575 and https://ppc.land/google-lowers-incrementality-testing-threshold-to-5-000-for-advertisers/
- Google Meridian open to everyone (Jan 2025): https://blog.google/products/ads-commerce/meridian-marketing-mix-model-open-to-everyone/
- Meta GeoLift (open source): https://github.com/facebookincubator/GeoLift (not fetched this session)
- Meta Robyn MMM (open source): https://github.com/facebookexperimental/Robyn (not fetched this session)
- Meta Conversion Lift via Triple Whale KB (prerequisites not verified against Meta): https://kb.triplewhale.com/en/articles/10605805-meta-conversion-lift-experiment
- Klaviyo attribution settings: https://help.klaviyo.com/hc/en-us/articles/11118357030555
- Marginal ROAS and saturation curves (vendor explainer): https://booleanmaths.com/resources/marginal-roas-saturation-curves
- Power-curve exponent range b = 0.5 to 0.85 and the mix ranges: practitioner heuristics, not verified against a published benchmark.
- Mobius internal: Lucky numbers from `docs/strategist-brain/source-lucky-account-structure.md`; Google vs TW gap and TW traps from Locus build notes (2026-09).

# Retention and LTV

Scope: how much a customer is worth after the first order, how fast they come back, what that lets paid spend to acquire them, and what to do about it. Read with `email-sms.md` (the channel that does most retention work) and the Meta doctrine (one Sales CBO, judge the ad set first).

## 1. How it works now (2025-2026)

### The data the Strategist has
- `tw_orders` (Locus, from Triple Whale journeys): one row per order, `customer_id`, date, total, cart product ids (ADD-TO-CART products, not line items: a signal of what was bought, not a receipt), and the last-platform-click source. 400 days of history per brand (backfilled 2026-10-05). The `customers` view returns repeat rate, order number, time to second order, sources, first and second carts.
- Locus Customers page: LTV:CAC (365 days, or 90 days while history is short), CAC, first order value, "pays back on order one", worth in 90 days / a year, come-back rate and median days to second order, LTV curve 30 to 365, cohort table, first product then next, repeat orders from ads vs on their own.
- Locus thresholds already set: LTV:CAC 3x = healthy, under 1.5x = buying revenue.
- Triple Whale: new vs returning orders and revenue, CAC (blended ad spend / new customers), contribution margin, 90-day customer value per ad (under the chosen attribution model).
- Klaviyo: flows, campaigns, segments by order count and first product. Meta: Advantage+ audience segments reporting (new / engaged / existing) on sales campaigns.
- AOV everywhere in Locus = revenue / TW total orders. Revenue = Shopify total sales minus tax.

### What changed recently and why it matters
- Acquisition got more expensive: blended DTC CAC rose roughly 25 to 40% from 2021 to 2025 (vendor estimate). Fewer brands can be profitable on order one, so the second order decides who survives.
- AMP 2025 DTC Mega Report ($10.1B of sales): 63% of brands recover CAC on the first order, 37% do not; median contribution margin 48%, 31% of brands under 10%.
- Same report: new customers repurchase 14.7% within 90 days; existing (returning) customers 33% within 90 days and 51.4% within 365 days. The second order is the hard one; after it, people keep coming.
- Meta Andromeda (2025) and Advantage+ sales campaigns pick audiences themselves. Existing customers leak into "prospecting" unless capped or reported. Meta's audience segments reporting shows the split; use it.
- Klaviyo bills on active profiles since Feb 2025, so a big dead list is now a cost, not an asset.

### Lucky Golf calibration (measured 2026-10-05 in Locus)
- LTV90 $165 vs first order $154 (1.07x): almost all value is in order one. 9% repeat. LTV:CAC 1.7x at 90 days. Median second order after 17 days (the add-on buyer: a second wedge or a putter soon after the first club).
- Returning customers 15 to 25% of orders; 75 to 85% new buyers on BF weekends.
- Read: Lucky is an order-one business. Paid must be profitable on the first order; retention is upside, not the plan.

### What "good" looks like by category (vendor ranges, directional only)
| Category (Mobius brands) | 12-month repeat rate | Median days to 2nd order | Retention model |
|---|---|---|---|
| Consumables: patches (Party Patch), pet (VetriPaws) | 30 to 40%, up to 55% | 25 to 60 | Replenishment, subscription |
| Apparel, socks (Golf Sock, Dartee belts) | 15 to 26% | 15 to 30 | New drops, seasonal, cross-sell |
| Jewelry (Ice & Gold) | 15 to 25% (gifting spikes) | long, occasion-led | Occasions, gifting calendar, VIP |
| Golf equipment (Lucky, Grunk, Bonk) | 10 to 18% | short for add-ons, then a long gap | Add-on in 30 days, then next club or season |
| Hockey gear (Yak) | 15 to 25% (consumables like tape lift it) | season-led | Season start, consumable re-buys |
- Month-3 retention of 20 to 30% for a cohort is healthy DTC; under 15% signals a product or onboarding problem (vendor guidance, synthesized).
- Subscriptions: about 7.1% monthly churn average (4.1% voluntary, 3.0% involuntary; Recharge 2024 via EightX). Supplements 5 to 8% monthly; under 5% strong, over 10% a problem. Involuntary (failed payment) churn is 30 to 40% of the total, the cheapest to fix.

## 2. Core definitions (use these words, the same way every time)
- **First-order contribution** = AOV x gross margin % minus shipping, payment fees, pick/pack and discount, minus CAC. Positive = profitable on order one.
- **LTV (revenue)** = cumulative revenue per customer over N days from first order. Say the window: LTV90, LTV180, LTV365.
- **LTV (contribution)** = the same in contribution margin. This is the one to divide by CAC. Revenue LTV:CAC flatters every brand by 1/margin.
- **CAC** = paid ad spend / new customers (TW). Fully loaded CAC adds creative, agency, influencer and discount cost; say which one.
- **Payback** = days until cumulative contribution per customer covers CAC. "Pays back on order one" = first-order contribution before CAC is at least CAC.
- **Repeat rate (cohort)** = share of a first-order cohort with a second order within N days. Not the same as "returning share of orders".
- **Returning share** = returning-customer orders / all orders in a period. Rises when acquisition falls, so it is not proof of loyalty.
- **Time to second order** = MEDIAN days, never mean. Means are dragged by the long tail (averages 50 to 100 days, medians 15 to 35 in vendor data).
- **Cohort** = customers grouped by first-order month (TW: first valid tracked purchase, $0 orders excluded) or by acquiring ad / channel / first product.

### Computing it from `tw_orders` (D1 / SQLite; columns: act_id, order_id, customer_id, date, total, currency, products_json, source)
- Left-censoring first: the table starts 400 days back, so a customer's first row may not be their first order ever. Only treat cohorts whose first order is 6+ months after the window start as clean "new" cohorts, or cross-check with TW's new vs returning counts. Rows with an empty customer_id are guest or unmatched orders: exclude them from cohort math and say how many.
- Cohort repeat within 90 days, by first-order month:
```sql
WITH o AS (SELECT customer_id, date, total, source, products_json,
             ROW_NUMBER() OVER (PARTITION BY customer_id ORDER BY date, order_id) AS n
           FROM tw_orders WHERE act_id = ? AND customer_id IS NOT NULL AND customer_id <> ''),
f AS (SELECT customer_id, date AS d1, total AS t1, source AS src1 FROM o WHERE n = 1),
s AS (SELECT customer_id, date AS d2 FROM o WHERE n = 2)
SELECT substr(f.d1, 1, 7) AS cohort, COUNT(*) AS customers,
       ROUND(AVG(CASE WHEN julianday(s.d2) - julianday(f.d1) <= 90 THEN 1.0 ELSE 0 END), 3) AS repeat90
FROM f LEFT JOIN s USING (customer_id)
WHERE f.d1 <= date('now', '-90 day')
GROUP BY cohort ORDER BY cohort;
```
- LTV90 by acquiring source: sum `total` per customer where `julianday(date) - julianday(d1) <= 90`, then average by `src1`; divide by the first-order average to get the LTV90 / first-order multiple.
- Median days to second order: compute the gaps (d2 minus d1) per customer, order them, take the middle row (`LIMIT 1 OFFSET count/2`); SQLite has no MEDIAN.
- First product then next: `json_extract(products_json, '$[0]')` on n = 1 and n = 2 rows. It is the first ADDED product, a signal, not the purchased line item.
- Revenue in `tw_orders` is order `total` (TW journey total_price), which can differ from Locus revenue (Shopify total sales minus tax). Use it for ratios inside the table, not to restate store revenue.

### Setting a CAC ceiling from the numbers (worked)
- Inputs: AOV $140, gross margin 70%, shipping + fees + pick/pack $18, no discount. First-order contribution before ads = 140 x 0.70 minus 18 = $80.
- Order-one brand (LTV90 / first order under 1.15): CAC ceiling = $80 (breakeven) or about $64 for a 20% contribution cushion. As a TW new-customer ROAS: 140 / 80 = 1.75x breakeven, 140 / 64 = about 2.2x target.
- Repeat brand: LTV90 contribution $115 (first order $80 + repeat $35): ceiling = 80 + 0.5 x 35 = $97.50, payback inside 90 days.
- Always state which number the ceiling rests on and its age; re-run quarterly or after any price, offer or margin change.

### Playbook by Mobius category
- Golf equipment (Lucky, Grunk, Bonk): order-one economics. Retention levers in order: add-on on order one (second wedge, putter cover, towel), day 10 to 20 nudge for the add-on, then a long quiet gap, then new-club launches to past buyers (launch list first, e.g. Lucky's members-first days). Do not run discount winbacks on a 90-day clock; a golfer does not need a club every quarter.
- Apparel and accessories (Dartee belts, Golf Sock): new drops and colorways drive repeat; launch to buyers first; bundle builders raise AOV; winback at 90 to 120 days.
- Consumables (Party Patch, pet): replenishment clock is the whole game. Subscribe-and-save offered on the first order and in the replenishment email; reminder at days of supply minus 5 to 7; judge LTV180, not LTV90.
- Jewelry (Ice & Gold): occasion-led. Capture occasions (birthday, anniversary, holidays) at signup and post-purchase; VIP early access; gifting cohorts judged on referral and recipient capture, not on the buyer's repeat alone.
- Hockey gear (Yak): season-led. Back-to-season sends in late summer, consumables (tape, laces, accessories) between big purchases, team and parent buying (one buyer, many players).

## 3. Decision rules

### Which window to judge CAC on
- LTV90 / first order under 1.15 (Lucky 1.07): judge paid on FIRST-ORDER contribution. Do not let a hoped-for repeat justify a higher CAC.
- LTV90 / first order 1.15 to 1.5: allow CAC up to first-order contribution + 50% of the 90-day repeat contribution.
- LTV180 / first order over 1.5 (consumables, subscriptions): allow CAC up to 180-day contribution LTV / 2 if cash allows a 3 to 6 month payback.
- Never use 365-day LTV for a target until there are 2 full matured cohorts (365+ days old) with 100+ customers each.

### LTV:CAC and payback thresholds (contribution LTV)
- Under 1.0x at 90 days AND no repeat curve: losing money on every customer. Cut spend on the worst-paying ads first, fix offer or AOV.
- 1.0 to 1.5x: buying revenue (Locus rule). Hold spend, no scale, work AOV and second order.
- 1.5 to 3x: working. Scale in steps per the Meta doctrine while first-order contribution stays positive or payback stays under 6 months.
- 3x+: healthy; scale. Over 5x for two quarters: probably under-spending on acquisition. Test a higher CAC ceiling (raise the spend 20% and watch new-customer CAC).
- Payback: under 3 months excellent, 3 to 6 good, 6 to 12 only with strong cohorts and cash, over 12 red flag.

### Minimum data before a retention call
- Cohort repeat rate: 100+ new customers in the cohort AND the cohort at least as old as the window (a 30-day-old cohort has no 90-day repeat rate).
- Per-ad LTV: 50+ new customers acquired by that ad and 60 to 90 days of age. Under 30 customers, do not move CAC targets on it.
- Time to second order: 30+ second orders.
- First product then next: 20+ customers per first product before naming "the" second product.
- Compare cohorts at the same age only (day 60 vs day 60). BFCM cohorts compare to last year's BFCM cohort, not to October.

### Acting on per-ad customer value (TW 90-day value per ad)
- Ad's 90-day value per new customer 20%+ above the account average with 50+ customers: raise that ad set's CAC allowance by the same share; tell the creative team the angle that brings better customers (feed the Asana test library).
- 20%+ below (typically discount or giveaway angles): lower its CAC allowance; keep it only if its first-order contribution is positive.
- Same angle, two concepts, very different LTV: the concept is attracting a different customer. Brief more of the high-LTV concept.
- The anchor rule still holds: an anchor ad carrying a working ad set is replaced with a better-LTV ad, never just switched off.

### First product to second product
- From `tw_orders` first and second carts: list each first product's top 3 second products and the median days between.
- Build the second-order nudge for the top 2 first products at median days minus 3 to 5 (email-sms.md flow table).
- If over 40% of second orders come within 30 days, the second product is an add-on: sell it on the first order (bundle, cart upsell, post-purchase one-click offer) instead of waiting.
- If a first product has a repeat rate under half the brand average, it is a one-and-done entry product. Fine if first-order contribution is positive; never use it as the CAC-justifying hero.

### Post-purchase, loyalty, subscriptions: when each is worth building
- Post-purchase flow: always. Order of value: delivery/how-to (cuts returns, sets expectations), review request, second-product nudge, then winback.
- Post-purchase one-click upsell (thank-you page): build when an add-on attach rate is under 15% and a cheap natural add-on exists (towel, tape, extra patches). Target 5 to 10% take rate.
- Loyalty points program: only when 12-month repeat rate is 20%+ and purchase frequency is 2+ a year. Below that it pays rewards to people who would have come back anyway. For low-repeat brands use referral (give/get) instead.
- VIP tier: top 10% by spend; early access and gifts, not deeper discounts.
- Subscriptions: only where the product empties on a clock (patches, pet). Discount 10 to 15%, first-shipment flexibility (skip, swap, delay), dunning with 3+ retries. Judge on 3-month subscriber retention and involuntary churn share; if involuntary is over 40% of churn, fix payments before anything else.

### When a brand lives on returning customers (returning share over 50% of revenue)
- First ask: is the returning share high because retention is strong (cohort repeat rates rising) or because acquisition is shrinking (new customers per month falling)? Check new-customer count trend in TW for 6 months.
- Manage paid on NEW-customer economics: new-customer CAC and new-customer revenue per spend, not MER. MER looks great on a returning-heavy brand while the base slowly shrinks.
- Cap existing customers in Meta (Advantage+ existing-customer budget cap, purchaser lists from Klaviyo/Shopify as existing customers) and read audience segments reporting. Retargeting existing customers with paid is paying for orders email gets for free.
- Set a floor on new customers per month (e.g. at least the number needed to replace lapsed customers: active customers x annual churn / 12).
- Build retention to protect the base: second-order nudge, replenishment, VIP early access, winback at 1.5 to 2x the median repeat interval.
- Watch the active customer count (bought in the last 12 months) monthly. Flat revenue with a falling active count = a base being harvested.

### Reading TW 90-day customer value per ad
- It is the average revenue in the 90 days after first purchase for new customers credited to that ad, under the selected attribution model. It is revenue, not contribution: multiply by margin before comparing to CAC.
- It needs maturity: an ad launched 30 days ago has no 90-day value yet, only a partial one. Compare ads at the same customer age or wait.
- Use it as a tie-breaker and a CAC-allowance input, never as the weekly test verdict (that stays the doctrine's judging rule on TW last platform click CPA and the ad set's role).
- Big gaps usually trace to the angle or offer, not the format: discount and giveaway angles bring lower-value customers, problem/solution and "built to last" angles bring higher. Record the finding against the angle in the Asana test library so future briefs inherit it.

### BFCM and seasonal cohorts
- Judge BF and CM paid on first-order contribution only. BF cohorts repeat less at full price; any LTV bonus is upside.
- Post-BF sequence for new BF buyers: delivery/how-to, review request at delivery +10 days, the full-price add-on or new-product nudge in December (gifting), then quiet until the brand's natural next moment (Lucky: the January driver launch to buyers first).
- Never send a BF buyer a deeper discount in December than they paid in November; it teaches the cohort to wait for markdowns and burns contribution.
- Compare the 2026 BF cohort to the 2025 BF cohort at day 30, 60 and 90 (Locus cohort table), not to October.
- January: winback to lapsed 2025 holiday buyers (bought Nov to Dec 2025, nothing since), full-price new product first, offer only on the last email.

### Monthly retention review (first Monday, per brand; flag only what fails)
1. New customers per month (TW), 6-month trend.
2. Cohort repeat rate at day 30/60/90 for the last 3 mature cohorts vs the same months last year.
3. Median days to second order and whether the second-order flow timing matches it.
4. LTV:CAC (Locus) and first-order contribution vs the CAC ceiling in use.
5. Top 3 first products and their second products; any stock gap on a top second product.
6. Returning share of revenue and the new-customer floor.
7. Meta existing-customer share of spend (audience segments) vs the cap.
8. Per-ad 90-day value for ads with 50+ new customers: any 20%+ outliers to act on.
9. Subscription brands: monthly churn split voluntary/involuntary, failed payment recovery rate.
10. Active customers (bought in the last 12 months) count, month over month.

### Size and pace of retention changes
- One retention change per flow at a time; judge flows over 4 weeks or 1,000+ recipients per arm.
- Changing the CAC target off LTV: move it at most 20% per month and re-check the cohort 30 days later.
- Do not change offer, flows and paid targeting in the same 2 weeks; the cohort read becomes impossible.

## 4. Diagnostics
| Symptom | Likely causes, in order | The number that confirms it | Fix |
|---|---|---|---|
| Repeat rate falling cohort over cohort | 1 Acquisition mix shifted (discount, giveaway, new ad angle) 2 post-purchase flows broken 3 product or fulfilment problem | 1 repeat rate by acquiring ad or source in tw_orders 2 post-purchase flow recipients and order rate 3 returns, reviews, support tickets | 1 lower CAC allowance on low-LTV ads 2 fix flows 3 escalate to the client |
| LTV:CAC falling while LTV steady | CAC rising: creative fatigue, CPM up, conversion rate down | TW new-customer CAC trend; Meta CPM, CTR, frequency; site conversion | Paid problem, see the Meta files |
| Returning share up, revenue flat | New customers falling | TW new customers per month, new-customer revenue | More acquisition; check new-customer CAC ceiling |
| Returning share down, revenue up | Acquisition scaling (good) or retention decaying (bad) | Cohort repeat rate at same age vs last year | If cohorts hold, it is growth; if not, fix retention |
| High first-order AOV, low LTV | One-and-done hero product; buyers are gift buyers | First product repeat rate; ship-to vs bill-to differences (gifting) | Sell add-ons on order one; gift-recipient capture |
| BFCM cohort repeats worse | Deal hunters | BFCM cohort day-90 repeat vs non-BFCM cohort | Full-price second-order nudge, not another discount; value BF CAC on first order only |
| Subscription churn spike | Failed payments, a price change, shipment too frequent | Involuntary vs voluntary split; skip and delay usage | Dunning, frequency options |
| Time to second order lengthening | Nudge mistimed, stock gaps on the second product, seasonality | Median days by cohort; stock of top second products | Re-time flows; stock the add-on |
| Per-ad LTV wildly different between models | Attribution model, not customer quality | Same ad's 90-day value under last platform click vs first click | Judge on first click for acquisition quality, last platform click for spend |
| Early cohorts in Locus look like heavy repeaters | Left-censoring: people who bought before the 400-day window counted as new | Repeat rate of the first 3 cohort months vs later ones; TW returning share in those months | Drop the first 6 months of the window from cohort reads |
| Second orders cluster in 0 to 3 days | Split shipments, a forgotten item, a re-order after a payment failure | Gap histogram; same products in both carts | Not retention: count as order-one AOV; fix cart upsell |
| LTV up, contribution flat | Repeat orders bought with discounts | Discount share on repeat orders (Shopify), winback code usage | Remove codes from second-order flows, test no-discount arm |
| Lots of "new" customers who are not new | Guest checkout, new emails, customer_id splits | TW vs Shopify new-customer counts | Treat TW as the house number; note the gap |

## 5. How retention affects the other channels
- Better retention raises MER and aMER without paid doing anything better. A rising MER on a retention-heavy month is not a reason to scale Meta; check new-customer CAC first.
- Paid acquisition quality shows up in LTV 30 to 90 days later. An ad that wins on CPA with a discount angle can lose on 90-day value. Read per-ad customer value before calling a winner a winner for scaling (not for the weekly test call, which stays on the doctrine's judging rule).
- Email and SMS take credit for repeat orders; Meta retargeting also claims them. Repeat orders "from ads" in Locus include returning customers who clicked an ad; count them as retention revenue Meta touched, not acquisition.
- Cutting paid shrinks retention revenue later: fewer new customers this quarter = fewer returning customers next quarter. Model it: lost new customers x 90-day repeat rate x repeat AOV.
- Discount-heavy acquisition (BF, giveaways) inflates new customers and deflates LTV; set the season's CAC target on first-order contribution and let retention be upside.
- Before a retention change: baseline TW returning orders, returning revenue, cohort repeat rate at day 30/60/90, Klaviyo flow revenue. After: the same at 30 and 60 days. Real gains show up in the cohort repeat rate, not in Klaviyo-attributed revenue.
- Real vs credit shifting: if Klaviyo flow revenue rises and TW returning revenue does not, the flow took credit. If both rise and new-customer revenue holds, it is real.
- Google brand search catches returning customers who type the brand name. Brand search ROAS rises with retention and with every email send; it is not acquisition. Check Search Console brand clicks and TW returning orders before crediting brand campaigns.
- Meta Advantage+ will spend on existing customers if they convert cheaply. Without purchaser lists uploaded and an existing-customer cap, a rising TW Meta ROAS can be existing customers being re-bought. Check Meta audience segments (existing share) and TW new-customer orders from Meta in the same week.
- Retention fixes lift paid conversion: post-purchase how-to emails cut returns and bad reviews, which raises product page conversion for paid traffic weeks later. Expect Meta CPA to improve slightly with no ad change.
- A price or offer change for paid (a deeper first-order discount) changes the cohort it buys. Before approving one, ask the Strategist's own question: what does this cohort's 90-day value look like at the last discount level we ran?
- What to check in other channels before a retention change: Meta existing-customer share, Google brand spend, Klaviyo flow inventory, TW new vs returning split. After: the same 30 and 60 days later.

## 6. What a great suggestion looks like
Format: WHAT, NUMBER and its source, WHY in one line, WHAT TO WATCH and for how long, HOW SURE.

Example 1, order-one business (Lucky-type):
- WHAT: Keep Meta's CAC ceiling at first-order contribution; do not raise it on LTV. Put the retention effort into an add-on sold on order one (cart upsell of the most common second product) and a day-12 nudge email.
- NUMBER: Locus Customers: LTV90 $165 vs first order $154 (1.07x), 9% repeat, median second order 17 days, LTV:CAC 1.7x at 90 days.
- WHY: Almost all value arrives on order one, and the second order comes so fast it is really a missed add-on.
- WATCH: AOV and add-on attach rate (TW orders, cart products) for 4 weeks; second-order rate at day 30 for the next 2 cohorts.
- HOW SURE: High on the CAC rule (the data is clear); medium on the upsell size.

Example 2, per-ad customer quality:
- WHAT: In the Sales CBO, lower the CAC allowance on test ad set 14 (the 30%-off angle) and brief 3 more concepts on ad set 9's "built to last" angle.
- NUMBER: TW 90-day value per new customer: ad set 9 $212 (64 customers), ad set 14 $131 (88 customers), account $168. CPA nearly equal ($61 vs $58, TW last platform click).
- WHY: Same cost per buyer, but ad set 9's buyers are worth 62% more by day 90.
- WATCH: Each ad set's next 60-day cohort value and repeat rate; CPA weekly. Re-check at 60 days before moving the targets again.
- HOW SURE: Medium; 64 and 88 customers clear the minimum but one cohort can be noisy.

Example 3, returning-heavy brand:
- WHAT: Cap existing customers at 15% of the Sales campaign budget, add the Klaviyo purchaser list as existing customers, and report paid on new-customer CAC instead of MER.
- NUMBER: TW: returning share 58% of revenue (up from 44% in 6 months), new customers per month down 31% (410 to 283), MER steady at 3.4x; Meta audience segments show 38% of spend on existing customers.
- WHY: MER is being held up by people email can reach for free while the customer base shrinks.
- WATCH: new customers per month and new-customer CAC weekly for 6 weeks; TW returning revenue (should hold if email covers it).
- HOW SURE: Medium-high; the direction is clear, the right cap level needs 2 to 3 weeks of reading.

## 7. Traps
- "Our LTV is $300." Over what window, revenue or margin, and which cohorts? A 365-day number from old cohorts says nothing about customers bought this month.
- Right-censoring: young cohorts look worse because they have had less time. Compare at equal age.
- Left-censoring: the oldest cohorts in a 400-day table include customers who first bought before the window and look like loyal "new" customers.
- "Repeat rate 30%" quoted from returning share of orders. A cohort repeat rate and a returning share are different numbers; a brand can have 30% returning orders and a 9% cohort repeat rate.
- "Retention flows made $X" from Klaviyo: open-attributed and overlapping with paid. Real retention shows in cohort repeat rate and TW returning revenue.
- Mean time to second order: a few customers coming back after 300 days make it look like 90. Use the median.
- "Returning share is up, retention is working." Usually acquisition fell.
- Survivorship: "our repeat customers spend $400 a year" describes the 10% who came back, not the average new customer.
- Revenue LTV:CAC of 3x at a 40% margin is 1.2x on contribution: barely paying back.
- BFCM cohorts judged against everyday cohorts: they are deal buyers; compare to last year's BFCM cohort.
- Per-ad LTV under one attribution model: last platform click gives repeat buyers who clicked a retargeting ad to that ad. For "which ad brings better customers" read first-click (acquiring touch); for spend decisions keep last platform click (house default).
- `tw_orders` cart products are add-to-cart signals, not receipts. "First product" can be wrong for multi-item carts; confirm with Shopify when it matters.
- 400 days of history: a 365-day LTV exists only for cohorts from the first month or so of the window. Do not present more than that.
- TW cohorts exclude $0 orders and apply global filters; TW new-customer counts will not match Shopify. Name the source.
- Gift buyers (jewelry, golf at Christmas) repurchase rarely but the RECIPIENT may become a customer under a different email. Low repeat on gift cohorts is not a quality signal on its own.
- A loyalty program's "members spend 2x" is selection: the best customers join. Read the program on cohort repeat rate before vs after launch.
- Discounts in winback and second-order flows teach full-price buyers to wait; test with a no-discount arm first.
- Subscription "retention" quoted without separating involuntary churn hides the cheapest fix.
- "LTV justifies a higher CAC" on a brand with under 2 mature cohorts. That is a forecast, not a measurement; label it and cap the CAC change at 20%.
- Vendor benchmarks in this file are directional ranges from blogs, several partly synthesized. The brand's own cohorts beat any benchmark once they clear the minimums above.

## Sources
- AMP 2025 DTC Mega Report (CAC on first order, repurchase rates, contribution margin): https://useamp.com/blog/2025-dtc-mega-report/
- Triple Whale cohorts and CLTV: https://www.triplewhale.com/university/cohorts-cltv
- Triple Whale cohort counting vs Shopify: https://triplewhale.readme.io/docs/why-does-my-new-customer-count-in-ltv-cohorts-not-match-shopify
- Lifetimely cohort breakdown by channel (third party on TW): https://help.useamp.com/article/1372-lifetimely-getting-started-with-triple-whale
- Repeat purchase and time to second order by vertical (vendor, partly synthesized): https://eightx.co/blog/average-ecommerce-repeat-purchase-rate-by-vertical-2026 and https://eightx.co/blog/average-ecommerce-time-to-second-purchase-by-vertical-2026
- 90-day retention guide (vendor): https://topgrowthmarketing.com/ecommerce-customer-retention-90-day-guide/
- CAC payback benchmarks (vendor): https://eightx.co/blog/cac-payback-period-benchmark
- LTV:CAC ranges and definitions (vendor): https://eightx.co/blog/ltv-cac-ratio-guide and https://eightx.co/blog/ltv-cac-done-honestly
- Subscription churn (Recharge 2024 via EightX, not verified against Recharge): https://eightx.co/blog/dtc-subscription-churn-index-2026 and https://www.eightx.co/blog/average-subscription-churn-rate-by-category
- Klaviyo active-profile billing: https://academy.klaviyo.com/en-us/quick-guides/make-the-most-out-of-your-profiles
- Klaviyo 2026 benchmarks (flows vs campaigns): https://www.klaviyo.com/products/email-marketing/benchmarks
- Internal: Locus Customers (profit/CLAUDE.md 2026-10-05 section), account-health/CLAUDE.md (tw_ad_attr, models), docs/strategist-brain/source-lucky-account-structure.md
- Meta Advantage+ existing-customer budget cap and audience segments reporting: Meta Business Help Center (not fetched this session, not verified)

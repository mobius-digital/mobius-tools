# Offers, pricing and promotions for Shopify DTC

Scope: discount strategy and its long-term cost, bundles, AOV levers, free-shipping thresholds, gift with purchase, launches and drops, BFCM offer design, price testing, and how an offer moves CPA, conversion rate, AOV and contribution margin together. Read with `website-cro.md` (the page that shows the offer) and the brand's Season tab in Locus during Q4.

The rule behind this file: **an offer is judged on contribution margin after ad spend, per visitor and per new customer, never on revenue, ROAS or conversion rate alone.** Every offer moves four numbers at once (CVR, AOV, CM per order, CPA), and they usually move in opposite directions.

---

## 1. How it works now (2025 to 2026)

- **Costs went up, so discounts got more expensive.** US tariffs through 2025 and the end of the de minimis exemption for all countries on 2025-08-29 raised landed COGS for most imported DTC goods. The same 25% off now eats a bigger share of a thinner margin. Re-check COGS in Triple Whale (product costs) before any offer math; stale COGS makes every discount look cheaper than it is.
- **Discount depth kept creeping up in the market.** Adobe's 2025 season peaks: apparel 25.1% off listed price, sporting goods 20.3%, electronics 30.9%, all slightly deeper than 2024. Black Friday grew faster than Cyber Monday (online spend +9.1% vs +7.1%). Shopify merchants did $14.6B over BFCM 2025, up 27%. The market shouts discounts; a non-discount offer stands out more than it did.
- **Shopify discount mechanics:** product, order and shipping discounts can combine (set per discount). Automatic discounts show in cart without a code; codes leak to coupon sites and browser extensions within days. Shopify Functions and the Bundles app allow fixed bundles, mix-and-match and tiered "buy 2 save $X" without third-party apps. Free gifts are usually an automatic "buy X get Y" with Y at 100% off; check that the gift SKU has stock and a real COGS in TW.
- **Meta treats the offer as part of the creative.** Under Andromeda (2025) the system retrieves ads by what they are, so a different offer is a different ad worth testing, while the same offer in 10 near-identical ads is one ad. Offer tests follow doctrine: a numbered test ad set where "what we're testing" is the offer, up to 6 ads, angle held constant.
- **Klaviyo/Attentive carry offers to known people.** Most promo revenue on sale days comes from the list and returning customers. Paid social's job in a promo is new customers.
- **Triple Whale numbers to use:** CM (contribution margin, needs COGS, shipping, fees and ad spend loaded), MER, new customer CAC (nCAC), new vs returning orders and revenue, AOV, and 90-day customer value per ad (from the first order). Shopify Analytics > Reports > "Sales by discount" gives revenue and orders per code.

### The math the Strategist must run for every offer
- **CM per order before ads** = net revenue after discount minus COGS (including any gift) minus shipping cost minus payment fees (about 2.9% + $0.30) minus pick/pack.
- **CM% before ads** = CM per order / full-price revenue. Typical DTC: 50 to 70%.
- **Break-even CPA** = CM per order before ads. **Break-even ROAS** = 1 / (CM per order / net revenue per order).
- **Volume lift needed to keep total CM the same after a discount d**: m / (m minus d) minus 1, where m = CM% before ads at full price.

| CM% at full price | 10% off | 20% off | 30% off | 40% off | 50% off |
|---|---|---|---|---|---|
| 70% | +17% orders | +40% | +75% | +133% | +250% |
| 60% | +20% | +50% | +100% | +200% | +500% |
| 50% | +25% | +67% | +150% | +400% | no CM left |

- **CPA after the offer** (same CPC) = CPA before x (CVR before / CVR after). A 20% off sale typically lifts cold-traffic CVR 10 to 30%, which cuts CPA 9 to 23%, but the table shows 20% off needs +50% orders at a 60% margin. That gap is why most discounts lose money on paid traffic outside BFCM.
- **Profit per new customer** = CM per first order minus nCAC, plus expected 90-day repeat CM. Compare offers on this, at a 90-day horizon where the brand has repeat purchase (patches, consumables, apparel), and on first order where it does not (golf clubs, belts, durable gear).

### One worked comparison (illustrative, one store, cold Meta traffic)
Baseline: AOV $117, CM% before ads 55% ($64), CPC $1.20, CVR 1.5% (CPA $80). First-order result: minus $16 per new customer.

| Offer | AOV | CM per order | CVR | CPA | CM after CPA |
|---|---|---|---|---|---|
| None | $117 | $64 | 1.5% | $80 | minus $16 |
| 25% off sitewide | $88 | $35 | 2.0% | $60 | minus $25 |
| Free gift (COGS $8, retail $30) | $117 | $56 | 1.75% | $69 | minus $13 |
| $50 off 2, $100 off 3 (units 1.2 to 1.6, average discount $30 per order, extra units at 65% CM since shipping is per order) | $126 | $60 | 1.6% | $75 | minus $15 |
| Free shipping over $150 (was $75) | $128 | $68 | 1.45% | $83 | minus $15 |

Reading: the deep discount wins CVR and loses the most money. The gift is the cheapest CVR lift. The multi-unit tier holds first-order margin about flat while putting more product in each home (more reviews, more repeat, better 90-day value). Stacking a per-unit gift on a multi-unit tier is the BFCM shape below. The pattern holds for most Mobius brands; the actual numbers must be re-run per brand with its own COGS and CVR response.

---

## 2. Decision rules

### Discounts
- **Sitewide % off cap outside BFCM: no deeper than one third of CM% at full price** (60% margin: max 20% off). Deeper only for clearance of dead stock, and then only on that stock.
- **Frequency:** at most 4 to 6 sitewide sale events a year, each 3 to 5 days, with at least 6 weeks of full price between. More often trains the list to wait: watch full-price conversion and email revenue in the 2 weeks before each sale.
- **Prefer, in order:** gift with purchase, multi-unit or bundle pricing, spend tiers, free shipping change, then % off. Gifts and multi-unit offers protect the price anchor; % off resets it.
- **Welcome offer depth:** 10% or a gift is the default; 15% to 20% only if test data shows CM per new customer is higher. Research (Lewis 2006; Aalto/Hanken) says deep acquisition discounts produce customers who repeat less; moderate discounts (roughly 5 to 35%) do not show the same damage. Check it in the brand's own data: repeat rate and 90-day value of customers whose first order used the welcome code vs full price (tw_orders, cohort by first-order discount).
- **Codes on paid social:** use automatic discounts or a landing page that applies the code (Shopify `/discount/CODE?redirect=/products/x`), never "use code X" alone; codes leak to coupon sites and get used by people who were buying anyway.
- **Exclusions:** new launches and the top 1 to 2 hero SKUs are excluded from routine % off unless the hero is the offer.

### Bundles and AOV levers
- **Build bundles from real order data:** the top co-purchased pairs (tw_orders carts) and the second product repeat buyers choose. A bundle nobody already buys together will not sell on discount alone.
- **Bundle discount:** 10 to 15% off the sum (or a free item of similar value) is enough; deeper adds little CVR. Name it by the job ("the full kit", "the weekend pack"), not "bundle 2".
- **Quantity tiers:** set tier 1 at about 1.3x current AOV and tier 2 at about 2x. "Buy 2 save $X" beats "buy 2 save X%" for $80+ items (dollar amounts read bigger above $100).
- **Units per order is the KPI** for multi-unit offers; watch it alongside AOV (AOV can rise from mix alone).
- **Other AOV levers, rough take rates (vendor-reported, not verified):** cart drawer add-on 5 to 15% of carts, post-purchase one-click upsell 3 to 8% of orders, PDP "complete the set" 2 to 6%. Price the add-on at 20 to 40% of AOV.
- **Do not raise AOV at the cost of CVR blindly:** judge revenue per session and CM per session (see `website-cro.md`).

### Free-shipping thresholds
- **Floor:** break-even order value = shipping cost per order / gross margin %. ($9 shipping, 50% margin: orders over $18 cover it.)
- **Set the threshold 15 to 30% above current AOV**, and above the price of the single hero product, so one hero plus a small add-on qualifies. 30 to 50% of orders should clear it.
- **Too low** (below AOV): gives free shipping to orders that would have paid it; no AOV push. **Too high** (over 1.8x AOV): ignored, and shipping cost becomes a surprise that hurts CVR.
- **Show it everywhere before checkout:** announcement bar, PDP near the button, progress bar in the cart drawer.
- **Change it with a test or a clean before/after of 4+ weeks with no other offer change.** Read AOV, CVR, share of orders above the threshold, shipping cost per order, CM per session.

### Gift with purchase (GWP)
- Works when the gift is **wanted** (something buyers would pay for, ideally brand merch or a consumable that brings them back), **visible** (in the ad, on the PDP, in the cart as a line at $0), and **cheap at cost vs value** (retail value 3 to 5x landed cost).
- Retail value of the gift should be 15 to 30% of AOV to move people; under 10% is a sweetener, not a hook.
- A gift-per-unit ("a hat with every club") scales with units and keeps the offer simple; a spend-tier gift pushes AOV.
- Confirm gift stock covers 120% of forecast orders before launch. Running out mid-offer is worse than no offer.

### Launches and drops
- **Sequence:** waitlist / SMS sign-up 2 to 3 weeks before, early access to the list 24 to 48 hours before public, public launch with paid social, follow-up proof (reviews, UGC) at day 7 to 14.
- **Do not discount a launch.** Use early access, a launch gift, or a limited edition. Discounted launches set the product's price anchor at the discount.
- **Judge launch ads after the list spike:** the first 72 hours are mostly list and returning buyers; paid social CPA in launch week looks better than it is. Read new customer share and nCAC from day 4.
- **Scarcity must be real:** numbered units, real end dates. Fake countdowns that reset kill trust and break consumer protection rules (FTC fake-scarcity guidance).
- **Restock drops** of a sold-out hero: email the waitlist first, then paid; expect 2 to 3x normal daily orders for 2 to 4 days.

### BFCM offer design (read with the Season tab)
- **One offer, two sentences, guaranteed stock.** The list sees it 30 to 40 times; it cannot change on Thanksgiving. Complexity kills BF conversion.
- **Depth vs margin:** if the brand's CM% is under 60%, no sitewide % off deeper than 25%; use gifts, multi-unit tiers or a hero-only deal.
- **Shape that works for most Mobius brands:** gift per unit or multi-unit tiers ($X off 2, $2X off 3), early access for the list (24 to 48 h), BF day launch to the public, Cyber Monday step-up as a new rung (a 4th tier, a drop or a different gift), not a deeper % off.
- **Ladder and spend:** set the MER/ROAS ladder by day from break-even ROAS (1 / CM% per order after discount). Budget scales only while hourly TW MER clears the ladder (the Locus Desk).
- **Stock:** hero SKUs at 2x forecast for the weekend; offers only on SKUs with guaranteed stock; pre-decide what replaces a sold-out hero.
- **No early markdowns** without a reason: a sitewide discount from mid-November pulls sales forward and drains the BF peak (Lucky 2025 evidence below).
- **After BFCM:** full price December with a gift-guide angle and shipping cutoffs; no "extended" sale unless planned.

### Offer menu by brand type (start here, then test)
| Brand type | Default always-on | Best AOV lever | Best BFCM shape | Avoid |
|---|---|---|---|---|
| Golf equipment, $100+ per unit | Gift with first club (headcover, towel, hat) | $X off 2, $2X off 3 | Gift per unit + multi-unit tiers, early access for members | Sitewide 30 to 50% off (Lucky 2025) |
| Golf accessories, $30 to $80 (belts, markers, gloves) | Free shipping threshold above AOV | Bundles (kit), add-on in cart | Free gift tier + kit bundle | % off on single cheap items |
| Apparel | Free returns/exchanges messaging | Buy 2 save $X, outfit bundles | Tiered spend gifts or $ off tiers, limited colorways | Deep markdowns on core colors |
| Patches / consumables | Multi-pack price per unit | Subscribe and save (10 to 15%), packs of 3 and 6 | Biggest pack at best price per unit + gift | Single-unit % off codes |
| Jewelry | Gift packaging and gift note | Sets (stack of 2 or 3), engraving add-on | Gift with purchase tier, gift guide | Constant sitewide codes (cheapens perceived value) |
| Pet | Subscribe and save | Larger sizes, bundles of 2 SKUs | Bundle + gift, stock-up pricing | Deep first-order discounts on consumables with weak repeat |
| Hockey gear | Free shipping, team/bulk price | Bundles (stick + tape + wax) | Tiered $ off, early access around season start | Discounting new models in season |

### Running an offer test inside the Mobius doctrine
- An offer test is a numbered test ad set: same angle, same concept family, up to 6 ads, "what we're testing" = the offer (written in Asana).
- The offer must be live on the site for the test's visitors (automatic discount scoped by landing page or a URL that applies it); otherwise the ad promises something the page does not show.
- Minimum read: 7 days and 30+ TW purchases per offer arm, judged on CM after ad spend per purchase and on new customer share, not on ROAS.
- At most one offer test running per brand at a time, so the site-wide numbers can be read.
- A winning offer becomes the always-on offer only after a second confirmation (another 2 weeks, or the next month's test against it).

### Offer calendar rules
- Plan the year's sale events in January: 4 to 6 windows (for example, a spring event, Father's Day for golf, July 4, Labor Day or end of season, BFCM, plus one brand moment). Everything else is full price with gifts, bundles and drops.
- Lock BFCM offers by mid-October; creative and email need 4 to 6 weeks.
- No two offers live at once unless one is a permanent structure (threshold, multi-pack pricing) and the other is the event.
- Every offer has a written end date, a stock check, the flows and ads to update, and the person who turns it off.

### Price testing
- **Test only when:** the store has 20,000+ sessions a month on the tested products, no promo in the window, the feed (Google Merchant Center) and any ad copy stating the price can be split or kept neutral.
- **Range:** test price changes of 8 to 15% (smaller changes cannot be read at DTC volumes).
- **Metric:** profit per visitor (CM per session), with CVR and AOV as diagnostics. A price increase that drops CVR 6% but raises CM per order 15% wins.
- **Tool:** Intelligems or equivalent on Shopify (consistent price per visitor across sessions and into checkout). Duration 3 to 4 weeks, 300+ orders per arm on the tested products.
- **Ad copy must not show the price** during a test; Merchant Center must not see a mismatch (exclude tested SKUs from Shopping for the test or use a price-neutral feed approach).
- **Anchor checks:** compare-at prices only when the product was really sold at that price recently (FTC and state rules on former-price claims).

### The verdict procedure after any offer or sale (run it, write it down)
1. Define the window: offer days plus the 14 days after. Baseline: the same number of days before the offer, excluding other promos (or the same window last year if seasonal).
2. Pull from TW: revenue, orders, AOV, CM, ad spend, MER, new customer orders, nCAC, returning orders. From Shopify: units per order, Sales by discount, gift SKU units shipped.
3. Compute: CM change (window vs baseline, in dollars), new customers added, CM per new customer, share of revenue from returning customers.
4. Split the gain: how much came from new customers (paid social's job) vs the list (email's job) vs pull-forward (the dip in the 14 days after).
5. Verdict in one line: "Made $X more CM than full price would have, added N new customers at $Y nCAC" or "Lost $X of CM; the volume lift needed was +Z%, we got +W%."
6. File it in the brand's test library (Asana) with the offer as "what we tested", so "have we tried this offer?" has an answer next season.
7. At day 90, add the offer cohort's repeat rate and 90-day value next to the full-price cohort.

### Thresholds for calling an offer
- **Keep / scale:** CM after ad spend per session at or above baseline, and new customer share at or above baseline, for 7+ days and 30+ purchases per arm.
- **Kill:** CM per session 15%+ below baseline after 7 days with 30+ purchases, or any stockout of the offered or gifted SKU.
- **Extend the read:** inside plus or minus 10% of baseline on CM per session; run 7 more days before deciding.
- **Never decide on day 1 to 2** of an offer: email sends and list buyers distort the first 48 hours.

---

## 3. Diagnostics

| Symptom | Likely causes, in order | Number that confirms it | Fix |
|---|---|---|---|
| Sale revenue up, CM down | Discount deeper than the volume lift covered; gift COGS not loaded; returning buyers subsidised | TW CM for the window vs 4-week baseline; returning share of orders; COGS loaded for gift SKU | Next time: gift or tiers, exclude returning (code for new only), cap depth |
| Full-price weeks getting worse each cycle | Sale frequency trained the list to wait | Email-attributed revenue and CVR in the 2 weeks before sales vs a year ago; % of orders with a code | Fewer, shorter sales; move to gifts and drops |
| A code appears with orders from nowhere | Code leaked to coupon sites/extensions | Shopify Sales by discount: code orders with no matching campaign; sessions referred from coupon sites | Expire code; use automatic discounts or unique codes |
| AOV rose, orders fell | Threshold too high, bundle displaced single sales, tiers confusing | Share of orders above threshold; units per order; CVR | Lower threshold or add a middle tier |
| CVR rose, AOV fell, CM per session flat | Discount bought conversion with margin | Revenue per session and CM per session vs baseline | Swap % off for a gift or tier |
| Promo week looked great, next 2 weeks weak | Pull-forward | Orders and new customers in 14 days after vs 4-week pre baseline | Count promo + 14-day hangover as one result |
| Meta CPA fell during the sale and Strategist wants to scale | Warm audiences converted; email halo | TW new customer share and nCAC (not blended CPA); Meta new vs returning breakdown | Scale on nCAC and new customer orders only |
| Gift offer did nothing | Gift not visible in the ad/page, gift unwanted, gift value under 10% of AOV | Ad creative check; ATC rate on offer ads vs others; survey | Put the gift in the first frame and on the PDP; bigger or better gift |
| BF orders below plan by noon Friday | Offer unclear, weaker than market, stock gaps, site issue | Hourly orders vs last year same hour; CVR; email click to order rate; OOS hero | Fix clarity in creative and email first; deeper discount last (pre-planned fallback only) |
| Discounted customers churn | Acquisition discount too deep | 90-day repeat rate by first-order discount (tw_orders) | Lower welcome depth or swap to gift |
| Price test winner, revenue fell after rollout | Seasonality, test ran in a promo, Shopping feed mismatch | Merchant Center disapprovals; date overlap with promos | Re-test cleanly; fix feed |

---

## 4. How offers affect the other channels

- **Email and SMS claim promo revenue.** On sale days Klaviyo can claim 30 to 60% of revenue; much of it would happen anyway from the list. Paid social's job is new customers: judge it on TW new customer orders and nCAC.
- **Meta and Google look better during sales** (warm audiences, higher CVR) and worse after (pull-forward, depleted intent). Do not raise base budgets on sale-week ROAS; do not cut on post-sale-week ROAS. Use the 4 weeks before as the baseline and the 14 days after as part of the result.
- **Google branded search and direct traffic spike** when email and social announce a sale; that is halo, not a search win.
- **Coupon sites and extensions** take last-click credit on codes; a rise in "referral" or "affiliate" revenue during a sale is often leakage.
- **Organic and word of mouth:** a strong non-discount offer (gift, drop) creates content; a discount mostly does not.
- **Price changes travel:** Merchant Center feed, Meta catalog (Advantage+ catalog ads), Amazon (if sold there), retailer MAP agreements. Check each before any public price change.

Check before an offer change:
- TW: CM, MER, nCAC, new vs returning orders, AOV, units per order, last 28 days and same period last year.
- Shopify: Sales by discount (what codes are already live), stock on hero and gift SKUs.
- Klaviyo: campaign calendar (no unplanned email offers overlapping), flows that mention old offers (welcome, abandoned cart, winback) so the message matches.
- Meta: which ads state an offer in copy or on screen; they must change on the same day.
- Google: feed prices and promotions (Merchant Center Promotions must match).

Check after (day 3, day 7, day 14 after the offer ends):
- Total CM for offer window plus 14 days vs the same length baseline. That is the verdict.
- New customer share and nCAC; 90-day repeat for offer-acquired cohorts at day 90.
- Full-price CVR in the 2 weeks after vs before (training damage).

---

## 5. What a great suggestion looks like

Numbers come from the named source; where marked illustrative, the shape is the rule.

**Example 1: Lucky Golf BFCM offer (real history, Shopify and TW)**
- WHAT: Run a hat with every club plus $50 off 2 clubs and $100 off 3, launched Friday 8am to the public after 48 hours of member early access; no sitewide % off; a pre-written Cyber Monday 4th rung, not a deeper discount.
- NUMBER: BF week 2024 did $110k on $32k spend (3.5x) with free covers and multi-unit value; BF week 2025 with 30% then 50% sitewide did $72k on the same $32k (2.2x), down 35% on a deeper discount. BF 2025: 659 orders at ~1.2 clubs per order, AOV $117 (Shopify). 75 to 85% of BF buyers were new.
- WHY: Lucky's buyers respond to more product per order, not to price cuts; multi-unit tiers lift units per order from 1.2 toward 1.6 while holding the club price.
- WATCH: Hourly orders and TW MER against the ladder (Locus Desk) Friday to Monday; units per order above 1.4 by Saturday; hat stock against orders; CM for BF week plus the 14 days after vs 2024.
- HOW SURE: Medium-high. Two years of evidence point the same way; the multi-unit lift size is the open number.

**Example 2: free-shipping threshold too low (illustrative)**
- WHAT: Raise the free-shipping threshold from $50 to $75 and add a $12 accessory in the cart drawer as the "get to free shipping" add-on.
- NUMBER: AOV $61, 78% of orders already clear $50 (Shopify orders, 60 days); shipping cost per order $8.40 (TW). The threshold gives free shipping to almost everyone and pushes nobody.
- WHY: A threshold 20 to 30% above AOV moves the 40 to 60% of orders just under it; the add-on gives them a cheap way across.
- WATCH: AOV, CVR, share of orders at $75+, cart add-on take rate and CM per session for 4 weeks with no other offer change. Roll back if CVR falls more than 8% and CM per session does not rise.
- HOW SURE: Medium. The direction is well supported; the CVR cost depends on how price-sensitive the brand's buyers are.

**Example 3: welcome discount depth (illustrative)**
- WHAT: Test the popup offer at 10% vs the current 20% for 4 weeks, split by visitor.
- NUMBER: Customers whose first order used WELCOME20 repeat at 14% in 90 days vs 27% for full-price first orders (tw_orders cohort, last 12 months); 61% of first orders use the code.
- WHY: Most new buyers get 20% off; if 10% converts nearly as well, every new customer is worth more on the first order and possibly after.
- WATCH: Popup sign-up rate, sign-up to first-order rate, CM per new customer and nCAC for 4 weeks; 90-day repeat at day 90 for both cohorts.
- HOW SURE: Medium on the first-order math, low on repeat (needs 90 days to read).

---

## 6. Traps

- **"The sale worked, revenue was up 80%."** Revenue is the wrong number. Run CM for the sale plus 14 days after against the baseline.
- **Judging an offer on ROAS.** ROAS counts discounted revenue as if it were margin. A 25% off sale at 4.0 ROAS can make less money than full price at 2.8.
- **Blended CPA during a sale.** Returning customers and the email list flood in; blended CPA falls. Use nCAC.
- **Gift COGS missing in Triple Whale.** A free hat with zero COGS makes CM look better than it is. Load the gift's cost before the offer starts.
- **"Customers expect a discount."** The market discounts, so a clear non-discount offer stands out; Lucky's own history shows deeper discounts doing worse.
- **Pull-forward ignored.** Starting a discount early (mid-November) moves sales out of the peak instead of adding new ones.
- **Code leakage counted as campaign success.** Check where code orders came from before crediting a channel.
- **Price test on a promo week, or with price in the ads.** The result is meaningless; the feed mismatch can also cut Shopping.
- **Too many offers at once.** Sitewide %, gift, threshold and bundle together: nobody can explain it in two sentences, and nobody can read which part worked.
- **Changing the offer mid-test.** An offer is a test variable like a hook; one offer per test ad set until it is judged (doctrine: one thing tested at a time).
- **Fake reference prices and fake scarcity.** Compare-at prices never charged, countdowns that reset: legal risk and trust damage.
- **Assuming LTV will pay for a deep first-order discount.** Check the cohort; discount-acquired customers often repeat less.
- **Reading AOV without units per order.** AOV can rise because the mix shifted to a pricier product, not because the bundle worked.
- **Counting the gift at retail value in the margin math.** The cost is landed COGS plus any extra shipping weight; the value to the buyer is retail. Both numbers matter, for different questions.
- **Free shipping for everyone as a "test".** It is a permanent margin cut that is hard to undo; buyers notice when it goes away.
- **Copying a competitor's BF depth.** Their margin, stock and list are not ours; Takomo-style brands holding price can win the same weekend.
- **Platform-reported offer wins.** Meta's own ROAS on an offer ad set includes view-through and returning buyers; judge offer tests on TW last platform click plus new customer share (doctrine).
- **Subscribe and save counted as new revenue.** A subscription discount on buyers who already reorder monthly is a pure margin cut; check how many subscribers were already repeat buyers.
- **Threshold changes judged in week 1.** Buyers adjust carts over weeks; read a threshold change at 4 weeks.
- **Ignoring returns.** Deep-discount and multi-unit orders can return more (bracketing in apparel). Check refunds 30 days after the window before final CM.

---

## 7. Sources

- Adobe 2025 holiday recap (discount depth by category, BF vs CM growth): https://news.adobe.com/news/downloads/pdfs/2026/01/010726-2025-holiday-shopping-season.pdf and https://news.adobe.com/news/2025/12/adobe-cyber-monday-hits-record
- Shopify BFCM 2025 results ($14.6B, +27%): https://www.shopify.com/news/bfcm-data-2025
- End of US de minimis for all countries, 2025-08-29 (EO 14324): https://www.apc-pli.com/service-alerts/us-ends-de-minimis-exemption and https://borderbuddy.com/trade-tariff-news/u-s-de-minimus-exemption-for-commercial-goods-ends (CBP text quoted secondhand)
- Lewis (2006), acquisition promotions and customer asset value, Journal of Marketing Research (summarised via secondary sources; paper not fetched)
- Aalto / Hanken on initial discount depth and retention (moderate 5 to 35% best): https://aalto.fi/en/news/set-the-initial-price-discount-right-to-turn-new-customers-into-loyal-ones
- Discount-acquired customer LTV measurement (vendor): https://www.peelinsights.com/post/securing-a-high-ltv-customer-with-a-discount and https://intercom.help/lebesgue/en/articles/10211680-ltv-by-discount
- Free-shipping threshold math and ranges (vendor, ranges disagree): https://eightx.co/blog/free-shipping-threshold-math and https://cartylabs.com/blog/shopify-free-shipping-bar-strategy/
- Free-shipping threshold controlled test (one brand, +6% AOV, +12% revenue per visitor): https://www.intelligems.io/resources/customer-stories/boost-aov-by-upping-your-free-shipping-threshold
- Price testing on Shopify (profit per visitor, mechanics): https://www.intelligems.io/resources/blog/how-do-i-run-a-price-test-on-shopify and https://docs.intelligems.io/price-testing
- Cart abandonment and extra costs as the top reason: https://contentsquare.com/guides/cart-abandonment/stats/ (Baymard primary not fetched)
- FTC guidance on former-price comparisons (16 CFR 233) and fake urgency: https://www.ecfr.gov/current/title-16/chapter-I/subchapter-B/part-233 (not fetched in this session)
- Lucky Golf BF history and BFCM 2026 plan: Locus Season tab and Mobius internal notes (Shopify and Triple Whale, verified 2026-10-07)
- Take rates for cart and post-purchase upsells are practitioner ranges, not verified.

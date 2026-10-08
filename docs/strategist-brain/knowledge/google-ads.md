# Google Ads for a small DTC Shopify brand (October 2026)

Scope: Search (brand and non-brand), Performance Max, Shopping and Merchant Center, Demand Gen, YouTube, Smart Bidding, negatives, structure, and how Google sits on top of Meta.
Read with: `seo-search.md` (organic brand demand), the Meta doctrine (one Sales CBO per brand), Triple Whale last platform click as the default lens.

What the Strategist can and cannot see on Google:
- CAN: campaigns with type (SEARCH, PERFORMANCE_MAX, SHOPPING, DEMAND_GEN, VIDEO), daily spend, clicks, conversions, conversion value. TW per-campaign attribution (5 models). GA4 channels and landing pages. Search Console brand vs non-brand.
- CANNOT (today): search terms, auction insights, impression share, Merchant Center diagnostics, asset group detail, channel performance page, bid strategy status. When a call depends on one of these, the suggestion must say "pull X from the Google Ads UI first" instead of guessing.

## 1. How it works now

### Campaign types and what changed 2024 to 2026
- **Search.** Keywords plus RSAs. Since 2025 **AI Max for Search** is a one-click layer on a Search campaign: keywordless matching (from landing pages and assets), text customization, final URL expansion. Turning it on also turns on text customization and URL expansion; URL expansion ignores RSA pinning. Search terms it finds show with source "AI Max" in the search terms report. Google claims +14% conversions or value at similar CPA/ROAS (Google data, not independent).
- **Smart Bidding Exploration** (May 2025): a flexible tROAS setting on Search that lets the bidder enter query categories it would skip at a hard target. Google claims +18% converting query categories, +19% conversions (Google data).
- **Performance Max.** One campaign across Search, Shopping, YouTube, Display, Discover, Gmail, Maps. 2025 added: campaign-level negative keywords (cap raised to 10,000, matching Search), negative keyword lists (Aug 2025), search terms report, asset-level reporting, and the **Channel performance** page (announced Apr 2025, open beta from May 2025) showing spend, clicks, conversions per surface plus "where ads showed". Brand exclusions now can be scoped to Search text ads only, so branded Shopping can keep serving.
- **PMax vs Standard Shopping** (Oct 2024 change): PMax no longer automatically wins over Standard Shopping on the same product. Ad rank decides. A dormant Standard Shopping "backup" campaign can start spending again.
- **Search keyword priority**: when a query is identical to an eligible Search keyword (any match type), the Search campaign wins over PMax. This is why a brand Search campaign protects brand traffic from PMax.
- **New customer acquisition goal** (PMax, Search, Shopping): "bid higher for new customers" (adds a value per new customer) or "new customers only". High-value new customer mode left beta Jan 2025. Needs Customer Match lists or conversion tags to tell new from returning.
- **Brand guidelines** (PMax): business name and logo at campaign level, on by default for new PMax since API v21. **Text guidelines** (beta Sep 2025, global Feb 2026, not verified): up to 25 term exclusions and 40 messaging restrictions per campaign for AI-written text.
- **Demand Gen** replaced Video Action Campaigns (no new VACs from Apr 2025, auto-upgrades through Apr 2026). Serves YouTube (in-stream, Shorts, in-feed), Discover, Gmail, optionally Display and video partners. Channel controls per campaign and ad group since 2025. Lookalike segments built from first-party lists. API enforces a $5/day floor since Apr 2026; Google's own recommendation for conversion bidding is a daily budget of 15 to 20x target CPA.
- **YouTube for DTC** now runs through Demand Gen or PMax video assets, not standalone conversion video campaigns.
- **Merchant Center**: Merchant Center Next is the default UI; the Content API for Shopping sunset Aug 18, 2026 (Merchant API replaces it). Shopify brands feed through the Google & YouTube app, which can send the SEO title and meta description instead of the storefront title.

### Smart Bidding mechanics that drive decisions
- Learning length is measured in **conversion cycles**, not days. Google: 2 to 3 conversion delay cycles to calibrate; judge over at least 2 full cycles, ideally a month or 50 conversions. For our DTC brands the click-to-purchase delay is mostly 0 to 3 days, so a cycle is short, but volume is the real limit.
- Big changes restart learning: new bid strategy, target change of more than roughly 20%, budget change of more than roughly 20 to 30%, large asset or listing group changes. (Practitioner thresholds; Google says "significant", not a number.)
- tROAS bids to conversion value, so a wrong value (tax, shipping included, duplicate purchase actions) teaches the bidder the wrong thing. One primary purchase action per account.
- Seasonality adjustments exist for 1 to 7 day events (flash sale, BFCM peak days) and are meant for short spikes only. Data exclusions exist for tracking outages.
- Google-reported conversions include cross-device modeled, consent-mode modeled, and for video/Demand Gen, engaged-view conversions. Google numbers will run above TW last platform click. Normal ratio for Search and Shopping: Google value 1.1 to 1.5x TW value. PMax and Demand Gen can run 1.5 to 3x.

## 2. Decision rules

### Structure for a small DTC brand (Google spend $3k to $40k a month)
Build in this order, add the next layer only when the one before it is stable and the gate is met.

| Layer | Campaign | Gate to add it | Bidding |
|---|---|---|---|
| 1 | Brand Search (exact + phrase on brand and brand+product) | Always, if anyone else bids on the brand or PMax is live | Max conversion value with a tROAS well above account target, or Max clicks with a CPC cap at 1.5x recent brand CPC |
| 2 | PMax, feed plus assets, brand excluded from Search text | Merchant Center clean, 10+ products or 1 hero with real search demand | Max conversion value (no target) for first 2 to 4 weeks, then tROAS |
| 3 | Non-brand Search on 5 to 20 high-intent category terms (exact and phrase) | PMax stable 4+ weeks, Google budget at least $5k/mo, terms with real volume | Max conversion value or tCPA |
| 4 | Standard Shopping for "zombie" SKUs or a controlled hero test | 30%+ of active SKUs get under 10 impressions a week in PMax | Manual CPC or Max clicks, low priority |
| 5 | Demand Gen (YouTube Shorts plus Discover, video and image) | Google budget at least $10k/mo, proven Meta video winners to re-cut, can fund 15x CPA a day or accept a volume test | Max conversions for 4 weeks, then tCPA |

- One PMax campaign until it does 30+ conversions a month. Split asset groups or campaigns only when a split will also have 30+ a month on its own. Splitting a 40-conversion campaign into three starves all three.
- Splits that earn their keep: (a) hero SKU vs rest when the hero has a different margin or ROAS target, (b) new customer goal on vs off, (c) a separate brand-only Shopping view for a reporting check. Not by device, not by audience signal.
- Audience signals in PMax are hints, not targeting. Use: Customer Match (all purchasers), site visitors 30 days, custom segments from competitor and category search terms. Do not spend time A/B testing signals.
- Upload at least one real video per aspect ratio (16:9, 9:16, 1:1) to every asset group. If none, Google auto-generates a slideshow video that runs on YouTube and usually wastes money. Re-cut Meta winners (first 3 seconds intact).

### Budget mix inside Google
- Brand Search: 5 to 15% of Google spend. If brand Search is over 25% of Google spend, either brand CPCs are inflated by competitors or Google is mostly harvesting.
- PMax plus Shopping: 60 to 85%.
- Non-brand Search: 10 to 25% once layer 3 exists.
- Demand Gen: hold to at most 15% of Google spend until a holdout or MER read says it is incremental.
- Google as a share of total paid media for our brands: Meta is the demand engine. Google typically 15 to 35% of total spend. Above 40% for a brand without strong existing search demand, suspect Google is buying credit for Meta-created demand.

### Bidding thresholds
- Under 15 conversions a month in a campaign: Max conversion value or Max conversions with no target, or consolidate. Never tROAS.
- 15 to 30 a month: tROAS allowed but loose (set at 80 to 90% of trailing 30-day actual ROAS), expect noise, judge on 30-day windows.
- 30 to 50+ a month: tROAS or tCPA as normal. Judge on 14-day windows.
- First target: trailing 30-day Google-reported ROAS (or CPA) minus 10 to 15% for ROAS (plus 10 to 15% for CPA). Setting the target at or above current actual chokes volume.
- Target moves: max 15% per step (20% hard ceiling), at most once per 7 to 14 days (one conversion cycle plus a week for our brands). Wait 2 cycles before judging.
- Budget moves on a stable smart-bidded campaign: up to 20% per step, every 3 to 7 days. A tROAS campaign that is "Limited by budget" and beating target is the scale candidate. A tROAS campaign under budget is target-limited: lower the target, not raise the budget.
- Raising budget without touching tROAS on a target-limited campaign does nothing. Check spend vs budget first.
- Max conversion value with no target will spend the full budget at whatever ROAS it can find. Only use it with a budget you would be fine losing at 1.5x ROAS for 2 weeks.

### Minimum data before a call
- Do not judge a campaign or a change before: 7 days AND (2x target CPA spent OR 15 conversions), whichever comes later. For tROAS changes: 2 full weeks.
- Do not judge any Google change in the 7 days after a Meta budget change of more than 20% (brand demand will be moving under it).
- Day-of-week: compare whole weeks only. Google DTC conversion rate swings 20 to 30% Mon to Sun.

### Scale, cut, restructure
- **Scale** PMax or Search when ALL hold: TW last platform click ROAS (or CPA) on target for 14+ days, Google says "Limited by budget" or spend is at budget, store-level MER held or improved over the same 14 days, and new customer share of Google orders is at least the brand average. Step +20%.
- **Cut** (reduce 20 to 30%, or lower target scope) when: TW ROAS below 70% of target for 14 days with 30+ conversions, or below 50% of target for 7 days. Before cutting, rule out tracking and feed (Diagnostics).
- **Pause** non-brand Search ad groups or keywords: spend at least 3x target CPA with zero TW or Google conversions.
- **Restructure** (split or merge) only when: a campaign mixes products with targets 30%+ apart, or a sub-segment would clear 30 conversions a month on its own, or a merge would lift a starved campaign from under 15 to 30+.
- At most one structural change per campaign every 2 weeks. Log every change in the Change Log with date.

### Brand Search rules
- Keep it on when any of: competitors or resellers (Amazon, retailers) appear on brand queries (ask for auction insights), PMax is live (protects brand from PMax overbidding), a promotion is running that the organic result does not show.
- Spend control: brand CPC should be under $0.60 to $1.00 for our size. If brand CPC rises more than 40% in 30 days, someone is bidding on the brand. Check auction insights.
- Expect brand Search ROAS of 10 to 30x on TW last platform click. That number is NOT incremental return (see Traps). Never move brand ROAS into "Google is working".
- Test incrementality once a year per brand with enough volume (100+ brand orders a month): geo split (pause brand ads in ~30 to 50% of regions) for 2 to 4 weeks, read total Shopify orders and GSC organic brand clicks in each half. Published tests range from ~0% lift (Haus series) to 20 to 50% incremental (iQuanti, agency) and up to 85% in conquested categories. Assume low incrementality on a naked SERP, high when competitors bid.

### Negative keywords and search terms
- Account-level negative list on every brand from day 1: jobs, careers, free, cheap, used, repair, replacement part (unless sold), wholesale (unless wanted), DIY, how to make, reddit, coupon (unless running a code), counterfeit, and the brand's known false matches (for golf: golf course names, tee times, simulator, lessons; for patches: nicotine, medical, prescription; for jewelry: pawn, appraisal, sell my gold).
- Apply the same list to PMax (campaign-level negatives or negative keyword list). Negatives in PMax only affect Search and Shopping inventory, not YouTube/Display/Discover.
- Brand exclusion on PMax: use Google's brand list for the client's brand; scope to Search text ads so branded Shopping still serves (or exclude both if brand Search plus standard Shopping cover it).
- Review cadence: non-brand Search search terms weekly; PMax search terms and search-term insights every 2 weeks.
- Add a negative when a term is clearly irrelevant (any spend), or spent 2x target CPA with no conversion, or has 50+ clicks with no conversion. Use exact-match negatives for single bad queries, phrase negatives for bad themes. Never negate a term that converts at under 1.5x target CPA because it "looks wrong".
- Competitor terms: only as a separate campaign with its own budget cap and a 1.5 to 2x higher CPA allowance; never let competitor terms mix into the main non-brand campaign.

### Merchant Center and feed rules (Shopping and PMax)
- Feed quality decides Shopping reach more than bids. Fix the feed before touching targets.
- Titles: brand + product type + key attribute (size, color, loft, material) + model. Most important words in the first 70 characters (150 max). Use the Shopify app's "SEO title" option to send a search-built title without changing the storefront.
- Identifiers: own-brand products use brand + MPN (SKU); set identifier_exists to false only when there is truly no GTIN. Products with valid GTINs get better matching.
- product_type: brand's own taxonomy, 3 levels (e.g. Golf > Wedges > 60 degree). google_product_category set explicitly.
- Custom labels (0 to 4) for decisions, not decoration: label0 margin tier (high, mid, low), label1 bestseller vs long tail, label2 price bucket, label3 season or promo, label4 new launch. These let you split listing groups later without a feed rebuild.
- Images: product on clean background as main image, 1,000+ px. Lifestyle images as additional_image_link.
- sale_price with dates for promos (needed for sale annotations); price-drop badges are automatic when price falls well below the trailing 60-day average. Do not jitter prices; stable base price plus planned promo windows earns badges.
- Promotions in Merchant Center for real time-bound offers (codes, free gift, BFCM). Always-on free shipping goes in shipping settings, not promotions. Buy X get Y does not sync from Shopify; build it in Merchant Center.
- Product ratings: review feed from the reviews app (Judge.me, Okendo, Yotpo) or a Google-approved aggregator; Google needs a minimum review count before stars show (commonly cited as 50 total, not verified for 2026). Stars lift CTR.
- Shipping and returns set in Merchant Center (they show as annotations and feed free listings).
- Check weekly: disapproved and limited items. More than 5% of active SKUs disapproved is a P1 issue.
- Out of stock: Shopify app syncs availability. A hero going out of stock drops PMax volume within a day. Check Supply/stock before diagnosing Google performance.

### Demand Gen and YouTube rules
- Only run with: 3+ videos (at least one 9:16 under 60s) plus 3+ images per ad group, a product feed attached for Shopping-style ads, and a budget that can buy at least 30 conversions in 4 weeks (budget x 28 / target CPA >= 30).
- Judge on: TW first click and linear all (Demand Gen is upper funnel), blended MER and new customer count for the brand over the test, and GSC brand impressions. Never on Google-reported conversions alone (engaged-view and view-through inflate it).
- Kill after 4 weeks if: TW first-click ROAS under 50% of the account's blended ROAS AND no rise in brand search impressions AND MER did not hold.
- YouTube creative: the first 5 seconds must show the product and the brand name spoken or on screen; branded intros lift brand search, which is the main way YouTube pays back.

### Conversion tracking (check before any bidding call)
- One primary conversion action: Purchase, from the Shopify Google & YouTube app (or server-side tag). GA4-imported purchase set to secondary. Add to cart, begin checkout, page view: secondary only.
- Value = order subtotal after discounts, before tax and shipping, so it lines up with TW revenue (Shopify total sales minus tax).
- Enhanced conversions on (hashed email at checkout). Consent mode v2 set if the brand sells in the EEA or UK.
- Customer Match: upload or sync all purchasers (Klaviyo or Shopify sync) monthly; needed for the new customer goal and as a PMax signal. Under ~1,000 matched users the list is weak.
- Repeat purchase brands (patches, pet, consumables): count every purchase, not one per click.
- Sanity ratio, weekly: Google-reported purchases / TW orders with any Google touch. Above 1.5 for Search and Shopping, or a sudden 30%+ step change, means tracking moved, not performance.

### Promotions and peak periods (BFCM, Father's Day, product drops)
- Merchant Center promotion and sale_price with dates submitted at least 3 to 5 days before launch (Google reviews them).
- Add a promotion asset and an offer RSA to Brand Search; brand searches spike 2 to 4x during big sends and Meta pushes.
- Raise budgets the day before, not during, the peak: +30 to 50% on PMax and Brand for the event days only. Budget-limited campaigns at peak lose the cheapest conversions of the year.
- Use a seasonality adjustment only for events of 1 to 7 days with an expected conversion rate jump of 30%+. Remove it the day the event ends.
- Do not change tROAS during the event. If anything, loosen by 10% one week before to let volume build, and restore one week after.
- After the event: expect 3 to 7 days of lower conversion rate (pulled-forward demand). Do not cut on that week.
- Peak reads are judged on store revenue and MER for the event window vs plan, not on Google ROAS.

### Weekly routine (what the Strategist runs or asks for)
1. Google spend vs plan by campaign type, TW last platform click ROAS by campaign, brand vs non-brand split.
2. Google share of spend vs share of TW-attributed revenue; store MER and new customer share.
3. Change Log entries from the last 14 days on Google AND Meta (to know what is in learning).
4. Spend vs budget per campaign (target-limited vs budget-limited).
5. Ask a person for: search terms (Search weekly, PMax every 2 weeks), Merchant Center disapprovals, auction insights on brand (monthly).
6. Output: at most 3 Google suggestions a week per brand, each one change per campaign.

### Notes by vertical (our brands)
- **Golf equipment and accessories** (wedges, belts, socks, clubs): strong category search ("60 degree wedge", "golf gifts"), heavy competitor and Amazon presence on brand terms, steep seasonality (spring ramp, Father's Day, holiday gifting). Keep Brand Search on. Non-brand Search worth testing on gift and spec terms. Feed titles must carry loft, bounce, hand, flex, size.
- **Golf apparel** (polos): visual category; PMax plus Shopping carries it, Demand Gen and YouTube Shorts can work with Meta creative. Variant data (size, color) must be complete or items get limited.
- **Patches (party, wellness)**: check Google health and supplement policies before launch (restricted claims get disapproved; "hangover", "cure", "treat" in titles is a risk). Small category search; Google is mostly brand harvest, so keep Google spend modest and judge it on brand.
- **Jewelry** (Ice & Gold): gifting peaks (Valentine's, Mother's Day, holiday); price-sensitive shoppers compare in Shopping, so price and image quality decide. Material and metal in titles (14k, sterling, moissanite).
- **Pet**: subscription and repeat purchase; value conversions at first-order value but read 90-day customer value per campaign in TW before cutting.
- **Hockey gear**: seasonal (Aug to Feb), spec-driven queries (size, flex, curve), strong retailer competition on Shopping; non-brand Search on exact spec terms beats broad.

## 3. Diagnostics

| Symptom | Likely causes, in order | Number that confirms it | Fix |
|---|---|---|---|
| Google ROAS (TW) fell, Google spend flat | 1. Meta spend or creative changed, less brand demand. 2. Hero out of stock or disapproved. 3. Competitor on brand. 4. Tracking broke. 5. Seasonality | 1. Meta spend 14d vs prior, GSC brand impressions trend. 2. Shopify stock, PMax spend shift by campaign. 3. Brand CPC up 40%+. 4. Google conversions dropped to near zero on one day while TW orders steady. 5. Same weeks last year in TW | Fix the cause, not the bid. Only lower targets once 1 to 4 are ruled out |
| PMax spend and ROAS up, store revenue flat | PMax took over brand and returning-customer traffic | Brand Search campaign impressions or spend falling as PMax rises; TW new customer % on PMax orders below brand average; MER flat | Brand exclusion on PMax, keep brand Search, turn on new customer goal (bid higher) |
| Campaign will not spend budget | tROAS too high; feed limited; low query volume | Spend under 80% of budget for 7+ days with tROAS set | Lower tROAS 10 to 15%, or switch to Max conversion value for 2 weeks |
| Spend jumped, conversions did not | Learning restart after a change; AI Max or broad match expansion; PMax moving into Display/YouTube | Change Log entry in last 7 days; Search campaign clicks up, CVR down; PMax CTR down sharply | Revert or wait out one cycle; add negatives; upload real videos; check channel performance page |
| Google conversions far above TW orders (more than 2x) | Duplicate primary actions (GA4 import + Google tag); engaged-view and view-through; value includes tax/shipping | Google conversion count vs Shopify orders on the same day; conversion action list (ask) | One primary purchase action, Shopify Google & YouTube app tag or server-side, value = subtotal |
| Shopping/PMax impressions fell off a cliff | Merchant Center suspension or mass disapproval; feed sync broken; price mismatch | PMax spend down 50%+ day over day; GA4 Google CPC sessions down same day | Ask for Merchant Center diagnostics; reconnect app; fix policy |
| Brand CPC rising | Competitor or reseller bidding; brand Search losing to PMax internally | Brand CPC +40% over 30 days; brand impression share drop (ask) | Raise CPC cap, add RSA with offer, file trademark complaint if used in ad text |
| Non-brand Search CPA high | Broad or AI Max drift; landing page mismatch; low-intent terms | Search CTR under 3% and CVR under 1%; GA4 landing page engagement rate low | Search terms review, negatives, tighten to exact/phrase, send to collection or PDP not homepage |
| Demand Gen "converts" in Google, nothing in TW | Engaged-view and view-through conversions | Google conversions with near-zero TW last platform click and first click | Judge on lift (MER, brand search, new customers), not platform numbers |
| Google ROAS improves after Meta scaled | Meta-created demand harvested by Google | Brand Search and PMax revenue rise 0 to 14 days after Meta spend rise, GSC brand impressions up | Credit Meta in the read; do not scale Google on it |

## 4. How Google affects the other channels

- **Google mostly harvests.** Brand Search, PMax Shopping and remarketing catch people Meta, email, creators and word of mouth already sent. Last-click views reward Google for that.
- **Meta to Google halo**: Meta Search Lift studies (Dentsu, 64 studies, luxury and fashion) found Meta exposure raised search volume about 10% on average, 11% for Google paid search, 19% when brand and performance Meta ran together. A single-brand Code3 test found 28% of paid search revenue was incremental to Meta. Vendor studies, directional only.
- **PMax remarketing overlaps Meta retargeting and Klaviyo flows.** A PMax lift that matches a Klaviyo campaign send is credit-shifting.
- **Cutting Meta hits Google 1 to 3 weeks later**: brand Search and PMax revenue fall with brand demand. Do not read a Google drop in that window as a Google problem.
- **Brand Search and organic**: pausing brand ads moves some clicks to the organic result (Polar test: organic +6.6% where brand ads paused). Total clicks matter, not paid clicks.
- **Amazon spillover**: brands that sell on Amazon can see store orders move to Amazon when Google brand ads stop (Haus/Orthofeet: store +1.36%, Amazon -2.7%). Check Amazon before calling a brand test.

### Real growth vs credit shifting
Real growth when, over the same 14 to 28 days: store revenue (TW) and new customers rise, MER holds or improves, and Google's share of TW-attributed revenue rises less than its share of spend. Credit shifting when: Google attributed revenue rises, store revenue and new customers flat, Meta or email revenue on TW falls by a similar amount, or brand campaign share falls as PMax rises.

### Check before a Google change
1. Meta: spend and creative changes in last 14 days (Change Log), current trend.
2. Klaviyo: big sends or promos in the window (email spikes brand search).
3. GSC: brand impressions trend 28 days.
4. Stock: heroes in stock (Supply).
5. TW: MER, new vs returning, Google's share of attributed revenue.

### Check after a Google change (7, 14, 28 days)
1. Store revenue and new customers (TW), MER.
2. Google ROAS on TW last platform click AND first click.
3. Meta last platform click revenue: did it fall as Google rose?
4. GSC brand clicks plus brand Search clicks combined (total brand clicks).

## 5. What a great suggestion looks like

**Example 1: PMax eating brand**
- WHAT: Add the brand to PMax brand exclusions (Search text only), keep Brand Search running, set "bid higher for new customers" on PMax.
- NUMBER: Over the last 28 days PMax spend rose from $2,100 to $3,400 (Google Ads, +62%) while Brand Search impressions fell 38% and TW store revenue was flat (+2%). New customer share on PMax orders 41% vs brand average 63% (TW).
- WHY: PMax is buying people who were already searching for us, at PMax prices.
- WATCH: Brand Search impressions back to the prior level within 7 days; PMax spend may drop 15 to 30% and its TW ROAS may fall. The real read is store revenue and new customers over 21 days.
- HOW SURE: Medium-high. Pattern is classic; confirm in the PMax search terms report that brand terms are a top spender before applying.

**Example 2: tROAS choking a campaign**
- WHAT: Lower PMax tROAS from 400% to 340% (one step, -15%).
- NUMBER: PMax spent $61 of a $100 daily budget on average for 14 days (Google Ads); TW last platform click ROAS 3.9x vs target 2.8x for the brand.
- WHY: It is beating target by a wide margin and leaving budget unspent, so the target is the cap, not demand.
- WATCH: Daily spend should reach $85 to $100 within 7 days; TW ROAS should stay at or above 2.8x over 14 days. If ROAS falls under 3.0x, hold, do not step again.
- HOW SURE: High on spend rising, medium on ROAS holding.

**Example 3: brand search test**
- WHAT: Run a 3-week geo holdout: pause Brand Search in 40% of US states (matched by past revenue), keep it on in the rest.
- NUMBER: Brand Search is $1,450/mo at 22x TW ROAS, 17% of Google spend; no competitor bidding seen in auction insights last 90 days (ask Cole to confirm); GSC shows brand at organic position 1.0.
- WHY: On a naked SERP most brand-ad buyers would click the organic result anyway; we may be paying for orders we already have.
- WATCH: Total Shopify orders and GSC organic brand clicks in test vs control states, 21 days. Keep if test states lose more than 3% of orders.
- HOW SURE: Low to medium before the test; that is why it is a test, not a pause.

## 6. Traps

- **Brand ROAS is not Google's ROAS.** Blending brand Search into "Google ROAS" makes Google look 2x better than it is. Always report Google brand and Google non-brand (incl. PMax) separately.
- **PMax ROAS is mostly brand and returning customers** unless brand is excluded. A high PMax ROAS with low new customer share is a remarketing campaign.
- **Google conversions are not orders.** Modeled, cross-device, view-through and engaged-view conversions inflate Google. Use TW last platform click, read first click for upper-funnel types.
- **Reading a learning period as a result.** Most "it got worse after the change" calls are within 7 days of a change. Wait 2 cycles.
- **Raising budget on a target-limited campaign.** If spend is under budget, budget is not the constraint.
- **Changing two things at once** (target and budget, or target and assets). You will not know what worked.
- **Judging Google while Meta is moving.** Any Meta spend change over 20% in the prior 14 days contaminates a Google read.
- **"Search impression share is low, so spend more."** Low impression share on non-brand is normal for a small brand; only buy more when marginal ROAS holds.
- **Over-splitting PMax.** Five asset groups with 6 conversions each learn nothing.
- **Auto-generated PMax videos.** If no video is uploaded, Google makes one; YouTube spend rises, results do not.
- **Promotions that never show.** Free shipping set as a promotion, Buy X get Y expected to sync, or sale_price without dates.
- **Brand-off test read on Google data.** When brand ads stop, Google-reported conversions fall by definition. Read Shopify orders and organic clicks, and check Amazon.
- **Seasonality adjustments for a whole season.** They are for 1 to 7 day spikes; using them across BFCM month distorts bidding.
- **Cutting Google because Meta first-click says Meta drove it.** Both claims can be partly true; the read is the store and MER, not who gets credit.

## 7. Sources

- Google Ads Help, AI Max for Search campaigns: https://support.google.com/google-ads/answer/15910187
- Google blog, AI Max for Search: https://blog.google/products/ads-commerce/google-ai-max-for-search-campaigns/
- Google blog, Smart Bidding Exploration (May 2025): https://blog.google/products/ads-commerce/smart-bidding-exploration-ai/
- Google Ads Help, learning period duration: https://support.google.com/google-ads/answer/13020501
- Google Ads Help, measuring Smart Bidding performance: https://support.google.com/google-ads/answer/6268633
- Search Ads 360 Help, bid strategy learning: https://support.google.com/sa360/answer/16871384
- Google blog, Performance Max features 2025: https://blog.google/products/ads-commerce/new-performance-max-features-2025/
- Google blog, PMax channel performance reporting: https://blog.google/products/ads-commerce/channel-performance-reporting-coming-to-performance-max/
- Google Ads Help, more visibility and control in PMax (Aug 2025): https://support.google.com/google-ads/answer/16451273
- PPC Land, PMax negative keyword limit to 10,000: https://ppc.land/google-raises-negative-keywords-limit-to-10-000-for-performance-max-campaigns/
- PPC Land, PMax 2025 rollouts wrap-up: https://ppc.land/google-wraps-up-performance-max-feature-rollouts-in-2025/
- Google Ads Help, text guidelines (beta): https://support.google.com/google-ads/answer/16489313
- Google Ads Help, more goals in PMax: https://support.google.com/google-ads/answer/16127398
- Code3, Standard Shopping vs PMax priority change: https://code3.com/resources/reintroducing-standard-shopping-how-googles-latest-update-shifts-your-campaign-strategy/
- Google Ads Help, Shopping campaign priority: https://support.google.com/google-ads/answer/2454022
- Google Ads Help, VAC upgraded to Demand Gen: https://support.google.com/google-ads/answer/15110871
- PPC Land, Demand Gen $5 minimum budget: https://ppc.land/google-to-enforce-5-minimum-daily-budget-on-demand-gen-campaigns-from-april/
- PPC Land, Demand Gen budget floor commentary: https://ppc.land/google-pm-calls-100-a-day-the-floor-for-a-demand-gen-campaign/
- Merchant Center Help, syncing products: https://support.google.com/merchants/answer/13693394
- Shopify Help, Google & YouTube channel setup: https://help.shopify.com/en/manual/online-sales-channels/google/getting-setup/connect
- Optmyzr, Merchant Center feed optimization: https://www.optmyzr.com/blog/google-merchant-center-product-feed-optimization-guide/
- ROI Revolution, Shopping annotations: https://roirevolution.com/blog/google-merchant-center-shopping-annotations/
- Merchant Center Help, promotions: https://support.google.com/merchants/answer/10146009
- Haus, three brand search incrementality tests: https://www.haus.io/customer/brand-using-brand-search
- Haus, Orthofeet brand search and Amazon: https://www.haus.io/customer/orthofeet
- Polar Analytics, WillPowders brand search test: https://www.polaranalytics.com/case-studies/willpowders-brand-search-polar-incrementality-testing
- iQuanti, brand search incrementality range: https://www.iquanti.com/blog/are-you-overspending-on-branded-paid-search-campaigns-and-not-even-realizing-it/
- Search Engine Journal, should you bid on brand terms: https://www.searchenginejournal.com/should-i-bid-on-branded-terms-in-sem/373258/
- Campaign (Dentsu Meta Search Lift): https://www.campaignlive.co.uk/article/searches-originate-somewhere-%E2%80%93-somewhere-often-meta/1900190
- Code3, The Sill search lift study: https://code3.com/results/the-sill-search-lift-study/
- Brainlabs, Meta incrementality and search lift: https://www.brainlabsdigital.com/paid-social-measurement-meta-incrementality-search-lift/
- Not verified: the 50-review minimum for product ratings in 2026, the exact 20% learning-reset thresholds (practitioner rule of thumb), text guidelines limits and global date, PMax channel performance general availability date.

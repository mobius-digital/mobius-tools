# Website and conversion (CRO) for Shopify DTC

Scope: reading GA4 and Shopify for a DTC store, the funnel from visit to purchase, landing pages vs product pages, mobile, speed, PDP and checkout, trust, matching pages to ad angles, and how site conversion changes what Meta, Google and Triple Whale report. Read with `offers-pricing.md` (thresholds, bundles and discounts live there).

The one formula behind this file: **CPA = CPC / site conversion rate.** A 20% lift in CVR cuts CPA on every paid channel by 17% at the same CPC. A site fix is the only change that improves Meta, Google, TikTok and email at once.

---

## 1. How it works now (2025 to 2026)

### Tracking plumbing (check this before any CRO call)
- **Shopify killed checkout scripts.** Plus stores lost Additional Scripts and checkout.liquid on the Thank you / Order status pages on 2025-08-28. Non-Plus stores were auto-upgraded after the 2026-08-26 deadline. Anything (GTM, GA4 tags, old pixels) that lived in that box stopped firing silently: orders flow, the page renders, the purchase event goes to zero.
- Tracking now lives in **Settings > Customer events**: app pixels (Google & YouTube app, Meta, TikTok, Klaviyo) and custom pixels (Web Pixels API, `checkout_completed`). Custom pixels run sandboxed, so GTM preview does not work inside checkout; verify with a real order and GA4 DebugView.
- **Healthy GA4 vs Shopify gap:** GA4 purchases 5 to 15% below Shopify orders (ad blockers, consent, Safari/ITP, in-app browsers). **Over 25% below = broken tracking**, not a site problem. GA4 purchases above Shopify orders = duplicate firing (two GA4 integrations, usually the app plus an old GTM tag).
- Shopify Analytics "conversion rate" = sessions that ended in an order / sessions. GA4 "session key event rate" for purchase is similar but session definitions differ (GA4 sessions break at midnight and at 30 min idle; Shopify uses its own). Never mix the two in one trend line. Pick one source per brand per report and keep it.
- Consent Mode v2 matters only for EU/UK traffic. Mobius brands are mostly US, so GA4 is mostly observed, not modeled.

### GA4 views the Strategist should use
- **Reports > Engagement > Landing page**: sessions, engagement rate, key events, session key event rate per landing page. This is where an ad angle's page is judged.
- **Monetization > Ecommerce purchases / Checkout journey**: view_item, add_to_cart, begin_checkout, add_payment_info, purchase counts. Step rates come from here.
- **Tech > Device category**: mobile vs desktop CVR. Paid social traffic is 80 to 90% mobile.
- **Acquisition > Traffic acquisition** by session source/medium or default channel group: CVR by channel. Needs consistent UTMs (Meta: `utm_source=facebook&utm_medium=paid` via URL parameters on every ad).
- **Engaged session** = 10+ seconds, or 2+ page views, or a key event. Engagement rate is the GA4 replacement for bounce rate (bounce = 1 minus engagement rate).

### What GA4 is NOT for
- Judging Meta or TikTok ROAS. GA4 counts clicks only, no view-throughs, and many Meta clicks open in the Instagram/Facebook in-app browser where the cookie dies, so the buyer returns later as Direct or Organic. GA4 typically credits Meta with 30 to 60% of what Triple Whale last platform click gives it. Attribution stays on Triple Whale (doctrine).
- GA4 is for **site behaviour**: which page, which device, which step, which landing page loses people.

### Shopify checkout in 2025 to 2026
- One-page checkout is the default; Shop Pay, Apple Pay, Google Pay and PayPal are the accelerated options. Shopify claims Shop Pay converts up to 50% better than guest checkout (Shopify-commissioned study, "up to", not independent). Practical rule: accelerated buttons must show on the PDP and in the cart drawer on mobile, not only in checkout.
- Non-Plus stores can brand checkout and add app blocks on Thank you / Order status only. Plus can add blocks in information, shipping and payment steps. So for most Mobius brands, **checkout friction fixes happen before checkout**: in the cart, on the PDP, and in shipping settings.
- Shopify discount combinations (product + order + shipping) and Shopify Functions mean stacking bugs are common: a free-shipping discount that silently does not combine with a BF code reads to the shopper as "they charged me shipping".

### Speed and Core Web Vitals (thresholds stable since INP replaced FID in March 2024)
| Metric | Good | Needs work | Poor |
|---|---|---|---|
| LCP (main image/text painted) | 2.5 s or less | 2.5 to 4.0 s | over 4.0 s |
| INP (tap to response) | 200 ms or less | 200 to 500 ms | over 500 ms |
| CLS (layout jumping) | 0.1 or less | 0.1 to 0.25 | over 0.25 |
- Judged at the **75th percentile of real Chrome users over 28 days** (CrUX field data). Lighthouse / PageSpeed lab scores are for diagnosis only; a lab score of 40 with field LCP 2.1 s is fine.
- Shopify admin > Online Store > Themes > Web performance shows field LCP/INP/CLS for the store.
- On Shopify the usual causes are apps, not the theme: review widgets, popups, chat, upsell, quiz and tracking apps each add script. Uninstalling an app often leaves its snippet in the theme.
- Effect sizes on conversion are vendor-reported (7 to 20% CVR per second of LCP); direction is solid, size is not. Treat speed as a gate (pass the thresholds on mobile PDP and LP), not as an infinite lever.

### How the ad platforms use your site's conversion rate
- **Meta**: the auction ranks on bid x estimated action rate x ad quality. Estimated action rate is Meta's prediction that this person converts after seeing this ad, and it is learned from your pixel/CAPI purchases. A site that converts better makes every impression worth more to Meta, so delivery gets cheaper per purchase and the system finds buyers faster. Meta also uses post-click signals (bounce, dwell) in ad quality. Andromeda (2025) did not publish a landing page score; the effect runs through conversion feedback.
- **Landing page view (LPV)** fires only when the page loads and the pixel fires. LPV / link clicks is a load-speed and redirect check.
- **Google Ads**: Quality Score includes landing page experience (search); Smart Bidding (tROAS/tCPA, PMax, Shopping) predicts conversion rate per auction, so a CVR gain lifts impression share at the same target. Merchant Center disapproves products when the landing page price or availability does not match the feed (watch this during price tests and sales).
- **Triple Whale**: CVR changes show up in orders and MER first. Platform ROAS moves later and less cleanly.

---

## 2. Benchmarks: the funnel, step by step

Session-based rates for a Shopify DTC store with mostly paid social traffic, US, AOV $40 to $150. Use the brand's own 8-week baseline first; these ranges only say whether the baseline itself is a problem.

| Step | Metric (GA4 or Shopify) | Weak | Typical | Strong |
|---|---|---|---|---|
| Click to page load | Meta LPV / link clicks | under 70% | 75 to 85% | over 88% |
| Page to engaged | GA4 engagement rate, paid social | under 35% | 40 to 55% | over 60% |
| Session to add to cart | add_to_cart sessions / sessions | under 3% | 4 to 7% | over 9% |
| PDP view to ATC | add_to_cart / view_item | under 5% | 6 to 10% | over 12% |
| ATC to checkout | begin_checkout / add_to_cart sessions | under 35% | 40 to 55% | over 60% |
| Checkout to purchase | purchase / begin_checkout | under 40% | 45 to 60% | over 65% |
| Session to purchase (store) | Shopify conversion rate | under 1.0% | 1.4 to 2.5% | over 3.2% (top 20%), over 4.7% (top 10%) |

CVR by traffic source (session to purchase), so mix changes are not mistaken for site changes:
- Cold paid social (prospecting): 0.6 to 1.8%.
- Retargeting / returning visitors: 3 to 6%.
- Email / SMS clicks: 3 to 8% (campaign days with an offer: higher).
- Branded search: 5 to 12%. Non-brand search and Shopping: 1.5 to 3%.
- Desktop CVR is usually 1.8 to 2.2x mobile. Mobile under 40% of desktop = a mobile-specific problem.
- AOV scales CVR down: a $150+ AOV store converting 1.2% cold is fine; a $35 AOV store at 1.2% is weak.

Cart abandonment is around 70% across studies (Baymard). Top stated reason is extra costs shown late (shipping, tax, fees), then forced account creation, slow delivery, distrust of payment, long or complex checkout.

---

## 3. Decision rules

### Minimum data before any site call
- A funnel step rate is "real" when its denominator has **1,000+ sessions** (or 300+ events for ATC-based steps) and it moved **15%+ relative** against the 4-week baseline, holding through 7+ days.
- A/B test sample per arm to detect a relative lift L on baseline CVR p at 80% power, 95% confidence: **n ≈ 16 x p x (1 minus p) / (p x L)²**. Baseline 2%, want to detect +20%: about 19,600 sessions per arm. Most Mobius brands cannot run purchase-CVR tests on small changes. Therefore:
  - Test **big swings** only (new page type, new offer framing, removing a step), aiming at 25%+ effects.
  - Use **add to cart rate or checkout rate as the primary metric** when purchase volume is under 150 per arm, then confirm with revenue per session.
  - Use **revenue per session** (or profit per session) as the final judge; CVR alone hides AOV changes.
- Duration: **at least 14 days** covering two weekends, max 6 weeks (cookie churn). Never start or end a test inside a promo, email blast day, or BFCM (Nov 1 to Dec 2). No site tests from Nov 10 to Dec 2.
- Split tools on Shopify: Intelligems, Shoplift, Convert, or theme duplicate + Meta ad split for LP tests. For LP vs PDP, the cleanest test is **two ads identical except destination URL, in the same test ad set**, judged on Triple Whale purchases and CVR (doctrine: tests are numbered ad sets).

### When to change what
- **Fix tracking first.** If GA4 or Meta purchases are more than 25% under Shopify orders for 3+ days, every CRO and ads conclusion is paused until fixed.
- **Fix speed when failing.** Mobile PDP or main LP failing LCP (over 2.5 s) or INP (over 200 ms) at p75: fix before creative or page tests. Target: remove or defer any app not used weekly; compress hero images to under 200 KB; no autoplay video above the fold without a poster image.
- **Fix the step that leaks most, one at a time.** Rank steps by (brand rate vs benchmark) x volume. Change one thing per page per two weeks.
- **Build a dedicated landing page** when one of these is true:
  - The ad angle needs proof or education the PDP does not carry (problem-aware audience, new category, "why this works", comparison, advertorial or listicle format).
  - The ad promises a bundle, a quiz result or a gift the PDP does not show above the fold.
  - The angle's ad set spends $1,500+ a week (enough traffic to read the page in 2 weeks).
- **Keep sending to the PDP** when the product is known, the ad is product-led (demo, unboxing, close-up), price is under ~$60, or the audience is solution-aware. A PDP with strong reviews usually beats a weak LP.
- **Collection pages** as a paid destination only for range-led ads ("pick your design") with 6 or fewer products; otherwise they lose 20 to 40% of the ATC rate of a PDP.
- **Homepage** is never a paid social destination.
- **Mobile first, always.** Every page decision is judged on mobile numbers first; desktop second.

### PDP elements that move conversion (in rough order of impact for DTC)
1. **First screen on mobile (no scroll):** product image that matches the ad, product name, price (with compare-at only if real), star rating with count, the one-line promise from the ad angle, variant picker, Add to cart, accelerated pay button. If Add to cart is below the fold on a 390 px wide phone, fix that first.
2. **Image set:** 6 to 9 images: hero, in use, scale/size in hand, detail, what's in the box, a UGC still, a comparison. Video under 30 s, muted, with captions.
3. **Reviews:** count and recency matter more than the average (4.6 to 4.8 converts better than 5.0). Photo reviews near the top. Under 20 reviews: lead with expert or press proof instead.
4. **Offer and shipping line near the button:** "Free shipping over $X", delivery estimate ("Arrives by Thu, Oct 16"), returns policy in 6 words.
5. **Answer the top 3 objections** from reviews/support (sizing, fit, will it work for me, durability) in a short FAQ or icons. Sizing charts must open in place, not a new page.
6. **Bundle or quantity picker** above the fold when units per order matter (see `offers-pricing.md`).
7. **Sticky Add to cart** bar on mobile after the first scroll.
8. Remove: auto-carousel heroes, popups in the first 8 seconds on paid traffic, chat bubbles over the button, out-of-stock variants selected by default.

### Cart and checkout friction rules
- Show shipping cost (or "free") and the free-shipping progress **before checkout** (cart drawer). Surprise costs are the top abandonment reason.
- Cart drawer, not a cart page, for single-product brands; one upsell max in the drawer, not three.
- No forced account creation (Shopify: customer accounts optional).
- Shop Pay, Apple Pay, PayPal visible; Afterpay/Klarna/Shop Pay Installments when AOV is over $100 (installments messaging on PDP lifts higher-AOV CVR).
- Discount code field present but not shouting; automatic discounts beat codes for paid traffic (no "I need a code" exit to Google, no Honey leakage).
- Checkout to purchase under 40% for 7+ days: check shipping rates and delivery promise first, then payment errors (Shopify > Orders > Abandoned checkouts, look for clusters), then app conflicts.

### Trust checklist (new-customer heavy brands, which is most of the roster)
- Reviews with photos, return policy, real contact info, delivery estimate, secure-pay icons only near the button, "as seen in" only if true. Trust work matters most when new-visitor CVR is low but returning CVR is normal.

### Page type by angle and audience
| Ad angle / format | Audience awareness | Best destination | First screen must show |
|---|---|---|---|
| Product demo, close-up, unboxing | Solution or product aware | PDP | The exact product and variant from the ad, price, reviews, button |
| Problem / pain ("lost another ball marker") | Problem aware | Short LP or PDP with angle headline | The problem in the ad's words, then the product as the answer |
| Founder / story / why we made it | Unaware to problem aware | Advertorial or story LP | Headline continuing the story, product within 1 scroll |
| Comparison ("vs the big brand") | Solution aware, shopping | Comparison LP or PDP section | The comparison table or 3 differences, then button |
| Listicle ("5 reasons golfers switch") | Problem aware | Listicle LP | Reason 1 with proof, sticky button |
| Offer-first (BFCM, gift, drop) | Product aware, warm | PDP or offer LP with the offer pre-applied | The offer in the ad's words, end date, stock |
| Range / designs ("pick your pattern") | Product aware | Filtered collection, 6 items or fewer | The designs from the ad, prices, quick add |
| Creator / UGC testimonial | Mixed | PDP with UGC near top | The creator's clip or quote above the fold |

### Brand-type notes for the Mobius roster
- **Golf equipment, $100+ AOV (wedges, drivers, belts with kits):** low CVR is normal (0.8 to 1.5% cold). Biggest levers: proof (reviews, specs, comparisons), installments messaging, fitting/sizing answers (loft, bounce, hand, length), delivery date before the season or event. Returning visitors convert 3 to 5x new; a long consideration path is normal, so judge on 7-day click windows, not same-session.
- **Golf and lifestyle apparel:** size charts and fit notes (model height and size worn), returns/exchanges in 6 words on the PDP, color swatches that show the real color. Mobile image zoom matters.
- **Party / wellness patches and consumables, under $40:** impulse buys; first-screen clarity and price-per-use drive CVR. Multi-pack picker on the PDP (see `offers-pricing.md`), subscribe option if offered. Speed matters more here than anywhere: low intent, short patience.
- **Jewelry:** photography (on body, scale, in light), materials and allergy answers, gift messaging and packaging shown, delivery date before gifting dates. Trust gap is large for new brands: reviews with photos first.
- **Pet:** ingredient or safety proof, vet or expert quotes, "will my pet like it" answers, subscription option.
- **Hockey gear:** sizing by age/level, compatibility (stick flex, blade curve), team or bulk options; seasonal timing around season start.

### Weekly site check (what the Strategist runs every Monday)
1. Tracking: Shopify orders vs GA4 purchases vs Meta purchases vs TW orders, last 7 days. Gap rules above.
2. Funnel: each step rate vs its 4-week baseline, mobile only; flag any step down 15%+ on 1,000+ sessions.
3. Landing pages: top 5 paid landing pages by sessions; engagement rate and session CVR; flag any page under half the store CVR with 500+ sessions.
4. Speed: Meta LPV / link clicks by ad; flag under 75%. Monthly: field CWV for PDP and LP templates.
5. Stock: hero SKUs and variants used in live ads; an ad pointing at a sold-out variant is switched to a live variant or paused the same day.
6. Offer consistency: the offer in live ads, on the PDP, in the cart, in the announcement bar and in Klaviyo flows all match.

### Matching landing pages to ad angles
- Rule: **the first screen of the page must repeat the ad's promise in the ad's words** and show the product the ad showed. If the ad says "the belt that holds your ball marker on the green", the page headline cannot be a generic brand line.
- One angle (doctrine: angle = the argument) gets one page variant at most. Concepts (how it is shown) share the angle's page.
- Offer in the ad must be live and visible on the page. An ad with "free hat with any club" landing on a PDP that never mentions the hat loses the click's intent.
- Track it: every ad carries `utm_content={{ad.name}}` so GA4 Landing page x session manual ad content shows which angle's page holds people.

---

## 4. Diagnostics

| Symptom | Likely causes, in order | Number that confirms it | Fix |
|---|---|---|---|
| Meta purchases down 30%+, Shopify orders flat | 1. Pixel/CAPI break (theme publish, checkout upgrade, app removed) 2. Attribution window or setting change | Shopify orders vs Meta purchases vs TW orders by day; Meta Events Manager event match quality and deduplication | Fix pixel/CAPI; do not touch budgets or creative until 3 clean days |
| GA4 purchases 25%+ under Shopify | Purchase tag lived in Additional Scripts, consent blocking, duplicate GA4 property | GA4 purchase count vs Shopify orders, last 14 days; date the gap started | Move to Google & YouTube app or a custom pixel; remove duplicate tags |
| GA4 purchases above Shopify orders | Two integrations firing (app + GTM) | Purchase events per transaction_id > 1 | Remove one |
| Strong CTR, low ATC rate | 1. Page does not match the ad promise 2. Price surprise 3. Slow mobile load 4. Default variant out of stock | Meta outbound CTR normal; LPV/link click; GA4 landing page engagement rate; view_item to ATC by landing page | Match first screen to the angle; show price earlier in the ad; fix LCP; fix variant default |
| LPV / link clicks under 70% | Slow page, redirect chain, in-app browser issue, pixel loads late | Meta LPV vs link clicks by ad; field LCP for that URL | Remove redirects (use final URL), cut apps, preload hero image |
| Engagement rate under 35% on paid social | Mismatch, slow load, popup on entry, accidental clicks (Audience Network, some Reels placements) | GA4 engagement rate by session source/medium and by landing page; Meta placement breakdown | Delay popup to 15 s or exit intent; check placements; match page |
| ATC fine, checkout started low | Shipping cost revealed in cart, cart upsell clutter, cart page bugs | begin_checkout / add_to_cart; cart drawer behaviour on a phone | Show shipping before cart; simplify drawer |
| Checkout started fine, purchases low | Shipping price or slow delivery, payment declines, discount not combining, tax surprise | purchase / begin_checkout; abandoned checkouts in Shopify; support tickets | Fix shipping rates and messaging; test discount combinations; add wallets |
| Store CVR down, every step flat | Traffic mix shifted to colder or lower-intent traffic | CVR by channel in GA4; new vs returning share in TW; Meta spend share to prospecting | Not a site problem; judge per channel |
| Store CVR down on one day | Theme publish, app update, checkout error, stockout, payment outage | Shopify orders by hour vs same weekday last 4 weeks; theme publish log | Roll back the theme; check stock on hero SKUs |
| Mobile CVR under 40% of desktop | Button below fold, popup covering, slow INP, sizing chart opens new page | GA4 device CVR; field INP mobile | Mobile first-screen fix; defer scripts |
| New-visitor CVR low, returning normal | Trust, offer clarity, price/value not landed | GA4 new vs returning CVR; TW new customer orders share | Proof above fold, reviews, guarantee, offer clarity |
| One angle's LP converts half of the PDP | LP too long, CTA late, LP sells a different promise | LP vs PDP CVR from the two-URL test, TW purchases per ad | Shorten, put CTA in first screen, re-align to angle |
| AOV fell while CVR rose | Discount, cheaper hero product, bundle picker removed | Shopify AOV and units per order; product mix | Judge on revenue or CM per session, not CVR |
| CVR jumps on a day with no change | Email or SMS send, influencer post, PR | Klaviyo campaign sends that day; GA4 email channel sessions | Not a site win; exclude from baselines |

Speed lookup:
- LCP bad: oversized hero image, hero is a carousel or video, render-blocking app scripts, web fonts. Check the LCP element in PageSpeed Insights.
- INP bad: heavy apps on tap (variant picker scripts, review widgets, upsell apps), third-party chat. Check long tasks in the Performance panel.
- CLS bad: images without width/height, banners injected at top (announcement bar apps), late-loading review stars.

---

## 5. How the site affects the other channels

- **Every paid channel**: CPA = CPC / CVR. A site CVR gain shows up at once in Meta CPA, Google CPA and TW MER. A gain that shows in only one channel is traffic, not site.
- **Meta delivery**: better post-click conversion feeds more purchase signals back, which improves Meta's predictions; expect Meta CPA to improve 1 to 2 weeks after a site fix as the system re-learns. The reverse is true: a broken checkout for 3 days damages the next week's delivery too.
- **Google**: Smart Bidding bids more at the same tROAS when CVR rises, so impression share and spend can rise on their own. Merchant Center price/availability mismatches stop Shopping ads when a sale or price test changes the page but not the feed.
- **Klaviyo**: popups and Shop Pay shift who is identifiable. A popup offering 10% off turns paid-social visitors into email subscribers whose later purchase Klaviyo claims (and TW may credit to email). Abandoned checkout flows only fire for identified shoppers; a checkout change that collects email later shrinks that flow.
- **Organic / SEO**: page speed and content changes on PDPs affect Search Console clicks and position over 2 to 8 weeks. Do not strip SEO copy from a PDP to make it "cleaner" without checking which queries land there (Search Console > Pages).

Before a site change, snapshot (14-day baseline):
- Shopify sessions, CVR, AOV, revenue per session, by device.
- GA4 CVR by default channel group and by top 5 landing pages.
- Meta: CPA, LPV/link click, CTR, TW last platform click ROAS for the brand.
- Google: CPA, conversion rate, Merchant Center disapprovals = 0.
- Klaviyo: flow revenue (abandoned cart/checkout, browse) and popup signup rate.
- TW: MER, new customer CAC, orders.

After the change (day 7 and day 14):
- Real site win: CVR up across 2+ channels and both devices, revenue per session up, MER up, Shopify orders up at flat spend.
- Credit shift, not growth: one channel's attributed revenue up while Shopify orders and MER are flat (often popup or post-purchase survey changes moving credit to email or organic).
- Mix shift: store CVR up only because spend moved to retargeting or email volume was higher.

---

## 6. What a great suggestion looks like

Numbers below are illustrative; the shape is the rule. Every suggestion names the source of its number and the window.

**Example 1: purchase tracking broke after the checkout upgrade**
- WHAT: Pause all budget and creative decisions for the brand; reinstall the GA4 purchase event through the Google & YouTube app (Customer events) and remove the old GTM tag from the theme.
- NUMBER: GA4 purchases were 6 to 9% under Shopify orders through Aug 25, then 71% under from Aug 27 (GA4 Monetization vs Shopify orders). Meta purchases steady, so only GA4 is broken.
- WHY: The purchase tag lived in Additional Scripts, which stopped running at the Aug 26 upgrade.
- WATCH: GA4 purchases back within 15% of Shopify orders within 48 hours of the fix; place one real test order and confirm in DebugView.
- HOW SURE: High. The gap started on the deadline date and Meta, which uses its own app pixel, did not move.

**Example 2: an angle needs its own landing page**
- WHAT: In the next test ad set, run the two best "lost ball marker" ads twice each: one to the PDP, one to a short LP whose first screen repeats the ad line and shows the belt clip close-up with the price and Add to cart.
- NUMBER: The angle's ads have 1.9% outbound CTR (Meta, 14 days, account median 1.1%) but 4.2% session ATC rate on the PDP (GA4 landing page report, 3,400 sessions) vs 7.8% store average. People click for the marker-on-the-belt promise and land on a page that leads with the belt fabric.
- WHY: Strong click, weak add to cart means the page, not the ad.
- WATCH: TW purchases and CPA per ad, plus ATC rate per URL, for 14 days or 2,000 sessions per URL, whichever is later. Keep the winner as the angle's page.
- HOW SURE: Medium. The pattern is clear, but the LP could underperform a PDP with 600 reviews; that is why it is a test, not a switch.

**Example 3: mobile speed is the cheapest win on the account**
- WHAT: Remove the two unused apps (old upsell, old reviews widget still loading), compress the PDP hero to under 200 KB and delay the popup to exit intent on mobile.
- NUMBER: Field mobile LCP 4.1 s and INP 340 ms on the PDP (Shopify Web performance, 28 days); LPV / link clicks 66% (Meta, 7 days, account was 81% in July); mobile CVR 0.9% vs desktop 2.6% (GA4 device, 30 days).
- WHY: One in three paid clicks never sees the page load, so every ad pays for clicks that cannot buy.
- WATCH: LPV/link clicks above 78% within 3 days (Meta updates immediately); field LCP under 2.5 s after 28 days; mobile CVR and Meta CPA over 14 days against the July baseline.
- HOW SURE: High on LPV recovering, medium on the size of the CVR gain (speed effect sizes vary).

---

## 7. Traps

- **"CVR fell, the site broke."** Most store-level CVR drops are traffic mix: more prospecting spend, a new placement, fewer email sends, a sale ending. Check CVR by channel and by new vs returning before blaming the site.
- **Judging Meta with GA4.** GA4 under-credits Meta by design. Site questions go to GA4; attribution questions go to Triple Whale.
- **Comparing Shopify CVR to GA4 CVR**, or this year's GA4 to last year's Universal Analytics. Different session rules, different numbers.
- **Calling a test early.** A 30% lift after 4 days on 40 purchases per arm is noise. Use the sample formula; wait 14 days.
- **CVR up, profit down.** Popups with 15% off, free-shipping-for-all, and bundle discounts raise CVR and can lower contribution margin per session. Judge on revenue or CM per session.
- **Benchmark worship.** A 1.1% CVR on $140 AOV golf clubs from cold traffic can be healthy; 2.5% on $25 patches can be weak. Compare to the brand's own baseline and its own traffic mix.
- **Lab score panic.** A PageSpeed mobile score of 35 does not matter if field LCP/INP/CLS pass. Fix field failures, not lab scores.
- **Popup credit theft.** A new popup moves revenue from "paid social" to "email" in Klaviyo and sometimes TW while total orders do not move. Check Shopify orders and MER, not channel revenue.
- **Post-purchase survey ("how did you hear about us") as attribution.** Useful for direction (podcast, creator, word of mouth), not for CPA math.
- **Fixing checkout on a non-Plus store.** Most checkout steps cannot be customised; the levers are shipping settings, wallets, discounts that combine correctly, and the cart.
- **Seasonal baselines.** Never compare November CVR to October; compare to last November with the same offer type, or to the 4 weeks before.
- **Dedicated LP for everything.** LPs multiply maintenance (offers, prices, stock) and break when the offer changes. Only build one per proven angle with enough spend to read it.

---

## 8. Sources

- Shopify BFCM 2025 and checkout context: https://www.shopify.com/news/bfcm-data-2025
- Shopify checkout claims (Shop Pay "up to 50%" vs guest checkout, Shopify-commissioned): https://www.shopify.com/partners/blog/shopify-best-checkout (claim not independently verified)
- Thank you / Order status upgrade and the Aug 26, 2026 non-Plus deadline: https://weltpixel.com/blogs/news/shopify-thank-you-page-tracking-the-august-26-2026-deadline and https://ecorpit.com/shopify-thank-you-order-status-upgrade-august-2026-migration/ (agency sources; Shopify Help Center text not fetched directly)
- GA4 purchase event failures after Checkout Extensibility: https://tryscaleup.org/resources/fix-ga4-purchase-event-not-firing-shopify and https://community.shopify.com/t/google-analytics-data-is-not-updating-for-shopify-checkout-page/379217
- Core Web Vitals definitions and thresholds: https://web.dev/articles/vitals (thresholds confirmed across sources; Google page not fetched in this session)
- CWV and ecommerce conversion (vendor data, directional only): https://accs-net.com/core-web-vitals-impact-on-conversion-rates-real-data/
- Shopify funnel benchmarks (Littledata, Dynamic Yield, Shogun figures compiled): https://blendcommerce.com/blogs/shopify/ecommerce-conversion-rate-benchmarks-2025 and https://www.nudgify.com/shopify-conversion-rate-benchmarks/
- Funnel step benchmarks for Shopify brands: https://videowise.com/conversion-optimization/sales-funnel-conversion-rate-benchmarks-for-shopify-brands
- Cart abandonment (Baymard figures via secondary sources; ~70%, extra costs the top reason): https://baymard.com/lists/cart-abandonment-rate (primary not fetched) and https://contentsquare.com/guides/cart-abandonment/stats/
- Meta landing page and Andromeda (no published LP score; post-click signals in ad quality): https://www.maker.co/meta-ad-landing-page and https://segwise.ai/blog/meta-andromeda-roas-drop
- Meta ad auction (bid, estimated action rate, ad quality): https://www.facebook.com/business/help/430291176997542 (not fetched in this session)
- Google Quality Score and landing page experience: https://support.google.com/google-ads/answer/6167118 (not fetched in this session)
- Sample size rule of thumb (16 x p(1-p)/delta²) is the standard two-proportion approximation at 80% power, alpha 0.05.

# Email and SMS (Klaviyo, Attentive, Postscript)

Scope: owned channels for the Mobius brands. Klaviyo on most brands (email + SMS), Attentive on Ice & Gold, Postscript possible on new clients. The Strategist sees Klaviyo flows, campaigns (opens, clicks, conversions, revenue), lists and segments; Locus shows Email revenue as Klaviyo placed orders split campaigns / flows. Read with `retention-ltv.md`.

## 1. How it works now (2025-2026)

### Mailbox rules (the floor, not best practice)
- Gmail and Yahoo bulk sender rules since Feb 1 2024; Microsoft consumer (outlook.com, hotmail.com, live.com) enforcing since May 5 2025.
- Gmail changed HOW it enforces in Nov 2025: non-compliant mail now gets permanent 5xx rejections instead of temporary 421 deferrals. A broken DNS record now loses the send, it does not just delay it.
- Bulk = 5,000+ messages a day to Gmail. Once a domain is treated as bulk it stays bulk. Every Mobius brand on BFCM days qualifies.
- Requirements: SPF and DKIM and DMARC (p=none is enough), From domain aligned with SPF or DKIM, valid PTR, TLS, RFC 8058 one-click unsubscribe header (List-Unsubscribe + List-Unsubscribe-Post) plus a visible unsubscribe link, unsubscribes honored within 2 days.
- Spam rate (Google Postmaster Tools, user-reported spam / delivered to inbox): hard ceiling 0.30%, Google's own guidance says stay under 0.10%. Over 0.30% for a sustained period = loss of mitigation, bulk foldering or rejection.
- Klaviyo sends from a shared or dedicated IP but the brand's own sending domain carries the reputation. A branded sending domain (send.brand.com) is mandatory, not optional.

### Apple Mail Privacy Protection (why opens lie)
- Apple Mail is about half of all tracked opens (Litmus, early and mid 2025). MPP pre-fetches images, so an open fires whether or not a human read it.
- Effect: open rate is inflated, open-based segments ("opened in 90 days") include people who never read anything, and open-based attribution credits email for orders it did not cause.
- Klaviyo cannot tell a human open from an MPP open. It labels them "Apple Privacy Opens" and offers "opened excluding Apple privacy opens" in segments and attribution.
- Rule: never judge a subject line, a send, or engagement on open rate alone. Use click rate, placed order rate, revenue per recipient (RPR), and on-site activity.

### Attribution inside the email tools
- Klaviyo default: email credited for orders within 5 days of an open OR click (accounts after Oct 9 2024: 5-day open, 5-day click; SMS click window 24 hours on older accounts, check Settings > Attribution). Options: opened or clicked, opened or clicked excluding Apple privacy opens, clicked only.
- Klaviyo last-touch counts an order even when a Meta or Google ad drove the visit. Klaviyo revenue + platform revenue routinely exceeds store revenue.
- Triple Whale credits email only on a CLICK carrying UTMs (lifetime click window in their docs). Missing UTMs push email sales into "(not set)" or direct.
- Attentive and Postscript report on their own windows; Postscript's own published numbers are on its own attribution and third parties say it over-counts. Never compare their dashboard revenue to Klaviyo's or to TW's without naming the source.

### Klaviyo billing (Feb 18 2025)
- Billed on ACTIVE profiles (every profile that can be marketed to), not on profiles emailed. Send cap is 10x active profiles per month.
- Unengaged profiles now cost money every month AND hurt deliverability. Suppression keeps the history and stops the billing; deletion loses the data. Suppress, never delete.

### What the 2026 Klaviyo benchmark says (183k+ accounts)
- Email campaigns: open 31% (top 10%: 45.1%), click 1.69% (top 10%: 3.38%).
- Email flows: open 32.2% (top 10%: 45.8%), click 5.58% (top 10%: 10.48%), placed order rate about 13x campaigns, RPR about 18x campaigns.
- Flows = 5.3% of email sends and about 41% of email revenue. Campaigns = 94.7% of sends.
- SMS flows: about 10% click (top above 16%), 7.6% of SMS sends, 45.2% of SMS revenue, 64.4% of SMS flow revenue from new buyers (vs about 20% for SMS campaigns).
- SMS campaign "good" range (Klaviyo, via ClickMinded, not verified on the live page): click 8.9 to 14.5%, placed order 1.0 to 2.0%, RPR $0.66 to $2.41, unsubscribe 0.6 to 1.4%.
- Klaviyo counts clicks with bot clicks excluded; older benchmarks did not, so do not compare a 2026 click rate to a 2023 one.

### SMS law (US, Oct 2026; not legal advice, platforms enforce most of it)
- TCPA: prior express written consent for marketing texts, keep the consent record (time, source, form copy).
- Opt-outs: STOP, QUIT, END, REVOKE, OPT OUT, CANCEL, UNSUBSCRIBE always work. Since Apr 11 2025 consumers may revoke "by any reasonable means" (a free-text "please stop" counts). Honor within 10 business days (FCC proposed 7).
- "Revoke all" (an opt-out from one message type ends all) delayed to Jan 31 2027. FCC order of Sep 30 2026 lets senders designate one exclusive opt-out method and narrows revoke-all to the category for informational messages; marketing opt-outs still end all marketing. Effective 30 days after Federal Register publication, not published as of early Oct 2026 (not verified since).
- Quiet hours: send 9am to 8pm recipient local time to be safe everywhere. FL, CT, MD, OK, WA: 8am to 8pm. Texas: 9am to 9pm Mon to Sat, noon to 9pm Sun. Oregon (HB 3865, from Jan 1 2026): no texts 8pm to 8am, max 3 solicitations per 24 hours except to people who bought in the last 18 months.
- Texas SB 140 (Sep 1 2025): texts are telephone solicitations with a private right of action. The Texas AG (late 2025) confirmed consent-based programs do not need to register; private plaintiffs can still sue, so documented opt-in is the defense.
- Carrier side: 10DLC or verified toll-free numbers; brand name in the first message; "Msg & data rates may apply", frequency and STOP language at opt-in. Postscript and Klaviyo hold quiet-hour sends automatically; Attentive check per account.

### Benchmark lookup (use the brand's own trailing 90 days first; these are the outside reference)
| Message | Click rate | Placed order rate | RPR | Source |
|---|---|---|---|---|
| Email campaign, average | 1.69% | about 0.1 to 0.2% | low, about 1/18 of flows | Klaviyo 2026; order rate via EightX (not verified) |
| Email campaign, top 10% | 3.38%+ | about 5x average | about 7x average | Klaviyo 2025/2026 |
| Email flow, average | 5.58% | about 13x campaigns | about 18x campaigns | Klaviyo 2026 |
| Email flow, top 10% | 10.48%+ | n/a | up to $7.79 | Klaviyo 2026 |
| Abandoned checkout/cart flow | 6 to 12% | 3 to 6% per recipient on E1 (practitioner, not verified) | avg $3.65, top 10% $28.89 | Klaviyo 2024 |
| Welcome flow | 5 to 10% | 2 to 5% across the series (practitioner, not verified) | avg $2.65 | Klaviyo 2024 |
| SMS campaign, good | 8.9 to 14.5% | 1.0 to 2.0% | $0.66 to $2.41 | Klaviyo via ClickMinded |
| SMS flow, average | about 10% | about 1.9% (Webtonic, not verified) | about 8x SMS campaigns | Klaviyo 2026 |
| SMS revenue per message (Postscript) | n/a | n/a | median $0.98, p75 $2.13, p90 $4.54 | Postscript 2026 blog |
| Postscript abandoned cart | n/a | 9.1% conversion | $8.11 per message | Postscript, own attribution |

- Category shifts: higher AOV (golf clubs, jewelry) = lower order rate, higher RPR. Consumables (patches, pet) = higher order rate, lower RPR, more flow revenue from replenishment.
- Compare like with like: a promo campaign to a BF early-access list is not graded against an everyday newsletter.

### How to read the Klaviyo data the Strategist has
- Per campaign: recipients, click rate, placed order rate, revenue (Klaviyo model), unsubscribes, spam complaints, bounces. Compute RPR = revenue / recipients and revenue per 1,000 sends. Flag any send where spam complaints / recipients is over 0.08% (Klaviyo-side proxy; Postmaster is the real number and is not in the feed).
- Per flow: compare each message's click and order rate to the previous message in the same flow. A message that converts under half the one before it is dead weight or a timing problem.
- Lists vs segments: lists are who opted in, segments are who to send to. A campaign sent to a LIST (not a segment) is a red flag for engaged-only sending.
- Group by recipient domain where possible (gmail.com vs yahoo/outlook). A Gmail-only drop in click rate is the earliest sign of filtering.
- Email share of store revenue: Klaviyo revenue / TW total revenue. Over 35% on a paid-led brand usually means open attribution overlap, not a great email program.

### Attentive (Ice & Gold) and Postscript specifics
- Attentive: two-tap mobile sign-up units (prefilled text), journeys = flows, strong on SMS volume. Its revenue is reported on Attentive's own attribution; read it for trend only and use TW click revenue for cross-channel calls.
- Postscript: Shopify-native SMS; holds sends in quiet hours automatically, removes Oregon numbers by area code from legacy campaigns (area code is a proxy, people move).
- Running Klaviyo email + a separate SMS tool: the two do not share suppression or smart-sending by default. Same-hour email + SMS of the same promo is the most common cause of SMS opt-outs. Stagger by 3+ hours and send the SMS only to people who did not click the email (not "did not open": opens lie).

## 2. The playbook

### Core flows (build order = revenue order)
| Flow | Trigger and timing | Content that works | Notes |
|---|---|---|---|
| Abandoned checkout | Started checkout, no order. E1 at 1h, E2 at 24h, E3 at 48 to 72h. SMS at 15 to 30 min if subscribed | E1 cart + one line of reassurance (shipping, returns, fit), E2 objection killer (reviews, guarantee), E3 the incentive only if margin allows | Highest RPR flow. Exclude anyone who ordered. Klaviyo 2024: abandoned cart RPR avg $3.65, top 10% $28.89 |
| Abandoned cart (added to cart) | Added to cart, no checkout. E1 2 to 4h, E2 24h | Product, reviews, no discount in E1 | Split from checkout; lower intent |
| Browse abandonment | Viewed product, no add to cart. E1 2 to 4h, E2 24 to 48h | The product, 2 alternatives, social proof | Engaged/known profiles only; cap 1 per 7 to 14 days |
| Site abandonment | Active on site, no product view. 1 email at 2 to 4h | Bestsellers, the brand promise | Smallest flow, cheap to keep |
| Welcome (email) | Signup. E1 instant (deliver the offer), E2 day 1 to 2, E3 day 3 to 4, E4 day 6 to 7, E5 day 10 to 14 | E1 code + bestseller, E2 brand story / why us, E3 social proof and UGC, E4 objection or how-to, E5 code expiry | Split purchasers out on every step. Klaviyo 2024 welcome RPR avg $2.65 |
| Welcome (SMS) | SMS opt-in. Instant, then day 1 and day 3 | Offer, then one bestseller, then expiry | Biggest SMS revenue source after cart |
| Post-purchase | Placed order. Day 0 thank you, delivery +2 days how-to / care, delivery +7 to 14 days review request | Use the product well, set the reorder clock, ask for the review | No promo in the first 7 days; it trains discount waiting |
| Second-order nudge | Days = brand's median days to 2nd order (Locus Customers) minus 3 to 5 | The most common second product after THIS first product | The single biggest LTV lever for low-repeat brands |
| Replenishment | Consumables (patches, pet): days of supply minus 5 to 7 | "Running low" + subscribe offer | Only where product empties on a clock |
| Back in stock / price drop | Subscribed to item / item price fell | The item, nothing else | Very high RPR, small volume |
| Winback | No order for 1.5 to 2x the brand's typical repeat interval. 3 emails over 2 to 3 weeks | What's new, then best seller, then the offer | Durable categories: long interval, gentle |
| Sunset | No click, no site visit, no order in 120 to 180 days (opens excluding Apple ignored) | "Still want these?" with one click to stay | Then suppress. Protects spam rate and the Klaviyo bill |
| VIP / birthday | Order count or spend tier; birthday date | Early access, not deeper discount | Only for brands with real repeat |

- Flow health targets: flows 35 to 50% of Klaviyo email revenue (Klaviyo average about 41%). Under 30% means flows are missing or broken. Over 60% means campaigns are under-sent or blocked.
- Every flow: smart sending on (16h email default), purchasers filtered on every step, UTMs on every link, a sender name people know.

### Segmentation and engaged-only sending
- Engaged definition (MPP-safe): clicked email OR active on site OR placed order OR subscribed in the window OR opened excluding Apple privacy opens. Never "opened" alone.
- Tiers: Engaged 30d (send anything), Engaged 90d (default campaign audience), Engaged 180d (big moments only, BFCM, launches), Unengaged 180d+ (sunset then suppress).
- Product segments: first product bought (drives the second-order nudge), category buyers, one-time vs repeat, VIP (top 10% by spend).
- Exclusions on every promo: bought in last 7 days, in an active checkout or welcome flow for the same offer, giveaway-only list (Dartee rule: giveaway leads stay on a separate list until they engage or buy).
- SMS: smaller, higher-intent list. Send fewer, to purchasers and recent clickers; never mirror every email as a text.

### Campaign cadence (DTC, engaged 90d unless stated)
- Normal weeks: 2 to 4 emails a week to Engaged 90d, 1 to 2 to Engaged 180d per month, 2 to 6 SMS a month.
- Add a send only while revenue per send holds and unsubscribes per send stay under 0.5%. If doubling sends grows revenue less than 40%, the extra sends are borrowing from the next week.
- Mix: at least 1 non-promo send (story, how-to, UGC, product education) for every 2 promos; brands that only send discounts teach the list to wait.
- Best day/time tests are low value. Test offer, subject angle, and segment before send time.

### List growth and pop-ups
- Klaviyo baseline submit rate 3% (Klaviyo strategist); good pop-ups 5 to 8%; exit-intent and two-step forms 10 to 13%. Klaviyo rates each pop-up Poor / Fair / Good / Excellent vs peers in-app; use that, not a blog number. Bot filtering changed Apr 1 2025: views dropped, submit rates rose, so do not compare across that date.
- Two-step form: email first, phone on step 2. SMS subscribe rate under 1% of visitors needs work, 1 to 3% is average.
- Show after 5 to 10 seconds or 30 to 50% scroll on mobile, exit intent on desktop. Suppress for existing subscribers and on checkout.
- Offer: 10 to 15% or a free gift for most brands; for premium or no-discount brands (Lucky holds price), a gift, early access, or giveaway entry. A giveaway list is cheap and cold: it needs its own nurture and its own CPL target.
- Paid lead gen math (Locus Scenarios): pay-up-to CPL = lead-to-buyer rate x AOV / target ROAS; breakeven CPL = rate x AOV x margin. Dartee giveaway example: $2 to $3 a lead, 10% buying at $80 = about 4x.

### BFCM email and SMS plan (BF 2026 = Fri Nov 27)
- Klaviyo BFCM 2025: 22.7B messages (+25% YoY), $3.8B Klaviyo-attributed revenue, CRM channels about 42% of BFCM GMV (Klaviyo recap via community post, not verified). Early-access email beat the open-to-all email by about 400% in one case study (Scuffers).
- 6 to 4 weeks out: grow the list (giveaway, Early Bird), sunset and suppress the dead, check Postmaster spam rate and DMARC. Do not add a never-mailed segment in November.
- 4 to 2 weeks out: warm Engaged 180d with 2 to 3 non-promo sends so the bigger audience has recent positive signals. Build the early-access list.
- Early access (Mobius brands: list first, e.g. Lucky and Dartee Tue to Wed Nov 24 to 25): 2 emails + 1 SMS a day to the early-access list only.
- BF to CM (Thu Nov 26 to Mon Nov 30): 2 to 3 emails a day to Engaged 90d, 1 to 2 a day to Engaged 180d, 1 SMS a day max to purchasers and clickers, the last-chance SMS on Monday. One offer all weekend, the same words everywhere (Nick's rule for Lucky).
- Flows during the window: welcome code must not undercut or stack with the BF offer (swap the E1 offer to the BF offer or pause the code); abandoned checkout E1 states the live offer and the end time; browse abandonment off for heavy-send days if spam rate climbs.
- After: shipping cutoff sends, gift cards, then pull back to normal cadence by Dec 3 to 5. New BF buyers go into post-purchase, not straight into more promos.
- Calibration from Lucky: list about 28k email + 1.8k SMS; email + SMS = $12.8k of the $72k BF 2025 weekend (about 18%).

## 3. Decision rules
- Spam rate (Postmaster): under 0.10% fine; 0.10 to 0.20% narrow the next 3 campaigns to Engaged 30 to 60d and check the last send's audience; over 0.20% stop sends to 90d+ until 7 clean days; over 0.30% emergency (Engaged 30d only, no SMS-to-email mirroring, audit list sources).
- Hard bounce over 1% on one send = a bad list source; find it before the next send. Unsubscribe per campaign: under 0.3% fine, 0.3 to 0.5% watch, over 0.5% the audience or frequency is wrong.
- Click rate floors for a DTC campaign to Engaged 90d: under 1% weak, 1.7% average, 3%+ top 10%. Flow emails under 3% click need a rewrite.
- Placed order rate per campaign: under 0.05% the send is mostly brand noise; 0.1 to 0.2% typical; over 0.3% strong (Klaviyo apparel avg about 0.17%, via EightX, not verified).
- Flow changes: one change per flow at a time, A/B split in-flow, 50/50, at least 1,000 recipients per arm or 2 to 4 weeks, judge on placed order rate and RPR, never open rate.
- Widening the audience (90d to 180d): one step at a time, watch spam rate and unsubscribes for 48 hours after each send; roll back on the first send over 0.2% spam or 0.5% unsubscribe.
- Discount in a flow: add only if the flow's conversion without it is below the brand's average and first-order margin can carry it; test as a holdout (10 to 20% of the flow gets no code) for 3 to 4 weeks.
- Incrementality: Klaviyo global holdout (Experiments, 3 months recommended) or a single-flow 10 to 20% random split as step one. Run one per quarter on the biggest flow. Without a holdout, every Klaviyo number is an upper bound.
- SMS: under 2% opt-out per campaign is the baseline; over 3% on two sends in a row = too frequent or untargeted, halve SMS campaigns for 4 weeks.
- Minimum data before calling a campaign test: 5,000 recipients per arm or 20+ orders per arm; otherwise read it as a direction, not a result.
- Email vs SMS for a message: SMS for time-bound and high-intent moments (checkout abandon, early access opens, last 6 hours, back in stock); email for everything that needs a picture or a story. If an SMS campaign's RPR is under 2x the same day's email RPR, it is not earning its higher cost and opt-out risk.
- SMS cost check: Klaviyo and Postscript bill per message (MMS about 3x SMS). SMS campaign revenue per message must beat cost per message by at least 10x to justify the opt-outs it spends.
- New flow vs fixing an old one: fix any flow whose RPR fell over 30% vs its own 90-day average before building a new one.

### Monthly email audit (run on the first Monday; flag only what fails)
1. Auth: SPF, DKIM, DMARC present and aligned on the sending domain; one-click unsubscribe header on campaigns.
2. Spam rate trend (Postmaster if connected; Klaviyo complaints per send otherwise).
3. Flow inventory vs the table in section 2: missing flows, flows with 0 recipients in 30 days (broken trigger).
4. Flow share of Klaviyo revenue (35 to 50% target).
5. Campaigns sent to lists or to 180d+ audiences outside big moments.
6. Engaged 90d size trend: shrinking for 3 months = list growth is not replacing decay; fix the pop-up or paid lead gen.
7. Unengaged 180d+ count and whether it is suppressed (billing).
8. Email share of store revenue under both Klaviyo and TW click attribution, side by side.
9. SMS opt-out rate per campaign and quiet-hour compliance on the SMS tool.
10. Welcome and checkout offers match the live site offer (stale codes are the most common cheap fix).

## 4. Diagnostics
| Symptom | Likely causes, in order | The number that confirms it | Fix |
|---|---|---|---|
| Email revenue down, sends steady | 1 Gmail placing in spam/promotions 2 offer fatigue 3 fewer flow triggers (less traffic) | 1 Gmail click rate vs Yahoo/Outlook click rate, Postmaster spam rate and domain reputation 2 campaign click rate trend on the same segment 3 flow recipients down with GA4 sessions down | 1 narrow to Engaged 30 to 60d, fix auth 2 non-promo sends, new angle 3 it is a traffic problem, look at paid |
| Open rate up, clicks flat | MPP share rising, not real engagement | Apple privacy opens share of opens | Ignore opens, judge on clicks |
| Click rate fine, placed order rate falls | Landing page, price, stock, or the offer | GA4 landing page conversion for email sessions; Shopify stock | Fix the page or the product link |
| Abandoned checkout RPR halves | Flow broken (trigger, filter), discount removed, site checkout issue | Flow recipients vs checkouts started in GA4; checkout completion rate | Re-check trigger and filters; test checkout |
| Spam rate jump after one send | New or old segment added, giveaway list mailed, too many sends | Spam rate by send in Postmaster (by day), the audience on that send | Remove that segment; sunset; slow down |
| Unsubscribes over 0.5% | Frequency or wrong segment | Unsubs per send by segment | Fewer sends to 90d+, more to 30d |
| Klaviyo revenue up while store revenue flat | Attribution overlap (open-based crediting of ad-driven orders) | Klaviyo attributed / TW total; TW email (click) revenue vs Klaviyo revenue | Switch view to clicked-only; report TW email |
| Welcome flow conversion low | Weak offer, slow E1, pop-up lists cold traffic or giveaway entrants | Welcome placed order rate by source form | Fix the offer, separate giveaway form |
| SMS revenue flat, list growing | Sending to the whole list, not segments | SMS RPR by segment, opt-out rate | Purchasers + clickers only |
| Flow share of revenue under 30% | Missing flows or campaigns over-sent | Flow revenue / Klaviyo revenue, list of live flows | Build the missing flows in table order |
| A flow shows 0 recipients for 7+ days | Trigger metric renamed or integration disconnected (Shopify, Attentive sync), flow set to manual/draft | Flow recipients by day; the trigger metric's last event date | Reconnect, re-point trigger, set live |
| New subscribers per day down 30%+ | Paid traffic down, pop-up broken or suppressed, offer expired | GA4 sessions; form views and submit rate in Klaviyo | Fix form or offer; if traffic, it is a paid question |
| Engaged 90d shrinking month over month | Growth not replacing decay; content not earning clicks | Engaged 90d count trend; new subs vs profiles aging out | More list growth, more non-promo sends worth clicking |
| Returning customer orders down (TW), email flat | Post-purchase and winback flows missing or mistimed | TW returning orders; post-purchase flow recipients and order rate | Time the second-order nudge to the median days to 2nd order |
| SMS opt-outs spike on promo days | Email and SMS of the same promo within the hour; too many SMS in a week | Opt-out rate by send; send times of both channels | Stagger, send SMS to non-clickers, cap SMS per week |
| Klaviyo revenue vs TW email revenue gap widening | UTMs dropped from templates; Apple open share rising | TW "(not set)" and direct revenue; UTM settings in Klaviyo | Re-enable UTM tracking; move to clicked-only for reporting |

## 5. How email and SMS affect the other channels
- Credit overlap is the default state. A Meta click Monday, an email open Tuesday, an order Wednesday: Meta (in TW last platform click) and Klaviyo (5-day open) both claim the order. In Locus, paid channels use TW last platform click and Email uses Klaviyo placed orders, so channel totals can exceed store revenue; "Everything else" is floored at 0 and hides the double count.
- Honest email number for cross-channel calls: TW's email click revenue, or Klaviyo set to clicked-only. Use Klaviyo's default number only for comparing flows to each other.
- Email lifts paid: a strong welcome and checkout flow raises the paid funnel's conversion rate, so Meta CPA improves when flows are fixed even though Meta did nothing. After a flow fix, expect blended MER and TW Meta ROAS to tick up 1 to 3 weeks later.
- Paid feeds email: Meta and Google traffic is where signups come from. Cut paid 30% and pop-up signups, cart flows and welcome revenue fall with a 1 to 4 week lag. Before blaming email for a decline, check GA4 sessions and new subscribers per day.
- Promo emails move Meta numbers: a big send day raises site conversion and Meta's view-through and click-through claims (returning buyers clicking a retargeting ad). A Meta ROAS spike on a campaign day is usually the email. Check the Klaviyo send calendar before crediting an ad.
- Real growth vs credit shifting: if email-attributed revenue rises and TW total revenue and new-customer revenue do not, email took credit. Real growth shows in store revenue, orders, and returning customer orders in TW at the same time.
- Before a change here, check: TW total revenue and returning orders (baseline 14 days), Meta frequency on retargeting, GA4 sessions from email. After: the same, 14 days later, and spam rate after every send.
- Excluding buyers: suppress recent purchasers from promos and add the Klaviyo purchaser list to Meta as an exclusion or existing-customer audience so paid does not pay to reach people email already reaches for free.

## 6. What a great suggestion looks like
Format: WHAT, NUMBER and its source, WHY in one line, WHAT TO WATCH and for how long, HOW SURE.

Example 1, flows missing:
- WHAT: Build a 3-email abandoned checkout flow (1h, 24h, 72h) with an SMS at 20 minutes, no discount until email 3.
- NUMBER: Klaviyo shows no live checkout flow; GA4 shows 1,240 checkouts started vs 410 orders last 30 days; Klaviyo 2024 average checkout RPR $3.65.
- WHY: 830 people a month reach checkout and hear nothing; this is the highest-yield message any brand sends.
- WATCH: flow placed order rate (target 3%+ on E1), store conversion rate in TW, 4 weeks. Holdout 10% of entrants to read real lift.
- HOW SURE: High that it adds revenue; medium on the size (Klaviyo will over-credit, read the holdout).

Example 2, deliverability:
- WHAT: Pull the next 3 campaigns back from Engaged 180d to Engaged 60d (clicked, on site or ordered; Apple opens excluded), then run the sunset flow on the 180d+ unengaged and suppress who does not click.
- NUMBER: Gmail click rate 0.6% vs 1.9% at Yahoo/Outlook on the last 5 sends (Klaviyo by domain); unsubscribes 0.7% per send; 41% of profiles have not clicked in 180 days.
- WHY: Gmail is filtering the brand, and the dead profiles cost money every month since the Feb 2025 billing change.
- WATCH: Gmail click rate back within 0.3 pts of the other domains, spam rate under 0.1%, 3 weeks; revenue per send should hold or rise even with 40% fewer recipients.
- HOW SURE: High; it is the standard recovery and costs little revenue.

Example 3, cross-channel credit:
- WHAT: Report email at TW click revenue in client reports and set Klaviyo attribution to "opened or clicked, excluding Apple privacy opens"; keep flow-vs-flow comparisons in Klaviyo.
- NUMBER: Klaviyo attributed $41k last month, TW email click revenue $17k, Meta TW last platform click $63k, store $98k (Klaviyo + Meta = 106% of the store).
- WHY: Two channels claiming the same orders makes both look better than they are and hides whether paid is working.
- WATCH: Locus channel bar sums to under 100% of store; MER unchanged (nothing real moved).
- HOW SURE: High; it is a measurement fix, no revenue risk.

## 7. Traps
- "Open rate is up, the subject lines are working." MPP opens. Use clicks.
- "Email drives 40% of revenue." Under 5-day open attribution it claims orders paid ads caused. Use TW click revenue or a holdout.
- "Abandoned cart made $20k, so it made $20k." Many of those buyers would have come back anyway. Holdouts on cart flows usually show real lift well under the attributed number (practitioner experience, not verified as a single figure).
- "More sends = more revenue." True for 2 to 4 weeks, then unsubscribes, spam rate and Gmail placement erode it. Read revenue per send and spam rate over 6 weeks.
- "The list is 80k." The mailable, engaged list is what counts. Lucky's reachable list was about 28k email.
- "Send the whole list on Black Friday." Profiles not engaged in 180 days are where spam complaints come from, on the week reputation matters most.
- "Email campaign revenue was up on the BF email, so the email worked." On BF everything converts; compare to the same-day revenue per recipient last year and to the non-recipient conversion rate.
- "Meta ROAS jumped Tuesday." Check the Tuesday send first.
- Klaviyo revenue includes tax and shipping depending on the integration; TW and Locus revenue is Shopify total sales minus tax. Do not mix them in one ratio.
- Comparing Attentive or Postscript revenue to Klaviyo: different windows, different crediting (some count view-style or longer windows). Compare a brand only to itself on one tool.
- SMS opt-out from one brand list does not opt out other lists in a different tool; migrations between tools must carry suppression lists or the brand texts people who said stop.
- Giveaway signups mailed with the main list drag spam rate and click rate down and make the main list look broken.
- "The welcome flow converts 8%." Often because the pop-up code is the only way to get the discount, so buyers who were already checking out sign up to get it. That is margin given away, not revenue made. Check what share of welcome orders came from sessions that already had a cart.
- "Benchmarks say our click rate is bad." Klaviyo's averages are from 183k accounts, mostly smaller and promo-heavy. A premium, low-frequency brand can have a lower click rate and a higher RPR. Judge on RPR and the brand's own trend.
- "We fixed deliverability, the open rate went back up." Opens are the wrong witness; Gmail click rate and inbox placement are the right ones.

## Sources
- Google, Email sender guidelines: https://support.google.com/a/answer/81126
- Gmail Nov 2025 enforcement shift to 550 rejections (vendor, not official): https://powerdmarc.com/gmail-enforcement-email-rejection/ and https://www.valimail.com/?p=11424
- Microsoft consumer enforcement May 5 2025 (vendor summary): https://redsift.com/guides/bulk-email-sender-requirements
- Klaviyo 2026 email benchmarks: https://www.klaviyo.com/products/email-marketing/benchmarks and https://www.klaviyo.com/uk/marketing-resources/email-benchmarks-by-industry
- Klaviyo 2026 SMS benchmarks: https://www.klaviyo.com/products/sms-marketing/benchmarks
- Klaviyo 2025 benchmark report: https://resources.klaviyo.com/2025-benchmark-report-us/p/1
- Klaviyo flow benchmarks (help center, by AOV band): https://help.klaviyo.com/hc/en-us/articles/360033669452-Performance-Benchmarks-for-Flows
- Klaviyo 2024 flow RPR figures (community summary): https://community.klaviyo.com/strategic-advice-27/klaviyo-s-benchmark-report-takeaways-and-use-cases-12028
- Klaviyo attribution settings: https://help.klaviyo.com/hc/en-us/articles/11118357030555 and https://www.klaviyo.com/blog/introducing-attribution-model-updates-to-reporting
- Klaviyo Apple privacy opens: https://help.klaviyo.com/hc/en-us/articles/4416803987739-How-to-Configure-Custom-Reports-to-Track-Apple-Mail-Privacy-Protection-iOS-15-Opens and https://community.klaviyo.com/analytics-72/apple-privacy-protection-mpp-cheat-sheet-6087
- Apple Mail share of opens 2025 (Litmus via Benchmark Email): https://www.benchmarkemail.com/blog/mail-privacy-protection
- Triple Whale vs Klaviyo revenue differences: https://triplewhale.readme.io/docs/why-is-my-klaviyo-or-emailsms-revenue-in-triple-whale-different-from-the-klaviyo-dashboard
- Klaviyo global holdout groups: https://www.klaviyo.com/blog/global-holdout-groups
- Klaviyo signup form analytics and benchmarks: https://help.klaviyo.com/hc/en-us/articles/360015960712 and https://community.klaviyo.com/sign-up-forms-38/sign-up-form-submit-rate-performance-14449
- Klaviyo active-profile billing Feb 2025 (third-party): https://www.inboxarmy.com/blog/klaviyo-pricing/ and https://academy.klaviyo.com/en-us/quick-guides/make-the-most-out-of-your-profiles
- Klaviyo BFCM 2025 recap (community post, not verified against the report): https://community.klaviyo.com/product-updates-announcements-51/what-did-you-learn-from-bfcm-2025-share-your-biggest-win-or-surprise-18665
- Scuffers early access case: https://www.klaviyo.com/uk/customers/case-studies/scuffers
- SMS campaign ranges (ClickMinded summary of Klaviyo): https://www.clickminded.com/sms-marketing-benchmarks/
- SMS medians (Webtonic citing Klaviyo, not verified): https://www.webtonic.io/blog/e-commerce-sms-marketing-statistics
- Postscript revenue per message benchmarks (2026): https://draft.postscript.io/blog/sms-marketing-benchmarks-what-good-performance-looks-like-in-2026
- SMS opt-out baseline: https://iterable.com/blog/key-to-successful-sms-sending/ and https://www.attentive.com/blog/sms-opt-out-prevention-tips
- Postscript benchmarks and compliance: https://postscript.io/make-more-sales, https://postscript.io/the-ultimate-sms-compliance-guide, https://postscript.io/blog/oregon-house-bill-3865
- FCC revoke-all delay to Jan 31 2027: https://www.burr.com/telephone-consumer-protection-act/the-fcc-delays-effective-date-of-tcpa-revoke-all-rule-until-january-31-2027
- FCC Sep 30 2026 order: https://www.manatt.com/insights/newsletters/client-alert/fcc-replaces-revoke-all-rule-and-permits-callers-to-designate-an-exclusive-revocation-method and https://www.gtlaw.com/ar/insights/2026/9/fcc-moves-to-rewrite-tcpa-consent-and-opt-out-framework
- Texas SB 140 and the AG clarification: https://www.klaviyo.com/blog/texas-sms-registration and https://datamatters.sidley.com/2025/12/03/texting-in-texas-texas-ag-settlement-clarifies-no-registration-needed-for-consent-based-text-messaging/
- EightX per-vertical campaign figures (partly synthesized by the author, not verified): https://eightx.co/blog/average-ecommerce-email-revenue-share-by-vertical-2026

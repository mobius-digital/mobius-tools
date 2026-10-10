# Post-purchase survey: "how did you hear about us" as a check on attribution

Scope: what a post-purchase survey (Fairing, KnoCommerce) can and cannot tell a DTC brand, how Locus lines its answers up against Triple Whale for the same orders, what the gaps usually mean, and when the survey should change a budget call. Read with `measurement-budget.md` (attribution models, incrementality) and `cross-channel.md` (how channels feed each other).

The rule behind this file: **Triple Whale lastPlatformClick is the attribution on every Locus surface. The survey is a reality check on it, never a replacement.** Clicks are precise and blind to anything without a click; recall sees the channel that made someone curious and forgets the click that closed. Each catches the other's blind spot.

---

## 1. How it works now (Locus, October 2026)

- **Where the data comes from.** A one-question survey on the order confirmation page (Fairing or KnoCommerce, both Shopify apps). Typical response rate is 30 to 60% of orders; most brands ask "How did you hear about us?" with 8 to 12 fixed answers plus "Other (type it)".
- **Connection.** Per brand, Brand settings > Integrations > Post-purchase survey: the Fairing secret token (Fairing > Account > API credentials), or KnoCommerce `client_id:client_secret` (Kno > Settings > API Access, Responses permission). Locus pulls 90 days the first time, then what is new at most every 6 hours, into `survey_responses` (no emails kept).
- **Which question.** Locus picks the question whose answers map to channels most often (with 5+ answers in the window). If the survey asks several (for example "what made you buy today"), another can be pinned on the card.
- **Channels.** Every answer is mapped to one of seven: Facebook / Instagram, TikTok, Google / YouTube, podcast, friend / word of mouth, influencer / creator, other. "Other (type it)" answers are mapped from the typed text. The raw top answers sit beside the mapping so a wrong mapping is visible.
- **The join.** Each answer carries the Shopify order id; Locus matches it to `tw_orders` (Triple Whale journeys, last platform click per order). For matched orders it shows: what the customer said, what Triple Whale credited (Meta = Facebook / Instagram, Google covers YouTube, organic = no ad click, email / SMS / other clicks listed apart), and both.
- **Agreement** = share of matched orders where the two name the same channel. **Agreement on paid** = the same, over orders Triple Whale credits to Meta, TikTok or Google. Where it shows: Store > Customers card "How customers say they found you", and the Strategist's `survey` view.

## 2. Decision rules

- **Minimum data.** Under 30 matched orders in the window: describe, do not conclude. Under 100: direction only, no ratios in a budget call. Widen the window before quoting a share.
- **Agreement bands (matched orders, paid only).** 60%+ = clicks and memory broadly agree; trust Triple Whale's channel split as is. 35 to 60% = normal for a brand with real upper-funnel spend; read the per-channel gaps. Under 35% = something structural: tracking broke, the question is badly worded, or a channel is doing the introducing and another the closing.
- **Survey share above Triple Whale share by 10+ points** for a channel (on 100+ matched orders) = that channel introduces more buyers than it closes. Typical for TikTok, YouTube, podcasts, creators, and Meta video reach. Do not cut it on last-click CPA alone; test it (spend step or holdout, `measurement-budget.md`).
- **Survey share below Triple Whale share by 10+ points** = the channel closes buyers someone else introduced. Typical for Google brand search, retargeting and email. Its CPA is flattered; it is the first place to trim when spend must come down, after a check that branded search volume holds.
- **"Friend / word of mouth" over 25%** of answers = the product sells itself; referral program, reviews and UGC deserve budget before more prospecting. Under 5% on a brand older than two years = weak advocacy; check reviews and the post-purchase experience.
- **No ad click in Triple Whale, but the customer names a paid channel**: count these. When they are 20%+ of matched orders, the paid channel's true contribution is above its last-click number; say "Triple Whale credits X; customers name it on Y more orders".
- **Never** compute a CPA or ROAS from survey counts. Never move more than one budget step on survey evidence alone.

## 3. Diagnostics

| What you see | Likely cause | Check | Fix |
|---|---|---|---|
| Match rate under 50% (answers with no Triple Whale order) | Triple Whale order history not yet backfilled for the window, or orders outside Shopify | `tw_orders` coverage (customers view `history`), Triple Whale data health | Wait for the backfill; compare a window fully inside the stored history |
| Response rate dropped by half | Survey moved, removed from Shop Pay / one-page checkout thank-you page, or app off | Answers per day vs orders per day | Client re-enables the survey on the order status page |
| "Other" over 20% | Answer list missing a real channel, or typed answers Locus cannot map | The top answers list | Add the missing answer in Fairing / Kno; the map follows the typed words |
| Facebook / Instagram huge, Meta credited small | Organic social and creators counted as "Instagram" | Ask whether the brand posts organically or seeds creators | Add separate answers: "Instagram ad", "Instagram post / creator" |
| Agreement fell suddenly | Tracking break (pixel, UTM), or the question changed | Triple Whale data health, the pinned question's text | Fix tracking first; never read a survey shift during a tracking break |
| Google over-credited vs survey | Branded search closing demand others made | Branded vs non-branded spend (google_ads view) | Lower brand bids in a step; watch total orders, not Google ROAS |

## 4. How the survey affects the other channels

- **Meta.** The survey separates "saw an ad" from "clicked an ad". A high survey share with average click credit argues for keeping reach and video budgets that a last-click read would cut.
- **TikTok and YouTube.** These are the most under-credited by clicks (people watch, then search or type the URL). A survey is the cheapest evidence for them before a lift test.
- **Google.** Brand search and Shopping often close what others started; a survey share well under click share is the sign. Cutting them hurts less than the click data says, but check branded search volume.
- **Email and SMS.** Almost never named in the survey (people do not "hear about" a brand from its own email). Their Triple Whale credit is closing credit; judge them on flow revenue, not the survey.
- **Creators and podcasts.** Usually invisible to clicks unless they use a code or link. The survey is often the only proof a creator program works; pair it with code redemptions.

## 5. What a great suggestion looks like (illustrative numbers)

- "Over the last 60 days 412 orders have a survey answer and a Triple Whale order. Customers and Triple Whale agree on 48%. TikTok: 14% of customers name it, Triple Whale credits it 4%. Before cutting TikTok on its $140 last-click CPA, run a two-week spend step (half the budget) and read total new-customer orders, not TikTok's own CPA."
- "Google: Triple Whale credits 22% of matched orders, only 7% of customers say they found the brand on Google. Most of that is branded search closing demand Meta made. Trim brand bids 20% for two weeks and watch total orders and branded impressions."
- "31% say a friend told them. That is the strongest channel nobody pays for: a referral offer in the post-purchase flow (give $15, get $15) is the next test, before a new prospecting campaign."
- "Only 18 matched orders this month: too few to say anything about the split. Widen to 90 days or wait."

## 6. Traps

- **Treating the survey as attribution.** It is recall: people name the most memorable touch, the most recent, or the one they think you want. Use it for direction and gaps, never for CPA math or as the number on a report.
- **Small samples.** A 10-point gap on 40 orders is noise. Quote the matched count every time.
- **Answer list bias.** The first answers listed get picked more; "Facebook" absorbs Instagram and organic posts; a missing option sends people to "Other" or to the nearest wrong answer. Read the raw answers before the channel shares.
- **Survivor bias.** Only buyers answer, and only those who reach the thank-you page with the survey on it. It says nothing about who saw an ad and did not buy.
- **Repeat customers.** A returning customer's "how did you hear" is about years ago. For channel calls, prefer first orders (Fairing marks `customer_order_count`; Locus does not split it yet, so say so when repeat share is high).
- **Comparing different windows.** Survey date is when the answer was given; Triple Whale's is the order day. Locus matches by order id, so the join is right; window totals can still differ by a day at the edges.
- **Overriding Triple Whale on a screen.** Never put a survey number where a Triple Whale number belongs. The card says "what customers say" next to "what Triple Whale credited", always both.

## 7. Sources

- Fairing API: docs.fairing.co, "List all responses" (GET app.fairing.co/api/responses, Authorization header with the secret token, inserted_at_min / inserted_at_max, limit up to 1000, cursor starting_after, next / prev links) and "The response object" (question, response, other_response, order_id, customer_id, customer_order_count, inserted_at, UTM fields); rate limit 100 requests a minute per store.
- KnoCommerce REST API v1.3.0 OpenAPI spec (developers.knocommerce.com): OAuth2 client credentials at api.knocommerce.com/api/oauth2/token, GET app-api.knocommerce.com/api/rest/responses with maxPageSize up to 250, pageToken cursor, updatedAt / completedAt filters, expand=order.
- Mobius practice: Triple Whale lastPlatformClick is the attribution everywhere (Cole's rule); the survey sits beside it as a check, the same way Meta-reported numbers sit beside it on the Meta tab.
- General DTC measurement practice on "how did you hear about us" (HDYHAU) surveys: response rates, recall bias, answer-order bias, and using survey vs click gaps to pick channels for incrementality tests.

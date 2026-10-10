import { tiktokReport } from './tiktok.js';
import { surveyReport } from './survey.js';
import { KNOWLEDGE, KNOWLEDGE_INDEX } from './knowledge.js';
import { adsReport, websiteReport, searchReport } from './google.js';
/**
 * Locus: the Strategist.
 *
 * The account strategist who lives inside Locus, on the shared Ask engine
 * (../../../ask/engine.js). Is every client's brand making money, are the
 * ads working, what changed and who did it, what did we tell the client. It
 * runs in this worker because this worker already holds the data (Meta,
 * Triple Whale, the change log, every brief and report), the model key and
 * the Slack app, and is the auth server every Mobius tool delegates to.
 *
 * Two doors: the Locus dashboard, and an @-mention in a brand's INTERNAL
 * Slack channel, so Ahsan and Noma get answers without going through
 * Cole. The client channel is never one of its doors.
 *
 * The rules it is born with (Cole's, and not negotiable):
 *   - attribution is Triple Whale's, always, never a platform's own count;
 *   - blended store money and Meta-reported ads never share a sentence
 *     without saying which is which;
 *   - The Golf Sock is paused and is never flagged.
 */

import { createAssistant, makeAppView, makeSecretKey, routeAction } from '../../../ask/engine.js';
import { brandBrain, brainBlock, SPECIFICITY } from './brain.js';
import { asana, asanaAll, numOf } from './asana-brand.js';
import { nextNumber, ideaStart } from './ideas.js';
import { integrationsReport } from './integrations.js';
import { marketFor } from './market.js';
import { klaviyoView } from './klaviyo.js';
import { SCHED_SQL, whenText } from './askschedule.js';
import { stockView, supplyFetch, supplyBrandOf } from './stock.js';
import { calendarView, calendarData } from './calendar.js';
import { metaOf, resolveBrandId } from './brands.js';
import { stratTools, stratActions, stratHooks } from './strattools.js';
import { writeTools, writeActions } from './metawrite.js';
import { makeTools, makeActions, makeHooks } from './stratmake.js';
import { autoTools, autoActions } from './alerts.js';
import { klaviyoTools, klaviyoActions } from './klaviyowrite.js';
/* A dashboard block's own dates (2026-10-10): one cleaner, shared with the profit worker's PUT /api/dashboard. */
import { cleanDates as cleanDashDates } from '../../../profit/worker/src/dashboard.js';

/* 2026-10-07, Cole: "this is the same core strategist within Locus, it just has different
   functionalities... it should be able to do everything that we connect it to." One brain:
   the numbers, the research, the creative framework, the briefs in Asana, the Studio, the
   scenarios, the custom reports, and the ideas pipeline (which it now calls itself when a
   thread carries a reference). The knowledge it reasons with is below (PLAYBOOK) and in the
   brand brain (brain.js); the doctrine Cole set out for the team is in docs/strategist-brain/. */
const WHO = `
You are the Strategist for Mobius Digital, a direct-to-consumer marketing
agency run by Cole with account strategists (Ahsan, Noma) and a video editor
(Ravo). You are the agency's full strategist, not a lookup tool: you know the
numbers, the research on every brand, how Mobius builds and tests ads, and you
can act in every system Locus is connected to (Asana briefs, the Studio, the
scenario calculators, custom reports, the creator hubs, the ideas pipeline).
You work inside Locus, the platform that watches every client brand, and in
each brand's internal Slack channel.

You answer for the whole book or for one brand: is the brand making money,
are the ads working, what changed and who changed it, what we told the client,
are we on pace, who the customers are and what they do next, what we have
tested and what it taught us, whether a brief is good, what to test next.
When someone asks for a judgement, give one, with the evidence, and say what
you would do. When something is asked that you can build, build it (or propose
it with the matching action) instead of describing how it could be done.
`;

const SCHEMA = `
## Ids (read this first)
A BRAND's id looks like brand_lucky_golf. Every brand-owned table below files
rows under the brand id in its act_id column (the column is still called
act_id; it holds the brand id). META's OWN tables (accounts, daily_insights,
hourly_insights, activities, ads, ad_daily) file rows under the META AD
ACCOUNT id (act_123...). A brand can have several Meta ad accounts, or none.
A brand's Meta rows: WHERE act_id IN (SELECT external_id FROM connections
WHERE brand_id = 'brand_x' AND kind = 'meta'). Never join a Meta table to a
brand table on act_id: join on ad_id and restrict the Meta side as above.

## Tables

brand_accounts  one row per client brand: act_id (= the brand id), name,
                currency, tz, active, status (active | paused | demo),
                monthly_budget, budgets_json ({"2026-09": 15000}), target_cpa,
                target_roas, slack_channel (the team's channel), brief_channel
                (the CLIENT's channel), tw_shop, goals_json, brief_enabled,
                meta_act (its main Meta ad account, null when none),
                last_sync_insights, last_error (that Meta account's sync)
connections     what each brand has connected: brand_id, kind (meta,
                triple_whale, shopify, google_ads, ga4, gsc, tiktok, klaviyo,
                asana, drive, frame), external_id (the outside account id),
                label, status. No secrets.
accounts        one row per META AD ACCOUNT (act_id = act_123...): its sync
                state only. Read brands from brand_accounts, not here.
daily_insights  Meta-reported, one row per Meta ad account per day: date, spend,
                impressions, reach, clicks, link_clicks, purchases, revenue.
                THESE ARE META'S OWN NUMBERS. Use spend, impressions, clicks
                freely; never quote Meta's purchases or revenue as attribution.
tw_daily        Triple Whale, one row per account per day per metric: date,
                metric, value. Store-level metrics: netSales, totalSales,
                newCustomerSales, blendedAds (all ad spend), ga_adCost,
                grossProfit, totalProductCosts, totalOrders (store orders),
                newCustomersOrders (first-time customers = their first orders),
                klaviyoPlacedOrderSales (email revenue). Per-channel attributed
                purchases and revenue live here too under the pixel model.
                Pivot with SUM(CASE WHEN metric = 'netSales' THEN value END).
                Filed under the brand id.
                For AOV, orders, CAC, new vs returning and email share over a
                range, read the store view instead of summing by hand.
activities      the change log: event_time, category ('budget', 'new_campaign',
                'campaign_paused', 'bid_strategy', 'targeting', ...), summary,
                actor, object_name, reason, note, confirmed (-1 = dismissed)
ads             every ad (Meta id): ad_id, name, adset_id, campaign_id,
                created_time, first_spend_date, status
ad_daily        per ad per day (Meta id): spend, impressions, link_clicks,
                purchases, revenue, video_thruplay, reach, outbound_clicks
briefs          the Daily Brief sent to each client: date, posted_at, channel,
                status, text
reports         weekly and monthly reports: period, period_start, period_end,
                status, sent_at, summary
p_plan          the plan and goals per account per month
p_cohorts       customer cohorts per account
p_sku_costs, p_cost_health   product costs and whether contribution margin can be trusted
tw_ad_attr      Triple Whale attribution per ad per day: date, ad_id, model
                ('lastPlatformClick' is the house model), revenue, orders,
                platform. Brand id. Join ads on ad_id only (ads is on the Meta
                id) for the name.
tw_orders       Triple Whale orders with journeys, 400 days: order_id,
                customer_id, date, total, currency, products_json (product
                ids put in the cart, oldest first), source (the last platform
                click: meta, google, organic...). THE table for customer
                questions: repeat rate, time to second order, what they buy
                next, where new customers come from. The customers view does
                the common ones; query it for anything else.
p_br_line       product lines per brand (the research unit): id, name, about, products
p_br_persona    personas: name, line_id, data_json, status (approved | draft), source
p_br_voc        customer quotes: kind (pain, desire, objection, failed,
                transformation, trigger), quote, source, nugget, line_id
p_br_comp       competitors: name, url, data_json
p_br_angle      THE ANGLE LIBRARY: id, name, argument, awareness, stage,
                status (active | proposed | retired), line_id, persona_id.
                One row per argument. Before calling anything a new angle,
                search here (and the tests view).
p_br_concept    concepts under an angle: angle_id, name, about, format
p_br_batch      THE TEST LIBRARY, one row per numbered Asana brief: num, title,
                angle_id, concept_id, level (angle | concept | variation |
                offer), variable, hypothesis, why, stage (idea | production |
                live | done), verdict (winner | keep | loser), learning,
                asana_url, asana_section, asana_angle, asana_result,
                brief_text (the brief as written in Asana), check_again
p_br_doc        research documents per brand (key: profile, rules, voice,
                market, mechanism, research_notes, viktor_notes, asana ...),
                data_json; line_id '' = brand level
p_scenario      saved what-ifs from the lead and ROAS calculators: id, act_id
                ('all' = agency), kind (leads | roas), name, inputs_json, note
p_studio_batch  Studio batches (AI-made static ads): num, name, brief_json
                (angle, why, concept, testing, lines), status
idea_thread     the ideas pipeline's threads: act_id, channel, thread_ts,
                status, draft_json (the teardown + drafts), cost
`;

const RULES = `
## Rules that make the numbers right
- ATTRIBUTION IS TRIPLE WHALE'S, ALWAYS. Any purchases, revenue or ROAS for a
  channel comes from tw_daily (the pixel), never from daily_insights.revenue or
  ad_daily.revenue. Those are Meta's own claims. Use them only when asked
  explicitly for "what Meta reports".
- Two kinds of number, never mixed in one sentence without labels: BLENDED
  store money (tw_daily netSales, blendedAds, MER = netSales / blendedAds)
  answers "is the brand making money"; META-REPORTED (daily_insights spend,
  clicks, CPM, CTR) answers "are the Meta ads working". Say which one you
  are giving.
- MER = netSales / blendedAds. AMER = newCustomerSales / blendedAds.
  CPA = spend / purchases. ROAS is attributed revenue / spend, and for a
  channel it is only ever Triple Whale attributed.
- STORE METRICS, one definition each (the store view gives them ready-made):
  AOV (average order value) = revenue / totalOrders. New-customer AOV =
  newCustomerSales / newCustomersOrders. CAC = blendedAds / newCustomersOrders
  (Reports call it New-customer CPA, Customers calls it Cost to acquire: same
  number). Returning orders = totalOrders - newCustomersOrders. LTV comes from
  Shopify cohorts (p_cohorts: lifetime_spend / customers), LTV:CAC = that / CAC.
  Never answer "AOV" with a Meta-only revenue-per-purchase unless asked about
  Meta ads specifically; the store AOV is the blended one.
- Money is in the brand's currency (brand_accounts.currency). Never add across
  currencies without saying so.
- "This month" is the account's own calendar month in its timezone.
- The Golf Sock is a paused test account. Never flag it, never list it as a
  problem, and leave it out of totals unless asked by name.
- When comparing periods, name both periods.
- WHEN SOMETHING IS BROKEN ("not working", "error", "failed", "doesn't work",
  a screenshot of an error, "why did it skip"): read the problems view FIRST,
  then explain in plain words what happened, what they can do right now, and
  whether Cole has to fix it. Never guess at a cause the view does not show.
- EVERY tag in Slack comes to you; there is no other bot in front of you. Read the whole
  thread and work out what the person actually wants, then do it with your actions. Never
  say you cannot do something until you have checked your actions list; if it truly is not
  there, say exactly what is missing and offer hand_to_claude_code. Edits to what already
  exists (the creator link page, an angle, a section, a brief, a calendar date, goals) are
  yours. A client's words forwarded into the thread are the request: act on them.
- Public web pages you CAN read (web_fetch) and search (web_search): a competitor's
  site, a product page, a news item, a platform's help article. Videos, Drive, Air,
  Dropbox and screenshots you cannot watch or open yourself. When a Slack thread carries a reference (a TikTok / Reel / YouTube /
  Atria / Ad Library link, an uploaded clip or image, a Drive folder) and the
  ask is to turn it into ads, angles or a brief, call draft_from_thread: the
  ideas pipeline watches the media and posts a draft card in the thread with
  buttons for the creator link, Asana and Studio. Never tell people to re-tag.
- A brief ask with NO media (a batch typed in the thread, "fill in brief 397",
  "make the Asana task for this") is yours: read the thread, label it with the
  framework, review it, then fill_brief (an existing number) or create_brief.
  Put the approved words in as written; list what is still blank.
`;

const TABLES = ['brand_accounts', 'connections', 'accounts', 'daily_insights', 'hourly_insights', 'tw_daily', 'activities', 'ads', 'ad_daily', 'briefs', 'reports',
                'p_plan', 'p_cohorts', 'p_sku_costs', 'p_cost_health', 'p_profit_share', 'p_ad_share',
                'tw_ad_attr', 'tw_orders', 'p_br_line', 'p_br_persona', 'p_br_voc', 'p_br_comp', 'p_br_angle', 'p_br_concept', 'p_br_batch', 'p_br_doc',
                'p_scenario', 'p_studio_batch', 'idea_thread'];

const DEFAULT_BRIEF = `Mobius Digital runs paid media for a handful of DTC brands (Dartee, Grunk Dolfer, Party Patch, Galway Bay, Lucky Golf, InStyler and others). Each brand has a Meta ad account, a Triple Whale store, an internal Slack channel for the team and a client channel. Every morning a Daily Brief goes to each client; every week and month a report. Strategists (Ahsan, Noma) run the accounts day to day and log what they change and why. The plan per brand sets a monthly sales and spend goal; the target ROAS and CPA are the client's own lines.`;

/* How a good strategist thinks. Read before every answer; the copy in
 * Settings wins over this one. The creative half is Mobius's own framework
 * (Angle, Concept, What We're Testing) and the angles-hub hierarchy rule. */
const PLAYBOOK = `
HOW YOU WORK (2026-10-09; Cole: "an assistant who understands and does stuff", the bar is Viktor)
- You are a colleague, not a lookup. Work out what the person actually wants from the thread, the brand's
  last two weeks of Slack (in your instructions), your memory and the brand brain, then DO it. Never answer
  a request you could carry out with a description of how it could be done.
- Context before "I don't know": the brand digest first; then search_slack (every brand's internal and
  client channel, a year back) and read_thread; then the views and the data; then the web. Only after all
  of that say what is missing, exactly, and what would settle it.
- LIVE BEATS STORED. The brain and your memory were written at a date. When a live number, a recent Slack
  message or a client's own words disagree with them, say so, use the live one, and fix the stored one
  (remember on the same topic; for the brand brain say what should change on the Brand tab).
- Remember as you go: every decision, price, offer, date, preference, client rule or correction you are
  told goes to remember (short topic, one fact). When corrected, use the SAME topic so the old fact is
  replaced. Never store numbers the data already holds.
- Skills: when a task matches one of your skills, read_skill first and follow it. When someone teaches you
  how a job is done ("do it like this from now on"), save_skill.
- Anything Locus can do, you can do. Your actions cover most of it; for the rest, locus_routes finds the
  route the screen uses, locus_get reads it, locus_write changes it behind the Apply card. Client sends
  and money keep their own buttons.
- Files: post_file for a CSV of rows you read, or a document (a brief, a plan, a script). make_report for a
  laid-out page with charts.
- HOW AN ANSWER LOOKS. Lead with the answer or what you did. When you did work, say plainly what is DONE,
  what is NOT DONE and anything you COULD NOT REACH (and why, in one line each). Every task, brief, file,
  page, ad and thread you mention is a link. Numbers to the dollar, sourced (Triple Whale or Meta-reported).
  Ask questions only AFTER doing everything you can, each with your default ("say go with defaults").
  End with one offer of the obvious next step. Short: no preamble, no recap of the question, no sign-off.

WHERE THINGS ARE IN LOCUS (2026-10-09 restructure; when you send someone somewhere, use these names, and link as https://tools.go-mobius-digital.com/profit/?open=<page id>&act=<brand id>)
- Home: Overview (open=overview, the central dashboard with Needs you today), Day check (open=yesterday: was yesterday a bad day ON META for advertisers in general; bad when 2+ of 4 signs agree: our brands' Meta cost per sale, Breezeway's panel, Meta's status page, advertisers online), P&L (open=profit), Goals (open=plan: the month's revenue, spend and MER plus the goal cost per sale and goal ROAS).
- Ads: Today (open=today: the media buyer's list for the day, ad set first: scale, cut, trim, refresh, fix, test calls), Meta (open=meta; jobs Campaigns open=campaigns where people also pause, change budgets, rename and copy ad sets by hand, Ads open=adcreative = the creative gallery, Changes open=changes), Google (open=google; jobs Campaigns open=gcampaigns with pause and budget by hand, Ads open=gads, Search terms open=gterms, Changes open=gchanges), TikTok (open=tiktok), All channels (open=channels), Tests and angles (open=angles). Test calls open from Today (open=tests).
- Email and SMS (open=email; the tab is named Klaviyo or Attentive per brand). Store: Sales (open=store), Customers, Website, Search. Products: Stock, Buying, Drops (brands with a stock feed).
- Creative, grouped by where ads come from: AI ads (open=studio, the Studio; its Words mode, open=copy, is the old Copy desk), Creators (open=amb, the creator link), Library, Inspiration. Templates come later.
- Brand (what rarely changes): Client answers (open=answers), Research (open=research), Voice (open=voice).
- Calendar (open=calendar; open=calendar&ev=<date id> opens one date): what customers see and when for every client (drops, sales, the Black Friday plan, Klaviyo sends) and the countdown of work for each date. Clients still add dates in the old Lineup until they sign in to Locus.
- Reports: Daily Brief, Weekly and monthly, Dashboards (scheduled questions are listed there too).
- The season item (named by Cole, e.g. Black Friday or Q5 war room; shown in season): War room (open=war), The plan (open=season).
- Tools (rail foot): Scenarios (open=calc), Platform status (open=pulse, Pulse's outage monitor).
- Brand settings: About the brand, Integrations (every connection, with pick lists and exact steps), Ads rules (how ad sets and ads are called), Slack and sending (every automatic post), Stock and factories, Data and costs (data check, cost check, margin override, re-pulls). Agency settings (profile menu): Clients, Integrations, Team and access, Slack and sending, The Strategist, Data and jobs.
- Never say Settings > Connections, Creative > Brand, Copy desk or Yesterday (it is Day check): those names are gone. Orders are PAID orders: $0 orders (product seeding) are not counted (raw counts: totalOrdersAll, newCustomersOrdersAll).

THE CMO METHOD (Cole, 2026-10-08: "an entire CMO, with deep expert knowledge of every platform and how they work together")
- You are the brand's CMO and a specialist on every channel at once. Before advising on a channel, read its knowledge file (view knowledge, topic = meta, tiktok, google-ads, seo-search, email-sms, retention-ltv, website-cro, offers-pricing, stock, calendar, measurement-budget, post-purchase-survey, cross-channel). For ANY change to one channel, also read cross-channel and say what the change does to the others and over what lag.
- Work top down: the business first (contribution margin, MER and new-customer CAC against the plan), then which channel moved, then the campaign, then the ad. Rule out measurement (tracking, attribution model, a lagging sync, a credit shift between channels) before calling anything performance.
- Every recommendation names its second-order effect (example: cutting Meta prospecting lowers branded search, direct and email revenue one to three weeks later; a discount lifts conversion now and lowers margin and future full-price demand).
- Think in systems, act in small steps: one change per channel at a time, sized so its effect can be read, with the read date stated.
- Before cutting a channel that clicks under-credit (upper-funnel video, TikTok, YouTube, creators, podcasts), check the survey view when the brand has a post-purchase survey: what customers SAY is a reality check on Triple Whale, never a replacement for it (knowledge topic post-purchase-survey).

READING AN ACCOUNT
- Is the brand making money: blended (Triple Whale) first, MER and aMER against the plan. Then are the ads working: Meta-reported delivery (spend, CPM, CTR, hook, hold). Say which lens you are using.
- Pace is spend against the month's budget by day of month; a brand under pace late in the month is throttled or broken, not "saving".
- When a number moves, look at the change log before guessing: who touched what, and when.
- The client's own lines (target ROAS, target CPA) are the bar. A day under the bar is noise; three days is a finding; a week is a conversation with the client.
- A ROAS on fewer than two conversions is not a result. Withhold it and say why.
- Never mix currencies, never quote Meta's purchases as attribution, never flag The Golf Sock.

CHANGING HOW BRIEFS AND REPORTS READ
- When Cole does not like how a brief or report reads, turn what he said into standing direction (set_writing_style) for every brand or one, and offer to redraft today's brief with it so he sees the difference. Wording, order, length, tone, what is left out: direction. A new number, a new section, a new layout: hand_to_claude_code.

THINKING LIKE A STRATEGIST (every answer, not only the creative ones)
- Lookup is the start, never the answer. After the numbers, say what they mean, what the gap is, and what to do about it, in that order. "Here is the AOV" is a lookup; "AOV is $71, the returning-customer AOV is $94, and 61% of second orders land inside 45 days, so the retention lever is a 30-day email flow, not a discount" is an answer.
- Know why the question is being asked. Retention questions are about LTV and payback; creative questions are about what to test next; pacing questions are about whether to touch the budget. Answer the question behind the question.
- Evidence before taste: the brand brain (brain view), the test library (tests view), what sold (what_worked), the customers (customers view). Quote the evidence you used. Where the evidence is missing, say so and name what would settle it.
- Gaps are findings. When you look at a brand and something obvious is not being done (no post-purchase flow, a winning angle with no video concept, a persona nobody has an ad for, a product line with no test in 60 days), say it, even if nobody asked.
- Build, do not describe. A report asked for ONCE = make_report. A dashboard to KEEP ("I want to look at this every day", "pin it", "post it to Slack every morning", "build Ahsan a dashboard") = save_dashboard, scoped to one brand or all. A QUESTION to be asked again on a schedule ("ask this every Monday", "post the answer in #lucky-internal every morning") = schedule_question (read the schedules view first so you do not make a twin). A scenario asked for = build_scenario and give the link. A brief = fill_brief / create_brief. Ads from words = studio_batch. Angles for creators = create_angles. A reference in the thread = draft_from_thread.
- Awareness and market sophistication decide the opening of any ad (unaware: the problem or the moment; solution aware: why what they tried failed; product aware: proof, offer, urgency; past buyers: the new thing, belonging). Match the ad to where the customer is; a wrong match is the most common reason a well-built ad loses.

BUILDING AND TESTING CREATIVE (Mobius's framework, three words only, never "execution" or "variation" in anything sent to the team)
- ANGLE = the argument: the reason to buy, said in one sentence to a specific person, with stakes, something you could say at a bar and they could disagree with. Not a persona ("frustrated caregiver"), not a topic ("smell"), not a feature ("highlight the gold finish"), not a format ("UGC"), not a vague line nobody disagrees with ("premium quality at a fair price").
- ONE WORDING PER ARGUMENT. The angle library (p_br_angle) holds each argument once. Before calling anything a new angle, search the library and the tests view: if the same reason to buy is already there in other words, it is THAT angle, use its wording and its id; never let one argument live under five names. Different reason to buy = new angle.
- CONCEPT = the idea we build to deliver the angle: the scene, layout or structure, specific enough that the editor could build it with no questions. Concepts under one angle differ in IDEA, not in look or format; three designs of one idea are one concept.
- WHAT WE'RE TESTING = the one piece that changes in the batch, decided before anything is built: concepts, headlines, hooks, person on screen, edit style, reviews, redesigns with the same copy. Never two levels at once: headlines on an unproven angle tell us nothing, because a loss could be the argument, the idea or the words.
- The 3-question test to label anything: did the reason to buy change (new angle)? same reason, different idea (new concept)? same idea, one piece changed (testing inside the concept)? Price, a new demographic with a new reason: new angle. Same idea as static and video, a new hook, a new creator reading the script, a new product shot: a testing piece. An offer is a separate lever: note it, never change the offer and the argument in one test.
- WHY are we testing this: every batch states the reason, from the data. New brand or no clear winner: test angles, 3 concepts each, 1 ad per concept, concepts that argue the point in genuinely different ways (prove it with evidence, show it happening, make the alternative look ridiculous) and say what each teaches if it wins. Angle won and one concept clearly best: test pieces inside that concept, one at a time. Angle won and concepts close: more concepts under it. Winner fatiguing: new concepts under the proven angle first, a new angle only if those die too.
- Meta's Andromeda ranking rewards ads that are genuinely different: every ad in a batch must look and read different, even inside a concept test. Near-duplicates are wasted spend.
- The brief shape (the Asana template): ANGLE (one sentence) / WHY (a belief about the customer, not a description of the copy) / WHAT WE'RE TESTING (one line: "3 new concepts", "3 headlines on 412-3", "2 hooks on 290-1"; the number names the winning ad) / numbered ads, one line each the editor can build from / Copy: headline, primary text, offer, landing page, inspo / for video: creator, script. Ads are named "<batch>-<n> | <format>" so results join back to the test.
- Reviewing a batch someone sent: 1) read the brand brain and the test library first; 2) relabel what they sent with the correct words (strategists mislabel: an angle called a concept, a format called a concept, three designs called three concepts, a persona written as an angle, no Testing line); 3) check: angle is an argument, concepts are buildable and different, one level changes, the level fits the account state, the angle fits the brand's rules and the customer's awareness, it is not a claim a competitor owns, it has not been tested and lost without a reason to retest, the headline would stop the right person, it sounds like the customer and the brand, every claim is true; 4) VERDICT: Good as is / Fix and send back / Redo, then WHAT'S WRONG (most important first, 5 max), then the FIXED VERSION in brief shape using their own ideas, then a short Slack message to the strategist (what is working in one line if true, numbered fixes, 4 max, a clear next step, under 150 words). Name the psychological lever each angle pulls (loss, status, social proof, relief, contrarian, proof, belonging, curiosity, real urgency); no lever, weak angle.
- Copy: specific beats general (numbers, objects, moments), stakes, the customer's own words from the quotes, one idea per ad, the hook earns the next second, the brand's voice holds (swap the logo for a competitor's and nothing changes = too generic). Red flags: describes the product instead of arguing for it, a pun headline with no reason to buy, a claim the product cannot prove, circular rationale.

HOW ACCOUNTS ARE RUN (Cole's post-Andromeda doctrine, set on Lucky Golf 2026-10-04; the default for every brand, a brand's own rules in the brain win)
- One Sales campaign per brand, CBO, Advantage+ audience and placements. No separate testing, winners or retargeting campaign: tests and winners live side by side and the budget moves to what sells. Winners are never moved. A product gets its own campaign only when it alone does about 50+ purchases a week for 3 weeks, or for a launch (3 to 4 weeks, then fold in), or a sale.
- One Asana test = one numbered brief = one ad set, up to 6 ads (Meta piles spend on 1 or 2, so more never get read). At most 5 new tests a week; default split 2 creator + 2 concepts + 1 inside-a-concept, moved on purpose only. Test ad sets carry a daily minimum (about 40% of goal CPA, $20 on Lucky) for their first 7 days only; all minimums together stay under 25% of the campaign budget. Budgets move 20% at most, every 3 days at most. Never edit a test before day 7.
- Naming is load-bearing: the Asana number first on the ad set ("415 | Wedges | CONCEPTS"), on every ad ("415 A | Still", "416 A | @handle"). No number = Locus cannot see it. Creator videos are batched by product (creators do not film to an angle), launched as partnership ads in the same campaign.
- Mix of new work: few proven winners = about 60% concepts, 40% inside-a-concept; clear winners running = about 25% concepts, 75% inside-a-concept (Theriot's 80/20 is creative mix, not budget). Test wide first, then go deep. An angle is dead only after 2 different concepts on it fail. Only 5 to 8% of ads become winners, so volume of real tries matters.
- Judging, Triple Whale lastPlatformClick only, after 3x goal CPA spent or 7 days with at least one goal CPA spent: WINNER = CPA at or under the brand's goal with 2+ sales (keep it, take the minimum off, make inside-a-concept tests of it); KEEP = at or under the account's trailing-30-day average CPA with 2+ sales (leave it, minimum off); ANOTHER WEEK = above the average but soft metrics (CTR, hook, cost per add to cart, CPM, read against the account's own recent ads in thirds) in the top third and CPA within 2x goal; PAUSE otherwise, or past day 7 with too little spend to judge. Locus suggests, the media buyer (Ahsan) decides and writes the learning; a test cannot close without one. Goal CPA = AOV / 2.5 by default (Lucky 3.0), overridden per brand by Cole in Brand info > Test rules; never recompute it on your own.
- Product pushes, lightest first: give that product more of this week's tests; a temporary push ad set with its best ~4 ads and a higher minimum for 2 to 3 weeks; a launch campaign only for a new product. Judge products by sales in Shopify and Triple Whale, not by how much spend Meta gave them.
- Asana is the only place anyone types a brief; Locus is the memory and fills itself. Every SOP, brief and card is as short as a person will actually read.

EVERY SUGGESTION CARRIES ITS REASON (Cole, 2026-10-08: "any suggestion it gives and that we approve, it is because of a reason")
- Before suggesting anything, read the numbers it rests on (the right view below). A suggestion with no number behind it is a guess: label it as one, or do not make it.
- Every suggestion says four things in plain words: WHAT to do, the NUMBER and WHERE it came from (which view, which dates, which attribution), WHY it should work (the principle below, in one line), and WHAT TO WATCH and for how long to know if it worked.
- Say how sure you are: measured on this brand, seen across our brands, or general practice. Small samples (under ~20 conversions, under a week) are hunches.
- Prefer the smallest change that tests the idea. Never propose more than one big change to the same campaign at once; you could not tell which one worked.
- An action you take (apply a proposal) only follows a suggestion that met all of the above and that a person approved.

HOW TO RUN EACH PLATFORM (the marketer's knowledge for each; a brand's own rules in the brain win)
META: see HOW ACCOUNTS ARE RUN above. The ad set is the unit Meta optimises; judge the set first and an ad by its role in it (the anchor that carries a working set is replaced, never just switched off). First-click credit shows openers, last-click shows closers.
GOOGLE ADS (views google_ads, plus Triple Whale's google rows):
- Branded search protects demand the brand already made: high ROAS by nature, so never judge Google on blended ROAS that includes brand. Split brand vs non-brand before any verdict.
- Performance Max eats branded traffic and retargeting unless brand is excluded; when PMax ROAS looks great, check how much is brand and returning customers before scaling it.
- Shopping and PMax live on the product feed: titles, images, price and availability decide reach more than bids. A product missing from results is usually a feed problem.
- Smart bidding needs volume: about 30+ conversions a month per campaign for tROAS/tCPA; below that, Maximize conversions or consolidate. Change targets by 10 to 20% at a time and wait a week (learning restarts).
- Google's own conversions lag 1 to 3 days and run lower than Triple Whale's pixel; quote Triple Whale for results and Google for spend, clicks and impression share.
- Search terms show what people actually typed: add negatives for the irrelevant, and turn proven terms into exact match.
TIKTOK (Triple Whale's tiktok rows until connected directly):
- Native beats polished: creator-shot, sound-on, hook in the first second, captions. Spark Ads (boosting a creator's own post) usually beat dark posts.
- Creative tires in 7 to 14 days, faster than Meta; plan 3 to 5 new ads a week to keep spend.
- Learning needs about 50 conversions a week per ad group; consolidate rather than spread thin. Judge on Triple Whale, not TikTok's view-through counts.
EMAIL AND SMS (views klaviyo, email via the store view):
- Not every brand is on Klaviyo: Ice & Gold uses Attentive (the integrations view names a brand's email tool). For those, email numbers come only from Triple Whale; say so.
- Healthy stores take roughly 25 to 40% of revenue from email and SMS; under 15% means flows are missing or weak.
- Flows before campaigns: welcome, abandoned cart, abandoned checkout, browse abandonment, post-purchase, win-back, sunset. A missing core flow is the first finding.
- Open rates are inflated by Apple Mail; judge on click rate, placed-order rate and revenue per recipient. Unsubscribes over ~0.3% per send mean the list is tired or the message is wrong.
- Sending to unengaged profiles hurts deliverability for everyone: campaigns go to engaged segments (opened or clicked in 60 to 90 days) unless there is a reason.
- Subject lines: specific beats clever; test one thing at a time; send time matters less than list quality.
WEBSITE (view website, Google Analytics 4):
- Conversion rate by channel and landing page is the lens: a landing page with lots of sessions and a conversion rate well under the site's is the cheapest fix in the account.
- Mobile usually carries 70%+ of sessions and converts lower; check mobile speed and the first screen before blaming the ads.
- The funnel step that drops most (visit to cart, cart to checkout, checkout to purchase) names the fix: product page, cart or offer, or checkout trust and shipping cost.
- GA4 undercounts purchases; store numbers stay Shopify's (through Triple Whale). Use GA4 for behaviour, not for revenue.
SEARCH, ORGANIC (view search, Search Console):
- Brand search volume is demand the ads and the brand created; rising brand clicks are a sign the paid work builds the brand.
- Non-brand queries sitting at position 4 to 15 with real impressions are the opportunities: a better page, title or content moves them onto page one.
- Low click rate at a good position means the title and description do not earn the click.
STORE (view store):
- AOV levers: bundles, a free-shipping threshold just above the current AOV, a gift with purchase. Discounts buy conversion now and train customers to wait.
- New against returning: a brand living on returning customers is healthy only if new-customer acquisition holds; check CAC and the 90-day value per ad.
STOCK (view stock; knowledge topic stock):
- Before recommending a scale, a launch or a promotion on a product, read its stock. A Scale call on a product whose run-out comes before its restock (ads_call "ease off") becomes "scale only once the restock is placed" or "move the budget to a product with stock".
- "At risk for Black Friday" = products whose run-out (or first core size out) lands on or before Cyber Monday with no order landing first. Name each, its run-out, its restock date if any, and the ad spend behind it; then name the products that are safe to scale instead.
- Run-out dates use the last 90 days' pace, before any Black Friday lift: a product that runs out Dec 1 at today's pace runs out sooner in the week of Black Friday. Say so.
- Too much stock (push to clear) is an ad opportunity: name the product, its weeks of stock and money tied up, and the cheapest test (a bundle with a best seller, an offer, an ad).
- Never recommend reordering a limited drop. On brands we buy for, name the order-by date and the suggested quantity, and the factory minimum when the suggestion is under it ("the 500 minimum is 5.6 years of sales" means skip it or call it a one-off).
- Ad spend per product comes from Triple Whale orders (last platform click), never from ad names; about 80% of Lucky's spend ties to a product.

CALENDAR (view calendar; knowledge topic calendar):
- Before recommending a promotion, a launch, a budget step or a send, read the calendar for that brand: what is live, what is coming in six weeks, and what overlaps. A day that moved is explained by the calendar (a sale starting or ending, a drop, a send) before any ad change.
- Space big sales six weeks apart; never two discounts at once; every sale has an end date (propose one when missing); every promotion has one job.
- When someone asks what is late or due, list the countdown steps with their owner and date, late first, and offer "make the Asana tasks" for a date that has none.
- Add, move or end a date with the actions add_date, move_date, end_date; make its Asana tasks with make_asana_tasks. Black Friday phases are edited on the season page, never added as calendar dates.

THE ANGLES HUB (what creators see)
- Two levels, never nested. A SECTION answers one question: why would a creator film this today. Three legal kinds, all at the same level: Hot right now (pinned), a dated window (Halloween, Black Friday, the Masters; it retires itself), and a durable lane (a product line, or a standing theme). Five or six sections per brand, max.
- Everything describing the video itself is a CHIP on the card: format first, then product. "Split screen" is a chip. "Black Friday" is a section.
- A section is named after a product only when the buyer chooses BETWEEN products (wedge vs putter). One-product brands get occasions.
- Each angle carries: title, the argument, who it is for, products (short), format, the lever (staff only), three openers (first lines that stop the scroll), the shots, the on-screen text, a do and a don't.
- Before writing new angles, read the brand context, the current angles (to not repeat them) and what actually sold (Triple Whale attributed revenue by ad). Angles come from evidence, then taste.
ACTING IN META, ASANA AND DRIVE (2026-10-09; Cole: "Why can't the AI make changes himself too? If he suggests doing something we approve it or change it up.")
- You can change things yourself now, every change behind an Apply card: meta_pause, meta_resume, meta_budget,
  meta_min_spend, meta_rename, meta_duplicate_adset, meta_create_ad, meta_undo; asana_task, asana_comment,
  asana_complete; drive_copy_to, drive_share. Reads: meta_read (the live account structure), drive_list.
- READ FIRST. meta_read before any Meta card, so the card names the exact campaign / ad set / ad with its real
  budget and status; the views (Triple Whale attributed) for the numbers that justify it. Never propose from memory.
- ONE CHANGE AT A TIME, each with the number and the reason ("Ad set 412 | UGC at 3.1x TW ROAS on $1,840 over 7 days,
  above the 2.4x goal: budget $200 -> $260/day (+30%)"). Budget steps stay at 50% or less; big: true only when the
  person asked for exactly that jump. Judge the ad set first; never pause the anchor of a working set.
- New things go in PAUSED (copies, new ads) unless the person said live. Pausing, a budget or a rename can be undone for
  24 hours with meta_undo; say so when it matters.
- When a card is refused because Locus can only read the account, say exactly what Cole has to grant (the card's
  words), then give the change as the steps to do by hand in Ads Manager.
- After the cards: say what you proposed, what you did NOT do and why, then suggest the next step like a colleague
  ("I can also duplicate the winning set at 2x budget, say go").
- Sharing a Drive file with someone outside Mobius reaches a client: say so plainly in the reason.
`.trim();

const winOf = a => { const today = new Date(Date.now() - 864e5).toISOString().slice(0, 10); const days = Math.min(+a.days || 30, 180);
  const to = /^\d{4}-\d{2}-\d{2}$/.test(a.to || '') ? a.to : today; const from = /^\d{4}-\d{2}-\d{2}$/.test(a.from || '') ? a.from : new Date(Date.parse(to) - (days - 1) * 864e5).toISOString().slice(0, 10);
  const n = Math.round((Date.parse(to) - Date.parse(from)) / 864e5) + 1; const pto = new Date(Date.parse(from) - 864e5).toISOString().slice(0, 10); const pfrom = new Date(Date.parse(pto) - (n - 1) * 864e5).toISOString().slice(0, 10);
  return { from, to, pfrom, pto }; };
const VIEW_BLURBS = {
  calendar: 'the marketing calendar (Locus Calendar): for every client or one `brand`, what is live now, every drop, sale, ad push and Black Friday phase in the next six weeks with its offer and its countdown (photos in, ads briefed, built, email scheduled, ads loaded: done, due or LATE, with the owner), Klaviyo sends in the next 14 days, and the brands with nothing planned. Read it before any promotion, launch or budget advice, and to explain a day that moved.',
  stock: 'the brand\'s stock, read live from Shopify through Supply (only brands with the Mobius Digital Shopify app; Lucky today). Pass `brand` and `what` = summary (ease off / safe to scale / push to clear for the ads, with ad spend per product from Triple Whale orders, plus to order and on the way on brands we buy for), products (every product), orders (factory orders and factories) or drops (new designs, keep or cut). THE view for "what is at risk for Black Friday", "can we scale X", "what should we order". Not connected = say so; never guess stock from sales.',
  tiktok_ads: 'one brand\x27s TikTok Ads read directly: campaigns with spend, impressions, clicks, CTR, CPM, purchases and ROAS (TikTok\x27s), and spend by day. Pass `brand`, optionally `days` or `from`/`to`.',
  survey: 'one brand\x27s post-purchase survey ("how did you hear about us", Fairing or KnoCommerce) against Triple Whale for the same orders: answers grouped into channels (Facebook/Instagram, TikTok, Google/YouTube, podcast, word of mouth, influencer, other), the agreement % with Triple Whale lastPlatformClick, per channel what customers said vs what Triple Whale credited, what people credited to no ad say, and the top raw answers. Pass `brand`, optionally `days` or `from`/`to`. A reality check on attribution, never a replacement: read knowledge topic post-purchase-survey before drawing a conclusion.',
  knowledge: 'the expert playbooks, one per channel plus the cross-channel system and measurement: how each platform works now, decision rules with thresholds, diagnostics, how it affects the others, worked examples. Call with no `topic` for the list, then with `topic`.',
  google_ads: 'one brand\'s Google Ads read directly: campaigns with type (Search, Performance Max, Demand Gen, Shopping), spend, clicks, conversions and value, and spend by day. Pass `brand`, optionally `days` or `from`/`to`.',
  website: 'one brand\'s website from Google Analytics 4: sessions, people, engagement, the funnel to purchase, channels, landing pages, devices, source and medium, against the period before. Pass `brand`, optionally `days` or `from`/`to`.',
  search: 'one brand\'s organic Google search from Search Console: clicks, impressions, click rate, position, top queries flagged brand or not, top pages, against the period before. Pass `brand`, optionally `days` or `from`/`to`.',
  accounts: 'every client brand with its targets, budget, channels, whether the brief is on, and when it last synced. Start here to resolve a brand name to an account.',
  overview: 'the Overview tab: each active brand over the window with sales, spend, MER, AMER, new-customer revenue and contribution margin, all blended (Triple Whale). Use it for "how is the book doing".',
  account: 'one brand, the same numbers the Daily Brief is built from: month to date and last month, sales, spend, MER, per-channel attributed revenue (Triple Whale), pace against the plan. Pass the brand name or its id (brand_...) in `brand`.',
  store: 'one brand over a range, store-level (Triple Whale, blended): revenue, orders, AOV, new customers and their AOV, returning orders and AOV, CAC (cost to acquire a new customer), first-order margin, MER, aMER, contribution margin, email (Klaviyo) revenue and share. THE view for "what is the AOV", "how many orders", "what does a new customer cost", "how much is email". Pass `brand` and either `days` (default 30, ends yesterday), `month` (YYYY-MM) or `from` + `to` (YYYY-MM-DD). Pass `compare: true` to get the prior period of the same length beside it.',
  series: 'one brand day by day over a range: Meta spend, impressions, clicks, and Triple Whale netSales and blendedAds per day. Pass `brand` and `days` (default 30).',
  changes: 'what was changed on one account and by whom: budgets, campaigns paused or launched, bid strategy, targeting. Pass `brand` and `days`.',
  creatives: 'the ads on one account over the last days: spend, Meta-reported clicks and CTR, thruplays, with the last 3 days against the prior 14 so fatigue shows. Pass `brand` and `days`.',
  briefs: 'the Daily Briefs already sent to one client, newest first: what we told them. Pass `brand`.',
  reports: 'the weekly and monthly reports for one client, newest first, with their summaries. Pass `brand`.',
  data_health: 'whether one brand\'s data can be trusted right now: sync age, gaps, the last error. Pass `brand`.',
  plan: 'the plan and goals for one brand by month. Pass `brand`.',
  angles: 'the brand\'s angles hub as creators see it: every section and every angle (title, argument, who, products, format, status). Pass `brand`. Read it before proposing new angles or archiving old ones.',
  what_worked: 'the ads that actually sold for one brand over the last 90 days, by Triple Whale attributed revenue (lastPlatformClick), with Meta spend and CTR beside them. Pass `brand`. This is the evidence new angles come from.',
  brand_context: 'what we know about one brand for creative work: who buys and why, the voice, the products, the claims, the KPIs. Pass `brand`. Written by Cole; empty means ask him or read the angles hub\'s intro.',
  writing_style: 'the standing direction for how Daily Briefs and weekly/monthly reports are written, for every brand and for one (pass `brand`), plus which report sections and periods are switched off for that brand. Read it before changing how briefs or reports read.',
  findings: 'everything the nightly checks currently have open.',
  config: 'how the Strategist is set up: which Slack channel it briefs in, the brief hour.',
  problems: 'what went wrong lately: failed ideas-bot runs in Slack, Studio errors (brief / plan / make), the last sync error, each with when (UTC) and the error text. Pass `brand` (optional; without it, every brand). THE view to read when someone says something is broken, failed, not working, or shows an error.',
  tests: 'the brand\'s TEST LIBRARY and ANGLE LIBRARY: every numbered brief (angle, level, what was tested, stage, verdict, learning, Asana link) newest first, and every angle with its wins and losses. Pass `brand`; pass `q` (a few words) to search titles, hypotheses, briefs and angle arguments, which is how you check whether an argument or an idea was tested before. Read it before calling anything new, before writing a brief, and before reviewing one.',
  brief: 'ONE brief by its number: the test-library row plus the live Asana task (the brief text as written, section, assignee, the Testing / Angle / Result fields, the link). Pass `brand` and `number`. Read it before fill_brief, and to review what a strategist wrote.',
  customers: 'who the customers are and what they do next, from Triple Whale orders (400 days): customers, orders, revenue, repeat rate, orders per customer, revenue by order number (1st, 2nd, 3rd+), time from first to second order in buckets, where first orders came from (last platform click), the products most often in a first cart and in a second cart (product ids; the Shopify product titles are not in Locus yet). Pass `brand` and `days` (default 365). THE view for retention, LTV shape, journey and "what do they buy next" questions; query tw_orders for anything it does not give.',
  scenarios: 'the saved what-if scenarios from the lead-gen and ROAS calculators for one brand (or agency-wide): name, kind, inputs, note, the share link. Pass `brand` (optional). Read it before build_scenario so you extend what exists instead of duplicating it.',
  dashboards: 'the saved dashboards in Locus (Reports > Dashboards): name, who it is for, scope, range, blocks, Slack schedule and channel. Read it before saving a new one so you do not make a twin. A block of type chart is a Strategist answer someone pinned from the chat (title, the chart, the question, when).',
  schedules: 'the scheduled questions: questions the Strategist answers on its own on a schedule (every morning, every Monday or the 1st, at an hour in Central) and posts to an internal Slack channel; with brand, last run and its status. Read it before schedule_question so you do not make a twin.',
  market: 'whether the MARKET had a bad day, for "was it us or the market?": pass `date` (YYYY-MM-DD, default yesterday). pulse = platform outages that overlapped the day from Mobius Pulse (Meta, Google Ads, Shopify...); breezeway = the public Breezeway Meta cost-per-purchase score across about 50 of their own customers (NORMAL / BAD / VERY BAD; unofficial, a hint, not a verdict); chatter = whether advertisers on X, Reddit or in the news reported Meta or Google Ads problems that day (asked once per date, cached). Read it before blaming a bad day on the account.',
  integrations: 'every connection Locus has, with its state and the fix: AGENCY-WIDE ones (Meta token, Triple Whale key, Google with its five checks, the TikTok app, Asana, Slack, Stripe, Frame, Claude, Studio image key, Gemini, Atria, Canva, downloader, Lucky creator app) and PER BRAND ones grouped Ads (Meta, Google Ads, TikTok), Store (Triple Whale, Shopify), Website (GA4, Search Console), Email and SMS (Klaviyo or Attentive), Work (Asana, Drive, Frame). Google Ads, TikTok and email carry `levels`: Through Triple Whale (daily totals) and Direct; state part = only through Triple Whale. Pass `brand` to narrow. THE view for "is X connected", "why is there no Y for brand Z", "what is missing on the new brand", and before telling anyone a data source is broken.',
  klaviyo: 'the brand\'s Klaviyo, read live with its own key: pass `brand` and `what` = overview (counts, live flows, biggest lists and segments), lists, segments (with profile counts), flows (status and trigger), campaigns (last 30 sent with open, click, conversion rate and revenue) or metrics. THE view for email questions: how many segments, which flows are live or dead, how the last sends did, who is in what. Not connected = the reply says how to connect it (Brand settings > Integrations).',
  brain: 'the BRAND BRAIN: everything Locus knows about one brand for strategy and creative work in one document: products, offers, facts, staff rules and claim rules, product lines with market stage and awareness, personas, customer quotes, competitors, the angle library with every test and result, research notes, the creator link, how the brand sounds, and GAPS. About 60k characters, so it comes in parts: pass `brand` and `part` (1, 2, 3...; the reply says how many). Read part 1 at least before any creative judgement, brief, review or angle. The brand_context view is a short summary of the same.',
};

/* ------------------------------------------------------------------ */
/*  the views                                                          */
/* ------------------------------------------------------------------ */

function buildViews(d) {
  /* Every brand (brand_accounts: act_id = the brand id). A brand with no Meta ad account (meta_act null)
     is marked no_meta so the views say its Meta numbers do not exist instead of showing zeros. */
  const allAccounts = async (env, activeOnly) => (await d.listAccounts(env, activeOnly)).map(a => a.meta_act ? a : { ...a, no_meta: true });
  const resolve = async (env, want) => {
    const accounts = await allAccounts(env, false);
    const w = String(want || '').toLowerCase().trim();
    if (!w) return null;
    const id = await resolveBrandId(env, String(want || '').trim());
    return accounts.find(a => a.act_id === id || a.meta_act === want) || accounts.find(a => a.name.toLowerCase() === w) || accounts.find(a => a.name.toLowerCase().includes(w)) || null;
  };
  const need = async (env, a) => {
    const acct = await resolve(env, a.brand || a.id || a.account || a.q);
    if (!acct) throw new Error('Which brand? Give its name or its id (brand_...). Read the accounts view for the list.');
    return acct;
  };
  const strip = a => ({ act_id: a.act_id, name: a.name, currency: a.currency, tz: a.tz, active: a.active, monthly_budget: a.monthly_budget,
    budgets: d.safeJson(a.budgets_json, {}), target_cpa: a.target_cpa, target_roas: a.target_roas, team_channel: a.slack_channel, client_channel: a.brief_channel,
    tw_shop: a.tw_shop, brief_enabled: a.brief_enabled, last_sync: a.last_sync_insights, last_error: a.last_error,
    ...(a.no_meta ? { no_meta: true, note: 'No Meta ad account connected: no Meta numbers exist for it. Triple Whale numbers exist only when tw_shop is set.' } : {}) });
  return {
    accounts: async env => ({ accounts: (await allAccounts(env, false)).map(strip), how_to_read: VIEW_BLURBS.accounts }),
    overview: async env => ({ accounts: await d.overview(env), how_to_read: VIEW_BLURBS.overview + ' window is the selected range; cm is null when costs cannot be trusted.' }),
    account: async (env, a) => {
      const acct = await need(env, a);
      const today = d.localDate(acct.tz);
      return { account: strip(acct), brief_numbers: await d.briefData(env, acct, today), how_to_read: 'These are the numbers the Daily Brief uses, with Triple Whale attribution per channel. mtd = month to date, lm = last month to the same day.' };
    },
    store: async (env, a) => {
      const acct = await need(env, a);
      const today = d.localDate(acct.tz), yesterday = d.addDays(today, -1);
      let from, to;
      if (/^\d{4}-\d{2}$/.test(a.month || '')) { from = `${a.month}-01`; const dim = d.daysInMonth(`${a.month}-15`); to = `${a.month}-${String(dim).padStart(2, '0')}`; if (to > yesterday) to = yesterday; }
      else if (/^\d{4}-\d{2}-\d{2}$/.test(a.from || '') && /^\d{4}-\d{2}-\d{2}$/.test(a.to || '')) { from = a.from; to = a.to > yesterday ? yesterday : a.to; }
      else { const days = Math.min(400, Math.max(1, Number(a.days) || 30)); to = yesterday; from = d.addDays(to, -days + 1); }
      if (from > to) throw new Error('That range has no finished days yet (Triple Whale lands a day in arrears).');
      const cur = await d.storePeriod(env, acct, from, to);
      const out = { brand: acct.name, period: cur };
      if (a.compare) { const len = d.ymdDiff(from, to) + 1; out.prior = await d.storePeriod(env, acct, d.addDays(from, -len), d.addDays(from, -1)); }
      out.how_to_read = cur.how_to_read + ' Quote the period you are answering for.';
      return out;
    },
    series: async (env, a) => {
      const acct = await need(env, a);
      const days = Math.min(120, Math.max(7, Number(a.days) || 30));
      const to = d.localDate(acct.tz), from = d.addDays(to, -days + 1);
      const { results: meta } = await env.DB.prepare(`SELECT date, SUM(spend) AS spend, SUM(impressions) AS impressions, SUM(link_clicks) AS link_clicks, SUM(clicks) AS clicks FROM daily_insights WHERE act_id IN ${metaOf(1)} AND date >= ?2 AND date <= ?3 GROUP BY date ORDER BY date`).bind(acct.act_id, from, to).all();
      const { results: tw } = await env.DB.prepare(`SELECT date, SUM(CASE WHEN metric = 'netSales' THEN value END) AS netSales, SUM(CASE WHEN metric = 'blendedAds' THEN value END) AS blendedAds,
        SUM(CASE WHEN metric = 'newCustomerSales' THEN value END) AS newCustomerSales FROM tw_daily WHERE act_id = ?1 AND date >= ?2 AND date <= ?3 GROUP BY date ORDER BY date`).bind(acct.act_id, from, to).all();
      const byDay = {};
      for (const r of meta || []) byDay[r.date] = { date: r.date, meta_spend: r.spend, impressions: r.impressions, link_clicks: r.link_clicks };
      for (const r of tw || []) Object.assign(byDay[r.date] ||= { date: r.date }, { netSales: r.netSales, blendedAds: r.blendedAds, newCustomerSales: r.newCustomerSales });
      return { brand: acct.name, currency: acct.currency, from, to, days: Object.values(byDay).sort((x, y) => x.date < y.date ? -1 : 1), how_to_read: 'meta_spend is Meta-reported; netSales and blendedAds are Triple Whale (store-level). MER for a day = netSales / blendedAds.' };
    },
    changes: async (env, a) => {
      const acct = await need(env, a);
      const days = Math.min(90, Math.max(1, Number(a.days) || 14));
      const { results } = await env.DB.prepare(`SELECT event_time, category, summary, actor, object_name, reason, note FROM activities WHERE act_id IN ${metaOf(1)} AND event_time >= datetime('now', ?2) AND confirmed != -1 ORDER BY event_time DESC LIMIT 60`).bind(acct.act_id, `-${days} days`).all();
      return { brand: acct.name, changes: results || [], how_to_read: VIEW_BLURBS.changes };
    },
    creatives: async (env, a) => {
      const acct = await need(env, a);
      const days = Math.min(60, Math.max(7, Number(a.days) || 14));
      const to = d.localDate(acct.tz), from = d.addDays(to, -days + 1), recent = d.addDays(to, -2);
      const { results } = await env.DB.prepare(`SELECT ad.ad_id, ad.name, ad.status, SUM(x.spend) AS spend, SUM(x.impressions) AS impressions, SUM(x.link_clicks) AS link_clicks, SUM(x.video_thruplay) AS thruplays,
          SUM(CASE WHEN x.date >= ?4 THEN x.spend END) AS spend3, SUM(CASE WHEN x.date >= ?4 THEN x.impressions END) AS imp3, SUM(CASE WHEN x.date >= ?4 THEN x.link_clicks END) AS clicks3
        FROM ad_daily x JOIN ads ad ON ad.act_id = x.act_id AND ad.ad_id = x.ad_id WHERE x.act_id IN ${metaOf(1)} AND x.date >= ?2 AND x.date <= ?3 GROUP BY ad.ad_id ORDER BY spend DESC LIMIT 40`).bind(acct.act_id, from, to, recent).all();
      const rows = (results || []).map(r => ({ ...r, ctr: r.impressions ? r.link_clicks / r.impressions : null, ctr_last3: r.imp3 ? r.clicks3 / r.imp3 : null }));
      return { brand: acct.name, from, to, ads: rows, how_to_read: 'Meta-reported only (spend, impressions, link CTR). No purchases or ROAS here on purpose; attribution is Triple Whale\'s and is store-level. ctr_last3 well under ctr means the ad is tiring.' };
    },
    briefs: async (env, a) => {
      const acct = await need(env, a);
      const { results } = await env.DB.prepare(`SELECT date, posted_at, status, substr(text, 1, 1200) AS text FROM briefs WHERE act_id = ?1 ORDER BY date DESC LIMIT 7`).bind(acct.act_id).all();
      return { brand: acct.name, briefs: results || [], how_to_read: VIEW_BLURBS.briefs };
    },
    reports: async (env, a) => {
      const acct = await need(env, a);
      const { results } = await env.DB.prepare(`SELECT period, period_start, period_end, status, sent_at, substr(summary, 1, 1500) AS summary FROM reports WHERE act_id = ?1 ORDER BY period_end DESC LIMIT 8`).bind(acct.act_id).all();
      return { brand: acct.name, reports: results || [], how_to_read: VIEW_BLURBS.reports };
    },
    data_health: async (env, a) => { const acct = await need(env, a); return { brand: acct.name, health: await d.dataHealth(env, acct), how_to_read: VIEW_BLURBS.data_health }; },
    /* So a strategist can ask "why didn't the planner work?" in Slack and get the real reason, instead
       of going through Cole (Ahsan, 2026-10-06). Studio writes app_log; the ideas bot writes idea_run. */
    problems: async (env, a) => {
      const acct = (a.brand || a.id || a.account || a.q) ? await need(env, a) : null;
      const q = (sql, limit) => { const s = env.DB.prepare(sql.replace('{W}', acct ? 'AND act_id = ?1' : '')); return (acct ? s.bind(acct.act_id) : s).all().then(r => r.results || []).catch(() => []); };
      const ideas = await q(`SELECT finished_at AS at_utc, kind, error FROM idea_run WHERE status = 'failed' AND error IS NOT NULL {W} ORDER BY finished_at DESC LIMIT 10`);
      const studio = await q(`SELECT at AS at_utc, where_ AS step, message FROM app_log WHERE app = 'studio' {W} ORDER BY at DESC LIMIT 10`);
      return { brand: acct?.name || 'all brands', ideas_bot_failures: ideas, studio_errors: studio, last_sync_error: acct?.last_error || null,
        known_fixes: ['"image dimensions exceed max allowed size" = a reference image on the batch was bigger than the model reads; fixed 2026-10-06, Studio now shrinks images on upload and when planning, so planning the batch again works.',
          '"invalid_blocks" = the Slack card could not be drawn; press Redo on the idea.',
          '"could not open" / "needs the files:read scope" = a file or link the bot cannot reach; upload the file into the thread.'],
        how_to_read: VIEW_BLURBS.problems + ' Say in plain words what happened, what the person can do right now, and whether Cole has to fix it (a bug, a missing key). Never guess at a cause this view does not show.' };
    },
    plan: async (env, a) => {
      const acct = await need(env, a);
      const { results } = await env.DB.prepare(`SELECT * FROM p_plan WHERE act_id = ?1 ORDER BY 2 DESC LIMIT 24`).bind(acct.act_id).all().catch(() => ({ results: [] }));
      return { brand: acct.name, goals: d.safeJson(acct.goals_json, {}), plan: results || [], how_to_read: VIEW_BLURBS.plan };
    },
    angles: async (env, a) => {
      const acct = await need(env, a);
      const { results: secs } = await env.DB.prepare(`SELECT id, name, line, pinned, enabled, sort FROM p_amb_section WHERE act_id = ?1 ORDER BY pinned DESC, sort`).bind(acct.act_id).all();
      const { results: angs } = await env.DB.prepare(`SELECT id, section_id, hot, status, title, argument, who, products, format, trend FROM p_amb_angle WHERE act_id = ?1 ORDER BY sort`).bind(acct.act_id).all();
      const hub = await env.DB.prepare(`SELECT slug, live, intro, about, audience, avoid_json, rules_json, season_json FROM p_amb_brand WHERE act_id = ?1`).bind(acct.act_id).first();
      return { brand: acct.name, hub: hub ? { ...hub, avoid: d.safeJson(hub.avoid_json, []), rules: d.safeJson(hub.rules_json, []), season: d.safeJson(hub.season_json, null) } : null,
        sections: (secs || []).map(x => ({ ...x, angles: (angs || []).filter(g => g.section_id === x.id).length })), angles: angs || [], how_to_read: VIEW_BLURBS.angles + ' status draft = archived, not shown to creators.' };
    },
    what_worked: async (env, a) => {
      const acct = await need(env, a);
      const to = d.localDate(acct.tz), from = d.addDays(to, -90);
      const { results } = await env.DB.prepare(`SELECT ad.ad_id, ad.name, SUM(t.revenue) AS tw_revenue, SUM(t.orders) AS tw_orders,
          (SELECT SUM(spend) FROM ad_daily x WHERE x.act_id IN ${metaOf(1)} AND x.ad_id = t.ad_id AND x.date >= ?2 AND x.date <= ?3) AS spend,
          (SELECT SUM(link_clicks) * 1.0 / NULLIF(SUM(impressions), 0) FROM ad_daily x WHERE x.act_id IN ${metaOf(1)} AND x.ad_id = t.ad_id AND x.date >= ?2 AND x.date <= ?3) AS ctr
        FROM tw_ad_attr t JOIN ads ad ON ad.ad_id = t.ad_id AND ad.act_id IN ${metaOf(1)}
        WHERE t.act_id = ?1 AND t.model = 'lastPlatformClick' AND t.date >= ?2 AND t.date <= ?3 GROUP BY t.ad_id ORDER BY tw_revenue DESC LIMIT 25`).bind(acct.act_id, from, to).all();
      return { brand: acct.name, from, to, ads: (results || []).map(r => ({ ...r, roas: r.spend ? Math.round(r.tw_revenue / r.spend * 100) / 100 : null })),
        how_to_read: 'Revenue and orders are Triple Whale attributed (lastPlatformClick). spend and ctr are Meta-reported. The ad NAME carries the angle and the format after the last |; read the names for what the winning arguments were.' };
    },
    brand_context: async (env, a) => {
      const acct = await need(env, a);
      const key = `brandContext:${acct.act_id}`;
      let text = await d.getSetting(env, key);
      /* Nothing written: work it out from what the app already holds (the
         hub, the angles, the ads that sold, the briefs and reports we sent)
         and keep it, marked as derived, so Cole corrects rather than writes. */
      if (!text) {
        text = await deriveBrandContext(env, d, acct).catch(e => '');
        if (text) await d.putSetting(env, key, text);
      }
      return { brand: acct.name, context: text || '', how_to_read: text ? VIEW_BLURBS.brand_context + (text.startsWith('(Derived') ? ' This one was derived by the Strategist from the app\'s own data; treat it as a good first draft and correct it in the chat.' : '')
        : 'Nothing could be worked out for this brand yet (no hub, no angles, no ads, no briefs). Ask Cole.' };
    },
    writing_style: async (env, a) => {
      const acct = a.brand ? await resolve(env, a.brand) : null;
      const g = k => d.getSetting(env, k);
      return { brief_all: await g('briefStyle'), report_all: await g('reportStyle'),
        ...(acct ? { brand: acct.name, brief_brand: await g(`briefStyle:${acct.act_id}`), report_brand: await g(`reportStyle:${acct.act_id}`), report_config: d.safeJson(acct.report_config_json, {}) } : {}),
        how_to_read: 'The standing direction is added to the writer\'s instructions on every brief or report, above any one-off rewrite steer. report_config.hide lists channel sections left out of reports (meta, google, tiktok, amazon, pinterest, email); weekly/monthly false = that report is not drafted.' };
    },
    /* The test library + the angle library (2026-10-07). `q` searches, so "have we tested the
       gold finish before" is one read, not a guess. */
    tests: async (env, a) => {
      const acct = await need(env, a);
      const q = String(a.q || '').trim().toLowerCase();
      const like = `%${q.replace(/[%_]/g, ' ')}%`;
      const { results: batches } = await env.DB.prepare(`SELECT b.num, b.title, b.level, b.variable, b.hypothesis, b.why, b.stage, b.verdict, b.verdict_note, b.learning, b.asana_url, b.asana_section, b.asana_angle, b.asana_result, b.check_again, b.updated_at,
          g.name AS angle, c.name AS concept, substr(b.brief_text, 1, ${q ? 900 : 240}) AS brief
        FROM p_br_batch b LEFT JOIN p_br_angle g ON g.id = b.angle_id LEFT JOIN p_br_concept c ON c.id = b.concept_id
        WHERE b.act_id = ?1 ${q ? 'AND (lower(b.title) LIKE ?2 OR lower(b.hypothesis) LIKE ?2 OR lower(b.why) LIKE ?2 OR lower(b.brief_text) LIKE ?2 OR lower(b.learning) LIKE ?2 OR lower(g.name) LIKE ?2 OR lower(g.argument) LIKE ?2 OR lower(b.asana_angle) LIKE ?2)' : ''}
        ORDER BY CAST(b.num AS INTEGER) DESC LIMIT ${q ? 30 : 40}`).bind(...(q ? [acct.act_id, like] : [acct.act_id])).all().catch(() => ({ results: [] }));
      const { results: angles } = await env.DB.prepare(`SELECT a.id, a.name, a.argument, a.awareness, a.stage, a.status, l.name AS line,
          SUM(CASE WHEN b.verdict = 'winner' THEN 1 ELSE 0 END) AS won, SUM(CASE WHEN b.verdict = 'loser' THEN 1 ELSE 0 END) AS lost, SUM(CASE WHEN b.verdict = 'keep' THEN 1 ELSE 0 END) AS kept, COUNT(b.id) AS tests
        FROM p_br_angle a LEFT JOIN p_br_line l ON l.id = a.line_id LEFT JOIN p_br_batch b ON b.angle_id = a.id
        WHERE a.act_id = ?1 ${q ? 'AND (lower(a.name) LIKE ?2 OR lower(a.argument) LIKE ?2)' : ''} GROUP BY a.id ORDER BY a.status, tests DESC LIMIT 60`).bind(...(q ? [acct.act_id, like] : [acct.act_id])).all().catch(() => ({ results: [] }));
      return { brand: acct.name, search: q || null, tests: batches || [], angles: angles || [],
        how_to_read: VIEW_BLURBS.tests + ' level: angle = a new argument, concept = new ideas on a proven angle, variation = one piece inside a proven concept (the team\'s words: "inside a concept"). verdict is the team\'s call; asana_result is the Result field in Asana. An empty search means nothing like it was tested; say so rather than assuming it was.' };
    },
    brief: async (env, a) => {
      const acct = await need(env, a);
      const num = parseInt(a.number ?? a.num ?? a.q, 10);
      if (!Number.isInteger(num)) throw new Error('Pass `number`, the brief number from Asana (e.g. 397).');
      const found = await findBrief(env, acct, num);
      if (!found.task && !found.row) throw new Error(`No brief ${num} for ${acct.name}, in Locus or in its Asana project.`);
      const t = found.task;
      return { brand: acct.name, number: num, locus: found.row || null,
        asana: t ? { gid: t.gid, name: t.name, url: t.permalink_url, completed: !!t.completed, assignee: t.assignee?.name || null, section: t.memberships?.[0]?.section?.name || null,
          fields: Object.fromEntries((t.custom_fields || []).filter(f => f.display_value).map(f => [f.name, f.display_value])),
          brief_text: clip(asanaText(t), 6000), template_blanks: blanksOf(t) } : null,
        how_to_read: VIEW_BLURBS.brief + ' template_blanks lists the template lines still empty in Asana. brief_text is the task description as plain text.' };
    },
    customers: async (env, a) => {
      const acct = await need(env, a);
      const days = Math.min(400, Math.max(30, Number(a.days) || 365));
      const to = d.localDate(acct.tz), from = d.addDays(to, -days + 1);
      const one = (sql, ...b) => env.DB.prepare(sql).bind(acct.act_id, from, to, ...b).first().catch(() => null);
      const all = (sql, ...b) => env.DB.prepare(sql).bind(acct.act_id, from, to, ...b).all().then(r => r.results || []).catch(() => []);
      const W = `act_id = ?1 AND date >= ?2 AND date <= ?3 AND customer_id IS NOT NULL`;
      const totals = await one(`SELECT COUNT(*) AS orders, COUNT(DISTINCT customer_id) AS customers, ROUND(SUM(total)) AS revenue, ROUND(AVG(total), 2) AS aov FROM tw_orders WHERE ${W}`);
      if (!totals?.orders) return { brand: acct.name, from, to, note: 'No Triple Whale orders stored for this window yet (the nightly sync fills tw_orders a slice at a time).', how_to_read: VIEW_BLURBS.customers };
      /* Order number per customer inside the window, then everything hangs off it. */
      const RANKED = `WITH r AS (SELECT customer_id, order_id, date, total, products_json, source, ROW_NUMBER() OVER (PARTITION BY customer_id ORDER BY date, order_id) AS n FROM tw_orders WHERE ${W})`;
      const byN = await all(`${RANKED} SELECT CASE WHEN n >= 3 THEN '3+' ELSE CAST(n AS TEXT) END AS order_no, COUNT(*) AS orders, ROUND(SUM(total)) AS revenue, ROUND(AVG(total), 2) AS aov FROM r GROUP BY 1 ORDER BY 1`);
      const repeat = await one(`${RANKED} SELECT SUM(CASE WHEN c >= 2 THEN 1 ELSE 0 END) AS repeat_customers, ROUND(AVG(c), 2) AS orders_per_customer, ROUND(AVG(rev), 2) AS revenue_per_customer FROM (SELECT customer_id, COUNT(*) AS c, SUM(total) AS rev FROM r GROUP BY customer_id)`);
      const gap = await all(`${RANKED} SELECT CASE WHEN g <= 14 THEN 'a. 0-14 days' WHEN g <= 30 THEN 'b. 15-30' WHEN g <= 60 THEN 'c. 31-60' WHEN g <= 90 THEN 'd. 61-90' WHEN g <= 180 THEN 'e. 91-180' ELSE 'f. 181+' END AS bucket, COUNT(*) AS customers
        FROM (SELECT a.customer_id, CAST(julianday(b.date) - julianday(a.date) AS INTEGER) AS g FROM r a JOIN r b ON b.customer_id = a.customer_id AND b.n = 2 WHERE a.n = 1) GROUP BY 1 ORDER BY 1`);
      const median = await one(`${RANKED} SELECT g AS median_days_to_second_order FROM (SELECT CAST(julianday(b.date) - julianday(a.date) AS INTEGER) AS g FROM r a JOIN r b ON b.customer_id = a.customer_id AND b.n = 2 WHERE a.n = 1 ORDER BY g) LIMIT 1 OFFSET (SELECT COUNT(*) / 2 FROM r WHERE n = 2)`);
      const sources = await all(`${RANKED} SELECT COALESCE(source, 'unknown') AS source, COUNT(*) AS first_orders, ROUND(SUM(total)) AS revenue FROM r WHERE n = 1 GROUP BY 1 ORDER BY 2 DESC LIMIT 8`);
      const prods = async n => all(`${RANKED} SELECT j.value AS product_id, COUNT(*) AS carts FROM r, json_each(r.products_json) j WHERE r.n = ${n} AND r.products_json IS NOT NULL GROUP BY 1 ORDER BY 2 DESC LIMIT 8`);
      const [first, second] = await Promise.all([prods(1), prods(2)]);
      const monthly = await all(`${RANKED} SELECT substr(date, 1, 7) AS month, SUM(CASE WHEN n = 1 THEN 1 ELSE 0 END) AS new_customers, SUM(CASE WHEN n > 1 THEN 1 ELSE 0 END) AS returning_orders FROM r GROUP BY 1 ORDER BY 1 DESC LIMIT 14`);
      return { brand: acct.name, currency: acct.currency, from, to, totals, repeat: { ...repeat, repeat_rate: totals.customers ? Math.round((repeat?.repeat_customers || 0) / totals.customers * 1000) / 10 : null },
        by_order_number: byN, days_to_second_order: { buckets: gap, median: median?.median_days_to_second_order ?? null }, first_order_sources: sources,
        products_in_first_cart: first, products_in_second_cart: second, by_month: monthly,
        how_to_read: VIEW_BLURBS.customers + ' "new" here means first order INSIDE the window (a customer whose first order was before the window counts as returning). repeat_rate is % of customers with 2+ orders in the window; a long window flatters it, a short one understates it. Product ids are Shopify product ids from the cart journey, not the receipt.' };
    },
    scenarios: async (env, a) => {
      const acct = (a.brand || a.id || a.account || a.q) ? await resolve(env, a.brand || a.id || a.account || a.q) : null;
      const { results } = await env.DB.prepare(`SELECT s.id, s.act_id, a.name AS brand, s.kind, s.name, s.inputs_json, s.note, s.created_by, s.updated_at FROM p_scenario s LEFT JOIN brand_accounts a ON a.act_id = s.act_id ${acct ? 'WHERE s.act_id = ?1 OR s.act_id = \'all\'' : ''} ORDER BY s.updated_at DESC LIMIT 40`).bind(...(acct ? [acct.act_id] : [])).all().catch(() => ({ results: [] }));
      return { brand: acct?.name || 'every brand', scenarios: (results || []).map(s => ({ ...s, brand: s.brand || (s.act_id === 'all' ? 'agency-wide' : s.act_id), inputs: d.safeJson(s.inputs_json, {}), inputs_json: undefined, url: SHARE_URL + s.id })),
        how_to_read: VIEW_BLURBS.scenarios + ' leads inputs: spend, cpl (cost per lead), cvr (% of leads who buy), aov, margin (%), target (ROAS). The share link opens the read-only page a client can see.' };
    },
    market: async (env, a) => ({ ...(await marketFor(env, String(a.date || a.day || ''))), how_to_read: VIEW_BLURBS.market + ' One source alone is a hint; an outage in pulse is the strongest; Breezeway and chatter agreeing is a market day; neither = look at the account.' }),
    integrations: async (env, a) => {
      const acct = (a.brand || a.id || a.account || a.q) ? await resolve(env, a.brand || a.id || a.account || a.q) : null;
      const r = await integrationsReport(env, { brand: acct?.act_id || null });
      return { ...r, how_to_read: VIEW_BLURBS.integrations + ' state: ok, part (partly connected: only through Triple Whale), warn (connected but stale or half set up), bad (failing), off (not set up). Quote the fix text when something is off; the agency ones are Cole\'s to fix, the per-brand ones the team can do in Locus.' };
    },
    schedules: async env => {
      await env.DB.prepare(SCHED_SQL).run().catch(() => {});
      const { results } = await env.DB.prepare(`SELECT s.*, a.name AS brand FROM p_ask_schedule s LEFT JOIN brand_accounts a ON a.act_id = s.act ORDER BY s.created_at DESC`).all();
      return { schedules: (results || []).map(r => ({ id: r.id, question: r.question, brand: r.act === 'all' ? 'all brands' : r.brand || r.act, when: whenText(r), channel: r.channel, by: r.created_by, last_run: r.last_run, last_status: r.last_status })), how_to_read: VIEW_BLURBS.schedules + ' Change or stop one in Locus: Settings > The Strategist > Scheduled questions.' };
    },
    dashboards: async env => {
      await env.DB.prepare(DASH_SQL).run().catch(() => {});
      const { results } = await env.DB.prepare(`SELECT p.*, a.name AS brand FROM p_dashboard p LEFT JOIN brand_accounts a ON a.act_id = p.act_id ORDER BY p.updated_at DESC`).all();
      return { dashboards: (results || []).map(r => ({ id: r.id, name: r.name, brand: r.brand || 'agency-wide', for_who: r.for_who, spec: d.safeJson(r.spec_json, {}), schedule: r.schedule || 'none', channel: r.channel || '', pinned: !!r.pinned, by: r.created_by, updated_at: r.updated_at, last_posted: r.last_posted, open: `${LOCUS_URL}?open=dash&id=${r.id}` })), how_to_read: VIEW_BLURBS.dashboards };
    },
    /* Google read directly (google.js): Google Ads campaigns, GA4 website, Search Console. */
    calendar: async (env, a) => {
      const acct = a.brand ? await need(env, a) : null;
      return { ...(await calendarView(env, acct ? acct.act_id : 'all')), how_to_read: VIEW_BLURBS.calendar };
    },
    stock: async (env, a) => {
      const acct = await need(env, a);
      const r = await stockView(env, acct, String(a.what || 'summary').toLowerCase());
      return { ...r, how_to_read: VIEW_BLURBS.stock + ' ads_call: ease off = runs out by Cyber Monday or before its restock lands; safe to scale = 90+ days or a restock lands in time; push to clear = over a year of stock. first_size_out is the core size that empties first, which is what runs_out follows. Dates are today\'s pace, before any Black Friday lift.' };
    },
    knowledge: async (env, a) => {
      const t = String(a.topic || '').toLowerCase().trim();
      if (!t || !KNOWLEDGE[t]) return { topics: KNOWLEDGE_INDEX, how_to_read: 'The expert playbooks. Call again with `topic` set to one of these before advising on that channel; for any change to one channel also read cross-channel.' };
      const text = KNOWLEDGE[t], size = 45000, parts = Math.max(1, Math.ceil(text.length / size)), part = Math.min(Math.max(1, +a.part || 1), parts);
      return { topic: t, part, parts, text: text.slice((part - 1) * size, part * size), how_to_read: parts > 1 && part < parts ? `Part ${part} of ${parts}: call again with part=${part + 1} for the rest.` : 'Apply these rules to the numbers from the data views; quote the rule you used in one line.' };
    },
    tiktok_ads: async (env, a) => {
      const acct = await need(env, a); const w = winOf(a);
      const r = await tiktokReport(env, acct.act_id, w.from, w.to);
      return { brand: acct.name, from: w.from, to: w.to, ...r, how_to_read: r.error ? 'TikTok is not read directly for this brand yet (not connected or not linked); use the channels view (Triple Whale totals) and say so.' : 'TikTok\x27s own numbers: spend, impressions, clicks, CTR, CPM exact; purchases and ROAS are TikTok\x27s (include view-through), quote Triple Whale for results.' };
    },
    survey: async (env, a) => {
      const acct = await need(env, a); const w = winOf(a);
      const r = await surveyReport(env, acct.act_id, { from: w.from, to: w.to });
      return { brand: acct.name, ...r, how_to_read: r.error === 'not_linked' ? 'No post-purchase survey is connected for this brand (Brand settings > Integrations > Post-purchase survey). Say so, and suggest Fairing if the brand runs upper-funnel video, podcasts or creators.' : `${r.how_to_read} ${VIEW_BLURBS.survey}` };
    },
    google_ads: async (env, a) => {
      const acct = await need(env, a); const w = winOf(a);
      const r = await adsReport(env, acct.act_id, w.from, w.to);
      return { brand: acct.name, from: w.from, to: w.to, ...r, how_to_read: r.error === 'not_linked' ? 'This brand has no Google Ads account linked in Locus. Say so.' : 'Google Ads\' own numbers: spend, clicks and impressions are exact; conversions and value are Google\'s and lag 1 to 3 days. For results quote Triple Whale (store or channels views). Campaign types: SEARCH, PERFORMANCE_MAX, DEMAND_GEN, SHOPPING, VIDEO.' };
    },
    website: async (env, a) => {
      const acct = await need(env, a); const w = winOf(a);
      const r = await websiteReport(env, acct.act_id, w.from, w.to, w.pfrom, w.pto);
      return { brand: acct.name, from: w.from, to: w.to, ...r, how_to_read: r.error === 'not_linked' ? 'No Google Analytics property linked for this brand. Say so.' : 'Google Analytics 4: sessions, engagement, the funnel (sessions, addToCarts, checkouts, ecommercePurchases), channels, landing pages, devices, source/medium. GA4 undercounts purchases; use it for behaviour, not revenue. cur = the window, prev = the window before.' };
    },
    search: async (env, a) => {
      const acct = await need(env, a); const w = winOf(a);
      const words = [acct.name, String(acct.tw_shop || '').split('.')[0]].filter(Boolean);
      const r = await searchReport(env, acct.act_id, w.from, w.to, w.pfrom, w.pto, words);
      return { brand: acct.name, from: w.from, to: w.to, ...r, how_to_read: r.error === 'not_linked' ? 'No Search Console property linked for this brand. Say so.' : 'Google Search Console, organic only: clicks, impressions, click rate, average position; queries flagged brand or not; split = brand vs non-brand clicks. Lags about 2 days.' };
    },
    klaviyo: async (env, a) => {
      const acct = await need(env, a);
      const r = await klaviyoView(env, acct.act_id, String(a.what || 'overview').toLowerCase());
      return { brand: acct.name, ...r, how_to_read: (r.how_to_read ? r.how_to_read + ' ' : '') + 'Klaviyo\'s own numbers (its Placed Order attribution), not Triple Whale: say so when quoting revenue. Judge gaps: no live welcome, abandoned cart, post-purchase or winback flow; a list that never gets a campaign; segments nobody uses.' };
    },
    brain: async (env, a) => {
      const acct = await need(env, a);
      const brain = await brandBrain(env, acct.act_id, { creator: true }).catch(() => ({ md: '' }));
      const md = brain.md || '';
      if (!md) return { brand: acct.name, part: 1, parts: 1, text: '', how_to_read: 'Nothing is in the brain for this brand yet: no research, no lines, no tests. Say so.' };
      const SIZE = 12000, parts = Math.max(1, Math.ceil(md.length / SIZE));
      const part = Math.min(parts, Math.max(1, Number(a.part) || 1));
      return { brand: acct.name, part, parts, text: md.slice((part - 1) * SIZE, part * SIZE), how_to_read: VIEW_BLURBS.brain + (parts > part ? ` Part ${part} of ${parts}; read the next part when you need what comes after.` : ' This is the last part.') };
    },
    findings: async (env, a, ctx, engine) => ({ open: await engine.openFindings(env, d.h()), how_to_read: VIEW_BLURBS.findings }),
    config: async env => ({ briefing_channel: await d.getSetting(env, 'strategistChannel'), brief_hour: await d.briefHour(env), how_to_read: VIEW_BLURBS.config }),
  };
}

/* What we know about a brand, worked out from the app itself: the hub's own
 * words, the angles already written, the ads that sold, what we told the
 * client. One model call, kept until Cole corrects it. */
async function deriveBrandContext(env, d, acct) {
  const hub = await env.DB.prepare(`SELECT intro, about, audience, avoid_json, rules_json, season_json FROM p_amb_brand WHERE act_id = ?1`).bind(acct.act_id).first();
  const { results: angs } = await env.DB.prepare(`SELECT a.title, a.argument, a.who, a.products, a.format, s.name AS section FROM p_amb_angle a LEFT JOIN p_amb_section s ON s.id = a.section_id WHERE a.act_id = ?1 AND a.status = 'live' ORDER BY a.sort LIMIT 60`).bind(acct.act_id).all();
  const to = d.localDate(acct.tz), from = d.addDays(to, -120);
  const { results: won } = await env.DB.prepare(`SELECT ad.name, SUM(t.revenue) AS rev, SUM(t.orders) AS ord FROM tw_ad_attr t JOIN ads ad ON ad.ad_id = t.ad_id AND ad.act_id IN ${metaOf(1)}
    WHERE t.act_id = ?1 AND t.model = 'lastPlatformClick' AND t.date >= ?2 AND t.date <= ?3 GROUP BY t.ad_id ORDER BY rev DESC LIMIT 20`).bind(acct.act_id, from, to).all();
  const { results: adNames } = await env.DB.prepare(`SELECT name FROM ads WHERE act_id IN ${metaOf(1)} ORDER BY first_spend_date DESC LIMIT 80`).bind(acct.act_id).all();
  const { results: briefs } = await env.DB.prepare(`SELECT substr(text, 1, 1500) AS text FROM briefs WHERE act_id = ?1 AND text IS NOT NULL ORDER BY date DESC LIMIT 3`).bind(acct.act_id).all();
  const { results: reports } = await env.DB.prepare(`SELECT substr(summary, 1, 1500) AS summary FROM reports WHERE act_id = ?1 AND summary IS NOT NULL ORDER BY period_end DESC LIMIT 2`).bind(acct.act_id).all();
  /* The Brand tab: approved research and the test history. */
  const brAll = sql => env.DB.prepare(sql).bind(acct.act_id).all().then(r => r.results || []).catch(() => []);
  const [brPersonas, brDocs, brAngles, brLearn] = await Promise.all([
    brAll(`SELECT p.name, p.data_json, l.name AS line FROM p_br_persona p LEFT JOIN p_br_line l ON l.id = p.line_id WHERE p.act_id = ?1 AND p.status = 'approved'`),
    brAll(`SELECT d.key, d.data_json, l.name AS line FROM p_br_doc d LEFT JOIN p_br_line l ON l.id = d.line_id WHERE d.act_id = ?1 AND d.status = 'approved' AND d.key IN ('market', 'mechanism', 'voice', 'profile')`),
    brAll(`SELECT a.name, a.argument, a.status, SUM(CASE WHEN b.verdict = 'winner' THEN 1 ELSE 0 END) AS won, SUM(CASE WHEN b.verdict = 'loser' THEN 1 ELSE 0 END) AS lost FROM p_br_angle a LEFT JOIN p_br_batch b ON b.angle_id = a.id WHERE a.act_id = ?1 AND a.status IN ('active', 'retired') GROUP BY a.id`),
    brAll(`SELECT num, title, verdict, learning FROM p_br_batch WHERE act_id = ?1 AND learning IS NOT NULL AND learning != '' ORDER BY CAST(num AS INTEGER) DESC LIMIT 30`),
  ]);
  const brandTab = [
    brPersonas.length ? `PERSONAS (approved):\n${brPersonas.map(p => `- ${p.name}${p.line ? ` [${p.line}]` : ''}: ${String(p.data_json || '').slice(0, 900)}`).join('\n')}` : '',
    brDocs.length ? `RESEARCH NOTES:\n${brDocs.map(x => `- ${x.key}${x.line ? ` [${x.line}]` : ''}: ${String(x.data_json || '').slice(0, 1200)}`).join('\n')}` : '',
    brAngles.length ? `ANGLE LIBRARY (wins / losses):\n${brAngles.map(a => `- ${a.name} (${a.status}, ${a.won || 0}/${a.lost || 0}): ${String(a.argument || '').slice(0, 200)}`).join('\n')}` : '',
    brLearn.length ? `TEST LEARNINGS:\n${brLearn.map(b => `- ${b.num} ${b.title} (${b.verdict || 'open'}): ${b.learning}`).join('\n')}` : '',
  ].filter(Boolean).join('\n\n');
  const have = (hub?.about || hub?.intro) || (angs || []).length || (won || []).length || (briefs || []).length || brandTab;
  if (!have) return '';
  const system = `You write the brand context a marketing strategist needs before writing ads for a client. From the material given, produce a plain-prose brief with these headings: WHAT THEY SELL; WHO BUYS AND WHY; THE VOICE (with three example phrases lifted from the material); WHAT HAS WORKED (the arguments behind the ads that sold, read from the ad names and the angles); CLAIMS AND RULES; KPIs AND TARGETS (only if stated). Say only what the material supports; where it is silent, write "not known yet". No em dashes, no exclamation marks, under 600 words.`;
  const user = `BRAND: ${acct.name} (${acct.currency}, target ROAS ${acct.target_roas ?? 'unset'}, target CPA ${acct.target_cpa ?? 'unset'})\n\nHUB INTRO: ${hub?.intro || ''}\nABOUT: ${hub?.about || ''}\nAUDIENCE: ${hub?.audience || ''}\nAVOID: ${hub?.avoid_json || ''}\nRULES: ${hub?.rules_json || ''}\nSEASON: ${hub?.season_json || ''}\n\nLIVE ANGLES:\n${(angs || []).map(a => `- [${a.section || ''}] ${a.title}: ${a.argument || ''} (${a.who || ''}; ${a.products || ''}; ${a.format || ''})`).join('\n')}\n\nADS THAT SOLD (Triple Whale attributed, 120 days):\n${(won || []).map(w => `- ${w.name}: $${Math.round(w.rev)} / ${w.ord} orders`).join('\n')}\n\nRECENT AD NAMES:\n${(adNames || []).map(a => a.name).join(' | ')}\n\nLAST BRIEFS TO THE CLIENT:\n${(briefs || []).map(b => b.text).join('\n---\n')}\n\nLAST REPORT SUMMARIES:\n${(reports || []).map(r => r.summary).join('\n---\n')}${brandTab ? `\n\nFROM THE BRAND TAB (research the team approved, and the creative test history):\n${brandTab}` : ''}`;
  const text = await d.claude(env, { system, user, maxTokens: 2500 });
  return text ? `(Derived by the Strategist on ${to} from the hub, the angles, the ads and the briefs. Correct it in the chat: "Grunk's context: ...")\n\n${String(text).trim()}` : '';
}

/* ------------------------------------------------------------------ */
/*  the checks: plain SQL over what the syncs wrote                    */
/* ------------------------------------------------------------------ */

const PAUSED = /golf ?sock/i;
const money = (n, cur) => { try { return new Intl.NumberFormat('en-US', { style: 'currency', currency: cur || 'USD', maximumFractionDigits: 0 }).format(n); } catch { return '$' + Math.round(n); } };

async function runChecks(env, h, d) {
  const out = [];
  const accounts = (await d.listAccounts(env, true)).filter(a => !PAUSED.test(a.name));
  const all = async (sql, ...b) => (await env.DB.prepare(sql).bind(...b).all()).results || [];
  /* 0. Connections (2026-10-07, Cole: "make sure all these things are connected", reminded in Slack).
     Once a night, every brand's missing or failing connection is a finding with the first step to
     take, so it reaches the team channel and the Monday briefing. One finding per brand per month. */
  try {
    const rep = await integrationsReport(env);
    const CARE = new Set(['meta', 'tw', 'asana', 'slack_internal', 'email', 'shopify']);
    for (const b of rep.brands) {
      if (PAUSED.test(b.name)) continue;
      /* The team channel left the Integrations report on 2026-10-09 (it is a setting); still checked here. */
      const acc = accounts.find(a => a.act_id === b.act_id);
      if (acc && !String(acc.slack_channel || '').trim()) b.items = [...b.items, { key: 'slack_internal', name: 'Slack internal channel', state: 'off', note: 'No team channel: the Strategist and the ideas bot cannot be tagged for this brand.', fix: 'Settings > Brands > the brand > Team channel (the -internal channel id), then invite @Mobius Digital to it.' }];
      const miss = b.items.filter(i => CARE.has(i.key) && (i.state === 'bad' || i.state === 'off') && !(i.key === 'shopify' && i.state === 'off'));
      if (!miss.length) continue;
      const ym = d.localDate(accounts.find(a => a.act_id === b.act_id)?.tz || 'America/Chicago').slice(0, 7);
      const bad = miss.some(i => i.state === 'bad');
      out.push({ key: `connections:${b.act_id}:${ym}`, kind: 'connections', severity: bad ? 'high' : 'med', amount: null, month: ym,
        title: `${b.name}: ${miss.length === 1 ? miss[0].name + ' is' : miss.length + ' connections are'} ${bad ? 'failing' : 'not set up'} (${miss.map(i => i.name).join(', ')})`,
        detail: miss.map(i => `${i.name}: ${i.note} First step: ${(i.steps || [])[0]?.t || i.fix}`).join('\n').slice(0, 1500) + '\nAll of it, with links: Locus > Brand settings > Integrations (agency-wide: Agency settings > Integrations).',
        evidence: { items: miss.map(i => ({ key: i.key, state: i.state })) } });
    }
  } catch (e) { console.log('connections check: ' + e.message); }
  for (const a of accounts) {
    const today = d.localDate(a.tz), ym = today.slice(0, 7), dom = Number(today.slice(8));
    const cur = a.currency;

    /* 1. The sync is failing, so every other number is stale. */
    const stale = a.last_sync_insights && d.ymdDiff(today, a.last_sync_insights.slice(0, 10)) >= 2;
    if (a.last_error || stale)
      out.push({ key: `sync:${a.act_id}`, kind: 'sync', severity: 'high', amount: null, month: ym,
        title: `${a.name}: the Meta sync is ${a.last_error ? 'failing' : 'stale'}${a.last_error ? ' (' + String(a.last_error).slice(0, 60) + ')' : ''}`,
        detail: `Last synced ${a.last_sync_insights || 'never'}. Until it is fixed the brief and the reports for ${a.name} are built on old numbers.`, evidence: {} });

    /* 2. The brief did not go out. */
    if (a.brief_enabled) {
      const last = await env.DB.prepare(`SELECT MAX(date) AS d FROM briefs WHERE act_id = ?1 AND posted_at IS NOT NULL`).bind(a.act_id).first();
      if (!last?.d || d.ymdDiff(today, last.d) >= 2)
        out.push({ key: `brief:${a.act_id}:${today}`, kind: 'brief-missing', severity: 'med', amount: null, month: ym,
          title: `${a.name} has not had a Daily Brief since ${last?.d || 'ever'}`,
          detail: 'The client is used to one every morning. Check the review queue in Slack and the data health for the brand.', evidence: {} });
    }

    /* 3. Pacing against the month's budget. */
    const budget = Number(d.safeJson(a.budgets_json, {})[ym] ?? a.monthly_budget) || 0;
    if (budget && dom >= 5 && a.meta_act) {   // pacing is Meta spend: a brand with no Meta account is skipped
      const mtd = (await env.DB.prepare(`SELECT SUM(spend) AS s FROM daily_insights WHERE act_id IN ${metaOf(1)} AND date >= ?2 AND date <= ?3`).bind(a.act_id, ym + '-01', today).first())?.s || 0;
      const expected = budget * dom / d.daysInMonth(today);
      const ratio = expected ? mtd / expected : 0;
      if (ratio >= 1.15 || (dom >= 10 && ratio <= 0.7))
        out.push({ key: `pace:${a.act_id}:${ym}`, kind: 'pacing', severity: ratio >= 1.3 ? 'high' : 'med', amount: Math.round(mtd - expected), month: ym,
          title: `${a.name} is ${ratio >= 1 ? 'over' : 'under'} pace: ${money(mtd, cur)} spent by day ${dom}, ${Math.round(ratio * 100)}% of where the ${money(budget, cur)} budget should be`,
          detail: `Meta-reported spend against the month's budget. ${ratio >= 1 ? 'At this rate the month ends around ' + money(mtd / dom * d.daysInMonth(today), cur) + '.' : 'Either the budget is wrong or the campaigns are throttled.'}`, evidence: {} });
    }

    /* 4. Blended ROAS under the client's line three days running (Triple Whale, store-level). */
    if (a.target_roas) {
      const rows = await all(`SELECT date, SUM(CASE WHEN metric = 'netSales' THEN value END) AS sales, SUM(CASE WHEN metric = 'blendedAds' THEN value END) AS ads
        FROM tw_daily WHERE act_id = ?1 AND date >= ?2 AND date < ?3 GROUP BY date ORDER BY date DESC LIMIT 3`, a.act_id, d.addDays(today, -4), today);
      const mers = rows.filter(r => r.ads > 50).map(r => r.sales / r.ads);
      if (mers.length === 3 && mers.every(m => m < a.target_roas))
        out.push({ key: `roas:${a.act_id}:${rows[0].date}`, kind: 'roas', severity: 'high', amount: null, month: ym,
          title: `${a.name}: blended ROAS under ${a.target_roas}x three days running (${mers.map(m => m.toFixed(2)).join(', ')})`,
          detail: 'Triple Whale store-level MER, netSales over all ad spend. Look at what changed on the account this week and at the creatives.', evidence: { days: rows.map(r => r.date) } });
    }

    /* 5. A creative tiring: link CTR over the last 3 days well under its prior 14. */
    const tired = !a.meta_act ? [] : await all(`SELECT ad.name, SUM(CASE WHEN x.date >= ?3 THEN x.spend END) AS spend3,
        SUM(CASE WHEN x.date >= ?3 THEN x.link_clicks END) * 1.0 / NULLIF(SUM(CASE WHEN x.date >= ?3 THEN x.impressions END), 0) AS ctr3,
        SUM(CASE WHEN x.date < ?3 THEN x.link_clicks END) * 1.0 / NULLIF(SUM(CASE WHEN x.date < ?3 THEN x.impressions END), 0) AS ctr14
      FROM ad_daily x JOIN ads ad ON ad.act_id = x.act_id AND ad.ad_id = x.ad_id
      WHERE x.act_id IN ${metaOf(1)} AND x.date >= ?2 AND x.date <= ?4 GROUP BY x.ad_id HAVING spend3 >= 150 AND ctr14 > 0 AND ctr3 < ctr14 * 0.6`, a.act_id, d.addDays(today, -17), d.addDays(today, -2), today);
    for (const t of tired.slice(0, 3))
      out.push({ key: `fatigue:${a.act_id}:${String(t.name).slice(0, 40)}:${ym}`, kind: 'fatigue', severity: 'med', amount: Math.round(t.spend3), month: ym,
        title: `${a.name}: "${String(t.name).slice(0, 50)}" is tiring, link CTR ${(t.ctr3 * 100).toFixed(2)}% vs ${(t.ctr14 * 100).toFixed(2)}% before`,
        detail: `${money(t.spend3, cur)} on it in the last three days. Meta-reported CTR. Rotate it or refresh the hook before the CPA follows.`, evidence: {} });
  }
  return out;
}

async function snapshot(env, h, d) {
  const accounts = (await d.overview(env)).filter(a => !PAUSED.test(a.name));
  return { accounts: accounts.map(a => ({ name: a.name, currency: a.currency, window: a.window })) };
}

/* ------------------------------------------------------------------ */
/*  actions: each one proposes; a tap applies                          */
/* ------------------------------------------------------------------ */

const rid = () => crypto.randomUUID().replace(/-/g, '').slice(0, 16);
const clip = (v, n) => v == null ? null : String(v).slice(0, n);
const SHARE_URL = 'https://tools.go-mobius-digital.com/profit/share.html?s=';
/* The saved-dashboards table, the same statement as profit/worker/src/dashboard.js (shared D1). */
const DASH_SQL = `CREATE TABLE IF NOT EXISTS p_dashboard (id TEXT PRIMARY KEY, act_id TEXT, name TEXT NOT NULL, for_who TEXT, spec_json TEXT NOT NULL, schedule TEXT, channel TEXT, pinned INTEGER NOT NULL DEFAULT 1, created_by TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now')), last_posted TEXT)`;
const LOCUS_URL = 'https://tools.go-mobius-digital.com/profit/';

/* ---------------- Asana briefs (2026-10-07) ----------------
   Ahsan asked the bot to fill in brief 397 from an approved thread and it could not; Viktor did it by
   hand. Now the Strategist reads a numbered brief and writes one, in the team's template
   (asana-brand.js BRIEF_STATIC / BRIEF_VIDEO, the same layout the ideas bot uses). */
const xesc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const asanaDoc = async (env, act) => { const r = await env.DB.prepare(`SELECT data_json FROM p_br_doc WHERE act_id = ?1 AND line_id = '' AND key = 'asana'`).bind(act).first().catch(() => null); try { return r?.data_json ? JSON.parse(r.data_json) : null; } catch { return null; } };
const TASK_OPT = 'name,notes,html_notes,completed,permalink_url,assignee.name,assignee.gid,memberships.section.name,memberships.section.gid,custom_fields.name,custom_fields.display_value';
/* The brief by number: the Locus row (p_br_batch) and the live Asana task. The row's asana_gid is the
   fast path; a task Locus has not synced yet is found by walking the project's open tasks by name. */
async function findBrief(env, acct, num) {
  const row = await env.DB.prepare(`SELECT * FROM p_br_batch WHERE act_id = ?1 AND CAST(num AS INTEGER) = ?2 ORDER BY updated_at DESC LIMIT 1`).bind(acct.act_id, num).first().catch(() => null);
  const doc = await asanaDoc(env, acct.act_id);
  let task = null;
  if (doc?.project_gid) {
    if (row?.asana_gid) task = await asana(env, `/tasks/${row.asana_gid}?opt_fields=${TASK_OPT}`).catch(() => null);
    if (!task) {
      const list = await asanaAll(env, `/tasks?project=${doc.project_gid}&completed_since=now&opt_fields=name`).catch(() => []);
      const hit = (list || []).find(t => parseInt(numOf(t.name), 10) === num);
      if (hit) task = await asana(env, `/tasks/${hit.gid}?opt_fields=${TASK_OPT}`).catch(() => null);
    }
  }
  return { row, task, doc };
}
const asanaText = t => String(t?.notes || '').trim();
/* Template lines still empty ("Headline:" with nothing after it). */
function blanksOf(t) {
  const out = [];
  for (const m of String(t?.notes || '').matchAll(/^([A-Z][\w' ]{1,24}):\s*$/gm)) out.push(m[1]);
  return out;
}
/* The brief in the template's shape. Everything given is written; a field not given stays as the
   bare label so the team sees what is still blank (the same as the Asana template). */
function briefNotesHtml(a, { num, by, inspo = [] }) {
  const line = (k, v) => `<strong>${k}:</strong> ${xesc(v || '')}`;
  const ads = (a.ads || []).length ? a.ads : ['', '', ''];
  const parts = [`<body><em>${xesc(by || 'Filled in by the Strategist')}.</em>`, `<h2>The test</h2>${line('Angle', a.angle)}`];
  if (a.concept) parts.push(line('Concept', a.concept));
  parts.push(line('Why', a.why), line("What we're testing", a.testing), ...ads.map((t, i) => `<strong>${i + 1}.</strong> ${xesc(String(t || '').replace(/^\s*\d+[.)]\s*/, ''))}`));
  if (a.guardrails && a.guardrails.length) parts.push(`<strong>Keep in mind:</strong> ${xesc(a.guardrails.join(' · '))}`);
  if (a.kind === 'video') parts.push(`<h2>Video</h2>${line('Creator', a.creator)}`, line('Script', a.script));
  parts.push(`<h2>Copy</h2>${line('Headline', a.headline)}`, line('Primary text', a.primary_text), line('Offer', a.offer), line('Landing page', a.landing_page),
    `<strong>Inspo:</strong> ${inspo.map(u => `<a href="${xesc(u)}">${xesc(u)}</a>`).join(' ')}</body>`);
  return parts.join('\n');
}
function briefNotesText(a, { by, inspo = [] }) {
  const l = (k, v) => `${k}: ${v || ''}`;
  const ads = (a.ads || []).length ? a.ads : ['', '', ''];
  return [by || '', 'THE TEST', l('Angle', a.angle), a.concept ? l('Concept', a.concept) : null, l('Why', a.why), l("What we're testing", a.testing),
    ...ads.map((t, i) => `${i + 1}. ${String(t || '').replace(/^\s*\d+[.)]\s*/, '')}`), a.guardrails?.length ? `Keep in mind: ${a.guardrails.join(' · ')}` : null,
    a.kind === 'video' ? `VIDEO\n${l('Creator', a.creator)}\n${l('Script', a.script)}` : null,
    'COPY', l('Headline', a.headline), l('Primary text', a.primary_text), l('Offer', a.offer), l('Landing page', a.landing_page), `Inspo: ${inspo.join(' ')}`].filter(x => x != null).join('\n');
}
const BRIEF_BLANKS = a => [['headline', 'Headline'], ['primary_text', 'Primary text'], ['offer', 'Offer'], ['landing_page', 'Landing page'], ['inspo', 'Inspo'], ...(a.kind === 'video' ? [['creator', 'Creator'], ['script', 'Script']] : [])]
  .filter(([k]) => Array.isArray(a[k]) ? !a[k].length : !String(a[k] || '').trim()).map(([, l]) => l);
const BRIEF_PROPS = {
  brand: { type: 'string' },
  title: { type: 'string', description: 'A few words; the task is named "<number> - <title>".' },
  kind: { type: 'string', enum: ['static', 'video'], description: 'video = anything filmed (creator, UGC, edit); static = images.' },
  test_type: { type: 'string', enum: ['angle', 'concept', 'variation'], description: 'What this batch tests: a new angle, new concepts on a proven angle, or one piece inside a proven concept.' },
  angle: { type: 'string', description: 'The argument, one sentence, as approved.' },
  concept: { type: 'string', description: 'Only when testing inside a proven concept: the concept, naming the winning ad.' },
  why: { type: 'string', description: 'One sentence: the belief about the customer.' },
  testing: { type: 'string', description: 'One line: what changes and on which ad. "3 new concepts", "3 headlines on 412-3".' },
  ads: { type: 'array', items: { type: 'string' }, description: 'One line per ad, in order, as approved, each buildable with no questions. Include the headline on a line when the thread gave one.' },
  guardrails: { type: 'array', items: { type: 'string' }, description: 'Rules from the thread the editor must keep (e.g. "nothing that hints tour players use it"). Short.' },
  headline: { type: 'string' }, primary_text: { type: 'string' }, offer: { type: 'string' }, landing_page: { type: 'string', description: 'A URL, when the thread or an earlier brief gives it.' },
  inspo: { type: 'array', items: { type: 'string' }, description: 'Reference links from the thread.' },
  creator: { type: 'string' }, script: { type: 'string' },
  assignee: { type: 'string', description: 'A first name (Ahsan, Noma, Ravo) to assign the task to, when asked.' },
  summary: { type: 'string', description: 'One line for the card.' },
};
const asanaUser = async (env, doc, name) => {
  if (!name || !doc?.workspace) return null;
  const list = await asanaAll(env, `/users?workspace=${doc.workspace}&opt_fields=name,email`).catch(() => []);
  const w = String(name).toLowerCase().trim();
  return (list || []).find(u => String(u.name || '').toLowerCase() === w) || (list || []).find(u => String(u.name || '').toLowerCase().startsWith(w)) || null;
};
/* Writes the notes (html first, plain text when Asana refuses the html), the Testing field, the
   name and the assignee. Shared by fill_brief and create_brief. */
async function writeBrief(env, gid, p) {
  try { await asana(env, `/tasks/${gid}`, { method: 'PUT', body: { html_notes: p.html, ...(p.name ? { name: p.name } : {}), ...(p.assignee_gid ? { assignee: p.assignee_gid } : {}) } }); }
  catch (e) {
    if (e.status !== 400) throw e;
    await asana(env, `/tasks/${gid}`, { method: 'PUT', body: { notes: p.text, ...(p.name ? { name: p.name } : {}), ...(p.assignee_gid ? { assignee: p.assignee_gid } : {}) } });
  }
  if (p.testing_field && p.testing_opt) await asana(env, `/tasks/${gid}`, { method: 'PUT', body: { custom_fields: { [p.testing_field]: p.testing_opt } } }).catch(() => {});
}
const ASANA_ACTIONS = (d) => {
  /* Every brand (brand_accounts: act_id = the brand id). A brand with no Meta ad account (meta_act null)
     is marked no_meta so the views say its Meta numbers do not exist instead of showing zeros. */
  const allAccounts = async (env, activeOnly) => (await d.listAccounts(env, activeOnly)).map(a => a.meta_act ? a : { ...a, no_meta: true });
  const resolve = async (env, want) => {
    const accounts = await allAccounts(env, false);
    const w = String(want || '').toLowerCase().trim();
    const id = await resolveBrandId(env, String(want || '').trim());
    return accounts.find(a => a.act_id === id || a.meta_act === want) || accounts.find(a => a.name.toLowerCase() === w) || accounts.find(a => a.name.toLowerCase().includes(w)) || null;
  };
  const prep = async (env, acct, i, doc) => {
    const a = { ...i, kind: i.kind === 'video' ? 'video' : 'static', ads: (i.ads || []).map(x => clip(x, 600)).filter(Boolean).slice(0, 12), guardrails: (i.guardrails || []).map(x => clip(x, 200)).filter(Boolean).slice(0, 6), inspo: (i.inspo || []).filter(u => /^https?:\/\//.test(u)).slice(0, 6) };
    if (!a.angle) return { error: 'The brief needs the angle (the argument) at least.' };
    const fields = (await d.getSetting(env, 'brandAsanaFields')) || {};
    const opt = fields?.testing_opts?.[a.test_type === 'variation' ? 'variation' : a.test_type === 'concept' ? 'concept' : a.test_type === 'angle' ? 'angle' : ''] || null;
    const user = a.assignee ? await asanaUser(env, doc, a.assignee) : null;
    if (a.assignee && !user) return { error: `No Asana user called "${a.assignee}" in the workspace.` };
    return { a, testing_field: fields?.testing || null, testing_opt: opt, user };
  };
  return [
    { name: 'fill_brief',
      description: 'Fill in an EXISTING Asana brief by its number (the task is already in the brand\'s Creative Briefs): the approved angle, why, what we are testing, the numbered ads, guardrails, copy and links, in the team\'s template. Use it when a thread says "use brief 397" or "fill in 412". Put the approved words in as written. Fields the thread did not give stay blank and the card lists them. Read the brief view first so you know what is there.',
      input_schema: { type: 'object', properties: { number: { type: 'integer' }, ...BRIEF_PROPS }, required: ['brand', 'number', 'angle', 'summary'] },
      propose: async (env, i) => {
        const acct = await resolve(env, i.brand); if (!acct) return { error: `No brand called "${i.brand}".` };
        const num = parseInt(i.number, 10);
        const { task, doc } = await findBrief(env, acct, num);
        if (!doc?.project_gid) return { error: `${acct.name} is not connected to Asana yet (Locus, Brand tab, Brand info).` };
        if (!task) return { error: `No open task numbered ${num} in ${acct.name}'s Asana project. Use create_brief for a new one.` };
        const r = await prep(env, acct, i, doc); if (r.error) return r;
        const by = `Filled in by the Strategist from Slack${i.assignee ? `, assigned to ${r.user.name}` : ''}`;
        const html = briefNotesHtml(r.a, { num, by, inspo: r.a.inspo }), text = briefNotesText(r.a, { by, inspo: r.a.inspo });
        const name = i.title ? `${num} - ${clip(i.title, 120)}` : null;
        const blanks = BRIEF_BLANKS(r.a);
        return { summary: i.summary || `Fill in brief ${num} for ${acct.name}`,
          detail: `${task.name}${name && name !== task.name ? ` → ${name}` : ''}${r.user ? `, assigned to ${r.user.name}` : ''}. The description is replaced with the approved brief.${blanks.length ? ` Still blank: ${blanks.join(', ')}.` : ''}`,
          preview: text, patch: { gid: task.gid, url: task.permalink_url, html, text, name, assignee_gid: r.user?.gid || null, testing_field: r.testing_field, testing_opt: r.testing_opt, num, blanks } };
      },
      apply: async (env, p) => { await writeBrief(env, p.gid, p); return { ok: true, note: `Brief ${p.num} is filled in: ${p.url}${p.blanks?.length ? ` Still blank: ${p.blanks.join(', ')}.` : ''}` }; } },
    { name: 'create_brief',
      description: 'Create a NEW numbered brief in the brand\'s Asana project (Creative Briefs column) with the next free number, in the team\'s template: angle, why, what we are testing, the numbered ads, guardrails, copy, links. Use it for a batch approved in a thread that has no task yet. For a task that already exists use fill_brief.',
      input_schema: { type: 'object', properties: BRIEF_PROPS, required: ['brand', 'title', 'angle', 'testing', 'summary'] },
      propose: async (env, i) => {
        const acct = await resolve(env, i.brand); if (!acct) return { error: `No brand called "${i.brand}".` };
        const doc = await asanaDoc(env, acct.act_id);
        if (!doc?.project_gid) return { error: `${acct.name} is not connected to Asana yet (Locus, Brand tab, Brand info).` };
        const secs = await asana(env, `/projects/${doc.project_gid}/sections?opt_fields=name`).catch(() => []);
        const sec = (secs || []).find(s => /creative\s*brief/i.test(s.name)) || (secs || []).find(s => /brief/i.test(s.name));
        if (!sec) return { error: `${acct.name}'s Asana project has no Creative Brief section.` };
        const r = await prep(env, acct, i, doc); if (r.error) return r;
        const num = await nextNumber(env, acct.act_id, doc.project_gid);
        const by = `Written by the Strategist from Slack${i.assignee ? `, assigned to ${r.user.name}` : ''}`;
        const html = briefNotesHtml(r.a, { num, by, inspo: r.a.inspo }), text = briefNotesText(r.a, { by, inspo: r.a.inspo });
        const name = `${num} - ${clip(i.title, 120)}`;
        const blanks = BRIEF_BLANKS(r.a);
        return { summary: i.summary || `New brief ${num} for ${acct.name}: ${i.title}`,
          detail: `${name} in ${sec.name}${r.user ? `, assigned to ${r.user.name}` : ''}. ${r.a.ads.length} ad${r.a.ads.length === 1 ? '' : 's'}, ${r.a.kind}.${blanks.length ? ` Still blank: ${blanks.join(', ')}.` : ''}`,
          preview: text, patch: { project_gid: doc.project_gid, section_gid: sec.gid, html, text, name, assignee_gid: r.user?.gid || null, testing_field: r.testing_field, testing_opt: r.testing_opt, num, blanks } };
      },
      apply: async (env, p) => {
        let task;
        try { task = await asana(env, '/tasks?opt_fields=name,permalink_url', { method: 'POST', body: { name: p.name, projects: [p.project_gid], html_notes: p.html, ...(p.assignee_gid ? { assignee: p.assignee_gid } : {}) } }); }
        catch (e) { if (e.status !== 400) throw e; task = await asana(env, '/tasks?opt_fields=name,permalink_url', { method: 'POST', body: { name: p.name, projects: [p.project_gid], notes: p.text, ...(p.assignee_gid ? { assignee: p.assignee_gid } : {}) } }); }
        await asana(env, `/sections/${p.section_gid}/addTask`, { method: 'POST', body: { task: task.gid } }).catch(() => {});
        if (p.testing_field && p.testing_opt) await asana(env, `/tasks/${task.gid}`, { method: 'PUT', body: { custom_fields: { [p.testing_field]: p.testing_opt } } }).catch(() => {});
        const url = task.permalink_url || `https://app.asana.com/0/${p.project_gid}/${task.gid}`;
        return { ok: true, note: `Brief ${p.num} is in Asana: ${url}${p.blanks?.length ? ` Still blank: ${p.blanks.join(', ')}.` : ''}` };
      } },
  ];
};

/* ---------------- things the Strategist can build (2026-10-07) ---------------- */
const STUDIO_TESTING = ['concepts', 'headlines', 'visuals', 'offer', 'reviews', 'hooks', 'copy', 'format'];
const leadMath = c => {
  const spend = +c.spend || 0, cpl = +c.cpl || 0, cvr = (+c.cvr || 0) / 100, aov = +c.aov || 0, margin = (+c.margin || 0) / 100, target = +c.target || 0;
  const leads = cpl > 0 ? spend / cpl : 0, buyers = leads * cvr, revenue = buyers * aov, contrib = revenue * margin;
  return { leads: Math.round(leads), buyers: Math.round(buyers), revenue: Math.round(revenue), roas: spend ? Math.round(revenue / spend * 100) / 100 : 0, profit: Math.round(contrib - spend), be_cpl: Math.round(cvr * aov * margin * 100) / 100, target_cpl: target > 0 ? Math.round(cvr * aov / target * 100) / 100 : null };
};
const BUILD_ACTIONS = (d) => {
  /* Every brand (brand_accounts: act_id = the brand id). A brand with no Meta ad account (meta_act null)
     is marked no_meta so the views say its Meta numbers do not exist instead of showing zeros. */
  const allAccounts = async (env, activeOnly) => (await d.listAccounts(env, activeOnly)).map(a => a.meta_act ? a : { ...a, no_meta: true });
  const resolve = async (env, want) => {
    const accounts = await allAccounts(env, false);
    const w = String(want || '').toLowerCase().trim();
    const id = await resolveBrandId(env, String(want || '').trim());
    return accounts.find(a => a.act_id === id || a.meta_act === want) || accounts.find(a => a.name.toLowerCase() === w) || accounts.find(a => a.name.toLowerCase().includes(w)) || null;
  };
  return [
    { name: 'build_scenario',
      description: 'Build and save a what-if scenario in the Locus calculators (the Scenarios tab) and give back the share link a client can open. kind "leads" = the lead-gen / giveaway calculator (inputs: spend, cpl = cost per lead, cvr = % of leads who buy, aov, margin = % margin before ads, target = target ROAS). kind "roas" = the ROAS calculator (inputs: mode "orders" with spend + orders, or mode "revenue" with revenue + roas; plus aov, margin). Take the numbers from the brand\'s data (store, customers views) unless the person gave them, and say in `note` where each came from.',
      input_schema: { type: 'object', properties: { brand: { type: 'string', description: 'A brand, or "all" for agency-wide.' }, kind: { type: 'string', enum: ['leads', 'roas'] }, name: { type: 'string' },
        inputs: { type: 'object', description: 'The calculator inputs, numbers only.', additionalProperties: true }, note: { type: 'string', description: 'Where the numbers came from, in words.' }, summary: { type: 'string' } }, required: ['brand', 'kind', 'name', 'inputs', 'summary'] },
      propose: async (env, i) => {
        const all = /^(all|agency|everyone|mobius)$/i.test(String(i.brand || ''));
        const acct = all ? null : await resolve(env, i.brand);
        if (!all && !acct) return { error: `No brand called "${i.brand}".` };
        const inputs = Object.fromEntries(Object.entries(i.inputs || {}).filter(([, v]) => v !== null && v !== '' && (typeof v === 'number' || typeof v === 'string' || typeof v === 'boolean')).map(([k, v]) => [k, typeof v === 'string' && v.trim() !== '' && !isNaN(+v) ? +v : v]));
        if (i.kind === 'leads' && !(inputs.spend > 0 && inputs.cpl > 0)) return { error: 'A leads scenario needs spend and cpl at least.' };
        const m = i.kind === 'leads' ? leadMath(inputs) : null;
        const reading = m ? `${inputs.spend} at ${inputs.cpl} a lead = ${m.leads} leads; ${inputs.cvr || 0}% buying at ${inputs.aov || 0} = ${m.buyers} orders, ${m.revenue} back (${m.roas}x), ${m.profit >= 0 ? m.profit + ' ahead' : -m.profit + ' short'} after margin. Breakeven lead ${m.be_cpl}${m.target_cpl ? `, target lead ${m.target_cpl}` : ''}.` : `ROAS scenario: ${JSON.stringify(inputs)}`;
        return { summary: i.summary || `Scenario: ${i.name}`, detail: `${acct ? acct.name : 'Agency-wide'}, ${i.kind}. ${reading}`, preview: i.note || '',
          patch: { act_id: acct ? acct.act_id : 'all', kind: i.kind, name: clip(i.name, 80), inputs, note: clip(i.note || '', 2000) } };
      },
      apply: async (env, p) => {
        const id = 'sc_' + Array.from(crypto.getRandomValues(new Uint8Array(5))).map(b => b.toString(16).padStart(2, '0')).join('');
        await env.DB.prepare(`INSERT INTO p_scenario (id, act_id, kind, name, inputs_json, note, created_by, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, 'strategist', datetime('now'))`).bind(id, p.act_id, p.kind, p.name, JSON.stringify(p.inputs), p.note || '').run();
        return { ok: true, note: `Saved. Share link: ${SHARE_URL}${id}  (it is also in Locus, Scenarios tab).` };
      } },
    /* Saved dashboards (the hub, 2026-10-07): the Strategist writes the SPEC from the words
       ("what Ahsan looks at every day"), the card shows every block, Apply stores it; Locus
       draws it live each time it opens and the hourly tick posts it to Slack on its schedule.
       Blocks bind to views Locus already has; a block that needs a view that does not exist is
       NOT invented: say so and hand it to Claude Code. */
    { name: 'save_dashboard',
      description: 'Save a dashboard the team wants to KEEP in Locus (Reports > Dashboards), for one brand or all brands, optionally posted to a Slack channel every morning / Monday / the 1st. Blocks: tiles (pick metrics from: revenue, orders, aov, spend, mer, amer, new_share, new_orders, cac, cm, email_rev, email_share, meta_spend, google_spend), brands (one row per brand; columns from: revenue, mtd_vs_plan, spend, mer, amer, new_share, orders, aov, cac, cm, email_rev, costs, trend; only makes sense for scope all), channels (spend and Triple Whale revenue per platform), daily (revenue and spend by day), email (Klaviyo revenue, share, campaigns vs flows), note (a line of text). The dashboard has ONE range and compare (range, compare); a data block (not a note) may carry its OWN dates that override it for that block only: dates {range, compare?} or {range: "custom", from, to}. Use it when the words give one block a different window ("last 7 days for the CPA tiles", "the brand table month to date", "email for September": custom 2026-09-01 to 2026-09-30); leave dates off every block that should follow the dashboard. Read the dashboards view first so you do not make a twin. For a one-off page use make_report instead.',
      input_schema: { type: 'object', properties: {
        name: { type: 'string', description: 'Short, as the person would call it: "Ahsan every morning", "Party Patch weekly".' },
        brand: { type: 'string', description: 'A brand name, or "all" for the whole agency.' },
        for_who: { type: 'string', description: 'Who it is for: a name or a role.' },
        range: { type: 'string', enum: ['yesterday', '7', '30', '90', 'mtd', 'lastmonth'], description: 'Default 7 for a daily dashboard, 30 otherwise.' },
        compare: { type: 'string', enum: ['prev', 'yoy', 'none'] },
        blocks: { type: 'array', items: { type: 'object', properties: { type: { type: 'string', enum: ['tiles', 'brands', 'channels', 'daily', 'email', 'note'] }, title: { type: 'string' }, metrics: { type: 'array', items: { type: 'string' } }, columns: { type: 'array', items: { type: 'string' } }, text: { type: 'string' },
          dates: { type: 'object', description: 'Only when THIS block needs a different window from the dashboard. Left out = the dashboard\'s range and compare.', properties: {
            range: { type: 'string', description: 'yesterday | mtd | lastmonth | a whole number of days 1 to 90 ("7", "14", "30") | custom' },
            from: { type: 'string', description: 'YYYY-MM-DD, only with range custom' }, to: { type: 'string', description: 'YYYY-MM-DD, only with range custom (at most 366 days after from)' },
            compare: { type: 'string', enum: ['prev', 'yoy', 'none'], description: 'Left out = the dashboard\'s compare.' } }, required: ['range'] } }, required: ['type'] }, description: '1 to 8 blocks, in reading order.' },
        schedule: { type: 'string', enum: ['', 'daily', 'monday', 'first'], description: 'When it posts itself to Slack (8am Central). Empty = never.' },
        channel: { type: 'string', description: 'The Slack channel id (C... or G...) it posts to; the brand\'s internal channel when the person says "our channel".' },
        summary: { type: 'string' } }, required: ['name', 'brand', 'blocks', 'summary'] },
      propose: async (env, i) => {
        const acct = i.brand && i.brand !== 'all' ? await resolve(env, i.brand) : null;
        if (i.brand && i.brand !== 'all' && !acct) return { error: `No brand called "${i.brand}".` };
        const METRICS = ['revenue', 'orders', 'aov', 'spend', 'mer', 'amer', 'new_share', 'new_orders', 'cac', 'cm', 'email_rev', 'email_share', 'meta_spend', 'google_spend'];
        const COLUMNS = ['revenue', 'mtd_vs_plan', 'spend', 'mer', 'amer', 'new_share', 'orders', 'aov', 'cac', 'cm', 'email_rev', 'costs', 'trend'];
        const blocks = (i.blocks || []).map(b => {
          if (!b || !['tiles', 'brands', 'channels', 'daily', 'email', 'note'].includes(b.type)) return null;
          const o = { type: b.type, title: clip(b.title || '', 80) };
          if (b.type === 'tiles') { o.metrics = (b.metrics || []).filter(m => METRICS.includes(m)).slice(0, 8); if (!o.metrics.length) return null; }
          if (b.type === 'brands') o.columns = (b.columns || []).filter(c => COLUMNS.includes(c)).slice(0, 8);
          if (b.type === 'note') { o.text = clip(b.text || '', 600); if (!o.text) return null; }
          if (b.type !== 'note' && b.dates) { const dt = cleanDashDates(b.dates); if (dt) o.dates = dt; }
          return o;
        }).filter(Boolean).slice(0, 8);
        if (!blocks.length) return { error: 'None of those blocks can be drawn. Use tiles, brands, channels, daily, email or note.' };
        const range = ['yesterday', '7', '30', '90', 'mtd', 'lastmonth'].includes(i.range) ? i.range : (i.schedule === 'daily' ? '7' : '30');
        const schedule = ['daily', 'monday', 'first'].includes(i.schedule) ? i.schedule : '';
        const channel = /^[CG][A-Z0-9]{6,}$/.test(String(i.channel || '')) ? String(i.channel) : (schedule && acct?.slack_channel ? acct.slack_channel : '');
        const RL = { yesterday: 'Yesterday', '7': 'Last 7 days', '30': 'Last 30 days', '90': 'Last 90 days', mtd: 'Month to date', lastmonth: 'Last month' };
        const dLabel = dt => (dt.range === 'custom' ? `${dt.from} to ${dt.to}` : RL[dt.range] || `Last ${dt.range} days`) + (dt.compare ? `, compare ${dt.compare === 'none' ? 'nothing' : dt.compare === 'yoy' ? 'same dates last year' : 'the period before'}` : '');
        const preview = blocks.map((b, n) => `${n + 1}. ${b.title || b.type}${b.type === 'tiles' ? ': ' + b.metrics.join(', ') : b.type === 'brands' ? ': one row per brand' + (b.columns.length ? ' (' + b.columns.join(', ') + ')' : '') : b.type === 'note' ? ': ' + b.text : ''}${b.dates ? ` [own dates: ${dLabel(b.dates)}]` : ''}`).join('\n');
        return { summary: i.summary || `Save the dashboard "${i.name}"`,
          detail: `${acct ? acct.name : 'All brands'} · ${RL[range]} · compare ${i.compare === 'none' ? 'nothing' : i.compare === 'yoy' ? 'same dates last year' : 'the period before'}${i.for_who ? ` · for ${clip(i.for_who, 60)}` : ''}${schedule ? ` · posts ${schedule === 'daily' ? 'every morning' : schedule === 'monday' ? 'every Monday' : 'on the 1st'} at 8am Central${channel ? ` to ${channel}` : ' (no channel yet)'}` : ''}. It lands in Locus under Reports > Dashboards and draws live each time it opens.`,
          preview, patch: { name: clip(i.name, 120), act_id: acct ? acct.act_id : null, for_who: clip(i.for_who || '', 80), spec: { scope: acct ? acct.act_id : 'all', range, compare: ['prev', 'yoy', 'none'].includes(i.compare) ? i.compare : 'prev', blocks }, schedule, channel } };
      },
      apply: async (env, p) => {
        await env.DB.prepare(DASH_SQL).run().catch(() => {});
        const id = 'db_' + Array.from(crypto.getRandomValues(new Uint8Array(5))).map(b => b.toString(16).padStart(2, '0')).join('');
        await env.DB.prepare(`INSERT INTO p_dashboard (id, act_id, name, for_who, spec_json, schedule, channel, pinned, created_by) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, 1, 'strategist')`)
          .bind(id, p.act_id, p.name, p.for_who, JSON.stringify(p.spec), p.schedule || null, p.channel || null).run();
        return { ok: true, note: `Saved. Open it: ${LOCUS_URL}?open=dash&id=${id} (Reports > Dashboards).${p.schedule && !p.channel ? ' It has a schedule but no channel yet: set one on the dashboard in Locus.' : ''}` };
      } },
    { name: 'studio_batch',
      description: 'Put a batch of static ads into Locus Studio as a draft (the AI makes the images there): one line per ad with the words on it and a short note on the look, under an angle, why, concept and what is being tested. Use it when asked to make statics from words, with no reference image in the thread (with a reference, draft_from_thread). The team opens Studio, picks the product and presses Make.',
      input_schema: { type: 'object', properties: { brand: { type: 'string' }, name: { type: 'string', description: 'The batch name, a few words.' }, num: { type: 'string', description: 'The Asana brief number it belongs to, if any.' },
        angle: { type: 'string' }, why: { type: 'string' }, concept: { type: 'string' }, testing: { type: 'string', enum: STUDIO_TESTING, description: 'What changes across the lines.' }, post_copy: { type: 'string', description: 'Primary text under the ad, if given.' },
        lines: { type: 'array', items: { type: 'string' }, description: '3 to 12 lines, one ad each: the words on the ad plus a short note on the look.' }, summary: { type: 'string' } }, required: ['brand', 'name', 'angle', 'lines', 'summary'] },
      propose: async (env, i) => {
        const acct = await resolve(env, i.brand); if (!acct) return { error: `No brand called "${i.brand}".` };
        const lines = (i.lines || []).map(x => clip(x, 1200)).filter(Boolean).slice(0, 12);
        if (!lines.length) return { error: 'A Studio batch needs at least one line.' };
        return { summary: i.summary || `Studio batch for ${acct.name}: ${i.name}`, detail: `${lines.length} ad${lines.length === 1 ? '' : 's'}, testing ${STUDIO_TESTING.includes(i.testing) ? i.testing : 'concepts'}. It waits as a draft in Locus Studio.`,
          preview: lines.map((l, n) => `${n + 1}. ${l}`).join('\n'),
          patch: { act_id: acct.act_id, num: i.num ? clip(String(i.num), 12) : null, name: clip(i.name, 200), brief: { angle: clip(i.angle, 400) || '', why: clip(i.why, 400) || '', concept: clip(i.concept, 400) || '', post_copy: clip(i.post_copy, 1200) || '', testing: STUDIO_TESTING.includes(i.testing) ? i.testing : 'concepts', lines: lines.map(text => ({ text, inspo: [] })), source: 'strategist' } } };
      },
      apply: async (env, p) => {
        const id = Array.from(crypto.getRandomValues(new Uint8Array(12))).map(b => b.toString(16).padStart(2, '0')).join('');
        await env.DB.prepare(`INSERT INTO p_studio_batch (id, act_id, num, br_batch_id, name, brief_json, setup_json, plan_json, status) VALUES (?1, ?2, ?3, NULL, ?4, ?5, ?6, NULL, 'draft')`)
          .bind(id, p.act_id, p.num, p.name, JSON.stringify(p.brief), JSON.stringify({ products: [], images: [], swipe: [] })).run();
        return { ok: true, note: `Studio batch "${p.name}" is waiting in Locus Studio (${LOCUS_URL}#studio). Pick the product there and press Make.` };
      } },
  ];
};

/* The ideas pipeline, from inside a Strategist conversation (Slack only): the thread's references
   get watched and a draft card lands in the thread. Not a proposal: nothing of record is written,
   and the card has its own buttons. */
const SLACK_TOOLS = (d) => [{
  def: { name: 'draft_from_thread',
    description: 'Hand THIS Slack thread to the ideas pipeline: it opens every reference in the thread (TikTok / Reel / YouTube / Atria / Ad Library links, uploaded videos and images, Drive folders), does a teardown and posts a draft card here with buttons for the creator link, an Asana brief and Studio. Use it when the thread carries a reference and the ask is to turn it into ads, a brief or angles. `steer` = anything the person asked for that the pipeline should honour (e.g. "for Asana", "3 statics", "the Night Out line").',
    input_schema: { type: 'object', properties: { steer: { type: 'string' } }, required: [] } },
  run: async (env, input, ctx) => {
    if (!ctx?.ev?.channel) return { is_error: true, text: 'Only from a Slack thread.' };
    const ev = ctx.ev;
    const text = `${String(ev.text || '')} idea${input?.steer ? ' ' + clip(input.steer, 400) : ''}`;
    try {
      if (d.closeThread) await d.closeThread(env, ev.channel, ev.thread_ts || ev.ts).catch(() => {});
      await ideaStart(env, { ...ev, text, type: 'app_mention' }, null);
    } catch (e) { return { is_error: true, text: `Could not start the ideas pipeline: ${e.message}` }; }
    return { text: 'The ideas pipeline is reading the thread now; its draft card lands here in a minute or two. Reply with ONE short sentence saying so, nothing else.' };
  },
}];

/* Locus's own buttons, through its own routes. Nothing here reaches a client:
 * a redrafted brief or a generated report goes to the internal review queue
 * and waits for a person to send it, exactly as it does from the screen. */
const BUTTONS = (d) => {
  /* Every brand (brand_accounts: act_id = the brand id). A brand with no Meta ad account (meta_act null)
     is marked no_meta so the views say its Meta numbers do not exist instead of showing zeros. */
  const allAccounts = async (env, activeOnly) => (await d.listAccounts(env, activeOnly)).map(a => a.meta_act ? a : { ...a, no_meta: true });
  const resolve = async (env, want) => {
    const accounts = await allAccounts(env, false);
    const w = String(want || '').toLowerCase().trim();
    const id = await resolveBrandId(env, String(want || '').trim());
    return accounts.find(a => a.act_id === id || a.meta_act === want) || accounts.find(a => a.name.toLowerCase() === w) || accounts.find(a => a.name.toLowerCase().includes(w)) || null;
  };
  /* A typed calendar date by name (calendar.js data; Black Friday phases and drops are not editable here). */
  const calFind = async (env, a, name) => {
    const d = await calendarData(env, { act: a.act_id });
    const q = String(name || '').toLowerCase().trim(), mine = d.items.filter(e => e.src === 'cal');
    const e = mine.find(x => x.name.toLowerCase() === q) || mine.find(x => x.name.toLowerCase().includes(q)) || mine.find(x => q.includes(x.name.toLowerCase()));
    if (!e) throw new Error(`No typed date called "${name}" on ${a.name}'s calendar. Dates: ${mine.map(x => x.name).join(', ') || 'none'}. Black Friday phases are edited on the season page.`);
    return e;
  };
  const brandOr = async (env, b) => { const a = await resolve(env, b); if (!a) throw new Error(`No brand called "${b}". The accounts view lists them.`); return a; };
  const safe = fn => async (env, i, h, ctx) => { try { return await fn(env, i, h, ctx); } catch (e) { return { error: e.message }; } };
  return [
    routeAction({ name: 'set_account',
      description: 'Change a brand\'s account settings (Settings, the brand row): target ROAS, target CPA, the monthly budget or one month\'s budget, whether the Daily Brief runs, the team\'s internal Slack channel id. Never the client channel.',
      input_schema: { type: 'object', properties: { brand: { type: 'string' }, target_roas: { type: 'number' }, target_cpa: { type: 'number' }, monthly_budget: { type: 'number' },
        month: { type: 'string', description: "'YYYY-MM' for a one-month budget override" }, month_budget: { type: 'number' }, brief_enabled: { type: 'boolean' }, team_channel: { type: 'string' }, summary: { type: 'string' } }, required: ['brand', 'summary'] },
      describe: safe(async (env, i) => {
        const a = await brandOr(env, i.brand);
        const body = {}, lines = [];
        if (i.target_roas !== undefined) { body.target_roas = Number(i.target_roas); lines.push(`target ROAS ${a.target_roas ?? 'unset'} → ${body.target_roas}`); }
        if (i.target_cpa !== undefined) { body.target_cpa = Number(i.target_cpa); lines.push(`target CPA ${a.target_cpa ?? 'unset'} → ${body.target_cpa}`); }
        if (i.monthly_budget !== undefined) { body.monthly_budget = Number(i.monthly_budget); lines.push(`monthly budget ${a.monthly_budget ?? 'unset'} → ${body.monthly_budget}`); }
        if (i.month && i.month_budget !== undefined) {
          if (!/^\d{4}-\d{2}$/.test(i.month)) return { error: "month must be 'YYYY-MM'." };
          const budgets = d.safeJson(a.budgets_json, {}) || {}; budgets[i.month] = Number(i.month_budget); body.budgets = budgets; lines.push(`${i.month} budget → ${i.month_budget}`);
        }
        if (i.brief_enabled !== undefined) { body.brief_enabled = !!i.brief_enabled; lines.push(`Daily Brief ${i.brief_enabled ? 'on' : 'off'}`); }
        if (i.team_channel !== undefined) { body.slack_channel = String(i.team_channel).trim(); lines.push(`team channel → ${body.slack_channel}`); }
        if (!lines.length) return { error: 'Nothing to change.' };
        return { summary: i.summary, detail: `${a.name}: ${lines.join(', ')}.`, request: { method: 'PUT', path: `/api/accounts/${a.act_id}`, body } };
      }), done: () => 'Account updated.' }),
    routeAction({ name: 'set_brief_time',
      description: 'Change the hour (Central) the Daily Brief is drafted every morning, 0 to 23.',
      input_schema: { type: 'object', properties: { hour: { type: 'integer' }, summary: { type: 'string' } }, required: ['hour', 'summary'] },
      describe: async (env, i) => Number.isInteger(i.hour) && i.hour >= 0 && i.hour <= 23 ? { summary: i.summary, detail: `The Daily Brief drafts at ${i.hour}:00 Central from tomorrow.`, request: { method: 'PUT', path: '/api/brief-time', body: { hour: i.hour } } } : { error: 'hour must be 0 to 23.' },
      done: () => 'Brief time updated.' }),
    /* Scheduled questions (2026-10-08, askschedule.js): "ask this every Monday at 8 in #lucky-internal".
       Apply = PUT /api/ask/schedules as the person, so the route's rules hold: internal channels only,
       the person's own brands only. */
    routeAction({ name: 'schedule_question',
      description: 'Set up a question the Strategist answers on its own on a schedule and posts to an internal Slack channel: every morning (daily), every Monday (monday) or on the 1st (first), at an hour in Central (0 to 23, default 8). The answer is written fresh each time from the data, as if asked then. Only internal channels: a brand\'s internal channel or the Strategist\'s own channel, never a client channel. Read the schedules view first.',
      input_schema: { type: 'object', properties: {
        question: { type: 'string', description: 'The question exactly as it should be asked each time, in the person\'s words, self-contained (name the brand and the period, e.g. "How did Lucky do last week against plan, and what moved?").' },
        brand: { type: 'string', description: 'A brand name, or "all".' },
        cadence: { type: 'string', enum: ['daily', 'monday', 'first'] },
        hour: { type: 'integer', description: 'Hour in Central, 0 to 23. Default 8.' },
        channel: { type: 'string', description: 'A channel id (C... or G...), a channel name like #lucky-internal, or empty for the brand\'s internal channel.' },
        summary: { type: 'string' } }, required: ['question', 'brand', 'cadence', 'summary'] },
      describe: safe(async (env, i) => {
        const all = /^(all|agency|everyone|mobius|all brands)$/i.test(String(i.brand || '').trim());
        const a = all ? null : await brandOr(env, i.brand);
        const cadence = ['daily', 'monday', 'first'].includes(i.cadence) ? i.cadence : 'monday';
        const hour = Number.isInteger(+i.hour) && +i.hour >= 0 && +i.hour <= 23 ? +i.hour : 8;
        /* The allowed channels: every active brand's internal one and the Strategist's own. */
        const accts = await d.listAccounts(env, true);
        const allowed = new Map(accts.filter(x => x.slack_channel).map(x => [x.slack_channel, `${x.name} internal`]));
        const sc = String((await d.getSetting(env, 'strategistChannel')) || '').trim();
        if (/^[CG][A-Z0-9]{6,}$/.test(sc) && !allowed.has(sc)) allowed.set(sc, 'the Strategist channel');
        let ch = String(i.channel || '').trim(), label = '';
        if (/^[CG][A-Z0-9]{6,}$/.test(ch)) label = allowed.get(ch) || '';
        else if (!ch || /^(our|the)?\s*(internal|team|brand|usual)?\s*(channel)?$/i.test(ch)) { ch = a?.slack_channel || sc || ''; label = allowed.get(ch) || ''; }
        else {
          /* A name: look it up once in Slack's channel list. */
          const want = ch.replace(/^#/, '').toLowerCase();
          const r = await d.slack(env, 'conversations.list', { limit: 1000, exclude_archived: true, types: 'public_channel,private_channel' });
          const hit = (r?.channels || []).find(c => String(c.name).toLowerCase() === want);
          if (!hit) return { error: `No Slack channel called #${want} that the bot can see.` };
          ch = hit.id; label = allowed.get(ch) ? `#${hit.name}` : '';
        }
        if (!ch) return { error: `${a ? a.name : 'That'} has no internal channel set. Name a channel.` };
        if (!allowed.has(ch)) return { error: 'Scheduled answers only go to an internal channel (a brand\'s internal channel or the Strategist\'s channel), never a client channel. Pick one of those.' };
        const H = `${hour % 12 === 0 ? 12 : hour % 12}${hour < 12 ? 'am' : 'pm'}`;
        const when = cadence === 'daily' ? 'every morning' : cadence === 'monday' ? 'every Monday' : 'on the 1st of the month';
        return { summary: i.summary || `Ask "${clip(i.question, 60)}" ${when}`,
          detail: `"${clip(i.question, 400)}"\n${a ? a.name : 'All brands'} · ${when} at ${H} Central · posts to ${label || ch}. It lands in Locus under Settings > The Strategist > Scheduled questions, where it can be run now, changed or deleted.`,
          request: { method: 'PUT', path: '/api/ask/schedules', body: { question: clip(i.question, 600), act: a ? a.act_id : 'all', cadence, hour_central: hour, channel: ch } } };
      }), done: () => 'Scheduled. It is in Locus under Settings > The Strategist > Scheduled questions.' }),
    /* Stock actions (2026-10-08): written through /api/supply/* on this worker, which forwards to the Supply
       worker with its own token. Each is a proposal a person applies, like every other action. */
    routeAction({ name: 'log_order',
      description: 'Log a factory purchase order on a brand we buy for (Lucky): the factory, products with quantities (split across sizes by the brand\'s own suggestion or size mix), placed date and expected landing. status sent = placed (counts as stock on the way), draft = not placed.',
      input_schema: { type: 'object', properties: { brand: { type: 'string' }, factory: { type: 'string', description: 'Factory name as in the stock view (orders)' },
        lines: { type: 'array', items: { type: 'object', properties: { product: { type: 'string', description: 'Product name or id' }, qty: { type: 'number' } }, required: ['product', 'qty'] } },
        placed: { type: 'string', description: 'YYYY-MM-DD, default today' }, lands: { type: 'string', description: 'YYYY-MM-DD, default from the lead time' }, status: { type: 'string', enum: ['sent', 'draft'] }, notes: { type: 'string' } }, required: ['brand', 'lines'] },
      describe: safe(async (env, i) => {
        const a = await brandOr(env, i.brand); const b = await supplyBrandOf(env, a.act_id);
        if (!b || !b.buys) return { error: `${a.name} is not a brand we buy stock for.` };
        const st = await supplyFetch(env, '/api/state', { brand: b.id });
        const find = q => st.products.find(p => String(p.id) === String(q)) || st.products.find(p => p.title.toLowerCase() === String(q).toLowerCase()) || st.products.find(p => p.title.toLowerCase().includes(String(q).toLowerCase()));
        const out = [], miss = [];
        for (const l of i.lines || []) {
          const p = find(l.product); if (!p) { miss.push(l.product); continue; }
          const base = p.variants.map(v => Math.max(0, v.suggested || 0)); const sum = base.reduce((x, y) => x + y, 0);
          const curve = (st.lines.find(x => x.id === p.lineId) || {}).sizeCurve || {};
          const sh = p.variants.map((v, k) => sum ? base[k] / sum : (curve[v.sizeKey] ?? 1 / p.variants.length)); const m = sh.reduce((x, y) => x + y, 0) || 1;
          p.variants.forEach((v, k) => { const q = Math.round(Number(l.qty) * sh[k] / m); if (q > 0) out.push({ variant_id: v.id, product_id: p.id, qty: q, unit_cost: v.cost ?? p.cost ?? null, _t: p.title, _a: v.axis || v.sku }); });
        }
        if (miss.length) return { error: `No product called ${miss.join(', ')}. The stock view lists them.` };
        if (!out.length) return { error: 'Every quantity is zero.' };
        const f = i.factory ? st.factories.find(x => x.name.toLowerCase().includes(String(i.factory).toLowerCase())) : st.factories.find(x => x.id === (find(i.lines[0].product) || {}).factoryId);
        const lead = Math.max(0, ...i.lines.map(l => (find(l.product) || {}).leadDays || 0));
        const placed = /^\d{4}-\d{2}-\d{2}$/.test(i.placed || '') ? i.placed : st.today;
        const lands = /^\d{4}-\d{2}-\d{2}$/.test(i.lands || '') ? i.lands : new Date(Date.parse(placed + 'T12:00:00Z') + lead * 864e5).toISOString().slice(0, 10);
        const status = i.status === 'draft' ? 'draft' : 'sent';
        return { summary: `${status === 'draft' ? 'Draft order' : 'Order'} to ${f ? f.name : 'a factory'}: ${out.reduce((x, l) => x + l.qty, 0)} units`, detail: `${a.name} · placed ${placed} · lands ${lands}\n${out.map(l => `${l._t} ${l._a || ''}: ${l.qty}`).join('\n')}`,
          request: { method: 'POST', path: `/api/supply/orders?brand=${b.id}`, body: { factory_id: f ? f.id : null, status, sent_at: placed, expected_at: lands, notes: i.notes || '', lines: out.map(({ _t, _a, ...l }) => l) } } };
      }), done: r => `Logged ${r.id || 'the order'}. It shows on Products, Buying.` }),
    routeAction({ name: 'update_order',
      description: 'Move a factory order along on a brand we buy for: its stage (placed, production, shipped, landed, cancelled), expected landing date, tracking or a note. Landed marks every line fully received.',
      input_schema: { type: 'object', properties: { brand: { type: 'string' }, id: { type: 'string', description: 'Order id, e.g. PO-0001' }, stage: { type: 'string', enum: ['placed', 'production', 'shipped', 'landed', 'cancelled'] }, lands: { type: 'string', description: 'YYYY-MM-DD' }, tracking: { type: 'string' }, note: { type: 'string' } }, required: ['brand', 'id'] },
      describe: safe(async (env, i) => {
        const a = await brandOr(env, i.brand); const b = await supplyBrandOf(env, a.act_id);
        if (!b || !b.buys) return { error: `${a.name} is not a brand we buy stock for.` };
        const st = await supplyFetch(env, '/api/state', { brand: b.id });
        const o = st.orders.find(x => x.id.toLowerCase() === String(i.id).toLowerCase()); if (!o) return { error: `No order ${i.id}. Orders: ${st.orders.map(x => x.id).join(', ') || 'none'}.` };
        const body = {}, said = [];
        if (i.stage) { body.status = i.stage === 'placed' ? 'sent' : i.stage; said.push(`stage ${i.stage}`); if (i.stage === 'landed') body.lines = o.lines.map(l => ({ variant_id: l.variant_id, product_id: l.product_id, qty: l.qty, received: l.qty, unit_cost: l.unit_cost })); }
        if (/^\d{4}-\d{2}-\d{2}$/.test(i.lands || '')) { body.expected_at = i.lands; said.push(`lands ${i.lands}`); }
        if (i.tracking != null) { body.tracking = i.tracking; said.push('tracking'); }
        if (i.note != null) { body.notes = i.note; said.push('note'); }
        if (!said.length) return { error: 'Nothing to change.' };
        return { summary: `${o.id}: ${said.join(', ')}`, detail: `${a.name} · ${o.factoryName || 'factory'} · ${o.units} units · ${o.productTitles.join(', ')}`, request: { method: 'PUT', path: `/api/supply/orders/${encodeURIComponent(o.id)}?brand=${b.id}`, body } };
      }), done: () => 'Updated. It shows on Products, Buying.' }),
    routeAction({ name: 'set_product',
      description: 'Change how stock treats one product: kind (core, drop = a one-off that never asks for a reorder, winding_down, discontinued), keep or cut on its group\'s plan, or a note.',
      input_schema: { type: 'object', properties: { brand: { type: 'string' }, product: { type: 'string' }, kind: { type: 'string', enum: ['core', 'drop', 'winding_down', 'discontinued'] }, decision: { type: 'string', enum: ['keep', 'cut', 'rule'] }, note: { type: 'string' } }, required: ['brand', 'product'] },
      describe: safe(async (env, i) => {
        const a = await brandOr(env, i.brand); const b = await supplyBrandOf(env, a.act_id);
        if (!b) return { error: `${a.name} has no stock feed.` };
        const st = await supplyFetch(env, '/api/state', { brand: b.id });
        const q = String(i.product).toLowerCase(); const p = st.products.find(x => String(x.id) === String(i.product)) || st.products.find(x => x.title.toLowerCase() === q) || st.products.find(x => x.title.toLowerCase().includes(q));
        if (!p) return { error: `No product called ${i.product}.` };
        const body = {}; if (i.kind) body.lifecycle = i.kind; if (i.decision) body.decision = i.decision === 'rule' ? null : i.decision; if (i.note != null) body.notes = i.note;
        if (!Object.keys(body).length) return { error: 'Nothing to change.' };
        return { summary: `${p.title}: ${[i.kind && `kind ${i.kind.replace('_', ' ')}`, i.decision && (i.decision === 'rule' ? 'back to the rule' : i.decision), i.note != null && 'note'].filter(Boolean).join(', ')}`, detail: `${a.name}`, request: { method: 'PUT', path: `/api/supply/products/${p.id}?brand=${b.id}`, body } };
      }), done: () => 'Saved.' }),
    routeAction({ name: 'add_design',
      description: 'Add new designs to a drop on a brand that designs its own products (Lucky): the group (Polos, Hats...), the drop (existing name, or a new name plus its on-site date) and how many. Each gets its Asana card and every date worked back from the drop.',
      input_schema: { type: 'object', properties: { brand: { type: 'string' }, group: { type: 'string' }, drop: { type: 'string' }, drop_date: { type: 'string', description: 'YYYY-MM-DD, only for a new drop' }, count: { type: 'number' } }, required: ['brand', 'group', 'drop'] },
      describe: safe(async (env, i) => {
        const a = await brandOr(env, i.brand); const b = await supplyBrandOf(env, a.act_id);
        if (!b || !b.makes) return { error: `${a.name} does not have Drops switched on.` };
        const st = await supplyFetch(env, '/api/state', { brand: b.id });
        const l = st.lines.find(x => x.name.toLowerCase() === String(i.group).toLowerCase()) || st.lines.find(x => x.name.toLowerCase().includes(String(i.group).toLowerCase().replace(/s$/, '')));
        if (!l) return { error: `No group called ${i.group}. Groups: ${st.lines.map(x => x.name).join(', ')}.` };
        const c = (st.collections || []).find(x => x.name.toLowerCase() === String(i.drop).toLowerCase());
        if (!c && !/^\d{4}-\d{2}-\d{2}$/.test(i.drop_date || '')) return { error: `No drop called ${i.drop}. Give its on-site date to make it.` };
        const n = Math.min(10, Math.max(1, Math.round(+i.count || 1)));
        if (!c) return { summary: `New drop ${i.drop} (${i.drop_date}), then add ${n} ${l.name.toLowerCase()}`, detail: 'Apply makes the drop; ask again to add the designs to it.', request: { method: 'POST', path: `/api/supply/collections?brand=${b.id}`, body: { name: i.drop, drop_at: i.drop_date } } };
        const have = st.slots.filter(x => x.collection_id === c.id && x.line_id === l.id).length;
        return { summary: `Add ${n} ${l.name.toLowerCase()} to ${c.name}`, detail: `On the site ${c.drop_at}. Each gets an Asana card.`, request: { method: 'POST', path: `/api/supply/slots?brand=${b.id}`, body: { line_id: l.id, collection_id: c.id, name: `${c.name} · ${l.name.replace(/s$/, '')} ${have + 1}`, status: 'needs_brief', _count: n } } };
      }), done: () => 'Added. They show on Products, Drops.' }),
    /* The calendar (2026-10-09, calendar.js): proposals a person applies, through the calendar routes on this worker. */
    routeAction({ name: 'add_date',
      description: 'Put a date on a brand\'s Locus calendar: a drop or launch, a sale or offer, an ad push, a site change or other (teaser, list build, contest). Its countdown (photos, briefs, build, email, ads loaded) is worked out from the go-live date.',
      input_schema: { type: 'object', properties: { brand: { type: 'string' }, name: { type: 'string' }, kind: { type: 'string', enum: ['drop', 'sale', 'adpush', 'site', 'other'] },
        start: { type: 'string', description: 'YYYY-MM-DD, the day customers see it' }, end: { type: 'string', description: 'YYYY-MM-DD; leave out for a one-day drop; a sale should have one' },
        teaser: { type: 'string', description: 'YYYY-MM-DD the teaser starts, optional' }, offer: { type: 'string', description: 'What the customer sees, in their words' },
        status: { type: 'string', enum: ['pencilled', 'confirmed'] }, channels: { type: 'array', items: { type: 'string', enum: ['paid', 'email', 'sms', 'organic'] } }, assets: { type: 'string', description: 'Photos link (https)' } },
        required: ['brand', 'name', 'kind', 'start'] },
      describe: safe(async (env, i) => {
        const a = await brandOr(env, i.brand);
        if (!/^\d{4}-\d{2}-\d{2}$/.test(i.start || '')) return { error: 'The go-live date must be YYYY-MM-DD.' };
        const body = { act: a.act_id, name: String(i.name).slice(0, 120), kind: i.kind, start: i.start, end: i.end || (i.kind === 'sale' ? null : i.start), teaser: i.teaser || null, offer: i.offer || '', status: i.status === 'confirmed' ? 'conf' : 'pen', channels: i.channels && i.channels.length ? i.channels : ['paid', 'email'], assets: i.assets || null };
        return { summary: `${a.name}: ${body.name}, ${i.kind} on ${i.start}${body.end && body.end !== i.start ? ` to ${body.end}` : i.kind === 'sale' ? ' (no end date)' : ''}`, detail: `${i.offer || 'No offer text yet.'}\n${body.status === 'conf' ? 'Confirmed' : 'Pencilled'} · ${body.channels.join(', ')}`,
          request: { method: 'POST', path: '/api/calendar/event', body } };
      }), done: () => 'Added. It is on the Locus calendar with its countdown.' }),
    routeAction({ name: 'move_date',
      description: 'Move a typed date on a brand\'s calendar to a new go-live day; its end, teaser and photos date move by the same number of days. Not for Black Friday phases (edit those on the season page).',
      input_schema: { type: 'object', properties: { brand: { type: 'string' }, name: { type: 'string', description: 'The date\'s name as on the calendar' }, start: { type: 'string', description: 'YYYY-MM-DD' } }, required: ['brand', 'name', 'start'] },
      describe: safe(async (env, i) => {
        const a = await brandOr(env, i.brand); const e = await calFind(env, a, i.name);
        if (!/^\d{4}-\d{2}-\d{2}$/.test(i.start || '')) return { error: 'The new date must be YYYY-MM-DD.' };
        return { summary: `${a.name}: move ${e.name} from ${e.start} to ${i.start}`, detail: 'Every date on it moves by the same number of days.', request: { method: 'POST', path: '/api/calendar/move', body: { id: e.id, start: i.start } } };
      }), done: () => 'Moved. The calendar and its countdown follow.' }),
    routeAction({ name: 'end_date',
      description: 'Set the end of a sale or offer on a brand\'s calendar (also "it ended today").',
      input_schema: { type: 'object', properties: { brand: { type: 'string' }, name: { type: 'string' }, date: { type: 'string', description: 'YYYY-MM-DD' } }, required: ['brand', 'name', 'date'] },
      describe: safe(async (env, i) => {
        const a = await brandOr(env, i.brand); const e = await calFind(env, a, i.name);
        return { summary: `${a.name}: ${e.name} ends ${i.date}`, detail: `Live since ${e.start}.`, request: { method: 'POST', path: '/api/calendar/end', body: { id: e.id, date: i.date } } };
      }), done: () => 'Saved. The calendar shows the end.' }),
    routeAction({ name: 'make_asana_tasks',
      description: 'Make the Asana tasks for a typed date: one task per countdown step (briefed, built, email, loaded) in the brand\'s Asana project, due on the step\'s date. Completing them ticks the calendar.',
      input_schema: { type: 'object', properties: { brand: { type: 'string' }, name: { type: 'string' } }, required: ['brand', 'name'] },
      describe: safe(async (env, i) => {
        const a = await brandOr(env, i.brand); const e = await calFind(env, a, i.name);
        const steps = (e.steps || []).filter(s => ['briefs', 'built', 'email', 'loaded'].includes(s.key) && !s.asana);
        if (!steps.length) return { error: `${e.name} already has its Asana tasks, or has no work steps left.` };
        return { summary: `${a.name}: Asana tasks for ${e.name}`, detail: steps.map(s => `${e.name}: ${s.label.toLowerCase()}, due ${s.due}`).join('\n'), request: { method: 'POST', path: '/api/calendar/asana', body: { id: e.id } } };
      }), done: r => `Made ${r && r.made != null ? r.made : 'the'} Asana tasks.` }),
    routeAction({ name: 'log_change',
      description: 'Write a change into a brand\'s change log by hand (the Changes tab): what was done on the account and why, so the brief and the team see it. Use it when someone says "log that we ...".',
      input_schema: { type: 'object', properties: { brand: { type: 'string' }, summary: { type: 'string', description: 'What changed, one line.' }, reason: { type: 'string' },
        category: { type: 'string', enum: ['budget', 'new_campaign', 'campaign_paused', 'campaign_relaunched', 'bid_strategy', 'targeting', 'creative', 'other'] }, when: { type: 'string', description: "ISO date-time, default now" } }, required: ['brand', 'summary'] },
      describe: safe(async (env, i) => {
        const a = await brandOr(env, i.brand);
        return { summary: `Log on ${a.name}: ${i.summary}`, detail: `${i.category || 'other'} · ${i.summary}${i.reason ? `\nWhy: ${i.reason}` : ''}`,
          request: { method: 'POST', path: '/api/activities', body: { act_id: a.act_id, summary: i.summary, reason: i.reason || null, category: i.category || 'other', event_time: i.when || undefined, actor: 'the Strategist, for the team' } } };
      }), done: () => 'Logged.' }),
    routeAction({ name: 'redraft_brief',
      description: 'Write a brand\'s Daily Brief again, optionally steered ("lead with the Google drop", "shorter"). It goes to the INTERNAL review queue as a draft; nothing is sent to the client.',
      input_schema: { type: 'object', properties: { brand: { type: 'string' }, date: { type: 'string', description: "'YYYY-MM-DD', default yesterday" }, steer: { type: 'string' }, summary: { type: 'string' } }, required: ['brand', 'summary'] },
      describe: safe(async (env, i) => {
        const a = await brandOr(env, i.brand);
        return { summary: i.summary, detail: `Redraft ${a.name}'s brief${i.date ? ` for ${i.date}` : ''}${i.steer ? `, steered: "${i.steer}"` : ''}. It lands in the review queue; a person still sends it.`,
          request: { method: 'POST', path: '/api/brief-draft', body: { act: a.act_id, date: i.date || undefined, steer: i.steer || undefined } } };
      }), done: () => 'Draft written. It is waiting in the review queue.' }),
    routeAction({ name: 'draft_report',
      description: 'Generate a weekly or monthly client report as a DRAFT for review (the Reports tab). Default: the last complete period. Nothing is sent to the client.',
      input_schema: { type: 'object', properties: { brand: { type: 'string' }, period: { type: 'string', enum: ['weekly', 'monthly'] }, start: { type: 'string', description: "'YYYY-MM-DD', optional" }, summary: { type: 'string' } }, required: ['brand', 'summary'] },
      describe: safe(async (env, i) => {
        const a = await brandOr(env, i.brand);
        return { summary: i.summary, detail: `Draft ${a.name}'s ${i.period || 'weekly'} report${i.start ? ` from ${i.start}` : ' for the last complete period'}. It waits for review; nothing reaches the client.`,
          request: { method: 'POST', path: '/api/report-generate', body: { act: a.act_id, period: i.period || 'weekly', start: i.start || undefined } } };
      }), done: () => 'Report drafted for review.' }),
  ];
};

const ACTIONS = (d) => {
  /* Every brand (brand_accounts: act_id = the brand id). A brand with no Meta ad account (meta_act null)
     is marked no_meta so the views say its Meta numbers do not exist instead of showing zeros. */
  const allAccounts = async (env, activeOnly) => (await d.listAccounts(env, activeOnly)).map(a => a.meta_act ? a : { ...a, no_meta: true });
  const resolve = async (env, want) => {
    const accounts = await allAccounts(env, false);
    const w = String(want || '').toLowerCase().trim();
    const id = await resolveBrandId(env, String(want || '').trim());
    return accounts.find(a => a.act_id === id || a.meta_act === want) || accounts.find(a => a.name.toLowerCase() === w) || accounts.find(a => a.name.toLowerCase().includes(w)) || null;
  };
  return [
    { name: 'set_goals',
      description: 'Set the monthly goals the Daily Brief paces against for one brand: sales, spend, aMER, contribution margin percent. Any field left out keeps its value. Look at the plan view first.',
      input_schema: { type: 'object', properties: {
        brand: { type: 'string' }, month: { type: 'string', description: "'YYYY-MM', or 'default' for the standing goals." },
        sales: { type: 'number' }, spend: { type: 'number' }, amer: { type: 'number' }, cm_pct: { type: 'number', description: 'e.g. 0.32 for 32%' },
        summary: { type: 'string' } }, required: ['brand', 'month', 'summary'] },
      propose: async (env, input) => {
        const acct = await resolve(env, input.brand); if (!acct) return { error: `No brand called "${input.brand}".` };
        const month = input.month === 'default' || /^\d{4}-\d{2}$/.test(input.month || '') ? input.month : null;
        if (!month) return { error: "month must be 'YYYY-MM' or 'default'." };
        const goals = d.safeJson(acct.goals_json, {}) || {};
        const cur = goals[month] || {};
        const next = { ...cur }; const lines = [];
        for (const k of ['sales', 'spend', 'amer', 'cm_pct']) if (input[k] !== undefined) { next[k] = Number(input[k]); lines.push(`${k} ${cur[k] ?? 'unset'} → ${next[k]}`); }
        if (!lines.length) return { error: 'Nothing to change.' };
        return { summary: input.summary, detail: `${acct.name}, ${month}: ${lines.join(', ')}.`, patch: { act_id: acct.act_id, month, goals: next } };
      },
      apply: async (env, patch) => {
        const row = await env.DB.prepare('SELECT goals_json FROM brands WHERE id = ?1').bind(patch.act_id).first();
        const goals = d.safeJson(row?.goals_json, {}) || {};
        goals[patch.month] = patch.goals;
        await env.DB.prepare(`UPDATE brands SET goals_json = ?2, updated_at = datetime('now') WHERE id = ?1`).bind(patch.act_id, JSON.stringify(goals)).run();
        return { ok: true, note: 'Goals updated. The next brief paces against them.' };
      } },

    { name: 'set_brand_context',
      description: 'Write or extend what the Strategist knows about a brand for creative work (who buys, why, the voice, the products, the claims, the KPIs). Use it when Cole tells you something about a brand that should shape every future angle.',
      input_schema: { type: 'object', properties: {
        brand: { type: 'string' }, text: { type: 'string', description: 'The context, in plain prose.' },
        mode: { type: 'string', enum: ['append', 'replace'], description: 'append (default) adds a paragraph; replace rewrites the whole thing.' },
        summary: { type: 'string' } }, required: ['brand', 'text', 'summary'] },
      propose: async (env, input) => {
        const acct = await resolve(env, input.brand); if (!acct) return { error: `No brand called "${input.brand}".` };
        return { summary: input.summary, detail: `${acct.name}: ${input.mode === 'replace' ? 'replace the brand context with' : 'add to the brand context'}: "${clip(input.text, 300)}${String(input.text).length > 300 ? '…' : ''}"`,
          patch: { act_id: acct.act_id, text: clip(input.text, 12000), mode: input.mode || 'append' } };
      },
      apply: async (env, patch) => {
        const key = `brandContext:${patch.act_id}`;
        const cur = (await d.getSetting(env, key)) || '';
        await d.putSetting(env, key, patch.mode === 'replace' || !cur ? patch.text : cur + '\n\n' + patch.text);
        return { ok: true, note: 'Brand context updated.' };
      } },

    { name: 'archive_angles',
      description: 'Take angles off the brand\'s hub (they become drafts, not deleted): everything whose title, argument, products or section matches a theme, e.g. "Halloween". A dated section left empty is switched off. Read the angles view first so you can name what will go.',
      input_schema: { type: 'object', properties: {
        brand: { type: 'string' }, matching: { type: 'string', description: 'A theme, a section name, or a word from the titles.' },
        ids: { type: 'array', items: { type: 'string' }, description: 'Exact angle ids instead of a match, when you have them.' },
        summary: { type: 'string' } }, required: ['brand', 'summary'] },
      propose: async (env, input) => {
        const acct = await resolve(env, input.brand); if (!acct) return { error: `No brand called "${input.brand}".` };
        const { results: angs } = await env.DB.prepare(`SELECT a.id, a.title, a.products, a.argument, a.section_id, s.name AS section FROM p_amb_angle a LEFT JOIN p_amb_section s ON s.id = a.section_id WHERE a.act_id = ?1 AND a.status = 'live'`).bind(acct.act_id).all();
        const w = String(input.matching || '').toLowerCase().trim();
        const hit = (input.ids?.length ? (angs || []).filter(x => input.ids.includes(x.id))
          : w ? (angs || []).filter(x => [x.title, x.products, x.argument, x.section].some(v => String(v || '').toLowerCase().includes(w))) : []);
        if (!hit.length) return { error: `No live angle matches "${input.matching || (input.ids || []).join(', ')}".` };
        const secs = [...new Set(hit.map(x => x.section_id).filter(Boolean))].filter(sid => (angs || []).filter(x => x.section_id === sid).every(x => hit.some(h => h.id === x.id)));
        return { summary: input.summary, detail: `${acct.name}: archive ${hit.length} angle${hit.length > 1 ? 's' : ''}: ${hit.map(x => x.title).join('; ')}.${secs.length ? ` The section${secs.length > 1 ? 's' : ''} left empty (${[...new Set(hit.filter(x => secs.includes(x.section_id)).map(x => x.section))].join(', ')}) will be switched off.` : ''}`,
          patch: { act_id: acct.act_id, ids: hit.map(x => x.id), sections: secs } };
      },
      apply: async (env, patch) => {
        for (const id of patch.ids) await env.DB.prepare(`UPDATE p_amb_angle SET status = 'draft', hot = 0, updated_at = datetime('now') WHERE id = ?1 AND act_id = ?2`).bind(id, patch.act_id).run();
        for (const sid of patch.sections || []) await env.DB.prepare(`UPDATE p_amb_section SET enabled = 0 WHERE id = ?1 AND act_id = ?2`).bind(sid, patch.act_id).run();
        return { ok: true, note: `${patch.ids.length} archived${patch.sections?.length ? `, ${patch.sections.length} section${patch.sections.length > 1 ? 's' : ''} off` : ''}.` };
      } },

    { name: 'edit_angle',
      description: 'Change ONE live angle on a brand\'s hub: pin it to Hot right now or unpin it, rename it, rewrite its argument, who, products, format, openers, on-screen text, do or don\'t. Find it by title. Read the angles view first.',
      input_schema: { type: 'object', properties: { brand: { type: 'string' }, angle: { type: 'string', description: 'Its title, or enough of it.' }, hot: { type: 'boolean' },
        title: { type: 'string' }, argument: { type: 'string' }, who: { type: 'string' }, products: { type: 'string' }, format: { type: 'string' },
        openers: { type: 'array', items: { type: 'string' } }, on_screen: { type: 'string' }, do_text: { type: 'string' }, dont_text: { type: 'string' }, summary: { type: 'string' } }, required: ['brand', 'angle', 'summary'] },
      propose: async (env, input) => {
        const acct = await resolve(env, input.brand); if (!acct) return { error: `No brand called "${input.brand}".` };
        const w = String(input.angle || '').toLowerCase();
        const { results } = await env.DB.prepare(`SELECT id, title FROM p_amb_angle WHERE act_id = ?1 AND status = 'live'`).bind(acct.act_id).all();
        const hits = (results || []).filter(x => x.title.toLowerCase().includes(w));
        if (!hits.length) return { error: `No live angle called "${input.angle}".` };
        if (hits.length > 1) return { error: `"${input.angle}" matches ${hits.length} angles: ${hits.map(x => x.title).join('; ')}. Be more specific.` };
        const patch = { act_id: acct.act_id, id: hits[0].id, set: {} }, lines = [];
        const map = { title: 'title', argument: 'argument', who: 'who', products: 'products', format: 'format', on_screen: 'on_screen', do_text: 'do_text', dont_text: 'dont_text' };
        for (const [k, col] of Object.entries(map)) if (input[k] !== undefined) { patch.set[col] = clip(input[k], 400); lines.push(`${k} → ${clip(input[k], 80)}`); }
        if (input.openers) { patch.set.openers_json = JSON.stringify(input.openers.slice(0, 5).map(o => clip(o, 200))); lines.push(`${input.openers.length} new openers`); }
        if (input.hot !== undefined) { patch.set.hot = input.hot ? 1 : 0; lines.push(input.hot ? 'pinned to Hot right now' : 'unpinned from Hot'); }
        if (!lines.length) return { error: 'Nothing to change.' };
        return { summary: input.summary, detail: `${acct.name}, "${hits[0].title}": ${lines.join('; ')}.`, patch };
      },
      apply: async (env, patch) => {
        const cols = Object.keys(patch.set);
        await env.DB.prepare(`UPDATE p_amb_angle SET ${cols.map((c, i) => `${c} = ?${i + 3}`).join(', ')}, updated_at = datetime('now') WHERE id = ?1 AND act_id = ?2`)
          .bind(patch.id, patch.act_id, ...cols.map(c => patch.set[c])).run();
        return { ok: true, note: 'Angle updated on the hub.' };
      } },

    { name: 'edit_section',
      description: 'Change one section of a brand\'s hub: rename it, change its one-line subtitle, or switch it on or off.',
      input_schema: { type: 'object', properties: { brand: { type: 'string' }, section: { type: 'string' }, name: { type: 'string' }, line: { type: 'string' }, enabled: { type: 'boolean' }, summary: { type: 'string' } }, required: ['brand', 'section', 'summary'] },
      propose: async (env, input) => {
        const acct = await resolve(env, input.brand); if (!acct) return { error: `No brand called "${input.brand}".` };
        const w = String(input.section || '').toLowerCase();
        const { results } = await env.DB.prepare(`SELECT id, name, line, enabled FROM p_amb_section WHERE act_id = ?1`).bind(acct.act_id).all();
        const sec = (results || []).find(x => x.name.toLowerCase() === w) || (results || []).find(x => x.name.toLowerCase().includes(w));
        if (!sec) return { error: `No section called "${input.section}".` };
        const patch = { act_id: acct.act_id, id: sec.id, name: input.name ?? sec.name, line: input.line ?? sec.line, enabled: input.enabled === undefined ? sec.enabled : (input.enabled ? 1 : 0) };
        return { summary: input.summary, detail: `${acct.name}, section "${sec.name}"${input.name ? ` → "${input.name}"` : ''}${input.line !== undefined ? `, line "${input.line}"` : ''}${input.enabled !== undefined ? (input.enabled ? ', on' : ', off') : ''}.`, patch };
      },
      apply: async (env, p) => {
        await env.DB.prepare(`UPDATE p_amb_section SET name = ?3, line = ?4, enabled = ?5 WHERE id = ?1 AND act_id = ?2`).bind(p.id, p.act_id, clip(p.name, 60), clip(p.line, 120), p.enabled).run();
        return { ok: true, note: 'Section updated.' };
      } },

    /* 2026-10-09: Fela (Ice & Gold) asked to drop a line from "Who we are talking to" and asked what "What it is"
       was for. Nothing could edit the page's own text: the request went to the ideas bot and died as "No draft yet". */
    { name: 'edit_creator_page',
      description: 'Change the creator link PAGE text for a brand (not an angle): intro (top of What to film), about ("What it is", the product overview creators read), audience ("Who we are talking to"), rules ("Before you film" claim and filming rules), avoid ("please stop filming these"). Each field you pass REPLACES that field whole, so read the angles view first, start from the current text and change only what was asked (e.g. drop one sentence, keep the rest word for word). Use it when a client or Cole asks to edit, remove or reword something on the creator link.',
      input_schema: { type: 'object', properties: {
        brand: { type: 'string' }, intro: { type: 'string' }, about: { type: 'string' }, audience: { type: 'string' },
        rules: { type: 'array', items: { type: 'string' } },
        avoid: { type: 'array', items: { type: 'object', properties: { title: { type: 'string' }, why: { type: 'string' } }, required: ['title'] } },
        summary: { type: 'string' } }, required: ['brand', 'summary'] },
      propose: async (env, input) => {
        const acct = await resolve(env, input.brand); if (!acct) return { error: `No brand called "${input.brand}".` };
        const cur = await env.DB.prepare(`SELECT intro, about, audience, avoid_json, rules_json FROM p_amb_brand WHERE act_id = ?1`).bind(acct.act_id).first();
        if (!cur) return { error: `${acct.name} has no creator link yet.` };
        const set = {}, lines = [];
        const label = { intro: 'Intro', about: 'What it is', audience: 'Who we are talking to' };
        for (const k of ['intro', 'about', 'audience']) if (input[k] !== undefined && String(input[k]).trim() !== String(cur[k] || '').trim()) {
          set[k] = clip(String(input[k]).trim(), 2000);
          lines.push(`${label[k]}\n  before: ${clip(cur[k] || '(empty)', 600)}\n  after:  ${clip(set[k] || '(empty)', 600)}`);
        }
        if (input.rules) { set.rules_json = JSON.stringify(input.rules.map(r => clip(String(r).trim(), 400)).filter(Boolean).slice(0, 20)); lines.push(`Before you film: ${d.safeJson(cur.rules_json, []).length} rules → ${JSON.parse(set.rules_json).length}`); }
        if (input.avoid) { set.avoid_json = JSON.stringify(input.avoid.filter(x => x?.title).slice(0, 20).map(x => ({ title: clip(x.title, 200), why: clip(x.why || '', 400) }))); lines.push(`Stop filming: ${d.safeJson(cur.avoid_json, []).length} → ${JSON.parse(set.avoid_json).length}`); }
        if (!lines.length) return { error: 'Nothing changes: the text you gave is what the page already says.' };
        return { summary: input.summary, detail: `${acct.name} creator link:\n${lines.join('\n')}`, patch: { act_id: acct.act_id, set } };
      },
      apply: async (env, patch) => {
        const cols = Object.keys(patch.set);
        await env.DB.prepare(`UPDATE p_amb_brand SET ${cols.map((c, i) => `${c} = ?${i + 2}`).join(', ')}, updated_at = datetime('now') WHERE act_id = ?1`).bind(patch.act_id, ...cols.map(c => patch.set[c])).run();
        return { ok: true, note: 'The creator link page is updated; creators see it on their next load.' };
      } },

    { name: 'set_writing_style',
      description: 'Change HOW Daily Briefs or weekly/monthly reports are written from now on, when Cole says he does not like how they read ("lead with profit", "shorter", "stop mentioning Google", "no hedging", "always end with one action for the client"). Standing direction, for every brand or for one. It changes emphasis, order, length, tone and what is left out; it can never add a number. Read writing_style first. Structural changes (a new section, a new number, a different layout) are a code change: use hand_to_claude_code for those.',
      input_schema: { type: 'object', properties: {
        which: { type: 'string', enum: ['brief', 'report', 'both'] },
        brand: { type: 'string', description: 'Leave empty for every brand.' },
        text: { type: 'string', description: 'The direction, in plain sentences, written as instructions to the writer.' },
        mode: { type: 'string', enum: ['append', 'replace', 'clear'], description: 'append (default) adds to what is there; replace rewrites it; clear removes it.' },
        summary: { type: 'string' } }, required: ['which', 'summary'] },
      propose: async (env, input) => {
        const acct = input.brand ? await resolve(env, input.brand) : null;
        if (input.brand && !acct) return { error: `No brand called "${input.brand}".` };
        const kinds = input.which === 'both' ? ['brief', 'report'] : [input.which];
        const mode = input.mode || 'append';
        if (mode !== 'clear' && !String(input.text || '').trim()) return { error: 'Give the direction in text.' };
        const keys = kinds.map(k => acct ? `${k}Style:${acct.act_id}` : `${k}Style`);
        const now = await Promise.all(keys.map(k => d.getSetting(env, k)));
        const after = now.map(cur => mode === 'clear' ? '' : mode === 'replace' || !cur ? String(input.text).trim() : `${cur}\n${String(input.text).trim()}`);
        const who = acct ? acct.name : 'every brand';
        const what = kinds.map(k => k === 'brief' ? 'Daily Briefs' : 'weekly and monthly reports').join(' and ');
        return { summary: input.summary, detail: `${what}, ${who}: ${mode === 'clear' ? 'remove the standing direction' : mode === 'replace' ? 'replace the standing direction' : 'add to the standing direction'}. It takes effect from the next one written.`,
          preview: mode === 'clear' ? null : after[0].slice(0, 1200), patch: { keys, values: after } };
      },
      apply: async (env, patch) => {
        for (let i = 0; i < patch.keys.length; i++) await d.putSetting(env, patch.keys[i], patch.values[i] || '');
        return { ok: true, note: 'Saved. The next brief or report is written this way.' };
      } },

    { name: 'set_report_sections',
      description: 'Switch channel sections in a brand\'s weekly/monthly reports on or off (meta, google, tiktok, amazon, pinterest, email), or stop drafting the weekly or monthly report for that brand altogether.',
      input_schema: { type: 'object', properties: { brand: { type: 'string' }, hide: { type: 'array', items: { type: 'string', enum: ['meta', 'google', 'tiktok', 'amazon', 'pinterest', 'email'] }, description: 'The full list of sections to leave out.' },
        weekly: { type: 'boolean' }, monthly: { type: 'boolean' }, summary: { type: 'string' } }, required: ['brand', 'summary'] },
      propose: async (env, input) => {
        const acct = await resolve(env, input.brand); if (!acct) return { error: `No brand called "${input.brand}".` };
        const cfg = d.safeJson(acct.report_config_json, {}) || {};
        const next = { ...cfg }, lines = [];
        if (input.hide) { next.hide = input.hide; lines.push(input.hide.length ? `leave out: ${input.hide.join(', ')}` : 'show every section'); }
        if (input.weekly !== undefined) { next.weekly = !!input.weekly; lines.push(`weekly report ${input.weekly ? 'on' : 'off'}`); }
        if (input.monthly !== undefined) { next.monthly = !!input.monthly; lines.push(`monthly report ${input.monthly ? 'on' : 'off'}`); }
        if (!lines.length) return { error: 'Nothing to change.' };
        return { summary: input.summary, detail: `${acct.name}: ${lines.join(', ')}. From the next report drafted.`, patch: { act_id: acct.act_id, cfg: next } };
      },
      apply: async (env, patch) => {
        await env.DB.prepare(`UPDATE brands SET report_config_json = ?2, updated_at = datetime('now') WHERE id = ?1`).bind(patch.act_id, JSON.stringify(patch.cfg)).run();
        return { ok: true, note: 'Report sections updated.' };
      } },

    { name: 'create_angles',
      description: 'Write new angles for a brand\'s hub from the evidence (brand context, what sold, the current angles) using Mobius\'s Angle / Concept / Testing framework, and put them in a section (existing by name, or a new one). The proposal shows every angle in full for review before anything is published. Use it for "make N angles for X".',
      input_schema: { type: 'object', properties: {
        brand: { type: 'string' }, theme: { type: 'string', description: 'What the angles are for, e.g. "Black Friday", "gifting", "the new putter". Include any direction Cole gave.' },
        count: { type: 'integer', description: '1 to 10. Default 6.' },
        section: { type: 'string', description: 'The section they go in. An existing section name, or a new one (a dated window like "Black Friday" or a durable lane).' },
        section_line: { type: 'string', description: 'One line under the section name, for a new section.' },
        summary: { type: 'string' } }, required: ['brand', 'theme', 'section', 'summary'] },
      propose: async (env, input, h) => {
        const acct = await resolve(env, input.brand); if (!acct) return { error: `No brand called "${input.brand}".` };
        const n = Math.min(10, Math.max(1, Number(input.count) || 6));
        let context = (await d.getSetting(env, `brandContext:${acct.act_id}`)) || '';
        if (!context) { context = await deriveBrandContext(env, d, acct).catch(() => ''); if (context) await d.putSetting(env, `brandContext:${acct.act_id}`, context); }
        const hub = await env.DB.prepare(`SELECT intro, about, audience, avoid_json, rules_json FROM p_amb_brand WHERE act_id = ?1`).bind(acct.act_id).first();
        const { results: secs } = await env.DB.prepare(`SELECT id, name, line, enabled FROM p_amb_section WHERE act_id = ?1`).bind(acct.act_id).all();
        const { results: angs } = await env.DB.prepare(`SELECT a.title, a.argument, a.who, a.format, s.name AS section FROM p_amb_angle a LEFT JOIN p_amb_section s ON s.id = a.section_id WHERE a.act_id = ?1 AND a.status = 'live' ORDER BY a.sort LIMIT 60`).bind(acct.act_id).all();
        const to = d.localDate(acct.tz), from = d.addDays(to, -90);
        const { results: won } = await env.DB.prepare(`SELECT ad.name, SUM(t.revenue) AS rev, SUM(t.orders) AS ord FROM tw_ad_attr t JOIN ads ad ON ad.ad_id = t.ad_id AND ad.act_id IN ${metaOf(1)}
          WHERE t.act_id = ?1 AND t.model = 'lastPlatformClick' AND t.date >= ?2 AND t.date <= ?3 GROUP BY t.ad_id ORDER BY rev DESC LIMIT 15`).bind(acct.act_id, from, to).all();
        const existing = (secs || []).find(x => x.name.toLowerCase() === String(input.section).toLowerCase());
        const system = `You are the Strategist at Mobius Digital writing angles for ${acct.name}'s creator hub. Follow the framework exactly:
- An ANGLE is the argument: the reason to buy, one sentence, to a specific person, sayable at a bar. Not a persona, topic, feature or format.
- Each angle carries: title (short, punchy), argument (one sentence), who (who it is for), products (a few words), format (one: e.g. "Talking head", "Split screen", "Get ready with me", "Unboxing", "POV", "Static"), lever (the psychological lever, staff only), openers (3 first lines that stop the scroll, in the customer's words), shots (3 to 5 {label, text}), on_screen (the text overlay), do (one line), dont (one line).
- Angles must be genuinely different arguments, not one argument in five formats. No two may share a lever and a who.
- Evidence first: the ads that sold tell you which arguments work for this brand. Build on them; do not repeat a live angle.
- Plain English, the brand's voice, no jargon, no em dashes, no exclamation marks, no claims outside the rules.
- Use the BRAND BRAIN: every angle must rest on a persona, a customer quote, a past test result or a product fact from it; say which in "lever", after the lever itself, e.g. "Relief (test 399 won on the bachelorette crew)".

${SPECIFICITY}

Return ONLY a JSON array of ${n} objects with exactly those keys. No prose.`;
        const user = `THEME / DIRECTION: ${input.theme}\nSECTION: ${input.section}${existing ? ' (existing)' : ' (new)'}\n\nBRAND CONTEXT:\n${context || '(none written)'}\n\nHUB INTRO: ${hub?.intro || ''}\nABOUT: ${hub?.about || ''}\nAUDIENCE: ${hub?.audience || ''}\nAVOID: ${JSON.stringify(d.safeJson(hub?.avoid_json, []))}\nRULES: ${JSON.stringify(d.safeJson(hub?.rules_json, []))}\n\nLIVE ANGLES NOW (do not repeat):\n${(angs || []).map(a => `- [${a.section || 'no section'}] ${a.title}: ${a.argument || ''} (${a.who || ''}; ${a.format || ''})`).join('\n') || '(none)'}\n\nWHAT SOLD, LAST 90 DAYS (Triple Whale attributed; the ad name carries the angle and format):\n${(won || []).map(w => `- ${w.name}: $${Math.round(w.rev)} from ${w.ord} orders`).join('\n') || '(no attribution rows yet)'}`;
        let text;
        /* The brand brain (2026-09-29), cached; creator:false because the hub is already in the prompt. */
        const brain = await brandBrain(env, acct.act_id, { creator: false }).catch(() => ({ md: '' }));
        try { text = await d.claude(env, { system: brain.md ? [{ type: 'text', text: system }, brainBlock(brain.md)] : system, user, maxTokens: 6000 }); } catch (e) { return { error: 'The writer could not run: ' + e.message }; }
        const m = String(text || '').match(/\[[\s\S]*\]/);
        let list; try { list = JSON.parse(m ? m[0] : '[]'); } catch { return { error: 'The writer did not return a clean list. Try again, or narrow the theme.' }; }
        list = (Array.isArray(list) ? list : []).filter(x => x && x.title && x.argument).slice(0, n);
        if (!list.length) return { error: 'No usable angles came back. Try again with a narrower theme.' };
        const preview = list.map((x, i) => `${i + 1}. ${x.title}\n   ${x.argument}\n   For: ${x.who || ''} · ${x.format || ''} · ${x.products || ''}\n   Openers: ${(x.openers || []).slice(0, 3).map(o => `"${o}"`).join(' / ')}`).join('\n\n');
        return { summary: input.summary, detail: `${acct.name}: ${list.length} new angle${list.length > 1 ? 's' : ''} for ${input.section}${existing ? '' : ' (new section)'}. Review them below; Apply publishes them live on the hub.`, preview,
          patch: { act_id: acct.act_id, section: existing ? { id: existing.id } : { name: clip(input.section, 60), line: clip(input.section_line || input.theme, 120) }, angles: list } };
      },
      apply: async (env, patch) => {
        let sid = patch.section.id;
        if (!sid) {
          sid = rid();
          const mx = await env.DB.prepare(`SELECT COALESCE(MAX(sort),0)+1 AS n FROM p_amb_section WHERE act_id = ?1`).bind(patch.act_id).first();
          await env.DB.prepare(`INSERT INTO p_amb_section (id, act_id, name, line, icon, icon_svg, color, enabled, sort) VALUES (?1,?2,?3,?4,NULL,NULL,?5,1,?6)`)
            .bind(sid, patch.act_id, patch.section.name, patch.section.line || null, '#E86A33', mx?.n || 1).run();
        } else await env.DB.prepare(`UPDATE p_amb_section SET enabled = 1 WHERE id = ?1 AND act_id = ?2`).bind(sid, patch.act_id).run();
        let made = 0;
        for (const x of patch.angles) {
          const mx = await env.DB.prepare(`SELECT COALESCE(MAX(sort),0)+1 AS n FROM p_amb_angle WHERE act_id = ?1`).bind(patch.act_id).first();
          await env.DB.prepare(`INSERT INTO p_amb_angle (id, act_id, section_id, hot, status, title, argument, who, products, format, lever, openers_json, shots_json, on_screen, do_text, dont_text, trend, sort, hot_sort)
            VALUES (?1,?2,?3,0,'live',?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,NULL,?15,0)`)
            .bind(rid(), patch.act_id, sid, clip(x.title, 120), clip(x.argument, 400), clip(x.who, 200), clip(x.products, 120), clip(x.format, 60), clip(x.lever, 120),
              JSON.stringify((x.openers || []).slice(0, 5).map(o => clip(o, 200))), JSON.stringify((x.shots || []).slice(0, 8).map(sh => ({ label: clip(sh.label, 40), text: clip(sh.text, 300) }))),
              clip(x.on_screen, 200), clip(x.do || x.do_text, 300), clip(x.dont || x.dont_text, 300), mx?.n || 1).run();
          made++;
        }
        return { ok: true, note: `${made} angle${made > 1 ? 's' : ''} live on the hub.` };
      } },
  ];
};

/* ------------------------------------------------------------------ */
/*  assembly                                                           */
/* ------------------------------------------------------------------ */

/**
 * @param d  from worker.js: getSetting, putSetting, safeJson, listAccounts,
 *           overview, briefData, dataHealth, localDate, addDays, ymdDiff,
 *           daysInMonth, briefHour, slack (slackApi)
 */
export function buildStrategist(d) {
  const secretKey = makeSecretKey(['passwordHash', 'allowedEmails', 'reportTokens', 'metaToken', 'sessionSecret']);
  let engine;
  const rawViews = buildViews(d);
  const views = Object.fromEntries(Object.entries(rawViews).map(([k, fn]) => [k, (env, a, ctx) => fn(env, a, ctx, engine)]));
  const app = makeAppView({ views, blurbs: VIEW_BLURBS, secretKey, getSetting: d.getSetting, safeJson: d.safeJson, fallbackTables: TABLES });
  const h = () => ({
    getSetting: d.getSetting, putSetting: d.putSetting, safeJson: d.safeJson,
    centralDate: () => d.localDate('America/Chicago'), monthOf: x => String(x).slice(0, 7),
    slack: (env, method, params) => d.slack(env, method, params),
    ...app,
  });
  d.h = h;
  engine = createAssistant({
    name: 'Strategist', app: 'Locus', memoryPrefix: 'strategist', owner: 'Cole', repoPath: 'profit/ for the screens (index.html, meta.js, amb.js), account-health/worker/src for the data and this assistant',
    slackName: 'Strategist',
    /* A Slack thread is the conversation: keep enough of it that a follow-up ("and last month?")
       lands on what was said. The engine default (12 turns, 600 chars each) lost the Monday
       message and the brief card the thread hangs off. Same as the Controller's. */
    threadTurns: 30, threadMsgChars: 2500, threadTotalChars: 24000,
    /* 2026-10-09, Cole: no word lists deciding what it does. A keyword list used to pick the model, so
       anything without a listed word (Fela's "can we update this in the creator link?") ran on Haiku and
       read as an assistant that understood nothing. Now Viktor's setup: Opus 5.5 at medium effort for
       every question (the "Smart" preset, changeable in Locus), "!fast" or "!deep" for one answer.
       The rest of the Viktor-grade pass (Slack, memory, skills, Locus API, files, web, live steps,
       Stop, cost line) is in strattools.js; docs/strategist-viktor-grade-plan.md is the plan. */
    model: 'claude-opus-5-5', strongModel: 'claude-opus-5-5', deepModel: 'claude-opus-5-5', strongWhen: null, deepWhen: null,
    ...stratHooks(d), ...makeHooks(d),
    tools: [...stratTools(d), ...writeTools(d), ...makeTools(d), ...autoTools(d), ...klaviyoTools(d)],
    dropTools: ['remember'],
    liveSteps: true, progressNotes: true, fallbacks: 'default', workingEmoji: ['mobius'],
    webHistory: 16, webHistoryChars: 6000,
    who: WHO, schema: SCHEMA, rules: RULES, tables: TABLES, sqlTool: 'query_locus',
    blobColumns: ['data_json', 'extra_json', 'budgets_json', 'goals_json', 'google_spend_json', 'report_config_json'],
    brief: DEFAULT_BRIEF,
    liveContext: async env => {
      const names = (await d.listAccounts(env, true)).map(a => `${a.name} (${a.act_id}, ${a.currency})`);
      return '## The active brands right now\n' + names.join('\n');
    },
    actions: [...ACTIONS(d), ...BUTTONS(d), ...ASANA_ACTIONS(d), ...BUILD_ACTIONS(d), ...stratActions(d), ...writeActions(d), ...makeActions(d), ...autoActions(d), ...klaviyoActions(d)],
    slackTools: SLACK_TOOLS(d),
    playbook: PLAYBOOK,
    slackApp: 'locus',
    checkKinds: ['sync', 'brief-missing', 'pacing', 'roas', 'fatigue', 'connections'],
    checks: (env, hh) => runChecks(env, hh, d),
    snapshot: (env, hh) => snapshot(env, hh, d),
    briefingHow: `- Slack mrkdwn: *bold* with single asterisks, bullets are "• ", no headings, no tables.
- Open with one line on the book: which brands are up, which are down, blended (Triple Whale).
- Then EVERY finding worth the team's time, one bullet each, worst first, drawn ONLY from the findings given. Each bullet: the brand, what happened, the number, what to do and who should do it.
- Say "Meta-reported" or "Triple Whale" whenever a number could be either. Never invent a number. Never use em dashes. Plain English.`,
  });
  return { engine, h, views: app };
}

/* For test-strategist.mjs only. */
export const _test = { ASANA_ACTIONS, BUILD_ACTIONS, SLACK_TOOLS, briefNotesHtml, briefNotesText, BRIEF_BLANKS, leadMath, blanksOf };

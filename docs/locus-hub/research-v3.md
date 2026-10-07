# Locus v3 research: a shorter rail, a global ask bar, the features worth stealing, creative visuals, cut and scale rules

Compiled 2026-10-07. Builds on spec-v2.md, research-platforms.md, research-email-sms.md and
research-dashboard-design.md; nothing already sourced there is repeated except where a decision needs it. Every
claim carries a link. Where a vendor's docs did not say something, this file says "not documented". Opinions are
marked as recommendations.

---

## 1. Navigation

### 1.1 How the best products handle many sections

| Product | Top level | Brand / workspace switch | Grouping | Cmd-K | Pins / recents | Tabs inside a page |
| --- | --- | --- | --- | --- | --- | --- |
| Triple Whale | Six "core workspaces" (Summary, Marketing Acquisition, Creative Analysis, Website Conversion, Customer Retention, Discovery), each holding 3 to 7 tools | Business selector at the very top of the sidebar, multi-select to blend stores | Workspaces grouped by job, not by data source | Search jumps to any workspace, dashboard or tool | Favorites section appears once you star something; users can hide core workspaces ("Customize Navigation") | Tools open inside the workspace |
| Polar | Help center groups by job: Paid Marketing, Acquisition and Creative Studio, Retention, LTV, Email and SMS, Merchandising, AI agents | Not documented | Job groups | Ask Polar opens from the top navigation bar | Views (saved filters) instead of cloned dashboards | Acquisition, Retention, Funnel are tabs |
| Northbeam | Overview (home), Sales page ("central hub"), Attribution (Sales, Product Analytics, Creative Analytics, Orders), Metrics Explorer | Not documented | Few pages, one hub | Not documented | Saved views in a top-left dropdown on the dashboard | Attribution holds four sub-pages |
| Hyros | March 2026 redesign moved every control into the left sidebar and removed the top bar | In sidebar | Reports Board | Not documented | Report tabs persist across sessions | Multiple reports open as browser-style tabs |
| Linear | Inbox, My issues, then Workspace, Favorites, Your teams | Workspace menu top-left | Collapsible team groups | Cmd-K runs any action or jumps to any page; G-then-letter jumps | Favorites (with folders) above Your teams; Customize sidebar hides rarely used items behind "More" | Views as tabs in the header |
| Stripe | Home, Balances, Transactions, Customers, Product catalog, then a Shortcuts section, then Products (expandable) and "More" | Account switcher top-left | Primary five, then products | Search with filter syntax, "?" for shortcuts | **Shortcuts = pinned plus most recently visited pages** | Product pages carry their own tabs |
| Vercel | Feb 2026: horizontal tabs moved into a resizable, hideable sidebar | **"Projects as filters"**: the same page flips between team and project scope in one click | Same tabs at team and project level | Cmd-K command menu | Not documented | Tabs became sidebar items |
| Shopify admin | About ten: Home, Orders, Products, Customers, Marketing, Discounts, Content, Markets, Finance, Analytics, then Sales channels and Apps | Store name opens a recent-stores list | Sub-items expand only under the selected parent | Cmd-K search with category filters; **when search finds nothing it offers Sidekick (AI) instead** | Pinned apps and channels, drag to reorder | Sub-pages under the open parent |
| Notion | Home sections: Recents, Favorites, Agents, Teamspaces, Shared, Private | Workspace switcher top-left | Collapsible toggles; each section can be hidden, reordered, capped in length | Cmd-K search opens on recent pages | Favorites and Recents are sections | Pages nest without limit |

Sources: Triple Whale navigation guide https://kb.triplewhale.com/en/articles/12117524-a-guide-to-triple-whale-s-navigation ;
Polar help center https://intercom.help/polar-app/ and Ask Polar https://intercom.help/polar-app/en/articles/13017453-ask-polar-2-0 ;
Northbeam orientation https://docs.northbeam.io/docs/new-to-northbeam-how-to-get-oriented ;
Hyros workspace update https://hyros.com/updates/power-features/a-faster-smarter-hyros-workspace/ ;
Linear personalized sidebar https://linear.app/changelog/2024-12-18-personalized-sidebar and favorites https://linear.app/docs/favorites and navigation https://linear.app/enablement/guides/navigating-linear ;
Stripe https://docs.stripe.com/dashboard/basics ;
Vercel https://vercel.com/changelog/dashboard-navigation-redesign-rollout ;
Shopify https://help.shopify.com/en/manual/shopify-admin/shopify-admin-overview ;
Notion https://www.notion.com/help/guides/structure-sidebar-focused-work-teamspaces

### 1.2 What the pattern says

1. **The winners have 5 to 7 top-level items and push depth into the page.** Triple Whale has six workspaces but
   about 30 tools behind them; Stripe shows five primary items; Northbeam has three or four. Nobody lists every
   screen in the rail at all times. Locus lists 20.
2. **Group by job, not by data source.** Triple Whale renamed its menu to jobs (Marketing Acquisition, Customer
   Retention). Locus's groups are already close to jobs; the problem is that every child is also a rail item.
3. **Scope is a filter, not a place.** Vercel's "projects as filters" and Triple Whale's business selector make
   "which brand" a control on the same page. Locus already does this with the client picker. Apply the same idea
   to channels: Meta, Google, TikTok are a filter on one Ads screen, not four rail rows.
4. **Personal shortcuts beat role presets.** Stripe (pinned plus recent), Linear (favorites, hide behind More),
   Notion (hide and reorder sections), Triple Whale (hide workspaces, favorites). None of them ships a visible
   "show tabs for role X" toggle. Customization is per person and set once.
5. **Cmd-K is the escape hatch that lets the rail be short.** Linear: "if you forget any other shortcut, open the
   command menu and type what you want to do." Shopify adds the move that matters most for Locus: when the search
   box finds no page, it hands the question to the AI.
6. **Page tabs are where depth lives.** Hyros went as far as browser-style report tabs. Locus already has the
   Meta segmented control; extend that pattern instead of adding rail rows.

### 1.3 Recommended structure for Locus (recommendation)

Six top-level items, each one question. Everything that was a rail row becomes a tab at the top of its page (the
existing `#v2seg` segmented control), and the channel becomes a filter.

| Rail item | Question it answers | Tabs on the page (segmented control) | Was |
| --- | --- | --- | --- |
| **Home** | Is the book making money and where is it leaking | Overview, P&L, Plan | Overview, P&L, Plan, Season, Scenarios |
| **Ads** | Is the spend working, what do I change today | Channel pills first: All, Meta, Google, TikTok. Then jobs: Overview, Campaigns, Creative, Tests, Changes (jobs a channel cannot support, like Tests on TikTok, are greyed with "Meta only") | Meta, Google, TikTok, All channels, and Meta's own segmented control |
| **Email** | Is email pulling its weight | Overview, Campaigns, Flows, Audience | Klaviyo |
| **Store** | What did the store and its customers do | Sales, Customers | Sales, Customers |
| **Creative** | What do we make next | Angles and tests, Studio, Copy desk, Brand (Creator link is a tab inside Brand) | Tests and angles, Studio, Brand, Copy desk, Creator link |
| **Reports** | What do we send | Daily Brief, Weekly and monthly, Dashboards | Daily Brief, Weekly and monthly, Dashboards, Season, Scenarios |

Foot of the rail: Settings, theme, the user menu. Nothing else.

Why each merge:

- **P&L and Plan move into Home.** spec-v2 Part A already calls Overview vs Profit a duplicate ("same window
  totals twice") and says the waterfall should be the money screen's spine. The owner opens Home to ask "are we
  making money"; P&L is the long answer and Plan is "will we hit it". Same reader, same question, so they are tabs.
- **Season becomes a Plan section, shown only when a season is active** (the BFCM card already lives in Plan's
  world: goals, offers, dates). From September to December, Plan shows a "Season" block at the top; the rest of the
  year it collapses to one line. Seasonal screens should not occupy a permanent rail row.
- **Scenarios becomes a "What if" button** on Home > Plan and Home > P&L that opens the calculator in a side drawer
  with the current brand and period loaded. It is a tool you use while looking at a plan, not a place you go.
- **Four paid rows become one Ads item with channel pills.** The skeleton is identical per channel (spec-v2 C2,
  C3), so the channel is a filter, exactly like Vercel's projects-as-filters. Default pill: Meta for brands that
  only run Meta, All for the rest. The pill and the job tab both live in the URL hash so links still land exactly.
- **Creator link moves inside Brand.** The team memory already says "Brand = research + voice + creator link".
  It is a per-brand asset, not a daily destination.
- **Daily Brief stays in Reports** (spec-v2 already moved it there).
- **Do not split Email into Store** even though Triple Whale and Polar file email under Retention: the retention
  person opens Email daily, and Store would then carry three tabs for two readers. If Cole wants five items, the
  fallback is Store with tabs Sales, Customers, Email.

**The role filter: remove it.** Reasons: with six items there is nothing to hide; a hidden tab turns into "where did
Customers go" when someone switches roles; none of the reference products ship a visible role toggle; and the
role pill costs a whole block of rail height on every screen. Replace it with two quiet things:

1. **A landing page per person** (Settings > Me > "Open Locus on"): buyer defaults to Ads > Meta > Overview,
   strategist to Ads > Meta > Creative, owner to Home. This is what the role filter was really for.
2. **Pins**: a star on any page tab adds it to a "Pinned" strip of at most five items under the six rail items
   (Stripe's Shortcuts, Linear's Favorites). Empty by default, so it costs nothing until someone uses it.

Keep the client share link's restricted set (Home brand view, Store, P&L, weekly report) as a permission, not a
filter.

**Collapsed rail.** Add a collapse to a 56px icon rail (Vercel lets the sidebar hide; Linear dims it). Hovering
an icon shows a flyout listing that item's tabs so a collapsed rail still reaches any tab in one click. Remember
the state per person.

**Brand switcher.** Keep it at the top of the rail (Triple Whale puts the business selector first). Make it
searchable, list "All brands" first, then the last three brands used, then the rest alphabetically. Paused brands
(memory: Galway, Instyler, Gum of Gods, JudyP, Le Pickle, PopBy; The Golf Sock is a test account) sit under a
"Paused" divider so they stop crowding the list.

**Command palette (Ctrl/Cmd-K).** Today Ctrl-K opens the Strategist. Make it a palette with four sections, and let
it fall through to the Strategist the way Shopify's search falls through to Sidekick:

- **Go to**: every page and tab ("meta creative", "flows", "p&l"), every brand ("dartee"), and every campaign and
  ad by name from the synced `ads` table ("open ad: Belt UGC v3").
- **Do**: switch brand, change period ("last 7 days"), change attribution model, compare to last year, open the
  Daily Brief for this brand, export this table, create a test in Asana, copy share link.
- **Recent**: the last eight pages visited with their brand and period (Stripe's recents).
- **Ask**: the typed text as a question to the Strategist, always the last row, selected automatically when nothing
  else matches. Enter on a question opens the answer panel (section 2).

Shortcuts printed in the palette: `G H` Home, `G A` Ads, `G E` Email, `G S` Store, `G C` Creative, `G R` Reports
(Linear's G-then-letter), `/` focuses the ask bar, `?` lists shortcuts (Stripe and Linear).

### 1.4 The final rail

```
[Brand switcher: All brands v]

Home
Ads
Email
Store
Creative
Reports

Pinned (only when the person has starred something, max 5)

-----
Settings
Theme | Collapse
```

Mobile bottom bar: Home, Ads, Store, Ask, More (More opens the full rail). Phone users ask more than they browse.

---

## 2. The ask bar

### 2.1 How the vendors present it

- **Triple Whale Moby.** An "Ask Anything" bar on the Moby home screen starts a question, report or task. Since
  September 2026 Moby can be opened directly from Summary and Attribution "to investigate shifts ... without
  leaving your analysis". Three modes: Analyze (single thread with inline widgets), Build (split screen, chat left,
  live widgets right) and Deep Dive (repeatable investigations). Inside dashboards Moby builds a widget from a plain
  sentence, shows a preview, and adds it only on "Approve & Add". Show SQL toggle; defaults to Triple Attribution
  unless told otherwise. https://kb.triplewhale.com/en/articles/9994902-moby-chat-modes ,
  https://www.triplewhale.com/blog/triple-whale-product-updates-sept-2026 ,
  https://kb.triplewhale.com/en/articles/13038950-create-dashboard-widgets-with-moby ,
  https://kb.triplewhale.com/en/articles/11824175-moby-capabilities-limitations-and-fact-checking-guidelines
- **Ask Polar 2.0.** Opens from the top navigation bar; answers inline as bar charts, line graphs or tables;
  conversational memory ("compare that to last month", "show by channel"); a pop-out arrow reveals the query and
  saves the answer to a dashboard; saved prompts; example prompts such as "Which campaigns had the highest ROAS
  last week?". https://intercom.help/polar-app/en/articles/13017453-ask-polar-2-0
- **Northbeam.** No in-app chat documented. It ships an MCP connector so ChatGPT or Claude can query the dashboard
  read-only, with suggested questions like comparing Meta ROAS week over week; Pro and Enterprise only.
  https://docs.northbeam.io/docs/northbeam-mcp
- **Hyros.** No in-app ask box documented in the 2026 workspace update; AI shows up as an MCP for Claude and ChatGPT
  and as "Hyros Insights". https://hyros.com/updates/power-features/a-faster-smarter-hyros-workspace/ ,
  https://docs.hyros.com/docs/hyros-insights
- **Shopify.** Cmd-K search hands an unmatched query to Sidekick.
  https://help.shopify.com/en/manual/shopify-admin/shopify-admin-overview
- **Grafana Assistant** stays docked and knows the current view (cited in research-dashboard-design.md 3.11).

What they agree on: the box is reachable from every analysis screen without leaving it; answers come back as the
same charts and tables the product already uses; any answer can become a saved widget; the AI states which data
and which attribution model it used. What none of them do well: per-screen suggested questions. That is the gap
Locus can own cheaply.

### 2.2 Recommended design for Locus

**Placement.** One input in the sticky control bar, left of the period, model and compare controls, full width
on phones. Placeholder names the context: "Ask about Meta for Dartee, last 7 days". `/` focuses it from anywhere;
Ctrl-K opens the palette whose last row is the same ask.

**Chips.** On focus, a row of four chips drops under the input: three fixed per-screen questions (below) and one
live chip computed from the screen's own data, for example "Why did CPA jump 31% on Tuesday?" when the anomaly
check (section 3) has a flag. Chips cost nothing until clicked: they are strings, not model calls. Two recent
questions from this person sit after them.

**Context sent with every question**: screen and tab, brand scope, period, compare period, attribution model,
any selected rows (a campaign, three ads) and the visible table's column set. The person never retypes "for Dartee
last 7 days under last platform click". The Strategist (the existing ask engine, docs/strategist-brain) already
has views per screen; this is wiring, not a new brain.

**Where the answer appears.** A right-hand panel, 420px, pushing the content rather than covering it (Moby's
Build mode and Grafana's docked assistant). The screen stays visible so the person can check the answer against
it. Answer anatomy, top to bottom:

1. One sentence that answers the question, with the number.
2. The evidence in Locus's own components: a tile row, a 180px chart with the compare period ghosted, or a table
   of at most ten rows with inline bars. Never a wall of prose.
3. A "How this was worked out" line: tables used, model, period, and the filter applied (Moby's Show SQL, Polar's
   pop-out query).
4. Actions: Open in screen (applies the filter on the real page), Pin to a dashboard (Approve and add, as Moby),
   Send to Slack, and for creative answers "Brief this in Asana".

Follow-ups keep context ("now only new customers"). Threads are per person and searchable from the palette.

### 2.3 Suggested questions per screen

**Home (Overview)**
- What moved revenue most this week vs last, and why?
- Which brand needs a decision today?
- Are we on pace for the month's revenue and spend goals?
- Where is contribution margin leaking: spend, discounts, or shipping?

**Ads > Meta > Overview**
- Is CPA above target because of CPM, CTR or conversion rate?
- How does today compare to a normal Tuesday so far?
- How far apart are Meta-reported and Triple Whale purchases this week?
- What share of purchases came from new customers?

**Ads > Campaigns**
- Which campaign should get the next $100 a day?
- Which ad sets spent over 2x target CPA with no purchase?
- What changed in the account in the last 7 days, and what happened after?
- Rank campaigns by new-customer CPA, not blended CPA.

**Ads > Creative**
- Which ads are fatiguing (frequency up, CTR down)?
- Which new ads launched in the last 14 days are on track to be winners?
- Which angle has the best hit rate this quarter?
- Find ads with a strong hook rate but weak conversion, so we can fix the back half.

**Email**
- Which flow lost the most revenue per recipient vs last month?
- How much of store revenue did email and SMS drive, and is it within benchmark?
- Which campaign subject lines beat our average open rate?
- Is the list growing, or are unsubscribes outrunning sign-ups?

**Store (Sales)**
- Why is AOV down this week: fewer units per order or more discounting?
- How much revenue did refunds and discounts take this month?
- Which products start the most first orders?
- How did new vs returning revenue split vs the same period last year?

**Home > P&L**
- What did one dollar of revenue become this month?
- Which days lost money after ad spend, and why?
- How much more spend can we add before contribution margin goes negative?
- Are product costs complete, or is margin inflated by missing COGS?

**Store > Customers**
- What is 90-day LTV for customers acquired on Meta vs Google?
- How long until a new customer pays back their acquisition cost?
- Which first product leads to the most second orders?
- Which ads brought customers who came back to buy again?

**Scenarios (the What if drawer)**
- What revenue do we get if we raise spend 20% at today's marginal CPA?
- What CPA do we need to hit the month's profit goal?
- What if AOV drops $5 during the sale?
- How many orders does the BFCM plan need per day from Nov 25?

**Reports**
- Draft this week's client summary in plain English.
- What did we promise last week, and did it happen?
- Which numbers changed most since the last report was sent?
- Which brand's weekly report is late or failed to send?

---

## 3. Features worth having

Legend: Build = yes / partly / no from the data listed in the brief (Meta, Triple Whale daily, attribution and
orders, Klaviyo API at 225 reporting calls a day, Asana, Slack). Priority: now (next build cycle), next (this
quarter), later.

### 3.1 Triple Whale

| Feature | What it is | Who uses it and why | Build in Locus | Priority |
| --- | --- | --- | --- | --- |
| Summary with pinned tiles | Tiles by data source; pin any tile to the top; click opens bars vs previous period (https://kb.triplewhale.com/en/articles/5725275-track-kpis-with-the-summary-dashboard) | Owner: the few numbers that matter, first | Yes. Home already has the money row; add the pin so each person picks their top row | Now |
| Attribution with model switch | Seven models, windows, column presets, platform vs pixel side by side (https://kb.triplewhale.com/en/articles/5960333-understanding-and-utilizing-attribution-models) | Buyer: which channel and ad really sold | Yes, done in v2 (`tw_ad_attr` per model, model switch in the top bar). Add column presets | Now (presets) |
| Creative Cockpit / Creative Analysis | Card, bar and line comparison of selected ads; group by name, image, video, copy; rule-based Segments; saved presets (https://kb.triplewhale.com/en/articles/6362638-introducing-creative-cockpit) | Strategist and buyer: what is working and what to make next | Yes. META `ad_daily` + `ad_creative` + ATTR; segments = ad-name tags and Asana angle. See section 4 | Now |
| Product Analytics | Sales trajectory per product, inventory projection (https://kb.triplewhale.com/en/articles/9653103-create-a-custom-dashboard) | Owner and Supply: which product carries the store, reorder timing | Partly. `tw_orders` products give first-order product and mix; exact units, revenue and stock per SKU need the Shopify app (Supply already holds inventory for some brands) | Next |
| Cohorts / LTV | Cohort grid with NCPA, repeat rate, NCPA payback, cumulative and second-order toggles (https://kb.triplewhale.com/en/articles/5725663-customer-cohorts) | Owner: can we afford this CAC | Yes, Customers has most of it; add NCPA payback marker and cohort by first product and first channel | Next |
| Lighthouse / Moby Observability | Anomaly detection (Isolation Forest vs history, 6am, 12pm, 6pm) plus thresholds, then an AI root cause; alerts by email or push, flagged tiles on Summary (https://kb.triplewhale.com/en/articles/12986027-moby-observability) | Everyone: find the problem before the client does | Yes. `tw_daily` and `ad_daily` are enough for a same-weekday baseline (trailing 8 weeks) and a decomposition of the move into spend, CPM, CTR, CVR, AOV. Deliver to Slack and as the live chip in the ask bar | Now |
| Benchmarks | Your value vs peer median with Top 25% / Average / Bottom 25% badge (https://kb.triplewhale.com/en/articles/15483220-benchmarks-see-how-your-business-stacks-up-against-brands-like-yours) | Owner and client: is this good | Partly. TW peer data is not in our sync. Build a Mobius benchmark across our brands (small n, label it) and use Klaviyo's published figures for email | Next |
| Total Impact | TW model blending pixel, post-purchase survey and views (https://www.triplewhale.com/blog/total-impact) | Owner: credit for upper funnel | No. Proprietary and not among the models we store. Show it only if the TW API exposes it per ad | Later |
| Sonar | Sonar Optimize enriches conversions sent to Meta CAPI; Sonar Send triggers more flows (https://kb.triplewhale.com/en/articles/9482981-sonar-optimize-data-enrichment-for-meta) | Buyer: better signal to Meta | No as a feature (it is a data pipe, not a report). Partly as a health check: Meta's dataset quality API gives event match quality per brand, worth a line in Settings > Data health | Later |
| Moby agents | Scheduled agents for media buying, retention, reporting, audits (https://www.triplewhale.com/blog/product-event) | Agency: work that runs without a person | Yes, partly exists: the Strategist, the Daily Brief and nightly findings. Add a "scheduled question" (run this ask every Monday, post to Slack) | Next |
| Pixel | TW's first-party tracking | Everyone | No, and not needed: Locus reads TW's attribution, it does not track | Not planned |
| Post-purchase survey | Thank-you page "how did you hear about us", feeds attribution (https://triplewhale.com/blog/post-purchase-survey) | Owner and strategist: what the pixel cannot see (podcast, word of mouth, creator) | Partly. Only where a brand runs TW's survey or another survey app and we can read the answers; otherwise no | Later |

### 3.2 Hyros

| Feature | What it is | Who and why | Build in Locus | Priority |
| --- | --- | --- | --- | --- |
| Ad-level LTV | Revenue a customer brings over months credited back to the ad that acquired them; reports First Click LTV, LTV for Sources, LTV for a Segment (https://docs.hyros.com/?p=1552) | Buyer and owner: an ad with a high first-order CPA can still be the best ad if its customers come back | Yes. The order-to-ad touches sync (commit f7761ce) plus `tw_orders` customer ids give first-touch ad per customer and their 30, 90 and 180-day revenue. Show "90-day LTV" and "LTV:CAC" columns on Campaigns and Creative | Next (high value, unique for our brands) |
| Call and lead tracking | Attributes booked and attended calls and closes to ads (https://hyros.com/pricing-ai-tracking) | High-ticket and lead-gen businesses | No, and not relevant to Shopify brands | Not planned |
| "Print" tracking and reports | Hyros calls its first-party tracking "print tracking"; reports and journeys are built on it (https://martech.zone/hyros-ai-tracking-and-attribution/) | Buyer: every sale traced to a click | Partly. The equivalent is TW's journeys: Locus can open any number down to its orders and a customer's journey. If Cole meant printable reports, Locus's Weekly and monthly reports already export | Next (the drill) |
| AI attribution / AIR | Server-side attribution sent back to ad platforms; AIR is AI remarketing to anonymous visitors, marked "coming soon" (https://hyros.com/pricing-ai-tracking) | Buyer | No. That is tracking infrastructure, not analytics | Not planned |
| Compare Attribution Modes, Reporting Gap | Two models side by side; reported vs tracked gap as a metric (covered in research-platforms.md) | Buyer | Yes, in spec-v2 B2 items 3 and 5 | Now |

### 3.3 Email and SMS analytics

| Feature | What it is | Who and why | Build in Locus | Priority |
| --- | --- | --- | --- | --- |
| Klaviyo benchmarks | Peer group of about 100 similar companies; percentile tiers Poor / Fair / Good / Excellent (research-email-sms.md 1d) | Retention strategist and client: is 2.1% click good | Partly. Peer data is not in the API; use Klaviyo's published 2026 figures as bands, plus a cross-brand Mobius median | Now (bands) |
| Klaviyo overview dashboard | Total vs attributed revenue, campaigns vs flows, top flows, recent campaigns (research-email-sms.md 1a) | Retention strategist | Yes, it is spec-v2 C5 | Now |
| Postscript | Message analytics refreshed every 15 minutes; Earnings per message; revenue per subscriber; revenue per opt-in source; ARMR (acquisition rate, revenue per message, messages per subscriber, retention rate) (https://help.postscript.io/hc/en-us/articles/4408810874779 , https://help.postscript.io/en/articles/13564300-how-does-postscript-calculate-earnings-per-message-epm) | SMS owner: are we over-texting | No direct data. Borrow the idea: show revenue per message and messages per subscriber per month from Klaviyo SMS | Next (the metric) |
| Attentive | Dashboard by Overview, Subscriber Growth, Campaigns, Journeys, AI Pro; Revenue per message for text and email; AI Pro shows incremental revenue vs a baseline (https://help.attentive.com/hc/en-us/articles/4415696076692 , https://help.attentivemobile.com/hc/en-us/articles/25538876082580) | Retention | No for Attentive brands; borrow "Subscriber Growth" as its own tab (Email > Audience already planned) | Next |
| Omnisend | Store revenue beside Omnisend revenue, campaigns vs automations; switch between message-sent date and order date (https://support.omnisend.com/en/articles/2901036-the-omnisend-dashboard , https://support.omnisend.com/en/articles/10210021-omnisend-reports) | Retention | Borrow the date switch: Klaviyo reports on send date, TW on order date, and spec-v2 already says to label which | Now (the label) |
| **Hiro Analytics** | Retention analytics hub for agencies: agency dashboard across all clients, per-client branded reports with AI summaries, self-serve client dashboards, pacing-to-target alerts, Campaigns (Deep Dive, Creative View, Tag Analysis, Subject Lines, Message Timing), Flows (Comparison, Creatives, Maps of every flow), Cohorts (Subscriber to First Purchase, First to Second Purchase, Retention by Product, Product Paths, LTV at 1/3/6/12 months); Klaviyo, Attentive, Postscript, Omnisend; from $500 a month (https://hiroanalytics.com/ , https://hiroanalytics.support.site/article/onboarding-guide , https://marketplace.klaviyo.com/en-us/apps/01KA2WAA6CXGGF787Q15X8PQM6) | Agency owner and retention lead: one screen across every client, reports in minutes | Mostly yes from Klaviyo: subject lines and send time come with campaigns; flow structure from the flows API; tag analysis from Klaviyo campaign tags. Subscriber-to-first-purchase needs Klaviyo profiles joined to `tw_orders` by email (check whether `tw_orders` keeps email). Mind the 225 reporting calls a day: cache per brand per period | Now (agency email view, subject lines, timing); Next (cohorts, flow map) |

**What Cole means by "high row analytics".** Almost certainly **Hiro Analytics** (said aloud, "Hiro" is
"high-row"). It is the only email and SMS analytics product with that sound, it lives in the Klaviyo marketplace,
and it is built for exactly Mobius's shape: an agency running retention for many brands, wanting one cross-client
view, pacing alerts and client-ready reports. A distant second guess is Hyros ("high-ross"), but Hyros is ad
attribution, not email analytics. The Hiro ideas most worth copying, in order: the agency-wide table of every
brand's email KPIs against target; Subject Lines and Message Timing views; First to Second Purchase by first
product; the flow map.

---

## 4. Creative analytics visuals

### 4.1 How the tools show creative performance

- **Motion** (base in research-dashboard-design.md 2.14): thumbnail tiles with up to six metrics, thumbnails as
  bar-chart x-axis labels, group-by-tag bars over a table, line view that sorts ads into rising, flat and declining
  (declining read as fatigue), Launch Analysis that flags winners from a ROAS goal and spend threshold. Its 2026
  benchmark defines a **winner as spend at least 10x the account median and at least $500**, roughly the 92nd
  percentile, and **hit rate = winners / creatives launched**; only 5 to 8% of ads become winners.
  https://help.motionapp.com/en/articles/8757736-find-emerging-creative-winners ,
  https://motionapp.com/thumbstop-pulse/cb2026-methodology-and-definitions ,
  https://motionapp.com/events/2026-creative-strategy-bootcamp/homebase/2026-creative-benchmarks
- **Triple Whale Creative Analysis**: comparison area with Card, Bar and Line views for hand-picked ads, a deep
  table underneath, rule-based Segments compared head to head (for example ASC vs Instagram), presets like "High
  Spend Scale" and "New Creative Testing". https://kb.triplewhale.com/en/articles/6362638-introducing-creative-cockpit
- **Atria Radar**: letter grades per ad for hook, retention, CTR and conversion plus an overall grade ("instead of
  a wall of numbers"); three tabs: Winners, High iteration potential (close to winning, fix the hook or the
  conversion), Iteration candidates (need more spend); a Scale button writes a brief.
  https://intercom.help/atria-e5456f8f6b7b/en/articles/16845172-what-is-radar
- **Foreplay Lens**: dashboard leaderboard of top ads by spend and the goal metric; creative tests plotted as a
  scatter with the creative on hover; benchmarks against 20,000+ advertisers in 100+ segments; AI tags for persona,
  hook transcript and creator face. https://foreplay.co/lens-creative-analytics ,
  https://help.foreplay.co/articles/4085871-dashboard
- **Superads**: Gallery, Table or Chart, or Gallery and Table together; a Superads score per ad split into hook,
  hold, click and conversion shown as green, yellow, red progress bars; stackable breakdowns (headline plus copy);
  a "Creative categorization" report sorting ads into New, Scaled, Winners, Losers by rules you set; compare periods
  matched by day of week. https://help.superads.ai/en/articles/13927037-navigating-the-report-interface ,
  https://help.superads.ai/categories/getting-started/articles/understanding-breakdown-types-in-superads

The shared idea: **thumbnail first, verdict second, numbers third**, and every grouping (tag, angle, format) is
one click from its ads.

### 4.2 Five visuals for Ads > Meta > Creative (recommendation)

Above all five, a strip of three tiles: ads launched this period, winners (Motion's definition, adapted: spend at
least 10x the brand's median ad and CPA at or under target under the selected model), and hit rate vs the last
four periods.

1. **The leaderboard grid.** Cards sorted by spend, each with the thumbnail (play on hover for video), a verdict
   chip (Scale, Watch, Iterate, Cut, from section 5), spend and its share of account spend as a thin bar, CPA with a
   bullet bar against target, ROAS, hook rate and hold rate, days live. Toggle to a table with the same columns
   (Superads' Gallery plus Table). Group by: ad, creative id, angle, format. This replaces today's cards.
2. **Spend vs efficiency scatter.** X is spend (log scale), Y is CPA divided by target (1.0 line drawn), dot size
   is purchases, dot colour is the verdict. Four named quadrants: Workhorses (high spend, under target): protect;
   Hidden winners (low spend, under target): give them budget; Bleeders (high spend, over target): cut or fix;
   Tests (low spend, over target): wait for the rule. Hover shows the thumbnail (Foreplay's test scatter). This is
   the one chart a buyer reads in five seconds.
3. **Fatigue small multiples.** For the ten biggest spenders, one row each: thumbnail, then three sparklines over
   days live on a shared x axis: CPA (or ROAS), CTR, frequency. A row turns amber when two of the three move the
   wrong way for three days running (section 5). Same scale per column so rows compare.
4. **Angle and format breakdown.** Horizontal bars per group (Asana angle, ad-name format tag, hook type, creator):
   share of spend beside share of purchases, so a group "punching above its weight" shows a longer purchase bar.
   Columns: ads, winners, hit rate, CPA, 90-day LTV once section 3.2's ad LTV lands. Click a bar to filter the grid.
   This is Motion's comparative report and Triple Whale's Segments, fed by our Asana test library.
5. **The ad's funnel scorecard.** For a selected ad (or the side panel when a card is clicked): hook rate, hold
   rate, outbound CTR, add-to-cart rate, purchase conversion rate, each as a bar against the brand's median, graded
   A to F (Atria's grades, Superads' sub-scores). The weakest step names the iteration: weak hook means new first
   three seconds on the same body; strong hook and weak conversion means fix the offer or landing page. A "Brief
   the iteration" button sends it to Asana through the Strategist.

---

## 5. Cut, scale, iterate rules

Short version, written for Locus to apply automatically to the verdict chip. Numbers use the brand's target CPA
from ACC and Triple Whale last platform click (team rule: TW attribution everywhere).

**Cut**
- Spend at least **3x target CPA with zero purchases**: cut. If the ad's true CPA were on target, the chance of
  seeing zero purchases by 3x spend is e^-3, about 5% (Poisson), so this is a safe call. At 2x it is e^-2, about
  14%, which is why aggressive buyers cut at 2x and patient ones wait for 3x.
- With **one or more purchases**, hold until about **2x target CPA** spent per purchase before cutting; between
  1.5x and 2x is Watch.
- Not before **3 days live**, and not on a day with a tracking or landing page break (cut those immediately for
  the break, not the ad).
- Sources: tiered 2x / 3x rules and the 3-day hold https://admanage.ai/blog/when-to-kill-a-facebook-ad ,
  https://www.flighted.co/blog/how-to-know-when-to-pause-a-meta-ad ; time-gated CPA multiples
  https://www.skills.sh/synter-media-ai/free-skills/kill-scale-rules

**Scale**
- CPA at or under target (or ROAS at least 1.2x target) for **3 or more days** and **at least 10 purchases**
  in the window. Under 10 purchases the CPA is noise.
- Raise budget about **20% every 2 to 3 days**; bigger jumps tend to restart Meta's learning (Meta's learning phase
  wants about 50 optimization events in 7 days; the 20% figure is practitioner lore, not a Meta rule).
  https://www.facebook.com/business/help/112167992830700 , https://benly.ai/learn/meta-ads/scaling-meta-ads-guide
- Treat Meta moving spend toward an ad on its own as an early scale signal (Motion's "where Meta is pushing
  budget"). https://help.motionapp.com/en/articles/8757736-find-emerging-creative-winners
- Size ad set budgets so they can buy about 7 conversions a day (target CPA x 50 / 7, so roughly target CPA x 7)
  or accept Learning Limited. https://defiantdigital.com.au/mastering-facebook-ad-budgets/

**Iterate** (the ad has something, the funnel names what to fix)
- Hook rate healthy (about 25% to 35% for prospecting) but conversion weak: keep the opening, change offer, body
  or landing page.
- Hook under about 20% but conversion strong among those who watched: new first three seconds on the same body.
- Atria's "High iteration potential" tab is this bucket. https://segwise.ai/blog/hook-rate-improvement-strategies ,
  https://intercom.help/atria-e5456f8f6b7b/en/articles/16845172-what-is-radar

**Fatigue** (needs two signals together over several days, one alone is noise)
- Weekly frequency above about 3 on prospecting; CTR down 15% to 20% week over week; CPM up with CTR down; hook rate
  falling on the same audience. If one ad declines while others hold, it is creative fatigue; if all decline, it
  is the audience or the auction. https://segwise.ai/blog/how-to-measure-creative-fatigue ,
  https://www.triplewhale.com/blog/creative-fatigue

**Testing budget sanity**
- Give each test at least 2x to 3x target CPA before any call; only 5% to 8% of ads become winners, so a brand
  launching fewer than about 15 ads a month will rarely find one (Motion 2026 benchmarks; CTC reports brands
  testing 20+ new ads a month see markedly higher ROAS).
  https://motionapp.com/events/2026-creative-strategy-bootcamp/homebase/2026-creative-benchmarks ,
  https://commonthreadco.com/blogs/coachs-corner/meta-andromeda-roas-creative-strategy-2026

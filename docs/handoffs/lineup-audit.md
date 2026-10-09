# Lineup into Locus: step 1, the audit (2026-10-09)

Status: revised after Cole's question ("is the goal still right?"); waiting for sign-off. Nothing designed or built yet.
Brief: `docs/handoffs/lineup-into-locus.md`. Method copied from `supply-audit.md`: judged on NEED,
agency first, then what one brand needs on top, with category research.

## Verdict (Cole asked: is it useful, what is the goal, what is fat)

**The idea is right; the app is mostly fat; how we think about it has to change.**

- **Why it is not useful today.** Lineup is an inbox nobody on our side reads. Clients put dates in;
  nothing turns a date into work, nobody on the team opens it, the Slack pings never reached us, and
  one date is already wrong. A date that sits in a box dies, the same way the Q4 Playbook and the old
  Supply app died.
- **The goal, in one line: the dates customers see drive the work that has to be ready for them.**
  Every drop or sale starts a countdown (briefs due, assets in, ads built, emails scheduled, ads
  live), the countdown lands in Asana, the team is pinged, and the date shows up on the day and in
  the numbers afterwards. Season already does exactly this for Black Friday (tasks derived from the
  date: briefs -23 days, built -9, loaded -4). The calendar is that same engine, for every brand, all
  year.
- **What it is NOT.** Not a social post scheduler (a different, bigger tool, out of scope). Not a
  second production tracker (Asana is). Not a place anyone has to keep tidy by hand.
- **The fat.** About 40 features and 27,000 lines today. Roughly 10 survive: the month and lane
  views, add by clicking a day, drag to move, the date range, the offer, channels, the assets link,
  the client door, Slack pings. The rest (stage board, 5 statuses, editable types / stages /
  channels, owner picker, the Producer AI, changelog page, Clients screen, logos, passwords, tour,
  install, its own sign-in and cron) is cut. Full table below.
- **If we will not build the countdown and the Asana link, do not build the page.** A calendar
  without them is clutter. The fallback would be no Calendar item at all: dates as markers on the
  charts and a "Coming up" line on Home.

## How it would be used, week to week

| Who | When | What they do |
|---|---|---|
| Client (Nick, Dartee) | When they plan a drop or sale | Add it on their client link (or say it in Slack). We get pinged in the brand's internal channel |
| Strategist (Ahsan, Noma) | Monday | Calendar, next 6 weeks: each event shows its countdown and what is late ("Briefs due Oct 23, not in Asana yet"). One click makes the Asana tasks |
| Ravo | When briefs land | Sees "assets due" on the event and the client's assets link |
| Media buyer | Daily | Ads > Today (structure audit) says "Sale starts tomorrow: load the sale ads, raise the budget"; the week-out and day-before pings say it in Slack |
| Cole | Weekly | Lanes for every client: what is coming, what clashes, who has nothing planned next month |
| Everyone, the Brief, the Strategist | After the date | The marker on every chart and one line: "During the drop: revenue +38% vs the week before" |

## What we need to build (step 3, in order)

1. **One event list per brand**, on the same D1 rows, keyed on the Locus brand id. Fields: name, type
   (Drop or launch, Sale, Ad push, Site change, Other), dates (teaser, launch, end), the offer, channels,
   assets link, Pencilled or Confirmed.
2. **The countdown**: Season's derived-task rule generalised to any event (per type: a sale needs
   briefs, ads, emails; a drop also needs assets and stock). Shown on the event; "Make the Asana
   tasks" pushes it to the brand's Asana project with the dates. Asana stays where work is typed.
3. **The Calendar page**: lanes (all clients), month (one brand), Coming up (the list). Season phases,
   Drops on-site dates and Klaviyo sends draw on it automatically.
4. **Slack**: a ping when a client adds or moves a date, a week-out and a day-before reminder, all to
   the brand's internal channel (no mapping screen).
5. **The client link**: one brand, add or move their own dates, nothing internal.
6. **Markers and impact** on Home, Sales and the Brief's chart; the Brief names the event on the day.
7. **Warnings**: overlapping sales, a sale within 6 weeks of the last, a promo on a product running
   out, 4+ emails in a week, an event under 14 days out still Pencilled.
8. **The Strategist**: a calendar view plus add / move / confirm and "make the Asana tasks".
9. **Retire Lineup** after a week of use; `/b/<slug>` forwards to the client link.

## Step 2: mock v1 (2026-10-09)

Cole signed off the goal and cuts ("build the strategy ... build the mockups and I'll approve").
Mock: `docs/locus-hub/mocks-calendar.html`, artifact https://claude.ai/artifact/Umoq9q2cYe1n889Sdo7RLV .
Eight screens on real data: All clients (lanes + work due this week), One brand (Grunk month + Coming up),
a date before (Burgundy countdown), a date after (Dartee Warehouse Sale impact from Triple Whale), Add a
date (modal with the countdown it creates), the client link (Nick), Slack (client ping, week out, day
before, Monday line), Home card + chart band.

Found while mocking: nobody has ever ticked a Season task (2 stored rows, both open). So the countdown
must tick ITSELF: assets = a link on the date, briefs/built = Asana tasks, email = a Klaviyo send near the
date, ads loaded = new ads in Meta, live = the date passed. Season should get the same automatic ticks later.
Countdown offsets used: drop = assets -14, briefs -12, built -5, email -3, loaded -2, live 0; sale = offer
locked -21, briefs -14, built -5, email -3, loaded -2, live 0. On the lanes, a brand's Black Friday week
phases merge into one bar (the detail lives on the Black Friday page); one-day drops are labelled pins.

## Four facts that change the brief

1. **The clients use Lineup, we do not.** 16 events in the live D1, ever.
   - Grunk Dolfer: 6 real drops, every one typed by Nick Bender (client), with a Drive assets link.
   - Dartee: 3 events typed by James and Justin (client). Last edit Sep 14.
   - Lucky: 7 test events, all cancelled, nothing since Aug 19.
   - Ahsan and Noma have never added or edited an event. Cole has not since Aug.
   So Lineup's real job today is **a place the client tells us their dates**. Moving it into Locus
   must keep a door for the client, or Nick's six drops stop arriving.
2. **The Daily Brief does NOT read the calendar.** The `CAL` binding was added Aug 21 (commit e17f5e5,
   pointed at the OLD single-brand D1) and removed the same day (013ddc8, "Drop the calendar
   dependency"). account-health/wrangler.toml has no CAL binding; no code reads calendarEvents or
   calendarWeights. The brief, account-health/CLAUDE.md and profit/PRD.md still say it does (stale).
   profit/CLAUDE.md says "Never depend on the Marketing Calendar" (written when it was a Lucky-only app).
   Nothing breaks when Lineup moves; whether to re-add a forecast lift is a new decision (question 4).
3. **Slack from Lineup barely ran.** 3 messages ever (Dartee, Sep). Grunk and Lucky have Slack on but
   no channel mapped, so Nick's drops never reached the team in Slack.
4. **The calendar is already wrong once.** Grunk "Burgundy Drinko Collection" is dated Oct 7, its own
   note says "10/13/26 website drop", and our plan launches it Oct 13. A typed calendar drifts
   unless someone owns it; the client typed it and nobody on our side looked.

## What a calendar is for (agency first)

Research says the same four jobs everywhere (sources at the end):

| Job | Who | How often |
|---|---|---|
| **See what is coming** so briefs, ads and emails are ready in time (creative needs 3 to 6 weeks) | Strategists, Ravo, Cole | Weekly |
| **Avoid collisions**: two sales on top of each other, a sale too soon after the last one, a promo on a product that is running out, too many emails in a week | Cole, strategist | When a date is added |
| **Act on the day**: sale starts Friday, raise budgets and swap creative | Media buyer | Daily |
| **Explain the numbers afterwards**: "revenue jumped because the drop went live" | Everyone, the Brief, the Strategist | Daily |

What every client needs on it: drops and launches, sales and promos (dates and the offer), email and
SMS sends, big ad pushes, site changes, Black Friday. What Lucky needs on top: its Drops (designs by
on-site date) and its Season plan, both of which Locus already has.

**The key point: most of the calendar already exists in Locus with dates.** Season phases (offers,
start and end), Drops (on-site date), Klaviyo campaigns (sent and scheduled), the Change Log. Lineup
made people type all of it. The new calendar should show those automatically and only ask people to
type what Locus cannot know: a client's own drop or sale date, a site change, a PR moment.

## What the best tools do

- **Annotations on the revenue line are the main pattern.** Shopify Analytics (app annotations, Jul
  2026), GA4, Triple Whale's activity feed, Annotrack: a date or date range marked on every chart,
  coloured by source. Locus line charts already draw Change Log markers; calendar events join them.
- **Automatic beats typed.** Annotrack plots every Klaviyo campaign with no typing; Triple Whale
  overlays ad launches. Klaviyo's own calendar colours by status (draft, scheduled, sent).
- **Agencies: one lane per client** on a timeline (Airtable), plus a **client link with no login**
  that shows only client-safe things (Planable guest links).
- **Promo fields that matter**: the offer and its depth, dates, which products. Not owners, stages,
  priorities.
- **Impact after the fact** (Annotrack): revenue, orders and AOV during the event against the same
  length of time before it. Nobody in the category ties this to the forecast; we can.
- **Clutter in the category**: social post scheduling, files and chat inside the calendar, day view,
  more than 3 items in a day cell (Klaviyo collapses to "+N"), stacked holiday calendars.

## Every Lineup screen and feature

| Feature | Needed? | Verdict and where it goes |
|---|---|---|
| **Month view, one brand** | Yes | KEEP. The brand's calendar page. Max 3 per day, then "+N" |
| **Week view** | No, month and the list cover it | CUT |
| **Agenda (28-day list)** | Yes, it is what people read | KEEP as **Coming up** (next 6 weeks), the default on phones, and a small card on Home |
| **/all agency calendar** (read-only, chips by brand) | Yes, Cole's view | KEEP, rebuilt as **lanes**: one row per brand, 8 to 12 weeks, like Season's Week by week. Paused brands hidden |
| **Board (stage kanban)** | No | CUT. Production status lives in Asana (the Locus rule: Asana is the only place anyone types). Readiness is DERIVED from the date like Season does: "Briefs due Oct 23", "Ads built Nov 2" |
| **Stages (6, editable, colours)** | No | CUT (see Board). Only Grunk set them |
| **Status (5: confirmed, tentative, at risk, completed, cancelled)** | Partly | Two: **Pencilled** or **Confirmed**. Done = the date passed. Cancelled = delete with undo. "At risk" = derived warning |
| **Drag a chip to move all its dates, with undo** | Yes, cheap and liked | KEEP |
| **Click an empty day to add** | Yes | KEEP |
| **Clash banner (two primary launches within 7 days)** | Yes, the idea is right | KEEP AND WIDEN as warnings on the event: two sales overlap; a sale within 6 weeks of the last big one; a promo on a product Stock says runs out; 4+ emails in one week. Shown on the event and in Coming up, not a banner |
| **"Needs review" (untouched 21 days, launch within 30)** | Partly | REPLACE with one rule: still Pencilled and under 14 days out |
| **Channel filter (paid, email, organic, sms)** | No | REPLACE with **layer switches**: Typed, Season, Drops, Email, Ad changes |
| **Event fields: name, type, launch date** | Yes | KEEP |
| **Brief + notes (two text boxes)** | One is enough | MERGE into **What the customer sees** (the offer, the drop) |
| **Teaser start, promo end** | Yes | KEEP as the date range |
| **Assets due** | Yes, Ravo and strategists need it | DERIVED from the launch date by default (Season's rule), editable |
| **Inventory lands** | Partly | KEEP optional for brands with no stock feed; for Lucky it comes from Buying |
| **Assets link** | Yes, Grunk uses it on every drop | KEEP, plus an "Assets are in" tick |
| **Owner (required, people picker)** | No | CUT. Show "Added by Nick" automatically |
| **Channels with priority (primary, supporting, fyi)** | Channels yes, priority no | KEEP channels as chips (Ads, Email, SMS, Organic). Priority CUT |
| **Editable event types, channels, stages per board** | No, colours must mean the same for every brand | CUT. One fixed list: Drop or launch, Sale, Email or SMS (auto), Ad push, Site change, Other |
| **Changelog page** | No as a page | CUT the page; keep a short History on each event ("date moved Oct 7 to Oct 13 by Nick"). Locus "Change Log" stays the ads log, no name clash |
| **Slack on every edit (15-min batch) + per-channel mapping** | Partly | CUT the mapping. One post to the brand's internal channel when a CLIENT adds or moves a date (the thing the team must hear). Launches in the next 14 days join the Monday post |
| **Slack reminders a week out and the day before** | Yes (Cole: notifications matter) | KEEP as their own pings to the brand's internal channel, plus launches in the next 14 days in the Monday post |
| **The Producer (AI chat + nightly checks)** | No as a second assistant | CUT. The Strategist gets a calendar view and actions (add, move, confirm). The nightly checks become the warnings above |
| **Clients screen, logos, cropper, colours, per-brand passwords, memberships** | No | CUT. Locus has the brand list, logos and access |
| **Google sign-in, name prompt, tour, PWA install, offline page** | No | CUT. Locus has its own sign-in, tour and Help |
| **Hub cron (every 5 minutes)** | No | CUT once the page moves (Locus's hourly cron covers the Monday post) |
| **Brief forecast lift (CAL)** | Does not exist today | See question 4 |

## New things the move makes possible (no typing)

| Thing | Why it matters |
|---|---|
| **Season phases** show as bars on the calendar (Black Friday, Early access, Boxing Day) | Season stays the BFCM plan; the calendar just shows it. Click opens Season |
| **Drops** show on their on-site date (Lucky) | Supply's never-built "hand-off to the calendar" done by reading, not copying |
| **Klaviyo campaigns** show as dots, scheduled and sent (every brand with a key) | Answers "too many emails?" and "what did we send that day?" |
| **Markers on every Locus chart** (Home, Sales, the Brief) from the same events | The main pattern in the category; Locus already draws Change Log markers |
| **Impact card on a past event**: revenue, orders, AOV during it vs the same days before | "Did the drop work?" in one line |
| **Stock warning**: a promo on a product that runs out first | Only Locus has both sides |

## The client's door (the one real design question)

Clients are the ones who type today. Options:

- **A. Client link, no login (recommended).** Like Season's client link: one brand, shows their
  calendar (typed, Season phases, email sends; never numbers or internal notes), and lets them add
  or move THEIR OWN dates. Every client change posts to our internal channel. The old
  `/b/grunk-dolfer` address forwards there so Nick's bookmark keeps working.
- **B. Clients sign in to Locus** with access to one brand and only the calendar page. Bigger build,
  and Locus holds margins and internal notes; one slip shows them.
- **C. Clients tell us in Slack** ("@Mobius Digital the Burgundy drop is Oct 13") and the Strategist
  adds it. No screen, but nobody can see the plan.

Recommend A, with C as a bonus once the Strategist has the action.

## Where it lives (matches the structure audit)

The structure audit (`locus-structure-audit-step1.md`, committed 2026-10-09, waiting for Cole) moves
Plan to Brand > Goals, makes Black Friday a seasonal rail item (War room, The plan), and leaves room
for one item, **Calendar**, between Brand and Reports. This audit takes that slot:

- **Rail item "Calendar"**, always on, ONE page (no tabs). All clients = lanes (one row per brand);
  one brand = month. A "Coming up" list beside it (phones get the list first).
- **Season phases draw on it** all year; Black Friday > The plan stays where the offers are edited.
- **On Home**: promo and drop days feed the structure audit's "Yesterday" ("what changed"), plus a
  small "Coming up" card (next 14 days).
- **On every chart**: the markers.
- Not under Products: Drops is how a product gets made; the calendar is what a customer sees.

## Keeps working

- Same D1 (`marketing-hub`) and the same `events` rows, so Nick's six drops and Dartee's three move
  over as they are. Lineup brand slugs map to Locus brand ids (lucky-golf to brand_lucky_golf,
  dartee-golf, grunk-dolfer); the new code keys on the Locus brand id, never the slug.
- The old worker keeps running until the team has used the new page for a week; then its pages
  forward to Locus or the client link.

## Questions for Cole

1. Sign-off on the keeps and cuts above (the big cuts: Board and stages, the Producer, editable
   types, per-channel Slack, the Clients screen).
2. The client's door: A (client link that can add their own dates), B or C?
3. Placement: Calendar as its own rail item (the slot the structure audit left), one page, plus a
   Home card?
4. The Brief: it does not use the calendar today. Recommend NOT re-adding fixed multipliers (x2.2 on
   a launch day was a guess). Instead: the Brief names the event ("Burgundy drops today") and its
   chart shows the marker; after one season, learn each brand's real lift from its own past events.
   OK?
5. Grunk's Burgundy date: Oct 7 on the calendar, Oct 13 in its note and our plan. Fix it to Oct 13
   now, or ask Nick?

## Sources

- Klaviyo campaign calendar: https://help.klaviyo.com/hc/en-us/articles/14719736311067
- Shopify app annotations on analytics charts: https://changelog.shopify.com/posts/new-app-added-annotations-on-your-analytics-charts , https://shopify.dev/docs/api/shopifyql/latest/syntax/annotate.md
- Triple Whale activity feed: https://triplewhale.com/blog/may-2023-product-updates
- GA4 annotations: https://martech.org/how-to-use-ga4-annotations-to-add-context-and-clarity-to-your-analytics
- HubSpot marketing calendar: https://knowledge.hubspot.com/campaigns/use-your-marketing-calendar
- Planable guest links and client role: https://planable.io/blog/guest-view-links/ , https://help.planable.io/hc/en-us/articles/21715390472348
- Airtable timeline swimlanes: https://support.airtable.com/docs/timeline-view-overview.md
- Annotrack (auto Klaviyo markers, impact reports): https://apps.shopify.com/annotrack-annotations ; PromoPrep: https://apps.shopify.com/marketing-calendar
- Promo calendar practice (spacing sales, a job per promo, lead times): https://www.growthsuite.net/questions/what-anchoring-techniques-work-best-for-discount-presentations , https://resources.rework.com/de/libraries/ecommerce-growth/seasonal-promotional-strategy , https://www.attnagency.com/blog/marketing-calendar-template-dtc-brand-planning-2026 , https://hello.quikly.com/blog/promotional-calendar

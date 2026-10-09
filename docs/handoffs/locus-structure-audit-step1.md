# Locus structure audit: step 1 (2026-10-09)

Status: SIGNED OFF by Cole 2026-10-09 (all five answers = the recommendation: rail and moves yes; Plan in
Brand > Goals; Copy desk inside Studio as a Words mode; Brand is its own rail item; the season item shows only
while a season is on, labelled with its name). Page: https://claude.ai/artifact/HGz5WWWAuBZFkSMiWhvJb1
Step 2 mocks (live data, waiting for approval): https://claude.ai/artifact/EAh93jhCJopQ8BGKALw75D , source
docs/locus-hub/mocks-structure.html. Mock finding: on Triple Whale last platform click, ~20 of the judged ad sets
across brands sit over the cut line for Oct 1 to 7, so Ads > Today ranks by money at stake and shows 3 per brand.
Brief: docs/handoffs/locus-structure-audit.md. Lineup is moving in through its own chat
(docs/handoffs/lineup-into-locus.md); this leaves room for it and for Pulse and builds neither.

How this was judged (the lessons from the Supply audit):
- On NEED, not clicks: what each reader has to decide, and whether the page helps them decide it.
- Agency first: every page read from "All clients" and the team (Cole the owner; Ahsan and Noma,
  strategists who also buy media; Ravo the editor), then what one brand needs on top. Lucky is the
  deepest brand; every page has to work for a brand with only Meta and Triple Whale too.
- Category research first (section 4), before proposing anything.

---

## 1. The proposal in one screen

```
[ All clients v ]                                   was
Home            Overview . Yesterday . P&L           Overview . P&L . Plan . Season . Scenarios
Ads             Today . Meta . Google . TikTok .     Meta . Google . TikTok . All channels
                All channels . Tests and angles      (Meta jobs: Overview . Campaigns . Creative . Changes)
Email and SMS   Klaviyo (or Attentive)               Klaviyo
Store           Sales . Customers . Website . Search same
Products *      Stock . Buying . Drops               same
Creative        Studio . Library . Inspiration       Tests and angles . Studio . Library . Inspiration .
                                                     Brand . Copy desk . Creator link
Brand           Goals . Client answers . Research .  (new rail item; pages came from Creative + Plan)
                Voice . Creator link
Reports         Daily Brief . Weekly and monthly .   same
                Dashboards
Black Friday *  War room . The plan                  Season (was a Home tab)
(Calendar)      room left for Lineup                 
-----
Tools           Scenarios . (Pulse later)            Scenarios was a Home tab
Brand settings  6 sections                           8 sections + 2 pages
[profile]       Agency settings (6 sections), Clients, Team, How to use Locus, Sign out
```
`*` = shown only when it applies: Products for brands with a stock feed, Black Friday while a season is on
(about six weeks before its first phase to a week after its last; the label is the season's name).

Three new pages: **Home > Yesterday** (the bad-day view), **Ads > Today** (the media buyer's daily
list), **Black Friday > War room**. Tools is a small item in the rail foot, beside Settings.

Count: 7 always-on rail items (8 with Calendar), plus Products and the season when they apply. The v3
shell had 6 plus Products. The one new always-on item is Brand, and it takes four pages out of Creative
and one off Home, so pages per item go down.

---

## 2. Audit: every rail item and page

Verdicts: KEEP, MERGE (into another page), MOVE (somewhere else), CUT, NEW.

### Home ("Is the book making money and where is it leaking?")
| Page / card | For | Reader, how often | Verdict |
| --- | --- | --- | --- |
| Overview: the read | 3 lines on what matters | everyone, daily | KEEP |
| Overview: What moved yesterday | per brand metrics 25%+ off the same weekday over 8 weeks | owner, buyers, daily | MERGE into Yesterday; Home keeps a one-line strip that opens it |
| Overview: money tiles, revenue by day, site funnel, where revenue came from | the central dashboard | everyone, daily | KEEP |
| Overview: Ad spend by platform, by day | spend mix | buyer, weekly | CUT here: Ads > All channels draws the same chart |
| Overview: Each brand, revenue by day (small charts) + Each brand (table) | agency roll-up | owner, daily | MERGE the two into one table with a sparkline column (two cards list the same brands) |
| P&L | revenue to contribution | owner, weekly | KEEP on Home (Cole: "maybe P&L belongs": it is the long answer to Home's question) |
| Plan | the month's revenue, spend, MER agreed with the client | owner, monthly, on the client call | MOVE to Brand > Goals |
| Season | BFCM offers, timeline, goals, desk | owner + strategists, daily in Q4 | MOVE to its own seasonal item (Black Friday) |
| Scenarios | lead math and ROAS math | owner, strategists, a few times a month | MOVE to Tools |

### Ads ("Is the spend working, what do I change today?")
| Page | For | Reader, how often | Verdict |
| --- | --- | --- | --- |
| (none) the buyer's daily decisions | open Locus, see what to scale, cut, fix | Ahsan, Noma, daily | NEW: Ads > Today (section 6) |
| Meta > Overview | verdict, tiles, funnel, spend by campaign, CPA by day | buyer, daily | KEEP |
| Meta > Campaigns | campaign > ad set > ad, previews, stock chips | buyer, daily | KEEP |
| Meta > Creative | calls per ad (ad set first), map, hook vs hold, fatigue, cadence, value per ad, angle/format rollups | buyer + strategist, daily/weekly | KEEP as the analysis; its calls also feed Ads > Today |
| Meta > Tests (Test calls) | make a call on finished tests | buyer, Mondays | MOVE: the calls become rows in Ads > Today; the running list goes to Tests and angles. Old id `tests` keeps routing |
| Meta > Changes (Change Log) | what changed and why | buyer, daily | KEEP; it also becomes the "what changed" column in Yesterday |
| Meta > Today (hidden, `mtoday`) | today's spend by hour vs a normal day | buyer, when spend looks off | MERGE into Ads > Today (a spend-pace line per brand) |
| Meta > Creative browser (hidden, `mbrowser`) | every ad in a grid | nobody needs it now | CUT: Creative replaces it, and it still judges with an old 1.4x rule that disagrees with the Creative calls. Id routes to Creative |
| Google, TikTok | Triple Whale totals, direct campaigns when linked | buyer, daily for brands that run them | KEEP, but the tab shows only for a brand with that platform connected or spending (All clients shows both) |
| All channels | every source side by side, two models | buyer + owner, weekly | KEEP |
| Creative > Tests and angles | have we tested this, angle scoreboard, concepts and their tests | strategist, weekly when briefing | MOVE to Ads (Cole: angles and tests are an ads thing). Only tests and angles: no calls, no buying decisions in it |

### Email and SMS ("Is email pulling its weight?")
| Page | Verdict |
| --- | --- |
| Klaviyo (one brand), the board across brands, subject lines and send times | KEEP. The tab is named after the brand's tool: Klaviyo, or Attentive once that integration exists (section 3) |

### Store ("What did the store and its visitors do?")
| Page | Verdict |
| --- | --- |
| Sales, Customers | KEEP |
| Website (GA4), Search (Search Console) | KEEP, shown only for a brand that has the property linked (today Lucky, Bonk, Party Patch). An empty "link it" page on every other brand is clutter; Integrations says what linking unlocks |

### Products (brands with a stock feed)
| Page | Verdict |
| --- | --- |
| Stock, Buying, Drops | KEEP as built on 2026-10-08. Drops' on-site dates should appear on the Lineup calendar when it lands |

### Creative ("What do we make next?")
| Page | For | Verdict |
| --- | --- | --- |
| Studio | make the ads | KEEP |
| Library | the brand's photos, looks | KEEP |
| Inspiration | Atria boards per brand and season | KEEP |
| Tests and angles | | MOVE to Ads (above) |
| Brand (Client answers, Research, Voice) | who the client is | MOVE to the new Brand item |
| Copy desk | lines in the brand's voice | MERGE into Studio as its "Words" mode. A line written there ends up in an ad, and Studio already writes lines per batch. Cole moved it out of Brand on Oct 5; this keeps it out of Brand and out of the rail |
| Creator link | the creators' page editor | MOVE to Brand (it is the brand's public page for creators, not a production tool) |

### Reports ("What do we send?")
| Page | Verdict |
| --- | --- |
| Daily Brief, Weekly and monthly, Dashboards | KEEP |
| Scheduled questions (now in Settings > The Strategist) | MOVE next to Dashboards: both are "things that post to Slack on a schedule", so one list |

### Rail foot and header
| Item | Verdict |
| --- | --- |
| Brand settings button, theme switch, profile menu | KEEP |
| "Ask the Strategist" button in the rail foot | CUT: the ask bar in the top bar (Ctrl+K) does the same |
| Hidden leftovers (`#btnGuide`, `#connChip`, `#btnOut`) | CUT (dead code, never shown) |
| Tour, Metrics, Help in the header | KEEP |

---

## 3. Audit: Settings and Integrations, top to bottom

Nobody had audited Settings field by field. Done now. Today: brand settings has 8 sections + 2 pages,
agency settings 7 sections + 1 page.

### Brand settings: every section and field
| Section / field | Who uses it, how often | Verdict |
| --- | --- | --- |
| **About the brand** | | |
| Brand name | Cole, once | KEEP |
| Meta ad account (+ Sync now) | Cole, at setup | MOVE to Integrations (Cole: it is an integration). It is also already a card there: a duplicate |
| Triple Whale shop | Cole, at setup | MOVE to Integrations (also already a card there) |
| Shopify (install link, Sync cohorts) | Cole, at setup | MOVE to Integrations (already a card there). Its help text is stale: it says Shopify "only powers cohorts", but Stock now runs on it |
| (missing) time zone, currency | read by every page | ADD read-only lines (they are on the brand row in the database, shown nowhere) |
| **Goals and rules** | | |
| Goal cost per sale, goal ROAS | Cole with the client, monthly | MOVE to Brand > Goals, beside the month's revenue, spend and MER. Today a client's goals live in two places (Plan, and here) |
| Judging tests, creative calls, test minimums | Cole, rarely | KEEP as **Ads rules** (they are rules, not goals) |
| Monday test calls in Slack (switch + preview) | Cole, once | MOVE to Slack and sending (it is a Slack post) |
| **Slack and sending**: internal channel, client channel, review first, daily brief on/off | Cole, at setup | KEEP. Gains every other post this brand makes: Monday test calls, the Stock post, the Yesterday post. One list: each post, on/off, which channel |
| **Money**: margin override | Cole, rarely | MERGE into Data and costs (its own help text says it is "the same setting as the Costs page") |
| **Stock and factories** | Cole, monthly (Lucky) | KEEP (only for brands with a stock feed); its Slack post switch moves to Slack and sending |
| **Connections** | Cole, at setup and when broken | KEEP, renamed **Integrations** (rebuilt, below) |
| **Data repairs**: re-pull 430 days of Triple Whale, re-pull 120 days of ad attribution | Cole, almost never | MERGE into Data and costs, as "Fix it" buttons under the check that would tell you to press them |
| **Remove from Locus** (its own section) | Cole, when a client leaves | MOVE to the bottom of About the brand as **Archive this brand** (reversible, nothing deleted), with an archive-box icon. A whole section for a once-a-year button is noise |
| Page: **Data check** (Data health) | Cole, when a number looks wrong | MERGE into Data and costs |
| Page: **Cost check** (Costs) | Cole, monthly | MERGE into Data and costs |

**Brand settings after: 6 sections** (5 for brands without stock):
1. About the brand: name, time zone, currency; Archive at the bottom.
2. Integrations.
3. Ads rules: judging tests, creative calls, test minimums.
4. Slack and sending: the two channels, review first, and one row per automatic post.
5. Stock and factories (brands with a stock feed).
6. Data and costs: is the data complete and fresh? are the costs right (margin override inside)? fix it (the two re-pull buttons).

### Agency settings: every section
| Section | Who, how often | Verdict |
| --- | --- | --- |
| Clients (every brand, New client, Add a brand) | Cole, at onboarding | KEEP |
| Connections (agency card) | Cole, when something breaks | KEEP, renamed **Integrations**, plus an "Every brand" grid: one row per brand, one chip per integration, so a gap across the agency is visible in one look (today you open each brand) |
| Team (who signs in, roles, brands they see) | Cole, rarely | KEEP, named **Team and access** (the name the profile menu already uses) |
| Briefs and Slack (brief time, who sends, What moved post) | Cole, rarely | KEEP, named **Slack and sending** to match the brand section |
| The Strategist (what it knows, Monday briefing, scheduled questions) | Cole, rarely | KEEP; scheduled questions move to Reports |
| Jobs and data + the Data health page | Cole, when a sync looks stale | MERGE into one **Data and jobs** section (the page is the all-brands version of the same check) |
| Guided tours | anyone, rarely | MOVE into "How to use Locus" (profile menu), which already holds the guide |

**Agency settings after: 6 sections**: Clients, Integrations, Team and access, Slack and sending,
The Strategist, Data and jobs.

### Icons
Today: About the brand and Remove both use the brand icon; Stock and Data repairs both use the clock;
Connections and Data health both use the health cross; the clock means "stock". None says what the
thing is. After, one icon per item, never repeated anywhere in Locus:

| Item | Icon |
| --- | --- |
| Home, Ads, Email and SMS, Store, Products, Creative, Brand, Reports, Black Friday, Tools | house, megaphone, envelope, shopping bag, box, paintbrush, bookmark, document, flame, wrench |
| About the brand, Integrations, Ads rules, Slack and sending, Stock and factories, Data and costs | id card, plug, sliders, paper plane, factory, stethoscope |
| Clients, Team and access, The Strategist, Data and jobs | building, person with key, sparkle, refresh circle |
| Archive this brand | archive box |

### Integrations (was Connections): every row today and after
The page today (account-health `src/integrations.js`, drawn in index.html): agency card with 19 rows,
brand card with 17 rows grouped Ad platforms / Store and analytics / Email and SMS / Team and work tools /
AI and creative.

Problems found:
- **Google Ads shows twice on a brand**: "Google Ads" (seen through Triple Whale) and "Google Ads account
  (direct)". And three Google rows on the agency side (Drive and Gmail; sign-in; Ads; plus GA4 and Search
  Console separately).
- **The direct ones give no link and no steps**: GA4, Search Console, Google Ads (direct) and TikTok
  (direct) are a paste box with one sentence. Meta, Klaviyo, Drive, Frame have steps; these do not.
- **Locus can already LIST the ids** but makes you paste them: Google Ads accounts under our manager
  (`listAccessibleCustomers`), GA4 properties and Search Console sites the service account sees, TikTok
  advertisers on our token, Meta ad accounts on no brand. All four are fetched today (google.js probe,
  tiktok.js) and thrown away.
- **Not integrations**: Slack internal / client channel (they are settings, and live in Slack and
  sending too: a duplicate), Creator link and Onboarding answers (they are Brand pages).
- **Email offers only Klaviyo**. Ice & Gold uses Attentive; today it shows a grey "Email: Attentive" note.

After, per brand, grouped by what Locus gets:
| Group | Integration | One card, states | How you connect (in the drawer) |
| --- | --- | --- | --- |
| Ads | Meta | connected / sync failing / none | pick from the Meta ad accounts Locus sees on no brand (a list, not a paste box); steps to add Mobius as a partner with the link |
| Ads | Google Ads | ONE card, two levels: "Through Triple Whale: spend and sales" and "Direct: campaigns and search terms" | pick from the accounts under the Mobius manager (MCC 556-646-8199); if missing, the exact steps and link for the client to accept our manager request |
| Ads | TikTok | one card, same two levels | pick from the advertisers our TikTok connection sees; steps and link to add our Business Center as a partner |
| Store | Triple Whale | connected / no data / none | steps: client adds us in Triple Whale (link), then the shop |
| Store | Shopify | installed / removed / none | the install link to copy, and what it unlocks (Stock, receipts, product names) |
| Website | Google Analytics 4 | linked / not readable / none | pick from the properties Locus sees; if missing, the steps and link for the client to add cole@ as Viewer |
| Website | Search Console | same | pick from the sites Locus sees; steps and link to add cole@ as a Full user |
| Email and SMS | Klaviyo OR Attentive (pick the tool) | connected / none | Klaviyo: today's key steps. Attentive: see below |
| Work | Asana project, Drive folder, Frame project | linked / none | as today (they already have steps) |

Agency side, after: Meta, Triple Whale, TikTok app, **Google** (one card with five checks inside: sign-in,
Drive and Gmail, Analytics, Search Console, Ads API), Asana, Slack, Stripe, Claude, OpenAI (Studio),
Gemini, Atria, Canva, Frame, video downloader, Lucky creator app (shown on Lucky only). Plus the
Every brand grid.

Every card's drawer has the same four parts: what Locus gets from it (one line), its state, the steps
with the exact link to open, and the picker (or a paste box only when Locus cannot list).

**Attentive, in plain words** (research below, section 4):
- What Locus can read TODAY without anything new: Attentive's revenue and orders, through Triple Whale
  (link tracking on in Attentive, `utm_source=attentive`). Campaigns only, no journeys, no clicks, no cost.
- What Attentive's normal key (a "custom app", made at ui.attentivemobile.com > Integrations > Create App)
  can read: almost nothing. That API is for sending data INTO Attentive; it has no campaign, journey,
  revenue or subject-line reads.
- What would give Klaviyo-level numbers: (a) Attentive's new MCP connection (beta; campaigns with their
  metrics, journeys, message content and subject lines, segment counts; Attentive has to switch the beta on
  and it signs in as a person, so it may not run unattended), or (b) nightly data files over SFTP (sends,
  opens, clicks, sign-ups, attributed orders by campaign; asked for through their account manager).
- So the Attentive card says: "Revenue and orders: yes, through Triple Whale. Campaign and journey
  detail: not yet; needs Attentive's beta connection or their data files." Building (a) or (b) is a
  separate decision, not part of this restructure.

---

## 4. Research: what the best tools do

**Navigation** (Triple Whale, Northbeam, Motion, Polar, plus research-v3.md):
- The winners have 5 to 7 top items grouped by job and push depth into page tabs. Triple Whale:
  store picker, Moby, then workspaces (Summary, acquisition, creative, retention...), Portfolio View for
  agencies. Northbeam: Overview, Attribution (Sales, Creative, Product), Orders; settings under the profile
  picture. Polar: one workspace per brand. Motion: reports only.
- Store settings are kept apart from workspace or agency settings everywhere (Triple Whale store vs pod,
  Northbeam profile settings, Polar workspace vs account). Locus already split them on Oct 8.

**Integrations**:
- Everyone groups by category, one tile per integration with a Connect button, and after signing in
  shows an **account picker** that lists what the login can see (Triple Whale's Google Ads popup lists
  every account under an MCC; Polar's ad connectors: sign in, pick accounts, save). Nobody asks a person to
  type a customer id.
- Attentive: Northbeam reads it through a file feed (visits, revenue and orders by campaign and journey,
  sign-ups, event logs; no spend); Polar through a middle service (SMS sent by campaign and journey,
  subscriptions, clicks); Triple Whale gets message attribution.

**The media buyer's daily list**:
- Triple Whale Moby (media buyer agent, 2026): flags scale, cut or pause on campaigns, ad sets and ads,
  each change in a review queue with the data and the reasoning; "ask every time" or "let Moby decide".
- Madgicx AI Marketer: a daily audit, one card per recommendation in this order: why, the data, the
  change, a summary; tabs Pending, Dismissed (with a reason), Completed.
- Revealbot / Birch: every rule has a data floor (no verdict on tiny spend).
- Nobody does it ad set first, nobody ties it to stock, and nobody spans every client in one list.

**Bad day: Breezeway "Was It a Bad Day?"** (https://headwinds.breezeway.co/, a free page from a $49 to
$149 Meta tool):
- A strip of day cards (sun, storm, a joke icon for very bad), one chart of a "CPA anomaly score" with a
  Bad and a Very Bad line, incident triangles from Meta and Shopify status pages, 60 / 180 days / all.
- How it decides: Meta CPA only, each of ~50 of their customers' brands against its own weekday history,
  combined into ONE score for the whole panel. It answers "is it Meta or is it us", never "was it a bad
  day for Dartee". Stated as the worst 5% of days; in its own data 72 of 484 days are Very Bad, so it cries
  wolf (Oct 4 to 8 all Very Bad).
- No per-brand view, no Google / TikTok / email / store, no reason beyond a hand-tagged incident, no alerts.
- Worth taking: comparing each brand with its own same weekday (What moved already does), the quick
  day cards, incident tags.

**Black Friday: Triple Whale's BFCM material**:
- No "war room": a BFCM workspace with a "Mission Control" board (last year's numbers to set goals,
  pacing), an hourly dashboard (cumulative revenue and cumulative contribution by hour), a profit vs revenue
  view, AI agents on last year's data, and a checklist blog. All per store; agencies get Portfolio View
  totals with no goal or pace per brand. Alerts check 3 times a day. Comparisons only against last year.
- What Locus already has that they do not: per-brand offers on a timeline, goals and an MER ladder,
  the 3-slot desk with last-3-hours MER, stock run-out by product, live Klaviyo.
- The one idea worth taking: cumulative contribution by hour (profit, not just revenue).

Sources: in the research notes of this chat; key ones: https://headwinds.breezeway.co/ ,
https://www.triplewhale.com/blog/bfcm-checklist , https://smartmarketer.com/triple-whales-bfcm-workspace/ ,
https://kb.triplewhale.com/en/articles/6224580-managing-multiple-businesses-portfolio-view ,
https://academy.madgicx.com/lessons/how-to-use-ai-marketer , https://docs.northbeam.io/docs/channels/attentive/overview ,
https://intercom.help/polar-app/en/articles/11738438-attentive , research-v3.md section 1.

---

## 5. Every move, with its reason

| Move | Reason |
| --- | --- |
| Plan > **Brand > Goals** (with goal CPA and ROAS from Settings) | Goals are what we agreed with the client. Today they live in two places (Plan; Settings > Goals and rules). One page for every number the client signed off, next to who the client is. Plan's month picker, verdict, quarter, retro and share link come along unchanged |
| Season > **its own item, named for the season** | It is a daily place for eight weeks a year and noise the other 44. Shown only while a season is on, so it costs nothing in March |
| Scenarios > **Tools** (rail foot) | They are calculators you open a few times a month, not a page you read. Pulse joins them when it moves in |
| What moved > **Home > Yesterday** | Same engine, grown into the bad-day view (section 6). Home keeps one line |
| (new) **Ads > Today** | Ads' question is "what do I change today", and nothing answered it in one place. Landing tab for Ahsan and Noma |
| Meta > Tests (test calls) > **rows in Ads > Today** | A test call is a buying decision; Cole: tests and angles should not hold buying decisions |
| Tests and angles > **Ads** | Cole: angles and tests are an ads thing. It reads the ads' results by angle |
| Copy desk > **Studio's Words mode** | Creative is Studio, Library, Inspiration. A written line ends up in an ad; Studio already writes lines |
| Brand pages + Creator link > **Brand** (new item) | Who the client is, what they told us, how they talk, what we agreed. Read when briefing and on client calls, by people and by the Strategist. Not Creative, and too much for Settings (Settings is how Locus behaves, Brand is what we know) |
| Meta, Triple Whale, Shopify > **Integrations** | They are integrations; they were in About the brand AND in Connections |
| Slack channels, Creator link, Onboarding > **out of Integrations** | Settings and pages, not integrations; each had a second copy |
| Money, Data repairs, Data check, Cost check > **Data and costs** | Four entries for one question: are this brand's numbers right, and how do I fix them |
| Remove from Locus > **Archive this brand**, bottom of About | A once-a-year action does not need a section; "archive" says it can come back |
| Monday post, Stock post > **Slack and sending** | Every automatic post of a brand in one list |
| Jobs and data + Data health > **Data and jobs** | The same check at agency level |
| Guided tours > **How to use Locus** | Help in one place |
| Scheduled questions > **Reports** | Beside Dashboards: both post themselves to Slack |
| Platform tabs (Google, TikTok, Website, Search) **show only when connected** | An empty "link it" page on every brand is clutter; Integrations says what each link unlocks |
| Meta > Creative browser **cut** | Duplicate of Creative, with a cut rule that contradicts it |
| Home: spend-by-platform chart **cut**, brand charts **merged** into the table | Duplicates |
| Every old page id **keeps routing** | Deep links in Slack, briefs and Asana: `plan`, `season`, `calc`, `tests`, `angles`, `copy`, `amb`, `brand`, `mtoday`, `mbrowser`, `health`, `costs` all land on their new home |

---

## 6. The three new pages (concept only; mocks are step 2)

### Home > Yesterday: "was yesterday a bad day, for every brand, and why"
**Replaces the What moved card and extends the 8am Slack post** (same engine, `movedMany`, grown up).
Agency first:
- **The grid**: one row per brand, one square per day for the last 14 days: Good, Normal, Bad, Very bad.
  Click a square = that day's reason. Top line: "Yesterday: 2 bad days (Dartee, Bonk). The market looked
  normal."
- **How a day is judged** (per brand, against its own same weekday over 8 weeks, like What moved): the
  money first (revenue, MER, cost per new customer), then each channel it runs (Meta, Google, TikTok cost per
  purchase on Triple Whale attribution; email revenue). Bad = worse than its normal by the What moved test
  (25%+ and 1.5+ standard deviations); Very bad = 2.5+. A spend floor so a $40 day never fires. We check it
  against our own record and tune it so Bad stays rare (Breezeway's cries wolf).
- **The reason, not just the verdict**, split into the link that broke: auction (CPM up), creative (CTR
  down), site (conversion down), basket (AOV down), volume (spend down or delivery stopped).
- **Is it us or the market?** Our own panel: if most of our brands' Meta CPM jumped the same day, it is
  the market. Plus platform outages from Pulse (Meta, Google, Shopify status). Breezeway's public score could
  be a third hint, but it is unofficial and could vanish; I would not depend on it.
- **What changed**: the Change Log for that brand in the 3 days before, email sends that day (a send day
  vs no send), a promo starting or ending (Season, Lineup later), a product going out of stock (Products),
  site conversion (GA4 where linked).
- **Slack at 8am**: one line per bad brand with its reason; one line "all normal" when nothing is.

### Ads > Today: "what do I change today" (the media buyer)
Lands here for Ahsan and Noma. All their brands in one list (per-brand access applies), sorted by money
at stake. Ad set first, every row with its reason and its number against the goal:
- **Yesterday line** per brand (from Yesterday).
- **Scale**: ad sets beating the goal with room (and stock OK to scale).
- **Cut**: ad sets over the cut line; ads in a failed set. Never the anchor of a working set: that row
  says "replace, don't kill".
- **Fix**: delivery stopped, spend pacing off the plan, tracking gap jumped, a sync failing, the
  product of a running ad set runs out inside its lead time.
- **Call**: tests ready for a call (from Test calls).
- **Refresh**: an anchor ad tiring (frequency up, CTR down) with "Brief the iteration".
- Each row: Open in Ads Manager, Done, Not now. Done writes a line to the Change Log, which the Daily
  Brief's "What we did" already reads. Rules are the brand's Ads rules; no automatic changes (Cole: the
  buyer decides).
- **Spend today**: one small hour-by-hour line per brand against a normal day (absorbs Meta > Today).

### Black Friday > War room (shell)
Lit from the list week (Nov 17) to Dec 2; the plan tab carries the season the rest of the time.
Agency first: one row per brand in season:
- live sales against the day's goal, by hour (hourly Triple Whale), and cumulative contribution by hour
  (the one Triple Whale idea worth taking);
- last 3 hours' MER against the ladder: scale / hold / pull back (today's Desk);
- the offer live right now and what changes next (Season phases);
- stock that runs out before Cyber Monday (Products);
- email and SMS sends today and their revenue;
- ad spend pace per platform; platform outages (Pulse);
- "Do next": the same row style as Ads > Today.
One brand = the same, larger, plus the desk slots and their log. The Season Desk tab moves in here.

---

## 7. Room for Lineup and Pulse
- **Lineup** (marketing calendar): room for one item, "Calendar", between Brand and Reports. My
  suggestion for the Lineup chat: year-round calendar for every brand; Season phases, Drops on-site dates
  and Klaviyo sends draw on it; promo days feed Yesterday's "what changed". Its chat decides.
- **Pulse** (ad platform outages): a page in Tools ("Platform status"), and its feed answers "is it the
  market" in Yesterday and the War room.

## 8. What I would NOT do (push back)
- No separate "Today" rail item for the buyer: Ads > Today is the same thing without an extra item,
  and the buyer lands on it.
- No "bad day" destination: it is one Home tab, one Home line and one Slack post.
- No Breezeway dependency: their score is Meta-only, noisy and unofficial.
- No automatic changes from Ads > Today (it lists, the buyer decides), same as customer value per ad.
- Products stays its own item (Cole's Oct 8 call), not folded into Store.

## 9. Questions for Cole
1. Sign-off on the rail (section 1) and the moves (section 5)?
2. Plan inside **Brand > Goals**: yes? (The other option is Plan in Tools, but goals are not a calculator.)
3. Copy desk inside **Studio** (Words mode), or keep it as its own Creative tab?
4. The season item's label: the season's name ("Black Friday"), shown only while it is on. Good?
5. Brand as its own rail item: yes, or would you rather it sit inside the client picker?

# Locus product map (2026-10-08; restructured 2026-10-09)

**2026-10-09 restructure (signed off; docs/handoffs/locus-structure-audit-step1.md):** Home = Overview, Yesterday, P&L. Ads = Today (the buyer's list), Meta, Google, TikTok, All channels, Tests and angles. Creative = Studio (Words = old Copy desk), Library, Inspiration. NEW Brand item = Goals (was Plan), Client answers, Research, Voice, Creator link. The season item (Black Friday, named in settings) = War room, The plan. Tools (rail foot) = Scenarios, Platform status (Pulse). Rows below keep their content; where a page moved, read its new home from this paragraph.

| New page | Reader | Blocks | Status |
| --- | --- | --- | --- |
| Home > Yesterday | everyone | 14-day verdict grid per brand, the link that broke on Meta, account changes, the market (our brands, Pulse, Breezeway, advertiser chatter); Slack 8am only on a bad day | LIVE |
| Ads > Today | buyer | scale / cut / trim / refresh / fix / test calls, ad set first, ranked by money at stake; Done logs to the Change Log | LIVE |
| Season > War room | owner, buyer | per brand in season: offer live now, next change, today so far live | LIVE (shell) |
| Tools > Platform status | everyone | Pulse: platforms now, recent changes | LIVE |

One page that says where everything lives, who opens it, what question it answers and how the data is framed for
that reader. Every new feature gets a row here before it is built. Research behind it: research-v3.md (navigation,
ask bar, Triple Whale / Hyros / Hiro features, creative visuals, cut and scale rules), spec-v2.md (screens).

## The readers, and how each one reads data

| Reader | Opens Locus to | Frames data as | Never wants |
| --- | --- | --- | --- |
| Owner (Cole) | Is each brand making money, will we hit the month, is the agency healthy | Money first: revenue, contribution margin, MER against plan; one line per brand; red only when it costs money | Ad-level noise |
| Media buyer (Ahsan, Noma) | What do I change today | Cost per result against goal, the trend, what changed, by campaign > ad set > ad; a call on every row (scale, watch, cut) | A number without a goal beside it |
| Creative strategist | What do we make next | By angle, format, hook, persona; thumbnails first, numbers second; proven vs dead | Spend tables with no creative |
| Editor and designer (Ravo, William) | What am I making and is it right | The brief, the references, the product photos | Metrics |
| Client (share links today, a portal later) | Is the agency working for me | Plain outcomes: revenue, orders, MER, what we did, what is next; no internal diagnostics, no other brands | Jargon, attribution debates |

## The map

Status: LIVE = shipped, BUILT = shipped and waiting on a setup step, NEXT = this quarter, LATER = after that.

### Home: "Is the book making money and where is it leaking?"
| Page | Reader | Blocks | Status |
| --- | --- | --- | --- |
| Overview | everyone (agency) / owner (brand) | the read, money tiles with goal bullets, pace to plan, revenue by day with compare, channel split, site funnel, brand small multiples | LIVE |
| Overview: What moved | everyone | anomaly feed: yesterday against the same weekday over 8 weeks, split into spend, CPM, CTR, CVR, AOV; posts to Slack at 8am | LIVE |
| Overview: pinned tiles | everyone | each person stars the tiles they want first | NEXT |
| P&L | owner | waterfall from revenue to contribution, daily chart, cost health | LIVE (v2 look in progress) |
| Plan | owner | the three numbers, the verdict, pacing, quarter | LIVE (v2 look in progress) |
| Season | owner, strategist | offers, gantt, goals and ladder, the desk, to-do | LIVE |
| Scenarios | owner, strategist | lead math and ROAS math, saved and shared | LIVE |

### Ads: "Is the spend working, what do I change today?"
| Page | Reader | Blocks | Status |
| --- | --- | --- | --- |
| Meta > Overview | buyer | verdict, tiles, funnel, spend by campaign with change markers, CPA by day, campaigns | LIVE |
| Meta > Campaigns | buyer | campaign > ad set > ad with covers and previews, orders drill | LIVE |
| Meta > Creative | buyer, strategist | ads grid with calls (rule set per brand in Settings > Goals), spend vs CPA map, hook vs hold, fatigue, launch cadence, angle and format rollups | LIVE |
| Meta > Creative: funnel grade per ad (A to F for hook, hold, CTR, add to cart, purchase) naming what to iterate, with "Brief the iteration" | strategist | | LIVE |
| Meta > Creative: 90-day customer value per ad (Hyros-style), from order touches + customers | buyer, owner | LTV and LTV:CAC columns | LIVE |
| Meta > Tests | buyer | to call, running, Monday calls | LIVE |
| Meta > Changes, Today, Creative browser | buyer | change log with why, today vs a normal day, every ad with copy | LIVE (v2 look in progress) |
| Google | buyer | Triple Whale totals today; campaigns by type from Google Ads once connected | BUILT (waits on developer token) |
| Google: search terms, Performance Max product groups, brand vs non-brand spend | buyer | | LATER |
| TikTok | buyer | Triple Whale totals; direct later | LIVE / LATER |
| All channels | buyer, owner | every source side by side, platform vs Triple Whale gap | LIVE |
| All channels: two attribution models side by side | buyer | | LIVE |

### Email and SMS: "Is email pulling its weight?"
| Page | Reader | Blocks | Status |
| --- | --- | --- | --- |
| Klaviyo (one brand) | retention lead, owner | revenue, flows vs campaigns, flow table with core-flow gaps, campaigns with benchmark pills, lists and segments | LIVE |
| Agency email board (all brands against targets, pacing), Hiro-style | owner | | LIVE |
| Subject lines and send times | retention lead | which words and hours win | LIVE |
| Flow map, SMS revenue per message | retention lead | | LATER |

### Store: "What did the store and its visitors do?"
| Page | Reader | Blocks | Status |
| --- | --- | --- | --- |
| Sales | owner | revenue bridge, new vs returning, by day, what goes in the cart | LIVE |
| Customers | owner | LTV:CAC verdict, value curve, cohorts, first product to next | LIVE (v2 look in progress) |
| Website (Google Analytics 4) | owner, buyer, CRO | sessions, engagement, conversion, funnel visit to purchase, channels, landing pages with leaks, devices, UTMs | BUILT (waits on Google setup) |
| Search (Search Console) | owner, strategist | clicks, brand vs non-brand, queries just off page one, top pages | BUILT (waits on Google setup) |
| Products (needs the Shopify app) | owner | units, revenue and refunds per product (stock runway now lives on Stock) | LATER |
| Stock (brands with a stock feed; Lucky) | owner, buyer | what to order, how many, by when: tiles (to order, on the way, revenue at risk, dead stock), Needs a decision (running out, too much stock, fine), All products (sold 90d, sell-through, weeks of stock), tick and Create order. From Supply (the old app retires) | LIVE |
| Stock: the product panel | owner, buyer | one chart (90 days of sales, then the shelf ahead, with a try-an-order), sizes, why this rate, kind of product, minimum, lead time | LIVE |
| Buying (brands we buy for; Lucky) | owner | one card per factory order to place (units, cost, lands if placed today, minimum resolved), orders on the way as a timeline, received counts; landing detected from Shopify stock | LIVE |
| Drops (brands that make their own products; Lucky) | owner, designer | drops by date, designs and their stage from Asana, next due, keep or cut per line with a target, the sample, where it is | LIVE |
| Brand settings: Stock and factories | owner | factories (lead time, minimum, closures), product groups, 4 rules, design timing, the stock Slack post | LIVE |
| Ads: stock chip on ad sets and ads | buyer | "runs out <date>" where a product's run-out falls inside its lead time; a Scale call says so | LIVE |
| Strategist: stock view | everyone | what runs out, what is at risk for a date, what to order; actions: log an order, mark a product, add a design; knowledge file stock.md | LIVE |

### Creative: "What do we make next?"
| Page | Reader | Blocks | Status |
| --- | --- | --- | --- |
| Tests and angles | strategist | have we tested this, angle scoreboard, concepts and tests | LIVE (v2 look in progress) |
| Studio | strategist, designer | batches from briefs, review, Canva | LIVE (v2 look in progress) |
| Brand | strategist | client answers, research, voice | LIVE (v2 look in progress) |
| Copy desk | strategist | lines in the brand's voice | LIVE (v2 look in progress) |
| Creator link | strategist | the creators' page editor | LIVE (v2 look in progress) |
| Inspiration (Atria boards per brand and season) | strategist | | LIVE |
| "Make more like this": a winner on Meta > Creative opens a Studio batch or an Asana brief prefilled | strategist | | LIVE |

### Reports: "What do we send?"
| Page | Reader | Blocks | Status |
| --- | --- | --- | --- |
| Daily Brief, Weekly and monthly | buyer | draft, check, send | LIVE (v2 look in progress) |
| Dashboards | everyone | built by hand or by the Strategist, posted to Slack | LIVE |
| Scheduled questions ("ask this every Monday, post to Slack") | everyone | | LIVE |
| Client portal: each client signs in and sees their brand (Overview, Sales, Website, reports, their ads) | client | needs per-brand access | LATER |

### Everywhere
| Feature | Status |
| --- | --- |
| Six-item rail, page tabs, real platform logos | LIVE |
| Ask bar with per-page questions, jump to page or brand (Ctrl+K) | LIVE |
| Answers drawn as charts and tables in a side panel, "pin to a dashboard" | LIVE |
| Command palette finds any campaign or ad by name | LIVE |
| Per-brand team access, then client logins | LIVE (team); client logins LATER |

## Google, exactly

| Product | Needed? | Gives | Setup (Cole, once) |
| --- | --- | --- | --- |
| Google Ads | Yes | campaigns, types, search terms, exact spend | Mobius manager account > Admin > API Center > apply for a developer token; set GOOGLE_ADS_DEV_TOKEN and GOOGLE_ADS_MCC; add the adwords scope to the service account's delegation; enable the Google Ads API; each client's account linked under the manager |
| Google Analytics 4 | Yes | website analytics (Store > Website) | add analytics.readonly to the delegation; enable Analytics Data API + Admin API; Cole as Viewer on each client's property |
| Search Console | Yes | organic search (Store > Search) | add webmasters.readonly to the delegation; enable Search Console API; Cole as user on each client's property |
| AdSense | No | it pays sites for SHOWING ads; our brands buy ads | none |
| Merchant Center | Later | product feed health for Shopping and PMax | later |

The service account (client id shown on Settings > Connections) already signs in as Cole for Drive and Gmail, so no
new login is needed: only the three scopes, the three APIs and the developer token.

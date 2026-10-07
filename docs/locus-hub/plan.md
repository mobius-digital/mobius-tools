# Locus as the hub (plan, 2026-10-07)

Cole's ask (from the "Golf ad campaign brief analysis" chat, 2026-10-07): Locus becomes the one
place the agency looks every day. An Overview at least as good as Triple Whale's, categories
down the left (Paid ads with one dashboard per platform, Email and SMS, Store, Customers,
Creative), every platform we use connected, dashboards the team can ask for in chat and keep,
an analysis strip at the top that names the leaks and the focus, the Strategist in context on
every screen, the same in Slack, and a look that is modern, futuristic and professional.

This file is the plan. The page version for reading is the "Locus Hub Plan" artifact.

## 0. Straight answers to the questions in the ask

- **Is Locus fully operational?** The agency half is. Store money (Triple Whale blended),
  Meta, Klaviyo (per-brand key, since 2026-10-07), Shopify (the app), Asana, Slack, Frame,
  Drive, Atria and Stripe are connected and graded on Settings > Connections. The reporting
  half is not: Google, TikTok and GA are not connected at all, and the Overview still shows a
  short list of blended numbers, not a Triple Whale level dashboard.
- **Google.** Nothing is connected. One Google Cloud project with OAuth, a Google Ads
  developer token on a manager account (MCC) that Google reviews before it reads other
  accounts, then one consent per brand. The same Google app and consent covers YouTube ads
  (they live inside Google Ads), Search Console and GA4 with extra scopes. AdSense is
  publisher revenue and does not apply to our brands.
- **TikTok.** Nothing is connected. A TikTok for Business developer app, reviewed by TikTok,
  then one consent per brand's ad account.
- **Model routing.** Already automatic since this morning (commit 94455ad): the Ask engine
  picks Haiku for lookups, Sonnet for drafting, Opus for judgement, from the question itself.
  "quick" and "deep" in the message override it. It never asks the user which model. Keep it
  that way; asking is friction nobody wants.
- **Any report we could want.** Today the Strategist builds a one-off report page from numbers
  it fetched (`make_report`). What is missing is a SAVED dashboard that refreshes, lives in the
  rail, and can post itself to Slack. That is section 4.

## 1. What Locus is today

- Rail: Every day (Overview, Daily Brief, Meta with Overview / Tests / Creative / Change Log),
  Every week (Reports, Profit with Customers), Making ads (Studio, Brand with Creator link),
  Monthly and setup (Plan, Settings with Data health and Costs). Season and Scenarios beside.
- Data in the shared D1: `tw_daily` (Triple Whale summary metrics per day per brand),
  `tw_orders` (400 days of journeys), `tw_ad_attr` (per-ad attribution), Meta `daily_insights`,
  `hourly_insights`, `ad_daily`, `ads`, `activities`; Klaviyo read live by key; Shopify by app
  token; Asana by token.
- The Ask engine: one assistant across apps, views that call the screen's own functions,
  `make_report`, Apply cards, Slack and in-app, three model tiers.
- Limits that shape the plan: Triple Whale has no SQL door (summary-page and orders endpoints
  only); the Cloudflare account is at its 5 cron trigger limit; the dashboard is one vanilla
  JS file on GitHub Pages plus `meta.js`, `brand.js`, `amb.js`, `studio.js`, `season.js`.

## 2. The hub: how the left rail is organised

Organised by the QUESTION a person walks in with, then by platform inside it. A scope switch
at the top of every screen: one brand, or all brands (the agency view). A date range and a
compare toggle beside it; both persist as you move between screens.

```
HOME                 Overview (the agency or the brand at a glance), Daily Brief
PAID ADS             All channels, Meta, Google, TikTok      (one skeleton per platform)
EMAIL & SMS          Klaviyo: revenue share, campaigns vs flows, list, pop-ups, cohorts
STORE                Shopify and Triple Whale: sales, orders, AOV, products, new vs returning
CUSTOMERS            Cohorts, repeat, LTV:CAC, time to second order (moves out from Profit)
CREATIVE             Studio, Brand, Tests and angles, Creator link
REPORTS              Weekly and monthly, Dashboards (saved, see 4), Scenarios, Season
MONEY & PLAN         Profit, Costs, Plan
SETTINGS             Connections, Data health, New client, Team
```

Why this and not the current "Every day / Every week": the current grouping says WHEN to look,
which only Cole knows. "Paid ads", "Email", "Store" is how Ahsan, Noma and a client all think.
Old tab ids keep routing, so Slack buttons and deep links do not break.

Phone bar: Home, Paid, Email, Store, More.

## 3. The screens

### 3.1 Home (Overview rebuilt)

Top to bottom, for one brand or all brands:

1. **The read** (the analysis strip, section 5): three lines. What is happening, where it is
   leaking, what to do today. A button: "Ask about this".
2. **Money row**: Sales (Shopify total minus tax, the one definition), Orders, AOV, Blended ad
   spend (Meta + Google + TikTok + anything else we track), MER, aMER, New customer revenue
   and share, Contribution margin. Each with yesterday / 7 days / month to date and a delta
   against the compare period. Spend today and yesterday is the question Cole walks into
   Triple Whale for; it sits here.
3. **Pace**: month to date against the Plan, as the thin bar Plan already draws.
4. **Channels**: a stacked chart and a table. Spend and Triple Whale attributed revenue per
   channel (Meta, Google, TikTok, Email and SMS, Organic and direct), ROAS, CPA, new customer
   share. Attribution is Triple Whale lastPlatformClick everywhere, never platform counts.
5. **Daily chart**: revenue and spend by day with the compare period ghosted.
6. **Agency view only**: one row per brand with the same money row compressed, sorted by what
   needs attention (worst delta first), click to drop into the brand.

Everything here already has a source: `tw_daily` carries the Triple Whale summary metrics,
`p_plan` the plan, `tw_ad_attr` the per-channel attribution. New work is the layout, the
scope switch, the compare period and the read.

### 3.2 Paid ads: one skeleton, one dashboard per platform

The Meta tab today is the model: Overview (spend, delivery, Triple Whale purchases, revenue,
ROAS, CPA, today curve, 7 vs 30), Tests, Creative (cards with Scale / Watch / Cut), Change
Log. Google and TikTok get the same four screens with the same labels, the same verdict
chips and the same attribution rule, so the buyer learns one screen. "All channels" is the
channel table from Home plus budget pacing per platform.

Google specifics: campaign types (Search, Shopping, PMax, YouTube) as the first split; search
terms and the brand vs non-brand split; Shopping product groups. TikTok specifics: creative
fatigue is faster, so the Creative screen defaults to 3 days against 7.

### 3.3 Email and SMS (Klaviyo)

Already connected per brand; the dashboard is new. Revenue and share of store revenue,
campaigns vs flows, list and SMS growth, pop-up and welcome-flow conversion, revenue per
recipient, unsubscribe and spam, top flows and top campaigns, and a cohorts view (who bought
again after a flow). Klaviyo's reporting endpoints give campaign and flow values; the pop-up
form metrics come from the forms endpoints.

### 3.4 Store

What Shopify shows and Triple Whale summarises: sales, orders, AOV, discount share, refund
share, products and variants ranked, new vs returning, the hourly curve for today. The Shopify
app token already reads orders and products for brands on the app; Triple Whale fills in the
rest.

### 3.5 Customers

Moves out from under Profit. Cohorts by first-order month, repeat rate, time to second
order, LTV to CAC, first and second carts, sources of first orders. All from `tw_orders`
(400 days), which is the limit until Triple Whale opens a SQL door.

### 3.6 Creative, Reports, Money and plan, Settings

Existing screens, regrouped. Tests and angles sit under Creative for the strategist and stay
reachable from Paid ads > Meta for the buyer (same page, two doors). Reports gains
Dashboards (section 4).

## 4. Dashboards the team asks for

Two kinds, one engine:

- **One-off**: exists today. "Show me Lucky's spend by channel this month against last" gives a
  report page in the chat and in Slack. Unchanged.
- **Saved**: new. The Strategist turns the same request into a dashboard SPEC instead of a
  rendered page: a titled grid of tiles, charts and tables, each bound to a named view and its
  parameters (brand or all, range, compare), plus a schedule. Stored in a new `p_dashboard`
  table. One renderer draws every saved dashboard from its spec with live numbers each time it
  opens. "Pin it" puts it under Reports > Dashboards (or on a brand's Home as a tab). A
  schedule posts the same dashboard to a Slack channel as blocks and an image on a cadence
  (daily 8am, Monday, the 1st).

The flow Cole described, as it would run: Cole asks Ahsan in Slack what he looks at every day.
Ahsan answers in the thread. Cole tags the Strategist: "build Ahsan a dashboard from this". The
Strategist reads the thread, maps each item to a view it has, says what it cannot get, and
shows the dashboard as an Apply card. Apply saves it, pins it under Reports > Dashboards, and
offers the Slack schedule. If an item needs a view that does not exist, the card says so and
`hand_to_claude_code` files it for Cole.

## 5. The read (analysis at the top of every screen)

A short cached analysis per screen and scope: three lines, then "Leaks" (up to three, each a
number and a cause) and "Focus" (one thing). Written by the Strategist on the Sonnet tier from
the exact views the screen renders, so it never cites a number the screen does not show.
Cached 60 minutes per brand and screen; made on open, not on a cron (the account is at its
cron limit, and most screens are not opened every hour). Cost is roughly one to three cents
per read; a heavy day across every brand and screen is a few dollars.

"Ask about this" opens the Strategist with the screen's views and scope already loaded, so the
next question continues from what is on screen. In Slack the same read heads the Daily Brief
for the brand.

## 6. Who sees what every day

The default landing per role, and what the morning Slack post carries. These are inferred
from what the team asks in Slack today and should be confirmed by asking them (section 9).

| Role | Lands on | Looks for | Slack, every morning |
| --- | --- | --- | --- |
| Cole | Home, all brands | Which brand is off pace, spend vs plan, margin | The agency read, one line per brand |
| Ahsan (media buyer) | Paid ads > Meta > Test calls | Calls to make, pacing, fatigue, budget changes | Test calls due, spend vs budget per brand |
| Noma / Ahsan (strategy) | Creative > Tests and angles | What won, what to brief next, have we tested this | Winners and losers judged yesterday |
| Ravo (editor) | Creative > Creator link, Asana | Examples to cut to, briefs assigned | Nothing new; Asana does this |
| Client | Share links only | Blended money, the weekly report | The Daily Brief as today |

Role defaults already exist as `ROLE_TABS`; they get the new landing screens.

## 7. The look

Cole's bar: modern, futuristic, professional, visual, never a Canva collage. One design pass on
the shell before any build, as mocks of three screens: Home (agency and brand), Paid ads >
Meta Overview in the new skeleton, Email and SMS. Rules the mocks must follow and the build
inherits:

- One system (mobius.css), Locus blue as the only accent; good / warn / bad reserved for state.
- Dark mode first class, not inverted.
- Dense but airy: a money row of eight tiles reads in one glance; everything else below the
  fold is a chart or a ranked table, not prose.
- Charts to scale, compare period ghosted, the endpoint emphasised, a verdict chip wherever
  a number implies an action.
- The read at the top is text, limited to three lines plus leaks and focus. Never a wall.
- Lucide icons only.

## 8. Phases and effort

| Phase | What ships | Depends on | Effort |
| --- | --- | --- | --- |
| 0 | Mocks of Home, Paid ads skeleton, Email; the rail regrouped on paper; Cole approves | this plan | 1 day |
| 1 | Rail regrouped, scope switch (brand / all), range and compare persisted, Home rebuilt, the read on Home | 0 | 3 to 4 days |
| 2 | Saved dashboards: `p_dashboard`, the spec, the renderer, Pin, Slack schedule; the Strategist builds them from a thread | 1 | 3 days |
| 3 | Email and SMS dashboard from Klaviyo; the read on every screen | 1 | 2 days |
| 4 | Google: Cloud project, Ads developer token, per-brand consent, sync into `ad_daily`-shaped tables, the Paid ads skeleton for Google; Search Console and GA4 behind the same consent | Cole's Google setup | 4 to 5 days plus Google's review |
| 5 | TikTok: developer app, consent, sync, the skeleton | Cole's TikTok app | 3 days plus TikTok's review |
| 6 | Store and Customers screens in the new shell; role landings; the team interviews folded in | 1 | 2 to 3 days |

Order of value: 1, 3 and 2 give the team a Triple Whale level hub on data we already have in
about two weeks. 4 and 5 are gated on outside approvals, so they start now (section 9) and
land when Google and TikTok say yes.

## 9. What Cole does

- Approve the rail (section 2) and the three mocks when they land (phase 0).
- Google: make the Google Cloud project under go-mobius-digital.com, apply for a Google Ads
  developer token on the Mobius manager account, add the brands' Google Ads accounts under
  that manager. The worker does the rest once the token exists.
- TikTok: create the TikTok for Business developer app and submit it for review.
- Ask Ahsan and Noma in Slack what they look at every day (or let the Strategist ask them in a
  thread); the answers become the first saved dashboards and confirm section 6.
- Decide: does the client ever see the hub, or share links only (plan assumes share links).

## 10. Not in this plan

- Creator link seeding from a reviewed brief: its own plan, `docs/strategist-brain/hub-seeding-plan.md`.
- Meta push from Studio.
- A Triple Whale SQL door (does not exist; cohorts stay on `tw_orders`).

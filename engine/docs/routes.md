# Routes

Made by `node engine/worker/tools/gen-lists.mjs`. Do not edit by hand.

130 routes: 65 answered by the engine (ported), 65 forwarded to the old engine.

## platform

| Method | Path | Who | Brand | Answered by | What it is for |
|---|---|---|---|---|---|
| POST | `/v1/compare` | owner | opt | ported | Owner only. Run one read route on the old engine and on this one, as you, and list the differences. |
| GET | `/v1/engine` | owner | none | ported | Owner only. The switch: the mode (new or old) and the routes that are sent back to the old engine. |
| PUT | `/v1/engine` | owner | none | ported | Owner only. Set the mode to old to send everything back to the old engine, or list single routes to send back. |
| GET | `/v1/health` | anyone | none | ported | Is the engine up, which mode it is in and how many routes it has. |
| GET | `/v1/metrics/definitions` | team, client | none | ported | What every number on the screens means, in plain words, with its formula and source. |
| GET | `/v1/routes` | owner | none | ported | Owner only. Every route the engine knows: who may use it, what it is for and whether it is answered here or forwarded. |

## orgs

| Method | Path | Who | Brand | Answered by | What it is for |
|---|---|---|---|---|---|
| GET | `/ah/api/clients/invite-info` | anyone | none | forwarded | What an invite link shows before sign in: whose invite and which brands. |
| POST | `/ah/api/clients/login-link` | anyone | none | forwarded | Email a one time sign in link to an invited client. |
| POST | `/ah/api/clients/signin` | anyone | none | forwarded | Sign in with a one time link from an email. Answers with a new session. |
| GET | `/ah/api/clients` | team | opt | ported | The client logins and the brands each can open. A teammate with a brand list sees only those brands. |
| POST | `/ah/api/google-login` | anyone | none | forwarded | Sign in with a Google account. Answers with a new session. |
| GET | `/ah/api/me/prefs` | team, client | none | ported | Your own preferences: the morning message switch and the snoozed reminders. |
| PUT | `/ah/api/me/prefs` | team, client | none | ported | Save your own preferences. One settings row, your own. |
| GET | `/ah/api/me` | team, client | none | ported | Who is signed in: email, role and, for a client login, its brands. |
| GET | `/ah/api/settings` | team | none | ported | The agency settings: the switches, times and channels the settings screens show. |
| PUT | `/ah/api/settings` | team | none | ported | Save agency settings. Only the settings named in the body are written, nothing is sent. |
| GET | `/ah/api/team` | team | none | ported | The team list: who can sign in, view only or not, guest or not, and the brands each one sees. |

## brands

| Method | Path | Who | Brand | Answered by | What it is for |
|---|---|---|---|---|---|
| PUT | `/ah/api/accounts/:id` | team, client | path | ported | Save the name, time zone, budgets and goals of one brand: one row. A body with status, channels, the brief switch or the tracker shop is sent on to the old engine. |
| GET | `/ah/api/accounts` | team, client | none | ported | The brands in the old row shape (budgets and goals read out), the ad accounts no brand has yet, and when the last scan ran. A client gets its own brands and no scan stamp (noDiscover). |
| GET | `/ah/api/brands` | team | none | ported | Every brand with its status, channels, goals and connections, and the kinds a connection can be. A teammate with a brand list gets those brands only. |
| GET | `/ah/api/integrations` | team, client | none | forwarded | The agency connections and the connections of each brand, with what is set and what is missing. |
| POST | `/ah/api/tiktok/start` | team | none | forwarded | Start the TikTok ads sign in. Answers with the address to open. |
| GET | `/ah/api/tiktok/status` | team | none | forwarded | Is the agency signed in to TikTok ads, and which ad accounts it reaches. |
| GET | `/pw/api/brand/rules` | team, client | need | ported | The test and call rules of one brand, with its goal ROAS. |
| PUT | `/pw/api/brand/rules` | team, client | need | forwarded | Save test and call rules for one brand. The old worker merges one name at a time. |
| GET | `/pw/api/brand` | team, client | need | ported | The research, angle library and creative tests of one brand, with their numbers. A client never gets stored keys of outside tools (noDocSecrets). |
| GET | `/pw/api/costs/sheet` | team | opt | forwarded | No old read exists for a cost sheet. The old answer is passed through as it is. |
| POST | `/pw/api/costs/sheet` | team, client | need | forwarded | Check a product cost sheet, and save it when dry_run is false. |
| DELETE | `/pw/api/costs` | team, client | need | forwarded | Remove one cost rule (id) or one uploaded cost sheet (sheet). The old worker answers with the whole Costs page. |
| GET | `/pw/api/costs` | team, client | need | forwarded | The Costs page of one brand: the cost check, where each cost comes from, the rules, fixed costs and what is missing. |
| PUT | `/pw/api/costs` | team, client | need | forwarded | Add one shipping or product cost rule, or change one by id. The old worker answers with the whole Costs page. |
| GET | `/pw/api/expenses` | team, client | need | forwarded | The fixed cost list of one brand, the choices, and where each cost per order comes from. |
| PUT | `/pw/api/expenses` | team, client | need | forwarded | Replace the whole fixed cost list of one brand. |

## metrics

| Method | Path | Who | Brand | Answered by | What it is for |
|---|---|---|---|---|---|
| GET | `/ah/api/overview` | team, client | opt | forwarded | The ad account view of every brand: spend, pace against budget, sync state and changes in the last day. |
| GET | `/ah/api/series` | team, client | need | ported | The ad account numbers of one brand a day (spend and delivery from the ad platform, purchases and revenue from the tracker) and the changes to mark on a chart. |
| GET | `/pw/api/client` | team, client | need | ported | One brand: the store by day, the totals, month to date, extra costs, the goals and the plan so far. Sent to the old engine when the window includes today or is a single day. |
| GET | `/pw/api/forecast` | team, client | need | ported | Where the month lands for one brand: spending the budget, at the pace of today, and what it takes to hit the goal. |
| GET | `/pw/api/hub/live` | team, client | opt | forwarded | Today so far for one brand or all: sales, ad spend and orders, read live. |
| GET | `/pw/api/overview` | team, client | none | ported | Home: every brand of the caller with its window totals, month to date, the day series, the platform split, goals and the cost check. Sent to the old engine when the window includes today or the cost check is old. |
| GET | `/pw/api/plan` | team, client | need | ported | The plan of one month for one brand: the last eight months, the basis, the growth choices, what was agreed and the pace. |

## store

| Method | Path | Who | Brand | Answered by | What it is for |
|---|---|---|---|---|---|
| GET | `/ah/api/clarity` | team, client | need | forwarded | Scroll depth, rage clicks and dead clicks per page, for one brand. |
| GET | `/ah/api/google/search` | team, client | need | forwarded | What people search before they reach the site, for one brand. |
| GET | `/ah/api/google/website` | team, client | need | forwarded | Website visits, carts, checkouts and pages for one brand. |
| GET | `/ah/api/klaviyo` | team, client | need | forwarded | Email tool numbers for one brand: lists, campaigns, flows, daily joins and leaves. |
| GET | `/ah/api/supply/client` | team, client | need | forwarded | The stock state of one brand: what is on hand, on order and running low. |
| GET | `/pw/api/customers` | team, client | need | ported | What a new customer costs, whether the first order pays it back, and the customer journey of one brand. Forwards when the brand has its own cost rules or the kept product names are over a day old. |
| GET | `/pw/api/hub/email` | team, client | need | ported | Email and text sales, campaigns against flows and the share of store sales, by brand and by day. |
| GET | `/pw/api/hub/stockads` | team, client | need | ported | The ad spend tied to each product over the last 30 days, from the orders each ad won. Forwards when many brands are asked at once. |
| GET | `/pw/api/hub/store` | team, client | need | ported | Sales, orders, discounts, returns, new against returning and what sells, by brand and by day. Forwards when the kept product names are over a day old. |

## ads

| Method | Path | Who | Brand | Answered by | What it is for |
|---|---|---|---|---|---|
| GET | `/ah/api/activities` | team, client | need | ported | The change log: every change on the ad accounts, newest first, for one brand or every brand of the caller. |
| GET | `/ah/api/ad-creatives` | team, client | need | forwarded | The picture, video and landing page of the named ads. |
| GET | `/ah/api/ad-updates` | team, client | need | ported | The ad changes of one brand that carry a reason written for the client, with before and after, newest first. |
| GET | `/ah/api/buyer-list` | team, client | need | forwarded | The ad calls of today from the ad rules, with the ads behind each. |
| GET | `/ah/api/google/ads-ads` | team, client | need | forwarded | Google Ads ads and asset groups, top by spend. |
| GET | `/ah/api/google/ads-changes` | team, client | need | forwarded | The change history Google keeps for one brand, last 30 days. |
| GET | `/ah/api/google/ads-terms` | team, client | need | forwarded | Google Ads search terms, top by spend. |
| GET | `/ah/api/google/ads` | team, client | need | forwarded | Google Ads campaigns and days, as Google counts them. |
| GET | `/ah/api/launch/list` | team, client | need | ported | The ads loaded through the app with their last known state. Forwarded when refresh is asked or a learning waits to be filed. |
| GET | `/ah/api/leaks` | team, client | need | forwarded | The leak finder: wasted spend on Google and TikTok, with fixes. |
| GET | `/ah/api/meta/live` | team, client | need | forwarded | Campaigns, ad sets, ads and budgets as Meta has them right now. |
| GET | `/ah/api/pacing` | team, client | need | forwarded | Meta spend by hour today against a usual day. |
| GET | `/ah/api/tiktok/report` | team, client | need | forwarded | TikTok campaigns and days, as TikTok counts them. |
| GET | `/pw/api/ad-creatives` | team, client | need | forwarded | The picture, video and landing page of the named ads (the profit address of the same route). |
| GET | `/pw/api/hub/command` | team | opt | forwarded | The agency view: why each brand needs attention. Team only. |
| GET | `/pw/api/hub/creative` | team, client | need | ported | Every Meta ad of one brand with spend in the window, judged inside its ad set, with rollups by format, angle and type. |
| GET | `/pw/api/hub/paid` | team, client | need | ported | Spend, delivery and credited sales per brand for Meta, Google, TikTok or all channels, with the window before. |

## production

| Method | Path | Who | Brand | Answered by | What it is for |
|---|---|---|---|---|---|
| POST | `/ah/api/actions/done` | team | none | forwarded | Tick a task done, or back to open. |
| POST | `/ah/api/actions` | team | opt | forwarded | Add a task to the team list, for a brand or for the agency. |
| GET | `/ah/api/assets` | team, client | need | ported | The photo library of one brand: the pictures that match the search, counts by state and setting, and where it is read from. |
| GET | `/ah/api/calendar` | team, client | need | forwarded | The marketing calendar of one brand or all brands between two days: dates, countdown steps, emails, planned sends and social posts. |
| GET | `/ah/api/mywork` | team | none | forwarded | The work list of one person: tasks, cards, chat asks and plan lines, with their notes and saved items. |
| GET | `/ah/api/production/card` | team, client | none | forwarded | One card: its brief, files, versions, notes and comments. A client may open only a card of its own brand. |
| GET | `/ah/api/production/photos` | team | none | forwarded | The photo of each person on the team, by name, for the faces on cards. |
| GET | `/ah/api/production` | team, client | need | forwarded | The production board: every open card of a brand or of all brands. A client gets its own Needs you and Coming up lists. |
| GET | `/ah/api/requests` | team, client | need | ported | Requests and approvals of one brand or of every brand: each item, its thread, what it points at, and how many wait on each side. |
| GET | `/pw/api/assets/footage` | team | opt | forwarded | The footage library of one brand. No old route exists yet, so the old answer is passed through as it is. |
| GET | `/pw/api/inspo` | team, client | need | ported | The links and pictures people saved as inspiration for one brand, newest first. |
| GET | `/pw/api/requests` | team, client | need | forwarded | The requests list as the bell asks for it on the profit side. The old profit worker has no such route, so its answer is passed through. |

## reports

| Method | Path | Who | Brand | Answered by | What it is for |
|---|---|---|---|---|---|
| GET | `/ah/api/agency/economics` | owner | none | forwarded | Agency money for a month: money in, team cost and AI cost per client. Owner only. |
| GET | `/ah/api/agency/workload` | team | opt | forwarded | Open tasks due this week or overdue, by person, across the brands. |
| GET | `/ah/api/briefs` | team, client | need | ported | The last 60 daily briefs. A client gets only the ones that were sent (old rule sentOnlyList). |
| GET | `/ah/api/calls/screen` | team | opt | forwarded | The screen a call is run from: the report, the ad platforms and what was typed on the call. |
| GET | `/ah/api/meetings/monday` | team | none | ported | The Monday meeting screen: per brand last week's report, the plan people posted and the open tasks. Team only. |
| GET | `/ah/api/meetings` | team | none | ported | Meetings of the last 60 days with the open tasks per brand, or one meeting with its notes when id is given. Team only. |
| GET | `/ah/api/pulse/status` | team | none | forwarded | The state of each outside platform and the last changes, kept by the outage monitor. |
| GET | `/ah/api/report` | team, client | need | ported | One weekly or monthly report with its frozen numbers. A client gets it only once it was sent (old rule sentOnlyOne). |
| GET | `/ah/api/reports` | team, client | need | ported | The last 80 weekly and monthly reports, without their numbers. A client gets only the ones that were sent (old rule sentOnlyList). |
| GET | `/ah/api/standing` | team | opt | forwarded | The latest three hourly sale check in for every brand. Team only. |
| GET | `/ah/api/trybe/review` | team | opt | forwarded | Creator videos waiting for a yes or no, for one brand. Team only. |
| GET | `/ah/api/trybe/scorecard` | team | opt | forwarded | Every brand with a creator program: spend, sales, cost per sale and goal. Team only. |
| GET | `/ah/api/trybe/video` | team, client | need | forwarded | A short lived link to play one creator video of the caller's brand. |
| GET | `/ah/api/trybe` | team, client | need | forwarded | Creators of one brand: live videos and people. For the team, act=all lists the brands with a program. |
| GET | `/pw/api/briefs` | team, client | need | ported | The last 60 daily briefs. A client gets only the ones that were sent (old rule sentOnlyList). |
| GET | `/pw/api/client-pages` | team | opt | ported | Hand built client pages on a public link: all of them, or the ones attached to one brand. Team only. |
| GET | `/pw/api/report` | team, client | need | ported | One weekly or monthly report with its frozen numbers. A client gets it only once it was sent (old rule sentOnlyOne). |
| GET | `/pw/api/reports` | team, client | need | ported | The last 80 weekly and monthly reports, without their numbers. A client gets only the ones that were sent (old rule sentOnlyList). |
| GET | `/pw/api/season/war` | team, client | need | forwarded | The sale plan, the phases and today by the hour for one brand, or one row per brand for the team. |
| GET | `/pw/api/season` | team, client | need | forwarded | The stored sale season of one brand, or of every brand for the team. |
| GET | `/pw/api/snapshots` | team, client | none | ported | The shared links (frozen cards and pages) of the brands the caller has, newest first. |

## automations

| Method | Path | Who | Brand | Answered by | What it is for |
|---|---|---|---|---|---|
| GET | `/ah/api/automations/people` | team | none | ported | Who does what: the person behind each role per brand, and the team list. |
| PUT | `/ah/api/automations/people` | team | none | ported | Save who does what. One settings row. Only the owner changes the team list. |
| POST | `/ah/api/automations/power` | owner | none | forwarded | The one switch: automations on or off for the whole workspace. Owner only. |
| GET | `/ah/api/automations/test` | team | none | ported | Not found, as on the old worker: a test run is a POST. |
| POST | `/ah/api/automations/test` | team | none | forwarded | A dry run of one automation: what would have happened. Nothing is sent or saved. |
| DELETE | `/ah/api/automations` | team | none | ported | Delete one automation and the choices people saved for it. |
| GET | `/ah/api/automations` | team | none | ported | Every automation the caller sees, the template gallery, the last 60 runs and the pick lists. |
| PUT | `/ah/api/automations` | team | none | ported | Save one automation as a draft or switched off. A save that switches it on, or names a client, is forwarded to the old worker. |
| GET | `/ah/api/me/delivery` | team, client | none | ported | How things reach the caller, and their choice per automation. |
| PUT | `/ah/api/me/delivery` | team, client | none | ported | Save the caller's own delivery defaults and their own choice per automation. |
| POST | `/ah/api/notices/done` | team, client | none | forwarded | Answer or tick a row on the bell. A held client message is sent or dropped here. |
| GET | `/ah/api/notices` | team, client | none | ported | The caller's own home list and bell rows. A client gets only the plain line for its own brands. |

## ai

| Method | Path | Who | Brand | Answered by | What it is for |
|---|---|---|---|---|---|
| GET | `/ah/api/ask/brief` | team | none | forwarded | The old engine has no read for the brief (it comes inside ask/findings). The old answer is passed on. |
| PUT | `/ah/api/ask/brief` | team | none | ported | Save the "about your agency" text every answer reads (text, at most 4000 characters). One settings row. |
| GET | `/ah/api/ask/findings` | team | none | ported | What the assistant found, its memory, the agency brief and playbook. Forwarded while either text is still the default. |
| GET | `/ah/api/ask/settings` | team | none | ported | The assistant's depth, standing instructions and the channels it reads. |
| PUT | `/ah/api/ask/settings` | team | none | forwarded | Change the assistant's depth, standing instructions or channels. |
| GET | `/ah/api/ask/usage` | team | none | ported | Answers and cost of the assistant for the last days (30, at most 90): by day, person, model, brand. |
| POST | `/ah/api/ask` | team, client | need | forwarded | Ask the assistant a question. A client login is pinned to its own brand. |
| GET | `/ah/api/connect-ai/calls` | team, client | none | ported | The last calls my keys made: tool, brand, time. The owner may ask for everyone with all=1. |
| POST | `/ah/api/connect-ai/keys/revoke` | team, client | none | ported | Turn one of my keys off for good (id). The owner may turn off any key. |
| GET | `/ah/api/connect-ai/keys` | team, client | none | ported | My keys, never the key itself. The owner may ask for everyone with all=1. |
| POST | `/ah/api/connect-ai/keys` | team, client | none | ported | Make a key (label, days, brands). The key is in this one answer, only its hash is kept. No secret is used. |
| POST | `/ah/api/connect-ai/proposals/check` | team, client | none | forwarded | What a yes on a card would really change, read from the ad platform. Changes nothing. |
| POST | `/ah/api/connect-ai/proposals/decide` | team, client | none | forwarded | The tap on a card: yes or no. A yes can change an ad. |
| GET | `/ah/api/connect-ai/proposals` | team, client | opt | ported | The cards an AI made that wait for a tap. A client login sees only its own side's cards on its own brands. |
| GET | `/ah/api/connect-ai/switch` | team, client | none | forwarded | The old engine has no read for the switch (its state is in GET connect-ai). The old answer is passed on. |
| PUT | `/ah/api/connect-ai/switch` | owner | none | forwarded | The owner turns Connect your AI on or off for everyone. |
| GET | `/ah/api/connect-ai` | team, client | none | ported | Connect your AI: is it on, the address to give an AI app, who I am, the limits. |
| POST | `/ah/api/lookup` | team | opt | forwarded | One free answer to a question, written by code from the brand's numbers. |
| GET | `/ah/api/lookups` | team | none | ported | The questions answered free by code, whether that is switched on, and the share of questions it took. |

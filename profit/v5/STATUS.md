# Locus v5: where it stands

End of batch 3 (shell pass, 2026-11-25). Batch 2 pages were checked in sample mode (`?sample=1`) at 1360
and at a true 390 phone width. The shell pass (and the settings pages it touched) was checked in sample mode
in the Browser pane at 1024 and at 375; the batch 3 pages were checked by the agents that wrote them. Real
mode has still not been run in a browser against the live workers, and the shell pass called no route that writes.
A read-only check of the live worker answers against what each page reads was run later the same day; what it
found and what was changed is in "Real-data and sample-name fixes" below. Nothing outside `profit/v5/` changed.

The move-in pass (2026-11-25, last) brought three finished features in from `profit/v5-next/`, which is now deleted:
Automations, Connect your AI and free lookups. It is the next section. It was checked in sample mode only, in the
Browser pane at desktop width and at 375. Real mode was not run and no live route was called, read or write.

- **Routes in the menu: 126** (114 before the move-in; Automations has 4 tabs and sits in both side menus, so it
  counts 8; Ask gained 1; Your profile gained 3). **Built: 126. Coming: 0.** The router decides by file presence:
  every route has its page file, so the shared "being rebuilt" page shows for none.

## The move-in: Automations, Connect your AI, free lookups (2026-11-25)

All three are OFF by default on the account-health worker, each behind its own switch. The worker routes were
already on main; this pass changed no worker file. What each page does when its switch is off:

| Feature | Switch (account-health) | In the menu | When it is off |
|---|---|---|---|
| Automations | settings `automationsOn`, set by `POST /api/automations/power { on }` (owner only) | Its own group and line, team only, in the brand menu and the agency menu: Running, Templates, Who does what, Run log. Each person's choice is Your profile > How things reach me | Every page shows one banner: "Automations are off for this workspace." The owner gets a real "Switch automations on" button (the pages already had it). Everyone else is told the owner switches it on. Setting up and "Try it" still work, as the worker allows |
| Connect your AI | settings `connectAi`, set by `PUT /api/connect-ai/switch { on }` (owner only) | Your profile > Connect your AI, and Your profile > AI suggestions (the cards). Everyone, clients included | One line: "Connect your AI is switched off for this workspace." The owner gets the real switch (the page already had it). Everyone else reads "Not switched on yet". The cards tab says it is off and links to the switch |
| Free lookups | settings `freeLookups` (`on` or `code`). No route for it that the page may call | Ask > Free answers (team only), and the main Ask page shows a free answer with "Ask why" | One line: "Free answers are switched off", and that there is no switch on the page yet. No switch is drawn, because none would work. The list of what will be free still shows, and a question is not sent |

Where the files went (the READMEs in `v5-next` are gone; this is the record):

- `pages/automations/`: `running.js`, `templates.js`, `people.js`, `log.js`, shared `_auto.js`, and new `_notices.js`.
- `pages/profile/delivery.js` (How things reach me). It replaces the device-only "How it reaches you" tab that
  lived inside Your profile: `pages/profile/reach.js` is deleted and the Profile page has two inner tabs now
  (Profile, Sign-in). The bell's "Settings" link opens the new tab.
- `pages/profile/connect-ai.js` and `pages/profile/ai-cards.js`. The README asked for a `connect-ai` folder with
  its own two routes; they are tabs of Your profile instead, so they are found under Profile and need no new line.
  A link an AI hands back (`?open=aiproposal&id=<card id>&act=<brand id>`) opens the cards tab (app.js) and the
  page marks that card. app.js then takes `open`, `id` and `act` out of the address, so the mark is for that one
  visit. The worker builds that link from its `connectAiAppUrl` setting, or the old app's address when the setting
  is empty. So the link lands in v5 only once that setting points at the v5 address (no worker change here); until
  then it opens the old app.
  In the team's "See as client" view the three own tabs (Connect your AI, AI suggestions, How things reach me)
  say "This is the client's own page" and make no call (`pages/profile/_own.js`). A sign in with no email of its
  own gets "Sign in with your own email" on the two AI tabs instead of the sign in page.
- `pages/ask/free.js`. The Ask line has two tabs now (Ask, Free answers).
- Sample files sit beside each page. `pages/_sample/notices.json` is new (the shape of `GET /api/notices`).

The bell and the "needs you" lists:

- `bell.js` reads `GET /api/notices` (account-health) beside what it already read, and adds those rows to Needs
  you, Watching and Done today. The route has no on or off flag: with automations off nothing makes rows, so it
  answers empty and the bell is as before. The read is a quiet fetch of its own: a refusal, an older worker or a
  dropped connection gives no rows and never opens the sign in page. The bell count includes the new rows.
- Notifications > Needs you, Watching and Done today show the same rows (they read `bell.js`). A row an automation
  left is answered in its sheet on that page: "I did it" or "No" for a suggested change, "Send to the client" or
  "Do not send" for a held client message, "Done" for anything else (`POST /api/notices/done`).
- Home (brand) and Today (agency) have a "Needs you" card (`pages/automations/_notices.js`) with the same buttons.
  It draws itself after the page and is not drawn at all when there are no rows or the read fails.

Also changed: the product name in the automations toast comes from `APP_NAME`; three sample files said the
product name in a worker sentence and now say "The app"; `menu.js` `viewOf()` answers null for a line that is in
both side menus, so Automations keeps the view you are in; a new `bolt` icon. Home and Today now import `bell.js` and
`_notices.js` with the page (about 10 KB raw together), so `bell.js` is no longer only loaded when idle on those two.

## Real-data and sample-name fixes (2026-11-25, after the shell pass)

Ten findings from the sample-name sweep and the live-answer check, all confirmed in the files and fixed in
`profit/v5/` only. `node --check` passes on every file touched and both sample files still parse. None of these
was re-run in a browser in real mode: the fixes were made against the recorded live answers (and, for Costs,
a fresh read of live `GET /api/costs` for one brand, which still has the older shape).

- **No long dash in the source.** `noDash()` now lives once in kit.js with the two dashes written as escapes
  (`\u2014`, `\u2013`); Meetings > Past meetings and Run the meeting import it. A scan of every .js, .json, .css,
  .html and .md file under `profit/v5/` finds no long dash character.
- **Sample names.** Six card titles in `a-production/_sample/pipeline.json` and one launch in
  `a-calendar/_sample/index.json` read like real client work with the name taken off. They are now made up
  ("Black Friday 3 for $99", "Linen polo launch, round 2", "Olive polo", "Calming chews, owner story",
  "Iron set stills, studio", "Hybrid launch, teaser"; "New hybrid launch", "The 4 hybrid, first run of 250").
  The old titles appeared in no other sample file.
- **Goals come from the brand's goal.** The profit `/api/overview` account row has no `target_roas` or
  `target_cpa`, so Home, This month > Pace and Weeks were quietly using plan sales over plan spend as the goal
  and Home never had a goal cost. They now read `ctx.setting('brand:<id>.target_roas' / '.target_cpa')` (the
  account-health brand list, one read per session) and fall back to the plan only when no goal ROAS is set.
  All platforms > Live now had the same miss (`ctx.brand.target_roas`, which the switcher's brand never carries)
  and is fixed the same way. A client has no door to that list, so a client still sees the plan figure.
- **Suggestions waiting.** Home and All platforms > Side by side counted every buyer-list row (they filtered on
  `decided` / `decision`, which rows do not have). They now use the worker's own `n_do`, or count rows with
  `card.decide` true that are not `launch`.
- **All platforms > Live now, no store connected.** `/api/hub/paid` sends `brand.revenue: 0` for a brand with no
  store, which the page took as a sales source and drew $0 and 0.00x. The source is now decided from the live
  store read, the season read's `no_sales` flag, or real credited money today or in the last 7 days; otherwise
  the page says "No sales source connected".
- **Meta > Live now, spend today.** Today's `/api/hub/paid` answer has no campaign rows until the day is synced,
  and every campaign read $0 (and "Not spending"). A missing row now reads "not read yet"; live campaigns sort
  first, then by the week's spend; the footer says the account total for today is in the chart (from `/api/pacing`).
- **Black Friday > Pace, sale so far.** A client, and a brand outside the check-in, got "No read yet" because the
  total only came from team-only `/api/standing`. It now falls back to `live.sale_so_far` in `/api/season/war`
  (sales, and MER as sales over spend).
- **Brand settings > Costs.** See its row below and "Known gaps": the deployed profit worker is older than the page.

## What the shell pass changed (2026-11-25)

- **Brand marker.** The colored square in the brand switcher and the brand list is a small gray circle with
  the brand's first letter (`brandMark()` in shell.js, `.lx-bmark` in app.css). "All brands" gets the same
  circle with the grid glyph. It uses theme tokens only. The app has one theme (light, `color-scheme:light`):
  there is no dark theme to check, and the marker will follow one when it exists. `.lx-swatch` is kept for
  the two pages that still draw a brand color dot (Platform status, Today).
- **One product name.** `APP_NAME` at the top of config.js is the only place the name is typed. 37 page files,
  the shell, the router and app.js read it (or `AI_NAME`). Sample files no longer spell it. Left on purpose:
  comments, and code names such as `oldLocus()` and `OLD_LOCUS`. Text that a WORKER sends (a server note, a
  connection name) is not covered: that is the worker's copy.
- **Worker override.** `pf_worker` / `pf_ah` in localStorage and `?worker=` / `?ah=` in the address are read
  only on localhost (localhost, 127.0.0.1, [::1], *.localhost) and must be an http(s) address. On a live host
  both are ignored, so the token only ever goes to the two default workers.
- **Costs** is the second tab of Brand settings (`brand-settings/costs`, old page id `costs`).
- **Settings saves switched on** (next section): four, each behind a confirm sheet with an error state.

## Writes that are ON, and how they behave

One shared bar and sheet (`pages/brand-settings/_set.js`: `stage()` and `saveBar()`). Save never sends on one
tap when a change reaches a server: a sheet lists each change with its old and new value under "Saved for
everyone", "Kept on this device" or "Not switched on yet", and the person confirms. A refusal shows in the
sheet and on the bar (which change, and why), the change stays staged, changes before it stay saved and
changes after it are not sent. Sample mode sends nothing.

| Save | Page | Sends |
|---|---|---|
| Goal ROAS, goal cost per new customer | Brand settings > Goals | ah `PUT /api/accounts/<brand id>` `{ target_roas }` then `{ target_cpa }` (the handler keeps every field it is not given) |
| Test and call rules for one brand | Brand settings > Goals, "Test and call rules for this brand" | profit `PUT /api/brand/rules?act=<brand id>` `{ rules: { <name>: <number> } }`, one name per call: cr_judge_x, cr_min_days, cr_scale_buys, cr_cut_zero_x, cr_cut_spend_x, cr_cut_cpa_x, judge_days, judge_spend. 0 or empty puts a rule back on the standard |
| My settings (morning summary as a Slack DM) | Your profile > My settings | ah `PUT /api/me/prefs` `{ morning_dm: true or false }` |
| Assistant settings (depth, standing instructions) | Agency settings > AI | ah `PUT /api/ask/settings` `{ model: quick, smart or deep }` and `{ instructions }` |

The three moved-in features bring their own writes, all on the account-health worker and all refused by the worker
while the feature (or the login) does not allow them. They are single taps or small sheets, not the staged Save
bar above. Sample mode sends none of them. None was sent in this pass.

| Write | Page | Sends |
|---|---|---|
| Switch automations on | The banner on every Automations page and on How things reach me (owner only) | `POST /api/automations/power` `{ on: true }` |
| Save, switch or delete an automation; Try it | Automations > Running, Templates (the editor sheet) | `PUT /api/automations`, `DELETE /api/automations?id=`, `POST /api/automations/test` (a dry run) |
| Who does what, the team list | Automations > Who does what | `PUT /api/automations/people` |
| How things reach me | Your profile > How things reach me | `PUT /api/me/delivery` |
| Answer a row an automation left | Home and Today "Needs you", Notifications | `POST /api/notices/done` (`answer: did_it / no / send`, or `done`). The worker refuses `yes` on a suggested change: the app changes nothing there |
| The Connect your AI switch | Your profile > Connect your AI (owner only) | `PUT /api/connect-ai/switch` `{ on }` |
| Make a key, turn a key off | Your profile > Connect your AI | `POST /api/connect-ai/keys`, `POST /api/connect-ai/keys/revoke` |
| Yes or No on an AI card | Your profile > AI suggestions | `POST /api/connect-ai/proposals/check` (reads Meta, changes nothing), `POST /api/connect-ai/proposals/decide`. A yes only makes the change when the worker setting `connectAiApply` is on (off by default) |
| A free answer, and "Ask why" | Ask > Free answers, Ask | `POST /api/lookup` (reads only), `POST /api/ask` with `full: true` |

Changed on purpose on the Goals page: typing in the four facts no longer stages a goal by itself. The goal in
use is a box the person types in. "Use 2.78x" copies the worked out number in, and only shows when that number
came from the brand's own numbers; while the store facts are example data the page says so and the person
types the goal. Before this pass a typed fact would have saved a goal cost worked from the example first order.

HELD (has a server home, nothing is sent, the sheet says "Not switched on yet"): every agency setting on ah
`PUT /api/settings` (Sending, Team, Clients pages) and the "about your agency" text on ah `PUT /api/ask/brief`.
Before this pass those two would have been sent on Save with no confirm. To switch them on: `AGENCY_ON = true`
in _set.js, and drop `'ai.brief'` from `held` in a-settings/ask.js.
- "Built (live data)" means every part reads a worker route that exists today.
- "Built (some example)" means the page reads live data, but the part named shows sample numbers
  under the "Example until its data feed is built" chip, or is left out in real mode, until the
  read-only route in the next section exists. It never shows a zero for something it cannot read.

## Every route

### Brand view (`#/brand/<brand>/...`)

| Route | State |
|---|---|
| `home/index` | Built (live data). Goal ROAS and goal cost are the brand's own goal for the team; a client sees the plan figure |
| `month/pace` | Built (live data). Goal MER is the brand's goal ROAS, else the plan |
| `month/weeks` | Built (live data). Goal MER is the brand's goal ROAS, else the plan |
| `month/profit` | Built (live data) |
| `month/plan` | Built (live data). Changing the plan still opens old Locus |
| `funnel/whole` | Built (some example: "What do people touch before buying?") |
| `funnel/website-steps` | Built (live data) |
| `funnel/path` | Built (some example: the whole page, until the click path route exists) |
| `customers/snapshot` | Built (some example: reorder weeks, same or new on the second order) |
| `customers/ltv` | Built (live data) |
| `customers/repeat` | Built (some example: "When do they order again?" weekly chart) |
| `customers/buy-next` | Built (some example: the flow, "same product again" rows) |
| `sales/by-day` | Built (live data) |
| `sales/products` | Built (some example: units, returned and first-order share per product; Bought together) |
| `sales/inventory` | Built (live data) |
| `website/pages` | Built (live data) |
| `website/seo` | Built (live data) |
| `platforms/side-by-side` | Built (live data) |
| `platforms/live-now` | Built in batch 3 (its header comment says what is live and what is example). A brand with no store reads "No sales source connected", never $0 |
| `platforms/changes` | Built in batch 3 (its header comment says what is live and what is example) |
| `meta/overview` | Built (live data) |
| `meta/live-now` | Built (some example: daily account limit). Spend today per campaign reads "not read yet" until the day's rows are synced; no live route gives it sooner |
| `meta/top-ads` | Built (live data) |
| `meta/suggestions` | Built (live data; the "too early" judge date needs `first_spend` on ads) |
| `meta/load-ads` | Built in batch 3 (its header comment says what is live and what is example) |
| `meta/changes` | Built (live data) |
| `google/overview` | Built (some example: Triple Whale per campaign, lost to budget and rank, this week's test and waiting on) |
| `google/search-terms` | Built (some example: brand vs other split) |
| `google/products-ads` | Built (some example: the Products view) |
| `google/suggestions` | Built (some example: judged on Triple Whale, the Watching list) |
| `google/changes` | Built (some example: why and ROAS before and after are left out) |
| `tiktok/overview` | Built (some example: Triple Whale sales for TikTok) |
| `tiktok/live-now` | Built (some example: hour by hour spend) |
| `tiktok/top-videos` | Built (some example: numbers per video) |
| `tiktok/suggestions` | Built (some example: the whole list) |
| `tiktok/changes` | Built (some example: the whole list) |
| `amazon/overview` | Built (some example: weekly chart, campaign list) |
| `amazon/search` | Built (some example: the search term report) |
| `amazon/products` | Built in batch 3 (its header comment says what is live and what is example) |
| `amazon/creative` | Built (some example: spend by ad type, listing photos, split tests, brand ads) |
| `email/snapshot` | Built (some example: "From returning buyers", first-time buyers per campaign) |
| `email/campaigns` | Built (some example: first-time buyers per campaign) |
| `email/flows` | Built (live data) |
| `email/list-growth` | Built (some example: "Where did they sign up?") |
| `creative-review/index` | Built (some example: AI tags sit behind "Tags are being re-checked") |
| `what-works/learned` | Built (some example: lessons that are not tests) |
| `what-works/hooks` | Built (some example: first line said, first frame, hook type, half gone by) |
| `what-works/ad-type` | Built (live data; AI tags behind the re-check note) |
| `what-works/copy` | Built (live data) |
| `what-works/angles` | Built (live data) |
| `what-works/landing-pages` | Built (some example: visits per page per ad; real mode counts Meta clicks) |
| `what-works/competitors` | Built (some example: the competitor ads feed) |
| `production/board` | Built (some example: "Client, N days" mark). A client sees the review page here |
| `creators/to-review` | Built (live data) |
| `creators/videos` | Built (live data) |
| `creators/people` | Built (live data) |
| `library/photos` | Built (live data) |
| `library/footage` | Built (some example: the whole list) |
| `library/reference-ads` | Built (live data) |
| `calendar/index` | Built (live data) |
| `offers/index` | Built (live data) |
| `black-friday/pace` | Built in batch 3 (its header comment says what is live and what is example). Sale so far falls back to the season read for a client or a brand outside the check-in |
| `black-friday/plan` | Built (live data) |
| `reports/index` | Built (live data) |
| `documents/index` | Built (some example: a real client login sees an empty note) |
| `requests/index` | Built (live data) |
| `brand-settings/goals` | Built (some example: the four facts and the store facts). SAVES ARE ON: goal ROAS, goal cost, the test and call rules |
| `brand-settings/costs` | Built in batch 3, new tab "Costs". **Half live today.** The deployed profit worker answers `GET /api/costs` in its older shape and has no rule or sheet routes, so the page shows fixed costs only (read from `GET /api/expenses`, saved with `PUT /api/expenses`) and says shipping and product rules are not switched on. The full page shows by itself once the worker with commit a4e895d6 (on main, not in this branch) is deployed. Writes not reviewed in the shell pass |
| `brand-settings/brand` | Built (some example: social and creator times, stock and judge windows) |
| `brand-settings/integrations` | Built (live data) |
| `brand-settings/people` | Built (some example: who runs the brand, send times and launch days) |
| `automations/running` | Moved in (team only; also in the agency view). Live data, checked in sample mode only. In a brand view it lists that brand's and the any-brand automations |
| `automations/templates` | Moved in. Live data, checked in sample mode only |
| `automations/people` | Moved in. Live data, checked in sample mode only. Reads `GET /api/automations` as well, only to know if the switch is off |
| `automations/log` | Moved in. Live data, checked in sample mode only |

### Agency view (`#/agency/all/...`)

| Route | State |
|---|---|
| `a-today/index` | Built (some example: today's meetings) |
| `a-month/pace` | Built (live data) |
| `a-month/profit` | Built (live data) |
| `a-platforms/side-by-side` | Built (live data) |
| `a-platforms/changes` | Built (live data) |
| `a-meta/suggestions` | Built (live data) |
| `a-meta/overview` | Built (live data; one call per brand) |
| `a-meta/load-ads` | Built in batch 3 (its header comment says what is live and what is example) |
| `a-google/suggestions` | Built (live data; one call per brand) |
| `a-google/overview` | Built (live data; one call per brand) |
| `a-google/search-terms` | Built in batch 3 (its header comment says what is live and what is example) |
| `a-production/pipeline` | Built (some example: "sent N days ago" falls back to the due date) |
| `a-production/needs-someone` | Built (live data) |
| `a-creators/to-review` | Built in batch 3 (its header comment says what is live and what is example) |
| `a-creators/by-brand` | Built in batch 3 (its header comment says what is live and what is example) |
| `a-calendar/index` | Built (live data) |
| `a-black-friday/pace` | Built (live data) |
| `a-black-friday/plan` | Built (live data) |
| `a-to-send/index` | Built (live data) |
| `a-shared-links/index` | Built (some example: season client links and plan links are left out) |
| `a-clients/index` | Built (live data) |
| `a-requests/index` | Built (live data) |
| `a-meetings/agenda` | Built (some example: the example decision and My day rows) |
| `a-meetings/pre-read` | Built (live data) |
| `a-meetings/run` | Built in batch 3 (its header comment says what is live and what is example) |
| `a-meetings/past` | Built in batch 3 (its header comment says what is live and what is example) |
| `a-money/billing` | Built (some example: billing day, paid date, amount due) |
| `a-money/margin` | Built (live data) |
| `a-team/index` | Built (live data) |
| `a-status/index` | Built (live data) |
| `a-settings/clients` | Built (some example: account lead and connected count) |
| `a-settings/team` | Built (some example: job, name, Slack link, active) |
| `a-settings/integrations` | Built (live data) |
| `a-settings/ask` | Built (some example: ideas bot switch, client allowance, daily cap). SAVES ARE ON: depth and standing instructions. The "about your agency" text is held |
| `a-settings/how-we-run-ads` | Built (some example: the agency standard and the non-creative rules) |
| `a-settings/sending` | Built (some example: previews, counts, each person's choices, the stopped list) |

The four `automations/*` routes above are the same pages in the agency view (`#/agency/all/automations/...`), where they cover every brand.

### Top bar pages (either view)

| Route | State |
|---|---|
| `ask/index` | Built (live data). A free answer (free lookups on) shows as "Free answer" with its page link and an "Ask why" button, which sends the same question with `full: true`. Not seen against the live worker |
| `ask/free` | Moved in (team only). Live data, checked in sample mode only. Says so when free lookups are off |
| `my-day/index` | Built (some example: meetings, times on done rows) |
| `notifications/needs-you` | Built in batch 3 (its header comment says what is live and what is example) |
| `notifications/watching` | Built in batch 3 (its header comment says what is live and what is example) |
| `notifications/done-today` | Built in batch 3 (its header comment says what is live and what is example) |
| `profile/index` | Built (some example: the three message previews). Its inner Notifications tab is gone: see `profile/delivery` |
| `profile/delivery` | Moved in. Live data (`GET /api/me/delivery`), saved to the account. Checked in sample mode only. The team's page also reads `GET /api/automations` to know if the switch is off; a client cannot read that and sees no banner |
| `profile/connect-ai` | Moved in. Live data, checked in sample mode only |
| `profile/ai-cards` | Moved in. Live data, checked in sample mode only. In a brand view it shows that brand's cards |
| `profile/settings` | Built (some example: everything except the morning DM switch). SAVE IS ON: the morning DM switch |

## New read-only worker routes needed (one list, no repeats)

"ah" is the account-health worker, "profit" the profit worker. All take `act=<brand id>` unless noted.

1. **ah `GET /api/paths?act&from&to`**: Triple Whale click paths (last platform click). Returns
   `orders, multi_orders, clicks_avg, days_avg, same_day, top_first{channel, orders}, sparks{multi, clicks, days, first},
   flow{columns[{title, sub, nodes[{id, label, short, value}]}], links[{from, to, value, text, name}], lead, more_clicks},
   paths[{path[], orders}], single{channel: orders}, touch_orders, ads[{first{name, where, channel, kind}, next?, gap_days?, note?, orders}], clicks[{name, orders}]`.
   Used by Full funnel > Path to purchase and Whole funnel.
2. **profit `GET /api/customers` (add fields)**: `journey.again{weeks[13], same_day, repeaters, half_day}`,
   `journey.second{same, variant, addon}`, and the same product inside `products.first[].then`.
   Used by Customers > Snapshot, Repeat orders, What they buy next.
3. **profit `GET /api/customers/next?act`**: `by_category`, `by_product` (flow shape as in 1, with
   "Did not order again" nodes), `pick[{id, name, customers, back, next[{name, customers, same}], rest}]`,
   tiles `customers, came_back, belt_belt, same_colour, top_back, top_addon, gap_days`. Needs a product
   to category map per brand. Used by Customers > What they buy next.
4. **ah `GET /api/meta/account-limit?act`**: `{limit, used, currency, as_of}`. Used by Meta > Live now.
5. **profit `GET /api/hub/creative` (add fields)**: `first_spend`, `last_day` per ad. Used by Meta > Suggestions.
6. **ah `GET /api/google/campaign-tw?act&from&to`**: per campaign `{id, sales, orders, new_customers, roas, is_brand}`
   plus `split{brand, other}`. Used by Google > Overview, Search terms, Suggestions (judging on Triple Whale).
7. **ah `GET /api/google/ads` (add fields)**: `search_budget_lost_impression_share`, `search_rank_lost_impression_share` per campaign. Used by Google > Overview.
8. **ah `GET /api/google/plan?act`**: `{test{title, number, from, now, to, read_on, by}, waiting[{title, who, state, tone}]}`. Used by Google > Overview.
9. **ah `GET /api/google/products?act&from&to`**: rows `{name, price, feed, feed_why, shown, ctr, spend, sales, roas, google_roas, page_rate}`,
   `summary{carry, carry_share, no_sale, no_sale_spend, feed{approved, limited, disapproved}}`. Used by Google > Products and creative.
10. **ah `GET /api/google/changes-log?act`**: each change `{why, before, after, after_days}`, kept past Google's 30 days. Used by Google > Changes made.
11. **ah `GET /api/leaks` (add)**: `watching[]` and judging on route 6; optional `act=all` returning `{as_of, rows[{brand_id, id, area, title, number, cost}]}`.
    Used by Google > Suggestions and Agency > Google > Suggestions.
12. **ah TikTok reads**: per video numbers, Triple Whale sales for TikTok, spend by hour, suggestions and changes
    (`GET /api/tiktok/videos`, `/api/tiktok/hours`, `/api/tiktok/changes`). Used by every TikTok tab.
13. **ah Amazon reads**: weekly sales and spend, campaigns, the search term report, ad type spend, listing photos, tests
    (`GET /api/amazon/weekly`, `/api/amazon/terms`, `/api/amazon/creative`). Used by every Amazon tab.
14. **ah `GET /api/klaviyo` (add)**: `returning_share`, `returning_move` for email and SMS sales; `first_time` per campaign row;
    by-form sign ups `{name, joined, bought_since}`. Used by Email > Snapshot, Campaigns, List growth.
15. **profit `GET /api/hub/store` (add)**: `units`, `returned`, `first_order` per product, and pairs `{a, b, orders}` for Bought together. Used by Sales > Products.
16. **ah `GET /api/competitors/feed?act&days`**: `ads[{id, brand, name, kind, thumb, first_line, headline, started, days, versions, live, batch, link}]`,
    `batches[{brand, id, date}]`, `reads[{brand, text, proof[]}]`. Used by What works > Competitors.
17. **profit `GET /api/learned?act`**: `{text, how, strength, by, date, proof[], led, overturned}`. Used by What works > Learned.
18. **profit `GET /api/hub/hooks?act`**: `{ad_id, asset_key, first_line, on_screen, frame, hook_type, len_s, half_at_s}`. Used by What works > Hooks (and the AI tags on Creative review, Ad type, Copy once a person has checked them).
19. **profit `GET /api/hub/landing?act&from&to`**: per page per ad `{path, ad_id, visits, carts, checkouts, orders, revenue}`. Used by What works > Landing pages.
20. **ah `GET /api/production` (add)**: `client_sent_at` per card in `cardOf`. Used by Production > Board and Agency > Production > Pipeline.
21. **ah `GET /api/assets/footage?act`**: `{items[{id, name, secs, res, setting, people, descr, folder, modified, thumb, used}], total, hours, synced_at}`. Used by Library > Footage.
22. **profit `GET /api/client-pages/mine?act`**: `{pages[{title, updated_at, url}]}`, live pages only, readable by a client. Used by Documents.
23. **profit `GET /api/share-links?act=all`**: `[{type, act_id, title, url, created_at, views, last_view, revoked}]`. Used by Shared links.
24. **ah `GET /api/meetings/today`**: `[{time, title, brand_id, state, note}]`. Used by Agency > Today and My day.
25. **ah `GET /api/billing/all?month`**: `[{brand, billing_day, paid_on, amount_due, invoice_url}]`. Used by Money > Billing.
26. **ah `GET /api/series?act=all&from&to`** and **`GET /api/google/ads?act=all&from&to`**: daily sums across brands. Optional; they cut the one-call-per-brand fan-out on Agency > Meta and Google overviews.
27. **profit `GET /api/brand/goal-facts?act`**: `{keep_pct, fixed_costs, order_size, first_order, product, postage, fees, repeat_90, returning_share, store_mer_90}`,
    plus month MER if `/api/plan` lacks it. Used by Brand settings > Goals.
28. **ah `GET /api/brand/people?act`** and **`GET /api/brand/sending?act`**: who runs the brand (emails per job) and
    `{daily_time, daily_mode, weekly_day, launch_days, spend_check_1, spend_check_2, send_as}`. Used by Brand settings > People and sending.
29. **ah `GET /api/brand/schedule?act`**: social and creator times, stock and judge windows. Used by Brand settings > Brand.
30. **ah `GET /api/clients/summary`**: `[{id, lead, connected_ok, connected_of, paused, hidden}]`. Used by Agency settings > Clients.
31. **ah `GET /api/team/roster`**: `[{email, name, job, slack_linked, active}]`. Used by Agency settings > Team, and to show names instead of emails on Google > Changes made.
32. **ah `GET /api/ask/limits`**: ideas bot switch, client allowance, daily cap. Used by Agency settings > Locus AI.
33. **profit `GET /api/agency/call-rules`**: the agency standard and every non-creative call rule. Used by Agency settings > How we run ads.
34. **ah `GET /api/sending`**: `{messages[{id, time, who, on}], people[{email, time, by, days, quiet, zone}], stopped[{name, seen, why, where}], stats}`. Used by Agency settings > Sending.
35. **ah `GET /api/me/settings`**: everything on My settings except `morning_dm` (already on `/api/me/prefs`). Used by Your profile > My settings and the profile previews.
36. **ah agency settings keys** `agency.perHourFloor`, `agency.teamBusy`, `agency.meetingStart`: readable through `GET /api/settings` (today they live on the device).

## Things that write (switched off in v5) and the existing route each will call

Every row here still links to old Locus or opens a read-only sheet, except the four in "Writes that are ON" above (marked ON below) and whatever the batch 3 pages state in their own headers (Brand settings > Costs writes fixed costs to profit `PUT /api/expenses`, live today; its rule and sheet writes to `/api/costs` and `/api/costs/sheet` are only reachable once the newer profit worker is deployed, and the page hides those buttons until then).

| Action | Where | Existing write route |
|---|---|---|
| Approve, or Request changes, on a card | Production > Board (client review) | ah `POST /api/production/decide` (plus `POST /api/production/comment` for the note) |
| Send a card to the client | Production card sheet | ah `POST /api/production/send` |
| Make a review link | Production card sheet | ah `POST /api/production/share` |
| Move a card | Production > Board, Pipeline | ah `POST /api/production/move` |
| Make the brief | What works finding sheet | ah `POST /api/production/brief` |
| Approve or skip a creator video | Creators > To review | ah `POST /api/trybe/review` |
| Do a Meta suggestion (pause, budget, resume) | Meta > Suggestions, Agency > Meta > Suggestions | ah `POST /api/buyer-list/decide`, which writes through `POST /api/meta/write` (undo: `POST /api/meta/undo`) |
| Turn down a suggestion | Meta > Suggestions | ah `POST /api/buyer-list/disagree` |
| Apply a Google fix | Google > Suggestions | ah `POST /api/leaks/apply` (undo `POST /api/leaks/undo`); budgets and pauses `POST /api/google/write` |
| Load ads into Meta | Meta > Load ads (Coming) | ah `POST /api/launch/create`, `/api/launch/batch-create` |
| Add a why to a change, write the client line | Meta > Changes made | ah `PUT /api/activities/<id>` (`client_why`), `POST /api/activities/bulk` |
| Approve a Black Friday budget move | Agency > Black Friday > Pace | ah `POST /api/standing/approve` |
| Send the daily brief | Agency > To send | ah `POST /api/brief-send` |
| Send a report to the client | Reports, To send | ah `POST /api/report-send` |
| **ON.** Save a goal (goal ROAS, goal cost per new customer) | Brand settings > Goals | ah `PUT /api/accounts/<id>` (`target_roas`, `target_cpa`) |
| **ON.** Save the test and call rules | Brand settings > Goals | profit `PUT /api/brand/rules` (`{ rules: {...} }`) |
| Save the monthly plan | This month > Plan | profit `PUT /api/plan` |
| Save agency settings (HELD) | Agency settings > Clients, Team, Sending | ah `PUT /api/settings` |
| **ON** for the settings, HELD for the brief | Agency settings > AI | ah `PUT /api/ask/settings`, `PUT /api/ask/brief` |
| **ON.** Save my settings | Your profile > My settings | ah `PUT /api/me/prefs` |
| Mark a task done | My day | ah `POST /api/mywork/done` |
| Tick a season task | Black Friday > Plan, Offers | profit `PUT /api/season/task` |
| Reply to or close a request | Requests (brand and agency) | ah `POST /api/requests/reply`, `POST /api/requests/done`; new request `POST /api/requests` |
| Add or move a calendar date | Calendar | ah `POST /api/calendar/event`, `POST /api/calendar/move` |
| Invite a client login | Client list, People and sending | ah `POST /api/clients/invite` |
| Turn a shared link off | Shared links, Documents | profit `POST /api/client-page/revoke`, `POST /api/snapshot/revoke` |
| Ask Locus AI | Ask | ah `POST /api/ask` (already on: it is the one call v5 makes that is not a GET, and it only answers a question) |

## Known gaps

- **The move-in was checked in sample mode only.** Every moved page, the bell, the Notifications tabs, Home and
  Today were opened in the Browser pane with `?sample=1` at desktop width and at 375 (also as a client): no console
  error, no sideways scroll, the editor sheet rises from the bottom. The off states of Connect your AI, the cards
  and Free answers were drawn by calling each page's render with an "off" answer, because their sample files are on.
  Nothing was run signed in, signed out against the live worker, or with a real switch flipped.
- Free lookups have no switch in the app. Turning them on is a settings key on the worker (`freeLookups`); the
  agency settings save (`PUT /api/settings`) is still held in v5, so the page only says it is off.
- After a row is answered on a Notifications tab the row is taken off the page, but the count in the page's hero
  and on the bell stays until the next read (up to a minute, or the next open of the bell).
- A client login needs `/api/notices`, `/api/notices/done` and `/api/me/delivery` to pass the worker's client
  guard. The automations module says a client reaches them; that was not tried with a client login. If the guard
  refuses, the client sees no automation rows (the read fails quietly) and How things reach me shows the error page.
- The three connect steps for Claude and ChatGPT were written from each app's help pages and were not clicked through.
- A sheet that is open stays open when the address changes (kit.js, as before). Not changed here.

- Real mode has not been run in a browser. The live answers were compared with what the pages read for the
  pages named in "Real-data and sample-name fixes"; every other page's not-connected, empty and real-data states
  are unverified. The fixes in that section were not re-run against the live workers after they were made.
- **Costs waits on a worker deploy.** Commit a4e895d6 ("Brand costs") is on main but not in this branch, and the
  live `GET /api/costs` still answers in the older shape (checked 2026-11-25). Until it is deployed the Costs tab
  is fixed costs only, a category must be picked from the list (the older worker files anything else under
  Other), and the month total is not shown. After the deploy, check the page against the new answer once.
- The goal ROAS and goal cost are not readable by a client login (the brand list is team only), so client views of
  Home, Pace and Weeks compare against the month plan. A client-safe goal read needs a worker change.
- Not changed, same pattern, still to check against a live answer: `a-meta/suggestions` and `a-today/index` count
  buyer-list rows with `!r.decided`, and the Google pages (`google/_g.js`, `ads-videos.js`, `products-ads.js`) read
  `ctx.brand.target_roas`, which the brand in the switcher does not carry.
- Meta > Live now has no per-campaign spend for today until the day is synced. A live per-campaign read would
  need a new read-only route (or `/api/meta/live` to carry today's spend).
- The four
  saves that are ON were checked against the worker handlers by reading them (account-health worker.js, prefs.js;
  profit brand.js) and with a simulated refusal, not with a real PUT.
- `saveSetting()` in data.js sends a rule as `{ <name>: value }`, but the worker reads `{ rules: { ... } }`. No page
  saves a rule through it (Goals uses its own saver), and _set.js holds any key that would. Fix data.js before using it.
- After a goal is saved, the page's saved copy still holds the old "in use" number until its next refresh (20 seconds).
- The Goals page reads the rules from `GET /api/brand/rules`, which answers with the agency standard filled in, so a
  box shows the number in force, not whether the brand typed it.
- Sample fixtures do not change with the date range (the title and the dates do).
- Sample "now" is Nov 24 in fixtures, while some "N days ago" text uses the real clock, so sample text can be a day apart.
- Thresholds written into What works code (2,000 views, 30 orders, 300 visits, 14 and 45 day groups) are not settings yet.
- Headless Edge will not lay out narrower than about 500px; phone checks need Playwright (or CDP) at a true 390.

## Sizes (raw bytes, before compression)

| File | Bytes |
|---|---|
| `index.html` | 4,226 |
| `app.css` | about 50,500 |
| `kit.js` | about 43,700 |
| `shell.js` | 23,751 |
| `data.js` | 14,180 |
| `menu.js` | 12,925 |
| `router.js` | 9,741 |
| `icons.js` | 5,261 |
| `app.js` | 5,197 |
| `config.js` | 4,855 |
| `bell.js` (loaded when idle) | 7,690 |
| Shell JS total | about 118,000 (under the 150 KB line) |
| Fonts (Inter, Instrument Serif Italic) | 64,116 |
| Home page module + its sample | 21,216 + 3,519 |

A first open of Home loads index.html, app.css, the eight shell modules, the Home module and the
fonts: about 263 KB raw, plus bell.js when idle. Page modules load only with `import()` when their
route is visited (or when a menu link is hovered, as a warm up). All 153 page modules together (144 before the move-in, 129 at the end of batch 2; the size line below was not re-measured) are
about 1.15 MB raw and the sample files about 434 KB; none of them loads before its page.

# Locus personality, session D (2026-10-11): the hero number, the nudge, the morning line, the accent word

Branch `locus-personality` (from `main-nv6pvz`), four commits, one per feature. Not merged, not deployed. Plan:
`docs/two-products.md` sections 4 and 5, row D of the build table.

## What was built

### 1. The hero number on Home > Overview (commit "Home opens on the hero number")
- **Route** `GET /api/hub/kept?act=all|<brand>` (profit worker, `hub.js keptMany`). Per brand, the brand's own local
  yesterday: `kept` = the contribution margin the P&L already computes (the host's `dayEconomics`: sales minus ad spend,
  product cost, shipping, handling and fees, or the flat margin override; custom expenses marked "counts as ad spend"
  are inside spend like everywhere), `bites` (ads, product cost, shipping and handling, fees; with an override: ads and
  one "product and delivery at X%" line), `normal` (the mean contribution of the last 28 days, 10+ needed), `sales`,
  `spend`, `ads_pct`, `broken` (cost check verdict), and the morning `line` with `to_change` / `to_fix` from `buyerList`.
  `?calls=0` skips the buyer list. Named contribution everywhere, never profit.
- **No refunds bite on purpose.** Revenue here is Shopify total sales after returns and minus tax, so a refunds bite
  would count returns twice. Shipping and handling are one bite.
- **Front end** `profit/hero.js` (`window.LxHero.mount(host, H, accts)`), called by `v2.js home()` into `#v2hero`, the
  first thing on the page; every other tile stays where it was. One brand: "You *actually* kept $1,240" (serif italic
  on "actually"), the stacked bar with each bite labelled, one sentence ("Sales of $4,100 minus $1,270 of ads, ... ,
  against a normal day of about $980."). A loss reads "You actually lost $X" in red. Cost data broken: "You sold $X"
  and a link to the cost check. Agency: "The book actually kept $X" summed over brands with trustworthy cost data in
  one currency, brands left out are named, then one row per brand (name, bar, kept, "on $sales · ads N%"; click opens
  the brand's Home). Tabular numbers throughout.
- **CSS** at the end of `profit/v2.css` ("LOCUS PERSONALITY, SESSION D"): the `--font-accent` token (Instrument Serif,
  already loaded from Google Fonts in index.html), `.lx-accent`, the hero, the bites palette (the validated channel
  colours, used as data series), the face slot, the morning strip, the nudge, the profile card.
- Brand edition: `GET /api/hub/kept` on `CLIENT_RULES` (both brandguard copies) and in `test-clients.mjs`.

### 2. The nudge card (commit "The nudge card")
- `profit/nudge.js` (`window.LxNudge.refresh(host)`), called at the end of every `show()`. A badge in the top bar
  (`#lxNudgeHost`, before `#hdActions`): the face slot and "N to do" / "All clear". Click = a stack of up to 6 items,
  one sentence and one button each, ranked by money at stake.
- **A view, not a third source of truth.** Items come from `/api/hub/today` (the buyer's calls: cut, trim, scale,
  refresh, fix) and `/api/hub/moved` (what moved yesterday). Two or more cuts on one brand fold into "<Brand> is losing
  money on N ad sets. Pausing them would save about $X a day."
- **Buttons.** Pause (cut, trim) and Scale (scale) go through the SAME propose and confirm path Ads > Meta uses:
  `POST /api/meta/write` with `dry: true` first, the modal shows before and after for each target, then the write with
  `expect` (refused if Meta moved in between), the Change Log line and `p_meta_write` row come from `locusWrite`, the
  toast carries Undo (`/api/meta/undo`). Scale reads the live budget from `/api/meta/live`, proposes +20% in an editable
  box, and an ad set on a campaign budget is sent to Ads > Meta > Campaigns instead. Brief it opens the Strategist with
  the iteration brief (same text as Ads > Today). Fix items link to Ads Manager. Moved items have Look (the page that
  explains the number for that brand). Done writes the same manual `/api/activities` line Ads > Today writes, then marks
  the item done for 7 days. Not now snoozes 24 hours.
- **Per person, in the worker:** `GET/PUT /api/me/prefs` (account-health `src/prefs.js`, settings row
  `userPrefs:<email>`, `{morning_dm, nudge: {key: {state, until}}}`; stale entries dropped after 7 days). The email comes
  from the session or the client scope, never the body. On `CLIENT_RULES` (both copies, `fields: ['morning_dm', 'nudge']`)
  and in `test-clients.mjs`.
- **The face slot:** `<span class="lx-face" data-state="asleep|thinking|found|clear">`, a plain dot in the Locus blue
  (`.lx-face` rules in v2.css). When the brand kit (session B) lands, replace the span's content and keep the four states.
  It also sits in the morning strip on Home.

### 3. The morning line (commit "The morning line")
- The sentence is built once, server side, in `keptMany` (`line`): "Grunk kept $1,240 yesterday on $4,100 of sales; ads
  at 31%. Nothing to change." / "3 things to change." / "One thing to change, one to fix." / "... Contribution needs cost
  data." So Home and Slack never disagree.
- **Home:** `hero.js` draws the strip above the hero until noon (the browser's local clock), one line per brand on the
  agency Overview, the brand's own line on a brand.
- **Slack DM:** account-health `src/morning.js` `morningTick` inside the hourly cron (after `movedTick`): from
  `settings.morningHour` (Central, default 7) until noon, once per person per Central day (`settings.morningDone`),
  for everyone with `morning_dm` on. The numbers are read ONCE as the owner over the `PROFIT` binding and filtered per
  person with `brandsFor` (a client gets its own brand only, a limited teammate theirs). Sent through the existing bot
  (`slackApi`: `users.lookupByEmail`, then `chat.postMessage` to the user id). A person Slack cannot find is recorded for
  the day and tried again tomorrow. `settings.morningDm = 'off'` stops every send.
- **Settings > Your profile** is a section for everyone now (brand settings for the team and clients, agency settings
  under a "You" group, and the profile item in the rail's profile menu lands on it): the switch and "Send me today's
  line now" (`POST /api/me/morning`, which DMs the signed-in person at once; `GET` previews the lines). Clients keep
  their name and sign-out card above it.
- **No phone push was built.** The app registers a service worker (`profit/sw.js`, the offline shell) but nothing in
  the repo has web push wired (no `pushManager`, no VAPID keys, no push route in any worker). See next steps.
- Tests: `account-health/worker/test-morning.mjs` (7 offline checks: prefs semantics, routes, lines per person, the tick's
  hour gate, once a day, per-person filtering, the lookup failure, the off switch, the send-now route).

### 4. The accent word (commit "The accent word on every page head")
- `profit/accent.js`: ONE list, tab id to the words to try, in order (Overview, Day *check*, Today's *calls*, P&L, All
  *channels*, Meta *campaigns*, Email and *SMS*, War *Room*, Agency *settings*, How to *use* Locus, ...). `pageHead`
  wraps the first whole-word match in the title with `<em class="lx-accent">`; a title without its word gets no accent.
  Every file that builds a page head goes through `pageHead`, so it shows across the app with no layout change.

### 5. The bead in the helper slot (after the brand kit landed, commit "The bead in the helper slot")
- Session B's message named the kit on `origin/brand-kit`: `logo/locus/direction-2.svg` (the mark), `direction-2-asleep |
  thinking | found | clear.svg` (the helper's states), `logo/locus/icons/`, `logo/kit.css`. Verified at those paths, then
  `origin/brand-kit` was MERGED into this branch so the files resolve from `profit/` as `../logo/locus/...`.
- `profit/helper.js` fetches the four state drawings once and fills every `.lx-face` with the inline SVG for its
  `data-state` (they draw in currentColor); a MutationObserver swaps the drawing when the state changes; the plain dot
  stays until the files load. Sizes per the kit: 20px in the ask bar and the badge, 28px on the morning strip and the
  nudge stack. The ask bar (`#v2ask`) now carries the helper too (`nudge.js` inserts it; the badge and the ask bar share
  one state). `../logo/kit.css` is loaded after v2.css; `--font-accent` reads the kit's `--accent-serif`, and the accent
  word takes the kit's rule (8% larger, the product's colour on a surface, `--field-ink`).
- A one-word page head ("Overview", "Library") keeps plain type: the accent lives inside a sentence, never as the whole head.
- **The icon swap (commit "The bead on the gate, the favicon, the rail and the manifest").** A second message from the
  coordinator session (Cole's desktop session) said Cole confirmed direction 2 for Locus; `docs/brand/kit.md` on the
  merged branch records the same ("Cole's pick"). His words themselves were not in the events this session could read,
  so this is recorded as second hand; the change is on this branch only and reversible. Done: the favicon links in
  `profit/index.html` (`favicon.svg`, `favicon-32.png`, `icon-192.png`, Apple touch `icon-180.png`, all from
  `logo/locus/icons/`), the rail's brand mark (was the Mobius `favicon.png`, now `favicon.svg`, the bead on the blue
  square), the bead above the gate's title (inline, Locus blue, `.lx-gate-mark`), `profit/manifest.webmanifest`
  (192, 512, maskable 512 and the shortcut icons), `profit/sw.js` (precache list; `VERSION` bumped to `locus-v2` so every
  cached copy drops), and the same icon on `offline.html`, `share.html` and `s.html`. Untouched on purpose: the intro film
  (`mobius-loader`, the Mobius strip at first paint) and the export frame's "Locus by Mobius Digital" mark; both are
  deliberate Mobius marks and were not part of the ask.

## How it was checked
- `node --check` on every JS file touched (hub.js, brandguard.js x2, hero.js, nudge.js, accent.js, v2.js, prefs.js,
  morning.js, worker.js, test-morning.mjs).
- Worker tests: `node test-clients.mjs` 24/24 (now includes `/api/hub/kept` and `/api/me/prefs`), `node test-morning.mjs`
  7/7. Both from `account-health/worker`.
- Playwright (Chromium from `/opt/pw-browsers`) against a python static server with every worker route stubbed
  (`page.route` fixtures: three brands, one with broken cost data, one with a margin override; the buyer list with a
  cut, a scale, a refresh and a fix; one move). Checked at 1440 and 375 wide, light and dark: the hero for one brand and
  for the agency, the morning strip (with a faked 8am clock), the nudge stack, the Pause modal (dry run, confirm, write,
  toast with Undo, the item marked done, the badge count dropping), Settings > Your profile for a brand and for the
  agency, the accent on Today's calls, Day check, Profit. No sideways scroll at 375.
- Two page errors seen in the harness are PRE-EXISTING on the untouched branch with the same stubs ("Invalid time
  value" on Home, a `.map` on undefined on Agency settings): fixture gaps, not this session's code.

## What could not be verified
- Nothing ran against the real workers or real data: no sign-in here, nothing deployed. The route's numbers were not
  compared with the P&L on a real brand (same `dayEconomics`, so they should match to the cent; check Home's hero
  against P&L for yesterday on the first deploy).
- The Slack DM path (`users.lookupByEmail` + a DM to a user id with the bot token) was only mocked. The bot needs the
  `users:read.email` scope for the lookup and `im:write` / `chat:write` for the DM; if the first send fails, the error
  from Slack is on the settings card ("Send me today's line now") and in `settings.morningDone`.
- A real Meta pause or budget write from the nudge was not exercised (the write path is the tested `locusWrite`).

## Next steps
1. Deploy both workers, then check the hero against P&L for one brand, press "Send me today's line now" on Your profile.
2. The phone push: register a push subscription in `sw.js` (`pushManager.subscribe` with a VAPID public key), store it
   per person in `userPrefs`, send from `morningTick` with the Web Push protocol (a VAPID private key as a secret on
   account-health; a small JWT + ECDH/AES-GCM implementation, no npm). Until then Slack on the phone is the push.
3. The face and the icons are done (section 5). Still Mobius on purpose: the intro film at first paint and the export frame's mark; swap them only if Cole asks.
4. Ads > Today still keeps Done / Not now in localStorage; it could read the same `userPrefs.nudge` keys (the nudge's
   keys are `kind|act|adset|ad`) so the two views agree across devices.
5. The hero's "normal day" is a plain 28-day mean; a weekday-aware normal is the Day check's job and was left alone.

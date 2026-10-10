# Locus: next session handoff (2026-10-10)

Written at the end of the long 2026-10-09 session ("Strategist context and understanding issues"). That session rebuilt
the Strategist to Viktor grade and shipped about 20 build jobs to Locus. Everything below is LIVE on main unless marked.
Cole wants SHORT bullet replies, no em dashes anywhere, act-then-report (memory: just-do-it), in-app modals only.

## Read first
- `account-health/CLAUDE.md` and `profit/CLAUDE.md`: every dated section from 2026-10-09 on (Strategist Viktor-grade,
  metawrite.js, alerts/check_now, stratmake.js, klaviyowrite.js, client logins, export/share, public snapshots, Google
  depth, Email rebuild, Website/Clarity, Products redesign, War Room, command center, drill-downs + fixed expenses,
  tools/dashboards/spacing, Meta Ads tab, intro v2).
- `docs/strategist-viktor-grade-plan.md` (the plan, 15 sections), `profit/DESIGN.md` (design system).
- Memory: locus-saas-vision (clients see everything about their own business; maybe sold as SaaS), judge-from-context
  (no word lists), viktor-grade-plan, simplicity-over-features.

## 1. Test everything (do these, report results, fix what breaks)
Run first (offline, from account-health/worker): `node test-viktor.mjs`, `test-strategist.mjs`, `test-metawrite.mjs`,
`test-ideas.mjs`, `test-clients.mjs`, `test-alerts.mjs`, `test-stratmake.mjs`, `test-klaviyowrite.mjs`, `test-klaviyo.mjs`;
from profit/worker `node test-snapshot.mjs`. Then a syntax pass (`node --check` on every profit/*.js and the inline script
of profit/index.html) and a conflict-marker scan (`git grep -nE '^(<<<<<<<|>>>>>>>)'`).

Live checks (Cole is signed in to Locus in Chrome; use mcp__claude-in-chrome with his session, read-only unless noted):
1. Every page loads with no console errors, for All clients and for Lucky, Bonk, Party Patch: Home (command center),
   Day check (Right now card), P&L (drill-downs, Net profit), Goals, Ads (Today's calls, All channels, Meta Overview /
   Campaigns / Ads / Changes, Google Overview / Campaigns / Ads / Search terms / Changes), Email and SMS (open a campaign
   preview), Store (Sales, Customers, Website funnel, Search), Products (Stock / Buying / Drops for Lucky), Creative,
   Brand, Calendar, Reports (Brief, Weekly, Dashboards incl. alerts and scheduled questions), Black Friday War Room
   (plan + live dry run + TV mode), Tools (Scenarios, Platform status), Brand and Agency settings (The Strategist page,
   Shared links, Client logins).
2. Page switching and period switching feel instant; the top loading bar always clears.
3. Export: Copy as image on 3 cards (look at the PNG), one public snapshot link opened logged out (via a fresh incognito
   style check with fetch, no cookies), Print view.
4. Strategist in the Locus chat: ask "what changed on Lucky this week and why", "is anything weird right now on Bonk",
   "make a PDF of last week for Party Patch", "make a 4:5 ad image for the Lucky Eclipse putter" (costs ~$0.40, fine),
   "build a dashboard of MER and CPA for all brands"; confirm live steps, Stop, cost line, file/image/report outputs.
5. Writes: test up to the confirm step only (the cards, before/after, permission checks; Google with validate_only).
   Real writes to Meta, Google or Klaviyo go live on client accounts: ask Cole before any, and never change budgets,
   send campaigns or post to a client Slack channel without his yes.
6. Slack (needs Cole): he should DM the app and tag it in an internal channel; read the threads after to confirm the
   working state (setStatus spinner if Agents is on) and answers.
7. Client login: create a test client invite for a personal address only if Cole gives one; otherwise run
   test-clients.mjs and a manual check with a minted client session against one read route and one write route.

## 2. Known gaps to fix
- Clients cannot see live numbers in the War Room (account-health refuses a client token on the live Triple Whale day
  route): allow client GETs for their own brand there.
- Dashboards: per-block date range (needs the spec, the Strategist's save_dashboard and the Slack post changed together).
- Calendar main card padding a little under 20px.
- Command center "stuck" Asana tasks undercount (Locus's sync bumps modified_at): use a stage-entry time instead.
- Untested live: Meta writes from the screen, Klaviyo writes, Strategist images/analysis/Frame, alerts firing, DMs,
  ask_ledger, scheduled tasks, public snapshots signed in, Send to Slack from export, Clarity (no tokens yet).
- Intro v2: compression grain on big screens (acceptable; revisit only if Cole asks).

## 3. New features Cole asked about (build in this order unless he says otherwise)
1. Close the creative loop: "Launch to Meta" from Locus (approved Studio/creator asset -> correct naming -> right ad set
   -> paused until approved -> tagged to its test in the test library -> judged -> learning filed). Reuse metawrite
   meta_create_ad, the naming rules, asana-brand.js test numbers.
2. Monday account review per brand by the Strategist: audit results, fatigue, budgets, stock, calendar; post proposed
   changes as Apply cards in each brand's internal channel (scheduled task kind).
3. Post-purchase "how did you hear about us" survey data (Fairing or KnoCommerce connector) on Customers and in the
   Strategist, to check attribution against reality.
4. Daily "is Locus working" smoke check: every morning hit every page's routes and connections, post failures to Slack.
5. Client requests and approvals inside Locus (approve creatives, offers, calendar dates; requests thread).
6. Agency economics per client (Ledger revenue vs team time + AI cost).
7. Team workload view from Asana (who has what due this week across brands).
8. Locus installable as a phone app (PWA manifest + icons + offline shell).
Later / maybe: Asana -> Locus task management (test with one brand), TikTok direct once the developer app is approved,
Amazon. Decision for Cole after 1-2 weeks of use: cancel Viktor (~$260/month).

## 4. On Cole (remind him, do not do for him)
- Meta: give the Mobius Tools system user Manage on Grunk (self-grant was refused there; the other 8 are done).
- Enter fixed expenses per brand (Brand settings > Data and costs).
- Clarity tokens per brand (Clarity > Settings > Data Export).
- Upload the new emoji (profit/assets/mobius-emoji.gif) to Slack as `mobius`.
- Bonk's $130K Black Friday revenue goal vs $24.3K same days last year: whole season or a typo?
- Lock Lucky's Black Friday offer (War Room plan step 5).
- Resubmit the Shopify app review (product-level profit and refunds depend on it).
- Lucky "Welcome (NEW) - Email [BHM]" flow is in draft but earned $11.8K in 90 days: on purpose?
- Lucky: CPA $88 vs $52 goal for 14+ days and no new Meta ad in 13 days (likely fatigue).

## Working rules learned this session
- Several sessions push and deploy at once: ALWAYS `git fetch origin && git merge origin/main` before deploying a worker.
- Push with `git -c credential.helper= -c "credential.helper=!gh auth git-credential" push origin main`.
- Parallel jobs work best in worktrees, each told exactly which files it owns, with Opus as the model.

# Mobius Profit — instructions for Claude Code

Store-level business tool. **Read `PRD.md` first.** Account Health answers "are the
Meta ads working?" (Meta-only, matches Ads Manager). This answers "is the brand
making money?" (blended, all channels). Do not merge them.

## Layout

```
profit/
  PRD.md            plan, decisions, phases   ← source of truth
  CLAUDE.md         this file
  index.html        the whole dashboard (vanilla JS, one file, GitHub Pages)
  worker/
    wrangler.toml   worker mobius-profit, D1 binding DB -> SHARED mobius-account-health
    schema.sql      only p_-prefixed tables (additive to the shared DB)
    src/worker.js   money model + JSON API
```

## Hard rules

- **Shared database, never a second copy.** `DB` binds the *existing*
  `mobius-account-health` D1. Read `accounts`, `tw_daily`, `daily_insights`,
  `activities`. Write only `p_*` tables — plus `accounts.goals_json.cm_pct`,
  which is the margin override the Daily Brief already reads. One source of
  truth; never introduce a second margin field.
- **Every number here is blended and store-level.** Revenue = TW `netSales`,
  spend = TW `blendedAds` (Meta+Google fallback). MER = revenue/spend,
  aMER = new-customer revenue/spend. **Platform ROAS does not belong on this
  tool** — that is Account Health's job, and mixing them is what confused
  everyone the first time.
- **The new/returning split must be rebased onto net sales.** TW reports it
  against `totalSales` (incl. tax) while the headline is `netSales` (ex-tax),
  so the raw figures do not add up. Keep the measured *share*, apply to sales.
- **Days where cost > revenue are usually WHOLESALE, not broken COGS.** Product
  left the building; the money arrived somewhere Shopify cannot see. `retailMargin()`
  estimates the true retail margin from clean days only — use a LOW percentile as the
  base (contamination only adds cost, so the median collapses once contamination
  passes ~50% of days, as it does for Grunk). Frame this in the UI as wholesale /
  inventory receipts, never as "your data is wrong".
- **Cost data is gated.** `judgeCosts()` grades the trailing per-day margin;
  `broken` suppresses every profit figure. The Costs page must always diagnose
  the **real** TW data (`seriesRaw`, override ignored) — grading the override
  produces a meaningless flat line and hides whether it has been fixed.
- **The Daily Brief lives HERE but runs THERE.** Its tab is in this tool (all its
  numbers are store-level), while the account-health worker keeps the endpoints, the
  14:00 UTC cron and the TW/Anthropic/Slack secrets. `PROXY_PATHS` forwards
  /api/brief, /api/brief-preview, /api/brief-send, /api/briefs, /api/goal-suggest,
  /api/tw-sync and /api/slack-channels over the `AUTH` binding. Monthly goals are
  written locally (`PUT /api/goals`) so the month/default merge sits beside the
  margin override in the same JSON blob — and it must preserve `cm_pct`.
- **Plan is the ONLY place goals are set.** Every other page reports against them.
  The Daily Brief tab shows the plan read-only with a link across; do not re-add an
  editor there. Plan defaults to NEXT month (nobody plans a month that is already
  three-quarters gone) and offers a month picker from last month to +4.
- **Revenue = MER x spend: the user sets TWO, the third is arithmetic.** An earlier
  version let you set only ONE and derived the rest from trailing aMER, which made
  a MER you had just typed silently revert when you changed spend. Cole spotted it.
  `PL.derive` names the calculated field; the other two are inputs, and switching
  which is derived freezes the current values so nothing jumps.
- **State the window on every derived number.** The Plan page mixes them on purpose:
  revenue basis and product margin come from the last COMPLETE month, while aMER and
  returning-per-day come from the trailing 28 days (they move). `ctx.sources` carries
  `basis_month`, `margin_month` and `trailing_from`/`to`/`days`, and `basisNote()`
  spells all of it out under the plan. Cole asked "is this last month or trailing six
  months?" and nothing on screen answered him. Any future derived input must say
  where it came from.
- **Anything that names a month must read it from `ctx.sources`, never re-derive it.**
  `cmHtml` picked "most recent finished month" with its own filter while the "Based
  on" box used the server's `basis_month`, which additionally requires the month to
  be near-complete (`days >= days_in_month - 2`). A month with a Triple Whale sync
  gap was therefore skipped as a revenue basis but still used for the CM comparison,
  so the plan was measured against a month missing days - understating that month's
  CM and flattering the plan. One basis, read from one place.
- **Trailing aMER is a YARDSTICK, never an input.** Any plan implies a rate of buying
  new customers: `(revenue - expected returning) / spend`. Compare that with the
  trailing 28-day aMER and say plainly whether the plan is achievable (<=1.05x),
  a stretch (<=1.25x) or unrealistic. Never silently force a plan to match history.
- **`goals_json.default` is inheritance, NOT a plan.** `goalsFor()` merges it under
  every month, which made unplanned future months look planned. The API returns
  `planned` (an explicit `goals_json[ym]` entry) and the UI must key status off that.
- **Past months are read only** and must not show inherited defaults as if they were
  that month's plan — say "no plan was set".
- **The plan is agreed with the client, never auto-applied.** `PUT /api/plan` writes
  `accounts.goals_json` (the one field every tool reads) AND a `p_plan` row for the
  story: basis, growth chosen, required spend, expected CM, share token, agreement.
  Saving with changed numbers passes `reagree:true`, which CLEARS `agreed_at` — do not
  let a plan drift after sign-off. `GET /api/plan/:token` is unauthenticated and must
  only ever expose that one client's plan: no other account, no cost diagnostics.
- **`PL` is a global, so it MUST record which client it belongs to.** The Plan page
  seeds its working values only when they are empty, which meant switching brand in
  the top-right picker kept the previous brand's revenue/spend/MER on screen — and
  saving wrote them onto the new brand. Cole hit this saving Bonk then Dartee. The
  month chips and the all-clients row-click already cleared the values; the picker
  had no such hook and never can, so the guard is `PL.sales == null || PL.act !==
  S.act` and every reset also clears `PL.act`. Any future page-level scratch state
  keyed to a client needs the same owner field.
- **Re-render the numbers, not the page.** Growth buttons, save and the agreed
  toggle all update in place. Calling `renderPlan()` / `show()` from a handler throws
  the user back to the top of the page, which makes comparing options miserable.
- **`.info-i` must reset `letter-spacing`, `font-style` and `text-transform`** — stat
  labels are uppercase and letter-spaced, and without the reset the glyph inside the
  circle is squashed and reads as broken.
- **TW dates: verify, never assume.** `charts.current` x is ONE-BASED day-of-year.
  After any change to the mapping or a backfill, join `tw_daily.fb_ads_spend`
  against `daily_insights.spend` on the same date — Meta's dates are authoritative
  and they must match to the cent. A silent one-day shift shipped once.
- **Triple Whale backfills are capped at 430 days and must run ONE CLIENT AT A TIME.**
  A 400-day pull is ~25-50k rows; every D1 batch is a subrequest, and all six clients
  in one invocation blows the Worker limit. Batch size is 150.
- **Never depend on the Marketing Calendar.** It is a Lucky Golf internal app, not
  a Mobius one. It was integrated and then deliberately removed; do not re-add it.
- **The forecast is CTC's revenue cake with TWO additive layers.** returning (the
  predictable base, day-of-week shaped) + new (planned spend x trailing aMER).
  `newCustomerSales + rcRevenue = totalSales` exactly, so those are the only two
  that add up. Email is an overlay, NEVER a third addend — Klaviyo revenue cuts
  across both, and only The Golf Sock has it connected at all.
- **`forecastFor()` must reuse `seriesFor()`**, so revenue means the same thing
  (net sales + shipping, gated) as everywhere else. The first version used a bare
  netSales lookup and silently forecast on a ~7% smaller basis than it compared
  against. `suggestGoals()` in account-health was fixed for the same reason.
- **No cron.** The Cloudflare account is at the free-plan limit of 5 triggers.
  `refreshIfStale()` warms `p_cost_health` on page load instead.
- **Auth needs no new secret.** The dashboard password lives in the shared
  `settings` table, and Google SSO is delegated to the account-health worker's
  `/api/me` (`delegateSession`). Setting `SESSION_SECRET` to the same value as
  the other workers makes it verify locally instead — faster, optional.
- **Delegation MUST go through the `AUTH` service binding.** A plain `fetch()` to
  the other worker's public workers.dev URL fails silently from inside a Worker —
  that shipped once and produced a sign-in loop. `[[services]] binding = "AUTH"`
  in wrangler.toml; `env.AUTH.fetch(req)`. Verify with `GET /api/auth-check`,
  which reports `auth_binding_reachable` and `delegated_verify`.
- **Never let the gate clear `mobius_session` on a 401.** If this tool rejects a
  token HQ considers valid, the fault is this worker's; wiping the session just
  sends the user back to mint another one that fails identically. Show the error
  and offer Retry instead.
- **Two Slack channels per brand, never one.** `slack_channel` is the INTERNAL
  pace/KPI alerts channel; `brief_channel` is the CLIENT-FACING Daily Brief channel
  (falls back to slack_channel). Every brand was originally pointed at an `-internal`
  channel, so collapsing them would either hide the brief from the client or leak
  internal KPI alerts to them. Keep them separate and label which is which.
- **Never write HTML entities into tooltip/info text.** `esc()` escapes `&`, and
  `helpModal` escapes again, so `&#39;` renders literally as "&#39;". Use real
  characters (apostrophe, the word "divided by"), never entities.
- **Tab switches must never blank `#main`.** `show()` passes a `first` flag: only a
  truly empty page paints a spinner. Otherwise the previous tab stays visible under
  `#main.busy` (dimmed, non-interactive) until the new one is ready. Every renderer
  takes `first` and gates its placeholder on it.
- **Once a renderer gates its placeholder on `first`, EVERY paint must write all of
  `#main` — success, error and refetch alike.** Never `#main .card`, and never
  `insertAdjacentHTML` onto whatever is already there: on a tab switch that DOM
  belongs to the outgoing tab. Introducing `first` broke both Daily Brief renderers
  exactly this way — they kept writing their result into `#main .card`, so clicking
  the tab left the heading reading "Overview" with the brief's table grafted into the
  Overview's first card, and the tab appeared not to open at all. Build the page as
  `shell(body)` and assign it; the placeholder and the result then share one shape.
- **Async renderers hold a RUN ticket.** `show()` bumps a global `RUN`; every
  renderer that awaits takes `const run = ++RUN` at entry and drops its DOM writes
  when `run !== RUN`. Without it a slow fetch let an OLD tab paint over the one you
  had switched to (click Brief, flee to Overview, Brief's response lands 1.5s later
  and replaces the page). The bump in `show()` matters: sync renderers like Overview
  never take a ticket, so they must invalidate in-flight ones from the outside.
- **Listeners go on nodes the render replaces, never on `#main` itself.** `#main`
  survives every render, so a listener attached to it stacks one copy per visit —
  the Profit ranking grid accumulated one `show('profit')` call per prior visit.
- **A refetch must not blank the screen.** `renderPlan(true)` keeps the current DOM
  and just dims the month chips while loading; only a first render shows a spinner.
  A spinner mid-decision reads as a page reload.
- **`repaint()` skips the focused input on purpose** (so it cannot fight your typing),
  which means Enter would leave the value unformatted. The commit handler formats
  that one field itself. Any new numeric input needs the same pair.
- **A control with no visible state reads as broken.** The quick-fill chips changed
  the value silently, so Cole reported they "don't fill in" when they were working.
  Highlight the active one and keep it in sync in `repaint()`.
- **Nothing may scroll the page on an update.** Growth chips, switching the derived
  field, month changes and every save update in place; `inPlace(fn)` preserves
  scrollY across a refetch. Calling a renderX() from a handler throws the reader to
  the top mid-decision and is the single fastest way to make the tool feel broken.
- **In-app modals only — never `alert()`/`confirm()`/`prompt()`.** Use `noteModal()`
  and `confirmModal()`. This is a standing Cole rule across every Mobius tool.
- **`.unit-in input` needs `[type=text]` in the selector to win.** `.settings
  input[type=text]` (border + 180px width) has higher specificity than a bare
  `.unit-in input`, so inside a `.settings` table the input re-grows its own border
  and overflows the pill — a box-inside-a-box. Selector must be
  `.unit-in input,.unit-in input[type=text],.unit-in input[type=number]`.
- Windows: `npx.cmd wrangler deploy` from `profit/worker/`. PowerShell 5.1 uses
  `;` not `&&`. Cloudflare throws transient 7403 — retry.

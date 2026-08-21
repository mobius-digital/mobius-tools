# Mobius Profit — PRD (proposed, not yet built)

The store-level business tool. Account Health answers *"are the Meta ads working?"*
This answers *"is this brand making money, and will it hit its number?"*

Our own take on what CTC's **Statlas** does — scoped to a six-client agency, not an
enterprise platform. Statlas ships 30+ reports; we need about five pages.

**Status: Phase 0 SHIPPED 2026-08-21.** Overview, Profit and Costs pages are live at
`https://tools.go-mobius-digital.com/profit/` on worker `mobius-profit`.
Phases 1-4 below are still to come.

---

## Why a separate tool (and not more tabs in Account Health)

Account Health earns its trust from one rule: **every number matches Ads Manager.**
It is Meta-only on purpose — Google spend was folded in once and pulled back out
because mixing sources made it impossible to read at a glance.

Store-level money breaks that rule by definition: net sales, COGS, shipping, fees,
blended spend across platforms. That's a different question for a different reader:

| | Account Health | Mobius Profit |
|---|---|---|
| Question | Are the Meta ads working? | Is the brand making money? |
| Reader | Media buyer, daily | Cole + client leadership, weekly |
| Source | Meta Marketing API only | Shopify + Triple Whale + all ad platforms |
| Horizon | Hours → weeks | Weeks → quarters |

The Daily Brief currently lives in Account Health because its narrative needs the
Change Log. It moves here once this exists (see Phase 4) — same database, so the
Change Log stays available.

---

## The pages

| Page | Question it answers |
|---|---|
| **Today** | Where does the business stand right now — CM, net sales, spend, aMER vs plan? |
| **Forecast** | What does the rest of the month/quarter look like, and what happens if we change spend? |
| **Profit** | Where does the money actually go — revenue → COGS → shipping → fees → ads → CM? |
| **Costs** | Is our cost data good enough to trust the profit numbers? |
| **Cohorts** | How much is a new customer worth, and how much do they come back? |
| **Daily Brief** | (moves here from Account Health in Phase 4) |

---

## Decisions

- **Shared database, separate worker.** New Worker `mobius-profit` binds the *existing*
  `mobius-account-health` D1. No syncing, no duplication, and the Change Log, Meta
  spend and `tw_daily` are all readable on day one. New tables are prefixed `p_`.
  Rejected: its own D1 (would need Meta data copied across).
- **COGS is the foundation, so it ships first.** Everything downstream (CM, forecast,
  the brief's profit line) is worthless without trustworthy costs. We already learned
  this the hard way: Grunk Dolfer had 9 of 28 days where recorded costs exceeded
  revenue, which is why the Daily Brief now refuses to state CM for that client.
- **Three ways to get costs, in order of accuracy:** (1) Shopify's per-variant
  `unitCost` pulled via the Admin API — most brands already have it; (2) manual
  per-SKU override in the Costs page for anything missing; (3) a flat margin %
  per client as the last resort. Every profit number is labelled with which basis
  it used, and the existing `judgeCogs()` quality check gates it.
- **Forecast is calendar-aware.** Reads the Marketing Calendar Worker so promo and
  launch days get lifted targets instead of reading as fake "misses". This is the
  piece Statlas explicitly does and generic dashboards don't — and we already own
  the calendar data.
- **Forecast method:** trailing-28-day day-of-week baseline (already proven in the
  Daily Brief), × calendar multipliers for promo days, × a growth factor from the
  monthly goal. Frozen at month start so the plan can't drift to flatter us.
- **No iROAS claim.** CTC models true incrementality with measurement science we
  don't have. We report attributed and blended figures and label them honestly.
  Revisit only if we run real holdout tests.
- **Money is per-client currency**, never summed across clients (same rule as
  Account Health).

---

## Build plan

| Phase | Scope |
|---|---|
| **0** | ✅ **SHIPPED 2026-08-21** — worker on the shared D1, dashboard shell w/ SSO, **Overview** (all clients: net sales, spend, MER, aMER, new %, CM), **Profit** (waterfall + daily revenue-vs-spend chart + new/returning), **Costs** (verdict, daily-margin chart, worst days, flat-margin override). Shopify variant-cost sync and per-SKU entry deferred to 0b — needs Shopify Admin API creds. |
| **0b** | Shopify per-variant `unitCost` sync into `p_sku_costs` + manual SKU entry UI (needs Shopify Admin API access per store) |
| **1** | **Profit page**: daily/weekly/monthly waterfall revenue → COGS → shipping → fees → ad spend → CM, with trend charts and the cost-basis label |
| **2** | **Forecast page**: goals, day-by-day forecast, Marketing Calendar multipliers, month/quarter projection, spend-scenario slider |
| **3** | **Cohorts page**: new vs returning revenue, repeat-purchase rate, payback period; feeds the forecast |
| **4** | **Move the Daily Brief here** from Account Health; Account Health goes back to being purely Meta |

Phase 0 is the only one with a hard dependency — everything else can be reordered.

---

## What Cole needs to supply

- **Shopify Admin API access** per client store (read products + orders) to pull real
  per-variant costs — needed for Phase 0b only. Phase 0 shipped without it.
- Nothing else: no new secret was required. The dashboard password lives in the
  shared `settings` table and Google SSO delegates to the account-health worker.

---

## Open questions

- Do we want quarterly targets as well as monthly? (Statlas thinks in 90-day windows.)
- Should clients get a read-only share link to their own Profit page, like the
  Account Health share links?
- Shipping cost: Triple Whale carries it, but is it accurate per client, or does it
  need the same override treatment as COGS?

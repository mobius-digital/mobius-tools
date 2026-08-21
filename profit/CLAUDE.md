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
- **Cost data is gated.** `judgeCosts()` grades the trailing per-day margin;
  `broken` suppresses every profit figure. The Costs page must always diagnose
  the **real** TW data (`seriesRaw`, override ignored) — grading the override
  produces a meaningless flat line and hides whether it has been fixed.
- **No cron.** The Cloudflare account is at the free-plan limit of 5 triggers.
  `refreshIfStale()` warms `p_cost_health` on page load instead.
- **Auth needs no new secret.** The dashboard password lives in the shared
  `settings` table, and Google SSO is delegated to the account-health worker's
  `/api/me` (`delegateSession`). Setting `SESSION_SECRET` to the same value as
  the other workers makes it verify locally instead — faster, optional.
- Windows: `npx.cmd wrangler deploy` from `profit/worker/`. PowerShell 5.1 uses
  `;` not `&&`. Cloudflare throws transient 7403 — retry.

# Mobius Account Health — worker setup

One Cloudflare Worker + one D1 database. Same account and Slack app as Pulse / Restock.
Everything below is run from this folder (`account-health/worker/`). On Windows use `npx.cmd`.

## 1. Create the database and deploy (Claude does this)

```
npx wrangler d1 create mobius-account-health          # paste database_id into wrangler.toml
npx wrangler d1 execute mobius-account-health --remote --file=schema.sql
npx wrangler secret put ADMIN_TOKEN                    # any long random string
npx wrangler deploy
```

## 2. Meta token (you do this — ~5 minutes, once)

The worker needs one **system-user token** that can read every client ad account.

1. Go to **business.facebook.com → Settings (Business settings) → Users → System users**.
2. **Add** a system user (name it `Mobius Tools`, role **Admin**). If one already exists, reuse it.
3. With it selected, click **Add assets → Ad accounts**, tick **every client ad account**,
   and give **View performance** (read is enough). Save.
4. Click **Generate new token**. Pick an app (if you have no Meta app yet: developers.facebook.com →
   Create app → type *Business* → any name; it never needs review for your own accounts).
   Token expiration: **Never**. Permissions: **ads_read**, **read_insights**, **business_management**.
5. Copy the token, then in this folder:
   ```
   npx wrangler secret put META_TOKEN
   ```
   and paste it when prompted.

Then open the dashboard → **Settings → Discover accounts from Meta**, toggle on the clients
to track, and set each one's monthly budget. The first sync backfills 90 days of daily
numbers and 90 days of the activity log in the background (a minute or two per account).

## 2b. Claude API key (you do this — powers Change Log → Summarise)

The Change Log's **Summarise** button has Claude write the daily / weekly / client-facing
update from the tagged changes + performance data. It needs an Anthropic API key
(console.anthropic.com → API keys):

```
npx wrangler secret put ANTHROPIC_API_KEY
```

Until it's set, the rest of the Change Log works fine — only Summarise errors.

## 2c. Slack pace alerts (you do this — optional)

The nightly sync posts to Slack when any budgeted client's MTD spend drifts off pace.
Uses the same Slack bot as Pulse/Restock — copy its bot token (Slack app → OAuth &
Permissions → Bot User OAuth Token, starts `xoxb-`):

```
npx wrangler secret put SLACK_BOT_TOKEN
```

Then in the dashboard → **Settings → Slack alert settings**: pick each brand's
channel in the accounts table (invite the bot to each channel first), optionally a
fallback channel, **Save**, then **Send test message**.

## 2d. Triple Whale key (you do this — powers the Daily Brief only)

The four Meta pages never touch Triple Whale; the Daily Brief's store-level money
(net sales, blended spend, COGS) does:

1. app.triplewhale.com → Settings → **API Keys** → Create Key (read scopes are enough).
2. From this folder:
   ```
   npx wrangler secret put TW_API_KEY
   ```
3. Dashboard → Settings: each client's **Triple Whale shop** domain is prefilled.
   Verify from the Daily Brief page → **↻ Refresh Triple Whale data**.

## 2e. Daily Brief (now lives in Mobius Profit)

The Daily Brief moved to **https://tools.go-mobius-digital.com/profit/ → Daily Brief**
on 2026-08-21, because every number in it is store-level rather than Meta-only.
This worker still runs it: the brief endpoints, the 14:00 UTC cron and the
TW/Anthropic/Slack secrets stay here, and the Profit worker calls them over a
Cloudflare service binding. Nothing to configure — set each brand's goals and
channel in Profit.


## 3. Dashboard

`account-health/index.html` → https://tools.go-mobius-digital.com/account-health/ (GitHub Pages,
same as the other tools). It talks to `https://mobius-account-health.mobius-digital.workers.dev`.
Sign in with the ADMIN_TOKEN the first time, then set a friendlier password in Settings.

## Scheduled jobs

- **03:30 UTC** — for every active account, re-pull the last 3 days of daily insights
  (Meta conversions keep arriving for ~72h), new activity-log events, and 10 days of
  Triple Whale daily metrics (Daily Brief); then pace/KPI Slack alerts. `/health` shows
  the last run.
- **14:00 UTC** — Daily Briefs for every brand with auto-post on (see 2e).

## Routes

See `../PRD.md` → "Worker API". Everything except `/health` needs `Authorization: Bearer <token>`.

## Gotchas

- **Rate limits.** Meta's Insights API is throttled per ad account; a 90-day backfill is one
  call per account (daily rows page), so it's fine. Activities are paged 500 at a time.
- **Currency.** Each account reports in its own currency; budget values in Settings are in
  that currency. Never sum across accounts with different currencies.
- **Timezone.** All daily bucketing uses the ad account's own timezone (Meta's `date_start`
  is already in it).
- Renaming the worker would wipe its secrets — don't.

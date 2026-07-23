# Mobius Pulse — Monitor Worker Setup

Free, self-hosted clone of [adstatus.app](https://adstatus.app): polls ad-platform
status feeds every 5 minutes, alerts Slack the moment something breaks (and when it
recovers), and lets you fan any alert out to all client channels with one click.

**Architecture (two independent providers — no silent failures):**

| Piece | Runs on | Job |
| --- | --- | --- |
| Dashboard | GitHub Pages | `tools.go-mobius-digital.com/pulse` — live status UI + settings |
| Monitor worker | Cloudflare Workers (free) | 5-min polls, Slack alerts, client fan-out, status API |
| Watchdog | GitHub Actions (free) | Every 15 min, checks the worker's heartbeat from *outside* Cloudflare. If the worker is down or stale, posts "the monitor itself is down" to Slack via a separate webhook |

Even if Cloudflare goes down entirely: the watchdog tells you within 15 minutes, and
the dashboard falls back to fetching public feeds directly from the browser.

---

## 1. Deploy the Cloudflare Worker (~10 min)

Prereqs: a free [Cloudflare account](https://dash.cloudflare.com/sign-up) and Node.js.

```bash
cd pulse/worker
npx wrangler login                          # opens browser, authorize
npx wrangler kv namespace create AD_STATUS  # prints an id →
#   paste that id into wrangler.toml (replace REPLACE_WITH_YOUR_KV_NAMESPACE_ID)

# Secrets:
npx wrangler secret put ADMIN_TOKEN         # invent a long random string; you'll paste it in the dashboard Settings
npx wrangler secret put SLACK_BOT_TOKEN     # from step 2 (you can deploy first and set this after)
npx wrangler secret put SLACK_SIGNING_SECRET

npx wrangler deploy                         # prints your worker URL, e.g.
#   https://mobius-ad-status.<your-account>.workers.dev
```

The cron trigger (`*/5 * * * *`) is created automatically on deploy.

## 2. Create the Slack app (~5 min)

1. Go to [api.slack.com/apps](https://api.slack.com/apps) → **Create New App** → **From a manifest** → pick your workspace.
2. Paste the contents of [`slack-app-manifest.json`](slack-app-manifest.json), first replacing
   `REPLACE-WITH-YOUR-WORKER-URL.workers.dev` with your worker URL from step 1.
3. Create, then **Install to Workspace**.
4. Copy **OAuth & Permissions → Bot User OAuth Token** (`xoxb-…`) → `npx wrangler secret put SLACK_BOT_TOKEN`
5. Copy **Basic Information → Signing Secret** → `npx wrangler secret put SLACK_SIGNING_SECRET`
6. In Slack, invite the bot to your internal alert channel and every client channel:
   `/invite @Ad Status`

## 3. Configure via the dashboard (~2 min)

Open the dashboard → **⚙ Settings**:

1. Paste your **Worker URL** and **Admin token** → **Connect**.
2. Pick the **internal alert channel** (alerts always land here first).
3. Check the **client channels** — the 📣 *Send to client channels* button on any alert
   posts to all of them. Add/remove clients any time by re-checking boxes here.
4. Toggle which **platforms** trigger notifications.
5. **Save**, then **Send test alert** — you should see it in Slack within seconds,
   including the working fan-out button.

Optional: paste the worker URL into `DEFAULT_WORKER_URL` at the top of
`pulse/index.html` so every visitor gets full live coverage without configuring
anything.

## 4. Arm the watchdog (~2 min)

1. In Slack: [create an **Incoming Webhook**](https://api.slack.com/messaging/webhooks)
   pointing at your internal channel (this is a *separate* delivery path from the bot,
   on purpose).
2. In this GitHub repo → **Settings → Secrets and variables → Actions**, add:
   - `AD_STATUS_WORKER_URL` — your worker URL
   - `AD_STATUS_WATCHDOG_WEBHOOK` — the webhook URL
3. Done — `.github/workflows/pulse-watchdog.yml` runs every 15 minutes.

## What gets monitored

Live machine-readable feeds (verified working):

| Platform | Source | Detail |
| --- | --- | --- |
| Meta Ads | metastatus.com JSON | Ads Manager, Marketing API, Business Suite, Shops, Catalog, Graph API, WhatsApp Business, Audience Network, more |
| Google Ads | official incidents.json | All Google Ads ecosystem products |
| Shopify | Statuspage | Admin, Checkout, Storefront, API, POS, Reports |
| Pinterest Ads | Statuspage | All components |
| OpenAI / ChatGPT | Statuspage | All components |
| Claude / Anthropic | Statuspage | All components |

Microsoft, TikTok, LinkedIn, Snapchat, X, Amazon and Apple Search Ads publish no
public machine-readable feed today — they appear as link-out chips on the dashboard.
To add one later, append an entry to `PLATFORMS` in `src/worker.js` (parsers exist
for Statuspage, Google-style incident feeds, and metastatus-style JSON).

## Worker API

| Route | Auth | Purpose |
| --- | --- | --- |
| `GET /health` | public | `{ok, lastRun}` — heartbeat for the watchdog |
| `GET /api/status` | public | current states + incident history (dashboard feed) |
| `POST /slack/interact` | Slack signature | handles the 📣 button |
| `GET/PUT /api/settings` | admin token | channels + platform toggles |
| `GET /api/channels` | admin token | Slack channels the bot can see |
| `POST /api/test` | admin token | send a test alert |
| `POST /api/poll` | admin token | run a poll immediately |

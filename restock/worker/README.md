# Mobius Restock — Inventory Forecast Worker

Snapshots Shopify inventory + sales hourly, computes a **weighted sell-through
velocity** per variant, projects days-of-stock remaining, and compares that to
each product's manufacturer lead time. Slack gets a daily digest (send time configurable in Settings) plus an
instant ping the moment anything crosses into "reorder now".

| Piece | Runs on | Job |
| --- | --- | --- |
| Dashboard | GitHub Pages | `tools.go-mobius-digital.com/restock` — report UI + settings |
| Forecast worker | Cloudflare Workers (free) | hourly snapshots, forecast math, Slack alerts, API |

## The forecast math

**Velocity** — a blend of three trailing windows (ending yesterday, so today's
partial day never skews it):

| Window | Weight | Why |
| --- | --- | --- |
| 14 days | 45% | recent enough to catch real trend changes, long enough to smooth a fluke day |
| 30 days | 35% | the stabilizer |
| 90 days | 20% | long-run baseline |

Safeguards:

- **Promo damper** — if the 14-day rate exceeds 2× the 90-day rate, its input is
  capped at 2× for projections and the item is flagged ⚡ *spiking* instead of
  blindly extrapolating a promo week.
- **Stockout exclusion** — days where a variant sat at zero stock with zero sales
  don't count in the denominator (being sold out ≠ selling slowly). Applies from
  the day tracking starts (Shopify has no historical inventory API).
- Windows with no real data yet (new products) drop out of the blend and the
  remaining weights renormalize.

**Status** — `daysLeft = inventory ÷ velocity`, compared to
`leadTime = production + shipping + buffer`:

- 🔴 **reorder** — daysLeft ≤ leadTime (also **stockout** at ≤0 inventory)
- 🟡 **watch** — daysLeft ≤ leadTime + watch window (default 30d)
- 🟢 **healthy** — everything else (plus *slow* / *dormant* for no-sales items)
- ⚠️ **unmapped** — product type has no lead-time profile and no metafield

**Lead times** — resolved per product, most specific wins:

1. Shopify metafield `custom.lead_time_days` (production + shipping total) — per-product override
2. Lead-time **profile** assigned to the product's **product type** in Settings
   (new products inherit automatically — nothing to do when you add SKUs)
3. Neither → flagged unmapped on the dashboard and in the digest

**Reorder suggestion** — `velocity × (targetCoverage + leadTime) − onHand`,
i.e. enough to cover the lead-time burn *and* the target coverage after arrival.

## Deploy (~10 min)

```bash
cd restock/worker
npx wrangler kv namespace create RESTOCK   # paste printed id into wrangler.toml
npx wrangler secret put ADMIN_TOKEN        # long random string; paste into dashboard Settings
npx wrangler secret put SLACK_BOT_TOKEN    # reuse the Mobius Pulse Slack app's xoxb- token
npx wrangler secret put SHOPIFY_CLIENT_ID_LUCKY
npx wrangler secret put SHOPIFY_CLIENT_SECRET_LUCKY
npx wrangler deploy
```

### Shopify credentials (per store)

Since Jan 2026 Shopify custom apps are created in the **Dev Dashboard**
([dev.shopify.com](https://dev.shopify.com)) — the old in-admin flow with a
one-time `shpat_` token is gone for new apps.

1. Sign in at **dev.shopify.com** with the account that owns the store, pick
   the store's organization.
2. **Apps → Create app** → name it "Mobius Restock".
3. Configure **access scopes**: `read_products`, `read_orders`,
   `read_inventory` → release the version and **install the app on the store**.
4. App → **Settings** → copy **Client ID** and **Client secret** →
   `npx wrangler secret put SHOPIFY_CLIENT_ID_LUCKY` / `…CLIENT_SECRET_LUCKY`.

The worker exchanges these for a 24-hour access token automatically
(client-credentials grant, cached in KV, self-refreshing). Client credentials
only work when the app and store are in the **same Dev Dashboard org** — if
you hit `shop_not_permitted`, check the store appears under that org.

> A legacy static token still works if you have one: set `SHOPIFY_TOKEN_LUCKY`
> instead and it takes precedence.

> Reading orders older than 60 days needs the `read_all_orders` scope, which
> Shopify grants on request. Without it the 90-day backfill still works — it
> just starts from the oldest order it can see.

### Slack

Reuses the Mobius Pulse Slack app — no new app needed. Just:
1. `npx wrangler secret put SLACK_BOT_TOKEN` with the same `xoxb-` token.
2. In Slack, `/invite @Mobius Pulse` in **#lucky-golf-inventory**.
3. Pick the channel in dashboard Settings.

### First run

Dashboard → Settings → paste worker URL + admin token → **Backfill 90 days**
(builds the sales history) → **Run snapshot now**. Review the seeded lead-time
profiles — they're sensible examples, not your real numbers.

## Adding a store later

1. Append to `STORES` in `src/worker.js` (id, name, myshopify domain, timezone).
2. Create a Dev Dashboard app for that store (steps above) and set
   `SHOPIFY_CLIENT_ID_<ID>` + `SHOPIFY_CLIENT_SECRET_<ID>`.
3. `npx wrangler deploy`, pick its Slack channel in Settings, backfill.

## Worker API

| Route | Method | Purpose |
| --- | --- | --- |
| `/health` | GET | `{ok, lastRun}` heartbeat (public) |
| `/api/stores` | GET | store list + token/history status |
| `/api/report?store=` | GET | latest computed forecast report |
| `/api/settings` | GET/PUT | profiles, type map, thresholds, channels, mutes |
| `/api/channels` | GET | Slack channels the bot can see |
| `/api/snapshot?store=` | POST | run a snapshot now |
| `/api/digest?store=` | POST | snapshot + force-send the digest |
| `/api/backfill?store=` | POST | `{days}` — resumable sales backfill |

All `/api/*` routes require `Authorization: Bearer <ADMIN_TOKEN>`.

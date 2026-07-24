# Mobius Restock — Inventory Forecast Worker

Snapshots Shopify inventory + sales daily, computes a **weighted sell-through
velocity** per variant, projects days-of-stock remaining, and compares that to
each product's manufacturer lead time. Slack gets a morning digest plus an
instant ping the moment anything crosses into "reorder now".

| Piece | Runs on | Job |
| --- | --- | --- |
| Dashboard | GitHub Pages | `tools.go-mobius-digital.com/restock` — report UI + settings |
| Forecast worker | Cloudflare Workers (free) | daily snapshots, forecast math, Slack alerts, API |

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
npx wrangler secret put SHOPIFY_TOKEN_LUCKY
npx wrangler deploy
```

### Shopify token (per store)

Shopify Admin → **Settings → Apps and sales channels → Develop apps →
Create an app** ("Mobius Restock") → **Configure Admin API scopes**: enable
`read_products`, `read_orders`, `read_inventory` → **Install app** → copy the
Admin API access token (`shpat_…`) → `npx wrangler secret put SHOPIFY_TOKEN_LUCKY`.

> Reading orders older than 60 days needs the `read_all_orders` scope, which
> Shopify grants on request (Apps → your app → ask for access). Without it the
> 90-day backfill still works — it just starts from the oldest order it can see.

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
2. `npx wrangler secret put SHOPIFY_TOKEN_<ID>` with that store's token.
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

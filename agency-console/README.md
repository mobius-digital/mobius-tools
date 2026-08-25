# Mobius Console

One link for the agency: every client's Marketing Calendar as a card, and an
**Add client** button that builds a brand-new board end to end — its own
address, database, colours, icons and team password — in about four minutes.

**Live:** https://mobius-console.mobius-digital.workers.dev

## How Add client works

1. The console stores the client's spec (three colours in, the full palette is
   derived) and dispatches the GitHub Actions workflow
   `.github/workflows/provision-client.yml`.
2. The workflow fetches the spec back (`/api/spec/:id`, bearer
   `PROVISION_SECRET`), then runs
   `launch-calendar/scripts/provision-client.mjs`: creates the D1 database,
   applies the schema, bakes the brand into a temporary `brand.config.ts`,
   renders icons, deploys `<slug>-calendar`, sets a generated password, and
   cross-links every board's switcher (entries restricted to the agency
   emails).
3. The workflow reports back (`/api/complete/:id`); the card flips to live and
   shows the password once.

The same script runs from a laptop with wrangler's login:
`node scripts/provision-client.mjs --spec spec.json` (from `launch-calendar/`).

## The shared cron

Cloudflare's free plan caps scheduled triggers per account, so client boards
deploy **without** one. The board that has a trigger (the original
`launch-calendar`) fans out each tick to every board in its switcher list,
calling their `/api/cron` with the shared `CRON_SECRET` — that keeps Slack
batching running everywhere on one trigger. Fan-out only happens from a real
scheduled tick, never from an HTTP-triggered one, so boards cannot chain.

## Secrets

| Where | Name | What |
|---|---|---|
| console worker | `CONSOLE_PASSWORD` | signs the agency in |
| console worker | `GH_TOKEN` | lets Add client dispatch the workflow |
| console worker | `PROVISION_SECRET` | authenticates the pipeline both ways |
| console worker | `CRON_SECRET` | goes into each new board for the shared cron |
| repo (Actions) | `PROVISION_SECRET` | same value as the console's |
| repo (Actions) | `CLOUDFLARE_API_TOKEN` | lets the runner create databases and deploy — **Workers Scripts: Edit** + **D1: Edit** on the account |
| repo (Actions) | `CLOUDFLARE_ACCOUNT_ID` | the account the boards live on |
| repo (Actions, variable) | `CONSOLE_URL` | where the runner reports back |

Deploy the console after a change (from `launch-calendar/`, which holds
wrangler): `npx wrangler deploy -c ../agency-console/wrangler.jsonc`.

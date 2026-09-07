# Mobius Slack router

The one address Slack talks to.

**Paste this into Slack** — api.slack.com/apps → the "Mobius Digital" app →
Interactivity & Shortcuts → Request URL:

```
https://mobius-slack.mobius-digital.workers.dev/slack
```

## Why it exists

Slack allows exactly **one** interactivity Request URL per app, and the single
"Mobius Digital" app serves three tools. That URL used to point at the Ledger
worker, which forwarded anything that wasn't Ledger's to Pulse. It worked, but
the URL read `mobius-ledger…` while actually serving Locus and Pulse too, which
is confusing to anyone opening the Slack settings page a month later.

## Why not `tools.go-mobius-digital.com/slack`

A Cloudflare Worker can only serve a hostname whose DNS Cloudflare hosts. This
zone is on Squarespace/Google nameservers, `tools` is already a CNAME to GitHub
Pages, and Cloudflare rejects adding a bare subdomain — so a branded URL means
moving the entire zone, which puts the Google Workspace MX records (and so the
business email) in the blast radius. Not worth it for a URL that is pasted once
and then never looked at again.

## What it does

1. Verifies Slack's HMAC signature. Fails closed with no secret set, rejects
   anything older than five minutes, compares in constant time.
2. Works out whose payload it is:
   - **Ledger** — a block action whose value carries `{id, tax}`
   - **Locus** — action ids and modal callback ids prefixed `brief_` / `report_`
     (plus `noop_open`)
   - **Pulse** — everything else, which is what it got before this existed
3. Hands it on over a service binding with the raw body and both signature
   headers intact, so each tool verifies for itself. This worker can never be a
   way around anything.

It stores nothing and holds no token beyond the signing secret. A `GET /slack`
reports whether the secret is set and whether all three bindings resolve.

## Deploy

```
cd slack-router/worker
npx wrangler deploy
npx wrangler secret put SLACK_SIGNING_SECRET
```

The signing secret is the **same value** on all four workers — it is one Slack
app, so there is one secret.

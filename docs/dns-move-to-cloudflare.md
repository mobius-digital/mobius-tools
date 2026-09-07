# Moving go-mobius-digital.com to Cloudflare DNS

Why: a Cloudflare Worker can only answer on a hostname whose DNS Cloudflare
hosts. Today the zone lives on Google/Squarespace nameservers, so every tool
backend is stuck on a `*.workers.dev` address. Moving the zone lets
`tools.go-mobius-digital.com/api/*` reach the workers directly.

**The blast radius is Cole's business email.** The MX, SPF, DKIM and DMARC
records below are what make `cole@go-mobius-digital.com` send and receive. If
one of them is dropped or mistyped during the move, mail breaks. Everything in
this document exists to make that impossible: capture first, verify second,
switch nameservers last.

Nothing here is urgent and nothing depends on it — `*.workers.dev` keeps
working forever, so this is additive. It can be abandoned halfway with no
consequence, and reversed by pointing the nameservers back.

## The zone as it stands

Captured live 2026-09-07 (`nslookup … 8.8.8.8`). Thirteen records.

| Type | Name | Value | Notes |
|---|---|---|---|
| A | `@` | `35.71.142.77` | Framer site |
| A | `@` | `52.223.52.2` | Framer site |
| A | `@` | `198.185.159.144` | Framer site |
| CNAME | `www` | `sites.framer.app` | Framer site |
| CNAME | `tools` | `mobius-digital.github.io` | GitHub Pages — the tools |
| MX 1 | `@` | `aspmx.l.google.com` | **email** |
| MX 5 | `@` | `alt1.aspmx.l.google.com` | **email** |
| MX 5 | `@` | `alt2.aspmx.l.google.com` | **email** |
| MX 10 | `@` | `alt3.aspmx.l.google.com` | **email** |
| MX 10 | `@` | `alt4.aspmx.l.google.com` | **email** |
| TXT | `@` | `v=spf1 include:_spf.google.com ~all` | **email** |
| TXT | `@` | `clickfunnels-domain-verification=JDoDMe` | keep — proves ownership |
| TXT | `_dmarc` | `v=DMARC1; p=none; rua=mailto:cole@go-mobius-digital.com; pct=90; sp=none` | **email** |
| TXT | `google._domainkey` | `v=DKIM1; k=rsa; p=MIIBIjANBgkq…WQIDAQAB` (one long value) | **email** — the risky one |

The DKIM value is ~400 characters and DNS splits it into quoted chunks. Some
importers keep the chunk boundaries and some rejoin them; either is fine, but a
**truncated** value silently breaks mail signing. Verify this one by eye.

## Steps

**1 — Add the site.** dash.cloudflare.com → *Add a site* → `go-mobius-digital.com`
→ **Free** plan. Cloudflare scans the existing zone and imports what it finds.
Do **not** change nameservers yet; the zone sits "pending" and does nothing.

**2 — Verify against the table above.** Every row present, values identical.
Add anything the scan missed by hand.

**3 — Set the proxy flags.** Click the cloud icon per record:

- `tools` → **Proxied (orange)**. A Worker route only runs on a proxied record;
  this is the one that has to be orange.
- Root `@` and `www` → **DNS only (grey)**. The Framer site keeps working
  exactly as it does now, untouched.
- MX and TXT records have no proxy setting.

**4 — SSL/TLS mode.** SSL/TLS → Overview → **Full (strict)**. GitHub Pages
serves a valid certificate, so strict is correct; *Flexible* would cause a
redirect loop on `tools`.

**5 — Switch the nameservers.** Squarespace → Domains → `go-mobius-digital.com`
→ Nameservers → replace the four `ns-cloud-e*.googledomains.com` entries with
the two Cloudflare gives you. Propagation is usually minutes.

**6 — Check mail before anything else.** Send an email from
`cole@go-mobius-digital.com` to a Gmail address, open *Show original*, and
confirm **SPF: PASS, DKIM: PASS, DMARC: PASS**. Then reply to it from Gmail and
confirm it arrives. If any of those fail, compare the record against the table
and fix it — or set the nameservers back at Squarespace, which restores the old
zone wholesale.

**7 — Then the Worker route** (this part is mine, not Cole's): add a route
`tools.go-mobius-digital.com/api/*` → `mobius-slack`, and re-point the Slack
app's Interactivity URL at `https://tools.go-mobius-digital.com/api/slack`.
The `*.workers.dev` address keeps working, so this can happen whenever.

## What does not change

Domain registration stays at Squarespace. Only the nameservers move. The
Framer site, GitHub Pages, and every `*.workers.dev` URL keep working
throughout — including during step 5.

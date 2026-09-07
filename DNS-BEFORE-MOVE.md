# go-mobius-digital.com — every live DNS record, captured 7 Sep 2026

Read straight from public DNS (Google 8.8.8.8), not from anyone's control panel,
so this is what the internet actually sees today.

**Use this as the checklist after moving nameservers to Cloudflare.** Cloudflare's
importer copies records automatically, but it is not required to be perfect — and
the ones that matter most are silent when they break. Nobody gets an error when
DKIM goes missing; mail just starts landing in spam a week later.

---

## Nameservers today (this is the only thing that changes)

```
ns-cloud-e1.googledomains.com
ns-cloud-e2.googledomains.com
ns-cloud-e3.googledomains.com
ns-cloud-e4.googledomains.com
```

---

## EMAIL — verify these first, and do not flip nameservers until all five match

MX records. If one is missing or the priority is wrong, mail stops.

| Priority | Mail server |
|---|---|
| 1 | `aspmx.l.google.com` |
| 5 | `alt1.aspmx.l.google.com` |
| 5 | `alt2.aspmx.l.google.com` |
| 10 | `alt3.aspmx.l.google.com` |
| 10 | `alt4.aspmx.l.google.com` |

**SPF** — TXT on the root:
```
v=spf1 include:_spf.google.com ~all
```

**DMARC** — TXT on `_dmarc`:
```
v=DMARC1; p=none; rua=mailto:cole@go-mobius-digital.com; pct=90; sp=none
```

**DKIM** — TXT on `google._domainkey`. **Present, 410 characters.**
This is the one most likely to be dropped or truncated in a migration, because
it is long and Cloudflare may split it across strings. Copy it from Google
Admin (Apps → Google Workspace → Gmail → Authenticate email) rather than
retyping it, and check the whole value, not just that something exists.

---

## WEBSITE

**Root** `go-mobius-digital.com` → A records (Framer marketing site):
```
35.71.142.77
52.223.52.2
198.185.159.144
```

**`www`** → CNAME `sites.framer.app`

**`tools`** → CNAME `mobius-digital.github.io`
Serves every dashboard and every client report link. Note: GitHub Pages requires
this record to stay a CNAME (or GitHub's four A records) and, on Cloudflare, to
be set to **DNS only** (grey cloud) unless you also move the site off Pages —
proxying it through Cloudflare's orange cloud in front of GitHub Pages causes a
redirect loop.

---

## OTHER

TXT on the root, alongside SPF — do not drop it, it verifies a third-party
service:
```
clickfunnels-domain-verification=JDoDMe
```

---

## After the move — check in this order

1. `nslookup -type=mx go-mobius-digital.com 1.1.1.1` — all five back, right priorities
2. Send yourself an email from an outside address, and send one out
3. `https://go-mobius-digital.com` and `https://www.go-mobius-digital.com` load Framer
4. `https://tools.go-mobius-digital.com/profit/` loads Locus
5. Open a client report link and confirm it still resolves

Nothing about the Cloudflare Workers changes. They are on `workers.dev` and are
not affected by this move in either direction.

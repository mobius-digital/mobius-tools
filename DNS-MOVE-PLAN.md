# Getting every tool onto go-mobius-digital.com

**Decision: move DNS to Cloudflare.** It is the only way to put a `.com` address
on a Cloudflare Worker, and Lineup — which clients use — is on `.workers.dev`
today. That is the whole reason.

Squarespace stays the registrar. Same renewal, same invoices. Cloudflare only
answers DNS questions about the domain; it does not own it.

---

## The end state

| Address | What it is | Changes? |
|---|---|---|
| `go-mobius-digital.com` | Framer marketing site | no |
| `www.` | Framer | no |
| `tools.` | All seven dashboards, GitHub Pages | no — stays on GitHub |
| `lineup.` | **Lineup marketing calendar** | **new — replaces the .workers.dev address** |
| `slack.` | Slack button router | new, optional |
| email | Google Workspace | no |

Everything else — the six worker engines behind the dashboards — can stay on
`.workers.dev`. Nobody outside the team ever sees those. Lineup is the only tool
with a client-facing address of its own, which is why it is the one that matters.

---

## Step 1 — Cloudflare takes over DNS

1. Cloudflare dashboard → **Add a site** → `go-mobius-digital.com` → **Free** plan.
2. It scans and imports the existing records. **Check them against
   `DNS-BEFORE-MOVE.md` before going any further** — especially the five MX rows
   and DKIM. Send me the list and I will check it line by line.
3. Set `tools` and `www` to **DNS only (grey cloud)**. An orange cloud in front
   of GitHub Pages is a redirect loop, and Framer wants to be reached directly.
4. Cloudflare gives you two nameservers. **Squarespace → Domains → Nameservers**
   → replace Google's four with Cloudflare's two.
5. Propagation is usually minutes, up to a few hours. Nothing breaks while it
   happens: both sets of nameservers answer with the same records.

**Verify before moving on:** send yourself an email and receive one; load
`go-mobius-digital.com`, `www.`, and `tools.go-mobius-digital.com/profit/`.

---

## Step 2 — Lineup gets its real address

I do this part; it is two minutes once step 1 is live.

1. Add `lineup.go-mobius-digital.com` as a custom domain on the `launch-calendar`
   worker. Cloudflare writes the DNS record itself.
2. Keep the old `.workers.dev` address working alongside it, so nothing breaks
   the moment it changes.

**Then three one-time jobs, in this order:**

1. **Google sign-in** — add `https://lineup.go-mobius-digital.com` to the OAuth
   client's authorised JavaScript origins. Sign-in fails on the new address
   until this is done, which is why it goes first. (You have to be signed into
   the Google Cloud console for this; I cannot type your password.)
2. **Phone icons** — the installed home-screen app points at the old address.
   Everyone deletes it and re-adds it from the new one. Once, and only the
   people who installed it.
3. **Stored links** — anything in the database or in Slack pointing at
   `launch-calendar.mobius-digital.workers.dev`. I will find and update these.

The old address keeps working throughout, so there is no moment where somebody
is locked out.

---

## What this does not do

- It does not move `tools.` off GitHub Pages. Those seven dashboards stay
  exactly where they are, at zero cost.
- It does not change any billing. Cloudflare DNS is free; you keep paying
  Squarespace for the domain and $5/mo for Workers.
- It does not touch email beyond carrying the same records to a new host —
  which is the one part worth checking twice.

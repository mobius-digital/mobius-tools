# Shopify App Store submission — Mobius Digital

Everything Cole needs to paste, in the order the Partner Dashboard asks for it.
App: `Mobius Digital` (renamed from Mobius Profit — one Shopify app is meant to
carry whatever Mobius builds, and Profit is only the first tool on it) · client id `a204d4974bccc5aacf66c3f723fb5652`

---

## 1. Fix configuration → app icon

Upload **`profit/assets/app-icon-1200.png`** (1200×1200, PNG).

Rebuilt from the 128px favicon, which was too small to upscale — the geometry was
measured off it and redrawn at full size (`assets/make-icon.py`, which also diffs the
result back against the original: 2% mean channel difference).

The other two items under this step already pass — the URLs no longer contain
"example" (that was the CLI blanking the TOML) and the contact email is fine.

## 2. Emergency contact

Email `cole@go-mobius-digital.com` plus a phone number. Only Cole can supply the phone.

## 3. Primary listing language

English.

## 4. Request access to protected customer data

**Request Level 1 only. Do NOT tick name, email, address or phone.**

Level 1 is "customer data excluding name/address/phone/email" and needs a standard
review. Ticking any of those four fields makes it Level 2, which triggers an
additional data-protection review — for fields this app never reads. Verified against
the source: the only email handling in the worker is Mobius staff Google sign-in.

### Screen 1 — "Select your data use and reasons"

Tick **Analytics**, and nothing else. The other six are all wrong for this app:
Customer service, Store management and Personalization would mean acting on a
shopper's behalf; Marketing or advertising would mean messaging shoppers, which this
app never does; App functionality means billing or auth.

The "Describe your reason in detail" box (0/100) belongs to the **Other** checkbox,
not to the section as a whole — with Analytics ticked there is nothing to fill in.
Leave it alone.

### Screen 2 — "Protected customer fields (optional)"

**Leave Name, Email, Phone and Address all unselected.** This is the whole difference
between Level 1 and Level 2. The app reads none of them: the cohort data comes from
ShopifyQL aggregates grouped by first-order month, never from customer records.

### Screen 3 — "Data protection details", all seven questions

| # | Question | Answer | Why |
|---|---|---|---|
| 1 | Process the minimum personal data required? | **Yes** | Customer and order data is aggregated as it is read; only monthly totals are written |
| 2 | Tell merchants what you process and why? | **Yes** | Privacy policy at `tools.go-mobius-digital.com/privacy/`, which lists all four scopes |
| 3 | Limit your use to that purpose? | **Yes** | Used only for that merchant's own reporting; never pooled across clients, never sold |
| 4 | Privacy and data protection agreements with your merchants? | **Cole must answer — see below** | |
| 5 | Respect and apply customers' consent decisions? | **Not applicable** | The app never contacts shoppers and never uses their data for marketing or tracking, so there is no consent decision to apply |
| 6 | Automated decision-making with legal or significant effects — can customers opt out? | **Not applicable** | The app makes no decisions about individuals at all; it reports aggregates to the merchant |
| 7 | Retention periods? | **Yes** | Deleted within 30 days of uninstall, or sooner on request; stated in the policy |
| 8 | Encrypt at rest and in transit? | **Yes** | HTTPS throughout; Cloudflare D1 encrypts at rest |

**Question 4 is the one that is not ours to answer.** It asks whether there is a
written privacy / data protection agreement with each merchant. The privacy policy
says Mobius acts as the processor and the store owner as the controller, but that is
our statement, not a signed agreement. Answer Yes only if the client contracts
actually contain a data protection or confidentiality clause. If they do not, the fix
is a one-page DPA appended to the agency agreement, not a No on this form.

### Reason for accessing customer data — paste this

> Mobius Digital is a marketing agency. This app produces profitability reporting for
> the merchants we work with, covering revenue, contribution margin and customer
> economics.
>
> We read order counts and first-order dates so we can report how many customers are
> new versus returning, and how the value of a customer develops after their first
> order. This is aggregated into monthly cohort totals as it is processed.
>
> We do not store individual customer records. Names, email addresses, postal
> addresses and phone numbers are never read or written to our database — only monthly
> aggregate figures are retained.

### Reason for accessing order data — paste this

> Order totals, dates, discounts, returns, shipping and tax are used to calculate the
> merchant's revenue and contribution margin. Orders are aggregated to daily and
> monthly totals; no individual order records are retained.

### Data protection details

All nine Level 1 requirements are met and can be attested honestly:

| Requirement | How this app meets it |
|---|---|
| Minimum data required | Aggregates only; no customer-level rows are written |
| Inform merchants of purpose | Privacy policy at `tools.go-mobius-digital.com/privacy/` |
| Limit use to stated purposes | Reporting for the merchant's own account only |
| Respect consent / opt-out | No marketing use; read-only, no writes to the store |
| Opt-out of automated decisions | Not applicable — no automated decisions about individuals |
| Data protection agreement | Agency agreement with each client; Mobius is the processor |
| Retention periods | Deleted within 30 days of uninstall, or sooner on request |
| Encrypt in transit | HTTPS throughout |
| Encrypt at rest | Cloudflare D1 managed encryption |

## 5. Automated checks → Run

Expected to pass. What each one maps to:

- **Authenticates immediately after install** — `/shopify/install` redirects straight
  to Shopify's OAuth authorize.
- **Redirects to app UI after authentication** — the callback sends the merchant to
  their own profit dashboard. This one used to fail: the callback returned a static
  "Connected" page, which is also the stated App Store rejection reason ("all apps
  must have a user interface that merchants can interact with").
- **Mandatory compliance webhooks** — three declared in `shopify.app.toml`.
- **Verifies webhooks with HMAC** — `validWebhookHmac`, and it fails CLOSED: an
  unverifiable request is rejected 401 rather than erroring 500.
- **Valid TLS** — Cloudflare Workers.

## 6. Select capabilities

Available once the listing language is set.

## 7. Self review (optional)

`/shopify-app-store-review` via the Shopify AI Toolkit.

---

## Listing content still to produce

| Item | Spec | Status |
|---|---|---|
| App icon | 1200×1200 | **done** — `assets/app-icon-1200.png` |
| App name | ≤30 chars | `Mobius Digital` (14) |
| App introduction | ≤100 chars | draft below |
| Feature media | 2–3 min video, or a static image | not started |
| Screenshots | 1600×900, 3–6 desktop | not started |
| Privacy policy | URL | **done** — `tools.go-mobius-digital.com/privacy/` |
| Demo store | dev store set up for the reviewer | not started |

**App introduction draft (86 chars):**

> Know what your store actually earns — revenue, margin and customer value in one view.

**Note on the demo store.** The reviewer installs on their own test store, which will
have no Triple Whale account behind it, so it will hit the unmatched-shop path and see
the "not set up yet" page rather than a dashboard. That is honest but it is not a
merchant UI, and it is the most likely reason this submission gets bounced. Decide
before submitting whether to build a Shopify-only view that works for any store.

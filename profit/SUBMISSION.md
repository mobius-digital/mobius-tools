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

---

# The App Store listing

Every character count below is verified by `assets/listing-fields.py` — run it after
any edit rather than counting by hand.

## Basic information

**App name** (14/30)

    Mobius Digital

**Primary category:** Store management → **Operations**. The documented tag for
"apps that analyze and generate insights or recommendations for a store" is Analytics.

**Languages:** English.

## Listing content

**Introduction** (100/100 — exactly at the limit, do not add a character)

    See what your store keeps after every variable cost. Revenue, margin and customer value in one view.

**App details** (500/500). No links and no formatting — the form rejects both.

    Mobius Digital reports what a store earns after the costs that move with sales. It reads your orders, products and customers, subtracts product cost, shipping, payment fees and ad spend, and shows the contribution margin left over.

    It also groups customers by the month they first bought, so you can see whether people come back and what a customer is worth over time.

    Figures are shown against a monthly revenue and spend plan you set, so you can tell early whether the store is on track.

**Features** — three are required, five are allowed. Use all five.

| # | Text | Chars |
|---|---|---|
| 1 | Contribution margin after product, shipping, payment fee and ad costs | 69/80 |
| 2 | Customer cohorts showing repeat rate and lifetime value by first order | 70/80 |
| 3 | Monthly revenue and spend plan, with month to date pacing against it | 68/80 |
| 4 | New versus returning revenue split and cost to acquire a customer | 65/80 |
| 5 | Daily summary of yesterday revenue, spend and margin versus plan | 64/80 |

## Integrations

Maximum six, and Shopify itself must not be listed. Two apply:

    Triple Whale
    Slack

Triple Whale is where the daily revenue, spend and cost figures are synced from;
Slack is where the daily summary is posted. Nothing else the tool touches is a
merchant-facing service.

## Discovery

**App card subtitle** (58/62)

    Know what your store keeps after product, shipping and ads

**Search terms** — one idea each, no "Shopify", no competitors:
`profit margin` · `profitability` · `contribution margin` · `lifetime value` · `cohort analysis`

**Title tag** (57/60)

    Mobius Digital: store profit and customer value reporting

**Meta description** (144/160)

    Report what your store keeps after product, shipping, payment and ad costs. Track contribution margin, customer cohorts and monthly plan pacing.

## Support and resources

- Preferred support channel: **Support email address** — `cole@go-mobius-digital.com`
- Privacy policy URL: `https://tools.go-mobius-digital.com/privacy/`
- Merchant review email and app submission email: `cole@go-mobius-digital.com`

## Install requirements

**"My app doesn't require the Shopify Online Store or Shopify POS."** The app has no
theme extension and never touches theme assets — it only reads the Admin API.

Leave the geographic requirements unticked. Nothing in the money model is
currency-specific; each account carries its own currency and timezone.

## Pricing

At least one public plan is required. Add a single **Free** plan — the app is operated
for Mobius Digital's own retainer clients and never charges through Shopify. Leave "I
have approval to charge merchants outside of the Shopify Billing API" unticked, because
the app does not charge merchants at all.

## Tracking

All optional. Skip Google Analytics, remarketing and the Facebook Pixel.

---

# App testing information

## There is NO merchant sign-in — and that changes the answers

Cole caught this and he is right. The dashboard with tabs and a client picker is the
INTERNAL agency tool; a merchant never sees it. What a merchant gets after installing
is a single-page report at `?perf=<token>`, opened straight from the OAuth callback,
with no account and no password.

So:

- **Tick "My app doesn't require an account to use it."** For a merchant that is true.
- The reviewer gets the demo REPORT LINK, not a login.
- Screenshots must be of that report, not of the agency tool. An App Store listing
  showing a multi-tab dashboard merchants never reach is exactly the listing/behavior
  mismatch review looks for.

**Demo report link** (no sign-in, read-only, fictional brand):

    https://tools.go-mobius-digital.com/profit/?perf=d3e0a11b0c5f4a29b7d6e8c1a04f9b52

## Testing instructions (paste verbatim)

```
Mobius Digital reports store profitability for merchants. It is read-only: it reads orders, products and customers through the Admin API and writes nothing back to the store.

NO ACCOUNT IS NEEDED
The app is not embedded in the Shopify admin and there is no sign-in. When a merchant approves the permission screen, the OAuth callback sends them straight to their own report at a private link. That link is the whole merchant-facing product.

SEE THE WORKING PRODUCT
Open this demonstration report — no login, nothing to set up:

https://tools.go-mobius-digital.com/profit/?perf=d3e0a11b0c5f4a29b7d6e8c1a04f9b52

It shows a fictional brand, Harborline Supply, with sample figures. No real merchant and no real customer data appears anywhere in it.

WHAT IT SHOWS
- Month to date revenue, ad spend, MER and contribution margin, each against the month's plan pro-rated to the days elapsed.
- "Where the money went": the full waterfall from net sales down to contribution margin, subtracting product cost, fulfilment, handling, payment fees and advertising.
- Revenue against ad spend day by day.
- New customers versus returning, in revenue.
- Which weekdays actually run above and below an average day, measured across three complete months.
- The last six months of revenue, ad spend and MER.

INSTALLING ON YOUR OWN TEST STORE
Install URL: https://mobius-profit.mobius-digital.workers.dev/shopify/install?shop=YOUR-STORE.myshopify.com

Please note what you will see. This app is operated for a small number of agency retainer clients, and a reporting account is created for a brand before its store is connected. Installing on a store we have not set up reporting for lands on a page saying the store is connected but is not matched to a reporting account yet. That is the intended behavior for an unknown store, not an error. The demonstration link above is the way to see the working product.

CUSTOMER DATA
No customer names, email addresses, postal addresses or phone numbers are read or stored. Customer data is aggregated as it is read and only monthly totals are written to our database. Cohort figures come from ShopifyQL aggregate queries, which is why read_reports is requested.
```

# Screenshots — done

Three 1600x900 PNGs in `assets/screenshots/`, all of the MERCHANT-FACING report.

| File | Alt text (64 max) |
|---|---|
| `1-report.png` | Monthly profit report from revenue down to margin |
| `2-daily.png` | Daily revenue against ad spend, and new versus returning |
| `3-week.png` | Which weekdays run above and below an average day |

**Feature media:** `1-report.png`, alt text `Store profit report showing revenue, costs and margin`.

The earlier set showed the internal dashboard and was discarded: merchants never see
those screens. Regenerate with `python assets/make-screenshots.py <dir-of-captures>`.

# What is still blocked, and why

Five fields cannot be filled from a text draft. They all need the same thing first:
**a demo account with fictional data.**

Shopify's own wording on the upload form is the constraint: "any account information
displayed is fictional and not data from a real person." Screenshots of the live tool
would put six real brands' revenue, margin and customer economics in a public App Store
listing. That is not acceptable regardless of what review requires.

| Field | Needs |
|---|---|
| Screenshots (3 × 1600×900) | demo account |
| Feature media (1600×900) | demo account |
| Screencast URL (3–8 min) | demo account, then Cole records it |
| Test account login | demo account |
| Testing instructions | written once the above exists |

**The test account must not use Google SSO** — Shopify rejects those outright. The
dashboard already has a password path behind "Use a password instead" on the sign-in
screen, so this is workable, but the password must open a demo-only view rather than
the real client list.

**Proposed shape.** A `demo` flag on a session that pins the tool to one fabricated
brand and hides every other account. Same code paths, same screens, invented numbers.
It solves all five fields at once and keeps client data out of the submission.

# Leak finder: where each brand is losing money or customers, ranked, with the fix (handoff, 2026-10-13)

Start a worktree. Read this file, then profit/CLAUDE.md and account-health/CLAUDE.md (Google Ads in depth, Website /
Search / Clarity, Klaviyo in depth, the Creative calls and ad set rule, TikTok direct, the command center, the
Strategist knowledge base). Cole asked for it on 2026-10-13. First do the research and the audit below, then make ONE
mock page and publish it as an Artifact for Cole's OK, then build exactly that. Deploy both workers, commit, push,
report in SHORT bullets (what changed, what Cole must do).

House rules: no em dashes anywhere; in-app modals only; v2 tokens only, no hex in Locus CSS; judge from context, no
keyword lists for AI routing (a search term is judged irrelevant by the model reading the brand brain, never by a word
list); simplicity over features. Deploy, commit and push without asking; merge origin/main first. Commits end with
`Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Push with
`git -c credential.helper= -c credential.helper='!gh auth git-credential' push origin HEAD:main`.

## Why (Cole, 2026-10-13)

"Is there anything where we can see where things are leaking? Google Ads, PMax search terms, YouTube, TikTok, Meta, the
general funnel, landing pages, conversion rate drop-offs against the industry, like sessions to add to cart, add to cart
to checkout super low... at the top of each thing." Viktor (Cole's Slack AI) had been posting a weekly "Search Term
Report" (negative keyword candidates) into five internal channels; Cole asked Viktor to delete it and wants Locus to do
this instead.

## What Locus has today (verify each before building; do not rebuild what works)
- Google: Ads > Google > Search terms (top 50 by spend, brand vs the rest, "no conversion" marked), Campaigns (edit
  status and budget), Ads (RSA text, PMax asset groups), Changes. No negative keyword suggestions, no PMax search terms,
  no YouTube / Demand Gen view metrics. account-health `google.js`.
- Meta: Ads > Today's calls (ad set first, money at stake), Ads > Meta > Ads (calls, tags, fatigue, cadence).
- TikTok: direct API built, waiting on TikTok's app review and the two secrets; only Triple Whale totals today.
- Website: Store > Website (GA4 funnel sessions > add to cart > checkout > purchase, biggest drop highlighted, against
  the previous period only, NOT against a benchmark; GA4 linked for Lucky, Bonk, Party Patch). Clarity built, no brand
  connected. Shopify-side funnel: none (`p_shopify` empty, no store has the Mobius app installed).
- Email: the Klaviyo flags (missing core flows, a flow off that earned, deliverability).
- Home command center: goal misses, ad cadence, fatigue, Day check.

## What to build

### 1. The leak list (one engine, profit `hub.js` + account-health reads)
`GET /api/hub/leaks?act=<brand>&days=30` returns ranked leaks, each: `area` (google_search | google_pmax |
google_video | meta | tiktok | funnel | landing_page | email), `title` (plain words), `number` (what we measured, with
its source), `benchmark` (what good looks like and where that number comes from), `cost` (estimated dollars a month the
leak costs, the ranking key; say how it was estimated), `fix` (one sentence, the action), `who` (strategist / buyer /
Google / email owner from the roster), `apply` (when Locus can make the change itself), `go` (the Locus page that shows
it). Cache an hour. Sources:
- **Google search terms:** the last 30 days of `search_term_view` with zero conversions and spend over a floor, judged
  by ONE Sonnet call that reads the brand brain (what the brand sells) and labels each term irrelevant / relevant but
  not converting / brand; irrelevant ones become "add as negative" with an **Apply** that adds the negative keyword
  (campaign or shared list) through the Google Ads API (google.js; validateOnly first, the same propose/apply pattern as
  `adsCampaignWrite`, Change Log line, undo). This replaces Viktor's report.
- **PMax search terms:** `campaign_search_term_insight` (category level) for Performance Max campaigns; flag categories
  with spend and no conversions. (Negatives on PMax go through account-level negative keyword lists; say so if the API
  refuses.)
- **YouTube / Demand Gen / video:** video campaigns' view rate, CPV, conversions; flag spend with no conversions over
  the brand's judging bar.
- **Meta:** the existing buyerList money at stake (cut lines), not recomputed.
- **TikTok:** when connected, same rule as Meta on TikTok's own numbers; until then one line "connect TikTok".
- **Funnel against benchmarks:** sessions > add to cart > reached checkout > purchase from GA4 (and from Shopify
  ShopifyQL `sessions` / `added_to_cart` / `reached_checkout` / `completed_checkout` when a store has the app). Research
  and cite published e-commerce benchmarks by device (Shopify, Littledata, Statista / IRP Commerce style; write the
  sources and dates into `docs/strategist-brain/knowledge/website-cro.md`), then flag a step more than 20% under its
  benchmark AND under the brand's own last 90 days. Cost = lost orders at the benchmark rate x AOV.
- **Landing pages:** GA4 landing pages with paid sessions over a floor and conversion well under the site's own rate
  (the Website table already colours these); top 5 by cost.
- **Email:** the existing Klaviyo flags that carry money (a core flow missing or off, revenue per recipient far under the
  average), cost from the flow's own history or the brand's flows share.

### 2. Where it shows ("at the top of each thing")
- A "Leaks" card at the TOP of: Ads > Google (google_*), Ads > Meta (meta), Ads > TikTok (tiktok), Store > Website
  (funnel, landing_page), Email (email). Each shows that page's top 3 leaks, ranked by cost, with Apply where Locus can
  act and a link to the full list. Nothing when there is no leak (no empty card).
- A full list on Home for one brand (a card under the Day check), every area ranked together.
- The morning card (docs/handoffs/morning-card.md), if it is live: one line when a NEW leak over a money floor appeared,
  tagged to its owner. Never a separate Slack post.
- The Strategist: a `leaks` view (strategist.js) and a line in THE CMO METHOD to read it before an audit question.

### 3. Benchmarks, honestly
Every benchmark on screen names its source and year ("Shopify 2025, desktop"). A brand with too little data (under a
stated session or click floor) shows "not enough data yet" instead of a verdict. Never say "industry" without the source.

## Tests and done
- New `test-leaks.mjs` (Google Ads, GA4, the model and Klaviyo mocked): ranking by cost, floors, negative keyword
  propose / apply / undo with validateOnly, PMax insight shape, benchmark gating, the client scope (a client sees its
  own brand's leaks and can Apply only what a client may change today: nothing on Google unless brandguard allows it).
- Check the cards on a stub harness in the browser pane (light, dark, 375px), then delete it.
- Live check on Lucky (GA4 + Google Ads both linked): list the leaks it finds and put them in the report to Cole.
- Update both CLAUDE.md files and add a memory. Report to Cole: what it found on Lucky, and what he must do (connect
  GA4 / Clarity / the Shopify app for the brands that do not have them, and approve the first negative keywords).

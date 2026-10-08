# SEO and organic search for a small DTC Shopify brand (October 2026)

Scope: reading Search Console, brand search as the demand gauge, striking-distance queries (position 4 to 15), CTR and titles, Shopify SEO basics, content that sells for DTC, and how paid social lifts brand search.
Read with: `google-ads.md` (brand Search, PMax, Shopping), the Meta doctrine, TW last platform click as the default lens.

What the Strategist can see: Search Console queries, pages, clicks, impressions, position, brand vs non-brand; GA4 sessions, engagement, channels, landing pages, devices; TW orders with first click and journeys.
What it cannot see: crawl and indexing reports, Core Web Vitals report, structured data errors, backlinks. When a call depends on one of these, say "check X in Search Console first".

## 1. How it works now

### Search Console mechanics that matter
- Four numbers: clicks, impressions, CTR, average position. Position is impression-weighted average of the TOPMOST position the site held for that query. A page ranking 3 for one query and 40 for another averages ~21 at page level. Always read position at query level, or query x page.
- Impression counted when the result is on the page the user loaded, not when scrolled into view. Positions 8 to 15 rack up impressions with near-zero clicks.
- Data lag: about 2 days for final data. A 24-hour view (hourly, added Dec 2024) exists for recent data. History: 16 months.
- Anonymized queries: rare queries are hidden for privacy. On small DTC sites 30 to 60% of clicks sit in queries the report never lists. Query-level totals will not sum to site totals. Never call a drop from query rows alone; use the site total.
- **AI Mode counts in totals since June 2025**: clicks, impressions and position from AI Mode roll into Web search with no separate filter. AI Overview citations also count as impressions (position of the overview block). Expect more impressions with lower CTR on informational queries.
- **Branded queries filter (Nov 20 2025)**: Performance report splits Branded vs Non-branded using an AI classifier (brand name, close variants, and brand products). Only on eligible domain-level properties with enough volume; it misses some branded variants. Our Locus brand vs non-brand split may use its own regex; when they disagree, trust the regex for trends and spot check misses (misspellings, product names like "Party Patch", "Dartee belt").
- A generative AI / AI surfaces view was reported in mid-2026 with impressions only (not verified against Google docs). Do not add it to Web totals; it overlaps.
- Merchant listings and product snippets appear as Search appearances. Free Shopping listings via Merchant Center show here too, not in Google Ads.

### What changed in organic search 2024 to 2026
- **AI Overviews cut clicks on informational queries.** Seer (Nov 2025, 3,119 queries, 42 orgs): organic CTR on informational queries with AI Overviews fell 61% (1.76% to 0.61%) from mid-2024 to Sep 2025; queries without AI Overviews also fell 41% YoY. Ahrefs: position-1 CTR down 34.5% (Apr 2025) and 58% (Dec 2025 data) where an AI Overview shows. Being cited in the overview correlated with +35% organic clicks (Seer, not causal).
- Commercial and transactional queries ("buy", product names, "best X for Y" with Shopping units) keep more of their clicks, but Shopping units and free listings sit above the blue links. For DTC, the Merchant Center feed is part of SEO.
- **Google rewrites most titles**: one Q1 2025 study found 76% of title tags changed (up from 61% in 2023). Most common edit: removing the brand name (63% of rewrites). Titles left alone averaged ~44 characters vs ~63 for rewritten ones.
- Core Web Vitals use INP (not FID) since March 2024. Speed is a tiebreaker, not a growth lever, for small stores.
- Brand and product-name demand is the most defensible organic traffic: AI answers still link the brand's own site for brand queries.

### Expected CTR by position (use as a yardstick, not a target)
Blended 2025 to 2026 ranges, desktop and mobile mixed, no AI Overview present: pos 1: 22 to 35%, pos 2: 12 to 18%, pos 3: 8 to 11%, pos 4 to 5: 5 to 7%, pos 6 to 10: 1.5 to 4%, pos 11 to 15: under 1%. With an AI Overview present, pos 1 can fall to 3 to 10%. Brand queries at position 1: 40 to 70%. Pets showed the lowest pos-1 desktop CTR of any industry in AWR Q1 2025 data (~16%), so expect our pet brand at the low end.

## 2. Decision rules

### Minimum data
- Window: last 28 days vs prior 28 days (same weekday mix), and vs same 28 days last year for seasonal brands (golf, BFCM, gifting jewelry). Never compare 7 days for organic unless diagnosing a sudden break.
- A query needs at least 100 impressions in 28 days before you read its CTR. A page needs at least 500 impressions in 28 days before you call its CTR low.
- A drop is real when site clicks fall at least 15% for 2 consecutive 28-day reads, or 30%+ in 7 days (a break, see Diagnostics).
- After any SEO change: wait 4 weeks before judging (2 weeks minimum for titles on pages crawled often). Annotate the date in the Change Log.
- One batch of changes per page group at a time (e.g. titles on 10 collection pages), leave a similar group untouched as a control.

### Brand search as the demand gauge (most important use of GSC for us)
- **Brand impressions** (GSC Branded filter or Locus brand regex) are the cleanest free read of whether people want the brand. Clicks are polluted by brand ads taking the click; impressions are not.
- Weekly read: brand impressions vs 4-week average. Rising 10%+ while Meta spend flat = creative or word of mouth is working. Falling 10%+ with Meta spend flat = creative fatigue or seasonality; check Meta hook rate and frequency.
- Meta scale check: after Meta spend rises 25%+ for 2 weeks, brand impressions should rise. If they stay flat after 3 weeks, Meta is mostly harvesting existing demand (retargeting-heavy delivery, or ads that do not show the brand name). Flag to the Meta read.
- Total brand clicks = GSC brand organic clicks + Google Ads brand Search clicks. Read the sum. A paid brand click gained is often an organic click lost.
- Product-name and unbranded-signature queries ("magnetic golf belt", "hangover patch", "hockey stick tape grip") are the second gauge: they show category demand the brand is shaping.
- Use Google Trends for brand-term seasonality across years when GSC history is short.

### Striking-distance queries (position 4 to 15)
These are the cheapest organic wins: Google already thinks the page is relevant.
- Filter: last 28 days, position 4.0 to 15.0, impressions at least 100 (small brands: 50), commercial or product intent (skip pure how-to unless it maps to a product).
- Rank them by opportunity: impressions x (expected CTR at position 3 minus current CTR). A query at pos 8 with 2,000 impressions is worth more than one at pos 5 with 150.
- Map each query to ONE page. If two pages split impressions for the same query (cannibalization), pick the stronger, merge or redirect the weaker, point internal links at the winner.
- Fix order for each: (1) put the exact query in the title near the front and in the H1, (2) add a section that answers the query on the page (spec, comparison, FAQ, 100 to 300 words), (3) add 3 to 5 internal links from strong pages (homepage modules, nav, related collections, popular blog posts) with descriptive anchor text, (4) request indexing.
- Expected payoff: moving from position 8 to 3 multiplies clicks by roughly 3 to 5x on that query. Moving 12 to 8 rarely changes clicks; prioritise the 4 to 10 band first.
- Cadence: 10 queries a month per brand, review in 4 weeks, keep what moved.

### CTR and titles
- CTR problem test: actual CTR under 50% of the expected range for its position with 100+ impressions, AND no AI Overview or Shopping unit explains it. Then rewrite the title and meta description.
- Title rules: 45 to 60 characters, primary query in the first 3 to 5 words, one concrete hook (price point, key spec, outcome, "free shipping", review count), brand at the end or dropped on product pages (Google strips it 63% of the time anyway). Use a hyphen or pipe, never stuffing.
- Product page pattern: [Product name] [type] [key attribute] - [hook] | Brand. Collection pattern: [Category plural] [for whom or use] - [hook] | Brand.
- Meta descriptions do not rank but can lift CTR when Google uses them; 120 to 155 characters, answer the query, end with the offer or proof.
- Do not touch titles on pages ranking 1 to 3 with CTR at or above expected.
- Rewrite in batches of 5 to 10 pages; compare clicks and CTR vs a held-out group after 4 weeks; revert any page that lost 20%+ clicks.

### Shopify SEO basics (fix once, check quarterly)
- **Duplicate product URLs**: Shopify serves a product at /products/handle and /collections/x/products/handle. The canonical points to /products/handle, but themes often link the collection path. Make theme product cards link to /products/handle (remove `within: collection` in the product card snippet) so internal links match the canonical.
- **Tag and filter pages** (/collections/x/tag, ?filter.) create thin duplicates; keep them canonical to the collection or noindex them.
- **Sitemap**: /sitemap.xml is automatic; submit it once in Search Console.
- **robots.txt.liquid** is editable; only change it to block internal search and filter spam.
- **Structured data**: Product with offers (price, availability), aggregateRating from the reviews app, shippingDetails and hasMerchantReturnPolicy (or organization-level return policy) so merchant listing features qualify. Many themes ship partial schema; check with the Rich Results Test.
- **Collections are the money pages**: one H1, 100 to 250 words of useful copy (who it is for, how to choose) above or below the grid, FAQ block, links to related collections. Collections usually rank for category terms better than product pages.
- **Product pages**: unique description (not the manufacturer's), specs in text not only images, FAQ from customer service questions, reviews rendered in HTML, image alt text describing the product.
- **Out of stock**: keep the page live (it holds rankings), show back-in-stock signup and alternatives. Discontinued for good: 301 to the closest product or collection. Shopify creates redirects automatically when a handle changes only if the box is checked.
- **Speed**: every app adds script weight. Remove unused apps; compress hero images; lazy-load below the fold. Only prioritise speed if mobile pages fail Core Web Vitals (check in Search Console).
- **Markets / international**: Shopify Markets adds hreflang; check it before blaming a country drop on content.
- **Migrations and theme changes**: biggest organic risk for a Shopify store. Before launch: export all URLs, map redirects, keep titles; watch GSC daily for 2 weeks after.

### Content that converts for DTC
Priority order for a small brand (each one must map to a product or collection and carry a product module):
1. **Collection and product pages for category terms** (the money pages above).
2. **Comparison pages**: "[Brand] vs [competitor]", "[product type A] vs [B]" (e.g. magnetic belt vs ball marker clip, 56 vs 60 degree wedge). High intent, low AI Overview risk because they need specifics.
3. **"Best X for Y" buyer guides** where the brand genuinely fits (best wedge for chipping, best gift for a golfer under $50, best patch for festivals). Include a comparison table and the brand product at the top.
4. **Problem pages**: the job the product does ("how to stop chunking chips", "how to get rid of a hangover fast"), with a direct answer first and the product as one of the solutions. Expect few last-click sales; judge by email captures and first click.
5. **Gift guides and seasonal pages**: publish 6 to 8 weeks before the season (golf gifts for Father's Day by mid-April, holiday gifts by early October), refresh the same URL every year to keep its history.
6. **Sizing, fit, care and spec pages**: cut returns and catch "[brand] size chart" type queries.

Content rules:
- Use customer words: pull phrasing from reviews, support tickets, Asana test library angles, and winning Meta hooks. A winning Meta angle is a tested search topic.
- Lead with the answer in the first 2 sentences, facts in lists and tables (this is also what gets cited in AI Overviews).
- Each article links to 1 to 3 products or collections near the top, not only at the end.
- Judge content by: organic sessions to the page, email signups from the page, TW first-click and linear-all revenue where the first touch was organic to that page. Last-click revenue undercounts content 3 to 10x.
- Stop writing informational posts nobody searches. Every new page needs a target query with impressions visible in GSC (even at position 30+) or proven search volume.
- Publishing pace for our brands: 2 to 4 strong pages a month beats 20 thin ones. Update before you create: refresh pages losing clicks first.

### Being cited by AI Overviews and AI Mode
- AI answers pull from pages that state facts plainly. Put specs, sizes, materials, ingredients, price, shipping and return terms in HTML text and tables, not only in images or tabs that load on click.
- Each money page gets a 4 to 8 question FAQ written from real customer questions (support tickets, reviews, Meta comments), answered in 1 to 3 sentences each.
- Keep brand facts consistent everywhere (site, Merchant Center, Amazon listing, press): the same product names, specs and claims. Conflicting facts get the brand skipped.
- Reviews on-site in HTML, with aggregateRating schema. Third-party mentions (Reddit threads, golf forums, gift guides, YouTube reviews) are what AI answers quote for "best X" queries; creator and PR work now feeds search directly.
- Do not chase AI citation with thin "what is X" posts. It does not convert and AI already answers it.

### Free listings and the organic Shopping tab
- Merchant Center free listings put products in the Shopping tab, Google Images and some organic Shopping units at zero cost. They need the same feed as Shopping ads, plus shipping and return settings.
- They appear in GSC as merchant listing appearances and in GA4 as organic Shopping (google / organic with a shopping referrer). Report them under organic, not paid.
- Feed title fixes (see `google-ads.md`) lift free listings too. For a brand with no Google Ads at all, free listings are the first Google task, before any content.

### Monthly SEO routine (per brand)
1. Site clicks and impressions, brand vs non-brand, last 28 days vs prior and vs last year.
2. Brand impressions trend next to Meta spend and Klaviyo send calendar (the demand gauge).
3. Top 10 striking-distance queries (position 4 to 15) with page mapping; pick the 3 to 5 worth work.
4. Pages that lost 20%+ clicks vs prior 28 days: diagnose with the table below.
5. CTR outliers: pages at position 1 to 5 with CTR under half of expected.
6. Ask a person for: indexing report (pages not indexed, new errors), Core Web Vitals status, manual actions.
7. Output: at most 3 SEO suggestions a month per brand. SEO moves slowly; fewer, finished changes beat many half-done ones.

### Seasonal content calendar (publish or refresh by)
- Golf: spring season guides and new gear by early March; Father's Day gift pages by mid-April; holiday golf gifts by early October; winter practice and indoor content by November.
- Jewelry: Valentine's by early December of the prior year; Mother's Day by mid-March; holiday gift guides by early October.
- Party and wellness patches: festival season by April; holiday party season by mid-October; New Year by early December.
- Hockey: back-to-hockey sizing and gear guides by early August; holiday gifts by early October.
- Pet: holiday gifts by early October; seasonal care (summer heat, winter) one month before the season.
- Always reuse the same URL each year (e.g. /blogs/guides/golf-gifts), update the year in title and content; the URL keeps its history and links.

### Reading organic in GA4 and Triple Whale
- GA4 channel "Organic Search" includes brand and non-brand together. Split by landing page: homepage landings are mostly brand; collection, product and blog landings are mostly non-brand.
- Organic Shopping (free listings) is its own GA4 channel; do not fold it into paid Shopping.
- Engagement rate under 45% on an organic landing page with 200+ sessions a month: the page does not match the query intent. Check which queries land there in GSC (query x page).
- Organic conversion rate benchmarks for DTC: brand landings 3 to 6%, collection and product landings 1 to 3%, blog landings 0.1 to 0.5% last click. Content earns its keep through email signups and first touches.
- TW: read organic with first click and linear all. Organic first-click orders rising = SEO creating customers. Organic last-click rising with Meta first click = Meta-created demand landing on organic.
- GA4 and TW will disagree on organic revenue (consent, ad blockers, attribution model). Use one source per trend, never mix them in one chart.

### Expected timelines (to set expectations in suggestions)
- Title and meta changes: CTR effect visible in 2 to 4 weeks.
- New collection copy and internal links: ranking moves in 4 to 8 weeks.
- New content page: first impressions in 1 to 3 weeks, settled ranking in 2 to 4 months.
- Technical fixes (canonicals, duplicate URLs): 4 to 12 weeks as Google recrawls.
- Recovering from a core update hit: usually not before the next core update (months).
- Any suggestion that promises organic revenue inside 30 days should be "medium" or "low" on HOW SURE.

### When SEO is NOT the priority
- Brand under ~$30k a month revenue with weak product-market fit signals (low repeat, high CAC): fix offer, creative and the site first; SEO compounds only what already sells.
- Brand demand falling: fix Meta and creators; no on-page work recovers brand demand.
- A single hero product with no category search (new invention): SEO limited to brand, product name and problem queries; spend effort on Merchant Center and reviews instead.

## 3. Diagnostics

| Symptom | Likely causes, in order | Number that confirms it | Fix |
|---|---|---|---|
| Organic clicks down 15%+ over 28 days | 1. Brand demand fell (Meta cut, creative fatigue, season). 2. SERP change (AI Overview, Shopping unit) on key queries. 3. Google core update. 4. Technical break (noindex, robots, redirects, theme change) | 1. Brand impressions down with non-brand stable; Meta spend down in TW. 2. Impressions stable, CTR down on the same queries. 3. Non-brand drop across many pages starting within a known update window. 4. One page group lost impressions to near zero on one date | 1. Fix demand on Meta, do not touch SEO. 2. Retarget queries with commercial intent, add FAQ/spec content for citation. 3. Improve the affected pages' depth; wait for next update. 4. Revert, fix, request indexing |
| Brand organic clicks down, brand impressions flat | Brand Search ads taking the click, or a new competitor/Amazon result above us | Google Ads brand clicks up by a similar amount | Read total brand clicks; nothing is lost |
| Brand impressions down 10%+ week over week | Meta spend down or creative fatigue; seasonality; PR or creator push ended | Meta spend, hook rate and frequency trend; same weeks last year | Meta creative refresh; report demand drop, not an SEO problem |
| Page impressions high, clicks near zero | Ranking 8 to 15 (page 1 bottom or page 2) | Position 8+ on top queries | Striking-distance work |
| CTR far under expected at position 1 to 3 | Weak or rewritten title; AI Overview; Shopping units; rich results on competitors (stars, price) | Query-level CTR vs expected; check the live SERP | Rewrite title and description, add product schema with ratings |
| Two pages swap rankings for one query | Cannibalization | Query x page view: both pages get impressions for the query | Merge, canonical or re-target one page |
| Collection pages not ranking | Thin content, product cards linking to collection paths, filter duplicates | Collection impressions low, product URLs with /collections/ in GSC pages report | Collection copy, fix theme links, canonicals |
| Organic revenue (GA4) down, clicks flat | Landing page or offer change, stock, site speed regression, tracking | GA4 organic landing page conversion rate; Shopify stock | Fix the page, not SEO |
| Non-brand impressions up, clicks flat | AI Mode and AI Overview impressions now counted; ranking on page 2 for new queries | Impression rise concentrated in informational queries or position 15+ | Nothing to fix; read clicks and commercial queries |
| Product pages lost rankings to Amazon or retailers | Thin or copied description; no reviews in HTML; missing schema | Our position fell while a retailer listing for our own product rose | Unique copy, specs, FAQ, reviews and Product schema on our page |
| Blog traffic up, revenue flat | Informational content pulling non-buyers | Blog landing sessions up, organic first-click orders flat (TW), low email signups | Add product modules and email capture; shift effort to commercial pages |
| Brand query shows a competitor or reseller above us organically | Reseller or review site outranks the brand for "[brand] review" or "[brand] [product]" | GSC position over 1.5 on brand + product queries | Dedicated pages for those queries (reviews page, product comparison); Brand Search ad as cover |
| Sudden traffic loss on a date | Migration, theme publish, app that injected noindex, domain or redirect change | Change Log entry or theme publish that day | Revert or fix; request indexing for key pages |

## 4. How organic search affects the other channels

- **Paid social creates brand search.** Meta Search Lift studies: Dentsu found about +10% search volume from Meta exposure across 64 studies (fashion and luxury), +19% when brand and performance campaigns ran together; Code3 found 28% of one brand's paid search revenue was incremental to Meta. Agency and vendor studies, directional only. Practical meaning: a big share of our organic brand traffic and Google brand Search revenue is Meta's work.
- **Lag**: brand impressions usually move 0 to 14 days after a Meta spend or creative change. Creator and influencer drops spike brand search within 1 to 3 days.
- **Email and SMS sends** cause next-day brand search spikes (people search instead of clicking). Check Klaviyo send dates before calling a brand spike a Meta effect.
- **Brand ads vs organic**: paid brand clicks mostly replace organic brand clicks on a naked SERP (Polar test: organic +6.6% where brand ads paused). See `google-ads.md` for the test.
- **Merchant Center feed serves both**: free listings (organic Shopping) and Shopping ads use the same titles and images. A title fix for SEO helps Shopping and vice versa.
- **Organic last click undercounts content and overcounts brand.** Organic brand visits are often people Meta or email already sold. TW journeys show this: look for Meta first click, organic last click.
- **Meta angles feed SEO; GSC queries feed Meta.** Rising non-brand queries ("golf belt that holds ball markers") are customer language for hooks. Hand them to the creative framework as angle candidates.

### Real growth vs credit shifting
Real organic growth: non-brand clicks and non-brand landing page sessions rise, new customers with organic first click rise in TW, while brand impressions are roughly steady. Credit shifting: organic "growth" that is all brand clicks, rising after a Meta push or while brand ads were paused. That is Meta or email demand landing on the organic result.

### Check before acting on an SEO read
1. Meta spend and creative changes, last 28 days (TW and Change Log).
2. Klaviyo sends and promos in the window.
3. Google Ads brand Search clicks (combined brand clicks).
4. Season: same window last year.
5. Any theme publish, app install, or URL change in the Change Log.

### Check after an SEO change (2, 4 and 8 weeks)
1. Clicks, impressions, position for the target queries and the page (GSC, query x page).
2. Control pages over the same window (did everything move, or only the changed pages).
3. GA4 sessions and engagement rate on the page; organic conversions and email signups.
4. Google Ads: did brand or non-brand paid clicks on the same queries fall (organic taking paid clicks is fine, but count it).
5. TW: organic first-click orders.

## 5. What a great suggestion looks like

**Example 1: striking distance on a collection**
- WHAT: Rewrite the title and H1 of /collections/golf-belts to "Magnetic Golf Belts - Hold Ball Markers & Tees | Dartee" and add a 150-word "how to choose" section plus 4 internal links from the homepage and blog.
- NUMBER: Query "magnetic golf belt" 2,340 impressions, position 7.4, CTR 1.1% last 28 days (GSC); the collection page splits impressions with a product page at position 11.
- WHY: Google already ranks us on page 1 for our own category; moving to the top 3 roughly triples clicks on our highest-intent non-brand query.
- WATCH: Position and clicks for that query and the page over 4 weeks; the product page should stop showing for it. Organic sessions to the collection in GA4.
- HOW SURE: Medium. Position gains take 2 to 6 weeks and are not guaranteed; the CTR gain if we reach top 3 is well established.

**Example 2: brand demand flag from GSC**
- WHAT: Tell the Meta read that brand demand is not responding to the scale-up; prioritise new concepts with the brand name in the first 3 seconds over more budget.
- NUMBER: Meta spend +38% over the last 21 days (TW) while GSC brand impressions are +2% vs the prior 21 days and new customers +6% (TW).
- WHY: Spend that creates demand shows up as people searching for us; flat brand search says the extra spend is mostly reaching people who already knew us.
- WATCH: Brand impressions and new customer count for 3 weeks after new concepts launch; Meta frequency and new vs returning on Meta orders.
- HOW SURE: Medium. Brand search is a proxy; email, season and creators also move it, so check Klaviyo sends first.

**Example 3: CTR fix on product pages**
- WHAT: Rewrite titles on the 8 product pages with CTR under half of expected; leave 8 similar pages as a control.
- NUMBER: These 8 pages hold average position 2.1 to 3.4 with CTR 3.8% vs 9 to 15% expected (GSC, 28 days, 4,100 impressions total); no AI Overview on their top queries.
- WHY: We already rank; the listing is not getting chosen, likely because Google rewrote the titles to the bare product name.
- WATCH: CTR test vs control after 4 weeks; revert any page that loses 20%+ clicks.
- HOW SURE: Medium-high on CTR, small absolute traffic gain (about 200 to 400 clicks a month).

## 6. Traps

- **Calling Meta's brand demand "SEO growth".** Brand clicks rising after a Meta push is Meta. Split brand and non-brand in every organic read.
- **Reading average position at page or site level.** It mixes hundreds of queries. Use query level.
- **Summing query rows.** Anonymized queries are hidden; query totals undercount site totals by 30 to 60% on small sites.
- **Judging titles in a week.** Recrawl and re-rank take 2 to 4 weeks.
- **Expecting blog posts to drive last-click sales.** Informational content works as first touch and email capture; AI Overviews took most of its clicks anyway. Build commercial pages first.
- **Panicking at impressions up, CTR down.** AI Mode and AI Overview impressions now count; more impressions with lower CTR can be pure reporting change. Read clicks.
- **Blaming a core update for a drop that started on a theme publish date.** Check the Change Log first.
- **Removing out-of-stock pages.** Rankings die with the URL; keep the page live or redirect.
- **Treating organic and paid brand clicks as separate wins.** They trade off one for one on a naked SERP.
- **Trusting the GSC Branded filter blindly.** It is AI-classified and misses product-name and misspelled brand queries.
- **Writing content for queries with no demand.** If GSC shows zero impressions for the topic anywhere and no tool shows volume, the page will get no traffic however good it is.
- **Comparing organic YoY across a Search Console change.** AI Mode inclusion (June 2025) and the branded filter (Nov 2025) changed what the numbers mean; note the break in any trend that crosses those dates.
- **Reading a position gain as a win before clicks follow.** Moving from 14 to 9 is still near-zero clicks; report clicks and orders, not rank.
- **Using a single week of brand impressions as a Meta verdict.** Use 2 to 3 weeks and rule out email sends, creator posts, and seasonality.

## 7. Sources

- Google Search Central, branded queries filter (Nov 2025): https://developers.google.com/search/blog/2025/11/search-console-branded-filter
- Search Engine Land, branded queries filter expands: https://searchengineland.com/google-search-console-branded-queries-filter-expands-471387
- PPC Land, AI Mode counts toward Search Console totals: https://ppc.land/google-ai-mode-now-counts-toward-search-console-totals/
- JC Chouinard, AI Mode click tracking in Search Console: https://www.jcchouinard.com/google-search-console-ai-mode-click-tracking/
- PPC Land, Search Console performance analysis guidance: https://ppc.land/google-updates-search-console-performance-analysis-guidance/
- Search Engine Land, Seer: AI Overviews cut organic CTR 61%, paid 68%: https://searchengineland.com/google-ai-overviews-drive-drop-organic-paid-ctr-464212
- Ahrefs, AI Overviews reduce clicks by 58% (update): https://ahrefs.com/blog/ai-overviews-reduce-clicks-update/
- Search Engine Land, Google changed 76% of title tags in Q1 2025: https://searchengineland.com/google-changed-76-of-title-tags-in-q1-2025-heres-what-that-means-454847
- Advanced Web Ranking, Google CTR Q1 2025: https://www.advancedwebranking.com/blog/ctr-google-2025-q1
- SEO Buddy, organic CTR by position 2026: https://seobuddy.com/blog/?p=10431
- FirstPier, Shopify SEO checklist 2026: https://www.firstpier.com/resources/setting-up-seo-on-shopify
- Ecosire, technical SEO for Shopify: https://ecosire.com/blog/shopify-seo-technical-guide
- Shopify Help, Google & YouTube channel (SEO title sync option): https://help.shopify.com/en/manual/online-sales-channels/google/getting-setup/connect
- Campaign (Dentsu Meta Search Lift, 64 studies): https://www.campaignlive.co.uk/article/searches-originate-somewhere-%E2%80%93-somewhere-often-meta/1900190
- Code3, The Sill search lift study: https://code3.com/results/the-sill-search-lift-study/
- Brainlabs, Meta incrementality and search lift: https://www.brainlabsdigital.com/paid-social-measurement-meta-incrementality-search-lift/
- iProspect, Meta search lift: https://www.iprospect.com/insights/meta-search-lift-to-drive-stronger-media-performance
- Polar Analytics, WillPowders brand search test (organic +6.6%): https://www.polaranalytics.com/case-studies/willpowders-brand-search-polar-incrementality-testing
- Not verified: the mid-2026 Search Console generative AI report and its impressions-only behavior; exact expected-CTR ranges (blended from several benchmark studies with different methods); the share of anonymized queries on our specific sites (check per brand).

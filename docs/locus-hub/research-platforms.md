# What best-in-class ecommerce dashboards actually show

Research for the Locus hub rebuild. Compiled 2026-10-07 from each vendor's official help center, product pages and changelogs. Every bullet carries its source URL in parentheses. Where an official page has since been removed, the archived copy is cited and marked as such. No numbers or features below are guessed; if a vendor's docs did not say it, it is not here.

How the sources were read: Triple Whale's knowledge base (kb.triplewhale.com) and Polar's help center (intercom.help/polar-app) were pulled as full text. Hyros's documentation site (docs.hyros.com) requires JavaScript and nests each guide inside accordions and modals, so it was read in a browser pane and every collapsed section was expanded before reading. Two Triple Whale pages (the Summary Dashboard Metrics Library and the Attribution Dashboard Metrics Library) return 404 today; their content was read from the Wayback Machine and is marked "archived".

---

## 1. Triple Whale

### 1.0 How the product is laid out (the frame everything else sits in)

- Left sidebar, top down: business selector, Moby, then workspaces. The business selector switches between businesses and, on Advanced or Professional plans, multi-selects to blend several businesses into unified metrics and charts (https://kb.triplewhale.com/en/articles/12117524-a-guide-to-triple-whale-s-navigation)
- Core workspaces are grouped by job: Summary (top-level view of the whole business), Marketing Acquisition (paid channels, attribution, measurement), Creative Analysis, Website Conversion, Customer Retention, Discovery (how customers and AI find the brand) (https://kb.triplewhale.com/en/articles/12117524-a-guide-to-triple-whale-s-navigation)
- Marketing Acquisition contains: Attribution, Source/Medium, Post-Purchase Survey, Sonar Optimize (ad enrichment), Compass (beta), Marketing mix modeling, Incrementality (https://kb.triplewhale.com/en/articles/12117524-a-guide-to-triple-whale-s-navigation)
- Website Conversion contains: Overall Website Performance, Website Funnel And Paths, Site Search, Bundle Analysis, Product Journey, Product Analysis (https://kb.triplewhale.com/en/articles/12117524-a-guide-to-triple-whale-s-navigation)
- Customer Retention contains: Customer Segments, Cohort Analysis, Sonar Send (flow enrichment), Email & SMS Attribution (beta) (https://kb.triplewhale.com/en/articles/12117524-a-guide-to-triple-whale-s-navigation)
- Discovery contains: AI Visibility, Social Monitoring, Keyword Intelligence (https://kb.triplewhale.com/en/articles/12117524-a-guide-to-triple-whale-s-navigation)
- Core workspaces cannot be deleted but can be hidden per user ("Customize Navigation"); Favorites section appears once something is starred; Search jumps to any workspace, dashboard or tool (https://kb.triplewhale.com/en/articles/12117524-a-guide-to-triple-whale-s-navigation)
- Custom Workspaces hold user-built Workspaces, Agents, Dashboards and Mini Apps, each startable from a template library or from scratch; a Mini App is described in the Ask Anything bar and Moby builds it (https://kb.triplewhale.com/en/articles/12117524-a-guide-to-triple-whale-s-navigation)
- Lower nav: Data (Integrations, Data Warehouse, APIs, Data Upload, Sonar Enrichment, Data Dictionary, SQL Builder), Help, Settings. Settings groups include Business Logic, Clicks & Deterministic Views Attribution, Cost Settings, Pixel Settings, Tracking Settings, Traffic Rules, Custom Categories, Global Filters, and AI Settings (Brand Vault, Memories, Tasks, Moby) (https://kb.triplewhale.com/en/articles/12117524-a-guide-to-triple-whale-s-navigation)

### 1.1 Summary page

Purpose and structure

- "The Summary dashboard consolidates key metrics from all your integrated channels, providing a single source of truth with real-time insights." (https://kb.triplewhale.com/en/articles/5725275-track-kpis-with-the-summary-dashboard)
- Pinned section at the top: any metric tile can be pinned by hovering and clicking the pin icon, so the most important KPIs show "the moment you arrive" (https://kb.triplewhale.com/en/articles/5725275-track-kpis-with-the-summary-dashboard)
- Default sections, one per data integration: Business Metrics, Meta, Google, Klaviyo "and so on", plus Web Analytics (data tracked by the Triple Whale Pixel) and Custom Expenses (COGS imported from Shopify and expenses entered manually in Cost Settings) (https://kb.triplewhale.com/en/articles/5725275-track-kpis-with-the-summary-dashboard)
- Sections are customizable: drag and drop tiles, hide or display specific metrics, pivot a section to a table view, move whole sections and resize tiles via Edit Dashboard (https://kb.triplewhale.com/en/articles/5725275-track-kpis-with-the-summary-dashboard)

Periods and comparisons

- "All metrics on the Summary dashboard are based on the timeframe selected." Hovering a tile's trend graph shows how the value changed over time; clicking a metric opens a bar graph view with "comparison data with the previous time period" (https://kb.triplewhale.com/en/articles/5725275-track-kpis-with-the-summary-dashboard)
- The Summary collection describes the page as covering "pinned KPIs, custom dashboards, filters, and performance comparisons" (https://kb.triplewhale.com/en/collections/19645565-summary)
- Inventory Items is a snapshot metric that does not change with the date range (https://kb.triplewhale.com/en/articles/5725275-track-kpis-with-the-summary-dashboard)

Custom metrics and filters

- No-code metric builder: Edit Dashboard > Create Custom Metric blends metrics into formulas saved to the dashboard (https://kb.triplewhale.com/en/articles/5725275-track-kpis-with-the-summary-dashboard)
- Shopify data filter on the Business section: field is Source Name or Order Tag Name; operators Contains, Does Not Contain, Equals, Does Not Equal; multiple criteria inside one filter are AND; multiple filters applied to a section are OR; filters are visible to all users on the account; a nav indicator shows filters are applied; custom metrics built on Shopify data (including Net Profit) are filtered too (https://kb.triplewhale.com/en/articles/9713302-filter-data-on-the-summary-dashboard)
- Ad integration filter on each ad section: fields Campaign Name, Campaign ID, Ad Set Name, Ad Set ID, Ad Name, Ad ID with the same operators (https://kb.triplewhale.com/en/articles/9713302-filter-data-on-the-summary-dashboard)
- Country filtering on the Summary page exists as its own article (https://kb.triplewhale.com/en/collections/19645565-summary)

Metric inventory on the Summary page (archived copy of the Summary Dashboard Metrics Library; the live URL returns 404 as of 2026-10-07)

Custom Metrics section (blended):
- Net Profit = Total Sales minus Blended Ad Spend minus Total Costs (COGS, Shipping, Handling, Payment Gateways, Taxes, Custom Spends) (archived: https://web.archive.org/web/2025id_/https://kb.triplewhale.com/en/articles/6127778-summary-dashboard-metrics-library)
- Blended ROAS = Order Revenue / Blended Ad Spend (archived, same URL)
- MER = (Ad Spend + Custom Ad Spend) / Order Revenue (archived, same URL)
- Net Margin = Net Profit / Sales x 100 (archived, same URL)
- RPS (Revenue per Session) = Sales / Web Sessions (archived, same URL)
- Returns Rate % = Refunds / Order Revenue (archived, same URL)
- Blended Ad Spend = Ad Spend + Custom Ad Spend (archived, same URL)
- NCPA = (Ad Spend + Custom Ad Spend) / New Customer Orders (archived, same URL)
- Cash Turnover = Order Revenue minus Shipping minus Payment Gateway Costs minus Taxes minus Blended Ad Spend minus Returns (archived, same URL)
- New Customer ROAS = New Customer Order Revenue / (Ad Spend + Custom Ad Spend) (archived, same URL)
- BA ROAS (Blended-Attributed ROAS) = Channel-Reported Conversion Value / Ad Spend (archived, same URL)

Store Metrics section:
- Order Revenue (total across all sales channels), Total Sales (Order Revenue minus refunds net of refunded tax), Orders, Gross Sales, Returns (applied on refund date, not sale date), Taxes, True AOV ((positive order revenue minus shipping minus taxes) / orders), AOV, CPA (Ad Spend / Customer Orders), New Customers %, Returning Customers %, Units Sold, New Customer Revenue, Returning Customer Revenue (archived, same URL)

LTV section:
- Unique Customers, LTV = Order Revenue / Unique Customers, Frequency (average purchases per unique customer), LTV/CPA (archived, same URL)

Expenses section:
- Payment Gateways, COGS, Handling Fees, Shipping, Custom Expenses, all configurable in Settings > Cost Settings (archived, same URL)

Benchmarks dashboard (lives in the Summary collection)

- Peer comparison built from "over 20,000 Triple Whale customers", with per-platform views for Google, Meta, TikTok and a Blended view (https://kb.triplewhale.com/en/articles/6476726-benchmarks-dashboard)
- Cohort filters: Industry (long list), AOV segment (above or below 100 USD over last 90 days), GMV bracket (under 1M, 1M to 10M, over 10M over last 365 days) (https://kb.triplewhale.com/en/articles/6476726-benchmarks-dashboard)
- Channel metrics available: CPA, CPC, CPM, CVR, CTR, MER, ROAS, AOV (https://kb.triplewhale.com/en/articles/6476726-benchmarks-dashboard)
- The newer in-app benchmark strip shows six metrics, each with your value, the peer median and a rank badge (Top 25%, Average, Bottom 25%): Blended ROAS, Blended CPA, CPM, average CTR, New Customer %, AOV (https://kb.triplewhale.com/en/articles/15606385-benchmark-metrics)

Portfolio Performance dashboard (multi-business template, Advanced plan)

- Top row "Business Performance Summary" tiles: Net Profit, Gross Revenue, NC CPA, NC ROAS, Orders, Net Margin, AOV, Return Rate, each with a sparkline under it showing direction over the selected date range (https://kb.triplewhale.com/en/articles/13363367-portfolio-performance-dashboard-guide)
- "Key Business Metrics per Business" table columns: Ad Spend, Net Profit, Net Margin, Order Revenue, ROAS, Net Sales, Discounts, Total Sales, NC Revenue, NC ROAS (same URL)
- "Total Sales & MER" chart: daily Total Sales bars with a MER trend line on top (same URL)
- "Customer LTV vs CAC per Business" scatter: X axis CAC, Y axis LTV, one dot per business, read by quadrant and against the diagonal (same URL)
- "Platform & Business Performance" table: Gross Sales, Orders, Sale Taxes, Total Sales, Discounts, Refunds, Order Revenue, Gross Revenue, AOV, NC Revenue, NC Orders, NC AOV, Unique Customers, Lifetime Value (same URL)
- "Product Performance by Platform & Business": Units Sold, Gross Sales, Returned Units, Return Rate, COGS (same URL)
- "Shipping by Platform & Business": Shipping Costs, Shipping Revenue, Net Shipping Margin (same URL)
- Tips section says to "Toggle 'Previous period' to see period-over-period changes" and to use platform and business filters to drill in (same URL)

### 1.2 Pixel and attribution pages (Ads > All Channels and per-channel drilldowns)

Table and drilldown structure

- The attribution table drills campaign > ad set > ad: "Click on the campaign name to see your ad sets and ads." (https://kb.triplewhale.com/en/articles/5960325-how-the-triple-pixel-works)
- Pixel ROAS is shown as a highlighted column beside the platform's own numbers: "The highlighted-blue column displays your Triple Pixel ROAS" (same URL)
- Clicking a Pixel ROAS value "for any given campaign, ad set or ad will pull up the list of orders and customers we were able to track back to that particular ad"; clicking a customer name opens that customer's journey across channels "culminating in their purchase and any post-purchase survey reply" (same URL)
- Every column with the whale-tail icon is first-party Pixel data; the Columns button adds, removes and rearranges columns; Pixel tracks "Orders, Conversion Value, CPA, AOV, New Customer Data, Add to Carts, and so much more" (same URL)
- Channel Overlap view: "a visual display of the number of customers who had multiple touch-points in their journey", with channel toggles at the bottom (same URL)
- Live Orders feed: updates on every new order and shows the attributed channel in real time (same URL)
- Portfolio Attribution view (multi-business selector): aggregated "All" and channel drilldown views, combined live order feed, combined order overlap, Pixel purchases popup, ROAS popup, subscription filters, CSV export; Total Impact is not supported in the aggregated view (https://kb.triplewhale.com/en/articles/10290427-portfolio-attribution)

Column presets (the "Columns" button)

- Preset templates: Default (full-funnel recommended view), All Page (Pixel Only), Paid Performance (reach, cost per result, Pixel plus channel-reported), Paid Performance (Pixel Only), Bidding & Optimization (bid strategy and delivery cost), Traffic (site visitors, add-to-carts, email signups, bounce rate), New Customers (new customer revenue, ROAS, conversion rate), Purchases (new and returning customer purchases), Custom Metrics (only your own) (https://kb.triplewhale.com/en/articles/8143690-customizing-your-attribution-dashboard)
- Custom presets: Customize Columns, add, remove, rearrange, "Save as new preset" with name and description; custom presets are shared with teammates instantly (same URL)

Metric inventory on the attribution table (archived copy of the Attribution Dashboard Metrics Library; live URL returns 404 as of 2026-10-07)

Platform-reported metrics (from Meta, Google and the others):
- Ad Spend, CV (conversion value), ROAS, Purchases, Clicks, Impressions, CPC, CTR (all clicks), CPM, CPA, AOV, All CV and All Purchases (Google only), Outbound Clicks (Meta only), 1 Day View CV (Meta only), Thumb Stop View 3s (Meta and Google), Thumb Stop View 6s (TikTok), Total Video View, Thumb Stop Ratio (archived: https://web.archive.org/web/2025id_/https://kb.triplewhale.com/en/articles/6855429-attribution-dashboard-metrics-library)

Pixel metrics (first party):
- Pixel ROAS = Pixel CV / Spend; Pixel NC ROAS = Pixel NC CV / Spend; Pixel Purchases; Pixel New Customer Purchases (NCP); Pixel CV; Pixel New Customer CV (NCV) (archived, same URL)
- Pixel Sessions; Pixel Unique Visitors; Pixel Cost Per Visitor = Spend / unique visitors; Pixel New Visitors; Pixel Cost Per New Visitor (archived, same URL)
- Pixel Unique Add To Carts; Pixel Cost Per Add to Cart (archived, same URL)
- Pixel CPA = Spend / Pixel Purchases; Pixel New Customer CPA = Spend / Pixel NC Purchases (archived, same URL)
- Pixel AOV = Pixel CV / Pixel Purchases; Pixel NC AOV (archived, same URL)
- Pixel Conversion Rate = Pixel Purchases / Pixel Unique Visitors; Pixel NC Conversion Rate = NC Purchases / New Visitors (archived, same URL)
- Pixel Email Sign Up; Pixel Cost Per Email Sign Up; Pixel Email Sign Up Rate (archived, same URL)
- Pixel COGS; Pixel NC COGS; Pixel Profit = Pixel CV minus COGS minus Ad Spend (archived, same URL)
- Pixel Conversion Value Delta (CVD) = Pixel CV minus Channel CV, i.e. the gap between first-party and platform-reported revenue as its own column (archived, same URL)
- Note in that library: "Triple Attribution + Meta Views" adds Facebook-reported view-through purchases and value into the Pixel purchase and CV metrics and their New Customer versions; Meta Shop purchases are added to Pixel metrics but not to the New Customer versions (archived, same URL)

Attribution models (the model dropdown)

- Seven models across single-touch and multi-touch: First Click, Last Click, Clicks & Deterministic Views, Linear (All and Paid), Triple Attribution, Triple Attribution + Platform Views, Total Impact (https://kb.triplewhale.com/en/articles/5960333-understanding-and-utilizing-attribution-models)
- Attribution windows: 1 Day, 7 Days, 14 Days, 28 Days, Lifetime; default 28 days (same URL)
- Triple Attribution gives each platform 100% last-click-per-platform credit, so totals exceed real revenue; the docs explicitly say not to use it on All Channels for revenue totals and not for financial reporting (same URL)
- Clicks & Deterministic Views: fractional credit to clicks and verified impressions, normalized so attributed revenue reconciles to business revenue; views refresh daily, clicks in real time (same URL)
- Total Impact: distributes 100% of business revenue using click data plus post-purchase survey responses; needs a PPS (Triple Whale's own, Fairing or Kno) and at least 7 days of responses; review on a 7-day window; cannot click through to individual orders because revenue is split (same URL and https://kb.triplewhale.com/en/articles/7128379-the-total-impact-attribution-model)
- Linear All versus Linear Paid, First Click, Last Click defined with examples; a table of how "Direct" behaves per model (same URL)
- Recommended filters per model, including "Filter to New Customers only" under First Click, "Use the 'Paid' channels filter" under Linear Paid, and "Pair with the individual platform filter (Meta only, Google only)" under Triple Attribution for benchmarking against native reporting (same URL)
- A comparison table in the docs contrasts Clicks & Deterministic Views (revenue reconciles, deduplicated) against Triple Attribution + Platform Views (100% per platform, exceeds Shopify totals "by design") (same URL)

Date basis (click date versus order date)

- Attribution can be dated by Click Date ("revenue is attributed to the date the recipient clicked") or Purchase Date ("revenue is attributed to the date the order was placed"); Click Date is the default and "matches how most attribution tools report"; Purchase Date is for matching Shopify or ESP reports for a given day (https://kb.triplewhale.com/en/articles/14647401-email-sms-attribution-table)

New versus returning, first order versus LTV

- New customer versions of purchases, conversion value, ROAS, CPA, AOV, conversion rate, COGS exist as separate Pixel columns (archived Attribution Dashboard Metrics Library, URL above)
- "New Customers" and "Purchases" column presets split new and returning purchases (https://kb.triplewhale.com/en/articles/8143690-customizing-your-attribution-dashboard)
- Lifetime value is handled on the Cohorts page, not the attribution table (see 1.4)

Journeys

- Customer journey opens from an order inside the attribution table (campaign > orders list > customer > journey with PPS reply) (https://kb.triplewhale.com/en/articles/5960325-how-the-triple-pixel-works)
- Pixel appends every ad click as a touchpoint, "you'll see that entire journey mapped out" (same URL)

Email and SMS attribution table (Customer Retention > Email & SMS Analytics, beta)

- Combines ESP engagement data with Pixel revenue attribution, "broken down by campaign, flow, and channel"; revenue comes from Triple Whale's engine, not the ESP (https://kb.triplewhale.com/en/articles/14647401-email-sms-attribution-table)
- Integration dropdown switches ESPs: Klaviyo (full metrics, Email, SMS, Push, Overview, Campaigns and Flows tabs), Omnisend (attribution only), Attentive (UTM-based, attribution only), Postscript, Sendlane etc. (UTM-based) (same URL)
- Tabs: Overview (KPI summary cards, channel comparison table, email funnel for Klaviyo, top campaigns and flows); Campaigns (per-campaign table, expandable UTM/variant sub-rows, email preview, period-over-period deltas); Flows (Klaviyo only; "Flows Powered by Sonar" table plus regular flows table with per-email breakdowns) (same URL)
- Attribution model dropdown on this page: First Click, Last Click, Linear, Triple Attribution (default); "All revenue, purchases, conversion rate, and Rev/Recipient values recalculate instantly"; ESP engagement metrics do not change (same URL)
- Campaign columns (Klaviyo): Campaign, Channel, Subject Line, Preview, Revenue, Recipients, Rev/Recipient, Open Rate, Click Rate, Conv. Rate, Unsub, % of total revenue (same URL)
- Flows columns: Flow, Channel, Status, Revenue, % of Flow Rev, Recipients, Rev/Recipient, Open Rate, Click Rate, Purchases, Unsub; Sonar flows add TW Trigger Event (same URL)
- Overview columns: Type, Sent, Recipients, Opened, Click Rate, Purchases, Conv. Rate, Revenue, % of Total Rev, Rev/Recipient (same URL)
- Engagement metric definitions from Klaviyo: Sent (total), Delivered = Sent minus Bounced (funnel only), Delivery Rate, Recipients (unique), Opened (total, includes Apple MPP machine opens), Open Rate = Unique Opens / Sent, Click Rate = Total Clicks / Unique Opens, Unsub Rate = Unique Unsubs / Sent, Spam Rate = Unique Spam / Sent (best practice below 0.1%) (same URL)
- Attribution metric definitions from Triple Whale: Revenue (with previous period value and % delta), % of Total Revenue, Purchases, % of Total Purchases, Avg Order Value, Rev/Recipient = Revenue / Unique Recipients, Conversion Rate = Unique Purchasers / Unique Recipients, Pixel New Customer Purchases, Pixel Repeat Purchases, % of Flow Rev (same URL)
- Controls: search box, filter button (channel Email/SMS/Push, status, shown as removable chips), date picker with presets, "Previous Period" toggle that adds a delta badge and prior value on metric cards and revenue cells, pagination 30/50/100 rows, row checkboxes, columns icon to toggle columns (same URL)
- Attribution window filter (for example 7 days versus Lifetime) and a Subscription filter (Subscription Recurring Order, Subscription First Order, Non-Subscription Purchases) and the Click Date / Purchase Date accounting mode (same URL)
- A built-in explanation table of why numbers differ from Klaviyo (Klaviyo last-click fixed 5-day email / 24h SMS window, email-only scope versus all channels, siloed credit versus distributed credit) (same URL)

### 1.3 Creative Analysis (formerly Creative Cockpit)

- Platforms: Facebook, Google Ads, TikTok, Twitter; analysis is "platform-by-platform", not aggregated across platforms (https://kb.triplewhale.com/en/articles/6362638-introducing-creative-cockpit)
- Granularity: individual creative, or aggregate by Ad Name, Image ID, Video ID, or Copy; grouping by creative style (Lifestyle, UGC) is not supported yet (same URL)
- Ads Comparison Area: Card, Bar and Line views; compare multiple metrics at once ("how a spike in Spend impacts ROAS and CTR simultaneously"); select specific creatives to compare side by side; dropdowns choose the metrics on the graph (same URL)
- Table Deep Analysis: large table of performance metrics, "compare performance across tens of metrics" (same URL)
- Presets save the whole page configuration: filters, selected metric columns, Group By, selected items in the comparison area; default "All ads" preset; named examples "High Spend Scale" and "New Creative Testing" (same URL)
- Filters: one unified list, used to isolate campaigns, ad sets or performance criteria (same URL)
- Ad View Modal on click: platform preview as customers see it, performance breakdown for that ad, chat with Moby about the creative, "Magic Regeneration" (Moby Pro) to generate new iterations (same URL)
- Segments tab: rule-based dynamic groups (for example "Campaign Name contains 'Smoothwear'") with title and description; new ads auto-join; the table shows aggregate Spend, Purchases, Impressions and blended CPA per segment for head-to-head comparison (for example "ASC" versus "Instagram"); drill from a segment to its ads; segment views are saveable as presets (same URL)
- The original Cockpit's trend chart showed the top three creatives with a solid line for the left-axis metric and a dashed line for the right-axis metric, with an aggregated bar view for volatile periods (search summary of the same article: https://kb.triplewhale.com/en/articles/6362638-introducing-creative-cockpit)
- Polar-style per-creative "sort top performers" is handled here through Presets and the comparison area (same URL)

### 1.4 Customers: Cohorts, Segments, Retention

Cohort Analysis (Customer Retention > Cohort Analysis)

- Default view: accumulated LTV per customer over the preceding 365 days, customers grouped by month of first order (https://kb.triplewhale.com/en/articles/5725663-customer-cohorts)
- Fixed first columns per cohort row: Cohort, Customers (unique new customers), NCPA (ad spend / new customers), RPR (repeat purchase rate: % who made at least one more order within the report period), then 1st order, then Month 0 .. Month N (same URL)
- Metrics selectable for the grid: Total Sales (gross + tax + shipping minus discounts), LTV (total sales / unique customers), Number of customers, Retention Rate (same URL)
- Time period: any range, minimum "Last 7 days"; Time frame buckets: Month (default), Day (when period is a month or less), Week (Monday start), Year (same URL)
- NCPA Payback: how long each cohort takes to earn back acquisition spend, based on NCPA and total sales; shows "--" when a segment filter is applied (same URL)
- Cumulative toggle (on by default) versus per-period values; "2nd Order Only" toggle restricts the grid to each customer's second order so the far column matches RPR (same URL)
- Segments selector (segments built in the customer data platform); custom filters in four categories (Orders, Product, Customers, Attribution), OR within a category, AND between saved filters; saved filters are account-wide; zero-dollar orders excluded automatically (same URL)
- Color coding in shades of blue from maximum to minimum to spot churn and growth; guidance to read rows, columns and diagonals (same URL)
- Export: CSV download, share to Google Sheets (same URL)
- Breakdown by first-order characteristics (products, location, discount code, channel) is listed as "coming soon" (same URL)

Customer Segments

- Rule builder over events (Made a purchase, New customer purchase, Returning customer purchase, Clicked an ad, Active on site, Added to cart, Started checkout) and attributes (name, email, location, customer tags, total number of orders, Klaviyo email or SMS subscription status, membership in other segments) (https://kb.triplewhale.com/en/articles/13389920-customer-segments)
- Rule refinements: product name, product category, order tag, order price, discount code; time filters (last 30 days, date range, before/after) and quantity filters (more than 3 times, exactly once) (same URL)
- Live Estimated Audience count while building; AI "Generate Name"; templates such as Recent Checkout Abandoners, Lapsed High-Value Customers (90+ days), One-Time Buyers (30 to 90 days), Repeat Buyers, Recent Cart Abandoners (7 days), Lookalike Seed Audiences (same URL)
- Sync to Meta, Klaviyo, TikTok Ads, Pinterest Ads, Google Ads, Microsoft Ads (same URL)

Retention and LTV elsewhere

- The Summary page's LTV section: Unique Customers, LTV, Frequency, LTV/CPA (archived Summary metrics library, URL above)
- Portfolio dashboard: LTV vs CAC scatter and per-platform Lifetime Value column (https://kb.triplewhale.com/en/articles/13363367-portfolio-performance-dashboard-guide)
- "Retention" is one of the four standard dashboards ("Dive into customer retention analytics") (https://kb.triplewhale.com/en/articles/9653103-create-a-custom-dashboard)
- Product Analytics is the fourth standard dashboard: "Understand the impact and sales trajectory of specific products and make inventory projections" (same URL)

### 1.5 Moby AI, agents, anomaly detection, Sonar

Moby chat

- Natural-language querying, report generation (example in docs: CPA, CTR, CVR, CPM for campaigns over a period, broken down by day, in a table), history tab of past queries, iterative revision, export and sharing, follow-up questions (https://kb.triplewhale.com/en/articles/9211940-moby-introduction)
- Moby is "Triple Whale's conversational AI and SQL co-pilot"; the fact-checking article lists what it does reliably (starter SQL, summarizing ROAS/CPA/MER over common ranges, explaining Pixel, attribution models, Sonar) and failure modes; it "defaults to Triple Attribution unless explicitly told otherwise"; Show SQL toggle; rough limit of 12,000 rows or 80K tokens per conversation (https://kb.triplewhale.com/en/articles/11824175-moby-capabilities-limitations-and-fact-checking-guidelines)
- Moby lives in every dashboard: "Moby is available in every dashboard to generate insights based on the data in the dashboard" (https://kb.triplewhale.com/en/articles/9653103-create-a-custom-dashboard)
- "Create Dashboard Widgets with Moby": describe, preview, approve a widget in natural language inside a dashboard; "Create a Gen UI Report from Your Dashboard" uses the dashboard's built-in Moby agent to produce a polished report (https://kb.triplewhale.com/en/collections/19645565-summary)
- Moby 2 home screen has an "Ask Anything" bar, History, Automations (recurring work on a schedule, tracked on a board) (https://kb.triplewhale.com/en/articles/12117524-a-guide-to-triple-whale-s-navigation)

Agents, anomalies, observability

- Moby Agents launched April 2025: "Spot anomalies in the data before they impact revenue"; brand agents for Media Buying, Retention Marketing, Conversion Rate Optimization, Operations; agency agents for Weekly Reporting, Account Auditing, Creative Analysis & Benchmarking, Cross-Channel Analysis; a Measurement Agent compares MMM, Triple Attribution and in-platform data; CRO collection includes a "Website Performance Agent and the Anomaly Detection Agent" (https://www.triplewhale.com/blog/product-event)
- Moby Observability (two tools: anomaly detection and threshold monitoring; Isolation Forest against historical patterns; runs three times a day at 6 AM, 12 PM and 6 PM on the last full hour; triggers an AI root-cause analysis when a metric is anomalous or crosses a threshold). This comes from the search-indexed summary of https://kb.triplewhale.com/en/articles/12986027-moby-observability; the live page returned 404 on 2026-10-07 and no archived copy was available, so treat the schedule details as indexed-snippet evidence rather than verified page text.
- Ad Platform Controls: update status, budget and bids for Meta, Google, Pinterest, Snapchat, TikTok campaigns from inside Triple Whale (https://www.triplewhale.com/blog/product-event)

Sonar

- Sonar Optimize: enriches conversion events with first-party data from Shopify/BigCommerce/WooCommerce before sending them to Meta (and now Google, TikTok coming) via CAPI, with a dashboard tracking CAPI integration status and performance (https://kb.triplewhale.com/en/articles/9482981-sonar-optimize-data-enrichment-for-meta and https://www.triplewhale.com/blog/product-event)
- Sonar Send: identifies more customers to trigger more email flows, with its own impact dashboard; "22% average increase in flow revenue after turning on Sonar Send" (https://www.triplewhale.com/blog/product-event)

### 1.6 Dashboards and the custom report builder

- Four standard dashboards ship out of the box: Summary, Pixel, Retention, Product Analytics (https://kb.triplewhale.com/en/articles/9653103-create-a-custom-dashboard)
- New dashboard: Add > Dashboard; choose a template from the Template Library or "Create New Dashboard from Scratch"; name it, pick a folder, optionally assign a custom date range in Advanced Settings (same URL)
- Three ways to add a data visualization: Chat with Moby (ask in plain language, add the result to the dashboard), Metric Library (build a table of data points from connected channels with filters and order preferences), Custom SQL Builder (write SQL against the warehouse) (same URL)
- Editing: Edit Layout (resize and rearrange), Add Data Visualization, Add Text, Add Image; per-widget Edit Section to reorganize or hide columns, change number formats, add conditional styling (https://kb.triplewhale.com/en/articles/9659653-editing-a-custom-report)
- Sharing a dashboard with teammates is its own article in the Summary collection (https://kb.triplewhale.com/en/collections/19645565-summary)
- Reports/Automations: the Moby Automations board runs recurring work; dashboards also drive Slack via "How to ask Moby questions in Slack" and "Moby in Slack" (https://kb.triplewhale.com/en/articles/12117524-a-guide-to-triple-whale-s-navigation and https://kb.triplewhale.com/en/articles/9211940-moby-introduction)
- Product site summary: pre-built templates, "No-Code Dashboard Builder", "Custom SQL Builder" (search summary of https://www.triplewhale.com/reporting; the page itself blocks automated fetches)

---

## 2. Hyros

Hyros's documentation was rebuilt in 2026; the old `docs.hyros.com/?p=` links now land on the home page. The guides live under `docs.hyros.com/docs/<slug>` and were read in a browser with accordions expanded.

### 2.1 What Hyros says it is (the differentiator)

- "Hyros is an ad tracking and attribution platform that measures which ads produce actual revenue. It uses server-side, first-party data collection and deterministic user matching" across Meta, Google, TikTok, YouTube, email and offline (https://hyros.com/updates/what-is-hyros/)
- "Print tracking": the script collects IP, first-party cookie, device fingerprint, email (from forms), phone (at checkout), UTMs and click IDs into a "print" per visitor, then matches conversions deterministically by known identifiers rather than probabilistically (same URL)
- Cross-device matching example (click on phone, buy on laptop via Google) is the core story; "Hyros captures up to 50% more conversions than platform-native pixels" (same URL)
- Feedback loop: verified conversions are sent back to Meta CAPI and Google offline conversions so the platforms optimize on real purchases; the AIR feature claims "3-7% instant revenue increase" (same URL)
- LTV and cohort reporting per customer, not per click: a $97 first order plus $497 upsell plus $2,000 membership is all credited to the original ad (same URL)
- The "Reported vs Revenue" column is the marketing centerpiece: "Pull up the Reported vs Revenue and the gap shows up fast" (https://x.com/hyros_official/status/2065428641782067612); Hyros's own Meta reporting post frames the platform as an independent layer that "does not use Meta's windows" and tracks "whether that is 3 days, 30 days, or 90 days later" (https://hyros.com/updates/meta-ads-reporting-attribution/)
- Pricing tiers scale with tracked monthly revenue; Business plan from 230 USD/month on annual; 90-day money-back guarantee (https://hyros.com/updates/what-is-hyros/)

### 2.2 Dashboard (Quick Reports)

- "Within the dashboard, you have full flexibility to tailor and organize all relevant data in one centralized location." Widgets are added via "+ Add Widget" and organized into Views; default views are "Basic" and "Pro" (https://docs.hyros.com/docs/dashboard-reports and https://hyros.com/updates/changelog/version-2-6-7/)
- Widget and use-case catalogue listed on the Dashboard page: Reporting Gap, Hyros Insights, Attribution Gap, Metrics Summary, Top Products Widget, Top Source Data, LTV Comparison, Charts & Visualizations, Send Weekly Reports Notification (every Monday), Load Main Traffic Source Metrics, Compare Attribution Modes, Unique Sales Widget, Compare Date Ranges, Scheduled Reports, Share Reports, Chrome Extension (https://docs.hyros.com/docs/dashboard-reports)
- Metrics Summary widget: shows Leads, Sales, Calls, Total Revenue, ROI, Cost for the chosen range; under each metric a percentage versus "the same period 7 days earlier" (last 7 days compared with the previous 7 days), positive or negative; can be renamed and scoped to specific Sources, Products or tags via Specify Attributes (https://docs.hyros.com/docs/metrics-summary)
- Compare Date Ranges: a Comparison toggle shows the selected range "and immediately compares it with the data captured in the exact previous date range" (Dec 21 to 27 versus Dec 14 to 20 in the example) (https://docs.hyros.com/docs/compare-date-ranges)
- Compare Attribution Modes: put the same traffic source side by side in different modes, for example FB revenue in Last Click versus Last Click with Date of Click, or Scientific with different first-ad day ranges versus Last Click (https://docs.hyros.com/docs/compare-attribution-modes)
- Attribution Gap widget (Top Table > Attribution Gap): percentage of entities attributed versus unattributed, with the entity selectable from Leads (default), Sales, Carts (https://docs.hyros.com/docs/attribution-gap)
- Reporting Gap report: "highlight the discrepancies between Hyros and the Ad platforms" (https://docs.hyros.com/docs/reporting-gap)
- Hyros Insights: "AI-powered insights and recommendations based on your business data inside Hyros" (https://docs.hyros.com/docs/hyros-insights)
- LTV Comparison widget (Add Widget > Report > LTV): two modes, "LTV for First Click" (LTV of all leads who first entered during the dashboard date range, measured to today or a configured period; example of one widget per ad source over the Christmas period) and "Total LTV" (ignores the dashboard range; average LTV over a chosen period for a source, used as several widgets with different periods to watch LTV change) (https://docs.hyros.com/docs/ltv-comparison)
- Top Sources widget (Top Table > Top Sources): choose traffic sources, attribution type, grouping method, Specify Attributes (tags, products, source links) and the metrics displayed; shows real-time cost for the current day since v2.8 (https://docs.hyros.com/docs/top-source-data and https://hyros.com/updates/changelog/version-2-8/)
- Unique Sales widget (Report > Unique Sales): "Total value" (whole group of sales) or "Attributed value" (respects Last Click or Scientific mode), with source, category and lead filters (https://docs.hyros.com/docs/unique-sales-widget)
- Dashboard email sharing and scheduling: send immediately or on a schedule to one or many recipients, preview the email, manage all scheduled sends in one view; weekly dashboard email with widget images (https://hyros.com/updates/changelog/version-2-6-7/ and https://hyros.com/updates/changelog/version-2-7/)
- Dashboard grid uses a 24-column responsive grid; real-time updates via server-sent events; "Print View" export to PDF (https://hyros.com/updates/changelog/version-2-6-5/ , https://hyros.com/updates/changelog/version-2-6-4/ , and the search summary of https://docs.hyros.com/?p=13389)

### 2.3 Performance Reports (the main attribution report)

Attribution models offered

- First Click, Last Click, Scientific, Depreciation (time-weighted), Linear (fractional), U-Shaped (https://docs.hyros.com/docs/performance-reports)
- First Click credits the first source in the journey; Last Click credits the last source before sale; the docs walk through the same Meta then Google journey under both (https://docs.hyros.com/docs/first-click-report and https://docs.hyros.com/docs/last-click-report)
- Scientific merges First and Last Click using a "Day Range of Attribution": if the sale happens within the day range of the last click the last click wins, otherwise the first click wins; built for long click-to-sale funnels (https://docs.hyros.com/docs/scientific-report)
- Last Click is "the default setting of the REPORT BOARD"; First and Last Click each have a generic mode and a Date of Click mode (search summary of https://docs.hyros.com/?p=734 and https://docs.hyros.com/?p=5248)
- "Attribution Model Explanations": hovering a model in the reporting UI explains its purpose and best use (https://hyros.com/updates/changelog/version-2-6-4/)
- "Prioritize Organic" or "Prioritize Paid" settings exist for date-segmented reports, which then show "Paid Source Sales" and "Organic Source Sales" columns (https://hyros.com/updates/changelog/version-2-6-6/)

Report settings and filters

- Timeframe and attribution model sit in the top bar; advanced options in the Filters panel; a dedicated Chart tab holds visualizations while Tabs view is the default table; table density Compact, Comfortable, Large (https://hyros.com/updates/power-features/new-performance-report-design-improved-flow/)
- Reports open in tabs with names and order saved across sessions (https://hyros.com/updates/power-features/a-faster-smarter-hyros-workspace/)
- New customer configuration: All Customers, Only Returning Customers (at least one prior payment), Only New Customers (first purchase since Hyros was installed, or since imported history) (https://docs.hyros.com/docs/understanding-reports)
- Attribution Window: "None" means old clicks still count; otherwise a fixed number of days after which clicks stop counting (example: sale today, click 8 days ago, 7-day window drops it, 30-day keeps it) (same URL)
- Base Grouping: by source, or by day/week/month; a report grouped by source counts a lead once per source clicked, so reports can read higher than widgets (same URL)
- Excluding Hard Costs: "Hard costs take away taxes, shipping and product cost" (same URL)
- "Direct Traffic" = sales with no attributed source but a direct click within 24h before the sale; "No Source" = no attributed source and no direct click within 24h; the attribution window decides which bucket an older click falls into (same URL)
- Date of Click Attribution: backdates each sale to the day of the originating click instead of the sale date; worked example of 11 sales on May 24 becoming 1 sale under Date of Click, with the other 10 moving to their January and April click dates; "essential for businesses with call funnels, demos, high-ticket sales" (https://docs.hyros.com/docs/date-of-click-attribution)
- Other advanced options listed on the Performance Reports page: Attribute Filters, Filter Source by Creation Date (only campaigns created in the selected range), Forecasting Option (beta) to estimate future LTV, Days Range for First Source Attribution (Scientific), Exporting Data (CSV or Google Sheet), In-Report Journeys (https://docs.hyros.com/docs/performance-reports)
- Exclude Refunds toggle in Advanced Options (https://hyros.com/updates/changelog/version-2-7/)
- Report filters by product, product category or product tag; "Exclude leads without sales" option on ad-level reports (https://docs.hyros.com/docs/ad-level-report)
- Column presets and custom metrics: "Choose Report Columns" covers columns, custom Presets and custom Metrics; the Columns selector, Presets and Search sit in the table header; a custom formula metric combines existing metrics (limit of 10 variables) (https://docs.hyros.com/docs/choose-report-columns , https://hyros.com/updates/changelog/version-2-7/ , https://docs.hyros.com/docs/hyros-metrics-guide , https://hyros.com/updates/changelog/version-2-6-4/)
- Entity name columns (ad set name, campaign name, ad account name) available as columns in the Performance report and widget; Budget and Status columns are editable from inside Hyros (https://hyros.com/updates/changelog/version-2-2/ and https://docs.hyros.com/docs/hyros-metrics-guide)
- Deep Mode: drill into the records behind any row (sales, calls, customers, leads), available in the Lead Journey report, Creatives gallery view, Geo report and others (https://hyros.com/updates/changelog/version-2-7/ , https://hyros.com/updates/changelog/version-2-6-5/ , https://hyros.com/updates/changelog/version-2-6-6/)
- Chart view caps at 8 metrics (https://hyros.com/updates/changelog/version-2-8/)

### 2.4 Metric and column inventory (every metric available in Reports and dashboard widgets)

All of the following come from the Hyros Metrics Guide (https://docs.hyros.com/docs/hyros-metrics-guide), read with all accordion sections expanded.

General
- Budget (set in the ad manager, editable from Hyros), Cost, Total Revenue (including recurring), Revenue (first-time sales only, excludes recurring), Reported (what the ad platform tracked), Reported vs. Revenue ("Difference between Hyros data and your ad platform data. A positive value means the ad platform is under-reporting; a negative value means it may be over-reporting or misattributing sales."), Profit, ROAS, New Customers, New Customer ROAS (New Customer Revenue / Ad Spend), Sales (including refunds), One time sales (not part of any subscription), Reported Result (platform result count for the optimization goal; ad group or ad level only), Shop Reported result (Facebook Shops sales)

General (Advanced)
- Status (editable), Ad ID, Info (depth stats), Clicks, Recurring revenue, ROI, Refund, Refund Count, New Customers revenue, Refunded Sales Percentage, Refunded Revenue Percentage, New Visits (clicks with no prior tracking profile), New Customers Percentage ("Percentage of unique sales that belong to new customers"), Cost per Sale, Cost per Click, CTR, CPM, CVR, Impressions, Customers, Recurring Customers, Total Customers, Gross Margins, Partial video views, Time to Acquire New Customer

Calls and Calls (Advanced)
- Calls, Unique Calls, Cost per Call, Cost per Unique Call, Canceled Calls, No shows Calls, Unqualified Calls, Qualified Calls, Cost per Qualified Call, Time of Call Attribution, Time of Sale Attribution

Lead Generation and Lead Generation (Advanced)
- Leads, Cost per Lead, New Leads, Cost per New Lead (CPA), NC CPA; separately, "Leads" now counts unique people and "Lead Optins" counts every opt-in event, with "New Leads" for first-time opt-ins (https://hyros.com/updates/changelog/version-2-7/)

E-Commerce and E-Commerce (Advanced)
- Carts, Cost per ATC, Net Profit (total revenue minus hard costs), Net Profit Percentage, Contribution Margin, Contribution Profit, AOV, New customer AOV (New Customer Revenue / New Customer Orders)
- NET CAC (cost to acquire a new customer, calculated with cost of goods), Cost per new customer (CPA, without COGS), Unique Sales (orders), Cart Conversion Rate, ATC Rate, ATC Events, Purchased Carts, Cost per Unique Sale, Cost per New Customer, New Customers Revenue, Returning Customers (customers who purchased before the date range), Returning Customer Rate, Returning Customers Revenue, Returning Customers Revenue Rate, Hard Costs, Taxes, Cost Of Goods, Shipping Value

LTV Forecasting
- 30 Days LTV, 60 Days LTV, 90 Days LTV, 6 Months LTV, 1 Year LTV, and the Forecast version of each (30, 60, 90 days, 6 months, 1 year)

Subscriptions and Subscriptions (Advanced)
- New Trials, Converted Trials, New Subscriptions, Cost Per New Subscriptions, Cost Per New Trials, MRR, New MRR, ARR, Direct Subscriptions (no trial), Trial CVR, Churn Rate, Canceled Trials, Canceled Subscriptions, and 30/60/90 day, 6 month and 1 year Subscription Forecasts

Custom Formula
- "Create custom metric" in the widget metric picker or the report Columns menu, combining any available metrics

Partial video views
- Count of plays of at least 3 seconds (or most of the duration if shorter), with per-platform thresholds listed (Meta 2s, Google 10 to 30s, TikTok 2s, Snapchat 2s, Bing 2s, Pinterest 3s, LinkedIn 2s, Twitter 2s)

### 2.5 Analytics Suite (the deeper reports)

- Reports in the suite: Ad Level Report, Trends Report, Geo Sales Data, Cohort Analysis, Lead Journeys, Keyword Report (Google Ads and now Bing keywords) (https://docs.hyros.com/docs/analytics-suite and https://hyros.com/updates/changelog/version-2-6-7/)
- Ad Level Report: data per individual ad with creative images in a gallery; configure date range, attribution model, "Days Range for Discard Attribution", Specify Attributes (sources, campaigns, ads, products, tags), advanced options "Exclude leads without sales" and product category or tag filters; platforms supported: Facebook, TikTok, Google, Twitter, Snapchat, Bing, Reddit, Pinterest (not LinkedIn); LTV metrics in this report are always first-click based and ignore the report's date range and attribution mode, computed as revenue in the first 30/60/90 days after first click divided by leads over that timeframe, or customers only when "exclude leads without sales" is on (https://docs.hyros.com/docs/ad-level-report)
- Trends Report: each metric shown across rolling windows (last 3 days, last 7 days, last 30 days) to spot direction; key columns Unique Customers, Cost, ROAS, CAC; advanced options "Show only first-time customers" and "Exclude recurring sales"; guidance that 30-day ROAS below 7-day or 3-day ROAS means recent ads are converting faster than baseline; "Net CAC = the true cost of acquiring a customer" (https://docs.hyros.com/docs/trends-report)
- Cohort Analysis (Reporting > Other Reports > Cohort Report): groups leads or customers by entry period; views Revenue by month, Total Sales Overview (cumulative), ROI over time; source or tag filter via Specify Attributes; newer design adds New Customers, Cost and % of returning customers as leading columns and value types Amount, Percentage, Accumulated Amount, Accumulated Percentage; cohorts are accessible only in First Click mode when opened in-report (https://docs.hyros.com/docs/cohort-analysis , https://hyros.com/updates/changelog/version-2-2/ , https://docs.hyros.com/docs/in-report-journeys)
- Lead Journeys report: ranked list of the most frequent and highest-converting paths (for example Meta Ads > Meta Ads > Sale, Meta Ads > Email > Sale) with sales count and total revenue per path; configure attribution model, key metric (Sales), date range, "Exclude recurring sales"; drill from source to campaign to ad group to ad inside a path; Deep Dive mode; CSV export; in-report date range change (https://docs.hyros.com/docs/lead-journeys and https://hyros.com/updates/changelog/version-2-7/ and the search summary of https://hyros.com/updates/changelog/critical-feature-drop-in-report-journeys/)
- Traffic Report: chart of Clicks, Leads, Visitors and Source Links over time at the domain level, with inline URL-rule creation for untracked URLs (https://hyros.com/updates/changelog/version-2-6-7/ and https://hyros.com/updates/changelog/version-2-6-6/)

### 2.6 Advanced Reports (LTV) and Creatives

- First Click LTV: revenue generated by leads over time from their very first interaction; configure the acquisition date range, an "LTV date range" (how far forward to measure), and a traffic source filter; example "3-month LTV of leads who first clicked a Google ad in February"; compare cost per lead against LTV to decide scaling (https://docs.hyros.com/docs/first-click-ltv)
- LTV for Sources: average LTV by traffic source, and "LTV for a Segment" for specific customer groups (https://docs.hyros.com/docs/advanced-reports)
- Total Sales Report: all sales within a date range with a built-in Compare Mode (Group A versus Group B by date range or by tag), event type Sales or Calls or both, options "Ignore recurring sales" and "Show only first-time customers"; output is a side-by-side graph plus total revenue and sale count per group (https://docs.hyros.com/docs/total-sales-report)
- Creatives Report: per creative component (Image, Headline, Copy) at Campaign, Ad Set or Ad level, Gallery or Table view, with Total Revenue, Ad Spend and ROI per component; defaults to sorting by Total Revenue and recommends sorting by ROI; filter by traffic source and product; Deep Mode in gallery view (https://docs.hyros.com/docs/creatives-report and https://hyros.com/updates/changelog/version-2-6-6/)
- LTV Forecasting: predicted 1, 3 and 6 month LTV per source for new customers only or all customers, built from historical Stripe/Shopify behaviour; for SaaS it forecasts Long-Term Value, MRR trajectory, churn rate and refund rate; forecast metrics are available in Last Click, Scientific and First Click reports and are attributed per the selected mode (unlike standard LTV, which is always first click) (https://docs.hyros.com/docs/ltv-forecasting)

### 2.7 In-Report Journeys, Call and Lead Stages, Subscription Suite

- In-Report Journeys: on any report row, four icons open deeper views: Customer Journey (exact click path before converting), Geographic Breakdown, Product Breakdown (sales, cost of goods, refund rates, net profit per product, "Some products may be losing you money even when ads look profitable"), Cohort Analysis (spend per cohort over time, pre-filtered to that row) (https://docs.hyros.com/docs/in-report-journeys)
- Call & Lead Stages: track MQL, SQL, webinar attended, opportunity or deal stages via integrations (Acuity, Calendly, ClickFunnels 2.0, HighLevel, Hubspot), dynamic URL rules, or Zapier/API; each stage becomes a custom column set in reports; a lead that passes through several stages is counted in each (https://docs.hyros.com/docs/call-lead-stages)
- Subscription Suite (ClickFunnels 2.0 and Stripe today): stores trial starts, trial conversions, trial cancellations, subscription cancellations and cumulative subscription revenue per subscription, tied to the original ad source; report metrics New Trials, Converted Trials, Canceled Trials, Canceled Subscriptions, Total Subscription Revenue plus One Time Sales, New Subscriptions, New MRR, Direct Subscriptions, Trial CVR, Churn Rate from Stripe; subscription status vocabulary (incomplete, trialing, active, past_due, canceled, unpaid, completed); worked example comparing trial conversion rate and 6-month revenue per source (https://docs.hyros.com/docs/subscription-suite)
- Recurring revenue: Shopify order tag "Subscription Recurring Order" (Recharge default) marks a sale recurring, same as the "rebill" tag (search summary of https://hyros.com/updates/changelog/version-1-9-2/)

### 2.8 Organizing data and the CRM

- Organizing Data page lists: URL Rules (organic sources and URL links), Disregard Source Rules (skip attribution for a source within a timeframe), Products, Product Packages (bundles), Product Naming, Call Attributed Sales, Unqualified Calls, Date Range Filters, Product Filters, Attribute Filters, Date of Click Attribution, Tracking Recurring Sales and Subscriptions, and the HYROS MCP for Claude/ChatGPT (https://docs.hyros.com/docs/organizing-data)
- URL rules can assign a Traffic Source and Source Category manually or read them from the URL (https://hyros.com/updates/changelog/version-2-7/)
- Sales Data (CRM): import and manually tag sales, import leads, import calls, phone close forms, import subscriptions, export data; AND/OR filter indicator on tag filters (https://docs.hyros.com/docs/sales-data and https://hyros.com/updates/changelog/version-2-6-6/)
- Per-lead journey view: open any lead to see their clicks and journey; subscription start and end appear as tags in the journey (https://docs.hyros.com/docs/subscription-suite and the search summary of https://docs.hyros.com/using-tags-to-track-customers/)

### 2.9 Recent dashboard and reporting changes worth copying (2026 changelog)

- Live Cost framework: today's ad spend pre-warmed into cache so cost is current when the report loads (Meta first) (https://hyros.com/updates/changelog/version-2-6-6/)
- Saved and scheduled reports are editable (filters, date ranges, frequency); scheduled report view shows export status and error tooltips (https://hyros.com/updates/changelog/version-2-6-4/ and https://hyros.com/updates/changelog/version-2-8/)
- Unified chart palette across light and dark mode; customizable pinned navbar sections per user (https://hyros.com/updates/changelog/version-2-6-4/ and https://hyros.com/updates/changelog/version-2-6-5/)
- View type (tabs, nested, chart) preserved across Performance and Creatives reports (https://hyros.com/updates/changelog/version-2-8/)
- Streaming (server-sent events) for large on-demand reports to avoid timeouts (https://hyros.com/updates/changelog/version-2-8/)

---

## 3. Polar Analytics

### 3.0 Shape of the product

- Default pages after connecting data: a first Custom Dashboard that is the homepage, Acquisition (marketing KPIs), Retention (LTV and cohorts), Product (sales and inventory), Subscription (Recharge), Engagement (Klaviyo email data); the help says these "cover about 80% of your needs" and Custom Reports cover the rest (https://intercom.help/polar-app/en/articles/6270242-customizing-your-dashboards)
- Views apply a saved filter (store, country, product, sales channel) across Key Indicators, Acquisition, Retention, Products, Subscriptions, Engagement and Custom Reports (https://intercom.help/polar-app/en/articles/5563128-understanding-views)
- Help center collections: Custom Analytics (dashboards, tables, charts, key indicator sections), Paid Marketing (acquisition, creative studio), Retention Marketing (LTV, personas, subscriptions, email and SMS), Merchandising (products, inventory, funnel, orders), Incrementality Testing, Metric Alerts, Data Activation (audiences and signals), AI Agents (MCP, Ask Polar, Email Marketer), Data Sources, Data Model (https://intercom.help/polar-app/en/)

### 3.1 Dashboards and Key Indicators (the overview)

- A dashboard holds two content types: Key Indicator Sections ("grids of metrics that you want to keep a close eye on. They also support targets") and Tables/Charts (custom reports composed of metrics, dimensions, date granularities and filters); dashboards live in folders; blocks can be sent on a schedule by email or Slack; Viewer role can view but not edit (https://intercom.help/polar-app/en/articles/10430437-understanding-dashboards)
- Dashboards 2.0: Key Indicators renamed "Cards", split into Metric Cards (single value) and Sparkline Cards (value plus small trend chart); cards support custom filters and locked date ranges; Card Grids are built with the Custom Report Builder; templates in the sidebar; dashboards can be built with Ask Polar (https://intercom.help/polar-app/en/articles/14472426-custom-dashboards-2-0)
- Chart types added in 2.0: stacked bar, 100% stacked bar, area, 100% area, mixed bars plus lines ("Customize series"), and comparisons directly on charts; lines and bars are now separate chart types; radar converted to bar, polar to doughnut (same URL)
- Comparison on Key Metrics: each metric shows a percentage in its bottom-left corner versus the previous period or previous year depending on the date filter, colored green when the direction is good for the store and orange when it is not (for example a drop in Discounts shows green, a rise in Returns shows orange); formula (Current / Previous) minus 1 (https://intercom.help/polar-app/en/articles/6913733-how-does-polar-calculate-the-comparisons-on-my-key-metrics-dashboard)
- The dashboard's top-right comparison selector only affects Key Indicator sections; tables and charts set their comparison inside the report editor (https://intercom.help/polar-app/en/articles/5973031-understanding-custom-tables-charts-formerly-custom-reports)
- Date filters: pre-defined (last month, yesterday), relative (last 180 days), explicit date range; plus an aggregation choice (for example a 3-week range summed as a month) (https://intercom.help/polar-app/en/articles/5973046-how-can-i-use-date-filters)
- Targets on any Key Metric: numeric value, type Absolute or Daily/Weekly/Monthly/Quarterly/Yearly (prorated to the date filter using 30, 90 and 365 day ratios), success criteria at-or-higher or at-or-lower; most common targets are revenue, CAC, ROAS, conversion rate; per-brand sections with Views (https://intercom.help/polar-app/en/articles/6550853-understanding-targets)
- Metric formulas shown on hover of the "i" icon in each widget (https://intercom.help/polar-app/en/articles/5649166-how-are-my-metrics-calculated)
- Blended metric definitions: ACOS = spend / total sales; Blended CAC = spend / new customer orders; Blended Conversion Rate = orders / GA sessions; Blended ROAS (MER) = total sales / spend; New Customer ROAS = new customer sales / spend; Paid CPA = spend / pixel conversions; Paid ROAS = pixel conversions / spend; POAS = gross profit / spend; Total Conversion Value from pixels; Total Conversions from pixels; Total Marketing Spend (same URL)
- Shopify computed metrics: AOV, Gross Margin, Gross Margin net of expenses, Gross Profit, Gross Profit net of expenses, LTV, Net Sales, New AOV, New Customer %, New Sales, New Sales %, Purchase Frequency, Repeat AOV, Repeat Customer %, Repeat Sales, Repeat Sales %, Total Sales, and X Day versions (Gross Profit, LTV, Net Sales, Total Sales) for 30, 60, 90, 180 and 360 days (same URL and https://intercom.help/polar-app/en/articles/6782182-how-is-ltv-calculated-in-polar)
- The full semantic-layer metric list (every key, including CM1 to CM4, Blended CAC:AOV ratio, LTV:CAC ratio, Polar Pixel paid and non-paid CAC/ROAS/CPO/ncACV, Pixel funnel session rates, journey durations, bounce rate) is published as the Metric Directory for the MCP (https://intercom.help/polar-app/en/articles/13062421-metric-directory-for-the-mcp)
- Benchmarks: a benchmark dataset exposes Blended CAC, Blended ROAS, Blended Conversion Rate, AOV, Facebook CPM/CTR/ROAS/cost per purchase and more "(Benchmark)" metrics for comparison in reports (same Metric Directory URL); the marketing site says benchmarks compare "key metrics across 4,000+ Polar Brands" (https://www.polaranalytics.com/templates/essential-klaviyo-metrics)

### 3.2 Acquisition tab

- Sections: Blended Performance ("the source of truth. It's all your marketing spend and your total sales."), Channel and Campaign Performance (Pixel-attributed, with attribution model switch such as First or Last Click and extra metrics per channel; falls back to platform pixels if the Polar Pixel is not installed), Campaign Insights (only campaigns meeting ROAS and ad spend filters), Customer Journeys (paths before purchase under the selected model, with channel or campaign touchpoint filters), Key Traffic Metrics (Google Analytics) (https://intercom.help/polar-app/en/articles/6996092-understanding-the-acquisition-tab)
- "Pixel channels only" toggle on by default, excluding POS and subscription orders (same URL)
- Optimization Insights table: Facebook and Google campaigns with platform ROAS above 2 ("Expand these Segments") or below 1 ("Keep an eye on these Segments"), based on platform-reported ROAS (https://intercom.help/polar-app/en/articles/8507200-why-don-t-i-see-data-in-the-optimization-insights-table)
- Channel Performance table is editable to add Ad Platforms Conversions, Polar Pixel Conversions, Sessions (GA, Pixel or Shopify), Blended Impressions, Blended Clicks, LTV by first channel, Conversion Value (platform, Pixel or both); breakdown toggles between Channel and Campaign (https://intercom.help/polar-app/en/articles/8074567-how-can-i-see-which-of-my-channels-and-campaigns-perform-the-best)
- Blended versus Paid performance: blended compares all spend to all Shopify new customers and revenue; paid uses each channel's pixel, which can overlap (https://intercom.help/polar-app/en/articles/5662239-what-s-the-difference-between-blended-performance-and-paid-performance)
- "Side-by-Side View to compare platform-reported data against Pixel-tracked data" (https://intercom.help/polar-app/en/articles/6706026-understanding-polar-pixel-attribution)
- Channel labels you will see: "Undefined" (no source found, falls back to Shopify attribution), "Not Set" (from Google Analytics), "-" (orders untracked, typically pre-Pixel) (https://intercom.help/polar-app/en/articles/8183223-how-can-i-read-the-channel-types-in-my-attribution-data)
- Attribution Rate: percentage of orders linked to a marketing source, target 85%+, monitor "Undefined" above 20 to 30% (https://intercom.help/polar-app/en/articles/6706026-understanding-polar-pixel-attribution)

### 3.3 Attribution models and settings (apply anywhere Pixel conversions appear)

- Models: First Click, Last Click, Linear, U-Shaped (40/40/20), Time Decay, Full Paid Overlap (every paid channel gets 100%), Full Paid Overlap + Facebook Views, Full Impact (Shapley values across paid and non-paid, computed on grouped channels) (https://intercom.help/polar-app/en/articles/8047958-understanding-attribution-models and https://intercom.help/polar-app/en/articles/10570327-understanding-the-full-impact-model)
- Pixel metrics in Key Indicators default to First Click; Last Click is "Polar's default for many reports" (https://intercom.help/polar-app/en/articles/8047958-understanding-attribution-models and https://intercom.help/polar-app/en/articles/6706026-understanding-polar-pixel-attribution)
- Docs recommend comparing models side by side: strong in First Click but weak in Last Click = acquisition driver; the reverse = retargeting closer; strong in Full Paid Overlap = frequent assist (https://intercom.help/polar-app/en/articles/8047958-understanding-attribution-models)
- Three settings sit on top of any model: Is Paid Only (drop organic and direct touchpoints; note that UTM-tagged owned links and Klaviyo flows count as "paid"), Lookback Window (any number of days or unlimited; Full Impact ignores it; default lookback is 10 days), Cash vs Accrual (Cash dates credit to order day; Accrual dates credit to each touchpoint's day; "Use Cash for reporting and cash flow", "Use Accrual for optimization"); active settings are shown in purple; orders with no eligible touchpoint fall into Undefined (https://intercom.help/polar-app/en/articles/15551014-understanding-attribution-settings and https://intercom.help/polar-app/en/articles/6706026-understanding-polar-pixel-attribution)
- Live Pixel data (last 72 hours, no attribution) is separate from attributed Pixel conversions (https://intercom.help/polar-app/en/articles/6706026-understanding-polar-pixel-attribution)

### 3.4 Journeys tab

- Shows Total Trackable Orders, journey length buckets (1-touch, 2-touch, 3+ touch), Channel Distribution (how often each channel appears at each stage), cross-channel influence (https://intercom.help/polar-app/en/articles/11067752-understanding-the-journeys-tab)
- Filters: First Touch Channel, Customer Type (New vs Repeat), Product Titles in Order, Channel Touchpoints Count (to isolate multi-touch journeys); breakdown switchable to Campaign to see which branded campaigns assist (same URL)
- Needs the Pixel, correct UTMs and two weeks of data (same URL)

### 3.5 Retention tab (LTV and cohorts)

- LTV summary at the top is driven by a Customer Lifespan control, not the date range; Key Metrics instead offer LTV and 30/60/90/180/360 Day LTV that do follow the date range (https://intercom.help/polar-app/en/articles/6782182-how-is-ltv-calculated-in-polar and https://intercom.help/polar-app/en/articles/6272709-understanding-the-retention-tab)
- Historical Cumulative LTV graph for one cohort over time (same URL)
- Cohort table: one metric at a time, columns Cohort size, First order, then Month 0 .. Month N; metrics Retention Rate (default, cumulative), Customers (per period), Orders, Total Sales, Net Sales, Gross Margin, LTV (cumulative per customer), LTV:CAC; a live CAC indicator says whether the CAC in the ratio is blended or scoped to the filtered channel or campaign (https://intercom.help/polar-app/en/articles/5649397-understanding-cohort-analysis)
- Period basis: Calendar periods (default, matches Shopify) or Rolling windows from each customer's own first order (same URL)
- Cohort filters: product collection of first item, acquisition source (UTM or Klaviyo), Shopify customer tags or geography (same URL)
- Cohort Evolution Graph: cumulative LTV growth per cohort with breakdowns and top segments, with Polar pre-selecting the top 3 segments by first-order sales (same URL)
- "New Sales per month" in the cohort tables includes repeat sales by that month's new customers within the same month; Polar includes gift card sales by default (https://intercom.help/polar-app/en/articles/6272709-understanding-the-retention-tab)
- Personas (paid add-on): AI customer segments enriched with third-party demographic and lifestyle traits (US only), tracking segment evolution, drop-offs, time between purchases, next-purchase predictions, activation to Klaviyo, Meta and Google (https://intercom.help/polar-app/en/articles/10857733-understanding-personas)

### 3.6 Email and SMS analytics (Klaviyo, Attentive, Omnisend)

Where it lives

- Connecting Klaviyo adds a "Revenue By Attribution Channel" dashboard on the Acquisition tab and an Engagement tab "dedicated to Klaviyo-based engagement insights"; the full metric and dimension list is exposed in the Custom Table builder (https://intercom.help/polar-app/en/articles/5635048-klaviyo)
- Initial Klaviyo sync "may take some time depending on your account size (~1-2 weeks)" (same URL)
- Marketing site summary of the integration: campaigns, flows, subscriber growth, segments and attributed revenue "stitched to real Shopify orders"; "one row per campaign and flow"; Pixel re-attributes and de-duplicates email revenue against paid and organic; email and SMS revenue blended into contribution margin and net profit; Flow Enricher sends product viewed, added to cart and checkout started events back to Klaviyo; audiences activate into Klaviyo (https://www.polaranalytics.com/integrations/klaviyo)

Every Klaviyo metric Polar exposes (names and keys from the Metric Directory, https://intercom.help/polar-app/en/articles/13062421-metric-directory-for-the-mcp)

Campaign metrics (raw): Campaign Placed Orders, Campaign Received Email (sends), Campaign Revenue, Campaign Unique Bounced Email, Campaign Unique Clicked Email, Campaign Unique Clicked Email excluding Bots, Campaign Unique Marked Email as Spam, Campaign Unique Opened Email, Campaign Unique Received Email, Campaign Unique Unsubscribed from Email Marketing
Campaign metrics (computed): Campaign Placed Order Rate, Campaign Revenue per Received Email, Campaign Unique Bounced Rate, Campaign Unique Clicked Rate, Campaign Unique Clicked Rate excluding Bots, Campaign Unique Opened Rate, Campaign Unique Recipients, Campaign Unique Spam Rate, Campaign Unique Unsubscribed Rate
Flow metrics (raw): Flow Placed Orders, Flow Received Email, Flow Revenue, Flow Unique Bounced Email, Flow Unique Clicked Email, Flow Unique Clicked Email excluding Bots, Flow Unique Marked Email as Spam, Flow Unique Opened Email, Flow Unique Received Email, Flow Unique Unsubscribed from Email Marketing
Flow metrics (computed): Flow Placed Order Rate, Flow Revenue per Received Email, Flow Unique Bounced Rate, Flow Unique Clicked Rate, Flow Unique Clicked Rate excluding Bots, Flow Unique Opened Rate, Flow Unique Recipients, Flow Unique Spam Rate, Flow Unique Unsubscribed Rate
Account-level: Subscribed to List (new subscribers), Unsubscribed from List, Total Customers, Total Placed Orders, Total Revenue, Discounts, Tax, Tips
Blended email metrics (campaigns plus flows): % Email Revenue, Attributed Revenue (revenue_from_klaviyo), Average Order Value (Klaviyo), Received Email, Revenue per Received Email, Placed Order Rate, Unique Bounced Email and rate, Unique Clicked Email and rate (with and without bots), Unique Marked as Spam, Unique Opened Rate, Unique Unsubscribed and rate, Klaviyo List Growth %
Attentive (SMS): Total SMS Sent, Total SMS Sent (Campaign), Total SMS Sent (Concierge), Total SMS Sent (Journey), Total SMS Subscriptions, Total SMS Unsubscriptions
Omnisend: Campaign Complained, Campaign Received Email, Campaign Unique Bounced, Clicked, Opened, Unsubscribed

Dimensions

- Klaviyo campaign and flow names are the row dimensions ("one row per campaign and flow") and Klaviyo tracking parameters feed the Pixel's channel attribution; there is a dedicated Klaviyo Tracking Parameters Guide (https://www.polaranalytics.com/integrations/klaviyo and https://intercom.help/polar-app/en/articles/6868158-klaviyo-tracking-parameters-guide)
- Klaviyo counts as a "paid" touchpoint under Is Paid Only because flows and campaigns resolve a campaign name (https://intercom.help/polar-app/en/articles/15551014-understanding-attribution-settings)

Attribution window and de-duplication

- Email revenue can be shown two ways: Klaviyo's own attributed revenue (the klaviyo_sales_main metrics above) or Pixel-attributed revenue under any Polar model with its lookback window and Cash/Accrual setting; the marketing page's phrase is "re-attributes with its own first-party Pixel and de-duplicates against paid and organic" (https://www.polaranalytics.com/integrations/klaviyo and https://intercom.help/polar-app/en/articles/15551014-understanding-attribution-settings)

The "Essential Klaviyo Metrics" dashboard template (the vendor's own idea of the email KPI row)

- Seven cards, each with current value, a percentage change, a "Was X" previous value and an "Add target" button: Unsubscribe Rate (Klaviyo), Open Rate (Klaviyo blended), Order Rate (Klaviyo blended), Click-through Rate (Klaviyo blended), Average Order Value (Klaviyo blended), Revenue per subscriber (Klaviyo blended), List Growth Rate (Klaviyo) (https://www.polaranalytics.com/templates/essential-klaviyo-metrics)

Flows Enricher and the Activate dashboard

- Klaviyo Flows Enricher creates three Polar metrics in Klaviyo (Product viewed, Add to cart, Checkout started) for shoppers Klaviyo's cookie missed, and duplicates the matching abandonment flows in draft; claims 20%+ more abandoned-flow revenue and 50%+ more events (https://intercom.help/polar-app/en/articles/9493694-polar-s-klaviyo-flows-enricher)
- Results are tracked in Data Activation > Klaviyo Audiences: a snapshot of Polar flow results, a Flow Revenue Performance report by flow or flow type, and a per-flow performance-over-time chart on row select (same URL)

AI for email

- Email Revenue Maximizer prompt (for the Polar MCP) structures the analysis as: email revenue share versus target, flow versus campaign revenue, orders, revenue per recipient and conversion rate, top 5 and bottom 5 flows, best day and send time, unsubscribe rate flagged above 0.5%, list growth rate, segmentation by new versus returning and engagement level, and optional SMS from Attentive (https://intercom.help/polar-app/en/articles/12995779-email-revenue-maximizer-prompt)
- AI Email Agent (Polar x Bespoke): chooses which Klaviyo campaign to send, when and to whom per profile from Pixel behaviour; measured by control versus optimized groups on revenue per email sent, revenue per subscriber, LTV impact and unsubscribes (https://intercom.help/polar-app/en/articles/11411421-ai-email-agent-polar-x-bespoke)

### 3.7 Creative Studio

- Meta only (Facebook and Instagram); analyze images, videos, copy or landing pages (https://intercom.help/polar-app/en/articles/8888083-understanding-creative-studio)
- Pick up to 5 creatives, or "Sort top performers" by a chosen metric, count and direction; up to 4 metrics at once (examples Clicks, Impressions, ROAS); order the x-axis by any metric ascending or descending (same URL)
- Chart View (bar) and Card View, plus a "Performance Over Time" trend line per creative with hover keys (same URL)

### 3.8 Funnel tab

- Stages: Sessions, Product Page Viewed, Added to Cart, Checkout Started, Checkout Completed; bar chart where each bar is a share of all sessions plus drop-off percentages; "Show Absolute Values" switch; filters and breakdowns by channel grouping, campaign or landing page; date range picker; powered by the "Polar Pixel Page Viewed Sessions" metric (https://intercom.help/polar-app/en/articles/10551516-understanding-the-funnel-tab)

### 3.9 Ask Polar 2.0 and the MCP

- Plain-English questions over the semantic layer, with conversational memory ("compare that to last month", "show by channel"), instant bar charts, line graphs and tables, saved prompts, team sharing including Slack; example prompts "What was my blended CAC last quarter vs this quarter?", "Which campaigns had the highest ROAS last week?", "Show me revenue by SKU for new customers only." (https://intercom.help/polar-app/en/articles/13017453-ask-polar-2-0)
- Understands custom metrics and dimensions; outputs can be pinned to dashboards (pop-out arrow reveals the query, open the table in a new tab, save to a dashboard); chats are private per user and workspace; released to all users 26 January 2026 (same URL)
- Ask Polar can build or fix a Custom Table ("Start With Ask Polar") (https://intercom.help/polar-app/en/articles/5973031-understanding-custom-tables-charts-formerly-custom-reports)
- The marketing site lists five agents: Data Analyst, Media Buyer, Email Marketer, Inventory Planner, MCP, and "Polar Operator" in Slack (https://www.polaranalytics.com/templates/essential-klaviyo-metrics)
- Ready-made MCP prompts: Creative Performance Coach, Email Revenue Maximizer, Conversion Rate Optimization, Inventory Optimization, Executive Summary, Profitability Deep-dive, Media Buying Health Check (https://intercom.help/polar-app/en/collections/18954487-ready-made-prompts)

### 3.10 Custom tables and charts, alerts, automations, exports

- Custom Tables & Charts: choose metrics and dimensions; filters by date range, channel, product, customer segment with include/exclude; comparisons to previous period or year over year configured in the editor; Lock Date freezes historical values; granularity daily, weekly, monthly; Show Top/Bottom rows; switch rows and columns; multi-column sort (shift-click); color scales; toggle table or chart; schedule tables (not charts) (https://intercom.help/polar-app/en/articles/5973031-understanding-custom-tables-charts-formerly-custom-reports)
- Comparison display: % change in the same cell with the previous absolute value in a tooltip, or "Show previous value column" (https://intercom.help/polar-app/en/articles/10651354-seeing-historical-values-with-the-comparison-feature)
- Custom Report templates and customizable color scales have their own articles (https://intercom.help/polar-app/en/collections/13584296-custom-analytics)
- Alerts: pick any metric, daily or hourly frequency, calculation window in days/weeks/months/quarters/years, absolute threshold (above, below, either) or relative threshold (X% versus previous period), optional View filter, delivery by email, Slack or both; Insights are non-customizable root-cause write-ups when CAC or Total Sales move meaningfully, set up by support (https://intercom.help/polar-app/en/articles/5500342-understanding-alerts-insights)
- Automations: "Send Snapshots" of dashboard tables, metric cards or charts with date and granularity, optional comparison period and Views, to email or a Slack channel per automation (top 10 rows in Slack); "Run Instructions" runs an Ask Polar prompt on a schedule with conditional logic, for example "Every day at 6:30am, check CAC for the last 7 days and alert me if it's above EUR 70"; frequencies hourly, daily, weekly, monthly; a default daily report goes to all users unless disabled (https://intercom.help/polar-app/en/articles/6338683-understanding-automations-formerly-schedules)
- Exports: CSV from any table or chart (raw data, up to 100,000 rows; 1,000 rows shown in-app); Key Metric dashboards cannot be downloaded; automated Google Sheets exports on some plans (https://intercom.help/polar-app/en/articles/5649829-exporting-data-in-polar)
- Views: saved filter collections over multiple data sources with global filters (region, product, currency) or per-source rules (is, is not, is in list); multiple Views combine with OR; a long list of filterable dimensions per source (Shopify order, customer and geography fields; GA; Google Ads; Facebook Ads; TikTok; Snap; Bing; Pinterest; Criteo; Amazon Ads) (https://intercom.help/polar-app/en/articles/5563128-understanding-views)
- Custom Metrics and Custom Dimensions are built in the Data Model section (https://intercom.help/polar-app/en/collections/3079379-data-model)

---

## 4. What they all share

These are the patterns that appear in all three products, with at least one citation per vendor.

1. A period compare on every number. Triple Whale tiles open a bar graph "with the previous time period" and the portfolio dashboard has a "Previous period" toggle (https://kb.triplewhale.com/en/articles/5725275-track-kpis-with-the-summary-dashboard , https://kb.triplewhale.com/en/articles/13363367-portfolio-performance-dashboard-guide); Hyros's Metrics Summary widget prints a percentage versus the same length of time before, and the dashboard has a Comparison toggle (https://docs.hyros.com/docs/metrics-summary , https://docs.hyros.com/docs/compare-date-ranges); Polar prints the % change on every Key Metric and colors it by whether the move is good or bad (https://intercom.help/polar-app/en/articles/6913733-how-does-polar-calculate-the-comparisons-on-my-key-metrics-dashboard).

2. New versus returning is a first-class split, not a filter you have to build. Triple Whale carries NC versions of purchases, CV, ROAS, CPA, AOV, conversion rate and COGS as their own columns and a "New Customers" column preset (archived Attribution Dashboard Metrics Library; https://kb.triplewhale.com/en/articles/8143690-customizing-your-attribution-dashboard); Hyros has New Customers, New Customer ROAS, New Customer AOV, NET CAC, Returning Customers, Returning Customer Rate and Revenue Rate, plus an "Only New / Only Returning / All Customers" report setting (https://docs.hyros.com/docs/hyros-metrics-guide , https://docs.hyros.com/docs/understanding-reports); Polar ships New Sales, New Sales %, New Customer %, New AOV, Repeat Sales, Repeat AOV, Repeat Customer %, Blended CAC on new customer orders and New Customer ROAS (https://intercom.help/polar-app/en/articles/5649166-how-are-my-metrics-calculated).

3. First-party attributed revenue is shown beside platform-reported revenue, and the gap is itself a metric. Triple Whale's highlighted Pixel ROAS column sits next to the channel's reported CV and ROAS, with "Pixel Conversion Value Delta = Pixel CV minus Channel CV" (https://kb.triplewhale.com/en/articles/5960325-how-the-triple-pixel-works , archived metrics library); Hyros has Reported, Reported vs. Revenue, a Reporting Gap report and an Attribution Gap widget (https://docs.hyros.com/docs/hyros-metrics-guide , https://docs.hyros.com/docs/reporting-gap , https://docs.hyros.com/docs/attribution-gap); Polar has Ad Platforms Conversions beside Polar Pixel Conversions, a Side-by-Side View, and an Attribution Rate health number (https://intercom.help/polar-app/en/articles/8074567-how-can-i-see-which-of-my-channels-and-campaigns-perform-the-best , https://intercom.help/polar-app/en/articles/6706026-understanding-polar-pixel-attribution).

4. One blended "source of truth" row above the attributed channel rows. Triple Whale's Business Metrics section with MER, Blended ROAS, NCPA and Net Profit (archived Summary Metrics Library); Hyros's Metrics Summary (Leads, Sales, Calls, Total Revenue, ROI, Cost) and Total Sales report (https://docs.hyros.com/docs/metrics-summary , https://docs.hyros.com/docs/total-sales-report); Polar's "Blended Performance: This is the source of truth" section with MER, Blended CAC, POAS (https://intercom.help/polar-app/en/articles/6996092-understanding-the-acquisition-tab).

5. The attribution model is a dropdown on the table, with a lookback window beside it, and the docs tell you to compare models rather than pick one. Triple Whale: seven models, 1/7/14/28/Lifetime windows, recommended filters per model (https://kb.triplewhale.com/en/articles/5960333-understanding-and-utilizing-attribution-models); Hyros: First, Last, Scientific, Depreciation, Linear, U-Shaped, a "Compare Attribution Modes" widget and an attribution window setting (https://docs.hyros.com/docs/performance-reports , https://docs.hyros.com/docs/compare-attribution-modes); Polar: eight models plus Is Paid Only, Lookback Window and Cash vs Accrual, with "Compare, Don't Isolate" guidance (https://intercom.help/polar-app/en/articles/8047958-understanding-attribution-models).

6. Click date versus order date is an explicit switch. Triple Whale "Accounting mode: Click Date / Purchase Date" (https://kb.triplewhale.com/en/articles/14647401-email-sms-attribution-table); Hyros "Date of Click Attribution" (https://docs.hyros.com/docs/date-of-click-attribution); Polar "Cash vs. Accrual" (https://intercom.help/polar-app/en/articles/15551014-understanding-attribution-settings).

7. Campaign > ad set > ad drilldown, and from a number down to the orders and the customer journey. Triple Whale: click campaign to open ad sets and ads, click Pixel ROAS to list orders, click a customer to see the journey (https://kb.triplewhale.com/en/articles/5960325-how-the-triple-pixel-works); Hyros: Deep Mode on any row, journey, geo, product and cohort icons per row, Lead Journeys drill from source to ad (https://docs.hyros.com/docs/in-report-journeys , https://docs.hyros.com/docs/lead-journeys); Polar: Channel to Campaign breakdown switch and the Journeys tab with campaign breakdown (https://intercom.help/polar-app/en/articles/8074567-how-can-i-see-which-of-my-channels-and-campaigns-perform-the-best , https://intercom.help/polar-app/en/articles/11067752-understanding-the-journeys-tab).

8. Column presets and saved views are how the table copes with 50+ metrics. Triple Whale's nine column presets plus custom presets shared with the team (https://kb.triplewhale.com/en/articles/8143690-customizing-your-attribution-dashboard); Creative Analysis presets that save filters, columns, grouping and selection (https://kb.triplewhale.com/en/articles/6362638-introducing-creative-cockpit); Hyros column presets, saved reports and dashboard Views (https://docs.hyros.com/docs/choose-report-columns , https://hyros.com/updates/changelog/version-2-8/); Polar Views and Custom Report templates (https://intercom.help/polar-app/en/articles/5563128-understanding-views).

9. Custom metrics by formula. Triple Whale no-code metric builder (https://kb.triplewhale.com/en/articles/5725275-track-kpis-with-the-summary-dashboard); Hyros "Create custom metric" in columns and widgets (https://docs.hyros.com/docs/hyros-metrics-guide); Polar Custom Metrics and Custom Dimensions (https://intercom.help/polar-app/en/collections/3079379-data-model).

10. Cohorts as the LTV surface, with CAC payback and a cumulative toggle. Triple Whale cohort grid with NCPA, RPR, NCPA Payback and cumulative/2nd-order toggles (https://kb.triplewhale.com/en/articles/5725663-customer-cohorts); Hyros cohort report with ROI over time and accumulated amount or percentage views (https://docs.hyros.com/docs/cohort-analysis , https://hyros.com/updates/changelog/version-2-2/); Polar cohort table with LTV:CAC, calendar or rolling period basis (https://intercom.help/polar-app/en/articles/5649397-understanding-cohort-analysis).

11. Email and SMS get their own screen that pairs ESP engagement (sent, open, click, unsub, spam) with revenue, broken down by campaign versus flow and expressed per recipient. Triple Whale Email & SMS Analytics (https://kb.triplewhale.com/en/articles/14647401-email-sms-attribution-table); Polar Engagement tab and Klaviyo metric set with Revenue per Received Email for campaigns and flows (https://intercom.help/polar-app/en/articles/5635048-klaviyo , https://intercom.help/polar-app/en/articles/13062421-metric-directory-for-the-mcp). Hyros treats email as a traffic source in the same report rather than a separate screen (https://docs.hyros.com/docs/lead-journeys).

12. Creative is analyzed by grouping ads on shared components (image, video, copy, name) and sorting by ROAS or ROI, with a card or gallery view next to the table. Triple Whale (https://kb.triplewhale.com/en/articles/6362638-introducing-creative-cockpit); Hyros Creatives Report by Image, Headline, Copy with Gallery view (https://docs.hyros.com/docs/creatives-report); Polar Creative Studio with card view and top-performer sort (https://intercom.help/polar-app/en/articles/8888083-understanding-creative-studio).

13. Anomaly and threshold alerts delivered to Slack or email, increasingly with an AI root cause. Triple Whale Moby Agents "Spot anomalies in the data before they impact revenue" and Moby Observability (https://www.triplewhale.com/blog/product-event ; observability page indexed but 404 today); Hyros Insights widget and weekly dashboard emails (https://docs.hyros.com/docs/hyros-insights , https://hyros.com/updates/changelog/version-2-6-7/); Polar Alerts (absolute or relative thresholds), Insights (root cause on CAC and Total Sales) and AI Automations (https://intercom.help/polar-app/en/articles/5500342-understanding-alerts-insights , https://intercom.help/polar-app/en/articles/6338683-understanding-automations-formerly-schedules).

14. A chat assistant that answers in charts and can save its answer as a dashboard widget. Triple Whale Moby with "Create Dashboard Widgets with Moby" (https://kb.triplewhale.com/en/collections/19645565-summary); Hyros MCP for Claude and ChatGPT plus "Hyros Insights" (https://docs.hyros.com/docs/organizing-data , https://docs.hyros.com/docs/hyros-insights); Polar Ask Polar 2.0 with pin-to-dashboard (https://intercom.help/polar-app/en/articles/13017453-ask-polar-2-0).

15. Scheduled snapshots to Slack and email, and dashboards shared with clients. Triple Whale Automations and dashboard sharing (https://kb.triplewhale.com/en/articles/12117524-a-guide-to-triple-whale-s-navigation , https://kb.triplewhale.com/en/collections/19645565-summary); Hyros dashboard email scheduling and Share Reports (https://hyros.com/updates/changelog/version-2-6-7/ , https://docs.hyros.com/docs/dashboard-reports); Polar Automations with per-automation Slack channels (https://intercom.help/polar-app/en/articles/6338683-understanding-automations-formerly-schedules).

16. Benchmarks against peers appear as a rank badge or a "(Benchmark)" metric beside your own number. Triple Whale (https://kb.triplewhale.com/en/articles/15606385-benchmark-metrics); Polar (https://intercom.help/polar-app/en/articles/13062421-metric-directory-for-the-mcp). Hyros does not document a benchmark feature in the pages read.

17. Sparklines on KPI cards. Triple Whale portfolio tiles and Summary tile trend graphs (https://kb.triplewhale.com/en/articles/13363367-portfolio-performance-dashboard-guide , https://kb.triplewhale.com/en/articles/5725275-track-kpis-with-the-summary-dashboard); Polar Sparkline Cards (https://intercom.help/polar-app/en/articles/14472426-custom-dashboards-2-0); Hyros Traffic Report chart and dashboard Charts & Visualizations widgets (https://hyros.com/updates/changelog/version-2-6-7/ , https://docs.hyros.com/docs/dashboard-reports).

18. Every vendor explains, inside the product, why its numbers differ from the ad platform or the ESP. Triple Whale's "Why numbers differ from Klaviyo" table (https://kb.triplewhale.com/en/articles/14647401-email-sms-attribution-table); Hyros's Reported vs Revenue definition and "Why Reports can show Lower Numbers" (https://docs.hyros.com/docs/hyros-metrics-guide , https://docs.hyros.com/docs/understanding-reports); Polar's "Why Polar Metrics May Differ from Ad Platforms" (https://intercom.help/polar-app/en/articles/6706026-understanding-polar-pixel-attribution).

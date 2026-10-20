# UI patterns research for the Locus redesign

Researched 2026-10-20 from public marketing pages, docs, changelogs and design write-ups. Where a value comes from a third-party reverse-engineering (hagicode, oh-my-opencode, 925studios, blakecrosley, saasui) it is marked "(unofficial)". Everything else is from the vendor's own site. Screenshots live in `img/`; the source URL is listed under each product.

Locus today: vanilla JS, dark graphite theme, Inter. The goal of this file is to name what the best products do the same way, then turn that into rules Locus can apply.

---

## 1. Triple Whale (Summary, Moby, mobile)

Sources: https://www.triplewhale.com/blog/new-look, https://kb.triplewhale.com/en/articles/12117524-a-guide-to-triple-whale-s-navigation, https://kb.triplewhale.com/en/articles/5725295-our-full-feature-mobile-apps, https://www.triplewhale.com/summary, https://kb.triplewhale.com/en/articles/11151399-moby-build-mode

Screenshots: `img/triplewhale-1.png` (Summary after the "new look", from the new-look blog, cdn.sanity.io/images/d016oilw/production/8b709d3e...png), `img/triplewhale-2.jpg` (Moby pacing analysis, triplewhale.com/assets/business-intelligence/hero-blended-statistics.webp), `img/triplewhale-3.png` (dark theme Summary with Pins, same blog, cdn.sanity.io/images/d016oilw/production/62b358d6...png)

- Navigation model: everything lives in ONE left sidebar, top to bottom: business selector (multi-select to blend stores), Moby (AI analyst, "starting point for questions, reporting, and action"), History (past Moby chats), Automations, Favorites (starred dashboards, workspaces, mini apps), then workspaces: Summary, Creative Analysis, Pixel, Retention, Ops. A "Lower Nav" at the bottom holds three account-level items: Data, Help, Settings. The right-hand sidebar was removed in the redesign "to provide more working space". Two levels deep at most (workspace > item).
- Page anatomy: slim icon rail (search, tree, +, apps) + collapsible label sidebar + content. Content header = breadcrumb ("Summary > Home") + "Last updated 11:22 AM", with a right-aligned control bar: compare toggle, Pins dropdown, date picker ("Today"), layout and user. Body = named sections ("Pins", "Forward View") each with a kebab + grid-toggle, holding KPI tiles.
- Density and type: KPI tile = 12 to 13px label with a coloured delta chip, 24 to 28px number, sparkline under it. Marketing hero (Moby) shows the same tile at label 18 / number 48 with a delta line ("$3,252 behind", "vs 5.0x target").
- Colour: dark theme is a navy-graphite (#0e1420 looking) with cards one step lighter and 1px borders; sparklines use a blue to green gradient stroke. Light theme is white cards on grey. Accent is one blue; green/red reserved for deltas. No gradients on chrome.
- Cards vs tables: Summary is all cards (KPI tiles with sparklines); detail workspaces are tables.
- Drawers/sheets/modals: product tour and settings are centred modals; Moby "build mode" is a split screen, chat pane left, live report right with Gen UI charts and a code view.
- Mobile: free iOS/Android app with "every single feature" of desktop, plus a home-screen widget of Pinned Metrics. Tiles stack one per row.
- Empty/loading/error: KPI tiles render with blurred placeholder numbers while loading (visible in the new-look screenshot); onboarding tour modal "1 of 7" on first login.
- Motion: not documented. Sparklines animate in; nothing else notable.

## 2. Motion (creative analytics, now runneth.com)

Sources: https://runneth.com/solutions/ad-performance-dashboard (motionapp.com redirects here), https://motionapp.com/faq, https://help.motionapp.com/en/articles/10024185-streamline-and-automate-your-motion-reports-with-naming-conventions

Screenshot: `img/motion-2.jpg` (https://runneth.com/_astro/feature-2.DQBYXJ5l_Z1rr4dB.webp)

- Navigation model: left sidebar of saved reports (Comparative, Launch analysis, Top ads leaderboard). Reports are the unit of navigation, not pages.
- Page anatomy: report header + a filter bar (date, account, naming-convention groups), then a creative grid. Each creative card = thumbnail (image or video with inline play), a status pill ("Iterate on hook", "Improve landing page"), then a compact two-column metric list (Spend, ROAS) and two bar meters (Drive conversions 75, Capture attention 47).
- Density: card metrics at ~13px, labels grey, values right-aligned in a light chip. Summary tiles above are large: 40px count, 24px title, 16px grey subtitle, with an emoji badge in a circle.
- Colour: white UI, near-black text, one accent for actives; green/yellow/red bar meters carry the judgement. Dark mode not documented.
- Cards vs tables: creative = card (the ad is the hero), leaderboards = table with the creative preview as the first column.
- Drawers: clicking a creative opens a side drawer with the full ad and metric history (per FAQ: "watch video ads without leaving the page").
- Mobile: none; desktop product.
- Empty/loading/error: not documented.
- Motion: none documented.

## 3. Northbeam

Sources: https://docs.northbeam.io/docs/new-to-northbeam-how-to-get-oriented, https://info.northbeam.io/knowledge/how-do-i-use-saved-views, https://info.northbeam.io/knowledge/how-do-i-customize-column-sets-on-the-sales-page, https://docs.northbeam.io/v2.3/docs/northbeam-2-update

Screenshots: `img/northbeam-1.png` and `img/northbeam-2.png` (nav strips from the docs page, https://mintcdn.com/northbeam/EpMPeQ8Ec2Yrg9EI/images/readme/cef51733-...png and 1a23cc22-...png)

- Navigation model: thin dark icon rail on the far left (Home, Attribution, Metrics Explorer), then a page header with the section name ("Attribution :") and horizontal tabs (Revenue, Products, Orders, Creatives). Northbeam 2.0 (June 2025) folded Sales, Creative Analytics and Product Analytics under one "Attribution" umbrella.
- Page anatomy: header row = section + tabs + "Accurate to 7:32 AM PDT" freshness chip on the right. Control bar = date range picker, then a horizontal chip row of saved views ("All Sales", "New Customers", "Returning Customers", "TOF", "BOF") with an ADVANCED link and a SAVE button. Body = a pivot table with a "Customize" button top right for column sets.
- Density: dense tables; 13px cells, right-aligned numbers.
- Colour: white body, violet accent for the active tab and chips, dark rail. No dark mode.
- Cards vs tables: tables everywhere; the only cards are KPI tiles above the pivot.
- Saved views are the key idea: a view = metric set + filters + date, shareable by URL ("Share copies a link to the exact dashboard view").
- Mobile: none.
- Empty/loading/error: not documented.

## 4. Polar Analytics

Sources: https://polaranalytics.com/l/dashboarding-tool, https://apps.shopify.com/polar-analytics

Screenshots: `img/polar-1.jpg` (composite, https://cdn.prod.website-files.com/5d41ab9d8cacf54c04df67c0/659c11624472d20f41e5dede_composite%20screenshot%20(2).webp), `img/polar-2.jpg` (custom report, .../664f13a2e2bf4f659c354393_Analyze%20-%20Custom%20report.webp)

- Navigation model: left sidebar with a collapse toggle: Connectors, then "Key Indicators" with a + and a nested list of saved reports (Profitability 101, Essential Meta Ads Metrics...), then Acquisition, Retention, Products. Two levels.
- Page anatomy: top control bar = "+ Add section", Views dropdown, Schedules dropdown, From/To date fields and a "vs." comparison range with a calendar icon. Page title ("Profitability 101") + grey subtitle ("Based on template..."), a "Show charts" toggle and "+ Edit Key Indicators" on the right. Body = 2-up grid of KPI cards.
- KPI card: top row of chips ("Add target", source icons, "Was US$530.09K", delta chip "-23%"), then label with info icon, 22 to 24px value, then a small line chart with a dotted comparison line.
- Density and type: label 13px, value 22px semibold, chips 11px. Comfortable, not dense.
- Colour: white cards on a very light lavender grey; violet accent; green chart line; red/green deltas. AI chat ("Which customers spent the most this year?") sits in a right panel with a violet bubble.
- Cards vs tables: cards for KPIs, tables for AI answers and breakdowns.
- Drawers: filter builder ("Custom Dimensions", When/Then rules) opens as a right panel.
- Mobile: none.

## 5. Linear

Sources: https://linear.app/changelog/2024-03-20-new-linear-ui, https://linear.app/blog/how-we-redesigned-the-linear-ui, https://linear.app/docs/custom-themes, https://linear.app/now/linear-liquid-glass, unofficial token extraction https://cdn.jsdelivr.net/npm/oh-my-opencode@4.18.2/dist/skills/frontend/references/design/linear.app.md

Screenshots: `img/linear-1.png` (new sidebar, https://webassets.linear.app/images/ornj730p/production/f9ebfb3c39a125665370f2c736acf482eaefe0d1-3312x2484.png), `img/linear-2.png` (light and dark themes, .../8b5a3c1c0e0f8ff8a46886cd21fa6de136070d37-3312x1792.png)

- Navigation model: single left sidebar + Cmd+K command menu. Sidebar order: workspace switcher + search + compose button, then Inbox and My issues (personal, visually distinct), then Workspace (Views, Roadmaps, Teams), Favorites, Your teams (team > Issues > Active/Backlog, Projects). Three levels max. Sidebar is translucent in every theme since 1.6.0.
- Page anatomy: header shows the current view name, actions and meta properties; filters live in the header row, not a separate bar. "Tabs, headers, filters and panels" were simplified to "reduce visual noise, maintain visual alignment, and increase hierarchy and density".
- Density and type (unofficial): Inter Variable with cv01 + ss03, weights 400 body, 510 UI emphasis, 590 strong, 700 never. Scale: 13px caption, 14px caption large, 15px small, 16px body, 20px H3, 24px H2, 32px H1. Letter spacing goes negative above 14px. Mono (Berkeley Mono) for IDs.
- Colour: LCH-based theme generator with just three inputs, base colour, accent colour, contrast; the same generator makes light and dark. Dark surfaces (unofficial): #08090a page, #0f1011 panel, #191a1b elevated, #28282c secondary. Text #f7f8f8 / #d0d6e0 / #8a8f98 / #62666d. Accent indigo #5e6ad2, hover #828fff. Borders are white at 0.05 and 0.08 alpha; elevation = raise surface alpha (0.02, 0.04, 0.05), not shadows.
- Radius (unofficial): 4 small, 6 buttons/inputs, 8 cards and dropdowns, 12 panels, 9999 pills.
- Cards vs tables: lists and boards; cards only on boards. Every row is a dense single line.
- Drawers/modals: issue opens in place or in a right split; command menu is a centred overlay; dialogs use a five-layer shadow stack.
- Mobile (2025): built its own Liquid Glass style material (blur + gradient + specular highlight computed on the GPU, no refraction "because it hurts readability in dense interfaces"), a custom tab bar that can expand beyond five items for role-based navigation, touched elements "lift slightly", variable blur at scroll edges, solid outlines when Increase Contrast is on.
- Empty/loading/error: skeleton rows; empty views show a short line and one action.
- Motion: keyboard actions are instant; panels and the command menu fade and scale in; durations are short (unofficial 120 to 200ms).

## 6. Stripe Dashboard

Sources: https://docs.stripe.com/dashboard/basics.md, https://docs.stripe.com/dashboard/mobile.md, https://support.stripe.com/questions/dashboard-update-may-2024, https://brianlovin.com/app-dissection/stripe-dashboard-ios, unofficial breakdown https://www.925studios.co/blog/stripe-dashboard-design-breakdown

Screenshots: `img/stripe-1.png` (full-page app overview, https://docs.stripecdn.com/8a9e806f8630691f96a7aca4e200b859c012b6148abdc70cfea91217f3603f6e.png), `img/stripe-2.png` (list view, https://docs.stripecdn.com/e23e42b8d6c8c9aa902577475890dac980fd56c98babf683b2a5560f3340dd1e.png)

- Navigation model: left sidebar in three groups: primary (Home, Balances, Transactions, Customers, Product catalog), Shortcuts (pinned + recently visited pages), Products (Payments, Billing, Reporting, Apps, More). Global search bar across the top of the content. `?` opens keyboard shortcuts. Two levels (product > sub page), plus tabs inside a page.
- Page anatomy: search bar row with icons (apps, help, notifications, settings, + create). Page header = icon + 28px title + right-aligned actions (Create, gear). Horizontal tabs (Overview, Driver, Vehicle, Rental) with an accent underline. Control bar = a single "Date range | Last 12 months" pill. Body = a row of 4 KPIs (13px grey label over 24px number, no card border), a chart section with a legend, and a right column of list cards ("Open rentals" with name, date, status pill, "View all").
- Density and type: 14px body, 13px secondary, 24px KPI numbers, 28px page title. Six-step scale (unofficial). Numbers tabular.
- Colour: white, near-black text, one violet accent (#635bff) for links, active tabs and the + button; status pills green/yellow/red with tinted backgrounds. Colour is "reserved for status". Dark mode exists.
- Cards vs tables: lists are tables with filters (date, customer, status, amount); detail pages use a two-column layout (May 2024 customer page).
- Drawers/sheets/modals: web uses modals for create flows; iOS uses stacked rounded cards that swipe to dismiss, "multi-step flows stack cards to show where the user is".
- Mobile: bottom tabs (Home, Payments, Balances, Customers) with a + at top right; home charts are editable ("Edit next to Reports overview"); 17 lock-screen widgets; action bar at the bottom of detail screens.
- Empty/loading/error: new accounts see zeroed metrics with flat sparklines and a prompt to make a test payment; empty lists include the code snippet to create the first object; error copy states what happened and what to do next.
- Motion (iOS): scrubbing a chart shows values instead of tooltips; changing date range "bounces the graph and slides it to preserve context"; ink ripple on touch; blue-tinted shadows.

## 7. Vercel dashboard

Sources: https://vercel.com/changelog/dashboard-navigation-redesign-rollout, https://vercel.com/blog/dashboard-redesign, https://vercel.com/geist/colors.md, https://vercel.com/geist/typography.md, https://vercel.com/geist/materials.md

Screenshots: `img/vercel-1.png` (dark, https://assets.vercel.com/image/upload/contentful/image/e5382hct74si/3xmtvm1yjWIvyzcxF2Vjs8/8f20f57d4f30d6765c0365df0fc316ac/Dash_-_Dark__1_.png), `img/vercel-2.png` (light, .../2Y43YuHnMCvnuYMC3VCvWX/9a16131f4a4a06532246b10258b43cff/Dash_-_Light__2_.png)

- Navigation model (default since Feb 26 2026): the old horizontal tabs moved into a resizable, hideable left sidebar. Team switcher at top, a "Find..." search with the F key hint, then Overview, Deployments, Logs, Analytics, Speed Insights, Observability, Firewall. "Projects act as filters", so the same tabs work at team and project level. Mobile gets a floating bottom bar "for one-handed use". Cmd+K command menu.
- Page anatomy: content header = project switcher + breadcrumb ("Deployments / 0wA...") + sub-tabs (Deployment, Resources, Source, Open Graph, Bundle Sizes). Body = bordered sections with a 16px semibold section title ("Deployment Details").
- Density and type: Geist Sans and Geist Mono. Typography classes name their size: heading-32/24/20/16/14, label-14 ("most common, used in menus"), label-13 tabular for numbers, label-12 tertiary, copy-14 "most commonly used", copy-13 when tight, mono-13 inline code.
- Colour: 10-step gray scale with fixed roles: 100 bg, 200 hover bg, 300 active bg, 400 border, 500 hover border, 600 active border, 700 high-contrast bg, 900 secondary text, 1000 primary text. Background-100 default, background-200 "used sparingly". Gray-alpha only where the background should show through. Nine hue scales with the same steps. P3 on supported displays. Dark mode is the same roles inverted.
- Radius (materials): base/small 6px, medium/large/menu/modal 12px, fullscreen 16px, tooltip 6px. Shadow strength increases tooltip < small < medium < menu < modal < fullscreen.
- Cards vs tables: bordered sections and list rows; tables for deployments and logs.
- Drawers/modals: modals for destructive actions; details open as pages.
- Empty/loading/error: deployment status colours in tab icons; empty projects page shows onboarding.
- Motion: minimal; tab underline slides.

## 8. Mercury (banking)

Sources: https://mercury.com/, https://mercury.com/treasury, unofficial breakdown https://www.925studios.co/blog/mercury-design-breakdown, https://www.saasframe.io/examples/mercury-dashboard

Screenshot: `img/mercury-1.png` (AI confirm card, https://www.datocms-assets.com/115132/1787335849-4_5_treasury-command.png)

- Navigation model: left sidebar grouped by job (Accounts, Payments, Cards, Treasury, Capital, Invoicing, Accounting, Settings). Universal search bar. Two levels.
- Page anatomy: "financial position first" (balance, recent transactions, cash flow) at the top level; operational controls (cards, permissions) one level down. Transactions = a single long table with a right drawer for the selected row.
- Density and type: editorial, wide line heights, large balance numbers; body ~15px; proprietary grotesk. Tables are airy (56px rows).
- Colour: restrained; green brand, blue secondary, "red and yellow appear only for errors and warnings". Soft lavender page background behind white cards in the AI screen; one pill-shaped violet primary button; everything else is grey text on white.
- Cards vs tables: tables for money, cards only for confirmation and summaries. The AI confirm card (screenshot) is the pattern: label 14px grey / value 18px, rows separated by hairlines, footer with "Make edits", "Cancel draft", "Confirm".
- Drawers/modals: row detail = right drawer; 925 counts 108 modal instances, mostly money-movement confirmations.
- Mobile: iOS app mirrors the sidebar as bottom tabs (Accounts, Cards, Payments, More).
- Empty/loading/error: not documented.
- Motion: none notable; confirmation cards fade in.

## 9. Later (social scheduler)

Sources: https://later.com/social-media-scheduler/, https://apps.apple.com/us/app/later-social-media-scheduler/id784907999, https://help.later.com/hc/p/product-updates

Screenshots: `img/later-1.png` (visual planner, https://images.ctfassets.net/nfpsrlop6sws/4AaSsXIBDXpc81CUdWHEKb/c87ea755268cd2130919340053ccd4e8/later-social-scheduler-visual-planner.png), `img/later-2.png` (multi-platform calendar, .../3mhh1jD3utqcWCIe8r3rs6/7b3bcfd5f16711a8998426ee7f9d44d8/later-social-scheduler-multi-platform.png)

- Navigation model: left sidebar (Calendar, Media, Analytics, Inbox, Collect, Link in bio) + a social-set switcher; inside Calendar a segmented control of views: Stories, Preview, Week, Month, List, plus a gear and "Send Posts".
- Page anatomy: left = content (phone-shaped Instagram grid preview or the calendar), right = "Post Schedule" list with thumbnail + time ("9:00am Jan 7, 2026"). "Best Time to Post" badges render directly on calendar slots. Media library is a left drawer you drag from.
- Density and type: 13 to 14px UI, pill buttons, generous padding; every post is a thumbnail.
- Colour: white UI with one violet accent; platform icons give the colour. No dark mode.
- Cards vs tables: calendar cells with thumbnails; List view is a table.
- Drawers/sheets/modals: post composer is a large centred modal (media left, caption + per-platform tabs right); mobile composer is a full-screen sheet.
- Mobile: bottom tabs (Calendar, Media, Analytics, Inbox, Profile); week/month views; Best Time to Post on iOS by default (June 2026 notes).
- Empty/loading/error: failed posts flagged in red on the calendar with a retry.
- Motion: drag-and-drop reorders the grid with a lift shadow; nothing else.

## 10. Sandcastles (social watch)

Sources: https://www.sandcastles.ai/, https://creatorhouse.app/blog/sandcastles-ai-review (competitor review), https://moge.ai/product/sandcastles

Screenshots: `img/sandcastles-1.jpg` (watchlist add + channel cards, https://www.sandcastles.ai/images/step-1-tab-1144.webp), `img/sandcastles-2.jpg` (outlier feed with stats and script panels, https://www.sandcastles.ai/images/outlier-dashboard.webp)

- Navigation model: dark app; left rail of workspaces (one per niche), then Watchlists, Outliers feed, Scripts, Collections. Watchlists are the unit (150 competitors on Pro).
- Page anatomy: search bar with a chip row of filters ("Views", "Platform", "> 2x outlier", "Last 3 months"), then a grid of vertical 9:16 video cards with a platform badge in the corner and a one-line title below. Side panels: stat tiles (Outlier score 105.3x, Engagement rate 11%, Views 3.2M) and a Script panel with "Previous version" vs "Current script".
- Density and type: 13px labels, 20px stat numbers, card title 13px. Dense grid, 4 to 5 cards per row.
- Colour: navy-graphite (#0f172a-ish) surfaces, cards one step lighter, one blue primary button; stat tiles use tinted backgrounds (green, red, purple, yellow) per metric. Dark only.
- Cards vs tables: cards everywhere (the video is the content); no tables.
- Drawers/modals: "Add this channel to a watchlist" is a small modal with a select and Add; a video opens a right drawer with transcript, breakdown and script generator.
- Mobile: responsive web only, cards stack.
- Empty/loading/error: not documented.
- Motion: hover lifts the card; otherwise none.

## 11. Asana

Sources: https://asana.com/product, https://help.asana.com/s/article/navigating-asana, https://forum.asana.com/t/ultimate-guide-to-the-new-sidebar-redesign-get-your-team-prepared/356082, https://asana.com/inside-asana/building-the-future-of-asana-through-new-navigation

Screenshots: `img/asana-1.jpg` (project list, https://assets.asana.biz/transform/9fa1bcdb-7e83-4934-af3e-4e9292a722ea/homepage_AWM_tabbedmedia?format=webp), `img/asana-2.jpg` (dark mode issue tracker, .../53b74a46-5a62-468f-b8bf-47b55b978837/homepage_command_tabbedmedia?format=webp)

- Navigation model: top bar (hamburger, logo, centred global search, AI sparkle) + a slim icon rail on the far left (Starred, Work, Plan, Workflow, Company, with a + at the bottom) that expands into a full sidebar (Home, My tasks, Inbox, Insights, Projects, Teams). The rail-plus-sidebar is the 2024/25 "new sidebar"; My Tasks, Inbox and Search moved out of the sidebar into the top bar years earlier "because the left pane can get crowded".
- Page anatomy: project header = colour icon + 22px title + star, member avatars, Share and Customize buttons; view tabs under it (List, Timeline, Calendar, Messages). Body = a spreadsheet-like list: sections with collapsible headers, rows at 40px, columns (Assignee, Budget, Launch date, Channels...) with "+ 5" overflow chips, "Add task..." inline.
- Density and type: 14px rows, 12px column headers, 22px title; the rail labels are 11px under 20px icons.
- Colour: white, soft grey borders, coral brand only on the logo, blue only for primary buttons; chips get pastel backgrounds. Dark mode exists (screenshot 2): #1e1f21 surfaces, same structure.
- Cards vs tables: List is a table; Board is cards; task detail is a right pane.
- Drawers/sheets/modals: task opens as a right-side pane (not a modal), with description, fields and an activity feed; Quick Add is a floating modal from the + button.
- Mobile: bottom tabs (Home, My Tasks, Inbox, Search, +); task opens full screen.
- Empty/loading/error: empty projects show a template picker; inline "Add task..." rows.
- Motion: pane slides in from the right; completion check animates with a short celebration (yeti/unicorn) for power users.

## 12. Notion

Sources: https://www.notion.com/product, https://matthiasfrank.de/en/notion-updates/ui-update-the-new-opt-in-sidebar/, unofficial tokens https://design.hagicode.com/designs/notion/

Screenshots: `img/notion-1.jpg` (agent page, https://images.ctfassets.net/spoqsaf9291f/5CESaDHalT60BVMktTrFD9/986587f634695de956580c1654b4f777/automate_front_desktop.jpg), `img/notion-2.jpg` (Meetings database, .../5s8E0EU3tXEvGrFrRwgxhb/c44fce43494ccd6f098746c64b679aab/capture_desktop.jpg)

- Navigation model: single left sidebar (~240px, unofficial) with Home, Search and Inbox as tabs at the TOP of the sidebar (new opt-in sidebar), then Favorites, Teamspaces, Private, with a nested page tree. Cmd+K search. Mobile: tabbed bar at the top (Home, AI Chats, Meeting Notes, Inbox) and a bottom bar for search/notifications/new page.
- Page anatomy: page = icon + 40px title + optional cover; database = tabbed views as pills ("EPD meetings", "My meetings", +) under the title, then the table with a column header row (icon + 14px grey label) and 48px rows; "+ New page" at the bottom.
- Density and type (unofficial): 16px body, 14px caption at 500, 12px badges at 600 with +0.125 tracking; weights 400/500/600/700; display 64px at -2px tracking. NotionInter (Inter-based).
- Colour: white, text rgba(0,0,0,0.95), secondary #615d59, borders rgba(0,0,0,0.1), blue #0075de for links and primary only. Tags use pastel chips (Growth, Infra, Design). Dark mode: #191919 page, #202020 sidebar, same hairlines at white alpha.
- Radius (unofficial): 4 buttons/inputs, 5 menu items, 8 small cards, 12 cards, 16 featured, 9999 pills. Shadows are 4 to 5 layer stacks with max 0.05 opacity.
- Cards vs tables: everything is a view of a database: table, board (cards), list, calendar, gallery.
- Drawers/modals: a database row opens as a "side peek" (right drawer), "center peek" (modal) or full page, user-selectable per view.
- Empty/loading/error: empty pages show a block menu; sync badge "Syncing" chip.
- Motion: side peek slides in ~200ms; hover states appear instantly; buttons scale(0.9) on press (unofficial).

## 13. Superhuman

Sources: https://blog.superhuman.com/how-to-build-a-remarkable-command-palette/, https://superhuman.com/, unofficial notes https://blakecrosley.com/guides/design/superhuman

Screenshots: `img/superhuman-1.png` (Go inline suggestion, https://superhumanstatic.com/vwfkeyj6n9ac/11sX23AwujdMh1r7DhwRjG/a4aaed695be871cd91ebc8df4a4ab16c/card-go-inline-suggestions-bento-21x9-dark-2x__1_.png), `img/superhuman-2.png` (Docs AI side panel, .../4p5IDJ7HSxvvUEXBCDooPe/1925032308506fd52cab1b9676ff8261/Frame_2147264536_copy.png)

- Navigation model: almost no chrome. Split Inbox tabs across the top, a collapsible list of folders on the left, and Cmd+K ("Superhuman Command") as the primary way to do anything. Single-key shortcuts (j/k, e, h), every palette row shows its shortcut "so you learn it for next time".
- Command palette rules (from their blog): one shortcut that works on every screen and also closes it; case-insensitive fuzzy match with a score threshold; match titles AND aliases and show "Title (alias)"; a default score so key features rank before typing; hide low-value commands until matched; "follow" lists to force ordering; order by recency; centred, covers a large part of the app, monospaced font, show about five results and cut the last one off to hint there is more; an icon per command; hide only commands irrelevant to the context.
- Page anatomy: reading pane = sender, subject, body with generous measure; AI panel on the right ("Docs AI") with a chat bubble, bullets, a row of small icon actions (copy, download, thumbs) and an input with a round send button.
- Density and type: large 15 to 16px reading type, 13px meta; custom grotesk (Super Sans), weights 460/540/600 (unofficial).
- Colour: deep indigo/violet marketing and dark app theme; in-app accent is a single purple for links and AI; white cards with 12 to 16px radius on top of gradients in marketing only.
- Cards vs tables: list rows; no tables.
- Drawers/modals: palette = centred overlay; snippets and snooze = small popovers anchored to the row.
- Mobile: same split inbox as a segmented control at the top; swipe actions; sheets for snooze.
- Empty/loading/error: "Inbox Zero" full-screen photo state.
- Motion: very short (under 150ms), keyboard actions never animate (so repeated actions feel instant).

## 14. Attio (extra pick: CRM tables)

Sources: https://attio.com/, https://www.saasui.design/application/attio, unofficial notes https://styles.refero.design/style/08c8700c-f278-42bc-812e-f60dc6ce996e

Screenshots: `img/attio-1.png` (settings, https://cdn.sanity.io/images/alowdh95/production/9cd4f6edac0ddfda1720917327c1e6ea87a4d654-1974x1080.png), `img/attio-2.png` (onboarding with app skeleton, .../e804394da2333908d97335796f5f9c42122f57f6-1974x1080.png)

- Navigation model: left sidebar (workspace switcher, search, Notifications, Tasks, Reports, then Records: Companies, People; then Lists), collapse icon in the sidebar header. Settings is its own full-page two-column layout (Account / Workspace / Records / Lists groups on the left, form on the right) with a breadcrumb "Workspace Settings / General". Cmd+K.
- Page anatomy: list page header = view name + "Share", "Ask Attio", "View settings", "+ New"; toolbar of view type / filter / sort chips; then a spreadsheet grid with a checkbox column, sticky first column, 36px rows, "+" add-row at the bottom and footer aggregates.
- Record page: left column of attributes, centre activity timeline, right column AI summary and related records. Record opens as a side peek from a list.
- Density and type: Inter, 13px grid cells, 14px at weight 500 for UI, 24px settings title; "compact within cards and lists, generous between sections" (unofficial).
- Colour: white, hairline borders, one blue #266df0 for primary buttons and selection; brand-coloured record avatars. Dark mode exists.
- Cards vs tables: tables are the product; cards only on Kanban.
- Drawers/modals: side peek for records, centred modals for import/export (6 of 25 captured screens are modals).
- Empty/loading/error: inline "You have not created any exports." in grey inside the table area; skeleton rows while loading.
- Motion: side peek slides 200ms; hover reveals row actions.

## 15. Ramp and Things 3 (extra picks: navigation grouping, mobile shell)

Sources: https://support.ramp.com/ramps-navigation-admin-view, https://culturedcode.com/things/features/, https://culturedcode.com/things/blog/2017/11/hello-x/

Screenshots: `img/ramp-1.png` (sidebar per role, https://assets.ramp.com/help-center/ramps-navigation-admin-view/attachments/41297032132627.png), `img/things3-1.png` (Today, https://static.culturedcode.com/things/videos/2017-05-18-website-videos/2-today-iphone.png), `img/things3-2.png` (Reminders, .../10-reminders-iphone.png)

Ramp
- Navigation: global search at top "the fastest way to reach a page"; left menu "grouped by the task you're trying to accomplish" (Home / Insights, then Manage spend, Expenses, Travel, Bill Pay, Treasury, then Accounting, Vendors, Policy, Company); the menu differs by role; personal settings in the top-right avatar; Ramp Assist bottom left. Sub-items expand inline under the parent (Insights > Reporting, Price Intelligence...). Sidebar collapses with a chevron at the top right.
- Type and colour: Inter, 13px menu items, off-white page (#f6f6f4), one chartreuse accent for primary actions, everything else monochrome (unofficial). Light only.

Things 3
- iPhone shell: no bottom tab bar; the list runs to the bottom edge "like a sheet of paper"; back chevron top left, a chevron-down top right to collapse; a floating blue "Magic Plus" button bottom right that can be dragged to place the new item. Today = calendar events block, then to-dos, then a "This Evening" section.
- Sheets and popovers: Quick Find opens by pulling down the list; "Jump Start" date picker is a popover from a swipe; opening a to-do "transforms it into a white page" (in place, not a push). iPad sidebar swipes away; Mac has a collapsible Slim Mode.
- Type: 17px titles, 15px grey project line, 28px bold list title; one emoji/icon per list; blue for times, pink flag for deadlines.
- Motion: in-house animation toolkit; everything is a transform of the thing you tapped; swipe reveals actions and enters multi-select.

---

## Patterns the best share

1. One left sidebar is THE navigation; horizontal tabs only live inside a page. Linear, Stripe, Vercel (moved its top tabs into a sidebar in 2026), Triple Whale (removed its right sidebar), Polar, Attio, Ramp, Mercury, Notion. Nobody uses a top nav for primary routes any more.
2. The sidebar is grouped by job, not by data model, and holds at most three levels. Stripe (primary / Shortcuts / Products), Ramp (grouped "by the task you're trying to accomplish"), Linear (personal / workspace / teams), Triple Whale (Moby / favorites / workspaces / lower nav).
3. Personal items (Inbox, My tasks, Home) are visually separated from workspace items, usually at the very top. Linear, Notion (Home/Search/Inbox tabs at top of sidebar), Asana (top bar), Attio.
4. Search or a command palette sits at the top of the sidebar or the top of the content and has a keyboard hint. Vercel ("Find... F"), Stripe (search bar + `?`), Ramp ("start with global search"), Linear and Superhuman (Cmd+K as primary), Attio, Notion.
5. The sidebar collapses to an icon rail, and the rail is what phones and iPads get. Asana (icon rail that expands), Vercel (resizable, hideable), Polar (collapse toggle), Attio, Ramp, Triple Whale.
6. Page header anatomy is fixed: icon + title left, actions right, tabs underneath, control bar (date range, view, filters) as a single row of pills under the tabs. Stripe, Polar, Northbeam, Triple Whale, Asana, Vercel.
7. Date range and comparison are one pill, not a form. Stripe ("Date range | Last 12 months"), Polar (From/To vs. range), Triple Whale ("Today" + compare toggle), Northbeam ("7 Day").
8. Saved views beat filters. Northbeam (view chips + SAVE), Polar (Views dropdown), Notion (view pills), Attio (view settings), Linear (Views).
9. KPI tile = small grey label, big number, one delta chip, optional sparkline; tiles sit in a row with no heavy card border on light themes and a one-step-lighter surface on dark. Stripe, Triple Whale, Polar, Motion, Sandcastles.
10. Colour is for status and one accent, never decoration. Stripe ("reserved for status"), Mercury ("red and yellow only for errors and warnings"), Linear (one indigo), Vercel (gray roles + one hue at a time), Notion, Attio. Gradients appear only in marketing or on chart strokes (Triple Whale sparklines).
11. Dark themes are built from a neutral graphite scale with alpha-white hairlines, and elevation = a lighter surface, not a shadow. Linear (0.05 / 0.08 borders, surface alpha steps), Vercel (gray 100 to 1000 roles), Triple Whale dark, Sandcastles, Asana dark.
12. Tables for money and records, cards for creative and media. Mercury, Stripe, Attio, Northbeam, Asana list = tables; Motion, Sandcastles, Later = cards because the thumbnail is the content.
13. Row detail opens as a side peek (right drawer), not a modal; modals are for create/confirm/destructive. Notion (side peek default), Attio, Asana task pane, Mercury transaction drawer, Linear split, Motion creative drawer, Sandcastles video drawer.
14. On phones, detail and pickers come up from the bottom as sheets or stacked cards, with swipe to dismiss. Stripe iOS ("stacked rounded cards"), Things 3 (popovers, pull-down Quick Find), Later composer, Linear mobile.
15. A bottom tab bar with 4 to 5 items plus a floating create button is the phone shell; the exception (Things 3) still floats a "+" bottom right. Stripe, Asana, Later, Mercury, Vercel (floating bottom bar), Linear (custom tab bar).
16. Type is a single sans (Inter or an Inter cousin) at 13 / 14 / 16 with semibold rather than bold; numbers are tabular; negative tracking only above 20px. Linear (510/590, never 700), Notion (500/600), Vercel (label-14 most common, label-13 tabular), Attio (500 default), Stripe.
17. Radius is small and consistent: 6px controls, 8 to 12px cards and menus, pills for chips. Linear, Vercel materials, Notion, Mercury, Stripe.
18. Empty states say what the thing is and give one action, inline where the content would be. Stripe (zeroed metrics + "make a test payment"), Attio ("You have not created any exports."), Asana (template picker), Notion (block menu).
19. Loading = skeleton or blurred placeholders in the final layout, never a spinner page. Triple Whale (blurred tiles), Attio and Linear (skeleton rows), Stripe (custom loader in lists).
20. Motion is short, eased out, and only on state changes; keyboard actions never animate. Superhuman, Linear, Emil Kowalski's rules (under 300ms, ease-out, transform/opacity only, respect prefers-reduced-motion, https://emilkowal.ski/ui/great-animations), Stripe iOS (chart slide on range change).

---

## What this means for Locus

### Navigation model
- Desktop (>= 1100px): one left sidebar, 240px, collapsible to a 56px icon rail. Order top to bottom: brand/client switcher (with "Agency view"), Search (Cmd+K, shows "K" hint), then personal: Home, Inbox/Tasks; then the brand's questions as sections (Overview, Day check, P&L, Goals, Customers, Creative, Social, Calendar, Work); then Settings, Help, Data at the bottom as a "lower nav". Max depth: section > page > tab. No right sidebar.
- Cmd+K palette: fuzzy, aliases, recent first, shows shortcuts, ~5 rows visible, icon per row, every brand and page reachable (Superhuman rules above).
- iPad (768 to 1099px): icon rail only, labels on hover/long press; same page anatomy; drawers overlay the content.
- iPhone (< 768px): bottom tab bar with 5 items (Home, P&L, Creative, Work, More) plus a floating "+" above the bar; the sidebar becomes the "More" sheet. Everything secondary (pickers, row detail, filters, create) is a bottom sheet with a drag handle and swipe to dismiss (matches the existing phone.js bottom sheets and Cole's "pops up from the bottom" rule).

### Page anatomy (every page, no exceptions)
1. Header row (56px): page icon + 22px title left; actions right (primary button, kebab).
2. Tabs row (40px) when the page has views; accent underline, 14px / 500.
3. Control bar (40px): one row of pills: date range + compare, saved view, filters, brand (in Agency view). Wraps to a horizontal scroll on phones.
4. Content: KPI row (4 to 6 tiles) > primary chart or table > secondary sections, each with a 16px / 600 section title and a kebab.
5. Side peek (420px right drawer) for any row or card detail; modal only for create, confirm, destructive.

### Type scale (Inter, px / weight / line-height)
- 11 / 500 / 1.4: micro labels, rail labels, chip text
- 12 / 500 / 1.4: column headers, tertiary meta, badges
- 13 / 400 / 1.5: table cells, secondary text, captions
- 14 / 400 / 1.5: body and menus (most common); 14 / 500 for UI labels and tabs
- 16 / 600 / 1.4: section titles, card titles
- 20 / 600 / 1.3: KPI numbers in cards, drawer titles
- 22 / 600 / 1.25: page title
- 28 / 600 / 1.2: hero KPI numbers (Overview), letter-spacing -0.01em
- 36 / 600 / 1.1: single headline number (Day check verdict), -0.02em
- Numbers always `font-variant-numeric: tabular-nums`. Never 700. Never below 11.

### Spacing scale
4, 8, 12, 16, 24, 32, 48. Row height 40 (tables 36 dense / 44 comfortable), control height 32, button padding 8x14, card padding 16, section gap 24, page gutter 24 desktop / 16 phone, sidebar item 32 tall with 8px x-padding.

### Radius
4 chips and inline tags, 6 buttons/inputs/tabs, 8 cards and dropdowns, 12 panels, drawers and modals, 16 bottom sheets (top corners), 9999 pills and avatars.

### Colour rules (dark graphite stays)
- Neutral scale with fixed roles (Vercel style): bg-100 page, bg-200 sidebar/card, bg-300 hover, bg-400 active; border-1 = white 6% (hairline), border-2 = white 10% (focused/hover); text-1 #f3f4f6, text-2 #a1a6ad, text-3 #6b7078.
- Elevation = lighter surface, not shadow; shadows only on floating layers (menus, palette, sheets) and kept under 0.4 alpha.
- One accent per app (the existing per-app accent token) for: primary button, active tab underline, active sidebar item icon, links, focus ring. Nowhere else.
- Status colours only: green (up/good/live), amber (watch/pending), red (down/bad/error), blue (info/new). Deltas use text colour + a tiny chip, not coloured backgrounds, except pills in tables.
- Gradients: allowed only on chart strokes and the brand mark; never on chrome, cards or buttons.
- Light mode: same roles inverted from the same tokens, no separate palette.

### Component list (the whole kit)
Sidebar + rail, command palette, page header, tab bar, control bar pill (date, compare, view, filter), KPI tile (label / number / delta / sparkline), stat row, chart card (title, legend, kebab), data table (sticky header, tabular numbers, row actions on hover, inline empty text, skeleton rows), creative card (thumb, status pill, 2-col metrics, meters), list row (avatar/thumb, title, meta, status pill), side peek drawer, bottom sheet, modal (create/confirm), menu, select, chips, toggle, badge, toast, empty state (one line + one button), skeleton, segmented control, breadcrumb.

### Motion rules
- Durations: 120ms hover/press, 160ms menus and tooltips, 200ms side peek and tabs, 240ms bottom sheet and modal, 300ms page transitions max.
- Easing: ease-out (cubic-bezier(0.2, 0, 0, 1)) for enter, ease-in for exit; springs only on phone sheets (damping high, no overshoot on data).
- Animate only transform and opacity; never height/padding; chart range changes slide and fade the series instead of re-rendering blank.
- Keyboard-triggered actions and table re-sorts do not animate.
- Respect prefers-reduced-motion by swapping to 80ms opacity fades.
- Sidebar collapse, tab underline, side peek, sheet, palette, toast are the only things that move on desktop.

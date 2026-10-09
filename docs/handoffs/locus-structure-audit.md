Paste everything below this line into a new Claude Code chat in the Mobius Digital Tools folder.

---

Full structure audit of Locus: every rail item, every page tab, every Settings section and Integrations. Do step 1 (the audit and a proposed new structure) and stop for my sign-off before mocking or building anything. Lineup is moving in through a separate chat (docs/handoffs/lineup-into-locus.md); leave room for it and for Pulse, but do not build them here.

READ FIRST
- profit/CLAUDE.md (all of it: v2/v3 look, the rail, page tabs, brand vs agency settings, Products, Season, Scenarios, Strategist).
- docs/locus-hub/product-map.md (every page, who reads it, what question it answers) and docs/locus-hub/research-v3.md.
- Memory notes: locus-brand-first (brands own their id; connections are the one source of truth), locus-hub-plan, locus-v2-redesign, simplicity-over-features, feedback-answer-the-phase-asked, adset-first-rule, bfcm-2026, mobius-team.
- docs/handoffs/supply-audit.md and supply-mock-audit.md: how the last audit went wrong at first (judged on clicks, not need; no category research; thought like one brand, not an agency). Do not repeat that.

WHAT I SAID (Cole, 2026-10-09), in my words, sorted

Rail and pages
- Home should be ONE central dashboard. Overview and maybe P&L belong; Plan, Season and Scenarios do not.
- Plan has to move somewhere that makes sense.
- Season: I like it. I want a Black Friday WAR ROOM (name can change with the season), maybe its own destination: everything we need to be ready, like Triple Whale's own BFCM war room. I will show you theirs and have a separate conversation about it.
- Scenarios are calculators. Maybe a Tools destination (Pulse would go there too when it moves in).
- I want a "was it a bad day" view: every day, for every brand, was yesterday a bad day. A brand called Breezeway does this well; I will send the link. Describe how it works and how ours would. (Locus already has "What moved yesterday" on Home and in Slack at 8am: say whether this replaces it, extends it, or sits beside it.)
- Creative should be only Studio, Library and Inspiration.
- Tests and angles is an ADS thing (angles, strategy), not Creative. It should be just tests and angles, not media-buying decisions.
- There is no place for the MEDIA BUYER's daily decisions: open Locus, see what to scale, cut, fix today, ad set first (the doctrine). That needs its own page or destination. Where is it?
- Brand (research, voice, client answers), Copy desk and Creator link: where do they belong? Brand info probably is not Creative. Maybe a Brand destination, maybe parts in settings. Decide.

Settings and Integrations
- Rename "Connections" to "Integrations".
- About the brand shows the Meta ad account, the Triple Whale shop and Shopify. Those are integrations, not "about the brand". Move them.
- Google Ads shows twice: one row "Google Ads" (Triple Whale) and one "Google Ads account (direct)". Confusing. One Google Ads integration, explained in plain words.
- The "direct" integrations (Google Ads, GA4, Search Console, TikTok) do not give me a link to where I go to grant access or find the id. Every integration needs the exact link and the exact steps, and the options to pick from when Locus can list them (it can list Google Ads accounts under our manager, GA4 properties and Search Console sites the service account sees).
- Email and SMS only offers Klaviyo. Ice & Gold uses Attentive. Add Attentive as a choice and say plainly what Locus can and cannot read from it.
- "Data repairs": I do not know what it is for. "Remove from Locus": unclear, and its icon is odd. "Data check" and "Cost check": funky. Rename, merge or move them so a person knows what each does.
- Icons: none of them say what the thing is, and some repeat. Every icon must mean its item, no repeats.
- Did anyone audit settings top to bottom? Do it now: every section, every field, who uses it, how often, keep / merge / move / cut.

Agency first
- Look at every page from the agency's side (all clients, the team: Ahsan and Noma strategists and media buyers, Ravo editor) and then what a single brand view needs. Lucky is the deepest brand; build for every brand.

LINKS AND REFERENCES (from Cole)
- Breezeway "was it a bad day": https://headwinds.breezeway.co/ . Study what it shows and how it decides a bad day. Ours should be far better: more intuitive, more data (every brand, every channel, the reason, what changed), built on what Locus already has (What moved, the Change Log, Triple Whale, the platforms).
- Black Friday war room: look at Triple Whale's own BFCM material (its BFCM war room / dashboards / benchmarks; the Triple Whale MCP knowledge base and their public pages). Ours should be far more useful: built on Season (offers, gantt, goals, desk), Products (stock at risk by Cyber Monday), live sales against goal by hour, ads pacing, email sends, and what to do next.

STEPS
1. Audit: every rail item, page tab, card, settings section and integration: what it is for, who needs it, how often, keep / merge / move / cut. Research what the best tools do (Triple Whale, Northbeam, Motion, Polar, and Breezeway once I send it). Propose ONE new structure: the rail, the tabs under each, and Settings / Integrations, with the reason for every move. Stop for my sign-off.
2. Mock the new structure (rail, Home, the media buyer page, Integrations, Settings) for approval.
3. Build it: moves first (routes keep working: every old page id still routes), then the new pages (media buyer daily, bad day, war room shell, Tools).
4. Strategist: knows the new map (ASK_SUGGEST, PAGE_BRIEF, the tour).

LOCUS RULES
- Brand-first: key everything on the Locus brand id; integrations live in `connections`.
- Fetch and merge origin/main before deploying any worker; other sessions deploy from this tree.
- Every old page id keeps routing (deep links in Slack and briefs).

HOW I WORK
- Short bullet replies in plain words: what changed, what I need to do. No jargon.
- No em dashes anywhere. In-app modals only. Just do it: deploy, commit and push without asking; stop only for money, client-facing or destructive actions.
- My ideas are questions, not orders: push back if something adds clutter.

Paste everything below this line into a new Claude Code chat in the Mobius Digital Tools folder.

---

We are moving Lineup (the marketing calendar) into Locus, rebuilt and simplified, the same way Supply moved in on 2026-10-08. Do step 1 (the audit) first and stop for my sign-off before designing or building anything.

READ FIRST
- profit/CLAUDE.md: the v2/v3 look, the rail, page tabs, brand vs agency settings, and the last two sections: "STOCK, BUYING AND DROPS" (how Supply moved in: the pattern to copy) and the Season tab section (the BFCM plan already in Locus).
- The memory notes marketing-hub, launch-calendar, lineup-overhaul, locus-brand-first and supply-into-locus.
- docs/handoffs/supply-audit.md and supply-mock-audit.md: how the last audit was done, and the mistakes it corrected (judge on NEED, not clicks; think like an AGENCY first, then what one brand needs on top; research what the best tools in the category do before mocking).

WHAT LINEUP IS
- marketing-hub/ (Next.js on Workers via OpenNext), deployed as the worker named `launch-calendar` on purpose (it owns the URL Google sign-in is registered for), D1 `marketing-hub`. Brands are rows; routes under /b/<slug>/. Stage board, drag-to-move calendar, /all agency view, Slack notifications, editable channels, PWA install.
- The Daily Brief engine reads its calendar (account-health `CAL` binding, calendarEvents / calendarWeights) to lift forecasts on launch and promo days. That must keep working.
- Supply's Drops (new designs by drop date) now live in Locus under Products. Lineup holds what a customer sees on a date; a drop's on-site date belongs on the calendar.

WHAT I WANT (Cole)
- One place: the calendar becomes a Locus page, not its own app. Lucky and every client.
- Look at it from the agency's side first: what every client needs on a calendar (launches, promos, emails, ad pushes, Black Friday), then what Lucky needs on top.
- Tie it to what Locus already knows: Season (BFCM plan), Drops (on-site dates), Email (Klaviyo sends), the Change Log, What moved.
- Simple, visual, easy to read. Fewer screens. Push back on anything that adds clutter.

LOCUS RULES THAT APPLY
- Brand-first: key everything on the Locus brand id (brand_lucky_golf...), never an outside id. Read the one brand list.
- Fetch and merge origin/main before deploying any worker; other sessions deploy from this tree.
- The Strategist gets a view of the calendar plus its knowledge, in the same change (the rule: every new connection ships with its knowledge).

A PARALLEL CHAT is auditing the whole Locus structure (docs/handoffs/locus-structure-audit.md): the rail, where Season,
Plan and Scenarios go, a Black Friday war room, a Tools section. Before proposing where the calendar lives, read that
brief and anything it has committed since (git log, profit/CLAUDE.md); if the placement is still open, propose one
and say it depends on that audit.

STEPS
1. Audit: every Lineup screen and feature, what it is for, whether an agency and a brand NEED it, keep / merge / cut, plus what the best tools in the category show. Stop for my sign-off.
2. Mock the Locus page(s) on real data for my approval.
3. Build in Locus on the same D1, so nothing is lost (the Brief's CAL binding keeps reading it).
4. Strategist view + knowledge.
5. Retire the old app after the team has used the new page for a week (keep the worker if the Brief still needs it).

HOW I WORK
- Short bullet replies in plain words: what changed, what I need to do. No jargon.
- No em dashes anywhere. In-app modals only. Just do it: deploy, commit and push without asking; stop only for money, client-facing or destructive actions.
- My ideas are questions, not orders: push back if something adds clutter.

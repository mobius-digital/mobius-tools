# Locus UX / UI / efficiency audit, handoff (2026-10-20)

The audit page is the deliverable: https://claude.ai/artifact/M5QhcBYdD8ueFq8LJPFYWa (source `docs/locus-audit/index.html`).
It holds Cole's words as the yardstick, the diagnosis, findings per screen (every rail item, Agency view and a client, 1440 / 1024 /
390), research on fifteen products with pictures, the design system (nav model, page anatomy, type, colour, components, motion, copy
voice, connective tissue), before / after mocks (Home, Meta, Reports, Tasks, the Monday call, Social Watch, the iPhone shell), the
leaks decision, the build order (phases 1 to 6) and the competitor trials wanted. The sibling session's teardown of Later, Sandcastles
and Virlo is folded into the Social finding: https://claude.ai/artifact/N3GWj34WJnJFjAYij5KKEh.

## Decisions
- One shared skeleton for every page: `profit/lx.css` (look) + `profit/lx.js` (behaviour). Tokens only, Inter, graphite v2, one accent
  for chrome. Phone rules stay in `phone.css` (loaded last).
- Page header: one row (crumb, title, the page's actions, Export, "..." with purpose + Tour / Metrics / Help). No subtitle paragraph, no
  helper pills in the content column.
- Leaks: a one-line strip on the pages where a leak lives (Home, Meta, Google, TikTok, Website, Email), the full ranked list on
  Home > Leaks. The Day check stays about yesterday.
- Platform jobs are a segmented control; page tabs are underlined text; one side panel (`V2.panel`) that is a bottom sheet on a phone;
  every phone popover goes through `LxPhone.open`.
- The 56px icon rail for iPads is phase 2 (menus clip inside a 56px rail without a portal); phase 1 only tightens the rail on short
  windows.

## Phase 1 (built, PR from branch claude/locus-ux-audit-f834ed)
Files: `profit/lx.css`, `profit/lx.js` (new); `profit/index.html` (links, pageHead, pageActions, the `leaks` page id in NAV / VIEW_BOTH /
SHOWABLE / `?open=` / show() / TAB_* tables), `profit/v2.js` (home, meta, `leaksPage`, `V2.panel` export), `profit/leaks.js` (`strip`,
`brands` row click, exports), `profit/phone.css` (header grid, Export column, the "..." sheet), `profit/accent.js` (`leaks`).
Checked locally with real data at 1280 / 768 / 390, Agency view and Lucky, dark and light; after-screenshots in
`docs/locus-audit/shots/after-*.jpg`.

## Phases 2 to 6 (not built; the audit page has the mocks)
2. Work on the kit: Tasks (four pills, side panel), Meetings, the call screens, the Production card; the iPad icon rail.
3. Reports, Daily Brief and Dashboards on the kit; one report reader.
4. Social rebuilt around the five jobs (Watch, Saved, Scripts, Week, Results), the teardown rules applied.
5. The copy pass (voice rules on the audit page) and empty states.
6. iPad and iPhone pass across every page; day lists instead of hour grids on a phone.

## Testing recipe that worked
Static python server on a spare port from the worktree + `profit-worker-dev` (:8799) + `ah-worker-dev` (:8798) with the dev token in
the gitignored `.dev.vars`; Chrome in Cole's profile with `pf_worker` / `pf_ah` / `pf_token` in localStorage; an iframe harness page
served from the SAME origin for 768 and 390 (so `contentDocument` is reachable). `find` in Claude in Chrome spends model calls; use
coordinates or `javascript_tool`. A new Chrome tab group starts with empty localStorage: set the three keys again.

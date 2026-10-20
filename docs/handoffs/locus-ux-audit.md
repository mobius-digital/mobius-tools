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

## Phases 2, 3, 5, 6 (built 2026-10-20 in the same PR, no worker changes)
2. Work on the kit. `tasks.js`: host header + one `+ Task` action, one control row (List / Board / Calendar segmented,
   Group / brand / area / mine pills), sections as title lines, a task opens in `V2.panel` (editable title, source line with
   a way back: the call, Today, the leak), Board hides empty columns. `calls.js` + `callscreen.js`: host header, Present as
   the one action, step pills with "+N" overflow, sections = title + one caption, kit tiles and ad cards, rows with owner
   and date pills (no selects), sticky Back / Brand n of m / time / Next bar. `production.js` + `prodsheet.js`: host
   header + `+ New brief`, one pill row of filters, one status chip per card, sheet fields as pills with a shared date
   menu; the save body is unchanged. The iPad icon rail IS done (lx.css + lx.js, `html.lx-irail` between 721 and 1180px): a 56px column of icons, the
   logo / client picker / account button expand it over the page (body.nav-open, the old drawer's state and scrim), a pick
   closes it; the two rail menus open inside the expanded rail, so nothing clips. Shots: `after-ipad-rail-1024.png`,
   `after-ipad-rail-open-1024.png`.
3. Reports: four numbers on top, Summary, The week, Best and worst ads (cards that open the ad in the side panel, the
   detail window on the client archive), everything else under "More detail"; status is one chip in the control row;
   Send / Edit / More in the page header. Daily Brief and Dashboards: actions in the page header through hidden
   originals (`press()` pattern: the header buttons click the page's own buttons, every handler untouched).
   Follow-up PR (2026-10-20, branch claude/locus-ux-followups): a finished call appends its team jobs, briefs and promises to the
   brand's buyer note (account-health callscreen.js `appendBriefNote`, settings `briefNote:<brand>`, deployed), so the Brief's
   "What we're doing" carries them; Home > Leaks has "Put it on the call" (leaks.js sets `window.CCALL_ADD`, callscreen.js adds
   the promised line and opens on This week); Today's calls rows are one primary + Done + a "..." menu (desk.js, a bottom sheet
   on a phone whose buttons press the row's own).
4. Social: the sibling session's branch `claude/social-teardown-51ff4c`, not this PR.
5. Copy and connective tissue: Find reaches open tasks and Production cards (team only, one read per 5 minutes); a leak
   row has "Make it a task" (POST /api/actions, source `leak`); empty states one line + one verb across the rebuilt pages.
6. Phone: under 600px `.v2tiles` is a list of 48px rows (label left, number + change right; the hero tile keeps its card;
   `.sub` and the sparkline wait for the panel); the "..." menu is an `LxPhone` sheet. Real-device pass is Cole's.
Verified locally with real data (Reports / Brief need the dev account-health worker: in the page, route the PROXY_PATHS
to `apiAH` from the console, since the dev profit worker proxies them to production). Phone shot:
`docs/locus-audit/shots/after-phone-tiles-390.png`.

## Testing recipe that worked
Static python server on a spare port from the worktree + `profit-worker-dev` (:8799) + `ah-worker-dev` (:8798) with the dev token in
the gitignored `.dev.vars`; Chrome in Cole's profile with `pf_worker` / `pf_ah` / `pf_token` in localStorage; an iframe harness page
served from the SAME origin for 768 and 390 (so `contentDocument` is reachable). `find` in Claude in Chrome spends model calls; use
coordinates or `javascript_tool`. A new Chrome tab group starts with empty localStorage: set the three keys again.

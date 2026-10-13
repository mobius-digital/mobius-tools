# Work in Locus, v3: Calls, Tasks, Production (handoff, 2026-10-13)

Start a worktree. Read this whole file, then `docs/handoffs/work-in-locus.md` (stage 1 and stage 2 history),
profit/CLAUDE.md and account-health/CLAUDE.md under 2026-10-13. Cole APPROVED the layout below on 2026-10-13. Build it
top to bottom, deploy, commit, push, then report in short bullets (what changed, what Cole must do).

**The approved mock (match it):** https://claude.ai/artifact/QFzWFes5eRwKNXNXm1xcPV (Design canvas, three artboards:
Calls, Tasks, Production, plus a sticky on where items go). Read it with the Artifact tool, `action: "read"`, and the
`path`s `project/Calls.dc.html`, `project/Main.dc.html` (Tasks), `project/Production.dc.html`. The sample data in it is
made up; the layout, columns, controls and copy are the spec.

House rules: no em dashes anywhere; in-app modals only (never prompt/alert/confirm); v2 tokens only (no hex in
Locus CSS); Cole wants short bullet replies; deploy, commit and push without asking.

## Why (Cole, 2026-10-13)

The one Action items page mixed two different things and the tasks were "super long lists" to click through. Cole:
"the calls and the tasks should be separate." He wants views like Asana and ClickUp ("if people like lists, okay. If
people like boards, okay. If people like a calendar view, okay"), and asked whether ad production is its own pipeline
or a tag. Answer, approved: three shapes, three places.

- **Calls** are an inbox: read once, approve, done. Nothing lives there.
- **Tasks** are a workspace: the same tasks shown as a List, a Board or a Calendar, grouped how you like.
- **Production** is a pipeline: an ad moves Brief > Making > Review > Ready > Live. A task is only open or done, so
  tasks never get stage columns; ads do.

## The rail

Work group with three items (replaces the single `railWork` "Action items" button, profit/index.html ~line 2236 and
`NAV.work` ~line 4808): **Calls** (`calls`), **Tasks** (`tasks`), **Production** (`production`). Keep `actions`,
`monday`, `meetings` routing: `actions` -> `tasks`, `monday`/`meetings` -> `calls`. `?open=actions&item=` (Slack
reminder links, `itemUrl` in account-health actions.js) must still open the item, so either keep it working via the
redirect or change `itemUrl` to `?open=tasks`. All three in AGENCY_TABS (team only). Update TAB_TITLE, TAB_CRUMB,
TAB_WHO, SHOWABLE, the `?open=` list (~2537), the show() map, PAGE_BRIEF, the GUIDE entry (~5716).

## Calls (profit, split out of actions.js)

- Header "Calls" + one line, Brand filter.
- "Waiting on your OK" with a count. Each call awaiting confirm = one card: brand mark, "Dartee Golf with Mike", date,
  length, Transcript link, the AI summary (2 lines), then a table with column headers **Item / Goes to / Who / Due**,
  rows grouped under Mobius does / New ads / Client does / Client reads, a tick per row (unticked = dropped), each
  cell editable in place. "Goes to" reads `Tasks · Ads`, `Production · Brief`, `Requests`, `Next report`.
  Buttons: **Approve N** (primary) and **Skip this call**. Only the first call is open; the rest are one-line cards
  with counts and a Review button.
- On Mondays keep the Monday numbers block (it lives in actions.js today) at the top of Calls.
- **History** table under it: Date, Brand, With, Length, What it made ("5 tasks · 2 briefs · 1 report item"),
  Status ("Approved by Cole, Oct 9" or Skipped), Open. Read from p_meeting (status confirmed/skipped) and count
  what each made (p_action.source_id = meeting id, briefs by kind).

## Tasks (profit)

- Header "Tasks" + summary line ("12 open, 2 late, 2 waiting on clients") and **Quick add** (labelled input + Add).
- **View: List / Board / Calendar** (segmented). **Group by: Brand / Person / Due / Area** (segmented). One Group by
  drives both the list sections and the board columns (the ClickUp model). **Only mine** chip. **Area** chips:
  All, Ads, Email, Organic, Site, Ops, Client. Remember view, group, area, mine in localStorage (try/catch).
  Default: List grouped by Brand.
- **List**: column headers Task / Brand / Area / From / Who / Due; one card per group with its count; round tick at
  the left; due in coral when late, yellow when today; "Done this week · N  Show" at the bottom.
- **Board**: a column per group value, cards show title, area tag, brand, avatar, source, due; "+ Add" at the foot
  of each column (prefills that group's value). Dragging a card between columns changes that field (brand, owner,
  due bucket or area); keep it simple, no reordering inside a column.
- **Calendar**: week grid Mon to Sun plus a "Later / no date" column, today highlighted; Week / Month toggle.
  Drag a card to a day to change its due date.
- **Waiting on client**: client_owes items (and Requests asks still open) as the last group (list) / last column
  (board), coral dashed tick. They are not the team's to tick; they close when the client marks the ask done.
- Clicking a task opens the existing edit modal (text, owner, due, area, brand, done).

### Area (new field)

- Add `area TEXT NOT NULL DEFAULT ''` to `p_action` (account-health actions.js SQL; ALTER on first use like the
  other tables do). Values: `ads | email | organic | site | ops | client`.
- Set it on confirm from the extractor: add `area` to the meetings.js SCHEMA for Mobius does items, with one line of
  guidance per area (Ads = budgets, launches, naming, audiences; Email = flows, campaigns, Klaviyo; Organic = social
  posts; Site = discounts, pages, offers, theme; Ops = admin, setup, docs, Amazon listings; Client = sending or
  sharing something with the client). Judge from context, no keyword lists (Cole's rule).
- Quick add: one cheap model call (Haiku 5.5) parses "Dartee raise Prospecting 1 to $400/day by Wed" into brand,
  owner, due, area, text; fall back to the raw text if it fails. Old rows with area '' show under "Other" until
  edited; do a one-time backfill with the same parser.

## Production (the ad pipeline; this is stage 2 of the old handoff)

- Header "Production" + summary ("11 ads in progress, 2 ready to launch"), "Mirrored to Asana · synced N min ago",
  **+ New brief**.
- Filters: Brand chips, Format chips (Static, Video, UGC, Carousel).
- Five columns: **Brief** (written, not started), **Making** (in the studio), **Review** (Cole or client notes; one
  column covers both, Cole's call), **Ready** (approved, not launched), **Live** (in the account). Cards: brand code +
  number ("DG #48"), format tag, title, assignee avatar, due or status line (coral + coral border when late), an
  action link where it fits ("Open review" on Review, "Launch to Meta" on Ready, which opens the existing Launch to
  Meta flow). Drag between columns.
- Data: the board is a VIEW over `p_br_batch` (numbered tests, filled today by the Asana sync in asana-brand.js), not
  a new copy. Today's stages there are idea / production / live / done (`stageOf`, from the Asana section name).
  Add the finer stage Locus needs (a `board_stage` column or reuse `stage` with new values; check every reader of
  `p_br_batch.stage` first: the brand library, results, Brief, Strategist tools). Keep `numOf` numbering and
  `nextNumber` for new briefs.
- **Asana during the transition:** the team still works in Asana for a few weeks, so it must stay correct both ways:
  a drag in Locus moves the Asana task to the matching section; a move in Asana still flows in through the existing
  sync. Before mapping, LIST the real section names in each connected brand project (they differ) and map each to a
  column; a column with no matching section just updates Locus. "+ New brief" and "New ads" items from a call
  approve create the Asana task the way `makeBrief` (meetings.js) does today, plus land in the Brief column. Later
  (Cole decides) the mirror is cut and Asana archived.
- Slack: a stage change posts one line in the brand's internal channel (the reminder plumbing in actions.js shows
  how); do not build threads or buttons for it yet.

## Where an approved call item goes (unchanged rules, new homes)

- Mobius does -> `p_action` kind team, with `area` -> **Tasks**.
- New ads -> numbered brief (Asana task via `makeBrief` + `p_action` kind brief today) -> must show on **Production**
  in Brief. Decide whether the kind brief p_action row is still needed once Production reads p_br_batch; if not,
  stop writing it and keep old rows out of Tasks.
- Client does -> Requests ask (`createAsk`) + shown in **Waiting on client**.
- Client reads -> the weekly report's this_week.

## Keep working (do not break)

- account-health actions.js: `actionTick` reminders (7am to noon Central), the Done button (`act_done_<n>` through
  the mobius-slack router), the ✅ reaction (`handleReaction`), `/api/actions` and its `waiting` list.
- Today's "Something else" posts to `/api/actions`.
- Tests: test-actions.mjs, test-clients, smoke, today. Add tests for area, quick-add parsing fallback, and the
  Production stage mapping.

## Done means

- Both workers deployed (merge origin/main first), the profit page live, both CLAUDE.md files and this handoff's
  progress note updated, committed and pushed (push via the `gh auth git-credential` helper).
- Report to Cole in short bullets: what changed, what he must do (likely: drag one real brief through Production and
  check Asana followed; say when to cut the Asana mirror).

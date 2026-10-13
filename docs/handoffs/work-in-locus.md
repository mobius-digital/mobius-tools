# Work in Locus: action items, calls, then briefs (handoff, 2026-10-13)

> **Progress (2026-10-13): stage 1 BUILT and deployed.** `p_action` + `/api/actions` (account-health actions.js), meetings.js
> confirm / openItems / add / done on p_action, the hourly `actionTick` reminders with Done buttons and the ✅ reaction (router
> patched for `act_done` and reaction events), Work rail item (Calls = meetings.js, Action items = profit/actions.js), Today's
> "Something else" -> /api/actions, How we work inside How to use Locus. Tests: test-actions.mjs (6), test-clients (24), smoke
> (113), today (3). Not built: auto-done signals, the Asana mirror. Open for Cole: subscribe the Slack app to `reaction_added`
> (+ `reactions:read`) so a ✅ works; stage 2 after a week. Details in both CLAUDE.md files under 2026-10-13.
> **Second pass (same day, Cole: "Work" meant nothing, the confirm screen was clunky):** one rail item **Action items** (calls to
> approve on top as skim-and-approve cards with an "Approving will" summary, the list below, Monday numbers on Mondays);
> Brief items from a call become numbered Asana briefs. meetings.js (front end) deleted.

Start a worktree. Read this, then profit/CLAUDE.md "2026-10-13: Meeting notes, the Monday call page, How we work"
and account-health/CLAUDE.md "2026-10-13: MEETING NOTES". Cole's decisions are final; the design below is the plan.

## Cole's decisions (2026-10-13)

1. **Action items live in Locus, not Asana.** The Asana round trip (Locus writes a task, reads it back, reminds in
   Slack) is pointless when Locus is the one tracking. Cole: "if there are tasks inside Locus, why aren't we moving
   everything inside Locus."
2. **Perfect world: Locus owns the work, not Asana.** Clients do not use Asana. The team does, for briefs and
   creative production. Locus already holds the brief (test library), the results, Studio, Launch to Meta, the
   calendar and the action items; Asana is a second copy that drifts. So: stage 1 action items now, stage 2 briefs
   and the production board in Locus with a one-way Locus -> Asana mirror for a few weeks, then cut Asana. Do not get
   stuck on migration; the only real risk is a rough first few weeks for William and Ravo, which the Slack-driven
   flow (every task posts in the brand channel with buttons) covers.
3. **A new rail item, `Work`** (its own place on the left, not under Home and not under Reports). Pages: `Calls`
   (the Monday agenda on top on Mondays, then every call's notes), `Action items` (per brand and agency-wide: owner,
   due, done, where it came from). Stage 2 adds `Briefs` (the production board). Team only for now
   (`AGENCY_TABS`); clients keep getting their side through Requests and the weekly report's "This week".
4. **How we work** moves out of Agency settings into How to use Locus (`show('guide')`, the GUIDE array in
   index.html). It is a reference page; `profit/sop.js` already renders it (`SopPage.html()`).
5. **Every Fireflies call is read** (about 13 cents an hour of call, measured: 74 min = $0.16, 48 min = $0.10; at
   15 hours a week about $8 a month). Cole confirms each call on the page; nothing is written before that. Keep it.

## Stage 1: action items in Locus (do this first)

Table `p_action` on the shared D1 (create on first use, like p_request):
`id, act_id ('' = agency), text, owner (first name), owner_email, due (YYYY-MM-DD), kind team|client|client_owes,
status open|done|dropped, source meeting|monday|today|strategist|manual, source_id (meeting id, today row key...),
asana_gid (only while the mirror runs), done_at, done_by, done_how (tick|slack|auto:<signal>), created_at, created_by`.

Replace in `account-health/worker/src/meetings.js`:
- `confirm()`: team items -> `p_action` rows (not `makeTask`). Keep the Requests `ask` for client_owes and the
  weekly report `this_week` write. The per-brand Slack note links each item to `?open=actions&act=`.
- `addItem()` (the Monday page's add box, Today's "Something else"): a `p_action` row.
- `openItems()` and `/api/meetings/done`: read and tick `p_action` instead of the Asana "Action items" section.
- New routes: `GET /api/actions?act=&status=`, `POST /api/actions` {act, text, owner, due, kind}, `POST
  /api/actions/done` {id, done}, `POST /api/actions/edit`. Admin, team only (not on CLIENT_RULES).
- Reminders (hourly tick, new `actionTick`): the morning of the due date, one Slack line per owner in the brand's
  internal channel (or DM, like morning.js, via `users.lookupByEmail` and the roster in meetings.js `ROSTER`), with
  "Done" as an Apply-style button (`act_done` action id routed through the Slack router like `idea_*`), and a ✅
  reaction on that line also marks it done (the events path in worker.js already indexes reactions? check; else
  poll reactions on reminder messages). Overdue: one line a day, never more.
- Auto-done signals (cheap, later): an item whose text names an ad set and the Meta sync shows it paused or its
  budget changed after the item was made; an item that says "brief" and a p_br_batch appeared for the brand after
  it. Store `done_how = 'auto:meta'` etc. Do not over-build: tick and ✅ cover 90%.
- The Asana mirror (optional, stage 1): if `settings.actionsMirrorAsana = 'on'`, also make the Asana task and keep
  `asana_gid`; default off. Probably skip.

Front end: `profit/actions.js` (own closure, `window.ActionsTab.render`): per brand (All clients = grouped by brand,
agency-wide first), open first, owner chips, due, "from the Dartee call Oct 12" source line, tick, edit, add. Reuse
the look of meetings.js `.mon-item`. Move the "Open action items" card off Meeting notes and the Monday page's
step 1 to read `/api/actions`.

Rail: `NAV.work = { label: 'Work', tabs: [['calls', 'Calls'], ['actions', 'Action items']] }` with a rail button
(copy the Calendar item's markup: `#railCalendar`, icon in the sprite), `AGENCY_TABS` + calls, actions; TAB_TITLE,
TAB_CRUMB, TAB_WHO, SHOWABLE, the `?open=` list, the show() map, PAGE_BRIEF. `calls` = meetings.js: the Monday agenda
(`renderMonday` content) on top when today is Monday (or the next Monday's prep from Friday), then the calls list +
confirm screen (`render`). Retire the page ids `monday` and `meetings` (keep routing them to `calls`). Remove the
'sop' section from SET_SECS / SET_GROUPS and render `SopPage.html()` inside the guide page instead.

## Stage 2: briefs and the production board in Locus (after stage 1 is live and used for a week)

- A `p_work` row per brief: number, brand, title, angle, concept, testing, lines, assignee (strategist / designer /
  editor), stage (Brief, Kickoff booked, In design, In review, Approved, Live, Judged), due per stage, comments
  (`p_work_msg`), attachments (R2), Frame link, the Studio batch id, the Meta ad ids once launched (p_launch), the
  verdict (p_br_batch). Most of this exists across p_br_batch / p_studio_batch / p_launch: the board is a view over
  them plus stage and comments, not a new copy. Read asana-brand.js (what the Asana sync writes and reads) before
  designing, and keep `numOf` numbering.
- Slack is the inbox: every stage change posts in the brand internal channel with buttons (Kickoff booked, Delivered,
  Approved); comments can be replied to in the thread (the Slack index already stores them).
- One-way mirror Locus -> Asana for a few weeks (tasks + section moves) so William, Ravo and the clients who do look
  see nothing change; then stop the mirror and archive the projects.
- The kickoff call agenda (sop.js KICKOFF) rides on the brief: "Kickoff booked" asks for the date; the Fireflies read
  of that call files its notes on the brief (kind `kickoff`, match by brief number in the title or transcript).

## What exists today (file map)

- account-health/worker/src/meetings.js: ingest (Fireflies GraphQL), extract (Sonnet 5.5, SCHEMA), confirm, openItems
  (Asana "Action items" section, to be replaced), mondayScreen, addItem, routes. Table p_meeting.
- account-health/worker/src/requests.js: `createAsk` (kind `ask`), the client's Done.
- profit/meetings.js: `render` (Meeting notes), `renderMonday` (Monday call). profit/sop.js: How we work.
- profit/desk.js today(): "Something else" posts `/api/meetings/add` (switch it to `/api/actions`).
- Test calls write Asana results through `/api/brand-asana/result` (asana-brand.js `setResult`); that stays until
  stage 2.
- Secrets: FIREFLIES_API_KEY set. Optional FIREFLIES_WEBHOOK_SECRET.

## Open questions for Cole (ask only if they block)

- Should a client ever see Action items for its brand? Default now: no (team only); the client gets "This week"
  and Requests.
- The Monday review AI post stays off; the Monday agenda is the strategists' plan plus Locus's numbers.

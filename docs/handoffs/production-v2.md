# Production v2: everything Asana still does for ad production, built into Locus, so Asana can go (handoff, 2026-10-13)

> **Progress (2026-10-13): mock published, waiting on Cole's OK.** https://claude.ai/artifact/Tw9a67Zb4qLg5ZgFDApUMj (Design
> canvas, four artboards: `project/Main.dc.html` brief sheet with Brief / Files / Comments tabs, `project/Review.dc.html`
> file viewer with comments, Approve and Ask for changes, `project/Client.dc.html` the brand edition board,
> `project/Mirror.dc.html` the Asana mirror switch). Sample data is made up. Build nothing until Cole approves it.

Start a worktree. Read this file, then `docs/handoffs/work-calls-tasks-production.md` (Production v1, live 2026-10-13),
profit/CLAUDE.md and account-health/CLAUDE.md (sections "Brand: research, angles and the creative roadmap", "ASANA IS
THE ONLY PLACE ANYONE TYPES" (2026-09-24, now being reversed on purpose), Studio v2 batches, the ideas bot, CLIENT
LOGINS / the brand edition, and the 2026-10-13 fourth pass). Cole said build it (2026-10-13). Before building, make ONE
mock page of the four screens below and publish it as an Artifact for Cole's OK (his rule: approve the layout first),
then build exactly that. Deploy both workers, commit, push, report in SHORT bullets.

House rules: no em dashes anywhere; in-app modals only (never prompt/alert/confirm); v2 tokens only, no hex in Locus
CSS; judge from context, no keyword lists for AI routing; simplicity over features. Deploy, commit and push without
asking; merge origin/main first. Commits end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Push with
`git -c credential.helper= -c credential.helper='!gh auth git-credential' push origin HEAD:main`.

## Why

Production v1 is a board over `p_br_batch`, mirrored both ways with Asana (account-health `src/production.js`, profit
`production.js`). Cole's plan: run both a few weeks, then archive Asana for production. Three things still live only in
Asana, and a fourth matters once Asana goes:
1. **Writing the brief.** The brief body (Angle, Why, Concept, What we're testing, the lines; `BRIEF_STATIC` /
   `BRIEF_VIDEO` in ideas.js, `briefFor` in asana-brand.js) is typed in the Asana task description or a Google Doc
   linked from it (`brief_url`). Studio, the tagger and the Strategist read it from there (`readDoc`, `brief_text`).
2. **Comments and review.** The back-and-forth on a brief or a finished ad (Ahsan to William: "the text is still not
   visible") happens in Asana comments or in the brand's Slack channel, which is the clutter Cole hates.
3. **Files.** Frame review links and finals are attached to the Asana task (`asset_url` is filled from it).
4. **The client's view.** Clients see production in Asana today ("visibility for all", 2026-09-24). Cole approved
   giving each client Production for its own brand.

## What to build

### A. The brief, written in Locus (the card opens a brief sheet)
- Clicking a card opens a side sheet (`V2UI.panel`, sheet mode): number, title, brand, format, owner, due, stage, then
  the brief in the team's framework fields: Angle, Why, Concept, What we're testing, the numbered lines (each: the line,
  a visual note, an optional inspiration image or link), post copy. Stored on `p_br_batch` (new `brief_json` column,
  guarded ALTER) and rendered to `brief_text` so every existing reader keeps working.
- "Write it with AI" fills empty fields from the brand brain (account-health `brain.js` `brandBrain` + `SPECIFICITY`,
  one Sonnet call, the same shape the ideas bot drafts); a person edits and saves. Never overwrite a field someone typed.
- While the Asana mirror is on: saving writes the brief into the Asana task description in the template layout
  (`html_notes`), and the hourly sync stops overwriting a brief that was last edited in Locus (compare an edited-at
  stamp). A Google Doc brief (`brief_url`) is read once into the fields on first open (`readDoc`) and the link kept.
- "+ New brief" on the board opens the same sheet empty (numbering via `nextNumber` as today).

### B. Comments on a card (replaces the Asana comments and the Slack back-and-forth)
- Table `p_work_comment` (id, batch_id, act_id, author email + name, body, created_at, kind comment | change_request |
  approval, attachments_json). A comment box on the sheet; `@Name` mentions the roster.
- A mention notifies the person by Slack DM (bot, `users.lookupByEmail`), one line with the card link, never a channel
  post. If the morning card (docs/handoffs/morning-card.md) is live, unanswered mentions also appear as a line on the
  next morning's card for that person.
- While the mirror is on, copy each Locus comment to the Asana task as a story (prefixed "From Locus, <name>:") and pull
  new Asana stories into the thread in the hourly sync, so nobody misses a comment during the transition.

### C. Files and review links on the card
- The sheet lists the card's files: Frame links (paste, or pick from the brand's Frame project through `frame.js`
  `/api/frame/children`), Studio ads tied to the test (`p_studio_batch.br_batch_id`), uploads to R2 (`MEDIA`,
  `work/<act>/<batch>/<name>`, 95MB cap, images and video). The first one is the card's `asset_url` ("Open review").
- Review column: "Open review" opens the file in the sheet (image inline, video player, Frame link out), with the
  comments beside it. Two buttons for the reviewer: **Approve** (moves the card to Ready, records who) and **Ask for
  changes** (requires a comment, moves the card back to Making, notifies the assignee).

### D. The client's Production (brand edition)
- `production` leaves `AGENCY_TABS`; a client login sees Production for ITS brand only. Server: add the read route and
  the client-safe writes to brandguard `CLIENT_RULES` in BOTH copies (`GET /api/production?act=<own brand>`, the sheet
  read, comments, approve / ask for changes on Review cards of their brand), and refuse everything else for a client in
  `handleProduction` (no drag, no new brief, no Asana, no Launch).
- What a client sees: the board without Asana links, internal assignee names shown as "Mobius", no costs; the Review
  column is labelled "Waiting for you" when a card needs the client's OK (a card flag `needs_client`, set by the team
  from the sheet: "Send to the client for approval"). Their Home "waiting for you" count (clients.js `waitingLine`)
  includes these cards. Comments from a client post to the brand's INTERNAL channel as one line (or the morning card
  thread if that exists), tagged to the card's owner.
- test-clients.mjs: the new routes answer a client for its own brand, refuse another brand, refuse drag / new brief.

### E. The cut-over checklist (do NOT cut; prepare it)
A section in Locus Agency settings > Integrations, "Asana mirror for Production": on / off (`settings.asanaMirror`,
on), what turns off when it is off (section moves, story copy, the hourly brief sync, `makeBrief` creating Asana
tasks; the tagger and results already read `p_br_batch`), and "Cards not yet in Locus: N" (open Asana tasks in the
creative sections with no `p_br_batch` row). Cole flips it when he is ready; nothing is archived in Asana by code.

## Tests and done
- New `test-production2.mjs`: brief fields round trip to `brief_text`, AI fill never overwrites a typed field, comments
  and mentions (DM mocked), approve / ask for changes moves the card and notifies, client scope rules, the mirror switch
  stops every Asana write. Keep test-production, test-actions, test-clients, test-smoke passing.
- Check the screens on a stub harness in the browser pane (light, dark, 375px, no page sideways scroll), then delete it.
- Update both CLAUDE.md files, the handoff's progress note and the `work-in-locus` memory. Report to Cole: what changed,
  and what he must do (open one real card, write a brief in Locus, send it to a client for approval; say when to turn
  the Asana mirror off).

# PLAN.md — Launch Calendar Build Plan

Produced at Fable checkpoint 1 (plan) per PRD §0. This plan is the working contract for the Opus build sessions. Follow it phase by phase, in order. Do not begin a phase until the previous phase's verification step passes. Re-read `PRD.md` before Phase 1.

---

## How to use this document (Opus sessions)

- Each phase below has **Scope**, **Tasks**, **Acceptance criteria**, and **Verification**. A phase is done only when every acceptance criterion is met and the verification steps pass.
- After finishing a phase: state what was built, run the verification, and summarize the result in 2–3 lines before starting the next phase.
- Stop entirely after Phase 5 and after Phase 10 — those are Fable review checkpoints run manually by the operator (`/model` switch). Do not proceed past a checkpoint on your own.
- After each review, a fix phase (5R / 10R) applies every numbered finding from the review file. Address each item and confirm it explicitly.

## Global rules (apply to every phase)

1. **Brand tokens.** Every color and font in the UI flows from `brand.config.ts` → CSS variables set once at the root. No hardcoded hex values, font names, or weights anywhere else — including Tailwind config literals, inline styles, SVGs, and chart/badge colors. If a component needs a new shade (e.g., a translucent surface), derive it from an existing variable (e.g., `color-mix` / opacity), or add a token to the config.
2. **No placeholders.** No TODOs, stubbed functions, commented-out "later" code, or lorem ipsum. Every file shipped in a phase is complete and runnable.
3. **Completeness per phase.** A phase may build on later-phase hooks only if those hooks are fully functional now (e.g., the editor writes `updated_by` in Phase 3 even though the changelog that reads it arrives in Phase 7 — the column is real and populated from day one).
4. **Dates are date-only.** All event dates (`launch_date`, `promo_end_date`, etc.) are calendar dates with no time component. Handle them as `YYYY-MM-DD` strings end-to-end; never round-trip them through `Date` objects in a way that shifts them across timezones. Week bucketing uses the viewer's local "today"; weeks run Monday–Sunday.
5. **Server-authoritative writes.** All mutations go through server-side code (route handlers or server actions) so the changelog diffing in Phase 7 has a single choke point. Never write to Supabase directly from client components.
6. **Env vars.** `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (server only, if needed for writes), `APP_PASSWORD` (server only). Commit a `.env.example` listing all of them with placeholder values; never commit real values.
7. **Verification baseline for every phase:** `npm run build` completes with zero errors, and the dev server renders every existing route with no console errors. This is implied in each phase's Verification section in addition to what's listed.

## Key implementation decisions (locked now so phases don't relitigate)

- **Editor form factor:** slide-over panel (right side), not a modal — better for long forms and screen-share, and it keeps the pipeline visible behind it. (PRD §7 allows either.)
- **State/data:** fetch events server-side per view, then subscribe to Supabase Realtime (`postgres_changes` on `events` and `changelog`) client-side to patch the local list. No heavy state library — React state + a small context for events and filters is enough at this scale.
- **Auth gate:** Next.js middleware checks a signed/HttpOnly cookie on every route except the password page and static assets. The password form POSTs to a route handler that compares against `APP_PASSWORD` and sets the cookie (long expiry, e.g. 90 days).
- **Week definition for collision detection:** two events collide when both have ≥1 channel at `primary` priority and `|launch_date_A − launch_date_B| ≤ 7 days` — a rolling window, not calendar-week membership.
- **Styling:** Tailwind is fine, but all brand-derived utilities must resolve to the CSS variables (e.g., `bg-[var(--color-surface)]` or Tailwind theme extension that references variables — never literal hex in the Tailwind config).
- **Fonts:** load Barlow via `next/font/google` with weights taken from `brand.config.ts` (700 heading / 400 body), exposed as CSS variables.

## Target file map (orientation, not a straitjacket)

```
launch-calendar/
  PRD.md  PLAN.md  REVIEW-1.md  REVIEW-2.md
  app/            # Next.js App Router: /(gated)/pipeline (default), /calendar, /changelog, /password
  brand.config.ts
  components/     # EventCard, MilestoneEntry, WeekRow, CalendarGrid, ChannelChips, StatusBadge,
                  # EventEditor (slide-over), RecentChanges, FilterBar, StalenessMarker, NameCapture
  lib/            # supabase clients (server/browser), event queries, mutations + changelog diffing,
                  # date utils (week buckets, spans, collisions, relative time), types
  supabase/       # schema.sql (or migrations/), seed script
  .env.example
```

---

## Phase 1 — Scaffold, schema, brand wiring

**Scope:** Runnable Next.js app deployed-ready for Vercel; Supabase schema created; brand config driving CSS variables globally. No features yet — a branded shell page proves the wiring.

**Tasks**

1. Scaffold Next.js (App Router, TypeScript) inside `launch-calendar/`. Include Tailwind if used (per global decision).
2. Create `brand.config.ts` exactly as specified in PRD §2 (Lucky Golf values).
3. Root layout: convert `brand.colors.*` and `brand.font.*` into CSS variables on `:root` (e.g., `--color-background`, `--color-surface`, `--color-primary`, `--color-primary-text`, `--color-text`, `--color-text-muted`, `--color-danger`, `--color-tentative`, `--font-family`, `--font-weight-heading`, `--font-weight-body`). Load Barlow via `next/font/google`. Render brand name + logo from config in a simple nav shell.
4. Supabase schema (SQL file checked into repo, applied to the project): `events` and `changelog` tables per PRD §3, including the two Postgres enums (`event_type`, `event_status`), `channels` jsonb, FK from `changelog.event_id` → `events.id` with `ON DELETE SET NULL` (log must survive event deletion — `event_name` is denormalized for this), and a trigger or application-side handling for `updated_at`.
5. Supabase client helpers: browser client (anon key) and server client. RLS: enable with permissive policies for anon read/write (access control is the password gate per PRD §6, not Postgres) — note this explicitly in the SQL file so it isn't "fixed" later.
6. TypeScript types for `Event`, `Channels`, `ChangelogEntry` matching the schema exactly (`priority: 'primary' | 'supporting' | 'fyi' | null`, etc.).
7. `.env.example` with all env vars.

**Acceptance criteria**

- App builds and serves a page whose background, text color, accent, and font all visibly come from `brand.config.ts` (changing a config value and reloading changes the page).
- Both tables + enums exist in Supabase and accept a manually inserted row matching the PRD shapes (including the `channels` jsonb example from §3).
- Grep for `#` hex values across the repo finds them only in `brand.config.ts` (and non-brand files like `.svg` favicon internals if any — document exceptions).
- Types compile with no `any` for the core models.

**Verification**

- `npm run build` — clean.
- Temporarily change `brand.colors.primary` in the config, reload, confirm the accent color changes everywhere it appears, revert.
- Insert one test row into `events` via Supabase SQL editor using the §3 channel JSON; select it back through the app's server client (a throwaway server log is fine, removed before commit).
- Grep check: `grep -rn "#[0-9a-fA-F]\{3,8\}" --include="*.ts" --include="*.tsx" --include="*.css"` → only `brand.config.ts`.

---

## Phase 2 — Password gate + display-name capture

**Scope:** The single shared password gate (PRD §6) and the reusable display-name mechanism that later phases stamp edits with.

**Tasks**

1. `/password` page: single password field, brand-styled, error state for wrong password.
2. Route handler: compare submission to `APP_PASSWORD`; on match set an HttpOnly cookie (signed or an HMAC of the password so a stale cookie dies if the password rotates); redirect to `/`.
3. Middleware: all routes except `/password`, the auth route handler, and static assets require the cookie; otherwise redirect to `/password`. Checked "once" per PRD = long-lived cookie, not per-request re-entry.
4. Display-name module: hook + small dialog that returns the stored name from localStorage, or prompts for it the first time it's needed and stores it. Expose `useEditorName()` (or similar) that later phases call at edit time. Include a way to change the name later (small "editing as {name}" affordance in the nav or editor footer).

**Acceptance criteria**

- Every route redirects to `/password` without the cookie; correct password grants access to all routes; wrong password shows an inline error and does not set the cookie.
- Cookie survives browser restart (long expiry). Changing `APP_PASSWORD` on the server invalidates existing cookies.
- Name prompt appears exactly once (first invocation), persists across reloads via localStorage, and the stored name is retrievable by the hook. Name is changeable.
- No brand-token violations introduced.

**Verification**

- Manual pass: fresh incognito window → redirected to `/password`; wrong password → error; right password → landing page; reload → still in; clear cookie → gated again.
- Trigger the name prompt (temporary dev button is acceptable if the editor doesn't exist yet — remove before commit, or wire it to the "editing as" affordance which is permanent), enter a name, reload, confirm no re-prompt.

---

## Phase 3 — Event CRUD + editor

**Scope:** Full create/read/update/soft-delete for events via the slide-over editor (PRD §7), server-side mutation layer, realtime propagation. No changelog writing yet (Phase 7), but every mutation already routes through the single server-side choke point the changelog will later hook into.

**Tasks**

1. Server mutation layer: `createEvent`, `updateEvent`, `cancelEvent` (soft delete = status → `cancelled`), `deleteEvent` (hard delete). Each validates required fields (name, type, status, launch_date, owner, ≥1 channel with `involved: true`), stamps `updated_at` and `updated_by` (display name passed from client), and returns the updated row.
2. Slide-over editor component: opens for "New event" and for editing an existing one. Fields per PRD §3/§7 — name, type (select), status (select), brief (with the §7 placeholder text verbatim), launch_date (required), optional dates (promo_end, inventory, asset_deadline, teaser_start), channels (per-channel involved toggle + priority select of primary/supporting/fyi; priority forced to null when not involved), owner, notes. Required-field validation with inline errors; date inputs support fast keyboard entry (native date inputs are acceptable).
3. On first save attempt, invoke the Phase 2 name capture if no display name exists yet.
4. Delete UX: "Cancel event" is the visible destructive action (soft delete, with confirm). Hard delete lives behind a small separate admin affordance inside the editor (e.g., in a collapsed "danger" area) with an explicit type-to-confirm or double-confirm step.
5. Temporary event list on the landing page (raw list of event names + edit buttons) so CRUD is exercisable before the Pipeline view replaces it in Phase 4. This list must be fully functional, not a stub — Phase 4 replaces it wholesale.
6. Realtime: subscribe to `events` changes; inserts/updates/deletes from another session appear in the open list without reload.

**Acceptance criteria**

- Can create an event with only required fields; can create one with every field; both persist correctly (verify `channels` jsonb shape matches §3 exactly).
- Validation blocks: missing name/type/status/launch_date/owner, and zero involved channels — each with a visible inline error, no server 500s.
- Editing any field persists and updates `updated_at`/`updated_by`.
- Cancel sets status to `cancelled` (row still in DB). Hard delete removes the row and requires the confirm step.
- Two browser windows open side-by-side: an edit in one appears in the other within a few seconds without reload.
- Editor is keyboard-friendly: tab order sane, Esc closes, save on submit.

**Verification**

- Manual CRUD pass covering every acceptance criterion above, including the two-window realtime test.
- Inspect one created row in Supabase and confirm every column (esp. `channels` and null optional dates) matches the PRD shapes.

---

## Phase 4 — Pipeline view (default route) with lead-up milestones

**Scope:** The primary screen-shared view (PRD §4.1). Replaces the Phase 3 temporary list as the default landing page.

**Tasks**

1. Week bucketing util: given today, produce This Week / Week 2 / Week 3 / Week 4 (Mon–Sun), each labeled with its date range (e.g., "This Week · Jul 27 – Aug 2"), plus a "Beyond 4 weeks" bucket.
2. Event cards placed by `launch_date`: name, type badge, status treatment (basic version now; full visual-language pass is Phase 8 — but tentative vs confirmed must already be distinguishable), channel chips with priority styling (primary visually heavier than supporting/fyi), brief one-liner, "Updated by {name} · {relative time}" line (PRD §6). Card click opens the editor.
3. Milestone entries: for each of `asset_deadline`, `teaser_start`, `inventory_date` falling within the 4 visible weeks, render a smaller milestone row in that week — labeled by kind, e.g. "🔔 Assets due: {event name}", "📣 Teasers start: {event name}", "📦 Inventory lands: {event name}". Milestones appear in addition to the launch card (which sits in its own week), also for events launching beyond 4 weeks. Milestone click opens the same editor.
4. Visibility rules: `completed` and `cancelled` events are hidden from Pipeline by default (PRD §5). Provide a small toggle to reveal completed ones.
5. "Beyond 4 weeks" collapsed section listing future events compactly (name, date, status), expandable.
6. Screen-share design pass: large type, high contrast, generous spacing, scannable at a glance from a video call. Empty-week rows still render (an empty "Week 3" is information).
7. Realtime keeps this view live (reuse Phase 3 subscription).

**Acceptance criteria**

- Events land in the correct week buckets across month boundaries; bucket labels show correct date ranges.
- An event with `asset_deadline` in Week 2 and `launch_date` in Week 4 shows a milestone in Week 2 **and** a card in Week 4. An event launching in >4 weeks with a teaser_start in Week 1 shows only the milestone (plus its Beyond-4-weeks row).
- Completed/cancelled hidden by default; toggle reveals completed.
- Cards show all §4.1 elements including the updated-by line; clicking any card or milestone opens the editor pre-filled.
- Readable when the window is sized like a shared screen (~1280px) — no truncated critical info.

**Verification**

- Create test events by hand covering: this week, each of weeks 2–4, beyond 4 weeks, a lead-up date in a different week than launch, a completed event, a cancelled event. Confirm each renders per the criteria, then clean up test rows (Phase 9 adds durable seeds).
- Two-window realtime check: date change in one window moves the card between weeks in the other.

---

## Phase 5 — Calendar view with collision detection

**Scope:** Month-grid calendar (PRD §4.2) as a second route in the nav.

**Tasks**

1. Month grid: standard 7-column calendar, current month default, prev/next month plus quarter navigation (jump between Q1–Q4 / prev-next quarter).
2. Event spans: each visible event renders as a bar from `teaser_start` (fallback `launch_date`) through `promo_end_date` (fallback `launch_date`), spanning across weeks/rows as needed; `launch_date` visually marked on the span (the anchor day reads differently than the run-up). Multiple overlapping events stack. Completed/cancelled hidden (consistent with Pipeline); tentative treatment applies to spans.
3. Collision detection util: pairs of events that each have ≥1 `primary`-priority involved channel and launch dates ≤7 days apart (rolling window). Excludes `completed`/`cancelled`.
4. Collision UI: warning treatment on both colliding events (danger-token accent) + banner above the grid, e.g. "⚠️ 2 primary launches within 7 days" — counting distinct events in the visible month involved in any collision; banner absent when none.
5. Span/card click opens the editor. Realtime keeps the view live.

**Acceptance criteria**

- Spans render correct start/end per the fallback rules; a launch-only event renders as a single-day entry; spans crossing month rows render on each row segment.
- Quarter + month navigation reaches arbitrary months without breaking layout.
- Two events with primary channels launching 5 days apart: both highlighted + banner shown. Move one 10 days out: highlight and banner clear. Two events 5 days apart where one has only `supporting` priorities: no collision.
- Collisions spanning a month boundary are still detected when either event is visible.
- No brand-token violations (warning treatment uses the danger token).

**Verification**

- Manual matrix: create the three collision scenarios above plus the month-boundary case; verify highlight/banner behavior for each; verify span fallbacks with events that have (a) teaser+promo_end, (b) only launch_date, (c) teaser but no promo_end. Clean up test rows.
- Build + all three routes render clean.

---

## ⏸ CHECKPOINT 2 — STOP. Fable midpoint review

Operator switches to Fable 5. Review-only session per PRD §0: repo-level review of schema, CRUD, both views against PRD §§2–7 acceptance criteria, the §12 checklist, brand-token grep, and tentative-vs-confirmed distinction. Findings → `REVIEW-1.md` as a numbered, prioritized list (blockers first). No code edits.

## Phase 5R — Apply REVIEW-1 findings (Opus)

- Address every numbered item in `REVIEW-1.md`, in priority order. Confirm each item explicitly (e.g., a checklist in the commit/summary mapping item # → fix).
- **Acceptance:** every item fixed or explicitly deferred with the operator's agreement noted.
- **Verification:** re-run the specific verification steps of any phase a fix touched; full build clean.

---

## Phase 6 — Channel filter chips (both views)

**Scope:** PRD §4.3 — filter working identically on Pipeline and Calendar.

**Tasks**

1. Filter bar: chips All / Paid / Email / Organic / SMS, brand-styled, single-select, All default. Place it in the shared layout so both views get it; selection persists across view switches (URL query param preferred — shareable/screen-share friendly — falling back to context state is acceptable only if routing gets awkward).
2. Filtering: a channel chip shows only events where that channel is `involved: true`. Within results, `primary`-priority events are visually elevated over `supporting`/`fyi` (e.g., full opacity + accent vs. dimmed) — elevation, not hiding.
3. Milestones on Pipeline and spans on Calendar follow the same filter (they belong to their events). Collision detection stays computed on the full dataset (a collision doesn't vanish because you're looking at the email lens) — but only render highlights for visible events; keep the banner if any visible event collides.

**Acceptance criteria**

- Selecting Email shows only email-involved events on both views; All restores everything; the selected chip is visually obvious.
- With a channel selected, a primary event and a supporting event are clearly distinguishable at a glance.
- Filter persists when switching Pipeline ↔ Calendar. Deep-linking with the filter in the URL lands filtered (if query-param approach used).
- Empty states are handled (a filter with zero events shows a friendly empty message, not a blank screen).

**Verification**

- Manual pass with events covering all four channels at mixed priorities: each chip on each view; the primary-elevation contrast check; the view-switch persistence check.

---

## Phase 7 — Changelog automation + feed + Recent changes panel

**Scope:** PRD §3 (`changelog` table semantics) + §4.4. The automation is the heart: server-side diffing on every meaningful edit.

**Tasks**

1. Diff engine in the server mutation layer (the Phase 3 choke point): on `updateEvent`, compare old vs new and write one changelog row per meaningful change, human-readable:
   - Dates (all five date fields): "Launch date moved Aug 12 → Aug 26", "Asset deadline set: Aug 5", "Teaser start removed".
   - Status: "Status: tentative → confirmed".
   - Channels: involvement and priority changes, e.g. "SMS added (supporting)", "Paid: supporting → primary", "Email removed".
   - Name: "Renamed 'X' → 'Y'".
   - Creation: "Event created (launch Aug 26, confirmed)". Cancellation: "Event cancelled". (Cancellation phrasing wins over the generic status-change phrasing.)
   - Not logged: brief/notes/owner tweaks (PRD lists the meaningful set: date, status, channel, name, created, cancelled).
   - Every row: `event_id`, denormalized `event_name` (post-change name), `changed_by` = display name, `created_at`.
2. Date and status changes must be impossible to miss: the diff covers every date column explicitly (no generic "fields changed" fallback for dates/status).
3. Hard delete: changelog rows survive (FK `ON DELETE SET NULL` from Phase 1); write a final "Event deleted permanently" entry before removal.
4. `/changelog` route: reverse-chronological feed — summary, event name, changed_by, relative + absolute time. Paginate or lazy-load past ~50 entries.
5. "Recent changes" panel on Pipeline: 5 most recent entries, compact, linking to the full feed. Realtime: new changelog rows appear live in both feed and panel.

**Acceptance criteria**

- Each meaningful change type (every date field set/moved/cleared, status change, channel add/remove/priority change, rename, create, cancel) produces exactly one correctly-worded entry; a single save changing three things produces three entries (or one entry per change grouped in one save — but each change individually legible).
- Non-meaningful edits (brief/notes/owner only) produce no entries.
- Deleting an event hard leaves its history readable in the feed under its denormalized name.
- Feed is reverse-chronological; panel shows exactly the 5 newest and updates live.
- A no-op save (open editor, save without changes) writes nothing.

**Verification**

- Scripted manual pass: perform one edit of each change type and read the feed back, checking wording and count for each. Then the three-changes-in-one-save case, the no-op save case, and the hard-delete case.
- Two-window test: edit in window A, watch the Recent changes panel update in window B.

---

## Phase 8 — Staleness markers + status visual language pass

**Scope:** PRD §5 in full, plus the §6 staleness indicator, applied consistently across cards, milestones, calendar spans, and the editor.

**Tasks**

1. Status visual language (both views + editor status select preview):
   - Confirmed: solid border, full color.
   - Tentative: dashed border, desaturated/muted (use the `tentative` token), explicit "TENTATIVE" label. Must read visibly softer than confirmed at a glance — the "nobody preps hard for a soft date" test.
   - At-risk: confirmed styling + danger-token accent + "AT RISK" label.
   - Completed: greyed/collapsed treatment where shown (hidden by default from Pipeline, per Phase 4 toggle).
   - Cancelled: hidden from both views; visible in changelog only.
2. Staleness: events with `updated_at` ≥21 days old **and** `launch_date` within the next 30 days get a subtle "needs review" marker (muted-token badge/dot with a tooltip explaining why). Applies on Pipeline cards and Calendar spans.
3. Consistency sweep: channel-chip priority styling, milestone styling, and collision warning treatment all coexist legibly with status treatments (e.g., a tentative at-risk-adjacent card in a collision still reads clearly).

**Acceptance criteria**

- A side-by-side of one event per status shows five clearly distinct treatments matching §5; tentative is unmistakably softer than confirmed from across the room (screen-share distance).
- Staleness marker appears exactly when both conditions hold: 21+ days unedited AND launching within 30 days. An old-but-distant event and a fresh-but-imminent event show nothing.
- Editing a stale event clears its marker (updated_at refreshes).
- All treatments use brand tokens only (grep still clean).

**Verification**

- Manually set `updated_at` back 25 days (SQL) on an event launching in 2 weeks → marker appears; on an event launching in 3 months → no marker. Edit the flagged event → marker clears.
- Visual pass with one event of each status on both views; screenshot-level check of tentative vs confirmed contrast.

---

## Phase 9 — Seed data

**Scope:** PRD §11 item 9 — 6–8 realistic sample events that make every feature demonstrable on first load.

**Tasks**

1. Idempotent seed script (checked into `supabase/`, runnable on demand; clears prior seed rows by a marker or known names before inserting) with launch dates **relative to today** at seed time so the pipeline is always populated.
2. Coverage matrix the seeds must hit:
   - Types: at least one each of `product_launch`, `promo`, `restock`, `content_moment`; ≥1 of the remaining types across the set.
   - Statuses: mix of confirmed + tentative (multiple of each), ≥1 `at_risk`, ≥1 `completed`, ≥1 `cancelled` (exercises hidden-by-default + changelog visibility).
   - Two confirmed events with primary channels launching ≤7 days apart → collision demo fires.
   - ≥2 events with full lead-up dates (teaser, asset deadline, inventory) landing in visible weeks → milestone demo.
   - ≥1 promo with `promo_end_date` → calendar span demo. ≥1 event beyond 4 weeks.
   - Channel spread: every channel involved somewhere; priorities span primary/supporting/fyi → filter + elevation demo.
   - ≥1 event with `updated_at` backdated 21+ days and launch within 30 days → staleness demo.
   - Realistic Lucky Golf-flavored names/briefs/owners (e.g., restocks, apparel drops, promos — consistent with the brand).
3. Seed changelog entries for a few events (including the cancelled one) so the feed and Recent changes panel aren't empty on first load.

**Acceptance criteria**

- One seed run on a clean table → Pipeline shows populated weeks with milestones, collision banner visible on Calendar (and the colliding pair highlighted), filters/staleness/tentative treatments all demonstrable without touching the editor, changelog feed non-empty.
- Running the seed twice doesn't duplicate rows.

**Verification**

- Wipe events (or use a fresh table), run seed, walk every view + filter chip and confirm each coverage-matrix item is visibly demonstrable. Run seed again; row count unchanged.

---

## Phase 10 — Polish, responsive pass, brand-swap verification

**Scope:** PRD §11 item 10 + §8's responsive requirement + §10's under-30-minute brand replication promise.

**Tasks**

1. Responsive pass at mobile (~375px), tablet (~768px), desktop/screen-share (1280px+): Pipeline stacks cleanly; Calendar remains usable on mobile (horizontal scroll or condensed density — pick one and make it deliberate); editor slide-over becomes full-screen on mobile; filter chips wrap; changelog readable; no iOS input-zoom issues; touch targets adequate.
2. Polish sweep: loading states for each route, error states for failed mutations (with retry), focus management in the slide-over (trap + return focus), sensible page titles/favicon from brand config, empty states everywhere data can be empty, relative-time strings correct ("3h ago", "2d ago").
3. Console hygiene: zero errors/warnings on all routes (Realtime reconnect noise handled).
4. **Brand-swap verification:** create a dummy second brand config (clearly different palette + font, e.g., light background, different Google font), swap it in as `brand.config.ts`, rebuild, and click through every route confirming zero Lucky Golf values leak (colors, fonts, name, logo). Then restore Lucky Golf. Keep the dummy config in the repo (e.g., `brand.config.example-acme.ts`) as the replication template, plus a short `README` note: replicate = copy config + set env vars + deploy (§10: under 30 minutes).
5. Final self-audit against the PRD §12 checklist before declaring done.

**Acceptance criteria**

- All routes usable and unbroken at the three breakpoints; nothing requires horizontal scrolling except the deliberate mobile-calendar choice.
- Brand swap: with the dummy config, a full click-through shows no Lucky Golf color/font/name anywhere; grep for the Lucky hex values (`C9A227`, `0E0E0E`, etc.) finds them only in the Lucky config file.
- Every §12 checklist item passes: PRD coverage, token compliance, no placeholders/TODOs (grep `TODO|FIXME|placeholder`), changelog fires on date/status/channel/name, tentative≠confirmed visually, collision fires on seeds, responsive, clean build, zero console errors.

**Verification**

- Device-emulation pass (375 / 768 / 1280) on all routes with seeds loaded.
- Execute the brand swap end-to-end (swap → build → click-through → grep → restore) and record the result.
- Walk PRD §12 line by line and state pass/fail for each item in the phase summary.

---

## ⏸ CHECKPOINT 3 — STOP. Fable final review

Operator switches to Fable 5. Full repo audit against the entire PRD + §12 checklist. Findings → `REVIEW-2.md`, numbered, blockers first. No code edits.

## Phase 10R — Apply REVIEW-2 findings (Opus)

- Fix every numbered item in `REVIEW-2.md` in priority order, confirming each explicitly; re-run the §12 checklist and the verification steps of any touched phase.
- Done = all findings closed, build clean, seeds demo every feature, §12 fully green. Ship to Vercel.

---

## Risk notes (watch these while building — they're where this PRD most likely goes wrong)

1. **Timezone date drift.** Date-only columns round-tripped through JS `Date` shift by a day for negative-UTC users. Global rule 4 exists because of this; test week bucketing and calendar placement explicitly with a date at month boundary.
2. **Changelog misses.** The PRD says date/status changes must *never* be missed. Any future mutation path added outside the server choke point silently breaks this — keep all writes in `lib` mutations, and re-verify Phase 7's matrix if the editor gains fields.
3. **Realtime clobbering.** Two editors with the same event open: last-write-wins is acceptable at this scale, but the open editor should not have its form state overwritten mid-edit by a realtime patch — patch lists, not open forms.
4. **Token leaks in edge surfaces.** Favicons, SVG logos, chart/warning colors, and Tailwind config literals are where hex sneaks in. The grep is in every phase's baseline for a reason.
5. **Collision definition drift.** Rolling 7-day window on launch dates with primary-priority channels on *both* events — resist simplifying to "same calendar week" during implementation.

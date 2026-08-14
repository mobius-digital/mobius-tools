# REVIEW-1 — Midpoint audit (functionality + workflow)

Fable review checkpoint 2, run after Phase 5 plus the extra scope built since
(pipeline tier redesign, clash flags on Pipeline, calendar week view, date-picker
affordance, click-a-day-to-create, light theme). Focus per the operator's brief:
**"a new person must understand this at a glance — right now it feels like
stuff is all over the place."**

Method: walked the app in a browser as a first-time user at desktop and mobile
widths, measured what is actually on screen, and traced the workflows each role
would run (channel operator, event owner, leadership on the Monday call).

Verdict up front: the foundation is sound — data model, validation, collision
logic, and brand tokens all held up under testing, and the tier redesign is the
right skeleton. The confusion is real but it is not structural; it comes from
**ordering, redundancy, and missing explanation**, all fixable without another
rebuild. The biggest workflow gaps (channel lens, "what changed") are already
planned as Phases 6–7 and should not be reinvented ad hoc.

---

## A. Blockers — first-glance comprehension

These defeat the "understood in under 60 seconds" success criterion (PRD §10).

1. **The landing screen leads with two alarms before any content.** Top-to-bottom
   today: title → full-width error banner ("Live updates are disconnected") →
   red "Past launch date, still open" box → and only then This Week. A new
   person's first read is "something is broken and something is late" before they
   learn what the tool is. Fix: (a) This Week always renders first; (b) the
   overdue bucket becomes a single collapsed amber strip *below* This Week
   ("1 past launch date, still open ▸") — it is a chore list, not an emergency;
   (c) the realtime notice becomes a small passive indicator (e.g. a dot in the
   nav with a tooltip), shown only after a previously-live connection drops —
   never as the second element on first paint.

2. **"clash" is unexplained jargon.** It appears on cards, rows, and banners with
   no tooltip, legend, or expansion anywhere. A media buyer cannot know it means
   "two primary launches within 7 days." Status badges (TENTATIVE / AT RISK) and
   milestone icons (🔔📣📦) are equally unexplained. Fix: title/tooltip on every
   badge and flag, plus one small dismissible "how to read this board" popover in
   the Pipeline header. Cheap, and it converts every other finding from
   "confusing" to "learnable."

3. **The day rail duplicates the stream below it in a different vocabulary.**
   The same three items appear twice on one screen: as truncated pips
   ("assets", "launch") in the rail, then as rows ("🔔 Assets due — …") beneath.
   Two renderings of one list is the literal "stuff all over the place" feeling.
   Fix: demote the rail to a pure day-index — icon-only markers with tooltips,
   no text — so it reads as a minimap, and let the stream be the single
   readable list. (Keeping the rail is right; it carries the shape of the week.)

4. **Week 3/4 summary lines erase status.** "Range Session Series, Tour Bag
   Launch · 1 milestone" hides that one is AT RISK and the other TENTATIVE.
   PRD §5 makes status legibility non-negotiable, and leadership scanning ahead
   is exactly who reads those lines. Fix: inline status dot/mini-badge per name
   in the summary, and the clash flag too when applicable.

5. **Collision information appears twice on the Calendar.** Stacked banners at
   the top *and* a "Clashing launches" list at the bottom repeat the same facts;
   with nav+header+banners, the actual grid starts 435px down a 720px viewport.
   Fix: one compact banner per clash that expands to the detail list on click;
   delete the bottom section.

## B. High — workflow gaps for the three real roles

6. **There is no quick action for the most common edit.** Marking an event
   completed, confirming a tentative date, or flagging at-risk — the three moves
   the Monday call actually produces — each require open editor → scroll →
   change a select → save. Fix: a status menu directly on cards and rows
   (kebab or click-the-badge), still stamping `updated_by` and flowing through
   the same server mutation so the Phase 7 changelog captures it. This also
   dissolves the overdue pile (finding 1), because "this shipped" becomes one
   click from the strip.

7. **The editor buries its essentials.** The form is ~1,400px tall in a 720px
   viewport; required fields are scattered across both screens; Channels
   (required) sits below the fold, guaranteeing a validation bounce for
   first-timers; and Brief — the field every card leads with — is second from
   the bottom. Fix: reorder to Name → Brief → Launch date → Channels → Owner →
   Type/Status → other dates → Notes. Nothing else about the editor needs to
   change.

8. **Channel priorities are undefined in the UI.** primary/supporting/fyi drive
   both the visual hierarchy and collision detection, yet nothing says what they
   mean. One helper line under the Channels legend ("primary = this channel
   builds something; fyi = just needs to know") fixes it.

9. **The channel lens is the biggest missing piece — and it is already Phase 6.**
   "Paid opens the tool and sees only what paid needs to do" is the operator
   workflow this brief asks for. Recommendation beyond the plan as written:
   remember the last-selected channel per device (localStorage) so a media buyer
   lands pre-filtered every visit.

10. **"What changed since last Monday" does not exist yet — it is Phase 7.**
    The Recent Changes panel is the leadership anchor; date/status changes must
    render as before→after ("Launch moved Aug 12 → Aug 26"), which the planned
    diff engine already specifies. Build it next after Phase 6; do not improvise
    a partial version now.

11. **An empty deployment gives no invitation.** Four "Nothing scheduled" rows
    and nothing pointing at "New event." First-run needs a one-card empty state:
    what this board is, and a Create button. (Verified from code paths; matters
    for the second-brand deploy promise in PRD §10.)

## C. Medium — functional details

12. **Cards omit the owner.** "Updated by Cole · 5m ago" answers who touched it
    last, not who is accountable (PRD §3's `owner`). Add "Owner · Dana" to the
    card foot; answering "who do I ask" is half the tool's job.

13. **The "2 items" count chip is unlabeled.** Items = launches + milestones, but
    nothing says so. Rename to "2 this week" or give it a tooltip.

14. **The Calendar subtitle crams three unrelated hints** ("Q3 2026 · spans run
    from teaser through promo end · click any day to add an event"). Hints
    belong on the elements: tooltip on spans, visible affordance on day cells.

15. **Milestone rows have no tooltip while rail pips do** — inconsistent; both
    should carry the same title text.

16. **The realtime client retries its websocket forever**, spamming the console
    (observed: continuous failed reconnects against the stub). Cap with backoff
    and give up after N attempts into the passive-indicator state from finding 1.
    Also, the banner text "reload to see others' changes" overstates — your own
    edits still appear instantly via the API round-trip.

17. **Touch affordances on the calendar are hover-only.** The "+" on day cells
    appears on hover, which does not exist on phones. Fold into Phase 10's
    responsive pass, along with the 35px-wide rail columns and the 126px wrapped
    nav observed at 375px (no horizontal overflow though — good baseline).

## D. Unplanned-scope inventory (for the record)

Built outside PLAN.md since checkpoint 1, all reviewed here: pipeline tier
redesign; clash flags on Pipeline; calendar week/month toggle; date-field picker
affordance; click-a-day-to-create; light theme with derived `--color-accent-ink`
and a new `scrim` brand key; overdue bucket. Judgement: all directionally right
and none conflict with Phases 6–10. Two deliberate PRD deviations to keep:
the `scrim` config key (a brand config cannot derive a modal backdrop that works
in both light and dark themes) and the overdue bucket (a slipped launch must not
vanish from the board) — the latter needs the calmer treatment in finding 1.
Contrast was measured this session: all text ≥ 4.5:1 in both palettes.

## E. Game plan

The order matters: clarity first, then fast actions, then the planned phases —
the planned phases land better on a legible surface.

- **Phase 5R-a — Legibility pass (findings 1–5, 12–15).** Reorder the landing
  screen, calm the overdue strip, passive realtime indicator, tooltips + legend
  popover, single-vocabulary day rail, status in summary lines, one collision
  banner, owner on cards, labeled count. No data-layer changes. This alone
  resolves the "confusing at first glance" complaint.
- **Phase 5R-b — Fast actions (finding 6).** Quick status menu on cards/rows
  through the existing mutation layer. Small, high leverage.
- **Phase 5R-c — Editor reorder (findings 7–8).** Field order + one helper line.
- **Phase 6 — Channel filter** as planned, plus remembered per-device channel.
- **Phase 7 — Changelog + Recent Changes** as planned (finding 10 depends on it).
- **Phase 8–10** as planned; fold findings 11, 16, 17 into Phase 10's polish
  pass (empty state, websocket backoff, touch affordances).

Per-role check once 5R-a–c + 6 + 7 land: a channel operator opens pre-filtered
to their lane and reads this week's work off one stream; an owner updates a date
in two clicks and the change is broadcast; leadership scans four tier lines and
a Recent Changes panel with zero prep. That is the PRD's §10 definition of done,
reached without rebuilding anything delivered so far.

## §12 checklist snapshot (scope built so far)

- Brand tokens: **pass** (grep clean outside the two config files; measured AA
  contrast both palettes)
- No placeholders/TODOs: **pass**
- Tentative vs confirmed visually distinct: **pass** on cards/spans; **gap** in
  week 3/4 summary lines (finding 4)
- Collision detection on seeds: **pass** (rolling window, month boundary, and
  cluster separation all verified)
- Changelog: **n/a** (Phase 7)
- Responsive: **deferred to Phase 10** (no overflow at 375px; density issues noted)
- Build clean / console: **build pass**; console has websocket retry spam
  against the stub (finding 16)

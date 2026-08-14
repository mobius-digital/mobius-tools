# PRD: Launch Calendar ("Marketing Air Traffic Control")

## 0. Execution Model — READ THIS FIRST

This project runs primarily on **Opus** (the workhorse), with **Fable 5** used manually at exactly three checkpoints for planning and review. No subagents. The human operator switches models with `/model` at the points defined below.

### The three Fable checkpoints

1. **Plan (start, Fable 5):** Produce a detailed phase-by-phase build plan from this PRD before any code is written. Save it to `PLAN.md`.
2. **Midpoint review (after Phase 5, Fable 5):** Repo-level review of the foundation (schema, CRUD, both views) before the remaining phases build on top of it. Findings go to `REVIEW-1.md`.
3. **Final review (after Phase 10, Fable 5):** Full repo audit against this PRD and the checklist in §12. Findings go to `REVIEW-2.md`.

Everything else — all implementation, all fixes — runs on Opus.

### Rules for the Opus build sessions

- Follow `PLAN.md` phase by phase. One phase at a time; do not start the next phase until the current one's verification step passes.
- Read this PRD (`PRD.md`) before Phase 1 and follow its data model, naming, and brand-token rules precisely.
- All UI components consume colors/fonts via CSS variables sourced from `brand.config.ts`. Never hardcode brand values.
- No placeholder code, no TODOs, no stubbed functions. Every file delivered is complete and runnable.
- After each phase: state what was built, run the verification (build passes / page renders / behavior works), and summarize in 2–3 lines before proceeding.
- When implementing fixes from `REVIEW-1.md` or `REVIEW-2.md`, address every numbered item and confirm each one explicitly.

### Rules for the Fable review sessions

- Review only — do not write or edit application code. Output findings as a numbered, prioritized list (blockers first, then improvements) written to the review file.
- Check against: PRD acceptance criteria per section, the §12 checklist, brand-token compliance (grep for hardcoded hex values outside brand.config.ts), changelog automation coverage, and tentative-vs-confirmed visual distinction.

---

## 1. Purpose

A single source of truth for what's launching, when, and which marketing channels need to care. Built for a DTC brand's internal + agency marketing team. It is **not** a project management tool — teams keep their own workflows. This tool answers three questions:

1. What's happening over the next 4 weeks?
2. Is each date locked or soft?
3. What does my channel (paid / email / organic / SMS) need to do about it?

Primary use case: screen-shared on the weekly marketing call. Secondary use case: any team member checks in async to see what's in the pipeline.

## 2. Architecture

- **Frontend:** Next.js (App Router), deployed on Vercel
- **Backend:** Supabase (Postgres + Realtime). No Supabase Auth — access control is a single shared password (see §6)
- **Realtime:** Supabase realtime subscriptions so edits appear live for everyone viewing (two people on a call won't clobber each other)
- **Branding:** All brand-specific values live in a single `brand.config.ts` file. Replicating for a new brand = new config + new deploy. Zero code changes.

### brand.config.ts (first deploy: Lucky Golf)

```ts
export const brand = {
  name: "Lucky Golf",
  logoUrl: "/logo.svg",
  colors: {
    background: "#0E0E0E",   // near-black
    surface: "#1A1A1A",
    primary: "#C9A227",      // gold
    primaryText: "#0E0E0E",
    text: "#F5F5F0",
    textMuted: "#9A9A94",
    danger: "#D9534F",
    tentative: "#6E6E68",
  },
  font: {
    family: "Barlow",        // Google Fonts
    headingWeight: 700,
    bodyWeight: 400,
  },
};
```

All components must consume colors/fonts from this config (via CSS variables set at the root). No hardcoded brand values anywhere else.

## 3. Data Model

### Table: `events`

| Field | Type | Notes |
|---|---|---|
| `id` | uuid | PK |
| `name` | text | e.g. "Patriot Putter Restock" |
| `type` | enum | `product_launch` \| `promo` \| `restock` \| `content_moment` \| `evergreen_push` \| `other` |
| `status` | enum | `confirmed` \| `tentative` \| `at_risk` \| `completed` \| `cancelled` |
| `brief` | text | One-liner: the angle/offer in a sentence |
| `launch_date` | date | The anchor date |
| `promo_end_date` | date, nullable | For promos/sales |
| `inventory_date` | date, nullable | Product in-hand date |
| `asset_deadline` | date, nullable | Creative/assets due |
| `teaser_start` | date, nullable | When pre-launch comms begin |
| `channels` | jsonb | See channel structure below |
| `owner` | text | Who's accountable for this event's info being current |
| `notes` | text, nullable | Freeform details, links to briefs/docs |
| `created_at` / `updated_at` | timestamptz | |
| `updated_by` | text | Display name of last editor |

### Channel structure (`channels` jsonb)

```json
{
  "paid":    { "involved": true,  "priority": "primary" },
  "email":   { "involved": true,  "priority": "supporting" },
  "organic": { "involved": true,  "priority": "primary" },
  "sms":     { "involved": false, "priority": null }
}
```

`priority`: `primary` | `supporting` | `fyi`

### Table: `changelog`

| Field | Type | Notes |
|---|---|---|
| `id` | uuid | PK |
| `event_id` | uuid | FK → events |
| `event_name` | text | Denormalized so log survives event deletion |
| `change_summary` | text | Human-readable, e.g. "Launch date moved Aug 12 → Aug 26" |
| `changed_by` | text | |
| `created_at` | timestamptz | |

Changelog entries are generated automatically on every meaningful edit (date change, status change, channel change, name change, event created, event cancelled). Diff old vs new values server-side and write a readable summary. Date and status changes are the most important — never miss those.

## 4. Views

### 4.1 Pipeline View (default landing page)

- Rows for **This Week, Week 2, Week 3, Week 4**, each labeled with date range
- Each event renders as a card within its launch week: name, type badge, status, channel chips with priority styling, brief one-liner
- Events whose *lead-up dates* (asset deadline, teaser start, inventory date) fall in a week also appear in that week as smaller "milestone" entries — e.g. "🔔 Assets due: Fall Apparel Drop" — because channels work backward from launch and the lead-up matters more than launch day itself
- A "Beyond 4 weeks" collapsed section at the bottom
- This view is designed to be screen-shared: large type, high contrast, scannable

### 4.2 Calendar View

- Month grid with quarter navigation
- Events span from `teaser_start` (or `launch_date` if no teaser) through `promo_end_date` (or just launch day)
- **Collision detection:** if two events with any `primary` channel priority have launch dates within the same 7-day window, highlight both with a warning treatment and show a banner: "⚠️ 2 primary launches within 7 days"

### 4.3 Channel Filter (works across both views)

- Filter chips: All / Paid / Email / Organic / SMS
- Selecting a channel shows only events where that channel is `involved`, and visually elevates `primary` priority events over `supporting`/`fyi`

### 4.4 Changelog Feed

- Reverse-chronological feed, accessible from nav
- Also surface the **5 most recent changes** as a small "Recent changes" panel on the Pipeline view — slipped dates should never be a surprise

## 5. Status Visual Language

This is core to the product. Status must be legible at a glance:

- **Confirmed:** solid border, full color, normal treatment
- **Tentative:** dashed border, muted/desaturated colors, "TENTATIVE" label. Must look visibly softer than confirmed — nobody should prep hard for a soft date
- **At-risk:** confirmed styling + danger-color accent and "AT RISK" label
- **Completed:** collapsed/greyed, hidden from Pipeline by default
- **Cancelled:** hidden by default, visible in changelog

## 6. Access & Editing

- Single shared password gate (env var), checked once, stored in a cookie. No user accounts, no roles.
- On first edit, prompt for a display name; store in localStorage; stamp all edits with it (`updated_by`, `changed_by`)
- Anyone in can edit anything. The trust mechanism is visibility, not permissions: every event card shows "Updated by {name} · {relative time}"
- **Staleness indicator:** events not updated in 21+ days whose launch date is within the next 30 days get a subtle "needs review" marker

## 7. Event Editor

- Modal or slide-over form, fast to use
- Required: name, type, status, launch_date, at least one channel involved, owner
- Optional: all other dates, brief, notes
- Date fields should support quick entry; brief field has placeholder text: "The offer/angle in one sentence — what would a media buyer need to know?"
- Deleting = setting status to `cancelled` (soft delete). Hard delete only from a small admin action with confirm.

## 8. Non-Goals (v1)

- No task management, subtasks, or checklists
- No file/asset storage — link out via notes field
- No user accounts or granular permissions
- No Slack integration (v2)
- No mobile app — but the web app must be fully responsive; team members will check this on phones

## 9. v2 Backlog (do not build now)

- Slack weekly digest: every Monday 8am, post the next-4-weeks pipeline summary to a channel
- Slack change alerts: post to channel when a confirmed event's date or status changes
- ICS calendar feed subscription per channel
- Multi-brand single instance (brand switcher) if maintaining per-brand deploys becomes annoying

## 10. Success Criteria

- Monday call runs off the Pipeline view with zero prep
- A date slip entered by the owner is visible to all channels the same day (changelog + realtime)
- A new team member can understand "what's happening this month" in under 60 seconds with no walkthrough
- Replicating for a second brand takes under 30 minutes (config + deploy only)

## 11. Build Order

1. Project scaffold + Supabase schema + brand.config with CSS variable wiring
2. Password gate + display-name capture
3. Event CRUD + editor (modal/slide-over)
4. Pipeline view (default route) with lead-up milestones
5. Calendar view with collision detection
   → **⏸ STOP after Phase 5: Fable midpoint review (checkpoint 2)**
6. Channel filter chips (both views)
7. Changelog automation + feed + "Recent changes" panel
8. Staleness markers + status visual language pass
9. Seed data: 6–8 realistic sample events across types/statuses (mix confirmed/tentative, overlapping dates to demo collision detection)
10. Polish + responsive pass + brand-swap verification: swap in a dummy second brand config and confirm zero hardcoded brand values leak through
    → **⏸ STOP after Phase 10: Fable final review (checkpoint 3)**

## 12. Review Checklist (applied at both Fable review checkpoints)

- [ ] Matches the PRD section(s) built so far — no missing acceptance criteria
- [ ] All brand values flow through CSS variables from brand.config.ts (grep for stray hex values)
- [ ] No placeholders, TODOs, or stubbed functions
- [ ] Changelog fires on date/status/channel/name changes
- [ ] Tentative vs confirmed events are visually distinct
- [ ] Collision detection triggers correctly on seeded overlapping events
- [ ] Responsive on mobile widths
- [ ] Build passes clean; no console errors on any view

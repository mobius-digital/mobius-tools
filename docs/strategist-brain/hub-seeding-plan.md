# Creator link seeding plan: the hub fed from reviewed briefs (2026-10-07)

NOT the Locus hub plan (that is docs/locus-hub/plan.md). Item 5 of the Strategist build order ("Creator-link (hub) seeding from a reviewed brief").
The Meta push from Studio is the other half of that item and is NOT in this plan.

## Where it stands

- The Strategist already has four hub actions in `account-health/worker/src/strategist.js`:
  `create_angles` (write N new angles for a section), `update_angle`, `update_section`,
  `retire_angles`. Nothing links a brief to the hub.
- `create_angles` still writes the PRE-rebuild angle shape (title, argument, who, products,
  format, lever, three openers, shots, on_screen, do, don't) and publishes `status = 'live'`
  on Apply. The 2026-10-06 rebuild (v12 to v17) reads `visual_hook`, `rehook`, `why`,
  `inspo_json` and `alt_hooks_json` as "The first second / At 3 seconds / Why it works /
  Watch first / Or open with". An angle made by `create_angles` today renders with empty
  steps, no proof and no inspiration, which the seed library's `check()` refuses to seed.
- The playbook's "THE ANGLES HUB" block describes the old shape too.
- A brief lives in two places: the Locus test-library row (`p_br_batch`: num, title,
  angle_id, concept_id, level, variable, hypothesis, why, stage, verdict, learning) and the
  Asana task (the template text). The `brief` view already joins them by number.
- Every brand was trimmed to 20 LIVE ideas on 2026-10-06; the rest sit as drafts. Public proof
  is video only. No money on the public link.

## The plan, in order

### 1. One angle shape everywhere (prerequisite)

- `create_angles`: prompt and INSERT move to the v17 shape. Keep title, argument, who,
  products, format, lever, on_screen, do, don't. Add `visual_hook` (what is physically on
  screen in the first second, written as an instruction: "Open on..."), `rehook` ("At 3
  seconds, ..."), `why` (the proven shape it rests on), `alt_hooks` (2 alternates),
  `inspo` ([{brand, what, url}]). Drop the separate openers list in the prompt; the first
  opener becomes `visual_hook`'s "Say this first" line, the other two become `alt_hooks`.
- Playbook "THE ANGLES HUB" block rewritten to the same shape, plus the two standing rules
  the page now enforces: an idea needs proof or an inspiration link before it goes live, and a
  brand carries 20 live ideas at most.
- `create_angles` Apply inserts as `status = 'draft'` unless `live: true` is passed and the
  cap allows it (see 5). Today it goes straight live; after the rebuild that is wrong.

### 2. New action: `hub_from_brief`

Input: `brand`, `number` (the brief), optional `section` (name, existing or new),
`hot` (pin to Film these first), `live` (default false), `summary`.

Propose:
- Resolve the brand; read the `brief` view (Locus row + live Asana task). Refuse when there
  is no task and no row.
- Map the brief to ONE idea in the v17 shape, words kept as the strategist wrote them:
  - Angle (the argument) = `argument`; the brief title = `title`.
  - Concept (how it is shown) = `format` chip + `visual_hook` (the first second).
  - What we're testing + why = `why`.
  - The numbered ads = `shots` (How to film it, steps 2 to 5: say this first, at 3 seconds,
    middle, close). The first ad's opening line = the spoken part of `visual_hook`; the other
    ads' openings = `alt_hooks`.
  - Guardrails = `do` / `don't`. Copy lines = `on_screen`.
  - Inspiration links in the brief = `inspo_json` (brand / what / url). An Atria link gets
    the "Pull the video in" treatment on Apply (`POST /api/atria/clip-to-angle`).
  - `who` and `products` from the row's angle/concept or the brand brain; `lever` = the
    row's `level` + `variable`, staff only.
- Proof: when the brief's stage is `live` or `done`, find its ads (name carries the number,
  plus `p_br_adtag` manual tags), keep the VIDEO ones, and queue them as `p_amb_proof` kind
  `meta`. A brief at `idea` or `production` has no proof yet; it needs at least one
  inspiration link, or it stays a draft with "needs a video" in the card.
- Section: use the one passed; otherwise the Strategist picks by the hierarchy rule (a dated
  window if the brief names one, else the durable lane the brief's product or theme belongs
  to) and SAYS which in the card. Never defaults to Hot; Hot is a pin, not a home.
- Duplicate check: refuse when a live or draft idea on that hub already has the same title
  or the same argument (case-insensitive), and name it.
- The card shows the idea in full, the chosen section, the proof it will attach, and
  whether it lands live or draft.

Apply: insert the angle (draft by default), attach proof, store the inspiration, write the
link back (3). Note: "Brief 412 is on Dartee's hub as a draft in The Muni. Flip it live on
the Ambassadors tab, or say 'make it live'."

### 3. The link back (migration `brand-00X.sql`)

- `p_br_batch.amb_angle_id TEXT` (nullable). Set by `hub_from_brief`; cleared when the idea
  is deleted on the Ambassadors tab.
- Staff tab (`profit/amb.js`): a "From brief 412" chip on the idea editor, linking to the
  Tests sub-tab row. Tests sub-tab: an "On the hub" chip on the batch row.
- The Strategist's `tests` view returns `on_hub` per row so it can answer "is this on the hub
  already?" and the `angles` view returns `brief_num` per idea.

### 4. Where it gets triggered

- Slack / Locus chat: "put brief 412 on Dartee's hub", "seed the hub from 412", "make 412 a
  creator idea". Routing is the normal Strategist tool pick; add the phrases to
  `test-strategist.mjs`.
- Verdict WINNER on the Tests sub-tab: the learning card gets a one-line nudge, "Winner.
  Put it on the creator hub?" with an Apply that runs `hub_from_brief` with `live: true`.
  A nudge, never automatic; the media buyer still decides.
- A reviewed brief posted back into Asana (item 4 of the build order) can carry the same
  nudge later. Out of scope here.

### 5. Guard rails (carried over, not new)

- 20 live ideas per brand: with 20 already live, Apply inserts a draft and the note says why.
  `live: true` never evicts another idea.
- Proof-less and inspiration-less ideas never go live (mirror of `check()`).
- No money in `publicPayload()`. Unchanged; the new fields carry none.
- Never switch a live link off; never re-run a seed. The action adds one idea, it never
  replaces sections.
- No em dashes in anything written to the hub (clip on the way in, like the brain).

### 6. Tests and deploy

- `test-strategist.mjs`: brief fixture to v17 shape (every field lands where the plan says),
  stage `idea` with no inspo stays draft and says "needs a video", stage `done` attaches video
  ads only, duplicate title refused, cap of 20 forces draft, `create_angles` writes the new
  fields and lands as draft.
- Deploy: account-health worker (the action, the playbook, the views). profit worker: the
  migration and the two chips. `angles/` public page: no change, it already reads the shape.
- Effort: about half a day end to end; step 1 alone is an hour and is worth doing on its own.

## Calls that are Cole's

- Draft by default, or live when the brief is a WINNER? Plan says draft always, live only
  when asked.
- Should the WINNER nudge exist at all, or is "put 412 on the hub" in Slack enough?
- When a brief names no section and the brand is one-product (Party Patch), the Strategist
  picks an occasion lane. Fine, or always ask?

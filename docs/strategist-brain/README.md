# The Strategist brain (2026-10-07)

Cole, 2026-10-07: "this is the same core strategist within Locus, it just has different
functionalities... it should be able to do everything that we connect it to." One brain for
the numbers, the research, the creative framework, the briefs, the Studio, the scenarios, the
reports and the ideas pipeline. This folder holds the knowledge it was built from and the
state of the build.

## What is in this folder

- `source-testing-framework.md`: Mobius's creative testing framework in Cole's own words,
  pulled from the sessions of 2026-09-24 to 2026-10-05 (angle = the argument, one wording per
  argument; concept = how it is shown; what we're testing = the one piece that changes; why we
  test this way; the Andromeda rule; the Asana brief shape; numbering; how winners are judged;
  how a strategist reviews a brief).
- `source-lucky-account-structure.md`: the post-Andromeda account structure and testing rules
  set on Lucky Golf on 2026-10-04 (one Sales campaign, one test = one ad set, 5 tests a week,
  minimums, the two-line judging rule, the weekly routine, product pushes, when to split).
- The `mobius-brief-review` skill (Cole's machine, anthropic-skills plugin) is the written
  framework; its text is folded into the Strategist's playbook.

## What shipped 2026-10-07 (account-health/worker/src/strategist.js)

- PLAYBOOK: "Thinking like a strategist" (judge, then recommend; gaps are findings; build, do
  not describe), the full framework and review workflow, "How accounts are run" (the doctrine
  above), the hub rule. No stored playbook override exists in D1, so the code copy is live.
- Views: `tests` (the test library + angle library, searchable: "have we tested this?"),
  `brief` (one brief by number: Locus row + live Asana task + blank template lines),
  `customers` (tw_orders: repeat rate, order number, time to second order, sources, first and
  second carts), `scenarios`, `brain` (the brand brain in parts).
- SQL: the brand workspace tables, tw_orders, tw_ad_attr, p_scenario, p_studio_batch and
  idea_thread are now queryable.
- Actions (Apply cards in Slack and Locus): `fill_brief` (an existing Asana task by number,
  the approved words in the template, Testing field, assignee, blanks listed), `create_brief`
  (next number, Creative Briefs column), `build_scenario` (saves to the Scenarios tab, returns
  the share link), `studio_batch` (a draft batch in Studio).
- Slack tool `draft_from_thread`: the Strategist hands a thread with a reference to the ideas
  pipeline itself; nobody has to re-tag with the word "idea".
- Routing (ideas.js): "brief this" / "make a brief" / "draft it" with no media now go to the
  Strategist; with media they still go to the ideas pipeline.
- Tests: `node test-strategist.mjs` (10 checks), `node test-ideas.mjs` (53).

## Not built yet (in order)

1. DONE 2026-10-07: Settings > Connections (account-health integrations.js): agency-wide
   connections (made once) and per-brand ones (made at onboarding), each graded with the fix.
2. Triple Whale direct queries (cohorts, journeys beyond 400 days, Klaviyo flows): the worker
   has no SQL door into TW; the summary-page and orders endpoints are what exist. tw_orders
   covers journey and retention questions for now.
3. Shopify product titles for the cart product ids in the customers view.
4. A brief review posted back into the Asana task as a comment (today it is answered in Slack).
5. Creator-link (hub) seeding from a reviewed brief, and Meta push from Studio.

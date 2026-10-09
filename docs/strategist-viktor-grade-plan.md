# The Strategist, Viktor-grade: the plan (2026-10-09)

Cole's goal, in his words: "I want this thing to basically be Viktor grade in every single sense of
the word... it should be able to do literally everything that we need it to." The Strategist is the
one assistant for Locus and for Slack. No word lists deciding what it does or which model runs
(memory: judge-from-context). This file is the whole plan so an Opus session can build it without
re-researching. Read account-health/CLAUDE.md and profit/CLAUDE.md first; ask/engine.js is the engine.

## 1. What Viktor is (researched 2026-10-09, Cole's own account at app.viktor.com)

- Product: viktor.com, an "AI employee" in Slack. Ex-Meta founders, $75M Series A (Accel).
- Model, Cole's setting: preset "Smart" = **Claude Opus 5.5, medium reasoning**. Presets: Ultra = Opus 5.5
  high, Balanced = Opus 5.5 low, Cheap = GPT-6 Luna. `!fast` in a Slack message = Balanced (Opus 5.5 low);
  `!deep` = the default. Model choice is per workspace, by the person, never by keywords.
- Cole's 30-day usage: 103,933 credits = ~$260 (at $2.50/1K). 3,464 credits/day. 99% threads, <1% scheduled
  tasks. Opus 5.5 did 89% of the work, Opus 5 10%. Cole 97k credits, Ahsan 6.7k, Radhesh 119. Viktor's own
  quote for a big job (122-static review + 17 Asana tasks): "$2-5 in credits". +105% vs the previous period.
- Behavior page: workspace instructions EMPTY (0/4000). Skills page: ZERO skills. So everything Viktor
  "knows" about Mobius comes from what it reads live, not from taught rules.
- Integrations connected (21): Google Ads, Drive x3, GitHub RO, Stripe, Triple Whale, Meta Ads, Asana, Canva,
  Figma, Fireflies, Frame.io, Gmail x3, GA, Calendar, Docs x3, Search Console, Sheets x3, Gorgias,
  Instagram x2, Klaviyo x2, Shopify x2.
- How it works (viktor.com/product, ai.engineer/orgs/viktor, reviews): a private Linux sandbox per task where
  it writes and runs code; shared workspace memory kept as short markdown "skills" (one job each, loaded
  only when the ask matches its description; "lazy loading" keeps integration docs out of the prompt until
  needed); it reads the Slack channels it is in; irreversible actions pause for an approval card ("Always
  approve" toggle); outputs are files in the thread or hosted "Viktor Pages" (mobius-digital-da69b5.viktor.page)
  and "Spaces" (small apps); scheduled tasks; screen-record a job once -> a skill.
- What it did well in Cole's Slack: recalled Ahsan's 9/20 and 9/21 folder links unasked; "the Performer link is
  the one from #bonk (9/22)"; "the Dartee brand kit says no customer numbers"; cross-checked Meta activity
  logs across two ad accounts against the Slack roster; audits with hosted PDF + mockups; deleted 18 Bonk
  creatives in Dartee behind approval cards; exported 51 Canva PNGs to Drive + 13 Asana tasks and read them
  back. Asks questions AFTER doing the work, with a default beside each ("say go with defaults").
- What it did badly: Frame V2 unsupported, Shopify/Meta reconnect loops ("Try again" x6), duplicate Asana
  tasks on timeouts (Ahsan: "creating some confusion"), missing Frame links in tasks.

## 2. Where our Strategist is today (and why it felt dumb)

- Model: Haiku 4.5 unless a keyword matched (fixed 2026-10-09: Sonnet 5.5 always; "deep" = Opus 5.5).
- Routing: a word list sent tags to the ideas bot (deleted 2026-10-09; every tag -> Strategist).
- Context per question: the one Slack thread (24k chars), the brand brain (<=60k chars, cached), the
  playbook, live views on demand. It cannot see any other thread or channel.
- Memory: the `remember` tool exists; `settings.strategistNotes` DOES NOT EXIST. It has never saved a fact.
  Memory is one global list (25 shown), not per brand.
- Capability: ~35 hand-built actions (goals, angles, briefs, calendar, stock, dashboards, scenarios...).
  No Slack search, no file output except reports/dashboards, no Meta writes, no Canva/Frame/Drive writes.
- Reply: eyes emoji, then one message. No ack line, no done/not-done split, no links on everything, no offer.

## 3. The design (answers to Cole's worries)

### 3a. Model: Opus 5.5 medium by default, the person overrides
Same as Viktor. `model: claude-opus-5-5` for every question (effort medium); `quick` in the message =
Sonnet 5.5; `deep` / `think hard` = Opus 5.5 high. Never keyword-picked otherwise.
Cost (our shape: 20-30k cached input, 1-3k out, 1-6 tool rounds): simple lookup ~$0.10-0.20, a judgement
answer ~$0.30-0.60, a multi-step build (report + Asana + memory) ~$1-2. At today's 8-10 questions/day:
**$60-150/month**, under Viktor's $260 because the brain is prompt-cached and there is no sandbox cost.
Show the cost in the thread footer like the ideas bot does ($0.xx this run).

### 3b. Context: a big store, a SMALL prompt (this is how Viktor avoids "overload")
Rule: the database can be as big as it likes; what reaches the model per question is capped and chosen.
Three layers:
1. ALWAYS ON (cached, deterministic, hard caps): playbook (~8k), the brand brain (60k cap, already
   deterministic), the brand's memory file (cap 40 facts, see 3c), the last 14 days of the brand's internal
   + client channel as a compact digest (cap 6k chars: one line per message, newest last; built by the
   hourly cron, not per question). Total ~25-30k tokens, cache-read at a tenth of the price.
2. ON DEMAND (the model asks, only when the question needs it): `search_slack` (as Cole, SLACK_USER_TOKEN,
   search.messages across every channel Cole is in incl. client channels and DMs; returns the 10 best hits
   with permalinks), `read_thread` (any thread by permalink), the existing views (tests, customers, brief,
   knowledge topics, stock, calendar...), `read_file` (a Slack/Drive file by link: images to the model,
   PDFs/docs to text, videos to the ideas pipeline).
3. NEVER IN THE PROMPT: raw tables, full channel history, old reports. Reached only through a tool.
Index for speed: an hourly job copies new messages from every channel the bot is in (and Cole's channels
via the user token) into D1 `slack_msg` (channel, ts, user, text, permalink, files), 90 days rolling.
`search_slack` queries D1 first (LIKE / FTS), Slack's API second. This is what lets it answer "what did
Ahsan say about the Bonk folder" in one call.

### 3c. Memory that stays concise and current (Cole: "I don't want a huge database that confuses it")
Viktor's trick is short files loaded only when relevant, plus corrections written back. Ours:
- Per-brand memory + one agency memory, each a list of facts `{id, text, at, source, topic}`. Caps: 40
  per brand, 40 agency. The model sees them as a dated bullet list.
- `remember` becomes an UPSERT: it carries `topic` (free text like "free shipping threshold") and REPLACES
  an existing fact on the same topic instead of appending. A changed fact is never kept beside the old one.
- A `forget` tool; and facts carry `until` for anything with a date (a sale, a launch) so they expire.
- Playbook rule: save every fact, decision, correction and preference you are told; when corrected, fix the
  fact, do not add a second one. Say "noted" in one line.
- Nightly consolidation (in the existing nightly pass, Sonnet): read the day's threads the bot was in,
  propose facts worth keeping, merge duplicates, drop expired ones, keep each brand under its cap. Writes
  go through the same upsert. Cost ~$0.05/night.
- Visible and editable: Locus > Settings > The Strategist > Memory (per brand): list, edit, delete. Cole
  can see exactly what it knows, which is the real answer to "is it updated properly".
- Nothing else is "learned" silently. Rules live in the playbook (code) and the brain (Brand tab), both of
  which Cole already controls.

### 3d. Capability: everything Locus can do, then the outside tools
- ONE generic `locus_api` tool: GET any route the Locus screens call (read), and POST/PUT/DELETE behind
  the existing proposal card (Apply = the same request the screen would send, as the caller). The route
  list and what each does is generated from the worker's fetch switch + profit worker, lazy-loaded (the
  model asks for the route list for an area first). This replaces building an action per button.
  Keep the hand-built actions that add judgement (create_angles, fill_brief, build_scenario).
- Files out: PDF (a report rendered by the profit worker's print view -> PDF via Cloudflare Browser
  Rendering), xlsx/csv (SheetJS in the worker), PNG contact sheets (Images binding). Uploaded to the
  thread with files.upload and kept in R2. Hosted pages = the existing report/dashboard share links.
- Files in: Slack uploads and Drive links (expandDrive exists), PDFs and docs to text.
- Outside writes, each behind the approval card, in this order: Asana (exists), Google Drive/Docs/Sheets
  (service account exists), Meta Ads pause/budget/delete (the Meta MCP shape; activity-log every write),
  Klaviyo (read exists; writes later), Canva export (p_studio_cfg canva_*), Frame (V2 API).
- A sandbox for "anything else": Cloudflare Workers Sandbox (containers) or Anthropic's code execution tool
  for one-off scripts (CSV maths, chart images). Phase 5; not needed for the first four.
- Scheduled questions exist (askschedule.js); add "schedule this" for any action, not only questions.

### 3e. Reply shape (= what the Slack answer looks like)
- First message within 3 seconds: one line saying what it is doing ("On it, reading the Dartee thread and
  the brand kit") in place of only the eyes emoji.
- The answer: short headers in bold, every file/task/page/ad as a link, numbers to the dollar.
- Three explicit lists when it did work: DONE / NOT DONE / COULD NOT REACH (and why, e.g. "Frame link is
  view-only").
- Questions only after the work, each with a default ("say go with defaults").
- Always end with one offer of the obvious next step.
- Cost footer like the ideas bot.

## 4. Build order (each a deployable step; test files alongside)

1. Model + reply shape: Opus 5.5 default, quick/deep overrides, ack line, DONE/NOT DONE/COULD NOT REACH,
   cost footer. (strategist.js config + PLAYBOOK, engine answerSlack). Half a day.
2. Slack context: `slack_msg` index (hourly, 90 days), `search_slack` + `read_thread` tools, the 14-day
   brand digest block. Needs `search:read` on the user token (check; if missing, Cole re-authorises the
   app). One day.
3. Memory: per-brand facts with topic upsert, forget, expiry, caps; nightly consolidation; Locus Settings
   > The Strategist > Memory screen. One day.
4. `locus_api` generic tool with the lazy route list + approval cards; files out (PDF, xlsx, PNG) with
   files.upload; files in. Two days.
5. Outside writes: Meta (pause/budget/delete), Drive/Docs/Sheets, Canva export, Frame V2; then the sandbox.
   Two to three days.
6. Scheduled actions; "teach it a skill" = a `skills` table of short how-to files the playbook loads by
   description match (the Viktor skill model), editable in Locus.

## 5. What Cole decides / owes
- Opus 5.5 as the default (money): yes/no.
- Re-authorise the Slack app with `search:read` if the user token lacks it.
- Meta write access: the system user needs ads_management for pause/budget/delete.
- Viktor: keep for now; switch off once 1-4 are live and judged. ($260/month.)

## 6. How the "brain" actually works (Cole's question, 2026-10-09, plain words)

Cole's picture is right: it is a network with an index, not one huge file read every time.
- The STORE is big and lives in D1/R2: every Slack message (90 days), every brand's research, tests, orders,
  ads, reports, memory facts, knowledge files. Nothing is deleted to keep the prompt small.
- The PROMPT per question is small and fixed in shape (~25-30k tokens, cache-read): who it is, how to think,
  the brand brain, the brand's 40 facts, a 14-day digest of the brand's channels, and a MAP of what else exists
  and how to reach it (tool list + view blurbs, one line each). That map is the "knowing where to go".
- LOOKUP is the model's own call, one tool at a time, up to 8-10 rounds: it reads the question, decides
  "this needs the Dartee thread from 9/20" -> search_slack -> read_thread; "this needs the test history" ->
  tests view. Each lookup returns a capped slice (10 hits, one thread, one view), never the whole store.
- SAVING is deliberate and tiny: only facts worth keeping, upserted by topic, capped per brand, consolidated
  nightly, visible in Locus. Threads are never "saved into memory"; they stay in the index and are found
  when needed. So memory cannot bloat, and a changed fact replaces the old one the day it is said.
- Viktor does the same: its skills are short files matched by description; its tool docs load lazily; it
  searches Slack live. It does not keep your whole workspace in the prompt either.
- Cost of context: the always-on block is cache-read (~$0.03 a question on Opus 5.5); each lookup adds
  ~2-6k tokens (~$0.01-0.03). The 90-day Slack index is a few MB in D1: no storage concern.
- Judging what to look up: the playbook tells it the order (read the brand digest first; search Slack
  before saying "I don't know"; read the knowledge file before advising on a channel; quote the evidence).
  Opus 5.5 is good at this when the map is clear and the tool descriptions say WHEN to use each one.

## 7. Showing that it is working (the "animation")

Viktor's web chat shows a live step line while it runs ("Used Slack, ran a command"), a STOP button, the
model picker in the composer ("Smart"), and "You stopped after 6s". In Slack it posts an "On it..." line first.
- Slack: post the ack line immediately, then EDIT it as steps happen ("Reading the Dartee thread... Checking
  Triple Whale... Writing"), finally replace with the answer. Slack's assistant status
  (`assistant.threads.setStatus`, "is thinking...") where the app has the Agents & AI Apps feature on.
- Locus (ask-ui.js): stream tool steps as a live line under the question (one per tool call, with the tool's
  plain name), a pulsing dot, a Stop button that aborts the loop, elapsed time, the model chip in the composer
  (Smart / Quick / Deep; chosen by the person). The engine already loops tool calls; emit a step event per call.

## 8. Settings the person controls (mirror Viktor's settings surface)

Locus > Agency settings > The Strategist:
- Model: presets Smart (Opus 5.5 medium, default), Quick (Sonnet 5.5), Deep (Opus 5.5 high); which preset
  "quick" / "deep" in a message means. Cost estimate shown per preset, actual cost shown per answer.
- Instructions: workspace instructions (free text, 4000 chars) appended to the playbook; per-brand instructions
  on the Brand tab.
- Memory: per-brand facts, agency facts; edit, delete, "forget everything about X".
- Permissions: who can tag it, which channels (internal only today), who can approve writes (IDEA_APPROVERS
  today), "always approve" per action kind for Cole.
- Usage: questions/day, cost/day, by person, by brand, by model (we already log inTok/outTok; add cost rows
  per answer like idea_run).
- Skills: the taught how-tos (step 6 of the build order).
- Connections: exists (Integrations page).

## 9. Locus UI: Viktor-grade polish (Cole: "that's what we need for Locus")

Reference screenshots: docs/viktor-reference/ (home, integrations, settings-model, settings-permissions,
usage, chat-working-state). What makes Viktor read as "a real professional app", and the Locus equivalent:
- One icon system, outlined, 1.5px, consistent size, one per rail item and one per settings row (Viktor uses a
  Lucide-like set). Locus: adopt Lucide (or Phosphor) everywhere, delete the mixed emoji/SVG icons.
- Real brand logos on integrations (Google Ads, Drive, Meta, Shopify, Klaviyo, Asana, Canva, Frame, TW, Atria,
  TikTok...): a card per integration with the logo, name, "N accounts connected" and a green dot. Locus
  Integrations page: same grid, same card, logos as SVG in /profit/logos/.
- The home composer: a big rounded input "Ask the Strategist", a + (attach / pick brand / pick view), a mic
  (speech-to-text via the browser's SpeechRecognition), four suggestion chips under it (Summarize my week,
  Prep my next client call, Schedule a daily report, Build a report), "Pick up where you left off" recent
  threads. The Strategist becomes the front door of Locus Home, with the dashboards below.
- Left rail like Viktor's: product name, search, rail items with icons, a Chats section (recent Strategist
  threads), account + settings gear at the foot. Locus already has the rail; align spacing, weights, hover.
- Settings: left sub-nav grouped PERSONAL / WORKSPACE / EXPERIMENTAL with an icon per row, content column with
  section headers in small caps, toggles, segmented controls, "Save changes" per section.
- Typography and space: one sans (Viktor uses a geometric sans), 15px body, generous padding, hairline borders,
  very light grey surfaces, one accent (Viktor purple; Locus keeps its accent token).
- Motion: subtle fade/slide on page change, the working-state pulse, skeletons while loading.
- Chat view: the question right-aligned in a soft bubble, steps as a quiet grey line, answer in prose with
  tables, the composer pinned at the bottom with the model chip.
Build this as its own step (7) after the Strategist steps, or in parallel in a second session: it touches
profit/index.html + mobius.css + ask-ui.js only.

## 10. Parity audit: what Viktor has, what we have, what is a gap (Cole: "nothing going unnoticed, no capping ourselves")

| Viktor | Us today | Plan step | Note |
|---|---|---|---|
| Opus 5.5 medium default, person overrides | Sonnet 5.5 (was Haiku) | 1 | Opus 5.5 default |
| Reads every channel it is in, searches Slack | one thread | 2 | search_slack, read_thread, 14-day digest, full index |
| Shared workspace memory, corrections written back | none saved, ever | 3 | per-brand upsert memory + nightly consolidation + Locus screen |
| Skills (teach once, matched by description; screen-record to skill) | playbook only | 6 | skills table, taught in chat; screen recording later (Gemini watches the recording) |
| Private Linux sandbox, writes and runs code | none | 5 | Workers sandbox / Anthropic code execution for one-off scripts |
| 3,200 integrations | Meta, TW, Asana, Klaviyo, Drive SA, Canva, Atria, Frame status, Supply, Shopify (Supply) | 4-5 | build each one we actually use; the long tail is irrelevant to Mobius |
| Approval card on irreversible actions, "Always approve" | approval card exists | 4 | add Always-approve per action kind, Cole only |
| Files in: images, PDFs, docs, videos, Drive | images, Drive, docs (ideas path); no PDF | 4 | PDF/docx to text in the worker |
| Files out: docs, PDFs, xlsx, PNG, hosted Pages, Spaces | reports + dashboards with share links; PNG contact sheets in ideas | 4 | PDF via Browser Rendering, xlsx, files.upload; Pages = our share links; Spaces = Locus itself |
| Scheduled tasks and crons | scheduled questions | 6 | schedule any action |
| Web chat + Slack + Teams + API | Locus chat + Slack | - | API = the worker /api/ask already; Teams not needed |
| Slack DMs with the bot | DMs route to the Ledger | 2 | DMs to the app go to the Strategist; Ledger keeps money by its own tool map, or merge later |
| Slack Connect (client) channels, drafts for approval | silent in client channels by design | 5 | optional: draft-for-approval in client channels, never auto-post |
| Web search / browse | market.js only (Haiku web search for the Day check) | 4 | web_search + read_url tools for the Strategist |
| Voice (web mic), phone | none | 7 (UI) | mic in the Locus composer via SpeechRecognition |
| Email (its own inbox) | none | later | not needed; Gmail reads via the service account if ever |
| Usage dashboard by person/model/task | inTok/outTok per day only | 8 | cost rows per answer, Usage page |
| Permissions (who can use, guests, DMs) | approvers list | 8 | Strategist settings page |
| Live working state, Stop button | eyes emoji | 1 + 7 | step line edits in Slack, streamed steps + Stop in Locus |
| Asks after doing the work, defaults attached | asks first sometimes | 1 | playbook rule |

Where we are BETTER already and must not lose it: the brand brain (research, personas, VOC, tests, TW
attribution) is far deeper than anything Viktor reads live; the Locus screens and their math; the ideas
pipeline (Gemini watches video for cents); creator links; the Daily Brief and report engines; paid-orders truth.

## 11. The 90 days question, and "nothing is thrown away"

- "90 days" was only the FAST LOCAL INDEX (a copy of Slack in D1 for one-call search). It was a default,
  not a limit. Storage is trivial (a year of this workspace's Slack text is tens of MB), so: KEEP FOREVER.
  The index grows; a question only ever pulls 10 hits from it.
- Slack keeps everything anyway, and search_slack falls back to Slack's own search (as Cole) for anything
  the index lacks. Nothing is forgotten.
- "Nothing is thrown away to keep things small" meant: we never shrink the STORE to protect the model. We
  shrink only what goes into one prompt, per question. The store can be any size.
- Memory facts are the one place with a cap (40 per brand), because they go into every prompt. Old facts
  do not vanish: a replaced fact goes to a history table (who said it, when, what it replaced) so the
  Memory screen can show the change.

## 12. Design language for Locus (Viktor, Trendtrack; not a copy of either)

Reference: docs/viktor-reference/ and docs/trendtrack-reference/ (home, explorer table, the shop popup:
top, cards). What the two share, which is what "clean and modern" means here. Write it down as a design
system (profit/DESIGN.md + tokens in mobius.css) and apply it screen by screen:
1. One icon set, outlined, 1.5px stroke, 16/20px, never emoji as UI. Real brand logos where a brand is
   named (platforms, apps, shops), as small rounded squares.
2. Surfaces: white cards on a very light grey canvas (#F7F7F8), hairline borders (1px, 6-8% black),
   radius 12-16px on cards, 999px on chips, soft shadow only on popups. No dark panels, no heavy borders.
3. Type: one geometric sans (Inter / Geist), 13-15px body, 600 weight for names, grey-500 secondary,
   small-caps labels (11px, letter-spaced) for section headers like ACTIVITY, BOARDS, ADVERTISING.
4. Density by chips: facts as pill chips with an icon (6 yr, Fashion, 3.7 stars, 304K, $1.9M), stat
   triplets in a row, a sparkline beside the number. Tables with an icon per column header, logos in
   rows, tiny thumbnails, green/red trend lines in the last column.
5. Popups are full sheets, not small modals: a wide sheet over the page (Trendtrack's shop view) with its
   own left sub-nav (Overview, Similar, Meta, Google, TikTok, Emails, Boards), a header row (logo, name,
   status chip; on the right Copy link, one primary green button, expand, close), two chart cards side by
   side with range pickers, then horizontal card carousels with arrows. This is the model for every Locus
   detail view (an ad, a brand, a test, a calendar date, a product).
6. Charts: smooth area lines with a soft gradient fill, one accent per series, dotted hairline grid,
   values labelled at peaks, period picker as a chip (Last 6M, Weekly).
7. Composer / front door: big rounded input with +, mic, send; suggestion chips below; recent items list.
8. Motion: 150-200ms fades and slides, skeleton loaders, a pulsing dot for "working". The working animation
   can be ANYTHING in Locus (SVG, Lottie, step lines, a progress bar); in Slack it is limited to text
   edits, emoji and status.
9. Empty states: one line, one icon, one button.
10. Navigation: thin icon rail (Trendtrack) or icon + label rail (Viktor); Locus keeps its rail, tightens
    it to icon + label, 40px rows, active state as a soft pill.
Order: tokens + icon set + card/chip/table/sheet primitives first (one CSS), then Home, Integrations, the ad
popup, the brand popup, Settings. Every new screen uses only the primitives.

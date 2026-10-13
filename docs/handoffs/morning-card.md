# The morning card: one Slack post per brand, sent before Cole wakes up (handoff, 2026-10-13)

Start a worktree. Read this file, then profit/CLAUDE.md and account-health/CLAUDE.md sections dated 2026-10-12 and
2026-10-13 (the cadence reset, Today's calls in Slack, Action items, the fourth pass). Cole APPROVED the proposal page
https://claude.ai/artifact/Fn8JrdMJnMNtYMpjBYSaWG (read it with the Artifact tool, `action: "read"`). Build it, deploy
both workers, commit, push, then report to Cole in SHORT bullets (what changed, what he must do).

House rules: no em dashes anywhere (code comments, UI copy, Slack text, prompts, commits); in-app modals only; v2 tokens
only in Locus CSS; judge from context, no keyword lists for AI routing; simplicity over features. Deploy, commit and push
without asking; merge origin/main before deploying both workers. Commit messages end with
`Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Push with
`git -c credential.helper= -c credential.helper='!gh auth git-credential' push origin HEAD:main`.

## Why (Cole, 2026-10-13)

The internal channels are for people talking, and they are drowning. Measured in #dartee-internal on Oct 13: before
9am the bot posted 5 times (~60 lines: the whole client daily copied in at 6:03, Today's calls with 10 lines at 8:06,
three separate reminder posts at 9:08); the only human post was Noma's batches. Grunk looked the same. Cole wants
everything that reaches internal to be worth reading, and he wants Locus "there before you wake up" ("before I grab my
cup of coffee"). He wakes around 5.

## What to build

### 1. One send hour for every morning post (default 5am Central)
- One setting, `settings.morningHour` (Central, 0 to 23, default **5**), drives: the client daily brief, the weekly
  (Monday) and monthly (1st) report drafts, and the new morning card. Today these run off `briefHour` (6) with
  `REPORT_HOUR_OFFSET` 0; replace that with the one setting (keep reading `briefHour` as a fallback so nothing breaks
  on deploy, then set `morningHour` = 5 in D1). The hourly cron fires at :00, so 5 means the 5:00 tick.
- Check the data is ready at 5am Central before switching: yesterday ends at 2am Central for a Pacific brand; the brief
  already pulls the last three days of Triple Whale attribution before writing. Verify on one brand that a 5am run has
  the same numbers as the 6am one did (compare a stored brief against a dry run). If anything is not in yet at 5,
  say so to Cole rather than silently shipping thinner briefs.
- Locus: Agency settings > Slack and sending gets ONE control, "Morning posts go out at" (an hour picker, Central),
  replacing the brief time control. Cole sets it to 5 for Mobius; it is a setting so it can move.

### 2. The morning card (account-health, new `src/morningcard.js`)
One Block Kit message per active brand (not paused, not The Golf Sock, not Harborline) to its INTERNAL channel
(`brand_accounts.slack_channel`; never `brief_channel`; skip a brand whose internal channel is its client channel), at
the morning hour, once per Central day (state in settings like `todayDone`). Five content lines at most:
- Line 1: `<Brand> · <Weekday Mon D>`.
- Line 2 (numbers): yesterday's revenue vs plan, MER, and the client daily's state ("client daily sent 5:12", or
  "client daily waiting for your OK" when review-first). Same numbers as the brief (no new math).
- Then one line per thing a person must do today, each starting with the person's Slack tag (`<@U...>`, roster email
  -> `users.lookupByEmail`, cached): Today's calls as ONE line with the count and money at stake ("cut 9 ad sets,
  scale 1 · $2.4K at stake", read from profit `/api/hub/today` like todaypost.js), each task due today or overdue
  (p_action, like actionTick), a calendar date going live tomorrow with something still open, Production cards late
  (p_br_batch via production.js listBoard, late only). If there are more than 5 lines, keep the first 5 by money or
  lateness and end with "and N more in Locus".
- One "Client owes" line when a Requests ask is open (days waiting).
- Buttons: "Open <Brand> in Locus" (`?act=`), and "Make the calls" (`?open=today&act=`) when there are calls.
- On Monday the card also carries the weekly report line ("Weekly report drafted · write this week's plan in this
  thread") and the card IS the Monday thread anchor (today the weekly draft card is; move the plan-reading code in
  meetings.js `mondayScreen` that looks for the strategist's reply by `thread_ts` to read the card's thread instead,
  keeping the old anchor as a fallback for the first week).
- Under the card, in its THREAD (posted right after): the full Today's calls list (the text todaypost.js builds today)
  and one reminder line per owner with the existing Done buttons (`act_done_<n>`). Nothing else in the thread at 5am.
- Store `settings.morningCard:<brand>:<date>` = {channel, ts, items} so the rest of the day can find it.

### 3. The card keeps itself up to date
When an item is done (Locus tick, the Slack Done button, the ✅ reaction, a Today's call made on the page, a test
verdict), `chat.update` the card: that line struck through (`~text~`). Never post a new message to say something
changed. Reuse `handleActionButton` / `handleReaction` in actions.js; a ✅ on the card itself marks every task line done.

### 4. Everything later in the day goes in the card's thread
Change these to reply in today's morning card thread (with the person tagged, so they still get notified), and only fall
back to a top-level post when there is no card today: alerts (alerts.js `alertTick`), client requests / decisions /
replies (requests.js), approved-call notes (meetings.js `confirm`'s per-brand note), calendar client changes
(calendar.js `calendarTick`), new-client internal pings that are about an existing brand. Keep `chat:write`
`thread_ts` + no `reply_broadcast`.

### 5. Switch off what the card replaces
- todaypost.js (`settings.todayPost` = off; the card carries it), the 9am reminder posts in actionTick (the card thread
  carries them; keep the code path for agency-wide items that go to the Strategist channel), calendar's "Live tomorrow"
  internal post (the card carries it), the per-drag Slack line in production.js `moveCard` (remove it; the board is the
  record).
- **Bug to fix first:** the client daily DRAFT still lands in every brand's internal channel (Dartee Oct 13 06:03,
  Grunk Oct 13 06:04: "Sent to the client" cards with the whole brief). It should go to `settings.dailyBriefsChannel`
  (#daily-briefs, C0C8UA53U3W). Find why `draftBrief` (account-health worker.js) is not using it (setting unset? the
  post failing and falling back? auto-send brands skipping the draft path?), fix it, and confirm on the next morning's
  run. The internal card then only says "client daily sent 5:12".
- Viktor's Search Term Mining (Monday 8am in five channels) is NOT ours; Cole asked Viktor to delete it on 2026-10-13.
  Check on the next Monday that it stopped.

### 6. Locus
Agency settings > Slack and sending: the morning hour, a switch for the card (`settings.morningCard` on by default),
and "Preview this morning's card" for a picked brand (a dry run returning the Block Kit as rendered text, no post).
Remove the now-dead switches (todayPost, What moved) from that card.

## Tests and done
- New `test-morningcard.mjs` (Slack, PROFIT and D1 mocked): one card per brand, 5 line cap with "and N more", tags from
  the roster, thread contents, Monday line, update in place on Done and ✅, alerts and requests go into the thread,
  internal==client channel skipped, once per day.
- Keep passing: test-actions, test-production, test-clients, test-smoke, test-today, test-alerts, test-requests.
- Update both CLAUDE.md files (a dated section at the end) and the `operating-cadence` memory (send hour is now 5,
  configurable). Report to Cole: what changed, and that tomorrow's 5am card is the live test.

## Added 2026-10-13 by the leak finder session
- The leak finder is LIVE (account-health `src/leaks.js`, `GET /api/leaks?act=`). When this card is built, add ONE line when a NEW leak over $500 a month appeared since yesterday's card, tagged to its owner (`who`: Google buyer, Meta buyer, Strategist (site), Email owner), linked to Home > Day check. Compare leak ids against the ids stored on yesterday's `morningCard:<brand>:<date>`. Never a separate Slack post.

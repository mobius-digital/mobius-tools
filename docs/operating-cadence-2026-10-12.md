# The operating cadence, audited (2026-10-12)

Cole's team message set the new weekly rhythm. This is the audit of it, the decisions on Slack clutter and the
Monday call, the meeting-notes pipeline, and what Locus builds next, in order. Written for Cole and the team.

## 1. The week, corrected

| When (Central) | What | Who |
|---|---|---|
| Every day 6:00am | Daily Brief posts (changed today from 7am) | Locus |
| Every day 8:00am | Daily call | Team |
| Monday 6:00am | Weekly report draft posts to each brand's internal channel (changed today from 9am). Monthly on the 1st, same hour | Locus |
| Monday by 7:45am | Monday plan in each brand's internal channel, as a reply in the weekly report's thread | Ahsan, Noma |
| Monday by 7:45am | Google and Amazon update, same thread | Radhesh, Hamza |
| Monday 8:00am | Monday call, agenda in section 4 | Team |
| Monday after the call | Client report goes out with "This week" and "What we need from you" added | Cole sends from Locus |
| Monday afternoon | Briefs written (the batches were approved on the call) | Strategists |
| Tuesday | Briefs in Asana with due dates, kickoff calls booked the same day | Strategists |
| Tuesday or Wednesday | Kickoff call. Due date = kickoff + 2 full working days | Strategist + designer |
| Thursday or Friday EOD | Creative delivered | William, Ravo |
| Within 24h of delivery | One numbered feedback comment in Asana | Strategist |
| Friday | Strategist QC, Cole approves. If Cole has not answered by Monday 8am, strategist QC is the approval | Cole |
| Next Monday or Tuesday | Approved ads live | Strategists |

## 2. Holes in the team message

1. The message says Monday plans are due by 10am and the report is ready at 8am. The call is now 8am. Both
   times have to move: report 6am, plans 7:45am. Done on the Locus side today.
2. Tuesday briefs with a Wednesday kickoff cannot be live next Monday: kickoff Wed, due Fri EOD, feedback by Sat,
   revision Mon, live Tue. The message's own two-working-day rule says so. Either write the briefs Monday
   afternoon (the batches are already approved on the call) and kick off Tuesday, or say "live by Tuesday".
3. Revisions have no round limit and no turnaround for the designer. Add: one revision round, designer turns it
   in 24h, second round is a call.
4. "Drop your weekly update in here" for Radhesh and Hamza is unplaced. It goes in the weekly report's thread in
   the brand internal channel, so the Monday call reads one thread per brand.
5. Cole is the only approver on Friday. Name the fallback (strategist QC stands if Cole is silent by Monday 8am).
6. The week ends at "ads go live" and never says what the client hears. Section 5 fixes that: the client report
   carries the plan.
7. On-time delivery has no owner. It needs none: Asana due dates are the record and Locus reads them.
8. Google and Amazon have no daily rhythm. Fine for now; the weekly update covers them.

## 3. Slack clutter: the decision

The report lives in Locus. Slack carries the headline and the discussion.

- **Internal, daily:** the Daily Brief moves out of the brand internal channels into one agency channel,
  `#daily-briefs`, one short post per brand. Brand channels go back to being conversation.
- **Internal, weekly and monthly:** stay in the brand internal channel. They are the anchor: the Monday plan and
  the Google and Amazon updates are replies in that thread, so Monday is one thread per brand.
- **Client, daily:** three lines and an "Open in Locus" button. The full brief is in the client's Locus
  (the client edition shows everything for their brand).
- **Client, weekly and monthly:** the full report, sent after the Monday call with "This week" and "What we need
  from you" added. Still a real message: it is the deliverable.
- No canvases. A canvas is edited in place, so there is no history, no thread, nobody gets pinged, and it is
  invisible from the phone's channel list. Lists have the same problem. A short message plus a link does the job.

Build: a Slack thread option on the brief and report posts, the `#daily-briefs` route, the short client daily.

## 4. The Monday call: per brand, timeboxed

Per brand, not holistic. Action items, the client report and Locus are all per brand, and a holistic pass drifts.
Keep it tight with a fixed shape and a clock.

**Open (5 min, agency-wide):** the week's theme (a BFCM push, a Halloween batch for every brand), and any item
that touches every brand.

**Per brand (6 to 8 min, red brands first, green brands 2 min):**
1. Last week's action items: done or not. Locus shows them with its own read of done.
2. The read: the strategist gives three numbers and the winners and losers in their own words. Cole does not
   read the report aloud. Creative drill-down happens on the Ads page, sorted by spend, CTR or CPA, on screen.
3. The Monday plan: approve, change or push back. Batches get a product, angle, why, count, format, designer, due date.
4. New action items: owner, due date, internal or client-facing.

**Close (5 min):** cross-brand items, anything for Google or Amazon that was not per brand.

Six active brands at 7 minutes is about 55 minutes with the open and close.

**In Locus (Reports > Monday):** one screen, brand list on the left in attention order, the four items above per
brand with the weekly report inline, the action items as checkboxes, the Monday plan pulled from the Slack
thread. Mark through it on the call. Same screen every week. Ad hoc items get a free line.

## 5. Notes and action items: the pipeline

No hand-written notes. Fireflies is already on the calls and already connected to Claude, and it has a
"transcript ready" webhook. That is the trigger.

1. Call ends. Fireflies sends the transcript to the Locus worker.
2. Locus reads it against the Monday agenda and each brand's weekly report, and writes per brand: decisions,
   action items (owner, due, brand, internal or client-facing), and what the client owes us.
3. Cole gets one Locus screen (Reports > Monday > Notes) with it all as checkboxes, and one Slack line saying it
   is ready. He unticks what is wrong and presses Confirm. Nothing posts before that.
4. On Confirm:
   - Internal items become Asana tasks (owner, due date) in the brand's project, in an "Action items" section,
     and one line per brand goes to the brand internal channel.
   - Client-facing items become the "This week" section of that brand's weekly report. Cole presses Send to
     client as today.
   - Things the client owes us become Requests (the Home > Requests screen that already exists), which the client
     sees in their Locus and gets a Slack line about.
5. Next Monday, item 1 of the agenda is filled from this list with Locus's own read of what is done.

Fireflies vs Gemini: keep Fireflies for now. It costs $34 a month, has the webhook and the API, and is already
connected. Gemini "take notes for me" in Meet is free only if the Workspace plan is Business Standard or above
(check Admin > Billing). If it is, the transcript lands as a Google Doc in Drive, which Locus can also read, and
we can switch later with no change to the rest. Either way the summary and action items come from Locus, not
from the transcription tool, so it knows the brands.

## 6. How Locus knows a task is done

Three signals, no new task system.

| Action item | Signal Locus already has | Done when | Reminder |
|---|---|---|---|
| "10 to 15 Halloween ads per brand, briefed by tomorrow" | Asana sync (the Tests library) | 10+ tasks in the brand project since the call with Halloween in the name or tag | Slack to the strategist 24h before due if the count is short |
| "Cut ad set X" or "scale Y to $300" | Meta sync, hourly | The ad set's status or budget changed | Slack to the owner if unchanged by due |
| "Creative for batch Z due Thursday" | Asana task completion | The task is Completed, or marked done by the designer | Asana due date, plus one Slack line the morning of |
| "Client to send product photos" | Requests + Drive folder | Client marks it done in Locus, or a file lands in the brand's Drive folder | Slack line to the client channel 2 days out |
| "Approved ads live Monday" | Meta sync | New active ads in the account since the date | Slack to the strategist Monday noon if none |
| "Look into why CPA rose on Lucky" (no hard signal) | A checkbox in Locus, or a tick reaction on the reminder in Slack | The owner ticks it | Slack to the owner at due |

Locus can also prepare the work on confirm, with approval first: for a "brief Halloween ads" item it can draft
the Asana tasks and batch shells in Studio; for a "cut ad set" item it can hand the Apply card that already
exists. The strategist or Cole presses Apply. Locus never changes an ad account on its own.

## 7. Asana stays

Do not rebuild Asana inside Locus. William, Ravo and the kickoff notes live there, briefs and due dates live
there, and a task system is months of work that makes Locus busier, not clearer. Locus reads and writes Asana
(it already reads it for Tests). "Internal tasks" in Locus is a per-brand view of Asana action items, nothing
more. If Asana is ever dropped, that is a separate decision.

## 8. Kickoff calls and revisions: the SOP

One page in Locus, Settings > How we work, printable and linked from Slack. It holds the week, the Monday call
agenda, the kickoff agenda and the revision rules. No tracking screen for kickoffs.

**Kickoff call (strategist runs it, 15 to 20 min for a group of briefs):**
1. The idea in one sentence, and why we are testing it (what the report said).
2. Who it is for and how they should feel.
3. The two or three reference ads, and what to take from each.
4. The assets in Drive, and the brand rules that apply.
5. The designer's questions and their own pitch. A better way wins.
6. Agree the count, the format and the due date (kickoff + 2 working days).
7. The strategist leaves one Asana comment: agreed, changed, due.

The Asana comment is the record. Locus reads task comments already and flags any brief with no kickoff comment
one working day after it was created. That is how Locus knows the call happened, without a calendar hook.

**Revisions:** one numbered comment within 24h of delivery. One round. Second round on the same ad is a call.
Designer turns a round in 24h. Anything blocking is flagged in the brand channel 24h before due.

## 9. Locus fixes from the audit

**Monday review:** switched off today. It ran this morning for 9 brands (about $4), up to 8 Slack sections per
brand, and it duplicates what the strategists now write as the Monday plan. The weekly report plus the plan is
the system. If a short read is wanted later, it is the 250-word verdict that belongs at the top of the weekly
report, not a second post.

**Ads > Today's calls:** the Call rows send you to the Test calls page, which lights up the Meta tab and tells
you to set the result in Asana. Nothing can be decided in Locus. Fix: every row gets the same three choices,
"Do it" (the Apply card that exists on Meta > Campaigns, pause or budget change), "Open in Ads Manager", and
"Something else" (a free line that becomes an action item). Test calls get Won / Lost / Keep running buttons
that write the Asana result. Each row links to its ad set on the Ads page, not to the Meta tab. Today's list also
posts to Slack at 8am if it has anything.

**Meta > Ads, the Cut label:** the ad set's own verdict only shows on hover. Fix: the set verdict is a visible
chip on every card ("Set: missing goal" or "Set: on goal"), the role next to it, and "Cut" never shows on the
anchor of a working set. Today's calls and the Ads page also judge on different windows and attribution;
both will use the same rule.

**What is working, by tag:** AI tags from each ad's image and copy, grouped by format, hook, who is on screen,
product, offer, words. Three different "format" groupings sit on one page. Fix: one format (Meta's media type),
the card renamed "Which ingredients work", one line of explanation at the top.

**Season > War Room:** Plan and Live overlap with The Plan page (ladder, offers, check-ins, stock and alerts
appear twice). Fix: one Season item with three tabs: Plan (goals, budget, offers and dates, alerts, stock),
Live (the desk, hour by hour, spend, alerts fired), Call sheet. The numbered steps go from "7 steps" with a
missing 3 to a plain checklist. "Black Friday" stops being hard-coded.

## 10. Build order

1. Thread option on brief and report posts, the `#daily-briefs` channel, the short client daily. (Slack clutter)
2. Fireflies webhook into the worker, the Notes screen with confirm, Asana and Requests write-back, "This week"
   in the client report. (Section 5)
3. Reports > Monday agenda screen with the per-brand four items and done-tracking from Asana and Meta. (Sections 4, 6)
4. Today's calls and the Ads label fix. (Section 9)
5. Settings > How we work page. (Section 8)
6. War Room merge. (Section 9)

## What Cole decides

- Fireflies stays, or check the Workspace plan for Gemini notes. Either way, paste the Fireflies API key into
  the worker when it is time for step 2.
- The client weekly goes out after the Monday call with the plan in it, not at 6am. Yes or no.
- The client daily becomes three lines plus a link. Yes or no.
- Is there a daily 8am call every day, or only Monday? The table assumes every day.
- Strategists' timezone: a 6am report and a 7:45am plan is fine if they are ahead of Central. Confirm.

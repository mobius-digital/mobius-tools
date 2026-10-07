# Source: Lucky Golf Meta account structure and creative strategy (post-Andromeda)

Extracted 2026-10-07 from three Claude Code session transcripts in the Lucky Golf Affiliate Program project. This is a faithful record of what Cole and Claude worked out, in the order it happened, with Cole's own words quoted where he defines things. The final agreed system is in sections 5 to 9. Earlier versions are kept in section 3 because the reasons they were rejected matter as much as the final answer.

Where numbers come from a research agent rather than from Cole, that is said. Where a quote is a search-engine snippet rather than a page Claude read in full, the research agent said so and that caveat is kept.

## 1. The sessions

| Session file | Dates (UTC) | What happened there |
|---|---|---|
| `f4dd1c01-cb4e-46c6-8766-149ead7d0710.jsonl` (Lucky Golf Affiliate Program) | 2026-10-03 11:15 to 2026-10-04 12:43 | Creator-app build session. The account-structure debate started here on Oct 3 at 21:43 UTC when Cole challenged "only 3 ad sets total?" and asked for research into Theriot and "Benrarick". Three research passes, the angle/concept/variation definitions, playbook v1 and v2, the two-lane idea, the one-rule idea, the $10-per-ad vs $20-per-ad-set debate, the "minimums pile up" question. Ended with Cole moving structure work out of the creator app into its own session. |
| `ddf6bd61-f39d-422c-979e-d9e180dca66e.jsonl` (worktree intelligent-cori-2d706b) | 2026-10-04 12:28 to 17:59 | The dedicated "Meta account rules and automation" session. Research on what Theriot and Radack actually do, the Monday Slack message in Locus, the "Do it" button, Goals in one place, the full top-to-bottom SOP (revisions 1 to 3), a second-AI review and Claude's pushback on it, the two-line judging rule, number-first creator naming, and Cole's "we are overcomplicating this" correction. |
| `9763bdbd-7877-43a4-88df-f84445182891.jsonl` (Lucky Golf Affiliate Program) | 2026-10-06 11:08 to 13:08 | Creator-app UI session. Only touches structure where the launcher defaults were set to match the playbook: "Into Lucky Golf \| Sales, one new test ad set per club, $20/day minimum 7 days, paused", Asana test number typed at the ad set group header, ad sets named like `420 \| Carver 02 Gold \| CREATOR`. |

Supporting artifacts written during these sessions and read for this extraction:
- `Lucky-Golf-Meta-SOP.md` (revision 3, final, 2026-10-04) in the intelligent-cori worktree of the Affiliate Program repo.
- Playbook HTML (artifact https://claude.ai/artifact/HLFA5nB1MyiySsNWPDfkSw), versions v2 and final, in the f4dd1c01 scratchpad.
- Media buyer flowchart artifact https://claude.ai/artifact/85Mg1RMwmN6Pwpukhkv3Uf.
- Project memory note `meta-account-structure-research.md`.

## 2. The numbers the whole thing rests on (Lucky Golf, early October 2026)

From the Oct 3 pull of the last 90 days and the Oct 4 SOP:
- Spend about $450/day, about $14k/month on Meta.
- About 50 to 51 purchases a week account-wide (90 days: $51,945 spent, 659 purchases, 2.09x Meta ROAS).
- Goal cost per sale: $52 (Cole set it 2026-09-24 as average order value divided by 3.0 ROAS).
- Actual cost per sale: about $80 (last 30 days $13,534 spent, 163 Meta purchases = $83; Triple Whale last click 169 orders = $80; 90 days $79). Claude found this on Oct 4 and flagged that "the earlier 'CPA about $52' was the goal, not the actual."
- Spend by product (90 days): wedges 36% at 2.47x, putters 22% at 1.78x, homepage/other links 21% at 2.03x, black wedge 13% at 1.96x, hybrid 5% at 2.15x, apparel 2% at 0.55x.
- Purchases per week per club: wedges about 22, putters about 9, black wedge about 7, hybrid about 2. None near the roughly 50 per ad set per week Meta wants for learning.
- The problem the structure solves: in the last 28 days, ads under 2 weeks old got 2% of spend ($248 of about $12,000). New tests never got enough spend to be judged.
- The account on Oct 3: four campaigns. Black Wedge $200/day at 1.95x, Creator Campaign $150/day at 2.41x (the best), [MD] CBO $100/day at 1.85x, Valentines Day $100/day spending nothing. Claude paused Valentines Day on Oct 3 with Cole's permission. By Oct 4 the 30-day CPAs were: Black Wedge $88, Creator Campaign $65, [MD] CBO $99.
- Triple Whale vs Meta: over 30 days they agree within 4% (169 vs 163), so the pixel is not over-firing account-wide.

## 3. How the thinking evolved (why the final shape is what it is)

This matters for the strategist brain because each rejected version carries a lesson.

**3a. Early Oct 3 (before Cole pushed back): the agency-blog version.** Claude's first research pass for the creator-app launcher cited Jetfuel's "Andromeda playbook" and TopGrowth: two core campaigns, an Advantage+ Sales campaign for scaling with 60 to 70% of budget, a creative-testing campaign with 20 to 25%, optional retargeting at 10 to 15%; one ad set per product and launch date in the testing campaign, ABO with $30 to 50 a day per ad set, 3 to 6 ads per ad set, move winners by post ID. Claude itself labelled these "rough agency numbers, not Meta data." This was superseded the same evening.

**3b. Oct 3, 21:43 UTC. Cole's challenge.** His own words:

> "The campaign structure is very confusing to me. You are saying only 3 ad sets total? No min spend limits? Or anything? Just ads launched in there? ... how we used to do things used to be hey let's make a batch of ads it's going to be revolved around like an angle or a concept and we're going to make three variations of it ... Is it true that with the Andromeda update that it's kind of more along the lines of like test a ton of creative different formats once you find stuff that works then you can make a lot of iterations on it ... before every new ad set that we would make would basically be like an angle a concept and then three variations of it that would be an AD set or it would be an angle and then we'd have 33 concepts within that angle that we'd be testing ... do research like what is like meta actually saying for us to do right now and what have brands been seeing done like what is Nick Theriot do what does all these people Benrarick that we're seeing on X."

"Benrarick" was resolved to Ben Radack (@benradack); Cole confirmed: "your assumption on the person I was talking about is correct."

**3c. The first research answer (Oct 3).** The research agent's conclusion, in its words: "Your owner is mostly right, with one correction. Meta does want many genuinely different concepts in a few consolidated campaigns. But the practitioners who scale don't stop iterating on winners. Iterations still make up most of their output. They just don't count as 'new creative.'" Claude's summary to Cole: one campaign for the whole account, not one per club; "Ad sets are concepts again. Your old 'one angle or concept per ad set, a few variations' is right"; variations must really differ after Andromeda; yes to minimum spend ($10 to 20 a day per new concept ad set, Theriot uses $5 to 10, keep all minimums under about a quarter of budget); a Winners ad set; 3 to 4 new concepts a week (8 to 12 ads) on one launch day; about 80% fresh versions of winners and 20% new angles (Theriot); judge after 5 to 7 days.

**3d. Cole's product-push worry.** "how do I push more putters or wedges ... what's to say that the account isn't just going to hyper fixate on one particular product." Data answer: it already does (wedges take about half of spend under the current four-campaign setup). Claude proposed two always-on campaigns (Clubs at about $330/day plus retargeting and apparel at about $45/day) with a Winners ad set and concept ad sets each tied to one product.

**3e. Cole: "I'm so confused ... why have a winners."** He asked why a Winners ad set exists if each concept is its own ad set and a winning ad set just scales. Claude agreed and dropped both the Winners ad set and retargeting: "When a concept ad set wins, it just keeps running in its own ad set. Because the budget sits at the campaign, Meta moves more money to it automatically. That is the scaling. You don't touch it." Result: ONE campaign, every ad set is one concept for one product.

**3f. Cole's definitions (Oct 3, 22:40 UTC).** This is the exchange that produced the vocabulary. Cole:

> "do you know the difference between an angle and a concept where the angle is like the argument and the concept is like how you format the argument so like let's say the argument is for lucky golf ... the angle maybe is a longer driver won't make you a better player A better short game will and maybe the different concepts could potentially be a screenshot of a scorecard someone who got a new driver versus someone that upgraded their wedge game and then another concept could be a side by side video of someone who is really good at driving versus someone who is just really good at short game and then there's another concept that could be a just a simple headline calling out the exact argument and then a picture of the club ... these are different concepts ... could an ad set be an angle with multiple different concepts being completely different from each other Or ... an angle one particular concept and then variations of that concept ... that's the part where my strategists get confused 'cause they don't know exactly what to do."

Claude: "Your angle and concept definitions are exactly right. The angle is the argument. The concepts are the different ways to show it: the scorecard screenshot, the side-by-side video, the plain headline with the club. Those are three different concepts for one angle. Variations are small changes inside one concept, like a different opening line, a different creator, or different text."

**3g. Playbook v1 (Oct 3, 22:47 UTC): one ad set = one concept with 3 to 5 variations.** Each ad set is one concept, for one angle, for one product, with 3 to 5 variations that look different; creator UGC on angle X is one concept and each creator is a variation; 3 to 5 creators per ad set; naming `261006_LGW02_A03-ShortGame_C11-Scorecard` with ads `C11_V1_hook-lostball_BR`; read results at the variation, concept and angle level; "an angle is only dead after 2 concepts fail"; $15/day minimum.

**3h. Cole rejected v1 (Oct 3, 22:53 UTC). His reasoning, verbatim:**

> "what if we're testing a brand new angle we've never tested before Like we want to test multiple different concepts and once we find a concept that works then we can test variations of that concept and kind of go from there right ... if we don't know what concepts work how are we going to test and how we're going to test it at scale if we have to make variations of each one ... especially when it comes to creators ... they're not all making the same angle they're just posting videos right ... we need to have just like an SOP for how we launch creator stuff and how we launch other things and if it can't follow a system then we need to find a system that it can do ... at the end of the day the campaign structure doesn't matter right it's all about the creatives we just need to figure out a structure that makes sense logically so that things are fair and get tests and that we push ads into the account that are actually in a correct manner that we can follow in a systematic way."

Claude conceded two real flaws: "I had you making variations before you knew a concept works. You don't need variations to test something. One ad per concept is enough to test it. Variations come only after a concept wins." And: "creators don't film to order. Forcing their videos into angle-by-angle ad sets doesn't fit how they post, and nobody would follow it."

**3i. Two lanes (rejected).** Lane 1: own concepts, 3 or 4 concepts, one ad each, each in its own ad set with a $15/day minimum; after 7 days the winner gets 3 to 5 variations in a new ad set. Lane 2: creator videos, one weekly batch ad set ("Creators | Week of Oct 6") with a $30/day minimum; after 7 days copy the sellers into a "Creator winners" ad set and turn them off in the batch so Meta is forced onto the rest (Radack's method). Cole (Oct 4, 11:35 UTC): "why have a $15 minimum for new angles and the creator is 30 and why are you scaling the assets ... it just doesn't seem like there's a common system." Claude agreed: two lanes with two different rules "isn't a system."

**3j. One rule, $10 per ad (rejected).** Test ad set holds 1 to 5 new ads (own concepts one per ad set; creators up to 5 per ad set grouped by product); minimum = $10/day per ad; after 7 days pause the non-sellers and leave winners where they are; winning concept gets variations in a new test ad set. Cole: "if we launch something we have to put a minimum of $10 per spend per ad ... that's almost like doing an ABO at that point isn't it ... I thought the minimum spend was there so that it just gives more of a chance to where it's not like ads are getting $1 of spend." Claude: "You understood minimum spend correctly ... It isn't ABO ... So I'm dropping '$10 per ad'. One flat minimum per test ad set is enough." Later, when Cole asked again, Claude's honest pick: "$20 flat per test ad set. It's one number, the weekly total stays predictable, and it lets you run more tests. $10 per ad gives each ad more of a guaranteed look, but a 6-ad set then costs $60 a day, so you'd run about half as many tests. At your budget, more tests is worth more."

**3k. Playbook v2 (Oct 4, 11:57 UTC): test ad sets by product and source.** This is the shape that survived. Weekly test ad sets grouped by product and by source (our concepts, creator videos, variations of a winner), up to 6 ads each, flat $20/day minimum for the first 7 days only, then removed; after 7 days losers paused, winners keep running, nothing moved; max 6 test ad sets a week ($120/day).

**3l. "Minimums will pile up" (Oct 4, 12:08 UTC).** Cole: "if every new thing gets a $20 minimum moving forward at a certain point it will be over $120 a day for all the minimums because it's just going to continue to grow." Claude: "Minimums don't pile up, because each one comes off after 7 days. At any moment, only this week's tests have a minimum." And why it comes off at all: "A minimum exists for one reason: to force Meta to spend on something it has no data on yet ... Leaving the minimum on forever causes two problems: floors pile up week after week, until most of the budget is locked into old ad sets. At that point you've rebuilt ABO by accident ... It protects ads that have faded." Claude was honest that this is reasoned from Radack and Meta's advice, "It isn't a rule I can quote from Theriot."

**3m. Cole: "the creator app is only for creators" (Oct 4, 12:23 UTC).** The automatic day-7 minimum removal was pulled out of the creator app. "anything like this that goes on overall structure ... should not be in the creator app." Structure work moved to the dedicated session. The only thing kept in the launcher: a pre-launch check that blocks a creator launch if campaign minimums would exceed 25% of the campaign budget (with a settings switch and percentage).

**3n. Oct 4 session: "actually research this ... come up with a solution."** Cole: "what do people do what do Nick Theriot do what do Ben Radack do Like what is the system ... Do we even need to create an automation right now ... I feel like you're doing a lot of just like trying to implement what I want rather than coming up with a solution yourself ... The 30% thing I don't know if that's true I think Nick Theriot even says 25% to 75% or 20% to 80% right ... I'm coming to you with the problem you need to come up with a solution." Research came back (section 10). Claude's correction to Cole: "Your 20/80 memory: Theriot's 80/20 is about creative, not budget: 80% versions of winners, 20% new ideas." Testing share stays at 25% of spend.

**3o. "Stop talking that you're talking to me just tell me the action plan."** Cole asked for minimal text and pictures. The playbook became one page of numbers.

**3p. The SOP and the second-AI review (Oct 4, 17:03 to 17:25 UTC).** Cole asked for the entire structure "top to bottom ... organize it in a way that I can read it and understand it ... then I can give it to the other AI to analyze." Claude wrote the 12-section SOP, the reviewer pushed back on 8 points, Cole said "Don't blindly follow analyse and tell thoughts," and Claude checked the data before answering. Accepted: Keep needs 2+ sales; creator naming number-first is a requirement; one pool of 5 weekly slots with a default split; batch type in the ad set name; 310 B on hold. Rejected with data: a separate always-on apparel campaign (Polo spent $322 in 30 days with 0 sales) and "pixel over-fires 1.7x" (TW and Meta within 4%). Claude's own finding the reviewer missed: actual CPA is about $80, not $52, so a keep-at-$52 rule would pause average tests. Cole agreed to two lines (section 7).

**3q. Cole's final correction (Oct 4, 17:33 UTC):** "are we overcomplicating this ... all I wanted from this is to know the campaign SOP and structure so I can relay that information to my media buyer ... I don't give a crap what the campaign structure really looks like as long as that growth is there ... how to simply describe how we test and stuff to our creative strategist." Claude's answer is the compact game plan in section 9. After that, a short back-and-forth on day-7 automation ended with: launch any day, the media buyer owns minimums as part of his daily check, the Monday Slack message stays as the safety net, "No day-7 messages, and no auto-removal," with a final recommendation to make the Slack message daily-when-due (reply pending at session end).

## 4. Definitions (the vocabulary strategists should use)

Cole's framing: the angle is the argument; the concept is how you format the argument. The SOP table, final wording:

| Term | Definition | Example |
|---|---|---|
| Angle | The reason to buy: the argument. | "A better short game beats a longer driver." |
| Concept | A distinct way to show an angle: a different format and a different look. | Scorecard screenshot; side-by-side video; headline over the club; creator talking to camera. |
| Variation | The same concept with one visible thing changed. | New opening shot, new person, new setting, new first line, the same idea as a 6-second video. |
| Test | One Asana task with a number (e.g. 415). It is what gets judged. | "415, Scorecard static, wedges." |
| Batch type | What kind of test it is, written in the ad set name: CONCEPTS (1 angle, 3 to 5 concepts), VARS (1 winning concept, 3 to 5 visibly different takes), CREATOR (1 product, up to 6 creator videos). | `415 \| Wedges \| CONCEPTS` |

Cole's one-line version for strategists (Oct 4 game plan): "A concept is a new way to show an idea. A variation is a winner with one visible thing changed."

Playbook v2 wording for what each is for: "Concept = a new way to show an argument. Different format, different look. Use it to find winners. One ad per concept is enough to test it." "Variation = the same concept, one visible thing changed. Use it to keep a winner selling longer. 3 to 5 per winner, per round."

Rules attached to the definitions:
- A variation must change something you can see. Andromeda groups near-copies as one ad, so copy-only tweaks are not variations. "New words over the same footage usually does not" count. A new opening shot or a new face counts.
- An angle is only "dead" after 2 different concepts on it have failed.
- Why variations exist at all (playbook v2): "Theriot's accounts run about 80% variations of winners and 20% new angles, because variations keep a winner alive while new concepts find the next one. Motion's data: only about 5 to 8% of ads become winners, so volume of real tries matters."
- Where variations come from: the design team or AI. "They're cheap to make, which is why we use them on winners only."

## 5. The creative strategy and testing rules (final)

**Test wide first, then go deep.** This is Cole's instinct and the research backs it.
- To test a new angle: several concepts, one ad each. You do not need variations to test a concept.
- After a concept wins (7 days, see section 7): 3 to 5 variations of it go in as their own numbered test. The original keeps running.
- The mix of new ads each week depends on where the product is:
  - Few or no proven winners (today, most products): about 60% concepts, 40% variations.
  - Clear winners running: about 25% concepts, 75% variations (playbook v2 said "7 to 8 in 10 variations, 2 to 3 in 10 new concepts"). This follows Theriot's "80% iterations, 20% new messaging." His 80/20 is creative mix, not budget.

**Three sources of tests.**
1. Our team's concepts and variations. A strategist writes the brief in Asana, "which is the only place anyone types." Each brief is a numbered task with Angle, Why, What we're testing, then the ads numbered (415-1, 415-2...). Production moves it Creative Brief, Creative Studio, Ready to Launch, Analyze Results, Completed. One task = one test = one ad set.
2. Creator (ambassador) videos. Creators film whatever they want and do not film to an angle on order, so creator tests are grouped by product, not by angle. Staff approve the good videos during the week. This week's approved wedge videos form one test (e.g. "416 | Wedges | CREATOR") with up to 6 videos; putters get their own test. Launched through the creator app's launcher as partnership ads using the creator's exact uploaded file (dynamic identity by default; creator-first when the creator's Facebook page is known). Meta's own study: mixing creator partnership ads with brand ads gave about 20% lower cost per purchase, which is why creator ads live in the same campaign and not a creator-only campaign. Bridge: a creator winner's idea becomes a concept the team remakes, and the reverse.
3. Variations of winners: each round, 3 to 5 variations of a proven ad as their own numbered test.

**Weekly slots.** At most 5 new test ad sets a week, from one pool picked on Friday. Default split: 2 CREATOR + 2 CONCEPTS + 1 VARS. Change it only on purpose: a slot one source can't fill goes to another; once a product has clear winners, move a CONCEPTS slot to VARS; creator ads got 2 slots because they had the best cost per sale of the three campaigns ($65).

**Creator volume guide.** 10 approved videos: 2 tests (6 wedges + 4 putters). 20: 3 to 4 tests by product. 30+: launch the best within the weekly limit and hold the rest. Worked example Claude gave for 20 ads (9 wedges, 2 putters, 9 hybrids): Wedges A (5), Wedges B (4), Putters (2), Hybrids A (5), Hybrids B (4), total $100/day of minimums. Split evenly (5 and 4, not 6 and 3) "so each ad set gives its ads about the same chance."

**Why up to 6 ads per ad set.** "Inside an ad set Meta piles most of the spend onto 1 or 2 ads. With 9 hybrids in one ad set, about 7 of them would get almost nothing, and you'd never learn whether they work. Meta's own testing tool stops at 5 for the same reason. The cap is about fairness, not budget, so it stays at about 6 even as you grow." (Motion: about 55% of spend goes to winners; Jon Loomer: one ad taking half the budget is normal.)

**Why one ad set per concept rather than one angle with many concepts inside (from playbook v1, still the reason):** "When different concepts share an ad set, Meta piles the spend onto one ad and the others never get a fair test. You learn which ad Meta liked, not which concept won." Keep the same angle code on sibling concept ad sets so the angle can still be read in total.

**Reading results.** Which level won: the variation, the concept, or the angle. The result plus a one-line learning goes back into Asana; Locus requires a learning to close a test. Ahsan confirms the result.

## 6. The final account structure

**Stage 1 (now): one campaign, "Lucky Golf | Sales".**
- Objective Sales; Advantage campaign budget (CBO) about $450/day; Highest volume, no cost cap; Advantage+ audience and placements; attribution as today (7-day click, 1-day view, 1-day engaged view).
- Why one campaign: about 50 purchases a week in total, and Meta learns best around 50 conversions per ad set per week. Every extra campaign or ad set splits that. "Four product campaigns would each get around 12. All four would stay stuck in learning."
- No separate testing campaign, no Winners or scaling campaign, no retargeting campaign ("You don't run it, so it's not part of this"). Tests and winners live side by side; CBO moves money to what sells. Winners are never moved into another ad set or campaign.

**Ad set types inside the campaign.**

| Ad set type | Holds | Minimum spend | How long |
|---|---|---|---|
| Test ad set | One numbered test: up to 6 ads | $20/day | First 7 days only, then removed |
| Running ad set | A past test with at least one winner | None | Until it stops selling |
| Push ad set (temporary) | A product's best ~4 ads, to push it (e.g. putters for Christmas) | $70/day | 2 to 3 weeks, then the minimum is removed or the ad set paused |
| Proven ads brought in during the switch | Black Wedges - 42, 318 B (copied in as the same post); 310 B on hold | None | Ongoing |

Ad rules: up to 6 ads per ad set; at most 5 new test ad sets a week (5 x $20 = $100/day of minimums, about 22% of budget); landing page is the product's own page, not the homepage (21% of spend, about $11k in 90 days, was going to homepage or generic pages); an ad set that loses all its ads is effectively off; a paused loser stays paused; nothing is deleted.

**Naming (the Asana test number always comes first; no number = invisible to Locus).**

| Thing | Pattern | Example |
|---|---|---|
| Test ad set | `<number> \| <Product> \| <CONCEPTS / VARS / CREATOR>` | `415 \| Wedges \| CONCEPTS` |
| Our ad | `<number> <letter> \| <Format>` | `415 A \| Still` |
| Creator ad | `<number> <letter> \| @handle` | `416 A \| @cartpathbandit` |
| Push ad set | `Push \| <Product> \| <Reason>` | `Push \| Putters \| Christmas` |

The creator app launcher was changed on Oct 4 (commit 237a8c9) to name ad sets `{num} | {group} | CREATOR` with ads `420 A | ...`, to require the Asana test number for every new ad set, and to block the launch without one. Creator weekly batches therefore need an Asana task each week.

**Minimum spend rules.**
- Why: without one, new ads get $1 to $3 a day and are never judged. $20/day x 7 days is about $140, about 2.7 purchases' worth at $52. Claude's sizing logic: "a purchase costs about $52, so each ad needs roughly $50 to $100 over a week to show whether it sells. Theriot uses $5 to $10 per test, and Radack sizes test ad sets at about 4x the cost of a purchase."
- The $20 is about 40% of goal cost per sale. If CPA rises, or for a $300 driver, the minimum rises with it (driver tests about $40).
- Who gets one: only this week's test ad sets ($20) and temporary push ad sets ($70). Running ad sets never have one.
- When it comes off: test ad sets on day 7 (counted from first spend); push ad sets after 2 to 3 weeks.
- Cap: all minimums together at or under 25% of the campaign budget ($112.50 at $450/day). Basis: testing at about 15 to 25% of spend for a brand this size; Common Thread 20 to 30% for mature brands. Over the cap: remove minimums from finished tests, launch fewer, or raise the budget to total minimums divided by 0.25. At $1,000/day the cap is about $250, enough for about 12 tests. A push ad set ($70) on top of a full test week ($100) needs about $680/day or fewer tests.
- Not ABO: "In ABO every ad set's budget is fixed. Here only this week's tests have a floor, and Meta moves the rest freely."
- Caveat: since August 2025 Meta treats ad set spend limits as a best-effort average, not a guarantee; a separate launch campaign is the only hard guarantee. Meta throttles spend-limit edits to 1 per 30 seconds per ad set; clearing a minimum = daily_min_spend_target 0.
- Enforcement: the creator launcher blocks a launch that would push minimums over 25%; Locus warns in the Monday message; Meta's automated rules can pause but cannot remove ad set minimums (checked Oct 4); Madgicx can but is paid; the standalone "Meta Rules" robot Claude built (C:/Users/wetzl/Lucky Golf/Meta Rules) was shelved and never went live.

## 7. Judging tests (the two-line rule, decided 2026-10-04)

- Data: Locus, judged in Triple Whale (last platform click) so every channel uses one number. Cost per sale = spend divided by those sales. Soft metrics (CTR, hook rate, cost per add to cart, CPM) compared with the account's own recent ads in thirds. If Meta's number disagrees with the Monday call, the Monday call wins.
- When: after the test has spent 3x goal ($156), or after 7 days with at least $52 spent. Days count from the first day of spend, launch day does not matter ("No matter what the ad that gets launched needs 7 days in the account," Cole).
- Account average = trailing 30-day Meta spend divided by Triple Whale orders, about $80 today, recalculated by Locus on the 1st of every month so the keep line tightens as the account improves. Shown in every Monday message.

| Result | Rule | Action |
|---|---|---|
| Winner | Cost per sale at or under $52 goal and 2+ sales | Keep running, take the minimum off, make variations of it |
| Keep | At or under the account average (~$80) and 2+ sales | Leave it running, minimum off. "It doesn't make the account worse." |
| Another week | Above the average, but 2+ soft metrics in the top third and cost per sale at or under 2x goal | One more week (a top-of-funnel ad doing its job). Locus's existing rule from 2026-09-24, kept on purpose. |
| Pause | Above the account average, or under 2 sales once judged | Pause the ad set |
| Pause: Meta wouldn't spend on it | Past day 7 but not enough spend to judge | Pause (Theriot: "after 7 days, if it hits learning limited without spending, it's dead") |

Only tests whose first spend was within the last 3 weeks are judged in the weekly message (Lucky had 48 old open tests in Asana). Who decides: Locus suggests, the media buyer acts, Ahsan confirms and writes the learning. Mobius choices (not sourced from Theriot or Radack): the 3x judge threshold and the 2+ sales minimum; the old 30% yellow zone is retired once an account average exists.

## 8. Weekly routine, budgets, product pushes, and when the structure changes

**Weekly routine (media buyer, about 2 hours a week).** Monday 8am Central: Locus posts one Slack message to Lucky's internal channel (header shows the $52 goal and this month's account average; every live test sorted into Pause / Winner / Keep / Another week / Not ready; "take the $20 minimum off" where due; a cap warning if over; one Ads Manager link to exactly the ad sets to change; a "Do it" button that pauses the losers and removes finished minimums after Slack confirms). Monday or Tuesday: launch up to 5 new tests (number-first names, $20 minimum, product-page links). Wed to Thu: 5-minute check, never edit a test before day 7. Friday with Ahsan: pick next week's 5 tests, approve the creator batch, decide which product to push. Rules that never change: don't edit a test before day 7; change budgets by 20% at most, every 3 days at most; every ad set and ad name starts with the Asana number; no more than 5 new tests a week. Daily 10 minutes in the account is still the media buyer's job; the message does not replace it.

**Budgets.** One budget at the campaign level, about $450/day. Change by at most about 20%, at most every 3 days (bigger jumps restart learning). Raise the budget when weekly test minimums plus push minimums exceed 25%, or when the team wants more than 5 tests a week ("if it's a solution to it we need to increase the ad spend then we need to increase ad spend," Cole). Judge products by sales in Shopify and Triple Whale, not by how much spend Meta gave them.

**Product push levers (lightest first).**
1. Feed it: give that product more of this week's new tests (e.g. 3 of 5 are putters). "This is the main lever every source agrees on."
2. Push ad set: its best ~4 ads, $70/day minimum, 2 to 3 weeks, then removed. Example: early December, "Putter push" inside the main campaign for Christmas.
3. Launch campaign: its own budget for 3 to 4 weeks (Havoc driver, irons, about $120 to 150/day taken from core, 4 to 6 distinct concepts). Afterwards the winning ad sets join Lucky Golf | Sales with the same post IDs and the launch campaign closes. The driver's CPA will be higher than $52 because of its price, so judge it on ROAS or margin.

Also worth testing 3 weeks after the switch settles: "maximize value of conversions" bidding, so $99 wedges stop outbidding $229 putters (Meta favours the cheapest club under a most-purchases objective; this is part of why wedges take half of spend).

**When the structure changes.**

| Change | Trigger |
|---|---|
| Stage 2: a product gets its own campaign (e.g. "Lucky Golf \| Wedges" plus "Lucky Golf \| Everything else", each built like Stage 1 inside) | That product alone makes about 50+ purchases a week for 3 weeks in a row (roughly $1,000+/day account). Today wedges ~22/week, putters ~9. |
| Apparel gets its own campaign | Its own creative, about $100/day behind it, at least break-even for 3 weeks. Judged on ROAS, never on the $52 club goal. Right now apparel is off (Polo: $322 in 30 days, 0 sales) and returns as a small test campaign when there is new apparel creative. |
| Launch campaign | Any new product, 3 to 4 weeks, then fold in |
| Seasonal campaign | Only during a sale, then off (Valentines Day paused 2026-10-03) |

Claude's correction of its own "three cases" wording: every club having its own page and price is normal and is not a reason to split. Split only when a product needs a different goal, "mainly that means it earns so differently that you'd judge it on a different return target. Gloves at $17.95 and polos at $67 against a $229 putter would be that case. Your clubs aren't."

**The switch (Oct 5 to about Oct 20, 2026).** Rename "[MD] CBO | Creator Campaign" (best CPA, $65) to "Lucky Golf | Sales" to keep its learning. Copy in the proven ads from the other two campaigns as the existing post (last 30 days, 3+ purchases, $65 or less per sale): Black Wedges - 42 ($51) and 318 B | Still ($55); 310 B | Still ($58) on hold because its ad set was paused by hand around Sep 20 and the media buyer must say why. Budget steps: $180 (Oct 5), $215 (Oct 8), $260 (Oct 11), $310 (Oct 14), $375 (Oct 17), $450 (Oct 20), lowering the other two so the total stays $450 until both are off. Expect 1 to 2 weeks of unsteady cost per sale. Don't start a switch in Black Friday week. Change one thing at a time (consolidate first, value bidding a few weeks later).

## 9. How it was explained to the team

**To the creative strategists (Claude's game plan, Oct 4, 17:33 UTC, approved by Cole's framing):**
1. Each week: 2 creator batches, 2 new concepts, 1 round of variations of a winner.
2. A concept is a new way to show an idea. A variation is a winner with one visible thing changed.
3. Creator videos are grouped by product, up to 6 per test.
4. Every test gets an Asana number, and the result plus a one-line learning go back in Asana.

**To the media buyer (message Cole was given to paste):**
> Structure: one campaign, "Lucky Golf | Sales" (renamed from [MD] CBO | Creator Campaign). Every Asana test is its own ad set inside it. Switch (starts Oct 5): copy in the proven ads. Raise Sales about 20% every 3 days ($180, $215, $260, $310, $375, $450) and lower Black Wedge and [MD] CBO so the total stays $450, until they're off around Oct 20. New tests: at most 5 a week, up to 6 ads each, $20/day ad set minimum. Names, always number first: ad set `415 | Wedges | Still`, ad `415 A | Still`, creator ad `416 A | @handle`. No number means Locus can't track it. Every Monday 8am: Locus posts this week's test calls in Slack. Press "Do it" and it pauses the losers and takes finished minimums off. Then launch the new tests. Don't touch a test before day 7. Goal: $52 per sale.

**The principle Cole stated that should govern any future version:** "the campaign structure doesn't matter right it's all about the creatives we just need to figure out a structure that makes sense logically so that things are fair and get tests." Claude's restatement, which Cole accepted: "structure doesn't make the ads better. Its only job is to give new ads a fair test and make results readable, in a way you can repeat every week."

## 10. What each cited source says (as found by the research agents)

Caveats from the agents: X post pages mostly would not load (402/451), so X quotes come from search-result snippets; Theriot's full X article is paywalled; jonloomer.com blocked fetches; some items are secondhand.

- **Meta (primary).** Andromeda engineering post (Dec 2, 2024) describes a retrieval engine for the "exponential growth in volume of eligible ads", "+8% ads quality improvement on selected segments", and gives no account-structure advice. Mar 27, 2025 business post: "as businesses upload more and more creatives to support a diversification strategy, Meta Andromeda works behind the scenes." Performance 5: "Combine ad sets and minimize changes," "Develop a variety of ad creative." Creative Testing tool (about Oct 2025): 2 to 5 test ads inside an existing ad set, evenly split budget, up to 30 days, Highest Volume only; Meta warns "similar assets will essentially be seen as the same by their system"; keep tests at or under 20% of budget (secondary). Learning phase about 50 optimization events per ad set in 7 days (secondhand). Ad set spend limits: Meta "can't guarantee" the minimum and discourages them; since Aug 2025 they are an average, not a floor. Meta gives no official number of ads per ad set. Not verified and not to be repeated as Meta's word: "25 diverse creatives got 17% more conversions", "8 to 15 ads per ad set", a "Creative Similarity Score above 60%".
- **Nick Theriot (Chew On This, Jan 12, 2026, "The CBO method that generated $100M").** "One CBO per major product category. No separate testing campaigns." 9 to 12 live ad sets: 4 to 5 proven winners and 5 to 6 tests. Each ad set is one concept, a single hook with 3 to 6 versions where "only the visual opening changes." Single ads with 2 primary texts, no flexible ads. "New ad sets get a $5-10 daily minimum spend to 'nudge' them forward." 3 to 6 new concepts a week, one upload day. "After 7 days, if something hits learning limited without spending, it's dead." Winners stay where they are. "80% iterations + variations, 20% new messaging" (X, status 1963003488000213109): creative mix, not spend. "20 iterations = keeping the winner alive... 4 new angles per week = actually killing creative fatigue." "Meta sees them all as the same ad." A search summary of his paywalled X article says one CBO per product per country, one ad idea per ad set, 2 to 3 hook variants of the same script. Not found: naming, dashboards, automated rules, whether he removes minimums on winners.
- **Ben Radack (@benradack).** Under $1k/day: "1 CBO, 1-2 ad sets max. Don't test in ABO... launch a second ad set with a min spend limit" (Nov 2025). Separate campaigns are "simply not in your budget." Three-ad-set version: historical winners; newly tested winners (minimum spend); creative tests (minimum and maximum). Batch ad sets "by launch week... or by concept/angle," each with a minimum. Testing budget "3-4x my target CPA... $50 target CPA = $150-200/day per ad set." Many ads in one ad set: budget at least 4x CPA, Meta picks 1 to 2 favourites within days, copy those to scaling and turn them off in testing. Losers go to a "zombie" CBO with a cost cap 30%+ below average CPA. "more ads > more optimization."
- **Taylor Holiday / Common Thread Collective.** "Volume > Diversity > Quality in that order." "Prioritize diversity of concept, not minor variations." "Never turn off an ad" (doing so asserts "a relationship between the past and the future that does not exist"). "CTC does not create dedicated budget exclusively for testing"; minimum spends only for inventory reasons. "Creative Strategy Is Dead" (Jan 20, 2026): marketing-calendar moments become creative obligations; look for "hidden gems, where there are products that are getting more sales velocity than ad spend"; steer products by assigning creative to SKUs, not by structure. Apr 2, 2026 testing framework: test share 40 to 50% for early-stage brands, 20 to 30% for mature; $500 to 1,000 per creative read over 3 to 7 days; 15 to 30 ads a month for 7-figure brands (these two CTC sources contradict each other). Cost-control study (Aug 2026): min ROAS the most accurate control, bid cap their new default.
- **Andrew Foxwell / Foxwell Digital (Nov 6, 2025).** One broad prospecting campaign; wait "at least 5-7 days" before judging; Andromeda groups similar ads, so "test fundamentally different approaches." Via Marketing Factor (secondhand): for a new account put about five distinct concepts in one CBO with one ad set and spend a $10 to 15k launch budget over two weeks. No specific budget share or kill rules found. Foxwell's strategist does creative analysis in Motion.
- **Motion (benchmarks, Apr 2026, $1.29B spend, 6,015 advertisers).** Accounts spending $10 to 50k a month launch a median 4.1 new creatives a week; top quartile 8.1; micro accounts (under $10k/mo) test about 3 a week. About 5 to 8% of ads become winners. 55% of spend goes to winning ads; brands at $10 to 50k/mo put about 35% on winners. Winner definition: a minimum spend threshold (example $250) plus a CPA or ROAS target, reviewed after two weeks. Reads naming conventions split by separators into fields. No data on what share of spend one product normally gets ("70-80% on one hero product is fine" is practitioner talk, not measured).
- **Jetfuel ("Meta ads strategy for DTC ecommerce brands in 2026: the Andromeda playbook") and TopGrowth.** Two core campaigns (ASC scaling 60 to 70%, testing 20 to 25%, retargeting 10 to 15%); brands shipping 20+ new ads a month do better. Cited in Claude's first pass on Oct 3 morning and superseded by the practitioner research the same evening. Claude's own caveat: "rough agency numbers, not Meta data."
- **Jon Loomer.** Start with one campaign and one ad set, add only for a real reason. "One ad taking 50% of your budget isn't at all unusual." Ad-set minimums "defeat the whole purpose of CBO" and Meta discourages them. Suggests 10 to 50+ ads per ad set after Andromeda (the old "six-ad" guidance is retired). The "niche targeting to creative diversification" line is Loomer's attribution; Claude could not find where Meta said it.
- **Others.** Dara Denney: "Creative testing is NOT about how you structure your tests in Ads Manager"; ships 2 iterations of a winner within 7 days, each with a new persona or context. Barry Hott: fewer ad sets when conversions are limited (50 per week per ad set); diversity means ads that look different but reuse "a proven story". Charley Tichenor: one CBO account, "one campaign per objective per frontend offer", 3-2-2 (secondhand). Balistro (Aug 2026): categories with very different price points or margins still justify a separate ad set or campaign. Nik Sharma: kill losers on day 6, about 3x target CPA tolerance (via Opascope). Vendor blogs (AdManage): 2 to 3x CPA kill rules; "plenty of agencies still run a separate testing campaign for cleaner data."

Where they agree: one or a few CBO campaigns, broad targeting, volume of truly different concepts drives winners, swapping actor or background or colour doesn't count as new creative, no ABO testing campaigns at small budgets. Where they disagree: ad sets (Theriot one concept per ad set vs Radack and CTC many ads in one or two), separate testing (most say no campaign; Radack and Theriot separate at the ad-set level with minimums), turning ads off (CTC never, Theriot 7-day kill, Radack switches off favourites to force exploration), iterations (Theriot 80% iterations; Foxwell and CTC stress diversity; reconciled as "iterations keep a winner alive, and new concepts find the next winner").

## 11. All the numbers in one place

- $450/day campaign budget; about $14k/month; about 50 purchases a week.
- $52 goal cost per sale (AOV divided by 3.0); about $80 actual, refreshed monthly as the keep line.
- 1 campaign; 5 new test ad sets a week max; up to 6 ads per test ad set, split evenly across ad sets.
- Default weekly slot split 2 CREATOR + 2 CONCEPTS + 1 VARS.
- $20/day minimum per test ad set for the first 7 days (about 40% of goal CPA; driver tests about $40); $70/day for push ad sets for 2 to 3 weeks.
- Total minimums at or under 25% of campaign budget ($112.50 at $450; about $250 at $1,000). A 30% cap was proposed by Claude on Oct 4 and dropped after Cole's "I don't know if that's true."
- Judge after 3x goal spent ($156) or 7 days with at least $52 spent; Winner and Keep both need 2+ Triple Whale sales; "Another week" needs 2+ top-third soft metrics and CPA at or under 2x goal.
- Concept vs variation mix: 60/40 with few winners, 25/75 with clear winners (Theriot 80/20).
- 3 to 5 variations per winner per round; an angle is dead after 2 failed concepts.
- Budget moves at most 20% every 3 days; the switch runs $180, $215, $260, $310, $375, $450 from Oct 5 to Oct 20.
- Stage 2 trigger: one product at 50+ purchases a week for 3 weeks (roughly $1,000+/day account).
- Apparel: own campaign only with its own creative, about $100/day, break-even for 3 weeks, judged on ROAS.
- Launch campaign: 3 to 4 weeks, about $120 to 150/day from core, 4 to 6 concepts.
- Meta learning: about 50 conversions per ad set per week; one spend-limit edit per 30 seconds per ad set.
- Earlier, rejected numbers (for the record): $15/day minimum (playbook v1), $30 creator batch minimum (two lanes), $10 per ad (one rule), 6 test ad sets a week at $120/day (playbook v2), two campaigns at $330 + $45 (product-push proposal).

## 12. Open items at the end of the sessions

- Cole had not given a final "go" on the playbook in the f4dd1c01 session; in the ddf6bd61 session he accepted the two-line rule and the compact game plan but ended on "we are overcomplicating this." The final automation question (daily-when-due Slack message vs Monday only) was left with Claude's recommendation pending Cole's reply.
- The media buyer must say why 310 B was paused around Sep 20.
- 48 old open tests in Asana for Lucky need closing.
- The Golf Sock ad account is not assigned to the Locus system user.
- Whether "Lucky Golf | Sales" qualifies as Advantage+ automatically was not checked; Advantage+ sales campaigns cannot be created via API.
- The angle-vs-concept research agent's raw output from Oct 3 (22:40 to 22:46 UTC) was not recoverable (empty task file); its conclusions survive only through Claude's summary and playbook v1, both quoted above.
- Cole's working-style instructions that came up repeatedly and should shape any future strategist-brain output: short plain answers, pictures over text, honest pushback not appeasement ("you're just listening to me trying to do what pleases me rather than looking and actually doing research"), explain why with research, keep account-wide rules out of the creator app, and do not over-build automation the media buyer could do himself.

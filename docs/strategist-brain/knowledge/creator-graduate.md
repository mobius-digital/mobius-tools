# Creator ads: the graduate model (Mobius SOP, Cole 2026-11-22)

## How it works now
Every Trybe brand (Dartee, Grunk, VetriPaws, Ice & Gold) and Lucky (its own creator app) runs creator ads in ONE creator campaign per brand ("[MD] ABO | Creator Campaign"; Ice & Gold's is "Trybe | Creators", CBO). Party Patch is left out.
- "Creator | <Name>" ad set (Lucky also uses "Ace | <Name>", Ice & Gold "Trybe | <Name>"): a creator's own set, $15 a day to start, max 8 live ads.
- "Creator Pool": everyone who has not graduated, about $30 a day (Lucky's pool is "999 | Ambassadors"). Ice & Gold has no pool: a creator there needs 3 approved videos to get a set.
- Every ad keeps its Trybe tag (`&trybe=<id>` on the link and `trybe_adid` in the url tags, or `trybe=` in the ad name) so the creator still earns commission. Lucky's ads carry the creator's name instead ("JoshRutherford | ...").
- Sales are Triple Whale lastPlatformClick. Spend is Meta's.

## Decision rules (Locus suggests 3, 5, 6 and 7 every morning; a person approves every one)
1. Approve only videos that clear the bar: captions or text overlay, a hook in the first 3 seconds, a CTA, the product on screen and in use, the live offer, no banned claim, no watermark, no licensed music. Near-copies: approve the best one. An approval is a spending decision.
2. Load within 3 days of approval: into the creator's own set if they have one, else the pool.
3. Graduate: 3+ approved ads LIVE at the same time = their own set. Their live pool ads move into it.
4. Cut ads only by the Locus ad call rules: wait until 2x goal CPA is spent AND 3 days have passed; never cut while beating goal.
5. Under 3 live ads: a set beating goal CPA (7 days, TW) is KEPT at any count (ask the creator for more videos). Under 3 for 7 straight days and not beating goal = DEMOTE (ads back to the pool, set paused, the creator told privately). 0 live ads = pause the set (a set made in the last 2 days is left alone while its ads clear review).
6. A full set (8 live) takes a new approved video only by replacing its weakest ad that is past the wait window and not beating goal.
7. Money: +20% on a set when 7-day CPA is at or under goal with 3+ sales. Locus only SUGGESTS it; Cole says yes in the review. Never add spend minimums.
8. Comms: graduation = a DM and a Discord shout-out by name. Locus drafts both and never sends them. Never state dollar figures or sales counts to creators. No em dashes.
9. Moving to this setup: old creator ads beating goal move into the new campaign (same creative keeps the post and its social proof); old ads not beating goal turn off; old creator campaigns pause once the new one has delivered for 3 days.

## What Locus does each morning (the creator engine): SUGGEST ONLY
Cole, 2026-11-22: Locus does not make creator moves by itself. It suggests them, and Cole approves them when he goes through /trybe or the media buying call (/buy) with Claude.
Per brand switched to Suggest (Ads > Trybe > Creator sets: Off / Suggest; campaign id, pool id, start budget, max live, demote days):
- Reads the creator campaign live from Meta, matches every ad to a creator (Trybe tag first, then the name).
- Stores today's suggestions: graduate, keep, demote, pause, load, replace, raise. Each has a one-line reason and the ad and set ids. Read them at GET /api/trybe/creator-moves?act=<brand id> (plans on the spot when today's plan is missing; `fresh=1` re-plans).
- Changes NOTHING in Meta, posts nothing to Slack, adds nothing to the Buyer list. Never say Locus moved, paused or raised anything.
- On a yes in the review, Claude applies it through Locus meta_write (Change Log, client line, undo for 24 hours). Meta cannot move an ad between ad sets: a "move" is a copy of the ad (same creative and post) plus a pause of the original.
- Approved videos that have no Meta ad at all are listed as "build in Trybe".
- An ad someone paused in the last 14 days is never suggested back.
- Graduation DMs and Discord shout-outs are drafts; a person sends them.

## Diagnostics
- "Why did X not graduate?" Count their LIVE ads in the creator campaign (in Meta review counts). Approved but not loaded does not count unless they have no pool to load into.
- "Why is X's set still on with 2 ads?" Either it beats goal (kept), or it has been under 3 for fewer than 7 days.
- "Why was X demoted?" Under 3 live for 7 straight days and 7-day CPA above goal (or no sale).
- Read the creator_sets view (Locus's last run per brand) before answering any of these.

## Effects on other channels
Creator ads are prospecting; a demotion or pause cuts a small budget, not the brand's main prospecting. Never pause a New people / prospecting set for weak ROAS; creator sets follow their own rules above.

## Traps
- A copied ad starts its Meta learning fresh; judge it on the creator set, not the single ad's first days.
- Lucky's creator sets are named "Ace | <Name>"; Ice & Gold's "Trybe | <Name>". Dated sets ("Trybe | 11/04") are batches, not creators.
- Ice & Gold runs a CBO with no pool and $10 minimums Cole set before this model; new sets there get no minimum.
- Videos approved for an old offer (Dartee Early Bird / BOGO 50%) should have been sent back; if they show up to load, say so.

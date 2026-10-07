# Source: Mobius Digital's creative testing framework, as Cole describes it

Extracted 2026-10-07 from five Claude Code sessions. Every point carries the session and date it came from. Quotes marked "Cole:" are his own words from the transcript (voice-to-text, so spelling and grammar are his). Quotes marked "skill:" come from the mobius-brief-review skill Cole loaded into two of these sessions and told the assistant to treat as the definition of the framework ("that's something that you should understand through what an angle is what a concept is and everything like with our Mobius review skill").

Sessions:

- S1 = local_eb0352fe (2026-09-24), "Ad concept tracking and roadmap workflow". The Grunk Google Sheet roadmap audit, the Locus Brand tab, Asana as the only place anyone types, the brief format, auto-numbering, the scorecard, target CPAs.
- S2 = local_5e265ef8 (2026-09-25 to 2026-09-27), "Creative testing framework analysis". Chase Chappell's three factories, Locus Studio rebuilt around batches, the framework applied to AI-made ads.
- S3 = local_2758bf63 (2026-09-29 to 2026-09-30), "Brief generation from video/ideas". The Slack Ideas bot, test types on every brief, the brand brain, simple cards.
- S4 = local_6f59e0cb (2026-10-01), "Creative strategist guide for inspiration tool". The team guides for the Ideas bot and the creative factories, weekly rhythm, benchmark numbers.
- S5 = local_62f4affd (2026-10-04 to 2026-10-05), "Locus brand test library organization". Tests moved under Meta, the Angles tab for strategists, "Have we tested this?", Proven / Mixed / Dead labels.

---

## 1. The three words: Angle, Concept, What We're Testing

### Cole's own definitions

S1, 2026-09-24 11:16, the opening brief for the whole system:

Cole: "a lot of times I feel like our creative strategist they're going to start using angles that are the same but they're just reworded differently And I think we need to make sure that when we come up with angles like if it's a new one it's logged and when it's logged like we could always go back and like review like hey this was done we did this angle et cetera"

Cole: "one thing is I don't want creative strategists just coming up with new ways to say an angle like an angle is an angle we come up with an angle we put it in there it logs it we can always go back to it and choose that angle again concepts same thing What we're testing variation wise again same thing we can test a lot of different things variations if we need to test variations again there's sometimes we're testing concepts sometimes we're testing variations within a concept etc unless I wrong by that please tell me if I'm wrong by that"

S1, 2026-09-24 18:50, on why the old brief is overdone and how the model has changed:

Cole: "we do a lot of things different now like before where we had a bunch of concepts and variations of those concepts where that's not really a thing anymore we're now like we have angles and then we can test certain things and are we testing different concepts or or do we have a winning angle and a winning concept but we're testing variations and what are those variations"

S1, 2026-09-24 19:05, checking the new brief against the framework:

Cole: "do these follow the Mobius briefing review thing like where we where we understand exactly what an angle is what a concept is and like the types of stuff we're testing Umm in testing maybe the wrong word but the reason I ask is because like obviously yours I'm not really sure as an angle but like depending on what we're doing is like OK like are we doing concept different concept versions here are we going to be doing different are we doing like one angle one concept with like different variations or different variations of that concept again like all that kind of is different right"

S2, 2026-09-27 12:12, restating it for Studio:

Cole: "everything that we're testing is sometimes we're sometimes we have an angle and sometimes we're testing multiple concepts right sometimes where testing an angle and one concept and then we have different variations of that concept that we're testing because we know the angle works and the concept works now we're just testing variations of that concept to get even better and I'm sure that makes sense to you and if not make sure that you fully understand that thought process there and understand like different examples of like what variations of a concept even means"

S3, 2026-09-29 14:29, the same rule for the Ideas bot:

Cole: "if it's a static and we want to make static ads with like different concepts and variations but we need to make sure that we understand angles and concepts and what each one entails and what it actually means and what type of tests we're doing if it's a concept test where we're doing different concepts or different or doing one angle 1 concept in different variations of that concept etcetera So that's the part where we really need to understand and make sure that we go through that specifically"

### The skill's definitions (loaded by Cole in S1 2026-09-24 19:05 and S2 2026-09-27 11:46)

skill: "Three words only: Angle, Concept, What We're Testing. Do not use 'execution,' 'variant,' or 'variation set' in anything Cole sends to the team. Those words caused confusion and were retired."

skill: "Angle = the argument. The reason to buy, said in one sentence to a specific person. Something you could say to convince them at a bar."

skill: "Concept = the idea we build. The specific thing the editor shoots or designs to deliver the angle. Specific enough to build without asking questions."

skill: "What We're Testing = the one piece that changes. Decided before anything gets built."

skill, the 3-question test, "use this to label anything":
1. "Did the reason to buy change? It's a new angle."
2. "Same reason, different idea? It's a new concept."
3. "Same idea, one piece changed? It's testing inside the concept."

skill, framework.md, what makes a real angle: "Makes a claim someone could disagree with. Says or implies who it's for. Gives a reason that person should care right now."

skill, not angles: "Highlight the gold finish" (feature), "Frustrated caregiver" (persona label), "Smell" (topic), "New mechanism of delivery" (category description), "Premium quality at a fair price" (vague, nobody disagrees), "Video ad" (format).

skill, angles: "A longer drive won't lower your score. A better short game will." / "Golfers notice your gear before your game. The Carver is the wedge that gets asked about." / "You're not skeptical of supplements. You're exhausted from fighting your dog to take them."

skill, what makes a real concept: "Could be handed to the editor with no follow-up questions. Argues the angle in its own way. Is different in idea, not just in look, from the other concepts under the same angle."

skill, not concepts: "Static with image and copy", "UGC", "Show product in use" (too vague to build), "Change how your dog takes supplements" (angle-shaped), "Three color treatments of the same layout (that's one concept, three designs)".

skill: "Concepts under one angle can mix static and video. What makes them different is the idea, not the format."

### How the assistant restated it and Cole accepted (S1, 2026-09-24 11:16 and 11:25)

- "Angle = the reason someone buys ('dad bod approved', 'ditch the old belt'). It only gets written once. If a strategist rewords an old angle, it's still the old angle, not a new one."
- "Concept = one way to show an angle (a skit, a split screen, a founder talking to camera). One angle can have many concepts."
- "Variation = one thing changed inside a concept: the hook, the creator, the length, the first frame, the copy."
- "Addition: every test should record what level it's testing. 'Is this angle any good?' and 'which hook works on this concept?' are different questions, and you read the results differently."
- Offer is its own field on the batch, never an angle (S1 11:25): "Offers are mixed in with angles. Most of the old winners were offers: Mystery Box, 3 for $125, $99 bundle, 4th of July. Right now you can't tell whether the angle won or the discount did."

Cole's reply to "Your model is right": he did not dispute it; he moved on to the sheet. In 11:48 he said "Whatever you think for the naming convention is fine Just start it please do everything."

### The retired words

S1, 2026-09-24 19:22, after the skill was loaded: "Three words only: Angle, Concept, What We're Testing. I retired 'Variation' and 'Moderate' everywhere, in Asana and in Locus." The Asana Testing field became "New angle / New concept / Inside a concept". The old "Offer" option was retired as a test type (offer is still recorded as a piece you can change inside a concept, and as its own field on the batch).

Note: Cole still says "variation" and "iteration" in conversation (S1 18:50, S2 12:12, S3 14:29). The retired-word rule is about what goes to the team in writing, not about how Cole talks.

---

## 2. Why we test this way: the reasoning

skill, framework.md "Why the order matters": "If an unproven angle loses, we need to know it was the argument that failed. Three different concepts give the argument a fair read. One concept with three headlines doesn't: if it loses, it could be the angle, the idea, or the words. Once a concept wins, the argument and idea are proven, so changing one piece at a time tells us exactly what moved the number."

skill: "Never change two levels at once. Headlines on an unproven angle tell us nothing, because we can't tell if the argument or the words failed."

skill, what to test based on where things stand:
- "New angle: 3 different concepts, 1 ad each"
- "Proven angle that needs fresh ads: new concepts, 1 ad each"
- "Proven concept: keep it, change one piece (headline, person on screen, hook, edit style, review, redesign with the same copy)"
- "Winner fatigues: new concepts first, new angle if those die"

skill, testing logic by account state:

| Account state | What to test |
|---|---|
| New brand, no data | Angles, each with 3 concepts |
| Running, no clear winner | Still angle level. Don't start headline tests. |
| Angle wins, one concept clearly best | Pieces inside that concept |
| Angle wins, concepts close | More concepts under that angle |
| Winner fatiguing | New concepts under the proven angle |
| New concepts under the angle also fail | New angle |

skill, copy-and-psychology.md: "Strong concept sets under one angle argue the point in different ways, so a winner tells you something about the customer: One proves it with evidence (scorecard, cabinet full of unused supplements). One shows it happening (demo, showdown). One makes the alternative look ridiculous (the pill-in-a-hot-dog routine). Add one line per set: 'If #1 wins, they respond to ___.'"

The "Why" line in a brief (skill, checklist.md): "The Why line is a belief about the customer, not a description of the copy." Brief format: "WHY: [what we believe about the customer that makes this work]". In S1 18:51 the assistant defined it for the Asana brief as "Why: one line. The insight, or the past test it builds on ('332 won with the origin story')." Cole accepted that brief shape.

The point of the log itself (S1, 2026-09-24 12:50): Cole: "The point of the Google Sheet was so that we could have a database of everything that we've ever tested and to refer back to to do research". And in S5 2026-10-04 18:12: "the goal of the strategist is of course to like, look at what angles have been used before and everything like that and then build a brief off of it right and how do they how do they how do they do that or like if they're making a new one how do they know if they've ever tested it before".

---

## 3. The Andromeda rule: iterations must still look different

skill: "A concept does not need 3 designs under it when concepts are being tested. Pick the best version and ship 1 ad per concept. Meta's Andromeda system rewards ads that are actually different, so 3 designs of one idea read as near duplicates."

S2, 2026-09-27 11:45, Cole on Studio's "Versions" button making near-copies:

Cole: "my confusion with this studio is that is version supposed to be like just trying to recreate the same thing where it looks exactly the same and we're just doing one image at a time ... or is the point of studio supposed to be to where like it does a batch at a time where like normally when we create a batch it's like we have our angle our concept and we're either testing multiple concepts or testing multiple or testing one concept and then variations of that concept ... realistically if it was set up for 3 you may have different headlines you may have different call outs you may have different visual looks etc"

Assistant answer Cole accepted (S2 11:47): "'Versions' makes near-copies of one idea. Your framework says that's exactly what not to do: Meta treats look-alikes as duplicates, and they teach you nothing. I'd remove Versions. Redo stays as the backup for when one ad comes out bad." Studio was rebuilt the same day as "one ad per numbered line". profit/CLAUDE.md records it: "'Versions' of one idea were removed: Meta treats look-alikes as duplicates and they teach nothing. Redo is the backup for a bad ad."

How a piece-inside-a-concept test is made so it is clean but still different (S2 12:12, accepted): "Proven angle and concept, testing variations: everything is locked except the one piece. For example, same 'gift box' scene and product with 3 headlines. Or the same copy with a redesigned look. Or the same ad with a different offer framing ('25% off' vs '$40 off') or a different review quote. For variations, Locus makes the first ad, then edits only the tested piece for the others. That makes it a clean test instead of 3 slightly different pictures."

The variety rule across a concept batch (S2 12:12): with no inspiration "the art director picks the look from the angle, concept and brand, with a variety rule across the batch: product hero, lifestyle, native post, bold type, comparison, and so on."

Cole on diversity as a goal (S2 2026-09-25 19:02): "the goal here is for of course creative diversification as well".

---

## 4. The test types

Three tests. Cole's words for them vary, the meaning does not.

### As Cole says it
- "sometimes we're testing concepts sometimes we're testing variations within a concept" (S1 11:16)
- "are we testing different concepts or or do we have a winning angle and a winning concept but we're testing variations" (S1 18:50)
- "if it's a concept test where we're doing different concepts or different or doing one angle 1 concept in different variations of that concept" (S3 14:29)

### As the Ideas bot was told to label every production brief (S3, 2026-09-29 14:33, Cole said "Okay")
- "Angle test: different reasons to buy, to see which argument wins."
- "Concept test: one angle, shown different ways."
- "Iteration test: one angle and one concept, changing one thing (hook, headline, offer)."
- "The bot picks one from what you said ('just the hook' means an iteration test) and checks the brief against your rules: the angle is the why, the concept is the how, and only one thing is being tested."

The session memory note from the same minute: "Every production brief must name its test type (angle test / concept test / iteration test) per the Angle-Concept-What We're Testing framework."

### As the Asana field was built (S1, 2026-09-24 19:09)
Testing field options: New angle, New concept, Inside a concept. ("Variation" renamed to "Inside a concept"; "Offer" retired as a type.)

### As Studio was built (S2, 2026-09-27 12:27)
TESTING options in Studio, each with its one-line meaning: Concepts ("different ideas"), Headlines ("same ad, new words"), Looks ("same words, new looks"), Offer ("same ad, offer framing"), Reviews ("same ad, review quote"), Hooks ("the opening line"), Copy ("the body words"), Format ("layout type"). Rule: "testing concepts or looks = genuinely different ads. Testing a piece inside a concept (headlines, offer...) = line 1 is made, the rest are EDITS of it that change only the words, so it is a clean test."

### The pieces you can change inside a proven concept (S1 19:11, Locus library VARS)
Headline, Hook, Person on screen, Edit style, Redesign, Review, Offer, Copy, Visual, Format. (The skill's own list: "Concepts, Headlines, Person on screen / creator, Hooks (first seconds of a video), Edit style, Reviews (when a review concept won), Redesigns with the same copy.")

### Edge cases (skill, framework.md)

| Situation | Label | Why |
|---|---|---|
| Price or "costs less than X" | New angle | Reason to buy changed |
| Different demographic with a different reason to buy | New angle | Reason changed |
| Different demographic, same reason, different person on camera | Testing piece | Only the person changed |
| Same idea as a static and as a video | Testing piece | Idea didn't change |
| Different hook on the same video | Testing piece | |
| Different creator reading the same script | Testing piece | |
| Same angle, same layout, different product shot | Testing piece | |
| Offer (bundle, discount, gift with purchase) | Separate lever | It changes the deal, not the argument. Note it on the brief, and don't change the offer and the angle in the same test. |
| "Us vs them" comparison | Concept | It's a vehicle. The angle is whatever the comparison proves. |
| Testimonial / review static | Concept | Testing different reviews inside it is a testing piece. |
| Founder story | Concept, if it argues an angle. If it just says "we're a small brand," there's no angle yet. | |

---

## 5. The buckets and labels built into Locus

Cole uses the word "buckets" for the creative factories (section 9). For the test library itself the taxonomy is the set of labels below. All of it was built in S1 and reorganised in S5.

### One test = one batch = one Asana task = one number (S1, 2026-09-24)
- "Batch = one test, and it has to say which level it's testing" (S1 11:25).
- Fields Locus puts on every Asana task (S1 14:04, 19:09): Angle, Testing, Result, Learning, Keep running because, Check again.
- Stages follow the Asana sections the team already uses: Creative Brief (idea), Creative Studio and Ready to Launch (production), Analyze Results (live), Completed (done). Cole in S1 12:50: "our current process now is we would go to the road map we would build an idea we would put it into a sauna a sauna would be the the way to see every it's like the production it's the internal building the ads and stuff and then there'd be thing where it's like hey it's ready for launch once it's launched it's analyzed results and then after we analyze results we move it to completed".
- Cole's rule from that exchange, recorded in the code header: "ASANA IS THE ONLY PLACE ANYONE TYPES." Locus is the memory and fills itself.
- "Status mixes two questions. 'Creative Studio / Learning / Done' is where the work is. 'Winner / Loser' is how it did. They need to be separate fields." (S1 11:25)

### Angle library statuses (S1 brand-001.sql)
active, proposed (AI draft awaiting a person), retired. Cole asked for "a 'Retired angles, don't bring back' list" to be part of it (S1 11:25 audit, accepted). Losers stay visible "so nobody brings them back by accident."

### Result options (S1 19:09, after Cole's 18:50 message)
Winner, Keep running, Loser. "Moderate" retired. Keep running must carry a reason from a short list and a Check again date (7 days by default):
- Top of funnel doing its job
- Not enough data yet
- Scaling
- Waiting on offer or landing page
- Other

These reasons are Cole's (S1 18:50): "maybe there's some like reasons that was like here like standard reasons like you can like here like the most common ones 0 it's working it's top of funnel wanna give it more data not enough data etcetera and we're gonna test it for a little longer and then we can add like how long it's gonna test before the locust decides whether it is going to lose or not".

### Test library filters (S1 14:09, 19:11)
All tests, Winners, Losers, Waiting on a call, Keep running, In progress, Offers. Plus "Not filed yet" for tests with no angle and "Ads with no test number" for untagged spend.

### The Tests screen, three boxes (S5, 2026-10-04 17:36)
"Make a call, Running, What we learned." Built because Cole said the Tests sub-tab was "nowhere near simple" and "needs to be stupid simple" (S5 17:17). Cole then asked "Wouldn't tests be in meta?" (17:24) and "I thought the point of the meta tab was just to hold things that or about meta ... if anything attribution wise uses triple well we've always said this" (17:38). Result: Tests sits inside Meta, and every purchase, revenue, ROAS and CPA figure on the Meta tab now comes from Triple Whale.

### Split by job (S5, 2026-10-04 18:16 and 18:44)
Cole (18:12): "is tests, what's the point of tests for the media buyer or the strategist ... Should these be separated if one's for the strategist, one's for the media buyer".
- Media buyer: Meta > Test calls, only "Make a call" and "Running".
- Strategist: Making ads > Angles. Every angle with how many tests won and its best CPA, labelled Proven, Mixed, Dead or Untested. Click an angle to see its concepts, and the variations under each concept, with results and learnings.
- "Have we tested this?" box: "Type an idea in any words and it says whether you've tested it, what it ran as before, and what won." Tested on Lucky: "golfers who hate paying for a logo" came back as already tested under "Tour quality, honest price", 107 tests, 0 of 11 won. This answers Cole's 18:12 worry: "what if they accidentally like f just phrase it the wrong way? Like they think of something like, oh, we haven't tested this, but it's like, oh, it's the same thing. You just didn't phrase it."
- Concepts were almost one per test ("239 concepts for 279 Party Patch tests"), so an AI pass merged 47 to 76 duplicate concepts per brand and new tests now group under existing concepts.

### Angle tidy-up (S1, 2026-09-24 20:52 and 23:27)
Angles are created by the AI as it files tests, so near-duplicates grow ("Gift for golf dad" and "Gift for your golfer man"). A "Tidy up angles" button merges "the same reason to buy said different ways", keeping the angle with the most tests, aiming for roughly 10 to 18 angles per brand. Cole's check (23:34): "it sounds like you're tidying up previous angles and then you're storing a database of angles right". Answer: "Locus keeps one list of angles per brand. Every past and future test is filed under one of them." Results after tidy-up: Grunk 16, Lucky 15, Dartee 15, Party Patch 17, Bonk 18.

### Product lines as the research unit (S1, 2026-09-24 11:33)
Research, personas and angles are per product line, "products bought for the same reason", because the strip brand has Energy, Sleep and Beauty strips that "each one of those need different persona". Not a test label, but it is the level the angle library and brain are filed at.

---

## 6. The brief format

### Cole on the old brief (S1, 2026-09-24 18:50 and 18:57)
Cole: "I have a documented brief that like is a is basically a It is just a Google Doc that is a template and realistically I think this template has become over done ... I put like the market awareness why we're doing this all this stuff etc in there and maybe it's overdone ... The reason why I overdid it in the first place was basically because II wanted to make sure the designer understood everything about the angle".

Cole: "a more simplistic route that has inspiration obviously describes what we're going for in the briefs itself is probably a good idea ... would this be better for a document or would this be better within the Asana description itself".

Cole: "the task is in Asana but then they have to go to a Google Doc to review the task and then from there they have to go to a frame link ... there's so many different steps here and I feel like it confuses it's not there's not one synergy between all the platforms".

Cole (18:57): "I like how we're dropping the Asana Task OK that way there's no Google I really like that too How we set up that task is important though because again the task needs to be in a nice it needs it needs it like visually looked at it can't just be all over the place ... it's a briefing template then needs to have like the the copy for the ad itself not the in creative copy but like the copy itself for the ad or whatever and then landing page etc".

The weekly strategist-to-designer call carries the "why" that the brief no longer has to (S1 18:50): "now we have an SOP where every week the creative strategist have to meet with the design team whether it's a static or a video and they have to describe the brief to them and be like hey here's the route that I'm going for here's why I'm going for it".

### The brief, as the skill states it
```
ANGLE: [one-sentence argument]
WHY: [what we believe about the customer that makes this work]
TESTING: [concepts / headlines / person on screen / hooks / edit style / redesigns / reviews]

1. [Concept or piece]: [one line Robbo could build from]
2. ...
3. ...
```
skill: "When testing inside a proven concept, add a CONCEPT: line under ANGLE and list the pieces being changed."

### The brief, as it lives in Asana now (S1 19:22, simplified again on Cole's instruction 2026-09-30)
The template Locus drops into every blank new task in Creative Brief (account-health/worker/src/asana-brand.js, BRIEF_TEST):

```
The test
Angle:
Why:
What we're testing:
  What changes, and on which ad. Like: 3 new concepts · 3 headlines on 412-3 · 2 redesigns of 412-3 · 3 reviews on 388-1
1.
2.
3.

Copy
Headline:
Primary text:
Offer:
Landing page:
Inspo:
```
Video briefs add a Video block (Creator, Script) and use examples "3 new concepts · 3 hooks on 290-1 · 2 creators on 290-1 · 2 edits of 290-1".

The code comment records the rule: "Cole, 2026-09-30: as simple as possible. Testing and concept are ONE line ('3 headlines on 412-3' names the winner), the numbered lines under it are the ads. The only grey text is the examples line, alone on its line so one triple-click deletes it. No Frame.io, no crop line, no subtasks."

Meaning of a Testing line like "3 headlines on 412-3": the piece being changed (headlines), how many ads (3), and the exact winning ad it is built on (test 412, ad 3). "3 new concepts" means a concept test, no base ad. The Ideas bot prompt (ideas.js) spells the same rule out: "testing is ONE short line saying what changes and, inside a proven concept, on which ad, like '3 new concepts', '3 headlines on 412-3', '2 redesigns of 412-3', '3 hooks on 290-1'. Then 3 to 5 ads unless the thread asks otherwise, one line each: a different idea when testing concepts, otherwise the one piece that changes (the new hook, the new headline, what the redesign changes), enough for the designer or editor to build it."

What was cut from the old Google Doc brief (S1 18:59, accepted): the colour legend; audience, awareness, psychographics and emotion ("those live in Locus research"); start and end dates; conversion goal ("it's always purchase"); the old file naming convention. Brand-level things that never change per test went into one pinned "Brand kit" task per project (website, brand guidelines, assets, do's and don'ts, file naming, UGC recording and upload steps).

Cole on keeping it short for people (S3, 2026-09-30 11:10): "WHent he AI writes back in Slack there is a LOT of text. Realistcally I nor the team will read all oif it ... complaicted messaged, breifs, etc. are never good. Get the idea through in the simpest way possible is the best so it could be understood by anyone. That is the most importnat". And "Is the brief too compcard for a creator to digest?" The creator brief was then capped at a 25-word pitch, 2 openers, 3 scene bullets, 3 do's, 3 don'ts.

---

## 7. Numbering and how ads are named

### The number is the spine
S1, 2026-09-24 11:25: "Grunk's ad names already start with the batch number, e.g. 326-5 | Still and 287-12 | Still. Locus already stores every ad with its spend and Triple Whale sales. So nobody has to link anything."

S1 12:50: "Every task is already named with the test number, like '339 - 1 Star review from his wife' ... The number already ties everything together: the Asana task is 339, the brief is 339, the Meta ads are '339 A | Still'."

The rule for the team (S1 15:02): "The only habit to lock in: the test number goes first on everything. The task is '348 - ...', the brief is '348 - ...', and the ads are '348-1 | Still'."

### Ad names
- Format: `<test number>-<ad number> | <anything>`. Examples in use: `326-5 | Still`, `348-1 | Still`, `360-1`, `412-3`, `231-1 | ...`.
- The ads in a brief are numbered 1, 2, 3 and the launched ads carry the same numbers: "The ads are numbered to match their names: 360-1, 360-2, 360-3" (S1 19:22).
- Locus reads the number at the start of the ad name. "Tiktok #25 | UGC" and "Nick - 3" do not match on purpose; those ads show under "Ads with no test number" and get tagged to a test by hand in one click (S1 11:44, 12:37).
- Cole on naming (S1 11:48): "Whatever you think for the naming convention is fine".
- Old convention retired (S1 18:59): "The template says to name files like HangoverPatch_MomsDeserve_V4. Locus can only match ads that start with the test number, so it becomes 348-1, 348-2."
- TRYBE creator ads keep TRYBE's names; Locus reads the TRYBE code and tags them from the creator link (S1 11:44).

### Auto-numbering
Cole asked what it meant (S1 18:57), was told "the strategist creates 'Wife revenge' and within the hour Locus renames it '348 - Wife revenge'. Nobody has to look up the next number", and said "Yes auto numbering" (19:05). Why: "Today the strategist has to look up the last test number and add one. That's how 338 ended up being used twice." Numbers are per brand, never reused; Locus takes the highest number in the brand's Asana project plus one.

Studio batches carry the Asana number through so AI-made ads are named `231-1 | ...` and land in the test library (S2 12:21).

---

## 8. How winners are judged

### Cole's rules (S1, 2026-09-24 18:50 and 18:57)
Cole: "what are they doing to actually judge whether something wins or loses Because there's a lot that goes into considering what wins and loses ... if there's a top of funnel ad that's working as top of funnel maybe it's bringing in a lot of clicks but people don't necessarily convert on those clicks right also we usually look at triple whale data for all of this to determine whether there's a winner or loser".

Cole: "normally we do go by CPA for the most part but like if something's under a certain CPA then that's when we start looking at other areas like we start looking at CTR add to carts CPM frequency start looking at if it's like top of funnel traffic or not normally we do go by CPA though for the most part but again like maybe we can use that as kind of like just a guide for the creative strategist and then they can create a strategist can choose to agree with it".

Cole: "it's not as simple as like just if it's below this then this type of thing".

Cole (18:57): "are we overdoing it by judging winners and losers here I mean maybe not I think it's interesting having everything in one place but then is there an option to like view the ad account itself for that particular ad ... it just like links it to the ads manager for us".

Cole on who decides (S1 11:44 Q2 "normally media buyer looks at this"; 19:05 "The media buyer (whihc currently is ahsan right now)"). The media buyer makes the call; Locus only suggests. Recorded in brand.js: "The verdict is the MEDIA BUYER'S call. Locus only suggests one once a batch has spent enough to judge."

### How Locus judges (S1 19:22, 23:34, 23:50)
- CPA first, against the brand's target CPA. Then the soft metrics (CTR, hook rate, add to carts and cost per add to cart, CPM), each compared to the account's own recent ads in thirds (top third, average, bottom third for this brand), never fixed benchmarks.
- Suggested call is Winner, Keep running or Loser, with a one-line read. Example: "CPA is above target, but people are clicking and adding to cart. Looks like a top of funnel ad doing its job."
- Leeway: a test up to 30% over target CPA comes back as Keep running, not Loser. A test above target can also land on Keep running "if people are clicking and adding to cart a lot". Loser only "when the cost per sale is well over target, or there are no sales and the clicks and add-to-carts are weak too." Cole's words for this (23:34): "there's like leeway here it's like again like there's deltas".
- A test is judged after 3x target CPA spent or 7 days, whichever first (S1 11:38 proposal, accepted; Grunk was first set to $100 or 7 days).
- Keep running needs a reason and a check-again date (default 7 days); Locus posts a fresh scorecard on that date. "The test isn't judged until someone picks Winner or Loser."
- Every scorecard has an "Open in Ads Manager" link to that test's ads (Cole's ask at 18:57).
- A batch cannot close without a one-line learning (S1 11:25).
- The scorecard format Cole asked for (23:36 "Scorecard seems hard to read since it's in paragraph form and a lot of jumbled text"): a list, the call on top, one metric per line with a mark the eye can scan (good, average, weak, over target), then Why, Learning, Open in Ads Manager, Your move. Footer: "Sales: Triple Whale. Delivery: Meta."
- No target CPA = no suggested calls for that brand.
- Sales numbers are always Triple Whale lastPlatformClick, never Meta's purchase count (house rule, restated in S5 17:38).

### Target CPA rule (S1, 2026-09-24 23:18 and 23:34)
Cole: "you should be able to guess the target Cpas we're trying to reach for a majority of the brands we're trying to reach at minimum a 2.5 return on ad spend based off their current AOV so that's what it is to determine that CPA for us now". So target CPA = 90-day average order value / 2.5. Cole then overrode per brand (23:34): Grunk $32, Lucky Golf $52 ("lucky golf let's do it based off of a 3 row as not the 2.5"), Dartee $39, Party Patch $32, Bonk $25. These are set per brand in Brand info > Test rules and are not to be recomputed without asking.

### Where a test runs does not matter to the judging
Cole (S1 18:57): "a majority of them we use a consolidated structure like a one campaign structure but sometimes we have multiple structures sometimes we build other campaigns for new drops for promos ... there's not just one set thing". Answer: "Locus judges each ad by its number, whatever campaign it's in."

### Team benchmarks (S4, creative-factories-guide, 2026-10-01)
Starting targets for the team guide, with the note "Each brand's own test rules in the Brand tab win":
- New ads per brand per week = testing budget / (3 x target CPA). Example: $4K testing budget and $40 target CPA = about 33 ads a week.
- At or under target CPA is the main call, from Triple Whale.
- Hook rate 30%+ on videos (40%+ is great). Link CTR 1%+ (1.5%+ is strong). Win rate about 1 in 10.
- Weekly rhythm: Mon judge last week and write briefs; Tue make; Wed launch into the testing campaign; Thu check every new ad is spending and named; Fri kill clear losers only.

---

## 9. The creative factories (Cole's "buckets")

S2, 2026-09-25 18:50, Cole on Chase Chappell's video: "he kind of separates it into three avenues you have AI creative then you have like your affiliate army and then you have what you do in your in-house team and how you build things afterward and how each bucket has its own aspects".

S2 19:02, Cole: "we do have these 3 buckets and what these three buckets are is our AI creation that we can then pump out and that's consistent and we pump a lot of those out a week we approve them the copy that's made like obviously is approved before the image generation is made we approve the angles and concepts and stuff like that and then we approve all that then it goes into creation and then the creatives get approved or revisions made etc".

Cole added a fourth: "if factory 3 means just any angles that we build in our designer makes then that's a different story if the stuff that our designer makes that we come up with the briefs copy and everything ourselves and then our designer kind of comes builds it based off our ideas if that is factory 4 then we may need four".

Cole on the output goal: "instead of doing two concepts a week with six adds we can go and do 12 to 30 concepts a week right".

The four factories as written for the team (S4 guide): AI Studio (lots of statics fast: many headlines, many angles; strategist; ~35 cents an ad), Ambassadors (when a real person needs to say it: UGC, reviews; strategist sets angles on the creator link / Lucky creator app), Templates (when a layout already won, refill it with a new angle or product), Designer and production (when it has to be perfect or it's a video; Asana brief; 2 to 3 days). Guide TL;DR: "Every ad is a test. One brief asks one question. The ads are numbered so we can read the answer." "Still done by people, on purpose: writing briefs, launching in Meta, and the Winner / Loser call."

Cole's gate rule (S2 19:02): "100% that is hype everything needs to be approved". Nothing is made until the plan (angle, concept, copy) is approved; nothing goes live until the creatives are approved.

Cole on AI output quality (S2 2026-09-26 10:48): "Obvously none of this is came up with randomly, it's thorugh DEEP researhc, fully understnaidn market awarenss, market sophiistication, and really diving into persioans and custoemr avatars. This will heklp them dial in exactly who the specfic angle/cocnetps they are making is for so they can write teh copy accoridngly, otherwise it's standard generic AI copy. Every peice needs to relaly peakc with someone specifc." This became the brand brain and the "no-vague rule" (S3 14:44): every idea must point to a real persona, customer quote, past test or product fact; the swap test ("if you could put another brand's name on it and it still works, it gets rewritten"); say what is missing instead of filling the gap.

Cole on not overcomplicating (S2 10:59): "sometimes I feel lie AI too overcomplicated teh angle/concept/persona thing and sometimes an ad is liek above" (a plain product-launch ad). The framework still applies, but a launch ad can be its own simple test.

---

## 10. How strategists should research and brief (the SOP)

### The loop Cole agreed to (S1 15:02 and 15:17, refreshed 20:52)
1. "Every test gets one number. Locus adds it to the Asana task, and every ad name starts with it."
2. "We work in Asana like always, and the brief is written in the task. Locus reads it every hour and does the paperwork."
3. "When a test has spent enough, Locus posts a scorecard and suggests Winner, Keep running or Loser; the media buyer decides and it's saved to the library."

Strategist steps: search the library (now the Angles tab and "Have we tested this?") before writing each new brief; create the Asana task in Creative Brief and write the brief in it (Angle, Why, What we're testing, numbered ads, copy, inspo); Locus fills Angle and Testing within the hour and, if the angle has been tried before, comments with how those past tests did (walkthrough example: "the strategist searches 'wife' in Locus and sees that angle has already lost 3 times"). Cole on fixing a wrong angle: type the right one in the Angle field in Asana, Locus follows it.

Cole on what the SOP must feel like (S1 15:12): "I need to be able to expalain this to Ahsan, strategsit, media buyers etc, with my eyes closed and they should be able to udnerstand too, And it needs to be stupid simple to understnad., Not extra fat plaes". And (23:18): "it should be so simple to where like I would send this to my team and they would look at it and be able to follow it".

### Reviewing a brief (skill, how Cole wants batches judged)
Workflow: get context (brand, test history, account state), label what they actually sent, run the checklist, check the copy and the thinking, deliver.

skill, common labelling mistakes to catch: "An angle labeled as a concept. Concepts labeled as variations. A persona or topic written as an angle ('Frustrated caregiver,' 'Smell'). A product feature written as an angle ('Highlight the finish'). Format used as a concept ('Static with copy,' 'UGC video'). Three designs of one idea presented as three concepts. No 'Testing' line at all."

skill, test history: "Never assume an angle is new or proven without evidence. If there's no history, say so and treat everything as unproven."

skill, structure checklist: "Every batch has an angle line. The angle is an argument, not a label, feature, topic, or format. Concepts are real, buildable ideas. Concepts under one angle are actually different ideas, not redesigns of one idea. A Testing line exists. Only one level changes in the batch. No concept has 3 designs under it when concepts are what's being tested. No two batches are secretly the same angle (merge them if so)."

skill, strategy checklist: the angle fits the brand's positioning and guardrails; targets the right customer and product; matches how aware that customer is ("don't educate people who already get it, don't skip steps for people who don't"); isn't a claim a competitor already owns; the Why line is a belief about the customer; the number of concepts and shoots is realistic for the budget.

skill, copy checklist: headline or hook would stop the right person; specific, not generic; sounds like the customer talks; sounds like the brand; a clear psychological lever and the right one; any claim is true and defensible. Production: "Editor could build each concept without questions."

skill, red flags: "Could be for any brand in the category. Describes the product instead of arguing for it. Headline is a pun or tagline with no reason to buy. Uses a gross-out or shock image with no link to the argument. Promises something the product can't prove. Rationale is circular ('this works because it's engaging')."

skill, awareness match: "Doesn't know they have the problem: lead with the problem or a reframe. Knows the problem, not the solutions: show the solution type. Knows solutions, not us: show why ours is different. Knows us, hasn't bought: proof, offer, urgency. Past buyer: new product, drop, belonging. A wrong awareness match is one of the most common reasons a well-built ad loses. Flag it."

skill, output: VERDICT (Good as is / Fix and send back / Redo), WHAT THEY SENT correctly labelled, WHAT'S WRONG (max 5, most important first), FIXED VERSION in brief format using the strategist's own ideas, SLACK MESSAGE (under 150 words, numbered fixes, 4 max, clear next step). "Only add a 'STRATEGY FLAG' section if there's a problem bigger than format (wrong customer, off brand, already tested and lost, competitor already owns this claim, production too heavy for the budget)."

skill, building new batches: "For a new angle, give 3 concepts that argue the point in genuinely different ways (for example: one proves with evidence, one shows it happening, one makes the alternative look ridiculous) and say in one line what each would teach us if it wins."

### Ideas bot: how inspiration becomes a brief (S3, 2026-09-29)
Cole's three ways to use a reference (13:53): as is ("this would work perfectly as is"), the style ("a yapper ad ... the same concept of the ad" for a different product), or "just the hook ... and then I want to describe the brief for everything else". The bot splits a reference into hook, format/style, angle, structure and the product's role; Cole's note outranks its guess. Every teardown covers awareness stage, sophistication stage, mechanism, the desire it hits, the proof it uses, what's weak, and what carries over to our brand. Destination is always a choice (creator link, Lucky creator app, Asana brief, Studio): Cole (14:39) "it's probably just going to ask every time and we just decide right". Cole (2026-09-30 11:10) on the bot filing an angle into "Always works": "shouldn't we decide where it goes?" so a Section dropdown was added.

Cole on what this tool is not (S4 13:32): "this isn't how we should do like make like all briefs this is just to help our tedious tasks for you know if we want to like recreate inspiration from competitors or quickly pop out inspiration and briefs for ambassadors and affiliates and creators on tribe".

---

## 11. Standing rules that came out of these sessions

- An angle is logged once per brand. Rewording it is the same angle. Locus checks new angles against the library before saving (S1).
- One test asks one question. Say which level it tests. Never change two levels at once (S1, skill).
- Offers are their own field, never an angle. Don't change the offer and the angle in the same test (S1, skill).
- One ad per numbered line. No look-alike versions of one idea; Meta treats them as duplicates and they teach nothing. Inside-a-concept tests lock everything except the one piece (S2).
- Three words to the team: Angle, Concept, What We're Testing. "Variation", "Moderate", "execution", "variant", "variation set" are retired in writing (skill, S1).
- The test number goes first on the task, the brief and every ad (S1).
- Asana is the only place anyone types. Locus is the memory and fills itself. Everything Locus writes in Asana is visible to the client ("visibility for all") (S1).
- CPA first against the brand's target, then soft metrics against the account's own recent ads. Winner / Keep running / Loser. The media buyer (Ahsan) makes the call; Locus suggests (S1).
- Every number that is a sale, revenue, ROAS or CPA comes from Triple Whale, never Meta (S1, S5).
- Target CPA = AOV / 2.5 as the default (Lucky at 3.0), overridden per brand by Cole (S1).
- Briefs, cards, SOPs: as short as a person will actually read. "Get the idea through in the simpest way possible" (S3).
- Every AI-written angle or line must point at a real persona, quote, past test or product fact; no generic copy (S2, S3).
- Nothing goes live without a person approving the plan and the creative (S2).

# Creative templates, step 1: the analysis (2026-10-09)

Brief: `docs/handoffs/creative-templates.md`. Page: https://claude.ai/artifact/MYDXMZ1kbgYSZti68z8y7h. Nothing is built. This waits for Cole's sign-off.

## How winners were picked

- Data: every Meta ad with $50+ spend, 2026-05-22 to 2026-10-08 (the whole ad-level history Locus holds), 648 ads,
  7 brands. Sales and cost per sale = Triple Whale `lastPlatformClick` (`tw_ad_attr`), never Meta's counts. Spend from Meta.
- Ad set first: every ad is judged with its set. **Hit goal** = an anchor (50%+ of its set's spend) in a set at or
  under 1.1x the brand's goal, with 5x goal in spend; or the ad itself under 1.1x goal with 3+ sales and 4x goal in
  spend. **Best in account** = same shape against 0.8x the brand's own average cost per sale (most accounts run well
  above goal on TW last click: Lucky $90 vs $52, Grunk $64 vs $32, Party Patch $65 vs $32, Dartee $66 vs $39, Bonk $39 vs $25).
- Brands without a goal (The Golf Sock, Ice & Gold) are judged against their own average.
- Result: 96 winners (Bonk 14, Dartee 16, Grunk 8, Lucky 16, Party Patch 11, Golf Sock 31, Ice & Gold 0).
- Each winner looked at by eye where Locus had its creative cached (47 of 96); the other 49 judged from copy, ad name
  and the Asana test library (`p_br_batch` title, concept, angle). Format hit rates for the 5 library brands are a
  keyword sort of the test library, directional only.
- Scripts and raw exports: session scratchpad (`ads.sql`, `rank2.js`, `fmt.js`), not kept in the repo.

## Big findings

- **Statics are cheaper per sale than video on 6 of 7 brands** (Grunk is a tie). Bonk $37 vs $44, Dartee $58 vs $71,
  Lucky $79 vs $100, Party Patch $53 vs $69, Golf Sock $36 vs $46. Yet video took most of the spend on Dartee, Lucky
  and Party Patch. Templates are where statics get made fast, so this is where they pay.
- **Moments are the cheapest bucket**: seasonal / life-event ads ran at $36 a sale across the library brands (28 ads).
  Bonk's America 250 drop and Father's Day "retire his old cap" are its best ads.
- **Creator to camera** has the most spend ($160K at $64) and won on every brand, but only ~10% of those ads win.
  That is the Creators bucket's job, not a template.
- **Never really tested**: notes app, us vs them, native screenshots (3 to 4 ads total, none won). Too few to judge.
- **Ice & Gold has no winner** ($212 a sale on a $158 order). A template will not fix that alone.

## The ranked formats

Proof = ad name, spend, cost per sale (goal or account average in brackets). All TW last click.

1. **Hero shot + one line** (static). Product big on a clean or dark set, one short line: the drop ("Black is live")
   or one benefit ("Reduces movement inside the shoe"). Golf Sock 128 C $10,516 at $28 ($38); Bonk 225 B $10,796 at
   $31 ($39 acct); Dartee 353-1 $236 at $21 ($39); Lucky Black Wedges-4 $1,198 at $57 ($52) and -9 $4,322 at $76 ($90
   acct); Grunk 287-12 "White Neon Rose" $8,016 at $50 ($64 acct). Won on 5 brands. Why: one thing to read, the
   product sells itself, a new colour or finish is a new ad in minutes. Per brand: the set, the line, the product.
   **AI makes it well today** (Studio's best format; clubs need the product score).
2. **Product + feature callouts** (static). Labels or numbered points on the product's parts, or an icon row. Golf
   Sock F3 "Why golfers buy in bulk" $33,769 at $31 (the biggest winner in the agency); Bonk 226 A $3,587 at $30, 256 A
   $174 at $22; Dartee 312 B "50 Shades of Gator" $454 at $41; Grunk 284-1 $199 at $28 (quotes as the callouts). Won on
   4. Why: shows the mechanism (magnet, tee slots, grip) in one look. **Maybe for AI**: the picture yes, every label
   must point at the real part, so a person checks.
3. **Scene + headline + benefit bullets** (static). Product in its real world (course, bar, wedding table), a
   headline, 3 or 4 bullets. Golf Sock 124 C $27,044 at $40 ($38), 117 C $2,494 at $34, 129 C $2,125 at $42; Dartee
   300 C $1,860 at $43 in a set at $37 ($39); Lucky 387 B gold putter on course $529 at $48 ($52); Party Patch 381 B
   wedding $138 at $28 ($32). Won on 4. **AI yes** (real photo base or the Dress step).
4. **Price ladder / bundle** (static). Three pack sizes with prices and savings, or "hat + marker + tool, save $30".
   Party Patch 400-6 $317 at $29, PP_411 $340 at $31, 400-4 $155 at $31; Bonk 245 B $2,602 at $28 ($39 acct); Grunk
   326-6 free polo with a caddy $261 at $24. Missed on Lucky (366 A bundle grid $351 at $70). Won on 3. **Design team**:
   prices must be exact, so a locked layout per brand (Canva master), AI only for the background.
5. **Moment wrapper** (static or video). A holiday or life event gives a reason to buy now: America 250, Father's Day,
   Cinco de Mayo, summer, wedding, bachelorette. Bonk 277 (250th) three ads $6,799 at $15 to $32; Bonk 235 A "Retire his
   old golf cap" $3,233 at $21 ($25); Grunk 320-6 Cinco de Mayo $149 at $11; Party Patch 359 A bachelorette $1,877 at
   $39, 381 B wedding $138 at $28. Cheapest bucket ($36). It wraps formats 1 to 4, so the template is a moments
   calendar per brand plus the wrapper rules. **AI yes.**
6. **Review over product** (static). One to five real quotes with stars on or around the product. Dartee 298 C five
   star cards $385 at $30 ($39); Grunk 284-1 $199 at $28; Grunk 287-12 (reviews in the copy) $8,016 at $50; Golf Sock F3
   headline "100+ 5 star reviews". Missed on Lucky (313 A single quote $626 at $70). Won on 3, 18% of tries win. **AI
   yes**, quotes only from the brand's real voice-of-customer rows (623 stored), never written.
7. **Hands-on demo / unbox** (video). Hands with the product doing the thing, a caption hook ("$300 for a golf
   belt?", "You definitely don't need another belt", the knife test). Dartee 299 B $884 at $37 ($39), 2503-7 $2,154 at
   $43, 290-5 $2,110 at $44; Golf Sock 112 B unbox $7,043 at $35. Won on 2. **Design team (Ravo) or creators**; AI video
   not good enough today.
8. **Creator to camera** (video). One person, big caption hook, three beats, the product. Lucky Jett-2 $741 at $57 and
   $283 at $35; Party Patch Offer-2 $1,346 at $31 ($32); Dartee 290-3 $206 at $19; Grunk TikTok #22 $1,283 at $51.
   Won on 6 brands, but ~10% hit rate. **Belongs in Creators**; the template is only the script skeleton.

Not on the list, on purpose:
- **Problem headlines** ("Your golf socks are the problem", "Ditch the dad belt", "It's not your club", "Stop paying
  for a logo") won often, but they are a HOOK, not a layout. They ride on formats 1, 3 and 8. They go in the words.
- **Notes app, us vs them, Google search, tweet**: not tested enough. Motion ranks us vs them and offer-first banners
  high. Suggest: test three in the BFCM batch through Studio, then promote whichever wins.

## Fit per brand (yes / maybe / no)

| Format | Bonk | Dartee | Grunk | Lucky | Party Patch | Ice & Gold | New client |
|---|---|---|---|---|---|---|---|
| 1 Hero + one line | yes | yes | yes | yes | maybe | yes | yes |
| 2 Feature callouts | yes | yes | yes | maybe | maybe | maybe | yes |
| 3 Scene + bullets | yes | yes | maybe | yes | yes | yes | yes |
| 4 Price ladder | yes | maybe | yes | no (never cuts price; use value stack / free gift) | yes | maybe | maybe |
| 5 Moment wrapper | yes | yes | yes | yes | yes | yes | yes |
| 6 Review over product | maybe | yes | yes | maybe | maybe | maybe | yes, once reviews exist |
| 7 Demo / unbox | maybe | yes | maybe | maybe | maybe | no | yes |
| 8 Creator to camera | in Creators | | | | | | |

The Golf Sock is paused: its ads are used as proof only.

## What the category does (Motion, Atria, Foreplay and others)

- Three meanings of "template": a **named format** with a definition (Motion's free Format Library, 113 formats, ranked
  by hit rate = share of a format's ads reaching 10x the account's median spend), a **reference image for AI to remix**
  (Atria, GooseWorks; Atria admits no performance signal), or a **layout file with slots** (Canva Bulk Create, Pencil,
  AdCreative.ai). Foreplay's templates are brief / storyboard structures.
- Only Motion ties formats to results. Nobody can rank by a client's own Triple Whale sales: that is our edge.
- Motion's top formats by hit rate (2026): offer-first banner, demo, testimonial, unboxing, celebrity, montage, before
  and after, listicle, split screen, us vs them.
- Traps: inspiration graveyards (113 formats, 25M ads, browse and forget), per-industry trees, AI clones changing how
  the product looks (an Atria reviewer's complaint; our real-photo base and product score already guard this).
- Atria was out of credits on 2026-10-09: boards, notes and creative tags could not be read.

## Proposal: Creative > Templates in Locus

- **One page, eight cards at most** (the six statics above; demo and creator link out to Creators / an Asana brief).
  A card = name, the layout in one line, why it works, OUR proof (thumbnails of our winners, spend, cost per sale vs
  goal, TW last click, ad set first), the brand's yes / maybe / no, who makes it, one button.
- **"Make one"**: AI formats open a Studio batch with the format's layout spec and its two best reference ads as the
  "look like this", product picked, the brand's voice. Design-team formats open a prefilled Asana brief (and the
  brand's Canva master for the price ladder).
- **"Drop kit"** for a new drop or a new client: pick product + moment, get one Studio batch with one ad per static
  format, two lines each (about 10 ads). Test on Grunk Burgundy (Oct 13) or the Lucky BFCM batch.
- **The win record fills itself**: Studio and Asana carry the format onto the batch (`p_br_concept.format` exists and is
  empty today), ads already link to batches by number, so each card shows its hit rate per brand (Motion's method on
  Triple Whale sales). A format with no win in 90 days goes grey.
- **Not building**: a layout editor (Studio already makes the whole ad), another inspiration library (Inspiration
  exists), Motion's long list, per-industry trees.

## Questions for Cole

1. The six static formats as the Templates list, with demo and creator scripts living in Creators?
2. Price ladder: design team with a Canva master per brand (recommended), or Studio with a price check?
3. Build the Drop kit button? If yes, first on Grunk Burgundy or Lucky BFCM?
4. Add credits to Atria so Inspiration and the reference search work again?

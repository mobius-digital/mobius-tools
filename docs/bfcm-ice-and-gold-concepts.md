# Ice & Gold BFCM ads: research and concepts (Oct 13)

Six batches, 78 ads, one ad per numbered line. The offer is still a PROPOSAL waiting on Fela, so every line is
tagged with what it needs. **Build "Offer: none" lines now. Build "List" lines now (only the end line changes if
Fela moves Thursday). Hold every other tag until Cole says the offer is locked.**

## Oct 14 update: the offer is LOCKED (read this first; it overrides the tags below)

Locked with Fela in #ice-gold on Oct 13 (Locus Season, seed 034):
- **Early Bird, Nov 2 to 25:** free pair of studs on any order over **$125** (not $100). Everything else full price.
  The studs listing is ready in about 2 weeks, so no ad pictures the studs yet; the product leads, the studs are line two.
- **Early access, Thu Nov 26:** the email and SMS list gets the Black Friday deal 24 hours early.
- **Black Friday, Nov 27 to 30:** spend $100 save $25, $200 save $60 + free studs, $300 save $100 + free studs.
  **No gift box** (lines tagged Box are dropped or become studs lines). Pick Any 4 for $150 stays live and does not stack.
- **Gifting, Dec 4 to 18:** gift sets at full price, free gift wrap with a name, "order by Dec 18" in every ad.
- **Gift cards, Dec 19 to 24.** Valentine's is still a proposal.

Fela's rules (Oct 13): say "18K gold over stainless steel", never "plated" or "gold PVD"; **drop the owambe and founder
lines** (diversify) so B1 lines 8 and 14, BF lines 9, 23 and 25, Holiday lines 8, 17 and 20 are out or get a general
wedding or party frame; waterproof is allowed but not pushed; the $250 free gift is permanent (say "free gift" only);
returns are 14 days; no 15% codes. Ads are 4:5 with the words in the 1:1 centre, no 9:16.

**Batch 1 BUILT Oct 14** as 10 statics from real iceandgold.com photos (eb-01 to eb-10, `docs/bfcm-ice-and-gold/ads/out/`,
source `build.py`), loaded into Locus Studio as draft batch `0e80356a58a0544c346e93fd` "Early Bird: free studs over $125
(real photos)" on brand_ice_and_gold. No image cost. eb-10 (early access sign-up) needs a signup page to point at.
The 5 creator video lines wait for creators: studs go to them to film by about Oct 27 (Season note).

Sources: build calendar (docs/bfcm-ads-gameplan-2026-10-13.md), Locus Season (p_season_phase, brand_ice_and_gold),
Asana "BFCM 2026" > "Ice & Gold (proposal, show Fela)", creator-link research (docs/research-2026-10-06/ice-and-gold.md),
Locus ad data (Meta spend + Triple Whale lastPlatformClick, Jul 5 to Oct 12), Meta Ad Library (Oct 13),
templates analysis (docs/handoffs/creative-templates-step1.md on claude/xenodochial-darwin-7d1e5f).
docs/bfcm-ad-templates.md does not exist yet, so "Template" below uses the 8 formats from the templates analysis.

## 1. What Ice & Gold's own ads say (TW lastPlatformClick, ad set first)

Meta spend Jul 5 to Oct 12: $17.4K. Ad sets with $150+ spend:

| Ad set | Spend | TW revenue | ROAS | Read |
|---|---|---|---|---|
| 6/24 Online shopping (retail), Summer Sale statics, paused | $603 | $4,509 | 7.48x | The offer static won |
| MOF Dynamic Catalog, paused Jul 30 | $813 | $4,270 | 5.25x | Catalog won |
| 6/24 Broad, paused | $639 | $1,857 | 2.91x | Sale statics again |
| Pageviews / ATC / Engagement 180d (retargeting), active | $1,811 | $3,883 | 2.14x | The one working live set |
| 7-22 Savanah Trybe (Product Page), paused | $279 | $998 | 3.57x | One creator worked |
| Broad - Testing, active | $2,141 | $1,230 | 0.57x | Prospecting misses |
| 6/26 Broad, TikTok creatives, active | $2,204 | $252 | 0.11x | Prospecting misses |
| Three Trybe Mix & Match broad sets, active | $2,365 | $445 | 0.19x | Prospecting misses |

Inside the working retargeting set, the anchor is **Adeola Gold Link Set (partnership)**: $492, 4.77x, 14 orders.
Keep it, build around it. Next: Adeola Lariat Heart Set 3.29x ($232), How to buy Gold Jewelry 1.39x on $556 with
the account's best attention (44% hook, 4.2% CTR).

By ad type, all time:

| Type | Spend | TW ROAS |
|---|---|---|
| Summer sale statics | $1,269 | 6.49x |
| Catalog | $1,139 | 3.75x |
| Adeola partnership videos | $3,573 | 1.37x |
| Founder videos (Fela) | $2,032 | 0.89x |
| TRYBE creator videos (191 ads) | $5,320 | 0.68x |
| Other statics (Mix & Match, Marpipe, July design) | $2,048 | 0.07x |

**Correction to the brief:** "TRYBE creator videos were the best ad type (3.3x)" comes from the Oct 6 research brief
(GabrielleCalderon Mixed Metal, 3.28x on whatever basis that brief used). On TW lastPlatformClick that same ad is 0.30x
on $507 and TRYBE as a group is 0.68x. The creator wins on TW are **Adeola** (set-led, occasion, partnership) and
**Savanah, Gold Link Earrings** (3.99x on $250). The templates analysis (Oct 9) found Ice & Gold had no winner at the
time: $212 a sale on a $158 order.

What that means for BFCM:
1. **Offer statics earned the money** (summer sale 6.5x, catalog 3.75x). BFCM offer statics are likely the earners
   once the offer locks, so the Black Friday batch leans static and includes a catalog line.
2. **Creator video earns on warm audiences, not cold.** Recut Adeola and Savanah with BFCM end cards rather than
   briefing more plain try-ons. New creator briefs go to the shapes that sold: a set, an occasion, one hero piece.
3. **Plain product statics with no offer lost** (0.07x). Every no-offer static below carries a proof, a person, a
   price or a moment, never just a product on marble.

Last year (Cole, from Shopify, Asana Oct 13): ~20% sitewide from mid-November, 25% Thanksgiving to Cyber Monday.
The weekend did only 2.3x a normal day because the discount ran all season. This year November is list-only, so the
weekend has to feel new: the tiers are the news.

## 2. What is running in jewelry now (Meta Ad Library, US, Oct 13)

The library tool returns headlines, not pictures, so open each before using it as a swipe. Internal reference only;
never name these brands in copy.

- Miravel Paris 1121969816874770 "Stop hinting. Send this." and 950866237636786 "She always grabs this finger":
  gift-to-him/her hint and the baby-grab moment.
- Olivia Jewelry 1651954326513149 "Make Four Gifts Feel Personal": the gift list for several people.
- Oriana Grace 1078971631681976 "2 Free necklaces with your order today": gift with purchase as the headline.
- Atolea 4367197786926468 "What's Inside Is Worth $130, Yours for Way Less": the box value frame.
- Objkts Jewelry 1605665811025610 "Sign up for exclusive access" and 3616192598552861 "Sign up now. Access closes
  soon.": early-access list building already live, many variants.
- AURI 2453407438765222 "Shine That Doesn't Fade", Costiera 960032680503653 "Looks unreal in daily wear",
  Blancora 1456035066397576 "18k Gold PVD Jewelry": the proof line is the category headline.
- From the Oct 6 research (Atria): Olivia & Pearl m2154889298715714 (free gift + "sold out last year"), JAXXON
  m1362619162625683 (wife buys him the chain), Melinda Maria m971922298946421 ("Guess the Price?"), Ana Luisa
  m1871996997130595 (compliments, never take off), Mejuri m2134036253849227 (friends event, group offer).
- Web: tiered spend-to-save is common in fine jewelry (gift-with-purchase tiers); I found no demi-fine brand running
  $100/$200/$300 tiers last year, so the ladder is not a copy of anyone.

## 3. Rules for every line

- Statics plus creator video. Statics in Studio; creator video from TRYBE/Adeola recuts (Ravo) or new creator briefs
  via the creator link.
- Say "18K gold-filled" or "gold PVD". Never "gold plated", "real gold" or "solid gold". (The Locus Season detail
  for "Gift list" still says "gold plated pieces": fix that wording before it reaches a brief.)
- Say tarnish free, sweat proof, hypoallergenic, won't turn your skin green, 1-year warranty, free US shipping.
  "Waterproof" only if Fela confirms. "Designed in Atlanta", not "made in".
- Name the piece and the price on every ad. Prices below are from the Oct 6 site read: check them on the day.
- No em dashes. No competitor names. No luxury-ad words (elevate, timeless, treat yourself, main character).
- Studio product drawing is allowed for Ice & Gold (Lucky only is real-photo-only) with the 0-10 product check.
  Chains and clasps are detail-heavy: prefer "Use as the ad" on a real lifestyle photo when one exists, and Redo
  any score under 7.
- Hero products (Cole: narrow to 3 to 5): **Gold Link Set ($249)**, **Gold Link Earrings ($79)**,
  **Lariat Heart Set ($169)**, **Spiral Set ($149)**, **Gold Letter Pendant with Cuban Chain ($89)**. Men's 6mm
  Cuban ($89) and 12mm Diamond Clasp Cuban ($179) only on "for him" lines. Studs ($39 to $47) are the gift.

Offer tags: **none** = build now. **List** = join the list for Thursday early access (build now, low risk).
**Studs** = free studs on a first order over $100. **Early** = 24 hours early on Thursday. **Tiers** = spend $100
save $25 / $200 save $60 / $300 save $100. **Box** = free gift box on every order. **Sets** = the three curated
holiday sets. **Wrap** = free gift wrap until the cutoff. **Cutoff** = the Christmas or Valentine's order-by date.
**Cards** = gift cards switched on in Shopify.

## 4. Studio cost heads-up

Studio averaged **$0.34 an ad** this month (127 ads, Oct 1 to 13); a 9:16 version is about $0.43 more.
52 statics here x ($0.34 + $0.43) = about $40, plus redos (say 25%) = **about $50 for all six batches**.
Creator video lines cost creator commission (15%) or Ravo's time, not Studio money. No AI video planned.

---

## Batch 1: Gift list + early access signup

15 ads (10 static, 5 video). Live Mon Nov 2 to Wed Nov 25. **Done by Oct 19.** Asana 1219215692646595.
Proposal: join the list for early access Thursday + free studs on a first order over $100.
Goal: list growth (KPI) and first orders at full price. Build now: 1, 3, 4, 5, 6, 7, 8, 10, 11, 14, 15 (11 ads).
Hold for the lock: 2, 9, 12, 13 (studs).

**1. Static · Hero + one line · Offer: List**
- Angle: The list shops Black Friday first.
- Why: 60% of customers come back; early access is the reward. Early-access signup ads are live in the category now.
- Concept: Gold Link Set on dark velvet, close. "Black Friday starts a day early for the list." Button: Join the gift list.
- Testing: does a plain early-access promise get cold signups without a gift.
- Reference: Objkts Jewelry 1605665811025610.

**2. Static · Hero + one line · Offer: Studs**
- Angle: Join and your first order comes with a gift.
- Why: a gift keeps pieces at full price in November instead of last year's 20% off.
- Concept: open studs box beside the Gold Link Earrings. "Free studs with your first order over $100."
- Testing: gift vs no gift, against line 1.
- Reference: Oriana Grace 1078971631681976.

**3. Static · Scene + bullets · Offer: none**
- Angle: It won't turn your skin green.
- Why: the category's lead claim; our "How to buy Gold" proof video had the account's best hook (44%) and CTR (4.2%).
- Concept: Gold Link Earrings on a wet sink edge. Bullets: Tarnish free. Sweat proof. Hypoallergenic. 1-year warranty. "$79."
- Testing: proof static as the cold opener for the list.
- Reference: AURI 2453407438765222; research pattern 2.

**4. Static · Moment wrapper · Offer: List**
- Angle: Start the gift list now.
- Why: the customer shops for a family (mom, aunties, sisters); a written list is how she plans it.
- Concept: a handwritten list on paper (Mom, Auntie, Tola, me) with pieces sketched beside each name, the Lariat Heart Set on top. "Make your list. We'll open Black Friday to you a day early."
- Testing: the planning moment vs the product as the hook.
- Reference: Olivia Jewelry 1651954326513149.

**5. Static · Review over product · Offer: none**
- Angle: The box is part of the gift.
- Why: real review; gifting is the season.
- Concept: Lariat Heart Set in its case. Quote: "The packaging was as impressive as the necklace itself." Zaylee, verified buyer. "$169."
- Testing: packaging as the reason to buy for someone else.
- Reference: research B4, own site review.

**6. Static · Hero + one line · Offer: none**
- Angle: Looks like fine jewelry, isn't priced like it.
- Why: price guesses hold attention; Spiral Set did 6.58x on $87 (Adeola).
- Concept: Spiral Set on skin in daylight. "Guess what this cost." Small corner: "$149. 18K gold-filled."
- Testing: price reveal hook on a static.
- Reference: Melinda Maria m971922298946421; Costiera 960032680503653.

**7. Static · Feature callouts · Offer: none**
- Angle: Make it personal.
- Why: letter pendants are the easiest gift to justify; AlexandraGriffiths Letter Pendant sold on TW (2.03x).
- Concept: Gold Letter Pendant with Cuban Chain, callouts: "A to Z." "The pendant comes off." "Him or her." "$89."
- Testing: personalised gift vs set gift (against line 8).
- Reference: research F1.

**8. Static · Scene + bullets · Offer: none**
- Angle: December weddings, one set.
- Why: Adeola Gold Link Set is the account's best ad on TW (4.77x); December is owambe and Detty December season.
- Concept: Gold Link Set laid on aso ebi lace with a folded gele. "Every wedding in December. One set." "Necklace, bracelet, earrings. $249."
- Testing: the occasion frame for the core customer as a static.
- Reference: research C1; own Adeola ads.

**9. Static · Moment wrapper · Offer: Studs**
- Angle: The gift has a deadline.
- Why: a date turns "later" into "now"; the Water Drop Set clears $100 on its own.
- Concept: Water Drop Set with the studs box. "Over $100? Free studs. Until Nov 25."
- Testing: threshold anchored to one piece that clears it.
- Reference: Olivia & Pearl m2154889298715714.

**10. Static · Hero + one line · Offer: List**
- Angle: She buys his chain.
- Why: the wife is the Christmas buyer for the men's line.
- Concept: 6mm Cuban on a folded white tee. "Buying for him this year? Get on the list. Shop Thursday first." "$89."
- Testing: men's product sold to the woman, as a list builder.
- Reference: JAXXON m1362619162625683.

**11. Video · Creator to camera (recut) · Offer: List**
- Angle: The set for the occasion.
- Why: the anchor of the only working ad set.
- Concept: Ravo recuts Adeola Gold Link Set (August cut, the 4.77x one), same open, new last 3 seconds: "Join the gift list. Black Friday opens a day early for you."
- Testing: does the proven cut keep working with a list ask instead of shop now.
- Reference: own ad "Adeola Gold Link Set - Partnership - Copy".

**12. Video · Creator to camera (recut) · Offer: Studs**
- Angle: The earrings people stop you for, plus a free pair.
- Why: Savanah Gold Link Earrings 3.99x on TW, the best TRYBE ad on the right basis.
- Concept: recut Savanah, caption at 0s "the earrings I never take off", end card "Free studs with your first order over $100."
- Testing: best creator cut with the gift end card vs line 11's list end card.
- Reference: own ad "SavanahMaitlen _GoldLinkEarrings_20260722".

**13. Video · Demo / unbox (new brief) · Offer: Studs**
- Angle: I didn't know this came with it.
- Why: the gift reveal is the proposal's own creator ask; surprise is a hook.
- Concept: creator opens her Ice & Gold order on camera, finds the studs box under the necklace, puts them in. Text: "First order over $100 = free studs."
- Testing: surprise gift reveal as a cold ad.
- Reference: research B4; JAXXON m1690346978705251 (box open in second one).
- Note: brief by Oct 15 to film in time; hold the brief itself until the studs are confirmed.

**14. Video · Founder · Offer: List**
- Angle: My mother sold gold.
- Why: founder videos sit at 0.89x with no story; the Nigeria story is the missing piece.
- Concept: Fela holds an old piece of her mother's next to the Gold Link Set. "My mom sold gold in Nigeria. This is what I learned." Ends: "Join the list. Thursday is yours first."
- Testing: founder story vs creator as the list builder.
- Reference: research C4; Melinda Maria founder format.

**15. Video · Demo (new brief) · Offer: none**
- Angle: A week without taking it off.
- Why: proof is the category's lead; diary formats hold to the reveal.
- Concept: shower, gym, bed, day counter on screen, Gold Link Earrings in the same light on day 1 and day 7. "Tarnish free. Sweat proof."
- Testing: proof video for cold traffic.
- Reference: research A1; Oak & Luna m1417233863835377.
- Note: "sweat proof" only until Fela confirms showering is fine on camera.

---

## Batch 2: Early access

3 ads (2 static, 1 video). Live Thu Nov 26. **Done by Nov 12.** Asana 1219215766093313.
Audience: the list and past customers (custom audiences), plus the 180-day retargeting set.
All three need **Early + Tiers** locked.

**1. Static · Hero + one line · Offer: Early + Tiers**
- Angle: You're early.
- Why: 60% come back; rewarding them first protects the weekend.
- Concept: Gold Link Set. "You're on the list. Black Friday is open for you today." Small: "Up to $100 off. Everyone else waits until tomorrow."
- Testing: the insider frame for past buyers.
- Reference: Objkts Jewelry 3616192598552861.

**2. Static · Price ladder · Offer: Early + Tiers**
- Angle: First pick before it sells through.
- Why: the proposal promises first pick of gift sets; scarcity only the list gets.
- Concept: three columns, $100 save $25 / $200 save $60 / $300 save $100, a gift set photo in each. "24 hours before everyone."
- Testing: tiers shown to warm buyers a day early.
- Reference: templates format 4 (price ladder: exact prices, Canva master).

**3. Video · Creator to camera (recut) · Offer: Early + Tiers**
- Angle: Thursday is yours.
- Why: Adeola is the warm-audience winner.
- Concept: Adeola recut with a 0s caption "List only, today." End card with the tiers.
- Testing: creator vs static for the list day.
- Reference: own Adeola ads.

---

## Batch 3: Black Friday weekend

25 ads (17 static, 8 video). Live Fri Nov 27 to Mon Nov 30. **Done by Nov 13.** Asana 1219215855850634.
Proposal: spend $100 save $25, $200 save $60, $300 save $100, free gift box on every order.
Every line needs the lock. Lines with exact prices go through a Canva master (design team), AI only for the
background. Cart math below uses Oct 6 prices: recheck.

**1. Static · Price ladder · Offer: Tiers**
- Angle: The more you get, the more you save.
- Why: the $130 basket is the lever; tiers pull one piece to two.
- Concept: three steps: "$100, save $25. $200, save $60. $300, save $100." Gold on black.
- Testing: the plain ladder (control for lines 2 and 5).
- Reference: templates format 4.

**2. Static · Price ladder · Offer: Tiers**
- Angle: Here's what that looks like in a cart.
- Why: real pieces make the math concrete.
- Concept: "Water Drop Set $129, you pay $104. Gold Link Set $249, you pay $189. Gold Link Set + Gold Link Earrings $328, you pay $228."
- Testing: worked examples vs abstract tiers (line 1).
- Reference: Atolea 4367197786926468.

**3. Static · Hero + one line · Offer: Tiers**
- Angle: Four days only.
- Why: no sale all November, so the weekend is the news.
- Concept: Lariat Heart Set close. "Up to $100 off. Friday to Monday."
- Testing: urgency headline on a hero shot.
- Reference: summer sale statics (6.49x).

**4. Static · Hero + one line · Offer: Box**
- Angle: It arrives gift ready.
- Why: buyers are shopping for other people; reviews praise the box.
- Concept: the gift box closed, ribbon, on a table with wrapping paper pushed aside. "Every order ships in a gift box this weekend. Free."
- Testing: gift box as the hook vs money off.
- Reference: research B4.

**5. Static · Scene + bullets · Offer: Tiers**
- Angle: One for her, one for Mom, one for you.
- Why: she shops a list; three pieces cross $300.
- Concept: three wrapped boxes, tags "Mom", "Sis", "Me", each piece on its lid. "Three gifts. $100 off."
- Testing: gift-list framing vs the plain ladder.
- Reference: Olivia Jewelry 1651954326513149; research B2.

**6. Static · Hero + one line · Offer: Tiers**
- Angle: His is sorted.
- Why: the woman buying for him; 12mm Cuban + a pendant crosses $200.
- Concept: 12mm Diamond Clasp Cuban on a dark shirt collar. "His gift, $60 off at $200."
- Testing: men's line on the weekend.
- Reference: JAXXON m1362619162625683.

**7. Static · Review over product · Offer: Tiers**
- Angle: People keep wearing it.
- Why: proof plus offer for the sceptic.
- Concept: one real review with stars over the Gold Link Earrings, footer "Up to $100 off this weekend."
- Testing: review + offer vs offer alone.
- Reference: templates format 6 (real quotes only).

**8. Static · Scene + bullets · Offer: Tiers**
- Angle: Gold that lasts, on sale for four days.
- Why: the proof claim is the category headline; add the price reason.
- Concept: Twisted Herringbone laid flat. "Tarnish free. Sweat proof. Won't turn your skin green." Footer: "$25 off at $100."
- Testing: proof first, offer second.
- Reference: Costiera 960032680503653.

**9. Static · Moment wrapper · Offer: Tiers**
- Angle: December weddings.
- Why: the Gold Link Set is the account's winner and crosses $200 alone.
- Concept: Gold Link Set on aso ebi lace. "The wedding set. $249, $189 this weekend."
- Testing: the occasion with the offer.
- Reference: own Adeola Gold Link Set.

**10. Static · Price ladder · Offer: Tiers**
- Angle: The pair.
- Why: necklace plus earrings is the natural second piece.
- Concept: Lariat Heart Set + Gold Link Earrings. "$248. You pay $188."
- Testing: one bundle shown vs three (line 2).
- Reference: GLD make-your-own-set (research).

**11. Static · Moment wrapper · Offer: Tiers**
- Angle: Last day.
- Why: Monday needs its own reason.
- Concept: Gold Link Earrings, "Ends tonight. Up to $100 off." Runs Nov 30 only.
- Testing: last-day urgency.
- Reference: summer sale statics.

**12. Static · Notes app · Offer: Tiers**
- Angle: My Black Friday list.
- Why: native-looking format, barely tested at Mobius.
- Concept: a phone note: "Mom: Water Drop Set. Tola: Gold Link Earrings. Me: Lariat Heart. Total $377, $100 off."
- Testing: notes-app format on a jewelry account.
- Reference: templates analysis (notes app untested).

**13. Catalog · Dynamic frame · Offer: Tiers**
- Angle: Show them what they looked at.
- Why: catalog was 5.25x on TW and was paused Jul 30.
- Concept: Advantage+ catalog with a frame: "Up to $100 off. Friday to Monday."
- Testing: bring the catalog back for the weekend.
- Reference: own "MOF - Dynamic Catalog".

**14. Static · Review over product · Offer: Box**
- Angle: The box people talk about.
- Why: the real packaging review plus this weekend's free box.
- Concept: open gift box, Spiral Set inside. "'The packaging was as impressive as the necklace itself.' Every order ships in one this weekend."
- Testing: review + box vs box alone (line 4).
- Reference: research B4.

**15. Static · Feature callouts · Offer: Tiers**
- Angle: His letter, her letter.
- Why: two letter pendants cross $100.
- Concept: two Letter Pendants spelling the couple's initials. "Two letters, $178. You pay $153."
- Testing: personal gift with the offer.
- Reference: research F1.

**16. Static · Moment wrapper · Offer: Tiers**
- Angle: Cyber Monday.
- Why: a new name on the last day reaches people who skipped Friday.
- Concept: Gold Link Set. "Cyber Monday. Same deal, last day."
- Testing: a Monday-only creative vs line 11.
- Reference: none.

**17. Static · Scene + bullets · Offer: Tiers**
- Angle: Build your stack.
- Why: mixed metal is the stacking permission; two to three earrings cross $200.
- Concept: one ear, three pieces with prices. "Stack to $200, save $60."
- Testing: stacking as the reason to add a piece.
- Reference: research D2.

**18. Video · Creator to camera (recut) · Offer: Tiers**
- Angle: The set for the occasion.
- Concept: Adeola Gold Link Set recut, caption at 0s "$60 off this set this weekend", tier end card.
- Testing: the winner with the weekend offer.
- Reference: own Adeola ads.

**19. Video · Creator to camera (recut) · Offer: Tiers**
- Angle: The earrings you never take off.
- Concept: Savanah Gold Link Earrings recut, tier end card.
- Testing: second creator winner with the offer.
- Reference: own Savanah ad.

**20. Video · Demo, cart build (new brief) · Offer: Tiers**
- Angle: Watch me get $100 off.
- Why: the ladder is easier to see than to read.
- Concept: creator adds pieces on her phone, the total crosses $300, the discount line appears; she holds up what she bought.
- Testing: a screen-recording demo of the tiers.
- Reference: research B6.

**21. Video · Giver's story (new brief) · Offer: Tiers**
- Angle: She bought him the chain.
- Why: the cleanest gifting script in the category; the wife is the buyer.
- Concept: her hands open his box before he's home, she weighs the 12mm Cuban; the handover; he puts it on. End card: tiers.
- Testing: men's gift story on the weekend.
- Reference: research E2; JAXXON m1362619162625683.

**22. Video · Gift guide (new brief) · Offer: Tiers**
- Angle: Four women, one box each.
- Concept: four boxes with name tags, each flips to the piece; the last is "mine". End: the total and the saving.
- Testing: gift-guide creator video vs the static (line 5).
- Reference: research B2.

**23. Video · Founder · Offer: Tiers**
- Angle: We didn't run a sale all November.
- Why: true this year, and it explains why the weekend is worth waiting for.
- Concept: Fela at the packing table: "No sale all month. This weekend, up to $100 off." Needs Fela to agree to say it.
- Testing: founder voice for the offer.
- Reference: research C4.

**24. Video · Unbox / ASMR · Offer: Box**
- Angle: What shows up at your door.
- Concept: two seconds of sound only, box slides open, inner case, piece lifted out. Text: "Free gift box on every order this weekend."
- Testing: unbox video vs box static (line 4).
- Reference: research B4.

**25. Video · GRWM (new brief) · Offer: Tiers**
- Angle: Owambe Saturday.
- Concept: gele tied, the Gold Link Set goes on last, the full look at the door. End card: "$60 off this set this weekend."
- Testing: occasion creator video with the offer.
- Reference: research C1.

---

## Batch 4: Holiday sets + order by Christmas

20 ads (13 static, 7 video). Live Fri Dec 4 to Wed Dec 16. **Done by Nov 20.** Asana 1219215692432260.
Proposal: three curated gift sets (her, him, the pair) at full price; free gift wrap until the cutoff; the order-by
date on every ad. Needs from Fela: what is in the three sets, the real shipping cutoff.
Build now: 6, 7, 8, 9, 11, 13, 14 to 18 (11 ads).

**1. Static · Hero + one line · Offer: Sets** · Angle: The set for her. · Why: sets are the gift and sell to this audience. · Concept: the her set in its box, name and price. · Testing: curated set vs single piece. · Reference: own Adeola set ads.

**2. Static · Hero + one line · Offer: Sets** · Angle: The set for him. · Why: the wife is the buyer. · Concept: the him set on a dark shirt, name and price. · Testing: men's set to women. · Reference: research E1, E2.

**3. Static · Hero + one line · Offer: Sets** · Angle: The pair. · Why: matching is a gift couples and friends buy together. · Concept: the pair set on two wrists. · Testing: pair set as a new product. · Reference: research F1.

**4. Static · Moment wrapper · Offer: Cutoff** · Angle: Order by Dec X. · Why: a date is the strongest December reason. · Concept: Lariat Heart Set and a calendar page circled. "Order by Dec X for Christmas." · Testing: deadline as the headline. · Reference: Olivia & Pearl m2154889298715714.

**5. Static · Hero + one line · Offer: Wrap** · Angle: We wrap it. · Why: the $16 wrap free removes a chore. · Concept: the wrapped box with the Ice & Gold ribbon. "Free gift wrap until Dec X." · Testing: wrap as the offer vs no offer. · Reference: research B4.

**6. Static · Scene + bullets · Offer: none** · Angle: A gift for everyone on the list. · Why: she buys for a family. · Concept: four pieces with names and prices: Mom, Water Drop Set $129. Sis, Gold Link Earrings $79. Him, 6mm Cuban $89. Me, Spiral Set $149. · Testing: gift guide by person. · Reference: Olivia Jewelry 1651954326513149.

**7. Static · Hero + one line · Offer: none** · Angle: Stop hinting. · Why: the hint ad is live in the category and fits the woman sending it to him. · Concept: Lariat Heart Set, "Send this to him. The name and price are right here. $169." · Testing: share-to-him framing. · Reference: Miravel Paris 1121969816874770; research B5.

**8. Static · Moment wrapper · Offer: none** · Angle: Lagos in December. · Why: Detty December is the core customer's season. · Concept: Gold Link Set on a packed suitcase with a passport. "December plans. Pack the gold." · Testing: Detty December moment for the diaspora. · Reference: research section 4.

**9. Static · Review over product · Offer: none** · Angle: She'll wear it every day. · Concept: a real review over the Gold Link Earrings. · Testing: review as the December proof. · Reference: templates format 6.

**10. Static · Hero + one line · Offer: Wrap** · Angle: No wrapping needed. · Concept: the gift box under a tree. "Arrives ready to give." · Testing: gift-ready vs wrap free (line 5). · Reference: research B4.

**11. Static · Price ladder · Offer: none** · Angle: Gifts under $100. · Why: budget is the first filter for a gift list. · Concept: Initial Pave Pendant $59, Twisted Herringbone $69, Gold Link Earrings $79, Letter Pendant $89. · Testing: price-led gift guide. · Reference: templates format 4.

**12. Static · Moment wrapper · Offer: Cutoff** · Angle: Last day to order. · Concept: Gold Link Set. "Last day for Christmas delivery." Runs on the cutoff day only. · Testing: last-day push. · Reference: summer sale statics.

**13. Static · Hero + one line · Offer: none** · Angle: Wear where you're from. · Why: heritage gift for a dad or brother. · Concept: Africa Pendant on a man's chest. "For Dad. $89." · Testing: heritage gift to men. · Reference: research F2.

**14. Video · Reaction (new brief) · Offer: none** · Angle: She opened it. · Concept: a mother opens the box, the pause, she puts it on. · Testing: real reaction as a December ad. · Reference: research B3.

**15. Video · Giver's story (new brief, or reuse Batch 3 line 21) · Offer: none** · Angle: She bought him the chain. · Testing: the same story at full price in December. · Reference: research E2.

**16. Video · Gift guide (new brief, or reuse Batch 3 line 22 without the offer) · Offer: none** · Angle: Four women, one box each. · Reference: research B2.

**17. Video · GRWM (reuse Batch 3 line 25 without the offer) · Offer: none** · Angle: December wedding. · Reference: research C1.

**18. Video · Story (new brief) · Offer: none** · Angle: Lion or compass, depends what he's going through. · Why: the compass sold nothing as a plain try-on; the meaning is the sale. · Concept: two pendants, a reason for each, one on a man. · Testing: meaning-led men's gift. · Reference: research E4.

**19. Video · Creator to camera (recut) · Offer: Cutoff** · Angle: Order by Dec X. · Concept: Adeola recut with the date as the end card. · Testing: winner with the deadline. · Reference: own Adeola ads.

**20. Video · Founder · Offer: Cutoff** · Angle: Packing your orders. · Concept: Fela wrapping orders, "Order by Dec X and it's under the tree." · Testing: founder at the deadline. · Reference: research C4.

---

## Batch 5: Gift cards

5 ads (4 static, 1 video). Live Thu Dec 17 to Thu Dec 24. **Done by Dec 3.** Asana 1219215856002311.
Needs: gift cards switched on in Shopify (Locus Season note) and the amounts. All five need **Cards**.

**1. Static · Hero + one line · Offer: Cards** · Angle: Missed the shipping cutoff. · Concept: a phone with a text: "Merry Christmas. Pick your gold." "Ice & Gold gift card. Arrives in minutes." · Testing: late-shopper rescue. · Reference: Dartee/Lucky gift card batches (same week).

**2. Static · Hero + one line · Offer: Cards** · Angle: Let her pick. · Why: jewelry taste is personal. · Concept: the gift card on velvet beside three pieces. "Not sure which one? Let her choose." · Testing: choice vs speed (line 1).

**3. Static · Price ladder · Offer: Cards** · Angle: Pick an amount. · Concept: $50 / $100 / $150 cards with a piece each amount buys. · Testing: amounts tied to real pieces.

**4. Static · Moment wrapper · Offer: Cards** · Angle: It's Christmas Eve. · Concept: "Dec 24. Still time." Runs Dec 23 and 24 only. · Testing: last-minute urgency.

**5. Video · Creator to camera (new brief) · Offer: Cards** · Angle: I forgot my sister. · Concept: creator realises, buys a card on her phone, texts it, sister replies with a screenshot of what she picked. · Testing: gift card as a story.

---

## Batch 6: Valentine's

10 ads (6 static, 4 video). Live Thu Jan 14 to Sun Feb 7. **Done by Dec 31.** Asana 1219215951744120.
Proposal: the pair sets and the heart pieces, gift wrapped, the Thursday list first again. Needs: the Valentine's
order-by date. Build now: 1, 2, 6, 7, 8, 9 (6 ads).

**1. Static · Hero + one line · Offer: none** · Angle: The hint, sent. · Concept: Lariat Heart Set held up, chain through the heart. "Valentine's is in three weeks. This is the hint. $169." · Testing: the hint static for January. · Reference: Miravel Paris 1121969816874770; research F3.

**2. Static · Feature callouts · Offer: none** · Angle: His letter, her letter. · Concept: two Letter Pendants on two necks. "A to Z. Unisex. $89 each." · Testing: couples personalisation. · Reference: research F1.

**3. Static · Hero + one line · Offer: Sets** · Angle: The pair set. · Concept: the pair set on two hands. · Testing: the December pair set again for couples.

**4. Static · Moment wrapper · Offer: Cutoff** · Angle: Order by Feb X. · Concept: Lariat Heart Set. "Order by Feb X for Valentine's." · Testing: deadline.

**5. Static · Hero + one line · Offer: Wrap** · Angle: Wrapped and ready. · Concept: the wrapped heart box. "Gift wrapped, free." · Testing: wrap as the Valentine's offer.

**6. Static · Scene + bullets · Offer: none** · Angle: Galentine's. · Why: friends buy matching pieces. · Concept: three friends' wrists, matching Spiral Sets. "Matching for the girls. $149." · Testing: friends as a second Valentine's buyer. · Reference: Mejuri m2134036253849227.

**7. Video · Direct address (new brief) · Offer: none** · Angle: If you're seeing this, she sent it. · Concept: her face, the piece on, the price on screen so he can't get it wrong. · Testing: the share-to-him video. · Reference: research B5, F3.

**8. Video · Reaction (new brief) · Offer: none** · Angle: He got it right. · Concept: the box at the door, she puts it on at dinner. · Testing: his side of the story. · Reference: research F3.

**9. Video · Giver's story (reuse Batch 3/4) · Offer: none** · Angle: She bought him the chain, Valentine's cut. · Testing: the men's story outside Christmas. · Reference: research E2.

**10. Video · Creator to camera (recut) · Offer: List** · Angle: The list shops first again. · Concept: Adeola or Savanah recut, end card "List gets Valentine's first." · Testing: does the list still respond after BFCM.

---

## 5. Totals and what is blocked

| Batch | Ads | Static / video | Build now | Waiting on |
|---|---|---|---|---|
| Gift list | 15 | 10 / 5 | 11 | Studs (4) |
| Early access | 3 | 2 / 1 | 0 | Early + Tiers |
| Black Friday | 25 | 17 / 8 | 0 | Tiers, Box |
| Holiday sets | 20 | 13 / 7 | 11 | Sets, Wrap, Cutoff |
| Gift cards | 5 | 4 / 1 | 0 | Cards on in Shopify |
| Valentine's | 10 | 6 / 4 | 6 | Sets, Wrap, Cutoff |
| **Total** | **78** | **52 / 26** | **28** | |

## 6. Open questions (for Cole, then Fela)

1. Offer lock: Cole recommends tiers over buy 2 get 1 (Asana, Oct 13). Does Fela agree, and is the free gift box on top?
2. Studs: which studs, and is it "first order over $100" or any order over $100?
3. The site's standing "free gift over $250": does it run alongside the tiers or switch off for the weekend?
4. Waterproof: can creators shower in it on camera (Batch 1 line 15)?
5. The three holiday sets: what is in each and the price.
6. Shipping cutoffs for Christmas and Valentine's.
7. Gift cards switched on in Shopify, and which amounts.
8. Creator briefs needing filming before Oct 19 (Batch 1 lines 13 to 15): go now for the no-offer ones?

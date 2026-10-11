# The brand kit: Locus and Kept (2026-10-11)

Session B of docs/two-products.md. The board is docs/brand/board.html (rebuild it with `python3 docs/brand/build.py`
after touching anything in logo/); the shareable copy is the artifact linked from the session report. The marks are
in logo/locus/ and logo/kept/ (the money app's folder, both names; direction-N.svg is the mark, direction-N-asleep / -thinking / -found / -clear are the
helper), the tokens in logo/kit.css. Nothing here is wired into an app yet; that is sessions D and E.

## One construction

Every mark is a ring of radius 21 on a 64 grid, stroke 5, round caps, drawn in currentColor, so it takes the app's
colour wherever it sits (blue on a surface, white on the field, ink in a document). The helper is the same drawing
with a face: two dots and a mouth at most. On a filled dot the face is a hole (an SVG mask), so whatever is behind
the helper shows through the eyes and the mark stays one colour. Inside an outline the face is drawn in the same
colour. Asleep is drawn at 55% and closes the eyes; thinking looks aside; found widens the eyes, opens the mouth
and lifts the mark; all clear is the small nod, happy eyes and a smile with the mark a touch lower.

Beside the Mobius mark: the ribbon's band is about 14% of its height, the rings' stroke is 12% of the ring, so the
three share a weight without sharing a shape. The Mobius mark leaves the apps and stays on the agency site.

## Locus

**Direction 1, the trail.** A point and the path it has travelled: a dot at the head of an arc that fades behind it
in eight steps. The idea is the word itself, a locus is a point moving along a path, and the trail is the morning
read: where the dot has been before you woke up. It is strong because it is the only mark of the six that moves
while standing still, and the helper gets a posture for free (asleep at the bottom with a short trail, thinking on
its way round, found at the top with the whole path behind it). It is weak because it is not symmetrical, so it
fights a square app icon and a favicon, and at 20px the fade is a smudge behind a dot. It was the previous
session's proposal and it is kept as direction 1.

**Direction 2, the bead.** A point sitting in its ring, in a gap it completes. The ring is the path whole; the bead
is where you are on it. It is the simplest of the six and the one that survives 16px, and the bead's place on the
ring is the state: at the bottom asleep, at the left thinking, lifted out of the ring when it has found something,
back home at the top right when all is clear. It is weak because a ring with a dot is a shape other apps already
own (status dots, record buttons, a few location apps); the gap and the character carry the difference, and the
mark on its own could be mistaken for a generic one.

**Direction 3, the heading.** A point at the centre and a needle from it to the ring. It says what Locus sells, the
call: here is where you are and this is the way to go. The needle is the posture, hanging down asleep, swung to
the side thinking, straight up like an exclamation when it has found something, back to the top right when all is
clear. It is weak because at 20px it can read as a clock, a dial or a power button, and on a phone the needle
crowds the face. The crosshair the brief suggested was tried in the sketch stage and dropped: ring, axis and dot
together are the OS "locate me" glyph, and the needle says direction where the crosshair only says target.

## Kept

**Direction 1, the coin.** A disc with its edge showing: a ring and a second arc under it, so it is a coin and not a
plain circle. The face has the most room of the three, and the drawing is the plainest reading of what the app is
about. It is weak because a coin is the oldest money symbol there is, and on its own it says nothing about what is
different here; the character has to do all the work. It was the previous session's proposal and stays as
direction 1.

**Direction 2, the stack.** A coin standing on the coins already kept. The mark carries the promise in the name:
what you kept, kept. It is the only direction whose all-clear state changes the mark itself, a third coin joins the
pile on a clean close, so a good month shows on the icon. It is weak because it is the tallest and busiest of the
six, the bars thin to lines at 20px, and it is the one mark that does not sit inside a circle, so it is the odd one
out beside the five rings and beside the Mobius ribbon.

**Direction 3, the jar.** A round jar with a lid, filled to what you kept. The fill line is the hero number drawn as a
shape, and it moves: fuller on a clean close, and the face looks down at it while thinking. It pairs with the
video's melting balance without copying it (the balance melts, the jar holds). It is weak because a half-filled
circle reads as a gauge or a contrast icon before it reads as a jar, and the lid is a second shape on top of the
one construction, which bends the family rule a little.

**Direction 4, Cashew, the nut.** Added at Cole's word, the same morning: the money app's name is between Kept and
Cashew (cash, and a nut with a face; the tagline stays "Know what you kept"), so Cashew is a full direction, not a
variant. The mark is a cashew drawn as one closed stroke on the same grid: the belly sits on the ring's radius, the
curl is 160 degrees, the head end is fatter than the tail, stroke 5, currentColor. The helper is the nut itself,
filled, with the face punched through like the Locus dot (two dots and a mouth, no arms, no blush, no gradient),
lifted when it has found something, lowered for the nod. It is strong because the name and the mark are one joke
told once and the character has the most personality to lean into of the four, and because the plain outline is a
quiet mark on a CPA pack. It is weak because it is the one shape here that is not a circle, so it is the odd one
beside Locus and the Mobius ribbon; a kidney at 20px can read as a crescent moon; and the name says nothing
about money until the tagline does. It lives in logo/kept/direction-4*.svg because the folder is the money app,
whatever the name ends up being. The board shows both names set in Inter beside their marks, and a CPA pack
header that carries whichever plain mark is ticked.

**Direction 5, Cashew, the nut, filled.** The parent session's note after the first board: at 48px and 20px the
open stroke of direction 4 reads as a crescent moon, and Cashew is the name Cole is most drawn to, so the same
direction got a second take. The mark is the cashew as a solid silhouette on the 64 grid, with the stem as a
dimple cut into the head cap (one path, three arcs where the cap was one), and the kidney drawn fatter and a size
smaller than direction 4 (belly 16.5 on a curl of radius 12, against 19 on 14) so its ink at 20px matches the Locus
ring and the Kept coin beside it; the card on the board shows
that row in ink next to the Mobius ribbon at 48px and 20px. The helper is the same silhouette with the face
punched through the fill, used at 48px and above; at 20px the plain nut is used, so the ask bar carries no face.
It is strong because the silhouette is unmistakably a cashew at every size, where direction 4's outline is not. It
is weak because it is the only solid mark in the family, so on a dark surface it reads heavier than the rings even
at matched ink, and a filled kidney is a shape nut brands already use.

## The two fields

Locus blue is the v2 Locus blue, `#2F62D9`, kept as the field: white ink on it is 5.4:1. Kept green is the Ledger
green from /mobius.css (`#5CC395`) deepened to `#1E7A52` until white ink passes on it as a full field (5.3:1); the
hue is unchanged so the Ledger icon and the new field agree. In the dark theme the field goes one step deeper
(`#2451B8`, `#176443`) so a full screen does not glare, and the ink on it stays white. As text on a surface the
colours are `#2552BF` and `#1B6B48` in light and lighten to `#8FB3FF` and `#6FD0A4` in dark, because the field
colours fail as text on the graphite canvas. Each app reads `--field`, `--field-ink` and `--field-soft`, picked by
`<html data-product="locus|kept">`, so one screen serves both.

## The accent word

One serif italic word per page head, the word that carries the sentence: "what you *actually* kept", "know what to
*change* today". Instrument Serif italic, already loaded by every Mobius tool and the closest Google Font that
pairs with Inter (a narrow, high-contrast italic beside a plain sans). It is set 8% larger than the sans so the
x-heights line up, takes the product's colour on a surface and stays white on a field. Never two in a head, never a
whole sentence, never on a number, a button or a label. The class is `.kit-accent` (or `em` inside `.kit-head`).

## Cashew, round two (2026-10-11, later)

Cole decided: Locus is the bead (direction 2), and the money app is called Cashew. His verdict on the two nut
marks from round one (directions 4 and 5): "looks terrible". The mistake was drawing a literal nut in one stroke
on the ring grid. Round two is three real directions, each a logo rather than a pictogram, generated by
`docs/brand/cashew-round-2.py` into `logo/cashew/round-2/`. Each is shown on the board at 200, 48, 20 and 16px,
on white and on the green field, and beside the Locus bead and the Mobius ribbon. The round-one drawings stay in
`logo/kept/` and in a folded box on the board as the record.

**Direction 1, the curl** (`curl.svg`). The C of Cashew as one thick stroke along three arcs: a 224 degree arc
of radius 15 at stroke 14, open to the right, whose top end tightens into a hook of radius 6.5 that turns into the
mouth of the C. Solid, geometric, currentColor; the round caps come from the stroke. The inward curl at the head
is the whole suggestion of the nut, the way the Shopify bag suggests a bag. It is the simplest of the three and the
one that holds at 16px, and it sits beside the Locus bead as a relative: the same weight, one a ring, one a curl.
It is weak because on its own it is a bold C with a curled terminal, so the nut is only there once you know the
name, and a curl this fat can pass for a lower-case e or a 6 in a crowded tab bar. A hook at the bottom end was
tried and read as a G; it is out.

**Direction 2, the wordmark** (`wordmark.svg`, `c-icon.svg`). "cashew" drawn as a monoline geometric lowercase,
paths rather than a typeface: x-height 26 on a stroke of 5.6, round caps. The c is a circle open at the right whose
top terminal curls inward on a tighter arc; the a is a bowl with a stem; the s is two half circles; the h is a stem
and an arch; the e a circle with a bar, open at the lower right; the w two bowls side by side with a short middle
stem, so it sits like a double bowl. The C alone, at stroke 10 on the 64 grid, is the app icon. It pairs with
Inter because it is the same geometry at a heavier weight, and the word is what goes on the CPA pack and the site.
It is weak because a rounded monoline lowercase is a familiar register (much of fintech lives there), and the C
icon says Cashew only next to the word.

**Direction 3, the character** (`character*.svg`, `character-mark.svg`). A plump kidney drawn from twelve
anchors as a closed curve, with a bigger head lobe at the upper left, a smaller tail lobe at the lower right and a
soft dent between them; the body in the Cashew green, a lighter belly in the Ledger green (`#5CC395`), a darker
stem cap on the head, two dot eyes and a mouth in ink. Four states: asleep (eyes closed, a little faded), thinking
(eyes aside), found something (eyes wide, mouth open, lifted), all clear (happy eyes, a smile, the nod). The mark
in this direction is the silhouette, body plus cap, as one solid shape in currentColor, with the wordmark from
direction 2 beside it as the lockup. It is the direction with the most personality to lean into and the one that
carries the commercial without props. It is weak because a character is the most work to keep consistent across
the app, the site and the spot; the silhouette alone is a bean at 16px and wants the word next to it; and the
illustration cannot sit on the green field in its own colours, so the field gets the silhouette in white.

## Final picks and the icon set (2026-10-11, end of day)

- **Locus: the bead, direction 2.** Cole's pick. Icons in `logo/locus/icons/`: `icon-512.png`, `icon-192.png`,
  `icon-180.png` (Apple touch), `favicon-32.png` and `favicon.svg`, the bead in white centred on the Locus blue at
  60% of the box, square (the OS rounds the corners), plus `icon-maskable.svg` and `icon-maskable-512.png` at 46%
  for the maskable safe zone. Rendered from the SVG through Chromium; the 32px favicon reads as the ring and bead.
- **Cashew: the wordmark is the logo, the C is the app icon, the character is the helper.** The parent
  session's pick from round two, confirmed by Cole for the logo: logo and mascot kept separate, the way the reference video
  splits its mark from its puddle. The character got one more polish pass (three tries, the second kept): a deeper
  kidney bend with the head curling back toward the belly and the tail curling up toward the head, the stem cap
  smaller and tucked, the lighter belly grown to carry the face, the eyes bigger and set lower so the expression
  reads at 48px.
- **The final files, at fixed paths** (other sessions load them by path), all in `logo/cashew/`, written by
  `docs/brand/cashew-round-2.py` alongside the round-two explorations:
  `mark.svg` (the C, the app icon), `wordmark.svg`, `lockup.svg` (the silhouette at 48 units beside the wordmark,
  one colour), `silhouette.svg` (body plus cap in currentColor, for the field and the CPA pack), and the character
  in full colour: `rest.svg`, `asleep.svg`, `thinking.svg`, `found.svg`, `clear.svg`.
  Icons in `logo/cashew/icons/`, the same set as Locus, built from the C in white on the Cashew green.
- **The character is rendered, not drawn (2026-10-11, closing).** Cole rejected the drawn character from
  direction 3 ("looks drawn, not a logo"). The helper is now an image-model render made by the parent session: a
  glossy green cashew with a pale belly and two bead eyes, cut out onto transparent PNGs in five states (rest,
  thinking, found, asleep, clear) at `logo/cashew/character/`, 200px today, 1024px for the commercial when
  exported. Why a render: a mascot in the reference video is a lit object with weight and gloss, and a flat vector
  face next to a flat vector wordmark read as two logos competing; a rendered character sits in a different
  register from the logo, which is the split the video makes between its mark and its puddle. The wordmark and
  the C stay the logo; the silhouette stays for one-colour places; the drawn vector states in `logo/cashew/` and
  the round-two card on the board stay as the record. The board inlines the five PNGs so it needs no files beside it.
- **How they are used.** The wordmark goes on the CPA pack, the site and the gate's foot; the C on the phone and
  in the tab; the silhouette in white on the green field and wherever one colour is required; the character in
  the ask bar, the nudge card, the empty states and the commercial, never on a document.
- The board's pick box defaults to these two and says so; the round-one drawings stay folded as the record.

## The pick

The board keeps a tick per product in the browser and a Copy button that writes the pick as one line for Slack.
My own pick from round one was the bead for Locus (now Cole's pick) and the jar for Kept (overtaken by the name).
For Cashew round two: the character (direction 3) with the wordmark as its lockup, because it is the only one of
the three that gives the helper a body the commercial can act with, and the wordmark covers the places a character
should never go (the CPA pack, the invoice, the site footer). If Cole wants one mark and no mascot, the curl.

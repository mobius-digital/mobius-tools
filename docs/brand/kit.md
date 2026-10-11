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

## The pick

The board keeps a tick per product in the browser and a Copy button that writes the pick as one line for Slack.
My own pick, with one reason each: Locus the bead (direction 2), because it is the mark that still reads at a
favicon and the helper's position on the ring tells the state without a face; Kept the jar (direction 3), because
the fill line is the product's one number drawn as a shape and it is the only Kept mark that can show a good
month and a leak with the same drawing.

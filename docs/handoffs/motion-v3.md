# Motion v3: the polish pass on the two commercials (2026-10-13)

Branch `motion-v3` from `main`. Not merged (main deploys the site). The project is `motion/`; how to render,
re-voice a line or swap a number is in `motion/README.md`; what v2 built is in `motion-v2.md`. The shareable page
is updated in place: https://claude.ai/artifact/EfkzcHEK8FGuYmFmQ2MzZq.

Cole approved the v2 direction and agreed with four notes. All four are done, plus a fifth round from a frame by
frame pass against the reference.

## 1. The character is the scene at the beats

- **Rebuilt in SVG** (`motion/src/marks/Toon.tsx`). The Cashew body is the `rest.png` alpha edge, traced by
  `motion/scripts/trace-character.py` into a 38 point curve; Locus is a sphere, a face set in a bezel and a ring
  that passes behind and in front. The colours are sampled from the renders (body `#328E56`, belly `#A0C89F`,
  Locus body `#3E7CDB`, face `#9BC3FA`) and built back as radial gradients with blurred specular highlights, a rim
  light, and a contact shadow. A `ToonSheet` composition renders each PNG state beside its SVG twin for checking.
- **The face acts.** Eyes open, close (a happy arch or a sleepy curve), widen, look; the mouth smiles, opens,
  rounds to an o. Each PNG state (rest, thinking, found, asleep, clear) is a preset of those numbers and two
  presets blend. The body squashes and stretches about its feet (volume kept), tilts, lifts; Locus has a bead on
  its orbit. `Act` in `Mark.tsx` adds idle breathing and a blink so it is never a sticker.
- **The PNGs stay as the fallback.** In `brand.ts` set a character's `kind` to `'image'` and the old PNG states
  come back, with the squash and a soft drop shadow.
- **Where it is centre stage now** (sizes are the SVG box; the visible body is about 70% of it):

| Beat | Cashew | Locus |
| --- | --- | --- |
| The pain | rises out of the puddle at 520, lands with a squash, eyes up at $3,120, then the sigh deflates it and it half fills again | 420, bottom left in the opening, eyes on whichever number is speaking, confused at the "?" |
| Where did it go | April: 430, eyes follow the month flips, jolts at April | 430 at the bleeding bars, eyes run down with the red, then look left and right |
| The reveal | 480 under the wordmark with a hop, then off to the corner looking at the cards | 560 under the lockup, wakes from asleep with a stretch and a hop |
| The tap | 410, leans toward the button, hops at Booked, happy | 440, leans in, hops at Paused |
| The ending | 540, a pop, a nod, happy eyes | 560, the same |

Elsewhere it sits at 330 to 340 and still breathes, blinks, looks at the card that matters and nods.

## 2. The paper scenes have depth

`motion/src/fx/Paper.tsx`, under the Cashew bites and April and the Locus bleed: a soft radial light with warm
falling off edges, sixteen faint fragments of app UI (a line chart tile, a bar row, a dollar chip, a list row)
drifting upward at three depths with blur for the far ones, and a fine grain that shifts every two frames. The
card shadows are the v2 ones; the fragments behind them do the separating. At each bite, `BiteBurst` throws
chunks of the green pill and the digits of the amount taken ($4,200, $6,900, ...), spinning and falling. The cost
characters are larger (330 from 240) and lunge further.

## 3. The mix

Measured with ffmpeg `ebur128`, stems rendered alone (`node scripts/mix.mjs`; the `stem` input prop plays only
the voice, the bed or the sounds).

| Before (v2) | Cashew | Locus |
| --- | --- | --- |
| Whole spot | -17.3 LUFS, -2.8 dBTP | -18.0 LUFS, -2.7 dBTP |
| Voice alone | -17.4 LUFS | -18.1 LUFS |
| Bed alone | -40.9 LUFS | -40.9 LUFS |

The bed sat about 17 dB under where it should, which is why nobody heard it. Now: the bed files are written near
full scale (-16.8 LUFS), the bed plays at 0.76 and ducks to 0.5 (6 dB) under each line, and `render.mjs` masters
every MP4: it measures the integrated loudness, applies the gain to land at -16 LUFS, and runs a limiter at
192 kHz (four times the rate, so it catches the peaks between samples) at -1.4 dBFS. Pre master the bed measures
-24.8 under speech and -22.8 averaged over the gaps (the ramps pull the average down; a gap longer than a second
reaches -19); the master adds about 1.2 dB to everything. The measured results of the final renders are in the
render table below.

New sounds, each placed on the frame of its picture event: `sigh` (the deflate), `hop` (every hop: the reveal,
April, Booked, Paused, the wake, the morning), `land` (the landing out of the puddle, the ending). Every bite pop
is on the chomp frame, the tab ticks on the tab frames.

## 4. The 4 fps pass, every place ours is weaker than the reference

Both spots rendered at 0.4 scale, cut to four frames a second and tiled beside the reference cut the same way.

Cashew:

1. 0.0 to 0.5 s: the bank card fades in on a bare field. The reference opens moving.
2. 4.0 s: paper arrives as a plain fade. The reference cuts with bubbles bursting.
3. **6 to 15 s: the cost characters are small and parked at the pill's edge; the reference's are as large as the
   pill and in the middle.** Fixed: 330, closer, a longer lunge.
4. 15 to 18 s: the melt and the rise are good; the hold after the sigh is still long.
5. **18.5 to 20.3 s: almost two seconds of empty black under "Or add it up yourself" before the first tab.**
   Fixed: the browser opens at once on a new tab with "where did the money go" typing into it.
6. **20 to 29 s: the tabs beat is nine seconds of a static dark window with a count.** The reference does it in
   three with chips flying. Fixed in part: every tab flies in as a chip from off the frame and lands in the
   strip, and the camera creeps in and turns the whole beat. It is still long because each name is spoken.
7. **29.75 s, 33.0 s, 47.25 s, 50.0 s, 55.0 s: field changes dissolve through grey.** Fixed: the field cuts in
   6 frames.
8. 33.0 to 33.25 s and 55.25 to 55.75 s: a beat of empty field before the wordmark.
9. **40 to 45 s: the finding card holds almost still for five seconds.** Fixed: the camera drifts from the first
   frame and pushes into the finding.
10. 50 to 53 s: the close checklist is small text ticking; the reference's equivalents are one big object.
11. 56 to 59 s: the ending holds two seconds on a still frame (the character now nods and blinks through it).

Locus:

1. **0.5 to 4.5 s: the two platform cards sit in the top half; the bottom half of the frame is empty for four
   seconds.** Fixed: the character fills it, watching whichever number speaks.
2. 4.75 s: the "?" beat is quick and small next to the reference's "LYING."
3. 9 to 11 s: the clock spin is good; the "11:47" type is smaller than the reference's.
4. **11.5 to 21 s: the same static tabs window.** Fixed with the chips and the creep, as for Cashew.
5. 24.5 to 29 s: the Home tiles are readable but small in the frame.
6. **33 to 36 s and 37 to 42 s: the hero and the calls hold still.** Fixed: both drift and push for the whole
   scene.
7. 44.5 s: the angle scene enters as a slide where the reference cuts.
8. 52 to 55 s: the ending is the same quiet hold as Cashew's.

The top five fixed are the bold ones: the empty black before the tabs, the static tabs, the grey dissolves, the
small costs, the still window holds, and the empty half of the Locus opening (six, since the tabs fix covers
both spots). Left as notes: the opening and paper entrances (Cashew 1, 2), the empty beats before the two
wordmarks (Cashew 8), the close checklist (Cashew 10), the "?" beat (Locus 2), and the tile scale (Locus 5).

## 5. Renders

From `node scripts/render.mjs` on the cloud session (4 cores, software ANGLE), CRF 28, the master step included.
The SVG characters and the grain cost a little per frame against v2.

| Composition | Time | Size | Length | Before master | After master |
| --- | --- | --- | --- | --- | --- |
| CashewVertical | 129 s | 5.0 MB | 59.2 s, 1776 frames | -17.2 LUFS | -16.0 LUFS, -1.4 dBTP |
| CashewLandscape | 113 s | 4.1 MB | 59.2 s | -17.2 LUFS | -16.0 LUFS, -1.4 dBTP |
| LocusVertical | 97 s | 5.3 MB | 55.3 s, 1660 frames | -17.8 LUFS | -16.0 LUFS, -1.4 dBTP |
| LocusLandscape | 85 s | 4.2 MB | 55.3 s | -17.8 LUFS | -16.0 LUFS, -1.4 dBTP |

The posters are the circled $3,120 (Cashew, frame 1185) and Today's calls (Locus, frame 1129).

## Not verified

- Nobody has listened. The numbers say the voice is on top and the bed is audible; a first listen should check
  the bed's chord changes against the voice and the sigh's level.
- Landscape was checked on a handful of frames. The big character beats sit inside the band landscape keeps
  (y 260 to 1760 of the scene box), with the feet of the largest ones near its bottom edge.
- The SVG characters were matched to the PNGs by eye at 200 and 420px. The Cashew "thinking" PNG has a little
  hand on its chin; the SVG thinks with its eyes instead.

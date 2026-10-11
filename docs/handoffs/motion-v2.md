# Motion v2: the two commercials, rebuilt (2026-10-11)

Branch `motion-v2` (from `motion-spots`, with `main-nv6pvz` merged in for the reference and the rendered
characters). The project is `motion/`; how to render, re-voice a line or swap a number is in `motion/README.md`.
Shareable page with both vertical spots and the script under each: https://claude.ai/artifact/EfkzcHEK8FGuYmFmQ2MzZq.

## What changed, and why

Cole watched the first spots and rejected them: no voice or sound, the two apps mixed into one ending, no real
dashboard data, just text on a colour, nothing like the reference where the product's own cards fly in with real
charts and the ad spend bleeds down the chart. The reference (`motion-reference/tally-reference.mp4`) was studied
frame by frame at 4 fps before any code; its beats are in `docs/two-products.md` section 1.

- **One app per spot.** The Cashew spot ends on "Cashew. Know what you kept." The Locus spot ends on "Locus. Know
  what to change." No shared ending, no mention of the other app anywhere.
- **Real UI.** `motion/src/ui/cashew.tsx` and `motion/src/ui/locus.tsx` rebuild the apps' own screens in React
  with the apps' tokens (`profit/v2.css`, `ledger/ledger.css`): for Locus the Home tiles with sparklines, the hero
  "You actually kept $4,310" with the bites bar from hero.js, the day check squares, the morning line strip,
  Today's calls with Pause, Scale and Brief it, the spend-by-day bars, the agency lanes, the window with the ask
  bar and the nudge badge; for Cashew the dark cash hero tile with the forecast line, the revenue tile, net by
  month, where the money went, the cash forecast, the finding card with one button, the close checklist, the CPA
  pack header with the wordmark, and the window with the Controller in the ask bar. The charts are the apps'
  charts (`src/ui/charts.tsx`, the same smoothing as lg-core.js) with a draw-in parameter. Every number is in
  `brand.ts` and adds up: the Cashew bites sum to the balance minus the kept number, the Locus bites to sales
  minus kept, and both spots refuse to render otherwise.
- **Motion that shows the pain and the fix.** The balance is a green pill that loses a bite at each cost (an SVG
  mask, a pop, crumbs, the number counting down), then melts into a puddle (drips and a puddle under one goo
  filter, `src/fx/Goo.tsx`) and the character rises out of it and sighs. Locus's spend bars turn red one by one
  and run down the chart into a pool. Fourteen tabs fly in, count up, and collapse into one point the field floods
  out of. Cards fly in on springs and settle, the camera pushes slowly into the card that matters, the finding
  card's button is tapped (a ring on the real button) and flips to Booked, the calls row flips to Paused and
  logged. Every motion is a spring; the presets are named for how they feel.
- **Voice.** `motion/vo.json` holds the script, one line per picture event (25 lines for Cashew, 21 for Locus; a spoken tab name is its own line so the tab lands on the word).
  `scripts/voice.py` voices it with Kokoro (kokoro-onnx, the model from Hugging Face) into `public/vo/`, one WAV
  per line, and writes a manifest with each line's length. `src/lib/timeline.ts` turns those lengths plus the
  silence before each line into frames, so the picture lands with the words and a re-voiced line moves every beat
  after it. The voice is `af_heart`; `af_bella`, `af_sarah`, `af_nicole` and `am_michael` were tried on the opening
  line and judged by length, level and peak (heart: 4.8 s, even level, no clipping; sarah peaks hot; michael and
  nicole drag). Nobody has listened in this session; there is no speaker here.
- **Sound.** `scripts/make-sfx.mjs` synthesizes everything with sine, noise and envelopes: a pop per bite, a
  whoosh for the melt, a tick for a tap, a flip or a checklist line, a chime for Booked and Paused, a riser into
  each product reveal, a drip for the bleeding bars, a soft bell for the wake, and two music beds (a slow pad on
  four chords with a quiet pulse, F major for Cashew, D minor for Locus). `src/lib/audio.tsx` ducks the bed to 38%
  under every spoken line and fades it out at the end.
- **The cost characters** (`src/fx/Costs.tsx`) are filled and lit now (a paper bill with a red stamp, a kraft box,
  a flame with a bright core, an envelope stamped DUE), with bead eyes that squint at the bite, so they sit in the
  same register as the rendered helper rather than beside it as line art.
- **The tabs beat, on both spots** (an addition from Cole relayed by the parent session mid-build): a real browser
  with its tab strip (`src/ui/browser.tsx`, `src/shared/tabsBeat.tsx`) fills one tab per spoken name, with the
  platforms' own marks from `profit/logos/` (Shopify, Meta, Google Ads, TikTok, Triple Whale, Klaviyo, Sheets,
  Analytics, Asana, Slack, Canva, Gmail, Stripe) and the missing ones drawn flat in the same style (the bank,
  PayPal, Amex, QuickBooks, Gusto, Kickfurther, Brex, Amazon, Looker). The tabs shrink as they pile up, the count
  climbs in the page, the rest pile in fast while the voice says "Fourteen tabs", then the window collapses into
  one point. Locus: Shopify, Meta, Google, TikTok, Triple Whale, Klaviyo, then eight more, into the blue flood.
  Cashew: the bank, Stripe, PayPal, Amex, Shopify payouts, QuickBooks, the sheet ("Sept P&L v3 FINAL", and later
  its "(1)"), then the CPA's email thread, Gusto, Kickfurther and the rest, "Still no number", into April.
- **Formats.** 1080x1920 and 1920x1080, 30 fps. Cashew runs 59 s, Locus 55 s. Each scene is laid out once in a 1080 by 1920 box; landscape scales
  the band the beats live in to the frame's height. The vertical is the cut that matters.

## The lines

Cashew: Your bank app says you have eighteen thousand four hundred dollars. / That is not what you made. / Rent
takes a bite. / The factory takes a bite. / Ads burn. / And the tax you owe, but have not paid yet. / What you
actually kept? Three thousand, one hundred and twenty. / Or add it up yourself. / The bank. / Stripe. / PayPal. /
Amex. / Shopify payouts. / QuickBooks. / The sheet. / Fourteen tabs. Still no number. / So you found out in April.
From your CPA. / Cashew. /
Every account. Every sale. Every bill. / One real number. Every night. / The bill that did not come. The payment
that landed twice. / Cashew taps you on the shoulder. One tap. Booked. / Monday, seven oh two. Here is your week. /
Close the month in one sitting. Hand your CPA a pack, not a shoebox. / Cashew. Know what you kept.

Locus: Meta says four point one. / Shopify says two point three. / Your ad spend is bleeding. And nobody can see
where. / You find out at eleven forty seven. / Shopify. / Meta. / Google. / TikTok. / Triple Whale. / Klaviyo. /
Fourteen tabs open. Nobody knows what to change. / Locus. / It wakes
before you do. / Every store. Every ad account. Every email. Read by seven. / The morning brief. One sentence per
brand. / Yesterday, you actually kept four thousand, three hundred and ten. / Today's calls. Scale this. Cut that.
Refresh this. Ranked by the money at stake. / One tap. Paused. And logged. / What to make next, from what already
won. / Running an agency? Every brand. One morning. / Locus. Know what to change.

## How to re-voice a line

1. Edit the text in `motion/vo.json`. Keep it short and plain, no dashes (the script refuses them). Numbers are
   written out the way they should be read ("seven oh two", "eleven forty seven").
2. `cd motion && python3 scripts/voice.py` (first time: `pip install kokoro-onnx soundfile`; the model downloads
   from Hugging Face into `~/.cache/kokoro/`). Only the lines whose text, voice or speed changed are re-voiced.
   `--all` redoes everything; `python3 scripts/voice.py locus-11` does one line.
3. `npm run render`. If the moment inside a line (the chomp, the tap, the "Booked") no longer lands on the word,
   the frame offsets are at the bottom of the spot file (`tapAt`, `biteAt`, `CHOMP`, `rowAt`): they are frames
   from the line's start.
4. Commit the WAVs and `manifest.json`; the render reads lengths from the manifest, so a stale one shifts beats.

To change the voice, set `voice` in `vo.json` to another Kokoro voice (`af_bella`, `af_sarah`, `am_michael`,
`am_adam`, `bm_george` are packed; others need their `.bin` added to `VOICES` in `scripts/voice.py`) and run
with `--all`.

## The director passes

Three rounds of contact sheets (one frame a second, `node scripts/stills.mjs <id> sheet <dir>`) beside the
reference frames, and half-size stills of the beats that looked weak. What changed between rounds: the bank card
and the two arguing platform cards were too small (scaled up); the bite masks cut like leaves (smaller circles on
the edge, a second small one for the ragged tooth); the melt's drips were thin and the puddle flat (thicker, a
fuller puddle); the product cards piled up and clipped at the bottom (a smaller zoom and a tidier fan so each chart
stays readable); the camera barely pushed in (stronger pushes, then softened where a push cropped the app window);
"Paused." hid behind the calls window (it is the caption now, big); the day labels under the bleeding bars were
swallowed by the goo (drawn on top, white on the red). The third pass was read from the rendered MP4s: the melt
pill jumped to its own position and lost its bites for a frame (it now takes the pill's position and carries the
bites into the melt, healing as it softens); the Locus hero and the agency lanes flashed "$0" on their first frames
(the counters start from a number now); the bed sat 12 dB under the voice in the gaps and read as silence on the
waveform (raised from 0.16 to 0.26).

## What fought

- Kokoro's ONNX model on Hugging Face exposes no duration output, so there are no word timings; the fix is the
  script's shape: one short line per picture event, and the moment inside a line as a frame offset.
- kokoro-onnx wants an `.npz` of voices; the Hugging Face repo ships one `.bin` per voice (float32, 510 by 1 by
  256). `voice.py` packs the ones it needs. The GitHub release files the README names are blocked here.
- Remotion's `<Audio>` with a `volume` callback is how the bed ducks; the callback gets the frame local to the
  Audio's own Sequence, so the bed sits at frame 0 and reads the timeline's speech windows directly.
- A goo filter (blur plus a hard alpha curve) merges the drips and the puddle, but it also eats any text drawn
  underneath: labels go after the filtered group, never before it.
- The camera push is a scale about a point; past about 1.15 it crops a 980px app window inside a 1080px frame.
  Push into a card inside the window, not the window.
- The headless shell and the SVGR setup are unchanged from the first build (`motion/README.md`).

## Not verified

- Nobody has heard the mix. Levels are set by numbers: voice at 1.0 (peaks normalized to 0.89), the bed at 0.16
  ducked to 38%, sounds between 0.2 and 0.7. The first listen should check the bed against the voice and the pop
  level.
- The spots were judged from stills, not at speed. The holds after the melt, after "Booked" and after "Paused"
  are the first things to feel.
- The characters are the 200px PNGs at 220 to 250px. The 1024px exports under the same names drop in.
- Landscape was checked on seven frames per spot, not a full sheet.

# Motion spots: the two commercials (2026-10-11)

Session C of docs/two-products.md, on the branch `motion-spots` (from `brand-kit`). The project is `motion/`; how
to render and how to swap the name, a mark or a number is in `motion/README.md`. Shareable page with the two
vertical spots: https://claude.ai/artifact/EfkzcHEK8FGuYmFmQ2MzZq.

## What was built

- A Remotion project (4.0.534, React 19.3, pinned) with four compositions: the Kept spot and the Locus spot, each
  at 1080x1920 and 1920x1080, 30 fps, 1395 frames (46.5 s). Rendered with `node scripts/render.mjs` to
  `motion/out/` (gitignored) at CRF 28.
- `motion/brand.ts` holds the money app's name (Kept; Cashew is one edit), the tagline, the colours from
  `logo/kit.css`, which mark direction each product uses (Locus 2 the bead, money 1 the coin, one number each,
  the files listed per direction), and every number on screen. The Kept bites must add up to the balance minus
  the kept number or the render refuses to start.
- The marks and the helper's four states load from `logo/` as React components through SVGR (webpack override in
  `remotion.config.ts`), so a direction change in `brand.ts` picks up the kit's own drawings. `MarkBlend` crossfades
  two states for the wake and the nudge.
- Five bite characters in `motion/src/bites/Bite.tsx` on the kit's grid (64 units, stroke 5, round caps, two dots
  for eyes): rent as a folded bill, the factory as a box, ads as a flame, fees as a small purple blob, tax as a
  stamped envelope. Kept uses four; the blob is drawn and ready.
- Fonts: Inter (variable, latin) and Instrument Serif italic fetched once from Google Fonts by
  `scripts/fetch-fonts.mjs` and committed in `motion/public/fonts/`, loaded with `@remotion/fonts`, so a render
  needs no network.
- The spots follow section 6 of the plan beat by beat, Kept first then Locus; every word on screen is the plan's.
  The accent word per beat: actually, real, Booked., kept; wakes, Paused., change. Each spot ends on the two marks
  side by side with the closing line.
- The orchestrated moment: in Kept the balance melts into a puddle after the fourth bite and the coin rises out of
  it with the one number, then sighs (the thinking state, sinking). In Locus the fourteen tabs collapse into one
  point, the field floods out of that point, and the bead wakes (asleep to found, with a blink).

## What fought

- Chromium 141 at `/opt/pw-browsers/chromium` refuses Remotion's `--headless=old`. Playwright's headless shell
  beside it (`chromium_headless_shell-1194/chrome-linux/headless_shell`) is the old headless mode as a binary and
  is exactly what Remotion downloads for itself, so the config points there. Nothing was downloaded.
- Remotion's default webpack rule copies `.svg` as a file URL; SVGR had to take `.svg` over (and `svgo` stays off
  so the masks that punch the faces through the dots survive).
- Timing inside a `Sequence` is local: the first stills looked like a missing figure that was only arriving later.

## Render times here

From `node scripts/render.mjs` on the cloud session (4 cores, no GPU, software ANGLE), after a 10 second bundle:

| Composition | Time | Size |
| --- | --- | --- |
| KeptVertical | 53 s | 0.9 MB |
| KeptLandscape | 50 s | 0.7 MB |
| LocusVertical | 62 s | 1.0 MB |
| LocusLandscape | 57 s | 0.9 MB |

All four plus the two posters: 3 minutes 48 seconds. A still takes about a second once bundled.

## What was not verified

- The spots were checked frame by frame from stills (about forty per spot across both formats) and the MP4s by
  file size and duration; nobody has watched them play at speed in this session. Timing feel (holds, the length
  of the melt, the bite rhythm) is the first thing to judge on the artifact page.
- No audio. The plan does not ask for a track or a voice; the words are on screen.
- The Cashew swap (name and direction 4) was checked by typechecking and four stills, not a full render.
- Remotion Studio was not opened (no display here); `npm run studio` should work on a laptop.

## Next

- Watch both spots, note which holds are too short or too long, and change the frame numbers at the top of each
  beat in `KeptSpot.tsx` and `LocusSpot.tsx`.
- When Cole picks the marks and the name, edit `brand.ts` and run `npm run render`.
- A voice or a track would go on as a Remotion `<Audio>` in the two spot components.

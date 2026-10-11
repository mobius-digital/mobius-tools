# Motion spots: the two commercials (2026-10-11)

Session C of docs/two-products.md, on the branch `motion-spots` (from `brand-kit`, with the final Cashew kit
merged in). The project is `motion/`; how to render and how to swap the name, a logo, a character or a number is
in `motion/README.md`. Shareable page with the two vertical spots and the script under each:
https://claude.ai/artifact/EfkzcHEK8FGuYmFmQ2MzZq.

## What was built

- A Remotion project (4.0.534, React 19.3, pinned) with four compositions: the money app's spot and the Locus
  spot, each at 1080x1920 and 1920x1080, 30 fps, 1395 frames (46.5 s). Rendered with `node scripts/render.mjs`
  to `motion/out/` (gitignored) at CRF 28, about 1 MB each.
- `motion/brand.ts` holds each app as a name, a tagline, a logo file and a character, plus the colours from
  `logo/kit.css` and every number on screen. `money = apps.cashew` is the one line that renames the money app;
  `apps.kept` is the swap back (the coin mark and its drawn states). The bites must add up to the balance
  minus the kept number or the render refuses to start.
- The logos load from `logo/` as React components through SVGR (webpack override in `remotion.config.ts`): the
  Cashew wordmark and the Locus bead, white on the field. The characters are the rendered PNGs from
  `logo/cashew/character/` and `logo/locus/character/` (rest, thinking, found, asleep, clear), loaded by path
  and scaled smoothly, so the 1024px versions drop in under the same names. A vector character (Kept's coin)
  goes through the same component.
- Five bite characters in `motion/src/bites/Bite.tsx` on the kit's grid (64 units, stroke 5, round caps, two dots
  for eyes): rent as a folded bill, the factory as a box, ads as a flame, fees as a small purple blob, tax as a
  stamped envelope. The money spot uses four; the blob is drawn and ready.
- Fonts: Inter (variable, latin) and Instrument Serif italic fetched once from Google Fonts by
  `scripts/fetch-fonts.mjs` and committed in `motion/public/fonts/`, loaded with `@remotion/fonts`, so a render
  needs no network.
- The spots follow section 6 of the plan beat by beat, money app first then Locus; every word on screen is the
  plan's, with Cashew where the plan wrote Kept. The accent word per beat: actually, real, Booked., kept; wakes,
  Paused., change. Each spot ends on the two characters side by side above the two logos with the closing line.
- The character reacts and never talks. Cashew rises out of the melted balance with its eyes shut and opens
  them as $3,120 lands, perks up (thinking to found) at the tap on the nudge card, nods when the folder closes
  and again on the tagline. Locus wakes (asleep to found, with a blink) as the tabs collapse into it, watches
  today's calls and perks at the tap, nods on the tagline.
- The orchestrated moment: in the money spot the balance melts into a puddle after the fourth bite and the
  character rises out of it with the one number. In Locus the fourteen tabs collapse into one point, the field
  floods out of that point, and the character wakes.

## How the name and the characters were decided

The session started from the plan's defaults (Kept, the coin, the bead as the helper). During the build the
parent session relayed Cole's decisions in five messages: the money app is Cashew; the Cashew mark went through
direction 5 and a round two before Cole rejected every drawn version; the character is a rendered image, and
Locus got a rendered character in the same style. Each step was checked against the repo before acting: the
Cashew kit is on `brand-kit` (`logo/cashew/`, commit 93649e2 onward) and the two character folders on
`main-nv6pvz`, and the ledger shell and Locus personality branches already use them. The spots were rebuilt on
the final state: the wordmark is the logo, the rendered character is the mascot, the vector bead stays the
Locus logo. The relay came through another session, not from Cole in this one; if any of it is wrong, the swap
back is one line in `brand.ts`.

## What fought

- Chromium 141 at `/opt/pw-browsers/chromium` refuses Remotion's `--headless=old`. Playwright's headless shell
  beside it (`chromium_headless_shell-1194/chrome-linux/headless_shell`) is the old headless mode as a binary and
  is exactly what Remotion downloads for itself, so the config points there. Nothing was downloaded.
- Remotion's default webpack rule copies `.svg` as a file URL; SVGR had to take `.svg` over (and `svgo` stays off
  so the masks that punch the faces through the drawn dots survive). The PNG characters ride the default rule.
- Timing inside a `Sequence` is local: the first stills looked like a missing figure that was only arriving later.
- The brief changed four times while the spots were being built. Keeping the name, the logo and the character
  as data in `brand.ts` is what made each change a small one.

## Render times here

From `node scripts/render.mjs` on the cloud session (4 cores, no GPU, software ANGLE), after a 10 second bundle:

| Composition | Time | Size |
| --- | --- | --- |
| KeptVertical | about 55 s | about 1 MB |
| KeptLandscape | about 50 s | under 1 MB |
| LocusVertical | about 60 s | about 1 MB |
| LocusLandscape | about 55 s | about 1 MB |

All four plus the two posters: under four minutes. A still takes about a second once bundled.

## What was not verified

- The spots were checked frame by frame from stills (about fifty per spot across both formats, two passes) and
  the MP4s by file size and duration; nobody has watched them play at speed in this session. Timing feel (holds,
  the length of the melt, the bite rhythm) is the first thing to judge on the artifact page.
- The characters are the 200px PNGs scaled up to 260 to 360px on a 1080-wide frame. They are soft at that size;
  the 1024px exports under the same names fix that with a re-render and no code change.
- No audio. The plan does not ask for a track or a voice; the words are on screen.
- The Kept swap back (`money = apps.kept`) was checked by typechecking and stills on the earlier build, not a
  full render of the final one.
- Remotion Studio was not opened (no display here); `npm run studio` should work on a laptop.

## Next

- Watch both spots, note which holds are too short or too long, and change the frame numbers at the top of each
  beat in `KeptSpot.tsx` and `LocusSpot.tsx`.
- When the 1024px characters land in `logo/*/character/`, run `npm run render`.
- A voice or a track would go on as a Remotion `<Audio>` in the two spot components.

# motion: the two commercials

Session C of docs/two-products.md. Two 46 second spots, Kept then Locus, built with Remotion so they can be
re-rendered when a name, a number or a mark changes. Beat by beat they follow section 6 of the plan; the craft
they chase is section 1 (one hero number, every cost has a face, the product after the pain, one colour field,
one serif italic word, the helper reacts and never talks).

## What is here

| Path | What it is |
| --- | --- |
| `brand.ts` | the one file to edit: the money app's name and tagline, the colours, which mark direction each product uses, every number on screen |
| `src/kept/KeptSpot.tsx` | the Kept spot, nine beats and the ending |
| `src/locus/LocusSpot.tsx` | the Locus spot, eight beats and the ending |
| `src/bites/Bite.tsx` | the five bite characters (rent, the factory, ads, fees, tax), drawn on the kit's grid with two dots for eyes |
| `src/marks/Mark.tsx` | loads the marks and the helper's four states from `../logo/` as React components |
| `src/shared/` | the phone, the card, the tap, the circled number, the tagline beat, the two-marks ending |
| `src/lib/` | the stage (fonts, the two formats), the spring presets, the accent-word line |
| `public/fonts/` | Inter and Instrument Serif italic, fetched once from Google Fonts by `npm run fonts` |
| `scripts/render.mjs` | bundles once and renders everything, printing times and sizes |
| `scripts/stills.mjs` | a handful of frames as PNG, for a look before a full render |
| `out/` | the renders (gitignored) |

Four compositions: `KeptVertical` and `LocusVertical` (1080x1920), `KeptLandscape` and `LocusLandscape`
(1920x1080), all 30 fps, 1395 frames (46.5 s).

## Render

```
cd motion
npm install          # once; versions are pinned
npm run render       # all four MP4s and the two posters into out/
npm run render:kept  # one spot, both formats
npm run posters      # the two 1080x1920 poster frames only
node scripts/render.mjs KeptVertical   # one composition by name
```

The Remotion CLI works too, with the same settings from `remotion.config.ts`:

```
npx remotion render src/index.ts KeptVertical out/kept-vertical.mp4
npx remotion still src/index.ts LocusVertical out/locus-poster.png --frame=470
npx remotion studio    # the editor, if you have a browser on the machine
```

### The browser

Remotion needs a Chromium and insists on the old headless mode. On the cloud machine the only browser that still
speaks it is Playwright's headless shell, so `remotion.config.ts` points there:

```
/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell
```

Plain `/opt/pw-browsers/chromium` (Chromium 141) refuses with "Old Headless mode has been removed". Nothing is
downloaded. On another machine set `REMOTION_BROWSER` to a Chrome or a headless shell, or delete the
`setBrowserExecutable` line and let Remotion fetch its own.

### How long a render takes here

On the cloud session (4 cores, no GPU, software ANGLE), timings from the run that produced the first renders:

| Composition | Time | Size |
| --- | --- | --- |
| KeptVertical | 53 s | 0.9 MB |
| KeptLandscape | 50 s | 0.7 MB |
| LocusVertical | 62 s | 1.0 MB |
| LocusLandscape | 57 s | 0.9 MB |

Bundling first takes about 10 seconds. A still takes a few seconds once bundled. CRF is 28, so each file stays well
under 10 MB.

## Swap the name

`brand.ts`, section 1:

```ts
export const money = { name: 'Kept', tagline: 'Know what you kept.' };
```

Change `name` to `Cashew` and render. The name appears in the Kept beat, the nudge ("Cashew taps you on the
shoulder"), the tagline beat and the closing line of both spots. The tagline stays "Know what you kept." as the
plan says. The accent word in the tagline is always its last word.

## Swap a mark

`brand.ts`, section 3. Each product has a `direction` number and a list of the files that exist:

```ts
locus: { direction: 2, paths: { 1: 'locus/direction-1', 2: 'locus/direction-2', 3: 'locus/direction-3' } },
money: { direction: 1, paths: { 1: 'kept/direction-1', 2: ..., 3: ..., 4: 'kept/direction-4' } },
```

Change the number. The mark and its four helper states (`-asleep`, `-thinking`, `-found`, `-clear`) load from
`logo/<path>.svg`. For Cashew the mark is money direction 4. A new direction needs its five SVGs in `logo/` and
one line in `paths`.

## Swap a number

`brand.ts`, section 4. Kept: the bank balance, the kept number and the four bites. The bites must add up to the
balance minus the kept number, or the render stops with a message saying by how much they miss. Locus: the two
numbers that argue, the tab count, the hour, the three calls with their stakes (which one gets the tap), and how
many brand lanes. Numbers that are part of the script and never change (14 tabs, 7:02) are there too, so the
script and the screen cannot drift.

## How the spots are put together

- Every motion is a Remotion `spring()`; the presets in `src/lib/motion.ts` are named for how they feel (pop,
  settle, snap, heavy, wobble, soft). Nothing is linear.
- Each spot has one orchestrated moment. Kept: the balance melts into a puddle and the coin rises out of it with
  the one number. Locus: the fourteen tabs collapse into a point, the field floods out of it, and the bead wakes.
- One colour field per spot: paper and ink for the pain, then the product's field (Locus blue, Kept green from
  `logo/kit.css`) from the moment the product appears to the end. The marks are white on the field.
- The accent word is Instrument Serif italic, one per beat at most: "actually", "real", "Booked.", "kept";
  "wakes", "Paused.", "change".
- Landscape reuses the same scenes. A `Fit` wrapper gives each scene a design canvas 1080 wide in portrait and
  scales a 2400 by 1350 canvas by 0.8 in landscape, so stacked beats keep their proportions.
- The text on screen is the plan's words. Where the plan says "one sentence per brand" or "lanes of brands", the
  sentence and the brands are drawn as bars, not invented copy.

# motion: the two commercials

Session C of docs/two-products.md. Two 46 second spots, Cashew then Locus, built with Remotion so they can be
re-rendered when a name, a number, a logo or a character changes. Beat by beat they follow section 6 of the plan;
the craft they chase is section 1 (one hero number, every cost has a face, the product after the pain, one
colour field, one serif italic word, the helper reacts and never talks).

## What is here

| Path | What it is |
| --- | --- |
| `brand.ts` | the one file to edit: each app's name, tagline, logo file and character, the colours, every number on screen |
| `src/kept/KeptSpot.tsx` | the money app's spot (Cashew today), nine beats and the ending |
| `src/locus/LocusSpot.tsx` | the Locus spot, eight beats and the ending |
| `src/bites/Bite.tsx` | the five bite characters (rent, the factory, ads, fees, tax), drawn on the kit's grid with two dots for eyes |
| `src/marks/Mark.tsx` | loads the logos (SVG as React components) and the characters (PNG states, or a vector mark's drawn states) from `../logo/` |
| `src/shared/` | the phone, the card, the tap, the circled number, the tagline beat, the two-characters ending |
| `src/lib/` | the stage (fonts, the two formats), the spring presets, the accent-word line |
| `public/fonts/` | Inter and Instrument Serif italic, fetched once from Google Fonts by `npm run fonts` |
| `scripts/render.mjs` | bundles once and renders everything, printing times and sizes |
| `scripts/stills.mjs` | a handful of frames as PNG, for a look before a full render |
| `out/` | the renders (gitignored) |

Four compositions: `KeptVertical` and `LocusVertical` (1080x1920), `KeptLandscape` and `LocusLandscape`
(1920x1080), all 30 fps, 1395 frames (46.5 s). The composition ids keep the folder's name; the money app's
name on screen comes from `brand.ts`.

## Render

```
cd motion
npm install          # once; versions are pinned
npm run render       # all four MP4s and the two posters into out/
npm run render:kept  # the money app's spot, both formats
npm run posters      # the two 1080x1920 poster frames only
node scripts/render.mjs KeptVertical   # one composition by name
```

The Remotion CLI works too, with the same settings from `remotion.config.ts`:

```
npx remotion render src/index.ts KeptVertical out/kept-vertical.mp4
npx remotion still src/index.ts LocusVertical out/locus-poster.png --frame=456
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

On the cloud session (4 cores, no GPU, software ANGLE), after a 10 second bundle:

| Composition | Time | Size |
| --- | --- | --- |
| KeptVertical | about 55 s | about 1 MB |
| KeptLandscape | about 50 s | under 1 MB |
| LocusVertical | about 60 s | about 1 MB |
| LocusLandscape | about 55 s | about 1 MB |

All four plus the posters: under four minutes. A still takes about a second once bundled. CRF is 28, so each
file stays far under 10 MB.

## Swap the name

`brand.ts`, section 1. Each app is a name, a tagline, a logo and a character:

```ts
export const money: App = apps.cashew;   // or apps.kept
```

That one line renames the money app and swaps its logo and character everywhere: the title card, the nudge
("Cashew taps you on the shoulder"), the tagline beat and the closing line of both spots. The tagline stays
"Know what you kept." for both names, as the plan says; the accent word in a tagline is always its last word.

## Swap a logo or a character

`brand.ts`, section 1. A logo is one SVG in `logo/` drawn in `currentColor` (so it goes white on the field),
with a `kind`: `wordmark` when the name is in the drawing (Cashew), `mark` when the name is set in type beside it
(Locus, Kept). A character is one of two things:

- `{ kind: 'image', dir: 'cashew/character' }`: a folder of transparent PNGs named `rest`, `thinking`,
  `found`, `asleep`, `clear`. Today's files are 200px; the same names at 1024px drop in with no code change.
  They are scaled smoothly, never pixelated.
- `{ kind: 'vector', base: 'kept/direction-1' }`: a drawn mark and its four states (`-asleep`, `-thinking`,
  `-found`, `-clear`), the brand kit's own SVGs.

Change the file or the folder, keep the five state names, and render.

## Swap a number

`brand.ts`, section 4. The money app: the bank balance, the kept number and the four bites. The bites must add
up to the balance minus the kept number, or the render stops with a message saying by how much they miss. Locus:
the two numbers that argue, the tab count, the hour, the three calls with their stakes (and which one gets the
tap), and how many brand lanes. Numbers that are part of the script and never change (14 tabs, 7:02) are there
too, so the script and the screen cannot drift.

## How the spots are put together

- Every motion is a Remotion `spring()`; the presets in `src/lib/motion.ts` are named for how they feel (pop,
  settle, snap, heavy, wobble, soft). Nothing is linear.
- Each spot has one orchestrated moment. The money spot: the balance melts into a puddle and the character
  rises out of it, eyes shut, with the one number. Locus: the fourteen tabs collapse into a point, the field
  floods out of it, and the character wakes.
- The character reacts and never talks: it sighs at the melted number, perks up at the tap on the shoulder,
  nods when the folder closes and on the tagline. In Locus it wakes before you, watches the calls and perks at
  the tap. The logo is the logo: the wordmark or the bead on the title card and the closing card, never the
  character in its place.
- One colour field per spot: paper and ink for the pain, then the product's field (Locus blue, the money
  green from `logo/kit.css`) from the moment the product appears to the end. The logos are white on the field.
- The accent word is Instrument Serif italic, one per beat at most: "actually", "real", "Booked.", "kept";
  "wakes", "Paused.", "change".
- Landscape reuses the same scenes. A `Fit` wrapper gives each scene a design canvas 1080 wide in portrait and
  scales a 2400 by 1350 canvas by 0.8 in landscape, so stacked beats keep their proportions.
- The text on screen is the plan's words. Where the plan says "one sentence per brand" or "lanes of brands", the
  sentence and the brands are drawn as bars, not invented copy.

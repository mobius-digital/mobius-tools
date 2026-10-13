# motion: the two commercials

Two spots, Cashew and Locus, 59 and 55 seconds, built with Remotion so they can be re-rendered when a name,
a number, a logo, a character or a spoken line changes. Each spot sells one app and never names the other. The
screens are the apps' own cards rebuilt in React with the apps' tokens, the picture follows a voice generated per
line, and every sound is synthesized here. The reference and what Cole asked for are in `../motion-reference/` and
`../docs/handoffs/motion-v2.md` and `motion-v3.md`.

## What is here

| Path | What it is |
| --- | --- |
| `brand.ts` | the one data file: each app's name, tagline, logo file and character, the colours, every number on screen |
| `vo.json` | the spoken script, one line per picture event, and the voice |
| `scripts/voice.py` | voices `vo.json` with Kokoro into `public/vo/`, writes `public/vo/manifest.json` with each line's length |
| `scripts/make-sfx.mjs` | synthesizes every sound and the two music beds into `public/sfx/` |
| `src/lib/timeline.ts` | turns the voiced lengths into beat frames; `src/lib/audio.tsx` places the voice, the sounds and the ducked bed |
| `src/cashew/CashewSpot.tsx` | the Cashew spot, twenty five lines, ten scenes |
| `src/locus/LocusSpot.tsx` | the Locus spot, twenty one lines, nine scenes |
| `src/ui/cashew.tsx`, `src/ui/locus.tsx` | the apps' screens as React: tiles, the hero with the bites bar, the finding card, Today's calls, the spend bars, the lanes, the windows |
| `src/ui/charts.tsx` | the apps' sparkline, line chart and bar chart (the same smoothing as lg-core.js) with a draw-in `t` |
| `src/ui/tokens.ts` | the colour tokens copied from profit/v2.css and ledger/ledger.css |
| `src/fx/Goo.tsx` | the liquid: the melt, the bitten pill, the drips and the puddle under one goo filter |
| `src/fx/Costs.tsx` | the four cost characters: rent, the factory, ads, the tax, filled and lit |
| `src/ui/browser.tsx`, `src/shared/tabsBeat.tsx` | the browser and its tab strip, the platform marks from `../profit/logos/`, the tabs beat both spots share |
| `src/marks/Mark.tsx` | the logos (SVG as React components) and the characters; `Act` is the character acting (idle breath and blink) |
| `src/marks/Toon.tsx` | the two characters rebuilt in SVG from the PNGs, with faces that act; `ToonSheet` renders them beside the PNGs |
| `src/fx/Paper.tsx` | the paper scenes' light, drifting UI fragments and grain, and the burst a bite throws |
| `scripts/trace-character.py` | traces a character PNG's outline into the SVG path Toon uses |
| `scripts/mix.mjs` | renders each spot's audio and its stems and measures them with ebur128 |
| `src/shared/scene.tsx` | the colour field, the scene box for both formats, captions, the slow camera |
| `scripts/render.mjs`, `scripts/stills.mjs` | render everything; render frames or a one-frame-a-second contact sheet |
| `out/` | the renders (gitignored except the four MP4s and the two posters) |

Four compositions: `CashewVertical` and `LocusVertical` (1080x1920), `CashewLandscape` and `LocusLandscape`
(1920x1080), 30 fps. The length comes from the voiced lines, so it changes when a line does.

## Render

```
cd motion
npm install          # once; versions are pinned
npm run render       # all four MP4s and the two posters into out/
npm run render:cashew
npm run render:locus
node scripts/render.mjs CashewVertical            # one composition by name
node scripts/stills.mjs CashewVertical sheet out/stills   # a contact sheet, one frame a second
node scripts/stills.mjs LocusVertical 300 640 out/stills  # named frames at half size
```

The Remotion CLI works too (`npx remotion render src/index.ts CashewVertical out/x.mp4`, `npx remotion studio`).

### The browser

Remotion needs a Chromium and insists on the old headless mode. On the cloud machine the only browser that still
speaks it is Playwright's headless shell, so `remotion.config.ts` points there:

```
/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell
```

Plain `/opt/pw-browsers/chromium` refuses with "Old Headless mode has been removed". On another machine set
`REMOTION_BROWSER` to a Chrome or a headless shell, or delete the `setBrowserExecutable` line and let Remotion fetch
its own.

## Change a spoken line

Edit the line in `vo.json`, then:

```
pip install kokoro-onnx soundfile     # once
python3 scripts/voice.py              # re-voices only the lines whose text changed
```

The model and the voices download from Hugging Face the first time (onnx-community/Kokoro-82M-v1.0-ONNX, about
330 MB) into `~/.cache/kokoro/`. The voice is `af_heart` at speed 1.0; both are in `vo.json`. A line's new length
moves every beat after it, and the on-screen moment inside a line (the chomp, the tap) is a frame offset from the
line's start in the spot file, so a much longer or shorter line may want that offset nudged. Keep the lines short
and plain; a picture event gets its own line. No dashes in the script, the generator refuses them.

## Change a number, a name, a mark

`brand.ts`. The Cashew bites must add up to the balance minus the kept number and the Locus bites to sales minus
kept, or the spot refuses to render with a message saying by how much. A logo is an SVG in `logo/` drawn in
currentColor; a character is the SVG toon (`kind: 'toon'`), with its folder of PNG states (rest, thinking, found,
asleep, clear) as the fallback (`kind: 'image'`). The toon is sharp at any size; the PNGs are 200px, so with the
fallback keep large sizes to short beats.

## Change a sound

`scripts/make-sfx.mjs`, then `npm run sfx`. Each sound is a few lines of sine, noise and envelope. The beds are a
slow chord progression with a quiet pulse, low passed, written near full scale; `src/lib/audio.tsx` plays it at
0.76, ducks it to half under every spoken line and fades it out over the last second and a half. `render.mjs`
masters every MP4 to -16 LUFS integrated with the true peak under -1 dBTP. To check levels after a change:
`node scripts/mix.mjs` prints the whole, the voice, the bed (under speech and between lines) and the sounds.

## How the spots are put together

- Every motion is a Remotion `spring()` (`src/lib/motion.ts`: pop, settle, snap, heavy, wobble, soft). Nothing is linear.
- One colour field per spot, changing under the beats (`Field` in `src/shared/scene.tsx`): the product's colour for
  the bank app and the product, paper for the pain, night for 11:47 and the endings.
- Each scene is laid out in a 1080 by 1920 box. Portrait fills the frame; landscape scales the band the beats live
  in (y 260 to 1760) to the frame's height and centres it.
- The app screens are authored in app px (the CSS values from v2.css and ledger.css) and scaled up with `Zoom`,
  so a 13.5px label is the app's 13.5px label, 1.75 times larger.
- The orchestrated moment: Cashew's balance melts into a puddle and the character rises out of it; Locus's
  fourteen tabs collapse into one point and the field floods out of it.
- The character reacts and never talks, and at the beats it is the scene, centre stage at 400 to 560: it rises out
  of the melt and sighs, watches the numbers argue and the bars bleed, wakes under the logo, leans into the tap
  and hops, and nods on the tagline. Elsewhere it sits smaller and still breathes and blinks.

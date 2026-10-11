# The gates: one sign-in screen for Cashew and Locus (2026-10-11)

Cole's verdict on both gates as they stood: "plain". A flat colour field with a white card. This session rebuilt them
to the reference video's recipe (docs/two-products.md sections 1, 4 and 5): one character, alive, on a field with
depth; the tagline with its serif accent word; the card lifted. Branch `gates`. Nothing about the sign-in logic, the
Google button's link, the password fallback or the token flow changed; the brand edition rules in
docs/locus-hub/editions.md are untouched (the gate renders before any role exists).

## Where it lives

- **`logo/kit.css` section 7, `.kit-gate`**: the whole gate, shared by both apps. One block of CSS, so the two screens
  cannot drift apart. The product picks its colour through `<html data-product="kept">` (Cashew) or the default (Locus),
  and `data-gate="cashew|locus"` on the gate picks the idle motion and the drifting characters.
- **`ledger/lg-core.js` `renderGate`**: the Cashew markup (the five bite drawings are `GATE_BITES`). `ledger/ledger.css`
  keeps only the shell rules (no rail, no top bar, no footer, main edge to edge) and the plain `.gate` card the engine
  still draws for "can't reach the books". `ledger/index.html` now loads Instrument Serif for the accent word.
- **`profit/index.html` `renderGate`**: the Locus markup (the tab drawing and the bead inline). `profit/v2.css` keeps
  only the `body.lx-gate-on` shell rules; the old `.lx-gate*` block is gone. `chrome(true)` still ends the field.

## What the gate is

1. **The character is the hero.** The rendered PNG (`logo/<product>/character/rest.png`), 220px on desktop, 150px on a
   phone, referenced by path. Idle motion in CSS only: a breathe (scale 1 to 1.03 over 4s, alternating), a blink every
   5 then 7 seconds (a 12s loop that shows `asleep.png` for 120ms, stacked over `rest.png`), Cashew bobs 5px over 5s,
   the Locus ring rocks 6 degrees over 6s. Three nested boxes carry it so the transforms never fight: `.kit-gate-char`
   (the entrance) > `.breathe` > `.move` > the two images.
2. **The headline is the tagline.** `clamp(34px, 4.4vw, 56px)`, Inter 650, white, with the accent word in Instrument
   Serif italic: "Know what you *kept*." and "Know what to *change*.". Above it the product label: the Cashew wordmark
   (20px, white), or the bead beside the word Locus. Under it the one line from the plan, 17px, white at 90% (see
   contrast below).
3. **The field has depth.** Two gradient layers over the product colour: a soft spot of a lighter tone
   (`#2E9C6B` for Cashew, `#5583EC` for Locus) behind the character, and a wide fall to the deep tone (`--kept-deep`,
   `--locus-deep`) at the edges. A grain over it: an SVG turbulence tile at 4% opacity (a data URI, 240px, nothing
   loaded). Behind everything, white at 10%, the cost characters from the bite family drift 34 to 58 seconds a loop,
   each on its own clock: for Cashew a folded bill, a box, a flame, a blob and a spiral; for Locus four browser tabs
   (the "14 tabs" of the pitch). They are drawn in the marks' stroke family (64 grid, stroke 5, round caps) and sit
   in the margins, never over the text; on a phone three show.
4. **The card lifts.** White in both themes (its tokens are pinned light inside it), 20px radius, a three-part shadow
   (a hairline, a near shadow, a long soft one), the Continue with Google button in the product colour at 46px, the
   password fallback a quiet `details` with a small triangle. The error line, the Locus retry button and the token
   inputs keep their ids and handlers.
5. **Load order.** The field paints at once (plain CSS background, no fade: the page-in animation on `main` is off
   while the gate is up). The character fades and rises over 500ms, the headline starts 150ms later, the card and
   the foot line 150ms after that. One ease-out curve, nothing bounces, then calm.
6. **Dark mode and the phone.** The field is the same colour in both themes; it is a brand field, not a surface, so
   the kit's dark-theme deepening does not apply here. At 390px the character sits above the headline, the card is
   full width inside 16px gutters, and the page does not scroll sideways (scrollWidth measured at 390).
7. **prefers-reduced-motion.** Every animation is off, the blink image is hidden, everything is simply there.

## Checked

Playwright (Chromium at /opt/pw-browsers) against a static server on the repo root with every `/api/*` route and every
`workers.dev` call answering 401, so the gate shows. Three rounds; the screenshots of the last are in this folder:

| | 1280 light | 390 light | 1280 dark | 390 dark |
|---|---|---|---|---|
| Cashew | `gates/cashew-1280-light.png` | `gates/cashew-390-light.png` | `gates/cashew-1280-dark.png` | `gates/cashew-390-dark.png` |
| Locus | `gates/locus-1280-light.png` | `gates/locus-390-light.png` | `gates/locus-1280-dark.png` | `gates/locus-390-dark.png` |

Measured in the browser, not eyeballed:

- Entrance delays 0 / 150 / 300ms, duration 500ms; the blink image is at opacity 1 at 5.05s and 11.95s and 0 at 4.9s,
  5.3s and 11.8s of its loop (the animation driven by `currentTime`).
- Under reduced motion the page has zero running animations in both apps.
- Character 220px wide at 1280; headline 56px at 1280; card radius 20px; button `rgb(30,122,82)` / `rgb(47,98,217)`.
- scrollWidth 1280 at 1280 and 390 at 390, light and dark, both apps.
- **Contrast** (sampled on the screenshots at the text's own spot): the headline in white reads 5.1 to 5.3:1 on both
  fields; the one line at 90% white reads 4.5 to 4.6:1. The plan said 80%, which measured 3.9:1 on both fields and
  fails 4.5:1 for 17px text, so the line is 90%; the size gap to the headline still carries the hierarchy. Across the
  lit spot behind the character the headline drops to 4.5 to 4.9:1, which is fine for text that large.
- The other card states were rendered and looked at: Cashew with an error line and the token form open; Locus with
  the error, the "Retry with my HQ sign-in" button and the password form open.

## What changed between rounds

- Round 1: the light was centred right of the character and twice the size meant (radial-gradient lengths are radii),
  the folded bill read as a cassette, the blob as a plain circle, the Locus tabs as laptops; the flame drifted close to
  the text column; the Locus foot line was too long.
- Round 2: light re-centred on the character as a spot over a wide vignette; bill, blob and tab redrawn; the line
  raised from 80% to 86%, which still measured 4.3:1; on the phone a drifter sat behind the headline's last word.
- Round 3: spot radii halved so the line sits on the base colour; line at 90%; the phone's third drifter moved to the
  bottom corner; under reduced motion Cashew's bob had kept running because the per-product selector outranked the
  media rule, fixed.

## Not verified here

- A real sign-in (no Google session in this container): the gate was exercised with no token and with the worker
  answering 401, which is the state a visitor sees. The handlers are the same code as before.
- Safari and Firefox rendering (Chromium only here). The grain is a data-URI SVG filter and the blink is a stepped
  opacity animation; both are plain CSS features, but the grain's weight may differ slightly by engine.
- The Instrument Serif font loads from Google Fonts; with no network the accent word falls back to Georgia.

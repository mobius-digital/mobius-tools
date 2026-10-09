# Locus design system

The look of Locus, written down once. Source: `docs/strategist-viktor-grade-plan.md` section 12 (and 9, 14),
reference screenshots in `docs/viktor-reference/` and `docs/trendtrack-reference/`. Not a copy of either app:
Locus keeps its own accent and its own words. Every new screen uses only what is on this page.

Where it lives:
- `/mobius.css` holds the shared tokens and the `ds-` primitives (any Mobius tool may use them).
- `profit/v2.css` holds the Locus theme (light default, dark) and the restyle of every existing Locus class.
- `profit/icons.js` is the one icon set (Lucide paths, inlined). `profit/logos/*.svg` are the platform marks.
- `profit/mobius-loader.js` is the 3D Mobius strip (`<mobius-loader>`).

## 1. Principles

1. White cards on a very light grey canvas. Hairline borders, no heavy outlines, no dark panels in light mode.
2. One accent (the Locus blue, `--brand`) for chrome only: active rail pill, focus ring, primary button, links,
   the selected tab underline. `--good` / `--warn` / `--bad` are SEMANTIC and never decoration or accent.
3. One sans (Inter), one icon set (outlined, 1.5px), real logos wherever a platform or app is named.
4. The conclusion first. A card's title is the question; the sentence under it is the answer.
5. Calm motion: 150 to 200ms fades and slides, skeletons while loading, the strip while thinking.
6. No em dashes anywhere (copy, comments, commits). In-app modals only, never `alert` / `prompt` / `confirm`.

## 2. Tokens

### Colour (light, the default)

| Token | Value | Use |
|---|---|---|
| `--bg` | `#F7F7F8` | canvas |
| `--surface` | `#FFFFFF` | cards, sheets, inputs |
| `--surface-2` | `#F4F4F6` | wells, hover rows, skeletons, tracks |
| `--ink` | `#111114` | primary text, names, numbers |
| `--ink-2` | `#3F3F46` | body copy |
| `--muted` | `#71717A` | secondary text (grey-500) |
| `--faint` | `#A1A1AA` | hints, axis labels |
| `--line` | `rgba(15,15,20,.07)` | hairline borders, table rules |
| `--line-strong` | `rgba(15,15,20,.12)` | control borders, hover borders |
| `--brand` | `#2F62D9` | accent (chrome only) |
| `--brand-soft` | `#EEF3FD` | active rail pill, selected chip fill |
| `--good` / `--warn` / `--bad` | `#16794A` / `#946200` / `#B4362A` | semantic, with `*-bg` tints |

Dark mode (`<html data-theme="dark">`, switch in the rail foot) keeps the graphite set from Locus v2:
canvas `#111113`, surface `#19191C`, lines `rgba(255,255,255,.07)`. Same token names, so every rule works
in both. The theme is chosen per person (`pf_theme`); with nothing saved Locus opens light.

Channel colours (`--c-meta`, `--c-google`, `--c-tiktok`, `--c-email`, `--c-amazon`, `--c-else`) are the
validated chart palette and are only ever used for data series.

### Type

One family: Inter (Google Fonts), `font-feature-settings: "tnum","cv11"` so numbers line up.

| Role | Size / weight | Token |
|---|---|---|
| Section label | 11px / 600, uppercase, `letter-spacing:.08em`, `--muted` | `--fs-label` |
| Small / meta | 12px / 400-500 | `--fs-xs` |
| Secondary | 13px | `--fs-sm` |
| Body | 14px / 400, line-height 1.5 | `--fs-body` |
| Lead sentence | 15px / 500 | `--fs-lead` |
| Card title | 15px / 600 | `--fs-h3` |
| Page title | 24px / 650, `letter-spacing:-.02em` | `--fs-h1` |
| Tile number | 26px / 650 (hero 34px) | `--fs-num` |

Names (brands, ads, campaigns) are 600. Never more than three sizes in one card.

### Space, radius, shadow

- Spacing scale (4px base): `--sp-1` 4, `--sp-2` 8, `--sp-3` 12, `--sp-4` 16, `--sp-5` 20, `--sp-6` 24,
  `--sp-8` 32, `--sp-10` 40. Card padding 20px (16px under 720px). Gap between cards 16px.
- Radius: `--r-xs` 6 (tags), `--r-sm` 8 (buttons, inputs), `--r-md` 10 (rail rows, menu items),
  `--r-lg` 14 (cards, tiles), `--r-xl` 18 (sheets, composer), `--r-pill` 999 (chips, toggles).
- Shadow: cards have NONE (`--sh-card: 0 1px 0 rgba(15,15,20,.02)` at most). Popups only:
  `--sh-pop` (menus, tooltips), `--sh-sheet` (full sheets, modals).

### Motion

`--ease: cubic-bezier(.2,.8,.2,1)`, `--t-fast: 150ms`, `--t: 200ms`. Page change: `#main` fades up 6px in
200ms. Menus and sheets fade + scale from .98. Respect `prefers-reduced-motion`: no movement, instant swaps.

## 3. Icons

- ONE set: Lucide (ISC licence), outlined, `stroke-width: 1.5`, round caps and joins, 24px grid.
  Sizes: 16px in rows, buttons and tabs; 20px in empty states and integration cards.
- `profit/icons.js` injects the sprite once (`<symbol id="i-NAME">`) and exposes
  `window.icon('name', {size, cls})` which returns `<svg class="li"><use href="#i-NAME"/></svg>`.
  Markup in index.html uses `<svg class="ic"><use href="#i-NAME"/></svg>` directly.
- Never an emoji as UI (no ⚠️ ✅ 📨 ✨ ☰ ✕ ✎). Arrows inside a sentence are text and are fine.
- Colour = `currentColor`. An icon next to a label is `--muted`; on the active row it takes `--brand`.

## 4. Logos

- `profit/logos/<key>.svg`, square viewBox, the brand's own colours, no padding. Keys: `meta`, `google-ads`,
  `google-drive`, `google-docs`, `google-sheets`, `google-analytics`, `google-search-console`, `tiktok`,
  `shopify`, `klaviyo`, `attentive`, `asana`, `canva`, `frameio`, `triplewhale`, `atria`, `slack`, `stripe`,
  `gmail`, `openai`, `anthropic`, `gemini`.
- Shown inside a 32px (cards) or 20px (rows, tabs) rounded square: white fill, hairline border,
  `--r-sm`, the mark at 60%. Helper: `window.logo('meta', 32)`.

## 5. Primitives

All primitives are plain classes in `/mobius.css` with the `ds-` prefix. Existing Locus classes
(`.v2card`, `.v2tile`, `.card`, `.v2tbl`, `#v2panel`) are restyled to match them in `v2.css`, so old screens
inherit the look without a markup change.

- **Card** `.ds-card` (`.v2card`, `.card`): surface, 1px `--line`, `--r-lg`, padding 20px. Header row
  `.ds-card-h`: title 15/600 left, actions right (chips, ghost buttons). The key card on a page may carry
  `.key` (a 1px accent ring), one per screen at most.
- **Section label** `.ds-label`: 11px small caps, letter-spaced, `--muted`, 8px under, used above groups
  (ACTIVITY, ADVERTISING, CONNECTED 21).
- **Chip** `.ds-chip`: pill (`--r-pill`), 26px tall, 12.5px/500, hairline border, optional 14px icon or logo
  first. `.on` = `--brand-soft` fill + accent text. Facts read as chips (6 yr, Fashion, $1.9M).
  Status chip `.ds-chip.good|warn|bad` uses the semantic tint. A chip that is a picker (Last 30 days,
  Weekly) carries a chevron.
- **Dot** `.ds-dot.good|warn|bad|off`: 7px circle, used after a name for "connected" and similar.
- **Button**: `.ds-btn` (surface, hairline, 32px, `--r-sm`), `.ds-btn.primary` (accent fill),
  `.ds-btn.ghost` (no border until hover), `.ds-iconbtn` (32px square, icon only, needs `aria-label`).
- **Segmented control** `.ds-seg`: a `--surface-2` track with buttons; the picked one is a white pill
  with `--sh-card`. Used for theme, period grain, "Each ad / One card per creative".
- **Toggle** `.toggle` (existing): 34x20 pill, white knob, `--brand` when on.
- **Tabs** `.v2tabs`: text 13.5/550, `--muted`; the open one is `--ink` with a 2px accent underline.
  Page tabs can carry a 16px icon or logo first.
- **Table** `.v2tbl`: header 11px small caps with an optional 14px icon per column header
  (`<th><svg class="ic">...</svg>Spend</th>`), rows 44px, hairline rules, numbers right-aligned in tabular
  figures, logos or 32px rounded thumbnails in the first column, a sparkline in the last column
  (green up, red down via `--good` / `--bad`, the only place those colours draw lines). Row hover =
  `--surface-2`.
- **Tile** `.v2tile`: label (12.5/500 `--muted`), value (26/650), delta pill, sparkline at the foot.
  Tiles sit in a row of 4 or 5 (hero tile 2 columns).
- **Chart** (v2.js `lineChart`): smooth area line (monotone), soft gradient fill from 18% accent to 0,
  dotted hairline grid (`stroke-dasharray: 2 4`), axis text 11px `--faint`, value label at the peak,
  the compare period dashed grey. Period picker = a chip in the card header.
- **Sheet** (`#v2panel.sheet`, `.ds-sheet`): a wide sheet over the page (min(1180px, 100vw - 48px),
  inset 24px from the top, `--r-xl`, `--sh-sheet`) with its own left sub-nav (200px, icon + label rows,
  small-caps group labels) and a header row: logo / thumbnail, name 18/650, status chip; on the right
  Copy link, one primary button, expand, close. Body: chart cards side by side, then carousels. Every
  detail view (an ad, a brand, a test, a calendar date, a product) is a sheet. Under 720px it becomes
  a full-screen sheet and the sub-nav becomes a scrolling chip row.
- **Carousel** `.ds-carousel`: a header with title + "View all" chip and two 28px round arrow buttons
  right; a horizontal scroll-snap row of 240px cards.
- **Modal** `.modal`: for a question or a short form only (confirm, name it). `--r-xl`, `--sh-sheet`,
  title 16/650, one explanation line, buttons right.
- **Composer** `.ds-composer`: the front door. 18px radius surface, 1px `--line-strong`, focus ring in
  accent, a textarea (15px), a bottom row with a `+` icon button left and mic + send right.
  Suggestion chips under it, "Pick up where you left off" list under those.
- **Empty state** `.ds-empty`: one 20px icon in a 40px `--surface-2` circle, one line, one button. Nothing else.
- **Skeleton** `.ds-sk`: `--surface-2` blocks with a 1.4s shimmer; same size as what will arrive.
- **Working** `<mobius-loader mode="working" size="20">`: the strip, small, for the Strategist thinking.
  `.ds-pulse` (a breathing accent dot) where WebGL is not worth it.

## 6. Layout

- Rail 248px: product name, client picker, items as icon + label rows (36px tall, 2px apart, `--r-md`),
  active = soft pill (`--brand-soft`, accent icon, `--ink` label). Foot: Tools, settings, theme switch,
  profile. Light rail = white with a hairline right border.
- Top bar 56px: ask bar (36px, `--r-md`), then period, attribution as chips on the right.
- Content max width 1400px, 28px side padding (16px under 720px). Under 980px the rail is a drawer;
  under 720px the phone tab bar shows.
- Settings: left sub-nav grouped by small-caps labels with an icon per row, content column with
  section headers in small caps, rows of label + one-line help + control, a "Save changes" per section.

## 7. The Mobius strip

`<mobius-loader>` (profit/mobius-loader.js, a custom element, no build step):

```html
<script src="mobius-loader.js?v=2"></script>
<mobius-loader mode="load"></mobius-loader>              <!-- the intro film, first paint -->
<mobius-loader mode="working" size="20"></mobius-loader> <!-- inline, the Strategist thinking -->
```

- `mode="load"` is a **pre-rendered 3D film** in `profit/assets/intro/` (2026-10-09; Cole rejected the
  live spin-then-swap: "it doesn't really animate into the logo"). 3.2s at 60fps: a glossy Mobius strip
  turns in perspective, the loop opens into an arch, the ribbon pinches into three rounded bands that
  glide into the exact places of the logo while the camera settles straight on, then a soft light sweep.
  The last frame IS the logo (silhouette IoU 0.994 against `brand/mobius-mark.webp`; colours are the
  logo gradient, fitted to `brand/mobius-app-icon-512.png`: 27 degrees, #C6E4D6 / #62BDEA / #DCC9A8).
- Files: `mobius-intro-square.webm` (VP9 with alpha, 1080x1080, what the app plays), `mobius-intro-square.mp4`
  and `-square-dark.mp4` (H.264 baked on #F7F7F8 / #111113, for Safari, which cannot draw VP9 alpha),
  `mobius-intro.webm` / `.mp4` (1920x1080, the same film for decks and the site), `mobius-intro-poster.jpg`.
  Only one square file (about 420 to 840KB) loads per visit.
- Behaviour: full screen on `--bg`, video centred at `min(86vmin, 600px)` (the mark is half the video).
  Once per browser session (`sessionStorage.locus_intro_seen`). The app renders underneath and never
  waits. The layer fades as the video ends, hard cap 3.5s; a tap, click or Escape skips it.
  `prefers-reduced-motion`, a video error, a blocked autoplay or no film after 1.2s = the static mark
  (inline SVG placed with `FINAL_VB`, so it sits exactly where the film ends) for a moment, then the fade.
  Remove early with `loader.done()`.
- **Regenerate**: `profit/assets/intro/source/` holds the renderer (Three.js 0.169 in headless Chrome:
  2x supersampling, 4x MSAA, 10 motion-blur sub-frames, RoomEnvironment + key/rim/fill, ACES, physical
  material with clearcoat; deterministic time per frame) and the ffmpeg encode script. Setup is in the top
  comment of `render.mjs`; run it from a scratch folder, never inside the repo. The geometry is the SVG
  path's own numbers (pill cap centres, radius 83.89), so the logo cannot drift.
- `mode="working"`: small (default 20px), the live Three.js r128 strip (cdnjs, loaded once on first use),
  rotating and gently pulsing. Usage in the chat:
  `el.innerHTML = '<mobius-loader mode="working" size="18"></mobius-loader> Thinking'`.
  Fallbacks: `prefers-reduced-motion`, no WebGL, or the CDN failing = the static mark, no animation.
- `window.MobiusLoader.frames(n, size)` still renders frames of the live strip (quick looks only).

## 8. The Slack emoji

`profit/assets/mobius-emoji.gif` (128x128, transparent, 2s loop) is the strip as a custom emoji.
Add it once: Slack > workspace menu > Tools and settings > Customize workspace > Emoji > Add custom emoji,
name it `mobius`. The Strategist can then react with `:mobius:` while it works.

Since 2026-10-09 it comes from the same renderer as the intro (same material and lighting): one full turn
of the strip, 40 frames at 20fps, rendered at 4x and downsampled, then
`node render.mjs --out emo --emoji 40 --w 128 --h 128 --ss 4 --sub 6` and ffmpeg palettegen/paletteuse
(96 colours, reserve_transparent, alpha_threshold 110, bayer dither). Slack's custom emoji limit is 128KB;
the shipped file is about 90KB. (`profit/assets/emoji-render.html` still works for the old live strip.)

## 9. Checklist for a new screen

- Uses only these tokens and primitives; no new hex colours, no new radius values.
- Every icon from icons.js, every platform as a logo.
- A one-sentence answer under each card title; small-caps labels for groups.
- Empty, loading (skeleton) and error states drawn.
- Checked at 1440 and 375 wide, light and dark, no console errors.

## 10. Polish pass two (2026-10-09): the small details

Two files: the "POLISH PASS TWO" block at the end of `profit/v2.css`, and `profit/polish.js` (loaded once, `defer`,
after askextra.js). polish.js is presentation only: it watches `#main`, `#v2panel`, `#v2seg` and the rail, never
routes or fetches, and the app renders the same without it. Toasts (`.lx-toast`) live in `/mobius.css` so share pages
get them too.

- **Motion tokens.** `--ease-out: cubic-bezier(.23,1,.32,1)` for anything entering or pressed, `--ease-drawer`
  `(.32,.72,0,1)` for the ask panel and the side panel, `--t-press` 140ms. Never `transition: all`, never `ease-in`.
  `prefers-reduced-motion` turns every duration to 0 (and polish.js skips the count-up and the slides).
- **Press and hover.** Every button, chip and pill scales to .97 on `:active`; rail rows and page tabs to .985.
  Cards that open something (`.v2tile`, `.v2go`, `.cn-card`, `.v2mult .m`, `.v2moved .mv`, `.v2gal .g`,
  `.v2orow`) lift 1px with `--sh-lift` on hover (pointer devices only) and press to .993.
- **Focus.** `:focus-visible` is a 2px accent ring at 75%, offset 2px (inset -2px on rail rows and page tabs so the
  scroll area never clips it). Fields keep their own soft ring and draw no outline.
- **Sliding indicators.** polish.js puts one `<i class="lx-ink">` in each control and moves it to the `.on` button
  (transform + width, 240ms `--ease-out`): the page tabs' underline (`.v2tabs`, `.line`), the Meta/Studio job pills
  (`.v2jobs`), the rail pill (`nav.tabs .grp-btns`), the theme switch and any `.ds-seg`. `#v2seg` is rebuilt on every
  `show()`, so the last position is remembered per control and the new ink starts there. The `.on` button itself then
  draws no background.
- **Top bar.** Sticky over 720px with `color-mix(--bg 84%)` and a 14px backdrop blur; `html.lx-scrolled` (scrollY > 4)
  adds the hairline and a soft shadow. polish.js writes its height into `--lx-top`.
- **Page head.** No rule under it any more (the page tabs already draw one). `.ph` is 20px under the tabs, crumb
  12/500 6px above a 24/650 title, actions are 28px pills (quiet text on a phone, still 44px targets). Empty
  children of `.v2` are `display:none`, so an empty slot (`#v2moved`, `#v2cal`) never adds a 16px gap.
- **Type.** Tabular figures on every number (tiles, tables, deltas, funnels); -.028em on titles and big numbers.
  Floor: badges and captions 11px (`--fs-cap`), the source badge (`.v2src`) 10px caps; everything you read is 12px+.
  Secondary text is `--muted`, one colour.
- **Tiles.** min-height 116px so a row lines up; the number scales with the tile (`clamp(20px, 13cqi, 26px)`, a
  container query) so the delta pill stays on its line; the source badge sits in the top-right corner so a long label
  wraps as text. **Count-up**: the first time a tile label is seen in a session its number counts up (650ms, quartic
  out); re-renders and period changes never replay it.
- **Delta pills.** One style: 20px tall pill, 12px/600, tabular.
- **Tooltips** (`#v2gtip`, `.v2tip`) match the menus: surface, hairline, `--sh-pop`, 10px radius.
- **Tables.** A `.v2tbl` that fits its card gets `lx-fits` (overflow visible) and a sticky header under the top bar;
  one that scrolls sideways fades at the right edge until scrolled to the end (`lx-more`). Every row has a quiet hover;
  link rows a stronger one. Column-header icons are added when 60%+ of a table's headers match the map in polish.js
  (`TH_ICON`: spend, revenue, orders, ROAS/MER/share, CPA/CAC, CTR, CPM/open, hook, brand, campaigns, flows, AOV,
  customers, sessions, frequency); a half-iconed header row reads as unfinished, so below that, none.
- **Skeletons.** Any `.hint` / `.v2hint` / `.tiny` that says "Loading..." / "Pulling..." becomes a skeleton: a lone
  page-level card turns into tiles + chart + table blocks (`.lx-sk-page`), a lone card into three shimmer lines, an
  inline hint into one bar. Plan cells waiting on a number (`td[data-pl]`, or any `td.lx-wait`) shimmer. The chat's
  working line and the home Ask card draw shimmer lines under their text (CSS only). Shimmer colours are `--sk-a` /
  `--sk-b` (ink at 6.5% and 2.5% over the surface), visible in both themes. New code can call
  `window.lxPolish.skPage()` / `skTable(n)` / `skLines(n)` for the markup.
- **Empty and error, one pattern.** A card holding only a hint (`.v2card > .v2hint:only-child`, or title + hint)
  draws as the empty state: a 40px circle with the inbox icon, one line. A lone `.v2bad` in a card becomes the error
  state (polish.js): red alert circle, the card's title (or "This did not load"), a plain sentence for 401/403 and
  network failures with the raw message small under it, and **Try again** (re-runs `show()` for the open page). Any
  other `p.v2bad` gets an alert icon in front. The Home read's "could not run" line becomes one quiet info line.
- **Popups.** Modals fade in with a scale from .97 (220ms), the scrim fades; menus scale from their trigger corner
  (period: top right, client picker: top left, profile: from the bottom). The ask panel slides on the drawer curve.
- **Toasts.** `.lx-toast` (add `.bad` for a failure): ink pill, a green or red dot, slides up 10px; calc.js, season.js
  and calendar.js all use it. Never inline-style a toast again.
- **Scrollbars** thin (10px track, 4px thumb at 16% ink), selection at 22% accent.

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
<script src="mobius-loader.js?v=1" defer></script>
<mobius-loader mode="load"></mobius-loader>              <!-- full screen, first paint -->
<mobius-loader mode="working" size="20"></mobius-loader> <!-- inline, the Strategist thinking -->
```

- Three.js r128 from cdnjs (`https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js`), loaded
  once on first use. A true parametric Mobius band (u around, v across, half twist), a soft gradient
  in the Mobius colours (mint to the Locus blue to sand), standard material with two soft lights,
  slow rotation.
- `mode="load"`: full screen over the app. The strip spins, settles and then the static Mobius mark
  (`brand/mobius-mark.webp` shape) fades in over it while the strip fades out, then the whole layer
  fades away. Hard cap 1.5s; the app renders underneath the whole time and never waits on it.
  Remove early with `loader.done()`.
- `mode="working"`: small (default 20px), rotating and gently pulsing. Usage in the chat:
  `el.innerHTML = '<mobius-loader mode="working" size="18"></mobius-loader> Thinking'`.
- Fallbacks: `prefers-reduced-motion`, no WebGL, or the CDN failing = the static mark (an inline SVG of
  the logo), no animation. Never blocks the app.
- `window.MobiusLoader.frames(n, size)` renders n frames of one full turn to data URLs (used to make the
  Slack emoji GIF).

## 8. The Slack emoji

`profit/assets/mobius-emoji.gif` (128x128, transparent, 2s loop) is the strip as a custom emoji.
Add it once: Slack > workspace menu > Tools and settings > Customize workspace > Emoji > Add custom emoji,
name it `mobius`. The Strategist can then react with `:mobius:` while it works.

To regenerate it: serve the repo root and open `profit/assets/emoji-render.html?n=40&size=128`; it renders
40 transparent frames of one full turn with `MobiusLoader.frames()` (click a frame to save it, or pass
`&post=http://127.0.0.1:<port>/frames` to send them all to a local script). Then build the GIF at 20 fps
(50ms a frame) with ffmpeg (the line is in the page's top comment) or Pillow, 60 colours, 1-bit
transparency. Slack's custom emoji limit is 128KB; the shipped file is about 110KB.

## 9. Checklist for a new screen

- Uses only these tokens and primitives; no new hex colours, no new radius values.
- Every icon from icons.js, every platform as a logo.
- A one-sentence answer under each card title; small-caps labels for groups.
- Empty, loading (skeleton) and error states drawn.
- Checked at 1440 and 375 wide, light and dark, no console errors.

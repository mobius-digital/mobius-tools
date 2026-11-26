# Locus v5: the frame

The new Locus, served at `/profit/v5/`. Plain ES modules, no framework, no build step, no npm.
The live app one folder up is not touched by anything in here. The product name lives in one
place (`APP_NAME` in `config.js`) and so does the agency's name (`ORG_NAME`, the only place it
is typed; storage keys and worker addresses are worked out from it).

**This repo is public.** No real client name, number, person, email, token or id goes in any
file here. Fixtures use the sample world below. Real data only arrives at run time from the API.

**Copy is American English** (color, behavior, gray, canceled, summarize). Change only the words people read, never a key, route or stored value.

## Run it

```
cd <repo>/profit
python -m http.server 8765 --bind 127.0.0.1
```

- Sample numbers, no login, no API: `http://127.0.0.1:8765/v5/?sample=1`
- Sign in page: `http://127.0.0.1:8765/v5/?sample=1#/signin`
- Real numbers: sign in to the live app on the same origin first. v5 reads the same stored
  session, so it opens signed in.
- See as a client: the "See as client" button, or add `?as=client`.
- Open the bell from a link: add `?bell=1`.

## The sample world

Every fixture uses these and nothing else. Numbers are made up and agree across pages.

- Brands: **Northlake Golf** (the default: golf belts and accessories), Harbor & Pine (jewellery),
  Tallgrass Apparel (polos and hats), Copper Kettle Pets (pet supplements), Summit Sticks (hockey
  gear), Brightside Patch (wellness patches), Fairway Supply (golf clubs).
- Team: Alex Morgan (owner), Sam Rivera (creative strategist, the signed in sample person),
  Jordan Lee (media buyer), Riley Chen (editor), Casey Brooks (designer), Morgan Patel (Google),
  Taylor Kim (Amazon). Clients: Pat Doyle, Jamie Fox. Emails end in `@example.com`.
- Northlake Golf this month: sales $63,429, ad spend $23,702, MER 2.68x against a 3.00x goal,
  cost per new customer goal $40, and one dated note ("Early sale ended Nov 15").

## Files

| File | What it is |
|---|---|
| `index.html` | The tiny first page: loader, gradient defs, font and module preloads. |
| `app.css` | Every token and every `lx-` component. Pages add no CSS of their own unless they must. |
| `config.js` | `APP_NAME`, `ORG_NAME`, storage keys, worker URLs, `SAMPLE`, old Locus links. |
| `menu.js` | The three menus (brand, agency, top bar lines) and every route. |
| `router.js` | Hash routes, page loading, saved copy then refresh, prefetch on hover, the page's `ctx`. |
| `gate.js` | The new client gate, per brand (pure, no imports; router, shell and app read it). |
| `data.js` | `api()`, `cached()`, `fixture()`, the saved copy, settings, the date range. |
| `kit.js` | The UI kit every page builds with, the one chart included. |
| `icons.js` | The mark, platform glyphs, the icon set. |
| `shell.js` | Side menu, top bar, brand switcher, the page head (title, stamp, dates, tabs), the bell panel, "See as client", phone tab bar. |
| `bell.js` | The bell's rows. Loaded when the bell is first opened, and once after boot for the count. |
| `app.js` | Boot: session check, who am I, brands, start the router. |
| `pages/_signin.js` | Sign in page. Its buttons hand over to the live sign in. |
| `pages/_coming.js` | Shown for any route with no page file yet, and the error state. |
| `pages/_sample/me.json`, `brands.json`, `notifications.json` | Sample person, brands and bell rows for `?sample=1`. |
| `fonts/` | Inter and Instrument Serif Italic, self hosted. |

## Routes

`#/<view>/<brand>/<line>/<tab>`

- `view` is `brand` or `agency`. `brand` is the brand slug (`brand_northlake_golf` becomes
  `northlake-golf`); in the agency view it is `all`.
- `line` is a main line in the side menu. `tab` is a sub page, shown as a tab under the page
  title. A line with no sub pages has one tab called `index`.
- The page file is always `pages/<line>/<tab>.js`. No registration: add the file and the route
  works. Until the file exists the route shows the Coming page with a link to old Locus.
- To add or rename a line or tab, edit `menu.js` only.

## Brand ids: what goes in `act=`

Every worker route that takes `act=` wants **the brand id from the brands endpoint**
(`GET /api/brands` on the account-health worker, field `id`, a string that starts `brand_`).
In a page that is `ctx.brand.id`. It is not the slug in the address, not the brand's name, and
not the Meta ad account number. Always send it through `encodeURIComponent`. For every brand at
once the routes that allow it take `act=all`. A client's brands come from the same session
answer, with the same kind of id. Every page in this folder was checked: all pass
`ctx.brand.id`; none needed fixing.

## The page head (the shell draws it, pages do not)

Top to bottom on every page: the small eyebrow, **the title, which is the plain question from
the design** ("Are Meta ads paying for themselves?"), with the "updated 4 min ago" stamp and the
date range beside it, then the tabs, then the page. A page's hero band goes under the tabs.
A page never draws its own h1, its own stamp or its own date chip.

- **Title.** `title` and `eyebrow` on the page module: text, an array of text and nodes, or a
  function `(ctx, data) => ...`. Use `em('words')` from the kit for the serif phrase. A title that
  depends on something picked inside the page calls `ctx.setTitle(content, { eyebrow })` from
  `render`. Keep the array flat (text and nodes, no arrays inside).
- **Stamp.** One for the whole app, set by the router from when the numbers were read. A page
  whose data carries its own read time gives `asOf: data => timestamp`.
- **Date range.** This month, Last 7 days, Last 30 days, Last month, Custom. The choice is kept
  per person (`saveSetting('range', ...)`). The page gets it as `ctx.range`
  (`{ preset, label, from, to, days, dates }`, always real dates, whole days, ending yesterday)
  and it is part of the saved copy's key, so two ranges never share a copy. Send
  `from=${ctx.range.from}&to=${ctx.range.to}`. A page that cannot honor the dates (today only, one
  fixed week) says `ranges: false` and the control hides. A plan is agreed per month: compare
  against it only when `ctx.range.preset === 'month'`.

## Page module contract

A page is one file with a default export:

```js
export default {
  title: ['Are Meta ads ', em('paying for themselves?')],   // or text, or (ctx, data) => content
  eyebrow: 'Meta',                  // optional small line above the title; text or (ctx, data) => text
  ranges: true,                     // false hides the date range (the page cannot honor it)
  asOf: data => data.read_at,       // optional: when the numbers were read, if the data knows better
  async load(ctx) { },              // real mode: fetch and return plain JSON (it is saved as is)
  render(el, data, ctx) { },        // draw the whole page into el
  update(el, data, ctx) { },        // optional: fresh data landed, change in place (else render runs again)
  skeleton(el, ctx) { },            // optional: first ever visit only
  sample: undefined,                // sample mode, see below
};
```

`ctx`: `{ route, view, line, tab, brand, brands, me, role, isClient, sample, range, signal, api,
cached, setting, settingNow, saveSetting, fixture(name), href(line, tab), go(route),
setTitle(content, { eyebrow }), legacy, title }`. `brand` is `{ id, name, slug, ... }` or null in
the agency view. `legacy` is the old Locus link for this page or null.

What the router does for you: draws the frame at once, imports the file, paints from the saved
copy if there is one (skeleton only when there is none), calls `load`, saves the answer, paints
again only when it changed, and sets the stamp. Never call `api()` in `render`.
`load` must not touch the DOM. No timers that poll, no `setInterval`.

Example:

```js
// pages/meta/top-ads.js
import { card, kpis, table, em, money, x, num, platformChip, empty } from '../../kit.js';

export default {
  title: ['Which ads ', em('earn their spend?')],
  eyebrow: 'Meta',
  async load(ctx) {
    const q = `act=${encodeURIComponent(ctx.brand.id)}&from=${ctx.range.from}&to=${ctx.range.to}`;
    return ctx.api('/api/creative?' + q, { worker: 'ah', signal: ctx.signal });
  },
  render(el, data, ctx) {
    if (!data || !data.ads || !data.ads.length) return el.replaceChildren(empty({ title: 'No ads spent on these dates' }));
    el.replaceChildren(
      kpis([
        { label: 'Spend', value: money(data.spend), lead: true },
        { label: 'ROAS', value: x(data.roas), sub: 'goal ' + x(data.goal_roas) },
        { label: 'Sales', value: num(data.sales) },
      ]),
      card({ title: 'Top ads', note: platformChip('meta') },
        table({
          cols: [
            { key: 'name', label: 'Ad', sortable: true },
            { key: 'spend', label: 'Spend', num: true, sortable: true, render: r => money(r.spend) },
            { key: 'clicks', label: 'Clicks', num: true, class: 'hide-sm', render: r => num(r.clicks) },
            { key: 'roas', label: 'ROAS', num: true, sortable: true, render: r => x(r.roas) },
          ],
          rows: data.ads, sort: { key: 'spend', dir: 'desc' },
          onRow: row => ctx.go({ ...ctx.route, tab: 'overview' }),
        })));
  },
};
```

The endpoint in the example is a stand in. Use the real route for your page.

## What a client sees

`ctx.isClient` is true for a signed in client and for the team while "See as client" is on (the
whole shell switches, with a dark bar across the top, until "Back to team view"). A client never
gets: the agency view, My day, Ask and its history, team-only tabs (`team: true` in `menu.js`),
menu counts, suggestions, or the bell's team rows. The router sends a client away from those
addresses. In a page, anything written for the team (Ask why, Open integrations, "connect it in
Brand settings", a link to old Locus) must be behind `!ctx.isClient`. Check `ctx.isClient`, never
`ctx.role === 'client'`.

## New client setup (onboarding)

- **New client** (`agency/all/a-clients/new`): one form, previews, one Send (owner only). Routes `/api/onboard/options`,
  `/preview`, `/send` on account-health.
- **Get started** (`brand/<brand>/get-started/index`): the client's checklist (profile, then Sign and pay, Connect, Ten
  questions, Photos and videos, any order, each with "Someone else does this") and the team's view of the same client
  (who waits on whom, Remind them, ticks, budget, Mark finished). `pages/get-started/_ui.js` holds the shared parts and
  the line buttons My day uses.
- **The gate**: while `/api/me` says `client.onboarding.gated`, a real client login sees only Get started and their
  profile for a brand still being set up (`gate.js`, read by `router.js` normalise, the side menu and the phone tabs).
  It is PER BRAND: `gated_slugs` are the held brands and a brand already running stays open; `all_gated` (or a
  colleague's `only`) also holds the pages with no brand. Old Locus sends a fully held client here. The team and
  See as client are never gated.
- **Welcome cards** (`pages/get-started/_welcome.js`): once per person after the gate (`client.welcome_seen` false),
  last card asks for feedback ("Message the team").
- **Sign up**: an invite link opens "make your login": Google, or an emailed 6 digit code (`/api/clients/code`,
  `/api/clients/code/verify`).
- **Assets** (`brand/<brand>/assets/index`): the brand's photo and video folder link; Locus never copies the files.
  The Library pages carry an Assets button.
- Sample: `?sample=1&as=client&onboarding=1` (a gated client), `&welcome=1` (the cards), `?sample=1&invite=1` (sign up),
  `?sample=1#/brand/northlake-golf/get-started/index` (team view), `#/agency/all/a-clients/new`.

## The bell

A panel from the bell with three tabs: Needs you, Watching, Done today, and a count on the bell.
Rows come from `bell.js`: `loadBell({ me, role, asClient, brand })` returns
`{ needs, watching, done, error? }`, each row
`{ text: 'words' | ['words ', { b: 'bold' }], brand, by, when, who: { name, photo } | null,
btn: { label, line, tab, primary } | { label, href } }`. Sample mode reads
`pages/_sample/notifications.json` (a row with `client: true` is one a client sees). Real mode
reads the team's My work list (late and today are Needs you, this week is Watching, ticked is
Done today); a client gets the open approvals and questions on their brand's requests. Nothing in
the bell writes; a row's button opens the page where the thing is done.

## Settings (`data.js`): no hard-coded thresholds, times or names

A threshold, a time of day or a person's name that the agency could change does not belong in a
page. Read it:

```js
const start = ctx.settingNow('agency.meetingStart', '8:00');          // at once, this person's store
const hour  = await ctx.setting('agency.morningHour', 5);              // from where it lives
await ctx.saveSetting('brand:' + ctx.brand.id + '.judge_days', 4);     // saves where it lives
```

- `setting(key, fallback)` (async), `settingNow(key, fallback)` (no wait, the person's own store
  only), `saveSetting(key, value)` (async, throws `ApiError` when a worker says no).
- `agency.<name>`: the agency's settings the old app already keeps (Slack channel and sending
  choices, the pace alert percent, the morning hour and the other names listed in `AGENCY_KEYS`).
- `brand:<brand id>.<name>`: a brand's goals (`target_roas`, `target_cpa`) and its test rules
  (`judge_spend`, `judge_days`, `yellow_pct`, `min_track`, `min_spend`, `min_days`, `min_cap_pct`).
- Any other key is the person's own and is kept on this device (the date range, a remembered tab).
  A key the workers do not know yet (`agency.meetingStart`) also lands here until a route exists.
- Sample mode keeps everything local and saves nothing to a worker.

## Sample mode (`?sample=1`)

Fixtures only. `api()` throws in sample mode, nothing is saved, and the top bar shows a gray
"Sample numbers" chip. The router picks the page's sample data in this order:

1. `sample` is a function: `await sample(ctx)`.
2. `sample` is any other value (including `null`): used as is.
3. `sample` is not set: the file `pages/<line>/_sample/<tab>.json` is fetched
   (for `pages/meta/top-ads.js` that is `pages/meta/_sample/top-ads.json`).

A fixture has the exact shape `load` returns. Extra files go beside it and are read with
`ctx.fixture('<name>')`, which reads `pages/<line>/_sample/<name>.json`. A fixture does not
change with the date range.

## Kit (`kit.js`)

All return a DOM node unless noted.

- Build: `h(tag, attrs, ...kids)`, `s(tag, attrs, ...kids)` (SVG), `svgNode(str)`, `esc(v)` (string)
- Format (strings): `money(n, { cur, compact, cents })`, `num(n, digits)`,
  `pct(fraction, { digits, signed })`, `x(n, digits)` (ROAS and MER), `relativeTime(ts, now)`
- Small parts: `statusDot(tone, text)`, `pill(tone, text)`, `count(n, tone)`,
  `delta(n, { bad, plain, text })`,
  `button(label, { primary, large, ghost, href, target, icon, iconLeft, onclick, disabled, aria, class })`,
  `platformChip(id, { chip, dot, label })`, `dateBlock(date, { now, month })`,
  `em(text)` (the serif accent word)
- People: `avatar(person, { size })` draws the photo when the person has one (`photo`, `picture`,
  `image` or `avatar`, asked for at a size that stays sharp) and two initials when there is none
  or it fails to load. `photoOf(person, size)` gives the address, `initials(person)` the letters.
- Blocks: `card({ title, note, action, flush, class }, ...kids)`,
  `hero({ sub, action, line, class }, ...kids)` (the band under the tabs; it has no title of its
  own now), `takeaway(content, { action, by })` (the Locus AI line),
  `empty({ title, text, action })`, `skeleton(kind, n)`
- Numbers: `kpi({ label, value, small, sub, delta, spark, lead, size, href, src })`,
  `kpis(list, { cols })`, `gauge({ value, max, goal, tone, thin, ticks })`
- Table: `table({ cols, rows, virtual, total, roomy, rowHeight, height, sort, onRow, empty })`.
  A column is `{ key, label, num, sortable, width, class, value(row), render(row, i) }`. Over 100
  rows it draws only the rows on screen. The node has `.setRows(rows)`. **A column that should
  leave on a small screen takes `class: 'hide-sm'` (phone) or `'hide-md'` (tablet and phone).**
  Never hide or style a column by its position.
- Controls: `tabs(items, active, onPick)`, `segmented(items, active, onPick)`,
  `field({ label, hint, icon, id, ...inputAttrs })`, `toggle({ label, checked, onchange })`
- Overlays: `toast(text, { tone, ms })`, `sheet({ title, body, side, onClose, class })`
  (THE detail pattern: a centered modal sheet on desktop, 720px wide, or 560px with `side: 'center'` for a confirm;
  a sheet from the bottom on a phone. No side panels. Escape, backdrop click, focus trap, focus returns.)
- Ask in place: `askpanel.js` `openAskPanel({ route, brand, title, range, href, context })` docks Ask Locus AI on the
  right (420px; at 1280+ the page narrows, under 1280 it overlays, a bottom sheet on a phone) and follows the person
  from page to page. **A page may set `ctx.askContext = 'one or two plain sentences of what is on screen'`**; it goes
  with every question as `screen.page_summary`. `closeAskPanel()` closes it.
- Foundation pass (2026-11-26), the rules every page follows:
  - `kpi({ label, value, unit, window, source, spark, sparkLabels, sparkFormat, delta, sub, small, size, href })`:
    value may be a number with `unit` 'money' | 'x' | 'pct' | 'num'. `window` + `source` draw "Nov 1 to 25 · Triple
    Whale" under it. The spark is orange with a fill, low and high marked, first and last `sparkLabels` under it.
  - `sourceLine(window, source)`: the same line anywhere else. Every number says its window and source; Meta's own
    figures say "Meta's own count".
  - `fmtUnit(v, unit)`: one number in its unit.
  - `staleStamp({ at, onRefresh, busy })`: "Updated 4 min ago" + a refresh button, for every card that can go stale.
  - `calendar({ from, to, min, max, months, onChange })` and `rangePicker({ from, to, min, max, onApply, onCancel })`:
    the Locus calendar. Never `type=date`. The page head's date menu uses it for Custom; presets are Today,
    Yesterday, Last 7, 14, 30 days, This month, Last month, Last 90 days, Custom (`data.js` RANGES).
  - Bubbles: `tipShow(owner, content, at, gap, { now })` opens after 350ms of rest, never while scrolling, closes
    120ms after leave (`HOVER`, `scrollingNow()`). Rows are `tipRow(swatch, label, value)`: label left, value with
    its unit right. Definitions (defs.js) use the same dark bubble. `defLabel` on a plain word (Sales, Spend, Orders,
    Today, Budget, Clicks, Impressions, Customers...) renders plain text (`STOPLIST`).
  - Charts: pass `windowLabel: 'Daily, Nov 1 to 25'` to every `lineChart` / `barChart`; give `format` a unit. The y
    axis has 2 or 3 steps. `barChart` columns are brand orange (with `lead`, that one orange and the rest slate). A
    one-series tooltip has no color square; `legend()` with one item draws nothing.
  - Tokens: radius `--r-chip` 6, `--r-btn` 10, `--r-tbl` 12, `--r-card` 16, `--r-hero` 20 (a child is never rounder
    than its parent). Type `--fs-page` 26, `--fs-section` 17, `--fs-card` 14 (class `lx-card-t`), `--fs-small` 12.5
    (class `lx-small`), `--fs-colhead` 11.5 sentence case. Gaps `--gap-1..6` (4, 8, 12, 16, 24, 32). Rows: one
    `--row-hover` tint (class `lx-hover` for a hand made row); a selected row takes class `sel` (3px orange bar).
    No highlight backgrounds and no underlines except the dotted defined term and a link on hover.
- Type scale (app.css): `--num-xl` (the one hero number, 34px max, nothing on a page is bigger), `--num-l` (26px,
  kpi tiles), `--num-m` (18px), `--num-s` (14px), `--fs-body` 14px, `--fs-cell` 13px, `--row-h` 36px tables.
  Pages use these tokens, never their own px for a figure.
- Exports (`pages/a-black-friday/_export.js`): `hiCanvas(w, h)` draws at 3x or more (about 3840 to 4200 wide) and
  `fontsReady(faces)` waits for the web fonts first; reuse both for any new PNG or PDF.

### The one chart

Every chart is `lineChart` (or `barChart`, which is the same chart with one column series). No
page draws its own SVG chart. The chart is a box that follows its container: it is drawn at the
box's real pixel width, so the type is a true size on a phone and on a wide screen, and labels
that would touch are dropped on a narrow one. Give it its own full width row.

```js
lineChart({
  series: [{ name, values, lead, dashed, type: 'bar', tone: 'ink' | 'dim' | 'slate', leadAt, dimAt,
             axis: 'right', labels: true | (v => text), points, end: (v => text) | false }],
  labels,            // x axis text, one per point: days, weeks ("Oct 26") or hours ("6am")
  ticks,             // [indexes]: exactly which x labels to try
  xs,                // real x positions when points are not evenly spaced (day 0, 30, 90, 365)
  slots,             // points in the middle of equal slots (on by default with a column series)
  goal: { value, label, at: 'start' | 'end' },      // a dashed level line with its words
  note: { index, text }, notes: [...],              // a dated note: an upright dashed line and a few words
  marks: [{ at | index, value, axis, text, line }], // an ink dot with words (where two lines cross)
  now,               // index of "now" on an hour chart
  y2: { max, format },                              // the right axis for series with axis: 'right'
  fill, endLabels,   // the soft area under the lead line; the figures at the right end (both on)
  format, endFormat, // v => text for the axis; for end and point labels
  yMax, yTicks, axis, height (350), phoneHeight (290), width, pad, top, barWidth, min,
  hover: i => nodes, // a read out above the plot for the point under the pointer or finger
  label, empty,      // the spoken description; the words when there is nothing to draw
})
barChart({ values, labels, dim, lead, format, height, valueLabels, ...the same options })
sparkline(values, { lead, fill, width, height, goal, labels, format, name, marks, axis })   // orange by default; lead: false = slate
legend([{ name, lead }, { name }, { name, dashed }, { name, square, color }])   // empty items are skipped
```

One series has `lead: true` and is the only ember line. A second line is slate, a comparison is
`dashed`, columns are ink, gray or slate. Put the question and the legend in a
`h('div', { class: 'lx-chart-h' }, ...)` above the chart.

Tones are `good`, `warn`, `bad` or empty. The ember gradient is for the mark, the Ask button,
one primary button, the active marker and the lead line of a chart. Nothing else. Status is
green, yellow or crimson, never ember.

## Data (`data.js`)

- `api(path, { worker: 'profit' | 'ah', method, body, headers, signal })`: one call with the
  stored session. Throws `ApiError` with `.status`. A 401 sends the person to sign in.
- `cached(key, fetcher, onFresh, { maxAge })`: saved copy at once, refresh behind. Pages rarely
  need it directly; the router wraps `load` in it.
- `setting`, `settingNow`, `saveSetting` (see Settings), `RANGES`, `rangeOf(saved)`,
  `datesLabel(from, to)`.
- `fixture(path)`, `announce(what)` and `onAnnounce(fn)` (tell other open tabs after a write).

## Old Locus links

`legacyUrl(openId, brandId)` in `config.js` builds `../?open=<old page id>&act=<brand id or all>`.
Each tab in `menu.js` carries its old page id as `legacy` (or null). Pages get the finished
link as `ctx.legacy`. The account menu has "Old Locus" (`../`).

## Speed rules a page must keep

Shell JS under 150 KB raw and `app.css` under 60 KB raw; a page file is loaded only when
opened; no Google Fonts; no `backdrop-filter`; no second `infinite` animation; no
whole-document MutationObserver; no polling; tables over 100 rows use `virtual`.

## Every route

`<brand>` is the brand slug. Top bar lines work in either view.

| Route (after `#/`) | Page | File | Old page id | Team only |
|---|---|---|---|---|
| `brand/<brand>/home/index` | Home | `pages/home/index.js` | overview |  |
| `brand/<brand>/month/pace` | This month > Pace | `pages/month/pace.js` | month |  |
| `brand/<brand>/month/weeks` | This month > Week by week | `pages/month/weeks.js` | none |  |
| `brand/<brand>/month/profit` | This month > Profit | `pages/month/profit.js` | profit |  |
| `brand/<brand>/month/plan` | This month > Plan | `pages/month/plan.js` | plan |  |
| `brand/<brand>/funnel/whole` | Full funnel > Whole funnel | `pages/funnel/whole.js` | none |  |
| `brand/<brand>/funnel/website-steps` | Full funnel > Website steps | `pages/funnel/website-steps.js` | website |  |
| `brand/<brand>/funnel/path` | Full funnel > Path to purchase | `pages/funnel/path.js` | none |  |
| `brand/<brand>/customers/snapshot` | Customers > Snapshot | `pages/customers/snapshot.js` | customers |  |
| `brand/<brand>/customers/ltv` | Customers > LTV | `pages/customers/ltv.js` | customers |  |
| `brand/<brand>/customers/repeat` | Customers > Repeat orders | `pages/customers/repeat.js` | customers |  |
| `brand/<brand>/customers/buy-next` | Customers > What they buy next | `pages/customers/buy-next.js` | none |  |
| `brand/<brand>/sales/by-day` | Sales > By day | `pages/sales/by-day.js` | store |  |
| `brand/<brand>/sales/products` | Sales > Products | `pages/sales/products.js` | stock |  |
| `brand/<brand>/sales/inventory` | Sales > Inventory | `pages/sales/inventory.js` | stock |  |
| `brand/<brand>/website/pages` | Website > Pages | `pages/website/pages.js` | website |  |
| `brand/<brand>/website/seo` | Website > SEO | `pages/website/seo.js` | search |  |
| `brand/<brand>/platforms/side-by-side` | All platforms > Side by side | `pages/platforms/side-by-side.js` | channels |  |
| `brand/<brand>/platforms/live-now` | All platforms > Live now | `pages/platforms/live-now.js` | none |  |
| `brand/<brand>/platforms/changes` | All platforms > Changes made | `pages/platforms/changes.js` | changes |  |
| `brand/<brand>/meta/overview` | Meta > Overview | `pages/meta/overview.js` | meta |  |
| `brand/<brand>/meta/live-now` | Meta > Live now | `pages/meta/live-now.js` | mtoday |  |
| `brand/<brand>/meta/top-ads` | Meta > Top ads | `pages/meta/top-ads.js` | adcreative |  |
| `brand/<brand>/meta/suggestions` | Meta > Suggestions | `pages/meta/suggestions.js` | buyer | yes |
| `brand/<brand>/meta/load-ads` | Meta > Load ads | `pages/meta/load-ads.js` | launch | yes |
| `brand/<brand>/meta/changes` | Meta > Changes made | `pages/meta/changes.js` | changes |  |
| `brand/<brand>/google/overview` | Google > Overview | `pages/google/overview.js` | google |  |
| `brand/<brand>/google/search-terms` | Google > Search terms | `pages/google/search-terms.js` | gterms |  |
| `brand/<brand>/google/products-ads` | Google > Products and creative | `pages/google/products-ads.js` | gads |  |
| `brand/<brand>/google/suggestions` | Google > Suggestions | `pages/google/suggestions.js` | none | yes |
| `brand/<brand>/google/changes` | Google > Changes made | `pages/google/changes.js` | gchanges |  |
| `brand/<brand>/tiktok/overview` | TikTok > Overview | `pages/tiktok/overview.js` | tiktok |  |
| `brand/<brand>/tiktok/live-now` | TikTok > Live now | `pages/tiktok/live-now.js` | none |  |
| `brand/<brand>/tiktok/top-videos` | TikTok > Top videos | `pages/tiktok/top-videos.js` | none |  |
| `brand/<brand>/tiktok/suggestions` | TikTok > Suggestions | `pages/tiktok/suggestions.js` | none | yes |
| `brand/<brand>/tiktok/changes` | TikTok > Changes made | `pages/tiktok/changes.js` | none |  |
| `brand/<brand>/amazon/overview` | Amazon > Overview | `pages/amazon/overview.js` | none |  |
| `brand/<brand>/amazon/search` | Amazon > Search terms | `pages/amazon/search.js` | none |  |
| `brand/<brand>/amazon/products` | Amazon > Products | `pages/amazon/products.js` | none |  |
| `brand/<brand>/amazon/creative` | Amazon > Creative | `pages/amazon/creative.js` | none |  |
| `brand/<brand>/email/snapshot` | Email & SMS > Snapshot | `pages/email/snapshot.js` | email |  |
| `brand/<brand>/email/campaigns` | Email & SMS > Campaigns | `pages/email/campaigns.js` | email |  |
| `brand/<brand>/email/flows` | Email & SMS > Flows | `pages/email/flows.js` | email |  |
| `brand/<brand>/email/list-growth` | Email & SMS > List Growth | `pages/email/list-growth.js` | email |  |
| `brand/<brand>/creative-review/index` | Creative review | `pages/creative-review/index.js` | adcreative |  |
| `brand/<brand>/what-works/learned` | What works > Learned | `pages/what-works/learned.js` | tests |  |
| `brand/<brand>/what-works/hooks` | What works > Hooks | `pages/what-works/hooks.js` | none |  |
| `brand/<brand>/what-works/ad-type` | What works > Ad type | `pages/what-works/ad-type.js` | none |  |
| `brand/<brand>/what-works/copy` | What works > Copy | `pages/what-works/copy.js` | none |  |
| `brand/<brand>/what-works/angles` | What works > Angles | `pages/what-works/angles.js` | angles |  |
| `brand/<brand>/what-works/landing-pages` | What works > Landing pages | `pages/what-works/landing-pages.js` | none |  |
| `brand/<brand>/what-works/competitors` | What works > Competitors | `pages/what-works/competitors.js` | inspo |  |
| `brand/<brand>/production/board` | Production > Board | `pages/production/board.js` | production |  |
| `brand/<brand>/creators/to-review` | Creators > To review | `pages/creators/to-review.js` | trybe |  |
| `brand/<brand>/creators/videos` | Creators > Videos | `pages/creators/videos.js` | trybe |  |
| `brand/<brand>/creators/people` | Creators > People | `pages/creators/people.js` | trybe |  |
| `brand/<brand>/assets/index` | Assets | `pages/assets/index.js` | none |  |
| `brand/<brand>/library/photos` | Library > Photos | `pages/library/photos.js` | library |  |
| `brand/<brand>/library/footage` | Library > Footage | `pages/library/footage.js` | library |  |
| `brand/<brand>/library/reference-ads` | Library > Reference ads | `pages/library/reference-ads.js` | inspo |  |
| `brand/<brand>/calendar/index` | Calendar | `pages/calendar/index.js` | calendar |  |
| `brand/<brand>/offers/index` | Offers | `pages/offers/index.js` | season |  |
| `brand/<brand>/black-friday/war-room` | Black Friday > War Room (pace, calls, plan; a client sees pace and plan) | `pages/black-friday/war-room.js` | warlive |  |
| `brand/<brand>/black-friday/plan` | Black Friday > Plan (not a tab: opened from the War Room's plan table) | `pages/black-friday/plan.js` | warplan |  |
| `brand/<brand>/black-friday/pace` | Old address: opens the War Room | (router) | warlive |  |
| `brand/<brand>/reports/index` | Reports | `pages/reports/index.js` | reports |  |
| `brand/<brand>/documents/index` | Documents | `pages/documents/index.js` | dash |  |
| `brand/<brand>/requests/index` | Requests | `pages/requests/index.js` | requests |  |
| `brand/<brand>/brand-settings/goals` | Brand settings > Goals | `pages/brand-settings/goals.js` | settings |  |
| `brand/<brand>/brand-settings/costs` | Brand settings > Costs | `pages/brand-settings/costs.js` | costs |  |
| `brand/<brand>/brand-settings/brand` | Brand settings > Brand | `pages/brand-settings/brand.js` | settings |  |
| `brand/<brand>/brand-settings/integrations` | Brand settings > Integrations | `pages/brand-settings/integrations.js` | settings |  |
| `brand/<brand>/brand-settings/people` | Brand settings > People and sending | `pages/brand-settings/people.js` | settings | yes |
| `agency/all/a-today/index` | Today | `pages/a-today/index.js` | morning | yes |
| `agency/all/a-month/pace` | This month > Pace | `pages/a-month/pace.js` | month | yes |
| `agency/all/a-month/profit` | This month > Profit | `pages/a-month/profit.js` | profit | yes |
| `agency/all/a-platforms/side-by-side` | All platforms > Side by side | `pages/a-platforms/side-by-side.js` | channels | yes |
| `agency/all/a-platforms/changes` | All platforms > Changes made | `pages/a-platforms/changes.js` | changes | yes |
| `agency/all/a-meta/suggestions` | Meta > Suggestions | `pages/a-meta/suggestions.js` | buyer | yes |
| `agency/all/a-meta/overview` | Meta > Overview | `pages/a-meta/overview.js` | meta | yes |
| `agency/all/a-meta/load-ads` | Meta > Load ads | `pages/a-meta/load-ads.js` | launch | yes |
| `agency/all/a-google/suggestions` | Google > Suggestions | `pages/a-google/suggestions.js` | none | yes |
| `agency/all/a-google/overview` | Google > Overview | `pages/a-google/overview.js` | google | yes |
| `agency/all/a-google/search-terms` | Google > Search terms | `pages/a-google/search-terms.js` | gterms | yes |
| `agency/all/a-production/pipeline` | Production > Pipeline | `pages/a-production/pipeline.js` | production | yes |
| `agency/all/a-production/needs-someone` | Production > Needs someone | `pages/a-production/needs-someone.js` | production | yes |
| `agency/all/a-creators/to-review` | Creators > To review | `pages/a-creators/to-review.js` | trybe | yes |
| `agency/all/a-creators/by-brand` | Creators > By brand | `pages/a-creators/by-brand.js` | trybe | yes |
| `agency/all/a-calendar/index` | Calendar | `pages/a-calendar/index.js` | calendar | yes |
| `agency/all/a-black-friday/war-room` | Black Friday > War Room (every brand) | `pages/a-black-friday/war-room.js` | warlive | yes |
| `agency/all/a-black-friday/pace` | Old address: opens the War Room | (router) | warlive | yes |
| `agency/all/a-black-friday/plan` | Old address: opens the War Room (each brand's plan opens from its plan table row) | (router) | warplan | yes |
| `agency/all/a-to-send/index` | To send | `pages/a-to-send/index.js` | reports | yes |
| `agency/all/a-shared-links/index` | Shared links | `pages/a-shared-links/index.js` | none | yes |
| `agency/all/a-clients/index` | Client list > Client list | `pages/a-clients/index.js` | settings | yes |
| `agency/all/a-clients/new` | Client list > New client | `pages/a-clients/new.js` | none | yes |
| `agency/all/a-requests/index` | Requests | `pages/a-requests/index.js` | requests | yes |
| `agency/all/a-meetings/agenda` | Meetings > Agenda | `pages/a-meetings/agenda.js` | calls | yes |
| `agency/all/a-meetings/pre-read` | Meetings > Pre-read | `pages/a-meetings/pre-read.js` | none | yes |
| `agency/all/a-meetings/run` | Meetings > Run the meeting | `pages/a-meetings/run.js` | calls | yes |
| `agency/all/a-meetings/past` | Meetings > Past meetings | `pages/a-meetings/past.js` | meetings | yes |
| `agency/all/a-money/billing` | Money > Billing | `pages/a-money/billing.js` | economics | yes |
| `agency/all/a-money/margin` | Money > Margin | `pages/a-money/margin.js` | economics | yes |
| `agency/all/a-team/index` | Team | `pages/a-team/index.js` | workload | yes |
| `agency/all/a-status/index` | Platform status | `pages/a-status/index.js` | pulse | yes |
| `agency/all/a-settings/clients` | Agency settings > Clients | `pages/a-settings/clients.js` | settings | yes |
| `agency/all/a-settings/team` | Agency settings > Team | `pages/a-settings/team.js` | settings | yes |
| `agency/all/a-settings/integrations` | Agency settings > Integrations | `pages/a-settings/integrations.js` | settings | yes |
| `agency/all/a-settings/ask` | Agency settings > Ask Locus | `pages/a-settings/ask.js` | settings | yes |
| `agency/all/a-settings/how-we-run-ads` | Agency settings > How we run ads | `pages/a-settings/how-we-run-ads.js` | settings | yes |
| `agency/all/a-settings/sending` | Agency settings > Sending and notifications | `pages/a-settings/sending.js` | settings | yes |
| `<view>/<brand>/ask/index` | Ask Locus AI | `pages/ask/index.js` | none | yes |
| `<view>/<brand>/my-day/index` | My day | `pages/my-day/index.js` | mywork | yes |
| `brand/<brand>/get-started/index` | Get started (new client setup; the gate) | `pages/get-started/index.js` | none |  |
| `<view>/<brand>/notifications/needs-you` | Notifications > Needs you | `pages/notifications/needs-you.js` | none |  |
| `<view>/<brand>/notifications/watching` | Notifications > Watching | `pages/notifications/watching.js` | none |  |
| `<view>/<brand>/notifications/done-today` | Notifications > Done today | `pages/notifications/done-today.js` | none |  |
| `<view>/<brand>/profile/index` | Your profile > Profile | `pages/profile/index.js` | none |  |
| `<view>/<brand>/profile/settings` | Your profile > My settings | `pages/profile/settings.js` | none |  |

# The phone pass (2026-10-15)

Cole: "the entire Locus doesn't seem optimized for iPad and iPhone." This is the Locus-wide pass that followed the
Asana-grade Production board (commit 0dfe90a). One new stylesheet, `profit/phone.css`, loaded after `v2.css`,
`kit.css` and `supply.css` on every page. No JavaScript changed. Tokens only, no em dashes.

## How it was measured

An in-browser audit (`window.__audit(ids)`, kept in the session scratchpad, not committed) walked every page id with
`show(id)` on the local pair (tools-static + both dev workers, Lucky Golf, real data) at 375x812 and 768x1024 and
measured, per page: horizontal overflow of the document, the outermost elements wider than the viewport, tap targets
under 32px, text under 11.5px, and tables with no scrolling wrapper. 54 page ids, every one of them, both widths.

## What was broken, by cause

1. **The top bar.** Under 720 the ask bar took `calc(100% - 50px)`, so the helper badge sat alone on its own row,
   and a page's own actions (Plan: Client link + Save; P&L: Costs + Client link; Season; Reports) ran off the right
   edge (Plan reached 415px wide). Between 721 and 979 (an iPad, rail as a drawer) the bar was one row and P&L
   overflowed by 36px.
2. **The page head.** The title and the quiet actions (Export, Tour, Metrics, Help) shared one row and crowded the
   title at 375.
3. **The 44px phone rule in index.html** (`button,.btn,.chip,.ctl,select{min-height:44px}` under 720) is right for
   buttons and wrong for things drawn at their own size: the round task tick became a 16x44 ellipse, the Production
   format pill a 44px circle, the avatar and the Google / Meta switch a tall pill with the knob at the top, the table
   chevron an 18x44 box, and the ask bar's input and Chats button overflowed its 38px box.
4. **Rows that did not wrap.** Today's calls: an ad name with no spaces pushed the page to 441px. Google > Changes:
   a one-column row (`1fr` = `minmax(auto,1fr)`) grew to a long campaign name. Google > Ads: the URL line.
5. **Tasks.** Fixed Who and Due columns left the task text a third of the screen (six lines per task).
6. **How to use Locus > How we work.** The two tables (1,800 and 2,300px wide) were cut off inside their card at
   every width, the desktop included.
7. **Small targets and text.** Day check's 30 squares were 18px slivers with 9.5px digits; the Today row buttons
   were 30px; the task tick 16px, the gallery tick 27px, the campaign row buttons 18 to 22px, Platform status logo
   letters 5px, source chips on tiles 10px, the Change Log row buttons 28px on an iPad.

## What phone.css does

- **Under 720:** `.hd-right` becomes `display:contents`, so the top bar lays out as row 1 = badge + ask bar (the ask
  bar is the 44px target, its parts stay inside), row 2 = the period and attribution pills, row 3 = the page's own
  actions as a full-width row (only when the page has any). The page head wraps: title first, the actions under it,
  the Tour button hidden. The drawn-size controls above get `min-height:0`. Today's rows wrap and their buttons are
  38px; the Day check strip scrolls sideways with 34px squares; Google Changes and Ads rows wrap; the Dashboards
  composer wraps; source chips are 11px; chart SVGs clip.
- **Under 600:** Tasks rows are a two-line grid (words across the row, who and when under them), the column header
  row hidden.
- **721 to 979:** the top bar wraps only when the badge, ask bar and pills do not fit; the pills and page actions
  move to a second row, right-aligned.
- **Every width:** the How we work tables scroll inside their card (first column wraps under 980).
- **Touch (`pointer:coarse`):** a `::after` pseudo element widens the hit area of the task tick, table chevron and
  row buttons, avatar, format and due pills, the switches and the nudge close by 11px each side without changing
  the look; the row "more" button is always visible; checkboxes are 20px; the gallery tick 30px; footer links,
  page-head actions, Change Log buttons, board chips, Tasks segments and chips are 36px.

## Checked

375 and 768, Lucky Golf, every page id: no page scrolls sideways, no table without a scroller, the top bar on
Overview, Plan, P&L, Day check, Today, Production, Tasks, Google campaigns and Meta campaigns by eye. Not checked:
a real iPhone or iPad (the pane emulates size, touch points and user agent, not Safari), and the Daily Brief / Reports
bodies, which 401 on the local pair and were audited as shells only.

## Second pass, the same day: everything comes from the bottom (Cole: "like a native app")

Cole's read of the first pass on his phone: the top looked "almost blurry" by the search bar, More and the client
picker slid in from the side, and the brief looked clunky. He also asked whether every part had been audited: no,
the audit measured page bodies only, never the sheets, menus or the brief editor.

- **The blur** was the helper's face at 35% opacity (the "asleep" state, right for the 10px desktop dot, wrong for
  the character picture) drawn twice side by side, in the badge and in the ask bar. On a phone the badge face is
  full opacity and the ask bar has no face.
- **`profit/phone.js`** (deferred, after the boot script): one bottom-sheet primitive (`#lxSheet`: scrim, grab
  handle, slide up, swipe down or Escape or scrim to close). More in the phone bar opens it with the client row,
  the destinations not in the bar, Tools and Brand settings, Dark/Light, and the profile items; every row clicks
  the REAL rail or profile button, so nothing in index.html changed. The client picker is the same sheet hosting
  the real `#pfPick` menu node (moved in, moved back on close), so its search and the document click handlers
  keep working. A scrim (`#lxMenuScrim`) sits behind any open `.hd-period` menu and closes it on tap.
- **phone.css**: under 720 every `.hd-period.open .hd-per-menu` (period, attribution, PillMenu, Columns, Export)
  is fixed to the bottom with a handle and 46px rows; `#v2panel` and the card sheet slide UP full screen instead
  of in from the right; the card sheet's inset is 14px, the brief toolbar is one row that scrolls sideways with
  36px tools. Modals already sat at the bottom (index.html, 720 block). The rail drawer is now iPad-only.
- Checked at 375 on the local pair: More sheet, client sheet (pick All clients: page switched, node moved back),
  the period menu with its scrim, the card sheet's Brief and Ads tabs.

## Third pass, the same day: Filters, the tab hint, the review viewer and Launch

- **Tasks has a Filters sheet** (phone.js `filtersBtn` / `openFilters`): under 720 the bar keeps the View segment
  and gains one "Filters · N" chip (N = the choices that differ from the defaults); Group by, Only mine and the
  Area chips move into a bottom sheet whose chips click the REAL controls in the hidden bar (tasks.js is
  untouched; the Area chips carry `data-areaf`, not `data-area`). The sheet redraws after each pick so the count
  and the page both follow.
- **The page tabs say when they scroll** (phone.js `segFix`): a `#v2seg` row wider than the screen gets
  `.lxs-fade` (a sticky gradient at its right edge, phone.css) and scrolls the open tab to the middle, so the
  cut "Re..." is gone and the next tab shows a sliver. Both run from one debounced MutationObserver on body.
- **The review viewer** (review-ui.js has its own 900px stack; phone.css adds the phone parts): the 44px rule had
  stretched the colour swatches to 20x44 ovals and the icon buttons to 32x44; now 22px round swatches with a
  coarse-pointer hit area, 40px tools and header buttons, the trailing x hidden (Back closes), Ask for changes
  and Approve share one full row, the stage is capped at 50vh so the Notes panel starts inside the first screen,
  the strip is 92px with 56x70 thumbs.
- **Launch to Meta**: the single window shows the ad as a 200px picture above the form instead of a whole screen;
  a batch row puts the tick, the thumb and "Ad 48-1 · v2 · Still" on one line and the fields full width under them
  (`.lnb-row > div:last-child{display:contents}` under 600). Both windows were checked at 375 with stub payloads
  (no card on the real data has an uploaded version yet; nothing was written to Meta).

## Fourth pass, the same day: the viewer's Notes sheet and the Right now row

- **Notes are a bottom sheet** (phone.js `reviewFix` / `openNotes` / `hostNotes`; phone.css?v=4, phone.js?v=3).
  Under 720 phone.css hides `.rv-side` inside the viewer, the main column fills the screen (the ad takes up to
  `100dvh - 300px`, the strip sits at the bottom), and a "Notes · N" pill (N = the open notes on this version,
  read from the tab's own count) sits sticky at the right end of the strip. The pill, a pin or number tag on the
  ad, and Ask for changes open `#lxSheet` hosting the REAL `.rv-side` node, titled with the ad's label.
  review-ui.js repaints the whole viewer on every change, so the body MutationObserver (the same debounced one
  Filters and segFix use) re-hosts the new node after each paint and the stale copy leaves; the tabs are pinned at
  the top of the sheet, the note box at the bottom (a messages app), and the sheet sits above the viewer
  (`#lxSheet.lxs-notes`, z-index 9700). Closing (x, scrim, swipe, Escape, Back on the viewer, widening past 720)
  puts the node back into `.rv-b`.
- **Two handlers read through the viewer root and had to change.** Enter-to-post: review-ui.js's keydown looks
  for the Post button inside the viewer, so phone.js's capture keydown posts (or sends a reply) when the typing
  happens in the hosted panel; Shift+Enter is still a new line. Reply: the button read its box through the viewer
  root, so review-ui.js now reads it beside the button (`rs.closest('.rv-rbox')`, review-ui.js?v=9 on index.html
  and review.html). Escape closes only the sheet (capture + stopPropagation), never the viewer under it, and
  leaves a box being typed in to review-ui.js, which blurs it.
- **Day check > Right now**: the card's action slot (`.v2h > .find`: `flex:1; min-width:200px`) sat beside the
  title and stacked its two buttons. Under 720 it is a full-width row under the title (it may run under the
  Export icon, which sits on the title row), so Refresh and "What are advertisers saying?" share one row and
  still wrap when they do not fit.
- Checked at 375 with stub payloads (no real card has an uploaded version): the pill count; open; close puts the
  node back; a pin opens the sheet on its note (ringed, scrolled into view); post with Enter (pending, then saved,
  the count 2 to 3); Shift+Enter; Resolve (the count follows, the sheet stays); the Versions tab; a reply by the
  button and by Enter; Ask for changes opens the sheet with the box focused and "Send back"; Escape twice (blur,
  then the sheet); Back with the sheet open (nothing orphaned); the next ad's title and empty state. At 768 the
  viewer stacks as before, there is no pill and a pin highlights in place. Day check, Production and a card's
  Ads tab have no sideways scroll at either width.

## Still open

- The public client link (`review.html`) does not load the phone layer and does not carry `data-ui="v2"`, so
  none of phone.css's viewer rules apply there: on a client's phone it is review-ui.js's own 900px stack. It
  deserves a pass of its own (load phone.css + phone.js there, or fold the phone rules into review-ui.js).
- Not checked on a real device, only the Browser pane at 375 and 768.

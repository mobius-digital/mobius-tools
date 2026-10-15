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

## Fifth pass, the same day: the public client link (review.html)

- **What was wrong.** `review.html` loaded review-ui.js but not phone.css or phone.js, and its `<html>` had no
  `data-ui="v2"`, so none of phone.css's viewer rules applied: on a client's phone the viewer was review-ui.js's
  own 900px stack (34px tools, 18px swatches, a trailing x beside Back, the Notes panel under the strip with the
  whole viewer scrolling).
- **The fix is three lines on review.html, no new rules.** `<html lang="en" data-ui="v2">`, `phone.css?v=5` after
  the page's own `<style>`, `phone.js?v=3` deferred after review-ui.js. The attribute is only the key phone.css
  uses for the viewer block; nothing else on the page reads it (review.html has its own token set, like s.html, and
  every token the sheet and the viewer rules use exists there: surface, surface-2, ink, ink-2, muted, line,
  line-strong, brand-soft; the rest carry fallbacks). phone.js gates on width and on the Locus nodes it finds, so
  More, the client picker, the top-bar scrim, Filters and segFix are inert on this page; reviewFix, openNotes and
  hostNotes run exactly as in Locus. The alternative (re-keying the viewer block on `.rv-scrim`) was rejected: the
  tabs, chips, list and box rules must also match while the panel is hosted in `#lxSheet`, outside the viewer.
- **Why no min-height resets were copied:** index.html's 44px rule does not exist on review.html, so the
  `min-height:0` lines in the viewer block are no-ops there; measured, not assumed (tools 38x40 inside the 359px
  bar exactly as in Locus, swatches 21x22 round with the -11px coarse hit area, header buttons 40px).
- **One phone.css fix for both hosts:** `.lxs-notes-btn{display:none}` above 720 lost to review-ui.js's own
  `.rv-btn{display:inline-flex}` (injected later, equal specificity), so a phone turned sideways kept the pill until
  the next repaint. It is `.rv-strip .lxs-notes-btn` now (phone.css?v=5 on index.html and review.html).
- **Checked at 375 (light and dark) and 768 on the local static server, with a static JSON stub under the page's
  `pf_ah` override (data-URL SVG ads; nothing touched a worker):** the viewer opened from a card: Back reads the
  brand and closes, the x is hidden, Ask for changes + Approve on one row, the ad capped, the strip at the bottom
  (92px, 56x70 thumbs), "Notes · 2" sticky at its end, no sideways scroll on the page or the viewer; the pill opens
  the sheet hosting the real `.rv-side` (title "Ad 48-1", tabs pinned top, the name box and note box pinned bottom,
  z 9700, dark surface in dark mode); Enter posts (pending then saved, the pill 2 to 3, the sheet stays hosted after
  the repaint); x puts the node back into `.rv-b` (hidden, one copy); a pin opens the sheet on its note (ringed,
  inside the first screen); Escape closes only the sheet; Ask for changes opens it with the box focused and "Send
  back", Enter sends the decision; Back with the sheet open leaves no orphan node and no `lxs-open` on body. At 768
  the viewer stacks as before, the side panel is visible, a pin highlights in place, and the pill is hidden even
  before the next repaint. The page's own cards at 375: one column, no sideways scroll, the card buttons 32px (at
  the audit threshold, left alone).

## Sixth pass, the same day: Cole's iPhone screenshots (the pill, the stuck overlay, the grey band, the column pills)

Cole sent two screenshots of Locus on his iPhone (Ice & Gold, card 5). Four complaints, four causes:

- **"Arrow attached · Remove" looked absolutely huge** in the Notes sheet. Cause: the pill's Remove is a
  `<button>`, and index.html's 44px rule stretched it, which stretched the pill around it. Fix in phone.css's
  viewer block: `[data-ui="v2"] .rv-pend button` and `.rv-del .rv-btn` (the Keep it / Delete pair) reset to
  `min-height:0`; the pill itself is one 32px line (`white-space:nowrap`, 12px). Measured at 375 on the review
  stub: pill 151x32, the button 17px, in the sheet. phone.css?v=6 on both hosts.
- **"Open review" hovered over the whole picture while scrolling.** Cause: iOS keeps `:hover` on the last element
  tapped, so `.ps-pv:hover .open{opacity:1}` (prodsheet.js, the sheet's Ads cards) and `.pv:hover .open`
  (review.html's cards) stayed on after a tap. Both rules are now inside `@media (hover:hover)`; focus-visible
  still shows the overlay for the keyboard. Checked: at 375 (hover:none) a hovered card reads opacity 0; on the
  desktop (hover:hover) it reads 1. prodsheet.js?v=12.
- **A grey band at the top of the whole app.** Cause: the two `theme-color` metas were keyed on
  `prefers-color-scheme`, the PHONE's scheme, while Locus picks its own theme from `pf_theme`. Safari paints the
  status-bar band with theme-color, so a dark Locus on a light-mode iPhone got a #F7F7F8 band over a #111113 page.
  Now ONE meta (`#themeColor`) set by `syncThemeColor()` in the head script and again from `paintTheme()` on every
  theme switch. Checked on the gate page: dark reads #111113 with the body at rgb(17,17,19), switching to light
  flips it to #F7F7F8. The installed-app status bar (`apple-mobile-web-app-status-bar-style default`) was left as
  is; if the band is still there on the home-screen app, the next step is `black-translucent` plus a dark top bar,
  not a theme-color change.
- **The Production column pills (Brief / Making / Review / Ready / Live) looked super big.** Same 44px rule on
  `.pd-seg button` (production.js, drawn at 34px). production.js belongs to the board session, so the fix
  (`min-height:0` in its injected CSS) was handed to it rather than made here.

## Seventh pass, the same day: the band came back after a popup; the ask bar looked blurry

Cole, after the sixth pass: the grey band was gone, came back after he opened a popup, and then stayed; when it was
not there, the ask bar looked covered by something at the very top, slightly blurry.

- **The band:** `#v2scrim` (the dark layer behind the side panel and the card sheet) is created by v2.js on the
  first popup and then stays in the page for good, at opacity 0 but still a full-screen fixed layer with a grey
  background. Safari tints the status-bar band from what is fixed at the top edge, so after one popup the band
  stayed. A closed scrim is now `visibility:hidden` (the flip waits for the fade).
- **The blur:** the page uses `viewport-fit=cover`, so it runs under the status bar and the Dynamic Island, where iOS
  blurs what is behind it. index.html pads the top bar with `env(safe-area-inset-top)`, but v2.css's
  `[data-ui="v2"] .topbar{padding:10px 16px 2px}` is more specific and threw it away, so the badge and the ask bar
  sat in that strip. phone.css puts it back under 980, and gives the full-screen panel and the review viewer the
  same top inset (and the viewer the bottom one).
- Checked in headless Chrome over CDP (375, touch, `Emulation.setSafeAreaInsetsOverride` top 59 / bottom 34; the
  Browser pane refused the spare port): top bar padding 69px (10 + 59), panel 59px; the scrim hidden before, visible
  open, fading at 60ms, hidden after. phone.css?v=7 on both hosts.

- **Follow-up, the blur stayed (Cole: grey band gone, blur still there).** His screenshots are the installed
  home-screen app: the status bar sits outside the page (`status-bar-style default`, so the top inset is 0 there and
  the padding above changed nothing for him), and iOS softens the top edge of the page under it with a short blur.
  The top bar started 10px below that edge. In `(display-mode: standalone)` under 980 the first row now starts 24px
  below it; a browser tab keeps 10px. Headless Chrome cannot emulate display-mode, so the rule was checked by
  forcing its declarations on: padding 24px, the ask bar at 24, nothing overlapping. phone.css?v=8. Not seen on the
  phone yet; if it still looks soft, ask for a screenshot of the top at rest and after a scroll.

## Eighth pass, the same day: Ask moves to the bottom on a phone

Cole asked whether the ask bar should be at the top at all. On a phone it was the hardest thing to reach with a thumb
and sat in the blurred top edge. Under 720 now:

- **The top-bar ask bar is hidden** (`.topbar .v2ask{display:none}`), so row 1 is the helper badge and the date and
  attribution pills. The desktop and the iPad keep it.
- **A round Ask button sits at the right end of the tab bar** (`#tbAsk` in index.html, 48px, brand fill, a chat
  bubble with a spark). It is shown exactly when the ask bar would be (`!S.tok`, set in the same place as the ask
  bar), closes any open sheet and calls `AskUI.open()`, which focuses the box.
- **The chat slides UP full screen** (`#ask` translateY, top inset padded, 14px more in the installed app) with its box
  at the bottom. Its header (title, New, Chats, Reports, x) is one 34px row; the 44px rule had wrapped the title and
  made the buttons tall pills.
- Lost on a phone, on purpose: typing in the ask bar to jump to a page or brand. More and the client sheet cover it.
- Checked in headless Chrome at 375 with a faked notch and every API stubbed: the button at 317,724 48x48 beside five
  61px tabs, the ask bar display none, the chat open full screen with the box at y 712 and focused, closed back to
  y 812, light and dark. phone.css?v=9 on both hosts.

## Ninth pass, the same day: Ask is a tab, and the chat is a proper phone sheet

Cole on the eighth pass: "looks fine, a little clunky", and "the chat itself looks bad on mobile". The round button
crammed into a flat full-width bar read as stuck on, and the chat was the desktop side panel stretched to the phone
(the title wrapped, New / Chats / Reports were tall pills, a 13.5px box with an "Enter sends, Shift+Enter" hint, every
answer in a grey bubble). Rebuilt on the pattern of an assistant tab in a native app (Triple Whale's Moby, the ChatGPT
and Claude apps):

- **Ask is the middle tab** (Home, Ads, Ask, Work, Store, More): drawn like the others, the helper's face as its icon,
  lit while the chat is open, the face switching to "thinking" while it works. The five tabs Cole picked keep their
  places; Ask sits between Ads and Work.
- **The chat is a large sheet from the bottom**: rounded top, a grab handle, swipe the header down to close, a sliver
  of the page above it, the iOS sheet curve. Its height follows the visual viewport (phone.js sets `--vvh` / `--vvt`),
  so the box stays above the keyboard; the safe-area padding under the box drops while the keyboard is up.
- **Header**: the helper, "Ask Locus", "About <brand>", then three icons: new chat, More (a bottom sheet with Past chats,
  Reports, New chat) and close.
- **Empty chat**: the helper, "What do you want to know?", one line on what it can answer, then "Try asking" with four
  questions for the page you are on (index.html's `askList()`, the same list the top-bar ask bar used), near the thumb.
  Tapping one asks it.
- **Conversation**: your questions are brand bubbles on the right, answers are plain 15.5px text, cards (proposals,
  reports, files) keep their boxes, the working line is a soft grey card.
- **Box**: a 16px pill (iOS zooms the page on anything smaller), "Ask Locus anything", `enterkeyhint="send"`, a round
  send arrow inside the pill that lights only when there is something to send.
- **ask-ui.js is untouched** (Ledger and Supply share it): phone.js adds the pieces inside #ask (`.lxa-*`) and phone.css
  hides the originals under 720; above 720 the added pieces are hidden and the panel is as before.
- Checked in headless Chrome at 375 with a faked notch and stubbed APIs, light and dark: six 60px tabs with the labels
  on one line, the sheet at y 69 (10px under the notch), the empty state with four questions and the box focused, typed
  then sent, the working card, the answer, the More sheet over the chat, closed back down with the tab unlit, no
  sideways scroll. Not on a real iPhone (keyboard behaviour especially). phone.css?v=10, phone.js?v=4.

## Still open

- Not checked on a real device, only the Browser pane at 375 and 768.

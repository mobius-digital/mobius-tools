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

## Still open

- Page tabs (`#v2seg`) scroll sideways on a phone with no hint that more exist (Reports cut to "Re").
- The Tasks filter bar is five rows of chips at 375; a single "Filters" sheet like Production's would be tighter.
- The Day check "Right now" card stacks its two buttons full width; fine, but a row of two would read faster.

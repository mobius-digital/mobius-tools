/* Black Friday > War Room (v3, one page). Shared by the agency page (a-black-friday/war-room.js, every brand) and the
   brand page (black-friday/war-room.js, one brand). The old Pace tab is folded in (its route is not listed, so the
   router sends it here). The plan table's "Open plan" opens the brand plan page (black-friday/plan, a route that is not
   a tab). The math is in ../_warcall.js; the client card is
   in ./_card.js.

   Top to bottom: the page help and one quiet toolbar (check-in time, Refresh, Check now, exports), the pace hero
   (sales so far against the goal, store MER against target, ad spend, the season timeline, today by the hour),
   Needs your yes (every pending decision, naming the campaign and the platform), one identical card per brand
   (decision, three store MER tiles, today by the hour, the campaigns table), then the plan as a table.

   Every live campaign gets its own call from three windows (Since last check-in, Today, This week), on its own ROAS
   (Triple Whale attributed, last click) against the campaign ROAS line (the brand's goal ROAS holds; break-even ROAS
   from the record, else goal ROAS / 1.25), with the store MER as the gate. MER is the whole store only.

   Reads (team, one at a time, never in parallel):
     ah       GET /api/standing                              the latest check-in (again every 10 minutes while visible)
     profit   GET /api/season?act=all|<id>                   answers.checkin_hours per brand (the check-in rhythm)
     ah       GET /api/activities?act=all|<id>&from=&limit=  the last budget change per campaign, and what we changed
     ah       GET /api/brands                                goal ROAS (target_roas) per brand, when the record has none
     ah       GET /api/standing?slot=<earlier>               the previous check-in, walked back hour by hour (max 12,
                                                             cached in sessionStorage by slot), after the first paint
     profit   GET /api/season/war?act=all                    the plan per brand (agency view), after the earlier
                                                             check-ins are read (one run at a time; a newer run stops it)
     profit   GET /api/season/war?act=<id>&live=1            today by the hour and the brand's plan and phases, after
                                                             that, one brand after another; again on Refresh and on a new
                                                             check-in. With no check-in (or a brand outside it, or a
                                                             failed /api/standing) the page still draws the pace (brand
                                                             view) and the plan from these reads.
     profit   GET /api/hub/paid?platform=meta&act=<id>&model=fullFirstClick&cmp=none&from=<Monday>&to=<today>
                                                             the full picture per campaign, only when a campaign panel
                                                             opens, one request per brand per check-in (cached)
     and when a campaign row is opened in place (./_tree.js, one at a time, cached per brand): ah /api/meta/live,
     profit /api/hub/paid (lastPlatformClick, this week), ah /api/buyer-list (the ad calls), ah /api/ad-creatives
   A client (brand view only) reads only GET /api/season/war?act=<id>&live=1: the pace hero and the plan, no calls.
   Exports, all in the browser (./_export.js): the client card and the whole board as PNG or PDF.
   Writes (team only, each after a tap; sample mode never calls one). A call past its shelf life (over 6 hours, or made
   on another day in Central; _warcall.js callOutOfDate) has no Approve at all, only "Set budget" typed by hand:
     ah       POST /api/meta/write {act, kind:'budget', level:'campaign', object, amount, reason, client_why, dry:true}
              then the same body without dry, plus expect {daily_budget} from the dry run (and big:true over 50%)
     ah       POST /api/standing/approve {slot, act}         instead of the write, when the page's move equals the
                                                             check-in's own (same campaign and amount), so Slack fills in
     ah       POST /api/meta/undo {act, write}               Undo (through the shared confirm sheet)
     profit   PUT  /api/season/answer {act, key:'checkin_hours', value}   the brand's check-in rhythm
     ah       POST /api/standing/run {}                      Check now (a fresh record for every brand; no Slack)
     ah       POST /api/standing/send {act, slot}            Send the client update (one brand, owner only; a 404 with
                                                             no error means an older server without the route)
   And one read for the send sheet only: ah GET /api/standing/card.png?act=&slot=  the exact picture card that is sent.
     profit   POST /api/snapshot {act, kind:'card', title, html, css, days:30}   the client card's public link */

import { APP_NAME, OWNER_FIRST, workers, token } from '../../config.js';
import { h, put, money, x, pill, button, card, empty, sheet, toast, addStyles, segmented, platformChip, lineChart, legend, table, tipShow, tipHide, tipRow, staleStamp, sourceLine } from '../../kit.js';
import { treeReader, campaignInside, onSwitch, writeSheet, treeCss, stateOf, stateNote } from './_tree.js';
import { defined, defLabel, pageHelp, glossaryFor } from '../../defs.js';
import { fixture } from '../../data.js';
import { undoSheet } from '../meta/_write.js';
import { forgetWaiting } from '../../bell.js';
import {
  CALL_WORD, CADENCE_CHOICES, MAX_STEP, MIN_BUDGET, READ_HOURS,
  BE_ROAS_DIV, brandCalls, cadenceOf, central, clientChanges, clientWhy, clockCT, dayLabel, hourWord, isDue, matchesCheckin,
  nextDue, sinceBasis, slotAdd, slotDate, slotDiff, slotHour, agoWords, parseBudget, stepTo, cadenceSuggest, mondayOf,
  callOutOfDate, asOfWords, OUT_OF_DATE,
} from '../_warcall.js';
import { cardHtml, CARD_CSS, downloadCard, copyCard, downloadCardPdf, NONE as NO_CHANGES } from './_card.js';
import { boardCanvas, copyCanvas, downloadCanvas, downloadPdf } from './_export.js';

const CSS = `
.wr3{display:grid;gap:var(--sp-6);min-width:0}
/* this page says when it checked in its own toolbar, so the shell's "updated" stamp is hidden and the head sits closer */
.lx-page:has(.wr3){row-gap:16px}
.lx-page:has(.wr3) .lx-head-tools{display:none}
.wr3-menu{min-width:200px}
.wr3-menu .lx-item[disabled]{opacity:.5;cursor:default}
.wr3-bar{display:flex;flex-wrap:wrap;align-items:center;gap:8px 12px;min-width:0}
.wr3-bar .when{font-size:13px;color:var(--muted);font-variant-numeric:tabular-nums}
.wr3-bar .when b{color:var(--ink);font-weight:600}
.wr3-bar .sp{flex:1}
.wr3-bar .btns{display:flex;flex-wrap:wrap;gap:6px;align-items:center}
.wr3-bar .lx-btn{min-height:34px}
.wr3-old{font-size:12.5px;color:var(--muted);text-decoration:none}
.wr3-old:hover,.wr3-old:focus-visible{color:var(--ink);text-decoration:underline;text-underline-offset:3px}
.wr3-amber{margin:0;color:var(--warn);background:var(--warn-bg);border-radius:10px;padding:6px 10px;font-size:12.5px;line-height:1.45}
.wr3-quiet{margin:0;font-size:13px;color:var(--muted);line-height:1.5}
/* a plan cell's second line, shown only on a phone where its own column is hidden */
.wr3-fold{display:none;font-size:11.5px;font-weight:400;color:var(--muted);margin-top:2px}
@media (max-width:759px){.wr3-fold{display:block}}
.wr3-lab{font-size:12.5px;color:var(--muted);line-height:1.35}
.wr3-num{font-variant-numeric:tabular-nums}
.good-t{color:var(--good)}.bad-t{color:var(--bad)}.warn-t{color:var(--warn)}.off-t{color:var(--muted)}
/* the pace hero */
.wr3-hero{display:grid;gap:var(--sp-6)}
.wr3-hk{display:grid;grid-template-columns:minmax(0,1.5fr) minmax(0,1fr) minmax(0,1fr);gap:var(--sp-6);align-items:start}
.wr3-hk.lean{grid-template-columns:minmax(0,1fr)}
.wr3-hk>div{display:grid;gap:6px;min-width:0;align-content:start}
.wr3-hk .big .lx-hero-num{line-height:1}
/* which brands count: plain words after the percent (dotted, its meaning on hover), never a chip */
.wr3-scope{display:inline;font-size:var(--fs-small,12.5px);color:var(--muted);white-space:nowrap;margin-left:6px}
.wr3-hk .big{display:flex;align-items:baseline;gap:10px;flex-wrap:wrap}
.wr3-hk .scope{font-size:12px;color:var(--muted)}
.wr3-hk .of{font-size:13.5px;color:var(--muted);font-variant-numeric:tabular-nums}
.wr3-hk .mid{font-size:var(--num-l);font-weight:600;letter-spacing:-.035em;line-height:1.1;font-variant-numeric:tabular-nums}
.wr3-hk .mid small{font-size:13px;font-weight:400;letter-spacing:0;color:var(--muted);margin-left:6px}
.wr3-prog{position:relative;height:8px;border-radius:999px;background:var(--bg-sunk);overflow:hidden}
.wr3-prog i{position:absolute;left:0;top:0;bottom:0;width:var(--v,0%);border-radius:999px;background:var(--grad)}
.wr3-ph{display:grid;grid-template-columns:var(--cols);gap:4px;min-width:0}
.wr3-ph>button{display:grid;gap:6px;min-width:0;padding:4px 2px;border:0;background:none;text-align:left;cursor:default;border-radius:var(--r-chip,6px)}
.wr3-ph>button:hover,.wr3-ph>button:focus-visible{background:var(--row-hover)}
.wr3-ph i{display:block;height:6px;border-radius:999px;background:var(--bg-sunk);position:relative}
.wr3-ph .done i{background:var(--faint);opacity:.45}
.wr3-ph .now i::after{content:"";position:absolute;left:0;top:0;bottom:0;width:var(--v,50%);background:var(--ink);border-radius:999px}
.wr3-ph .now i::before{content:"";position:absolute;left:var(--v,50%);top:-4px;bottom:-4px;width:2px;margin-left:-1px;background:var(--ink);box-shadow:0 0 0 1.5px var(--surface);z-index:1}
.wr3-ph b,.wr3-ph span{line-height:1.3;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.wr3-ph b{font-size:13.5px;font-weight:500;color:var(--muted)}
.wr3-ph .now b{color:var(--ink);font-weight:600}
.wr3-ph span{font-size:12px;color:var(--muted);font-variant-numeric:tabular-nums}
.wr3-ch{display:grid;gap:8px;min-width:0}
.wr3-ch .lx-chart-h{display:flex;flex-wrap:wrap;align-items:baseline;gap:6px 14px}
.wr3-ch h3{font-size:15px;font-weight:600;letter-spacing:-.01em;margin:0}
/* calls that need a yes (agency view): one line per call, the brand opens its card on this page */
.wr3-need{display:grid}
.wr3-ask{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:8px 16px;align-items:center;padding:12px 0;border-top:1px solid var(--line);min-width:0}
.wr3-ask:first-child{border-top:0;padding-top:4px}
.wr3-ask .txt{display:grid;gap:3px;min-width:0}
.wr3-ask .br,.wr3-jump{border:0;background:none;padding:0;font:inherit;font-size:12.5px;font-weight:600;color:var(--muted);cursor:pointer;text-align:left;justify-self:start}
.wr3-ask .br:hover,.wr3-jump:hover{color:var(--ink);text-decoration:underline;text-underline-offset:3px}
.wr3-ask .dec{font-size:15px;font-weight:600;letter-spacing:-.01em;overflow-wrap:anywhere}
.wr3-ask .why{margin:0;font-size:13px;color:var(--ink-2);line-height:1.5}
.wr3-ask.flash,.wr3-b.flash{animation:wr3-flash 1.6s var(--ease)}
@keyframes wr3-flash{0%,40%{box-shadow:0 0 0 3px var(--warn-bg)}100%{box-shadow:0 0 0 0 transparent}}
.wr3-chips{display:flex;flex-wrap:wrap;gap:4px 14px;font-size:12.5px;color:var(--muted);font-variant-numeric:tabular-nums}
.wr3-chips b{color:var(--ink);font-weight:600;margin-left:4px}
.wr3-act{display:flex;flex-wrap:wrap;gap:8px;align-items:center}
.wr3-act .lx-btn{min-height:38px}
/* brand cards: one long card per brand, the same layout for every brand */
.wr3-grid{display:grid;grid-template-columns:minmax(0,1fr);gap:var(--gap-5,24px);align-items:start}
.wr3-b{position:relative;display:grid;gap:var(--gap-4,16px);min-width:0;container:wr3b / inline-size;scroll-margin-top:16px}
.wr3-hd{display:flex;flex-wrap:wrap;align-items:center;gap:8px 12px;min-width:0}
.wr3-hd h3{margin:0;font-size:var(--fs-section);font-weight:600;letter-spacing:-.015em;line-height:var(--lh-head);min-width:0;overflow-wrap:anywhere}
.wr3-hd .sp{flex:1 1 0}
.wr3-meta{display:flex;flex-wrap:wrap;align-items:center;gap:6px 14px;font-size:var(--fs-small);color:var(--muted);font-variant-numeric:tabular-nums}
.wr3-meta b{color:var(--ink);font-weight:600}
.wr3-chip{display:inline-flex;align-items:center;gap:6px;min-height:28px;padding:0 10px;border-radius:var(--r-btn);border:1px solid var(--line-strong);background:var(--surface);font:inherit;font-size:12.5px;color:var(--ink-2);cursor:pointer;white-space:nowrap}
.wr3-chip:hover{background:var(--row-hover)}
.wr3-chip[disabled]{cursor:default}
.lx-btn.wr3-stale[disabled]{opacity:.6;cursor:not-allowed;white-space:normal;text-align:left}
.wr3-tile.stale{opacity:.6}
.wr3-chip.due{border-color:transparent;background:var(--warn-bg);color:var(--warn)}
.wr3-body{display:grid;grid-template-columns:minmax(0,1fr);gap:var(--gap-4,16px);min-width:0}
@container wr3b (min-width:860px){.wr3-body.two{grid-template-columns:minmax(0,3fr) minmax(0,2fr);align-items:start}}
/* the store strip: Since last check-in | Today | This week, always in that order, the same layout in each */
.wr3-strip{display:grid;gap:6px;min-width:0}
.wr3-tiles{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;align-items:stretch}
.wr3-tile{background:var(--surface-2);border-radius:var(--r-tbl);padding:12px 14px;display:grid;gap:3px;align-content:start;min-width:0}
.wr3-tile .hd{display:flex;align-items:baseline;justify-content:space-between;gap:8px;min-width:0}
.wr3-tile .hd b{font-size:13px;font-weight:600;color:var(--ink);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-width:0}
.wr3-tile .hd small{font-size:12px;color:var(--muted);white-space:nowrap}
.wr3-tile .mer{font-size:var(--num-l);font-weight:600;letter-spacing:-.03em;line-height:1.15;font-variant-numeric:tabular-nums;margin:2px 0 4px}
.wr3-tile .mer small{font-size:12px;font-weight:400;letter-spacing:0;color:var(--muted);margin-left:6px}
.wr3-tile .ln{display:flex;justify-content:space-between;gap:8px;font-size:13px;color:var(--ink);font-variant-numeric:tabular-nums;white-space:nowrap;min-width:0}
.wr3-tile .ln span:first-child{color:var(--muted)}
.wr3-tile .gray{font-size:12px;color:var(--muted);margin-top:2px;line-height:1.35}
.wr3-spark{display:grid;gap:6px;min-width:0}
.wr3-spark .lx-chart-h{display:flex;flex-wrap:wrap;align-items:baseline;gap:4px 12px}
/* the call line under the strip: each call with its own real buttons */
.wr3-calls{display:grid;border-radius:var(--r-tbl);background:var(--surface-2);padding:2px 14px;min-width:0}
.wr3-call{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:8px 16px;align-items:center;padding:10px 0;border-top:1px solid var(--line);min-width:0}
.wr3-call:first-child{border-top:0}
.wr3-call .txt{display:grid;gap:3px;min-width:0}
.wr3-call .eb{font-size:11.5px;font-weight:600;color:var(--muted)}
.wr3-call .dec{font-size:15px;font-weight:600;letter-spacing:-.01em;overflow-wrap:anywhere}
.wr3-call .dec.dim{color:var(--muted);font-weight:500;font-size:14px}
.wr3-call .why{margin:0;font-size:13px;color:var(--ink-2);line-height:1.5}
.wr3-call.done .dec{color:var(--good)}
.wr3-amber{margin:0;color:var(--warn);background:var(--warn-bg);border-radius:var(--r-btn);padding:8px 12px;font-size:12.5px;line-height:1.45}
/* the campaigns: a row per campaign that opens in place to its ad sets and ads */
.wr3-cl{--cg:minmax(0,1fr) 84px 80px 66px 66px 66px 124px 156px;display:grid;border:1px solid var(--line);border-radius:var(--r-tbl);overflow:hidden;container:wr3cl / inline-size;min-width:0;background:var(--surface)}
.wr3-cr{display:grid;grid-template-columns:var(--cg);gap:10px;align-items:center;padding:0 14px 0 6px;min-height:54px;border-top:1px solid var(--line);font-size:var(--fs-table);min-width:0}
.wr3-cr.hd{min-height:0;padding-top:8px;padding-bottom:6px;font-size:var(--fs-colhead);font-weight:600;color:var(--muted);border-top:0;align-items:end}
.wr3-cr.hd>span{line-height:1.25;min-width:0}
.wr3-cr.grp{min-height:0;padding-top:8px;padding-bottom:0;border-top:0;font-size:11.5px;color:var(--faint);font-weight:600}
.wr3-cr.grp>span{grid-column:4 / span 3;text-align:center;border-bottom:1px solid var(--line);padding-bottom:4px;line-height:1.3}
.wr3-cr.grp .short{display:none}
.wr3-cn small .bud-in,.wr3-cn small .spent-in{display:none}
.wr3-cr .c-call .lx-pill{height:auto;min-height:22px;padding:3px 8px;white-space:normal;line-height:1.25;text-align:left}
.wr3-cr.row:hover{background:var(--row-hover)}
.wr3-cr.row.open{background:var(--row-hover)}
.wr3-cr.row.sel{box-shadow:inset 3px 0 0 var(--brand)}
.wr3-cn{display:flex;align-items:center;gap:6px;min-width:0}
.wr3-exp{flex:none;width:30px;height:30px;border-radius:var(--r-chip);border:0;background:none;display:grid;place-items:center;cursor:pointer;color:var(--muted)}
.wr3-exp:hover{background:var(--bg-sunk);color:var(--ink)}
.wr3-exp i{width:7px;height:7px;border-right:1.5px solid currentColor;border-bottom:1.5px solid currentColor;transform:rotate(-45deg);transition:transform .12s;margin-left:-2px}
.wr3-cr.open .wr3-exp i{transform:rotate(45deg);margin:-3px 0 0}
.wr3-cn .tx{display:grid;gap:1px;min-width:0;border:0;background:none;padding:6px 0;font:inherit;color:inherit;text-align:left;cursor:pointer}
.wr3-cn .tx b{font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.wr3-cn .tx:hover b{text-decoration:underline;text-underline-offset:3px}
.wr3-cn small{font-size:12px;color:var(--muted);display:flex;flex-wrap:wrap;gap:2px 8px;align-items:center}
.wr3-cn .warnrow{color:var(--warn)}
.wr3-cn .sub{display:none}
.wr3-cr .r{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.wr3-cr .c-call{display:flex;min-width:0}
.wr3-cbtn{border:0;font:inherit;font-size:var(--fs-meta,12px);font-weight:500;cursor:pointer;max-width:100%}
.wr3-cbtn:hover,.wr3-cbtn:focus-visible{filter:brightness(.95)}
.wr3-cr .c-act{display:flex;flex-wrap:wrap;justify-content:flex-end;align-items:center;gap:4px 10px;min-width:0}
.wr3-cl-foot{padding:8px 14px 10px;font-size:12px;color:var(--faint);border-top:1px solid var(--line);line-height:1.45}
@container wr3cl (max-width:880px){
  .wr3-cr{grid-template-columns:minmax(0,1fr) 72px 60px 60px 60px 112px 156px}
  .wr3-cr>.c-bud{display:none}
  .wr3-cn small .bud-in{display:inline}
  .wr3-cr.grp>span{grid-column:3 / span 3}
}
@container wr3cl (max-width:720px){
  .wr3-cr{grid-template-columns:minmax(0,1fr) 58px 58px 58px 104px 156px;gap:8px}
  .wr3-cr>.c-spent{display:none}
  .wr3-cn small .spent-in{display:inline}
  .wr3-cr.grp>span{grid-column:2 / span 3}
  .wr3-cr.grp .full{display:none}
  .wr3-cr.grp .short{display:inline}
}
@container wr3cl (max-width:500px){
  .wr3-cr{grid-template-columns:minmax(0,1fr) auto}
  .wr3-cr{padding:6px 12px 6px 4px;gap:4px 8px}
  .wr3-cr.hd,.wr3-cr.grp{display:none}
  .wr3-cr>.c-bud,.wr3-cr>.c-spent,.wr3-cr>.c-since,.wr3-cr>.c-today,.wr3-cr>.c-week{display:none}
  .wr3-cn small .bud-in,.wr3-cn small .spent-in{display:none}
  .wr3-cn .sub{display:block;font-variant-numeric:tabular-nums}
  .wr3-cr.row .c-act{grid-column:1 / -1;justify-content:flex-end;padding:0 0 6px 36px}
}
.wr3-foot{display:flex;flex-wrap:wrap;gap:8px;align-items:center}
.wr3-foot .lx-btn{min-height:38px}
.wr3-foot .sp{flex:1}
.wr3-quiet{margin:0;font-size:13px;color:var(--muted);line-height:1.5}
/* the plan table: a brand name is a button that opens that brand's card on this page */
.wr3-plan .name button{border:0;background:none;padding:0;font:inherit;font-weight:600;color:var(--ink);cursor:pointer;text-align:left}
.wr3-plan .name button:hover{text-decoration:underline;text-underline-offset:3px}
/* sheets */
.wr3-sh{display:grid;gap:var(--sp-4)}
.wr3-sh .call{display:grid;gap:4px}
.wr3-sh .call b{font-size:17px;letter-spacing:-.015em}
.wr3-sh h4{margin:0;font-size:14px;font-weight:600;letter-spacing:-.01em}
.wr3-sh dl{display:grid;grid-template-columns:minmax(0,1.2fr) minmax(0,1fr);gap:8px 14px;margin:0;font-size:13.5px}
.wr3-sh dt{color:var(--muted);overflow-wrap:anywhere}
.wr3-sh dd{margin:0;font-weight:600;font-variant-numeric:tabular-nums;overflow-wrap:anywhere;text-align:right}
.wr3-sh dd.na{font-weight:400;color:var(--muted)}
.wr3-sh p{margin:0;font-size:13.5px;line-height:1.5;color:var(--ink-2)}
.wr3-sh p.dim{color:var(--muted);font-size:12.5px}
.wr3-sh label{display:grid;gap:6px;font-size:13px;color:var(--muted)}
.wr3-sh .lx-input{font-size:15px;color:var(--ink)}
.wr3-sh textarea.lx-input{min-height:72px}
.wr3-sh .tick{display:flex;gap:10px;align-items:center;color:var(--ink);min-height:44px}
.wr3-sh .tick input{width:22px;height:22px}
.wr3-sh .btns{display:flex;flex-wrap:wrap;gap:8px}
.wr3-sh .btns .lx-btn{min-height:48px;flex:1 1 180px}
.wr3-sh .err{background:var(--bad-bg);color:var(--bad);border-radius:12px;padding:10px 12px;font-size:13.5px;line-height:1.45}
.wr3-sh .ok{background:var(--good-bg);color:var(--good);border-radius:12px;padding:10px 12px;font-size:13.5px;line-height:1.45}
.wr3-sh .info{background:var(--surface-2);color:var(--ink-2);border-radius:12px;padding:10px 12px;font-size:13.5px;line-height:1.45}
.wr3-sh .hint{font-size:12.5px;color:var(--muted)}
.wr3-sh .sec{display:grid;gap:10px;border-top:1px solid var(--line);padding-top:var(--sp-4)}
.wr3-fun{display:grid;gap:8px}
.wr3-fun>div{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:2px 10px;align-items:baseline;font-size:13px}
.wr3-fun>div>i{grid-column:1/-1;height:10px;border-radius:999px;background:var(--bg-sunk);position:relative;overflow:hidden;display:block}
.wr3-fun>div>i::after{content:"";position:absolute;left:0;top:0;bottom:0;width:var(--v,0%);border-radius:999px;background:var(--slate)}
.wr3-fun>div:last-child>i::after{background:var(--ink)}
.wr3-fun b{font-variant-numeric:tabular-nums;font-weight:600}
.wr3-fun small{color:var(--muted);font-size:11.5px;margin-left:6px}
.wr3-msg{white-space:pre-line;background:var(--surface-2);border-radius:12px;padding:12px 14px;font-size:13.5px;line-height:1.5;color:var(--ink)}
.wr3-cu{display:grid;gap:var(--sp-4);min-width:0}
.wr3-cu .wcc{max-width:100%}
@media (max-width:900px){.wr3-hk{grid-template-columns:1fr 1fr}.wr3-hk>:first-child{grid-column:1/-1}}
@media (max-width:759px){
  .wr3-bar .btns{width:100%}
  .wr3-bar .btns .lx-btn{flex:1 1 auto;min-height:44px}
  .wr3-act .lx-btn,.wr3-foot .lx-btn{flex:1 1 auto;min-height:44px}
  .wr3-ask,.wr3-call{grid-template-columns:minmax(0,1fr)}
  .wr3-ph{grid-template-columns:1fr 1fr;gap:12px 10px}
  .wr3-hk .mid{font-size:26px}
  .wr3-hd .sp{display:none}
  .wr3-meta{width:100%}
}
@media (max-width:560px){
  .wr3-tiles{grid-template-columns:1fr}
  .wr3-tile{grid-template-columns:auto minmax(0,1fr);column-gap:18px;align-items:center}
  .wr3-tile .hd{grid-column:1/-1}
  .wr3-tile .ln,.wr3-tile .gray{grid-column:2}
  .wr3-tile .mer{grid-column:1;grid-row:2/span 3;min-width:84px}
  .wr3-sh dl{grid-template-columns:minmax(0,1fr) auto}
}`;

const ok = n => n != null && isFinite(n);
const SAMPLE_MSG = 'Sample: nothing was changed';
const LIGHT = { green: ['good', 'Store MER over goal'], amber: ['warn', 'Store MER not clear'], red: ['bad', 'Store MER under break-even'] };
const CALL_TONE = { raise50: 'good', raise25: 'good', cut: 'bad', putback: 'bad', hold: '' };
const CALL_KEY = { raise50: 'call_raise', raise25: 'call_raise', cut: 'call_cut', putback: 'call_cut', hold: 'call_hold' };
const fx = v => ok(v) ? v.toFixed(2) + 'x' : 'n/a';
const usd = v => ok(v) ? money(v) : 'n/a';
const PLATFORM = 'Meta';           // every campaign in the check-in record is a Meta campaign
const SEND_TIMEOUT = 20e3;

/* The season's phases, for the agency view (a brand's own phases come from its plan read). */
const SEASON = [
  { name: 'Early Black Friday', start: '2026-11-01', end: '2026-11-25', weight: 3 },
  { name: 'Black Friday', start: '2026-11-26', end: '2026-11-29', weight: 4 },
  { name: 'Cyber Monday', start: '2026-11-30', end: '2026-11-30', weight: 2.4 },
  { name: 'Holiday', start: '2026-12-01', end: '2026-12-17', weight: 3 },
];
const daysBetween = (a, b) => Math.round((Date.parse(b + 'T12:00:00Z') - Date.parse(a + 'T12:00:00Z')) / 864e5);
const md = ymd => dayLabel(ymd).replace(/^\w+ /, '');

/** Who may tap: the team, never a client or a read only viewer. The worker refuses viewers too. */
export function canWrite(ctx) {
  const me = ctx.me || {};
  return !ctx.isClient && me.role !== 'viewer' && me.access !== 'viewer' && !me.viewer;
}
const oneBrand = ctx => (ctx.view === 'brand' && ctx.brand ? ctx.brand.id : null);
const errText = e => (e && e.message) || 'The server did not answer.';
const STEP_PCT = { raise50: 0.5, raise25: 0.25, cut: -0.25 };

/** The last day of Change Log rows for one brand or all (team only). */
async function readActs(ctx, one) {
  const from = new Date(Date.now() - 24 * 3600e3).toISOString().slice(0, 19);
  const a = await ctx.api(`/api/activities?act=${encodeURIComponent(one || 'all')}&from=${from}&limit=500`, { worker: 'ah', signal: ctx.signal });
  return (a && a.rows) || [];
}

/** Goal ROAS (target_roas) and break-even ROAS per brand from the brand list (team only). Throws when it cannot read. */
async function readGoals(ctx) {
  const bl = await ctx.api('/api/brands', { worker: 'ah', signal: ctx.signal });
  const goals = {};
  for (const b of (bl && bl.brands) || []) goals[b.id] = { target_roas: +b.target_roas > 0 ? +b.target_roas : null, be_roas: +(b.be_roas ?? b.break_even_roas) > 0 ? +(b.be_roas ?? b.break_even_roas) : null };
  return goals;
}

/* ---------- reads ---------- */
const SS = 'wr2:rec:';
function cacheGet(slot) { try { const v = sessionStorage.getItem(SS + slot); return v == null ? undefined : JSON.parse(v); } catch { return undefined; } }
function cachePut(slot, rec) { try { sessionStorage.setItem(SS + slot, JSON.stringify(rec)); } catch {} }

/** The first read: the latest check-in, the cadence answers and the last day of changes, one after another.
    A client reads only the brand's plan and today by the hour. */
export async function readStanding(ctx) {
  const one = oneBrand(ctx);
  if (ctx.sample) {
    const f = await fixture('a-black-friday/_sample/war-room.json');
    const slot = f.latest;
    if (ctx.isClient) return { sample: f, client: true, war: one ? (f.war_live || {})[one] || null : null, fetched_at: Date.now() };
    return { sample: f, standing: f.records[slot] || null, answers: f.answers || {}, acts: f.activities || [], goals: f.goals || {}, fetched_at: Date.now() };
  }
  if (ctx.isClient) {
    if (!one) return { client: true, war: null, fetched_at: Date.now() };
    const war = await ctx.api('/api/season/war?act=' + encodeURIComponent(one) + '&live=1', { signal: ctx.signal });
    return { client: true, war: war || null, fetched_at: Date.now() };
  }
  /* a failed check-in read is not a page error: the pace and the plan still come from the plan read (draw falls back) */
  let r = null, standingErr = '';
  try { r = await ctx.api('/api/standing', { worker: 'ah', signal: ctx.signal }); }
  catch (e) { if (e && e.name === 'AbortError') throw e; standingErr = errText(e); }
  const standing = (r && r.standing) || null;
  const out = { standing, answers: {}, acts: [], goals: {}, fetched_at: Date.now(), ...(standingErr ? { error: 'The check-in did not load: ' + standingErr } : {}) };
  if (!standing) return out;
  try {
    const s = await ctx.api('/api/season?act=' + encodeURIComponent(one || 'all'), { signal: ctx.signal });
    for (const a of (s && s.accounts) || []) out.answers[a.act_id] = a.answers || {};
  } catch (e) { if (e && e.name === 'AbortError') throw e; out.season_error = errText(e); }
  try {
    out.acts = await readActs(ctx, one);
  } catch (e) { if (e && e.name === 'AbortError') throw e; out.acts_error = errText(e); }
  /* the campaign ROAS line: goal ROAS from the brand list, used when the check-in record carries none */
  try { out.goals = await readGoals(ctx); }
  catch (e) { if (e && e.name === 'AbortError') throw e; out.goals_error = errText(e); }
  return out;
}

/* ---------- small shared drawing parts ---------- */
/** The hours of one war read: [{ hour, sales, spend }] for 0..23. */
const hoursOf = w => ((w && w.live && Array.isArray(w.live.hours)) ? w.live.hours : []);
/** Sum the hours of several reads, cut at the last hour with sales or spend. null when there is nothing. */
function hourSeries(list) {
  const sales = Array(24).fill(0), spend = Array(24).fill(0);
  let last = -1;
  for (const w of list) for (const r of hoursOf(w)) {
    const k = +r.hour; if (!(k >= 0 && k < 24)) continue;
    sales[k] += +r.sales || 0; spend[k] += +r.spend || 0;
    if ((+r.sales || 0) > 0 || (+r.spend || 0) > 0) last = Math.max(last, k);
  }
  if (last < 0) return null;
  return { sales: sales.slice(0, last + 1), spend: spend.slice(0, last + 1) };
}
/** Today by the hour: sales as columns, ad spend as a line, a bubble per hour with both and the hour's MER. */
function hourChart(hs, { height = 240, phoneHeight = 200, axis = true, label = 'Sales and ad spend by the hour today, Central time', ticks, windowLabel } = {}) {
  const n = hs.sales.length;
  const labels = Array.from({ length: n }, (_, i) => hourWord(i));
  const tip = i => [h('div', { class: 'lx-tip-h' }, `${hourWord(i)} to ${hourWord(i + 1)} CT`),
    tipRow('lead', 'Sales', money(hs.sales[i] || 0)), tipRow('slate', 'Ad spend', money(hs.spend[i] || 0)),
    tipRow(null, 'Store MER this hour', hs.spend[i] > 0 ? fx(hs.sales[i] / hs.spend[i]) : 'n/a')];
  return lineChart({
    series: [{ name: 'Sales', type: 'bar', tone: 'brand', values: hs.sales }, { name: 'Ad spend', values: hs.spend, end: false }],
    labels, ticks, slots: true, height, phoneHeight, axis, barWidth: axis ? 22 : 10, yTicks: axis ? undefined : 2, topLabel: !axis, endLabels: false, fill: false, label, windowLabel,
    format: v => money(v, { compact: true }), tooltip: tip,
  });
}
/** The legend for today by the hour; a series with nothing in it today is left out. */
const hourLegend = hs => {
  const has = k => !hs || (hs[k] || []).some(v => +v > 0);
  return legend([has('sales') ? { name: 'Sales', square: true, color: 'var(--brand)' } : null, has('spend') ? { name: 'Ad spend' } : null]);
};

/** The season timeline. A phase shows its dates and offer in the bubble (hover, focus or tap). */
function phaseStrip(phases, today) {
  if (!phases || !phases.length) return null;
  let lit = false;
  const list = phases.map(p => {
    const range = p.start === p.end ? md(p.start) : `${md(p.start)} to ${md(p.end)}`;
    if (today > p.end) return { ...p, state: 'done', sub: 'Done' };
    if (today >= p.start && !lit) {
      lit = true;
      const n = daysBetween(p.start, p.end) + 1, d = daysBetween(p.start, today) + 1;
      return { ...p, state: 'now', progress: Math.min(1, (d - 0.5) / n), sub: n > 1 ? `Today, day ${d} of ${n}` : 'Today' , range };
    }
    return { ...p, state: '', sub: range, range };
  }).map(p => ({ ...p, range: p.range || (p.start === p.end ? md(p.start) : `${md(p.start)} to ${md(p.end)}`) }));
  const cols = list.map(p => (p.weight || Math.max(1.6, Math.min(4, daysBetween(p.start, p.end) / 4 + 1.6))) + 'fr').join(' ');
  return h('div', { class: 'wr3-ph', style: { '--cols': cols }, role: 'list', 'aria-label': 'The season' },
    list.map(p => {
      const b = h('button', { type: 'button', role: 'listitem', class: p.state || '', style: p.state === 'now' ? { '--v': Math.round((p.progress ?? 0.5) * 100) + '%' } : null,
        'aria-label': `${p.name}: ${p.range}${p.state === 'now' ? ', on now' : p.state === 'done' ? ', done' : ''}${p.offer ? '. ' + p.offer : ''}` },
        h('i'), h('b', null, p.name), h('span', null, p.sub));
      const show = () => tipShow(b, [h('div', { class: 'lx-tip-h' }, p.name), tipRow(null, 'Dates', p.range), p.state === 'now' ? tipRow(null, 'Now', p.sub) : null, p.offer ? tipRow(null, 'Offer', p.offer) : null].filter(Boolean), b, 8);
      b.addEventListener('pointerenter', e => { if (e.pointerType === 'mouse') show(); });
      b.addEventListener('pointerleave', e => { if (e.pointerType === 'mouse') tipHide(b); });
      b.addEventListener('focus', show); b.addEventListener('blur', () => tipHide(b));
      b.addEventListener('click', show);
      return b;
    }));
}
/** A brand's own phases from its plan read (Early Black Friday to Holiday), or null. */
function phasesOfWar(w) {
  const list = ((w && w.phases) || []).filter(p => p.start && p.end && p.status !== 'missing' && p.status !== 'skip' && ['nov', 'bf', 'dec'].includes(p.grp || 'bf'));
  return list.length ? list.slice(0, 5).map(p => ({ name: p.name, start: p.start, end: p.end, offer: p.offer || '' })) : null;
}

/** The hero: sales so far against the goal, store MER against target, ad spend, the season, today by the hour. */
function paceHero(m) {
  const base = ok(m.goalSales) ? m.goalSales : m.sales;
  const pctOf = ok(base) && ok(m.goal) && m.goal > 0 ? base / m.goal : null;
  const merTone = !ok(m.mer) || !ok(m.target) ? '' : m.mer >= m.target ? 'good-t' : ok(m.be) && m.mer < m.be ? 'bad-t' : 'warn-t';
  const salesBox = h('div', null,
    h('span', { class: 'wr3-lab' }, 'Sales', m.period ? `, ${m.period}` : '', ' · Triple Whale'),
    ok(m.sales) ? h('div', { class: 'big' }, h('span', { class: 'lx-hero-num' }, money(Math.round(m.sales))),
      h('span', { class: 'of' }, ok(m.goal) && m.goal > 0 ? [`of the ${money(m.goal)} `, defLabel('sales goal', 'sales_goal'), ok(pctOf) ? `, ${Math.round(pctOf * 100)}%` : ''] : 'no sales goal set',
        m.scopeChip ? defined(h('span', { class: 'wr3-scope', tabindex: '0' }, m.scopeChip), { title: 'Which brands count', body: m.scopeWhy }) : null))
      : h('div', { class: 'big' }, h('span', { class: 'of' }, m.none || 'No sales read yet')),
    ok(pctOf) ? h('div', { class: 'wr3-prog', role: 'img', 'aria-label': Math.round(pctOf * 100) + '% of the sales goal' }, h('i', { style: { '--v': Math.min(100, pctOf * 100).toFixed(1) + '%' } })) : null);
  const merBox = h('div', null,
    h('span', { class: 'wr3-lab' }, defLabel('Store MER', 'mer'), ', same period · Triple Whale'),
    h('div', { class: 'mid ' + merTone }, fx(m.mer), ok(m.target) ? h('small', null, defLabel('Goal MER', 'target_mer'), ' ' + fx(m.target)) : null));
  const spendBox = h('div', null,
    h('span', { class: 'wr3-lab' }, 'Ad spend, same period · every platform, Triple Whale'),
    h('div', { class: 'mid' }, usd(m.spend)));
  const hs = m.hours;
  const chart = h('div', { class: 'wr3-ch' },
    h('div', { class: 'lx-chart-h' }, h('h3', null, 'Today by the hour'), h('span', { class: 'wr3-lab' }, [m.hourScope, 'Triple Whale'].filter(Boolean).join(' · ')), hs ? hourLegend(hs) : null),
    hs ? hourChart(hs, { height: 240, phoneHeight: 200, windowLabel: 'Hourly, 12am to now, Central time' }) : h('p', { class: 'wr3-quiet' }, m.hourNote || 'No sales or spend yet today.'),
    hs && m.hourNote ? h('p', { class: 'wr3-quiet' }, m.hourNote) : null);
  /* lean: the brand view, where the Today tile on the brand card already shows store MER and ad spend */
  return card({ class: 'wr3-hero' },
    h('div', { class: 'wr3-hk' + (m.lean ? ' lean' : '') }, salesBox, m.lean ? null : merBox, m.lean ? null : spendBox),
    phaseStrip(m.phases, m.today),
    chart);
}

/** One row per brand: Brand | Offer | Sale dates | Sales goal | Goal MER | Plan status | Open plan.
    On a phone the dates fold under the offer and the target under the goal, so nothing is dropped.
    planHref(act): the brand's plan page (day by day goal and budget, the ladder, the offers), from where the team edits. */
function planTable(rows, { team, waiting, hrefOf, planHref, onPick }) {
  const dim = t => h('span', { class: 'dim' }, t);
  const dates = r => r.sale && r.sale.start ? `${md(r.sale.start)} to ${md(r.sale.end || r.sale.start)}` : null;
  const tgt = r => ok(r.target) ? 'Goal MER ' + fx(r.target) : null;
  const cols = [
    { key: 'name', label: 'Brand', render: r => h('span', { class: 'name' }, onPick && onPick.has(r.act_id) ? h('button', { type: 'button', onclick: () => onPick.go(r.act_id), 'aria-label': `Show ${r.name} on this page` }, r.name) : hrefOf && hrefOf(r.act_id) ? h('a', { href: hrefOf(r.act_id) }, r.name) : r.name) },
    { key: 'offer', label: 'Black Friday offer', render: r => h('span', { style: { whiteSpace: 'normal', display: 'block', minWidth: '140px' } },
      r.offer ? r.offer : waiting ? dim('Reading...') : dim('No offer written yet'),
      dates(r) ? h('small', { class: 'wr3-fold' }, dates(r)) : null) },
    { key: 'sale', label: 'Sale dates', class: 'hide-sm', render: r => dates(r) || (waiting ? dim('Reading...') : dim('not set')) },
    { key: 'goal', label: 'Sales goal', num: true, render: r => h('span', null,
      ok(r.goal) && r.goal > 0 ? h('span', { class: 'strong' }, money(r.goal)) : dim('not set'),
      tgt(r) ? h('small', { class: 'wr3-fold' }, tgt(r)) : null) },
    { key: 'target', label: defLabel('Goal MER', 'target_mer'), num: true, class: 'hide-sm', render: r => ok(r.target) ? fx(r.target) : dim('not set') },
    { key: 'status', label: 'Plan status', render: r => {
      if (!r.steps) return waiting ? dim('Reading...') : dim('not read');
      const open = r.steps.find(s => !s.done);
      /* a client reads only whether the plan is ready, never the team's internal step names */
      if (!team) return open ? h('span', { class: 'lx-stat warn' }, 'Being set up') : h('span', { class: 'lx-stat good' }, 'Ready');
      return open ? h('span', { class: 'lx-stat warn' }, 'Open: ' + String(open.label || '').toLowerCase()) : h('span', { class: 'lx-stat good' }, `Ready, ${r.steps.length} of ${r.steps.length} steps`);
    } },
  ];
  if (planHref) cols.push({ key: 'open', label: '', num: true, render: r => { const l = planHref(r.act_id); return l ? button('Open plan', { href: l, aria: `Open the ${r.name} Black Friday plan` }) : null; } });
  return h('div', { class: 'wr3-plan' }, table({ cols, rows, roomy: true, empty: 'No brand has a Black Friday plan yet' }));
}
/** The brand plan page for a brand id, or null when the brand has no slug here. */
const planHrefOf = ctx => act => { const s = ((ctx.brands || []).find(x => x.id === act) || (ctx.brand && ctx.brand.id === act ? ctx.brand : {}) || {}).slug; return s ? `#/brand/${encodeURIComponent(s)}/black-friday/plan` : null; };

/** The pace hero from one plan read (GET /api/season/war?act=<id>&live=1): a client's page, and the team's page when
    there is no check-in for the brand. at: when the numbers were read. */
function warModel(w, at, { team = false } = {}) {
  const today = (w && w.today) || new Date().toISOString().slice(0, 10);
  const L = (w && w.live && !w.live.error) ? w.live : {};
  const so = L.sale_so_far || {}, goals = (w && w.goals_list) || [];
  const goal = (goals.find(g => g.metric === 'revenue') || {}).target || null;
  const target = (w && w.ladder && w.ladder.target) || (goals.find(g => g.metric === 'mer') || {}).target || null;
  const sales = ok(+so.sales) && so.sales != null ? +so.sales : null, spend = ok(+so.spend) && so.spend != null ? +so.spend : null;
  const start = so.from || (w && w.sale && w.sale.start) || today;
  const readAt = Date.parse(L.at || L.as_of || (w && (w.at || w.as_of)) || '') || at || null;
  return {
    period: `${dayLabel(start)} 12am CT to ${readAt ? clockCT(readAt) + ' CT (last read)' : 'the last read'}`, sales, goal, spend,
    mer: sales != null && spend > 0 ? sales / spend : null, target, be: team && w && w.ladder && ok(w.ladder.be) ? w.ladder.be : null,
    none: w && w.sale && today < w.sale.start ? `The sale starts ${dayLabel(w.sale.start)}` : 'No sales read yet',
    phases: phasesOfWar(w) || SEASON, today, hours: hourSeries([w]), hourScope: 'whole store, Central time', hourNote: '',
  };
}
/** One plan table row from a plan read. */
function warRow(w, act, name) {
  const goals = (w && w.goals_list) || [];
  const bf = ((w && w.phases) || []).find(p => p.key === 'bf');
  return { act_id: act, name, offer: (w && w.bf_offer) || (bf && bf.offer) || '', sale: w && w.sale, goal: (goals.find(g => g.metric === 'revenue') || {}).target ?? null,
    target: (w && w.ladder && w.ladder.target) ?? (goals.find(g => g.metric === 'mer') || {}).target ?? null, steps: w && Array.isArray(w.steps) ? w.steps : null };
}

/* ---------- the page ---------- */
export function renderWarRoom(el, data, ctx, { one = null } = {}) {
  addStyles('wr3-css', CSS);
  addStyles('wcc-css', CARD_CSS);
  /* The router hands every page the same view element and can render this page twice (saved copy, then fresh), so
     each render owns a token: an older render, or one whose route was left, stops drawing, probing and polling.
     The token is taken first, so a client render also stops a team render still running on the same element. */
  const token = Symbol('war-room');
  el.__wr = token;
  /* who is looking decides the page, never the shape of the data: a saved team copy is never drawn for a client */
  if (ctx.isClient) return renderClient(el, data && data.client ? data : { client: true, war: null, team_copy: !!data }, ctx);
  if (data && data.client) return put(el, empty({ title: 'Reading the War Room...', text: 'The team view is on its way.' }));
  const write = canWrite(ctx);
  const alive = () => el.__wr === token && !(ctx.signal && ctx.signal.aborted);
  const S = {
    data: data || {}, prevs: {}, records: [], probing: true, probeFails: 0, probeId: 0,
    done: {}, links: {}, linkBusy: {}, hourCache: {}, hourP: {}, hourErr: {}, hourAt: {}, picture: {}, sent: {},
    warAll: null, warAllErr: '', warBusy: true, warId: 0, warGen: 0,
    open: new Set(), insides: {}, trees: {},
  };
  /* the ad sets and ads inside a campaign: read when a campaign row opens (./_tree.js) */
  const T = treeReader(ctx);
  const hosts = { hero: null, plan: null, sparks: {} };
  /* Done is per check-in: a new check-in asks again */
  const doneKey = (act, id) => `${(rec() && rec().slot) || ''}|${act}|${id}`;
  const f = () => S.data.sample || null;

  /* the record and clock this page judges on */
  const rec = () => S.data.standing;
  const nowOf = () => ctx.sample && rec() ? Date.parse(rec().at) + 40 * 60e3 : Date.now();
  const cadOf = act => cadenceOf(S.data.answers && S.data.answers[act]);

  async function getRecord(slot) {
    if (ctx.sample) return (f() && f().records[slot]) || null;
    const c = cacheGet(slot);
    if (c !== undefined) return c;
    let r = null;
    try { const j = await ctx.api('/api/standing?slot=' + encodeURIComponent(slot), { worker: 'ah', signal: ctx.signal }); r = (j && j.standing) || null; }
    catch { S.probeFails++; return null; }                         // not cached: try again next open
    cachePut(slot, r);
    return r;
  }
  /** Walk back hour by hour for each brand's previous check-in (newest record at least cadence minus 1 hour older). */
  async function probe() {
    const R = rec();
    const id = ++S.probeId;
    if (!R || !alive()) { S.probing = false; return; }
    S.probing = true; S.prevs = {}; S.records = [R]; S.probeFails = 0;
    const acts = (R.brands || []).filter(b => !one || b.act_id === one).map(b => b.act_id);
    const need = new Set(acts);
    for (let i = 1; i <= 12 && need.size; i++) {
      const slot = slotAdd(R.slot, -i);
      const r = await getRecord(slot);
      if (id !== S.probeId || !alive()) return;
      if (!r) continue;
      S.records.push(r);
      for (const act of [...need]) {
        if (slotDiff(R.slot, r.slot) >= cadOf(act) - 1 && (r.brands || []).some(b => b.act_id === act)) { S.prevs[act] = r; need.delete(act); }
      }
    }
    S.probing = false;
    draw();
  }

  /* ---------- the plan and today by the hour (after the first paint, one read after another) ---------- */
  /** One brand's plan and today by the hour. An in-flight read is shared (the hour sheet and the page never read it
      twice); force reads again but keeps the copy on screen until the new one lands. */
  function readWarOne(act, { force = false } = {}) {
    if (S.hourCache[act] && !force) return Promise.resolve(S.hourCache[act]);
    if (S.hourP[act]) return S.hourP[act];
    if (ctx.sample) { const w = (f() && f().war_live && f().war_live[act]) || { live: { hours: [] } }; S.hourCache[act] = w; S.hourAt[act] = Date.now(); return Promise.resolve(w); }
    const gen = S.warGen;
    const p = ctx.api('/api/season/war?act=' + encodeURIComponent(act) + '&live=1', { signal: ctx.signal })
      .then(w => { if (gen === S.warGen) { S.hourCache[act] = w || {}; S.hourAt[act] = Date.now(); delete S.hourErr[act]; } return w || {}; })
      .finally(() => { if (S.hourP[act] === p) delete S.hourP[act]; });
    S.hourP[act] = p;
    return p;
  }
  /** The plan (agency: one act=all read) and each brand's today by the hour, one read after another. A newer run
      stops an older one. With no check-in on screen it still reads, so the pace and the plan can be drawn. */
  async function readWar({ force = false } = {}) {
    const id = ++S.warId;
    const stale = () => id !== S.warId || !alive();
    S.warBusy = true;
    const R = rec();
    let acts = R ? (R.brands || []).filter(b => !one || b.act_id === one).map(b => b.act_id) : [];
    if (one && !acts.length) acts = [one];                     // a brand outside the check-in still gets its pace
    if (!one) {
      try {
        const all = ctx.sample ? (f() && f().war_all) || null : await ctx.api('/api/season/war?act=all', { signal: ctx.signal });
        if (stale()) return;
        S.warAll = all; S.warAllErr = '';
      } catch (e) { if ((e && e.name === 'AbortError') || stale()) return; S.warAllErr = errText(e); }
      fillLate();
    }
    for (const act of acts) {
      try { await readWarOne(act, { force }); }
      catch (e) { if ((e && e.name === 'AbortError') || stale()) return; S.hourErr[act] = errText(e); }
      if (stale()) return;
      fillLate();
    }
    S.warBusy = false;
    fillLate();
  }
  /** Earlier check-ins first, then the plan and the hours: one read at a time, never two side by side. */
  const readAll = opts => probe().then(() => { if (alive()) return readWar(opts); });

  /* ---------- the calls per brand ---------- */
  function calcAll() {
    const R = rec(), now = nowOf(), recHour = central(Date.parse(R.at)).hour;
    const recDate = R.today || slotDate(R.slot);
    let list = [...(R.brands || [])];
    if (one) list = list.filter(b => b.act_id === one);
    return list.map(b => {
      const pr = S.prevs[b.act_id] || null;
      const prv = pr ? (pr.brands || []).find(x => x.act_id === b.act_id) || null : null;
      const basis = pr ? sinceBasis(R.slot, pr.slot) : null;
      const acts = (S.data.acts || []).filter(a => !a.act_id || a.act_id === b.act_id);
      const records = S.records.map(r => ({ slot: r.slot, at: r.at, brand: (r.brands || []).find(x => x.act_id === b.act_id) || null }));
      const g = (S.data.goals && S.data.goals[b.act_id]) || {};
      const c = brandCalls({ cur: { ...b, slot: R.slot }, prv, basis, acts, records, now, recDate, recHour, cadence: cadOf(b.act_id),
        roas_goal: b.target_roas ?? b.goal_roas ?? g.target_roas ?? null, roas_be: b.be_roas ?? b.break_even_roas ?? g.be_roas ?? null,
        goal_unread: !!S.data.goals_error });
      c.b = b; c.prvRec = pr; c.basis = basis; c.recHour = recHour;
      const ap = R.approved && R.approved[b.act_id], apCamp = b.meta && b.meta.camp;
      for (const cp of c.camps) {
        const d = S.done[doneKey(b.act_id, cp.id)];
        if (d) cp.done = d;
        else if (ap && apCamp && String(apCamp.id) === cp.id) cp.done = { from: ap.from, to: ap.to, by: ap.by || 'the Slack check-in', at: ap.at, write: ap.write || null, slack: true };
        cp.dismissed = notNow(R.slot, cp.id);
        cp.slack = matchesCheckin(b, cp);
      }
      return c;
    });
  }

  /* ---------- Not now (per viewer, per check-in) ---------- */
  const NN = (slot, id) => `wr2-notnow:${slot}:${id}`;
  function notNow(slot, id) { try { return localStorage.getItem(NN(slot, id)) === '1'; } catch { return false; } }
  function setNotNow(slot, id) { try { localStorage.setItem(NN(slot, id), '1'); } catch {} }

  /* ---------- words ---------- */
  const merTone = (mer, c) => !ok(mer) || !ok(c.goal) ? '' : mer >= c.goal ? 'good' : ok(c.be) && mer < c.be ? 'bad' : 'warn';
  const roasTone = (w, c) => !w || !w.readable || !c.roas || !ok(c.roas.goal) ? '' : w.roas >= c.roas.goal ? 'good' : ok(c.roas.be) && w.roas < c.roas.be ? 'bad' : '';
  const tcls = t => t ? t + '-t' : null;
  /* a brand with no store connected never has a ROAS: it reads "no read", never a waiting ellipsis */
  const roasTxt = (w, c) => c && c.mode === 'no_sales' ? 'no read' : !w ? (S.probing ? 'reading' : 'n/a') : w.readable ? fx(w.roas) : w.no_tw ? 'no sales read' : 'too little spend';
  /** The ROAS cell: the number, or the reason there is none, with its meaning on hover or tap. */
  const roasCell = (w, c) => {
    const t = roasTxt(w, c);
    if (c && c.mode === 'no_sales') return defLabel(t, 'no_store_roas', { class: 'dim' });
    if (!w) return h('span', { class: 'dim' }, t);
    if (w && !w.readable) return defLabel(t, w.no_tw ? 'no_sales_read' : 'too_little_spend', { class: 'dim' });
    return h('span', { class: tcls(roasTone(w, c)) }, t);
  };
  const sinceWord = c => c.basis ? c.basis.short : null;
  /** "ROAS since 8pm", defined as ROAS over that window (the same words in the table, Needs your yes and the panel). */
  const sinceRoasLabel = since => defLabel(since ? `ROAS since ${since}` : 'ROAS since check-in', { title: 'ROAS since the last check-in', body: `This campaign's Triple Whale attributed sales (last click) over its own spend, from the last check-in${since ? ' (' + since + ')' : ''} to this one. With Today, it decides the call.` });
  /** "Raise BFCM 2026 (Meta) budget 50%: $750 to $1,125 a day" */
  function decisionText(cp) {
    const m = cp.move, pc = Math.abs(Math.round(m.pct * 100));
    if (cp.call === 'putback') return `Put back ${cp.name} (${PLATFORM}) budget: ${money(m.from)} to ${money(m.to)} a day`;
    return `${m.to > m.from ? 'Raise' : 'Cut'} ${cp.name} (${PLATFORM}) budget ${pc}%: ${money(m.from)} to ${money(m.to)} a day`;
  }
  const doneText = cp => `Done: ${cp.name} (${PLATFORM}) is now ${money(cp.done.to)} a day, by ${cp.done.by}`;
  /** The call word for a row's pill. Short, so the table stays readable. */
  function callWord(c, cp) {
    if (cp.done) return 'Done';
    if (cp.move && S.probing) return 'Reading';
    if (cp.move) return cp.call === 'putback' ? CALL_WORD.putback : `${cp.move.to > cp.move.from ? 'Raise' : 'Cut'} ${Math.abs(Math.round(cp.move.pct * 100))}%`;
    if (aboMove(c, cp)) return aboMove(c, cp) > 0 ? 'Raise the ad sets' : 'Cut the ad sets';
    if (c.mode === 'watch') return 'Client decides';
    if (c.mode !== 'live' || !c.gate.light) return 'No read';
    if (cp.early) return 'Too early';
    return CALL_WORD[cp.call] || 'Hold';
  }
  /** An ad set budget campaign the rules would raise (1) or cut (-1): its money sits on the ad sets, so the tap opens them. */
  const aboMove = (c, cp) => !cp.abo || cp.done || S.probing || c.mode !== 'live' || !c.gate || !c.gate.light ? 0 : cp.call === 'raise50' || cp.call === 'raise25' ? 1 : cp.call === 'cut' ? -1 : 0;
  /** The pill's tone: a move takes its call's tone, an ad set budget campaign the same tone as the move it stands for. */
  const callTone = (c, cp) => cp.done ? 'good' : cp.move && !S.probing ? CALL_TONE[cp.call] : aboMove(c, cp) ? (aboMove(c, cp) > 0 ? 'good' : 'bad') : '';
  /** The definition that goes with the word callWord() shows, so the bubble always explains the word on screen. */
  function callKey(c, cp) {
    const w = callWord(c, cp);
    if (w === 'Done') return 'call_done';
    if (w === 'Reading') return 'call_reading';
    if (w === 'No read') return 'call_numbers';
    if (w === 'Client decides') return 'call_client';
    if (w === 'Too early') return 'call_too_early';
    return CALL_KEY[cp.call] || 'call_hold';
  }
  const assumedWhy = r => r.reason === 'over_goal' ? `assumed as goal ROAS / ${BE_ROAS_DIV}, because the ${fx(r.rec)} on record is over the goal` : `assumed as goal ROAS / ${BE_ROAS_DIV}, none on record`;
  /** Who owns the budget on this brand, said in the budget sheets (watch: the client runs it; client_approve: the client says yes first). */
  const ownerNote = c => c.mode === 'watch' ? 'The client runs this budget. Change it only when the client asked you to.'
    : c.b && c.b.client_approve ? 'The client approves budget changes on this brand. Change it only after the client said yes in Slack.' : '';
  function modeLine(c) {
    const b = c.b;
    if (c.mode === 'watch') return 'Updates only: the client runs this budget';
    if (c.mode === 'no_sales') return 'No Triple Whale store connected: spend against budget only';
    if (c.mode === 'plan') return 'The sale has not started: numbers only';
    if (c.mode === 'after') return 'The sale has ended: numbers only';
    if (c.mode === 'error') return 'No live numbers: ' + (b.error || 'Triple Whale did not answer');
    if (c.mode === 'meta_error') return 'Meta did not answer: ' + ((b.meta && b.meta.error) || 'try Refresh');
    return '';
  }
  const ageH = () => (nowOf() - Date.parse(rec().at)) / 3600e3;
  /* When this brand's call was made: a brand carried from an earlier check-in keeps its own time (the server's
     Approve reads the same field). */
  const callAt = c => Date.parse((c && c.b && c.b.checked_at) || rec().at);
  /* A call past its shelf life (over 6 hours, or made on another day) gets no live Approve, here or in a sheet. */
  const outOfDate = c => callOutOfDate(callAt(c), nowOf());
  const hasSuggestion = (c, cp) => !!(cp.move && !cp.done && !cp.dismissed && !S.probing && c.mode === 'live');
  const pendingOf = c => c.camps.filter(cp => hasSuggestion(c, cp) && !cp.abo);
  /** A reason line only when it adds something the numbers do not show: a warning, a cap, who approves. */
  const extraWhy = cp => [cp.warn, ...(cp.notes || [])].filter(Boolean).join(' ');
  /** A call's reason without the figures the panel already shows beside it (the math text in _warcall.js stays). */
  const reasonOnly = t => String(t || '').replace(/^Spent \$[\d,]+ of \$[\d,]+ today, /, '').replace(/^./, ch => ch.toUpperCase());

  /* ---------- the brand card ---------- */
  const cardId = act => 'wr3-card-' + String(act).replace(/[^\w-]/g, '_');
  /** Scroll to a brand's card on this page and flash it (the queue, the plan table and the store items stay here). */
  function jumpToCard(act) {
    const el2 = document.getElementById(cardId(act));
    if (!el2) return;
    el2.scrollIntoView({ behavior: 'smooth', block: 'start' });
    el2.classList.remove('flash'); void el2.offsetWidth; el2.classList.add('flash');
  }
  const NUM_ONLY = { watch: 'The client runs the budget', no_sales: 'No store connected', plan: 'Sale not started', after: 'Sale ended', error: 'No live numbers', meta_error: 'Meta did not answer' };
  /** The store light as a short plain reason, and its place in the card order (lower comes first). */
  function lightOf(c) {
    if (c.mode !== 'live') return { tone: '', word: NUM_ONLY[c.mode] || 'Numbers only', rank: 4 };
    if (S.probing) return { tone: '', word: 'Reading the earlier check-in', rank: 3 };
    const W = c.windows, sinceW = c.basis ? 'since ' + c.basis.short : 'since the last check-in';
    const read = w => !!(w && w.readable && ok(w.mer));
    const below = (w, line) => read(w) && ok(line) && w.mer < line;
    const l = c.gate && c.gate.light;
    if (l === 'red') return { tone: 'bad', word: below(W.today, c.be) ? (below(W.since, c.be) ? `Under break-even ${sinceW} and today` : 'Under break-even today') : 'Under break-even ' + sinceW, rank: 0 };
    if (l === 'green') return { tone: 'good', word: read(W.since) ? `Over goal ${sinceW} and today` : 'Over goal today', rank: 3 };
    if (l === 'amber') {
      const s = below(W.since, c.goal), t = below(W.today, c.goal);
      return { tone: 'warn', word: c.gate.early ? 'Too early to read today' : s && t ? `Under goal ${sinceW} and today` : s ? 'Under goal ' + sinceW : t ? 'Under goal today' : 'Mixed, so no raises', rank: 2 };
    }
    return { tone: '', word: 'No goal set', rank: 3 };
  }
  /** One window of the store strip: label with its window, store MER big, then Sales and Ad spend. */
  /** Gray a tile drawn from a check-in that is out of date. */
  const grayIf = (yes, el) => { if (yes) el.classList.add('stale'); return el; };
  function tile(w, c, head, sub, emptyText) {
    const hd = h('span', { class: 'hd' }, h('b', null, head), sub ? h('small', null, sub) : null);
    if (!w) return h('div', { class: 'wr3-tile' }, hd, h('span', { class: 'mer off-t' }, 'none'), h('span', { class: 'gray' }, emptyText));
    const noSales = c.mode === 'no_sales';
    const tone = w.readable && !noSales ? merTone(w.mer, c) : 'off';
    return h('div', { class: 'wr3-tile' }, hd,
      h('span', { class: 'mer ' + (tone ? tone + '-t' : '') }, noSales ? usd(w.spend) : fx(w.mer), h('small', null, noSales ? 'ad spend' : defLabel('store MER', 'mer'))),
      noSales ? null : h('span', { class: 'ln' }, h('span', null, 'Sales'), h('span', null, usd(w.sales))),
      noSales ? null : h('span', { class: 'ln' }, h('span', null, 'Ad spend'), h('span', null, usd(w.spend))),
      !w.readable ? h('span', { class: 'gray' }, 'Too little spend to read') : w.synced ? h('span', { class: 'gray' }, "Yesterday's part is from the nightly sync") : null);
  }
  function sparkFor(c) {
    const host = h('div', { class: 'wr3-spark' });
    hosts.sparks[c.act] = { host, c };
    fillSpark(c, host);
    return host;
  }
  function fillSpark(c, host) {
    const w = S.hourCache[c.act], hs = w ? hourSeries([w]) : null;
    const head = h('div', { class: 'lx-chart-h' }, h('span', { class: 'wr3-lab' }, c.mode === 'no_sales' ? 'Ad spend by the hour · Meta' : 'Today by the hour, whole store · Triple Whale'), hs ? hourLegend(hs) : null);
    if (hs) return put(host, head, hourChart(hs, { height: 128, phoneHeight: 120, axis: false, windowLabel: 'Hourly, 12am to now, Central time', ticks: [0, Math.min(6, hs.sales.length - 1), Math.min(12, hs.sales.length - 1), hs.sales.length - 1].filter((v, i, a) => a.indexOf(v) === i), label: `${c.name}: sales and ad spend by the hour today` }));
    const msg = S.hourErr[c.act] ? 'Today by the hour did not load: ' + S.hourErr[c.act] : w ? 'No sales or spend yet today.' : 'Reading today by the hour...';
    put(host, head, h('p', { class: 'wr3-quiet' }, msg));
  }

  /** The call line under the strip: every call with its own buttons, then what was done, else the hold line. */
  function callLines(c) {
    const pend = pendingOf(c), done = c.camps.filter(cp => cp.done), ml = modeLine(c);
    const eb = h('span', { class: 'eb' }, `${APP_NAME} call`);
    const line = (t, dim) => h('div', { class: 'wr3-call' }, h('div', { class: 'txt' }, eb.cloneNode(true), h('span', { class: 'dec' + (dim ? ' dim' : '') }, t)));
    const rows = [];
    if (ml) rows.push(line(ml, true));
    else if (S.probing) rows.push(line('Reading the earlier check-ins...', true));
    else {
      for (const cp of pend) rows.push(h('div', { class: 'wr3-call', id: askId(c, cp) },
        h('div', { class: 'txt' }, eb.cloneNode(true), h('span', { class: 'dec' }, decisionText(cp)), extraWhy(cp) ? h('p', { class: 'why' }, extraWhy(cp)) : null),
        askButtons(c, cp)));
      for (const cp of done) rows.push(h('div', { class: 'wr3-call done' },
        h('div', { class: 'txt' }, h('span', { class: 'dec' }, doneText(cp))),
        write && cp.done.write ? h('div', { class: 'wr3-act' }, button('Undo', { onclick: () => undo(c, cp) })) : null));
      if (!pend.length && !done.length) rows.push(line(!c.camps.length ? 'No live campaign in Meta' : c.camps.some(cp => cp.needs_ads) ? 'Hold all campaigns, new ads needed' : 'Hold all campaigns', true));
    }
    return h('div', { class: 'wr3-calls' }, rows);
  }

  /** This week for the ad sets and ads inside a campaign: Monday to the check-in day. */
  function weekWin(c) {
    const R = rec(), to = R.today || slotDate(R.slot), from = (c.b.week && c.b.week.from) || mondayOf(to);
    return { from, to, label: from === to ? md(to) : `${md(from)} to ${md(to)}` };
  }
  const openKey = (c, cp) => c.act + '|' + cp.id;
  function insideOf(c, cp) {
    const key = openKey(c, cp);
    let box = S.insides[key];
    if (!box) {
      box = campaignInside(ctx, T, { act: c.act, brand: c.name, camp: { id: cp.id, name: cp.name }, win: weekWin(c), write,
        goals: c.roas && ok(c.roas.goal) ? { roas: c.roas.goal } : null, onCampaign: d => { S.trees[c.act] = d; }, details: () => campSheet(c, cp),
        /* a scale call on an ad set that has no budget of its own: the raise goes on this campaign's budget */
        campBudget: () => { if (!write || cp.abo || !cp.daily) return false; approveSheet(c, cp, { manual: true }); return true; } });
      S.insides[key] = box;
    } else if (box.refresh) box.refresh();
    return box;
  }
  function campRow(c, cp) {
    const key = openKey(c, cp), open = S.open.has(key);
    const flip = () => { if (S.open.has(key)) S.open.delete(key); else S.open.add(key); draw(); };
    const word = callWord(c, cp), tone = callTone(c, cp);
    const sug = hasSuggestion(c, cp) && write && !cp.abo && !outOfDate(c);
    const abo = aboMove(c, cp);
    const callBtn = h('button', { type: 'button', class: 'lx-pill wr3-cbtn ' + (tone || ''),
      onclick: e => { e.stopPropagation(); if (sug) approveSheet(c, cp); else if (abo) { S.open.add(key); draw(); } else campSheet(c, cp); },
      'aria-label': sug ? `${decisionText(cp)}: check and apply` : abo ? `${word}: open ${cp.name} to set each ad set's budget` : `${word}: ${cp.name}, see why` }, word);
    const daily = cp.done && ok(cp.done.to) ? cp.done.to : cp.daily;
    const stt = stateOf(T, S.trees[c.act] || null, 'campaign', cp.id, 'ACTIVE'), on = String(stt.own || 'ACTIVE').toUpperCase() === 'ACTIVE';
    const toggle = () => writeSheet(ctx, { act: c.act, brand: c.name, level: 'campaign', object: cp.id, name: cp.name, kind: on ? 'pause' : 'resume',
      why: on ? 'Turning a campaign off stops every ad set and ad in it.' : null,
      onDone: r => { T.local.status[cp.id] = r.status; draw(); }, onUndo: () => { delete T.local.status[cp.id]; draw(); } });
    const sub = [daily ? money(daily) + ' a day' : 'Ad set budgets', money(cp.spent) + ' spent today', 'ROAS today ' + roasTxt(cp.w.today, c), 'this week ' + roasTxt(cp.w.week, c)].join(' · ');
    const row = h('div', { class: 'wr3-cr row' + (open ? ' open' : '') },
      h('span', { class: 'wr3-cn' },
        h('button', { type: 'button', class: 'wr3-exp', 'aria-expanded': String(open), 'aria-label': `${open ? 'Close' : 'Open'} the ad sets in ${cp.name}`, onclick: flip }, h('i', { 'aria-hidden': 'true' })),
        h('button', { type: 'button', class: 'tx', onclick: flip, 'aria-expanded': String(open) },
          h('b', { title: cp.name }, cp.name),
          h('small', null, platformChip('meta'), h('span', { class: 'bud-in' }, daily ? money(daily) + ' a day' : 'ad set budgets'), h('span', { class: 'spent-in' }, money(cp.spent) + ' spent today'),
            cp.warn ? h('span', { class: 'warnrow' }, 'Last change not read yet') : null, on ? null : h('span', null, 'Off')),
          h('small', { class: 'sub' }, sub))),
      h('span', { class: 'r c-bud' }, daily ? money(daily) : h('span', { class: 'dim' }, 'ad sets')),
      h('span', { class: 'r c-spent' }, money(cp.spent)),
      h('span', { class: 'r c-since' }, roasCell(cp.w.since, c)),
      h('span', { class: 'r c-today' }, roasCell(cp.w.today, c)),
      h('span', { class: 'r c-week' }, roasCell(cp.w.week, c)),
      h('span', { class: 'c-call' }, callBtn),
      h('span', { class: 'c-act' },
        write && !cp.abo ? h('button', { type: 'button', class: 'wr-lk', onclick: () => approveSheet(c, cp, { manual: true }), 'aria-label': `Set the budget on ${cp.name}` }, 'Set budget') : null,
        onSwitch(on, { disabled: !write, note: stateNote(stt), label: `${cp.name} is ${on ? 'on' : 'off'}. ${on ? 'Turn it off' : 'Turn it on'}`, onclick: toggle })));
    return open ? [row, insideOf(c, cp)] : [row];
  }
  function campList(c) {
    treeCss();
    const since = sinceWord(c);
    const callHead = defLabel('Call', c.roas && ok(c.roas.be) ? { title: 'The call', body: `${glossaryFor('calls').definition} This brand's break-even ROAS: ${fx(c.roas.be)}${c.roas.assumed ? `, ${assumedWhy(c.roas)}` : ''}.` } : 'calls');
    const noSales = c.mode === 'no_sales';
    return h('div', { class: 'wr3-cl' },
      /* no store connected: no Triple Whale ROAS, so no Triple Whale header over the columns */
      h('div', { class: 'wr3-cr grp', 'aria-hidden': 'true' }, h('span', null, noSales ? h('span', null, 'ROAS, no store connected')
        : [h('span', { class: 'full' }, 'ROAS, Triple Whale last click'), h('span', { class: 'short' }, 'ROAS (Triple Whale)')])),
      h('div', { class: 'wr3-cr hd' },
        h('span', { style: { paddingLeft: '36px' } }, 'Campaign'), h('span', { class: 'r c-bud' }, 'Budget a day'), h('span', { class: 'r c-spent' }, 'Spent today'),
        h('span', { class: 'r c-since' }, since ? `Since ${since}` : 'Since check-in'), h('span', { class: 'r c-today' }, outOfDate(c) ? 'At check-in' : 'Today'), h('span', { class: 'r c-week' }, 'This week'),
        h('span', { class: 'c-call' }, callHead), h('span', { class: 'r c-act' }, '')),
      c.camps.length ? c.camps.flatMap(cp => campRow(c, cp)) : h('p', { class: 'wr3-quiet', style: { padding: '12px 14px' } }, 'No live campaign in Meta.'),
      h('p', { class: 'wr3-cl-foot' }, noSales ? 'Budgets and spend are Meta. No store is connected, so there is no ROAS to read. Open a campaign for its ad sets and ads.'
        : 'Budgets and spend are Meta. ROAS is Triple Whale last click: the sales it credits to the campaign over the campaign\'s own spend. Open a campaign for its ad sets and ads.'));
  }

  function brandCard(c) {
    const b = c.b, cad = c.cadence, R = rec(), hourNow = central(nowOf()).hour;
    const due = isDue(cad, R.slot, nowOf()), old = ageH() > cad + 1;
    const L = lightOf(c);
    const chip = h('button', { class: 'wr3-chip' + (due || old ? ' due' : ''), type: 'button', disabled: !write || null, onclick: write ? () => cadenceSheet(c) : null, 'aria-label': `Check-in every ${cad} hours. Change it` },
      due ? `Check-in due, every ${cad}h` : old ? `Check-in is old, every ${cad}h` : `Every ${cad}h, next ${nextDue(cad, Math.max(hourNow, c.recHour))}`);
    const at = hourWord(slotHour(R.slot));
    const sinceHead = c.basis ? `Since ${c.basis.short}` : 'Since last check-in';
    const warns = [];
    if (c.mode === 'live' && !S.probing && c.gate && (c.gate.light === 'amber' || c.gate.light === 'red') && c.gate.why) warns.push(c.gate.why);
    if (c.roas && c.roas.unread) warns.push('The goal ROAS could not be read, so there are no campaign calls.');
    else if (c.mode === 'live' && c.roas && !ok(c.roas.goal)) warns.push('No goal ROAS set for this brand, so there are no campaign calls. Set it in Brand settings > Goals.');
    if (!S.probing && !c.prvRec && c.mode === 'live' && S.probeFails) warns.push(`${S.probeFails} earlier check-in${S.probeFails === 1 ? '' : 's'} could not be read.`);
    const slug = ((ctx.brands || []).find(z => z.id === c.act) || {}).slug;
    const node = card({ class: 'wr3-b' },
      h('div', { class: 'wr3-hd' }, h('h3', null, b.name), pill(L.tone, L.word), h('span', { class: 'sp' }),
        h('span', { class: 'wr3-meta' },
          ok(c.goal) && c.mode !== 'no_sales' ? h('span', null, defLabel('Goal MER', 'target_mer'), ' ', h('b', null, fx(c.goal))) : null,
          h('span', null, 'Checked ', h('b', null, at + ' CT')), chip)),
      h('div', { class: 'wr3-body' + (one ? '' : ' two') },
        h('div', { class: 'wr3-strip' },
          h('div', { class: 'wr3-tiles' },
            tile(c.windows.since, c, sinceHead, c.basis ? `to ${at}` : null, S.probing ? 'Reading the earlier check-in' : 'No earlier check-in today'),
            grayIf(outOfDate(c), tile(c.windows.today, c, outOfDate(c) ? asOfWords(callAt(c)) : 'Today', outOfDate(c) ? `12am to ${at}, not live` : `12am to ${at}`)),
            tile(c.windows.week, c, 'This week', `Mon to ${at}`)),
          h('span', { class: 'lx-srcline' }, c.mode === 'no_sales' ? 'Ad spend, Central time · Meta' : 'Whole store, Central time · Triple Whale')),
        one ? null : sparkFor(c)),            // one brand: the hero above already draws its today by the hour
      callLines(c),
      warns.map(t => h('p', { class: 'wr3-amber' }, t)),
      campList(c),
      c.roas && c.roas.unread ? h('div', { class: 'wr3-act' }, button('Read the goal ROAS again', { onclick: e => refresh(e.currentTarget) })) : null,
      h('div', { class: 'wr3-foot' },
        write ? button('Client update', { onclick: () => clientSheet(c) }) : null,
        button('Hourly chart', { onclick: () => hourSheet(c) }),
        h('span', { class: 'sp' }),
        !one && slug ? h('a', { class: 'wr3-old', href: `#/brand/${encodeURIComponent(slug)}/black-friday/war-room` }, 'Open the brand page') : null));
    node.id = cardId(c.act);
    return node;
  }
  /** Approve / Set budget / Not now for one pending move (the queue and the card use the same handlers). */
  function askButtons(c, cp) {
    if (!write) return h('p', { class: 'wr3-quiet' }, 'Your access is read only, so you cannot approve this.');
    if (outOfDate(c)) return h('div', { class: 'wr3-act' },
      button(OUT_OF_DATE, { disabled: true, class: 'wr3-stale', aria: `${OUT_OF_DATE}: ${decisionText(cp)}` }),
      button('Set budget', { onclick: () => approveSheet(c, cp, { manual: true }) }));
    return h('div', { class: 'wr3-act' },
      button(c.b.client_approve ? 'Client said yes' : 'Approve', { primary: true, onclick: () => approveSheet(c, cp), aria: c.b.client_approve ? `The client said yes: apply ${decisionText(cp)}` : `Approve: ${decisionText(cp)}` }),
      button('Set budget', { onclick: () => approveSheet(c, cp, { manual: true }) }),
      button('Not now', { onclick: () => { setNotNow(rec().slot, cp.id); draw(); } }));
  }
  const askId = (c, cp) => `wr3-ask-${String(c.act).replace(/[^\w-]/g, '_')}-${String(cp.id).replace(/[^\w-]/g, '_')}`;

  /* ---------- the calls that need a yes (agency view) ---------- */
  function needsYes(list) {
    if (S.probing) return card({ title: 'Calls that need your yes' }, h('p', { class: 'wr3-quiet' }, 'Reading the earlier check-ins...'));
    /* list comes in card order (orderOf), so the queue reads top to bottom like the cards */
    const rows = [];
    for (const c of list) for (const cp of pendingOf(c)) rows.push([c, cp]);
    if (!rows.length) return card({ title: 'No call needs your yes' }, h('p', { class: 'wr3-quiet' }, 'Every campaign holds at this check-in. The brand cards below have the numbers.'));
    const n = rows.length, stale = rows.filter(([c]) => outOfDate(c)).length, live = n - stale;
    const title = !live ? `${n} ${n === 1 ? 'call is' : 'calls are'} out of date`
      : `${live} ${live === 1 ? 'call needs' : 'calls need'} your yes` + (stale ? `, ${stale} out of date` : '');
    return card({ title, note: !live ? 'from a check-in past its 6 hours, wait for the next check-in' : 'from the last check-in, the most urgent first' },
      h('div', { class: 'wr3-need' }, rows.map(([c, cp]) => {
        const since = sinceWord(c), why = extraWhy(cp);
        return h('div', { class: 'wr3-ask', id: 'q-' + askId(c, cp) },
          h('div', { class: 'txt' },
            h('button', { type: 'button', class: 'br', onclick: () => jumpToCard(c.act), 'aria-label': `Show ${c.name} on this page` }, c.name),
            h('span', { class: 'dec' }, decisionText(cp)),
            h('div', { class: 'wr3-chips' },
              h('span', null, sinceRoasLabel(since), h('b', null, roasTxt(cp.w.since, c))),
              h('span', null, defLabel('ROAS today', 'roas'), h('b', null, roasTxt(cp.w.today, c))),
              c.roas && ok(c.roas.goal) ? h('span', null, defLabel('Goal ROAS', { title: 'Goal ROAS', body: 'The ROAS this brand asks of each campaign. Set in Brand settings > Goals.' }), h('b', null, fx(c.roas.goal))) : null,
              h('span', null, defLabel('Store MER today', 'mer'), h('b', null, fx(c.windows.today.mer)))),
            why ? h('p', { class: 'why' }, why) : null),
          askButtons(c, cp));
      })));
  }

  /* ---------- the hero model ---------- */
  function heroModel(list) {
    const R = rec(), recDate = R.today || slotDate(R.slot);
    const okb = list.filter(c => !c.b.no_sales && c.b.so_far && ok(c.b.so_far.sales));
    const sales = okb.reduce((t, c) => t + c.b.so_far.sales, 0), spend = okb.reduce((t, c) => t + (c.b.so_far.spend || 0), 0);
    const withGoal = okb.filter(c => c.b.goal > 0);
    const goal = withGoal.reduce((t, c) => t + c.b.goal, 0);
    /* the percent of the goal counts only the brands that have one, so a brand with no goal never inflates it */
    const goalSales = withGoal.reduce((t, c) => t + c.b.so_far.sales, 0);
    const noGoal = okb.length - withGoal.length;
    /* the target MER the plans add up to: each brand's sales goal over the spend its own target allows */
    const planned = withGoal.filter(c => c.goal > 0);
    const target = one ? (list[0] && list[0].goal) : planned.length ? planned.reduce((t, c) => t + c.b.goal, 0) / planned.reduce((t, c) => t + c.b.goal / c.goal, 0) : null;
    const be = one && list[0] ? list[0].be : null;
    const froms = [...new Set(okb.map(c => c.b.so_far.from).filter(Boolean))].sort();
    const from = froms[0] || recDate;
    const endAt = `${clockCT(Date.parse(R.at))} CT (last check-in)`;
    const period = froms.length > 1 ? `each brand from 12am CT on its own first sale day (the earliest is ${dayLabel(from)}) to ${endAt}`
      : `${dayLabel(from)} 12am CT to ${endAt}`;
    /* which brands count: a small chip after the percent, the names and the reason in its hover definition */
    const names = a => a.map(c => c.name).join(', ');
    const out = list.filter(c => !okb.includes(c)), noGoalList = okb.filter(c => !(c.b.goal > 0));
    const why = [];
    if (out.length) why.push(`Left out: ${names(out)}. ${out.length === 1 ? 'It has' : 'They have'} no Triple Whale store connected, so there are no sales to count.`);
    if (noGoalList.length && goal) why.push(`${names(noGoalList)} ${noGoalList.length === 1 ? 'has' : 'have'} no sales goal, so the percent counts only the brands with one. ${noGoalList.length === 1 ? 'Its' : 'Their'} sales still count in the total.`);
    const scopeChip = one || !why.length ? '' : out.length ? `${okb.length} of ${list.length} brands` : `${withGoal.length} of ${list.length} brands in the %`;
    const scopeWhy = why.join(' ');
    const acts = list.map(c => c.act);
    const got = acts.filter(a => S.hourCache[a]);
    const hs = hourSeries(got.map(a => S.hourCache[a]));
    const waitN = acts.length - got.length;
    const hourNote = waitN && S.warBusy ? `Reading today by the hour: ${got.length} of ${acts.length} brands so far.` : waitN ? `${waitN} brand${waitN === 1 ? '' : 's'} could not be read by the hour.` : '';
    const ph = one ? phasesOfWar(S.hourCache[one]) || SEASON : SEASON;
    return {
      period, scopeChip, scopeWhy, lean: !!one,
      sales: okb.length ? sales : null, goal: goal || null, goalSales: withGoal.length ? goalSales : null, spend: okb.length ? spend : null, mer: spend > 0 ? sales / spend : null,
      target: ok(target) ? Math.round(target * 100) / 100 : null, be, none: 'No sales source connected',
      phases: ph, today: recDate, hours: hs, hourNote, hourScope: one ? 'whole store, Central time' : `${got.length === acts.length ? 'all brands' : got.length + ' of ' + acts.length + ' brands'}, Central time`,
    };
  }

  /* ---------- the plan rows ---------- */
  function planRows(list) {
    const fromWar = (w, c) => { const r = warRow(w, c.act, c.name); return { ...r, goal: r.goal ?? c.b.goal ?? null, target: r.target ?? c.goal ?? null }; };
    if (one) return list.map(c => fromWar(S.hourCache[c.act], c));
    const all = (S.warAll && S.warAll.brands) || [];
    return list.map(c => {
      const r = all.find(x => x.act_id === c.act);
      if (!r) return { act_id: c.act, name: c.name, offer: '', sale: null, goal: c.b.goal || null, target: c.goal, steps: null };
      return { act_id: c.act, name: c.name, offer: r.bf_offer || '', sale: r.sale, goal: r.goal ?? c.b.goal ?? null, target: (r.ladder && r.ladder.target) ?? c.goal, steps: r.steps || null };
    });
  }
  function planSection(list) {
    const waiting = one ? !S.hourCache[one] && !S.hourErr[one] : !S.warAll && !S.warAllErr;
    const hrefOf = one ? null : act => { const s = ((ctx.brands || []).find(x => x.id === act) || {}).slug; return s ? `#/brand/${encodeURIComponent(s)}/black-friday/war-room` : null; };
    const err = one ? S.hourErr[one] : S.warAllErr;
    return card({ title: 'The plan', note: 'what was agreed for the sale', flush: true },
      planTable(planRows(list), { team: !ctx.isClient, waiting, hrefOf, planHref: planHrefOf(ctx), onPick: { has: act => list.some(c => c.act === act), go: jumpToCard } }),
      err ? h('p', { class: 'wr3-quiet', style: { padding: '0 var(--pad-card) 16px' } }, 'The plan did not load: ' + err) : null);
  }

  /** Fresh plan or hour reads landed: redraw only the hero, the plan and the brand charts (no full page redraw). */
  function fillLate() {
    if (!alive()) return;
    if (!rec() || !calcAll().length) return draw();          // no check-in for this view: the fallback page redraws whole
    const list = calcAll();
    if (hosts.hero && hosts.hero.isConnected) { const n = paceHero(heroModel(list)); hosts.hero.replaceWith(n); hosts.hero = n; }
    if (hosts.plan && hosts.plan.isConnected) { const n = planSection(list); hosts.plan.replaceWith(n); hosts.plan = n; }
    for (const c of list) { const s = hosts.sparks[c.act]; if (s && s.host.isConnected) fillSpark(c, s.host); }
  }

  /* ---------- sheets ---------- */
  function closeOnLeave(s) {
    const off = () => { window.removeEventListener('hashchange', off); if (s.el.isConnected) s.close(); };
    window.addEventListener('hashchange', off);
    return s;
  }

  /** This campaign today, check-in to check-in: spend and Triple Whale sales (last click) between the records read. */
  function campToday(c, cp) {
    const R = rec(), day = R.today || slotDate(R.slot);
    const pts = S.records.filter(r => slotDate(r.slot) === day).map(r => {
      const b = (r.brands || []).find(x => x.act_id === c.act);
      const k = b && b.meta && (b.meta.camps || []).find(x => String(x.id) === cp.id);
      return k ? { slot: r.slot, spent: +k.spent || 0, rev: (+k.t_roas || 0) * (+k.spent || 0) } : null;
    }).filter(Boolean).sort((p, q) => slotHour(p.slot) - slotHour(q.slot));
    if (!pts.length) return null;
    let ps = 0, pr = 0, ph = 0;
    return pts.map(p => {
      const o = { label: `${hourWord(ph)} to ${hourWord(slotHour(p.slot))}`, spend: Math.max(0, p.spent - ps), sales: Math.max(0, p.rev - pr) };
      ps = p.spent; pr = p.rev; ph = slotHour(p.slot);
      return o;
    });
  }

  function campSheet(c, cp) {
    const word = callWord(c, cp), tone = callTone(c, cp);
    const W = cp.w, since = sinceWord(c);
    const wTile = (label, key, w) => h('div', { class: 'wr3-tile' },
      h('span', { class: 'hd' }, defLabel(label, key)),
      h('span', { class: 'k' }, defLabel('ROAS', 'roas')),
      h('span', { class: 'mer ' + (roasTone(w, c) ? roasTone(w, c) + '-t' : '') }, roasTxt(w)),
      h('span', { class: 'ln' }, defLabel('Spend', 'ad_spend'), h('span', null, w ? usd(w.spend) : '...')),
      h('span', { class: 'ln' }, defLabel('Sales', { title: 'Sales (this campaign)', body: 'The store sales Triple Whale credits to this campaign, last platform click.' }), h('span', null, w ? usd(w.rev) : '...')));
    /* today, check-in to check-in */
    const tl = campToday(c, cp);
    const todayBlock = h('div', { class: 'sec' },
      h('h4', null, defLabel('Today', 'today'), ', check-in to check-in'),
      h('p', { class: 'dim' }, 'One bar per check-in, not per hour: the check-in records are the only per campaign numbers through the day. The whole store by the hour is under Today by the hour on the brand card.'),
      tl && tl.length ? [legend([{ name: 'Sales (Triple Whale, last click)', square: true, color: 'var(--ink)' }, { name: 'Spend' }]),
        lineChart({
          series: [{ name: 'Sales', type: 'bar', values: tl.map(t => t.sales) }, { name: 'Spend', values: tl.map(t => t.spend), end: false, points: true }],
          labels: tl.map(t => t.label), slots: true, height: 180, phoneHeight: 170, endLabels: false, fill: false, yTicks: 2, format: v => money(v, { compact: true }),
          label: `${cp.name}: spend and sales between today's check-ins`,
          tooltip: i => [h('div', { class: 'lx-tip-h' }, tl[i].label + ' CT'), tipRow('ink', 'Sales', money(tl[i].sales)), tipRow('slate', 'Spend', money(tl[i].spend)), tipRow(null, 'ROAS', tl[i].spend > 0 ? fx(tl[i].sales / tl[i].spend) : 'n/a')],
        })]
        : h('p', { class: 'dim' }, S.probing ? 'Reading the earlier check-ins...' : 'Only one check-in today so far.'));
    const picHost = h('div', { class: 'sec' });
    const m = c.b.meta || {};
    /* Set budget at the bottom, prefilled with the suggestion */
    const from = cp.done && ok(cp.done.to) ? cp.done.to : cp.daily;
    const sug = hasSuggestion(c, cp) && cp.move.from === from && !outOfDate(c) ? cp.move.to : null;
    const amt = h('input', { class: 'lx-input', type: 'number', min: String(MIN_BUDGET), step: '5', inputmode: 'decimal', enterkeyhint: 'done', value: String(sug ?? from ?? ''), 'aria-label': 'New daily budget' });
    const goBtn = h('span');
    const drawGo = () => {
      const v = Math.round(+amt.value);
      put(goBtn, sug != null && v === sug
        ? button(`Approve: ${money(sug)} a day`, { primary: true, large: true, onclick: () => { sh.close(); approveSheet(c, cp); } })
        : button(ok(v) && v > 0 ? `Set ${money(v)} a day` : 'Set budget', { primary: true, large: true, disabled: !(v >= MIN_BUDGET) || null, onclick: () => { sh.close(); approveSheet(c, cp, { manual: true, amount: v }); } }));
    };
    amt.oninput = drawGo; drawGo();
    const setBlock = write && !cp.abo && from ? h('div', { class: 'sec' },
      h('h4', null, 'Set budget'),
      h('label', null, defLabel('New budget a day', 'budget_a_day'), amt),
      h('p', { class: 'hint' }, sug != null ? `Suggested by ${APP_NAME}: ${money(sug)}. Type another amount to change it.` : `Now ${money(from)} a day. Type the new amount.`),
      ownerNote(c) ? h('p', { class: 'wr3-amber' }, ownerNote(c)) : null,
      h('div', { class: 'btns' }, goBtn, cp.done && cp.done.write ? button('Undo', { large: true, onclick: () => { sh.close(); undo(c, cp); } }) : null))
      : cp.abo ? h('p', { class: 'dim' }, 'Ad set budgets: set them by hand in Ads Manager.') : null;
    const body = h('div', { class: 'wr3-sh' },
      h('div', { class: 'call' },
        h('span', { class: 'wr3-lab' }, platformChip('meta', { label: PLATFORM }), ` campaign, ${c.name}`),
        h('b', { class: tone ? tone + '-t' : '' }, cp.done ? doneText(cp) : cp.move ? decisionText(cp) : `${word}: ${cp.name} (${PLATFORM})`),
        extraWhy(cp) ? h('p', { class: 'wr3-amber' }, extraWhy(cp)) : null,
        cp.why && !cp.move ? h('p', { class: 'dim' }, reasonOnly(cp.why)) : null),
      h('div', { class: 'wr3-tiles' },
        wTile(since ? `Since ${since}` : 'Since check-in', 'since_check_in', W.since),
        wTile(outOfDate(c) ? asOfWords(callAt(c)) : 'Today', 'today', W.today),
        wTile('This week', 'this_week', W.week)),
      todayBlock,
      picHost,
      h('dl', null,
        h('dt', null, defLabel('Budget a day', 'budget_a_day')), h('dd', null, cp.daily ? money(cp.daily) : 'Ad set budgets'),
        h('dt', null, defLabel('Spent today', 'spent_today')), h('dd', null, money(cp.spent)),
        ok(cp.pace) && cp.daily ? [h('dt', null, defLabel('Pace', 'pace')), h('dd', null, `${Math.round(cp.pace * 100)}%`)] : null,
        c.roas && ok(c.roas.goal) ? [h('dt', null, defLabel('Goal ROAS', { title: 'Goal ROAS', body: 'The ROAS this brand asks of each campaign. Set in Brand settings > Goals.' })), h('dd', null, fx(c.roas.goal))] : null,
        c.roas && ok(c.roas.be) ? [h('dt', null, defLabel('Break-even ROAS', 'break_even_roas')), h('dd', null, fx(c.roas.be) + (c.roas.assumed ? ' (assumed)' : ''))] : null,
        ok(m.limit) ? [h('dt', null, defLabel('Meta daily limit', { title: 'Meta daily limit', body: 'The most the whole ad account may spend in a day, set in Meta. A raise is capped so every budget fits under it.' })), h('dd', null, `${money(m.limit)}${m.limit_src === 'known' ? ' (last known)' : ''}`)] : null,
        cp.last ? [h('dt', null, defLabel('Last budget change', 'last_budget_change')), h('dd', null, `${clockCT(cp.last.at)}, ${agoWords(nowOf() - cp.last.at)} ago, $${Math.round(cp.last.spent_since)} spent since`)] : null),
      cp.done ? h('div', { class: 'ok' }, `Done, ${money(cp.done.to)} a day, by ${cp.done.by} at ${clockCT(Date.parse(cp.done.at))}.`) : null,
      setBlock);
    const sh = closeOnLeave(sheet({ title: cp.name, body, side: 'right' }));
    fillPicture(c, cp, picHost);
  }

  /* ---------- the full picture for one campaign (rule w1), read only when its panel opens ---------- */
  const picKey = c => c.act + '|' + ((rec() && rec().slot) || '');
  /** One GET per brand per check-in: Meta's own rows for every campaign this week, with Triple Whale first click. */
  function readPicture(c) {
    const key = picKey(c);
    if (S.picture[key]) return S.picture[key];
    const R = rec(), to = R.today || slotDate(R.slot), from = (c.b.week && c.b.week.from) || mondayOf(to);
    const p = (async () => {
      if (ctx.sample) {
        const all = (f() && f().hub_paid) || {};
        if (!all[c.act]) throw new Error('No sample numbers for this brand.');
        return { from, to, camps: all[c.act].campaigns || [] };
      }
      const q = `platform=meta&act=${encodeURIComponent(c.act)}&model=fullFirstClick&cmp=none&from=${from}&to=${to}`;
      const r = await ctx.api('/api/hub/paid?' + q, { signal: ctx.signal });
      const b = r && r.brands && r.brands[0];
      return { from, to, camps: (b && b.campaigns) || [] };
    })();
    S.picture[key] = p;
    p.catch(() => { if (S.picture[key] === p) delete S.picture[key]; });   // a failed read is tried again next open
    return p;
  }
  async function fillPicture(c, cp, host) {
    put(host, h('h4', null, 'The full picture this week'), h('p', { class: 'dim' }, 'Reading...'));
    const raw = ((c.b.meta && c.b.meta.camps) || []).find(x => String(x.id) === cp.id) || {};
    let P = null, err = '';
    try { P = await readPicture(c); } catch (e) { if (e && e.name === 'AbortError') return; err = errText(e); }
    if (!host.isConnected) return;
    const m = P ? P.camps.find(x => String(x.id) === cp.id) || null : null;
    const NA = 'not available';
    const n0 = v => ok(v) ? Math.round(v).toLocaleString('en-US') : null;
    const pct = v => ok(v) ? (v * 100).toFixed(2) + '%' : null;
    const row = (label, val) => [h('dt', null, label), h('dd', { class: val == null || val === '' ? 'na' : '' }, val == null || val === '' ? NA : val)];
    const both = (a, b) => (a == null && b == null ? null : `${a == null ? NA : a} · ${b == null ? NA : b}`);
    /* a campaign with no Triple Whale sales on record is not read, so its 0 is not shown as a reading */
    const lcOrd = !cp.no_tw && ok(+raw.w_ord) ? +raw.w_ord : null, lcRoas = !cp.no_tw && cp.w.week && ok(cp.w.week.roas) ? cp.w.week.roas : null;
    /* first click: a brand with no first click credit at all this week reads as not available rather than 0 sales */
    const noFc = !!P && P.camps.some(x => x.spend > 0) && P.camps.every(x => !(+x.purchases) && !(+x.revenue));
    const fcOrd = m && !noFc ? n0(m.purchases) : null;
    const fcRoas = m && !noFc && m.spend > 0 && ok(m.revenue) ? m.revenue / m.spend : null;
    const plRoas = m && m.spend > 0 && ok(m.platform_revenue) ? m.platform_revenue / m.spend : null;
    const views = m && ok(m.hook) && ok(m.impressions) ? Math.round(m.hook * m.impressions) : null;
    /* the funnel: link clicks > add to carts > checkouts > purchases (Triple Whale, last click) */
    const steps = m ? [['Link clicks', m.clicks, 'link_clicks'], ['Add to carts', m.atc, 'add_to_carts'], ['Checkouts started', m.checkouts, 'checkouts_started'], ['Purchases (Triple Whale, last click)', lcOrd, 'purchases_last_click']] : [];
    const top = steps.length && ok(+steps[0][1]) && +steps[0][1] > 0 ? +steps[0][1] : null;
    const funnel = top ? h('div', { class: 'wr3-fun', role: 'list', 'aria-label': 'This week, from click to purchase' }, steps.map(([label, v, key], i) => {
      const prev = i ? steps[i - 1][1] : null;
      const rate = i && ok(+v) && ok(+prev) && +prev > 0 && +v <= +prev ? Math.round(+v / +prev * 1000) / 10 + '% of the step before' : '';
      /* bar width in step with the number beside it (linear), with a 2% floor so a small step is still seen */
      return h('div', { role: 'listitem' }, defLabel(label, key), h('b', null, ok(+v) ? n0(+v) : NA, rate ? h('small', null, rate) : null),
        h('i', { style: { '--v': ok(+v) ? Math.max(2, +v / top * 100).toFixed(1) + '%' : '0%' } }));
    })) : null;
    put(host,
      h('h4', null, 'The full picture this week', P ? h('span', { class: 'wr3-lab', style: { fontWeight: 400 } }, `, ${md(P.from)} to ${md(P.to)}`) : null),
      err ? h('p', { class: 'dim' }, 'Could not read the Meta rows: ' + err) : null,
      P && !m ? h('p', { class: 'dim' }, 'No Meta rows for this campaign this week yet.') : null,
      funnel,
      m ? h('dl', null,
        row(defLabel('Ad spend (Meta)', 'ad_spend'), usd(m.spend)),
        row(defLabel('CTR', 'ctr'), pct(m.ctr)),
        row(defLabel('CPM · frequency', 'cpm_frequency'), both(ok(m.cpm) ? usd(m.cpm) : null, ok(m.frequency) ? m.frequency.toFixed(2) : null)),
        row(defLabel('Cost per add to cart', 'cost_per_add_to_cart'), ok(m.cost_per_atc) ? usd(m.cost_per_atc) : null),
        row(defLabel('Video views (3 seconds)', 'video_views_3s'), views != null && views > 0 ? n0(views) : null),
        row(defLabel('Last click: sales · ROAS', { title: 'Triple Whale, last click', body: 'Purchases Triple Whale credits to this campaign when it was the last ad clicked. This is what the call reads.' }), both(lcOrd != null ? n0(lcOrd) : null, ok(lcRoas) ? fx(lcRoas) : null)),
        row(defLabel('First click: sales · ROAS', { title: 'Triple Whale, first click', body: 'Purchases credited when this campaign was the first ad clicked. It shows the campaigns that open the funnel, which last click undercounts.' }), both(fcOrd, ok(fcRoas) ? fx(fcRoas) : null)),
        row(defLabel('Meta reports: purchases · ROAS', { title: 'Meta reports', body: 'Meta\'s own count. A second opinion only: it usually runs higher than Triple Whale.' }), both(n0(m.platform_purchases), ok(plRoas) ? fx(plRoas) : null))) : null);
  }

  /* ---------- the one tap: dry run, then the write ---------- */
  /* manual: "Set budget", any amount by hand, PREFILLED with the suggested amount when there is one.
     Same sheet, same dry run, client line, big change tick and Undo. amount: an amount typed in the panel. */
  function approveSheet(c, cp, { typed = false, note = '', manual = false, amount: given = null } = {}) {
    if (!write || ctx.isClient || (S.probing && !manual)) return;
    /* an out of date call is never approved: only a budget typed by hand, which names no call */
    if (!manual && outOfDate(c)) { toast(OUT_OF_DATE + '.'); return; }
    const R = rec();
    /* after a change from this page, Meta has the new figure, so a hand-set starts from it */
    const from = manual && cp.done && ok(cp.done.to) ? cp.done.to : cp.daily;
    if (!from) { toast('Ad set budgets: change this one by hand in Ads Manager.'); return; }
    /* prefill only a suggestion the page itself stands behind: shown as a move, earlier check-ins read, worked out
       from the budget this sheet starts on */
    const sug = hasSuggestion(c, cp) && cp.move.from === from && !outOfDate(c) ? cp.move.to : null;
    const start = ok(given) && given > 0 ? given : sug ?? from;
    const amount = h('input', { class: 'lx-input', type: 'number', min: String(MIN_BUDGET), step: '5', inputmode: 'decimal', pattern: '[0-9]*', enterkeyhint: 'done', value: String(start), 'aria-label': 'New daily budget' });
    const jump = h('input', { type: 'checkbox' });
    const jumpWrap = h('label', { class: 'tick', hidden: true }, jump, 'I mean this jump');
    const whyNote = h('p', { class: 'dim', hidden: true }), gateNote = h('p', { class: 'wr3-amber', hidden: true });
    const light = c.gate && c.gate.light;
    const why = h('textarea', { class: 'lx-input', maxlength: '600', rows: '2', 'aria-label': 'What the client will read' });
    const autoWhy = to => clientWhy({ ...cp, call: !manual && cp.call === 'putback' && to === (cp.move && cp.move.to) ? 'putback' : manual ? 'x' : cp.call, move: { from, to } }, { manual }) || `We changed the budget on ${cp.name}.`;
    why.value = start !== from ? autoWhy(start) : '';
    if (manual && start === from) why.placeholder = 'Fills in when you type an amount';
    let whyTyped = false; why.oninput = () => { whyTyped = true; };
    const status = h('div'), btns = h('div', { class: 'btns' });
    let dry = null, busy = false;
    const toOf = () => Math.round(+amount.value);
    const check = () => {
      const to = toOf();
      if (!(to >= MIN_BUDGET)) return `Type a budget of at least $${MIN_BUDGET} a day.`;
      if (to === from) return 'That is the budget it has now.';
      if (to > from && ok(cp.room) && to > cp.room) return `Over the ${money(cp.limit)} Meta limit, room is ${money(Math.max(0, cp.room))} a day.`;
      const ch = Math.abs(to - from) / from;
      jumpWrap.hidden = ch <= MAX_STEP;
      if (ch > MAX_STEP && !jump.checked) return `That is ${Math.round(ch * 100)}% from today's ${money(from)}. Tick "I mean this jump" to go past 50%.`;
      return '';
    };
    const owner = ownerNote(c);
    const body = h('div', { class: 'wr3-sh' },
      note ? h('p', { class: 'wr3-amber' }, note) : null,
      owner ? h('p', { class: 'wr3-amber' }, owner) : null,
      h('dl', null,
        h('dt', null, 'Campaign'), h('dd', null, `${cp.name} (${PLATFORM}), ${c.name}`),
        h('dt', null, defLabel('Budget a day now', 'budget_a_day')), h('dd', null, money(from)),
        h('dt', null, defLabel('Spent today', 'spent_today')), h('dd', null, money(cp.spent)),
        h('dt', null, 'Check-in'), h('dd', null, R.label || R.slot)),
      extraWhy(cp) ? h('p', { class: 'dim' }, extraWhy(cp)) : null,
      h('label', null, defLabel('New budget a day', 'budget_a_day'), amount),
      sug != null ? h('p', { class: 'hint' }, `Suggested by ${APP_NAME}: ${money(sug)}. Type another amount to change it.`) : null,
      jumpWrap,
      h('label', null, 'What the client will read', why),
      whyNote, gateNote, status, btns);
    const verb = cp.call === 'putback' && !manual ? 'Put back' : start > from ? 'Raise' : start < from ? 'Cut' : 'Change';
    const sh = closeOnLeave(sheet({ title: manual ? `Set the budget on ${cp.name} (${PLATFORM})` : `${verb} ${cp.name} (${PLATFORM})?`, body, side: 'right' }));
    if (typed || manual) setTimeout(() => { amount.focus(); amount.select(); }, 60);
    const reset = () => { dry = null; if (!whyTyped) why.value = toOf() !== from ? autoWhy(toOf()) : ''; drawBtns(); };
    amount.oninput = reset; jump.onchange = reset;

    function drawBtns(msg, tone, extra) {
      const err = check();
      const t = toOf(), via = matchesCheckin(c.b, { ...cp, move: { from, to: t } }) && !outOfDate(c);
      whyNote.hidden = !via;
      whyNote.textContent = via ? 'This is the check-in\'s own move, so it goes through the check-in\'s Approve and the client reads the check-in\'s standard line, not the text above.' : '';
      const against = !!light && ((t > from && light !== 'green') || (t < from && light === 'green'));
      gateNote.hidden = !against;
      gateNote.textContent = against ? (t > from ? 'The store gate holds raises right now: ' : 'The store is over goal, so the gate holds cuts: ') + (c.gate.why || '') : '';
      put(status, msg ? h('div', { class: tone || 'err', role: tone === 'ok' ? 'status' : 'alert' }, msg) : err ? h('p', { class: 'dim' }, err) : null);
      const to = toOf();
      put(btns,
        extra || null,
        extra ? null : dry ? button(busy ? 'Writing to Meta...' : `Yes, change it to ${money(to)} a day`, { primary: true, large: true, disabled: busy || !!err || null, onclick: go })
          : button(busy ? 'Checking with Meta...' : 'Check with Meta', { primary: true, large: true, disabled: busy || !!err || null, onclick: dryRun }),
        button('Cancel', { large: true, onclick: () => sh.close() }));
    }
    const bodyOf = to => ({ act: c.act, kind: 'budget', level: 'campaign', object: cp.id, amount: to,
      reason: (manual ? `War Room ${R.label || R.slot}: set by hand (the page said ${CALL_WORD[cp.call] || 'Hold'})` : `War Room ${R.label || R.slot}: ${cp.why || CALL_WORD[cp.call] || ''}`).slice(0, 280), client_why: why.value.trim() });

    async function dryRun() {
      if (check() || busy) return;
      busy = true; drawBtns();
      const to = toOf();
      let d;
      if (ctx.sample) d = { ok: true, dry: true, before: { daily_budget: String(Math.round(from * 100)) }, summary: `Sample: ${cp.name} ${money(from)} a day to ${money(to)} a day. No real ad account was read.` };
      else { try { d = await ctx.api('/api/meta/write', { worker: 'ah', method: 'POST', body: { ...bodyOf(to), dry: true } }); } catch (e) { d = { error: errText(e) }; } }
      busy = false;
      if (!d || d.error) { dry = null; drawBtns('Not checked. ' + ((d && d.error) || 'Meta did not answer.')); return; }
      const before = d.before && d.before.daily_budget != null ? +d.before.daily_budget / 100 : null;
      if (ok(before) && Math.round(before) !== Math.round(from)) {
        /* the budget moved since the check-in: nothing is written on the old figure, start again on the real one */
        dry = null;
        const again = button(`Start again on ${money(before)}`, { primary: true, large: true, onclick: () => { sh.close(); approveSheet(c, manual ? { ...cp, daily: before, done: null, move: null } : restep(before), { typed, manual, note: `Meta had it at ${money(before)} a day, not the ${money(from)} the check-in saw. This is worked out from ${money(before)}.` }); } });
        drawBtns(`Meta has it at ${money(before)} a day now, not the ${money(from)} the check-in saw. Nothing was written.`, 'err', again);
        return;
      }
      dry = { d, to };
      drawBtns((d.summary || `${cp.name}: ${money(before ?? from)} a day to ${money(to)} a day.`) + ' Tap Yes to write it.', 'ok');
    }
    /* the same call worked out again on the budget Meta really has */
    function restep(daily) {
      const room = cp.room;                                         // the limit minus the other budgets, which did not move
      let to = null;
      if (STEP_PCT[cp.call] != null) to = stepTo(daily, STEP_PCT[cp.call]);
      else if (cp.call === 'putback' && cp.move && cp.move.to < daily) to = cp.move.to;
      if (to != null && to > daily && ok(room) && to > room) to = Math.floor(room / 5) * 5;
      const good = to != null && to !== daily && (!cp.move || Math.sign(to - daily) === Math.sign(cp.move.to - cp.move.from));
      return { ...cp, daily, room, move: good ? { from: daily, to, pct: (to - daily) / daily } : null, call: good ? cp.call : 'hold' };
    }
    async function go() {
      if (!dry || busy || check()) return;
      const to = toOf();
      if (to !== dry.to) { dry = null; drawBtns(); return; }
      /* the call went out of date while the sheet was open: nothing is written on it (a typed budget still goes) */
      if (!manual && outOfDate(c)) { dry = null; drawBtns(OUT_OF_DATE + '. Nothing was written.'); return; }
      if (!why.value.trim()) { drawBtns('Write the line the client will read.'); return; }
      busy = true; drawBtns();
      const big = Math.abs(to - from) / from > MAX_STEP;
      /* the check-in's own move goes through its Approve (Slack batch fills in); approve() refuses records over 6 hours old */
      const viaCheckin = matchesCheckin(c.b, { ...cp, move: { from, to } }) && !outOfDate(c);
      let r;
      if (ctx.sample) r = { ok: true, write: 'sample_' + Date.now().toString(36), summary: '' };   // never sent anywhere; unique so a sample Undo takes off only its own row
      else if (viaCheckin) {
        try { r = await ctx.api('/api/standing/approve', { worker: 'ah', method: 'POST', body: { slot: R.slot, act: c.act } }); } catch (e) { r = { error: errText(e) }; }
      } else {
        const expect = dry.d.before && dry.d.before.daily_budget != null ? { daily_budget: dry.d.before.daily_budget } : undefined;
        try { r = await ctx.api('/api/meta/write', { worker: 'ah', method: 'POST', body: { ...bodyOf(to), expect, ...(big ? { big: true } : {}) } }); } catch (e) { r = { error: errText(e) }; }
      }
      busy = false;
      if (!r || r.error || (viaCheckin && !r.ok)) { dry = null; drawBtns('Not changed. ' + ((r && r.error) || 'The server did not say why.')); return; }
      const by = (ctx.me && (ctx.me.name || ctx.me.email)) || 'you', at = new Date(nowOf()).toISOString();
      /* prev: the earlier change from this page on the same campaign, so an Undo of this one goes back to it */
      const key = doneKey(c.act, cp.id);
      S.done[key] = { from, to, by, at, write: r.write || null, slack: viaCheckin, prev: S.done[key] || null };
      /* the change counts at once for the "not read yet" warning and the client card */
      S.data.acts = [{ act_id: c.act, object_id: cp.id, object_name: cp.name, category: 'budget', event_time: at, summary: `$${from}/day → $${to}/day`, client_why: why.value.trim(), actor: by, local: true,
        write: r.write || null, note: r.write ? `Write ${r.write}.` : '' }, ...(S.data.acts || [])];
      if (!ctx.sample) forgetWaiting();
      sh.close();
      toast(ctx.sample ? SAMPLE_MSG : `Done, ${money(to)} a day, by ${by} at ${clockCT(Date.parse(at))}`, { tone: 'good', ms: 4000 });
      draw();
    }
    drawBtns();
  }

  function undo(c, cp) {
    const d = S.done[doneKey(c.act, cp.id)] || cp.done;
    if (!d || !d.write) return;
    undoSheet(ctx, { act: c.act, write: d.write, what: `${cp.name} (${PLATFORM}): back to ${money(d.from)} a day`, name: c.name }, okd => {
      if (!okd) return;
      /* only this write comes off: an earlier change from here stays live in Meta, on the card and undoable */
      const key = doneKey(c.act, cp.id);
      if (d.prev) S.done[key] = d.prev; else delete S.done[key];
      const at = new Date(nowOf()).toISOString();
      S.data.acts = [{ act_id: c.act, object_id: cp.id, object_name: cp.name, category: 'other', event_time: at, summary: `Undone: $${d.from}/day → $${d.to}/day`,
        note: `Undo of ${d.write}.`, write: d.write, local: true },
        ...(S.data.acts || []).filter(a => !(a.local && a.write && a.write === d.write && a.act_id === c.act))];
      draw();
    });
  }

  /* ---------- cadence ---------- */
  function cadenceSheet(c) {
    const cur = c.cadence, msg = h('div'), sug = cadenceSuggest(c.b, cur);
    const pick = async n => {
      if (n === cur) return;
      if (ctx.sample) toast('Sample: nothing was saved');
      else {
        try { await ctx.api('/api/season/answer', { method: 'PUT', body: { act: c.act, key: 'checkin_hours', value: String(n) } }); }
        catch (e) { put(msg, h('div', { class: 'err', role: 'alert' }, 'Not saved. ' + errText(e))); return; }
        toast(`${c.name}: check-in every ${n} hours`, { tone: 'good' });
      }
      S.data.answers = { ...(S.data.answers || {}), [c.act]: { ...((S.data.answers || {})[c.act] || {}), checkin_hours: String(n) } };
      sh.close(); draw(); probe();
    };
    const body = h('div', { class: 'wr3-sh' },
      h('p', null, 'Check in every:'),
      sug ? h('p', { class: 'wr3-amber' }, `Suggested: every ${sug.hours} hours. ${sug.why}`) : null,
      segmented(CADENCE_CHOICES.map(n => ({ id: n, label: n + 'h' })), CADENCE_CHOICES.includes(cur) ? cur : null, pick),
      h('p', { class: 'dim' }, 'From 8am Central, the last one by 10pm. It sets when the card says "Check-in due", which earlier check-in "Since" counts from, and when the client update is due. Every brand starts at 6 hours.'),
      msg);
    const sh = closeOnLeave(sheet({ title: `${c.name}: check-in rhythm`, body, side: 'bottom' }));
  }

  /* ---------- today by the hour (a chart, from the war read; read here when it has not landed yet) ---------- */
  async function hourSheet(c) {
    const body = h('div', { class: 'wr3-sh' }, h('p', { class: 'dim' }, 'Reading Triple Whale...'));
    closeOnLeave(sheet({ title: `${c.name}: today by the hour`, body, side: 'right' }));
    let D = S.hourCache[c.act];
    if (!D) {
      try { D = await readWarOne(c.act); } catch (e) { return put(body, h('p', { class: 'err' }, 'Could not read it: ' + errText(e))); }
    }
    const hs = hourSeries([D]);
    if (!hs) return put(body, h('p', { class: 'dim' }, 'No sales or spend yet today.'));
    const sales = hs.sales.reduce((t, v) => t + v, 0), spend = hs.spend.reduce((t, v) => t + v, 0);
    const best = hs.sales.indexOf(Math.max(...hs.sales));
    put(body,
      h('div', { class: 'wr3-tiles' },
        h('div', { class: 'wr3-tile' }, h('span', { class: 'hd' }, defLabel('Sales', 'sales')), h('span', { class: 'mer' }, money(sales))),
        h('div', { class: 'wr3-tile' }, h('span', { class: 'hd' }, defLabel('Ad spend', 'ad_spend')), h('span', { class: 'mer' }, money(spend))),
        h('div', { class: 'wr3-tile' }, h('span', { class: 'hd' }, defLabel('Store MER', 'mer')), h('span', { class: 'mer ' + (merTone(spend > 0 ? sales / spend : null, c) ? merTone(spend > 0 ? sales / spend : null, c) + '-t' : '') }, fx(spend > 0 ? sales / spend : null)))),
      h('div', { class: 'wr3-ch' }, h('div', { class: 'lx-chart-h' }, h('span', { class: 'wr3-lab' }, '12am Central to now, whole store'), hourLegend(hs)),
        hourChart(hs, { height: 260, phoneHeight: 220 })),
      h('p', { class: 'dim' }, `Best hour for sales so far: ${hourWord(best)} to ${hourWord(best + 1)}.`));
  }

  /* ---------- the client update card ---------- */
  function cardData(c) {
    const R = rec(), W = c.windows, recDate = R.today || slotDate(R.slot);
    const since = W.since || { label: 'Since last update', readable: false };
    const fromMs = c.prvRec ? Date.parse(c.prvRec.at) : Date.parse(recDate + 'T06:00:00Z');
    /* an 'Undone:' row for the same write id takes the change off the card */
    const changes = clientChanges(S.data.acts, c.act, fromMs)
      .map(a => {
        const { from: fr, to } = parseBudget(a.summary);
        const name = a.object_name || 'a campaign', why = String(a.client_why).trim();
        /* never the internal summary: when the amounts do not read, the client line alone */
        if (!(ok(fr) && ok(to)) || fr === to) return { line: why, why: '' };
        return { line: `${to > fr ? 'Raised' : 'Lowered'} ${name} (${PLATFORM}) from ${money(fr)} to ${money(to)} a day`, why };
      });
    return {
      brand: c.name, goal: c.goal,
      when: `${dayLabel(recDate)} · ${hourWord(slotHour(R.slot))} CT`,
      tiles: [
        { label: since.label, mer: since.mer, sales: since.sales, spend: since.spend, readable: !!since.readable },
        { label: 'Today', mer: W.today.mer, sales: W.today.sales, spend: W.today.spend, readable: !!W.today.readable },
        { label: 'This week (Mon to now)', mer: W.week.mer, sales: W.week.sales, spend: W.week.spend, readable: !!W.week.readable }],
      changes,
      next: nextDue(c.cadence, c.recHour) + ' CT',
    };
  }
  const fileOf = c => `${String(c.name).toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${rec().slot}.png`;
  function snapshotLink(c, d) {
    const key = c.act + '|' + rec().slot;
    if (S.links[key]) return Promise.resolve(S.links[key]);
    if (S.linkBusy[key]) return S.linkBusy[key];                  // one POST per check-in, however many taps
    const title = `Black Friday update · ${d.when.split(' · ')[0].split(' ')[0]} ${hourWord(slotHour(rec().slot))}`;
    const p = (async () => {
      if (ctx.sample) return new URL('../s.html?t=sample', location.href).href;
      const r = await ctx.api('/api/snapshot', { method: 'POST', body: { act: c.act, kind: 'card', title, html: cardHtml(d), css: CARD_CSS, days: 30 } });
      if (!r || !r.token) throw new Error((r && r.error) || 'No link came back.');
      return new URL('../s.html?t=' + r.token, location.href).href;
    })().then(l => { S.links[key] = l; return l; }).finally(() => { delete S.linkBusy[key]; });
    S.linkBusy[key] = p;
    return p;
  }

  /** POST /api/standing/send {act, slot} (account-health, owner only), with a 20 second limit. Never silent.
      Replies, as the route answers them:
        200 {ok:true, slot, name, sent:true}                          sent
        200 {ok:false, skipped:'sent' | 'sent in the last 2 hours'}   already sent
        200 {ok:false, skipped:'sending' | 'forme' | 'skipped'}       another tap is sending / owner only / do not send
        403 / 404 / 502 {error}                                       the server's words, with Try again
      Returns { tone, text, sent?, done?, retry?, link?, left? }: done = nothing more to do here, so Send is not offered
      again; link = offer Copy link; left = the page was left before an answer. */
  async function sendUpdate(c) {
    const slot = rec().slot;
    if (ctx.sample) return { tone: 'info', text: "Sample mode: nothing was sent and no server was called. With real numbers this posts the update to the client's Slack channel.", done: true };
    const ac = new AbortController();
    let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; ac.abort(); }, SEND_TIMEOUT);
    const outer = () => ac.abort();
    if (ctx.signal) ctx.signal.addEventListener('abort', outer, { once: true });
    let r;
    try { r = await ctx.api('/api/standing/send', { worker: 'ah', method: 'POST', body: { act: c.act, slot }, signal: ac.signal }); }
    catch (e) {
      if (e && e.name === 'AbortError') {
        if (timedOut) return { tone: 'err', text: 'No answer from the server after 20 seconds. It may still have sent: check the client channel before you try again.', retry: true };
        return { tone: 'info', text: 'You left the page before the server answered. It may still have sent: check the client channel.', left: true };
      }
      const body = (e && e.body) || {};
      /* a 404 with no error at all is an older server without the route, not an answer from it */
      if (e && e.status === 404 && !body.error) return { tone: 'info', text: `Sending from ${APP_NAME} is being switched on; use Copy link for now.`, done: true, link: true };
      return { tone: 'err', text: 'Not sent. ' + errText(e), retry: true, link: true };
    } finally { clearTimeout(timer); if (ctx.signal) ctx.signal.removeEventListener('abort', outer); }
    if (r && r.ok && r.sent) return { tone: 'ok', text: `Sent to ${r.name || c.name}'s client channel at ${clockCT(Date.now())}.`, sent: true };
    const sk = String((r && r.skipped) || '');
    if (/^sent/.test(sk)) return { tone: 'info', text: 'Already sent (the last one went out under 2 hours ago). Nothing was sent again.', done: true, link: true };
    if (sk === 'sending') return { tone: 'info', text: 'Already sending from another tap. Nothing was sent twice.', done: true };
    if (sk === 'forme') return { tone: 'info', text: `This one is for ${OWNER_FIRST} only, so it was not sent to the client.`, done: true };
    if (sk === 'skipped') return { tone: 'info', text: 'This check-in is marked do not send, so nothing was sent.', done: true };
    return { tone: 'err', text: 'Not sent. ' + ((r && (r.error || (sk && 'The server skipped it: ' + sk))) || 'The server did not say it was sent.'), retry: true, link: true };
  }
  /** The exact picture card the route sends (GET /api/standing/card.png, team only), as an <img>; the page's own card
      preview stays while it loads or when it cannot be read. */
  function realCard(c, host) {
    if (ctx.sample) return;
    const R = rec();
    fetch(`${workers().ah}/api/standing/card.png?act=${encodeURIComponent(c.act)}&slot=${encodeURIComponent(R.slot)}`, { headers: { Authorization: 'Bearer ' + token() }, signal: ctx.signal })
      .then(res => res.ok && /^image\//.test(res.headers.get('content-type') || '') ? res.blob() : null)
      .then(b => {
        if (!b || !host.isConnected) return;
        const url = URL.createObjectURL(b);
        const img = h('img', { src: url, alt: `The update card ${c.name}'s client channel gets`, style: { display: 'block', width: '100%', height: 'auto', borderRadius: '14px', border: '1px solid var(--line)' } });
        img.onload = () => setTimeout(() => URL.revokeObjectURL(url), 1000);
        put(host, img);
      }, () => {});
  }
  function sendSheet(c, d, onDone) {
    const status = h('div'), btns = h('div', { class: 'btns' });
    let busy = false;
    const cardHost = h('div');
    cardHost.innerHTML = cardHtml(d);
    realCard(c, cardHost);
    const drawBtns = res => {
      const over = res && (res.sent || res.done);
      put(btns,
        over ? null : button(busy ? 'Sending...' : res && res.retry ? 'Try again' : 'Send now', { primary: true, large: true, disabled: busy || null, onclick: go }),
        button('Copy link', { large: true, disabled: busy || null, onclick: () => copyLink(c, d, status) }),
        button(over ? 'Close' : 'Cancel', { large: true, disabled: busy || null, onclick: () => sh.close() }));
    };
    async function go() {
      if (busy) return;
      busy = true; put(status, null); drawBtns();
      const res = await sendUpdate(c);
      busy = false;
      if (res.left) return;
      put(status, h('div', { class: res.tone, role: res.tone === 'err' ? 'alert' : 'status' }, res.text));
      if (res.sent) { S.sent[c.act + '|' + rec().slot] = res.text; onDone && onDone(res); }
      drawBtns(res);
    }
    const changed = d.changes.length ? d.changes.map(x => `${x.line}${x.why ? '. ' + x.why : ''}`).join('\n') : NO_CHANGES;
    const body = h('div', { class: 'wr3-sh' },
      cardHost,
      h('h4', null, 'What changed'),
      h('div', { class: 'wr3-msg' }, changed),
      status, btns);
    const sh = closeOnLeave(sheet({ title: `Send this to ${c.name}'s client channel?`, body, side: 'right' }));
    drawBtns();
  }
  async function copyLink(c, d, say) {
    try {
      const l = await snapshotLink(c, d);
      try { await navigator.clipboard.writeText(l); toast(ctx.sample ? 'Sample link copied' : 'Link copied'); }
      catch { put(say, h('p', { class: 'dim' }, 'Copy this link: ' + l)); }
    } catch (e) { put(say, h('div', { class: 'err', role: 'alert' }, 'No link. ' + errText(e))); }
  }
  function clientBlock(c) {
    const d = cardData(c), host = h('div'), owner = ctx.sample || (ctx.role === 'owner' && !ctx.asClient);
    host.innerHTML = cardHtml(d);
    const msg = h('div');
    const say = (t, tone) => put(msg, h('div', { class: tone === 'bad' ? 'err' : 'info', role: tone === 'bad' ? 'alert' : 'status' }, t));
    const sentLine = h('div');
    const showSent = () => { const t = S.sent[c.act + '|' + rec().slot]; put(sentLine, t ? h('div', { class: 'ok', role: 'status' }, t) : null); };
    showSent();
    return h('div', { class: 'wr3-cu wr3-sh' },
      host,
      sentLine,
      h('div', { class: 'btns' },
        owner ? button('Send to client', { primary: true, onclick: () => sendSheet(c, d, showSent) }) : h('span', { class: 'hint' }, 'Only the owner sends to clients.'),
        button('Copy link', { onclick: e => { const b = e.currentTarget; b.disabled = true; copyLink(c, d, msg).finally(() => { b.disabled = false; }); } })),
      h('div', { class: 'wr3-act' },
        button('Copy as PNG', { onclick: async () => { const r = await copyCard(d, fileOf(c)).catch(e => { say(errText(e), 'bad'); return null; }); if (r) toast(r === 'copied' ? 'Picture copied' : 'This browser cannot copy pictures, so it downloaded instead'); } }),
        button('Download PNG', { onclick: async () => { try { await downloadCard(d, fileOf(c)); } catch (e) { say('Could not draw it. ' + errText(e), 'bad'); } } }),
        button('Download PDF', { onclick: async () => { try { await downloadCardPdf(d, fileOf(c).replace(/\.png$/, '.pdf')); } catch (e) { say('Could not make the PDF. ' + errText(e), 'bad'); } } })),
      msg);
  }
  function clientSheet(c) {
    closeOnLeave(sheet({ title: `${c.name}: client update`, body: clientBlock(c), side: 'right' }));
  }

  /* ---------- the board export (team only): store lines, per brand numbers, campaign calls ---------- */
  function boardModel(list) {
    const R = rec(), recDate = R.today || slotDate(R.slot);
    const hm = heroModel(list);
    const store = ok(hm.sales) ? [`Sales ${money(hm.sales)}${hm.goal ? ` of the ${money(hm.goal)} goal (${Math.round((ok(hm.goalSales) ? hm.goalSales : hm.sales) / hm.goal * 100)}%)` : ''}, ad spend ${money(hm.spend)}, store MER ${fx(hm.mer)}${ok(hm.target) ? ` against the ${fx(hm.target)} goal MER` : ''}. ${hm.period}${hm.scope ? ', ' + hm.scope.toLowerCase() : ''}.`] : [];
    const tone = (w, c) => !w || !w.readable ? '' : merTone(w.mer, c) === 'good' ? 'good' : merTone(w.mer, c) === 'bad' ? 'bad' : '';
    return {
      title: one && list[0] ? `${list[0].name}: Black Friday War Room` : 'Black Friday War Room',
      when: `${dayLabel(recDate)}, checked ${hourWord(slotHour(R.slot))} CT${S.probing ? ' (earlier check-ins still reading)' : ''}`,
      store,
      brands: list.map(c => {
        const lt = c.gate && c.gate.light ? LIGHT[c.gate.light] : null;
        const W = c.windows, win = (w, label) => w ? { label: w.label || label, mer: w.mer, sales: w.sales, spend: w.spend, readable: !!w.readable, tone: tone(w, c) } : { label, readable: false };
        const pend = pendingOf(c);
        return {
          name: c.name, light: lt ? { word: lt[1], tone: lt[0] } : null,
          goal: ok(c.goal) ? `Goal MER ${fx(c.goal)}${ok(c.be) ? `, break-even ${fx(c.be)}` : ''}${c.roas && ok(c.roas.goal) ? `, goal ROAS ${fx(c.roas.goal)}` : ''}` : '',
          windows: [win(W.since, 'Since last check-in'), win(W.today, 'Today'), { ...win(W.week, 'This week'), label: 'This week' }],
          lines: modeLine(c) ? [modeLine(c)] : pend.length ? pend.map(decisionText) : ['Hold all campaigns'],
          camps: c.camps.map(cp => ({
            name: `${cp.name} (${PLATFORM})`, since: roasTxt(cp.w.since), today: roasTxt(cp.w.today), week: roasTxt(cp.w.week),
            call: callWord(c, cp),
            tone: cp.done ? 'good' : cp.move ? CALL_TONE[cp.call] : '',
            move: cp.done ? `${money(cp.done.to)} a day` : cp.move ? `${money(cp.move.from)} to ${money(cp.move.to)}` : '',
          })),
        };
      }),
      foot: 'Team only. Sales and MER are Triple Whale; campaign ROAS is Triple Whale last click; budgets are Meta.',
    };
  }
  const boardFile = ext => `war-room-${one ? String((calcAll()[0] || {}).name || 'brand').toLowerCase().replace(/[^a-z0-9]+/g, '-') + '-' : ''}${rec().slot}.${ext}`;
  async function exportBoard(kind, btn) {
    const was = btn && btn.textContent;
    if (btn) { btn.disabled = true; btn.textContent = 'Drawing...'; }
    try {
      const cv = await boardCanvas(boardModel(calcAll()));
      if (kind === 'copy') { const r = await copyCanvas(cv, boardFile('png')); toast(r === 'copied' ? 'Board copied as a picture' : 'This browser cannot copy pictures, so it downloaded instead'); }
      else if (kind === 'png') await downloadCanvas(cv, boardFile('png'));
      else await downloadPdf([cv], boardFile('pdf'));
    } catch (e) { toast('Could not draw the board: ' + errText(e), { tone: 'bad', ms: 5000 }); }
    finally { if (btn && btn.isConnected) { btn.disabled = false; btn.textContent = was; } }
  }

  /* ---------- refresh and Check now ---------- */
  async function refresh(btn) {
    if (btn) { btn.disabled = true; btn.textContent = 'Reading...'; }
    try {
      if (ctx.sample) { toast('Sample: read the sample check-in again'); draw(); return; }
      const oldSlot = rec() && rec().slot;
      const r = await ctx.api('/api/standing', { worker: 'ah', signal: ctx.signal });
      if (!alive()) return;
      S.data = { ...S.data, standing: (r && r.standing) || S.data.standing, fetched_at: Date.now() };
      await rereadGoals();
      if (!alive()) return;
      if (rec() && rec().slot !== oldSlot) await newSlot();
      else { draw(); readWar({ force: true }); }              // the hour chart and the plan are read again too
    } catch (e) {
      if (!alive()) return;
      toast('Could not read the check-in: ' + errText(e), { tone: 'bad', ms: 5000 });
      if (btn && btn.isConnected) { btn.disabled = false; btn.textContent = 'Refresh'; }
    }
  }
  async function checkNow(btn) {
    btn.disabled = true; btn.textContent = 'Checking...';
    if (ctx.sample) { toast('Sample: no check-in was run'); btn.disabled = false; btn.textContent = 'Check now'; return; }
    try {
      const r = await ctx.api('/api/standing/run', { worker: 'ah', method: 'POST', body: {} });
      if (!r || !r.standing) throw new Error((r && r.error) || 'No check-in came back.');
      if (!alive()) return;
      S.data = { ...S.data, standing: r.standing, fetched_at: Date.now() };
      await rereadGoals();
      if (!alive()) return;
      toast('Checked. Every brand has fresh numbers.', { tone: 'good' });
      await newSlot();
    } catch (e) { if (!alive()) return; toast('Not checked: ' + errText(e), { tone: 'bad', ms: 6000 }); btn.disabled = false; btn.textContent = 'Check now'; }
  }
  /** The goal ROAS list again (on Refresh and Check now), so a failed first read does not stick. */
  async function rereadGoals() {
    if (ctx.sample || ctx.isClient) return;
    try { const goals = await readGoals(ctx); if (!alive()) return; S.data = { ...S.data, goals, goals_error: null }; }
    catch (e) { if (e && e.name === 'AbortError') return; S.data = { ...S.data, goals_error: errText(e) }; }
  }
  /** A new check-in: hold the moves, read the day's changes again (changes made elsewhere count), then the earlier
      check-ins and today by the hour again. */
  async function newSlot() {
    S.probing = true; S.probeId++;
    S.warGen++; S.hourCache = {}; S.hourP = {}; S.hourErr = {}; S.hourAt = {}; S.warBusy = true; S.insides = {};
    draw();
    if (!ctx.sample) {
      try { const acts = await readActs(ctx, one); if (!alive()) return; S.data = { ...S.data, acts }; }
      catch { if (!alive()) return; }                              // keep what we had
    }
    readAll();
  }
  if (!ctx.sample) {
    const timer = setInterval(() => {
      if (!alive()) { clearInterval(timer); return; }
      if (document.visibilityState === 'visible') refresh();
    }, 10 * 60e3);
  }

  /** One order for the cards and the queue: store under break-even first, then brands with calls waiting (cuts before
      raises, then the biggest move), then amber, then green, then the numbers only brands (client runs it, no store). */
  function orderOf(list) {
    const key = c => {
      const p = pendingOf(c), L = lightOf(c);
      const r = p.length && L.rank > 1 ? 1 : L.rank;
      return [r, p.some(cp => cp.move.to < cp.move.from) ? 0 : 1, p.length ? -Math.max(...p.map(cp => Math.abs(cp.move.to - cp.move.from))) : 0];
    };
    return list.map((c, i) => ({ c, i, k: key(c) })).sort((a, b) => a.k[0] - b.k[0] || a.k[1] - b.k[1] || a.k[2] - b.k[2] || a.i - b.i).map(z => z.c);
  }
  /** The Export menu: Copy PNG, Download PNG, PDF (team only) and Old Locus. A small menu on a desktop; the same
      .lx-pop rises from the bottom on a phone (app.css). */
  function exportMenu(anchor) {
    const old = document.querySelector('.wr3-menu');
    if (old) { old.remove(); return; }
    const close = () => { pop.remove(); document.removeEventListener('pointerdown', outside, true); document.removeEventListener('keydown', esc, true); window.removeEventListener('hashchange', close); };
    const outside = e => { if (!pop.contains(e.target) && !anchor.contains(e.target)) close(); };
    const esc = e => { if (e.key === 'Escape') { close(); anchor.focus(); } };
    const run = kind => e => { const b = e.currentTarget; exportBoard(kind, b).finally(close); };
    const item = (label, onclick, aria) => h('button', { type: 'button', class: 'lx-item', role: 'menuitem', onclick, 'aria-label': aria || null }, label);
    const pop = h('div', { class: 'lx-pop wr3-menu', role: 'menu', 'aria-label': 'Export' },
      write ? [item('Copy PNG', run('copy'), 'Copy the board as a picture, team only'), item('Download PNG', run('png'), 'Download the board as a picture, team only'), item('PDF', run('pdf'), 'Download the board as a PDF, team only')] : null,
      ctx.legacy ? h('a', { class: 'lx-item', role: 'menuitem', href: ctx.legacy, onclick: close }, 'Old ' + APP_NAME) : null);
    document.body.append(pop);
    const r = anchor.getBoundingClientRect(), w = pop.offsetWidth;
    pop.style.top = (r.bottom + window.scrollY + 6) + 'px';
    pop.style.left = Math.max(8, Math.min(r.right - w, window.innerWidth - w - 8) + window.scrollX) + 'px';
    setTimeout(() => { document.addEventListener('pointerdown', outside, true); document.addEventListener('keydown', esc, true); window.addEventListener('hashchange', close); }, 0);
    const first = pop.querySelector('.lx-item'); if (first) first.focus({ preventScroll: true });
  }

  /* ---------- draw ---------- */
  function help() {
    return pageHelp({ body: [
      { title: 'What it is for', text: `One page for the Black Friday weekend: how the sale is pacing against its goal, which campaign budgets ${APP_NAME} suggests moving, and the plan that was agreed. ${one ? 'This is one brand.' : 'Every brand is here; open a brand for its own page.'}` },
      { title: 'How the calls are made', text: `At every check-in each live campaign is read on its own ROAS (Triple Whale, last click) since the last check-in and today, against the brand's goal ROAS. This week only breaks a tie. The store MER is the gate: while it is over target nothing is cut, and while it is not clear nothing is raised. Nothing changes without a tap, and every change can be undone. A change less than ${READ_HOURS} hours old is marked as not read yet.` },
      { title: 'Store MER and ROAS', text: 'Store MER is the whole store: all sales divided by all ad spend. ROAS is one platform or one campaign: the sales Triple Whale credits to it, divided by its own spend. Hover or tap any dotted label for its meaning.' },
      { title: 'Who sees it', text: 'The team sees everything here. A client sees only the pace and the plan for their own brand, never the calls or the break-even lines. The client update card is what goes to the client.' },
    ] });
  }
  function draw() {
    if (!alive()) return;
    tipHide();
    const d = S.data || {}, R = d.standing;
    const refreshBtn = button('Refresh', { onclick: e => refresh(e.currentTarget) });
    const oldLink = ctx.legacy ? h('a', { class: 'wr3-old hide-sm', href: ctx.legacy }, 'Old ' + APP_NAME) : null;
    if (!R) return drawNoCheckin(d.error ? 'The check-in did not load' : 'No check-in yet', d.error || 'The calls fill in at the first check-in of the season. The pace and the plan below come from the plan.', refreshBtn, oldLink);
    const list = calcAll();
    if (!list.length) return drawNoCheckin('This brand is not in the check-in', 'Only brands with a live Black Friday sale are checked, so there are no calls. The pace and the plan below come from the plan.', refreshBtn, oldLink);
    const age = ageH(), fresh = age < 0.5;
    const checkBtn = write ? button('Check now', { disabled: fresh || null, onclick: e => checkNow(e.currentTarget), aria: fresh ? 'Check now: the latest check-in is under 30 minutes old' : 'Check now' }) : null;
    const minCad = Math.min(...list.map(c => c.cadence));
    const sampleSwitch = ctx.sample && f() && f().slots ? segmented(f().slots.map(s => ({ id: s.slot, label: s.label })), R.slot, slot => {
      S.data = { ...S.data, standing: f().records[slot] }; S.done = {}; S.insides = {}; S.probing = true; draw(); probe();
    }) : null;
    const exportBtn = write || ctx.legacy ? button('Export', { icon: 'chevron', onclick: e => exportMenu(e.currentTarget), aria: 'Export the board, or open the old app' }) : null;
    if (exportBtn) exportBtn.setAttribute('aria-haspopup', 'menu');
    const bar = h('div', { class: 'wr3-bar' },
      help(),
      h('span', { class: 'when' }, 'Checked ', h('b', null, `${hourWord(slotHour(R.slot))} CT`), R.next ? `, next ${R.next}` : '', R.dry ? ', dry run: no sale has started' : ''),
      age > minCad + 1 ? h('span', { class: 'lx-stat warn' }, `Check-in is ${agoWords(age * 3600e3)} old`) : null,
      sampleSwitch,
      h('span', { class: 'sp' }),
      h('div', { class: 'btns' }, staleStamp({ at: S.data.fetched_at || Date.parse(R.at), label: 'Read', onRefresh: () => refresh() }), checkBtn, exportBtn));
    hosts.sparks = {};
    hosts.hero = paceHero(heroModel(list));
    hosts.plan = planSection(list);
    const order = orderOf(list);
    /* what the Ask Locus AI panel knows about this screen */
    const nPend = order.reduce((t, c) => t + pendingOf(c).length, 0);
    const reds = order.filter(c => lightOf(c).tone === 'bad').map(c => c.name);
    const hm = heroModel(list);
    ctx.askContext = `Black Friday War Room at the ${hourWord(slotHour(R.slot))} CT check-in${one ? ' for ' + (order[0] ? order[0].name : 'one brand') : ', ' + order.length + ' brands'}. Sales so far ${ok(hm.sales) ? money(Math.round(hm.sales)) : 'not read'}, store MER ${fx(hm.mer)} (Triple Whale). ${nPend ? nPend + (nPend === 1 ? ' budget call needs' : ' budget calls need') + ' a yes' : 'No budget call needs a yes'}${reds.length ? '; store MER under break-even on ' + reds.join(', ') : ''}.`;
    put(el, h('div', { class: 'wr3' },
      bar,
      hosts.hero,
      one ? null : needsYes(order),
      h('div', { class: 'wr3-grid' + (one ? ' one' : '') }, order.map(brandCard)),
      hosts.plan));
  }

  /** No check-in record for this view: say so in one quiet card, and still draw the pace (one brand) and the plan from
      the plan read, so the team never sees less than a client would. */
  function drawNoCheckin(title, text, refreshBtn, oldLink) {
    const note = card({ title }, h('p', { class: 'wr3-quiet' }, text), h('div', { class: 'wr3-act' }, refreshBtn));
    let hero = null, plan;
    if (one) {
      const w = S.hourCache[one], err = S.hourErr[one];
      hero = w ? paceHero(warModel(w, S.hourAt[one], { team: true }))
        : card({ class: 'wr3-hero' }, h('p', { class: 'wr3-quiet' }, err ? 'The pace did not load: ' + err : 'Reading the pace...'));
      const name = (ctx.brand && ctx.brand.name) || (w && w.name) || 'This brand';
      plan = card({ title: 'The plan', note: 'what was agreed for the sale', flush: true },
        planTable([warRow(w, one, name)], { team: true, waiting: !w && !err, planHref: planHrefOf(ctx) }));
    } else {
      const rows = ((S.warAll && S.warAll.brands) || []).map(r => ({ act_id: r.act_id, name: r.name, offer: r.bf_offer || '', sale: r.sale, goal: r.goal ?? null,
        target: (r.ladder && r.ladder.target) ?? null, steps: r.steps || null }));
      const hrefOf = act => { const sl = ((ctx.brands || []).find(x => x.id === act) || {}).slug; return sl ? `#/brand/${encodeURIComponent(sl)}/black-friday/war-room` : null; };
      plan = card({ title: 'The plan', note: 'what was agreed for the sale', flush: true },
        planTable(rows, { team: true, waiting: !S.warAll && !S.warAllErr, hrefOf, planHref: planHrefOf(ctx) }),
        S.warAllErr ? h('p', { class: 'wr3-quiet', style: { padding: '0 var(--pad-card) 16px' } }, 'The plan did not load: ' + S.warAllErr) : null);
    }
    hosts.hero = null; hosts.plan = null; hosts.sparks = {};
    ctx.askContext = `Black Friday War Room with no check-in for this view yet: ${title}. The page shows the pace and the plan from the plan read.`;
    put(el, h('div', { class: 'wr3' }, h('div', { class: 'wr3-bar' }, help(), h('span', { class: 'sp' }), oldLink), note, hero, plan));
  }

  draw();
  readAll();
}

/* ---------- a client's page: the pace and the plan for their brand, from the war read only ---------- */
function renderClient(el, data, ctx) {
  if (!ctx.brand) return put(el, empty({ title: 'Pick a brand', text: 'Black Friday is one brand at a time.' }));
  /* a saved copy made for the team is never drawn here; the client's own read follows at once */
  if (data.team_copy) return put(el, empty({ title: 'Reading your Black Friday plan...', text: 'One moment.' }));
  const w = data.war;
  if (!w || !w.sale || !w.sale.start) return put(el, empty({ title: 'No Black Friday sale set yet', text: 'When the sale dates and the goal are set, the pace shows here.' }));
  const m = warModel(w, data.fetched_at);
  const row = warRow(w, ctx.brand.id, ctx.brand.name);
  ctx.askContext = `${ctx.brand.name} Black Friday pace: sales so far ${ok(m.sales) ? money(Math.round(m.sales)) : 'not read'} of a ${ok(m.goal) ? money(m.goal) : 'unset'} goal, store MER ${fx(m.mer)} (Triple Whale), and the agreed plan.`;
  put(el, h('div', { class: 'wr3' },
    h('div', { class: 'wr3-bar' }, pageHelp({ body: [
      { title: 'What it is for', text: 'How your Black Friday sale is pacing against the goal we agreed, today by the hour, and the plan for the sale.' },
      { title: 'Store MER', text: 'The whole store: all sales divided by all ad spend. Hover or tap any dotted label for its meaning.' },
    ] })),
    paceHero(m),
    card({ title: 'The plan', note: 'what was agreed for the sale', flush: true }, planTable([row], { team: false, waiting: false, planHref: planHrefOf(ctx) }))));
}

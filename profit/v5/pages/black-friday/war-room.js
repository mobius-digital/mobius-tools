/* Brand > Black Friday > War Room: the one Black Friday page for one brand. The team sees the pace hero, Needs your
   yes, the brand's card with its campaign calls and client update, and the plan. A client sees the pace and the plan
   only (one read: GET /api/season/war?act=<id>&live=1). The old Pace and Plan addresses open this page too.
   The work is in ../a-black-friday/live.js and the math in ../_warcall.js. */

import { em } from '../../kit.js';
import { readStanding, renderWarRoom } from '../a-black-friday/live.js';

export default {
  title: ctx => (ctx.isClient ? ['Is the sale on pace ', em('today?')] : ['Where does this brand ', em('stand right now?')]),
  eyebrow: 'Black Friday War Room',
  ranges: false,
  stamp: false,                  /* each brand card has its own Read stamp and refresh */
  asOf: d => (d && d.standing && Date.parse(d.standing.at)) || (d && d.fetched_at) || null,
  load: ctx => readStanding(ctx),
  sample: ctx => readStanding(ctx),
  render: (el, data, ctx) => renderWarRoom(el, data, ctx, { one: ctx.brand ? ctx.brand.id : null }),
};

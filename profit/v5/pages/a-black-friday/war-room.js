/* Agency > Black Friday > War Room: the one Black Friday page, every brand. The pace hero, Needs your yes, a card per
   brand with its campaign calls, and the plan. The old Pace and Plan addresses open this page too.
   The work is in live.js (shared with the brand page) and the math in ../_warcall.js. Reads GET /api/standing and
   the earlier check-ins; a tap writes one campaign budget through POST /api/meta/write (dry run first). */

import { em } from '../../kit.js';
import { readStanding, renderWarRoom } from './live.js';

export default {
  title: ['Where do we ', em('stand right now?')],
  eyebrow: 'Black Friday War Room',
  ranges: false,
  stamp: false,                  /* each brand card has its own Read stamp and refresh */
  asOf: d => (d && d.standing && Date.parse(d.standing.at)) || (d && d.fetched_at) || null,
  load: ctx => readStanding(ctx),
  sample: ctx => readStanding(ctx),
  render: (el, data, ctx) => renderWarRoom(el, data, ctx),
};

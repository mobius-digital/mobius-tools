/* Brand > Black Friday > War Room (team only): this brand in the latest check-in, with Approve and what is running.
   The work is in ../a-black-friday/live.js. Reads GET /api/standing (and /api/standing/brand on a tap);
   Approve posts /api/standing/approve. */

import { em } from '../../kit.js';
import { readStanding, renderWarRoom } from '../a-black-friday/live.js';

export default {
  title: ['Where does this brand ', em('stand right now?')],
  eyebrow: 'Black Friday War Room',
  ranges: false,
  asOf: d => (d && d.standing && Date.parse(d.standing.at)) || (d && d.fetched_at) || null,
  load: ctx => readStanding(ctx),
  sample: ctx => readStanding(ctx),
  render: (el, data, ctx) => renderWarRoom(el, data, ctx, { one: ctx.brand ? ctx.brand.id : null }),
};

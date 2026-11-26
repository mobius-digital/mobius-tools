/* Agency > Black Friday > War Room: every brand in the latest check-in, with Approve.
   The work is in live.js (shared with the brand page). Reads GET /api/standing; Approve posts /api/standing/approve. */

import { em } from '../../kit.js';
import { readStanding, renderWarRoom } from './live.js';

export default {
  title: ['Where do we ', em('stand right now?')],
  eyebrow: 'Black Friday War Room',
  ranges: false,
  asOf: d => (d && d.standing && Date.parse(d.standing.at)) || (d && d.fetched_at) || null,
  load: ctx => readStanding(ctx),
  sample: ctx => readStanding(ctx),
  render: (el, data, ctx) => renderWarRoom(el, data, ctx),
};

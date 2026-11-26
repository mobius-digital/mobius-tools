/* Brand > Black Friday > War Room (v2, team only): this brand in the latest check-in, a call per live campaign,
   today by the hour on a tap, and the client update card (preview, Download image, Copy image, Copy link).
   The work is in ../a-black-friday/live.js and the math in ../_warcall.js. */

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

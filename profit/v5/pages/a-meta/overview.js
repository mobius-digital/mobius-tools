/* Agency > Meta > Overview. Is Meta paying for itself, brand by brand? Read only.
   Spend is Meta's; sales and ROAS are Triple Whale, last platform click. */
import { em } from '../../kit.js';
import { loadPlatform, samplePlatform, renderPlatform } from '../a-today/_more.js';

export default {
  title: ['Is Meta ', em('paying for itself?')],
  eyebrow: 'Meta, all brands',
  load: ctx => loadPlatform(ctx, 'meta'),
  sample: () => samplePlatform('meta'),
  render: (el, d, ctx) => renderPlatform(el, d, ctx, 'meta'),
};

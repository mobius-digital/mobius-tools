/* Agency > Google > Overview. Is Google paying for itself, brand by brand? Read only.
   Spend is Google's; sales and ROAS are Triple Whale, last platform click (never Google's own conversions). */
import { em } from '../../kit.js';
import { loadPlatform, samplePlatform, renderPlatform } from '../a-today/_more.js';

export default {
  title: ['Is Google ', em('paying for itself?')],
  eyebrow: 'Google, all brands',
  load: ctx => loadPlatform(ctx, 'google'),
  sample: () => samplePlatform('google'),
  render: (el, d, ctx) => renderPlatform(el, d, ctx, 'google'),
};

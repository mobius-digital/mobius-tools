/* Brand settings > Brand. The brand's own facts: its name, its clock, when its social and creator posts go out.
   Real mode reads name, time zone, currency and status from the brand list (account-health GET /api/brands).
   The rest have no server home yet: they open on the agency's defaults and save on this device. */

import { put } from '../../kit.js';
import { h, em, empty, statusDot, pill } from '../../kit.js';
import { css, stage, saveBar, group, row, fact, fold, facts, textBox, pick, timePick, dayChips, numBox } from './_set.js';

export const ZONES = [
  { id: 'America/New_York', label: 'Eastern Time' }, { id: 'America/Chicago', label: 'Central Time' }, { id: 'America/Denver', label: 'Mountain Time' },
  { id: 'America/Phoenix', label: 'Arizona Time' }, { id: 'America/Los_Angeles', label: 'Pacific Time' }, { id: 'America/Anchorage', label: 'Alaska Time' },
  { id: 'Pacific/Honolulu', label: 'Hawaii Time' }, { id: 'Europe/London', label: 'London' }, { id: 'Europe/Berlin', label: 'Central Europe' }, { id: 'Australia/Sydney', label: 'Sydney' },
];
const CURRENCY = { USD: 'US dollars', CAD: 'Canadian dollars', GBP: 'British pounds', EUR: 'Euros', AUD: 'Australian dollars' };

function draw(el, data, ctx) {
  css();
  if (!data || !ctx.brand) return put(el, empty({ title: 'No brand picked', text: 'Pick a brand to see its settings.' }));
  const k = n => 'brand:' + ctx.brand.id + '.' + n, b = data.brand || {}, d = data.defaults || {};
  const S = stage(ctx);
  const status = b.status === 'paused' ? statusDot('off', 'Paused') : b.status === 'demo' ? statusDot('info', 'Demo') : statusDot('good', 'Active');
  put(el, h('div', { class: 'lx-st' },
    saveBar(S, ctx),
    group('The brand', null,
      row('Brand name', 'What every screen, report and message calls it.', textBox(S, k('name'), b.name, { label: 'Brand name' })),
      row('Brand time zone', 'Client updates and spend checks use this clock. History stays in the old zone when it changes.', pick(S, k('tz'), b.tz || 'America/Chicago', ZONES, { label: 'Brand time zone' })),
      fact('Status', status, 'Paused brands are switched in Agency settings, Clients.'),
      fact('Currency', CURRENCY[b.currency] || b.currency || 'US dollars', 'Read from the ad account. Never picked.')),
    group('Social posts', 'When scheduled posts go out, brand time',
      row('Posting times', 'Up to seven a day. A post takes the next free time.', h('div', { class: 'lx-st-times' }, [0, 1, 2].map(i => timePick(S, k('social_time_' + i), (d.social_times || [])[i], { label: 'Posting time ' + (i + 1) })))),
      row('Posting days', null, dayChips(S, k('social_days'), d.social_days || ['mon', 'tue', 'wed', 'thu', 'fri']))),
    group('Creators', 'The brand’s creator community',
      row('Welcome post time', 'One welcome a day for everyone who joined, never one per person.', timePick(S, k('creator_welcome'), d.creator_welcome || '17:00', { label: 'Welcome post time' })),
      row('Weekly post days', 'The top videos post.', dayChips(S, k('creator_days'), d.creator_days || ['mon', 'fri'])),
      row('Go quiet after', 'A creator with no video for this long is marked inactive. They are warned a week before.', numBox(S, k('creator_inactive_days'), d.creator_inactive_days ?? 60, { suffix: 'days', width: 44, label: 'Inactive after days' })),
      row('Reference ads folder', 'Where saved reference ads for this brand are kept.', textBox(S, k('swipe_folder'), d.swipe_folder || '', { placeholder: 'Paste a folder link', label: 'Reference ads folder' }))),
    fold('Advanced', 'Rarely touched',
      row('Stock line for ad calls', 'Do not scale an ad for a product with less cover than this.', numBox(S, k('stock_days'), d.stock_days ?? 30, { suffix: 'days', width: 44, label: 'Stock cover days' })),
      row('Judge ads on the last', 'The window an ad is read on.', numBox(S, k('judge_window'), d.judge_window ?? 7, { suffix: 'days', width: 44, label: 'Judge window days' })),
      row('Slow ad set window', 'An ad set with few results is read on a longer window.', numBox(S, k('slow_window'), d.slow_window ?? 14, { suffix: 'days', width: 44, label: 'Slow window days' }))),
    facts('Stays fixed', [
      ['What counts as an order', 'A paid order', 'Free orders and sample orders are left out of order size and cost per customer.'],
      ['Months', 'Calendar months', 'No fiscal month. Goals and pace are kept by calendar month.'],
      ['History', '400 days of orders, 120 days of ads', 'Re-read every night for the last 7 days.'],
      ['Brand id', h('code', { class: 'lx-st-code' }, b.id || ctx.brand.id), 'What the workers call this brand. It never changes.'],
    ])));
}

export default {
  title: ['The facts about ', em('this brand')],
  eyebrow: ctx => (ctx.brand ? ctx.brand.name + ', ' : '') + 'brand settings',
  ranges: false,
  async load(ctx) {
    if (!ctx.brand) return null;
    const j = await ctx.api('/api/brands', { worker: 'ah', signal: ctx.signal });
    const b = (j.brands || []).find(r => r.id === ctx.brand.id) || {};
    return { brand: { id: ctx.brand.id, name: b.name || ctx.brand.name, tz: b.tz || null, currency: b.currency || null, status: b.status || 'active' }, defaults: {} };
  },
  render: draw,
};

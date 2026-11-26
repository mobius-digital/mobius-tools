/* Email & SMS > List growth. "Is the list growing?"
   Live: who joined and who left by day, email and text (Klaviyo, GET /api/klaviyo?what=daily) and the biggest
   lists with their size (GET /api/klaviyo?what=overview), both on the account-health worker.
   No route yet: where the new subscribers came from. That card shows in sample mode only, never on a real brand. */

import { put } from '../../kit.js';
import { h, em, card, kpi, kpis, table, legend, lineChart, skeleton } from '../../kit.js';
import { ok, sum, shortDate, inRange, noteAt, css, head, barCell, split, exampleChip, kl, notConnected, num, pct } from './_em.js';

function shape(ctx, daily, ov, ex) {
  if (daily.error) return { connected: false, klaviyo: false, klaviyo_error: daily.error };
  const lists = ov.error ? [] : (ov.biggest_lists || []).filter(l => ok(l.profiles));
  return {
    connected: true, klaviyo: true, range: { from: ctx.range.from, to: ctx.range.to },
    days: (daily.days || []).filter(r => inRange(r.date, ctx.range)).map(r => ({ date: r.date, joined: r.gained || 0, left: r.lost || 0, sms_joined: r.sms_gained || 0, sms_left: r.sms_lost || 0 })),
    list_size: lists[0] ? lists[0].profiles : null, sms_size: null, lists,
    sources: ex && ex.sources ? ex.sources : null, note: null,
    example: ex && ex.sources ? ['sources'] : [],
  };
}

function figures(d) {
  const days = d.days || [], joined = sum(days, 'joined'), left = sum(days, 'left'), net = joined - left;
  const sj = sum(days, 'sms_joined'), sl = sum(days, 'sms_left');
  let run = 0;
  const el = kpis([
    kpi({ label: 'Net new subscribers', size: 'lg', value: (net > 0 ? '+' : '') + num(net), sub: 'email, in these dates', spark: days.map(r => (run += r.joined - r.left)) }),
    kpi({ label: 'Joined', size: 'lg', value: num(joined), sub: days.length ? num(joined / days.length) + ' a day' : null }),
    kpi({ label: 'Left', size: 'lg', value: num(left), sub: joined > 0 ? pct(left / joined) + ' of those who joined' : null }),
    kpi({ label: 'List size', size: 'lg', value: ok(d.list_size) ? num(d.list_size) : 'no data',
      sub: ok(d.sms_size) ? num(d.sms_size) + ' on SMS' : sj + sl > 0 ? `${sj - sl >= 0 ? '+' : ''}${num(sj - sl)} on SMS` : 'largest list' }),
  ], { cols: 4 });
  el.classList.add('em-kpis');
  return el;
}

function chartCard(d) {
  const days = d.days || [];
  if (days.length < 2) return null;
  const b = v => h('b', null, v);
  return card({ class: 'em-chart' },
    head('Who joined and who left?', 'Email subscribers by day', legend([{ name: 'Joined', lead: true }, { name: 'Left' }])),
    lineChart({
      series: [{ name: 'Joined', lead: true, values: days.map(r => r.joined) }, { name: 'Left', values: days.map(r => r.left) }],
      labels: days.map(r => shortDate(r.date)), note: noteAt(days, d.note), format: v => num(v), height: 340, phoneHeight: 290,
      label: 'Email subscribers who joined and who left, by day',
      hover: i => [b(shortDate(days[i].date)), h('span', null, 'Joined ', b(num(days[i].joined))), h('span', null, 'Left ', b(num(days[i].left))),
        days[i].sms_joined ? h('span', null, 'Text joined ', b(num(days[i].sms_joined))) : null],
    }));
}

function channels(d) {
  const days = d.days || [], e = sum(days, 'joined'), s = sum(days, 'sms_joined');
  if (!(s > 0)) return null;
  return card({ title: 'Email or text?', note: 'new subscribers in these dates' },
    split([{ name: 'Joined by email', value: e, text: num(e), color: 'var(--ink)' }, { name: 'Joined by text', value: s, text: num(s), color: '#C9CED9' }], 'New subscribers, email against text'));
}

function listsCard(d) {
  const rows = d.lists || [];
  if (!rows.length) return null;
  const max = Math.max(...rows.map(r => r.profiles || 0), 1);
  return card({ title: 'Biggest lists', note: 'people on each list now', flush: true, class: 'em-flush' },
    table({ roomy: true, rows, sort: { key: 'profiles', dir: 'desc' }, cols: [
      { key: 'name', label: 'List', class: 'name', render: r => h('span', { class: 'em-name' }, r.name) },
      { key: 'profiles', label: 'People', num: true, sortable: true, render: r => barCell(h('span', { class: 'strong' }, num(r.profiles)), r.profiles / max) },
    ] }));
}

function sourcesCard(d) {
  const rows = d.sources || [];
  if (!rows.length) return null;
  const isEx = (d.example || []).includes('sources'), max = Math.max(...rows.map(r => r.joined || 0), 1);
  return card({ title: 'Where did they sign up?', note: isEx ? exampleChip() : 'new subscribers by sign-up form', flush: true, class: 'em-flush' },
    table({ roomy: true, rows, sort: { key: 'joined', dir: 'desc' }, cols: [
      { key: 'name', label: 'Sign-up form', class: 'name', render: r => h('span', { class: 'em-name' }, r.name) },
      { key: 'bought', label: 'Bought since', num: true, sortable: true, class: 'hide-sm', render: r => (ok(r.bought) ? pct(r.bought, { digits: r.bought < 0.1 ? 1 : 0 }) : '') },
      { key: 'joined', label: 'Joined', num: true, sortable: true, render: r => barCell(h('span', { class: 'strong' }, num(r.joined)), r.joined / max) },
    ] }));
}

export default {
  title: ['Is the list ', em('growing?')],
  eyebrow: 'Email & SMS',

  async load(ctx) {
    if (!ctx.brand) return { connected: false };
    const [daily, ov] = await Promise.all([kl(ctx, 'daily'), kl(ctx, 'overview')]);
    return shape(ctx, daily, ov, null);   /* load() is real mode only: the sign-up forms example shows in sample mode only */
  },

  skeleton(el) { put(el, h('div', { class: 'lx-skel-grid' }, skeleton('kpi', 4)), skeleton('chart'), skeleton('row', 4)); },

  render(el, d, ctx) {
    css();
    d = d || {};
    if (d.connected === false || d.klaviyo === false) {
      put(el, notConnected(ctx, { title: 'Klaviyo is not connected',
        text: 'List growth shows here once the brand\'s Klaviyo is connected.',
        teamText: (d.klaviyo_error ? d.klaviyo_error + ' ' : '') + 'Subscribers are read with the brand\'s own Klaviyo key.' }));
      return;
    }
    const isEx = (d.example || []).includes('sources');
    put(el, ...[
      h('section', { class: 'lx-hero line' }, figures(d)),
      chartCard(d),
      channels(d),
      listsCard(d),
      sourcesCard(d),
      h('p', { class: 'lx-foot' }, 'Joined and left are Klaviyo\'s subscribe and unsubscribe events, by the day they happened.' + (isEx ? ' The sign-up forms are an example until that data feed is built.' : '')),
    ].filter(Boolean));
  },
};

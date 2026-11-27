/* Email & SMS > List growth. "Is the list growing?"
   Live: who joined and who left by day, email and text (Klaviyo, GET /api/klaviyo?what=daily) and the biggest
   lists with their size (GET /api/klaviyo?what=overview), both on the account-health worker.
   No route yet: where the new subscribers came from. That card shows in sample mode only, never on a real brand. */

import { put } from '../../kit.js';
import { h, tiles, em, card, kpi, kpis, table, legend, lineChart, skeleton, sheet } from '../../kit.js';
import { ok, sum, shortDate, inRange, noteAt, css, head, barCell, split, exampleChip, kl, notConnected, num, pct, kv } from './_em.js';
import { dl, rangeWords } from '../home/_biz.js';
import { headRow } from '../platforms/_ads.js';

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

function figures(d, W) {
  const days = d.days || [], joined = sum(days, 'joined'), left = sum(days, 'left'), net = joined - left;
  const sj = sum(days, 'sms_joined'), sl = sum(days, 'sms_left');
  let run = 0;
  const labels = days.length > 1 ? days.map(r => shortDate(r.date)) : null;
  const el = tiles([
    kpi({ label: 'Net new subscribers', value: (net > 0 ? '+' : '') + num(net), window: W, source: 'Klaviyo', sub: 'email, in these dates, the line adds up by day', spark: days.map(r => (run += r.joined - r.left)), sparkLabels: labels, sparkFormat: v => (v > 0 ? '+' : '') + num(v) }),
    kpi({ label: 'Joined', value: num(joined), window: W, source: 'Klaviyo', sub: sj > 0 ? `${num(joined)} email, ${num(sj)} text` : days.length ? num(joined / days.length) + ' a day' : null }),
    kpi({ label: 'Left', value: num(left), window: W, source: 'Klaviyo', sub: joined > 0 ? pct(left / joined) + ' of those who joined' : null }),
    kpi({ label: dl('List size, ' + ((d.lists && d.lists[0] && d.lists[0].name) || 'main list'), 'list_size'), value: ok(d.list_size) ? num(d.list_size) : 'no data', window: 'Today', source: 'Klaviyo',
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
    head('Joined and left by day', 'Email subscribers, Klaviyo', legend([{ name: 'Joined', lead: true }, { name: 'Left' }])),
    lineChart({
      series: [{ name: 'Joined', lead: true, values: days.map(r => r.joined) }, { name: 'Left', values: days.map(r => r.left) }],
      labels: days.map(r => shortDate(r.date)), note: noteAt(days, d.note), format: v => num(v), height: 340, phoneHeight: 290,
      label: 'Email subscribers who joined and who left, by day', windowLabel: 'Daily, ' + (d.range ? rangeWords(null, d.range) : ''), name: 'Subscribers',
      hover: i => [b(shortDate(days[i].date)), h('span', null, 'Joined ', b(num(days[i].joined))), h('span', null, 'Left ', b(num(days[i].left))),
        days[i].sms_joined ? h('span', null, 'Text joined ', b(num(days[i].sms_joined))) : null],
    }));
}

function channels(d) {
  const days = d.days || [], e = sum(days, 'joined'), s = sum(days, 'sms_joined');
  if (!(s > 0)) return null;
  return card({ title: 'Email or text?', note: 'new subscribers in these dates' },
    split([{ name: 'Joined by email', value: e, text: num(e), color: 'var(--brand)' }, { name: 'Joined by text', value: s, text: num(s), color: 'var(--icon)' }], 'New subscribers, email against text'));
}

/* one row, its figures */
const rowSheet = (title, note, pairs) => sheet({ title, side: 'center', body: h('div', { class: 'em-sheet' }, h('p', { class: 'em-best' }, note), kv(pairs.filter(p => p[1] != null))) });

function listsCard(d) {
  const rows = d.lists || [];
  if (!rows.length) return null;
  const max = Math.max(...rows.map(r => r.profiles || 0), 1);
  const all = rows.reduce((t, r) => t + (r.profiles || 0), 0);
  return card({ title: 'Biggest lists', note: "people on each list now · today · Klaviyo's count", flush: true, class: 'em-flush' },
    table({ roomy: true, rows, sort: { key: 'profiles', dir: 'desc' }, onRow: r => rowSheet(r.name, "Today · Klaviyo's count", [['People on it now', num(r.profiles)], ['Of the lists shown', all ? pct(r.profiles / all) : null]]), cols: [
      { key: 'name', label: 'List', class: 'name', render: r => h('span', { class: 'em-name' }, r.name) },
      { key: 'profiles', label: 'People', num: true, sortable: true, render: r => barCell(h('span', { class: 'strong' }, num(r.profiles)), r.profiles / max) },
    ] }));
}

function sourcesCard(d, W) {
  const rows = d.sources || [];
  if (!rows.length) return null;
  const isEx = (d.example || []).includes('sources'), max = Math.max(...rows.map(r => r.joined || 0), 1);
  return card({ title: 'Sign-up forms', note: [W, 'new subscribers by form', 'Klaviyo'].filter(Boolean).join(' · '), action: isEx ? exampleChip() : null, flush: true, class: 'em-flush' },
    table({ roomy: true, rows, sort: { key: 'joined', dir: 'desc' }, onRow: r => rowSheet(r.name, [W, 'Klaviyo'].filter(Boolean).join(' · '), [['Joined', num(r.joined)], ['Bought since', ok(r.bought) ? pct(r.bought, { digits: r.bought < 0.1 ? 1 : 0 }) : null]]), cols: [
      { key: 'name', label: 'Sign-up form', class: 'name', render: r => h('span', { class: 'em-name' }, r.name) },
      { key: 'bought', label: dl('Bought since', 'bought_since'), num: true, sortable: true, class: 'hide-sm', render: r => (ok(r.bought) ? pct(r.bought, { digits: r.bought < 0.1 ? 1 : 0 }) : '') },
      { key: 'joined', label: 'Joined', num: true, sortable: true, render: r => barCell(h('span', { class: 'strong' }, num(r.joined)), r.joined / max) },
    ] }));
}

export default {
  title: 'Email list growth',
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
      headRow({ help: [
        { title: 'What it is for', text: 'Is the email and text list growing on the dates at the top: who joined, who left, the biggest lists and the sign-up forms.' },
        { title: 'Where the numbers come from', text: 'Joined and left are Klaviyo\'s subscribe and unsubscribe events, by the day they happened. List size is today.' + (isEx ? ' The sign-up forms are an example until that data feed is built.' : '') },
      ] }),
      figures(d, rangeWords(ctx, d.range)),
      chartCard(d),
      listsCard(d),
      sourcesCard(d, rangeWords(ctx, d.range)),
    ].filter(Boolean));
  },
};

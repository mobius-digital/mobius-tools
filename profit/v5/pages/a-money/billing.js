/* Agency > Money > Billing. Has every client paid this month? Owner only.
   Money received is the Ledger (account-health /api/agency/economics, rows[].revenue and unmatched).
   Each client's billing day, paid date and amount still due have no all-clients read yet: in real mode they show
   from the sample behind the "Example until its data feed is built" chip. */
import { put } from '../../kit.js';
import { helpBar, dl } from '../home/_biz.js';
import { tileRow, pageStamp } from '../month/_m.js';
import { h, em, money, pill, statusDot, card, empty } from '../../kit.js';
import { style, world, sumOf, figures, brandRows, brandName, brandHref, quiet, shortDay, refused, exampleChip } from '../a-today/_ag.js';
import { loadMoney, sampleMoney } from './_money.js';

const nth = n => n + (n % 10 === 1 && n !== 11 ? 'st' : n % 10 === 2 && n !== 12 ? 'nd' : n % 10 === 3 && n !== 13 ? 'rd' : 'th');

async function load(ctx) {
  const d = await loadMoney(ctx);
  if (d.owner_only) return d;
  const w = await world();                                            // invoices: no feed yet
  return { ...d, invoices: w.billing.invoices, invoices_example: true };
}

function render(el, d, ctx) {
  style();
  const no = refused(d, ctx, 'Billing'); if (no) return put(el, no);
  if (!d || !d.rows || !d.rows.length) return put(el, empty({ title: 'No clients billed yet', text: 'Clients show here once a payment lands in the Ledger.' }));
  if (d.ledger && !d.ledger.ok) return put(el, empty({ title: 'The Ledger did not answer', text: d.ledger.error || 'Money received cannot be read right now. Try again in a minute.' }));
  const inv = Object.fromEntries((d.invoices || []).map(i => [i.brand, i]));
  /* a click on a client opens that brand's money view (This month > Profit), and every row says so */
  const rows = d.rows.map(r => ({ ...r, id: r.brand, inv: inv[r.brand] || null, href: brandHref(r.brand, 'month', 'profit'), goTitle: 'Open ' + r.name + ' profit this month' }));
  const due = rows.filter(r => r.inv && r.inv.amount_due > 0), owed = sumOf(due, r => r.inv.amount_due);
  const unmatched = d.unmatched || [], um = sumOf(unmatched, u => u.amount);
  const hero = tileRow([
    { label: 'Received this month', value: money(d.totals.revenue), sub: `${rows.filter(r => r.revenue > 0).length} of ${rows.length} clients paid` },
    { label: 'Still to come in', value: money(owed || 0), sub: due.length ? due.map(r => r.name + (r.inv.billing_day ? `, billed the ${nth(r.inv.billing_day)}` : '')).join('; ') : 'nobody is late' },
    { label: 'Payments with no client', value: money(um || 0), sub: unmatched.length ? `${unmatched.length} payment${unmatched.length === 1 ? '' : 's'} to pin to a client` : 'every payment has a client' },
  ], { window: d.label || 'This month', source: 'Ledger' });
  ctx.askWindow = d.label || 'This month';
  ctx.askContext = `Billing, ${d.label || 'this month'}: ${money(d.totals.revenue)} received from ${rows.filter(r => r.revenue > 0).length} of ${rows.length} clients, ${money(owed || 0)} still to come in, ${money(um || 0)} in payments with no client.`;
  const state = r => !r.inv ? quiet('No invoice on file') : r.inv.amount_due > 0 ? statusDot('bad', `${money(r.inv.amount_due)} due`) : r.inv.paid_on ? statusDot('good', 'Paid ' + shortDay(r.inv.paid_on)) : statusDot('warn', 'Not billed yet');
  const tbl = brandRows({
    title: 'Client by client', note: d.invoices_example ? exampleChip() : d.label, sort: { key: 'due', dir: 'desc' }, rows,
    total: { total: true, name: 'All clients', revenue: d.totals.revenue },
    cols: [
      { key: 'name', label: 'Client', class: 'name', render: r => r.total ? r.name : brandName(r, ctx, r.href) },
      { key: 'day', label: 'Billed on', class: 'hide-sm', render: r => r.inv && r.inv.billing_day ? `the ${nth(r.inv.billing_day)}` : '' },
      { key: 'revenue', label: 'Received', num: true, class: 'strong', sortable: true, value: r => r.revenue ?? 0, render: r => r.revenue > 0 ? money(r.revenue) : quiet('nothing yet') },
      { key: 'due', label: 'Status', value: r => (r.inv && r.inv.amount_due) || 0, render: r => r.total ? '' : state(r) },
      { key: 'go', label: '', width: 120, render: r => r.total ? '' : h('a', { class: 'ag-go', href: r.href, title: r.goTitle }, 'Open profit') },
    ],
    item: (r, isTotal) => ({ href: r.href, head: isTotal ? h('b', null, r.name) : brandName(r, ctx), tail: isTotal ? h('b', null, money(r.revenue)) : state(r),
      figs: isTotal ? null : [['Received', r.revenue > 0 ? money(r.revenue) : quiet('nothing yet')], ['Billed on', r.inv && r.inv.billing_day ? `the ${nth(r.inv.billing_day)}` : quiet('no invoice')]] }),
  });
  const um1 = unmatched.length ? card({ title: 'Payments with no client', action: h('a', { href: ctx.href('a-settings', 'clients') }, 'Pin a payer to a client') },
    h('div', { class: 'lx-rows' }, unmatched.map(u => h('div', null, h('span', { style: { flex: '1', minWidth: '0' } }, u.name), h('b', { style: { fontVariantNumeric: 'tabular-nums' } }, money(u.amount)))))) : null;
  const help = helpBar([
    { title: 'What it is for', text: `Has every client paid for ${d.label || 'this month'}? Who still owes, and payments the Ledger could not match to a client.` },
    { title: 'How it is counted', text: `Received is what reached the Ledger this month.${d.invoices_example ? ' Billing days and amounts due are examples until the billing feed is built.' : ''} Click a client to open that brand's profit for this month.` },
  ], pageStamp(ctx));
  put(el, h('div', { class: 'ag' }, help, hero, tbl, um1));
}

export default {
  title: ['Has every client ', em('paid?')],
  eyebrow: (ctx, d) => d && d.label ? 'Money, ' + d.label : 'Money',
  ranges: false,
  stamp: false,                     /* Home's stamp with a refresh button sits in the help bar */
  load, sample: sampleMoney, render,
};

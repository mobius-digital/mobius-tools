/* Agency > Money > Billing. Has every client paid this month? Owner only.
   Money received is the Ledger (account-health /api/agency/economics, rows[].revenue and unmatched).
   Each client's billing day, paid date and amount still due have no all-clients read yet: in real mode they show
   from the sample behind the "Example until its data feed is built" chip. */
import { put } from '../../kit.js';
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
  const rows = d.rows.map(r => ({ ...r, id: r.brand, inv: inv[r.brand] || null, href: brandHref(r.brand, 'home', 'index') }));
  const due = rows.filter(r => r.inv && r.inv.amount_due > 0), owed = sumOf(due, r => r.inv.amount_due);
  const unmatched = d.unmatched || [], um = sumOf(unmatched, u => u.amount);
  const hero = figures([
    { label: 'Received this month', value: money(d.totals.revenue), lead: true, sub: `${rows.filter(r => r.revenue > 0).length} of ${rows.length} clients paid` },
    { label: 'Still to come in', value: money(owed || 0), sub: due.length ? due.map(r => r.name).join(', ') : 'nobody is late' },
    { label: 'Payments with no client', value: money(um || 0), sub: unmatched.length ? `${unmatched.length} payment${unmatched.length === 1 ? '' : 's'} to pin to a client` : 'every payment has a client' },
  ]);
  const state = r => !r.inv ? quiet('No invoice on file') : r.inv.amount_due > 0 ? pill('bad', `${money(r.inv.amount_due)} due`) : r.inv.paid_on ? statusDot('good', 'Paid ' + shortDay(r.inv.paid_on)) : statusDot('warn', 'Not billed yet');
  const tbl = brandRows({
    title: 'Client by client', note: d.invoices_example ? exampleChip() : d.label, sort: { key: 'due', dir: 'desc' }, rows,
    total: { total: true, name: 'All clients', revenue: d.totals.revenue },
    cols: [
      { key: 'name', label: 'Client', class: 'name', render: r => r.total ? r.name : brandName(r, ctx, r.href) },
      { key: 'day', label: 'Billed on', class: 'hide-sm', render: r => r.inv && r.inv.billing_day ? `the ${nth(r.inv.billing_day)}` : '' },
      { key: 'revenue', label: 'Received', num: true, class: 'strong', sortable: true, value: r => r.revenue ?? 0, render: r => r.revenue > 0 ? money(r.revenue) : quiet('nothing yet') },
      { key: 'due', label: 'Status', value: r => (r.inv && r.inv.amount_due) || 0, render: r => r.total ? '' : state(r) },
    ],
    item: (r, isTotal) => ({ href: r.href, head: isTotal ? h('b', null, r.name) : brandName(r, ctx), tail: isTotal ? h('b', null, money(r.revenue)) : state(r),
      figs: isTotal ? null : [['Received', r.revenue > 0 ? money(r.revenue) : quiet('nothing yet')], ['Billed on', r.inv && r.inv.billing_day ? `the ${nth(r.inv.billing_day)}` : quiet('no invoice')]] }),
  });
  const um1 = unmatched.length ? card({ title: 'Payments with no client', note: 'Pin each payer to a client in Agency settings' },
    h('div', { class: 'lx-rows' }, unmatched.map(u => h('div', null, h('span', { style: { flex: '1', minWidth: '0' } }, u.name), h('b', { style: { fontVariantNumeric: 'tabular-nums' } }, money(u.amount)))))) : null;
  const foot = h('p', { class: 'lx-foot' }, `${d.label || 'This month'}. Received is what reached the Ledger.${d.invoices_example ? ' Billing days and amounts due are examples until the billing feed is built.' : ''}`);
  put(el, h('div', { class: 'ag' }, hero, tbl, um1, foot));
}

export default {
  title: ['Has every client ', em('paid?')],
  eyebrow: (ctx, d) => d && d.label ? 'Money, ' + d.label : 'Money',
  ranges: false,
  load, sample: sampleMoney, render,
};

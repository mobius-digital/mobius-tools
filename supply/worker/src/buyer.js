/**
 * Supply: the Buyer.
 *
 * The buyer who lives inside Supply, on the shared Ask engine
 * (../../../ask/engine.js). What to order, how much, by when; what is on the
 * way; what is dead; what is late in the lineup. Different shape from the
 * ledgers: the answers here are not rows, they are the brain's output
 * (computeSupply), the same state every screen draws. So the views carry the
 * weight and SQL is for the record of decisions (orders, slots, changelog).
 *
 * One Buyer per brand: memory, findings and usage are all kept per brand,
 * because "what did I tell you about the putters" is a Lucky Golf sentence.
 *
 * worker.js hands in `deps` (loadDb, computeSupply, the raw feed through
 * Restock, the settings reads bound to a brand), so this file imports nothing
 * from the worker.
 */

import { createAssistant, makeAppView, makeSecretKey } from '../../../ask/engine.js';

const WHO = brandName => `
You are the Buyer for ${brandName}, working inside Supply, the buying brain
Mobius Digital runs for the brand's physical products. You answer the four
Monday questions: what to order, how much and by when; what is already on its
way and when it lands; what is selling and what is not; and what the next
lineup needs and when each piece must start. Shopify is the source of truth
for stock, sales and cost; Supply holds the decisions.
`;

const SCHEMA = `
## Tables (the record of decisions; every row carries brand_id)

products     one row per Shopify product the brand has decided something about:
             brand_id, product_id, line_id, lifecycle ('core' | 'seasonal' |
             'drop' | 'winding_down' | 'discontinued'), season_from, season_to,
             moq, lead_override_days, decision ('keep' | 'cut' | 'decide'), notes
orders       purchase orders: id ('PO-0012'), brand_id, factory_id, status
             ('draft' | 'sent' | 'confirmed' | 'production' | 'shipped' |
             'partial' | 'landed' | 'cancelled'), sent_at, confirmed_at,
             expected_at, landed_at, deposit, tracking, notes, created_by
order_lines  the lines on an order: order_id, product_id, variant_id, qty,
             received, unit_cost
factories    id, brand_id, name, lead_days, production_days, transit_days,
             moq, order windows and notes
lines        the product lines (a design family): id, brand_id, category_id,
             name, factory_id, cadence, notes
categories   id, brand_id, name, sort
collections  a drop: id, brand_id, name, drop_at
slots        a piece of the next lineup: id, brand_id, line_id, name,
             collection_id, status ('needs_brief' | 'in_design' | 'sampling' |
             'approved' | 'ordered' | 'live'), on_site_at, brief_due,
             sample_due, order_by, lands_at, sample_requested_at,
             sample_expected_at, sample_in_hand_at, asana_task, product_id, notes
type_map     which Shopify product type maps to which line
changelog    every decision anyone made: brand_id, actor, entity, entity_id,
             action, detail (JSON), created_at. Use it for "who changed" and "when".
brands       id, name, tz, and the brand's own settings
`;

const RULES = brand => `
## Rules
- EVERY query must filter brand_id = '${brand}'. Other brands' rows exist in
  the same tables and are not this conversation's.
- Stock, velocity, weeks of cover, sell-through, what to order and when: these
  are NOT in the tables. They are computed. Use the views (read_app), never
  guess them from order_lines.
- An order's units are SUM(qty) over its order_lines; received is SUM(received).
- A date is 'YYYY-MM-DD'. "Landing" means expected_at; "landed" means landed_at.
- Quantities are units. Money is US dollars at cost unless a view says retail.
`;

const TABLES = ['products', 'orders', 'order_lines', 'factories', 'lines', 'categories', 'collections', 'slots', 'type_map', 'changelog', 'brands'];

/* How a good buyer thinks. Read before every answer; the copy in Settings wins. */
const PLAYBOOK = `
- The order-by date is the whole game. Every answer about a product ends with when it must be ordered and what happens if it is not.
- Read cover in weeks at the CURRENT velocity, then ask whether the velocity is real: a spike from a promotion is not a new run rate, and a fall after a stockout is not a dead product.
- Never order below the factory MOQ or the order window; say when the maths and the factory disagree.
- Dead stock is cash. Name the number at cost, and the two ways out: a drop, or discontinue and stop counting it.
- The lineup is a chain of dates working backwards from on-site: brief, tech pack, sample, order, land. A late step moves the drop; say which step and by how much.
- One factory order beats three: when several products from one factory are due inside a month, say so and propose one order.
- Prefer proposing a concrete change (a slot, an order, a lifecycle) over describing what someone could do. A proposal costs nothing until it is applied.
- Never state a quantity, a date or a cost you did not get from a view or a query.
`.trim();

const VIEW_BLURBS = {
  today: 'the Today screen: the headline (how many to order, overdue, on the way, next landing, revenue at risk, dead stock) and the decisions the brain is asking for right now, in order. Start here for "what do I need to do".',
  product: 'one product by name or id: velocity, weeks of cover, on hand, sold in 30 days, status, order-by date, suggested quantity, lifecycle, line, factory, flags (spike, rising, falling). Use it for any question about a single product.',
  reorder: 'every product that needs ordering, worst first, with the suggested quantity, the order-by date and the factory. This is the Reorder screen.',
  orders: 'every purchase order in flight or landed: units, received, cost, factory, expected landing, whether it is overdue or likely landed.',
  factories: 'each factory with its lead times, its order windows and what it makes.',
  lines: 'the product lines and categories with their velocity, stock and status counts. Use it for "how is the putter line doing".',
  lineup: 'the lineup slots: each upcoming piece, its stage, its dates (brief due, sample due, order by, lands, on site), what is late in it, and the Asana task.',
  collections: 'the drops: each collection, its date and the slots in it.',
  performance: 'sell-through and velocity by product over the history window: best sellers, slow movers, dead stock at cost.',
  changelog: 'the last decisions people made in Supply, newest first: who, what, when.',
  findings: 'everything the nightly checks currently have open.',
  config: 'how this brand is set up: buffer and cover days, digest hour, the timezone.',
};

/* ------------------------------------------------------------------ */
/*  the views: slices of the brain's state                             */
/* ------------------------------------------------------------------ */

function buildViews(d, brand) {
  /* One computeSupply per request, however many views a question opens. */
  const stateOf = async ctx => {
    if (ctx?._state) return ctx._state;
    const s = await d.state(brand, ctx?.request);
    if (ctx) ctx._state = s;
    return s;
  };
  const slim = p => ({ id: p.id, title: p.title, sku: p.sku, line: p.lineName, factory: p.factoryName, status: p.status, lifecycle: p.lifecycle,
    onHand: p.onHand, velocityPerDay: p.velocity != null ? Math.round(p.velocity * 100) / 100 : null, weeksOfCover: p.weeksOfCover ?? null,
    sold30: p.sold30, trend: p.trend, runOutDate: p.runOutDate, orderByDate: p.orderByDate, orderByDays: p.orderByDays, overdue: !!p.overdue,
    suggested: p.suggested ?? null, atCost: p.atCost ?? null, unitCost: p.cost ?? null, revenueAtRisk: p.revenueAtRisk ?? null,
    deadUnits: p.deadUnits ?? 0, sellThrough: p.sellThrough ?? null });
  const find = (s, q) => {
    const want = String(q || '').toLowerCase().trim();
    if (!want) return null;
    return s.products.find(p => String(p.id) === want || String(p.sku || '').toLowerCase() === want)
      || s.products.find(p => String(p.title || '').toLowerCase().includes(want) || String(p.sku || '').toLowerCase().includes(want));
  };
  return {
    today: async (env, a, ctx) => { const s = await stateOf(ctx); return { today: s.today, headline: s.headline, decisions: s.decisions, counts: s.counts, how_to_read: VIEW_BLURBS.today }; },
    product: async (env, a, ctx) => {
      const s = await stateOf(ctx);
      const p = find(s, a.id || a.q || a.name || a.product);
      if (!p) return { error: 'No product matches. Give the title, the SKU or the id.', some: s.products.slice(0, 40).map(x => ({ id: x.id, title: x.title, sku: x.sku })) };
      return { product: { ...slim(p), designs: p.designs, suggestedLines: p.suggestedLines, moq: p.moq, moqMet: p.moqMet, leadDays: p.leadDays, cycleDays: p.cycleDays, incomingLands: p.incomingLands, notes: p.notes },
        how_to_read: 'status: out | order | soon | covered | ok | gap | unsorted | nofactory | nosales | drop | drop_done | sunset | dormant | off. orderByDate is the last day to place the order and still not run out (orderByDays negative = already late); suggested is what the brain would order and suggestedLines splits it by variant. velocity is units a day blended over 14/30/90 days with out-of-stock days removed; trend is new | flat | rising | spiking | falling | steady.' };
    },
    reorder: async (env, a, ctx) => { const s = await stateOf(ctx); const rows = s.products.filter(p => ['out', 'order', 'gap', 'soon'].includes(p.status)); return { count: rows.length, products: rows.slice(0, 60).map(slim), how_to_read: VIEW_BLURBS.reorder + ' soon = not yet, but inside the watch window.' }; },
    orders: async (env, a, ctx) => { const s = await stateOf(ctx); return { orders: s.orders.slice(0, 60), how_to_read: 'status draft | sent | confirmed | production | shipped | partial | landed | cancelled. expected_at is the landing date; overdue means past it and not landed.' }; },
    factories: async (env, a, ctx) => { const s = await stateOf(ctx); return { factories: s.factories, how_to_read: VIEW_BLURBS.factories }; },
    lines: async (env, a, ctx) => { const s = await stateOf(ctx); return { categories: s.categories, lines: s.lines, how_to_read: VIEW_BLURBS.lines }; },
    lineup: async (env, a, ctx) => { const s = await stateOf(ctx); return { slots: s.slots.slice(0, 60), how_to_read: 'late is true when any of brief, techPack, sample or order is past its due date. dates are derived backwards from on_site_at using the factory lead times.' }; },
    collections: async (env, a, ctx) => { const s = await stateOf(ctx); return { collections: s.collections, how_to_read: VIEW_BLURBS.collections }; },
    performance: async (env, a, ctx) => {
      const s = await stateOf(ctx);
      const live = s.products.filter(p => p.status !== 'off');
      const by = (k, dir = -1) => live.slice().sort((x, y) => dir * ((x[k] || 0) - (y[k] || 0)));
      return { historyDays: s.historyDays, bestSellers30: by('sold30').slice(0, 15).map(slim), slowest: by('sold30', 1).filter(p => p.onHand > 0).slice(0, 15).map(slim),
        dead: live.filter(p => (p.deadUnits || 0) > 0).map(slim), how_to_read: VIEW_BLURBS.performance + ' deadUnits are units the brain does not expect to sell at the current rate.' };
    },
    changelog: async env => ({ changes: (await env.DB.prepare(`SELECT actor, entity, entity_id, action, detail, created_at FROM changelog WHERE brand_id = ?1 ORDER BY created_at DESC LIMIT 40`).bind(brand).all()).results || [], how_to_read: VIEW_BLURBS.changelog }),
    findings: async (env, a, ctx, engine) => ({ open: await engine.openFindings(env, d.h(brand, ctx?.request)), how_to_read: VIEW_BLURBS.findings }),
    config: async (env, a, ctx) => { const s = await stateOf(ctx); return { brand: s.brandName, tz: s.tz, settings: s.settings, how_to_read: VIEW_BLURBS.config }; },
  };
}

/* ------------------------------------------------------------------ */
/*  the checks: read off the same state, no model                      */
/* ------------------------------------------------------------------ */

async function runChecks(env, h, d, brand) {
  const s = await d.state(brand, null);
  const today = s.today, month = today.slice(0, 7);
  const out = [];
  /* 1. Order-by date passed and nothing ordered. */
  for (const p of s.products.filter(p => (p.status === 'out' || p.overdue) && !['drop', 'drop_done', 'discontinued'].includes(p.lifecycle)))
    out.push({ key: `late-order:${p.id}`, kind: 'late-order', severity: p.status === 'out' ? 'high' : 'med', amount: p.revenueAtRisk || null, month,
      title: p.status === 'out' ? `${p.title} is out of stock and nothing is on order` : `${p.title} should have been ordered by ${p.orderByDate}`,
      detail: `${p.onHand} on hand, selling ${Math.round((p.velocity || 0) * 7)} a week. Order ${p.suggested || '?'} now, or mark it a one-off drop so it stops asking.`, evidence: { productId: p.id } });
  /* 2. A factory order past its landing date. */
  for (const o of s.orders.filter(o => o.overdue))
    out.push({ key: `late-landing:${o.id}`, kind: 'late-landing', severity: 'med', amount: o.atCost || null, month,
      title: `${o.id} from ${o.factoryName || 'the factory'} was due ${o.expected_at} and has not landed`,
      detail: `${o.units} units${o.productTitles ? ' (' + String(o.productTitles).slice(0, 80) + ')' : ''}. Chase the factory for a new date, or mark it landed if it has.`, evidence: { orderId: o.id } });
  /* 3. Velocity spike or collapse. */
  for (const p of s.products.filter(p => p.status !== 'off' && (p.trend === 'spiking' || p.trend === 'falling') && p.sold30 >= 5))
    out.push({ key: `velocity:${p.id}:${month}`, kind: 'velocity', severity: 'low', amount: null, month,
      title: `${p.title} is selling ${p.trend === 'spiking' ? 'much faster' : 'much slower'} than usual`,
      detail: `Sold ${p.sold30} in 30 days. If it is a promotion, nothing to do; if it is real, the order-by date has moved.`, evidence: { productId: p.id } });
  /* 4. A lineup slot late on any part. */
  for (const sl of s.slots.filter(sl => sl.late))
    out.push({ key: `late-slot:${sl.id}:${Object.keys(sl.lateParts || {}).filter(k => sl.lateParts[k]).join('+')}`, kind: 'late-slot', severity: sl.lateParts?.order ? 'high' : 'med', amount: null, month,
      title: `${sl.name} is late on ${Object.keys(sl.lateParts || {}).filter(k => sl.lateParts[k]).join(', ') || 'a step'}`,
      detail: `On site ${sl.dropAt || sl.on_site_at}. Stage: ${sl.status}. Every week lost here moves the drop.`, evidence: { slotId: sl.id } });
  /* 5. Dead stock worth something. */
  const dead = s.products.filter(p => (p.deadUnits || 0) > 0);
  const deadCost = dead.reduce((a, p) => a + (p.deadCost || (p.deadUnits || 0) * (p.cost || 0)), 0);
  if (dead.length && deadCost >= 500)
    out.push({ key: `dead:${month}`, kind: 'dead-stock', severity: 'low', amount: Math.round(deadCost), month,
      title: `${dead.length} product${dead.length > 1 ? 's are' : ' is'} dead stock, about $${Math.round(deadCost).toLocaleString('en-US')} at cost`,
      detail: `${dead.slice(0, 4).map(p => p.title).join(', ')}${dead.length > 4 ? ' and more' : ''}. Clear them in a drop, or mark them discontinued so they stop counting.`, evidence: {} });
  return out;
}

async function snapshot(env, h, d, brand) {
  const s = await d.state(brand, null);
  return { today: s.today, brand: s.brandName, headline: s.headline, counts: s.counts,
    next_landing: s.orders.filter(o => !o.overdue && o.daysToLanding != null && o.daysToLanding >= 0).sort((a, b) => a.daysToLanding - b.daysToLanding).slice(0, 3).map(o => ({ id: o.id, expected_at: o.expected_at, units: o.units })) };
}

/* ------------------------------------------------------------------ */
/*  actions: each one proposes; the tap runs the SAME route the screen  */
/*  calls, so the Buyer can never write something the app cannot.       */
/* ------------------------------------------------------------------ */

const ACTIONS = (d, brand) => {
  const findProduct = (s, q) => {
    const want = String(q || '').toLowerCase().trim();
    return s.products.find(p => String(p.id) === want || String(p.sku || '').toLowerCase() === want)
      || s.products.find(p => String(p.title || '').toLowerCase().includes(want) || String(p.sku || '').toLowerCase().includes(want)) || null;
  };
  const findLine = (s, q) => { const w = String(q || '').toLowerCase().trim(); return s.lines.find(l => l.id === q) || s.lines.find(l => String(l.name || '').toLowerCase() === w) || s.lines.find(l => String(l.name || '').toLowerCase().includes(w)) || null; };
  const findFactory = (s, q) => { const w = String(q || '').toLowerCase().trim(); return s.factories.find(f => f.id === q) || s.factories.find(f => String(f.name || '').toLowerCase().includes(w)) || null; };
  const findCollection = (s, q) => { if (!q) return null; const w = String(q).toLowerCase().trim(); return s.collections.find(c => c.id === q) || s.collections.find(c => String(c.name || '').toLowerCase().includes(w)) || null; };
  const state = (h, ctx) => d.state(brand, ctx?.request || h?.request);
  return [
    { name: 'add_lineup_slot',
      description: 'Add a piece to the lineup plan: a new design in a line, with the date it must be on site (or the collection it belongs to, whose date stands in). Supply works the brief, sample and order dates backwards, and creates its Asana task.',
      input_schema: { type: 'object', properties: {
        line: { type: 'string', description: 'The line name (or id) it belongs to.' }, name: { type: 'string', description: 'What to call the piece, e.g. "Spring putter cover 2".' },
        on_site_at: { type: 'string', description: "'YYYY-MM-DD' the day it must be on the site. Optional when a collection is given." },
        collection: { type: 'string', description: 'The drop it belongs to, by name.' }, notes: { type: 'string' },
        summary: { type: 'string', description: 'One short line for the card.' } }, required: ['line', 'name', 'summary'] },
      propose: async (env, input, h, ctx) => {
        const s = await state(h, ctx);
        const line = findLine(s, input.line); if (!line) return { error: `No line called "${input.line}". The lines view lists them.` };
        const col = findCollection(s, input.collection);
        const on = /^\d{4}-\d{2}-\d{2}$/.test(input.on_site_at || '') ? input.on_site_at : col?.drop_at || col?.dropAt || null;
        if (!on) return { error: 'Give on_site_at, or a collection with a date.' };
        return { summary: input.summary, detail: `${input.name} in ${line.name}, on site ${on}${col ? ` (drop: ${col.name})` : ''}. Supply will date the brief, sample and order backwards from that and open the Asana task.`,
          patch: { body: { line_id: line.id, name: String(input.name).slice(0, 80), on_site_at: on, collection_id: col?.id || null, notes: input.notes || null }, actor: 'the Buyer' } };
      },
      apply: async (env, patch, h) => { const r = await d.call(h.request, 'POST', '/api/slots', patch.body); return r.error ? r : { ok: true, note: `Added${r.asanaTask ? ', Asana task created' : ''}.` }; } },

    { name: 'set_product',
      description: 'Change what Supply knows about one product: its lifecycle (core | seasonal | drop | winding_down | discontinued), the plan decision (keep | cut | decide), its MOQ, or a note. "It was a one-off" = lifecycle drop. "Stop counting it" = discontinued.',
      input_schema: { type: 'object', properties: {
        product: { type: 'string', description: 'Title, SKU or id.' }, lifecycle: { type: 'string', enum: ['core', 'seasonal', 'drop', 'winding_down', 'discontinued'] },
        decision: { type: 'string', enum: ['keep', 'cut', 'decide'] }, moq: { type: 'integer' }, notes: { type: 'string' },
        summary: { type: 'string' } }, required: ['product', 'summary'] },
      propose: async (env, input, h, ctx) => {
        const s = await state(h, ctx);
        const p = findProduct(s, input.product); if (!p) return { error: `No product matches "${input.product}".` };
        const body = {}; const lines = [];
        if (input.lifecycle) { body.lifecycle = input.lifecycle; lines.push(`lifecycle ${p.lifecycle} → ${input.lifecycle}`); }
        if (input.decision) { body.decision = input.decision; lines.push(`decision → ${input.decision}`); }
        if (input.moq !== undefined) { body.moq = Number(input.moq); lines.push(`MOQ → ${body.moq}`); }
        if (input.notes !== undefined) { body.notes = String(input.notes).slice(0, 2000); lines.push('note updated'); }
        if (!lines.length) return { error: 'Nothing to change.' };
        return { summary: input.summary, detail: `${p.title}: ${lines.join(', ')}.`, patch: { pid: String(p.id).replace(/\D/g, ''), body } };
      },
      apply: async (env, patch, h) => { const r = await d.call(h.request, 'PUT', `/api/products/${patch.pid}`, patch.body); return r.error ? r : { ok: true, note: 'Updated.' }; } },

    { name: 'log_order',
      description: 'Log a purchase order to a factory: which products and how many, when it is expected to land. Uses the brain\'s suggested split by variant when a product has sizes or colours. Creates it as a draft (or sent) so it shows on Orders and in the forecast.',
      input_schema: { type: 'object', properties: {
        factory: { type: 'string' },
        lines: { type: 'array', items: { type: 'object', properties: { product: { type: 'string' }, qty: { type: 'integer', description: 'Total units for the product. Omit to use the suggested quantity.' } }, required: ['product'] } },
        expected_at: { type: 'string', description: "'YYYY-MM-DD' landing date, optional." }, status: { type: 'string', enum: ['draft', 'sent'] }, notes: { type: 'string' },
        summary: { type: 'string' } }, required: ['factory', 'lines', 'summary'] },
      propose: async (env, input, h, ctx) => {
        const s = await state(h, ctx);
        const f = findFactory(s, input.factory); if (!f) return { error: `No factory called "${input.factory}".` };
        const out = [], detail = [];
        for (const l of input.lines || []) {
          const p = findProduct(s, l.product); if (!p) return { error: `No product matches "${l.product}".` };
          const want = Number(l.qty) || p.suggested || 0;
          if (!want) return { error: `${p.title}: give a quantity, the brain has no suggestion for it.` };
          const split = (p.suggestedLines || []).filter(x => x.qty > 0);
          const total = split.reduce((a, x) => a + x.qty, 0);
          const variants = (p.designs || p.variants || []);
          if (split.length && total) for (const x of split) out.push({ product_id: String(p.id), variant_id: String(x.variantId), qty: Math.max(1, Math.round(want * x.qty / total)), unit_cost: p.cost ?? null });
          else if (variants.length === 1) out.push({ product_id: String(p.id), variant_id: String(variants[0].id), qty: want, unit_cost: p.cost ?? null });
          else if (variants.length) { const each = Math.max(1, Math.round(want / variants.length)); for (const v of variants) out.push({ product_id: String(p.id), variant_id: String(v.id), qty: each, unit_cost: p.cost ?? null }); }
          else return { error: `${p.title} has no variants Supply can order against.` };
          detail.push(`${p.title} × ${want}`);
        }
        if (!out.length) return { error: 'An order needs at least one line.' };
        const units = out.reduce((a, x) => a + x.qty, 0), cost = out.reduce((a, x) => a + x.qty * (x.unit_cost || 0), 0);
        return { summary: input.summary, detail: `${f.name}: ${detail.join(', ')}. ${units} units${cost ? `, about $${Math.round(cost).toLocaleString('en-US')} at cost` : ''}${input.expected_at ? `, landing ${input.expected_at}` : ''}. Logged as ${input.status || 'draft'}.`,
          patch: { body: { factory_id: f.id, status: input.status || 'draft', expected_at: input.expected_at || null, notes: input.notes || null, lines: out } } };
      },
      apply: async (env, patch, h) => { const r = await d.call(h.request, 'POST', '/api/orders', patch.body); return r.error ? r : { ok: true, note: `${r.id} logged.` }; } },

    { name: 'update_order',
      description: 'Move a purchase order along: status (sent | confirmed | production | shipped | partial | landed | cancelled), its expected landing date, tracking, or a note.',
      input_schema: { type: 'object', properties: {
        id: { type: 'string', description: 'The order id, e.g. PO-0012.' }, status: { type: 'string', enum: ['draft', 'sent', 'confirmed', 'production', 'shipped', 'partial', 'landed', 'cancelled'] },
        expected_at: { type: 'string' }, tracking: { type: 'string' }, notes: { type: 'string' }, summary: { type: 'string' } }, required: ['id', 'summary'] },
      propose: async (env, input, h, ctx) => {
        const s = await state(h, ctx);
        const o = s.orders.find(x => x.id.toLowerCase() === String(input.id || '').toLowerCase()); if (!o) return { error: `No order ${input.id}.` };
        const body = {}; const lines = [];
        for (const k of ['status', 'expected_at', 'tracking', 'notes']) if (input[k] !== undefined) { body[k] = input[k]; lines.push(`${k.replace('_', ' ')} → ${input[k]}`); }
        if (!lines.length) return { error: 'Nothing to change.' };
        return { summary: input.summary, detail: `${o.id} (${o.factoryName || 'factory'}): ${lines.join(', ')}.`, patch: { id: o.id, body } };
      },
      apply: async (env, patch, h) => { const r = await d.call(h.request, 'PUT', `/api/orders/${encodeURIComponent(patch.id)}`, patch.body); return r.error ? r : { ok: true, note: `${patch.id} updated.` }; } },

    { name: 'send_slot_to_asana',
      description: 'Create the Asana task for a lineup slot that does not have one yet (with the brief, tech pack and sample steps).',
      input_schema: { type: 'object', properties: { slot: { type: 'string', description: 'The slot name or id.' }, summary: { type: 'string' } }, required: ['slot', 'summary'] },
      propose: async (env, input, h, ctx) => {
        const s = await state(h, ctx);
        const w = String(input.slot || '').toLowerCase();
        const sl = s.slots.find(x => x.id === input.slot) || s.slots.find(x => String(x.name || '').toLowerCase().includes(w)); if (!sl) return { error: `No slot matches "${input.slot}".` };
        if (sl.asana_task) return { error: `${sl.name} already has an Asana task: ${sl.asana_task}` };
        return { summary: input.summary, detail: `Create the Asana task for ${sl.name} (on site ${sl.dropAt || sl.on_site_at}) in the brand's Asana project, with its steps.`, patch: { id: sl.id } };
      },
      apply: async (env, patch, h) => { const r = await d.call(h.request, 'POST', `/api/slots/${encodeURIComponent(patch.id)}/asana`, {}); return r.error ? r : { ok: true, note: 'Asana task created.' }; } },
  ];
};

/* ------------------------------------------------------------------ */
/*  assembly, one per brand                                            */
/* ------------------------------------------------------------------ */

const cache = new Map();

/**
 * @param d  from worker.js: state(brand, request) -> computeSupply output,
 *           getSetting(env, brand, key), putSetting(env, brand, key, value),
 *           listSettings(env, brand), safeJson, centralDate(brand), monthOf, slack?
 */
export function buildBuyer(d, brand, brandName) {
  if (cache.has(brand)) return cache.get(brand);
  const secretKey = makeSecretKey([]);
  let engine;
  const rawViews = buildViews(d, brand);
  const views = Object.fromEntries(Object.entries(rawViews).map(([k, fn]) => [k, (env, a, ctx) => fn(env, a, ctx, engine)]));
  const app = makeAppView({
    views, blurbs: VIEW_BLURBS, secretKey, safeJson: d.safeJson, fallbackTables: TABLES,
    getSetting: (env, key) => d.getSetting(env, brand, key),
    listStored: env => d.listSettings(env, brand),
    getStored: (env, key) => d.getSetting(env, brand, key),
  });
  const h = (b, request) => ({
    request,
    getSetting: (env, key) => d.getSetting(env, brand, key),
    putSetting: (env, key, value) => d.putSetting(env, brand, key, value),
    safeJson: d.safeJson, centralDate: () => d.today(brand), monthOf: x => String(x).slice(0, 7),
    slack: d.slack,
    appView: (env, name, args) => app.appView(env, name, args, { request, brand }),
    appViews: app.appViews, viewBlurbs: app.viewBlurbs, readableTables: app.readableTables,
  });
  d.h = h;
  engine = createAssistant({
    name: 'Buyer', app: 'Supply', memoryPrefix: 'buyer', owner: 'Cole', repoPath: 'supply/ (worker in supply/worker/src, brain in brain.js, screens in supply/app.js and app2.js)',
    who: WHO(brandName), schema: SCHEMA, rules: RULES(brand), tables: TABLES,
    sqlTool: 'query_supply', findingsTable: 'findings_' + brand.replace(/[^a-z0-9]/g, '_'),
    brief: `${brandName}'s products are made to order at factories with long lead times, so the order-by date is the whole game: miss it and the product goes out of stock for the length of the lead time. Supply computes velocity from Shopify sales with out-of-stock days removed, and works the dates backwards from when a product must be on the site. The Slack digest every morning is the Buyer's briefing.`,
    liveContext: async () => `## This conversation is about the brand "${brand}" (${brandName}). Every SQL query filters brand_id = '${brand}'.`,
    checkKinds: ['late-order', 'late-landing', 'velocity', 'late-slot', 'dead-stock'],
    checks: (env, hh) => runChecks(env, hh, d, brand),
    snapshot: (env, hh) => snapshot(env, hh, d, brand),
    actions: ACTIONS(d, brand),
    playbook: PLAYBOOK,
    slackApp: 'supply',
    briefingHow: `- Slack mrkdwn: *bold* with single asterisks, bullets are "• ", no headings, no tables.
- Open with one line: how many to order, what is landing next, revenue at risk.
- Then EVERY finding worth their time, one bullet each, most urgent first, drawn ONLY from the findings given. Each bullet: the product or order, the date, what to do.
- No padding, no preamble, no sign-off. Never invent a number. Never use em dashes.`,
  });
  const built = { engine, h: request => h(brand, request), views: app };
  cache.set(brand, built);
  return built;
}

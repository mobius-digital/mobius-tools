/**
 * Supply brain: turns the raw Shopify feed (catalog + daily history, from the
 * Restock worker) and Supply's own decisions (D1: lines, factories, lifecycle,
 * orders, slots, settings) into everything the screens show.
 *
 * Pure functions, no I/O. `computeSupply(raw, db)` is the only export the
 * worker needs; the helpers are exported for tests.
 */

/* ---------- dates ---------- */
export function localDate(tz, d = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
}
export function addDays(ymd, n) {
  const d = new Date(`${ymd}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
export const daysBetween = (a, b) => Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 86400000);

/* ---------- velocity (ported from Restock, unchanged where it was right) ---------- */
const WINDOWS = [{ days: 14, weight: 0.45 }, { days: 30, weight: 0.35 }, { days: 90, weight: 0.20 }];
const SPIKE_CAP = 2.0, SPIKE_FLAG = 2.0, RISE_FLAG = 1.35, FALL_FLAG = 0.65;
const HISTORY_CAP = 800;

function windowRate(history, vid, endDay, days, sinceDay, recon) {
  let sold = 0, have = 0, eff = 0;
  for (let i = 0; i < days; i++) {
    const day = addDays(endDay, -i);
    if (history.startDate && day < history.startDate) break;
    if (sinceDay && day < sinceDay) break;
    have++;
    const qty = history.days[day]?.[vid] || 0;
    const inv = history.inventory[day]?.[vid] ?? recon?.[day]?.[vid];
    const oosDay = inv !== undefined && inv <= 0 && qty === 0;
    if (!oosDay) eff++;
    sold += qty;
  }
  return { sold, days: have, eff, rate: have ? sold / Math.max(eff, Math.min(3, have)) : 0 };
}

function reconstructInventory(history) {
  const tracked = Object.keys(history.inventory || {}).sort();
  if (!tracked.length || !history.startDate) return null;
  const earliest = tracked[0];
  if (history.startDate >= earliest) return null;
  const recon = {};
  const running = { ...(history.inventory[earliest] || {}) };
  let day = addDays(earliest, -1);
  for (let guard = 0; day >= history.startDate && guard < HISTORY_CAP + 5; guard++) {
    const sales = history.days[day] || {};
    const bucket = {};
    for (const vid of Object.keys(running)) { running[vid] += sales[vid] || 0; bucket[vid] = running[vid]; }
    recon[day] = bucket;
    day = addDays(day, -1);
  }
  return recon;
}

function blendVelocity(rates, { isNew = false } = {}) {
  const [r14, , r90] = rates;
  const ratio = r90.rate > 0.02 ? r14.rate / r90.rate : (r14.rate > 0 ? 99 : 1);
  const spike = !isNew && ratio > SPIKE_CAP && r90.rate > 0.02;
  const damped14 = spike ? r90.rate * SPIKE_CAP : r14.rate;
  let vel = 0, wSum = 0;
  WINDOWS.forEach((w, i) => {
    if (rates[i].days < Math.min(7, w.days)) return;
    if (rates[i].eff === 0) return;
    vel += (i === 0 ? damped14 : rates[i].rate) * w.weight;
    wSum += w.weight;
  });
  if (wSum > 0) vel /= wSum;
  else { const w = rates.find(r => r.days > 0 && r.eff > 0); if (w) vel = w.rate; }
  const trend = isNew ? 'new' : ratio >= SPIKE_FLAG ? 'spiking' : ratio >= RISE_FLAG ? 'rising' : ratio <= FALL_FLAG ? 'falling' : 'steady';
  return { velocity: vel, trend, spike };
}

/* ---------- helpers ---------- */
const sum = (arr, f) => arr.reduce((s, x) => s + (f ? f(x) : x), 0);
const r1 = n => Math.round(n * 10) / 10;
export const AXIS_OPTION = { size: ['size'], hand: ['hand', 'dexterity', 'orientation'], loft_hand: ['loft', 'hand'], hand_size: ['hand', 'size'], none: [] };

/** The value of a variant along its line's axis, e.g. "Large", "RH", "56 · RH". */
const SIZE_NAMES = ['size', 'grip size', 'sizes'], HAND_NAMES = ['hand', 'dexterity', 'orientation', 'handedness'], LOFT_NAMES = ['loft', 'loft & grind', 'loft and grind', 'degree'];
export function axisValue(variant, axis) {
  const opts = variant.options || [];
  const find = names => opts.find(o => names.includes(String(o.n || '').toLowerCase()))?.v;
  const clean = v => v == null ? '' : String(v).replace(/\s*\/\s*.*$/, '').trim(); // "56 / Standard" -> "56"
  if (axis === 'size') return find(SIZE_NAMES) || variant.title || '';
  if (axis === 'hand') return find(HAND_NAMES) || variant.title || '';
  if (axis === 'loft_hand') { const l = clean(find(LOFT_NAMES)), h = find(HAND_NAMES); return [l, h].filter(Boolean).join(' · ') || variant.title || ''; }
  if (axis === 'hand_size') { const h = find(HAND_NAMES), sz = find(SIZE_NAMES); return [h, sz].filter(Boolean).join(' · ') || variant.title || ''; }
  return variant.title || '';
}
/** Size part only (for size curves on hand_size lines the curve is per size; on loft_hand it is per loft). */
function sizeKey(variant, axis) {
  const opts = variant.options || [];
  const find = names => opts.find(o => names.includes(String(o.n || '').toLowerCase()))?.v;
  if (axis === 'size' || axis === 'hand_size') return find(SIZE_NAMES) || variant.title || '';
  if (axis === 'loft_hand') { const m = /(\d+)/.exec(String(find(LOFT_NAMES) || variant.title || '')); return m ? m[1] : String(find(LOFT_NAMES) || variant.title || ''); }
  return axisValue(variant, axis);
}

/* ---------- lifecycle ---------- */
export const LIFECYCLES = ['core', 'seasonal', 'drop', 'winding_down', 'discontinued'];
const forecastable = lc => lc === 'core' || lc === 'seasonal';

/* ---------- design slots ---------- */
/** Every date on a slot is worked back from the one date typed by hand, the
 *  on-site date, through the line's factory lead time. computeSupply uses this
 *  for the screens; the Asana hand-off uses it to fill in a task. */
export function slotDates(sl, db) {
  const S = Object.assign({ buffer_days: 10, site_prep_days: 14, design_days: 14, sample_make_days: 21, slack_days: 10 }, db.settings || {});
  const num = (k, fb) => { const n = Number(S[k]); return Number.isFinite(n) ? n : fb; };
  const line = (db.lines || []).find(l => l.id === sl.line_id) || null;
  const factory = line && line.factory_id ? ((db.factories || []).find(f => f.id === line.factory_id) || null) : null;
  /* the collection owns the drop date: move it there and every slot in it moves */
  const collection = sl.collection_id ? ((db.collections || []).find(c => c.id === sl.collection_id) || null) : null;
  const onSite = collection?.drop_at || sl.on_site_at;
  const prod = line?.lead_override_days != null ? line.lead_override_days : (factory ? factory.production_days : 40);
  const ship = line?.lead_override_days != null ? 0 : (factory ? factory.shipping_days : 20);
  const lands = sl.lands_at || addDays(onSite, -num('site_prep_days', 14));
  const orderBy = sl.order_by || addDays(lands, -(num('buffer_days', 10) + ship + prod));
  /* Each step has a length, and the chain is just those lengths stacked back
     from the drop. The design is the stretch between the brief and the tech
     pack, so it needs no date of its own. */
  const sampleDue = sl.sample_due || addDays(orderBy, -num('slack_days', 10));
  const techPackDue = addDays(sampleDue, -num('sample_make_days', 21));
  const briefDue = sl.brief_due || addDays(techPackDue, -num('design_days', 14));
  const dates = { briefDue, techPackDue, sampleDue, orderBy, productionEnd: addDays(orderBy, prod), lands, onSite };
  return { line, factory, collection, dates, ...dates };
}

/* ---------- main ---------- */
export function computeSupply(raw, db) {
  const { store, catalog, history, onOrder = {} } = raw;
  const tz = store.tz || 'America/Chicago';
  const today = localDate(tz);
  const endDay = addDays(today, -1);
  const historyDays = history.startDate ? Math.max(0, daysBetween(history.startDate, endDay) + 1) : 0;
  const recon = reconstructInventory(history);

  const S = Object.assign({
    buffer_days: 10, cover_days: 180, watch_days: 60, site_prep_days: 14, design_days: 14, sample_make_days: 21, slack_days: 10,
    thin_days: 45, core_share: 0.8, dead_days: 90,
  }, db.settings || {});
  const num = (k, fb) => { const n = Number(S[k]); return Number.isFinite(n) ? n : fb; };
  const BUFFER = num('buffer_days', 10), COVER = num('cover_days', 180), WATCH = num('watch_days', 60);

  const factories = Object.fromEntries((db.factories || []).map(f => [f.id, { ...f, closures: safeJson(f.closures, []) }]));
  const lines = Object.fromEntries((db.lines || []).map(l => [l.id, { ...l, size_curve: safeJson(l.size_curve, null) }]));
  const categories = Object.fromEntries((db.categories || []).map(c => [c.id, c]));
  const typeMap = Object.fromEntries((db.typeMap || []).map(t => [t.shop_type, t.line_id]));
  const decisions = Object.fromEntries((db.products || []).map(p => [p.product_id, p]));

  /* incoming stock from orders that the factory actually has */
  const OPEN = new Set(['sent', 'confirmed', 'production', 'shipped', 'partial']);
  const incomingByVariant = {};
  const openOrders = (db.orders || []).filter(o => OPEN.has(o.status));
  for (const o of openOrders) {
    for (const l of (db.orderLines || []).filter(l => l.order_id === o.id)) {
      const left = Math.max(0, (l.qty || 0) - (l.received || 0));
      if (!left) continue;
      (incomingByVariant[l.variant_id] ||= []).push({ orderId: o.id, qty: left, lands: o.expected_at || null, status: o.status });
    }
  }
  /* legacy Restock on-order records still count until they are entered as orders */
  for (const [vid, rec] of Object.entries(onOrder)) {
    if (!incomingByVariant[vid]) incomingByVariant[vid] = [{ orderId: 'legacy', qty: rec.qty, lands: rec.eta || null, status: 'shipped' }];
  }

  const unsortedTypes = new Set();
  const products = [];

  for (const p of catalog.products) {
    const tracked = p.variants.filter(v => v.tracked);
    if (!tracked.length) continue;
    const dec = decisions[p.id] || {};
    const lineId = dec.line_id || typeMap[p.type] || null;
    const line = lineId ? lines[lineId] : null;
    if (!line) unsortedTypes.add(p.type || '(no type)');
    const factory = line?.factory_id ? factories[line.factory_id] : null;
    const axis = line?.variant_axis || 'none';
    const lifecycle = dec.lifecycle || 'core';
    const leadBase = dec.lead_override_days ?? p.leadOverride ?? line?.lead_override_days ?? (factory ? factory.production_days + factory.shipping_days : null);
    const leadDays = leadBase != null ? leadBase + BUFFER : null;
    const moq = dec.moq ?? p.moq ?? line?.moq ?? factory?.moq_default ?? null;
    const price = median(tracked.map(v => v.price).filter(x => x != null));
    const cost = median(tracked.map(v => v.cost).filter(x => x != null));

    /* per variant: rates */
    const variants = tracked.map(v => {
      const launchDay = v.createdAt ? localDate(tz, new Date(v.createdAt)) : null;
      const ageDays = launchDay ? Math.max(0, daysBetween(launchDay, endDay) + 1) : null;
      const isNew = ageDays != null && ageDays < 14;
      const rates = WINDOWS.map(w => windowRate(history, v.id, endDay, w.days, launchDay, recon));
      const { velocity, trend, spike } = blendVelocity(rates, { isNew });
      const series = [];
      for (let i = 89; i >= 0; i--) series.push(history.days[addDays(endDay, -i)]?.[v.id] || 0);
      const inc = incomingByVariant[v.id] || [];
      return {
        id: v.id, sku: v.sku, title: v.title, axis: axisValue(v, axis), sizeKey: sizeKey(v, axis),
        onHand: v.inv, price: v.price ?? price, cost: v.cost ?? cost,
        sold14: rates[0].sold, sold30: rates[1].sold, sold90: rates[2].sold, buyable90: rates[2].eff, covered90: rates[2].days,
        rawVelocity: velocity, velocity, trend, spike, isNew, ageDays,
        incoming: sum(inc, i => i.qty), incomingLands: inc.map(i => i.lands).filter(Boolean).sort()[0] || null, incomingOrders: inc,
        series,
      };
    });

    products.push({
      id: p.id, title: p.title, image: p.image, type: p.type, vendor: p.vendor,
      lineId, lineName: line?.name || null, categoryId: line?.category_id || null, categoryName: line ? categories[line.category_id]?.name || null : null,
      factoryId: factory?.id || null, factoryName: factory?.name || null, axis,
      lifecycle, decision: dec.decision || null, notes: dec.notes || null,
      leadDays, leadParts: leadBase != null ? { base: leadBase, buffer: BUFFER, source: dec.lead_override_days != null ? 'product' : p.leadOverride != null ? 'shopify' : line?.lead_override_days != null ? 'line' : 'factory' } : null,
      moq, price, cost, variants,
    });
  }

  /* size curves per line, then demand for sold-out sizes */
  const lineCurves = {};
  for (const [lid, line] of Object.entries(lines)) {
    const ps = products.filter(p => p.lineId === lid);
    const tally = {};
    for (const p of ps) for (const v of p.variants) tally[v.sizeKey] = (tally[v.sizeKey] || 0) + v.sold90;
    const tot = sum(Object.values(tally));
    const learned = tot ? Object.fromEntries(Object.entries(tally).map(([k, n]) => [k, n / tot])) : {};
    lineCurves[lid] = { learned, used: line.size_curve && Object.keys(line.size_curve).length ? normalize(line.size_curve) : learned, sample: tot };
  }
  /* A variant that was buyable for less than RELIABLE days of the 90 has no honest
     rate of its own (the Restock math turned two lucky sales into a size's whole
     velocity). Its demand comes from the line's size curve applied to the rate of
     the sizes that WERE on the shelf; when none were, from plain sales over the
     window, which is conservative rather than inflated. */
  const RELIABLE = num('reliable_days', 45);
  for (const p of products) {
    const curve = p.lineId ? lineCurves[p.lineId]?.used : null;
    const curved = curve && Object.keys(curve).length && p.axis !== 'none' && p.axis !== 'hand';
    const reliable = p.variants.filter(v => v.buyable90 >= RELIABLE && (!curved || curve[v.sizeKey] != null));
    const curveMass = curved ? sum(reliable, v => curve[v.sizeKey] || 0) : 0;
    const productRate = curved && reliable.length && curveMass > 0 ? sum(reliable, v => v.rawVelocity) / curveMass : null;
    for (const v of p.variants) {
      const share = curved ? curve[v.sizeKey] : null;
      const plain = v.sold90 / Math.max(v.covered90 || 0, 30);
      const est = productRate != null && share != null ? productRate * share : null;
      if (v.buyable90 < RELIABLE) {
        if (est != null) { v.velocity = +est.toFixed(4); v.curveBased = true; }
        else { v.velocity = +plain.toFixed(4); v.plainRate = true; }
      } else if (v.buyable90 < 80) {
        /* on the shelf most of the window but not all: the raw rate can only be too high */
        const capped = Math.min(v.rawVelocity, Math.max(est ?? 0, plain));
        if (capped < v.rawVelocity) { v.velocity = +capped.toFixed(4); v.capped = true; }
      }
    }
  }

  /* per product: core variants, run-out, order-by, status, suggestion */
  for (const p of products) {
    const vs = p.variants;
    const sold90 = sum(vs, v => v.sold90), sold30 = sum(vs, v => v.sold30), sold14 = sum(vs, v => v.sold14);
    const onHand = sum(vs, v => Math.max(0, v.onHand)), oversold = sum(vs, v => Math.max(0, -v.onHand));
    const incoming = sum(vs, v => v.incoming);
    const velocity = sum(vs, v => v.velocity);
    /* core = the variants that carry 80% of sales */
    const ranked = [...vs].sort((a, b) => b.sold90 - a.sold90);
    let acc = 0;
    const coreIds = new Set();
    if (sold90 > 0) for (const v of ranked) { if (acc >= sold90 * num('core_share', 0.8) && coreIds.size) break; coreIds.add(v.id); acc += v.sold90; }
    else vs.forEach(v => coreIds.add(v.id));
    for (const v of vs) {
      v.isCore = coreIds.has(v.id);
      const eff = Math.max(0, v.onHand);
      v.runOutDays = v.velocity > 0.001 ? Math.round(eff / v.velocity) : null;
      v.runOutDate = v.runOutDays != null ? addDays(today, v.runOutDays) : null;
      if (v.incoming && v.incomingLands) {
        if (v.runOutDate == null || v.incomingLands <= v.runOutDate) v.gapDays = 0;
        else v.gapDays = daysBetween(v.runOutDate, v.incomingLands);
      } else if (v.incoming) v.gapDays = null; // landing date unknown: neither a gap nor cover
      v.suggested = (forecastable(p.lifecycle) && p.leadDays != null && v.velocity > 0.001)
        ? Math.max(0, Math.ceil(v.velocity * (COVER + p.leadDays) - eff - v.incoming)) : 0;
    }
    const core = vs.filter(v => v.isCore);
    /* run-out follows the core sizes still on the shelf; empty ones are the size gap */
    const coreWithVel = core.filter(v => v.velocity > 0.001 && v.onHand > 0);
    const earliest = coreWithVel.length ? coreWithVel.reduce((m, v) => (v.runOutDays < m.runOutDays ? v : m)) : null;
    const runOutDays = earliest ? earliest.runOutDays : (core.some(v => v.velocity > 0.001) ? 0 : null);
    const runOutDate = runOutDays != null ? addDays(today, runOutDays) : null;
    const orderByDate = runOutDate && p.leadDays != null ? addDays(runOutDate, -p.leadDays) : null;
    const orderByDays = orderByDate ? daysBetween(today, orderByDate) : null;
    const cycle = p.factoryId ? factories[p.factoryId]?.order_cycle_days || 30 : 30;
    /* "Out" means the sizes that carry at least half of the product's sales are at
       zero. One empty size on a full shelf is a size gap, reported as a note. */
    const zeroCore = core.filter(v => v.onHand <= 0 && v.velocity > 0.001);
    const coreOut = zeroCore.length > 0 && (sold90 === 0 || sum(zeroCore, v => v.sold90) >= sold90 * num('out_share', 0.5));
    const incomingCoversGap = core.every(v => !v.incoming || v.gapDays === 0 || v.gapDays == null);
    const ageDays = Math.max(...vs.map(v => v.ageDays ?? 9999)); // no createdAt in the feed means old, not new
    const thin = historyDays < num('thin_days', 45) || ageDays < num('thin_days', 45);

    let status;
    if (p.lifecycle === 'discontinued') status = 'off';
    else if (p.lifecycle === 'winding_down') status = 'sunset';
    else if (p.lifecycle === 'drop') status = coreOut || onHand === 0 ? 'drop_done' : 'drop';
    else if (!p.lineId) status = 'unsorted';
    else if (p.leadDays == null) status = 'nofactory';
    else if (velocity <= 0.001) status = onHand > 0 ? 'nosales' : 'dormant';
    else if (incoming && !coreOut && incomingCoversGap) status = 'covered';
    else if (incoming && (coreOut || !incomingCoversGap)) status = 'gap';
    else if (coreOut) status = 'out';
    else if (orderByDays == null) status = 'ok';
    else if (orderByDays <= 0) status = 'order';
    else if (orderByDays <= cycle) status = 'order';
    else if (orderByDays <= cycle + WATCH) status = 'soon';
    else status = 'ok';
    const overdue = status === 'order' && orderByDays != null && orderByDays < 0;
    const suggested = sum(vs, v => v.suggested);
    const suggestedLines = vs.filter(v => v.suggested > 0).map(v => ({ variantId: v.id, sku: v.sku, axis: v.axis, qty: v.suggested }));
    const atCost = p.cost != null ? suggested * p.cost : null;
    /* lost sales inside the lead time for the core variants */
    let lostUnits = 0;
    if (p.leadDays != null && forecastable(p.lifecycle)) for (const v of core) {
      if (v.velocity <= 0.001) continue;
      const landsIn = v.incomingLands ? Math.max(0, daysBetween(today, v.incomingLands)) : (Math.max(0, orderByDays ?? 0) + p.leadDays);
      const gap = Math.max(0, landsIn - (v.runOutDays ?? 0));
      lostUnits += gap * v.velocity;
    }
    const sizeGap = status === 'out' ? [] : vs.filter(v => v.onHand <= 0 && v.velocity > 0.001 && !(v.incoming && v.gapDays === 0)).map(v => v.axis || v.title || v.sku);
    const deadVariants = vs.filter(v => v.onHand > 0 && v.sold90 === 0 && (v.ageDays == null || v.ageDays >= num('dead_days', 90)));
    Object.assign(p, {
      sold90, sold30, sold14, onHand, oversold, incoming, velocity: +velocity.toFixed(4), perWeek: r1(velocity * 7),
      trend: trendOf(sold14, sold30, sold90), thin, ageDays,
      runOutDays, runOutDate, orderByDate, orderByDays, overdue, status, cycleDays: cycle,
      suggested, suggestedLines, atCost, moqMet: p.moq ? suggested >= p.moq : null,
      lostUnits: Math.round(lostUnits), revenueAtRisk: p.price != null ? Math.round(lostUnits * p.price) : null,
      sizeGap, coreCount: core.length,
      deadUnits: sum(deadVariants, v => v.onHand), deadCost: p.cost != null ? sum(deadVariants, v => v.onHand * (v.cost ?? p.cost)) : null, deadRetail: p.price != null ? sum(deadVariants, v => v.onHand * (v.price ?? p.price)) : null,
      weeksOfCover: velocity > 0.001 ? Math.round(onHand / (velocity * 7)) : null,
      incomingLands: vs.map(v => v.incomingLands).filter(Boolean).sort()[0] || null,
    });
  }

  /* lines: rollups, ranking, cut band, plan */
  const lineOut = Object.values(lines).map(line => {
    const ps = products.filter(p => p.lineId === line.id && p.lifecycle !== 'discontinued');
    const sold90 = sum(ps, p => p.sold90), sold30 = sum(ps, p => p.sold30), onHand = sum(ps, p => p.onHand), vel = sum(ps, p => p.velocity);
    const rankable = ps.filter(p => p.lifecycle !== 'drop').sort((a, b) => b.sold90 - a.sold90 || a.title.localeCompare(b.title));
    /* A line is planned (ranked, cut zone, target, open slots) automatically once it
       carries six or more designs; nobody has to switch it on. Settings can still
       override the target and the cut rule, or set the cut rule to 0 for manual. */
    const autoPlanned = rankable.length >= num('plan_min_designs', 6);
    const cutRule = line.cut_rule_pct != null ? line.cut_rule_pct : (autoPlanned ? num('cut_rule_default', 25) : null);
    const targetDesigns = line.target_designs != null ? line.target_designs : (autoPlanned ? rankable.length : null);
    const cutN = cutRule ? Math.floor(rankable.filter(p => (p.ageDays || 0) >= 60).length * cutRule / 100) : 0;
    const bandIds = new Set(cutN ? rankable.filter(p => (p.ageDays || 0) >= 60).slice(-cutN).map(p => p.id) : []);
    const decideIds = new Set(cutN ? rankable.filter(p => (p.ageDays || 0) >= 60 && !bandIds.has(p.id)).slice(-2).map(p => p.id) : []);
    const plan = rankable.map((p, i) => {
      const band = bandIds.has(p.id), near = decideIds.has(p.id);
      const state = p.decision === 'keep' ? 'keep' : p.decision === 'cut' ? 'cut' : p.lifecycle === 'winding_down' ? 'cut' : band ? 'cut' : near ? 'decide' : 'keep';
      return { productId: p.id, rank: i + 1, band, near, state, decided: !!p.decision };
    });
    const keep = plan.filter(x => x.state === 'keep').length, decide = plan.filter(x => x.state === 'decide').length, cut = plan.filter(x => x.state === 'cut').length;
    const target = targetDesigns || null;
    const openSlots = target ? Math.max(0, target - keep - decide) : 0;
    const dead = ps.reduce((a, p) => ({ units: a.units + p.deadUnits, cost: a.cost + (p.deadCost || 0), retail: a.retail + (p.deadRetail || 0) }), { units: 0, cost: 0, retail: 0 });
    return {
      id: line.id, name: line.name, categoryId: line.category_id, categoryName: categories[line.category_id]?.name || null,
      axis: line.variant_axis, factoryId: line.factory_id, factoryName: line.factory_id ? factories[line.factory_id]?.name : null,
      target, cutRulePct: cutRule || null, planned: !!(target || cutRule), moq: line.moq || null,
      designs: ps.length, sold90, sold30, onHand, perWeek: r1(vel * 7),
      sellThrough: sold90 + onHand ? Math.round(100 * sold90 / (sold90 + onHand)) : null,
      weeksOfCover: vel > 0.001 ? Math.round(onHand / (vel * 7)) : null,
      dead, cutCandidates: plan.filter(x => x.band && !x.decided).length,
      sizeCurve: lineCurves[line.id]?.used || {}, sizeCurveLearned: lineCurves[line.id]?.learned || {}, sizeCurveSample: lineCurves[line.id]?.sample || 0,
      plan, keep, decide, cut, openSlots,
      toOrder: ps.filter(p => p.status === 'order' || p.status === 'out').length,
      revenueAtRisk: sum(ps, p => p.revenueAtRisk || 0),
    };
  });

  /* Where a design physically is, taken from the orders Supply already has.
     A slot only reaches this once its Shopify product exists and is attached. */
  const MADE = { draft: 'On a draft order', sent: 'In production', confirmed: 'In production', production: 'In production', shipped: 'In transit', partial: 'Part landed', landed: 'Landed' };
  const RANK = { draft: 0, sent: 1, confirmed: 2, production: 3, shipped: 4, partial: 5, landed: 6 };
  const orderOfProduct = {};
  for (const o of (db.orders || [])) {
    if (o.status === 'cancelled') continue;
    for (const l of (db.orderLines || []).filter(l => l.order_id === o.id)) {
      const cur = orderOfProduct[l.product_id];
      /* the one still moving beats the one already landed; otherwise the further along */
      const better = !cur || (cur.status === 'landed' && o.status !== 'landed') || (cur.status !== 'landed' && o.status !== 'landed' && RANK[o.status] > RANK[cur.status]);
      if (better) orderOfProduct[l.product_id] = o;
    }
  }

  /* slots with derived dates (slotDates below: the Asana hand-off uses the same one) */
  const slots = (db.slots || []).map(sl => {
    const d = slotDates(sl, db);
    const late = {
      brief: sl.status === 'needs_brief' && d.briefDue < today,
      techPack: ['needs_brief', 'in_design', 'tech_pack'].includes(sl.status) && d.techPackDue < today,
      sample: ['needs_brief', 'in_design', 'tech_pack'].includes(sl.status) && d.sampleDue < today,
      order: !['ordered', 'live'].includes(sl.status) && d.orderBy < today,
    };
    const o = sl.product_id ? orderOfProduct[sl.product_id] : null;
    const made = o ? { orderId: o.id, status: o.status, label: MADE[o.status] || o.status, expected_at: o.expected_at || null } : null;
    const sample = sl.sample_in_hand_at ? { state: 'in hand', label: `Sample in hand ${fmtDate(sl.sample_in_hand_at)}`, on: sl.sample_in_hand_at }
      : sl.sample_expected_at ? { state: 'coming', label: `Sample due ${fmtDate(sl.sample_expected_at)}`, on: sl.sample_expected_at, late: sl.sample_expected_at < today }
      : sl.sample_requested_at ? { state: 'requested', label: `Sample asked for ${fmtDate(sl.sample_requested_at)}`, on: sl.sample_requested_at } : null;
    /* what this design owes next, which is the only date a person needs to see */
    const NEXT = [
      ['needs_brief', 'Brief', d.briefDue], ['in_design', 'Tech pack', d.techPackDue], ['tech_pack', 'Tech pack', d.techPackDue],
      ['sampling', 'Sample approved', d.sampleDue], ['approved', 'Order placed', d.orderBy], ['ordered', 'Stock lands', d.lands], ['live', 'On the site', d.onSite],
    ].find(([k]) => k === sl.status);
    const next = NEXT ? { what: NEXT[1], on: NEXT[2], days: daysBetween(today, NEXT[2]), late: NEXT[2] < today } : null;
    return { ...sl, lineName: d.line?.name || null, factoryId: d.factory?.id || null, collectionName: d.collection?.name || sl.season || null, dropAt: d.onSite, dates: d.dates, next, made, sample, late: Object.values(late).some(Boolean), lateParts: late };
  });

  /* collections, with what is in them */
  const collectionsOut = (db.collections || []).map(c => {
    const mine = slots.filter(sl => sl.collection_id === c.id);
    const lineNames = [...new Set(mine.map(sl => sl.lineName).filter(Boolean))];
    return {
      ...c, designs: mine.length, lines: lineNames, late: mine.filter(sl => sl.late).length,
      byStatus: countBy(mine, sl => sl.status), withTask: mine.filter(sl => sl.asana_task).length,
      done: mine.filter(sl => sl.status === 'live').length,
      orderBy: mine.length ? mine.map(sl => sl.dates.orderBy).sort()[0] : null,
    };
  }).sort((a, b) => (a.drop_at < b.drop_at ? -1 : 1));

  /* orders enriched */
  const productById = Object.fromEntries(products.map(p => [p.id, p]));
  const orders = (db.orders || []).map(o => {
    const ls = (db.orderLines || []).filter(l => l.order_id === o.id).map(l => {
      const p = productById[l.product_id]; const v = p?.variants.find(v => v.id === l.variant_id);
      return { ...l, productTitle: p?.title || l.product_id, sku: v?.sku || '', axis: v?.axis || '', onHand: v?.onHand ?? null, unitCost: l.unit_cost ?? v?.cost ?? null };
    });
    const units = sum(ls, l => l.qty), received = sum(ls, l => l.received), atCost = sum(ls, l => (l.unitCost || 0) * l.qty);
    const productTitles = [...new Set(ls.map(l => l.productTitle))];
    const f = o.factory_id ? factories[o.factory_id] : null;
    const prodEnd = o.sent_at && f ? addDays(o.sent_at, f.production_days) : null;
    /* Landing detection: sales only push stock down, so a rise since the order was
       sent of at least half what is still outstanding can only be the shipment. */
    let jump = 0;
    if (OPEN.has(o.status) && o.sent_at) {
      const days = Object.keys(history.inventory || {}).filter(d => d >= o.sent_at).sort();
      for (const l of ls) {
        const left = Math.max(0, l.qty - l.received);
        if (!left || l.onHand == null) continue;
        let minSince = l.onHand;
        for (const d of days) { const v = history.inventory[d]?.[l.variant_id]; if (v != null && v < minSince) minSince = v; }
        jump += Math.max(0, l.onHand - minSince);
      }
    }
    const outstanding = Math.max(0, units - received);
    const likelyLanded = outstanding > 0 && jump >= Math.max(1, Math.ceil(outstanding * 0.5));
    return { ...o, lines: ls, units, received, atCost, productTitles, factoryName: f?.name || null, productionEnd: prodEnd, daysToLanding: o.expected_at ? daysBetween(today, o.expected_at) : null, overdue: OPEN.has(o.status) && o.expected_at && o.expected_at < today, likelyLanded, jumpUnits: jump };
  });

  /* factories: next order window */
  const factoryOut = Object.values(factories).map(f => {
    const sent = orders.filter(o => o.factory_id === f.id && o.sent_at).map(o => o.sent_at).sort();
    const last = sent[sent.length - 1] || null;
    const cycle = f.order_cycle_days || 30;
    let start = last ? addDays(last, cycle) : today;
    while (start < today) start = addDays(start, cycle);
    return { ...f, lastSent: last, nextWindow: { from: start, to: addDays(start, 14) }, products: products.filter(p => p.factoryId === f.id).length };
  });

  /* headline + decisions */
  const live = products.filter(p => !['off'].includes(p.status));
  const toOrder = live.filter(p => p.status === 'order' || p.status === 'out');
  const overdueN = toOrder.filter(p => p.overdue || p.status === 'out').length;
  const landingSoon = orders.filter(o => OPEN.has(o.status)).sort((a, b) => (a.expected_at || '9') < (b.expected_at || '9') ? -1 : 1);
  const dead = live.reduce((a, p) => ({ units: a.units + p.deadUnits, cost: a.cost + (p.deadCost || 0), retail: a.retail + (p.deadRetail || 0) }), { units: 0, cost: 0, retail: 0 });
  const revenueAtRisk = sum(live, p => p.revenueAtRisk || 0);
  const orderByLatest = toOrder.map(p => p.orderByDate).filter(Boolean).sort().pop() || null;

  const decisionsOut = [];
  for (const p of toOrder.sort((a, b) => (a.orderByDate || '0') < (b.orderByDate || '0') ? -1 : 1).slice(0, 4)) {
    const due = p.orderByDate ? fmtDate(p.orderByDate) : null;
    const lands = p.leadDays != null ? fmtDate(addDays(today, p.leadDays)) : null;
    decisionsOut.push({
      kind: 'bad', productId: p.id, screen: 'reorder',
      title: p.status === 'out' ? `${p.title} is out. Order now, or mark it as a drop.` : p.overdue ? `Order ${p.title} now. It was due ${due}.` : `Order ${p.title} by ${due}.`,
      body: [
        `${p.onHand} on hand, selling ${p.perWeek} a week, ${p.leadDays} day lead time`,
        p.runOutDate && p.status !== 'out' ? `Runs out ${fmtDate(p.runOutDate)}${lands ? `; an order sent today lands ${lands}` : ''}` : lands ? `An order sent today lands ${lands}` : null,
        p.suggested ? `Suggested ${p.suggested} units${p.atCost != null ? `, about ${money(p.atCost)} at cost` : ''}${p.moqMet === false ? `, under the minimum of ${p.moq}` : ''}` : null,
        p.sizeGap.length ? `Size gap: ${p.sizeGap.join(', ')}` : null,
        p.status === 'out' ? 'If this was a one-off, set its lifecycle to limited drop in Settings and it stops asking' : null,
      ].filter(Boolean).join('. ') + '.',
    });
  }
  for (const o of orders.filter(o => o.likelyLanded)) {
    decisionsOut.push({ kind: 'good', orderId: o.id, screen: 'orders', title: `${o.id} looks landed. Confirm it.`, body: `Stock on ${o.productTitles[0] || 'its products'} rose by ${o.jumpUnits} units since the order was sent on ${fmtDate(o.sent_at)}. Confirm the count in Orders and it stops counting as incoming.` });
  }
  for (const o of landingSoon.filter(o => !o.likelyLanded && o.daysToLanding != null && o.daysToLanding <= 21).slice(0, 2)) {
    decisionsOut.push({ kind: 'warn', orderId: o.id, screen: 'orders', title: `${o.productTitles[0] || o.id} order lands ${fmtDate(o.expected_at)}.`, body: `${o.units} units from ${o.factoryName || 'the factory'}, ${o.status}${o.received ? `, ${o.received} received so far` : ''}.` });
  }
  for (const l of lineOut.filter(l => l.cutCandidates)) {
    decisionsOut.push({ kind: 'brand', lineId: l.id, screen: 'lineup', title: `${l.cutCandidates} ${l.name.toLowerCase()} sit in the cut band this quarter.`, body: `Bottom ${l.cutRulePct}% of the line by 90-day sales. Decide keep or cut before the next ${l.factoryName || 'factory'} order.` });
  }
  for (const sl of slots.filter(s => s.late)) decisionsOut.push({ kind: 'bad', slotId: sl.id, screen: 'lineup', title: `${sl.name} is late.`, body: `${sl.lateParts.brief ? `Brief was due ${fmtDate(sl.dates.briefDue)}. ` : ''}${sl.lateParts.techPack && !sl.lateParts.sample ? `Tech pack was due ${fmtDate(sl.dates.techPackDue)}. ` : ''}${sl.lateParts.sample ? `Sample was due ${fmtDate(sl.dates.sampleDue)}. ` : ''}${sl.lateParts.order ? `Order date ${fmtDate(sl.dates.orderBy)} has passed.` : ''}` });
  if (unsortedTypes.size) decisionsOut.push({ kind: 'unk', screen: 'settings', title: `${unsortedTypes.size} product type${unsortedTypes.size > 1 ? 's' : ''} not sorted into a line.`, body: `${[...unsortedTypes].join(', ')}. They cannot be forecast until they have a line.` });

  return {
    brand: store.id, brandName: store.name, tz, today, generatedAt: new Date().toISOString(), historyDays, historyStart: history.startDate, lastRun: raw.lastRun || null,
    settings: S,
    headline: { toOrder: toOrder.length, overdue: overdueN, orderByLatest, onTheWay: landingSoon.length, nextLanding: landingSoon[0]?.expected_at || null, nextLandingUnits: landingSoon[0]?.units || null, revenueAtRisk, dead },
    decisions: decisionsOut.slice(0, 8),
    products: products.sort((a, b) => rank(a) - rank(b) || (a.orderByDays ?? 9e9) - (b.orderByDays ?? 9e9)),
    lines: lineOut, categories: Object.values(categories), factories: factoryOut, orders, slots, collections: collectionsOut,
    unsortedTypes: [...unsortedTypes],
    counts: countBy(products, p => p.status),
  };
}

const STATUS_RANK = { out: 0, order: 1, gap: 2, soon: 3, covered: 4, ok: 5, unsorted: 6, nofactory: 6.5, nosales: 7, drop: 8, drop_done: 9, sunset: 10, dormant: 11, off: 12 };
const rank = p => STATUS_RANK[p.status] ?? 20;
function trendOf(s14, s30, s90) {
  const r14 = s14 / 14, r90 = s90 / 90;
  if (r90 < 0.02) return r14 > 0 ? 'new' : 'flat';
  const ratio = r14 / r90;
  return ratio >= 2 ? 'spiking' : ratio >= 1.35 ? 'rising' : ratio <= 0.65 ? 'falling' : 'steady';
}
function countBy(arr, f) { const o = {}; for (const x of arr) { const k = f(x); o[k] = (o[k] || 0) + 1; } return o; }
function median(xs) { if (!xs.length) return null; const s = [...xs].sort((a, b) => a - b); return s[Math.floor(s.length / 2)]; }
function normalize(o) { const t = sum(Object.values(o).map(Number)); return t ? Object.fromEntries(Object.entries(o).map(([k, v]) => [k, Number(v) / t])) : {}; }
function safeJson(s, fb) { if (s == null) return fb; if (typeof s === 'object') return s; try { return JSON.parse(s); } catch { return fb; } }
export function fmtDate(ymd) { if (!ymd) return ''; const d = new Date(`${ymd}T12:00:00Z`); return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' }); }
export function money(n) { if (n == null) return ''; const a = Math.abs(n); return (n < 0 ? '-' : '') + '$' + (a >= 10000 ? Math.round(a / 1000) + 'k' : a >= 1000 ? (a / 1000).toFixed(1) + 'k' : Math.round(a).toString()); }

/* Stock for the Strategist (2026-10-08, Supply in Locus).
 *
 * The Supply worker (mobius-supply) owns stock, factory orders and drops; its brain computes every
 * status and date. This file reads it over the SUPPLY service binding with the Supply engine's own
 * admin token (secret SUPPLY_TOKEN: the engine accepts the Mobius Google session or that token, NOT
 * this worker's ADMIN_TOKEN), so Slack questions and scheduled runs work without a person's session.
 *
 *   stockView(env, acct, what)   the Strategist's `stock` view: summary | products | orders | drops
 *   handleSupplyProxy(...)       /api/supply/* for the Strategist's actions (log an order, mark a
 *                                product, add a design): the same Supply routes the Locus screens call
 *
 * The ad side copies profit/worker/src/hub.js stockAds (shared D1): which products each Meta ad sells,
 * from Triple Whale orders, never from ad names. Keep the two in step. The judgement (ease off, safe to
 * scale, push to clear) copies profit/supply.js judge(): keep those in step too. */

const add = (ymd, n) => { const d = new Date(ymd + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const between = (a, b) => Math.round((Date.parse(b + 'T12:00:00Z') - Date.parse(a + 'T12:00:00Z')) / 864e5);
const num = v => (v == null || !isFinite(+v) ? 0 : +v);
const r1 = n => n == null ? null : Math.round(n * 10) / 10;

export async function supplyFetch(env, path, { method = 'GET', body, brand = 'lucky', actor = 'the Strategist' } = {}) {
  if (!env.SUPPLY || !env.SUPPLY_TOKEN) throw new Error('Stock is not connected to the Strategist yet (the SUPPLY binding or the SUPPLY_TOKEN secret is missing on account-health).');
  const res = await env.SUPPLY.fetch(new Request(`https://mobius-supply.internal${path}${path.includes('?') ? '&' : '?'}brand=${encodeURIComponent(brand)}`, {
    method, headers: { 'Authorization': `Bearer ${env.SUPPLY_TOKEN}`, 'Content-Type': 'application/json', 'X-Actor': actor }, body: body ? JSON.stringify(body) : undefined }));
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(j.error || `Stock answered ${res.status}`);
  return j;
}
export async function supplyBrandOf(env, act) {
  const r = await supplyFetch(env, '/api/brands');
  return (r.brands || []).find(b => b.act_id === act && b.active) || null;
}

/** Products each Meta ad sells (30 days), from Triple Whale orders. Copy of hub.js stockAds. */
async function stockAds(env, act, today) {
  const from = add(today, -30);
  const [touch, spend] = await Promise.all([
    env.DB.prepare(`SELECT t.ad_id, o.products_json FROM tw_order_touch t JOIN tw_orders o ON o.act_id = t.act_id AND o.order_id = t.order_id
      WHERE t.act_id = ?1 AND t.model = 'lastPlatformClick' AND t.date >= ?2`).bind(act, from).all().then(r => r.results || []).catch(() => []),
    env.DB.prepare(`SELECT ad_id, SUM(spend) s30 FROM ad_daily WHERE act_id = ?1 AND date >= ?2 GROUP BY ad_id`).bind(act, from).all().then(r => r.results || []).catch(() => []),
  ]);
  const ordersOf = new Map();
  for (const t of touch) { let ps = []; try { ps = [...new Set(JSON.parse(t.products_json || '[]').map(String))]; } catch {} if (!ps.length) continue; if (!ordersOf.has(t.ad_id)) ordersOf.set(t.ad_id, []); ordersOf.get(t.ad_id).push(ps); }
  const products = {}; let total = 0, mapped = 0;
  for (const s of spend) {
    const s30 = num(s.s30); total += s30; const ords = ordersOf.get(s.ad_id) || [];
    if (ords.length) mapped += s30;
    for (const ps of ords) for (const p of ps) { const x = products[p] || (products[p] = { spend: 0, orders: 0 }); x.spend += s30 / ords.length / ps.length; x.orders += 1; }
  }
  return { products, total: Math.round(total), mapped: Math.round(mapped) };
}

function season(today) {
  const y = +today.slice(0, 4);
  const bf = yr => { const d = new Date(Date.UTC(yr, 10, 1)); const thu = (4 - d.getUTCDay() + 7) % 7; return add(new Date(Date.UTC(yr, 10, 1 + thu + 21)).toISOString().slice(0, 10), 1); };
  let b = bf(y); if (add(b, 3) < today) b = bf(y + 1);
  return { black_friday: b, cyber_monday: add(b, 3), cmd: between(today, add(b, 3)) };
}
function judge(st, ads) {
  const SE = season(st.today);
  const heavy = p => (p.weeksOfCover != null && p.weeksOfCover > 52) || (p.velocity <= 0.001 && p.onHand >= 20);
  const call = p => {
    if (['off', 'drop_done'].includes(p.status)) return 'not selling';
    if (p.velocity <= 0.001) return heavy(p) ? 'push to clear' : 'not selling';
    const d = p.status === 'out' ? 0 : (p.runOutDays ?? 0), L = p.incomingLands ? between(st.today, p.incomingLands) : null, cover = L != null && L <= d;
    if (p.status === 'out' || (d < 30 && !cover) || (d <= SE.cmd && !cover)) return 'ease off';
    if (heavy(p)) return 'push to clear';
    if (d >= 90 || cover) return 'safe to scale';
    return 'watch';
  };
  return { SE, call, spend: p => r1((ads.products[p.id] || {}).spend || 0) };
}
const LABEL = { out: 'out', order: 'order now', gap: 'runs out before its order lands', soon: 'coming up', covered: 'on the way', ok: 'fine', nosales: 'not selling', dormant: 'empty, not selling', unsorted: 'not in a group', nofactory: 'no factory', drop: 'limited drop', drop_done: 'drop sold out', sunset: 'winding down', off: 'discontinued' };

export async function stockView(env, acct, what = 'summary') {
  const b = await supplyBrandOf(env, acct.act_id);
  if (!b) return { connected: false, note: `${acct.name} has no stock feed. Stock reads from Shopify once the brand installs the Mobius Digital Shopify app (Lucky Golf is connected). Say so; do not guess stock from orders.` };
  const st = await supplyFetch(env, '/api/state', { brand: b.id });
  const ads = await stockAds(env, acct.act_id, st.today);
  const J = judge(st, ads);
  const prod = p => ({ id: p.id, product: p.title, group: p.lineName || null, ads_call: J.call(p), status: p.overdue ? 'order date passed' : (LABEL[p.status] || p.status), on_hand: p.onHand, per_week: p.perWeek,
    runs_out: p.status === 'out' ? 'now' : p.runOutDate, first_size_out: (p.variants || []).filter(v => v.isCore && v.velocity > 0.001).sort((x, y) => (x.runOutDays ?? 9e9) - (y.runOutDays ?? 9e9))[0]?.axis || null,
    on_the_way: p.incoming || 0, lands: p.incomingLands || null, ...(b.buys ? { order_by: p.orderByDate, suggested_units: p.suggested, at_cost: p.atCost != null ? Math.round(p.atCost) : null, minimum: p.moq || null, factory: p.factoryName || null } : {}),
    weeks_of_stock: p.weeksOfCover, sold_90d: p.sold90, ad_spend_30d: J.spend(p), kind: p.lifecycle });
  const live = st.products.filter(p => p.status !== 'off' && (p.velocity > 0.001 || p.onHand > 0));
  const base = { brand: acct.name, today: st.today, black_friday: J.SE.black_friday, cyber_monday: J.SE.cyber_monday, buying_on: !!b.buys, drops_on: !!b.makes,
    ad_spend_30d: ads.total, ad_spend_tied_to_products: ads.mapped, open: 'https://tools.go-mobius-digital.com/profit/?open=stock&act=' + acct.act_id };
  if (what === 'products') return { ...base, products: live.map(prod) };
  if (what === 'orders') return { ...base, factory_orders: st.orders.filter(o => o.status !== 'cancelled').map(o => ({ id: o.id, factory: o.factoryName, stage: o.status === 'sent' || o.status === 'confirmed' ? 'placed' : o.status, placed: o.sent_at, lands: o.expected_at, days_to_landing: o.daysToLanding, late: !!o.overdue, looks_landed: !!o.likelyLanded, units: o.units, received: o.received, at_cost: Math.round(o.atCost || 0), products: o.productTitles })),
    factories: st.factories.map(f => ({ name: f.name, make_days: f.production_days, ship_days: f.shipping_days, minimum: f.moq_default, closed: f.closures })) };
  if (what === 'drops') {
    if (!b.makes) return { ...base, note: 'Drops is off for this brand.' };
    return { ...base, drops: (st.collections || []).map(c => ({ id: c.id, name: c.name, on_site: c.drop_at, designs: c.designs, late: c.late, first_order_by: c.orderBy })),
      designs: st.slots.filter(s => s.status !== 'live').map(s => ({ id: s.id, name: s.name, group: s.lineName, drop: s.collectionName, stage: s.status, next: s.next ? `${s.next.what} ${s.next.late ? 'was due' : 'due'} ${s.next.on}` : null, late: !!s.late, dates: s.dates })),
      keep_or_cut: st.lines.filter(l => l.target != null && l.planned).map(l => ({ group: l.name, target: l.target, keep: l.keep, your_call: l.decide, cut: l.cut, new_to_make: l.weeksOfCover > 52 ? 0 : l.openSlots, weeks_of_stock: l.weeksOfCover, cut_zone: l.plan.filter(x => x.state === 'cut').map(x => (st.products.find(p => p.id === x.productId) || {}).title) })),
      started_in_asana: (st.asanaLoose || []).map(t => t.name) };
  }
  const by = k => live.filter(p => J.call(p) === k).sort((x, y) => J.spend(y) - J.spend(x) || (x.runOutDays ?? 0) - (y.runOutDays ?? 0));
  const ease = by('ease off'), scale = by('safe to scale').sort((x, y) => y.sold90 - x.sold90), clear = by('push to clear');
  return { ...base, headline: st.headline,
    ease_off: ease.map(prod), safe_to_scale: scale.slice(0, 10).map(prod), push_to_clear: clear.slice(0, 10).map(prod),
    ad_spend_on_products_running_low_30d: Math.round(ease.reduce((a, p) => a + J.spend(p), 0)),
    ...(b.buys ? { to_order: st.products.filter(p => ['out', 'order', 'gap'].includes(p.status)).map(prod), on_the_way: st.orders.filter(o => ['sent', 'confirmed', 'production', 'shipped', 'partial'].includes(o.status)).map(o => ({ id: o.id, factory: o.factoryName, lands: o.expected_at, units: o.units, products: o.productTitles })) } : {}) };
}

/** /api/supply/<route>?brand=: the Strategist's actions write through here, behind this worker's auth. */
export async function handleSupplyProxy(request, env, path, url, json, actor) {
  const rest = path.slice('/api/supply'.length);   // '/orders', '/orders/PO-0001', '/products/123', '/slots', '/collections'
  if (!/^\/(orders|orders\/[\w-]+|slots|collections|products\/[\w-]+)$/.test(rest) || !['POST', 'PUT'].includes(request.method)) return json({ error: 'not a stock route the Strategist can use' }, 404);
  const body = await request.json().catch(() => ({}));
  const brand = (url.searchParams.get('brand') || 'lucky').replace(/[^a-z0-9-]/g, ''), who = `${actor || 'someone'} (via the Strategist)`;
  try {
    /* add_design asks for N designs in one approval: one POST per design, numbered on from the last. */
    const n = rest === '/slots' && request.method === 'POST' ? Math.min(10, Math.max(1, Math.round(+body._count || 1))) : 1;
    delete body._count;
    if (n === 1) return json(await supplyFetch(env, '/api' + rest, { method: request.method, body, brand, actor: who }));
    const m = /^(.*?)(\d+)$/.exec(body.name || ''); const made = [];
    for (let k = 0; k < n; k++) made.push(await supplyFetch(env, '/api/slots', { method: 'POST', body: { ...body, name: m ? `${m[1]}${+m[2] + k}` : `${body.name} ${k + 1}` }, brand, actor: who }));
    return json({ ok: true, made: made.length });
  } catch (e) { return json({ error: e.message }, 502); }
}

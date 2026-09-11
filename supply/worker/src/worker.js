/**
 * Mobius Supply worker: the buying brain and the record of decisions.
 *
 * Reads the raw Shopify feed from the Restock worker (service binding RESTOCK),
 * merges it with this brand's decisions in D1, and serves one /api/state the
 * app renders every screen from. Mutations write D1 (and, for MOQ, write
 * through to Shopify via Restock). See ../wrangler.toml for the why.
 */
import { computeSupply, addDays, localDate } from './brain.js';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, PUT, POST, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type',
};
const json = (obj, status = 200) => new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json', ...CORS } });
const bad = (msg, status = 400) => json({ error: msg }, status);

/* ---------- the Shopify side, through Restock ---------- */
async function restock(env, request, path, init = {}) {
  const auth = request.headers.get('Authorization') || '';
  const req = new Request(`https://mobius-restock.internal${path}`, {
    method: init.method || 'GET',
    headers: { 'Authorization': auth, 'Content-Type': 'application/json' },
    body: init.body ? JSON.stringify(init.body) : undefined,
  });
  const res = await env.RESTOCK.fetch(req);
  const data = await res.json().catch(() => ({}));
  if (res.status === 401) throw Object.assign(new Error('unauthorized'), { status: 401 });
  if (!res.ok) throw Object.assign(new Error(data.error || `restock ${res.status}`), { status: res.status });
  return data;
}

/* ---------- D1 ---------- */
async function loadDb(env, brand) {
  const q = (sql, ...args) => env.DB.prepare(sql).bind(...args);
  const [brands, categories, lines, factories, typeMap, products, orders, orderLines, slots, settings] = (await env.DB.batch([
    q(`SELECT * FROM brands WHERE id = ?1`, brand),
    q(`SELECT * FROM categories WHERE brand_id = ?1 ORDER BY sort, name`, brand),
    q(`SELECT * FROM lines WHERE brand_id = ?1 ORDER BY sort, name`, brand),
    q(`SELECT * FROM factories WHERE brand_id = ?1 ORDER BY name`, brand),
    q(`SELECT * FROM type_map WHERE brand_id = ?1`, brand),
    q(`SELECT * FROM products WHERE brand_id = ?1`, brand),
    q(`SELECT * FROM orders WHERE brand_id = ?1 ORDER BY created_at DESC`, brand),
    q(`SELECT ol.* FROM order_lines ol JOIN orders o ON o.id = ol.order_id WHERE o.brand_id = ?1`, brand),
    q(`SELECT * FROM slots WHERE brand_id = ?1 ORDER BY on_site_at, name`, brand),
    q(`SELECT key, value FROM settings WHERE brand_id = ?1`, brand),
  ])).map(r => r.results || []);
  const s = {};
  for (const row of settings) { try { s[row.key] = JSON.parse(row.value); } catch { s[row.key] = row.value; } }
  return { brand: brands[0] || null, categories, lines, factories, typeMap, products, orders, orderLines, slots, settings: s };
}

async function log(env, brand, actor, entity, entityId, action, detail) {
  await env.DB.prepare(`INSERT INTO changelog (brand_id, actor, entity, entity_id, action, detail) VALUES (?1, ?2, ?3, ?4, ?5, ?6)`)
    .bind(brand, actor || null, entity, entityId == null ? null : String(entityId), action, detail == null ? null : JSON.stringify(detail)).run();
}

const actorOf = request => request.headers.get('X-Actor') || null;
const str = (v, max = 200) => v == null ? null : String(v).slice(0, max);
const int = (v, lo = 0, hi = 1e9) => { const n = Math.floor(Number(v)); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : null; };
const ymd = v => /^\d{4}-\d{2}-\d{2}$/.test(v || '') ? v : null;
const slug = v => String(v || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);

/* ---------- first run: seed from the legacy Restock settings ---------- */
const CATEGORY_GUESS = [
  ['clubs', 'Clubs', /wedge|putter|hybrid|driver|iron|shaft|club|fairway|wood/i, 'loft_hand'],
  ['apparel', 'Apparel', /apparel|polo|hat|cap|shirt|hoodie|pant|short|beanie|quarter|crew|jacket|vest|sock/i, 'size'],
  ['accessories', 'Accessories', /grip|glove|tee|cover|towel|marker|tool|bag|accessor|belt|ball/i, 'none'],
];
function guessLine(type) {
  const t = String(type || '');
  if (/glove/i.test(t)) return { cat: 'accessories', line: 'Gloves', axis: 'hand_size' };
  if (/hat|cap|beanie/i.test(t)) return { cat: 'apparel', line: /beanie/i.test(t) ? 'Beanies' : 'Hats', axis: 'none' };
  if (/apparel|polo/i.test(t)) return { cat: 'apparel', line: 'Polos', axis: 'size' };
  if (/grip/i.test(t)) return { cat: 'accessories', line: 'Grips', axis: 'size' };
  if (/cover/i.test(t)) return { cat: 'accessories', line: 'Head covers', axis: 'none' };
  if (/tee/i.test(t)) return { cat: 'accessories', line: 'Tees', axis: 'none' };
  if (/wedge/i.test(t)) return { cat: 'clubs', line: 'Wedges', axis: 'loft_hand' };
  if (/putter/i.test(t)) return { cat: 'clubs', line: 'Putters', axis: 'hand' };
  if (/hybrid/i.test(t)) return { cat: 'clubs', line: 'Hybrids', axis: 'hand' };
  if (/driver/i.test(t)) return { cat: 'clubs', line: 'Drivers', axis: 'hand' };
  for (const [cat, , re, axis] of CATEGORY_GUESS) if (re.test(t)) return { cat, line: t.replace(/s$/, '') + 's', axis };
  return null;
}

async function seed(env, brand, raw, actor) {
  const store = raw.store, legacy = raw.settings || {};
  const stmts = [];
  const q = (sql, ...args) => stmts.push(env.DB.prepare(sql).bind(...args));
  q(`INSERT OR IGNORE INTO brands (id, name, shop_domain, tz, slack_channel) VALUES (?1, ?2, ?3, ?4, ?5)`, brand, store.name, store.domain, store.tz, legacy.stores?.[brand]?.channel || null);
  for (const [id, name] of [['clubs', 'Clubs'], ['apparel', 'Apparel'], ['accessories', 'Accessories']])
    q(`INSERT OR IGNORE INTO categories (id, brand_id, name, sort) VALUES (?1, ?2, ?3, ?4)`, `${brand}:${id}`, brand, name, id === 'clubs' ? 0 : id === 'apparel' ? 1 : 2);
  /* factories from the legacy lead-time profiles: clubs profile -> Club factory (everything else), apparel -> Apparel factory */
  const prof = Object.fromEntries((legacy.profiles || []).map(p => [p.id, p]));
  const club = prof.clubs || { productionDays: 60, shippingDays: 30 }, app = prof.apparel || prof.softgoods || { productionDays: 40, shippingDays: 20 };
  q(`INSERT OR IGNORE INTO factories (id, brand_id, name, production_days, shipping_days, order_cycle_days, moq_default, closures) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)`,
    `${brand}:club-factory`, brand, 'Club factory', club.productionDays, club.shippingDays, 90, 100, JSON.stringify([{ from: '2027-02-06', to: '2027-02-20', label: 'Chinese New Year' }]));
  q(`INSERT OR IGNORE INTO factories (id, brand_id, name, production_days, shipping_days, order_cycle_days, moq_default, closures) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)`,
    `${brand}:apparel-factory`, brand, 'Apparel factory', app.productionDays, app.shippingDays, 60, 100, JSON.stringify([{ from: '2027-02-06', to: '2027-02-20', label: 'Chinese New Year' }]));
  /* lines from the product types actually in the catalog */
  const types = [...new Set(raw.catalog.products.filter(p => p.variants.some(v => v.tracked)).map(p => p.type || ''))];
  const lineIds = {};
  let sort = 0;
  for (const t of types) {
    const g = guessLine(t);
    if (!g) continue;
    const id = `${brand}:${slug(g.line)}`;
    if (!lineIds[id]) {
      lineIds[id] = true;
      const factory = g.cat === 'apparel' ? `${brand}:apparel-factory` : `${brand}:club-factory`;
      const acc = prof.accessories;
      const leadOverride = g.cat === 'accessories' && acc ? acc.productionDays + acc.shippingDays : null;
      const target = g.line === 'Polos' ? 15 : g.line === 'Hats' ? 12 : null;
      const cut = g.cat === 'apparel' ? 25 : null;
      q(`INSERT OR IGNORE INTO lines (id, brand_id, category_id, name, variant_axis, factory_id, lead_override_days, moq, target_designs, cut_rule_pct, sort) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)`,
        id, brand, `${brand}:${g.cat}`, g.line, g.axis, factory, leadOverride, g.line === 'Gloves' ? 500 : g.line === 'Tees' ? 500 : g.line === 'Head covers' ? 200 : null, target, cut, sort++);
    }
    q(`INSERT OR IGNORE INTO type_map (brand_id, shop_type, line_id) VALUES (?1, ?2, ?3)`, brand, t, id);
  }
  /* muted variants in Restock were "I do not care about this row": the closest honest lifecycle is winding down at the product */
  const mutedProducts = new Set((legacy.muted || []).filter(m => m.startsWith('p')).map(m => m.slice(1)));
  for (const pid of mutedProducts) q(`INSERT OR IGNORE INTO products (brand_id, product_id, lifecycle) VALUES (?1, ?2, 'winding_down')`, brand, pid);
  for (const [k, v] of Object.entries({ buffer_days: legacy.bufferDays ?? 10, cover_days: legacy.targetCoverDays ?? 180, digest_hour: legacy.digestHourLocal ?? 6 }))
    q(`INSERT OR IGNORE INTO settings (brand_id, key, value) VALUES (?1, ?2, ?3)`, brand, k, JSON.stringify(v));
  for (let i = 0; i < stmts.length; i += 100) await env.DB.batch(stmts.slice(i, i + 100));
  await log(env, brand, actor, 'settings', null, 'seed', { types, mutedProducts: [...mutedProducts] });
}

/* ---------- Slack digest ---------- */
const DASHBOARD_URL = 'https://tools.go-mobius-digital.com/supply/';
const fmtD = ymd => ymd ? new Date(`${ymd}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' }) : '';
const money = n => n == null ? '' : '$' + (Math.abs(n) >= 10000 ? Math.round(n / 1000) + 'k' : Math.abs(n) >= 1000 ? (n / 1000).toFixed(1) + 'k' : Math.round(n));
function digestMessage(state) {
  const h = state.headline;
  const date = new Date(`${state.today}T12:00:00Z`).toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric', timeZone: 'UTC' });
  const color = h.overdue || h.toOrder ? '#D0342C' : h.onTheWay ? '#ECB22E' : '#2EB67D';
  const line1 = [`${h.toOrder} to order${h.overdue ? ` (${h.overdue} overdue)` : ''}`, `${h.onTheWay} on the way${h.nextLanding ? `, next lands ${fmtD(h.nextLanding)}` : ''}`, h.revenueAtRisk ? `${money(h.revenueAtRisk)} at risk` : null, h.dead?.cost ? `${money(h.dead.cost)} dead stock` : null].filter(Boolean).join(' · ');
  const icon = { bad: ':red_circle:', warn: ':large_yellow_circle:', good: ':large_green_circle:', brand: ':large_blue_circle:', unk: ':white_circle:' };
  const items = state.decisions.slice(0, 6).map(d => `${icon[d.kind] || ':white_circle:'}  *${d.title}*\n        ${d.body}`);
  const blocks = [
    { type: 'section', text: { type: 'mrkdwn', text: `:package:  *${state.brandName} · Supply* · ${date}` } },
    { type: 'section', text: { type: 'mrkdwn', text: line1 } },
    { type: 'divider' },
    { type: 'section', text: { type: 'mrkdwn', text: (items.length ? items.join('\n') : ':white_check_mark: Nothing needs a decision this week.').slice(0, 2900) } },
    { type: 'context', elements: [{ type: 'mrkdwn', text: `Order by = run-out minus lead time · suggested covers ${state.settings.cover_days} days after landing   ·   <${DASHBOARD_URL}|Open Supply>` }] },
  ];
  return { attachments: [{ color, fallback: `${state.brandName} Supply: ${line1}`, blocks }] };
}

/* ---------- routes ---------- */
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, '') || '/';
    if (request.method === 'OPTIONS') return new Response(null, { headers: CORS });
    if (path === '/health') return json({ ok: true });
    if (!path.startsWith('/api/')) return bad('not found', 404);
    const brand = (url.searchParams.get('brand') || 'lucky').replace(/[^a-z0-9-]/g, '');
    const actor = actorOf(request);
    const body = request.method === 'GET' ? null : await request.json().catch(() => ({}));

    try {
      /* Every request goes through Restock for auth + the raw feed (state) or a cheap auth probe (mutations). */
      if (path === '/api/state') {
        const raw = await restock(env, request, `/api/raw?store=${brand}`);
        if (!raw.catalog) return bad('no snapshot yet: run one from Settings', 404);
        let db = await loadDb(env, brand);
        if (!db.brand) { await seed(env, brand, raw, actor); db = await loadDb(env, brand); }
        const state = computeSupply(raw, db);
        return json({ ...state, db: { categories: db.categories, lines: db.lines, factories: db.factories, typeMap: db.typeMap, products: db.products, brand: db.brand }, shopTypes: [...new Set(raw.catalog.products.filter(p => p.variants.some(v => v.tracked)).map(p => p.type || ''))] });
      }

      /* The Slack digest, built from the same state the app shows. The Restock
         worker's hourly cron fetches this at the digest hour and posts it (it owns
         the Slack token); "Send now" in the app posts it through the same door. */
      if (path === '/api/digest') {
        const raw = await restock(env, request, `/api/raw?store=${brand}`);
        if (!raw.catalog) return bad('no snapshot yet', 404);
        let db = await loadDb(env, brand);
        if (!db.brand) { await seed(env, brand, raw, actor); db = await loadDb(env, brand); }
        const msg = digestMessage(computeSupply(raw, db));
        if (request.method === 'POST') return json(await restock(env, request, `/api/slack-post?store=${brand}`, { method: 'POST', body: msg }));
        return json(msg);
      }

      await restock(env, request, '/api/stores'); // auth gate for everything below

      if (path === '/api/settings' && request.method === 'PUT') {
        const stmts = [];
        for (const [k, v] of Object.entries(body || {})) {
          if (!/^[a-z_]{2,40}$/.test(k)) continue;
          stmts.push(env.DB.prepare(`INSERT INTO settings (brand_id, key, value) VALUES (?1, ?2, ?3) ON CONFLICT(brand_id, key) DO UPDATE SET value = excluded.value`).bind(brand, k, JSON.stringify(v)));
        }
        if (stmts.length) await env.DB.batch(stmts);
        await log(env, brand, actor, 'settings', null, 'update', body);
        return json({ ok: true });
      }

      if (path === '/api/brand' && request.method === 'PUT') {
        await env.DB.prepare(`UPDATE brands SET name = COALESCE(?2, name), accent = COALESCE(?3, accent), slack_channel = COALESCE(?4, slack_channel) WHERE id = ?1`)
          .bind(brand, str(body.name, 80), str(body.accent, 20), str(body.slack_channel, 40)).run();
        return json({ ok: true });
      }

      if (path === '/api/categories' && request.method === 'PUT') {
        const c = body || {};
        const id = c.id || `${brand}:${slug(c.name)}`;
        if (!c.name) return bad('name required');
        await env.DB.prepare(`INSERT INTO categories (id, brand_id, name, sort) VALUES (?1, ?2, ?3, ?4) ON CONFLICT(id) DO UPDATE SET name = excluded.name, sort = excluded.sort`).bind(id, brand, str(c.name, 60), int(c.sort) ?? 0).run();
        await log(env, brand, actor, 'category', id, 'upsert', c);
        return json({ ok: true, id });
      }
      if (path.startsWith('/api/categories/') && request.method === 'DELETE') {
        const id = decodeURIComponent(path.slice('/api/categories/'.length));
        const used = await env.DB.prepare(`SELECT count(*) AS n FROM lines WHERE category_id = ?1`).bind(id).first();
        if (used?.n) return bad('move its product lines first');
        await env.DB.prepare(`DELETE FROM categories WHERE id = ?1 AND brand_id = ?2`).bind(id, brand).run();
        return json({ ok: true });
      }

      if (path === '/api/lines' && request.method === 'PUT') {
        const l = body || {};
        if (!l.name || !l.category_id) return bad('name and category required');
        const id = l.id || `${brand}:${slug(l.name)}`;
        await env.DB.prepare(`INSERT INTO lines (id, brand_id, category_id, name, variant_axis, factory_id, lead_override_days, moq, target_designs, cut_rule_pct, size_curve, sort)
          VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)
          ON CONFLICT(id) DO UPDATE SET category_id = excluded.category_id, name = excluded.name, variant_axis = excluded.variant_axis, factory_id = excluded.factory_id,
            lead_override_days = excluded.lead_override_days, moq = excluded.moq, target_designs = excluded.target_designs, cut_rule_pct = excluded.cut_rule_pct, size_curve = excluded.size_curve, sort = excluded.sort`)
          .bind(id, brand, str(l.category_id, 80), str(l.name, 60), ['none', 'size', 'hand', 'loft_hand', 'hand_size'].includes(l.variant_axis) ? l.variant_axis : 'none',
            str(l.factory_id, 80), int(l.lead_override_days, 0, 730), int(l.moq, 0, 100000), int(l.target_designs, 0, 1000), int(l.cut_rule_pct, 0, 90),
            l.size_curve && typeof l.size_curve === 'object' && Object.keys(l.size_curve).length ? JSON.stringify(l.size_curve) : null, int(l.sort) ?? 0).run();
        await log(env, brand, actor, 'line', id, 'upsert', l);
        return json({ ok: true, id });
      }
      if (path.startsWith('/api/lines/') && request.method === 'DELETE') {
        const id = decodeURIComponent(path.slice('/api/lines/'.length));
        await env.DB.batch([
          env.DB.prepare(`DELETE FROM type_map WHERE brand_id = ?1 AND line_id = ?2`).bind(brand, id),
          env.DB.prepare(`UPDATE products SET line_id = NULL WHERE brand_id = ?1 AND line_id = ?2`).bind(brand, id),
          env.DB.prepare(`DELETE FROM lines WHERE id = ?1 AND brand_id = ?2`).bind(id, brand),
        ]);
        await log(env, brand, actor, 'line', id, 'delete');
        return json({ ok: true });
      }

      if (path === '/api/type-map' && request.method === 'PUT') {
        const stmts = [];
        for (const [type, lineId] of Object.entries(body || {})) {
          if (lineId) stmts.push(env.DB.prepare(`INSERT INTO type_map (brand_id, shop_type, line_id) VALUES (?1, ?2, ?3) ON CONFLICT(brand_id, shop_type) DO UPDATE SET line_id = excluded.line_id`).bind(brand, str(type, 80), str(lineId, 80)));
          else stmts.push(env.DB.prepare(`DELETE FROM type_map WHERE brand_id = ?1 AND shop_type = ?2`).bind(brand, str(type, 80)));
        }
        if (stmts.length) await env.DB.batch(stmts);
        await log(env, brand, actor, 'line', null, 'type-map', body);
        return json({ ok: true });
      }

      if (path === '/api/factories' && request.method === 'PUT') {
        const f = body || {};
        if (!f.name) return bad('name required');
        const id = f.id || `${brand}:${slug(f.name)}`;
        await env.DB.prepare(`INSERT INTO factories (id, brand_id, name, production_days, shipping_days, order_cycle_days, moq_default, moq_basis, closures, contact, notes)
          VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)
          ON CONFLICT(id) DO UPDATE SET name = excluded.name, production_days = excluded.production_days, shipping_days = excluded.shipping_days, order_cycle_days = excluded.order_cycle_days,
            moq_default = excluded.moq_default, moq_basis = excluded.moq_basis, closures = excluded.closures, contact = excluded.contact, notes = excluded.notes`)
          .bind(id, brand, str(f.name, 60), int(f.production_days, 0, 730) ?? 30, int(f.shipping_days, 0, 365) ?? 30, int(f.order_cycle_days, 1, 365) ?? 90,
            int(f.moq_default, 0, 100000), f.moq_basis === 'variant' ? 'variant' : 'product', JSON.stringify(Array.isArray(f.closures) ? f.closures.filter(c => ymd(c.from) && ymd(c.to)).map(c => ({ from: c.from, to: c.to, label: str(c.label, 60) || '' })) : []),
            str(f.contact, 200), str(f.notes, 1000)).run();
        await log(env, brand, actor, 'factory', id, 'upsert', f);
        return json({ ok: true, id });
      }
      if (path.startsWith('/api/factories/') && request.method === 'DELETE') {
        const id = decodeURIComponent(path.slice('/api/factories/'.length));
        await env.DB.batch([
          env.DB.prepare(`UPDATE lines SET factory_id = NULL WHERE brand_id = ?1 AND factory_id = ?2`).bind(brand, id),
          env.DB.prepare(`DELETE FROM factories WHERE id = ?1 AND brand_id = ?2`).bind(id, brand),
        ]);
        return json({ ok: true });
      }

      if (path.startsWith('/api/products/') && request.method === 'PUT') {
        const pid = path.slice('/api/products/'.length).replace(/\D/g, '');
        if (!pid) return bad('product id required');
        const p = body || {};
        const lifecycle = ['core', 'seasonal', 'drop', 'winding_down', 'discontinued'].includes(p.lifecycle) ? p.lifecycle : null;
        const decision = ['keep', 'cut', 'decide'].includes(p.decision) ? p.decision : p.decision === null ? null : undefined;
        await env.DB.prepare(`INSERT INTO products (brand_id, product_id, line_id, lifecycle, season_from, season_to, moq, lead_override_days, decision, notes, updated_at)
          VALUES (?1, ?2, ?3, COALESCE(?4, 'core'), ?5, ?6, ?7, ?8, ?9, ?10, datetime('now'))
          ON CONFLICT(brand_id, product_id) DO UPDATE SET
            line_id = CASE WHEN ?11 THEN excluded.line_id ELSE line_id END,
            lifecycle = COALESCE(?4, lifecycle),
            season_from = COALESCE(?5, season_from), season_to = COALESCE(?6, season_to),
            moq = CASE WHEN ?12 THEN excluded.moq ELSE moq END,
            lead_override_days = CASE WHEN ?13 THEN excluded.lead_override_days ELSE lead_override_days END,
            decision = CASE WHEN ?14 THEN excluded.decision ELSE decision END,
            notes = COALESCE(?10, notes), updated_at = datetime('now')`)
          .bind(brand, pid, str(p.line_id, 80), lifecycle, str(p.season_from, 5), str(p.season_to, 5), int(p.moq, 0, 100000), int(p.lead_override_days, 0, 730),
            decision === undefined ? null : decision, str(p.notes, 2000),
            'line_id' in p ? 1 : 0, 'moq' in p ? 1 : 0, 'lead_override_days' in p ? 1 : 0, decision !== undefined ? 1 : 0).run();
        if ('moq' in p) { try { await restock(env, request, `/api/set-moq?store=${brand}`, { method: 'POST', body: { productId: pid, moq: int(p.moq, 0, 100000) || 0 } }); } catch (e) { /* Shopify mirror is best effort */ } }
        await log(env, brand, actor, 'product', pid, 'update', p);
        return json({ ok: true });
      }

      /* orders */
      if (path === '/api/orders' && request.method === 'POST') {
        const o = body || {};
        const last = await env.DB.prepare(`SELECT id FROM orders WHERE brand_id = ?1 AND id LIKE 'PO-%' ORDER BY id DESC LIMIT 1`).bind(brand).first();
        const n = last ? parseInt(String(last.id).slice(3), 10) + 1 : 1;
        const id = `PO-${String(n).padStart(4, '0')}`;
        const status = ['draft', 'sent'].includes(o.status) ? o.status : 'draft';
        const lines = (Array.isArray(o.lines) ? o.lines : []).filter(l => l.variant_id && l.product_id && int(l.qty, 1) > 0).slice(0, 500);
        if (!lines.length) return bad('an order needs at least one line');
        const stmts = [env.DB.prepare(`INSERT INTO orders (id, brand_id, factory_id, status, sent_at, expected_at, deposit, tracking, notes, created_by) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)`)
          .bind(id, brand, str(o.factory_id, 80), status, status === 'sent' ? (ymd(o.sent_at) || localDate('America/Chicago')) : null, ymd(o.expected_at), str(o.deposit, 200), str(o.tracking, 200), str(o.notes, 2000), actor)];
        for (const l of lines) stmts.push(env.DB.prepare(`INSERT INTO order_lines (order_id, variant_id, product_id, qty, unit_cost) VALUES (?1, ?2, ?3, ?4, ?5)`).bind(id, String(l.variant_id), String(l.product_id), int(l.qty, 1), l.unit_cost != null ? +l.unit_cost : null));
        for (let i = 0; i < stmts.length; i += 100) await env.DB.batch(stmts.slice(i, i + 100));
        await log(env, brand, actor, 'order', id, 'create', { status, lines: lines.length });
        return json({ ok: true, id });
      }
      if (path.startsWith('/api/orders/') && request.method === 'PUT') {
        const id = decodeURIComponent(path.slice('/api/orders/'.length));
        const o = body || {};
        const cur = await env.DB.prepare(`SELECT * FROM orders WHERE id = ?1 AND brand_id = ?2`).bind(id, brand).first();
        if (!cur) return bad('no such order', 404);
        const STATUSES = ['draft', 'sent', 'confirmed', 'production', 'shipped', 'partial', 'landed', 'cancelled'];
        const status = STATUSES.includes(o.status) ? o.status : cur.status;
        const sent_at = ymd(o.sent_at) || cur.sent_at || (status !== 'draft' && status !== 'cancelled' ? localDate('America/Chicago') : null);
        const stmts = [env.DB.prepare(`UPDATE orders SET factory_id = COALESCE(?3, factory_id), status = ?4, sent_at = ?5, confirmed_at = COALESCE(?6, confirmed_at), expected_at = COALESCE(?7, expected_at),
            landed_at = ?8, deposit = COALESCE(?9, deposit), tracking = COALESCE(?10, tracking), notes = COALESCE(?11, notes), updated_at = datetime('now') WHERE id = ?1 AND brand_id = ?2`)
          .bind(id, brand, str(o.factory_id, 80), status, sent_at, ymd(o.confirmed_at) || (status === 'confirmed' && !cur.confirmed_at ? localDate('America/Chicago') : null), ymd(o.expected_at),
            status === 'landed' ? (ymd(o.landed_at) || cur.landed_at || localDate('America/Chicago')) : cur.landed_at, str(o.deposit, 200), str(o.tracking, 200), str(o.notes, 2000))];
        if (Array.isArray(o.lines)) {
          stmts.push(env.DB.prepare(`DELETE FROM order_lines WHERE order_id = ?1`).bind(id));
          for (const l of o.lines.filter(l => l.variant_id && l.product_id && int(l.qty, 1) > 0).slice(0, 500))
            stmts.push(env.DB.prepare(`INSERT INTO order_lines (order_id, variant_id, product_id, qty, received, unit_cost) VALUES (?1, ?2, ?3, ?4, ?5, ?6)`).bind(id, String(l.variant_id), String(l.product_id), int(l.qty, 1), int(l.received, 0) ?? 0, l.unit_cost != null ? +l.unit_cost : null));
        }
        if (o.received && typeof o.received === 'object') {
          for (const [vid, n] of Object.entries(o.received)) stmts.push(env.DB.prepare(`UPDATE order_lines SET received = ?3 WHERE order_id = ?1 AND variant_id = ?2`).bind(id, String(vid), int(n, 0) ?? 0));
        }
        if (status === 'landed' && !Array.isArray(o.lines) && !o.received) stmts.push(env.DB.prepare(`UPDATE order_lines SET received = qty WHERE order_id = ?1`).bind(id));
        for (let i = 0; i < stmts.length; i += 100) await env.DB.batch(stmts.slice(i, i + 100));
        await log(env, brand, actor, 'order', id, 'update', { from: cur.status, to: status, expected_at: o.expected_at || null });
        return json({ ok: true });
      }
      if (path.startsWith('/api/orders/') && request.method === 'DELETE') {
        const id = decodeURIComponent(path.slice('/api/orders/'.length));
        await env.DB.batch([env.DB.prepare(`DELETE FROM order_lines WHERE order_id = ?1`).bind(id), env.DB.prepare(`DELETE FROM orders WHERE id = ?1 AND brand_id = ?2`).bind(id, brand)]);
        await log(env, brand, actor, 'order', id, 'delete');
        return json({ ok: true });
      }

      /* slots */
      if (path === '/api/slots' && (request.method === 'POST' || request.method === 'PUT')) {
        const s = body || {};
        const id = s.id || `slot-${Date.now().toString(36)}`;
        if (!s.line_id || !s.name || !ymd(s.on_site_at)) return bad('line, name and on-site date required');
        const status = ['needs_brief', 'in_design', 'sampling', 'approved', 'ordered', 'live'].includes(s.status) ? s.status : 'needs_brief';
        await env.DB.prepare(`INSERT INTO slots (id, brand_id, line_id, name, season, status, on_site_at, brief_due, sample_due, order_by, lands_at, asana_task, lineup_event, product_id, notes, updated_at)
          VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, datetime('now'))
          ON CONFLICT(id) DO UPDATE SET line_id = excluded.line_id, name = excluded.name, season = excluded.season, status = excluded.status, on_site_at = excluded.on_site_at,
            brief_due = excluded.brief_due, sample_due = excluded.sample_due, order_by = excluded.order_by, lands_at = excluded.lands_at, asana_task = excluded.asana_task, lineup_event = excluded.lineup_event, product_id = excluded.product_id, notes = excluded.notes, updated_at = datetime('now')`)
          .bind(id, brand, str(s.line_id, 80), str(s.name, 80), str(s.season, 40), status, s.on_site_at, ymd(s.brief_due), ymd(s.sample_due), ymd(s.order_by), ymd(s.lands_at), str(s.asana_task, 300), str(s.lineup_event, 80), s.product_id ? String(s.product_id).replace(/\D/g, '') : null, str(s.notes, 2000)).run();
        await log(env, brand, actor, 'slot', id, request.method === 'POST' ? 'create' : 'update', s);
        return json({ ok: true, id });
      }
      if (path.startsWith('/api/slots/') && request.method === 'DELETE') {
        const id = decodeURIComponent(path.slice('/api/slots/'.length));
        await env.DB.prepare(`DELETE FROM slots WHERE id = ?1 AND brand_id = ?2`).bind(id, brand).run();
        await log(env, brand, actor, 'slot', id, 'delete');
        return json({ ok: true });
      }

      /* pass-throughs to the Shopify side */
      if (path === '/api/shopify/snapshot' && request.method === 'POST') return json(await restock(env, request, `/api/snapshot?store=${brand}`, { method: 'POST' }));
      if (path === '/api/shopify/backfill' && request.method === 'POST') return json(await restock(env, request, `/api/backfill?store=${brand}`, { method: 'POST', body: { days: int(body?.days, 7, 800) || 90 } }));
      if (path === '/api/shopify/digest' && request.method === 'POST') return json(await restock(env, request, `/api/digest?store=${brand}`, { method: 'POST' }));
      if (path === '/api/shopify/set-type' && request.method === 'POST') return json(await restock(env, request, `/api/set-type?store=${brand}`, { method: 'POST', body }));
      if (path === '/api/shopify/settings' && request.method === 'GET') return json(await restock(env, request, `/api/settings`));
      if (path === '/api/shopify/settings' && request.method === 'PUT') return json(await restock(env, request, `/api/settings`, { method: 'PUT', body }));
      if (path === '/api/shopify/channels') return json(await restock(env, request, `/api/channels`));
      if (path === '/api/shopify/password' && request.method === 'POST') return json(await restock(env, request, `/api/password`, { method: 'POST', body }));

      if (path === '/api/changelog') {
        const rows = await env.DB.prepare(`SELECT * FROM changelog WHERE brand_id = ?1 ORDER BY id DESC LIMIT 200`).bind(brand).all();
        return json({ entries: rows.results || [] });
      }
      if (path === '/api/reseed' && request.method === 'POST') {
        const raw = await restock(env, request, `/api/raw?store=${brand}`);
        await seed(env, brand, raw, actor);
        return json({ ok: true });
      }
      return bad('not found', 404);
    } catch (err) {
      const status = err.status || 500;
      return json({ error: String(err.message || err) }, status);
    }
  },
};

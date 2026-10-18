/**
 * THE STRATEGIST'S SHOPIFY HANDS (2026-10-17), with the metawrite.js rules: the brand's OWN store only (p_shopify row
 * linked to the brand), look the product / code up first, before -> after, a p_ext_write row, a Change Log line,
 * undo_change.
 *
 *   shopify_product    a product's status (active / draft / archived), title, tags, price and compare-at price
 *   shopify_discount   make a discount code (percent or amount off, dates, limits), or switch one off / on
 *
 * The token is the Mobius Digital app's (installed per store, profit worker OAuth, table p_shopify). As of 2026-10-17 the
 * app asks only read scopes (profit/shopify.app.toml + SHOPIFY_SCOPES in profit/worker/src/worker.js), so every card
 * refuses with the fix until write_products / write_discounts are added there and the store re-approves the app.
 * Lucky's own store is written by the Supply engine's separate app, not here.
 */
import { recordWrite, registerUndo, doneNote, brandOf } from './extwrite.js';

const P = 'shopify';
const API = '2026-07';
const clip = (s, n) => String(s ?? '').slice(0, n);
const REASON = { type: 'string', description: 'Why, in one line.' };
const FIX = need => `The Shopify connection can only read this store (it lacks ${need}). Cole: add ${need} to the Mobius Digital app's scopes in profit/shopify.app.toml and SHOPIFY_SCOPES in profit/worker/src/worker.js (Claude Code can do this), run shopify app deploy, then the store owner opens the app in Shopify admin and approves the new access.`;

export async function storeOf(env, act) {
  const r = await env.DB.prepare(`SELECT shop, access_token, scopes FROM p_shopify WHERE act_id = ?1 AND uninstalled_at IS NULL AND access_token <> '' ORDER BY installed_at DESC LIMIT 1`).bind(act).first().catch(() => null);
  return r || null;
}
async function gql(d, store, query, variables = {}) {
  const res = await d.xfetch(`https://${store.shop}/admin/api/${API}/graphql.json`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': store.access_token }, body: JSON.stringify({ query, variables }) });
  const j = await res.json().catch(() => ({}));
  if (!res.ok || j.errors) throw new Error(`Shopify said: ${(Array.isArray(j.errors) ? j.errors.map(e => e.message).join('; ') : j.errors) || `HTTP ${res.status}`}`);
  return j.data || {};
}
const userErr = (x, what) => { const e = x?.userErrors || []; if (e.length) throw new Error(`Shopify refused ${what}: ${e.map(u => u.message).join('; ')}`); };
async function prep(env, d, input, ctx, need) {
  const brand = await brandOf(env, d, input.brand, ctx);
  if (!brand) return { error: `Which brand? No brand called "${input.brand || ''}".` };
  const store = await storeOf(env, brand.act_id);
  if (!store) return { error: `${brand.name}'s store has not installed the Mobius Digital Shopify app (or it is not linked to the brand), so Locus cannot change it.` };
  if (!String(store.scopes || '').split(',').includes(need)) return { error: FIX(need) };
  return { brand, store };
}
const PRODUCT_FIELDS = 'id title handle status tags variants(first: 50) { nodes { id title price compareAtPrice } }';
async function findProduct(d, store, want) {
  const w = String(want || '').trim(); if (!w) return { error: 'Which product? Title, handle or id.' };
  if (/^gid:\/\/shopify\/Product\/\d+$|^\d{6,}$/.test(w)) {
    const j = await gql(d, store, `query($id: ID!) { product(id: $id) { ${PRODUCT_FIELDS} } }`, { id: w.startsWith('gid') ? w : `gid://shopify/Product/${w}` });
    return j.product ? { product: j.product } : { error: `No product ${w}.` };
  }
  const j = await gql(d, store, `query($q: String!) { products(first: 20, query: $q) { nodes { ${PRODUCT_FIELDS} } } }`, { q: `title:*${w.replace(/["\\]/g, '')}* OR handle:${w.replace(/[^a-z0-9-]/gi, '')}` });
  const rows = j.products?.nodes || [], lw = w.toLowerCase();
  const exact = rows.filter(p => p.title.toLowerCase() === lw || p.handle === lw);
  const hit = exact.length === 1 ? exact[0] : (!exact.length && rows.length === 1 ? rows[0] : null);
  if (hit) return { product: hit };
  if (!rows.length) return { error: `No product like "${w}" in the store.` };
  return { error: `"${w}" matches ${rows.length}: ${rows.slice(0, 8).map(p => `${p.title} (${p.handle})`).join('; ')}. Say which.` };
}

const productAction = d => ({
  name: 'shopify_product',
  description: 'Change a product in the brand\'s Shopify store: status (active = on the site, draft = hidden, archived), title, tags to add or remove, price and compare-at price (every variant, or the variants whose title contains `variant`). The site changes at once. Undo puts the old values back.',
  input_schema: { type: 'object', properties: { brand: { type: 'string' }, product: { type: 'string' }, status: { type: 'string', enum: ['active', 'draft', 'archived'] }, title: { type: 'string' },
    tags_add: { type: 'array', items: { type: 'string' } }, tags_remove: { type: 'array', items: { type: 'string' } }, price: { type: 'number' }, compare_at: { type: 'number', description: '0 clears it.' }, variant: { type: 'string' }, reason: REASON }, required: ['brand', 'product', 'reason'] },
  propose: async (env, i, h, ctx) => {
    const r = await prep(env, d, i, ctx, 'write_products'); if (r.error) return r;
    let f; try { f = await findProduct(d, r.store, i.product); } catch (e) { return { error: e.message }; } if (f.error) return f;
    const pr = f.product, upd = {}, before = {}, lines = [];
    if (i.status && i.status.toUpperCase() !== pr.status) { upd.status = i.status.toUpperCase(); before.status = pr.status; lines.push(`status ${pr.status.toLowerCase()} → ${i.status}`); }
    if (i.title && i.title !== pr.title) { upd.title = clip(i.title, 255); before.title = pr.title; lines.push(`title → "${upd.title}"`); }
    if (i.tags_add?.length || i.tags_remove?.length) {
      const rm = (i.tags_remove || []).map(t => String(t).toLowerCase());
      const tags = [...new Set([...pr.tags.filter(t => !rm.includes(t.toLowerCase())), ...(i.tags_add || []).map(t => String(t).trim()).filter(Boolean)])];
      if (tags.join(',') !== pr.tags.join(',')) { upd.tags = tags; before.tags = pr.tags; lines.push(`tags ${[...(i.tags_add || []).map(t => `+${t}`), ...(i.tags_remove || []).map(t => `-${t}`)].join(' ')}`); }
    }
    let vars = [];
    if (i.price != null || i.compare_at != null) {
      const vs = pr.variants.nodes.filter(v => !i.variant || v.title.toLowerCase().includes(String(i.variant).toLowerCase()));
      if (!vs.length) return { error: `No variant like "${i.variant}". Variants: ${pr.variants.nodes.map(v => v.title).join(', ')}.` };
      vars = vs.map(v => ({ id: v.id, title: v.title, before: { price: v.price, compareAtPrice: v.compareAtPrice }, after: { ...(i.price != null ? { price: String(i.price) } : {}), ...(i.compare_at != null ? { compareAtPrice: +i.compare_at > 0 ? String(i.compare_at) : null } : {}) } }));
      const p0 = vs[0];
      lines.push(`${vs.length === pr.variants.nodes.length ? 'every variant' : `${vs.length} variant${vs.length > 1 ? 's' : ''}`}: ${i.price != null ? `price $${p0.price} → $${i.price}` : ''}${i.price != null && i.compare_at != null ? ', ' : ''}${i.compare_at != null ? `compare-at ${p0.compareAtPrice ? `$${p0.compareAtPrice}` : 'none'} → ${+i.compare_at > 0 ? `$${i.compare_at}` : 'none'}` : ''}`);
    }
    if (!lines.length) return { error: 'Nothing would change.' };
    return { summary: `${r.brand.name}: Shopify "${pr.title}": ${lines.join('; ')}`, detail: `${r.store.shop}. The site changes as soon as this applies.\nWhy: ${clip(i.reason, 300)}`,
      patch: { brand: r.brand.act_id, id: pr.id, name: pr.title, upd, before, vars, lines, reason: clip(i.reason, 300) } };
  },
  apply: async (env, p, h, ctx) => {
    const r = await prep(env, d, { brand: p.brand }, ctx, 'write_products'); if (r.error) return r;
    try {
      await writeProduct(d, r.store, p.id, p.upd, p.vars.map(v => ({ id: v.id, ...v.after })));
    } catch (e) { return { error: e.message }; }
    const id = await recordWrite(env, { platform: P, brand: p.brand, object: p.id, name: p.name, action: 'shopify_product', before: { ...p.before, variants: p.vars.map(v => ({ title: v.title, ...v.before })) }, after: { ...p.upd, variants: p.vars.map(v => ({ title: v.title, ...v.after })) },
      undo: { op: 'product', id: p.id, upd: p.before, vars: p.vars.map(v => ({ id: v.id, ...v.before })) }, summary: `Shopify "${p.name}": ${p.lines.join('; ')}`, reason: p.reason, category: 'other', objectType: 'SHOPIFY_PRODUCT', ctx });
    return { ok: true, note: doneNote(`"${p.name}" updated on the site.`, id) };
  },
});
async function writeProduct(d, store, id, upd, vars) {
  if (upd && Object.keys(upd).length) {
    const j = await gql(d, store, `mutation($p: ProductUpdateInput!) { productUpdate(product: $p) { product { id } userErrors { field message } } }`, { p: { id, ...upd } });
    userErr(j.productUpdate, 'the product change');
  }
  if (vars && vars.length) {
    const j = await gql(d, store, `mutation($id: ID!, $v: [ProductVariantsBulkInput!]!) { productVariantsBulkUpdate(productId: $id, variants: $v) { productVariants { id } userErrors { field message } } }`, { id, v: vars });
    userErr(j.productVariantsBulkUpdate, 'the price change');
  }
}

const discountAction = d => ({
  name: 'shopify_discount',
  description: 'Make a discount code in the brand\'s Shopify store (percent or dollar amount off the order, start and end dates, a usage limit, once per customer), or switch an existing code off (mode off) or back on (mode on). Making a code sends nothing to anyone; it works on the site as soon as it starts.',
  input_schema: { type: 'object', properties: { brand: { type: 'string' }, mode: { type: 'string', enum: ['create', 'off', 'on'] }, code: { type: 'string' }, title: { type: 'string' }, percent: { type: 'number', description: '20 = 20% off.' }, amount: { type: 'number', description: 'Dollars off the order.' },
    starts: { type: 'string', description: 'YYYY-MM-DD or ISO; default now.' }, ends: { type: 'string', description: 'YYYY-MM-DD or ISO.' }, limit: { type: 'integer', description: 'Total uses.' }, once_per_customer: { type: 'boolean' }, minimum: { type: 'number', description: 'Minimum order in dollars.' }, reason: REASON }, required: ['brand', 'code', 'reason'] },
  propose: async (env, i, h, ctx) => {
    const r = await prep(env, d, i, ctx, 'write_discounts'); if (r.error) return r;
    const code = clip(String(i.code || '').trim().toUpperCase(), 60); if (!/^[A-Z0-9_-]{3,60}$/.test(code)) return { error: 'The code is 3 to 60 letters, numbers, dashes.' };
    let have = null;
    try { have = (await gql(d, r.store, `query($c: String!) { codeDiscountNodeByCode(code: $c) { id codeDiscount { __typename ... on DiscountCodeBasic { title status startsAt endsAt } } } }`, { c: code })).codeDiscountNodeByCode; } catch (e) { return { error: e.message }; }
    const mode = i.mode || 'create';
    if (mode !== 'create') {
      if (!have) return { error: `There is no code ${code} in the store.` };
      const st = have.codeDiscount?.status;
      if ((mode === 'off' && st === 'EXPIRED') || (mode === 'on' && st === 'ACTIVE')) return { error: `${code} is already ${st.toLowerCase()}.` };
      return { summary: `${r.brand.name}: switch the code ${code} ${mode}`, detail: `${have.codeDiscount?.title || ''} (${String(st || '').toLowerCase()}).\nWhy: ${clip(i.reason, 300)}`, patch: { brand: r.brand.act_id, mode, id: have.id, code, reason: clip(i.reason, 300) } };
    }
    if (have) return { error: `The code ${code} already exists (${have.codeDiscount?.title || ''}). Pick another, or mode off / on.` };
    if (!(+i.percent > 0) === !(+i.amount > 0)) return { error: 'Give percent or amount (one of them).' };
    if (+i.percent > 90) return { error: 'Over 90% off is refused here; make it in Shopify if that is truly the offer.' };
    const iso = (s, end) => { if (!s) return null; const v = String(s); const t = /^\d{4}-\d{2}-\d{2}$/.test(v) ? Date.parse(`${v}T${end ? '23:59:00' : '00:00:00'}-06:00`) : Date.parse(v); return isNaN(t) ? undefined : new Date(t).toISOString(); };
    const startsAt = iso(i.starts) || new Date().toISOString(), endsAt = iso(i.ends, true);
    if (startsAt === undefined || endsAt === undefined) return { error: 'Dates are YYYY-MM-DD or ISO.' };
    const input = { title: clip(i.title || code, 255), code, startsAt, ...(endsAt ? { endsAt } : {}), customerSelection: { all: true },
      customerGets: { value: +i.percent > 0 ? { percentage: Math.round(+i.percent) / 100 } : { discountAmount: { amount: String(i.amount), appliesOnEachItem: false } }, items: { all: true } },
      ...(i.limit ? { usageLimit: Math.round(i.limit) } : {}), appliesOncePerCustomer: !!i.once_per_customer,
      ...(+i.minimum > 0 ? { minimumRequirement: { subtotal: { greaterThanOrEqualToSubtotal: String(i.minimum) } } } : {}) };
    const what = `${+i.percent > 0 ? `${Math.round(i.percent)}% off` : `$${i.amount} off`} the order${+i.minimum > 0 ? ` over $${i.minimum}` : ''}`;
    return { summary: `${r.brand.name}: new code ${code}, ${what}`, detail: `From ${startsAt.slice(0, 16).replace('T', ' ')} UTC${endsAt ? ` to ${endsAt.slice(0, 16).replace('T', ' ')} UTC` : ', no end date'}${i.limit ? `, ${i.limit} uses` : ''}${i.once_per_customer ? ', once per customer' : ''}. Works on the site from the start time; nothing is sent to anyone.\nWhy: ${clip(i.reason, 300)}`,
      patch: { brand: r.brand.act_id, mode, code, input, what, reason: clip(i.reason, 300) } };
  },
  apply: async (env, p, h, ctx) => {
    const r = await prep(env, d, { brand: p.brand }, ctx, 'write_discounts'); if (r.error) return r;
    try {
      if (p.mode === 'create') {
        const j = await gql(d, r.store, `mutation($d: DiscountCodeBasicInput!) { discountCodeBasicCreate(basicCodeDiscount: $d) { codeDiscountNode { id } userErrors { field message } } }`, { d: p.input });
        userErr(j.discountCodeBasicCreate, 'the code');
        const nid = j.discountCodeBasicCreate.codeDiscountNode?.id;
        const id = await recordWrite(env, { platform: P, brand: p.brand, object: nid, name: p.code, action: 'shopify_discount', after: { code: p.code, what: p.what }, undo: { op: 'code', id: nid, to: 'off' }, summary: `New Shopify code ${p.code}, ${p.what}`, reason: p.reason, category: 'other', objectType: 'SHOPIFY_DISCOUNT', ctx });
        return { ok: true, note: doneNote(`Code ${p.code} is live in the store (${p.what}).`, id) };
      }
      await codeSwitch(d, r.store, p.id, p.mode);
      const id = await recordWrite(env, { platform: P, brand: p.brand, object: p.id, name: p.code, action: 'shopify_discount', after: { [p.mode]: p.code }, undo: { op: 'code', id: p.id, to: p.mode === 'off' ? 'on' : 'off' }, summary: `Shopify code ${p.code} switched ${p.mode}`, reason: p.reason, category: 'other', objectType: 'SHOPIFY_DISCOUNT', ctx });
      return { ok: true, note: doneNote(`Code ${p.code} is ${p.mode}.`, id) };
    } catch (e) { return { error: e.message }; }
  },
});
async function codeSwitch(d, store, id, to) {
  const m = to === 'off' ? 'discountCodeDeactivate' : 'discountCodeActivate';
  const j = await gql(d, store, `mutation($id: ID!) { ${m}(id: $id) { codeDiscountNode { id } userErrors { field message } } }`, { id });
  userErr(j[m], `switching the code ${to}`);
}

registerUndo(P, async (env, d, row, u) => {
  const store = await storeOf(env, row.brand);
  if (!store) return { error: 'The store is not connected any more.' };
  try {
    if (u.op === 'product') await writeProduct(d, store, u.id, u.upd, u.vars);
    else if (u.op === 'code') await codeSwitch(d, store, u.id, u.to);
    else return { error: `Unknown Shopify undo ${u.op}.` };
  } catch (e) { return { error: e.message }; }
  return { ok: true, note: `Undone: ${row.summary}.` };
});
export function shopifyActions(d) { return [productAction(d), discountAction(d)]; }
export async function shopifyAccess(env, brand) {
  const { results } = await env.DB.prepare(`SELECT shop, act_id, scopes FROM p_shopify WHERE uninstalled_at IS NULL AND access_token <> ''${brand ? ' AND act_id = ?1' : ''}`).bind(...(brand ? [brand.act_id] : [])).all().catch(() => ({ results: [] }));
  return { stores: (results || []).map(s => ({ shop: s.shop, brand: s.act_id || 'not linked to a brand', can_products: String(s.scopes || '').includes('write_products'), can_discounts: String(s.scopes || '').includes('write_discounts') })),
    fix: (results || []).some(s => String(s.scopes || '').includes('write_products')) ? null : FIX('write_products,write_discounts') };
}

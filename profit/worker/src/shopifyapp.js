/**
 * THE EMBEDDED SHOPIFY APP (2026-10-18). Shopify paused the "Mobius Digital" App Store review (ref 131577):
 *   2.1.3 / 2.1.1  the app must have a UI with no web errors; the reviewer saw "Shopify could not be read: Shopify
 *                  returned 403" (the orders read needs Protected customer data approval, which the app lacked);
 *   1.1.1          an embedded app must work on session tokens, not third-party cookies or local storage.
 * So the app now opens INSIDE the Shopify admin:
 *   GET  /shopify/app            the page (App Bridge from Shopify's CDN, CSP frame-ancestors for this shop + admin)
 *   GET  /shopify/app/api/report the numbers, authorised ONLY by the App Bridge session token (Authorization: Bearer)
 * The session token (a JWT signed with the app secret) is verified here and names the shop; the shop's own offline token
 * comes from the classic install (/shopify/install -> /shopify/callback, unchanged). A shop with no live token is sent
 * through that install once (the page redirects the top window), then lands back inside the admin. Every read degrades instead of failing: a refused orders read shows the products report plus one plain
 * line saying order numbers need Shopify's approval. No cookies, no storage, nothing outside the page.
 */
const API = '2026-07';
const SHOP_RE = /^[a-zA-Z0-9][a-zA-Z0-9-]*\.myshopify\.com$/;
const enc = new TextEncoder();
const b64url = s => { s = s.replace(/-/g, '+').replace(/_/g, '/'); while (s.length % 4) s += '='; return Uint8Array.from(atob(s), c => c.charCodeAt(0)); };

/** Verify an App Bridge session token. Returns {shop} or {error}. */
export async function verifySessionToken(env, token) {
  const parts = String(token || '').split('.');
  if (parts.length !== 3 || !env.SHOPIFY_API_SECRET || !env.SHOPIFY_API_KEY) return { error: 'no session' };
  let head, claims;
  try { head = JSON.parse(new TextDecoder().decode(b64url(parts[0]))); claims = JSON.parse(new TextDecoder().decode(b64url(parts[1]))); } catch { return { error: 'bad token' }; }
  if (head.alg !== 'HS256') return { error: 'bad token' };
  const key = await crypto.subtle.importKey('raw', enc.encode(env.SHOPIFY_API_SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']);
  const ok = await crypto.subtle.verify('HMAC', key, b64url(parts[2]), enc.encode(`${parts[0]}.${parts[1]}`));
  if (!ok) return { error: 'bad signature' };
  const now = Math.floor(Date.now() / 1000);
  if (claims.exp && now > claims.exp + 10) return { error: 'expired' };
  if (claims.nbf && now < claims.nbf - 10) return { error: 'not yet valid' };
  if (claims.aud !== env.SHOPIFY_API_KEY) return { error: 'wrong app' };
  const shop = String(claims.dest || '').replace(/^https:\/\//, '').toLowerCase();
  if (!SHOP_RE.test(shop) || !String(claims.iss || '').startsWith(`https://${shop}`)) return { error: 'wrong shop' };
  return { shop, claims };
}

/** The shop's stored offline token from the install (classic OAuth, use_legacy_install_flow stays true), or null. */
async function storedToken(env, shop) {
  const row = await env.DB.prepare(`SELECT access_token, uninstalled_at FROM p_shopify WHERE shop = ?1`).bind(shop).first().catch(() => null);
  return row?.access_token && !row.uninstalled_at ? row.access_token : null;
}

async function gql(F, shop, token, query, variables = {}) {
  const res = await F(`https://${shop}/admin/api/${API}/graphql.json`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': token }, body: JSON.stringify({ query, variables }) });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(`Shopify returned ${res.status}`), { status: res.status });
  if (j.errors?.length) throw Object.assign(new Error(j.errors.map(e => e.message).join('; ')), { status: /access denied|not approved|protected/i.test(JSON.stringify(j.errors)) ? 403 : 400 });
  return j.data || {};
}

/** The report: shop, products always; orders when Shopify allows them. Never throws for a refused part. */
export async function appReport(env, shop, token, days, F) {
  const n = [7, 30, 90].includes(+days) ? +days : 30;
  const since = new Date(Date.now() - n * 864e5).toISOString().slice(0, 10);
  const out = { days: n, since, notes: [] };
  const s = await gql(F, shop, token, `{ shop { name myshopifyDomain currencyCode primaryDomain { url } } productsCount { count } }`);
  out.shop = { name: s.shop?.name || shop, domain: shop, url: s.shop?.primaryDomain?.url || null, currency: s.shop?.currencyCode || 'USD', products: s.productsCount?.count ?? null };
  try {
    const p = await gql(F, shop, token, `{ products(first: 25, sortKey: UPDATED_AT, reverse: true) { nodes { title status totalInventory priceRangeV2 { minVariantPrice { amount } } } } }`);
    out.products = (p.products?.nodes || []).map(x => ({ title: x.title, status: String(x.status || '').toLowerCase(), stock: x.totalInventory, price: +x.priceRangeV2?.minVariantPrice?.amount || 0 }));
  } catch (e) { out.products = []; out.notes.push('Products could not be listed right now.'); }
  try {
    const orders = []; let after = null;
    for (let i = 0; i < 4; i++) {
      const d = await gql(F, shop, token, `query($q: String!, $after: String) { orders(first: 250, query: $q, after: $after, sortKey: CREATED_AT) { pageInfo { hasNextPage endCursor } nodes { createdAt currentTotalPriceSet { shopMoney { amount } } lineItems(first: 10) { nodes { title quantity } } } } }`, { q: `created_at:>=${since}`, after });
      orders.push(...(d.orders?.nodes || []));
      if (!d.orders?.pageInfo?.hasNextPage) break; after = d.orders.pageInfo.endCursor;
    }
    const byDay = {}, top = {}; let revenue = 0;
    for (const o of orders) { const a = +o.currentTotalPriceSet?.shopMoney?.amount || 0; revenue += a; const k = String(o.createdAt).slice(0, 10); (byDay[k] ||= { orders: 0, revenue: 0 }); byDay[k].orders++; byDay[k].revenue += a; for (const li of o.lineItems?.nodes || []) top[li.title] = (top[li.title] || 0) + (+li.quantity || 0); }
    out.orders = { count: orders.length, revenue: Math.round(revenue * 100) / 100, aov: orders.length ? Math.round(revenue / orders.length * 100) / 100 : 0,
      days: Array.from({ length: n }, (_, i) => { const k = new Date(Date.now() - (n - 1 - i) * 864e5).toISOString().slice(0, 10); return { date: k, orders: byDay[k]?.orders || 0, revenue: Math.round((byDay[k]?.revenue || 0) * 100) / 100 }; }),
      top: Object.entries(top).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([title, qty]) => ({ title, qty })) };
  } catch (e) {
    out.orders = null;
    out.notes.push(e.status === 403 ? 'Order numbers appear once Shopify approves this app\'s access to order data. Products are shown meanwhile.' : 'Orders could not be read right now; try Refresh.');
  }
  return out;
}

/** The page. App Bridge reads the API key from the meta tag and hands out session tokens; nothing is stored. */
function page(apiKey) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="shopify-api-key" content="${apiKey}"><script src="https://cdn.shopify.com/shopifycloud/app-bridge.js"></script>
<title>Mobius Digital</title><style>
:root{--bg:#f1f2f4;--card:#fff;--ink:#303030;--mute:#616161;--line:#e3e3e3;--accent:#303030}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:14px/1.45 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif}
main{max-width:1000px;margin:0 auto;padding:16px}h1{font-size:20px;margin:4px 0 2px}.sub{color:var(--mute);margin:0 0 14px}
.bar{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:14px}button,select{font:inherit;border:1px solid #8a8a8a;border-radius:8px;background:#fff;padding:6px 12px;cursor:pointer}
button.primary{background:var(--accent);color:#fff;border-color:var(--accent)}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px;margin-bottom:12px}
.card{background:var(--card);border-radius:12px;padding:14px;box-shadow:0 1px 0 rgba(0,0,0,.07)}.k{color:var(--mute);font-size:12px}.v{font-size:22px;font-weight:650;margin-top:2px}
table{width:100%;border-collapse:collapse}td,th{text-align:left;padding:7px 4px;border-bottom:1px solid var(--line)}th{color:var(--mute);font-weight:500;font-size:12px}
.note{background:#fff8db;border-radius:10px;padding:10px 12px;margin-bottom:12px}svg{width:100%;height:120px}.muted{color:var(--mute)}
</style></head><body><main>
<h1 id="name">Mobius Digital</h1><p class="sub">Your store at a glance: sales, orders and products, read live from Shopify. Mobius Digital is the agency that runs your ads; this is the same view our team works from.</p>
<div class="bar"><label class="muted" for="days">Period</label><select id="days"><option value="7">Last 7 days</option><option value="30" selected>Last 30 days</option><option value="90">Last 90 days</option></select>
<button class="primary" id="refresh">Refresh</button><button id="contact">Talk to Mobius Digital</button></div>
<div id="notes"></div><div class="grid" id="kpis"></div>
<div class="card" id="chartCard" style="margin-bottom:12px"><div class="k">Sales by day</div><svg id="chart" viewBox="0 0 600 120" preserveAspectRatio="none"></svg></div>
<div class="grid" style="grid-template-columns:1fr 1fr"><div class="card"><div class="k">Best sellers (units)</div><table id="top"></table></div>
<div class="card"><div class="k">Products</div><table id="products"></table></div></div>
<p class="muted" id="status">Loading...</p></main>
<script>
const $=id=>document.getElementById(id);const esc=s=>String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
let cur='USD';const money=v=>new Intl.NumberFormat('en-US',{style:'currency',currency:cur,maximumFractionDigits:0}).format(v||0);
async function load(){$('status').textContent='Loading...';try{
 const t=await shopify.idToken();const r=await fetch('/shopify/app/api/report?days='+$('days').value,{headers:{Authorization:'Bearer '+t}});
 const d=await r.json();if(d.install){$('status').textContent='Connecting your store...';open(d.install,'_top');return;}if(!r.ok||d.error){$('status').textContent=d.error||'Could not load. Try Refresh.';return;}
 cur=d.shop.currency;$('name').textContent=d.shop.name;
 $('notes').innerHTML=(d.notes||[]).map(n=>'<div class="note">'+esc(n)+'</div>').join('');
 const o=d.orders;$('kpis').innerHTML=[['Sales',o?money(o.revenue):'Pending'],['Orders',o?o.count:'Pending'],['Average order',o?money(o.aov):'Pending'],['Products',d.shop.products??'-']].map(([k,v])=>'<div class="card"><div class="k">'+k+'</div><div class="v">'+v+'</div></div>').join('');
 const days=o?o.days:[];const max=Math.max(1,...days.map(x=>x.revenue));$('chartCard').style.display=o?'':'none';
 $('chart').innerHTML=days.map((x,i)=>{const w=600/days.length,h=Math.round(x.revenue/max*110);return '<rect x="'+(i*w+1)+'" y="'+(118-h)+'" width="'+Math.max(1,w-2)+'" height="'+h+'" fill="#303030"><title>'+x.date+': '+money(x.revenue)+', '+x.orders+' orders</title></rect>';}).join('');
 $('top').innerHTML='<tr><th>Product</th><th>Units</th></tr>'+((o&&o.top.length)?o.top.map(x=>'<tr><td>'+esc(x.title)+'</td><td>'+x.qty+'</td></tr>').join(''):'<tr><td colspan="2" class="muted">'+(o?'No orders in this period.':'Shown once order access is approved.')+'</td></tr>');
 $('products').innerHTML='<tr><th>Product</th><th>Status</th><th>Stock</th><th>Price</th></tr>'+(d.products.length?d.products.map(x=>'<tr><td>'+esc(x.title)+'</td><td>'+esc(x.status)+'</td><td>'+(x.stock??'-')+'</td><td>'+money(x.price)+'</td></tr>').join(''):'<tr><td colspan="4" class="muted">No products yet.</td></tr>');
 $('status').textContent='Read live from Shopify for '+d.since+' to today.';
}catch(e){$('status').textContent='Could not load. Try Refresh.';}}
$('refresh').onclick=load;$('days').onchange=load;$('contact').onclick=()=>open('mailto:cole@go-mobius-digital.com?subject=Mobius%20Digital%20Shopify%20app','_top');
load();
</script></body></html>`;
}

/** Routes; returns null when the path is not ours. */
export async function handleShopifyApp(request, env, url, { F = fetch } = {}) {
  if (url.pathname === '/shopify/app') {
    const shop = String(url.searchParams.get('shop') || '').toLowerCase();
    const frame = `frame-ancestors ${SHOP_RE.test(shop) ? `https://${shop} ` : ''}https://admin.shopify.com;`;
    if (!env.SHOPIFY_API_KEY) return new Response('The app is being set up. Please try again shortly.', { status: 200, headers: { 'Content-Type': 'text/plain' } });
    /* A store opening the app before it has a saved token (a fresh install): straight to the classic install, through
       App Bridge's top-level open so it leaves the admin frame. */
    if (SHOP_RE.test(shop) && !(await storedToken(env, shop))) {
      const go = `${url.origin}/shopify/install?shop=${encodeURIComponent(shop)}`;
      return new Response(`<!doctype html><html><head><meta charset="utf-8"><meta name="shopify-api-key" content="${env.SHOPIFY_API_KEY}"><script src="https://cdn.shopify.com/shopifycloud/app-bridge.js"></script></head><body style="font:14px sans-serif;padding:24px">Connecting your store to Mobius Digital...<script>open(${JSON.stringify(go)},'_top');</script></body></html>`,
        { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Content-Security-Policy': frame, 'Cache-Control': 'no-store' } });
    }
    return new Response(page(env.SHOPIFY_API_KEY), { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Content-Security-Policy': frame, 'Cache-Control': 'no-store' } });
  }
  if (url.pathname === '/shopify/app/api/report') {
    const json = (o, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
    const tok = String(request.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
    const v = await verifySessionToken(env, tok);
    if (v.error) return json({ error: 'Please open the app from Apps in your Shopify admin.' }, 401);
    const access = await storedToken(env, v.shop);
    if (!access) return json({ install: `${url.origin}/shopify/install?shop=${encodeURIComponent(v.shop)}` });
    try { return json(await appReport(env, v.shop, access, url.searchParams.get('days'), F)); }
    catch (e) {
      if (e.status === 401) {   /* the store took the app's access back: forget the token, install again */
        await env.DB.prepare(`UPDATE p_shopify SET access_token = '' WHERE shop = ?1`).bind(v.shop).run().catch(() => {});
        return json({ install: `${url.origin}/shopify/install?shop=${encodeURIComponent(v.shop)}` });
      }
      return json({ error: 'Shopify did not answer just now. Try Refresh.' });
    }
  }
  return null;
}
export const _test = { page };

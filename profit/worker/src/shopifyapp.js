/**
 * THE EMBEDDED SHOPIFY APP (2026-10-18). Shopify paused the "Mobius Digital" App Store review (ref 131577):
 *   2.1.3 / 2.1.1  the app must have a UI with no web errors; the reviewer saw "Shopify could not be read: Shopify
 *                  returned 403" (the orders read needs Protected customer data approval, which the app lacked);
 *   1.1.1          an embedded app must work on session tokens, not third-party cookies or local storage.
 * So the app now opens INSIDE the Shopify admin:
 *   GET  /shopify/app            the page (App Bridge from Shopify's CDN, CSP frame-ancestors for this shop + admin)
 *   GET  /shopify/app/api/report the numbers, authorized ONLY by the App Bridge session token (Authorization: Bearer)
 *   POST /shopify/app/api/scopes the store just granted (or removed) optional access: read what it has now, store it
 * The session token (a JWT signed with the app secret) is verified here and names the shop. Shopify runs the install
 * and the permission screen itself (managed installation, 2026-11-15); a shop with no live token gets one here by
 * token exchange, with no redirect. Tokens are the EXPIRING kind and are only ever read through shopToken()
 * (shoptoken.js, 2026-11-24, requirement 3.1.2). Every read degrades instead of failing: the store, its
 * products and its orders are read one by one, a refused part shows one plain line while the other panels still fill,
 * and a report with nothing in it is tried once more with a freshly exchanged token (review feedback 2.1.1 + 2.1.4,
 * 2026-11-24). No cookies, no storage, nothing outside the page.
 *
 * WORDING (requirement 1.1.14, 2026-11-24): the screen says what the app does for the store and nothing else. No
 * sentence about an agency, no button that contacts one. Support contact lives in the App Store listing.
 */
import { shopToken, exchangeSessionToken } from './shoptoken.js';
/** The REQUIRED scopes, asked at install. ONE list: worker.js SHOPIFY_SCOPES is this joined, and `scopes` in
 *  profit/shopify.app.toml must be the same (test-shopifyapp.mjs checks it), or the next `shopify app deploy` undoes
 *  a scope change made in the Dev Dashboard. A store installed before a change is asked for the new ones by Shopify
 *  (managed installation) the next time its owner opens the app; the page then reports what it holds (tell()).
 *  The match with the TOML is checked by test-scopes.mjs. */
export const REQUIRED_SCOPES = ['read_orders', 'read_customers', 'read_products', 'read_reports', 'read_inventory', 'read_returns', 'read_analytics', 'read_discounts', 'read_price_rules', 'read_marketing_events', 'read_merchant_managed_fulfillment_orders'];
/** Does a granted scope list hold `s`? Shopify lists only write_x when both read_x and write_x are held (the read is
 *  implied), so a store that allowed product or discount updates holds read_products / read_discounts too. */
export const holdsScope = (granted, s) => {
  const g = granted instanceof Set ? granted : new Set(String(granted || '').split(',').map(x => x.trim()).filter(Boolean));
  return g.has(s) || (s.startsWith('read_') && g.has('write_' + s.slice(5)));
};
/** Required scopes a store does not hold yet (an empty list when it holds them all). */
export const missingScopes = granted => REQUIRED_SCOPES.filter(s => !holdsScope(granted, s));
/** Asked for inside the app, only by a store that wants them (shopify.app.toml optional_scopes). */
export const OPTIONAL_SCOPES = ['write_products', 'write_discounts'];
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
  /* exp is REQUIRED: Shopify always sends one, so a token without it is not Shopify's. */
  if (!Number.isFinite(claims.exp) || now > claims.exp + 10) return { error: 'expired' };
  if (claims.nbf && now < claims.nbf - 10) return { error: 'not yet valid' };
  if (claims.aud !== env.SHOPIFY_API_KEY) return { error: 'wrong app' };
  const shop = String(claims.dest || '').replace(/^https:\/\//, '').toLowerCase();
  if (!SHOP_RE.test(shop) || !String(claims.iss || '').startsWith(`https://${shop}`)) return { error: 'wrong shop' };
  return { shop, claims };
}

async function gql(F, shop, token, query, variables = {}) {
  const res = await F(`https://${shop}/admin/api/${API}/graphql.json`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': token }, body: JSON.stringify({ query, variables }) });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(`Shopify returned ${res.status}`), { status: res.status });
  if (j.errors?.length) throw Object.assign(new Error(j.errors.map(e => e.message).join('; ')), { status: /access denied|not approved|protected/i.test(JSON.stringify(j.errors)) ? 403 : 400 });
  return j.data || {};
}

/** Orders per page. Shopify refuses any single query that costs over 1,000 points, and an order with its money and
 *  ten line items costs about 15, so 250 a page (the old number) asked for about 3,750. 50 a page asks for about 750. */
const ORDERS_PAGE = 50, ORDERS_PAGES = 10;
const ORDERS_Q = `query($q: String!, $after: String) { orders(first: ${ORDERS_PAGE}, query: $q, after: $after, sortKey: CREATED_AT, reverse: true) { pageInfo { hasNextPage endCursor } nodes { createdAt currentTotalPriceSet { shopMoney { amount } } lineItems(first: 10) { nodes { title quantity } } } } }`;

/** The report: the store, its products and its orders, each read on its own so one refused read never blanks the
 *  other panels (review feedback 2.1.1 / 2.1.4, 2026-11-24: the reviewer saw three empty panels because the first
 *  read threw and took the whole report with it). Throws only when the token is dead (401, the caller swaps it) or
 *  when NOTHING could be read (the caller tries once more with a fresh token). */
export async function appReport(env, shop, token, days, F) {
  const n = [7, 30, 90].includes(+days) ? +days : 30;
  const since = new Date(Date.now() - n * 864e5).toISOString().slice(0, 10);
  const out = { days: n, since, notes: [] };
  let failed = 0, firstErr = null;
  const part = async fn => { try { return await fn(); } catch (e) { if (e.status === 401) throw e; failed++; firstErr ||= e; return null; } };

  const s = await part(() => gql(F, shop, token, `{ shop { name myshopifyDomain currencyCode primaryDomain { url } } }`));
  out.shop = { name: s?.shop?.name || shop.replace(/\.myshopify\.com$/, ''), domain: shop, url: s?.shop?.primaryDomain?.url || null, currency: s?.shop?.currencyCode || 'USD', products: null };

  const p = await part(() => gql(F, shop, token, `{ products(first: 25, sortKey: UPDATED_AT, reverse: true) { nodes { title status totalInventory priceRangeV2 { minVariantPrice { amount } } } } }`));
  out.products = (p?.products?.nodes || []).map(x => ({ title: x.title, status: String(x.status || '').toLowerCase(), stock: x.totalInventory, price: +x.priceRangeV2?.minVariantPrice?.amount || 0 }));
  if (!p) out.notes.push('Products could not be listed right now. Try Refresh.');
  /* The count is its own small read: if Shopify refuses it, the card shows how many are listed instead. */
  const c = p ? await gql(F, shop, token, `{ productsCount { count } }`).catch(e => { if (e.status === 401) throw e; return null; }) : null;
  out.shop.products = c?.productsCount?.count ?? (p ? out.products.length : null);

  try {
    const orders = []; let after = null, truncated = false, readAny = false;
    for (let i = 0; i < ORDERS_PAGES; i++) {
      let d;
      try { d = await gql(F, shop, token, ORDERS_Q, { q: `created_at:>=${since}`, after }); }
      catch (e) { if (!readAny || e.status === 401) throw e; truncated = true; break; }   // a later page was refused (rate limit): show what was read
      readAny = true;
      orders.push(...(d.orders?.nodes || []));
      if (!d.orders?.pageInfo?.hasNextPage) break;
      after = d.orders.pageInfo.endCursor;
      if (i === ORDERS_PAGES - 1) truncated = true;
    }
    const byDay = {}, top = {}; let revenue = 0;
    for (const o of orders) { const a = +o.currentTotalPriceSet?.shopMoney?.amount || 0; revenue += a; const k = String(o.createdAt).slice(0, 10); (byDay[k] ||= { orders: 0, revenue: 0 }); byDay[k].orders++; byDay[k].revenue += a; for (const li of o.lineItems?.nodes || []) top[li.title] = (top[li.title] || 0) + (+li.quantity || 0); }
    out.orders = { count: orders.length, revenue: Math.round(revenue * 100) / 100, aov: orders.length ? Math.round(revenue / orders.length * 100) / 100 : 0, truncated,
      days: Array.from({ length: n }, (_, i) => { const k = new Date(Date.now() - (n - 1 - i) * 864e5).toISOString().slice(0, 10); return { date: k, orders: byDay[k]?.orders || 0, revenue: Math.round((byDay[k]?.revenue || 0) * 100) / 100 }; }),
      top: Object.entries(top).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([title, qty]) => ({ title, qty })) };
    if (truncated) out.notes.push(`Showing the newest ${orders.length} orders in this period.`);
  } catch (e) {
    if (e.status === 401) throw e;
    failed++; firstErr ||= e;
    out.orders = null;
    out.notes.push(e.status === 403 ? 'Order numbers appear once Shopify approves this app\'s access to order data. Products are shown meanwhile.' : 'Orders could not be read right now. Try Refresh.');
  }
  /* Nothing at all came back: that is not a report. The caller tries once more with a fresh token. */
  if (failed >= 3) throw Object.assign(new Error(firstErr?.message || 'Shopify could not be read'), { status: firstErr?.status });
  return out;
}

const OPT_OFF = 'This app only reads your store. If you also want it to update products (status, title, tags, price) and create or switch off discount codes, you can allow that here. It is off until you turn it on, and you can remove it again at any time.';
const OPT_ON = 'This app can update products (status, title, tags, price) and create or switch off discount codes in your store. You can remove this access at any time.';
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
<h1 id="name">Mobius Digital</h1><p class="sub">Your store at a glance: sales, orders and products, read live from Shopify.</p>
<div class="bar"><label class="muted" for="days">Period</label><select id="days"><option value="7">Last 7 days</option><option value="30" selected>Last 30 days</option><option value="90">Last 90 days</option></select>
<button class="primary" id="refresh">Refresh</button></div>
<div id="notes"></div><div class="grid" id="kpis"></div>
<div class="card" id="chartCard" style="margin-bottom:12px"><div class="k">Sales by day</div><svg id="chart" viewBox="0 0 600 120" preserveAspectRatio="none"></svg></div>
<div class="grid" style="grid-template-columns:1fr 1fr"><div class="card"><div class="k">Best sellers (units)</div><table id="top"></table></div>
<div class="card"><div class="k">Products</div><table id="products"></table></div></div>
<div class="card" id="optCard" style="margin-top:12px" hidden><div class="k">Optional access</div>
<p style="margin:6px 0 10px" id="optText">This app only reads your store. If you also want it to update products (status, title, tags, price) and create or switch off discount codes, you can allow that here. It is off until you turn it on, and you can remove it again at any time.</p>
<button id="optAllow">Allow product and discount updates</button><button id="optRemove" hidden>Remove this access</button></div>
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
$('refresh').onclick=load;$('days').onchange=load;
/* Optional access: asked for here, by the store, never at install. The card stays hidden if App Bridge cannot say. */
const OPT=${JSON.stringify(OPTIONAL_SCOPES)};const OPT_OFF=${JSON.stringify(OPT_OFF)};const OPT_ON=${JSON.stringify(OPT_ON)};
async function opt(){try{const q=await shopify.scopes.query();const has=OPT.every(x=>(q.granted||[]).includes(x));
 $('optCard').hidden=false;$('optAllow').hidden=has;$('optRemove').hidden=!has;$('optText').textContent=has?OPT_ON:OPT_OFF;
}catch(e){$('optCard').hidden=true;}}
async function tell(){try{const t=await shopify.idToken();await fetch('/shopify/app/api/scopes',{method:'POST',headers:{Authorization:'Bearer '+t}});}catch(e){}}
$('optAllow').onclick=async()=>{try{await shopify.scopes.request(OPT);}catch(e){}await tell();opt();};
$('optRemove').onclick=async()=>{try{await shopify.scopes.revoke(OPT);}catch(e){}await tell();opt();};
load().then(tell);opt();
</script></body></html>`;
}

/** Token exchange (2026-11-15): with Shopify managed installation, Shopify shows the grant screen itself and then opens
 *  the embedded app; the app swaps the App Bridge session token for the store's OFFLINE token here. No redirects.
 *  Since 2026-11-24 it asks for the EXPIRING kind and returns the whole set {token, scope, refresh_token, expires_at,
 *  refresh_expires_at} (shoptoken.js). */
export async function exchangeToken(env, shop, sessionToken, F = fetch) {
  try { return await exchangeSessionToken(env, shop, sessionToken, F); }
  catch (e) { throw Object.assign(new Error(`token exchange ${e.status || ''}`.trim()), { status: e.status }); }
}

/** Opened with no store in the address (a bookmark, a pasted link): one plain line, never a page that cannot load. */
const NO_SHOP = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Mobius Digital</title></head><body style="margin:0;background:#f1f2f4;color:#303030;font:15px/1.5 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif"><main style="max-width:520px;margin:15vh auto;padding:24px;background:#fff;border-radius:12px"><h1 style="font-size:20px;margin:0 0 8px">Mobius Digital</h1><p style="margin:0">Open this app from Apps in your Shopify admin.</p></main></body></html>`;

/** Routes; returns null when the path is not ours. `saveToken(shop, tokenSet)` stores a newly exchanged token set the
 *  same way the classic callback does (worker.js), so a store connected either way looks the same to Locus. */
export async function handleShopifyApp(request, env, url, { F = fetch, saveToken } = {}) {
  if (url.pathname === '/shopify/app') {
    const shop = String(url.searchParams.get('shop') || '').toLowerCase();
    const frame = `frame-ancestors ${SHOP_RE.test(shop) ? `https://${shop} ` : ''}https://admin.shopify.com;`;
    if (!env.SHOPIFY_API_KEY) return new Response('The app is being set up. Please try again shortly.', { status: 200, headers: { 'Content-Type': 'text/plain' } });
    /* Opened outside the admin (no `embedded=1`): send it into the admin, where Shopify handles the install and grant
       (managed installation) and then frames this page. Inside the frame the page itself connects the store. */
    if (!SHOP_RE.test(shop)) return new Response(NO_SHOP, { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Content-Security-Policy': frame, 'Cache-Control': 'no-store' } });
    if (url.searchParams.get('embedded') !== '1') return Response.redirect(`https://${shop}/admin/apps/${env.SHOPIFY_API_KEY}`, 302);
    return new Response(page(env.SHOPIFY_API_KEY), { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Content-Security-Policy': frame, 'Cache-Control': 'no-store' } });
  }
  if (url.pathname === '/shopify/app/api/report' || url.pathname === '/shopify/app/api/scopes') {
    const json = (o, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
    const tok = String(request.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
    const v = await verifySessionToken(env, tok);
    if (v.error) return json({ error: 'Please open the app from Apps in your Shopify admin.' }, 401);
    let fresh = false;   // true once a token was exchanged in this request
    const connect = async () => {
      const x = await exchangeToken(env, v.shop, tok, F);
      fresh = true;
      if (saveToken) await saveToken(v.shop, x);
      else await env.DB.prepare(`UPDATE p_shopify SET access_token = ?2, refresh_token = ?3, expires_at = ?4, refresh_expires_at = ?5, uninstalled_at = NULL WHERE shop = ?1`).bind(v.shop, x.token, x.refresh_token, x.expires_at, x.refresh_expires_at).run().catch(() => {});
      return x.token;
    };
    const forget = () => env.DB.prepare(`UPDATE p_shopify SET access_token = '', refresh_token = NULL, expires_at = NULL, refresh_expires_at = NULL WHERE shop = ?1`).bind(v.shop).run().catch(() => {});
    /* shopToken refreshes a token that is about to run out. A throw means Shopify did not answer the refresh; the
       session token in hand can simply buy a new one. */
    let access = await shopToken(env, v.shop, { F }).catch(() => null);
    try {
      if (!access) access = await connect();
      if (url.pathname === '/shopify/app/api/scopes') {
        /* The store just allowed or removed the optional access. Ask Shopify what the app holds now and store that,
           so Locus offers a change only where the store said yes. */
        if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
        const d = await gql(F, v.shop, access, `{ currentAppInstallation { accessScopes { handle } } }`);
        const scopes = (d.currentAppInstallation?.accessScopes || []).map(x => x.handle).filter(Boolean).join(',');
        /* The store just accepted a REQUIRED scope it did not hold before (Shopify asked when the app opened after a
           scope change): buy a fresh token once, so nothing keeps reading with one issued under the old grant. */
        const was = await env.DB.prepare(`SELECT scopes FROM p_shopify WHERE shop = ?1`).bind(v.shop).first().catch(() => null);
        const had = String(was?.scopes || '');
        if (!fresh && was && REQUIRED_SCOPES.some(s => holdsScope(scopes, s) && !holdsScope(had, s))) await connect().catch(() => {});
        if (scopes) await env.DB.prepare(`UPDATE p_shopify SET scopes = ?2 WHERE shop = ?1`).bind(v.shop, scopes).run().catch(() => {});
        return json({ ok: true, scopes: scopes ? scopes.split(',') : [] });
      }
      try { return json(await appReport(env, v.shop, access, url.searchParams.get('days'), F)); }
      catch (e) {
        /* 401: the stored token is dead (reinstalled, or access taken back). Anything else that left the report with
           nothing to show: the stored token may be one Shopify no longer reads with (a reinstall whose uninstall
           notice never reached us, an old never-expiring token). Either way the session token in hand buys a fresh
           one, once. A token exchanged in THIS request is already fresh, so that case is not repeated. */
        console.error('shopify app report failed', v.shop, e.status || '', e.message || '');
        if (fresh) throw e;
        if (e.status === 401) await forget();   // otherwise keep the old pair until the new one is saved over it
        return json(await appReport(env, v.shop, await connect(), url.searchParams.get('days'), F));
      }
    } catch (e) {
      console.error('shopify app gave up', v.shop, e.status || '', e.message || '');
      return json({ error: e.message?.startsWith('token exchange') ? 'Could not connect your store just now. Close and reopen the app.' : 'Shopify did not answer just now. Try Refresh.' });
    }
  }
  return null;
}
export const _test = { page };

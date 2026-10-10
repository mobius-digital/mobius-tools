/* Stock, Buying and Drops in Locus (2026-10-08). Supply's screens, rebuilt inside Locus.
 *
 * THREE LEVELS, switched per brand (docs/handoffs/supply-into-locus-plan.md):
 *   1. Stock   every brand with a stock feed. Framed for the ADS, not for buying: what to ease off
 *              (runs out by Cyber Monday or before its restock), what is safe to scale, what to push
 *              because it sits. No setup beyond the Mobius Digital Shopify app.
 *   2. Buying  brands we buy for (brands.buys). One card per factory order to place, orders on the way.
 *   3. Drops   brands that design products (brands.makes). Drops, designs, keep or cut, Asana.
 *
 * Data: the Supply worker (its D1 and brain, unchanged) for stock and decisions, called directly with
 * the Mobius Google session like meta.js calls account-health; the profit worker's
 * /api/hub/stockads for which products each ad sells (Triple Whale orders, never ad names).
 * The brain is the only place a status or a date is computed: this file draws `state`.
 *
 * LOOK (2026-10-09 redesign, Cole: "how long the stock lasts looks super weird", "text overlapping",
 * "I can't hover over anything"): the Locus v2 system. Pages are `.v2 .spx`, built from window.V2UI
 * (tile, spark, ib, panel as a sheet), the shared PillMenu, ds- buttons and chips, v2 tables with
 * sortable headers, skeletons on a first load, empty states. Stock = tiles + ONE sortable table; a
 * product opens a sheet with ONE chart (projected units, restock steps, the first core size out, hover
 * per day). Buying = order cards + a stage stepper per order on the way. Drops = a stepper for the drop,
 * a design table, and keep or cut as a table with the rule in a sentence and one-colour bars.
 * Clients may see Stock later (read only), so its copy explains every term in plain words.
 *
 * CLIENTS (2026-10-10, Cole: "why doesn't the client have access to drops?"): a client login sees Stock and Drops for
 * its own brand, READ ONLY. `isClient()` reads through account-health `/api/supply/client` (one brand, costs, suppliers,
 * order money, notes and Asana stripped there), never Supply directly; every edit control is hidden and Buying never
 * shows. The server refuses the rest (brandguard CLIENT_RULES), so hiding a button here is only the drawing. */
(() => {
  const SUP = 'https://mobius-supply.mobius-digital.workers.dev';
  let H = null;
  const $ = s => document.querySelector(s);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const int = n => n == null || !isFinite(n) ? '–' : Math.round(n).toLocaleString('en-US');
  const one = n => n == null || !isFinite(n) ? '–' : (Math.round(n * 10) / 10).toLocaleString('en-US');
  const money = n => n == null || !isFinite(n) ? '–' : (n < 0 ? '-' : '') + '$' + (Math.abs(n) >= 1000 ? (Math.abs(n) / 1000).toFixed(Math.abs(n) >= 100000 ? 0 : 1) + 'K' : Math.round(Math.abs(n)));
  const moneyFull = n => n == null || !isFinite(n) ? '–' : '$' + Math.round(n).toLocaleString('en-US');
  const day = (ymd, y) => ymd ? new Date(ymd + 'T12:00:00Z').toLocaleDateString('en-US', { month: 'short', day: 'numeric', ...(y ? { year: 'numeric' } : {}), timeZone: 'UTC' }) : '–';
  const wday = ymd => ymd ? new Date(ymd + 'T12:00:00Z').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' }) : '–';
  const add = (ymd, n) => { const d = new Date(ymd + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
  const between = (a, b) => Math.round((Date.parse(b + 'T12:00:00Z') - Date.parse(a + 'T12:00:00Z')) / 864e5);
  const plural = (n, w, ws) => `${int(n)} ${n === 1 ? w : (ws || w + 's')}`;
  const tip = t => ` data-v2tip="${esc(t)}"`;
  const pill = (k, t) => `<span class="sp-pill ${k}"><i></i>${esc(t)}</span>`;
  const H_DAYS = 180;
  const UI = () => window.V2UI;
  const ic = (n, s = 16) => (window.icon ? window.icon(n, { size: s }) : '');
  const btn = (label, attrs = '', kind = '') => `<button type="button" class="ds-btn${kind ? ' ' + kind : ''}" ${attrs}>${label}</button>`;
  const empty = (icn, line, more = '') => `<div class="ds-empty"><i>${ic(icn, 20)}</i><span>${line}</span>${more}</div>`;
  /* A pace a person can read: 8.3 a day, 0.4 a day, under 0.1 a day. */
  const perDay = v => v == null || !isFinite(v) || v <= 0.001 ? '–' : v < 0.1 ? 'under 0.1' : v >= 10 ? int(v) : one(v);
  const LSG = (k, d) => { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } };
  const LSS = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };

  function toast(msg, err) {
    let t = document.getElementById('sptoast');
    if (!t) { t = document.body.appendChild(Object.assign(document.createElement('div'), { id: 'sptoast' })); t.setAttribute('role', 'status'); }
    t.className = 'lx-toast' + (err ? ' bad' : ''); t.textContent = msg; t.hidden = true; void t.offsetWidth; t.hidden = false;
    clearTimeout(toast.t); toast.t = setTimeout(() => { t.hidden = true; }, err ? 5000 : 2600);
  }

  /* ---------- the Supply worker ---------- */
  const token = () => { const t = localStorage.getItem('mobius_session'), e = +localStorage.getItem('mobius_session_exp') || 0; return t && (e === 0 || e > Date.now()) ? t : (H && H.S.tok) || ''; };
  const actor = () => localStorage.getItem('mobius_session_email') || '';
  const isClient = () => !!(H && H.S && H.S.role === 'client');
  /* A client reads only, through account-health (brand list and state), with its own Locus session. */
  const actOfSup = brand => ((BRANDS || []).find(b => b.id === brand) || {}).act_id || (H && H.S.act);
  async function capi(brand, path, opts = {}) {
    if ((opts.method || 'GET') !== 'GET' || !['/api/state', '/api/brands'].includes(path)) throw new Error('Stock is read only on your login. Ask Mobius if something needs changing.');
    return H.apiAH(`/api/supply/client?act=${encodeURIComponent(actOfSup(brand))}&what=${path === '/api/brands' ? 'brands' : 'state'}`);
  }
  async function sapi(brand, path, opts = {}) {
    if (isClient()) return capi(brand, path, opts);
    const res = await fetch(`${SUP}${path}${path.includes('?') ? '&' : '?'}brand=${encodeURIComponent(brand)}`, {
      method: opts.method || 'GET',
      headers: { 'Authorization': `Bearer ${token()}`, 'Content-Type': 'application/json', 'X-Actor': actor() },
      body: opts.body ? JSON.stringify(opts.body) : undefined,
    });
    const j = await res.json().catch(() => ({}));
    if (res.status === 401) throw new Error('Stock needs the Google sign-in. Sign out of Locus and sign back in with Google.');
    if (!res.ok) throw new Error(j.error || `Stock answered ${res.status}`);
    return j;
  }
  let BRANDS = null, BRANDS_P = null;
  function loadBrands() {
    if (BRANDS_P) return BRANDS_P;
    const first = !BRANDS;
    /* A client asks once per brand of its own (the server names the Locus brand as act_id). */
    const get = isClient() ? Promise.all((H.S.accounts || []).map(a => H.apiAH(`/api/supply/client?act=${encodeURIComponent(a.act_id)}&what=brands`).catch(() => ({ brands: [] }))))
      .then(rs => ({ brands: rs.flatMap(r => r.brands || []) })) : sapi('lucky', '/api/brands');
    BRANDS_P = get.then(r => {
      BRANDS = (r.brands || []).filter(b => b.active && b.act_id);
      /* The page tabs were drawn before the list arrived: draw them again once, now they can be right. */
      if (first && H && ['stock', 'buying', 'drops'].includes(H.S.tab)) setTimeout(() => H.show(H.S.tab), 0);
      return BRANDS;
    }).catch(e => { BRANDS_P = null; throw e; });
    return BRANDS_P;
  }
  /* Supply's brands.act_id is the Locus BRAND id (brand_lucky_golf) since brand-first phase 3. A row still
     holding an old id (act_..., written before the data was moved) is read through the host's resolveAct. */
  const locusId = id => { try { return (H && typeof window.resolveAct === 'function' && window.resolveAct(id, H.S.accounts)) || id; } catch { return id; } };
  const brandOf = act => (BRANDS || []).find(b => b.act_id === act || locusId(b.act_id) === act) || null;
  const STATE = new Map();
  function state(brand, fresh) {
    const hit = STATE.get(brand);
    if (!fresh && hit && Date.now() - hit.at < 2 * 60e3) return hit.p;
    const p = sapi(brand, '/api/state'); STATE.set(brand, { at: Date.now(), p });
    p.catch(() => STATE.delete(brand));
    return p;
  }
  const ADS = new Map();
  function stockAds(act) {
    const hit = ADS.get(act);
    if (hit && Date.now() - hit.at < 10 * 60e3) return hit.p;
    const p = H.api(`/api/hub/stockads?act=${encodeURIComponent(act)}`).then(r => (r.brands || [])[0] || null).catch(() => null);
    ADS.set(act, { at: Date.now(), p });
    return p;
  }
  /** Save, then refresh what the save changed and redraw the open page. */
  async function save(brand, path, body, method = 'PUT', ok = 'Saved') {
    try { const r = await sapi(brand, path, { method, body }); STATE.delete(brand); if (ok) toast(ok); return r; }
    catch (e) { toast(e.message, true); throw e; }
  }
  const redraw = () => H && H.show(H.S.tab);

  /* ---------- the stock judgement every brand gets ---------- */
  /* Black Friday and Cyber Monday of the season ahead (the 4th Thursday of November, plus 1 and 4). */
  function season(today) {
    const y = +today.slice(0, 4);
    const bf = yr => { const d = new Date(Date.UTC(yr, 10, 1)); const thu = (4 - d.getUTCDay() + 7) % 7; return add(new Date(Date.UTC(yr, 10, 1 + thu + 21)).toISOString().slice(0, 10), 1); };
    let b = bf(y); if (add(b, 3) < today) b = bf(y + 1);
    return { bf: b, cm: add(b, 3), bfd: between(today, b), cmd: between(today, add(b, 3)) };
  }
  function judge(st, ads) {
    const SE = season(st.today);
    const ap = id => (ads && ads.products && ads.products[id]) || null;
    const tied = p => Math.max(0, p.onHand) * (p.cost || 0);
    const heavy = p => (p.weeksOfCover != null && p.weeksOfCover > 52) || (p.velocity <= 0.001 && p.onHand >= 20);
    const runway = p => {
      if (p.velocity <= 0.001) return { days: null };
      const d = p.status === 'out' ? 0 : (p.runOutDays ?? 0), L = p.incomingLands ? between(st.today, p.incomingLands) : null;
      const gap = L != null && L > d ? L - d : 0;
      const after = L != null ? Math.round((Math.max(0, p.onHand - p.velocity * L) + (p.incoming || 0)) / p.velocity) : 0;
      return { days: d, land: L, gap, after, cover: L != null && L <= d };
    };
    const call = p => {
      if (['off', 'drop_done'].includes(p.status)) return 'quiet';
      const r = runway(p);
      if (r.days == null) return heavy(p) ? 'clear' : 'quiet';
      if (p.status === 'out' || (r.days < 30 && !r.cover)) return 'ease';
      if (r.days <= SE.cmd && !r.cover) return 'ease';
      if (heavy(p)) return 'clear';
      if (r.days >= 90 || r.cover) return 'scale';
      return 'watch';
    };
    const live = st.products.filter(p => p.status !== 'off' && (p.velocity > 0.001 || p.onHand > 0));
    const by = k => live.filter(p => call(p) === k);
    const spend = p => (ap(p.id) || {}).spend || 0;
    const ease = by('ease').sort((a, b) => spend(b) - spend(a) || (runway(a).days ?? 0) - (runway(b).days ?? 0));
    const scale = by('scale').sort((a, b) => b.sold90 - a.sold90);
    const clear = by('clear').sort((a, b) => tied(b) - tied(a));
    return { SE, ap, tied, heavy, runway, call, live, ease, scale, clear, spend,
      easeSpend: ease.reduce((a, p) => a + spend(p), 0), scaleSpend: scale.reduce((a, p) => a + spend(p), 0),
      out: st.products.filter(p => p.status === 'out').length,
      byCM: live.filter(p => { const r = runway(p); return r.days != null && r.days <= SE.cmd && !r.cover; }).length,
      tiedUp: clear.reduce((a, p) => a + tied(p), 0) };
  }
  const CALL = { ease: ['bad', 'Ease off'], scale: ['good', 'Safe to scale'], clear: ['warn', 'Push to clear'], watch: ['n', 'Watch'], quiet: ['n', 'Not selling'] };
  const CALL_ORDER = { ease: 0, watch: 1, scale: 2, clear: 3, quiet: 4 };
  const CALL_MEANS = {
    ease: 'Runs out within 30 days, or by Cyber Monday, and no restock lands first. Move ad money to products that can take it.',
    scale: 'Three months of stock or more, or a restock lands before it runs out. Room to spend more.',
    clear: 'Over a year of stock at today\'s pace, or 20+ units with no sale in 90 days. Worth a promotion, a bundle or an ad test.',
    watch: 'Fine for now. It turns to Ease off if no restock is placed in time.',
    quiet: 'No sales in the last 90 days, or a limited drop that sells out on purpose.' };
  const callChip = (c, p) => { const [k, l] = CALL[c]; const lab = c === 'quiet' && p && p.lifecycle === 'drop' ? 'Limited drop' : l; return `<span class="ds-chip spx-call ${k === 'n' ? '' : k}"${tip(CALL_MEANS[c])}>${esc(lab)}</span>`; };
  const av = p => `<span class="sp-av"${p.image ? ` style="background-image:url('${esc(p.image)}')"` : ''}>${p.image ? '' : esc(p.title.split(/\s+/).map(w => w[0]).join('').slice(0, 2))}</span>`;
  /* The first CORE size to hit zero: the size that sets the product's run-out date (the brain's rule). */
  const firstCore = p => (p.variants || []).filter(v => v.isCore && v.velocity > 0.001).sort((a, b) => (a.onHand <= 0 ? -1 : a.runOutDays ?? 9e9) - (b.onHand <= 0 ? -1 : b.runOutDays ?? 9e9))[0] || null;
  const sizeName = v => { if (!v) return 'a size'; const n = v.axis || v.sku || v.title || 'a size'; return /^(right|left)$/i.test(n) ? n + ' hand' : n; };
  /* Units sold a week across products, the last 12 weeks (each variant's `series` is 90 days, oldest first). */
  function weekly(ps, today) {
    const d = Array(90).fill(0);
    for (const p of ps) for (const v of p.variants || []) (v.series || []).forEach((n, i) => { if (i < 90) d[i] += n || 0; });
    const out = [], tips = [];
    for (let w = 0; w < 12; w++) { const s = 6 + w * 7; const sum = d.slice(s, s + 7).reduce((a, x) => a + x, 0); out.push(sum); tips.push(`<b>Week of ${day(add(today, s - 90))}</b> · ${int(sum)} sold`); }
    return { vals: out, tips };
  }
  const spk = (ps, today) => { if (!ps.length || !UI()) return ''; const w = weekly(ps, today); return UI().spark(w.vals, null, 300, 34, w.tips); };

  /* ---------- page frame ---------- */
  const frame = (tab, title, body) => `<div class="v2 spx">${H.pageHead(tab, title).replace(/<p class="ph-sub">[\s\S]*?<\/p>/, '')}${body}</div>`;
  const skel = () => `<p class="v2say lead v2sk"><i class="r"></i></p><div class="v2tiles v2sk">${'<div class="v2tile"><i class="a"></i><i class="b"></i><i class="c"></i></div>'.repeat(4)}</div><section class="v2card v2sk"><i class="h"></i>${'<i class="r"></i>'.repeat(8)}</section>`;
  const msg = (tab, title, html) => { $('#main').innerHTML = frame(tab, title, `<section class="v2card">${html}</section>`); };
  const loading = (tab, title) => { $('#main').innerHTML = frame(tab, title, skel()); };
  const fail = (tab, title, e) => msg(tab, title, `<p class="v2bad">${esc(e.message)}</p>`);
  const noFeed = (tab, name) => msg(tab, tab === 'stock' ? 'Stock' : tab === 'buying' ? 'Buying' : 'Drops', tab === 'stock'
    ? empty('package', `<b>${esc(name)} has no stock feed yet.</b><br>Stock reads itself from Shopify once the brand installs the Mobius Digital Shopify app. Then this page shows what to ease off in ads, what is safe to scale and what to push, with no other setup.`)
    : empty(tab === 'buying' ? 'factory' : 'layers', `<b>${tab === 'buying' ? 'Buying' : 'Drops'} is off for ${esc(name)}.</b><br>${tab === 'buying' ? 'Buying is for brands we buy stock for: factories, order dates and quantities.' : 'Drops is for brands that design their own products: drops, designs and keep or cut.'}`, isClient() ? '' : btn('Open Stock and factories', 'data-sp-set="1"')));
  /* "Is this up to date?" answered on every page: when Shopify was last read, and a Refresh that reads it now. */
  function asOf(st) {
    const t = new Date(st.lastRun || st.generatedAt); if (isNaN(t)) return '';
    const o = { timeZone: 'America/Chicago' };
    const sameDay = t.toLocaleDateString('en-US', o) === new Date().toLocaleDateString('en-US', o);
    return `${sameDay ? 'today' : t.toLocaleDateString('en-US', { ...o, month: 'short', day: 'numeric' })} at ${t.toLocaleTimeString('en-US', { ...o, hour: 'numeric', minute: '2-digit' })} Central`;
  }
  const updated = (st, what) => `<div class="spx-upd"><span>${ic('clock', 14)}${what} ${esc(asOf(st))}.</span>${isClient() ? '' : btn(`${ic('refresh', 14)}Refresh`, 'data-sp-refresh="1" aria-label="Read Shopify again and redraw"', 'sm ghost')}</div>`;
  function wireCommon(root) {
    root.querySelectorAll('[data-sp-set]').forEach(b => b.onclick = () => openStockSettings());
    root.querySelectorAll('[data-sp-p]').forEach(el => {
      const go = e => { if (e.target.closest('button,a,input,select')) return; e.stopPropagation(); openProduct(el.dataset.spP); };
      el.onclick = go; if (el.tagName === 'TR') el.tabIndex = 0; el.onkeydown = e => { if (e.key === 'Enter' && e.target === el) go(e); };
    });
    root.querySelectorAll('[data-sp-go]').forEach(el => el.onclick = () => H.show(el.dataset.spGo));
    root.querySelectorAll('[data-sp-refresh]').forEach(b => b.onclick = async () => {
      if (!CUR) return; b.disabled = true; b.innerHTML = `${ic('refresh', 14)}Reading Shopify…`;
      try { await sapi(CUR.brand.id, '/api/shopify/snapshot', { method: 'POST' }); } catch { /* the cached read still redraws */ }
      STATE.delete(CUR.brand.id); ADS.delete(H.S.act); redraw();
    });
  }
  function openStockSettings() { try { localStorage.setItem('pf_set_bsec', 'stock'); } catch {} H.show('settings'); }
  let CUR = null;   // { brand, st, ads, J } of the open page, for the sheets

  /* ===================================================================================
   * STOCK (every brand with a feed; All clients = one row per brand)
   * ================================================================================= */
  const SF = { get: () => LSG('sp_sf', 'all'), set: v => LSS('sp_sf', v) };
  const SA = { get: () => LSG('sp_sa', false), set: v => LSS('sp_sa', v) };
  const SS = { get: () => LSG('sp_ss', { k: 'days', d: 1 }), set: v => LSS('sp_ss', v) };
  async function renderStock(first) {
    const tab = 'stock';
    if (first || !$('#main .spx')) loading(tab, 'Stock');
    try { await loadBrands(); } catch (e) { return fail(tab, 'Stock', e); }
    const act = H.S.act;
    if (act === 'all') return agency(first);
    const b = brandOf(act);
    if (!b) return noFeed(tab, (H.S.accounts.find(a => a.act_id === act) || {}).name || 'This brand');
    const run = H.RUN();
    let st, ads;
    try { [st, ads] = await Promise.all([state(b.id), stockAds(act)]); } catch (e) { return fail(tab, 'Stock', e); }
    if (run !== H.RUN()) return;
    const J = judge(st, ads); CUR = { brand: b, st, ads, J };
    const top = J.ease[0], tr = top ? J.runway(top) : null;
    const lead = top ? `<b>${esc(top.title)}</b> ${J.spend(top) ? 'carries the most ad spend of the products running low and ' : ''}${top.status === 'out' ? 'is out of stock' : `runs out ${day(top.runOutDate)}`}${tr.gap ? `, ${tr.gap} days before its restock lands` : tr.land == null ? ', with nothing on order' : ''}.`
      : J.scale.length ? 'Stock covers everything we advertise.' : 'Nothing is running low.';
    const mapped = ads ? ads.mapped : 0;
    const T = (f, html) => html.replace('<div class="v2tile', `<div data-sp-f="${f}" role="button" tabindex="0" class="v2tile`);
    const tiles = UI() ? [
      UI().tile({ label: 'Ad spend on low stock', value: money(J.easeSpend), sub: ads ? `Last 30 days, of ${money(mapped)} of Meta spend that ties to a product. Matched through Triple Whale orders, never ad names.` : 'Ad data is not available right now.' }),
      T('ease', UI().tile({ label: 'Ease off', value: `${J.ease.length}<small class="spx-u">products</small>`, sub: `${J.out} out now. Run out before Cyber Monday (${day(J.SE.cm)}) or before their restock.`, spark: spk(J.ease, st.today) })),
      T('scale', UI().tile({ label: 'Safe to scale', value: `${J.scale.length}<small class="spx-u">products</small>`, sub: '3+ months of stock, or a restock lands in time.', spark: spk(J.scale, st.today) })),
      T('clear', isClient() ? UI().tile({ label: 'Push to clear', value: `${J.clear.length}<small class="spx-u">products</small>`, sub: `${int(J.clear.reduce((a, p) => a + Math.max(0, p.onHand), 0))} units with over a year of stock, or sitting unsold.`, spark: spk(J.clear, st.today) })
        : UI().tile({ label: 'Push to clear', value: money(J.tiedUp), sub: `${plural(J.clear.length, 'product')} with over a year of stock, at cost.`, spark: spk(J.clear, st.today) })),
    ].join('') : '';
    $('#main').innerHTML = frame(tab, 'Stock', `
      <p class="v2say lead">${lead}</p>
      ${updated(st, 'Stock read from Shopify')}
      <div class="v2tiles">${tiles}</div>
      <section class="v2card" id="spxStockCard"></section>
      ${defs()}`);
    const root = $('#main');
    root.querySelectorAll('[data-sp-f]').forEach(t => { const go = e => { e.stopPropagation(); SF.set(SF.get() === t.dataset.spF ? 'all' : t.dataset.spF); paintStockTable(); document.getElementById('spxStockCard').scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }; t.onclick = go; t.onkeydown = e => { if (e.key === 'Enter') go(e); }; });
    paintStockTable();
    wireCommon(root);
    const pend = PENDING.take('product'); if (pend) openProduct(pend);
  }
  /* The one table: every product, sortable, filtered by its ad call. Repaints in place (no scroll jump). */
  function paintStockTable() {
    const host = document.getElementById('spxStockCard'); if (!host || !CUR) return;
    const { st, J } = CUR;
    const f = SF.get(), adv = SA.get(), s = SS.get();
    const rows = J.live.map(p => { const r = J.runway(p); return { p, r, c: J.call(p), days: r.days, ads: J.spend(p) }; });
    const count = k => rows.filter(x => x.c === k).length;
    let list = rows.filter(x => f === 'all' || x.c === f);
    if (adv) list = list.filter(x => x.ads > 0);
    const val = {
      name: x => x.p.title.toLowerCase(), onHand: x => x.p.onHand, sold: x => x.p.velocity, days: x => x.days ?? 1e6, out: x => x.days ?? 1e6,
      land: x => x.p.incomingLands || '9999', ads: x => x.ads, call: x => CALL_ORDER[x.c] * 1e6 + (x.days ?? 1e5) };
    const g = val[s.k] || val.days;
    list.sort((a, b) => { const A = g(a), B = g(b); return (A < B ? -1 : A > B ? 1 : 0) * s.d || a.p.title.localeCompare(b.p.title); });
    const COLS = [
      ['name', 'Product', 'The product and its group.'],
      ['onHand', 'On hand', 'Units in Shopify now, every size added up.'],
      ['sold', 'Sold per day', 'The pace we plan on: the last 14, 30 and 90 days blended, ignoring days a size was empty.'],
      ['days', 'Days left', 'Days until the first core size (a size that makes up most of the sales) hits zero at that pace.'],
      ['out', 'Runs out on', 'The date the first core size hits zero. Other sizes can still be on the shelf.'],
      ['land', 'Restock landing', 'When the next order on its way arrives, and how many units.'],
      ['ads', 'Ads, 30 days', 'Meta spend on ads whose orders contain this product, last 30 days (Triple Whale orders).'],
      ['call', 'Ad call', 'What to do with the ads: Ease off, Safe to scale, Push to clear or Watch.']];
    const th = ([k, l, t]) => `<th class="v2srt"${tip(t)}><button type="button" data-sort="${k}">${l}${s.k === k ? `<span class="spx-arr">${s.d > 0 ? '↑' : '↓'}</span>` : ''}</button></th>`;
    const daysColor = c => c === 'ease' ? '--bad' : c === 'watch' ? '--warn' : c === 'scale' ? '--good' : '--faint';
    const tr = ({ p, r, c, days, ads }) => {
      const fc = firstCore(p);
      const sizeFirst = fc && p.variants.length > 1 && days != null && days < H_DAYS && p.onHand > p.velocity * Math.max(days, 1) * 1.5;
      const dCell = days == null ? '<span class="spx-mut">not selling</span>' : UI() ? UI().ib(Math.min(days, H_DAYS), H_DAYS, daysColor(c), days === 0 ? 'Out' : days > H_DAYS ? '180+' : int(days), `${days === 0 ? 'Out now' : `${int(days)} days at ${perDay(p.velocity)} a day`}`) : int(days);
      const oCell = p.status === 'out' || days === 0 ? '<b class="spx-bad">Out now</b>' : days == null ? '–' : days > H_DAYS ? '6+ months' : `${day(p.runOutDate)}${sizeFirst ? `<span class="sub"${tip(`${int(p.onHand)} units are on hand in total, but the ${sizeName(fc)} (a core size) hits zero first. From that day the product is short of a size people buy.`)}>${esc(sizeName(fc))} first</span>` : ''}`;
      const lCell = p.incomingLands ? `${day(p.incomingLands)}<span class="sub">+${int(p.incoming)}${r.gap ? ` · <b class="spx-bad">${r.gap} days short first</b>` : ''}</span>` : '<span class="spx-mut">nothing on order</span>';
      return `<tr class="link" data-sp-p="${esc(p.id)}"><td><div class="spx-pn">${av(p)}<div><b>${esc(p.title)}</b><span>${esc(p.lineName || 'Not in a group')}</span></div></div></td>
        <td>${int(p.onHand)}${p.oversold ? `<span class="sub spx-bad">${p.oversold} oversold</span>` : ''}</td>
        <td>${perDay(p.velocity)}${p.velocity > 0.001 ? `<span class="sub">${one(p.velocity * 7)} a week</span>` : ''}</td>
        <td>${dCell}</td><td>${oCell}</td><td>${lCell}</td>
        <td>${ads ? money(ads) : '<span class="spx-mut">–</span>'}</td><td>${callChip(c, p)}</td></tr>`;
    };
    const segs = [['all', 'All', rows.length], ['ease', 'Ease off', count('ease')], ['watch', 'Watch', count('watch')], ['scale', 'Safe to scale', count('scale')], ['clear', 'Push to clear', count('clear')]];
    host.innerHTML = `<div class="v2h"><h3>Every product</h3><span class="find">${f === 'all' ? 'Sorted by how soon each runs out.' : esc(CALL_MEANS[f])} Click a product for its chart and sizes.</span></div>
      <div class="spx-bar"><div class="ds-seg" role="tablist" aria-label="Show">${segs.map(([k, l, n]) => `<button type="button" role="tab" aria-selected="${f === k}" class="${f === k ? 'on' : ''}" data-sf="${k}">${l} <span class="spx-n">${n}</span></button>`).join('')}</div>
        <button type="button" class="ds-chip ${adv ? 'on' : ''}" data-sa="1" aria-pressed="${adv}">${adv ? ic('check', 14) : ''}Only products with ads</button></div>
      ${list.length ? `<div class="v2tbl spx-tbl"><table><thead><tr>${COLS.map(th).join('')}</tr></thead><tbody>${list.map(tr).join('')}</tbody></table></div>`
        : empty('inbox', 'Nothing here with this filter.', btn('Show every product', 'data-sf="all"'))}
      <p class="v2foot">Pace is the last 90 days, before any Black Friday lift. Black Friday is ${day(J.SE.bf)}, ${J.SE.bfd} days away.</p>`;
    host.querySelectorAll('[data-sf]').forEach(b => b.onclick = () => { SF.set(b.dataset.sf); if (b.dataset.sf === 'all') SA.set(false); paintStockTable(); });
    host.querySelector('[data-sa]').onclick = () => { SA.set(!SA.get()); paintStockTable(); };
    host.querySelectorAll('[data-sort]').forEach(b => b.onclick = () => { const k = b.dataset.sort, cur = SS.get(); SS.set({ k, d: cur.k === k ? -cur.d : (['ads', 'onHand', 'sold'].includes(k) ? -1 : 1) }); paintStockTable(); });
    wireCommon(host);
  }
  /* Every word on the page, once, in plain words (clients may read this page). */
  const defs = () => `<section class="v2card spx-defs"><div class="v2h"><h3>What the words mean</h3></div><dl>
      <div><dt>Days left and Runs out on</dt><dd>When the first <b>core size</b> hits zero at today's pace. A product can still have plenty of units in other sizes; from that day it is short of a size people buy, so ads lose sales.</dd></div>
      <div><dt>Core size</dt><dd>The sizes that make up 80% of a product's sales. The rest are tail sizes and do not set the run-out date.</dd></div>
      <div><dt>Sold per day</dt><dd>The last 14, 30 and 90 days blended (45, 35 and 20 percent), ignoring days a size was empty, with a promo spike capped at twice the 90-day rate.</dd></div>
      <div><dt>Restock landing</dt><dd>When the next factory order on its way arrives. "Days short first" is the gap between running out and that landing.</dd></div>
      <div><dt>${callChip('ease')}</dt><dd>${CALL_MEANS.ease}</dd></div>
      <div><dt>${callChip('scale')}</dt><dd>${CALL_MEANS.scale}</dd></div>
      <div><dt>${callChip('clear')}</dt><dd>${CALL_MEANS.clear}</dd></div>
      <div><dt>${callChip('watch')}</dt><dd>${CALL_MEANS.watch}</dd></div>
    </dl></section>`;

  /* ---------- All clients ---------- */
  async function agency(first) {
    const tab = 'stock';
    if (first || !$('#main .spx')) loading(tab, 'Stock');
    const accts = (H.S.accounts || []).slice().sort((a, b) => a.name.localeCompare(b.name));
    const run = H.RUN();
    const rows = await Promise.all(accts.map(async a => {
      const b = brandOf(a.act_id);
      if (!b) return { a, b: null };
      try { const [st, ads] = await Promise.all([state(b.id), stockAds(a.act_id)]); return { a, b, J: judge(st, ads), ads }; } catch (e) { return { a, b, err: e.message }; }
    }));
    if (run !== H.RUN()) return;
    const live = rows.filter(r => r.J);
    const worst = live.slice().sort((x, y) => y.J.easeSpend - x.J.easeSpend)[0];
    const others = rows.filter(r => !r.J);
    $('#main').innerHTML = frame(tab, 'Stock', `
      <p class="v2say lead">${worst && worst.J.easeSpend ? `<b>${money(worst.J.easeSpend)}</b> of ${esc(worst.a.name)}'s ad spend last month went to products that run out by Cyber Monday.` : live.length ? 'No client is spending on stock that is about to run out.' : 'No client has a stock feed yet.'}</p>
      <p class="v2say quiet">One line per client: is the stock there for what we advertise, and is anything sitting that we should push. Stock reads itself from Shopify; the only setup is the brand installing the Mobius Digital Shopify app.</p>
      <section class="v2card"><div class="v2h"><h3>Every client</h3><span class="find">Click a client to open its stock.</span></div><div class="v2tbl"><table>
        <thead><tr><th>Client</th><th${tip('Meta spend, last 30 days, on ads whose orders contain a product that runs out by Cyber Monday')}>Ad spend on low stock</th><th>Out now</th><th>Run out by Cyber Monday</th><th>Safe to scale</th><th>Too much stock</th><th>Stock feed</th></tr></thead><tbody>
        ${live.map(r => { const m = r.ads ? r.ads.mapped : 0; return `<tr class="link" data-act="${esc(r.a.act_id)}" tabindex="0"><td><b>${esc(r.a.name)}</b><span class="sub">${[r.b.buys ? 'Buying' : '', r.b.makes ? 'Drops' : ''].filter(Boolean).join(' and ') || 'Stock only'}</span></td>
          <td>${UI() ? UI().ib(r.J.easeSpend, m || 1, '--bad', money(r.J.easeSpend), `${money(r.J.easeSpend)} of ${money(m)} tied to a product`) : money(r.J.easeSpend)}</td>
          <td>${r.J.out ? `<b class="spx-bad">${r.J.out}</b>` : '0'}</td><td>${r.J.byCM ? `<b class="spx-warn">${r.J.byCM}</b>` : '0'}</td><td>${r.J.scale.length}</td><td>${money(r.J.tiedUp)}<span class="sub">${plural(r.J.clear.length, 'product')}</span></td><td><span class="ds-chip good">Connected</span></td></tr>`; }).join('')}
        ${others.map(r => `<tr><td><b>${esc(r.a.name)}</b></td><td colspan="5" class="spx-mut" style="text-align:left">${r.err ? esc(r.err) : 'Shows here once the brand installs the Mobius Digital Shopify app.'}</td><td><span class="ds-chip ${r.err ? 'bad' : ''}">${r.err ? 'Error' : 'Not connected'}</span></td></tr>`).join('')}
      </tbody></table></div></section>`);
    $('#main').querySelectorAll('tr[data-act]').forEach(tr => { const go = () => { H.S.act = tr.dataset.act; try { localStorage.setItem('pf_act', tr.dataset.act); } catch {} const cp = document.getElementById('clientPick'); if (cp) cp.value = tr.dataset.act; H.show('stock'); }; tr.onclick = go; tr.onkeydown = e => { if (e.key === 'Enter') go(); }; });
  }

  /* ---------- sheets (the v2 side sheet; every detail view is one) ---------- */
  function panel(title, html, sheet) {
    const P = UI() && UI().panel; if (!P) return null;
    if (sheet) P.sheet = sheet; else P.wide = true;
    return P(title, html);
  }
  const closePanel = () => { const b = document.querySelector('#v2panel.on .pclose'); if (b) b.click(); };
  const pacts = sel => document.querySelector(`#v2panel ${sel}`);

  /* ---------- the product sheet (every brand) ---------- */
  const KINDS = [['core', 'Core', 'Always on the shelf. Forecast and reordered.'], ['drop', 'Limited drop', 'Sells out on purpose. Never asks for a reorder.'], ['winding_down', 'Winding down', 'Sell what is left. No reorder.'], ['discontinued', 'Discontinued', 'Hidden from Stock and Buying.']];
  function openProduct(id, what) {
    if (!CUR) return;
    const { st, J, brand } = CUR; const p = st.products.find(x => String(x.id) === String(id)); if (!p) return;
    const c = J.call(p), [k, label] = CALL[c], r = J.runway(p), a = J.ap(p.id), fc = firstCore(p);
    const buyer = !!brand.buys;
    what = what || { qty: p.suggested || 100, sent: st.today };
    const verdict = {
      ease: `${p.status === 'out' ? 'It is out now.' : `At ${perDay(p.velocity)} a day, the ${esc(sizeName(fc))} runs out ${day(p.runOutDate)}${fc && p.onHand - Math.max(0, fc.onHand) > p.velocity * Math.max(1, r.days) ? ` while ${int(p.onHand - Math.max(0, fc.onHand))} units of other sizes sit on the shelf` : ''}.`}${r.land != null ? ` The restock lands ${day(p.incomingLands)}${r.gap ? `, ${r.gap} days later` : ''}.` : ' Nothing is on order.'}${J.spend(p) ? ` ${money(J.spend(p))} of ads sold it last month: move that budget to a product that can take it${r.gap > 14 ? ', or sell the gap on pre-order' : ''}.` : ''}`,
      scale: `${r.days > H_DAYS ? 'More than 6 months of stock' : `Stock lasts to ${day(p.runOutDate)}`}${r.land != null ? ` and ${int(p.incoming)} more land ${day(p.incomingLands)}` : ''}. Room to spend more on it.`,
      clear: `${int(p.onHand)} on hand at ${perDay(p.velocity)} a day is ${p.weeksOfCover ? p.weeksOfCover + ' weeks' : 'more than a year'} of stock${isClient() ? '' : `, ${money(J.tied(p))} at cost`}. Worth a promotion, a bundle with a best seller, or an ad test.`,
      watch: `Stock lasts to ${day(p.runOutDate)}. Fine for now; it turns to Ease off if a restock is not placed in time.`,
      quiet: p.lifecycle === 'drop' ? 'A limited drop: it sells out on purpose and never asks for a reorder.' : 'No sales in the last 90 days.' }[c];
    const kind = p.lifecycle === 'seasonal' ? 'core' : (p.lifecycle || 'core');
    const stat = (l, v, s, t) => `<div${t ? tip(t) : ''}><span>${l}</span><b>${v}</b><em>${s}</em></div>`;
    const sizes = (p.variants || []).slice().sort((x, y) => (y.isCore - x.isCore) || ((x.onHand <= 0 && x.velocity > 0.001 ? -1 : x.runOutDays ?? 9e9) - (y.onHand <= 0 && y.velocity > 0.001 ? -1 : y.runOutDays ?? 9e9)));
    const dupAxis = new Set(sizes.map(v => v.axis).filter((x, i, arr) => arr.indexOf(x) !== i));
    const sheet = {
      lead: p.image ? `<span class="plead-th" style="background-image:url('${esc(p.image)}')"></span>` : '',
      chip: callChip(c, p),
      actions: isClient() ? '' : `${buyer ? btn('Add to an order', 'id="spAddO"', 'primary sm') : ''}${btn(`${ic('external-link', 14)}Shopify`, 'id="spShop" aria-label="Open in Shopify"', 'sm')}`,
      navLabel: 'On this sheet' };
    const body = panel(p.title, `
      <section data-sec="Summary" data-ic="info">
        <div class="spx-verdict ${k}"><b>${esc(c === 'quiet' && p.lifecycle === 'drop' ? 'Limited drop' : label)}</b><p>${verdict}</p></div>
        <div class="spx-stats">
          ${stat('On hand', int(p.onHand), `${plural(p.variants.length, 'size')}, ${p.coreCount || 0} core${p.oversold ? `, ${p.oversold} oversold` : ''}`, 'Units in Shopify now, every size added up.')}
          ${stat('Sold per day', perDay(p.velocity), p.velocity > 0.001 ? `${one(p.velocity * 7)} a week${p.trend && p.trend !== 'steady' ? `, ${({ rising: 'rising', spiking: 'spiking', falling: 'slowing', new: 'new', flat: 'flat' })[p.trend] || ''}` : ''}` : 'no sales in 90 days', 'The last 14, 30 and 90 days blended, ignoring days a size was empty.')}
          ${stat('Runs out on', p.status === 'out' ? 'Out now' : r.days == null ? '–' : r.days > H_DAYS ? '6+ months' : day(p.runOutDate), r.days == null ? 'not selling' : fc && p.variants.length > 1 ? `${esc(sizeName(fc))} first` : `${int(r.days)} days left`, 'The day the first core size hits zero at this pace.')}
          ${stat('Restock landing', p.incomingLands ? day(p.incomingLands) : '–', p.incomingLands ? `+${int(p.incoming)} units${r.gap ? `, ${r.gap} days short first` : ''}` : 'nothing on order', 'When the next order on its way arrives.')}
          ${stat('Ads behind it', a ? money(a.spend) : '–', a ? `${a.orders} orders from ${plural(a.ads, 'ad')}, 30 days` : 'no ad-driven orders', 'Meta spend on ads whose Triple Whale orders contain this product, last 30 days.')}
        </div>
      </section>
      <section class="v2card" data-sec="Stock ahead" data-ic="chart-line"><div class="v2h"><h3>Stock on the shelf, the next 6 months</h3></div><div id="spChartWrap"></div></section>
      <section class="v2card" data-sec="By size" data-ic="layers"><div class="v2h"><h3>By size</h3><span class="find">${p.coreCount && p.coreCount < p.variants.length ? `${p.coreCount} of ${p.variants.length} sizes are core: they make up 80% of sales and set the run-out date.` : 'Which sizes run out first.'}</span></div>
        <div class="v2tbl"><table><thead><tr><th>Size</th><th>On hand</th><th>Sold per day</th><th>Days left</th><th>Runs out on</th><th>On the way</th>${buyer ? `<th${tip('What the brain would order for this size now')}>Suggested</th>` : ''}</tr></thead><tbody>
        ${sizes.map(v => { const out = v.onHand <= 0 && v.velocity > 0.001, dl = out ? 0 : v.runOutDays; return `<tr${fc && v.id === fc.id ? ' class="spx-first"' : ''}><td><b>${esc(v.axis || v.sku || v.title || '–')}</b> ${v.isCore ? `<span class="v2pill"${tip('A core size: part of the 80% of sales. Core sizes set the run-out date.')}>core</span>` : ''}${v.curveBased ? ` <span class="v2pill"${tip("Off the shelf most of the last 90 days, so its pace comes from the group's size mix")}>pace from size mix</span>` : ''}${fc && v.id === fc.id ? ' <span class="v2pill bad">runs out first</span>' : ''}${dupAxis.has(v.axis) && v.sku ? `<span class="sub">${esc(v.sku)}</span>` : ''}</td>
          <td>${v.onHand < 0 ? `<b class="spx-bad">${v.onHand}</b>` : int(v.onHand)}</td><td${tip(`${v.sold14} sold in 14 days, ${v.sold30} in 30, ${v.sold90} in 90`)}>${perDay(v.velocity)}</td>
          <td>${v.velocity <= 0.001 ? '<span class="spx-mut">not selling</span>' : UI() ? UI().ib(Math.min(dl ?? H_DAYS, H_DAYS), H_DAYS, out || dl < 30 ? '--bad' : v.isCore ? '--ink-2' : '--faint', out ? 'Out' : dl > H_DAYS ? '180+' : int(dl)) : int(dl)}</td>
          <td>${out ? '<b class="spx-bad">Out now</b>' : v.runOutDays == null ? '–' : v.runOutDays > H_DAYS ? '6+ months' : day(add(st.today, v.runOutDays))}</td>
          <td>${v.incoming ? `+${int(v.incoming)} <span class="spx-mut">${day(v.incomingLands)}</span>` : '<span class="spx-mut">–</span>'}</td>${buyer ? `<td>${v.suggested || '–'}</td>` : ''}</tr>`; }).join('')}</tbody></table></div></section>
      ${isClient() ? '' : `<section class="v2card" data-sec="How we treat it" data-ic="sliders"><div class="v2h"><h3>How we treat it</h3><span class="cap">saves as you change it</span></div>
        <div class="spx-form">
          <div class="spx-f wide"><label>Kind of product</label><div class="ds-seg spx-kind" role="radiogroup" aria-label="Kind of product">${KINDS.map(([v, l]) => `<button type="button" role="radio" aria-checked="${kind === v}" class="${kind === v ? 'on' : ''}" data-kind="${v}">${l}</button>`).join('')}</div><p class="spx-help">${esc((KINDS.find(x => x[0] === kind) || KINDS[0])[2])} Only core products are forecast for a reorder.</p></div>
          ${buyer ? `<div class="spx-f"><label for="spMoq">Minimum order</label><input class="spx-in" id="spMoq" type="number" min="0" value="${p.moq ?? ''}" placeholder="none"><p class="spx-help">Units the factory needs per style.</p></div>
          <div class="spx-f"><label for="spLead">Lead time, days</label><input class="spx-in" id="spLead" type="number" min="0" value="${p.leadParts && p.leadParts.source === 'product' ? p.leadParts.base : ''}" placeholder="${p.leadParts ? p.leadParts.base : ''}"><p class="spx-help">${p.leadParts ? `${p.leadParts.base} days from the ${p.leadParts.source === 'factory' ? 'factory' : p.leadParts.source === 'line' ? 'group' : 'product'}, plus ${p.leadParts.buffer} buffer.` : 'No factory yet.'}</p></div>` : ''}
          <div class="spx-f wide"><label for="spNotes">Notes</label><textarea class="spx-in" id="spNotes" placeholder="Anything the next person should know">${esc(p.notes || '')}</textarea></div>
        </div></section>`}
      ${buyer && p.leadDays != null ? `<section class="v2card" data-sec="Try an order" data-ic="cart"><div class="v2h"><h3>Try an order</h3><span class="find">Type a quantity and a date; the chart above draws it as a dashed line.</span></div>
        <div class="spx-form"><div class="spx-f"><label for="spWq">Units</label><input class="spx-in" id="spWq" type="number" min="0" value="${what.qty}"></div><div class="spx-f"><label for="spWs">Placed on</label><input class="spx-in" id="spWs" type="date" value="${what.sent}"></div></div>
        <div id="spPlanOut"></div></section>` : ''}`, sheet);
    if (!body) return;
    let tried = false;
    const readWhat = () => tried && body.querySelector('#spWq') ? { qty: +body.querySelector('#spWq').value || 0, sent: body.querySelector('#spWs').value || st.today } : null;
    const paint = () => {
      const w = readWhat();
      body.querySelector('#spChartWrap').innerHTML = stockChart('spxChart', p, st, J, w);
      wireStockChart('spxChart');
      const out = body.querySelector('#spPlanOut');
      const wq = body.querySelector('#spWq') ? { qty: +body.querySelector('#spWq').value || 0, sent: body.querySelector('#spWs').value || st.today } : null;
      if (out && wq) { const w = wq; const lands = add(w.sent, p.leadDays), s = simulate(p, st, w);
        out.innerHTML = `<div class="spx-stats four">${stat('Lands', day(lands), `${p.leadDays} day lead time`)}${stat('Short for', s.gap ? `<span class="spx-bad">${s.gap} days</span>` : '<span class="spx-good">No gap</span>', 'first core size empty until a landing', 'Days the product is short: from the day its first core size runs out to the day this order (or one already on the way) lands.')}${stat('Lasts until', s.lasts ? day(s.lasts) : '6+ months', 'all units, with this order')}${stat('Cost', p.cost != null ? moneyFull(w.qty * p.cost) : '–', 'at cost')}</div>
          ${s.gap > 14 ? `<div class="spx-box warn"><b>Sell the gap on pre-order.</b> ${s.gap} empty days are locked in. Keep the empty sizes selling in Shopify with "ships ${day(lands)}" on the page, and switch it back when the order lands.</div>` : ''}`; }
    };
    paint();
    const set = patch => save(brand.id, `/api/products/${encodeURIComponent(p.id)}`, patch).then(() => refresh().then(() => openProduct(id, readWhat()))).catch(() => {});
    body.querySelectorAll('[data-kind]').forEach(b => b.onclick = () => { if (b.classList.contains('on')) return; set({ lifecycle: b.dataset.kind }); });
    if (body.querySelector('#spNotes')) body.querySelector('#spNotes').onchange = e => set({ notes: e.target.value });
    if (body.querySelector('#spMoq')) { body.querySelector('#spMoq').onchange = e => set({ moq: +e.target.value || 0 }); body.querySelector('#spLead').onchange = e => set({ lead_override_days: +e.target.value || null }); }
    if (body.querySelector('#spWq')) { body.querySelector('#spWq').oninput = () => { tried = true; paint(); }; body.querySelector('#spWs').onchange = () => { tried = true; paint(); }; }
    const shop = pacts('#spShop'); if (shop) shop.onclick = () => window.open(`https://admin.shopify.com/store/${encodeURIComponent((st.db.brand?.shop_domain || '').replace('.myshopify.com', ''))}/products/${p.id}`, '_blank', 'noopener');
    const addO = pacts('#spAddO'); if (addO) addO.onclick = () => orderBuilder([p.id], { [p.id]: body.querySelector('#spWq') ? +body.querySelector('#spWq').value || 0 : p.suggested });
  }
  function simulate(p, st, what) {
    const adds = []; for (const v of p.variants) for (const o of v.incomingOrders || []) if (o.lands) adds.push([between(st.today, o.lands), o.qty]);
    const run = extra => { const out = []; let s = Math.max(0, p.onHand); for (let d = 0; d <= H_DAYS; d++) { for (const [ad, q] of extra) if (ad === d) s += q; out.push(s); s = Math.max(0, s - p.velocity); } return out; };
    const ld = what && p.leadDays != null ? between(st.today, add(what.sent, p.leadDays)) : null;
    const scen = ld != null && what.qty > 0 ? run([...adds, [ld, what.qty]]) : null;
    /* "Empty" follows the brain: the product is short once its first core size runs out (runOutDays),
       even while other sizes still sit on the shelf; it stays short until the next landing. */
    const rd = p.velocity <= 0.001 ? null : p.status === 'out' ? 0 : p.runOutDays;
    const lands = [...adds.map(a => a[0]), ...(scen ? [ld] : [])].filter(d => d >= 0).sort((a, b) => a - b);
    const next = rd == null ? null : lands.find(d => d > rd) ?? null;
    const covered = rd != null && lands.some(d => d <= rd) && p.status !== 'out' && p.status !== 'gap';
    const gap = rd == null || covered ? 0 : (next == null ? H_DAYS : next) - rd;
    let lasts = null; if (scen && ld != null) { const z = scen.findIndex((u, i) => i > ld && u <= 0); lasts = z > 0 ? add(st.today, z) : null; }
    return { gap: Math.max(0, gap), rd: covered ? null : rd, next, lasts, ld, adds, first: firstCore(p) };
  }
  /* Units on the shelf day by day, size by size (a size that runs out does not borrow from the others),
     with every order on its way landing on its day. An order being tried is split across sizes by pace. */
  function project(p, st, what) {
    const D = H_DAYS, vs = (p.variants || []).filter(v => v.onHand > 0 || v.velocity > 0.001 || v.incoming);
    const ld = what && what.qty > 0 && p.leadDays != null ? between(st.today, add(what.sent, p.leadDays)) : null;
    const w = vs.map(v => (v.velocity > 0.001 ? v.velocity : 0)), ws = w.reduce((a, x) => a + x, 0);
    const extra = ld == null ? null : vs.map((v, i) => what.qty * (ws ? w[i] / ws : 1 / Math.max(1, vs.length)));
    const run = withOrder => {
      const tot = Array(D + 1).fill(0), coreOut = Array(D + 1).fill(0);
      vs.forEach((v, i) => {
        const arr = {}; for (const o of v.incomingOrders || []) if (o.lands) { const d = Math.max(0, between(st.today, o.lands)); arr[d] = (arr[d] || 0) + o.qty; }
        if (withOrder && extra && ld >= 0 && ld <= D) arr[ld] = (arr[ld] || 0) + extra[i];
        let s = Math.max(0, v.onHand);
        for (let d = 0; d <= D; d++) { if (arr[d]) s += arr[d]; tot[d] += s; if (v.isCore && v.velocity > 0.001 && s < 0.5) coreOut[d]++; s = Math.max(0, s - v.velocity); }
      });
      return { tot, coreOut };
    };
    return { base: run(false), scen: extra ? run(true) : null, cores: vs.filter(v => v.isCore && v.velocity > 0.001).length, ld };
  }
  /* ONE chart: projected units. Short period shaded, restocks as steps, markers named in a flag row ABOVE
     the plot (two rows when they would touch), so no label ever sits on a line. Hover reads every day. */
  function stockChart(id, p, st, J, what) {
    if (p.velocity <= 0.001) return `<p class="v2hint">No sales in the last 90 days, so there is nothing to project. ${int(p.onHand)} units sit on the shelf.</p>`;
    const D = H_DAYS, W = 760, Hh = 230, pl = 52, pr = 16, pt = 10, pb = 26;
    const pr0 = project(p, st, what), sim = simulate(p, st, what), base = pr0.base.tot, scen = pr0.scen ? pr0.scen.tot : null;
    const mxRaw = Math.max(10, ...base, ...(scen || [])) * 1.08, mag = Math.pow(10, Math.floor(Math.log10(mxRaw))), mx = Math.ceil(mxRaw / (mag / 2)) * (mag / 2);
    const X = d => pl + d / D * (W - pl - pr), Y = u => pt + (1 - u / mx) * (Hh - pt - pb);
    const ev = {}; const addEv = (d, t) => { if (d == null || d < 0 || d > D) return; (ev[d] = ev[d] || []).push(t); };
    const flags = [];
    let g = [0.25, 0.5, 0.75, 1].map(f => `<line x1="${pl}" x2="${W - pr}" y1="${Y(mx * f).toFixed(1)}" y2="${Y(mx * f).toFixed(1)}" stroke="var(--v2-grid, var(--line))" stroke-dasharray="2 4"/><text x="${pl - 8}" y="${(Y(mx * f) + 4).toFixed(1)}" font-size="10.5" text-anchor="end" fill="var(--faint)">${int(mx * f)}</text>`).join('');
    g += `<line x1="${pl}" x2="${W - pr}" y1="${Y(0)}" y2="${Y(0)}" stroke="var(--line-strong)"/>`;
    /* month ticks, never within 10 days of Today (they would touch) */
    g += `<text x="${pl}" y="${Hh - 8}" font-size="10" fill="var(--ink-2)" font-weight="600">Today</text>`;
    for (let m = 1; m <= 7; m++) { const d0 = new Date(st.today + 'T12:00:00Z'); d0.setUTCMonth(d0.getUTCMonth() + m, 1); const ymd = d0.toISOString().slice(0, 10), dd = between(st.today, ymd); if (dd > 10 && dd < D - 6) g += `<text x="${X(dd).toFixed(1)}" y="${Hh - 8}" font-size="10" text-anchor="middle" fill="var(--muted)">${d0.toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' })}</text>`; }
    /* short: a core size is empty until the next landing */
    if (sim.rd != null && sim.rd <= D && sim.gap > 0) {
      const e = Math.min(D, sim.rd + sim.gap);
      g += `<rect x="${X(sim.rd).toFixed(1)}" y="${pt}" width="${Math.max(2, X(e) - X(sim.rd)).toFixed(1)}" height="${(Hh - pt - pb).toFixed(1)}" fill="var(--bad)" opacity=".09"/>`;
      for (let d = sim.rd; d < e; d++) addEv(d, '<span class="spx-tbad">Short: a core size is empty</span>');
    }
    /* the first core size out (the run-out date) */
    if (sim.rd != null && sim.rd <= D) {
      const who = sizeName(sim.first);
      g += `<line x1="${X(sim.rd).toFixed(1)}" x2="${X(sim.rd).toFixed(1)}" y1="${pt}" y2="${Y(0)}" stroke="var(--bad)" stroke-width="1.4" stroke-dasharray="4 3"/>`;
      flags.push({ d: sim.rd, k: 'bad', t: sim.rd === 0 ? 'Short now' : `Runs out ${day(p.runOutDate)}` });
      addEv(sim.rd, `<b class="spx-tbad">${esc(who)} runs out</b> (the first core size)`);
    }
    /* restocks: a step up on the line, a short green tick at the foot */
    const lands = {}; for (const [d, q] of sim.adds) if (d <= D) lands[Math.max(0, d)] = (lands[Math.max(0, d)] || 0) + q;
    for (const [d, q] of Object.entries(lands)) { const dd = +d; g += `<line x1="${X(dd).toFixed(1)}" x2="${X(dd).toFixed(1)}" y1="${pt}" y2="${Y(0)}" stroke="var(--good)" stroke-width="1.2" stroke-dasharray="2 3"/>`; flags.push({ d: dd, k: 'good', t: `+${int(q)} land ${day(add(st.today, dd))}` }); addEv(dd, `<b class="spx-tgood">+${int(q)} units land</b> (an order on its way)`); }
    if (pr0.ld != null && pr0.ld >= 0 && pr0.ld <= D) { flags.push({ d: pr0.ld, k: 'acc', t: `Your order lands ${day(add(st.today, pr0.ld))}` }); addEv(pr0.ld, `<b>+${int(what.qty)} land</b> (the order you are trying)`); }
    if (J.SE.bfd >= 0 && J.SE.bfd <= D) { g += `<line x1="${X(J.SE.bfd).toFixed(1)}" x2="${X(J.SE.bfd).toFixed(1)}" y1="${pt}" y2="${Y(0)}" stroke="var(--faint)" stroke-dasharray="2 3"/>`; flags.push({ d: J.SE.bfd, k: '', t: 'Black Friday' }); addEv(J.SE.bfd, 'Black Friday'); }
    const allGone = base.findIndex((u, i) => i > 0 && u < 0.5);
    if (allGone > 0) { flags.push({ d: allGone, k: 'bad', t: `All gone ${day(add(st.today, allGone))}` }); addEv(allGone, '<b class="spx-tbad">Every unit sold</b>'); }
    /* the line: straight segments, so a landing reads as a step */
    const pts = arr => arr.map((u, d) => `${X(d).toFixed(1)},${Y(u).toFixed(1)}`).join(' ');
    g += `<path d="M${X(0)},${Y(0)} L${pts(base).split(' ').join(' L')} L${X(D)},${Y(0)}Z" fill="url(#lx-area)" stroke="none"/>`;
    if (scen) g += `<polyline points="${pts(scen)}" fill="none" stroke="var(--ink-2)" stroke-width="1.6" stroke-dasharray="5 4" stroke-linejoin="round"/>`;
    g += `<polyline points="${pts(base)}" fill="none" stroke="var(--brand)" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round"/>`;
    if (sim.rd != null && sim.rd <= D) g += `<circle cx="${X(sim.rd).toFixed(1)}" cy="${Y(base[sim.rd]).toFixed(1)}" r="4.5" fill="var(--surface)" stroke="var(--bad)" stroke-width="2"/>`;
    g += `<line class="gl" x1="0" x2="0" y1="${pt}" y2="${Y(0)}" stroke="var(--ink)" stroke-dasharray="3 3" opacity="0"/><g class="gdots"></g><rect class="hit" x="${pl}" y="${pt}" width="${W - pl - pr}" height="${Hh - pt - pb}" fill="transparent"/>`;
    /* flag rows: estimated widths in % of the plot; a flag that would touch the one before drops a row */
    flags.sort((x, y) => x.d - y.d);
    const rowsEnd = [-1e9, -1e9, -1e9];
    const fl = flags.map(f => { const x = X(f.d) / W * 100, wPct = (f.t.length * 6.4 + 22) / 720 * 100, left = Math.max(0, Math.min(100 - wPct, x - 4));
      let row = rowsEnd.findIndex(e => left > e + 0.8); if (row < 0) return ''; rowsEnd[row] = left + wPct;
      return `<span class="spx-flag ${f.k}" style="left:${left.toFixed(2)}%;top:${row * 22}px"><i style="left:${Math.max(0, x - left).toFixed(2)}%"></i>${esc(f.t)}</span>`; }).join('');
    const nRows = rowsEnd.filter(e => e > -1e9).length;
    const days = base.map((u, d) => ({ d, u, s: scen ? scen[d] : null, co: pr0.base.coreOut[d], ev: ev[d] || [] }));
    CHART[id] = { days, D, W, pl, pr, X, Y, cores: pr0.cores, today: st.today, scen: !!scen };
    const fcN = sim.first ? sizeName(sim.first) : 'a core size';
    const say = p.status === 'out' ? `It is out now${p.incomingLands ? `; ${int(p.incoming)} land ${day(p.incomingLands)}` : ' and nothing is on order'}.`
      : sim.rd != null && sim.rd <= D ? `At ${perDay(p.velocity)} a day, the <b>${esc(fcN)}</b> runs out <b>${day(p.runOutDate)}</b>${p.onHand > p.velocity * Math.max(1, sim.rd) * 1.5 ? `, while other sizes still hold ${int(base[sim.rd])} units` : ''}. ${sim.gap > 0 ? `The product is short of that size for <b>${sim.gap} days</b>, until ${sim.next != null ? `the restock lands ${day(add(st.today, sim.next))}` : 'a restock lands'}.` : 'A restock lands before then.'}`
      : `At ${perDay(p.velocity)} a day it lasts past ${day(add(st.today, D))}.`;
    return `<p class="v2say spx-say">${say}</p>
      <div class="spx-flags" style="height:${Math.max(1, nRows) * 22 + 4}px" aria-hidden="true">${fl}</div>
      <div class="v2chart spx-chart"><svg id="${id}" viewBox="0 0 ${W} ${Hh}" role="img" aria-label="Units on the shelf for the next six months">${g}</svg><div class="v2tip"></div></div>
      <div class="v2lg spx-lg"><span><i style="background:var(--brand)"></i>Units on the shelf</span>${scen ? '<span><i style="border-top:2px dashed var(--ink-2);height:0;background:transparent"></i>With the order you are trying</span>' : ''}<span><i class="sq" style="background:var(--bad);opacity:.3"></i>Short: a core size is empty</span><span><i style="border-top:2px dashed var(--good);height:0;background:transparent"></i>An order lands</span><span><i style="border-top:2px dashed var(--bad);height:0;background:transparent"></i>First core size runs out</span></div>`;
  }
  const CHART = {};
  function wireStockChart(id) {
    const el = document.getElementById(id), C = CHART[id]; if (!el || !C) return;
    const tipEl = el.parentNode.querySelector('.v2tip'), gl = el.querySelector('.gl'), dots = el.querySelector('.gdots');
    const move = e => {
      const r = el.getBoundingClientRect(); const vx = (e.clientX - r.left) / r.width * C.W;
      const d = Math.max(0, Math.min(C.D, Math.round((vx - C.pl) / (C.W - C.pl - C.pr) * C.D))), row = C.days[d], x = C.X(d);
      gl.setAttribute('x1', x); gl.setAttribute('x2', x); gl.setAttribute('opacity', '.5');
      dots.innerHTML = `<circle cx="${x}" cy="${C.Y(row.u)}" r="4.5" fill="var(--surface)" stroke="var(--brand)" stroke-width="2"/>${row.s != null ? `<circle cx="${x}" cy="${C.Y(row.s)}" r="3.5" fill="var(--surface)" stroke="var(--ink-2)" stroke-width="2"/>` : ''}`;
      tipEl.style.display = 'block';
      tipEl.innerHTML = `<b>${wday(add(C.today, d))}</b>${d === 0 ? ' · today' : ''}<br>${int(row.u)} units on the shelf${row.s != null ? `<br>${int(row.s)} with the order you are trying` : ''}${C.cores ? `<br>Core sizes in stock: ${C.cores - row.co} of ${C.cores}` : ''}${row.ev.length ? `<br>${row.ev.join('<br>')}` : ''}`;
      const tw = tipEl.offsetWidth; let left = (e.clientX - r.left) + 14; if (left + tw > r.width) left = (e.clientX - r.left) - tw - 14; tipEl.style.left = Math.max(0, left) + 'px'; tipEl.style.top = '6px';
    };
    el.onpointermove = move; el.onpointerdown = move;
    el.onpointerleave = () => { tipEl.style.display = 'none'; gl.setAttribute('opacity', '0'); dots.innerHTML = ''; };
  }
  async function refresh() { if (!CUR) return; STATE.delete(CUR.brand.id); const st = await state(CUR.brand.id); CUR = { ...CUR, st, J: judge(st, CUR.ads) }; redraw(); }

  /* ---------- a small form modal (in-app, never prompt()) ---------- */
  function form({ title, hint = '', fields = [], confirm = 'Save', danger = false, extra = '' }) {
    return new Promise(resolve => {
      const w = document.createElement('div'); w.className = 'modal-wrap';
      w.innerHTML = `<div class="modal" style="max-width:560px"><h3>${esc(title)}</h3>${hint ? `<p class="hint">${hint}</p>` : ''}
        <div class="sp-fields" style="margin-top:10px">${fields.map(f => `<div class="sp-field ${f.wide ? 'wide' : ''}"><label for="spf_${esc(f.key)}">${esc(f.label)}</label>${f.type === 'select'
          ? `<select id="spf_${esc(f.key)}" data-k="${esc(f.key)}">${f.options.map(([v, l]) => `<option value="${esc(v)}" ${String(f.value) === String(v) ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>`
          : f.type === 'textarea' ? `<textarea id="spf_${esc(f.key)}" data-k="${esc(f.key)}" placeholder="${esc(f.placeholder || '')}">${esc(f.value ?? '')}</textarea>`
          : `<input id="spf_${esc(f.key)}" data-k="${esc(f.key)}" type="${f.type || 'text'}" value="${esc(f.value ?? '')}" placeholder="${esc(f.placeholder || '')}" ${f.min != null ? `min="${f.min}"` : ''}>`}${f.help ? `<div class="help">${esc(f.help)}</div>` : ''}</div>`).join('')}</div>${extra}
        <div class="row" style="justify-content:flex-end;gap:8px;margin:14px 0 0"><button class="ds-btn" data-m="no">Cancel</button><button class="ds-btn ${danger ? '' : 'primary'}" data-m="yes" ${danger ? 'style="color:var(--bad)"' : ''}>${esc(confirm)}</button></div></div>`;
      document.body.appendChild(w);
      const done = v => { w.remove(); document.removeEventListener('keydown', key); resolve(v); };
      const key = e => { if (e.key === 'Escape') done(null); if (e.key === 'Enter' && e.target.tagName !== 'TEXTAREA') w.querySelector('[data-m="yes"]').click(); };
      document.addEventListener('keydown', key);
      w.addEventListener('mousedown', e => { if (e.target === w) done(null); });
      w.querySelector('[data-m="no"]').onclick = () => done(null);
      w.querySelector('[data-m="yes"]').onclick = () => { const out = {}; w.querySelectorAll('[data-k]').forEach(el => { out[el.dataset.k] = el.value; }); done(out); };
      const f0 = w.querySelector('input,select,textarea'); if (f0) f0.focus();
    });
  }

  /* ===================================================================================
   * BUYING (brands we buy for): one card per factory order to place, then what is on its way
   * ================================================================================= */
  const OPEN = ['sent', 'confirmed', 'production', 'shipped', 'partial'];
  const EXCL = new Set();   // products left out of this week's order (In / Out on a row)
  function plan(p) {
    const yrs = p.moq && p.velocity > 0.001 ? p.moq / (p.velocity * 365) : 0;
    const under = !!(p.moq && p.suggested && p.suggested < p.moq);
    const skip = under && yrs > 2;
    const qty = !p.suggested ? 0 : skip ? 0 : under ? p.moq : p.suggested;
    return { yrs, under, skip, qty };
  }
  async function renderBuying(first) {
    const tab = 'buying';
    if (first || !$('#main .spx')) loading(tab, 'Buying');
    try { await loadBrands(); } catch (e) { return fail(tab, 'Buying', e); }
    if (isClient()) return msg(tab, 'Buying', empty('factory', 'Buying is for the Mobius team.'));
    const act = H.S.act, b = act === 'all' ? null : brandOf(act);
    if (act === 'all') return msg(tab, 'Buying', empty('factory', 'Buying is per brand. Pick a brand we buy for in the client picker.'));
    if (!b || !b.buys) return noFeed(tab, (H.S.accounts.find(a => a.act_id === act) || {}).name || 'This brand');
    const run = H.RUN();
    let st, ads; try { [st, ads] = await Promise.all([state(b.id), stockAds(act)]); } catch (e) { return fail(tab, 'Buying', e); }
    if (run !== H.RUN()) return;
    CUR = { brand: b, st, ads, J: judge(st, ads) };
    const due = st.products.filter(p => ['out', 'order', 'gap'].includes(p.status));
    const byF = new Map(); for (const p of due) { const k = p.factoryId || ''; if (!byF.has(k)) byF.set(k, []); byF.get(k).push(p); }
    const open = st.orders.filter(o => OPEN.includes(o.status)).sort((x, y) => (x.expected_at || '9') < (y.expected_at || '9') ? -1 : 1);
    const drafts = st.orders.filter(o => o.status === 'draft'), landed = st.orders.filter(o => o.status === 'landed');
    const soon = st.products.filter(p => p.status === 'soon').sort((x, y) => (x.orderByDate || '9') < (y.orderByDate || '9') ? -1 : 1);
    const nowPs = due.filter(p => p.overdue || p.status === 'out');
    const toUnits = due.filter(p => !EXCL.has(p.id)).reduce((a, p) => a + plan(p).qty, 0), toCost = due.filter(p => !EXCL.has(p.id)).reduce((a, p) => a + plan(p).qty * (p.cost || 0), 0);
    const wayUnits = open.reduce((a, o) => a + Math.max(0, (o.units || 0) - (o.received || 0)), 0), wayCost = open.reduce((a, o) => a + (o.atCost || 0), 0);
    const nx = open[0];
    const tiles = UI() ? [
      UI().tile({ label: 'Factory orders to place', value: String(byF.size), sub: byF.size ? `${int(toUnits)} units, about ${money(toCost)} at cost.` : 'Nothing due in the next two weeks.' }),
      UI().tile({ label: 'Due now', value: String(nowPs.length), sub: nowPs.length ? `Out, or past the order-by date. About ${int(nowPs.reduce((a, p) => a + p.perWeek, 0))} sales a week are at stake.` : 'Nothing is past its order date.', spark: spk(nowPs, st.today) }),
      UI().tile({ label: 'On the way', value: `${int(wayUnits)}<small class="spx-u">units</small>`, sub: `${plural(open.length, 'order')}, ${money(wayCost)} at cost. They count as stock everywhere in Locus.` }),
      UI().tile({ label: 'Next landing', value: nx && nx.expected_at ? day(nx.expected_at) : '–', sub: nx ? `${esc(nx.id)}, ${int(nx.units)} units${nx.expected_at ? `, in ${between(st.today, nx.expected_at)} days` : ''}.` : 'Nothing on the way.' }),
    ].join('') : '';
    $('#main').innerHTML = frame(tab, 'Buying', `
      <p class="v2say lead">${byF.size ? `<b>${byF.size === 1 ? 'One factory order' : byF.size + ' factory orders'} to place${nowPs.length ? ' now' : ' within two weeks'}</b>` : 'Nothing to order in the next two weeks'}${open.length ? `, and ${plural(open.length, 'order')} on the way` : ''}.</p>
      ${updated(st, 'Stock and orders read')}
      <div class="v2tiles">${tiles}</div>
      <div class="ds-label spx-sec">Orders to place</div>
      ${byF.size ? [...byF.entries()].map(([fid, ps]) => facCard(st, fid, ps)).join('') : `<section class="v2card">${empty('check', 'Nothing to order in the next two weeks. Products show here when their order-by date comes within 14 days.')}</section>`}
      <section class="v2card" id="spxWay"><div class="v2h"><h3>On the way</h3><span class="find">Every order placed and not yet landed. Click one to update its stage or received counts.</span>${btn(`${ic('plus', 14)}Log an order`, 'id="spNewO"', 'sm')}</div>
        ${open.length ? open.map(o => poRow(st, o)).join('') : empty('inbox', 'Nothing on the way. A placed order shows here and counts as stock on the way.')}
        ${drafts.length ? `<div class="ds-label spx-sec">Drafts, not placed</div>${drafts.map(o => `<button type="button" class="spx-orow" data-o="${esc(o.id)}"><b>${esc(o.id)}</b><span class="ds-chip">Draft</span><span class="spx-mut">${esc(o.factoryName || '')} · ${int(o.units)} units · ${esc(o.productTitles.slice(0, 2).join(', '))}</span></button>`).join('')}` : ''}
        ${landed.length ? `<details class="spx-landed"><summary>${plural(landed.length, 'landed order')}</summary>${landed.map(o => `<button type="button" class="spx-orow" data-o="${esc(o.id)}"><b>${esc(o.id)}</b><span class="ds-chip good">Landed</span><span class="spx-mut">${esc(o.factoryName || '')} · ${int(o.units)} units · ${day(o.landed_at || o.expected_at)}</span></button>`).join('')}</details>` : ''}
      </section>
      ${soon.length ? `<section class="v2card"><div class="v2h"><h3>Coming up</h3><span class="find">Order dates in the 60 days after that. Nothing to do yet.</span></div><div class="v2tbl"><table><thead><tr><th>Product</th><th>Factory</th><th>Runs out on</th><th>Order by</th><th>Suggested</th></tr></thead><tbody>${soon.map(p => `<tr class="link" data-sp-p="${esc(p.id)}"><td><div class="spx-pn">${av(p)}<div><b>${esc(p.title)}</b><span>${esc(p.lineName || '')}</span></div></div></td><td>${esc(p.factoryName || '–')}</td><td>${day(p.runOutDate)}</td><td><b>${day(p.orderByDate)}</b><span class="sub">in ${between(st.today, p.orderByDate)} days</span></td><td>${int(p.suggested)}</td></tr>`).join('')}</tbody></table></div></section>` : ''}
      <p class="v2foot">Quantities cover ${st.settings.cover_days} days after the order lands, split by size and checked against the factory's minimum. Lead time = days to make + days to ship + ${st.settings.buffer_days} buffer days.</p>`);
    const root = $('#main'); wireCommon(root);
    root.querySelectorAll('[data-x]').forEach(bn => bn.onclick = () => { const id = bn.dataset.x, out = bn.dataset.v === 'out'; out ? EXCL.add(id) : EXCL.delete(id); renderBuying(false); });
    root.querySelectorAll('[data-oneoff]').forEach(bn => bn.onclick = async () => { await save(b.id, `/api/products/${encodeURIComponent(bn.dataset.oneoff)}`, { lifecycle: 'drop' }, 'PUT', 'Marked a one-off. It stops asking for a reorder.'); STATE.delete(b.id); renderBuying(false); });
    root.querySelectorAll('[data-build]').forEach(bn => bn.onclick = () => { const ps = byF.get(bn.dataset.build) || []; const ids = ps.filter(p => !EXCL.has(p.id) && plan(p).qty > 0).map(p => p.id); if (!ids.length) return toast('Every product on this card is left out.', true); orderBuilder(ids, Object.fromEntries(ps.map(p => [p.id, plan(p).qty]))); });
    root.querySelectorAll('[data-o]').forEach(el => { el.onclick = () => openOrder(el.dataset.o); el.onkeydown = e => { if (e.key === 'Enter') openOrder(el.dataset.o); }; });
    root.querySelector('#spNewO').onclick = async () => {
      const ps = st.products.filter(p => p.status !== 'off').sort((x, y) => x.title.localeCompare(y.title));
      const r = await form({ title: 'Log an order', hint: 'For an order placed outside Locus. Pick the product; the next step takes the sizes, quantities and dates. More products from the same factory can be added on the next step.', fields: [{ key: 'pid', label: 'Product', type: 'select', options: ps.map(p => [p.id, p.title]), value: ps[0]?.id }], confirm: 'Next' });
      if (r && r.pid) orderBuilder([r.pid], { [r.pid]: 0 }, { past: true });
    };
  }
  function facCard(st, fid, ps) {
    const f = st.factories.find(x => x.id === fid);
    const rows = ps.map(p => ({ p, ...plan(p), out: EXCL.has(p.id) }));
    const inc = rows.filter(r => !r.out && r.qty > 0);
    const units = inc.reduce((a, r) => a + r.qty, 0), cost = inc.reduce((a, r) => a + r.qty * (r.p.cost || 0), 0);
    const lead = Math.max(0, ...ps.map(p => p.leadDays || 0));
    const now = ps.filter(p => p.overdue || p.status === 'out');
    const by = ps.map(p => p.orderByDate).filter(Boolean).sort()[0];
    const why = now.length ? `Due now: ${plural(now.length, 'product')} ${now.length === 1 ? 'is' : 'are'} out or past the order-by date. Every week of waiting costs about ${int(now.reduce((a, p) => a + p.perWeek, 0))} sales.` : `Place it by ${day(by)} so the stock lands before the shelf runs out.`;
    const fact = (l, v) => `<div><span>${l}</span><b>${v}</b></div>`;
    return `<section class="v2card spx-oc">
      <div class="spx-och"><div class="spx-oct"><h3>${esc(f ? f.name : 'No factory yet')}</h3>${now.length ? '<span class="ds-chip bad">Due now</span>' : '<span class="ds-chip warn">Due within two weeks</span>'}</div>
        ${f ? btn(`Build this order ${ic('arrow-right', 14)}`, `data-build="${esc(fid)}"`, 'primary') : btn('Give these a factory', 'data-sp-set="1"')}</div>
      <p class="v2say">${why}</p>
      <div class="spx-facts">${fact('Products', inc.length)}${fact('Units', int(units))}${fact('At cost', money(cost))}${fact('Lands if placed today', lead ? day(add(st.today, lead)) : '–')}${fact('Lead time', f ? `${f.production_days + f.shipping_days + (st.settings.buffer_days || 0)} days` : '–')}</div>
      <div class="spx-olines">${rows.map(({ p, yrs, under, skip, qty, out }) => {
        const sizes = qty && qty === p.suggested && (p.suggestedLines || []).length ? p.suggestedLines.slice().sort((a, b) => b.qty - a.qty) : null;
        const reason = skip ? `<b class="spx-warn">Skip it, or call it a one-off.</b> The ${p.moq} minimum is ${one(yrs)} years of sales.` : under ? `Raised to the factory's ${p.moq} minimum (${one(yrs)} years of sales).` : p.status === 'gap' ? (qty ? 'The order on its way lands too late; this tops up the sizes that run short.' : `The order on its way covers it but lands ${Math.max(0, between(st.today, p.incomingLands) - (p.runOutDays || 0))} days after it runs out. Sell the gap on pre-order.`) : p.overdue || p.status === 'out' ? `Each week of waiting loses about ${Math.max(1, Math.round(p.perWeek))} sales.` : `Order by ${day(p.orderByDate)}. Covers ${Math.round(st.settings.cover_days / 30)} months after it lands.`;
        return `<div class="spx-ol ${out ? 'out' : ''}">
          <div class="spx-pn" data-sp-p="${esc(p.id)}" role="button" tabindex="0">${av(p)}<div><b>${esc(p.title)}</b><span>${p.status === 'out' ? '<b class="spx-bad">Out now</b>' : `Runs out ${day(p.runOutDate)}`} · ${perDay(p.velocity)} a day${p.sizeGap && p.sizeGap.length ? ` · ${plural(p.sizeGap.length, 'size')} empty` : ''}</span></div></div>
          <div class="spx-why">${reason}${sizes ? `<div class="spx-sizes">${sizes.slice(0, 4).map(l => `<span class="ds-chip">${esc(l.axis || l.sku)} <b>${int(l.qty)}</b></span>`).join('')}${sizes.length > 4 ? `<span class="spx-mut">+${sizes.length - 4} more sizes</span>` : ''}</div>` : qty ? '<div class="spx-mut">Split by size when you build it.</div>' : ''}</div>
          <div class="spx-q"><b>${qty ? int(qty) : '–'}</b><span>${qty ? money(qty * (p.cost || 0)) + ' at cost' : 'not ordered'}</span></div>
          <div class="spx-io">${skip ? btn('It was a one-off', `data-oneoff="${esc(p.id)}"`, 'sm') : `<div class="ds-seg" role="radiogroup" aria-label="In this order"><button type="button" class="${out ? '' : 'on'}" data-x="${esc(p.id)}" data-v="in">In</button><button type="button" class="${out ? 'on' : ''}" data-x="${esc(p.id)}" data-v="out">Out</button></div>`}</div></div>`; }).join('')}</div></section>`;
  }
  /* An order on its way: four stages in a row, each with its date, the current one marked. No label floats. */
  function steps(list, cur) {
    return `<ol class="spx-steps" style="--n:${list.length}">${list.map(([l, dt, note, late], i) => `<li class="${i < cur ? 'done' : i === cur ? 'now' : ''}${late ? ' late' : ''}"><i></i><b>${esc(l)}</b><span>${dt ? day(dt) : '–'}${note ? ` · ${esc(note)}` : ''}</span></li>`).join('')}</ol>`;
  }
  function poRow(st, o) {
    const sent = o.sent_at || st.today, f = st.factories.find(x => x.id === o.factory_id);
    const shipBy = o.productionEnd || (f ? add(sent, f.production_days) : null);
    const idx = { sent: 0, confirmed: 0, production: 1, shipped: 2, partial: 3 }[o.status] ?? 0;
    const left = o.expected_at ? between(st.today, o.expected_at) : null;
    const chip = o.likelyLanded ? '<span class="ds-chip good">Looks landed</span>' : o.overdue ? '<span class="ds-chip bad">Late</span>' : `<span class="ds-chip">${esc({ sent: 'Placed', confirmed: 'Placed', production: 'In production', shipped: 'Shipped', partial: 'Partly landed' }[o.status] || o.status)}</span>`;
    const tot = o.expected_at ? Math.max(1, between(sent, o.expected_at)) : null, pct = tot ? Math.max(0, Math.min(100, between(sent, st.today) / tot * 100)) : 0;
    return `<div class="spx-po" role="button" tabindex="0" data-o="${esc(o.id)}">
      <div class="spx-poh"><b>${esc(o.id)}</b>${chip}<span class="spx-mut">${esc(o.factoryName || '')} · ${int(o.units)} units · ${money(o.atCost)} at cost</span><span class="spx-grow"></span><span class="spx-land">${o.expected_at ? `Lands ${day(o.expected_at)}${left != null ? ` · ${left > 0 ? `in ${left} days` : left === 0 ? 'today' : `${-left} days late`}` : ''}` : 'No landing date'}</span></div>
      ${steps([['Placed', sent, ''], ['In production', o.confirmed_at || sent, ''], ['Ships', shipBy, idx < 2 ? 'expected' : ''], ['Lands', o.expected_at, idx < 3 ? 'expected' : '', o.overdue]], idx)}
      ${tot ? `<div class="spx-prog"${tip(`Day ${Math.max(0, between(sent, st.today))} of ${tot} from placed to landed`)}><i style="width:${pct.toFixed(1)}%"></i></div>` : ''}
      <div class="spx-mut spx-pot">${esc(o.productTitles.join(', '))}</div></div>`;
  }
  /* The order: sizes and quantities for one factory, then Save as draft or Copy and mark placed. */
  function orderBuilder(ids, qtyOf = {}, opt = {}) {
    const { st, brand } = CUR;
    const ps = ids.map(id => st.products.find(p => String(p.id) === String(id))).filter(Boolean);
    if (!ps.length) return;
    const fid = ps[0].factoryId || null, f = st.factories.find(x => x.id === fid);
    const mine = ps.filter(p => (p.factoryId || null) === fid), rest = ps.filter(p => (p.factoryId || null) !== fid);
    const lead = Math.max(0, ...mine.map(p => p.leadDays || 0));
    const Q = {};   // variant id -> qty, seeded from the plan split by the product's own suggestion
    for (const p of mine) {
      const want = qtyOf[p.id] != null ? qtyOf[p.id] : p.suggested;
      const base = p.variants.map(v => Math.max(0, v.suggested || 0)); const sum = base.reduce((a, x) => a + x, 0);
      const curve = (st.lines.find(l => l.id === p.lineId) || {}).sizeCurve || {};
      const shares = p.variants.map((v, i) => sum ? base[i] / sum : (curve[v.sizeKey] ?? 1 / p.variants.length));
      const m = shares.reduce((a, x) => a + x, 0) || 1;
      p.variants.forEach((v, i) => { Q[v.id] = want ? Math.round(want * shares[i] / m) : 0; });
    }
    const today = st.today;
    const draw = () => {
      const units = mine.reduce((a, p) => a + p.variants.reduce((s, v) => s + (Q[v.id] || 0), 0), 0);
      const cost = mine.reduce((a, p) => a + p.variants.reduce((s, v) => s + (Q[v.id] || 0) * (v.cost ?? p.cost ?? 0), 0), 0);
      return `${int(units)} units · about ${money(cost)} at cost`;
    };
    const body = panel(`New order to ${f ? f.name : 'a factory'}`, `
      <p class="v2say">${plural(mine.length, 'product')} · ${lead} day lead time · lands about <b>${day(add(today, lead))}</b> if placed today${rest.length ? ` · ${plural(rest.length, 'product')} from another factory get their own order next` : ''}</p>
      <div class="spx-form"><div class="spx-f"><label for="spOs">Placed on</label><input class="spx-in" id="spOs" type="date" value="${today}" max="${today}"></div><div class="spx-f"><label for="spOe">Expected landing</label><input class="spx-in" id="spOe" type="date" value="${add(today, lead)}"><p class="spx-help">From the lead time. Change it when the factory confirms.</p></div></div>
      ${mine.map(p => `<section class="v2card"><div class="v2h"><h3>${esc(p.title)}</h3><span class="cap">${p.moq ? `minimum ${p.moq} a style` : 'no minimum'}</span>${p.moq ? btn(`Fill to ${p.moq} by size mix`, `data-fill="${esc(p.id)}"`, 'sm') : ''}</div>
        <div class="v2tbl"><table><thead><tr><th>Size</th><th>On hand</th><th>Runs out</th><th>Need</th><th>Order</th></tr></thead><tbody>${p.variants.map(v => `<tr><td>${esc(v.axis || v.sku || v.title || '–')}${v.isCore ? ' <span class="v2pill">core</span>' : ''}</td><td>${v.onHand}</td><td>${v.runOutDays == null ? '–' : v.onHand <= 0 ? '<b class="spx-bad">out</b>' : v.runOutDays + ' days'}</td><td>${v.suggested || 0}</td><td><input class="spx-in qty" type="number" min="0" value="${Q[v.id]}" data-v="${esc(v.id)}" aria-label="${esc(v.axis || v.sku || 'size')} quantity"></td></tr>`).join('')}</tbody></table></div></section>`).join('')}
      <div class="spx-f"><label for="spOn">Note to the factory</label><textarea class="spx-in" id="spOn" placeholder="Same specs as the last order"></textarea></div>
      <div class="spx-acts"><b id="spOt">${draw()}</b><span class="spx-grow"></span>${btn('Save as draft', 'id="spOd"')}${btn('Copy the order text and mark placed', 'id="spOp"', 'primary')}</div>`);
    if (!body) return;
    body.querySelectorAll('[data-v]').forEach(i => i.oninput = () => { Q[i.dataset.v] = Math.max(0, +i.value || 0); body.querySelector('#spOt').textContent = draw(); });
    body.querySelectorAll('[data-fill]').forEach(bn => bn.onclick = () => {
      const p = mine.find(x => String(x.id) === bn.dataset.fill); const curve = (st.lines.find(l => l.id === p.lineId) || {}).sizeCurve || {};
      const sh = p.variants.map(v => curve[v.sizeKey] ?? 1 / p.variants.length); const m = sh.reduce((a, x) => a + x, 0) || 1;
      let tot = 0; p.variants.forEach((v, i) => { Q[v.id] = Math.max(Q[v.id] || 0, Math.round(p.moq * sh[i] / m)); tot += Q[v.id]; });
      while (tot < p.moq) { const i = sh.indexOf(Math.max(...sh)); Q[p.variants[i].id]++; tot++; }
      p.variants.forEach(v => { const inp = body.querySelector(`[data-v="${CSS.escape(String(v.id))}"]`); if (inp) inp.value = Q[v.id]; });
      body.querySelector('#spOt').textContent = draw();
    });
    body.querySelector('#spOs').onchange = e => { body.querySelector('#spOe').value = add(e.target.value || today, lead); };
    const submit = async status => {
      const lines = mine.flatMap(p => p.variants.map(v => ({ variant_id: v.id, product_id: p.id, qty: Q[v.id] || 0, unit_cost: v.cost ?? p.cost ?? null })).filter(l => l.qty > 0));
      if (!lines.length) return toast('Every quantity is zero.', true);
      const sent = body.querySelector('#spOs').value, exp = body.querySelector('#spOe').value, notes = body.querySelector('#spOn').value;
      if (status === 'sent') {
        const text = [`Purchase order to ${f ? f.name : 'factory'} · ${day(sent, true)}`, `Requested landing: ${day(exp, true)}`, '', ...mine.flatMap(p => { const ls = p.variants.filter(v => Q[v.id] > 0); return ls.length ? [`${p.title} (${ls.reduce((a, v) => a + Q[v.id], 0)} units)`, ...ls.map(v => `  ${v.sku || v.axis || v.title}${v.axis && v.sku ? ` · ${v.axis}` : ''}: ${Q[v.id]}`), ''] : []; }), notes ? `Notes: ${notes}` : ''].join('\n');
        try { await navigator.clipboard.writeText(text); } catch { /* the order is still recorded */ }
      }
      try { await save(brand.id, '/api/orders', { factory_id: fid, status, sent_at: sent, expected_at: exp, notes, lines }, 'POST', status === 'sent' ? 'Order placed, and its text copied for the factory' : 'Draft saved'); } catch { return; }
      for (const p of mine) EXCL.delete(p.id);
      closePanel();
      if (rest.length) { await refresh(); orderBuilder(rest.map(p => p.id), qtyOf); } else { STATE.delete(brand.id); H.S.tab === 'buying' ? renderBuying(false) : H.show('buying'); }
    };
    body.querySelector('#spOd').onclick = () => submit('draft');
    body.querySelector('#spOp').onclick = () => submit('sent');
    if (opt.past) body.querySelector('#spOp').textContent = 'Save as placed';
  }
  function openOrder(id) {
    const { st, brand } = CUR; const o = st.orders.find(x => x.id === id); if (!o) return;
    const editable = !['landed', 'cancelled'].includes(o.status);
    const next = { draft: ['sent', 'Mark placed'], sent: ['production', 'Mark in production'], confirmed: ['production', 'Mark in production'], production: ['shipped', 'Mark shipped'], shipped: ['landed', 'Mark landed'], partial: ['landed', 'Mark fully landed'] }[o.status];
    const f = st.factories.find(x => x.id === o.factory_id), sent = o.sent_at || st.today;
    const idx = { sent: 0, confirmed: 0, production: 1, shipped: 2, partial: 3, landed: 4 }[o.status] ?? 0;
    const body = panel(`${o.id} · ${o.productTitles[0] || ''}${o.productTitles.length > 1 ? ` +${o.productTitles.length - 1}` : ''}`, `
      <p class="v2say">${esc(o.factoryName || 'No factory')} · ${int(o.units)} units${o.atCost ? ` · ${money(o.atCost)} at cost` : ''}</p>
      ${o.status === 'draft' ? `<div class="spx-box info"><b>A draft.</b> It changes nothing until it is placed.</div>` : steps([['Placed', sent, ''], ['In production', o.confirmed_at || sent, ''], ['Ships', o.productionEnd || (f ? add(sent, f.production_days) : null), idx < 2 ? 'expected' : ''], ['Lands', o.landed_at || o.expected_at, idx < 3 ? 'expected' : '', o.overdue]], idx)}
      ${o.likelyLanded ? `<div class="spx-box good"><b>This looks landed.</b> Stock on these sizes rose ${int(o.jumpUnits)} units since it was placed. Check the received counts and mark it landed.</div>` : ''}
      <div class="spx-form"><div class="spx-f"><label for="spDs">Placed</label><input class="spx-in" id="spDs" type="date" value="${o.sent_at || ''}" ${editable ? '' : 'disabled'}></div><div class="spx-f"><label for="spDe">Expected landing</label><input class="spx-in" id="spDe" type="date" value="${o.expected_at || ''}" ${editable ? '' : 'disabled'}></div>
        <div class="spx-f"><label for="spDd">Deposit</label><input class="spx-in" id="spDd" value="${esc(o.deposit || '')}" placeholder="50% paid Aug 14"></div><div class="spx-f"><label for="spDt">Tracking</label><input class="spx-in" id="spDt" value="${esc(o.tracking || '')}" placeholder="Carrier and number"></div>
        <div class="spx-f wide"><label for="spDn">Notes</label><textarea class="spx-in" id="spDn">${esc(o.notes || '')}</textarea></div></div>
      <section class="v2card"><div class="v2h"><h3>Lines</h3><span class="find">${editable ? 'Type received counts as boxes arrive; the rest stays on the way.' : 'Landed.'}</span></div><div class="v2tbl"><table><thead><tr><th>Product</th><th>Size</th><th>Ordered</th><th>Received</th><th>On hand now</th><th>After landing</th></tr></thead><tbody>
        ${o.lines.map(l => `<tr><td>${esc(l.productTitle)}</td><td>${esc(l.axis || l.sku || '')}</td><td><input class="spx-in qty" type="number" min="0" value="${l.qty}" data-q="${esc(l.variant_id)}" ${editable ? '' : 'disabled'}></td><td><input class="spx-in qty" type="number" min="0" value="${l.received}" data-r="${esc(l.variant_id)}" ${editable ? '' : 'disabled'}></td><td>${l.onHand == null ? '–' : l.onHand}</td><td>${int((l.onHand || 0) + Math.max(0, l.qty - l.received))}</td></tr>`).join('')}</tbody></table></div></section>
      <p class="v2hint">Shopify stock is checked every hour. When these sizes jump by about half of what is outstanding, the order shows as "looks landed" here and in Slack.</p>
      <div class="spx-acts">${btn('Save', 'id="spDsv"')}${next ? btn(next[1], 'id="spDnx"', 'primary') : ''}<span class="spx-grow"></span>${editable && o.status !== 'draft' ? btn('Cancel order', 'id="spDc" style="color:var(--bad)"', 'ghost') : ''}${['draft', 'cancelled'].includes(o.status) ? btn('Delete', 'id="spDx" style="color:var(--bad)"', 'ghost') : ''}</div>`);
    if (!body) return;
    const patch = () => ({ sent_at: body.querySelector('#spDs').value || null, expected_at: body.querySelector('#spDe').value || null, deposit: body.querySelector('#spDd').value, tracking: body.querySelector('#spDt').value, notes: body.querySelector('#spDn').value,
      lines: o.lines.map(l => ({ variant_id: l.variant_id, product_id: l.product_id, qty: +(body.querySelector(`[data-q="${CSS.escape(String(l.variant_id))}"]`)?.value ?? l.qty), received: +(body.querySelector(`[data-r="${CSS.escape(String(l.variant_id))}"]`)?.value ?? l.received), unit_cost: l.unit_cost })) });
    const after = async () => { await refresh(); openOrder(id); };
    body.querySelector('#spDsv').onclick = () => save(brand.id, `/api/orders/${encodeURIComponent(id)}`, patch()).then(after).catch(() => {});
    if (next) body.querySelector('#spDnx').onclick = async () => {
      const bodyX = { ...patch(), status: next[0] };
      if (next[0] === 'landed') { const ok = await H.confirmModal('Mark this order landed?', 'Every line counts as fully received unless you typed received counts. The stock should already show in Shopify.', 'Mark landed'); if (!ok) return; if (!bodyX.lines.some(l => l.received)) bodyX.lines = bodyX.lines.map(l => ({ ...l, received: l.qty })); }
      save(brand.id, `/api/orders/${encodeURIComponent(id)}`, bodyX, 'PUT', next[0] === 'landed' ? 'Landed' : 'Updated').then(after).catch(() => {});
    };
    if (body.querySelector('#spDc')) body.querySelector('#spDc').onclick = async () => { if (!(await H.confirmModal('Cancel this order?', 'It stops counting as stock on the way. The record stays for the history.', 'Cancel order'))) return; save(brand.id, `/api/orders/${encodeURIComponent(id)}`, { status: 'cancelled' }).then(() => { closePanel(); refresh(); }).catch(() => {}); };
    if (body.querySelector('#spDx')) body.querySelector('#spDx').onclick = async () => { if (!(await H.confirmModal('Delete this order?', 'Gone for good. Only drafts and cancelled orders can be deleted.', 'Delete'))) return; save(brand.id, `/api/orders/${encodeURIComponent(id)}`, null, 'DELETE', 'Deleted').then(() => { closePanel(); refresh(); }).catch(() => {}); };
  }

  /* ===================================================================================
   * DROPS (brands that design their own products)
   * ================================================================================= */
  const SLOT = { needs_brief: ['', 'Needs a brief'], in_design: ['on', 'In design'], tech_pack: ['on', 'Tech pack'], sampling: ['on', 'Sampling'], approved: ['good', 'Approved'], ordered: ['good', 'Ordered'], live: ['good', 'Live'] };
  const slotChip = s => { const [k, l] = SLOT[s] || ['', s]; return `<span class="ds-chip ${k}">${esc(l)}</span>`; };
  const DROP = { get: () => { try { return localStorage.getItem('sp_drop') || ''; } catch { return ''; } }, set: v => { try { localStorage.setItem('sp_drop', v); } catch {} } };
  async function renderDrops(first) {
    const tab = 'drops';
    if (first || !$('#main .spx')) loading(tab, 'Drops');
    try { await loadBrands(); } catch (e) { return fail(tab, 'Drops', e); }
    let act = H.S.act;
    /* An Asana task's link names the design, not the brand: open the brand that makes products. */
    const pendingDesign = PENDING.peek('design');
    if (pendingDesign && (act === 'all' || !(brandOf(act) || {}).makes)) { const mk = (BRANDS || []).find(x => x.makes); if (mk) { H.S.act = act = locusId(mk.act_id); try { localStorage.setItem('pf_act', act); } catch {} const cp = document.getElementById('clientPick'); if (cp) cp.value = act; } }
    if (act === 'all') return msg(tab, 'Drops', empty('layers', 'Drops is per brand. Pick a brand that designs its own products in the client picker.'));
    const b = brandOf(act);
    if (!b || !b.makes) return noFeed(tab, (H.S.accounts.find(a => a.act_id === act) || {}).name || 'This brand');
    const run = H.RUN();
    let st, ads; try { [st, ads] = await Promise.all([state(b.id), stockAds(act)]); } catch (e) { return fail(tab, 'Drops', e); }
    if (run !== H.RUN()) return;
    CUR = { brand: b, st, ads, J: judge(st, ads) };
    const cols = st.collections || [];
    const col = cols.find(c => c.id === DROP.get()) || cols.find(c => c.drop_at >= st.today) || cols[0];
    const mine = col ? st.slots.filter(s => s.collection_id === col.id) : [];
    const loose = st.slots.filter(s => !s.collection_id && s.status !== 'live');
    const d = mine[0] && mine[0].dates;
    const groups = {}; for (const s of st.slots) if (s.next && s.status !== 'live') { const k = `${s.next.on}|${s.next.what}|${s.collectionName || ''}|${s.lineName || ''}`; (groups[k] = groups[k] || []).push(s); }
    const dueList = [...Object.entries(groups).map(([k, ss]) => { const [on, what, c, line] = k.split('|'); return { on, late: ss[0].next.late, h: `${ss.length > 1 ? ss.length + ' ' : ''}${what.toLowerCase()}${ss.length > 1 ? 's' : ''} due`, s: `${c || 'No drop'} · ${line}` }; }),
      ...st.orders.filter(o => OPEN.includes(o.status)).map(o => ({ on: o.expected_at, late: o.overdue, h: isClient() ? 'A restock lands' : `${o.id} lands`, s: `${int(o.units)} units from ${o.factoryName || 'the factory'}` }))].filter(x => x.on).sort((x, y) => x.on < y.on ? -1 : 1).slice(0, 6);
    const planned = st.lines.filter(l => (st.db.lines.find(x => x.id === l.id) || {}).target_designs != null);
    const nextOf = mine.filter(s => s.next).sort((x, y) => x.next.on < y.next.on ? -1 : 1)[0];
    const lateN = mine.filter(s => s.next && s.next.late).length;
    const lead = col ? `<b>${esc(col.name)}</b> goes on the site ${day(col.drop_at, true)}${nextOf ? `. Next: ${plural(mine.filter(s => s.next && s.next.on === nextOf.next.on && s.next.what === nextOf.next.what).length, nextOf.next.what.toLowerCase())} ${nextOf.next.late ? `<b class="spx-bad">was due ${day(nextOf.next.on)}</b>` : `due ${day(nextOf.next.on)}`}` : ''}.` : 'No drop planned yet.';
    const facIds = new Set(mine.map(x => x.factoryId).filter(Boolean));
    const cny = st.factories.filter(f => !facIds.size || facIds.has(f.id)).flatMap(f => (f.closures || []).map(c => ({ ...c, f: f.name }))).filter(c => d && c.to >= st.today && c.from <= d.onSite);
    const byStage = {}; for (const s of mine) byStage[s.status] = (byStage[s.status] || 0) + 1;
    const checked = st.slots.map(s => s.asana_checked).filter(Boolean).sort().pop();
    const tiles = UI() && col ? [
      UI().tile({ label: 'On the site', value: day(col.drop_at), sub: `${esc(col.name)}, in ${between(st.today, col.drop_at)} days.` }),
      UI().tile({ label: 'Designs in it', value: String(mine.length), sub: Object.entries(byStage).map(([k, n]) => `${n} ${(SLOT[k] || ['', k])[1].toLowerCase()}`).join(', ') || 'None yet.' }),
      UI().tile({ label: 'Next step', value: nextOf ? day(nextOf.next.on) : '–', sub: nextOf ? `${esc(nextOf.next.what)}${nextOf.next.late ? ', late' : `, in ${nextOf.next.days} days`}.` : 'Every design is past its last step.' }),
      UI().tile({ label: 'Late steps', value: String(lateN), sub: lateN ? 'Designs past a due date. Open one to see which step.' : 'Nothing is late.' }),
    ].join('') : '';
    const CL = isClient();
    const dropOpts = cols.map(c => [c.id, c.name, `On the site ${day(c.drop_at, true)} · ${plural(c.designs || 0, 'design')}`]);
    $('#main').innerHTML = frame(tab, 'Drops', `
      <p class="v2say lead">${lead}</p>
      <div class="spx-upd"><span>${ic('clock', 14)}Stock read ${esc(asOf(st))}${checked ? `. Asana checked ${esc(asOfStamp(checked))}` : ''}.</span>${CL ? '' : btn(`${ic('refresh', 14)}Refresh`, 'data-sp-refresh="1"', 'sm ghost')}</div>
      <div class="spx-bar">${cols.length && window.PillMenu ? window.PillMenu.html('spDropPick', 'Drop', dropOpts, col && col.id) : ''}<span class="spx-grow"></span>${CL ? '' : `${col ? btn(`${ic('pencil', 14)}Edit the drop`, 'id="spEdDrop"') : ''}${btn(`${ic('plus', 14)}New drop`, 'id="spNewDrop"', 'primary')}`}</div>
      ${col ? `<div class="v2tiles">${tiles}</div>
      <section class="v2card"><div class="v2h"><h3>The dates for ${esc(col.name)}</h3><span class="find">${CL ? 'Every step is worked back from the day it goes on the site, with the factory\'s lead time.' : 'You set one date: when it goes on the site. Every step is worked back from it with the factory\'s lead time. Move the drop and every date moves, Asana due dates too.'}</span></div>
        ${d ? steps([['Brief', d.briefDue, '', d.briefDue < st.today], ['Tech pack', d.techPackDue, '', d.techPackDue < st.today], ['Sample approved', d.sampleDue, '', d.sampleDue < st.today], ['Order placed', d.orderBy, '', d.orderBy < st.today], ['Stock lands', d.lands, ''], ['On the site', d.onSite, '']].map(x => [x[0], x[1], x[1] && x[1] >= st.today ? `in ${between(st.today, x[1])} days` : '', false]), [d.briefDue, d.techPackDue, d.sampleDue, d.orderBy, d.lands, d.onSite].filter(x => x && x < st.today).length) : empty('calendar', 'Add a design to see its dates.')}
        ${cny.length ? `<p class="v2hint spx-closed">${ic('alert', 14)} Factory closed: ${esc(cny.map(c => `${c.f || 'The factory'} ${day(c.from)} to ${day(c.to)}${c.label ? ' (' + c.label + ')' : ''}`).join('; '))}. Those days are skipped when the dates are worked out.</p>` : ''}</section>
      <div class="v2two">
        <section class="v2card"><div class="v2h"><h3>Designs in ${esc(col.name)}</h3><span class="find">${CL ? 'Click one for its dates and where its sample is.' : 'Click one for its dates, sample and Asana task. Its Asana column sets the stage.'}</span></div>
          ${mine.length ? `<div class="v2tbl"><table><thead><tr><th>Design</th><th>Stage</th><th>Next step</th><th>Sample or stock</th></tr></thead><tbody>${mine.map(s => `<tr class="link" data-s="${esc(s.id)}" tabindex="0"><td><b>${esc(s.name.replace(col.name + ' · ', ''))}</b><span class="sub">${esc(s.lineName || '')}</span></td><td>${slotChip(s.status)}</td><td>${s.next ? `${esc(s.next.what)}<span class="sub ${s.next.late ? 'spx-bad' : ''}">${s.next.late ? 'was due ' : 'by '}${day(s.next.on)}</span>` : '–'}</td><td>${s.made ? `<span class="ds-chip ${s.made.status === 'landed' ? 'good' : 'warn'}">${esc(s.made.label)}</span>` : s.sample ? `<span class="ds-chip ${s.sample.state === 'in hand' ? 'good' : 'on'}">${esc(s.sample.label)}</span>` : '<span class="spx-mut">nothing made yet</span>'}</td></tr>`).join('')}</tbody></table></div>` : empty('layers', 'Nothing in this drop yet.')}
          ${CL ? '' : `<div class="spx-acts">${(planned.length ? planned : st.lines.filter(l => l.planned)).map(l => btn(`${ic('plus', 14)}${esc(l.name)}`, `data-addl="${esc(l.id)}"`, 'sm')).join('')}${btn(`${ic('plus', 14)}Another group`, 'data-addl=""', 'sm')}${mine.some(s => !s.asana_task) ? btn('Make the missing Asana tasks', 'id="spCatch"', 'sm') : ''}</div>`}</section>
        <section class="v2card"><div class="v2h"><h3>Coming due</h3><span class="find">Every design step and factory order, soonest first.</span></div>
          ${dueList.length ? `<ul class="spx-due">${dueList.map(x => `<li><span class="spx-dd ${x.late ? 'late' : ''}"><b>${day(x.on)}</b><em>${x.late ? 'late' : `in ${between(st.today, x.on)} days`}</em></span><span><b>${esc(x.h[0].toUpperCase() + x.h.slice(1))}</b><span class="spx-mut">${esc(x.s)}</span></span></li>`).join('')}</ul>` : empty('check', 'Nothing due.')}</section>
      </div>` : `<section class="v2card">${empty('layers', CL ? '<b>No drops planned yet.</b><br>A drop is the new designs that go on the site the same day. They show here once Mobius plans one.' : '<b>No drops yet.</b><br>A drop is the new designs that go on the site the same day: a themed collection or a plain refresh. Give it a name and a date, then add designs from any group.', CL ? '' : btn('New drop', 'data-newdrop="1"', 'primary'))}</section>`}
      ${!CL && (st.asanaLoose || []).length ? `<section class="v2card"><div class="v2h"><h3>Started in Asana, not in a drop</h3><span class="find">Make one a design and it gets a group, a drop and every date. The Asana card stays the same.</span></div><div class="v2tbl"><table><tbody>${st.asanaLoose.map(t => `<tr><td><b>${esc(t.name)}</b><span class="sub">${esc(t.section || 'no column')}</span></td><td><div class="spx-acts end"><a class="ds-btn sm ghost" href="${esc(t.url)}" target="_blank" rel="noopener">${ic('external-link', 14)}Asana</a>${btn('Make it a design', `data-claim="${esc(t.gid)}"`, 'sm')}</div></td></tr>`).join('')}</tbody></table></div></section>` : ''}
      ${loose.length ? `<section class="v2card"><div class="v2h"><h3>Designs not in a drop</h3></div><div class="v2tbl"><table><tbody>${loose.map(s => `<tr class="link" data-s="${esc(s.id)}" tabindex="0"><td><b>${esc(s.name)}</b><span class="sub">${esc(s.lineName || '')}</span></td><td>${slotChip(s.status)}</td></tr>`).join('')}</tbody></table></div></section>` : ''}
      <div class="ds-label spx-sec">Keep or cut</div>
      ${planned.map(l => keepCut(st, l)).join('') || `<section class="v2card">${empty('sliders', CL ? 'Keep or cut shows once a group has a target number of designs.' : 'Keep or cut shows for a group with a target number of designs. Set one in Brand settings, Stock and factories.', CL ? '' : btn('Open Stock and factories', 'data-sp-set="1"'))}</section>`}`);
    const root = $('#main'); wireCommon(root);
    if (window.PillMenu) window.PillMenu.wire(root.querySelector('#spDropPick'), v => { DROP.set(v); renderDrops(false); });
    if (root.querySelector('#spNewDrop')) root.querySelector('#spNewDrop').onclick = () => editDrop(null);
    root.querySelectorAll('[data-newdrop]').forEach(x => x.onclick = () => editDrop(null));
    if (root.querySelector('#spEdDrop')) root.querySelector('#spEdDrop').onclick = () => editDrop(col);
    const os = CL ? slotView : openSlot;
    root.querySelectorAll('tr[data-s]').forEach(tr => { tr.onclick = () => os(tr.dataset.s); tr.onkeydown = e => { if (e.key === 'Enter') os(tr.dataset.s); }; });
    root.querySelectorAll('[data-addl]').forEach(bn => bn.onclick = () => addDesigns(col, bn.dataset.addl));
    root.querySelectorAll('[data-kc]').forEach(bn => bn.onclick = e => { e.stopPropagation(); const [pid, v] = bn.dataset.kc.split('|'); save(b.id, `/api/products/${encodeURIComponent(pid)}`, { decision: v || null }, 'PUT', v === 'cut' ? 'Cut. It stops reordering and sells down.' : v === 'keep' ? 'Kept' : 'Back to the rule').then(() => { STATE.delete(b.id); renderDrops(false); }).catch(() => {}); });
    root.querySelectorAll('[data-claim]').forEach(bn => bn.onclick = () => claim(bn.dataset.claim));
    if (root.querySelector('#spCatch')) root.querySelector('#spCatch').onclick = async () => {
      const todo = mine.filter(s => !s.asana_task); let made = 0;
      for (const s of todo) { try { await sapi(b.id, `/api/slots/${encodeURIComponent(s.id)}/asana`, { method: 'POST' }); made++; } catch (e) { toast(e.message, true); break; } }
      if (made) toast(`${plural(made, 'Asana task')} made`); STATE.delete(b.id); renderDrops(false);
    };
    const pd = PENDING.take('design'); if (pd) os(pd);
  }
  /* "2026-10-09 21:52:17" (UTC, from D1) as "today at 4:52 PM Central". */
  const asOfStamp = s => asOf({ lastRun: String(s).replace(' ', 'T') + 'Z' });
  /* KEEP OR CUT, per group: the rule in one sentence, then one row per design. One colour for every bar;
     the dashed line is the cut line. Rule says / Your call are separate so an override is visible. */
  function keepCut(st, l) {
    const rows = l.plan.map(x => ({ ...x, p: st.products.find(p => p.id === x.productId) })).filter(x => x.p);
    const heavy = l.weeksOfCover != null && l.weeksOfCover > 52;
    const open = heavy ? 0 : l.openSlots;
    const max = Math.max(1, ...rows.map(x => x.p.sold90));
    const band = rows.filter(x => x.band), cutAt = band.length ? Math.max(...band.map(x => x.p.sold90)) : null;
    const curve = Object.entries(l.sizeCurve || {}).filter(([k]) => k);
    const per = l.moq || (st.factories.find(f => f.id === l.factoryId) || {}).moq_default || 100;
    const costs = rows.map(x => x.p.cost).filter(x => x != null).sort((a, b) => a - b), unit = costs.length ? costs[Math.floor(costs.length / 2)] : null;
    const designs = l.keep + l.decide + open;
    const noun = l.name.toLowerCase();
    const ruleSays = x => x.band ? 'cut' : x.near ? 'decide' : 'keep';
    const RS = { keep: ['good', 'Keep'], decide: ['warn', 'Your call'], cut: ['bad', 'Cut'] };
    const n = (v, t, k) => `<div><b class="${k || ''}">${v}</b><span>${t}</span></div>`;
    return `<section class="v2card spx-kc"><div class="v2h"><h3>${esc(l.name)}: keep or cut</h3><span class="cap">target ${l.target ?? '–'} designs</span></div>
      <p class="v2say"><b>The rule:</b> rank the ${plural(rows.length, noun.replace(/s$/, ''), noun)} by units sold in the last 90 days. ${l.cutRulePct ? `The bottom ${l.cutRulePct}% are cut: they are not reordered and sell down. The ones just above that line are your call. The rest are kept.` : 'There is no cut zone set, so you cut by hand.'} Your call always wins over the rule.</p>
      <div class="spx-kcn">${n(l.keep, 'keep', 'spx-good')}${n(l.decide, 'your call', 'spx-warn')}${n(l.cut, 'cut', 'spx-bad')}${n(open, 'new to make')}</div>
      ${heavy ? `<div class="spx-box warn"><b>Hold new ${esc(noun)}.</b> The group has ${l.weeksOfCover} weeks of stock at today's pace (${int(l.onHand)} on hand). New designs wait until it clears; push the slow ones in ads instead.</div>` : ''}
      <div class="v2lg spx-lg"><span><i style="background:var(--brand)"></i>Units sold, last 90 days</span>${cutAt != null ? '<span><i style="border-top:2px dashed var(--bad);height:0;background:transparent"></i>The cut line: at or below it is the cut zone</span>' : ''}</div>
      <div class="v2tbl"><table><thead><tr><th>#</th><th>Design</th><th>Sold, 90 days</th><th>On hand</th><th>Rule says</th><th>Your call</th></tr></thead><tbody>
      ${rows.map(x => { const rs = ruleSays(x), st2 = x.decided ? x.state : null; return `<tr class="link" data-sp-p="${esc(x.p.id)}"><td class="spx-mut">${x.rank}</td><td><div class="spx-pn">${av(x.p)}<div><b>${esc(x.p.title)}</b></div></div></td>
        <td class="spx-barc"><span class="spx-kbar"${tip(`${x.p.sold90} sold in 90 days${cutAt != null ? `; the cut line is ${cutAt}` : ''}`)}><i style="width:${(x.p.sold90 / max * 100).toFixed(1)}%"></i>${cutAt != null ? `<em style="left:${(cutAt / max * 100).toFixed(1)}%"></em>` : ''}</span><b>${x.p.sold90}</b></td>
        <td>${int(x.p.onHand)}</td><td><span class="ds-chip ${RS[rs][0]}">${RS[rs][1]}</span></td>
        <td>${isClient() ? (st2 ? `<span class="ds-chip ${RS[st2][0]}">${RS[st2][1]}</span>` : '<span class="spx-mut">the rule</span>') : `<div class="spx-acts end"><div class="ds-seg" role="radiogroup" aria-label="Your call on ${esc(x.p.title)}"><button type="button" class="${st2 === 'keep' ? 'on' : ''}" data-kc="${esc(x.p.id)}|keep" aria-checked="${st2 === 'keep'}">Keep</button><button type="button" class="${st2 === 'cut' ? 'on' : ''}" data-kc="${esc(x.p.id)}|cut" aria-checked="${st2 === 'cut'}">Cut</button></div>${x.decided ? btn('Use the rule', `data-kc="${esc(x.p.id)}|"`, 'sm ghost') : ''}</div>`}</td></tr>`; }).join('')}
      </tbody></table></div>
      ${isClient() ? '' : `<p class="v2hint">${heavy
        ? `Nothing in this group needs a reorder until the shelf comes down.${l.cut ? ` The ${l.cut} cut sell down and are not reordered.` : ''}`
        : `Next order: ${designs} designs at ${per} units each is <b>${int(designs * per)} ${esc(noun)}</b>${unit != null ? `, about ${money(designs * per * unit)} at cost` : ''}.${l.cut ? ` The ${l.cut} cut stop reordering and sell down.` : ''}`}</p>`}
      ${curve.length > 1 ? `<div class="spx-mix"><div class="ds-label">Size mix for a new design's order</div>${curve.map(([k, v]) => `<div class="spx-mixr"><span>${esc(k)}</span><span class="spx-kbar"><i style="width:${Math.round(v * 100)}%"></i></span><b>${Math.round(v * 100)}%</b></div>`).join('')}</div>` : ''}</section>`;
  }
  async function editDrop(c) {
    const { st, brand } = CUR;
    const def = () => { const y = +st.today.slice(0, 4); return +st.today.slice(5, 7) >= 7 ? `${y + 1}-03-01` : `${y}-09-01`; };
    const r = await form({ title: c ? `Edit ${c.name}` : 'New drop', hint: 'A name and the day it goes on the site. Every design in it works back from that day; move it and every date moves, Asana due dates included.',
      fields: [{ key: 'name', label: 'Name', value: c ? c.name : '', placeholder: 'Spring 2027' }, { key: 'drop_at', label: 'On the site', type: 'date', value: c ? c.drop_at : def() }, { key: 'notes', label: 'Notes', type: 'textarea', value: c ? c.notes || '' : '', wide: true }],
      confirm: c ? 'Save' : 'Create', extra: c ? '<p style="margin:10px 0 0"><button type="button" class="ds-btn ghost" id="spDelDrop" style="color:var(--bad)">Delete this drop</button></p>' : '' });
    if (r === null) return;
    if (!r.name || !r.drop_at) return toast('A drop needs a name and a date.', true);
    const res = await save(brand.id, '/api/collections', { id: c ? c.id : undefined, name: r.name, drop_at: r.drop_at, notes: r.notes }, c ? 'PUT' : 'POST', c ? 'Saved' : 'Drop made').catch(() => null);
    if (res && res.id) DROP.set(res.id);
    renderDrops(false);
  }
  document.addEventListener('click', async e => {
    if (!e.target.closest('#spDelDrop') || !CUR) return;
    const c = (CUR.st.collections || []).find(x => x.id === DROP.get()) || (CUR.st.collections || [])[0]; if (!c) return;
    document.querySelector('.modal-wrap [data-m="no"]')?.click();
    if (!(await H.confirmModal(`Delete ${c.name}?`, 'The designs in it are kept; they just stop belonging to a drop. Asana tasks are not touched.', 'Delete'))) return;
    await save(CUR.brand.id, `/api/collections/${encodeURIComponent(c.id)}`, null, 'DELETE', 'Deleted').catch(() => {});
    DROP.set(''); renderDrops(false);
  });
  async function addDesigns(col, lineId) {
    const { st, brand } = CUR;
    const lines = st.lines;
    const r = await form({ title: `Add designs${col ? ' to ' + col.name : ''}`, hint: 'Each design gets its Asana task straight away, in the column for its stage, with its dates worked back from the drop.',
      fields: [{ key: 'line', label: 'Group', type: 'select', value: lineId || lines[0]?.id, options: lines.map(l => [l.id, l.name]) }, { key: 'count', label: 'How many', type: 'number', value: 1, min: 1 },
        ...(col ? [] : [{ key: 'name', label: 'New drop name', value: '' }, { key: 'drop_at', label: 'On the site', type: 'date', value: '' }])], confirm: 'Add' });
    if (!r) return;
    let cid = col && col.id;
    if (!cid) { if (!r.name || !r.drop_at) return toast('A new drop needs a name and a date.', true); const made = await save(brand.id, '/api/collections', { name: r.name, drop_at: r.drop_at }, 'POST', null).catch(() => null); if (!made) return; cid = made.id; DROP.set(cid); }
    const l = lines.find(x => x.id === r.line); const cname = col ? col.name : r.name;
    const n = Math.min(20, Math.max(1, +r.count || 1)), existing = st.slots.filter(s => s.collection_id === cid && s.line_id === r.line).length;
    for (let i = 0; i < n; i++) { try { await sapi(brand.id, '/api/slots', { method: 'POST', body: { line_id: r.line, collection_id: cid, name: `${cname} · ${l.name.replace(/s$/, '')} ${existing + i + 1}`, status: 'needs_brief' } }); } catch (e) { toast(e.message, true); break; } }
    toast(`${plural(n, 'design')} added`); STATE.delete(brand.id); renderDrops(false);
  }
  async function claim(gid) {
    const { st, brand } = CUR; const t = (st.asanaLoose || []).find(x => String(x.gid) === String(gid)); if (!t) return;
    const cols = st.collections || [];
    if (!cols.length) return toast('Make a drop first, then claim the card into it.', true);
    const r = await form({ title: `Make "${t.name}" a design`, hint: 'Locus keeps this exact Asana card and gives it a group, a drop and every date. Its column keeps setting the stage.',
      fields: [{ key: 'line', label: 'Group', type: 'select', value: st.lines[0]?.id, options: st.lines.map(l => [l.id, l.name]) }, { key: 'col', label: 'Drop', type: 'select', value: DROP.get() || cols[0].id, options: cols.map(c => [c.id, `${c.name} · ${day(c.drop_at, true)}`]) }], confirm: 'Make it a design' });
    if (!r) return;
    await save(brand.id, '/api/slots', { line_id: r.line, collection_id: r.col, name: t.name, asana_task: t.url, status: 'needs_brief' }, 'POST', 'Claimed. It is a design now.').catch(() => {});
    DROP.set(r.col); renderDrops(false);
  }
  /* A client's view of one design: stage, what is next, the dates and where the sample is. Nothing to edit. */
  function slotView(id) {
    const { st } = CUR; const sl = st.slots.find(x => x.id === id);
    if (!sl) return toast('That design is gone.', true);
    const d = sl.dates || {}, L = sl.lateParts || {};
    const p = sl.product_id ? st.products.find(x => String(x.id) === String(sl.product_id)) : null;
    panel(sl.name, `
      <div class="spx-acts">${p && p.image ? `<span class="sp-av" style="background-image:url('${esc(p.image)}')"></span>` : ''}${slotChip(sl.status)}<span class="spx-mut">${esc(sl.lineName || '')} · ${esc(sl.collectionName || 'no drop')}</span></div>
      ${sl.next ? `<div class="spx-box ${sl.next.late ? 'bad' : 'info'}"><b>Next: ${esc(sl.next.what)}</b>, ${sl.next.late ? `was due ${day(sl.next.on, true)}` : `due ${day(sl.next.on, true)}, in ${sl.next.days} days`}.</div>` : ''}
      <section class="v2card"><div class="v2h"><h3>What has to happen by when</h3><span class="find">Worked back from the day the drop goes on the site.</span></div>
        ${steps([['Brief', d.briefDue, 'words for the designer', L.brief], ['Tech pack', d.techPackDue, 'specs for the factory', L.techPack], ['Sample approved', d.sampleDue, '', L.sample], ['Order placed', d.orderBy, '', L.order], ['Stock lands', d.lands, ''], ['On the site', d.onSite, '']], [d.briefDue, d.techPackDue, d.sampleDue, d.orderBy, d.lands, d.onSite].filter(x => x && x < st.today).length)}</section>
      <section class="v2card"><div class="v2h"><h3>Where it is</h3></div><p class="v2say">${sl.made ? `${esc(sl.made.label)}${sl.made.expected_at ? `, landing ${day(sl.made.expected_at, true)}` : ''}.` : sl.sample ? `${esc(sl.sample.label)}.` : 'Nothing made yet.'}${p ? ` In the shop as <b>${esc(p.title)}</b>.` : ''}</p></section>`);
  }
  function openSlot(id) {
    const { st, brand } = CUR; const sl = st.slots.find(x => x.id === id);
    if (!sl) return toast('That design is gone.', true);
    const d = sl.dates, L = sl.lateParts || {};
    const prods = st.products.filter(p => p.lineId === sl.line_id);
    const body = panel(sl.name, `
      <div class="spx-acts">${slotChip(sl.status)}<span class="spx-mut">${esc(sl.lineName || '')} · ${esc(sl.collectionName || 'no drop')}</span></div>
      ${sl.next ? `<div class="spx-box ${sl.next.late ? 'bad' : 'info'}"><b>Next: ${esc(sl.next.what)}</b>, ${sl.next.late ? `was due ${day(sl.next.on, true)}` : `due ${day(sl.next.on, true)}, in ${sl.next.days} days`}.</div>` : ''}
      <div class="spx-form"><div class="spx-f"><label for="spSn">Name</label><input class="spx-in" id="spSn" value="${esc(sl.name)}"><p class="spx-help">Rename it to the real product once it has one.</p></div>
        <div class="spx-f"><label for="spSs">Stage</label>${sl.asana_gid ? `<input class="spx-in" id="spSs" value="${esc((SLOT[sl.status] || [, sl.status])[1])}" disabled data-v="${esc(sl.status)}"><p class="spx-help">Asana owns this: drag the card there.</p>` : `<select class="spx-in" id="spSs">${Object.entries(SLOT).map(([k, [, l]]) => `<option value="${k}" ${sl.status === k ? 'selected' : ''}>${l}</option>`).join('')}</select>`}</div>
        <div class="spx-f"><label for="spSc">Drop</label><select class="spx-in" id="spSc">${[['', 'Not in a drop'], ...(st.collections || []).map(c => [c.id, `${c.name} · ${day(c.drop_at, true)}`])].map(([v, l]) => `<option value="${esc(v)}" ${String(sl.collection_id || '') === String(v) ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></div>
        ${sl.collection_id ? '' : `<div class="spx-f"><label for="spSo">On the site by</label><input class="spx-in" id="spSo" type="date" value="${sl.on_site_at || ''}"></div>`}
        <div class="spx-f wide"><label for="spSnotes">Notes</label><textarea class="spx-in" id="spSnotes">${esc(sl.notes || '')}</textarea></div></div>
      <section class="v2card"><div class="v2h"><h3>What has to happen by when</h3><span class="find">Worked back from the drop; move the drop and they all move.</span></div>
        ${steps([['Brief', d.briefDue, 'words for the designer', L.brief], ['Tech pack', d.techPackDue, 'specs for the factory', L.techPack], ['Sample approved', d.sampleDue, '', L.sample], ['Order placed', d.orderBy, '', L.order], ['Stock lands', d.lands, ''], ['On the site', d.onSite, '']], [d.briefDue, d.techPackDue, d.sampleDue, d.orderBy, d.lands, d.onSite].filter(x => x && x < st.today).length)}</section>
      <section class="v2card"><div class="v2h"><h3>The sample</h3><span class="find">Where the physical sample is.</span></div><div class="spx-form">
        <div class="spx-f"><label for="spS1">Asked for</label><input class="spx-in" id="spS1" type="date" value="${sl.sample_requested_at || ''}"></div><div class="spx-f"><label for="spS2">Expected</label><input class="spx-in" id="spS2" type="date" value="${sl.sample_expected_at || ''}"></div>
        <div class="spx-f"><label for="spS3">Tracking</label><input class="spx-in" id="spS3" value="${esc(sl.sample_tracking || '')}" placeholder="Courier and number"></div><div class="spx-f"><label for="spS4">In hand</label><input class="spx-in" id="spS4" type="date" value="${sl.sample_in_hand_at || ''}"></div></div></section>
      <section class="v2card"><div class="v2h"><h3>Once it exists</h3></div><div class="spx-f"><label for="spSp">Shopify product</label><select class="spx-in" id="spSp"><option value="">Not made yet</option>${prods.map(p => `<option value="${esc(p.id)}" ${String(sl.product_id || '') === String(p.id) ? 'selected' : ''}>${esc(p.title)}</option>`).join('')}</select><p class="spx-help">${sl.made ? `On ${esc(sl.made.orderId)}: ${esc(sl.made.label.toLowerCase())}.` : 'Attach it and this design follows its factory order: in production, shipped, landed.'}</p></div></section>
      <section class="v2card"><div class="v2h"><h3>Asana</h3></div><div id="spAs">${sl.asana_task ? `<div class="spx-acts"><a class="ds-btn sm" href="${esc(sl.asana_task)}" target="_blank" rel="noopener">${ic('external-link', 14)}Open in Asana</a><span class="spx-mut" id="spAsS">Checking Asana…</span></div>` : `<div class="spx-acts">${btn('Make the Asana task', 'id="spMkT"', 'sm')}<span class="spx-mut">It lands in the column for this stage, due on what that column owes.</span></div>`}</div></section>
      <div class="spx-acts">${btn('Save', 'id="spSsave"', 'primary')}<span class="spx-grow"></span>${btn('Delete the design', 'id="spSdel" style="color:var(--bad)"', 'ghost')}</div>`);
    if (!body) return;
    if (sl.asana_gid) sapi(brand.id, `/api/slots/${encodeURIComponent(id)}/asana`).then(r => { const el = body.querySelector('#spAsS'); if (el) el.textContent = r.gone ? 'That task is no longer in Asana.' : r.task ? `${r.task.completed ? 'Done' : 'Open'} in Asana${r.task.section ? `, in ${r.task.section}` : ''}${r.task.assignee ? `, with ${r.task.assignee}` : ''}.` : ''; }).catch(() => { const el = body.querySelector('#spAsS'); if (el) el.textContent = 'Asana did not answer.'; });
    if (body.querySelector('#spMkT')) body.querySelector('#spMkT').onclick = async () => { try { await sapi(brand.id, `/api/slots/${encodeURIComponent(id)}/asana`, { method: 'POST' }); toast('Asana task made'); await refresh(); openSlot(id); } catch (e) { toast(e.message, true); } };
    body.querySelector('#spSsave').onclick = async () => {
      const v = s => body.querySelector(s);
      await save(brand.id, '/api/slots', { ...sl, name: v('#spSn').value, status: v('#spSs').dataset.v || v('#spSs').value, collection_id: v('#spSc').value || null, on_site_at: (v('#spSo') && v('#spSo').value) || sl.on_site_at,
        notes: v('#spSnotes').value, product_id: v('#spSp').value || null, sample_requested_at: v('#spS1').value || null, sample_expected_at: v('#spS2').value || null, sample_tracking: v('#spS3').value || null, sample_in_hand_at: v('#spS4').value || null,
        brief_due: null, sample_due: null, order_by: null, lands_at: null }).catch(() => null);
      closePanel(); STATE.delete(brand.id); renderDrops(false);
    };
    body.querySelector('#spSdel').onclick = async () => { if (!(await H.confirmModal('Delete this design?', 'Its Asana task, if any, is not touched.', 'Delete'))) return; await save(brand.id, `/api/slots/${encodeURIComponent(id)}`, null, 'DELETE', 'Deleted').catch(() => {}); closePanel(); STATE.delete(brand.id); renderDrops(false); };
  }

  /* ===================================================================================
   * BRAND SETTINGS > STOCK AND FACTORIES
   * ================================================================================= */
  async function settings(el, act) {
    if (!el) return;
    el.innerHTML = '<div class="card"><span class="hint">Reading the stock setup…</span></div>';
    try { await loadBrands(); } catch (e) { el.innerHTML = `<div class="card"><span style="color:var(--bad)">${esc(e.message)}</span></div>`; return; }
    const b = brandOf(act);
    const name = (H.S.accounts.find(a => a.act_id === act) || {}).name || 'This brand';
    const layer = (n, on, who, title, text, list, right = '') => `<div class="sp-layer ${on ? 'on' : ''}"><div class="num">${n}</div><div><div class="who">${who}</div><h4>${title}</h4><p>${text}</p>${list ? `<ul>${list.map(x => `<li>${x}</li>`).join('')}</ul>` : ''}</div>${right}</div>`;
    if (!b) { el.innerHTML = `<div class="sp-layers">${layer(1, false, 'Every client · no setup', 'Stock', `What runs out, what is safe to scale, what sits, and which ads sit on top of each. ${esc(name)} has no stock feed yet.`, ['Needs one thing: the brand installs the <b>Mobius Digital Shopify app</b> (in Shopify review now).', 'Then it shows as Products › Stock, a chip on ad sets in Ads, and in Locus.', 'No factories, no lead times, no order dates.'], pill('n', 'Not connected'))}
      ${layer(2, false, 'Brands we buy for', 'Buying', 'Order dates, quantities and factory orders. Switch on once the stock feed is connected.', null)}${layer(3, false, 'Brands that design products', 'Drops', 'New designs by drop date, keep or cut, every design date worked back. Switch on once the stock feed is connected.', null)}</div>`; return; }
    let st; try { st = await state(b.id, true); } catch (e) { el.innerHTML = `<div class="card"><span style="color:var(--bad)">${esc(e.message)}</span></div>`; return; }
    const S2 = st.settings, tg = (k, on) => `<div class="toggle ${on ? 'on' : ''}" data-tg="${k}" role="switch" aria-checked="${on}" tabindex="0"></div>`;
    const unsorted = (st.shopTypes || []).filter(t => !st.db.typeMap.some(m => m.shop_type === t));
    el.innerHTML = `<div class="sp">
      <div class="sp-layers">
        ${layer(1, true, 'Every client · no setup', 'Stock', 'What runs out, what is safe to scale, what sits, and which ads sit on top of each. Read every hour from Shopify; products matched to ads through Triple Whale orders.', null, pill('good', 'Connected'))}
        ${layer(2, b.buys, 'Brands we buy for', 'Buying', 'Order dates, quantities and factory orders: Products › Buying. Needs the factories and the four rules below.', null, tg('buys', b.buys))}
        ${layer(3, b.makes, 'Brands that design products', 'Drops', 'New designs by drop date, keep or cut per group, every date worked back from the drop: Products › Drops. Needs design timing and an Asana project.', null, tg('makes', b.makes))}
      </div>
      ${b.buys ? `<div class="sp-card"><div class="sp-ch"><h3>Factories</h3><span class="cap">lead times decide every order date</span><span class="r"><button class="btn btn-s" data-fac="">Add a factory</button></span></div><div class="sp-tbl"><table><tr><th class="l">Factory</th><th class="l">Makes</th><th>Lead time</th><th>Minimum a style</th><th class="l">Closed</th></tr>
        ${st.factories.map(f => `<tr class="link" data-fac="${esc(f.id)}"><td class="l"><span class="nm">${esc(f.name)}</span>${f.contact ? `<span class="sub">${esc(f.contact)}</span>` : ''}</td><td class="l" style="white-space:normal">${esc(st.lines.filter(l => l.factoryId === f.id).map(l => l.name).join(', ') || 'nothing yet')}</td><td><b>${f.production_days + f.shipping_days} days</b><span class="sub">${f.production_days} making + ${f.shipping_days} shipping</span></td><td>${f.moq_default ?? '–'}</td><td class="l">${(f.closures || []).map(c => `${day(c.from)} to ${day(c.to)} <span class="sp-mut">${esc(c.label || '')}</span>`).join('<br>') || '–'}</td></tr>`).join('') || '<tr><td colspan="5" class="l sp-mut">No factories yet.</td></tr>'}</table></div></div>` : ''}
      <div class="sp-card"><div class="sp-ch"><h3>Product groups</h3><span class="cap">sorted from Shopify product types; the size mix${b.buys ? ' and the factory' : ''} hang off the group</span></div>
        ${unsorted.length ? `<div class="sp-box warn" style="margin-bottom:10px"><b>${plural(unsorted.length, 'Shopify product type')} not in a group:</b> ${esc(unsorted.join(', '))}. <button class="btn btn-s" id="spSort">Sort them</button></div>` : ''}
        <div class="sp-tbl"><table><tr><th class="l">Group</th><th class="l">Shopify types</th>${b.buys ? '<th class="l">Factory</th><th>Minimum</th>' : ''}${b.makes ? '<th>Target designs</th><th>Cut zone</th>' : ''}</tr>
        ${st.db.lines.map(row => { const l = st.lines.find(x => x.id === row.id) || {}; return `<tr class="link" data-line="${esc(row.id)}"><td class="l"><span class="nm">${esc(row.name)}</span><span class="sub">${plural(l.designs || 0, 'product')}</span></td><td class="l" style="white-space:normal">${esc(st.db.typeMap.filter(m => m.line_id === row.id).map(m => m.shop_type).join(', ') || '–')}</td>${b.buys ? `<td class="l">${esc(l.factoryName || 'none')}${row.lead_override_days != null ? `<span class="sub">${row.lead_override_days} day lead</span>` : ''}</td><td>${row.moq || 'factory'}</td>` : ''}${b.makes ? `<td>${row.target_designs ?? '–'}</td><td>${row.cut_rule_pct != null ? 'bottom ' + row.cut_rule_pct + '%' : '–'}</td>` : ''}</tr>`; }).join('')}</table></div>
        <p style="margin:10px 0 0"><button class="btn btn-s" data-line="">Add a group</button></p></div>
      ${b.buys ? `<div class="sp-card"><div class="sp-ch"><h3>Rules</h3><span class="cap">change one and every date and suggestion follows</span></div>
        ${[['buffer_days', 'Buffer days', 'Padding on every lead time for customs and surprises.'], ['cover_days', 'Days an order covers after it lands', 'Longer means bigger, rarer orders.'], ['site_prep_days', 'Landing to on the site', 'Receiving, photos, listing.'], ['dead_days', 'Dead stock after', 'Days with no sale before a size counts as dead.']].map(([k, l, h]) => `<div class="sp-srow"><div><b>${l}</b><span>${h}</span></div><input type="number" min="0" value="${S2[k] ?? ''}" data-rule="${k}" aria-label="${esc(l)}"></div>`).join('')}
        ${b.makes ? `<div class="sp-srow three"><div><b>Design timing</b><span>Brief to tech pack (yours) · tech pack to sample in hand (the factory's) · spare days before the order.</span></div>${['design_days', 'sample_make_days', 'slack_days'].map(k => `<input type="number" min="0" value="${S2[k] ?? ''}" data-rule="${k}" aria-label="${k}">`).join('')}</div>` : ''}</div>` : ''}
      ${b.makes ? `<div class="sp-card"><div class="sp-ch"><h3>Asana design project</h3><span class="cap">every design gets a card here; its column sets the stage</span></div><div class="sp-row"><select id="spAsP" style="max-width:340px"><option>Loading…</option></select><button class="btn btn-s" id="spAsSave">Save</button><span class="sp-mut" id="spAsMsg">${S2.asana_project_name ? 'Now: ' + esc(S2.asana_project_name) : ''}</span></div></div>` : ''}
      <div class="sp-card"><div class="sp-ch"><h3>Stock in Slack</h3><span class="cap">posted at 6am Central</span></div>
        <div class="sp-srow tg"><div><b>Monday summary</b><span>What to ease off, what to scale${b.buys ? ', what to order' : ''}.</span></div>${tg('digest_monday', S2.digest_monday !== false)}</div>
        <div class="sp-srow tg"><div><b>Same-day alerts</b><span>Other mornings, only when something new happens: an advertised product runs out, an order date passes, an order lands, a design goes late. Nothing new, no post.</span></div>${tg('digest_alerts', S2.digest_alerts !== false)}</div>
        <div class="sp-row" style="margin-top:8px"><span class="sp-mut">Channel</span><select id="spCh" style="max-width:280px"><option>Loading…</option></select><button class="btn btn-s" id="spChSave">Save</button><button class="btn btn-s" id="spSend">Send the Monday summary now</button><span class="sp-mut" id="spChMsg"></span></div></div>
      <div class="sp-card"><div class="sp-ch"><h3>Stock data</h3><span class="cap">${plural(st.historyDays, 'day')} of sales since ${day(st.historyStart, true)}</span></div><div class="sp-row"><button class="btn btn-s" id="spSnap">Read Shopify stock now</button><button class="btn btn-s" id="spBack">Re-pull 2 years of sales</button><span class="sp-mut" id="spDataMsg"></span></div></div>
    </div>`;
    const reload = () => { STATE.delete(b.id); BRANDS_P = null; settings(el, act); };
    el.querySelectorAll('[data-tg]').forEach(t => t.onclick = async () => {
      const k = t.dataset.tg, on = !t.classList.contains('on');
      try {
        if (k === 'buys' || k === 'makes') { await sapi(b.id, '/api/brand', { method: 'PUT', body: { [k]: on } }); BRANDS = null; BRANDS_P = null; await loadBrands(); toast(on ? 'Switched on' : 'Switched off'); reload(); }
        else { await sapi(b.id, '/api/settings', { method: 'PUT', body: { [k]: on } }); t.classList.toggle('on', on); toast('Saved'); }
      } catch (e) { toast(e.message, true); }
    });
    el.querySelectorAll('[data-rule]').forEach(i => i.onchange = () => save(b.id, '/api/settings', { [i.dataset.rule]: +i.value }, 'PUT', 'Saved. Every date follows.').catch(() => {}));
    el.querySelectorAll('[data-fac]').forEach(r => r.onclick = () => editFactory(b, st, r.dataset.fac, reload));
    el.querySelectorAll('[data-line]').forEach(r => r.onclick = () => editLine(b, st, r.dataset.line, reload));
    if (el.querySelector('#spSort')) el.querySelector('#spSort').onclick = async () => {
      const r = await form({ title: 'Sort product types into groups', hint: 'Pick a group for each. Its products are forecast from the next read.', fields: unsorted.map(t => ({ key: t, label: t || '(no type)', type: 'select', value: '', options: [['', 'Leave unsorted'], ...st.lines.map(l => [l.id, l.name])] })) });
      if (!r) return; const patch = {}; for (const [t, v] of Object.entries(r)) if (v) patch[t] = v; if (Object.keys(patch).length) { await save(b.id, '/api/type-map', patch).catch(() => {}); reload(); }
    };
    if (el.querySelector('#spAsP')) {
      sapi(b.id, '/api/asana/projects').then(r => { const s = el.querySelector('#spAsP'); if (!r.connected) { s.innerHTML = '<option value="">Asana is not connected</option>'; return; } s.innerHTML = '<option value="">No project</option>' + (r.projects || []).map(p => `<option value="${esc(p.gid)}" data-n="${esc(p.name)}" ${String(p.gid) === String(S2.asana_project || '') ? 'selected' : ''}>${esc(p.name)}</option>`).join(''); }).catch(e => { el.querySelector('#spAsMsg').textContent = e.message; });
      el.querySelector('#spAsSave').onclick = () => { const s = el.querySelector('#spAsP'); save(b.id, '/api/settings', { asana_project: s.value, asana_project_name: s.selectedOptions[0]?.dataset.n || '' }).then(() => { el.querySelector('#spAsMsg').textContent = 'Now: ' + (s.selectedOptions[0]?.dataset.n || 'none'); }).catch(() => {}); };
    }
    Promise.all([sapi(b.id, '/api/shopify/settings'), sapi(b.id, '/api/shopify/channels').catch(() => ({ channels: [] }))]).then(([cfg, ch]) => {
      const cur = (cfg.stores || {})[b.id]?.channel || ''; const s = el.querySelector('#spCh');
      s.innerHTML = '<option value="">No channel (off)</option>' + (ch.channels || []).map(c => `<option value="${esc(c.id)}" ${c.id === cur ? 'selected' : ''}>#${esc(c.name)}${c.is_member ? '' : ' (invite the bot first)'}</option>`).join('');
      if (cur && !(ch.channels || []).some(c => c.id === cur)) s.insertAdjacentHTML('beforeend', `<option value="${esc(cur)}" selected>${esc(cur)}</option>`);
    }).catch(e => { el.querySelector('#spChMsg').textContent = e.message; });
    el.querySelector('#spChSave').onclick = () => sapi(b.id, '/api/shopify/settings', { method: 'PUT', body: { stores: { [b.id]: { channel: el.querySelector('#spCh').value } } } }).then(() => toast('Saved')).catch(e => toast(e.message, true));
    el.querySelector('#spSend').onclick = () => sapi(b.id, '/api/digest', { method: 'POST' }).then(r => toast(r.ok === false ? (r.error || 'Slack said no') : 'Posted to Slack', r.ok === false)).catch(e => toast(e.message, true));
    el.querySelector('#spSnap').onclick = () => { el.querySelector('#spDataMsg').textContent = 'Reading Shopify…'; sapi(b.id, '/api/shopify/snapshot', { method: 'POST' }).then(() => { el.querySelector('#spDataMsg').textContent = 'Done.'; STATE.delete(b.id); }).catch(e => { el.querySelector('#spDataMsg').textContent = e.message; }); };
    el.querySelector('#spBack').onclick = async () => {
      if (!(await H.confirmModal('Re-pull 2 years of sales?', 'Pulls orders from Shopify in chunks. Safe to run more than once; it takes a few minutes.', 'Start'))) return;
      const m = el.querySelector('#spDataMsg'); m.textContent = 'Working…';
      try { let r; do { r = await sapi(b.id, '/api/shopify/backfill', { method: 'POST', body: { days: 730 } }); m.textContent = `${int(r.ordersProcessed)} orders so far…`; } while (!r.done); m.textContent = `Done. History starts ${day(r.historyStart, true)}.`; STATE.delete(b.id); } catch (e) { m.textContent = e.message; }
    };
  }
  async function editFactory(b, st, id, reload) {
    const f = id ? st.factories.find(x => x.id === id) : null;
    const r = await form({ title: f ? f.name : 'Add a factory', hint: 'Calendar days. Closed weeks are skipped when dates are worked out.', fields: [
      { key: 'name', label: 'Name', value: f?.name || '' }, { key: 'contact', label: 'Contact', value: f?.contact || '', placeholder: 'Name, email' },
      { key: 'production_days', label: 'Days to make', type: 'number', value: f?.production_days ?? 60, min: 0 }, { key: 'shipping_days', label: 'Days to ship', type: 'number', value: f?.shipping_days ?? 30, min: 0 },
      { key: 'moq_default', label: 'Minimum a style', type: 'number', value: f?.moq_default ?? '', min: 0 },
      { key: 'closures', label: 'Closed', value: (f?.closures || []).map(c => `${c.from} to ${c.to}${c.label ? ' ' + c.label : ''}`).join('; '), wide: true, help: 'YYYY-MM-DD to YYYY-MM-DD and a label; separate with semicolons. Example: 2027-02-06 to 2027-02-20 Chinese New Year' },
      { key: 'notes', label: 'Notes', type: 'textarea', value: f?.notes || '', wide: true }] });
    if (!r || !r.name) return;
    const closures = (r.closures || '').split(';').map(x => /(\d{4}-\d{2}-\d{2})\s+to\s+(\d{4}-\d{2}-\d{2})\s*(.*)/.exec(x.trim())).filter(Boolean).map(m => ({ from: m[1], to: m[2], label: m[3] || '' }));
    await save(b.id, '/api/factories', { id: f?.id, name: r.name, contact: r.contact, production_days: +r.production_days, shipping_days: +r.shipping_days, order_cycle_days: f?.order_cycle_days || 90, moq_default: r.moq_default === '' ? null : +r.moq_default, closures, notes: r.notes }).catch(() => {});
    reload();
  }
  async function editLine(b, st, id, reload) {
    const row = id ? st.db.lines.find(x => x.id === id) : null; const l = id ? st.lines.find(x => x.id === id) : null;
    const mapped = id ? st.db.typeMap.filter(m => m.line_id === id).map(m => m.shop_type) : [];
    const curve = row && row.size_curve ? (typeof row.size_curve === 'string' ? JSON.parse(row.size_curve) : row.size_curve) : null;
    const AX = [['none', 'One variant'], ['size', 'Size'], ['hand', 'Hand'], ['loft_hand', 'Loft and hand'], ['hand_size', 'Hand and size']];
    const r = await form({ title: row ? row.name : 'Add a group', hint: 'A group is what the size mix, the factory and keep or cut hang off. Most groups come straight from Shopify product types.', fields: [
      { key: 'name', label: 'Name', value: row?.name || '' },
      { key: 'variant_axis', label: 'What the variants mean', type: 'select', value: row?.variant_axis || 'none', options: AX },
      ...(b.buys ? [{ key: 'factory_id', label: 'Factory', type: 'select', value: row?.factory_id || '', options: [['', 'None yet'], ...st.factories.map(f => [f.id, f.name])] },
        { key: 'lead_override_days', label: 'Lead time override, days', type: 'number', value: row?.lead_override_days ?? '', min: 0, help: 'Empty uses the factory.' },
        { key: 'moq', label: 'Minimum a style', type: 'number', value: row?.moq ?? '', min: 0, help: 'Empty uses the factory.' }] : []),
      ...(b.makes ? [{ key: 'target_designs', label: 'Target designs', type: 'number', value: row?.target_designs ?? '', min: 0, help: 'Turns on keep or cut for the group.' },
        { key: 'cut_rule_pct', label: 'Cut zone, bottom %', type: 'number', value: row?.cut_rule_pct ?? '', min: 0, help: 'By 90-day sales. Empty means you cut by hand.' }] : []),
      { key: 'types', label: 'Shopify product types in it', value: mapped.join(', '), wide: true, help: `Comma separated. Known: ${(st.shopTypes || []).join(', ')}` },
      { key: 'curve', label: 'Size mix override', value: curve ? Object.entries(curve).map(([k, v]) => `${k} ${v}`).join(', ') : '', wide: true, help: `Empty learns it from sales${l ? ` (now: ${Object.entries(l.sizeCurveLearned || {}).filter(([k]) => k).map(([k, v]) => `${k} ${Math.round(v * 100)}`).join(', ') || 'no sales yet'})` : ''}.` }],
      extra: row ? '<p style="margin:10px 0 0"><button type="button" class="btn btn-s" id="spDelLine" style="color:var(--bad)">Delete this group</button></p>' : '' });
    if (r === null) return;
    if (!r.name) return toast('A group needs a name.', true);
    const cv = {}; for (const part of (r.curve || '').split(',')) { const m = /^\s*(.+?)\s+([\d.]+)\s*$/.exec(part); if (m) cv[m[1]] = +m[2]; }
    const nn = v => v === '' || v == null ? null : +v;
    const body = { ...(row || {}), id: row?.id, name: r.name, variant_axis: r.variant_axis, category_id: row?.category_id || (st.categories[0] || {}).id,
      factory_id: 'factory_id' in r ? (r.factory_id || null) : row?.factory_id ?? null, lead_override_days: 'lead_override_days' in r ? nn(r.lead_override_days) : row?.lead_override_days ?? null,
      moq: 'moq' in r ? nn(r.moq) : row?.moq ?? null, target_designs: 'target_designs' in r ? nn(r.target_designs) : row?.target_designs ?? null, cut_rule_pct: 'cut_rule_pct' in r ? nn(r.cut_rule_pct) : row?.cut_rule_pct ?? null,
      size_curve: Object.keys(cv).length ? cv : null };
    try {
      const res = await sapi(b.id, '/api/lines', { method: 'PUT', body });
      const lid = row?.id || res.id;
      const want = (r.types || '').split(',').map(t => t.trim()).filter(Boolean); const patch = {};
      for (const t of mapped) if (!want.includes(t)) patch[t] = null; for (const t of want) patch[t] = lid;
      if (Object.keys(patch).length && lid) await sapi(b.id, '/api/type-map', { method: 'PUT', body: patch });
      toast('Saved');
    } catch (e) { toast(e.message, true); }
    reload();
  }
  document.addEventListener('click', async e => {
    if (!e.target.closest('#spDelLine') || !CUR && !BRANDS) return;
    const m = document.querySelector('.modal-wrap'); const name = m && m.querySelector('h3')?.textContent; m && m.querySelector('[data-m="no"]')?.click();
    const act = H.S.act, b = brandOf(act); if (!b) return;
    const st = await state(b.id); const row = st.db.lines.find(x => x.name === name); if (!row) return;
    if (!(await H.confirmModal(`Delete ${row.name}?`, 'Its products lose their group and show as unsorted until their Shopify types are sorted again. Orders and history are untouched.', 'Delete'))) return;
    await save(b.id, `/api/lines/${encodeURIComponent(row.id)}`, null, 'DELETE', 'Deleted').catch(() => {});
    const host = document.getElementById('stockSet'); if (host) settings(host, act);
  });

  /* ===================================================================================
   * THE STOCK CHIP ON META AD SETS, ADS AND THE AD PREVIEW (the team never opens Stock)
   * ================================================================================= */
  async function prime(act) {
    if (!act || act === 'all') return null;
    try { await loadBrands(); } catch { return null; }
    const b = brandOf(act); if (!b) return null;
    try { const [st, ads] = await Promise.all([state(b.id), stockAds(act)]); return ads ? { st, ads, J: judge(st, ads) } : null; } catch { return null; }
  }
  function chipFor(ctx, pids) {
    if (!ctx || !pids || !pids.length) return '';
    const p = ctx.st.products.find(x => String(x.id) === String(pids[0][0])); if (!p) return '';
    const c = ctx.J.call(p), r = ctx.J.runway(p);
    const why = `${p.title}: ${p.status === 'out' ? 'out of stock' : r.days == null ? 'not selling' : r.days > H_DAYS ? 'over 6 months of stock' : 'runs out ' + day(p.runOutDate)}${r.land != null ? `, restock ${day(p.incomingLands)}` : r.days != null && r.days < 120 ? ', nothing on order' : ''}. Most of this ad's orders are this product.`;
    if (c === 'ease') return `<span class="sp-adchip bad"${tip(why)}>${p.status === 'out' ? 'Out of stock' : 'Stock runs out ' + day(p.runOutDate)}</span>`;
    if (c === 'clear') return `<span class="sp-adchip warn"${tip(why)}>Overstocked: push it</span>`;
    if (c === 'scale') return `<span class="sp-adchip good"${tip(why)}>Stock OK to scale</span>`;
    return '';
  }
  /** Called by v2.js after the Campaigns table paints. */
  async function decorate(root, act) {
    const ctx = await prime(act); if (!ctx || !root || !root.isConnected) return;
    const setMap = Object.fromEntries((ctx.ads.adsets || []).map(s => [s.adset_id, s.products]));
    root.querySelectorAll('#v2camptbl tr[data-adset]').forEach(tr => { if (tr.querySelector('.sp-adchip')) return; const h = chipFor(ctx, setMap[tr.dataset.adset]); if (h) (tr.querySelector('.nm') || tr.firstElementChild).insertAdjacentHTML('afterend', h); });
    root.querySelectorAll('#v2camptbl tr[data-ad]').forEach(tr => { if (tr.querySelector('.sp-adchip')) return; const h = chipFor(ctx, ctx.ads.ads[tr.dataset.ad]); if (h) (tr.querySelector('.nm') || tr.firstElementChild).insertAdjacentHTML('afterend', h); });
  }
  /** Called by v2.js inside the ad preview: one line when stock changes the call. */
  async function previewLine(body, act, adId) {
    const ctx = await prime(act); if (!ctx || !body || !body.isConnected) return;
    const pids = ctx.ads.ads[adId]; if (!pids) return;
    const p = ctx.st.products.find(x => String(x.id) === String(pids[0][0])); if (!p) return;
    const c = ctx.J.call(p), r = ctx.J.runway(p);
    if (c !== 'ease' && c !== 'clear' && c !== 'scale') return;
    const k = c === 'ease' ? 'bad' : c === 'clear' ? 'warn' : 'good';
    const text = c === 'ease' ? `<b>Before scaling: ${esc(p.title)} ${p.status === 'out' ? 'is out of stock' : `runs out ${day(p.runOutDate)}`}.</b> Most of this ad's orders are that product${r.land != null ? `, and its restock lands ${day(p.incomingLands)}${r.gap ? `, ${r.gap} days later. Hold the budget until then, or sell the gap on pre-order.` : '.'}` : ', and nothing is on order. Scale only once the restock is placed.'}`
      : c === 'clear' ? `<b>${esc(p.title)} has ${p.weeksOfCover ? p.weeksOfCover + ' weeks' : 'more than a year'} of stock.</b> This ad sells it: a good one to push.`
      : `<b>Stock is fine.</b> ${esc(p.title)}, most of this ad's orders, has ${r.days > H_DAYS ? 'over 6 months' : `stock to ${day(p.runOutDate)}`}${r.cover ? ' with a restock landing in time' : ''}.`;
    const kv = body.querySelector('.v2kv'); const html = `<div class="sp-box ${k}">${text}</div>`;
    if (kv) kv.insertAdjacentHTML('afterend', html); else body.insertAdjacentHTML('afterbegin', html);
  }

  /* ---------- deep links: ?open=drops&design=<id> (Asana), ?open=stock&product=<id> ---------- */
  const PENDING = { peek: k => { try { return localStorage.getItem('sp_open_' + k); } catch { return null; } }, take: k => { let v = null; try { v = localStorage.getItem('sp_open_' + k); localStorage.removeItem('sp_open_' + k); } catch {} return v; } };
  try { const q = new URLSearchParams(location.search); if (q.get('design')) localStorage.setItem('sp_open_design', q.get('design')); if (q.get('product')) localStorage.setItem('sp_open_product', q.get('product')); } catch {}

  /** Which Store tabs this brand shows. Before the brand list has loaded, Stock shows and the rest wait. */
  function tabOk(k, act) {
    if (!['stock', 'buying', 'drops'].includes(k)) return true;
    if (k === 'buying' && isClient()) return false;   // factory orders and costs are the team's
    if (act === 'all') return k === 'stock';
    if (!BRANDS) return false;
    const b = brandOf(act); return !!(b && (k === 'stock' || (k === 'buying' ? b.buys : b.makes)));
  }

  window.SupplyTab = {
    render(tab, host, first) { H = host; return tab === 'stock' ? renderStock(first) : tab === 'buying' ? renderBuying(first) : renderDrops(first); },
    settings(el, act, host) { if (host) H = host; return settings(el, act); },
    setHost(host) { if (!H) H = host; },
    tabOk, loadBrands, decorate, previewLine,
  };
  window.SupplyStock = window.SupplyTab;
})();

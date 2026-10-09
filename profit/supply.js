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
 * The brain is the only place a status or a date is computed: this file draws `state`. */
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
  const add = (ymd, n) => { const d = new Date(ymd + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
  const between = (a, b) => Math.round((Date.parse(b + 'T12:00:00Z') - Date.parse(a + 'T12:00:00Z')) / 864e5);
  const plural = (n, w, ws) => `${int(n)} ${n === 1 ? w : (ws || w + 's')}`;
  const tip = t => ` data-v2tip="${esc(t)}"`;
  const pill = (k, t) => `<span class="sp-pill ${k}"><i></i>${esc(t)}</span>`;
  const H_DAYS = 180;

  function toast(msg, err) {
    let t = document.getElementById('sptoast');
    if (!t) t = document.body.appendChild(Object.assign(document.createElement('div'), { id: 'sptoast' }));
    t.className = 'sp-toast' + (err ? ' err' : ''); t.textContent = msg; t.hidden = false;
    clearTimeout(toast.t); toast.t = setTimeout(() => { t.hidden = true; }, err ? 5000 : 2600);
  }

  /* ---------- the Supply worker ---------- */
  const token = () => { const t = localStorage.getItem('mobius_session'), e = +localStorage.getItem('mobius_session_exp') || 0; return t && (e === 0 || e > Date.now()) ? t : (H && H.S.tok) || ''; };
  const actor = () => localStorage.getItem('mobius_session_email') || '';
  async function sapi(brand, path, opts = {}) {
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
    BRANDS_P = sapi('lucky', '/api/brands').then(r => {
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
  const av = p => `<span class="sp-av"${p.image ? ` style="background-image:url('${esc(p.image)}')"` : ''}>${p.image ? '' : esc(p.title.split(/\s+/).map(w => w[0]).join('').slice(0, 2))}</span>`;

  /* ---------- page frame ---------- */
  const frame = (tab, title, body) => `<div class="v2">${H.pageHead(tab, title).replace(/<p class="ph-sub">[\s\S]*?<\/p>/, '')}<div class="sp">${body}</div></div>`;
  const msg = (tab, title, html) => { $('#main').innerHTML = frame(tab, title, `<div class="sp-card">${html}</div>`); };
  const loading = (tab, title) => msg(tab, title, '<p class="sp-hint">Reading the stock…</p>');
  const noFeed = (tab, name) => msg(tab, tab === 'stock' ? 'Stock' : tab === 'buying' ? 'Buying' : 'Drops', tab === 'stock'
    ? `<h3 style="margin:0 0 6px">${esc(name)} has no stock feed yet</h3><p class="sp-hint">Stock reads itself from Shopify once the brand installs the <b>Mobius Digital Shopify app</b> (in Shopify review now). Then this page shows what to ease off in ads, what is safe to scale and what to push, with no other setup. Lucky Golf is connected today.</p>`
    : `<h3 style="margin:0 0 6px">${tab === 'buying' ? 'Buying' : 'Drops'} is off for ${esc(name)}</h3><p class="sp-hint">${tab === 'buying' ? 'Buying is for brands we buy stock for: factories, order dates and quantities.' : 'Drops is for brands that design their own products: drops, designs and keep or cut.'} Switch it on in Brand settings, Stock and factories.</p><p style="margin:12px 0 0"><button class="btn" data-sp-set="1">Open Stock and factories</button></p>`);
  function wireCommon(root) {
    root.querySelectorAll('[data-sp-set]').forEach(b => b.onclick = () => openStockSettings());
    root.querySelectorAll('[data-sp-p]').forEach(el => el.onclick = e => { e.stopPropagation(); openProduct(el.dataset.spP); });
    root.querySelectorAll('[data-sp-go]').forEach(el => el.onclick = () => H.show(el.dataset.spGo));
  }
  function openStockSettings() { try { localStorage.setItem('pf_set_bsec', 'stock'); } catch {} H.show('settings'); }
  let CUR = null;   // { brand, st, ads, J } of the open page, for the panels

  /* ===================================================================================
   * STOCK (every brand with a feed; All clients = one row per brand)
   * ================================================================================= */
  async function renderStock(first) {
    const tab = 'stock';
    if (first || !$('#main .sp')) loading(tab, 'Stock');
    try { await loadBrands(); } catch (e) { return msg(tab, 'Stock', `<p class="sp-late">${esc(e.message)}</p>`); }
    const act = H.S.act;
    if (act === 'all') return agency();
    const b = brandOf(act);
    if (!b) return noFeed(tab, (H.S.accounts.find(a => a.act_id === act) || {}).name || 'This brand');
    const run = H.RUN();
    let st, ads;
    try { [st, ads] = await Promise.all([state(b.id), stockAds(act)]); } catch (e) { return msg(tab, 'Stock', `<p class="sp-late">${esc(e.message)}</p>`); }
    if (run !== H.RUN()) return;
    const J = judge(st, ads); CUR = { brand: b, st, ads, J };
    const top = J.ease[0], tr = top ? J.runway(top) : null;
    const lead = top ? `${esc(top.title)} ${J.spend(top) ? 'carries the most ad spend and ' : ''}${top.status === 'out' ? 'is out of stock' : `runs out ${day(top.runOutDate)}`}${tr.gap ? `, ${tr.gap} days before its restock lands` : Math.abs(tr.days - J.SE.bfd) <= 4 ? ', on Black Friday weekend' : ''}.`
      : J.scale.length ? 'Stock covers everything we advertise.' : 'Nothing is running low.';
    const mapped = ads ? ads.mapped : 0;
    const filt = STOCK_FILTER.get();
    $('#main').innerHTML = frame(tab, 'Stock', `
      <p class="sp-lead">${lead}</p>
      <p class="sp-sub">${plural(J.ease.length, 'product')} to ease off in ads, ${plural(J.scale.length, 'product')} safe to scale, ${plural(J.clear.length, 'product')} to push because they sit. Run-out dates use the last 90 days' pace, before any Black Friday lift. Shopify stock as of ${esc(new Date(st.lastRun || st.generatedAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'America/Chicago' }))} Central.</p>
      <div class="sp-tiles">
        <div class="sp-tile bad"${tip('Last 30 days of Meta spend, shared across the products in the orders each ad drove (Triple Whale, last platform click). Ad names are not used.')}><div class="l">Ad spend on products running low</div><div class="v">${money(J.easeSpend)}<small>${mapped ? `of ${money(mapped)}` : ''}</small></div><div class="s">${ads ? `last 30 days · ${Math.round(mapped / Math.max(1, ads.spend) * 100)}% of spend ties to a product` : 'ad data unavailable'}</div>${mapped ? `<div class="sp-meter"><i style="width:${(J.easeSpend / mapped * 100).toFixed(1)}%;background:var(--bad)"></i><i style="width:${(J.scaleSpend / mapped * 100).toFixed(1)}%;background:var(--good)"></i></div>` : ''}</div>
        <div class="sp-tile warn"><div class="l">Run out by Cyber Monday</div><div class="v">${J.byCM}<small>products</small></div><div class="s"><b>${J.out} already out</b> · Black Friday is ${day(J.SE.bf)}, ${J.SE.bfd} days away</div></div>
        <div class="sp-tile good"><div class="l">Safe to scale</div><div class="v">${J.scale.length}<small>products</small></div><div class="s">3+ months of stock, or a restock lands in time</div></div>
        <div class="sp-tile"><div class="l">Too much stock</div><div class="v">${money(J.tiedUp)}<small>at cost</small></div><div class="s">${plural(J.clear.length, 'product')} with over a year on the shelf</div></div>
      </div>
      <div class="sp-lanes">
        ${lane(J, 'bad', 'Ease off', `Runs out by Cyber Monday, or before its restock lands`, J.ease, p => `${p.status === 'out' ? 'out now' : 'runs out ' + day(p.runOutDate)}${J.runway(p).gap ? ` · restock ${day(p.incomingLands)}` : J.runway(p).land == null ? ' · nothing on order' : ''}`, p => J.spend(p) ? `${money(J.spend(p))}<span>ads, 30 days</span>` : '<span>no ads</span>', 'Nothing runs out before its restock.')}
        ${lane(J, 'good', 'Safe to scale', 'Selling, with stock or a restock that covers it', J.scale, p => `${one(p.perWeek)} a week · ${J.runway(p).days > H_DAYS ? '6+ months' : 'to ' + day(p.runOutDate)}`, p => J.spend(p) ? `${money(J.spend(p))}<span>ads, 30 days</span>` : '<span>no ads yet</span>', 'Nothing has 3 months of stock yet.')}
        ${lane(J, 'warn', 'Push to clear', 'Over a year of stock: a promotion, a bundle or an ad test', J.clear, p => `${int(p.onHand)} on hand · ${p.weeksOfCover ? p.weeksOfCover + ' weeks of stock' : 'not selling'}`, p => `${money(J.tied(p))}<span>at cost</span>`, 'Nothing is piling up.')}
      </div>
      <div class="sp-card"><div class="sp-ch"><h3>How long the stock lasts</h3><span class="cap">each bar is a product, from today to the day it runs out at today's pace</span><span class="r sp-chips">${[['adv', 'Advertised'], ['low', 'Running low'], ['all', 'Everything']].map(([k, l]) => `<button type="button" class="sp-chip ${filt === k ? 'on' : ''}" data-rf="${k}">${l}</button>`).join('')}</span></div>
        ${runwayChart(J, st, filt)}
        <div class="sp-lg"><span><i style="background:var(--bad)"></i>Under 30 days</span><span><i style="background:var(--warn)"></i>Runs out by Cyber Monday</span><span><i style="background:var(--good)"></i>Lasts past it</span><span><i style="background:repeating-linear-gradient(135deg,var(--bad) 0 2px,transparent 2px 6px)"></i>Empty, waiting for a restock</span><span><i style="background:var(--good);width:9px;height:9px;transform:rotate(45deg)"></i>Restock lands</span><span><i style="border-left:2px dashed var(--c-email);width:2px;height:12px;border-radius:0"></i>Black Friday</span></div></div>`);
    const root = $('#main');
    root.querySelectorAll('[data-rf]').forEach(c => c.onclick = () => { STOCK_FILTER.set(c.dataset.rf); renderStock(false); });
    wireCommon(root);
    const pend = PENDING.take('product'); if (pend) openProduct(pend);
  }
  const STOCK_FILTER = { get: () => { try { return localStorage.getItem('sp_rf') || 'adv'; } catch { return 'adv'; } }, set: v => { try { localStorage.setItem('sp_rf', v); } catch {} } };
  function lane(J, k, title, sub, ps, line, num, empty) {
    return `<div class="sp-lane ${k}"><div class="lh"><b><i></i>${title} <em>${ps.length}</em></b><span>${sub}</span></div>
      ${ps.length ? ps.slice(0, 5).map(p => `<button type="button" class="sp-li" data-sp-p="${esc(p.id)}">${av(p)}<div style="min-width:0"><div class="t">${esc(p.title)}</div><div class="s">${line(p)}</div></div><div class="n">${num(p)}</div></button>`).join('') : `<div class="none">${empty}</div>`}
      ${ps.length > 5 ? `<div class="more">and ${ps.length - 5} more in the chart below</div>` : ''}</div>`;
  }
  function runwayChart(J, st, filt) {
    let ps = J.live.filter(p => p.velocity > 0.001);
    if (filt === 'adv') ps = ps.filter(p => J.spend(p) > 0);
    if (filt === 'low') ps = ps.filter(p => J.call(p) === 'ease');
    ps.sort((a, b) => (J.runway(a).days ?? 999) - (J.runway(b).days ?? 999));
    const x = d => Math.max(0, Math.min(100, d / H_DAYS * 100));
    const ticks = [];
    for (let m = 1; m <= 6; m++) { const d = new Date(st.today + 'T12:00:00Z'); d.setUTCMonth(d.getUTCMonth() + m, 1); const ymd = d.toISOString().slice(0, 10), dd = between(st.today, ymd); if (dd <= H_DAYS && Math.abs(dd - J.SE.bfd) > 9) ticks.push([dd, d.toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' })]); }
    const row = p => {
      const r = J.runway(p), d = Math.min(r.days, H_DAYS), cls = r.days < 30 && !r.cover ? 'bad' : r.days <= J.SE.cmd && !r.cover ? 'warn' : 'good';
      let segs = d > 0 ? `<span class="seg ${cls}" style="left:0;width:${x(d)}%"${tip(`${p.title}: ${int(p.onHand)} on hand at ${one(p.perWeek)} a week`)}></span>` : '';
      if (r.land != null && r.land <= H_DAYS) {
        if (r.gap) segs += `<span class="gap" style="left:${x(r.days)}%;width:${x(r.land) - x(r.days)}%"${tip(`Empty for ${r.gap} days, until ${int(p.incoming)} land ${day(p.incomingLands)}`)}></span>`;
        segs += `<span class="seg after" style="left:${x(r.land)}%;width:${Math.max(0, x(r.land + r.after) - x(r.land))}%"></span><span class="land" style="left:${x(r.land)}%"${tip(`${int(p.incoming)} land ${day(p.incomingLands)}`)}></span>`;
      }
      if (r.days > H_DAYS || (r.land != null && r.land + r.after > H_DAYS)) segs += '<span class="arrow"></span>';
      if (J.SE.bfd <= H_DAYS) segs += `<span class="bfl" style="left:${x(J.SE.bfd)}%"></span>`;
      const end = p.status === 'out' || r.days === 0 ? '<span class="sp-late">out now</span>' : r.days > H_DAYS ? '<span class="sp-good">6+ months</span>' : `<span class="${cls === 'bad' ? 'sp-late' : cls === 'warn' ? 'sp-warn' : ''}">${day(p.runOutDate)}</span>`;
      return `<div class="sp-rwr" data-sp-p="${esc(p.id)}"><div class="nm">${esc(p.title)}<span>${one(p.perWeek)} a week · ${int(p.onHand)} on hand</span></div><div class="adv ${J.spend(p) ? '' : 'none'}">${J.spend(p) ? money(J.spend(p)) : 'no ads'}</div><div class="sp-trk">${segs}</div><div class="end">${end}</div></div>`;
    };
    return `<div class="sp-rwh"><span>Product</span><span style="text-align:right">Ads, 30d</span><div class="sp-axis"><span style="left:0;transform:none">Today</span>${ticks.map(([d, l]) => `<span style="left:${x(d)}%">${l}</span>`).join('')}${J.SE.bfd <= H_DAYS ? `<span class="bf" style="left:${x(J.SE.bfd)}%">Black Friday</span>` : ''}</div><span style="text-align:right">Runs out</span></div>
      ${ps.map(row).join('') || '<p class="sp-hint" style="padding:12px 0">Nothing here with this filter.</p>'}`;
  }

  /* ---------- All clients ---------- */
  async function agency() {
    const tab = 'stock';
    const accts = (H.S.accounts || []).slice().sort((a, b) => a.name.localeCompare(b.name));
    const rows = await Promise.all(accts.map(async a => {
      const b = brandOf(a.act_id);
      if (!b) return { a, b: null };
      try { const [st, ads] = await Promise.all([state(b.id), stockAds(a.act_id)]); return { a, b, J: judge(st, ads), ads }; } catch (e) { return { a, b, err: e.message }; }
    }));
    const live = rows.filter(r => r.J);
    const worst = live.sort((x, y) => y.J.easeSpend - x.J.easeSpend)[0];
    const others = rows.filter(r => !r.J);
    $('#main').innerHTML = frame(tab, 'Stock', `
      <p class="sp-lead">${worst && worst.J.easeSpend ? `${money(worst.J.easeSpend)} of ${esc(worst.a.name)}'s ad spend last month went to products that run out by Cyber Monday.` : live.length ? 'No client is spending on stock that is about to run out.' : 'No client has a stock feed yet.'}</p>
      <p class="sp-sub">One line per client: is the stock there for what we advertise, and is anything sitting that we should push. Stock reads itself from Shopify; the only setup is the brand installing the <b>Mobius Digital Shopify app</b>. Factories and order dates only appear on brands we buy for.</p>
      <div class="sp-card"><div class="sp-tbl"><table>
        <tr><th class="l">Client</th><th class="l">Ad spend on low stock, 30 days</th><th>Out now</th><th>Run out by Cyber Monday</th><th>Safe to scale</th><th>Too much stock</th><th class="l">Stock feed</th></tr>
        ${live.map(r => { const m = r.ads ? r.ads.mapped : 0; return `<tr class="link" data-act="${esc(r.a.act_id)}"><td class="l"><span class="nm">${esc(r.a.name)}</span><span class="sub">${[r.b.buys ? 'buying' : '', r.b.makes ? 'drops' : ''].filter(Boolean).join(' and ') + (r.b.buys || r.b.makes ? ' on' : 'stock only')}</span></td>
          <td class="l"><b class="${r.J.easeSpend ? 'sp-late' : ''}">${money(r.J.easeSpend)}</b> <span class="sp-mut">of ${money(m)} tied to a product</span>${m ? `<span class="sp-meter" style="width:180px"><i style="width:${(r.J.easeSpend / m * 100).toFixed(1)}%;background:var(--bad)"></i><i style="width:${(r.J.scaleSpend / m * 100).toFixed(1)}%;background:var(--good)"></i></span>` : ''}</td>
          <td><b class="${r.J.out ? 'sp-late' : ''}">${r.J.out}</b></td><td><b class="${r.J.byCM ? 'sp-warn' : ''}">${r.J.byCM}</b></td><td><b class="sp-good">${r.J.scale.length}</b></td><td>${money(r.J.tiedUp)}<span class="sub">${plural(r.J.clear.length, 'product')}</span></td><td class="l">${pill('good', 'Connected')}</td></tr>`; }).join('')}
        ${others.map(r => `<tr><td class="l"><span class="nm">${esc(r.a.name)}</span></td><td class="l sp-mut" colspan="5">${r.err ? esc(r.err) : 'Stock shows here once the brand installs the Mobius Digital Shopify app.'}</td><td class="l">${pill('n', r.err ? 'Error' : 'Not connected')}</td></tr>`).join('')}
      </table></div></div>`);
    $('#main').querySelectorAll('tr[data-act]').forEach(tr => tr.onclick = () => { H.S.act = tr.dataset.act; try { localStorage.setItem('pf_act', tr.dataset.act); } catch {} const cp = document.getElementById('clientPick'); if (cp) cp.value = tr.dataset.act; H.show('stock'); });
  }

  /* ---------- the product panel (every brand) ---------- */
  function panel(title, html) {
    let p = document.getElementById('sppanel');
    if (!p) {
      document.body.insertAdjacentHTML('beforeend', `<div id="spscrim"></div><aside id="sppanel" aria-label="Detail"><div class="ph"><b></b><button type="button" aria-label="Close"><svg class="li" width="16" height="16" viewBox="0 0 24 24" aria-hidden="true"><use href="#i-x"/></svg></button></div><div class="pb"></div></aside>`);
      p = document.getElementById('sppanel');
      const close = () => { p.classList.remove('on'); document.getElementById('spscrim').classList.remove('on'); };
      p.querySelector('.ph button').onclick = close; document.getElementById('spscrim').onclick = close;
      document.addEventListener('keydown', e => { if (e.key === 'Escape' && p.classList.contains('on') && !document.querySelector('.modal-wrap')) close(); });
      p.closePanel = close;
    }
    p.querySelector('.ph b').textContent = title; p.querySelector('.pb').innerHTML = html; p.querySelector('.pb').scrollTop = 0;
    p.classList.add('on'); document.getElementById('spscrim').classList.add('on');
    return p.querySelector('.pb');
  }
  const closePanel = () => { const p = document.getElementById('sppanel'); if (p && p.closePanel) p.closePanel(); };

  function openProduct(id, what) {
    if (!CUR) return;
    const { st, J, brand } = CUR; const p = st.products.find(x => String(x.id) === String(id)); if (!p) return;
    const c = J.call(p), [k, label] = CALL[c], r = J.runway(p), a = J.ap(p.id);
    const verdict = {
      ease: `${p.status === 'out' ? 'It is out now.' : `At ${one(p.perWeek)} a week it runs out ${day(p.runOutDate)}.`}${r.land != null ? ` The restock lands ${day(p.incomingLands)}${r.gap ? `, ${r.gap} days later` : ''}.` : ' Nothing is on order.'}${J.spend(p) ? ` ${money(J.spend(p))} of ads sold it last month: move that budget to a product that can take it${r.gap > 14 ? ', or sell the gap on pre-order' : ''}.` : ''}`,
      scale: `${r.days > H_DAYS ? 'More than 6 months of stock' : `Stock to ${day(p.runOutDate)}`}${r.land != null ? ` and ${int(p.incoming)} more landing ${day(p.incomingLands)}` : ''}. Room to spend more on it.`,
      clear: `${int(p.onHand)} on hand at ${one(p.perWeek)} a week is ${p.weeksOfCover ? p.weeksOfCover + ' weeks' : 'more than a year'} of stock, ${money(J.tied(p))} at cost. Worth a promotion, a bundle with a best seller, or an ad test.`,
      watch: `Stock to ${day(p.runOutDate)}. Fine for now; it moves to Ease off if a restock is not placed in time.`,
      quiet: p.lifecycle === 'drop' ? 'A limited drop: it sells out on purpose and never asks for a reorder.' : 'Not selling in the last 90 days.' }[c];
    what = what || { qty: p.suggested || 100, sent: st.today };
    const buyer = !!brand.buys;
    const body = panel(p.title, `
      <div class="sp-row">${av(p)}<div style="min-width:0"><div class="sp-mut">${esc(p.lineName || 'Not in a group')}${p.factoryName && buyer ? ' · ' + esc(p.factoryName) : ''}</div></div></div>
      <div class="sp-verdict ${k}"><b>${label}</b><span>${verdict}</span></div>
      <div class="sp-stats">
        <div><div class="l">On hand</div><div class="v">${int(p.onHand)}</div><div class="s">${plural(p.variants.length, 'size')}${p.oversold ? `, ${p.oversold} oversold` : ''}</div></div>
        <div><div class="l">Sells</div><div class="v">${one(p.perWeek)}</div><div class="s">a week · ${({ rising: 'rising', spiking: 'spiking', falling: 'slowing', steady: 'steady', new: 'new', flat: 'flat' })[p.trend] || ''}</div></div>
        <div><div class="l">Runs out</div><div class="v">${p.status === 'out' ? 'Now' : r.days == null ? '–' : r.days > H_DAYS ? '6+ mo' : day(p.runOutDate)}</div><div class="s">${r.land != null ? 'restock ' + day(p.incomingLands) : 'nothing on order'}</div></div>
        <div${tip('Last 30 days of Meta spend on ads whose Triple Whale orders contain this product, shared across the products in each order')}><div class="l">Ads behind it</div><div class="v">${a ? money(a.spend) : '–'}</div><div class="s">${a ? `${a.orders} orders from ${plural(a.ads, 'ad')}, 30 days` : 'no ad-driven orders'}</div></div>
      </div>
      <div class="sp-card sp-chart"><div class="sp-ch"><h3>Sold each day, then the shelf ahead</h3><span class="cap">left: the last 90 days · right: the next 6 months</span></div>${productChart(p, st, J, buyer ? what : null)}
        <div class="sp-lg"><span><i style="background:var(--line-strong)"></i>Sold a day</span><span><i style="background:var(--muted);height:3px"></i>On the shelf</span>${buyer ? '<span><i style="background:var(--brand);height:3px"></i>With a new order</span>' : ''}<span><i style="background:var(--bad-bg)"></i>A core size is empty</span><span><i style="border-left:2px dashed var(--c-email);width:2px;height:12px;border-radius:0"></i>Black Friday</span></div>
        ${buyer && p.leadDays != null ? `<div class="sp-fields" style="margin-top:12px"><div class="sp-field"><label for="spWq">Try an order of</label><input id="spWq" type="number" min="0" value="${what.qty}"></div><div class="sp-field"><label for="spWs">Placed on</label><input id="spWs" type="date" value="${what.sent}"></div></div>
          ${(() => { const lands = add(what.sent, p.leadDays), s = simulate(p, st, what); return `<div class="sp-what"><div><span>Lands</span><b>${day(lands)}</b></div><div${tip('Days the product is short: from the day its first core size runs out to the day this order (or one already on the way) lands')}><span>Short for</span><b class="${s.gap ? 'sp-late' : 'sp-good'}">${s.gap ? s.gap + ' days' : 'no gap'}</b></div><div><span>Lasts until</span><b>${s.lasts ? day(s.lasts) : '6+ months'}</b></div><div><span>Cost</span><b>${p.cost != null ? moneyFull(what.qty * p.cost) : '–'}</b></div></div>${s.gap > 14 ? `<div class="sp-box warn" style="margin-top:10px"><b>Sell the gap on pre-order.</b> ${s.gap} empty days are locked in. Keep the empty sizes selling in Shopify with "ships ${day(lands)}" on the page, and switch it back when the order lands.</div>` : ''}`; })()}` : ''}
      </div>
      <div class="sp-card"><div class="sp-ch"><h3>By size</h3><span class="cap">${p.coreCount < p.variants.length ? `${p.coreCount} of ${p.variants.length} sizes carry 80% of sales` : 'which sizes run out first'}</span></div><div class="sp-tbl"><table><tr><th class="l">Size</th><th>On hand</th><th>Sold, 90 days</th><th>A week</th><th>Runs out</th>${buyer ? '<th>Suggested</th>' : ''}</tr>
        ${p.variants.map(v => `<tr><td class="l">${esc(v.axis || v.sku || v.title || '–')}${v.isCore ? '' : ' <span class="sp-mut">tail</span>'}${v.curveBased ? ` <span class="sp-pill n"${tip("Off the shelf most of the window, so its demand comes from the group's size mix")}>from size mix</span>` : ''}</td><td>${v.onHand < 0 ? `<span class="sp-late">${v.onHand}</span>` : v.onHand}${v.incoming ? `<span class="sub">+${v.incoming} coming</span>` : ''}</td><td${tip(`${v.sold14} in 14 days · ${v.sold30} in 30 · ${v.sold90} in 90`)}>${v.sold90}</td><td><b>${one(v.velocity * 7)}</b></td><td>${v.onHand <= 0 && v.velocity > 0.001 ? '<span class="sp-late">out</span>' : v.runOutDays == null ? '–' : v.runOutDays > H_DAYS ? '6+ months' : day(add(st.today, v.runOutDays))}</td>${buyer ? `<td>${v.suggested || '–'}</td>` : ''}</tr>`).join('')}</table></div>
        <p class="sp-hint" style="margin-top:10px">Why ${one(p.perWeek)} a week: the last 14, 30 and 90 days blended (45, 35 and 20 percent), ignoring days a size was empty, with a promo spike capped at twice the 90-day rate.</p></div>
      <div class="sp-card"><div class="sp-ch"><h3>How we treat it</h3><span class="cap">saves as you change it</span></div>
        <div class="sp-fields"><div class="sp-field"><label for="spLc">Kind of product</label><select id="spLc">${[['core', 'Core: always on the shelf'], ['drop', 'Limited drop: sells out on purpose'], ['winding_down', 'Winding down: sell the rest'], ['discontinued', 'Discontinued: hide it']].map(([v, l]) => `<option value="${v}" ${p.lifecycle === v || (v === 'core' && p.lifecycle === 'seasonal') ? 'selected' : ''}>${l}</option>`).join('')}</select><div class="help">Only core products are forecast for a reorder.</div></div>
          ${buyer ? `<div class="sp-field"><label for="spMoq">Minimum order</label><input id="spMoq" type="number" min="0" value="${p.moq ?? ''}" placeholder="none"><div class="help">Units the factory needs per style.</div></div>
          <div class="sp-field"><label for="spLead">Lead time, days</label><input id="spLead" type="number" min="0" value="${p.leadParts && p.leadParts.source === 'product' ? p.leadParts.base : ''}" placeholder="${p.leadParts ? p.leadParts.base : ''}"><div class="help">${p.leadParts ? `${p.leadParts.base} from the ${p.leadParts.source === 'factory' ? 'factory' : p.leadParts.source === 'line' ? 'group' : 'product'}, plus ${p.leadParts.buffer} buffer.` : 'No factory yet.'}</div></div>` : ''}
          <div class="sp-field wide"><label for="spNotes">Notes</label><textarea id="spNotes" placeholder="Anything the next person should know">${esc(p.notes || '')}</textarea></div></div></div>
      <div class="sp-row">${buyer ? '<button class="btn primary" id="spAddO">Add to an order</button>' : ''}<button class="btn" id="spShop">Open in Shopify</button></div>`);
    const set = patch => save(brand.id, `/api/products/${encodeURIComponent(p.id)}`, patch).then(() => { refresh().then(() => openProduct(id, readWhat())); }).catch(() => {});
    const readWhat = () => body.querySelector('#spWq') ? { qty: +body.querySelector('#spWq').value || 0, sent: body.querySelector('#spWs').value || st.today } : what;
    body.querySelector('#spLc').onchange = e => set({ lifecycle: e.target.value });
    body.querySelector('#spNotes').onchange = e => set({ notes: e.target.value });
    if (body.querySelector('#spMoq')) { body.querySelector('#spMoq').onchange = e => set({ moq: +e.target.value || 0 }); body.querySelector('#spLead').onchange = e => set({ lead_override_days: +e.target.value || null }); }
    if (body.querySelector('#spWq')) { const upd = () => openProduct(id, readWhat()); body.querySelector('#spWq').onchange = upd; body.querySelector('#spWs').onchange = upd; }
    body.querySelector('#spShop').onclick = () => window.open(`https://admin.shopify.com/store/${encodeURIComponent((st.db.brand?.shop_domain || '').replace('.myshopify.com', ''))}/products/${p.id}`, '_blank', 'noopener');
    if (body.querySelector('#spAddO')) body.querySelector('#spAddO').onclick = () => orderBuilder([p.id], { [p.id]: readWhat().qty });
  }
  function simulate(p, st, what) {
    const adds = []; for (const v of p.variants) for (const o of v.incomingOrders || []) if (o.lands) adds.push([between(st.today, o.lands), o.qty]);
    const run = extra => { const out = []; let s = Math.max(0, p.onHand); for (let d = 0; d <= H_DAYS; d++) { for (const [ad, q] of extra) if (ad === d) s += q; out.push(s); s = Math.max(0, s - p.velocity); } return out; };
    const base = run(adds), ld = what && p.leadDays != null ? between(st.today, add(what.sent, p.leadDays)) : null;
    const scen = ld != null && what.qty > 0 ? run([...adds, [ld, what.qty]]) : null;
    /* "Empty" follows the brain: the product is short once its first core size runs out (runOutDays),
       even while other sizes still sit on the shelf; it stays short until the next landing. */
    const rd = p.velocity <= 0.001 ? null : p.status === 'out' ? 0 : p.runOutDays;
    const lands = [...adds.map(a => a[0]), ...(scen ? [ld] : [])].filter(d => d >= 0).sort((a, b) => a - b);
    const next = rd == null ? null : lands.find(d => d > rd) ?? null;
    const covered = rd != null && lands.some(d => d <= rd) && p.status !== 'out' && p.status !== 'gap';
    const gap = rd == null || covered ? 0 : (next == null ? H_DAYS : next) - rd;
    const first = (p.variants || []).filter(v => v.isCore && v.velocity > 0.001).sort((a, b) => (a.onHand <= 0 ? -1 : a.runOutDays ?? 9e9) - (b.onHand <= 0 ? -1 : b.runOutDays ?? 9e9))[0];
    let lasts = null; if (scen && ld != null) { const z = scen.findIndex((u, i) => i > ld && u <= 0); lasts = z > 0 ? add(st.today, z) : null; }
    return { base, scen, gap: Math.max(0, gap), rd: covered ? null : rd, next, lasts, ld, adds, first };
  }
  function productChart(p, st, J, what) {
    const W = 680, Hh = 220, padT = 14, padB = 24, x0 = 8, xT = x0 + 200, x1 = W - 8;
    const series = p.variants.reduce((acc, v) => acc.map((n, i) => n + ((v.series || [])[i] || 0)), Array(90).fill(0));
    const sim = simulate(p, st, what);
    const maxS = Math.max(1, ...series), maxU = Math.max(10, ...sim.base, ...(sim.scen || [])) * 1.12;
    const yS = v => Hh - padB - v / maxS * 56, yU = u => padT + (1 - u / maxU) * (Hh - padT - padB);
    const xs = i => x0 + i / 90 * (xT - x0), xu = d => xT + d / H_DAYS * (x1 - xT);
    let g = `<line x1="${x0}" x2="${x1}" y1="${Hh - padB}" y2="${Hh - padB}" style="stroke:var(--line-strong)"/>`;
    series.forEach((v, i) => { const y = yS(v); g += `<rect x="${xs(i).toFixed(1)}" y="${y.toFixed(1)}" width="${Math.max(1, (xT - x0) / 90 - 0.6).toFixed(1)}" height="${(Hh - padB - y).toFixed(1)}" style="fill:var(--line-strong)"${tip(`${day(add(st.today, i - 90))}: ${v} sold`)}/>`; });
    if (sim.rd != null && sim.rd <= H_DAYS && sim.gap > 0) {
      const e = Math.min(H_DAYS, sim.rd + sim.gap), who = sim.first ? (sim.first.axis || sim.first.sku || 'a size') : 'a size';
      g += `<rect x="${xu(sim.rd)}" y="${padT}" width="${Math.max(2, xu(e) - xu(sim.rd))}" height="${Hh - padT - padB}" style="fill:var(--bad-bg)"${tip(`From ${day(add(st.today, sim.rd))} ${who} is empty, so the product is short until ${sim.next != null ? 'the order lands ' + day(add(st.today, sim.next)) : 'a restock lands'}`)}/>`;
      g += `<text x="${Math.min(xu(sim.rd) + 4, x1 - 150)}" y="${Hh - padB - 6}" font-size="10.5" font-weight="600" style="fill:var(--bad)">${esc(who)} runs out ${day(add(st.today, sim.rd))}</text>`;
    }
    const path = arr => arr.map((u, d) => (d ? 'L' : 'M') + xu(d).toFixed(1) + ',' + yU(u).toFixed(1)).join('');
    g += `<path d="${path(sim.base)}" fill="none" style="stroke:var(--muted)" stroke-width="1.8"/>`;
    if (sim.scen) g += `<path d="${path(sim.scen)}" fill="none" style="stroke:var(--brand)" stroke-width="2.2" stroke-dasharray="5 3"/>`;
    if (J.SE.bfd <= H_DAYS) g += `<line x1="${xu(J.SE.bfd)}" x2="${xu(J.SE.bfd)}" y1="${padT}" y2="${Hh - padB}" style="stroke:var(--c-email)" stroke-dasharray="3 3"/><text x="${xu(J.SE.bfd) + 4}" y="${padT + 10}" font-size="10.5" font-weight="700" style="fill:var(--c-email)">Black Friday</text>`;
    g += `<line x1="${xT}" x2="${xT}" y1="${padT - 4}" y2="${Hh - padB}" style="stroke:var(--ink-2)"/><text x="${xT}" y="${Hh - 7}" text-anchor="middle" font-size="10.5" font-weight="600" style="fill:var(--ink)">Today</text>`;
    g += `<text x="${x0}" y="${Hh - 7}" font-size="10" style="fill:var(--faint)">${day(add(st.today, -90))}</text><text x="${x1}" y="${Hh - 7}" text-anchor="end" font-size="10" style="fill:var(--faint)">${day(add(st.today, H_DAYS))}</text><text x="${xT + 4}" y="${Math.max(padT + 22, yU(sim.base[0]) - 6)}" font-size="10.5" font-weight="600" style="fill:var(--ink-2)">${int(sim.base[0])} on the shelf</text>`;
    for (const [dd, q] of sim.adds) if (dd >= 0 && dd <= H_DAYS) g += `<circle cx="${xu(dd)}" cy="${yU(sim.base[dd])}" r="4" style="fill:var(--good)"/><text x="${Math.min(xu(dd) + 6, x1 - 110)}" y="${yU(sim.base[dd]) - 7}" font-size="10.5" font-weight="600" style="fill:var(--good)">+${int(q)} land ${day(add(st.today, dd))}</text>`;
    for (let d = 0; d <= H_DAYS; d += 4) g += `<rect x="${xu(d) - 3}" y="${padT}" width="6" height="${Hh - padT - padB}" fill="transparent"${tip(`${day(add(st.today, d))}: ${int(sim.base[d])} on the shelf${sim.scen ? `, ${int(sim.scen[d])} with the new order` : ''}`)}/>`;
    return `<div class="sp-tbl"><svg viewBox="0 0 ${W} ${Hh}" style="width:100%;min-width:520px;display:block" role="img" aria-label="Daily sales, then stock on the shelf">${g}</svg></div>`;
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
        <div class="row" style="justify-content:flex-end;gap:8px;margin:14px 0 0"><button class="btn" data-m="no">Cancel</button><button class="btn ${danger ? '' : 'primary'}" data-m="yes" ${danger ? 'style="color:var(--bad)"' : ''}>${esc(confirm)}</button></div></div>`;
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
    if (first || !$('#main .sp')) loading(tab, 'Buying');
    try { await loadBrands(); } catch (e) { return msg(tab, 'Buying', `<p class="sp-late">${esc(e.message)}</p>`); }
    const act = H.S.act, b = act === 'all' ? null : brandOf(act);
    if (act === 'all') return msg(tab, 'Buying', '<p class="sp-hint">Buying is per brand. Pick a brand we buy for (Lucky Golf) in the client picker.</p>');
    if (!b || !b.buys) return noFeed(tab, (H.S.accounts.find(a => a.act_id === act) || {}).name || 'This brand');
    const run = H.RUN();
    let st, ads; try { [st, ads] = await Promise.all([state(b.id), stockAds(act)]); } catch (e) { return msg(tab, 'Buying', `<p class="sp-late">${esc(e.message)}</p>`); }
    if (run !== H.RUN()) return;
    CUR = { brand: b, st, ads, J: judge(st, ads) };
    const due = st.products.filter(p => ['out', 'order', 'gap'].includes(p.status));
    const byF = new Map(); for (const p of due) { const k = p.factoryId || ''; if (!byF.has(k)) byF.set(k, []); byF.get(k).push(p); }
    const open = st.orders.filter(o => OPEN.includes(o.status)).sort((x, y) => (x.expected_at || '9') < (y.expected_at || '9') ? -1 : 1);
    const drafts = st.orders.filter(o => o.status === 'draft'), landed = st.orders.filter(o => o.status === 'landed');
    const soon = st.products.filter(p => p.status === 'soon').sort((x, y) => (x.orderByDate || '9') < (y.orderByDate || '9') ? -1 : 1);
    $('#main').innerHTML = frame(tab, 'Buying', `
      <p class="sp-lead">${byF.size ? `${byF.size === 1 ? 'One factory order' : byF.size + ' factory orders'} to place${due.some(p => p.overdue || p.status === 'out') ? ' now' : ' within two weeks'}` : 'Nothing to order in the next two weeks'}${open.length ? `, and ${plural(open.length, 'order')} on the way` : ''}.</p>
      <p class="sp-sub">One card per factory, because that is how an order goes out. Quantities cover ${st.settings.cover_days} days after the order lands, split by size and checked against the factory's minimum. Placed orders count as stock on the way everywhere in Locus.</p>
      ${[...byF.entries()].map(([fid, ps]) => facCard(st, fid, ps)).join('')}
      ${soon.length ? `<div class="sp-card"><div class="sp-ch"><h3>Coming up</h3><span class="cap">order dates in the next 60 days after that</span></div><div class="sp-tbl"><table><tr><th class="l">Product</th><th class="l">Factory</th><th>Runs out</th><th>Order by</th><th>Suggested</th></tr>${soon.map(p => `<tr class="link" data-sp-p="${esc(p.id)}"><td class="l"><span class="nm">${esc(p.title)}</span></td><td class="l">${esc(p.factoryName || '–')}</td><td>${day(p.runOutDate)}</td><td><b>${day(p.orderByDate)}</b></td><td>${int(p.suggested)}</td></tr>`).join('')}</table></div></div>` : ''}
      <div class="sp-card"><div class="sp-ch"><h3>On the way</h3><span class="cap">click an order to update its stage or received counts</span><span class="r"><button class="btn btn-s" id="spNewO">Log an order</button></span></div>
        ${open.length ? open.map(o => poRow(st, o)).join('') : '<p class="sp-hint">Nothing on the way. When an order is placed, it lands here and counts as stock on the way.</p>'}
        ${drafts.length ? `<div class="sp-ch" style="margin:14px 0 6px"><h3>Drafts</h3><span class="cap">not placed, so they change nothing</span></div>${drafts.map(o => `<div class="sp-po" data-o="${esc(o.id)}"><div><b>${esc(o.id)}</b> ${pill('n', 'Draft')}<div class="sp-mut">${esc(o.factoryName || '')} · ${int(o.units)} units · ${esc(o.productTitles.slice(0, 2).join(', '))}</div></div><div class="sp-mut">Open it to place it or delete it.</div></div>`).join('')}` : ''}
        ${landed.length ? `<details style="margin-top:12px"><summary class="sp-mut" style="cursor:pointer">${plural(landed.length, 'landed order')}</summary>${landed.map(o => `<div class="sp-po" data-o="${esc(o.id)}"><div><b>${esc(o.id)}</b> ${pill('good', 'Landed')}<div class="sp-mut">${esc(o.factoryName || '')} · ${int(o.units)} units</div></div><div class="sp-mut">Landed ${day(o.landed_at || o.expected_at)}</div></div>`).join('')}</details>` : ''}
      </div>`);
    const root = $('#main'); wireCommon(root);
    root.querySelectorAll('[data-x]').forEach(bn => bn.onclick = () => { const id = bn.dataset.x; EXCL.has(id) ? EXCL.delete(id) : EXCL.add(id); renderBuying(false); });
    root.querySelectorAll('[data-oneoff]').forEach(bn => bn.onclick = async () => { await save(b.id, `/api/products/${encodeURIComponent(bn.dataset.oneoff)}`, { lifecycle: 'drop' }, 'PUT', 'Marked a one-off. It stops asking for a reorder.'); STATE.delete(b.id); renderBuying(false); });
    root.querySelectorAll('[data-build]').forEach(bn => bn.onclick = () => { const ps = byF.get(bn.dataset.build) || []; const ids = ps.filter(p => !EXCL.has(p.id) && plan(p).qty > 0).map(p => p.id); if (!ids.length) return toast('Every product on this card is left out.', true); orderBuilder(ids, Object.fromEntries(ps.map(p => [p.id, plan(p).qty]))); });
    root.querySelectorAll('[data-o]').forEach(el => el.onclick = () => openOrder(el.dataset.o));
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
    const now = ps.some(p => p.overdue || p.status === 'out');
    return `<div class="sp-fo"><div class="foh"><div><h3>${esc(f ? f.name : 'No factory yet')} ${now ? pill('bad', 'Due now') : pill('warn', 'Due within two weeks')}</h3>
        <div class="sp-facts"><div><span>Products</span><b>${inc.length}</b></div><div><span>Units</span><b>${int(units)}</b></div><div><span>At cost</span><b>${money(cost)}</b></div><div><span>Lands if placed today</span><b>${lead ? day(add(st.today, lead)) : '–'}</b></div><div><span>Lead time</span><b>${f ? `${f.production_days + f.shipping_days} + ${st.settings.buffer_days} days` : '–'}</b></div></div></div>
        ${f ? `<button class="btn primary" data-build="${esc(fid)}">Build this order ›</button>` : '<button class="btn" data-sp-set="1">Give these a factory</button>'}</div>
      <div class="rows">${rows.map(({ p, yrs, under, skip, qty, out }) => `<div class="sp-ord ${out ? 'out' : ''}"><div><div class="t" data-sp-p="${esc(p.id)}">${esc(p.title)}</div><div class="s">${p.status === 'out' ? '<span class="sp-late">out now</span>' : p.status === 'gap' ? `runs out ${day(p.runOutDate)}, the order on the way lands ${day(p.incomingLands)}` : `runs out ${day(p.runOutDate)}`} · ${one(p.perWeek)} a week${p.sizeGap && p.sizeGap.length ? ` · empty: ${esc(p.sizeGap.slice(0, 3).join(', '))}` : ''}</div></div>
        <div class="why">${skip ? `<span class="sp-warn">Skip it, or call it a one-off.</span> The ${p.moq} minimum is ${one(yrs)} years of sales.` : under ? `Raised to the ${p.moq} minimum (${one(yrs)} years of sales).` : p.status === 'gap' ? (qty ? 'The order on the way lands too late; this tops up the sizes that run short.' : `Nothing more to order: the order on the way covers it, but lands ${Math.max(0, between(st.today, p.incomingLands) - (p.runOutDays || 0))} days after it runs out. Sell the gap on pre-order.`) : p.overdue || p.status === 'out' ? `Every week of waiting loses about ${Math.max(1, Math.round(p.perWeek))} sales.` : `Order by ${day(p.orderByDate)}. Covers ${Math.round(st.settings.cover_days / 30)} months after landing.`}</div>
        <div class="q">${qty ? int(qty) : '–'}<span>${qty ? money(qty * (p.cost || 0)) + ' at cost' : 'not ordered'}</span></div>
        <div class="act">${skip ? `<button class="btn btn-s" data-oneoff="${esc(p.id)}">It was a one-off</button>` : `<span class="sp-seg"><button type="button" class="${out ? '' : 'on'}" data-x="${esc(p.id)}">In</button><button type="button" class="${out ? 'on' : ''}" data-x="${esc(p.id)}">Out</button></span>`}</div></div>`).join('')}</div></div>`;
  }
  function poRow(st, o) {
    const sent = o.sent_at || st.today, tot = o.expected_at ? Math.max(1, between(sent, o.expected_at)) : 60, now = between(sent, st.today), pct = x => Math.max(0, Math.min(100, x / tot * 100));
    const f = st.factories.find(x => x.id === o.factory_id), prodEnd = f ? Math.min(tot, f.production_days) : Math.round(tot * 0.6);
    const stage = { sent: 'Placed', confirmed: 'Placed', production: 'In production', shipped: 'Shipped', partial: 'Partly landed' }[o.status] || o.status;
    return `<div class="sp-po" data-o="${esc(o.id)}"><div><b>${esc(o.id)}</b> ${pill(o.likelyLanded ? 'good' : o.overdue ? 'bad' : 'warn', o.likelyLanded ? 'Looks landed' : o.overdue ? 'Late' : stage)}<div class="sp-mut" style="margin-top:4px">${esc(o.factoryName || '')} · ${int(o.units)} units · ${money(o.atCost)} at cost</div><div class="sp-mut">${esc(o.productTitles.join(', '))}</div></div>
      <div class="sp-tl"><div class="base"></div><div class="done" style="width:${pct(now)}%"></div><span class="now" style="left:${pct(now)}%">TODAY</span>
        ${[[0, 'Placed', sent], [prodEnd, 'Ships', add(sent, prodEnd)], [tot, 'Lands', o.expected_at]].map(([d, l, dt]) => `<span class="dot ${d <= now ? 'd' : ''}" style="left:${pct(d)}%"></span><span class="lab" style="left:${Math.min(93, Math.max(7, pct(d)))}%"><b>${l}</b> ${day(dt)}</span>`).join('')}</div></div>`;
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
      <p class="sp-hint">${plural(mine.length, 'product')} · ${lead} day lead time · lands about ${day(add(today, lead))} if placed today${rest.length ? ` · ${plural(rest.length, 'product')} from another factory get their own order next` : ''}</p>
      <div class="sp-fields"><div class="sp-field"><label for="spOs">Placed on</label><input id="spOs" type="date" value="${today}" max="${today}"></div><div class="sp-field"><label for="spOe">Expected landing</label><input id="spOe" type="date" value="${add(today, lead)}"><div class="help">From the lead time. Change it when the factory confirms.</div></div></div>
      ${mine.map(p => `<div class="sp-card"><div class="sp-ch"><h3>${esc(p.title)}</h3><span class="cap">${p.moq ? `minimum ${p.moq} a style` : 'no minimum'}</span>${p.moq ? `<span class="r"><button class="btn btn-s" data-fill="${esc(p.id)}">Fill to ${p.moq} by size mix</button></span>` : ''}</div>
        <div class="sp-tbl"><table><tr><th class="l">Size</th><th>On hand</th><th>Runs out</th><th>Need</th><th>Order</th></tr>${p.variants.map(v => `<tr><td class="l">${esc(v.axis || v.sku || v.title || '–')}${v.isCore ? '' : ' <span class="sp-mut">tail</span>'}</td><td>${v.onHand}</td><td>${v.runOutDays == null ? '–' : v.onHand <= 0 ? '<span class="sp-late">out</span>' : v.runOutDays + ' days'}</td><td>${v.suggested || 0}</td><td><input class="qty" type="number" min="0" value="${Q[v.id]}" data-v="${esc(v.id)}" aria-label="${esc(v.axis || v.sku || 'size')} quantity"></td></tr>`).join('')}</table></div></div>`).join('')}
      <div class="sp-field"><label for="spOn">Note to the factory</label><textarea id="spOn" placeholder="Same specs as the last order"></textarea></div>
      <div class="sp-row"><b id="spOt">${draw()}</b><span class="grow"></span><button class="btn" id="spOd">Save as draft</button><button class="btn primary" id="spOp">Copy the order text and mark placed</button></div>`);
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
  const STAGES = [['sent', 'Placed'], ['production', 'In production'], ['shipped', 'Shipped'], ['landed', 'Landed']];
  const stageIdx = s => ({ sent: 0, confirmed: 0, production: 1, shipped: 2, partial: 3, landed: 3 })[s] ?? -1;
  function openOrder(id) {
    const { st, brand } = CUR; const o = st.orders.find(x => x.id === id); if (!o) return;
    const i = stageIdx(o.status), editable = !['landed', 'cancelled'].includes(o.status);
    const next = { draft: ['sent', 'Mark placed'], sent: ['production', 'Mark in production'], confirmed: ['production', 'Mark in production'], production: ['shipped', 'Mark shipped'], shipped: ['landed', 'Mark landed'], partial: ['landed', 'Mark fully landed'] }[o.status];
    const body = panel(`${o.id} · ${o.productTitles[0] || ''}${o.productTitles.length > 1 ? ` +${o.productTitles.length - 1}` : ''}`, `
      <p class="sp-hint">${esc(o.factoryName || 'No factory')} · ${int(o.units)} units${o.atCost ? ` · ${money(o.atCost)} at cost` : ''}</p>
      ${o.status === 'draft' ? `<div class="sp-box info"><b>A draft.</b> It changes nothing until it is placed.</div>` : `<div class="sp-step">${STAGES.map(([, l], k) => `${k ? `<em class="${k <= i ? 'done' : ''}"></em>` : ''}<span class="${k < i ? 'done' : k === i ? 'now' : ''}">${l}</span>`).join('')}</div>`}
      ${o.likelyLanded ? `<div class="sp-box good"><b>This looks landed.</b> Stock on these sizes rose ${int(o.jumpUnits)} units since it was placed. Check the received counts and mark it landed.</div>` : ''}
      <div class="sp-fields"><div class="sp-field"><label for="spDs">Placed</label><input id="spDs" type="date" value="${o.sent_at || ''}" ${editable ? '' : 'disabled'}></div><div class="sp-field"><label for="spDe">Expected landing</label><input id="spDe" type="date" value="${o.expected_at || ''}" ${editable ? '' : 'disabled'}></div>
        <div class="sp-field"><label for="spDd">Deposit</label><input id="spDd" value="${esc(o.deposit || '')}" placeholder="50% paid Aug 14"></div><div class="sp-field"><label for="spDt">Tracking</label><input id="spDt" value="${esc(o.tracking || '')}" placeholder="Carrier and number"></div>
        <div class="sp-field wide"><label for="spDn">Notes</label><textarea id="spDn">${esc(o.notes || '')}</textarea></div></div>
      <div class="sp-card"><div class="sp-ch"><h3>Lines</h3><span class="cap">${editable ? 'type received counts as boxes arrive; the rest stays on the way' : 'landed'}</span></div><div class="sp-tbl"><table><tr><th class="l">Product</th><th class="l">Size</th><th>Ordered</th><th>Received</th><th>On hand now</th><th>After landing</th></tr>
        ${o.lines.map(l => `<tr><td class="l">${esc(l.productTitle)}</td><td class="l">${esc(l.axis || l.sku || '')}</td><td><input class="qty" type="number" min="0" value="${l.qty}" data-q="${esc(l.variant_id)}" ${editable ? '' : 'disabled'}></td><td><input class="qty" type="number" min="0" value="${l.received}" data-r="${esc(l.variant_id)}" ${editable ? '' : 'disabled'}></td><td>${l.onHand == null ? '–' : l.onHand}</td><td>${int((l.onHand || 0) + Math.max(0, l.qty - l.received))}</td></tr>`).join('')}</table></div></div>
      <p class="sp-hint">Shopify stock is checked every hour. When these sizes jump by about half of what is outstanding, the order shows as "looks landed" here and in Slack.</p>
      <div class="sp-row"><button class="btn" id="spDsv">Save</button>${next ? `<button class="btn primary" id="spDnx">${next[1]}</button>` : ''}<span class="grow"></span>${editable && o.status !== 'draft' ? '<button class="btn" id="spDc" style="color:var(--bad)">Cancel order</button>' : ''}${['draft', 'cancelled'].includes(o.status) ? '<button class="btn" id="spDx" style="color:var(--bad)">Delete</button>' : ''}</div>`);
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
  const SLOT = { needs_brief: ['n', 'Needs a brief'], in_design: ['acc', 'In design'], tech_pack: ['acc', 'Tech pack'], sampling: ['acc', 'Sampling'], approved: ['good', 'Approved'], ordered: ['good', 'Ordered'], live: ['good', 'Live'] };
  const DROP = { get: () => { try { return localStorage.getItem('sp_drop') || ''; } catch { return ''; } }, set: v => { try { localStorage.setItem('sp_drop', v); } catch {} } };
  async function renderDrops(first) {
    const tab = 'drops';
    if (first || !$('#main .sp')) loading(tab, 'Drops');
    try { await loadBrands(); } catch (e) { return msg(tab, 'Drops', `<p class="sp-late">${esc(e.message)}</p>`); }
    let act = H.S.act;
    /* An Asana task's link names the design, not the brand: open the brand that makes products. */
    const pendingDesign = PENDING.peek('design');
    if (pendingDesign && (act === 'all' || !(brandOf(act) || {}).makes)) { const mk = (BRANDS || []).find(x => x.makes); if (mk) { H.S.act = act = locusId(mk.act_id); try { localStorage.setItem('pf_act', act); } catch {} const cp = document.getElementById('clientPick'); if (cp) cp.value = act; } }
    if (act === 'all') return msg(tab, 'Drops', '<p class="sp-hint">Drops is per brand. Pick a brand that designs its own products (Lucky Golf) in the client picker.</p>');
    const b = brandOf(act);
    if (!b || !b.makes) return noFeed(tab, (H.S.accounts.find(a => a.act_id === act) || {}).name || 'This brand');
    const run = H.RUN();
    let st, ads; try { [st, ads] = await Promise.all([state(b.id), stockAds(act)]); } catch (e) { return msg(tab, 'Drops', `<p class="sp-late">${esc(e.message)}</p>`); }
    if (run !== H.RUN()) return;
    CUR = { brand: b, st, ads, J: judge(st, ads) };
    const cols = st.collections || [];
    const col = cols.find(c => c.id === DROP.get()) || cols.find(c => c.drop_at >= st.today) || cols[0];
    const mine = col ? st.slots.filter(s => s.collection_id === col.id) : [];
    const loose = st.slots.filter(s => !s.collection_id && s.status !== 'live');
    const d = mine[0] && mine[0].dates;
    const groups = {}; for (const s of st.slots) if (s.next && s.status !== 'live') { const k = `${s.next.on}|${s.next.what}|${s.collectionName || ''}|${s.lineName || ''}`; (groups[k] = groups[k] || []).push(s); }
    const dueCards = [...Object.entries(groups).map(([k, ss]) => { const [on, what, c, line] = k.split('|'); return { on, late: ss[0].next.late, h: `${ss.length > 1 ? ss.length + ' ' : ''}${what.toLowerCase()}${ss.length > 1 ? 's' : ''} due`, s: `${c || 'No drop'} · ${line}` }; }),
      ...st.orders.filter(o => OPEN.includes(o.status)).map(o => ({ on: o.expected_at, late: o.overdue, h: `${o.id} lands`, s: `${int(o.units)} units from ${o.factoryName || 'the factory'}` }))].filter(x => x.on).sort((x, y) => x.on < y.on ? -1 : 1).slice(0, 6);
    const planned = st.lines.filter(l => (st.db.lines.find(x => x.id === l.id) || {}).target_designs != null);
    const lead = col && d ? `${esc(col.name)}: ${mine[0].next ? `${plural(mine.filter(s => s.next && s.next.on === mine[0].next.on).length, mine[0].next.what.toLowerCase())} due ${day(mine[0].next.on)}` : 'every design is past its last step'}, on the site ${day(col.drop_at, true)}.` : 'No drop planned yet.';
    const facIds = new Set(mine.map(x => x.factoryId).filter(Boolean));
    const cny = st.factories.filter(f => !facIds.size || facIds.has(f.id)).flatMap(f => (f.closures || []).map(c => ({ ...c, f: f.name }))).filter(c => d && c.to >= st.today && c.from <= d.onSite);
    const span = d ? Math.max(1, between(st.today, d.onSite)) : 1, px = dt => Math.max(0, Math.min(100, between(st.today, dt) / span * 100));
    const ms = d ? [['Brief', d.briefDue], ['Tech pack', d.techPackDue], ['Sample approved', d.sampleDue], ['Order placed', d.orderBy], ['Stock lands', d.lands], ['On the site', d.onSite]] : [];
    $('#main').innerHTML = frame(tab, 'Drops', `
      <p class="sp-lead">${lead}</p>
      <p class="sp-sub">You type one date per drop. Every brief, tech pack, sample and order date is worked back from it with the factory's lead time, and each design's Asana column sets its stage.</p>
      <div class="sp-row"><span class="sp-dropchips">${cols.map(c => `<button type="button" class="sp-chip ${col && c.id === col.id ? 'on' : ''}" data-drop="${esc(c.id)}">${esc(c.name)} · ${day(c.drop_at)}</button>`).join('')}</span><span class="grow"></span><button class="btn primary" id="spNewDrop">New drop</button></div>
      ${col ? `<div class="sp-card"><div class="sp-ch"><h3>${esc(col.name)}</h3><span class="cap">${plural(mine.length, 'design')}${col.lines.length ? ' · ' + esc(col.lines.join(', ')) : ''} · on the site ${day(col.drop_at, true)}${col.orderBy ? ` · first factory order by ${day(col.orderBy, true)}` : ''}</span><span class="r"><button class="btn btn-s" id="spEdDrop">Edit the drop</button></span></div>
        ${d ? `<div class="sp-tl big"><div class="base"></div>${cny.map(c => `<span class="band" style="left:${px(c.from)}%;width:${Math.max(1, px(c.to) - px(c.from))}%"${tip(`${c.f} closed ${day(c.from)} to ${day(c.to)}${c.label ? ', ' + c.label : ''}`)}></span>`).join('')}
          <span class="dot d" style="left:0"></span><span class="lab up" style="left:0;transform:none"><b>Today</b> ${day(st.today)}</span>
          ${ms.map(([l, dt], i) => `<span class="dot ${dt < st.today ? 'd' : ''}" style="left:${px(dt)}%"></span><span class="lab ${i % 2 ? 'up' : 'dn'}" style="left:${px(dt)}%;${px(dt) > 90 ? 'transform:translateX(-100%)' : px(dt) < 8 ? 'transform:none' : ''}"><b>${l}</b> ${day(dt)}</span>`).join('')}</div>
          ${cny.length ? `<p class="sp-hint" style="margin-top:6px">Hatched: ${esc(cny.map(c => `${c.f} closed ${day(c.from)} to ${day(c.to)}${c.label ? ' (' + c.label + ')' : ''}`).join('; '))}.</p>` : ''}` : '<p class="sp-hint">Add a design to see its dates.</p>'}</div>` : `<div class="sp-card"><h3 style="margin:0 0 6px">No drops yet</h3><p class="sp-hint">A drop is the new designs that go on the site the same day: a themed collection or a plain refresh. Give it a name and a date, then add designs from any group.</p></div>`}
      <div class="sp-two"><div class="sp">
        ${dueCards.length ? `<div class="sp-card"><div class="sp-ch"><h3>Coming due</h3><span class="cap">across every design and factory order, soonest first</span></div><div class="sp-due">${dueCards.map(x => `<div><em class="${x.late ? 'late' : ''}">${x.late ? 'was ' : ''}${day(x.on)}${x.late ? '' : ` · in ${between(st.today, x.on)} days`}</em><b>${esc(x.h)}</b><span>${esc(x.s)}</span></div>`).join('')}</div></div>` : ''}
        ${col ? `<div class="sp-card"><div class="sp-ch"><h3>Designs in ${esc(col.name)}</h3><span class="cap">click one for its dates, sample and Asana task</span></div>
          ${mine.length ? `<div class="sp-tbl"><table><tr><th class="l">Design</th><th class="l">Stage</th><th class="l">Next</th><th class="l">Where it is</th></tr>${mine.map(s => `<tr class="link" data-s="${esc(s.id)}"><td class="l"><span class="nm">${esc(s.name.replace(col.name + ' · ', ''))}</span><span class="sub">${esc(s.lineName || '')}</span></td><td class="l">${pill(...(SLOT[s.status] || ['n', s.status]))}</td><td class="l">${s.next ? `${esc(s.next.what)} <b class="${s.next.late ? 'sp-late' : ''}">${s.next.late ? 'was ' : 'by '}${day(s.next.on)}</b>` : '–'}</td><td class="l">${s.made ? pill(s.made.status === 'landed' ? 'good' : 'warn', s.made.label) : s.sample ? pill(s.sample.state === 'in hand' ? 'good' : 'acc', s.sample.label) : '<span class="sp-mut">nothing made yet</span>'}</td></tr>`).join('')}</table></div>` : '<p class="sp-hint">Nothing in this drop yet.</p>'}
          <div class="sp-row" style="margin-top:10px"><span class="sp-mut">Add designs:</span>${(planned.length ? planned : st.lines.filter(l => l.planned)).map(l => `<button class="btn btn-s" data-addl="${esc(l.id)}">+ ${esc(l.name)}</button>`).join('')}<button class="btn btn-s" data-addl="">+ Another group</button>${mine.some(s => !s.asana_task) ? '<button class="btn btn-s" id="spCatch">Make the missing Asana tasks</button>' : ''}</div></div>` : ''}
        ${(st.asanaLoose || []).length ? `<div class="sp-card"><div class="sp-ch"><h3>Started in Asana, not in a drop</h3><span class="cap">claim one and it gets a group, a drop and every date</span></div>${st.asanaLoose.map(t => `<div class="sp-row" style="padding:6px 0;border-top:1px solid var(--line)"><div class="grow"><b>${esc(t.name)}</b><div class="sp-mut">${esc(t.section || 'no column')}</div></div><a class="btn btn-s" href="${esc(t.url)}" target="_blank" rel="noopener">Open</a><button class="btn btn-s" data-claim="${esc(t.gid)}">Make it a design</button></div>`).join('')}</div>` : ''}
        ${loose.length ? `<div class="sp-card"><div class="sp-ch"><h3>Not in a drop</h3></div><div class="sp-tbl"><table>${loose.map(s => `<tr class="link" data-s="${esc(s.id)}"><td class="l"><span class="nm">${esc(s.name)}</span><span class="sub">${esc(s.lineName || '')}</span></td><td class="l">${pill(...(SLOT[s.status] || ['n', s.status]))}</td></tr>`).join('')}</table></div></div>` : ''}
      </div><div class="sp">${planned.map(l => keepCut(st, l)).join('') || '<div class="sp-card"><p class="sp-hint">Keep or cut appears for a group with a target number of designs. Set one in Brand settings, Stock and factories.</p></div>'}</div></div>`);
    const root = $('#main'); wireCommon(root);
    root.querySelectorAll('[data-drop]').forEach(c => c.onclick = () => { DROP.set(c.dataset.drop); renderDrops(false); });
    root.querySelector('#spNewDrop').onclick = () => editDrop(null);
    if (root.querySelector('#spEdDrop')) root.querySelector('#spEdDrop').onclick = () => editDrop(col);
    root.querySelectorAll('tr[data-s]').forEach(tr => tr.onclick = () => openSlot(tr.dataset.s));
    root.querySelectorAll('[data-addl]').forEach(bn => bn.onclick = () => addDesigns(col, bn.dataset.addl));
    root.querySelectorAll('[data-kc]').forEach(bn => bn.onclick = e => { e.stopPropagation(); const [pid, v] = bn.dataset.kc.split('|'); save(b.id, `/api/products/${encodeURIComponent(pid)}`, { decision: v || null }, 'PUT', v === 'cut' ? 'Cut. It stops reordering and sells down.' : v === 'keep' ? 'Kept' : 'Back to the rule').then(() => { STATE.delete(b.id); renderDrops(false); }).catch(() => {}); });
    root.querySelectorAll('[data-claim]').forEach(bn => bn.onclick = () => claim(bn.dataset.claim));
    if (root.querySelector('#spCatch')) root.querySelector('#spCatch').onclick = async () => {
      const todo = mine.filter(s => !s.asana_task); let made = 0;
      for (const s of todo) { try { await sapi(b.id, `/api/slots/${encodeURIComponent(s.id)}/asana`, { method: 'POST' }); made++; } catch (e) { toast(e.message, true); break; } }
      if (made) toast(`${plural(made, 'Asana task')} made`); STATE.delete(b.id); renderDrops(false);
    };
    const pd = PENDING.take('design'); if (pd) openSlot(pd);
  }
  function keepCut(st, l) {
    const rows = l.plan.map(x => ({ ...x, p: st.products.find(p => p.id === x.productId) })).filter(x => x.p);
    const heavy = l.weeksOfCover != null && l.weeksOfCover > 52;
    const open = heavy ? 0 : l.openSlots;
    const max = Math.max(1, ...rows.map(x => x.p.sold90));
    const curve = Object.entries(l.sizeCurve || {}).filter(([k]) => k);
    const per = l.moq || (st.factories.find(f => f.id === l.factoryId) || {}).moq_default || 100;
    const costs = rows.map(x => x.p.cost).filter(x => x != null).sort((a, b) => a - b), unit = costs.length ? costs[Math.floor(costs.length / 2)] : null;
    const designs = l.keep + l.decide + open;
    return `<div class="sp-card sp-kc"><div class="sp-ch"><h3>${esc(l.name)}: keep or cut</h3><span class="cap">target ${l.target ?? '–'} designs${l.cutRulePct ? ` · the bottom ${l.cutRulePct}% by 90-day sales is the cut zone` : ''}</span></div>
      ${heavy ? `<div class="sp-box warn" style="margin-bottom:10px"><b>Hold new ${esc(l.name.toLowerCase())}.</b> The group has ${l.weeksOfCover} weeks of stock at today's pace. New designs wait until it clears; push the slow ones in ads instead.</div>` : ''}
      <div class="sp-nums"><div><b style="color:var(--good)">${l.keep}</b><span>keep</span></div><div><b>${l.decide}</b><span>your call</span></div><div><b style="color:var(--warn)">${l.cut}</b><span>cut</span></div><div><b>${open}</b><span>new to make</span></div></div>
      ${rows.map(x => `<div class="rank ${x.state === 'cut' ? 'cut' : ''}"><span class="sp-mut">${x.rank}</span><span class="n" data-sp-p="${esc(x.p.id)}" title="${esc(x.p.title)}">${esc(x.p.title)}</span><span><span class="b" style="display:block;width:${Math.max(3, Math.round(x.p.sold90 / max * 90))}px"></span></span><span>${x.p.sold90}</span><span class="sp-seg"><button type="button" class="${x.state !== 'cut' ? 'on' : ''}" data-kc="${esc(x.p.id)}|keep">Keep</button><button type="button" class="${x.state === 'cut' ? 'on' : ''}" data-kc="${esc(x.p.id)}|cut">Cut</button>${x.decided ? `<button type="button" data-kc="${esc(x.p.id)}|"${tip("Back to the rule's verdict")}>↺</button>` : ''}</span></div>`).join('')}
      <p class="sp-hint" style="margin-top:10px">${heavy
        ? `Nothing in this group needs a reorder until the shelf comes down: ${int(l.onHand)} on hand.${l.cut ? ` The ${l.cut} cut sell down and are not reordered.` : ''}`
        : `${designs} designs at ${per} units each is <b>${int(designs * per)} ${esc(l.name.toLowerCase())}</b>${unit != null ? `, about ${money(designs * per * unit)} at cost,` : ''} on the next order.${l.cut ? ` The ${l.cut} cut stop reordering and sell down.` : ''}`}</p>
      ${curve.length > 1 ? `<div class="sp-curve">${curve.map(([k, v]) => `<div${tip(`${k}: ${Math.round(v * 100)}% of units sold in 90 days`)}><em>${Math.round(v * 100)}%</em><i class="${v >= 0.2 ? 'hi' : ''}" style="height:${Math.max(2, Math.round(v * 110))}px"></i><span>${esc(k)}</span></div>`).join('')}</div><p class="sp-hint" style="font-size:11.5px;margin-top:4px">Size mix: the split a new design's order gets.</p>` : ''}</div>`;
  }
  async function editDrop(c) {
    const { st, brand } = CUR;
    const def = () => { const y = +st.today.slice(0, 4); return +st.today.slice(5, 7) >= 7 ? `${y + 1}-03-01` : `${y}-09-01`; };
    const r = await form({ title: c ? `Edit ${c.name}` : 'New drop', hint: 'A name and the day it goes on the site. Every design in it works back from that day; move it and every date moves, Asana due dates included.',
      fields: [{ key: 'name', label: 'Name', value: c ? c.name : '', placeholder: 'Spring 2027' }, { key: 'drop_at', label: 'On the site', type: 'date', value: c ? c.drop_at : def() }, { key: 'notes', label: 'Notes', type: 'textarea', value: c ? c.notes || '' : '', wide: true }],
      confirm: c ? 'Save' : 'Create', extra: c ? '<p style="margin:10px 0 0"><button type="button" class="btn btn-s" id="spDelDrop" style="color:var(--bad)">Delete this drop</button></p>' : '' });
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
  function openSlot(id) {
    const { st, brand } = CUR; const sl = st.slots.find(x => x.id === id);
    if (!sl) return toast('That design is gone.', true);
    const d = sl.dates, L = sl.lateParts || {};
    const prods = st.products.filter(p => p.lineId === sl.line_id);
    const body = panel(sl.name, `
      <div class="sp-row">${pill(...(SLOT[sl.status] || ['n', sl.status]))}<span class="sp-mut">${esc(sl.lineName || '')} · ${esc(sl.collectionName || 'no drop')}</span></div>
      ${sl.next ? `<div class="sp-box ${sl.next.late ? 'bad' : 'info'}"><b>Next: ${esc(sl.next.what)}</b>, ${sl.next.late ? `was due ${day(sl.next.on, true)}` : `due ${day(sl.next.on, true)}, in ${sl.next.days} days`}.</div>` : ''}
      <div class="sp-fields"><div class="sp-field"><label for="spSn">Name</label><input id="spSn" value="${esc(sl.name)}"><div class="help">Rename it to the real product once it has one.</div></div>
        <div class="sp-field"><label for="spSs">Stage</label>${sl.asana_gid ? `<input id="spSs" value="${esc((SLOT[sl.status] || [, sl.status])[1])}" disabled data-v="${esc(sl.status)}"><div class="help">Asana owns this: drag the card there.</div>` : `<select id="spSs">${Object.entries(SLOT).map(([k, [, l]]) => `<option value="${k}" ${sl.status === k ? 'selected' : ''}>${l}</option>`).join('')}</select>`}</div>
        <div class="sp-field"><label for="spSc">Drop</label><select id="spSc">${[['', 'Not in a drop'], ...(st.collections || []).map(c => [c.id, `${c.name} · ${day(c.drop_at, true)}`])].map(([v, l]) => `<option value="${esc(v)}" ${String(sl.collection_id || '') === String(v) ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></div>
        ${sl.collection_id ? '' : `<div class="sp-field"><label for="spSo">On the site by</label><input id="spSo" type="date" value="${sl.on_site_at || ''}"></div>`}
        <div class="sp-field wide"><label for="spSnotes">Notes</label><textarea id="spSnotes">${esc(sl.notes || '')}</textarea></div></div>
      <div class="sp-card"><div class="sp-ch"><h3>What has to happen by when</h3><span class="cap">worked back from the drop; move the drop and they all move</span></div><div class="sp-tbl"><table>
        ${[['Brief', d.briefDue, L.brief, 'words for the designer'], ['Tech pack', d.techPackDue, L.techPack, 'specs for the factory'], ['Sample approved', d.sampleDue, L.sample, ''], ['Order placed', d.orderBy, L.order, ''], ['Stock lands', d.lands, false, ''], ['On the site', d.onSite, false, '']].map(([l, v, late, n]) => `<tr><td class="l">${l}${n ? `<span class="sub">${n}</span>` : ''}</td><td><b class="${late ? 'sp-late' : ''}">${day(v, true)}</b>${late ? ' <span class="sp-late">late</span>' : ''}</td></tr>`).join('')}</table></div></div>
      <div class="sp-card"><div class="sp-ch"><h3>The sample</h3><span class="cap">where the physical sample is</span></div><div class="sp-fields">
        <div class="sp-field"><label for="spS1">Asked for</label><input id="spS1" type="date" value="${sl.sample_requested_at || ''}"></div><div class="sp-field"><label for="spS2">Expected</label><input id="spS2" type="date" value="${sl.sample_expected_at || ''}"></div>
        <div class="sp-field"><label for="spS3">Tracking</label><input id="spS3" value="${esc(sl.sample_tracking || '')}" placeholder="Courier and number"></div><div class="sp-field"><label for="spS4">In hand</label><input id="spS4" type="date" value="${sl.sample_in_hand_at || ''}"></div></div></div>
      <div class="sp-card"><div class="sp-ch"><h3>Once it exists</h3></div><div class="sp-field"><label for="spSp">Shopify product</label><select id="spSp"><option value="">Not made yet</option>${prods.map(p => `<option value="${esc(p.id)}" ${String(sl.product_id || '') === String(p.id) ? 'selected' : ''}>${esc(p.title)}</option>`).join('')}</select><div class="help">${sl.made ? `On ${esc(sl.made.orderId)}: ${esc(sl.made.label.toLowerCase())}.` : 'Attach it and this design follows its factory order: in production, shipped, landed.'}</div></div></div>
      <div class="sp-card"><div class="sp-ch"><h3>Asana</h3></div><div id="spAs">${sl.asana_task ? `<div class="sp-row"><a class="btn btn-s" href="${esc(sl.asana_task)}" target="_blank" rel="noopener">Open in Asana</a><span class="sp-mut" id="spAsS">Checking Asana…</span></div>` : '<div class="sp-row"><button class="btn btn-s" id="spMkT">Make the Asana task</button><span class="sp-mut">It lands in the column for this stage, due on what that column owes.</span></div>'}</div></div>
      <div class="sp-row"><button class="btn primary" id="spSsave">Save</button><span class="grow"></span><button class="btn" id="spSdel" style="color:var(--bad)">Delete the design</button></div>`);
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
    if (!b) { el.innerHTML = `<div class="sp-layers">${layer(1, false, 'Every client · no setup', 'Stock', `What runs out, what is safe to scale, what sits, and which ads sit on top of each. ${esc(name)} has no stock feed yet.`, ['Needs one thing: the brand installs the <b>Mobius Digital Shopify app</b> (in Shopify review now).', 'Then it shows as Products › Stock, a chip on ad sets in Ads, and in the Strategist.', 'No factories, no lead times, no order dates.'], pill('n', 'Not connected'))}
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

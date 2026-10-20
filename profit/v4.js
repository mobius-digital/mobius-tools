/* LOCUS v4, phase 1 (2026-10-20, docs/locus-v4/index.html): Today > Morning for one brand.
 * The page answers "did yesterday make money, is the month on plan, what do I touch today" on its first screen:
 *   the money river   sales flowing through ads, product, shipping and fees to what was kept, with a mark for a normal day
 *   the month ring    banked against plan by now; the outer arc is where the month lands against the full-month goal
 *   the queue         three things that need you, one button each (ad sets to change, tests to call, the next date)
 * then the week as four tiles with their lines, where revenue came from as a share bar, and the site funnel as bars.
 * Reads the same routes as Home (the account snapshot, /api/hub/paid, /api/hub/store, /api/hub/kept, /api/hub/today) and
 * draws with v2.js's kit (window.V2.kit), so every number matches every other page. Agency view keeps the old Overview
 * until the brand board (phase 4). Tokens only, no em dashes. */
(() => {
  let H = null, K = null;
  const $ = (q, r = document) => r.querySelector(q);
  const sym = c => (!c || c === 'USD' ? '$' : c === 'GBP' ? '£' : c === 'EUR' ? '€' : c === 'CAD' ? 'CA$' : c === 'AUD' ? 'A$' : c + ' ');
  const dateWord = s => s ? new Date(s + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }) : '';
  const BITE = { ads: 'var(--c-google)', cogs: 'var(--c-amazon)', costs: 'var(--c-amazon)', shipping: 'var(--c-tiktok)', fees: 'var(--c-email)' };

  /* ---------- the river: a left-to-right waterfall of yesterday ---------- */
  function river(b) {
    const cur = b.currency, W = 600, H0 = 92;
    const bites = (b.bites || []).filter(x => x.v > 0);
    const total = Math.max(b.sales || 0, bites.reduce((s, x) => s + x.v, 0) + Math.max(0, b.kept || 0), 1);
    const sx = v => Math.max(0, v) / total * (W - 20);
    let x = 10, out = `<svg class="v4-river" viewBox="0 0 ${W} ${H0}" preserveAspectRatio="none" role="img" aria-label="Sales ${K.money(b.sales, cur)}, kept ${K.money(b.kept, cur)}">`;
    out += `<rect x="10" y="4" width="${sx(total).toFixed(1)}" height="30" rx="6" fill="var(--surface-2)"/>`;
    for (const bt of bites) { const w = sx(bt.v); out += `<rect x="${x.toFixed(1)}" y="4" width="${Math.max(w - 2, 2).toFixed(1)}" height="30" rx="4" fill="${BITE[bt.k] || BITE.cogs}" opacity=".85"><title>${K.esc(bt.label)}: ${K.money(bt.v, cur)}</title></rect>`; x += w; }
    if (b.kept > 0) out += `<rect x="${x.toFixed(1)}" y="4" width="${Math.max(sx(b.kept) - 2, 2).toFixed(1)}" height="30" rx="4" fill="var(--brand)"><title>Kept: ${K.money(b.kept, cur)}</title></rect>`;
    if (b.normal != null && b.normal > 0) { const nx = Math.min(W - 12, x + sx(b.normal)); out += `<line x1="${nx.toFixed(1)}" y1="0" x2="${nx.toFixed(1)}" y2="40" stroke="var(--ink)" stroke-width="1.5" stroke-dasharray="3 3"/>`; }
    out += '</svg>';
    const lab = (c, l, v) => `<span><i style="background:${c}"></i>${K.esc(l)} <b>${K.money(v, cur)}</b></span>`;
    const labs = [...(b.kept > 0 ? [lab('var(--brand)', 'Kept', b.kept)] : []), ...bites.map(bt => lab(BITE[bt.k] || BITE.cogs, bt.label, bt.v)), ...(b.normal != null ? [`<span class="v4-norm">a normal day keeps about <b>${K.money(b.normal, cur)}</b></span>`] : [])];
    return out + `<div class="v4-river-l">${labs.join('')}</div>`;
  }
  function riverCard(b) {
    if (!b || !b.has) return `<div class="v2h"><h3>Yesterday</h3></div><p class="v2hint">Triple Whale has not synced yesterday for this brand yet.</p>`;
    const cur = b.currency;
    const n = b.kept == null ? `You sold <b>${K.money(b.sales, cur)}</b>` : b.kept < 0 ? `You <em class="lx-accent">actually</em> lost <b class="lost">${K.money(Math.abs(b.kept), cur)}</b>` : `You <em class="lx-accent">actually</em> kept <b>${K.money(b.kept, cur)}</b>`;
    return `<div class="v2h"><h3>Yesterday, ${K.esc(dateWord(b.date))}</h3><span class="cap">the P&amp;L line</span></div>
      <h2 class="v4-hero${b.kept != null && b.kept < 0 ? ' is-lost' : ''}">${n}</h2>
      ${b.broken ? `<p class="v2hint">What was kept needs trustworthy cost data. <button type="button" class="v2link" data-go="costs">Open the cost check ›</button></p>` : river(b)}
      ${b.line ? `<p class="v4-line"><span class="lx-face" data-state="${(b.to_change || 0) + (b.to_fix || 0) > 0 ? 'found' : 'clear'}" aria-hidden="true"></span>${K.esc(b.line)}</p>` : ''}`;
  }

  /* ---------- the month ring ---------- */
  function ring(pct, label, sub, outer) {
    const r = 52, c = 2 * Math.PI * r, r2 = 60, c2 = 2 * Math.PI * r2, p = Math.max(0, Math.min(pct || 0, 1));
    const tone = pct == null ? 'var(--line-strong)' : pct >= 0.98 ? 'var(--good)' : pct >= 0.85 ? 'var(--warn)' : 'var(--bad)';
    return `<div class="v4-ring"><svg viewBox="0 0 132 132" aria-hidden="true"><circle cx="66" cy="66" r="${r}" fill="none" stroke="var(--surface-2)" stroke-width="10"/><circle cx="66" cy="66" r="${r}" fill="none" stroke="${tone}" stroke-width="10" stroke-linecap="round" stroke-dasharray="${(c * p).toFixed(1)} ${c.toFixed(1)}"/>${outer != null ? `<circle cx="66" cy="66" r="${r2}" fill="none" stroke="var(--line-strong)" stroke-width="2" stroke-linecap="round" stroke-dasharray="${(c2 * Math.max(0, Math.min(outer, 1))).toFixed(1)} ${c2.toFixed(1)}"/>` : ''}</svg><div class="c"><b>${label}</b><small>${sub}</small></div></div>`;
  }
  function monthCard(a, cur) {
    const now = new Date(), dim = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate(), elapsed = Math.max(1, now.getDate() - 1);
    const mtd = a.mtd?.sales, planNow = a.plan?.sales, goal = a.goals?.sales || null;
    const month = now.toLocaleDateString('en-US', { month: 'long' });
    if (mtd == null || !planNow) return `<div class="v2h"><h3>${month}</h3></div>${ring(null, '–', 'no plan')}<p class="v2hint v4-ring-cap">No monthly plan yet. <button type="button" class="v2link" data-go="plan">Set the goals ›</button></p>`;
    const pct = mtd / planNow, landing = mtd / elapsed * dim, outer = goal ? landing / goal : null;
    return `<div class="v2h"><h3>${month}</h3><span class="cap">${elapsed} of ${dim} days</span></div>
      ${ring(pct, `${Math.round(pct * 100)}%`, 'of plan by now', outer)}
      <p class="v4-ring-cap">${K.kmoney(mtd, cur)} banked of ${K.kmoney(planNow, cur)}${goal ? ` · lands at <b>${K.kmoney(landing, cur)}</b> of ${K.kmoney(goal, cur)}` : ` · pace to <b>${K.kmoney(landing, cur)}</b>`}</p>
      <button type="button" class="v2link v4-ring-go" data-go="profit">P&amp;L ›</button>`;
  }

  /* ---------- the queue: three things, one button each ---------- */
  function queueCard(td, ov, sd) {
    const rows = (td && td.rows) || [], kinds = ['cut', 'scale', 'trim', 'refresh', 'fix'];
    const change = rows.filter(r => kinds.includes(r.kind)).sort((a, b) => (b.stake || 0) - (a.stake || 0));
    const calls = rows.filter(r => r.kind === 'call');
    const items = [];
    if (change.length) { const f = change[0]; items.push({ chip: f.kind, title: `${change.length} ad set${change.length === 1 ? '' : 's'} to change`, sub: f.adset ? `${K.esc(f.adset)} first${f.spend != null ? `, ${K.money(f.spend)} at ${f.cpa ? K.money(f.cpa) + ' a sale' : 'no sale'}` : ''}` : K.esc(f.why || ''), go: 'today', btn: 'Open calls', primary: true }); }
    if (calls.length) { const c = calls[0]; items.push({ chip: 'call', title: `${calls.length} test${calls.length === 1 ? '' : 's'} to call`, sub: K.esc((c.test && c.test.name) || c.adset || c.why || ''), go: 'today', btn: 'Call it' }); }
    const next = sd && Array.isArray(sd.phases) ? sd.phases.filter(p => p.start && p.start >= new Date().toISOString().slice(0, 10)).sort((a, b) => a.start < b.start ? -1 : 1)[0] : null;
    if (next) items.push({ chip: 'date', chipText: dateWord(next.start).replace(/^\w+, /, ''), title: K.esc(next.name || next.label || 'Next date'), sub: 'on the calendar', go: 'calendar', btn: 'Calendar' });
    const body = items.length ? items.slice(0, 3).map(it => `<div class="v4-q"><span class="v4-chip ${it.chip}">${it.chipText || it.chip}</span><div class="t"><b>${it.title}</b><small>${it.sub}</small></div><button type="button" class="v2btn${it.primary ? '' : ' ghost'}" data-go="${it.go}">${it.btn}</button></div>`).join('')
      : '<p class="v2hint">Nothing waiting. <button type="button" class="v2link" data-go="today">Open the calls ›</button></p>';
    return `<div class="v2h"><h3>Needs you</h3><span class="cap">${items.length ? `${Math.min(3, items.length)} thing${items.length === 1 ? '' : 's'}` : ''}</span></div><div class="v4-queue">${body}</div>`;
  }

  /* ---------- the page ---------- */
  async function render(host, first) {
    H = host; K = window.V2 && window.V2.kit; if (!K) { $('#main').innerHTML = '<div class="card"><span style="color:var(--bad)">The v2 kit did not load. Hard-refresh (Ctrl+Shift+R).</span></div>'; return; }
    window.V2.setHost(host);
    const t = H.RUN(); const all = K.scopeAccts(); const a = all[0]; if (!a) return;
    const cur = a.currency; const title = `Morning: ${K.esc(a.name)}`;
    const shell = body => `<div class="v2 lx v4">${K.head('morning', title)}${body}</div>`;
    if (first) $('#main').innerHTML = shell(`<div id="v4strip"></div><div class="v4-top"><section class="v2card v4-r v2sk"><i class="h"></i></section><section class="v2card v4-m v2sk"><i class="h"></i></section><section class="v2card v4-n v2sk"><i class="h"></i></section></div>${K.skPage({ tiles: 4, chart: false, rows: 3 })}`);
    const q = encodeURIComponent(H.S.act);
    const [ch, st, kept, td, ov, sd] = await Promise.all([
      K.get(`/api/hub/paid?platform=all&act=${q}&${H.rangeQ()}${K.modelQ()}`).catch(() => null),
      K.get(`/api/hub/store?act=${q}&${H.rangeQ()}`).catch(() => null),
      window.LxHero ? window.LxHero.load(H, H.S.act).catch(() => null) : Promise.resolve(null),
      K.get(`/api/hub/today?act=${q}`).catch(() => null),
      window.ovTodayLoad ? window.ovTodayLoad(all).catch(() => null) : Promise.resolve(null),
      H.api(`/api/season?act=${q}`).catch(() => null),
    ]);
    if (t !== H.RUN()) return;
    const w = a.window || {}, p = a.prev && H.S.cmp !== 'none' ? a.prev : {};
    const c = { sales: w.sales, spend: w.spend, orders: w.orders, newRev: w.new_rev, newOrd: w.new_orders, cm: a.cost_health?.verdict === 'broken' ? null : w.cm };
    c.mer = c.spend ? c.sales / c.spend : null; c.amer = c.spend && c.newRev != null ? c.newRev / c.spend : null; c.aov = c.orders ? c.sales / c.orders : null; c.cac = c.newOrd ? c.spend / c.newOrd : null;
    const pp = { sales: p.sales, spend: p.spend, orders: p.orders, mer: p.spend ? p.sales / p.spend : null, aov: p.orders ? p.sales / p.orders : null };
    const rows = (a.series || []).map(r => ({ ...r, mer: r.spend ? r.sales / r.spend : null })), prev = H.S.cmp !== 'none' ? (a.prev_series || []).map(r => ({ ...r, mer: r.spend ? r.sales / r.spend : null })) : [];
    const goalMer = a.goals?.sales && a.goals?.spend ? a.goals.sales / a.goals.spend : a.target_roas || null;
    const km = v => K.kmoney(v, cur);
    const b = kept && (kept.brands || []).find(x => x.act_id === H.S.act);

    const tiles = `<div class="v2tiles v4-four">
      ${K.tile({ label: 'Revenue', hint: 'total sales minus tax', value: K.kmoney(c.sales, cur), delta: K.delta(c.sales, pp.sales), sub: pp.sales ? `${K.kmoney(pp.sales, cur)} ${K.cmpLabel()}` : 'Shopify through Triple Whale', spark: K.tspark(rows, prev, 'sales', km, 'revenue'), go: 'store' })}
      ${K.tile({ label: 'Orders', value: K.int(c.orders), delta: K.delta(c.orders, pp.orders), sub: `AOV ${K.money2(c.aov, cur)} ${K.delta(c.aov, pp.aov)}`, spark: K.tspark(rows, prev, 'orders', K.int, 'orders'), go: 'store' })}
      ${K.tile({ label: 'Ad spend', value: K.kmoney(c.spend, cur), delta: K.delta(c.spend, pp.spend, 'n'), sub: pp.spend ? `${K.kmoney(pp.spend, cur)} ${K.cmpLabel()}` : 'every platform', spark: K.tspark(rows, prev, 'spend', km, 'ad spend'), go: 'channels' })}
      ${K.tile({ label: 'MER', value: K.x2(c.mer), delta: K.delta(c.mer, pp.mer), bullet: K.bullet(c.mer, goalMer, false, goalMer ? `goal ${K.x2(goalMer)}` : ''), sub: `${K.kmoney(c.sales, cur)} on ${K.kmoney(c.spend, cur)}${c.amer ? ` · aMER ${K.x2(c.amer)}` : ''}`, spark: K.tspark(rows, prev, 'mer', K.x2, 'MER'), go: 'channels' })}
    </div>`;

    /* where revenue came from: one share bar, each channel with its ROAS and first orders */
    const chRows = (() => { if (!ch || !ch.brands) return []; const by = {}; for (const bb of ch.brands) for (const r of bb.rows) { const o = by[r.id] ||= { id: r.id, label: r.label, spend: 0, revenue: 0, prev_revenue: 0, nc: 0, hasPrev: false }; o.spend += r.spend || 0; o.revenue += r.revenue || 0; if (r.prev_revenue != null) { o.prev_revenue += r.prev_revenue; o.hasPrev = true; } o.nc += r.nc || 0; } return Object.values(by).filter(r => r.revenue > 0); })();
    const credited = chRows.reduce((s, r) => s + r.revenue, 0) || 1;
    const share = chRows.length ? K.card('Where revenue came from', K.isPlat() ? 'On the platforms’ own numbers.' : `Credited under ${K.esc(K.MODEL_SHORT[H.S.model])}.`,
      `<div class="v2stackbar">${chRows.map(r => `<i style="flex:${r.revenue};background:var(${K.CH[r.id] || '--c-else'})"${K.tipAttr(`<b>${K.esc(r.label)}</b> · ${K.kmoney(r.revenue, cur)} · ${K.pct(r.revenue / credited, 0)}${r.spend ? ` · ROAS ${K.x2(r.revenue / r.spend)}` : ''}`)}></i>`).join('')}</div>
       <div class="v4-share">${chRows.map(r => `<button type="button" class="v4-sh"${['meta', 'google', 'tiktok', 'email'].includes(r.id) ? ` data-go="${r.id}"` : ''}><i style="background:var(${K.CH[r.id] || '--c-else'})"></i><span class="l">${K.esc(r.label)}</span><b>${K.kmoney(r.revenue, cur)}</b><small>${r.spend ? `${K.x2(r.revenue / r.spend)} · ${K.int(r.nc)} first` : `${K.int(r.nc)} first`}${r.hasPrev ? ` ${K.delta(r.revenue, r.prev_revenue)}` : ''}</small></button>`).join('')}</div>`) : '';

    const S0 = st && st.brands ? st.brands : [];
    const fun = S0.reduce((s, bb) => { const x = bb.cur || {}, y = bb.prev || {}; s.ses += x.sessions || 0; s.cart += x.carts || 0; s.ord += x.orders || 0; s.pses += y.sessions || 0; s.pcart += y.carts || 0; s.pord += y.orders || 0; return s; }, { ses: 0, cart: 0, ord: 0, pses: 0, pcart: 0, pord: 0 });
    const funnel = fun.ses && window.LxKit ? K.card('Site funnel', `${K.pct(fun.ord / fun.ses, 2)} of sessions became an order${fun.pses ? `, against ${K.pct(fun.pord / fun.pses, 2)} before` : ''}.`,
      window.LxKit.bars([
        { label: 'Sessions', v: fun.ses, ghost: fun.pses, value: K.int(fun.ses), note: fun.pses ? K.delta(fun.ses, fun.pses).replace(/<[^>]+>/g, '') : '' },
        { label: 'Added to cart', v: fun.cart, ghost: fun.pcart, value: K.int(fun.cart), note: `${K.pct(fun.cart / fun.ses)} of sessions` },
        { label: 'Orders', v: fun.ord, ghost: fun.pord, value: K.int(fun.ord), note: `${K.pct(fun.ord / Math.max(1, fun.cart))} of carts` },
      ], { max: Math.max(fun.ses, fun.pses) }), 'Triple Whale pixel') : '';

    $('#main').innerHTML = shell(`<div id="v4strip"></div>
      <div class="v4-top"><section class="v2card v4-r">${riverCard(b)}</section><section class="v2card v4-m">${monthCard(a, cur)}</section><section class="v2card v4-n">${queueCard(td, ov, sd)}</section></div>
      ${tiles}<div class="v2two v4-two">${share}${funnel}</div><div id="v4cal"></div>
      ${K.foot(`Revenue, orders, AOV and the compare deltas come from Shopify through Triple Whale for ${K.esc(H.rangeLabel())}. Channel revenue follows the attribution switch. Yesterday is the P&amp;L line: sales less ads, product, shipping and fees.`)}`);
    const root = $('#main'); K.wireGo(root);
    if (window.LeaksCard && (window.LeaksCard.strip || window.LeaksCard.full)) (window.LeaksCard.strip || window.LeaksCard.full)($('#v4strip'), H, 'home');
    if (window.CalendarTab) window.CalendarTab.homeCard($('#v4cal'), H);
  }
  /* ---------- Ads > Calls, phase 2: Google negatives in the queue and the ad set panel ---------- */
  /* One call per Google search-term leak: the leak finder already lists the wasted searches and can write the negatives.
     desk.js today() pushes these rows into its ranked list (kind 'neg'); the primary button runs the same Add all modal. */
  async function extraCalls(H, one) {
    const L = window.LeaksCard; if (!L || !L.load) return [];
    L.setHost(H);
    const accts = (one ? [one] : (H.S.accounts || []).filter(a => !a.internal)).slice(0, 12);
    const M = window.V2 && window.V2.kit;
    const out = [];
    await Promise.all(accts.map(async a => {
      let d; try { d = await L.load(a.act_id); } catch { return; }
      for (const l of (d && d.leaks) || []) {
        if (!(l.apply && l.apply.kind === 'negative') || !(l.items || []).length) continue;
        const n = l.items.length, spend = l.items.reduce((s, x) => s + (x.spend || 0), 0), cur = d.currency || a.currency || 'USD';
        out.push({ kind: 'neg', act_id: a.act_id, brand: a.name, currency: cur, key: `neg:${a.act_id}:${l.id || l.title}`, stake: l.cost_month || spend, leak: l, leakData: d, acct: a,
          adset: l.title || 'Wasted searches on Google', spend, orders: 0, n_ads: null,
          why: `${n} search${n === 1 ? '' : 'es'} spent ${M ? M.money(spend, cur) : spend} with no sale${l.cost_month ? `, about ${M ? M.money(l.cost_month, cur) : l.cost_month} a month` : ''}. ${l.fix || 'Each becomes an exact negative keyword on its own campaign.'}` });
      }
    }));
    return out;
  }
  function negatives(H, r, after) { const L = window.LeaksCard; if (!L || !L.addAll) return; L.setHost(H); L.addAll(r.acct, r.leakData, r.leak, after); }

  /* The ad set panel: the reason as a sentence, the numbers against the goal, the ads in the set (anchor first), the one
     button. Opened from a row's name on Ads > Calls; a bottom sheet on a phone (V2.panel). */
  async function setPanel(H, r, opts = {}) {
    const V = window.V2; if (!V || !V.panel) return;
    V.setHost(H); K = V.kit;
    const cur = r.currency || 'USD', $ = v => K.money(v, cur);
    const DO = { scale: 'Raise the budget 20%', cut: 'Pause the ad set', trim: 'Turn off the ad' };
    const nums = [['Spent', r.spend != null ? $(r.spend) : '–'], [r.metric === 'roas' ? 'Sales' : 'Sales', K.int(r.orders)], ['Per sale', r.cpa ? $(r.cpa) : (r.spend ? 'no sale' : '–')], ['Goal', r.goal ? $(r.goal) : '–'], ['ROAS', r.roas ? K.x2(r.roas) : '–'], ['Days judged', r.days != null ? String(r.days) : '–']];
    const tone = r.goal && r.cpa ? (r.cpa <= r.goal ? 'good' : r.cpa > r.goal * 1.5 ? 'bad' : 'warn') : '';
    V.panel(r.adset || r.ad || 'Ad set', `<div class="v4-pan">
      <div class="v4-pan-top"><span class="v4-chip ${K.esc(r.kind)}">${K.esc(r.kind)}</span><span class="v4-pan-brand">${K.esc(r.brand || '')}${r.campaign ? ` · ${K.esc(r.campaign)}` : ''}</span></div>
      <p class="v4-why">${K.esc(r.why || '')}${r.anchor && r.n_ads > 1 ? ` <span class="faint">The anchor is "${K.esc(r.anchor.name || '')}", ${Math.round((r.anchor.share || 0) * 100)}% of the set's spend.</span>` : ''}</p>
      <div class="v4-nums">${nums.map(([l, v], i) => `<div${i === 2 && tone ? ` class="${tone}"` : ''}><small>${l}</small><b>${v}</b></div>`).join('')}</div>
      <div class="v4-pacts">${opts.doIt && DO[r.kind] ? `<button type="button" class="v2btn" id="v4pDo">${DO[r.kind]}</button>` : ''}${opts.locus ? `<button type="button" class="v2btn ghost" id="v4pLocus">Open in Locus</button>` : ''}${opts.am ? `<a class="v2btn ghost" href="${K.esc(opts.am)}" target="_blank" rel="noopener">Ads Manager</a>` : ''}</div>
      <h4 class="v4-pan-h">The ads in this set</h4><div id="v4pads"><p class="v2hint">Loading…</p></div></div>`);
    const p = document.getElementById('v2panel'); if (!p) return;
    const b1 = p.querySelector('#v4pDo'); if (b1) b1.onclick = () => { V.closePanel(); opts.doIt(); };
    const b2 = p.querySelector('#v4pLocus'); if (b2) b2.onclick = () => { V.closePanel(); opts.locus(); };
    const host = p.querySelector('#v4pads');
    if (!r.adset_id) { host.innerHTML = ''; return; }
    let d; try { d = await K.get(`/api/hub/creative?act=${encodeURIComponent(r.act_id)}&${H.rangeQ()}${K.modelQ()}`); } catch { host.innerHTML = '<p class="v2hint">Could not load the ads.</p>'; return; }
    if (!document.body.contains(host)) return;
    const ads = (d.ads || []).filter(x => String(x.adset_id) === String(r.adset_id)).sort((a, b) => (b.spend || 0) - (a.spend || 0));
    if (!ads.length) { host.innerHTML = `<p class="v2hint">No ad in this set spent in ${K.esc(H.rangeLabel())}.</p>`; return; }
    host.innerHTML = `<div class="v4-adstrip">${ads.map((a, i) => `<button type="button" class="v4-ad${r.ad_id && String(a.id) === String(r.ad_id) ? ' is-call' : ''}" data-pid="${K.esc(a.id)}" data-pname="${K.esc(a.name || '')}"><span class="v4-ad-t" data-thumb="${K.esc(a.id)}">${a.media_type === 'video' ? '<i>&#9654;</i>' : ''}</span><b>${K.esc(a.name || a.id)}</b><small>${$(a.spend)} · ${a.cpa ? `${$(a.cpa)} per sale` : (a.purchases ? `${K.int(a.purchases)} sales` : 'no sale')}${i === 0 && ads.length > 1 ? ' · anchor' : ''}</small></button>`).join('')}</div>`;
    if (V.thumbs) V.thumbs(host, ads.map(a => a.id), r.act_id, H);
    host.querySelectorAll('[data-pid]').forEach(b => b.onclick = () => { if (V.playAd) V.playAd({ id: b.dataset.pid, name: b.dataset.pname, act: r.act_id, note: `In "${r.adset || ''}", ${r.brand || ''}.` }, H); });
  }
  window.V4 = { render, extraCalls, negatives, setPanel, get on() { return document.documentElement.classList.contains('lx-v4'); } };
})();

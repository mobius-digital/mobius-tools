/* LOCUS v4 (2026-10-20, docs/locus-v4/index.html): phase 1 Today > Morning, phase 2 Ads > Calls additions, phase 3 Money > Month.
 * Phase 1: Today > Morning for one brand.
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

  /* ---------- the month ring (size scales the number: Cole, the number must fit inside the circle) ---------- */
  function ring(pct, label, sub, outer, size = 132) {
    const r = 52, c = 2 * Math.PI * r, r2 = 60, c2 = 2 * Math.PI * r2, p = Math.max(0, Math.min(pct || 0, 1));
    const tone = pct == null ? 'var(--line-strong)' : pct >= 0.98 ? 'var(--good)' : pct >= 0.85 ? 'var(--warn)' : 'var(--bad)';
    return `<div class="v4-ring" style="--rs:${size}px"><svg viewBox="0 0 132 132" aria-hidden="true"><circle cx="66" cy="66" r="${r}" fill="none" stroke="var(--surface-2)" stroke-width="10"/><circle cx="66" cy="66" r="${r}" fill="none" stroke="${tone}" stroke-width="10" stroke-linecap="round" stroke-dasharray="${(c * p).toFixed(1)} ${c.toFixed(1)}"/>${outer != null ? `<circle cx="66" cy="66" r="${r2}" fill="none" stroke="var(--line-strong)" stroke-width="2" stroke-linecap="round" stroke-dasharray="${(c2 * Math.max(0, Math.min(outer, 1))).toFixed(1)} ${c2.toFixed(1)}"/>` : ''}</svg><div class="c"><b>${label}</b><small>${sub}</small></div></div>`;
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
  async function render(host, first, page = 'morning') {
    if (page === 'month') return month(host, first);
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

  /* ---------- Money > Month, phase 3 (2026-10-20): the month on one page ----------
     Where the month lands (the ring: the forecast against the goal, two paths), the weeks against target, whether a customer is
     worth what we pay, where the money went (the waterfall), who paid and through what. Reads /api/client (the P&L line, month
     to date), /api/forecast (CTC's two layers: returning plus new at the trailing aMER), /api/customers (90 days) and
     /api/hub/paid (first orders by channel). Goals (the plan page) is this page's edit mode: Edit the plan opens it. */
  function dial(v, max) {
    const cx = 90, cy = 86, r = 70, a = Math.PI * Math.max(0, Math.min(v || 0, max)) / max;
    const x = cx + r * Math.cos(Math.PI - a), y = cy - r * Math.sin(a);
    const tick = t => { const b = Math.PI * t / max; return `<line x1="${(cx + r * Math.cos(Math.PI - b)).toFixed(1)}" y1="${(cy - r * Math.sin(b)).toFixed(1)}" x2="${(cx + (r + 9) * Math.cos(Math.PI - b)).toFixed(1)}" y2="${(cy - (r + 9) * Math.sin(b)).toFixed(1)}" stroke="var(--ink)" stroke-width="1.5"/>`; };
    const tone = v == null ? 'var(--line-strong)' : v >= 3 ? 'var(--good)' : v >= 1.5 ? 'var(--warn)' : 'var(--bad)';
    return `<svg class="v4-dial" viewBox="0 0 180 104" aria-hidden="true"><path d="M20 86 A70 70 0 0 1 160 86" fill="none" stroke="var(--surface-2)" stroke-width="12" stroke-linecap="round"/>${v ? `<path d="M20 86 A70 70 0 0 1 ${x.toFixed(1)} ${y.toFixed(1)}" fill="none" stroke="${tone}" stroke-width="12" stroke-linecap="round"/>` : ''}${tick(1.5)}${tick(3)}<text x="90" y="80" text-anchor="middle" font-size="26" font-weight="650" fill="var(--ink)">${v != null ? K.x2(v) : '–'}</text><text x="90" y="98" text-anchor="middle" font-size="10.5" fill="var(--ink-2)">back per $1 spent, 90 days</text></svg>`;
  }
  function waterfall(t, cur, marginPct) {
    const steps = marginPct != null
      ? [['Revenue', t.sales, 'tot'], [`Costs at ${Math.round(marginPct * 100)}%`, -(t.sales - (t.gross_profit || 0))], ['Gross profit', t.gross_profit, 'sub'], ['Ad spend', -(t.spend || 0)], ['Kept', t.cm, 'tot']]
      : [['Revenue', t.sales, 'tot'], ['Product', -(t.cogs || 0)], ['Shipping', -(t.ship_cost || 0)], ['Handling', -(t.handling || 0)], ['Fees', -(t.fees || 0)], ['Gross profit', t.gross_profit, 'sub'], ['Ad spend', -(t.spend || 0)], ['Kept', t.cm, 'tot']].filter(st => st[2] || st[1] !== 0);
    const W = 600, Hh = 170, max = Math.max(t.sales || 1, 1), n = steps.length, gap = 12, bw = Math.floor((W - 20 - gap * (n - 1)) / n);
    const y = v => Hh - 24 - Math.max(0, v) / max * (Hh - 48);
    let run = 0, out = `<svg class="v4-fall" viewBox="0 0 ${W} ${Hh}" aria-hidden="true">`;
    steps.forEach((st, i) => {
      const x = 10 + i * (bw + gap); let top, bot, fill, v = st[1] || 0;
      if (st[2]) { top = y(v); bot = y(0); fill = st[2] === 'tot' ? (v < 0 ? 'var(--bad)' : 'var(--brand)') : 'var(--line-strong)'; run = v; }
      else { const from = run; run = from + v; top = y(Math.max(from, run)); bot = y(Math.min(from, run)); fill = 'var(--bad)'; }
      out += `<rect x="${x}" y="${top.toFixed(1)}" width="${bw}" height="${Math.max(bot - top, 2).toFixed(1)}" rx="4" fill="${fill}" opacity="${st[2] ? 1 : .72}"><title>${K.esc(st[0])}: ${K.money(Math.abs(v), cur)}</title></rect>`;
      out += `<text x="${x + bw / 2}" y="${(top - 6).toFixed(1)}" font-size="11.5" font-weight="600" text-anchor="middle" fill="var(--ink)">${v < 0 ? '−' : ''}${K.kmoney(Math.abs(v), cur)}</text>`;
      out += `<text x="${x + bw / 2}" y="${Hh - 8}" font-size="11" text-anchor="middle" fill="var(--ink-2)">${K.esc(st[0])}</text>`;
    });
    return out + '</svg>';
  }
  async function month(host, first) {
    H = host; K = window.V2 && window.V2.kit; if (!K) { $('#main').innerHTML = '<div class="card"><span style="color:var(--bad)">The v2 kit did not load. Hard-refresh (Ctrl+Shift+R).</span></div>'; return; }
    window.V2.setHost(host);
    const t0 = H.RUN(); const a = K.scopeAccts()[0]; if (!a) return;
    const cur = a.currency, now = new Date(), monthName = now.toLocaleDateString('en-US', { month: 'long' });
    const ym = now.toISOString().slice(0, 7), mStart = `${ym}-01`, today = now.toISOString().slice(0, 10);
    const title = `${monthName}: ${K.esc(a.name)}`;
    const shell = body => `<div class="v2 lx v4">${K.head('month', title)}${body}</div>`;
    const acts = `<button type="button" class="v2btn" data-go="plan">Edit the plan</button><button type="button" class="v2btn ghost" data-go="customers">Customers</button>`;
    if (first) { $('#main').innerHTML = shell(`<div class="v4-top v4-mo"><section class="v2card v2sk"><i class="h"></i></section><section class="v2card v2sk"><i class="h"></i></section><section class="v2card v2sk"><i class="h"></i></section></div>${K.skPage({ tiles: 0, chart: true, rows: 2 })}`); H.pageActions && H.pageActions(acts); }
    const q = encodeURIComponent(H.S.act);
    const [d, fc, cu, ch] = await Promise.all([
      H.api(`/api/client?act=${q}&from=${mStart}&to=${today}`).catch(() => null),
      H.api(`/api/forecast?act=${q}`).catch(() => null),
      H.api(`/api/customers?act=${q}&days=90&journey=0`).catch(() => null),
      K.get(`/api/hub/paid?platform=all&act=${q}&from=${mStart}&to=${today}${K.modelQ()}`).catch(() => null),
    ]);
    if (t0 !== H.RUN()) return;
    if (!d) { $('#main').innerHTML = shell('<div class="v2card"><p class="v2hint">The month could not be loaded. Try again in a moment.</p></div>'); return; }
    const mtd = d.mtd || {}, goal = (d.goals && d.goals.sales) || null, dim = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate(), elapsed = Math.max(1, Math.min(dim, mtd.days || now.getDate()));
    const broken = a.cost_health && a.cost_health.verdict === 'broken';
    const km = v => K.kmoney(v, cur), mo = v => K.money(v, cur);

    /* 1. where the month lands: the ring is the forecast at the PLANNED spend over the goal; the outer arc is today's pace */
    let land;
    if (!goal) land = `<div class="v2h"><h3>Where the month lands</h3><span class="cap">${elapsed} of ${dim} days</span></div>${ring(null, km(mtd.sales), 'banked so far', null, 150)}<p class="v4-ring-cap">No plan for ${monthName} yet, so nothing to land against.</p><button type="button" class="v2btn v4-ring-go" data-go="plan">Set the goals</button>`;
    else {
      const proj = fc && fc.projected != null ? fc.projected : mtd.sales / elapsed * dim, pace = fc && fc.at_current_pace ? fc.at_current_pace.sales : mtd.sales / elapsed * dim;
      const th = fc && fc.to_hit, gapP = proj - goal, gapC = pace - goal;
      const line = (v, g) => `<b>${km(v)}</b>, ${g >= 0 ? `${km(g)} over` : `${km(-g)} short`}`;
      land = `<div class="v2h"><h3>Where the month lands</h3><span class="cap">${elapsed} of ${dim} days</span></div>
        ${ring(proj / goal, km(proj), `of ${km(goal)} goal`, pace / goal, 150)}
        <p class="v4-ring-cap v4-paths"><span>Spending the budget: ${line(proj, gapP)}.</span><span>At today's pace: ${line(pace, gapC)}.</span>${th && !th.already_there && th.revenue_per_day > 0 ? `<span>To hit it: <b>${mo(th.revenue_per_day)} a day</b>${th.spend_per_day ? `, ${mo(th.spend_per_day)} of it ad spend` : ''}.</span>` : th && th.already_there ? '<span>Already there: the goal is banked.</span>' : ''}</p>
        <button type="button" class="v2link v4-ring-go" data-go="plan">Edit the plan ›</button>`;
    }

    /* 2. the weeks against target (CTC: returning base plus new customers at the trailing aMER) */
    const weeks = fc && Array.isArray(fc.weeks) ? fc.weeks.filter(w => w.days_done > 0) : [];
    const wk = weeks.length && window.LxKit ? window.LxKit.bars(weeks.map(w => {
      const tgt = w.target_to_date, dlt = tgt ? w.sales / tgt - 1 : null;
      return { label: `${K.day(w.from)} to ${K.day(w.to).replace(/^\w+ /, '')}`, sub: w.complete ? '' : `${w.days_done} of ${w.days} days so far`, v: w.sales, ghost: tgt, value: km(w.sales), tone: dlt == null ? '' : dlt >= 0 ? 'good' : dlt > -0.08 ? 'warn' : 'bad', note: dlt == null ? '' : `${dlt >= 0 ? '+' : ''}${Math.round(dlt * 100)}%` };
    }), { max: Math.max(...weeks.map(w => Math.max(w.sales || 0, w.target_to_date || 0))) }) : '<p class="v2hint">Not enough Triple Whale history for the week view yet.</p>';
    const ret = mtd.ret_rev, nw = mtd.new_rev;
    const wkCard = `<div class="v2h"><h3>Weeks against target</h3><span class="cap">${fc && fc.basis && fc.basis.amer ? `new customers at ${K.x2(fc.basis.amer)} aMER` : 'grey is the target'}</span></div>${wk}
      <div class="v4-facts"><span>Banked <b>${km(mtd.sales)}</b></span>${ret != null ? `<span>Returning <b>${km(ret)}</b></span>` : ''}${nw != null ? `<span>New <b>${km(nw)}</b></span>` : ''}<span>Spent <b>${km(mtd.spend)}</b></span>${mtd.mer ? `<span>MER <b>${K.x2(mtd.mer)}</b></span>` : ''}</div>`;

    /* 3. is a customer worth what we pay (90 days, from /api/customers) */
    const h = cu && cu.headline;
    const cuCard = h ? `<div class="v2h"><h3>Is a customer worth what we pay?</h3><span class="cap">${h.thin ? `only ${K.int(h.new_orders)} new customers, read it loosely` : `${K.int(h.new_orders)} new customers in 90 days`}</span></div>
      <div class="v4-dialrow">${dial(h.payback, 4.5)}<div class="v4-dial-t">${h.cac != null ? `Costs <b>${mo(h.cac)}</b> to get.<br>` : ''}${h.new_aov != null ? `First order <b>${mo(h.new_aov)}</b>${h.first_order_gp != null ? `, leaves <b>${mo(h.first_order_gp)}</b> after costs` : ''}.<br>` : ''}${h.repeat_share != null ? `<b>${K.pct(h.repeat_share, 0)}</b> of orders are repeat orders${h.returning_aov ? `, at ${mo(h.returning_aov)} each` : ''}.` : ''}</div></div>
      <p class="v4-ring-cap v4-left">Under 1.5x the first order does not pay for the customer; over 3x there is room to bid harder. <button type="button" class="v2link" data-go="customers">Customers ›</button></p>`
      : `<div class="v2h"><h3>Is a customer worth what we pay?</h3></div><p class="v2hint">Customer numbers need Triple Whale orders synced for this brand.</p>`;

    /* 4. where the money went, month to date */
    const fallCard = K.card('Where the money went', broken ? 'The cost data for this brand failed its check, so what was kept is withheld.' : `${mo(mtd.sales)} came in; ${mtd.cm != null ? `<b>${mo(mtd.cm)}</b> was left after every variable cost${mtd.sales ? `, ${K.pct(mtd.cm / mtd.sales, 0)} of revenue` : ''}` : 'costs are still landing'}${mtd.mer ? `, at ${K.x2(mtd.mer)} MER` : ''}.`,
      broken ? `<button type="button" class="v2link" data-go="costs">Open the cost check ›</button>` : waterfall(mtd, cur, d.margin_pct), `${monthName} to date`);

    /* 5. who paid, and through what: new vs returning, then first orders by channel */
    const chRows = (() => { if (!ch || !ch.brands) return []; const by = {}; for (const bb of ch.brands) for (const r of bb.rows || []) { const o = by[r.id] ||= { id: r.id, label: r.label, nc: 0, revenue: 0 }; o.nc += r.nc || 0; o.revenue += r.revenue || 0; } return Object.values(by).filter(r => r.nc > 0).sort((x, y) => y.nc - x.nc); })();
    const ncTot = chRows.reduce((s, r) => s + r.nc, 0) || 1;
    const split = nw != null && ret != null && nw + ret > 0 ? `<div class="v2stackbar"><i style="flex:${nw};background:var(--brand)"${K.tipAttr(`New customers · ${mo(nw)} · ${K.pct(nw / (nw + ret), 0)}`)}></i><i style="flex:${ret};background:var(--line-strong)"${K.tipAttr(`Returning · ${mo(ret)} · ${K.pct(ret / (nw + ret), 0)}`)}></i></div><div class="v4-river-l"><span><i style="background:var(--brand)"></i>New customers <b>${km(nw)}</b></span><span><i style="background:var(--line-strong)"></i>Returning <b>${km(ret)}</b></span></div>` : '';
    const whoCard = K.card('Who paid, and through what', nw != null && ret != null && nw + ret > 0 ? `${K.pct(nw / (nw + ret), 0)} of revenue from first-time buyers.` : 'New against returning, then where first orders came from.',
      `${split}${chRows.length && window.LxKit ? `<div class="v4-gap">${window.LxKit.bars(chRows.map(r => ({ label: r.label, v: r.nc, value: K.int(r.nc), note: K.pct(r.nc / ncTot, 0), tone: '' })), { max: chRows[0].nc })}</div><p class="v2hint v4-foot">First orders, credited under ${K.esc(K.MODEL_SHORT[H.S.model] || 'last platform click')}.</p>` : '<p class="v2hint">No first orders credited yet this month.</p>'}`, `${monthName} to date`);

    $('#main').innerHTML = shell(`<div class="v4-top v4-mo"><section class="v2card v4-land">${land}</section><section class="v2card">${wkCard}</section><section class="v2card">${cuCard}</section></div>
      <div class="v2two v4-two">${fallCard}${whoCard}</div>
      ${K.foot(`Revenue is Shopify total sales less tax, through Triple Whale. The month lands on the P&amp;L line: returning revenue arrives on its own, new revenue is planned spend times the trailing aMER. Customer value is the last 90 days.`)}`);
    H.pageActions && H.pageActions(acts);
    K.wireGo($('#main'));
  }
  window.V4 = { render, extraCalls, negatives, setPanel, get on() { return document.documentElement.classList.contains('lx-v4'); } };
})();

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
  /* the money palette (v2.css --m-*): one hue per money category, the same on the river, the waterfall and every legend */
  const BITE = { ads: 'var(--m-ads)', cogs: 'var(--m-product)', costs: 'var(--m-product)', shipping: 'var(--m-ship)', handling: 'var(--m-handling)', fees: 'var(--m-fees)' };
  /* healthy carry-on rates for the site funnel (Shopify's published ecommerce averages, rounded) */
  const FUN_BENCH = { cart: 0.06, order: 0.35 };
  const STEP = { Revenue: 'var(--m-kept)', Kept: 'var(--m-kept)', Product: 'var(--m-product)', Shipping: 'var(--m-ship)', Handling: 'var(--m-handling)', Fees: 'var(--m-fees)', 'Ad spend': 'var(--m-ads)', 'Gross profit': 'var(--line-strong)' };

  /* ---------- the river: yesterday's sales as one thin segmented bar (LxKit.river) ---------- */
  function river(b) {
    const cur = b.currency, km = v => K.kmoney(v, cur);
    const bites = (b.bites || []).filter(x => x.v > 0), sales = Math.max(b.sales || 0, 1);
    /* kept first, so the tick for a normal day reads against the end of the kept segment */
    const segs = [...(b.kept > 0 ? [{ label: 'Kept', v: b.kept, color: 'var(--m-kept)', tip: `<b>Kept</b> ${K.money(b.kept, cur)}, ${K.pct(b.kept / sales, 0)} of sales: what was left after ads, product, shipping and fees` }] : []),
      ...bites.map(bt => ({ label: bt.label, v: bt.v, color: BITE[bt.k] || BITE.cogs, tip: `<b>${K.esc(bt.label)}</b> ${K.money(bt.v, cur)}, ${K.pct(bt.v / sales, 0)} of sales` }))];
    return window.LxKit.river(segs, { total: b.sales, fmt: km, mark: b.kept > 0 ? b.normal : null, markLabel: b.normal != null ? `A normal day keeps about ${K.money(b.normal, cur)} (the last 28 days)` : '' });
  }
  function riverCard(b) {
    if (!b || !b.has) return `<div class="v2h"><h3>Yesterday</h3></div><p class="v2hint">Triple Whale has not synced yesterday for this brand yet.</p>`;
    const cur = b.currency;
    const n = b.kept == null ? `You sold <b>${K.money(b.sales, cur)}</b>` : b.kept < 0 ? `You <em class="lx-accent">actually</em> lost <b class="lost">${K.money(Math.abs(b.kept), cur)}</b>` : `You <em class="lx-accent">actually</em> kept <b>${K.money(b.kept, cur)}</b>`;
    const vsNormal = b.kept != null && b.normal != null && b.normal > 0 ? `<span class="v4-norm2">a normal day keeps <b>${K.money(b.normal, cur)}</b>${b.kept > 0 ? ` ${K.delta(b.kept, b.normal)}` : ''}</span>` : '';
    return `<div class="v2h"><h3>Yesterday, ${K.esc(dateWord(b.date))}</h3><span class="cap">the P&amp;L line</span></div>
      <div class="v4-herorow"><h2 class="v4-hero${b.kept != null && b.kept < 0 ? ' is-lost' : ''}">${n}</h2>${vsNormal}</div>
      ${b.broken ? `<p class="v2hint">What was kept needs trustworthy cost data. <button type="button" class="v2link" data-go="costs">Open the cost check ›</button></p>` : river(b)}
      ${b.line ? `<button type="button" class="v4-line" data-ask="${K.esc(b.line)}" title="Ask Locus about this"><span class="lx-face" data-state="${(b.to_change || 0) + (b.to_fix || 0) > 0 ? 'found' : 'clear'}" aria-hidden="true"></span><span>${K.esc(b.line)}</span><span class="v4-line-go">Ask ›</span></button>` : ''}`;
  }

  /* ---------- the month ring: the kit's thin brand-blue ring (LxKit.ring); status is a chip, never the stroke colour ---------- */
  function ring(pct, label, sub, outer, size = 132, chip = '') {
    return window.LxKit.ring(pct, { label, sub, outer, size, chip });
  }
  function monthCard(a, cur) {
    const now = new Date(), dim = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate(), elapsed = Math.max(1, now.getDate() - 1);
    const mtd = a.mtd?.sales, planNow = a.plan?.sales, goal = a.goals?.sales || null;
    const month = now.toLocaleDateString('en-US', { month: 'long' });
    if (mtd == null || !planNow) return `<div class="v2h"><h3>${month}</h3></div>${ring(null, '–', 'no plan')}<p class="v2hint v4-ring-cap">No monthly plan yet. <button type="button" class="v2link" data-go="plan">Set the goals ›</button></p>`;
    const pct = mtd / planNow, landing = mtd / elapsed * dim, outer = goal ? landing / goal : null;
    return `<div class="v2h"><h3>${month}</h3><span class="cap">${elapsed} of ${dim} days</span></div>
      ${ring(pct, `${Math.round(pct * 100)}%`, 'of plan by now', outer, 132, window.LxKit.planChip(pct))}
      <p class="v4-ring-cap">${K.kmoney(mtd, cur)} of ${K.kmoney(planNow, cur)} planned by now</p>
      <p class="v4-ring-cap v4-sub2">${goal ? `Lands at <b>${K.kmoney(landing, cur)}</b> of ${K.kmoney(goal, cur)}` : `On pace for <b>${K.kmoney(landing, cur)}</b>`}</p>
      <button type="button" class="v2link v4-ring-go" data-go="profit">P&amp;L ›</button>`;
  }

  /* ---------- the queue: three things, one button each ---------- */
  function queueItems(td, sd) {
    const rows = (td && td.rows) || [], kinds = ['cut', 'scale', 'trim', 'refresh', 'fix'];
    const change = rows.filter(r => kinds.includes(r.kind)).sort((a, b) => (b.stake || 0) - (a.stake || 0));
    const calls = rows.filter(r => r.kind === 'call');
    const items = [];
    if (change.length) { const f = change[0]; items.push({ chip: f.kind, title: `${change.length} ad set${change.length === 1 ? '' : 's'} to change`, sub: f.adset ? `${K.esc(f.adset)} first${f.spend != null ? `, ${K.money(f.spend)} at ${f.cpa ? K.money(f.cpa) + ' a sale' : 'no sale'}` : ''}` : K.esc(f.why || ''), go: 'today', btn: 'Open calls', primary: true }); }
    if (calls.length) { const c = calls[0]; items.push({ chip: 'call', title: `${calls.length} test${calls.length === 1 ? '' : 's'} to call`, sub: K.esc((c.test && c.test.name) || c.adset || c.why || ''), go: 'today', btn: 'Call it' }); }
    const next = sd && Array.isArray(sd.phases) ? sd.phases.filter(p => p.start && p.start >= new Date().toISOString().slice(0, 10)).sort((a, b) => a.start < b.start ? -1 : 1)[0] : null;
    if (next) items.push({ chip: 'date', chipText: dateWord(next.start).replace(/^\w+, /, ''), title: K.esc(next.name || next.label || 'Next date'), sub: 'on the calendar', go: 'calendar', btn: 'Calendar' });
    return items;
  }
  /* Needs you (review 2026-10-21): one item folds into the strip under the heading; the card appears at two or more */
  const queueStrip = it => window.LxKit.strip({ tone: it.primary ? 'warn' : 'brand', lead: 'Needs you', text: `${it.title}${it.sub ? ` · <span class="faint">${it.sub}</span>` : ''}`, go: it.go, goLabel: it.btn });
  function queueCard(items) {
    const body = items.length ? items.map(it => `<div class="v4-q"><span class="v4-chip ${it.chip}">${it.chipText || it.chip}</span><div class="t"><b>${it.title}</b><small>${it.sub}</small></div><button type="button" class="v2btn${it.primary ? '' : ' ghost'}" data-go="${it.go}">${it.btn}</button></div>`).join('')
      : '<p class="v2hint">Nothing waiting. <button type="button" class="v2link" data-go="today">Open the calls ›</button></p>';
    return `<div class="v2h"><h3>Needs you</h3><span class="cap">${items.length} things</span></div><div class="v4-queue">${body}</div>`;
  }

  /* ---------- the page ---------- */
  async function render(host, first, page = 'morning', agency = false) {
    if (agency) return page === 'month' ? moneyBoard(host, first) : board(host, first);
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
    const cm = window.cardModel ? window.cardModel() : '';
    const share = chRows.length ? K.card('Where revenue came from', K.isPlat() ? 'on the platforms’ own numbers' : 'credited by Triple Whale',
      `<div class="v2stackbar">${chRows.map(r => `<i style="flex:${r.revenue};background:var(${K.CH[r.id] || '--c-else'})"${K.tipAttr(`<b>${K.esc(r.label)}</b> · ${K.kmoney(r.revenue, cur)} · ${K.pct(r.revenue / credited, 0)}${r.spend ? ` · ROAS ${K.x2(r.revenue / r.spend)}` : ''}`)}></i>`).join('')}</div>
       <div class="v4-share">${chRows.map(r => `<button type="button" class="v4-sh"${['meta', 'google', 'tiktok', 'email'].includes(r.id) ? ` data-go="${r.id}"` : ''}><i style="background:var(${K.CH[r.id] || '--c-else'})"></i><span class="l">${K.esc(r.label)}</span><b>${K.kmoney(r.revenue, cur)}</b><small>${r.spend ? `${K.x2(r.revenue / r.spend)} · ${K.int(r.nc)} first` : `${K.int(r.nc)} first`}${r.hasPrev ? ` ${K.delta(r.revenue, r.prev_revenue)}` : ''}</small></button>`).join('')}</div>`, cm) : '';

    const S0 = st && st.brands ? st.brands : [];
    const fun = S0.reduce((s, bb) => { const x = bb.cur || {}, y = bb.prev || {}; s.ses += x.sessions || 0; s.cart += x.carts || 0; s.ord += x.orders || 0; s.pses += y.sessions || 0; s.pcart += y.carts || 0; s.pord += y.orders || 0; return s; }, { ses: 0, cart: 0, ord: 0, pses: 0, pcart: 0, pord: 0 });
    const funnel = fun.ses && window.LxKit ? K.card('Site funnel', `${K.pct(fun.ord / fun.ses, 2)} of sessions became an order${fun.pses ? `, against ${K.pct(fun.pord / fun.pses, 2)} before` : ''}`,
      window.LxKit.funnel([
        { label: 'Sessions', v: fun.ses, prev: fun.pses || null },
        { label: 'Added to cart', v: fun.cart, prev: fun.pses ? fun.pcart : null, bench: FUN_BENCH.cart },
        { label: 'Orders', v: fun.ord, prev: fun.pses ? fun.pord : null, bench: FUN_BENCH.order },
      ], { fmt: K.int }), 'Triple Whale pixel', [`Each chip is the share of the step before that carried on, coloured against a healthy store: about ${Math.round(FUN_BENCH.cart * 100)}% of sessions add to cart and about ${Math.round(FUN_BENCH.order * 100)}% of carts become an order (Shopify's published ecommerce averages, rounded).`]) : '';

    const qi = queueItems(td, sd);
    $('#main').innerHTML = shell(`<div id="v4strip"></div>${qi.length === 1 ? `<div class="v4-qstrip">${queueStrip(qi[0])}</div>` : ''}
      <div class="v4-top${qi.length >= 2 ? '' : ' v4-two-top'}"><section class="v2card v4-r">${riverCard(b)}</section><section class="v2card v4-m">${monthCard(a, cur)}</section>${qi.length >= 2 ? `<section class="v2card v4-n">${queueCard(qi)}</section>` : ''}</div>
      ${tiles}<div class="v2two v4-two">${share}${funnel}</div><div id="v4cal"></div>
      ${K.foot(`Revenue, orders, AOV and the compare deltas come from Shopify through Triple Whale for ${K.esc(H.rangeLabel())}. Channel revenue follows the attribution switch. Yesterday is the P&amp;L line: sales less ads, product, shipping and fees.`)}`);
    const root = $('#main'); K.wireGo(root);
    root.querySelectorAll('[data-ask]').forEach(bt => bt.onclick = () => { if (window.AskUI && window.AskUI.ask) window.AskUI.ask(bt.dataset.ask); });
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
  function waterfall(t, cur, marginPct) {
    const steps = marginPct != null
      ? [['Revenue', t.sales, 'tot'], [`Costs at ${Math.round(marginPct * 100)}%`, -(t.sales - (t.gross_profit || 0))], ['Gross profit', t.gross_profit, 'sub'], ['Ad spend', -(t.spend || 0)], ['Kept', t.cm, 'tot']]
      : [['Revenue', t.sales, 'tot'], ['Product', -(t.cogs || 0)], ['Shipping', -(t.ship_cost || 0)], ['Handling', -(t.handling || 0)], ['Fees', -(t.fees || 0)], ['Gross profit', t.gross_profit, 'sub'], ['Ad spend', -(t.spend || 0)], ['Kept', t.cm, 'tot']].filter(st => st[2] || st[1] !== 0);
    return window.LxKit.waterfall(steps.map(([label, v, kind]) => ({ label, v: v || 0, kind, color: STEP[String(label).replace(/ at \d+%$/, '')] || (/^Costs/.test(label) ? 'var(--m-product)' : 'var(--m-other)') })), { fmt: v => K.kmoney(v, cur) });
  }

  async function month(host, first) {
    H = host; K = window.V2 && window.V2.kit; if (!K) { $('#main').innerHTML = '<div class="card"><span style="color:var(--bad)">The v2 kit did not load. Hard-refresh (Ctrl+Shift+R).</span></div>'; return; }
    window.V2.setHost(host);
    const t0 = H.RUN(); const a = K.scopeAccts()[0]; if (!a) return;
    const cur = a.currency, now = new Date(), monthName = now.toLocaleDateString('en-US', { month: 'long' });
    const ym = now.toISOString().slice(0, 7), mStart = `${ym}-01`, today = now.toISOString().slice(0, 10);
    const title = `${monthName}: ${K.esc(a.name)}`;
    const shell = body => `<div class="v2 lx v4">${K.head('month', title)}${body}</div>`;
    /* a client reads the month; editing the plan is the team's (body.is-client), Customers is theirs too */
    const client = document.body.classList.contains('is-client');
    const acts = `${client ? '' : '<button type="button" class="v2btn" data-go="plan">Edit the plan</button>'}<button type="button" class="v2btn ghost" data-go="customers" data-client-ok>Customers</button>`;
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
      /* three rows, one path each: label, the number, and how far from the goal (green over, red short) */
      const prow = (l, v, g) => `<div class="v4-pr"><span>${l}</span><b>${km(v)}</b><small class="${g >= 0 ? 'good' : 'bad'}">${g >= 0 ? `${km(g)} over` : `${km(-g)} short`}</small></div>`;
      land = `<div class="v2h"><h3>Where the month lands</h3><span class="cap">${elapsed} of ${dim} days</span></div>
        ${ring(proj / goal, km(proj), `of ${km(goal)} goal`, pace / goal, 150, proj >= goal ? window.LxKit.chip('good', 'Lands over the goal') : proj >= goal * 0.9 ? window.LxKit.chip('warn', 'Close to the goal') : window.LxKit.chip('bad', 'Short of the goal'))}
        <div class="v4-paths">${prow('Spending the budget', proj, gapP)}${prow("At today's pace", pace, gapC)}${th && !th.already_there && th.revenue_per_day > 0 ? `<div class="v4-pr"><span>To hit it</span><b>${mo(th.revenue_per_day)} a day</b><small>${th.spend_per_day ? `${mo(th.spend_per_day)} of it ads` : ''}</small></div>` : th && th.already_there ? `<div class="v4-pr"><span>Already there</span><b>banked</b><small class="good">goal met</small></div>` : ''}</div>
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
      <div class="v4-facts"><span><small>Revenue</small><b>${km(mtd.sales)}</b>${nw != null && ret != null ? `<em>${km(nw)} new · ${km(ret)} returning</em>` : ''}</span><span><small>Ad spend</small><b>${km(mtd.spend)}</b></span>${mtd.mer ? `<span><small>MER</small><b>${K.x2(mtd.mer)}</b></span>` : ''}${mtd.spend && nw != null ? `<span><small>aMER</small><b>${K.x2(nw / mtd.spend)}</b></span>` : ''}</div>`;

    /* 3. is a customer worth what we pay (90 days, from /api/customers) */
    const h = cu && cu.headline;
    const pb = h ? h.payback : null, dollar = v => `$${(+v).toFixed(2)}`;
    const cuSay = pb == null ? '' : `Each $1 of ads brings <b>${dollar(pb)}</b> back in 90 days. ${pb < 1.5 ? 'That is under $1.50, so the first order does not pay for the customer yet; repeat orders have to.' : pb < 3 ? 'Over $1.50, so a new customer pays for themselves; under $3, so bid with care.' : 'Over $3, so there is room to bid harder for new customers.'}`;
    const cuCard = h ? `<div class="v2h"><h3>Is a customer worth what we pay?</h3><span class="find">${h.thin ? `only ${K.int(h.new_orders)} new customers, read it loosely` : `${K.int(h.new_orders)} new customers in the last 90 days`}</span></div>
      <p class="v4-cusay">${cuSay}</p>
      ${window.LxKit.scale(pb, { max: Math.max(4, (pb || 0) * 1.15), fmt: v => `${dollar(v)} back`, marks: [{ at: 1, label: '$1' }, { at: 1.5, label: '$1.50 pays back' }, { at: 3, label: '$3 bid harder' }] })}
      <div class="v4-cfacts">${h.cac != null ? `<div><b>${mo(h.cac)}</b><small>What a new customer costs</small></div>` : ''}${h.new_aov != null ? `<div><b>${mo(h.new_aov)}</b><small>Their first order</small></div>` : ''}${h.first_order_gp != null ? `<div><b>${mo(h.first_order_gp)}</b><small>Left after costs</small></div>` : ''}${h.repeat_share != null ? `<div><b>${K.pct(h.repeat_share, 0)}</b><small>Come back and order again</small></div>` : ''}</div>
      <button type="button" class="v2link v4-cu-go" data-go="customers" data-client-ok>See every customer month ›</button>`
      : `<div class="v2h"><h3>Is a customer worth what we pay?</h3></div><p class="v2hint">Customer numbers need Triple Whale orders synced for this brand.</p>`;

    /* 4. where the money went, month to date */
    const fallCard = K.card('Where the money went', broken ? 'The cost data for this brand failed its check, so what was kept is withheld.' : `${mo(mtd.sales)} came in; ${mtd.cm != null ? `<b>${mo(mtd.cm)}</b> was left after every variable cost${mtd.sales ? `, ${K.pct(mtd.cm / mtd.sales, 0)} of revenue` : ''}` : 'costs are still landing'}${mtd.mer ? `, at ${K.x2(mtd.mer)} MER` : ''}.`,
      broken ? `<button type="button" class="v2link" data-go="costs">Open the cost check ›</button>` : waterfall(mtd, cur, d.margin_pct), `${monthName} to date`);

    /* 5. who paid, and through what: new vs returning, then first orders by channel */
    const chRows = (() => { if (!ch || !ch.brands) return []; const by = {}; for (const bb of ch.brands) for (const r of bb.rows || []) { const o = by[r.id] ||= { id: r.id, label: r.label, nc: 0, revenue: 0 }; o.nc += r.nc || 0; o.revenue += r.revenue || 0; } return Object.values(by).filter(r => r.nc > 0).sort((x, y) => y.nc - x.nc); })();
    const ncTot = chRows.reduce((s, r) => s + r.nc, 0) || 1;
    const split = nw != null && ret != null && nw + ret > 0 ? `<div class="v2stackbar"><i style="flex:${nw};background:var(--brand)"${K.tipAttr(`New customers · ${mo(nw)} · ${K.pct(nw / (nw + ret), 0)}`)}></i><i style="flex:${ret};background:var(--line-strong)"${K.tipAttr(`Returning · ${mo(ret)} · ${K.pct(ret / (nw + ret), 0)}`)}></i></div><div class="v4-river-l"><span><i style="background:var(--brand)"></i>New customers <b>${km(nw)}</b></span><span><i style="background:var(--line-strong)"></i>Returning <b>${km(ret)}</b></span></div>` : '';
    const whoCard = K.card('Who paid, and through what', nw != null && ret != null && nw + ret > 0 ? `${K.pct(nw / (nw + ret), 0)} of revenue from first-time buyers.` : 'New against returning, then where first orders came from.',
      `${split}${chRows.length && window.LxKit ? `<div class="v4-gap">${window.LxKit.bars(chRows.map(r => ({ label: r.label, v: r.nc, value: K.int(r.nc), note: K.pct(r.nc / ncTot, 0), tone: '' })), { max: chRows[0].nc })}</div><p class="v2hint v4-foot">First orders by channel, credited by the model on the card.</p>` : '<p class="v2hint">No first orders credited yet this month.</p>'}`, `${monthName} to date${window.cardModel ? ` ${window.cardModel()}` : ''}`);

    $('#main').innerHTML = shell(`<div class="v4-top v4-mo"><section class="v2card v4-land">${land}</section><section class="v2card">${wkCard}</section><section class="v2card">${cuCard}</section></div>
      <div class="v2two v4-two">${fallCard}${whoCard}</div>
      ${K.foot(`Revenue is Shopify total sales less tax, through Triple Whale. The month lands on the P&amp;L line: returning revenue arrives on its own, new revenue is planned spend times the trailing aMER. Customer value is the last 90 days.`)}`);
    H.pageActions && H.pageActions(acts);
    K.wireGo($('#main'));
  }

  /* ---------- Agency view, phase 4: one row per brand, ranked by what needs you ----------
     Today > Morning = the brand board (the book yesterday, the counts, then a row per brand: kept yesterday against a
     normal day, the month ring, why it needs you, the week). Money > Month = the same rows for the month: banked against
     the plan by now, where it lands against the goal, spend against the plan, MER. Reasons come from command.js
     (/api/hub/command), kept from /api/hub/kept, the calls from /api/hub/today; a row opens that brand's page. */
  function setup(host, first, id, title, skel) {
    H = host; K = window.V2 && window.V2.kit; if (!K) { $('#main').innerHTML = '<div class="card"><span style="color:var(--bad)">The v2 kit did not load. Hard-refresh (Ctrl+Shift+R).</span></div>'; return null; }
    window.V2.setHost(host);
    const shell = body => `<div class="v2 lx v4">${K.head(id, title)}${body}</div>`;
    if (first) $('#main').innerHTML = shell(skel || K.skPage({ tiles: 0, chart: false, rows: 6 }));
    return shell;
  }
  const dot = sev => `<span class="v4-dot ${sev}"></span>`;
  const brandCell = (a, sev, chips) => `<div class="v4-bn"><button type="button" class="v4-bname" data-go="act:${K.esc(a.act_id)}:${chips === 'month' ? 'month' : 'morning'}">${dot(sev)}${K.esc(a.name)}</button>${chips && chips !== 'month' ? `<div class="v4-gaps">${chips}</div>` : ''}</div>`;

  async function board(host, first) {
    const shell = setup(host, first, 'morning', 'Morning: <em class="lx-accent">every</em> brand'); if (!shell) return;
    const t = H.RUN(); const all = K.scopeAccts().filter(a => !a.internal);
    const CC = window.CommandCenter || {};
    const [kept, cmd, work, td, ov] = await Promise.all([
      window.LxHero ? window.LxHero.load(H, 'all').catch(() => null) : null,
      CC.cached ? CC.cached('/api/hub/command?act=all', () => H.api('/api/hub/command?act=all')).catch(() => null) : H.api('/api/hub/command?act=all').catch(() => null),
      CC.cached ? CC.cached('work', () => H.apiAH('/api/command/work')).catch(() => null) : null,
      K.get('/api/hub/today?act=all').catch(() => null),
      window.ovTodayLoad ? window.ovTodayLoad(all).catch(() => null) : null,
    ]);
    if (t !== H.RUN()) return;
    const KB = Object.fromEntries(((kept && kept.brands) || []).map(b => [b.act_id, b]));
    const CB = Object.fromEntries(((cmd && cmd.brands) || []).map(b => [b.act_id, b]));
    const rows = [], paused = [];
    for (const a of all) {
      const c = CB[a.act_id]; if (c && c.paused) { paused.push(a); continue; }
      const rs = CC.reasonsFor ? CC.reasonsFor(a, c, work) : ((c && c.reasons) || []);
      rows.push({ a, c, k: KB[a.act_id], rs, sev: CC.worst ? CC.worst(rs) : 'good', score: CC.score ? CC.score(rs) : 0 });
    }
    rows.sort((x, y) => (y.score - x.score) || ((y.a.window?.sales || 0) - (x.a.window?.sales || 0)));
    /* the book, yesterday */
    const ok = rows.map(r => r.k).filter(b => b && b.kept != null), curs = [...new Set(ok.map(b => b.currency))], one = curs.length === 1 ? curs[0] : null;
    const bookKept = one && ok.length ? ok.reduce((s, b) => s + b.kept, 0) : null, bookSales = ok.reduce((s, b) => s + (b.sales || 0), 0);
    const normal = one && ok.length && ok.every(b => b.normal != null) ? ok.reduce((s, b) => s + b.normal, 0) : null;
    const tdRows = (td && td.rows) || [], nChange = tdRows.filter(r => ['cut', 'scale', 'trim', 'refresh'].includes(r.kind)).length, nFix = tdRows.filter(r => r.kind === 'fix').length;
    const nCalls = ov && ov.calls ? ov.calls.n : tdRows.filter(r => r.kind === 'call').length, nReports = ov && ov.reports ? ov.reports.n : null, nBriefs = ov && ov.briefs ? ov.briefs.n : null;
    const cnt = (n, l, go) => n ? `<button type="button" class="v4-cnt" data-go="${go}"><b>${K.int(n)}</b>${l}</button>` : '';
    const book = `<section class="v2card v4-book"><div><div class="v4-book-l">The book, yesterday</div><h2 class="v4-hero">${bookKept == null ? (one ? 'No numbers for yesterday yet' : 'Brands report in different currencies') : bookKept < 0 ? `Lost <b class="lost">${K.money(Math.abs(bookKept), one)}</b>` : `Kept <b>${K.money(bookKept, one)}</b>`}${bookKept != null ? ` <small>on ${K.money(bookSales, one)} across ${ok.length} brand${ok.length === 1 ? '' : 's'}${normal != null ? ` · a normal day keeps ${K.money(normal, one)}` : ''}</small>` : ''}</h2></div>
      <div class="v4-counts">${cnt(nChange, 'ad sets to change', 'today')}${cnt(nCalls, 'tests to call', 'today')}${cnt(nReports, 'reports to send', 'reports')}${cnt(nBriefs, 'briefs to send', 'brief')}${cnt(nFix, 'accounts to fix', 'today')}</div></section>`;
    const maxKept = Math.max(1, ...rows.map(r => r.k && r.k.kept > 0 ? r.k.kept : 0));
    const now = new Date(), dim = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate(), elapsed = Math.max(1, now.getDate() - 1);
    const rowHtml = r => {
      const { a, k, rs } = r, cur = a.currency, w = a.window || {}, p = H.S.cmp !== 'none' && a.prev ? a.prev : {};
      const mtd = a.mtd?.sales, planNow = a.plan?.sales, pct = mtd != null && planNow ? mtd / planNow : null;
      const first = rs[0], gaps = rs.filter(x => x.sev === 'info'), real = rs.filter(x => x.sev !== 'info');
      const keptCell = !k || !k.has ? '<span class="v4-quiet">not synced yet</span>' : k.kept == null ? '<span class="v4-quiet">cost data needed</span>' : `<div class="v4-kb"><span class="tr"><i class="${k.kept < 0 ? 'bad' : ''}" style="width:${(Math.max(0, k.kept) / maxKept * 100).toFixed(1)}%"></i>${k.normal != null && k.normal > 0 ? `<b style="left:${Math.min(100, k.normal / maxKept * 100).toFixed(1)}%" title="a normal day"></b>` : ''}</span><b class="${k.kept < 0 ? 'bad' : ''}">${K.money(k.kept, cur)}</b></div><small>on ${K.money(k.sales, cur)} of sales${k.normal != null ? ` · normal ${K.money(k.normal, cur)}` : ''}</small>`;
      const why = real.length ? `<span class="v4-chip ${r.sev === 'bad' ? 'cut' : 'refresh'}">${r.sev === 'bad' ? 'act now' : 'look'}</span><span class="v4-whyt">${real.slice(0, 2).map(x => `<button type="button" class="v2link q" data-go="act:${K.esc(a.act_id)}:${K.esc(x.go || 'morning')}">${K.esc(x.text)}</button>`).join('')}${real.length > 2 ? `<small>${real.length - 2} more</small>` : ''}</span>` : `<span class="v4-ok">Nothing needs you here.</span>`;
      /* the chip is the count and the kind, never the task names: "4 Asana tasks overdue", "2 tasks stuck 10+ days" */
      const chips = gaps.length ? gaps.map(g => `<span class="v4-gap-c">${K.esc(String(g.text).split(':')[0].replace(' in the same stage', '').replace(/\.$/, '').trim())}</span>`).join('') : '';
      return `<div class="v4-brow">${brandCell(a, r.sev, chips)}<div>${keptCell}</div><div>${pct != null ? ring(pct, `${Math.round(pct * 100)}%`, '', null, 56) : `<button type="button" class="v2link q" data-go="act:${K.esc(a.act_id)}:plan">no plan</button>`}</div><div class="v4-why">${why}</div><div class="v4-wk"><b>${K.kmoney(w.sales, cur)}</b>${p.sales ? K.delta(w.sales, p.sales) : ''}<span class="v4-quiet">MER ${K.x2(w.spend ? w.sales / w.spend : null)}</span></div></div>`;
    };
    $('#main').innerHTML = shell(`${book}<section class="v2card v4-boardc"><div class="v4-bhead"><span>Brand</span><span>Kept yesterday · vs normal</span><span>Month</span><span>Why it needs you</span><span>${K.esc(H.rangeLabel())}</span></div>${rows.map(rowHtml).join('')}
      ${paused.length ? `<p class="v4-paused">Paused, not flagged: ${paused.map(a => `<button type="button" class="v2link q" data-go="act:${K.esc(a.act_id)}:morning">${K.esc(a.name)}</button>`).join(', ')}.</p>` : ''}</section>
      ${K.foot(`Kept = yesterday's P&amp;L line (sales less ads, product, shipping and fees); a normal day is the brand's last 28 days. Month = banked against the plan by now. Reasons use fixed windows ending ${K.esc(cmd && cmd.yesterday ? cmd.yesterday : 'yesterday')}. The week is ${K.esc(H.rangeLabel())} on the picker.`)}`);
    K.wireGo($('#main'));
  }

  async function moneyBoard(host, first) {
    const shell = setup(host, first, 'month', `${new Date().toLocaleDateString('en-US', { month: 'long' })}: <em class="lx-accent">every</em> brand`); if (!shell) return;
    const t = H.RUN(); const CC = window.CommandCenter || {};
    const cmd = CC.cached ? await CC.cached('/api/hub/command?act=all', () => H.api('/api/hub/command?act=all')).catch(() => null) : null;
    if (t !== H.RUN()) return;
    const PAUSED = new Set(((cmd && cmd.brands) || []).filter(b => b.paused).map(b => b.act_id));
    const all = K.scopeAccts().filter(a => !a.internal && !PAUSED.has(a.act_id)), paused = K.scopeAccts().filter(a => PAUSED.has(a.act_id));
    const now = new Date(), dim = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate(), elapsed = Math.max(1, now.getDate() - 1);
    const rows = all.map(a => { const mtd = a.mtd?.sales, planNow = a.plan?.sales, goal = a.goals?.sales || null, pct = mtd != null && planNow ? mtd / planNow : null; return { a, mtd, planNow, goal, pct, land: mtd != null ? mtd / elapsed * dim : null, spend: a.mtd?.spend, pSpend: a.plan?.spend, broken: a.cost_health?.verdict === 'broken' }; });
    rows.sort((x, y) => (x.pct == null) - (y.pct == null) || (x.pct ?? 9) - (y.pct ?? 9));
    const curs = [...new Set(all.map(a => a.currency))], one = curs.length === 1 ? curs[0] : null;
    const planned = rows.filter(r => r.pct != null);
    const tot = one && planned.length ? planned.reduce((s, r) => { s.mtd += r.mtd; s.plan += r.planNow; s.goal += r.goal || 0; s.land += r.land; return s; }, { mtd: 0, plan: 0, goal: 0, land: 0 }) : null;
    const sevOf = r => r.pct == null ? 'info' : r.pct >= 0.98 ? 'good' : r.pct >= 0.85 ? 'warn' : 'bad';
    const rowHtml = r => { const { a } = r, cur = a.currency, mer = r.spend ? r.mtd / r.spend : null, goalMer = a.goals?.sales && a.goals?.spend ? a.goals.sales / a.goals.spend : a.target_roas || null;
      return `<div class="v4-brow v4-mrow">${brandCell(a, sevOf(r), 'month')}<div>${r.pct != null ? ring(r.pct, `${Math.round(r.pct * 100)}%`, '', null, 56) : `<button type="button" class="v2link q" data-go="act:${K.esc(a.act_id)}:plan">no plan</button>`}</div>
        <div><b>${K.kmoney(r.mtd, cur)}</b><small>${r.planNow ? `of ${K.kmoney(r.planNow, cur)} planned by now` : 'banked so far'}</small></div>
        <div>${r.goal && r.land != null ? `<b class="${r.land >= r.goal ? 'good' : r.land >= r.goal * 0.9 ? 'warn' : 'bad'}">${K.kmoney(r.land, cur)}</b><small>lands, of ${K.kmoney(r.goal, cur)} goal</small>` : r.land != null ? `<b>${K.kmoney(r.land, cur)}</b><small>at this pace</small>` : ''}</div>
        <div><b>${K.kmoney(r.spend, cur)}</b><small>${r.pSpend ? `of ${K.kmoney(r.pSpend, cur)} planned` : 'ad spend'}</small></div>
        <div><b class="${goalMer && mer ? (mer >= goalMer ? 'good' : mer >= goalMer * 0.9 ? 'warn' : 'bad') : ''}">${K.x2(mer)}</b><small>${goalMer ? `MER, goal ${K.x2(goalMer)}` : 'MER'}</small></div></div>`; };
    $('#main').innerHTML = shell(`${tot ? `<section class="v2card v4-book"><div><div class="v4-book-l">Every planned brand, month to date</div><h2 class="v4-hero">Banked <b>${K.kmoney(tot.mtd, one)}</b> <small>of ${K.kmoney(tot.plan, one)} planned by now${tot.goal ? ` · lands at ${K.kmoney(tot.land, one)} of ${K.kmoney(tot.goal, one)}` : ''} · ${elapsed} of ${dim} days</small></h2></div><div class="v4-counts"><button type="button" class="v4-cnt" data-go="profit"><b>P&amp;L</b>every brand</button></div></section>` : ''}
      <section class="v2card v4-boardc"><div class="v4-bhead v4-mhead"><span>Brand</span><span>Of plan</span><span>Banked</span><span>Where it lands</span><span>Spend</span><span>MER</span></div>${rows.map(rowHtml).join('')}${paused.length ? `<p class="v4-paused">Paused, not flagged: ${paused.map(a => `<button type="button" class="v2link q" data-go="act:${K.esc(a.act_id)}:month">${K.esc(a.name)}</button>`).join(', ')}.</p>` : ''}</section>
      ${K.foot('Banked = Shopify total sales less tax, through Triple Whale, this month. Planned by now = the month plan split evenly over the days elapsed. Lands = today\'s pace over the whole month. Worst first; a row opens that brand\'s month.')}`);
    K.wireGo($('#main'));
  }

  /* ---------- Reports, phase 5: the week as a story. Two cards under the summary: Done (Tasks ticked in the window, this
     brand) and From you (open Requests). Nothing is drawn when both are empty; the client archive never calls this. */
  async function reportExtras(root, host, o) {
    H = host; K = window.V2 && window.V2.kit; if (!K || !root) return;
    window.V2.setHost(host);
    const sum = root.querySelector('.rp-sumcard') || root.querySelector('#rpsec-summary') || root.querySelector('.rp-four');
    if (!sum || root.querySelector('#v4rep')) return;
    const act = H.S.act; if (!act || act === 'all') return;
    const t = H.RUN();
    const q = encodeURIComponent(act);
    const [ac, rq] = await Promise.all([H.apiAH(`/api/actions?act=${q}&status=done`).catch(() => null), H.apiAH(`/api/requests?act=${q}`).catch(() => null)]);
    if (t !== H.RUN() || !root.isConnected) return;
    const from = o.from || '', to = o.to ? o.to + 'T23:59:59' : '9999';
    const done = ((ac && ac.items) || []).filter(x => x.done_at && x.done_at >= from && x.done_at <= to && x.status !== 'open').slice(0, 6);
    const reqs = (Array.isArray(rq) ? rq : (rq && (rq.items || rq.requests)) || []).filter(x => x.status === 'open' || x.status === 'changes').slice(0, 6);
    if (!done.length && !reqs.length) return;
    const when = s => s ? K.day(String(s).slice(0, 10)) : '';
    const card = (title, cap, rows, empty) => `<div class="v2card v4-repc"><div class="v2h"><h3>${title}</h3><span class="cap">${cap}</span></div>${rows.length ? `<div class="v4-rows">${rows.join('')}</div>` : `<p class="v2hint">${empty}</p>`}</div>`;
    const doneRows = done.map(x => `<div class="v4-row"><span class="v4-tick on"></span><div class="t"><b>${K.esc(x.title || x.text || '')}</b><small>${K.esc([x.owner, when(x.done_at)].filter(Boolean).join(' · '))}</small></div></div>`);
    const reqRows = reqs.map(x => `<button type="button" class="v4-row" data-go="requests"><span class="v4-chip ${x.kind === 'approval' ? 'call' : 'refresh'}">${x.kind === 'approval' ? 'ok?' : x.kind === 'ask' ? 'owed' : 'open'}</span><div class="t"><b>${K.esc(x.title || '')}</b><small>asked ${K.esc(when(x.created_at))}${x.status === 'changes' ? ' · changes asked' : ''}</small></div></button>`);
    const el = document.createElement('div'); el.id = 'v4rep'; el.className = 'v4 v4-rep2';
    el.innerHTML = `${card('Done', 'from Tasks', doneRows, 'Nothing ticked this week.')}${card('From you', 'Requests', reqRows, 'Nothing waiting on the client.')}`;
    sum.insertAdjacentElement('afterend', el);
    K.wireGo(el);
  }

  /* ---------- Make > Pipeline, phase 6: the Ideas column ----------
     What could become the next brief, in front of Brief: saved Social posts (with the picture), the call rows that ask for
     a new version (Refresh), and the biggest leaks. "Brief it" opens the board's own New brief window with the words filled. */
  async function ideasCol(wrap, host, act) {
    H = host; K = window.V2 && window.V2.kit; if (!K || !wrap || !act || act === 'all') return;
    window.V2.setHost(host);
    /* review pass B: the column is ALWAYS there for one brand. It goes in at once (from the last read, or loading), every
       board paint calls this again (the board's innerHTML drops it), and one read per brand is shared for five minutes. */
    const M = ideasCol.mem || (ideasCol.mem = {}), m = M[act] || (M[act] = {});
    const SRC = 'Ideas come from posts you save on <a role="link" tabindex="0" data-go="social">Social</a>, Refresh calls on <a role="link" tabindex="0" data-go="today">Ads</a>, and the biggest <a role="link" tabindex="0" data-go="leaks">leaks</a>.';
    const cardOf = (it, i) => `<div class="v4-ic${it.img || it.ad ? ' pic' : ''}"${it.ad ? ` data-thumb="${K.esc(it.ad)}"` : ''}>${it.img ? `<img src="${K.esc(it.img)}" alt="" loading="lazy">` : it.ad ? `<span class="v4-ic-t" data-thumb="${K.esc(it.ad)}"></span>` : ''}<b>${K.esc(it.title)}</b><small>${K.esc(it.sub)}</small><div class="v4-ic-a"><button type="button" class="pd-btn pri" data-brief="${i}">Brief it</button><button type="button" class="pd-btn" data-go="${K.esc(it.go)}">Open</button></div></div>`;
    const fill = (col, items) => {
      col.innerHTML = `<div class="pd-ch"><span class="dot" style="background:var(--brand)"></span><b>Ideas</b><span class="n">${items ? items.length : ''}</span><span class="sp n2"></span></div>
        <div class="pd-cards" data-cards="ideas">${!items ? '<div class="pd-sk"></div><div class="pd-sk"></div>' : items.map(cardOf).join('')}<div class="pd-empty">${SRC}</div></div>`;
      col.querySelectorAll('[data-brief]').forEach(b => b.onclick = () => { const it = items[+b.dataset.brief]; if (window.ProductionTab && window.ProductionTab.newBrief) window.ProductionTab.newBrief({ act, text: it.text }); });
      K.wireGo(col);
      const ids = (items || []).filter(x => x.ad).map(x => x.ad); if (ids.length && window.V2 && window.V2.thumbs) window.V2.thumbs(col, ids, act, H);
    };
    let col = wrap.querySelector('.v4-ideas');
    if (!col) { col = document.createElement('div'); col.className = 'pd-col v4-ideas'; col.dataset.col = 'ideas'; wrap.insertBefore(col, wrap.firstChild); }
    col.dataset.act = act;
    if (col.dataset.drawn !== String(m.at || 0)) { fill(col, m.items || null); col.dataset.drawn = String(m.at || 0); }
    if (m.items && Date.now() - m.at < 300000) return;
    if (!m.p) m.p = (async () => { try {
      const q = encodeURIComponent(act);
      const [soc, td, lk] = await Promise.all([H.apiAH(`/api/social?act=${q}`).catch(() => null), K.get(`/api/hub/today?act=${q}`).catch(() => null), window.LeaksCard && window.LeaksCard.load ? (window.LeaksCard.setHost(H), window.LeaksCard.load(act).catch(() => null)) : null]);
      const items = [];
      for (const p of ((soc && soc.posts) || []).filter(x => x.saved || x.idea_id).slice(0, 4)) items.push({ img: p.cover || p.thumb || '', title: p.caption ? String(p.caption).slice(0, 80) : (p.handle ? `@${p.handle}` : 'Saved post'), sub: `saved post${p.ratio != null && p.base != null ? ` · ${Math.round(p.ratio)}x its usual` : ''}${p.handle ? ` · @${p.handle}` : ''}`, text: `Our version of ${p.handle ? '@' + p.handle + "'s" : 'the saved'} post: ${String(p.caption || '').slice(0, 60)}`, go: 'social' });
      for (const r of ((td && td.rows) || []).filter(x => x.kind === 'refresh').sort((a, b) => (b.stake || 0) - (a.stake || 0)).slice(0, 3)) items.push({ ad: r.anchor && r.anchor.ad_id ? r.anchor.ad_id : (r.top_ad && r.top_ad.ad_id) || r.ad_id, title: `Refresh ${r.adset || r.ad || ''}`, sub: `from the call${r.spend != null ? ` · ${K.money(r.spend, r.currency)} spent` : ''}`, text: `New version of ${r.adset || r.ad || ''}: ${String(r.why || '').slice(0, 80)}`, go: 'today' });
      for (const l of ((lk && lk.leaks) || []).filter(x => x.cost_month > 0 && !/negative/.test((x.apply && x.apply.kind) || '')).sort((a, b) => (b.cost_month || 0) - (a.cost_month || 0)).slice(0, 2)) items.push({ title: l.title, sub: `from a leak · ${K.money(l.cost_month, lk.currency)} a month`, text: `Fix: ${l.title}${l.fix ? '. ' + l.fix : ''}`, go: 'leaks' });
      m.items = items;
    } catch { m.items = m.items || []; } m.at = Date.now(); m.p = null; })();
    await m.p;
    /* whichever board is on screen now (a repaint may have replaced the one this call started on) gets the result */
    const now = document.querySelector('#main .pd-wrap .v4-ideas');
    if (now && now.dataset.act === act && now.dataset.drawn !== String(m.at)) { fill(now, m.items); now.dataset.drawn = String(m.at); }
  }
  window.V4 = { render, extraCalls, reportExtras, ideasCol, negatives, setPanel, get on() { return document.documentElement.classList.contains('lx-v4'); } };
})();

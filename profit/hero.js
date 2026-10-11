/* THE HERO NUMBER AND THE MORNING LINE (2026-10-11, docs/two-products.md section 5, session D).
 * Home opens on one number: "Yesterday you actually kept $X", the contribution margin the P&L already computes
 * (profit worker hub.js keptMany, GET /api/hub/kept), with the bites under it as a stacked bar: ads, product cost,
 * shipping and handling, fees. Named contribution, never profit. The agency Overview shows the sum with one small
 * row per brand. Above it, until noon, the morning line: one sentence per brand, the same sentence account-health
 * morning.js sends as a Slack DM, so the app and Slack never disagree.
 * Own closure like desk.js; v2.js home() hands it a host element and the host helpers (window.LxHero.mount).
 * Nothing here changes anything: it reads one route and draws. */
(() => {
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const sym = c => (!c || c === 'USD' ? '$' : c === 'GBP' ? '£' : c === 'EUR' ? '€' : c === 'CAD' ? 'CA$' : c === 'AUD' ? 'A$' : c + ' ');
  const money = (n, c) => n == null || !isFinite(n) ? '–' : (n < 0 ? '-' : '') + sym(c) + Math.round(Math.abs(n)).toLocaleString('en-US');
  const dateWord = s => s ? new Date(s + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' }) : '';
  const BITE_CLASS = { ads: 'b-ads', cogs: 'b-cogs', shipping: 'b-ship', fees: 'b-fees', costs: 'b-cogs' };
  const CACHE = new Map();
  /* One read per brand scope, kept 5 minutes; a failed read is never kept. */
  function load(H, act) {
    const key = act || 'all', hit = CACHE.get(key);
    if (hit && Date.now() - hit.at < 5 * 60e3) return hit.p;
    const p = H.api(`/api/hub/kept?act=${encodeURIComponent(key)}`);
    CACHE.set(key, { at: Date.now(), p }); p.catch(() => CACHE.delete(key));
    return p;
  }
  const beforeNoon = () => new Date().getHours() < 12;

  /** The stacked bar: what was kept first (when positive), then every bite, each labelled with its amount. */
  function bar(kept, bites, sales, cur) {
    const sum = bites.reduce((s, b) => s + (b.v || 0), 0);
    const total = Math.max(sales || 0, sum + Math.max(0, kept || 0), 1);
    const seg = (cls, label, v) => `<i class="${cls}" style="flex:${Math.max(0, v)} 0 0" title="${esc(label)}: ${esc(money(v, cur))}"></i>`;
    const lab = (cls, label, v) => `<span><i class="sw ${cls}"></i>${esc(label)} <b>${money(v, cur)}</b></span>`;
    const parts = [...(kept > 0 ? [['b-kept', 'Kept', kept]] : []), ...bites.map(b => [BITE_CLASS[b.k] || 'b-cogs', b.label, b.v])];
    if (!parts.length) return '';
    return `<div class="lx-bites" role="img" aria-label="${esc(parts.map(p => `${p[1]} ${money(p[2], cur)}`).join(', '))}">${parts.map(p => seg(p[0], p[1], p[2])).join('')}${total > sum + Math.max(0, kept || 0) ? `<i class="b-rest" style="flex:${total - sum - Math.max(0, kept || 0)} 0 0"></i>` : ''}</div>
      <div class="lx-bites-l">${parts.map(p => lab(p[0], p[1], p[2])).join('')}</div>`;
  }
  /** One sentence under the number: sales minus the bites, against a normal day. */
  function sentence(b) {
    const cur = b.currency, $ = v => money(v, cur);
    if (!b.has) return 'Triple Whale has not synced yesterday for this brand yet.';
    if (b.broken) return 'What was kept needs trustworthy cost data; the cost check says what is wrong.';
    const list = b.bites.map(x => x.k === 'costs' ? `a flat ${esc(x.label.replace('Product and delivery at ', ''))} for product and delivery` : `${$(x.v)} of ${x.label.toLowerCase()}`);
    const minus = list.length ? ` minus ${list.length > 1 ? list.slice(0, -1).join(', ') + ' and ' + list[list.length - 1] : list[0]}` : '';
    const vs = b.normal != null ? `, against a normal day of about ${$(b.normal)}` : '';
    return `Sales of ${$(b.sales)}${minus}${vs}.`;
  }
  function heroOne(b) {
    const cur = b.currency;
    const n = b.kept == null ? (b.has ? `You sold <b class="num">${money(b.sales, cur)}</b>` : 'No numbers for yesterday yet')
      : b.kept < 0 ? `You <em class="lx-accent">actually</em> lost <b class="num lost">${money(Math.abs(b.kept), cur)}</b>`
      : `You <em class="lx-accent">actually</em> kept <b class="num">${money(b.kept, cur)}</b>`;
    const fix = b.has && b.broken ? ` <button type="button" class="v2link" data-go="costs">Open the cost check ›</button>` : '';
    return `<section class="lx-hero${b.kept != null && b.kept < 0 ? ' is-lost' : ''}" id="lxHero">
      <div class="lx-hero-top"><span class="lx-hero-k">Yesterday, ${esc(dateWord(b.date))}</span><span class="lx-hero-src">Contribution, the P&amp;L line</span></div>
      <h2 class="lx-hero-n">${n}</h2>
      ${b.has && !b.broken ? bar(b.kept, b.bites, b.sales, cur) : ''}
      <p class="lx-hero-s">${sentence(b)}${fix}</p>
    </section>`;
  }
  function heroAll(d) {
    const bs = d.brands || [], curs = [...new Set(bs.filter(b => b.has).map(b => b.currency))];
    const one = curs.length === 1 ? curs[0] : null;
    const ok = bs.filter(b => b.kept != null && (!one || b.currency === one));
    const left = bs.filter(b => b.has && b.kept == null).map(b => b.name);
    const kept = ok.length ? ok.reduce((s, b) => s + b.kept, 0) : null;
    const sales = ok.reduce((s, b) => s + (b.sales || 0), 0);
    const bites = {}; for (const b of ok) for (const x of b.bites) { const k = x.k === 'costs' ? 'cogs' : x.k; const o = bites[k] ||= { k, label: k === 'cogs' ? 'Product cost' : x.label, v: 0 }; o.v += x.v || 0; }
    const BL = [...Object.values(bites)].sort((p, q) => q.v - p.v);
    const normal = ok.every(b => b.normal != null) && ok.length ? ok.reduce((s, b) => s + b.normal, 0) : null;
    const n = !one ? 'These brands report in different currencies, so there is no one number' : kept == null ? 'No numbers for yesterday yet'
      : kept < 0 ? `The book <em class="lx-accent">actually</em> lost <b class="num lost">${money(Math.abs(kept), one)}</b>` : `The book <em class="lx-accent">actually</em> kept <b class="num">${money(kept, one)}</b>`;
    const list = BL.map(x => `${money(x.v, one)} of ${x.label.toLowerCase()}`);
    const minus = list.length ? ` minus ${list.length > 1 ? list.slice(0, -1).join(', ') + ' and ' + list[list.length - 1] : list[0]}` : '';
    const s = one && kept != null ? `Sales of ${money(sales, one)} across ${ok.length} brand${ok.length === 1 ? '' : 's'}${minus}${normal != null ? `, against a normal day of about ${money(normal, one)}` : ''}.${left.length ? ` Not counted, cost data needed: ${esc(left.join(', '))}.` : ''}` : left.length ? `Cost data needed: ${esc(left.join(', '))}.` : '';
    const mx = Math.max(...bs.map(b => Math.abs(b.kept || 0)), 1);
    const rows = bs.slice().sort((p, q) => (q.kept ?? -Infinity) - (p.kept ?? -Infinity)).map(b => `<button type="button" class="lx-hero-row" data-act="${esc(b.act_id)}">
        <span class="n">${esc(b.name)}</span>
        <span class="bar"><i class="${b.kept != null && b.kept < 0 ? 'lost' : ''}" style="width:${(Math.abs(b.kept || 0) / mx * 100).toFixed(1)}%"></i></span>
        <span class="v${b.kept != null && b.kept < 0 ? ' lost' : ''}">${b.kept == null ? `<span class="faint">${b.has ? 'cost data' : 'no data'}</span>` : money(b.kept, b.currency)}</span>
        <span class="s">${b.has ? `on ${money(b.sales, b.currency)}${b.ads_pct != null ? ` · ads ${b.ads_pct}%` : ''}` : ''}</span></button>`).join('');
    return `<section class="lx-hero${kept != null && kept < 0 ? ' is-lost' : ''}" id="lxHero">
      <div class="lx-hero-top"><span class="lx-hero-k">Yesterday, ${esc(dateWord(d.date))}</span><span class="lx-hero-src">Contribution, the P&amp;L line, every brand</span></div>
      <h2 class="lx-hero-n">${n}</h2>
      ${one && kept != null ? bar(kept, BL, sales, one) : ''}
      ${s ? `<p class="lx-hero-s">${s}</p>` : ''}
      <div class="lx-hero-rows">${rows}</div>
    </section>`;
  }
  /** The morning line(s): one sentence per brand, shown until noon. */
  function morning(d, one, act) {
    if (!beforeNoon()) return '';
    const bs = (d.brands || []).filter(b => b.has && (!one || b.act_id === act));
    if (!bs.length) return '';
    const found = bs.some(b => (b.to_change || 0) + (b.to_fix || 0) > 0);
    const lines = (one ? bs : bs.slice().sort((p, q) => p.name.localeCompare(q.name))).map(b => `<p>${esc(b.line)}</p>`).join('');
    return `<div class="lx-morning" id="lxMorning"><span class="lx-face" data-state="${found ? 'found' : 'clear'}" aria-hidden="true"></span><div class="lx-morning-l">${lines}</div><span class="lx-morning-k">This morning</span></div>`;
  }
  function pickAct(H, id) { H.S.act = id; try { localStorage.setItem('pf_act', id); } catch {} const cp = document.getElementById('clientPick'); if (cp) cp.value = id; H.show('overview'); }

  async function mount(host, H, accts) {
    if (!host || !H) return;
    const one = H.S.act && H.S.act !== 'all';
    host.innerHTML = `<section class="lx-hero lx-hero-sk" aria-busy="true"><div class="lx-hero-top"><span class="lx-hero-k">Yesterday</span></div><h2 class="lx-hero-n"><span class="ds-sk" style="display:inline-block;width:46%;height:1em"></span></h2><div class="lx-bites ds-sk"></div></section>`;
    const t = H.RUN ? H.RUN() : null;
    let d; try { d = await load(H, H.S.act); } catch (e) { if (!t || t === H.RUN()) host.innerHTML = `<p class="v2say quiet">The hero number could not load: ${esc(e.message)}</p>`; return; }
    if (t && t !== H.RUN()) return;
    const b = one ? (d.brands || []).find(x => x.act_id === H.S.act) : null;
    host.innerHTML = morning(d, one, H.S.act) + (one ? (b ? heroOne(b) : '') : heroAll(d));
    host.querySelectorAll('[data-go]').forEach(el => el.onclick = () => H.show(el.dataset.go));
    host.querySelectorAll('.lx-hero-row').forEach(el => el.onclick = () => pickAct(H, el.dataset.act));
  }
  window.LxHero = { mount, load, beforeNoon, drop: () => CACHE.clear() };
})();

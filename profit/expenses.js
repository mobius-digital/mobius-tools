/* COSTS (2026-10-10, Cole: "brand expenses need to work like Triple Whale"). One Costs page per brand:
 *   1. Where each cost comes from (read only): product cost, shipping, handling, payment fees for the last 30 days,
 *      the source (Triple Whale, or the flat margin override when one is set), what is missing, and a link to change
 *      them in Triple Whale. Triple Whale stays the source for these (profit/CLAUDE.md hard rules); no COGS editor here.
 *   2. Custom expenses: fixed monthly, one time, % of revenue, % of ad spend, per order; a category; start and end;
 *      "counts as ad spend" (Triple Whale's "is ad spend"); notes; "Added by". Add and edit in an in-app modal; every
 *      save writes the brand's whole list (PUT /api/expenses, worker/src/expenses.js).
 * Used in Brand settings > Data and costs (mount) and as a sheet from P&L and the margin drill-down (open), for the
 * team and for a client login with P&L on (brandguard lets a client reach only its own brand).
 * window.CostsUI = { mount(box, {act, api}), open({act, api, onSaved}) }
 */
(() => {
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const money = (n, cur, dp) => n == null || !isFinite(n) ? '–' : new Intl.NumberFormat('en-US', { style: 'currency', currency: cur || 'USD', maximumFractionDigits: dp ?? (Math.abs(n) >= 1000 ? 0 : 2) }).format(n);
  const sym = cur => { try { return new Intl.NumberFormat('en-US', { style: 'currency', currency: cur || 'USD' }).formatToParts(1).find(p => p.type === 'currency').value; } catch { return '$'; } };
  const pct = x => x == null || !isFinite(x) ? '–' : `${(x * 100).toFixed(x < 0.1 ? 1 : 0)}%`;
  const md = s => s ? new Date(s + 'T12:00:00Z').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }) : '';
  const today = () => new Date().toISOString().slice(0, 10);
  const PCT = new Set(['pct_revenue', 'pct_spend']);
  const TW = 'https://app.triplewhale.com';

  function css() {
    if (document.getElementById('cxcss')) return;
    const st = document.createElement('style'); st.id = 'cxcss';
    st.textContent = `
      .cx{display:flex;flex-direction:column;gap:22px}
      .cx-sec h4{margin:0 0 4px;font-size:15px;font-weight:600}
      .cx-sec > p.cx-hint{margin:0 0 12px;font-size:13px;color:var(--muted);line-height:1.5}
      .cx-src{display:flex;flex-direction:column;border:1px solid var(--line);border-radius:12px;overflow:hidden}
      .cx-sr{display:grid;grid-template-columns:minmax(0,1.6fr) minmax(90px,.8fr) minmax(0,1.2fr);gap:12px;align-items:center;padding:12px 14px;border-top:1px solid var(--line)}
      .cx-sr:first-child{border-top:0}
      .cx-sr b{font-size:13.5px;font-weight:600;color:var(--ink)}
      .cx-sr small{display:block;font-size:12px;color:var(--muted);line-height:1.4;margin-top:2px}
      .cx-sr .cx-n{text-align:right;font-variant-numeric:tabular-nums;font-size:13.5px;color:var(--ink)}
      .cx-sr .cx-n small{text-align:right}
      .cx-st{font-size:12.5px;line-height:1.4;color:var(--ink-2)}
      .cx-st .good{color:var(--good)} .cx-st .warn{color:var(--warn)} .cx-st .bad{color:var(--bad)}
      .cx-foot{display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-top:10px;font-size:12.5px;color:var(--muted)}
      .cx-sum{font-size:13.5px;color:var(--ink-2);margin:0 0 10px}
      .cx-list{display:flex;flex-direction:column;gap:10px}
      .cx-it{border:1px solid var(--line);border-radius:12px;padding:12px 14px;display:flex;gap:12px;align-items:flex-start;background:var(--surface)}
      .cx-it .cx-m{flex:1;min-width:0}
      .cx-it .cx-t{font-size:14px;font-weight:600;color:var(--ink);display:flex;gap:8px;flex-wrap:wrap;align-items:center}
      .cx-it .cx-d{font-size:13px;color:var(--ink-2);margin-top:3px}
      .cx-it .cx-w{font-size:12px;color:var(--muted);margin-top:3px;overflow-wrap:anywhere}
      .cx-tag{font-size:11px;font-weight:600;padding:2px 8px;border-radius:99px;background:var(--surface-2);color:var(--ink-2)}
      .cx-tag.ad{background:var(--brand-soft);color:var(--brand)}
      .cx-tag.old{color:var(--muted)}
      .cx-acts{display:flex;gap:6px;flex:none}
      .cx-empty{padding:18px;text-align:center;color:var(--muted);font-size:13.5px;border:1px dashed var(--line-strong);border-radius:12px}
      .cx-add{display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-top:12px}
      .cx-m-w .modal{max-width:600px;width:calc(100vw - 32px);max-height:calc(100vh - 48px);overflow:auto}
      .cx-m-w.sheet .modal{max-width:860px}
      .cx-f{display:block;margin:14px 0 0}
      .cx-f > b{display:block;font-size:13px;font-weight:600;color:var(--ink)}
      .cx-f > small{display:block;font-size:12.5px;color:var(--muted);margin:2px 0 6px;line-height:1.4}
      .cx-f input[type=text],.cx-f input[type=date],.cx-f textarea,.cx-f select{width:100%;box-sizing:border-box;border:1px solid var(--line-strong);border-radius:8px;padding:8px 10px;font:inherit;font-size:13.5px;background:var(--surface);color:var(--ink)}
      .cx-f .unit-in{max-width:200px}
      .cx-f .unit-in input{border:0;padding:8px 4px;width:100%}
      .cx-two{display:grid;grid-template-columns:1fr 1fr;gap:12px}
      .cx-kinds{display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:8px}
      .cx-kind{border:1px solid var(--line-strong);border-radius:10px;padding:9px 11px;cursor:pointer;background:var(--surface);text-align:left;font:inherit;color:var(--ink)}
      .cx-kind b{display:block;font-size:13px;font-weight:600}
      .cx-kind small{display:block;font-size:11.5px;color:var(--muted);margin-top:2px;line-height:1.35}
      .cx-kind[aria-pressed="true"]{border-color:var(--brand);background:var(--brand-soft)}
      .cx-sw{display:flex;gap:10px;align-items:flex-start;cursor:pointer}
      .cx-sw .toggle{margin-top:2px}
      .cx-err{color:var(--bad);font-size:12.5px;min-height:1em;margin:10px 0 0}
      @media (max-width:560px){.cx-sr{grid-template-columns:minmax(0,1fr) auto}.cx-sr .cx-st{grid-column:1 / -1}.cx-two{grid-template-columns:1fr}.cx-it{flex-wrap:wrap}}`;
    document.head.appendChild(st);
  }

  /** In-app modal shell. Returns { el, close }. */
  function modal(html, cls = '', onClose = null) {
    const w = document.createElement('div');
    w.className = `modal-wrap cx-m-w ${cls}`;
    w.innerHTML = `<div class="modal" role="dialog" aria-modal="true">${html}</div>`;
    document.body.appendChild(w);
    const close = () => { if (!w.isConnected) return; w.remove(); document.removeEventListener('keydown', k); if (onClose) onClose(); };
    /* Escape closes only the top sheet (the edit form opens over the Costs sheet). */
    const k = e => { if (e.key === 'Escape' && [...document.querySelectorAll('.modal-wrap')].pop() === w) close(); };
    document.addEventListener('keydown', k);
    w.addEventListener('mousedown', e => { if (e.target === w) close(); });
    return { el: w, close };
  }
  const ask = (title, hint, cta) => new Promise(res => {
    const m = modal(`<h3>${esc(title)}</h3><p class="hint">${esc(hint)}</p><div class="row" style="justify-content:flex-end;gap:8px;margin-top:16px"><button class="btn" data-x="no">Cancel</button><button class="btn primary" data-x="yes">${esc(cta)}</button></div>`);
    m.el.querySelector('[data-x="no"]').onclick = () => { m.close(); res(false); };
    m.el.querySelector('[data-x="yes"]').onclick = () => { m.close(); res(true); };
  });

  /* ---------- 1. where each cost comes from ---------- */
  function sourcesHTML(s, cur) {
    if (!s) return '';
    if (s.error) return `<p class="cx-hint" style="color:var(--bad)">${esc(s.error)}</p>`;
    const per = x => (s.orders ? `${money(x / s.orders, cur, 2)} an order` : '');
    const of = x => (s.sales ? `${pct(x / s.sales)} of revenue` : '');
    const over = s.margin_pct != null;
    const src = over ? `Triple Whale, <b>not used</b> while the ${Math.round(s.margin_pct * 100)}% margin is set` : 'Triple Whale';
    const none = (s.sales || 0) > 0;
    const line = (label, what, val, status) => `<div class="cx-sr"><div><b>${label}</b><small>${what}</small></div>
      <div class="cx-n">${val == null ? '–' : money(val, cur)}<small>${val ? `${of(val)}${s.orders ? `<br>${per(val)}` : ''}` : ''}</small></div>
      <div class="cx-st">${status}<small>From ${src}</small></div></div>`;
    const ok = '<span class="good">Recorded</span>';
    const miss = t => `<span class="warn">${t}</span>`;
    const ship = s.ship_rev > 0 && !(s.ship_cost > 0) ? miss(`Nothing recorded, while customers paid ${money(s.ship_rev, cur, 0)} for shipping. Profit is overstated by what delivery really cost.`)
      : s.ship_cost > 0 ? ok : '<span>None in this window</span>';
    const verdict = { good: ['good', 'The cost check passes: every day reads normally.'], noisy: ['warn', 'The cost check found a few odd days; the figures stand.'], broken: ['bad', 'The cost check failed, so profit figures are hidden until it is fixed.'], override: ['warn', 'A flat margin is in use, so these four are not used.'], none: ['', 'No cost check recorded yet.'] }[s.verdict || 'none'] || ['', ''];
    return `<div class="cx-src">
        ${line('Product cost', 'Cost per item from Shopify, or what is set per product or variant in Triple Whale.', s.cogs, s.cogs > 0 ? ok : none ? miss('Nothing recorded. Add cost per item in Shopify or Triple Whale.') : '<span>No sales in this window</span>')}
        ${line('Shipping', 'What delivery costs you: a shipping app, a CSV, flat rates per order or country, or the charge itself.', s.ship_cost, ship)}
        ${line('Handling', 'Pick and pack: per product or one flat fee per order.', s.handling, s.handling > 0 ? ok : '<span>None set. Fine if you pay no handling fee.</span>')}
        ${line('Payment fees', 'Each payment gateway’s % and flat fee per order.', s.fees, s.fees > 0 ? ok : none ? miss('Nothing recorded. Set each gateway’s rate in Triple Whale.') : '<span>No sales in this window</span>')}
      </div>
      <div class="cx-foot"><span>Last 30 days, ${esc(md(s.from))} to ${esc(md(s.to))}.${verdict[1] ? ` <span class="${verdict[0]}">${esc(verdict[1])}</span>` : ''}${over ? ' The margin override is changed in Brand settings > Data and costs.' : ''}</span>
        <a class="btn btn-s" href="${TW}" target="_blank" rel="noopener">Change them in Triple Whale ›</a><span>Settings &gt; Cost Settings. Locus picks up changes overnight.</span></div>`;
  }

  /* ---------- 2. custom expenses ---------- */
  const kindOf = (d, id) => (d.kinds || []).find(k => k.id === id) || { id, label: id };
  const catOf = (d, id) => (d.categories || []).find(c => c.id === id) || { id, label: 'Other' };
  function describe(x, cur) {
    const a = PCT.has(x.kind) ? `${+x.amount}%` : money(+x.amount, cur);
    const when = x.kind === 'once' ? `on ${md(x.start_date)}` : `from ${md(x.start_date)}${x.end_date ? ` to ${md(x.end_date)}` : ', still running'}`;
    const what = { monthly: `${a} every month`, once: `${a} once`, pct_revenue: `${a} of revenue`, pct_spend: `${a} of ad spend`, per_order: `${a} per order` }[x.kind] || a;
    return `${what} ${when}`;
  }
  function runningMonthly(items) {
    const t = today();
    return items.filter(x => x.kind === 'monthly' && x.start_date <= t && (!x.end_date || x.end_date >= t)).reduce((s, x) => s + (+x.amount || 0), 0);
  }

  function form(d, x, onDone) {
    const cur = d.currency, isNew = !x;
    const v = x ? { ...x } : { name: '', category: 'software', kind: 'monthly', amount: '', start_date: today().slice(0, 8) + '01', end_date: '', is_ad_spend: false, notes: '' };
    const m = modal(`<h3>${isNew ? 'Add an expense' : 'Edit expense'}</h3>
      <p class="hint" style="margin:2px 0 0">A cost Triple Whale does not know about. It comes off contribution margin to give Net profit, unless it counts as ad spend.</p>
      <label class="cx-f"><b>Name</b><small>What it is, the way you would say it.</small><input type="text" data-v="name" maxlength="80" placeholder="e.g. Warehouse rent, Klaviyo, Podcast read" value="${esc(v.name)}"></label>
      <label class="cx-f"><b>Category</b><small>Groups it on P&amp;L.</small><select data-v="category">${(d.categories || []).map(c => `<option value="${esc(c.id)}" ${c.id === v.category ? 'selected' : ''}>${esc(c.label)}: ${esc(c.hint)}</option>`).join('')}</select></label>
      <div class="cx-f"><b>How it is charged</b><small>Pick the one that matches the bill.</small><div class="cx-kinds">${(d.kinds || []).map(k => `<button type="button" class="cx-kind" data-kind="${esc(k.id)}" aria-pressed="${k.id === v.kind}"><b>${esc(k.label)}</b><small>${esc(k.hint)}</small></button>`).join('')}</div></div>
      <label class="cx-f"><b data-l="amount">Amount</b><small data-l="amounthint"></small><span class="unit-in"><span data-u="pre">${esc(sym(cur))}</span><input type="text" inputmode="decimal" data-v="amount" value="${esc(v.amount)}" placeholder="0"><span data-u="post"></span></span></label>
      <div class="cx-two"><label class="cx-f"><b data-l="start">Starts</b><small data-l="starthint">The first day it applies.</small><input type="date" data-v="start_date" value="${esc(v.start_date || '')}"></label>
        <label class="cx-f" data-end><b>Ends</b><small>Leave blank while it is still running.</small><input type="date" data-v="end_date" value="${esc(v.end_date || '')}"></label></div>
      <div class="cx-f"><label class="cx-sw"><span class="toggle ${v.is_ad_spend ? 'on' : ''}" data-v="is_ad_spend" role="switch" aria-checked="${!!v.is_ad_spend}" tabindex="0"></span>
        <span><b style="font-size:13px">Counts as ad spend</b><small style="display:block;color:var(--muted);font-size:12.5px;line-height:1.4">For marketing with no ad account in Locus: influencers, sponsorships, a podcast read. It is added to ad spend, so MER, cost per new customer and contribution margin include it.</small></span></label></div>
      <label class="cx-f"><b>Notes</b><small>Optional. Anything the next person should know.</small><textarea data-v="notes" rows="2" maxlength="300">${esc(v.notes || '')}</textarea></label>
      <p class="cx-err" data-err></p>
      <div class="row" style="justify-content:flex-end;gap:8px;margin-top:8px"><button class="btn" data-x="no">Cancel</button><button class="btn primary" data-x="yes">${isNew ? 'Add expense' : 'Save changes'}</button></div>`);
    const q = s => m.el.querySelector(s);
    const paint = () => {
      const k = v.kind, p = PCT.has(k);
      q('[data-u="pre"]').textContent = p ? '' : sym(cur); q('[data-u="post"]').textContent = p ? '%' : '';
      q('[data-l="amount"]').textContent = { monthly: 'Amount each month', once: 'Amount', pct_revenue: 'Percent of revenue', pct_spend: 'Percent of ad spend', per_order: 'Amount per order' }[k];
      q('[data-l="amounthint"]').textContent = kindOf(d, k).hint || '';
      q('[data-l="start"]').textContent = k === 'once' ? 'Date' : 'Starts';
      q('[data-l="starthint"]').textContent = k === 'once' ? 'The day it was paid.' : 'The first day it applies.';
      q('[data-end]').style.display = k === 'once' ? 'none' : '';
      m.el.querySelectorAll('[data-kind]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.kind === k)));
    };
    m.el.querySelectorAll('[data-kind]').forEach(b => b.onclick = () => { v.kind = b.dataset.kind; paint(); });
    const tg = q('[data-v="is_ad_spend"]');
    const flip = () => { v.is_ad_spend = !v.is_ad_spend; tg.classList.toggle('on', v.is_ad_spend); tg.setAttribute('aria-checked', String(v.is_ad_spend)); };
    tg.closest('.cx-sw').onclick = e => { e.preventDefault(); flip(); };
    tg.onkeydown = e => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); flip(); } };
    q('[data-v="category"]').onchange = e => { v.category = e.target.value; if (v.category === 'marketing' && isNew && !v.is_ad_spend) flip(); };
    q('[data-x="no"]').onclick = m.close;
    q('[data-x="yes"]').onclick = async () => {
      for (const f of ['name', 'amount', 'start_date', 'end_date', 'notes', 'category']) v[f] = q(`[data-v="${f}"]`).value;
      if (v.kind === 'once') v.end_date = '';
      const btn = q('[data-x="yes"]'), err = q('[data-err]');
      btn.disabled = true; err.textContent = '';
      try { await onDone(v); m.close(); } catch (e) { err.textContent = e.message; btn.disabled = false; }
    };
    paint();
    if (!matchMedia('(max-width:720px)').matches) setTimeout(() => q('[data-v="name"]').focus(), 30);
  }

  async function mount(box, { act, api, onSaved }) {
    css();
    box.dataset.loaded = '1';
    box.innerHTML = '<span class="tiny">Loading…</span>';
    let d;
    try { d = await api(`/api/expenses?act=${encodeURIComponent(act)}`); }
    catch (e) { box.innerHTML = `<span class="tiny" style="color:var(--bad)">${esc(e.message)}</span>`; return; }
    const cur = d.currency;
    let items = d.items || [];
    const save = async (next, msg) => {
      const r = await api('/api/expenses', { method: 'PUT', body: JSON.stringify({ act, items: next }) });
      items = r.items || next; paint(msg);
      if (onSaved) onSaved();
    };
    const paint = (msg = '') => {
      const run = runningMonthly(items), vary = items.filter(x => x.kind !== 'monthly' && x.kind !== 'once').length, ads = items.filter(x => x.is_ad_spend).length;
      box.innerHTML = `<div class="cx">
        <section class="cx-sec"><h4>Where each cost comes from</h4>
          <p class="cx-hint">The costs on every order. The brand sets them in Triple Whale and Locus reads them from there every night, so a change there shows up here the next day.</p>
          ${sourcesHTML(d.sources, cur)}</section>
        <section class="cx-sec"><h4>Custom expenses</h4>
          <p class="cx-hint">Costs Triple Whale does not know about: the team, software, rent, agency fees, other marketing. They come off contribution margin to give <b>Net profit</b>. The ones marked <b>counts as ad spend</b> join ad spend instead, so MER, cost per new customer and contribution margin include them.</p>
          ${items.length ? `<p class="cx-sum">${run ? `<b>${money(run, cur)}</b> a month in fixed costs running now` : 'No fixed monthly costs running now'}${vary ? ` · ${vary} that move with sales` : ''}${ads ? ` · ${ads} counted as ad spend` : ''}.</p>` : ''}
          ${items.length ? `<div class="cx-list">${items.map((x, i) => `<div class="cx-it"><div class="cx-m">
              <div class="cx-t">${esc(x.name)} <span class="cx-tag">${esc(catOf(d, x.category).label)}</span>${x.is_ad_spend ? '<span class="cx-tag ad">Counts as ad spend</span>' : ''}${x.end_date && x.end_date < today() ? '<span class="cx-tag old">Ended</span>' : ''}</div>
              <div class="cx-d">${esc(describe(x, cur))}</div>
              <div class="cx-w">${x.added_by ? `Added by ${esc(x.added_by)}` : 'Added before names were kept'}${x.notes ? ` · ${esc(x.notes)}` : ''}</div></div>
              <div class="cx-acts"><button type="button" class="btn btn-s" data-ed="${i}">Edit</button><button type="button" class="btn btn-s" data-rm="${i}" aria-label="Remove ${esc(x.name)}">Remove</button></div></div>`).join('')}</div>`
            : '<div class="cx-empty">No custom expenses yet. Net profit equals contribution margin until you add one.</div>'}
          <div class="cx-add"><button type="button" class="btn primary" data-add>+ Add an expense</button><span class="tiny" data-msg>${esc(msg)}</span></div></section></div>`;
      box.querySelector('[data-add]').onclick = () => form(d, null, v => save([...items, v], `Added ${v.name}. P&L uses it now.`));
      box.querySelectorAll('[data-ed]').forEach(b => b.onclick = () => { const i = +b.dataset.ed; form(d, items[i], v => save(items.map((x, j) => j === i ? { ...v, id: x.id } : x), 'Saved.')); });
      box.querySelectorAll('[data-rm]').forEach(b => b.onclick = async () => {
        const x = items[+b.dataset.rm];
        if (!(await ask(`Remove ${x.name}?`, 'It comes out of every past and future period, the way Triple Whale does it. To stop it from a date instead, edit it and set an end date.', 'Remove'))) return;
        try { await save(items.filter(y => y !== x), `Removed ${x.name}.`); } catch (e) { const el = box.querySelector('[data-msg]'); if (el) { el.textContent = e.message; el.style.color = 'var(--bad)'; } }
      });
    };
    paint();
  }

  /** The Costs page as a sheet (P&L, the margin drill-down, a client login). */
  function open({ act, api, name, onSaved }) {
    css();
    let changed = false;
    const m = modal(`<div class="row" style="align-items:center;gap:8px"><h3 style="margin:0;flex:1">Costs${name ? `: ${esc(name)}` : ''}</h3><button class="btn" data-x="close">Done</button></div><div data-box style="margin-top:14px"></div>`, 'sheet',
      () => { if (changed && onSaved) onSaved(); });
    m.el.querySelector('[data-x="close"]').onclick = m.close;
    mount(m.el.querySelector('[data-box]'), { act, api, onSaved: () => { changed = true; } });
  }

  window.CostsUI = { mount, open };
})();

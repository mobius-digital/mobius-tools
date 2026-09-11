/* Supply - app core: session, state, shell, router, helpers, and the daily
   screens (Today, Reorder + Create order, Orders, Forecast + product sheet).
   The season screens and Settings live in app2.js. Both are plain scripts. */
'use strict';

const WORKER = 'https://mobius-supply.mobius-digital.workers.dev';
const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const S = {
  brand: localStorage.getItem('supply_brand') || 'lucky',
  tab: 'today', state: null, loading: false, err: null,
  sel: new Set(), qty: {},            // Reorder selection + edited quantities (variantId -> qty)
  q: '', filter: 'decide', lineFilter: '', cat: '', perfLine: '', planLine: '', tlFilter: 'all',
  ordersFilter: 'open', open: null, sheetKind: null,
};

/* ---------- session ---------- */
/* Read-only preview: ?devstate=<url of a saved /api/state> renders the app from a
   file with no sign-in and no worker. Saves fail. Used to review screens. */
const DEV_STATE = new URLSearchParams(location.search).get('devstate');
function token() {
  if (DEV_STATE) return 'dev';
  const t = localStorage.getItem('mobius_session'), exp = +localStorage.getItem('mobius_session_exp') || 0;
  if (t && exp > Date.now()) return t;
  return localStorage.getItem('supply_token') || '';
}
const actor = () => localStorage.getItem('mobius_session_email') || (localStorage.getItem('supply_token') ? 'password' : '');
function signOut() {
  ['mobius_session', 'mobius_session_email', 'mobius_session_exp', 'supply_token'].forEach(k => localStorage.removeItem(k));
  S.state = null; render();
}

/* ---------- API ---------- */
async function api(path, opts = {}) {
  const res = await fetch(`${WORKER}${path}${path.includes('?') ? '&' : '?'}brand=${encodeURIComponent(S.brand)}`, {
    method: opts.method || 'GET',
    headers: { 'Authorization': `Bearer ${token()}`, 'Content-Type': 'application/json', 'X-Actor': actor() },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401) throw Object.assign(new Error('unauthorized'), { status: 401 });
  if (!res.ok) throw Object.assign(new Error(data.error || `HTTP ${res.status}`), { status: res.status });
  return data;
}
async function load({ quiet = false } = {}) {
  if (!token()) { S.state = null; render(); return; }
  S.loading = !quiet; S.err = null; if (!quiet) render();
  try {
    S.state = DEV_STATE ? await (await fetch(DEV_STATE)).json() : await api('/api/state');
    $('#connChip').dataset.s = 'live'; $('#connChip').textContent = `Live · ${fmtTime(S.state.generatedAt)}`;
  } catch (e) {
    if (e.status === 401) { localStorage.removeItem('supply_token'); S.state = null; S.err = 'Sign in to continue.'; }
    else { S.err = e.message; $('#connChip').dataset.s = 'down'; $('#connChip').textContent = 'Worker down'; }
  }
  S.loading = false; render();
}
/** Mutate then reload the state in place. Every save refreshes what it invalidated. */
async function save(path, body, method = 'PUT', okMsg = 'Saved') {
  try { const r = await api(path, { method, body }); await load({ quiet: true }); if (okMsg) toast(okMsg); return r; }
  catch (e) { toast(e.message, { kind: 'err' }); throw e; }
}

/* ---------- formatting ---------- */
const st = () => S.state;
const fmtInt = n => n == null ? '—' : Math.round(n).toLocaleString('en-US');
const fmt1 = n => n == null ? '—' : (Math.round(n * 10) / 10).toLocaleString('en-US');
const money = n => n == null ? '—' : (n < 0 ? '-' : '') + '$' + (Math.abs(n) >= 10000 ? Math.round(Math.abs(n) / 1000) + 'k' : Math.abs(n) >= 1000 ? (Math.abs(n) / 1000).toFixed(1) + 'k' : Math.round(Math.abs(n)).toString());
const moneyFull = n => n == null ? '—' : '$' + Math.round(n).toLocaleString('en-US');
function fmtDate(ymd, { year = false } = {}) { if (!ymd) return '—'; const d = new Date(`${ymd}T12:00:00Z`); return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', ...(year ? { year: 'numeric' } : {}), timeZone: 'UTC' }); }
function fmtTime(iso) { if (!iso) return ''; return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'America/Chicago' }) + ' Central'; }
function addDays(ymd, n) { const d = new Date(`${ymd}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }
const daysBetween = (a, b) => Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 86400000);
function fmtDays(n) { if (n == null) return '—'; if (n <= 0) return 'now'; if (n < 60) return `${n} days`; if (n < 365) return `${Math.round(n / 30)} months`; return `${(n / 365).toFixed(1)} years`; }
const plural = (n, w, ws) => `${n} ${n === 1 ? w : (ws || w + 's')}`;

const STATUS = {
  out: ['Out', 'bad'], order: ['Order now', 'bad'], gap: ['Stock gap', 'warn'], soon: ['Coming up', 'warn'], covered: ['On the way', 'good'], ok: ['Fine', 'good'],
  unsorted: ['Unsorted', 'unk'], nosales: ['No sales', 'unk'], drop: ['Limited drop', 'brand'], drop_done: ['Drop sold out', 'brand'], sunset: ['Selling down', 'unk'], dormant: ['No stock, no sales', 'unk'], off: ['Discontinued', 'unk'],
};
const LIFECYCLE = { core: 'Core', seasonal: 'Seasonal', drop: 'Limited drop', winding_down: 'Winding down', discontinued: 'Discontinued' };
const ORDER_STAGES = [['sent', 'Sent'], ['confirmed', 'Confirmed'], ['production', 'In production'], ['shipped', 'Shipped'], ['landed', 'Landed']];
const pill = (kind, text) => `<span class="pill ${kind}"><i></i>${esc(text)}</span>`;
const statusPill = p => { const [t, k] = STATUS[p.status] || [p.status, 'unk']; return pill(k, p.overdue ? 'Overdue' : t); };
const ic = name => `<svg class="ic"><use href="#i-${name}"/></svg>`;
const productById = id => st()?.products.find(p => p.id === String(id));
const lineById = id => st()?.lines.find(l => l.id === id);
const factoryById = id => st()?.factories.find(f => f.id === id);
const productsOf = line => st().products.filter(p => p.lineId === line.id && p.status !== 'off');

/* ---------- shell ---------- */
const TITLES = { today: 'Today', reorder: 'Reorder', orders: 'Orders', forecast: 'Forecast', performance: 'Performance', lineup: 'Lineup plan', timeline: 'Timeline', settings: 'Settings' };
function setTab(t) { S.tab = TITLES[t] ? t : 'today'; location.hash = S.tab; closeSheet(); render(); window.scrollTo({ top: 0 }); }
function title(html, sub, right = '') { $('#hdTitle').innerHTML = html + (sub ? `<span class="sub">${sub}</span>` : ''); $('#hdRight').innerHTML = right; }
function render() {
  $$('#tabs button[data-t], #tabbar button[data-t]').forEach(b => b.classList.toggle('on', b.dataset.t === S.tab));
  $('#btnOut').hidden = !token();
  const m = $('#main');
  if (!token()) { title(''); $('#connChip').dataset.s = 'off'; $('#connChip').textContent = 'Signed out'; m.innerHTML = gateHTML(); wireGate(); return; }
  document.body.classList.remove('gated');
  if (!S.state) {
    title('Supply');
    m.innerHTML = S.err ? `<div class="card sc bd" style="max-width:520px;margin:40px auto"><h3>Cannot reach Supply</h3><div class="hint" style="margin-bottom:12px">${esc(S.err === 'Failed to fetch' ? 'The worker did not answer. Check your connection, then try again.' : S.err)}</div><div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn primary" onclick="load()">Try again</button>${S.err.includes('snapshot') ? `<button class="btn" onclick="runSnapshot()">Run a Shopify snapshot</button>` : ''}<button class="btn quiet" onclick="signOut()">Sign out</button></div></div>` : `<div class="empty">Loading the brand…</div>`;
    return;
  }
  const s = st();
  $('#ctReorder').hidden = !s.headline.toOrder; $('#ctReorder').textContent = s.headline.toOrder;
  $('#ctOrders').hidden = !s.headline.onTheWay; $('#ctOrders').textContent = s.headline.onTheWay;
  const fn = { today: renderToday, reorder: renderReorder, orders: renderOrders, forecast: renderForecast, performance: window.renderPerformance, lineup: window.renderLineup, timeline: window.renderTimeline, settings: window.renderSettings }[S.tab];
  if (fn) fn(m); else m.innerHTML = '';
}
/* gateHTML() lives in gate.js (loaded before this file). */
function wireGate() {
  const go = async () => { const v = $('#gTok').value.trim(); if (!v) return; localStorage.setItem('supply_token', v); await load(); if (!S.state && S.err) { $('#gErr').textContent = S.err.includes('Sign in') ? 'That password is not right.' : S.err; } };
  $('#gGo').onclick = go; $('#gTok').onkeydown = e => { if (e.key === 'Enter') go(); };
}

/* ---------- toast / modal / sheet / tooltip ---------- */
let toastT = null;
function toast(msg, { kind = '', undo = null } = {}) {
  const t = $('#toast'); t.hidden = false; t.style.background = kind === 'err' ? '#9C3A2E' : '#0C161D';
  t.innerHTML = `<span>${esc(msg)}</span>${undo ? '<button id="toastUndo">Undo</button>' : ''}`;
  if (undo) $('#toastUndo').onclick = () => { t.hidden = true; undo(); };
  clearTimeout(toastT); toastT = setTimeout(() => { t.hidden = true; }, undo ? 7000 : 3200);
}
/** In-app modal. Resolves with the field value (or true) on confirm, null on cancel. */
function modal({ title, hint = '', fields = null, value = '', placeholder = '', multiline = false, confirm = 'Save', danger = false, body = '' }) {
  return new Promise(resolve => {
    const m = $('#modal'), box = $('#mbox');
    const fieldsHTML = fields ? `<div class="fields">${fields.map(f => `<div class="field" style="${f.wide ? 'grid-column:1/-1' : ''}"><label>${esc(f.label)}</label>${f.type === 'select' ? `<select data-k="${f.key}">${f.options.map(([v, l]) => `<option value="${esc(v)}" ${String(f.value) === String(v) ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>` : f.type === 'textarea' ? `<textarea data-k="${f.key}" placeholder="${esc(f.placeholder || '')}">${esc(f.value ?? '')}</textarea>` : `<input data-k="${f.key}" type="${f.type || 'text'}" value="${esc(f.value ?? '')}" placeholder="${esc(f.placeholder || '')}" ${f.min != null ? `min="${f.min}"` : ''}>`}${f.help ? `<div class="help">${esc(f.help)}</div>` : ''}</div>`).join('')}</div>`
      : fields === null && (value !== undefined && confirm !== 'OK') ? (multiline ? `<textarea id="mVal" placeholder="${esc(placeholder)}">${esc(value)}</textarea>` : `<input id="mVal" value="${esc(value)}" placeholder="${esc(placeholder)}">`) : '';
    box.innerHTML = `<h3>${esc(title)}</h3>${hint ? `<div class="hint">${hint}</div>` : ''}${body}${fields === false ? '' : fieldsHTML}<div class="actions"><button class="btn" id="mCancel">Cancel</button><button class="btn ${danger ? 'danger' : 'primary'}" id="mOk">${esc(confirm)}</button></div>`;
    m.hidden = false;
    const done = v => { m.hidden = true; resolve(v); };
    $('#mCancel').onclick = () => done(null);
    $('#mOk').onclick = () => { if (fields) { const out = {}; box.querySelectorAll('[data-k]').forEach(el => { out[el.dataset.k] = el.value; }); done(out); } else done($('#mVal') ? $('#mVal').value : true); };
    m.onclick = e => { if (e.target === m) done(null); };
    const first = box.querySelector('input,select,textarea'); if (first) first.focus();
    box.onkeydown = e => { if (e.key === 'Enter' && e.target.tagName !== 'TEXTAREA') $('#mOk').click(); if (e.key === 'Escape') done(null); };
  });
}
function openSheet(html, kind) { S.sheetKind = kind; $('#scrim').hidden = false; $('#sheet').hidden = false; $('#sheetIn').innerHTML = html; $('#sheet').scrollTop = 0; document.body.style.overflow = 'hidden'; }
function closeSheet() { if ($('#sheet').hidden) return; $('#scrim').hidden = true; $('#sheet').hidden = true; S.sheetKind = null; S.open = null; document.body.style.overflow = ''; }
function tipShow(e, html) { let t = $('#tipEl'); if (!t) { t = document.createElement('div'); t.id = 'tipEl'; t.className = 'tip'; document.body.appendChild(t); } t.innerHTML = html; t.style.left = e.clientX + 'px'; t.style.top = e.clientY + 'px'; t.hidden = false; }
function tipHide() { const t = $('#tipEl'); if (t) t.hidden = true; }
document.addEventListener('mouseover', e => { const el = e.target.closest('[data-tip]'); if (el) tipShow(e, el.dataset.tip); });
document.addEventListener('mousemove', e => { const el = e.target.closest('[data-tip]'); if (el) tipShow(e, el.dataset.tip); else tipHide(); });
document.addEventListener('mouseout', e => { if (e.target.closest('[data-tip]')) tipHide(); });

/* ======================================================================
   TODAY
   ====================================================================== */
function renderToday(m) {
  const s = st(), h = s.headline;
  const d = new Date(`${s.today}T12:00:00Z`).toLocaleDateString('en-US', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });
  title(d, `Snapshot ${fmtTime(s.lastRun || s.generatedAt)} · ${plural(s.products.filter(p => p.status !== 'off').length, 'product')} · ${plural(s.historyDays, 'day')} of history${s.historyDays < 365 ? ' (seasonality needs a year)' : ''}`,
    `<button class="btn quiet" onclick="howItWorks()">How Supply decides</button><button class="btn" onclick="newOrder()">${ic('plus')}Log an order</button>`);
  const kinds = { bad: 'bd', warn: 'wn', brand: 'br', unk: 'un', good: 'ok' };
  const goTo = dec => dec.productId ? `openProduct('${dec.productId}')` : dec.orderId ? `openOrder('${dec.orderId}')` : dec.lineId ? `S.planLine='${dec.lineId}';setTab('lineup')` : `setTab('${dec.screen}')`;
  const goLabel = dec => dec.productId ? 'Open the forecast' : dec.orderId ? 'Open the order' : dec.screen === 'lineup' ? 'Open Lineup plan' : dec.screen === 'settings' ? 'Open Settings' : 'Open';
  const onTheWay = s.orders.filter(o => ['sent', 'confirmed', 'production', 'shipped', 'partial'].includes(o.status)).sort((a, b) => (a.expected_at || '9') < (b.expected_at || '9') ? -1 : 1);
  const cats = s.categories.map(c => {
    const ls = s.lines.filter(l => l.categoryId === c.id);
    const ps = s.products.filter(p => ls.some(l => l.id === p.lineId) && p.status !== 'off');
    const vel = ps.reduce((a, p) => a + p.velocity, 0), onHand = ps.reduce((a, p) => a + p.onHand, 0), sold30 = ps.reduce((a, p) => a + p.sold30, 0);
    const wk = vel > 0.001 ? Math.round(onHand / (vel * 7)) : null;
    const worst = ps.filter(p => ['out', 'order', 'gap'].includes(p.status)).length;
    return { c, ps, onHand, sold30, wk, worst, note: worst ? `${plural(worst, 'product')} to order` : wk != null && wk > 78 ? 'heavy on stock' : 'steady' };
  });
  m.innerHTML = `
    <div class="rollup">
      <div class="ru ${h.toOrder ? 'bad' : 'good'}" data-go onclick="setTab('reorder')"><div class="l">To order</div><div class="v">${h.toOrder}<small>products</small></div><div class="s">${h.overdue ? `<b>${h.overdue} overdue</b>${h.orderByLatest ? ` · rest by ${fmtDate(h.orderByLatest)}` : ''}` : h.orderByLatest ? `by <b>${fmtDate(h.orderByLatest)}</b>` : 'nothing due'}</div></div>
      <div class="ru ${h.onTheWay ? 'warn' : ''}" data-go onclick="setTab('orders')"><div class="l">On the way</div><div class="v">${h.onTheWay}<small>orders</small></div><div class="s">${h.nextLanding ? `next lands <b>${fmtDate(h.nextLanding)}</b> · ${fmtInt(h.nextLandingUnits)} units` : 'log an order when you send one'}</div></div>
      <div class="ru" data-tip="Sales lost while a product is sold out before a reorder can land, at today's price"><div class="l">Revenue at risk</div><div class="v">${money(h.revenueAtRisk)}</div><div class="s">${riskNote(s)}</div></div>
      <div class="ru" data-go onclick="setTab('performance')" data-tip="Stock with no sale in 90 days, valued at unit cost from Shopify"><div class="l">Dead stock</div><div class="v">${money(h.dead.cost)}<small>at cost</small></div><div class="s">${fmtInt(h.dead.units)} units · <b>${money(h.dead.retail)}</b> at retail</div></div>
    </div>
    <div class="two">
      <div class="stack">
        <div class="grph"><span>This week</span><span class="ln"></span><span class="ct">${plural(s.decisions.length, 'decision')}</span></div>
        ${s.decisions.length ? s.decisions.map(dec => `<div class="card sc ${kinds[dec.kind] || 'un'} decision"><div><h3>${esc(dec.title)}</h3><div class="hint">${esc(dec.body)}</div></div><button class="btn ${dec.kind === 'bad' ? 'primary' : ''}" onclick="${goTo(dec)}">${goLabel(dec)} ${ic('arrow')}</button></div>`).join('')
          : `<div class="card sc ok"><h3>Nothing needs you this week.</h3><div class="hint">Every core product has enough stock to clear its lead time. Check Lineup plan when the season turns.</div></div>`}
      </div>
      <div class="stack">
        <div class="grph"><span>Landing soon</span><span class="ln"></span></div>
        <div class="card">${onTheWay.length ? onTheWay.slice(0, 4).map(o => landingRow(o)).join('<div style="height:1px;background:#EDF1F4;margin:12px 0"></div>') : `<div class="hint">No orders on the way. When you send one to a factory, <a href="#" onclick="newOrder();return false">log it</a> and it counts as incoming stock in every forecast.</div>`}</div>
        <div class="grph" style="margin-top:6px"><span>Category health</span><span class="ln"></span></div>
        <div class="card flush"><table>
          <tr><th>Category</th><th class="num">Sold 30d</th><th>Weeks of cover</th><th></th></tr>
          ${cats.map(x => `<tr class="click" onclick="S.cat='${x.c.id}';setTab('performance')"><td style="padding-left:18px"><b>${esc(x.c.name)}</b><div class="tiny">${plural(x.ps.length, 'product')} · ${fmtInt(x.onHand)} units</div></td><td class="num">${fmtInt(x.sold30)}</td><td style="width:140px"><div class="bar"><i class="${x.worst ? 'warn' : ''}" style="width:${x.wk == null ? 0 : Math.min(100, x.wk / 52 * 100)}%"></i></div><div class="tiny">${x.wk == null ? 'no sales' : x.wk + ' wk'}</div></td><td class="tiny wrap">${esc(x.note)}</td></tr>`).join('')}
        </table></div>
      </div>
    </div>`;
}
function riskNote(s) {
  const top = s.products.filter(p => p.revenueAtRisk > 0).sort((a, b) => b.revenueAtRisk - a.revenueAtRisk).slice(0, 2);
  if (!top.length) return 'nothing runs out before a reorder could land';
  return top.map(p => `<b>${esc(p.title)}</b> ${money(p.revenueAtRisk)}`).join(' · ');
}
function landingRow(o) {
  const total = o.sent_at && o.expected_at ? Math.max(1, daysBetween(o.sent_at, o.expected_at)) : null;
  const done = total ? Math.min(100, Math.max(0, Math.round(daysBetween(o.sent_at, st().today) / total * 100))) : 0;
  return `<div class="click" style="cursor:pointer" onclick="openOrder('${o.id}')">
    <div style="display:flex;justify-content:space-between;align-items:center;gap:10px"><div><b>${esc(o.productTitles[0] || o.id)}</b>${o.productTitles.length > 1 ? ` <span class="tiny">+${o.productTitles.length - 1}</span>` : ''} <span class="tiny">${fmtInt(o.units)} units · ${esc(o.factoryName || o.id)}</span></div>${orderPill(o)}</div>
    <div class="bar" style="margin:8px 0 6px"><i class="good" style="width:${done}%"></i></div>
    <div style="display:flex;justify-content:space-between" class="tiny"><span>${o.sent_at ? 'Sent ' + fmtDate(o.sent_at) : 'Not sent yet'}</span><span><b style="color:var(--ink)">${o.expected_at ? 'Lands ' + fmtDate(o.expected_at) : 'No date yet'}</b>${o.overdue ? ' · <span style="color:var(--bad)">late</span>' : ''}</span></div></div>`;
}
function orderPill(o) {
  const map = { draft: ['Draft', 'unk'], sent: ['Sent', 'warn'], confirmed: ['Confirmed', 'warn'], production: ['In production', 'warn'], shipped: ['Shipped', 'warn'], partial: ['Partly landed', 'warn'], landed: ['Landed', 'good'], cancelled: ['Cancelled', 'unk'] };
  const [t, k] = map[o.status] || [o.status, 'unk']; return pill(k, t);
}
function howItWorks() {
  modal({ title: 'How Supply decides', fields: false, confirm: 'OK', body: `<div class="hint" style="display:flex;flex-direction:column;gap:8px;line-height:1.5">
    <p><b>Sells per week</b> blends the last 14, 30 and 90 days (45 / 35 / 20 percent), ignores days a size was sold out, and caps a promo spike at twice the 90-day rate. A size that was off the shelf for most of the window gets its demand from the line's size curve, not from its last two sales.</p>
    <p><b>Status is judged on the core sizes</b>, the ones carrying 80% of a product's sales. One empty tail size is a "size gap" note, not a red product. A product is Out only when the sizes at zero carry half its sales.</p>
    <p><b>Order by</b> is the run-out date minus the factory lead time (production, shipping, and ${st().settings.buffer_days} days of buffer). It is the sort key everywhere; "Overdue" means that date has passed.</p>
    <p><b>Suggested</b> is enough to cover ${st().settings.cover_days} days after the order lands, less what is on hand and on the way, split by size or loft from the line's mix, then checked against the minimum order.</p>
    <p><b>Incoming stock</b> counts once an order is sent. Drafts change nothing. The hourly Shopify check notices the count jump when a shipment lands.</p>
    <p><b>Lifecycle</b> (Settings) decides who gets forecast: core and seasonal products do; limited drops, winding-down and discontinued ones do not.</p></div>` });
}

/* ======================================================================
   REORDER + CREATE ORDER
   ====================================================================== */
const ORDERABLE = new Set(['out', 'order', 'gap', 'soon', 'covered', 'ok', 'nosales']);
function reorderRows() {
  const s = st(); const q = S.q.trim().toLowerCase();
  let ps = s.products.filter(p => ORDERABLE.has(p.status) || p.status === 'unsorted');
  if (S.filter === 'now') ps = ps.filter(p => ['out', 'order', 'gap'].includes(p.status));
  else if (S.filter === 'decide') ps = ps.filter(p => ['out', 'order', 'gap', 'soon', 'covered'].includes(p.status) || S.sel.has(p.id));
  if (q) ps = ps.filter(p => (p.title + ' ' + p.variants.map(v => v.sku).join(' ') + ' ' + (p.lineName || '')).toLowerCase().includes(q));
  return ps;
}
function renderReorder(m) {
  const s = st();
  const counts = { now: s.products.filter(p => ['out', 'order', 'gap'].includes(p.status)).length, decide: s.products.filter(p => ['out', 'order', 'gap', 'soon', 'covered'].includes(p.status)).length, all: s.products.filter(p => ORDERABLE.has(p.status) || p.status === 'unsorted').length };
  title('Reorder', 'Sorted by the date you have to act. Grouped by who makes it.', `<button class="btn" onclick="exportReorder()">Export list</button>`);
  const rows = reorderRows();
  const groups = new Map();
  for (const p of rows) { const k = p.factoryId || 'none'; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(p); }
  const selected = [...S.sel].map(productById).filter(Boolean);
  const selUnits = selected.reduce((a, p) => a + selQty(p), 0), selCost = selected.reduce((a, p) => a + selCost1(p), 0);
  const landing = selected.length ? selected.map(p => p.leadDays).filter(x => x != null).reduce((a, b) => Math.max(a, b), 0) : null;
  m.innerHTML = `
    <div class="toolbar">
      <div class="seg"><button class="${S.filter === 'decide' ? 'on' : ''}" onclick="S.filter='decide';render()">Needs a decision<small>${counts.decide}</small></button><button class="${S.filter === 'now' ? 'on' : ''}" onclick="S.filter='now';render()">Order now<small>${counts.now}</small></button><button class="${S.filter === 'all' ? 'on' : ''}" onclick="S.filter='all';render()">Everything<small>${counts.all}</small></button></div>
      <div class="search">${ic('search')}<input id="rq" placeholder="Search products, SKUs, lines" value="${esc(S.q)}" oninput="S.q=this.value;renderRowsOnly()"></div>
      <span class="grow"></span><span class="tiny">Coverage after landing</span><button class="btn sm" onclick="editSetting('cover_days','Coverage after landing (days)','How many days of sales an order should cover once it lands. Longer means bigger, rarer orders.')">${s.settings.cover_days} days ${ic('chev')}</button>
    </div>
    <div id="rrows">${groupsHTML(groups)}</div>
    ${selected.length ? `<div class="actionbar"><span><b>${plural(selected.length, 'product')}</b> selected</span><span>${fmtInt(selUnits)} units</span>${selCost ? `<span>about <b>${money(selCost)}</b> at cost</span>` : ''}${landing ? `<span>lands about <b>${fmtDate(addDays(s.today, landing))}</b> if sent today</span>` : ''}<button class="btn quiet" style="color:#B7C6D1" onclick="S.sel.clear();render()">Clear</button><button class="btn primary" onclick="createOrder()">Create order ${ic('arrow')}</button></div>` : ''}`;
}
function renderRowsOnly() { const rows = reorderRows(); const groups = new Map(); for (const p of rows) { const k = p.factoryId || 'none'; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(p); } $('#rrows').innerHTML = groupsHTML(groups); }
function groupsHTML(groups) {
  if (!groups.size) return `<div class="card"><div class="empty"><b>Nothing here</b>Try another filter, or clear the search.</div></div>`;
  return [...groups.entries()].map(([fid, ps]) => {
    const f = factoryById(fid);
    const win = f ? `${fmtDate(f.nextWindow.from)} to ${fmtDate(f.nextWindow.to)}` : '';
    const inWin = f && f.nextWindow.from <= addDays(st().today, 14);
    return `<div class="card flush">
      <div class="card-hd"><div><b>${esc(f ? f.name : 'No factory yet')}</b><div class="tiny">${f ? `${f.production_days} + ${f.shipping_days} day lead, ${st().settings.buffer_days} day buffer · order window every ${f.order_cycle_days} days${f.moq_default ? ` · minimum order (MOQ) ${f.moq_default}` : ''}` : 'Give these products a line and a factory in Settings.'}</div></div>
        ${f ? `<span class="pill ${inWin ? 'brand' : 'unk'}" style="margin-left:auto"><i></i>Next order window ${win}</span>` : ''}</div>
      <div class="tbl-wrap"><table>
        <tr><th style="width:44px"></th><th>Product</th><th class="num">On hand</th><th class="num">Incoming</th><th class="num">Sells / wk</th><th>Runs out</th><th>Order by</th><th class="num">Suggested</th><th class="num">At cost</th><th>MOQ</th></tr>
        ${ps.map(p => reorderRow(p)).join('')}
      </table></div></div>`;
  }).join('');
}
function reorderRow(p) {
  const k = ['out', 'order', 'gap'].includes(p.status) ? '' : ['soon'].includes(p.status) ? 'w' : 'g';
  const runOut = p.status === 'out' ? pill('bad', 'Out now') : p.runOutDays == null ? '—' : pill(p.runOutDays <= (p.leadDays || 0) ? 'bad' : p.runOutDays <= (p.leadDays || 0) + 60 ? 'warn' : 'good', `${fmtDays(p.runOutDays)} · ${fmtDate(p.runOutDate)}`);
  const orderBy = p.overdue || p.status === 'out' ? `<b style="color:var(--bad)">Overdue</b>${p.orderByDate ? `<div class="tiny">was ${fmtDate(p.orderByDate)}</div>` : ''}` : p.orderByDate ? `<b>${fmtDate(p.orderByDate)}</b>` : '—';
  const notes = [];
  if (p.status === 'gap') notes.push(`${fmtInt(p.incoming)} on the way lands ${fmtDate(p.incomingLands)}, after the run-out`);
  else if (p.incoming) notes.push(`${fmtInt(p.incoming)} on the way, lands ${fmtDate(p.incomingLands)}`);
  if (p.sizeGap.length) notes.push(`size gap: ${p.sizeGap.slice(0, 4).join(', ')}${p.sizeGap.length > 4 ? '…' : ''}`);
  if (p.coreCount < p.variants.length && p.variants.length > 1) notes.push(`${p.coreCount} of ${p.variants.length} ${p.axis === 'loft_hand' ? 'lofts' : 'sizes'} carry 80% of sales`);
  if (p.trend === 'rising' || p.trend === 'spiking') notes.push(`${p.trend} on the month`); else if (p.trend === 'falling') notes.push('falling on the month');
  const flags = `${p.lifecycle !== 'core' ? ' ' + pill('brand', LIFECYCLE[p.lifecycle]) : ''}${p.thin ? ' ' + pill('unk', 'Thin data') : ''}${p.decision === 'cut' ? ' ' + pill('unk', 'Cut') : ''}`;
  const sel = S.sel.has(p.id);
  return `<tr class="stripe ${k} click ${p.decision === 'cut' ? 'dim' : ''}" onclick="openProduct('${p.id}')">
    <td style="padding-left:18px" onclick="event.stopPropagation();toggleSel('${p.id}')"><span class="ck ${sel ? 'on' : ''}"></span></td>
    <td><b>${esc(p.title)}</b>${flags}<div class="tiny wrap">${esc(notes.join(' · ') || (p.lineName || ''))}</div></td>
    <td class="num">${p.oversold ? `<span style="color:var(--bad);font-weight:700">-${p.oversold}</span>` : fmtInt(p.onHand)}</td>
    <td class="num">${p.incoming ? fmtInt(p.incoming) : '0'}</td>
    <td class="num">${fmt1(p.perWeek)}</td>
    <td>${runOut}</td><td>${orderBy}</td>
    <td class="num">${p.suggested ? `<b>${fmtInt(selQty(p))}</b>${p.variants.length > 1 ? `<div class="tiny">by ${p.axis === 'loft_hand' ? 'loft' : p.axis === 'none' ? 'variant' : 'size'}</div>` : ''}` : '—'}</td>
    <td class="num">${p.suggested && p.cost != null ? money(selCost1(p)) : '—'}</td>
    <td>${p.moq ? (p.moqMet ? pill('good', 'Met') : pill('warn', `Under ${p.moq}`)) : ''}</td></tr>`;
}
function selQty(p) { return p.variants.reduce((a, v) => a + (S.qty[v.id] ?? v.suggested ?? 0), 0); }
function selCost1(p) { return p.variants.reduce((a, v) => a + (S.qty[v.id] ?? v.suggested ?? 0) * (v.cost ?? p.cost ?? 0), 0); }
function toggleSel(id) { S.sel.has(id) ? S.sel.delete(id) : S.sel.add(id); render(); }
async function editSetting(key, label, help) {
  const v = await modal({ title: label, hint: help, value: st().settings[key] ?? '' });
  if (v == null || v === '') return;
  await save('/api/settings', { [key]: Number(v) });
}
function exportReorder() {
  const rows = reorderRows();
  const lines = ['Product,Line,Factory,On hand,Incoming,Sells per week,Runs out,Order by,Suggested,At cost,Status'];
  for (const p of rows) lines.push([p.title, p.lineName, p.factoryName, p.onHand, p.incoming, p.perWeek, p.runOutDate || '', p.orderByDate || '', p.suggested, p.atCost != null ? Math.round(p.atCost) : '', STATUS[p.status]?.[0] || p.status].map(x => `"${String(x ?? '').replace(/"/g, '""')}"`).join(','));
  const blob = new Blob([lines.join('\n')], { type: 'text/csv' }); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `supply-reorder-${st().today}.csv`; a.click();
}

/** The Create-order drawer: one order per factory from the selected products. */
function createOrder(prefill = null) {
  const s = st();
  const selected = prefill || [...S.sel].map(productById).filter(Boolean);
  if (!selected.length) return;
  const byFactory = new Map();
  for (const p of selected) { const k = p.factoryId || 'none'; if (!byFactory.has(k)) byFactory.set(k, []); byFactory.get(k).push(p); }
  const [fid, ps] = [...byFactory.entries()][0];
  const rest = [...byFactory.entries()].slice(1);
  const f = factoryById(fid);
  const lead = Math.max(...ps.map(p => p.leadDays || 0));
  const draft = { factory_id: f?.id || null, sent_at: s.today, expected_at: addDays(s.today, lead), notes: '' };
  const linesHTML = ps.map(p => `
    <div class="panel"><div style="display:flex;justify-content:space-between;align-items:baseline;gap:10px"><h4>${esc(p.title)}</h4><span class="tiny">${p.moq ? `minimum ${p.moq} · <span id="moq-${p.id}"></span>` : 'no minimum'}</span></div>
      <table style="font-size:13px"><tr><th>${p.axis === 'loft_hand' ? 'Loft' : p.axis === 'none' ? 'Variant' : 'Size'}</th><th class="num">On hand</th><th class="num">Runs out</th><th class="num">Need</th><th class="num" style="width:100px">Order</th></tr>
        ${p.variants.map(v => `<tr><td>${esc(v.axis || v.sku || v.title || '—')}${v.isCore ? '' : ' <span class="tiny">tail</span>'}</td><td class="num">${v.onHand}</td><td class="num">${v.runOutDays == null ? '—' : fmtDays(v.runOutDays)}</td><td class="num">${v.suggested}</td><td class="num"><input class="qty ${(S.qty[v.id] ?? v.suggested) ? '' : 'zero'}" type="number" min="0" value="${S.qty[v.id] ?? v.suggested}" data-v="${v.id}" data-p="${p.id}" oninput="S.qty['${v.id}']=Math.max(0,+this.value||0);this.classList.toggle('zero',!(+this.value));orderTotals()"></td></tr>`).join('')}
      </table>${p.moq ? `<div style="margin-top:6px"><button class="btn sm" onclick="fillToMoq('${p.id}')">Fill to ${p.moq} by ${p.axis === 'loft_hand' ? 'loft mix' : 'size curve'}</button></div>` : ''}</div>`).join('');
  openSheet(`
    <div class="sh-top"><div><h3>New order to ${esc(f ? f.name : 'a factory')}</h3><div class="sm">${plural(ps.length, 'product')} · lead time ${lead} days · lands about ${fmtDate(draft.expected_at)} if sent today${rest.length ? ` · ${rest.reduce((a, [, x]) => a + x.length, 0)} more selected products belong to another factory and get their own order next` : ''}</div></div>
      <div class="sh-nav"><button onclick="closeSheet()" title="Close">${ic('x')}</button></div></div>
    <div class="fields"><div class="field"><label>Send date</label><input type="date" id="oSent" value="${draft.sent_at}" max="${s.today}" onchange="orderDates()"></div><div class="field"><label>Expected landing</label><input type="date" id="oExp" value="${draft.expected_at}"><div class="help">From the factory lead time. Change it when they confirm.</div></div></div>
    ${linesHTML}
    <div class="field"><label>Note to the factory</label><textarea id="oNotes" placeholder="Same specs as the last order…"></textarea></div>
    <div class="sh-foot"><div><b id="oUnits"></b><div class="tiny" id="oCost"></div></div><span class="grow" style="flex:1"></span><button class="btn" onclick="submitOrder('draft')">Save as draft</button><button class="btn primary" onclick="submitOrder('sent')">Copy order text and mark sent ${ic('arrow')}</button></div>`, 'order-new');
  S.open = { ps, f, rest: rest.map(([, x]) => x).flat() };
  orderTotals();
}
function orderDates() { const sent = $('#oSent').value; if (!sent || !S.open) return; const lead = Math.max(...S.open.ps.map(p => p.leadDays || 0)); $('#oExp').value = addDays(sent, lead); }
function orderTotals() {
  if (!S.open) return;
  let units = 0, cost = 0;
  for (const p of S.open.ps) { const u = selQty(p); units += u; cost += selCost1(p); const el = $(`#moq-${p.id}`); if (el) el.innerHTML = u >= p.moq ? '<span style="color:var(--good)">met</span>' : `<span style="color:var(--warn)">${p.moq - u} short</span>`; }
  $('#oUnits').textContent = `${fmtInt(units)} units`; $('#oCost').textContent = cost ? `about ${money(cost)} at cost · ${plural(S.open.ps.length, 'line')}` : `${plural(S.open.ps.length, 'line')}`;
}
/** Split the minimum across variants by the line's mix, never below a variant's own need. */
function fillToMoq(pid) {
  const p = productById(pid); const line = lineById(p.lineId); const curve = line?.sizeCurve || {};
  const base = p.variants.map(v => ({ v, need: S.qty[v.id] ?? v.suggested, share: curve[v.sizeKey] ?? (1 / p.variants.length) }));
  const mass = base.reduce((a, x) => a + x.share, 0) || 1;
  let total = 0;
  for (const x of base) { x.q = Math.max(x.need, Math.round(p.moq * x.share / mass)); total += x.q; }
  while (total < p.moq) { const top = base.reduce((m, x) => x.share > m.share ? x : m); top.q++; total++; }
  for (const x of base) { S.qty[x.v.id] = x.q; const inp = $(`input[data-v="${x.v.id}"]`); if (inp) { inp.value = x.q; inp.classList.toggle('zero', !x.q); } }
  orderTotals();
}
function orderText(ps, f, sent, exp, notes) {
  const out = [`Purchase order to ${f ? f.name : 'factory'} · ${fmtDate(sent, { year: true })}`, `Requested landing: ${fmtDate(exp, { year: true })}`, ''];
  for (const p of ps) {
    const ls = p.variants.filter(v => (S.qty[v.id] ?? v.suggested) > 0);
    if (!ls.length) continue;
    out.push(`${p.title} (${ls.reduce((a, v) => a + (S.qty[v.id] ?? v.suggested), 0)} units)`);
    for (const v of ls) out.push(`  ${v.sku || v.axis || v.title}${v.axis && v.sku ? ` · ${v.axis}` : ''}: ${S.qty[v.id] ?? v.suggested}`);
    out.push('');
  }
  if (notes) out.push(`Notes: ${notes}`);
  return out.join('\n');
}
async function submitOrder(status) {
  const { ps, f, rest } = S.open;
  const sent = $('#oSent').value, exp = $('#oExp').value, notes = $('#oNotes').value;
  const lines = ps.flatMap(p => p.variants.map(v => ({ variant_id: v.id, product_id: p.id, qty: S.qty[v.id] ?? v.suggested, unit_cost: v.cost ?? p.cost ?? null })).filter(l => l.qty > 0));
  if (!lines.length) { toast('Every quantity is zero.', { kind: 'err' }); return; }
  if (status === 'sent') { try { await navigator.clipboard.writeText(orderText(ps, f, sent, exp, notes)); } catch { /* clipboard may be blocked; the order is still recorded */ } }
  const r = await save('/api/orders', { factory_id: f?.id || null, status, sent_at: sent, expected_at: exp, notes, lines }, 'POST', status === 'sent' ? 'Order recorded and copied to the clipboard' : 'Draft saved');
  for (const p of ps) S.sel.delete(p.id);
  closeSheet();
  if (rest.length) createOrder(rest); else { S.tab = 'orders'; location.hash = 'orders'; render(); if (r?.id) openOrder(r.id); }
}
/** "Log an order": an order you already sent, typed in by hand. */
async function newOrder() {
  const s = st();
  const ps = s.products.filter(p => p.status !== 'off');
  const pick = await modal({ title: 'Log an order you already sent', hint: 'Pick the product; the next screen takes the quantities and dates. One product per order to start; add more lines from the order itself.', fields: [
    { key: 'pid', label: 'Product', type: 'select', options: ps.sort((a, b) => a.title.localeCompare(b.title)).map(p => [p.id, p.title]) }] , confirm: 'Next' });
  if (!pick) return;
  const p = productById(pick.pid); if (!p) return;
  S.sel = new Set([p.id]); for (const v of p.variants) S.qty[v.id] = 0;
  createOrder([p]);
}

/* ======================================================================
   ORDERS
   ====================================================================== */
const OPEN_STATUSES = ['sent', 'confirmed', 'production', 'shipped', 'partial'];
function renderOrders(m) {
  const s = st();
  const open = s.orders.filter(o => OPEN_STATUSES.includes(o.status)), drafts = s.orders.filter(o => o.status === 'draft'), landed = s.orders.filter(o => o.status === 'landed'), all = s.orders;
  const list = { open, drafts, landed, all }[S.ordersFilter] || open;
  title('Orders', 'Every purchase order, where it is, and what it does to the forecast.', `<button class="btn" onclick="newOrder()">${ic('plus')}Log an order</button>`);
  m.innerHTML = `
    <div class="seg"><button class="${S.ordersFilter === 'open' ? 'on' : ''}" onclick="S.ordersFilter='open';render()">Open<small>${open.length}</small></button><button class="${S.ordersFilter === 'drafts' ? 'on' : ''}" onclick="S.ordersFilter='drafts';render()">Drafts<small>${drafts.length}</small></button><button class="${S.ordersFilter === 'landed' ? 'on' : ''}" onclick="S.ordersFilter='landed';render()">Landed<small>${landed.length}</small></button><button class="${S.ordersFilter === 'all' ? 'on' : ''}" onclick="S.ordersFilter='all';render()">All</button></div>
    <div class="card flush">${list.length ? `<div class="tbl-wrap"><table>
      <tr><th>Order</th><th>Factory</th><th>Sent</th><th>Expected</th><th class="num">Units</th><th class="num">At cost</th><th style="width:440px">Stage</th></tr>
      ${list.map(o => `<tr class="click ${o.status === 'draft' ? 'dim' : ''}" onclick="openOrder('${o.id}')"><td style="padding-left:18px"><b>${esc(o.id)}</b><div class="tiny wrap">${esc(o.productTitles.slice(0, 2).join(', '))}${o.productTitles.length > 2 ? ` +${o.productTitles.length - 2}` : ''}</div></td><td>${esc(o.factoryName || '—')}</td><td>${o.sent_at ? fmtDate(o.sent_at) : '<span class="tiny">not sent</span>'}</td><td>${o.expected_at ? `<b>${fmtDate(o.expected_at)}</b><div class="tiny">${o.daysToLanding != null ? (o.daysToLanding < 0 ? `${-o.daysToLanding} days late` : `${o.daysToLanding} days`) : ''}</div>` : '—'}</td><td class="num">${fmtInt(o.units)}${o.received ? `<div class="tiny">${fmtInt(o.received)} received</div>` : ''}</td><td class="num">${o.atCost ? money(o.atCost) : '—'}</td><td>${o.status === 'draft' ? '<span class="tiny">Drafts do not count as incoming stock.</span>' : o.status === 'cancelled' ? pill('unk', 'Cancelled') : stepper(o)}</td></tr>`).join('')}
    </table></div>` : `<div class="empty"><b>${S.ordersFilter === 'open' ? 'Nothing on the way' : 'Nothing here'}</b>${S.ordersFilter === 'open' ? 'When you send an order to a factory, log it here and every forecast counts it as incoming.' : ''}</div>`}</div>`;
}
function stepper(o) {
  const idx = { sent: 0, confirmed: 1, production: 2, shipped: 3, partial: 3, landed: 4 }[o.status] ?? -1;
  return `<div class="step">${ORDER_STAGES.map(([k, l], i) => `${i ? `<em class="${i <= idx ? 'done' : ''}"></em>` : ''}<span class="${i < idx ? 'done' : i === idx ? 'now' : ''}">${o.status === 'partial' && k === 'shipped' ? 'Partly landed' : l}</span>`).join('')}</div>`;
}
function openOrder(id) {
  const o = st().orders.find(x => x.id === id); if (!o) return;
  S.open = { orderId: id };
  const editable = o.status !== 'landed' && o.status !== 'cancelled';
  const next = { draft: ['sent', 'Mark sent'], sent: ['confirmed', 'Mark confirmed'], confirmed: ['production', 'Mark in production'], production: ['shipped', 'Mark shipped'], shipped: ['landed', 'Mark landed'], partial: ['landed', 'Mark fully landed'] }[o.status];
  const afterLanding = o.lines.map(l => ({ ...l, after: (l.onHand ?? 0) + Math.max(0, l.qty - l.received) }));
  openSheet(`
    <div class="sh-top"><div><h3>${esc(o.id)} <span style="color:var(--brand-ink)">· ${esc(o.productTitles[0] || '')}</span>${o.productTitles.length > 1 ? ` <span class="sm">+${o.productTitles.length - 1}</span>` : ''}</h3><div class="sm">${esc(o.factoryName || 'no factory')} · ${fmtInt(o.units)} units${o.atCost ? ` · ${money(o.atCost)} at cost` : ''} · ${orderPill(o)}</div></div>
      <div class="sh-nav"><button onclick="closeSheet()" title="Close">${ic('x')}</button></div></div>
    ${o.status !== 'draft' && o.status !== 'cancelled' ? `<div>${stepper(o)}</div>` : ''}
    <div class="fields">
      <div class="field"><label>Sent</label><input type="date" id="odSent" value="${o.sent_at || ''}" ${editable ? '' : 'disabled'}></div>
      <div class="field"><label>Expected landing</label><input type="date" id="odExp" value="${o.expected_at || ''}" ${editable ? '' : 'disabled'}></div>
      <div class="field"><label>Deposit</label><input id="odDep" value="${esc(o.deposit || '')}" placeholder="50% paid 27 Aug"></div>
      <div class="field"><label>Tracking</label><input id="odTrk" value="${esc(o.tracking || '')}" placeholder="Carrier and number"></div>
      <div class="field" style="grid-column:1/-1"><label>Notes</label><textarea id="odNotes">${esc(o.notes || '')}</textarea></div>
    </div>
    <div class="panel"><h4>Lines</h4><div class="sub">${editable ? 'Received counts can be entered as boxes arrive; the remainder stays on the way.' : 'Landed.'}</div>
      <div class="tbl-wrap"><table style="font-size:13px"><tr><th>Product</th><th>Variant</th><th class="num">Ordered</th><th class="num">Received</th><th class="num">On hand now</th><th class="num">After landing</th></tr>
        ${afterLanding.map(l => `<tr><td>${esc(l.productTitle)}</td><td>${esc(l.axis || l.sku)}</td><td class="num"><input class="qty" type="number" min="0" value="${l.qty}" data-qty="${l.variant_id}" ${editable ? '' : 'disabled'}></td><td class="num"><input class="qty ${l.received ? '' : 'zero'}" type="number" min="0" value="${l.received}" data-rec="${l.variant_id}" ${editable ? '' : 'disabled'}></td><td class="num">${l.onHand == null ? '—' : l.onHand < 0 ? `<span style="color:var(--bad);font-weight:700">${l.onHand}</span>` : l.onHand}</td><td class="num">${fmtInt(l.after)}</td></tr>`).join('')}
      </table></div></div>
    <div class="card sc wn" style="margin-top:4px"><h3>Landing detection</h3><div class="hint">The hourly Shopify check watches these variants. When the count jumps by about half the ordered quantity it marks the order landed and asks you to confirm.</div></div>
    <div class="sh-foot" style="flex-wrap:wrap">
      <button class="btn" onclick="saveOrder()">Save changes</button>
      ${next ? `<button class="btn primary" onclick="advanceOrder('${next[0]}')">${next[1]} ${ic('arrow')}</button>` : ''}
      ${o.status === 'shipped' || o.status === 'partial' ? `<button class="btn" onclick="advanceOrder('partial')">Save as partly landed</button>` : ''}
      <span style="flex:1"></span>
      ${editable ? `<button class="btn quiet danger" onclick="cancelOrder()">Cancel order</button>` : ''}
      ${o.status === 'draft' || o.status === 'cancelled' ? `<button class="btn quiet danger" onclick="deleteOrder()">Delete</button>` : ''}
    </div>`, 'order');
}
function orderPatch() {
  const lines = st().orders.find(o => o.id === S.open.orderId).lines.map(l => ({ variant_id: l.variant_id, product_id: l.product_id, qty: +($(`input[data-qty="${l.variant_id}"]`)?.value ?? l.qty), received: +($(`input[data-rec="${l.variant_id}"]`)?.value ?? l.received), unit_cost: l.unit_cost }));
  return { sent_at: $('#odSent').value || null, expected_at: $('#odExp').value || null, deposit: $('#odDep').value, tracking: $('#odTrk').value, notes: $('#odNotes').value, lines };
}
async function saveOrder() { const id = S.open.orderId; await save(`/api/orders/${id}`, orderPatch()); openOrder(id); }
async function advanceOrder(status) {
  const id = S.open.orderId; const body = { ...orderPatch(), status };
  if (status === 'landed') { const ok = await modal({ title: 'Mark this order landed?', hint: 'Every line is marked fully received unless you changed the received counts. The stock should already show in Shopify.', fields: false, confirm: 'Mark landed' }); if (!ok) return; if (!body.lines.some(l => l.received)) body.lines = body.lines.map(l => ({ ...l, received: l.qty })); }
  await save(`/api/orders/${id}`, body, 'PUT', status === 'landed' ? 'Landed' : 'Updated'); openOrder(id);
}
async function cancelOrder() { const id = S.open.orderId; const ok = await modal({ title: 'Cancel this order?', hint: 'It stops counting as incoming stock. The record stays for the history.', fields: false, confirm: 'Cancel order', danger: true }); if (!ok) return; await save(`/api/orders/${id}`, { status: 'cancelled' }); closeSheet(); }
async function deleteOrder() { const id = S.open.orderId; const ok = await modal({ title: 'Delete this order?', hint: 'Gone for good. Only drafts and cancelled orders can be deleted.', fields: false, confirm: 'Delete', danger: true }); if (!ok) return; await save(`/api/orders/${id}`, null, 'DELETE', 'Deleted'); closeSheet(); }

/* ======================================================================
   FORECAST (product list + product sheet)
   ====================================================================== */
function renderForecast(m) {
  const s = st(); const q = S.q.trim().toLowerCase();
  let ps = s.products.filter(p => p.status !== 'off');
  if (S.lineFilter) ps = ps.filter(p => p.lineId === S.lineFilter);
  if (q) ps = ps.filter(p => (p.title + ' ' + p.variants.map(v => v.sku).join(' ')).toLowerCase().includes(q));
  title('Forecast', 'Every product: how fast it sells, when it runs out, when to order. Click one for its chart and what-if.', '');
  m.innerHTML = `
    <div class="toolbar">
      <div class="search">${ic('search')}<input placeholder="Search products, SKUs" value="${esc(S.q)}" oninput="S.q=this.value;render();this.focus();this.setSelectionRange(99,99)"></div>
      <select class="btn" onchange="S.lineFilter=this.value;render()"><option value="">All lines</option>${s.lines.map(l => `<option value="${l.id}" ${S.lineFilter === l.id ? 'selected' : ''}>${esc(l.categoryName)} · ${esc(l.name)}</option>`).join('')}</select>
    </div>
    <div class="card flush"><div class="tbl-wrap"><table>
      <tr><th>Product</th><th>Line</th><th class="num">On hand</th><th class="num">Incoming</th><th class="num">Sells / wk</th><th>Trend</th><th>Runs out</th><th>Order by</th><th>Status</th></tr>
      ${ps.map(p => `<tr class="click" onclick="openProduct('${p.id}')"><td style="padding-left:18px"><b>${esc(p.title)}</b>${p.lifecycle !== 'core' ? ' ' + pill('brand', LIFECYCLE[p.lifecycle]) : ''}${p.thin ? ' ' + pill('unk', 'Thin data') : ''}<div class="tiny">${plural(p.variants.length, 'variant')}${p.sizeGap.length ? ` · size gap: ${esc(p.sizeGap.slice(0, 3).join(', '))}` : ''}</div></td><td class="tiny">${esc(p.lineName || 'unsorted')}</td><td class="num">${fmtInt(p.onHand)}</td><td class="num">${p.incoming || '0'}</td><td class="num">${fmt1(p.perWeek)}</td><td class="tiny">${esc(p.trend)}</td><td>${p.runOutDays == null ? '—' : `${fmtDays(p.runOutDays)}<div class="tiny">${fmtDate(p.runOutDate)}</div>`}</td><td>${p.overdue ? '<b style="color:var(--bad)">Overdue</b>' : p.orderByDate ? fmtDate(p.orderByDate) : '—'}</td><td>${statusPill(p)}</td></tr>`).join('')}
    </table></div></div>`;
}

/** The product sheet: stats, projection chart, what-if, why-this-number, variants, lifecycle. */
function openProduct(id, variantId = null) {
  const s = st(); const p = productById(id); if (!p) return;
  S.open = { productId: id, variantId, what: S.open?.productId === id ? S.open.what : null };
  const v = variantId ? p.variants.find(x => x.id === variantId) : null;
  const subject = v || p;
  const lead = p.leadDays;
  const what = S.open.what || { qty: p.suggested || 100, sent: s.today };
  const lands = lead != null ? addDays(what.sent, lead) : null;
  const gapDays = lands && subject.runOutDate && lands > subject.runOutDate ? daysBetween(subject.runOutDate, lands) : 0;
  const lastsDays = subject.velocity > 0.001 ? Math.round(what.qty / subject.velocity) : null;
  const orderStat = p.status === 'out' || p.overdue ? ['Order by', 'Overdue', '', p.orderByDate ? `was ${fmtDate(p.orderByDate)}${p.lostUnits ? ` · every week adds ${Math.round(p.velocity * 7)} lost sales` : ''}` : 'no run-out date', 'bd'] : ['Order by', p.orderByDate ? fmtDate(p.orderByDate) : '—', '', lead != null ? `lead time ${lead} days` : 'no factory yet', ''];
  const stats = [
    ['On hand', fmtInt(Math.max(0, subject.onHand)), v ? '' : 'units', v ? 'this variant' : `across ${plural(p.variants.length, 'variant')}${p.oversold ? ` · oversold by ${p.oversold}` : ''}`, p.oversold ? 'bd' : ''],
    ['Sells', fmt1(subject.velocity * 7), 'a week', trendText(p), ''],
    ['Runs out', subject.runOutDays == null ? '—' : fmtDate(subject.runOutDate), '', subject.runOutDays == null ? 'no meaningful sales' : subject.runOutDays <= 0 ? 'out now' : `in ${fmtDays(subject.runOutDays)}`, ''],
    orderStat,
    ['Suggested', fmtInt(v ? v.suggested : p.suggested), 'units', `covers ${s.settings.cover_days} days after landing`, ''],
  ];
  openSheet(`
    <div class="sh-top"><img src="${esc(p.image || '')}" onerror="this.style.visibility='hidden'" alt=""><div><h3>${esc(p.title)}${v ? ` <span style="color:var(--brand-ink)">· ${esc(v.axis || v.sku)}</span>` : ''}</h3><div class="sm">${esc(p.lineName || 'unsorted')} · ${esc(p.factoryName || 'no factory')} · ${LIFECYCLE[p.lifecycle]} · ${statusPill(p)}${p.thin ? ' ' + pill('unk', 'Thin data') : ''}</div></div>
      <div class="sh-nav">${v ? `<button onclick="openProduct('${p.id}')" title="All variants">${ic('back')}</button>` : ''}<button onclick="closeSheet()" title="Close">${ic('x')}</button></div></div>
    <div class="card flush statrow" style="padding:0">${stats.map(([l, val, u, sub, k]) => `<div class="stat ${k || ''}"><div class="l">${l}</div><div class="v">${val}${u ? ` <small>${u}</small>` : ''}</div><div class="s">${sub || '&nbsp;'}</div></div>`).join('')}</div>
    ${p.oversold ? `<div class="card sc bd"><h3>Oversold by ${p.oversold}</h3><div class="hint">Shopify shows negative stock on ${p.variants.filter(x => x.onHand < 0).map(x => x.axis || x.sku).join(', ')}. Those units are owed to customers and come off the next delivery first.</div></div>` : ''}
    <div class="panel"><h4>Stock from today</h4><div class="sub">Solid: what happens if you do nothing. Dashed: if you send ${fmtInt(what.qty)} on ${fmtDate(what.sent)}. Hover for the numbers.</div>${projectionSVG(p, subject, what, lands)}</div>
    <div class="panel"><h4>What if</h4>
      <div style="display:grid;grid-template-columns:1fr 1fr auto;gap:10px;align-items:end"><div class="field"><label>Order</label><input type="number" id="wQty" value="${what.qty}" min="0"></div><div class="field"><label>Send on</label><input type="date" id="wSent" value="${what.sent}"></div><button class="btn" onclick="S.open.what={qty:+$('#wQty').value||0,sent:$('#wSent').value||st().today};openProduct('${p.id}'${v ? `,'${v.id}'` : ''})">Update</button></div>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:8px;margin-top:10px;font-size:13px">
        <div><div class="tiny">Lands</div><b>${lands ? fmtDate(lands) : '—'}</b></div><div><div class="tiny">Sold out for</div><b style="color:${gapDays ? 'var(--bad)' : 'var(--good)'}">${gapDays ? `${gapDays} days` : 'no gap'}</b></div><div><div class="tiny">Lasts until</div><b>${lands && lastsDays != null ? fmtDate(addDays(lands, lastsDays)) : '—'}</b></div><div><div class="tiny">Cost</div><b>${subject.cost != null || p.cost != null ? money(what.qty * (subject.cost ?? p.cost)) : '—'}</b></div></div>
      ${gapDays > 14 ? `<div class="card sc wn" style="margin-top:12px"><h3>Sell the gap on pre-order</h3><div class="hint">${gapDays} days sold out is locked in now. Switch the sold-out sizes to keep selling in Shopify with "${lands ? fmtDate(lands) : ''}" on the product page, then switch back when the order lands. Supply will do this from here in a later phase; today it is a reminder.</div></div>` : ''}
    </div>
    <div class="panel"><h4>Why ${fmt1(subject.velocity * 7)} a week</h4><div class="sub">${v ? whyVariant(v) : `Blend of three windows, weighted to the recent ones, ignoring days a size was sold out. ${p.coreCount < p.variants.length ? `${p.coreCount} of ${p.variants.length} variants carry 80% of sales and set the product's status; the rest are tail sizes.` : ''}`}</div>
      ${v ? '' : `<table style="font-size:13px"><tr><th>${p.axis === 'loft_hand' ? 'Loft' : p.axis === 'none' ? 'Variant' : 'Size'}</th><th class="num">On hand</th><th class="num">14d</th><th class="num">30d</th><th class="num">90d</th><th class="num">Per week</th><th class="num">Runs out</th><th class="num">Need</th><th></th></tr>
        ${p.variants.map(x => `<tr class="click" onclick="openProduct('${p.id}','${x.id}')"><td>${esc(x.axis || x.sku || x.title || '—')}${x.isCore ? '' : ' <span class="tiny">tail</span>'}${x.curveBased ? ' <span class="tiny" data-tip="Demand estimated from the line\'s size curve: this size was off the shelf most of the window">curve</span>' : x.capped ? ' <span class="tiny" data-tip="Raw rate was inflated by sold-out days and has been capped">capped</span>' : ''}</td><td class="num">${x.onHand < 0 ? `<span style="color:var(--bad)">${x.onHand}</span>` : x.onHand}</td><td class="num">${x.sold14}</td><td class="num">${x.sold30}</td><td class="num">${x.sold90}</td><td class="num"><b>${fmt1(x.velocity * 7)}</b></td><td class="num">${x.runOutDays == null ? '—' : x.onHand <= 0 ? '<span style="color:var(--bad)">out</span>' : fmtDays(x.runOutDays)}</td><td class="num">${x.suggested || '—'}</td><td class="tiny">${x.incoming ? `+${x.incoming} ${fmtDate(x.incomingLands)}` : ''}</td></tr>`).join('')}</table>`}
    </div>
    <div class="panel"><h4>Daily sales, last 90 days</h4><div class="sub">${v ? 'This variant.' : 'All variants.'} Darker bars are the last 14 days.</div>${salesSVG(v ? v.series : p.variants.reduce((acc, x) => acc.map((n, i) => n + x.series[i]), Array(90).fill(0)))}</div>
    <div class="panel"><h4>Lifecycle and rules</h4><div class="sub">Lifecycle decides whether Supply forecasts this product for reorder.</div>
      <div class="fields">
        <div class="field"><label>Lifecycle</label><select onchange="setProduct('${p.id}',{lifecycle:this.value})">${Object.entries(LIFECYCLE).map(([k, l]) => `<option value="${k}" ${p.lifecycle === k ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
        <div class="field"><label>Product line</label><select onchange="setProduct('${p.id}',{line_id:this.value||null})"><option value="">Use the type map (${esc(p.type || 'no type')})</option>${s.lines.map(l => `<option value="${l.id}" ${p.lineId === l.id && st().db.products.find(x => x.product_id === p.id)?.line_id ? 'selected' : ''}>${esc(l.name)}</option>`).join('')}</select></div>
        <div class="field"><label>Minimum order</label><input type="number" min="0" value="${p.moq ?? ''}" placeholder="none" onchange="setProduct('${p.id}',{moq:+this.value||0})"><div class="help">Saved to Shopify as custom.moq too.</div></div>
        <div class="field"><label>Lead time override (days)</label><input type="number" min="0" value="${p.leadParts?.source === 'product' ? p.leadParts.base : ''}" placeholder="${p.leadParts ? p.leadParts.base + ' from ' + p.leadParts.source : 'from factory'}" onchange="setProduct('${p.id}',{lead_override_days:+this.value||null})"></div>
        <div class="field" style="grid-column:1/-1"><label>Notes</label><textarea placeholder="Anything the next buyer should know" onchange="setProduct('${p.id}',{notes:this.value})">${esc(p.notes || '')}</textarea></div>
      </div></div>
    <div class="sh-foot"><button class="btn primary" onclick="S.sel.add('${p.id}');closeSheet();S.tab='reorder';location.hash='reorder';render();createOrder()">Add to an order ${ic('arrow')}</button><span style="flex:1"></span><a class="btn quiet" target="_blank" rel="noopener" href="https://admin.shopify.com/store/${esc((st().db.brand?.shop_domain || '').replace('.myshopify.com', ''))}/products/${p.id}">Open in Shopify</a></div>`, 'product');
}
function trendText(p) { return { spiking: 'spiking on the month', rising: 'rising on the month', falling: 'falling on the month', steady: 'steady', new: 'new product', flat: 'no recent sales' }[p.trend] || ''; }
function whyVariant(v) { return `${v.sold14} in the last 14 days, ${v.sold30} in 30, ${v.sold90} in 90, on the shelf ${v.buyable90} of the last 90 days.${v.curveBased ? ' It was off the shelf too long for its own rate, so its demand comes from the line\'s size curve.' : v.capped ? ' The raw rate was inflated by sold-out days and has been capped at plain sales over the window.' : ''}`; }
async function setProduct(pid, patch) { await save(`/api/products/${pid}`, patch); if (S.sheetKind === 'product') openProduct(pid, S.open?.variantId); }

/* ---------- charts ---------- */
function projectionSVG(p, subject, what, lands) {
  const s = st(); const W = 760, H = 230, padL = 44, padB = 26, padT = 14;
  const vel = subject.velocity, onHand = Math.max(0, subject.onHand);
  const horizon = 180;
  const incoming = subject.incomingOrders ? subject.incomingOrders.filter(i => i.lands) : (subject.variants || []).flatMap(x => x.incomingOrders || []).filter(i => i.lands);
  const maxY = Math.max(onHand, what.qty + (vel > 0 ? 0 : 0), ...incoming.map(i => i.qty), 10) * 1.15;
  const x = d => padL + (Math.min(horizon, Math.max(0, d)) / horizon) * (W - padL - 10);
  const y = u => padT + (1 - Math.min(maxY, Math.max(0, u)) / maxY) * (H - padT - padB);
  const path = (start, qtyAt) => { // qtyAt: [[day, qty]] step adds
    const pts = []; let stock = start, d = 0; const adds = [...qtyAt].sort((a, b) => a[0] - b[0]); let i = 0;
    while (d <= horizon) { while (i < adds.length && adds[i][0] <= d) { stock += adds[i][1]; i++; } pts.push([d, stock]); stock = Math.max(0, stock - vel); d++; }
    return pts;
  };
  const base = path(onHand, incoming.map(i => [daysBetween(s.today, i.lands), i.qty]));
  const scen = lands ? path(onHand, [...incoming.map(i => [daysBetween(s.today, i.lands), i.qty]), [daysBetween(s.today, lands), what.qty]]) : null;
  const toD = pts => pts.map(([d, u], i) => `${i ? 'L' : 'M'}${x(d).toFixed(1)},${y(u).toFixed(1)}`).join(' ');
  const outAt = base.findIndex(([, u]) => u <= 0);
  const backAt = outAt >= 0 ? base.findIndex(([d, u], i) => i > outAt && u > 0) : -1;
  const gapEnd = outAt >= 0 ? (backAt >= 0 ? base[backAt][0] : (scen ? (scen.findIndex(([d, u], i) => i > outAt && u > 0) >= 0 ? scen[scen.findIndex(([d, u], i) => i > outAt && u > 0)][0] : horizon) : horizon)) : null;
  const months = []; for (let d = 0; d <= horizon; d += 30) months.push(d);
  const ticks = [0, 0.25, 0.5, 0.75, 1].map(f => Math.round(maxY * f));
  return `<svg class="chart" viewBox="0 0 ${W} ${H}">
    ${ticks.map(u => `<line x1="${padL}" x2="${W - 10}" y1="${y(u)}" y2="${y(u)}" stroke="#E6ECF0"/><text x="${padL - 8}" y="${y(u) + 4}" font-size="10.5" text-anchor="end" fill="#8195A2">${u}</text>`).join('')}
    ${outAt >= 0 ? `<rect x="${x(base[outAt][0])}" y="${padT}" width="${Math.max(0, x(gapEnd) - x(base[outAt][0]))}" height="${H - padT - padB}" fill="#F7E7E4" opacity=".6"/>` : ''}
    ${months.map(d => `<text x="${x(d)}" y="${H - 8}" font-size="10.5" fill="#8195A2">${fmtDate(addDays(s.today, d))}</text>`).join('')}
    ${lands ? `<line x1="${x(daysBetween(s.today, lands))}" x2="${x(daysBetween(s.today, lands))}" y1="${padT}" y2="${H - padB}" stroke="#14608C" stroke-dasharray="2 3"/>` : ''}
    <path d="${toD(base)}" fill="none" stroke="${outAt >= 0 ? '#9C3A2E' : '#1C7A46'}" stroke-width="2"/>
    ${scen ? `<path d="${toD(scen)}" fill="none" stroke="#14608C" stroke-width="2" stroke-dasharray="5 4"/>` : ''}
    <circle cx="${x(0)}" cy="${y(onHand)}" r="4" fill="#0C161D" stroke="#fff" stroke-width="2"/><text x="${x(0) + 8}" y="${y(onHand) - 8}" font-size="11" fill="#13202B">${fmtInt(onHand)} today</text>
    ${outAt >= 0 ? `<circle cx="${x(base[outAt][0])}" cy="${y(0)}" r="4" fill="#9C3A2E" stroke="#fff" stroke-width="2"/><text x="${Math.min(x(base[outAt][0]) + 6, W - 120)}" y="${y(0) - 8}" font-size="11" font-weight="700" fill="#9C3A2E">Runs out ${fmtDate(addDays(s.today, base[outAt][0]))}</text>` : ''}
    ${outAt >= 0 && gapEnd != null && gapEnd - base[outAt][0] > 10 ? `<text x="${(x(base[outAt][0]) + x(gapEnd)) / 2}" y="${y(maxY * 0.75)}" font-size="11" font-weight="700" fill="#9C3A2E" text-anchor="middle">${gapEnd - base[outAt][0]} days with nothing to sell</text><text x="${(x(base[outAt][0]) + x(gapEnd)) / 2}" y="${y(maxY * 0.75) + 14}" font-size="11" fill="#647684" text-anchor="middle">about ${Math.round((gapEnd - base[outAt][0]) * vel)} lost sales</text>` : ''}
    ${lands ? `<text x="${Math.min(x(daysBetween(s.today, lands)) + 6, W - 130)}" y="${y(what.qty) - 6}" font-size="11" font-weight="700" fill="#14608C">${fmtInt(what.qty)} land ${fmtDate(lands)}</text>` : ''}
    ${incoming.map(i => `<text x="${x(daysBetween(s.today, i.lands)) + 4}" y="${padT + 12}" font-size="10.5" font-weight="700" fill="#1C7A46">+${i.qty} ${fmtDate(i.lands)}</text>`).join('')}
    ${base.filter((_, i) => i % 6 === 0).map(([d, u]) => `<rect x="${x(d) - 3}" y="${padT}" width="6" height="${H - padT - padB}" fill="transparent" data-tip="${fmtDate(addDays(s.today, d))}<small>${fmtInt(u)} on hand if nothing is ordered${scen ? ` · ${fmtInt(scen[d][1])} with the order` : ''}</small>"/>`).join('')}
  </svg>`;
}
function salesSVG(series) {
  const W = 760, H = 96, max = Math.max(...series, 1), bw = W / series.length; const s = st();
  return `<svg class="chart" viewBox="0 0 ${W} ${H + 14}">${series.map((v, i) => { const bh = Math.max(v ? 2 : 0, v / max * (H - 4)); const day = addDays(s.today, i - 90); return `<rect x="${(i * bw + 1).toFixed(1)}" y="${(H - bh).toFixed(1)}" width="${(bw - 2).toFixed(1)}" height="${bh.toFixed(1)}" rx="1.5" fill="${i >= 76 ? '#2E88B8' : '#B9D6E6'}" data-tip="${fmtDate(day)}<small>${v} sold</small>"/>`; }).join('')}<line x1="0" x2="${W}" y1="${H}" y2="${H}" stroke="#DFE7EC"/><text x="0" y="${H + 11}" font-size="10.5" fill="#8195A2">${fmtDate(addDays(s.today, -90))}</text><text x="${W}" y="${H + 11}" font-size="10.5" fill="#8195A2" text-anchor="end">${fmtDate(addDays(s.today, -1))}</text></svg>`;
}
async function runSnapshot() { try { toast('Running a Shopify snapshot…'); await api('/api/shopify/snapshot', { method: 'POST' }); await load(); toast('Snapshot done'); } catch (e) { toast(e.message, { kind: 'err' }); } }

/* ---------- boot ---------- */
document.addEventListener('DOMContentLoaded', () => {
  $$('#tabs button[data-t], #tabbar button[data-t]').forEach(b => b.onclick = () => { setTab(b.dataset.t); closeNav(); });
  $('#tbMore').onclick = () => openNav();
  $('#navToggle').onclick = () => ($('#side').classList.contains('open') ? closeNav() : openNav());
  $('#navScrim').onclick = closeNav;
  $('#btnOut').onclick = signOut;
  $('#scrim').onclick = closeSheet;
  $('#brandPick').onchange = e => { S.brand = e.target.value; localStorage.setItem('supply_brand', S.brand); load(); };
  document.addEventListener('keydown', e => { if (e.key === 'Escape') { if (!$('#modal').hidden) return; closeSheet(); } });
  const h = location.hash.replace('#', ''); if (TITLES[h]) S.tab = h;
  window.addEventListener('hashchange', () => { const t = location.hash.replace('#', ''); if (TITLES[t] && t !== S.tab) { S.tab = t; closeSheet(); render(); } });
  load();
  setInterval(() => { if (S.state && !S.sheetKind && $('#modal').hidden && document.visibilityState === 'visible') load({ quiet: true }); }, 5 * 60 * 1000);
});
function openNav() { $('#side').classList.add('open'); $('#navScrim').hidden = false; $('#navScrim').dataset.open = '1'; $('#navToggle').setAttribute('aria-expanded', 'true'); }
function closeNav() { $('#side').classList.remove('open'); $('#navScrim').hidden = true; delete $('#navScrim').dataset.open; $('#navToggle').setAttribute('aria-expanded', 'false'); }

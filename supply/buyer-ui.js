/* ======================================================================
   THE BUYER, in the app. The shared panel and card (../ask/ask-ui.js)
   wired to Supply: what it found at the top of Today, a panel that
   answers anywhere (Ctrl+K, the rail button), a Buyer tab in Settings.
   Same brain as the morning digest, same read-only reach.
   ====================================================================== */
const SCREEN_NAMES = { today: 'Today (the decisions and the headline)', reorder: 'Reorder (what needs ordering)', orders: 'Orders (purchase orders in flight)',
  forecast: 'Forecast (every product with its dates)', performance: 'Performance (sell-through)', lineup: 'Lineup plan (the next drop)', timeline: 'Timeline', settings: 'Settings' };

AskUI.init({
  name: 'Buyer', esc, flash: msg => toast(msg),
  /* Supply's api() takes an object body and stringifies it itself. */
  api: (path, o = {}) => api(path, { method: o.method, body: o.body ? JSON.parse(o.body) : undefined }),
  confirm: async o => !!(await modal({ title: o.title, hint: o.body || '', fields: false, confirm: o.ok || 'Confirm' })),
  cardH: (t, q, right = '') => `<div class="ch" style="display:flex;align-items:flex-start;gap:12px;flex-wrap:wrap"><div style="flex:1;min-width:0"><h3 style="margin:0 0 4px">${esc(t)}</h3>${q ? `<div class="hint">${esc(q)}</div>` : ''}</div>${right}</div>`,
  intro: 'Ask me anything about the brand\'s products. Try: "what do I need to order this week?", "how many weeks of cover on the Carver?", "when does the next factory order land?", "what is dead stock worth?", "keep an eye on the putters".',
  screen: () => {
    try {
      const ctx = { screen: SCREEN_NAMES[S.tab] || S.tab, screen_id: S.tab, brand: S.brand };
      if (S.open) ctx.open_item = S.open;
      if (S.tab === 'orders' && S.ordersFilter) ctx.orders_filter = S.ordersFilter;
      if (S.tab === 'settings' && S.setTab) ctx.settings_section = S.setTab;
      return ctx;
    } catch (e) { return null; }
  },
});

/* Today leads with what the Buyer found, then the headline. */
const _renderTodayBase = renderToday;
renderToday = function (m) {
  _renderTodayBase(m);
  if (S.tab !== 'today') return;
  AskUI.mountIn(m);
};

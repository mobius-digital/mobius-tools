/* LOCUS PAGES (2026-11-02): the brand's burner TikTok pages (Lucky Golf's slideshow pages that sell clubs through a
 * per-page promo code), under Make > Social > Pages. Team only: never on a client's rail.
 *
 * WHO USES IT: Cole, a few times a week.
 *   1. Pages: every page ranked as a card (followers, views, posts, orders by its code, its best posts) over a range,
 *      with one funnel strip on top (views > profile visits > orders).
 *   2. Tests: what was tried on which pages, and how it went. Two views only, Live tests and Leaderboard; everything
 *      else is archived and found by search.
 * The password is write-only: typed into the page editor, shown masked, Reveal asks the server for it once.
 * Data: account-health /api/burners, /api/burners/tests (burners.js). CSS tokens only. Never prompt() or alert(). No em dashes. */
(() => {
  let H = null;
  const $ = s => document.querySelector(s);
  const U = () => window.V2UI;
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const store = (k, v) => { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch {} };
  const k = n => { if (n == null) return '–'; const a = Math.abs(n); return a >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : a >= 1e3 ? `${(n / 1e3).toFixed(a >= 1e4 ? 0 : 1)}k` : String(Math.round(n)); };
  const money = n => n == null ? '–' : `$${Math.round(n).toLocaleString('en-US')}`;
  const ymd = d => d.toLocaleDateString('en-CA');
  const add = (s, n) => { const d = new Date(s + 'T12:00:00'); d.setDate(d.getDate() + n); return ymd(d); };
  const md = s => s ? new Date(s + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '';
  const ago = s => { if (!s) return 'never'; const t = Date.parse(s.includes('T') ? s : `${s.replace(' ', 'T')}Z`); const m = Math.round((Date.now() - t) / 6e4); return m < 2 ? 'just now' : m < 60 ? `${m}m ago` : m < 1440 ? `${Math.round(m / 60)}h ago` : `${Math.round(m / 1440)}d ago`; };
  const STATUS = { warming: 'Warming', live: 'Live', banned: 'Banned' };
  const VERDICT = { win: 'Win', lose: 'Lose', killed: 'Killed', '': 'Live' };
  const RANGES = [['7', '7 days'], ['30', '30 days'], ['start', 'Since start']];
  const ST = { act: null, view: store('bp_view') || 'pages', range: store('bp_range') || '7', data: null, tests: null, tview: 'live', q: '' };

  function css() {
    if (document.getElementById('bpcss')) return;
    const st = document.createElement('style'); st.id = 'bpcss';
    st.textContent = `
      .bp{--bp-r:var(--v5-r,12px)}
      .bp .bp-top{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin:0 0 14px}
      .bp .bp-top .r{margin-left:auto;display:flex;gap:8px;align-items:center;flex-wrap:wrap}
      .bp .bp-seg{display:inline-flex;gap:2px;background:var(--surface-2);border-radius:var(--r-sm,8px);padding:2px}
      .bp .bp-seg button{border:0;background:none;font:inherit;font-size:13px;font-weight:600;color:var(--muted);padding:6px 12px;border-radius:6px;cursor:pointer}
      .bp .bp-seg button.on{background:var(--surface);color:var(--ink);box-shadow:0 1px 2px rgba(0,0,0,.08)}
      .bp-btn{display:inline-flex;align-items:center;justify-content:center;gap:6px;height:32px;padding:0 12px;border-radius:var(--r-sm,8px);border:1px solid var(--line-strong,var(--line));background:var(--surface);font:inherit;font-weight:600;font-size:13px;cursor:pointer;color:var(--ink);white-space:nowrap}
      .bp-btn:hover{background:var(--surface-2)} .bp-btn.pri{background:var(--brand);border-color:var(--brand);color:var(--on-brand,#fff)} .bp-btn.sm{height:28px;padding:0 10px;font-size:12px}
      .bp-btn.ghost{border-color:transparent;background:none} .bp-btn.bad{color:var(--bad)} .bp-btn[disabled]{opacity:.5;cursor:default}
      .bp .bp-funnel{display:grid;grid-template-columns:repeat(3,1fr);gap:0;border:1px solid var(--line);border-radius:var(--bp-r);background:var(--surface);margin:0 0 16px;overflow:hidden}
      .bp .bp-funnel .st{padding:14px 16px;position:relative}
      .bp .bp-funnel .st+.st{border-left:1px solid var(--line)}
      .bp .bp-funnel .st+.st:before{content:'';position:absolute;left:-7px;top:50%;width:12px;height:12px;background:var(--surface);border-top:1px solid var(--line);border-right:1px solid var(--line);transform:translateY(-50%) rotate(45deg)}
      .bp .bp-funnel .l{font-size:12px;color:var(--muted)} .bp .bp-funnel .v{font-size:24px;font-weight:650;letter-spacing:-.01em;margin-top:2px;font-variant-numeric:tabular-nums}
      .bp .bp-funnel .s{font-size:12px;color:var(--muted);margin-top:2px} .bp .bp-funnel .na .v{color:var(--muted)}
      .bp .bp-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:14px}
      .bp .bp-card{border:1px solid var(--line);border-radius:var(--bp-r);background:var(--surface);padding:14px;display:flex;flex-direction:column;gap:12px;min-width:0}
      .bp .bp-card.banned{opacity:.6}
      .bp .bp-card .hd{display:flex;gap:10px;align-items:center;min-width:0}
      .bp .bp-card .av{width:38px;height:38px;border-radius:50%;flex:0 0 auto;display:grid;place-items:center;font-weight:700;font-size:14px;color:var(--on-brand,#fff);background:var(--brand)}
      .bp .bp-card .rk{font-size:11px;font-weight:700;color:var(--muted);width:16px;text-align:center;flex:0 0 auto}
      .bp .bp-card .nm{min-width:0;flex:1} .bp .bp-card .nm b{display:block;font-size:14px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      .bp .bp-card .nm a,.bp .bp-card .nm span{font-size:12px;color:var(--muted);text-decoration:none} .bp .bp-card .nm a:hover{color:var(--ink)}
      .bp-chip{font-size:11px;font-weight:650;border-radius:999px;padding:2px 8px;border:1px solid var(--line);color:var(--muted);white-space:nowrap}
      .bp-chip.live,.bp-chip.win{color:var(--good);border-color:var(--good)} .bp-chip.warming{color:var(--warn,#b7791f);border-color:var(--warn,#b7791f)}
      .bp-chip.banned,.bp-chip.lose{color:var(--bad);border-color:var(--bad)} .bp-chip.killed{color:var(--muted)} .bp-chip.open{color:var(--brand);border-color:var(--brand)}
      .bp .bp-card .mx{display:grid;grid-template-columns:repeat(4,1fr);gap:8px}
      .bp .bp-card .mx div{min-width:0} .bp .bp-card .mx i{display:block;font-style:normal;font-size:11px;color:var(--muted)}
      .bp .bp-card .mx b{font-size:17px;font-weight:650;font-variant-numeric:tabular-nums} .bp .bp-card .mx small{display:block;font-size:11px;color:var(--good);font-variant-numeric:tabular-nums} .bp .bp-card .mx small.neg{color:var(--bad)}
      .bp .bp-card .mx .na b{color:var(--muted);font-weight:500}
      .bp .bp-card .cd{display:flex;gap:6px;align-items:center;flex-wrap:wrap;font-size:12px;color:var(--muted)} .bp .bp-card .cd code{font:600 12px ui-monospace,monospace;color:var(--ink);background:var(--surface-2);border-radius:5px;padding:1px 6px}
      .bp .bp-card .best{display:grid;grid-template-columns:repeat(3,1fr);gap:6px}
      .bp .bp-card .best a{position:relative;aspect-ratio:3/4;border-radius:8px;background:var(--surface-2) center/cover no-repeat;display:block;overflow:hidden}
      .bp .bp-card .best a span{position:absolute;left:5px;bottom:5px;font-size:11px;font-weight:700;color:#fff;text-shadow:0 1px 3px rgba(0,0,0,.6)}
      .bp .bp-card .best .none{grid-column:1/-1;font-size:12px;color:var(--muted);border:1px dashed var(--line);border-radius:8px;padding:14px;text-align:center}
      .bp .bp-card .ft{display:flex;gap:6px;align-items:center;font-size:11.5px;color:var(--muted);margin-top:auto} .bp .bp-card .ft .sp{flex:1} .bp .bp-card .ft .err{color:var(--bad)}
      .bp .bp-note{font-size:12px;color:var(--muted);margin:10px 2px 0}
      .bp .bp-state{border:1px dashed var(--line-strong,var(--line));border-radius:var(--bp-r);padding:40px 20px;text-align:center;display:grid;gap:8px;justify-items:center;background:var(--surface)} .bp .bp-state p{margin:0;color:var(--muted);font-size:13px}
      .bp .bp-sk{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:14px} .bp .bp-sk i{height:260px;border-radius:var(--bp-r);background:var(--surface-2);animation:bpPulse 1.2s ease-in-out infinite alternate}
      @keyframes bpPulse{from{opacity:.55}to{opacity:1}}
      .bp .bp-search{height:32px;border:1px solid var(--line);border-radius:var(--r-sm,8px);background:var(--surface);color:var(--ink);font:inherit;font-size:13px;padding:0 10px;min-width:220px}
      .bp .bp-tests{border:1px solid var(--line);border-radius:var(--bp-r);background:var(--surface);overflow:hidden}
      .bp .bp-tr{display:grid;grid-template-columns:28px minmax(0,2.2fr) minmax(0,1.2fr) 110px minmax(0,1.6fr) 74px;gap:12px;align-items:center;padding:11px 14px;border-top:1px solid var(--line);cursor:pointer}
      .bp .bp-tr:first-child{border-top:0} .bp .bp-tr:hover{background:var(--surface-2)}
      .bp .bp-tr.th{cursor:default;font-size:11px;font-weight:650;color:var(--muted);text-transform:uppercase;letter-spacing:.04em;background:var(--surface-2)}
      .bp .bp-tr .n{font-size:12px;font-weight:700;color:var(--muted);text-align:center} .bp .bp-tr .w{font-size:13.5px;font-weight:600;min-width:0;overflow:hidden;text-overflow:ellipsis}
      .bp .bp-tr .pg{display:flex;gap:4px;flex-wrap:wrap;min-width:0} .bp .bp-tr .pg span{font-size:11px;background:var(--surface-2);border-radius:5px;padding:1px 6px;white-space:nowrap}
      .bp .bp-tr .d,.bp .bp-tr .rs{font-size:12.5px;color:var(--muted);min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap} .bp .bp-tr .rs b{color:var(--ink);font-variant-numeric:tabular-nums}
      .bp-ed{display:grid;gap:12px}
      .bp-ed label{display:grid;gap:4px;font-size:12px;font-weight:600;color:var(--muted)}
      .bp-ed input,.bp-ed textarea,.bp-ed select{border:1px solid var(--line);border-radius:8px;background:var(--surface);color:var(--ink);font:inherit;font-size:13.5px;font-weight:400;padding:8px 10px;width:100%;box-sizing:border-box}
      .bp-ed textarea{min-height:70px;resize:vertical} .bp-ed .two{display:grid;grid-template-columns:1fr 1fr;gap:10px}
      .bp-ed .pw{display:flex;gap:6px} .bp-ed .pw input{flex:1}
      .bp-ed .seg{display:flex;gap:6px;flex-wrap:wrap} .bp-ed .seg button{border:1px solid var(--line);background:var(--surface);border-radius:999px;padding:5px 12px;font:inherit;font-size:12.5px;font-weight:600;cursor:pointer;color:var(--muted)}
      .bp-ed .seg button.on{border-color:var(--brand);color:var(--ink);background:var(--surface-2)}
      .bp-ed .pk{display:flex;gap:6px;flex-wrap:wrap} .bp-ed .pk button{border:1px solid var(--line);background:var(--surface);border-radius:8px;padding:5px 10px;font:inherit;font-size:12.5px;cursor:pointer;color:var(--muted)} .bp-ed .pk button.on{border-color:var(--brand);color:var(--ink)}
      .bp-ed .hint{font-size:11.5px;color:var(--muted);font-weight:400}
      .bp-ed .foot{display:flex;gap:8px;align-items:center;margin-top:4px} .bp-ed .foot .sp{flex:1} .bp-ed .msg{font-size:12px;color:var(--bad)}
      @media (max-width:720px){
        .bp .bp-funnel{grid-template-columns:1fr} .bp .bp-funnel .st+.st{border-left:0;border-top:1px solid var(--line)} .bp .bp-funnel .st+.st:before{display:none}
        .bp .bp-top .r{margin-left:0;width:100%} .bp .bp-search{flex:1;min-width:0}
        .bp .bp-top .r .bp-seg{width:100%} .bp .bp-top .r .bp-seg button{flex:1} .bp .bp-top .r .bp-btn{flex:1 1 auto}
        .bp .bp-tr{grid-template-columns:1fr auto;gap:4px 10px} .bp .bp-tr .n,.bp .bp-tr .pg,.bp .bp-tr.th{display:none} .bp .bp-tr .d,.bp .bp-tr .rs{grid-column:1}
        .bp .bp-tr .v{grid-row:1;grid-column:2} .bp-ed .two{grid-template-columns:1fr} .bp-btn{min-height:40px}
      }`;
    document.head.appendChild(st);
  }

  function toast(t) {
    const el = document.createElement('div');
    el.style.cssText = 'position:fixed;left:50%;bottom:calc(24px + env(safe-area-inset-bottom,0px));transform:translateX(-50%);background:var(--ink);color:var(--surface);padding:10px 14px;border-radius:9px;font-size:13px;z-index:9999;max-width:min(560px,92vw)';
    el.textContent = t; document.body.appendChild(el); setTimeout(() => el.remove(), 4200);
  }
  const api = (p, o = {}) => H.apiAH(p, o);
  const body = o => ({ method: o.method, body: JSON.stringify(o.body) });

  /* The range: 7 or 30 days back from today, or from the first page's start date. */
  function range() {
    const to = ymd(new Date());
    if (ST.range === 'start') {
      const starts = (ST.data?.pages || []).map(p => p.start_date).filter(Boolean).sort();
      return { from: starts[0] || add(to, -29), to };
    }
    return { from: add(to, -(+ST.range - 1)), to };
  }

  async function render(host, first) {
    H = host; css();
    const act = H.S.act, head = H.pageHead('burners', 'Pages');
    if (!act || act === 'all') { $('#main').innerHTML = `<div class="v2 bp">${head}<div class="bp-state"><b>Pick a brand</b><p>Pages are per brand.</p></div></div>`; return; }
    const t = H.RUN();
    if (first || ST.act !== act) { ST.act = act; ST.data = null; ST.tests = null; $('#main').innerHTML = `<div class="v2 bp">${head}<div class="bp-sk"><i></i><i></i><i></i></div></div>`; }
    try { await load(); }
    catch (e) {
      if (t !== H.RUN()) return;
      $('#main').innerHTML = `<div class="v2 bp">${head}<div class="bp-state"><b>Pages did not load</b><p>${esc(e.message)}</p><button type="button" class="bp-btn" id="bpRetry">Try again</button></div></div>`;
      $('#bpRetry').onclick = () => render(host, true);
      return;
    }
    if (t !== H.RUN()) return;
    draw();
  }
  async function load(fresh = false) {
    const r = range();
    const [d, t] = await Promise.all([
      api(`/api/burners?act=${encodeURIComponent(ST.act)}&from=${r.from}&to=${r.to}`, { fresh: fresh || !ST.data }),
      api(`/api/burners/tests?act=${encodeURIComponent(ST.act)}`, { fresh: fresh || !ST.tests }),
    ]);
    ST.data = d; ST.tests = t.tests || [];
    if (ST.range === 'start') { const r2 = range(); if (r2.from !== d.from) ST.data = await api(`/api/burners?act=${encodeURIComponent(ST.act)}&from=${r2.from}&to=${r2.to}`, { fresh: true }); }
    /* Pages pulled in the background on this read: one more read a little later shows their numbers. */
    if ((d.refreshing || []).length && !fresh) setTimeout(() => { if (H.S.act === ST.act && H.S.tab === 'burners') load(true).then(draw).catch(() => {}); }, 9000);
  }

  function draw() {
    const head = H.pageHead('burners', 'Pages');
    const seg = `<div class="bp-seg" role="tablist">${[['pages', 'Pages'], ['tests', 'Tests']].map(([v, l]) => `<button type="button" data-v="${v}" class="${ST.view === v ? 'on' : ''}">${l}</button>`).join('')}</div>`;
    const right = ST.view === 'pages'
      ? `<div class="bp-seg">${RANGES.map(([v, l]) => `<button type="button" data-r="${v}" class="${ST.range === v ? 'on' : ''}">${l}</button>`).join('')}</div>
         <button type="button" class="bp-btn" id="bpAll">Refresh all</button><button type="button" class="bp-btn pri" id="bpNew">New page</button>`
      : `<div class="bp-seg" id="bpTv">${[['live', `Live tests (${(ST.tests || []).filter(t => !t.verdict).length})`], ['board', 'Leaderboard']].map(([v, l]) => `<button type="button" data-tv="${v}" class="${ST.tview === v && !ST.q.trim() ? 'on' : ''}">${l}</button>`).join('')}</div>
         <input class="bp-search" id="bpQ" type="search" placeholder="Search every test" value="${esc(ST.q)}"><button type="button" class="bp-btn pri" id="bpNewT">New test</button>`;
    $('#main').innerHTML = `<div class="v2 bp">${head}<div class="bp-top">${seg}<div class="r">${right}</div></div><div id="bpBody">${ST.view === 'pages' ? pagesHtml() : testsHtml()}</div></div>`;
    $('#main').querySelectorAll('[data-v]').forEach(b => b.onclick = () => { ST.view = b.dataset.v; store('bp_view', ST.view); draw(); });
    $('#main').querySelectorAll('[data-r]').forEach(b => b.onclick = async () => { ST.range = b.dataset.r; store('bp_range', ST.range); await load(true).catch(e => toast(e.message)); draw(); });
    if (ST.view === 'pages') wirePages(); else wireTests();
  }

  /* ---------- Pages ---------- */
  function pagesHtml() {
    const d = ST.data, pages = d.pages || [];
    if (!pages.length) return `<div class="bp-state"><b>No pages yet</b><p>Add the brand's first TikTok page.</p></div>`;
    const f = d.funnel || {};
    const step = (l, v, s, na) => `<div class="st ${na ? 'na' : ''}"><div class="l">${l}</div><div class="v">${v}</div><div class="s">${s}</div></div>`;
    const conv = f.orders != null && f.views ? `${(f.orders / f.views * 1000).toFixed(2)} per 1k views` : '';
    const funnel = `<div class="bp-funnel">
      ${step('Views', k(f.views), `${md(d.from)} to ${md(d.to)}, posts made in range`)}
      ${step('Profile visits', '–', 'Only in the TikTok app', true)}
      ${f.orders == null ? step('Orders', '–', esc(d.orders_note || 'No codes yet'), true) : step('Orders', k(f.orders), `${money(f.revenue)}${conv ? ` · ${conv}` : ''}`)}
    </div>`;
    return `${funnel}<div class="bp-grid">${pages.map((p, i) => card(p, i + 1)).join('')}</div>`;
  }
  function card(p, rank) {
    const r = p.range || {};
    const gain = r.followers_gain;
    const m = (l, v, sub, na) => `<div class="${na ? 'na' : ''}"><i>${l}</i><b>${v}</b>${sub || ''}</div>`;
    const best = (p.best || []).length
      ? p.best.map(b => `<a href="${esc(b.url)}" target="_blank" rel="noopener noreferrer" style="background-image:url('${esc(b.thumb || '')}')" title="${esc((b.caption || '').slice(0, 120))}"><span>${k(b.views)}</span></a>`).join('')
      : `<div class="none">${p.pulled_at ? 'No posts in this range' : 'Not read yet'}</div>`;
    return `<article class="bp-card ${p.status}" data-id="${esc(p.id)}">
      <div class="hd"><span class="rk">${rank}</span><span class="av">${esc((p.name || '?')[0].toUpperCase())}</span>
        <div class="nm"><b>${esc(p.name)}</b>${p.handle ? `<a href="https://www.tiktok.com/@${esc(p.handle)}" target="_blank" rel="noopener noreferrer">@${esc(p.handle)}</a>` : '<span>No handle</span>'}${p.style ? `<span> · ${esc(p.style)}</span>` : ''}</div>
        <span class="bp-chip ${p.status}">${STATUS[p.status] || p.status}</span></div>
      <div class="mx">
        ${m('Followers', k(p.followers), gain != null && gain !== 0 ? `<small class="${gain < 0 ? 'neg' : ''}">${gain > 0 ? '+' : ''}${k(gain)}</small>` : '')}
        ${m('Views', k(r.views))}
        ${m('Posts', k(r.posts))}
        ${p.code ? m('Orders', r.orders == null ? '–' : k(r.orders), r.revenue ? `<small>${money(r.revenue)}</small>` : '', r.orders == null) : m('Orders', 'No code', '', true)}
      </div>
      <div class="cd">${p.code ? `<code>${esc(p.code)}</code>` : ''}${p.offer ? `<span>${esc(p.offer)}</span>` : ''}${!p.code && !p.offer ? '<span>No code or offer yet</span>' : ''}</div>
      <div class="best">${best}</div>
      <div class="ft"><span class="${p.error ? 'err' : ''}">${p.error ? esc(p.error) : `Read ${ago(p.pulled_at)}`}</span><span class="sp"></span>
        <button type="button" class="bp-btn sm ghost" data-ref="${esc(p.id)}">Refresh</button><button type="button" class="bp-btn sm" data-ed="${esc(p.id)}">Edit</button></div>
    </article>`;
  }
  function wirePages() {
    $('#bpNew').onclick = () => editPage(null);
    $('#bpAll').onclick = async e => {
      const b = e.currentTarget; b.disabled = true; b.textContent = 'Reading...';
      const ps = (ST.data.pages || []).filter(p => p.handle && p.status !== 'banned');
      const errs = [];
      for (const p of ps) await api(`/api/burners/${p.id}/refresh`, { method: 'POST' }).catch(x => errs.push(`${p.name}: ${x.message}`));
      await load(true).catch(() => {}); draw();
      toast(errs.length ? errs[0] : `${ps.length} pages read`);
    };
    $('#bpBody').querySelectorAll('[data-ref]').forEach(b => b.onclick = async () => {
      b.disabled = true; b.textContent = 'Reading...';
      try { await api(`/api/burners/${b.dataset.ref}/refresh`, { method: 'POST' }); await load(true); draw(); }
      catch (e) { toast(e.message); b.disabled = false; b.textContent = 'Refresh'; }
    });
    $('#bpBody').querySelectorAll('[data-ed]').forEach(b => b.onclick = () => editPage(ST.data.pages.find(p => p.id === b.dataset.ed)));
  }

  /* The page editor: one panel. The password field is never filled from a list; Reveal asks for it once. */
  function editPage(p) {
    const v = p || { status: 'warming', start_date: ymd(new Date()) };
    const f = (id, l, val, ph = '', type = 'text') => `<label>${l}<input id="${id}" type="${type}" value="${esc(val || '')}" placeholder="${esc(ph)}" autocomplete="off"></label>`;
    const html = `<div class="bp-ed">
      ${f('bpName', 'Name', v.name, 'Short Game Daily')}
      <div class="two">${f('bpHandle', 'TikTok handle', v.handle ? `@${v.handle}` : '', '@short.game.daily')}${f('bpEmail', 'Login email', v.email, 'name@gmail.com', 'email')}</div>
      <label>Password<div class="pw"><input id="bpPw" type="password" autocomplete="new-password" placeholder="${v.has_pw ? '••••••••  (set; type to replace)' : 'Not set'}"><button type="button" class="bp-btn" id="bpReveal" ${v.has_pw ? '' : 'hidden'}>Reveal</button></div>
        <span class="hint">Stays in Locus. Never posted to Slack or the Change Log.</span></label>
      ${f('bpStyle', 'Style', v.style, 'tips, honest breakdowns, hot takes')}
      <div class="two">${f('bpCode', 'Promo code', v.code, 'CHIP-SHIP')}${f('bpOffer', 'Offer', v.offer, 'Free shipping on the Carver 02')}</div>
      <div class="two"><label>Status<div class="seg" id="bpStatus">${Object.entries(STATUS).map(([s, l]) => `<button type="button" data-s="${s}" class="${v.status === s ? 'on' : ''}">${l}</button>`).join('')}</div></label>${f('bpStart', 'Start date', v.start_date, '', 'date')}</div>
      <label>Notes<textarea id="bpNotes">${esc(v.notes || '')}</textarea></label>
      <div class="foot">${p ? '<button type="button" class="bp-btn ghost bad" id="bpDel">Delete</button>' : ''}${p && v.has_pw ? '<button type="button" class="bp-btn ghost" id="bpClr">Clear password</button>' : ''}<span class="sp"></span><span class="msg" id="bpMsg"></span><button type="button" class="bp-btn pri" id="bpSave">${p ? 'Save' : 'Add page'}</button></div>
    </div>`;
    const el = U().panel(p ? p.name : 'New page', html);
    let status = v.status;
    el.querySelectorAll('#bpStatus [data-s]').forEach(b => b.onclick = () => { status = b.dataset.s; el.querySelectorAll('#bpStatus [data-s]').forEach(x => x.classList.toggle('on', x === b)); });
    const pw = el.querySelector('#bpPw'), rv = el.querySelector('#bpReveal');
    let revealed = false;
    rv.onclick = async () => {
      if (revealed) { pw.type = pw.type === 'password' ? 'text' : 'password'; rv.textContent = pw.type === 'password' ? 'Show' : 'Hide'; return; }
      rv.disabled = true;
      try { const r = await api(`/api/burners/${p.id}/password`, { fresh: true }); pw.value = r.password || ''; pw.type = 'text'; revealed = true; pw.dataset.orig = pw.value; rv.textContent = 'Hide'; }
      catch (e) { el.querySelector('#bpMsg').textContent = e.message; }
      rv.disabled = false;
    };
    const val = id => el.querySelector(id).value.trim();
    el.querySelector('#bpSave').onclick = async e => {
      const b = e.currentTarget, msg = el.querySelector('#bpMsg'); msg.textContent = '';
      const out = { name: val('#bpName'), handle: val('#bpHandle'), email: val('#bpEmail'), style: val('#bpStyle'), code: val('#bpCode'), offer: val('#bpOffer'), status, start_date: val('#bpStart'), notes: el.querySelector('#bpNotes').value.trim() };
      if (!out.name) { msg.textContent = 'Give it a name.'; return; }
      /* Only a value the person typed goes up; a revealed password left as it was is not sent back. */
      if (pw.value && pw.value !== pw.dataset.orig) out.password = pw.value;
      b.disabled = true;
      try {
        if (p) await api(`/api/burners/${p.id}`, body({ method: 'PUT', body: out }));
        else await api('/api/burners', body({ method: 'POST', body: { act: ST.act, ...out } }));
        U().panel.close && U().panel.close(); await load(true); draw(); toast(p ? 'Saved' : 'Page added');
      } catch (x) { msg.textContent = x.message; b.disabled = false; }
    };
    const clr = el.querySelector('#bpClr');
    if (clr) clr.onclick = async () => { await api(`/api/burners/${p.id}`, body({ method: 'PUT', body: { clear_password: true } })).catch(x => toast(x.message)); U().panel.close && U().panel.close(); await load(true); draw(); toast('Password cleared'); };
    const del = el.querySelector('#bpDel');
    if (del) del.onclick = async () => {
      if (!(await H.confirmModal(`Delete ${p.name}?`, 'Its numbers go too. Tests that named it keep their text.', 'Delete'))) return;
      await api(`/api/burners/${p.id}`, { method: 'DELETE' }).catch(x => toast(x.message));
      U().panel.close && U().panel.close(); await load(true); draw();
    };
  }

  /* ---------- Tests ---------- */
  const pageName = id => (ST.data?.pages || []).find(p => p.id === id)?.name || 'Removed page';
  function testsHtml() {
    const all = ST.tests || [];
    const q = ST.q.trim().toLowerCase();
    let rows, title;
    if (q) {
      rows = all.filter(t => [t.what, t.result, t.notes, t.metric, VERDICT[t.verdict], ...t.pages.map(pageName)].join(' ').toLowerCase().includes(q));
      title = `${rows.length} found in every test`;
    } else if (ST.tview === 'board') {
      rows = all.filter(t => t.verdict === 'win').sort((a, b) => (b.value ?? -Infinity) - (a.value ?? -Infinity));
    } else rows = all.filter(t => !t.verdict);
    const archived = all.filter(t => t.verdict === 'lose' || t.verdict === 'killed').length;
    const empty = q ? 'Nothing matches.' : ST.tview === 'board' ? 'No wins yet. A test marked Win lands here, ranked by its number.' : 'No live tests. Start one with New test.';
    const list = rows.length ? `<div class="bp-tests"><div class="bp-tr th"><span>#</span><span>Test</span><span>Pages</span><span>Dates</span><span>Result</span><span>Verdict</span></div>${rows.map((t, i) => `
      <div class="bp-tr" data-t="${esc(t.id)}"><span class="n">${i + 1}</span><span class="w">${esc(t.what)}</span>
        <span class="pg">${t.pages.map(id => `<span>${esc(pageName(id))}</span>`).join('')}</span>
        <span class="d">${md(t.start_date)}${t.end_date ? ` to ${md(t.end_date)}` : t.start_date ? ' on' : ''}</span>
        <span class="rs">${esc(t.result)}${t.result && t.value != null ? ' · ' : ''}${t.value != null ? `<b>${k(t.value)}</b> ${esc(t.metric)}` : ''}</span>
        <span class="v"><span class="bp-chip ${t.verdict || 'open'}">${VERDICT[t.verdict]}</span></span></div>`).join('')}</div>`
      : `<div class="bp-state"><p>${empty}</p></div>`;
    return `${q ? `<p class="bp-note" style="margin:0 2px 10px">${title}</p>` : ''}${list}${!q && archived ? `<p class="bp-note">${archived} lost or killed in the archive. Search to find one.</p>` : ''}`;
  }
  function wireTests() {
    const qi = $('#bpQ');
    qi.oninput = () => { ST.q = qi.value; $('#bpBody').innerHTML = testsHtml(); wireRows(); $('#bpTv').querySelectorAll('[data-tv]').forEach(b => b.classList.toggle('on', !ST.q.trim() && b.dataset.tv === ST.tview)); };
    $('#bpNewT').onclick = () => editTest(null);
    $('#main').querySelectorAll('[data-tv]').forEach(b => b.onclick = () => { ST.tview = b.dataset.tv; ST.q = ''; draw(); });
    wireRows();
  }
  function wireRows() {
    $('#bpBody').querySelectorAll('[data-t]').forEach(r => r.onclick = () => editTest(ST.tests.find(t => t.id === r.dataset.t)));
  }
  function editTest(t) {
    const v = t || { pages: [], verdict: '', start_date: ymd(new Date()) };
    const pages = ST.data?.pages || [];
    const sel = new Set(v.pages);
    const html = `<div class="bp-ed">
      <label>What was tested<input id="btWhat" value="${esc(v.what || '')}" placeholder="Hook: stop chunking chips"></label>
      <label>Pages<div class="pk" id="btPages">${pages.map(p => `<button type="button" data-p="${esc(p.id)}" class="${sel.has(p.id) ? 'on' : ''}">${esc(p.name)}</button>`).join('')}</div></label>
      <div class="two"><label>Start<input id="btFrom" type="date" value="${esc(v.start_date || '')}"></label><label>End<input id="btTo" type="date" value="${esc(v.end_date || '')}"></label></div>
      <label>Result<input id="btRes" value="${esc(v.result || '')}" placeholder="3x the page's normal views"></label>
      <div class="two"><label>Number<input id="btVal" type="number" step="any" value="${v.value ?? ''}" placeholder="42000"></label><label>Of what<input id="btMet" value="${esc(v.metric || '')}" placeholder="views a post"></label></div>
      <label>Verdict<div class="seg" id="btVer">${['', 'win', 'lose', 'killed'].map(s => `<button type="button" data-s="${s}" class="${v.verdict === s ? 'on' : ''}">${s ? VERDICT[s] : 'Still live'}</button>`).join('')}</div>
        <span class="hint">Leaderboard ranks wins by the number.</span></label>
      <label>Notes<textarea id="btNotes">${esc(v.notes || '')}</textarea></label>
      <div class="foot">${t ? '<button type="button" class="bp-btn ghost bad" id="btDel">Delete</button>' : ''}<span class="sp"></span><span class="msg" id="btMsg"></span><button type="button" class="bp-btn pri" id="btSave">${t ? 'Save' : 'Add test'}</button></div>
    </div>`;
    const el = U().panel(t ? 'Test' : 'New test', html);
    let verdict = v.verdict;
    el.querySelectorAll('#btPages [data-p]').forEach(b => b.onclick = () => { const id = b.dataset.p; if (sel.has(id)) sel.delete(id); else sel.add(id); b.classList.toggle('on', sel.has(id)); });
    el.querySelectorAll('#btVer [data-s]').forEach(b => b.onclick = () => { verdict = b.dataset.s; el.querySelectorAll('#btVer [data-s]').forEach(x => x.classList.toggle('on', x === b)); });
    const val = id => el.querySelector(id).value.trim();
    el.querySelector('#btSave').onclick = async e => {
      const b = e.currentTarget, msg = el.querySelector('#btMsg'); msg.textContent = '';
      const out = { what: val('#btWhat'), pages: [...sel], start_date: val('#btFrom'), end_date: val('#btTo'), result: val('#btRes'), value: val('#btVal'), metric: val('#btMet'), verdict, notes: el.querySelector('#btNotes').value.trim() };
      if (!out.what) { msg.textContent = 'Say what was tested.'; return; }
      b.disabled = true;
      try {
        if (t) await api(`/api/burners/tests/${t.id}`, body({ method: 'PUT', body: out }));
        else await api('/api/burners/tests', body({ method: 'POST', body: { act: ST.act, ...out } }));
        U().panel.close && U().panel.close(); await load(true); draw();
      } catch (x) { msg.textContent = x.message; b.disabled = false; }
    };
    const del = el.querySelector('#btDel');
    if (del) del.onclick = async () => {
      if (!(await H.confirmModal('Delete this test?', 'It leaves the log for good.', 'Delete'))) return;
      await api(`/api/burners/tests/${t.id}`, { method: 'DELETE' }).catch(x => toast(x.message));
      U().panel.close && U().panel.close(); await load(true); draw();
    };
  }

  window.BurnerTab = { render, setHost: h => { H = h; } };
})();

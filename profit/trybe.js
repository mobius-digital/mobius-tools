/* ADS > TRYBE (2026-11-05, v3 the same day after Cole's first look). Every approved creator video gets a fair test in Meta.
 *   Queue    approved videos Trybe has never seen deliver. "Not launched" is the backlog; the rest are in Meta already
 *            (on with no spend yet, scheduled, in review, off). Press a thumbnail to watch the video.
 *   Live     videos whose ads spent in the last 30 days, on Triple Whale sales. On now / Off / All.
 *   Creators the same numbers per creator. "Ask for more" = beats the account's CPA and has gone quiet. A name opens the creator.
 *   Rules    the team's written rules for creator ads, per brand.
 * Every list has a search box, a filter and a sort. Decisions on an ad (scale, cut) stay on Ads > Calls, where the call
 * rules and the Change Log live; this page shows what to launch, who is winning and who to ask for more.
 * Agency view lists every brand with a Trybe key. A client login reads Live and Creators for its own brand.
 * Data: account-health /api/trybe (src/trybe.js). Tokens only, no em dashes. */
(() => {
  let H = null, DATA = null, VIEW = 'queue';
  const UI = { queue: { q: '', f: 'not_launched', p: '', s: 'wait' }, live: { q: '', f: 'on', p: '', s: 'spend' }, creators: { q: '', f: 'all', s: 'revenue' } };
  const $ = s => document.querySelector(s);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const CL = () => !!(H && H.S && H.S.role === 'client');
  const HERE = () => !!(H && H.S && H.S.tab === 'trybe');
  const ah = (p, body, method) => H.apiAH(p, body ? { method: method || 'POST', body: JSON.stringify(body) } : undefined);
  const money = n => (n == null ? '' : '$' + Math.round(+n).toLocaleString('en-US'));
  const pct = n => (n == null ? '' : Math.round(n * 100) + '%');
  const n1 = n => String(Math.round((+n || 0) * 10) / 10);
  const ago = iso => { if (!iso) return 'never'; const h = (Date.now() - Date.parse(iso)) / 36e5; return h < 1 ? 'just now' : h < 24 ? `${Math.round(h)}h ago` : `${Math.round(h / 24)}d ago`; };
  const VIEWS = () => (CL() ? [['live', 'Live'], ['creators', 'Creators']] : [['queue', 'Queue'], ['live', 'Live'], ['creators', 'Creators'], ['rules', 'Rules']]);
  const STATE = { not_launched: ['Not launched', 'bad'], no_spend: ['Launched, no spend yet', 'warn'], scheduled: ['Scheduled', ''], review: ['In Meta review', ''], rejected: ['Rejected by Meta', 'bad'], off: ['In Meta, turned off', ''] };

  function css() {
    if (document.getElementById('tbcss')) return;
    const st = document.createElement('style'); st.id = 'tbcss';
    st.textContent = `
.tb .tb-meta{font-size:12.5px;color:var(--muted);margin:-4px 0 14px}
.tb .tb-top{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;margin:0 0 14px}
.tb .tb-stat{padding:12px 16px}
.tb .tb-stat .l{display:block;font-size:11.5px;font-weight:600;letter-spacing:.04em;text-transform:uppercase;color:var(--muted)}
.tb .tb-stat b{display:block;font-size:26px;line-height:1.2;margin-top:4px;font-variant-numeric:tabular-nums}
.tb .tb-stat .s{display:block;font-size:12px;color:var(--muted);margin-top:2px;min-height:15px}
.tb .tb-stat.bad b{color:var(--bad)} .tb .tb-stat.good b{color:var(--good)} .tb .tb-stat.warn b{color:var(--warn,#d9a441)}
.tb .tb-seg{margin:0 0 12px}
.tb .tb-bar{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin:0 0 6px}
.tb .tb-bar input,.tb .tb-bar select{padding:8px 10px;border-radius:9px;border:1px solid var(--line);background:var(--panel,transparent);color:inherit;font:inherit;font-size:13.5px;min-width:0}
.tb .tb-bar input{flex:1 1 180px}
.tb .tb-bar label{font-size:12px;color:var(--muted);display:flex;align-items:center;gap:6px}
.tb .tb-row{display:grid;grid-template-columns:54px minmax(0,1fr) auto;gap:14px;align-items:center;padding:12px 0;border-top:1px solid var(--line)}
.tb .tb-play{position:relative;width:54px;height:96px;padding:0;border:0;border-radius:8px;overflow:hidden;background:var(--panel-2,rgba(127,127,127,.14));cursor:pointer;display:block}
.tb .tb-play img{width:100%;height:100%;object-fit:cover;display:block}
.tb .tb-play::after{content:'';position:absolute;left:50%;top:50%;margin:-7px 0 0 -4px;border-style:solid;border-width:7px 0 7px 11px;border-color:transparent transparent transparent #fff;filter:drop-shadow(0 0 3px rgba(0,0,0,.7))}
.tb .tb-nm{overflow-wrap:anywhere;background:none;border:0;padding:0;color:inherit;font:inherit;font-weight:600;cursor:pointer;text-align:left}
.tb .tb-nm:hover{text-decoration:underline}
.tb .tb-sub{font-size:12.5px;color:var(--muted);margin-top:2px;overflow-wrap:anywhere}
.tb .tb-line{font-size:13px;margin-top:5px;opacity:.85;overflow-wrap:anywhere;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.tb .tb-nums{display:grid;grid-template-columns:repeat(4,64px);gap:6px;text-align:right;font-variant-numeric:tabular-nums}
.tb .tb-nums div span{display:block;font-size:11px;font-weight:600;letter-spacing:.04em;text-transform:uppercase;color:var(--muted)}
.tb .tb-nums div b{display:block;font-size:15px;margin-top:1px}
.tb .tb-g{color:var(--good)} .tb .tb-b{color:var(--bad)}
.tb .tb-tags{display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end;max-width:300px}
.tb .tb-key{display:flex;gap:8px;flex-wrap:wrap;margin-top:10px}
.tb .tb-key input{flex:1 1 260px;min-width:0;padding:10px 12px;border-radius:10px;border:1px solid var(--line);background:transparent;color:inherit;font:inherit}
.tb textarea{width:100%;min-height:220px;padding:12px;border-radius:10px;border:1px solid var(--line);background:transparent;color:inherit;font:inherit;line-height:1.5;resize:vertical;box-sizing:border-box}
.tb .tb-foot{display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-top:10px}
.tb .v2tbl td.num,.tb .v2tbl th.num{text-align:right;font-variant-numeric:tabular-nums}
.tb .tb-av,.tb-pop .tb-av{width:28px;height:28px;border-radius:50%;object-fit:cover;vertical-align:middle;margin-right:8px;background:var(--panel-2,rgba(127,127,127,.12))}
.tb-pop{position:fixed;inset:0;z-index:1000;background:rgba(0,0,0,.6);display:flex;align-items:center;justify-content:center;padding:20px}
.tb-pop .tb-sheet{background:var(--panel,#1c1c20);color:var(--text,inherit);border:1px solid var(--line);border-radius:16px;width:min(720px,100%);max-height:90vh;overflow:auto;padding:20px;box-sizing:border-box}
.tb-pop .tb-sheet.vid{width:min(400px,100%)}
.tb-pop video,.tb-pop .tb-img{width:100%;max-height:62vh;border-radius:10px;background:#000;display:block}
.tb-pop h3{margin:0 0 4px;font-size:18px} .tb-pop .x{float:right;background:none;border:0;color:inherit;font-size:22px;line-height:1;cursor:pointer;padding:4px 8px}
.tb-pop .tb-sub{font-size:12.5px;color:var(--muted);margin-top:2px;overflow-wrap:anywhere}
.tb-pop .tb-g{color:var(--good)} .tb-pop .tb-b{color:var(--bad)}
.tb-pop .tb-play{position:relative;width:40px;height:70px;padding:0;border:0;border-radius:8px;overflow:hidden;background:rgba(127,127,127,.14);cursor:pointer;display:block}
.tb-pop .tb-play img{width:100%;height:100%;object-fit:cover;display:block}
.tb-pop .tb-kv{display:grid;grid-template-columns:repeat(auto-fit,minmax(110px,1fr));gap:10px;margin:14px 0}
.tb-pop .tb-kv div{border:1px solid var(--line);border-radius:10px;padding:10px 12px}
.tb-pop .tb-kv span{display:block;font-size:11px;font-weight:600;letter-spacing:.04em;text-transform:uppercase;color:var(--muted)}
.tb-pop .tb-kv b{display:block;font-size:18px;margin-top:2px;font-variant-numeric:tabular-nums}
.tb-pop .tb-said{font-size:13.5px;line-height:1.5;margin-top:12px;white-space:pre-wrap;overflow-wrap:anywhere}
.tb-pop .tb-mini{display:grid;grid-template-columns:40px minmax(0,1fr) auto;gap:10px;align-items:center;padding:8px 0;border-top:1px solid var(--line);font-size:13px}
.tb-pop .tb-foot{display:flex;gap:10px;margin-top:14px}
@media (max-width:900px){
  .tb .tb-top{grid-template-columns:repeat(2,minmax(0,1fr))}
  .tb .tb-row{grid-template-columns:54px minmax(0,1fr)}
  .tb .tb-nums{grid-column:1 / -1;grid-template-columns:repeat(4,1fr);text-align:left}
  .tb .tb-tags{grid-column:1 / -1;justify-content:flex-start;max-width:none}
  .tb .v2btn,.tb .v2jobs button,.tb .tb-bar input,.tb .tb-bar select{min-height:44px}
  .tb-pop{align-items:flex-end;padding:0}
  .tb-pop .tb-sheet,.tb-pop .tb-sheet.vid{width:100%;max-height:92vh;border-radius:18px 18px 0 0;border-bottom:0}
}`;
    document.head.appendChild(st);
  }
  function toast(msg) { const t = document.createElement('div'); t.className = 'lx-toast'; t.textContent = msg; document.body.appendChild(t); setTimeout(() => t.remove(), 2600); }
  const brandName = () => ((H.S.accounts || []).find(a => a.act_id === H.S.act) || {}).name || '';
  const shell = body => `<div class="v2 tb">${H.pageHead('trybe', H.S.act !== 'all' ? `Trybe: ${esc(brandName())}` : 'Trybe')}${body}</div>`;

  async function render(host, first) {
    H = host; css();
    const t = H.RUN();
    const act = H.S.act !== 'all' ? H.S.act : 'all';
    if (first || !DATA || DATA.act !== act) $('#main').innerHTML = shell('<section class="v2card"><p class="v2hint">Reading Trybe…</p></section>');
    let d;
    try { d = await H.apiAH(`/api/trybe?act=${encodeURIComponent(act)}`); if (d && d.error) throw new Error(d.error); }
    catch (e) {
      if (t === H.RUN()) { $('#main').innerHTML = shell(`<section class="v2card"><h3>Could not load Trybe</h3><p class="v2bad">${esc(e.message)}</p><button type="button" class="v2btn" id="tbRetry">Try again</button></section>`); const b = $('#tbRetry'); if (b) b.onclick = () => render(H, true); }
      return;
    }
    if (t !== H.RUN() || !HERE()) return;
    DATA = d; paint();
  }

  function paint(keepFocus) {
    const d = DATA;
    if (d.act === 'all') return paintAll();
    if (!VIEWS().some(v => v[0] === VIEW)) VIEW = VIEWS()[0][0];
    if (!d.has_key) { $('#main').innerHTML = shell(keyCard()); wire(); if (H.pageActions) H.pageActions(''); return; }
    const c = d.counts;
    const badge = { queue: c.not_launched, live: c.live, creators: c.creators };
    const seg = `<div class="v2jobs tb-seg" role="tablist">${VIEWS().map(([id, label]) => `<button type="button" role="tab" data-tbv="${id}" class="${VIEW === id ? 'on' : ''}" aria-selected="${VIEW === id}">${label}${badge[id] != null ? ` (${badge[id]})` : ''}</button>`).join('')}</div>`;
    const body = VIEW === 'queue' ? queue() : VIEW === 'live' ? live() : VIEW === 'creators' ? creators() : rules();
    const meta = `<p class="tb-meta">Updated ${esc(ago(d.synced_at))}. ${CL() ? '' : 'Locus reads Trybe and Meta once a day; press Update for now. '}Sales and revenue are Triple Whale, spend is Meta, last ${d.account.days} days.</p>`;
    $('#main').innerHTML = shell(`${meta}${top()}${seg}${body}`);
    if (H.pageActions) H.pageActions(CL() ? '' : `<button type="button" class="btn" id="tbSync">Update</button>${d.portal ? `<a class="btn primary" id="tbOpen" href="${esc(d.portal)}" target="_blank" rel="noopener">Launch in Trybe</a>` : ''}`);
    wire();
    if (keepFocus) { const el = document.getElementById(keepFocus); if (el) { el.focus(); try { el.setSelectionRange(el.value.length, el.value.length); } catch {} } }
  }

  function top() {
    const d = DATA, a = d.account, c = d.counts;
    const tile = (l, b, s, cls) => `<div class="v2card tb-stat ${cls || ''}"><span class="l">${l}</span><b>${b}</b><span class="s">${s || ''}</span></div>`;
    const cmp = a.trybe_cpa != null && a.cpa != null ? (a.trybe_cpa <= a.cpa ? 'good' : 'bad') : '';
    const t = [];
    if (!CL()) t.push(tile('Not launched', c.not_launched, c.not_launched ? `oldest ${c.oldest} days` : 'nothing waiting', c.stale ? 'bad' : ''));
    if (!CL()) t.push(tile('Launched, no spend', c.no_spend, c.other ? `${c.other} more off or scheduled` : 'on in Meta, waiting', c.no_spend ? 'warn' : ''));
    t.push(tile('Share of Meta spend', a.share == null ? '0%' : pct(a.share), `${money(a.trybe_spend)} of ${money(a.spend)}`));
    t.push(tile('Creator CPA', a.trybe_cpa == null ? 'none' : money(a.trybe_cpa), a.cpa != null ? `account CPA ${money(a.cpa)}` : '', cmp));
    t.push(tile('Live videos', c.live, `${c.creators} creator${c.creators === 1 ? '' : 's'}`));
    if (!CL()) t.push(tile('Ask for more', c.rebook, 'winners gone quiet', c.rebook ? 'good' : ''));
    return `<div class="tb-top">${t.join('')}</div>`;
  }

  /* ---- the bar: search, filter, sort ---- */
  const products = rows => [...new Set(rows.flatMap(r => String(r.product || '').split(', ').filter(Boolean)))].sort();
  const sel = (id, val, opts) => `<select id="${id}">${opts.map(([v, l]) => `<option value="${esc(v)}" ${v === val ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>`;
  function bar(view, rows, filters, sorts) {
    const u = UI[view];
    return `<div class="tb-bar"><input id="tbQ" type="search" placeholder="Search a creator${view === 'creators' ? '' : ', product or words'}" value="${esc(u.q)}" aria-label="Search">
      <label>Show ${sel('tbF', u.f, filters)}</label>
      ${view === 'creators' ? '' : `<label>Product ${sel('tbP', u.p, [['', 'All'], ...products(rows).map(p => [p, p])])}</label>`}
      <label>Sort ${sel('tbS', u.s, sorts)}</label></div>`;
  }
  const hit = (r, q) => !q || [r.creator, r.name, r.product, r.line, r.transcript, r.adset].some(x => String(x || '').toLowerCase().includes(q.toLowerCase()));
  const byProduct = (r, p) => !p || String(r.product || '').split(', ').includes(p);
  const play = r => `<button type="button" class="tb-play" data-tbplay="${esc(r.sub_id)}" aria-label="Watch ${esc(r.creator)}'s video">${r.thumb ? `<img loading="lazy" alt="" src="${esc(r.thumb)}">` : ''}</button>`;
  const who = r => `<button type="button" class="tb-nm" data-tbwho="${esc(r.creator_id)}">${esc(r.creator)}</button>`;

  function queue() {
    const d = DATA, all = d.queue || [], u = UI.queue;
    if (!all.length) return `<section class="v2card"><div class="v2h"><h3>Nothing is waiting</h3></div><p class="v2hint">Every approved video has run as an ad.</p></section>`;
    const rows = all.filter(r => (u.f === 'all' || r.state === u.f || (u.f === 'other' && !['not_launched', 'no_spend'].includes(r.state))) && byProduct(r, u.p) && hit(r, u.q))
      .sort(u.s === 'new' ? (a, b) => a.days - b.days : u.s === 'sales' ? (a, b) => b.creator_orders - a.creator_orders || b.days - a.days : u.s === 'name' ? (a, b) => a.creator.localeCompare(b.creator) : (a, b) => b.days - a.days);
    const list = rows.map(r => {
      const [label, cls] = STATE[r.state] || [r.state, ''];
      const where = r.state === 'not_launched' ? `Approved ${r.days} day${r.days === 1 ? '' : 's'} ago` : `${r.launched ? `Launched ${r.launched_days === 0 ? 'today' : r.launched_days === 1 ? 'yesterday' : `${r.launched_days} days ago`}` : 'In Meta'}${r.adset ? ` in ${esc(r.adset)}` : ''}${r.state === 'scheduled' && r.starts ? `, starts ${esc(r.starts)}` : ''}`;
      return `<div class="tb-row">${play(r)}
      <div>${who(r)}<div class="tb-sub">${r.product ? `Product: ${esc(r.product)}` : 'No product tagged'}</div><div class="tb-sub">${where}</div>${r.line ? `<div class="tb-line">${esc(r.line)}</div>` : ''}</div>
      <div class="tb-tags"><span class="v2pill ${cls}">${label}</span>${r.state === 'not_launched' && r.days >= d.stale_days ? `<span class="v2pill bad">Over ${d.stale_days} days</span>` : ''}${r.creator_orders > 0 ? `<span class="v2pill good">Creator has ${Math.round(r.creator_orders)} sales</span>` : ''}</div></div>`;
    }).join('');
    return `<section class="v2card"><div class="v2h"><h3>${d.counts.not_launched} not launched, ${d.counts.no_spend} launched with no spend yet</h3><span class="cap">${rows.length} shown</span></div>
      <p class="v2hint">Not launched = nobody has built the ad. Launch it in Trybe (Ads, Build Ads) so it runs as a partnership ad and the creator gets paid. A video leaves this list once Meta spends on it.</p>
      ${bar('queue', all, [['not_launched', 'Not launched'], ['no_spend', 'Launched, no spend yet'], ['other', 'Scheduled, in review or off'], ['all', 'Everything']], [['wait', 'Longest waiting'], ['new', 'Newest'], ['sales', "Creator's sales"], ['name', 'Creator A to Z']])}
      ${list || '<p class="v2hint">Nothing matches.</p>'}</section>`;
  }
  function live() {
    const d = DATA, all = d.live || [], a = d.account, u = UI.live;
    if (!all.length) return `<section class="v2card"><div class="v2h"><h3>No creator video spent in the last ${a.days} days</h3></div><p class="v2hint">A video shows here once an ad named with its Trybe id spends.</p></section>`;
    const cmpv = k => (x, y) => (y[k] ?? -1) - (x[k] ?? -1);
    const rows = all.filter(r => (u.f === 'all' || (u.f === 'on' ? r.on > 0 : r.on === 0)) && byProduct(r, u.p) && hit(r, u.q))
      .sort(u.s === 'sales' ? cmpv('orders') : u.s === 'roas' ? cmpv('roas') : u.s === 'cpa' ? (x, y) => (x.cpa ?? 1e9) - (y.cpa ?? 1e9) : u.s === 'name' ? (x, y) => x.creator.localeCompare(y.creator) : cmpv('spend'));
    const list = rows.map(r => {
      const cls = r.cpa != null && a.cpa != null ? (r.cpa <= a.cpa ? 'tb-g' : 'tb-b') : '';
      return `<div class="tb-row">${play(r)}
      <div>${who(r)}<div class="tb-sub">${r.product ? `Product: ${esc(r.product)}` : ''}</div><div class="tb-sub"><span class="v2pill ${r.on ? 'good' : ''}">${r.on ? 'On' : 'Off'}</span> ${r.ads > 1 ? `${r.on} of ${r.ads} ads on. ` : ''}${r.adset ? esc(r.adset) : ''}</div>${r.line ? `<div class="tb-line">${esc(r.line)}</div>` : ''}</div>
      <div class="tb-nums"><div><span>Spend</span><b>${money(r.spend)}</b></div><div><span>Sales</span><b>${n1(r.orders)}</b></div><div><span>CPA</span><b class="${cls}">${r.cpa == null ? 'none' : money(r.cpa)}</b></div><div><span>ROAS</span><b>${r.roas == null ? '' : r.roas.toFixed(2)}</b></div></div></div>`;
    }).join('');
    const on = all.filter(r => r.on > 0).length;
    return `<section class="v2card"><div class="v2h"><h3>${on} on now, ${all.length - on} turned off</h3><span class="cap">${rows.length} shown${a.cpa != null ? ` · account CPA ${money(a.cpa)}` : ''}</span></div>
      <p class="v2hint">Every video whose ads spent in the last ${a.days} days. A video that gets turned off stays here marked Off until it has no spend in that window.${CL() ? '' : ' Scale and cut calls are made on Ads, Calls.'}</p>
      ${bar('live', all, [['on', 'On now'], ['off', 'Turned off'], ['all', 'Everything']], [['spend', 'Most spend'], ['sales', 'Most sales'], ['cpa', 'Lowest CPA'], ['roas', 'Highest ROAS'], ['name', 'Creator A to Z']])}
      ${list || '<p class="v2hint">Nothing matches.</p>'}</section>`;
  }
  function creators() {
    const d = DATA, all = d.creators || [], a = d.account, u = UI.creators;
    if (!all.length) return `<section class="v2card"><div class="v2h"><h3>No creator has a live video yet</h3></div></section>`;
    const cmpv = k => (x, y) => (y[k] ?? -1) - (x[k] ?? -1);
    const rows = all.filter(r => (u.f === 'all' || (u.f === 'rebook' ? r.rebook : r.beats)) && hit(r, u.q))
      .sort(u.s === 'spend' ? cmpv('spend') : u.s === 'sales' ? cmpv('orders') : u.s === 'cpa' ? (x, y) => (x.cpa ?? 1e9) - (y.cpa ?? 1e9) : u.s === 'quiet' ? cmpv('quiet_days') : cmpv('revenue'));
    const trs = rows.map(r => `<tr class="link" data-tbwho="${esc(r.creator_id)}"><td>${r.avatar ? `<img class="tb-av" loading="lazy" alt="" src="${esc(r.avatar)}">` : ''}<span class="nm">${esc(r.name)}</span>${r.rebook && !CL() ? ' <span class="v2pill good" title="Beats the account CPA and has not posted in a while">Ask for more</span>' : ''}</td>
      <td class="num" data-l="Live videos">${r.videos}</td><td class="num" data-l="Spend">${money(r.spend)}</td><td class="num" data-l="Sales">${n1(r.orders)}</td>
      <td class="num" data-l="CPA">${r.cpa == null ? 'none' : `<span class="${a.cpa != null ? (r.cpa <= a.cpa ? 'tb-g' : 'tb-b') : ''}">${money(r.cpa)}</span>`}</td><td class="num" data-l="ROAS">${r.roas == null ? '' : r.roas.toFixed(2)}</td><td class="num" data-l="Revenue">${money(r.revenue)}</td>
      <td class="num" data-l="Last video">${r.quiet_days == null ? '' : `${r.quiet_days}d ago`}</td></tr>`).join('');
    return `<section class="v2card"><div class="v2h"><h3>${all.length} creator${all.length === 1 ? '' : 's'} with live videos</h3><span class="cap">${rows.length} shown${a.cpa != null ? ` · account CPA ${money(a.cpa)}` : ''}</span></div>
      ${CL() ? '' : `<p class="v2hint">Ask for more = at least 2 sales at or under the account CPA, and no new video in ${d.rebook_days} days. Message them for another video. Tap a name for their videos.</p>`}
      ${bar('creators', all, CL() ? [['all', 'Everyone'], ['beats', 'Beats account CPA']] : [['all', 'Everyone'], ['rebook', 'Ask for more'], ['beats', 'Beats account CPA']], [['revenue', 'Most revenue'], ['spend', 'Most spend'], ['sales', 'Most sales'], ['cpa', 'Lowest CPA'], ['quiet', 'Longest quiet']])}
      <div class="v2tbl"><table><thead><tr><th>Creator</th><th class="num">Live videos</th><th class="num">Spend</th><th class="num">Sales</th><th class="num">CPA</th><th class="num">ROAS</th><th class="num">Revenue</th><th class="num">Last video</th></tr></thead><tbody>${trs}</tbody></table></div></section>`;
  }
  function rules() {
    const d = DATA;
    return `<section class="v2card"><div class="v2h"><h3>The rules for creator ads</h3><span class="cap">${d.rules_default ? 'The starting set. Edit them for this brand.' : 'Set for this brand'}</span></div>
      <p class="v2hint">Written the way you would hand them to a new buyer. One rule per line. The numbers behind scale and cut calls are the brand's goals (Brand settings, Goals and ad rules); these lines are the team's playbook for creator videos.</p>
      <textarea id="tbRules" spellcheck="true">${esc(d.rules || '')}</textarea>
      <div class="tb-foot"><button type="button" class="v2btn" id="tbRulesSave">Save rules</button><span class="v2hint">Trybe key checked ${esc(ago(d.key_at))}. <button type="button" class="v2link" id="tbKeyNew">Change the key</button></span></div></section>`;
  }
  function keyCard() {
    if (CL()) return `<section class="v2card"><div class="v2h"><h3>Trybe is not connected yet</h3></div><p class="v2hint">Your Mobius team connects it. Your creators' results show here once they do.</p></section>`;
    return `<section class="v2card"><div class="v2h"><h3>Connect ${esc(brandName())} to Trybe</h3></div>
      <p class="v2hint">Paste this brand's Trybe API key (Trybe brand portal, Settings, API). It starts with tk_live_. Locus checks it with Trybe before keeping it, and never shows it again.</p>
      <div class="tb-key"><input id="tbKey" type="password" autocomplete="off" placeholder="tk_live_..." aria-label="Trybe API key"><button type="button" class="v2btn" id="tbKeySave">Connect</button></div>
      <p class="v2bad" id="tbKeyErr" hidden></p></section>`;
  }
  function paintAll() {
    const d = DATA, b = d.brands || [];
    const rows = b.map(r => `<tr class="link" data-tbact="${esc(r.act_id)}"><td><span class="nm">${esc(r.name)}</span>${r.has_key ? '' : ' <span class="v2pill warn">No key</span>'}</td>
      <td class="num" data-l="Not launched">${r.queue}</td><td class="num" data-l="Over ${d.stale_days} days">${r.stale ? `<span class="tb-b">${r.stale}</span>` : '0'}</td><td class="num" data-l="Oldest">${r.queue ? `${r.oldest}d` : ''}</td><td class="num" data-l="Launched, no spend">${r.no_spend || 0}</td><td class="num" data-l="Waiting on review">${r.pending}</td><td class="num" data-l="Approved">${r.approved}</td><td class="num" data-l="Updated">${esc(ago(r.synced_at))}</td></tr>`).join('');
    const waiting = b.reduce((s, r) => s + r.queue, 0);
    const none = (d.no_key || []).map(x => `<button type="button" class="v2link" data-tbact="${esc(x.act_id)}">${esc(x.name)}</button>`).join(', ');
    $('#main').innerHTML = shell(`<section class="v2card"><div class="v2h"><h3>${waiting} approved video${waiting === 1 ? '' : 's'} not launched</h3><span class="cap">across ${b.length} brand${b.length === 1 ? '' : 's'}</span></div>
      ${b.length ? `<div class="v2tbl"><table><thead><tr><th>Brand</th><th class="num">Not launched</th><th class="num">Over ${d.stale_days} days</th><th class="num">Oldest</th><th class="num">Launched, no spend</th><th class="num">Waiting on review</th><th class="num">Approved</th><th class="num">Updated</th></tr></thead><tbody>${rows}</tbody></table></div>` : '<p class="v2hint">No brand has a Trybe key yet. Open a brand to connect it.</p>'}
      ${none ? `<p class="v2hint">Not connected: ${none}</p>` : ''}
      <div class="tb-foot"><span class="v2hint">Slack lines are <b>${d.alerts ? 'on' : 'off'}</b>: each brand's internal channel hears when approved videos sit ${d.stale_days} days without being launched, and gets Monday's list of creators to ask for more.</span><button type="button" class="v2btn ghost" id="tbAlerts">${d.alerts ? 'Turn off' : 'Turn on'}</button></div></section>`);
    if (H.pageActions) H.pageActions('');
    wire();
  }

  /* ---- pop ups: a bottom sheet on a phone ---- */
  function pop(html, cls) {
    closePop();
    const w = document.createElement('div'); w.className = 'tb-pop'; w.id = 'tbPop';
    w.innerHTML = `<div class="tb-sheet ${cls || ''}" role="dialog" aria-modal="true"><button type="button" class="x" aria-label="Close">×</button>${html}</div>`;
    w.onclick = e => { if (e.target === w || e.target.classList.contains('x')) closePop(); };
    document.body.appendChild(w);
    return w;
  }
  function closePop() { const w = document.getElementById('tbPop'); if (w) { const v = w.querySelector('video'); if (v) v.pause(); w.remove(); } }
  const find = sub => [...(DATA.queue || []), ...(DATA.live || [])].find(r => r.sub_id === sub);
  async function watch(sub) {
    const r = find(sub) || {};
    const w = pop(`<h3>${esc(r.creator || 'Video')}</h3><div class="tb-sub">${r.product ? `Product: ${esc(r.product)}` : ''}</div><div id="tbVid" style="margin-top:12px"><p class="v2hint">Getting the video from Trybe…</p></div>${r.transcript || r.line ? `<div class="tb-said">${esc(r.transcript || r.line)}</div>` : ''}`, 'vid');
    try {
      const v = await H.apiAH(`/api/trybe/video?act=${encodeURIComponent(H.S.act)}&sub=${encodeURIComponent(sub)}`);
      if (v && v.error) throw new Error(v.error);
      const box = w.querySelector('#tbVid'); if (!box) return;
      box.innerHTML = !v.url ? '<p class="v2bad">Trybe has no file for this one.</p>' : v.media === 'image' ? `<img class="tb-img" alt="" src="${esc(v.url)}">` : `<video controls autoplay playsinline poster="${esc(v.thumb || '')}" src="${esc(v.url)}"></video>`;
    } catch (e) { const box = w.querySelector('#tbVid'); if (box) box.innerHTML = `<p class="v2bad">${esc(e.message)}</p>`; }
  }
  function creator(id) {
    const d = DATA, a = d.account;
    const c = (d.creators || []).find(x => x.creator_id === id);
    const lv = (d.live || []).filter(x => x.creator_id === id), qv = (d.queue || []).filter(x => x.creator_id === id);
    const name = (c && c.name) || (lv[0] || qv[0] || {}).creator || 'Creator';
    const kv = c ? `<div class="tb-kv"><div><span>Spend</span><b>${money(c.spend)}</b></div><div><span>Sales</span><b>${n1(c.orders)}</b></div><div><span>CPA</span><b class="${c.cpa != null && a.cpa != null ? (c.cpa <= a.cpa ? 'tb-g' : 'tb-b') : ''}">${c.cpa == null ? 'none' : money(c.cpa)}</b></div><div><span>ROAS</span><b>${c.roas == null ? 'none' : c.roas.toFixed(2)}</b></div><div><span>Revenue</span><b>${money(c.revenue)}</b></div>${c.earnings != null ? `<div><span>Paid by Trybe</span><b>${money(c.earnings)}</b></div>` : ''}</div>` : `<p class="v2hint">No ad of theirs has spent in the last ${a.days} days.</p>`;
    const mini = (r, right) => `<div class="tb-mini">${play(r)}<div><div>${r.product ? esc(r.product) : 'Video'}</div><div class="tb-sub">${esc(r.line || '')}</div></div><div style="text-align:right">${right}</div></div>`;
    const why = c && !CL() ? (c.rebook ? `<p class="v2hint"><b>Ask for more.</b> Their CPA (${money(c.cpa)}) beats the account (${money(a.cpa)}) and their last video was ${c.quiet_days} days ago.</p>` : c.beats ? `<p class="v2hint">Beats the account CPA. Last video ${c.quiet_days} days ago, so no nudge needed yet.</p>` : '') : '';
    pop(`<h3>${c && c.avatar ? `<img class="tb-av" alt="" src="${esc(c.avatar)}">` : ''}${esc(name)}</h3>
      <div class="tb-sub">${c ? `${c.approved} approved video${c.approved === 1 ? '' : 's'}, ${c.videos} live${c.last_video ? `, last video ${esc(c.last_video)}` : ''}` : ''}</div>${why}${kv}
      ${lv.length ? `<h3 style="font-size:14px;margin-top:14px">Live (${lv.length})</h3>${lv.map(r => mini(r, `<b>${money(r.spend)}</b><div class="tb-sub">${n1(r.orders)} sales${r.cpa != null ? `, CPA ${money(r.cpa)}` : ''}</div>`)).join('')}` : ''}
      ${qv.length && !CL() ? `<h3 style="font-size:14px;margin-top:14px">Not run yet (${qv.length})</h3>${qv.map(r => mini(r, `<span class="v2pill ${(STATE[r.state] || [])[1] || ''}">${(STATE[r.state] || [r.state])[0]}</span>`)).join('')}` : ''}
      ${d.portal && !CL() ? `<div class="tb-foot"><a class="v2btn ghost" href="${esc(d.portal)}" target="_blank" rel="noopener">Message them in Trybe</a></div>` : ''}`);
    const w = document.getElementById('tbPop');
    if (w) w.querySelectorAll('[data-tbplay]').forEach(b => { b.onclick = e => { e.stopPropagation(); watch(b.dataset.tbplay); }; });
  }

  function wire() {
    const root = $('#main'); if (!root) return;
    root.querySelectorAll('[data-tbv]').forEach(b => { b.onclick = () => { VIEW = b.dataset.tbv; paint(); }; });
    root.querySelectorAll('[data-tbplay]').forEach(b => { b.onclick = e => { e.stopPropagation(); watch(b.dataset.tbplay); }; });
    root.querySelectorAll('[data-tbwho]').forEach(b => { b.onclick = () => creator(b.dataset.tbwho); });
    root.querySelectorAll('[data-tbact]').forEach(r => { r.onclick = () => { if (H.setViewAct) H.setViewAct(r.dataset.tbact); H.show('trybe'); }; });
    const u = UI[VIEW];
    if (u) {
      const q = $('#tbQ'); if (q) q.oninput = () => { u.q = q.value; paint('tbQ'); };
      for (const [id, k] of [['tbF', 'f'], ['tbP', 'p'], ['tbS', 's']]) { const el = document.getElementById(id); if (el) el.onchange = () => { u[k] = el.value; paint(); }; }
    }
    const sync = document.getElementById('tbSync');
    if (sync) sync.onclick = async () => { sync.disabled = true; sync.textContent = 'Updating…'; try { await ah('/api/trybe/sync', { act: H.S.act }); toast('Updated'); await render(H, false); } catch (e) { toast(e.message); sync.disabled = false; sync.textContent = 'Update'; } };
    const save = $('#tbRulesSave');
    if (save) save.onclick = async () => { save.disabled = true; try { const r = await ah('/api/trybe/rules', { act: H.S.act, rules: $('#tbRules').value }, 'PUT'); DATA.rules = r.rules; DATA.rules_default = r.rules_default; toast('Rules saved'); paint(); } catch (e) { toast(e.message); save.disabled = false; } };
    const al = $('#tbAlerts');
    if (al) al.onclick = async () => { al.disabled = true; try { const r = await ah('/api/trybe/alerts', { on: !DATA.alerts }, 'PUT'); DATA.alerts = r.alerts; toast(r.alerts ? 'Slack lines on' : 'Slack lines off'); paint(); } catch (e) { toast(e.message); al.disabled = false; } };
    const kn = $('#tbKeyNew'); if (kn) kn.onclick = () => { DATA.has_key = false; paint(); };
    const ks = $('#tbKeySave');
    if (ks) ks.onclick = async () => {
      const err = $('#tbKeyErr'); err.hidden = true; ks.disabled = true; ks.textContent = 'Checking with Trybe…';
      try { await ah('/api/trybe/key', { act: H.S.act, key: $('#tbKey').value }, 'PUT'); toast('Connected'); await render(H, true); }
      catch (e) { err.textContent = e.message; err.hidden = false; ks.disabled = false; ks.textContent = 'Connect'; }
    };
  }

  window.TrybeTab = { render };
})();

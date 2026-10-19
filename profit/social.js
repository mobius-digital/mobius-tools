/* LOCUS SOCIAL, phase 1: WATCH (2026-10-19). Plan, audit and the UI research it borrows from (Sandcastles' tall cards
 * with three numbers, Virlo's "usually X, this one Y", hook and format tags, beat-by-beat scripts, topic follows):
 * docs/locus-social/proposal.html (https://claude.ai/artifact/6DCyDxYMGAsfRpeNWzatZH).
 *   Watch      the brands and topics this brand follows, every new post on Instagram, TikTok and YouTube in one feed,
 *              labelled by platform and format, "Breaking out" first (3x that account's usual), Saved, the sounds and
 *              hashtags behind the posts doing best (read off the feed, no extra calls)
 *   A post     the side panel: watch it (a copy we keep, or YouTube's player), the numbers, Make ours: the ideas bot
 *              writes our version (the brand's internal Slack thread too) and sends it to the creator link, a brief
 *              (Asana, the Work board) or Studio
 * Data: account-health /api/social (social.js there). Rail item "Social" shows for brands switched on in Brand
 * settings > Social (window.SocialTab.tabOk / settings). Phase 2 (the Week, posting) adds a second page here. */
(() => {
  let H = null;
  const $ = s => document.querySelector(s);
  const U = () => window.V2UI;
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const store = (k, v) => { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch {} };
  const CLI = () => !!(H && H.S && (H.S.role === 'client' || H.S.client)) || document.body.classList.contains('is-client');
  const PL = { ig: 'Instagram', tt: 'TikTok', yt: 'YouTube' };
  const FM = { reel: 'Reel', carousel: 'Carousel', post: 'Post', tiktok: 'TikTok', photos: 'Photos', short: 'Short', video: 'Video' };
  const FILTERS = [['hot', 'Breaking out'], ['all', 'All'], ['reel', 'Reels'], ['carousel', 'Carousels'], ['post', 'Posts'], ['tiktok', 'TikToks'], ['photos', 'TikTok photos'], ['short', 'Shorts'], ['video', 'YouTube videos']];
  const k = n => { if (n == null) return '–'; const a = Math.abs(n); return a >= 1e6 ? `${(n / 1e6).toFixed(a >= 1e7 ? 0 : 1)}M` : a >= 1e3 ? `${(n / 1e3).toFixed(a >= 1e4 ? 0 : 1)}k` : String(Math.round(n)); };
  const ago = s => { if (!s) return ''; const d = (Date.now() - Date.parse(s)) / 864e5; return d < 1 ? 'today' : d < 2 ? 'yesterday' : d < 30 ? `${Math.floor(d)} days ago` : new Date(s).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }); };
  const ST = { on: [], loaded: false, data: null, act: null, f: store('soc_f') || 'hot', view: 'feed', who: '', tag: '' };

  function css() {
    if (document.getElementById('soccss')) return;
    const st = document.createElement('style'); st.id = 'soccss';
    st.textContent = `
      .soc .soc-top{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin:0 0 12px}
      .soc .soc-top .r{margin-left:auto;display:flex;gap:6px;flex-wrap:wrap}
      .soc .soc-seg{display:inline-flex;border:1px solid var(--line-strong);border-radius:9px;overflow:hidden}
      .soc .soc-seg button{border:0;background:none;padding:6px 12px;font:inherit;font-size:12.5px;font-weight:600;color:var(--ink-2);cursor:pointer}
      .soc .soc-seg button.on{background:var(--ink);color:var(--surface)}
      .soc-btn{display:inline-flex;align-items:center;gap:6px;padding:6px 11px;border-radius:8px;border:1px solid var(--line-strong);background:var(--surface);font:inherit;font-weight:600;font-size:12.5px;cursor:pointer;color:var(--ink)}
      .soc-btn.pri{background:var(--brand);border-color:var(--brand);color:var(--on-brand,#fff)} .soc-btn:disabled{opacity:.55;cursor:default}
      .soc .soc-chips{display:flex;gap:6px;flex-wrap:wrap;margin:0 0 12px}
      .soc-chip{display:inline-flex;align-items:center;gap:5px;padding:3px 10px;border:1px solid var(--line-strong);border-radius:99px;font:inherit;font-size:12px;font-weight:600;color:var(--ink-2);background:none;cursor:pointer}
      .soc-chip.on{border-color:var(--brand);color:var(--brand);background:color-mix(in srgb,var(--brand) 10%,var(--surface))}
      .soc-chip small{font-weight:500;color:var(--muted)}
      .soc .soc-warn{border:1px solid var(--warn);background:color-mix(in srgb,var(--warn) 10%,var(--surface));border-radius:10px;padding:10px 12px;font-size:13px;line-height:1.5;margin:0 0 12px;color:var(--ink)}
      .soc .soc-trend{display:flex;gap:6px;flex-wrap:wrap;align-items:center;border:1px dashed var(--line-strong);border-radius:10px;padding:8px 10px;margin:0 0 12px}
      .soc .soc-trend .lb{font-size:10.5px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--warn);margin-right:2px}
      .soc .soc-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(190px,1fr));gap:12px}
      .soc .soc-post{border:1px solid var(--line);border-radius:10px;overflow:hidden;background:var(--surface);display:flex;flex-direction:column;min-width:0;cursor:pointer;text-align:left;padding:0;font:inherit;color:var(--ink)}
      .soc .soc-post:hover{border-color:var(--line-strong);box-shadow:0 6px 18px -12px rgba(0,0,0,.5)}
      .soc .soc-th{position:relative;aspect-ratio:9/13;max-width:100%;background:var(--surface-2,#222) center/cover no-repeat;display:flex;align-items:flex-end}
      .soc .soc-th .fmt{position:absolute;top:8px;left:8px;font-size:10.5px;font-weight:700;letter-spacing:.04em;background:rgba(0,0,0,.6);color:#fff;padding:2px 7px;border-radius:5px}
      .soc .soc-th .pf{position:absolute;top:8px;right:8px;font-size:10.5px;font-weight:700;background:rgba(0,0,0,.6);color:#fff;padding:2px 7px;border-radius:5px}
      .soc .soc-th .cap{width:100%;padding:28px 9px 8px;font-size:12px;line-height:1.35;color:#fff;background:linear-gradient(transparent,rgba(0,0,0,.75));display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}
      .soc .soc-th .sv{position:absolute;bottom:8px;right:8px;font-size:15px;color:#ffd166;text-shadow:0 1px 3px #000}
      .soc .soc-th.none{background:linear-gradient(160deg,var(--surface-2,#2a2a2a),var(--line))}
      .soc .soc-pm{padding:9px 10px 10px;display:grid;gap:5px;font-size:12.5px}
      .soc .soc-pm .who{font-weight:650;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      .soc-tags{display:flex;gap:4px;flex-wrap:wrap}
      .soc-tags span{font-size:10.5px;font-weight:600;padding:1px 6px;border-radius:4px;border:1px solid var(--line);color:var(--muted)}
      .soc-st{display:flex;gap:8px;align-items:center;font-variant-numeric:tabular-nums;color:var(--ink-2)}
      .soc-ox{font-weight:700;padding:0 6px;border-radius:4px;color:var(--good,#2f9e6b);background:color-mix(in srgb,var(--good,#2f9e6b) 14%,transparent)}
      .soc-ox.mid{color:var(--warn);background:color-mix(in srgb,var(--warn) 14%,transparent)} .soc-ox.lo{color:var(--muted);background:none;border:1px solid var(--line)}
      .soc .soc-pm .us{font-size:11.5px;color:var(--muted)}
      .soc .soc-pm .made{font-size:11.5px;font-weight:650;color:var(--brand)}
      .soc .soc-empty{display:grid;gap:10px;justify-items:start}
      .soc-pn{display:grid;gap:14px}
      .soc-pn .media{border-radius:10px;overflow:hidden;background:#000;display:flex;justify-content:center}
      .soc-pn .media video,.soc-pn .media img{max-width:100%;max-height:62vh;display:block}
      .soc-pn .media iframe{width:100%;aspect-ratio:9/16;max-height:62vh;border:0}
      .soc-pn .nums{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px}
      .soc-pn .nums div{border:1px solid var(--line);border-radius:8px;padding:8px;display:grid;gap:2px} .soc-pn .nums b{font-size:16px;font-variant-numeric:tabular-nums} .soc-pn .nums span{font-size:11px;color:var(--muted)}
      .soc-pn .capt{font-size:13px;line-height:1.5;white-space:pre-wrap;color:var(--ink-2);max-height:9em;overflow:auto}
      .soc-pn h4{margin:0;font-size:13px}
      .soc-pn textarea{width:100%;min-height:56px;border:1px solid var(--line-strong);border-radius:8px;background:var(--surface);color:var(--ink);font:inherit;font-size:13px;padding:8px}
      .soc-pn .beats{display:grid;gap:6px}
      .soc-pn .beat{display:grid;grid-template-columns:70px minmax(0,1fr);gap:8px;align-items:start;font-size:13px;background:var(--surface-2,rgba(127,127,127,.08));border-radius:7px;padding:7px 9px}
      .soc-pn .beat i{font-style:normal;font-size:10.5px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:var(--muted);padding-top:2px}
      .soc-pn .beat.hk{background:color-mix(in srgb,var(--warn) 14%,transparent)} .soc-pn .beat.hk i{color:var(--warn)}
      .soc-pn .dest{display:flex;gap:6px;flex-wrap:wrap}
      .soc-pn .sent{font-size:12.5px;color:var(--good,#2f9e6b);font-weight:600}
      .soc-pn .err{color:var(--bad);font-size:12.5px}
      .soc-m .fl{display:grid;gap:12px} .soc-m h3{margin:0;font-size:16px}
      .soc-m label.f{display:grid;gap:5px;font-size:12.5px;font-weight:600}
      .soc-m input[type=text]{width:100%;padding:8px 10px;border-radius:8px;border:1px solid var(--line-strong);background:var(--surface);color:var(--ink);font:inherit}
      .soc-m .foot{display:flex;gap:8px;justify-content:flex-end} .soc-m .err{color:var(--bad);font-size:12.5px;min-height:1em}
      .soc-m .three{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}
      @media (max-width:560px){.soc-m .three{grid-template-columns:1fr}.soc .soc-grid{grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}.soc-pn .nums{grid-template-columns:repeat(2,minmax(0,1fr))}}
      .soc-fl{display:grid;gap:8px}
      .soc-fl .row{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:8px;align-items:center;border:1px solid var(--line);border-radius:9px;padding:9px 11px}
      .soc-fl .row b{font-size:13.5px} .soc-fl .row small{display:block;color:var(--muted);font-size:11.5px;margin-top:2px} .soc-fl .row .e{color:var(--warn)}
      .soc-fl .row .acts{display:flex;gap:6px}`;
    document.head.appendChild(st);
  }

  /* ---------- the switch (Brand settings > Social) and the rail ---------- */
  async function loadBrands(fresh) {
    try { const r = await H.apiAH('/api/social/brands', fresh ? { fresh: true } : {}); ST.on = r.on || []; ST.loaded = true; } catch { ST.loaded = true; }
    return ST.on;
  }
  const tabOk = act => ST.on.includes(act) || (act === 'all' && ST.on.length > 0);

  async function settings(el, act, host) {
    H = host || H; css();
    if (!el) return;
    if (!act || act === 'all') { el.innerHTML = '<p class="v2hint">Pick a brand to switch Social on or off.</p>'; return; }
    await loadBrands(true);
    const on = ST.on.includes(act);
    el.innerHTML = `<div class="soc" style="display:grid;gap:10px">
      <p class="v2hint" style="max-width:68ch">Social watches the brands and topics this brand follows on Instagram, TikTok and YouTube, flags the posts doing far better than usual, and turns any of them into our own version (creator link, a brief or Studio). Posting comes next.</p>
      <label style="display:flex;gap:8px;align-items:center;font-weight:600"><input type="checkbox" id="socOn" ${on ? 'checked' : ''}> Show Social for this brand</label>
      <p class="v2hint" id="socOnMsg"></p><div id="socConnect"></div></div>`;
    const connect = () => { const c = el.querySelector('#socConnect'); if (!c) return; if (ST.on.includes(act) && window.SocialWeek) window.SocialWeek.connect(c, act, H); else c.innerHTML = ''; };
    connect();
    el.querySelector('#socOn').onchange = async e => {
      const msg = el.querySelector('#socOnMsg');
      try { await H.apiAH('/api/social/brand', { method: 'PUT', body: JSON.stringify({ act, on: e.target.checked }) }); await loadBrands(true); rail(act); msg.textContent = e.target.checked ? 'On. Social is in the rail now.' : 'Off. Follows and saved posts are kept.'; connect(); }
      catch (err) { e.target.checked = !e.target.checked; msg.textContent = err.message; }
    };
  }
  function rail(act) { const b = document.getElementById('railSocial'); if (b) b.hidden = !tabOk(act); }

  /* ---------- the page ---------- */
  async function render(tab, host, first) {
    H = host; css();
    const act = H.S.act;
    const t = H.RUN();
    const head = H.pageHead('social', 'Social');
    if (!act || act === 'all') { $('#main').innerHTML = `<div class="v2 soc">${head}<div class="v2card"><p class="v2hint">Pick a brand at the top to see what the brands it follows are posting.</p></div></div>`; return; }
    if (first || ST.act !== act) $('#main').innerHTML = `<div class="v2 soc">${head}<div class="v2card"><p class="v2hint">Loading what they posted…</p></div></div>`;
    let d;
    try { d = await H.apiAH(`/api/social?act=${encodeURIComponent(act)}`, { fresh: true }); }
    catch (e) { if (t === H.RUN()) $('#main').innerHTML = `<div class="v2 soc">${head}<div class="v2card"><p class="v2bad">${esc(e.message)}</p></div></div>`; return; }
    if (t !== H.RUN()) return;
    ST.data = d; ST.act = act;
    draw();
  }
  function brandName() { return ((H.S.accounts || []).find(a => a.act_id === ST.act) || {}).name || 'This brand'; }

  function draw() {
    const d = ST.data, head = H.pageHead('social', 'Social');
    if (!d.on) {
      $('#main').innerHTML = `<div class="v2 soc">${head}<div class="v2card soc-empty"><p>Social is off for ${esc(brandName())}.</p>${CLI() ? '' : '<button type="button" class="soc-btn pri" id="socTurn">Switch it on</button>'}</div></div>`;
      const b = $('#socTurn'); if (b) b.onclick = async () => { b.disabled = true; await H.apiAH('/api/social/brand', { method: 'PUT', body: JSON.stringify({ act: ST.act, on: true }) }); await loadBrands(true); rail(ST.act); render('social', H, true); };
      return;
    }
    const posts = d.posts || [];
    const hot = posts.filter(p => p.breaking);
    if (ST.f === 'hot' && !hot.length && posts.length) ST.f = 'all';
    let list = ST.view === 'saved' ? posts.filter(p => p.saved || p.idea_id) : posts;
    if (ST.view !== 'saved') list = ST.f === 'hot' ? hot : ST.f === 'all' ? list : list.filter(p => p.fmt === ST.f);
    if (ST.who) list = list.filter(p => p.follow_id === ST.who);
    if (ST.tag) list = list.filter(p => ST.tag.startsWith('#') ? String(p.caption).toLowerCase().includes(ST.tag) : p.sound === ST.tag);
    list = ST.f === 'hot' && ST.view !== 'saved' ? [...list].sort((a, b) => (b.ratio || 0) - (a.ratio || 0)) : list;
    const counts = Object.fromEntries(FILTERS.map(([f]) => [f, f === 'hot' ? hot.length : f === 'all' ? posts.length : posts.filter(p => p.fmt === f).length]));
    const fol = d.follows || [];
    const tr = d.trends || { tags: [], sounds: [] };
    const trend = (tr.sounds.length || tr.tags.length) && ST.view !== 'saved' ? `<div class="soc-trend"><span class="lb">Doing well lately</span>${tr.sounds.map(s => `<button type="button" class="soc-chip ${ST.tag === s.name ? 'on' : ''}" data-tag="${esc(s.name)}" ${U() ? U().tipAttr(`A sound in ${s.posts} post${s.posts === 1 ? '' : 's'} doing better than usual`) : ''}>&#9835; ${esc(s.name)}</button>`).join('')}${tr.tags.map(s => `<button type="button" class="soc-chip ${ST.tag === s.name ? 'on' : ''}" data-tag="${esc(s.name)}">${esc(s.name)} <small>${s.posts}</small></button>`).join('')}</div>` : '';
    const body = !fol.length ? emptyState() : !list.length ? `<div class="v2card"><p class="v2hint">${ST.view === 'saved' ? 'Nothing saved yet. Star a post, or Make ours, and it stays here.' : posts.length ? 'Nothing here with these filters.' : 'No posts yet. The first pull runs when you follow; check the follows list for anything that did not come back.'}</p></div>` : `<div class="soc-grid">${list.slice(0, 240).map(card).join('')}</div>`;
    $('#main').innerHTML = `<div class="v2 soc">${head}
      <div class="soc-top"><span class="soc-seg"><button type="button" data-view="feed" class="${ST.view === 'feed' ? 'on' : ''}">Feed</button><button type="button" data-view="saved" class="${ST.view === 'saved' ? 'on' : ''}">Saved</button></span>
        ${fol.length ? `<select id="socWho" class="soc-btn" aria-label="Whose posts"><option value="">Everyone (${fol.length})</option>${fol.map(f => `<option value="${esc(f.id)}" ${ST.who === f.id ? 'selected' : ''}>${esc(f.kind === 'topic' ? `Topic: ${f.name}` : f.name)}</option>`).join('')}</select>` : ''}
        <span class="r"><button type="button" class="soc-btn" id="socFol">Following ${fol.length}</button><button type="button" class="soc-btn pri" id="socAdd">+ Follow</button></span></div>
      ${d.credits != null && d.credits < 1000 && !CLI() ? `<div class="soc-warn"><b>The ScrapeCreators account is running low: ${Number(d.credits).toLocaleString('en-US')} credits left.</b> ${d.credits < d.low ? 'The daily pull has stopped so the ideas bot keeps the last ones.' : 'The daily pull stops at ' + d.low + '.'} Top it up at <a href="https://app.scrapecreators.com" target="_blank" rel="noopener">scrapecreators.com</a> ($47 buys 25,000, enough for well over a year of this).</div>` : ''}
      ${trend}
      ${ST.view === 'saved' || !fol.length ? '' : `<div class="soc-chips">${FILTERS.filter(([f]) => f === 'hot' || f === 'all' || counts[f]).map(([f, l]) => `<button type="button" class="soc-chip ${ST.f === f ? 'on' : ''}" data-f="${f}">${l} <small>${counts[f]}</small></button>`).join('')}</div>`}
      ${body}</div>`;
    wire(list);
  }
  function emptyState() {
    return `<div class="v2card soc-empty"><b>Follow the brands you watch</b><p class="v2hint" style="max-width:62ch">Type a brand's handle (like @takomogolf) and Locus finds it on Instagram, TikTok and YouTube, then pulls every new post once a day. Or follow a topic (like "golf short game") to see what is breaking out beyond the brands you know.</p><button type="button" class="soc-btn pri" id="socAdd2">+ Follow a brand or topic</button></div>`;
  }
  function ratioChip(p) {
    if (p.ratio == null) return '';
    const cls = p.ratio >= 3 ? '' : p.ratio >= 1.5 ? 'mid' : 'lo';
    const tipT = p.base_kind === 'followers' ? `${k(p.views)} views on an account with ${k(p.base)} followers` : `This one ${k(p[p.metric])} ${p.metric}, usually ${k(p.base)}`;
    return `<span class="soc-ox ${cls}" ${U() ? U().tipAttr(tipT) : ''}>${p.ratio >= 10 ? Math.round(p.ratio) : p.ratio.toFixed(1)}x</span>`;
  }
  const engOf = p => p.views ? (((p.likes || 0) + (p.comments || 0)) / p.views) : null;
  function card(p) {
    const big = p.views != null ? `${k(p.views)} views` : p.likes != null ? `${k(p.likes)} likes` : '';
    const eng = engOf(p);
    const us = p.base == null ? '' : p.base_kind === 'followers' ? `${k(p.base)} followers` : `usually ${k(p.base)}`;
    return `<button type="button" class="soc-post" data-id="${esc(p.id)}">
      <div class="soc-th ${p.thumb ? '' : 'none'}" ${p.thumb ? `style="background-image:url('${esc(p.thumb)}')"` : ''}><span class="fmt">${esc((FM[p.fmt] || p.fmt || '').toUpperCase())}${p.slides ? ` · ${p.slides}` : ''}</span><span class="pf">${esc(PL[p.plat] || '')}</span>${p.saved ? '<span class="sv">&#9733;</span>' : ''}<span class="cap">${esc(p.caption || '')}</span></div>
      <div class="soc-pm"><span class="who">${esc(p.who || p.handle)}${p.handle && p.who !== p.handle ? ` <small style="color:var(--muted);font-weight:500">@${esc(p.handle)}</small>` : ''}</span>
        ${p.hook || p.ftag ? `<span class="soc-tags">${p.hook ? `<span>${esc(p.hook)}</span>` : ''}${p.ftag ? `<span>${esc(p.ftag)}</span>` : ''}</span>` : ''}
        <span class="soc-st">${ratioChip(p)}<span>${big}</span>${eng != null ? `<span ${U() ? U().tipAttr('Likes and comments per view') : ''}>${(eng * 100).toFixed(1)}%</span>` : ''}</span>
        <span class="us">${[us, ago(p.posted_at)].filter(Boolean).join(' · ')}</span>
        ${p.idea_id ? '<span class="made">Our version started</span>' : ''}</div></button>`;
  }
  function wire(list) {
    const m = $('#main');
    m.querySelectorAll('[data-view]').forEach(b => b.onclick = () => { ST.view = b.dataset.view; draw(); });
    m.querySelectorAll('[data-f]').forEach(b => b.onclick = () => { ST.f = b.dataset.f; store('soc_f', ST.f); draw(); });
    m.querySelectorAll('[data-tag]').forEach(b => b.onclick = () => { ST.tag = ST.tag === b.dataset.tag ? '' : b.dataset.tag; if (ST.tag && ST.f === 'hot') ST.f = 'all'; draw(); });
    const who = m.querySelector('#socWho'); if (who) who.onchange = () => { ST.who = who.value; draw(); };
    [m.querySelector('#socAdd'), m.querySelector('#socAdd2')].forEach(b => b && (b.onclick = followModal));
    const fl = m.querySelector('#socFol'); if (fl) fl.onclick = followsPanel;
    m.querySelectorAll('.soc-post').forEach(b => b.onclick = () => openPost(list.find(p => p.id === b.dataset.id) || ST.data.posts.find(p => p.id === b.dataset.id)));
  }
  async function reload() { await render('social', H, false); }

  /* ---------- modals (in-app, never prompt()) ---------- */
  function modal(html) {
    const w = document.createElement('div'); w.className = 'modal-wrap soc-m';
    w.innerHTML = `<div class="modal" style="max-width:480px;display:block;padding:18px 20px">${html}</div>`;
    document.body.appendChild(w);
    const done = () => { w.remove(); document.removeEventListener('keydown', kd); };
    const kd = e => { if (e.key === 'Escape') done(); };
    document.addEventListener('keydown', kd);
    w.addEventListener('mousedown', e => { if (e.target === w) done(); });
    w.querySelectorAll('[data-x]').forEach(b => b.onclick = done);
    return { w, done };
  }
  function followModal() {
    let kind = 'brand';
    const { w, done } = modal(`<div class="fl"><h3>Follow</h3>
      <span class="soc-seg" style="justify-self:start"><button type="button" data-k="brand" class="on">A brand</button><button type="button" data-k="topic">A topic</button></span>
      <label class="f"><span id="smL">The brand's handle</span><input type="text" id="smT" maxlength="80" placeholder="@takomogolf" autocomplete="off"></label>
      <p class="v2hint" id="smH" style="margin:0">Locus looks for the same handle on Instagram, TikTok and YouTube. A different handle somewhere? Add it below.</p>
      <details id="smD"><summary style="cursor:pointer;font-size:12.5px;color:var(--muted)">Different handle on a platform</summary><div class="three" style="margin-top:8px">
        <label class="f">Instagram<input type="text" id="smIg" placeholder="@" autocomplete="off"></label><label class="f">TikTok<input type="text" id="smTt" placeholder="@" autocomplete="off"></label><label class="f">YouTube<input type="text" id="smYt" placeholder="@" autocomplete="off"></label></div></details>
      <div class="err" id="smE"></div>
      <div class="foot"><button type="button" class="soc-btn" data-x="1">Cancel</button><button type="button" class="soc-btn pri" id="smS">Follow</button></div></div>`);
    const set = v => { kind = v; w.querySelectorAll('[data-k]').forEach(b => b.classList.toggle('on', b.dataset.k === v)); w.querySelector('#smL').textContent = v === 'topic' ? 'The topic' : 'The brand’s handle'; w.querySelector('#smT').placeholder = v === 'topic' ? 'golf short game' : '@takomogolf'; w.querySelector('#smH').textContent = v === 'topic' ? 'Searches TikTok, Instagram Reels and YouTube for this week’s posts on it, and flags the ones doing far better than the account’s size.' : 'Locus looks for the same handle on Instagram, TikTok and YouTube. A different handle somewhere? Add it below.'; w.querySelector('#smD').hidden = v === 'topic'; };
    w.querySelectorAll('[data-k]').forEach(b => b.onclick = () => set(b.dataset.k));
    const inp = w.querySelector('#smT'); inp.focus();
    const go = async () => {
      const btn = w.querySelector('#smS'), err = w.querySelector('#smE');
      btn.disabled = true; btn.textContent = kind === 'topic' ? 'Searching…' : 'Looking it up…'; err.textContent = '';
      try {
        const r = await H.apiAH('/api/social/follow', { method: 'POST', body: JSON.stringify({ act: ST.act, kind, text: inp.value, ig: w.querySelector('#smIg').value || undefined, tt: w.querySelector('#smTt').value || undefined, yt: w.querySelector('#smYt').value || undefined }) });
        const f = r.follow || {}, pl = r.pulled || {};
        const where = kind === 'topic' ? '' : ['ig', 'tt', 'yt'].filter(x => f[x]).map(x => PL[x]).join(', ');
        done(); toast(`${kind === 'topic' ? `Following "${f.name}"` : `Following ${f.name}${where ? ` on ${where}` : ''}`}: ${pl.posts || 0} posts in.${pl.error ? ` ${pl.error}` : ''}`);
        reload();
      } catch (e) { err.textContent = e.message; btn.disabled = false; btn.textContent = 'Follow'; }
    };
    w.querySelector('#smS').onclick = go;
    inp.onkeydown = e => { if (e.key === 'Enter') go(); };
  }
  function toast(t) {
    const el = document.createElement('div');
    el.style.cssText = 'position:fixed;left:50%;bottom:calc(24px + env(safe-area-inset-bottom,0px));transform:translateX(-50%);background:var(--ink);color:var(--surface);padding:10px 14px;border-radius:9px;font-size:13px;z-index:9999;max-width:min(560px,92vw);box-shadow:0 8px 24px -10px rgba(0,0,0,.6)';
    el.textContent = t; document.body.appendChild(el); setTimeout(() => el.remove(), 5200);
  }

  /* ---------- the follows list ---------- */
  function followsPanel() {
    const fol = ST.data.follows || [];
    const row = f => `<div class="row" data-fid="${esc(f.id)}"><div><b>${esc(f.kind === 'topic' ? `Topic: ${f.name}` : f.name)}</b>
      <small>${f.kind === 'topic' ? 'TikTok, Instagram Reels, YouTube' : ['ig', 'tt', 'yt'].filter(x => f[x]).map(x => `${PL[x]} @${esc(f[x])}`).join(' · ') || 'No handles'}</small>
      <small>${f.posts} posts · ${f.pulled_at ? `pulled ${esc(ago(f.pulled_at.replace(' ', 'T') + 'Z'))}` : 'not pulled yet'}</small>${f.error ? `<small class="e">${esc(f.error)}</small>` : ''}</div>
      <span class="acts">${f.kind === 'brand' ? '<button type="button" class="soc-btn" data-ed="1">Handles</button>' : ''}<button type="button" class="soc-btn" data-rm="1">Stop</button></span></div>`;
    const body = U().panel('Following', `<div class="soc-pn"><div class="soc-fl">${fol.map(row).join('') || '<p class="v2hint">Nothing yet.</p>'}</div>
      <div style="display:flex;gap:8px;flex-wrap:wrap"><button type="button" class="soc-btn pri" id="sfAdd">+ Follow</button>${CLI() ? '' : '<button type="button" class="soc-btn" id="sfPull">Pull everything now</button>'}</div>
      <p class="v2hint">Each one is pulled once a day. A pull is about a fifth of a cent per platform.</p></div>`);
    body.querySelector('#sfAdd').onclick = followModal;
    const pull = body.querySelector('#sfPull');
    if (pull) pull.onclick = async () => { pull.disabled = true; pull.textContent = 'Pulling…'; try { const r = await H.apiAH('/api/social/pull', { method: 'POST', body: JSON.stringify({ act: ST.act }) }); toast(`Pulled ${r.pulled.length}: ${r.pulled.reduce((s, x) => s + (x.added || 0), 0)} new posts.`); await reload(); followsPanel(); } catch (e) { pull.textContent = e.message; } };
    body.querySelectorAll('[data-fid]').forEach(el => {
      const f = fol.find(x => x.id === el.dataset.fid);
      const rm = el.querySelector('[data-rm]');
      rm.onclick = async () => {
        if (!(await H.confirmModal(`Stop following ${f.name}?`, 'Its posts leave the feed. Saved posts and posts you made into ours stay.', 'Stop following'))) return;
        try { await H.apiAH(`/api/social/follow?id=${encodeURIComponent(f.id)}`, { method: 'DELETE' }); await reload(); followsPanel(); } catch (e) { toast(e.message); }
      };
      const ed = el.querySelector('[data-ed]');
      if (ed) ed.onclick = () => {
        const { w, done } = modal(`<div class="fl"><h3>${esc(f.name)}</h3><p class="v2hint" style="margin:0">Leave a box empty to skip that platform.</p>
          <label class="f">Name<input type="text" id="seN" value="${esc(f.name)}"></label>
          <div class="three"><label class="f">Instagram<input type="text" id="seIg" value="${esc(f.ig || '')}"></label><label class="f">TikTok<input type="text" id="seTt" value="${esc(f.tt || '')}"></label><label class="f">YouTube<input type="text" id="seYt" value="${esc(f.yt || '')}"></label></div>
          <div class="err" id="seE"></div><div class="foot"><button type="button" class="soc-btn" data-x="1">Cancel</button><button type="button" class="soc-btn pri" id="seS">Save and pull</button></div></div>`);
        w.querySelector('#seS').onclick = async () => {
          const b = w.querySelector('#seS'); b.disabled = true; b.textContent = 'Pulling…';
          try { const r = await H.apiAH('/api/social/follow', { method: 'PUT', body: JSON.stringify({ id: f.id, name: w.querySelector('#seN').value, ig: w.querySelector('#seIg').value, tt: w.querySelector('#seTt').value, yt: w.querySelector('#seYt').value }) }); done(); toast(`${r.pulled.posts || 0} posts in.${r.pulled.error ? ` ${r.pulled.error}` : ''}`); await reload(); followsPanel(); }
          catch (e) { w.querySelector('#seE').textContent = e.message; b.disabled = false; b.textContent = 'Save and pull'; }
        };
      };
    });
  }

  /* ---------- one post: watch it, the numbers, Make ours ---------- */
  const DEST = { creator_link: 'Creator link', asana_brief: 'Brief (Work board)', studio: 'Studio' };
  let poll = null;
  async function openPost(p) {
    if (!p) return;
    clearTimeout(poll);
    const eng = engOf(p);
    const nums = [[p.views, 'views'], [p.likes, 'likes'], [p.comments, 'comments'], [p.shares ?? p.saves, p.shares != null ? 'shares' : 'saves']].filter(x => x[0] != null);
    const us = p.base == null ? 'Not enough posts from this account yet to say what is usual.' : p.base_kind === 'followers' ? `${k(p.views)} views on an account with ${k(p.base)} followers (${p.ratio}x).` : `This one has ${k(p[p.metric])} ${p.metric}; this account usually gets ${k(p.base)} on ${PL[p.plat]} (${p.ratio}x).`;
    U().panel.wide = true;
    const body = U().panel(`${FM[p.fmt] || 'Post'} from ${p.who || p.handle}`, `<div class="soc-pn">
      <div class="media" id="spMedia">${p.thumb ? `<img src="${esc(p.thumb)}" alt="">` : ''}</div>
      <div style="display:flex;gap:6px;flex-wrap:wrap">${['reel', 'tiktok', 'short', 'video'].includes(p.fmt) ? '<button type="button" class="soc-btn pri" id="spPlay">&#9654; Play</button>' : ''}<a class="soc-btn" href="${esc(p.url)}" target="_blank" rel="noopener">Open on ${esc(PL[p.plat])}</a><button type="button" class="soc-btn" id="spSave">${p.saved ? '&#9733; Saved' : '&#9734; Save'}</button></div>
      <div class="nums">${nums.map(([n, l]) => `<div><b>${k(n)}</b><span>${l}</span></div>`).join('')}</div>
      <p class="v2hint" style="margin:0">${esc(us)}${eng != null ? ` ${(eng * 100).toFixed(1)}% liked or commented.` : ''} Posted ${esc(ago(p.posted_at))}.${p.sound ? ` Sound: ${esc(p.sound)}.` : ''}</p>
      ${p.hook || p.ftag ? `<span class="soc-tags">${p.hook ? `<span>Hook: ${esc(p.hook)}</span>` : ''}${p.ftag ? `<span>${esc(p.ftag)}</span>` : ''}</span>` : ''}
      ${p.caption ? `<div class="capt">${esc(p.caption)}</div>` : ''}
      <div id="spMake"></div></div>`);
    const play = body.querySelector('#spPlay');
    if (play) play.onclick = async () => {
      play.disabled = true; play.textContent = 'Loading the video…';
      try {
        const r = await H.apiAH('/api/social/video', { method: 'POST', body: JSON.stringify({ id: p.id }) });
        const m = body.querySelector('#spMedia');
        if (r.embed) m.innerHTML = `<iframe src="${esc(r.embed)}" allow="autoplay; encrypted-media; picture-in-picture" allowfullscreen></iframe>`;
        else if (r.src) m.innerHTML = `<video src="${esc(r.src)}" controls autoplay playsinline ${p.thumb ? `poster="${esc(p.thumb)}"` : ''}></video>`;
        else throw new Error(r.error || 'No video in that post.');
        play.remove();
      } catch (e) { play.textContent = e.message; }
    };
    body.querySelector('#spSave').onclick = async e => {
      const b = e.currentTarget; const next = !p.saved;
      try { await H.apiAH('/api/social/save', { method: 'POST', body: JSON.stringify({ id: p.id, saved: next }) }); p.saved = next; b.innerHTML = next ? '&#9733; Saved' : '&#9734; Save'; const c = $(`.soc-post[data-id="${CSS.escape(p.id)}"] .soc-th`); if (c) { const sv = c.querySelector('.sv'); if (next && !sv) c.insertAdjacentHTML('beforeend', '<span class="sv">&#9733;</span>'); if (!next && sv) sv.remove(); } }
      catch (err) { toast(err.message); }
    };
    makeBox(body.querySelector('#spMake'), p);
  }
  function makeBox(el, p) {
    if (CLI()) { el.innerHTML = '<p class="v2hint">Want our version of this? Save it and tell the Mobius team in Requests.</p>'; return; }
    if (!p.idea_id) {
      el.innerHTML = `<div style="display:grid;gap:8px"><h4>Make ours</h4><p class="v2hint" style="margin:0">Claude watches it and writes ${esc(brandName())}'s version: a new angle, our product, never their footage. The draft also lands in the brand's internal Slack channel. About 20 to 30 cents.</p>
        <textarea id="smNote" placeholder="Anything to steer it (optional): use the Ice & Gold wedge, keep the POV hook…"></textarea>
        <div><button type="button" class="soc-btn pri" id="smGo">Make ours</button></div><div class="err" id="smErr"></div></div>`;
      el.querySelector('#smGo').onclick = async () => {
        const b = el.querySelector('#smGo'); b.disabled = true; b.textContent = 'Starting…';
        try { const r = await H.apiAH('/api/social/make', { method: 'POST', body: JSON.stringify({ id: p.id, note: el.querySelector('#smNote').value }) }); p.idea_id = r.idea_id; p.saved = true; showState(el, p, r.state); }
        catch (e) { el.querySelector('#smErr').textContent = e.message; b.disabled = false; b.textContent = 'Make ours'; }
      };
      return;
    }
    el.innerHTML = '<p class="v2hint">Reading the draft…</p>';
    H.apiAH(`/api/social/idea?id=${encodeURIComponent(p.id)}`, { fresh: true }).then(r => showState(el, p, r.state)).catch(e => { el.innerHTML = `<p class="err">${esc(e.message)}</p>`; });
  }
  function showState(el, p, s, tries = 0) {
    clearTimeout(poll);
    if (!s) { el.innerHTML = '<p class="v2hint">That draft is no longer stored.</p>'; return; }
    const slack = `<a href="${esc(s.link)}" target="_blank" rel="noopener">the Slack thread</a>`;
    if (['queued', 'working'].includes(s.status)) {
      el.innerHTML = `<div style="display:grid;gap:6px"><h4>Make ours</h4><p class="v2hint" style="margin:0">Watching it and writing our version. About a minute. It is also posting in ${slack}.</p></div>`;
      if (tries < 60 && document.body.contains(el)) poll = setTimeout(() => H.apiAH(`/api/social/idea?id=${encodeURIComponent(p.id)}`, { fresh: true }).then(r => showState(el, p, r.state, tries + 1)).catch(() => {}), 5000);
      return;
    }
    if (s.status === 'failed') {
      el.innerHTML = `<div style="display:grid;gap:8px"><p class="err" style="margin:0">The draft did not finish.</p><div><button type="button" class="soc-btn pri" id="smRetry">Try again</button></div><p class="v2hint" style="margin:0">It runs again in ${slack}.</p></div>`;
      el.querySelector('#smRetry').onclick = async e => { e.target.disabled = true; try { const r = await H.apiAH('/api/social/make', { method: 'POST', body: JSON.stringify({ id: p.id }) }); showState(el, p, r.state); } catch (err) { e.target.textContent = err.message; } };
      return;
    }
    const sc = s.script || {};
    const beats = [...(sc.openers || []).slice(0, 2).map((t, i) => [i ? 'Or open' : 'Hook', t, true]), ...(sc.shots || []).map(x => [x.label || 'Shot', x.text, false])];
    const lines = s.studio && !beats.length ? s.studio.lines.map((t, i) => [`Ad ${i + 1}`, t, false]) : [];
    const sent = Object.entries(s.sent || {});
    el.innerHTML = `<div style="display:grid;gap:10px">
      <h4>${esc(sc.title || 'Our version')}</h4>
      ${s.take ? `<p class="v2hint" style="margin:0">${esc(s.take)}</p>` : ''}
      ${s.questions.length && s.status === 'questions' ? `<p class="err">It needs an answer first: ${esc(s.questions.join(' '))} Reply in ${slack}.</p>` : ''}
      ${beats.length || lines.length ? `<div class="beats">${[...beats, ...lines].map(([l, t, hk]) => `<div class="beat ${hk ? 'hk' : ''}"><i>${esc(l)}</i><span>${esc(t)}</span></div>`).join('')}</div>` : ''}
      ${sc.on_screen ? `<p class="v2hint" style="margin:0">On screen: ${esc(sc.on_screen)}</p>` : ''}
      ${s.pick ? `<p class="v2hint" style="margin:0">Suggested: <b>${esc(DEST[s.pick === 'lucky_creators' ? 'creator_link' : s.pick] || s.pick)}</b>${s.why ? `. ${esc(s.why)}` : ''}</p>` : ''}
      ${sent.length ? sent.map(([k2, v]) => `<span class="sent">&#10003; Sent to ${esc(k2 === 'lucky_creators' ? 'the Lucky creator app' : DEST[k2] || k2)}${v.url ? `: <a href="${esc(v.url)}" target="_blank" rel="noopener">open</a>` : ''}</span>`).join('') : ''}
      <div class="dest">${Object.entries(DEST).filter(([d]) => !(s.sent || {})[d] && !(d === 'creator_link' && (s.sent || {}).lucky_creators)).map(([d, l]) => `<button type="button" class="soc-btn ${d === s.pick ? 'pri' : ''}" data-dest="${d}">Send to ${esc(l)}</button>`).join('')}</div>
      <p class="v2hint" style="margin:0">Change it or ask for a redo in ${slack}. A destination writes its own draft first if this one did not.</p><div class="err" id="sdErr"></div></div>`;
    el.querySelectorAll('[data-dest]').forEach(b => b.onclick = async () => {
      b.disabled = true; const was = b.textContent; b.textContent = 'Sending…';
      try { const r = await H.apiAH('/api/social/push', { method: 'POST', body: JSON.stringify({ id: p.id, dest: b.dataset.dest }) }); if (r.text) toast(r.text); showState(el, p, r.state); }
      catch (e) { el.querySelector('#sdErr').textContent = e.message; b.disabled = false; b.textContent = was; }
    });
  }

  window.SocialTab = { render, settings, loadBrands, tabOk, setHost: h => { H = h; } };
})();

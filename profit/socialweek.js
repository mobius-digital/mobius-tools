/* LOCUS SOCIAL, phase 2: THE WEEK (2026-10-19). Plan and the UI it borrows (Later's hour grid, its ready tray and its
 * account bubbles, its "Notify" fallback): docs/locus-social/proposal.html, "A time grid, a tray of ready content".
 *   Week        seven brand-local days by the hour. A post is a card on the grid: cover, caption, the bubbles of the
 *               accounts it goes to, and its state (Auto 9:00 / Draft / Posted with views / By hand / Failed).
 *   Tray        what is ready to post and not yet used: Studio approved finals, creator link clips, winning Meta ads,
 *               Make ours drafts (a script, the composer starts from its words), uploads, posts others tagged us in.
 *               Drag one onto a day and hour; on a phone tap it and pick the time.
 *   Composer    one caption (Rephrase in the brand's voice, saved captions), the accounts by their bubbles, per-platform
 *               tweaks only where a platform needs them (YouTube title and visibility, Instagram first comment, a
 *               platform's own caption), Schedule / Save draft / Post now. A post already out shows each platform's link
 *               and numbers, Try again on a failure, and "Posted by hand" where Locus handed it to a person in Slack.
 *   Connect     Brand settings > Social > Connect accounts: Meta (a Page + its Instagram, the Mobius Tools token), TikTok
 *               and YouTube (a sign-in each, Cole clicks the grant), the mode per platform (live / draft / notify).
 * Data: account-health /api/social/week, /tray, /post, /accounts, /captions, /rephrase (socialpost.js). Tokens never
 * reach this file. CSS tokens only; on a phone the tray is a bottom sheet and the grid scrolls sideways. */
(() => {
  let H = null;
  const $ = s => document.querySelector(s);
  const U = () => window.V2UI;
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const store = (k, v) => { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch {} };
  const CLI = () => !!(H && H.S && (H.S.role === 'client' || H.S.client)) || document.body.classList.contains('is-client');
  const PHONE = () => window.matchMedia('(max-width: 720px)').matches;
  const PL = { ig: 'Instagram', fb: 'Facebook', tt: 'TikTok', yt: 'YouTube' };
  const PK = { ig: 'IG', fb: 'FB', tt: 'TT', yt: 'YT' };
  const SRC = { studio: 'Studio', creator: 'Creator', ad: 'Meta ad', make: 'Make ours', upload: 'Upload', tagged: 'Tagged in' };
  const HOURS = Array.from({ length: 17 }, (_, i) => i + 6);   // 6am to 10pm
  const ROW = 56;
  const k = n => { if (n == null) return '–'; const a = Math.abs(n); return a >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : a >= 1e3 ? `${(n / 1e3).toFixed(a >= 1e4 ? 0 : 1)}k` : String(Math.round(n)); };
  const add = (s, n) => { const d = new Date(s + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
  const monday = s => { const d = new Date(s + 'T00:00:00Z'); const w = (d.getUTCDay() + 6) % 7; return add(s, -w); };
  const md = s => new Date(s + 'T12:00:00Z').toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
  const wd = s => new Date(s + 'T12:00:00Z').toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' });
  const h12 = h => (h % 12 || 12) + (h < 12 ? 'am' : 'pm');
  const ST = { act: null, from: null, data: null, tray: null, tf: store('sw_tf') || 'unused', loading: false };
  const BOOT_POST = new URLSearchParams(location.search).get('post');   // ?open=socialweek&post=<id> (Slack, the calendar)

  function css() {
    if (document.getElementById('swcss')) return;
    const st = document.createElement('style'); st.id = 'swcss';
    st.textContent = `
      .sw .sw-top{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin:0 0 12px}
      .sw .sw-top .r{margin-left:auto;display:flex;gap:6px;align-items:center;flex-wrap:wrap}
      .sw .sw-range{font-weight:650;font-size:14px;min-width:150px}
      .sw-btn{display:inline-flex;align-items:center;gap:6px;padding:6px 11px;border-radius:8px;border:1px solid var(--line-strong);background:var(--surface);font:inherit;font-weight:600;font-size:12.5px;cursor:pointer;color:var(--ink)}
      .sw-btn.pri{background:var(--brand);border-color:var(--brand);color:var(--on-brand,#fff)} .sw-btn:disabled{opacity:.55;cursor:default} .sw-btn.sm{padding:4px 8px;font-size:12px}
      .sw-acc{display:flex;gap:4px;align-items:center}
      .sw-bub{width:26px;height:26px;border-radius:50%;border:1.5px solid var(--line-strong);background:var(--surface-2,var(--surface)) center/cover no-repeat;display:inline-flex;align-items:center;justify-content:center;font-size:9.5px;font-weight:800;letter-spacing:.02em;color:var(--ink-2);cursor:pointer;position:relative;flex:none}
      .sw-bub.on{border-color:var(--brand);box-shadow:0 0 0 2px color-mix(in srgb,var(--brand) 35%,transparent)} .sw-bub.off{opacity:.35}
      .sw-bub.sm{width:18px;height:18px;font-size:7.5px;border-width:1px;box-shadow:none}
      .sw-bub.bad::after{content:"";position:absolute;right:-2px;top:-2px;width:8px;height:8px;border-radius:50%;background:var(--bad);border:1.5px solid var(--surface)}
      .sw-bub.hand::after{content:"";position:absolute;right:-2px;top:-2px;width:8px;height:8px;border-radius:50%;background:var(--warn);border:1.5px solid var(--surface)}
      .sw .sw-body{display:grid;grid-template-columns:250px minmax(0,1fr);gap:12px;align-items:start}
      .sw .sw-tray{border:1px solid var(--line);border-radius:12px;background:var(--surface);padding:10px;position:sticky;top:8px;max-height:calc(100vh - 110px);display:flex;flex-direction:column;gap:8px}
      .sw .sw-tray h4{margin:0;font-size:10.5px;font-weight:700;letter-spacing:.07em;text-transform:uppercase;color:var(--muted)}
      .sw-chips{display:flex;gap:4px;flex-wrap:wrap}
      .sw-chip{padding:2px 8px;border:1px solid var(--line-strong);border-radius:99px;font:inherit;font-size:11.5px;font-weight:600;color:var(--ink-2);background:none;cursor:pointer}
      .sw-chip.on{border-color:var(--brand);color:var(--brand);background:color-mix(in srgb,var(--brand) 10%,var(--surface))} .sw-chip small{font-weight:500;color:var(--muted)}
      .sw-tl{overflow:auto;display:grid;gap:6px;min-height:80px}
      .sw-ti{display:grid;grid-template-columns:56px minmax(0,1fr);gap:8px;align-items:center;border:1px solid var(--line);border-radius:9px;padding:5px;background:var(--surface);cursor:grab;text-align:left;font:inherit;color:var(--ink)}
      .sw-ti:hover{border-color:var(--line-strong)} .sw-ti.used{opacity:.5} .sw-ti:active{cursor:grabbing}
      .sw-ti .th{width:56px;height:56px;border-radius:6px;background:var(--surface-2,var(--line)) center/cover no-repeat;display:flex;align-items:center;justify-content:center;font-size:18px;color:var(--muted);position:relative}
      .sw-ti .th i{position:absolute;right:3px;bottom:3px;font-size:9px;font-style:normal;font-weight:700;background:rgba(0,0,0,.6);color:#fff;padding:1px 4px;border-radius:3px}
      .sw-ti .t{font-size:12px;font-weight:600;line-height:1.3;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
      .sw-ti .s{font-size:11px;color:var(--muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis} .sw-ti .s b{color:var(--ink-2);font-weight:600}
      .sw .sw-grid{border:1px solid var(--line);border-radius:12px;background:var(--surface);overflow:auto;max-height:calc(100vh - 110px);position:relative}
      .sw .sw-gh{display:grid;grid-template-columns:52px repeat(7,minmax(120px,1fr));position:sticky;top:0;background:var(--surface);z-index:3;border-bottom:1px solid var(--line)}
      .sw .sw-gh div{padding:8px 6px;font-size:12px;font-weight:650;color:var(--ink-2);text-align:center;border-left:1px solid var(--line)} .sw .sw-gh div:first-child{border-left:0}
      .sw .sw-gh div.td{color:var(--brand)} .sw .sw-gh div small{display:block;font-weight:500;color:var(--muted);font-size:11px}
      .sw .sw-gb{display:grid;grid-template-columns:52px repeat(7,minmax(120px,1fr));position:relative}
      .sw .sw-ht{height:${ROW}px;font-size:10.5px;color:var(--muted);text-align:right;padding:2px 6px 0 0;border-top:1px solid var(--line);font-variant-numeric:tabular-nums}
      .sw .sw-cell{height:${ROW}px;border-top:1px solid var(--line);border-left:1px solid var(--line);position:relative}
      .sw .sw-cell.td{background:color-mix(in srgb,var(--brand) 4%,transparent)} .sw .sw-cell.past{background:repeating-linear-gradient(135deg,transparent 0 6px,color-mix(in srgb,var(--line) 60%,transparent) 6px 7px)}
      .sw .sw-cell.over{background:color-mix(in srgb,var(--brand) 14%,transparent)} .sw .sw-cell:hover:not(.past)::after{content:"+";position:absolute;right:6px;top:4px;color:var(--muted);font-weight:700}
      .sw .sw-col{position:relative}
      .sw-post{position:absolute;left:3px;right:3px;border:1px solid var(--line-strong);border-radius:8px;background:var(--surface);padding:4px 5px 5px;display:grid;grid-template-columns:34px minmax(0,1fr);gap:6px;align-items:start;cursor:pointer;text-align:left;font:inherit;color:var(--ink);box-shadow:0 4px 12px -8px rgba(0,0,0,.5);z-index:2;min-height:50px}
      .sw-post:hover{border-color:var(--brand)} .sw-post.drag{opacity:.5}
      .sw-post .th{width:34px;height:42px;border-radius:4px;background:var(--surface-2,var(--line)) center/cover no-repeat}
      .sw-post .cp{font-size:11px;line-height:1.3;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;color:var(--ink-2)}
      .sw-post .st{font-size:10px;font-weight:700;letter-spacing:.03em;text-transform:uppercase;display:flex;gap:4px;align-items:center;flex-wrap:wrap;margin-bottom:2px}
      .sw-post .st .sw-acc{margin-left:auto}
      .sw-post .st .b{padding:0 5px;border-radius:4px;background:var(--surface-2,var(--line));color:var(--ink-2)}
      .sw-post.auto .st .b{background:color-mix(in srgb,var(--brand) 16%,transparent);color:var(--brand)}
      .sw-post.posted{border-color:var(--good,#2f9e6b)} .sw-post.posted .st .b{background:color-mix(in srgb,var(--good,#2f9e6b) 16%,transparent);color:var(--good,#2f9e6b)}
      .sw-post.failed{border-color:var(--bad)} .sw-post.failed .st .b{background:color-mix(in srgb,var(--bad) 16%,transparent);color:var(--bad)}
      .sw-post.handoff .st .b{background:color-mix(in srgb,var(--warn) 18%,transparent);color:var(--warn)}
      .sw-post.draft{border-style:dashed}
      .sw-empty{padding:14px;color:var(--muted);font-size:13px}
      .sw-pn{display:grid;gap:14px}
      .sw-pn h4{margin:0;font-size:12px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;color:var(--muted)}
      .sw-pn .med{display:flex;gap:8px;flex-wrap:wrap;align-items:center}
      .sw-pn .med .m{width:84px;height:84px;border-radius:8px;background:var(--surface-2,var(--line)) center/cover no-repeat;position:relative;border:1px solid var(--line)}
      .sw-pn .med .m i{position:absolute;left:4px;bottom:4px;font-size:9px;font-style:normal;font-weight:700;background:rgba(0,0,0,.6);color:#fff;padding:1px 4px;border-radius:3px}
      .sw-pn .med .m button{position:absolute;right:-6px;top:-6px;width:20px;height:20px;border-radius:50%;border:1px solid var(--line-strong);background:var(--surface);font-size:11px;cursor:pointer;color:var(--ink)}
      .sw-pn .when{display:flex;gap:8px;flex-wrap:wrap;align-items:center}
      .sw-pn input[type=date],.sw-pn input[type=time],.sw-pn input[type=text],.sw-pn select,.sw-pn textarea{padding:7px 9px;border-radius:8px;border:1px solid var(--line-strong);background:var(--surface);color:var(--ink);font:inherit;font-size:13px;min-height:36px}
      .sw-pn textarea{width:100%;min-height:110px;line-height:1.45}
      .sw-pn .accs{display:flex;gap:10px;flex-wrap:wrap}
      .sw-pn .acc{display:grid;justify-items:center;gap:3px;font-size:10.5px;color:var(--muted);cursor:pointer;background:none;border:0;font:inherit;padding:0} .sw-pn .acc .sw-bub{width:38px;height:38px;font-size:12px}
      .sw-pn .acc small{font-size:10px;color:var(--muted);max-width:76px;text-align:center;line-height:1.2}
      .sw-pn .row{display:flex;gap:6px;flex-wrap:wrap;align-items:center}
      .sw-pn details{border:1px solid var(--line);border-radius:9px;padding:8px 10px} .sw-pn details summary{cursor:pointer;font-size:12.5px;font-weight:600;color:var(--ink-2)} .sw-pn details .in{display:grid;gap:8px;margin-top:8px}
      .sw-pn label.f{display:grid;gap:4px;font-size:12px;font-weight:600;color:var(--ink-2)} .sw-pn label.f input,.sw-pn label.f select,.sw-pn label.f textarea{font-weight:400}
      .sw-pn .opts{display:grid;gap:6px} .sw-pn .opt{text-align:left;border:1px solid var(--line);border-radius:8px;padding:8px 10px;font:inherit;font-size:12.5px;line-height:1.4;background:var(--surface);color:var(--ink);cursor:pointer;white-space:pre-wrap} .sw-pn .opt:hover{border-color:var(--brand)}
      .sw-pn .foot{display:flex;gap:8px;flex-wrap:wrap;align-items:center;position:sticky;bottom:0;background:var(--surface);padding-top:8px;border-top:1px solid var(--line)}
      .sw-pn .err{color:var(--bad);font-size:12.5px;min-height:1em} .sw-pn .ok{color:var(--good,#2f9e6b);font-size:12.5px;font-weight:600}
      .sw-res{display:grid;gap:6px} .sw-res .r{display:grid;grid-template-columns:28px minmax(0,1fr) auto;gap:8px;align-items:center;border:1px solid var(--line);border-radius:8px;padding:7px 9px;font-size:12.5px}
      .sw-res .r .n{font-variant-numeric:tabular-nums;color:var(--ink-2);display:flex;gap:8px} .sw-res .r .e{color:var(--bad)} .sw-res .r .w{color:var(--warn)}
      .sw-pick{display:grid;grid-template-columns:repeat(auto-fill,minmax(110px,1fr));gap:8px;max-height:46vh;overflow:auto}
      .sw-pick button{border:1px solid var(--line);border-radius:8px;padding:0;background:var(--surface);cursor:pointer;text-align:left;font:inherit;color:var(--ink);overflow:hidden}
      .sw-pick .th{aspect-ratio:1;background:var(--surface-2,var(--line)) center/cover no-repeat} .sw-pick .t{font-size:11px;padding:5px 6px;line-height:1.3;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
      .sw-conn{display:grid;grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:10px}
      .sw-conn .c{border:1px solid var(--line);border-radius:10px;padding:10px 12px;display:grid;gap:6px;background:var(--surface)}
      .sw-conn .c .hd{display:flex;gap:8px;align-items:center} .sw-conn .c .hd b{font-size:13.5px} .sw-conn .c .hd small{display:block;color:var(--muted);font-size:11.5px}
      .sw-conn .c .ln{font-size:12px;color:var(--ink-2);line-height:1.45} .sw-conn .c .ln.bad{color:var(--bad)} .sw-conn .c .ln.good{color:var(--good,#2f9e6b);font-weight:600}
      .sw-conn .c .acts{display:flex;gap:6px;flex-wrap:wrap;align-items:center} .sw-conn .c select{padding:4px 6px;border-radius:7px;border:1px solid var(--line-strong);background:var(--surface);color:var(--ink);font:inherit;font-size:12px}
      .sw-conn .steps{font-size:11.5px;color:var(--muted);line-height:1.45;white-space:pre-wrap}
      .sw-m .fl{display:grid;gap:12px} .sw-m h3{margin:0;font-size:16px} .sw-m .foot{display:flex;gap:8px;justify-content:flex-end} .sw-m .err{color:var(--bad);font-size:12.5px;min-height:1em}
      .sw-m .pg{display:grid;grid-template-columns:36px minmax(0,1fr);gap:10px;align-items:center;border:1px solid var(--line);border-radius:9px;padding:8px 10px;cursor:pointer;background:var(--surface);font:inherit;color:var(--ink);text-align:left} .sw-m .pg:hover{border-color:var(--brand)}
      .sw-m .pg .av{width:36px;height:36px;border-radius:50%;background:var(--surface-2,var(--line)) center/cover} .sw-m .pg small{display:block;color:var(--muted);font-size:11.5px}
      @media (max-width:720px){
        .sw .sw-body{grid-template-columns:1fr} .sw .sw-tray{display:none}
        .sw .sw-grid{max-height:none} .sw .sw-gh,.sw .sw-gb{grid-template-columns:40px repeat(7,150px)}
        .sw-pn .med .m{width:72px;height:72px} .sw-pn .foot .sw-btn{min-height:44px;flex:1 1 auto;justify-content:center}
      }`;
    document.head.appendChild(st);
  }

  /* ---------- data ---------- */
  async function load(fresh) {
    const [w, t] = await Promise.all([
      H.apiAH(`/api/social/week?act=${encodeURIComponent(ST.act)}&from=${ST.from}`, { fresh: true }),
      ST.tray && !fresh ? Promise.resolve({ items: ST.tray }) : H.apiAH(`/api/social/tray?act=${encodeURIComponent(ST.act)}`, { fresh: true }).catch(() => ({ items: [] })),
    ]);
    ST.data = w; ST.tray = t.items || [];
    if (!ST.from) ST.from = w.from;
  }
  async function render(host, first) {
    H = host; css();
    const act = H.S.act, head = H.pageHead('socialweek', 'Social');
    if (!act || act === 'all') { $('#main').innerHTML = `<div class="v2 sw">${head}<div class="v2card"><p class="v2hint">Pick a brand at the top to plan its week.</p></div></div>`; return; }
    const t = H.RUN();
    if (first || ST.act !== act) { ST.act = act; ST.from = null; ST.tray = null; $('#main').innerHTML = `<div class="v2 sw">${head}<div class="v2card"><p class="v2hint">Loading the week…</p></div></div>`; }
    if (!ST.from) ST.from = monday(new Date().toLocaleDateString('en-CA'));
    try { await load(first); } catch (e) { if (t === H.RUN()) $('#main').innerHTML = `<div class="v2 sw">${head}<div class="v2card"><p class="v2bad">${esc(e.message)}</p></div></div>`; return; }
    if (t !== H.RUN()) return;
    draw();
    const want = window.SOCIAL_POST || (first ? BOOT_POST : null); window.SOCIAL_POST = null;
    if (want) { const p = ST.data.posts.find(x => x.id === want); if (p) composer(p); else H.apiAH(`/api/social/post?id=${encodeURIComponent(want)}`, { fresh: true }).then(r => r.post && composer(r.post)).catch(() => {}); }
  }
  async function reload(fresh) { await load(fresh); draw(); }

  /* ---------- the page ---------- */
  function bubble(plat, acc, extra = '') {
    const a = acc || {}, cls = a.on ? (a.status === 'error' ? 'bad' : a.mode === 'notify' ? 'hand' : '') : 'off';
    const tipT = a.on ? `${PL[plat]}${a.handle ? ` @${a.handle}` : ''}${a.mode === 'notify' ? ': by hand (Slack tells you at post time)' : a.mode === 'draft' ? ': lands as a draft or private until the platform approves the app' : ''}${a.status === 'error' ? ': needs reconnecting' : ''}` : `${PL[plat]} is not connected (Brand settings > Social)`;
    return `<span class="sw-bub ${cls} ${extra}" ${a.pic ? `style="background-image:url('${esc(a.pic)}')"` : ''} ${U() ? U().tipAttr(esc(tipT)) : ''} data-bub="${plat}">${a.pic ? '' : PK[plat]}</span>`;
  }
  function stateOf(p) {
    const res = p.results || {};
    const views = Object.values(res).reduce((s, r) => s + (r && r.views ? r.views : 0), 0);
    if (p.status === 'posted') return ['posted', views ? `Posted · ${k(views)} views` : 'Posted'];
    if (p.status === 'partly') return ['failed', 'Partly posted'];
    if (p.status === 'handoff') return ['handoff', 'In Slack: post by hand'];
    if (p.status === 'failed') return ['failed', 'Failed'];
    if (p.status === 'posting') return ['auto', 'Posting now'];
    if (p.status === 'scheduled') return ['auto', `${p.auto ? 'Auto' : 'Scheduled'} · ${p.hm}`];
    return ['draft', 'Draft'];
  }
  function postCard(p, top) {
    const [cls, label] = stateOf(p);
    const m = p.media[0];
    const on = Object.keys(PL).filter(x => p.targets[x] && p.targets[x].on);
    return `<button type="button" class="sw-post ${cls}" style="top:${top}px" data-post="${esc(p.id)}" draggable="${['draft', 'scheduled'].includes(p.status) ? 'true' : 'false'}" ${U() ? U().tipAttr(esc(`${label}. ${p.caption || '(no caption)'}`.slice(0, 200))) : ''}>
      <span class="th" ${m && m.thumb ? `style="background-image:url('${esc(m.thumb)}')"` : ''}></span>
      <span><span class="st"><span class="b">${esc(label)}</span><span class="sw-acc">${on.map(x => bubble(x, (ST.data.accounts || {})[x], 'sm')).join('')}</span></span><span class="cp">${esc(p.caption || (m ? m.title : '') || 'No caption yet')}</span></span></button>`;
  }
  function grid() {
    const d = ST.data, days = d.days, nowDay = d.today;
    const nowH = +new Date().toLocaleTimeString('en-GB', { timeZone: d.tz, hour: '2-digit', minute: '2-digit' }).slice(0, 2);
    let h = `<div class="sw-gh"><div></div>${days.map(x => `<div class="${x === nowDay ? 'td' : ''}">${wd(x)}<small>${md(x)}</small></div>`).join('')}</div><div class="sw-gb">`;
    for (const hr of HOURS) {
      h += `<div class="sw-ht">${h12(hr)}</div>`;
      for (const day of days) {
        const past = day < nowDay || (day === nowDay && hr < nowH);
        h += `<div class="sw-cell ${day === nowDay ? 'td' : ''} ${past ? 'past' : ''}" data-day="${day}" data-hour="${hr}"></div>`;
      }
    }
    h += '</div>';
    return h;
  }
  function placePosts(root) {
    const d = ST.data;
    root.querySelectorAll('.sw-post').forEach(x => x.remove());
    const byDay = {};
    for (const p of d.posts) (byDay[p.day] = byDay[p.day] || []).push(p);
    for (const [day, list] of Object.entries(byDay)) {
      const col = [...root.querySelectorAll(`.sw-cell[data-day="${day}"]`)];
      if (!col.length) continue;
      const first = col[0];
      list.sort((a, b) => a.hm.localeCompare(b.hm));
      let lastBottom = -1;
      for (const p of list) {
        const [hh, mm] = p.hm.split(':').map(Number);
        const hr = Math.min(Math.max(hh, HOURS[0]), HOURS[HOURS.length - 1]);
        let top = (hr - HOURS[0]) * ROW + (hh === hr ? Math.round(mm / 60 * ROW) : 0) + 2;
        if (top < lastBottom + 4) top = lastBottom + 4;
        lastBottom = top + 52;
        first.insertAdjacentHTML('beforeend', postCard(p, top - 0));
        const el = first.lastElementChild; el.style.top = `${top}px`;
      }
    }
  }
  function trayHtml(items, inSheet) {
    const counts = { unused: items.filter(i => !i.used).length, all: items.length };
    for (const s of Object.keys(SRC)) counts[s] = items.filter(i => i.src === s).length;
    const list = ST.tf === 'unused' ? items.filter(i => !i.used) : ST.tf === 'all' ? items : items.filter(i => i.src === ST.tf);
    const chips = [['unused', 'Unused'], ['all', 'All'], ...Object.entries(SRC)].filter(([f]) => f === 'unused' || f === 'all' || counts[f]).map(([f, l]) => `<button type="button" class="sw-chip ${ST.tf === f ? 'on' : ''}" data-tf="${f}">${l} <small>${counts[f]}</small></button>`).join('');
    const item = it => `<button type="button" class="sw-ti ${it.used ? 'used' : ''}" draggable="${inSheet ? 'false' : 'true'}" data-ref="${esc(it.ref)}" ${U() ? U().tipAttr(esc(`${SRC[it.src] || it.src}: ${it.title}${it.used ? ' (already on the week)' : ''}. ${inSheet ? 'Tap to post it.' : 'Drag onto a day and hour, or click.'}`)) : ''}>
      <span class="th" ${it.thumb ? `style="background-image:url('${esc(it.thumb)}')"` : ''}>${it.thumb ? '' : it.kind === 'text' ? '&#9998;' : '&#9635;'}<i>${it.kind === 'video' ? 'VIDEO' : it.kind === 'text' ? 'SCRIPT' : 'PHOTO'}</i></span>
      <span><span class="t">${esc(it.title)}</span><span class="s"><b>${esc(SRC[it.src] || it.src)}</b>${it.who ? ` · ${esc(it.who)}` : it.sub ? ` · ${esc(it.sub)}` : ''}</span></span></button>`;
    return `<h4>Ready to post</h4><div class="sw-chips">${chips}</div>
      <div class="sw-tl">${list.length ? list.map(item).join('') : `<p class="v2hint" style="margin:4px 0">${items.length ? 'Nothing here with this filter.' : 'Nothing ready yet. Approve a Studio final, add a creator clip, or upload a file.'}</p>`}</div>
      <div class="sw-chips"><button type="button" class="sw-btn sm" data-upload="1">&#8679; Upload a photo or video</button><input type="file" accept="image/jpeg,image/png,image/webp,video/mp4,video/quicktime" hidden data-file="1"></div>
      <p class="v2hint" style="margin:0;font-size:11.5px">Studio finals, creator clips, your best Meta ads, Make ours drafts, uploads and posts you were tagged in land here.</p>`;
  }
  function draw() {
    const d = ST.data, head = H.pageHead('socialweek', 'Social');
    const accs = d.accounts || {};
    const none = !Object.values(accs).some(a => a.on);
    $('#main').innerHTML = `<div class="v2 sw">${head}
      <div class="sw-top"><button type="button" class="sw-btn" data-nav="-1">&#8249;</button><button type="button" class="sw-btn" data-nav="0">This week</button><button type="button" class="sw-btn" data-nav="1">&#8250;</button>
        <span class="sw-range">${md(d.days[0])} to ${md(d.days[6])}</span>
        <span class="r"><span class="sw-acc" id="swAccs">${Object.keys(PL).map(x => bubble(x, accs[x])).join('')}</span>
          ${PHONE() ? '<button type="button" class="sw-btn" id="swTrayBtn">Tray</button>' : ''}<button type="button" class="sw-btn pri" id="swNew">+ Post</button></span></div>
      ${none ? `<div class="v2card" style="margin-bottom:12px"><p class="v2hint" style="margin:0"><b>No accounts connected yet.</b> ${CLI() ? 'Ask the Mobius team to connect your Instagram, Facebook, TikTok and YouTube.' : 'Connect them in Brand settings > Social. Until then a scheduled post is handed to you in Slack at post time with the file and caption ready to paste.'}${CLI() ? '' : ' <button type="button" class="sw-btn sm" data-settings="1">Connect accounts</button>'}</p></div>` : ''}
      <div class="sw-body"><div class="sw-tray" id="swTray">${trayHtml(ST.tray)}</div><div class="sw-grid" id="swGrid">${grid()}</div></div></div>`;
    const g = $('#swGrid'); placePosts(g);
    /* Scroll the grid to 8am on first draw. */
    g.scrollTop = Math.max(0, (8 - HOURS[0]) * ROW - 10);
    wire();
  }
  function wire() {
    const m = $('#main');
    m.querySelectorAll('[data-nav]').forEach(b => b.onclick = async () => { const n = +b.dataset.nav; ST.from = n === 0 ? monday(ST.data.today) : add(ST.from, n * 7); await reload(false); });
    m.querySelectorAll('[data-settings]').forEach(b => b.onclick = () => { try { localStorage.setItem('pf_set_bsec', 'social'); } catch {} H.show('settings'); });
    $('#swAccs').querySelectorAll('[data-bub]').forEach(b => b.onclick = () => { if (CLI()) return; try { localStorage.setItem('pf_set_bsec', 'social'); } catch {} H.show('settings'); });
    $('#swNew').onclick = () => composer(null, { at: nextSlot() });
    const tb = $('#swTrayBtn'); if (tb) tb.onclick = traySheet;
    wireTray($('#swTray'), false);
    const g = $('#swGrid');
    g.querySelectorAll('.sw-post').forEach(b => {
      b.onclick = () => composer(ST.data.posts.find(p => p.id === b.dataset.post));
      b.ondragstart = e => { e.dataTransfer.setData('text/plain', `post:${b.dataset.post}`); e.dataTransfer.effectAllowed = 'move'; b.classList.add('drag'); };
      b.ondragend = () => b.classList.remove('drag');
    });
    g.querySelectorAll('.sw-cell').forEach(c => {
      c.onclick = e => { if (e.target !== c) return; if (c.classList.contains('past')) return; composer(null, { at: atOf(c.dataset.day, +c.dataset.hour) }); };
      c.ondragover = e => { if (c.classList.contains('past')) return; e.preventDefault(); c.classList.add('over'); };
      c.ondragleave = () => c.classList.remove('over');
      c.ondrop = async e => {
        e.preventDefault(); c.classList.remove('over');
        const v = e.dataTransfer.getData('text/plain') || '';
        const at = atOf(c.dataset.day, +c.dataset.hour);
        if (v.startsWith('post:')) { const p = ST.data.posts.find(x => x.id === v.slice(5)); if (p) await move(p, at); return; }
        const it = ST.tray.find(x => x.ref === v); if (it) composer(null, { at, items: [it] });
      };
    });
  }
  function wireTray(root, inSheet) {
    if (!root) return;
    root.querySelectorAll('[data-tf]').forEach(b => b.onclick = () => { ST.tf = b.dataset.tf; store('sw_tf', ST.tf); root.innerHTML = trayHtml(ST.tray, inSheet); wireTray(root, inSheet); });
    root.querySelectorAll('.sw-ti').forEach(b => {
      const it = ST.tray.find(x => x.ref === b.dataset.ref);
      b.onclick = () => { if (inSheet) { const c = document.querySelector('#v2panel .pclose'); if (c) c.click(); } composer(null, { at: nextSlot(), items: [it] }); };
      b.ondragstart = e => { e.dataTransfer.setData('text/plain', it.ref); e.dataTransfer.effectAllowed = 'copy'; };
    });
    const up = root.querySelector('[data-upload]'), fi = root.querySelector('[data-file]');
    if (up && fi) { up.onclick = () => fi.click(); fi.onchange = async () => { const f = fi.files[0]; if (!f) return; up.disabled = true; up.textContent = 'Uploading…'; try { const it = await upload(f); ST.tray.unshift(it); root.innerHTML = trayHtml(ST.tray, inSheet); wireTray(root, inSheet); toast('In the tray. Drag it onto the week.'); } catch (e) { toast(e.message); up.disabled = false; up.textContent = '⇧ Upload a photo or video'; } }; }
  }
  function traySheet() { U().panel.wide = false; const body = U().panel('Ready to post', `<div class="sw-tray" style="display:flex;position:static;max-height:none;border:0;padding:0">${trayHtml(ST.tray, true)}</div>`); wireTray(body.firstElementChild, true); }
  async function upload(f) {
    if (f.size > 95 * 1024 * 1024) throw new Error('Files up to 95 MB.');
    const res = await fetch(`${H.AH_URL}/api/social/upload?act=${encodeURIComponent(ST.act)}&name=${encodeURIComponent(f.name)}`, { method: 'POST', headers: { Authorization: 'Bearer ' + H.S.tok, 'Content-Type': f.type || 'application/octet-stream' }, body: f });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(j.error || `HTTP ${res.status}`);
    return j.item;
  }
  /* Brand-local day + hour -> an ISO instant, through the brand's own zone (two passes cover a DST edge). */
  function partsIn(ms, tz) {
    const f = new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
    const o = {}; for (const x of f.formatToParts(new Date(ms))) o[x.type] = x.value;
    return { y: +o.year, mo: +o.month, d: +o.day, h: +o.hour === 24 ? 0 : +o.hour, mi: +o.minute };
  }
  function atOf(day, hour, minute = 0) {
    const tz = ST.data.tz;
    const want = Date.UTC(+day.slice(0, 4), +day.slice(5, 7) - 1, +day.slice(8, 10), hour, minute);
    let t = want;
    for (let i = 0; i < 2; i++) { const p = partsIn(t, tz); t += want - Date.UTC(p.y, p.mo - 1, p.d, p.h, p.mi); }
    return new Date(t).toISOString();
  }
  function localParts(iso) {
    const tz = ST.data.tz;
    return { day: new Date(iso).toLocaleDateString('en-CA', { timeZone: tz }), hm: new Date(iso).toLocaleTimeString('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit' }) };
  }
  function nextSlot() {
    const d = ST.data; const now = new Date();
    const lp = localParts(now.toISOString());
    const hr = +lp.hm.slice(0, 2) + 1;
    return hr <= 21 ? atOf(lp.day, Math.max(hr, 9)) : atOf(add(lp.day, 1), 9);
  }
  async function move(p, at) {
    try { await H.apiAH('/api/social/post', { method: 'POST', body: JSON.stringify({ act: ST.act, id: p.id, at, caption: p.caption, media: p.media.map(mediaOut), targets: p.targets, status: p.status === 'scheduled' ? 'scheduled' : 'draft', auto: p.auto }) }); await reload(false); }
    catch (e) { toast(e.message); }
  }
  const mediaOut = m => ({ ref: m.ref, src: m.src, kind: m.kind, title: m.title, thumb: m.thumb, file: m.file || m.url || null, key: m.key || null, who: m.who || null });
  function toast(t) {
    const el = document.createElement('div');
    el.style.cssText = 'position:fixed;left:50%;bottom:calc(24px + env(safe-area-inset-bottom,0px));transform:translateX(-50%);background:var(--ink);color:var(--surface);padding:10px 14px;border-radius:9px;font-size:13px;z-index:9999;max-width:min(560px,92vw);box-shadow:0 8px 24px -10px rgba(0,0,0,.6)';
    el.textContent = t; document.body.appendChild(el); setTimeout(() => el.remove(), 5200);
  }

  /* ---------- the composer ---------- */
  function composer(p, opts = {}) {
    const accs = ST.data.accounts || {};
    const items = (opts.items || []).map(it => ({ ref: it.ref, src: it.src, kind: it.kind, title: it.title, thumb: it.thumb, file: it.file, key: it.key, who: it.who }));
    const M = { id: p ? p.id : null, at: p ? p.at : opts.at, caption: p ? p.caption : (items.find(i => i.caption) || opts.items?.[0] || {}).caption || '', media: p ? p.media.map(m => ({ ...m })) : items.filter(i => i.kind !== 'text'),
      targets: p ? JSON.parse(JSON.stringify(p.targets)) : Object.fromEntries(Object.keys(PL).map(x => [x, { on: !!(accs[x] && accs[x].on && (x === 'ig' || x === 'fb')) }])), auto: p ? p.auto : true, status: p ? p.status : 'draft', results: p ? p.results : {} };
    if (!p && opts.items?.[0]?.caption) M.caption = opts.items[0].caption;
    const out = p && ['posted', 'partly', 'handoff', 'failed', 'posting'].includes(p.status);
    const lp = localParts(M.at);
    U().panel.wide = true;
    const body = U().panel(p ? (out ? 'Your post' : 'Edit the post') : 'New post', `<div class="sw-pn">
      <div><h4>What goes out</h4><div class="med" id="cpMed"></div></div>
      <div><h4>When</h4><div class="when"><input type="date" id="cpDay" value="${lp.day}" ${out ? 'disabled' : ''}><input type="time" id="cpTime" value="${lp.hm}" ${out ? 'disabled' : ''}><span class="v2hint" style="margin:0">${esc(ST.data.tz.replace('_', ' '))}${M.auto ? ' · posts itself' : ''}</span></div></div>
      <div><h4>Where</h4><div class="accs" id="cpAccs"></div></div>
      <div><h4>Caption</h4><textarea id="cpCap" placeholder="One caption for every account. Tweak a platform below only where it needs it." ${out ? 'readonly' : ''}>${esc(M.caption)}</textarea>
        ${out ? '' : `<div class="row" style="margin-top:6px"><button type="button" class="sw-btn sm" id="cpRe">&#10024; Rephrase in ${esc(brandName())}'s voice</button><button type="button" class="sw-btn sm" id="cpSaved">Saved captions</button><button type="button" class="sw-btn sm" id="cpSave">Save this caption</button></div><div class="opts" id="cpOpts"></div>`}</div>
      ${out ? '' : `<details><summary>Per-platform tweaks (only where needed)</summary><div class="in">
        <label class="f">Instagram first comment<input type="text" id="tIgC" value="${esc(M.targets.ig?.first_comment || '')}" placeholder="Hashtags or the link, posted as the first comment"></label>
        <label class="f">Instagram caption (if different)<textarea id="tIgCap" style="min-height:60px">${esc(M.targets.ig?.caption || '')}</textarea></label>
        <label class="f">Facebook caption (if different)<textarea id="tFbCap" style="min-height:60px">${esc(M.targets.fb?.caption || '')}</textarea></label>
        <label class="f">TikTok title / caption (if different)<input type="text" id="tTtT" value="${esc(M.targets.tt?.title || '')}" maxlength="2200"></label>
        ${accs.tt?.mode === 'live' ? `<label class="f">TikTok who can see it<select id="tTtP"><option value="PUBLIC_TO_EVERYONE" ${!M.targets.tt?.privacy || M.targets.tt.privacy === 'PUBLIC_TO_EVERYONE' ? 'selected' : ''}>Everyone</option><option value="FOLLOWER_OF_CREATOR" ${M.targets.tt?.privacy === 'FOLLOWER_OF_CREATOR' ? 'selected' : ''}>Followers</option><option value="SELF_ONLY" ${M.targets.tt?.privacy === 'SELF_ONLY' ? 'selected' : ''}>Only me</option></select></label>` : ''}
        <label class="f">YouTube title<input type="text" id="tYtT" value="${esc(M.targets.yt?.title || '')}" maxlength="100" placeholder="Defaults to the caption's first line"></label>
        <label class="f">YouTube description (if different)<textarea id="tYtCap" style="min-height:60px">${esc(M.targets.yt?.caption || '')}</textarea></label>
        ${accs.yt?.mode === 'live' ? `<label class="f">YouTube visibility<select id="tYtV"><option value="public" ${!M.targets.yt?.visibility || M.targets.yt.visibility === 'public' ? 'selected' : ''}>Public</option><option value="unlisted" ${M.targets.yt?.visibility === 'unlisted' ? 'selected' : ''}>Unlisted</option><option value="private" ${M.targets.yt?.visibility === 'private' ? 'selected' : ''}>Private</option></select></label>` : ''}
      </div></details>`}
      <div id="cpRes"></div>
      <div class="err" id="cpErr"></div>
      <div class="foot">${out
        ? `${['failed', 'partly', 'handoff'].includes(M.status) ? '<button type="button" class="sw-btn pri" id="cpRetry">Try again now</button>' : ''}<button type="button" class="sw-btn" id="cpDup">Post again (copy)</button><button type="button" class="sw-btn" id="cpDel" style="margin-left:auto;color:var(--bad)">Delete</button>`
        : `<button type="button" class="sw-btn pri" id="cpSched">${M.auto ? 'Schedule' : 'Schedule'}</button><button type="button" class="sw-btn" id="cpNow">Post now</button><button type="button" class="sw-btn" id="cpDraft">Save draft</button>${p ? '<button type="button" class="sw-btn" id="cpDel" style="margin-left:auto;color:var(--bad)">Delete</button>' : ''}`}</div></div>`);
    const err = body.querySelector('#cpErr');
    const drawMedia = () => {
      const el = body.querySelector('#cpMed');
      el.innerHTML = M.media.map((m, i) => `<span class="m" ${m.thumb ? `style="background-image:url('${esc(m.thumb)}')"` : ''} ${U() ? U().tipAttr(esc(m.title || '')) : ''}><i>${m.kind === 'video' ? 'VIDEO' : 'PHOTO'}</i>${out ? '' : `<button type="button" data-rm="${i}" aria-label="Remove">&#215;</button>`}</span>`).join('')
        + (out ? '' : `<button type="button" class="sw-btn sm" id="cpPick">+ From the tray</button><button type="button" class="sw-btn sm" id="cpUp">&#8679; Upload</button><input type="file" id="cpFile" hidden accept="image/jpeg,image/png,image/webp,video/mp4,video/quicktime">`)
        + (!M.media.length ? '<span class="v2hint" style="margin:0">No picture or video yet.</span>' : '');
      el.querySelectorAll('[data-rm]').forEach(b => b.onclick = () => { M.media.splice(+b.dataset.rm, 1); drawMedia(); });
      const pk = el.querySelector('#cpPick'); if (pk) pk.onclick = () => pickModal(it => { M.media.push({ ref: it.ref, src: it.src, kind: it.kind, title: it.title, thumb: it.thumb, file: it.file, key: it.key, who: it.who }); if (!M.caption && it.caption) { M.caption = it.caption; body.querySelector('#cpCap').value = it.caption; } drawMedia(); });
      const up = el.querySelector('#cpUp'), fi = el.querySelector('#cpFile');
      if (up) { up.onclick = () => fi.click(); fi.onchange = async () => { const f = fi.files[0]; if (!f) return; up.disabled = true; up.textContent = 'Uploading…'; try { const it = await upload(f); ST.tray.unshift(it); M.media.push({ ref: it.ref, src: it.src, kind: it.kind, title: it.title, thumb: it.thumb, key: it.key }); drawMedia(); } catch (e) { err.textContent = e.message; } }; }
    };
    const drawAccs = () => {
      body.querySelector('#cpAccs').innerHTML = Object.keys(PL).map(x => {
        const a = accs[x] || {}, t = M.targets[x] || {};
        const r = (M.results || {})[x];
        const note = r && r.posted_at ? (r.by_hand ? 'posted by hand' : 'posted') : r && r.handoff ? 'in Slack, by hand' : r && r.error ? 'failed' : !a.on ? 'not connected: Slack will hand it to you' : a.mode === 'notify' ? 'by hand, via Slack' : a.mode === 'draft' ? (x === 'tt' ? 'to your TikTok drafts' : x === 'yt' ? 'private until approved' : 'live') : 'live';
        return `<button type="button" class="acc" data-acc="${x}" ${out ? 'disabled' : ''}>${bubble(x, a, t.on ? 'on' : (a.on ? '' : 'off'))}<span>${PL[x]}</span><small>${esc(note)}</small></button>`;
      }).join('');
      body.querySelectorAll('[data-acc]').forEach(b => b.onclick = () => { const x = b.dataset.acc; M.targets[x] = { ...(M.targets[x] || {}), on: !(M.targets[x] && M.targets[x].on) }; drawAccs(); });
    };
    drawMedia(); drawAccs();
    if (out) resultsBox(body.querySelector('#cpRes'), p);
    const collect = () => {
      M.caption = body.querySelector('#cpCap').value;
      const v = id => { const e = body.querySelector(id); return e ? e.value : undefined; };
      M.targets.ig = { ...(M.targets.ig || {}), first_comment: v('#tIgC'), caption: v('#tIgCap') };
      M.targets.fb = { ...(M.targets.fb || {}), caption: v('#tFbCap') };
      M.targets.tt = { ...(M.targets.tt || {}), title: v('#tTtT'), privacy: v('#tTtP') };
      M.targets.yt = { ...(M.targets.yt || {}), title: v('#tYtT'), caption: v('#tYtCap'), visibility: v('#tYtV') };
      const day = body.querySelector('#cpDay').value, hm = body.querySelector('#cpTime').value || '09:00';
      if (!day) throw new Error('Pick a day.');
      M.at = atOf(day, +hm.slice(0, 2), +hm.slice(3, 5));
    };
    const save = async (status, now) => {
      try {
        collect();
        if (status === 'scheduled' && !M.media.length) throw new Error('Add a picture or video first.');
        if (status === 'scheduled' && !Object.values(M.targets).some(t => t.on)) throw new Error('Pick at least one account.');
        if (status === 'scheduled' && !now && Date.parse(M.at) < Date.now() - 60e3) throw new Error('That time has passed. Pick a later one, or Post now.');
        body.querySelectorAll('.foot button').forEach(b => b.disabled = true);
        const r = await H.apiAH('/api/social/post', { method: 'POST', body: JSON.stringify({ act: ST.act, id: M.id, at: M.at, now: !!now, caption: M.caption, media: M.media.map(mediaOut), targets: M.targets, status, auto: M.auto }) });
        const c = document.querySelector('#v2panel .pclose'); if (c) c.click();
        toast(now ? 'Posting now. The card updates in a minute.' : status === 'scheduled' ? `Scheduled for ${wd(localParts(M.at).day)} ${localParts(M.at).hm}.` : 'Draft saved.');
        await reload(true);
        if (now) setTimeout(() => reload(false).catch(() => {}), 25000);
      } catch (e) { err.textContent = e.message; body.querySelectorAll('.foot button').forEach(b => b.disabled = false); }
    };
    const on = (id, fn) => { const b = body.querySelector(id); if (b) b.onclick = fn; };
    on('#cpSched', () => save('scheduled', false));
    on('#cpNow', () => save('scheduled', true));
    on('#cpDraft', () => save('draft', false));
    on('#cpDel', async () => { if (!(await H.confirmModal('Delete this post?', p && p.status === 'posted' ? 'It stays on the platforms; only the card here goes.' : 'It will not go out.', 'Delete'))) return; try { await H.apiAH(`/api/social/post?id=${encodeURIComponent(M.id)}`, { method: 'DELETE' }); const c = document.querySelector('#v2panel .pclose'); if (c) c.click(); await reload(true); } catch (e) { err.textContent = e.message; } });
    on('#cpRetry', async () => { try { await H.apiAH('/api/social/post/retry', { method: 'POST', body: JSON.stringify({ id: M.id }) }); const c = document.querySelector('#v2panel .pclose'); if (c) c.click(); toast('Going again within a few minutes.'); await reload(false); } catch (e) { err.textContent = e.message; } });
    on('#cpDup', () => composer(null, { at: nextSlot(), items: M.media.map(m => ({ ...m, caption: M.caption })) }));
    on('#cpRe', async () => {
      const b = body.querySelector('#cpRe'), o = body.querySelector('#cpOpts'); b.disabled = true; b.textContent = 'Writing…';
      try { const r = await H.apiAH('/api/social/rephrase', { method: 'POST', body: JSON.stringify({ act: ST.act, text: body.querySelector('#cpCap').value, note: M.media[0] ? `the post shows: ${M.media[0].title}` : '' }) });
        o.innerHTML = (r.captions || []).map(c => `<button type="button" class="opt">${esc(c)}</button>`).join('') || '<p class="v2hint">Nothing came back.</p>';
        o.querySelectorAll('.opt').forEach(x => x.onclick = () => { body.querySelector('#cpCap').value = x.textContent; o.innerHTML = ''; });
      } catch (e) { err.textContent = e.message; }
      b.disabled = false; b.textContent = `✨ Rephrase in ${brandName()}'s voice`;
    });
    on('#cpSaved', async () => {
      const o = body.querySelector('#cpOpts'); o.innerHTML = '<p class="v2hint">Reading…</p>';
      try { const r = await H.apiAH(`/api/social/captions?act=${encodeURIComponent(ST.act)}`, { fresh: true });
        o.innerHTML = (r.captions || []).map(c => `<button type="button" class="opt" data-cid="${esc(c.id)}">${esc(c.text)}<span style="display:block;color:var(--muted);font-size:11px;margin-top:3px">${esc(c.created_by || '')} · <u data-del="${esc(c.id)}">remove</u></span></button>`).join('') || '<p class="v2hint">No saved captions yet. Write one and press Save this caption.</p>';
        o.querySelectorAll('.opt').forEach(x => x.onclick = e => { if (e.target.dataset.del) { H.apiAH(`/api/social/captions?id=${encodeURIComponent(e.target.dataset.del)}`, { method: 'DELETE' }).then(() => x.remove()).catch(er => { err.textContent = er.message; }); return; } body.querySelector('#cpCap').value = x.firstChild.textContent; o.innerHTML = ''; });
      } catch (e) { o.innerHTML = ''; err.textContent = e.message; }
    });
    on('#cpSave', async () => { const t = body.querySelector('#cpCap').value.trim(); if (!t) { err.textContent = 'Write a caption first.'; return; } try { await H.apiAH('/api/social/captions', { method: 'POST', body: JSON.stringify({ act: ST.act, text: t }) }); toast('Saved.'); } catch (e) { err.textContent = e.message; } });
  }
  function resultsBox(el, p) {
    const res = p.results || {};
    const rows = Object.keys(PL).filter(x => p.targets[x] && p.targets[x].on).map(x => {
      const r = res[x] || {};
      const nums = r.posted_at ? `<span class="n">${r.views != null ? `<span>${k(r.views)} views</span>` : ''}${r.likes != null ? `<span>${k(r.likes)} likes</span>` : ''}${r.comments != null ? `<span>${k(r.comments)} comments</span>` : ''}${r.views == null && r.likes == null ? '<span>numbers tomorrow</span>' : ''}</span>` : '';
      const line = r.posted_at ? `${r.by_hand ? 'Posted by hand' : r.draft ? 'Sent' : 'Posted'}${r.url ? ` · <a href="${esc(r.url)}" target="_blank" rel="noopener">open</a>` : ''}${r.note ? `<span class="w"> · ${esc(r.note)}</span>` : ''}` : r.handoff ? `<span class="w">Handed to you in Slack${r.error ? ` (${esc(r.error)})` : ''}.</span> <button type="button" class="sw-btn sm" data-hand="${x}">Posted by hand</button>` : r.error ? `<span class="e">${esc(r.error)}</span>` : 'Waiting';
      return `<div class="r">${bubble(x, (ST.data.accounts || {})[x], 'sm')}<span>${line}</span>${nums}</div>`;
    }).join('');
    el.innerHTML = `<h4>How it went</h4><div class="sw-res">${rows}</div>${p.error ? `<p class="err" style="margin:6px 0 0">${esc(p.error)}</p>` : ''}`;
    el.querySelectorAll('[data-hand]').forEach(b => b.onclick = async () => {
      const url = await askUrl(); if (url === null) return;
      try { const r = await H.apiAH('/api/social/post/byhand', { method: 'POST', body: JSON.stringify({ id: p.id, plat: b.dataset.hand, url: url || undefined }) }); Object.assign(p, r.post); resultsBox(el, p); await reload(false); } catch (e) { toast(e.message); }
    });
  }
  function askUrl() {
    return new Promise(res => {
      const { w, done } = modal(`<div class="fl"><h3>Posted by hand</h3><p class="v2hint" style="margin:0">Paste the post's link if you have it (optional), so the card can show it.</p><input type="text" id="buUrl" placeholder="https://" style="width:100%;padding:8px 10px;border-radius:8px;border:1px solid var(--line-strong);background:var(--surface);color:var(--ink);font:inherit"><div class="foot"><button type="button" class="sw-btn" data-x="1">Cancel</button><button type="button" class="sw-btn pri" id="buOk">Mark posted</button></div></div>`, () => res(null));
      w.querySelector('#buOk').onclick = () => { const v = w.querySelector('#buUrl').value.trim(); done(true); res(v); };
    });
  }
  function pickModal(onPick) {
    const list = ST.tray.filter(i => i.kind !== 'text');
    const { w, done } = modal(`<div class="fl"><h3>From the tray</h3><div class="sw-pick">${list.map(it => `<button type="button" data-ref="${esc(it.ref)}"><span class="th" ${it.thumb ? `style="background-image:url('${esc(it.thumb)}')"` : ''}></span><span class="t">${esc(it.title)}</span></button>`).join('') || '<p class="v2hint">Nothing in the tray yet.</p>'}</div><div class="foot"><button type="button" class="sw-btn" data-x="1">Close</button></div></div>`);
    w.querySelectorAll('[data-ref]').forEach(b => b.onclick = () => { onPick(list.find(i => i.ref === b.dataset.ref)); done(); });
  }
  function modal(html, onClose) {
    const w = document.createElement('div'); w.className = 'modal-wrap sw-m';
    w.innerHTML = `<div class="modal" style="max-width:520px;display:block;padding:18px 20px">${html}</div>`;
    document.body.appendChild(w);
    let closed = false;
    const done = picked => { if (closed) return; closed = true; w.remove(); document.removeEventListener('keydown', kd); if (!picked && onClose) onClose(); };
    const kd = e => { if (e.key === 'Escape') done(); };
    document.addEventListener('keydown', kd);
    w.addEventListener('mousedown', e => { if (e.target === w) done(); });
    w.querySelectorAll('[data-x]').forEach(b => b.onclick = () => done());
    return { w, done };
  }
  function brandName() { return ((H.S.accounts || []).find(a => a.act_id === ST.act) || {}).name || 'the brand'; }

  /* ---------- Brand settings > Social > Connect accounts ---------- */
  async function connect(el, act, host) {
    H = host || H; css();
    if (!el || !act || act === 'all') return;
    el.innerHTML = '<p class="v2hint">Reading the accounts…</p>';
    let d; try { d = await H.apiAH(`/api/social/accounts?act=${encodeURIComponent(act)}`, { fresh: true }); } catch (e) { el.innerHTML = `<p class="v2bad">${esc(e.message)}</p>`; return; }
    const A = d.accounts || {}, keys = d.keys || {}, cb = d.callbacks || {}, cli = CLI();
    const modes = { live: 'Live: posts straight to the account', draft: 'Draft: TikTok inbox / YouTube private until the app is approved', notify: 'By hand: Slack tells the poster at post time' };
    const card = (plat, how) => {
      const a = A[plat];
      const st = !a ? '<span class="ln">Not connected.</span>' : a.status === 'error' ? `<span class="ln bad">Needs reconnecting: ${esc(a.error || '')}</span>` : `<span class="ln good">Connected${a.handle ? ` as @${esc(a.handle)}` : ''}${a.connected_at ? `, ${esc(String(a.connected_at).slice(0, 10))}` : ''}.</span>`;
      const mode = a && !cli ? `<select data-mode="${plat}" aria-label="How it posts">${Object.entries(modes).filter(([m]) => m !== 'live' || plat === 'ig' || plat === 'fb' || true).map(([m, l]) => `<option value="${m}" ${a.mode === m ? 'selected' : ''}>${l.split(':')[0]}</option>`).join('')}</select>` : '';
      return `<div class="c"><div class="hd">${bubble(plat, a ? { on: true, pic: a.pic, handle: a.handle, mode: a.mode, status: a.status } : {})}<div><b>${PL[plat]}</b><small>${a ? esc(a.name || '') : (plat === 'ig' ? 'Business account, through its Facebook Page' : plat === 'fb' ? 'The brand’s Page' : plat === 'tt' ? 'Content Posting (drafts until TikTok’s audit passes)' : 'Uploads (private until Google verifies the app)')}</small></div></div>
        ${st}${a && a.mode ? `<span class="ln">${esc(modes[a.mode] || a.mode)}</span>` : ''}
        ${cli ? '' : `<div class="acts">${how}${mode}${a ? `<button type="button" class="sw-btn sm" data-forget="${plat}">Forget</button>` : ''}</div>`}</div>`;
    };
    const metaHow = keys.meta ? `<button type="button" class="sw-btn sm pri" data-meta="1">${A.fb || A.ig ? 'Change the Page' : 'Connect a Page + Instagram'}</button>` : '<span class="ln bad">META_TOKEN is not set on the server.</span>';
    const ttHow = keys.tiktok ? '<button type="button" class="sw-btn sm pri" data-oauth="tiktok">Sign in to TikTok</button>' : `<details class="steps"><summary>Set up the TikTok app first</summary>1) developers.tiktok.com, the Mobius account: Manage apps &gt; Connect an app ("Locus by Mobius Digital"). 2) Add the products Login Kit and Content Posting API; scopes user.info.basic, video.upload, video.publish, video.list. 3) Redirect URI: ${esc(cb.tiktok || '')} 4) In account-health/worker: npx.cmd wrangler secret put TIKTOK_CLIENT_KEY, then TIKTOK_CLIENT_SECRET. 5) Submit for review with a screen recording of this Week screen posting; until it passes posts land in your TikTok inbox as drafts.</details>`;
    const ytHow = keys.google ? '<button type="button" class="sw-btn sm pri" data-oauth="youtube">Sign in to Google</button>' : `<details class="steps"><summary>Set up the Google OAuth client first</summary>1) console.cloud.google.com, the Mobius project with the Locus sign-in client: APIs &amp; Services &gt; Enable the YouTube Data API v3. 2) Credentials &gt; the OAuth client Locus uses &gt; add the redirect URI ${esc(cb.google || '')} 3) OAuth consent screen: add the scopes youtube.upload and youtube.readonly, add cole@ as a test user. 4) In account-health/worker: npx.cmd wrangler secret put GOOGLE_CLIENT_SECRET (the client's secret). 5) Verification needs a screen recording of this Week screen posting; until then uploads are private.</details>`;
    el.innerHTML = `<div class="sw" style="display:grid;gap:10px"><h3 style="margin:8px 0 0;font-size:14px">Connect accounts</h3>
      <p class="v2hint" style="margin:0;max-width:70ch">Where the Week screen posts. ${cli ? 'The Mobius team connects these for you.' : 'Instagram and Facebook use the Mobius Tools token (it needs instagram_content_publish and pages_manage_posts: Business settings > System users > Mobius Tools > Generate new token). TikTok and YouTube are a sign-in each. A platform that is not connected, or set to By hand, is handed to the poster in Slack at post time.'}</p>
      <div class="sw-conn">${card('ig', metaHow)}${card('fb', '')}${card('tt', ttHow)}${card('yt', ytHow)}</div><div class="v2hint" id="swConnMsg" style="margin:0"></div></div>`;
    const msg = el.querySelector('#swConnMsg');
    el.querySelectorAll('[data-mode]').forEach(s => s.onchange = async () => { try { await H.apiAH('/api/social/accounts/mode', { method: 'PUT', body: JSON.stringify({ act, plat: s.dataset.mode, mode: s.value }) }); msg.textContent = 'Saved.'; } catch (e) { msg.textContent = e.message; } });
    el.querySelectorAll('[data-forget]').forEach(b => b.onclick = async () => { if (!(await H.confirmModal(`Forget the ${PL[b.dataset.forget]} connection?`, 'Scheduled posts to it will be handed to you in Slack instead.', 'Forget'))) return; try { await H.apiAH(`/api/social/accounts?act=${encodeURIComponent(act)}&plat=${b.dataset.forget}`, { method: 'DELETE' }); connect(el, act, H); } catch (e) { msg.textContent = e.message; } });
    el.querySelectorAll('[data-oauth]').forEach(b => b.onclick = async () => {
      b.disabled = true;
      try { const r = await H.apiAH(`/api/social/connect/${b.dataset.oauth}`, { method: 'POST', body: JSON.stringify({ act }) }); window.open(r.url, '_blank', 'noopener'); msg.innerHTML = `Finish the sign-in in the new tab, then <button type="button" class="sw-btn sm" id="swReload">refresh this card</button>.`; el.querySelector('#swReload').onclick = () => connect(el, act, H); }
      catch (e) { msg.textContent = e.message; b.disabled = false; }
    });
    const mb = el.querySelector('[data-meta]');
    if (mb) mb.onclick = async () => {
      mb.disabled = true; mb.textContent = 'Reading the Pages…';
      try {
        const r = await H.apiAH('/api/social/accounts/meta-pages', { fresh: true });
        const { w, done } = modal(`<div class="fl"><h3>Which Page is ${esc(brandNameOf(act))}?</h3>${r.missing?.length ? `<p class="v2hint" style="margin:0;color:var(--warn)">The Mobius Tools token is missing ${esc(r.missing.join(' and '))}. Posting will fail until Cole regenerates it with those ticked (Business settings &gt; System users).</p>` : ''}
          <div style="display:grid;gap:6px;max-height:50vh;overflow:auto">${(r.pages || []).map(p => `<button type="button" class="pg" data-pg="${esc(p.id)}"><span class="av" ${p.pic ? `style="background-image:url('${esc(p.pic)}')"` : ''}></span><span><b>${esc(p.name)}</b><small>${p.ig ? `Instagram @${esc(p.ig.handle)}` : 'No Instagram business account on this Page'}</small></span></button>`).join('') || '<p class="v2hint">The token sees no Pages. Assign the brand’s Page to the Mobius Tools system user in Business settings first.</p>'}</div>
          <div class="err" id="mpErr"></div><div class="foot"><button type="button" class="sw-btn" data-x="1">Cancel</button></div></div>`);
        w.querySelectorAll('[data-pg]').forEach(b => b.onclick = async () => { b.disabled = true; try { const x = await H.apiAH('/api/social/accounts/meta', { method: 'POST', body: JSON.stringify({ act, page_id: b.dataset.pg }) }); done(true); toast(`Connected Facebook${x.ig ? ' and Instagram' : ''}.`); connect(el, act, H); } catch (e) { w.querySelector('#mpErr').textContent = e.message; b.disabled = false; } });
      } catch (e) { msg.textContent = e.message; }
      mb.disabled = false; mb.textContent = 'Connect a Page + Instagram';
    };
  }
  function brandNameOf(act) { return ((H.S.accounts || []).find(a => a.act_id === act) || {}).name || 'this brand'; }

  window.SocialWeek = { render, connect, setHost: h => { H = h; } };
})();

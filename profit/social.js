/* LOCUS SOCIAL: FEED, SAVED and the post viewer (rebuilt 2026-10-20 to the teardown spec, docs/locus-social/teardown/spec.html,
 * after reading Virlo, Sandcastles and Later from inside the apps; first built 2026-10-19).
 *
 * WHO USES IT: a strategist on Monday deciding what to make this week. In order:
 *   1. scan what broke out for the brands and topics this brand follows (Breaking out, ratio pills on the media)
 *   2. watch the top few without leaving the grid (a card plays on hover or a tap, sound off, a sound toggle)
 *   3. open one: a dark full-height viewer, the media in the middle at phone proportions, a 340px column with the
 *      handle, one big number against "usually", the caption and tags, and a pinned bar: Make ours, Save, Open
 *   4. Make ours is a second step inside the same column: a steer line, a status sentence, the beats, three send buttons
 *   Saved is its own page tab with the same cards and a tag row; a tag is a word picked when you save.
 *   Following is set-up work: the gear opens Manage follows; Brand settings > Social carries the same table and the credits.
 *
 * THE PAGE: the host's page head (the kit header from index.html; nothing drawn here above the controls) > ONE 36px
 * controls row: the view segment (All / Breaking out, with counts), pill menus whose label is the value (source, platform,
 * format, sort, window: index.html's PillMenu, a bottom sheet on a phone), a search icon that opens a field, a Filters
 * pill with a popover (hide paid, minimum views, engagement floor) > a one-line pull status > trend chips (Breaking out
 * only) > the 9:16 grid. A card: the media with one overlay per corner (platform mark, saved bookmark, duration, ratio
 * pill), then handle + age on one line, one caption line, one metric row (views, usually, engagement).
 * The ratio only exists above the worker's floor (8+ posts and a 1k+ median; MIN_N / MIN_BASE in social.js there).
 * Data: account-health /api/social. CSS tokens only, no inline styles that fight phone.css. Never prompt() or alert().
 * 2026-10-20 additions (from the feature inventory, docs/locus-social/teardown/): Follow @handle from a topic post, "Seen in your
 * topics" suggestions and the Accounts roll-up in Manage follows, "N new since your last visit" + the Just added sort, notes on a
 * saved post, S / M / C / T keys in the viewer, Copy link / caption / transcript, the "12 of 48" counter. Instagram comes free
 * through Meta, YouTube free through the Data API; only TikTok and topic searches spend ScrapeCreators credits.
 * No em dashes. */
(() => {
  let H = null;
  const $ = s => document.querySelector(s);
  const U = () => window.V2UI;
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const store = (k, v) => { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch {} };
  const CLI = () => !!(H && H.S && (H.S.role === 'client' || H.S.client)) || document.body.classList.contains('is-client');
  const PHONE = () => window.matchMedia('(max-width: 720px)').matches;
  const HOVER = () => window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  const ic = (n, l) => window.icon ? window.icon(n, { size: 15, label: l }) : '';
  const PL = { ig: 'Instagram', tt: 'TikTok', yt: 'YouTube' };
  const PLK = { ig: 'IG', tt: 'TT', yt: 'YT' };
  const FM = { reel: 'Reel', carousel: 'Carousel', post: 'Post', tiktok: 'TikTok', photos: 'Photos', short: 'Short', video: 'Video' };
  const FMP = { reel: 'Reels', carousel: 'Carousels', post: 'Posts', tiktok: 'TikToks', photos: 'TikTok photo posts', short: 'Shorts', video: 'YouTube videos' };
  const VIDEO = new Set(['reel', 'tiktok', 'short', 'video']);
  const MULTI = new Set(['carousel', 'photos']);
  const SORTS = [['hot', 'Breaking out first', 'Ratio against what the account usually gets, then views'], ['views', 'Most views', ''], ['eng', 'Most engagement', 'Likes and comments per view'], ['new', 'Newest', ''], ['added', 'Just added', 'What Locus pulled in most recently']];
  const WINS = [[7, 'Last 7 days'], [14, 'Last 14 days'], [30, 'Last 30 days'], [90, 'Last 90 days'], [0, 'Everything kept']];
  const MINV = [[0, 'Any views'], [1000, '1k+ views'], [10000, '10k+ views'], [100000, '100k+ views']];
  const MINE = [[0, 'Any engagement'], [0.01, '1%+ engagement'], [0.03, '3%+ engagement'], [0.05, '5%+ engagement']];
  const TAGC = ['brand', 'good', 'warn', 'c-tiktok', 'c-email', 'c-google', 'bad', 'c-meta'];
  const k = n => { if (n == null) return ''; const a = Math.abs(n); return a >= 1e6 ? `${(n / 1e6).toFixed(a >= 1e7 ? 0 : 1)}M` : a >= 1e3 ? `${(n / 1e3).toFixed(a >= 1e4 ? 0 : 1)}k` : String(Math.round(n)); };
  const ago = s => { if (!s) return ''; const d = (Date.now() - Date.parse(s)) / 864e5; return d < 1 ? 'today' : d < 2 ? '1d' : d < 30 ? `${Math.floor(d)}d` : d < 365 ? `${Math.floor(d / 30)}mo` : new Date(s).toLocaleDateString('en-US', { month: 'short', year: '2-digit' }); };
  const agoLong = s => { if (!s) return ''; const d = (Date.now() - Date.parse(s)) / 864e5; return d < 1 / 24 ? 'just now' : d < 1 ? `${Math.floor(d * 24)}h ago` : d < 2 ? 'yesterday' : d < 30 ? `${Math.floor(d)} days ago` : new Date(s).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }); };
  const engOf = p => p.views ? (((p.likes || 0) + (p.comments || 0)) / p.views) : null;
  const dur = s => s ? `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}` : '';
  const ST = { on: [], loaded: false, data: null, act: null, page: 'social', view: store('soc_view2') || 'feed', src: '', plat: '', fmt: '', sort: store('soc_sort') || 'hot',
    win: store('soc_win2') == null ? 30 : Number(store('soc_win2')) || 0, paid: store('soc_paid') === '1', minv: Number(store('soc_minv')) || 0, mine: Number(store('soc_mine')) || 0, q: '', qOpen: false, tag: '', lastVisit: 0, newN: 0 };
  const VID = {};        // post id -> { src } | { embed } | { error }
  const SLIDES = {};     // post id -> [urls]
  const tagColor = name => `var(--${TAGC[[...String(name)].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7) % TAGC.length]})`;

  function css() {
    if (document.getElementById('soccss')) return;
    const st = document.createElement('style'); st.id = 'soccss';
    st.textContent = `
      .soc{--soc-r:var(--r-md,10px)}
      .soc-btn{display:inline-flex;align-items:center;justify-content:center;gap:6px;height:32px;padding:0 12px;border-radius:var(--r-sm,8px);border:1px solid var(--line-strong);background:var(--surface);font:inherit;font-weight:600;font-size:13px;cursor:pointer;color:var(--ink);white-space:nowrap;text-decoration:none}
      .soc-btn:hover{background:var(--surface-2)} .soc-btn.pri{background:var(--brand);border-color:var(--brand);color:var(--on-brand)} .soc-btn.pri:hover{filter:brightness(1.05)}
      .soc-btn:disabled{opacity:.55;cursor:default} .soc-btn.sm{height:28px;padding:0 10px;font-size:12.5px} .soc-btn.q{border-color:transparent;background:transparent;color:var(--ink-2)} .soc-btn.q:hover{background:var(--surface-2)}
      .soc-btn.bad{color:var(--bad)} .soc-btn.ico{width:32px;padding:0}
      /* ONE controls row: segment, pill menus, search, Filters. 36px, nothing boxed. */
      .soc .soc-ctl{display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin:0 0 12px;min-height:36px}
      .soc .soc-ctl .sp{flex:1}
      .soc .soc-seg{display:inline-flex;gap:2px;background:var(--surface-2);border-radius:var(--r-sm,8px);padding:2px;margin-right:4px}
      .soc .soc-seg button{height:28px;padding:0 11px;border-radius:6px;font:inherit;font-size:13px;font-weight:500;cursor:pointer;background:transparent;color:var(--muted);border:0;display:inline-flex;align-items:center;gap:5px;white-space:nowrap}
      .soc .soc-seg button.on{background:var(--surface);color:var(--ink);box-shadow:0 1px 2px rgba(0,0,0,.12)}
      .soc .soc-seg button small{font-weight:500;color:var(--muted);font-variant-numeric:tabular-nums}
      .soc .soc-ctl .hd-period{position:relative}
      .soc .soc-ctl .hd-per-btn .hd-per-l{display:none}
      .soc .soc-ctl .hd-per-btn .hd-per-d{display:inline;color:var(--ink);font-size:12.5px;font-weight:600}
      .soc .soc-ctl .hd-period.on .hd-per-btn{border-color:var(--brand);color:var(--brand-ink,var(--brand))}
      .soc .soc-q{display:inline-flex;align-items:center;gap:4px}
      .soc .soc-q input{width:0;opacity:0;height:32px;padding:0;border:1px solid var(--line-strong);border-radius:var(--r-sm,8px);background:var(--surface);color:var(--ink);font:inherit;font-size:13px;transition:width .16s,opacity .16s,padding .16s}
      .soc .soc-q.open input{width:190px;opacity:1;padding:0 10px}
      .soc .soc-filt{position:relative}
      .soc .soc-filt .hd-per-menu{min-width:280px;padding:10px 12px;gap:10px;left:0;right:auto;z-index:60}
      .soc .soc-filt.open .hd-per-menu{display:grid}
      .soc .soc-filt .fr{display:flex;align-items:center;justify-content:space-between;gap:12px;font-size:13px;color:var(--ink)}
      .soc .soc-filt .fr > div:first-child{flex:1;min-width:0}
      .soc .soc-filt .hd-per-menu button.v2sw{display:inline-block;width:30px;padding:0} .soc .soc-filt .hd-per-menu button.fx{width:auto;display:inline;padding:0;background:none}
      .soc .soc-filt .fr small{display:block;color:var(--muted);font-size:11.5px;margin-top:1px}
      .soc .soc-filt .fr select{height:30px;padding:0 8px;border:1px solid var(--line-strong);border-radius:var(--r-sm,8px);background:var(--surface);color:var(--ink);font:inherit;font-size:12.5px}
      .soc .soc-filt .fr .v2sw{flex:none}
      .soc .soc-filt .fx{font:inherit;font-size:12px;color:var(--brand);background:none;border:0;padding:0;cursor:pointer;text-align:left}
      /* the quiet status line and the trend chips */
      .soc .soc-status{font-size:12.5px;color:var(--muted);margin:-4px 2px 12px;line-height:1.5;display:flex;gap:6px 14px;flex-wrap:wrap;align-items:center}
      .soc .soc-status b{color:var(--ink-2);font-weight:600}
      .soc .soc-trend{display:flex;gap:6px;flex-wrap:wrap;align-items:center;margin:0 0 12px}
      .soc .soc-trend .lb{font-size:12px;color:var(--muted);margin-right:4px}
      .soc .soc-trend button,.soc .soc-tags button{display:inline-flex;align-items:center;gap:6px;height:26px;padding:0 9px;border-radius:999px;border:1px solid var(--line);background:var(--surface);font:inherit;font-size:12px;color:var(--ink-2);cursor:pointer;white-space:nowrap;max-width:240px}
      .soc .soc-trend button span,.soc .soc-tags button span{overflow:hidden;text-overflow:ellipsis}
      .soc .soc-trend button small,.soc .soc-tags button small{color:var(--muted);font-variant-numeric:tabular-nums}
      .soc .soc-trend button:hover,.soc .soc-tags button:hover{border-color:var(--line-strong)}
      .soc .soc-trend button.on,.soc .soc-tags button.on{border-color:var(--brand);color:var(--brand-ink,var(--brand));background:var(--brand-soft)}
      .soc .soc-tags{display:flex;gap:6px;flex-wrap:wrap;align-items:center;margin:0 0 12px}
      .soc .soc-tags i,.soc-tagdot{width:8px;height:8px;border-radius:50%;flex:none;display:inline-block}
      /* the grid and a card: 9:16, one overlay per corner, nothing else on the media */
      .soc .soc-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:16px}
      .soc .soc-post{display:flex;flex-direction:column;min-width:0;cursor:pointer;text-align:left;padding:0;font:inherit;color:var(--ink);background:transparent;border:0;border-radius:var(--soc-r)}
      .soc .soc-post:focus-visible{outline:2px solid var(--brand);outline-offset:2px}
      .soc .soc-med{position:relative;aspect-ratio:9/16;background:var(--surface-2);overflow:hidden;border-radius:var(--soc-r);border:1px solid var(--line)}
      .soc .soc-post:hover .soc-med{border-color:var(--line-strong)}
      .soc .soc-med img,.soc .soc-med video,.soc .soc-med iframe{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;display:block;border:0;background:#000}
      .soc .soc-med iframe{pointer-events:none}
      .soc-pf{position:absolute;top:8px;left:8px;height:20px;min-width:20px;padding:0 5px;border-radius:5px;display:inline-flex;align-items:center;justify-content:center;font-size:9.5px;font-weight:800;letter-spacing:.03em;background:rgba(16,16,20,.66);color:#fff;backdrop-filter:blur(4px)}
      .soc .soc-med .sv{position:absolute;top:8px;right:8px;width:22px;height:22px;border-radius:6px;display:inline-flex;align-items:center;justify-content:center;background:rgba(16,16,20,.66);color:#fff}
      .soc .soc-med .dur{position:absolute;bottom:8px;left:8px;font-size:10.5px;font-weight:600;background:rgba(16,16,20,.66);color:#fff;padding:2px 6px;border-radius:5px;font-variant-numeric:tabular-nums}
      .soc .soc-med .soc-x{position:absolute;bottom:8px;right:8px}
      .soc .soc-med.playing .soc-x,.soc .soc-med.playing .dur{display:none}
      .soc .soc-med .spin{position:absolute;left:50%;top:50%;width:26px;height:26px;margin:-13px 0 0 -13px;border-radius:50%;border:2.5px solid rgba(255,255,255,.35);border-top-color:#fff;animation:socspin .8s linear infinite;display:none}
      .soc .soc-med.loading .spin{display:block}
      @keyframes socspin{to{transform:rotate(360deg)}}
      .soc .soc-body{padding:8px 2px 0;display:grid;gap:3px}
      .soc .soc-who{display:flex;gap:6px;align-items:baseline;min-width:0;font-size:13px;font-weight:600}
      .soc .soc-who b{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-weight:600;min-width:0}
      .soc .soc-who small{color:var(--muted);font-weight:500;font-size:12px;white-space:nowrap}
      .soc .soc-who .tp{margin-left:auto;font-size:10.5px;font-weight:600;padding:1px 6px;border-radius:4px;background:var(--unk-bg);color:var(--ink-2);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:45%}
      .soc .soc-cap{font-size:12.5px;line-height:1.4;color:var(--muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      .soc-mr{display:flex;gap:8px;align-items:center;font-size:12.5px;color:var(--muted);font-variant-numeric:tabular-nums;white-space:nowrap;overflow:hidden;min-width:0}
      .soc-mr b{color:var(--ink);font-weight:600}
      .soc-x{display:inline-flex;align-items:center;height:20px;padding:0 7px;border-radius:5px;font-size:11.5px;font-weight:700;color:var(--good);background:var(--good-bg);font-variant-numeric:tabular-nums}
      .soc-x.hi{color:var(--warn);background:var(--warn-bg)} .soc-x.lo{color:var(--ink-2);background:var(--unk-bg)}
      .soc .soc-made{font-size:11px;font-weight:600;color:var(--brand);display:inline-flex;gap:4px;align-items:center}
      .soc .soc-tg{font-size:11px;font-weight:600;color:var(--ink-2);display:inline-flex;gap:5px;align-items:center}
      /* empty, loading, error */
      .soc .soc-state{border:1px dashed var(--line-strong);border-radius:var(--soc-r);padding:40px 20px;text-align:center;display:grid;gap:8px;justify-items:center;background:var(--surface)}
      .soc .soc-state b{font-size:15px} .soc .soc-state p{margin:0;max-width:52ch;color:var(--muted);font-size:13px;line-height:1.5}
      .soc .soc-state .acts{display:flex;gap:8px;flex-wrap:wrap;justify-content:center;margin-top:4px}
      .soc .soc-state.err{border-style:solid;border-color:var(--bad);background:var(--bad-bg)} .soc .soc-state.err b{color:var(--bad)}
      .soc .soc-sk{display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:16px}
      .soc .soc-sk i{display:block;aspect-ratio:9/16;border-radius:var(--soc-r);background:linear-gradient(90deg,var(--surface-2) 0%,color-mix(in srgb,var(--surface-2) 55%,var(--surface)) 50%,var(--surface-2) 100%);background-size:200% 100%;animation:socshim 1.3s linear infinite}
      @keyframes socshim{to{background-position:-200% 0}}
      /* manage follows (the gear) and the same table in Brand settings */
      .soc .soc-tbl{border:1px solid var(--line);border-radius:var(--soc-r);background:var(--surface);overflow:hidden}
      .soc .soc-tbl table{width:100%;border-collapse:collapse;font-size:13px}
      .soc .soc-tbl th{font-size:10.5px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:var(--muted);text-align:left;padding:10px 14px;border-bottom:1px solid var(--line);white-space:nowrap}
      .soc .soc-tbl td{padding:10px 14px;border-bottom:1px solid var(--line);vertical-align:middle;color:var(--ink)}
      .soc .soc-tbl tr:last-child td{border-bottom:0}
      .soc .soc-tbl td .sub{display:block;font-size:11.5px;color:var(--muted);margin-top:2px}
      .soc .soc-tbl td.r{text-align:right;white-space:nowrap} .soc .soc-tbl td.num{font-variant-numeric:tabular-nums;white-space:nowrap}
      .soc .soc-tbl .acts{display:inline-flex;gap:6px}
      .soc .soc-kind{display:inline-flex;align-items:center;height:20px;padding:0 7px;border-radius:5px;font-size:11px;font-weight:600;background:var(--unk-bg);color:var(--ink-2)}
      .soc .soc-st{display:inline-flex;align-items:center;gap:6px;font-size:12.5px;white-space:nowrap}
      .soc .soc-st i{width:7px;height:7px;border-radius:50%;background:var(--good);flex:none} .soc .soc-st.bad i{background:var(--bad)} .soc .soc-st.wait i{background:var(--muted)}
      .soc .soc-tbl .soc-st{white-space:normal;align-items:flex-start;max-width:260px;line-height:1.35} .soc .soc-tbl .soc-st i{margin-top:5px}
      .soc .soc-manage-top{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin:0 0 12px}
      .soc .soc-manage-top p{margin:0;color:var(--muted);font-size:13px;flex:1 1 300px}
      .soc .soc-sug{border:1px solid var(--line);border-radius:var(--soc-r);background:var(--surface);padding:14px 16px;margin:0 0 14px;display:grid;gap:8px}
      .soc .soc-sug h4{margin:0;font-size:13.5px;font-weight:650} .soc .soc-sug p{margin:0;color:var(--muted);font-size:12.5px}
      .soc .soc-sug .row{display:flex;align-items:center;gap:10px;font-size:13px;min-width:0} .soc .soc-sug .row b{font-weight:600} .soc .soc-sug .row small{color:var(--muted);font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-width:0}
      .soc .soc-sug .row .soc-btn{margin-left:auto;flex:none}
      .soc .soc-status .nw{display:inline-flex;align-items:center;gap:5px;height:22px;padding:0 8px;border-radius:999px;background:var(--brand-soft);color:var(--brand-ink,var(--brand));font-weight:600;border:0;font:inherit;font-size:12px;cursor:pointer}
      .soc .soc-status .pz{color:var(--warn)}
      .soc-view .vcount{position:absolute;top:26px;left:64px;font-size:12px;color:rgba(255,255,255,.6);font-variant-numeric:tabular-nums}
      .soc-view .vcopy{font:inherit;font-size:11.5px;color:var(--muted);background:none;border:0;padding:0;cursor:pointer;margin-left:8px} .soc-view .vcopy:hover{color:var(--ink)}
      .soc-view .vcap-h,.soc-view .vtr b{display:flex;align-items:center}
      .soc-view .vnote textarea{width:100%;min-height:54px;border:1px solid var(--line-strong);border-radius:var(--r-sm,8px);background:var(--surface);color:var(--ink);font:inherit;font-size:12.5px;padding:7px 9px;resize:vertical}
      .soc-view .vnote small{display:block;color:var(--muted);font-size:11.5px;margin-top:3px}
      .soc .soc-note{font-size:12px;color:var(--ink-2);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      .soc-view .vkeys{color:var(--muted);font-size:11px;letter-spacing:.02em}
      /* THE VIEWER: a dark full-height overlay, the media in the middle at phone proportions, a 340px column, a pinned bar */
      .soc-view{position:fixed;inset:0;z-index:9000;background:rgba(10,10,12,.96);display:grid;grid-template-columns:minmax(0,1fr) 340px;color:#fff;opacity:0;visibility:hidden;transition:opacity var(--t-fast,.14s)}
      .soc-view.on{opacity:1;visibility:visible}
      .soc-view .vstage{position:relative;display:flex;align-items:center;justify-content:center;min-width:0;padding:48px 72px}
      .soc-view .vmed{position:relative;height:100%;max-height:calc(100vh - 96px);aspect-ratio:9/16;max-width:100%;background:#000;border-radius:14px;overflow:hidden;display:flex;align-items:center;justify-content:center}
      .soc-view .vmed img,.soc-view .vmed video{width:100%;height:100%;object-fit:contain;display:block;background:#000}
      .soc-view .vmed iframe{width:100%;height:100%;border:0;background:#000}
      /* one plain speaker: sound on or off, remembered. Sits above the native control bar. */
      .soc-view .vmed .snd{position:absolute;top:12px;right:12px;width:36px;height:36px;border-radius:50%;border:0;background:rgba(16,16,20,.72);color:#fff;display:inline-flex;align-items:center;justify-content:center;cursor:pointer;z-index:2}
      .soc-view .vmed .snd:hover{background:rgba(16,16,20,.9)} .soc-view .vmed .snd svg{width:18px;height:18px}
      .soc-view .vmed .note{position:absolute;left:50%;bottom:14px;transform:translateX(-50%);font-size:12px;background:rgba(16,16,20,.8);padding:6px 10px;border-radius:7px;white-space:nowrap;color:#fff}
      .soc-view .vmed button.note{border:0;font:inherit;font-size:12.5px;font-weight:600;cursor:pointer;bottom:auto;top:50%;transform:translate(-50%,-50%);padding:10px 16px;border-radius:999px;display:inline-flex;gap:8px;align-items:center;z-index:2}
      .soc-view .vmed button.note svg{width:16px;height:16px}
      .soc-view .vslides{position:absolute;inset:0;display:flex;overflow-x:auto;scroll-snap-type:x mandatory;scrollbar-width:none;scroll-behavior:smooth} .soc-view .vslides::-webkit-scrollbar{display:none}
      .soc-view .vslides img{flex:none;width:100%;height:100%;object-fit:contain;scroll-snap-align:start;background:#000}
      .soc-view .vdots{position:absolute;bottom:12px;left:0;right:0;display:flex;gap:5px;justify-content:center;pointer-events:none}
      .soc-view .vdots i{width:6px;height:6px;border-radius:50%;background:rgba(255,255,255,.4)} .soc-view .vdots i.on{background:#fff}
      .soc-view .vcnt{position:absolute;top:12px;left:12px;font-size:11.5px;font-weight:600;background:rgba(16,16,20,.72);color:#fff;padding:3px 8px;border-radius:999px;font-variant-numeric:tabular-nums;pointer-events:none}
      .soc-view .vsl{position:absolute;top:50%;width:34px;height:34px;margin-top:-17px;border-radius:50%;border:0;background:rgba(16,16,20,.72);color:#fff;display:inline-flex;align-items:center;justify-content:center;cursor:pointer;font-size:18px;line-height:1;z-index:2}
      .soc-view .vsl:hover{background:rgba(16,16,20,.9)} .soc-view .vsl:disabled{opacity:.25;cursor:default} .soc-view .vsl.l{left:10px} .soc-view .vsl.r{right:10px}
      .soc-view .vx,.soc-view .vprev,.soc-view .vnext{position:absolute;width:40px;height:40px;border-radius:50%;border:0;background:rgba(255,255,255,.1);color:#fff;display:inline-flex;align-items:center;justify-content:center;cursor:pointer;font-size:20px;line-height:1}
      .soc-view .vx:hover,.soc-view .vprev:hover,.soc-view .vnext:hover{background:rgba(255,255,255,.2)}
      .soc-view .vx{top:16px;left:16px} .soc-view .vprev{left:16px;top:50%;margin-top:-20px} .soc-view .vnext{right:16px;top:50%;margin-top:-20px}
      .soc-view .vprev:disabled,.soc-view .vnext:disabled{opacity:.25;cursor:default}
      .soc-view .vcol{background:var(--surface);color:var(--ink);display:flex;flex-direction:column;min-height:0;border-left:1px solid var(--line)}
      .soc-view .vbody{flex:1;overflow:auto;padding:18px 18px 12px;display:grid;gap:12px;align-content:start;font-size:13px}
      .soc-view .vwho{display:flex;gap:10px;align-items:center;min-width:0}
      .soc-view .vav{width:36px;height:36px;border-radius:50%;background:var(--surface-2);display:inline-flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;color:var(--ink-2);flex:none;overflow:hidden}
      .soc-view .vav img{width:100%;height:100%;object-fit:cover}
      .soc-view .vwho b{display:block;font-size:14px;font-weight:650;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      .soc-view .vwho small{display:block;color:var(--muted);font-size:12px;margin-top:1px}
      .soc-view .vline{color:var(--muted);font-size:12.5px}
      .soc-view .vbig{display:flex;align-items:baseline;gap:10px;flex-wrap:wrap}
      .soc-view .vbig b{font-size:26px;font-weight:650;letter-spacing:-.02em;font-variant-numeric:tabular-nums;line-height:1}
      .soc-view .vbig span{color:var(--muted);font-size:12.5px}
      .soc-view .vsmall{display:flex;gap:12px;color:var(--muted);font-size:12.5px;font-variant-numeric:tabular-nums;flex-wrap:wrap}
      .soc-view .vsmall b{color:var(--ink);font-weight:600}
      .soc-view .vcap{font-size:13px;line-height:1.55;white-space:pre-wrap;color:var(--ink);overflow-wrap:anywhere}
      .soc-view .vtags{display:flex;gap:6px;flex-wrap:wrap}
      .soc-view .vtags span{font-size:11.5px;font-weight:600;padding:2px 8px;border-radius:5px;background:var(--unk-bg);color:var(--ink-2)}
      .soc-view .vbar{display:flex;gap:6px;padding:10px 12px calc(10px + env(safe-area-inset-bottom,0px));border-top:1px solid var(--line);background:var(--surface);align-items:center;flex-wrap:wrap}
      .soc-view .vbar .soc-btn{padding:0 10px} .soc-view .vbar .soc-btn.mk{flex:1;min-width:0}
      .soc-view .vbar .soc-btn.sav.on{color:var(--brand-ink,var(--brand));border-color:var(--brand);background:var(--brand-soft)}
      /* the tag row: shows once the post is saved, under the buttons; one tap picks a tag, + tag types a new one */
      .soc-view .vtagrow{flex:1 1 100%;display:flex;gap:5px;flex-wrap:wrap;align-items:center;font-size:12px;color:var(--muted)}
      .soc-view .vtagrow .lb{margin-right:2px}
      .soc-view .vtagrow button{display:inline-flex;align-items:center;gap:5px;height:24px;padding:0 8px;border-radius:999px;border:1px solid var(--line);background:var(--surface);font:inherit;font-size:11.5px;font-weight:600;color:var(--ink-2);cursor:pointer;white-space:nowrap;max-width:160px}
      .soc-view .vtagrow button span{overflow:hidden;text-overflow:ellipsis}
      .soc-view .vtagrow button:hover{border-color:var(--line-strong)}
      .soc-view .vtagrow button.on{border-color:var(--brand);color:var(--brand-ink,var(--brand));background:var(--brand-soft)}
      .soc-view .vtagrow button.add{border-style:dashed;color:var(--muted)}
      .soc-view .vtagrow input{height:24px;padding:0 8px;border:1px solid var(--line-strong);border-radius:999px;background:var(--surface);color:var(--ink);font:inherit;font-size:11.5px;width:120px}
      /* make ours as a second step inside the column */
      .soc-view .vstep{display:grid;gap:10px}
      .soc-view .vstep .bk{font:inherit;font-size:12.5px;color:var(--muted);background:none;border:0;padding:0;cursor:pointer;text-align:left;display:inline-flex;gap:4px;align-items:center}
      .soc-view .vstep h3{margin:0;font-size:15px;font-weight:650}
      .soc-view .vstep input[type=text],.soc-view .vstep textarea{width:100%;min-height:36px;border:1px solid var(--line-strong);border-radius:var(--r-sm,8px);background:var(--surface);color:var(--ink);font:inherit;font-size:13px;padding:8px 10px;resize:vertical}
      .soc-view .vstep p{margin:0;font-size:13px;line-height:1.5;color:var(--ink-2)}
      .soc-view .vstat{display:flex;gap:8px;align-items:center;font-size:13px;color:var(--ink-2)}
      .soc-view .vtr{font-size:13px;line-height:1.55;color:var(--ink-2);background:var(--surface-2);border-radius:var(--r-sm,8px);padding:10px 12px;display:grid;gap:4px;max-height:260px;overflow:auto}
      .soc-view .vtr b{font-size:11px;letter-spacing:.04em;text-transform:uppercase;color:var(--muted);font-weight:700}
      .soc-view .mkmode{display:grid;gap:6px}
      .soc-view .mkmode label{display:grid;grid-template-columns:auto 1fr;grid-template-rows:auto auto;column-gap:10px;align-items:center;border:1px solid var(--line-strong);border-radius:var(--r-sm,8px);padding:8px 10px;cursor:pointer;font-size:13px}
      .soc-view .mkmode label.on{border-color:var(--brand);background:var(--brand-soft)}
      .soc-view .mkmode input{grid-row:1/3;margin:0;accent-color:var(--brand)}
      .soc-view .mkmode b{color:var(--ink);font-weight:600} .soc-view .mkmode small{grid-column:2;color:var(--muted);font-size:12px;line-height:1.35}
      .soc-view .vstat i{width:8px;height:8px;border-radius:50%;background:var(--muted);flex:none} .soc-view .vstat.work i{background:var(--brand);animation:socpulse 1.2s ease-in-out infinite} .soc-view .vstat.ok i{background:var(--good)} .soc-view .vstat.ask i{background:var(--warn)} .soc-view .vstat.bad i{background:var(--bad)}
      @keyframes socpulse{50%{opacity:.3}}
      .soc-view .beats{display:grid;gap:5px}
      .soc-view .beat{display:grid;grid-template-columns:64px minmax(0,1fr);gap:8px;align-items:start;font-size:12.5px;background:var(--surface-2);border-radius:7px;padding:7px 9px;line-height:1.45}
      .soc-view .beat i{font-style:normal;font-size:10.5px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:var(--muted);padding-top:2px}
      .soc-view .beat.hk{background:var(--warn-bg)} .soc-view .beat.hk i{color:var(--warn)}
      .soc-view .vrow{display:flex;gap:6px;flex-wrap:wrap;align-items:center}
      .soc-view .err{color:var(--bad);font-size:12.5px} .soc-view .err:empty{display:none}
      .soc-view .sent{font-size:12.5px;color:var(--good);font-weight:600;display:flex;gap:6px;align-items:center}
      /* modals */
      .soc-m .fl{display:grid;gap:12px} .soc-m h3{margin:0;font-size:16px;font-weight:650}
      .soc-m label.f{display:grid;gap:5px;font-size:12.5px;font-weight:600;color:var(--ink-2)}
      .soc-m input[type=text]{width:100%;height:36px;padding:0 10px;border-radius:8px;border:1px solid var(--line-strong);background:var(--surface);color:var(--ink);font:inherit;font-weight:400}
      .soc-m .foot{display:flex;gap:8px;justify-content:flex-end} .soc-m .err{color:var(--bad);font-size:12.5px;min-height:1em}
      .soc-m .three{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}
      .soc-m .hint{margin:0;font-size:12.5px;color:var(--muted);line-height:1.5}
      .soc-m .soc-seg{display:inline-flex;gap:2px;background:var(--surface-2);border-radius:8px;padding:2px} .soc-m .soc-seg button{height:28px;padding:0 11px;border-radius:6px;font:inherit;font-size:13px;cursor:pointer;background:transparent;color:var(--muted);border:0} .soc-m .soc-seg button.on{background:var(--surface);color:var(--ink)}
      /* settings > Social */
      .soc-set{display:grid;gap:14px}
      .soc-set .onrow{display:flex;align-items:center;gap:12px;flex-wrap:wrap}
      .soc-set .onrow b{font-size:13.5px} .soc-set .onrow small{display:block;color:var(--muted);font-size:12px;margin-top:1px}
      .soc-set .onrow .msg{font-size:12.5px;color:var(--muted);margin-left:auto}
      .soc-set .cred{font-size:12.5px;color:var(--muted);line-height:1.5} .soc-set .cred b{color:var(--ink)} .soc-set .cred.low b{color:var(--warn)}
      .soc-set h4{margin:0;font-size:11px;font-weight:650;letter-spacing:.06em;text-transform:uppercase;color:var(--muted);display:flex;align-items:center;gap:10px} .soc-set h4 .sp{flex:1}
      @media (max-width:720px){
        .soc .soc-grid,.soc .soc-sk{grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}
        .soc .soc-ctl{flex-wrap:nowrap;overflow-x:auto;scrollbar-width:none;margin-left:-16px;margin-right:-16px;padding:0 16px} .soc .soc-ctl::-webkit-scrollbar{display:none}
        .soc .soc-ctl .sp{display:none} .soc .soc-ctl .hd-period.ph-hide,.soc .soc-q{display:none}
        .soc .soc-ctl .hd-per-btn .hd-per-d{display:inline}
        .soc .soc-body{padding-top:6px} .soc .soc-cap{display:none}
        .soc-mr{gap:7px;font-size:11.5px}
        .soc .soc-tbl table,.soc .soc-tbl thead,.soc .soc-tbl tbody,.soc .soc-tbl tr,.soc .soc-tbl td{display:block}
        .soc .soc-tbl thead{display:none} .soc .soc-tbl td{border:0;padding:3px 14px} .soc .soc-tbl tr{padding:10px 0;border-bottom:1px solid var(--line)} .soc .soc-tbl td.r{text-align:left;padding-top:8px}
        .soc-m .three{grid-template-columns:1fr}
        .soc-view{grid-template-columns:1fr;grid-template-rows:minmax(0,56vh) minmax(0,1fr);background:var(--surface)}
        .soc-view .vstage{padding:0;background:#000}
        .soc-view .vmed{max-height:none;height:100%;border-radius:0;aspect-ratio:auto;width:100%}
        .soc-view .vx{top:calc(10px + env(safe-area-inset-top,0px));left:10px;width:36px;height:36px} .soc-view .vprev,.soc-view .vnext{display:none}
        .soc-view .vcol{border-left:0} .soc-view .vbody{padding:14px 16px 90px}
        .soc-view .vbar{position:fixed;left:0;right:0;bottom:0;padding:10px 12px calc(10px + env(safe-area-inset-bottom,0px))} .soc-view .vbar .soc-btn{min-height:40px;flex:1 1 auto}
        .soc-view .vtagrow{flex-basis:100%}
      }`;
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
    el.innerHTML = `<div class="soc soc-set">
      <div class="onrow"><button type="button" class="v2sw ${on ? 'on' : ''}" id="socOn" role="switch" aria-checked="${on}" aria-label="Show Social for this brand"><i></i></button>
        <div><b>Show Social for ${esc(brandNameOf(act))}</b><small>Watch what the brands it follows post, save the best, and plan the week of posts.</small></div><span class="msg" id="socOnMsg"></span></div>
      <div id="socTarget"></div>
      <div id="socFollows"></div>
      <div id="socConnect"></div></div>`;
    /* The weekly target (2026-10-20): what "2 of 5 planned" on the Week counts against, and what Fill the week fills to. */
    const target = async () => {
      const c = el.querySelector('#socTarget'); if (!c) return;
      if (!ST.on.includes(act) || CLI()) { c.innerHTML = ''; return; }
      try {
        const w = await H.apiAH(`/api/social/week?act=${encodeURIComponent(act)}`, { fresh: true });
        c.innerHTML = `<style>.soc-tgt{display:flex;gap:10px;align-items:center;flex-wrap:wrap;font-size:12.5px;color:var(--muted)} .soc-tgt input{width:64px;border:1px solid var(--line);border-radius:8px;background:var(--surface);color:var(--ink);font:inherit;padding:6px 8px} .soc-tgt span{flex:1 1 240px}</style><h4>Posts a week</h4><div class="soc-tgt"><input type="number" min="0" max="21" id="socTgt" value="${Number(w.target ?? 5)}" aria-label="Posts a week"><span>planned posts a week. The Week shows "N of ${Number(w.target ?? 5)} planned" and Fill the week fills up to it. Monday 8am Slack says so only when the week is short.</span><button type="button" class="soc-btn sm" id="socTgtSave">Save</button><span class="msg" id="socTgtMsg"></span></div>`;
        c.querySelector('#socTgtSave').onclick = async () => {
          const msg = c.querySelector('#socTgtMsg');
          try { const r = await H.apiAH('/api/social/target', { method: 'PUT', body: JSON.stringify({ act, target: +c.querySelector('#socTgt').value }) }); msg.textContent = `Saved: ${r.target} a week.`; }
          catch (e) { msg.textContent = e.message; }
        };
      } catch (e) { c.innerHTML = `<p class="v2bad">${esc(e.message)}</p>`; }
    };
    target();
    const connect = () => { const c = el.querySelector('#socConnect'); if (!c) return; if (ST.on.includes(act) && window.SocialWeek) window.SocialWeek.connect(c, act, H); else c.innerHTML = ''; };
    const follows = async () => {
      const c = el.querySelector('#socFollows'); if (!c) return;
      if (!ST.on.includes(act)) { c.innerHTML = ''; return; }
      c.innerHTML = '<p class="v2hint">Reading the follows…</p>';
      try {
        const d = await H.apiAH(`/api/social?act=${encodeURIComponent(act)}`, { fresh: true });
        const cred = CLI() ? '' : sourcesLine(d);
        c.innerHTML = `<h4>Following<span class="sp"></span>${CLI() ? '' : `<button type="button" class="soc-btn sm" id="socSetAdd">${ic('plus')} Follow</button>`}</h4>${followTable(d.follows || [], { act, compact: true })}${cred}`;
        wireFollowTable(c, d.follows || [], act, follows);
        const a = c.querySelector('#socSetAdd'); if (a) a.onclick = () => followModal(act, follows);
      } catch (e) { c.innerHTML = `<p class="v2bad">${esc(e.message)}</p>`; }
    };
    connect(); follows();
    el.querySelector('#socOn').onclick = async e => {
      const b = e.currentTarget, msg = el.querySelector('#socOnMsg'), next = !b.classList.contains('on');
      b.disabled = true;
      try { await H.apiAH('/api/social/brand', { method: 'PUT', body: JSON.stringify({ act, on: next }) }); await loadBrands(true); rail(act); b.classList.toggle('on', next); b.setAttribute('aria-checked', String(next)); msg.textContent = next ? 'On. Social is in the rail.' : 'Off. Follows and saved posts are kept.'; connect(); follows(); target(); }
      catch (err) { msg.textContent = err.message; }
      b.disabled = false;
    };
  }
  /* Where the posts come from, in plain words (2026-10-20): Instagram is free through Meta, YouTube free through Google's
     API once the key is set, only TikTok and topic searches spend ScrapeCreators credits. */
  function sourcesLine(d) {
    const parts = [`Instagram: ${d.ig_meta === false ? 'needs the Meta token' : 'free, through Meta'}`, `YouTube: ${d.yt_key === false ? 'free once the YouTube key is set (until then it uses ScrapeCreators)' : 'free, through Google'}`];
    const c = d.credits == null ? null : Number(d.credits);
    const paused = d.paused || (c != null && d.low != null && c < d.low);
    parts.push(`TikTok and topic searches: ScrapeCreators, ${c == null ? 'credits unknown' : `${c.toLocaleString('en-US')} credits left`}${paused ? ', PAUSED until a top-up' : ''}`);
    return `<p class="cred ${paused ? 'low' : ''}">${parts.map(esc).join(' · ')}.${paused ? ' Instagram and YouTube keep pulling; TikTok and topics wait. Top up at <a href="https://app.scrapecreators.com" target="_blank" rel="noopener">scrapecreators.com</a> ($47 = 25,000 credits).' : ''}</p>`;
  }
  function rail(act) { const b = document.getElementById('railSocial'); if (b) b.hidden = !tabOk(act); }
  function brandNameOf(act) { return ((H.S.accounts || []).find(a => a.act_id === act) || {}).name || 'this brand'; }
  function brandName() { return brandNameOf(ST.act); }

  /* ---------- the page ---------- */
  async function render(tab, host, first) {
    H = host; css();
    ST.page = tab === 'socialsaved' ? 'socialsaved' : tab === 'socialresults' ? 'socialresults' : 'social';
    const act = H.S.act;
    const t = H.RUN();
    const head = H.pageHead(ST.page, 'Social');
    if (!act || act === 'all') { $('#main').innerHTML = `<div class="v2 soc">${head}<div class="soc-state"><b>Pick a brand</b><p>Choose a brand at the top to see what the brands it follows are posting.</p></div></div>`; return; }
    if (first || ST.act !== act || !ST.data) $('#main').innerHTML = `<div class="v2 soc">${head}<div class="soc-sk">${'<i></i>'.repeat(PHONE() ? 4 : 8)}</div></div>`;
    let d;
    try { d = await H.apiAH(`/api/social?act=${encodeURIComponent(act)}`, { fresh: true }); }
    catch (e) {
      if (t !== H.RUN()) return;
      $('#main').innerHTML = `<div class="v2 soc">${head}<div class="soc-state err"><b>Social did not load</b><p>${esc(e.message)}</p><div class="acts"><button type="button" class="soc-btn" id="socRetry">Try again</button></div></div></div>`;
      $('#socRetry').onclick = () => render(tab, host, true);
      return;
    }
    if (t !== H.RUN()) return;
    if (ST.act !== act || !ST.lastVisit) { ST.lastVisit = Number(store(`soc_seen_${act}`)) || 0; store(`soc_seen_${act}`, String(Date.now())); }
    ST.newN = ST.lastVisit ? (d.posts || []).filter(p => p.seen && Date.parse(p.seen) > ST.lastVisit).length : 0;
    ST.data = d; ST.act = act;
    if (ST.src && !(d.follows || []).some(f => f.id === ST.src)) ST.src = '';
    if (ST.view === 'manage' && ST.page === 'socialsaved') ST.view = 'feed';
    draw();
  }
  async function reload() { await render(ST.page, H, false); }

  const saved = () => ST.page === 'socialsaved';
  const okRatio = p => p.ratio != null && p.base != null;
  function filtered() {
    const d = ST.data, posts = d.posts || [];
    let list = saved() ? posts.filter(p => p.saved || p.idea_id) : ST.view === 'hot' ? posts.filter(p => p.breaking) : posts;
    if (saved() && ST.tag) list = list.filter(p => p.tag === ST.tag);
    if (ST.src) list = list.filter(p => p.follow_id === ST.src);
    if (ST.plat) list = list.filter(p => p.plat === ST.plat);
    if (ST.fmt) list = list.filter(p => p.fmt === ST.fmt);
    if (ST.win && !saved()) list = list.filter(p => !p.posted_at || (Date.now() - Date.parse(p.posted_at)) / 864e5 <= ST.win);
    if (ST.paid) list = list.filter(p => { const e = engOf(p); return e == null || e >= 0.005; });
    if (ST.minv) list = list.filter(p => (p.views != null ? p.views : p.likes || 0) >= ST.minv);
    if (ST.mine) list = list.filter(p => { const e = engOf(p); return e != null && e >= ST.mine; });
    if (ST.q) { const q = ST.q.toLowerCase(); list = list.filter(p => [p.caption, p.handle, p.who, p.hook, p.ftag, p.sound, p.tag].some(x => String(x || '').toLowerCase().includes(q))); }
    const vol = p => p.views != null ? p.views : (p.likes || 0);
    const r = p => okRatio(p) ? p.ratio : 0;
    const by = { hot: (a, b) => r(b) - r(a) || vol(b) - vol(a), views: (a, b) => vol(b) - vol(a), new: (a, b) => Date.parse(b.posted_at || 0) - Date.parse(a.posted_at || 0), eng: (a, b) => (engOf(b) || 0) - (engOf(a) || 0), added: (a, b) => Date.parse(b.seen || 0) - Date.parse(a.seen || 0) || r(b) - r(a) };
    return [...list].sort(by[ST.sort] || by.hot);
  }
  const narrowed = () => !!(ST.src || ST.plat || ST.fmt || ST.paid || ST.q || ST.minv || ST.mine || (ST.win !== 30 && !saved()));
  function statusLine(fol) {
    const brands = fol.filter(f => f.kind === 'brand'), topics = fol.filter(f => f.kind === 'topic');
    const names = [...brands.map(f => f.name), ...topics.map(f => `"${f.name}"`)];
    const who = names.length <= 3 ? names.join(', ').replace(/, ([^,]*)$/, ' and $1') : `${names.slice(0, 2).join(', ')} and ${names.length - 2} more`;
    const last = fol.map(f => f.pulled_at ? Date.parse(f.pulled_at.replace(' ', 'T') + 'Z') : 0).filter(Boolean).sort((a, b) => b - a)[0];
    const errs = fol.filter(f => f.error).length;
    const d = ST.data || {};
    const paused = !CLI() && (d.paused || (d.credits != null && d.low != null && d.credits < d.low));
    return `<div class="soc-status"><span>Following <b>${esc(who)}</b></span>${last ? `<span>last pull ${esc(agoLong(new Date(last).toISOString()))}</span>` : '<span>first pull on its way</span>'}${ST.newN ? `<button type="button" class="nw ${ST.sort === 'added' ? 'on' : ''}" data-sort-added="1" ${U() ? U().tipAttr('Pulled in since you last opened Social. Click to sort by it.') : ''}>${ST.newN} new since your last visit</button>` : ''}${errs ? `<span>${errs} with a problem, see Manage follows</span>` : ''}${paused ? `<span class="pz">TikTok and topics paused (ScrapeCreators credits)</span>` : ''}</div>`;
  }
  function draw() {
    stopAll();
    const d = ST.data, head = H.pageHead(ST.page, 'Social');
    if (!d.on) {
      $('#main').innerHTML = `<div class="v2 soc">${head}<div class="soc-state"><b>Social is off for ${esc(brandName())}</b><p>Switch it on to follow other brands and topics and see what they post.</p>${CLI() ? '' : '<div class="acts"><button type="button" class="soc-btn pri" id="socTurn">Switch it on</button></div>'}</div></div>`;
      const b = $('#socTurn'); if (b) b.onclick = async () => { b.disabled = true; await H.apiAH('/api/social/brand', { method: 'PUT', body: JSON.stringify({ act: ST.act, on: true }) }); await loadBrands(true); rail(ST.act); render(ST.page, H, true); };
      return;
    }
    if (ST.page === 'socialresults') { drawResults(); return; }
    if (ST.view === 'manage') return drawManage();
    const posts = d.posts || [], fol = d.follows || [];
    const hot = posts.filter(p => p.breaking).length, nSaved = posts.filter(p => p.saved || p.idea_id).length;
    const list = filtered();
    const fmts = Object.keys(FMP).filter(f => posts.some(p => p.fmt === f) && (!ST.plat || posts.some(p => p.fmt === f && p.plat === ST.plat)));
    const tr = d.trends || { tags: [], sounds: [] };
    const PM = window.PillMenu;
    const srcOpts = [['', 'All followed', `${fol.length} brands and topics`], ...fol.filter(f => f.kind === 'brand').map(f => [f.id, f.name, 'Brand']), ...fol.filter(f => f.kind === 'topic').map(f => [f.id, f.name, 'Topic'])];
    const menus = fol.length && PM ? [
      PM.html('socSrc', 'Source', srcOpts, ST.src),
      PM.html('socPlat', 'Platform', [['', 'All platforms'], ...Object.entries(PL)], ST.plat, { cls: 'ph-hide' }),
      PM.html('socFmt', 'Format', [['', 'All formats'], ...fmts.map(f => [f, FMP[f]])], ST.fmt, { cls: 'ph-hide' }),
      PM.html('socSort', 'Sort', SORTS, ST.sort, { cls: 'ph-hide' }),
      saved() ? '' : PM.html('socWin', 'Posted in', WINS, ST.win, { cls: 'ph-hide' }),
    ].join('') : '';
    const seg = saved() ? '' : `<span class="soc-seg" role="tablist">
          <button type="button" role="tab" data-view="feed" class="${ST.view === 'feed' ? 'on' : ''}">All <small>${list.length === posts.length || ST.view !== 'feed' ? posts.length : `${list.length} of ${posts.length}`}</small></button>
          <button type="button" role="tab" data-view="hot" class="${ST.view === 'hot' ? 'on' : ''}">Breaking out <small>${hot}</small></button></span>`;
    const nOn = (ST.paid ? 1 : 0) + (ST.minv ? 1 : 0) + (ST.mine ? 1 : 0);
    const filt = fol.length ? `<div class="hd-period pm soc-filt ${nOn ? 'on' : ''}" id="socFilt"><button type="button" class="hd-per-btn" aria-haspopup="true" aria-expanded="false"><span class="hd-per-d">Filters${nOn ? ` · ${nOn}` : ''}</span><svg viewBox="0 0 10 6" width="10" height="6" aria-hidden="true"><path d="M1 1l4 4 4-4" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linecap="round"/></svg></button>
        <div class="hd-per-menu md-menu">
          ${PHONE() ? `<div class="fr"><div>Platform</div><select data-f="plat">${[['', 'All platforms'], ...Object.entries(PL)].map(([v, l]) => `<option value="${v}" ${ST.plat === v ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
          <div class="fr"><div>Format</div><select data-f="fmt">${[['', 'All formats'], ...fmts.map(f => [f, FMP[f]])].map(([v, l]) => `<option value="${v}" ${ST.fmt === v ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
          <div class="fr"><div>Sort</div><select data-f="sort">${SORTS.map(([v, l]) => `<option value="${v}" ${ST.sort === v ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
          ${saved() ? '' : `<div class="fr"><div>Posted in</div><select data-f="win">${WINS.map(([v, l]) => `<option value="${v}" ${ST.win === v ? 'selected' : ''}>${l}</option>`).join('')}</select></div>`}
          <div class="fr"><div>Search</div><input type="search" data-f="q" value="${esc(ST.q)}" placeholder="Captions, handles, hooks" style="height:30px;padding:0 8px;border:1px solid var(--line-strong);border-radius:8px;background:var(--surface);color:var(--ink);font:inherit;font-size:12.5px;width:150px"></div>` : ''}
          <div class="fr"><div>Hide paid-looking posts<small>Under 0.5% likes and comments per view, usually a brand deal</small></div><button type="button" class="v2sw ${ST.paid ? 'on' : ''}" data-f="paid" role="switch" aria-checked="${ST.paid}"><i></i></button></div>
          <div class="fr"><div>Minimum views</div><select data-f="minv">${MINV.map(([v, l]) => `<option value="${v}" ${ST.minv === v ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
          <div class="fr"><div>Engagement floor</div><select data-f="mine">${MINE.map(([v, l]) => `<option value="${v}" ${ST.mine === v ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
          ${narrowed() ? '<button type="button" class="fx" data-f="clear">Clear every filter</button>' : ''}
        </div></div>` : '';
    const search = fol.length ? `<span class="soc-q ${ST.qOpen || ST.q ? 'open' : ''}" id="socQw"><button type="button" class="soc-btn ico q" id="socQb" aria-label="Search">${ic('search')}</button><input type="search" id="socQ" placeholder="Captions, handles, hooks" value="${esc(ST.q)}" autocomplete="off" aria-label="Search"></span>` : '';
    const tags = saved() && (d.tags || []).length ? `<div class="soc-tags"><button type="button" data-tag="" class="${ST.tag ? '' : 'on'}">All <small>${nSaved}</small></button>${d.tags.map(t => `<button type="button" data-tag="${esc(t.name)}" class="${ST.tag === t.name ? 'on' : ''}"><i style="background:${tagColor(t.name)}"></i><span>${esc(t.name)}</span><small>${t.n}</small></button>`).join('')}</div>` : '';
    const trend = !saved() && ST.view === 'hot' && (tr.sounds.length || tr.tags.length) && fol.length ? `<div class="soc-trend"><span class="lb">Trending</span>${tr.sounds.slice(0, 4).map(s => `<button type="button" data-tag-q="${esc(s.name)}" class="${ST.q === s.name ? 'on' : ''}" ${U() ? U().tipAttr(`A sound in ${s.posts} post${s.posts === 1 ? '' : 's'} doing better than usual`) : ''}>&#9835; <span>${esc(s.name)}</span><small>${s.posts}</small></button>`).join('')}${tr.tags.slice(0, 8 - Math.min(4, tr.sounds.length)).map(s => `<button type="button" data-tag-q="${esc(s.name)}" class="${ST.q === s.name ? 'on' : ''}"><span>${esc(s.name)}</span><small>${s.posts}</small></button>`).join('')}</div>` : '';
    const empty = () => {
      const n = narrowed() || (saved() && ST.tag);
      const t = saved() ? (n ? 'Nothing saved matches' : 'Nothing saved yet') : ST.view === 'hot' ? (n ? 'Nothing breaking out matches' : 'Nothing breaking out right now') : posts.length ? 'Nothing matches' : 'No posts yet';
      const p = saved() ? 'Save a post from its viewer, or press Make ours, and it stays here.' : ST.view === 'hot' ? 'A post breaks out when it does 3x what that account usually gets, on accounts with 8 or more posts in. Check All meanwhile.' : posts.length ? `Nothing posted ${ST.win ? `in the last ${ST.win} days` : 'ever'} matches.` : 'The first pull runs when you follow. Open Manage follows to see what came back.';
      return `<div class="soc-state"><b>${t}</b><p>${p}</p>${n ? '<div class="acts"><button type="button" class="soc-btn" id="socClear2">Clear</button></div>' : ''}</div>`;
    };
    const body = !fol.length ? emptyState() : !list.length ? empty() : `<div class="soc-grid">${list.slice(0, 240).map(card).join('')}</div>`;
    $('#main').innerHTML = `<div class="v2 soc">${head}
      <div class="soc-ctl">${seg}${menus}${search}${filt}<span class="sp"></span>
        ${CLI() ? '' : `<button type="button" class="soc-btn ico q" id="socManage" aria-label="Manage follows" ${U() ? U().tipAttr('Manage follows') : ''}>${ic('settings')}</button><button type="button" class="soc-btn pri" id="socAdd">${ic('plus')} Follow</button>`}</div>
      ${fol.length && !saved() ? statusLine(fol) : ''}${tags}${trend}${body}</div>`;
    wire(list);
  }
  function emptyState() {
    return `<div class="soc-state"><b>Follow the brands and topics you want to watch</b><p>Type a brand's handle (like @takomogolf) and Locus finds it on Instagram, TikTok and YouTube, then pulls every new post once a day. Instagram and YouTube cost nothing; TikTok and topic searches use ScrapeCreators credits. Or follow a topic (like "golf short game").</p><div class="acts"><button type="button" class="soc-btn pri" id="socAdd2">${ic('plus')} Follow</button></div></div>`;
  }
  function ratioPill(p, tip = true) {
    if (!okRatio(p) || p.ratio < 1.5) return '';
    const cls = p.ratio >= 10 ? 'hi' : p.ratio >= 3 ? '' : 'lo';
    const t = p.base_kind === 'followers' ? `${k(p.views)} views on an account with ${k(p.base)} followers` : `This one ${k(p[p.metric])} ${p.metric}, this account usually ${k(p.base)} across its last ${p.n || 'few'} posts`;
    return `<span class="soc-x ${cls}" ${tip && U() ? U().tipAttr(t) : ''}>${p.ratio >= 10 ? Math.round(p.ratio) : p.ratio.toFixed(1)}x</span>`;
  }
  function usualText(p) { return p.base == null ? '' : p.base_kind === 'followers' ? `${k(p.base)} followers` : `usually ${k(p.base)}`; }
  function metricRow(p) {
    const big = p.views != null ? `<b>${k(p.views)}</b> views` : p.likes != null ? `<b>${k(p.likes)}</b> likes` : '';
    const eng = engOf(p), us = usualText(p);
    return `<span class="soc-mr"><span>${big}</span>${us ? `<span>${esc(us)}</span>` : ''}${eng != null ? `<span ${U() ? U().tipAttr('Likes and comments per view') : ''}>${(eng * 100).toFixed(1)}%</span>` : ''}</span>`;
  }
  function card(p) {
    const isV = VIDEO.has(p.fmt), isM = MULTI.has(p.fmt);
    const f = (ST.data.follows || []).find(x => x.id === p.follow_id);
    const topic = f && f.kind === 'topic' ? f.name : '';
    return `<article class="soc-post" data-id="${esc(p.id)}" tabindex="0" role="button" aria-label="${esc(`${FM[p.fmt] || 'Post'} from ${p.who || p.handle}`)}">
      <div class="soc-med ${isV ? 'vid' : ''}" data-med="${esc(p.id)}">${p.thumb ? `<img src="${esc(p.thumb)}" alt="" loading="lazy">` : ''}
        <span class="soc-pf" ${U() ? U().tipAttr(`${PL[p.plat] || ''} ${FM[p.fmt] || ''}${isM && p.slides ? `, ${p.slides} slides` : ''}`.trim()) : ''}>${PLK[p.plat] || ''}${isM && p.slides ? ` · ${p.slides}` : ''}</span>
        ${p.saved ? `<span class="sv" ${U() ? U().tipAttr(p.tag ? `Saved: ${p.tag}` : 'Saved') : ''}>${ic('bookmark')}</span>` : ''}
        ${isV ? `<span class="spin"></span>${p.dur ? `<span class="dur">${dur(p.dur)}</span>` : ''}` : ''}${isM && p.slides > 1 ? `<span class="dur">1 of ${p.slides}</span>` : ''}
        ${ratioPill(p)}</div>
      <div class="soc-body"><span class="soc-who"><b>${esc(p.handle ? `@${p.handle}` : p.who)}</b><small>${esc(ago(p.posted_at))}</small>${topic ? `<span class="tp">${esc(topic)}</span>` : ''}</span>
        <span class="soc-cap">${esc((p.caption || '').replace(/\s+/g, ' '))}</span>
        ${metricRow(p)}
        ${p.idea_id ? `<span class="soc-made">${ic('sparkles')} Our version started</span>` : saved() && p.tag ? `<span class="soc-tg"><i class="soc-tagdot" style="background:${tagColor(p.tag)}"></i>${esc(p.tag)}</span>` : ''}
        ${saved() && p.note ? `<span class="soc-note" ${U() ? U().tipAttr(esc(p.note)) : ''}>${esc(p.note)}</span>` : ''}</div></article>`;
  }
  function wire(list) {
    const m = $('#main'), PM = window.PillMenu;
    m.querySelectorAll('[data-view]').forEach(b => b.onclick = () => { ST.view = b.dataset.view; store('soc_view2', ST.view); draw(); });
    m.querySelectorAll('[data-tag-q]').forEach(b => b.onclick = () => { ST.q = ST.q === b.dataset.tagQ ? '' : b.dataset.tagQ; draw(); });
    m.querySelectorAll('[data-tag]').forEach(b => b.onclick = () => { ST.tag = b.dataset.tag; draw(); });
    m.querySelectorAll('[data-sort-added]').forEach(b => b.onclick = () => { ST.sort = ST.sort === 'added' ? 'hot' : 'added'; store('soc_sort', ST.sort); draw(); });
    if (PM) {
      PM.wire(m.querySelector('#socSrc'), v => { ST.src = v; draw(); });
      PM.wire(m.querySelector('#socPlat'), v => { ST.plat = v; if (ST.fmt && !(ST.data.posts || []).some(p => p.fmt === ST.fmt && (!v || p.plat === v))) ST.fmt = ''; draw(); });
      PM.wire(m.querySelector('#socFmt'), v => { ST.fmt = v; draw(); });
      PM.wire(m.querySelector('#socSort'), v => { ST.sort = v; store('soc_sort', v); draw(); });
      PM.wire(m.querySelector('#socWin'), v => { ST.win = Number(v) || 0; store('soc_win2', String(ST.win)); draw(); });
    }
    const filt = m.querySelector('#socFilt');
    if (filt) {
      const b = filt.querySelector('.hd-per-btn');
      b.onclick = e => { e.stopPropagation(); if (window.closePops) window.closePops(filt); const o = !filt.classList.contains('open'); filt.classList.toggle('open', o); b.setAttribute('aria-expanded', String(o)); };
      filt.querySelector('.hd-per-menu').onclick = e => e.stopPropagation();
      const sel = (k2, fn) => { const e = filt.querySelector(`select[data-f="${k2}"]`); if (e) e.onchange = () => fn(e.value); };
      sel('minv', v => { ST.minv = Number(v) || 0; store('soc_minv', String(ST.minv)); draw(); });
      sel('mine', v => { ST.mine = Number(v) || 0; store('soc_mine', String(ST.mine)); draw(); });
      sel('plat', v => { ST.plat = v; draw(); }); sel('fmt', v => { ST.fmt = v; draw(); }); sel('sort', v => { ST.sort = v; store('soc_sort', v); draw(); }); sel('win', v => { ST.win = Number(v) || 0; store('soc_win2', String(ST.win)); draw(); });
      const pq = filt.querySelector('input[data-f="q"]'); if (pq) { let t; pq.oninput = () => { clearTimeout(t); t = setTimeout(() => { ST.q = pq.value.trim(); draw(); const n = $('#socFilt'); if (n) { n.classList.add('open'); const i = n.querySelector('input[data-f="q"]'); if (i) { i.focus(); i.setSelectionRange(i.value.length, i.value.length); } } }, 300); }; }
      const paid = filt.querySelector('[data-f="paid"]'); if (paid) paid.onclick = () => { ST.paid = !ST.paid; store('soc_paid', ST.paid ? '1' : '0'); draw(); const n = $('#socFilt'); if (n) n.classList.add('open'); };
      const cl = filt.querySelector('[data-f="clear"]'); if (cl) cl.onclick = clear;
    }
    const qw = m.querySelector('#socQw'), qb = m.querySelector('#socQb'), q = m.querySelector('#socQ');
    if (qb) qb.onclick = () => { ST.qOpen = !qw.classList.contains('open'); qw.classList.toggle('open', ST.qOpen); if (ST.qOpen) q.focus(); else if (ST.q) { ST.q = ''; draw(); } };
    if (q) { let t; q.oninput = () => { clearTimeout(t); t = setTimeout(() => { ST.q = q.value.trim(); ST.qOpen = true; draw(); const n = $('#socQ'); if (n) { n.focus(); n.setSelectionRange(n.value.length, n.value.length); } }, 240); }; q.onkeydown = e => { if (e.key === 'Escape') { ST.q = ''; ST.qOpen = false; draw(); } }; }
    const c2 = m.querySelector('#socClear2'); if (c2) c2.onclick = clear;
    [m.querySelector('#socAdd'), m.querySelector('#socAdd2')].forEach(b => b && (b.onclick = () => followModal(ST.act, reload)));
    const mg = m.querySelector('#socManage'); if (mg) mg.onclick = () => { ST.view = 'manage'; draw(); };
    const find = id => list.find(p => p.id === id) || ST.data.posts.find(p => p.id === id);
    m.querySelectorAll('.soc-post').forEach(el => {
      const p = find(el.dataset.id);
      const med = el.querySelector('.soc-med');
      el.onclick = () => openPost(p, list);
      el.onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openPost(p, list); } };
      if (med && med.classList.contains('vid') && HOVER()) {
        let t; el.onmouseenter = () => { t = setTimeout(() => playIn(med, p), 350); };
        el.onmouseleave = () => { clearTimeout(t); stopIn(med); };
      }
    });
  }
  function clear() { ST.q = ''; ST.qOpen = false; ST.win = 30; ST.paid = false; ST.src = ''; ST.plat = ''; ST.fmt = ''; ST.minv = 0; ST.mine = 0; ST.tag = ''; store('soc_win2', '30'); store('soc_paid', '0'); store('soc_minv', '0'); store('soc_mine', '0'); draw(); }

  /* ---------- inline video: a copy we keep (TikTok, Instagram) or YouTube's player, sound off, one toggle ---------- */
  const playing = new Set();
  async function videoOf(p) {
    if (VID[p.id]) return VID[p.id];
    try { const r = await H.apiAH('/api/social/video', { method: 'POST', body: JSON.stringify({ id: p.id }) }); VID[p.id] = r.src || r.embed ? r : { error: r.error || 'No video in that post.' }; }
    catch (e) { VID[p.id] = { error: e.message }; }
    return VID[p.id];
  }
  const ytSrc = (embed, muted) => `${embed}${embed.includes('?') ? '&' : '?'}autoplay=1&mute=${muted ? 1 : 0}&controls=0&loop=1&playsinline=1&rel=0&modestbranding=1&enablejsapi=1&playlist=${encodeURIComponent((/embed\/([^?]+)/.exec(embed) || [])[1] || '')}`;
  async function playIn(med, p) {
    if (med.classList.contains('playing') || med.classList.contains('loading')) return;
    med.classList.add('loading');
    const v = await videoOf(p);
    med.classList.remove('loading');
    if (!med.isConnected || v.error) return;
    if (med.classList.contains('playing')) return;
    playing.forEach(x => { if (x !== med) stopIn(x); });
    const old = med.querySelector('video,iframe'); if (old) old.remove();
    const img = med.querySelector('img');
    if (v.src) { med.insertAdjacentHTML('afterbegin', `<video src="${esc(v.src)}" muted autoplay loop playsinline preload="metadata" ${p.thumb ? `poster="${esc(p.thumb)}"` : ''}></video>`); const vid = med.querySelector('video'); vid.play().catch(() => {}); }
    else med.insertAdjacentHTML('afterbegin', `<iframe src="${esc(ytSrc(v.embed, true))}" allow="autoplay; encrypted-media" title="Video"></iframe>`);
    if (img) img.style.visibility = 'hidden';
    med.classList.add('playing'); med.dataset.muted = '1'; playing.add(med);
  }
  function stopIn(med) {
    const el = med.querySelector('video,iframe'); if (el) el.remove();
    const img = med.querySelector('img'); if (img) img.style.visibility = '';
    med.classList.remove('playing', 'loading'); playing.delete(med);
  }
  function stopAll() { playing.forEach(stopIn); }
  /* The viewer's sound (2026-10-21): one plain speaker that mutes or unmutes, remembered in localStorage. The grid's hover
     preview stays muted (browsers refuse sound before a click); the click that opens the viewer is the gesture. */
  const SPK = on => on
    ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M11 5 6 9H2v6h4l5 4z"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/><path d="M19 5a9 9 0 0 1 0 14"/></svg>'
    : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M11 5 6 9H2v6h4l5 4z"/><path d="m22 9-6 6"/><path d="m16 9 6 6"/></svg>';
  const soundOn = () => store('soc_sound') !== '0';
  function setSound(med, on) {
    const vid = med.querySelector('video'), fr = med.querySelector('iframe');
    if (vid) vid.muted = !on;
    if (fr && fr.contentWindow) fr.contentWindow.postMessage(JSON.stringify({ event: 'command', func: on ? 'unMute' : 'mute', args: '' }), '*');
    med.dataset.muted = on ? '0' : '1'; store('soc_sound', on ? '1' : '0');
    const b = med.querySelector('.snd'); if (b) { b.innerHTML = SPK(on); b.setAttribute('aria-label', on ? 'Mute' : 'Sound on'); }
    const n = med.querySelector('button.note'); if (n && on) n.remove();
  }
  function toggleSound(med) { setSound(med, med.dataset.muted !== '0'); }

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
  function followModal(act, after) {
    let kind = 'brand';
    const { w, done } = modal(`<div class="fl"><h3>Follow</h3>
      <span class="soc-seg" style="justify-self:start"><button type="button" data-k="brand" class="on">A brand</button><button type="button" data-k="topic">A topic</button></span>
      <label class="f"><span id="smL">The brand's handle</span><input type="text" id="smT" maxlength="80" placeholder="@takomogolf" autocomplete="off"></label>
      <p class="hint" id="smH">Locus looks for the same handle on Instagram, TikTok and YouTube. A different handle somewhere? Add it below. Instagram needs a business or creator account.</p>
      <details id="smD"><summary style="cursor:pointer;font-size:12.5px;color:var(--muted)">Different handle on a platform</summary><div class="three" style="margin-top:8px">
        <label class="f">Instagram<input type="text" id="smIg" placeholder="@" autocomplete="off"></label><label class="f">TikTok<input type="text" id="smTt" placeholder="@" autocomplete="off"></label><label class="f">YouTube<input type="text" id="smYt" placeholder="@" autocomplete="off"></label></div></details>
      <div class="err" id="smE"></div>
      <div class="foot"><button type="button" class="soc-btn" data-x="1">Cancel</button><button type="button" class="soc-btn pri" id="smS">Follow</button></div></div>`);
    const set = v => { kind = v; w.querySelectorAll('[data-k]').forEach(b => b.classList.toggle('on', b.dataset.k === v)); w.querySelector('#smL').textContent = v === 'topic' ? 'The topic' : 'The brand’s handle'; w.querySelector('#smT').placeholder = v === 'topic' ? 'golf short game' : '@takomogolf'; w.querySelector('#smH').textContent = v === 'topic' ? `Searches TikTok, Instagram Reels and YouTube for this week’s posts on it, and flags the ones doing far better than the account’s size. Uses ScrapeCreators credits${ST.data && ST.data.paused ? ' (paused right now: out of credits)' : ''}.` : 'Locus looks for the same handle on Instagram, TikTok and YouTube. A different handle somewhere? Add it below. Instagram needs a business or creator account.'; w.querySelector('#smD').hidden = v === 'topic'; };
    w.querySelectorAll('[data-k]').forEach(b => b.onclick = () => set(b.dataset.k));
    const inp = w.querySelector('#smT'); inp.focus();
    const go = async () => {
      const btn = w.querySelector('#smS'), err = w.querySelector('#smE');
      btn.disabled = true; btn.textContent = kind === 'topic' ? 'Searching…' : 'Looking it up…'; err.textContent = '';
      try {
        const r = await H.apiAH('/api/social/follow', { method: 'POST', body: JSON.stringify({ act, kind, text: inp.value, ig: w.querySelector('#smIg').value || undefined, tt: w.querySelector('#smTt').value || undefined, yt: w.querySelector('#smYt').value || undefined }) });
        const f = r.follow || {}, pl = r.pulled || {};
        const where = kind === 'topic' ? '' : ['ig', 'tt', 'yt'].filter(x => f[x]).map(x => PL[x]).join(', ');
        done(); toast(`${kind === 'topic' ? `Following "${f.name}"` : `Following ${f.name}${where ? ` on ${where}` : ''}`}: ${pl.posts || 0} posts in.${pl.error ? ` ${pl.error}` : ''}`);
        if (after) after();
      } catch (e) { err.textContent = e.message; btn.disabled = false; btn.textContent = 'Follow'; }
    };
    w.querySelector('#smS').onclick = go;
    inp.onkeydown = e => { if (e.key === 'Enter') go(); };
  }
  function toast(t) {
    const el = document.createElement('div'); el.className = 'lx-toast soc-toast';
    el.style.cssText = 'position:fixed;left:50%;bottom:calc(24px + env(safe-area-inset-bottom,0px));transform:translateX(-50%);background:var(--ink);color:var(--surface);padding:10px 14px;border-radius:9px;font-size:13px;z-index:9999;max-width:min(560px,92vw);box-shadow:0 8px 24px -10px rgba(0,0,0,.6)';
    el.textContent = t; document.body.appendChild(el); setTimeout(() => el.remove(), 5200);
  }

  /* ---------- follows: the table (Manage follows, and Brand settings > Social) ---------- */
  function followTable(fol, o = {}) {
    if (!fol.length) return o.compact ? '<p class="v2hint">Following nothing yet.</p>' : emptyState();
    const row = f => {
      const st = f.error ? `<span class="soc-st bad"><i></i>${esc(f.error)}</span>` : !f.pulled_at ? '<span class="soc-st wait"><i></i>Not pulled yet</span>' : `<span class="soc-st"><i></i>Pulled ${esc(agoLong(f.pulled_at.replace(' ', 'T') + 'Z'))}</span>`;
      const usual = f.usual ? `${k(f.usual)} ${f.usual_kind || 'views'}` : '';
      return `<tr data-fid="${esc(f.id)}"><td><b>${esc(f.name)}</b><span class="sub">${f.kind === 'topic' ? 'TikTok, Instagram Reels and YouTube search' : ['ig', 'tt', 'yt'].filter(x => f[x]).map(x => `${PL[x]} @${esc(f[x])}`).join(' · ') || 'No handles'}</span></td>
        <td><span class="soc-kind">${f.kind === 'topic' ? 'Topic' : 'Brand'}</span></td><td class="num">${f.posts}${o.compact ? '' : `<span class="sub">${f.posts30 != null ? `${f.posts30} in 30 days` : ''}${f.per_week ? `, ${f.per_week} a week` : ''}</span>`}</td>${o.compact ? '' : `<td class="num">${usual ? `${usual}${f.best && f.best.ratio >= 1.5 ? `<span class="sub">best ${f.best.ratio >= 10 ? Math.round(f.best.ratio) : f.best.ratio}x usual</span>` : ''}` : '<span class="sub">not enough yet</span>'}</td><td class="num">${f.last_at ? esc(agoLong(f.last_at)) : ''}</td>`}<td>${st}</td>
        <td class="r">${CLI() ? '' : `<span class="acts">${f.kind === 'brand' ? `<button type="button" class="soc-btn sm" data-ed="1">Handles</button>` : ''}<button type="button" class="soc-btn sm q bad" data-rm="1">Stop</button></span>`}</td></tr>`;
    };
    return `<div class="soc soc-tbl"><table><thead><tr><th>Following</th><th>Kind</th><th>Posts</th>${o.compact ? '' : '<th>Usually</th><th>Last post</th>'}<th>Last pull</th><th></th></tr></thead><tbody>${fol.map(row).join('')}</tbody></table></div>`;
  }
  function wireFollowTable(root, fol, act, after) {
    root.querySelectorAll('[data-fid]').forEach(el => {
      const f = fol.find(x => x.id === el.dataset.fid);
      const rm = el.querySelector('[data-rm]');
      if (rm) rm.onclick = async () => {
        if (!(await H.confirmModal(`Stop following ${f.name}?`, 'Its posts leave the feed. Saved posts and posts you made into ours stay.', 'Stop following'))) return;
        try { await H.apiAH(`/api/social/follow?id=${encodeURIComponent(f.id)}`, { method: 'DELETE' }); after(); } catch (e) { toast(e.message); }
      };
      const ed = el.querySelector('[data-ed]');
      if (ed) ed.onclick = () => {
        const { w, done } = modal(`<div class="fl"><h3>${esc(f.name)}</h3><p class="hint">Leave a box empty to skip that platform.</p>
          <label class="f">Name<input type="text" id="seN" value="${esc(f.name)}"></label>
          <div class="three"><label class="f">Instagram<input type="text" id="seIg" value="${esc(f.ig || '')}"></label><label class="f">TikTok<input type="text" id="seTt" value="${esc(f.tt || '')}"></label><label class="f">YouTube<input type="text" id="seYt" value="${esc(f.yt || '')}"></label></div>
          <div class="err" id="seE"></div><div class="foot"><button type="button" class="soc-btn" data-x="1">Cancel</button><button type="button" class="soc-btn pri" id="seS">Save and pull</button></div></div>`);
        w.querySelector('#seS').onclick = async () => {
          const b = w.querySelector('#seS'); b.disabled = true; b.textContent = 'Pulling…';
          try { const r = await H.apiAH('/api/social/follow', { method: 'PUT', body: JSON.stringify({ id: f.id, name: w.querySelector('#seN').value, ig: w.querySelector('#seIg').value, tt: w.querySelector('#seTt').value, yt: w.querySelector('#seYt').value }) }); done(); toast(`${r.pulled.posts || 0} posts in.${r.pulled.error ? ` ${r.pulled.error}` : ''}`); after(); }
          catch (e) { w.querySelector('#seE').textContent = e.message; b.disabled = false; b.textContent = 'Save and pull'; }
        };
      };
    });
  }
  function drawManage() {
    const head = H.pageHead('social', 'Social');
    const fol = ST.data.follows || [];
    $('#main').innerHTML = `<div class="v2 soc">${head}
      <div class="soc-ctl"><button type="button" class="soc-btn q" id="socBack">&#8249; Back to the feed</button><span class="sp"></span>${CLI() ? '' : '<button type="button" class="soc-btn" id="sfPull">Pull everything now</button>'}<button type="button" class="soc-btn pri" id="sfAdd">${ic('plus')} Follow</button></div>
      <div class="soc-manage-top"><p>${brandName()} follows ${fol.length} ${fol.length === 1 ? 'account or topic' : 'accounts and topics'}. Each one is pulled once a day. Instagram and YouTube cost nothing; TikTok and topic searches use ScrapeCreators credits. Up to 40.</p></div>
      ${suggestHtml(ST.data.suggest || [])}
      ${followTable(fol)}
      ${CLI() ? '' : sourcesLine(ST.data)}</div>`;
    const m = $('#main');
    m.querySelector('#socBack').onclick = () => { ST.view = store('soc_view2') === 'hot' ? 'hot' : 'feed'; draw(); };
    [m.querySelector('#sfAdd'), m.querySelector('#socAdd2')].forEach(b => b && (b.onclick = () => followModal(ST.act, reload)));
    const pull = m.querySelector('#sfPull');
    if (pull) pull.onclick = async () => { pull.disabled = true; pull.textContent = 'Pulling…'; try { const r = await H.apiAH('/api/social/pull', { method: 'POST', body: JSON.stringify({ act: ST.act }) }); toast(`Pulled ${r.pulled.length}: ${r.pulled.reduce((s, x) => s + (x.added || 0), 0)} new posts.`); await reload(); } catch (e) { pull.textContent = e.message; } };
    wireFollowTable(m, fol, ST.act, reload);
    m.querySelectorAll('[data-sug]').forEach(b => b.onclick = () => followHandle(b.dataset.sug, b.dataset.plat, b));
  }
  /* "Seen in your topics": accounts behind topic posts this brand does not follow yet (server side suggestFrom). */
  function suggestHtml(sug) {
    if (!sug.length || CLI()) return '';
    return `<div class="soc-sug"><h4>Seen in your topics</h4><p>Accounts whose posts came up in your topic searches. Follow one to pull everything it posts.</p>
      ${sug.slice(0, 8).map(s => `<div class="row"><b>@${esc(s.handle)}</b><small>${esc([s.plats.map(x => PL[x]).join(', '), `${s.posts} post${s.posts === 1 ? '' : 's'} in your topics`, s.followers ? `${k(s.followers)} followers` : '', s.best >= 1.5 ? `best ${s.best >= 10 ? Math.round(s.best) : s.best}x` : ''].filter(Boolean).join(' · '))}</small><button type="button" class="soc-btn sm" data-sug="${esc(s.handle)}" data-plat="${esc(s.plats[0])}">Follow</button></div>`).join('')}</div>`;
  }
  /* Follow an account straight from a post or a suggestion: the handle on the platform we saw it on, looked up on the others. */
  async function followHandle(handle, plat, btn) {
    if (btn) { btn.disabled = true; btn.textContent = 'Following…'; }
    try {
      const body = { act: ST.act, kind: 'brand', text: handle };
      if (plat) body[plat] = handle;
      const r = await H.apiAH('/api/social/follow', { method: 'POST', body: JSON.stringify(body) });
      const f = r.follow || {}, pl = r.pulled || {};
      toast(`Following ${f.name || handle}: ${pl.posts || 0} posts in.${pl.error ? ` ${pl.error}` : ''}`);
      await reload();
      if (V) { const p = ST.data.posts.find(x => x.id === V.p.id); if (p) openPost(p, filtered()); }
    } catch (e) { toast(e.message); if (btn) { btn.disabled = false; btn.textContent = 'Follow'; } }
  }

  /* ---------- THE VIEWER: dark, full height, the media in the middle, a column, a pinned bar, prev and next ---------- */
  const DEST = { creator_link: 'Creator link', asana_brief: 'Brief', studio: 'Studio' };
  let poll = null, V = null;   // V = { list, i, p, el }
  function viewerEl() {
    let el = document.getElementById('socView');
    if (el) return el;
    document.body.insertAdjacentHTML('beforeend', `<div id="socView" class="soc-view" role="dialog" aria-label="Post" hidden>
      <div class="vstage"><button type="button" class="vx" aria-label="Close">&#215;</button><span class="vcount"></span><button type="button" class="vprev" aria-label="Previous">&#8249;</button><button type="button" class="vnext" aria-label="Next">&#8250;</button><div class="vmed"></div></div>
      <aside class="vcol"><div class="vbody"></div><div class="vbar"></div></aside></div>`);
    el = document.getElementById('socView');
    el.querySelector('.vx').onclick = closePost;
    el.querySelector('.vprev').onclick = () => step(-1);
    el.querySelector('.vnext').onclick = () => step(1);
    el.addEventListener('click', e => { if (e.target === el.querySelector('.vstage')) closePost(); });
    document.addEventListener('keydown', e => {
      if (!V) return;
      if (e.key === 'Escape') { e.stopPropagation(); closePost(); }
      else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { const d = e.key === 'ArrowLeft' ? -1 : 1; if (!(V.slide && V.slide(d))) step(d); }
      else if (!e.ctrlKey && !e.metaKey && !e.altKey && !/^(INPUT|TEXTAREA|SELECT)$/.test((e.target && e.target.tagName) || '') && !(e.target && e.target.isContentEditable)) {
        /* One-key shortcuts (2026-10-20, Sandcastles' S / M keys): S save, M make ours, C copy the link, T transcript. */
        const p = V.p, kk = e.key.toLowerCase();
        if (kk === 's') { e.preventDefault(); saveToggle(p, p.saved ? null : p.tag, !p.saved); }
        else if (kk === 'm' && !CLI()) { e.preventDefault(); makeStep(p); }
        else if (kk === 'c') { e.preventDefault(); copyText(p.url, 'Link copied.'); }
        else if (kk === 't' && p.transcript == null && !['photo', 'carousel', 'post', 'photos'].includes(p.fmt)) { e.preventDefault(); transcript(p); }
      }
    }, true);
    let x0 = null;
    el.addEventListener('touchstart', e => { x0 = e.touches[0].clientX; }, { passive: true });
    el.addEventListener('touchend', e => { if (x0 == null) return; const dx = e.changedTouches[0].clientX - x0; x0 = null; if (Math.abs(dx) > 70 && !e.target.closest('.vslides')) step(dx < 0 ? 1 : -1); }, { passive: true });
    return el;
  }
  function step(n) { if (!V) return; const j = V.i + n; if (j < 0 || j >= V.list.length) return; openPost(V.list[j], V.list); }
  function closePost() {
    if (!V) return; clearTimeout(poll);
    const el = viewerEl(); el.classList.remove('on'); el.querySelector('.vmed').innerHTML = '';
    setTimeout(() => { if (!V) el.hidden = true; }, 160);
    document.body.classList.remove('soc-view-on'); V = null;
  }
  async function openPost(p, list) {
    if (!p) return;
    clearTimeout(poll); stopAll();
    const el = viewerEl();
    list = list || (ST.data ? filtered() : [p]);
    V = { list, i: Math.max(0, list.findIndex(x => x.id === p.id)), p, el };
    el.hidden = false; document.body.classList.add('soc-view-on');
    requestAnimationFrame(() => el.classList.add('on'));
    el.querySelector('.vprev').disabled = V.i <= 0; el.querySelector('.vnext').disabled = V.i >= list.length - 1;
    el.querySelector('.vcount').textContent = list.length > 1 ? `${V.i + 1} of ${list.length}` : '';
    media(p); column(p); bar(p);
  }
  function media(p) {
    const el = viewerEl(), m = el.querySelector('.vmed');
    const isV = VIDEO.has(p.fmt), isM = MULTI.has(p.fmt);
    m.innerHTML = p.thumb ? `<img src="${esc(p.thumb)}" alt="">` : '';
    if (isV) videoOf(p).then(v => {
      if (!V || V.p !== p) return;
      if (v.error) { m.insertAdjacentHTML('beforeend', `<span class="note">${esc(v.error)}</span>`); return; }
      const img = m.querySelector('img'); if (img) img.remove();
      const on = soundOn();
      m.insertAdjacentHTML('beforeend', `<button type="button" class="snd" aria-label="${on ? 'Mute' : 'Sound on'}">${SPK(on)}</button>`);
      m.querySelector('.snd').onclick = () => toggleSound(m);
      if (v.src) {
        /* The click that opened the viewer is the gesture: play with sound at once. A browser that still refuses gets a
           muted start and a visible "Tap for sound" button (one tap unmutes). The native control bar scrubs. */
        m.insertAdjacentHTML('afterbegin', `<video src="${esc(v.src)}" ${on ? '' : 'muted'} autoplay loop playsinline controls ${p.thumb ? `poster="${esc(p.thumb)}"` : ''}></video>`);
        const vid = m.querySelector('video'); m.dataset.muted = on ? '0' : '1';
        vid.onvolumechange = () => { if (!V || V.p !== p) return; const now = !vid.muted; if ((m.dataset.muted === '0') !== now) { m.dataset.muted = now ? '0' : '1'; store('soc_sound', now ? '1' : '0'); const b = m.querySelector('.snd'); if (b) b.innerHTML = SPK(now); } };
        const tap = () => { vid.muted = true; m.dataset.muted = '1'; const b = m.querySelector('.snd'); if (b) b.innerHTML = SPK(false); vid.play().catch(() => {}); if (!m.querySelector('button.note')) { m.insertAdjacentHTML('beforeend', `<button type="button" class="note">${SPK(true)} Tap for sound</button>`); m.querySelector('button.note').onclick = e => { e.stopPropagation(); setSound(m, true); vid.play().catch(() => {}); }; } };
        const pr = vid.play(); if (pr && pr.catch) pr.catch(() => { if (on && V && V.p === p) tap(); });
      } else {
        m.insertAdjacentHTML('afterbegin', `<iframe src="${esc(ytSrc(v.embed, !on))}" allow="autoplay; encrypted-media; picture-in-picture" allowfullscreen title="Video"></iframe>`);
        m.dataset.muted = on ? '0' : '1';
      }
    });
    V.slide = null;
    if (isM) {
      if (p.slides > 1) m.insertAdjacentHTML('beforeend', `<span class="vcnt">1 of ${p.slides}</span>`);
      slidesOf(p).then(s => {
        if (!V || V.p !== p || !s.length) return;
        /* Every slide (2026-10-21): a swipeable strip, dots, left and right arrows, and "2 of 6" in the corner. */
        const n = s.length;
        m.innerHTML = `<div class="vslides">${s.map((u, i) => `<img src="${esc(u)}" alt="Slide ${i + 1}" ${i ? 'loading="lazy"' : ''}>`).join('')}</div>
          ${n > 1 ? `<div class="vdots">${s.map((_, i) => `<i class="${i ? '' : 'on'}"></i>`).join('')}</div><span class="vcnt">1 of ${n}</span><button type="button" class="vsl l" aria-label="Previous slide" disabled>&#8249;</button><button type="button" class="vsl r" aria-label="Next slide">&#8250;</button>` : ''}`;
        if (n < 2) return;
        const sl = m.querySelector('.vslides'), dots = [...m.querySelectorAll('.vdots i')], cnt = m.querySelector('.vcnt'), L = m.querySelector('.vsl.l'), R = m.querySelector('.vsl.r');
        const at = () => Math.round(sl.scrollLeft / Math.max(1, sl.clientWidth));
        const go = i => { i = Math.max(0, Math.min(n - 1, i)); sl.scrollTo({ left: i * sl.clientWidth, behavior: 'smooth' }); };
        const sync = () => { const i = at(); dots.forEach((d, j) => d.classList.toggle('on', j === i)); cnt.textContent = `${i + 1} of ${n}`; L.disabled = i <= 0; R.disabled = i >= n - 1; };
        sl.onscroll = sync;
        L.onclick = e => { e.stopPropagation(); go(at() - 1); }; R.onclick = e => { e.stopPropagation(); go(at() + 1); };
        V.slide = d => { const i = at(); if ((d < 0 && i <= 0) || (d > 0 && i >= n - 1)) return false; go(i + d); return true; };
      });
    }
  }
  async function slidesOf(p) {
    if (SLIDES[p.id]) return SLIDES[p.id];
    try { const r = await H.apiAH('/api/social/slides', { method: 'POST', body: JSON.stringify({ id: p.id }) }); SLIDES[p.id] = r.slides || []; }
    catch { SLIDES[p.id] = []; }
    return SLIDES[p.id];
  }
  function column(p) {
    const el = viewerEl(), b = el.querySelector('.vbody');
    const f = (ST.data && ST.data.follows || []).find(x => x.id === p.follow_id);
    const eng = engOf(p), us = usualText(p);
    const big = p.views != null ? [k(p.views), 'views'] : p.likes != null ? [k(p.likes), 'likes'] : ['', ''];
    const small = [[p.likes, 'likes'], [p.comments, 'comments'], [p.shares ?? p.saves, p.shares != null ? 'shares' : 'saves']].filter(x => x[0] != null && !(x[1] === big[1]));
    const posted = p.posted_at ? new Date(p.posted_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '';
    const followed = p.handle && (ST.data && ST.data.follows || []).some(x => x.kind === 'brand' && [x.ig, x.tt, x.yt].some(h => h && h.toLowerCase() === p.handle.toLowerCase()));
    const canFollow = !CLI() && p.handle && !followed && (!f || f.kind === 'topic');
    b.innerHTML = `<div class="vwho"><span class="vav">${esc((p.handle || p.who || '?').slice(0, 2).toUpperCase())}</span><div style="min-width:0"><b>${esc(p.handle ? `@${p.handle}` : p.who)}</b><small>${esc([p.who && p.who !== p.handle ? p.who : '', f && f.kind === 'topic' ? `topic: ${f.name}` : '', p.followers ? `${k(p.followers)} followers` : ''].filter(Boolean).join(' · '))}</small></div>${canFollow ? `<button type="button" class="soc-btn sm" id="svFollow" style="margin-left:auto;flex:none" ${U() ? U().tipAttr(`Follow @${esc(p.handle)}: every post it makes, once a day`) : ''}>Follow</button>` : ''}</div>
      <div class="vline">${esc([PL[p.plat], (FM[p.fmt] || 'Post') === PL[p.plat] ? '' : FM[p.fmt] || 'Post', posted, p.dur ? dur(p.dur) : '', p.slides ? `${p.slides} slides` : ''].filter(Boolean).join(' · '))}<button type="button" class="vcopy" id="svCopyLink">Copy link</button></div>
      <div class="vbig"><b>${big[0]}</b><span>${big[1]}</span>${ratioPill(p, true)}${us ? `<span>${esc(us)}</span>` : ''}</div>
      ${small.length || eng != null ? `<div class="vsmall">${small.map(([n, l]) => `<span><b>${k(n)}</b> ${l}</span>`).join('')}${eng != null ? `<span ${U() ? U().tipAttr('Likes and comments per view') : ''}><b>${(eng * 100).toFixed(1)}%</b> engagement</span>` : ''}</div>` : ''}
      ${p.base == null ? '<div class="vline">Not enough posts from this account yet to say what is usual.</div>' : ''}
      ${p.caption ? `<div class="vcap-h vline">Caption<button type="button" class="vcopy" id="svCopyCap">Copy</button></div><div class="vcap">${esc(p.caption)}</div>` : ''}
      ${p.hook || p.ftag || p.tag ? `<div class="vtags">${p.hook ? `<span>Hook: ${esc(p.hook)}</span>` : ''}${p.ftag ? `<span>${esc(p.ftag)}</span>` : ''}${p.tag ? `<span><i class="soc-tagdot" style="background:${tagColor(p.tag)};margin-right:5px"></i>${esc(p.tag)}</span>` : ''}</div>` : ''}
      ${p.sound ? `<div class="vline">&#9835; ${esc(p.sound)}</div>` : ''}
      ${transcriptHtml(p)}
      ${p.saved ? `<div class="vnote"><textarea id="svNote" placeholder="Why you saved it, what to steal (optional)" maxlength="600">${esc(p.note || '')}</textarea><small>Saved with the post. Shows on the Saved tab.</small></div>` : ''}
      ${p.idea_id ? `<div class="soc-made" style="font-size:12.5px">${ic('sparkles')} Our version started</div>` : ''}
      <div class="vkeys">Keys: S save · ${CLI() ? '' : 'M make ours · '}C copy link · T transcript · arrows</div>`;
    const tb = b.querySelector('#svTr'); if (tb) tb.onclick = () => transcript(p);
    const fb = b.querySelector('#svFollow'); if (fb) fb.onclick = () => followHandle(p.handle, p.plat, fb);
    const cl = b.querySelector('#svCopyLink'); if (cl) cl.onclick = () => copyText(p.url, 'Link copied.');
    const cc = b.querySelector('#svCopyCap'); if (cc) cc.onclick = () => copyText(p.caption, 'Caption copied.');
    const ct = b.querySelector('#svCopyTr'); if (ct) ct.onclick = () => copyText(p.transcript, 'Transcript copied.');
    const nt = b.querySelector('#svNote');
    if (nt) { let was = p.note || ''; nt.onblur = async () => { const v = nt.value.trim(); if (v === was) return; try { const r = await H.apiAH('/api/social/save', { method: 'POST', body: JSON.stringify({ id: p.id, saved: true, note: v }) }); p.note = r.note || null; was = p.note || ''; toast(v ? 'Note saved.' : 'Note removed.'); } catch (e) { toast(e.message); } }; }
  }
  async function copyText(t, msg) {
    if (!t) { toast('Nothing to copy.'); return; }
    try { await navigator.clipboard.writeText(String(t)); toast(msg || 'Copied.'); }
    catch { const ta = document.createElement('textarea'); ta.value = String(t); document.body.appendChild(ta); ta.select(); try { document.execCommand('copy'); toast(msg || 'Copied.'); } catch { toast('Could not copy.'); } ta.remove(); }
  }
  /* The transcript: fetched once per post (one scraper credit), kept on the post row server side. */
  function transcriptHtml(p) {
    if (p.fmt === 'photo' || p.fmt === 'carousel') return '';
    if (p.transcript != null) return p.transcript ? `<div class="vtr"><b>What they say<button type="button" class="vcopy" id="svCopyTr">Copy</button></b><div>${esc(p.transcript)}</div></div>` : `<div class="vline">${esc(p.transcript_why || 'No speech was found in this post.')}</div>`;
    return `<div class="vrow"><button type="button" class="soc-btn sm" id="svTr">${ic('file-text')} Transcript</button></div>`;
  }
  async function transcript(p) {
    const el = viewerEl(), btn = el.querySelector('#svTr'); if (btn) { btn.disabled = true; btn.textContent = 'Reading…'; }
    try {
      const r = await H.apiAH('/api/social/transcript', { method: 'POST', body: JSON.stringify({ id: p.id }) });
      p.transcript = r.text || ''; p.transcript_why = r.why || '';
      if (V && V.p === p) column(p);
    } catch (e) { toast(e.message); if (btn) { btn.disabled = false; btn.innerHTML = `${ic('file-text')} Transcript`; } }
  }
  function bar(p) {
    const el = viewerEl(), b = el.querySelector('.vbar');
    /* 2026-10-21: Make ours is one primary button (a text label, no icon glyph), Save is one button, and the tag is picked
       AFTER saving: a row of the brand's tags plus "+ tag" appears under the buttons, one tap each. */
    b.innerHTML = `${CLI() ? `<button type="button" class="soc-btn pri" id="svAsk">Ask the team</button>` : `<button type="button" class="soc-btn pri mk" id="svMake">${p.idea_id ? 'Our version' : 'Make ours'}</button>`}
      <button type="button" class="soc-btn sav ${p.saved ? 'on' : ''}" id="svSave" ${U() ? U().tipAttr(p.saved ? 'Saved. Click to remove it from Saved.' : 'Keep it on the Saved tab') : ''}>${ic('bookmark')} ${p.saved ? 'Saved' : 'Save'}</button>
      <a class="soc-btn" href="${esc(p.url)}" target="_blank" rel="noopener" ${U() ? U().tipAttr(`Open on ${PL[p.plat] || ''}`) : ''}>${ic('external-link')} ${esc(PLK[p.plat] || 'Open')}</a>
      ${p.saved ? tagRow(p) : ''}`;
    const mk = b.querySelector('#svMake'); if (mk) mk.onclick = () => makeStep(p);
    const ask = b.querySelector('#svAsk'); if (ask) ask.onclick = () => { closePost(); H.show('requests'); };
    b.querySelector('#svSave').onclick = () => saveToggle(p, p.saved ? null : p.tag, !p.saved);
    wireTagRow(b, p);
  }
  function tagRow(p) {
    const tags = (ST.data && ST.data.tags) || [];
    return `<div class="vtagrow"><span class="lb">Tag</span>${tags.map(t => `<button type="button" data-t="${esc(t.name)}" class="${p.tag === t.name ? 'on' : ''}"><i class="soc-tagdot" style="background:${tagColor(t.name)}"></i><span>${esc(t.name)}</span></button>`).join('')}${p.tag && !tags.some(t => t.name === p.tag) ? `<button type="button" data-t="${esc(p.tag)}" class="on"><i class="soc-tagdot" style="background:${tagColor(p.tag)}"></i><span>${esc(p.tag)}</span></button>` : ''}<button type="button" class="add" data-newtag="1">+ tag</button></div>`;
  }
  function wireTagRow(b, p) {
    const row = b.querySelector('.vtagrow'); if (!row) return;
    row.querySelectorAll('[data-t]').forEach(x => x.onclick = () => saveToggle(p, p.tag === x.dataset.t ? null : x.dataset.t, true));
    const add = row.querySelector('[data-newtag]');
    if (add) add.onclick = () => {
      add.outerHTML = '<input type="text" placeholder="New tag" maxlength="40" aria-label="New tag">';
      const inp = row.querySelector('input'); inp.focus();
      const done = () => { const t = inp.value.trim(); if (t) saveToggle(p, t, true); else bar(p); };
      inp.onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); done(); } else if (e.key === 'Escape') { e.stopPropagation(); bar(p); } };
      inp.onblur = () => setTimeout(() => { if (inp.isConnected) done(); }, 120);
    };
  }
  async function saveToggle(p, tag, next) {
    try {
      const r = await H.apiAH('/api/social/save', { method: 'POST', body: JSON.stringify({ id: p.id, saved: next, tag: next ? (tag || null) : null }) });
      p.saved = next; p.tag = r.tag || null;
      if (ST.data) { const tags = ST.data.tags || []; const m = new Map(); for (const x of ST.data.posts) if (x.saved && x.tag) m.set(x.tag, (m.get(x.tag) || 0) + 1); ST.data.tags = [...m].map(([name, n]) => ({ name, n })).sort((a, b) => a.name.localeCompare(b.name)); if (!tags.length && !ST.data.tags.length) ST.data.tags = []; }
      if (!next) p.note = null;
      if (V && V.p === p) { bar(p); column(p); }
      const c = $(`.soc-post[data-id="${CSS.escape(p.id)}"]`);
      if (c) { const med = c.querySelector('.soc-med'), sv = med.querySelector('.sv'); if (next && !sv) med.insertAdjacentHTML('beforeend', `<span class="sv">${ic('bookmark')}</span>`); if (!next && sv) sv.remove(); if (saved() && !next) c.remove(); }
      toast(next ? (p.tag ? `Saved under ${p.tag}.` : 'Saved.') : 'Removed from Saved.');
    } catch (err) { toast(err.message); }
  }
  /* ---------- Make ours: a second step in the same column. The brief itself lives in Slack; here the beats. ---------- */
  const stat = (cls, t) => `<span class="vstat ${cls}"><i></i>${esc(t)}</span>`;
  /* 2026-10-20: Make ours is the shared Make panel (make.js), drawn inside the viewer's column: breakdown, the draft,
     Redo with a steer, and the four exits (Organic post is pre-picked here). Slack is a toggle, off by default. */
  function makeStep(p) {
    const el = viewerEl(), b = el.querySelector('.vbody');
    const back = () => column(p);
    if (window.LocusMake) {
      b.innerHTML = '<div class="vstep"></div>'; b.scrollTop = 0;
      const label = `${FMT_WORD[p.fmt] || 'post'} from ${p.handle ? `@${p.handle}` : 'another brand'} on ${({ ig: 'Instagram', tt: 'TikTok', yt: 'YouTube', fb: 'Facebook' })[p.plat] || p.plat}`;
      const stats = [p.views != null ? `${Number(p.views).toLocaleString('en-US')} views` : null, p.likes != null ? `${Number(p.likes).toLocaleString('en-US')} likes` : null].filter(Boolean).join(', ');
      window.LocusMake.open({ act: ST.act, exit: 'organic', url: p.url, image: p.thumb || null, post: p.id, id: p.idea_id || null, mode: p.mk_mode || 'remix', title: 'Make ours',
        note: `Make our version of this ${label}${stats ? ` (${stats})` : ''}.`, mount: b.querySelector('.vstep'), back: { label: 'Back to the post', fn: back },
        onDone: r => { if (r.started) { p.idea_id = r.started; p.saved = true; bar(p); const c = $(`.soc-post[data-id="${CSS.escape(p.id)}"] .soc-body`); if (c && !c.querySelector('.soc-made')) c.insertAdjacentHTML('beforeend', `<span class="soc-made">${ic('sparkles')} Our version started</span>`); } } });
      return;
    }
    const shell = inner => { b.innerHTML = `<div class="vstep"><button type="button" class="bk" id="mkBack">&#8249; Back to the post</button><h3>Make ours</h3>${inner}</div>`; b.querySelector('#mkBack').onclick = back; b.scrollTop = 0; };
    if (!p.idea_id) {
      shell(`<p>Claude watches this post and writes ${esc(brandName())}'s version as a text brief in the brand's Slack channel: the hook, the shots, our product in it, never their footage. The beats show here. About 20 to 30 cents.</p>
        <div class="mkmode" role="radiogroup" aria-label="How close to the original">
          <label class="${!p.mk_mode || p.mk_mode === 'remix' ? 'on' : ''}"><input type="radio" name="mkMode" value="remix" ${!p.mk_mode || p.mk_mode === 'remix' ? 'checked' : ''}><b>Our own take</b><small>Keep the idea, change how it is told</small></label>
          <label class="${p.mk_mode === 'recreate' ? 'on' : ''}"><input type="radio" name="mkMode" value="recreate" ${p.mk_mode === 'recreate' ? 'checked' : ''}><b>Recreate it</b><small>Same hook shape, same beats, same pacing; only the product and words change</small></label>
        </div>
        <input type="text" id="mkNote" placeholder="Steer it (optional): use the Ice & Gold wedge, keep the POV hook" maxlength="400">
        <div class="vrow"><button type="button" class="soc-btn pri" id="mkGo">${ic('sparkles')} Write it</button><span class="err" id="mkErr"></span></div>`);
      b.querySelectorAll('.mkmode input').forEach(r => r.onchange = () => { p.mk_mode = r.value; b.querySelectorAll('.mkmode label').forEach(l => l.classList.toggle('on', l.contains(r))); });
      b.querySelector('#mkNote').onkeydown = e => { if (e.key === 'Enter') b.querySelector('#mkGo').click(); };
      b.querySelector('#mkGo').onclick = async () => {
        const g = b.querySelector('#mkGo'); g.disabled = true; g.textContent = 'Starting…';
        try { const r = await H.apiAH('/api/social/make', { method: 'POST', body: JSON.stringify({ id: p.id, note: b.querySelector('#mkNote').value, mode: p.mk_mode || 'remix' }) }); p.idea_id = r.idea_id; p.saved = true; bar(p); showState(p, r.state, shell); const c = $(`.soc-post[data-id="${CSS.escape(p.id)}"] .soc-body`); if (c && !c.querySelector('.soc-made')) c.insertAdjacentHTML('beforeend', `<span class="soc-made">${ic('sparkles')} Our version started</span>`); }
        catch (e) { b.querySelector('#mkErr').textContent = e.message; g.disabled = false; g.innerHTML = `${ic('sparkles')} Write it`; }
      };
      return;
    }
    shell(stat('work', 'Reading the draft'));
    H.apiAH(`/api/social/idea?id=${encodeURIComponent(p.id)}`, { fresh: true }).then(r => { if (V && V.p === p) showState(p, r.state, shell); }).catch(e => shell(`${stat('bad', 'Could not read it')}<p class="err">${esc(e.message)}</p>`));
  }
  function showState(p, s, shell, tries = 0) {
    clearTimeout(poll);
    const el = viewerEl(), b = el.querySelector('.vbody');
    if (!s) { shell(`${stat('', 'No draft stored')}<p>That draft is no longer stored.</p>`); return; }
    const slack = s.link ? `<a href="${esc(s.link)}" target="_blank" rel="noopener">the Slack thread</a>` : 'the brand\'s Slack channel';
    if (['queued', 'working'].includes(s.status)) {
      shell(`${stat('work', s.status === 'queued' ? 'Queued, about a minute' : 'Writing, about a minute')}<p>Claude is watching the post and writing our version. The brief posts in ${slack} too; this updates on its own.</p>`);
      if (tries < 60 && V && V.p === p) poll = setTimeout(() => H.apiAH(`/api/social/idea?id=${encodeURIComponent(p.id)}`, { fresh: true }).then(r => { if (V && V.p === p) showState(p, r.state, shell, tries + 1); }).catch(() => {}), 5000);
      return;
    }
    if (s.status === 'failed') {
      shell(`${stat('bad', 'Did not finish')}<p>The draft did not finish. Try again runs it once more, in ${slack} too.</p><div class="vrow"><button type="button" class="soc-btn pri" id="mkRetry">Try again</button><span class="err" id="mkErr"></span></div>`);
      b.querySelector('#mkRetry').onclick = async e => { e.target.disabled = true; try { const r = await H.apiAH('/api/social/make', { method: 'POST', body: JSON.stringify({ id: p.id }) }); showState(p, r.state, shell); } catch (err) { b.querySelector('#mkErr').textContent = err.message; e.target.disabled = false; } };
      return;
    }
    const sc = s.script || {};
    const beats = [...(sc.openers || []).slice(0, 2).map((t, i) => [i ? 'Or open' : 'Hook', t, true]), ...(sc.shots || []).map(x => [x.label || 'Shot', x.text, false])];
    const lines = s.studio && !beats.length ? s.studio.lines.map((t, i) => [`Ad ${i + 1}`, t, false]) : [];
    const sent = Object.entries(s.sent || {});
    const asking = (s.questions || []).length && s.status === 'questions';
    shell(`${stat(asking ? 'ask' : 'ok', asking ? 'Needs an answer' : sent.length ? 'Sent on' : 'Ready')}
      ${sc.title ? `<p><b style="color:var(--ink)">${esc(sc.title)}</b></p>` : ''}
      ${s.take ? `<p>${esc(s.take)}</p>` : ''}
      ${asking ? `<p class="err">${esc(s.questions.join(' '))} Reply in ${slack}.</p>` : ''}
      ${beats.length || lines.length ? `<div class="beats">${[...beats, ...lines].map(([l, t, hk]) => `<div class="beat ${hk ? 'hk' : ''}"><i>${esc(l)}</i><span>${esc(t)}</span></div>`).join('')}</div>` : ''}
      ${sc.on_screen ? `<p>On screen: ${esc(sc.on_screen)}</p>` : ''}
      ${s.pick ? `<p>Suggested: <b style="color:var(--ink)">${esc(DEST[s.pick === 'lucky_creators' ? 'creator_link' : s.pick] || s.pick)}</b>${s.why ? `. ${esc(s.why)}` : ''}</p>` : ''}
      ${sent.map(([k2, v]) => `<span class="sent">${ic('check')} Sent to ${esc(k2 === 'lucky_creators' ? 'the Lucky creator app' : DEST[k2] || k2)}${v.url ? ` · <a href="${esc(v.url)}" target="_blank" rel="noopener">open</a>` : ''}</span>`).join('')}
      <div class="vrow">${Object.entries(DEST).filter(([d]) => !(s.sent || {})[d] && !(d === 'creator_link' && (s.sent || {}).lucky_creators)).map(([d, l]) => `<button type="button" class="soc-btn sm ${d === s.pick ? 'pri' : ''}" data-dest="${d}">${esc(l)}</button>`).join('')}</div>
      <p>The full brief is a text draft in ${slack}: change it or ask for a redo there.</p><span class="err" id="sdErr"></span>`);
    b.querySelectorAll('[data-dest]').forEach(x => x.onclick = async () => {
      x.disabled = true; const was = x.textContent; x.textContent = 'Sending…';
      try { const r = await H.apiAH('/api/social/push', { method: 'POST', body: JSON.stringify({ id: p.id, dest: x.dataset.dest }) }); if (r.text) toast(r.text); showState(p, r.state, shell); }
      catch (e) { b.querySelector('#sdErr').textContent = e.message; x.disabled = false; x.textContent = was; }
    });
  }

  /* ---------- Results (2026-10-20): our posted cards from the last 30 days by views, beside what the watched brands usually get ---------- */
  const FMT_WORD = { video: 'video', reel: 'reel', short: 'short', carousel: 'carousel', photo: 'photo', image: 'photo' };
  const PLN = { ig: 'Instagram', fb: 'Facebook', tt: 'TikTok', yt: 'YouTube' };
  const kk = n => { if (n == null) return '–'; const a = Math.abs(n); return a >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : a >= 1e3 ? `${(n / 1e3).toFixed(a >= 1e4 ? 0 : 1)}k` : String(Math.round(n)); };
  async function drawResults() {
    if (!document.getElementById('socrcss')) document.head.insertAdjacentHTML('beforeend', `<style id="socrcss">
      .soc-res{display:grid;grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:12px}
      .soc-res .rc{border:1px solid var(--line);border-radius:12px;overflow:hidden;background:var(--surface);cursor:pointer;text-align:left;padding:0;color:var(--ink);font:inherit;display:flex;flex-direction:column}
      .soc-res .rc:hover{border-color:var(--ink)}
      .soc-res .rc .th{aspect-ratio:4/5;background:var(--surface-2,var(--line)) center/cover no-repeat;position:relative} .soc-res .rc .th .rk{position:absolute;top:8px;left:8px;background:var(--ink);color:var(--surface);border-radius:999px;font-size:11px;font-weight:600;padding:2px 8px}
      .soc-res .rc .bd{padding:10px 12px 12px;display:flex;flex-direction:column;gap:6px}
      .soc-res .rc .big{font-size:20px;font-weight:600;letter-spacing:-.01em;font-variant-numeric:tabular-nums} .soc-res .rc .big small{font-size:12px;font-weight:500;color:var(--muted);margin-left:5px}
      .soc-res .rc .cap{font-size:12.5px;color:var(--ink);display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
      .soc-res .rc .pl{font-size:12px;color:var(--muted);display:flex;justify-content:space-between;gap:8px} .soc-res .rc .pl b{color:var(--ink);font-weight:600} .soc-res .rc .pl .up{color:var(--good)} .soc-res .rc .pl .dn{color:var(--bad)}
      .soc-res .rc .when{font-size:11.5px;color:var(--muted)}
      .soc-usual{display:flex;gap:14px;flex-wrap:wrap;margin:0 0 14px;font-size:12.5px;color:var(--muted)} .soc-usual b{color:var(--ink)}
    </style>`);
    const head = H.pageHead('socialresults', 'Social');
    $('#main').innerHTML = `<div class="v2 soc">${head}<div class="soc-sk">${'<i></i>'.repeat(PHONE() ? 4 : 8)}</div></div>`;
    const t = H.RUN();
    let r;
    try { r = await H.apiAH(`/api/social/results?act=${encodeURIComponent(ST.act)}`, { fresh: true }); }
    catch (e) { if (t !== H.RUN()) return; $('#main').innerHTML = `<div class="v2 soc">${head}<div class="soc-state err"><b>Results did not load</b><p>${esc(e.message)}</p></div></div>`; return; }
    if (t !== H.RUN()) return;
    const usual = r.usual || {};
    const uline = ['ig', 'tt', 'yt'].filter(x => usual[x] && (usual[x].views != null || usual[x].likes != null)).map(x => `<span>${PLN[x]}: <b>${usual[x].views != null ? `${kk(usual[x].views)} views` : `${kk(usual[x].likes)} likes`}</b> is usual for the brands you watch (${usual[x].n} posts)</span>`).join('');
    const ours = r.ours || [];
    const cards = ours.map((p, i) => {
      const m = (p.media || [])[0] || {};
      const rows = Object.entries(p.per || {}).map(([x, v]) => {
        const u = usual[x] && usual[x].views != null ? usual[x].views : null;
        const cls = u && v.views != null ? (v.views >= u ? 'up' : 'dn') : '';
        return `<span class="pl"><span>${esc(PLN[x] || x)}</span><span><b class="${cls}">${v.views != null ? `${kk(v.views)} views` : v.likes != null ? `${kk(v.likes)} likes` : 'no numbers yet'}</b>${u ? ` · usual ${kk(u)}` : ''}</span></span>`;
      }).join('');
      return `<button type="button" class="rc" data-post="${esc(p.id)}"><span class="th" ${m.thumb ? `style="background-image:url('${esc(m.thumb)}')"` : ''}><span class="rk">#${i + 1}</span></span>
        <span class="bd"><span class="big">${p.views != null ? kk(p.views) : '–'}<small>views</small></span>${rows}<span class="cap">${esc(p.caption || m.title || '')}</span><span class="when">${esc(new Date(p.at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }))}${p.likes ? ` · ${kk(p.likes)} likes` : ''}${p.comments ? ` · ${kk(p.comments)} comments` : ''}</span></span></button>`;
    }).join('');
    $('#main').innerHTML = `<div class="v2 soc">${head}
      ${uline ? `<div class="soc-usual">${uline}</div>` : ''}
      ${ours.length ? `<div class="soc-res">${cards}</div>` : `<div class="soc-state"><b>Nothing posted through Locus in the last 30 days</b><p>Once a post goes out from the Week its views land here the day after, beside what the brands you watch usually get.</p></div>`}</div>`;
    $('#main').querySelectorAll('[data-post]').forEach(b => b.onclick = () => { window.SOCIAL_POST = b.dataset.post; H.show('socialweek'); });
  }

  window.SocialTab = { render, settings, loadBrands, tabOk, open: openPost, setHost: h => { H = h; } };
})();

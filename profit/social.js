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
 * 2026-10-21 REBUILD (Cole: "you can't tell whose post it is", "make ours is unclear", "it should be our strategy"):
 *   the page leads with THIS WEEK (posts planned vs target, our versions waiting to be filmed, filmed and ready, the
 *   Week one click away), then WORTH MAKING THIS WEEK (the top 4 posts at 3x+ their usual, each with Make ours), then
 *   everything the brand watches. A card = the media (one "6.2x usual" badge, time or slide count, carousel arrows and
 *   dots, a speaker button while a video plays) and under it the account (avatar with a platform badge, @handle,
 *   platform · format · age) and ONE icon row (views, likes, comments). The viewer plays video WITH sound, pages
 *   carousels by swipe, arrows, dots and the arrow keys, and Make ours is four steps shown as progress (Write it, On
 *   the Week, Film it, Schedule it), see makeStep. The notes below describe the controls row, which is unchanged.
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
      /* THE PLAN STRIP (2026-10-21): what this brand posts this week, before anything scraped */
      .soc .soc-plan{display:grid;grid-template-columns:minmax(0,1.1fr) minmax(0,1.6fr) auto;gap:20px;align-items:center;padding:18px 22px;margin:0 0 22px;border:1px solid color-mix(in srgb,var(--line) 75%,transparent);border-radius:var(--v5-r,12px);background:var(--surface);box-shadow:var(--v5-sh,none)}
      .soc .soc-plan .k{font-size:11px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:var(--muted)}
      .soc .soc-plan .big{display:flex;align-items:baseline;gap:8px;margin:4px 0 8px} .soc .soc-plan .big b{font-size:28px;font-weight:600;letter-spacing:-.02em;font-variant-numeric:tabular-nums;line-height:1} .soc .soc-plan .big span{color:var(--muted);font-size:13px}
      .soc .soc-plan .bar{height:6px;border-radius:3px;background:var(--surface-2);overflow:hidden} .soc .soc-plan .bar i{display:block;height:100%;border-radius:3px;background:var(--v5-grad,var(--brand))}
      .soc .soc-plan .pipe{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}
      .soc .soc-plan .pipe div{border-radius:10px;background:var(--surface-2);padding:10px 12px;min-width:0}
      .soc .soc-plan .pipe b{display:block;font-size:20px;font-weight:600;font-variant-numeric:tabular-nums;line-height:1.1} .soc .soc-plan .pipe small{display:block;color:var(--muted);font-size:12px;margin-top:3px;line-height:1.35}
      .soc .soc-plan .acts{display:flex;flex-direction:column;gap:8px;align-items:stretch}
      .soc .soc-plan.sk{min-height:96px;background:linear-gradient(90deg,var(--surface) 0%,var(--surface-2) 50%,var(--surface) 100%);background-size:200% 100%;animation:socshim 1.3s linear infinite}
      .soc .soc-sh{display:flex;flex-wrap:wrap;align-items:baseline;gap:2px 10px;margin:0 0 4px} .soc .soc-sh h3{margin:0;font-size:15px;font-weight:600} .soc .soc-sh small{color:var(--muted);font-size:12.5px}
      .soc .soc-lead{margin:0 0 14px;color:var(--muted);font-size:12.5px}
      .soc .soc-picks{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:16px;margin:0 0 30px}
      /* THE GRID AND A CARD: media (one badge, time or slide count, carousel arrows), then who posted it, then one metric row */
      .soc .soc-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(210px,1fr));gap:18px}
      .soc .soc-post{display:flex;flex-direction:column;min-width:0;cursor:pointer;text-align:left;padding:0;font:inherit;color:var(--ink);background:var(--surface);border:1px solid color-mix(in srgb,var(--line) 75%,transparent);border-radius:var(--v5-r,12px);box-shadow:var(--v5-sh,none);overflow:hidden;transition:box-shadow var(--t,160ms),transform var(--t,160ms)}
      .soc .soc-post:hover{box-shadow:var(--v5-sh-hi,none);transform:translateY(-1px)}
      .soc .soc-post:focus-visible{outline:2px solid var(--brand);outline-offset:2px}
      .soc .soc-med{position:relative;aspect-ratio:4/5;background:var(--surface-2);overflow:hidden}
      .soc .soc-med>img,.soc .soc-med>video,.soc .soc-med>iframe{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;display:block;border:0;background:#000}
      .soc .soc-med>iframe{pointer-events:none}
      .soc .soc-med .cstrip{position:absolute;inset:0;display:flex;overflow-x:auto;scroll-snap-type:x mandatory;scrollbar-width:none;overscroll-behavior-x:contain} .soc .soc-med .cstrip::-webkit-scrollbar{display:none}
      .soc .soc-med .cstrip img{flex:none;width:100%;height:100%;object-fit:cover;scroll-snap-align:start}
      .soc-x{display:inline-flex;align-items:center;gap:5px;height:24px;padding:0 9px 0 7px;border-radius:999px;font-size:12px;font-weight:600;font-variant-numeric:tabular-nums;white-space:nowrap;background:rgba(12,12,16,.74);color:#fff;backdrop-filter:blur(6px)}
      .soc-x b{font-weight:700} .soc-x span{opacity:.75;font-weight:500} .soc-x svg{color:var(--good)} .soc-x.hi svg{color:var(--warn)} .soc-x.lo svg{color:rgba(255,255,255,.7)}
      .soc .soc-med .soc-x{position:absolute;top:10px;left:10px;z-index:2}
      .soc .soc-med .soc-tr{position:absolute;top:10px;right:10px;z-index:2;height:22px;padding:0 8px;border-radius:999px;display:inline-flex;align-items:center;font-size:11px;font-weight:600;font-variant-numeric:tabular-nums;background:rgba(12,12,16,.66);color:#fff}
      .soc .soc-med .snd{position:absolute;bottom:10px;right:10px;z-index:3;width:32px;height:32px;border-radius:50%;border:0;background:rgba(12,12,16,.72);color:#fff;display:none;align-items:center;justify-content:center;cursor:pointer}
      .soc .soc-med .snd:hover{background:rgba(12,12,16,.9)} .soc .soc-med.playing .snd{display:inline-flex}
      .soc .soc-med .cv{position:absolute;top:50%;z-index:3;width:30px;height:30px;margin-top:-15px;border-radius:50%;border:0;background:rgba(255,255,255,.92);color:#111;display:inline-flex;align-items:center;justify-content:center;cursor:pointer;opacity:0;transition:opacity var(--t-fast,120ms);box-shadow:0 2px 8px rgba(0,0,0,.25)}
      .soc .soc-med .cprev{left:8px} .soc .soc-med .cnext{right:8px}
      .soc .soc-post:hover .soc-med .cv,.soc .soc-med .cv:focus-visible{opacity:1} .soc .soc-med .cv[disabled]{opacity:0!important;pointer-events:none}
      @media (hover:none){.soc .soc-med .cv{opacity:.92;width:28px;height:28px}}
      .soc .soc-med .cdots{position:absolute;bottom:10px;left:0;right:0;z-index:2;display:flex;gap:4px;justify-content:center;pointer-events:none}
      .soc .soc-med .cdots i{width:6px;height:6px;border-radius:50%;background:rgba(255,255,255,.5);box-shadow:0 0 2px rgba(0,0,0,.4)} .soc .soc-med .cdots i.on{background:#fff}
      .soc .soc-med .spin{position:absolute;left:50%;top:50%;width:26px;height:26px;margin:-13px 0 0 -13px;border-radius:50%;border:2.5px solid rgba(255,255,255,.35);border-top-color:#fff;animation:socspin .8s linear infinite;display:none;z-index:2}
      .soc .soc-med.loading .spin{display:block}
      @keyframes socspin{to{transform:rotate(360deg)}}
      .soc .soc-meta{padding:12px 14px 13px;display:grid;gap:10px}
      .soc-id{display:flex;align-items:center;gap:10px;min-width:0}
      .soc-id .nm{min-width:0;flex:1;display:grid;gap:1px} .soc-id .nm b{font-size:13px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis} .soc-id .nm small{font-size:11.5px;color:var(--muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      .soc-id .svd{color:var(--brand);flex:none;display:inline-flex}
      .soc-av{position:relative;flex:none;width:32px;height:32px;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;font-size:11.5px;font-weight:700;letter-spacing:.02em;color:var(--av,var(--brand));background:color-mix(in srgb,var(--av,var(--brand)) 16%,var(--surface))}
      .soc-av .pm{position:absolute;right:-3px;bottom:-3px;width:17px;height:17px;border-radius:50%;background:var(--surface);color:var(--ink);display:inline-flex;align-items:center;justify-content:center;box-shadow:0 0 0 1.5px var(--surface),0 1px 3px rgba(0,0,0,.25)}
      .soc-av.lg{width:42px;height:42px;font-size:13px} .soc-av.lg .pm{width:19px;height:19px}
      .soc-stats{display:flex;align-items:center;gap:14px;font-size:12.5px;color:var(--muted);font-variant-numeric:tabular-nums;white-space:nowrap;overflow:hidden;min-width:0}
      .soc-stats span{display:inline-flex;align-items:center;gap:5px} .soc-stats b{color:var(--ink);font-weight:600}
      .soc .soc-made{margin-left:auto;font-size:11px;font-weight:600;color:var(--brand-ink,var(--brand));background:var(--brand-soft);padding:2px 8px;border-radius:999px}
      .soc .soc-sv{display:flex;align-items:center;gap:6px;font-size:12px;color:var(--ink-2);min-width:0} .soc .soc-sv span{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      .soc .soc-pickbar{padding:0 14px 14px;margin-top:-2px} .soc .soc-pickbar .soc-btn{width:100%;height:34px}
      /* THE VIEWER: the media at phone proportions on black, a 380px column (who, numbers, caption, transcript), one bar */
      .soc-view{position:fixed;inset:0;z-index:9000;background:rgba(8,8,10,.96);display:grid;grid-template-columns:minmax(0,1fr) 384px;color:#fff;opacity:0;visibility:hidden;transition:opacity var(--t-fast,.14s)}
      .soc-view.on{opacity:1;visibility:visible}
      .soc-view .vstage{position:relative;display:flex;align-items:center;justify-content:center;min-width:0;padding:48px 76px}
      .soc-view .vmed{position:relative;height:100%;max-height:calc(100vh - 96px);aspect-ratio:9/16;max-width:100%;background:#000;border-radius:14px;overflow:hidden;display:flex;align-items:center;justify-content:center}
      .soc-view .vmed.sq{aspect-ratio:4/5}
      .soc-view .vmed>img,.soc-view .vmed>video{width:100%;height:100%;object-fit:contain;display:block;background:#000}
      .soc-view .vmed>iframe{width:100%;height:100%;border:0;background:#000}
      .soc-view .vmed .note{position:absolute;left:50%;bottom:14px;transform:translateX(-50%);font-size:12px;background:rgba(16,16,20,.8);padding:6px 10px;border-radius:7px;white-space:nowrap}
      .soc-view .vmed .tapsnd{position:absolute;left:50%;top:16px;transform:translateX(-50%);height:32px;padding:0 12px;border-radius:999px;border:0;background:rgba(255,255,255,.94);color:#111;font:inherit;font-size:12.5px;font-weight:600;display:inline-flex;align-items:center;gap:6px;cursor:pointer;z-index:4}
      .soc-view .vslides{position:absolute;inset:0;display:flex;overflow-x:auto;scroll-snap-type:x mandatory;scrollbar-width:none;overscroll-behavior-x:contain} .soc-view .vslides::-webkit-scrollbar{display:none}
      .soc-view .vslides img{flex:none;width:100%;height:100%;object-fit:contain;scroll-snap-align:start;background:#000}
      .soc-view .vsl{position:absolute;top:50%;margin-top:-18px;width:36px;height:36px;border-radius:50%;border:0;background:rgba(255,255,255,.94);color:#111;display:inline-flex;align-items:center;justify-content:center;cursor:pointer;z-index:4;box-shadow:0 2px 10px rgba(0,0,0,.35)}
      .soc-view .vsl.l{left:10px} .soc-view .vsl.r{right:10px} .soc-view .vsl[disabled]{opacity:0;pointer-events:none}
      .soc-view .vdots{position:absolute;bottom:12px;left:0;right:0;display:flex;gap:2px;justify-content:center;z-index:4}
      .soc-view .vdots button{width:16px;height:16px;padding:0;border:0;background:none;cursor:pointer;display:inline-flex;align-items:center;justify-content:center}
      .soc-view .vdots button i{width:7px;height:7px;border-radius:50%;background:rgba(255,255,255,.45);box-shadow:0 0 2px rgba(0,0,0,.5)} .soc-view .vdots button.on i{background:#fff}
      .soc-view .vsn{position:absolute;top:12px;right:12px;z-index:4;height:24px;padding:0 9px;border-radius:999px;display:inline-flex;align-items:center;font-size:12px;font-weight:600;background:rgba(12,12,16,.7);font-variant-numeric:tabular-nums}
      .soc-view .vx,.soc-view .vprev,.soc-view .vnext{position:absolute;width:40px;height:40px;border-radius:50%;border:0;background:rgba(255,255,255,.1);color:#fff;display:inline-flex;align-items:center;justify-content:center;cursor:pointer}
      .soc-view .vx:hover,.soc-view .vprev:hover,.soc-view .vnext:hover{background:rgba(255,255,255,.2)}
      .soc-view .vx{top:16px;left:16px} .soc-view .vprev{left:16px;top:50%;margin-top:-20px} .soc-view .vnext{right:16px;top:50%;margin-top:-20px}
      .soc-view .vprev:disabled,.soc-view .vnext:disabled{opacity:.25;cursor:default}
      .soc-view .vcount{position:absolute;top:26px;left:66px;font-size:12px;color:rgba(255,255,255,.6);font-variant-numeric:tabular-nums}
      .soc-view .vcol{background:var(--surface);color:var(--ink);display:flex;flex-direction:column;min-height:0;border-left:1px solid var(--line)}
      .soc-view .vbody{flex:1;overflow:auto;padding:20px 22px 16px;display:grid;gap:18px;align-content:start;font-size:13px}
      .soc-view .vwho{display:flex;gap:12px;align-items:center;min-width:0}
      .soc-view .vwho .t{min-width:0;flex:1} .soc-view .vwho b{display:block;font-size:15px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis} .soc-view .vwho small{display:block;color:var(--muted);font-size:12px;margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      .soc-view .vchips{display:flex;gap:6px;flex-wrap:wrap;margin-top:-6px}
      .soc-view .vchips span{display:inline-flex;align-items:center;gap:5px;height:24px;padding:0 9px;border-radius:999px;background:var(--surface-2);color:var(--ink-2);font-size:12px;font-weight:500}
      .soc-view .vsec{display:grid;gap:8px}
      .soc-view .vsec>h5{margin:0;display:flex;align-items:center;gap:8px;font-size:11px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:var(--muted)} .soc-view .vsec>h5 .sp{flex:1}
      .soc-view .vperf{border-radius:12px;background:var(--surface-2);padding:14px 16px;display:grid;gap:10px}
      .soc-view .vperf .top{display:flex;align-items:center;gap:10px;justify-content:space-between}
      .soc-view .vperf .num b{font-size:28px;font-weight:600;letter-spacing:-.02em;font-variant-numeric:tabular-nums;line-height:1} .soc-view .vperf .num span{color:var(--muted);font-size:13px;margin-left:6px}
      .soc-view .vperf .soc-x{background:var(--brand-soft);color:var(--brand-ink,var(--brand));backdrop-filter:none} .soc-view .vperf .soc-x svg{color:currentColor}
      .soc-view .vperf p{margin:0;color:var(--muted);font-size:12.5px;line-height:1.45}
      .soc-view .vgrid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px;border-top:1px solid var(--line);padding-top:10px}
      .soc-view .vgrid div{min-width:0} .soc-view .vgrid small{display:block;color:var(--muted);font-size:11px} .soc-view .vgrid b{display:block;font-size:14px;font-weight:600;font-variant-numeric:tabular-nums;margin-top:2px}
      .soc-view .vcap{font-size:13px;line-height:1.55;white-space:pre-wrap;color:var(--ink);overflow-wrap:anywhere}
      .soc-view .vcap.clamp{display:-webkit-box;-webkit-line-clamp:5;-webkit-box-orient:vertical;overflow:hidden}
      .soc-view .vlink{font:inherit;font-size:12px;color:var(--brand-ink,var(--brand));background:none;border:0;padding:0;cursor:pointer;justify-self:start}
      .soc-view .vcopy{font:inherit;font-size:11.5px;font-weight:500;letter-spacing:0;text-transform:none;color:var(--muted);background:none;border:0;padding:0;cursor:pointer} .soc-view .vcopy:hover{color:var(--ink)}
      .soc-view .vtags{display:flex;gap:6px;flex-wrap:wrap}
      .soc-view .vtags span{font-size:12px;padding:3px 9px;border-radius:6px;background:var(--surface-2);color:var(--ink-2);display:inline-flex;align-items:center;gap:6px}
      .soc-view .vtr{font-size:13px;line-height:1.55;color:var(--ink-2);background:var(--surface-2);border-radius:10px;padding:12px 14px;max-height:240px;overflow:auto}
      .soc-view .vnote textarea{width:100%;min-height:58px;border:1px solid var(--line-strong);border-radius:var(--r-sm,8px);background:var(--surface);color:var(--ink);font:inherit;font-size:12.5px;padding:8px 10px;resize:vertical;box-sizing:border-box}
      .soc-view .vline{color:var(--muted);font-size:12.5px}
      .soc-view .vkeys{color:var(--faint,var(--muted));font-size:11px}
      .soc-view .vbar{display:grid;gap:8px;padding:12px 16px calc(12px + env(safe-area-inset-bottom,0px));border-top:1px solid var(--line);background:var(--surface)}
      .soc-view .vbar .row{display:flex;gap:8px} .soc-view .vbar .row>*{flex:1 1 0;min-width:0}
      .soc-view .vbar .soc-btn{height:38px} .soc-view .vbar .soc-btn.mk{height:40px;font-size:13.5px}
      .soc-view.making .vbar{display:none}
      .soc-split{position:relative;display:inline-flex;align-items:stretch;border:1px solid var(--line-strong);border-radius:var(--r-sm,8px);background:var(--surface);overflow:visible}
      .soc-split>button{border:0;background:transparent;font:inherit;font-size:13px;font-weight:600;color:var(--ink);cursor:pointer;display:inline-flex;align-items:center;justify-content:center;gap:6px;padding:0 12px}
      .soc-split>button:first-child{flex:1;border-radius:7px 0 0 7px} .soc-split>button+button{flex:none;width:36px;padding:0;border-left:1px solid var(--line-strong);border-radius:0 7px 7px 0}
      .soc-split>button:hover{background:var(--surface-2)}
      .soc-split.on{border-color:var(--brand);background:var(--brand-soft)} .soc-split.on>button{color:var(--brand-ink,var(--brand))} .soc-split.on>button+button{border-left-color:color-mix(in srgb,var(--brand) 45%,transparent)}
      .soc-split .soc-tagpick{bottom:calc(100% + 6px);left:0;right:auto}
      /* MAKE OUR VERSION: four steps shown as progress, what you get, the draft, then the next step's one button */
      .mkx{display:grid;gap:16px}
      .mkx .bk{font:inherit;font-size:12.5px;color:var(--muted);background:none;border:0;padding:0;cursor:pointer;text-align:left;justify-self:start} .mkx .bk:hover{color:var(--ink)}
      .mkx h3{margin:0;font-size:17px;font-weight:600;letter-spacing:-.01em}
      .mkx .steps{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:6px;counter-reset:mk}
      .mkx .steps li{list-style:none;display:grid;gap:6px;font-size:11.5px;color:var(--muted);font-weight:500}
      .mkx .steps li i{height:4px;border-radius:2px;background:var(--surface-2)}
      .mkx .steps li.done i{background:var(--good)} .mkx .steps li.cur i{background:var(--brand)} .mkx .steps li.cur{color:var(--ink);font-weight:600} .mkx .steps li.done{color:var(--ink-2)}
      .mkx .steps{margin:0;padding:0}
      .mkx .what{border-radius:12px;background:var(--surface-2);padding:14px 16px;display:grid;gap:10px}
      .mkx .what ol{margin:0;padding:0;list-style:none;display:grid;gap:9px;counter-reset:w}
      .mkx .what li{display:grid;grid-template-columns:22px 1fr;gap:10px;font-size:13px;line-height:1.4;counter-increment:w}
      .mkx .what li::before{content:counter(w);width:22px;height:22px;border-radius:50%;background:var(--surface);color:var(--ink);font-size:11.5px;font-weight:700;display:inline-flex;align-items:center;justify-content:center}
      .mkx .what li b{display:block;font-weight:600} .mkx .what li span{color:var(--muted);font-size:12.5px}
      .mkx .what small{color:var(--muted);font-size:12px;line-height:1.45}
      .mkx .mode{display:grid;grid-template-columns:1fr 1fr;gap:8px}
      .mkx .mode label{border:1px solid var(--line-strong);border-radius:10px;padding:10px 12px;cursor:pointer;display:grid;gap:2px;font-size:13px}
      .mkx .mode label.on{border-color:var(--brand);box-shadow:inset 0 0 0 1px var(--brand)} .mkx .mode input{display:none} .mkx .mode b{font-weight:600} .mkx .mode small{color:var(--muted);font-size:11.5px;line-height:1.35}
      .mkx textarea,.mkx input[type=text]{width:100%;box-sizing:border-box;min-height:38px;border:1px solid var(--line-strong);border-radius:var(--r-sm,8px);background:var(--surface);color:var(--ink);font:inherit;font-size:13px;padding:9px 11px;resize:vertical}
      .mkx .go{height:42px;font-size:13.5px;width:100%}
      .mkx .now{border:1px solid color-mix(in srgb,var(--brand) 40%,var(--line));border-radius:12px;padding:14px 16px;display:grid;gap:10px;background:color-mix(in srgb,var(--brand) 5%,var(--surface))}
      .mkx .now b{font-size:14px;font-weight:600} .mkx .now p{margin:0;color:var(--ink-2);font-size:13px;line-height:1.5}
      .mkx .now .row{display:flex;gap:8px;flex-wrap:wrap} .mkx .now .row .soc-btn{flex:1 1 auto}
      .mkx .wk{display:flex;gap:10px;align-items:center;font-size:13px;color:var(--ink-2)} .mkx .wk i{width:16px;height:16px;border-radius:50%;border:2px solid color-mix(in srgb,var(--brand) 30%,transparent);border-top-color:var(--brand);animation:socspin .8s linear infinite;flex:none}
      .mkx .ok{display:flex;gap:8px;align-items:center;color:var(--good);font-weight:600;font-size:13px}
      .mkx details{border:1px solid var(--line);border-radius:12px;padding:0 14px} .mkx details[open]{padding-bottom:14px} .mkx summary{cursor:pointer;padding:12px 0;font-size:13px;font-weight:600;list-style:none;display:flex;align-items:center;gap:8px} .mkx summary::-webkit-details-marker{display:none} .mkx summary small{color:var(--muted);font-weight:500;margin-left:auto}
      .mkx .beats{display:grid;gap:6px}
      .mkx .beat{display:grid;grid-template-columns:70px minmax(0,1fr);gap:10px;font-size:12.5px;background:var(--surface-2);border-radius:8px;padding:8px 10px;line-height:1.45}
      .mkx .beat i{font-style:normal;font-size:10.5px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:var(--muted);padding-top:2px} .mkx .beat.hk i{color:var(--brand-ink,var(--brand))}
      .mkx .kv{display:grid;gap:4px;font-size:12.5px;line-height:1.5} .mkx .kv b{font-size:11px;font-weight:600;letter-spacing:.05em;text-transform:uppercase;color:var(--muted);display:flex;gap:8px;align-items:center}
      .mkx .alt{display:flex;gap:6px;flex-wrap:wrap;align-items:center;font-size:12.5px;color:var(--muted)}
      .mkx .err{color:var(--bad);font-size:12.5px} .mkx .err:empty{display:none}
      .mkx .ask{border:1px solid var(--warn);border-radius:12px;padding:12px 14px;display:grid;gap:8px} .mkx .ask p{margin:0;font-size:13px}
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
      /* the tag picker (Save's chevron) */
      .soc-tagpick{position:absolute;bottom:calc(100% + 6px);right:0;min-width:220px;background:var(--surface);border:1px solid var(--line);border-radius:var(--r-lg,12px);box-shadow:var(--sh-pop,0 12px 32px -12px rgba(0,0,0,.5));padding:8px;display:grid;gap:2px;z-index:5;color:var(--ink)}
      .soc-tagpick button{display:flex;align-items:center;gap:8px;height:32px;padding:0 8px;border-radius:var(--r-sm,8px);border:0;background:transparent;font:inherit;font-size:13px;color:var(--ink);cursor:pointer;text-align:left;width:100%}
      .soc-tagpick button:hover{background:var(--surface-2)} .soc-tagpick button.on{background:var(--brand-soft);color:var(--brand-ink,var(--brand))}
      .soc-tagpick button small{margin-left:auto;color:var(--muted)}
      .soc-tagpick .new{display:flex;gap:6px;padding:4px 0 0;border-top:1px solid var(--line);margin-top:4px;padding-top:8px}
      .soc-tagpick .new input{flex:1;height:30px;min-width:0;padding:0 8px;border:1px solid var(--line-strong);border-radius:var(--r-sm,8px);background:var(--surface);color:var(--ink);font:inherit;font-size:12.5px}
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
        .soc .soc-grid,.soc .soc-sk,.soc .soc-picks{grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}
        .soc .soc-picks{margin-bottom:24px}
        .soc .soc-sh{display:grid}
        .soc .soc-ctl{flex-wrap:nowrap;overflow-x:auto;scrollbar-width:none;margin-left:-16px;margin-right:-16px;padding:0 16px} .soc .soc-ctl::-webkit-scrollbar{display:none}
        .soc .soc-ctl .sp{display:none} .soc .soc-ctl .hd-period.ph-hide,.soc .soc-q{display:none}
        .soc .soc-ctl .hd-per-btn .hd-per-d{display:inline}
        .soc .soc-plan{grid-template-columns:1fr;gap:14px;padding:16px}
        .soc .soc-plan .pipe{gap:8px} .soc .soc-plan .pipe div{padding:8px 10px} .soc .soc-plan .pipe b{font-size:17px} .soc .soc-plan .pipe small{font-size:11px}
        .soc .soc-plan .acts{flex-direction:row} .soc .soc-plan .acts .soc-btn{flex:1}
        .soc .soc-meta{padding:10px 10px 11px;gap:8px}
        .soc-av{width:28px;height:28px;font-size:10.5px} .soc-av .pm{width:15px;height:15px}
        .soc-stats{gap:10px;font-size:11.5px} .soc-stats span:nth-child(3){display:none}
        .soc .soc-med .soc-x{top:8px;left:8px;height:22px;font-size:11px;padding:0 8px 0 6px} .soc .soc-med .soc-x span{display:none}
        .soc .soc-med .soc-tr{top:8px;right:8px}
        .soc .soc-pickbar{padding:0 10px 10px}
        .soc .soc-med .cv,.soc .soc-med .snd,.soc-view .vdots button,.soc-view .vsl,.soc-view .vcopy,.soc-view .vlink,.mkx .bk,.soc-split>button{min-height:0}
        .soc .soc-tbl table,.soc .soc-tbl thead,.soc .soc-tbl tbody,.soc .soc-tbl tr,.soc .soc-tbl td{display:block}
        .soc .soc-tbl thead{display:none} .soc .soc-tbl td{border:0;padding:3px 14px} .soc .soc-tbl tr{padding:10px 0;border-bottom:1px solid var(--line)} .soc .soc-tbl td.r{text-align:left;padding-top:8px}
        .soc-m .three{grid-template-columns:1fr}
        .soc-view{grid-template-columns:1fr;grid-template-rows:minmax(0,56vh) minmax(0,1fr);background:var(--surface)}
        .soc-view .vstage{padding:0;background:#000}
        .soc-view .vmed,.soc-view .vmed.sq{max-height:none;height:100%;border-radius:0;aspect-ratio:auto;width:100%}
        .soc-view .vx{top:calc(10px + env(safe-area-inset-top,0px));left:10px;width:36px;height:36px} .soc-view .vprev,.soc-view .vnext,.soc-view .vcount{display:none}
        .soc-view .vcol{border-left:0;min-height:0} .soc-view .vbody{padding:16px 16px 150px}
        .soc-view .vbar{position:fixed;left:0;right:0;bottom:0;z-index:2}
        .soc-view .vgrid{grid-template-columns:repeat(2,minmax(0,1fr));row-gap:10px}
        .soc-tagpick{position:fixed;left:12px;right:12px;bottom:calc(120px + env(safe-area-inset-bottom,0px))}
        .mkx .mode{grid-template-columns:1fr}
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
    const body = !fol.length ? emptyState() : !list.length ? empty() : `<div class="soc-grid">${list.slice(0, 240).map(p => card(p)).join('')}</div>`;
    /* Our strategy first (2026-10-21, Cole: "it should be what we make this week, not a scrape feed"): the week's plan,
       then the few posts worth making ours, then everything the brand watches. Saved keeps its own simple layout. */
    const strat = !saved() && fol.length;
    const picks = strat ? posts.filter(p => okRatio(p) && p.ratio >= 3 && !p.idea_id && (!p.posted_at || (Date.now() - Date.parse(p.posted_at)) / 864e5 <= 14)).sort((a, b) => b.ratio - a.ratio).slice(0, 4) : [];
    const top = strat ? `<section class="soc-plan sk" id="socPlan" aria-label="This week"></section>
      ${picks.length ? `<div class="soc-sh"><h3>Worth making this week</h3><small>${picks.length} post${picks.length === 1 ? '' : 's'} doing 3x or more what the account usually gets</small></div>
      <p class="soc-lead">${CLI() ? 'Ask the team to make one of these.' : 'Press Make ours: Locus writes the script and caption, puts it on the Week with a Film task, and you schedule it once it is filmed.'}</p>
      <div class="soc-picks" id="socPicks">${picks.map(p => card(p, { pick: true })).join('')}</div>` : ''}
      <div class="soc-sh"><h3>Everything ${esc(brandName())} watches</h3><small>${posts.length} posts from ${fol.length} brands and topics</small></div>
      <p class="soc-lead">Breaking out = far more than that account usually gets. Open any post to watch it, read the caption and make ours.</p>` : '';
    $('#main').innerHTML = `<div class="v2 soc">${head}${top}
      <div class="soc-ctl">${seg}${menus}${search}${filt}<span class="sp"></span>
        ${CLI() ? '' : `<button type="button" class="soc-btn ico q" id="socManage" aria-label="Manage follows" ${U() ? U().tipAttr('Manage follows') : ''}>${ic('settings')}</button><button type="button" class="soc-btn pri" id="socAdd">${ic('plus')} Follow</button>`}</div>
      ${fol.length && !saved() ? statusLine(fol) : ''}${tags}${trend}${body}</div>`;
    wire(list, picks);
    if (strat) loadPlan();
  }
  /* The plan strip: this week's posts against the target, what is in the works, the Week one click away. */
  const PLAN = {};
  async function loadPlan() {
    const el = $('#socPlan'); if (!el) return;
    const act = ST.act;
    let d = PLAN[act];
    if (!d || Date.now() - d.at > 120e3) {
      try {
        const [w, t] = await Promise.all([H.apiAH(`/api/social/week?act=${encodeURIComponent(act)}`, { fresh: true }), H.apiAH(`/api/social/tray?act=${encodeURIComponent(act)}`, { fresh: true }).catch(() => ({ items: [] }))]);
        d = PLAN[act] = { at: Date.now(), w, items: t.items || [] }; TRAY[act] = { at: Date.now(), items: d.items };
      } catch (e) { if (el.isConnected) { el.classList.remove('sk'); el.innerHTML = `<div><span class="k">This week</span><p class="soc-lead" style="margin:6px 0 0">${esc(e.message)}</p></div>`; } return; }
    }
    if (!el.isConnected || ST.act !== act) return;
    const w = d.w, tgt = w.target ?? 5, pl = w.planned || 0;
    const ours = d.items.filter(i => i.src === 'make');
    const toFilm = ours.filter(i => i.organic && i.kind === 'text').length;
    const filmed = ours.filter(i => i.kind !== 'text' && !i.used).length;
    const ready = d.items.filter(i => !i.used && i.kind !== 'text' && i.src !== 'make').length;
    el.classList.remove('sk');
    el.innerHTML = `<div><span class="k">This week</span><div class="big"><b>${pl} of ${tgt}</b><span>posts planned</span></div><div class="bar"><i style="width:${Math.min(100, tgt ? pl / tgt * 100 : 0)}%"></i></div></div>
      <div class="pipe"><div><b>${toFilm}</b><small>of our versions waiting to be filmed</small></div><div><b>${filmed}</b><small>filmed, ready to schedule</small></div><div><b>${ready}</b><small>other posts ready on the tray</small></div></div>
      <div class="acts"><button type="button" class="soc-btn ${pl < tgt ? 'pri' : ''}" id="socWeek">Open the Week</button>${!CLI() && pl < tgt ? '<button type="button" class="soc-btn" id="socFillW">Fill the week</button>' : ''}</div>`;
    el.querySelector('#socWeek').onclick = () => H.show('socialweek');
    const fw = el.querySelector('#socFillW'); if (fw) fw.onclick = () => { window.SOCIAL_FILL = 1; H.show('socialweek'); };
  }
  function emptyState() {
    return `<div class="soc-state"><b>Follow the brands and topics you want to watch</b><p>Type a brand's handle (like @takomogolf) and Locus finds it on Instagram, TikTok and YouTube, then pulls every new post once a day. Instagram and YouTube cost nothing; TikTok and topic searches use ScrapeCreators credits. Or follow a topic (like "golf short game").</p><div class="acts"><button type="button" class="soc-btn pri" id="socAdd2">${ic('plus')} Follow</button></div></div>`;
  }
  /* Small line icons drawn here (the sprite has no speaker, heart or platform marks). currentColor, 1.8 stroke. */
  const sv = (d, s = 14, fill = 'none') => `<svg viewBox="0 0 24 24" width="${s}" height="${s}" fill="${fill}" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
  const G = {
    vol: s => sv('<path d="M11 5 6 9H2v6h4l5 4z"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/><path d="M19 5a10 10 0 0 1 0 14"/>', s),
    mute: s => sv('<path d="M11 5 6 9H2v6h4l5 4z"/><path d="m22 9-6 6"/><path d="m16 9 6 6"/>', s),
    eye: s => sv('<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>', s),
    heart: s => sv('<path d="M19 14c1.5-1.5 3-3.2 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.8 0-3 .5-4.5 2-1.5-1.5-2.7-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4 3 5.5l7 7z"/>', s),
    chat: s => sv('<path d="M21 12a8.5 8.5 0 0 1-12.6 7.4L3 21l1.6-5.4A8.5 8.5 0 1 1 21 12z"/>', s),
    up: s => sv('<path d="m22 7-8.5 8.5-5-5L2 17"/><path d="M16 7h6v6"/>', s),
    l: s => sv('<path d="m15 18-6-6 6-6"/>', s), r: s => sv('<path d="m9 18 6-6-6-6"/>', s), d: s => sv('<path d="m6 9 6 6 6-6"/>', s),
    mark: s => sv('<path d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/>', s),
    ext: s => sv('<path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>', s),
    ig: s => sv('<rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r=".6" fill="currentColor"/>', s),
    tt: s => sv('<path d="M14 3v11.5a3.5 3.5 0 1 1-3.5-3.5"/><path d="M14 3c.5 2.6 2.4 4.4 5 4.6"/>', s),
    yt: s => sv('<rect x="2.5" y="5.5" width="19" height="13" rx="4"/><path d="m10 9.5 5 2.5-5 2.5z" fill="currentColor"/>', s),
  };
  const AVC = ['--c-meta', '--c-tiktok', '--c-email', '--c-google', '--c-amazon', '--c-else'];
  const handleOf = p => p.handle ? `@${p.handle}` : (p.who || 'Unknown');
  /* The account's mark: initials in a tinted circle, the platform in a badge on its corner. */
  function avatar(p, lg) {
    const who = String(p.handle || p.who || '?').replace(/^@/, '');
    const c = AVC[[...who].reduce((a, ch) => (a * 31 + ch.charCodeAt(0)) >>> 0, 3) % AVC.length];
    return `<span class="soc-av ${lg ? 'lg' : ''}" style="--av:var(${c})">${esc(who.slice(0, 2).toUpperCase())}${G[p.plat] ? `<i class="pm" aria-label="${esc(PL[p.plat] || '')}">${G[p.plat](lg ? 11 : 10)}</i>` : ''}</span>`;
  }
  function ratioPill(p, tip = true) {
    if (!okRatio(p) || p.ratio < 1.5) return '';
    const cls = p.ratio >= 10 ? 'hi' : p.ratio >= 3 ? '' : 'lo';
    const t = p.base_kind === 'followers' ? `${k(p.views)} views on an account with ${k(p.base)} followers` : `This one got ${k(p[p.metric])} ${p.metric}. This account usually gets ${k(p.base)} across its last ${p.n || 'few'} posts.`;
    return `<span class="soc-x ${cls}" ${tip && U() ? U().tipAttr(t) : ''}>${G.up(13)}<b>${p.ratio >= 10 ? Math.round(p.ratio) : p.ratio.toFixed(1)}x</b><span>${p.base_kind === 'followers' ? 'its size' : 'usual'}</span></span>`;
  }
  function usualText(p) { return p.base == null ? '' : p.base_kind === 'followers' ? `${k(p.base)} followers` : `usually ${k(p.base)}`; }
  function usualSentence(p) {
    if (p.base == null) return 'Not enough posts from this account yet to say what is usual.';
    if (p.base_kind === 'followers') return `${k(p.views)} views from an account with ${k(p.base)} followers.`;
    return `This account usually gets ${k(p.base)} ${p.metric || 'views'} a post (its last ${p.n || 'few'} posts).`;
  }
  const statI = (icon, n, label) => n == null ? '' : `<span ${U() ? U().tipAttr(label) : ''}>${icon}<b>${k(n)}</b></span>`;
  function card(p, o = {}) {
    const isV = VIDEO.has(p.fmt), isM = MULTI.has(p.fmt);
    const n = isM && p.slides > 1 ? Math.min(p.slides, 20) : 0;
    const f = (ST.data.follows || []).find(x => x.id === p.follow_id);
    const sub = [PL[p.plat], (FM[p.fmt] || 'Post') === PL[p.plat] ? '' : FM[p.fmt] || 'Post', ago(p.posted_at)].filter(Boolean).join(' · ');
    return `<article class="soc-post" data-id="${esc(p.id)}" tabindex="0" role="button" aria-label="${esc(`${FM[p.fmt] || 'Post'} from ${handleOf(p)} on ${PL[p.plat] || ''}`)}">
      <div class="soc-med ${isV ? 'vid' : ''} ${n ? 'car' : ''}" data-med="${esc(p.id)}" data-n="${n}">${p.thumb ? `<img src="${esc(p.thumb)}" alt="" loading="lazy">` : ''}
        ${ratioPill(p)}
        ${isV && p.dur ? `<span class="soc-tr">${dur(p.dur)}</span>` : n ? `<span class="soc-tr" data-cn>1 / ${n}</span>` : ''}
        ${isV ? `<span class="spin"></span><button type="button" class="snd" data-snd="1" aria-label="Turn sound on">${G.mute(16)}</button>` : ''}
        ${n ? `<button type="button" class="cv cprev" data-cv="-1" aria-label="Previous slide" disabled>${G.l(16)}</button><button type="button" class="cv cnext" data-cv="1" aria-label="Next slide">${G.r(16)}</button><span class="cdots">${Array.from({ length: Math.min(n, 8) }, (_, i) => `<i class="${i ? '' : 'on'}"></i>`).join('')}</span>` : ''}</div>
      <div class="soc-meta">
        <div class="soc-id">${avatar(p)}<span class="nm"><b>${esc(handleOf(p))}</b><small>${esc(f && f.kind === 'topic' ? `${sub} · ${f.name}` : sub)}</small></span>${p.saved ? `<span class="svd" ${U() ? U().tipAttr(p.tag ? `Saved: ${p.tag}` : 'Saved') : ''}>${G.mark(15)}</span>` : ''}</div>
        <div class="soc-stats">${statI(G.eye(14), p.views, 'Views')}${statI(G.heart(14), p.likes, 'Likes')}${statI(G.chat(14), p.comments, 'Comments')}${p.idea_id ? '<span class="soc-made">Ours in the works</span>' : ''}</div>
        ${saved() && (p.tag || p.note) ? `<div class="soc-sv">${p.tag ? `<i class="soc-tagdot" style="background:${tagColor(p.tag)}"></i><span>${esc(p.tag)}</span>` : ''}${p.note ? `<span ${U() ? U().tipAttr(esc(p.note)) : ''}>${p.tag ? '· ' : ''}${esc(p.note)}</span>` : ''}</div>` : ''}
      </div>
      ${o.pick && !CLI() ? `<div class="soc-pickbar"><button type="button" class="soc-btn ${p.idea_id ? '' : 'pri'} sm" data-mk="1">${p.idea_id ? 'See our version' : 'Make ours'}</button></div>` : ''}</article>`;
  }
  /* A carousel on a card: arrows, dots and a swipe strip once the slides are in (loaded on first hover, touch or arrow). */
  async function cardSlides(med, p) {
    if (med.querySelector('.cstrip') || med.dataset.loading) return med.querySelector('.cstrip');
    med.dataset.loading = '1';
    const s = await slidesOf(p);
    delete med.dataset.loading;
    if (!med.isConnected || s.length < 2) return null;
    const img = med.querySelector(':scope > img');
    med.insertAdjacentHTML('afterbegin', `<div class="cstrip">${s.map((u, i) => `<img src="${esc(u)}" alt="Slide ${i + 1}" ${i ? 'loading="lazy"' : ''}>`).join('')}</div>`);
    if (img) img.remove();
    const st = med.querySelector('.cstrip'), n = s.length;
    const cn = med.querySelector('[data-cn]'), dots = med.querySelector('.cdots');
    if (dots) dots.innerHTML = Array.from({ length: Math.min(n, 8) }, (_, i) => `<i class="${i ? '' : 'on'}"></i>`).join('');
    const sync = () => {
      const i = Math.round(st.scrollLeft / Math.max(1, st.clientWidth));
      if (cn) cn.textContent = `${i + 1} / ${n}`;
      if (dots) [...dots.children].forEach((d, j) => d.classList.toggle('on', j === Math.min(i, 7)));
      const pv = med.querySelector('.cprev'), nx = med.querySelector('.cnext');
      if (pv) pv.disabled = i <= 0; if (nx) nx.disabled = i >= n - 1;
    };
    st.addEventListener('scroll', () => requestAnimationFrame(sync), { passive: true });
    sync();
    return st;
  }
  function wire(list, picks = []) {
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
      const inPicks = !!el.closest('#socPicks'), lst = inPicks ? picks : list;
      const p = inPicks ? picks.find(x => x.id === el.dataset.id) : find(el.dataset.id);
      if (!p) return;
      const med = el.querySelector('.soc-med');
      el.onclick = e => { if (e.target.closest('.snd,.cv')) return; openPost(p, lst); if (e.target.closest('[data-mk]')) makeStep(p); };
      el.onkeydown = e => { if (e.target !== el) return; if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openPost(p, lst); } };
      if (med && med.classList.contains('vid') && HOVER()) {
        let t; el.onmouseenter = () => { t = setTimeout(() => playIn(med, p), 350); };
        el.onmouseleave = () => { clearTimeout(t); stopIn(med); };
      }
      if (med && med.classList.contains('car')) {
        if (HOVER()) { let t2; el.addEventListener('mouseenter', () => { t2 = setTimeout(() => cardSlides(med, p), 250); }); el.addEventListener('mouseleave', () => clearTimeout(t2)); }
        med.addEventListener('touchstart', () => cardSlides(med, p), { passive: true });
        med.querySelectorAll('[data-cv]').forEach(b => b.onclick = async e => { e.stopPropagation(); const st = await cardSlides(med, p); if (st) st.scrollBy({ left: +b.dataset.cv * st.clientWidth, behavior: 'smooth' }); });
      }
      const snd = el.querySelector('.snd'); if (snd) snd.onclick = e => { e.stopPropagation(); toggleSound(med); };
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
  function toggleSound(med) {
    const muted = med.dataset.muted !== '0';
    const vid = med.querySelector('video'), fr = med.querySelector('iframe');
    if (vid) vid.muted = !muted;
    if (fr && fr.contentWindow) fr.contentWindow.postMessage(JSON.stringify({ event: 'command', func: muted ? 'unMute' : 'mute', args: '' }), '*');
    med.dataset.muted = muted ? '0' : '1';
    const b = med.querySelector('.snd'); if (b) { b.innerHTML = muted ? G.vol(16) : G.mute(16); b.setAttribute('aria-label', muted ? 'Turn sound off' : 'Turn sound on'); }
  }

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

  /* ---------- THE VIEWER: dark, full height, the media in the middle (playing with sound), a column, one bar ---------- */
  let poll = null, V = null;   // V = { list, i, p, el, sl: { n, i, go } }
  function viewerEl() {
    let el = document.getElementById('socView');
    if (el) return el;
    document.body.insertAdjacentHTML('beforeend', `<div id="socView" class="soc-view" role="dialog" aria-label="Post" hidden>
      <div class="vstage"><button type="button" class="vx" aria-label="Close">&#215;</button><span class="vcount"></span><button type="button" class="vprev" aria-label="Previous post">${G.l(20)}</button><button type="button" class="vnext" aria-label="Next post">${G.r(20)}</button><div class="vmed"></div></div>
      <aside class="vcol"><div class="vbody"></div><div class="vbar"></div></aside></div>`);
    el = document.getElementById('socView');
    el.querySelector('.vx').onclick = closePost;
    el.querySelector('.vprev').onclick = () => step(-1);
    el.querySelector('.vnext').onclick = () => step(1);
    el.addEventListener('click', e => { if (e.target === el.querySelector('.vstage')) closePost(); });
    document.addEventListener('keydown', e => {
      if (!V) return;
      const typing = /^(INPUT|TEXTAREA|SELECT)$/.test((e.target && e.target.tagName) || '') || (e.target && e.target.isContentEditable);
      if (e.key === 'Escape') { e.stopPropagation(); closePost(); return; }
      if (typing) return;
      /* Arrows page a carousel's slides first, then move to the next post at either end. */
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        const d = e.key === 'ArrowLeft' ? -1 : 1, s = V.sl;
        if (s && s.n > 1 && s.i + d >= 0 && s.i + d < s.n) { e.preventDefault(); s.go(s.i + d); } else step(d);
        return;
      }
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const p = V.p, kk = e.key.toLowerCase();
      if (kk === 's') { e.preventDefault(); saveToggle(p, p.saved ? null : p.tag, !p.saved); }
      else if (kk === 'm' && !CLI()) { e.preventDefault(); makeStep(p); }
      else if (kk === 'c') { e.preventDefault(); copyText(p.url, 'Link copied.'); }
      else if (kk === 't' && p.transcript == null && VIDEO.has(p.fmt)) { e.preventDefault(); transcript(p); }
    }, true);
    let x0 = null;
    el.addEventListener('touchstart', e => { x0 = e.touches[0].clientX; }, { passive: true });
    el.addEventListener('touchend', e => { if (x0 == null) return; const dx = e.changedTouches[0].clientX - x0; x0 = null; if (Math.abs(dx) > 70 && e.target.closest('.vstage') && !e.target.closest('.vslides')) step(dx < 0 ? 1 : -1); }, { passive: true });
    return el;
  }
  function step(n) { if (!V) return; const j = V.i + n; if (j < 0 || j >= V.list.length) return; openPost(V.list[j], V.list); }
  function closePost() {
    if (!V) return; clearTimeout(poll);
    const el = viewerEl(); el.classList.remove('on', 'making'); el.querySelector('.vmed').innerHTML = '';
    setTimeout(() => { if (!V) el.hidden = true; }, 160);
    document.body.classList.remove('soc-view-on'); V = null;
  }
  async function openPost(p, list) {
    if (!p) return;
    clearTimeout(poll); stopAll();
    const el = viewerEl();
    list = list || (ST.data ? filtered() : [p]);
    V = { list, i: Math.max(0, list.findIndex(x => x.id === p.id)), p, el, sl: null };
    el.hidden = false; el.classList.remove('making'); document.body.classList.add('soc-view-on');
    requestAnimationFrame(() => el.classList.add('on'));
    el.querySelector('.vprev').disabled = V.i <= 0; el.querySelector('.vnext').disabled = V.i >= list.length - 1;
    el.querySelector('.vcount').textContent = list.length > 1 ? `${V.i + 1} of ${list.length}` : '';
    media(p); column(p); bar(p);
  }
  const ytView = embed => `${embed}${embed.includes('?') ? '&' : '?'}autoplay=1&mute=0&controls=1&loop=1&playsinline=1&rel=0&modestbranding=1&enablejsapi=1&playlist=${encodeURIComponent((/embed\/([^?]+)/.exec(embed) || [])[1] || '')}`;
  function media(p) {
    const el = viewerEl(), m = el.querySelector('.vmed');
    const isV = VIDEO.has(p.fmt), isM = MULTI.has(p.fmt);
    m.classList.toggle('sq', !isV);
    m.innerHTML = p.thumb ? `<img src="${esc(p.thumb)}" alt="">` : '';
    /* Video plays WITH sound: opening the post is the click that lets the browser do it. If the browser still says no,
       it plays muted and one "Turn sound on" button sits on top. */
    if (isV) videoOf(p).then(v => {
      if (!V || V.p !== p) return;
      if (v.error) { m.insertAdjacentHTML('beforeend', `<span class="note">${esc(v.error)}</span>`); return; }
      const img = m.querySelector('img'); if (img) img.remove();
      if (v.src) {
        m.insertAdjacentHTML('afterbegin', `<video src="${esc(v.src)}" autoplay loop playsinline controls ${p.thumb ? `poster="${esc(p.thumb)}"` : ''}></video>`);
        const vid = m.querySelector('video'); vid.muted = false; vid.volume = 1;
        vid.play().catch(() => {
          vid.muted = true; vid.play().catch(() => {});
          m.insertAdjacentHTML('beforeend', `<button type="button" class="tapsnd">${G.vol(15)} Turn sound on</button>`);
          const b = m.querySelector('.tapsnd'); b.onclick = () => { vid.muted = false; vid.play().catch(() => {}); b.remove(); };
        });
      } else m.insertAdjacentHTML('afterbegin', `<iframe src="${esc(ytView(v.embed))}" allow="autoplay; encrypted-media; picture-in-picture" allowfullscreen title="Video"></iframe>`);
    });
    if (isM) {
      const n0 = p.slides > 1 ? p.slides : 0;
      if (n0) m.insertAdjacentHTML('beforeend', `<span class="vsn">1 / ${n0}</span>`);
      slidesOf(p).then(s => { if (V && V.p === p && s.length) slidesIn(m, s); });
    }
  }
  /* Every carousel: a snap strip you can swipe, arrows, dots you can click, and the arrow keys (V.sl). */
  function slidesIn(m, s) {
    const n = s.length;
    m.innerHTML = `<div class="vslides">${s.map((u, i) => `<img src="${esc(u)}" alt="Slide ${i + 1}" ${i > 1 ? 'loading="lazy"' : ''}>`).join('')}</div>
      ${n > 1 ? `<button type="button" class="vsl l" aria-label="Previous slide" disabled>${G.l(18)}</button><button type="button" class="vsl r" aria-label="Next slide">${G.r(18)}</button>
      <span class="vsn">1 / ${n}</span><div class="vdots">${s.slice(0, 12).map((_, i) => `<button type="button" class="${i ? '' : 'on'}" data-sl="${i}" aria-label="Slide ${i + 1}"><i></i></button>`).join('')}</div>` : ''}`;
    const sl = m.querySelector('.vslides');
    const S2 = { n, i: 0, go: i => sl.scrollTo({ left: i * sl.clientWidth, behavior: 'smooth' }) };
    if (V) V.sl = S2;
    const sync = () => {
      const i = Math.max(0, Math.min(n - 1, Math.round(sl.scrollLeft / Math.max(1, sl.clientWidth)))); S2.i = i;
      m.querySelectorAll('[data-sl]').forEach(d => d.classList.toggle('on', +d.dataset.sl === i));
      const c = m.querySelector('.vsn'); if (c) c.textContent = `${i + 1} / ${n}`;
      const l = m.querySelector('.vsl.l'), r = m.querySelector('.vsl.r'); if (l) l.disabled = i <= 0; if (r) r.disabled = i >= n - 1;
    };
    sl.addEventListener('scroll', () => requestAnimationFrame(sync), { passive: true });
    const l = m.querySelector('.vsl.l'), r = m.querySelector('.vsl.r');
    if (l) l.onclick = () => S2.go(S2.i - 1); if (r) r.onclick = () => S2.go(S2.i + 1);
    m.querySelectorAll('[data-sl]').forEach(d => d.onclick = () => S2.go(+d.dataset.sl));
  }
  async function slidesOf(p) {
    if (SLIDES[p.id]) return SLIDES[p.id];
    try { const r = await H.apiAH('/api/social/slides', { method: 'POST', body: JSON.stringify({ id: p.id }) }); SLIDES[p.id] = r.slides || []; }
    catch { SLIDES[p.id] = []; }
    return SLIDES[p.id];
  }
  /* The column, top to bottom: who posted it, the facts as chips, how it did against that account, the caption, the
     sound and tags, the transcript, your note. Every section has a small label; nothing else is boxed. */
  function column(p) {
    const el = viewerEl(), b = el.querySelector('.vbody');
    el.classList.remove('making');
    const f = (ST.data && ST.data.follows || []).find(x => x.id === p.follow_id);
    const eng = engOf(p);
    const big = p.views != null ? [k(p.views), 'views'] : p.likes != null ? [k(p.likes), 'likes'] : ['', ''];
    const posted = p.posted_at ? new Date(p.posted_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '';
    const followed = p.handle && (ST.data && ST.data.follows || []).some(x => x.kind === 'brand' && [x.ig, x.tt, x.yt].some(h => h && h.toLowerCase() === p.handle.toLowerCase()));
    const canFollow = !CLI() && p.handle && !followed && (!f || f.kind === 'topic');
    const grid = [['Likes', p.likes], ['Comments', p.comments], [p.shares != null ? 'Shares' : 'Saves', p.shares ?? p.saves]].filter(x => x[1] != null && !(x[0].toLowerCase() === big[1]));
    const long = (p.caption || '').length > 240 || (p.caption || '').split('\n').length > 5;
    b.innerHTML = `<div class="vwho">${avatar(p, true)}<div class="t"><b>${esc(handleOf(p))}</b><small>${esc([p.who && p.who !== p.handle ? p.who : '', p.followers ? `${k(p.followers)} followers` : '', f && f.kind === 'topic' ? `from the topic "${f.name}"` : f ? `you follow ${f.name}` : ''].filter(Boolean).join(' · '))}</small></div>${canFollow ? `<button type="button" class="soc-btn sm" id="svFollow" ${U() ? U().tipAttr(`Follow ${esc(handleOf(p))}: every post it makes, once a day`) : ''}>Follow</button>` : ''}</div>
      <div class="vchips"><span>${G[p.plat] ? G[p.plat](13) : ''}${esc(PL[p.plat] || '')}</span>${(FM[p.fmt] || 'Post') !== PL[p.plat] ? `<span>${esc(FM[p.fmt] || 'Post')}${p.slides > 1 ? `, ${p.slides} slides` : ''}</span>` : ''}${posted ? `<span>${esc(posted)}</span>` : ''}${p.dur ? `<span>${dur(p.dur)}</span>` : ''}</div>
      <section class="vsec"><h5>How it did</h5><div class="vperf"><div class="top"><span class="num"><b>${big[0] || '–'}</b><span>${big[1]}</span></span>${ratioPill(p, false)}</div><p>${esc(usualSentence(p))}</p>
        ${grid.length || eng != null ? `<div class="vgrid">${grid.map(([l, n]) => `<div><small>${l}</small><b>${k(n)}</b></div>`).join('')}${eng != null ? `<div ${U() ? U().tipAttr('Likes and comments per view') : ''}><small>Engagement</small><b>${(eng * 100).toFixed(1)}%</b></div>` : ''}</div>` : ''}</div></section>
      ${p.caption ? `<section class="vsec"><h5>Caption<span class="sp"></span><button type="button" class="vcopy" id="svCopyCap">Copy</button></h5><div class="vcap ${long ? 'clamp' : ''}" id="svCap">${esc(p.caption)}</div>${long ? '<button type="button" class="vlink" id="svMore">Show all</button>' : ''}</section>` : ''}
      ${p.sound || p.hook || p.ftag || p.tag ? `<section class="vsec"><h5>Details</h5><div class="vtags">${p.sound ? `<span>&#9835; ${esc(p.sound)}</span>` : ''}${p.hook ? `<span>Hook: ${esc(p.hook)}</span>` : ''}${p.ftag ? `<span>${esc(p.ftag)}</span>` : ''}${p.tag ? `<span><i class="soc-tagdot" style="background:${tagColor(p.tag)}"></i>${esc(p.tag)}</span>` : ''}</div></section>` : ''}
      ${transcriptHtml(p)}
      ${p.saved ? `<section class="vsec vnote"><h5>Your note</h5><textarea id="svNote" placeholder="Why you saved it, what to take from it" maxlength="600">${esc(p.note || '')}</textarea></section>` : ''}
      <div class="vkeys">Keys: arrows ${MULTI.has(p.fmt) ? 'slides, then posts' : 'next post'} · S save · ${CLI() ? '' : 'M make ours · '}C copy link${VIDEO.has(p.fmt) ? ' · T transcript' : ''}</div>`;
    const on = (id, fn) => { const x = b.querySelector(id); if (x) x.onclick = fn; };
    on('#svTr', () => transcript(p));
    const fb = b.querySelector('#svFollow'); if (fb) fb.onclick = () => followHandle(p.handle, p.plat, fb);
    on('#svCopyCap', () => copyText(p.caption, 'Caption copied.'));
    on('#svCopyTr', () => copyText(p.transcript, 'Transcript copied.'));
    on('#svMore', e => { const c = b.querySelector('#svCap'), x = c.classList.toggle('clamp'); e.currentTarget.textContent = x ? 'Show all' : 'Show less'; });
    const nt = b.querySelector('#svNote');
    if (nt) { let was = p.note || ''; nt.onblur = async () => { const v = nt.value.trim(); if (v === was) return; try { const r = await H.apiAH('/api/social/save', { method: 'POST', body: JSON.stringify({ id: p.id, saved: true, note: v }) }); p.note = r.note || null; was = p.note || ''; toast(v ? 'Note saved.' : 'Note removed.'); } catch (e) { toast(e.message); } }; }
  }
  async function copyText(t, msg) {
    if (!t) { toast('Nothing to copy.'); return; }
    try { await navigator.clipboard.writeText(String(t)); toast(msg || 'Copied.'); }
    catch { const ta = document.createElement('textarea'); ta.value = String(t); document.body.appendChild(ta); ta.select(); try { document.execCommand('copy'); toast(msg || 'Copied.'); } catch { toast('Could not copy.'); } ta.remove(); }
  }
  /* The transcript: fetched once per post (one scraper credit), kept on the post row server side. Video only. */
  function transcriptHtml(p) {
    if (!VIDEO.has(p.fmt)) return '';
    if (p.transcript != null) return p.transcript ? `<section class="vsec"><h5>What they say<span class="sp"></span><button type="button" class="vcopy" id="svCopyTr">Copy</button></h5><div class="vtr">${esc(p.transcript)}</div></section>` : `<div class="vline">${esc(p.transcript_why || 'No speech was found in this post.')}</div>`;
    return `<section class="vsec"><h5>What they say</h5><button type="button" class="soc-btn sm" id="svTr" style="justify-self:start">${ic('file-text')} Read the transcript</button></section>`;
  }
  async function transcript(p) {
    const el = viewerEl(), btn = el.querySelector('#svTr'); if (btn) { btn.disabled = true; btn.textContent = 'Reading…'; }
    try {
      const r = await H.apiAH('/api/social/transcript', { method: 'POST', body: JSON.stringify({ id: p.id }) });
      p.transcript = r.text || ''; p.transcript_why = r.why || '';
      if (V && V.p === p && !el.classList.contains('making')) column(p);
    } catch (e) { toast(e.message); if (btn) { btn.disabled = false; btn.innerHTML = `${ic('file-text')} Read the transcript`; } }
  }
  /* The bar: ONE primary (Make our version), then Save with its tag menu and Open on the platform, side by side. */
  function bar(p) {
    const el = viewerEl(), b = el.querySelector('.vbar');
    b.innerHTML = `${CLI() ? `<button type="button" class="soc-btn pri mk" id="svAsk">Ask the team to make it</button>` : `<button type="button" class="soc-btn pri mk" id="svMake">${p.idea_id ? 'Our version: see where it is' : 'Make our version'}</button>`}
      <div class="row"><span class="soc-split ${p.saved ? 'on' : ''}"><button type="button" id="svSave">${G.mark(15)} ${p.saved ? 'Saved' : 'Save'}</button><button type="button" id="svTag" aria-label="Save with a tag">${G.d(15)}</button></span>
      <a class="soc-btn" href="${esc(p.url)}" target="_blank" rel="noopener">${G.ext(14)} Open on ${esc(PL[p.plat] || 'the site')}</a></div>`;
    const mk = b.querySelector('#svMake'); if (mk) mk.onclick = () => makeStep(p);
    const ask = b.querySelector('#svAsk'); if (ask) ask.onclick = () => { closePost(); H.show('requests'); };
    b.querySelector('#svSave').onclick = () => saveToggle(p, p.saved ? null : p.tag, !p.saved);
    b.querySelector('#svTag').onclick = e => { e.stopPropagation(); tagPicker(b.querySelector('.soc-split'), p); };
  }
  async function saveToggle(p, tag, next) {
    try {
      const r = await H.apiAH('/api/social/save', { method: 'POST', body: JSON.stringify({ id: p.id, saved: next, tag: next ? (tag || null) : null }) });
      p.saved = next; p.tag = r.tag || null;
      if (ST.data) { const m = new Map(); for (const x of ST.data.posts) if (x.saved && x.tag) m.set(x.tag, (m.get(x.tag) || 0) + 1); ST.data.tags = [...m].map(([name, n]) => ({ name, n })).sort((a, b) => a.name.localeCompare(b.name)); }
      if (!next) p.note = null;
      if (V && V.p === p) { bar(p); if (!V.el.classList.contains('making')) column(p); }
      document.querySelectorAll(`.soc-post[data-id="${CSS.escape(p.id)}"] .soc-id`).forEach(c => { const s = c.querySelector('.svd'); if (next && !s) c.insertAdjacentHTML('beforeend', `<span class="svd">${G.mark(15)}</span>`); if (!next && s) s.remove(); if (saved() && !next) c.closest('.soc-post').remove(); });
      toast(next ? (p.tag ? `Saved under ${p.tag}.` : 'Saved.') : 'Removed from Saved.');
    } catch (err) { toast(err.message); }
  }
  function tagPicker(host, p) {
    const old = host.querySelector('.soc-tagpick'); if (old) { old.remove(); return; }
    const tags = (ST.data && ST.data.tags) || [];
    host.insertAdjacentHTML('beforeend', `<div class="soc-tagpick" role="menu">
      <button type="button" data-t="" class="${p.saved && !p.tag ? 'on' : ''}"><i class="soc-tagdot" style="background:var(--muted)"></i>No tag</button>
      ${tags.map(t => `<button type="button" data-t="${esc(t.name)}" class="${p.tag === t.name ? 'on' : ''}"><i class="soc-tagdot" style="background:${tagColor(t.name)}"></i>${esc(t.name)}<small>${t.n}</small></button>`).join('')}
      <div class="new"><input type="text" placeholder="New tag" maxlength="40" aria-label="New tag"><button type="button" class="soc-btn sm" data-new="1">Add</button></div></div>`);
    const pk = host.querySelector('.soc-tagpick');
    const off = e => { if (!pk.contains(e.target)) { pk.remove(); document.removeEventListener('click', off, true); } };
    setTimeout(() => document.addEventListener('click', off, true), 0);
    const pick = t => { pk.remove(); document.removeEventListener('click', off, true); saveToggle(p, t || null, true); };
    pk.querySelectorAll('[data-t]').forEach(b => b.onclick = () => pick(b.dataset.t));
    const inp = pk.querySelector('input'); inp.focus();
    const add = () => { const t = inp.value.trim(); if (t) pick(t); };
    pk.querySelector('[data-new]').onclick = add; inp.onkeydown = e => { if (e.key === 'Enter') add(); };
  }
  /* ---------- MAKE OUR VERSION (rebuilt 2026-10-21, Cole: "if I see something I like and want to post it, how do I make
     it for us? Does it do everything top to bottom?"). One button, four steps shown as progress:
       1 Write it      Claude watches the post and writes our script (hook, shots, on-screen text) and the caption
       2 On the Week   it lands on the Week's Ready tray with a Film task for Ravo (make.js exit 'organic', automatic)
       3 Film it       the clip is uploaded (here or on the Week); the Film task closes itself
       4 Schedule it   the Week opens with the clip and caption in a new post at the next free hour
     A person still films: Claude never posts someone else's footage. The other doors (Creators, Ad brief, Studio) sit
     under the draft. Engine: account-health make.js (/api/make, /api/make/redo, /api/make/exit), the tray
     (/api/social/tray), the upload (/api/social/upload?idea=). ---------- */
  const STEPS = ['Write it', 'On the Week', 'Film it', 'Schedule it'];
  const TRAY = {};   // act -> { at, items }
  async function trayItem(id, fresh) {
    const t = TRAY[ST.act];
    if (fresh || !t || Date.now() - t.at > 60e3) { try { const r = await H.apiAH(`/api/social/tray?act=${encodeURIComponent(ST.act)}`, { fresh: true }); TRAY[ST.act] = { at: Date.now(), items: r.items || [] }; } catch { TRAY[ST.act] = { at: Date.now(), items: [] }; } }
    return (TRAY[ST.act].items || []).find(x => x.ref === `idea:${id}`) || null;
  }
  const stepsHtml = at => `<ol class="steps">${STEPS.map((s, i) => `<li class="${i < at ? 'done' : i === at ? 'cur' : ''}"><i></i>${i < at ? '&#10003; ' : ''}${esc(s)}</li>`).join('')}</ol>`;
  const dueWord = d => d ? new Date(`${d}T12:00:00`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }) : '';
  function makeStep(p) {
    const el = viewerEl(), b = el.querySelector('.vbody');
    el.classList.add('making'); clearTimeout(poll);
    const shell = (at, inner) => {
      if (!V || V.p !== p) return null;
      b.innerHTML = `<div class="mkx"><button type="button" class="bk" id="mkBack">&#8249; Back to the post</button><h3>Make our version</h3>${stepsHtml(at)}${inner}</div>`;
      b.scrollTop = 0; b.querySelector('#mkBack').onclick = () => { clearTimeout(poll); column(p); };
      return b.querySelector('.mkx');
    };
    if (!p.idea_id) return intro(p, shell);
    shell(0, '<div class="wk"><i></i>Reading where it is</div>');
    H.apiAH(`/api/make?id=${encodeURIComponent(p.idea_id)}`, { fresh: true }).then(r => mkShow(p, r.state, shell, 0)).catch(e => shell(0, `<p class="err">${esc(e.message)}</p>`));
  }
  function intro(p, shell) {
    const bn = esc(brandName());
    const x = shell(0, `<div class="what"><ol>
        <li><span><b>The script</b><span>Claude watches this post and writes ${bn}'s version: the hook, each shot, the words on screen. Our product, never their footage.</span></span></li>
        <li><span><b>The caption</b><span>Written in ${bn}'s voice, ready to paste.</span></span></li>
        <li><span><b>A spot on the Week</b><span>It goes on the Ready tray with a Film task for Ravo, due in 5 days.</span></span></li>
        <li><span><b>Then you schedule it</b><span>Once the clip is uploaded, one button opens the Week with the post filled in.</span></span></li></ol>
        <small>About 25 cents, about a minute. Nothing is posted until you schedule it.</small></div>
      <div class="mode" role="radiogroup" aria-label="How close to the original">
        <label class="${p.mk_mode !== 'recreate' ? 'on' : ''}"><input type="radio" name="mkMode" value="remix" ${p.mk_mode !== 'recreate' ? 'checked' : ''}><b>Our own take</b><small>Keep the idea, tell it our way</small></label>
        <label class="${p.mk_mode === 'recreate' ? 'on' : ''}"><input type="radio" name="mkMode" value="recreate" ${p.mk_mode === 'recreate' ? 'checked' : ''}><b>Recreate it</b><small>Same hook, beats and pacing; our product and words</small></label></div>
      <textarea id="mkNote" rows="2" placeholder="Steer it (optional): use the Carver wedge, keep the POV hook, film it on the range" maxlength="400"></textarea>
      <button type="button" class="soc-btn pri go" id="mkGo">Write it and put it on the Week</button><span class="err" id="mkErr"></span>`);
    if (!x) return;
    x.querySelectorAll('.mode input').forEach(r => r.onchange = () => { p.mk_mode = r.value; x.querySelectorAll('.mode label').forEach(l => l.classList.toggle('on', l.contains(r))); });
    x.querySelector('#mkGo').onclick = async () => {
      const g = x.querySelector('#mkGo'); g.disabled = true; g.textContent = 'Starting…';
      const steer = p.mk_mode === 'recreate' ? 'RECREATE IT: keep the exact structure of this post (same hook shape, same beat order, same length and pacing, same on-screen text style); change only the product, the setting and the words to fit the brand.' : '';
      const label = `${FMT_WORD[p.fmt] || 'post'} from ${handleOf(p)} on ${PL[p.plat] || p.plat}`;
      const stats = [p.views != null ? `${Number(p.views).toLocaleString('en-US')} views` : null, p.likes != null ? `${Number(p.likes).toLocaleString('en-US')} likes` : null].filter(Boolean).join(', ');
      const note = [steer, `Make our version of this ${label}${stats ? ` (${stats})` : ''}.`, x.querySelector('#mkNote').value.trim()].filter(Boolean).join(' ');
      try {
        const r = await H.apiAH('/api/make', { method: 'POST', body: JSON.stringify({ act: ST.act, url: p.url, image: p.thumb || undefined, note, exit: 'organic', post: p.id, slack: false }) });
        p.idea_id = r.id; p.saved = true; p._auto = true; bar(p); markCard(p);
        mkShow(p, r.state || { status: 'queued' }, shell, 0);
      } catch (e) { x.querySelector('#mkErr').textContent = e.message; g.disabled = false; g.textContent = 'Write it and put it on the Week'; }
    };
  }
  function markCard(p) {
    document.querySelectorAll(`.soc-post[data-id="${CSS.escape(p.id)}"]`).forEach(c => {
      const s = c.querySelector('.soc-stats'); if (s && !s.querySelector('.soc-made')) s.insertAdjacentHTML('beforeend', '<span class="soc-made">Ours in the works</span>');
      const mk = c.querySelector('[data-mk]'); if (mk) { mk.textContent = 'See our version'; mk.classList.remove('pri'); }
    });
  }
  const again = (p, shell, tries) => { clearTimeout(poll); poll = setTimeout(() => { if (!V || V.p !== p) return; H.apiAH(`/api/make?id=${encodeURIComponent(p.idea_id)}`, { fresh: true }).then(r => mkShow(p, r.state, shell, tries + 1)).catch(() => again(p, shell, tries + 1)); }, 3000); };
  async function mkShow(p, s, shell, tries) {
    clearTimeout(poll);
    if (!V || V.p !== p) return;
    if (!s) { shell(0, '<p class="vline">That draft is no longer stored.</p>'); return; }
    if (['queued', 'working'].includes(s.status)) {
      shell(0, `<div class="now"><div class="wk"><i></i><b>${s.status === 'queued' ? 'Starting' : 'Writing our version'}</b></div><p>Claude is watching the post and writing ${esc(brandName())}'s script and caption. About a minute; this updates on its own. You can close it and come back.</p></div>`);
      if (tries < 80) again(p, shell, tries);
      return;
    }
    if (s.status === 'failed') {
      const x = shell(0, `<div class="now"><b>It did not finish</b><p>${esc(s.error || 'The draft did not finish.')}</p><div class="row"><button type="button" class="soc-btn pri" id="mkRetry">Try again</button></div><span class="err" id="mkErr"></span></div>`);
      if (x) x.querySelector('#mkRetry').onclick = async e => { e.target.disabled = true; try { await H.apiAH('/api/make/redo', { method: 'POST', body: JSON.stringify({ id: p.idea_id }) }); mkShow(p, { status: 'queued' }, shell, 0); } catch (err) { x.querySelector('#mkErr').textContent = err.message; e.target.disabled = false; } };
      return;
    }
    const sent = s.sent || {};
    const asking = s.status === 'questions' && (s.questions || []).length;
    const org = sent.organic;
    /* The draft is ready: put it on the Week at once when this session started it (the button said so). */
    if (!asking && !org && p._auto) {
      p._auto = false;
      shell(1, `<div class="now"><div class="wk"><i></i><b>Putting it on the Week</b></div><p>The script is written. Adding it to the Ready tray and making the Film task.</p></div>`);
      try { const r = await H.apiAH('/api/make/exit', { method: 'POST', body: JSON.stringify({ id: p.idea_id, exit: 'organic' }) }); delete TRAY[ST.act]; return mkShow(p, r.state || s, shell, 0); }
      catch (e) { toast(e.message); }
    }
    const it = org ? await trayItem(p.idea_id, tries === 0) : null;
    if (!V || V.p !== p) return;
    const filmed = !!(it && it.kind && it.kind !== 'text');
    const at = asking ? 0 : !org ? 1 : !filmed ? 2 : it.used ? 4 : 3;
    let now = '';
    if (asking) now = `<div class="ask"><b>Claude needs an answer first</b><p>${esc(s.questions.join(' '))}</p><textarea id="mkAns" rows="2" placeholder="Answer here"></textarea><button type="button" class="soc-btn pri" id="mkAnsGo">Answer and write it</button></div>`;
    else if (!org) now = `<div class="now"><b>The script is ready</b><p>Put it on the Week: it goes on the Ready tray with a Film task for Ravo.</p><div class="row"><button type="button" class="soc-btn pri" data-exit="organic">Put it on the Week</button></div></div>`;
    else if (!filmed) now = `<div class="now"><b>Next: film it</b><p>${esc(org.owner || 'Ravo')} has a Film task${org.due ? ` due ${esc(dueWord(org.due))}` : ''}${org.url ? ` (<a href="${esc(org.url)}" target="_blank" rel="noopener">open it</a>)` : ''}. Upload the clip here or on the Week; the task closes itself.</p>
      <div class="row"><button type="button" class="soc-btn pri" id="mkUp">Upload the film</button><button type="button" class="soc-btn" data-week="1">Open the Week</button></div><input type="file" id="mkFile" hidden accept="video/mp4,video/quicktime,image/jpeg,image/png,image/webp"></div>`;
    else if (!it.used) now = `<div class="now"><b>Filmed. Schedule it</b><p>The clip is in. The Week opens with a new post at the next free hour: the clip and this caption filled in, Instagram and Facebook on.</p><div class="row"><button type="button" class="soc-btn pri" data-sched="1">Schedule it on the Week</button></div></div>`;
    else now = `<div class="now"><span class="ok">&#10003; On the Week</span><p>It is scheduled. The Week shows when it goes out and, after, how it did.</p><div class="row"><button type="button" class="soc-btn" data-week="1">Open the Week</button></div></div>`;
    const sc = s.script || {};
    const beats = [...(sc.openers || []).slice(0, 2).map((x, i) => [i ? 'Or open' : 'Hook', x, true]), ...(sc.shots || []).map(x => [x.label || 'Shot', x.text || x, false])];
    const lines = s.studio && !beats.length ? (s.studio.lines || []).map((x, i) => [`Ad ${i + 1}`, typeof x === 'string' ? x : x.text, false]) : [];
    const doneDoors = Object.keys(sent).filter(k2 => k2 !== 'organic').map(k2 => ({ creator_link: 'the creator board', lucky_creators: 'the Lucky creator app', asana_brief: 'an ad brief', studio: 'Studio' })[k2] || k2);
    const x = shell(at, `${now}
      <details ${at <= 2 ? 'open' : ''}><summary>The script and caption<small>${esc(sc.title || '')}</small></summary><div style="display:grid;gap:12px">
        ${s.take ? `<p class="vline" style="margin:0">${esc(s.take)}</p>` : ''}
        ${beats.length || lines.length ? `<div class="beats">${[...beats, ...lines].map(([l, t, hk]) => `<div class="beat ${hk ? 'hk' : ''}"><i>${esc(l)}</i><span>${esc(t)}</span></div>`).join('')}</div>` : ''}
        ${sc.on_screen ? `<div class="kv"><b>On screen</b><span>${esc(sc.on_screen)}</span></div>` : ''}
        ${s.caption ? `<div class="kv"><b>Caption <button type="button" class="vcopy" id="mkCopyCap">Copy</button></b><span style="white-space:pre-wrap">${esc(s.caption)}</span></div>` : ''}
        <div style="display:flex;gap:8px"><input type="text" id="mkSteer" placeholder="Not quite right? Say what to change" maxlength="400" style="flex:1"><button type="button" class="soc-btn" id="mkRedo">Redo</button></div>
      </div></details>
      ${CLI() ? '' : `<div class="alt">Also send it to ${['creators', 'brief', 'studio'].map(k2 => `<button type="button" class="soc-btn sm q" data-exit="${k2}">${({ creators: 'Creators', brief: 'Ad brief', studio: 'Studio' })[k2]}</button>`).join('')}</div>`}
      ${doneDoors.length ? `<p class="vline" style="margin:0">Also sent to ${esc(doneDoors.join(', '))}.</p>` : ''}
      <span class="err" id="mkErr"></span>`);
    if (!x) return;
    const err = x.querySelector('#mkErr');
    const cc = x.querySelector('#mkCopyCap'); if (cc) cc.onclick = () => copyText(s.caption, 'Caption copied.');
    const redo = async extra => {
      const note = [extra || '', x.querySelector('#mkSteer') ? x.querySelector('#mkSteer').value.trim() : ''].filter(Boolean).join(' ');
      try { await H.apiAH('/api/make/redo', { method: 'POST', body: JSON.stringify({ id: p.idea_id, note }) }); mkShow(p, { status: 'queued' }, shell, 0); }
      catch (e) { err.textContent = e.message; }
    };
    x.querySelector('#mkRedo').onclick = () => redo();
    x.querySelector('#mkSteer').onkeydown = e => { if (e.key === 'Enter') redo(); };
    const ag = x.querySelector('#mkAnsGo'); if (ag) ag.onclick = () => { const a = x.querySelector('#mkAns').value.trim(); if (!a) { err.textContent = 'Answer the question first.'; return; } p._auto = true; redo(a); };
    x.querySelectorAll('[data-exit]').forEach(btn => btn.onclick = async () => {
      const ex = btn.dataset.exit; btn.disabled = true; const was = btn.textContent; btn.textContent = 'Sending…';
      try {
        const r = await H.apiAH('/api/make/exit', { method: 'POST', body: JSON.stringify({ id: p.idea_id, exit: ex }) });
        if (r.text) toast(r.text);
        if (ex === 'organic') delete TRAY[ST.act];
        mkShow(p, r.state || s, shell, 0);
      } catch (e) { err.textContent = e.message; btn.disabled = false; btn.textContent = was; }
    });
    x.querySelectorAll('[data-week]').forEach(btn => btn.onclick = () => { closePost(); H.show('socialweek'); });
    const sch = x.querySelector('[data-sched]'); if (sch) sch.onclick = () => { window.SOCIAL_COMPOSE = `idea:${p.idea_id}`; closePost(); H.show('socialweek'); };
    const up = x.querySelector('#mkUp'), fi = x.querySelector('#mkFile');
    if (up && fi) { up.onclick = () => fi.click(); fi.onchange = async () => {
      const f = fi.files[0]; if (!f) return;
      if (f.size > 95 * 1024 * 1024) { err.textContent = 'Files up to 95 MB.'; return; }
      up.disabled = true; up.textContent = 'Uploading…';
      try {
        const res = await fetch(`${H.AH_URL}/api/social/upload?act=${encodeURIComponent(ST.act)}&name=${encodeURIComponent(f.name)}&idea=${encodeURIComponent(p.idea_id)}`, { method: 'POST', headers: { Authorization: 'Bearer ' + H.S.tok, 'Content-Type': f.type || 'application/octet-stream' }, body: f });
        const j = await res.json().catch(() => ({})); if (!res.ok) throw new Error(j.error || `HTTP ${res.status}`);
        toast('Film uploaded. The Film task is closed.'); delete TRAY[ST.act];
        mkShow(p, s, shell, 0);
      } catch (e) { err.textContent = e.message; up.disabled = false; up.textContent = 'Upload the film'; }
    }; }
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

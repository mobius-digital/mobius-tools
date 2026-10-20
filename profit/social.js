/* LOCUS SOCIAL: WATCH (rebuilt 2026-10-20 after Cole's review; first built 2026-10-19). Research it follows:
 * docs/locus-social/proposal.html and docs/locus-social/shots (Sandcastles' feed of tall cards with three numbers and a
 * saved vault, Virlo's "usually X, this one Y", Later's calendar).
 *
 * WHO USES IT: a strategist on Monday deciding what to make this week. In order:
 *   1. scan what broke out for the brands and topics this brand follows (the grid, Breaking out first)
 *   2. watch the top few without leaving the grid (a Reel plays in its card on hover or one tap, sound off, a sound toggle)
 *   3. open one to read the caption, every slide of a carousel, and the numbers against what that account usually gets
 *   4. press Make ours (the ideas bot writes a text brief in the brand's Slack channel), then send the draft on
 *   Following brands and topics is set-up work done once, so it has its own Manage view, not dropdowns in the feed.
 *
 * LAYOUT: page head > view tabs (All posts / Breaking out / Saved) with Manage follows and + Follow on the right >
 * one filter bar of labelled selects (Source, Platform, Format, Sort, Window, search, hide paid) > a quiet trending
 * line > the grid. A card: media (4:5), format and slide count, platform, the account, two lines of caption, ONE metric
 * row (ratio, the big number, engagement, "usually X", when). The detail panel (a bottom sheet on phones, V2UI.panel):
 * media, the metric row with "usually" under each number, caption, tags, Make ours with a status that updates.
 * Data: account-health /api/social (worker social.js). CSS tokens only (mobius.css / v2.css), no inline styles that
 * fight phone.css. Never prompt() or alert(). No em dashes. */
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
  const SORTS = [['hot', 'Breaking out first'], ['views', 'Most views'], ['eng', 'Most engagement'], ['new', 'Newest']];
  const WINS = [[0, 'All time'], [7, 'Last 7 days'], [14, 'Last 14 days'], [30, 'Last 30 days']];
  const k = n => { if (n == null) return ''; const a = Math.abs(n); return a >= 1e6 ? `${(n / 1e6).toFixed(a >= 1e7 ? 0 : 1)}M` : a >= 1e3 ? `${(n / 1e3).toFixed(a >= 1e4 ? 0 : 1)}k` : String(Math.round(n)); };
  const ago = s => { if (!s) return ''; const d = (Date.now() - Date.parse(s)) / 864e5; return d < 1 ? 'today' : d < 2 ? 'yesterday' : d < 30 ? `${Math.floor(d)}d ago` : new Date(s).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }); };
  const engOf = p => p.views ? (((p.likes || 0) + (p.comments || 0)) / p.views) : null;
  const ST = { on: [], loaded: false, data: null, act: null, view: store('soc_view') || 'feed', src: '', plat: '', fmt: '', sort: store('soc_sort') || 'hot', win: Number(store('soc_win')) || 0, paid: store('soc_paid') === '1', q: '' };
  const VID = {};        // post id -> { src } | { embed } | { error }
  const SLIDES = {};     // post id -> [urls]

  function css() {
    if (document.getElementById('soccss')) return;
    const st = document.createElement('style'); st.id = 'soccss';
    st.textContent = `
      .soc{--soc-r:10px}
      /* the row under the page head: view tabs on the left, the two actions on the right */
      .soc .soc-row{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin:0 0 12px}
      .soc .soc-row .sp{flex:1}
      .soc .soc-seg{display:inline-flex;gap:2px;background:var(--surface);border:1px solid var(--line);border-radius:8px;padding:2px}
      .soc .soc-seg button{height:30px;padding:0 12px;border-radius:6px;font:inherit;font-size:13px;font-weight:500;cursor:pointer;background:transparent;color:var(--muted);border:1px solid transparent;display:inline-flex;align-items:center;gap:6px;white-space:nowrap}
      .soc .soc-seg button.on{background:var(--surface-2);color:var(--ink);border-color:var(--line-strong)}
      .soc .soc-seg button small{font-weight:500;color:var(--muted);font-variant-numeric:tabular-nums}
      .soc-btn{display:inline-flex;align-items:center;justify-content:center;gap:6px;height:34px;padding:0 13px;border-radius:8px;border:1px solid var(--line-strong);background:var(--surface);font:inherit;font-weight:600;font-size:13px;cursor:pointer;color:var(--ink);white-space:nowrap;text-decoration:none}
      .soc-btn:hover{background:var(--surface-2)} .soc-btn.pri{background:var(--brand);border-color:var(--brand);color:var(--on-brand)} .soc-btn.pri:hover{filter:brightness(1.05)}
      .soc-btn:disabled{opacity:.55;cursor:default} .soc-btn.sm{height:30px;padding:0 10px;font-size:12.5px} .soc-btn.q{border-color:transparent;background:transparent;color:var(--ink-2)} .soc-btn.q:hover{background:var(--surface-2)}
      .soc-btn.bad{color:var(--bad)}
      /* the filter bar: labelled selects that look like every other Locus field */
      .soc .soc-bar{display:flex;gap:8px;align-items:flex-end;flex-wrap:wrap;padding:10px 12px;border:1px solid var(--line);border-radius:var(--soc-r);background:var(--surface);margin:0 0 12px}
      .soc-fld{display:grid;gap:3px;min-width:0}
      .soc-fld > span{font-size:10.5px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:var(--muted);padding-left:1px}
      .soc-sel{position:relative;display:block}
      .soc-sel select{appearance:none;-webkit-appearance:none;width:100%;height:34px;padding:0 28px 0 10px;border:1px solid var(--line-strong);border-radius:8px;background:var(--surface);color:var(--ink);font:inherit;font-size:13px;font-weight:500;cursor:pointer;max-width:260px;text-overflow:ellipsis}
      .soc-sel select:focus-visible{outline:2px solid var(--brand);outline-offset:1px}
      .soc-sel::after{content:"";position:absolute;right:11px;top:50%;width:7px;height:7px;border-right:1.6px solid var(--muted);border-bottom:1.6px solid var(--muted);transform:translateY(-70%) rotate(45deg);pointer-events:none}
      .soc .soc-bar .q{flex:1 1 200px;min-width:160px}
      .soc .soc-bar input[type=search]{width:100%;height:34px;padding:0 10px 0 32px;border-radius:8px;border:1px solid var(--line-strong);background:var(--surface) no-repeat 10px center/14px url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%238E8E9A' stroke-width='2' stroke-linecap='round'%3E%3Ccircle cx='11' cy='11' r='7'/%3E%3Cpath d='m20 20-3.5-3.5'/%3E%3C/svg%3E");color:var(--ink);font:inherit;font-size:13px}
      .soc .soc-bar .sw{display:inline-flex;align-items:center;gap:8px;height:34px;font-size:12.5px;color:var(--ink-2);cursor:pointer;white-space:nowrap;padding:0 2px}
      .soc .soc-bar .n{font-size:12px;color:var(--muted);white-space:nowrap;align-self:center;margin-left:auto;font-variant-numeric:tabular-nums}
      .soc .soc-bar .clr{font:inherit;font-size:12px;color:var(--brand);background:none;border:0;cursor:pointer;padding:0;align-self:center}
      /* a quiet line, not chips */
      .soc .soc-trend{display:flex;gap:4px 14px;flex-wrap:wrap;align-items:baseline;font-size:12.5px;color:var(--muted);margin:0 2px 12px;line-height:1.5}
      .soc .soc-trend .lb{font-weight:600;color:var(--ink-2)}
      .soc .soc-trend button{font:inherit;font-size:12.5px;color:var(--ink-2);background:none;border:0;padding:0;cursor:pointer;text-decoration:underline;text-decoration-color:var(--line-strong);text-underline-offset:3px}
      .soc .soc-trend button:hover,.soc .soc-trend button.on{color:var(--brand);text-decoration-color:var(--brand)}
      .soc .soc-trend button small{color:var(--muted)}
      .soc .soc-note{display:flex;gap:10px;align-items:flex-start;border:1px solid var(--line);border-left:3px solid var(--warn);border-radius:var(--soc-r);padding:10px 14px;font-size:13px;line-height:1.5;margin:0 0 12px;color:var(--ink-2);background:var(--surface)}
      .soc .soc-note b{color:var(--ink)}
      /* the grid and a card */
      .soc .soc-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(210px,1fr));gap:14px}
      .soc .soc-post{border:1px solid var(--line);border-radius:var(--soc-r);overflow:hidden;background:var(--surface);display:flex;flex-direction:column;min-width:0;cursor:pointer;text-align:left;padding:0;font:inherit;color:var(--ink);box-shadow:var(--sh-card,none);transition:border-color .12s,box-shadow .12s}
      .soc .soc-post:hover{border-color:var(--line-strong);box-shadow:var(--sh-lift,0 8px 20px -12px rgba(0,0,0,.35))}
      .soc .soc-post:focus-visible{outline:2px solid var(--brand);outline-offset:2px}
      .soc .soc-med{position:relative;aspect-ratio:4/5;background:var(--surface-2);overflow:hidden}
      .soc .soc-med img,.soc .soc-med video,.soc .soc-med iframe{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;display:block;border:0;background:#000}
      .soc .soc-med iframe{pointer-events:none}
      .soc .soc-med .lb{position:absolute;top:8px;left:8px;display:inline-flex;align-items:center;gap:5px;font-size:10.5px;font-weight:650;letter-spacing:.03em;background:rgba(16,16,20,.72);color:#fff;padding:3px 7px;border-radius:5px;backdrop-filter:blur(4px)}
      .soc .soc-med .pf{position:absolute;top:8px;right:8px;width:22px;height:22px;border-radius:6px;display:inline-flex;align-items:center;justify-content:center;font-size:9.5px;font-weight:800;letter-spacing:.02em;background:rgba(16,16,20,.72);color:#fff;backdrop-filter:blur(4px)}
      .soc .soc-med .sv{position:absolute;top:36px;right:8px;width:22px;height:22px;border-radius:6px;display:inline-flex;align-items:center;justify-content:center;background:rgba(16,16,20,.72);color:#fff}
      .soc .soc-med .play{position:absolute;left:50%;top:50%;width:40px;height:40px;margin:-20px 0 0 -20px;border-radius:50%;background:rgba(16,16,20,.6);color:#fff;display:inline-flex;align-items:center;justify-content:center;pointer-events:none;opacity:.9;backdrop-filter:blur(4px)}
      .soc .soc-med.playing .play,.soc .soc-med.loading .play{display:none}
      .soc .soc-med .dur{position:absolute;bottom:8px;left:8px;font-size:10.5px;font-weight:600;background:rgba(16,16,20,.72);color:#fff;padding:2px 6px;border-radius:5px;font-variant-numeric:tabular-nums}
      .soc .soc-med .snd{position:absolute;bottom:8px;right:8px;width:30px;height:30px;border-radius:50%;border:0;background:rgba(16,16,20,.72);color:#fff;display:none;align-items:center;justify-content:center;cursor:pointer;backdrop-filter:blur(4px)}
      .soc .soc-med.playing .snd{display:inline-flex}
      .soc .soc-med .spin{position:absolute;left:50%;top:50%;width:26px;height:26px;margin:-13px 0 0 -13px;border-radius:50%;border:2.5px solid rgba(255,255,255,.35);border-top-color:#fff;animation:socspin .8s linear infinite;display:none}
      .soc .soc-med.loading .spin{display:block}
      @keyframes socspin{to{transform:rotate(360deg)}}
      .soc .soc-med .hot{position:absolute;bottom:8px;left:8px;font-size:10.5px;font-weight:700;letter-spacing:.03em;background:var(--warn);color:#141416;padding:2px 7px;border-radius:5px}
      .soc .soc-body{padding:10px 12px 12px;display:grid;gap:6px}
      .soc .soc-who{display:flex;gap:6px;align-items:baseline;min-width:0;font-size:13px;font-weight:600}
      .soc .soc-who b{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-weight:600}
      .soc .soc-who small{color:var(--muted);font-weight:500;font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      .soc .soc-cap{font-size:12.5px;line-height:1.4;color:var(--ink-2);display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;min-height:2.8em}
      .soc-mr{display:flex;gap:10px;align-items:center;font-size:12px;color:var(--muted);font-variant-numeric:tabular-nums;white-space:nowrap;overflow:hidden;min-width:0}
      .soc-mr b{color:var(--ink);font-weight:600}
      .soc-mr .us{overflow:hidden;text-overflow:ellipsis}
      .soc-mr .sp{flex:1}
      .soc-x{display:inline-flex;align-items:center;height:18px;padding:0 6px;border-radius:5px;font-size:11.5px;font-weight:700;color:var(--good);background:var(--good-bg)}
      .soc-x.mid{color:var(--warn);background:var(--warn-bg)} .soc-x.lo{color:var(--muted);background:var(--unk-bg)}
      .soc .soc-made{font-size:11.5px;font-weight:600;color:var(--brand);display:inline-flex;gap:5px;align-items:center}
      /* empty, loading, error */
      .soc .soc-state{border:1px dashed var(--line-strong);border-radius:var(--soc-r);padding:40px 20px;text-align:center;display:grid;gap:8px;justify-items:center;background:var(--surface)}
      .soc .soc-state b{font-size:15px} .soc .soc-state p{margin:0;max-width:52ch;color:var(--muted);font-size:13px;line-height:1.5}
      .soc .soc-state .acts{display:flex;gap:8px;flex-wrap:wrap;justify-content:center;margin-top:4px}
      .soc .soc-state.err{border-style:solid;border-color:var(--bad);background:var(--bad-bg)} .soc .soc-state.err b{color:var(--bad)}
      .soc .soc-sk{display:grid;grid-template-columns:repeat(auto-fill,minmax(210px,1fr));gap:14px}
      .soc .soc-sk i{display:block;aspect-ratio:4/6;border-radius:var(--soc-r);background:linear-gradient(90deg,var(--surface-2) 0%,color-mix(in srgb,var(--surface-2) 55%,var(--surface)) 50%,var(--surface-2) 100%);background-size:200% 100%;animation:socshim 1.3s linear infinite}
      @keyframes socshim{to{background-position:-200% 0}}
      /* manage follows */
      .soc .soc-tbl{border:1px solid var(--line);border-radius:var(--soc-r);background:var(--surface);overflow:hidden}
      .soc .soc-tbl table{width:100%;border-collapse:collapse;font-size:13px}
      .soc .soc-tbl th{font-size:10.5px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:var(--muted);text-align:left;padding:10px 14px;border-bottom:1px solid var(--line);white-space:nowrap}
      .soc .soc-tbl td{padding:11px 14px;border-bottom:1px solid var(--line);vertical-align:middle;color:var(--ink)}
      .soc .soc-tbl tr:last-child td{border-bottom:0}
      .soc .soc-tbl td .sub{display:block;font-size:11.5px;color:var(--muted);margin-top:2px}
      .soc .soc-tbl td.r{text-align:right;white-space:nowrap} .soc .soc-tbl td.num{font-variant-numeric:tabular-nums;white-space:nowrap}
      .soc .soc-tbl .acts{display:inline-flex;gap:6px}
      .soc .soc-kind{display:inline-flex;align-items:center;height:20px;padding:0 7px;border-radius:5px;font-size:11px;font-weight:600;background:var(--unk-bg);color:var(--ink-2)}
      .soc .soc-st{display:inline-flex;align-items:center;gap:6px;font-size:12.5px;white-space:nowrap}
      .soc .soc-st i{width:7px;height:7px;border-radius:50%;background:var(--good);flex:none} .soc .soc-st.bad i{background:var(--bad)} .soc .soc-st.wait i{background:var(--muted)}
      .soc .soc-manage-top{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin:0 0 12px}
      .soc .soc-manage-top p{margin:0;color:var(--muted);font-size:13px;flex:1 1 300px}
      /* the detail panel */
      .soc-pn{display:grid;gap:16px}
      .soc-pn.two{grid-template-columns:minmax(0,400px) minmax(0,1fr);gap:24px;align-items:start}
      .soc-pn .left{display:grid;gap:12px;position:sticky;top:0} .soc-pn .right{display:grid;gap:16px;min-width:0}
      .soc-pn .media[hidden]{display:none} .soc-pn .media{border-radius:var(--soc-r);overflow:hidden;background:var(--surface-2);position:relative;display:flex;justify-content:center;align-items:center;min-height:200px}
      .soc-pn .media video,.soc-pn .media img{max-width:100%;max-height:66vh;display:block}
      .soc-pn .media iframe{width:100%;aspect-ratio:9/16;max-height:66vh;border:0}
      .soc-pn.two .media video,.soc-pn.two .media img,.soc-pn.two .media iframe{width:100%;max-height:min(66vh,680px);object-fit:contain}
      .soc-pn .media .snd{position:absolute;bottom:10px;right:10px;width:34px;height:34px;border-radius:50%;border:0;background:rgba(16,16,20,.72);color:#fff;display:inline-flex;align-items:center;justify-content:center;cursor:pointer}
      .soc-pn .soc-strip{display:flex;align-items:flex-start;gap:8px;overflow-x:auto;scroll-snap-type:x mandatory;padding:0 0 6px;scrollbar-width:thin;border-radius:var(--soc-r)}
      .soc-pn .soc-strip img{width:calc(50% - 4px);height:auto;aspect-ratio:4/5;object-fit:cover;border-radius:8px;scroll-snap-align:start;flex:none;background:var(--surface-2);border:1px solid var(--line)}
      .soc-pn .soc-strip-h b{color:var(--ink-2);font-weight:600}
      .soc-pn .soc-strip-h{display:flex;align-items:center;gap:8px;font-size:12.5px;color:var(--muted)}
      .soc-pn .acts{display:flex;gap:8px;flex-wrap:wrap;align-items:center}
      .soc-pn .acts .sp{flex:1}
      .soc-pn .nums{display:grid;grid-template-columns:repeat(auto-fit,minmax(110px,1fr));gap:8px}
      .soc-pn .nums div{border:1px solid var(--line);border-radius:8px;padding:9px 10px;display:grid;gap:2px;min-width:0}
      .soc-pn .nums b{font-size:17px;font-weight:650;font-variant-numeric:tabular-nums;letter-spacing:-.01em;display:flex;align-items:center;gap:6px;flex-wrap:wrap}
      .soc-pn .nums span{font-size:11px;color:var(--muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      .soc-pn .nums span.us{color:var(--ink-2)}
      .soc-pn h4{margin:0;font-size:11px;font-weight:650;letter-spacing:.06em;text-transform:uppercase;color:var(--muted)}
      .soc-pn section{display:grid;gap:8px}
      .soc-pn .capt{font-size:13.5px;line-height:1.55;white-space:pre-wrap;color:var(--ink);max-height:12em;overflow:auto;overflow-wrap:anywhere}
      .soc-pn .meta{font-size:12.5px;color:var(--muted);line-height:1.5}
      .soc-pn .tags{display:flex;gap:6px;flex-wrap:wrap}
      .soc-pn .tags span{font-size:11.5px;font-weight:600;padding:2px 8px;border-radius:5px;background:var(--unk-bg);color:var(--ink-2)}
      .soc-pn .make{border:1px solid var(--line);border-radius:var(--soc-r);padding:14px;display:grid;gap:10px;background:var(--surface)}
      .soc-pn .make .hd{display:flex;align-items:center;gap:10px;flex-wrap:wrap}
      .soc-pn .make .hd b{font-size:14px;font-weight:650}
      .soc-pn .make .hd .sp{flex:1}
      .soc-pn .make p{margin:0;font-size:13px;line-height:1.5;color:var(--ink-2)}
      .soc-pn .make textarea{width:100%;min-height:60px;border:1px solid var(--line-strong);border-radius:8px;background:var(--surface);color:var(--ink);font:inherit;font-size:13px;padding:8px 10px;resize:vertical}
      .soc-pn .make .row{display:flex;gap:8px;flex-wrap:wrap;align-items:center}
      .soc-stat{display:inline-flex;align-items:center;gap:6px;height:22px;padding:0 8px;border-radius:999px;font-size:11.5px;font-weight:600;background:var(--unk-bg);color:var(--ink-2);white-space:nowrap}
      .soc-stat i{width:7px;height:7px;border-radius:50%;background:var(--muted);flex:none}
      .soc-stat.work i{background:var(--brand);animation:socpulse 1.2s ease-in-out infinite} .soc-stat.work{color:var(--brand);background:var(--brand-soft)}
      .soc-stat.ok{color:var(--good);background:var(--good-bg)} .soc-stat.ok i{background:var(--good)}
      .soc-stat.ask{color:var(--warn);background:var(--warn-bg)} .soc-stat.ask i{background:var(--warn)}
      .soc-stat.bad{color:var(--bad);background:var(--bad-bg)} .soc-stat.bad i{background:var(--bad)}
      @keyframes socpulse{50%{opacity:.3}}
      .soc-pn .beats{display:grid;gap:6px}
      .soc-pn .beat{display:grid;grid-template-columns:72px minmax(0,1fr);gap:8px;align-items:start;font-size:13px;background:var(--surface-2);border-radius:7px;padding:8px 10px;line-height:1.45}
      .soc-pn .beat i{font-style:normal;font-size:10.5px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:var(--muted);padding-top:2px}
      .soc-pn .beat.hk{background:var(--warn-bg)} .soc-pn .beat.hk i{color:var(--warn)}
      .soc-pn .sent{font-size:12.5px;color:var(--good);font-weight:600;display:flex;gap:6px;align-items:center}
      .soc-pn .err{color:var(--bad);font-size:12.5px} .soc-pn .err:empty{display:none}
      .soc-pn .steps{display:grid;gap:6px;font-size:12.5px;color:var(--ink-2);line-height:1.5;margin:0;padding-left:18px}
      /* modals */
      .soc-m .fl{display:grid;gap:12px} .soc-m h3{margin:0;font-size:16px;font-weight:650}
      .soc-m label.f{display:grid;gap:5px;font-size:12.5px;font-weight:600;color:var(--ink-2)}
      .soc-m input[type=text]{width:100%;height:36px;padding:0 10px;border-radius:8px;border:1px solid var(--line-strong);background:var(--surface);color:var(--ink);font:inherit;font-weight:400}
      .soc-m .foot{display:flex;gap:8px;justify-content:flex-end} .soc-m .err{color:var(--bad);font-size:12.5px;min-height:1em}
      .soc-m .three{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}
      .soc-m .hint{margin:0;font-size:12.5px;color:var(--muted);line-height:1.5}
      /* settings > Social */
      .soc-set{display:grid;gap:14px}
      .soc-set .onrow{display:flex;align-items:center;gap:12px;flex-wrap:wrap}
      .soc-set .onrow b{font-size:13.5px} .soc-set .onrow small{display:block;color:var(--muted);font-size:12px;margin-top:1px}
      .soc-set .onrow .msg{font-size:12.5px;color:var(--muted);margin-left:auto}
      @media (max-width:720px){
        .soc .soc-grid,.soc .soc-sk{grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}
        .soc .soc-bar{padding:10px}
        .soc .soc-bar .soc-fld{flex:1 1 calc(50% - 8px)} .soc .soc-bar .q{flex:1 1 100%} .soc .soc-bar .n{margin-left:0}
        .soc-sel select{max-width:none;height:40px} .soc .soc-bar input[type=search]{height:40px}
        .soc .soc-row .soc-seg{width:100%} .soc .soc-row .soc-seg button{flex:1;justify-content:center;height:36px}
        .soc .soc-body{padding:8px 9px 10px} .soc .soc-cap{display:none}
        .soc-mr{gap:7px;font-size:11.5px}
        .soc-pn .nums{grid-template-columns:repeat(2,minmax(0,1fr))}
        .soc-m .three{grid-template-columns:1fr}
        .soc .soc-tbl table,.soc .soc-tbl thead,.soc .soc-tbl tbody,.soc .soc-tbl tr,.soc .soc-tbl td{display:block}
        .soc .soc-tbl thead{display:none} .soc .soc-tbl td{border:0;padding:3px 14px} .soc .soc-tbl tr{padding:10px 0;border-bottom:1px solid var(--line)} .soc .soc-tbl td.r{text-align:left;padding-top:8px}
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
        <div><b>Show Social for ${esc(brandNameOf(act))}</b><small>Watch what the brands it follows post, and plan the week of posts.</small></div><span class="msg" id="socOnMsg"></span></div>
      <div id="socConnect"></div></div>`;
    const connect = () => { const c = el.querySelector('#socConnect'); if (!c) return; if (ST.on.includes(act) && window.SocialWeek) window.SocialWeek.connect(c, act, H); else c.innerHTML = ''; };
    connect();
    el.querySelector('#socOn').onclick = async e => {
      const b = e.currentTarget, msg = el.querySelector('#socOnMsg'), next = !b.classList.contains('on');
      b.disabled = true;
      try { await H.apiAH('/api/social/brand', { method: 'PUT', body: JSON.stringify({ act, on: next }) }); await loadBrands(true); rail(act); b.classList.toggle('on', next); b.setAttribute('aria-checked', String(next)); msg.textContent = next ? 'On. Social is in the rail.' : 'Off. Follows and saved posts are kept.'; connect(); }
      catch (err) { msg.textContent = err.message; }
      b.disabled = false;
    };
  }
  function rail(act) { const b = document.getElementById('railSocial'); if (b) b.hidden = !tabOk(act); }
  function brandNameOf(act) { return ((H.S.accounts || []).find(a => a.act_id === act) || {}).name || 'this brand'; }
  function brandName() { return brandNameOf(ST.act); }

  /* ---------- the page ---------- */
  async function render(tab, host, first) {
    H = host; css();
    const act = H.S.act;
    const t = H.RUN();
    const head = H.pageHead('social', 'Social');
    if (!act || act === 'all') { $('#main').innerHTML = `<div class="v2 soc">${head}<div class="soc-state"><b>Pick a brand</b><p>Choose a brand at the top to see what the brands it follows are posting.</p></div></div>`; return; }
    if (first || ST.act !== act) $('#main').innerHTML = `<div class="v2 soc">${head}<div class="soc-sk">${'<i></i>'.repeat(PHONE() ? 4 : 8)}</div></div>`;
    let d;
    try { d = await H.apiAH(`/api/social?act=${encodeURIComponent(act)}`, { fresh: true }); }
    catch (e) {
      if (t !== H.RUN()) return;
      $('#main').innerHTML = `<div class="v2 soc">${head}<div class="soc-state err"><b>Social did not load</b><p>${esc(e.message)}</p><div class="acts"><button type="button" class="soc-btn" id="socRetry">Try again</button></div></div></div>`;
      $('#socRetry').onclick = () => render(tab, host, true);
      return;
    }
    if (t !== H.RUN()) return;
    ST.data = d; ST.act = act;
    if (ST.src && !(d.follows || []).some(f => f.id === ST.src)) ST.src = '';
    draw();
  }
  async function reload() { await render('social', H, false); }

  function filtered() {
    const d = ST.data, posts = d.posts || [];
    let list = ST.view === 'saved' ? posts.filter(p => p.saved || p.idea_id) : ST.view === 'hot' ? posts.filter(p => p.breaking) : posts;
    if (ST.src) list = list.filter(p => p.follow_id === ST.src);
    if (ST.plat) list = list.filter(p => p.plat === ST.plat);
    if (ST.fmt) list = list.filter(p => p.fmt === ST.fmt);
    if (ST.win && ST.view !== 'saved') list = list.filter(p => !p.posted_at || (Date.now() - Date.parse(p.posted_at)) / 864e5 <= ST.win);
    if (ST.paid) list = list.filter(p => { const e = engOf(p); return e == null || e >= 0.005; });
    if (ST.q) { const q = ST.q.toLowerCase(); list = list.filter(p => [p.caption, p.handle, p.who, p.hook, p.ftag, p.sound].some(x => String(x || '').toLowerCase().includes(q))); }
    const vol = p => p.views != null ? p.views : (p.likes || 0);
    const by = { hot: (a, b) => (b.ratio || 0) - (a.ratio || 0) || vol(b) - vol(a), views: (a, b) => vol(b) - vol(a), new: (a, b) => Date.parse(b.posted_at || 0) - Date.parse(a.posted_at || 0), eng: (a, b) => (engOf(b) || 0) - (engOf(a) || 0) };
    return [...list].sort(by[ST.sort] || by.hot);
  }
  function draw() {
    stopAll();
    const d = ST.data, head = H.pageHead('social', 'Social');
    if (!d.on) {
      $('#main').innerHTML = `<div class="v2 soc">${head}<div class="soc-state"><b>Social is off for ${esc(brandName())}</b><p>Switch it on to follow other brands and topics and see what they post.</p>${CLI() ? '' : '<div class="acts"><button type="button" class="soc-btn pri" id="socTurn">Switch it on</button></div>'}</div></div>`;
      const b = $('#socTurn'); if (b) b.onclick = async () => { b.disabled = true; await H.apiAH('/api/social/brand', { method: 'PUT', body: JSON.stringify({ act: ST.act, on: true }) }); await loadBrands(true); rail(ST.act); render('social', H, true); };
      return;
    }
    if (ST.view === 'manage') return drawManage();
    const posts = d.posts || [], fol = d.follows || [];
    const hot = posts.filter(p => p.breaking).length, saved = posts.filter(p => p.saved || p.idea_id).length;
    const list = filtered();
    const narrowed = !!(ST.src || ST.plat || ST.fmt || ST.win || ST.paid || ST.q);
    const fmts = Object.keys(FMP).filter(f => posts.some(p => p.fmt === f) && (!ST.plat || posts.some(p => p.fmt === f && p.plat === ST.plat)));
    const tr = d.trends || { tags: [], sounds: [] };
    const sel = (id, label, opts, val) => `<label class="soc-fld"><span>${label}</span><span class="soc-sel"><select id="${id}" aria-label="${label}">${opts.map(([v, l]) => `<option value="${esc(String(v))}" ${String(val) === String(v) ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></span></label>`;
    const srcOpts = [['', `All followed (${fol.length})`], ...fol.filter(f => f.kind === 'brand').map(f => [f.id, `Brand: ${f.name}`]), ...fol.filter(f => f.kind === 'topic').map(f => [f.id, `Topic: ${f.name}`])];
    const bar = fol.length ? `<div class="soc-bar">
        ${sel('socSrc', 'Source', srcOpts, ST.src)}
        ${sel('socPlat', 'Platform', [['', 'All platforms'], ...Object.entries(PL)], ST.plat)}
        ${sel('socFmt', 'Format', [['', 'All formats'], ...fmts.map(f => [f, FMP[f]])], ST.fmt)}
        ${sel('socSort', 'Sort', SORTS, ST.sort)}
        ${sel('socWin', 'Window', WINS, ST.win)}
        <label class="soc-fld q"><span>Search</span><input type="search" id="socQ" placeholder="Captions, handles, hooks" value="${esc(ST.q)}" autocomplete="off"></label>
        <label class="sw" ${U() ? U().tipAttr('Brand deals and paid posts usually get under 0.5% likes and comments per view. Hiding them leaves what people chose to watch.') : ''}><button type="button" class="v2sw ${ST.paid ? 'on' : ''}" id="socPaid" role="switch" aria-checked="${ST.paid}"><i></i></button>Hide paid-looking</label>
        <span class="n">${list.length} of ${posts.length}</span>${narrowed ? '<button type="button" class="clr" id="socClear">Clear</button>' : ''}</div>` : '';
    const trend = (tr.sounds.length || tr.tags.length) && fol.length ? `<div class="soc-trend"><span class="lb">Doing well lately</span>${tr.sounds.map(s => `<button type="button" data-tag="${esc(s.name)}" class="${ST.q === s.name ? 'on' : ''}" ${U() ? U().tipAttr(`A sound in ${s.posts} post${s.posts === 1 ? '' : 's'} doing better than usual`) : ''}>&#9835; ${esc(s.name)}</button>`).join('')}${tr.tags.map(s => `<button type="button" data-tag="${esc(s.name)}" class="${ST.q === s.name ? 'on' : ''}">${esc(s.name)} <small>${s.posts}</small></button>`).join('')}</div>` : '';
    const body = !fol.length ? emptyState()
      : !list.length ? `<div class="soc-state"><b>${ST.view === 'saved' ? 'Nothing saved yet' : ST.view === 'hot' ? 'Nothing breaking out right now' : posts.length ? 'Nothing matches' : 'No posts yet'}</b><p>${ST.view === 'saved' ? 'Save a post from its panel, or press Make ours, and it stays here.' : ST.view === 'hot' ? 'A post breaks out when it does 3x what that account usually gets. Check All posts meanwhile.' : posts.length ? 'Loosen a filter or clear them all.' : 'The first pull runs when you follow. Open Manage follows to see what came back.'}</p>${narrowed ? '<div class="acts"><button type="button" class="soc-btn" id="socClear2">Clear filters</button></div>' : ''}</div>`
      : `<div class="soc-grid">${list.slice(0, 240).map(card).join('')}</div>`;
    $('#main').innerHTML = `<div class="v2 soc">${head}
      <div class="soc-row"><span class="soc-seg" role="tablist">
          <button type="button" role="tab" data-view="feed" class="${ST.view === 'feed' ? 'on' : ''}">All posts <small>${posts.length}</small></button>
          <button type="button" role="tab" data-view="hot" class="${ST.view === 'hot' ? 'on' : ''}">Breaking out <small>${hot}</small></button>
          <button type="button" role="tab" data-view="saved" class="${ST.view === 'saved' ? 'on' : ''}">Saved <small>${saved}</small></button></span>
        <span class="sp"></span>
        <button type="button" class="soc-btn" id="socManage">${ic('users')} Manage follows${fol.length ? ` <small>${fol.length}</small>` : ''}</button>
        <button type="button" class="soc-btn pri" id="socAdd">${ic('plus')} Follow</button></div>
      ${d.credits != null && d.credits < 1000 && !CLI() ? `<div class="soc-note"><div><b>ScrapeCreators is low: ${Number(d.credits).toLocaleString('en-US')} credits left.</b> ${d.credits < d.low ? 'The daily pull has stopped so the ideas bot keeps the last ones.' : `The daily pull stops at ${d.low}.`} Top it up at <a href="https://app.scrapecreators.com" target="_blank" rel="noopener">scrapecreators.com</a>: $47 buys 25,000, more than a year of this.</div></div>` : ''}
      ${bar}${trend}${body}</div>`;
    wire(list);
  }
  function emptyState() {
    return `<div class="soc-state"><b>Follow the brands you watch</b><p>Type a brand's handle (like @takomogolf) and Locus finds it on Instagram, TikTok and YouTube, then pulls every new post once a day. Or follow a topic (like "golf short game") to see what is breaking out beyond the brands you know.</p><div class="acts"><button type="button" class="soc-btn pri" id="socAdd2">${ic('plus')} Follow a brand or topic</button></div></div>`;
  }
  function ratio(p, tip = true) {
    if (p.ratio == null) return '';
    const cls = p.ratio >= 3 ? '' : p.ratio >= 1.5 ? 'mid' : 'lo';
    const t = p.base_kind === 'followers' ? `${k(p.views)} views on an account with ${k(p.base)} followers` : `This one ${k(p[p.metric])} ${p.metric}, usually ${k(p.base)}`;
    return `<span class="soc-x ${cls}" ${tip && U() ? U().tipAttr(t) : ''}>${p.ratio >= 10 ? Math.round(p.ratio) : p.ratio.toFixed(1)}x</span>`;
  }
  const dur = s => s ? `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}` : '';
  function metricRow(p) {
    const big = p.views != null ? `<b>${k(p.views)}</b> views` : p.likes != null ? `<b>${k(p.likes)}</b> likes` : '';
    const eng = engOf(p);
    const us = p.base == null ? '' : p.base_kind === 'followers' ? `${k(p.base)} followers` : `usually ${k(p.base)}`;
    return `<span class="soc-mr">${ratio(p)}<span>${big}</span>${eng != null ? `<span ${U() ? U().tipAttr('Likes and comments per view') : ''}>${(eng * 100).toFixed(1)}%</span>` : ''}${us ? `<span class="us">${us}</span>` : ''}<span class="sp"></span><span>${ago(p.posted_at)}</span></span>`;
  }
  function card(p) {
    const isV = VIDEO.has(p.fmt), isM = MULTI.has(p.fmt);
    return `<article class="soc-post" data-id="${esc(p.id)}" tabindex="0" role="button" aria-label="${esc(`${FM[p.fmt] || 'Post'} from ${p.who || p.handle}`)}">
      <div class="soc-med ${isV ? 'vid' : ''}" data-med="${esc(p.id)}">${p.thumb ? `<img src="${esc(p.thumb)}" alt="" loading="lazy">` : ''}
        <span class="lb">${esc(FM[p.fmt] || p.fmt || 'Post')}${isM && p.slides ? ` · ${p.slides}` : ''}</span><span class="pf" ${U() ? U().tipAttr(PL[p.plat] || '') : ''}>${PLK[p.plat] || ''}</span>
        ${p.saved ? `<span class="sv" ${U() ? U().tipAttr('Saved') : ''}>${ic('bookmark')}</span>` : ''}
        ${isV ? `<span class="play">${ic('play')}</span><span class="spin"></span><button type="button" class="snd" data-snd="${esc(p.id)}" aria-label="Sound">${ic('mic')}</button>${p.dur ? `<span class="dur">${dur(p.dur)}</span>` : ''}` : ''}
        ${!isV && p.breaking ? '<span class="hot">Breaking out</span>' : ''}</div>
      <div class="soc-body"><span class="soc-who"><b>${esc(p.who || p.handle)}</b>${p.handle && p.who !== p.handle ? `<small>@${esc(p.handle)}</small>` : ''}</span>
        <span class="soc-cap">${esc(p.caption || '')}</span>
        ${metricRow(p)}
        ${p.idea_id ? `<span class="soc-made">${ic('sparkles')} Our version started</span>` : ''}</div></article>`;
  }
  function wire(list) {
    const m = $('#main');
    m.querySelectorAll('[data-view]').forEach(b => b.onclick = () => { ST.view = b.dataset.view; store('soc_view', ST.view); draw(); });
    m.querySelectorAll('[data-tag]').forEach(b => b.onclick = () => { ST.q = ST.q === b.dataset.tag ? '' : b.dataset.tag; if (ST.q && ST.view === 'hot') ST.view = 'feed'; draw(); });
    const bind = (id, fn) => { const e = m.querySelector(id); if (e) e.onchange = () => fn(e.value); };
    bind('#socSrc', v => { ST.src = v; draw(); });
    bind('#socPlat', v => { ST.plat = v; if (ST.fmt && !(ST.data.posts || []).some(p => p.fmt === ST.fmt && (!v || p.plat === v))) ST.fmt = ''; draw(); });
    bind('#socFmt', v => { ST.fmt = v; draw(); });
    bind('#socSort', v => { ST.sort = v; store('soc_sort', v); draw(); });
    bind('#socWin', v => { ST.win = Number(v) || 0; store('soc_win', String(ST.win)); draw(); });
    const paid = m.querySelector('#socPaid'); if (paid) paid.onclick = () => { ST.paid = !ST.paid; store('soc_paid', ST.paid ? '1' : '0'); draw(); };
    const q = m.querySelector('#socQ'); if (q) { let t; q.oninput = () => { clearTimeout(t); t = setTimeout(() => { ST.q = q.value.trim(); draw(); const n = $('#socQ'); if (n) { n.focus(); n.setSelectionRange(n.value.length, n.value.length); } }, 240); }; }
    const clear = () => { ST.q = ''; ST.win = 0; ST.paid = false; ST.src = ''; ST.plat = ''; ST.fmt = ''; store('soc_win', '0'); store('soc_paid', '0'); draw(); };
    ['#socClear', '#socClear2'].forEach(id => { const b = m.querySelector(id); if (b) b.onclick = clear; });
    [m.querySelector('#socAdd'), m.querySelector('#socAdd2')].forEach(b => b && (b.onclick = followModal));
    const mg = m.querySelector('#socManage'); if (mg) mg.onclick = () => { ST.view = 'manage'; draw(); };
    const find = id => list.find(p => p.id === id) || ST.data.posts.find(p => p.id === id);
    m.querySelectorAll('.soc-post').forEach(el => {
      const p = find(el.dataset.id);
      const med = el.querySelector('.soc-med');
      el.onclick = e => { if (e.target.closest('.snd')) return; if (!HOVER() && med && med.classList.contains('vid') && e.target.closest('.soc-med') && !med.classList.contains('playing')) { playIn(med, p); return; } openPost(p); };
      el.onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openPost(p); } };
      if (med && med.classList.contains('vid') && HOVER()) {
        let t; el.onmouseenter = () => { t = setTimeout(() => playIn(med, p), 350); };
        el.onmouseleave = () => { clearTimeout(t); stopIn(med); };
      }
      const snd = el.querySelector('.snd'); if (snd) snd.onclick = e => { e.stopPropagation(); toggleSound(med); };
    });
  }

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
    if (!med.isConnected || v.error) { if (v.error) { const lb = med.querySelector('.lb'); if (lb) lb.textContent = 'Open to watch'; } return; }
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
    const b = med.querySelector('.snd'); if (b) { b.innerHTML = muted ? ic('zap') : ic('mic'); b.setAttribute('aria-label', muted ? 'Mute' : 'Sound on'); }
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
  function followModal() {
    let kind = 'brand';
    const { w, done } = modal(`<div class="fl"><h3>Follow</h3>
      <span class="soc soc-seg" style="justify-self:start"><button type="button" data-k="brand" class="on">A brand</button><button type="button" data-k="topic">A topic</button></span>
      <label class="f"><span id="smL">The brand's handle</span><input type="text" id="smT" maxlength="80" placeholder="@takomogolf" autocomplete="off"></label>
      <p class="hint" id="smH">Locus looks for the same handle on Instagram, TikTok and YouTube. A different handle somewhere? Add it below.</p>
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
    const el = document.createElement('div'); el.className = 'soc-toast';
    el.style.cssText = 'position:fixed;left:50%;bottom:calc(24px + env(safe-area-inset-bottom,0px));transform:translateX(-50%);background:var(--ink);color:var(--surface);padding:10px 14px;border-radius:9px;font-size:13px;z-index:9999;max-width:min(560px,92vw);box-shadow:0 8px 24px -10px rgba(0,0,0,.6)';
    el.textContent = t; document.body.appendChild(el); setTimeout(() => el.remove(), 5200);
  }

  /* ---------- Manage follows: its own view, a table ---------- */
  function drawManage() {
    const head = H.pageHead('social', 'Social');
    const fol = ST.data.follows || [];
    const row = f => {
      const st = f.error ? `<span class="soc-st bad"><i></i>${esc(f.error)}</span>` : !f.pulled_at ? '<span class="soc-st wait"><i></i>Not pulled yet</span>' : `<span class="soc-st"><i></i>Pulled ${esc(ago(f.pulled_at.replace(' ', 'T') + 'Z'))}</span>`;
      return `<tr data-fid="${esc(f.id)}"><td><b>${esc(f.name)}</b><span class="sub">${f.kind === 'topic' ? 'TikTok, Instagram Reels and YouTube search' : ['ig', 'tt', 'yt'].filter(x => f[x]).map(x => `${PL[x]} @${esc(f[x])}`).join(' · ') || 'No handles'}</span></td>
        <td><span class="soc-kind">${f.kind === 'topic' ? 'Topic' : 'Brand'}</span></td><td class="num">${f.posts}</td><td>${st}</td>
        <td class="r"><span class="acts">${f.kind === 'brand' ? `<button type="button" class="soc-btn sm" data-ed="1">Handles</button>` : ''}<button type="button" class="soc-btn sm q bad" data-rm="1">Stop</button></span></td></tr>`;
    };
    $('#main').innerHTML = `<div class="v2 soc">${head}
      <div class="soc-row"><button type="button" class="soc-btn q" id="socBack">&#8249; Back to the feed</button><span class="sp"></span>${CLI() ? '' : '<button type="button" class="soc-btn" id="sfPull">Pull everything now</button>'}<button type="button" class="soc-btn pri" id="sfAdd">${ic('plus')} Follow</button></div>
      <div class="soc-manage-top"><p>${brandName()} follows ${fol.length} ${fol.length === 1 ? 'account or topic' : 'accounts and topics'}. Each one is pulled once a day, about a fifth of a cent per platform. Up to 40.</p></div>
      ${fol.length ? `<div class="soc-tbl"><table><thead><tr><th>Following</th><th>Kind</th><th>Posts</th><th>Last pull</th><th></th></tr></thead><tbody>${fol.map(row).join('')}</tbody></table></div>` : emptyState()}</div>`;
    const m = $('#main');
    m.querySelector('#socBack').onclick = () => { ST.view = store('soc_view') === 'manage' ? 'feed' : (store('soc_view') || 'feed'); if (ST.view === 'manage') ST.view = 'feed'; draw(); };
    [m.querySelector('#sfAdd'), m.querySelector('#socAdd2')].forEach(b => b && (b.onclick = followModal));
    const pull = m.querySelector('#sfPull');
    if (pull) pull.onclick = async () => { pull.disabled = true; pull.textContent = 'Pulling…'; try { const r = await H.apiAH('/api/social/pull', { method: 'POST', body: JSON.stringify({ act: ST.act }) }); toast(`Pulled ${r.pulled.length}: ${r.pulled.reduce((s, x) => s + (x.added || 0), 0)} new posts.`); await reload(); } catch (e) { pull.textContent = e.message; } };
    m.querySelectorAll('[data-fid]').forEach(el => {
      const f = fol.find(x => x.id === el.dataset.fid);
      el.querySelector('[data-rm]').onclick = async () => {
        if (!(await H.confirmModal(`Stop following ${f.name}?`, 'Its posts leave the feed. Saved posts and posts you made into ours stay.', 'Stop following'))) return;
        try { await H.apiAH(`/api/social/follow?id=${encodeURIComponent(f.id)}`, { method: 'DELETE' }); await reload(); } catch (e) { toast(e.message); }
      };
      const ed = el.querySelector('[data-ed]');
      if (ed) ed.onclick = () => {
        const { w, done } = modal(`<div class="fl"><h3>${esc(f.name)}</h3><p class="hint">Leave a box empty to skip that platform.</p>
          <label class="f">Name<input type="text" id="seN" value="${esc(f.name)}"></label>
          <div class="three"><label class="f">Instagram<input type="text" id="seIg" value="${esc(f.ig || '')}"></label><label class="f">TikTok<input type="text" id="seTt" value="${esc(f.tt || '')}"></label><label class="f">YouTube<input type="text" id="seYt" value="${esc(f.yt || '')}"></label></div>
          <div class="err" id="seE"></div><div class="foot"><button type="button" class="soc-btn" data-x="1">Cancel</button><button type="button" class="soc-btn pri" id="seS">Save and pull</button></div></div>`);
        w.querySelector('#seS').onclick = async () => {
          const b = w.querySelector('#seS'); b.disabled = true; b.textContent = 'Pulling…';
          try { const r = await H.apiAH('/api/social/follow', { method: 'PUT', body: JSON.stringify({ id: f.id, name: w.querySelector('#seN').value, ig: w.querySelector('#seIg').value, tt: w.querySelector('#seTt').value, yt: w.querySelector('#seYt').value }) }); done(); toast(`${r.pulled.posts || 0} posts in.${r.pulled.error ? ` ${r.pulled.error}` : ''}`); await reload(); }
          catch (e) { w.querySelector('#seE').textContent = e.message; b.disabled = false; b.textContent = 'Save and pull'; }
        };
      };
    });
  }

  /* ---------- one post: the panel (a bottom sheet on a phone) ---------- */
  const DEST = { creator_link: 'Creator link', asana_brief: 'Brief (Work board)', studio: 'Studio' };
  let poll = null;
  async function openPost(p) {
    if (!p) return;
    clearTimeout(poll); stopAll();
    const isV = VIDEO.has(p.fmt), isM = MULTI.has(p.fmt);
    const eng = engOf(p);
    const usual = p.base == null ? '' : p.base_kind === 'followers' ? `${k(p.base)} followers` : `usually ${k(p.base)}`;
    const nums = [[p.views, 'views', p.metric === 'views' ? usual : ''], [p.likes, 'likes', p.metric === 'likes' ? usual : ''], [p.comments, 'comments', ''], [p.shares ?? p.saves, p.shares != null ? 'shares' : 'saves', '']].filter(x => x[0] != null);
    if (eng != null) nums.push([`${(eng * 100).toFixed(1)}%`, 'engagement', 'likes and comments per view']);
    U().panel.wide = !PHONE();
    const body = U().panel(`${FM[p.fmt] || 'Post'} from ${p.who || p.handle}`, `<div class="soc-pn${PHONE() ? '' : ' two'}"><div class="left">
      <div class="media" id="spMedia">${p.thumb ? `<img src="${esc(p.thumb)}" alt="">` : ''}${isV ? `<button type="button" class="snd" id="spSnd" aria-label="Sound" hidden>${ic('mic')}</button>` : ''}</div>
      ${isM ? `<div class="soc-strip-h" id="spStripH">${p.slides ? `${p.slides} slides` : 'Slides'} · <span>loading every slide…</span></div><div class="soc-strip" id="spStrip" hidden></div>` : ''}</div><div class="right">
      <div class="acts"><a class="soc-btn sm" href="${esc(p.url)}" target="_blank" rel="noopener">${ic('link')} Open on ${esc(PL[p.plat])}</a><button type="button" class="soc-btn sm" id="spSave">${ic('bookmark')} ${p.saved ? 'Saved' : 'Save'}</button><span class="sp"></span>${p.breaking ? '<span class="soc-x">Breaking out</span>' : ''}</div>
      <section><h4>The numbers${p.ratio != null ? ` · ${ratio(p, false)} what this account usually gets` : ''}</h4>
        <div class="nums">${nums.map(([n, l, u]) => `<div><b>${typeof n === 'string' ? n : k(n)}</b><span>${l}</span>${u ? `<span class="us">${esc(u)}</span>` : ''}</div>`).join('')}</div>
        <div class="meta">${FM[p.fmt] === PL[p.plat] ? '' : PL[p.plat] + ' '}${FM[p.fmt] || 'post'}${p.dur ? `, ${dur(p.dur)}` : ''}${p.slides ? `, ${p.slides} slides` : ''}. Posted ${esc(ago(p.posted_at))}.${p.sound ? ` Sound: ${esc(p.sound)}.` : ''}${p.base == null ? ' Not enough posts from this account yet to say what is usual.' : ''}</div></section>
      ${p.hook || p.ftag ? `<section><h4>What it is</h4><div class="tags">${p.hook ? `<span>Hook: ${esc(p.hook)}</span>` : ''}${p.ftag ? `<span>${esc(p.ftag)}</span>` : ''}</div></section>` : ''}
      ${p.caption ? `<section><h4>Caption</h4><div class="capt">${esc(p.caption)}</div></section>` : ''}
      <div id="spMake"></div></div></div>`);
    const media = body.querySelector('#spMedia');
    if (isV) {
      videoOf(p).then(v => {
        if (!media.isConnected) return;
        if (v.error) { media.insertAdjacentHTML('beforeend', `<span class="soc-btn sm" style="position:absolute;left:50%;bottom:12px;transform:translateX(-50%)">${esc(v.error)}</span>`); return; }
        const img = media.querySelector('img'); if (img) img.remove();
        if (v.src) media.insertAdjacentHTML('afterbegin', `<video src="${esc(v.src)}" muted autoplay loop playsinline controls ${p.thumb ? `poster="${esc(p.thumb)}"` : ''}></video>`);
        else media.insertAdjacentHTML('afterbegin', `<iframe src="${esc(ytSrc(v.embed, true))}" allow="autoplay; encrypted-media; picture-in-picture" allowfullscreen title="Video"></iframe>`);
        const snd = body.querySelector('#spSnd'); if (snd) { snd.hidden = !!v.src; media.dataset.muted = '1'; snd.onclick = () => toggleSound(media); }
      });
    }
    if (isM) slidesOf(p).then(s => {
      const h = body.querySelector('#spStripH'), st = body.querySelector('#spStrip'); if (!h || !h.isConnected) return;
      if (!s.length) { h.innerHTML = `${p.slides ? `${p.slides} slides` : 'Slides'} · <span>the other slides are only on ${esc(PL[p.plat])}</span>`; return; }
      h.innerHTML = `<b>${s.length} slides</b> · <span>side by side, scroll for the rest</span>`; st.hidden = false; st.innerHTML = s.map((u, i) => `<img src="${esc(u)}" alt="Slide ${i + 1}" loading="lazy">`).join(''); media.hidden = true;
    });
    body.querySelector('#spSave').onclick = async e => {
      const b = e.currentTarget; const next = !p.saved;
      try { await H.apiAH('/api/social/save', { method: 'POST', body: JSON.stringify({ id: p.id, saved: next }) }); p.saved = next; b.innerHTML = `${ic('bookmark')} ${next ? 'Saved' : 'Save'}`; const c = $(`.soc-post[data-id="${CSS.escape(p.id)}"] .soc-med`); if (c) { const sv = c.querySelector('.sv'); if (next && !sv) c.insertAdjacentHTML('beforeend', `<span class="sv">${ic('bookmark')}</span>`); if (!next && sv) sv.remove(); } }
      catch (err) { toast(err.message); }
    };
    makeBox(body.querySelector('#spMake'), p);
  }
  async function slidesOf(p) {
    if (SLIDES[p.id]) return SLIDES[p.id];
    try { const r = await H.apiAH('/api/social/slides', { method: 'POST', body: JSON.stringify({ id: p.id }) }); SLIDES[p.id] = r.slides || []; }
    catch { SLIDES[p.id] = []; }
    return SLIDES[p.id];
  }

  /* ---------- Make ours: what it does, and a status that updates ---------- */
  const stat = (cls, t) => `<span class="soc-stat ${cls}"><i></i>${esc(t)}</span>`;
  function makeBox(el, p) {
    if (CLI()) { el.innerHTML = '<div class="make"><div class="hd"><b>Make ours</b></div><p>Want our version of this? Save it and tell the Mobius team in Requests.</p></div>'; return; }
    if (!p.idea_id) {
      el.innerHTML = `<div class="make"><div class="hd"><b>Make ours</b><span class="sp"></span>${stat('', 'Not started')}</div>
        <p>Claude watches this post and writes ${esc(brandName())}'s version as a text brief: the angle, the hook, the shots, our product in it, never their footage. The brief lands in the brand's Slack channel; nothing here makes images or video. About 20 to 30 cents.</p>
        <textarea id="smNote" placeholder="Anything to steer it (optional): use the Ice & Gold wedge, keep the POV hook…"></textarea>
        <div class="row"><button type="button" class="soc-btn pri" id="smGo">${ic('sparkles')} Make ours</button><span class="err" id="smErr"></span></div></div>`;
      el.querySelector('#smGo').onclick = async () => {
        const b = el.querySelector('#smGo'); b.disabled = true; b.textContent = 'Starting…';
        try { const r = await H.apiAH('/api/social/make', { method: 'POST', body: JSON.stringify({ id: p.id, note: el.querySelector('#smNote').value }) }); p.idea_id = r.idea_id; p.saved = true; showState(el, p, r.state); const c = $(`.soc-post[data-id="${CSS.escape(p.id)}"] .soc-body`); if (c && !c.querySelector('.soc-made')) c.insertAdjacentHTML('beforeend', `<span class="soc-made">${ic('sparkles')} Our version started</span>`); }
        catch (e) { el.querySelector('#smErr').textContent = e.message; b.disabled = false; b.innerHTML = `${ic('sparkles')} Make ours`; }
      };
      return;
    }
    el.innerHTML = `<div class="make"><div class="hd"><b>Make ours</b><span class="sp"></span>${stat('work', 'Reading the draft')}</div></div>`;
    H.apiAH(`/api/social/idea?id=${encodeURIComponent(p.id)}`, { fresh: true }).then(r => showState(el, p, r.state)).catch(e => { el.innerHTML = `<div class="make"><div class="hd"><b>Make ours</b><span class="sp"></span>${stat('bad', 'Could not read it')}</div><p class="err">${esc(e.message)}</p></div>`; });
  }
  function showState(el, p, s, tries = 0) {
    clearTimeout(poll);
    if (!s) { el.innerHTML = `<div class="make"><div class="hd"><b>Make ours</b><span class="sp"></span>${stat('', 'No draft stored')}</div><p>That draft is no longer stored.</p></div>`; return; }
    const slack = s.link ? `<a href="${esc(s.link)}" target="_blank" rel="noopener">the Slack thread</a>` : 'the brand\'s Slack channel';
    const hd = (cls, t) => `<div class="hd"><b>Make ours</b><span class="sp"></span>${stat(cls, t)}</div>`;
    if (['queued', 'working'].includes(s.status)) {
      el.innerHTML = `<div class="make">${hd('work', s.status === 'queued' ? 'Queued' : 'Writing')}<p>Claude is watching the post and writing our version. About a minute. The brief is also posting in ${slack}; this panel updates on its own.</p></div>`;
      if (tries < 60 && document.body.contains(el)) poll = setTimeout(() => H.apiAH(`/api/social/idea?id=${encodeURIComponent(p.id)}`, { fresh: true }).then(r => showState(el, p, r.state, tries + 1)).catch(() => {}), 5000);
      return;
    }
    if (s.status === 'failed') {
      el.innerHTML = `<div class="make">${hd('bad', 'Did not finish')}<p>The draft did not finish. Try again runs it once more, in ${slack} too.</p><div class="row"><button type="button" class="soc-btn pri" id="smRetry">Try again</button><span class="err" id="smErr"></span></div></div>`;
      el.querySelector('#smRetry').onclick = async e => { e.target.disabled = true; try { const r = await H.apiAH('/api/social/make', { method: 'POST', body: JSON.stringify({ id: p.id }) }); showState(el, p, r.state); } catch (err) { el.querySelector('#smErr').textContent = err.message; e.target.disabled = false; } };
      return;
    }
    const sc = s.script || {};
    const beats = [...(sc.openers || []).slice(0, 2).map((t, i) => [i ? 'Or open' : 'Hook', t, true]), ...(sc.shots || []).map(x => [x.label || 'Shot', x.text, false])];
    const lines = s.studio && !beats.length ? s.studio.lines.map((t, i) => [`Ad ${i + 1}`, t, false]) : [];
    const sent = Object.entries(s.sent || {});
    const asking = (s.questions || []).length && s.status === 'questions';
    el.innerHTML = `<div class="make">${hd(asking ? 'ask' : 'ok', asking ? 'Needs an answer' : sent.length ? 'Sent on' : 'Draft ready')}
      ${sc.title ? `<p><b style="color:var(--ink)">${esc(sc.title)}</b></p>` : ''}
      ${s.take ? `<p>${esc(s.take)}</p>` : ''}
      ${asking ? `<p class="err">It needs an answer first: ${esc(s.questions.join(' '))} Reply in ${slack}.</p>` : ''}
      ${beats.length || lines.length ? `<div class="beats">${[...beats, ...lines].map(([l, t, hk]) => `<div class="beat ${hk ? 'hk' : ''}"><i>${esc(l)}</i><span>${esc(t)}</span></div>`).join('')}</div>` : ''}
      ${sc.on_screen ? `<p>On screen: ${esc(sc.on_screen)}</p>` : ''}
      ${s.pick ? `<p>Suggested next: <b style="color:var(--ink)">${esc(DEST[s.pick === 'lucky_creators' ? 'creator_link' : s.pick] || s.pick)}</b>${s.why ? `. ${esc(s.why)}` : ''}</p>` : ''}
      ${sent.map(([k2, v]) => `<span class="sent">${ic('check')} Sent to ${esc(k2 === 'lucky_creators' ? 'the Lucky creator app' : DEST[k2] || k2)}${v.url ? ` · <a href="${esc(v.url)}" target="_blank" rel="noopener">open</a>` : ''}</span>`).join('')}
      <div class="row">${Object.entries(DEST).filter(([d]) => !(s.sent || {})[d] && !(d === 'creator_link' && (s.sent || {}).lucky_creators)).map(([d, l]) => `<button type="button" class="soc-btn sm ${d === s.pick ? 'pri' : ''}" data-dest="${d}">Send to ${esc(l)}</button>`).join('')}</div>
      <p>The brief is a text draft in ${slack}: change it or ask for a redo there. Sending it on writes the destination's own draft from it.</p><span class="err" id="sdErr"></span></div>`;
    el.querySelectorAll('[data-dest]').forEach(b => b.onclick = async () => {
      b.disabled = true; const was = b.textContent; b.textContent = 'Sending…';
      try { const r = await H.apiAH('/api/social/push', { method: 'POST', body: JSON.stringify({ id: p.id, dest: b.dataset.dest }) }); if (r.text) toast(r.text); showState(el, p, r.state); }
      catch (e) { el.querySelector('#sdErr').textContent = e.message; b.disabled = false; b.textContent = was; }
    });
  }

  window.SocialTab = { render, settings, loadBrands, tabOk, setHost: h => { H = h; } };
})();

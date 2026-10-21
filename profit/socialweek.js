/* LOCUS SOCIAL: THE WEEK (rebuilt 2026-10-20 to the teardown spec, docs/locus-social/teardown/spec.html; first built
 * 2026-10-19). Later's calendar is the page: 28px hours so the working day fits in 450px, the tray a thumbnail grid with
 * an Unused filter and no spend or ROAS, the accounts as avatars in the controls row, a Week / List segment (List = a day
 * list, the only view on a phone), the composer as quiet rows with the accounts as tappable avatars.
 *
 * WHO USES IT: the person filling the brand's week of posts, once a week and whenever something new is ready.
 *   1. see the week at a glance (seven brand-local days by the hour, today marked, past hours hatched)
 *   2. pick something ready from the tray (a LIST with thumbnails: Studio finals, creator clips, winning ads, Make ours
 *      drafts, uploads) and put it on a day and hour (drag, or tap it and pick the time)
 *   3. write one caption, tick the accounts (labelled switches), set the time, Schedule
 *   4. come back for the numbers: a posted card shows views, likes and comments in the same metric row as Watch
 *
 * LAYOUT: page head > week nav + account marks + Post button > tray (left, a list) + grid (right). The post editor is
 * ONE panel (V2UI.panel, a bottom sheet on a phone): media, caption, accounts, time, Schedule. Brand settings > Social
 * (connect) is one table-like card: platform, account, status, mode as a select, Connect / Forget.
 * Data: account-health /api/social/week, /tray, /post, /accounts, /captions, /rephrase (socialpost.js). Tokens never
 * reach this file. CSS tokens only, no inline styles that fight phone.css. Never prompt() or alert(). No em dashes. */
(() => {
  let H = null;
  const $ = s => document.querySelector(s);
  const U = () => window.V2UI;
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const store = (k, v) => { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch {} };
  const CLI = () => !!(H && H.S && (H.S.role === 'client' || H.S.client)) || document.body.classList.contains('is-client');
  const PHONE = () => window.matchMedia('(max-width: 720px)').matches;
  const ic = (n, l) => window.icon ? window.icon(n, { size: 15, label: l }) : '';
  const PL = { ig: 'Instagram', fb: 'Facebook', tt: 'TikTok', yt: 'YouTube' };
  const PK = { ig: 'IG', fb: 'FB', tt: 'TT', yt: 'YT' };
  const SRC = { studio: 'Studio', creator: 'Creator', ad: 'Meta ad', make: 'Make ours', upload: 'Upload', tagged: 'Tagged in' };
  const HOURS = Array.from({ length: 17 }, (_, i) => i + 6);   // 6am to 10pm
  const ROW = 28;
  const SRC_IC = { studio: 'image', creator: 'users', ad: 'megaphone', make: 'sparkles', upload: 'plus', tagged: 'tag' };
  const k = n => { if (n == null) return '–'; const a = Math.abs(n); return a >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : a >= 1e3 ? `${(n / 1e3).toFixed(a >= 1e4 ? 0 : 1)}k` : String(Math.round(n)); };
  const add = (s, n) => { const d = new Date(s + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
  const monday = s => { const d = new Date(s + 'T00:00:00Z'); const w = (d.getUTCDay() + 6) % 7; return add(s, -w); };
  const md = s => new Date(s + 'T12:00:00Z').toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
  const dnum = s => new Date(s + 'T12:00:00Z').toLocaleDateString('en-US', { day: 'numeric', timeZone: 'UTC' });
  const wd = s => new Date(s + 'T12:00:00Z').toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' });
  const h12 = h => (h % 12 || 12) + (h < 12 ? ' am' : ' pm');
  const hm12 = hm => { const [h, m] = hm.split(':').map(Number); return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h < 12 ? 'am' : 'pm'}`; };
  const ST = { act: null, from: null, data: null, tray: null, tf: store('sw_tf') || 'unused', view: store('sw_view') || 'week', loading: false };
  const BOOT_POST = new URLSearchParams(location.search).get('post');   // ?open=socialweek&post=<id> (Slack, the calendar)

  function css() {
    if (document.getElementById('swcss')) return;
    const st = document.createElement('style'); st.id = 'swcss';
    st.textContent = `
      .sw{--sw-r:var(--v5-r,12px)}
      .sw .sw-how{margin:-4px 0 14px;font-size:12.5px;color:var(--muted)} .sw .sw-how b{color:var(--ink-2);font-weight:600}
      .sw .sw-top{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin:0 0 12px;min-height:36px}
      .sw .sw-top .r{margin-left:auto;display:flex;gap:8px;align-items:center;flex-wrap:wrap}
      .sw .sw-plan{font-size:12px;color:var(--muted);border:1px solid var(--line);border-radius:999px;padding:3px 10px;white-space:nowrap} .sw .sw-plan.ok{color:var(--good);border-color:var(--good)}
      .sw-fill .fr{display:grid;grid-template-columns:64px 1fr;gap:12px;border:1px solid var(--line);border-radius:10px;padding:10px;margin:0 0 10px}
      .sw-fill .fr .th{width:64px;height:80px;border-radius:7px;background:var(--surface-2,var(--line)) center/cover no-repeat;position:relative} .sw-fill .fr .th i{position:absolute;left:4px;bottom:4px;font-style:normal;font-size:9px;font-weight:700;background:var(--ink);color:var(--surface);border-radius:4px;padding:1px 4px}
      .sw-fill .fr .ft{display:flex;gap:10px;align-items:baseline;flex-wrap:wrap;margin:0 0 6px} .sw-fill .fr .ft b{font-size:13px}
      .sw-fill .fr textarea{width:100%;box-sizing:border-box;min-height:56px;border:1px solid var(--line);border-radius:8px;background:var(--surface);color:var(--ink);font:inherit;font-size:13px;padding:8px 10px;resize:vertical}
      .sw-fill .fr .fa{display:flex;gap:6px;align-items:center;margin-top:8px;flex-wrap:wrap} .sw-fill .fr .fa .sp{flex:1}
      .sw-fill .fr .acc.sm{padding:2px;border-radius:999px;border:1px solid transparent;background:none;cursor:pointer;opacity:.45} .sw-fill .fr .acc.sm.on{opacity:1;border-color:var(--brand)}
      .sw-fill .foot{display:flex;gap:8px;margin-top:6px}
      .sw .sw-nav{display:inline-flex;align-items:center;gap:2px;background:var(--surface-2);border-radius:var(--r-sm,8px);padding:2px}
      .sw .sw-nav button{height:28px;min-width:28px;padding:0 9px;border:0;border-radius:6px;background:transparent;color:var(--ink-2);font:inherit;font-size:13px;font-weight:500;cursor:pointer}
      .sw .sw-nav button:hover{background:var(--surface);color:var(--ink)}
      .sw .sw-range{font-weight:650;font-size:14px;letter-spacing:-.01em;display:flex;gap:8px;align-items:baseline}
      .sw .sw-range small{font-weight:500;font-size:12px;color:var(--muted)}
      .sw .sw-seg{display:inline-flex;gap:2px;background:var(--surface-2);border-radius:var(--r-sm,8px);padding:2px}
      .sw .sw-seg button{height:28px;padding:0 11px;border-radius:6px;font:inherit;font-size:13px;font-weight:500;cursor:pointer;background:transparent;color:var(--muted);border:0}
      .sw .sw-seg button.on{background:var(--surface);color:var(--ink);box-shadow:0 1px 2px rgba(0,0,0,.12)}
      .sw-btn{display:inline-flex;align-items:center;justify-content:center;gap:6px;height:32px;padding:0 12px;border-radius:var(--r-sm,8px);border:1px solid var(--line-strong);background:var(--surface);font:inherit;font-weight:600;font-size:13px;cursor:pointer;color:var(--ink);white-space:nowrap;text-decoration:none}
      .sw-btn:hover{background:var(--surface-2)} .sw-btn.pri{background:var(--brand);border-color:var(--brand);color:var(--on-brand)} .sw-btn.pri:hover{filter:brightness(1.05)}
      .sw-btn:disabled{opacity:.55;cursor:default} .sw-btn.sm{height:28px;padding:0 10px;font-size:12.5px} .sw-btn.q{border-color:transparent;background:transparent;color:var(--ink-2)} .sw-btn.q:hover{background:var(--surface-2)}
      .sw-btn.bad{color:var(--bad)}
      /* account marks: a small square per platform; dim = not connected, dot = by hand or an error */
      .sw-acc{display:inline-flex;gap:6px;align-items:center}
      .sw-bub{width:28px;height:28px;border-radius:50%;border:1px solid var(--line-strong);background:var(--surface-2) center/cover no-repeat;display:inline-flex;align-items:center;justify-content:center;font-size:9px;font-weight:800;letter-spacing:.02em;color:var(--ink-2);position:relative;flex:none;cursor:default;padding:0;font-family:inherit}
      .sw-bub.on{border-color:var(--brand);box-shadow:0 0 0 2px var(--brand-soft)} .sw-bub.off{opacity:.35;filter:grayscale(1)}
      .sw-bub.sm{width:16px;height:16px;font-size:7px}
      .sw-bub.md{width:40px;height:40px;font-size:11px}
      .sw-bub .pk{position:absolute;right:-4px;bottom:-4px;width:14px;height:14px;border-radius:4px;background:var(--surface);border:1px solid var(--line);font-size:6.5px;font-weight:800;display:inline-flex;align-items:center;justify-content:center;color:var(--ink)}
      .sw-bub.sm .pk{display:none}
      .sw-bub.bad::after,.sw-bub.hand::after{content:"";position:absolute;right:-2px;top:-2px;width:9px;height:9px;border-radius:50%;border:1.5px solid var(--surface)}
      .sw-bub.bad::after{background:var(--bad)} .sw-bub.hand::after{background:var(--warn)}
      button.sw-bub{cursor:pointer}
      .sw .sw-note{display:flex;gap:10px;align-items:center;flex-wrap:wrap;border:1px solid var(--line);border-left:3px solid var(--warn);border-radius:var(--sw-r);padding:10px 14px;font-size:13px;line-height:1.5;margin:0 0 12px;color:var(--ink-2);background:var(--surface)}
      .sw .sw-note b{color:var(--ink)}
      /* body: the tray and the grid */
      .sw .sw-body{display:grid;grid-template-columns:288px minmax(0,1fr);gap:16px;align-items:start}
      .sw .sw-tray{border:1px solid color-mix(in srgb,var(--line) 75%,transparent);border-radius:var(--sw-r);background:var(--surface);box-shadow:var(--v5-sh,none);position:sticky;top:8px;max-height:calc(100vh - 110px);display:flex;flex-direction:column;min-height:0}
      .sw .sw-tray .hd{display:flex;align-items:center;gap:8px;padding:10px 12px;border-bottom:1px solid var(--line)}
      .sw .sw-tray .hd b{font-size:13px;font-weight:650} .sw .sw-tray .hd small{color:var(--muted);font-size:12px}
      .sw .sw-tray .hd .sp{flex:1}
      .sw-sel{position:relative;display:inline-block}
      .sw-sel select{appearance:none;-webkit-appearance:none;height:30px;padding:0 26px 0 9px;border:1px solid var(--line-strong);border-radius:7px;background:var(--surface);color:var(--ink);font:inherit;font-size:12.5px;font-weight:500;cursor:pointer;max-width:200px;text-overflow:ellipsis}
      .sw-sel select:focus-visible{outline:2px solid var(--brand);outline-offset:1px}
      .sw-sel::after{content:"";position:absolute;right:10px;top:50%;width:6px;height:6px;border-right:1.6px solid var(--muted);border-bottom:1.6px solid var(--muted);transform:translateY(-70%) rotate(45deg);pointer-events:none}
      .sw-sel.lg select{height:36px;font-size:13px;max-width:none;width:100%}
      .sw-tl{overflow-y:auto;overflow-x:hidden;min-height:80px;flex:1;padding:6px 8px 10px;display:grid;grid-template-columns:minmax(0,1fr);gap:2px;align-content:start}
      .sw-tl .gh{display:flex;align-items:baseline;gap:6px;padding:10px 6px 4px;font-size:10.5px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:var(--muted)} .sw-tl .gh small{font-size:11px;letter-spacing:0;color:var(--faint,var(--muted))}
      .sw-ti{display:grid;grid-template-columns:44px minmax(0,1fr) auto;gap:10px;align-items:center;padding:6px;border-radius:8px;border:1px solid transparent;background:transparent;cursor:grab;font:inherit;color:var(--ink);text-align:left;min-width:0}
      .sw-ti:hover{background:var(--surface-2);border-color:var(--line)} .sw-ti:active{cursor:grabbing} .sw-ti.used{opacity:.55}
      .sw-ti .th{position:relative;width:44px;height:55px;border-radius:6px;background:var(--surface-2) center/cover no-repeat;display:inline-flex;align-items:center;justify-content:center;color:var(--muted);overflow:hidden}
      .sw-ti .th svg{width:18px;height:18px} .sw-ti .th .kd{position:absolute;right:3px;bottom:3px;font-size:8px;font-style:normal;background:rgba(12,12,16,.7);color:#fff;border-radius:3px;padding:1px 3px;line-height:1.2}
      .sw-ti .tx{display:grid;gap:2px;min-width:0} .sw-ti .tx b{font-size:12.5px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      .sw-ti .tx small{display:flex;gap:5px;align-items:center;font-size:11.5px;color:var(--muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis} .sw-ti .tx small svg{width:12px;height:12px;flex:none}
      .sw-ti .chip{font-size:10.5px;font-weight:600;padding:2px 7px;border-radius:999px;white-space:nowrap} .sw-ti .chip.f{background:var(--warn-bg);color:var(--warn)} .sw-ti .chip.r{background:var(--good-bg);color:var(--good)} .sw-ti .chip.u{background:var(--surface-2);color:var(--muted)}
      /* tray rows: see .sw-ti above */
      .sw .sw-tray .hd .hd-period{position:relative} .sw .sw-tray .hd .hd-per-btn .hd-per-l{display:none} .sw .sw-tray .hd .hd-per-btn .hd-per-d{display:inline;color:var(--ink);font-size:12px;font-weight:600}
      .sw .sw-tray .empty{grid-column:1 / -1}
      .sw .sw-tray .ft{padding:8px 10px;border-top:1px solid var(--line);display:flex;gap:8px;align-items:center}
      .sw .sw-tray .ft small{color:var(--muted);font-size:11.5px;line-height:1.4}
      .sw .sw-tray .empty{padding:24px 12px;text-align:center;color:var(--muted);font-size:12.5px;line-height:1.5}
      /* the grid, Later's density */
      .sw .sw-grid{border:1px solid color-mix(in srgb,var(--line) 75%,transparent);border-radius:var(--sw-r);background:var(--surface);box-shadow:var(--v5-sh,none);overflow:auto;max-height:calc(100vh - 110px);position:relative}
      .sw .sw-gh{display:grid;grid-template-columns:52px repeat(7,minmax(84px,1fr));position:sticky;top:0;background:var(--surface);z-index:3;border-bottom:1px solid var(--line)}
      .sw .sw-gh div{padding:8px 6px 7px;font-size:11px;font-weight:600;color:var(--muted);text-align:center;border-left:1px solid var(--line);text-transform:uppercase;letter-spacing:.05em;display:grid;gap:2px;justify-items:center} .sw .sw-gh div:first-child{border-left:0}
      .sw .sw-gh div b{font-size:16px;font-weight:650;color:var(--ink);letter-spacing:-.01em;width:28px;height:28px;border-radius:50%;display:inline-flex;align-items:center;justify-content:center}
      .sw .sw-gh div.td b{background:var(--brand);color:var(--on-brand)} .sw .sw-gh div.td{color:var(--brand)}
      .sw .sw-gb{display:grid;grid-template-columns:52px repeat(7,minmax(84px,1fr));position:relative}
      .sw .sw-ht{height:${ROW}px;font-size:10px;color:var(--muted);text-align:right;padding:0 8px 0 0;font-variant-numeric:tabular-nums;transform:translateY(-6px);white-space:nowrap}
      .sw .sw-now{position:absolute;left:52px;right:0;height:0;border-top:1.5px solid var(--bad);z-index:3;pointer-events:none} .sw .sw-now::before{content:"";position:absolute;left:-4px;top:-4px;width:7px;height:7px;border-radius:50%;background:var(--bad)}
      .sw .sw-cell{height:${ROW}px;border-top:1px solid var(--line);border-left:1px solid var(--line);position:relative}
      .sw .sw-cell.td{background:color-mix(in srgb,var(--brand) 4%,transparent)} .sw .sw-cell.past{background:repeating-linear-gradient(135deg,transparent 0 6px,color-mix(in srgb,var(--line) 60%,transparent) 6px 7px)}
      .sw .sw-cell.over{background:color-mix(in srgb,var(--brand) 14%,transparent)} .sw .sw-cell:hover:not(.past)::after{content:"+";position:absolute;right:6px;top:3px;color:var(--muted);font-weight:600;font-size:12px}
      .sw-post{position:absolute;left:3px;right:3px;border:1px solid var(--line);border-radius:7px;background:var(--surface);padding:3px;display:grid;grid-template-columns:38px minmax(0,1fr);gap:6px;align-items:center;cursor:pointer;text-align:left;font:inherit;color:var(--ink);box-shadow:var(--sh-card,none);z-index:2;min-height:46px}
      .sw-post:hover{border-color:var(--brand);box-shadow:var(--sh-lift,0 6px 16px -10px rgba(0,0,0,.4))} .sw-post.drag{opacity:.5}
      .sw-post .th{width:38px;height:38px;border-radius:5px;background:var(--surface-2) center/cover no-repeat;border:1px solid var(--line)}
      .sw-post .tm{font-size:11px;font-weight:650;font-variant-numeric:tabular-nums;display:flex;gap:5px;align-items:center;white-space:nowrap;overflow:hidden}
      .sw-post .tm .dot{width:7px;height:7px;border-radius:50%;background:var(--muted);flex:none}
      .sw-post .st{display:flex;gap:3px;align-items:center;margin-top:3px}
      .sw-post.auto .dot{background:var(--brand)} .sw-post.posted .dot{background:var(--good)} .sw-post.failed .dot{background:var(--bad)} .sw-post.handoff .dot{background:var(--warn)}
      .sw-post.draft{border-style:dashed}
      /* the day list (Week > List, and every phone) */
      .sw-list{display:grid;gap:12px}
      .sw-day{border:1px solid var(--line);border-radius:var(--sw-r);background:var(--surface);overflow:hidden}
      .sw-day .dh{display:flex;align-items:baseline;gap:8px;padding:9px 12px;border-bottom:1px solid var(--line);font-size:13px;font-weight:650}
      .sw-day .dh small{color:var(--muted);font-weight:500} .sw-day.td .dh b{color:var(--brand)} .sw-day .dh .sp{flex:1}
      .sw-day .dh button{font:inherit;font-size:12.5px;color:var(--brand);background:none;border:0;cursor:pointer;padding:0}
      .sw-dr{display:grid;grid-template-columns:56px minmax(0,1fr) auto;gap:10px;align-items:center;padding:8px 12px;border-top:1px solid var(--line);background:transparent;border-left:0;border-right:0;border-bottom:0;width:100%;text-align:left;font:inherit;color:var(--ink);cursor:pointer;min-height:56px}
      .sw-dr:first-of-type{border-top:0} .sw-dr:hover{background:var(--surface-2)}
      .sw-dr .th{width:56px;height:56px;border-radius:6px;background:var(--surface-2) center/cover no-repeat;border:1px solid var(--line)}
      .sw-dr .cp{font-size:13px;line-height:1.4;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;color:var(--ink)}
      .sw-dr .ln{display:flex;gap:8px;align-items:center;font-size:11.5px;color:var(--muted);margin-top:3px;font-variant-numeric:tabular-nums}
      .sw-dr .ln .dot{width:7px;height:7px;border-radius:50%;background:var(--muted)} .sw-dr.auto .dot{background:var(--brand)} .sw-dr.posted .dot{background:var(--good)} .sw-dr.failed .dot{background:var(--bad)} .sw-dr.handoff .dot{background:var(--warn)}
      .sw-day .none{padding:10px 12px;font-size:12.5px;color:var(--muted);display:flex;gap:8px;align-items:center} .sw-day .none button{font:inherit;font-size:12.5px;color:var(--brand);background:none;border:0;cursor:pointer;padding:0}
      /* states */
      .sw .sw-state{border:1px dashed var(--line-strong);border-radius:var(--sw-r);padding:40px 20px;text-align:center;display:grid;gap:8px;justify-items:center;background:var(--surface)}
      .sw .sw-state b{font-size:15px} .sw .sw-state p{margin:0;max-width:52ch;color:var(--muted);font-size:13px;line-height:1.5}
      .sw .sw-state.err{border-style:solid;border-color:var(--bad);background:var(--bad-bg)} .sw .sw-state.err b{color:var(--bad)}
      .sw .sw-sk{display:grid;grid-template-columns:248px minmax(0,1fr);gap:12px}
      .sw .sw-sk i{display:block;height:60vh;border-radius:var(--sw-r);background:linear-gradient(90deg,var(--surface-2) 0%,color-mix(in srgb,var(--surface-2) 55%,var(--surface)) 50%,var(--surface-2) 100%);background-size:200% 100%;animation:swshim 1.3s linear infinite}
      @keyframes swshim{to{background-position:-200% 0}}
      /* the post editor: one panel */
      .sw-pn{display:grid;gap:18px}
      .sw-pn section{display:grid;gap:8px}
      .sw-pn h4{margin:0;font-size:12.5px;font-weight:600;color:var(--ink-2);display:flex;align-items:center;gap:8px}
      .sw-pn h4 .sp{flex:1} .sw-pn h4 small{font-weight:500;text-transform:none;letter-spacing:0;font-size:12px}
      .sw-pn .med{display:flex;gap:8px;flex-wrap:wrap;align-items:center}
      .sw-pn .med .m{width:88px;height:88px;border-radius:8px;background:var(--surface-2) center/cover no-repeat;position:relative;border:1px solid var(--line)}
      .sw-pn .med .m i{position:absolute;left:4px;bottom:4px;font-size:9px;font-style:normal;font-weight:700;background:rgba(16,16,20,.72);color:#fff;padding:1px 4px;border-radius:3px}
      .sw-pn .med .m button{position:absolute;right:-7px;top:-7px;width:22px;height:22px;border-radius:50%;border:1px solid var(--line-strong);background:var(--surface);font-size:12px;cursor:pointer;color:var(--ink);display:inline-flex;align-items:center;justify-content:center;padding:0}
      .sw-pn .med .add{width:88px;height:88px;border:1px dashed var(--line-strong);border-radius:8px;background:transparent;display:grid;place-items:center;gap:2px;font:inherit;font-size:11px;font-weight:600;color:var(--ink-2);cursor:pointer} .sw-pn .med .add:hover{background:var(--surface-2)}
      .sw-pn .fld{display:grid;gap:4px} .sw-pn .fld > span{font-size:12px;font-weight:600;color:var(--ink-2)}
      .sw-pn input[type=date],.sw-pn input[type=time],.sw-pn input[type=text],.sw-pn select,.sw-pn textarea{padding:0 10px;border-radius:8px;border:1px solid var(--line-strong);background:var(--surface);color:var(--ink);font:inherit;font-size:13px;height:36px;min-height:36px}
      .sw-pn textarea{width:100%;min-height:120px;line-height:1.5;padding:9px 10px;resize:vertical;height:auto}
      .sw-pn .when{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
      .sw-pn .when .tz{font-size:12px;color:var(--muted)}
      .sw-pn .when input{border-radius:999px;height:32px;min-height:32px;padding:0 12px;font-size:12.5px;font-weight:500}
      .sw-pn .accs{display:flex;gap:14px;flex-wrap:wrap}
      .sw-pn .acc{display:grid;gap:5px;justify-items:center;width:64px;background:none;border:0;padding:0;font:inherit;color:var(--ink);cursor:pointer;text-align:center}
      .sw-pn .acc:disabled{cursor:default}
      .sw-pn .acc small{font-size:11px;color:var(--muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:64px;line-height:1.3}
      .sw-pn .acc.on small{color:var(--ink)} .sw-pn .acc small.w{color:var(--warn)} .sw-pn .acc small.e{color:var(--bad)}
      .sw-pn .acc.on .sw-bub.md::before{content:"";position:absolute;left:-2px;top:-2px;width:12px;height:12px;border-radius:50%;background:var(--brand);border:2px solid var(--surface)}
      .sw-pn .qa{display:flex;gap:10px;flex-wrap:wrap} .sw-pn .qa button{font:inherit;font-size:12.5px;color:var(--brand);background:none;border:0;padding:0;cursor:pointer}
      .sw-pn .row{display:flex;gap:6px;flex-wrap:wrap;align-items:center}
      .sw-pn details{border:1px solid var(--line);border-radius:var(--sw-r);padding:10px 12px} .sw-pn details summary{cursor:pointer;font-size:12.5px;font-weight:600;color:var(--ink-2);list-style:none;display:flex;align-items:center;gap:6px} .sw-pn details summary::before{content:"";width:6px;height:6px;border-right:1.6px solid var(--muted);border-bottom:1.6px solid var(--muted);transform:rotate(-45deg);transition:transform .12s} .sw-pn details[open] summary::before{transform:rotate(45deg)} .sw-pn details .in{display:grid;gap:10px;margin-top:10px}
      .sw-pn .opts{display:grid;gap:6px} .sw-pn .opt{text-align:left;border:1px solid var(--line);border-radius:8px;padding:8px 10px;font:inherit;font-size:12.5px;line-height:1.45;background:var(--surface);color:var(--ink);cursor:pointer;white-space:pre-wrap} .sw-pn .opt:hover{border-color:var(--brand)}
      .sw-pn .foot{display:flex;gap:8px;flex-wrap:wrap;align-items:center;position:sticky;bottom:0;background:var(--surface);padding:10px 0 0;border-top:1px solid var(--line);margin-top:-6px}
      .sw-pn .foot .sp{flex:1}
      .sw-pn .err{color:var(--bad);font-size:12.5px} .sw-pn .err:empty{display:none} .sw-pn .ok{color:var(--good);font-size:12.5px;font-weight:600}
      .sw-pn .hint{font-size:12px;color:var(--muted);line-height:1.5;margin:0}
      /* posted: results per platform in the Watch metric row style */
      .sw-res{display:grid;border:1px solid var(--line);border-radius:var(--sw-r);overflow:hidden}
      .sw-res .r{display:grid;grid-template-columns:auto minmax(0,1fr);gap:10px;align-items:center;padding:9px 12px;border-top:1px solid var(--line);font-size:12.5px} .sw-res .r:first-child{border-top:0}
      .sw-res .r .ln{display:flex;gap:8px;align-items:center;flex-wrap:wrap} .sw-res .r .ln b{font-weight:600}
      .sw-res .r .e{color:var(--bad)} .sw-res .r .w{color:var(--warn)}
      .sw-mr{display:flex;gap:10px;align-items:center;font-size:12px;color:var(--muted);font-variant-numeric:tabular-nums;white-space:nowrap;overflow:hidden;margin-top:2px}
      .sw-mr b{color:var(--ink);font-weight:600}
      .sw-pick{display:grid;grid-template-columns:repeat(auto-fill,minmax(110px,1fr));gap:8px;max-height:46vh;overflow:auto}
      .sw-pick button{border:1px solid var(--line);border-radius:8px;padding:0;background:var(--surface);cursor:pointer;text-align:left;font:inherit;color:var(--ink);overflow:hidden}
      .sw-pick button:hover{border-color:var(--brand)}
      .sw-pick .th{aspect-ratio:1;background:var(--surface-2) center/cover no-repeat} .sw-pick .t{font-size:11px;padding:5px 6px;line-height:1.3;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
      /* Brand settings > Social: one table-like card */
      .sw-conn{border:1px solid var(--line);border-radius:var(--sw-r);background:var(--surface);overflow:hidden;max-width:100%} .sw-conn .tw{overflow-x:auto}
      .sw-conn .hd{display:flex;align-items:baseline;gap:10px;padding:12px 14px;border-bottom:1px solid var(--line);flex-wrap:wrap}
      .sw-conn .hd b{font-size:13.5px;font-weight:650} .sw-conn .hd p{margin:0;font-size:12.5px;color:var(--muted)}
      .sw-conn table{width:100%;border-collapse:collapse;font-size:13px;table-layout:auto}
      .sw-conn th{font-size:10.5px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:var(--muted);text-align:left;padding:8px 12px;border-bottom:1px solid var(--line);white-space:nowrap}
      .sw-conn td{padding:10px 12px;border-bottom:1px solid var(--line);vertical-align:middle}
      .sw-conn tr:last-child td{border-bottom:0}
      .sw-conn td .pl{display:flex;align-items:center;gap:10px;font-weight:600}
      .sw-conn td .pl .av{width:28px;height:28px;border-radius:7px;border:1px solid var(--line-strong);background:var(--surface-2) center/cover no-repeat;display:inline-flex;align-items:center;justify-content:center;font-size:9.5px;font-weight:800;color:var(--ink-2);flex:none}
      .sw-conn td .acc{font-weight:500} .sw-conn td .acc small{display:block;color:var(--muted);font-size:11.5px}
      .sw-conn td.r{text-align:right;white-space:nowrap} .sw-conn td .acts{display:inline-flex;gap:6px;justify-content:flex-end}
      .sw-st{display:inline-flex;align-items:center;gap:6px;font-size:12.5px;white-space:nowrap}
      .sw-st i{width:7px;height:7px;border-radius:50%;background:var(--muted);flex:none} .sw-st.ok i{background:var(--good)} .sw-st.bad i{background:var(--bad)} .sw-st.warn i{background:var(--warn)}
      .sw-conn .msg{padding:8px 14px;font-size:12.5px;color:var(--muted);border-top:1px solid var(--line)} .sw-conn .msg:empty{display:none}
      /* modals */
      .sw-m .fl{display:grid;gap:12px} .sw-m h3{margin:0;font-size:16px;font-weight:650} .sw-m .foot{display:flex;gap:8px;justify-content:flex-end} .sw-m .err{color:var(--bad);font-size:12.5px;min-height:1em}
      .sw-m .hint{margin:0;font-size:12.5px;color:var(--muted);line-height:1.5}
      .sw-m input[type=text]{width:100%;height:36px;padding:0 10px;border-radius:8px;border:1px solid var(--line-strong);background:var(--surface);color:var(--ink);font:inherit}
      .sw-m .pg{display:grid;grid-template-columns:36px minmax(0,1fr);gap:10px;align-items:center;border:1px solid var(--line);border-radius:9px;padding:8px 10px;cursor:pointer;background:var(--surface);font:inherit;color:var(--ink);text-align:left;width:100%} .sw-m .pg:hover{border-color:var(--brand)}
      .sw-m .pg .av{width:36px;height:36px;border-radius:50%;background:var(--surface-2) center/cover} .sw-m .pg small{display:block;color:var(--muted);font-size:11.5px}
      .sw .sw-ig{flex:1;min-width:0;max-width:640px;margin:0 auto}
      .sw .ig-head{display:flex;align-items:center;gap:12px;padding:6px 2px 14px} .sw .ig-head .av{width:56px;height:56px;border-radius:50%;background:var(--surface-2) center/cover;flex:none;border:1px solid var(--line)}
      .sw .ig-head b{display:block;font-size:15px;font-weight:650} .sw .ig-head small{display:block;color:var(--muted);font-size:12.5px;margin-top:2px} .sw .ig-head .sp{flex:1}
      .sw .ig-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:3px}
      .sw .ig-cell{position:relative;aspect-ratio:4/5;background:var(--surface-2) center/cover;border:0;padding:0;cursor:pointer;display:block;border-radius:2px;overflow:hidden}
      .sw .ig-cell.draft{opacity:.55} .sw .ig-cell.scheduled{outline:2px dashed var(--brand);outline-offset:-2px}
      .sw .ig-cell .multi{position:absolute;top:6px;right:6px;color:#fff;font-size:12px;font-style:normal;text-shadow:0 1px 3px rgba(0,0,0,.6)}
      .sw .ig-cell .st{position:absolute;left:0;right:0;bottom:0;font-size:10.5px;font-weight:600;color:#fff;background:linear-gradient(transparent,rgba(0,0,0,.7));padding:14px 6px 5px;text-align:left}
      @media (max-width:720px){
        .sw .sw-body,.sw .sw-sk{grid-template-columns:1fr} .sw .sw-tray{display:none} .sw .sw-seg{display:none}
        .sw .sw-grid{max-height:none} .sw .sw-gh,.sw .sw-gb{grid-template-columns:44px repeat(7,140px)}
        .sw .sw-top .r{margin-left:0;width:100%} .sw .sw-top .r .sw-btn{flex:1 1 auto}
        .sw-sheet-tray .sw-tl{grid-template-columns:minmax(0,1fr)}
        .sw .sw-tray .hd .hd-per-btn .hd-per-d{display:inline}
        .sw-pn .med .m,.sw-pn .med .add{width:76px;height:76px} .sw-pn .foot .sw-btn{min-height:44px;flex:1 1 auto}
        .sw-pn .when input{flex:1 1 auto}
        .sw-pn{overflow-x:hidden} .sw-pn h4{flex-wrap:wrap} .sw-pn h4 .sp{flex:1 1 100%;display:none} .sw-pn textarea,.sw-pn input,.sw-pn select{max-width:100%;box-sizing:border-box}
        .sw .sw-ht{transform:none;padding-top:2px;text-align:left;padding-left:6px}
        .sw-conn table,.sw-conn thead,.sw-conn tbody,.sw-conn tr,.sw-conn td{display:block} .sw-conn thead{display:none}
        .sw-conn td{border:0;padding:3px 14px} .sw-conn tr{padding:10px 0;border-bottom:1px solid var(--line)} .sw-conn tr:last-child{border-bottom:0} .sw-conn td.r{text-align:left;padding-top:8px}
        .sw-conn td .acts{justify-content:flex-start;flex-wrap:wrap}
        .sw-sheet-tray{display:flex;flex-direction:column;gap:0}
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
    if (!act || act === 'all') { $('#main').innerHTML = `<div class="v2 sw">${head}<div class="sw-state"><b>Pick a brand</b><p>Choose a brand at the top to plan its week of posts.</p></div></div>`; return; }
    const t = H.RUN();
    if (first || ST.act !== act) { ST.act = act; ST.from = null; ST.tray = null; $('#main').innerHTML = `<div class="v2 sw">${head}<div class="sw-sk"><i></i><i></i></div></div>`; }
    if (!ST.from) ST.from = monday(new Date().toLocaleDateString('en-CA'));
    try { await load(first || !!window.SOCIAL_COMPOSE); }
    catch (e) {
      if (t !== H.RUN()) return;
      $('#main').innerHTML = `<div class="v2 sw">${head}<div class="sw-state err"><b>The week did not load</b><p>${esc(e.message)}</p><div><button type="button" class="sw-btn" id="swRetry">Try again</button></div></div></div>`;
      $('#swRetry').onclick = () => render(host, true);
      return;
    }
    if (t !== H.RUN()) return;
    draw();
    if (window.SOCIAL_FILL && !CLI()) { window.SOCIAL_FILL = 0; setTimeout(fillWeek, 50); }   // Monday's Slack nudge: ?open=socialweek&fill=1
    /* Make ours > Schedule it (social.js, 2026-10-21): a filmed tray item opens as a new post at the next free hour. */
    const comp = window.SOCIAL_COMPOSE; window.SOCIAL_COMPOSE = null;
    if (comp && !CLI()) { const it = ST.tray.find(x => x.ref === comp); if (it) setTimeout(() => composer(null, { at: nextSlot(), items: [it] }), 50); else toast('That post is not on the tray yet. Give it a minute and look under Ready.'); }
    const want = window.SOCIAL_POST || (first ? BOOT_POST : null); window.SOCIAL_POST = null;
    if (want) { const p = ST.data.posts.find(x => x.id === want); if (p) composer(p); else H.apiAH(`/api/social/post?id=${encodeURIComponent(want)}`, { fresh: true }).then(r => r.post && composer(r.post)).catch(() => {}); }
  }
  async function reload(fresh) { await load(fresh); draw(); }

  /* ---------- the page ---------- */
  function bubble(plat, acc, extra = '', asButton = false) {
    const a = acc || {}, cls = a.on ? (a.status === 'error' ? 'bad' : a.mode === 'notify' ? 'hand' : '') : 'off';
    const tipT = a.on ? `${PL[plat]}${a.handle ? ` @${a.handle}` : ''}${a.mode === 'notify' ? ': by hand (Slack tells you at post time)' : a.mode === 'draft' ? ': lands as a draft or private until the platform approves the app' : ''}${a.status === 'error' ? ': needs reconnecting' : ''}` : `${PL[plat]} is not connected (Brand settings > Social)`;
    const tag = asButton ? 'button type="button"' : 'span';
    return `<${tag} class="sw-bub ${cls} ${extra}" ${a.pic ? `style="background-image:url('${esc(a.pic)}')"` : ''} ${U() ? U().tipAttr(esc(tipT)) : ''} data-bub="${plat}" aria-label="${esc(PL[plat])}">${a.pic ? '' : PK[plat]}${a.pic ? `<i class="pk">${PK[plat]}</i>` : ''}</${asButton ? 'button' : 'span'}>`;
  }
  function stateOf(p) {
    const res = p.results || {};
    const views = Object.values(res).reduce((s, r) => s + (r && r.views ? r.views : 0), 0);
    if (p.status === 'posted') return ['posted', views ? `Posted · ${k(views)} views` : 'Posted'];
    if (p.status === 'partly') return ['failed', 'Partly posted'];
    if (p.status === 'handoff') return ['handoff', 'In Slack, post by hand'];
    if (p.status === 'failed') return ['failed', 'Failed'];
    if (p.status === 'posting') return ['auto', 'Posting now'];
    if (p.status === 'scheduled') return ['auto', p.auto ? 'Scheduled, posts itself' : 'Scheduled'];
    return ['draft', 'Draft'];
  }
  function postCard(p, top) {
    const [cls, label] = stateOf(p);
    const m = p.media[0];
    const on = Object.keys(PL).filter(x => p.targets[x] && p.targets[x].on);
    return `<button type="button" class="sw-post ${cls}" style="top:${top}px" data-post="${esc(p.id)}" draggable="${['draft', 'scheduled'].includes(p.status) ? 'true' : 'false'}" ${U() ? U().tipAttr(esc(`${label}. ${p.caption || '(no caption)'}`.slice(0, 200))) : ''}>
      <span class="th" ${m && m.thumb ? `style="background-image:url('${esc(m.thumb)}')"` : ''}></span>
      <span style="min-width:0"><span class="tm"><i class="dot"></i>${esc(hm12(p.hm))}</span><span class="st">${on.map(x => bubble(x, (ST.data.accounts || {})[x], 'sm')).join('')}</span></span></button>`;
  }
  function grid() {
    const d = ST.data, days = d.days, nowDay = d.today;
    const nowH = +new Date().toLocaleTimeString('en-GB', { timeZone: d.tz, hour: '2-digit', minute: '2-digit' }).slice(0, 2);
    let h = `<div class="sw-gh"><div></div>${days.map(x => `<div class="${x === nowDay ? 'td' : ''}">${wd(x)}<b>${dnum(x)}</b></div>`).join('')}</div><div class="sw-gb">`;
    for (const hr of HOURS) {
      h += `<div class="sw-ht">${hr === HOURS[0] ? '' : h12(hr)}</div>`;
      for (const day of days) {
        const past = day < nowDay || (day === nowDay && hr < nowH);
        h += `<div class="sw-cell ${day === nowDay ? 'td' : ''} ${past ? 'past' : ''}" data-day="${day}" data-hour="${hr}"></div>`;
      }
    }
    const nowM = +new Date().toLocaleTimeString('en-GB', { timeZone: d.tz, hour: '2-digit', minute: '2-digit' }).slice(3, 5);
    if (days.includes(nowDay) && nowH >= HOURS[0] && nowH <= HOURS[HOURS.length - 1]) h += `<div class="sw-now" style="top:${(nowH - HOURS[0]) * ROW + Math.round(nowM / 60 * ROW)}px"></div>`;
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
        lastBottom = top + 48;
        first.insertAdjacentHTML('beforeend', postCard(p, top));
        const el = first.lastElementChild; el.style.top = `${top}px`;
      }
    }
  }
  function trayHtml(items, inSheet) {
    const counts = { unused: items.filter(i => !i.used).length, all: items.length };
    for (const s of Object.keys(SRC)) counts[s] = items.filter(i => i.src === s).length;
    const list = ST.tf === 'unused' ? items.filter(i => !i.used) : ST.tf === 'all' ? items : items.filter(i => i.src === ST.tf);
    const opts = [['unused', 'Not used yet'], ['all', 'Everything'], ...Object.entries(SRC)].filter(([f]) => f === 'unused' || f === 'all' || counts[f]).map(([f, l]) => `<option value="${f}" ${ST.tf === f ? 'selected' : ''}>${l} (${counts[f]})</option>`).join('');
    /* A tray row (2026-10-21): the picture, what it is in words, where it came from, and its state, so nobody has to
       hover a thumbnail to know what it is. Grouped by what to do next: film it, post it, already on the week. */
    const item = it => `<button type="button" class="sw-ti ${it.used ? 'used' : ''}" draggable="${inSheet ? 'false' : 'true'}" data-ref="${esc(it.ref)}" ${U() ? U().tipAttr(esc(it.kind === 'text' ? 'A script with no clip yet: film it, upload it, then drag it on.' : 'Drag onto an hour, or click to post it at the next free hour.')) : ''}>
      <span class="th" ${it.thumb ? `style="background-image:url('${esc(it.thumb)}')"` : ''}>${it.thumb ? '' : it.kind === 'text' ? ic('pencil') : ic('image')}${it.kind === 'video' ? '<i class="kd">&#9654;</i>' : ''}</span>
      <span class="tx"><b>${esc(it.title || 'Untitled')}</b><small>${ic(SRC_IC[it.src] || 'image')}${esc([SRC[it.src] || it.src, it.who || it.sub || ''].filter(Boolean).join(' · '))}</small></span>
      <span class="chip ${it.used ? 'u' : it.kind === 'text' ? 'f' : 'r'}">${it.used ? 'On the week' : it.kind === 'text' ? 'To film' : 'Ready'}</span></button>`;
    const groups = [['To film', list.filter(i => !i.used && i.kind === 'text')], ['Ready to post', list.filter(i => !i.used && i.kind !== 'text')], ['Already on the week', list.filter(i => i.used)]].filter(([, g]) => g.length);
    const PM = window.PillMenu;
    const pm = PM ? PM.html('swTf', 'Show', [['unused', 'Unused', `${counts.unused} not on the week yet`], ['all', 'All', `${counts.all} ready`], ...Object.entries(SRC).filter(([f]) => counts[f]).map(([f, l]) => [f, l, `${counts[f]}`])], ST.tf) : `<span class="sw-sel"><select data-tf aria-label="Show">${opts}</select></span>`;
    return `<div class="hd"><b>Ready</b><small>${list.length}</small><span class="sp"></span>${pm}</div>
      <div class="sw-tl">${list.length ? groups.map(([g, l]) => `<div class="gh">${esc(g)}<small>${l.length}</small></div>${l.map(item).join('')}`).join('') : `<div class="empty">${items.length ? 'Nothing here with this filter.' : 'Nothing ready yet. Make our version of a post on Social, approve a Studio final, add a creator clip, or upload a file.'}</div>`}</div>
      <div class="ft"><button type="button" class="sw-btn sm q" data-upload="1">${ic('plus')} Upload a photo or video</button><input type="file" accept="image/jpeg,image/png,image/webp,video/mp4,video/quicktime" hidden data-file="1"></div>`;
  }
  function draw() {
    const d = ST.data, head = H.pageHead('socialweek', 'Social');
    const accs = d.accounts || {};
    const none = !Object.values(accs).some(a => a.on);
    const list = PHONE() || ST.view === 'list';
    $('#main').innerHTML = `<div class="v2 sw">${head}
      <div class="sw-top"><span class="sw-nav"><button type="button" data-nav="-1" aria-label="Previous week">&#8249;</button><button type="button" data-nav="0">This week</button><button type="button" data-nav="1" aria-label="Next week">&#8250;</button></span>
        <span class="sw-range">${md(d.days[0])} to ${md(d.days[6])}<small>${esc(d.tz.replace(/_/g, ' '))}</small></span>
        ${d.target != null ? `<span class="sw-plan ${(d.planned || 0) >= d.target ? 'ok' : ''}" ${U() ? U().tipAttr(`${d.planned || 0} scheduled or posted this week, against the brand's target of ${d.target} (Brand settings > Social)`) : ''}>${d.planned || 0} of ${d.target} planned</span>` : ''}
        <span class="sw-seg" role="tablist"><button type="button" role="tab" data-sv="week" class="${ST.view === 'week' ? 'on' : ''}">Week</button><button type="button" role="tab" data-sv="list" class="${ST.view === 'list' ? 'on' : ''}">List</button><button type="button" role="tab" data-sv="preview" class="${ST.view === 'preview' ? 'on' : ''}" ${U() ? U().tipAttr('How the Instagram grid will look with what is scheduled') : ''}>Preview</button></span>
        <span class="r"><span class="sw-acc" id="swAccs">${Object.keys(PL).map(x => bubble(x, accs[x], '', !CLI())).join('')}</span>
          ${PHONE() ? `<button type="button" class="sw-btn" id="swTrayBtn">${ic('inbox')} Ready</button>` : ''}${CLI() ? '' : `<button type="button" class="sw-btn" id="swFill" ${U() ? U().tipAttr('Pick unused tray items up to the weekly target, spread them over free hours, caption each in the brand voice. You review before anything is scheduled.') : ''}>${ic('sparkles')} Fill the week</button>`}<button type="button" class="sw-btn pri" id="swNew">${ic('plus')} Post</button></span></div>
      ${none ? `<div class="sw-note"><div><b>No accounts connected yet.</b> ${CLI() ? 'Ask the Mobius team to connect your Instagram, Facebook, TikTok and YouTube.' : 'Until then a scheduled post is handed to you in Slack at post time with the file and caption ready to paste.'}</div>${CLI() ? '' : '<button type="button" class="sw-btn sm" data-settings="1">Connect accounts</button>'}</div>` : ''}
      ${CLI() ? '' : `<p class="sw-how"><b>How it works:</b> ${PHONE() ? 'tap Ready and pick something (or + Post on a day)' : 'drag anything Ready onto an hour (or press + on an empty hour)'}, write one caption, pick the accounts, Schedule. Our versions from Social wait under To film until the clip is uploaded.</p>`}
      <div class="sw-body"><div class="sw-tray" id="swTray">${trayHtml(ST.tray)}</div>${ST.view === 'preview' ? `<div class="sw-ig" id="swIg"><p class="hint">Reading the grid…</p></div>` : list ? `<div class="sw-list" id="swList">${dayList()}</div>` : `<div class="sw-grid" id="swGrid">${grid()}</div>`}</div></div>`;
    if (ST.view === 'preview') igPreview();
    const g = $('#swGrid'); if (g) { placePosts(g); g.scrollTop = Math.max(0, (8 - HOURS[0]) * ROW - 10); }
    wire();
  }
  /* The Instagram grid preview (2026-10-20, Later's Preview): the account's header, then the last 30 posts through Locus that go to
     Instagram as a 3-across grid, newest first, scheduled and drafts marked. A tap opens the post. Reads /api/social/grid. */
  async function igPreview() {
    const host = $('#swIg'); if (!host) return;
    let r; try { r = await H.apiAH(`/api/social/grid?act=${encodeURIComponent(ST.act)}`, { fresh: true }); } catch (e) { host.innerHTML = `<p class="v2bad">${esc(e.message)}</p>`; return; }
    if (!$('#swIg')) return;
    const a = r.account || null, posts = r.posts || [];
    const st = p => p.status === 'draft' ? 'Draft' : p.status === 'scheduled' ? `Scheduled ${new Date(p.at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}` : p.status === 'posting' ? 'Posting' : '';
    host.innerHTML = `<div class="ig-head"><span class="av" ${a && a.pic ? `style="background-image:url('${esc(a.pic)}')"` : ''}></span><div><b>${esc(a ? (a.handle ? `@${a.handle}` : a.name || 'Instagram') : 'Instagram not connected')}</b><small>${posts.length} post${posts.length === 1 ? '' : 's'} through Locus${a ? '' : ' · connect the account in Brand settings to post'}</small></div><span class="sp"></span><button type="button" class="sw-btn sm" id="igNew">${ic('plus')} Post</button></div>
      ${posts.length ? `<div class="ig-grid">${posts.map(p => { const m = p.media[0] || {}; const s = st(p); return `<button type="button" class="ig-cell ${p.status}" data-post="${esc(p.id)}" ${m.thumb ? `style="background-image:url('${esc(m.thumb)}')"` : ''} aria-label="${esc(p.caption || 'Post')}">${p.media.length > 1 ? '<i class="multi">&#9638;</i>' : m.kind === 'video' ? '<i class="multi">&#9654;</i>' : ''}${s ? `<span class="st">${esc(s)}</span>` : ''}</button>`; }).join('')}</div>` : '<div class="sw-note"><div>Nothing goes to Instagram yet. Schedule a post with Instagram switched on and it shows here in the order the grid will read.</div></div>'}`;
    host.querySelectorAll('[data-post]').forEach(b => b.onclick = () => { const p = (ST.data.posts || []).find(x => x.id === b.dataset.post) || posts.find(x => x.id === b.dataset.post); if (p) composer(p); });
    const nb = host.querySelector('#igNew'); if (nb) nb.onclick = () => composer(null, { at: nextSlot() });
  }
  /* The day list: each day a header with its posts as 56px rows; an empty day is one grey line. The only view on a phone. */
  function dayList() {
    const d = ST.data;
    return d.days.map(day => {
      const posts = d.posts.filter(p => p.day === day).sort((a, b) => a.hm.localeCompare(b.hm));
      const past = day < d.today;
      const rows = posts.map(p => { const [cls, label] = stateOf(p); const m = p.media[0]; const on = Object.keys(PL).filter(x => p.targets[x] && p.targets[x].on);
        return `<button type="button" class="sw-dr ${cls}" data-post="${esc(p.id)}"><span class="th" ${m && m.thumb ? `style="background-image:url('${esc(m.thumb)}')"` : ''}></span><span style="min-width:0"><span class="cp">${esc(p.caption || '(no caption)')}</span><span class="ln"><i class="dot"></i>${esc(hm12(p.hm))} · ${esc(label)}</span></span><span class="sw-acc">${on.map(x => bubble(x, (d.accounts || {})[x], 'sm')).join('')}</span></button>`; }).join('');
      return `<div class="sw-day ${day === d.today ? 'td' : ''}"><div class="dh"><b>${wd(day)} ${dnum(day)}</b>${day === d.today ? '<small>today</small>' : ''}<span class="sp"></span>${past ? '' : `<button type="button" data-newday="${day}">+ Post</button>`}</div>${rows || `<div class="none">Nothing yet${past ? '' : ` · <button type="button" data-newday="${day}">Post</button>`}</div>`}</div>`;
    }).join('');
  }
  function wire() {
    const m = $('#main');
    m.querySelectorAll('[data-nav]').forEach(b => b.onclick = async () => { const n = +b.dataset.nav; ST.from = n === 0 ? monday(ST.data.today) : add(ST.from, n * 7); await reload(false); });
    m.querySelectorAll('[data-settings]').forEach(b => b.onclick = () => { try { localStorage.setItem('pf_set_bsec', 'social'); } catch {} H.show('settings'); });
    $('#swAccs').querySelectorAll('button[data-bub]').forEach(b => b.onclick = () => { if (CLI()) return; try { localStorage.setItem('pf_set_bsec', 'social'); } catch {} H.show('settings'); });
    $('#swNew').onclick = () => composer(null, { at: nextSlot() });
    const fb = $('#swFill'); if (fb) fb.onclick = fillWeek;
    m.querySelectorAll('[data-sv]').forEach(b => b.onclick = () => { ST.view = b.dataset.sv; store('sw_view', ST.view); draw(); });
    const tb = $('#swTrayBtn'); if (tb) tb.onclick = traySheet;
    wireTray($('#swTray'), false);
    const L = $('#swList');
    if (L) {
      L.querySelectorAll('.sw-dr').forEach(b => b.onclick = () => composer(ST.data.posts.find(p => p.id === b.dataset.post)));
      L.querySelectorAll('[data-newday]').forEach(b => b.onclick = () => { const day = b.dataset.newday; composer(null, { at: day === ST.data.today ? nextSlot() : atOf(day, 9) }); });
    }
    const g = $('#swGrid'); if (!g) return;
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
    const sel = root.querySelector('[data-tf]'); if (sel) sel.onchange = () => { ST.tf = sel.value; store('sw_tf', ST.tf); root.innerHTML = trayHtml(ST.tray, inSheet); wireTray(root, inSheet); };
    const pm = root.querySelector('#swTf'); if (pm && window.PillMenu) window.PillMenu.wire(pm, v => { ST.tf = v; store('sw_tf', ST.tf); root.innerHTML = trayHtml(ST.tray, inSheet); wireTray(root, inSheet); });
    root.querySelectorAll('.sw-ti').forEach(b => {
      const it = ST.tray.find(x => x.ref === b.dataset.ref);
      b.onclick = () => { if (inSheet) { const c = document.querySelector('#v2panel .pclose'); if (c) c.click(); if (window.LxPhone) window.LxPhone.close(); } composer(null, { at: nextSlot(), items: [it] }); };
      b.ondragstart = e => { e.dataTransfer.setData('text/plain', it.ref); e.dataTransfer.effectAllowed = 'copy'; };
    });
    const up = root.querySelector('[data-upload]'), fi = root.querySelector('[data-file]');
    if (up && fi) { up.onclick = () => fi.click(); fi.onchange = async () => { const f = fi.files[0]; if (!f) return; up.disabled = true; up.textContent = 'Uploading…'; try { const it = await upload(f); ST.tray.unshift(it); root.innerHTML = trayHtml(ST.tray, inSheet); wireTray(root, inSheet); toast('In the tray. Drag it onto the week.'); } catch (e) { toast(e.message); up.disabled = false; up.innerHTML = `${ic('plus')} Upload a photo or video`; } }; }
  }
  function traySheet() {
    const html = `<div class="sw sw-sheet-tray"><div class="sw-tray" style="display:flex;position:static;max-height:none;border:0">${trayHtml(ST.tray, true)}</div></div>`;
    if (window.LxPhone && window.LxPhone.isPhone && window.LxPhone.isPhone()) { window.LxPhone.open('Ready', html, b => wireTray(b.querySelector('.sw-tray'), true)); return; }
    U().panel.wide = false; const body = U().panel('Ready', html); wireTray(body.querySelector('.sw-tray'), true);
  }
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
    const now = new Date();
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

  /* ---------- the post editor: one panel ---------- */
  function composer(p, opts = {}) {
    const accs = ST.data.accounts || {};
    const items = (opts.items || []).map(it => ({ ref: it.ref, src: it.src, kind: it.kind, title: it.title, thumb: it.thumb, file: it.file, key: it.key, who: it.who }));
    const M = { id: p ? p.id : null, at: p ? p.at : opts.at, caption: p ? p.caption : (items.find(i => i.caption) || opts.items?.[0] || {}).caption || '', media: p ? p.media.map(m => ({ ...m })) : items.filter(i => i.kind !== 'text'),
      targets: p ? JSON.parse(JSON.stringify(p.targets)) : Object.fromEntries(Object.keys(PL).map(x => [x, { on: !!(accs[x] && accs[x].on && (x === 'ig' || x === 'fb')) }])), auto: p ? p.auto : true, status: p ? p.status : 'draft', results: p ? p.results : {} };
    if (!p && opts.items?.[0]?.caption) M.caption = opts.items[0].caption;
    const out = p && ['posted', 'partly', 'handoff', 'failed', 'posting'].includes(p.status);
    const lp = localParts(M.at);
    const [, stLabel] = p ? stateOf(p) : ['draft', ''];
    U().panel.wide = !PHONE();
    const body = U().panel(p ? (out ? 'Your post' : 'Edit the post') : 'New post', `<div class="sw-pn">
      ${out ? `<section><h4>How it went<span class="sp"></span><small>${esc(stLabel)}</small></h4><div id="cpRes"></div></section>` : ''}
      <section><div class="med" id="cpMed"></div></section>
      <section><textarea id="cpCap" placeholder="One caption for every account. Tweak a platform below only where it needs it." ${out ? 'readonly' : ''}>${esc(M.caption)}</textarea>
        ${out ? '' : `<div class="qa"><button type="button" id="cpRe">Rephrase in ${esc(brandName())}'s voice</button><button type="button" id="cpSaved">Saved captions</button><button type="button" id="cpSave">Save this caption</button></div>`}<div class="opts" id="cpOpts"></div></section>
      <section><h4>Where</h4><div class="accs" id="cpAccs"></div></section>
      <section><h4>When</h4><div class="when"><input type="date" id="cpDay" value="${lp.day}" ${out ? 'disabled' : ''} aria-label="Day"><input type="time" id="cpTime" value="${lp.hm}" ${out ? 'disabled' : ''} aria-label="Time"><span class="tz">${esc(ST.data.tz.replace(/_/g, ' '))}${M.auto && !out ? ', posts itself' : ''}</span></div></section>
      ${out ? '' : `<details><summary>Per-platform tweaks, only where needed</summary><div class="in">
        <label class="fld"><span>Instagram first comment</span><input type="text" id="tIgC" value="${esc(M.targets.ig?.first_comment || '')}" placeholder="Hashtags or the link, posted as the first comment"></label>
        <label class="fld"><span>Instagram caption, if different</span><textarea id="tIgCap" style="min-height:60px">${esc(M.targets.ig?.caption || '')}</textarea></label>
        <label class="fld"><span>Facebook caption, if different</span><textarea id="tFbCap" style="min-height:60px">${esc(M.targets.fb?.caption || '')}</textarea></label>
        <label class="fld"><span>TikTok title or caption, if different</span><input type="text" id="tTtT" value="${esc(M.targets.tt?.title || '')}" maxlength="2200"></label>
        ${accs.tt?.mode === 'live' ? `<label class="fld"><span>TikTok, who can see it</span><span class="sw-sel lg"><select id="tTtP"><option value="PUBLIC_TO_EVERYONE" ${!M.targets.tt?.privacy || M.targets.tt.privacy === 'PUBLIC_TO_EVERYONE' ? 'selected' : ''}>Everyone</option><option value="FOLLOWER_OF_CREATOR" ${M.targets.tt?.privacy === 'FOLLOWER_OF_CREATOR' ? 'selected' : ''}>Followers</option><option value="SELF_ONLY" ${M.targets.tt?.privacy === 'SELF_ONLY' ? 'selected' : ''}>Only me</option></select></span></label>` : ''}
        <label class="fld"><span>YouTube title</span><input type="text" id="tYtT" value="${esc(M.targets.yt?.title || '')}" maxlength="100" placeholder="Defaults to the caption's first line"></label>
        <label class="fld"><span>YouTube description, if different</span><textarea id="tYtCap" style="min-height:60px">${esc(M.targets.yt?.caption || '')}</textarea></label>
        ${accs.yt?.mode === 'live' ? `<label class="fld"><span>YouTube visibility</span><span class="sw-sel lg"><select id="tYtV"><option value="public" ${!M.targets.yt?.visibility || M.targets.yt.visibility === 'public' ? 'selected' : ''}>Public</option><option value="unlisted" ${M.targets.yt?.visibility === 'unlisted' ? 'selected' : ''}>Unlisted</option><option value="private" ${M.targets.yt?.visibility === 'private' ? 'selected' : ''}>Private</option></select></span></label>` : ''}
      </div></details>`}
      <div class="err" id="cpErr"></div>
      <div class="foot">${out
        ? `${['failed', 'partly', 'handoff'].includes(M.status) ? '<button type="button" class="sw-btn pri" id="cpRetry">Try again now</button>' : ''}<button type="button" class="sw-btn" id="cpDup">Post again as a copy</button><span class="sp"></span><button type="button" class="sw-btn q bad" id="cpDel">Delete</button>`
        : `<button type="button" class="sw-btn pri" id="cpSched">Schedule</button><button type="button" class="sw-btn" id="cpNow">Post now</button><button type="button" class="sw-btn q" id="cpDraft">Save draft</button>${p ? '<span class="sp"></span><button type="button" class="sw-btn q bad" id="cpDel">Delete</button>' : ''}`}</div></div>`);
    const err = body.querySelector('#cpErr');
    const drawMedia = () => {
      const el = body.querySelector('#cpMed');
      el.innerHTML = M.media.map((m, i) => `<span class="m" ${m.thumb ? `style="background-image:url('${esc(m.thumb)}')"` : ''} ${U() ? U().tipAttr(esc(m.title || '')) : ''}><i>${m.kind === 'video' ? 'VIDEO' : 'PHOTO'}</i>${out ? '' : `<button type="button" data-rm="${i}" aria-label="Remove">&#215;</button>`}</span>`).join('')
        + (out ? '' : `<button type="button" class="add" id="cpPick">${ic('inbox')}From the tray</button><button type="button" class="add" id="cpUp">${ic('plus')}Upload</button><input type="file" id="cpFile" hidden accept="image/jpeg,image/png,image/webp,video/mp4,video/quicktime">`)
        + (!M.media.length && out ? '<p class="hint">No picture or video.</p>' : '');
      el.querySelectorAll('[data-rm]').forEach(b => b.onclick = () => { M.media.splice(+b.dataset.rm, 1); drawMedia(); });
      const pk = el.querySelector('#cpPick'); if (pk) pk.onclick = () => pickModal(it => { M.media.push({ ref: it.ref, src: it.src, kind: it.kind, title: it.title, thumb: it.thumb, file: it.file, key: it.key, who: it.who }); if (!M.caption && it.caption) { M.caption = it.caption; body.querySelector('#cpCap').value = it.caption; } drawMedia(); });
      const up = el.querySelector('#cpUp'), fi = el.querySelector('#cpFile');
      if (up) { up.onclick = () => fi.click(); fi.onchange = async () => { const f = fi.files[0]; if (!f) return; up.disabled = true; up.textContent = 'Uploading…'; try { const it = await upload(f); ST.tray.unshift(it); M.media.push({ ref: it.ref, src: it.src, kind: it.kind, title: it.title, thumb: it.thumb, key: it.key }); drawMedia(); } catch (e) { err.textContent = e.message; up.disabled = false; up.innerHTML = `${ic('plus')}Upload`; } }; }
    };
    const drawAccs = () => {
      body.querySelector('#cpAccs').innerHTML = Object.keys(PL).map(x => {
        const a = accs[x] || {}, t = M.targets[x] || {};
        const r = (M.results || {})[x];
        const note = r && r.posted_at ? (r.by_hand ? 'By hand' : 'Posted') : r && r.handoff ? 'In Slack' : r && r.error ? 'Failed' : !a.on ? 'Not connected' : a.mode === 'notify' ? 'By hand' : a.mode === 'draft' ? 'Draft' : 'Live';
        const cls = r && r.error ? 'e' : (!a.on || a.mode === 'notify') ? 'w' : '';
        const tip = !a.on ? `${PL[x]} is not connected: Slack hands the post to you at post time` : a.mode === 'notify' ? `${PL[x]}: Slack tells the poster at post time` : a.mode === 'draft' ? (x === 'tt' ? 'Lands in your TikTok drafts' : x === 'yt' ? 'Private until the app is approved' : 'Live') : `Posts to ${PL[x]}${a.handle ? ` @${a.handle}` : ''}`;
        return `<button type="button" class="acc ${t.on ? 'on' : ''}" data-acc="${x}" role="switch" aria-checked="${!!t.on}" aria-label="${esc(PL[x])}" ${out ? 'disabled' : ''} ${U() ? U().tipAttr(esc(tip)) : ''}>${bubble(x, a, `md ${t.on ? 'on' : ''}`)}<small class="${cls}">${esc(a.handle ? `@${a.handle}` : PL[x])}</small><small class="${cls}">${esc(note)}</small></button>`;
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
        if (status === 'scheduled' && !Object.values(M.targets).some(t => t.on)) throw new Error('Switch on at least one account.');
        if (status === 'scheduled' && !now && Date.parse(M.at) < Date.now() - 60e3) throw new Error('That time has passed. Pick a later one, or Post now.');
        body.querySelectorAll('.foot button').forEach(b => b.disabled = true);
        await H.apiAH('/api/social/post', { method: 'POST', body: JSON.stringify({ act: ST.act, id: M.id, at: M.at, now: !!now, caption: M.caption, media: M.media.map(mediaOut), targets: M.targets, status, auto: M.auto }) });
        const c = document.querySelector('#v2panel .pclose'); if (c) c.click();
        toast(now ? 'Posting now. The card updates in a minute.' : status === 'scheduled' ? `Scheduled for ${wd(localParts(M.at).day)} ${hm12(localParts(M.at).hm)}.` : 'Draft saved.');
        await reload(true);
        if (now) setTimeout(() => reload(false).catch(() => {}), 25000);
      } catch (e) { err.textContent = e.message; body.querySelectorAll('.foot button').forEach(b => b.disabled = false); }
    };
    const on = (id, fn) => { const b = body.querySelector(id); if (b) b.onclick = fn; };
    on('#cpSched', () => save('scheduled', false));
    /* Post now on a post that is already scheduled (2026-10-20): the worker claims it (scheduled -> posting) and publishes once,
       through the same path as the tick, so a tick firing at the same moment can never post it twice. */
    on('#cpNow', async () => {
      if (!(p && p.status === 'scheduled')) return save('scheduled', true);
      try {
        body.querySelectorAll('.foot button').forEach(b => b.disabled = true);
        await H.apiAH('/api/social/post/now', { method: 'POST', body: JSON.stringify({ id: p.id }) });
        const c = document.querySelector('#v2panel .pclose'); if (c) c.click();
        toast('Posting now. The card updates in a minute.');
        await reload(true); setTimeout(() => reload(false).catch(() => {}), 25000);
      } catch (e) { err.textContent = e.message; body.querySelectorAll('.foot button').forEach(b => b.disabled = false); }
    });
    on('#cpDraft', () => save('draft', false));
    on('#cpDel', async () => { if (!(await H.confirmModal('Delete this post?', p && p.status === 'posted' ? 'It stays on the platforms; only the card here goes.' : 'It will not go out.', 'Delete'))) return; try { await H.apiAH(`/api/social/post?id=${encodeURIComponent(M.id)}`, { method: 'DELETE' }); const c = document.querySelector('#v2panel .pclose'); if (c) c.click(); await reload(true); } catch (e) { err.textContent = e.message; } });
    on('#cpRetry', async () => { try { await H.apiAH('/api/social/post/retry', { method: 'POST', body: JSON.stringify({ id: M.id }) }); const c = document.querySelector('#v2panel .pclose'); if (c) c.click(); toast('Going again within a few minutes.'); await reload(false); } catch (e) { err.textContent = e.message; } });
    on('#cpDup', () => composer(null, { at: nextSlot(), items: M.media.map(m => ({ ...m, caption: M.caption })) }));
    on('#cpRe', async () => {
      const b = body.querySelector('#cpRe'), o = body.querySelector('#cpOpts'); b.disabled = true; b.textContent = 'Writing…';
      try { const r = await H.apiAH('/api/social/rephrase', { method: 'POST', body: JSON.stringify({ act: ST.act, text: body.querySelector('#cpCap').value, note: M.media[0] ? `the post shows: ${M.media[0].title}` : '' }) });
        o.innerHTML = (r.captions || []).map(c => `<button type="button" class="opt">${esc(c)}</button>`).join('') || '<p class="hint">Nothing came back.</p>';
        o.querySelectorAll('.opt').forEach(x => x.onclick = () => { body.querySelector('#cpCap').value = x.textContent; o.innerHTML = ''; });
      } catch (e) { err.textContent = e.message; }
      b.disabled = false; b.textContent = `Rephrase in ${brandName()}'s voice`;
    });
    on('#cpSaved', async () => {
      const o = body.querySelector('#cpOpts'); o.innerHTML = '<p class="hint">Reading…</p>';
      try { const r = await H.apiAH(`/api/social/captions?act=${encodeURIComponent(ST.act)}`, { fresh: true });
        o.innerHTML = (r.captions || []).map(c => `<button type="button" class="opt" data-cid="${esc(c.id)}">${esc(c.text)}<span style="display:block;color:var(--muted);font-size:11px;margin-top:3px">${esc(c.created_by || '')} · <u data-del="${esc(c.id)}">remove</u></span></button>`).join('') || '<p class="hint">No saved captions yet. Write one and press Save this one.</p>';
        o.querySelectorAll('.opt').forEach(x => x.onclick = e => { if (e.target.dataset.del) { H.apiAH(`/api/social/captions?id=${encodeURIComponent(e.target.dataset.del)}`, { method: 'DELETE' }).then(() => x.remove()).catch(er => { err.textContent = er.message; }); return; } body.querySelector('#cpCap').value = x.firstChild.textContent; o.innerHTML = ''; });
      } catch (e) { o.innerHTML = ''; err.textContent = e.message; }
    });
    on('#cpSave', async () => { const t = body.querySelector('#cpCap').value.trim(); if (!t) { err.textContent = 'Write a caption first.'; return; } try { await H.apiAH('/api/social/captions', { method: 'POST', body: JSON.stringify({ act: ST.act, text: t }) }); toast('Saved.'); } catch (e) { err.textContent = e.message; } });
  }
  /* ---------- Fill the week (2026-10-20): proposals from the worker, reviewed here, scheduled one by one ---------- */
  async function fillWeek() {
    const accs = ST.data.accounts || {};
    U().panel.wide = !PHONE();
    const body = U().panel('Fill the week', `<div class="sw-pn sw-fill"><p class="hint">Reading the tray…</p></div>`);
    let r;
    try { r = await H.apiAH('/api/social/fill', { method: 'POST', body: JSON.stringify({ act: ST.act, week: ST.from }) }); }
    catch (e) { body.innerHTML = `<div class="sw-pn"><p class="err">${esc(e.message)}</p></div>`; return; }
    const P = (r.proposals || []).map(x => ({ ...x, targets: { ...x.targets } }));
    const used = () => new Set(P.map(x => x.item.ref));
    const draw = () => {
      body.innerHTML = `<div class="sw-pn sw-fill">
        <p class="hint">${esc(r.planned)} of ${esc(r.target)} planned this week${r.need ? `, ${esc(r.need)} to go` : ''}. ${P.length ? 'Change a caption, swap or remove a row, then Schedule all. Nothing is saved until then.' : ''}</p>
        ${r.note ? `<p class="hint" style="color:var(--warn)">${esc(r.note)}</p>` : ''}
        ${P.map((x, i) => `<div class="fr" data-i="${i}">
          <span class="th" ${x.item.thumb ? `style="background-image:url('${esc(x.item.thumb)}')"` : ''}><i>${x.item.kind === 'video' ? 'VIDEO' : 'PHOTO'}</i></span>
          <div class="fb">
            <div class="ft"><b>${esc(wd(x.day))} ${esc(hm12(x.hm))}</b><span class="hint">${esc(SRC[x.item.src] || x.item.src)} · ${esc(x.item.title || '')}</span></div>
            <textarea data-cap="${i}" aria-label="Caption">${esc(x.caption || '')}</textarea>
            <div class="fa">${Object.keys(PL).filter(k2 => accs[k2] && accs[k2].on).map(k2 => `<button type="button" class="acc sm ${x.targets[k2] && x.targets[k2].on ? 'on' : ''}" data-t="${i}:${k2}" role="switch" aria-checked="${!!(x.targets[k2] && x.targets[k2].on)}" aria-label="${esc(PL[k2])}" ${U() ? U().tipAttr(PL[k2]) : ''}>${bubble(k2, accs[k2], 'sm')}</button>`).join('')}
              <span class="sp"></span><button type="button" class="sw-btn sm" data-swap="${i}">Swap</button><button type="button" class="sw-btn sm q" data-rm="${i}">Remove</button></div>
          </div></div>`).join('')}
        <div class="err" id="flErr"></div>
        <div class="foot"><button type="button" class="sw-btn pri" id="flGo" ${P.length ? '' : 'disabled'}>Schedule all ${P.length}</button><button type="button" class="sw-btn q" id="flX">Cancel</button></div></div>`;
      body.querySelectorAll('[data-cap]').forEach(t => t.oninput = () => { P[+t.dataset.cap].caption = t.value; });
      body.querySelectorAll('[data-t]').forEach(b => b.onclick = () => { const [i, k2] = b.dataset.t.split(':'); const x = P[+i]; x.targets[k2] = { ...(x.targets[k2] || {}), on: !(x.targets[k2] && x.targets[k2].on) }; draw(); });
      body.querySelectorAll('[data-rm]').forEach(b => b.onclick = () => { P.splice(+b.dataset.rm, 1); draw(); });
      body.querySelectorAll('[data-swap]').forEach(b => b.onclick = () => {
        const i = +b.dataset.swap, taken = used();
        const list = ST.tray.filter(it => !it.used && it.kind !== 'text' && (it.file || it.key) && !taken.has(it.ref));
        if (!list.length) { body.querySelector('#flErr').textContent = 'Nothing else unused on the tray.'; return; }
        const { w, done } = modal(`<div class="fl"><h3>Swap for</h3><div class="sw-pick">${list.map(it => `<button type="button" data-ref="${esc(it.ref)}"><span class="th" ${it.thumb ? `style="background-image:url('${esc(it.thumb)}')"` : ''}></span><span class="t">${esc(it.title)}</span></button>`).join('')}</div><div class="foot"><button type="button" class="sw-btn" data-x="1">Close</button></div></div>`);
        w.querySelectorAll('[data-ref]').forEach(x2 => x2.onclick = () => {
          const it = list.find(z => z.ref === x2.dataset.ref); done();
          const x = P[i]; x.item = { ref: it.ref, src: it.src, kind: it.kind, title: it.title, sub: it.sub || '', thumb: it.thumb, file: it.file || null, key: it.key || null, who: it.who || null, idea: it.idea || null };
          if (it.caption) x.caption = it.caption;
          if (x.targets.yt) x.targets.yt.on = x.targets.yt.on && it.kind === 'video';
          draw();
        });
      });
      body.querySelector('#flX').onclick = () => { const c = document.querySelector('#v2panel .pclose'); if (c) c.click(); };
      body.querySelector('#flGo').onclick = async () => {
        const g = body.querySelector('#flGo'), err = body.querySelector('#flErr'); err.textContent = '';
        const bad = P.findIndex(x => !Object.values(x.targets).some(t => t.on));
        if (bad >= 0) { err.textContent = `Row ${bad + 1} has no account switched on.`; return; }
        g.disabled = true; let n = 0;
        for (const x of P) {
          try {
            await H.apiAH('/api/social/post', { method: 'POST', body: JSON.stringify({ act: ST.act, at: x.at, caption: x.caption || '', media: [mediaOut(x.item)], targets: x.targets, status: 'scheduled', auto: true }) });
            n++; g.textContent = `Scheduled ${n} of ${P.length}…`;
          } catch (e) { err.textContent = `Stopped at row ${n + 1}: ${e.message}`; g.disabled = false; g.textContent = `Schedule the rest (${P.length - n})`; P.splice(0, n); draw(); return; }
        }
        const c = document.querySelector('#v2panel .pclose'); if (c) c.click();
        toast(`${n} post${n === 1 ? '' : 's'} scheduled.`);
        await reload(true);
      };
    };
    draw();
  }
  function resultsBox(el, p) {
    const res = p.results || {};
    const rows = Object.keys(PL).filter(x => p.targets[x] && p.targets[x].on).map(x => {
      const r = res[x] || {};
      const nums = r.posted_at ? `<span class="sw-mr">${r.views != null ? `<span><b>${k(r.views)}</b> views</span>` : ''}${r.likes != null ? `<span><b>${k(r.likes)}</b> likes</span>` : ''}${r.comments != null ? `<span><b>${k(r.comments)}</b> comments</span>` : ''}${r.views == null && r.likes == null ? '<span>numbers tomorrow</span>' : ''}</span>` : '';
      const line = r.posted_at ? `<b>${r.by_hand ? 'Posted by hand' : r.draft ? 'Sent' : 'Posted'}</b>${r.url ? ` <a href="${esc(r.url)}" target="_blank" rel="noopener">Open</a>` : ''}${r.note ? `<span class="w">${esc(r.note)}</span>` : ''}` : r.handoff ? `<span class="w">Handed to you in Slack${r.error ? ` (${esc(r.error)})` : ''}.</span> <button type="button" class="sw-btn sm" data-hand="${x}">Posted by hand</button>` : r.error ? `<span class="e">${esc(r.error)}</span>` : '<span>Waiting</span>';
      return `<div class="r">${bubble(x, (ST.data.accounts || {})[x], '')}<div><div class="ln">${line}</div>${nums}</div></div>`;
    }).join('');
    el.innerHTML = `<div class="sw-res">${rows}</div>${p.error ? `<p class="err" style="margin:6px 0 0">${esc(p.error)}</p>` : ''}`;
    el.querySelectorAll('[data-hand]').forEach(b => b.onclick = async () => {
      const url = await askUrl(); if (url === null) return;
      try { const r = await H.apiAH('/api/social/post/byhand', { method: 'POST', body: JSON.stringify({ id: p.id, plat: b.dataset.hand, url: url || undefined }) }); Object.assign(p, r.post); resultsBox(el, p); await reload(false); } catch (e) { toast(e.message); }
    });
  }
  function askUrl() {
    return new Promise(res => {
      const { w, done } = modal(`<div class="fl"><h3>Posted by hand</h3><p class="hint">Paste the post's link if you have it (optional), so the card can show it.</p><input type="text" id="buUrl" placeholder="https://"><div class="foot"><button type="button" class="sw-btn" data-x="1">Cancel</button><button type="button" class="sw-btn pri" id="buOk">Mark posted</button></div></div>`, () => res(null));
      w.querySelector('#buOk').onclick = () => { const v = w.querySelector('#buUrl').value.trim(); done(true); res(v); };
    });
  }
  function pickModal(onPick) {
    const list = ST.tray.filter(i => i.kind !== 'text');
    const { w, done } = modal(`<div class="fl"><h3>From the tray</h3><div class="sw-pick">${list.map(it => `<button type="button" data-ref="${esc(it.ref)}"><span class="th" ${it.thumb ? `style="background-image:url('${esc(it.thumb)}')"` : ''}></span><span class="t">${esc(it.title)}</span></button>`).join('') || '<p class="hint">Nothing in the tray yet.</p>'}</div><div class="foot"><button type="button" class="sw-btn" data-x="1">Close</button></div></div>`);
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

  /* ---------- Brand settings > Social: the four connections in one table-like card ---------- */
  async function connect(el, act, host) {
    H = host || H; css();
    if (!el || !act || act === 'all') return;
    el.innerHTML = '<p class="v2hint">Reading the accounts…</p>';
    let d; try { d = await H.apiAH(`/api/social/accounts?act=${encodeURIComponent(act)}`, { fresh: true }); } catch (e) { el.innerHTML = `<p class="v2bad">${esc(e.message)}</p>`; return; }
    const A = d.accounts || {}, keys = d.keys || {}, cli = CLI();
    const modes = [['live', 'Live'], ['draft', 'Draft'], ['notify', 'By hand']];
    const modeTip = 'Live posts straight to the account. Draft lands in TikTok\'s inbox or as private on YouTube until the app is approved. By hand: Slack tells the poster at post time.';
    const sub = { ig: 'Business account, through its Page', fb: 'The brand\'s Page', tt: 'Content Posting', yt: 'Uploads' };
    const row = (plat, how) => {
      const a = A[plat];
      const st = !a ? '<span class="sw-st"><i></i>Not connected</span>' : a.status === 'error' ? `<span class="sw-st bad"><i></i>Needs reconnecting</span>` : `<span class="sw-st ok"><i></i>Connected${a.connected_at ? ` ${esc(new Date(a.connected_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }))}` : ''}</span>`;
      const mode = a && !cli ? `<span class="sw-sel" ${U() ? U().tipAttr(modeTip) : ''}><select data-mode="${plat}" aria-label="How it posts">${modes.map(([m, l]) => `<option value="${m}" ${a.mode === m ? 'selected' : ''}>${l}</option>`).join('')}</select></span>` : a ? esc((modes.find(([m]) => m === a.mode) || [])[1] || a.mode || '') : '<span style="color:var(--muted)">–</span>';
      return `<tr><td><span class="pl"><span class="av" ${a?.pic ? `style="background-image:url('${esc(a.pic)}')"` : ''}>${a?.pic ? '' : PK[plat]}</span>${PL[plat]}</span></td>
        <td><span class="acc">${a ? `${a.handle ? `@${esc(a.handle)}` : esc(a.name || '')}${a.name && a.handle && a.name.toLowerCase() !== a.handle.toLowerCase() ? `<small>${esc(a.name)}</small>` : ''}` : `<span style="color:var(--muted)">${sub[plat]}</span>`}</span></td>
        <td>${st}${a?.status === 'error' && a.error ? `<small style="display:block;color:var(--muted);font-size:11.5px">${esc(a.error)}</small>` : ''}</td>
        <td>${mode}</td>
        <td class="r">${cli ? '' : `<span class="acts">${how}${a ? `<button type="button" class="sw-btn sm q" data-forget="${plat}">Forget</button>` : ''}</span>`}</td></tr>`;
    };
    const notSet = what => `<span class="sw-st warn" ${U() ? U().tipAttr(`${what} is not set up on the server yet. Ask Cole.`) : ''}><i></i>Needs setup</span>`;
    const metaHow = keys.meta ? `<button type="button" class="sw-btn sm ${A.fb || A.ig ? '' : 'pri'}" data-meta="1">${A.fb || A.ig ? 'Change the Page' : 'Connect'}</button>` : notSet('The Meta token');
    const ttHow = keys.tiktok ? `<button type="button" class="sw-btn sm ${A.tt ? '' : 'pri'}" data-oauth="tiktok">${A.tt ? 'Reconnect' : 'Connect'}</button>` : notSet('The TikTok app');
    const ytHow = keys.google ? `<button type="button" class="sw-btn sm ${A.yt ? '' : 'pri'}" data-oauth="youtube">${A.yt ? 'Reconnect' : 'Connect'}</button>` : notSet('The Google sign-in');
    el.innerHTML = `<div class="sw"><div class="sw-conn"><div class="hd"><b>Accounts</b><p>${cli ? 'Where the Week screen posts. The Mobius team connects these.' : 'Where the Week screen posts. A platform not connected, or set to By hand, is handed to the poster in Slack at post time.'}</p></div>
      <div class="tw"><table><thead><tr><th>Platform</th><th>Account</th><th>Status</th><th>Mode</th><th></th></tr></thead><tbody>${row('ig', metaHow)}${row('fb', '')}${row('tt', ttHow)}${row('yt', ytHow)}</tbody></table></div>
      <div class="msg" id="swConnMsg"></div></div></div>`;
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
        const { w, done } = modal(`<div class="fl"><h3>Which Page is ${esc(brandNameOf(act))}?</h3>${r.missing?.length ? `<p class="hint" style="color:var(--warn)">The Meta token is missing ${esc(r.missing.join(' and '))}. Posting will fail until it is regenerated with those.</p>` : ''}
          <div style="display:grid;gap:6px;max-height:50vh;overflow:auto">${(r.pages || []).map(p => `<button type="button" class="pg" data-pg="${esc(p.id)}"><span class="av" ${p.pic ? `style="background-image:url('${esc(p.pic)}')"` : ''}></span><span><b>${esc(p.name)}</b><small>${p.ig ? `Instagram @${esc(p.ig.handle)}` : 'No Instagram business account on this Page'}</small></span></button>`).join('') || '<p class="hint">The token sees no Pages yet. Assign the brand’s Page to the Mobius Tools system user first.</p>'}</div>
          <div class="err" id="mpErr"></div><div class="foot"><button type="button" class="sw-btn" data-x="1">Cancel</button></div></div>`);
        w.querySelectorAll('[data-pg]').forEach(b => b.onclick = async () => { b.disabled = true; try { const x = await H.apiAH('/api/social/accounts/meta', { method: 'POST', body: JSON.stringify({ act, page_id: b.dataset.pg }) }); done(true); toast(`Connected Facebook${x.ig ? ' and Instagram' : ''}.`); connect(el, act, H); } catch (e) { w.querySelector('#mpErr').textContent = e.message; b.disabled = false; } });
      } catch (e) { msg.textContent = e.message; }
      mb.disabled = false; mb.textContent = A.fb || A.ig ? 'Change the Page' : 'Connect';
    };
  }
  function brandNameOf(act) { return ((H.S.accounts || []).find(a => a.act_id === act) || {}).name || 'this brand'; }

  window.SocialWeek = { render, connect, setHost: h => { H = h; } };
})();

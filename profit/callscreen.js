/* THE CALL SCREENS on the Locus kit (2026-10-20, phase 2 of the UX audit; first built 2026-10-19).
 * The screen Cole shares on a call and walks top to bottom: the Monday call (every brand, red first), a client call (one
 * brand, the client watching) and the creative kickoff (the strategist walks the design team through each brief).
 *
 * Layout: the host's page header (pageHead; the only action is Present), ONE row of step pills (done ones ticked, the
 * current one filled, the overflow folded into "+N", Finish always last), kit sections (15px title, one caption line
 * that says where the thing goes or came from, then the body), and a sticky bar at the bottom: Back, where you are,
 * the clock, Next, and one live sentence of what Finish will do. What Locus filled reads as content; what the person
 * types is a field whose placeholder says what to type. Owner and date are pills that open Locus's own menus.
 * Present = full screen with the Locus menus hidden; Exit or Esc leaves it; the page scrolls.
 * What is typed autosaves to the call row (account-health callscreen.js, p_call). Finish sends it where it lives.
 * Opened from Work > Meetings ("Run a call"), or ?open=calls&call=monday|client|kickoff|creator[&act=].
 * 2026-11-09: the creator call (one brand's creators on Discord, 20 minutes; Lucky 45 on its Stage): What's new, What
 * sold (this week's winning creator videos, played in place), What we want, Questions, One ask. The Mobius Call Playbook.
 * Classic script, own closure. window.CallScreen = { open(host, kind, act) }; host = {S, api, apiAH, show, pageHead}.
 * The request bodies (/api/calls/*) are unchanged from the first build.
 */
(() => {
  let H = null, D = null, KIND = 'monday', POS = 0, RESUME_Y = 0, STATE = {}, SEV = {}, SAVE_T = null, CLOCK = null, CLOCK_START = 0, CLOCK_FOR = 0, CARD = {}, BUSY = false, SHOW_OLD = false, OPEN_POSTS = {};
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const dt = iso => new Date(String(iso).slice(0, 10) + 'T12:00:00Z');
  const md = iso => iso ? dt(iso).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' }) : '';
  const short = iso => iso ? dt(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' }) : '';
  const addDays = (iso, n) => { const d = dt(iso); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
  const when = iso => { try { return new Date(iso).toLocaleString('en-US', { weekday: 'short', hour: 'numeric', minute: '2-digit', timeZone: 'America/Chicago' }).replace(',', ''); } catch { return ''; } };
  const clock = iso => { try { return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'America/Chicago' }); } catch { return ''; } };
  const money = n => n == null ? '–' : '$' + (Math.abs(n) >= 10000 ? (Math.round(n / 100) / 10).toLocaleString('en-US') + 'K' : Math.round(n).toLocaleString('en-US'));
  const x2 = n => n == null ? '–' : (+n).toFixed(2).replace(/0$/, '') + 'x';
  const pct = (a, b) => (a == null || !b) ? null : Math.round((a / b - 1) * 100);
  const plural = (n, w, ws) => `${n} ${n === 1 ? w : (ws || w + 's')}`;
  const firstName = s => String(s || '').split(/[@\s._]/)[0].replace(/^./, c => c.toUpperCase());
  const post = (path, body) => H.apiAH(path, { method: 'POST', body: JSON.stringify(body) });
  const toast = msg => { const t = document.createElement('div'); t.setAttribute('role', 'status'); t.className = 'cs-toast'; t.textContent = msg; document.body.appendChild(t); setTimeout(() => t.remove(), 4500); };
  const today = () => (D && D.today) || new Date().toISOString().slice(0, 10);
  const ROLE = { Cole: 'Owner', Ahsan: 'Strategist', Noma: 'Strategist', William: 'Designer', Ravo: 'Video', Radhesh: 'Google', Hamza: 'Amazon' };
  const HUE = { Cole: 'var(--brand)', Ahsan: 'var(--c-tiktok)', Noma: 'var(--c-email)', William: 'var(--c-google)', Ravo: 'var(--c-else)', Radhesh: 'var(--c-meta)', Hamza: 'var(--c-amazon)' };
  /* Slack names are full names ("Nomaqhawe Molife"); the team calls people by the roster's first names. */
  const teamName = by => { const f = firstName(by); return Object.keys(ROLE).find(k => f.toLowerCase().startsWith(k.toLowerCase())) || f; };
  const CHAN = { meta: 'Meta', google: 'Google', tiktok: 'TikTok', pinterest: 'Pinterest', amazon: 'Amazon', email: 'Email' };
  const ICON = {
    cal: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18"/></svg>',
    check: '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>',
  };

  /* ---------- a kit section: title, one caption line (where it goes or came from), the body ---------- */
  const sec = (title, cap, body, cls = '') => `<section class="cs-sec ${cls}"><header><h3>${title}</h3>${cap ? `<p class="cap">${cap}</p>` : ''}</header><div class="cs-body">${body}</div></section>`;
  const empty = t => `<p class="cs-empty">${t}</p>`;

  /* ---------- look (tokens only, both themes; phone.css has no .cs rules of its own) ---------- */
  function css() {
    if (document.getElementById('cscss')) return;
    const st = document.createElement('style'); st.id = 'cscss';
    st.textContent = `
      .cs{max-width:1080px;margin:0 auto;display:flex;flex-direction:column;gap:16px;min-width:0;padding-bottom:12px;font-size:14px}
      .cs .cs-steps{display:flex;align-items:center;gap:6px;flex-wrap:wrap;min-width:0}
      .cs .cs-steps .cs-pill{flex:0 0 auto;display:inline-flex;align-items:center;gap:6px;height:28px;padding:0 11px;border-radius:var(--r-pill);border:1px solid var(--line);background:var(--surface);font:inherit;font-size:13px;font-weight:550;color:var(--ink-2);cursor:pointer;white-space:nowrap;transition:border-color var(--t-fast) var(--ease),background var(--t-fast) var(--ease)}
      .cs .cs-steps .cs-pill:hover{border-color:var(--line-strong);color:var(--ink)}
      .cs .cs-steps .cs-pill[aria-current="true"]{background:var(--ink);color:var(--surface);border-color:var(--ink);font-weight:600}
      .cs .cs-steps .cs-pill.done{color:var(--muted)}
      .cs .cs-steps .cs-pill.done svg{color:var(--good)}
      .cs .cs-steps .cs-pill.more{border-style:dashed;color:var(--muted)}
      .cs .cs-steps .cs-pill .dot{width:7px;height:7px;border-radius:50%;background:var(--line-strong);flex:0 0 7px}
      .cs .cs-steps .cs-pill .dot.bad{background:var(--bad)}.cs .cs-steps .cs-pill .dot.warn{background:var(--warn)}.cs .cs-steps .cs-pill .dot.good{background:var(--good)}
      .cs .cs-steps .cs-pill[aria-current="true"] .dot{outline:1px solid var(--surface)}
      .cs .cs-steps .sep{color:var(--muted);font-size:12px;padding:0 2px}
      .cs .cs-steps .arrow{color:var(--muted);font-size:12px;padding:0 4px}
      .cs .cs-sec{background:var(--surface);border:1px solid var(--line);border-radius:var(--r-lg);padding:16px 18px;display:flex;flex-direction:column;gap:14px;min-width:0}
      .cs .cs-sec header{display:flex;flex-direction:column;gap:2px}
      .cs .cs-sec header h3{font-size:15px;font-weight:600;margin:0;color:var(--ink);letter-spacing:-.005em}
      .cs .cs-sec header .cap{margin:0;font-size:12px;font-weight:500;color:var(--muted);line-height:1.4}
      .cs .cs-body{display:flex;flex-direction:column;gap:12px;min-width:0}
      .cs .cs-empty{margin:0;color:var(--muted);font-size:14px}
      .cs .cs-sub{font-size:12px;font-weight:500;color:var(--muted);margin:2px 0 -4px}
      .cs .cs-tiles{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px}
      .cs .cs-tile{background:var(--bg);border:1px solid var(--line);border-radius:var(--r-lg);padding:12px 14px 11px;display:flex;flex-direction:column;gap:4px;min-width:0}
      .cs .cs-tile .l{font-size:12px;font-weight:500;color:var(--muted)}
      .cs .cs-tile .v{font-size:22px;font-weight:600;letter-spacing:-.02em;line-height:1.15;color:var(--ink);font-variant-numeric:tabular-nums;display:flex;align-items:center;gap:8px;flex-wrap:wrap}
      .cs .cs-tile .sub{font-size:12px;color:var(--muted);font-variant-numeric:tabular-nums}
      .cs .cs-d{display:inline-flex;align-items:center;height:20px;padding:0 7px;border-radius:var(--r-pill);font-size:12px;font-weight:600;font-variant-numeric:tabular-nums;white-space:nowrap}
      .cs .cs-d.up{color:var(--good);background:var(--good-bg)}.cs .cs-d.down{color:var(--bad);background:var(--bad-bg)}.cs .cs-d.flat{color:var(--muted);background:var(--bg)}
      .cs table.cs-tbl{width:100%;border-collapse:collapse;font-size:13px;font-variant-numeric:tabular-nums}
      .cs .cs-tbl th{text-align:right;font-size:12px;font-weight:500;color:var(--muted);padding:0 8px 6px}
      .cs .cs-tbl th:first-child,.cs .cs-tbl td:first-child{text-align:left;padding-left:0}
      .cs .cs-tbl td{text-align:right;padding:8px;border-top:1px solid var(--line);height:36px}
      .cs .cs-tbl td:first-child{font-weight:550;color:var(--ink)}
      .cs .cs-tbl small{font-size:12px;margin-left:5px;font-weight:600}
      .cs .cs-tbl small.up{color:var(--good)}.cs .cs-tbl small.down{color:var(--bad)}
      .cs .cs-tw{overflow-x:auto}
      .cs .ads{display:grid;grid-template-columns:repeat(auto-fill,minmax(136px,1fr));gap:10px}
      .cs .ad{border:1px solid var(--line);border-radius:var(--r-lg);overflow:hidden;background:var(--bg);min-width:0;display:flex;flex-direction:column;text-align:left;padding:0;cursor:pointer;font:inherit;color:inherit;transition:border-color var(--t-fast) var(--ease)}
      .cs .ad:hover{border-color:var(--line-strong)}
      .cs .ad .th{aspect-ratio:4/5;width:100%;background:var(--line) center/cover no-repeat;position:relative;display:grid;place-items:center;font-size:12px;color:var(--muted);text-align:center;padding:8px}
      .cs .ad .play{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);width:34px;height:34px;border-radius:50%;background:rgba(0,0,0,.55);color:#fff;display:grid;place-items:center;font-size:13px}
      .cs .ad .m{padding:8px 10px 0;font-size:13px;font-weight:600;color:var(--ink);font-variant-numeric:tabular-nums;display:flex;justify-content:space-between;gap:6px}
      .cs .ad .m.lose{color:var(--bad)}
      .cs .ad .n{padding:2px 10px 0;font-size:12px;color:var(--ink-2);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      .cs .ad .s{padding:0 10px 9px;font-size:12px;color:var(--muted);font-variant-numeric:tabular-nums}
      .cs .cs-link{background:none;border:0;padding:0;font:inherit;font-size:13px;font-weight:550;color:var(--brand);cursor:pointer;text-decoration:none;align-self:flex-start}
      .cs .cs-link:hover{text-decoration:underline}
      .cs .chk{list-style:none;margin:0;padding:0;display:flex;flex-direction:column}
      .cs .chk li{display:flex;gap:10px;align-items:center;min-height:40px;padding:6px 0;border-top:1px solid var(--line);font-size:14px;line-height:1.4}
      .cs .chk li:first-child{border-top:0}
      .cs .chk li input[type=checkbox]{accent-color:var(--brand);width:16px;height:16px;flex:0 0 16px;margin:0;cursor:pointer}
      .cs .chk li.off .tx{color:var(--muted);text-decoration:line-through}
      .cs .chk li .tx{flex:1;min-width:0;overflow-wrap:anywhere;color:var(--ink)}
      .cs .chk li .tx b{font-weight:600}
      .cs .chk li .o{font-size:12px;color:var(--muted);white-space:nowrap;font-variant-numeric:tabular-nums}
      .cs .chk li .o.late{color:var(--bad);font-weight:600}
      .cs details.cs-more summary{cursor:pointer;color:var(--muted);font-size:12px;font-weight:500;list-style:none}
      .cs details.cs-more summary::before{content:'›';display:inline-block;margin-right:5px;transition:transform var(--t-fast) var(--ease)}
      .cs details.cs-more[open] summary::before{transform:rotate(90deg)}
      .cs details.cs-more[open] summary{margin-bottom:6px}
      .cs .posts{display:flex;flex-direction:column;gap:14px}
      .cs .slk .txt{font-size:14px;line-height:1.55;color:var(--ink);white-space:pre-wrap;overflow-wrap:anywhere;margin:0}
      .cs .slk .txt a{color:var(--brand);font-weight:550}
      .cs .slk .rest{margin-top:8px}
      .cs .slk .rest[hidden]{display:none}
      .cs .slk .src{margin:6px 0 0;font-size:12px;font-weight:500;color:var(--muted);display:flex;gap:6px;align-items:center;flex-wrap:wrap}
      .cs .slk .src a,.cs .slk .src button{font:inherit;font-size:12px;font-weight:550;color:var(--brand);background:none;border:0;padding:0;cursor:pointer;text-decoration:none}
      .cs .slk .src a:hover,.cs .slk .src button:hover{text-decoration:underline}
      .cs textarea,.cs input[type=text],.cs input[type=date]{width:100%;font:inherit;font-size:14px;color:var(--ink);background:var(--surface);border:1px solid var(--line-strong);border-radius:var(--r-sm);padding:6px 10px;min-height:32px}
      .cs textarea{resize:none;min-height:64px;line-height:1.5;overflow:hidden;padding:8px 10px}
      .cs textarea:focus,.cs input:focus{outline:2px solid var(--brand);outline-offset:1px}
      .cs ::placeholder{color:var(--muted);opacity:.9}
      .cs .rows{display:flex;flex-direction:column}
      .cs .row{display:grid;grid-template-columns:minmax(0,1fr) auto auto 28px;gap:8px;align-items:center;min-height:40px;padding:4px 0;border-top:1px solid var(--line)}
      .cs .row:first-child{border-top:0}
      .cs .row.asks{grid-template-columns:minmax(0,1fr) auto 28px}
      .cs .row .t{font-size:14px;line-height:1.4;color:var(--ink);padding:4px 6px;margin-left:-6px;border-radius:var(--r-sm);min-width:0;overflow-wrap:anywhere}
      .cs [contenteditable]{outline:none;cursor:text}
      .cs [contenteditable]:hover{background:var(--surface-2)}
      .cs [contenteditable]:focus{background:var(--surface-2);box-shadow:0 0 0 1px var(--line-strong)}
      .cs .row .t.empty:not(:focus)::before{content:attr(data-ph);color:var(--muted)}
      .cs .row .x{width:28px;height:28px;border:0;background:transparent;border-radius:var(--r-sm);color:var(--muted);font-size:18px;line-height:1;cursor:pointer;display:inline-flex;align-items:center;justify-content:center}
      .cs .row .x:hover{color:var(--bad);background:var(--surface-2)}
      .cs .cs-chip{height:28px;max-width:100%;padding:0 9px 0 4px;border-radius:var(--r-pill);border:1px solid transparent;background:transparent;color:var(--ink);font:inherit;font-size:13px;display:inline-flex;align-items:center;gap:6px;cursor:pointer;white-space:nowrap;overflow:hidden;transition:border-color var(--t-fast) var(--ease),background var(--t-fast) var(--ease)}
      .cs .cs-chip.date{padding:0 9px}
      .cs .cs-chip:hover{background:var(--surface-2);border-color:var(--line-strong)}
      .cs .cs-chip.need{color:var(--muted);border-color:var(--line-strong);border-style:dashed}
      .cs .cs-chip.late{color:var(--bad)}
      .cs .cs-chip.now{color:var(--warn)}
      .cs .cs-av,.cs-pop .cs-av{width:22px;height:22px;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;font-size:10px;font-weight:700;color:#131316;flex:none;object-fit:cover}
      .cs .cs-av.none{background:transparent;border:1.5px dashed var(--line-strong);color:var(--muted);font-weight:500}
      .cs .add{display:flex;align-items:center;width:100%;min-height:36px;border:0;border-top:1px solid var(--line);background:transparent;text-align:left;color:var(--muted);font:inherit;font-size:13px;cursor:pointer;padding:6px 0 0}
      .cs .add:hover{color:var(--ink)}
      .cs .rows:empty + .add{border-top:0;padding-top:0}
      .cs .warnline{font-size:13px;color:var(--warn);background:var(--warn-bg);border-radius:var(--r-sm);padding:8px 12px}
      .cs .cards{display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:8px}
      .cs .mini{border:1px solid var(--line);border-radius:var(--r-lg);background:var(--bg);padding:10px 12px;text-align:left;font:inherit;color:var(--ink);cursor:pointer;min-width:0;display:flex;flex-direction:column;gap:2px;transition:border-color var(--t-fast) var(--ease)}
      .cs .mini:hover{border-color:var(--line-strong)}
      .cs .mini b{font-size:12px;font-weight:600;color:var(--muted);font-variant-numeric:tabular-nums}
      .cs .mini span{font-size:13px;font-weight:550;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      .cs .mini small{font-size:12px;color:var(--muted)}
      .cs .seg{display:inline-flex;gap:2px;padding:3px;background:var(--surface-2);border-radius:var(--r-lg);align-self:flex-start}
      .cs .seg button{height:26px;padding:0 11px;border:0;border-radius:var(--r-sm);background:transparent;color:var(--muted);font:inherit;font-size:13px;font-weight:550;cursor:pointer}
      .cs .seg button.on{background:var(--surface);color:var(--ink);box-shadow:0 1px 2px rgba(0,0,0,.18)}
      .cs .brief{border:1px solid var(--line);border-radius:var(--r-lg);padding:14px 16px;background:var(--bg);font-size:14px;line-height:1.55;max-height:560px;overflow:auto}
      .cs .brief h1,.cs .brief h2,.cs .brief h3{font-size:15px;margin:10px 0 4px}
      .cs .brief p{margin:0 0 8px}
      .cs .brief ol,.cs .brief ul{margin:0 0 8px 20px}
      .cs .brief img,.cs .brief video{max-width:100%;max-height:300px;border-radius:var(--r-sm);display:block;margin:6px 0}
      .cs .brief [data-ph]{color:var(--muted);font-style:italic}
      .cs .deal{display:flex;gap:16px;align-items:flex-end;flex-wrap:wrap}
      .cs .deal label{display:flex;flex-direction:column;gap:4px;font-size:12px;font-weight:500;color:var(--muted)}
      .cs .deal label input{width:72px;height:32px}
      .cs .deal .cs-chip{height:32px;border-color:var(--line-strong)}
      .cs .picker{display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:8px}
      .cs .picker button{border:1px solid var(--line);background:var(--surface);border-radius:var(--r-lg);padding:14px;text-align:left;font:inherit;font-weight:550;font-size:14px;color:var(--ink);cursor:pointer}
      .cs .picker button:hover{border-color:var(--line-strong)}
      .cs .btn,.cs .v2btn{height:32px;padding:0 12px;border-radius:var(--r-sm);border:1px solid var(--line-strong);background:var(--surface);color:var(--ink);font:inherit;font-size:13px;font-weight:550;display:inline-flex;align-items:center;gap:6px;cursor:pointer;white-space:nowrap;text-decoration:none}
      .cs .btn:hover{border-color:var(--ink-2)}
      .cs .btn.pri{background:var(--ink);border-color:var(--ink);color:var(--surface)}
      .cs .btn:disabled{opacity:.55;cursor:default}
      .cs .cs-acts{display:flex;gap:8px;flex-wrap:wrap}
      .cs .cs-bar{position:sticky;bottom:0;z-index:5;display:flex;flex-direction:column;gap:6px;padding:10px 14px;background:var(--surface);border:1px solid var(--line);border-radius:var(--r-lg);box-shadow:0 -6px 24px rgba(0,0,0,.06);margin-top:4px}
      .cs .cs-bar .r{display:flex;align-items:center;gap:10px;flex-wrap:wrap}
      .cs .cs-bar .where{flex:1;min-width:140px;font-size:13px;color:var(--muted);display:flex;gap:6px;align-items:center;flex-wrap:wrap}
      .cs .cs-bar .where b{color:var(--ink);font-weight:600}
      .cs .cs-clock{font-variant-numeric:tabular-nums;font-size:13px;font-weight:600;color:var(--ink-2)}
      .cs .cs-clock.over{color:var(--bad)}
      .cs .cs-will{font-size:12px;font-weight:500;color:var(--muted)}
      .cs .cs-will b{color:var(--ink-2);font-weight:600}
      .cs .cs-saved{font-size:12px;color:var(--muted)}
      .cs .cs-time{font-size:12px;color:var(--muted)}
      .cs .cs-part{display:flex;align-items:center;gap:10px;margin:10px 0 -4px;font-size:13px;font-weight:650;letter-spacing:.04em;text-transform:uppercase;color:var(--ink-2)}
      .cs .cs-part span{width:24px;height:24px;border-radius:50%;background:var(--ink);color:var(--surface);display:grid;place-items:center;font-size:12px;letter-spacing:0}
      .cs .cs-legend{margin:0;font-size:13px;color:var(--ink-2);display:flex;align-items:center;gap:8px;flex-wrap:wrap}
      .cs .cs-legend .dot{width:9px;height:9px;border-radius:50%;display:inline-block;margin-left:6px}
      .cs .cs-legend .dot.bad{background:var(--bad)}.cs .cs-legend .dot.warn{background:var(--warn)}.cs .cs-legend .dot.good{background:var(--good)}
      .cs .ad .th .tag{position:absolute;left:8px;top:8px;font-size:11px;font-weight:700;padding:3px 8px;border-radius:var(--r-pill);background:#16a34a;color:#fff;box-shadow:0 1px 3px rgba(0,0,0,.35)}
      .cs .ad .th .tag.lose{background:#dc2626}
            .cs .mini small .late{color:var(--bad);font-weight:600}
      .cs .cs-adt tbody tr{cursor:pointer}.cs .cs-adt tbody tr:hover td{background:var(--surface-2)}
      .cs .cs-adt td:first-child{max-width:340px}
      .cs .cs-adt .an{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      .cs .cs-adt small.off{display:block;margin:0;font-weight:500;color:var(--muted)}
      .cs .cs-adt th .srt{background:none;border:0;padding:0;font:inherit;color:inherit;cursor:pointer;white-space:nowrap}
      .cs .cs-adt th .srt.on{color:var(--ink);font-weight:650}
      .cs textarea:placeholder-shown{border-style:dashed;background:var(--bg)}
      .cs input[type=text]:placeholder-shown{border-style:dashed;background:var(--bg)}
      .cs .ad .vid{width:100%;aspect-ratio:9/16;max-height:420px;background:#000;display:block}
      .cs .ask{display:flex;gap:12px;flex-wrap:wrap;align-items:flex-end}
      .cs .ask label{display:flex;flex-direction:column;gap:4px;font-size:12px;font-weight:500;color:var(--muted);min-width:0}
      .cs .ask label.grow{flex:1 1 320px}
      .cs.cs-deck .ask input[type=text]{font-size:18px;min-height:44px}
      .cs .ask input[type=date]{min-height:44px;width:180px}
      .cs .ideas{display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:10px}
      .cs .idea{border:1px solid var(--line);border-radius:var(--r-lg);background:var(--bg);overflow:hidden;display:flex;flex-direction:column;min-width:0;text-decoration:none;color:inherit}
      .cs .idea .th{aspect-ratio:4/5;background:var(--line) center/cover no-repeat}
      .cs .idea b{padding:8px 10px 0;font-size:14px;color:var(--ink)}
      .cs .idea span{padding:2px 10px 10px;font-size:13px;color:var(--ink-2)}
      .cs-toast{position:fixed;left:50%;bottom:24px;transform:translateX(-50%);max-width:min(560px,calc(100vw - 32px));background:var(--ink);color:var(--surface);padding:10px 16px;border-radius:var(--r-lg);font-size:13px;z-index:9999;box-shadow:0 8px 30px rgba(0,0,0,.25)}
      .cs-pop{position:fixed;z-index:9600;min-width:220px;max-width:320px;max-height:420px;overflow:auto;background:var(--surface);border:1px solid var(--line);border-radius:var(--r-lg);padding:6px;box-shadow:var(--sh-pop,0 12px 32px -10px rgba(15,15,25,.3));font-family:inherit;color:var(--ink);animation:lx-pop var(--t-fast) var(--ease) both}
      .cs-pop .h{font-size:11px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:var(--muted);padding:7px 9px 5px}
      .cs-pop button.o{width:100%;height:36px;border:0;border-radius:var(--r-sm);background:transparent;color:var(--ink);font:inherit;font-size:13.5px;display:flex;align-items:center;gap:10px;padding:0 9px;cursor:pointer;text-align:left}
      .cs-pop button.o:hover,.cs-pop button.o.on{background:var(--surface-2)}
      .cs-pop button.o small{margin-left:auto;color:var(--muted);font-size:12px}
      .cs-pop button.o svg{color:var(--good)}
      .cs-pop hr{border:0;border-top:1px solid var(--line);margin:5px 2px}
      .cs-pop .pick{display:flex;gap:8px;align-items:center;padding:6px 9px 8px}
      .cs-pop .pick input[type=date]{flex:1;height:32px;font:inherit;font-size:13px;color:var(--ink);background:var(--surface);border:1px solid var(--line-strong);border-radius:var(--r-sm);padding:0 8px}
      body.cs-present .side,body.cs-present .topbar,body.cs-present #tabbar,body.cs-present #v2seg,body.cs-present #subtabs,body.cs-present footer,body.cs-present #navToggle{display:none!important}
      body.cs-present .app{grid-template-columns:1fr!important}
      body.cs-present main{padding-top:24px!important}
      body.cs-present .cs{max-width:1180px}
      body.cs-present main .ph .ph-crumb,body.cs-present main .ph .ph-menu-w{display:none}
      /* THE CLIENT DECK (2026-10-27): one big slide per step, shared on the call. Cole: "it should be like I'm presenting this". */
      .cs.cs-deck .cs-sec{padding:26px 30px;gap:18px}
      .cs.cs-deck .cs-sec header h3{font-size:24px;letter-spacing:-.015em}
      .cs.cs-deck .cs-sec header .cap{font-size:14px}
      .cs.cs-deck .cs-sub{font-size:13px}
      .cs.cs-deck .cs-tile{padding:16px 18px 14px}
      .cs.cs-deck .cs-tile .l{font-size:13px}
      .cs.cs-deck .cs-tile .v{font-size:32px}
      .cs.cs-deck .cs-tile .sub{font-size:13px}
      .cs.cs-deck table.cs-tbl{font-size:15px}.cs.cs-deck .cs-tbl td{height:42px}
      .cs.cs-deck .ads{grid-template-columns:repeat(auto-fill,minmax(168px,1fr));gap:12px}
      .cs.cs-deck .ad .n{font-size:13px}
      .cs.cs-deck textarea.big{font-size:19px;line-height:1.5;min-height:200px;padding:14px 16px}
      .cs.cs-deck .lines{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:6px}
      .cs.cs-deck .lines li{display:flex;gap:16px;align-items:flex-start;font-size:20px;line-height:1.4;color:var(--ink);padding:12px 0;border-top:1px solid var(--line)}
      .cs.cs-deck .lines li:first-child{border-top:0}
      .cs.cs-deck .lines li i{font-style:normal;flex:0 0 32px;height:32px;border-radius:50%;background:var(--ink);color:var(--surface);display:grid;place-items:center;font-size:14px;font-weight:600;margin-top:2px}
      .cs.cs-deck .chk li{font-size:17px;min-height:48px}
      .cs.cs-deck .chk li .o{font-size:13px}
      .cs.cs-deck .cs-empty{font-size:17px}
      .cs.cs-deck .row .t{font-size:17px}
      .cs.cs-deck .cal{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:6px}
      .cs.cs-deck .cal .dow{font-size:12px;font-weight:600;color:var(--muted);text-align:center;padding:0 0 4px;text-transform:uppercase;letter-spacing:.04em}
      .cs.cs-deck .cal .day{min-height:88px;border:1px solid var(--line);border-radius:var(--r-md);background:var(--bg);padding:6px 7px;display:flex;flex-direction:column;gap:4px;min-width:0}
      .cs.cs-deck .cal .day.today{border-color:var(--brand);box-shadow:inset 0 0 0 1px var(--brand)}
      .cs.cs-deck .cal .day.other{opacity:.55}
      .cs.cs-deck .cal .day .d{font-size:12px;font-weight:600;color:var(--muted);font-variant-numeric:tabular-nums}
      .cs.cs-deck .cal .day.today .d{color:var(--brand)}
      .cs.cs-deck .cal .ev{font-size:12px;line-height:1.3;font-weight:600;color:var(--ink);background:var(--surface);border:1px solid var(--line-strong);border-radius:var(--r-sm);padding:4px 6px;overflow:hidden;min-width:0}
      .cs.cs-deck .cal .ev.tent{border-style:dashed;font-weight:500;color:var(--ink-2)}
      .cs.cs-deck .cal .ev.sale{background:var(--good-bg);border-color:transparent}
      .cs.cs-deck .cal .ev small{display:block;font-weight:500;color:var(--muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      .cs.cs-deck .cal .ev.cont{opacity:.7}
      .cs.cs-deck .cal .ev.quiet{height:10px;padding:0;border-width:1px;background:var(--line);border-color:transparent;opacity:.6;margin-top:7px}
      .cs.cs-deck .cal .ev.quiet.sale{background:var(--good-bg);opacity:1}
      .cs.cs-deck .cal .ev.quiet.tent{background:transparent;border:1px dashed var(--line-strong)}
      .cs.cs-deck .cal-list{display:none;list-style:none;margin:0;padding:0}
      .cs.cs-deck .cal-list li{display:flex;flex-direction:column;gap:2px;padding:10px 0;border-top:1px solid var(--line);font-size:15px}
      .cs.cs-deck .cal-list li:first-child{border-top:0}
      .cs.cs-deck .cal-list li span{font-size:13px;color:var(--muted)}
      .cs.cs-deck .cal-list li.tent b{font-weight:500;color:var(--ink-2)}
      @media (max-width:600px){.cs.cs-deck .cal{display:none}.cs.cs-deck .cal-list{display:block}}
      @media (max-width:760px){.cs.cs-deck .cs-sec{padding:16px}.cs.cs-deck .cs-sec header h3{font-size:20px}.cs.cs-deck .lines li{font-size:17px}.cs.cs-deck .cal .day{min-height:56px;padding:4px}.cs.cs-deck .cal .ev{font-size:10px;padding:2px 4px}.cs.cs-deck .cal .ev small{display:none}}
      @media (max-width:760px){.cs .cs-sec{padding:14px}.cs .row,.cs .row.asks{display:flex;flex-wrap:wrap;align-items:center;gap:4px 8px}.cs .row .t{flex:1 1 100%}.cs .row .x{margin-left:auto}.cs .deal label input{width:100%}}
    `;
    document.head.appendChild(st);
  }

  /* ---------- typed state, autosaved ---------- */
  function save() {
    clearTimeout(SAVE_T);
    const s = $('#csSaved'); if (s) s.textContent = 'Saving';
    SAVE_T = setTimeout(async () => {
      try { await H.apiAH('/api/calls/state', { method: 'PUT', body: JSON.stringify({ id: D.call.id, state: STATE }) }); const t = $('#csSaved'); if (t) t.textContent = 'Saved'; }
      catch (e) { const t = $('#csSaved'); if (t) t.textContent = 'Not saved: ' + e.message; }
    }, 700);
    paintWill();
  }
  const brandState = act => { STATE.brands = STATE.brands || {}; return (STATE.brands[act] = STATE.brands[act] || { read: '', client: '', batches: [], jobs: [], asks: [] }); };
  const grow = t => { t.style.height = 'auto'; t.style.height = (t.scrollHeight + 2) + 'px'; };

  /* ---------- the clock: per step, shown as small text in the bar ---------- */
  function startClock(seconds) {
    clearInterval(CLOCK); CLOCK_START = Date.now(); CLOCK_FOR = seconds;
    const tick = () => {
      const c = $('#csClock'); if (!c) { clearInterval(CLOCK); return; }
      const left = Math.round(CLOCK_FOR - (Date.now() - CLOCK_START) / 1000), a = Math.abs(left);
      c.textContent = String(Math.floor(a / 60)) + ':' + String(a % 60).padStart(2, '0') + (left < 0 ? ' over' : ' left');
      c.classList.toggle('over', left < 0);
    };
    tick(); CLOCK = setInterval(tick, 1000);
  }

  /* ---------- Locus's own menus: owner pill, date pill (a sheet on a phone, never the browser's select) ---------- */
  let POP = null;
  function closePop() { if (!POP) return; POP.el.remove(); document.removeEventListener('mousedown', POP.out, true); document.removeEventListener('keydown', POP.key, true); POP = null; }
  function pop(anchor, title, html, wire) {
    closePop();
    if (window.LxPhone && LxPhone.isPhone && LxPhone.isPhone()) { LxPhone.open(title, `<div class="cs-pop" style="position:static;box-shadow:none;border:0;max-width:none;max-height:none">${html}</div>`, b => wire(b, () => {}, () => LxPhone.close())); return; }
    const el = document.createElement('div'); el.className = 'cs-pop'; el.setAttribute('role', 'menu'); el.innerHTML = `<div class="h">${esc(title)}</div>${html}`;
    document.body.appendChild(el);
    const place = () => { const r = anchor.getBoundingClientRect(), w = el.offsetWidth, h = el.offsetHeight; let top = r.bottom + 6, left = r.left; if (top + h > innerHeight - 8) top = Math.max(8, r.top - h - 6); if (left + w > innerWidth - 8) left = Math.max(8, innerWidth - w - 8); el.style.top = top + 'px'; el.style.left = left + 'px'; };
    place();
    const out = e => { if (!el.contains(e.target) && !anchor.contains(e.target)) closePop(); };
    const key = e => { if (e.key === 'Escape') { closePop(); anchor.focus(); } };
    POP = { el, out, key, place };
    setTimeout(() => { document.addEventListener('mousedown', out, true); document.addEventListener('keydown', key, true); }, 0);
    wire(el, place, closePop);
    const f = el.querySelector('button.o.on') || el.querySelector('button'); if (f) f.focus({ preventScroll: true });
  }
  const pic = n => n && window.ProdSheet && window.ProdSheet.photoOf ? window.ProdSheet.photoOf(n) : '';
  const av = n => n && pic(n) ? `<img class="cs-av" src="${esc(pic(n))}" alt="" referrerpolicy="no-referrer">` : n ? `<span class="cs-av" style="background:${HUE[n] || 'var(--line-strong)'}">${esc(n[0])}</span>` : '<span class="cs-av none">+</span>';
  const ownerChip = (o, attrs = '') => o ? `<button type="button" class="cs-chip" ${attrs} aria-label="Who: ${esc(o)}">${av(o)}<span>${esc(o)}</span></button>` : `<button type="button" class="cs-chip need" ${attrs} aria-label="Pick who">${av('')}<span>Pick who</span></button>`;
  function dueChip(due, attrs = '') {
    const t = today();
    if (!due) return `<button type="button" class="cs-chip date need" ${attrs} aria-label="Pick a date">${ICON.cal}<span>Pick a date</span></button>`;
    const cls = due < t ? ' late' : due === t ? ' now' : '';
    const label = due === t ? 'Today' : due === addDays(t, 1) ? 'Tomorrow' : md(due);
    return `<button type="button" class="cs-chip date${cls}" ${attrs} aria-label="Due ${esc(label)}">${ICON.cal}<span>${esc(label)}${cls === ' late' ? ', late' : ''}</span></button>`;
  }
  function ownerMenu(anchor, cur, onPick) {
    const names = [...new Set([...(D.team || []), ...(cur && !(D.team || []).includes(cur) ? [cur] : [])])];
    pop(anchor, 'Who', `${names.map(n => `<button type="button" class="o${n === cur ? ' on' : ''}" data-v="${esc(n)}">${av(n)}${esc(n)}<small>${esc(ROLE[n] || '')}</small></button>`).join('')}<hr><button type="button" class="o" data-v="">Nobody yet</button>`,
      (el, place, close) => $$('button.o', el).forEach(b => b.onclick = () => { close(); onPick(b.dataset.v); }));
  }
  function dueMenu(anchor, cur, onPick) {
    const t = today(), dow = dt(t).getUTCDay();
    const fri = addDays(t, ((5 - dow + 7) % 7) || 7), mon = addDays(t, ((8 - dow) % 7) || 7);
    const quick = [['Today', t], ['Tomorrow', addDays(t, 1)], ['Friday', fri], ['Next Monday', mon]];
    pop(anchor, 'When', `${quick.map(([l, iso]) => `<button type="button" class="o${iso === cur ? ' on' : ''}" data-v="${iso}">${l}<small>${esc(md(iso))}</small></button>`).join('')}<hr><div class="pick"><input type="date" value="${esc(cur || '')}" aria-label="A date"><button type="button" class="o" data-set style="width:auto;height:32px;padding:0 10px;border:1px solid var(--line-strong)">Set</button></div><hr><button type="button" class="o" data-v="">No date</button>`,
      (el, place, close) => {
        $$('button[data-v]', el).forEach(b => b.onclick = () => { close(); onPick(b.dataset.v); });
        const inp = $('input[type=date]', el), set = $('[data-set]', el);
        set.onclick = () => { if (inp.value) { close(); onPick(inp.value); } };
        inp.onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); set.click(); } };
      });
  }
  function listMenu(anchor, title, opts, onPick) {
    pop(anchor, title, opts.map(o => o === '-' ? '<hr>' : `<button type="button" class="o${o.on ? ' on' : ''}" data-v="${esc(o.v)}">${o.html || esc(o.label)}${o.small ? `<small>${esc(o.small)}</small>` : ''}</button>`).join(''),
      (el, place, close) => $$('button.o', el).forEach(b => b.onclick = () => { close(); onPick(b.dataset.v); }));
  }
  /* contenteditable words: Enter commits, Escape reverts */
  function wireText(el, onCommit) {
    el.setAttribute('contenteditable', 'plaintext-only');
    if (el.contentEditable !== 'plaintext-only') el.setAttribute('contenteditable', 'true');
    el.setAttribute('spellcheck', 'true');
    let was = el.textContent;
    el.onfocus = () => { was = el.textContent; el.classList.remove('empty'); };
    el.onkeydown = e => { if (e.key === 'Enter' && !(e.ctrlKey || e.metaKey)) { e.preventDefault(); el.blur(); } if (e.key === 'Escape') { el.textContent = was; el.blur(); } };
    el.onblur = () => { const v = el.textContent.replace(/\s+/g, ' ').trim(); el.textContent = v; el.classList.toggle('empty', !v); if (v !== was && onCommit) onCommit(v, was); };
  }

  /* ---------- shared pieces ---------- */
  const delta = (a, b, lowerBetter) => { const v = pct(a, b); if (v == null) return ''; const tone = Math.abs(v) < 1 ? 'flat' : (lowerBetter ? v <= 0 : v >= 0) ? 'up' : 'down'; return `<span class="cs-d ${tone}">${v > 0 ? '+' : ''}${v}%</span>`; };
  /* 2026-11-03 rewrite (Cole on the Nov 2 calls: "I don't know what I'm looking at"): every tile says what it counts in
     its own label, and the line under it says what it is compared with. The section caption says where it all comes from.
     Lead ads: MER is shown with AND without the lead ads' spend (Cole did that sum with Siri on the call). */
  const cents = n => n == null ? '–' : '$' + (+n).toFixed(2);
  function tilesHtml(r) {
    const t = r.totals || {}, p = r.prior || {}, f = r.plan || {}, L = r.leads;
    const tile = (l, v, d, sub) => `<div class="cs-tile"><span class="l">${l}</span><span class="v">${v}${d}</span><span class="sub">${sub}</span></div>`;
    const was = (v, f2) => v != null ? `${f2(v)} the week before` : 'no week before to compare';
    const sales = t.sales, spend = t.spend;
    const merNoLeads = L && sales != null && spend > L.spend ? sales / (spend - L.spend) : null;
    const noLeads = merNoLeads ? `. Without lead ads: ${x2(merNoLeads)}` : '';
    const merSub = f.mer ? `${t.mer >= f.mer ? 'on' : 'under'} the ${x2(f.mer)} goal${noLeads}` : `${was(p.mer, x2)}${noLeads}`;
    return `<div class="cs-tiles">
      ${tile('Sales, whole store', money(sales), delta(sales, p.sales), was(p.sales, money))}
      ${tile('Ad spend, every channel', money(spend), delta(spend, p.spend, true), was(p.spend, money))}
      ${tile('MER (sales ÷ ad spend)', x2(t.mer), f.mer && t.mer != null ? `<span class="cs-d ${t.mer >= f.mer ? 'up' : 'down'}">goal ${x2(f.mer)}</span>` : delta(t.mer, p.mer), merSub)}
      ${tile('Orders', t.orders != null ? Math.round(t.orders).toLocaleString('en-US') : '–', delta(t.orders, p.orders), was(p.orders, v => Math.round(v).toLocaleString('en-US')))}
      ${t.ncpa != null ? tile('Cost per new customer', money(t.ncpa), delta(t.ncpa, p.ncpa, true), was(p.ncpa, money)) : ''}
      ${L ? tile('Lead ads (inside ad spend)', money(L.spend), '', `${L.leads.toLocaleString('en-US')} leads at ${cents(L.leads ? L.spend / L.leads : null)} each`) : ''}
    </div>`;
  }
  function chanTable(r) {
    const rows = (r.channels || []).filter(c => c.cur && (c.cur.spend || c.cur.revenue));
    if (!rows.length) return '';
    const cell = (a, b, f, lower) => { const v = pct(a, b); return `${f(a)}${v == null ? '' : `<small class="${(lower ? v <= 0 : v >= 0) ? 'up' : 'down'}">${v > 0 ? '+' : ''}${v}%</small>`}`; };
    return `<p class="cs-sub">Each channel: what it spent, and the sales Triple Whale gives it (last click)</p><div class="cs-tw"><table class="cs-tbl"><thead><tr><th>Channel</th><th>Spent</th><th>Sales it got</th><th>ROAS</th></tr></thead><tbody>
      ${rows.map(c => `<tr><td>${esc(CHAN[c.id] || c.label)}</td><td>${c.cur.spend != null ? cell(c.cur.spend, c.prev && c.prev.spend, money, true) : '–'}</td><td>${cell(c.cur.revenue, c.prev && c.prev.revenue, money)}</td><td>${c.cur.roas != null ? x2(c.cur.roas) : '–'}</td></tr>`).join('')}
      </tbody></table></div>`;
  }
  function adCard(a, cls, act) {
    const th = a.thumb ? `style="background-image:url('${esc(a.thumb)}')"` : '';
    const cpa = a.orders ? a.spend / a.orders : null;
    return `<button type="button" class="ad ${cls}" data-ad="${esc(a.ad_id)}" data-act="${esc(act)}" data-name="${esc(a.name)}" title="${a.video ? 'Play it here' : 'See it here'}"><div class="th" ${th}>${a.thumb ? '' : esc(a.headline || a.name)}${a.video ? '<span class="play">▶</span>' : ''}${cls ? `<span class="tag ${cls}">${cls === 'win' ? 'Best' : 'Worst'}</span>` : ''}</div>
      <div class="m ${cls === 'lose' ? 'lose' : ''}"><span>${a.roas != null ? x2(a.roas) + ' ROAS' : ''}</span></div><div class="n">${esc(a.name)}</div><div class="s">${money(a.spend)} spent${a.orders != null ? ` · ${plural(Math.round(a.orders), 'sale')}` : ''}${cpa != null ? `<br>${money(cpa)} per sale` : ''}</div></button>`;
  }
  function adsHtml(r, act) {
    if (!r || !(r.winners || []).length) return '';
    const tw = r.basis === 'tw';
    const sub = tw ? `The 3 best and 3 worst ads by ROAS, out of the ${plural(r.pool || 0, 'ad')} that spent ${money(r.floor)} or more. ROAS and sales are Triple Whale (last click), spend is Meta. Click one to play it here.`
      : 'The ads that spent the most. This report has no Triple Whale numbers per ad, so there is no ROAS. Click one to play it here.';
    return `<p class="cs-sub">${sub}</p>
      <div class="ads">${r.winners.map(a => adCard(a, 'win', act)).join('')}${(r.losers || []).map(a => adCard(a, 'lose', act)).join('')}</div>
      ${allAdsHtml(act, r)}`;
  }
  /* Every ad of the report's week, opened IN PLACE (Cole: "show in ads" opened another screen mid-call). /api/ads for the
     same dates, Triple Whale last click, sortable by its headings; a row plays the ad in the side panel. */
  const ADS = {};
  const adsKey = (act, r) => `${act}|${r.period_start}|${r.period_end}`;
  const pc = v => v != null ? Math.round(v * 100) + '%' : '–';
  const AD_COLS = [['spend', 'Spent', a => money(a.spend)], ['revenue', 'Sales', a => money(a.revenue)], ['roas', 'ROAS', a => a.roas != null ? x2(a.roas) : '–'], ['cpa', 'Cost per sale', a => a.cpa != null ? money(a.cpa) : '–'], ['purchases', 'Sales', a => a.purchases != null ? String(Math.round(a.purchases)) : '–'], ['hook', 'Hook rate', a => pc(a.hook)], ['hold', 'Hold rate', a => pc(a.hold)]];
  AD_COLS[1][1] = 'Sales $'; AD_COLS[4][1] = 'Orders';
  function allAdsHtml(act, r) {
    const k = adsKey(act, r), A = ADS[k];
    if (!A || !A.open) return `<button type="button" class="cs-link" data-allads="${esc(k)}">Show every ad from ${short(r.period_start)} to ${short(r.period_end)} ▾</button>`;
    const close = `<button type="button" class="cs-link" data-allads="${esc(k)}">Hide the list ▴</button>`;
    if (A.loading) return `${close}<p class="cs-empty">Loading every ad…</p>`;
    if (A.error) return `${close}<p class="cs-empty" style="color:var(--bad)">${esc(A.error)}</p>`;
    const col = AD_COLS.find(c => c[0] === A.sort) || AD_COLS[0];
    const lowFirst = A.sort === 'cpa';
    const rows = [...(A.rows || [])].sort((a, b) => { const x = a[col[0]], y = b[col[0]]; if (x == null) return 1; if (y == null) return -1; return lowFirst ? x - y : y - x; });
    return `${close}<p class="cs-sub">${plural(rows.length, 'ad')} spent money from ${short(r.period_start)} to ${short(r.period_end)}. Spend, hook and hold are Meta; sales and ROAS are Triple Whale (last click). Click a heading to sort, a row to play the ad.</p>
      <div class="cs-tw"><table class="cs-tbl cs-adt"><thead><tr><th>Ad</th>${AD_COLS.map(c => `<th><button type="button" class="srt${c[0] === A.sort ? ' on' : ''}" data-adsort="${esc(k)}" data-col="${c[0]}">${c[1]}${c[0] === A.sort ? (lowFirst ? ' ▴' : ' ▾') : ''}</button></th>`).join('')}</tr></thead><tbody>
      ${rows.map(a => `<tr data-ad="${esc(a.ad_id)}" data-act="${esc(act)}" data-name="${esc(a.name)}" title="Play it here"><td><span class="an">${a.is_video ? '▶ ' : ''}${esc(a.name)}</span>${a.status && a.status !== 'ACTIVE' ? `<small class="off">${esc(String(a.status).toLowerCase())}</small>` : ''}</td>${AD_COLS.map(c => `<td>${c[2](a)}</td>`).join('')}</tr>`).join('')}
      </tbody></table></div>`;
  }
  async function loadAllAds(k) {
    const [act, from, to] = k.split('|'), A = ADS[k];
    A.loading = true; A.error = ''; paintMain();
    try {
      const d = await H.apiAH(`/api/ads?act=${encodeURIComponent(act)}&from=${from}&to=${to}&sort=spend&limit=60&attr=lastPlatformClick&mult=0`);
      if (d && d.error) throw new Error(d.error);
      A.rows = (d.ads || []).filter(a => a.spend > 0);
    } catch (e) { A.error = 'Could not load the ads: ' + e.message; }
    A.loading = false; paintMain();
  }
  function readBody(r, act) {
    if (!r) return empty('No weekly report for this brand yet, so there are no numbers to show. A report needs Triple Whale connected.');
    return tilesHtml(r) + chanTable(r) + adsHtml(r, act);
  }
  const rowsHtml = (arr, asks = false) => arr.map((x, i) => x.on === false ? '' : `<div class="row ${asks ? 'asks' : ''}" data-i="${i}">
      <div class="t${x.text ? '' : ' empty'}" data-f="text" data-ph="${asks ? 'Type what we need from them' : 'Type what to make'}">${esc(x.text)}</div>
      ${asks ? '' : ownerChip(x.owner, 'data-f="owner"')}${dueChip(x.due, 'data-f="due"')}
      <button type="button" class="x" data-f="del" aria-label="Remove" title="Remove">×</button></div>`).join('');
  function todoList(open, t, none) {
    const li = it => `<li data-item="${esc(it.id)}"><input type="checkbox" aria-label="Done"><span class="tx">${esc(it.text)}</span><span class="o ${it.due && it.due < t ? 'late' : ''}">${esc(it.owner || 'Nobody')}${it.due ? ` · ${it.due < t ? 'was due ' : 'due '}${short(it.due)}` : ''}</span></li>`;
    const now = open.filter(it => !it.due || it.due <= t), later = open.filter(it => it.due && it.due > t);
    return (now.length ? `<ul class="chk">${now.map(li).join('')}</ul>` : empty(none))
      + (later.length ? `<details class="cs-more"><summary>${plural(later.length, 'more')} due later</summary><ul class="chk">${later.map(li).join('')}</ul></details>` : '');
  }
  /* A Slack post as people see it in Slack: names instead of user ids, *bold*, and links as short clickable words
     (the index stores links as "label (url)" and keeps Slack's &amp; entities). */
  const SLACK_IDS = { U06C37MDWD7: 'Cole', U06K732S4BD: 'Ahsan', U09PZ3ZV5HD: 'Noma' };
  function slackText(t) {
    const raw = String(t || '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
    let h = esc(raw);
    h = h.replace(/@(U[A-Z0-9]{6,})/g, (m, id) => '@' + (SLACK_IDS[id] || 'someone'));
    h = h.replace(/(\S+) \((https?:\/\/[^\s)]+)\)/g, (m, label, url) => `<a href="${url}" target="_blank" rel="noopener">${label.length > 42 ? label.slice(0, 40) + '…' : label}</a>`);
    h = h.replace(/ \((https?:\/\/[^\s)]+)\)/g, (m, url) => ` <a href="${url}" target="_blank" rel="noopener">(link)</a>`);
    h = h.replace(/\*([^*\n]+)\*/g, '<b>$1</b>');
    return h;
  }
  /* The post as content, folded after its first paragraph. One line under it says who and where it came from. */
  function postsHtml(posts, key) {
    return `<div class="posts">${posts.map((p, i) => {
      const n = teamName(p.by), paras = String(p.text || '').split(/\n\s*\n/), k = `${key}:${i}`, open = paras.length <= 8 || !!OPEN_POSTS[k];
      const first = slackText(paras[0]), rest = paras.slice(1).join('\n\n');
      return `<div class="slk"><p class="txt">${first}</p>${rest ? `<p class="txt rest" ${open ? '' : 'hidden'}>${slackText(rest)}</p>` : ''}
        <p class="src">${esc(n)}${ROLE[n] ? `, ${esc(ROLE[n])}` : ''} · Slack, ${esc(when(p.at))}${p.permalink ? ` · <a href="${esc(p.permalink)}" target="_blank" rel="noopener">open</a>` : ''}${rest && paras.length > 8 ? ` · <button type="button" data-fold="${esc(k)}">${open ? 'Less' : 'More'}</button>` : ''}</p></div>`;
    }).join('')}</div>`;
  }

  /* ======================= MONDAY ======================= */
  function mondayList() {
    const rank = { bad: 0, warn: 1, undefined: 2, good: 3 };
    return [...D.brands].sort((a, b) => (rank[SEV[a.act_id]] ?? 2) - (rank[SEV[b.act_id]] ?? 2) || a.name.localeCompare(b.name));
  }
  function mondaySteps() { return [{ id: 'open', name: 'Start', mins: 5 }, ...mondayList().map(b => ({ id: b.act_id, name: b.name, sev: SEV[b.act_id], mins: SEV[b.act_id] === 'good' ? 2 : SEV[b.act_id] === 'bad' || SEV[b.act_id] === 'warn' ? 7 : 4 })), { id: 'close', name: 'Finish', mins: 5 }]; }
  function strategistOf(b) { const p = (b.posts || []).find(x => ROLE[teamName(x.by)] === 'Strategist'); return p ? teamName(p.by) : ''; }
  /* 2026-11-03: the order Cole says it out loud on the call ("results from last week, what we're doing this week, what's
     upcoming"), numbered, and then one band of boxes you type in. Every caption = what the box is + where it comes from. */
  const part = (n, t) => `<div class="cs-part"><span>${n}</span>${t}</div>`;
  function mondayBrand(b) {
    const s = brandState(b.act_id), r = b.read, strat = strategistOf(b), t = today();
    const making = b.making || [], posts = b.posts || [], who = strat || 'the strategist';
    const firstPost = posts[0];
    const boardLine = c => `${esc({ brief: 'Brief written, not started', making: 'Being made', review: 'Waiting for review' }[c.board] || c.board)}${c.owner ? ' · ' + esc(c.owner) : ' · nobody on it'}${c.due ? ` · <span class="${c.due < t ? 'late' : ''}">${c.due < t ? 'was due ' : 'due '}${short(c.due)}</span>` : ''}`;
    return `${part(1, `How last week went`)}
      ${sec(`${esc(b.name)}: last week's numbers`, r ? `From the weekly report for ${short(r.period_start)} to ${short(r.period_end)}. Sales, spend, MER and orders are Triple Whale, the whole store, every channel. Each tile compares with the week before.` : 'From the weekly report.', readBody(r, b.act_id))}
      ${sec('Did last week\'s to-dos get done?', 'Every open to-do for this brand in Locus Tasks that was due by today. Tick it when it is done (Asana gets ticked too).', todoList(b.open || [], t, 'Nothing was due. Nothing to check.'))}
      ${part(2, `What we are doing this week`)}
      ${sec(strat ? `${esc(strat)}'s Monday plan, from Slack` : 'The strategist\'s Monday plan, from Slack', firstPost ? `What ${esc(who)} posted in this brand's internal Slack channel before the call, word for word.` : `Nothing posted in this brand's internal Slack channel yet. The strategist posts the plan there before the call.`, posts.length ? postsHtml(posts, b.act_id) : empty(`No Monday plan posted for ${esc(b.name)}.`))}
      ${sec('Ads to brief this week', `Each line is one batch of new ads. Locus pulled them out of ${esc(who)}'s Slack plan above. Fix a line, remove a wrong one, or add one. When you press Finish, each line becomes a brief on Production and in Asana.`,
        `<div class="rows" data-list="batches" data-act="${esc(b.act_id)}">${rowsHtml(s.batches)}</div>
        <button type="button" class="add" data-add="batches" data-act="${esc(b.act_id)}">+ Add a batch of ads to brief</button>`)}
      ${part(3, `What is already being made`)}
      ${sec(`On the Production board${making.length ? `: ${making.length}` : ''}`, 'Ads already briefed for this brand and not live yet, from the Production board: where each one is, who is making it, when it is due. Click one to open it here.',
        making.length ? `<div class="cards">${making.map(c => `<button type="button" class="mini" data-card="${esc(c.id || '')}" data-asana="${esc(c.asana_url || '')}"><b>#${esc(c.num)}</b><span>${esc(c.title)}</span><small>${boardLine(c)}</small></button>`).join('')}</div>` : empty('Nothing on the board for this brand.'))}
      ${part(4, `Typed on the call`)}
      ${sec('New to-dos for the team', 'Type one as a sentence with who and when, then press Enter. Example: Ahsan pauses the retargeting ad set Friday. They go to Locus Tasks when you press Finish.',
        `<div class="rows" data-list="jobs" data-act="${esc(b.act_id)}">${rowsHtml(s.jobs)}</div>
        <input type="text" data-quick="jobs" data-act="${esc(b.act_id)}" placeholder="Type a to-do and press Enter">`)}
      ${sec('What we need from the client', `Things ${esc(b.name)} owes us. Listed first: ones already asked and still open. Add one and the client sees it on their Requests page after Finish.`,
        `${(b.asks || []).length ? `<ul class="chk">${b.asks.map(a => `<li><span class="tx">${esc(a.title)}</span><span class="o">asked ${short(a.created_at)}, still open</span></li>`).join('')}</ul>` : ''}
        <div class="rows" data-list="asks" data-act="${esc(b.act_id)}">${rowsHtml(s.asks, true)}</div>
        <button type="button" class="add" data-add="asks" data-act="${esc(b.act_id)}">+ Add something we need from them</button>`)}
      ${sec('What to tell the client this week', 'Goes word for word under "This week" in their next weekly report. One line per thing. Leave it empty and Locus writes it from the plan.', `<textarea data-client="${esc(b.act_id)}" placeholder="Type it the way the client should read it">${esc(s.client || '')}</textarea>`)}
      ${sec('Notes for the team', 'Anything else decided. Goes in this brand\'s internal Slack recap after Finish. The client never sees it.', `<textarea data-read="${esc(b.act_id)}" placeholder="Type notes here">${esc(s.read || '')}</textarea>`)}`;
  }
  function mondayOpen() {
    STATE.agency = STATE.agency || [];
    if (STATE.theme == null) STATE.theme = D.theme || '';
    const n = mondayList().length;
    return `${sec('How this call runs', `One brand at a time, red first. For each brand: 1. how last week went, 2. what we are doing this week, 3. what is already being made, 4. what we typed. About ${Math.round(mondaySteps().reduce((m, x) => m + x.mins, 0))} minutes for ${plural(n, 'brand')}. Press Next or the right arrow key to move on.`,
        `<p class="cs-legend"><span class="dot bad"></span>Red: something needs fixing today <span class="dot warn"></span>Amber: worth a look <span class="dot good"></span>Green: on track. The colours come from Home.</p>`)}
      ${sec('Agency to-dos still open', 'Agency jobs (not one brand\'s) from Locus Tasks that were due by today. Tick one when it is done.', todoList(D.agency_open || [], today(), 'Nothing open.'))}
      ${sec('Add an agency to-do', 'Type it as a sentence with who and when, then press Enter. Example: Cole sends the Black Friday calendar Wednesday. Goes to Locus Tasks when you press Finish.',
        `<div class="rows" data-list="agency" data-act="">${rowsHtml(STATE.agency)}</div>
        <input type="text" data-quick="agency" data-act="" placeholder="Type a to-do and press Enter">`)}
      ${sec('One line for every brand this week (optional)', 'Only if you want it: what you type here goes at the top of every brand\'s Slack recap after Finish.', `<textarea data-theme placeholder="Type it here, or leave it empty">${esc(STATE.theme)}</textarea>`)}`;
  }
  function mondayCounts() {
    let jobs = (STATE.agency || []).filter(x => x.text).length, briefs = 0, asks = 0;
    for (const [, s] of Object.entries(STATE.brands || {})) {
      jobs += (s.jobs || []).filter(x => x.text).length; briefs += (s.batches || []).filter(x => x.text && x.on !== false).length; asks += (s.asks || []).filter(x => x.text && x.on !== false).length;
    }
    return { jobs, briefs, asks };
  }
  function mondayClose() {
    const lines = mondayList().map(b => { const s = (STATE.brands || {})[b.act_id] || {}; return { b, bt: (s.batches || []).filter(x => x.text && x.on !== false).length, j: (s.jobs || []).filter(x => x.text).length, a: (s.asks || []).filter(x => x.text && x.on !== false).length, n: !!s.read, cl: !!(s.client || '').trim() }; }).filter(x => x.bt || x.j || x.a || x.n || x.cl);
    return sec('Finish the call', 'What Finish makes, brand by brand: briefs go to Production and Asana, to-dos to Locus Tasks, requests to the client\'s Requests page, "tell the client" lines to their next report, and one recap per brand in its internal Slack channel.',
      (lines.length ? `<ul class="chk">${lines.map(x => `<li><span class="tx"><b>${esc(x.b.name)}</b></span><span class="o">${[x.bt ? plural(x.bt, 'brief') : '', x.j ? plural(x.j, 'to-do') : '', x.a ? plural(x.a, 'request') : '', x.cl ? 'This week' : '', x.n ? 'notes' : ''].filter(Boolean).join(' · ')}</span></li>`).join('')}</ul>` : empty('Nothing typed yet.'))
      + `<div class="cs-acts"><button type="button" class="btn pri" data-finish ${BUSY ? 'disabled' : ''}>Finish</button></div>`);
  }

  /* ======================= CLIENT ======================= */
  /* 25 minutes in a 30-minute slot (Cole, 2026-10-27); the Ads step shows what they review, what they approved, what went live. */
  const CLIENT_STEPS = [{ id: 'news', name: 'Their news', mins: 3 }, { id: 'read', name: 'Last week', mins: 7 }, { id: 'ads', name: 'Ads', mins: 5 }, { id: 'week', name: 'This week', mins: 3 }, { id: 'asks', name: 'Requests', mins: 3 }, { id: 'coming', name: 'Coming up', mins: 2 }, { id: 'finish', name: 'Finish', mins: 2 }];
  function clientStep(id) {
    STATE.asks = STATE.asks || []; STATE.promised = STATE.promised || [];
    const wk = D.week || {};
    if (id === 'news') return sec('What is new on your side?', 'Launches, stock, what customers are saying, anything that changed. We type it here while you talk, and it goes to our team.',
      `<textarea data-news class="big" placeholder="Type their news here">${esc(STATE.news || '')}</textarea>`);
    if (id === 'read') {
      const per = STATE.period === 'month' && D.month ? 'month' : 'week';
      const r = per === 'month' ? D.month : D.week;
      const lbl = x => x ? (x.period === 'monthly' ? dt(x.period_start).toLocaleDateString('en-US', { month: 'long', timeZone: 'UTC' }) : `${short(x.period_start)} to ${short(x.period_end)}`) : '';
      const label = lbl(r);
      const tog = D.month && D.week ? `<div class="seg"><button type="button" class="${per === 'week' ? 'on' : ''}" data-per="week">Last week: ${lbl(D.week)}</button><button type="button" class="${per === 'month' ? 'on' : ''}" data-per="month">Last month: ${lbl(D.month)}</button></div>` : '';
      return sec(per === 'month' ? `How ${label} went` : `How last week went: ${label}`, r ? `The numbers from the ${per === 'month' ? 'monthly' : 'weekly'} report we sent you for ${label}. Sales, spend and MER are your whole store from Triple Whale, every channel together. Each tile compares with the ${per === 'month' ? 'month' : 'week'} before.` : 'From your weekly report.',
        (r && r.status !== 'sent' ? '<p class="warnline">This report has not been sent to them yet.</p>' : '') + tog + readBody(r, D.act_id).replace(/the week before/g, per === 'month' ? 'the month before' : 'the week before'));
    }
    if (id === 'ads') {
      const A = D.ads || { review: [], approved: [], live: [] };
      const cardBtn = (c, cap) => `<button type="button" class="ad" data-editbrief="${esc(c.id)}" title="Open it"><div class="th" ${c.thumb ? `style="background-image:url('${esc(c.thumb)}')"` : ''}>${c.thumb ? '' : esc(c.format || 'Ad')}</div><div class="n">#${esc(c.num)} ${esc(c.title)}</div><div class="s">${cap(c)}</div></button>`;
      const ago = c => c.since ? `in review since ${md(c.since)}` : '';
      return `${sec('New ads waiting for your OK', 'Ads we made for you that need a yes before they go live. Click one to see it; you approve it or ask for changes there.',
          A.review.length ? `<div class="ads">${A.review.map(c => cardBtn(c, x => `${x.versions ? plural(x.versions, 'version') + ' · ' : ''}${ago(x)}`)).join('')}</div>` : empty('Nothing waiting on you.'))}
        ${sec('Approved, going live soon', 'Ads you said yes to, with the day each one goes live.',
          A.approved.length ? `<div class="ads">${A.approved.map(c => cardBtn(c, x => x.launch_on ? `live ${md(x.launch_on)}` : 'launch date not set')).join('')}</div>` : empty('Nothing approved and waiting.'))}
        ${sec('Went live in the last two weeks', 'New ads that started running on Meta, newest first.',
          A.live.length ? `<ul class="chk">${A.live.map(r => `<li><span class="tx">${esc(r.name)}${r.card ? `<br><span style="color:var(--ink-2);font-size:13px">${esc(r.card)}</span>` : ''}</span><span class="o">${md(r.day)}${r.status && r.status !== 'ACTIVE' ? ` · ${esc(String(r.status).toLowerCase().replace(/_/g, ' '))}` : ''}</span></li>`).join('')}</ul>` : empty('Nothing launched in the last two weeks.'))}`;
    }
    if (id === 'week') {
      /* The plan = the "This week" lines of the report they got, plus anything sent here from Leaks ("Put it on the call").
         Nothing is typed on this slide: Fireflies writes the notes and Cole approves them after the call (Work > Meetings). */
      const lines = [...(wk.this_week || []), ...(STATE.promised || []).filter(x => x.text && x.on !== false).map(x => x.text)];
      return sec('What we are doing this week', lines.length ? 'The plan from your weekly report, plus anything we added for this call.' : 'Nothing in the last report yet.',
        lines.length ? `<ol class="lines">${lines.map((x, i) => `<li><i>${i + 1}</i><span>${esc(x)}</span></li>`).join('')}</ol>` : empty('Say it on the call; the notes catch it and it lands in your next report.'));
    }
    if (id === 'asks') {
      const open = (D.asks || []).map(a => `<li><span class="tx">${esc(a.title)}</span><span class="o ${(Date.now() - Date.parse(a.created_at)) > 7 * 864e5 ? 'late' : ''}">asked ${short(a.created_at)}</span></li>`);
      const ok = (D.approvals || []).map(a => `<li><span class="tx">${esc(a.title)}</span><span class="o">your OK, sent ${short(a.created_at)}</span></li>`);
      const all = [...open, ...ok];
      return sec('What we need from you', 'Everything still open on your Requests page in Locus, oldest first, plus anything new we agree today. New ones show up there when the call ends.',
        (all.length ? `<ul class="chk">${all.join('')}</ul>` : empty('Nothing open.'))
        + `<div class="rows" data-list="asks" data-act="${esc(D.act_id)}">${rowsHtml(STATE.asks, true)}</div>
        <button type="button" class="add" data-add="asks" data-act="${esc(D.act_id)}">+ Add one</button>`);
    }
    if (id === 'coming') return sec('Your next five weeks', 'Launches, sales and emails on your Locus calendar. A dashed box is not confirmed yet. If a date is wrong, say so now and we fix it.', calendarGrid(D.coming || [], D.today));
    const recap = STATE.recap != null ? STATE.recap : recapText();
    return `${D.has_client_channel ? sec('The recap', 'goes to your Slack channel when ticked, posted as you, not as Locus. Our notes from the call follow once we have checked them.',
        `<textarea data-recap style="min-height:140px">${esc(recap)}</textarea>
        <label style="display:flex;gap:8px;align-items:center;font-size:14px"><input type="checkbox" data-postrecap ${STATE.post_recap ? 'checked' : ''} style="width:16px;height:16px;accent-color:var(--brand);margin:0"> Post it</label>`) : ''}
      ${sec('That is the call', 'Finish puts the new requests on your Requests page and sends your news to our team. The full notes come from the call recording.', `<div class="cs-acts"><button type="button" class="btn pri" data-finish ${BUSY ? 'disabled' : ''}>Finish</button></div>`)}`;
  }
  /* Five weeks from this week's Monday, the brand's dates placed on their days (a multi-day sale runs across its days). */
  function calendarGrid(events, today) {
    const t0 = dt(today || new Date().toISOString()); const dow = (t0.getUTCDay() + 6) % 7;
    const start = new Date(t0); start.setUTCDate(t0.getUTCDate() - dow);
    const key = d => d.toISOString().slice(0, 10);
    const cells = [];
    for (let i = 0; i < 35; i++) { const d = new Date(start); d.setUTCDate(start.getUTCDate() + i); cells.push(d); }
    const onDay = k => events.filter(e => e.start && (e.end ? (k >= e.start && k <= e.end) : k === e.start));
    const todayK = key(t0);
    const head = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(d => `<div class="dow">${d}</div>`).join('');
    const days = cells.map(d => {
      const k = key(d), evs = onDay(k), first = d.getUTCDate() === 1 || k === key(cells[0]);
      const ev = e => { const cont = !!e.end && k !== e.start; const quiet = cont && d.getUTCDay() !== 1; const sale = /sale|offer|promo|black|cyber|deal/i.test(`${e.kind || ''} ${e.name || ''}`);
        return `<div class="ev ${e.confirmed ? '' : 'tent'} ${sale ? 'sale' : ''} ${cont ? 'cont' : ''} ${quiet ? 'quiet' : ''}" title="${esc(e.name)}${e.offer ? ` · ${esc(e.offer)}` : ''}">${quiet ? '' : esc(e.name)}${e.offer && !cont ? `<small>${esc(e.offer)}</small>` : ''}</div>`; };
      return `<div class="day ${k === todayK ? 'today' : ''} ${d < t0 ? 'other' : ''}"><span class="d">${first ? d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' }) : d.getUTCDate()}</span>${evs.map(ev).join('')}</div>`;
    }).join('');
    const list = events.filter(e => e.start).sort((a, b) => a.start < b.start ? -1 : 1).map(e => `<li class="${e.confirmed ? '' : 'tent'}"><b>${esc(e.name)}</b><span>${md(e.start)}${e.end && e.end !== e.start ? ` to ${md(e.end)}` : ''}${e.offer ? ` · ${esc(e.offer)}` : ''}${e.confirmed ? '' : ' · not confirmed'}</span></li>`).join('');
    return `<div class="cal">${head}${days}</div><ul class="cal-list">${list}</ul>` + (events.length ? '' : empty('Nothing on the calendar for the next five weeks.'));
  }
  function recapText() {
    const wk = (D.week && D.week.this_week) || [];
    const asks = [...(D.asks || []).map(a => a.title), ...(STATE.asks || []).filter(x => x.text && x.on !== false).map(x => x.text + (x.due ? ` (by ${md(x.due)})` : ''))];
    const prom = (STATE.promised || []).filter(x => x.text).map(x => x.text + (x.due ? ` (${md(x.due)})` : ''));
    return [`Thanks for the time today. Here is what we agreed.`, wk.length || prom.length ? `\nWhat we are doing:\n${[...wk, ...prom].map(x => `• ${x}`).join('\n')}` : '', asks.length ? `\nWhat we need from you:\n${asks.map(x => `• ${x}`).join('\n')}` : ''].filter(Boolean).join('\n');
  }

  /* ======================= CREATOR ======================= */
  /* 20 minutes on Discord for a Trybe brand, 45 for Lucky's Stage (the playbook's times). Nothing here is written for
     the creators by Locus: what shows is what the hub and the app already tell them, and the one ask posts to #this-week
     only when "Post it" is ticked. */
  function creatorSteps() {
    const L = !!(D && D.lucky);
    return [{ id: 'news', name: 'What\'s new', mins: L ? 5 : 2 }, { id: 'sold', name: 'What sold', mins: L ? 10 : 5 }, { id: 'want', name: 'What we want', mins: L ? 10 : 6 },
      { id: 'qs', name: L ? 'Guest and questions' : 'Questions', mins: L ? 15 : 5 }, { id: 'ask', name: 'One ask', mins: L ? 5 : 2 }];
  }
  function creatorStep(id) {
    const w = D.week || {}, warn = (D.warn || []).map(x => `<p class="warnline">${esc(x)}</p>`).join('');
    const hubBtn = D.hub ? `<div class="cs-acts"><a class="btn" href="${esc(D.hub)}" target="_blank" rel="noopener">${D.lucky ? 'Open the shoot list (new tab)' : 'Open the creator hub (new tab)'}</a></div>` : '';
    if (id === 'news') {
      const lines = [];
      if (w.title) lines.push(w.title);
      if (w.offer && w.offer.head) lines.push(`The deal: ${w.offer.head}${w.offer.line ? ` ${w.offer.line}` : ''}`);
      for (const c of D.campaigns || []) lines.push(`${c.name}${c.film_by ? `: film by ${md(c.film_by)}` : ''}`);
      return warn + sec('What\'s new this week', 'The deal and the dates, from the brand\'s creator hub' + (D.lucky ? ' and the Lucky app' : '') + '. Type anything else new while you talk: a contest, a product, a date.',
        (lines.length ? `<ol class="lines">${lines.map((x, i) => `<li><i>${i + 1}</i><span>${esc(x)}</span></li>`).join('')}</ol>` : empty('Nothing on the hub for this week yet.'))
        + `<textarea data-cf="news" class="big" style="min-height:120px" placeholder="Type anything else new">${esc(STATE.news || '')}</textarea>`);
    }
    if (id === 'sold') {
      if (D.lucky) return sec('What sold', 'Lucky\'s winners live in the Lucky app (the leaderboard and the Friday post). Play two or three from there.', `<div class="cs-acts"><a class="btn" href="https://creators.luckygolf.com" target="_blank" rel="noopener">Open the Lucky app (new tab)</a></div>`
        + `<textarea data-cf="why" placeholder="Type why each one worked: the hook, the first 3 seconds, the offer">${esc(STATE.why || '')}</textarea>`);
      const ws = D.winners || [];
      return warn + sec('What sold this week', 'Creator videos with a sale in the last 7 days (Triple Whale), best first: the same list as Friday\'s #winners post. Click one to play it here. Say why each worked: the hook, the first 3 seconds, the offer.',
        (ws.length ? `<div class="ads">${ws.map(x => `<button type="button" class="ad" data-clip="${esc(x.sub_id || '')}" title="Play it"><div class="th" ${x.thumb ? `style="background-image:url('${esc(x.thumb)}')"` : ''}>${x.thumb ? '' : 'Video'}<span class="play">▶</span></div><div class="m"><span>${plural(x.orders, 'sale')}</span></div><div class="n">${esc(x.creator)}</div><div class="s">${esc(x.product || x.angle || '')}</div></button>`).join('')}</div>`
          : empty('No creator video made a sale in the last 7 days. Show last week\'s best from the hub instead.'))
        + `<textarea data-cf="why" placeholder="Type why they worked, if worth keeping">${esc(STATE.why || '')}</textarea>`);
    }
    if (id === 'want') {
      const ideas = D.lucky
        ? ((D.ideas || []).length ? `<div class="ideas">${D.ideas.map(x => `<a class="idea" href="${esc(x.link || D.hub || '#')}" target="_blank" rel="noopener"><div class="th" ${x.thumb ? `style="background-image:url('${esc(x.thumb)}')"` : ''}></div><b>${esc(x.title)}</b><span>${esc(x.opener ? `"${x.opener}"` : x.format)}</span></a>`).join('')}</div>` : empty('No hot ideas in the app this week.'))
        : ((w.daily || []).length ? `<ol class="lines">${w.daily.map((x, i) => `<li><i>${i + 1}</i><span><b>${esc(x.title)}</b>${x.opener ? `<br><span style="color:var(--ink-2);font-size:.85em">First line: "${esc(x.opener)}"</span>` : ''}</span></li>`).join('')}</ol>` : empty('No videos on the hub for this week yet.'));
      const sell = (w.selling || []).length ? `<p class="cs-sub">Selling right now</p><ul class="chk">${w.selling.map(x => `<li><span class="tx">${esc(x)}</span></li>`).join('')}</ul>` : '';
      return sec('The videos we want this week', D.lucky ? 'The hot ideas in the Lucky app, with the first line to say. Each opens its page with the example and the shots.' : 'From the brand\'s creator hub: the videos to film and the first line of each. The hub has the examples and the shots.',
        ideas + sell + hubBtn + `<textarea data-cf="skip" placeholder="Type what to skip this week (what we will not approve)">${esc(STATE.skip || '')}</textarea>`);
    }
    if (id === 'qs') return sec(D.lucky ? 'Guest, then questions' : 'Questions', D.lucky ? 'The guest creator first (their numbers, their ads, how they think), then open questions. Type anything worth keeping.' : 'Open questions from the creators. Type anything worth keeping.',
      `<textarea data-cf="qs" class="big" placeholder="Type questions and answers worth keeping">${esc(STATE.qs || '')}</textarea>`);
    const canPost = !D.lucky;
    return sec('One ask, one date', 'The one thing every creator does this week, with the day it is due. Reviews come back within 2 days.',
      `<div class="ask"><label class="grow">The ask<input type="text" data-cf="ask" value="${esc(STATE.ask || '')}" placeholder="Type the ask, like: 2 videos from this week's list"></label><label>Due<input type="date" data-cf="ask_due" value="${esc(STATE.ask_due || '')}"></label></div>`
      + (canPost ? `<label style="display:flex;gap:8px;align-items:center;font-size:14px"><input type="checkbox" data-cpost ${STATE.post ? 'checked' : ''} style="width:16px;height:16px;accent-color:var(--brand);margin:0"> Post it in #this-week on the brand's Discord</label>` : '<p class="cs-empty">Lucky: post the ask from the Lucky app.</p>')
      + `<div class="cs-acts"><button type="button" class="btn pri" data-finish ${BUSY ? 'disabled' : ''}>Finish</button></div>`);
  }
  function pickCreator(list) {
    $('#main').innerHTML = `${headHtml('Creator call')}<div class="v2 cs" id="csRoot">${sec('Which brand\'s creators are on the call', 'Mondays, Central time', `<div class="picker">${(list || []).map(b => `<button type="button" data-pick="${esc(b.act_id)}">${esc(b.name)}${b.when ? `<br><small style="color:var(--muted);font-weight:500">${esc(b.when)}</small>` : ''}</button>`).join('') || empty('No creator programs in Locus.')}</div>`)}</div>`;
    acts('');
    $$('[data-pick]').forEach(b => b.onclick = () => open(H, 'creator', b.dataset.pick));
  }

  /* ======================= KICKOFF ======================= */
  function kickList() { return (D.briefs || []).filter(c => SHOW_OLD || !c.old); }
  function twoDays() {
    const d = dt(today()); let n = 0;
    while (n < 2) { d.setUTCDate(d.getUTCDate() + 1); const w = d.getUTCDay(); if (w !== 0 && w !== 6) n++; }
    return d.toISOString().slice(0, 10);
  }
  const FORMATS = ['Static', 'Video', 'UGC', 'Carousel'];
  function kickStep(c) {
    STATE.notes = STATE.notes || {}; STATE.deal = STATE.deal || {};
    const ctx = (D.brands || {})[c.act_id] || {};
    const card = CARD[c.id];
    const deal = STATE.deal[c.id] || (STATE.deal[c.id] = { count: '', format: c.format || 'Static', owner: c.assignee || '', due: c.due || '' });
    if (!deal.due) deal.due = twoDays();
    const done = (STATE.done || {})[c.id] || (c.kickoff_at ? { at: c.kickoff_at } : null);
    const who = deal.owner || c.assignee || '';
    const brief = card ? (card.brief && card.brief.html && !card.brief.blank ? `<div class="brief">${card.brief.html}</div>` : '<p class="warnline">Nobody has written this brief yet.</p>') : empty('Loading the brief.');
    const insp = card ? (card.files || []).filter(f => f.kind === 'insp') : [];
    return `${sec(`#${esc(c.num)} ${esc(c.title)}`, `${done ? `kicked off ${md(done.at)} · ` : ''}goes to ${who ? esc(who) : 'the designer'} on Production`,
        `${brief}<div class="cs-acts"><button type="button" class="btn" data-editbrief="${esc(c.id)}">Open the card</button>${c.asana_url ? `<a class="btn" href="${esc(c.asana_url)}" target="_blank" rel="noopener">Asana</a>` : ''}${ctx.drive ? `<a class="btn" href="${esc(ctx.drive)}" target="_blank" rel="noopener">Drive folder</a>` : ''}</div>`)}
      ${sec('What is working', 'from last week\'s report and the card',
        ((ctx.winners || []).length ? `<div class="ads">${ctx.winners.map(a => adCard(a, 'win', c.act_id)).join('')}</div>` : empty('No weekly report yet.'))
        + (insp.length ? `<p class="cs-sub">Inspiration on the card</p><div class="ads">${insp.map(f => `<div class="ad" style="cursor:default"><div class="th" style="background-image:url('${esc(f.thumb || f.url)}')"></div><div class="n">${esc(f.name || '')}</div></div>`).join('')}</div>` : ''))}
      ${sec('The designer\'s questions', 'saved on the card', `<textarea data-knote="${esc(c.id)}" placeholder="William tries a split-screen layout instead, with the new white-background photos">${esc(STATE.notes[c.id] || '')}</textarea>`)}
      ${sec('What we agreed', `goes on the card and moves it to Making`,
        `<div class="deal">
          <label>How many<input type="text" inputmode="numeric" data-deal="count" value="${esc(deal.count)}" placeholder="4"></label>
          <label>Format<span class="seg" data-fmt>${FORMATS.map(f => `<button type="button" class="${f === deal.format ? 'on' : ''}" data-v="${f}">${f}</button>`).join('')}</span></label>
          <label>Who<span>${ownerChip(deal.owner, 'data-dealowner')}</span></label>
          <label>Due<span>${dueChip(deal.due, 'data-dealdue')}</span></label>
        </div>
        <div class="cs-acts"><button type="button" class="btn pri" data-kickdone="${esc(c.id)}" ${BUSY ? 'disabled' : ''}>${done ? 'Save again' : 'Agreed, move it to Making'}</button></div>`)}`;
  }
  async function loadCard(id) {
    if (CARD[id]) return;
    try { CARD[id] = await H.apiAH(`/api/production/card?id=${encodeURIComponent(id)}`); } catch (e) { CARD[id] = { brief: { html: `<p>${esc(e.message)}</p>` }, files: [] }; }
    if (KIND === 'kickoff' && steps()[POS] && steps()[POS].id === id) paintMain();
  }

  /* ======================= the frame ======================= */
  function steps() {
    if (KIND === 'monday') return mondaySteps();
    if (KIND === 'client') return CLIENT_STEPS;
    if (KIND === 'creator') return creatorSteps();
    return kickList().map(c => ({ id: c.id, name: `${c.brand} #${c.num}`, mins: 4, c }));
  }
  const TITLE = { monday: 'Monday call', client: 'Client call', kickoff: 'Creative kickoff', creator: 'Creator call' };
  const isDone = (s, i) => KIND === 'kickoff' ? !!((STATE.done || {})[s.id] || (s.c && s.c.kickoff_at)) : i < POS;
  /* ONE row: Start, the brands that fit, "+N" for the rest, Finish always last. */
  function stepsHtml() {
    const st = steps(); if (!st.length) return '';
    const last = st.length - 1, MAXV = 6;
    const pill = (s, i) => { const done = isDone(s, i) && i !== POS; const dot = KIND === 'monday' && s.id !== 'open' && s.id !== 'close' ? `<span class="dot ${s.sev || ''}"></span>` : ''; return `<button type="button" class="cs-pill ${done ? 'done' : ''}" data-pos="${i}" aria-current="${i === POS}">${done ? ICON.check : dot}${esc(s.name)}</button>`; };
    let vis = [], hidden = [];
    if (KIND === 'client' || KIND === 'creator' || st.length <= MAXV + 2) vis = st.map((s, i) => i);
    else {
      const mid = st.slice(1, last).map((s, i) => i + 1);
      let start = Math.max(1, Math.min(POS - 1, last - MAXV)); if (POS === 0) start = 1;
      vis = [0, ...mid.filter(i => i >= start && i < start + MAXV), last];
      hidden = mid.filter(i => !vis.includes(i));
    }
    const out = [];
    vis.forEach((i, k) => {
      if (i === last) { if (hidden.length) out.push(`<button type="button" class="cs-pill more" data-more aria-label="${hidden.length} more steps">+${hidden.length}</button>`); out.push('<span class="arrow">→</span>'); }
      else if (k) out.push('<span class="sep">·</span>');
      out.push(pill(st[i], i));
    });
    if (KIND === 'kickoff' && (D.briefs || []).some(c => c.old)) out.push(`<button type="button" class="cs-pill more" data-old>${SHOW_OLD ? 'Hide' : 'Show'} ${plural((D.briefs || []).filter(c => c.old).length, 'older brief')}</button>`);
    return out.join('');
  }
  function mainHtml() {
    const s = steps()[POS];
    if (!s) return sec('Nothing to show', '', empty(KIND === 'kickoff' ? 'No briefs waiting. Finish a Monday call or add one on Production.' : 'Nothing to show.'));
    if (KIND === 'monday') return s.id === 'open' ? mondayOpen() : s.id === 'close' ? mondayClose() : mondayBrand(D.brands.find(b => b.act_id === s.id));
    if (KIND === 'client') return clientStep(s.id);
    if (KIND === 'creator') return creatorStep(s.id);
    loadCard(s.id);
    return kickStep(s.c);
  }
  function whereHtml() {
    const st = steps(), s = st[POS];
    if (!s) return '';
    const where = KIND === 'monday' ? (s.id === 'open' ? '<b>Start</b>' : s.id === 'close' ? '<b>Finish</b>' : `<b>${esc(s.name)}</b> · brand ${POS} of ${st.length - 2}`) : `<b>${esc(s.name)}</b> · step ${POS + 1} of ${st.length}`;
    return `${where}<span>·</span><span class="cs-clock" id="csClock"></span><span class="cs-time">of ${s.mins} min</span>`;
  }
  /* One sentence of what Finish will do, counted live, on every step. */
  const nextLabel = () => { const n = steps()[POS + 1]; return n ? `Next: ${esc(n.name)} →` : 'Finish'; };
  function willHtml() {
    const list = (parts, tail) => { const p = parts.filter(Boolean); if (!p.length && !tail) return 'Finish will close the call'; if (tail) return `Finish will ${p.length ? 'make ' + p.join(', ') + ' and ' : ''}${tail}`; return 'Finish will make ' + (p.length > 1 ? p.slice(0, -1).join(', ') + ' and ' + p[p.length - 1] : p[0]); };
    if (KIND === 'monday') { const c = mondayCounts(); return list([c.briefs ? `<b>${plural(c.briefs, 'brief')}</b>` : '', c.jobs ? `<b>${plural(c.jobs, 'task')}</b>` : '', c.asks ? `<b>${plural(c.asks, 'request')}</b>` : ''], 'post the recaps'); }
    if (KIND === 'client') { const asks = (STATE.asks || []).filter(x => x.text && x.on !== false).length; return list([asks ? `<b>${plural(asks, 'request')}</b>` : ''], STATE.post_recap && D.has_client_channel ? 'post the recap' : 'tell the team'); }
    if (KIND === 'creator') return STATE.ask && STATE.post && !D.lucky ? 'Finish will post <b>the ask</b> in #this-week and close the call' : 'Finish will close the call';
    const n = kickList().filter(c => (STATE.done || {})[c.id] || c.kickoff_at).length;
    return `Finish will close the kickoff with <b>${plural(n, 'brief')}</b> moved to Making`;
  }
  function paintWill() { const w = $('#csWill'); if (w) w.innerHTML = willHtml(); }
  function finishedHtml() {
    const c = D.call, r = c.result || {};
    const all = [...(r.brands || []), ...(r.agency ? [r.agency] : [])];
    const n = k => all.reduce((s, b) => s + (b[k] || []).filter(t => !t.error).length, 0);
    const tile = (l, v) => `<div class="cs-tile"><span class="l">${l}</span><span class="v">${v}</span></div>`;
    return sec('Finished', `by ${esc(firstName(c.finished_by))}${c.finished_at ? ` at ${clock(c.finished_at)}` : ''}`,
      (KIND === 'creator' ? `<p class="cs-empty">${r.ask ? `The ask: ${esc(r.ask)}` : 'No ask typed.'}</p>${r.posted ? `<p class="cs-empty">${r.posted.ok ? 'Posted in #this-week.' : `Not posted: ${esc(r.posted.why || '')}`}</p>` : ''}` : KIND === 'kickoff' ? `<p class="cs-empty">${plural(r.briefs || 0, 'brief')} moved to Making.</p>` : `<div class="cs-tiles">${tile('Tasks', n('tasks'))}${tile('Briefs', n('briefs'))}${tile('Requests', n('asks'))}${tile('Reports', all.filter(b => b.report).length)}</div>
        ${(r.warnings || []).length ? `<div class="warnline">${r.warnings.map(esc).join('<br>')}</div>` : ''}
        ${r.recap ? `<p class="cs-empty">${r.recap.posted ? 'The recap is in the client\'s Slack channel, posted as you.' : `The recap was not posted: ${esc(r.recap.why || '')}`}</p>` : ''}`)
      + `<div class="cs-acts"><button type="button" class="btn" data-reopen>Reopen</button><button type="button" class="btn" data-tab="tasks">Tasks (new tab)</button><button type="button" class="btn" data-tab="production">Production (new tab)</button><button type="button" class="btn" data-go="calls">${KIND === 'client' ? 'Home' : 'Meetings'}</button></div>`);
  }
  const headHtml = title => H.pageHead ? H.pageHead(KIND === 'client' ? 'ccall' : 'calls', title) : `<div class="ph"><div><div class="ph-t">${title}</div></div><div class="ph-r"><span class="ph-acts"></span></div></div>`;
  function acts(html) { if (typeof H.pageActions === 'function') H.pageActions(html); else if (typeof window.pageActions === 'function') window.pageActions(html); }
  function paint() {
    const host = $('#main'); if (!host) return;
    const title = KIND === 'client' ? esc(D.name) : KIND === 'creator' ? `${esc(D.name)} creators` : TITLE[KIND];
    const finished = D.call && D.call.status === 'finished';
    const last = POS === steps().length - 1;
    host.innerHTML = `${headHtml(title)}<div class="v2 cs${KIND === 'client' || KIND === 'creator' ? ' cs-deck' : ''}" id="csRoot">
      ${finished ? finishedHtml() : `<nav class="cs-steps" id="csSteps" aria-label="Steps">${stepsHtml()}</nav>
        <div id="csMain" style="display:flex;flex-direction:column;gap:16px">${mainHtml()}</div>
        <div class="cs-bar"><div class="r"><button type="button" class="btn" id="csPrev" ${POS === 0 ? 'disabled' : ''}>← Back</button><span class="where" id="csWhere">${whereHtml()}</span><span class="cs-saved" id="csSaved"></span><button type="button" class="btn pri" id="csNext" ${last ? 'data-finish' : ''}>${nextLabel()}</button></div><div class="cs-will" id="csWill">${willHtml()}</div></div>`}
    </div>`;
    acts(`<button type="button" class="btn" id="csPresent">${document.body.classList.contains('cs-present') ? 'Exit (Esc)' : 'Present'}</button>`);
    wire();
    if (!finished) { const s = steps()[POS]; startClock((s ? s.mins : 5) * 60); }
  }
  function paintMain() {
    const m = $('#csMain'); if (!m) return;
    const last = POS === steps().length - 1;
    m.innerHTML = mainHtml(); $('#csSteps').innerHTML = stepsHtml(); $('#csWhere').innerHTML = whereHtml(); paintWill();
    const p = $('#csPrev'); if (p) p.disabled = POS === 0;
    const n = $('#csNext'); if (n) { n.innerHTML = nextLabel(); if (last) { n.setAttribute('data-finish', ''); wireFinish(n); } else { n.removeAttribute('data-finish'); n.onclick = () => go(POS + 1); } }
    wireMain(); wireSteps();
  }
  /* ---------- where you are lives in the URL (2026-11-03) ----------
     Cole on the Nov 2 call: Back left Locus, and a reload started the call from the top. Every step is its own history
     entry (?open=calls&call=<kind>[&act=]&step=<id>&y=<scroll>), the entry under the first step is an "exit" marker that
     goes back to Meetings, the scroll is kept on the entry as you scroll, and the last place is also saved on this
     computer (localStorage cs_pos) so opening the same call again from Meetings resumes it. */
  const stepId = () => { const s = steps()[POS]; return s ? s.id : ''; };
  function urlFor(id, y) {
    const p = new URLSearchParams(); p.set('open', 'calls'); p.set('call', KIND);
    if ((KIND === 'client' || KIND === 'creator') && D && D.act_id) p.set('act', D.act_id);
    if (id) p.set('step', id); if (y > 40) p.set('y', String(Math.round(y)));
    return location.pathname + '?' + p.toString();
  }
  const navState = (id, y) => ({ cs: 1, kind: KIND, act: (KIND === 'client' || KIND === 'creator') && D ? D.act_id : '', step: id, y: Math.round(y || 0) });
  function savePos() {
    if (!D || !D.call || !$('#csRoot')) return;
    const id = stepId(), y = window.scrollY;
    try { history.replaceState(navState(id, y), '', urlFor(id, y)); } catch {}
    try { localStorage.setItem('cs_pos', JSON.stringify({ call: D.call.id, step: id, y: Math.round(y), at: Date.now() })); } catch {}
  }
  let SCROLL_T = null;
  window.addEventListener('scroll', () => { if (!$('#csRoot')) return; clearTimeout(SCROLL_T); SCROLL_T = setTimeout(savePos, 300); }, { passive: true });
  window.addEventListener('popstate', e => {
    const st = e.state;
    if (!st || !st.cs) return;
    if (st.cs === 'exit') { if ($('#csRoot')) { try { history.replaceState(null, '', location.pathname); } catch {} present(false); closePop(); H && H.show('calls'); } return; }
    if (!$('#csRoot') || st.kind !== KIND || ((st.kind === 'client' || st.kind === 'creator') && D && st.act !== D.act_id)) {
      /* Back from another page into the call: reopen it on that step. */
      if (!H) return;
      window.CALL_STEP = st.step; window.CALL_Y = st.y || 0;
      if (st.kind === 'client') { if (st.act) { H.S.act = st.act; try { localStorage.setItem('pf_act', st.act); } catch {} } window.CALL_OPEN = 'client'; H.show('ccall'); }
      else { window.CALL_OPEN = st.kind; window.CALL_ACT = st.kind === 'creator' ? (st.act || '') : ''; H.show('calls'); }
      return;
    }
    const i = steps().findIndex(s => s.id === st.step);
    go(i >= 0 ? i : 0, { push: false, y: st.y || 0 });
  });
  function go(i, how = {}) {
    const n = steps().length; if (!n) return;
    closePop();
    if (how.push !== false) savePos();                      // the entry you leave keeps its scroll
    POS = Math.max(0, Math.min(n - 1, i));
    paintMain(); const s = steps()[POS]; startClock((s ? s.mins : 5) * 60);
    if (how.push !== false) { try { history.pushState(navState(stepId(), 0), '', urlFor(stepId(), 0)); } catch {} }
    if (how.y) { window.scrollTo(0, how.y); savePos(); return; }
    /* Instant, never smooth: a new step starts at its top, and the scroll saved for it is that top, not the old step's. */
    const r = $('#csRoot'); if (r) window.scrollTo(0, Math.max(0, r.getBoundingClientRect().top + window.scrollY - 12));
    savePos();
  }

  /* ---------- Present: full screen, Locus menus hidden, Exit or Esc ---------- */
  function present(on) {
    document.body.classList.toggle('cs-present', on);
    const b = $('#csPresent'); if (b) b.textContent = on ? 'Exit (Esc)' : 'Present';
    if (on && document.documentElement.requestFullscreen && !document.fullscreenElement) document.documentElement.requestFullscreen().catch(() => {});
    if (!on && document.fullscreenElement) document.exitFullscreen().catch(() => {});
  }
  document.addEventListener('fullscreenchange', () => { if (!document.fullscreenElement && document.body.classList.contains('cs-present')) present(false); });

  /* ---------- wiring ---------- */
  function wireSteps() {
    $$('#csSteps [data-pos]').forEach(b => b.onclick = () => go(+b.dataset.pos));
    const m = $('#csSteps [data-more]'); if (m) m.onclick = () => listMenu(m, 'Steps', steps().map((s, i) => ({ v: String(i), on: i === POS, html: `${isDone(s, i) && i !== POS ? ICON.check : ''}${esc(s.name)}`, small: `${s.mins} min` })), v => go(+v));
    const o = $('#csSteps [data-old]'); if (o) o.onclick = () => { const cur = steps()[POS]; SHOW_OLD = !SHOW_OLD; const i = cur ? steps().findIndex(s => s.id === cur.id) : 0; go(i >= 0 ? i : 0); };
  }
  function listOf(name, act) {
    if (KIND === 'monday') { if (name === 'agency') return (STATE.agency = STATE.agency || []); const st = brandState(act); st.edited = true; return st[name]; }
    return (STATE[name] = STATE[name] || []);
  }
  /* Anything that has to leave the call opens in a NEW TAB, so the call stays where it is (Cole, 2026-11-03). */
  const newTab = (open, act) => window.open(`${location.pathname}?open=${encodeURIComponent(open)}${act ? `&act=${encodeURIComponent(act)}` : ''}`, '_blank', 'noopener');
  function openInAds(act) { newTab('adcreative', act); }
  function wireMain() {
    const root = $('#csMain'); if (!root) return;
    $$('textarea', root).forEach(t => { grow(t); t.addEventListener('input', () => grow(t)); });
    $$('[data-ad]', root).forEach(b => b.onclick = () => {
      const id = b.dataset.ad, act = b.dataset.act;
      if (window.V2 && window.V2.playAd) window.V2.playAd({ id, name: b.dataset.name, act, note: 'Plays here; the call stays where it is. "See its numbers on Ads" opens a new tab.' }, H, () => openInAds(act, id));
      else openInAds(act, id);
    });
    $$('[data-allads]', root).forEach(b => b.onclick = () => {
      const k = b.dataset.allads, A = ADS[k] = ADS[k] || { sort: 'spend' };
      A.open = !A.open;
      if (A.open && !A.rows && !A.loading) loadAllAds(k); else paintMain();
    });
    $$('[data-adsort]', root).forEach(b => b.onclick = e => { e.stopPropagation(); const A = ADS[b.dataset.adsort]; if (!A) return; A.sort = b.dataset.col; paintMain(); });
    $$('[data-tab]', root).forEach(b => b.onclick = () => newTab(b.dataset.tab, b.dataset.act || ''));
    $$('[data-fold]', root).forEach(b => b.onclick = () => { const k = b.dataset.fold, rest = b.closest('.slk').querySelector('.rest'); OPEN_POSTS[k] = !OPEN_POSTS[k]; rest.hidden = !OPEN_POSTS[k]; b.textContent = OPEN_POSTS[k] ? 'Less' : 'More'; });
    $$('[data-card]', root).forEach(b => b.onclick = () => {
      const id = b.dataset.card, url = b.dataset.asana;
      if (id && window.ProdSheet && window.ProdSheet.open) window.ProdSheet.open(H, id, { tab: 'brief' });
      else if (url) window.open(url, '_blank', 'noopener');
      else newTab('production');
    });
    $$('[data-item] input[type=checkbox]', root).forEach(cb => cb.onchange = async () => {
      const li = cb.closest('[data-item]'); li.classList.toggle('off', cb.checked);
      try { await post('/api/calls/done', { item: li.dataset.item, done: cb.checked }); } catch (e) { cb.checked = !cb.checked; li.classList.toggle('off', cb.checked); toast(e.message); }
    });
    $$('[data-read]', root).forEach(t => t.oninput = () => { const st = brandState(t.dataset.read); st.read = t.value; st.edited = true; grow(t); save(); });
    $$('[data-client]', root).forEach(t => t.oninput = () => { const st = brandState(t.dataset.client); st.client = t.value; grow(t); save(); });
    const th = $('[data-theme]', root); if (th) th.oninput = () => { STATE.theme = th.value; grow(th); save(); };
    const nw = $('[data-news]', root); if (nw) nw.oninput = () => { STATE.news = nw.value; grow(nw); save(); };
    const rc = $('[data-recap]', root); if (rc) rc.oninput = () => { STATE.recap = rc.value; grow(rc); save(); };
    const pr = $('[data-postrecap]', root); if (pr) pr.onchange = () => { STATE.post_recap = pr.checked; save(); };
    $$('[data-per]', root).forEach(b => b.onclick = () => { STATE.period = b.dataset.per; save(); paintMain(); });
    $$('[data-knote]', root).forEach(t => t.oninput = () => { STATE.notes = STATE.notes || {}; STATE.notes[t.dataset.knote] = t.value; grow(t); save(); });
    /* the kickoff deal: count typed, format as a segmented control, who and due as pills */
    const dealOf = () => { const id = steps()[POS].id; STATE.deal = STATE.deal || {}; return (STATE.deal[id] = STATE.deal[id] || {}); };
    $$('[data-deal]', root).forEach(f => f.oninput = () => { dealOf()[f.dataset.deal] = f.value; save(); });
    const fmt = $('[data-fmt]', root); if (fmt) $$('button', fmt).forEach(b => b.onclick = () => { dealOf().format = b.dataset.v; $$('button', fmt).forEach(x => x.classList.toggle('on', x === b)); save(); });
    const dOwner = $('[data-dealowner]', root); if (dOwner) dOwner.onclick = () => ownerMenu(dOwner, dealOf().owner || '', v => { dealOf().owner = v; save(); paintMain(); });
    const dDue = $('[data-dealdue]', root); if (dDue) dDue.onclick = () => dueMenu(dDue, dealOf().due || '', v => { dealOf().due = v; save(); paintMain(); });
    $$('[data-list]', root).forEach(list => {
      const arr = () => listOf(list.dataset.list, list.dataset.act);
      $$('.row', list).forEach(row => {
        const i = +row.dataset.i;
        wireText($('[data-f=text]', row), v => { arr()[i].text = v; if (!v) { arr().splice(i, 1); paintMain(); } save(); });
        const o = $('[data-f=owner]', row); if (o) o.onclick = () => ownerMenu(o, arr()[i].owner || '', v => { arr()[i].owner = v; save(); paintMain(); });
        const d = $('[data-f=due]', row); if (d) d.onclick = () => dueMenu(d, arr()[i].due || '', v => { arr()[i].due = v; save(); paintMain(); });
        $('[data-f=del]', row).onclick = () => { arr().splice(i, 1); save(); paintMain(); };
      });
    });
    $$('[data-add]', root).forEach(b => b.onclick = () => { listOf(b.dataset.add, b.dataset.act).push({ text: '', owner: '', due: '' }); save(); paintMain(); const rows = $$(`[data-list="${b.dataset.add}"] .row [data-f=text]`); const last = rows[rows.length - 1]; if (last) last.focus(); });
    $$('[data-quick]', root).forEach(inp => inp.onkeydown = async e => {
      if (e.key !== 'Enter' || !inp.value.trim()) return;
      e.preventDefault();
      const text = inp.value.trim(), name = inp.dataset.quick, act = inp.dataset.act;
      inp.value = ''; inp.placeholder = 'Reading it';
      let p = { text, owner: '', due: '' };
      try { const r = await post('/api/calls/parse', { text, act }); if (r && r.text) p = { text: r.text, detail: r.detail || '', owner: r.owner || '', due: r.due || '' }; } catch {}
      listOf(name, act).push(p); save(); paintMain();
      const again = $(`[data-quick="${name}"]`); if (again) again.focus();
    });
    $$('[data-editbrief]', root).forEach(b => b.onclick = () => { if (window.ProdSheet) window.ProdSheet.open(H, b.dataset.editbrief, { onChange: () => { delete CARD[b.dataset.editbrief]; loadCard(b.dataset.editbrief); } }); else newTab('production'); });
    $$('[data-kickdone]', root).forEach(b => b.onclick = async () => {
      const id = b.dataset.kickdone, deal = (STATE.deal || {})[id] || {};
      b.disabled = true; b.textContent = 'Saving';
      try {
        const r = await post('/api/calls/kickoff/done', { id: D.call.id, card: id, note: (STATE.notes || {})[id] || '', count: deal.count || '', format: deal.format || 'Static', owner: deal.owner || '', due: deal.due || twoDays() });
        STATE.done = STATE.done || {}; STATE.done[id] = { at: new Date().toISOString(), text: r.text };
        const c = kickList().find(x => x.id === id); if (c) c.kickoff_at = new Date().toISOString();
        toast(r.asana && r.asana.why ? `Moved to Making. Asana: ${r.asana.why}` : 'Moved to Making.');
        const next = kickList().findIndex((x, i) => i > POS && !((STATE.done || {})[x.id] || x.kickoff_at));
        if (next >= 0) go(next); else paintMain();
      } catch (e) { toast(e.message); b.disabled = false; b.textContent = 'Agreed, move it to Making'; }
    });
    $$('[data-cf]', root).forEach(f => f.oninput = () => { STATE[f.dataset.cf] = f.value; if (f.tagName === 'TEXTAREA') grow(f); save(); });
    const cp = $('[data-cpost]', root); if (cp) cp.onchange = () => { STATE.post = cp.checked; save(); };
    $$('[data-clip]', root).forEach(b => b.onclick = async () => {
      const sub = b.dataset.clip; if (!sub || b.dataset.playing) return;
      b.dataset.playing = '1'; const th = $('.th', b); if (th) th.textContent = 'Loading';
      try {
        const r = await H.apiAH(`/api/calls/clip?act=${encodeURIComponent(D.act_id)}&sub=${encodeURIComponent(sub)}`);
        if (!r || !r.url) throw new Error((r && r.error) || 'No video.');
        if (th) th.outerHTML = `<video class="vid" src="${esc(r.url)}" controls autoplay playsinline></video>`;
      } catch (e) { delete b.dataset.playing; if (th) th.textContent = 'Did not play'; toast(e.message); }
    });
    $$('[data-finish]', root).forEach(wireFinish);
  }
  function wireFinish(b) {
    b.onclick = async () => {
      if (BUSY) return;
      const sure = window.confirmModal ? await window.confirmModal(KIND === 'kickoff' ? 'Finish the kickoff?' : 'Finish the call?', KIND === 'kickoff' ? 'Briefs you did not get to stay in the Brief column.' : willHtml().replace(/<[^>]+>/g, '') + '.', 'Finish') : true;
      if (!sure) return;
      BUSY = true; b.disabled = true; b.textContent = 'Sending';
      clearTimeout(SAVE_T);
      try {
        await H.apiAH('/api/calls/state', { method: 'PUT', body: JSON.stringify({ id: D.call.id, state: STATE }) });
        const r = await post('/api/calls/finish', { id: D.call.id, recap: KIND === 'client' && STATE.post_recap ? (STATE.recap != null ? STATE.recap : recapText()) : '', post: KIND === 'creator' && !!STATE.post });
        D.call = { ...D.call, status: 'finished', finished_by: H.S.meEmail || '', finished_at: new Date().toISOString(), result: KIND === 'creator' ? r.result : r.result ? { ...r.result, recap: r.recap } : { briefs: r.briefs } };
        clearInterval(CLOCK); BUSY = false; paint();
      } catch (e) { BUSY = false; b.disabled = false; b.textContent = 'Finish'; toast(e.message); }
    };
  }
  function wire() {
    const root = $('#csRoot');
    $$('[data-go]', root).forEach(b => b.onclick = () => { clearInterval(CLOCK); present(false); H.show(b.dataset.go); });
    $$('#csRoot > section [data-tab]').forEach(b => b.onclick = () => newTab(b.dataset.tab, ''));
    /* Reopen (2026-10-26): the call back to open to fix or add a line; Finish again makes only what is new. */
    $$('[data-reopen]', root).forEach(b => b.onclick = async () => {
      const sure = window.confirmModal ? await window.confirmModal('Reopen the call?', 'You can change what was typed and finish again. What the first Finish made stays, and is not made twice.', 'Reopen') : true;
      if (!sure) return;
      b.disabled = true;
      try {
        const r = await post('/api/calls/reopen', { id: D.call.id });
        D.call = { ...D.call, status: 'live' }; if (r && r.state) STATE = r.state;
        POS = steps().length - 1; paint(); toast('Reopened. Finish again when you are done.');
      } catch (e) { b.disabled = false; toast(e.message); }
    });
    const pres = $('#csPresent'); if (pres) pres.onclick = () => present(!document.body.classList.contains('cs-present'));
    const n = $('#csNext'); if (n) { if (n.hasAttribute('data-finish')) wireFinish(n); else n.onclick = () => go(POS + 1); }
    const p = $('#csPrev'); if (p) p.onclick = () => go(POS - 1);
    wireSteps(); wireMain();
  }
  function keys(e) {
    if (!$('#csRoot')) { document.removeEventListener('keydown', keys); present(false); closePop(); return; }
    if (e.key === 'Escape' && document.body.classList.contains('cs-present')) { present(false); return; }
    if (e.ctrlKey && e.key === 'Enter') { e.preventDefault(); go(steps().length - 1); return; }
    if (e.target.closest && e.target.closest('input,textarea,select,[contenteditable]')) return;
    if (e.key === 'ArrowRight') { e.preventDefault(); go(POS + 1); }
    if (e.key === 'ArrowLeft') { e.preventDefault(); go(POS - 1); }
  }

  /* ---------- open ---------- */
  function pickBrand() {
    const brands = (H.S.accounts || H.S.brands || []).filter(a => a.active !== false).map(a => ({ act_id: a.act_id, name: a.name }));
    $('#main').innerHTML = `${headHtml('Client call')}<div class="v2 cs" id="csRoot">${sec('Which client is on the call', '', `<div class="picker">${brands.map(b => `<button type="button" data-pick="${esc(b.act_id)}">${esc(b.name)}</button>`).join('') || empty('No brands.')}</div>`)}</div>`;
    acts('');
    $$('[data-pick]').forEach(b => b.onclick = () => open(H, 'client', b.dataset.pick));
  }
  async function open(host, kind, act) {
    H = host; css(); KIND = ['monday', 'client', 'kickoff', 'creator'].includes(kind) ? kind : 'monday';
    const a = act && act !== 'all' ? act : '';
    POS = 0; CARD = {}; BUSY = false; OPEN_POSTS = {}; closePop();
    if (KIND === 'client' && !a) { pickBrand(); return; }
    if (KIND === 'creator' && !a) { try { const p = await H.apiAH('/api/calls/screen?kind=creator'); pickCreator(p.pick || []); } catch (e) { toast(e.message); } return; }
    $('#main').innerHTML = `${headHtml(TITLE[KIND])}<div class="v2 cs">${sec('Loading', 'last week\'s numbers, the Slack posts and the open to-dos', '')}</div>`;
    acts('');
    try {
      const [d, cmd] = await Promise.all([
        H.apiAH(`/api/calls/screen?kind=${KIND}${a ? `&act=${encodeURIComponent(a)}` : ''}`),
        KIND === 'monday' ? H.api('/api/hub/command').catch(() => null) : null,
      ]);
      if (d.error) throw new Error(d.error);
      D = d; STATE = (d.call && d.call.state) || {}; SEV = {};
      /* A leak sent here from Home > Leaks ("Put it on the call"): one promised line, saved at once, never twice. */
      const add = window.CCALL_ADD; window.CCALL_ADD = null;
      if (add && KIND === 'client' && add.act === a && add.text) {
        STATE.promised = STATE.promised || [];
        if (!STATE.promised.some(x => x && x.text === add.text)) { STATE.promised.push({ text: add.text, owner: '', due: '', source: add.source || '', source_id: add.source_id || '' }); try { await H.apiAH('/api/calls/state', { method: 'PUT', body: JSON.stringify({ id: D.call.id, state: STATE }) }); } catch {} }
        POS = Math.max(0, CLIENT_STEPS.findIndex(s => s.id === 'week'));
      }
      if (cmd && Array.isArray(cmd.brands)) for (const b of cmd.brands) SEV[b.act_id] = b.paused ? undefined : (b.reasons || []).reduce((w, r) => r.sev === 'bad' ? 'bad' : (w === 'bad' ? w : r.sev === 'warn' ? 'warn' : w), 'good');
      if (KIND === 'kickoff') { const first = kickList().findIndex(c => !((STATE.done || {})[c.id] || c.kickoff_at)); POS = first >= 0 ? first : 0; }
      /* Resume: the URL's step (a reload or Back), else where this computer last was on this same call (12 hours). */
      let want = window.CALL_STEP, wantY = window.CALL_Y || 0; window.CALL_STEP = null; window.CALL_Y = 0;
      if (!want) { try { const p = JSON.parse(localStorage.getItem('cs_pos') || 'null'); if (p && p.call === D.call.id && Date.now() - p.at < 12 * 3600e3) { want = p.step; wantY = p.y || 0; } } catch {} }
      if (want) { const i = steps().findIndex(s => s.id === want); if (i >= 0) POS = i; else wantY = 0; }
      RESUME_Y = want ? wantY : 0;
    } catch (e) { $('#main').innerHTML = `${headHtml(TITLE[KIND])}<div class="v2 cs" id="csRoot">${sec('Did not load', '', `<p class="cs-empty" style="color:var(--bad)">${esc(e.message)}</p><div class="cs-acts"><button type="button" class="btn" data-go="calls">Meetings</button></div>`)}</div>`; $$('[data-go]').forEach(b => b.onclick = () => H.show(b.dataset.go)); return; }
    paint();
    /* History: an exit marker under the call, then this step on top, so Back from the first step returns to Meetings. */
    try {
      if (history.state && history.state.cs === 1) history.replaceState(navState(stepId(), RESUME_Y), '', urlFor(stepId(), RESUME_Y));   // reopened by Back
      else { history.replaceState({ cs: 'exit' }, '', location.pathname); history.pushState(navState(stepId(), RESUME_Y), '', urlFor(stepId(), RESUME_Y)); }
    } catch {}
    if (RESUME_Y) { const y = RESUME_Y; requestAnimationFrame(() => setTimeout(() => window.scrollTo(0, y), 60)); }
    RESUME_Y = 0;
    document.removeEventListener('keydown', keys); document.addEventListener('keydown', keys);
  }
  window.CallScreen = { open, back: () => { present(false); closePop(); try { history.replaceState(null, '', location.pathname); } catch {} H && H.show('calls'); } };
})();

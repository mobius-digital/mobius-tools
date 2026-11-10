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
  /* A section with a control on the right of its title (Columns, Attribution), never squeezed against the table edge. */
  const secA = (title, cap, act, body, cls = '') => `<section class="cs-sec ${cls}"><header class="cs-hd"><div><h3>${title}</h3>${cap ? `<p class="cap">${cap}</p>` : ''}</div><div class="cs-hda">${act}</div></header><div class="cs-body">${body}</div></section>`;

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
      /* calls v2 (2026-11-09) */
      .cs .v2pick{display:none!important}
      .cs .v2gal-client .v2pill,.cs .v2gal-client .v2one{display:none!important}
      .cs .cs-chans{display:grid;grid-template-columns:repeat(auto-fill,minmax(170px,1fr));gap:10px}
      .cs .cs-chan{border:1px solid var(--line);border-radius:var(--r-lg);background:var(--bg);padding:12px 14px;text-align:left;font:inherit;color:var(--ink);cursor:pointer;display:flex;flex-direction:column;gap:4px;font-variant-numeric:tabular-nums;transition:border-color var(--t-fast) var(--ease)}
      .cs .cs-chan:hover{border-color:var(--line-strong)}
      .cs .cs-chan.on{border-color:var(--brand);box-shadow:inset 0 0 0 1px var(--brand)}
      .cs .cs-chan b{font-size:14px;font-weight:650}
      .cs .cs-chan span{display:flex;justify-content:space-between;gap:8px;font-size:13px;font-weight:600}
      .cs .cs-chan span i{font-style:normal;font-weight:500;color:var(--muted)}
      .cs .cs-chan small{font-size:11px;margin-left:4px;font-weight:600}.cs .cs-chan small.up{color:var(--good)}.cs .cs-chan small.down{color:var(--bad)}
      .cs .cs-camp tr.cmp{cursor:pointer}.cs .cs-camp tr.cmp td:first-child{font-weight:650}
      .cs .cs-camp tr.set td{background:var(--surface-2)}.cs .cs-camp tr.set td:first-child{padding-left:18px;font-weight:550}
      .cs .cs-camp tr.adr{cursor:pointer}.cs .cs-camp tr.adr td:first-child{padding-left:34px;font-weight:500;color:var(--ink-2)}
      .cs .cs-camp tr.cmp:hover td,.cs .cs-camp tr.adr:hover td{background:var(--surface-2)}
      .cs .cs-camp td:first-child{max-width:420px;overflow-wrap:anywhere}
      .cs .muted{color:var(--muted)}
      .cs .cs-two{display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:12px;min-width:0}
      .cs .cs-box{border:1px solid var(--line);border-radius:var(--r-lg);background:var(--bg);padding:12px 14px;display:flex;flex-direction:column;gap:10px;min-width:0}
      .cs .cs-meter{display:flex;flex-direction:column;gap:5px;font-size:13px}
      .cs .cs-meter small{display:block;color:var(--muted);font-size:12px}
      .cs .cs-meter .bar{height:8px;border-radius:4px;background:var(--surface-2);overflow:hidden}.cs .cs-meter .bar i{display:block;height:100%}
      .cs .row.cs-plan{grid-template-columns:minmax(0,1fr) auto auto auto 28px}
      .cs .cs-vote{display:inline-flex;gap:4px}
      .cs .cs-vote button{height:28px;min-width:34px;border:1px solid var(--line-strong);border-radius:var(--r-sm);background:var(--surface);cursor:pointer;font-size:14px;filter:grayscale(1);opacity:.7}
      .cs .cs-vote button.y{background:var(--good-bg);border-color:var(--good);filter:none;opacity:1}
      .cs .cs-vote button.n{background:var(--bad-bg);border-color:var(--bad);filter:none;opacity:1}
      .cs .row.cs-money{grid-template-columns:minmax(0,1fr) auto auto 0}
      .cs .cs-board{display:grid;grid-template-columns:repeat(4,minmax(170px,1fr));gap:10px;overflow-x:auto}
      .cs .cs-board .col{background:var(--surface-2);border-radius:var(--r-lg);padding:8px;display:flex;flex-direction:column;gap:6px;min-width:170px}
      .cs .cs-board h4{margin:2px 4px 2px;font-size:12px;font-weight:600;color:var(--muted);display:flex;justify-content:space-between;text-transform:uppercase;letter-spacing:.04em}
      .cs .cs-board .mini{background:var(--surface)}
      .cs .cs-board .mini span{white-space:normal}
      .cs .cs-vote button{filter:none;opacity:1;font-size:12px;font-weight:600;padding:0 10px;color:var(--ink-2)}
      .cs .cs-vote button.y{background:var(--good);border-color:var(--good);color:#fff}
      .cs .cs-vote button.c{background:var(--warn);border-color:var(--warn);color:#fff}
      .cs .cs-vote button.n{background:var(--bad);border-color:var(--bad);color:#fff}
      .cs .row.cs-plan{grid-template-columns:minmax(0,1fr) auto 28px;align-items:start}
      .cs .row.cs-plan input{margin-top:6px}
      .cs .cs-part .cs-who{font-size:11px;letter-spacing:0;text-transform:none;font-weight:600;padding:2px 9px;border-radius:var(--r-pill);color:#fff;background:var(--ink-2);width:auto;height:auto;display:inline-block}
      .cs .cs-part .cs-who.meta{background:var(--c-meta)}.cs .cs-part .cs-who.google{background:var(--c-google)}.cs .cs-part .cs-who.trybe{background:var(--c-tiktok)}
      .cs .cs-funnel{display:flex;flex-direction:column;gap:6px}
      .cs .cs-funnel .fs{display:grid;grid-template-columns:120px minmax(0,1fr) minmax(200px,auto);gap:12px;align-items:center;font-size:13px}
      .cs .cs-funnel .l{color:var(--ink-2);font-weight:550}
      .cs .cs-funnel .tr{height:22px;border-radius:6px;background:var(--surface-2);overflow:hidden}.cs .cs-funnel .tr i{display:block;height:100%;border-radius:6px;opacity:.85}
      .cs .cs-funnel .v{font-variant-numeric:tabular-nums;display:flex;gap:6px;align-items:center;flex-wrap:wrap}.cs .cs-funnel .v small{color:var(--muted);font-size:12px}
      .cs .cs-bud{border:1px dashed var(--line-strong);background:var(--surface);border-radius:var(--r-sm);padding:2px 8px;font:inherit;font-size:12.5px;font-weight:600;color:var(--ink);cursor:pointer;white-space:nowrap}
      .cs .cs-bud:hover{border-color:var(--brand);color:var(--brand)}
      .cs .cs-budin{width:90px!important;min-height:28px!important;padding:2px 8px!important;font-size:13px!important}
      .cs .cs-sw{display:inline-flex;align-items:center;gap:6px;border:1px solid var(--line-strong);background:var(--surface);border-radius:var(--r-pill);padding:2px 9px 2px 4px;font:inherit;font-size:12px;font-weight:600;color:var(--muted);cursor:pointer}
      .cs .cs-sw i{width:14px;height:14px;border-radius:50%;background:var(--line-strong)}
      .cs .cs-sw.on{color:var(--good);border-color:var(--good)}.cs .cs-sw.on i{background:var(--good)}
      .cs .cs-rvs{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:10px}
      .cs .cs-rv{display:grid;grid-template-columns:84px minmax(0,1fr);gap:10px;border:1px solid var(--line);border-radius:var(--r-lg);background:var(--bg);padding:8px}
      .cs .cs-rv .th{aspect-ratio:9/16;border-radius:var(--r-sm);background:var(--line) center/cover no-repeat}
      .cs .cs-rv .bd{display:flex;flex-direction:column;gap:6px;min-width:0;font-size:13px}.cs .cs-rv .bd p{margin:0;color:var(--ink-2);font-size:12px;overflow:hidden;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical}
      .cs .cs-rv .btn{align-self:flex-start}
      @media (max-width:760px){.cs .cs-funnel .fs{grid-template-columns:90px minmax(0,1fr);}.cs .cs-funnel .v{grid-column:1/-1}}
      /* Round 2 (Cole 2026-11-10): funnel as a table with real bars, dropdowns instead of button rows, change chips, calendar */
      .cs table.cs-fun td.bar{width:30%;min-width:120px}
      .cs .cs-fbar{height:16px;border-radius:5px;background:var(--bg);border:1px solid var(--line);position:relative}
      .cs .cs-fbar i{position:absolute;left:0;top:0;bottom:0;border-radius:4px}
      .cs .cs-lead{display:flex;align-items:center;gap:8px;flex-wrap:wrap;font-size:13px;color:var(--ink-2);font-variant-numeric:tabular-nums}
      .cs .cs-lead b{color:var(--ink)}.cs .cs-lead .ar{color:var(--muted)}
      .cs .cs-rate{font-weight:600}.cs .cs-rate.up{color:var(--good)}.cs .cs-rate.down{color:var(--bad)}
      .cs .cs-tools{display:flex;align-items:center;gap:10px;flex-wrap:wrap}
      .cs .cs-sel{display:inline-flex;align-items:center;gap:6px;font-size:12px;font-weight:500;color:var(--muted)}
      .cs .cs-sel select{height:30px;border:1px solid var(--line-strong);border-radius:var(--r-sm);background:var(--surface);color:var(--ink);font:inherit;font-size:13px;font-weight:550;padding:0 8px;cursor:pointer}
      .cs .cs-colbtn{height:30px;border:1px solid var(--line-strong);border-radius:var(--r-sm);background:var(--surface);color:var(--ink);font:inherit;font-size:13px;font-weight:550;padding:0 10px;cursor:pointer}
      .cs .cs-tools .gap{flex:1}
      .cs .cs-tbl tr.set td:first-child{padding-left:22px;font-weight:500}
      .cs .cs-tbl tr.adr td:first-child{padding-left:44px;font-weight:500}
      .cs .cs-tbl tr.adr,.cs .cs-tbl tr.set{cursor:pointer}.cs .cs-tbl tr.adr:hover td,.cs .cs-tbl tr.set:hover td,.cs .cs-tbl tr.cmp:hover td{background:var(--bg)}
      .cs .cs-tbl tr.adr .tn{display:inline-block;width:24px;height:30px;border-radius:4px;background:var(--line) center/cover;vertical-align:middle;margin-right:8px}
      .cs .cs-chip{display:inline-flex;align-items:center;gap:4px;height:22px;padding:0 8px;border-radius:var(--r-pill);font-size:12px;font-weight:600;white-space:nowrap;background:var(--bg);color:var(--ink-2);border:1px solid var(--line)}
      .cs .cs-chip.up{background:var(--good-bg);color:var(--good);border-color:transparent}.cs .cs-chip.down{background:var(--bad-bg);color:var(--bad);border-color:transparent}
      .cs .cs-chip.new{background:var(--brand);color:#fff;border-color:transparent}.cs .cs-chip.meta{color:var(--c-meta)}.cs .cs-chip.google{color:var(--c-google)}.cs .cs-chip.email{color:var(--c-email)}
      .cs .cs-chg{list-style:none;margin:0;padding:0;display:flex;flex-direction:column}
      .cs .cs-chg li{display:grid;grid-template-columns:96px minmax(0,1fr) auto;gap:10px;align-items:center;padding:7px 0;border-top:1px solid var(--line);font-size:13.5px}
      .cs .cs-chg li.day{display:block;border:0;font-size:11px;font-weight:600;letter-spacing:.05em;text-transform:uppercase;color:var(--muted);padding:10px 0 2px}
      .cs .cs-chg .tx{min-width:0;overflow-wrap:anywhere}.cs .cs-chg .tx em{font-style:normal;font-weight:650}
      .cs .cs-chg .o{font-size:12px;color:var(--muted);white-space:nowrap}
      .cs .cs-sum{display:flex;gap:6px;flex-wrap:wrap}
      .cs .cs-cal{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:4px}
      .cs .cs-cal .h{font-size:11px;font-weight:600;color:var(--muted);text-transform:uppercase;letter-spacing:.05em;padding:0 4px}
      .cs .cs-cal .d{min-height:70px;border:1px solid var(--line);border-radius:var(--r-sm);background:var(--bg);padding:4px;display:flex;flex-direction:column;gap:3px;min-width:0}
      .cs .cs-cal .d.t{border-color:var(--ink);box-shadow:inset 0 0 0 1px var(--ink)}.cs .cs-cal .d.past{opacity:.45}
      .cs .cs-cal .d .n{font-size:11px;font-weight:600;color:var(--muted)}
      .cs .cs-cal .ev{font-size:11px;font-weight:600;line-height:1.25;padding:2px 5px;border-radius:4px;background:var(--brand);color:#fff;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      .cs .cs-cal .ev.un{background:var(--surface);color:var(--ink-2);border:1px dashed var(--line-strong)}
      .cs .cs-howto{display:flex;gap:6px 16px;flex-wrap:wrap;font-size:12px;color:var(--muted);margin:0}.cs .cs-howto b{color:var(--ink-2)}
      .cs .cs-rvg{display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:12px}
      .cs .cs-rvc{border:1px solid var(--line);border-radius:var(--r-lg);background:var(--bg);overflow:hidden;display:flex;flex-direction:column;min-width:0}
      .cs .cs-rvc .th{aspect-ratio:9/16;max-height:300px;width:100%;background:var(--line) center/cover no-repeat;position:relative;border:0;padding:0;cursor:pointer;display:grid;place-items:center;color:var(--muted);font:inherit;font-size:12px}
      .cs .cs-rvc .th .play{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);width:38px;height:38px;border-radius:50%;background:rgba(0,0,0,.55);color:#fff;display:grid;place-items:center}
      .cs .cs-rvc video{width:100%;aspect-ratio:9/16;max-height:300px;background:#000}
      .cs .cs-rvc .bd{padding:9px 10px 10px;display:flex;flex-direction:column;gap:6px;font-size:13px;min-width:0}
      .cs .cs-rvc .bd p{margin:0;color:var(--ink-2);font-size:12px;overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical}
      .cs .cs-rvc .cs-vote{display:grid;grid-template-columns:repeat(3,1fr)}
      .cs .cs-rvc .cs-vote button{padding:0 4px}
      /* ===== Round 3 look (Cole 2026-11-10: "flat", "that modern SaaS look"). Locus's own palette (navy ink, sky brand)
         with depth: soft layered shadows instead of hard borders, a faint brand wash behind the page, channel colour as an
         accent on each part, bigger numbers, quieter labels, real switches and Locus menus instead of browser controls. */
      /* Round 4 (Cole: "looks off, is this following proper colors?"). Audit: round 3 brought in colours and shapes the
         rest of Locus does not use (a lilac wash, 18px corners, gradient bars on every tile, a stripe on every card).
         Back to Locus v2 itself: neutral greys, ONE blue (--brand), status colours only for good / bad, channel colours
         only inside charts and on the small part marker, 12px corners, a hairline border plus one soft shadow. The
         modern feel comes from hierarchy and spacing, not decoration. */
      .cs{max-width:1200px;--acc:var(--brand);--sh-1:0 1px 2px rgba(21,21,24,.04),0 4px 14px -8px rgba(21,21,24,.10);gap:16px}
      .cs .cs-sec{border:1px solid var(--line);border-radius:12px;padding:18px 20px;box-shadow:var(--sh-1);gap:14px;position:relative;background:var(--surface)}
      .cs .cs-sec header h3{font-size:16px;font-weight:650;letter-spacing:-.012em}
      .cs .cs-sec header .cap{font-size:12.5px;max-width:72ch}
      .cs header.cs-hd{flex-direction:row;align-items:flex-start;justify-content:space-between;gap:12px}
      .cs header.cs-hd>div:first-child{display:flex;flex-direction:column;gap:2px;min-width:0}
      .cs .cs-hda{display:flex;gap:8px;flex:0 0 auto}
      .cs .cs-grp{display:flex;flex-direction:column;gap:16px}
      .cs .cs-part{margin:20px 0 0;font-size:12px;font-weight:650;letter-spacing:.06em;color:var(--ink-2)}
      .cs .cs-part>span:first-child{width:22px;height:22px;border-radius:6px;background:color-mix(in srgb,var(--acc) 14%,var(--surface));border:1px solid color-mix(in srgb,var(--acc) 35%,var(--line));color:color-mix(in srgb,var(--acc) 70%,var(--ink));font-size:11.5px;font-weight:700;display:grid;place-items:center}
      .cs .cs-part::after{content:'';flex:1;height:1px;background:var(--line)}
      .cs .cs-tiles{grid-template-columns:repeat(auto-fit,minmax(168px,1fr));gap:10px}
      .cs .cs-tile{background:var(--surface);border:1px solid var(--line);border-radius:10px;padding:13px 15px;box-shadow:none;gap:6px}
      .cs .cs-tile .l{font-size:12px;font-weight:500;color:var(--muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      .cs .cs-tile .v{font-size:24px;font-weight:650;letter-spacing:-.02em;flex-wrap:nowrap;justify-content:flex-start;align-items:center;gap:8px}
      .cs .cs-tile .sub{line-height:1.4}
      .cs .cs-tile .sub.down{color:var(--bad)}.cs .cs-tile .sub.up{color:var(--good)}
      .cs .cs-d{height:20px;padding:0 7px;font-size:11.5px;flex:0 0 auto}
      .cs table.cs-tbl thead th{font-size:11px;font-weight:600;letter-spacing:.05em;text-transform:uppercase;color:var(--muted);padding:0 8px 9px;vertical-align:bottom;line-height:1.25}
      .cs table.cs-camp thead th:not(:first-child){max-width:84px}
      .cs table.cs-tbl th:last-child,.cs table.cs-tbl td:last-child{padding-right:2px}
      .cs table.cs-tbl td{padding:9px 7px;border-top:1px solid color-mix(in srgb,var(--line) 75%,transparent)}
      .cs table.cs-tbl tbody tr{transition:background var(--t-fast,.15s) ease}
      .cs .cs-tbl th .srt{font:inherit;letter-spacing:inherit;text-transform:inherit;color:inherit;background:none;border:0;padding:0;cursor:pointer}.cs .cs-tbl th .srt.on{color:var(--ink)}
      .cs .cs-tbl tr.cmp td:first-child b{font-weight:650}
      .cs .cs-flash td{animation:csflash 1.6s ease}
      @keyframes csflash{0%,60%{background:color-mix(in srgb,var(--brand) 22%,transparent)}100%{background:transparent}}
      /* dropdown buttons (Locus menus) */
      .cs .cs-dd{display:inline-flex;align-items:center;gap:8px;height:34px;padding:0 10px 0 12px;border-radius:10px;border:1px solid var(--line-strong);background:var(--surface);box-shadow:0 1px 2px rgba(16,32,43,.06);font:inherit;font-size:13px;color:var(--ink);cursor:pointer;white-space:nowrap;transition:border-color .15s ease,box-shadow .15s ease}
      .cs .cs-dd:hover{border-color:var(--brand);box-shadow:0 0 0 3px color-mix(in srgb,var(--brand) 18%,transparent)}
      .cs .cs-dd .k{color:var(--muted);font-weight:500}.cs .cs-dd .v{font-weight:650}.cs .cs-dd svg{color:var(--muted)}
      .cs .cs-tools{gap:8px}
      /* the on / off switch: a real switch, tap = Meta's before and after, then it flips */
      .cs .cs-sw{border:0;background:none;padding:0;gap:8px;color:var(--muted);font-size:12px;font-weight:600}
      .cs .cs-sw i{position:relative;width:36px;height:20px;border-radius:999px;background:var(--line-strong);transition:background .2s ease;flex:0 0 36px}
      .cs .cs-sw i::after{content:'';position:absolute;top:2px;left:2px;width:16px;height:16px;border-radius:50%;background:#fff;box-shadow:0 1px 3px rgba(0,0,0,.25);transition:transform .2s ease}
      .cs .cs-sw.on{color:var(--good)}.cs .cs-sw.on i{background:linear-gradient(135deg,#2bb673,var(--good))}.cs .cs-sw.on i::after{transform:translateX(16px)}
      .cs .cs-sw:hover i{box-shadow:0 0 0 3px color-mix(in srgb,var(--brand) 20%,transparent)}
      .cs .cs-bud{border:1px solid var(--line);border-radius:8px;background:var(--bg);padding:3px 9px}
      /* funnel: flow cards + drop-off bars */
      .cs .cs-flow{display:flex;align-items:stretch;gap:0;overflow-x:auto;padding-bottom:2px}
      .cs .cs-fc{flex:1 1 0;min-width:120px;display:flex;flex-direction:column;gap:3px;padding:13px 15px;border-radius:10px;background:var(--surface);border:1px solid var(--line)}
      .cs .cs-fc .l{font-size:11.5px;font-weight:600;color:var(--muted)}.cs .cs-fc .v{font-size:24px;font-weight:650;letter-spacing:-.02em;font-variant-numeric:tabular-nums}.cs .cs-fc .d{font-size:12px}
      .cs .cs-fa{flex:0 0 auto;align-self:center;display:inline-flex;align-items:center;gap:4px;margin:0 -6px;z-index:1;padding:4px 9px;border-radius:999px;background:var(--surface);border:1px solid var(--line);box-shadow:0 2px 6px -2px rgba(16,32,43,.18);color:var(--muted);font-size:12px;line-height:1}
      .cs .cs-fa b{font-size:12px;font-weight:700;color:var(--ink)}
      .cs .cs-hops{display:flex;flex-direction:column;gap:12px;margin-top:4px}
      .cs .cs-hlegend{display:flex;gap:16px;flex-wrap:wrap;font-size:11.5px;color:var(--muted);align-items:center}
      .cs .cs-hlegend i{display:inline-block;width:14px;height:8px;border-radius:3px;margin-right:6px;vertical-align:middle}
      .cs .cs-hlegend b{display:inline-block;width:2px;height:12px;margin-right:6px;vertical-align:middle}
      .cs .cs-hop{display:grid;grid-template-columns:minmax(150px,210px) minmax(0,1fr) 116px;gap:14px;align-items:center;cursor:default}
      .cs .cs-hop .hl{font-size:13px;font-weight:600;color:var(--ink-2)}
      .cs .cs-hbar{position:relative;height:14px;border-radius:999px;background:color-mix(in srgb,var(--line) 70%,var(--bg))}
      .cs .cs-hbar i{position:absolute;left:0;top:0;bottom:0;border-radius:999px;background-image:linear-gradient(90deg,rgba(255,255,255,.0),rgba(255,255,255,.28))!important;background-blend-mode:normal}
      .cs .cs-hbar b,.cs .cs-hlegend b{position:absolute;top:-4px;bottom:-4px;width:2px;border-radius:2px}
      .cs .cs-hlegend b{position:static}
      .cs b.usual{background:var(--ink)}.cs b.was{background:repeating-linear-gradient(180deg,var(--muted) 0 3px,transparent 3px 5px)}
      .cs .cs-hop .hr{display:flex;align-items:baseline;gap:6px;justify-content:flex-end;font-variant-numeric:tabular-nums}.cs .cs-hop .hr b{font-size:16px;font-weight:700}.cs .cs-hop .hr small{color:var(--muted);font-size:11.5px}
      .cs .cs-hop:hover .cs-hbar{box-shadow:0 0 0 3px color-mix(in srgb,var(--brand) 16%,transparent)}
      /* changes */
      .cs .cs-sum .cs-chip b{font-weight:750;margin-left:2px}
      .cs .cs-chg li{grid-template-columns:150px minmax(0,1fr) auto;text-align:left;padding:8px 6px}.cs .cs-chg .tx{text-align:left;display:block;justify-content:flex-start}
      .cs .cs-chg li.go{cursor:pointer;border-radius:8px}.cs .cs-chg li.go:hover{background:var(--bg)}
      .cs .cs-chg .chev{color:var(--muted);font-size:16px;margin-left:4px}
      .cs .cs-chg .tx .cs-plat,.cs .cs-plat{display:inline-block!important;width:8px;height:8px;border-radius:50%;margin-right:8px;vertical-align:middle;background:var(--c-meta)}.cs .cs-plat.google{background:var(--c-google)}.cs .cs-plat.email{background:var(--c-email)}
      .cs .cs-cal .d{border-radius:8px;background:var(--surface)}.cs .cs-cal .ev{border-radius:5px;background:var(--brand-soft);color:var(--brand-ink);border:1px solid var(--brand-line)}
      .cs .cs-steps .cs-pill{height:30px;padding:0 12px}
      .cs .cs-hbar i{background-image:none!important}
      /* Round 5: a centered, quiet funnel; the section number badge centered; one comparison style everywhere */
      .cs .cs-fc{align-items:center;text-align:center;padding:16px 12px}
      .cs .cs-fc .d{display:flex;justify-content:center;min-height:20px}
      .cs .cs-board .mini small,.cs .cs-board .mini small span{display:inline;white-space:normal}
      /* Round 6 funnel: cards joined by a middle column (the share that moved on + how it compares) */
      .cs .cs-flow{align-items:center;gap:0}
      .cs .cs-fm{flex:0 0 116px;display:flex;flex-direction:column;align-items:center;gap:3px;text-align:center;padding:0 6px;position:relative}
      .cs .cs-fm::before{content:'';position:absolute;left:0;right:0;top:50%;height:1px;background:var(--line);z-index:0}
      .cs .cs-fm>*{position:relative;z-index:1;background:var(--surface);padding:0 6px}
      .cs .cs-fm b{font-size:17px;font-weight:700;font-variant-numeric:tabular-nums}
      .cs .cs-fm .k{font-size:11px;color:var(--muted);font-weight:500}
      .cs .cs-fc .l small{font-size:10.5px;font-weight:500}
      .cs p.cs-lead{display:block;margin:0;font-size:13px;color:var(--ink-2)}
      /* Customers pictures */
      .cs .cs-cv{display:grid;grid-template-columns:repeat(auto-fit,minmax(110px,1fr));gap:12px;align-items:end;height:200px}
      .cs .cs-cv .c{display:flex;flex-direction:column;align-items:center;justify-content:flex-end;gap:5px;height:100%;text-align:center}
      .cs .cs-cv .c i{display:block;width:56%;border-radius:6px 6px 2px 2px;background:var(--brand);opacity:.85}
      .cs .cs-cv .v{font-size:15px;font-weight:650;font-variant-numeric:tabular-nums}.cs .cs-cv .d{font-size:12px;font-weight:600;color:var(--ink-2)}.cs .cs-cv .r{font-size:11.5px;color:var(--muted)}
      .cs table.cs-path td:not(:first-child),.cs table.cs-path th:not(:first-child){text-align:left}
      .cs table.cs-path td:nth-child(2),.cs table.cs-path td:nth-child(3),.cs table.cs-path th:nth-child(2),.cs table.cs-path th:nth-child(3){text-align:right}
      .cs table.cs-path td:last-child{padding-left:18px}.cs table.cs-path .cs-chip{margin:2px 4px 2px 0}
      .cs .cs-srcrow{display:grid;grid-template-columns:120px minmax(0,1fr);gap:6px 14px;align-items:center}
      .cs .cs-srcrow .t{font-size:13px;font-weight:600;color:var(--ink-2)}
      .cs .cs-stack{display:flex;height:14px;border-radius:999px;overflow:hidden;background:var(--surface-2)}
      .cs .cs-stack i{display:block;height:100%}
      .cs .cs-srcrow .k{grid-column:2;display:flex;gap:14px;flex-wrap:wrap;font-size:12px;color:var(--muted)}
      .cs .cs-srcrow .k i{display:inline-block;width:8px;height:8px;border-radius:50%;margin-right:5px}
      .cs .cs-ltv{display:grid;grid-template-columns:minmax(0,1.4fr) minmax(0,1fr);gap:20px;align-items:center}
      .cs .cs-ltvsvg{width:100%;height:auto;max-height:240px;font-family:inherit}
      .cs .cs-ltv .say{display:flex;flex-direction:column;gap:4px}
      .cs .cs-ltv .say b{font-size:30px;font-weight:700;letter-spacing:-.02em}.cs .cs-ltv .say span{font-size:12px;font-weight:600;color:var(--muted);text-transform:uppercase;letter-spacing:.05em}
      .cs .cs-ltv .say p{margin:6px 0 0;font-size:13px;color:var(--ink-2);line-height:1.5}
      @media (max-width:760px){.cs .cs-ltv{grid-template-columns:1fr}}
      .cs td.cs-g{color:var(--good);background:var(--good-bg);font-weight:650}.cs td.cs-r{color:var(--bad);background:var(--bad-bg);font-weight:650}
      .cs .cs-cnts{display:flex;align-items:center;gap:8px;flex-wrap:wrap;font-size:13px;color:var(--ink-2);font-variant-numeric:tabular-nums}
      .cs .cs-cnts b{color:var(--ink);font-weight:650}.cs .cs-cnts .ar{color:var(--muted)}.cs .cs-cnts small{color:var(--muted)}
      .cs .cs-cnt.miss{color:var(--muted)}
      .cs .cs-hps{display:flex;flex-direction:column;gap:14px;margin-top:2px}
      .cs .cs-hp{display:grid;grid-template-columns:minmax(180px,230px) minmax(0,1fr) 170px;gap:16px;align-items:center}
      .cs .cs-hp .t{font-size:13px;font-weight:600;color:var(--ink-2)}
      .cs .cs-hp .bars{display:flex;flex-direction:column;gap:4px}
      .cs .cs-hp .bars i{display:block;border-radius:999px}
      .cs .cs-hp .bars i.now{height:12px;background:var(--brand)}
      .cs .cs-hp .bars i.was{height:7px;background:var(--brand-line,#B9CBF5)}
      .cs .cs-hp .v{display:flex;align-items:baseline;gap:8px;justify-content:flex-end}
      .cs .cs-hp .v b{font-size:16px;font-weight:700;font-variant-numeric:tabular-nums}.cs .cs-hp .v b.up{color:var(--good)}.cs .cs-hp .v b.down{color:var(--bad)}
      .cs .cs-hp.miss .m{grid-column:2/-1;font-size:12.5px;color:var(--muted);font-style:italic}
      .cs .cs-was{font-size:12px;font-weight:600;white-space:nowrap}.cs .cs-was.up{color:var(--good)}.cs .cs-was.down{color:var(--bad)}
      .cs .cs-key{margin:2px 0 0;display:flex;gap:6px;align-items:center;font-size:11.5px;color:var(--muted)}
      .cs .cs-key i{display:inline-block;width:18px;border-radius:999px}.cs .cs-key i.now{height:8px;background:var(--brand)}.cs .cs-key i.was{height:6px;background:var(--brand-line,#B9CBF5);margin-left:10px}
      @media (max-width:760px){.cs .cs-hp{grid-template-columns:1fr auto}.cs .cs-hp .bars{grid-column:1/-1;grid-row:2}}
      .cs .cs-cr{display:flex;align-items:baseline;gap:8px;flex-wrap:wrap;font-size:13px}
      .cs .cs-cr .k{font-size:12px;font-weight:600;color:var(--muted);text-transform:uppercase;letter-spacing:.05em}
      .cs .cs-cr b{font-size:26px;font-weight:700;letter-spacing:-.02em;font-variant-numeric:tabular-nums}
      .cs table.cs-ft td:first-child{font-weight:600}.cs table.cs-ft td:first-child small{display:block;font-weight:500;font-size:11.5px}
      .cs table.cs-ft td b{font-weight:650}
      .cs table.cs-ft tr.miss td{color:var(--muted);font-style:italic}.cs table.cs-ft tr.miss td:first-child{font-style:normal}
      .cs table.cs-ft tr.miss td[colspan]{text-align:left;padding-left:24px}
      .cs .cs-subblk{display:flex;flex-direction:column;gap:8px}
      .cs .cs-subblk h4{margin:0;font-size:14px;font-weight:650;color:var(--ink)}
      .cs .cs-subblk .cap{margin:-4px 0 4px;font-size:12px;color:var(--muted)}
      .cs details.cs-fold{border-top:1px solid var(--line);padding-top:10px}
      .cs details.cs-fold>summary{cursor:pointer;list-style:none;font-size:13px;font-weight:600;color:var(--brand-ink)}
      .cs details.cs-fold>summary::-webkit-details-marker{display:none}
      .cs details.cs-fold>summary::before{content:'+ '}.cs details.cs-fold[open]>summary::before{content:'− '}
      .cs details.cs-fold[open]>summary{margin-bottom:12px}
      .cs details.cs-fold>.in{display:flex;flex-direction:column;gap:16px}
      .cs ol.lines{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:10px}
      .cs ol.lines li{display:flex;gap:12px;align-items:flex-start;font-size:14.5px;line-height:1.45;color:var(--ink)}
      .cs ol.lines li>i{font-style:normal;flex:0 0 24px;width:24px;height:24px;border-radius:7px;background:var(--brand-soft);color:var(--brand-ink);font-size:12px;font-weight:700;display:inline-flex;align-items:center;justify-content:center}
      .cs .cs-jump{position:sticky;top:8px;z-index:20;display:flex;gap:4px;flex-wrap:wrap;padding:6px;background:color-mix(in srgb,var(--surface) 92%,transparent);backdrop-filter:blur(8px);border:1px solid var(--line);border-radius:12px;box-shadow:var(--sh-1)}
      .cs .cs-jump button{height:30px;padding:0 12px;border:0;border-radius:8px;background:transparent;font:inherit;font-size:13px;font-weight:550;color:var(--ink-2);cursor:pointer}
      .cs .cs-jump button:hover{background:var(--surface-2);color:var(--ink)}
      .cs .cs-grp{scroll-margin-top:64px}
      .cs .cs-board .mini .tn{display:block;width:100%;aspect-ratio:4/5;max-height:120px;border-radius:6px;background:var(--line) center/cover;margin-bottom:6px}
      .cs .cs-htitle{margin:6px 0 0;font-size:12px;font-weight:600;color:var(--muted)}
      .cs .cs-hop{grid-template-columns:minmax(170px,230px) minmax(0,1fr) 190px}
      .cs .cs-hop .hl{display:flex;align-items:center;justify-content:flex-start;gap:6px}.cs .cs-hop .hl .ar{color:var(--faint,var(--muted))}
      .cs .cs-hbar{height:10px;background:var(--surface-2)}
      .cs .cs-hbar i{border-radius:999px}
      .cs .cs-hop .hr{justify-content:flex-start;gap:10px;align-items:center}
      .cs .cs-hop .hr b{font-size:15px;min-width:44px;text-align:right}
      .cs .cs-cmp{font-size:11.5px;font-weight:600;border-radius:999px;padding:2px 8px;background:var(--surface-2);color:var(--muted);white-space:nowrap}
      .cs .cs-cmp.up{background:var(--good-bg);color:var(--good)}.cs .cs-cmp.down{background:var(--bad-bg);color:var(--bad)}
      .cs .cs-part>span:first-child{display:inline-flex!important;align-items:center;justify-content:center;padding:0;letter-spacing:0;line-height:1;text-align:center;flex:0 0 22px}
      @media (max-width:760px){.cs .cs-hop{grid-template-columns:minmax(0,1fr) auto}.cs .cs-hop .cs-hbar{grid-column:1/-1;grid-row:2}.cs .cs-fc{min-width:104px}.cs header.cs-hd{flex-direction:column}}
      @media (max-width:760px){.cs table.cs-fun td.bar{min-width:70px}.cs .cs-cal .d{min-height:50px}.cs .cs-chg li{grid-template-columns:80px minmax(0,1fr)}.cs .cs-chg .o{grid-column:2}}
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
  /* lowerBetter: true = a fall is good (cost per sale); 'n' = neither (spend, budgets: Cole, "ad spend going up is never
     good or bad, it is just up"), shown grey with an arrow. */
  const delta = (a, b, lowerBetter) => { const v = pct(a, b); if (v == null) return ''; if (lowerBetter === 'n') return `<span class="cs-d flat">${v > 0 ? '↑' : v < 0 ? '↓' : ''} ${Math.abs(v)}%</span>`; const tone = Math.abs(v) < 1 ? 'flat' : (lowerBetter ? v <= 0 : v >= 0) ? 'up' : 'down'; return `<span class="cs-d ${tone}">${v > 0 ? '+' : ''}${v}%</span>`; };
  /* 2026-11-03 rewrite (Cole on the Nov 2 calls: "I don't know what I'm looking at"): every tile says what it counts in
     its own label, and the line under it says what it is compared with. The section caption says where it all comes from.
     Lead ads: MER is shown with AND without the lead ads' spend (Cole did that sum with Siri on the call). */
  const cents = n => n == null ? '–' : '$' + (+n).toFixed(2);
  function tilesHtml(r) {
    const t = r.totals || {}, p = r.prior || {}, f = r.plan || {}, L = r.leads;
    const tile = (l, v, d, sub, tone) => `<div class="cs-tile"><span class="l">${l}</span><span class="v">${v}${d}</span><span class="sub${tone ? ` ${tone}` : ''}">${sub}</span></div>`;
    const was = (v, f2) => v != null ? `${f2(v)} the week before` : 'no week before to compare';
    const sales = t.sales, spend = t.spend;
    const merNoLeads = L && sales != null && spend > L.spend ? sales / (spend - L.spend) : null;
    const noLeads = merNoLeads ? `. Without lead ads: ${x2(merNoLeads)}` : '';
    const merSub = f.mer ? `${t.mer >= f.mer ? 'on' : 'under'} the ${x2(f.mer)} goal${noLeads}` : `${was(p.mer, x2)}${noLeads}`;
    return `<div class="cs-tiles">
      ${tile('Sales, whole store', money(sales), delta(sales, p.sales), was(p.sales, money))}
      ${tile('Ad spend, every channel', money(spend), delta(spend, p.spend, 'n'), was(p.spend, money))}
      ${tile('MER (sales ÷ ad spend)', x2(t.mer), delta(t.mer, p.mer), merSub, f.mer && t.mer != null ? (t.mer >= f.mer ? 'up' : 'down') : '')}
      ${tile('Orders', t.orders != null ? Math.round(t.orders).toLocaleString('en-US') : '–', delta(t.orders, p.orders), was(p.orders, v => Math.round(v).toLocaleString('en-US')))}
      ${t.ncpa != null ? tile('Cost per new customer', money(t.ncpa), delta(t.ncpa, p.ncpa, true), was(p.ncpa, money)) : ''}
      ${L ? tile('Lead ads', money(L.spend), '', `inside ad spend · ${L.leads.toLocaleString('en-US')} leads at ${cents(L.leads ? L.spend / L.leads : null)}`) : ''}
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
    if (layout2()) { const pos = id => { const i = ORDER2.indexOf(id); return i < 0 ? 99 : i; }; return [...D.brands].sort((a, b) => pos(a.act_id) - pos(b.act_id) || a.name.localeCompare(b.name)); }
    const rank = { bad: 0, warn: 1, undefined: 2, good: 3 };
    return [...D.brands].sort((a, b) => (rank[SEV[a.act_id]] ?? 2) - (rank[SEV[b.act_id]] ?? 2) || a.name.localeCompare(b.name));
  }
  function mondaySteps() { if (layout2()) return [{ id: 'open', name: 'Scoreboard', mins: 5 }, ...mondayList().map(b => ({ id: b.act_id, name: b.name, sev: SEV[b.act_id], mins: 10 })), { id: 'agency', name: 'Agency', mins: 3 }, { id: 'close', name: 'Finish', mins: 2 }]; return [{ id: 'open', name: 'Start', mins: 5 }, ...mondayList().map(b => ({ id: b.act_id, name: b.name, sev: SEV[b.act_id], mins: SEV[b.act_id] === 'good' ? 2 : SEV[b.act_id] === 'bad' || SEV[b.act_id] === 'warn' ? 7 : 4 })), { id: 'close', name: 'Finish', mins: 5 }]; }
  function strategistOf(b) { const p = (b.posts || []).find(x => ROLE[teamName(x.by)] === 'Strategist'); return p ? teamName(p.by) : ''; }
  /* 2026-11-03: the order Cole says it out loud on the call ("results from last week, what we're doing this week, what's
     upcoming"), numbered, and then one band of boxes you type in. Every caption = what the box is + where it comes from. */
  const part = (n, t) => `<div class="cs-part"><span>${n}</span>${t}</div>`;
  function mondayBrand(b) {
    const s = brandState(b.act_id), r = b.read, strat = strategistOf(b), t = today();
    const making = b.making || [], posts = b.posts || [], who = strat || 'the strategist';
    const firstPost = posts[0];
    const boardLine = c => `${esc({ brief: 'Brief written, not started', making: 'Being made', review: 'Waiting for review', ready: 'Ready to launch' }[c.board] || c.board)}${c.owner ? ' · ' + esc(c.owner) : ' · nobody on it'}${c.due ? ` · <span class="${c.due < t ? 'late' : ''}">${c.due < t ? 'was due ' : 'due '}${short(c.due)}</span>` : ''}`;
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
  /* ======================= MONDAY, LAYOUT 2 (2026-11-09, the Nov 9 call + Cole's pick of the six layouts) =======================
     A 5-minute scoreboard of every brand (Start), then each brand in the SAME order every week (Noma's brands, then Ahsan's),
     about 10 minutes each, channel by channel: Last week (numbers, the store funnel, what we changed, last week's tasks),
     Meta, Google, Email (each: results against goal, its campaigns with budgets you can change, its funnel, its plan), Trybe,
     Being made, Typed. Agency tasks once at the end. Every ad is the Ads page's own card and sheet (V2.adSet); budgets,
     pause and resume go through the same Meta / Google write routes as the Meta tab and Today's moves (dry run, then the
     write with `expect`, Change Log, Undo on Meta). A preview: ?layout=2 or "New layout (preview)" turns it on. */
  const LAYOUT_KEY = 'cs_layout';
  /* 2026-11-10: the new layout is the default (Cole: "build everything and launch it"); "Old layout" stays one click away. */
  const layout2 = () => { try { return localStorage.getItem(LAYOUT_KEY) !== '1'; } catch { return true; } };
  /* Who runs each brand's Meta (Cole, Nov 9 call). Locus's season call sheet still says Ahsan for Dartee and Yak. */
  const STRAT = { brand_dartee_golf: 'Noma', brand_bonk_golf: 'Noma', brand_ice_and_gold: 'Noma', brand_yak_sports: 'Noma', brand_party_patch: 'Noma', brand_grunk_dolfer: 'Ahsan', brand_lucky_golf: 'Ahsan', brand_vetripaws: 'Ahsan', brand_speedin: 'Ahsan' };
  const ORDER2 = ['brand_dartee_golf', 'brand_bonk_golf', 'brand_ice_and_gold', 'brand_yak_sports', 'brand_party_patch', 'brand_grunk_dolfer', 'brand_lucky_golf', 'brand_vetripaws', 'brand_speedin'];
  const MODELS = [['lastPlatformClick', 'TW last click'], ['fullFirstClick', 'TW first click'], ['linear', 'TW linear'], ['platform', 'Platform reported']];
  const BX = {};
  const bx = act => (BX[act] = BX[act] || { model: 'lastPlatformClick', sort: 'spend', adsort: 'spend', open: {}, sopen: {}, gopen: {}, gsort: 'spend', more: false, cols: null, esort: 'revenue', rvAll: false });
  /* Campaign table columns (Cole 2026-11-10: "ability to add to the columns"). Default set, the rest behind Columns. */
  const MCOLS = [['spend', 'Spend', 1], ['purchases', 'Sales', 1], ['roas', 'ROAS', 1], ['cpa', 'Cost per sale', 1, 1], ['aov', 'Order value', 0], ['ctr', 'CTR', 1], ['cpm', 'CPM', 1, 1], ['cpc', 'Cost per click', 0, 1], ['clk', 'Link clicks', 0], ['imp', 'Impressions', 0], ['freq', 'Frequency', 0, 1], ['hook', 'Hook rate', 0], ['hold', 'Hold rate', 0]];
  const LCOLS = [['leads', 'Leads', 1], ['cpl', 'Cost per lead', 1, 1]];
  const ADSORT = [['spend', 'Spend'], ['purchases', 'Sales'], ['roas', 'ROAS'], ['cpa', 'Cost per sale'], ['ctr', 'CTR'], ['cpm', 'CPM'], ['hook', 'Hook rate'], ['hold', 'Hold rate']];
  /* A Locus dropdown: a quiet button with its label and the current choice; the menu is Locus's own pop-up (listMenu). */
  const ddHtml = (k, act, label, val) => `<button type="button" class="cs-dd" data-dd="${k}" data-act="${esc(act)}" aria-haspopup="menu"><span class="k">${esc(label)}</span><span class="v">${esc(val || '')}</span><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg></button>`;
  const colsOf = (X, lead) => { const on = X.cols || MCOLS.filter(c => c[2]).map(c => c[0]); return [...MCOLS.filter(c => on.includes(c[0])), ...(lead ? LCOLS : [])]; };
  const cellOf = (k, o) => { const v = o[k]; if (k === 'spend' || k === 'aov') return money(v); if (k === 'cpa' || k === 'cpm') return v != null ? money(v) : '–'; if (k === 'cpc' || k === 'cpl') return v != null ? cents(v) : '–'; if (k === 'roas') return x2(v); if (k === 'ctr' || k === 'hook' || k === 'hold') return fx(v, k === 'ctr' ? 2 : 1); if (k === 'freq') return v != null ? (+v).toFixed(2) : '–'; return v != null ? Math.round(v).toLocaleString('en-US') : '–'; };
  /* Rough ranges for an online store, as % of sessions. A reference only: the line a brand is judged on is its own last 4 weeks. */
  const TYPICAL = { addToCarts: [5, 8], checkouts: [2.5, 4], ecommercePurchases: [1.4, 3] };
  const fx = (n, d = 1) => n == null || !isFinite(n) ? '–' : (n * 100).toFixed(d) + '%';
  const isLeadRow = (M, a) => M && M.isLead ? M.isLead(a) : a.obj === 'leads';
  const pill = (t, tone) => `<span class="cs-d ${tone || 'flat'}">${t}</span>`;
  const vsGoal = (v, g, lower) => g == null || v == null ? '' : pill(`goal ${lower ? money(g) : x2(g)}`, (lower ? v <= g : v >= g) ? 'up' : 'down');
  async function loadBrand2(b, only) {
    const X = bx(b.act_id), r = b.read; if (!r) { X.loaded = true; return; }
    const from = r.period_start, to = r.period_end, act = encodeURIComponent(b.act_id), t = today();
    const job = (k, p) => { if (only && !only.includes(k)) return Promise.resolve(); X.busy = (X.busy || 0) + 1; return p.then(v => { X[k] = v; }, e => { X[k] = { error: e.message }; }).finally(() => { X.busy--; }); };
    const label = `${short(from)} to ${short(to)}`;
    await Promise.all([
      job('ads', V2.adSet(b.act_id, from, to, H, b.client ? { client: true, label, model: X.model } : { label, model: X.model, callActs: adActs(b) })),
      job('live', H.apiAH(`/api/meta/live?act=${act}`)),
      job('acts', H.apiAH(`/api/activities?act=${act}&from=${from}&to=${addDays(to, 1)}T05:59:59&limit=200`)),
      job('ga', H.apiAH(`/api/google/website?act=${act}&from=${from}&to=${to}&pfrom=${addDays(from, -7)}&pto=${addDays(from, -1)}`)),
      job('cust', H.api(`/api/customers?act=${act}&days=90`)),
      job('paid', H.api(`/api/hub/paid?platform=meta&act=${act}&from=${from}&to=${to}&model=${encodeURIComponent(X.model)}`)),
      job('gads', H.apiAH(`/api/google/ads?act=${act}&from=${from}&to=${to}`)),
      job('klv', Promise.all([H.apiAH(`/api/klaviyo?act=${act}&what=campaigns`).catch(e => ({ error: e.message })), H.apiAH(`/api/klaviyo?act=${act}&what=flows_report`).catch(e => ({ error: e.message }))]).then(([c, f]) => ({ c, f }))),
      job('cal', H.apiAH(`/api/calendar?act=${act}&from=${t}&to=${addDays(t, 21)}&lite=1`)),
      b.creators ? job('rv', H.apiAH(`/api/trybe/review?act=${act}`)) : Promise.resolve(),
    ]);
    X.loaded = true;
    const s = steps()[POS]; if ((KIND === 'monday' && s && s.id === b.act_id) || (KIND === 'client' && b.client)) { const y = window.scrollY; paintMain(); window.scrollTo(0, y); }
  }
  /* The sheet's call buttons (the Ads page sheet opened from the call): turn the ad off now, or hand a call to the buyer. */
  function adActs(b) {
    return {
      html: () => `<button type="button" class="ds-btn" data-cxoff="1">Turn off</button><button type="button" class="ds-btn" data-cxcall="1">Move for the buyer</button>`,
      wire: (a, root) => {
        const off = root && root.querySelector('[data-cxoff]'), cl = root && root.querySelector('[data-cxcall]');
        if (off) off.onclick = () => metaChange(b, { kind: 'pause', level: 'ad', object: a.id, name: a.name });
        if (cl) cl.onclick = () => listMenu(cl, 'A move for the media buyer', ['Cut', 'Trim', 'Scale', 'Refresh'].map(k => ({ v: k, label: k })), v => { const st = brandState(b.act_id); (st.calls = st.calls || []).push({ text: `${v} ${a.name}`, ad: a.id }); st.edited = true; save(); toast(`"${v} ${a.name}" goes to the buyer in the recap.`); paintMain(); });
      },
    };
  }
  /* One change in Meta or Google from the call: the dry run's before and after in Locus's own confirm, then the write. */
  async function metaChange(b, o) {
    const google = o.platform === 'google', path = google ? '/api/google/write' : '/api/meta/write';
    const body = { act: b.act_id, kind: o.kind, level: o.level, object: o.object, reason: `Changed on the Monday call ${today()}.`, ...(o.amount != null ? { amount: o.amount } : {}) };
    let dry; try { dry = await post(path, { ...body, dry: true }); } catch (e) { dry = { error: e.message }; }
    if (!dry || dry.error) return toast((dry && dry.error) || 'Did not answer.');
    const sure = window.confirmModal ? await window.confirmModal(o.kind === 'budget' ? 'Change the budget?' : o.kind === 'pause' ? 'Turn it off?' : 'Turn it on?', `${dry.summary || ''}${dry.detail ? ` ${dry.detail}` : ''}`.trim() || o.name || '', o.kind === 'budget' ? 'Change it' : o.kind === 'pause' ? 'Turn off' : 'Turn on') : true;
    if (!sure) return;
    const bf = dry.before || {};
    const expect = o.kind === 'budget' ? (bf.daily_budget != null ? { daily_budget: bf.daily_budget } : bf.lifetime_budget != null ? { lifetime_budget: bf.lifetime_budget } : bf.amount != null ? { amount: bf.amount } : undefined) : bf.status != null ? { status: bf.status } : undefined;
    let w; try { w = await post(path, { ...body, expect }); } catch (e) { w = { error: e.message }; }
    if (!w || w.error) return toast((w && w.error) || 'Did not answer.');
    const st = brandState(b.act_id); (st.changes = st.changes || []).push(String(w.summary || dry.summary || `${o.kind} ${o.name || ''}`).slice(0, 200)); st.edited = true; save();
    toast(`Done: ${String(w.summary || dry.summary || '').replace(/^[^:]+:\s*/, '') || 'changed'}.${google ? '' : ' Undo is on the Change Log for 24 hours.'}`);
    loadBrand2(b, ['live', 'gads']);
  }
  const loading = (X, k, what) => X[k] == null ? empty(`Loading ${what}…`) : X[k].error ? `<p class="cs-empty">${esc(X[k].error === 'not_linked' ? `Not connected for this brand.` : X[k].error)}</p>` : null;
  /* ---------- the funnel: GA4 sessions to purchases, the week before beside it ---------- */
  /* Round 2 (Cole 2026-11-10: "% of sessions? what is the KPI per step? compare to last week? no bars"): one table.
     Each step: a bar sized against sessions, the count against the week before, % of sessions, % of the step before,
     and the line it is judged on = this brand's own last 4 weeks (green above, red under). The typical-store range is a
     reference only. Ad views and clicks (the platform's) sit on one line above, because they are 10 to 100 times
     sessions and would flatten every bar. */
  const FSTEPS = [['sessions', 'Sessions'], ['addToCarts', 'Add to cart'], ['checkouts', 'Checkout'], ['ecommercePurchases', 'Purchases']];
  function funnelHtml(cur, prev, top, hue, avg, tw) {
    if (!cur || !cur.sessions) return empty('No GA4 numbers for this.');
    if (!cur.addToCarts && !cur.checkouts && !cur.ecommercePurchases) return `<p class="cs-empty">${Math.round(cur.sessions).toLocaleString('en-US')} sessions, but GA4 recorded no add to cart, checkout or purchase. The store's GA4 shopping events are not set up, so there is no funnel to read yet.</p>`;
    /* GA4 that stops counting part way (Dartee: add to cart counted, checkout and purchase never) shows the steps it has
       and says which are missing, instead of a 0% drop that reads as a broken checkout. */
    const NAMES = { sessions: 'Sessions', addToCarts: 'Added to cart', checkouts: 'Reached checkout', ecommercePurchases: 'Purchased' };
    let steps = FSTEPS.map(([k]) => ({ k, l: NAMES[k], v: cur[k], p: prev ? prev[k] : null }));
    const cut = steps.findIndex((s, i) => i && !s.v && steps.slice(i).every(x => !x.v));
    if (cut > 0) {
      /* GA4 stopped counting part way (Dartee: checkout and purchase never recorded). The step stays in as "not tracked";
         purchases come from Triple Whale's order count, the store's real number. */
      steps = steps.map((s, i) => i < cut ? s : s.k === 'ecommercePurchases' && tw && tw.v != null ? { ...s, v: tw.v, p: tw.p, src: 'Triple Whale orders' } : { ...s, v: null, p: null, missing: true, why: 'GA4 does not record it on this store' });
    }
    return flowHtml([...(top || []).filter(t => t[1] != null).map(t => ({ l: t[0], v: t[1], p: t[2] })), ...steps]);
  }
  /* Round 3 (Cole 2026-11-10: "so hard to see the difference between add to cart, checkout and purchase", "the column
     names are too long"). Two parts. The FLOW: one card per step with the count and its change on the week before,
     joined by the share that moved on. The DROP-OFF: one long bar per hop where the whole bar is everyone who reached
     the step before, so a 37% checkout rate fills 37% of the bar and every hop is readable. A tick marks the brand's
     own usual (the 4 weeks before, as a weekly average when given as totals); green or red = above or under it.
     Hover a hop for the numbers, last week and the general online-store range. */
  const nfmt = v => v == null ? '–' : Math.round(v).toLocaleString('en-US');
  /* Round 6 (Cole: "why cards AND bars? what is the hover?"): ONE row. Each step is a card (the count and its change on
     the week before); between two cards, the share that moved on, and under it how that compares with the brand's
     usual (or last week). No bars, no hovers, nothing to explain. */
  /* Round 8 (Cole: "show sessions, add to cart, checkout, purchase. What's the actual conversion rate?"): the standard
     ecommerce funnel table. Headline = conversion rate (last step / first step), then one row per step: people, % of the
     first step, % of the step before, and last week's % of the first step beside it. A step the tracking does not
     record stays in as "not tracked", so the funnel never silently skips a step. */
  /* Round 9 (Cole picked option A from the audit page; "we absolutely need add to cart to checkout"): a picture, no math.
     Headline = conversion rate with "was X%". Then one row per hop (sessions to cart, cart to checkout, checkout to
     purchase): a dark bar for this week and a light bar for last week on the same scale, the rate in words beside them,
     green when better, red when worse. A step the tracking does not record shows as its own row saying so, and the hop
     around it still shows (cart straight to purchase). The counts sit in one line above the bars. */
  function flowHtml(steps) {
    const S = steps.filter(s => s.v != null || s.missing), real = S.filter(s => s.v != null);
    if (real.length < 2) return empty('Not enough steps to show.');
    const first = real[0], last = real[real.length - 1];
    const rate = (a, b) => (a == null || !b ? null : a / b), p2 = x => x == null ? '–' : fx(x, x < 0.1 ? 2 : 1);
    const cr = rate(last.v, first.v), crp = rate(last.p, first.p);
    const was = (a, b) => b == null ? '' : `<span class="cs-was ${a >= b ? 'up' : 'down'}">${a >= b ? '▲' : '▼'} was ${p2(b)}</span>`;
    const counts = S.map(s => `<span class="cs-cnt${s.missing ? ' miss' : ''}"><b>${s.missing ? '–' : nfmt(s.v)}</b> ${esc(s.l.toLowerCase())}${s.src ? ` <small>(${esc(s.src)})</small>` : ''}</span>`).join('<span class="ar">→</span>');
    const hops = [];
    for (let i = 1; i < S.length; i++) {
      if (S[i].missing) { hops.push(`<div class="cs-hp miss"><span class="t">${esc(S[i - 1].missing ? '' : S[i - 1].l)} → ${esc(S[i].l)}</span><span class="m">Not tracked${S[i].why ? `: ${esc(S[i].why)}` : ''}</span></div>`); continue; }
      let j = i - 1; while (j >= 0 && S[j].missing) j--;
      if (j < 0) continue;
      const a = S[j], s = S[i], r = rate(s.v, a.v), rp = rate(s.p, a.p), sc = Math.max(r || 0, rp || 0) / 0.85 || 1;
      hops.push(`<div class="cs-hp"><span class="t">${esc(a.l)} → ${esc(s.l)}</span>
        <div class="bars"><i class="now" style="width:${Math.max(1, (r || 0) / sc * 100)}%"></i>${rp != null ? `<i class="was" style="width:${Math.max(1, rp / sc * 100)}%"></i>` : ''}</div>
        <span class="v"><b class="${rp == null ? '' : r >= rp ? 'up' : 'down'}">${p2(r)}</b>${was(r, rp)}</span></div>`);
    }
    return `<div class="cs-cr"><span class="k">Conversion rate</span><b>${p2(cr)}</b>${was(cr, crp)}<span class="muted">${esc(first.l.toLowerCase())} to ${esc(last.l.toLowerCase())}</span></div>
      <div class="cs-cnts">${counts}</div>
      <div class="cs-hps">${hops.join('')}<p class="cs-key"><i class="now"></i>this week <i class="was"></i>last week</p></div>`;
  }



  /* GA4 rows for one channel group (Paid Social, Paid Search, Email...), this week + week before, or from the 4-week pull. */
  const gaSum = (src, re) => { const ch = src && !src.error ? (src.channels || []).filter(c => re.test(String(c.group || c.k || ''))) : []; if (!ch.length) return null; const sum = (k, p) => ch.reduce((n, c) => n + (+((p ? c.prev || {} : c)[k]) || 0), 0); const o = p => ({ sessions: sum('sessions', p), addToCarts: sum('addToCarts', p), checkouts: sum('checkouts', p), ecommercePurchases: sum('ecommercePurchases', p) }); return { cur: o(false), prev: ch.some(c => c.prev) ? o(true) : null }; };
  const gaRow = (X, re) => { const r = gaSum(X.ga, re); if (!r) return null; const a = gaSum(X.ga4w, re); return { ...r, avg: a ? a.cur : null }; };
  const gaAvg = X => X.ga4w && !X.ga4w.error && X.ga4w.cur ? X.ga4w.cur : null;
  /* ---------- the plan: one line per batch, Yes / Changes / No; no owners or dates (the strategist makes the briefs) ---------- */
  function planHtml(b, key, who, hue) {
    const s = brandState(b.act_id), lines = s[key] = s[key] || [];
    const rows = lines.map((x, i) => x.on === false ? '' : `<div class="row cs-plan" data-i="${i}">
        <div style="min-width:0"><div class="t${x.text ? '' : ' empty'}" data-f="text" data-ph="Type a line of the plan">${esc(x.text)}</div>${x.vote === 'c' ? `<input type="text" data-pnote="${i}" data-key="${key}" data-act="${esc(b.act_id)}" value="${esc(x.note || '')}" placeholder="What to change">` : ''}</div>
        <span class="cs-vote">${[['y', 'Yes'], ['c', 'Changes'], ['n', 'No']].map(([k, l]) => `<button type="button" class="${x.vote === k ? k : ''}" data-vote="${k}" aria-pressed="${x.vote === k}">${l}</button>`).join('')}</span>
        <button type="button" class="x" data-f="del" aria-label="Remove" title="Remove">×</button></div>`).join('');
    return `<p class="cs-howto"><span><b>Yes:</b> approved, ${esc(who)} makes it</span><span><b>Changes:</b> type what to change, ${esc(who)} gets your note with it</span><span><b>No:</b> dropped</span><span>Finish posts all of it in the brand's internal Slack recap and puts the Yes and Changes lines on the client meeting's This week.</span></p>
      <div class="rows" data-list="${key}" data-act="${esc(b.act_id)}">${rows}</div>
      ${lines.length ? '' : key === 'eplan' ? `<p class="cs-empty">Nothing typed yet. Add this week's email and SMS sends as lines.</p>` : `<p class="warnline">${esc(who)} has not posted a plan for ${esc(b.name)} yet. Talk it through and type the lines.</p>`}
      <button type="button" class="add" data-add="${key}" data-act="${esc(b.act_id)}">+ Add a line</button>`;
  }
  /* Radhesh's Google plan: his own Slack lines (no model), seeded once. */
  function seedGoogle(b) {
    const s = brandState(b.act_id); if (s.gplan) return;
    const p = (b.posts || []).filter(x => teamName(x.by) === 'Radhesh');
    s.gplan = p.flatMap(x => String(x.text || '').split(/\n+/)).map(l => l.replace(/^[\s*•\-–\d.)]+/, '').replace(/\*/g, '').trim()).filter(l => l.length > 12).slice(0, 8).map(text => ({ text, from: 'slack' }));
  }
  /* ---------- tables ---------- */
  function sortRows(list, k, lowFirst) { return [...list].sort((a, z) => { const x = a[k], y = z[k]; if (x == null) return 1; if (y == null) return -1; return lowFirst ? x - y : y - x; }); }
  const thSort = (b, cur, k, l, attr) => `<th><button type="button" class="srt${cur === k ? ' on' : ''}" data-${attr}="${k}" data-act="${esc(b.act_id)}">${l}${cur === k ? ' ▾' : ''}</button></th>`;
  const budgetCell = (b, level, id, o, platform) => { const v = o && (o.daily != null ? o.daily : o.budget != null ? o.budget : null); if (v == null) return o && o.lifetime ? `<td>${money(o.lifetime)} total</td>` : '<td class="muted">–</td>'; return `<td><button type="button" class="cs-bud" data-bud="${esc(id)}" data-level="${level}" data-plat="${platform || 'meta'}" data-act="${esc(b.act_id)}" data-v="${v}" data-name="${esc(o.name || '')}" title="Change the daily budget">${money(v)}/day ✎</button></td>`; };
  const statusCell = (b, level, id, o, platform) => { if (!o) return '<td></td>'; const on = /ACTIVE|ENABLED/.test(String(o.status || '')); return `<td><button type="button" class="cs-sw${on ? ' on' : ''}" data-sw="${esc(id)}" data-level="${level}" data-plat="${platform || 'meta'}" data-act="${esc(b.act_id)}" data-on="${on ? 1 : 0}" data-name="${esc(o.name || '')}" title="${on ? 'On: tap to turn off' : 'Off: tap to turn on'}"><i></i>${on ? 'On' : 'Off'}</button></td>`; };
  function metaTable(b) {
    const X = bx(b.act_id), M = X.ads, L = X.live && !X.live.error ? X.live : null;
    const w = loading(X, 'ads', 'the campaigns'); if (w) return w;
    const sets = new Map(), camps = new Map();
    for (const a of M.ads || []) {
      const sid = a.adset && a.adset.id ? String(a.adset.id) : 'none', ls = L && L.adsets[sid], cid = ls ? String(ls.campaign) : `name:${a.campaign || ''}`;
      const S = sets.get(sid) || { id: sid, cid, name: (ls && ls.name) || (a.adset && a.adset.name) || 'No ad set', spend: 0, revenue: 0, purchases: 0, leads: 0, imp: 0, clk: 0, lead: isLeadRow(M, a), ads: [] };
      S.spend += a.spend || 0; S.revenue += a.revenue || 0; S.purchases += a.purchases || 0; S.leads += a.leads || 0; S.imp += a.impressions || 0; S.clk += a.clicks || 0; S.ads.push(a); sets.set(sid, S);
    }
    for (const S of sets.values()) { const C = camps.get(S.cid) || { id: S.cid, name: (L && L.campaigns[S.cid] && L.campaigns[S.cid].name) || S.ads[0].campaign || 'No campaign', spend: 0, revenue: 0, purchases: 0, leads: 0, imp: 0, clk: 0, lead: S.lead, sets: [] }; for (const k of ['spend', 'revenue', 'purchases', 'leads', 'imp', 'clk']) C[k] += S[k]; C.sets.push(S); camps.set(S.cid, C); }
    /* Sums of the ads under the chosen attribution. Weighted rates: hook/hold by impressions, frequency by spend. */
    const fin = o => { const ads = o.ads || (o.sets || []).flatMap(s => s.ads); const imp = o.imp, sp = o.spend; return { ...o, roas: sp ? o.revenue / sp : null, cpa: o.purchases ? sp / o.purchases : null, cpl: o.leads ? sp / o.leads : null, ctr: imp ? o.clk / imp : null, cpm: imp ? sp / imp * 1000 : null, cpc: o.clk ? sp / o.clk : null, aov: o.purchases ? o.revenue / o.purchases : null, hook: imp ? ads.reduce((n, a) => n + (a.hook != null ? a.hook * (a.impressions || 0) : 0), 0) / imp : null, hold: imp ? ads.reduce((n, a) => n + (a.hold != null ? a.hold * (a.impressions || 0) : 0), 0) / imp : null, freq: sp ? ads.reduce((n, a) => n + (a.frequency != null ? a.frequency * (a.spend || 0) : 0), 0) / sp || null : null }; };
    const all = [...camps.values()].map(fin), anyLead = all.some(c => c.lead), cols = colsOf(X, anyLead);
    const sk = cols.find(c => c[0] === X.sort) ? X.sort : 'spend', low = (cols.find(c => c[0] === sk) || [])[3];
    const list = sortRows(all, sk, low);
    /* Round 9: ROAS, cost per sale and cost per lead cells green or red against the brand's goals, so the bad campaign
       shows in one look. No goal = no color. */
    const G = M.g || {}, tone = (k, o) => { const v = o[k]; if (v == null) return ''; if (k === 'roas' && G.roas && !o.lead) return v >= +G.roas ? 'cs-g' : 'cs-r'; if (k === 'cpa' && G.cpa && !o.lead) return v <= +G.cpa ? 'cs-g' : 'cs-r'; if (k === 'cpl' && M.leadGoal && o.lead) return v <= M.leadGoal ? 'cs-g' : 'cs-r'; return ''; };
    const cells = o => cols.map(([k]) => `<td class="${tone(k, o)}">${(o.lead && ['purchases', 'roas', 'cpa', 'aov'].includes(k)) || (!o.lead && ['leads', 'cpl'].includes(k)) ? '<span class="muted">–</span>' : cellOf(k, o)}</td>`).join('');
    const nameCell = (o, kind) => kind === 'c' ? `<td><b>${X.open[o.id] ? '▾' : '▸'} ${esc(o.name)}</b>${o.lead ? ' <small class="muted">lead ads</small>' : ''}</td>` : `<td>${X.sopen[o.id] ? '▾' : '▸'} ${esc(o.name)} <small class="muted">${plural(o.ads.length, 'ad')}</small></td>`;
    const N = 3 + cols.length;
    const setRows = c => sortRows(c.sets.map(fin), sk, low).map(s => `<tr class="set" data-mset="${esc(s.id)}" data-act="${esc(b.act_id)}">${nameCell(s, 's')}${statusCell(b, 'adset', s.id, L && L.adsets[s.id] ? L.adsets[s.id] : null)}${budgetCell(b, 'adset', s.id, L && L.adsets[s.id] ? L.adsets[s.id] : null)}${cells(s)}</tr>${X.sopen[s.id] ? `<tr class="adcards"><td colspan="${N}" style="padding:10px 0 14px 22px">${M.cards(sortRows(s.ads, sk, low))}</td></tr>` : ''}`).join('');
    return `<div class="cs-tw"><table class="cs-tbl cs-camp"><thead><tr><th>Campaign</th><th>Status</th><th>Budget</th>${cols.map(([k, l]) => thSort(b, sk, k, l, 'msort')).join('')}</tr></thead><tbody>
      ${list.map(c => `<tr class="cmp" data-mcamp="${esc(c.id)}" data-act="${esc(b.act_id)}">${nameCell(c, 'c')}${statusCell(b, 'campaign', c.id, L && L.campaigns[c.id] ? { ...L.campaigns[c.id] } : null)}${budgetCell(b, 'campaign', c.id, L && L.campaigns[c.id] ? { ...L.campaigns[c.id] } : null)}${cells(c)}</tr>${X.open[c.id] ? setRows(c) : ''}`).join('')}
      </tbody></table></div>${L ? (L.can ? '' : `<p class="warnline">${esc((L.accounts || []).map(a => a.fix).filter(Boolean)[0] || 'Locus cannot change this Meta account.')}</p>`) : '<p class="cs-sub">Status and budgets are loading from Meta.</p>'}
      <p class="cs-sub">Tap a budget to change it, or On / Off to switch it. Every change shows Meta's before and after first, lands in the Change Log, and can be undone for 24 hours. Tap a column name to sort.</p>`;
  }
  function googleTable(b) {
    const X = bx(b.act_id), w = loading(X, 'gads', 'Google Ads'); if (w) return w;
    const rows = sortRows((X.gads.campaigns || []).filter(c => c.spend > 0 || /ENABLED/.test(c.status || '')).map(c => ({ ...c, ctr: c.impressions ? c.clicks / c.impressions : null, cpc: c.clicks ? c.spend / c.clicks : null })), X.gsort, X.gsort === 'cpc');
    if (!rows.length) return empty('No Google spend this week.');
    const TYPE = { SEARCH: 'Search', SHOPPING: 'Shopping', PERFORMANCE_MAX: 'Performance Max', DEMAND_GEN: 'Demand Gen', VIDEO: 'YouTube', DISPLAY: 'Display' };
    const det = c => {
      const G = X.gdet; if (!G) return empty('Loading its ad groups, ads and search terms…'); if (G.error) return `<p class="cs-empty">${esc(G.error)}</p>`;
      const nm = c.name, A = G.ads && !G.ads.error ? G.ads : {}, T = G.terms && !G.terms.error ? G.terms.terms || [] : [];
      const groups = (A.asset_groups || []).filter(g => g.campaign === nm), ads = (A.ads || []).filter(a => a.campaign === nm), terms = T.filter(t => t.campaign === nm).slice(0, 8);
      const met = o => `<td>${money(o.spend)}</td><td>${o.clicks != null ? Math.round(o.clicks).toLocaleString('en-US') : '–'}</td><td>${o.impressions ? fx(o.clicks / o.impressions, 2) : '–'}</td><td>${o.clicks ? cents(o.spend / o.clicks) : '–'}</td>`;
      const tbl = (h, rows) => rows ? `<table class="cs-tbl"><thead><tr><th>${h}</th><th>Spend</th><th>Clicks</th><th>CTR</th><th>Cost per click</th></tr></thead><tbody>${rows}</tbody></table>` : '';
      const html = [groups.length ? tbl('Asset group', groups.map(g => `<tr><td>${esc(g.name)} ${g.strength ? `<small class="muted">${esc(g.strength)}</small>` : ''}</td>${met(g)}</tr>`).join('')) : '',
        ads.length ? tbl('Ad', ads.slice(0, 8).map(a => `<tr><td>${esc((a.headlines || [])[0] || a.name || a.type || 'Ad')} <small class="muted">${esc(a.ad_group || '')}${a.strength ? ` · ${esc(a.strength)}` : ''}</small></td>${met(a)}</tr>`).join('')) : '',
        terms.length ? tbl('Search term', terms.map(t => `<tr><td>${esc(t.term)}</td>${met(t)}</tr>`).join('')) : ''].filter(Boolean).join('');
      return html || empty('Google sent nothing below this campaign for the week.');
    };
    return `<p class="cs-sub" style="margin:0">Tap a campaign for its asset groups, ads and search terms.</p><div class="cs-tw"><table class="cs-tbl cs-camp"><thead><tr><th>Google campaign</th><th>Status</th><th>Budget</th>${thSort(b, X.gsort, 'spend', 'Spend', 'gsort')}${thSort(b, X.gsort, 'clicks', 'Clicks', 'gsort')}${thSort(b, X.gsort, 'ctr', 'CTR', 'gsort')}${thSort(b, X.gsort, 'cpc', 'Cost per click', 'gsort')}${thSort(b, X.gsort, 'impressions', 'Impressions', 'gsort')}</tr></thead><tbody>
      ${rows.map(c => `<tr class="cmp" data-gcamp="${esc(c.id)}" data-act="${esc(b.act_id)}"><td><b>${X.gopen[c.id] ? '▾' : '▸'} ${esc(c.name)}</b> <small class="muted">${esc(TYPE[c.type] || c.type || '')}</small></td>${statusCell(b, 'campaign', c.id, { status: c.status, name: c.name }, 'google')}${c.budget_shared ? '<td class="muted">shared</td>' : budgetCell(b, 'campaign', c.id, { budget: c.budget, name: c.name }, 'google')}<td>${money(c.spend)}</td><td>${Math.round(c.clicks).toLocaleString('en-US')}</td><td>${fx(c.ctr, 2)}</td><td>${c.cpc != null ? cents(c.cpc) : '–'}</td><td>${Math.round(c.impressions || 0).toLocaleString('en-US')}</td></tr>${X.gopen[c.id] ? `<tr class="adcards"><td colspan="8" style="padding:8px 0 14px 22px">${det(c)}</td></tr>` : ''}`).join('')}
      </tbody></table></div><p class="cs-sub">Google Ads' own spend and clicks. Sales per Google campaign are not in Locus yet: the sales line above is Triple Whale for the whole channel.</p>`;
  }
  async function loadGoogleDetail(b) {
    const X = bx(b.act_id), r = b.read; if (X.gdet || !r) return;
    const q = `act=${encodeURIComponent(b.act_id)}&from=${r.period_start}&to=${r.period_end}`;
    const [ads, terms] = await Promise.all([H.apiAH(`/api/google/ads-ads?${q}`).catch(e => ({ error: e.message })), H.apiAH(`/api/google/ads-terms?${q}`).catch(e => ({ error: e.message }))]);
    X.gdet = { ads, terms };
  }
  function emailBlock(b) {
    const X = bx(b.act_id), r = b.read, ch = (r && r.channels || []).find(c => c.id === 'email');
    const K = X.klv; if (!K) return empty('Loading Klaviyo…');
    const camps = K.c && !K.c.error ? (K.c.campaigns || []).filter(c => { const d0 = String(c.send_at || c.sent_at || '').slice(0, 10); return !r || (d0 >= r.period_start && d0 <= r.period_end); }) : [];
    const flows = K.f && !K.f.error ? (K.f.flows || K.f.rows || []).filter(f => (f.revenue || 0) > 0).sort((p, q) => (q.revenue || 0) - (p.revenue || 0)).slice(0, 6) : [];
    const rev = x => x.revenue != null ? x.revenue : x.conversion_value;
    const sms = camps.filter(c => /sms/i.test(c.channel || '')), em = camps.filter(c => !/sms/i.test(c.channel || ''));
    const err = (K.c && K.c.error) || (K.f && K.f.error);
    const ga = gaRow(X, /email|sms/i), t = r && r.totals || {};
    const tile = (l, v, sub) => `<div class="cs-tile"><span class="l">${l}</span><span class="v">${v}</span><span class="sub">${sub || ''}</span></div>`;
    const flowRev = flows.reduce((n, f) => n + (f.revenue || 0), 0);
    /* Same pattern as Meta and Google (Cole: "why is email a different format"): results, campaigns, flows, funnel, plan. */
    const ek = X.esort || 'revenue', crow = sortRows(camps.map(c => ({ ...c, revenue: rev(c), rpr: c.recipients ? rev(c) / c.recipients : null })), ek === 'sent' ? 'recipients' : ek);
    return `${sec('Email results', 'Sales are Triple Whale, last click, the whole week. Sends and opens are Klaviyo.', `<div class="cs-tiles">
        ${tile('Email and SMS sales (Triple Whale)', `${ch ? money(ch.cur.revenue) : '–'}${ch && ch.prev ? delta(ch.cur.revenue, ch.prev.revenue) : ''}`, ch && ch.prev ? `${money(ch.prev.revenue)} the week before` : '')}
        ${tile('Share of store sales', ch && t.sales ? fx(ch.cur.revenue / t.sales, 0) : '–', 'of the whole store\'s sales, Triple Whale')}
        ${tile('Campaigns sent', `${em.length} email · ${sms.length} SMS`, `${money(camps.reduce((n, c) => n + (rev(c) || 0), 0))} by Klaviyo's count`)}
        ${tile('Flows', money(flowRev), `top ${flows.length} flows, Klaviyo's count`)}</div>
        ${err ? `<p class="cs-empty">${esc(err === 'not_linked' ? 'Klaviyo is not connected for this brand.' : err)}</p>` : ''}
        <details class="cs-fold"><summary>Campaigns, flows and the email funnel</summary><div class="in">
      ${('<div class="cs-subblk"><h4>Campaigns sent last week</h4>') + (camps.length ? `<div class="cs-tw"><table class="cs-tbl"><thead><tr><th>Campaign</th>${thSort(b, ek, 'sent', 'Sent', 'esort')}${thSort(b, ek, 'open_rate', 'Opened', 'esort')}${thSort(b, ek, 'click_rate', 'Clicked', 'esort')}${thSort(b, ek, 'revenue', 'Sales (Klaviyo)', 'esort')}${thSort(b, ek, 'rpr', 'Per person sent', 'esort')}</tr></thead><tbody>${crow.map(c => `<tr><td>${esc(c.name)} <small class="muted">${/sms/i.test(c.channel || '') ? 'SMS' : 'email'} · ${md(String(c.send_at || c.sent_at || '').slice(0, 10))}</small></td><td>${(c.recipients || 0).toLocaleString('en-US')}</td><td>${c.open_rate != null ? fx(c.open_rate) : '–'}</td><td>${c.click_rate != null ? fx(c.click_rate, 2) : '–'}</td><td>${money(c.revenue)}</td><td>${c.rpr != null ? cents(c.rpr) : '–'}</td></tr>`).join('')}</tbody></table></div>` : empty('No campaigns sent last week.')) + '</div>'}
      ${'<div class="cs-subblk"><h4>Flows</h4><p class="cap">The automations that run on their own, Klaviyo\'s own report window.</p>' + (flows.length ?`<div class="cs-tw"><table class="cs-tbl"><thead><tr><th>Flow</th><th>Sent</th><th>Sales (Klaviyo)</th><th>Per person sent</th></tr></thead><tbody>${flows.map(f => { const n = f.recipients || f.delivered || 0; return `<tr><td>${esc(f.name)}</td><td>${n.toLocaleString('en-US')}</td><td>${money(f.revenue)}</td><td>${n ? cents(f.revenue / n) : '–'}</td></tr>`; }).join('')}</tbody></table></div>` : empty('No flow sales in Klaviyo\'s report.')) + '</div>'}
      ${ga ? `<div class="cs-subblk"><h4>Email funnel</h4><p class="cap">People who came from email and SMS (GA4), against last week.</p>${funnelHtml(ga.cur, ga.prev, null, 'var(--c-email)', ga.avg)}</div>` : ''}
        </div></details>`)}
      ${b.client ? '' : sec('Email plan', 'Type what goes out this week. Yes, Changes or No on each line.', planHtml(b, 'eplan', STRAT[b.act_id] || 'the strategist'))}`;
  }
  function lastWeekBlock(b) {
    const X = bx(b.act_id), r = b.read, t = today();
    const acts = X.acts && !X.acts.error ? (X.acts.activities || X.acts.rows || X.acts.items || []) : null;
    /* Changes the team made (people, Locus, Claude), not Meta's own housekeeping (billing, "ad delivered"); one line per change. */
    const seen = new Set();
    const mine = acts ? acts.filter(a => a.summary && !/^meta$/i.test(String(a.actor || '')) && (a.manual || /budget|paused|status|new_|creative|ad_|relaunch/i.test(a.category || a.event_type || '')) && !seen.has(a.summary) && seen.add(a.summary)).slice(0, 8) : null;
    const ga = X.ga && !X.ga.error ? X.ga : null;
    return `${sec(`${esc(b.name)}: last week`, r ? `${short(r.period_start)} to ${short(r.period_end)}. Triple Whale, whole store, every channel, against the week before.` : '', r ? tilesHtml(r) : empty('No weekly report for this brand yet.'))}
      ${sec('The store funnel', 'Every visitor (GA4), step by step, against last week.', X.ga == null ? empty('Loading GA4…') : ga ? funnelHtml(ga.cur, ga.prev, null, null, gaAvg(X), r && r.totals ? { v: r.totals.orders, p: r.prior && r.prior.orders } : null) : `<p class="cs-empty">${esc(X.ga.error === 'not_linked' ? 'GA4 is not connected for this brand.' : X.ga.error)}</p>`)}
      ${custBlock(b)}
      ${sec('Last week\'s changes', 'What we changed in the accounts, from the Change Log.', mine == null ? (X.acts && X.acts.error ? `<p class="cs-empty">${esc(X.acts.error)}</p>` : empty('Loading…')) : mine.length ? (X.chg = mine, changesHtml(mine, b)) : empty('No changes logged last week.'))}
      ${(b.open || []).length ? sec('Last week\'s tasks', 'Still open in Locus Tasks. Tick one when it\'s done.', todoList(b.open, t, '')) : ''}`;
  }
  /* Last week's changes, skimmable (Cole: "it only gives text, should it give visual cues"): a chip for what kind of
     change it was, the platform, the money move pulled out in bold, grouped by day, a count of each kind on top. */
  /* Round 7 Customers (Cole: "why not just say CAC, new customer AOV, 90-day LTV? show me what they buy first and what
     they buy next"). Standard names, one window stated (the last 90 days for the money, every customer Locus has
     followed for the product path), and three pictures: value over time, first product -> what comes next, and where
     first vs repeat orders come from. Data: profit /api/customers (Triple Whale orders). */
  const SRC = { meta: ['Meta', 'var(--c-meta)'], google: ['Google', 'var(--c-google)'], email: ['Email / SMS', 'var(--c-email)'], tiktok: ['TikTok', 'var(--c-tiktok)'], own: ['Direct / organic', 'var(--line-strong)'] };
  function ltvChart(curve, cac) {
    const pts = [[0, 0], ...curve.map(p => [p.days, p.ltv, p.customers])], maxD = Math.max(...pts.map(p => p[0]), 30);
    const top = Math.max(...pts.map(p => p[1]), cac || 0) * 1.15, W = 520, Hh = 210, L = 44, R = 14, T = 18, B = 26;
    const X = d => L + d / maxD * (W - L - R), Y = v => T + (1 - v / top) * (Hh - T - B);
    const thin = p => p[2] != null && p[2] < 200;
    const solid = pts.filter(p => !thin(p)), weak = pts.filter((p, i) => thin(p) || (i && thin(pts[i + 1] || [])));
    const line = arr => arr.map((p, i) => `${i ? 'L' : 'M'}${X(p[0]).toFixed(1)},${Y(p[1]).toFixed(1)}`).join(' ');
    const ticks = [0, 0.25, 0.5, 0.75, 1].map(f => Math.round(top * f / 25) * 25);
    return `<svg class="cs-ltvsvg" viewBox="0 0 ${W} ${Hh}" role="img" aria-label="Spend per customer over time against CAC">
      ${ticks.map(v => `<line x1="${L}" x2="${W - R}" y1="${Y(v)}" y2="${Y(v)}" stroke="var(--line)"/><text x="${L - 6}" y="${Y(v) + 4}" font-size="10" text-anchor="end" fill="var(--muted)">$${v}</text>`).join('')}
      ${pts.map(p => `<text x="${X(p[0])}" y="${Hh - 8}" font-size="10" text-anchor="middle" fill="var(--muted)">${p[0]}d</text>`).join('')}
      ${cac ? `<line x1="${L}" x2="${W - R}" y1="${Y(cac)}" y2="${Y(cac)}" stroke="var(--bad)" stroke-width="1.5" stroke-dasharray="5 4"/><text x="${W - R}" y="${Y(cac) + 14}" font-size="11" font-weight="600" text-anchor="end" fill="var(--bad)">CAC ${money(cac)}</text>` : ''}
      <path d="${line(solid)} L${X(solid[solid.length - 1][0])},${Y(0)} L${X(0)},${Y(0)} Z" fill="var(--brand)" opacity=".08"/>
      <path d="${line(solid)}" fill="none" stroke="var(--brand)" stroke-width="2.5"/>
      ${weak.length > 1 ? `<path d="${line(weak)}" fill="none" stroke="var(--brand)" stroke-width="2.5" stroke-dasharray="4 4" opacity=".5"/>` : ''}
      ${pts.slice(1).map((p, i, a) => `<circle cx="${X(p[0])}" cy="${Y(p[1])}" r="3.5" fill="var(--brand)"${thin(p) ? ' opacity=".5"' : ''}/><text x="${X(p[0])}" y="${Y(p[1]) - 9}" font-size="10.5" font-weight="600" text-anchor="${i === a.length - 1 ? 'end' : 'middle'}" fill="var(--ink)">${money(p[1])}</text>`).join('')}
    </svg>`;
  }
  function custBlock7(b, C) {
    const h = C.headline || {}, j = C.journey || {}, P = j.products || {};
    const tile = (l, v, sub) => v == null ? '' : `<div class="cs-tile"><span class="l">${l}</span><span class="v">${v}</span><span class="sub">${sub || ''}</span></div>`;
    const c90 = (j.curve || []).find(p => p.days === 90 && p.ltv != null);
    const tiles = [
      tile('CAC', h.cac ? money(h.cac) : null, h.new_orders != null ? `${nfmt(h.new_orders)} new customers` : ''),
      tile('New customer AOV', h.new_aov != null ? money(h.new_aov) : null, h.payback != null ? `first order pays back ${x2(h.payback)} its CAC` : ''),
      c90 ? tile('90-day LTV', money(c90.ltv), h.cac ? `${x2(c90.ltv / h.cac)} LTV:CAC` : '') : '',
      tile('Returning customer orders', h.returning_orders != null ? nfmt(h.returning_orders) : null, h.returning_aov != null ? `returning AOV ${money(h.returning_aov)} · ${fx(1 - (h.new_rev_share ?? 1), 0)} of revenue` : ''),
      j.repeat_rate_ever != null ? tile('Repeat rate', fx(j.repeat_rate_ever, 0), j.days_to_second != null ? `2nd order after ${Math.round(j.days_to_second)} days (median)` : 'bought again') : '',
    ].join('');
    /* Round 9 (Cole: "blank blue bars don't make sense"): one line chart, what a customer has spent since their first
       order (LTV) against what they cost to get (CAC, red dashed). Above the line = paid back. Thin samples are lighter. */
    const curve = (j.curve || []).filter(p => p.ltv != null);
    const curveHtml = curve.length > 1 ? ltvChart(curve, h.cac) : '';
    const first = (P.first || []).slice(0, 6);
    const pathHtml = first.length ? `<table class="cs-tbl cs-path"><thead><tr><th>First product bought</th><th>New customers</th><th>Bought again</th><th>What they bought next</th></tr></thead><tbody>${first.map(p => `<tr><td>${esc(p.name || p.title || p.id)}</td><td>${nfmt(p.customers)} <small class="muted">${fx(p.share, 0)}</small></td><td>${p.repeat_rate != null ? fx(p.repeat_rate, 0) : '–'}</td><td>${(p.then || []).slice(0, 3).map(t => `<span class="cs-chip">${esc(t.name)} <b>${t.customers}</b></span>`).join(' ') || '<span class="muted">–</span>'}</td></tr>`).join('')}</tbody></table>` : '';
    const bar = (list, title) => { const tot = (list || []).reduce((n, s) => n + (s.orders || 0), 0); if (!tot) return ''; return `<div class="cs-srcrow"><span class="t">${title}</span><div class="cs-stack">${list.map(s => `<i style="width:${s.orders / tot * 100}%;background:${(SRC[s.source] || [s.source, 'var(--muted)'])[1]}" title="${esc((SRC[s.source] || [s.source])[0])}: ${fx(s.orders / tot, 0)}"></i>`).join('')}</div><span class="k">${list.filter(s => s.orders / tot >= 0.05).map(s => `<span><i style="background:${(SRC[s.source] || [s.source, 'var(--muted)'])[1]}"></i>${esc((SRC[s.source] || [s.source])[0])} ${fx(s.orders / tot, 0)}</span>`).join('')}</span></div>`; };
    const srcHtml = j.sources ? `${bar(j.sources.first, 'First orders')}${bar(j.sources.repeat, 'Repeat orders')}` : '';
    if (!tiles && !pathHtml) return '';
    /* Round 8 (Cole: "it was at a decent spot before, now it's cluttered"): one card. The five numbers show; the three
       deeper views fold under "More on customers" for when the conversation goes there. */
    const sub = (t, c, body) => `<div class="cs-subblk"><h4>${t}</h4>${c ? `<p class="cap">${c}</p>` : ''}${body}</div>`;
    const c90b = (j.curve || []).find(p => p.days === 90 && p.ltv != null);
    const chart = curveHtml ? `<div class="cs-ltv">${curveHtml}<div class="say"><b>${c90b && h.cac ? x2(c90b.ltv / h.cac) : '–'}</b><span>LTV:CAC at 90 days</span><p>${c90b && h.cac ? (c90b.ltv >= h.cac ? `A new customer has spent ${money(c90b.ltv)} by day 90 against ${money(h.cac)} to get them: they pay for themselves.` : `A new customer has spent ${money(c90b.ltv)} by day 90 against ${money(h.cac)} to get them: not paid back yet.`) : ''} Revenue, before product cost.</p></div></div>` : '';
    const more = [
      pathHtml ? sub('What they buy first, and next', `Every customer Locus has followed${P.coverage != null ? ` (${fx(P.coverage, 0)} of orders have products)` : ''}.`, `<div class="cs-tw">${pathHtml}</div>`) : '',
      srcHtml ? sub('Where first and repeat orders come from', 'Last click, Triple Whale.', srcHtml) : ''].join('');
    return sec('Customers', 'Last 90 days, Triple Whale.', `<div class="cs-tiles">${tiles}</div>${chart}${more ? `<details class="cs-fold"><summary>More on customers</summary><div class="in">${more}</div></details>` : ''}`);
  }
  function changeKind(a) {
    const s = `${a.category || ''} ${a.event_type || ''} ${a.summary || ''}`;
    const m = String(a.summary || '').match(/\$([\d,.]+)\s*(?:to|→|->)\s*\$([\d,.]+)/i), n = v => +String(v).replace(/,/g, '');
    /* Cole: "budget up, one off, these names are weird". Each label says what was done, in words. */
    if (/budget|cap|min spend|minimum/i.test(s) && m) return n(m[2]) >= n(m[1]) ? ['up', 'Raised budget', m] : ['down', 'Lowered budget', m];
    if (/budget|cap|min spend|minimum/i.test(s)) return ['', 'Changed budget', m];
    if (/pause|paused|turned off|\boff\b|stop/i.test(s)) return ['down', 'Turned off', m];
    if (/resum|turned on|activated|relaunch|\bon\b/i.test(s)) return ['up', 'Turned back on', m];
    if (/new_campaign|new campaign/i.test(s)) return ['new', 'New campaign', m];
    if (/new_adset|new ad set/i.test(s)) return ['new', 'New ad set', m];
    if (/new_|launch|created|added|new ad|new creative|duplicat/i.test(s)) return ['new', 'New ad', m];
    if (/bid|targeting|audience/i.test(s)) return ['', 'Changed targeting or bids', m];
    if (/email|klaviyo|sms|flow/i.test(s)) return ['', 'Email change', m];
    return ['', 'Other change', m];
  }
  /* What a change points at, so a tap can open it: an ad opens its card (the Ads page sheet), a campaign or ad set
     opens its row in Meta campaigns. Matched by Meta id, else by the name in the line. */
  function changeTarget(b, a) {
    const X = bx(b.act_id), M = X.ads && !X.ads.error ? X.ads : null, ads = M ? M.ads || [] : [];
    const nm = a.object_name || (String(a.summary || '').match(/"([^"]+)"/) || [])[1] || String(a.summary || '').replace(/^(paused|turned off|turned on|resumed|relaunched|new ad|budget[^:]*:)\s*/i, '').trim();
    const ad = ads.find(r => String(r.id) === String(a.object_id)) || (nm && ads.find(r => r.name === nm)) || (nm && nm.length > 3 && ads.find(r => r.name && (r.name.startsWith(nm) || nm.startsWith(r.name))));
    if (ad) return { kind: 'ad', id: ad.id };
    if (/^AD$|ADGROUP/i.test(a.object_type || '') && a.object_id) return { kind: 'adid', id: a.object_id, name: nm };
    if (nm) return { kind: 'name', name: nm };
    return null;
  }
  function changesHtml(list, b) {
    const rows = list.map((a, i) => ({ a, i, k: changeKind(a), t: b ? changeTarget(b, a) : null, plat: /google/i.test(`${a.category} ${a.event_type} ${a.summary}`) ? 'google' : /email|klaviyo|sms/i.test(`${a.category} ${a.event_type}`) ? 'email' : 'meta', day: String(a.event_time || '').slice(0, 10) }));
    const count = {}; rows.forEach(r => { count[r.k[1]] = (count[r.k[1]] || 0) + 1; });
    const who = a => { const s = String(a.actor || ''); return /claude/i.test(s) ? 'Claude' : /mobius tools/i.test(s) ? 'Locus' : /^meta$/i.test(s) ? 'Meta' : s ? teamName(s) : ''; };
    let last = '';
    return `<div class="cs-sum">${Object.entries(count).sort((p, q) => q[1] - p[1]).map(([l, n]) => { const tone = (rows.find(r => r.k[1] === l) || { k: [''] }).k[0]; return `<span class="cs-chip ${tone}">${esc(l)} <b>${n}</b></span>`; }).join('')}</div>
      <ul class="cs-chg">${rows.map(r => { const head = r.day !== last ? `<li class="day">${md(r.day)}</li>` : ''; last = r.day; const txt = esc(r.a.display || r.a.summary).replace(r.k[2] ? esc(r.k[2][0]) : '\u0000', r.k[2] ? `<em>${esc(r.k[2][0])}</em>` : ''); const tg = r.t ? ` data-chg="${r.i}" data-act="${esc(b.act_id)}" tabindex="0" role="button" title="Open it"` : ''; return `${head}<li class="${r.t ? 'go' : ''}"${tg}><span><span class="cs-chip ${r.k[0]}">${esc(r.k[1])}</span></span><span class="tx"><span class="cs-plat ${r.plat}"></span>${txt}</span><span class="o">${esc(who(r.a))}${r.t ? ' <span class="chev">›</span>' : ''}</span></li>`; }).join('')}</ul>`;
  }
  /* Customers and products (Cole: "LTV, the customer journey, what's selling"). From Locus's Customers page
     (/api/customers: Triple Whale orders followed from the first order). Shown only when it answers. */
  function custBlock(b) {
    const X = bx(b.act_id), C = X.cust; if (C == null) return sec('Customers', '', empty('Loading customers…')); if (C.error) return '';
    return custBlock7(b, C);
    /* Shapes from profit worker /api/customers: headline (window), journey (customers followed from their first order). */
    const h = C.headline || {}, j = C.journey || {}, w = j.window || {};
    const tile = (l, v, sub) => v == null ? '' : `<div class="cs-tile"><span class="l">${l}</span><span class="v">${v}</span><span class="sub">${sub || ''}</span></div>`;
    const c90 = (j.curve || []).find(p => p.days === 90 && p.ltv != null), lc = j.ltv_cac;
    const tiles = [
      tile('Cost to get a new customer', h.cac ? money(h.cac) : null, h.new_orders != null ? `${plural(h.new_orders, 'new customer')} last week` : ''),
      tile('Their first order', h.new_aov != null ? money(h.new_aov) : null, h.payback != null ? `pays back ${x2(h.payback)} on order one` : ''),
      c90 ? tile('Spent in their first 90 days', money(c90.ltv), isFinite(+lc) && lc != null ? `${x2(+lc)} what they cost` : h.cac ? `${x2(c90.ltv / h.cac)} what they cost` : '') : '',
      tile('Returning customers', h.returning_orders != null ? plural(h.returning_orders, 'order') : null, h.returning_aov != null ? `${money(h.returning_aov)} each, ${fx(1 - (h.new_rev_share ?? 1), 0)} of sales` : ''),
      j.repeat_rate_ever != null ? tile('Order again', fx(j.repeat_rate_ever, 0), j.days_to_second != null ? `second order after about ${Math.round(j.days_to_second)} days` : '') : '',
    ].join('');
    const P = j.products || {}, first = (P.first || []).slice(0, 6), next = (P.next || []).slice(0, 4);
    const prodRows = first.length ? `<div class="cs-tw"><table class="cs-tbl"><thead><tr><th>What new customers buy first</th><th>Customers</th><th>Share</th></tr></thead><tbody>${first.map(p => `<tr><td>${esc(p.title || p.name || p.id)}</td><td>${(p.customers ?? p.n ?? 0).toLocaleString('en-US')}</td><td>${p.share != null ? fx(p.share, 0) : ''}</td></tr>`).join('')}</tbody></table></div>` : '';
    const nextRow = next.length ? `<p class="cs-sub">What they buy next: ${next.map(p => `${esc(p.from || p.first || '')} → ${esc(p.to || p.next || '')}${p.customers || p.n ? ` (${p.customers || p.n})` : ''}`).join(' · ')}</p>` : '';
    const young = j.history && j.history.complete === false ? `<p class="cs-sub">Locus has followed customers since ${short(j.history.from)}; lifetime value firms up from ${short(j.history.reliable_from)}.</p>` : '';
    if (!tiles && !prodRows) return '';
    return sec('Customers', 'Are new customers worth what they cost? From Locus Customers (Triple Whale orders and spend).', `${tiles ? `<div class="cs-tiles">${tiles}</div>` : ''}${prodRows}${nextRow}${young}`);
  }
  function metaBlock(b) {
    const X = bx(b.act_id), r = b.read, ch = (r && r.channels || []).find(c => c.id === 'meta'), M = X.ads && !X.ads.error ? X.ads : null;
    const groas = M && M.g && M.g.roas ? +M.g.roas : null;
    /* ONE attribution choice for the whole Meta section (Cole: "an overarching ability to choose attribution"): tiles,
       campaigns and ads all follow it. Triple Whale last click is the default and matches the weekly report. */
    const attSel = ddHtml('model', b.act_id, 'Attribution', (MODELS.find(m => m[0] === X.model) || [])[1]);
    const sum = k => (M ? M.ads || [] : []).filter(a => !isLeadRow(M, a)).reduce((n, a) => n + (a[k] || 0), 0);
    const useRep = X.model === 'lastPlatformClick' && ch;
    const sp = ch ? ch.cur.spend : M ? (M.ads || []).reduce((n, a) => n + (a.spend || 0), 0) : null;
    const rev = useRep ? ch.cur.revenue : M ? sum('revenue') : null, ord = useRep ? ch.cur.purchases : M ? sum('purchases') : null;
    const roas = useRep ? ch.cur.roas : sp ? rev / sp : null, mname = (MODELS.find(m => m[0] === X.model) || [])[1] || '';
    const tile = (l, v, sub) => `<div class="cs-tile"><span class="l">${l}</span><span class="v">${v}</span><span class="sub">${sub || ''}</span></div>`;
    const tiles = (ch || M) ? `<div class="cs-tiles">${tile('Meta spend', `${money(sp)}${ch && ch.prev ? delta(ch.cur.spend, ch.prev.spend, 'n') : ''}`, ch && ch.prev ? `${money(ch.prev.spend)} the week before` : '')}
        ${tile(`Meta sales (${esc(mname)})`, `${money(rev)}${useRep && ch.prev ? delta(ch.cur.revenue, ch.prev.revenue) : ''}`, ord != null ? plural(Math.round(ord), 'order') : '')}
        ${tile('Meta ROAS', `${x2(roas)}${vsGoal(roas, groas)}`, useRep && ch.prev ? `${x2(ch.prev.roas)} the week before` : useRep ? '' : 'sum of the ads under this attribution')}
        ${(() => { const lsp = M ? (M.ads || []).filter(a => isLeadRow(M, a)).reduce((n, a) => n + (a.spend || 0), 0) : 0; return tile('Cost per sale', ord ? money((sp - lsp) / ord) : '–', `${lsp ? 'sales ads only' : ''}${lsp && M && M.g && M.g.cpa ? ', ' : ''}${M && M.g && M.g.cpa ? `goal ${money(+M.g.cpa)}` : ''}`); })()}
        ${M && M.leadGoal ? tile('Lead ads', money((M.ads || []).filter(a => isLeadRow(M, a)).reduce((n, a) => n + a.spend, 0)), `goal ${cents(M.leadGoal)} a lead`) : ''}</div>` : empty('No Meta numbers in the report.');
    const all = M ? sortRows(M.ads || [], X.adsort, ['cpa', 'cpm'].includes(X.adsort)) : [], N = X.more ? all.length : 10;
    const ads = !M ? (loading(X, 'ads', 'the ads') || '') : `<div class="cs-tools">${ddHtml('sort', b.act_id, 'Sort by', (ADSORT.find(s => s[0] === X.adsort) || [])[1])}${attSel}<span class="gap"></span><span class="cs-sub" style="margin:0">${all.length ? `${Math.min(N, all.length)} of ${all.length}` : ''}</span></div>
      ${all.length ? M.cards(all.slice(0, N)) : empty('No ads spent this week.')}${all.length > 10 ? `<button type="button" class="cs-link" data-admore="${esc(b.act_id)}">${X.more ? 'Show 10' : `Show all ${all.length}`}</button>` : ''}
      <p class="cs-sub">The Ads page's own cards. Tap one for every number and its ad set; "Turn off" and "Move for the buyer" are at the top of it.</p>`;
    const sales = M ? (M.ads || []).filter(a => !isLeadRow(M, a)) : [];
    const imp = sales.reduce((n, a) => n + (a.impressions || 0), 0), clk = sales.reduce((n, a) => n + (a.clicks || 0), 0);
    /* Meta funnel (Cole: "why aren't sessions, add to cart, checkout and purchase filled in?"): Meta's own path, which
       every brand has: ad views and link clicks (Meta), added to cart (Meta's pixel), purchases (Triple Whale, the
       attribution picked above), each against the week before. GA4's paid-social visitors sit under it when GA4 counts them. */
    const P = X.paid && !X.paid.error ? ((X.paid.brands || [])[0] || X.paid) : null, pc = P && P.cur, pp = P && P.prev;
    const ga = gaRow(X, /paid social/i), gaOk = ga && (ga.cur.addToCarts || ga.cur.ecommercePurchases);
    /* Round 6 (Cole: "the point is people who came from the ad, and what they did after"): starts at the click. Ad views
       and click rate are one line above it, not a step (a 1.6% step would dwarf the rest). One funnel only. */
    const fun = pc ? `<p class="cs-lead">${nfmt(pc.impressions)} ad views gave <b>${nfmt(pc.clicks)} link clicks</b> (${fx(pc.impressions ? pc.clicks / pc.impressions : null, 2)} click rate${pp && pp.impressions ? `, ${fx(pp.clicks / pp.impressions, 2)} the week before` : ''}).</p>
        ${flowHtml([{ l: 'Link clicks', v: pc.clicks, p: pp && pp.clicks }, { l: 'Added to cart', v: pc.atc, p: pp && pp.atc }, pc.checkouts != null ? { l: 'Reached checkout', v: pc.checkouts, p: pp && pp.checkouts } : { l: 'Reached checkout', missing: true, why: 'Meta\'s checkout count fills in after the next Locus sync' }, { l: 'Purchased', v: pc.purchases, p: pp && pp.purchases }], 'var(--c-meta)', false)}`
      : X.paid == null ? empty('Loading…') : `<p class="cs-empty">${esc(X.paid.error)}</p>`;
    void imp; void clk; void gaOk;
    const strat = STRAT[b.act_id] || strategistOf(b) || 'The strategist';
    /* The client meeting shows the same Meta pieces the team saw on Monday, minus the controls and the internal plan. */
    if (b.client) return `${secA('Meta results', 'Spend is Meta. Sales are Triple Whale.', attSel, tiles)}
      ${sec('Your ads', `${r ? `${short(r.period_start)} to ${short(r.period_end)}` : ''}. Tap one to see it and all its numbers.`, ads.replace(/<p class="cs-sub">The Ads page's own cards[\s\S]*?<\/p>/, ''))}
      ${sec('From the click to the sale', 'People who clicked an ad and what they did next, against last week.', fun)}`;
    return `${secA('Meta results', `Spend is Meta. Sales follow the attribution picked here, and so do the campaigns and ads below.`, attSel, tiles)}
      ${secA('Meta campaigns', `${esc(mname)}. Tap a campaign for its ad sets, an ad set for its ads.`, `<button type="button" class="cs-dd" data-mcols="${esc(b.act_id)}"><span class="v">Columns</span><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg></button>`, metaTable(b))}
      ${sec('Meta ads', `${r ? `${short(r.period_start)} to ${short(r.period_end)}` : ''}, ${esc(mname)}.`, ads)}
      ${sec('Meta funnel', 'People who clicked a Meta ad, and what they did next. Clicks and add to cart are Meta\'s count, purchases are Triple Whale.', fun)}
      ${sec(`${esc(strat)}'s Meta plan`, `From ${esc(strat)}'s Slack post. Yes, Changes or No on each line; Finish posts it in the recap and tags ${esc(strat)}.`, `${(b.posts || []).some(p => teamName(p.by) !== 'Radhesh') ? `<details class="cs-more"><summary>The post, word for word</summary>${postsHtml((b.posts || []).filter(p => teamName(p.by) !== 'Radhesh'), b.act_id)}</details>` : ''}${planHtml(b, 'batches', strat)}`)}`;
  }
  function googleBlock(b) {
    const X = bx(b.act_id), r = b.read, ch = (r && r.channels || []).find(c => c.id === 'google');
    seedGoogle(b);
    const ga = gaRow(X, /paid search|paid shopping|cross-network|paid other/i);
    const G = X.gads && !X.gads.error ? X.gads.campaigns || [] : [], gclk = G.reduce((n, c) => n + (c.clicks || 0), 0), gimp = G.reduce((n, c) => n + (c.impressions || 0), 0);
    const tile = (l, v, sub) => `<div class="cs-tile"><span class="l">${l}</span><span class="v">${v}</span><span class="sub">${sub || ''}</span></div>`;
    const tiles = `<div class="cs-tiles">${tile('Google spend', `${money(ch.cur.spend)}${ch.prev ? delta(ch.cur.spend, ch.prev.spend, 'n') : ''}`, ch.prev ? `${money(ch.prev.spend)} the week before` : '')}
      ${tile('Google sales (Triple Whale)', `${money(ch.cur.revenue)}${ch.prev ? delta(ch.cur.revenue, ch.prev.revenue) : ''}`, ch.cur.purchases != null ? plural(Math.round(ch.cur.purchases), 'order') : ch.prev ? `${money(ch.prev.revenue)} the week before` : '')}
      ${tile('Google ROAS', x2(ch.cur.roas), ch.prev ? `${x2(ch.prev.roas)} the week before` : '')}
      ${tile('Cost per sale', ch.cur.purchases ? money(ch.cur.spend / ch.cur.purchases) : '–', gclk ? `${Math.round(gclk).toLocaleString('en-US')} clicks at ${cents(ch.cur.spend / gclk)}` : '')}
      ${gimp ? tile('Click rate', fx(gclk / gimp, 2), `${Math.round(gimp).toLocaleString('en-US')} impressions`) : ''}</div>`;
    if (b.client) return sec('Google results', 'Spend and clicks are Google Ads. Sales are Triple Whale.', tiles);
    return `${sec('Google results', 'Spend and clicks are Google Ads. Sales are Triple Whale, last click.', `${tiles}${ga ? `<details class="cs-fold"><summary>Google funnel</summary><div class="in">${funnelHtml(ga.cur, ga.prev, null, 'var(--c-google)', null, null)}</div></details>` : ''}`)}
      ${sec('Google campaigns', '', googleTable(b))}
      ${sec('Radhesh\'s Google plan', 'From Radhesh\'s Slack post. Yes, Changes or No on each line.', planHtml(b, 'gplan', 'Radhesh'))}`;
  }
  /* Trybe videos waiting on a decision, with the buttons (Monday screen and the creator call). */
  function rvList(act, X) {
    const rv = X.rv && !X.rv.error ? X.rv.items || [] : null, s = brandState(act); s.rv = s.rv || {};
    const b = { act_id: act };
    /* Round 2 (Cole: "will I be able to view all these? what happens if I click Changes?"): bigger 9:16 cards that play
       in place, the first 8 then Show all, and what each button does written above them. */
    const XB = bx(act), shown = rv && !XB.rvAll ? rv.slice(0, 8) : rv;
    return rv == null ? (X.rv && X.rv.error ? `<p class="cs-empty">${esc(X.rv.error)}</p>` : empty('Asking Trybe…')) : rv.length ? `<p class="cs-howto"><span><b>Run it:</b> approved in Trybe, it joins "Approved, not in an ad yet" for the buyer to launch</span><span><b>Changes:</b> type what to change, it goes back to the creator with your note</span><span><b>No:</b> rejected, the creator sees why</span><span>Tap a video to play it here.</span></p><div class="cs-rvg">${shown.map(x => { const v = s.rv[x.id] || {}; return `<div class="cs-rvc"><button type="button" class="th" data-clip2="${esc(x.sub_id || x.id || '')}" data-act="${esc(act)}" ${x.thumb ? `style="background-image:url('${esc(x.thumb)}')"` : ''}>${x.thumb ? '' : 'Video'}<span class="play">▶</span></button><div class="bd"><b>${esc(x.creator)}</b><small class="muted">${esc(x.product || '')}${x.created_at ? ` · ${md(String(x.created_at).slice(0, 10))}` : ''}</small>${x.line ? `<p>${esc(x.line)}</p>` : ''}
          ${!x.id ? '' : v.done ? `<p class="cs-d up" style="align-self:flex-start">${esc(v.done)}</p>` : `<div class="cs-vote">${[['approve', 'Run it'], ['changes', 'Changes'], ['reject', 'No']].map(([k, l]) => `<button type="button" class="${v.d === k ? (k === 'approve' ? 'y' : k === 'changes' ? 'c' : 'n') : ''}" data-rvd="${esc(x.id)}" data-v="${k}" data-act="${esc(b.act_id)}">${l}</button>`).join('')}</div>${v.d && v.d !== 'approve' ? `<input type="text" data-rvnote="${esc(x.id)}" data-act="${esc(b.act_id)}" placeholder="${v.d === 'changes' ? 'What to change (the creator sees this)' : 'Why not (the creator sees this)'}" value="${esc(v.note || '')}"><button type="button" class="btn" data-rvsend="${esc(x.id)}" data-act="${esc(b.act_id)}">Send to Trybe</button>` : ''}`}</div></div>`; }).join('')}</div>${rv.length > 8 ? `<button type="button" class="cs-link" data-rvall="${esc(act)}">${XB.rvAll ? 'Show 8' : `Show all ${rv.length} waiting`}</button>` : ''}` : '<p class="cs-empty">Nothing waiting in Trybe.</p>';
  }
  function trybeBlock(b) {
    const X = bx(b.act_id), T = b.trybe || {}, ws = b.winners || [], rv = X.rv && !X.rv.error ? X.rv.items || [] : null;
    const M = X.ads && !X.ads.error ? X.ads : null, rowOf = id => M && (M.ads || []).find(a => String(a.id) === String(id));
    const tile = (l, v, sub) => `<div class="cs-tile"><span class="l">${l}</span><span class="v">${v}</span>${sub ? `<span class="sub">${sub}</span>` : ''}</div>`;
    const s = brandState(b.act_id); s.rv = s.rv || {};
    return `<div class="cs-tiles">${tile('Waiting on a decision', rv ? rv.length : '…', 'in Trybe now')}${tile('Approved, not in an ad yet', T.queue ?? '–', T.stale ? `${T.stale} waiting over a week` : '')}${tile('Sold last 7 days', ws.length, plural(ws.reduce((n, w) => n + (w.orders || 0), 0), 'sale'))}</div>
      ${ws.length ? `<p class="cs-sub">Creator videos that sold, best first. Tap one for its ad.</p><div class="ads">${ws.map(w => `<button type="button" class="ad" ${w.ad_id ? `data-adrow="${esc(w.ad_id)}"` : `data-clip2="${esc(w.sub_id || '')}"`} data-act="${esc(b.act_id)}"><div class="th" ${w.thumb ? `style="background-image:url('${esc(w.thumb)}')"` : ''}>${w.thumb ? '' : 'Video'}<span class="play">▶</span></div><div class="m"><span>${plural(w.orders, 'sale')}</span><span>${rowOf(w.ad_id) ? money(rowOf(w.ad_id).spend) : ''}</span></div><div class="n">${esc(w.creator)}</div><div class="s">${esc(w.product || w.angle || '')}</div></button>`).join('')}</div>` : ''}
      ${rvList(b.act_id, X)}
      <div class="cs-acts"><button type="button" class="btn" data-creatorcall="${esc(b.act_id)}">Open ${esc(b.name)}'s creator meeting</button></div>`;
  }
  function boardPart(b) {
    const t = today(), cards = b.making || [];
    const cols = [['brief', 'Brief'], ['making', 'Making'], ['review', 'Review'], ['ready', 'Ready to launch']];
    return `<div class="cs-board">${cols.map(([k, l]) => { const cs = cards.filter(c => c.board === k); return `<div class="col"><h4>${l}<span>${cs.length}</span></h4>${cs.map(c => `<button type="button" class="mini" data-card="${esc(c.id || '')}" data-asana="${esc(c.asana_url || '')}">${c.thumb ? `<span class="tn" style="background-image:url('${esc(c.thumb)}')"></span>` : ''}<b>#${esc(c.num)}</b><span>${esc(c.title)}</span><small>${b.client ? '' : esc(c.owner || 'Nobody')}${c.due ? `${b.client ? '' : ' · '}<span class="${c.due < t && k !== 'ready' && !b.client ? 'late' : ''}">${b.client ? 'due ' : ''}${short(c.due)}</span>` : ''}</small></button>`).join('') || '<p class="cs-empty" style="font-size:12px">None</p>'}</div>`; }).join('')}</div>
      <p class="cs-sub">${b.client ? 'Tap a card to see the ads and the brief.' : 'Tap a card to open it here. A Ready card has "Launch to Meta" inside it.'}</p>`;
  }
  function comingPart(b) {
    const X = bx(b.act_id); if (X.cal == null) return empty('Loading the calendar…'); if (X.cal.error) return `<p class="cs-empty">${esc(X.cal.error)}</p>`;
    const t = today(), items = (X.cal.items || []).filter(e => e.act === b.act_id && (e.start || '') >= t && (e.start || '') <= addDays(t, 21));
    /* Round 2 (Cole: "a list and no calendar view?"): three weeks Monday to Sunday, today outlined, each date a chip on
       its day (dashed = not confirmed), and the list under it with the offers. */
    const wd = (dt(t).getUTCDay() + 6) % 7, mon = addDays(t, -wd), days = Array.from({ length: 21 }, (_, i) => addDays(mon, i));
    const on = d => items.filter(e => e.start === d || (e.start < d && e.end && e.end >= d));
    const grid = `<div class="cs-cal">${['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(h => `<span class="h">${h}</span>`).join('')}${days.map(d => `<div class="d${d === t ? ' t' : d < t ? ' past' : ''}"><span class="n">${short(d)}</span>${on(d).slice(0, 3).map(e => `<span class="ev${e.confirmed ? '' : ' un'}" title="${esc(e.name)}${e.offer ? `: ${esc(e.offer)}` : ''}">${esc(e.name)}</span>`).join('')}</div>`).join('')}</div>`;
    return items.length ? `${grid}<ul class="chk">${items.slice(0, 8).map(e => `<li><span class="tx"><b>${esc(e.name)}</b>${e.offer ? ` <span class="muted">· ${esc(e.offer)}</span>` : ''}</span><span class="o">${md(e.start)}${e.confirmed ? '' : ' · not confirmed'}</span></li>`).join('')}</ul>` : `${grid}${empty('Nothing on the calendar in the next 3 weeks.')}`;
  }
  function mondayBrand2(b) {
    const s = brandState(b.act_id), X = bx(b.act_id), r = b.read;
    if (STRAT[b.act_id]) s.strat = STRAT[b.act_id];   // Finish names them in the recap
    if (!X.loaded && !X.loading) { X.loading = true; loadBrand2(b).finally(() => { X.loading = false; }); }
    const has = id => !!(r && (r.channels || []).find(c => c.id === id && c.cur && (c.cur.spend || c.cur.revenue)));
    const list = (name, ph, add) => `<div class="rows" data-list="${name}" data-act="${esc(b.act_id)}">${rowsHtml(s[name] = s[name] || [], true).replace(/data-ph="[^"]*"/g, `data-ph="${esc(ph)}"`)}</div><button type="button" class="add" data-add="${name}" data-act="${esc(b.act_id)}">${add}</button>`;
    const strat = STRAT[b.act_id] || 'the strategist';
    const chan = (hue, inner) => `<div class="cs-grp" style="--acc:${hue}">${inner}</div>`;
    return `${chan('var(--brand)', `${part(1, 'Last week')}${lastWeekBlock(b)}`)}
      ${has('meta') ? chan('var(--c-meta)', `${part(2, `Meta <span class="cs-who meta">${esc(strat)}</span>`)}${metaBlock(b)}`) : ''}
      ${has('google') ? chan('var(--c-google)', `${part(3, 'Google <span class="cs-who google">Radhesh</span>')}${googleBlock(b)}`) : ''}
      ${has('email') ? chan('var(--c-email)', `${part(4, 'Email')}${emailBlock(b)}`) : ''}
      ${b.creators ? chan('var(--c-tiktok)', `${part(5, `Trybe <span class="cs-who trybe">${esc(strat)}</span>`)}${sec('Trybe', 'Creator videos for this brand.', trybeBlock(b))}`) : ''}
      ${chan('var(--ink-2)', `${part(6, 'Being made')}${sec(`Production${(b.making || []).length ? `: ${b.making.length}` : ''}`, '', boardPart(b))}${sec('Dates coming up', 'Drops, sales and emails on the calendar, next 3 weeks.', comingPart(b))}`)}
      ${part(7, 'Typed in the meeting')}
      <div class="cs-two">
        ${sec('Tasks', 'Who and when, then Enter. They go to Locus Tasks.', `<div class="rows" data-list="jobs" data-act="${esc(b.act_id)}">${rowsHtml(s.jobs || [])}</div><input type="text" data-quick="jobs" data-act="${esc(b.act_id)}" placeholder="e.g. Noma sends Fela the founder video inspo Friday">`)}
        ${sec('What we need from the client', 'Shows on their Requests page after Finish.', `${(b.asks || []).length ? `<ul class="chk">${b.asks.map(a => `<li><span class="tx">${esc(a.title)}</span><span class="o">asked ${short(a.created_at)}</span></li>`).join('')}</ul>` : ''}<div class="rows" data-list="asks" data-act="${esc(b.act_id)}">${rowsHtml(s.asks || [], true)}</div><button type="button" class="add" data-add="asks" data-act="${esc(b.act_id)}">+ Add something we need</button>`)}
        ${sec('What we owe the client', 'Things we promised to send them this week. They go in the recap and on their next client meeting.', list('sends', 'e.g. The Black Friday mockups by Thursday', '+ Add something we owe them'))}
        ${(s.calls || []).length ? sec('Moves for the media buyer', 'From the ad cards. Goes in the recap.', `<ul class="chk">${s.calls.map(c => `<li><span class="tx">${esc(c.text)}</span></li>`).join('')}</ul>`) : ''}
      </div>`;
  }
  /* Start = the scoreboard: every brand, last week, before anyone talks. */
  function scoreboard2() {
    const rows = mondayList().map(b => { const t = (b.read && b.read.totals) || {}, f = (b.read && b.read.plan) || {}, L = b.read && b.read.leads; const ex = L && t.sales != null && t.spend > L.spend ? t.sales / (t.spend - L.spend) : t.mer; const tone = !f.mer || ex == null ? '' : ex >= f.mer ? 'up' : ex >= f.mer * 0.75 ? 'flat' : 'down';
      return `<tr data-goto="${esc(b.act_id)}" class="cmp"><td><b>${esc(b.name)}</b> <small class="muted">${esc(STRAT[b.act_id] || '')}</small></td><td>${money(t.sales)}</td><td>${money(t.spend)}</td><td>${x2(t.mer)}${L ? ` <small class="muted">${x2(ex)} without leads</small>` : ''}</td><td>${f.mer ? pill(tone === 'up' ? 'on goal' : tone === 'flat' ? 'close' : 'under', tone) : ''}</td><td>${(b.posts || []).length ? pill('posted', 'up') : pill('not posted', 'down')}</td><td>${(b.open || []).length || ''}</td></tr>`; }).join('');
    return sec('Every brand, last week', 'Same order every week: Noma\'s brands, then Ahsan\'s. Tap a brand to go to it.', `<div class="cs-tw"><table class="cs-tbl cs-camp"><thead><tr><th>Brand</th><th>Sales</th><th>Spend</th><th>MER</th><th>vs goal</th><th>Plan in Slack</th><th>Open tasks</th></tr></thead><tbody>${rows}</tbody></table></div>`);
  }
  function agency2() {
    STATE.agency = STATE.agency || [];
    return `${sec('Agency tasks still open', 'Jobs not tied to one brand. Tick one when it\'s done.', todoList(D.agency_open || [], today(), 'Nothing open.'))}
      ${sec('Add an agency task', 'Who and when, then Enter.', `<div class="rows" data-list="agency" data-act="">${rowsHtml(STATE.agency)}</div><input type="text" data-quick="agency" data-act="" placeholder="e.g. Cole approves William's Claude connectors today">`)}`;
  }

  function mondayOpen() {
    STATE.agency = STATE.agency || [];
    if (STATE.theme == null) STATE.theme = D.theme || '';
    const n = mondayList().length;
    return `${sec('How this call runs', `One brand at a time, red first. For each brand: 1. how last week went, 2. what we are doing this week, 3. what is already being made, 4. what we typed. About ${Math.round(mondaySteps().reduce((m, x) => m + x.mins, 0))} minutes for ${plural(n, 'brand')}. Press Next or the right arrow key to move on.`,
        `<p class="cs-legend"><span class="dot bad"></span>Red: something needs fixing today <span class="dot warn"></span>Amber: worth a look <span class="dot good"></span>Green: on track. The colors come from Home.</p>`)}
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
  /* ---------- CLIENT CALL, LAYOUT 2 (2026-11-09): the same pieces as the Monday screen, the client's view ----------
     Last week (numbers, channels, the store funnel), the ads that ran (the Ads page's cards with no calls on them), what we
     changed (the Change Log lines that carry a client sentence, like their Updates page), this week (the plan the Monday
     call approved, no names), requests and what we send them, coming up. */
  const CLIENT2 = [{ id: 'news', name: 'Their news', mins: 3 }, { id: 'read', name: 'Last week', mins: 6 }, { id: 'ads', name: 'Ads', mins: 5 }, { id: 'changed', name: 'What we changed', mins: 3 }, { id: 'week', name: 'This week', mins: 4 }, { id: 'asks', name: 'Requests', mins: 3 }, { id: 'coming', name: 'Coming up', mins: 2 }, { id: 'finish', name: 'Finish', mins: 2 }];
  /* Round 7 (Cole: "the client meeting and the Monday meeting need more synergy... if it's the same format, the team has
     already seen it"): ONE scrolling page built from the same pieces as the Monday brand page, minus every internal
     control (budgets, switches, plan votes, owners, the buyer's moves). A jump bar at the top moves between sections, so
     it walks like a presentation without changing screens. Then Finish. */
  const CLIENT3 = [{ id: 'page', name: 'Meeting', mins: 25 }, { id: 'finish', name: 'Finish', mins: 2 }];
  let CB = null;
  const clientBrand = () => (CB && CB.act_id === D.act_id ? CB : (CB = { act_id: D.act_id, name: D.name, read: D.week, making: D.making || [...((D.ads || {}).review || []), ...((D.ads || {}).approved || [])], client: true, posts: [], creators: false }));
  function clientPage() {
    const b = clientBrand(), X = bx(b.act_id), r = b.read;
    if (!X.loaded && !X.loading) { X.loading = true; loadBrand2(b).finally(() => { X.loading = false; }); }
    STATE.asks = STATE.asks || []; STATE.promised = STATE.promised || [];
    const has = id => !!(r && (r.channels || []).find(c => c.id === id && c.cur && (c.cur.spend || c.cur.revenue)));
    const acts = X.acts && !X.acts.error ? (X.acts.activities || X.acts.rows || X.acts.items || []) : null;
    const said = acts ? acts.filter(a => String(a.client_why || '').trim()).map(a => ({ ...a, display: a.client_why })).slice(0, 12) : null;
    const m = D.monday || {}, wk = D.week || {};
    const plan = [...(m.meta || []).map(t => ['Meta', t]), ...(m.google || []).map(t => ['Google', t]), ...(m.email || []).map(t => ['Email', t]), ...(wk.this_week || []).map(t => ['', t])];
    const J = [['news', 'Your news'], ['week', 'Last week'], ['ads', 'Ads'], ['changed', 'What we changed'], ['plan', 'This week'], ['made', 'Being made'], ['asks', 'Requests'], ['coming', 'Coming up']];
    const grp = (id, n, title, hue, inner) => `<div class="cs-grp" id="cl-${id}" style="--acc:${hue}">${part(n, title)}${inner}</div>`;
    return `<nav class="cs-jump" aria-label="Sections">${J.map(([k, l]) => `<button type="button" data-jump="cl-${k}">${l}</button>`).join('')}</nav>
      ${grp('news', 1, 'Your news', 'var(--brand)', sec('What is new on your side?', 'Launches, stock, what customers are saying. We type it here while you talk.', `<textarea data-news class="big" placeholder="Type their news here">${esc(STATE.news || '')}</textarea>`))}
      ${grp('week', 2, 'Last week', 'var(--brand)', `${sec(`${esc(D.name)}: last week`, r ? `${short(r.period_start)} to ${short(r.period_end)}. Your whole store from Triple Whale, every channel, against the week before.` : '', r ? tilesHtml(r) : empty('No weekly report yet.'))}
        ${sec('Your store funnel', 'Everyone who visited your site, and how many moved to the next step, against last week.', X.ga == null ? empty('Loading…') : X.ga.error ? `<p class="cs-empty">${esc(X.ga.error === 'not_linked' ? 'Google Analytics is not connected yet.' : X.ga.error)}</p>` : funnelHtml(X.ga.cur, X.ga.prev, null, null, null, r && r.totals ? { v: r.totals.orders, p: r.prior && r.prior.orders } : null))}
        ${X.cust && !X.cust.error ? custBlock7(b, X.cust) : ''}`)}
      ${grp('ads', 3, 'Ads', 'var(--c-meta)', `${has('meta') ? metaBlock(b) : ''}${has('google') ? googleBlock(b) : ''}${has('email') ? emailBlock(b) : ''}`)}
      ${grp('changed', 4, 'What we changed', 'var(--brand)', sec('What we changed, and why', 'The changes we made in your accounts last week. Tap one to see the ad or campaign.', said == null ? empty('Loading…') : said.length ? changesHtml(said, b) : empty('Nothing changed with a note for you last week.')))}
      ${grp('plan', 5, 'This week', 'var(--brand)', sec('What we are doing this week', m.meta || m.google ? 'The plan the team approved on Monday.' : 'From your weekly report.', plan.length ? `<ol class="lines">${plan.map(([c, t], i) => `<li><i>${i + 1}</i><span>${c ? `<small class="muted">${c}</small><br>` : ''}${esc(t)}</span></li>`).join('')}</ol>` : empty('Say it on the call; the notes catch it.')))}
      ${grp('made', 6, 'Being made', 'var(--ink-2)', sec('Ads being made for you', 'The same board the team works from: brief, being made, waiting for your review, ready to launch.', boardPart(b)))}
      ${grp('asks', 7, 'Requests', 'var(--brand)', `<div class="cs-two">
        ${sec('What we need from you', 'Shows on your Requests page after the call.', `${(D.asks || []).length ? `<ul class="chk">${D.asks.map(a => `<li><span class="tx">${esc(a.title)}</span><span class="o">asked ${short(a.created_at)}</span></li>`).join('')}</ul>` : ''}<div class="rows" data-list="asks" data-act="">${rowsHtml(STATE.asks, true)}</div><button type="button" class="add" data-add="asks" data-act="">+ Add something we need</button>`)}
        ${sec('What we are sending you', 'What we promised on this call.', `${(m.send || []).length ? `<ul class="chk">${m.send.map(t => `<li><span class="tx">${esc(t)}</span></li>`).join('')}</ul>` : ''}<div class="rows" data-list="promised" data-act="">${rowsHtml(STATE.promised, true)}</div><button type="button" class="add" data-add="promised" data-act="">+ Add something we send</button>`)}</div>`)}
      ${grp('coming', 8, 'Coming up', 'var(--brand)', sec('Coming up', 'Sales, drops and emails on the calendar, next 3 weeks.', comingPart(b)))}`;
  }
  const clientSteps = () => layout2() ? CLIENT3 : CLIENT_STEPS;
  const CX = {};
  async function loadClient2() {
    const r = D.week; if (!r || CX.loading || CX.loaded) return; CX.loading = true;
    const act = encodeURIComponent(D.act_id), from = r.period_start, to = r.period_end;
    const job = (k, p) => p.then(v => { CX[k] = v; }, e => { CX[k] = { error: e.message }; });
    await Promise.all([
      job('ads', V2.adSet(D.act_id, from, to, H, { client: true, label: `${short(from)} to ${short(to)}` })),
      job('ga', H.apiAH(`/api/google/website?act=${act}&from=${from}&to=${to}&pfrom=${addDays(from, -7)}&pto=${addDays(from, -1)}`)),
      job('acts', H.apiAH(`/api/activities?act=${act}&from=${addDays(to, -13)}&to=${addDays(to, 8)}T05:59:59&limit=300`)),
    ]);
    CX.loading = false; CX.loaded = true; paintMain();
  }
  function clientStep2(id) {
    if (id === 'page') return clientPage();
    const r = D.week;
    if (!CX.loaded && !CX.loading) loadClient2();
    if (id === 'read') {
      if (!r) return null;
      const ga = CX.ga && !CX.ga.error ? CX.ga : null;
      return `${sec(`How last week went: ${short(r.period_start)} to ${short(r.period_end)}`, 'Your whole store from Triple Whale, every channel, against the week before.', (r.status !== 'sent' ? '<p class="warnline">This report has not been sent to them yet.</p>' : '') + tilesHtml(r) + chanTable(r))}
        ${ga ? sec('Your store funnel', 'Everyone who visited your site, and how many moved to the next step, against last week.', funnelHtml(ga.cur, ga.prev, null, null, gaAvg(CX))) : ''}`;
    }
    if (id === 'ads') {
      const M = CX.ads && !CX.ads.error ? CX.ads : null, A = D.ads || { review: [], approved: [], live: [] };
      const top = M ? [...(M.ads || [])].sort((p, q) => q.spend - p.spend).slice(0, 8) : [];
      const cardBtn = c => `<button type="button" class="ad" data-editbrief="${esc(c.id)}" title="Open it"><div class="th" ${c.thumb ? `style="background-image:url('${esc(c.thumb)}')"` : ''}>${c.thumb ? '' : esc(c.format || 'Ad')}</div><div class="n">#${esc(c.num)} ${esc(c.title)}</div></button>`;
      return `${sec('The ads that ran last week', 'Biggest first. Tap one to see it and its numbers.', M ? (top.length ? M.cards(top) : empty('No ads ran.')) : CX.ads && CX.ads.error ? `<p class="cs-empty">${esc(CX.ads.error)}</p>` : empty('Loading the ads…'))}
        ${A.review.length ? sec('New ads waiting for your OK', 'Tap one to see it; approve it or ask for changes there.', `<div class="ads">${A.review.map(cardBtn).join('')}</div>`) : ''}
        ${A.approved.length ? sec('Approved, going live soon', '', `<div class="ads">${A.approved.map(cardBtn).join('')}</div>`) : ''}`;
    }
    if (id === 'changed') {
      const rows = CX.acts && !CX.acts.error ? (CX.acts.rows || []).filter(a => String(a.client_why || '').trim()) : null;
      return sec('What we changed', 'The changes we made in your accounts, and why.', rows == null ? empty('Loading…') : rows.length ? `<ol class="lines">${rows.slice(0, 10).map((a, i) => `<li><i>${i + 1}</i><span>${esc(a.client_why)}<br><small class="muted">${md(String(a.event_time || '').slice(0, 10))}</small></span></li>`).join('')}</ol>` : empty('Nothing with a note for you in the last two weeks.'));
    }
    if (id === 'week') {
      const m = D.monday || {}, wk = D.week || {};
      const lines = [...(m.meta || []).map(t => ['Meta', t]), ...(m.google || []).map(t => ['Google', t]), ...(wk.this_week || []).map(t => ['', t]), ...(STATE.promised || []).filter(x => x.text && x.on !== false).map(x => ['', x.text])];
      return `${sec('What we are doing this week', m.meta || m.google ? 'The plan the team approved on Monday.' : 'From your weekly report.', lines.length ? `<ol class="lines">${lines.map(([c, t], i) => `<li><i>${i + 1}</i><span>${c ? `<small class="muted">${c}</small><br>` : ''}${esc(t)}</span></li>`).join('')}</ol>` : empty('Say it on the call; the notes catch it.'))}
        ${(m.send || []).length ? sec('What we are sending you', '', `<ul class="chk">${m.send.map(t => `<li><span class="tx">${esc(t)}</span></li>`).join('')}</ul>`) : ''}`;
    }
    return null;
  }
  function clientStep(id) {
    if (layout2()) { const h2 = clientStep2(id); if (h2 != null) return h2; }
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
    return [{ id: 'news', name: 'What\'s new', mins: L ? 5 : 2 }, { id: 'sold', name: 'What sold', mins: L ? 10 : 5 }, ...(layout2() && !L ? [{ id: 'review', name: 'Waiting on a decision', mins: 6 }] : []), { id: 'want', name: 'What we want', mins: L ? 10 : 6 },
      { id: 'qs', name: L ? 'Guest and questions' : 'Questions', mins: L ? 15 : 5 }, { id: 'ask', name: 'One ask', mins: L ? 5 : 2 }];
  }
  function creatorStep(id) {
    if (id === 'review') {
      const X = bx(D.act_id);
      if (X.rv == null && !X.rvLoading) { X.rvLoading = true; H.apiAH(`/api/trybe/review?act=${encodeURIComponent(D.act_id)}`).then(v => { X.rv = v; }, e => { X.rv = { error: e.message }; }).finally(() => { X.rvLoading = false; paintMain(); }); }
      return sec('Waiting on a decision', 'Every video submitted in Trybe. Run it, ask for changes (say what), or say no. It goes straight to Trybe and the creator sees it.', rvList(D.act_id, X));
    }
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
    $('#main').innerHTML = `${headHtml('Creator meeting')}<div class="v2 cs" id="csRoot">${sec('Which brand\'s creators are on the call', 'Mondays, Central time', `<div class="picker">${(list || []).map(b => `<button type="button" data-pick="${esc(b.act_id)}">${esc(b.name)}${b.when ? `<br><small style="color:var(--muted);font-weight:500">${esc(b.when)}</small>` : ''}</button>`).join('') || empty('No creator programs in Locus.')}</div>`)}</div>`;
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
    if (KIND === 'client') return clientSteps();
    if (KIND === 'creator') return creatorSteps();
    return kickList().map(c => ({ id: c.id, name: `${c.brand} #${c.num}`, mins: 4, c }));
  }
  const TITLE = { monday: 'Monday meeting', client: 'Client meeting', kickoff: 'Creative kickoff', creator: 'Creator meeting' };
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
    if (KIND === 'monday') return s.id === 'open' ? (layout2() ? scoreboard2() : mondayOpen()) : s.id === 'agency' ? agency2() : s.id === 'close' ? mondayClose() : (layout2() ? mondayBrand2 : mondayBrand)(D.brands.find(b => b.act_id === s.id));
    if (KIND === 'client') return clientStep(s.id);
    if (KIND === 'creator') return creatorStep(s.id);
    loadCard(s.id);
    return kickStep(s.c);
  }
  function whereHtml() {
    const st = steps(), s = st[POS];
    if (!s) return '';
    const where = KIND === 'monday' ? (s.id === 'open' ? `<b>${layout2() ? 'Scoreboard' : 'Start'}</b>` : s.id === 'agency' ? '<b>Agency</b>' : s.id === 'close' ? '<b>Finish</b>' : `<b>${esc(s.name)}</b> · brand ${POS} of ${mondayList().length}`) : `<b>${esc(s.name)}</b> · step ${POS + 1} of ${st.length}`;
    return `${where}<span>·</span><span class="cs-clock" id="csClock"></span><span class="cs-time">of ${s.mins} min</span>`;
  }
  /* One sentence of what Finish will do, counted live, on every step. */
  const nextLabel = () => { const n = steps()[POS + 1]; return n ? `Next: ${esc(n.name)} →` : 'Finish'; };
  function willHtml() {
    const list = (parts, tail) => { const p = parts.filter(Boolean); if (!p.length && !tail) return 'Finish will close the call'; if (tail) return `Finish will ${p.length ? 'make ' + p.join(', ') + ' and ' : ''}${tail}`; return 'Finish will make ' + (p.length > 1 ? p.slice(0, -1).join(', ') + ' and ' + p[p.length - 1] : p[0]); };
    if (KIND === 'monday' && layout2()) { let votes = 0; for (const s of Object.values(STATE.brands || {})) for (const k of ['batches', 'gplan', 'eplan']) votes += (s[k] || []).filter(x => x && x.text && x.vote).length; const c = mondayCounts(); return list([c.jobs ? `<b>${plural(c.jobs, 'task')}</b>` : '', c.asks ? `<b>${plural(c.asks, 'request')}</b>` : ''], `post the recaps${votes ? ` with <b>${plural(votes, 'plan line')}</b> you voted on` : ''}`); }
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
    /* Round 7: the client and creator meetings use the Monday page's sizes in layout 2 (Cole: "the spacing and sizing on
       the client meeting is off"); the big-slide deck stays only for the old layout. */
    host.innerHTML = `${headHtml(title)}<div class="v2 cs${(KIND === 'client' || KIND === 'creator') && !layout2() ? ' cs-deck' : ''}" id="csRoot">
      ${finished ? finishedHtml() : `<nav class="cs-steps" id="csSteps" aria-label="Steps">${stepsHtml()}</nav>
        <div id="csMain" style="display:flex;flex-direction:column;gap:16px">${mainHtml()}</div>
        <div class="cs-bar"><div class="r"><button type="button" class="btn" id="csPrev" ${POS === 0 ? 'disabled' : ''}>← Back</button><span class="where" id="csWhere">${whereHtml()}</span><span class="cs-saved" id="csSaved"></span><button type="button" class="btn pri" id="csNext" ${last ? 'data-finish' : ''}>${nextLabel()}</button></div><div class="cs-will" id="csWill">${willHtml()}</div></div>`}
    </div>`;
    acts(`${KIND !== 'kickoff' ? `<button type="button" class="btn" id="csLayout" title="The Nov 9 layout: channels, the Ads page's cards, plan votes, Trybe">${layout2() ? 'Old layout' : 'New layout'}</button>` : ''}<button type="button" class="btn" id="csPresent">${document.body.classList.contains('cs-present') ? 'Exit (Esc)' : 'Present'}</button>`);
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
    if (KIND === 'monday') { if (name === 'agency') return (STATE.agency = STATE.agency || []); const st = brandState(act); st.edited = true; return (st[name] = st[name] || []); }
    return (STATE[name] = STATE[name] || []);
  }
  /* Anything that has to leave the call opens in a NEW TAB, so the call stays where it is (Cole, 2026-11-03). */
  const newTab = (open, act) => window.open(`${location.pathname}?open=${encodeURIComponent(open)}${act ? `&act=${encodeURIComponent(act)}` : ''}`, '_blank', 'noopener');
  function openInAds(act) { newTab('adcreative', act); }
  function wireMain() {
    const root = $('#csMain'); if (!root) return;
    $$('textarea', root).forEach(t => { grow(t); t.addEventListener('input', () => grow(t)); });
    $$('[data-ad]:not(.g)', root).forEach(b => b.onclick = () => {
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
    wireLayout2(root);
    $$('[data-finish]', root).forEach(wireFinish);
  }
  function wireLayout2(root) {
    const brandOf = act => (D.brands || []).find(b => b.act_id === act) || (KIND === 'client' && D.act_id === act ? clientBrand() : undefined);
    const repaint = () => { const y = window.scrollY; paintMain(); window.scrollTo(0, y); };
    const st = el => bx(el.dataset.act);
    $$('[data-jump]', root).forEach(bt => bt.onclick = () => { const el = document.getElementById(bt.dataset.jump); if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' }); });
    $$('[data-goto]', root).forEach(tr => tr.onclick = () => { const i = steps().findIndex(s => s.id === tr.dataset.goto); if (i >= 0) go(i); });
    $$('[data-msort]', root).forEach(b => b.onclick = e => { e.stopPropagation(); st(b).sort = b.dataset.msort; repaint(); });
    $$('[data-gsort]', root).forEach(b => b.onclick = e => { e.stopPropagation(); st(b).gsort = b.dataset.gsort; repaint(); });
    $$('[data-esort]', root).forEach(b => b.onclick = e => { e.stopPropagation(); st(b).esort = b.dataset.esort; repaint(); });
    $$('[data-admore]', root).forEach(b => b.onclick = () => { const X = bx(b.dataset.admore); X.more = !X.more; repaint(); });
    $$('[data-rvall]', root).forEach(b => b.onclick = () => { const X = bx(b.dataset.rvall); X.rvAll = !X.rvAll; repaint(); });
    $$('[data-mcamp]', root).forEach(tr => tr.onclick = e => { if (e.target.closest('button,input')) return; const X = st(tr); X.open[tr.dataset.mcamp] = !X.open[tr.dataset.mcamp]; repaint(); });
    $$('[data-mset]', root).forEach(tr => tr.onclick = e => { if (e.target.closest('button,input')) return; const X = st(tr); X.sopen[tr.dataset.mset] = !X.sopen[tr.dataset.mset]; repaint(); });
    $$('[data-gcamp]', root).forEach(tr => tr.onclick = e => { if (e.target.closest('button,input')) return; const X = st(tr), id = tr.dataset.gcamp; X.gopen[id] = !X.gopen[id]; repaint(); const br = brandOf(tr.dataset.act); if (X.gopen[id] && br && !X.gdet) loadGoogleDetail(br).then(repaint); });
    $$('[data-mcols]', root).forEach(b => b.onclick = e => { e.stopPropagation(); const X = bx(b.dataset.mcols), on = X.cols || MCOLS.filter(c => c[2]).map(c => c[0]); listMenu(b, 'Columns', MCOLS.map(([k, l]) => ({ v: k, label: l, on: on.includes(k), small: on.includes(k) ? 'shown' : 'add' })), v => { const cur = new Set(X.cols || MCOLS.filter(c => c[2]).map(c => c[0])); if (cur.has(v)) cur.delete(v); else cur.add(v); X.cols = MCOLS.map(c => c[0]).filter(k => cur.has(k)); repaint(); }); });
    /* Dropdowns are Locus menus, not the browser's (Cole: "they look like Windows drop downs"). */
    const setModel = (act, v) => { const X = bx(act); if (X.model === v) return; X.model = v; X.ads = null; X.paid = null; repaint(); const br = brandOf(act); if (br) loadBrand2(br, ['ads', 'paid']); };
    $$('[data-dd]', root).forEach(b => b.onclick = e => {
      e.stopPropagation(); const X = bx(b.dataset.act), k = b.dataset.dd;
      const opts = k === 'model' ? MODELS.map(([v, l]) => ({ v, label: l, on: X.model === v })) : ADSORT.map(([v, l]) => ({ v, label: l, on: X.adsort === v }));
      listMenu(b, k === 'model' ? 'Attribution' : 'Sort the ads by', opts, v => { if (k === 'model') setModel(b.dataset.act, v); else { X.adsort = v; repaint(); } });
    });
    /* A change in Last week's changes opens what it changed: the ad's card, or its campaign / ad set row. */
    $$('[data-chg]', root).forEach(li => li.onclick = () => {
      const br = brandOf(li.dataset.act), X = bx(li.dataset.act), a = (X.chg || [])[+li.dataset.chg]; if (!br || !a) return;
      const t = changeTarget(br, a); if (!t) return;
      const M = X.ads && !X.ads.error ? X.ads : null;
      if (t.kind === 'ad' && M) { const row = (M.ads || []).find(r => String(r.id) === String(t.id)); if (row) return M.open(row); }
      if (t.kind === 'adid' && window.V2 && V2.playAd) return V2.playAd({ id: t.id, act: br.act_id, name: t.name || 'Ad' }, H);
      const camps = $$('[data-mcamp], [data-mset]', root).find(tr => tr.textContent.includes(t.name || '\u0000'));
      if (camps) { camps.scrollIntoView({ behavior: 'smooth', block: 'center' }); camps.classList.add('cs-flash'); setTimeout(() => camps.classList.remove('cs-flash'), 1600); return; }
      toast(`"${t.name}" did not spend last week, so there is no card for it. It is in Ads Manager and the Change Log.`);
    });
    $$('[data-bud]', root).forEach(b => b.onclick = async e => {
      e.stopPropagation();
      const br = brandOf(b.dataset.act); if (!br) return;
      const cur = +b.dataset.v, inp = document.createElement('input'); inp.type = 'text'; inp.inputMode = 'decimal'; inp.value = String(cur); inp.className = 'cs-budin'; inp.setAttribute('aria-label', 'New daily budget');
      b.replaceWith(inp); inp.focus(); inp.select();
      const done = async ok => { const v = +String(inp.value).replace(/[^0-9.]/g, ''); if (!ok || !(v > 0) || v === cur) { repaint(); return; } await metaChange(br, { platform: b.dataset.plat, kind: 'budget', level: b.dataset.level, object: b.dataset.bud, amount: v, name: b.dataset.name }); repaint(); };
      inp.onkeydown = ev => { if (ev.key === 'Enter') { ev.preventDefault(); done(true); } if (ev.key === 'Escape') done(false); };
      inp.onblur = () => done(true);
    });
    $$('[data-sw]', root).forEach(b => b.onclick = e => { e.stopPropagation(); const br = brandOf(b.dataset.act); if (br) metaChange(br, { platform: b.dataset.plat, kind: b.dataset.on === '1' ? 'pause' : 'resume', level: b.dataset.level, object: b.dataset.sw, name: b.dataset.name }); });
    $$('[data-adrow]', root).forEach(el => el.onclick = () => {
      const X = bx(el.dataset.act), M = X.ads, row = M && !M.error && (M.ads || []).find(a => String(a.id) === String(el.dataset.adrow));
      if (row) M.open(row); else if (window.V2 && V2.playAd) V2.playAd({ id: el.dataset.adrow, act: el.dataset.act, name: el.querySelector('.n') ? el.querySelector('.n').textContent : 'Ad' }, H);
    });
    $$('[data-clip2]', root).forEach(b => b.onclick = async () => {
      const sub = b.dataset.clip2; if (!sub || b.dataset.playing) return; b.dataset.playing = '1'; const th = $('.th', b); if (th) th.textContent = 'Loading';
      try { const r = await H.apiAH(`/api/calls/clip?act=${encodeURIComponent(b.dataset.act)}&sub=${encodeURIComponent(sub)}`); if (!r || !r.url) throw new Error((r && r.error) || 'No video.'); if (th) th.outerHTML = `<video class="vid" src="${esc(r.url)}" controls autoplay playsinline></video>`; }
      catch (e) { delete b.dataset.playing; if (th) th.textContent = 'Did not play'; toast(e.message); }
    });
    /* the plan: Yes / Changes / No, a note on Changes */
    $$('.cs-plan [data-vote]', root).forEach(b => b.onclick = () => { const row = b.closest('.row'), list = row.closest('[data-list]'), arr = listOf(list.dataset.list, list.dataset.act), x = arr[+row.dataset.i]; if (!x) return; x.vote = x.vote === b.dataset.vote ? '' : b.dataset.vote; save(); repaint(); });
    $$('[data-pnote]', root).forEach(t => t.oninput = () => { const arr = listOf(t.dataset.key, t.dataset.act), x = arr[+t.dataset.pnote]; if (x) { x.note = t.value; save(); } });
    /* Trybe: the decision goes to Trybe (the same route as Ads > Trybe) */
    const rvOf = el => { const s = brandState(el.dataset.act); s.rv = s.rv || {}; return (s.rv[el.dataset.rvd || el.dataset.rvnote || el.dataset.rvsend] = s.rv[el.dataset.rvd || el.dataset.rvnote || el.dataset.rvsend] || {}); };
    const sendRv = async (el, v) => {
      try { const r = await post('/api/trybe/review', { act: el.dataset.act, id: el.dataset.rvd || el.dataset.rvsend, decision: v.d, comment: v.note || '' }); if (r && r.error) throw new Error(r.error); v.done = v.d === 'approve' ? 'Approved in Trybe' : v.d === 'changes' ? 'Sent back for changes' : 'Rejected in Trybe'; save(); repaint(); }
      catch (e) { toast(e.message); }
    };
    $$('[data-rvd]', root).forEach(b => b.onclick = () => { const v = rvOf(b); v.d = b.dataset.v; save(); if (v.d === 'approve') sendRv(b, v); else repaint(); });
    $$('[data-rvnote]', root).forEach(t => t.oninput = () => { rvOf(t).note = t.value; save(); });
    $$('[data-rvsend]', root).forEach(b => b.onclick = () => { const v = rvOf(b); if (!String(v.note || '').trim()) return toast('Say what to change so the creator knows.'); sendRv(b, v); });
    $$('[data-creatorcall]', root).forEach(b => b.onclick = () => open(H, 'creator', b.dataset.creatorcall));
    const s = steps()[POS], b = KIND === 'monday' && s ? brandOf(s.id) : KIND === 'client' && layout2() && s && s.id === 'page' ? clientBrand() : null;
    if (b && bx(b.act_id).ads && bx(b.act_id).ads.wire) bx(b.act_id).ads.wire(root);
    if (KIND === 'client' && CX.ads && CX.ads.wire) CX.ads.wire(root);
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
    const lay = $('#csLayout'); if (lay) lay.onclick = () => { try { localStorage.setItem(LAYOUT_KEY, layout2() ? '1' : '2'); } catch {} STATE.layout = layout2() ? 2 : 1; save(); paint(); };
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
    $('#main').innerHTML = `${headHtml('Client meeting')}<div class="v2 cs" id="csRoot">${sec('Which client is on the call', '', `<div class="picker">${brands.map(b => `<button type="button" data-pick="${esc(b.act_id)}">${esc(b.name)}</button>`).join('') || empty('No brands.')}</div>`)}</div>`;
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
      try { const q = new URLSearchParams(location.search).get('layout'); if (q === '2' || q === '1') localStorage.setItem(LAYOUT_KEY, q); } catch {}
      if (KIND === 'monday' && STATE.layout !== (layout2() ? 2 : 1)) { STATE.layout = layout2() ? 2 : 1; try { await H.apiAH('/api/calls/state', { method: 'PUT', body: JSON.stringify({ id: D.call.id, state: STATE }) }); } catch {} }
      /* A leak sent here from Home > Leaks ("Put it on the call"): one promised line, saved at once, never twice. */
      const add = window.CCALL_ADD; window.CCALL_ADD = null;
      if (add && KIND === 'client' && add.act === a && add.text) {
        STATE.promised = STATE.promised || [];
        if (!STATE.promised.some(x => x && x.text === add.text)) { STATE.promised.push({ text: add.text, owner: '', due: '', source: add.source || '', source_id: add.source_id || '' }); try { await H.apiAH('/api/calls/state', { method: 'PUT', body: JSON.stringify({ id: D.call.id, state: STATE }) }); } catch {} }
        POS = Math.max(0, clientSteps().findIndex(s => s.id === 'week'));
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

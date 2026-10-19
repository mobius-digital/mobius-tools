/* THE CALL SCREENS (2026-10-19; second pass the same day after Cole's audit: "it looks squished", "I'm confused on what
 * everything is", "Radhesh's read?", "how are you choosing winners?", "Present has no exit, I can't scroll").
 * The screen Cole shares on a call and walks top to bottom: the Monday call (every brand, red first), a client call (one
 * brand, the client watching) and the creative kickoff (the strategist walks the design team through each brief).
 *
 * Layout: one column of roomy section cards, the steps as a row of pills on top, a sticky bar at the bottom (Back, where
 * you are, the clock, Next). Every section says in plain words where it comes from:
 *   Automatic  = Locus pulled it in (the weekly report, Tasks, Requests, the Calendar, Production)
 *   From Slack = the team's own Slack posts, shown as written (never rewritten)
 *   You add    = typed on the call; marked Optional when the call can skip it
 * Present = full screen with the Locus menus hidden; Exit or Esc leaves it; the page scrolls.
 * What is typed autosaves to the call row (account-health callscreen.js, p_call). Finish sends it where it lives.
 * Opened from Work > Calls ("Run a call"), or ?open=calls&call=monday|client|kickoff[&act=].
 * Classic script, own closure. window.CallScreen = { open(host, kind, act) }; host = the Calls tab's {S, api, apiAH, show}.
 */
(() => {
  let H = null, D = null, KIND = 'monday', POS = 0, STATE = {}, SEV = {}, SAVE_T = null, CLOCK = null, CLOCK_START = 0, CLOCK_FOR = 0, CARD = {}, BUSY = false, SHOW_OLD = false;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const dt = iso => new Date(String(iso).slice(0, 10) + 'T12:00:00Z');
  const md = iso => iso ? dt(iso).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' }) : '';
  const short = iso => iso ? dt(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' }) : '';
  const clock = iso => { try { return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'America/Chicago' }); } catch { return ''; } };
  const money = n => n == null ? '–' : '$' + (Math.abs(n) >= 10000 ? (Math.round(n / 100) / 10).toLocaleString('en-US') + 'K' : Math.round(n).toLocaleString('en-US'));
  const x2 = n => n == null ? '–' : (+n).toFixed(2).replace(/0$/, '') + 'x';
  const pct = (a, b) => (a == null || !b) ? null : Math.round((a / b - 1) * 100);
  const plural = (n, w, ws) => `${n} ${n === 1 ? w : (ws || w + 's')}`;
  const firstName = s => String(s || '').split(/[@\s._]/)[0].replace(/^./, c => c.toUpperCase());
  const post = (path, body) => H.apiAH(path, { method: 'POST', body: JSON.stringify(body) });
  const toast = msg => { const t = document.createElement('div'); t.setAttribute('role', 'status'); t.className = 'cs-toast'; t.textContent = msg; document.body.appendChild(t); setTimeout(() => t.remove(), 4500); };
  const ROLE = { Cole: 'Owner', Ahsan: 'Strategist', Noma: 'Strategist', William: 'Designer', Ravo: 'Video', Radhesh: 'Google', Hamza: 'Amazon' };
  /* Slack names are full names ("Nomaqhawe Molife"); the team calls people by the roster's first names. */
  const teamName = by => { const f = firstName(by); return Object.keys(ROLE).find(k => f.toLowerCase().startsWith(k.toLowerCase())) || f; };
  const CHAN = { meta: 'Meta', google: 'Google', tiktok: 'TikTok', pinterest: 'Pinterest', amazon: 'Amazon', email: 'Email' };

  /* ---------- a section card and its "where this comes from" line ---------- */
  const TAG = { auto: 'Automatic', slack: 'From Slack', you: 'You add' };
  function sec(title, kind, from, body, { optional = false } = {}) {
    return `<section class="cs-sec"><header><h3>${esc(title)}</h3><p class="cs-from"><span class="cs-tag ${kind}">${TAG[kind]}</span>${optional ? '<span class="cs-tag opt">Optional</span>' : ''}<span>${from}</span></p></header><div class="cs-body">${body}</div></section>`;
  }
  const empty = t => `<p class="cs-empty">${t}</p>`;

  /* ---------- look (Locus tokens only, both themes) ---------- */
  function css() {
    if (document.getElementById('cscss')) return;
    const st = document.createElement('style'); st.id = 'cscss';
    st.textContent = `
      .cs{max-width:1080px;margin:0 auto;display:flex;flex-direction:column;gap:20px;min-width:0;padding-bottom:12px}
      .cs .cs-head{display:flex;align-items:flex-start;gap:14px;flex-wrap:wrap}
      .cs .cs-head .t{flex:1;min-width:240px}
      .cs .cs-back{font-size:13px;color:var(--brand-ink);font-weight:600;margin-bottom:6px;display:inline-block}
      .cs .cs-head h1{font-size:28px;font-weight:700;margin:0;color:var(--ink);letter-spacing:-.01em}
      .cs .cs-who{color:var(--ink-2);font-size:14px;margin:6px 0 0;line-height:1.5}
      .cs .btn2{height:36px;padding:0 14px;border-radius:9px;border:1px solid var(--line-strong);background:var(--surface);font-weight:600;font-size:13.5px;display:inline-flex;align-items:center;gap:6px;white-space:nowrap;color:var(--ink);text-decoration:none}
      .cs .btn2:hover{border-color:var(--ink-2)}
      .cs .btn2.pri{background:var(--brand-ink);border-color:var(--brand-ink);color:#fff}
      .cs .btn2.sm{height:30px;padding:0 11px;font-size:12.5px}
      .cs .btn2:disabled{opacity:.55;cursor:default}
      .cs .cs-steps{display:flex;gap:8px;overflow-x:auto;padding:2px 2px 6px;scrollbar-width:thin}
      .cs .cs-steps button{flex:0 0 auto;display:inline-flex;align-items:center;gap:8px;height:36px;padding:0 14px;border-radius:999px;border:1px solid var(--line);background:var(--surface);font-size:13.5px;font-weight:600;color:var(--ink-2)}
      .cs .cs-steps button small{font-weight:500;color:var(--muted);font-size:12px}
      .cs .cs-steps button[aria-current="true"]{background:var(--ink);color:var(--surface);border-color:var(--ink)}
      .cs .cs-steps button[aria-current="true"] small{color:var(--surface);opacity:.75}
      .cs .cs-steps button.done{color:var(--muted)}
      .cs .cs-steps button.done::before{content:'✓';color:var(--good);font-weight:700}
      .cs .dot{width:9px;height:9px;border-radius:50%;flex:0 0 9px;background:var(--line-strong)}
      .cs .dot.bad{background:var(--bad)}.cs .dot.warn{background:var(--warn-on)}.cs .dot.good{background:var(--good)}
      .cs .cs-title{display:flex;align-items:baseline;gap:12px;flex-wrap:wrap}
      .cs .cs-title h2{font-size:30px;font-weight:700;margin:0;letter-spacing:-.01em}
      .cs .cs-title p{margin:0;color:var(--ink-2);font-size:14.5px}
      .cs .pill{display:inline-block;font-size:12.5px;font-weight:600;padding:3px 10px;border-radius:999px;background:var(--bg);border:1px solid var(--line);color:var(--ink-2)}
      .cs .pill.good{background:var(--good-bg);color:var(--good);border-color:transparent}
      .cs .cs-sec{background:var(--surface);border:1px solid var(--line);border-radius:14px;padding:22px 26px;display:flex;flex-direction:column;gap:16px;min-width:0}
      .cs .cs-sec header h3{font-size:19px;font-weight:700;margin:0;color:var(--ink)}
      .cs .cs-from{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin:6px 0 0;font-size:13.5px;color:var(--ink-2);line-height:1.5}
      .cs .cs-tag{font-size:11.5px;font-weight:700;padding:2px 9px;border-radius:999px;white-space:nowrap}
      .cs .cs-tag.auto{background:var(--good-bg);color:var(--good)}
      .cs .cs-tag.slack{background:var(--brand-soft);color:var(--brand-ink)}
      .cs .cs-tag.you{background:var(--warn-bg);color:var(--warn)}
      .cs .cs-tag.opt{background:var(--bg);color:var(--muted);border:1px solid var(--line)}
      .cs .cs-body{display:flex;flex-direction:column;gap:14px;min-width:0}
      .cs .cs-empty{margin:0;color:var(--muted);font-size:14px}
      .cs .cs-sub{font-size:12px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--muted);margin:4px 0 -4px}
      .cs .nums{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px}
      .cs .num{background:var(--bg);border:1px solid var(--line);border-radius:12px;padding:14px 16px;min-width:0}
      .cs .num b{display:block;font-size:12px;letter-spacing:.05em;text-transform:uppercase;color:var(--muted);font-weight:600}
      .cs .num strong{display:block;font-size:26px;font-weight:700;font-variant-numeric:tabular-nums;margin-top:4px;color:var(--ink)}
      .cs .num span{font-size:13px;font-variant-numeric:tabular-nums;color:var(--muted)}
      .cs .up{color:var(--good)!important}.cs .down{color:var(--bad)!important}
      .cs table.cs-tbl{width:100%;border-collapse:collapse;font-size:14px;font-variant-numeric:tabular-nums}
      .cs .cs-tbl th{text-align:right;font-size:12px;font-weight:600;color:var(--muted);padding:0 10px 8px;letter-spacing:.03em}
      .cs .cs-tbl th:first-child,.cs .cs-tbl td:first-child{text-align:left;padding-left:0}
      .cs .cs-tbl td{text-align:right;padding:10px;border-top:1px solid var(--line)}
      .cs .cs-tbl td:first-child{font-weight:600}
      .cs .cs-tbl small{font-size:12px;margin-left:4px}
      .cs .cs-tw{overflow-x:auto}
      .cs .ads{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px}
      .cs .ad{border:1px solid var(--line);border-radius:12px;overflow:hidden;background:var(--bg);min-width:0;display:flex;flex-direction:column;text-align:left;padding:0;cursor:pointer;font:inherit;color:inherit}
      .cs .ad:hover{border-color:var(--brand)}
      .cs .ad .th{aspect-ratio:4/5;max-height:250px;width:100%;background:var(--line) center/cover no-repeat;position:relative;display:grid;place-items:center;font-size:13px;color:var(--muted);text-align:center;padding:10px}
      .cs .ad .play{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);width:46px;height:46px;border-radius:50%;background:rgba(0,0,0,.55);color:#fff;display:grid;place-items:center;font-size:18px}
      .cs .ad .m{padding:10px 12px 4px;font-size:14px;display:flex;justify-content:space-between;gap:6px;font-variant-numeric:tabular-nums}
      .cs .ad .m b{font-weight:700}
      .cs .ad .n{padding:0 12px 10px;font-size:12.5px;color:var(--ink-2);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      .cs .ad.win{border-color:color-mix(in srgb,var(--good) 50%,var(--line))}
      .cs .ad.lose{border-color:color-mix(in srgb,var(--bad) 45%,var(--line))}
      .cs .rule{font-size:13.5px;color:var(--ink-2);line-height:1.55;margin:0}
      .cs .chk{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:8px}
      .cs .chk li{display:flex;gap:12px;align-items:flex-start;padding:12px 14px;border:1px solid var(--line);border-radius:10px;background:var(--bg);font-size:14.5px;line-height:1.45}
      .cs .chk li input[type=checkbox]{margin-top:3px;accent-color:var(--brand-ink);width:18px;height:18px;flex:0 0 18px}
      .cs .chk li.off .tx{color:var(--muted);text-decoration:line-through}
      .cs .chk li .tx{flex:1;min-width:0;overflow-wrap:anywhere}
      .cs .chk li .o{font-size:12.5px;color:var(--muted);white-space:nowrap}
      .cs .chk li .o.late{color:var(--bad);font-weight:600}
      .cs details.cs-more summary{cursor:pointer;color:var(--ink-2);font-size:13.5px;font-weight:600}
      .cs details.cs-more[open] summary{margin-bottom:10px}
      .cs .posts{display:flex;flex-direction:column;gap:12px}
      .cs .slk{display:grid;grid-template-columns:36px minmax(0,1fr);gap:12px;padding:14px 16px;border:1px solid var(--line);border-radius:12px;background:var(--bg)}
      .cs .slk .av{width:36px;height:36px;border-radius:9px;background:var(--brand-soft);color:var(--brand-ink);display:grid;place-items:center;font-weight:700}
      .cs .slk .who{font-size:14px;font-weight:700;color:var(--ink)}
      .cs .slk .who span{font-weight:500;color:var(--muted);font-size:12.5px;margin-left:6px}
      .cs .slk .txt{margin-top:4px;font-size:14.5px;line-height:1.55;color:var(--ink);white-space:pre-wrap;overflow-wrap:anywhere}
      .cs .slk .txt.clamp{max-height:9.5em;overflow:hidden;-webkit-mask-image:linear-gradient(#000 70%,transparent);mask-image:linear-gradient(#000 70%,transparent)}
      .cs .slk .txt a{color:var(--brand-ink);font-weight:600}
      .cs .slk .more{margin-top:6px;font-size:13px;font-weight:600;color:var(--brand-ink)}
      .cs textarea,.cs input[type=text],.cs input[type=date],.cs select{width:100%;font:inherit;font-size:14.5px;color:var(--ink);background:var(--surface);border:1px solid var(--line-strong);border-radius:10px;padding:10px 12px}
      .cs textarea{resize:none;min-height:80px;line-height:1.5;overflow:hidden}
      .cs textarea:focus,.cs input:focus,.cs select:focus{outline:2px solid var(--brand);outline-offset:1px}
      .cs ::placeholder{color:var(--muted);opacity:.9}
      .cs .rows{display:flex;flex-direction:column;gap:8px}
      .cs .row{display:grid;grid-template-columns:22px minmax(0,1fr) 140px 150px 30px;gap:8px;align-items:center}
      .cs .row.asks{grid-template-columns:22px minmax(0,1fr) 150px 30px}
      .cs .row input[type=checkbox]{accent-color:var(--brand-ink);width:18px;height:18px}
      .cs .row.off input[type=text]{color:var(--muted);text-decoration:line-through}
      .cs .row .x{color:var(--muted);font-size:20px;line-height:1;height:30px}
      .cs .row .x:hover{color:var(--bad)}
      .cs .rowhd{display:grid;grid-template-columns:22px minmax(0,1fr) 140px 150px 30px;gap:8px;font-size:12px;letter-spacing:.05em;text-transform:uppercase;color:var(--muted);font-weight:600}
      .cs .add{color:var(--brand-ink);font-weight:600;font-size:14px;align-self:flex-start;padding:2px 0}
      .cs .warnline{font-size:14px;color:var(--warn);background:var(--warn-bg);border-radius:10px;padding:10px 14px}
      .cs .out{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:12px}
      .cs .out div{border:1px solid var(--line);border-radius:12px;padding:14px 16px;background:var(--bg);font-size:14px;color:var(--ink-2);line-height:1.5}
      .cs .out b{display:block;font-size:22px;color:var(--ink);font-weight:700}
      .cs .cs-bar{position:sticky;bottom:0;z-index:5;display:flex;align-items:center;gap:12px;flex-wrap:wrap;padding:12px 16px;background:var(--surface);border:1px solid var(--line);border-radius:14px;box-shadow:0 -6px 24px rgba(0,0,0,.06);margin-top:4px}
      .cs .cs-bar .where{flex:1;min-width:160px;font-size:14px;color:var(--ink-2)}
      .cs .cs-bar .where b{color:var(--ink)}
      .cs .cs-clock{font-variant-numeric:tabular-nums;font-size:14px;padding:6px 12px;border-radius:9px;background:var(--bg);border:1px solid var(--line);font-weight:700}
      .cs .cs-clock.over{background:var(--bad-bg);color:var(--bad);border-color:transparent}
      .cs .cs-saved{font-size:12.5px;color:var(--muted)}
      .cs .brief{border:1px solid var(--line);border-radius:12px;padding:18px 20px;background:var(--bg);font-size:15px;line-height:1.6;max-height:640px;overflow:auto}
      .cs .brief h1,.cs .brief h2,.cs .brief h3{font-size:16px;margin:12px 0 4px}
      .cs .brief p{margin:0 0 10px}
      .cs .brief ol,.cs .brief ul{margin:0 0 10px 22px}
      .cs .brief img,.cs .brief video{max-width:100%;max-height:320px;border-radius:8px;display:block;margin:8px 0}
      .cs .brief [data-ph]{color:var(--muted);font-style:italic}
      .cs .deal{display:grid;grid-template-columns:110px minmax(0,1fr) 170px 170px;gap:12px;align-items:end}
      .cs .deal label{display:flex;flex-direction:column;gap:6px;font-size:12px;color:var(--muted);font-weight:600;letter-spacing:.04em;text-transform:uppercase}
      .cs .picker{display:grid;grid-template-columns:repeat(auto-fill,minmax(190px,1fr));gap:10px}
      .cs .picker button{border:1px solid var(--line);background:var(--surface);border-radius:12px;padding:16px;text-align:left;font-weight:600;font-size:15px}
      .cs .picker button:hover{border-color:var(--brand)}
      .cs-toast{position:fixed;left:50%;bottom:24px;transform:translateX(-50%);max-width:min(560px,calc(100vw - 32px));background:var(--ink);color:var(--surface);padding:10px 16px;border-radius:12px;font-size:13.5px;z-index:9999;box-shadow:0 8px 30px rgba(0,0,0,.25)}
      body.cs-present .side,body.cs-present .topbar,body.cs-present #tabbar,body.cs-present #v2seg,body.cs-present #subtabs,body.cs-present footer,body.cs-present #navToggle{display:none!important}
      body.cs-present .app{grid-template-columns:1fr!important}
      body.cs-present main{padding-top:24px!important}
      body.cs-present .cs{max-width:1180px}
      body.cs-present .cs .cs-back{display:none}
      @media (max-width:760px){.cs .cs-sec{padding:16px}.cs .ads{grid-template-columns:repeat(2,minmax(0,1fr))}.cs .row,.cs .rowhd{grid-template-columns:22px minmax(0,1fr) 30px}.cs .row>*:nth-child(3),.cs .row>*:nth-child(4),.cs .rowhd>*:nth-child(3),.cs .rowhd>*:nth-child(4){display:none}.cs .row.asks{grid-template-columns:22px minmax(0,1fr) 30px}.cs .deal{grid-template-columns:1fr 1fr}.cs .chk li{flex-wrap:wrap}.cs .chk li .o{width:100%;padding-left:30px;white-space:normal}.cs .cs-head h1,.cs .cs-title h2{font-size:24px}}
    `;
    document.head.appendChild(st);
  }

  /* ---------- typed state, autosaved ---------- */
  function save() {
    clearTimeout(SAVE_T);
    const s = $('#csSaved'); if (s) s.textContent = 'Saving...';
    SAVE_T = setTimeout(async () => {
      try { await H.apiAH('/api/calls/state', { method: 'PUT', body: JSON.stringify({ id: D.call.id, state: STATE }) }); const t = $('#csSaved'); if (t) t.textContent = 'Saved'; }
      catch (e) { const t = $('#csSaved'); if (t) t.textContent = 'Not saved: ' + e.message; }
    }, 700);
  }
  const brandState = act => { STATE.brands = STATE.brands || {}; return (STATE.brands[act] = STATE.brands[act] || { read: '', batches: [], jobs: [], asks: [] }); };
  const grow = t => { t.style.height = 'auto'; t.style.height = (t.scrollHeight + 2) + 'px'; };

  /* ---------- the clock: per step ---------- */
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

  /* ---------- shared pieces ---------- */
  const teamOpts = (v, blank = 'Who') => `<option value="">${blank}</option>` + (D.team || []).map(n => `<option ${n === v ? 'selected' : ''}>${esc(n)}</option>`).join('');
  const vs = (a, b, lowerBetter) => { const v = pct(a, b); if (v == null) return '<span>nothing to compare with</span>'; const good = lowerBetter ? v <= 0 : v >= 0; return `<span class="${good ? 'up' : 'down'}">${v > 0 ? '+' : ''}${v}% vs the week before</span>`; };
  function numsHtml(r) {
    const t = r.totals || {}, p = r.prior || {}, f = r.plan || {};
    return `<div class="nums">
      <div class="num"><b>Sales</b><strong>${money(t.sales)}</strong>${vs(t.sales, p.sales)}</div>
      <div class="num"><b>Ad spend</b><strong>${money(t.spend)}</strong>${vs(t.spend, p.spend, true)}</div>
      <div class="num"><b>MER</b><strong>${x2(t.mer)}</strong><span class="${f.mer && t.mer != null ? (t.mer >= f.mer ? 'up' : 'down') : ''}">${f.mer ? `goal ${x2(f.mer)}` : p.mer != null ? `${x2(p.mer)} the week before` : ''}</span></div>
      <div class="num"><b>Orders</b><strong>${t.orders != null ? Math.round(t.orders).toLocaleString('en-US') : '–'}</strong>${vs(t.orders, p.orders)}</div>
      ${t.ncpa != null ? `<div class="num"><b>Cost per new customer</b><strong>${money(t.ncpa)}</strong>${vs(t.ncpa, p.ncpa, true)}</div>` : ''}
    </div>`;
  }
  function chanTable(r) {
    const rows = (r.channels || []).filter(c => c.cur && (c.cur.spend || c.cur.revenue));
    if (!rows.length) return '';
    const cell = (a, b, f, lower) => { const v = pct(a, b); return `${f(a)}${v == null ? '' : `<small class="${(lower ? v <= 0 : v >= 0) ? 'up' : 'down'}">${v > 0 ? '+' : ''}${v}%</small>`}`; };
    return `<p class="cs-sub">By channel</p><div class="cs-tw"><table class="cs-tbl"><thead><tr><th>Channel</th><th>Spend</th><th>Sales credited</th><th>ROAS</th></tr></thead><tbody>
      ${rows.map(c => `<tr><td>${esc(CHAN[c.id] || c.label)}</td><td>${c.cur.spend != null ? cell(c.cur.spend, c.prev && c.prev.spend, money, true) : '–'}</td><td>${cell(c.cur.revenue, c.prev && c.prev.revenue, money)}</td><td>${c.cur.roas != null ? x2(c.cur.roas) : '–'}</td></tr>`).join('')}
      </tbody></table></div><p class="rule">Sales credited and ROAS come from Triple Whale (last platform click). The % is the change from the week before.</p>`;
  }
  function adCard(a, cls, act) {
    const th = a.thumb ? `style="background-image:url('${esc(a.thumb)}')"` : '';
    return `<button class="ad ${cls}" data-ad="${esc(a.ad_id)}" data-act="${esc(act)}" data-name="${esc(a.name)}" title="${a.video ? 'Play it' : 'Open it'}"><div class="th" ${th}>${a.thumb ? '' : esc(a.headline || a.name)}${a.video ? '<span class="play">▶</span>' : ''}</div>
      <div class="m"><span>${money(a.spend)} spent</span><b>${a.roas != null ? x2(a.roas) + ' ROAS' : ''}</b></div><div class="n">${esc(a.name)}</div></button>`;
  }
  function adsHtml(r, act) {
    if (!r || !(r.winners || []).length) return '';
    const tw = r.basis === 'tw';
    const rule = tw
      ? `Out of the ${plural(r.pool || 0, 'ad')} that spent at least ${money(r.floor)} last week, the 3 with the best ROAS and the ${r.losers.length || ''} with the worst (Triple Whale). All of them together made ${x2(r.bar)}. Tap an ad to see it.`
      : 'No Triple Whale attribution on this report, so these are the 3 that spent the most. Tap an ad to see it.';
    return `<p class="cs-sub">Best and worst ads</p><p class="rule">${rule}</p>
      <div class="ads">${r.winners.map(a => adCard(a, 'win', act)).join('')}</div>
      ${(r.losers || []).length ? `<div class="ads">${r.losers.map(a => adCard(a, 'lose', act)).join('')}</div>` : ''}
      <div><button class="btn2 sm" data-allads="${esc(act)}">See every ad in Locus</button></div>`;
  }
  function readBody(r, act) {
    if (!r) return empty('No weekly report for this brand yet, so there are no numbers to show.');
    return numsHtml(r) + chanTable(r) + adsHtml(r, act);
  }
  function rowsHtml(arr, asks = false) {
    return arr.map((x, i) => `<div class="row ${x.on === false ? 'off' : ''} ${asks ? 'asks' : ''}" data-i="${i}">
      <input type="checkbox" ${x.on === false ? '' : 'checked'} data-f="on" aria-label="Keep this one" title="Untick to leave it out">
      <input type="text" value="${esc(x.text)}" data-f="text" placeholder="${asks ? 'What we need from them' : 'What to do'}" aria-label="What">
      ${asks ? '' : `<select data-f="owner" aria-label="Who">${teamOpts(x.owner)}</select>`}
      <input type="date" value="${esc(x.due || '')}" data-f="due" aria-label="When">
      <button class="x" data-f="del" aria-label="Remove" title="Remove">×</button></div>`).join('');
  }
  function todoList(open, today, none) {
    const li = it => `<li data-item="${esc(it.id)}"><input type="checkbox" aria-label="Done"><span class="tx">${esc(it.text)}</span><span class="o ${it.due && it.due < today ? 'late' : ''}">${esc(it.owner || 'Nobody')}${it.due ? ` · ${it.due < today ? 'was due ' : 'due '}${short(it.due)}` : ''}</span></li>`;
    const now = open.filter(it => !it.due || it.due <= today), later = open.filter(it => it.due && it.due > today);
    return (now.length ? `<ul class="chk">${now.map(li).join('')}</ul>` : empty(none))
      + (later.length ? `<details class="cs-more"><summary>${plural(later.length, 'more to-do')} due after today</summary><ul class="chk">${later.map(li).join('')}</ul></details>` : '');
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
  function postsHtml(posts) {
    return `<div class="posts">${posts.map((p, i) => { const n = teamName(p.by); const long = String(p.text).length > 520; return `<div class="slk"><div class="av">${esc(n[0] || '?')}</div><div><div class="who">${esc(n)}<span>${ROLE[n] ? esc(ROLE[n]) + ' · ' : ''}${clock(p.at)}</span></div><div class="txt ${long ? 'clamp' : ''}" data-txt="${i}">${slackText(p.text)}</div>${long ? `<button class="more" data-full="${i}">Show all of it</button>` : ''}</div></div>`; }).join('')}</div>`;
  }

  /* ======================= MONDAY ======================= */
  function mondayList() {
    const rank = { bad: 0, warn: 1, undefined: 2, good: 3 };
    return [...D.brands].sort((a, b) => (rank[SEV[a.act_id]] ?? 2) - (rank[SEV[b.act_id]] ?? 2) || a.name.localeCompare(b.name));
  }
  function mondaySteps() { return [{ id: 'open', name: 'Start', mins: 5 }, ...mondayList().map(b => ({ id: b.act_id, name: b.name, sev: SEV[b.act_id], mins: SEV[b.act_id] === 'good' ? 2 : SEV[b.act_id] === 'bad' || SEV[b.act_id] === 'warn' ? 7 : 4 })), { id: 'close', name: 'Wrap up', mins: 5 }]; }
  function strategistOf(b) { const p = (b.posts || []).find(x => ROLE[teamName(x.by)] === 'Strategist'); return p ? teamName(p.by) : 'the strategist'; }
  function mondayBrand(b) {
    const s = brandState(b.act_id), r = b.read, sev = SEV[b.act_id], strat = strategistOf(b), today = D.today;
    const fromSlack = s.batches.some(x => x.from === 'slack');
    const sevLine = sev === 'good' ? '<span class="pill good">On track: 2 minutes</span>' : sev === 'bad' ? '<span class="pill">Needs attention: 7 minutes</span>' : sev === 'warn' ? '<span class="pill">Worth a look: 7 minutes</span>' : '';
    return `<div class="cs-title"><h2>${esc(b.name)}</h2>${sevLine}${r ? `<p>Last week: ${short(r.period_start)} to ${short(r.period_end)}</p>` : ''}</div>
      ${sec('Last week\'s to-dos', 'auto', `Open tasks for ${esc(b.name)} that were due by today, from Tasks. Tick the ones that are done.`, todoList(b.open || [], today, 'Nothing was due. Nothing to tick.'))}
      ${sec('How last week went', 'auto', 'From the weekly report. Every number is compared with the week before.', readBody(r, b.act_id))}
      ${sec('What the team posted in Slack', 'slack', `Each person's Monday post for ${esc(b.name)}, exactly as they wrote it. The strategist covers Meta and creative, Radhesh covers Google, Hamza covers Amazon.`,
        (b.posts || []).length ? postsHtml(b.posts) : empty(`Nobody posted a Monday plan for ${esc(b.name)} yet. Ask ${esc(strat)} to talk it through.`))}
      ${sec('Notes from the call', 'you', 'Anything decided that is not a to-do or a new ad. It goes in the Slack recap for the brand.',
        `<textarea data-read="${esc(b.act_id)}" placeholder="For example: Keep spend flat until the new photos land. Radhesh holds Google budgets this week.">${esc(s.read || '')}</textarea>`, { optional: true })}
      ${sec('New ads to make this week', fromSlack ? 'slack' : 'you', `${fromSlack ? `Pulled from ${esc(strat)}'s Slack post. ` : ''}Agree them here. When you press Finish, each line becomes a numbered brief on Production (and in Asana), ready for the kickoff.`,
        `${s.batches.length ? '<div class="rowhd"><span></span><span>What to make</span><span>Who</span><span>Due</span><span></span></div>' : ''}
        <div class="rows" data-list="batches" data-act="${esc(b.act_id)}">${rowsHtml(s.batches)}</div>
        <button class="add" data-add="batches" data-act="${esc(b.act_id)}">+ Add a batch of ads</button>
        ${(b.making || []).length ? `<details class="cs-more"><summary>Already being made for ${esc(b.name)} (${b.making.length})</summary><ul class="chk">${b.making.map(c => `<li><span class="tx">#${esc(c.num)} ${esc(c.title)}</span><span class="o">${esc({ brief: 'Brief', making: 'Making', review: 'In review' }[c.board] || c.board)}${c.owner ? ' · ' + esc(c.owner) : ''}${c.due ? ' · due ' + short(c.due) : ''}</span></li>`).join('')}</ul></details>` : ''}`)}
      ${sec('New to-dos', 'you', 'Anything someone has to do that is not an ad. Type it the way you would say it and press Enter. Locus works out who and when. They go on Tasks when you press Finish.',
        `<div class="rows" data-list="jobs" data-act="${esc(b.act_id)}">${rowsHtml(s.jobs)}</div>
        <input type="text" data-quick="jobs" data-act="${esc(b.act_id)}" placeholder="For example: Ahsan pause the retargeting ad set Friday">`, { optional: true })}
      ${sec(`What we need from ${b.name}`, 'auto', 'What we already asked them for and are still waiting on, then anything new to ask. New asks go on their Requests page when you press Finish.',
        `<p class="cs-sub">Still waiting on</p>${(b.asks || []).length ? `<ul class="chk">${b.asks.map(a => `<li><span class="tx">${esc(a.title)}</span><span class="o">asked ${short(a.created_at)}</span></li>`).join('')}</ul>` : empty('Nothing. We are not waiting on them for anything.')}
        <p class="cs-sub">Ask for something new (optional)</p>
        <div class="rows" data-list="asks" data-act="${esc(b.act_id)}">${rowsHtml(s.asks, true)}</div>
        <button class="add" data-add="asks" data-act="${esc(b.act_id)}">+ Add an ask</button>`)}`;
  }
  function mondayOpen() {
    STATE.agency = STATE.agency || [];
    if (STATE.theme == null) STATE.theme = D.theme || '';
    return `<div class="cs-title"><h2>Before we go brand by brand</h2><p>5 minutes</p></div>
      ${sec('Anything for every brand this week?', 'you', 'One focus that applies to every client this week. It goes in every brand\'s Slack recap.',
        `<textarea data-theme placeholder="For example: Every brand gets its Black Friday early-bird ads live by Friday.">${esc(STATE.theme)}</textarea>`, { optional: true })}
      ${sec('Agency to-dos still open', 'auto', 'Tasks that are not tied to one brand, from Tasks. Tick the ones that are done.', todoList(D.agency_open || [], D.today, 'Nothing open across brands.'))}
      ${sec('New agency to-dos', 'you', 'Anything for the agency itself. Type it the way you would say it and press Enter.',
        `<div class="rows" data-list="agency" data-act="">${rowsHtml(STATE.agency)}</div>
        <input type="text" data-quick="agency" data-act="" placeholder="For example: Cole send the Black Friday calendar to every client Wednesday">`, { optional: true })}`;
  }
  function mondayCounts() {
    let jobs = (STATE.agency || []).filter(x => x.text).length, briefs = 0, asks = 0;
    for (const [, s] of Object.entries(STATE.brands || {})) {
      jobs += (s.jobs || []).filter(x => x.text).length; briefs += (s.batches || []).filter(x => x.text && x.on !== false).length; asks += (s.asks || []).filter(x => x.text && x.on !== false).length;
    }
    return { jobs, briefs, asks };
  }
  function mondayClose() {
    const c = mondayCounts();
    const lines = mondayList().map(b => { const s = (STATE.brands || {})[b.act_id] || {}; return { b, bt: (s.batches || []).filter(x => x.text && x.on !== false).length, j: (s.jobs || []).filter(x => x.text).length, a: (s.asks || []).filter(x => x.text && x.on !== false).length, n: !!s.read }; }).filter(x => x.bt || x.j || x.a || x.n);
    return `<div class="cs-title"><h2>Wrap up</h2><p>Check it, then press Finish</p></div>
      ${sec('What happens when you press Finish', 'auto', 'Everything typed on this call goes to where the team already works. Nothing needs approving after.',
        `<div class="out">
          <div><b>${c.jobs}</b>to-do${c.jobs === 1 ? '' : 's'} go on Tasks. Slack reminds each person the morning it is due.</div>
          <div><b>${c.briefs}</b>new ad batch${c.briefs === 1 ? '' : 'es'} become numbered briefs on Production and in Asana.</div>
          <div><b>${c.asks}</b>ask${c.asks === 1 ? '' : 's'} go to the client's Requests page and their weekly report.</div>
          <div><b>"This week"</b> lines are written for each client's weekly report from what you agreed.</div>
        </div>
        ${lines.length ? `<ul class="chk">${lines.map(x => `<li><span class="tx"><b>${esc(x.b.name)}</b></span><span class="o">${[x.bt ? plural(x.bt, 'ad batch', 'ad batches') : '', x.j ? plural(x.j, 'to-do') : '', x.a ? plural(x.a, 'ask') : '', x.n ? 'notes' : ''].filter(Boolean).join(', ')}</span></li>`).join('')}</ul>` : empty('Nothing typed yet.')}
        <p class="rule">One recap per brand posts in its Slack channel. Fireflies still records the call; about ten minutes after, anything said but not typed shows up on Calls as "Also said on the call".</p>
        <div><button class="btn2 pri" data-finish ${BUSY ? 'disabled' : ''}>Finish the call</button></div>`)}`;
  }

  /* ======================= CLIENT ======================= */
  const CLIENT_STEPS = [{ id: 'news', name: 'What\'s new with them', mins: 5 }, { id: 'read', name: 'How last week went', mins: 10 }, { id: 'week', name: 'What we\'re working on', mins: 5 }, { id: 'asks', name: 'What we need from them', mins: 5 }, { id: 'coming', name: 'Coming up', mins: 5 }, { id: 'finish', name: 'Wrap up', mins: 2 }];
  function clientStep(id) {
    STATE.asks = STATE.asks || []; STATE.promised = STATE.promised || [];
    const wk = D.week || {}, name = esc(D.name);
    if (id === 'news') return `<div class="cs-title"><h2>What's new with them</h2><p>Let them talk first. 5 minutes.</p></div>
      ${sec('What they told us', 'you', 'Type the main points while they talk. It goes in the Slack recap for the team.',
        `<textarea data-news style="min-height:180px" placeholder="Questions to ask:\n• Anything launching or coming up?\n• Any stock problems?\n• What are customers saying?\n• Anything changed on your side (team, website, prices)?">${esc(STATE.news || '')}</textarea>`, { optional: true })}`;
    if (id === 'read') {
      const per = STATE.period === 'month' && D.month ? 'month' : 'week';
      const r = per === 'month' ? D.month : D.week;
      const label = r ? (r.period === 'monthly' ? dt(r.period_start).toLocaleDateString('en-US', { month: 'long', timeZone: 'UTC' }) : `${short(r.period_start)} to ${short(r.period_end)}`) : '';
      const tog = D.month && D.week ? `<div style="display:flex;gap:8px"><button class="btn2 sm ${per === 'week' ? 'pri' : ''}" data-per="week">Last week</button><button class="btn2 sm ${per === 'month' ? 'pri' : ''}" data-per="month">Last month</button></div>` : '';
      return `<div class="cs-title"><h2>How ${per === 'month' ? 'last month' : 'last week'} went</h2><p>${label}. 10 minutes.</p></div>
        ${sec('The numbers', 'auto', r && r.status !== 'sent' ? 'From the weekly report. Walk them through what it means, do not read it out. Start with the whole store, then each channel, then the ads.' : 'From the report they already got. Walk them through what it means, do not read it out. Start with the whole store, then each channel, then the ads.',
          (r && r.status !== 'sent' ? '<p class="warnline">This report has not been sent to them yet. Check the numbers before you show them, or send it first.</p>' : '') + tog + readBody(r, D.act_id))}`;
    }
    if (id === 'week') return `<div class="cs-title"><h2>What we're working on</h2><p>5 minutes</p></div>
      ${sec('This week', 'auto', 'The "This week" lines from the report they got.', (wk.this_week || []).length ? `<ul class="chk">${wk.this_week.map(x => `<li><span class="tx">${esc(x)}</span></li>`).join('')}</ul>` : empty('The last report had no "This week" lines. Say in a sentence or two what we are testing and why.'))}
      ${sec('Anything we promise on this call', 'you', 'Whatever we say we will do for them. It goes on Tasks for our team.',
        `<div class="rows" data-list="promised" data-act="${esc(D.act_id)}">${rowsHtml(STATE.promised)}</div>
        <input type="text" data-quick="promised" data-act="${esc(D.act_id)}" placeholder="For example: Noma send the new offer ads Thursday">`, { optional: true })}`;
    if (id === 'asks') return `<div class="cs-title"><h2>What we need from ${name}</h2><p>5 minutes</p></div>
      ${sec('Still waiting on', 'auto', 'What we already asked them for, from their Requests page.',
        ((D.asks || []).length ? `<ul class="chk">${D.asks.map(a => `<li><span class="tx">${esc(a.title)}</span><span class="o ${(Date.now() - Date.parse(a.created_at)) > 7 * 864e5 ? 'late' : ''}">asked ${short(a.created_at)}</span></li>`).join('')}</ul>` : empty('Nothing. We are not waiting on them for anything.'))
        + ((D.approvals || []).length ? `<p class="cs-sub">Waiting for their OK</p><ul class="chk">${D.approvals.map(a => `<li><span class="tx">${esc(a.title)}</span><span class="o">sent ${short(a.created_at)}</span></li>`).join('')}</ul>` : ''))}
      ${sec('Ask for something new', 'you', 'Type it in front of them with a date. It goes on their Requests page when you press Finish.',
        `<div class="rows" data-list="asks" data-act="${esc(D.act_id)}">${rowsHtml(STATE.asks, true)}</div>
        <button class="add" data-add="asks" data-act="${esc(D.act_id)}">+ Add an ask</button>`, { optional: true })}`;
    if (id === 'coming') return `<div class="cs-title"><h2>Coming up</h2><p>The next five weeks. 5 minutes.</p></div>
      ${sec('On the calendar', 'auto', 'Launches, sales and drops from the Calendar. An offer only counts as locked once it is live on their website.',
        (D.coming || []).length ? `<ul class="chk">${D.coming.map(e => `<li><span class="tx"><b>${md(e.start)}</b> · ${esc(e.name)}${e.offer ? `<br><span style="color:var(--ink-2);font-size:13.5px">${esc(e.offer)}</span>` : ''}</span><span class="o ${e.confirmed ? '' : 'late'}">${e.confirmed ? 'Confirmed' : 'Not confirmed yet'}</span></li>`).join('')}</ul>` : empty('Nothing on the calendar for the next five weeks. Ask what is coming.'))}`;
    const recap = STATE.recap != null ? STATE.recap : recapText();
    const prom = (STATE.promised || []).filter(x => x.text).length, nasks = (STATE.asks || []).filter(x => x.text && x.on !== false).length;
    return `<div class="cs-title"><h2>Wrap up</h2><p>Check it, then press Finish</p></div>
      ${sec('What happens when you press Finish', 'auto', 'Everything typed on this call goes to where it lives.',
        `<div class="out"><div><b>${prom}</b>promise${prom === 1 ? '' : 's'} go on Tasks for our team.</div><div><b>${nasks}</b>new ask${nasks === 1 ? '' : 's'} go on ${name}'s Requests page, with a Done button for them.</div><div><b>Their news</b> and your notes go to the team's Slack channel for ${name}.</div></div>`)}
      ${D.has_client_channel ? sec('Recap for the client', 'you', `Locus wrote this from the call. Change anything, then tick the box to post it in ${name}'s Slack channel when you press Finish.`,
        `<textarea data-recap style="min-height:160px">${esc(recap)}</textarea>
        <label style="display:flex;gap:10px;align-items:center;font-size:14px"><input type="checkbox" data-postrecap ${STATE.post_recap ? 'checked' : ''} style="width:18px;height:18px;accent-color:var(--brand-ink)"> Post this recap in ${name}'s Slack channel</label>`, { optional: true }) : ''}
      <div><button class="btn2 pri" data-finish ${BUSY ? 'disabled' : ''}>Finish the call</button></div>`;
  }
  function recapText() {
    const wk = (D.week && D.week.this_week) || [];
    const asks = [...(D.asks || []).map(a => a.title), ...(STATE.asks || []).filter(x => x.text && x.on !== false).map(x => x.text + (x.due ? ` (by ${md(x.due)})` : ''))];
    const prom = (STATE.promised || []).filter(x => x.text).map(x => x.text + (x.due ? ` (${md(x.due)})` : ''));
    return [`Thanks for the time today. Here is what we agreed.`, wk.length || prom.length ? `\nWhat we are doing:\n${[...wk, ...prom].map(x => `• ${x}`).join('\n')}` : '', asks.length ? `\nWhat we need from you:\n${asks.map(x => `• ${x}`).join('\n')}` : ''].filter(Boolean).join('\n');
  }

  /* ======================= KICKOFF ======================= */
  function kickList() { return (D.briefs || []).filter(c => SHOW_OLD || !c.old); }
  function twoDays() {
    const d = dt(D.today); let n = 0;
    while (n < 2) { d.setUTCDate(d.getUTCDate() + 1); const w = d.getUTCDay(); if (w !== 0 && w !== 6) n++; }
    return d.toISOString().slice(0, 10);
  }
  function kickStep(c) {
    STATE.notes = STATE.notes || {}; STATE.deal = STATE.deal || {};
    const ctx = (D.brands || {})[c.act_id] || {};
    const card = CARD[c.id];
    const deal = STATE.deal[c.id] || (STATE.deal[c.id] = { count: '', format: c.format || 'Static', owner: c.assignee || '', due: c.due || '' });
    const done = (STATE.done || {})[c.id] || (c.kickoff_at ? { at: c.kickoff_at } : null);
    const brief = card ? (card.brief && card.brief.html && !card.brief.blank ? `<div class="brief">${card.brief.html}</div>` : '<p class="warnline">Nobody has written this brief yet. Talk it through, then type what you agreed below.</p>') : empty('Loading the brief...');
    const insp = card ? (card.files || []).filter(f => f.kind === 'insp') : [];
    return `<div class="cs-title"><h2>${esc(c.brand)} #${esc(c.num)}</h2><span class="pill">${esc(c.title)}</span>${done ? `<span class="pill good">Kicked off ${md(done.at)}</span>` : ''}</div>
      ${sec('The brief', 'auto', 'The page the strategist wrote on the Production card. Explain the idea in your own words, do not read it out.',
        `${brief}<div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn2 sm" data-editbrief="${esc(c.id)}">Open the card</button>${c.asana_url ? `<a class="btn2 sm" href="${esc(c.asana_url)}" target="_blank" rel="noopener">Open in Asana</a>` : ''}</div>`)}
      ${sec(`What's working for ${c.brand}`, 'auto', 'Last week\'s best ads for this brand, and any inspiration saved on the card. Say what to take from each. Tap an ad to see it.',
        ((ctx.winners || []).length ? `<div class="ads">${ctx.winners.map(a => adCard(a, 'win', c.act_id)).join('')}</div>` : empty('No weekly report yet, so no ads to show.'))
        + (insp.length ? `<p class="cs-sub">Inspiration on the card</p><div class="ads">${insp.map(f => `<div class="ad" style="cursor:default"><div class="th" style="background-image:url('${esc(f.thumb || f.url)}')"></div><div class="n">${esc(f.name || '')}</div></div>`).join('')}</div>` : ''))}
      ${sec('Files and brand assets', 'auto', 'The brand\'s Drive folder.', ctx.drive ? `<div><a class="btn2 sm" href="${esc(ctx.drive)}" target="_blank" rel="noopener">Open ${esc(c.brand)}'s Drive folder</a></div>` : empty('No Drive folder linked for this brand yet (Brand settings > Integrations).'))}
      ${sec('The designer\'s questions', 'you', 'What they asked and anything that changed. Saved on the card.', `<textarea data-knote="${esc(c.id)}" placeholder="For example: William will try a split-screen layout instead. Use the new white-background photos.">${esc(STATE.notes[c.id] || '')}</textarea>`, { optional: true })}
      ${sec('What we agreed', 'you', 'How many ads, the format, who makes them and when they are due (2 working days after the kickoff).',
        `<div class="deal">
          <label>How many<input type="text" inputmode="numeric" data-deal="count" value="${esc(deal.count)}" placeholder="4"></label>
          <label>Format<select data-deal="format">${['Static', 'Video', 'UGC', 'Carousel'].map(f => `<option ${f === deal.format ? 'selected' : ''}>${f}</option>`).join('')}</select></label>
          <label>Who makes it<select data-deal="owner">${teamOpts(deal.owner)}</select></label>
          <label>Due<input type="date" data-deal="due" value="${esc(deal.due || twoDays())}"></label>
        </div>
        <div><button class="btn2 pri" data-kickdone="${esc(c.id)}" ${BUSY ? 'disabled' : ''}>${done ? 'Save it again' : 'Agreed: move it to Making'}</button></div>
        <p class="rule">Saves what you agreed as a comment on the card (and in Asana), sets who and when, and moves the card to Making.</p>`)}`;
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
    return kickList().map(c => ({ id: c.id, name: `${c.brand} #${c.num}`, mins: 4, c }));
  }
  const TITLE = { monday: 'Monday call', client: 'Client call', kickoff: 'Creative kickoff' };
  function whoLine() {
    if (KIND === 'monday') return 'Mondays at 8am with Cole, Ahsan, Noma, Radhesh and Hamza. About 55 minutes. Brands that need attention go first.';
    if (KIND === 'client') return `${esc(D.name)} is on the call and only sees their own brand. About 30 minutes.`;
    return 'The strategist walks William (statics) and Ravo (video) through each brief before they build. 15 to 20 minutes. No brief gets built without this.';
  }
  function stepsHtml() {
    const st = steps();
    return st.map((s, i) => {
      const done = KIND === 'kickoff' ? !!((STATE.done || {})[s.id] || s.c.kickoff_at) : i < POS;
      const dot = KIND === 'monday' && s.id !== 'open' && s.id !== 'close' ? `<span class="dot ${s.sev || ''}"></span>` : '';
      return `<button data-pos="${i}" aria-current="${i === POS}" class="${done && i !== POS ? 'done' : ''}">${dot}${esc(s.name)}<small>${s.mins} min</small></button>`;
    }).join('') + (KIND === 'kickoff' && (D.briefs || []).some(c => c.old) ? `<button data-old>${SHOW_OLD ? 'Hide' : 'Show'} ${(D.briefs || []).filter(c => c.old).length} older briefs</button>` : '');
  }
  function mainHtml() {
    const s = steps()[POS];
    if (!s) return `<section class="cs-sec">${empty(KIND === 'kickoff' ? 'No briefs waiting. Monday\'s new ad batches land in Production\'s Brief column when the Monday call is finished, or add one on Production.' : 'Nothing to show.')}</section>`;
    if (KIND === 'monday') return s.id === 'open' ? mondayOpen() : s.id === 'close' ? mondayClose() : mondayBrand(D.brands.find(b => b.act_id === s.id));
    if (KIND === 'client') return clientStep(s.id);
    loadCard(s.id);
    return kickStep(s.c);
  }
  function whereHtml() {
    const st = steps(), s = st[POS];
    if (!s) return '';
    if (KIND === 'monday') { const n = st.length - 2; return s.id === 'open' ? '<b>Start</b>' : s.id === 'close' ? '<b>Wrap up</b>' : `<b>${esc(s.name)}</b> · brand ${POS} of ${n}`; }
    return `<b>${esc(s.name)}</b> · ${POS + 1} of ${st.length}`;
  }
  function finishedHtml() {
    const c = D.call, r = c.result || {};
    const all = [...(r.brands || []), ...(r.agency ? [r.agency] : [])];
    const n = k => all.reduce((s, b) => s + (b[k] || []).filter(t => !t.error).length, 0);
    return sec('This call is finished', 'auto', `Finished by ${esc(firstName(c.finished_by))} at ${c.finished_at ? clock(c.finished_at) : ''}.`,
      (KIND === 'kickoff' ? `<p class="rule">${plural(r.briefs || 0, 'brief')} kicked off and moved to Making.</p>` : `<div class="out">
        <div><b>${n('tasks')}</b>to-dos on Tasks</div><div><b>${n('briefs')}</b>briefs on Production and in Asana</div><div><b>${n('asks')}</b>asks on Requests</div><div><b>${all.filter(b => b.report).length}</b>weekly reports got "This week"</div></div>
        ${(r.warnings || []).length ? `<div class="warnline">${r.warnings.map(esc).join('<br>')}</div>` : ''}
        ${r.recap ? `<p class="rule">${r.recap.posted ? 'The recap is in the client\'s Slack channel.' : `The recap was not posted: ${esc(r.recap.why || '')}`}</p>` : ''}`)
      + `<div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn2" data-go="tasks">Open Tasks</button><button class="btn2" data-go="production">Open Production</button><button class="btn2" data-go="calls">Back to Calls</button></div>`);
  }
  function paint() {
    const host = $('#main'); if (!host) return;
    const title = KIND === 'client' ? `Client call: ${D.name}` : TITLE[KIND];
    const finished = D.call && D.call.status === 'finished';
    host.innerHTML = `<div class="v2 cs" id="csRoot">
      <div class="cs-head"><div class="t"><button class="cs-back" data-go="calls">← Calls</button><h1>${esc(title)}</h1><p class="cs-who">${whoLine()}</p></div>
        <div style="display:flex;gap:8px;align-items:center"><span class="cs-saved" id="csSaved"></span><button class="btn2" id="csPresent">${document.body.classList.contains('cs-present') ? 'Exit (Esc)' : 'Present'}</button></div></div>
      ${finished ? finishedHtml() : `<nav class="cs-steps" id="csSteps">${stepsHtml()}</nav>
        <div id="csMain" style="display:flex;flex-direction:column;gap:20px">${mainHtml()}</div>
        <div class="cs-bar"><button class="btn2" id="csPrev">← Back</button><span class="where" id="csWhere">${whereHtml()}</span><span class="cs-clock" id="csClock"></span><button class="btn2 pri" id="csNext">Next →</button></div>`}
    </div>`;
    wire();
    if (!finished) { const s = steps()[POS]; startClock((s ? s.mins : 5) * 60); }
  }
  function paintMain() {
    const m = $('#csMain'); if (!m) return;
    m.innerHTML = mainHtml(); $('#csSteps').innerHTML = stepsHtml(); $('#csWhere').innerHTML = whereHtml();
    wireMain(); wireSteps();
  }
  function go(i) {
    const n = steps().length; if (!n) return;
    POS = Math.max(0, Math.min(n - 1, i));
    paintMain(); const s = steps()[POS]; startClock((s ? s.mins : 5) * 60);
    const r = $('#csRoot'); if (r) window.scrollTo({ top: Math.max(0, r.getBoundingClientRect().top + window.scrollY - 12), behavior: 'smooth' });
    const cur = $('#csSteps [aria-current="true"]'); if (cur) cur.scrollIntoView({ block: 'nearest', inline: 'center' });
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
    const o = $('#csSteps [data-old]'); if (o) o.onclick = () => { const cur = steps()[POS]; SHOW_OLD = !SHOW_OLD; const i = cur ? steps().findIndex(s => s.id === cur.id) : 0; go(i >= 0 ? i : 0); };
  }
  function listOf(name, act) {
    if (KIND === 'monday') { if (name === 'agency') return (STATE.agency = STATE.agency || []); const st = brandState(act); st.edited = true; return st[name]; }
    return (STATE[name] = STATE[name] || []);
  }
  function openInAds(act, adId) {
    present(false);
    H.S.act = act; try { localStorage.setItem('pf_act', act); } catch {}
    const cp = document.getElementById('clientPick'); if (cp) cp.value = act;
    if (adId) window.V2PENDING = { ad: adId };
    H.show('adcreative');
  }
  function wireMain() {
    const root = $('#csMain'); if (!root) return;
    $$('textarea', root).forEach(t => { grow(t); t.addEventListener('input', () => grow(t)); });
    $$('[data-ad]', root).forEach(b => b.onclick = () => {
      const id = b.dataset.ad, act = b.dataset.act;
      if (window.V2 && window.V2.playAd) window.V2.playAd({ id, name: b.dataset.name, act, note: '' }, H, () => openInAds(act, id));
      else openInAds(act, id);
    });
    $$('[data-allads]', root).forEach(b => b.onclick = () => openInAds(b.dataset.allads));
    $$('[data-full]', root).forEach(b => b.onclick = () => { const t = $(`[data-txt="${b.dataset.full}"]`, root); t.classList.remove('clamp'); b.remove(); });
    $$('[data-item] input[type=checkbox]', root).forEach(cb => cb.onchange = async () => {
      const li = cb.closest('[data-item]'); li.classList.toggle('off', cb.checked);
      try { await post('/api/calls/done', { item: li.dataset.item, done: cb.checked }); } catch (e) { cb.checked = !cb.checked; li.classList.toggle('off', cb.checked); toast(e.message); }
    });
    $$('[data-read]', root).forEach(t => t.oninput = () => { const st = brandState(t.dataset.read); st.read = t.value; st.edited = true; grow(t); save(); });
    const th = $('[data-theme]', root); if (th) th.oninput = () => { STATE.theme = th.value; grow(th); save(); };
    const nw = $('[data-news]', root); if (nw) nw.oninput = () => { STATE.news = nw.value; grow(nw); save(); };
    const rc = $('[data-recap]', root); if (rc) rc.oninput = () => { STATE.recap = rc.value; grow(rc); save(); };
    const pr = $('[data-postrecap]', root); if (pr) pr.onchange = () => { STATE.post_recap = pr.checked; save(); };
    $$('[data-per]', root).forEach(b => b.onclick = () => { STATE.period = b.dataset.per; save(); paintMain(); });
    $$('[data-knote]', root).forEach(t => t.oninput = () => { STATE.notes = STATE.notes || {}; STATE.notes[t.dataset.knote] = t.value; grow(t); save(); });
    $$('[data-deal]', root).forEach(f => f.oninput = f.onchange = () => { const id = steps()[POS].id; STATE.deal = STATE.deal || {}; STATE.deal[id] = STATE.deal[id] || {}; STATE.deal[id][f.dataset.deal] = f.value; save(); });
    $$('[data-list]', root).forEach(list => {
      const arr = () => listOf(list.dataset.list, list.dataset.act);
      $$('.row', list).forEach(row => {
        const i = +row.dataset.i;
        $$('[data-f]', row).forEach(f => {
          const k = f.dataset.f;
          if (k === 'del') f.onclick = () => { arr().splice(i, 1); save(); paintMain(); };
          else if (k === 'on') f.onchange = () => { arr()[i].on = f.checked; row.classList.toggle('off', !f.checked); save(); };
          else f.oninput = f.onchange = () => { arr()[i][k] = f.value; save(); };
        });
      });
    });
    $$('[data-add]', root).forEach(b => b.onclick = () => { listOf(b.dataset.add, b.dataset.act).push({ text: '', owner: '', due: '' }); save(); paintMain(); const rows = $$(`[data-list="${b.dataset.add}"] .row input[data-f=text]`); const last = rows[rows.length - 1]; if (last) last.focus(); });
    $$('[data-quick]', root).forEach(inp => inp.onkeydown = async e => {
      if (e.key !== 'Enter' || !inp.value.trim()) return;
      e.preventDefault();
      const text = inp.value.trim(), name = inp.dataset.quick, act = inp.dataset.act;
      inp.value = ''; inp.placeholder = 'Reading it...';
      let p = { text, owner: '', due: '' };
      try { const r = await post('/api/calls/parse', { text, act }); if (r && r.text) p = { text: r.text, owner: r.owner || '', due: r.due || '' }; } catch {}
      listOf(name, act).push(p); save(); paintMain();
      const again = $(`[data-quick="${name}"]`); if (again) again.focus();
    });
    $$('[data-editbrief]', root).forEach(b => b.onclick = () => { if (window.ProdSheet) window.ProdSheet.open(H, b.dataset.editbrief, { onChange: () => { delete CARD[b.dataset.editbrief]; loadCard(b.dataset.editbrief); } }); else H.show('production'); });
    $$('[data-kickdone]', root).forEach(b => b.onclick = async () => {
      const id = b.dataset.kickdone, deal = (STATE.deal || {})[id] || {};
      b.disabled = true; b.textContent = 'Saving...';
      try {
        const r = await post('/api/calls/kickoff/done', { id: D.call.id, card: id, note: (STATE.notes || {})[id] || '', count: deal.count || '', format: deal.format || $('[data-deal=format]', root).value, owner: deal.owner != null ? deal.owner : $('[data-deal=owner]', root).value, due: $('[data-deal=due]', root).value });
        STATE.done = STATE.done || {}; STATE.done[id] = { at: new Date().toISOString(), text: r.text };
        const c = kickList().find(x => x.id === id); if (c) c.kickoff_at = new Date().toISOString();
        toast(r.asana && r.asana.why ? `Moved to Making. Asana: ${r.asana.why}` : 'Moved to Making, with what you agreed on the card.');
        const next = kickList().findIndex((x, i) => i > POS && !((STATE.done || {})[x.id] || x.kickoff_at));
        if (next >= 0) go(next); else paintMain();
      } catch (e) { toast(e.message); b.disabled = false; b.textContent = 'Agreed: move it to Making'; }
    });
    $$('[data-finish]', root).forEach(wireFinish);
  }
  function wireFinish(b) {
    b.onclick = async () => {
      if (BUSY) return;
      const sure = window.confirmModal ? await window.confirmModal(KIND === 'kickoff' ? 'Finish the kickoff?' : 'Finish the call?', KIND === 'kickoff' ? 'Briefs you did not get to stay in the Brief column for next time.' : 'Everything typed goes where it belongs: Tasks, Production and Asana, Requests, the weekly reports and Slack.', 'Finish') : true;
      if (!sure) return;
      BUSY = true; b.disabled = true; b.textContent = 'Sending it all...';
      clearTimeout(SAVE_T);
      try {
        await H.apiAH('/api/calls/state', { method: 'PUT', body: JSON.stringify({ id: D.call.id, state: STATE }) });
        const r = await post('/api/calls/finish', { id: D.call.id, recap: KIND === 'client' && STATE.post_recap ? (STATE.recap != null ? STATE.recap : recapText()) : '' });
        D.call = { ...D.call, status: 'finished', finished_by: H.S.meEmail || '', finished_at: new Date().toISOString(), result: r.result ? { ...r.result, recap: r.recap } : { briefs: r.briefs } };
        clearInterval(CLOCK); BUSY = false; paint();
      } catch (e) { BUSY = false; b.disabled = false; b.textContent = 'Finish the call'; toast(e.message); }
    };
  }
  function wire() {
    const root = $('#csRoot');
    $$('[data-go]', root).forEach(b => b.onclick = () => { clearInterval(CLOCK); present(false); H.show(b.dataset.go); });
    const pres = $('#csPresent'); if (pres) pres.onclick = () => present(!document.body.classList.contains('cs-present'));
    const n = $('#csNext'); if (n) n.onclick = () => go(POS + 1);
    const p = $('#csPrev'); if (p) p.onclick = () => go(POS - 1);
    wireSteps(); wireMain();
  }
  function keys(e) {
    if (!$('#csRoot')) { document.removeEventListener('keydown', keys); present(false); return; }
    if (e.key === 'Escape' && document.body.classList.contains('cs-present')) { present(false); return; }
    if (e.ctrlKey && e.key === 'Enter') { e.preventDefault(); go(steps().length - 1); return; }
    if (e.target.closest && e.target.closest('input,textarea,select,[contenteditable]')) return;
    if (e.key === 'ArrowRight') { e.preventDefault(); go(POS + 1); }
    if (e.key === 'ArrowLeft') { e.preventDefault(); go(POS - 1); }
  }

  /* ---------- open ---------- */
  function pickBrand() {
    const brands = (H.S.accounts || H.S.brands || []).filter(a => a.active !== false).map(a => ({ act_id: a.act_id, name: a.name }));
    $('#main').innerHTML = `<div class="v2 cs" id="csRoot"><div class="cs-head"><div class="t"><button class="cs-back" data-go="calls">← Calls</button><h1>Client call</h1><p class="cs-who">Which client is on the call?</p></div></div>
      <section class="cs-sec"><div class="picker">${brands.map(b => `<button data-pick="${esc(b.act_id)}">${esc(b.name)}</button>`).join('') || empty('No brands.')}</div></section></div>`;
    $$('[data-pick]').forEach(b => b.onclick = () => open(H, 'client', b.dataset.pick));
    $$('[data-go]').forEach(b => b.onclick = () => H.show(b.dataset.go));
  }
  async function open(host, kind, act) {
    H = host; css(); KIND = ['monday', 'client', 'kickoff'].includes(kind) ? kind : 'monday';
    const a = act && act !== 'all' ? act : '';
    POS = 0; CARD = {}; BUSY = false;
    if (KIND === 'client' && !a) { pickBrand(); return; }
    $('#main').innerHTML = `<div class="v2 cs"><div class="cs-head"><div class="t"><h1>${TITLE[KIND]}</h1><p class="cs-who">Pulling in last week's numbers, the team's Slack posts and the open to-dos...</p></div></div></div>`;
    try {
      const [d, cmd] = await Promise.all([
        H.apiAH(`/api/calls/screen?kind=${KIND}${a ? `&act=${encodeURIComponent(a)}` : ''}`),
        KIND === 'monday' ? H.api('/api/hub/command').catch(() => null) : null,
      ]);
      if (d.error) throw new Error(d.error);
      D = d; STATE = (d.call && d.call.state) || {}; SEV = {};
      if (cmd && Array.isArray(cmd.brands)) for (const b of cmd.brands) SEV[b.act_id] = b.paused ? undefined : (b.reasons || []).reduce((w, r) => r.sev === 'bad' ? 'bad' : (w === 'bad' ? w : r.sev === 'warn' ? 'warn' : w), 'good');
      if (KIND === 'kickoff') { const first = kickList().findIndex(c => !((STATE.done || {})[c.id] || c.kickoff_at)); POS = first >= 0 ? first : 0; }
    } catch (e) { $('#main').innerHTML = `<div class="v2 cs"><div class="cs-head"><div class="t"><button class="cs-back" onclick="window.CallScreen && window.CallScreen.back()">← Calls</button><h1>${TITLE[KIND]}</h1><p class="cs-who" style="color:var(--bad)">${esc(e.message)}</p></div></div></div>`; return; }
    paint();
    document.removeEventListener('keydown', keys); document.addEventListener('keydown', keys);
  }
  window.CallScreen = { open, back: () => { present(false); H && H.show('calls'); } };
})();

/* THE CALL SCREENS (2026-10-19, the approved mock https://claude.ai/artifact/YbExG9VRV3untjLtPHjnJb). The screen Cole
 * shares on a call and walks top to bottom: the Monday call (every brand, red first), a client call (one brand, the
 * client watching) and the creative kickoff (the strategist walks the design team through each brief before they build).
 *
 * Every box says where it comes from: "Locus fills it" (green), "From <strategist>'s Slack plan" (blue), "Typed on the
 * call" (amber). What is typed autosaves to the call row (account-health callscreen.js, p_call). Finish sends it all
 * where it lives through the same path an approved Fireflies call takes; ticks on last week's items are instant.
 * Opened from Work > Calls ("Run a call"), or ?open=calls&call=monday|client|kickoff[&act=].
 * Classic script, own closure. window.CallScreen = { open(host, kind, act) }; host = the Calls tab's {S, api, apiAH, show}.
 */
(() => {
  let H = null, D = null, KIND = 'monday', ACT = '', POS = 0, STATE = {}, SEV = {}, SAVE_T = null, SAVED_AT = null, CLOCK = null, CLOCK_START = 0, CLOCK_FOR = 0, CARD = {}, GOOGLE = {}, BUSY = false;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const dt = iso => new Date(String(iso).slice(0, 10) + 'T12:00:00Z');
  const md = iso => iso ? dt(iso).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' }) : '';
  const short = iso => iso ? dt(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' }) : '';
  const money = n => n == null ? '–' : '$' + (Math.abs(n) >= 10000 ? (Math.round(n / 100) / 10).toLocaleString('en-US') + 'K' : Math.round(n).toLocaleString('en-US'));
  const x2 = n => n == null ? '–' : (+n).toFixed(2).replace(/0$/, '') + 'x';
  const pct = (a, b) => (a == null || !b) ? null : Math.round((a / b - 1) * 100);
  const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
  const firstName = s => String(s || '').split(/[@\s._]/)[0].replace(/^./, c => c.toUpperCase());
  const me = () => firstName(H && H.S && H.S.meEmail || '');
  const post = (path, body) => H.apiAH(path, { method: 'POST', body: JSON.stringify(body) });
  const toast = msg => { const t = document.createElement('div'); t.setAttribute('role', 'status'); t.className = 'cs-toast'; t.textContent = msg; document.body.appendChild(t); setTimeout(() => t.remove(), 4500); };
  const SRC = {
    auto: '<span class="cs-src auto">Locus fills it</span>',
    slack: who => `<span class="cs-src slack">From ${esc(who || 'the strategist')}'s Slack plan</span>`,
    type: '<span class="cs-src type">Typed on the call</span>',
    report: '<span class="cs-src auto">From the report they got</span>',
  };

  /* ---------- look (Locus tokens only, both themes) ---------- */
  function css() {
    if (document.getElementById('cscss')) return;
    const st = document.createElement('style'); st.id = 'cscss';
    st.textContent = `
      .cs{display:flex;flex-direction:column;gap:14px;max-width:1280px;min-width:0}
      .cs:fullscreen{background:var(--bg);padding:20px 24px;overflow:auto;max-width:none}
      .cs .cs-top{display:flex;align-items:center;gap:10px;flex-wrap:wrap}
      .cs .cs-top h1{font-size:22px;font-weight:700;margin:0;color:var(--ink)}
      .cs .cs-top .sub{color:var(--muted);font-size:13px}
      .cs .cs-back{font-size:13px;color:var(--brand-ink);font-weight:600}
      .cs .cs-legend{display:flex;gap:8px;flex-wrap:wrap;align-items:center;font-size:12px;color:var(--muted)}
      .cs-src{display:inline-block;font-size:10.5px;font-weight:600;letter-spacing:.03em;padding:2px 8px;border-radius:999px;vertical-align:middle;white-space:nowrap}
      .cs-src.auto{background:var(--good-bg);color:var(--good)}
      .cs-src.slack{background:var(--brand-soft);color:var(--brand-ink)}
      .cs-src.type{background:var(--warn-bg);color:var(--warn)}
      .cs .cs-who{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:1px;background:var(--line);border:1px solid var(--line);border-radius:var(--radius);overflow:hidden}
      .cs .cs-who div{background:var(--surface);padding:9px 13px;min-width:0}
      .cs .cs-who b{display:block;font-size:10.5px;letter-spacing:.08em;text-transform:uppercase;color:var(--muted);margin-bottom:2px;font-weight:600}
      .cs .cs-who span{font-size:13px;color:var(--ink-2)}
      .cs .cs-stage{background:var(--surface);border:1px solid var(--line);border-radius:var(--radius);overflow:hidden}
      .cs .cs-bar{display:flex;align-items:center;gap:12px;padding:11px 16px;border-bottom:1px solid var(--line);flex-wrap:wrap}
      .cs .cs-bar h2{font-size:16px;font-weight:650;margin:0}
      .cs .cs-bar .sub{color:var(--muted);font-size:12.5px}
      .cs .cs-clock{margin-left:auto;font-variant-numeric:tabular-nums;font-size:13px;padding:5px 10px;border-radius:8px;background:var(--bg);border:1px solid var(--line);font-weight:600}
      .cs .cs-clock.over{background:var(--bad-bg);color:var(--bad);border-color:transparent}
      .cs .cs-saved{font-size:11.5px;color:var(--muted)}
      .cs .btn2{height:32px;padding:0 12px;border-radius:8px;border:1px solid var(--line-strong);background:var(--surface);font-weight:600;font-size:13px;display:inline-flex;align-items:center;gap:6px;white-space:nowrap}
      .cs .btn2:hover{border-color:var(--ink-2)}
      .cs .btn2.pri{background:var(--brand-ink);border-color:var(--brand-ink);color:#fff}
      .cs .btn2.sm{height:26px;padding:0 9px;font-size:12px}
      .cs .btn2:disabled{opacity:.55;cursor:default}
      .cs .cs-body{display:grid;grid-template-columns:210px minmax(0,1fr) 290px;min-height:560px}
      .cs .cs-rail{border-right:1px solid var(--line);background:var(--bg);display:flex;flex-direction:column;min-width:0}
      .cs .cs-rail .lbl{font-size:10.5px;letter-spacing:.08em;text-transform:uppercase;color:var(--muted);padding:12px 14px 6px;font-weight:600}
      .cs .cs-rail button{text-align:left;padding:9px 14px;display:flex;align-items:center;gap:9px;border-bottom:1px solid var(--line);font-weight:500;font-size:13.5px;min-width:0}
      .cs .cs-rail button span.t{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1}
      .cs .cs-rail button[aria-current="true"]{background:var(--surface);box-shadow:inset 3px 0 0 var(--brand)}
      .cs .cs-rail button.done .t{color:var(--muted);text-decoration:line-through}
      .cs .cs-rail small{color:var(--muted);font-variant-numeric:tabular-nums;font-size:11.5px}
      .cs .dot{width:9px;height:9px;border-radius:50%;flex:0 0 9px;background:var(--line-strong)}
      .cs .dot.bad{background:var(--bad)}.cs .dot.warn{background:var(--warn-on)}.cs .dot.good{background:var(--good)}
      .cs .cs-main{padding:18px 22px;min-width:0;display:flex;flex-direction:column;gap:18px}
      .cs .cs-side{border-left:1px solid var(--line);background:var(--bg);padding:16px;display:flex;flex-direction:column;gap:14px;min-width:0}
      .cs .cs-side h4{font-size:10.5px;letter-spacing:.08em;text-transform:uppercase;color:var(--muted);margin:0;font-weight:600}
      .cs .cs-brand{display:flex;align-items:baseline;gap:10px;flex-wrap:wrap}
      .cs .cs-brand h3{font-family:var(--serif);font-weight:400;font-size:28px;margin:0;line-height:1.1}
      .cs .pill{display:inline-block;font-size:11.5px;font-weight:600;padding:2px 9px;border-radius:999px;background:var(--bg);border:1px solid var(--line);color:var(--ink-2)}
      .cs .pill.good{background:var(--good-bg);color:var(--good);border-color:transparent}
      .cs .step{display:grid;grid-template-columns:28px minmax(0,1fr);gap:12px;align-items:start}
      .cs .step>i{width:26px;height:26px;border-radius:50%;background:var(--ink);color:var(--surface);font:600 12px/26px var(--sans);text-align:center;font-style:normal}
      .cs .step.live>i{background:var(--brand-ink);color:#fff}
      .cs .step h4{font-size:15px;font-weight:650;margin:0;display:flex;align-items:center;gap:8px;flex-wrap:wrap;color:var(--ink)}
      .cs .step h4 small{font-weight:500;color:var(--muted);font-size:12px}
      .cs .step .c{margin-top:8px;display:flex;flex-direction:column;gap:8px;min-width:0}
      .cs .nums{display:grid;grid-template-columns:repeat(auto-fit,minmax(100px,1fr));gap:8px}
      .cs .num{background:var(--bg);border:1px solid var(--line);border-radius:10px;padding:9px 11px;min-width:0}
      .cs .num b{display:block;font-size:10.5px;letter-spacing:.07em;text-transform:uppercase;color:var(--muted);font-weight:600}
      .cs .num strong{display:block;font-size:20px;font-weight:650;font-variant-numeric:tabular-nums;margin-top:2px}
      .cs .num span{font-size:12px;font-variant-numeric:tabular-nums;color:var(--muted)}
      .cs .num.goal{border-color:var(--brand);background:var(--brand-soft)}
      .cs .up{color:var(--good)!important}.cs .down{color:var(--bad)!important}
      .cs .ads{display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:10px}
      .cs .ad{border:1px solid var(--line);border-radius:10px;overflow:hidden;background:var(--bg);min-width:0;display:flex;flex-direction:column}
      .cs .ad .th{aspect-ratio:4/5;max-width:100%;background:var(--line) center/cover no-repeat;position:relative;display:grid;place-items:center;font-size:12px;color:var(--muted);text-align:center;padding:8px}
      .cs .ad .th .vid{position:absolute;right:6px;bottom:6px;background:rgba(0,0,0,.6);color:#fff;font-size:10px;padding:1px 6px;border-radius:4px}
      .cs .ad .m{padding:7px 9px;font-size:12px;display:flex;justify-content:space-between;gap:6px;font-variant-numeric:tabular-nums}
      .cs .ad .m b{font-weight:650}
      .cs .ad .n{padding:0 9px 8px;font-size:11.5px;color:var(--ink-2);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      .cs .ad.win{border-color:color-mix(in srgb,var(--good) 45%,var(--line))}
      .cs .ad.lose{border-color:color-mix(in srgb,var(--bad) 40%,var(--line))}
      .cs .sublbl{font-size:12px;color:var(--muted);display:flex;justify-content:space-between;align-items:center;gap:8px}
      .cs .sublbl b{color:var(--ink);font-weight:650}
      .cs .chk{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:6px}
      .cs .chk li{display:flex;gap:10px;align-items:flex-start;padding:8px 10px;border:1px solid var(--line);border-radius:9px;background:var(--bg);font-size:13.5px}
      .cs .chk li input[type=checkbox]{margin-top:3px;accent-color:var(--brand-ink);width:16px;height:16px;flex:0 0 16px}
      .cs .chk li.off .tx{color:var(--muted);text-decoration:line-through}
      .cs .chk li .tx{flex:1;min-width:0}
      .cs .chk li .o{font-size:11.5px;color:var(--muted);white-space:nowrap}
      .cs .chk li .o.late{color:var(--bad);font-weight:600}
      .cs .cs-later summary{cursor:pointer;margin-top:4px}
      .cs textarea,.cs input[type=text],.cs input[type=date],.cs select{width:100%;font:inherit;font-size:13.5px;color:var(--ink);background:var(--surface);border:1px solid var(--line-strong);border-radius:8px;padding:8px 10px}
      .cs textarea{resize:vertical;min-height:64px;line-height:1.45}
      .cs textarea:focus,.cs input:focus,.cs select:focus{outline:2px solid var(--brand);outline-offset:1px}
      .cs .rows{display:flex;flex-direction:column;gap:6px}
      .cs .row{display:grid;grid-template-columns:22px minmax(0,1fr) 120px 140px 26px;gap:6px;align-items:center}
      .cs .row.asks{grid-template-columns:22px minmax(0,1fr) 140px 26px}
      .cs .row input[type=checkbox]{accent-color:var(--brand-ink);width:16px;height:16px}
      .cs .row.off input[type=text]{color:var(--muted);text-decoration:line-through}
      .cs .row .x{color:var(--muted);font-size:16px;line-height:1}
      .cs .row .x:hover{color:var(--bad)}
      .cs .rowhd{display:grid;grid-template-columns:22px minmax(0,1fr) 120px 140px 26px;gap:6px;font-size:10.5px;letter-spacing:.07em;text-transform:uppercase;color:var(--muted);font-weight:600}
      .cs .add{color:var(--brand-ink);font-weight:600;font-size:13px;align-self:flex-start;padding:2px 0}
      .cs .hint{font-size:12px;color:var(--muted)}
      .cs .hint b{color:var(--ink-2);font-weight:600}
      .cs .warnline{font-size:12.5px;color:var(--warn);background:var(--warn-bg);border-radius:8px;padding:7px 10px}
      .cs .out{display:flex;flex-direction:column;gap:7px}
      .cs .out div{display:flex;gap:8px;align-items:flex-start;font-size:12.5px;color:var(--ink-2)}
      .cs .out b{color:var(--ink);font-weight:650}
      .cs .k{flex:0 0 18px;height:18px;border-radius:5px;display:grid;place-items:center;font-size:10px;font-weight:700;color:#fff}
      .cs .k.m{background:var(--good)}.cs .k.a{background:var(--brand-ink)}.cs .k.c{background:var(--warn)}.cs .k.r{background:var(--muted)}
      .cs .keys{font-size:12px;color:var(--muted);line-height:1.9}
      .cs kbd{font-family:inherit;font-size:11px;background:var(--surface);border:1px solid var(--line-strong);border-bottom-width:2px;border-radius:5px;padding:0 5px}
      .cs .cs-foot{display:flex;justify-content:space-between;align-items:center;gap:10px;padding:11px 16px;border-top:1px solid var(--line);flex-wrap:wrap}
      .cs .cs-foot .n{color:var(--muted);font-size:12.5px;max-width:720px}
      .cs .brief{border:1px solid var(--line);border-radius:10px;padding:14px 16px;background:var(--surface);font-size:14px;line-height:1.55;max-height:520px;overflow:auto}
      .cs .brief h1,.cs .brief h2,.cs .brief h3{font-size:15px;margin:10px 0 4px}
      .cs .brief p{margin:0 0 8px}
      .cs .brief ol,.cs .brief ul{margin:0 0 8px 20px}
      .cs .brief img,.cs .brief video{max-width:100%;max-height:280px;border-radius:8px;display:block;margin:6px 0}
      .cs .brief [data-ph]{color:var(--muted);font-style:italic}
      .cs .deal{display:grid;grid-template-columns:90px minmax(0,1fr) 150px 150px;gap:8px;align-items:end}
      .cs .deal label{display:flex;flex-direction:column;gap:4px;font-size:11px;color:var(--muted);font-weight:600;letter-spacing:.04em;text-transform:uppercase}
      .cs .result{display:flex;flex-direction:column;gap:6px;font-size:13.5px}
      .cs .result .line{display:flex;gap:8px;align-items:baseline}
      .cs .empty{padding:28px;color:var(--muted);text-align:center;font-size:14px}
      .cs .picker{display:grid;grid-template-columns:repeat(auto-fill,minmax(170px,1fr));gap:8px}
      .cs .picker button{border:1px solid var(--line);background:var(--surface);border-radius:10px;padding:12px 14px;text-align:left;font-weight:600}
      .cs .picker button:hover{border-color:var(--brand)}
      .cs-toast{position:fixed;left:50%;bottom:24px;transform:translateX(-50%);max-width:min(560px,calc(100vw - 32px));background:var(--ink);color:var(--surface);padding:10px 16px;border-radius:12px;font-size:13.5px;z-index:9999;box-shadow:0 8px 30px rgba(0,0,0,.25)}
      @media (max-width:1100px){.cs .cs-body{grid-template-columns:190px minmax(0,1fr)}.cs .cs-side{grid-column:1 / -1;border-left:0;border-top:1px solid var(--line)}}
      @media (max-width:760px){.cs .cs-body{grid-template-columns:1fr}.cs .cs-rail{flex-direction:row;overflow-x:auto;border-right:0;border-bottom:1px solid var(--line)}.cs .cs-rail .lbl{display:none}.cs .cs-rail button{flex:0 0 auto;border-bottom:0;border-right:1px solid var(--line)}
        .cs .row,.cs .rowhd{grid-template-columns:22px minmax(0,1fr) 26px}.cs .row>*:nth-child(3),.cs .row>*:nth-child(4),.cs .rowhd>*:nth-child(3),.cs .rowhd>*:nth-child(4){display:none}.cs .row.asks{grid-template-columns:22px minmax(0,1fr) 26px}.cs .deal{grid-template-columns:1fr 1fr}
        .cs .cs-main{padding:14px 12px}.cs .step{grid-template-columns:22px minmax(0,1fr);gap:8px}.cs .step>i{width:22px;height:22px;line-height:22px;font-size:11px}.cs .chk li{flex-wrap:wrap}.cs .chk li .o{width:100%;padding-left:26px;white-space:normal}.cs .cs-bar{gap:8px}.cs .cs-clock{margin-left:0}.cs .cs-who{display:none}}
    `;
    document.head.appendChild(st);
  }

  /* ---------- state: typed on the call, autosaved ---------- */
  function save() {
    clearTimeout(SAVE_T);
    const s = $('#csSaved'); if (s) s.textContent = 'Saving...';
    SAVE_T = setTimeout(async () => {
      try { await H.apiAH('/api/calls/state', { method: 'PUT', body: JSON.stringify({ id: D.call.id, state: STATE }) }); SAVED_AT = new Date(); const t = $('#csSaved'); if (t) t.textContent = 'Saved'; }
      catch (e) { const t = $('#csSaved'); if (t) t.textContent = 'Not saved: ' + e.message; }
    }, 700);
  }
  const brandState = act => { STATE.brands = STATE.brands || {}; return (STATE.brands[act] = STATE.brands[act] || { read: '', batches: [], jobs: [], asks: [] }); };

  /* ---------- the clock: per step, visible to everyone ---------- */
  function startClock(seconds) {
    clearInterval(CLOCK); CLOCK_START = Date.now(); CLOCK_FOR = seconds;
    const tick = () => {
      const c = $('#csClock'); if (!c) { clearInterval(CLOCK); return; }
      const left = Math.round(CLOCK_FOR - (Date.now() - CLOCK_START) / 1000), a = Math.abs(left);
      c.textContent = (left < 0 ? '+' : '') + String(Math.floor(a / 60)).padStart(2, '0') + ':' + String(a % 60).padStart(2, '0');
      c.classList.toggle('over', left < 0);
      c.title = left < 0 ? 'Over the time for this step' : 'Time left for this step';
    };
    tick(); CLOCK = setInterval(tick, 1000);
  }

  /* ---------- shared pieces ---------- */
  const teamOpts = (v, blank = 'Who') => `<option value="">${blank}</option>` + (D.team || []).map(n => `<option ${n === v ? 'selected' : ''}>${esc(n)}</option>`).join('');
  function numsHtml(r, { plan = true } = {}) {
    if (!r) return '<p class="hint">No report for this brand yet, so there are no numbers to read.</p>';
    const t = r.totals || {}, p = r.prior || {}, f = r.plan || {};
    const d = (a, b, lowerBetter) => { const v = pct(a, b); if (v == null) return '<span>no prior</span>'; const good = lowerBetter ? v <= 0 : v >= 0; return `<span class="${good ? 'up' : 'down'}">${v > 0 ? '+' : ''}${v}% vs before</span>`; };
    const ncpa = t.ncpa != null ? `<div class="num"><b>New customer cost</b><strong>${money(t.ncpa)}</strong>${d(t.ncpa, p.ncpa, true)}</div>` : '';
    return `<div class="nums">
      <div class="num"><b>Revenue</b><strong>${money(t.sales)}</strong>${d(t.sales, p.sales)}</div>
      <div class="num"><b>Ad spend</b><strong>${money(t.spend)}</strong>${d(t.spend, p.spend, true).replace(/up|down/, m => m)}</div>
      <div class="num goal"><b>MER${plan && f.mer ? ' vs plan' : ''}</b><strong>${x2(t.mer)}</strong><span class="${f.mer && t.mer != null ? (t.mer >= f.mer ? 'up' : 'down') : ''}">${f.mer ? `plan ${x2(f.mer)}` : p.mer != null ? `was ${x2(p.mer)}` : ''}</span></div>
      <div class="num"><b>Orders</b><strong>${t.orders != null ? Math.round(t.orders).toLocaleString('en-US') : '–'}</strong>${d(t.orders, p.orders)}</div>
      ${ncpa}
    </div>`;
  }
  function adCard(a, cls) {
    const th = a.thumb ? `style="background-image:url('${esc(a.thumb)}')"` : '';
    return `<div class="ad ${cls}" title="${esc(a.name)}"><div class="th" ${th}>${a.thumb ? '' : esc(a.headline || a.name)}${a.video ? '<span class="vid">Video</span>' : ''}</div>
      <div class="m"><span>${money(a.spend)}</span><b>${a.roas != null ? x2(a.roas) : ''}</b></div><div class="n">${esc(a.name)}</div></div>`;
  }
  function adsHtml(r, act) {
    if (!r || !(r.winners || []).length) return '';
    const tw = r.basis === 'tw';
    const bar = tw && r.bar != null ? ` the ${x2(r.bar)} these ads did together` : '';
    return `<div class="sublbl"><span><b>Winners</b> ${tw ? `beat${bar} (Triple Whale ROAS)` : 'by spend (no Triple Whale attribution on this report)'}${r.floor ? `, ads with ${money(r.floor)}+ spend` : ''}</span><button class="btn2 sm" data-ads="${esc(act)}">Open Ads</button></div>
      ${r.winners.length ? `<div class="ads">${r.winners.map(a => adCard(a, 'win')).join('')}</div>` : '<p class="hint">No ad beat the bar this week.</p>'}
      ${(r.losers || []).length ? `<div class="sublbl"><span><b>Losers</b> under${bar}: cut, fix or give it more time</span></div><div class="ads">${r.losers.map(a => adCard(a, 'lose')).join('')}</div>` : ''}`;
  }
  function chanHtml(label, who, ch, words, extra = '') {
    if (!ch && !words) return '';
    const c = ch && ch.cur || {}, p = ch && ch.prev || {};
    const v = (a, b) => { const x = pct(a, b); return x == null ? '' : `<span class="${x >= 0 ? 'up' : 'down'}">${x > 0 ? '+' : ''}${x}%</span>`; };
    return `<div class="sublbl" style="margin-top:4px"><span><b>${esc(label)}</b> ${esc(who)} talks</span>${SRC.auto}</div>
      ${ch ? `<div class="nums"><div class="num"><b>Spend</b><strong>${money(c.spend)}</strong>${v(c.spend, p.spend)}</div><div class="num"><b>Revenue</b><strong>${money(c.revenue)}</strong>${v(c.revenue, p.revenue)}</div><div class="num goal"><b>ROAS</b><strong>${x2(c.roas)}</strong><span>${p.roas != null ? `was ${x2(p.roas)}` : ''}</span></div>${c.purchases != null ? `<div class="num"><b>Orders</b><strong>${Math.round(c.purchases)}</strong>${v(c.purchases, p.purchases)}</div>` : ''}</div>` : ''}
      ${extra}${words ? `<p class="hint">${SRC.slack(who)} ${esc(words)}</p>` : ''}`;
  }
  function wireCommon(root) {
    $$('[data-ads]', root).forEach(b => b.onclick = () => { const s = document.getElementById('clientPick'); if (s && s.value !== b.dataset.ads) { s.value = b.dataset.ads; s.dispatchEvent(new Event('change')); } H.show('adcreative'); });
  }

  /* ---------- MONDAY ---------- */
  function mondayList() {
    const rank = { bad: 0, warn: 1, undefined: 2, good: 3 };
    return [...D.brands].sort((a, b) => (rank[SEV[a.act_id]] ?? 2) - (rank[SEV[b.act_id]] ?? 2) || a.name.localeCompare(b.name));
  }
  function mondaySteps() { return [{ id: 'open', name: 'Open', mins: 5 }, ...mondayList().map(b => ({ id: b.act_id, name: b.name, sev: SEV[b.act_id], mins: SEV[b.act_id] === 'good' ? 2 : SEV[b.act_id] === 'bad' || SEV[b.act_id] === 'warn' ? 7 : 4 })), { id: 'close', name: 'Close and finish', mins: 5 }]; }
  function batchRows(act, arr, cls = '') {
    return arr.map((x, i) => `<div class="row ${x.on === false ? 'off' : ''} ${cls}" data-i="${i}">
      <input type="checkbox" ${x.on === false ? '' : 'checked'} data-f="on" aria-label="Keep this one">
      <input type="text" value="${esc(x.text)}" data-f="text" placeholder="What to make: product, angle, how many, format" aria-label="What to make">
      ${cls === 'asks' ? '' : `<select data-f="owner" aria-label="Who makes it">${teamOpts(x.owner)}</select>`}
      <input type="date" value="${esc(x.due || '')}" data-f="due" aria-label="Due">
      <button class="x" data-f="del" aria-label="Remove" title="Remove">×</button></div>`).join('');
  }
  /* Due by today (or no date) is what the call ticks; anything due later folds away, it is not last week's. */
  function itemsHtml(open, today) {
    const li = it => `<li data-item="${esc(it.id)}"><input type="checkbox" aria-label="Done"><span class="tx">${esc(it.text)}</span><span class="o ${it.due && it.due < today ? 'late' : ''}">${esc(it.owner || 'nobody')}${it.due ? ` · ${it.due < today ? 'late, ' : ''}${short(it.due)}` : ''}</span></li>`;
    const now = open.filter(it => !it.due || it.due <= today), later = open.filter(it => it.due && it.due > today);
    return (now.length ? `<ul class="chk">${now.map(li).join('')}</ul>` : '<p class="hint">Nothing was due by today.</p>')
      + (later.length ? `<details class="cs-later"><summary class="hint">${plural(later.length, 'item')} due later</summary><ul class="chk" style="margin-top:6px">${later.map(li).join('')}</ul></details>` : '');
  }
  function mondayBrand(b) {
    const s = brandState(b.act_id), r = b.read, who = b.plan ? b.plan.by : null, sev = SEV[b.act_id];
    const quick = sev === 'good';
    const open = b.open || [];
    const today = D.today;
    const goog = GOOGLE[b.act_id];
    const googExtra = goog && goog.rows && goog.rows.length ? `<div class="nums">${goog.rows.map(x => `<div class="num"><b>${esc(x.label)}</b><strong style="font-size:16px">${money(x.spend)}</strong><span>${plural(x.campaigns, 'campaign')}</span></div>`).join('')}</div>` : '';
    return `<div class="cs-brand"><h3>${esc(b.name)}</h3>${who ? `<span class="pill">${esc(firstName(who))} talks</span>` : ''}${quick ? '<span class="pill good">Green: 2 minutes. Numbers on plan, nothing open, plan approved.</span>' : ''}${r ? `<span class="hint">Week of ${short(r.period_start)} to ${short(r.period_end)}${r.status !== 'sent' ? ', draft' : ''}</span>` : ''}</div>
      <div class="step"><i>1</i><div><h4>Last week's items ${SRC.auto}<small>open on Tasks for this brand; tick done or not</small></h4><div class="c">
        ${itemsHtml(open, today)}
      </div></div></div>
      <div class="step"><i>2</i><div><h4>The read ${SRC.auto}<small>last week against the week before, from the weekly report</small></h4><div class="c">
        ${numsHtml(r)}
        ${adsHtml(r, b.act_id)}
        <div class="sublbl" style="margin-top:4px"><span><b>${esc(firstName(who) || 'The strategist')}'s read</b> three numbers, winners and losers, in their words</span>${who ? SRC.slack(firstName(who)) : SRC.type}</div>
        <textarea data-read="${esc(b.act_id)}" placeholder="${who ? 'Edit it if the call says otherwise.' : 'No Monday plan in Slack for this brand. Type the read as the strategist says it.'}">${esc(s.read || '')}</textarea>
        ${chanHtml('Google', 'Radhesh', r && r.google, b.plan && b.plan.google, googExtra)}
        ${chanHtml('Amazon', 'Hamza', r && r.amazon, b.plan && b.plan.amazon)}
      </div></div></div>
      <div class="step live"><i>3</i><div><h4>This week's batches ${who ? SRC.slack(firstName(who)) : SRC.type}<small>approve, change or add; each becomes a numbered brief on Production</small></h4><div class="c">
        ${s.batches.length ? '<div class="rowhd"><span></span><span>What to make</span><span>Who</span><span>Due</span><span></span></div>' : `<p class="hint">${who ? `${esc(firstName(who))} posted no batches for this week.` : 'No batches yet.'}${quick ? ' Fine for a green brand.' : ' Ask why, or add them now.'}</p>`}
        <div class="rows" data-list="batches" data-act="${esc(b.act_id)}">${batchRows(b.act_id, s.batches)}</div>
        <button class="add" data-add="batches" data-act="${esc(b.act_id)}">+ Add a batch</button>
      </div></div></div>
      <div class="step live"><i>4</i><div><h4>New jobs ${SRC.type}<small>anything that is not an ad; Enter to add, the name and day are read for you</small></h4><div class="c">
        <div class="rows" data-list="jobs" data-act="${esc(b.act_id)}">${batchRows(b.act_id, s.jobs)}</div>
        <input type="text" data-quick="jobs" data-act="${esc(b.act_id)}" placeholder="Type it like you say it: Ahsan pause the retarget set Friday">
      </div></div></div>
      <div class="step live"><i>5</i><div><h4>What we need from the client ${SRC.auto} ${SRC.type}<small>goes to their Requests and the report's "What we need from you"</small></h4><div class="c">
        ${(b.asks || []).length ? `<ul class="chk">${b.asks.map(a => `<li><span class="tx">${esc(a.title)}</span><span class="o">asked ${short(a.created_at)}, still open</span></li>`).join('')}</ul>` : ''}
        <div class="rows" data-list="asks" data-act="${esc(b.act_id)}">${batchRows(b.act_id, s.asks, 'asks')}</div>
        <button class="add" data-add="asks" data-act="${esc(b.act_id)}">+ Add an ask</button>
      </div></div></div>`;
  }
  function mondayOpen() {
    const ag = D.agency_open || [];
    STATE.agency = STATE.agency || [];
    if (STATE.theme == null) STATE.theme = D.theme || '';
    return `<div class="cs-brand"><h3>Open</h3><span class="hint">5 minutes. The one thing every brand does this week, and anything that touches every brand.</span></div>
      <div class="step live"><i>1</i><div><h4>This week, every brand ${SRC.type}</h4><div class="c"><textarea data-theme placeholder="One sentence: the thing every brand does this week">${esc(STATE.theme)}</textarea></div></div></div>
      <div class="step"><i>2</i><div><h4>Open agency items ${SRC.auto}<small>not tied to one brand</small></h4><div class="c">
        ${ag.length ? itemsHtml(ag, D.today) : '<p class="hint">Nothing open across brands.</p>'}
      </div></div></div>
      <div class="step live"><i>3</i><div><h4>New agency jobs ${SRC.type}</h4><div class="c">
        <div class="rows" data-list="agency" data-act="">${batchRows('', STATE.agency)}</div>
        <input type="text" data-quick="agency" data-act="" placeholder="Type it like you say it: Cole send the BFCM calendar to every client Wednesday">
      </div></div></div>`;
  }
  function mondayCounts() {
    let jobs = (STATE.agency || []).filter(x => x.text).length, briefs = 0, asks = 0, brands = 0;
    for (const [, s] of Object.entries(STATE.brands || {})) {
      const j = (s.jobs || []).filter(x => x.text).length, bt = (s.batches || []).filter(x => x.text && x.on !== false).length, a = (s.asks || []).filter(x => x.text && x.on !== false).length;
      jobs += j; briefs += bt; asks += a; if (j || bt || a || s.read) brands++;
    }
    return { jobs, briefs, asks, brands };
  }
  function mondayClose() {
    const c = mondayCounts();
    const lines = mondayList().map(b => { const s = (STATE.brands || {})[b.act_id] || {}; const bt = (s.batches || []).filter(x => x.text && x.on !== false).length, j = (s.jobs || []).filter(x => x.text).length, a = (s.asks || []).filter(x => x.text && x.on !== false).length; return { b, bt, j, a, read: !!s.read }; }).filter(x => x.bt || x.j || x.a || x.read);
    return `<div class="cs-brand"><h3>Close</h3><span class="hint">Cross-brand items, Google or Amazon that was not per brand, then Finish.</span></div>
      <div class="step live"><i>1</i><div><h4>What Finish does</h4><div class="c">
        <div class="out">
          <div><span class="k m">M</span><div><b>${plural(c.jobs, 'job')}</b> onto Tasks. Slack reminds each owner the morning it is due.</div></div>
          <div><span class="k a">A</span><div><b>${plural(c.briefs, 'brief')}</b> numbered in each brand's Asana and on Production, ready for the kickoff.</div></div>
          <div><span class="k c">C</span><div><b>${plural(c.asks, 'ask')}</b> into the client's Requests and the report's "What we need from you".</div></div>
          <div><span class="k r">R</span><div><b>"This week"</b> lines written from each read and its batches, into every open weekly report before it goes to the client.</div></div>
        </div>
        ${lines.length ? `<ul class="chk">${lines.map(x => `<li><span class="tx"><b>${esc(x.b.name)}</b></span><span class="o">${[x.bt ? plural(x.bt, 'brief') : '', x.j ? plural(x.j, 'job') : '', x.a ? plural(x.a, 'ask') : ''].filter(Boolean).join(', ') || 'read only'}</span></li>`).join('')}</ul>` : '<p class="hint">Nothing typed yet.</p>'}
        <p class="hint">One note per brand posts under its morning card. Fireflies still records; about ten minutes after the call, anything said but not typed comes back on Calls as "Also said on the call".</p>
        <div><button class="btn2 pri" data-finish ${BUSY ? 'disabled' : ''}>Finish the call</button></div>
      </div></div></div>`;
  }

  /* ---------- CLIENT ---------- */
  const CLIENT_STEPS = [{ id: 'news', name: 'Their news', mins: 5 }, { id: 'read', name: 'The read', mins: 10 }, { id: 'week', name: 'This week', mins: 5 }, { id: 'asks', name: 'What we need from you', mins: 5 }, { id: 'coming', name: 'Coming up', mins: 5 }, { id: 'finish', name: 'Recap and finish', mins: 2 }];
  function clientRead() {
    const per = STATE.period === 'month' && D.month ? 'month' : 'week';
    const r = per === 'month' ? D.month : D.week;
    const tog = D.month && D.week ? `<div style="display:flex;gap:6px"><button class="btn2 sm ${per === 'week' ? 'pri' : ''}" data-per="week">Last week</button><button class="btn2 sm ${per === 'month' ? 'pri' : ''}" data-per="month">Last month</button></div>` : '';
    return `<div class="step"><i>2</i><div><h4>The read ${SRC.report}<small>${r ? (r.period === 'monthly' ? `${dt(r.period_start).toLocaleDateString('en-US', { month: 'long', timeZone: 'UTC' })}` : `week of ${short(r.period_start)} to ${short(r.period_end)}`) : ''}; three numbers, winners and losers in plain words. They have the report, so do not read it aloud.</small></h4><div class="c">
      ${tog}${numsHtml(r)}${adsHtml(r, D.act_id)}
    </div></div></div>`;
  }
  function clientStep(id) {
    STATE.asks = STATE.asks || []; STATE.promised = STATE.promised || [];
    const wk = D.week || {};
    if (id === 'news') return `<div class="step live"><i>1</i><div><h4>Their news ${SRC.type}<small>ask first and listen: launches, stock, offers, what customers are saying, anything that changed</small></h4><div class="c"><textarea data-news style="min-height:140px" placeholder="What they said">${esc(STATE.news || '')}</textarea></div></div></div>`;
    if (id === 'read') return clientRead();
    if (id === 'week') return `<div class="step"><i>3</i><div><h4>This week ${SRC.report}<small>what we are testing and why, one line each</small></h4><div class="c">
        ${(wk.this_week || []).length ? `<ul class="chk">${wk.this_week.map(x => `<li><span class="tx">${esc(x)}</span></li>`).join('')}</ul>` : '<p class="hint">The last report had no "This week" lines. Say what we are testing in a sentence or two.</p>'}
        <div class="sublbl"><span><b>Anything we promise on this call</b> goes on Tasks</span>${SRC.type}</div>
        <div class="rows" data-list="promised" data-act="${esc(D.act_id)}">${batchRows(D.act_id, STATE.promised)}</div>
        <input type="text" data-quick="promised" data-act="${esc(D.act_id)}" placeholder="Type it like you say it: Noma send the new offer ads Thursday">
      </div></div></div>`;
    if (id === 'asks') return `<div class="step live"><i>4</i><div><h4>What we need from you ${SRC.auto} ${SRC.type}<small>typed in front of them, with a name and a date</small></h4><div class="c">
        ${(D.asks || []).length ? `<ul class="chk">${D.asks.map(a => `<li><span class="tx">${esc(a.title)}</span><span class="o ${(Date.now() - Date.parse(a.created_at)) > 7 * 864e5 ? 'late' : ''}">asked ${short(a.created_at)}</span></li>`).join('')}</ul>` : '<p class="hint">Nothing open with them right now.</p>'}
        ${(D.approvals || []).length ? `<div class="sublbl"><span><b>Waiting for their sign-off</b> in Requests</span></div><ul class="chk">${D.approvals.map(a => `<li><span class="tx">${esc(a.title)}</span><span class="o">sent ${short(a.created_at)}</span></li>`).join('')}</ul>` : ''}
        <div class="rows" data-list="asks" data-act="${esc(D.act_id)}">${batchRows(D.act_id, STATE.asks, 'asks')}</div>
        <button class="add" data-add="asks" data-act="${esc(D.act_id)}">+ Add an ask</button>
      </div></div></div>`;
    if (id === 'coming') return `<div class="step"><i>5</i><div><h4>Coming up ${SRC.auto}<small>the next five weeks on the Calendar. An offer is locked only when it is live on their site.</small></h4><div class="c">
        ${(D.coming || []).length ? `<ul class="chk">${D.coming.map(e => `<li><span class="tx"><b>${md(e.start)}</b> · ${esc(e.name)}${e.offer ? `<br><span class="hint">${esc(e.offer)}</span>` : ''}</span><span class="o ${e.confirmed ? '' : 'late'}">${e.confirmed ? 'confirmed' : 'not confirmed'}</span></li>`).join('')}</ul>` : '<p class="hint">Nothing on the Calendar for the next five weeks. Ask what is coming.</p>'}
      </div></div></div>`;
    const recap = STATE.recap != null ? STATE.recap : recapText();
    return `<div class="step live"><i>6</i><div><h4>Recap and finish</h4><div class="c">
        <div class="out">
          <div><span class="k m">M</span><div><b>${plural((STATE.promised || []).filter(x => x.text).length, 'promise')}</b> onto Tasks, Slack reminds the owner.</div></div>
          <div><span class="k c">C</span><div><b>${plural((STATE.asks || []).filter(x => x.text && x.on !== false).length, 'new ask')}</b> into their Requests, with a Done button for them.</div></div>
          <div><span class="k r">R</span><div>Their news and the call's notes go to the team's channel for ${esc(D.name)}.</div></div>
        </div>
        ${D.has_client_channel ? `<div class="sublbl"><span><b>Recap for the client channel</b> read it, change it, then tick to post it</span></div>
          <textarea data-recap style="min-height:150px">${esc(recap)}</textarea>
          <label class="hint" style="display:flex;gap:8px;align-items:center"><input type="checkbox" data-postrecap ${STATE.post_recap ? 'checked' : ''}> Post this recap in ${esc(D.name)}'s client channel when I press Finish</label>` : '<p class="hint">This brand has no client channel, so there is no recap to post.</p>'}
        <div><button class="btn2 pri" data-finish ${BUSY ? 'disabled' : ''}>Finish the call</button></div>
      </div></div></div>`;
  }
  function recapText() {
    const wk = (D.week && D.week.this_week) || [];
    const asks = [...(D.asks || []).map(a => a.title), ...(STATE.asks || []).filter(x => x.text && x.on !== false).map(x => x.text + (x.due ? ` (by ${md(x.due)})` : ''))];
    const prom = (STATE.promised || []).filter(x => x.text).map(x => x.text + (x.due ? ` (${md(x.due)})` : ''));
    return [`Thanks for the time today. Here is what we agreed.`, wk.length || prom.length ? `\nWhat we are doing:\n${[...wk, ...prom].map(x => `• ${x}`).join('\n')}` : '', asks.length ? `\nWhat we need from you:\n${asks.map(x => `• ${x}`).join('\n')}` : ''].filter(Boolean).join('\n');
  }

  /* ---------- KICKOFF ---------- */
  let SHOW_OLD = false;
  function kickList() { return (D.briefs || []).filter(c => SHOW_OLD || !c.old); }
  function kickStep(c) {
    STATE.notes = STATE.notes || {}; STATE.deal = STATE.deal || {};
    const ctx = (D.brands || {})[c.act_id] || {};
    const card = CARD[c.id];
    const deal = STATE.deal[c.id] || (STATE.deal[c.id] = { count: '', format: c.format || 'Static', owner: c.assignee || '', due: c.due || '' });
    const done = (STATE.done || {})[c.id] || (c.kickoff_at ? { at: c.kickoff_at } : null);
    const brief = card ? (card.brief && card.brief.html && !card.brief.blank ? `<div class="brief">${card.brief.html}</div>` : '<p class="warnline">No brief written on this card yet. Write it before the kickoff, or talk it through and type the deal below.</p>') : '<p class="hint">Loading the brief...</p>';
    const insp = card ? (card.files || []).filter(f => f.kind === 'insp') : [];
    return `<div class="cs-brand"><h3>${esc(c.brand)} #${esc(c.num)}</h3><span class="pill">${esc(c.title)}</span>${done ? `<span class="pill good">Kicked off ${md(done.at)}</span>` : ''}</div>
      <div class="step"><i>1</i><div><h4>The brief ${SRC.auto}<small>the page on the Production card; the strategist explains the idea, not a read-through</small></h4><div class="c">${brief}
        <div><button class="btn2 sm" data-editbrief="${esc(c.id)}">Open the card</button>${c.asana_url ? ` <a class="btn2 sm" href="${esc(c.asana_url)}" target="_blank" rel="noopener">Asana</a>` : ''}</div></div></div></div>
      <div class="step"><i>2</i><div><h4>References ${SRC.auto}<small>what is working for ${esc(c.brand)} now, then the inspiration on the card; say what to take from each</small></h4><div class="c">
        ${(ctx.winners || []).length ? `<div class="sublbl"><span><b>${esc(c.brand)}'s winners</b> ${ctx.basis === 'tw' ? 'last week, by Triple Whale ROAS' : 'last week, by spend'}</span></div><div class="ads">${ctx.winners.map(a => adCard(a, 'win')).join('')}</div>` : '<p class="hint">No weekly report yet, so no winners to show.</p>'}
        ${insp.length ? `<div class="sublbl"><span><b>Inspiration on the card</b></span></div><div class="ads">${insp.map(f => `<div class="ad"><div class="th" style="background-image:url('${esc(f.thumb || f.url)}')">${/^video\//.test(f.mime || '') ? '<span class="vid">Video</span>' : ''}</div><div class="n">${esc(f.name || '')}</div></div>`).join('')}</div>` : card ? '<p class="hint">No inspiration files on the card. Add two or three before the call next time.</p>' : ''}
      </div></div></div>
      <div class="step"><i>3</i><div><h4>Assets and brand rules ${SRC.auto}</h4><div class="c">
        ${ctx.drive ? `<p><a href="${esc(ctx.drive)}" target="_blank" rel="noopener">Open ${esc(c.brand)}'s Drive folder</a></p>` : '<p class="hint">No Drive folder linked for this brand (Settings > Connections).</p>'}
      </div></div></div>
      <div class="step live"><i>4</i><div><h4>The designer's questions and pitch ${SRC.type}<small>a better way wins</small></h4><div class="c"><textarea data-knote="${esc(c.id)}" placeholder="What they asked, and what changed">${esc(STATE.notes[c.id] || '')}</textarea></div></div></div>
      <div class="step live"><i>5</i><div><h4>Agree the count, the format and the due date ${SRC.type}<small>kickoff plus two full working days</small></h4><div class="c">
        <div class="deal">
          <label>How many<input type="text" inputmode="numeric" data-deal="count" value="${esc(deal.count)}" placeholder="4"></label>
          <label>Format<select data-deal="format">${['Static', 'Video', 'UGC', 'Carousel'].map(f => `<option ${f === deal.format ? 'selected' : ''}>${f}</option>`).join('')}</select></label>
          <label>Who makes it<select data-deal="owner">${teamOpts(deal.owner)}</select></label>
          <label>Due<input type="date" data-deal="due" value="${esc(deal.due || twoDays())}"></label>
        </div>
        <div><button class="btn2 pri" data-kickdone="${esc(c.id)}" ${BUSY ? 'disabled' : ''}>${done ? 'Save it again' : 'Agreed: send it to Making'}</button></div>
        <p class="hint">Saves one comment on the card (and its Asana task) with what was agreed, sets the owner and due date, and moves it to Making.</p>
      </div></div></div>`;
  }
  function twoDays() {
    const d = dt(D.today); let n = 0;
    while (n < 2) { d.setUTCDate(d.getUTCDate() + 1); const w = d.getUTCDay(); if (w !== 0 && w !== 6) n++; }
    return d.toISOString().slice(0, 10);
  }
  async function loadCard(id) {
    if (CARD[id]) return;
    try { CARD[id] = await H.apiAH(`/api/production/card?id=${encodeURIComponent(id)}`); } catch (e) { CARD[id] = { brief: { html: `<p>${esc(e.message)}</p>` }, files: [] }; }
    if (KIND === 'kickoff' && steps()[POS] && steps()[POS].id === id) paintMain();
  }

  /* ---------- the frame ---------- */
  function steps() {
    if (KIND === 'monday') return mondaySteps();
    if (KIND === 'client') return CLIENT_STEPS;
    return kickList().map(c => ({ id: c.id, name: `${c.brand} #${c.num} ${c.title}`, sub: c.title, mins: 4, c }));
  }
  const TITLE = { monday: 'Monday call', client: 'Client call', kickoff: 'Creative kickoff' };
  function whoHtml() {
    if (KIND === 'monday') return `<div><b>When</b><span>Monday 8:00am CT, under an hour</span></div><div><b>In the room</b><span>Cole, Ahsan, Noma, Radhesh, Hamza</span></div><div><b>Talks</b><span>Each brand's strategist; Radhesh and Hamza on their rows</span></div><div><b>Types</b><span>Whoever shares the screen</span></div><div><b>Before the call</b><span>Strategists post the Monday plan in Slack by 7:45</span></div>`;
    if (KIND === 'client') return `<div><b>With</b><span>${esc(D.name)}, their strategist, Cole when it matters</span></div><div><b>Shares the screen</b><span>The strategist</span></div><div><b>The client sees</b><span>Only their brand: numbers, ads, their asks, their dates</span></div><div><b>Types</b><span>Their news, new asks, anything we promise</span></div><div><b>Length</b><span>30 minutes, same order every time</span></div>`;
    return `<div><b>When</b><span>Tuesday or Wednesday, 15 to 20 minutes for a group of briefs</span></div><div><b>In the room</b><span>The strategist, William (statics), Ravo (video)</span></div><div><b>Shares the screen</b><span>The strategist</span></div><div><b>Types</b><span>The designer's questions and the deal</span></div><div><b>The rule</b><span>No brief goes to build without this call</span></div>`;
  }
  function sideHtml() {
    if (KIND === 'monday') {
      const c = mondayCounts();
      return `<h4>So far</h4><div class="out">
          <div><span class="k m">M</span><div><b>${plural(c.jobs, 'job')}</b> for Tasks</div></div>
          <div><span class="k a">A</span><div><b>${plural(c.briefs, 'brief')}</b> for Production</div></div>
          <div><span class="k c">C</span><div><b>${plural(c.asks, 'ask')}</b> for clients</div></div></div>
        <h4>After the call</h4><p class="hint">Finish sends it all where it lives. No approve step: you typed it. Fireflies still records and sends back only what was said but not typed.</p>
        <h4>Keys</h4><div class="keys"><kbd>→</kbd> next <kbd>←</kbd> back <kbd>Enter</kbd> add a job<br><kbd>Ctrl</kbd>+<kbd>Enter</kbd> go to Close</div>`;
    }
    if (KIND === 'client') return `<h4>Same order every time</h4><p class="hint">Ask first, listen, then the read. The report already went out; the call is for what the report cannot say.</p><h4>After the call</h4><p class="hint">Finish puts new asks in their Requests and promises on Tasks. Fireflies sends back anything said but not typed.</p><h4>Keys</h4><div class="keys"><kbd>→</kbd> next <kbd>←</kbd> back</div>`;
    const n = kickList().length, done = kickList().filter(c => (STATE.done || {})[c.id] || c.kickoff_at).length;
    return `<h4>Briefs</h4><p class="hint"><b>${done} of ${n}</b> kicked off.</p><h4>Where they come from</h4><p class="hint">Every card in Production's Brief column. Monday's batches land there when the Monday call is finished.</p><h4>Keys</h4><div class="keys"><kbd>→</kbd> next brief <kbd>←</kbd> back</div>`;
  }
  function railHtml() {
    const st = steps();
    const lbl = KIND === 'monday' ? 'Red brands first' : KIND === 'client' ? 'Same order every time' : 'Ready briefs';
    return `<div class="lbl">${lbl}</div>` + st.map((s, i) => {
      const done = KIND === 'kickoff' ? !!((STATE.done || {})[s.id] || s.c.kickoff_at) : i < POS;
      const dot = KIND === 'monday' && s.id !== 'open' && s.id !== 'close' ? `<span class="dot ${s.sev || ''}"></span>` : '';
      return `<button data-pos="${i}" aria-current="${i === POS}" class="${done ? 'done' : ''}" ${s.sub ? `title="${esc(s.sub)}"` : ''}>${dot}<span class="t">${esc(s.name)}</span><small>${s.mins}m</small></button>`;
    }).join('') + (KIND === 'kickoff' && (D.briefs || []).some(c => c.old) ? `<button data-old style="color:var(--brand-ink);font-weight:600">${SHOW_OLD ? 'Hide' : 'Show'} ${(D.briefs || []).filter(c => c.old).length} older briefs</button>` : '');
  }
  function mainHtml() {
    const st = steps(), s = st[POS];
    if (!s) return `<div class="empty">${KIND === 'kickoff' ? 'No briefs in Production\'s Brief column. Monday\'s batches land there when the Monday call is finished, or add one on Production.' : 'Nothing to show.'}</div>`;
    if (KIND === 'monday') return s.id === 'open' ? mondayOpen() : s.id === 'close' ? mondayClose() : mondayBrand(D.brands.find(b => b.act_id === s.id));
    if (KIND === 'client') return clientStep(s.id);
    loadCard(s.id);
    return kickStep(s.c);
  }
  function stageLabel() {
    const st = steps(), s = st[POS];
    if (!s) return '';
    if (KIND === 'monday') { const n = st.length - 2; return s.id === 'open' ? 'Open' : s.id === 'close' ? 'Close' : `Brand ${POS} of ${n}`; }
    if (KIND === 'client') return `Step ${POS + 1} of ${st.length}`;
    return `Brief ${POS + 1} of ${st.length}`;
  }
  function finishedHtml() {
    const c = D.call, r = c.result || {};
    const all = [...(r.brands || []), ...(r.agency ? [r.agency] : [])];
    const n = k => all.reduce((s, b) => s + (b[k] || []).filter(t => !t.error).length, 0);
    return `<div class="cs-stage"><div class="cs-main"><div class="cs-brand"><h3>Finished</h3><span class="hint">by ${esc(firstName(c.finished_by))} at ${c.finished_at ? new Date(c.finished_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : ''}</span></div>
      ${KIND === 'kickoff' ? `<p>${plural(r.briefs || 0, 'brief')} kicked off and moved to Making.</p>` : `<div class="out">
        <div><span class="k m">M</span><div><b>${plural(n('tasks'), 'job')}</b> on Tasks</div></div>
        <div><span class="k a">A</span><div><b>${plural(n('briefs'), 'brief')}</b> on Production and in Asana</div></div>
        <div><span class="k c">C</span><div><b>${plural(n('asks'), 'ask')}</b> in Requests</div></div>
        <div><span class="k r">R</span><div><b>${all.filter(b => b.report).length}</b> weekly report${all.filter(b => b.report).length === 1 ? '' : 's'} got "This week"</div></div></div>
        ${(r.warnings || []).length ? `<div class="warnline">${r.warnings.map(esc).join('<br>')}</div>` : ''}
        ${r.recap ? `<p class="hint">${r.recap.posted ? 'The recap is in the client channel.' : `The recap was not posted: ${esc(r.recap.why || '')}`}</p>` : ''}`}
      <div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn2" data-go="tasks">Open Tasks</button><button class="btn2" data-go="production">Open Production</button><button class="btn2" data-go="calls">Back to Calls</button></div>
    </div></div>`;
  }
  function paint() {
    const host = $('#main'); if (!host) return;
    const title = KIND === 'client' ? `${D.name}: client call` : TITLE[KIND];
    const finished = D.call && D.call.status === 'finished';
    host.innerHTML = `<div class="v2 cs" id="csRoot">
      <div class="cs-top"><button class="cs-back" data-go="calls">← Calls</button><h1>${esc(title)}</h1><span class="sub">${md(D.today)}</span><span style="flex:1"></span>
        <div class="cs-legend"><span>Every box says where it comes from:</span>${SRC.auto}${KIND === 'monday' ? SRC.slack('the strategist') : ''}${SRC.type}</div>
        <button class="btn2" id="csPresent" title="Full screen for sharing">Present</button></div>
      <div class="cs-who">${whoHtml()}</div>
      ${finished ? finishedHtml() : `<div class="cs-stage">
        <div class="cs-bar"><h2 id="csStage">${esc(stageLabel())}</h2><span class="cs-saved" id="csSaved">${SAVED_AT ? 'Saved' : ''}</span><span class="cs-clock" id="csClock">00:00</span>
          <button class="btn2" id="csPrev">Back</button><button class="btn2 pri" id="csNext">Next</button></div>
        <div class="cs-body"><nav class="cs-rail" id="csRail">${railHtml()}</nav><div class="cs-main" id="csMain">${mainHtml()}</div><aside class="cs-side" id="csSide">${sideHtml()}</aside></div>
        <div class="cs-foot"><span class="n">${KIND === 'monday' ? 'Nothing here is read aloud. The strategist talks; the screen keeps the order and the clock.' : KIND === 'client' ? 'The client sees only their own brand on this screen.' : 'Kickoff Tuesday is due Thursday end of day; Wednesday is due Friday.'}</span>
          ${KIND === 'kickoff' ? `<button class="btn2 pri" data-finish ${BUSY ? 'disabled' : ''}>Finish the kickoff</button>` : `<button class="btn2" id="csToEnd">Go to ${KIND === 'monday' ? 'Close' : 'Finish'}</button>`}</div>
      </div>`}
    </div>`;
    wire();
    if (!finished) { const s = steps()[POS]; startClock((s ? s.mins : 5) * 60); }
  }
  function paintMain() {
    const m = $('#csMain'); if (!m) return;
    m.innerHTML = mainHtml(); $('#csRail').innerHTML = railHtml(); $('#csSide').innerHTML = sideHtml(); $('#csStage').textContent = stageLabel();
    wireMain(); wireRail();
  }
  function go(i) {
    const n = steps().length; if (!n) return;
    POS = Math.max(0, Math.min(n - 1, i));
    paintMain(); const s = steps()[POS]; startClock((s ? s.mins : 5) * 60);
    const r = $('#csRoot'); if (r && !document.fullscreenElement) r.scrollIntoView({ block: 'start' });
    if (KIND === 'monday' && s && s.id !== 'open' && s.id !== 'close') loadGoogle(s.id);
  }
  async function loadGoogle(act) {
    if (GOOGLE[act] !== undefined) return;
    const b = D.brands.find(x => x.act_id === act); const r = b && b.read;
    if (!r || !r.google) { GOOGLE[act] = null; return; }
    GOOGLE[act] = null;
    try { GOOGLE[act] = await H.apiAH(`/api/calls/google?act=${encodeURIComponent(act)}&from=${r.period_start}&to=${r.period_end}`); } catch { GOOGLE[act] = null; }
    const s = steps()[POS]; if (s && s.id === act) paintMain();
  }

  /* ---------- wiring ---------- */
  function wireRail() { $$('#csRail [data-pos]').forEach(b => b.onclick = () => go(+b.dataset.pos)); const o = $('#csRail [data-old]'); if (o) o.onclick = () => { const cur = steps()[POS]; SHOW_OLD = !SHOW_OLD; const i = cur ? steps().findIndex(s => s.id === cur.id) : 0; go(i >= 0 ? i : 0); }; }
  function listOf(name, act) {
    if (KIND === 'monday') { if (name === 'agency') return (STATE.agency = STATE.agency || []); return brandState(act)[name]; }
    return (STATE[name] = STATE[name] || []);
  }
  function wireMain() {
    const root = $('#csMain'); if (!root) return;
    wireCommon(root);
    /* last week's items: instant */
    $$('[data-item] input[type=checkbox]', root).forEach(cb => cb.onchange = async () => {
      const li = cb.closest('[data-item]'); li.classList.toggle('off', cb.checked);
      try { await post('/api/calls/done', { item: li.dataset.item, done: cb.checked }); } catch (e) { cb.checked = !cb.checked; li.classList.toggle('off', cb.checked); toast(e.message); }
    });
    /* typed fields */
    $$('[data-read]', root).forEach(t => t.oninput = () => { const st = brandState(t.dataset.read); st.read = t.value; st.edited = true; save(); });
    const th = $('[data-theme]', root); if (th) th.oninput = () => { STATE.theme = th.value; save(); };
    const nw = $('[data-news]', root); if (nw) nw.oninput = () => { STATE.news = nw.value; save(); };
    const rc = $('[data-recap]', root); if (rc) rc.oninput = () => { STATE.recap = rc.value; save(); };
    const pr = $('[data-postrecap]', root); if (pr) pr.onchange = () => { STATE.post_recap = pr.checked; save(); };
    $$('[data-per]', root).forEach(b => b.onclick = () => { STATE.period = b.dataset.per; save(); paintMain(); });
    $$('[data-knote]', root).forEach(t => t.oninput = () => { STATE.notes = STATE.notes || {}; STATE.notes[t.dataset.knote] = t.value; save(); });
    $$('[data-deal]', root).forEach(f => f.oninput = f.onchange = () => { const id = steps()[POS].id; STATE.deal = STATE.deal || {}; STATE.deal[id] = STATE.deal[id] || {}; STATE.deal[id][f.dataset.deal] = f.value; save(); });
    /* row lists */
    $$('[data-list]', root).forEach(list => {
      const arr = () => { if (KIND === 'monday' && list.dataset.act) brandState(list.dataset.act).edited = true; return listOf(list.dataset.list, list.dataset.act); };
      $$('.row', list).forEach(row => {
        const i = +row.dataset.i;
        $$('[data-f]', row).forEach(f => {
          const k = f.dataset.f;
          if (k === 'del') f.onclick = () => { arr().splice(i, 1); save(); paintMain(); };
          else if (k === 'on') f.onchange = () => { arr()[i].on = f.checked; row.classList.toggle('off', !f.checked); save(); $('#csSide').innerHTML = sideHtml(); };
          else f.oninput = f.onchange = () => { arr()[i][k] = f.value; save(); if (k === 'text') $('#csSide').innerHTML = sideHtml(); };
        });
      });
    });
    $$('[data-add]', root).forEach(b => b.onclick = () => { if (KIND === 'monday' && b.dataset.act) brandState(b.dataset.act).edited = true; listOf(b.dataset.add, b.dataset.act).push({ text: '', owner: '', due: '' }); save(); paintMain(); const rows = $$(`[data-list="${b.dataset.add}"] .row input[data-f=text]`); const last = rows[rows.length - 1]; if (last) last.focus(); });
    $$('[data-quick]', root).forEach(inp => inp.onkeydown = async e => {
      if (e.key !== 'Enter' || !inp.value.trim()) return;
      e.preventDefault();
      const text = inp.value.trim(), name = inp.dataset.quick, act = inp.dataset.act;
      inp.value = ''; inp.placeholder = 'Reading it...';
      let p = { text, owner: '', due: '' };
      try { const r = await post('/api/calls/parse', { text, act }); if (r && r.text) p = { text: r.text, owner: r.owner || '', due: r.due || '' }; } catch {}
      if (KIND === 'monday' && act) brandState(act).edited = true;
      listOf(name, act).push(p); save(); paintMain();
      const again = $(`[data-quick="${name}"]`); if (again) again.focus();
    });
    /* kickoff */
    $$('[data-editbrief]', root).forEach(b => b.onclick = () => { if (window.ProdSheet) window.ProdSheet.open(H, b.dataset.editbrief, { onChange: () => { delete CARD[b.dataset.editbrief]; loadCard(b.dataset.editbrief); } }); else H.show('production'); });
    $$('[data-kickdone]', root).forEach(b => b.onclick = async () => {
      const id = b.dataset.kickdone, deal = (STATE.deal || {})[id] || {};
      const dealDue = $('[data-deal=due]', root).value;
      b.disabled = true; b.textContent = 'Saving...';
      try {
        const r = await post('/api/calls/kickoff/done', { id: D.call.id, card: id, note: (STATE.notes || {})[id] || '', count: deal.count || '', format: deal.format || $('[data-deal=format]', root).value, owner: deal.owner != null ? deal.owner : $('[data-deal=owner]', root).value, due: dealDue });
        STATE.done = STATE.done || {}; STATE.done[id] = { at: new Date().toISOString(), text: r.text };
        const c = kickList().find(x => x.id === id); if (c) c.kickoff_at = new Date().toISOString();
        toast(r.asana && r.asana.why ? `Moved to Making. Asana: ${r.asana.why}` : 'Moved to Making with the deal on the card.');
        const next = kickList().findIndex((x, i) => i > POS && !((STATE.done || {})[x.id] || x.kickoff_at));
        if (next >= 0) go(next); else paintMain();
      } catch (e) { toast(e.message); b.disabled = false; b.textContent = 'Agreed: send it to Making'; }
    });
    $$('[data-finish]', root).forEach(wireFinish);
  }
  function wireFinish(b) {
    b.onclick = async () => {
      if (BUSY) return;
      const sure = window.confirmModal ? await window.confirmModal(KIND === 'kickoff' ? 'Finish the kickoff?' : 'Finish the call?', KIND === 'kickoff' ? 'Briefs not kicked off stay in the Brief column for next time.' : 'Everything typed goes where it lives: Tasks, Production and Asana, Requests, the weekly reports and Slack. This cannot be undone from here.', 'Finish') : true;
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
    $$('[data-go]', root).forEach(b => b.onclick = () => { clearInterval(CLOCK); if (document.fullscreenElement) document.exitFullscreen().catch(() => {}); H.show(b.dataset.go); });
    const pres = $('#csPresent'); if (pres) pres.onclick = () => { if (document.fullscreenElement) document.exitFullscreen().catch(() => {}); else root.requestFullscreen && root.requestFullscreen().catch(() => toast('Full screen is not available here.')); };
    const n = $('#csNext'); if (n) n.onclick = () => go(POS + 1);
    const p = $('#csPrev'); if (p) p.onclick = () => go(POS - 1);
    const e = $('#csToEnd'); if (e) e.onclick = () => go(steps().length - 1);
    $$('[data-finish]', root).forEach(wireFinish);
    wireRail(); wireMain();
  }
  function keys(e) {
    if (!$('#csRoot')) { document.removeEventListener('keydown', keys); return; }
    if (e.ctrlKey && e.key === 'Enter') { e.preventDefault(); go(steps().length - 1); return; }
    if (e.target.closest && e.target.closest('input,textarea,select,[contenteditable]')) return;
    if (e.key === 'ArrowRight') { e.preventDefault(); go(POS + 1); }
    if (e.key === 'ArrowLeft') { e.preventDefault(); go(POS - 1); }
  }

  /* ---------- open ---------- */
  function pickBrand() {
    const brands = (H.S.accounts || H.S.brands || []).filter(a => a.active !== false).map(a => ({ act_id: a.act_id, name: a.name }));
    $('#main').innerHTML = `<div class="v2 cs" id="csRoot"><div class="cs-top"><button class="cs-back" data-go="calls">← Calls</button><h1>Client call</h1></div>
      <div class="cs-stage"><div class="cs-main"><h4 style="margin:0">Which client is on the call?</h4><div class="picker">${brands.map(b => `<button data-pick="${esc(b.act_id)}">${esc(b.name)}</button>`).join('') || '<p class="hint">No brands.</p>'}</div></div></div></div>`;
    $$('[data-pick]').forEach(b => b.onclick = () => open(H, 'client', b.dataset.pick));
    $$('[data-go]').forEach(b => b.onclick = () => H.show(b.dataset.go));
  }
  async function open(host, kind, act) {
    H = host; css(); KIND = ['monday', 'client', 'kickoff'].includes(kind) ? kind : 'monday'; ACT = act && act !== 'all' ? act : '';
    POS = 0; CARD = {}; GOOGLE = {}; SAVED_AT = null; BUSY = false;
    if (KIND === 'client' && !ACT) { pickBrand(); return; }
    $('#main').innerHTML = `<div class="v2 cs"><div class="cs-top"><h1>${TITLE[KIND]}</h1><span class="sub">Getting everything ready...</span></div></div>`;
    try {
      const [d, cmd] = await Promise.all([
        H.apiAH(`/api/calls/screen?kind=${KIND}${ACT ? `&act=${encodeURIComponent(ACT)}` : ''}`),
        KIND === 'monday' ? H.api('/api/hub/command').catch(() => null) : null,
      ]);
      if (d.error) throw new Error(d.error);
      D = d; STATE = (d.call && d.call.state) || {}; SEV = {};
      if (cmd && Array.isArray(cmd.brands)) for (const b of cmd.brands) SEV[b.act_id] = b.paused ? undefined : (b.reasons || []).reduce((w, r) => r.sev === 'bad' ? 'bad' : (w === 'bad' ? w : r.sev === 'warn' ? 'warn' : w), 'good');
      if (KIND === 'kickoff') { const first = kickList().findIndex(c => !((STATE.done || {})[c.id] || c.kickoff_at)); POS = first >= 0 ? first : 0; }
    } catch (e) { $('#main').innerHTML = `<div class="v2 cs"><div class="cs-top"><button class="cs-back" onclick="window.CallScreen && window.CallScreen.back()">← Calls</button><h1>${TITLE[KIND]}</h1></div><p style="color:var(--bad)">${esc(e.message)}</p></div>`; return; }
    paint();
    document.removeEventListener('keydown', keys); document.addEventListener('keydown', keys);
  }
  window.CallScreen = { open, back: () => H && H.show('calls') };
})();

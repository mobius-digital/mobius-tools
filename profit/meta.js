/* Mobius — the Meta section.
 *
 * These are the Meta-only screens that used to be the separate "Account Health"
 * dashboard, now sub-tabs inside Mobius. They live in their own file and their
 * own IIFE for two reasons: a merged single file would be ~4,400 lines, and
 * almost every helper here (esc, fmtMoney, S, api, …) shares a name with one in
 * the host page. Shadowing them inside a closure means neither side can change
 * the other's behaviour by accident — fmtPct differs between the two, for one,
 * and this file needs its own signed version.
 *
 * It talks to the account-health worker DIRECTLY rather than through the host
 * worker's proxy: that worker still owns the Meta sync, both crons and the
 * secrets, and it already accepts the same Mobius session token. Nothing about
 * the backend moved — only the screens.
 *
 * Everything here is Meta-reported and matches Ads Manager. Blended,
 * store-level money lives on the other tabs, deliberately.
 */
(function () {
'use strict';

const AH_URL = 'https://mobius-account-health.mobius-digital.workers.dev';
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

/* Local state. The host passes the signed-in token and the selected client in on
   every render, so this file never reaches into the host page's globals. */
const S = { url: AH_URL, tok: '', act: 'all', accounts: [], overview: null, health: null };

async function api(path, opts = {}) {
  const res = await fetch(S.url.replace(/\/+$/, '') + path, {
    ...opts,
    headers: { 'Authorization': 'Bearer ' + S.tok,
      ...(opts.body ? { 'Content-Type': 'application/json' } : {}), ...(opts.headers || {}) },
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(j.error || ('HTTP ' + res.status));
  return j;
}

/* ---------- formatting (deliberately local — fmtPct here is SIGNED) ---------- */
const fmtMoney = (n, cur) => n == null ? '—' : new Intl.NumberFormat('en-US', { style:'currency', currency: cur||'USD', maximumFractionDigits: Math.abs(n) >= 1000 ? 0 : 2 }).format(n);
const sym = cur => { try { return new Intl.NumberFormat('en-US',{style:'currency',currency:cur||'USD'}).formatToParts(1).find(p=>p.type==='currency').value; } catch { return '$'; } };
const fmtK = (n, cur) => n == null ? '—' : Math.abs(n) >= 1000 ? (sym(cur) + (n/1000).toFixed(1) + 'K') : fmtMoney(n, cur);
const fmtPct = (n, d=1) => n == null ? '—' : (n>0?'+':'') + (n*100).toFixed(d) + '%';
const fmtX = n => n == null ? '—' : n.toFixed(2) + 'x';
const parseTs = iso => new Date(iso.replace(' ', 'T') + (/Z$|[+-]\d\d:?\d\d$/.test(iso) ? '' : 'Z'));
const fmtAgo = iso => { if (!iso) return 'never'; const m = (Date.now() - parseTs(iso).getTime())/60000; return m<60 ? `${Math.round(m)}m ago` : m<1440 ? `${Math.round(m/60)}h ago` : `${Math.round(m/1440)}d ago`; };

/* helpModal / noteModal are the host page's — same signature, one modal style. */
const mnote = msg => noteModal('Could not save', `<p>${esc(msg)}</p>`);

/** Nothing to show yet, and why. */
function setupBanner() {
  if (S.health && S.health.hasMetaToken === false) return `<div class="notice bad">⚠️ <div><b>Meta token not set.</b> Nothing can sync until <code>META_TOKEN</code> is added to the worker.</div></div>`;
  if (!S.accounts.length) return `<div class="notice warn">ℹ️ <div>No ad accounts found yet. Go to <b>Settings → Find ad accounts on Meta</b>.</div></div>`;
  if (!S.accounts.some(a => a.active)) return `<div class="notice warn">ℹ️ <div>No accounts are switched on. Turn on the clients you want tracked in <b>Settings</b> — the first sync backfills 90 days.</div></div>`;
  return '';
}

/** delta pill: lowerIsBetter flips coloring (CPA, CPM). */
function delta(cur, prev, lowerIsBetter=false) {
  if (cur == null || prev == null || !prev) return '<span class="delta unk">—</span>';
  const d = cur/prev - 1;
  const good = lowerIsBetter ? d < 0 : d > 0;
  const cls = Math.abs(d) < 0.02 ? 'unk' : good ? 'good' : 'bad';
  return `<span class="delta ${cls}">${fmtPct(d,0)}</span>`;
}

/* ---------- in-app dialog (replaces browser prompt()) ---------- */
function modal({ title, hint, value = '', placeholder = '', multiline = false, save = 'Save' }) {
  return new Promise(resolve => {
    const w = document.createElement('div');
    w.className = 'modal-wrap';
    w.innerHTML = `<div class="modal">
      <h3>${esc(title)}</h3>${hint ? `<p class="hint">${esc(hint)}</p>` : ''}
      ${multiline ? `<textarea id="mVal" placeholder="${esc(placeholder)}"></textarea>` : `<input id="mVal" type="text" placeholder="${esc(placeholder)}">`}
      <div class="row" style="justify-content:flex-end;gap:8px;margin:14px 0 0">
        <button class="btn" data-m="cancel">Cancel</button>
        <button class="btn primary" data-m="ok">${esc(save)}</button>
      </div></div>`;
    document.body.appendChild(w);
    const inp = w.querySelector('#mVal');
    inp.value = value || '';
    inp.focus();
    if (inp.setSelectionRange) inp.setSelectionRange(inp.value.length, inp.value.length);
    const done = v => { w.remove(); document.removeEventListener('keydown', onKey); resolve(v); };
    const onKey = e => {
      if (e.key === 'Escape') done(null);
      if (e.key === 'Enter' && (!multiline || e.ctrlKey || e.metaKey)) done(inp.value);
    };
    document.addEventListener('keydown', onKey);
    w.addEventListener('mousedown', e => { if (e.target === w) done(null); });
    w.querySelector('[data-m="ok"]').onclick = () => done(inp.value);
    w.querySelector('[data-m="cancel"]').onclick = () => done(null);
  });
}

/* ---------- "How to use" page guides ---------- */

const META_HELP = {
  averages: `
    <p><b>What this page is:</b> every metric compared to this account's <i>own</i> last-30-days normal. Not industry benchmarks — its own baseline. That's how you spot "something changed" without a spreadsheet.</p>
    <p><b>The 10-second daily read:</b> scan the verdict word under each card — "improving"/"recovering" show in green text, "slipping"/"declining" in red, "flat" in gray. (The chart lines are always blue = 7-day and gray = 30-day; only the words and the card's top edge are color-coded.) All green or flat → move on. Red on CPA or ROAS → click that card, see where it turned, and check whether a change dot lines up with the turn.</p>
    <p><b>Momentum table:</b> the "did something break in the last day or two" check. If Yesterday or the 3-day is 15%+ off the 7-day, investigate today, not next week.</p>
    <p><b>Judging rules:</b> ignore moves under ~5% (noise). The last 3 days always look worse than they'll end up — conversions keep landing for ~72h. Trust the 7-day vs 30-day comparison before reacting; use the 3-day only as an early warning.</p>
`,
  today: `
    <p><b>What this page is:</b> is today running hot or cold compared with a normal day for this account? It is the only view in Mobius that looks <i>inside</i> the current day.</p>
    <p><b>The curve:</b> today's cumulative Meta spend against the average shape of the last 7 days by the same hour. Over +10% = running hot, under -10% = delivery running cold. Either is worth a look in Ads Manager.</p>
    <p><b>Projected today</b> is today's spend divided by the share of a normal day that is usually finished by this hour — so if a typical day is 15% done and this one has spent $166, it projects about $1.1k. It assumes today keeps the same hourly shape as the last 7 days and that nobody changes a budget after you look. <b>Early in the day it is a big extrapolation</b>, which is why the card says what share of a normal day is in; under 5% it refuses to project at all. <b>Refresh</b> re-pulls from Meta.</p>
    <p><b>Why there is no monthly pacing here any more:</b> the month is planned and forecast in <b>Plan</b>, against blended revenue and total spend across every platform. A second, Meta-only version of the same question disagreed with it and was the noisier of the two. What survives is the part Plan genuinely cannot see: what is happening in the last few hours.</p>
    <p><b>Meta only</b> — every figure here matches Ads Manager.</p>`,
  changelog: `
    <p><b>What this page is:</b> the permanent record of what we changed, when, who, and why — pulled from Meta automatically every night. Nobody has to write anything down.</p>
    <p><b>Daily habit (optional, ~3 clicks):</b> when you make a move that matters — budget change, kill, launch — find it here and tag the <b>why</b>. Amber suggestions are pre-filled guesses; ✓ accepts one. Use <b>+ note</b> for context worth remembering.</p>
    <p><b>✗</b> hides junk from summaries. <b>+ Add change</b> records things Meta can't see (promo started, landing page swapped, tracking fixed).</p>
    <p><b>✦ Summarise:</b> Claude writes the daily standup, weekly recap, or a client-safe update from the tagged changes + performance. The more whys you tag, the smarter it reads.</p>
    <p><b>Forensics:</b> CPA spiked Tuesday? Set the dates to Tuesday and see exactly what changed.</p>`,
  creative: `
    <p><b>The problem this page catches:</b> ads wear out. The same people see them over and over, performance slowly fades, and CPA creeps up. Teams usually notice <i>after</i> the spike. This page shows whether we're feeding the account new ads <i>before</i> that happens.</p>
    <p><b>The four cards, in order:</b> ① how much of the budget went to new ads (the number to protect — if it keeps falling, we're coasting) · ② the average age of the ads the money ran on (creeping up = same warning) · ③ <b>Fresh CPA</b> — CPA from new ads · ④ <b>Stale CPA</b> — CPA from older ads.</p>
    <p><b>Fresh vs stale CPA:</b> don't panic if fresh looks pricier — new ads need a few days for Meta to optimize. What matters is the pattern over weeks, which is what the highlighted sentence and the bottom chart show: when we launch more, does CPA hold or improve? If yes, there's no excuse to slow the launch cadence.</p>
    <p><b>The ad table:</b> every ad that spent in the window, biggest spender first, with a <b>scale</b> / <b>cut or fix</b> read based on how its CPA compares to this account's own average. It's the "what do I actually do today" list — but give brand-new ads a few days before judging them.</p>
    <p><b>The bars:</b> one bar per week, dark green = brand-new ads' share of that week's spend. Watch whether the dark green is growing or dying.</p>
    <p><b>What's a good new-ad share?</b> Rough zones: with "new = ≤7 days" aim for ~10–20%; ≤14 days ~15–30%; ≤30 days ~25–45%. Below the zone = coasting (fatigue builds, CPA pays later). Way above it every week = churning — winners never mature, or nothing is sticking. Two overrides: scaling accounts should sit at the top of the zone or higher, and if Fresh CPA keeps beating Stale CPA, push above the band without guilt.</p>
    <p><b>When to look:</b> Monday creative meeting, once a week. This is a weeks-scale question — daily checking tells you nothing new.</p>`,
};

/* ---------- Change Log (Chat 1) ---------- */
const CL = {
  range: localStorage.getItem('ah_cl_range') || '7',
  from: null, to: null,           // used when range === 'custom'
  q: '', hide: new Set(),         // hidden categories
  rows: [], truncated: false, panel: null,   // panel: 'add' | 'sum' | null
};
const CL_REASONS = ['Positive performance','Negative performance','Testing','Creative refresh','Budget cap','Client request','Promo / seasonal','Housekeeping','Revert / mistake'];
const CL_ADD_CATS = ['budget','new_creative','new_adset','new_campaign','ad_paused','ad_relaunched','campaign_paused','campaign_relaunched','bid_strategy','targeting','optimisation','schedule','other'];
const ymdLocal = d => new Intl.DateTimeFormat('en-CA',{year:'numeric',month:'2-digit',day:'2-digit'}).format(d);
function clDates() {
  const shift = n => ymdLocal(new Date(Date.now() - n*86400e3));
  if (CL.range === 'today') return [shift(0), shift(0)];
  if (CL.range === 'yday') return [shift(1), shift(1)];
  if (CL.range === 'custom') return [CL.from || shift(6), CL.to || shift(0)];
  return [shift(+CL.range - 1), shift(0)];
}

async function renderChangeLog() {
  const [from, to] = clDates();
  $('#main').innerHTML = `<h2>Change Log</h2>
    <p class="sub">Every change on the account — Meta's activity log plus manual entries — with why it was made. Tag a reason on the moves that matter and let Claude write the update. ✓ and ✗ are optional: ✓ locks in a change (and accepts an amber suggested reason), ✗ hides noise from summaries.</p>
    ${setupBanner()}
    <div class="row">
      ${[['today','Today'],['yday','Yesterday'],['7','7 days'],['14','14 days'],['30','30 days'],['90','90 days']].map(([v,l]) =>
        `<button class="chip ${CL.range===v?'on':''}" data-r="${v}">${l}</button>`).join('')}
      <input type="date" id="clFrom" value="${from}" max="${ymdLocal(new Date())}">
      <span class="tiny">→</span>
      <input type="date" id="clTo" value="${to}" max="${ymdLocal(new Date())}">
      <span style="flex:1"></span>
      <input class="search" id="clQ" placeholder="Search changes…" value="${esc(CL.q)}">
      <button class="help-btn" data-mhelp="changelog">? How to use</button>
      <button class="btn" id="clAddBtn">+ Add change</button>
      <button class="btn primary" id="clSumBtn">✦ Summarise</button>
    </div>
    <div id="clPanel"></div>
    <div class="row" id="clCats" style="gap:6px"></div>
    <div class="card" id="clFeed"><span class="hint">Loading…</span></div>`;

  document.querySelectorAll('#main .chip').forEach(c => c.onclick = () => {
    CL.range = c.dataset.r; localStorage.setItem('ah_cl_range', CL.range); renderChangeLog();
  });
  const onDate = () => {
    CL.range = 'custom'; CL.from = $('#clFrom').value; CL.to = $('#clTo').value;
    if (CL.from && CL.to && CL.from <= CL.to) renderChangeLog();
  };
  $('#clFrom').onchange = onDate; $('#clTo').onchange = onDate;
  $('#clQ').oninput = () => { CL.q = $('#clQ').value; clDrawFeed(); };
  $('#clAddBtn').onclick = () => { CL.panel = CL.panel === 'add' ? null : 'add'; clDrawPanel(); };
  $('#clSumBtn').onclick = () => { CL.panel = CL.panel === 'sum' ? null : 'sum'; clDrawPanel(); };
  clDrawPanel();

  try {
    const { rows } = await api(`/api/activities?act=${S.act}&from=${from}&to=${to}T23:59:59&limit=2000`);
    CL.rows = rows; CL.truncated = rows.length >= 2000;
    clDrawFeed();
  } catch (e) { $('#clFeed').innerHTML = `<span style="color:var(--bad)">${esc(e.message)}</span>`; }

  /* row actions: reason select, note, confirm */
  $('#clFeed').addEventListener('change', async e => {
    const sel = e.target.closest('select[data-id]'); if (!sel) return;
    const r = CL.rows.find(x => x.id === sel.dataset.id); if (!r) return;
    if (sel.value === '__custom') {
      const v = await modal({
        title: 'Custom reason',
        hint: 'Your own "why" for when the presets don\'t fit — e.g. "iOS update broke tracking". It\'s saved as this change\'s reason and Claude uses it in updates just like a preset one.',
        placeholder: 'Why was this change made?',
        value: r.reason && !CL_REASONS.includes(r.reason) ? r.reason : '',
      });
      if (v == null || !v.trim()) return clDrawFeed();   // cancelled — restore display
      r.reason = v.trim();
    } else if (sel.value === '__sugg') {
      r.reason = r.suggested_reason;                     // picking the suggestion accepts it
    } else {
      r.reason = sel.value || null;
    }
    await api('/api/activities/'+encodeURIComponent(r.id), { method:'PATCH', body: JSON.stringify({ reason: r.reason || '' }) }).catch(err => mnote(err.message));
    clDrawFeed();
  });
  $('#clFeed').addEventListener('click', async e => {
    const btn = e.target.closest('[data-id][data-do]'); if (!btn) return;
    const r = CL.rows.find(x => x.id === btn.dataset.id); if (!r) return;
    if (btn.dataset.do === 'note') {
      const v = await modal({
        title: r.note ? 'Edit note' : 'Add a note',
        hint: 'Extra context that travels with this change — it shows in italics underneath, and Claude reads it when writing updates. The "why?" dropdown is the reason; a note is anything extra worth remembering.',
        placeholder: 'e.g. ROAS held 3 days — revisit Friday before scaling further',
        value: r.note || '', multiline: true,
      });
      if (v == null) return;
      r.note = v;
      await api('/api/activities/'+encodeURIComponent(r.id), { method:'PATCH', body: JSON.stringify({ note: v }) }).catch(err => mnote(err.message));
      return clDrawFeed();
    }
    if (btn.dataset.do === 'ok') {
      const acceptSugg = r.confirmed !== 1 && !r.reason && r.suggested_reason;
      r.confirmed = r.confirmed === 1 ? 0 : 1;
      const body = { confirmed: r.confirmed === 1 };
      if (acceptSugg && r.confirmed === 1) { r.reason = r.suggested_reason; body.reason = r.reason; }  // ✓ accepts the suggested why
      await api('/api/activities/'+encodeURIComponent(r.id), { method:'PATCH', body: JSON.stringify(body) }).catch(err => mnote(err.message));
      clDrawFeed();
    }
    if (btn.dataset.do === 'no') {
      const dis = r.confirmed !== -1;
      r.confirmed = dis ? -1 : 0;
      await api('/api/activities/'+encodeURIComponent(r.id), { method:'PATCH', body: JSON.stringify({ dismissed: dis }) }).catch(err => mnote(err.message));
      clDrawFeed();
    }
  });
}

function clSearched() {
  const q = CL.q.trim().toLowerCase();
  return CL.rows.filter(r => !q || [r.summary, r.object_name, r.actor, r.note, r.reason, r.account_name, r.category]
    .some(v => v && String(v).toLowerCase().includes(q)));
}
function clDrawFeed() {
  const searched = clSearched();

  const counts = {};
  searched.forEach(r => counts[r.category] = (counts[r.category] || 0) + 1);
  $('#clCats').innerHTML = Object.entries(counts).sort((a,b) => b[1]-a[1]).map(([c,n]) =>
    `<button class="catpill ${CL.hide.has(c)?'off':''}" data-c="${c}">${esc(c.replace(/_/g,' '))}<i>${n}</i></button>`).join('');
  document.querySelectorAll('#clCats .catpill').forEach(p => p.onclick = () => {
    CL.hide.has(p.dataset.c) ? CL.hide.delete(p.dataset.c) : CL.hide.add(p.dataset.c);
    clDrawFeed();
  });

  const rows = searched.filter(r => !CL.hide.has(r.category));
  if (!rows.length) { $('#clFeed').innerHTML = `<span class="hint">${CL.rows.length ? 'Nothing matches the current filters.' : 'No changes in this window.'}</span>`; return; }

  const showClient = S.act === 'all';
  let html = '';
  for (const r of rows) {
    const d = parseTs(r.event_time);
    html += `<div class="cl-it ${r.confirmed === -1 ? 'dim' : ''}">
      <div class="who"><b>${d.toLocaleDateString('en-US',{month:'short',day:'numeric'})}</b><br>${d.toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit'})}<br>${esc(r.actor || '')}${r.manual ? ' · manual' : ''}</div>
      <div class="what">
        ${showClient ? `<span class="client">${esc(r.account_name || '')}</span>` : ''}<span class="cat">${esc((r.category||'other').replace(/_/g,' '))}</span><span class="txt">${esc(r.summary || r.translated || r.event_type || '')}</span>
        ${r.note ? `<div class="note" data-id="${esc(r.id)}" data-do="note" title="Click to edit this note">“${esc(r.note)}”</div>` : ''}
      </div>
      <div class="acts">
        <select data-id="${esc(r.id)}" class="${r.reason ? 'set' : (r.suggested_reason ? 'sugg' : '')}">${!r.reason && r.suggested_reason
          ? `<option value="__sugg" selected>${esc(r.suggested_reason)} · suggested</option>` : `<option value="">why?</option>`}${CL_REASONS.map(x =>
          `<option ${r.reason===x?'selected':''}>${x}</option>`).join('')}${r.reason && !CL_REASONS.includes(r.reason) ? `<option selected>${esc(r.reason)}</option>` : ''}<option value="__custom">Custom…</option></select>
        <button class="note-btn" data-id="${esc(r.id)}" data-do="note" title="Extra context that rides along with this change — Claude reads it too">${r.note ? 'edit note' : '+ note'}</button>
        <button class="icon-btn ok ${r.confirmed === 1 ? 'on' : ''}" data-id="${esc(r.id)}" data-do="ok" title="${r.confirmed === 1 ? 'Confirmed — we meant to do this' : 'Confirm: deliberate, goes in updates'}">✓</button>
        <button class="icon-btn no ${r.confirmed === -1 ? 'on' : ''}" data-id="${esc(r.id)}" data-do="no" title="${r.confirmed === -1 ? 'Dismissed — excluded from summaries (click to undo)' : 'Dismiss: noise, keep out of summaries'}">✗</button>
      </div>
    </div>`;
  }
  $('#clFeed').innerHTML = html + (CL.truncated ? `<p class="tiny" style="margin-top:10px">Showing the most recent 2,000 changes — narrow the window to see everything.</p>` : '');
}

function clDrawPanel() {
  const el = $('#clPanel');
  if (!CL.panel) { el.innerHTML = ''; return; }
  const [from, to] = clDates();
  const active = S.accounts.filter(a => a.active);
  if (CL.panel === 'add') {
    el.innerHTML = `<div class="card"><h3>Add a change</h3>
      <p class="hint" style="margin-bottom:10px">For things Meta's log can't see — landing page swaps, promo starts, tracking fixes.</p>
      <div class="row">
        <select id="adAct">${active.map(a => `<option value="${a.act_id}" ${a.act_id===S.act?'selected':''}>${esc(a.name)}</option>`).join('')}</select>
        <input type="datetime-local" id="adTime" value="${new Date(Date.now()-new Date().getTimezoneOffset()*60e3).toISOString().slice(0,16)}">
        <select id="adCat">${CL_ADD_CATS.map(c => `<option value="${c}">${c.replace(/_/g,' ')}</option>`).join('')}</select>
      </div>
      <div class="row">
        <input class="search" id="adSum" placeholder="What changed? e.g. Launched 20% off promo on site" style="flex:1;min-width:240px">
        <select id="adWhy"><option value="">why?</option>${CL_REASONS.map(x => `<option>${x}</option>`).join('')}<option value="__custom">Custom…</option></select>
        <button class="btn primary" id="adGo">Save</button>
      </div><span class="tiny" id="adMsg"></span></div>`;
    $('#adWhy').onchange = async () => {
      const sel = $('#adWhy');
      if (sel.value !== '__custom') return;
      const v = await modal({
        title: 'Custom reason',
        hint: 'Your own "why" for when the presets don\'t fit. It\'s saved as this change\'s reason and Claude uses it in updates.',
        placeholder: 'Why was this change made?',
      });
      if (v && v.trim()) {
        const o = document.createElement('option'); o.textContent = v.trim();
        sel.insertBefore(o, sel.querySelector('option[value="__custom"]'));
        sel.value = v.trim();
      } else sel.value = '';
    };
    $('#adGo').onclick = async () => {
      const summary = $('#adSum').value.trim();
      if (!summary) return $('#adMsg').textContent = 'Say what changed first.';
      $('#adGo').disabled = true;
      try {
        await api('/api/activities', { method:'POST', body: JSON.stringify({
          act_id: $('#adAct').value, event_time: new Date($('#adTime').value).toISOString(),
          category: $('#adCat').value, summary, reason: $('#adWhy').value || null,
          actor: localStorage.getItem('mobius_session_email') || 'manual',
        }) });
        CL.panel = null; renderChangeLog();
      } catch (e) { $('#adMsg').textContent = e.message; $('#adGo').disabled = false; }
    };
  }
  if (CL.panel === 'sum') {
    const scope = S.act === 'all' ? 'all clients' : (active.find(a => a.act_id === S.act)?.name || 'this client');
    el.innerHTML = `<div class="card"><h3>Summarise with Claude</h3>
      <p class="hint" style="margin-bottom:10px">Writes from the tagged changes + performance for <b>${esc(scope)}</b>, ${from} → ${to}. Reasons and notes you've tagged make it noticeably better; ✗-dismissed changes are left out.</p>
      <div class="row">
        <select id="sumTpl">
          <option value="daily">Daily standup (internal)</option>
          <option value="weekly">Weekly recap (internal)</option>
          <option value="client">Client-facing update</option>
        </select>
        <button class="btn primary" id="sumGo">Write it</button>
        <span class="tiny" id="sumMsg"></span>
      </div>
      <div id="sumOut"></div></div>`;
    $('#sumGo').onclick = async () => {
      const tpl = $('#sumTpl').value;
      if (tpl === 'client' && S.act === 'all') return $('#sumMsg').textContent = 'Pick one client in the header for a client-facing update.';
      $('#sumGo').disabled = true; $('#sumMsg').textContent = 'Claude is writing… (~20s)';
      try {
        const r = await api('/api/summarise', { method:'POST', body: JSON.stringify({ act: S.act, from, to, template: tpl }) });
        $('#sumMsg').textContent = '';
        $('#sumOut').innerHTML = `<div class="sum-out" id="sumTxt">${esc(r.text)}</div>
          <div class="row" style="margin:10px 0 0"><button class="btn" id="sumCopy">Copy</button><span class="tiny">${esc(r.model)}</span></div>`;
        $('#sumCopy').onclick = () => { navigator.clipboard.writeText($('#sumTxt').textContent); $('#sumCopy').textContent = 'Copied ✓'; setTimeout(() => $('#sumCopy').textContent = 'Copy', 1500); };
      } catch (e) { $('#sumMsg').textContent = e.message; }
      $('#sumGo').disabled = false;
    };
  }
}

/* ---------- Averages (Chat 2) ---------- */
const AV = { win: localStorage.getItem('ah_av_win') || '90' };
const AV_METRICS = [
  { k:'spend', label:'Spend/day', num:r=>r.spend, den:()=>1, fmt:(v,c)=>fmtK(v,c), lower:false },
  { k:'roas', label:'ROAS', num:r=>r.revenue, den:r=>r.spend, fmt:v=>fmtX(v), lower:false },
  { k:'cpa', label:'CPA', num:r=>r.spend, den:r=>r.purchases, fmt:(v,c)=>fmtMoney(v,c), lower:true },
  { k:'ctr', label:'CTR', num:r=>(r.link_clicks||r.clicks), den:r=>r.impressions, fmt:v=>v==null?'—':(v*100).toFixed(2)+'%', lower:false },
  { k:'cpm', label:'CPM', num:r=>r.spend*1000, den:r=>r.impressions, fmt:(v,c)=>fmtMoney(v,c), lower:true },
  { k:'thumbstop', label:'Thumbstop', num:r=>r.video_views, den:r=>r.impressions, fmt:v=>v==null?'—':(v*100).toFixed(1)+'%', lower:false },
];

/** Trailing k-day moving value at each row index (ratio of sums, so CPA/ROAS are true blends). */
function maSeries(rows, m, k) {
  return rows.map((_, i) => {
    if (i < k - 1) return null;
    let n = 0, d = 0;
    for (let j = i - k + 1; j <= i; j++) { n += m.num(rows[j]) || 0; d += (m.den(rows[j]) ?? 1) || 0; }
    return d ? n / d : null;
  });
}
function lastVal(arr) { for (let i = arr.length - 1; i >= 0; i--) if (arr[i] != null) return arr[i]; return null; }

function trendLabel(d37, d730, lower) {
  if (d37 == null) return { t: '—', cls: 'unk' };
  if (Math.abs(d37) < 0.025) return { t: 'flat', cls: 'unk' };
  const goodNow = lower ? d37 < 0 : d37 > 0;
  const good730 = d730 == null ? null : (lower ? d730 < 0 : d730 > 0);
  if (goodNow) return { t: good730 === false ? 'recovering' : 'improving', cls: 'good' };
  return { t: good730 === false ? 'declining' : 'slipping', cls: 'bad' };
}

function sparkSVG(s7, s30, w = 200, h = 46) {
  const vals = [...s7, ...s30].filter(v => v != null);
  if (!vals.length) return `<svg viewBox="0 0 ${w} ${h}"></svg>`;
  let min = Math.min(...vals), max = Math.max(...vals);
  if (min === max) { min -= 1; max += 1; }
  const pad = (max - min) * 0.1; min -= pad; max += pad;
  const n = s7.length;
  const pt = (i, v) => `${(i / Math.max(1, n - 1) * w).toFixed(1)},${(h - (v - min) / (max - min) * h).toFixed(1)}`;
  const line = s => s.map((v, i) => v == null ? null : pt(i, v)).filter(Boolean).join(' ');
  const both = s7.map((v, i) => v != null && s30[i] != null ? i : null).filter(i => i != null);
  const area = both.length > 1
    ? `<polygon points="${both.map(i => pt(i, s7[i])).join(' ')} ${both.slice().reverse().map(i => pt(i, s30[i])).join(' ')}" fill="#62BDEA" opacity=".16"/>` : '';
  return `<svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="none">${area}
    <polyline points="${line(s30)}" fill="none" stroke="#9FB0BC" stroke-width="1.4"/>
    <polyline points="${line(s7)}" fill="none" stroke="#14608C" stroke-width="1.8"/></svg>`;
}

const AV_DEFS = {
  spend: 'Ad spend per day, Meta-reported.',
  roas: 'Revenue ÷ spend, as Meta attributes it. Higher is better.',
  cpa: 'Spend ÷ purchases — what one purchase costs. Lower is better.',
  ctr: 'Link clicks ÷ impressions — are people clicking the ads. Higher is better.',
  cpm: 'Cost per 1,000 impressions — what Meta charges for attention. Lower is better.',
  thumbstop: '3-second video views ÷ impressions — how often people stop scrolling. Higher is better.',
};

/** rows must be full days only (today excluded). interactive = clickable cards (single-client view). */
function buildAvCards(rows, currency, interactive = false) {
  return `<div class="av-grid">` + AV_METRICS.map(m => {
    const s7 = maSeries(rows, m, 7), s30 = maSeries(rows, m, 30), s3 = maSeries(rows, m, 3);
    const v7 = lastVal(s7), v30 = lastVal(s30), v3 = lastVal(s3);
    const d37 = v3 != null && v7 ? v3 / v7 - 1 : null;
    const d730 = v7 != null && v30 ? v7 / v30 - 1 : null;
    const tr = trendLabel(d37, d730, m.lower);
    return `<div class="av-card ${tr.cls}${interactive ? ' clickable' : ''}" ${interactive ? `data-m="${m.k}" title="Click for the full day-by-day ${m.label} chart with dates and changes"` : ''}>
      <div class="av-top"><span class="av-label">${m.label} <span class="info-i" title="${esc(AV_DEFS[m.k])} The big number is the 7-day average; the blue line is that average over time vs the gray 30-day baseline.">i</span></span><span style="text-align:right"><b class="av-val">${m.fmt(v7, currency)}</b><br><span class="tiny">7-day avg</span></span></div>
      ${sparkSVG(s7, s30)}
      <div class="av-trend ${tr.cls}" title="Compares the average of the last 3 days against the last 7 — an early read on whether the metric just turned">${tr.t}${d37 != null ? ` · last 3d vs last 7d: ${fmtPct(d37)}` : ''}</div>
    </div>`;
  }).join('') + `</div>`;
}

/** Full-size day-by-day chart for one metric: daily values + 7d/30d averages + change dots, with a real date axis. */
function focusSVG(rows, events, m, currency) {
  const w = 940, h = 250, pl = 56, pr = 14, pt = 12, pb = 40;
  const daily = rows.map(r => { const den = (m.den(r) ?? 1) || 0; return den ? (m.num(r) || 0) / den : null; });
  const s7 = maSeries(rows, m, 7), s30 = maSeries(rows, m, 30);
  const vals = [...daily, ...s7, ...s30].filter(v => v != null);
  if (!vals.length) return '<p class="hint">No data.</p>';
  let min = Math.min(...vals), max = Math.max(...vals);
  if (min === max) { min -= 1; max += 1; }
  const pad = (max - min) * 0.08; min -= pad; max += pad;
  const n = rows.length;
  const x = i => pl + i / Math.max(1, n - 1) * (w - pl - pr);
  const y = v => pt + (1 - (v - min) / (max - min)) * (h - pt - pb);
  const line = arr => arr.map((v, i) => v == null ? null : `${x(i).toFixed(1)},${y(v).toFixed(1)}`).filter(Boolean).join(' ');
  const hover = s7.map((v, i) => v == null ? '' :
    `<circle cx="${x(i).toFixed(1)}" cy="${y(v).toFixed(1)}" r="6" fill="transparent"><title>${rows[i].date} — day: ${m.fmt(daily[i], currency)} · 7d avg: ${m.fmt(v, currency)}</title></circle>`).join('');
  const ticks = Array.from({ length: 6 }, (_, k) => Math.round(k * (n - 1) / 5)).map(i =>
    `<text x="${x(i).toFixed(1)}" y="${h - 6}" font-size="10" text-anchor="middle" fill="#647684">${rows[i].date.slice(5)}</text>
     <line x1="${x(i).toFixed(1)}" y1="${pt}" x2="${x(i).toFixed(1)}" y2="${h - pb + 4}" stroke="#DFE7EC" stroke-width="1"/>`).join('');
  const dateIdx = Object.fromEntries(rows.map((r, i) => [r.date, i]));
  const railY = h - pb + 12;
  const color = c => c === 'budget' ? '#8F6412' : /paused/.test(c) ? '#9C3A2E' : /relaunch/.test(c) ? '#1C7A46' : '#14608C';
  const evDots = (events || []).map(ev => {
    const d = String(ev.event_time).slice(0, 10);
    const i = dateIdx[d]; if (i == null) return '';
    return `<circle cx="${x(i).toFixed(1)}" cy="${railY}" r="4.5" fill="${color(ev.category)}" stroke="#fff" stroke-width="1.2"><title>${esc(d + ' — ' + (ev.summary || ev.category) + (ev.reason ? ` (${ev.reason})` : ''))}</title></circle>`;
  }).join('');
  return `<svg viewBox="0 0 ${w} ${h + 14}" style="width:100%;height:auto;touch-action:none">
    ${ticks}
    <line class="fx-guide" x1="0" x2="0" y1="${pt}" y2="${h - pb + 18}" stroke="#14608C" stroke-width="1" opacity="0" pointer-events="none"/>
    <polyline points="${line(daily)}" fill="none" stroke="#C4D2DB" stroke-width="1.2"/>
    <polyline points="${line(s30)}" fill="none" stroke="#9FB0BC" stroke-width="1.7"/>
    <polyline points="${line(s7)}" fill="none" stroke="#14608C" stroke-width="2.2"/>
    ${hover}
    <line x1="${pl}" y1="${railY}" x2="${w - pr}" y2="${railY}" stroke="#DFE7EC"/>${evDots}
    <text x="2" y="${pt + 9}" font-size="10" fill="#647684">${m.fmt(max, currency)}</text>
    <text x="2" y="${h - pb}" font-size="10" fill="#647684">${m.fmt(min, currency)}</text>
    <text x="2" y="${railY + 4}" font-size="9" fill="#647684">changes</text>
  </svg>`;
}

function avFocus(mKey) {
  const d = AV.cur; if (!d) return;
  const m = AV_METRICS.find(xx => xx.k === mKey);
  const cur = d.account.currency;
  $('#avFocus').innerHTML = `<div class="card" style="border-color:var(--brand)">
    <div class="row" style="margin-bottom:2px"><h3>${m.label}, day by day</h3><span style="flex:1"></span><button class="btn" id="avFocusClose">✕ Close</button></div>
    <p class="hint" style="margin-bottom:6px">${esc(AV_DEFS[m.k])} Thin line = each single day (bumpy is normal). <span style="color:#14608C;font-weight:700">Blue</span> = 7-day average, <span style="color:#8195A2;font-weight:700">gray</span> = 30-day baseline — both are <b>per-day averages</b> over the window ending at that date (never totals; CPA/ROAS are blended from the window's total spend and purchases). A "—" means there isn't enough history before that date yet. Hover or tap for exact values; dots on the bottom rail are changes we made.</p>
    <div id="fxReadout" style="font-size:13px;height:52px;overflow:hidden;background:var(--bg);border:1px solid var(--line);border-radius:8px;padding:7px 11px;margin-bottom:8px">Hover or tap anywhere on the chart…</div>
    ${focusSVG(d.rows, d.events, m, cur)}</div>`;
  $('#avFocus').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  $('#avFocusClose').onclick = () => { $('#avFocus').innerHTML = ''; };
  /* crosshair: works on hover AND tap, names every line with its value */
  const svg = $('#avFocus svg'), guide = svg.querySelector('.fx-guide'), ro = $('#fxReadout');
  const rows = d.rows, n = rows.length, W = 940, pl = 56, pr = 14;
  const daily = rows.map(r => { const den = (m.den(r) ?? 1) || 0; return den ? (m.num(r) || 0) / den : null; });
  const s7 = maSeries(rows, m, 7), s30 = maSeries(rows, m, 30);
  const inspect = clientX => {
    const rect = svg.getBoundingClientRect();
    const vx = (clientX - rect.left) / rect.width * W;
    const i = Math.max(0, Math.min(n - 1, Math.round((vx - pl) / (W - pl - pr) * (n - 1))));
    const gx = pl + i / Math.max(1, n - 1) * (W - pl - pr);
    guide.setAttribute('x1', gx); guide.setAttribute('x2', gx); guide.setAttribute('opacity', '.55');
    const evs = (d.events || []).filter(ev => String(ev.event_time).slice(0, 10) === rows[i].date);
    const clip = s => { s = String(s || ''); return s.length > 80 ? s.slice(0, 80) + '…' : s; };
    const evTxt = evs.slice(0, 2).map(e2 => esc(clip(e2.summary || e2.category))).join(' · ')
      + (evs.length > 2 ? ` · +${evs.length - 2} more (see Change Log)` : '');
    ro.innerHTML = `<b>${rows[i].date}</b> &nbsp; <span style="color:#8195A2">that day:</span> <b>${m.fmt(daily[i], cur)}</b>
      &nbsp; <span style="color:#14608C;font-weight:700">7-day avg:</span> <b>${m.fmt(s7[i], cur)}</b>
      &nbsp; <span style="color:#8195A2;font-weight:700">30-day avg:</span> <b>${m.fmt(s30[i], cur)}</b>
      ${evs.length ? `<br><span class="tiny">⚑ ${evTxt}</span>` : ''}`;
  };
  svg.addEventListener('pointermove', e => inspect(e.clientX));
  svg.addEventListener('pointerdown', e => inspect(e.clientX));
}

function buildAvStrip(events, fromYmd, toYmd) {
  if (!events?.length) return '';
  const span = Math.max(1, (new Date(toYmd) - new Date(fromYmd)) / 86400e3);
  const color = c => c === 'budget' ? 'var(--warn)' : /paused/.test(c) ? 'var(--bad)' : /relaunch/.test(c) ? 'var(--good)' : 'var(--brand-ink)';
  const dots = events.map(ev => {
    const d = String(ev.event_time).slice(0, 10);
    const x = (new Date(d) - new Date(fromYmd)) / 86400e3 / span * 100;
    if (x < 0 || x > 100) return '';
    const dRaw = d + ' — ' + (ev.summary || ev.category) + (ev.reason ? ` (${ev.reason})` : '');
    const detail = esc(dRaw.length > 140 ? dRaw.slice(0, 140) + '…' : dRaw);
    return `<span class="dot" style="left:${x.toFixed(2)}%;background:${color(ev.category)};cursor:pointer" title="${detail}" data-detail="${detail}"></span>`;
  }).join('');
  return `<div class="card" style="padding:14px 20px 4px"><h3 style="margin-bottom:0">Changes we made in this window</h3>
    <p class="hint">Each dot is a change from the Change Log, placed on the same timeline as the charts above — so you can see whether a move we made lines up with a metric turning. Hover any dot for the details.</p>
    <div class="strip">${dots}</div>
    <div class="tiny" style="display:flex;justify-content:space-between;border-top:1px solid var(--line);padding-top:4px">
      <span>${fromYmd}</span><span>${new Date((new Date(fromYmd).getTime() + new Date(toYmd).getTime()) / 2).toISOString().slice(0, 10)}</span><span>${toYmd}</span></div>
    <p class="tiny" id="stripDetail" style="margin:6px 0 2px;min-height:16px;font-weight:600"></p>
    <p class="tiny" style="margin:2px 0 8px"><span style="color:var(--warn)">●</span> budget change · <span style="color:var(--bad)">●</span> paused · <span style="color:var(--good)">●</span> relaunched · <span style="color:var(--brand-ink)">●</span> other — click or hover a dot for the date and what changed</p></div>`;
}

function buildAvTable(rows, currency) {
  const win = n => rows.slice(-n);
  const prev = n => rows.slice(-2 * n, -n);
  const cell = (m, n) => {
    const st = r => { let a = 0, b = 0; r.forEach(x => { a += m.num(x) || 0; b += (m.den(x) ?? 1) || 0; }); return b ? a / b : null; };
    const cur = st(win(n)), pr = st(prev(n));
    return `<td class="num"><b>${m.fmt(cur, currency)}</b> <span class="tiny">was ${m.fmt(pr, currency)}</span>${delta(cur, pr, m.lower)}</td>`;
  };
  return `<div class="card"><h3 style="margin-bottom:8px">The averages, in numbers</h3>
    <p class="hint" style="margin-bottom:10px">Each window vs the same-length window right before it. Windows end yesterday; the last 3 days are still settling.</p>
    <div class="tbl-wrap"><table><thead><tr><th>Metric</th><th class="num">3-day</th><th class="num">7-day</th><th class="num">14-day</th><th class="num">30-day</th></tr></thead>
    <tbody>${AV_METRICS.map(m => `<tr><td><b>${m.label}</b></td>${[3, 7, 14, 30].map(n => cell(m, n)).join('')}</tr>`).join('')}</tbody></table></div></div>`;
}

/** Today vs yesterday vs 3-day vs 7-day — the "did something just break?" view. */
function buildMomentum(fullRows, todayRow, currency) {
  const win = n => fullRows.slice(-n);
  const stat = (m, list) => { let a = 0, b = 0; list.forEach(r => { a += m.num(r) || 0; b += (m.den(r) ?? 1) || 0; }); return b ? a / b : null; };
  const rows = AV_METRICS.map(m => {
    const t = todayRow ? stat(m, [todayRow]) : null;
    const y = stat(m, win(1)), d3 = stat(m, win(3)), d7 = stat(m, win(7));
    return `<tr><td><b>${m.label}</b></td>
      <td class="num">${m.fmt(t, currency)}<span class="tiny"> so far</span></td>
      <td class="num">${m.fmt(y, currency)}${delta(y, d7, m.lower)}</td>
      <td class="num">${m.fmt(d3, currency)}${delta(d3, d7, m.lower)}</td>
      <td class="num">${m.fmt(d7, currency)}</td></tr>`;
  }).join('');
  return `<div class="card"><h3 style="margin-bottom:2px">Momentum — is anything breaking right now?</h3>
    <p class="hint" style="margin-bottom:10px">Today vs yesterday vs the short averages. The % tags compare each column to the 7-day average — if yesterday or the 3-day is way off it, something changed very recently: check the change dots below and the Change Log. Today is a partial day and conversions lag, so read its column as an early signal only.</p>
    <div class="tbl-wrap"><table><thead><tr><th>Metric</th><th class="num">Today</th><th class="num">Yesterday <span class="tiny">vs 7d</span></th><th class="num">3-day avg <span class="tiny">vs 7d</span></th><th class="num">7-day avg</th></tr></thead><tbody>${rows}</tbody></table></div></div>`;
}


async function renderAverages() {
  const active = S.accounts.filter(a => a.active);
  const single = S.act !== 'all' ? active.find(a => a.act_id === S.act) : null;
  $('#main').innerHTML = `<h2>Averages</h2>
    <p class="sub">Each card answers one question: <b>are the last 7 days better than this account's own normal (its last 30 days)?</b> The word under each card is the verdict — green words are good, red are bad. <b>Click any card</b> for the full day-by-day chart with dates and the changes we made. Meta data only; averages end yesterday because the last ~3 days of conversions are still settling.</p>
    ${setupBanner()}
    <div class="row">
      <span class="tiny" style="font-weight:700" title="How far back the charts look. This only changes how much history the lines show — the cards' current values are always the last 7 days.">History shown:</span>
      ${['30','60','90','180'].map(w => `<button class="chip ${AV.win===w?'on':''}" data-w="${w}">last ${w} days</button>`).join('')}
      <span style="flex:1"></span>
      <button class="help-btn" data-mhelp="averages">? How to use</button>
      </div>
    <div id="avBody"><div class="card"><span class="hint">Loading…</span></div></div>`;
  document.querySelectorAll('#main .chip').forEach(c => c.onclick = () => {
    AV.win = c.dataset.w; localStorage.setItem('ah_av_win', AV.win); renderAverages();
  });
  try {
    const targets = single ? [single] : active;
    if (!targets.length) { $('#avBody').innerHTML = ''; return; }
    const [series, ovr] = await Promise.all([
      Promise.all(targets.map(a => api(`/api/series?act=${a.act_id}&days=${+AV.win + 32}`))),
      single ? api('/api/overview').catch(() => null) : Promise.resolve(null),
    ]);
    const ovAcc = single ? ovr?.accounts?.find(x => x.act_id === single.act_id) : null;
    const legend = `<p class="tiny" style="margin-bottom:8px"><span style="color:#14608C;font-weight:700">━</span> 7-day average (recent form) &nbsp;·&nbsp; <span style="color:#9FB0BC;font-weight:700">━</span> 30-day average (the baseline) — the shaded gap shows how far current form is from normal</p>`;
    $('#avBody').innerHTML = series.map((s, i) => {
      const full = s.rows.filter(r => r.date < s.account.today);       // full days only
      const todayRow = s.rows.find(r => r.date === s.account.today) || null;
      const rows = full.slice(-(+AV.win));
      const fromYmd = rows[0]?.date || s.account.today;
      if (single) AV.cur = { rows, events: s.events, account: s.account };
      return `${single ? '' : `<div class="av-client">${esc(targets[i].name)}</div>`}
        ${rows.length < 7 ? `<div class="card"><span class="hint">Not enough data yet for ${esc(targets[i].name)} — needs at least a week of history.</span></div>`
          : legend + buildAvCards(rows, s.account.currency, single)
            + (single ? `<div id="avFocus"></div>` + buildMomentum(full, todayRow, s.account.currency) + buildAvStrip(s.events, fromYmd, s.account.today) + buildAvTable(rows, s.account.currency) : '')}`;
    }).join('');
    document.querySelectorAll('#avBody .av-card[data-m]').forEach(c => c.onclick = () => avFocus(c.dataset.m));
    document.querySelectorAll('#avBody .strip .dot').forEach(el => el.onclick = () => { const t = $('#stripDetail'); if (t) t.textContent = '⚑ ' + el.dataset.detail; });
  } catch (e) { $('#avBody').innerHTML = `<div class="card"><span style="color:var(--bad)">${esc(e.message)}</span></div>`; }
}

/* ---------- Pacing: live intraday curve (Chat 4) ---------- */
function pacingSVG(p) {
  const w = 940, h = 200, pl = 56, pr = 14, pt = 12, pb = 26;
  const vals = [...p.today_cum, ...p.l7_cum].filter(v => v != null);
  const max = Math.max(1, ...vals) * 1.08;
  const x = hh => pl + hh / 23 * (w - pl - pr);
  const y = v => pt + (1 - v / max) * (h - pt - pb);
  const line = arr => arr.map((v, i) => v == null ? null : `${x(i).toFixed(1)},${y(v).toFixed(1)}`).filter(Boolean).join(' ');
  const ticks = [0, 3, 6, 9, 12, 15, 18, 21, 23].map(hh =>
    `<text x="${x(hh).toFixed(1)}" y="${h - 6}" font-size="10" text-anchor="middle" fill="#647684">${hh}:00</text>`).join('');
  const nowX = x(Math.min(23, Math.max(0, p.hour)));
  return `<svg viewBox="0 0 ${w} ${h}" style="width:100%;height:auto;touch-action:none">
    <line class="fx-guide" x1="0" x2="0" y1="${pt}" y2="${h - pb}" stroke="#14608C" stroke-width="1" opacity="0" pointer-events="none"/>
    <line x1="${nowX.toFixed(1)}" x2="${nowX.toFixed(1)}" y1="${pt}" y2="${h - pb}" stroke="#647684" stroke-width="1" stroke-dasharray="4 3"/>
    <text x="${nowX.toFixed(1)}" y="${pt + 2}" font-size="9.5" fill="#647684" text-anchor="middle">now</text>
    ${ticks}
    <polyline points="${line(p.l7_cum)}" fill="none" stroke="#9FB0BC" stroke-width="1.8"/>
    <polyline points="${line(p.today_cum)}" fill="none" stroke="#14608C" stroke-width="2.4"/>
    <text x="2" y="${pt + 9}" font-size="10" fill="#647684">${fmtK(max, p.account.currency)}</text>
    <text x="2" y="${h - pb}" font-size="10" fill="#647684">${sym(p.account.currency)}0</text>
  </svg>`;
}

function buildTodayCard(p) {
  const cur = p.account.currency;
  const paceCls = p.vs_pace == null ? 'unk' : Math.abs(p.vs_pace) <= 0.1 ? 'unk' : p.vs_pace > 0 ? 'good' : 'warn';
  return `<div class="card" style="border-color:var(--brand)">
    <div class="row" style="margin-bottom:6px"><h3>Today, live</h3>
      <span class="tiny">${p.today} · through ${String(Math.max(0, p.hour - 1)).padStart(2, '0')}:59 (${esc(p.account.tz)})</span>
      <span style="flex:1"></span>
      <span class="tiny">pulled ${new Date(p.pulled_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}</span>
      <button class="btn" id="hpRefresh">↻ Refresh</button></div>
    <div class="pc-stats" style="margin:2px 0 12px">
      <div class="st"><b>${fmtK(p.spent, cur)}</b><span>Spend so far</span></div>
      <div class="st"><b>${fmtK(p.l7_by_now, cur)}</b><span>L7 avg by this hour</span></div>
      <div class="st"><b class="${paceCls === 'good' ? '' : ''}" style="color:${p.vs_pace == null ? 'inherit' : Math.abs(p.vs_pace) <= 0.1 ? 'inherit' : p.vs_pace > 0 ? 'var(--good)' : 'var(--warn)'}">${p.vs_pace == null ? '—' : fmtPct(p.vs_pace, 1)}</b><span>vs L7 pace</span></div>
      <div class="st"><b>${dayShare(p) != null && dayShare(p) < 0.05 ? 'too early' : fmtK(p.projected, cur)}</b><span>Projected today${dayShare(p) != null ? ` · ${Math.round(dayShare(p) * 100)}% of a normal day in` : ''}</span></div>
      <div class="st"><b>${fmtK(p.l7_daily_avg, cur)}</b><span>L7 daily avg</span></div>
    </div>
    <div id="hpReadout" class="tiny" style="height:20px;font-weight:600"></div>
    ${pacingSVG(p)}
    <p class="tiny" style="margin-top:4px"><span style="color:#14608C;font-weight:700">━</span> today, cumulative &nbsp;·&nbsp; <span style="color:#9FB0BC;font-weight:700">━</span> average of the last 7 days &nbsp;·&nbsp; hover or tap the chart for exact hours. Meta reports today with a small lag — treat the newest hour as approximate.</p>
  </div>`;
}

function wireTodayChart(p) {
  const svg = $('#hpToday svg'); if (!svg) return;
  const guide = svg.querySelector('.fx-guide'), ro = $('#hpReadout');
  const W = 940, pl = 56, pr = 14, cur = p.account.currency;
  const inspect = clientX => {
    const rect = svg.getBoundingClientRect();
    const vx = (clientX - rect.left) / rect.width * W;
    const hh = Math.max(0, Math.min(23, Math.round((vx - pl) / (W - pl - pr) * 23)));
    const gx = pl + hh / 23 * (W - pl - pr);
    guide.setAttribute('x1', gx); guide.setAttribute('x2', gx); guide.setAttribute('opacity', '.55');
    const t = p.today_cum[hh], l = p.l7_cum[hh];
    ro.innerHTML = `<b>${hh}:00</b> &nbsp; <span style="color:#14608C;font-weight:700">today:</span> ${t == null ? 'not yet' : fmtK(t, cur)} &nbsp; <span style="color:#8195A2;font-weight:700">typical by then:</span> ${l == null ? '—' : fmtK(l, cur)}`;
  };
  svg.addEventListener('pointermove', e => inspect(e.clientX));
  svg.addEventListener('pointerdown', e => inspect(e.clientX));
}

/* ---------- Creative Rotation (Chat 3) ---------- */
const CR = { fresh: localStorage.getItem('ah_cr_fresh') || '14', win: localStorage.getItem('ah_cr_win') || '14' };
const CR_COLORS = ['#1C7A46', '#4C9A66', '#8FC1A4', '#C3DCCC', '#D8D3C8'];
const CR_LABELS = ['0–7d', '8–14d', '15–30d', '31–60d', '60d+'];

function crBars(weekly) {
  const w = 900, h = 175;
  const n = weekly.length; if (!n) return '';
  const padL = 30, bw = (w - padL) / n, bh = h - 34;
  let out = `<line class="fx-guide" x1="0" x2="0" y1="6" y2="${h - 24}" stroke="#14608C" stroke-width="1.4" opacity="0" pointer-events="none"/>`;
  weekly.forEach((wk, i) => {
    let y = 10;
    const x = padL + i * bw;
    wk.shares.forEach((s, bi) => {
      const hh = s * bh;
      if (hh > 0.5) out += `<rect x="${(x + 2).toFixed(1)}" y="${y.toFixed(1)}" width="${Math.max(1, bw - 4).toFixed(1)}" height="${hh.toFixed(1)}" rx="1.5" fill="${CR_COLORS[bi]}"><title>${wk.week} · ${CR_LABELS[bi]}: ${(s * 100).toFixed(0)}% of spend</title></rect>`;
      y += hh;
    });
    out += `<text x="${(x + bw / 2).toFixed(1)}" y="${h - 9}" font-size="9.5" text-anchor="middle" fill="#647684">${wk.week.slice(5)}</text>`;
  });
  out += `<text x="0" y="17" font-size="9.5" fill="#647684">100%</text><text x="0" y="${h - 26}" font-size="9.5" fill="#647684">0%</text>`;
  return `<svg id="crBarsSvg" viewBox="0 0 ${w} ${h}" style="width:100%;height:auto;touch-action:none">${out}</svg>`;
}

function crDual(weekly, currency) {
  const w = 900, h = 175, padL = 48, padR = 44, padT = 12, padB = 24;
  if (weekly.filter(wk => wk.cpa != null).length < 2) return '';
  const iw = w - padL - padR, ih = h - padT - padB;
  const cpas = weekly.filter(wk => wk.cpa != null).map(wk => wk.cpa);
  const cMin = Math.min(...cpas) * 0.9, cMax = Math.max(...cpas) * 1.08;
  const fMax = Math.max(0.01, ...weekly.map(wk => wk.freshShare)) * 1.15;
  const x = i => padL + i / Math.max(1, weekly.length - 1) * iw;
  const yC = v => padT + (1 - (v - cMin) / (cMax - cMin || 1)) * ih;
  const yF = v => padT + (1 - v / fMax) * ih;
  const cpaLine = weekly.map((wk, i) => wk.cpa == null ? null : `${x(i).toFixed(1)},${yC(wk.cpa).toFixed(1)}`).filter(Boolean).join(' ');
  const fLine = weekly.map((wk, i) => `${x(i).toFixed(1)},${yF(wk.freshShare).toFixed(1)}`).join(' ');
  const dots = weekly.map((wk, i) => wk.cpa == null ? '' : `<circle cx="${x(i).toFixed(1)}" cy="${yC(wk.cpa).toFixed(1)}" r="2.6" fill="#1C7A46"><title>${wk.week} · CPA ${fmtMoney(wk.cpa, currency)} · fresh ${(wk.freshShare * 100).toFixed(0)}%</title></circle>`).join('');
  return `<svg id="crDualSvg" viewBox="0 0 ${w} ${h}" style="width:100%;height:auto;touch-action:none">
    <line class="fx-guide" x1="0" x2="0" y1="${padT}" y2="${h - padB}" stroke="#14608C" stroke-width="1" opacity="0" pointer-events="none"/>
    <polyline points="${fLine}" fill="none" stroke="#C9962B" stroke-width="1.6" opacity=".85"/>
    <polyline points="${cpaLine}" fill="none" stroke="#1C7A46" stroke-width="2"/>${dots}
    <text x="2" y="${padT + 8}" font-size="9.5" fill="#1C7A46">${fmtMoney(cMax, currency)}</text>
    <text x="2" y="${h - padB}" font-size="9.5" fill="#1C7A46">${fmtMoney(cMin, currency)}</text>
    <text x="${w - 2}" y="${padT + 8}" font-size="9.5" fill="#C9962B" text-anchor="end">${(fMax * 100).toFixed(0)}%</text>
    <text x="${w - 2}" y="${h - padB}" font-size="9.5" fill="#C9962B" text-anchor="end">0%</text>
  </svg>`;
}

function crCards(d) {
  const c = d.cards, cur = d.account.currency;
  const dpp = c.freshShare != null && c.freshSharePrev != null ? (c.freshShare - c.freshSharePrev) * 100 : null;
  const verdict = c.freshCpa == null || c.staleCpa == null ? ''
    : c.freshCpa <= c.staleCpa * 0.95 ? 'fresh converts cheaper — good sign for launching more'
    : c.freshCpa >= c.staleCpa * 1.05 ? 'stale is cheaper right now — normal; fresh ads need a few days to settle'
    : 'fresh and stale cost about the same';
  const lbl = 'style="white-space:normal;line-height:1.45;display:block"';
  return `<div class="av-grid" style="grid-template-columns:repeat(auto-fill,minmax(225px,1fr))">
    <div class="av-card ${dpp == null ? '' : dpp >= 0 ? 'good' : 'bad'}"><span class="av-label" ${lbl} title="Of everything spent in the selected period, the share that went to ads ≤${d.fresh} days old. Falling week after week = coasting on old creative.">Budget going to new ads <span class="info-i">i</span></span>
      <b class="av-val" style="display:block;font-size:24px;margin:6px 0 2px">${c.freshShare == null ? '—' : (c.freshShare * 100).toFixed(1) + '%'}</b>
      <div class="av-trend ${dpp == null ? 'unk' : dpp >= 0 ? 'good' : 'bad'}">${dpp == null ? `of spend went to ads ≤${d.fresh} days old` : `was ${(c.freshSharePrev * 100).toFixed(1)}% the period before · ${dpp >= 0 ? '▲' : '▼'}${Math.abs(dpp).toFixed(1)}pp`}</div></div>
    <div class="av-card"><span class="av-label" ${lbl} title="The average age of the ads the money actually ran on, weighted by spend. 64 days = the typical dollar went to a two-month-old ad.">How old are the ads we're funding? <span class="info-i">i</span></span>
      <b class="av-val" style="display:block;font-size:24px;margin:6px 0 2px">${c.swAge == null ? '—' : Math.round(c.swAge) + ' days'}</b>
      <div class="av-trend">average age of the ads behind the spend</div></div>
    <div class="av-card"><span class="av-label" ${lbl} title="CPA from ads ≤${d.fresh} days old ('fresh'), over the selected period">Fresh CPA (≤${d.fresh}d) <span class="info-i">i</span></span>
      <b class="av-val" style="display:block;font-size:24px;margin:6px 0 2px">${fmtMoney(c.freshCpa, cur)}</b><div class="av-trend">${c.freshCpa == null ? 'no purchases from fresh ads in this period yet' : `CPA from ads ≤${d.fresh}d old`}</div></div>
    <div class="av-card"><span class="av-label" ${lbl} title="CPA from ads older than ${d.fresh} days ('stale'), over the selected period">Stale CPA (>${d.fresh}d) <span class="info-i">i</span></span>
      <b class="av-val" style="display:block;font-size:24px;margin:6px 0 2px">${fmtMoney(c.staleCpa, cur)}</b>
      <div class="av-trend">${verdict}</div></div>
  </div>`;
}

/** Which individual ads are carrying the spend — and earning it. */
function crAds(d) {
  const a = d.ads; if (!a || !a.ads.length) return '';
  const cur = d.account.currency;
  const scale = a.ads.filter(x => x.verdict === 'scale').length, cut = a.ads.filter(x => x.verdict === 'cut').length;
  const rows = a.ads.slice(0, 15).map(x => `<tr>
    <td><b class="ad-name" title="${esc(x.name)}">${esc(x.name)}</b>
      <span class="tiny">${x.age == null ? '' : x.age + 'd old'}${x.fresh ? ' · <span class="vd fresh">new</span>' : ''}</span></td>
    <td class="num">${fmtK(x.spend, cur)}<br><span class="tiny">${(x.share * 100).toFixed(0)}% of spend</span></td>
    <td class="num">${x.purchases ? Math.round(x.purchases) : '—'}</td>
    <td class="num"><b>${fmtMoney(x.cpa, cur)}</b>${x.cpa != null && a.acct_cpa ? delta(x.cpa, a.acct_cpa, true) : ''}</td>
    <td class="num">${fmtX(x.roas)}</td>
    <td>${x.verdict === 'scale' ? '<span class="vd scale">scale</span>' : x.verdict === 'cut' ? '<span class="vd cut">cut / fix</span>' : '<span class="tiny">holding</span>'}</td></tr>`).join('');
  return `<div class="card"><h3 style="margin-bottom:2px">Which ads are carrying the spend — and earning it?</h3>
    <p class="hint" style="margin-bottom:10px">Every ad that spent in the last ${a.window} days, biggest first. <b>Scale</b> = CPA at least 20% better than this account's ${fmtMoney(a.acct_cpa, cur)} average; <b>cut / fix</b> = 40%+ worse, or spending with no purchases at all. Judged against the account's own average, never an outside benchmark — and give new ads a few days before acting.</p>
    <div class="tbl-wrap"><table><thead><tr><th>Ad</th><th class="num">Spend</th><th class="num">Purchases</th><th class="num">CPA <span class="tiny">vs acct</span></th><th class="num">ROAS</th><th>Read</th></tr></thead><tbody>${rows}</tbody></table></div>
    <p class="tiny" style="margin-top:8px">${a.ads.length > 15 ? `Showing the top 15 of ${a.ads.length} spending ads. ` : ''}${scale} to scale · ${cut} to cut or fix. ROAS/CPA are Meta-attributed.</p></div>`;
}

async function renderCreative() {
  const active = S.accounts.filter(a => a.active);
  const single = S.act !== 'all' ? active.find(a => a.act_id === S.act) : null;
  $('#main').innerHTML = `<h2>Creative Rotation</h2>
    <p class="sub"><b>One question: are we feeding this account new ads, or coasting on old ones?</b> Old ads wear out and CPA creeps up — this page shows the coasting before the CPA spike. An ad counts as "new" for its first days of spending (you pick how many below).</p>
    ${setupBanner()}
    <div class="row">
      <span class="tiny" style="font-weight:700" title="An ad younger than this counts as new">An ad is “new” for its first:</span>
      ${['7', '14', '30'].map(v => `<button class="chip ${CR.fresh === v ? 'on' : ''}" data-f="${v}">${v} days</button>`).join('')}
      <span class="tiny" style="font-weight:700;margin-left:14px" title="The cards look at spend from this recent period">Look at the last:</span>
      ${[['1', '1 day'], ['7', '7 days'], ['14', '14 days']].map(([v, l]) => `<button class="chip ${CR.win === v ? 'on' : ''}" data-g="${v}">${l}</button>`).join('')}
      <span style="flex:1"></span>
      <button class="help-btn" data-mhelp="creative">? How to use</button>
    </div>
    <div id="crBody"><div class="card"><span class="hint">Loading…</span></div></div>`;
  document.querySelectorAll('#main .chip').forEach(c => c.onclick = () => {
    if (c.dataset.f) { CR.fresh = c.dataset.f; localStorage.setItem('ah_cr_fresh', CR.fresh); }
    if (c.dataset.g) { CR.win = c.dataset.g; localStorage.setItem('ah_cr_win', CR.win); }
    renderCreative();
  });
  const targets = single ? [single] : active;
  if (!targets.length) { $('#crBody').innerHTML = ''; return; }
  try {
    const res = await Promise.all(targets.map(a => api(`/api/creative?act=${a.act_id}&fresh=${CR.fresh}&window=${CR.win}`)));
    $('#crBody').innerHTML = res.map((d, i) => {
      const head = single ? '' : `<div class="av-client">${esc(targets[i].name)}</div>`;
      const bf = d.backfill;
      const bfBanner = bf ? `<div class="notice warn">⏳ <div><b>Loading ad history for ${esc(targets[i].name)} — ${bf.error ? 'hit an error' : `${bf.daysDone ?? 0} of ${bf.daysTotal ?? 90} days in`}.</b> ${bf.error ? `<code>${esc(bf.error)}</code>` : 'Each refresh (and every nightly sync) pulls more; numbers firm up as it completes.'}</div></div>` : '';
      if (d.empty) return `${head}${bfBanner || `<div class="card"><span class="hint">No ad-level data yet — hit ↻ Sync now.</span></div>`}`;
      const ins = d.insight;
      return `${head}${bfBanner}${crCards(d)}
        ${single ? crAds(d) : ''}
        ${ins ? `<div class="cr-quote">${(() => {
          const cur2 = d.account.currency, hi = fmtMoney(ins.topCpa, cur2), lo = fmtMoney(ins.botCpa, cur2);
          if (ins.topCpa <= ins.botCpa * 0.95) return `<b>Launching more has been working for this account.</b> In weeks heavy on new ads, CPA averaged ${hi}. In weeks light on new ads, ${lo}.`;
          if (ins.topCpa >= ins.botCpa * 1.05) return `<b>Heavy launch weeks ran a little pricier here</b> — CPA ${hi} vs ${lo} in quiet weeks. Normal: new ads need a few days to settle, so judge them on week two.`;
          return `<b>Launching more hasn't cost this account anything</b> — CPA was about the same in heavy launch weeks (${hi}) and quiet ones (${lo}). No reason to slow the launch pace.`;
        })()} <span class="tiny">(comparing the ${ins.n} weeks with the highest new-ad share vs the ${ins.n} lowest, last ~13 weeks)</span></div>` : ''}
        ${single ? `<div class="card"><h3 style="margin-bottom:2px">Where each week's budget went, by ad age</h3><p class="hint" style="margin-bottom:6px">Each bar is one week of spend, split by how old the ads were. <b>Dark green at the bottom = brand-new ads.</b> If the dark green keeps shrinking week after week, the account is coasting on old creative. Hover or tap a week for its numbers.</p>
          <div class="tiny" id="crBarsRo" style="min-height:18px;font-weight:600"></div>${crBars(d.weekly)}
          <p class="tiny" style="margin-top:6px">${CR_LABELS.map((l, ci) => `<span style="color:${CR_COLORS[ci]}">■</span> ${l}`).join(' &nbsp; ')}</p></div>
        <div class="card"><h3 style="margin-bottom:2px">Does launching more new ads change what a purchase costs?</h3><p class="hint" style="margin-bottom:6px"><span style="color:#1C7A46;font-weight:700">Green line</span> = cost per purchase that week. <span style="color:#C9962B;font-weight:700">Amber line</span> = share of budget on new ads that week. The thing to look for: when amber goes up, does green come down? Hover or tap for exact weeks.</p>
          <div class="tiny" id="crDualRo" style="min-height:18px;font-weight:600"></div>${crDual(d.weekly, d.account.currency)}</div>` : ''}`;
    }).join('');
    if (single && res[0] && !res[0].empty) wireCreativeCharts(res[0]);
  } catch (e) { $('#crBody').innerHTML = `<div class="card"><span style="color:var(--bad)">${esc(e.message)}</span></div>`; }
}

/** Crosshair readouts for the Creative Rotation charts — hover and tap both work. */
function wireCreativeCharts(d) {
  const wk = d.weekly, cur = d.account.currency, n = wk.length;
  if (!n) return;
  const attach = (svgId, roId, toIdx, guideX, fmt) => {
    const svg = document.getElementById(svgId), ro = document.getElementById(roId);
    if (!svg || !ro) return;
    const g = svg.querySelector('.fx-guide');
    const f = e => {
      const r = svg.getBoundingClientRect();
      const vx = (e.clientX - r.left) / r.width * 900;
      const i = Math.max(0, Math.min(n - 1, toIdx(vx)));
      if (g) { const gx = guideX(i); g.setAttribute('x1', gx); g.setAttribute('x2', gx); g.setAttribute('opacity', '.5'); }
      ro.innerHTML = fmt(wk[i]);
    };
    svg.addEventListener('pointermove', f);
    svg.addEventListener('pointerdown', f);
  };
  const fmtWeek = w => new Date(w + 'T12:00:00Z').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const barW = (900 - 30) / n;
  attach('crBarsSvg', 'crBarsRo', vx => Math.floor((vx - 30) / barW), i => 30 + (i + 0.5) * barW,
    w => {
      const nz = w.shares.map((s, bi) => ({ s, bi })).filter(x => x.s >= 0.005);
      const ages = nz.length === 1 ? `all of it went to ads ${CR_LABELS[nz[0].bi]} old`
        : nz.map(x => `${(x.s * 100).toFixed(0)}% to ads ${CR_LABELS[x.bi]} old`).join(' · ');
      return `<b>week of ${fmtWeek(w.week)}</b> · spend ${fmtK(w.spend, cur)} · CPA ${fmtMoney(w.cpa, cur)} · ${ages || 'no spend'}`;
    });
  const iw = 900 - 48 - 44;
  attach('crDualSvg', 'crDualRo', vx => Math.round((vx - 48) / iw * (n - 1)), i => 48 + i / Math.max(1, n - 1) * iw,
    w => `<b>week of ${fmtWeek(w.week)}</b> · <span style="color:#1C7A46;font-weight:700">CPA ${fmtMoney(w.cpa, cur)}</span> · <span style="color:#C9962B;font-weight:700">${(w.freshShare * 100).toFixed(0)}% of spend on new ads</span>`);
}

/* ---------- Read-only client share view (?share=token) ---------- */

/* ---------- Overview (Meta) ----------
   The monthly "budget pace" column that used to sit here is gone: the month is
   planned and measured in Plan, against blended revenue and total spend across
   every platform, and a Meta-only copy of the same question disagreed with it.
   What stays is the part that is genuinely Meta's — delivery and efficiency
   against this account's own recent form. */
async function renderMetaOverview() {
  $('#main').innerHTML = `<h2>Meta — Overview</h2>
    <p class="sub">Every client's Meta account at a glance: what it spent, and whether the last 7 days beat its own last 30. Meta-reported, so these match Ads Manager — they will not match the blended figures on the other tabs, and are not meant to.</p>
    ${setupBanner()}<div class="card"><span class="hint">Loading…</span></div>`;
  if (!S.accounts.some(a => a.active)) { const c = $('#main .card'); if (c) c.remove(); return; }
  let data;
  try { data = (await api('/api/overview')).accounts; }
  catch (e) { $('#main .card').innerHTML = `<span style="color:var(--bad)">${esc(e.message)}</span>`; return; }
  S.overview = data;
  const rows = (S.act === 'all' ? data : data.filter(a => a.act_id === S.act)).map(a => {
    const m = a.mtd;
    const stale = a.last_sync_insights && (Date.now() - parseTs(a.last_sync_insights)) > 36*3600e3;
    return `<tr>
      <td><b>${esc(a.name)}</b><br><span class="tiny">${a.last_error ? `<span style="color:var(--bad)">⚠ ${esc(a.last_error).slice(0,60)}</span>` : `synced ${fmtAgo(a.last_sync_insights)}${stale?' ⚠':''} · ${a.changes_24h} changes/24h`}</span></td>
      <td class="num">${fmtK(a.today_spend, a.currency)}</td>
      <td class="num"><b>${fmtK(m.spend, a.currency)}</b><br><span class="tiny">this month so far</span></td>
      <td class="num">${fmtK(m.last_month_same_day, a.currency)}${delta(m.spend, m.last_month_same_day)}<br><span class="tiny">full month ${fmtK(m.last_month_total, a.currency)}</span></td>
      <td class="num">${fmtMoney(a.l7.cpa, a.currency)}${delta(a.l7.cpa, a.l30.cpa, true)}<br><span class="tiny">30d ${fmtMoney(a.l30.cpa, a.currency)}</span></td>
      <td class="num">${fmtX(a.l7.roas)}${delta(a.l7.roas, a.l30.roas)}<br><span class="tiny">30d ${fmtX(a.l30.roas)}</span></td>
      <td class="num">${fmtK(a.l7.spend_per_day, a.currency)}${delta(a.l7.spend_per_day, a.l30.spend_per_day)}<br><span class="tiny">30d ${fmtK(a.l30.spend_per_day, a.currency)}</span></td>
      <td class="num">${a.l7.ctr==null?'—':(a.l7.ctr*100).toFixed(2)+'%'}${delta(a.l7.ctr, a.l30.ctr)}</td>
      <td class="num">${fmtMoney(a.l7.cpm, a.currency)}${delta(a.l7.cpm, a.l30.cpm, true)}</td>
    </tr>`;
  }).join('');
  $('#main .card').innerHTML = `<div class="tbl-wrap"><table>
    <thead><tr><th>Client</th><th class="num">Today</th><th class="num">Month so far</th><th class="num">Last month (same day)</th><th class="num">CPA 7d vs 30d</th><th class="num">ROAS 7d vs 30d</th><th class="num">Spend/day 7d vs 30d</th><th class="num">CTR 7d</th><th class="num">CPM 7d</th></tr></thead>
    <tbody>${rows || '<tr><td colspan="9" class="tiny">No data yet — the first sync may still be running.</td></tr>'}</tbody></table></div>
    <p class="tiny" style="margin-top:10px">7d/30d windows end yesterday; the last ~3 days of conversions are still settling, so recent CPA and ROAS read slightly worse than they will finish. <b>ROAS here is Meta's own attributed figure</b> — structurally lower than blended MER, and not comparable to the MER goal on Plan.</p>`;
}

/** How far through a NORMAL day this account usually is by now — the divisor
 *  behind the projection. Worth surfacing, because the projection is today's
 *  spend divided by it: at 9am that can be a 6x multiplier on a couple of hours
 *  of data, and a number presented without that context reads far more certain
 *  than it is. Below 5% elapsed the arithmetic is meaningless, so it says so
 *  rather than printing a confident figure off almost nothing. */
const dayShare = p => (p && p.l7_by_now && p.l7_daily_avg) ? p.l7_by_now / p.l7_daily_avg : null;

function projCell(p, cur) {
  const share = dayShare(p);
  if (share == null || p.projected == null) return '<span class="tiny">—</span>';
  if (share < 0.05) return `<span class="tiny">too early to project</span>`;
  return `${fmtK(p.projected, cur)}<br><span class="tiny">${Math.round(share * 100)}% of a normal day in</span>`;
}

/* ---------- Today (live intraday) ----------
   The one question Plan cannot answer: is the account delivering right now? */
async function renderToday() {
  const single = S.act !== 'all';
  $('#main').innerHTML = `<h2>Meta — Today</h2>
    <p class="sub">Is today running hot or cold against a normal day? Today's cumulative Meta spend against the average shape of the last 7 days, hour by hour.</p>
    ${setupBanner()}
    <div class="row"><span style="flex:1"></span><button class="help-btn" data-mhelp="today">? How to use</button></div>
    <div id="hpToday"><div class="card"><span class="hint">${single ? 'Pulling today&rsquo;s hourly spend from Meta…' : 'Loading…'}</span></div></div>`;
  if (!single) {
    const active = S.accounts.filter(a => a.active);
    $('#hpToday').innerHTML = `<div class="card"><div class="tbl-wrap"><table>
      <thead><tr><th>Client</th><th class="num">Spent so far</th><th class="num">Typical by now</th><th class="num">vs normal</th><th class="num">Projected today</th></tr></thead>
      <tbody id="hpRows">${active.map(a => `<tr data-act="${a.act_id}"><td><b>${esc(a.name)}</b></td><td colspan="4" class="tiny">loading…</td></tr>`).join('') || '<tr><td class="tiny">No active clients.</td></tr>'}</tbody></table></div>
      <p class="tiny" style="margin-top:10px">Pick a client in the top-right for the full hour-by-hour curve. Pulled live from Meta on every visit.</p></div>`;
    for (const a of active) {
      try {
        const p = await api('/api/pacing?act=' + a.act_id);
        const tr = document.querySelector(`#hpRows tr[data-act="${a.act_id}"]`);
        if (!tr) continue;
        const cls = p.vs_pace == null || Math.abs(p.vs_pace) <= 0.1 ? 'unk' : p.vs_pace > 0 ? 'good' : 'bad';
        tr.innerHTML = `<td><b>${esc(a.name)}</b></td>
          <td class="num"><b>${fmtK(p.spent, a.currency)}</b></td>
          <td class="num">${fmtK(p.l7_by_now, a.currency)}</td>
          <td class="num"><span class="delta ${cls}">${p.vs_pace == null ? '—' : fmtPct(p.vs_pace, 0)}</span></td>
          <td class="num">${projCell(p, a.currency)}</td>`;
      } catch { /* one client failing must not blank the whole table */ }
    }
    return;
  }
  const load = async () => {
    try {
      const p = await api('/api/pacing?act=' + S.act);
      $('#hpToday').innerHTML = buildTodayCard(p);
      wireTodayChart(p);
      const r = $('#hpRefresh');
      if (r) r.onclick = () => { $('#hpToday').firstElementChild.style.opacity = .5; load(); };
    } catch (e) { $('#hpToday').innerHTML = `<div class="card"><span style="color:var(--bad)">${esc(e.message)}</span></div>`; }
  };
  load();
}

/* ---------- router ---------- */
const SUBS = [
  ['overview', 'Overview', renderMetaOverview],
  ['today', 'Today', renderToday],
  ['changelog', 'Change Log', renderChangeLog],
  ['averages', 'Averages', renderAverages],
  ['creative', 'Creative', renderCreative],
];
const HELP_TITLES = { today: 'How to use Today', changelog: 'How to use the Change Log',
  averages: 'How to use Averages', creative: 'How to use Creative Rotation' };

document.addEventListener('click', e => {
  const hb = e.target.closest('.help-btn[data-mhelp]');
  if (hb) helpModal(HELP_TITLES[hb.dataset.mhelp], META_HELP[hb.dataset.mhelp]);
});

/** Load the Meta account list once per session (currency, tz, active flags). */
async function ensureAccounts(force) {
  if (S.accounts.length && !force) return;
  const [acc, health] = await Promise.all([
    api('/api/accounts'),
    fetch(S.url + '/health').then(r => r.json()).catch(() => null),
  ]);
  S.accounts = acc.accounts || [];
  S.health = health;
}

window.MetaTab = {
  subs: SUBS.map(([id, label]) => ({ id, label })),
  /** ctx = { tok, act, sub } — the host owns sign-in and the client picker. */
  async render(ctx) {
    S.tok = ctx.tok;
    S.act = ctx.act || 'all';
    const entry = SUBS.find(s => s[0] === ctx.sub) || SUBS[0];
    try { await ensureAccounts(); }
    catch (e) {
      $('#main').innerHTML = `<h2>Meta</h2><div class="card"><span style="color:var(--bad)">Couldn&rsquo;t reach the Meta service: ${esc(e.message)}</span></div>`;
      return;
    }
    await entry[2]();
  },
  /* Used by the merged Settings tab, which lives in the host page. */
  api, ensureAccounts, accounts: () => S.accounts,
};
})();

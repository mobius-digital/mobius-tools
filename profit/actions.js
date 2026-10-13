/* ACTION ITEMS (2026-10-13, second pass after Cole: "think about how someone should use this... you should be able to
 * look over this and just approve it"). ONE page, one rail item, team only (AGENCY_TABS). Old ids calls / monday /
 * meetings route here.
 *
 *   To approve     one card per call Locus read (Fireflies). Skim, nod, press Approve and send. Every item is one row:
 *                  type (Task / Brief / Ask the client), the words, owner, due. Click anything to change it in place;
 *                  x drops a row. The client's lines sit in a quote block that says exactly where the client reads them.
 *                  Above the button, "Approving will" counts what happens: tasks on the list (per person), numbered
 *                  briefs in each brand's Asana Creative Brief column, asks in Requests, lines in the weekly report,
 *                  one note per brand in its internal Slack channel.
 *   The list       every open item per brand, agency-wide first: tick it done, click the words, owner or date to change
 *                  them. A Brief row links its Asana task. On Mondays (and from Friday, to prepare) each brand also shows
 *                  last week's numbers and the strategist's plan, and the week's theme sits on top.
 *   Done, Past calls  folded at the bottom.
 * Engine: account-health actions.js (/api/actions) + meetings.js (/api/meetings, /confirm, /skip, /ingest, /poll, /monday,
 * /theme). Classic script, own closure; the host hands in S, api, apiAH, show, pageHead, RUN.
 * Exports window.ActionsTab = { render(host, first) }.
 */
(() => {
  let H = null;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const TYPES = [['team', 'Task'], ['brief', 'Brief'], ['client_owes', 'Ask the client']];
  const dt = iso => new Date(String(iso).slice(0, 10) + 'T12:00:00Z');
  const md = iso => iso ? dt(iso).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' }) : '';
  const short = iso => iso ? dt(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' }) : '';
  const addDays = (iso, n) => { const d = dt(iso); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
  const money = n => n == null ? '–' : '$' + (Math.abs(n) >= 10000 ? Math.round(n / 1000) + 'K' : Math.round(n).toLocaleString('en-US'));
  const pct = (a, b) => (a == null || !b) ? null : Math.round((a / b - 1) * 100);
  let D = null;   // { meetings, pending:[full meeting], items, team, brands, today, remind, connected, webhook }
  let MON = null, SEV = {}, DONE = null, OWNER = 'all', AGENDA = null;

  /* ---------- look ---------- */
  function css() {
    if (document.getElementById('aicss')) return;
    const st = document.createElement('style'); st.id = 'aicss';
    st.textContent = `
      .ai{max-width:1100px}
      .ai .ai-sec{display:flex;align-items:baseline;gap:4px 10px;margin:26px 0 10px;flex-wrap:wrap}
      .ai .ai-sec h2{font-size:15px;font-weight:650;margin:0;letter-spacing:-.005em;white-space:nowrap}
      .ai .ai-sec small{color:var(--muted);font-size:13px}
      .ai .ai-sec .sp{flex:1}
      .ai .ai-card{background:var(--surface);border:1px solid var(--line);border-radius:14px;padding:20px 22px;margin:0 0 14px;box-shadow:var(--sh-card)}
      .ai .ai-card.ring{box-shadow:0 0 0 2px var(--brand)}
      .ai .ai-ch{display:flex;gap:12px;align-items:flex-start}
      .ai .ai-ch h3{margin:0;font-size:16px;font-weight:650}
      .ai .ai-ch small{display:block;color:var(--muted);font-size:12.5px;margin:3px 0 0}
      .ai .ai-ch .sp{flex:1}
      .ai .ai-sum{font-size:14px;line-height:1.6;color:var(--ink-2);margin:12px 0 4px;padding:2px 4px;margin-left:-4px;border-radius:6px}
      .ai [contenteditable]{outline:none;border-radius:5px;cursor:text}
      .ai [contenteditable]:hover{background:var(--surface-2)}
      .ai [contenteditable]:focus{background:var(--surface-2);box-shadow:0 0 0 1px var(--line-strong)}
      .ai .ai-brand{border-top:1px solid var(--line);margin:16px 0 0;padding:14px 0 0}
      .ai .ai-brand h4{margin:0 0 8px;font-size:14px;font-weight:650}
      .ai .ai-lbl{font-size:11px;font-weight:600;letter-spacing:.07em;text-transform:uppercase;color:var(--muted);margin:10px 0 6px}
      .ai .ai-dec{margin:0;padding:0 0 0 18px;font-size:13.5px;line-height:1.55;color:var(--ink-2)}
      .ai .ai-dec li{margin:0 0 2px}
      .ai .ai-row{display:flex;gap:8px;align-items:center;padding:7px 0;min-height:34px}
      .ai .ai-row + .ai-row{border-top:1px solid var(--line)}
      .ai .ai-row .t{flex:1;min-width:0;font-size:14px;line-height:1.45;padding:2px 4px}
      .ai .ai-row.off .t{text-decoration:line-through;color:var(--muted)}
      .ai .ai-row.off .ai-chip,.ai .ai-row.off .ai-type{opacity:.4}
      .ai .ai-row.hi{background:var(--brand-soft);border-radius:8px;padding-left:8px;padding-right:8px}
      .ai .ai-chip,.ai .ai-type{font:inherit;font-size:12.5px;line-height:1;padding:6px 10px;border-radius:999px;border:1px solid var(--line);background:var(--surface-2);color:var(--ink);cursor:pointer;white-space:nowrap;-webkit-appearance:none;appearance:none;position:relative}
      .ai select.ai-chip,.ai select.ai-type{padding-right:10px}
      .ai .ai-chip:hover,.ai .ai-type:hover{border-color:var(--line-strong)}
      .ai .ai-chip.none{color:var(--muted)}
      .ai .ai-chip.late{color:var(--bad);border-color:color-mix(in srgb,var(--bad) 40%,transparent)}
      .ai .ai-chip.now{color:var(--warn);border-color:color-mix(in srgb,var(--warn) 40%,transparent)}
      .ai .ai-type{min-width:0;font-weight:550}
      .ai .ai-type[data-k=brief]{background:var(--brand-soft);border-color:transparent}
      .ai .ai-type[data-k=client_owes]{background:color-mix(in srgb,var(--warn) 14%,transparent);border-color:transparent}
      .ai .ai-row[data-kind=client_owes] [data-f=owner]{visibility:hidden}
      .ai .ai-due{position:relative}
      .ai .ai-due input{position:absolute;inset:0;opacity:0;pointer-events:none;width:100%}
      .ai .ai-x{border:0;background:transparent;color:var(--muted);font-size:17px;line-height:1;width:26px;height:26px;border-radius:6px;cursor:pointer;flex:none}
      .ai .ai-x:hover{background:var(--surface-2);color:var(--ink)}
      .ai .ai-tick{width:20px;height:20px;border-radius:50%;border:1.5px solid var(--line-strong);background:transparent;cursor:pointer;flex:none;display:grid;place-items:center;color:transparent;padding:0}
      .ai .ai-tick:hover{border-color:var(--good);color:var(--good)}
      .ai .ai-row.done .ai-tick{background:var(--good);border-color:var(--good);color:var(--surface)}
      .ai .ai-row.done .t{text-decoration:line-through;color:var(--muted)}
      .ai .ai-meta{font-size:12px;color:var(--muted);padding:0 4px;margin:-2px 0 0}
      .ai .ai-meta a{color:inherit}
      .ai .ai-asana{font-size:12px;color:var(--ink);text-decoration:none;padding:5px 9px;border-radius:999px;background:var(--brand-soft);white-space:nowrap}
      .ai .ai-add{font:inherit;font-size:13px;background:transparent;border:0;color:var(--muted);cursor:pointer;padding:6px 4px}
      .ai .ai-add:hover{color:var(--ink)}
      .ai .ai-client{margin:12px 0 0;padding:12px 16px;border-left:3px solid var(--brand);background:var(--surface-2);border-radius:0 10px 10px 0}
      .ai .ai-client .ai-lbl{margin-top:0}
      .ai .ai-client .ai-lbl + .ai-lbl,.ai .ai-client ul + .ai-lbl{margin-top:12px}
      .ai .ai-client ul{list-style:none;margin:0;padding:0}
      .ai .ai-client li{display:flex;gap:6px;align-items:flex-start;font-size:14px;line-height:1.5;padding:3px 0}
      .ai .ai-client li .t{flex:1;padding:1px 4px}
      .ai .ai-client li::before{content:"";width:5px;height:5px;border-radius:50%;background:var(--muted);margin:9px 2px 0 0;flex:none}
      .ai .ai-will{margin:18px 0 0;padding:14px 16px;border-radius:10px;background:var(--surface-2);font-size:13.5px;line-height:1.55}
      .ai .ai-will b{display:block;font-size:11px;letter-spacing:.07em;text-transform:uppercase;color:var(--muted);font-weight:600;margin:0 0 6px}
      .ai .ai-will ul{margin:0;padding:0 0 0 18px}
      .ai .ai-will p{margin:8px 0 0;color:var(--muted);font-size:12.5px}
      .ai .ai-foot{display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin:14px 0 0}
      .ai .ai-err{color:var(--bad);font-size:13px}
      .ai .ai-ok{font-size:13.5px;line-height:1.55}
      .ai .ai-ok ul{margin:6px 0 0;padding:0 0 0 18px}
      .ai .ai-warn{color:var(--warn);font-size:13px;margin:6px 0 0}
      .ai .ai-bar{display:flex;gap:6px;flex-wrap:wrap;align-items:center;margin:0 0 4px}
      .ai .ai-pill{font:inherit;font-size:12.5px;padding:5px 11px;border-radius:999px;border:1px solid var(--line);background:var(--surface);color:var(--ink);cursor:pointer}
      .ai .ai-pill.on{background:var(--brand-soft);border-color:var(--brand)}
      .ai .ai-group{background:var(--surface);border:1px solid var(--line);border-radius:14px;padding:14px 18px 10px;margin:0 0 12px}
      .ai .ai-gh{display:flex;gap:10px;align-items:baseline;flex-wrap:wrap;margin:0 0 4px}
      .ai .ai-gh h3{margin:0;font-size:15px;font-weight:650}
      .ai .ai-gh small{color:var(--muted);font-size:12.5px}
      .ai .ai-dot{width:9px;height:9px;border-radius:50%;background:var(--muted);display:inline-block;margin:0 2px 1px 0}
      .ai .ai-dot.bad{background:var(--bad)}.ai .ai-dot.warn{background:var(--warn)}.ai .ai-dot.good{background:var(--good)}
      .ai .ai-read{display:flex;gap:16px;flex-wrap:wrap;font-size:13px;color:var(--ink-2);padding:8px 0 4px}
      .ai .ai-read b{color:var(--ink);font-weight:650}
      .ai .ai-read .up{color:var(--good)}.ai .ai-read .dn{color:var(--bad)}
      .ai details.ai-plan{margin:2px 0 6px}
      .ai details.ai-plan summary{cursor:pointer;font-size:13px;color:var(--muted)}
      .ai details.ai-plan div{white-space:pre-wrap;font-size:13.5px;line-height:1.55;padding:8px 12px;margin:6px 0 0;background:var(--surface-2);border-radius:8px}
      .ai .ai-new{display:flex;gap:8px;align-items:center;background:var(--surface);border:1px solid var(--line);border-radius:12px;padding:8px 10px;margin:0 0 14px}
      .ai .ai-new input[type=text]{flex:1;min-width:0;font:inherit;font-size:14px;border:0;background:transparent;color:var(--ink);padding:6px 4px;outline:none}
      .ai .ai-theme{display:flex;gap:8px;align-items:flex-start}
      .ai .ai-theme textarea{flex:1;min-height:44px;font:inherit;font-size:14px;padding:8px 10px;border:1px solid var(--line);border-radius:10px;background:var(--surface-2);color:var(--ink);resize:vertical}
      .ai details.ai-fold{margin:18px 0 0}
      .ai details.ai-fold > summary{cursor:pointer;font-size:13.5px;color:var(--muted);padding:6px 0}
      .ai .ai-call{border-top:1px solid var(--line);padding:9px 0}
      .ai .ai-call:first-of-type{border-top:0}
      .ai .ai-call summary{display:flex;gap:10px;align-items:center;cursor:pointer;list-style:none;font-size:14px}
      .ai .ai-call summary::-webkit-details-marker{display:none}
      .ai .ai-call summary small{color:var(--muted);font-size:12.5px}
      .ai .ai-call .body{padding:8px 0 4px 2px;font-size:13.5px;line-height:1.55;color:var(--ink-2)}
      .ai .ai-st{font-size:11.5px;padding:3px 8px;border-radius:999px;background:var(--surface-2);color:var(--muted)}
      .ai .ai-st.good{color:var(--good)}.ai .ai-st.bad{color:var(--bad)}.ai .ai-st.warn{color:var(--warn)}
      .ai .ai-empty{color:var(--muted);font-size:13.5px;padding:6px 0}
      @media (max-width:720px){.ai .ai-row{flex-wrap:wrap}.ai .ai-row .t{flex-basis:100%;order:-1}.ai .ai-card{padding:16px}}
    `;
    document.head.appendChild(st);
  }

  /* ---------- helpers ---------- */
  const post = (path, body) => H.apiAH(path, { method: 'POST', body: JSON.stringify(body) });
  const toast = msg => { const t = document.createElement('div'); t.setAttribute('role', 'status'); t.style.cssText = 'position:fixed;left:50%;bottom:24px;transform:translateX(-50%);max-width:min(560px,calc(100vw - 32px));background:var(--ink);color:var(--surface);padding:10px 16px;border-radius:12px;font-size:13.5px;z-index:9999;box-shadow:0 8px 30px rgba(0,0,0,.25)'; t.textContent = msg; document.body.appendChild(t); setTimeout(() => t.remove(), 5000); };
  const brandName = id => id ? ((D.brands.find(b => b.act_id === id) || {}).name || id) : 'Agency-wide';
  const firstName = s => String(s || '').split(/[@\s]/)[0].replace(/^./, c => c.toUpperCase());
  const today = () => D.today || new Date().toISOString().slice(0, 10);
  function dueLabel(due, open = true) {
    if (!due) return ['Due date', 'none'];
    const t = today();
    if (open && due < t) return [`${short(due)}, late`, 'late'];
    if (due === t) return ['Today', open ? 'now' : ''];
    if (due === addDays(t, 1)) return ['Tomorrow', ''];
    return [short(due), ''];
  }
  const ownerSel = (v, extra = '') => `<select class="ai-chip${v ? '' : ' none'}" data-f="owner" aria-label="Owner"${extra}><option value="">Owner</option>${D.team.map(n => `<option ${n === v ? 'selected' : ''}>${esc(n)}</option>`).join('')}${v && !D.team.includes(v) ? `<option selected>${esc(v)}</option>` : ''}</select>`;
  const dueChip = (due, open = true) => { const [l, c] = dueLabel(due, open); return `<span class="ai-chip ai-due ${c}" data-f="due" role="button" tabindex="0" aria-label="Due date">${esc(l)}<input type="date" value="${esc(due || '')}" tabindex="-1"></span>`; };
  const typeSel = k => `<select class="ai-type" data-f="kind" data-k="${k}" aria-label="What kind of item">${TYPES.map(([v, l]) => `<option value="${v}" ${v === k ? 'selected' : ''}>${l}</option>`).join('')}</select>`;
  /* A date chip: clicking it opens the browser's own date picker. */
  function wireDue(chip, onPick) {
    const inp = $('input', chip);
    const open = () => { try { inp.showPicker(); } catch { inp.style.pointerEvents = 'auto'; inp.focus(); } };
    chip.onclick = open; chip.onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } };
    inp.onchange = () => { const [l, c] = dueLabel(inp.value, true); chip.firstChild.textContent = l; chip.className = `ai-chip ai-due ${c}`; onPick && onPick(inp.value); };
  }
  /* contenteditable words: Enter commits, Escape puts it back. */
  function wireText(el, onCommit) {
    el.setAttribute('contenteditable', 'plaintext-only');
    if (el.contentEditable !== 'plaintext-only') el.setAttribute('contenteditable', 'true');
    let was = el.textContent;
    el.onfocus = () => { was = el.textContent; };
    el.onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); el.blur(); } if (e.key === 'Escape') { el.textContent = was; el.blur(); } };
    el.onblur = () => { const v = el.textContent.replace(/\s+/g, ' ').trim(); el.textContent = v; if (v !== was && onCommit) onCommit(v, was); };
  }

  /* ================= TO APPROVE: one card per call ================= */
  function cardHtml(m) {
    const n = m.notes || { brands: [] };
    const brands = [...n.brands].sort((a, b) => (a.brand_id ? 1 : 0) - (b.brand_id ? 1 : 0));
    const who = (m.attendees || []).map(a => a.displayName || a.email).filter(Boolean);
    const body = brands.map((b, bi) => {
      /* The model's "tell the client" items read as client lines, so they live in the quote block. */
      const hear = [...new Set([...(b.this_week || []), ...b.items.filter(i => i.kind === 'client').map(i => i.text)])];
      const items = b.items.filter(i => i.kind !== 'client');
      const nm = brandName(b.brand_id);
      return `<section class="ai-brand" data-bi="${bi}" data-brand="${esc(b.brand_id)}">
        <h4>${esc(b.brand_id ? nm : 'Everyone (agency-wide)')}</h4>
        ${b.decisions.length ? `<div class="ai-lbl">Decided</div><ul class="ai-dec">${b.decisions.map(x => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}
        <div class="ai-lbl">To do</div>
        <div class="ai-rows">${items.map(i => rowDraft(i)).join('') || ''}</div>
        <button class="ai-add" data-addrow>+ Add one</button>
        ${b.brand_id ? `<div class="ai-client"><div class="ai-lbl">${esc(nm)} reads this in the weekly report, under "This week"</div>
          <ul data-lines="this_week">${hear.map(lineLi).join('')}</ul><button class="ai-add" data-addline="this_week">+ Add a line</button>
          <div class="ai-lbl">And under "What we need from you"</div>
          <ul data-lines="need_from_client">${(b.need_from_client || []).map(lineLi).join('')}</ul><button class="ai-add" data-addline="need_from_client">+ Add a line</button></div>` : ''}
      </section>`;
    }).join('');
    return `<article class="ai-card" data-mid="${esc(m.id)}">
      <div class="ai-ch"><div><h3>${esc(m.title || 'Untitled call')}</h3><small>${esc(md(m.date))}${m.duration ? ` · ${Math.round(m.duration)} min` : ''}${who.length ? ` · ${esc(who.slice(0, 6).join(', '))}${who.length > 6 ? ` +${who.length - 6}` : ''}` : ''}</small></div><span class="sp"></span>
        <button class="btn quiet" data-skip title="Nothing to act on: hide it">Skip this call</button></div>
      <p class="ai-sum" data-sum>${esc(n.summary || '')}</p>
      ${body || '<p class="ai-empty">The call did not land on any brand.</p>'}
      <div class="ai-will" data-will></div>
      <div class="ai-foot"><button class="btn primary" data-approve>Approve and send</button><span class="ai-err" data-err></span></div>
    </article>`;
  }
  const rowDraft = i => `<div class="ai-row" data-kind="${esc(i.kind || 'team')}">${typeSel(i.kind || 'team')}<span class="t" data-f="text">${esc(i.text)}</span>${ownerSel(i.owner || '')}${dueChip(i.due || '')}<button class="ai-x" data-x title="Leave this one out" aria-label="Leave this one out">×</button></div>`;
  const lineLi = x => `<li><span class="t">${esc(x)}</span><button class="ai-x" data-xl title="Remove" aria-label="Remove">×</button></li>`;

  function collect(card) {
    const m = D.pending.find(x => x.id === card.dataset.mid), n = m.notes;
    const brands = [...n.brands].sort((a, b) => (a.brand_id ? 1 : 0) - (b.brand_id ? 1 : 0));
    return { id: m.id, summary: $('[data-sum]', card).textContent.trim(), brands: brands.map((b, bi) => {
      const sec = $(`.ai-brand[data-bi="${bi}"]`, card);
      const items = $$('.ai-row', sec).filter(r => !r.classList.contains('off')).map(r => ({ kind: $('[data-f=kind]', r).value, text: $('[data-f=text]', r).textContent.trim(), owner: $('[data-f=owner]', r).value, due: $('[data-f=due] input', r).value })).filter(i => i.text);
      const lines = k => $$(`[data-lines="${k}"] .t`, sec).map(x => x.textContent.trim()).filter(Boolean);
      return { brand_id: b.brand_id, decisions: b.decisions, items, this_week: b.brand_id ? lines('this_week') : [], need_from_client: b.brand_id ? lines('need_from_client') : [] };
    }) };
  }
  /* "Approving will": counted from what is on the card right now, so nobody has to guess what the button does. */
  function will(card) {
    const body = collect(card), L = [];
    const tasks = [], briefs = {}, asks = {}, report = {}, chans = [];
    for (const b of body.brands) {
      const nm = brandName(b.brand_id);
      for (const i of b.items) {
        if (i.kind === 'team') tasks.push(i.owner || 'nobody yet');
        if (i.kind === 'brief') briefs[nm] = (briefs[nm] || 0) + 1;
        if (i.kind === 'client_owes' && b.brand_id) asks[nm] = (asks[nm] || 0) + 1;
      }
      const lines = b.this_week.length + b.need_from_client.length;
      if (lines) report[nm] = lines;
      if (b.items.length || lines || b.decisions.length) chans.push(b.brand_id ? `${nm}'s internal channel` : 'the agency channel');
    }
    if (tasks.length) { const by = {}; tasks.forEach(o => by[o] = (by[o] || 0) + 1); L.push(`Put ${tasks.length} task${tasks.length === 1 ? '' : 's'} on the list (${Object.entries(by).map(([o, c]) => `${esc(o)} ${c}`).join(', ')}). Slack reminds each owner the morning it is due.`); }
    for (const [nm, c] of Object.entries(briefs)) L.push(nm === 'Agency-wide' ? `Put ${c} brief${c === 1 ? '' : 's'} on the list. No brand, so nothing goes to Asana.` : `Make ${c} numbered brief${c === 1 ? '' : 's'} in ${esc(nm)}'s Asana, in the Creative Brief column, with the brief template, owner and due date. ${c === 1 ? 'It is' : 'Each is'} on the list too.`);
    for (const [nm, c] of Object.entries(asks)) L.push(`Ask ${esc(nm)} for ${c} thing${c === 1 ? '' : 's'} in Requests. They see it when they sign in and can mark it done.`);
    for (const [nm, c] of Object.entries(report)) L.push(`Add ${c} line${c === 1 ? '' : 's'} to ${esc(nm)}'s weekly report. They go out when the report is sent.`);
    if (chans.length) L.push(`Post one note in ${[...new Set(chans)].map(esc).join(', ')}.`);
    $('[data-will]', card).innerHTML = L.length ? `<b>Approving will</b><ul>${L.map(x => `<li>${x}</li>`).join('')}</ul><p>The client only sees the report lines and the asks. Everything else stays with the team.</p>` : '<b>Approving will</b>Nothing: every row is left out. Approve to file the notes, or Skip.';
  }
  function wireCard(card) {
    const redo = () => will(card);
    const wireRow = r => {
      const k = $('[data-f=kind]', r); k.onchange = () => { k.dataset.k = k.value; r.dataset.kind = k.value; redo(); };
      wireText($('[data-f=text]', r), redo);
      const o = $('[data-f=owner]', r); o.onchange = () => { o.classList.toggle('none', !o.value); redo(); };
      wireDue($('[data-f=due]', r), redo);
      $('[data-x]', r).onclick = () => { const off = r.classList.toggle('off'); $('[data-x]', r).textContent = off ? '↺' : '×'; $('[data-x]', r).title = off ? 'Put it back' : 'Leave this one out'; redo(); };
    };
    $$('.ai-row', card).forEach(wireRow);
    const wireLi = li => { wireText($('.t', li), redo); $('[data-xl]', li).onclick = () => { li.remove(); redo(); }; };
    $$('.ai-client li', card).forEach(wireLi);
    wireText($('[data-sum]', card));
    $$('[data-addrow]', card).forEach(b => b.onclick = () => { const box = b.previousElementSibling; box.insertAdjacentHTML('beforeend', rowDraft({ kind: 'team', text: '', owner: '', due: '' })); const r = box.lastElementChild; wireRow(r); $('[data-f=text]', r).focus(); });
    $$('[data-addline]', card).forEach(b => b.onclick = () => { const ul = b.previousElementSibling; ul.insertAdjacentHTML('beforeend', lineLi('')); const li = ul.lastElementChild; wireLi(li); $('.t', li).focus(); });
    $('[data-skip]', card).onclick = async () => {
      if (window.confirmModal && !(await window.confirmModal('Skip this call?', 'Nothing from it goes anywhere. It stays under Past calls, where you can read it again.', 'Skip it'))) return;
      await post('/api/meetings/skip', { id: card.dataset.mid }).catch(e => toast(e.message)); await load(); paint();
    };
    const go = $('[data-approve]', card), err = $('[data-err]', card);
    go.onclick = async () => {
      if (go.disabled) return; go.disabled = true; go.textContent = 'Sending…'; err.textContent = '';
      try {
        const r = (await post('/api/meetings/confirm', collect(card))).result;
        card.innerHTML = doneHtml(card.dataset.mid, r);
        await load(true); paintList(); paintPast();
      } catch (e) { err.textContent = e.message; go.disabled = false; go.textContent = 'Approve and send'; }
    };
    redo();
  }
  function doneHtml(id, r, title, by) {
    const m = D.pending.find(x => x.id === id) || { title };
    const rows = [...(r.brands || []), ...(r.agency ? [r.agency] : [])].map(b => {
      const bits = [];
      if (b.tasks.length) bits.push(`${b.tasks.length} on the list`);
      for (const x of b.briefs || []) bits.push(x.asana_url ? `<a href="${esc(x.asana_url)}" target="_blank" rel="noopener">Brief ${esc(x.num)} in Asana</a>` : `brief "${esc(x.text)}" on the list only`);
      if (b.asks.length) bits.push(`${b.asks.length} in Requests`);
      if (b.report) bits.push('report updated');
      if (b.slack) bits.push('Slack note posted');
      return `<li><b>${esc(b.name)}</b>: ${bits.join(', ') || 'notes filed'}</li>`;
    }).join('');
    return `<div class="ai-ok"><b>✓ Approved${by ? ` by ${esc(by)}` : ''}: ${esc(m.title || 'the call')}</b><ul>${rows}</ul>${(r.warnings || []).map(w => `<p class="ai-warn">${esc(w)}</p>`).join('')}</div>`;
  }

  /* ================= THE LIST ================= */
  function itemRow(i) {
    const done = i.status && i.status !== 'open';
    const m = (D.meetings || []).find(x => x.id === i.source_id);
    const from = i.source === 'meeting' ? (m ? `From the ${esc(m.title || 'call')}, ${esc(short(m.date))}` : 'From a call') : i.source === 'monday' ? 'Added on the Monday call' : i.source === 'today' ? 'From Today’s calls' : i.source === 'strategist' ? 'From the Strategist' : i.created_by ? `Added by ${esc(firstName(i.created_by))}` : '';
    const kind = i.kind === 'brief' ? (i.asana_url ? `<a class="ai-asana" href="${esc(i.asana_url)}" target="_blank" rel="noopener">Brief · Asana ↗</a>` : '<span class="ai-asana">Brief</span>') : i.kind === 'client_owes' ? '<span class="ai-asana" style="background:color-mix(in srgb,var(--warn) 14%,transparent)">Client owes</span>' : '';
    return `<div class="ai-li${window.ACT_OPEN === i.id ? ' hi' : ''}" data-id="${esc(i.id)}">
      <div class="ai-row${done ? ' done' : ''}"><button class="ai-tick" data-tick aria-label="${done ? 'Put it back' : 'Done'}" title="${done ? 'Put it back on the list' : 'Done'}">✓</button><span class="t" data-f="text">${esc(i.text)}</span>${kind}${done ? '' : `${ownerSel(i.owner || '')}${dueChip(i.due || '')}<button class="ai-x" data-drop title="Drop it: not done, just not happening" aria-label="Drop it">×</button>`}</div>
      ${from || done ? `<div class="ai-meta" style="padding-left:32px">${from}${done ? `${from ? ' · ' : ''}done${i.done_by ? ` by ${esc(firstName(i.done_by))}` : ''}${i.done_how === 'slack' ? ' in Slack' : ''}${i.done_at ? `, ${esc(short(i.done_at))}` : ''}` : ''}</div>` : ''}
    </div>`;
  }
  function readLine(b) {
    const r = b && b.report; if (!r) return '';
    const t = r.totals || {}, p = r.plan || {};
    const vs = (a, x, lower) => { const v = pct(a, x); if (v == null) return ''; const good = lower ? v <= 0 : v >= 0; return ` <span class="${Math.abs(v) < 3 ? '' : good ? 'up' : 'dn'}">${v > 0 ? '+' : ''}${v}% vs plan</span>`; };
    const plan = (b.thread || []).length ? `<details class="ai-plan"><summary>${esc(b.thread[0].by)}'s plan for this week</summary>${b.thread.map(x => `<div>${esc(x.text)}</div>`).join('')}</details>` : '<div class="ai-meta" style="padding:0 0 6px">No plan posted under the weekly report yet.</div>';
    return `<div class="ai-read"><span>Last week: revenue <b>${money(t.sales)}</b>${vs(t.sales, p.sales)}</span><span>spend <b>${money(t.spend)}</b></span><span>MER <b>${t.mer != null ? (+t.mer).toFixed(2) + 'x' : '–'}</b>${vs(t.mer, p.mer)}</span><span><button class="btn quiet" data-report="${esc(b.act_id)}" style="padding:2px 8px">Open the report</button></span></div>${plan}`;
  }
  function paintList() {
    const host = $('#aiList'); if (!host) return;
    const act = H.S.act || 'all';
    const items = D.items.filter(i => (act === 'all' || i.act_id === act) && (OWNER === 'all' || (i.owner || '') === OWNER));
    const ids = new Set(items.map(i => i.act_id));
    if (agendaOn() && MON) for (const b of MON.brands) if (act === 'all' || b.act_id === act) ids.add(b.act_id);
    const rank = { bad: 0, warn: 1, undefined: 2, good: 3 };
    const order = [...ids].sort((a, b) => (a ? 1 : 0) - (b ? 1 : 0) || (agendaOn() ? (rank[SEV[a]] ?? 2) - (rank[SEV[b]] ?? 2) : 0) || brandName(a).localeCompare(brandName(b)));
    const late = items.filter(i => i.due && i.due < today()).length;
    const owners = ['all', ...new Set([...D.team, ...D.items.map(i => i.owner).filter(Boolean)])];
    const me = firstName(H.S.meEmail || '');
    host.innerHTML = `<div class="ai-sec"><h2>Open</h2><small>${items.length} item${items.length === 1 ? '' : 's'}${late ? `, <span style="color:var(--bad)">${late} late</span>` : ''}</small><span class="sp"></span></div>
      <div class="ai-bar">${owners.map(o => `<button class="ai-pill${OWNER === o ? ' on' : ''}" data-owner="${esc(o)}">${o === 'all' ? 'Everyone' : o === me ? `${esc(o)} (you)` : esc(o)}</button>`).join('')}</div>
      <div class="ai-new" style="margin-top:10px"><input type="text" id="aiNewText" placeholder="Add an item: what has to happen" maxlength="300" aria-label="New item">${act === 'all' ? `<select class="ai-chip" id="aiNewAct" aria-label="Brand"><option value="">Agency-wide</option>${D.brands.map(b => `<option value="${esc(b.act_id)}">${esc(b.name)}</option>`).join('')}</select>` : ''}${ownerSel(OWNER !== 'all' ? OWNER : '', ' id="aiNewOwner"')}${dueChip(addDays(today(), 2))}<button class="btn primary" id="aiNewAdd">Add</button></div>
      ${order.length ? order.map(a => { const its = items.filter(i => i.act_id === a); const mb = agendaOn() && MON ? MON.brands.find(x => x.act_id === a) : null;
        return `<div class="ai-group" data-act="${esc(a)}"><div class="ai-gh">${agendaOn() && a ? `<span class="ai-dot ${SEV[a] || ''}"></span>` : ''}<h3>${esc(brandName(a))}</h3><small>${its.length ? `${its.length} open` : 'nothing open'}</small></div>${mb ? readLine(mb) : ''}${its.map(itemRow).join('')}</div>`; }).join('')
        : `<p class="ai-empty">Nothing open${act === 'all' ? '' : ' for this brand'}${OWNER === 'all' ? '' : ` for ${esc(OWNER)}`}.</p>`}`;
    wireList(host);
    if (window.ACT_OPEN) { const el = $(`.ai-li[data-id="${window.ACT_OPEN}"]`, host); if (el) { el.scrollIntoView({ block: 'center' }); setTimeout(() => el.classList.remove('hi'), 2500); } window.ACT_OPEN = null; }
  }
  function wireList(host) {
    $$('[data-owner]', host).forEach(b => b.onclick = () => { OWNER = b.dataset.owner; paintList(); });
    $$('[data-report]', host).forEach(b => b.onclick = () => { const s = document.getElementById('clientPick'); if (s && H.S.act !== b.dataset.report) { s.value = b.dataset.report; s.dispatchEvent(new Event('change')); } H.show('reports'); });
    for (const li of $$('.ai-li', host)) {
      const id = li.dataset.id, row = $('.ai-row', li);
      const save = async patch => { try { await post('/api/actions/edit', { id, ...patch }); const it = D.items.find(x => x.id === id); if (it) Object.assign(it, patch); } catch (e) { toast(e.message); } };
      $('[data-tick]', li).onclick = async () => {
        const done = !row.classList.contains('done'); row.classList.toggle('done', done);
        try { await post('/api/actions/done', { id, done }); setTimeout(async () => { await load(true); paintList(); paintDone(); }, done ? 700 : 0); } catch (e) { toast(e.message); row.classList.toggle('done', !done); }
      };
      wireText($('[data-f=text]', li), v => v ? save({ text: v }) : null);
      const o = $('[data-f=owner]', li); if (o) o.onchange = () => { o.classList.toggle('none', !o.value); save({ owner: o.value }); };
      const d = $('[data-f=due]', li); if (d) wireDue(d, v => save({ due: v }));
      const x = $('[data-drop]', li); if (x) x.onclick = async () => {
        if (window.confirmModal && !(await window.confirmModal('Drop this item?', 'It leaves the list without being marked done. Use it for things that are no longer happening.', 'Drop it'))) return;
        await save({ status: 'dropped' }); await load(true); paintList();
      };
    }
    const add = $('#aiNewAdd'), txt = $('#aiNewText'); if (!add) return;
    const nd = $('.ai-new [data-f=due]', host); wireDue(nd);
    const own = $('#aiNewOwner'); own.onchange = () => own.classList.toggle('none', !own.value);
    const doAdd = async () => {
      const text = txt.value.trim(); if (!text) { txt.focus(); return; }
      add.disabled = true;
      try { await post('/api/actions', { act: $('#aiNewAct') ? $('#aiNewAct').value : (H.S.act || ''), text, owner: own.value, due: $('input', nd).value, kind: 'team', source: 'manual' }); await load(true); paintList(); toast('Added.'); $('#aiNewText') && $('#aiNewText').focus(); }
      catch (e) { toast(e.message); add.disabled = false; }
    };
    add.onclick = doAdd; txt.onkeydown = e => { if (e.key === 'Enter') doAdd(); };
  }
  function paintDone() {
    const host = $('#aiDone'); if (!host) return;
    if (!DONE) { host.innerHTML = '<p class="ai-empty">Loading…</p>'; return; }
    const act = H.S.act || 'all';
    const list = DONE.filter(i => act === 'all' || i.act_id === act);
    host.innerHTML = list.length ? `<div class="ai-group">${list.map(i => `<div style="opacity:.85">${itemRow(i)}</div>`).join('')}</div>` : '<p class="ai-empty">Nothing done in the last 60 days.</p>';
    for (const li of $$('.ai-li', host)) $('[data-tick]', li).onclick = async () => { await post('/api/actions/done', { id: li.dataset.id, done: false }).catch(e => toast(e.message)); await load(true); DONE = (await H.apiAH('/api/actions?act=all&status=done')).items; paintList(); paintDone(); };
    const s = $('#aiDoneSum'); if (s) s.textContent = `Done in the last 60 days (${list.length})`;
  }

  /* ================= PAST CALLS ================= */
  const ST = { new: ['Reading', ''], extracted: ['To approve', 'warn'], confirmed: ['Approved', 'good'], skipped: ['Skipped', ''], error: ['Could not read', 'bad'] };
  function paintPast() {
    const host = $('#aiPast'); if (!host) return;
    const list = D.meetings.filter(m => m.status !== 'extracted');
    host.innerHTML = `<p class="ai-meta" style="padding:0 0 8px">${D.connected ? `Locus reads every Fireflies call within the hour. <button class="btn quiet" id="aiPoll" style="padding:2px 8px">Check Fireflies now</button>` : 'Fireflies is not connected (FIREFLIES_API_KEY on the worker).'}</p>
      ${list.length ? list.map(m => { const [l, c] = ST[m.status] || [m.status, '']; return `<details class="ai-call" data-mid="${esc(m.id)}"><summary><span style="flex:1;min-width:0">${esc(m.title || 'Untitled call')} <small>${esc(md(m.date))}${m.duration ? ` · ${Math.round(m.duration)} min` : ''}</small></span><span class="ai-st ${c}">${esc(l)}</span></summary><div class="body">Loading…</div></details>`; }).join('') : '<p class="ai-empty">No other calls in the last 60 days.</p>'}`;
    const poll = $('#aiPoll'); if (poll) poll.onclick = async () => { poll.disabled = true; poll.textContent = 'Checking…'; try { const r = await post('/api/meetings/poll', {}); await load(); paint(); toast(r.read && r.read.length ? `Read ${r.read.length} new call${r.read.length === 1 ? '' : 's'}.` : r.errors && r.errors.length ? `Fireflies: ${r.errors[0].error}` : 'Nothing new on Fireflies.'); } catch (e) { toast(e.message); poll.disabled = false; poll.textContent = 'Check Fireflies now'; } };
    for (const det of $$('details.ai-call', host)) det.ontoggle = async () => {
      if (!det.open || det.dataset.loaded) return; det.dataset.loaded = '1';
      const body = $('.body', det);
      const m = await H.apiAH(`/api/meetings?id=${encodeURIComponent(det.dataset.mid)}`).catch(e => ({ error: e.message }));
      if (m.error && !m.status) { body.textContent = m.error; return; }
      const r = m.result, again = m.status === 'skipped' || m.status === 'error';
      body.innerHTML = `${m.error ? `<p class="ai-warn">${esc(m.error)}</p>` : ''}${m.notes && m.notes.summary ? `<p style="margin:0 0 8px">${esc(m.notes.summary)}</p>` : ''}${r ? doneHtml(m.id, r, m.title, firstName(m.confirmed_by)) : ''}${again ? `<button class="btn" data-again>Read it again</button>` : ''}`;
      const a = $('[data-again]', body); if (a) a.onclick = async () => { a.disabled = true; a.textContent = 'Reading…'; try { await post('/api/meetings/ingest', { id: m.id }); await load(); paint(); } catch (e) { toast(e.message); a.disabled = false; a.textContent = 'Read it again'; } };
    };
  }

  /* ================= the page ================= */
  /* The Monday read shows by itself on Monday, and from Friday as next Monday's prep. */
  const agendaOn = () => { if (AGENDA !== null) return AGENDA; const d = dt(today()).getUTCDay(); return d === 1 || d === 5 || d === 6 || d === 0; };
  async function load(listOnly) {
    const [acts, meet] = await Promise.all([H.apiAH('/api/actions?act=all&status=open'), listOnly ? Promise.resolve(null) : H.apiAH('/api/meetings?open=0')]);
    if (meet) {
      const pend = meet.meetings.filter(m => m.status === 'extracted').slice(0, 8);
      const full = await Promise.all(pend.map(m => H.apiAH(`/api/meetings?id=${encodeURIComponent(m.id)}`).catch(() => null)));
      D = { ...(D || {}), meetings: meet.meetings, pending: full.filter(m => m && m.notes), today: meet.today, connected: meet.connected, webhook: meet.webhook };
    }
    D = { ...D, items: acts.items, team: acts.team, brands: acts.brands, remind: acts.remind };
    if (DONE) DONE = (await H.apiAH('/api/actions?act=all&status=done').catch(() => ({ items: DONE }))).items;
  }
  async function loadMonday() {
    try {
      const [m, cmd] = await Promise.all([H.apiAH('/api/meetings/monday'), H.api('/api/hub/command').catch(() => null)]);
      MON = m; SEV = {};
      if (cmd && Array.isArray(cmd.brands)) for (const b of cmd.brands) SEV[b.act_id] = b.paused ? undefined : (b.reasons || []).reduce((w, r) => r.sev === 'bad' ? 'bad' : (w === 'bad' ? w : r.sev === 'warn' ? 'warn' : w), 'good');
    } catch { MON = null; }
  }
  function paint() {
    const act = H.S.act || 'all';
    const pend = D.pending.filter(m => act === 'all' || m.notes.brands.some(b => b.brand_id === act));
    const head = H.pageHead('actions', 'Action items', 'What the team owes, and the calls waiting for your OK. Approve a call once: the tasks, briefs, report lines and asks go where they belong.');
    $('#main').innerHTML = `<div class="v2 ai">${head}
      ${pend.length ? `<div class="ai-sec"><h2>To approve</h2><small>${pend.length} call${pend.length === 1 ? '' : 's'} Locus read. Skim it, change anything by clicking it, then approve.</small></div>${pend.map(cardHtml).join('')}` : ''}
      ${agendaOn() && MON ? `<div class="ai-card" style="padding:16px 20px"><div class="ai-ch" style="margin:0 0 8px"><div><h3>Monday ${esc(short(MON.monday))}</h3><small>The one thing every brand does this week. The call notes pick it up. Each brand's numbers and plan are with its items below, red brands first.</small></div><span class="sp"></span><button class="btn quiet" id="aiHideMon">Hide</button></div>
        <div class="ai-theme"><textarea id="aiTheme" placeholder="This week, every brand: ...">${esc(MON.theme || '')}</textarea><button class="btn" id="aiThemeSave">Save</button></div></div>` : ''}
      <div id="aiList"></div>
      ${agendaOn() ? '' : '<p class="ai-meta" style="padding:6px 0 0">Monday adds each brand\'s numbers and plan here. <button class="btn quiet" id="aiShowMon" style="padding:2px 8px">Show them now</button></p>'}
      <details class="ai-fold" id="aiDoneFold"><summary id="aiDoneSum">Done in the last 60 days</summary><div id="aiDone"></div></details>
      <details class="ai-fold" id="aiPastFold"><summary>Past calls (${D.meetings.filter(m => m.status !== 'extracted').length})</summary><div id="aiPast"></div></details>
    </div>`;
    $$('.ai-card[data-mid]').forEach(wireCard);
    paintList(); paintPast();
    const df = $('#aiDoneFold'); df.ontoggle = async () => { if (df.open && !DONE) { paintDone(); DONE = (await H.apiAH('/api/actions?act=all&status=done').catch(() => ({ items: [] }))).items; } paintDone(); };
    const sm = $('#aiShowMon'); if (sm) sm.onclick = async () => { AGENDA = true; sm.disabled = true; if (!MON) await loadMonday(); paint(); };
    const hm = $('#aiHideMon'); if (hm) hm.onclick = () => { AGENDA = false; paint(); };
    const ts = $('#aiThemeSave'); if (ts) ts.onclick = async () => { ts.disabled = true; try { await post('/api/meetings/theme', { text: $('#aiTheme').value }); toast('Saved for this week.'); } catch (e) { toast(e.message); } ts.disabled = false; };
    /* ?meeting=<id>: ring the card, or open it under Past calls. */
    const want = window.ACT_MEETING || new URLSearchParams(location.search).get('meeting'); window.ACT_MEETING = null;
    if (want) {
      const c = $(`.ai-card[data-mid="${CSS.escape(want)}"]`);
      if (c) { c.classList.add('ring'); c.scrollIntoView({ block: 'start' }); }
      else { const pf = $('#aiPastFold'), d = $(`details.ai-call[data-mid="${CSS.escape(want)}"]`); if (pf && d) { pf.open = true; d.open = true; d.scrollIntoView({ block: 'center' }); } }
      try { const u = new URL(location.href); u.searchParams.delete('meeting'); history.replaceState(null, '', u); } catch {}
    }
  }
  async function render(host, first) {
    H = host; css();
    const t = H.RUN();
    const head = H.pageHead('actions', 'Action items', 'What the team owes, and the calls waiting for your OK.');
    if (first || !D) $('#main').innerHTML = `<div class="v2 ai">${head}<div class="ai-card"><p class="ai-empty">Loading…</p></div></div>`;
    try {
      const qs = new URLSearchParams(location.search); if (qs.get('item')) window.ACT_OPEN = qs.get('item');
      await load();
      if (agendaOn()) await loadMonday();
    } catch (e) { if (t === H.RUN()) $('#main').innerHTML = `<div class="v2 ai">${head}<div class="ai-card"><p style="color:var(--bad)">${esc(e.message)}</p></div></div>`; return; }
    if (t !== H.RUN()) return;
    paint();
  }
  window.ActionsTab = { render };
})();

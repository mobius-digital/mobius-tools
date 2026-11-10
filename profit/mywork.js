/* MY WORK (2026-11-10). One person's day in one place, asked for by the strategists on the Nov 9 team call (Noma: "a
 * personal to do list", "a little digital office where it's brainstorming", "I can archive and store"; Ahsan: "what's my
 * task list?... It sends me every morning."). Built to the approved preview (real data, Nov 10).
 *
 *   Who:        a person switcher. Cole sees everyone; a teammate sees themself (the server decides, account-health mywork.js).
 *   Today:      ONE merged list: Slack asks and @mentions, Production cards they own due today or tomorrow, their Locus
 *               Tasks due today or with no date. The Add box makes a Locus Task for them, due today.
 *   Late:       past due (cards not yet approved, tasks).
 *   This week:  the rest, grouped by brand, with their Monday plan lines (voted Yes or Changes on the Monday call).
 *   5am DM:     the Slack DM they get at 5am on weekdays, as it would read now.
 *   Brainstorm: a pad that saves as you type (p_mywork_note); "Save to ideas" moves it into Saved.
 *   Saved:      ideas and ads they pin (p_mywork_saved), only theirs.
 * Ticking a row uses the source's own done: a task is done on the task (/api/actions/done); a Slack ask, a card or a plan
 * line is ticked off this list only (/api/mywork/done), the card stays on the board.
 * Classic script, own closure; window.MyWorkTab = { render }. Team only (AGENCY_TABS). Tokens only, both themes, no em dashes,
 * no prompt()/alert(): in-page forms and toasts.
 */
(() => {
  let H = null, D = null, WHO = '', OPEN = null, SHOW_DONE = {}, BRAND = 'All', TAB = 'ideas', NOTE_T = null, ADDING_AD = false;
  const $ = (s, r = document) => r.querySelector(s);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const dt = iso => new Date(String(iso).slice(0, 10) + 'T12:00:00Z');
  const md = iso => iso ? dt(iso).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' }) : '';
  const days = iso => iso && D ? Math.round((dt(iso) - dt(D.today)) / 864e5) : null;
  const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
  const cap = s => s ? s[0].toUpperCase() + s.slice(1) : '';
  const toast = msg => { const t = document.createElement('div'); t.setAttribute('role', 'status'); t.className = 'mw-toast'; t.textContent = msg; document.body.appendChild(t); setTimeout(() => t.remove(), 4000); };
  const put = (path, body) => H.apiAH(path, { method: 'PUT', body: JSON.stringify({ who: WHO, ...body }) });
  const CHECK = '<svg viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2.5 6.2l2.2 2.2 4.8-4.9"/></svg>';

  function css() {
    if (document.getElementById('mwcss')) return;
    const st = document.createElement('style'); st.id = 'mwcss';
    st.textContent = `
      .mw{max-width:1180px;margin:0 auto;min-width:0;font-size:14px;color:var(--ink)}
      .mw *{box-sizing:border-box}
      .mw .mw-top{display:flex;align-items:flex-end;justify-content:space-between;gap:16px;flex-wrap:wrap;margin-bottom:16px}
      .mw .mw-sub{color:var(--muted);font-size:13.5px}
      .mw .mw-seg{display:inline-flex;flex-wrap:wrap;background:var(--surface);border:1px solid var(--line);border-radius:var(--r-lg);padding:3px;gap:3px}
      .mw .mw-seg button{all:unset;cursor:pointer;display:flex;align-items:center;gap:7px;padding:6px 12px 6px 6px;border-radius:var(--r-md);font-weight:600;font-size:13.5px;color:var(--ink-2)}
      .mw .mw-seg button:hover{background:var(--surface-2)}
      .mw .mw-seg button[aria-pressed=true]{background:var(--ink);color:var(--surface)}
      .mw .mw-av{width:22px;height:22px;border-radius:50%;display:grid;place-items:center;font-size:11px;font-weight:700;background:var(--brand-soft);color:var(--brand-ink);flex:none}
      .mw .mw-seg button[aria-pressed=true] .mw-av{background:var(--brand);color:var(--on-brand,#fff)}
      .mw .mw-stats{display:flex;gap:10px;flex-wrap:wrap;margin-bottom:14px}
      .mw .mw-stat{background:var(--surface);border:1px solid var(--line);border-radius:var(--r-lg);padding:9px 14px;min-width:104px}
      .mw .mw-stat b{display:block;font-size:20px;font-weight:700;letter-spacing:-.01em;font-variant-numeric:tabular-nums}
      .mw .mw-stat span{font-size:12px;color:var(--muted)}
      .mw .mw-stat.bad b{color:var(--bad)}
      .mw .mw-chips{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:14px}
      .mw .mw-chip{all:unset;cursor:pointer;font-size:13px;font-weight:500;padding:4px 11px;border-radius:var(--r-pill);border:1px solid var(--line);background:var(--surface);color:var(--ink-2)}
      .mw .mw-chip:hover{border-color:var(--line-strong)}
      .mw .mw-chip[aria-pressed=true]{background:var(--ink);border-color:var(--ink);color:var(--surface)}
      .mw .mw-chip .c{opacity:.6;margin-left:4px}
      .mw .mw-grid{display:grid;grid-template-columns:minmax(0,1fr) 360px;gap:16px;align-items:start}
      .mw .mw-col{display:flex;flex-direction:column;gap:16px;min-width:0}
      .mw .cs-sec{background:var(--surface);border:1px solid var(--line);border-radius:var(--r-lg);padding:14px 8px 10px;display:flex;flex-direction:column;gap:8px;min-width:0}
      .mw .cs-sec header{display:flex;align-items:baseline;justify-content:space-between;gap:10px;padding:0 10px}
      .mw .cs-sec header h3{font-size:15px;font-weight:600;margin:0;color:var(--ink);letter-spacing:-.005em}
      .mw .cs-sec header h3 .n{color:var(--muted);font-weight:500;margin-left:6px}
      .mw .cs-sec header .cap{margin:0;font-size:12.5px;color:var(--muted)}
      .mw .mw-list{list-style:none;margin:0;padding:0}
      .mw .mw-it{display:grid;grid-template-columns:26px minmax(0,1fr) auto;gap:3px 10px;align-items:start;padding:9px 10px;border-radius:var(--r-md);cursor:pointer}
      .mw .mw-it:hover{background:var(--surface-2)}
      .mw .mw-it+.mw-it{border-top:1px solid var(--line)}
      .mw .mw-tick{all:unset;cursor:pointer;width:18px;height:18px;border-radius:50%;border:1.5px solid var(--line-strong);margin-top:1px;display:grid;place-items:center;color:transparent}
      .mw .mw-tick:hover{border-color:var(--brand-ink)}
      .mw .mw-tick:focus-visible,.mw .mw-chip:focus-visible,.mw .mw-seg button:focus-visible,.mw .mw-btn:focus-visible,.mw .mw-it:focus-visible{outline:2px solid var(--brand);outline-offset:2px}
      .mw .mw-tick svg{width:11px;height:11px}
      .mw .mw-it.done .mw-tick{background:var(--good);border-color:var(--good);color:#fff}
      .mw .mw-it.done .mw-t{text-decoration:line-through;color:var(--muted)}
      .mw .mw-t{font-weight:500;color:var(--ink);overflow-wrap:anywhere}
      .mw .mw-meta{grid-column:2;display:flex;gap:6px;flex-wrap:wrap;align-items:center;font-size:12px;color:var(--muted)}
      .mw .mw-src{display:inline-flex;align-items:center;gap:5px;font-weight:600;color:var(--ink-2)}
      .mw .mw-src i{width:7px;height:7px;border-radius:50%;display:inline-block}
      .mw .s-slack i{background:var(--c-tiktok)}.mw .s-card i{background:var(--brand)}.mw .s-call i{background:var(--warn)}.mw .s-task i{background:var(--good)}
      .mw .mw-brand{padding:1px 8px;border-radius:var(--r-pill);background:var(--surface-2);color:var(--ink-2);font-weight:500}
      .mw .mw-due{grid-column:3;grid-row:1;font-size:12px;font-weight:600;white-space:nowrap;padding:2px 8px;border-radius:var(--r-pill);color:var(--ink-2);background:var(--surface-2)}
      .mw .mw-due.today{background:var(--brand-soft);color:var(--brand-ink)}
      .mw .mw-due.late{background:var(--bad-bg);color:var(--bad)}
      .mw .mw-due.chg{background:var(--warn-bg);color:var(--warn)}
      .mw .mw-det{grid-column:2/4;display:none;font-size:13px;color:var(--ink-2);padding-top:4px;white-space:pre-wrap;overflow-wrap:anywhere}
      .mw .mw-it.open .mw-det{display:block}
      .mw .mw-det .row{display:flex;gap:14px;margin-top:8px;flex-wrap:wrap;white-space:normal}
      .mw .mw-det a,.mw .mw-link{color:var(--brand-ink);font-weight:600;text-decoration:none;cursor:pointer;background:none;border:0;padding:0;font:inherit;font-size:13px}
      .mw .mw-det a:hover,.mw .mw-link:hover{text-decoration:underline}
      .mw .mw-add{display:flex;gap:8px;padding:0 10px 4px}
      .mw input[type=text],.mw textarea{font:inherit;font-size:14px;color:var(--ink);background:var(--surface-2);border:1px solid var(--line);border-radius:var(--r-md);min-width:0}
      .mw input[type=text]{flex:1;padding:8px 11px}
      .mw input[type=text]:focus,.mw textarea:focus{outline:none;border-color:var(--brand);background:var(--surface)}
      .mw .mw-btn{all:unset;cursor:pointer;font-weight:600;font-size:13px;padding:7px 13px;border-radius:var(--r-md);background:var(--ink);color:var(--surface);white-space:nowrap}
      .mw .mw-btn.ghost{background:transparent;color:var(--ink-2);border:1px solid var(--line)}
      .mw .mw-btn[disabled]{opacity:.4;pointer-events:none}
      .mw .mw-empty{padding:2px 10px 8px;color:var(--muted);font-size:13px;margin:0}
      .mw .mw-grp{font-size:11px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--muted);padding:10px 10px 2px}
      .mw .mw-donebar{all:unset;cursor:pointer;display:block;padding:6px 10px 4px;font-size:12px;font-weight:600;color:var(--muted)}
      .mw .mw-quiet{padding:4px 10px 4px;font-size:12px;color:var(--muted);margin:0}
      .mw .mw-dm{margin:0 10px 4px;border:1px solid var(--line);border-radius:var(--r-md);padding:11px 13px;background:var(--surface-2);font-size:13.5px;line-height:1.5}
      .mw .mw-dm .h{display:flex;gap:8px;align-items:center;margin-bottom:4px;font-size:12px;color:var(--muted)}
      .mw .mw-dm .h b{color:var(--ink);font-size:13.5px}
      .mw .mw-dm p{margin:2px 0}
      .mw .mw-dm a{color:var(--brand-ink);font-weight:600}
      .mw .mw-off{margin:0 10px;font-size:12px;color:var(--muted)}
      .mw .mw-bs{padding:0 10px 4px}
      .mw .mw-bs textarea{width:100%;min-height:150px;resize:vertical;line-height:1.55;padding:11px}
      .mw .mw-bs .row{display:flex;justify-content:space-between;align-items:center;margin-top:8px;gap:8px}
      .mw .mw-bs .st{font-size:12px;color:var(--muted)}
      .mw .mw-tabs{display:flex;gap:6px;padding:0 10px}
      .mw .mw-notes{list-style:none;margin:0;padding:0 10px}
      .mw .mw-notes li{padding:9px 0;border-top:1px solid var(--line);font-size:13px;display:flex;gap:10px;justify-content:space-between;overflow-wrap:anywhere}
      .mw .mw-notes li:first-child{border-top:0}
      .mw .mw-notes small{display:block;color:var(--muted);font-size:12px;margin-top:2px}
      .mw .mw-x{all:unset;cursor:pointer;color:var(--muted);font-size:16px;line-height:1;padding:0 4px;height:18px}
      .mw .mw-x:hover{color:var(--bad)}
      .mw .mw-adform{display:flex;flex-direction:column;gap:6px;padding:0 10px 6px}
      .mw .mw-foot{margin-top:20px;font-size:12px;color:var(--muted)}
      .mw-toast{position:fixed;left:50%;bottom:24px;transform:translateX(-50%);max-width:min(92vw,520px);background:var(--ink);color:var(--surface);padding:10px 16px;border-radius:var(--r-md);font-size:13.5px;z-index:9999;box-shadow:var(--sh-pop)}
      @media (max-width:980px){.mw .mw-grid{grid-template-columns:minmax(0,1fr)}}
      @media (max-width:600px){
        .mw .mw-seg{width:100%}.mw .mw-seg button{flex:1;justify-content:center}
        .mw .mw-stat{flex:1;min-width:0;padding:8px 10px}.mw .mw-stat b{font-size:17px}
        .mw .mw-chips{flex-wrap:nowrap;overflow-x:auto;scrollbar-width:none}.mw .mw-chip{flex:none}
        .mw .mw-it{grid-template-columns:24px minmax(0,1fr)}
        .mw .mw-due{grid-column:2;grid-row:3;justify-self:start;margin-top:2px}
        .mw .mw-det{grid-column:2;grid-row:4}
      }`;
    document.head.appendChild(st);
  }

  /* ---------- rows ---------- */
  function dueTag(it) {
    if (it.changes) return { cls: 'chg', txt: 'Changes' };
    const n = days(it.due);
    if (n == null) return it.bucket === 'today' ? { cls: 'today', txt: 'Today' } : { cls: '', txt: it.source === 'call' ? 'This week' : 'No date' };
    if (n < 0) return { cls: 'late', txt: `${plural(-n, 'day')} late` };
    if (n === 0) return { cls: 'today', txt: 'Due today' };
    if (n === 1) return { cls: 'today', txt: 'Tomorrow' };
    return { cls: '', txt: md(it.due) };
  }
  function srcLine(it) {
    if (it.source === 'card') return `<span class="mw-src s-card"><i></i>Card ${esc(it.num)}</span><span>${esc(cap(it.column))}</span>`;
    if (it.source === 'slack') return `<span class="mw-src s-slack"><i></i>Slack</span><span>${esc([it.where, it.from, it.when].filter(Boolean).join(' · '))}</span>`;
    if (it.source === 'call') return `<span class="mw-src s-call"><i></i>Monday call</span><span>${esc(it.from || '')}</span>`;
    return `<span class="mw-src s-task"><i></i>Task</span><span>${esc([it.from, it.when].filter(Boolean).join(' · '))}</span>`;
  }
  const OPEN_LABEL = { slack: 'Open in Slack', card: 'Open the card', task: 'Open the task', call: 'Open the Monday call' };
  function row(it) {
    const t = dueTag(it), open = OPEN === it.id;
    const tip = it.source === 'task' ? 'Done (ticks the task)' : it.source === 'card' ? 'Off my list (the card stays on the board)' : 'Off my list';
    return `<li class="mw-it${it.done ? ' done' : ''}${open ? ' open' : ''}" data-id="${esc(it.id)}" tabindex="0">
      <button type="button" class="mw-tick" data-tick="${esc(it.id)}" title="${esc(it.done ? 'Back on my list' : tip)}" aria-label="${esc(it.done ? 'Back on my list' : tip)}" aria-pressed="${!!it.done}">${CHECK}</button>
      <div class="mw-t">${esc(it.text)}</div>
      <span class="mw-due ${t.cls}">${esc(t.txt)}</span>
      <div class="mw-meta">${srcLine(it)}<span class="mw-brand">${esc(it.brand)}</span></div>
      <div class="mw-det">${esc(it.detail || '')}<div class="row"><button type="button" class="mw-link" data-openit="${esc(it.id)}">${OPEN_LABEL[it.source]}</button></div></div>
    </li>`;
  }
  function listBlock(key, items, emptyTxt) {
    const open = items.filter(i => !i.done), done = items.filter(i => i.done);
    if (!items.length) return emptyTxt ? `<p class="mw-empty">${emptyTxt}</p>` : '';
    let h = open.length ? `<ul class="mw-list">${open.map(row).join('')}</ul>` : '<p class="mw-empty">All done here.</p>';
    if (done.length) h += SHOW_DONE[key] ? `<ul class="mw-list">${done.map(row).join('')}</ul><button type="button" class="mw-donebar" data-done="${key}">Hide done</button>` : `<button type="button" class="mw-donebar" data-done="${key}">Show ${done.length} done</button>`;
    return h;
  }
  const sec = (title, n, cap, body) => `<section class="cs-sec"><header><h3>${title}${n == null ? '' : `<span class="n">${n}</span>`}</h3>${cap ? `<p class="cap">${cap}</p>` : ''}</header>${body}</section>`;

  /* The DM as Slack shows it: *bold*, _italic_, <url|label>, bullets. The server already escaped &, < and > in the words. */
  function slackHtml(t) {
    const links = [];
    let h = String(t || '').replace(/<@U[A-Z0-9]+>/g, `@${D.person.name}`).replace(/<(https:[^|>]+)\|([^>]+)>/g, (m, u, l) => { links.push([u, l]); return `\u0001${links.length - 1}\u0002`; });
    h = h.replace(/"/g, '&quot;').replace(/\*([^*\n]+)\*/g, '<b>$1</b>').replace(/(^|\s)_([^_\n]+)_/g, '$1<i>$2</i>');
    h = h.replace(/\u0001(\d+)\u0002/g, (m, i) => `<a href="${esc(links[+i][0])}">${links[+i][1]}</a>`);
    return h.split('\n').map(l => `<p>${l}</p>`).join('');
  }

  function paint() {
    const items = D.items || [];
    const brandOk = it => BRAND === 'All' || it.brand === BRAND;
    const brands = ['All'].concat([...new Set(items.map(i => i.brand))].sort());
    if (!brands.includes(BRAND)) BRAND = 'All';
    const f = items.filter(brandOk);
    const late = f.filter(i => i.bucket === 'late'), today = f.filter(i => i.bucket === 'today'), week = f.filter(i => i.bucket === 'week');
    const n = arr => arr.filter(i => !i.done).length;
    const cnt = b => items.filter(i => (b === 'All' || i.brand === b) && !i.done).length;
    const groups = {}; for (const w of week) (groups[w.brand] = groups[w.brand] || []).push(w);
    const p = D.person;
    const seg = D.owner && D.people.length > 1 ? `<div class="mw-seg" role="group" aria-label="Whose work">${D.people.map(x => `<button type="button" data-who="${esc(x.name)}" aria-pressed="${x.name === p.name}"><span class="mw-av">${esc(x.name[0])}</span>${esc(x.name)}</button>`).join('')}</div>` : '';
    const saved = D.saved || [], ideas = saved.filter(s => s.kind === 'idea'), ads = saved.filter(s => s.kind === 'ad');
    const savedBody = TAB === 'ads'
      ? `${ADDING_AD ? `<form class="mw-adform" id="mwAdForm"><input type="text" id="mwAdName" placeholder="The ad (name or number)" maxlength="200" aria-label="The ad"><input type="text" id="mwAdLink" placeholder="Link (optional), https://..." maxlength="500" aria-label="Link"><input type="text" id="mwAdWhy" placeholder="Why it is worth coming back to" maxlength="300" aria-label="Why"><div style="display:flex;gap:8px"><button class="mw-btn" type="submit">Save</button><button class="mw-btn ghost" type="button" data-adcancel>Cancel</button></div></form>` : `<div style="padding:0 10px"><button type="button" class="mw-link" data-addad>+ Save an ad</button></div>`}
         ${ads.length ? `<ul class="mw-notes">${ads.map(s => `<li><div>${s.link ? `<a class="mw-link" href="${esc(s.link)}" target="_blank" rel="noopener">${esc(s.text)}</a>` : `<b>${esc(s.text)}</b>`}${s.note ? `<small>${esc(s.note)}</small>` : ''}<small>${esc(md(String(s.created_at).slice(0, 10)))}</small></div><button type="button" class="mw-x" data-rm="${esc(s.id)}" aria-label="Remove">×</button></li>`).join('')}</ul>` : '<p class="mw-empty">No ads saved yet.</p>'}`
      : ideas.length ? `<ul class="mw-notes">${ideas.map(s => `<li><div>${esc(s.text)}<small>${esc(md(String(s.created_at).slice(0, 10)))}</small></div><button type="button" class="mw-x" data-rm="${esc(s.id)}" aria-label="Remove">×</button></li>`).join('')}</ul>` : '<p class="mw-empty">Write in Brainstorm, then Save to ideas.</p>';
    const note = (D.note && D.note.text) || '';

    $('#main').innerHTML = `${H.pageHead('mywork', 'My work')}
    <div class="mw">
      <div class="mw-top">
        <div class="mw-sub">${esc(md(D.today))} · ${esc(p.name)}${p.role ? `, ${esc(p.role.toLowerCase())}` : ''}${D.brands && D.brands.length ? ` for ${D.brands.map(esc).join(', ')}` : ''}</div>
        ${seg}
      </div>
      <div class="mw-stats">
        <div class="mw-stat"><b>${D.counts.today}</b><span>For today</span></div>
        <div class="mw-stat${D.counts.late ? ' bad' : ''}"><b>${D.counts.late}</b><span>Late</span></div>
        <div class="mw-stat"><b>${D.counts.week}</b><span>This week</span></div>
        <div class="mw-stat"><b>${D.counts.slack}</b><span>From Slack</span></div>
      </div>
      ${brands.length > 2 ? `<div class="mw-chips" role="group" aria-label="Brand">${brands.map(b => `<button type="button" class="mw-chip" data-brand="${esc(b)}" aria-pressed="${BRAND === b}">${esc(b)}<span class="c">${cnt(b)}</span></button>`).join('')}</div>` : ''}
      <div class="mw-grid">
        <div class="mw-col">
          ${sec('Today', n(today), 'Slack asks, tasks and cards due, in one list', `<form class="mw-add" id="mwAdd"><input type="text" id="mwAddIn" placeholder="Add something for today" aria-label="Add a task for today" maxlength="200"><button class="mw-btn" type="submit">Add</button></form>${listBlock('today', today, 'Nothing for today.')}`)}
          ${sec('Late', n(late), 'Past the due date', listBlock('late', late, 'Nothing late.'))}
          ${sec('This week', n(week), 'Monday\'s plan, open cards and tasks with a date', (week.length ? Object.entries(groups).map(([b, arr]) => `<div class="mw-grp">${esc(b)}</div>${listBlock('w:' + b, arr, '')}`).join('') : '<p class="mw-empty">Nothing else this week.</p>') + (BRAND === 'All' && (D.quiet || []).length ? `<p class="mw-quiet">Nothing open on ${D.quiet.map(esc).join(' or ')} from the call, Slack, cards or tasks.</p>` : ''))}
        </div>
        <div class="mw-col">
          ${sec('5am DM', null, D.dm.on ? 'Lands in Slack at 5am, weekdays' : 'Not switched on for ' + esc(p.name), D.dm.text ? `<div class="mw-dm"><div class="h"><b>Locus</b><span>5:00 AM</span></div>${slackHtml(D.dm.text)}</div>` : '<p class="mw-empty">Nothing open, so no DM.</p>')}
          ${sec('Brainstorm', null, 'Only you see this', `<div class="mw-bs"><textarea id="mwNote" placeholder="Angles, hooks, half ideas. It saves as you type." aria-label="Brainstorm">${esc(note)}</textarea><div class="row"><span class="st" id="mwNoteSt">${note ? 'Saved' : ''}</span><button type="button" class="mw-btn ghost" id="mwKeep" ${note.trim() ? '' : 'disabled'}>Save to ideas</button></div></div>`)}
          ${sec('Saved', null, 'Ideas and ads to come back to', `<div class="mw-tabs" role="group" aria-label="Saved">${[['ideas', 'Ideas', ideas.length], ['ads', 'Ads', ads.length]].map(([k, l, c]) => `<button type="button" class="mw-chip" data-tab="${k}" aria-pressed="${TAB === k}">${l}<span class="c">${c}</span></button>`).join('')}</div>${savedBody}`)}
        </div>
      </div>
      <p class="mw-foot">From Locus Tasks, the Production board, Slack (brand internal channels, last 7 days, where you were tagged) and the latest Monday call plan.</p>
    </div>`;
    wire();
  }

  /* ---------- actions ---------- */
  async function load(fresh) {
    D = await H.apiAH(`/api/mywork${WHO ? `?who=${encodeURIComponent(WHO)}` : ''}`, fresh ? { fresh: true } : {});
    WHO = D.person.name;
  }
  function recount() {
    const open = D.items.filter(i => !i.done);
    D.counts = { today: open.filter(i => i.bucket === 'today').length, late: open.filter(i => i.bucket === 'late').length, week: open.filter(i => i.bucket === 'week').length, slack: open.filter(i => i.source === 'slack').length };
  }
  async function tick(id) {
    const it = D.items.find(i => i.id === id); if (!it) return;
    const to = !it.done; it.done = to; recount(); paint();
    try {
      if (it.source === 'task') await H.apiAH('/api/actions/done', { method: 'POST', body: JSON.stringify({ id: it.ref, done: to }) });
      else await put('/api/mywork/done', { key: it.id, done: to });
    } catch (e) { it.done = !to; recount(); paint(); toast(e.message || 'That did not save.'); }
  }
  function go(it) {
    if (it.source === 'slack') { window.open(it.link, '_blank', 'noopener'); return; }
    if (it.source === 'card') { window.PD_CARD = it.ref; H.show('production'); return; }
    if (it.source === 'task') { window.ACT_OPEN = it.ref; H.show('tasks'); return; }
    location.href = it.link;
  }
  function wire() {
    const root = $('#main .mw'); if (!root) return;
    root.onclick = async e => {
      const t = e.target.closest('[data-tick],[data-who],[data-brand],[data-tab],[data-done],[data-openit],[data-rm],[data-addad],[data-adcancel],#mwKeep,.mw-it');
      if (!t || e.target.closest('a[href]')) return;
      if (t.dataset.tick) { e.stopPropagation(); return tick(t.dataset.tick); }
      if (t.dataset.who) { if (t.dataset.who === WHO) return; WHO = t.dataset.who; BRAND = 'All'; OPEN = null; SHOW_DONE = {}; ADDING_AD = false; return render(H, true); }
      if (t.dataset.brand) { BRAND = t.dataset.brand; return paint(); }
      if (t.dataset.tab) { TAB = t.dataset.tab; return paint(); }
      if (t.dataset.done) { SHOW_DONE[t.dataset.done] = !SHOW_DONE[t.dataset.done]; return paint(); }
      if (t.dataset.openit) { const it = D.items.find(i => i.id === t.dataset.openit); if (it) go(it); return; }
      if (t.hasAttribute('data-addad')) { ADDING_AD = true; paint(); const a = $('#mwAdName'); if (a) a.focus(); return; }
      if (t.hasAttribute('data-adcancel')) { ADDING_AD = false; return paint(); }
      if (t.dataset.rm) { try { D.saved = (await put('/api/mywork/saved', { id: t.dataset.rm, remove: true })).saved; paint(); } catch (err) { toast(err.message); } return; }
      if (t.id === 'mwKeep') {
        const ta = $('#mwNote'), v = ta.value.trim(); if (!v) return;
        t.disabled = true; clearTimeout(NOTE_T);
        try { D.saved = (await put('/api/mywork/saved', { kind: 'idea', text: v })).saved; await put('/api/mywork/note', { text: '' }); D.note = { text: '' }; TAB = 'ideas'; paint(); toast('Saved to ideas.'); }
        catch (err) { t.disabled = false; toast(err.message); }
        return;
      }
      if (t.classList.contains('mw-it')) { OPEN = OPEN === t.dataset.id ? null : t.dataset.id; paint(); }
    };
    root.onkeydown = e => { const it = e.target.closest && e.target.closest('.mw-it'); if (it && e.target === it && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); it.click(); } };
    root.oninput = e => {
      if (e.target.id !== 'mwNote') return;
      const st = $('#mwNoteSt'), kp = $('#mwKeep'), v = e.target.value;
      st.textContent = 'Saving...'; kp.disabled = !v.trim(); D.note = { text: v };
      clearTimeout(NOTE_T);
      NOTE_T = setTimeout(async () => { try { await put('/api/mywork/note', { text: v }); st.textContent = 'Saved'; } catch (err) { st.textContent = 'Not saved: ' + err.message; } }, 600);
    };
    root.onsubmit = async e => {
      e.preventDefault();
      if (e.target.id === 'mwAdd') {
        const inp = $('#mwAddIn'), v = inp.value.trim(); if (!v) return;
        const act = BRAND === 'All' ? '' : ((D.items.find(i => i.brand === BRAND) || {}).act_id || '');
        inp.disabled = true;
        try { await H.apiAH('/api/actions', { method: 'POST', body: JSON.stringify({ text: v, owner: WHO, due: D.today, act, kind: 'team', source: 'manual' }) }); await load(true); paint(); const n = $('#mwAddIn'); if (n) n.focus(); toast('Added to your Tasks for today.'); }
        catch (err) { inp.disabled = false; toast(err.message || 'Could not add it.'); }
      }
      if (e.target.id === 'mwAdForm') {
        const name = $('#mwAdName').value.trim(); if (!name) { $('#mwAdName').focus(); return; }
        const link = $('#mwAdLink').value.trim();
        if (link && !/^https:\/\//.test(link)) { toast('The link has to start with https://'); return; }
        try { D.saved = (await put('/api/mywork/saved', { kind: 'ad', text: name, link, note: $('#mwAdWhy').value.trim(), brand: BRAND === 'All' ? '' : BRAND })).saved; ADDING_AD = false; TAB = 'ads'; paint(); }
        catch (err) { toast(err.message); }
      }
    };
  }

  async function render(host, first) {
    H = host; css();
    const t = H.RUN();
    if (first || !D) $('#main').innerHTML = `${H.pageHead('mywork', 'My work')}<div class="mw"><p class="mw-empty">Loading your work...</p></div>`;
    try { await load(true); }
    catch (e) { if (t === H.RUN()) $('#main').innerHTML = `${H.pageHead('mywork', 'My work')}<div class="mw"><p class="mw-empty" style="color:var(--bad)">${esc(e.message)}</p></div>`; return; }
    if (t !== H.RUN()) return;
    paint();
  }
  window.MyWorkTab = { render };
})();

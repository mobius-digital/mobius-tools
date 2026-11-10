/* AGENCY ECONOMICS AND TEAM WORKLOAD (2026-10-10). Two pages under Tools, drawn with the v2 pieces (window.V2UI).
 *   Tools > Agency economics   Cole only. GET account-health /api/agency/economics?month=  (agency.js on that worker)
 *                              Per client for a month: what they paid Mobius (the Ledger), team time and cost (an
 *                              ESTIMATE: each person's monthly cost and hours split by their share of completed Asana
 *                              tasks), AI cost, margin, revenue per team hour, and one sentence. People's costs and
 *                              Ledger names are set here (PUT /api/agency/settings).
 *   Tools > Team workload      The team. GET /api/agency/workload: who has what due this week (Mon to Sun) plus
 *                              Overdue, across every brand's Asana project, filter by person, each task links to Asana.
 *   Tools > Team scorecard     Cole only (2026-11-09). GET /api/agency/scorecard?period=: per person, Work (cards moved, ads
 *                              launched, files uploaded, Asana and Locus tasks) and Quality (test win rate, changes asked, on
 *                              time, Cole's weekly 1 to 5 rating, POST /api/agency/rating). A row opens the items behind it.
 * The host (index.html) passes its helpers: window.AgencyTab.render(tab, host, first). */
(() => {
  let H = null;
  const $ = s => document.querySelector(s);
  const U = () => window.V2UI;
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const head = (tab, title) => H.pageHead(tab, title).replace(/<p class="ph-sub">[\s\S]*?<\/p>/, '');
  const shell = (tab, title, body) => `<div class="v2 ag">${head(tab, title)}${body}</div>`;
  const usd = n => n == null ? '·' : (n < 0 ? '-' : '') + '$' + Math.round(Math.abs(n)).toLocaleString('en-US');
  const usd2 = n => n == null ? '·' : '$' + Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const md = s => new Date(s + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const wd = s => new Date(s + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short' });
  const ls = (k, v) => { try { if (v === undefined) return localStorage.getItem(k) || ''; localStorage.setItem(k, v); } catch { return ''; } };
  const skel = h => `<div class="ag-sk"><i style="height:22px;width:55%"></i><span><i></i><i></i><i></i><i></i></span><i style="height:${h}px"></i></div>`;

  function css() {
    if (document.getElementById('agcss')) return;
    const st = document.createElement('style'); st.id = 'agcss';
    st.textContent = `
      .ag .ag-bar{display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin:0 0 16px}
      .ag .ag-bar label{font-size:12.5px;color:var(--muted);font-weight:550}
      .ag .ag-bar select{font:inherit;font-size:13.5px;height:32px;padding:0 10px;border:1px solid var(--line-strong);border-radius:var(--r-sm);background:var(--surface);color:var(--ink)}
      .ag .ag-bar .sp{flex:1}
      .ag .v2tiles{margin:16px 0}
      .ag .ag-t th,.ag .ag-t td{white-space:nowrap}
      .ag .ag-t th:first-child,.ag .ag-t td:first-child{text-align:left}
      .ag .ag-t td.neg{color:var(--bad)} .ag .ag-t td.pos{color:var(--good)}
      .ag .ag-t tfoot td{font-weight:650;border-top:1px solid var(--line-strong)}
      .ag .ag-est{font-size:11px;color:var(--muted);font-weight:500}
      .ag .ag-note{margin:0 0 12px;padding:12px 16px;border-radius:var(--r-md);background:var(--warn-bg);color:var(--ink-2);font-size:13px;line-height:1.5}
      .ag .ag-note b{color:var(--ink)}
      .ag .ag-ppl{display:grid;grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:10px}
      .ag .ag-p{border:1px solid var(--line);border-radius:var(--r-md);padding:12px 14px;display:flex;flex-direction:column;gap:4px}
      .ag .ag-p b{font-weight:600}.ag .ag-p small{font-size:12.5px;color:var(--muted);line-height:1.45}
      .ag .ag-p.unset{border-style:dashed}
      .ag .ag-map{display:grid;gap:8px}
      .ag .ag-mrow{display:grid;grid-template-columns:minmax(0,1fr) 110px minmax(160px,220px);gap:12px;align-items:center;font-size:13.5px}
      .ag .ag-mrow select{font:inherit;font-size:13px;height:30px;border:1px solid var(--line-strong);border-radius:var(--r-sm);background:var(--surface);color:var(--ink);padding:0 8px}
      .ag .ag-mrow .amt{text-align:right;font-variant-numeric:tabular-nums}
      .ag .ag-wl{overflow-x:auto;margin:0 -4px;padding:0 4px}
      /* PHASE 7: the week fits the page at 1024 and up (no sideways scroll); under that the board scrolls */
      .ag .ag-grid{display:grid;grid-template-columns:118px repeat(8,minmax(0,1fr));min-width:0;border-top:1px solid var(--line)}
      @media (max-width:1000px){.ag .ag-grid{grid-template-columns:150px repeat(8,minmax(118px,1fr));min-width:1100px}}
      .ag .ag-grid>div{border-bottom:1px solid var(--line);padding:10px 8px;min-width:0}
      .ag .ag-grid .gh{font-size:11px;font-weight:650;letter-spacing:.05em;text-transform:uppercase;color:var(--muted);padding:10px 8px 8px}
      .ag .ag-grid .gh small{display:block;font-size:11px;font-weight:500;letter-spacing:0;text-transform:none;color:var(--faint)}
      .ag .ag-grid .gh.today{color:var(--brand)}
      .ag .ag-grid .c.today{background:color-mix(in srgb,var(--brand-soft) 45%,transparent)}
      .ag .ag-grid .c.od{background:color-mix(in srgb,var(--bad-bg) 55%,transparent)}
      .ag .ag-grid .who{font-weight:600;font-size:13.5px;display:flex;flex-direction:column;gap:2px}
      .ag .ag-grid .who small{font-size:12px;color:var(--muted);font-weight:500}
      .ag .ag-grid .who small.bad{color:var(--bad)}
      .ag .ag-task{display:flex;flex-direction:column;gap:3px;padding:6px 8px;margin:0 0 6px;border:1px solid var(--line);border-radius:8px;background:var(--surface);text-decoration:none;color:var(--ink);font-size:12.5px;line-height:1.35}
      .ag .ag-task:hover{border-color:var(--line-strong);background:var(--surface-2)}
      .ag .ag-task.late{border-color:color-mix(in srgb,var(--bad) 40%,var(--line))}
      .ag .ag-task .n{word-break:break-word}
      .ag .ag-task .m{display:flex;gap:6px;align-items:center;flex-wrap:wrap}
      .ag .ag-chip{display:inline-flex;align-items:center;height:18px;padding:0 7px;border-radius:999px;background:var(--surface-2);border:1px solid var(--line);font-size:11px;font-weight:550;color:var(--ink-2);max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      .ag .ag-task .d{font-size:11px;color:var(--bad)}
      .ag .ag-more{font:inherit;font-size:12px;color:var(--brand);background:none;border:0;padding:2px 0;cursor:pointer}
      .ag .ag-sk{display:grid;gap:16px}.ag .ag-sk>span{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:14px}
      .ag .ag-sk i{display:block;height:100px;border-radius:var(--r-lg);background:var(--surface-2);animation:ag-sk 1.4s ease-in-out infinite}
      @keyframes ag-sk{50%{opacity:.55}}
      @media (max-width:720px){.ag .ag-sk>span{grid-template-columns:repeat(2,minmax(0,1fr))}.ag .ag-mrow{grid-template-columns:1fr 90px}.ag .ag-mrow select{grid-column:1 / -1}}
      @media (prefers-reduced-motion:reduce){.ag .ag-sk i{animation:none}}
      .ag-modal .ag-prow{display:grid;grid-template-columns:minmax(0,1fr) 120px 96px;gap:10px;align-items:center;padding:8px 0;border-top:1px solid var(--line)}
      .ag-modal .ag-prow:first-of-type{border-top:0}
      .ag-modal .ag-prow b{font-weight:600;font-size:14px}.ag-modal .ag-prow small{display:block;font-size:12px;color:var(--muted)}
      .ag-modal .ag-prow input{font:inherit;font-size:13.5px;height:32px;width:100%;box-sizing:border-box;padding:0 8px;border:1px solid var(--line-strong);border-radius:var(--r-sm);background:var(--surface);color:var(--ink);text-align:right}
      .ag-modal .ag-ph{display:grid;grid-template-columns:minmax(0,1fr) 120px 96px;gap:10px;font-size:11px;font-weight:650;letter-spacing:.05em;text-transform:uppercase;color:var(--muted);margin:14px 0 4px}
      .ag-modal .ag-ph span:not(:first-child){text-align:right}
      .ag-modal .ag-list{max-height:min(52vh,460px);overflow:auto}
    `;
    document.head.appendChild(st);
  }

  /* ========================= AGENCY ECONOMICS ========================= */
  let ECON_M = '';
  async function economics(first, fresh) {
    css();
    const t = H.RUN();
    if (H.S.role !== 'owner') { $('#main').innerHTML = shell('economics', 'Agency economics', U().card('This page is Cole\'s', '', '<p class="v2hint">Agency economics shows what each client pays Mobius and what it costs. Ask Cole if you need a number from it.</p>')); return; }
    if (first || fresh) $('#main').innerHTML = shell('economics', 'Agency economics', skel(320));
    const q = `/api/agency/economics?${ECON_M ? `month=${encodeURIComponent(ECON_M)}&` : ''}${fresh ? 'fresh=1&' : ''}`.replace(/[?&]$/, '');
    let d; try { d = await H.apiAH(q); }
    catch (e) { if (t === H.RUN()) $('#main').innerHTML = shell('economics', 'Agency economics', U().card('Could not load this month', '', `<p class="v2bad">${esc(e.message)}</p><button type="button" class="ds-btn" id="agAgain">Try again</button>`)); const b = $('#agAgain'); if (b) b.onclick = () => economics(true, true); return; }
    if (t !== H.RUN()) return;
    ECON_M = d.month;
    const rows = d.rows || [], tot = d.totals || {};
    const notes = [];
    if (!d.ledger.ok) notes.push(`<b>The Ledger did not answer</b>, so what clients paid shows as $0. ${esc(d.ledger.error || '')}`);
    if (!d.people_set) notes.push('<b>Team cost is not set yet.</b> Press <b>Set people\'s costs</b> and enter what each person costs a month; until then margins leave team time out.');
    if ((d.asana_errors || []).length) notes.push(`<b>Asana did not answer for</b> ${d.asana_errors.map(x => esc(x.brand)).join(', ')}, so their team time is missing. ${esc(d.asana_errors[0].error)}`);
    const aiTip = r => U().tipAttr(`<b>${esc(r.name)}: AI</b><br>Locus ${usd2(r.ai.strategist)}<br>Ideas bot ${usd2(r.ai.ideas)}<br>Studio ${usd2(r.ai.studio)}<br>Creative tagging ${usd2(r.ai.tagging)}<br>Client Locus ${usd2(r.ai.client_ask)}`);
    const tr = rows.map(r => `<tr>
      <td><b>${esc(r.name)}</b>${r.asana ? '' : ' <span class="ag-est">no Asana project</span>'}</td>
      <td>${usd(r.revenue)}</td><td>${r.tasks || 0}</td><td>${r.hours ? r.hours.toLocaleString('en-US') : '·'}</td>
      <td>${d.people_set ? usd(r.team_cost) : '·'}</td><td${aiTip(r)}>${r.ai_cost >= 1 ? usd(r.ai_cost) : usd2(r.ai_cost)}</td>
      <td class="${r.margin < 0 ? 'neg' : ''}">${usd(r.margin)}${r.margin_pct != null ? ` <span class="ag-est">${Math.round(r.margin_pct)}%</span>` : ''}</td>
      <td>${r.per_hour != null ? usd(r.per_hour) : '·'}</td></tr>`).join('');
    const table = rows.length ? `<div class="v2tbl ag-t"><table><thead><tr><th>Client</th><th>Paid Mobius</th><th>Tasks done</th><th>Team hours <span class="ag-est">est.</span></th><th>Team cost <span class="ag-est">est.</span></th><th>AI</th><th>Margin</th><th>Per team hour</th></tr></thead>
      <tbody>${tr}</tbody><tfoot><tr><td>All clients</td><td>${usd(tot.revenue)}</td><td>${tot.tasks || 0}</td><td>${tot.hours ? tot.hours.toLocaleString('en-US') : '·'}</td><td>${d.people_set ? usd(tot.team_cost) : '·'}</td><td>${usd(tot.ai_cost)}</td><td class="${tot.margin < 0 ? 'neg' : ''}">${usd(tot.margin)}</td><td>${tot.hours && tot.revenue ? usd(tot.revenue / tot.hours) : '·'}</td></tr></tfoot></table></div>`
      : '<p class="v2hint">Nothing was paid, done or spent on AI for a client in this month.</p>';
    const ppl = (d.people || []).map(p => `<div class="ag-p${p.set ? '' : ' unset'}"><b>${esc(p.name)}</b>
      <small>${p.tasks} task${p.tasks === 1 ? '' : 's'} done${Object.keys(p.by_brand).length ? ': ' + Object.entries(p.by_brand).sort((a, b) => b[1] - a[1]).map(([b, n]) => `${esc(b)} ${n}`).join(', ') : ''}</small>
      <small>${p.set ? `${usd(p.cost)} a month, ${p.hours} hours` : 'Monthly cost not set'}</small></div>`).join('');
    const brandOpts = sel => `<option value="">Pick the client</option><option value="-"${sel === '' ? ' selected' : ''}>Not a client (other income)</option>${(d.brands || []).map(b => `<option value="${esc(b.id)}"${sel === b.id ? ' selected' : ''}>${esc(b.name)}</option>`).join('')}`;
    const unmatched = (d.unmatched || []).map(u => `<div class="ag-mrow"><span>${esc(u.name)}</span><span class="amt">${usd(u.amount)}</span><select data-payer="${esc(u.name)}" aria-label="Which client is ${esc(u.name)}">${brandOpts(null)}</select></div>`).join('');
    const pinned = Object.keys(d.map || {}).length;
    $('#main').innerHTML = shell('economics', 'Agency economics', `
      <div class="ag-bar"><label for="agMonth">Month</label><select id="agMonth">${(d.months || []).map(m => `<option value="${esc(m.id)}"${m.id === d.month ? ' selected' : ''}>${esc(m.label)}</option>`).join('')}</select>
        <span class="sp"></span><button type="button" class="ds-btn" id="agPeople">Set people's costs</button><button type="button" class="ds-btn" id="agFresh">Read again</button></div>
      <p class="v2say lead">${esc(d.sentence)}</p>
      <div class="v2tiles">${[
        U().tile({ label: 'Paid to Mobius', value: usd(tot.revenue), sub: d.ledger.ok ? `From the Ledger${d.ledger.frozen ? ', month closed' : ', month still open'}` : 'The Ledger did not answer' }),
        U().tile({ label: 'Team cost (estimate)', value: d.people_set ? usd(tot.team_cost) : '·', sub: `${tot.tasks || 0} tasks done, about ${tot.hours || 0} hours` }),
        U().tile({ label: 'AI cost', value: usd(tot.ai_cost), sub: d.ai_unassigned ? `${usd2(d.ai_unassigned)} more not tied to a client` : 'Every run tied to a client' }),
        U().tile({ label: 'Margin', value: usd(tot.margin), sub: tot.revenue ? `${Math.round(tot.margin / tot.revenue * 100)}% of what clients paid` : 'Nothing paid this month' }),
      ].join('')}</div>
      ${notes.map(n => `<p class="ag-note">${n}</p>`).join('')}
      ${U().card('Per client', `${esc(d.label)}${d.current ? ', so far' : ''}. Hover the AI number for where it went.`, table)}
      ${unmatched ? U().card('Ledger names to match', 'These payments are in the Ledger but no client has that name. Pick who each one is; it is remembered.', `<div class="ag-map">${unmatched}</div><p style="margin:14px 0 0"><button type="button" class="ds-btn primary" id="agMapSave">Save matches</button> <span class="v2hint" id="agMapMsg"></span></p>`) : ''}
      ${U().card('Team', 'Who finished tasks in client projects this month, and what each person costs.', ppl ? `<div class="ag-ppl">${ppl}</div>` : '<p class="v2hint">No completed Asana tasks in a client project this month.</p>')}
      ${U().foot(`${esc(d.model)} Work outside client projects is not seen, so the whole month lands on clients. Hours default to ${d.hours_default} a month. AI = Locus (with its images, PDFs and analysis), the ideas bot, Studio images, videos and photo looks, creative tagging and the client Locus. Paid Mobius = income in the Ledger for the month, matched to clients by name${pinned ? ` (${pinned} name${pinned === 1 ? '' : 's'} matched by hand)` : ''}.`)}`);
    $('#agMonth').onchange = e => { ECON_M = e.target.value; economics(true); };
    $('#agFresh').onclick = () => economics(true, true);
    $('#agPeople').onclick = () => peopleModal(d);
    const ms = $('#agMapSave');
    if (ms) ms.onclick = async () => {
      const map = {};
      document.querySelectorAll('#main [data-payer]').forEach(s => { if (s.value) map[s.dataset.payer] = s.value === '-' ? '' : s.value; });
      const msg = $('#agMapMsg');
      if (!Object.keys(map).length) { msg.textContent = 'Pick a client for at least one name.'; return; }
      ms.disabled = true; msg.textContent = 'Saving';
      try { await H.apiAH('/api/agency/settings', { method: 'PUT', body: JSON.stringify({ map }) }); economics(true, true); }
      catch (e) { ms.disabled = false; msg.textContent = e.message; }
    };
  }

  function peopleModal(d) {
    const ppl = d.people || [];
    const w = document.createElement('div');
    w.className = 'modal-wrap';
    w.innerHTML = `<div class="modal ag-modal" role="dialog" aria-modal="true" aria-labelledby="agPT" style="width:min(560px,calc(100vw - 32px))">
      <h3 id="agPT">People's costs</h3>
      <p class="hint">What each person costs Mobius a month (pay, contractor fee) and roughly how many hours they work a month. Each person's month is split across clients by their share of the Asana tasks they finished in each client's project, so the team numbers are an estimate.</p>
      ${ppl.length ? `<div class="ag-ph"><span>Person</span><span>Cost a month ($)</span><span>Hours a month</span></div>
      <div class="ag-list">${ppl.map(p => `<div class="ag-prow" data-gid="${esc(p.gid)}" data-name="${esc(p.name)}"><span><b>${esc(p.name)}</b><small>${p.tasks} task${p.tasks === 1 ? '' : 's'} done in ${esc(d.label)}</small></span>
        <input type="number" min="0" step="50" inputmode="decimal" data-k="cost" value="${p.cost ?? ''}" placeholder="Not set" aria-label="${esc(p.name)} monthly cost in dollars">
        <input type="number" min="1" max="744" step="1" inputmode="numeric" data-k="hours" value="${p.hours ?? d.hours_default}" aria-label="${esc(p.name)} hours a month"></div>`).join('')}</div>`
      : '<p class="v2hint">Nobody finished a task in a client project this month, so there is nobody to set yet. Pick a busier month first.</p>'}
      <p class="hint" id="agPMsg" style="min-height:1em;margin:10px 0 0"></p>
      <div class="row" style="justify-content:flex-end;gap:8px;margin:14px 0 0"><button class="btn" data-m="no">Cancel</button>${ppl.length ? '<button class="btn primary" data-m="yes">Save</button>' : ''}</div></div>`;
    document.body.appendChild(w);
    const close = () => { w.remove(); document.removeEventListener('keydown', k); };
    const k = e => { if (e.key === 'Escape') close(); };
    document.addEventListener('keydown', k);
    w.addEventListener('mousedown', e => { if (e.target === w) close(); });
    w.querySelector('[data-m="no"]').onclick = close;
    const yes = w.querySelector('[data-m="yes"]');
    if (!matchMedia('(max-width:720px)').matches) setTimeout(() => { const i = w.querySelector('input'); if (i) i.focus(); }, 30);
    if (yes) yes.onclick = async () => {
      const people = {};
      w.querySelectorAll('.ag-prow').forEach(r => {
        const cost = r.querySelector('[data-k="cost"]').value, hours = r.querySelector('[data-k="hours"]').value;
        people[r.dataset.gid] = { name: r.dataset.name, cost: Number(cost) || 0, hours: Number(hours) || d.hours_default };
      });
      yes.disabled = true; w.querySelector('#agPMsg').textContent = 'Saving';
      try { await H.apiAH('/api/agency/settings', { method: 'PUT', body: JSON.stringify({ people }) }); close(); economics(true, true); }
      catch (e) { yes.disabled = false; w.querySelector('#agPMsg').textContent = e.message; }
    };
  }

  /* ========================= TEAM WORKLOAD ========================= */
  const OPEN = new Set();   // people whose cells show every task
  async function workload(first, fresh) {
    css();
    const t = H.RUN();
    if (first || fresh) $('#main').innerHTML = shell('workload', 'Team workload', skel(360));
    let d; try { d = await H.apiAH(`/api/agency/workload${fresh ? '?fresh=1' : ''}`); }
    catch (e) { if (t === H.RUN()) $('#main').innerHTML = shell('workload', 'Team workload', U().card('Asana did not answer', '', `<p class="v2bad">${esc(e.message)}</p><button type="button" class="ds-btn" id="agAgain">Try again</button>`)); const b = $('#agAgain'); if (b) b.onclick = () => workload(true, true); return; }
    if (t !== H.RUN()) return;
    paintWorkload(d);
  }
  function paintWorkload(d) {
    let who = ls('ag_who');
    if (who && !d.people.some(p => p.key === who)) who = '';
    const ppl = d.people.filter(p => !who || p.key === who);
    const today = d.today, week = d.week;
    const overdue = d.people.reduce((s, p) => s + p.overdue.length, 0);
    const lateThisWeek = d.people.reduce((s, p) => s + week.filter(x => x < today).reduce((a, x) => a + p.days[x].length, 0), 0);
    const busiest = d.people.filter(p => p.key !== 'none').sort((a, b) => b.n - a.n)[0];
    const say = d.total
      ? `<b>${d.total} task${d.total === 1 ? '' : 's'}</b> due this week or overdue across ${d.brands.length} client${d.brands.length === 1 ? '' : 's'}.${overdue + lateThisWeek ? ` <b class="bad">${overdue + lateThisWeek} ${overdue + lateThisWeek === 1 ? 'is' : 'are'} late.</b>` : ' Nothing is late.'}${busiest ? ` ${esc(busiest.name)} has the most (${busiest.n}).` : ''}`
      : 'Nothing is due this week and nothing is overdue in the client projects.';
    const task = x => `<a class="ag-task${x.late ? ' late' : ''}" href="${esc(x.url || '#')}" target="_blank" rel="noopener" title="Open in Asana${x.section ? ': ' + esc(x.section) : ''}">
      <span class="n">${esc(x.name)}</span><span class="m"><span class="ag-chip">${esc(x.brand_name)}</span>${x.late ? `<span class="d">due ${esc(md(x.due))}</span>` : ''}</span></a>`;
    const cell = (p, list) => {
      const all = OPEN.has(p.key), shown = all ? list : list.slice(0, 3);
      return shown.map(task).join('') + (list.length > shown.length ? `<button type="button" class="ag-more" data-open="${esc(p.key)}">${list.length - shown.length} more</button>` : '');
    };
    const headCells = `<div class="gh"></div><div class="gh">Overdue<small>before ${esc(md(week[0]))}</small></div>${week.map(x => `<div class="gh${x === today ? ' today' : ''}">${esc(wd(x))}<small>${esc(md(x))}${x === today ? ', today' : ''}</small></div>`).join('')}`;
    const body = ppl.map(p => `<div class="who">${esc(p.name)}<small>${p.n} task${p.n === 1 ? '' : 's'}</small>${p.late ? `<small class="bad">${p.late} late</small>` : ''}</div>
      <div class="c${p.overdue.length ? ' od' : ''}">${cell(p, p.overdue)}</div>${week.map(x => `<div class="c${x === today ? ' today' : ''}">${cell(p, p.days[x])}</div>`).join('')}`).join('');
    const errs = (d.errors || []).length ? `<p class="ag-note"><b>Asana did not answer for</b> ${d.errors.map(e => esc(e.brand)).join(', ')}. ${esc(d.errors[0].error)}</p>` : '';
    $('#main').innerHTML = shell('workload', 'Team workload', `
      <div class="ag-bar"><label for="agWho">Person</label><select id="agWho"><option value="">Everyone</option>${d.people.map(p => `<option value="${esc(p.key)}"${p.key === who ? ' selected' : ''}>${esc(p.name)} (${p.n})</option>`).join('')}</select>
        <span class="sp"></span><button type="button" class="ds-btn" id="agFresh">Read Asana again</button></div>
      <p class="v2say lead">${say}</p>
      ${errs}
      ${U().card(`Week of ${md(week[0])}`, 'Open tasks with a due date in each client\'s Asana project. Press a task to open it in Asana.', d.total ? `<div class="ag-wl"><div class="ag-grid">${headCells}${body}</div></div>` : '<p class="v2hint">Nothing due.</p>')}
      ${U().foot(`From each client's linked Asana project (the same links as Home), read every 30 minutes. Overdue = due before this Monday and up to 60 days ago; tasks in backlog, ideas, done, reference, on hold and analyze sections are left out. Paused and test brands are skipped. Last read ${esc(new Date(d.as_of).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }))}.`)}`);
    $('#agWho').onchange = e => { ls('ag_who', e.target.value); paintWorkload(d); };
    $('#agFresh').onclick = () => workload(true, true);
    document.querySelectorAll('#main [data-open]').forEach(b => b.onclick = () => { OPEN.add(b.dataset.open); paintWorkload(d); });
  }

  /* ========================= TEAM SCORECARD (2026-11-09, Cole only) =========================
     GET /api/agency/scorecard?period=week|4w|month and POST /api/agency/rating {name, week, stars, note} (account-health agency.js).
     One row per person (a card on a phone, the .v2tbl rule in phone.css): Work (how much) and Quality (how good). A row opens a
     sheet with the items behind every number and Cole's 1 to 5 rating for the week. */
  let SC = null;
  const SC_P = () => ls('ag_sc_p') || 'week';
  function scCss() {
    if (document.getElementById('agsccss')) return;
    const st = document.createElement('style'); st.id = 'agsccss';
    st.textContent = `
      .ag .ag-sc th,.ag .ag-sc td{white-space:nowrap;text-align:right;vertical-align:top}
      .ag .ag-sc th:first-child,.ag .ag-sc td:first-child{text-align:left}
      .ag .ag-sc thead tr.ag-grp th{font-size:11px;font-weight:650;letter-spacing:.05em;text-transform:uppercase;color:var(--muted);text-align:center;border-bottom:1px solid var(--line)}
      .ag .ag-sc thead tr.ag-grp th.q{color:var(--brand)}
      .ag .ag-sc td.gs{border-left:1px solid var(--line)}
      .ag .ag-sc tbody tr{cursor:pointer}
      .ag .ag-sc tbody tr:hover td{background:var(--surface-2)}
      .ag .ag-sc small{display:block;font-size:11.5px;color:var(--muted);font-weight:500}
      @media (max-width:600px){.ag .ag-sc td.gs{border-left:0}.ag .ag-sc .v .nil{display:none}.ag .ag-sc .v small{display:inline;margin-left:6px}.ag .ag-sc .v .nil+small{margin-left:0}}
      .ag .ag-sc .nil{color:var(--faint)}
      .ag .ag-sc .bad{color:var(--bad)} .ag .ag-sc .good{color:var(--good)}
      .ag .ag-nm{font:inherit;font-weight:600;font-size:14px;color:var(--ink);background:none;border:0;padding:0;cursor:pointer;text-align:left;min-height:0}
      .ag .ag-nm:hover{color:var(--brand)}
      .ag-stars{color:var(--warn-on,#EBBF63);letter-spacing:1px}
      .ag-stars .off{color:var(--line-strong)}
      .ag-sheet .ag-sh-h{display:flex;flex-direction:column;gap:2px;margin:0 0 12px}
      .ag-sheet .ag-sh-h small{font-size:12.5px;color:var(--muted)}
      .ag-sheet .ag-rate{border:1px solid var(--line);border-radius:var(--r-md);padding:12px 14px;margin:0 0 14px;display:grid;gap:10px}
      .ag-sheet .ag-rate .row1{display:flex;gap:10px;align-items:center;flex-wrap:wrap;justify-content:space-between}
      .ag-sheet .ag-rate b{font-weight:600}
      .ag-sheet .ag-pick{display:flex;gap:2px}
      .ag-sheet .ag-pick button{font:inherit;font-size:26px;line-height:1;width:40px;height:40px;min-height:0;border:0;background:none;cursor:pointer;color:var(--line-strong);padding:0;border-radius:8px}
      .ag-sheet .ag-pick button.on{color:var(--warn-on,#EBBF63)}
      .ag-sheet .ag-pick button:focus-visible{outline:2px solid var(--brand)}
      .ag-sheet .ag-rate input[type=text]{font:inherit;font-size:13.5px;height:34px;width:100%;box-sizing:border-box;padding:0 10px;border:1px solid var(--line-strong);border-radius:var(--r-sm);background:var(--surface);color:var(--ink)}
      .ag-sheet .ag-rate .hist{font-size:12.5px;color:var(--muted);line-height:1.5}
      .ag-sheet .ag-body{max-height:min(56vh,560px);overflow:auto;margin:0 -4px;padding:0 4px}
      .ag-sheet h4{font-size:12px;font-weight:650;letter-spacing:.05em;text-transform:uppercase;color:var(--muted);margin:16px 0 6px;display:flex;justify-content:space-between;gap:8px}
      .ag-sheet h4:first-child{margin-top:0}
      .ag-sheet .it{display:flex;flex-direction:column;gap:2px;padding:7px 0;border-top:1px solid var(--line);font-size:13px;line-height:1.4;min-width:0}
      .ag-sheet .it a{color:var(--ink);text-decoration:none;font-weight:550;overflow-wrap:anywhere}
      .ag-sheet .it a:hover{color:var(--brand);text-decoration:underline}
      .ag-sheet .it .m{display:flex;gap:6px;flex-wrap:wrap;align-items:center;font-size:12px;color:var(--muted)}
      .ag-sheet .it q{font-style:italic;color:var(--ink-2);overflow-wrap:anywhere}
      .ag-sheet .it .by{font-size:11.5px;color:var(--faint)}
      .ag-sheet .tag{display:inline-flex;align-items:center;height:18px;padding:0 7px;border-radius:999px;font-size:11px;font-weight:600;background:var(--surface-2);border:1px solid var(--line);color:var(--ink-2)}
      .ag-sheet .tag.good{background:var(--good-bg);color:var(--good);border-color:transparent}
      .ag-sheet .tag.bad{background:var(--bad-bg);color:var(--bad);border-color:transparent}
      .ag-sheet .tag.warn{background:var(--warn-bg);color:var(--warn);border-color:transparent}
      .ag-sheet .none{font-size:13px;color:var(--muted);padding:4px 0 2px}
      /* a phone: the sheet is the full width at the bottom and scrolls as one (no box scrolling inside a box) */
      @media (max-width:720px){.modal.ag-sheet{width:100%!important;max-width:none;max-height:92dvh;overflow-y:auto;box-sizing:border-box;border-radius:16px 16px 0 0}
        .ag-sheet .ag-body{max-height:none;overflow:visible;margin:0;padding:0}}
    `;
    document.head.appendChild(st);
  }
  const stars = n => n ? `<span class="ag-stars" aria-label="${n} of 5">${'★'.repeat(n)}<span class="off">${'★'.repeat(5 - n)}</span></span>` : '';
  const pct = v => v == null ? null : `${v}%`;
  /* the one line at the top, written from the table by rules */
  function scSay(d) {
    const ppl = d.people, total = ppl.reduce((s, p) => s + p.total, 0);
    if (!total) return `Nothing was moved, launched, uploaded or ticked off in ${esc(d.period.name.toLowerCase())} yet.`;
    const parts = [`<b>${total} piece${total === 1 ? '' : 's'} of work</b> across the team in ${esc(d.period.name.toLowerCase())}.`];
    const top = [...ppl].sort((a, b) => b.total - a.total)[0];
    if (top && top.total) parts.push(`${esc(top.name)} did the most (${top.total}).`);
    const late = ppl.filter(p => p.quality.on_time.total >= 2 && p.quality.on_time.pct < 70).sort((a, b) => a.quality.on_time.pct - b.quality.on_time.pct);
    if (late.length) parts.push(`<b class="bad">${late.map(p => `${esc(p.name)} (${p.quality.on_time.pct}% on time)`).join(', ')}</b> ran late.`);
    const unrated = ppl.filter(p => p.quality.rating?.latest?.week !== d.this_week && p.total > 0);
    if (unrated.length) parts.push(`${unrated.length === 1 ? esc(unrated[0].name) + ' is' : unrated.length + ' people are'} not rated for this week yet.`);
    return parts.join(' ');
  }
  async function scorecard(first, fresh) {
    css(); scCss();
    const t = H.RUN();
    if (H.S.role !== 'owner') { $('#main').innerHTML = shell('scorecard', 'Team scorecard', U().card('This page is Cole\'s', '', '<p class="v2hint">The team scorecard is where Cole reviews each person\'s work. Team workload shows what is due this week.</p>')); return; }
    if (first || fresh) $('#main').innerHTML = shell('scorecard', 'Team scorecard', skel(360));
    let d; try { d = await H.apiAH(`/api/agency/scorecard?period=${encodeURIComponent(SC_P())}${fresh ? '&fresh=1' : ''}`); }
    catch (e) { if (t === H.RUN()) $('#main').innerHTML = shell('scorecard', 'Team scorecard', U().card('Could not load the scorecard', '', `<p class="v2bad">${esc(e.message)}</p><button type="button" class="ds-btn" id="agAgain">Try again</button>`)); const b = $('#agAgain'); if (b) b.onclick = () => scorecard(true, true); return; }
    if (t !== H.RUN()) return;
    SC = d;
    paintScorecard(d);
  }
  function paintScorecard(d) {
    const num = (v, why) => v == null ? `<span class="nil" title="${esc(why)}">·</span>` : String(v);
    const row = p => {
      const w = p.work, q = p.quality, win = q.win, ch = q.changes, ot = q.on_time, rt = q.rating || {};
      const winCell = win.judged ? `${win.rate}%<small>${win.winners} of ${win.judged} judged${win.thin_skipped ? `, ${win.thin_skipped} thin left out` : ''}</small>`
        : `<span class="nil">·</span><small>${win.thin_skipped ? `${win.thin_skipped} thin, left out` : p.roles.includes('strategist') ? 'No tests judged yet' : 'Not a strategist'}</small>`;
      const chCell = ch.cards ? `${ch.n}<small>${ch.per_card} per card, ${ch.cards} card${ch.cards === 1 ? '' : 's'}</small>` : `<span class="nil">·</span><small>No work reviewed yet</small>`;
      const otCell = ot.total ? `<span class="${ot.pct >= 90 ? 'good' : ot.pct < 70 ? 'bad' : ''}">${ot.pct}%</span><small>${ot.on} of ${ot.total} on time</small>` : `<span class="nil">·</span><small>Nothing with a due date</small>`;
      const rtCell = rt.latest ? `${stars(rt.latest.stars)}<small>${rt.latest.week === d.this_week ? 'this week' : 'week of ' + esc(md(rt.latest.week))}${rt.avg4 != null ? `, 4-week avg ${rt.avg4}` : ''}</small>` : `<span class="nil">·</span><small>Not rated yet</small>`;
      return `<tr data-p="${esc(p.key)}">
        <td><button type="button" class="ag-nm" data-p="${esc(p.key)}">${esc(p.name)}</button><small>${esc(p.roles.join(', ') || 'team')}</small></td>
        <td class="gs" data-l="Cards moved">${num(w.cards)}</td><td data-l="Ads launched">${num(w.launches)}</td><td data-l="Files uploaded">${num(w.versions)}</td>
        <td data-l="Asana tasks"><span class="v">${num(w.asana, 'Not in Asana')}${w.asana == null ? '<small>Not in Asana</small>' : ''}</span></td><td data-l="Locus tasks">${num(w.tasks)}</td>
        <td class="gs" data-l="Test win rate"><span class="v">${winCell}</span></td><td data-l="Changes asked"><span class="v">${chCell}</span></td><td data-l="On time"><span class="v">${otCell}</span></td><td data-l="Cole's rating"><span class="v">${rtCell}</span></td></tr>`;
    };
    const table = `<div class="v2tbl ag-sc"><table><thead>
      <tr class="ag-grp"><th></th><th colspan="5">Work (how much)</th><th colspan="4" class="q">Quality (how good)</th></tr>
      <tr><th>Person</th><th>Cards moved</th><th>Ads launched</th><th>Files uploaded</th><th>Asana tasks</th><th>Locus tasks</th><th>Test win rate</th><th>Changes asked</th><th>On time</th><th>Cole's rating</th></tr></thead>
      <tbody>${d.people.map(row).join('')}</tbody></table></div>`;
    const u = d.uncredited || {}, un = Object.values(u).reduce((s, n) => s + n, 0);
    const notes = [];
    if ((d.asana_errors || []).length) notes.push(`<b>Asana did not answer for</b> ${d.asana_errors.map(x => esc(x.brand)).join(', ')}, so their Asana tasks are missing. ${esc(d.asana_errors[0].error)}`);
    $('#main').innerHTML = shell('scorecard', 'Team scorecard', `
      <div class="ag-bar"><div class="v2jobs" role="group" aria-label="Period">${d.periods.map(p => `<button type="button" data-sp="${esc(p.id)}" class="${p.id === d.period.id ? 'on' : ''}" aria-pressed="${p.id === d.period.id}">${esc(p.name)}</button>`).join('')}</div>
        <span class="v2hint">${esc(d.period.label)}</span><span class="sp"></span><button type="button" class="ds-btn" id="agFresh">Read again</button></div>
      <p class="v2say lead">${scSay(d)}</p>
      ${notes.map(n => `<p class="ag-note">${n}</p>`).join('')}
      ${U().card('Each person', 'Press a person to see every item behind their numbers and to rate their week.', table)}
      ${U().foot(`Central time. <b>Cards moved</b> = production cards assigned to them in Asana that were approved or reached Ready or Live. <b>Ads launched</b> = launched from Locus. <b>Files uploaded</b> = new versions on a card. <b>Asana tasks</b> = finished or moved in a client project. <b>Locus tasks</b> = ticked off in Tasks. <b>Test win rate</b> = winners out of tests judged, calls on too little spend left out, credited to the card's strategist or else the brand's strategist from the season call sheet. <b>Changes asked</b> = "Ask for changes" on files they made. <b>On time</b> = cards and tasks done by their due date, against everything that came due. ${un ? `${un} item${un === 1 ? '' : 's'} by people outside the team list (clients, freelancers, nobody named) are left out.` : ''} Read ${esc(new Date(d.as_of).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }))}.`)}`);
    document.querySelectorAll('#main [data-sp]').forEach(b => b.onclick = () => { ls('ag_sc_p', b.dataset.sp); scorecard(true); });
    $('#agFresh').onclick = () => scorecard(true, true);
    document.querySelectorAll('#main tr[data-p]').forEach(tr => tr.onclick = () => { const p = d.people.find(x => x.key === tr.dataset.p); if (p) personSheet(d, p); });
  }

  function personSheet(d, p) {
    const I = p.items, q = p.quality, rt = q.rating || {};
    const link = (href, text) => href ? `<a href="${esc(href)}" target="_blank" rel="noopener">${esc(text)}</a>` : `<span>${esc(text)}</span>`;
    const chip = (t, cls = '') => `<span class="tag ${cls}">${esc(t)}</span>`;
    const sec = (title, list, n, empty, item) => `<h4><span>${esc(title)}</span><span>${n}</span></h4>${list.length ? list.map(item).join('') + (n > list.length ? `<p class="none">and ${n - list.length} more</p>` : '') : `<p class="none">${esc(empty)}</p>`}`;
    const strat = p.roles.includes('strategist');
    const body = [
      sec('Cards moved forward', I.cards, p.work.cards, 'No cards of theirs were approved or reached Ready or Live.', x => `<div class="it">${link(x.link, x.name)}<span class="m">${chip(x.brand)}${chip(x.to)}<span>${esc(md(x.day))}</span>${x.due ? `<span>due ${esc(md(x.due))}</span>` : ''}${x.asana_url ? `<a href="${esc(x.asana_url)}" target="_blank" rel="noopener">Asana</a>` : ''}</span></div>`),
      sec('Ads launched', I.launches, p.work.launches, 'No ads launched from Locus.', x => `<div class="it">${link(x.url, x.name)}<span class="m">${chip(x.brand)}${x.set ? `<span>${esc(x.set)}</span>` : ''}<span>${esc(md(x.day))}</span></span></div>`),
      sec('Files uploaded', I.versions, p.work.versions, 'No file versions uploaded on a card.', x => `<div class="it">${link(x.link, x.name)}<span class="m">${chip(x.brand)}<span>on ${esc(x.card)}</span><span>${esc(md(x.day))}</span></span></div>`),
      p.work.asana == null ? `<h4><span>Asana tasks</span><span>·</span></h4><p class="none">${esc(p.name)} is not in Asana, so only what Locus has is shown.</p>`
        : sec('Asana tasks', I.asana, p.work.asana, 'No Asana tasks finished or moved in a client project.', x => `<div class="it">${link(x.url, x.name)}<span class="m">${chip(x.brand)}${chip(x.done ? 'Finished' : 'Moved', x.done ? 'good' : '')}<span>${esc(md(x.day))}</span></span></div>`),
      sec('Locus tasks done', I.tasks, p.work.tasks, 'No Locus tasks ticked off.', x => `<div class="it">${link(x.link, x.name)}<span class="m">${chip(x.brand)}<span>done ${esc(md(x.day))}</span>${x.due ? `<span>due ${esc(md(x.due))}</span>` : ''}</span></div>`),
      sec('Tests judged', I.judged, q.win.judged + q.win.thin_skipped, strat ? 'No tests judged yet.' : 'Tests are credited to strategists; none were credited here.', x => `<div class="it">${link(x.link, x.name)}<span class="m">${chip(x.brand)}${chip(x.call === 'winner' ? 'Winner' : 'Loser', x.call === 'winner' ? 'good' : 'bad')}${x.thin ? chip('Left out: called on thin spend', 'warn') : ''}${x.how === 'locus_call' ? '<span>Locus call, test not closed</span>' : ''}<span>${esc(md(x.day))}</span></span>
        <span class="by">Credited by: ${x.credited_by === 'card owner' ? 'the card owner' : `the brand's strategist (season call sheet)${x.assignee ? `; the card was assigned to ${esc(x.assignee)}` : ''}`}</span></div>`),
      sec('Changes asked', I.changes, q.changes.n, q.changes.cards ? `No changes asked on ${q.changes.cards} card${q.changes.cards === 1 ? '' : 's'} reviewed.` : 'No work of theirs was reviewed.', x => `<div class="it">${link(x.link, x.card)}<span class="m">${chip(x.brand)}${x.from_client ? chip('Client', 'warn') : ''}<span>${esc(x.by)}, ${esc(md(x.day))}</span></span>${x.said ? `<q>${esc(x.said)}</q>` : ''}
        <span class="by">Credited by: ${x.credited_by === 'made the file' ? 'they uploaded the file' : 'they own the card (no file named)'}</span></div>`),
      sec('Due dates', I.on_time, q.on_time.total, 'Nothing of theirs had a due date.', x => `<div class="it">${link(x.link, x.name)}<span class="m">${chip(x.brand)}${chip(x.on ? 'On time' : x.open ? 'Late, still open' : 'Late', x.on ? 'good' : 'bad')}<span>due ${esc(md(x.due))}</span>${x.day ? `<span>${x.kind === 'card' ? 'reached' : 'done'} ${esc(md(x.day))}</span>` : ''}</span></div>`),
    ].join('');
    let week = d.this_week;
    const cur = wk => (rt.weeks || []).find(r => r.week === wk) || null;
    const w = document.createElement('div');
    w.className = 'modal-wrap';
    w.innerHTML = `<div class="modal ag-modal ag-sheet" role="dialog" aria-modal="true" aria-labelledby="agST" style="width:min(640px,calc(100vw - 32px))">
      <div class="ag-sh-h"><h3 id="agST" style="margin:0">${esc(p.name)}</h3><small>${esc(p.roles.join(', ') || 'team')} · ${esc(d.period.name)}, ${esc(d.period.label)}</small></div>
      <div class="ag-rate">
        <div class="row1"><b>Your rating</b><div class="v2jobs" role="group" aria-label="Week">${[[d.this_week, 'This week'], [d.last_week, 'Last week']].map(([k, l]) => `<button type="button" data-wk="${k}" class="${k === week ? 'on' : ''}">${l}</button>`).join('')}</div></div>
        <div class="ag-pick" role="radiogroup" aria-label="Stars">${[1, 2, 3, 4, 5].map(n => `<button type="button" role="radio" data-s="${n}" aria-label="${n} star${n === 1 ? '' : 's'}">★</button>`).join('')}</div>
        <input type="text" id="agNote" maxlength="200" placeholder="One line on the week (optional)" aria-label="Note on the week">
        <div class="row1"><span class="hist">${(rt.weeks || []).length ? 'Before: ' + rt.weeks.slice(0, 6).map(r => `${esc(md(r.week))} ${r.stars}★`).join(', ') + (rt.avg4 != null ? `. 4-week average ${rt.avg4}.` : '') : 'Not rated before.'}</span>
          <span style="display:flex;gap:8px"><button class="btn" type="button" id="agClear">Clear</button><button class="btn primary" type="button" id="agRateSave">Save rating</button></span></div>
        <p class="hint" id="agRMsg" style="margin:0;min-height:1em"></p>
      </div>
      <div class="ag-body">${body}</div>
      <div class="row" style="justify-content:flex-end;gap:8px;margin:14px 0 0"><button class="btn" data-m="no">Close</button></div></div>`;
    document.body.appendChild(w);
    let pick = 0;
    const paintPick = () => w.querySelectorAll('[data-s]').forEach(b => { const on = +b.dataset.s <= pick; b.classList.toggle('on', on); b.setAttribute('aria-checked', String(+b.dataset.s === pick)); });
    const loadWeek = () => { const r = cur(week); pick = r ? r.stars : 0; w.querySelector('#agNote').value = r ? r.note : ''; paintPick();
      w.querySelectorAll('[data-wk]').forEach(b => b.classList.toggle('on', b.dataset.wk === week)); w.querySelector('#agRMsg').textContent = r || !(rt.weeks || []).length ? '' : 'Not rated for this week yet.'; };
    loadWeek();
    w.querySelectorAll('[data-s]').forEach(b => b.onclick = () => { pick = +b.dataset.s; paintPick(); });
    w.querySelectorAll('[data-wk]').forEach(b => b.onclick = () => { week = b.dataset.wk; loadWeek(); });
    const close = () => { w.remove(); document.removeEventListener('keydown', k); };
    const k = e => { if (e.key === 'Escape') close(); };
    document.addEventListener('keydown', k);
    w.addEventListener('mousedown', e => { if (e.target === w) close(); });
    w.querySelector('[data-m="no"]').onclick = close;
    const save = async stars => {
      const msg = w.querySelector('#agRMsg');
      if (stars !== null && !stars) { msg.textContent = 'Pick 1 to 5 stars first.'; return; }
      w.querySelectorAll('#agRateSave,#agClear').forEach(b => { b.disabled = true; });
      msg.textContent = 'Saving';
      try {
        await H.apiAH('/api/agency/rating', { method: 'POST', body: JSON.stringify({ name: p.name, week, stars, note: w.querySelector('#agNote').value }) });
        close(); scorecard(false);
      } catch (e) { w.querySelectorAll('#agRateSave,#agClear').forEach(b => { b.disabled = false; }); msg.textContent = e.message; }
    };
    w.querySelector('#agRateSave').onclick = () => save(pick);
    w.querySelector('#agClear').onclick = () => save(null);
  }

  window.AgencyTab = {
    render(tab, host, first) {
      H = host;
      if (tab === 'economics') return economics(first);
      if (tab === 'workload') return workload(first);
      if (tab === 'scorecard') return scorecard(first);
    },
  };
})();

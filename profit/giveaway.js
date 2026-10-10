/* Giveaway / list building (2026-10-10). window.GiveawayUI. Read profit/CLAUDE.md "2026-10-10: giveaway spend vs sales MER".
 *   homeCard(g, cur)        Home (one brand): spend, entries, cost per entry against the most to pay, pace against the goal
 *   metaLine(g, cur)        Ads > Meta > Overview: the split in one line
 *   salesMer(g, sales, spend)  the Sales MER for a tile, from the tile's own revenue and spend
 *   goalsCard(host, h)      Home > Goals: the "Sales spend cap at the MER floor" line, the giveaway budget, and the
 *                           settings (in-app modal). h = { S, api, act, month, sales, refresh }
 * The numbers come from GET /api/hub/giveaway (profit hub.js); the settings from GET/PUT/DELETE /api/giveaway. */
(function () {
  const U = () => window.V2UI || {};
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const sym = cur => (!cur || cur === 'USD' ? '$' : cur === 'GBP' ? '£' : cur === 'EUR' ? '€' : cur === 'AUD' ? 'A$' : cur === 'CAD' ? 'C$' : cur + ' ');
  const m0 = (v, cur) => v == null ? '–' : `${sym(cur)}${Math.round(v).toLocaleString('en-US')}`;
  const m2 = (v, cur) => v == null ? '–' : `${sym(cur)}${(+v).toFixed(2)}`;
  const x2 = v => v == null ? '–' : `${(+v).toFixed(2)}x`;
  const int = v => v == null ? '–' : Math.round(v).toLocaleString('en-US');
  const nice = d => d ? new Date(d + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '';
  const SOURCE = { klaviyo: 'Klaviyo list', meta_leads: 'Meta lead results', none: 'not counted yet' };

  function css() {
    if (document.getElementById('gwcss')) return;
    const st = document.createElement('style'); st.id = 'gwcss';
    st.textContent = `.gw-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;margin:10px 0 6px}
      @media (max-width:720px){.gw-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}
      .gw-k{display:flex;flex-direction:column;gap:3px;padding:10px 12px;border:1px solid var(--line,rgba(127,127,127,.25));border-radius:10px;min-width:0}
      .gw-k .l{font-size:11.5px;letter-spacing:.04em;text-transform:uppercase;opacity:.7}
      .gw-k .v{font-size:20px;font-weight:600;font-variant-numeric:tabular-nums}
      .gw-k .s{font-size:12px;opacity:.75}
      .gw-trk{height:6px;border-radius:4px;background:var(--line,rgba(127,127,127,.2));position:relative;margin-top:4px;overflow:hidden}
      .gw-trk i{position:absolute;left:0;top:0;bottom:0;border-radius:4px}
      .gw-note{font-size:12.5px;opacity:.8;margin:6px 0 0}
      .gw-form{display:grid;grid-template-columns:1fr 1fr;gap:12px 16px;margin:12px 0 4px}
      .gw-form label{display:flex;flex-direction:column;gap:4px;font-size:12.5px}
      .gw-form label b{font-weight:600}.gw-form label small{opacity:.7;font-weight:400}
      .gw-form input[type=text],.gw-form input[type=date]{width:100%;box-sizing:border-box;padding:8px 10px;border:1px solid var(--line-strong,rgba(127,127,127,.4));border-radius:8px;background:transparent;color:inherit;font:inherit}
      .gw-form .full{grid-column:1 / -1}
      @media (max-width:560px){.gw-form{grid-template-columns:1fr}}`;
    document.head.appendChild(st);
  }

  /** Sales MER from a tile's own revenue and spend, or null when no giveaway spend sits in the window. */
  function salesMer(g, sales, spend) {
    const gs = g && g.window ? +g.window.giveaway_spend || 0 : 0;
    return gs > 0 && sales != null && spend > gs ? sales / (spend - gs) : null;
  }

  const STATUS = { on_track: 'good', over_max: 'bad', no_entries: 'warn', no_spend: '', not_started: '' };
  function homeCard(g, cur) {
    if (!g) return '';
    css();
    const t = g.to_date || {}, w = g.window || {};
    const cpeTone = t.cost_per_entry == null || g.max_cost_per_entry == null ? '' : t.cost_per_entry <= g.max_cost_per_entry ? 'good' : 'bad';
    const pace = t.pace, paceTone = pace == null ? '' : pace >= 0.85 ? 'good' : pace >= 0.6 ? 'warn' : 'bad';
    const goalBar = t.entries_goal ? `<div class="gw-trk" title="${esc(`${int(t.entries)} of ${int(t.entries_goal)}; ${int(t.expected_entries)} expected by now`)}"><i style="width:${Math.min(100, (t.entries || 0) / t.entries_goal * 100).toFixed(1)}%;background:var(--${paceTone || 'brand'})"></i></div>` : '';
    const status = `<span class="v2pill ${STATUS[g.status] || ''}">${esc(g.status_text || '')}</span>`;
    const head = `${esc(g.name)}, ${nice(g.start)} to ${nice(g.end)}. List building for Black Friday, judged on what each entry costs, not on MER.`;
    const body = `<div class="gw-grid">
        <div class="gw-k"><span class="l">Giveaway spend</span><span class="v">${m0(t.giveaway_spend, cur)}</span><span class="s">since ${nice(g.start)}${t.budget_to_date ? `, ${Math.round((t.spend_vs_budget || 0) * 100)}% of the ${m0(g.daily_budget, cur)}/day budget` : ''}</span></div>
        <div class="gw-k"><span class="l">Entries</span><span class="v">${int(t.entries)}</span><span class="s">${esc(SOURCE[t.entries_source] || '')}</span></div>
        <div class="gw-k"><span class="l">Cost per entry</span><span class="v ${cpeTone}">${m2(t.cost_per_entry, cur)}</span><span class="s">most to pay ${m2(g.max_cost_per_entry, cur)}</span></div>
        <div class="gw-k"><span class="l">Pace to goal</span><span class="v ${paceTone}">${pace == null ? '–' : `${Math.round(pace * 100)}%`}</span><span class="s">${t.entries_goal ? `${int(t.expected_entries)} expected by now, goal ${int(t.entries_goal)}` : 'no entries goal set'}</span>${goalBar}</div>
      </div>
      ${w.giveaway_spend > 0 ? `<p class="gw-note">In this window: ${m0(w.giveaway_spend, cur)} giveaway spend and ${m0(w.sales_spend, cur)} sales spend. Sales MER ${x2(w.sales_mer)} against the ${x2(g.floor)} floor; ${x2(w.blended_mer)} counting the giveaway.</p>` : ''}
      ${t.entries_note ? `<p class="gw-note">${esc(t.entries_note)}</p>` : ''}
      <p class="gw-note">${esc(g.payback && g.payback.text || '')}</p>`;
    const C = U().card;
    return C ? C('Giveaway', head, body, status) : `<div class="v2card"><h3>Giveaway</h3><p class="v2hint">${head}</p>${body}</div>`;
  }

  function metaLine(g, cur) {
    if (!g || !g.window || !(g.window.giveaway_spend > 0)) return '';
    const w = g.window;
    return `<p class="v2say">${m0(w.giveaway_spend, cur)} of this went to the giveaway (${esc(g.name)}), which is judged on cost per entry${g.to_date && g.to_date.cost_per_entry != null ? ` (${m2(g.to_date.cost_per_entry, cur)} each, most to pay ${m2(g.max_cost_per_entry, cur)})` : ''}. Sales spend ${m0(w.sales_spend, cur)}: Sales MER ${x2(w.sales_mer)} against the ${x2(g.floor)} floor, ${x2(w.blended_mer)} counting the giveaway.</p>`;
  }

  /* ---------------- Home > Goals ---------------- */
  const ymDays = ym => new Date(+ym.slice(0, 4), +ym.slice(5, 7), 0).getDate();
  function daysIn(cfg, ym) {
    if (!cfg || !cfg.start || !cfg.end) return 0;
    const f = `${ym}-01`, t = `${ym}-${String(ymDays(ym)).padStart(2, '0')}`;
    const a = cfg.start > f ? cfg.start : f, b = cfg.end < t ? cfg.end : t;
    return a <= b ? Math.round((Date.parse(b + 'T12:00:00Z') - Date.parse(a + 'T12:00:00Z')) / 864e5) + 1 : 0;
  }

  async function goalsCard(host, h) {
    if (!host || !h || !h.act || h.act === 'all') return;
    css();
    let d; try { d = await h.api(`/api/giveaway?act=${encodeURIComponent(h.act)}`); } catch (e) { return; }
    if (h.alive && !h.alive()) return;
    const old = host.querySelector('#gwCard'); if (old) old.remove();
    const el = document.createElement('div'); el.className = 'card'; el.id = 'gwCard';
    const cur = d.currency, g = d.giveaway, ym = h.month || new Date().toISOString().slice(0, 7);
    const planSales = h.sales != null ? +h.sales : null;
    const cap = planSales ? planSales / d.floor : null;
    const gDays = g ? daysIn(g, ym) : 0, gBudget = g && g.daily_budget ? g.daily_budget * gDays : null;
    const capLine = `<p style="margin:0 0 6px"><b>Sales spend cap at the MER floor:</b> ${cap != null ? `${m0(cap, cur)} for ${esc(new Date(ym + '-15T12:00:00').toLocaleDateString('en-US', { month: 'long' }))}` : 'set the month\'s revenue above to see it'} (planned revenue ÷ the ${x2(d.floor)} floor). Sales MER = revenue ÷ every ad dollar except the giveaway.</p>`
      + (g ? `<p style="margin:0 0 6px"><b>Giveaway budget, separate:</b> ${gBudget != null ? `${m0(gBudget, cur)} (${m0(g.daily_budget, cur)}/day x ${gDays} day${gDays === 1 ? '' : 's'} this month)` : 'no daily budget set'}. Judged on cost per entry, never on MER.</p>` : '');
    const info = g ? `<div class="gw-grid">
        <div class="gw-k"><span class="l">Dates</span><span class="v" style="font-size:16px">${nice(g.start)} to ${nice(g.end)}</span><span class="s">${esc(g.name)}</span></div>
        <div class="gw-k"><span class="l">Most to pay per entry</span><span class="v">${m2(d.max_cost_per_entry, cur)}</span><span class="s">${Math.round((g.buy_rate || 0) * 1000) / 10}% buy x ${m0(g.aov, cur)} AOV ÷ ${x2(d.floor)}</span></div>
        <div class="gw-k"><span class="l">Entries goal</span><span class="v">${int(g.entries_goal)}</span><span class="s">${g.daily_budget ? `${m0(g.daily_budget, cur)}/day budget` : 'no daily budget'}</span></div>
        <div class="gw-k"><span class="l">Entries counted from</span><span class="v" style="font-size:16px">${g.klaviyo_list_id ? 'Klaviyo list' : 'Meta leads'}</span><span class="s">${g.klaviyo_list_id ? `list ${esc(g.klaviyo_list_id)}${d.klaviyo_connected ? '' : ', but no Klaviyo key in Locus'}` : 'set a Klaviyo list to count real sign-ups'}</span></div>
      </div>
      <p class="gw-note">Giveaway spend = Meta campaigns whose name holds ${['giveaway', 'leads'].concat(g.extra_terms || []).map(t => `“${esc(t)}”`).join(', ')}${g.match_objective ? ', or with a leads objective' : ''}, between the dates. Google and every other platform stay sales spend.</p>` : '<p class="hint" style="margin:6px 0 0">No giveaway for this brand. Add one when spend goes to collecting email and SMS sign-ups (a giveaway or a lead campaign), so it stops counting against MER.</p>';
    el.innerHTML = `<div class="row" style="justify-content:space-between;align-items:center;gap:10px;margin:0 0 4px"><h3 style="margin:0">Giveaway / list building</h3>
        <span><button class="btn" id="gwEdit">${g ? 'Edit' : 'Add a giveaway'}</button>${g ? ' <button class="btn quiet" id="gwDel">Remove</button>' : ''}</span></div>
      <p class="hint" style="margin:0 0 10px">Spend that buys email and SMS entries is kept out of MER and judged on what each entry costs. The money comes back on Black Friday.</p>
      ${capLine}${info}<span class="tiny" id="gwMsg"></span>`;
    host.appendChild(el);
    el.querySelector('#gwEdit').onclick = () => editModal(d, h, () => goalsCard(host, h));
    const del = el.querySelector('#gwDel');
    if (del) del.onclick = async () => {
      const ok = typeof window.confirmModal === 'function' ? await window.confirmModal('Remove this giveaway?', 'Its spend counts as sales spend again everywhere (MER, briefs, reports). Nothing on Meta changes.', 'Remove it') : true;
      if (!ok) return;
      try { await h.api(`/api/giveaway?act=${encodeURIComponent(h.act)}`, { method: 'DELETE' }); goalsCard(host, h); if (h.refresh) h.refresh(); }
      catch (e) { el.querySelector('#gwMsg').textContent = e.message; }
    };
  }

  function editModal(d, h, done) {
    const g = d.giveaway || {}, cur = d.currency;
    const w = document.createElement('div'); w.className = 'modal-wrap';
    const f = (k, label, hint, val, type = 'text', cls = '') => `<label class="${cls}"><b>${label}</b>${hint ? `<small>${hint}</small>` : ''}<input type="${type}" data-k="${k}" value="${esc(val == null ? '' : val)}"${type === 'text' ? ' autocomplete="off"' : ''}></label>`;
    w.innerHTML = `<div class="modal" style="max-width:640px"><h3>${d.giveaway ? 'Edit the giveaway' : 'Add a giveaway'}: ${esc(d.name)}</h3>
      <p class="hint">Spend on the giveaway is kept out of MER (the ${x2(d.floor)} floor applies to everything else) and judged on cost per entry. The most to pay per entry = the share of entries that buy x the average order ÷ the floor.</p>
      <div class="gw-form">
        ${f('name', 'Name', '', g.name || `${d.name} giveaway`, 'text', 'full')}
        ${f('start', 'Starts', '', g.start, 'date')}${f('end', 'Ends', '', g.end, 'date')}
        ${f('daily_budget', `Daily budget (${esc(sym(cur).trim())})`, 'what the giveaway should spend a day', g.daily_budget)}
        ${f('entries_goal', 'Entries goal', 'sign-ups wanted by the end', g.entries_goal)}
        ${f('buy_rate', 'Share of entries that buy (%)', 'e.g. 3 for 3%', g.buy_rate != null ? Math.round(g.buy_rate * 1000) / 10 : '')}
        ${f('aov', `Average order (${esc(sym(cur).trim())})`, '', g.aov)}
        ${f('mer_floor', 'MER floor', `blank = ${x2(d.floor)}, the brand's floor`, g.mer_floor)}
        ${f('extra_terms', 'More words to match', 'campaign names holding these count too, comma separated', (g.extra_terms || []).join(', '))}
        <label class="full" style="flex-direction:row;align-items:center;gap:8px"><input type="checkbox" data-k="match_objective"${g.match_objective === 0 ? '' : ' checked'}><span>Also count every campaign with a leads objective (Meta's Leads goal)</span></label>
        ${f('klaviyo_list_id', 'Klaviyo list id for entries', d.klaviyo_connected ? 'the list people join when they enter; its member count is the entries' : 'needs the brand\'s Klaviyo key in Brand settings > Integrations', g.klaviyo_list_id)}
        ${f('list_baseline', 'List size before the giveaway', 'members already on that list at the start (0 for a new list)', g.list_baseline || '')}
        ${f('payback_segment_id', 'Payback segment id (after Cyber Monday)', 'a Klaviyo segment: on the entries list AND placed an order Nov 1 to 30', g.payback_segment_id, 'text', 'full')}
      </div>
      <p class="tiny" id="gwmMsg" style="min-height:1.2em"></p>
      <div class="row" style="justify-content:flex-end;gap:8px;margin:8px 0 0"><button class="btn" data-m="no">Cancel</button><button class="btn primary" data-m="yes">Save</button></div></div>`;
    document.body.appendChild(w);
    const close = () => { w.remove(); document.removeEventListener('keydown', key); };
    const key = e => { if (e.key === 'Escape') close(); };
    document.addEventListener('keydown', key);
    w.addEventListener('mousedown', e => { if (e.target === w) close(); });
    w.querySelector('[data-m="no"]').onclick = close;
    w.querySelector('[data-m="yes"]').onclick = async () => {
      const body = { act: h.act };
      w.querySelectorAll('[data-k]').forEach(i => { body[i.dataset.k] = i.type === 'checkbox' ? i.checked : i.value; });
      const msg = w.querySelector('#gwmMsg'); msg.textContent = 'Saving…';
      try { await h.api('/api/giveaway', { method: 'PUT', body: JSON.stringify(body) }); close(); done(); if (h.refresh) h.refresh(); }
      catch (e) { msg.textContent = e.message; }
    };
  }

  window.GiveawayUI = { homeCard, metaLine, salesMer, goalsCard };
})();

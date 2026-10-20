/* THE LEAK FINDER, the screens (2026-10-13, docs/handoffs/leak-finder.md, approved mock
 * https://claude.ai/artifact/BiKJGU8QkUFmCEMr1q5PFz). One list per brand from account-health GET /api/leaks (src/leaks.js),
 * drawn two ways:
 *   window.LeaksCard.top(host, H, page)   the top of Ads > Google, Meta, TikTok, Store > Website and Email: that page's
 *                                         top 3 leaks, ranked by money a month. NOTHING is drawn when the page has no leak.
 *   window.LeaksCard.full(host, H)        Home > Overview: one brand = every leak (top 3, Show all); All clients = brands(): each brand's biggest leak.
 * Search negatives carry "Add negative" (one term) and "Add all N": an in-app modal shows the change after Google has
 * validated it (validateOnly), then writes it; the toast carries Undo. Colours are v2 tokens only. */
(function () {
  let H = null;
  const PAGE = { google: ['google_search', 'google_pmax', 'google_video'], gterms: ['google_search', 'google_pmax'], meta: ['meta'], tiktok: ['tiktok'], website: ['funnel', 'landing_page'], email: ['email'] };
  const AREA = { google_search: ['Search terms', '--c-google'], google_pmax: ['Performance Max', '--c-google'], google_video: ['YouTube and Demand Gen', '--c-google'], meta: ['Meta', '--c-meta'], tiktok: ['TikTok', '--c-tiktok'], funnel: ['Funnel', '--c-else'], landing_page: ['Landing page', '--c-else'], email: ['Email', '--c-email'] };
  const AREA_NAME = { google: 'Google Ads', meta: 'Meta', tiktok: 'TikTok', funnel: 'Funnel (GA4)', landing_page: 'Landing pages (GA4)', email: 'Email (Klaviyo)' };
  const GO_LABEL = { gterms: 'Search terms', gcampaigns: 'Campaigns', today: 'Today’s calls', tiktok: 'TikTok', website: 'Website', email: 'Email' };
  const PAGE_TITLE = { google: 'Where Google is leaking', gterms: 'Searches to block', meta: 'Where Meta is leaking', tiktok: 'Where TikTok is leaking', website: 'Where the site is leaking', email: 'Where email is leaking' };
  const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const sym = c => (!c || c === 'USD' ? '$' : c === 'GBP' ? '£' : c === 'EUR' ? '€' : c === 'CAD' ? 'CA$' : c === 'AUD' ? 'A$' : c + ' ');
  const km = (n, c) => n == null ? '–' : Math.abs(n) >= 1e4 ? `${sym(c)}${(n / 1e3).toFixed(1)}K` : `${sym(c)}${Math.round(n).toLocaleString('en-US')}`;
  const m2 = (n, c) => `${sym(c)}${(+n || 0).toFixed(2)}`;
  const CACHE = new Map();   // act -> {at, p}

  function css() {
    if (document.getElementById('lxLkCss')) return;
    const s = document.createElement('style'); s.id = 'lxLkCss';
    s.textContent = `
.lk-card{display:flex;flex-direction:column;gap:10px}
.lk-row{display:grid;grid-template-columns:96px minmax(0,1fr) auto;gap:14px;padding:12px 0;border-top:1px solid var(--line);align-items:start}
.lk-rows>.lk-row:first-child{border-top:0;padding-top:2px}
.lk-cost{font-weight:650;font-size:17px;letter-spacing:-.01em;line-height:1.2;color:var(--ink)}
.lk-cost small{display:block;font-size:11px;font-weight:500;color:var(--muted);letter-spacing:0;margin-top:2px}
.lk-bar{height:4px;border-radius:2px;background:var(--surface-2);margin-top:7px;overflow:hidden}.lk-bar i{display:block;height:100%;background:var(--bad);border-radius:2px}
.lk-body{display:flex;flex-direction:column;gap:4px;min-width:0}
.lk-t{font-weight:600;color:var(--ink);display:flex;gap:8px;align-items:baseline;flex-wrap:wrap}
.lk-chip{display:inline-flex;align-items:center;gap:6px;font-size:11px;font-weight:600;padding:2px 8px;border-radius:999px;background:var(--surface-2);color:var(--ink-2);white-space:nowrap}
.lk-chip i{width:7px;height:7px;border-radius:50%;display:inline-block}
.lk-kv{color:var(--ink-2);font-size:12.5px;overflow-wrap:anywhere}.lk-kv em{font-style:normal;color:var(--muted);margin-right:4px}
.lk-fix{font-size:12.5px;color:var(--ink)}.lk-fix em{font-style:normal;color:var(--good);font-weight:600;margin-right:4px}
.lk-who{font-size:11.5px;color:var(--muted)}
.lk-act{display:flex;flex-direction:column;gap:6px;align-items:flex-end}
.lk-terms{border:1px solid var(--line);border-radius:8px;overflow-x:auto;margin-top:6px}
.lk-terms table{width:100%;border-collapse:collapse;font-size:12.5px;min-width:480px}
.lk-terms th{text-align:left;font-weight:600;color:var(--muted);font-size:11px;letter-spacing:.04em;text-transform:uppercase;padding:7px 10px;border-bottom:1px solid var(--line)}
.lk-terms td{padding:7px 10px;border-bottom:1px solid var(--line);vertical-align:top}.lk-terms tr:last-child td{border-bottom:0}
.lk-terms td.n{text-align:right;white-space:nowrap}.lk-terms .why{color:var(--muted)}
.lk-terms tr.done td{opacity:.5}.lk-terms tr.done .lk-add{display:none}
.lk-link{color:var(--brand);font-weight:600;font-size:12.5px;background:none;border:0;padding:0;cursor:pointer;font-family:inherit}
.lk-link:hover{text-decoration:underline}
.lk-more{display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;border-top:1px solid var(--line);padding-top:10px;color:var(--muted);font-size:12.5px}
.lk-status{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:8px;margin-top:4px}
.lk-st{background:var(--surface-2);border-radius:8px;padding:9px 11px;font-size:12.5px;color:var(--ink-2);display:flex;flex-direction:column;gap:2px;min-width:0}
.lk-st b{color:var(--ink);font-weight:600;display:flex;gap:6px;align-items:center}
.lk-dot{width:7px;height:7px;border-radius:50%;display:inline-block;flex:none}
.lk-ba{display:grid;grid-template-columns:1fr auto 1fr;gap:10px;align-items:center;background:var(--surface-2);border-radius:8px;padding:10px 12px;font-size:12.5px;margin:8px 0}
.lk-ba span{display:block;color:var(--muted);font-size:11px;text-transform:uppercase;letter-spacing:.05em;font-weight:600}
.lk-okline{display:flex;gap:8px;align-items:center;color:var(--good);font-weight:600;font-size:12.5px;margin:6px 0}
.lk-v.bad{background:var(--bad-bg);color:var(--bad)}.lk-v.warn{background:var(--warn-bg);color:var(--warn)}.lk-v.good{background:var(--good-bg);color:var(--good)}.lk-v.off{background:var(--surface-2);color:var(--muted)}
.lk-ctx{font-size:12.5px;color:var(--ink);background:var(--surface-2);border-radius:6px;padding:6px 9px;overflow-wrap:anywhere}.lk-ctx em{font-style:normal;color:var(--brand);font-weight:600;margin-right:4px}
.lk-root{color:var(--muted);font-size:11.5px}
.lk-pb{font-size:11.5px;color:var(--muted)}
.lk-ls{border-top:1px solid var(--line);padding-top:10px;font-size:12.5px;color:var(--ink-2)}.lk-ls summary{cursor:pointer;font-weight:600;color:var(--ink)}
.lk-ls ul{list-style:none;margin:8px 0 0;padding:0;display:flex;flex-direction:column;gap:10px}.lk-ls li{display:flex;flex-direction:column;gap:3px;align-items:flex-start}
.lk-form{display:grid;grid-template-columns:1fr 1fr;gap:10px}.lk-form label{display:flex;flex-direction:column;gap:4px;font-size:12px;font-weight:600;color:var(--ink-2)}.lk-form .wide,.lk-form .chk{grid-column:1/-1}
.lk-form .chk{flex-direction:row;align-items:center;gap:8px;font-weight:500}
.lk-form select,.lk-form textarea{font:inherit;font-weight:400;color:var(--ink);background:var(--surface);border:1px solid var(--line-strong);border-radius:8px;padding:7px 9px}
@media (max-width:640px){.lk-form{grid-template-columns:1fr}}
.lk-ai{display:flex;gap:12px;align-items:flex-start;justify-content:space-between;flex-wrap:wrap;background:var(--surface-2);border-radius:8px;padding:9px 11px}.lk-ai p{flex:1 1 320px;min-width:0}
.lk-call{display:flex;gap:8px;flex-wrap:wrap;margin-top:4px}
.lk-group{border-top:1px solid var(--line);padding-top:10px;display:flex;flex-direction:column;gap:4px}.lk-group h4{margin:0;font-size:13px;font-weight:650}
.lk-btbl{width:100%;border-collapse:collapse;font-size:12.5px}.lk-btbl th{text-align:left;color:var(--muted);font-weight:600;font-size:11px;letter-spacing:.04em;text-transform:uppercase;padding:7px 10px;border-bottom:1px solid var(--line)}
.lk-btbl td{padding:8px 10px;border-bottom:1px solid var(--line);vertical-align:top}.lk-btbl .n{text-align:right;white-space:nowrap}.lk-btbl tr.link{cursor:pointer}.lk-btbl tr.link:hover td{background:var(--surface-2)}
.lk-list{margin:6px 0;padding-left:18px;font-size:12.5px;color:var(--ink-2);max-height:220px;overflow:auto}
@media (max-width:640px){.lk-row{grid-template-columns:minmax(0,1fr);gap:8px}.lk-act{flex-direction:row;align-items:center;justify-content:flex-start}.lk-ba{grid-template-columns:1fr}}`;
    document.head.appendChild(s);
  }

  /* fresh = true re-reads the plain list; fresh = 'ai' runs the AI check (about 6 cents a brand, the button). */
  async function load(act, fresh) {
    const hit = CACHE.get(act);
    if (!fresh && hit && Date.now() - hit.at < 5 * 60e3) return hit.p;
    const p = H.apiAH(`/api/leaks?act=${encodeURIComponent(act)}&days=30${fresh === 'ai' ? '&ai=1' : fresh ? '&fresh=1' : ''}`);
    CACHE.set(act, { at: Date.now(), p });
    p.catch(() => CACHE.delete(act));
    return p;
  }

  let CHECKED = null;   // the date of the AI check whose words are on screen (set by each draw)
  function row(l, cur, max) {
    const [an, ac] = AREA[l.area] || [l.area, '--c-else'];
    const neg = l.apply && l.apply.kind === 'negative';
    const items = (l.items || []);
    const terms = neg ? `<div class="lk-terms"><table><thead><tr><th>Search</th><th>Why it is waste</th><th class="n">Spend</th><th></th></tr></thead><tbody>${items.map((x, i) => `<tr data-i="${i}"><td>${esc(x.term)}<div class="lk-who">${esc(x.campaign)}</div></td><td class="why">${esc(x.why)}</td><td class="n">${m2(x.spend, cur)}</td><td class="n"><button type="button" class="lk-link lk-add" data-lk="${esc(l.id)}" data-i="${i}">Add negative</button></td></tr>`).join('')}</tbody></table></div>`
      : l.area === 'google_pmax' && items.length ? `<div class="lk-terms"><table><thead><tr><th>Search category</th><th>Why it is waste</th><th class="n">Clicks</th><th class="n">Est. cost</th></tr></thead><tbody>${items.map(x => `<tr><td>${esc(x.label)}<div class="lk-who">${esc(x.campaign)}</div></td><td class="why">${esc(x.why)}</td><td class="n">${x.clicks}</td><td class="n">${x.est != null ? m2(x.est, cur) : '–'}</td></tr>`).join('')}</tbody></table></div>` : '';
    const btn = neg ? `<button type="button" class="btn primary lk-all" data-lk="${esc(l.id)}">Add all ${items.length}</button>`
      : l.go ? `<button type="button" class="btn" data-lkgo="${esc(l.go)}">${esc(GO_LABEL[l.go] || 'Open')} ›</button>` : '';
    const w = l.cost != null && max ? Math.max(1, Math.round(l.cost / max * 100)) : 0;
    return `<div class="lk-row" data-id="${esc(l.id)}">
      <div class="lk-cost"${l.cost_how ? ` title="${esc(l.cost_how)}"` : ''}>${l.cost == null ? '–' : km(l.cost, cur)}<small>${l.cost == null ? 'not priced' : 'a month, est.'}</small>${l.cost != null ? `<div class="lk-bar"><i style="width:${w}%"></i></div>` : ''}</div>
      <div class="lk-body">
        <div class="lk-t"><span class="lk-chip"><i style="background:var(${ac})"></i>${esc(an)}</span>${VERDICT[l.verdict] ? `<span class="lk-chip lk-v ${VERDICT[l.verdict][1]}">${VERDICT[l.verdict][0]}</span>` : ''}${esc(l.title)}</div>
        ${l.why_ctx ? `<div class="lk-ctx"><em>Across channels${CHECKED ? ` (AI check, ${esc(CHECKED)})` : ''}</em>${esc(l.why_ctx)}${l.root ? ` <span class="lk-root">Same root: ${esc(l.root)}</span>` : ''}</div>` : ''}
        ${l.check ? `<div class="lk-kv"><em>Before you act</em>${esc(l.check)}</div>` : ''}
        <div class="lk-kv"><em>Measured</em>${esc(l.number)}</div>
        <div class="lk-kv"><em>Good looks like</em>${esc(l.benchmark)}</div>
        ${terms}
        <div class="lk-fix"><em>Suggestion</em>${esc(l.fix)}</div>
        <div class="lk-who">${esc(l.who || '')}${l.cost_how ? ` · cost = ${esc(l.cost_how)}` : ''}</div>
      </div>
      <div class="lk-act">${btn}${isClient() ? '' : `<button type="button" class="lk-link lk-task" data-lktask="${esc(l.id)}">Make it a task</button><button type="button" class="lk-link lk-call" data-lkcall="${esc(l.id)}" title="Open this brand's client call with this leak on it">Put it on the call</button>`}<button type="button" class="lk-link lk-pb" data-lkpb="${esc(l.id)}">Push back</button></div>
    </div>`;
  }

  /* The cross-check's verdict on a leak (account-health leakctx.js review). */
  const VERDICT = { real: ['Worth doing', 'bad'], check_first: ['Check first', 'warn'], not_the_cause: ['Look elsewhere first', 'off'], measurement: ['Check the numbers', 'warn'] };
  const LSTAT = { holds: ['Holds', 'good'], partly: ['Partly', 'warn'], does_not_hold: ['Does not hold', 'bad'], open: ['Not judged yet', 'off'] };
  const TEAM = ['Cole', 'Ahsan', 'Noma', 'William', 'Ravo', 'Radhesh', 'Hamza'];
  const ROLES = ['Google buyer', 'Meta buyer', 'Web dev', 'Strategist', 'Email', 'The client'];
  const roleFor = area => /^google_/.test(area) ? 'Google buyer' : area === 'meta' ? 'Meta buyer' : area === 'funnel' || area === 'landing_page' ? 'Web dev' : area === 'email' ? 'Email' : 'Strategist';
  /* THE FINAL CALL: Locus judges a pushback once and never argues again. When it does not fully agree, a person decides
     whose view stands; the lists follow that. */
  const needsCall = x => (x.status === 'partly' || x.status === 'does_not_hold') && !x.decision;
  const callButtons = id => `<span class="lk-call"><button type="button" class="btn" data-lkdec="team" data-id="${esc(id)}">Go with the team</button><button type="button" class="btn" data-lkdec="locus" data-id="${esc(id)}">Go with Locus</button></span>`;
  function finalCall(x) {
    if (x.decision) return `<span class="lk-kv"><em>Final call</em>${x.decision === 'team' ? 'the team’s view stands; the leak finder follows it' : 'Locus’s view stands; the leak keeps showing, with the team’s view beside it'}${x.decided_by ? ` (${esc(String(x.decided_by).split('@')[0])}${x.decided_at ? `, ${esc(new Date(x.decided_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }))}` : ''})` : ''}</span>`;
    return needsCall(x) ? `<span class="lk-kv"><em>Final call needed</em>Locus does not fully agree. Whose view stands?</span>${callButtons(x.id)}` : '';
  }
  function aiBar(d) {
    const c = d.ai_check, client = H.S.role === 'client';
    const when = c && c.at ? new Date(c.at).toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'America/Chicago' }) : null;
    const cost = c && c.usd != null ? ` (${Math.max(1, Math.round(c.usd * 100))} cents)` : '';
    const btn = client ? '' : `<button type="button" class="btn" data-lkai="1">${c ? 'Run the AI check again' : 'Run the AI check'} (about 6 cents)</button>`;
    return `<div class="lk-ai"><p class="v2hint" style="margin:0">${when
      ? `AI check: ${esc(when)} Central${cost}. It read each leak against the other channels, the tracking, the Change Log and the team’s lessons. Worth doing = a good next step. Check first = rule one thing out before acting. Look elsewhere first = the number is true, but I’d suggest fixing what it points to first. Check the numbers = the number itself may be off. These are suggestions; the calls stay yours.${d.reviewed ? '' : ' Leaks that came in since are not cross-checked yet.'}`
      : 'Not cross-checked yet. This list is the plain rules, free. The AI check reads every leak against the other channels and judges new search terms, about 6 cents a brand; it also runs on its own every Monday.'}</p>${btn}</div>`;
  }
  function lessons(d) {
    const L = d.lessons || [];
    if (!L.length) return `<details class="lk-ls"><summary>What the team taught it (0)</summary><p class="v2hint" style="margin:6px 0 0">Nothing yet. When someone disagrees with a leak, press Push back on it: Locus saves what they said, checks it against the data, and every later list follows it or shows both sides.</p></details>`;
    return `<details class="lk-ls"><summary>What the team taught it (${L.length})</summary><ul>${L.map(x => { const [t, c] = LSTAT[x.status] || LSTAT.open; return `<li><span><span class="lk-chip lk-v ${c}">${t}</span> <b>${esc(x.author || 'The team')}${x.role ? `, ${esc(x.role)}` : ''}</b>${x.act_id ? '' : ' <span class="faint">(every brand)</span>'}: "${esc(x.text)}"</span>${x.why ? `<span class="lk-kv">${esc(x.why)}</span>` : ''}${x.rule ? `<span class="lk-kv"><em>Locus's rule</em>${esc(x.rule)}</span>` : ''}${finalCall(x)}<button type="button" class="lk-link lk-ldel" data-lkdel="${esc(x.id)}">Remove</button></li>`; }).join('')}</ul></details>`;
  }
  function pushBack(a, d, l, redraw) {
    const client = H.S.role === 'client', role = roleFor(l.area);
    const m = modal('Push back on this leak', `<p style="margin:0 0 10px"><b>${esc(l.title)}</b></p>
      <p class="v2hint" style="margin:0 0 10px">Say who disagrees and why. Locus saves it, checks it against the data and how the platform works, tells you whether it holds, and every later list follows it or shows both sides.</p>
      <div class="lk-form">
        <label>Who says so<select name="author">${TEAM.map(n => `<option>${n}</option>`).join('')}<option value="">Someone else</option></select></label>
        <label>Their role<select name="role">${ROLES.map(n => `<option${n === role ? ' selected' : ''}>${n}</option>`).join('')}</select></label>
        <label class="wide">What they said<textarea name="text" rows="4" maxlength="1200" placeholder="e.g. That page is brand new; give it two weeks before judging it."></textarea></label>
        ${client ? '' : '<label class="chk"><input type="checkbox" name="all"> It applies to every brand, not just this one</label>'}
      </div>`, 'Save and check it', async ({ close, msg, w }) => {
      const text = w.querySelector('[name="text"]').value.trim();
      if (text.length < 8) { msg('Say what they said, in a sentence.', true); return; }
      msg('Saving, then checking it against the data (about 15 seconds)...');
      const r = await post('/api/leaks/lesson', { act: a.act_id, leak_id: l.id, text, author: w.querySelector('[name="author"]').value, role: w.querySelector('[name="role"]').value, scope: w.querySelector('[name="all"]')?.checked ? 'all' : 'brand' }).catch(e => ({ error: e.message }));
      if (r.error && !r.id) { msg(r.error, true); return; }
      close();
      const [t, c] = LSTAT[r.status] || LSTAT.open;
      const ask = r.status === 'partly' || r.status === 'does_not_hold';
      const sm = modal('Saved', `<p style="margin:0 0 8px"><span class="lk-chip lk-v ${c}">${t}</span></p>${r.why ? `<p style="margin:0 0 8px">${esc(r.why)}</p>` : ''}${r.rule ? `<p class="lk-kv" style="margin:0"><em>Locus's rule</em>${esc(r.rule)}</p>` : ''}${r.error ? `<p class="v2hint">Not checked yet: ${esc(r.error)}. It is saved and will be weighed anyway.</p>` : ''}
        ${ask ? `<p style="margin:12px 0 6px"><b>Locus does not fully agree. Whose view stands?</b></p><p class="v2hint" style="margin:0 0 8px">Locus says its piece once and never argues again. Go with the team: every later list follows the team. Go with Locus: the leak keeps showing, with the team's view beside it. You can also decide later in What the team taught it.</p>${callButtons(r.id)}` : '<p class="v2hint" style="margin:10px 0 0">Every later list follows it.</p>'}`, null);
      wireCalls(document.querySelector('.modal-wrap:last-of-type'), a, () => { sm.close(); CACHE.delete(a.act_id); redraw(true); });
      CACHE.delete(a.act_id); redraw(true);
    });
    return m;
  }

  function wireCalls(root, a, after) {
    (root || document).querySelectorAll('[data-lkdec]').forEach(b => b.onclick = async () => {
      b.disabled = true;
      const r = await post('/api/leaks/decide', { act: a.act_id, id: b.dataset.id, decision: b.dataset.lkdec }).catch(e => ({ error: e.message }));
      if (r.error) { b.disabled = false; toast(r.error); return; }
      toast(b.dataset.lkdec === 'team' ? 'Final call recorded: the team’s view stands.' : 'Final call recorded: Locus’s view stands.');
      after();
    });
  }
  function status(d) {
    const A = d.areas || {}, out = [];
    const tone = st => st === 'ok' ? 'var(--good)' : st === 'error' ? 'var(--bad)' : st === 'thin' || st === 'not_linked' ? 'var(--warn)' : 'var(--muted)';
    const said = st => st === 'not_linked' ? 'not connected' : st === 'error' ? 'did not answer' : st === 'thin' ? 'not enough data yet' : st === 'off' ? 'not used' : '';
    for (const k of ['google', 'meta', 'tiktok', 'funnel', 'landing_page', 'email']) {
      const a = A[k]; if (!a) continue;
      const n = (d.leaks || []).filter(l => (k === 'google' ? /^google_/.test(l.area) : l.area === k)).length;
      const line = a.note || (a.state === 'ok' ? (n ? `${n} leak${n === 1 ? '' : 's'} found.` : 'Checked: nothing leaking.') : '');
      out.push(`<div class="lk-st"><b><i class="lk-dot" style="background:${tone(a.state)}"></i>${esc(AREA_NAME[k])}${said(a.state) ? `<span class="faint" style="font-weight:500">, ${said(a.state)}</span>` : ''}</b>${esc(line)}</div>`);
    }
    return `<div class="lk-status" aria-label="What was checked">${out.join('')}</div>`;
  }

  function wire(host, d, a, redraw) {
    host.querySelectorAll('[data-lkgo]').forEach(b => b.onclick = () => H.show(b.dataset.lkgo));
    host.querySelectorAll('.lk-add').forEach(b => b.onclick = () => { const l = d.leaks.find(x => x.id === b.dataset.lk); addOne(a, d, l.items[+b.dataset.i], redraw); });
    host.querySelectorAll('.lk-all').forEach(b => b.onclick = () => { const l = d.leaks.find(x => x.id === b.dataset.lk); addAll(a, d, l, redraw); });
    host.querySelectorAll('[data-lkall]').forEach(b => b.onclick = () => { host.dataset.all = '1'; redraw(); });
    host.querySelectorAll('[data-lkhome]').forEach(b => b.onclick = () => H.show('leaks'));
    host.querySelectorAll('[data-lkpb]').forEach(b => b.onclick = () => { const l = d.leaks.find(x => x.id === b.dataset.lkpb); if (l) pushBack(a, d, l, redraw); });
    host.querySelectorAll('[data-lktask]').forEach(b => b.onclick = () => { const l = d.leaks.find(x => x.id === b.dataset.lktask); if (l) makeTask(a, l, b); });
    host.querySelectorAll('[data-lkcall]').forEach(b => b.onclick = () => { const l = d.leaks.find(x => x.id === b.dataset.lkcall); if (!l) return;
      /* callscreen.js reads CCALL_ADD when the client call opens and adds the line under "This week" (promised). */
      window.CCALL_ADD = { act: a.act_id, text: `Fix: ${l.title}${l.fix ? '. ' + l.fix : ''}`, source: 'leak', source_id: l.id };
      if (H.S && H.S.act !== a.act_id) { H.S.act = a.act_id; try { localStorage.setItem('pf_act', a.act_id); } catch {} const cp = document.getElementById('clientPick'); if (cp) cp.value = a.act_id; }
      H.show('ccall'); });
    wireCalls(host, a, () => { CACHE.delete(a.act_id); redraw(true); });
    host.querySelectorAll('[data-lkai]').forEach(b => b.onclick = async () => {
      b.disabled = true; b.textContent = 'Checking every leak against the other channels (about 30 seconds)...';
      await redraw('ai');
    });
    host.querySelectorAll('[data-lkdel]').forEach(b => b.onclick = () => modal('Remove this lesson?', '<p style="margin:0">The leak finder stops following it from the next read.</p>', 'Remove', async ({ close, msg }) => {
      const r = await H.apiAH(`/api/leaks/lesson?act=${encodeURIComponent(a.act_id)}&id=${encodeURIComponent(b.dataset.lkdel)}`, { method: 'DELETE' }).catch(e => ({ error: e.message }));
      if (r.error) { msg(r.error, true); return; }
      close(); CACHE.delete(a.act_id); redraw(true);
    }));
  }

  /* ---------- Make it a task (2026-10-20, the kit's connective tissue): one task on Work > Tasks, owner and due
     blank, the leak's number and suggestion as the details, the leak id as the source so the task links back. ---------- */
  function isClient() { return typeof window.isClient === 'function' && window.isClient(); }
  async function makeTask(a, l, b) {
    b.disabled = true; const was = b.textContent; b.textContent = 'Adding...';
    const body = { act: a.act_id, text: l.title, detail: [l.number, l.fix].filter(Boolean).join('. ') + ' From the leak finder.', owner: '', due: '', area: 'ads', kind: 'team', source: 'leak', source_id: l.id };
    const send = o => H.apiAH('/api/actions', { method: 'POST', body: JSON.stringify(o) });
    let r = await send(body).catch(e => ({ error: e.message }));
    if (r && r.error) r = await send({ ...body, source: 'manual' }).catch(e => ({ error: e.message }));
    b.disabled = false; b.textContent = was;
    if (!r || r.error) { toast(`Could not add the task: ${(r && r.error) || 'no answer'}`); return; }
    const id = r.item ? r.item.id : r.id;
    b.textContent = 'On Tasks'; b.disabled = true;
    toast('Added to Tasks', { label: 'Open', run: () => { if (id) window.ACT_OPEN = id; H.show('tasks'); } });
  }

  /* ---------- the modal (in-app, never a browser dialog) ---------- */
  function modal(title, html, ok, onOk) {
    const w = document.createElement('div'); w.className = 'modal-wrap';
    w.innerHTML = `<div class="modal" role="dialog" aria-modal="true" aria-label="${esc(title)}" style="max-width:540px"><h3 style="margin:0 0 8px">${esc(title)}</h3><div>${html}</div><p class="v2hint lk-msg" hidden></p>
      <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:12px"><button type="button" class="btn" data-m="no">${ok ? 'Cancel' : 'Close'}</button>${ok ? `<button type="button" class="btn primary" data-m="yes">${esc(ok)}</button>` : ''}</div></div>`;
    document.body.appendChild(w);
    const k = e => { if (e.key === 'Escape') close(); };
    const close = () => { w.remove(); document.removeEventListener('keydown', k); };
    document.addEventListener('keydown', k);
    w.addEventListener('mousedown', e => { if (e.target === w) close(); });
    w.querySelector('[data-m="no"]').onclick = close;
    const msg = (t, bad) => { const m = w.querySelector('.lk-msg'); m.hidden = !t; m.textContent = t || ''; m.className = 'v2hint lk-msg' + (bad ? ' v2bad' : ''); };
    const yes = w.querySelector('[data-m="yes"]');
    if (yes) yes.onclick = async () => { yes.disabled = true; try { await onOk({ close, msg, w }); } catch (e) { msg(e.message, true); } yes.disabled = false; };
    return { close, msg };
  }
  function toast(text, undo) {
    document.querySelectorAll('.lx-toast.lkt').forEach(x => x.remove());
    const t = document.createElement('div'); t.className = 'lx-toast lkt'; t.setAttribute('role', 'status');
    const lbl = undo && typeof undo === 'object' ? undo.label : 'Undo', run = undo && typeof undo === 'object' ? undo.run : undo;
    t.innerHTML = `<span>${esc(text)}</span>${undo ? `<button type="button">${esc(lbl)}</button>` : ''}`;
    if (undo) t.querySelector('button').onclick = () => { t.remove(); run(); };
    document.body.appendChild(t); setTimeout(() => t.remove(), undo ? 15000 : 4000);
  }
  const post = (path, body) => H.apiAH(path, { method: 'POST', body: JSON.stringify(body) });
  async function addOne(a, d, x, redraw) {
    const m0 = modal('Checking with Google Ads', '<p class="v2hint">Asking Google to check the change first, so nothing is written until you confirm.</p>', null);
    let pv; try { pv = await post('/api/leaks/apply', { act: a.act_id, term: x.term, campaign_id: x.campaign_id }); } catch (e) { pv = { error: e.message }; }
    m0.close();
    if (!pv || pv.error) { modal('Google Ads cannot do this', `<p class="v2bad">${esc(pv?.error || 'No answer.')}</p>`, null); return; }
    modal('Add a negative keyword in Google Ads', `<p style="margin:0">Add <b>"${esc(x.term)}"</b> as an exact negative keyword on <b>${esc(x.campaign)}</b>.</p>
      <div class="lk-ba"><div><span>Now</span>The search can trigger your ads</div><div aria-hidden="true">→</div><div><span>After</span>Blocked on this campaign, exact match only</div></div>
      <p class="lk-kv" style="margin:0">${esc(pv.detail || '')}</p>
      <div class="lk-okline"><i class="lk-dot" style="background:var(--good)"></i>Google checked the change and accepts it.</div>
      <p class="v2hint" style="margin:0">Written to the Change Log as you, in Locus. Undo is on the toast.</p>`, 'Add negative', async ({ close, msg }) => {
      msg('Writing to Google Ads…');
      const r = await post('/api/leaks/apply', { act: a.act_id, term: x.term, campaign_id: x.campaign_id, confirm: true });
      if (r.error) { msg(r.error, true); return; }
      close(); done(a, [r]); redraw(true);
    });
  }
  async function addAll(a, d, l, redraw) {
    const items = l.items.slice();
    modal(`Add ${items.length} negative keyword${items.length === 1 ? '' : 's'} in Google Ads`, `<p style="margin:0">Each becomes an exact negative keyword on its own campaign. Google checks each one before it is written.</p>
      <ul class="lk-list">${items.map(x => `<li><b>${esc(x.term)}</b> on ${esc(x.campaign)} · ${m2(x.spend, d.currency)} · <span class="faint">${esc(x.why)}</span></li>`).join('')}</ul>
      <p class="v2hint" style="margin:0">Written to the Change Log as you, in Locus. Undo is on the toast.</p>`, `Add all ${items.length}`, async ({ close, msg }) => {
      const ok = [], bad = [];
      for (const [i, x] of items.entries()) {
        msg(`Adding ${i + 1} of ${items.length}: "${x.term}"…`);
        const pv = await post('/api/leaks/apply', { act: a.act_id, term: x.term, campaign_id: x.campaign_id }).catch(e => ({ error: e.message }));
        const r = pv.error ? pv : await post('/api/leaks/apply', { act: a.act_id, term: x.term, campaign_id: x.campaign_id, confirm: true }).catch(e => ({ error: e.message }));
        (r.error ? bad : ok).push(r.error ? `"${x.term}": ${r.error}` : r);
      }
      if (bad.length) { msg(`${ok.length} added. Not added: ${bad.join('; ')}`, true); if (ok.length) { done(a, ok); redraw(true); } return; }
      close(); done(a, ok); redraw(true);
    });
  }
  function done(a, rs) {
    const undos = rs.map(r => r.undo).filter(Boolean);
    toast(rs.length === 1 ? `Added "${rs[0].item?.term || ''}" as a negative keyword.` : `Added ${rs.length} negative keywords.`, undos.length ? async () => {
      let n = 0; for (const u of undos) { const r = await post('/api/leaks/undo', { act: a.act_id, resource: u }).catch(e => ({ error: e.message })); if (!r.error) n++; }
      CACHE.delete(a.act_id); toast(n === undos.length ? 'Undone: the negative keyword is gone.' : `Undid ${n} of ${undos.length}.`);
    } : null);
    CACHE.delete(a.act_id);
  }

  /* ---------- the top of a page: that page's top 3, or nothing ---------- */
  async function top(host, h, page) {
    H = h; css();
    if (!host) return;
    const a = H.S.act !== 'all' ? (H.S.accounts || []).find(x => x.act_id === H.S.act) : null;
    if (!a || !PAGE[page]) { host.innerHTML = ''; return; }
    const t = H.RUN();
    let d; try { d = await load(a.act_id); } catch { host.innerHTML = ''; return; }
    if (t !== H.RUN() || !d || d.error) { if (d && d.error && t === H.RUN()) host.innerHTML = ''; return; }
    const draw = fresh => {
      if (fresh) return load(a.act_id, fresh).then(x => { d = x; draw(); }).catch(e => toast(e.message));
      CHECKED = checkedOn(d);
      const mine = (d.leaks || []).filter(l => PAGE[page].includes(l.area));
      if (!mine.length) { host.innerHTML = ''; return; }
      const list = mine.slice(0, 3), sum = mine.filter(l => l.verdict !== 'not_the_cause' && l.verdict !== 'measurement').reduce((s, l) => s + (l.cost || 0), 0), max = Math.max(...list.map(l => l.cost || 0), 1);
      host.innerHTML = `<section class="v2card lk-card"><div class="v2h"><h3>${esc(PAGE_TITLE[page])}</h3><span class="cap">${list.length} of ${mine.length} · ranked by money a month</span></div>
        <p class="lx-lead" style="margin:0">${sum ? `<b>${km(sum, d.currency)} a month</b> by Locus's estimate, last ${d.days} days.` : ''} ${esc(mine.length > 1 ? 'Each leak is priced on its own; they can overlap.' : '')}</p>
        <div class="lk-rows">${list.map(l => row(l, d.currency, max)).join('')}</div>
        <div class="lk-more"><span>${mine.length > 3 ? `${mine.length - 3} more on this page's list. ` : ''}${(d.leaks || []).length} leak${(d.leaks || []).length === 1 ? '' : 's'} across ${esc(d.brand)}. ${d.ai_check && d.ai_check.at ? `AI check ${esc(new Date(d.ai_check.at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }))}.` : 'Not cross-checked yet.'}</span><button type="button" class="lk-link" data-lkhome="1">Every leak for ${esc(d.brand)} ›</button></div></section>`;
      wire(host, d, a, draw);
    };
    draw();
  }

  /* ---------- THE STRIP (2026-10-20, the kit): one line under the page head ----------
     Cole: "the leak finder takes far too much room". A page shows ONE line: the total a month, how many, the biggest
     one, "See all" (folds that page's rows open in place) and "All leaks" (Home > Leaks). Home shows the brand's total
     and its biggest leak with "Open leaks". Nothing is drawn when the page has no leak. */
  const AREA_LEAD = { google: 'Google', gterms: 'Google search', meta: 'Meta', tiktok: 'TikTok', website: 'The site', email: 'Email' };
  async function strip(host, h, page) {
    H = h; css();
    if (!host) return;
    const a = H.S.act !== 'all' ? (H.S.accounts || []).find(x => x.act_id === H.S.act) : null;
    if (!a || !window.LxKit || (page !== 'home' && !PAGE[page])) { host.innerHTML = ''; return; }
    const t = H.RUN();
    let d; try { d = await load(a.act_id); } catch { host.innerHTML = ''; return; }
    if (t !== H.RUN() || !d || d.error) { if (d && d.error && t === H.RUN()) host.innerHTML = ''; return; }
    const draw = fresh => {
      if (fresh) return load(a.act_id, fresh).then(x => { d = x; draw(); }).catch(e => toast(e.message));
      CHECKED = checkedOn(d);
      const mine = page === 'home' ? (d.leaks || []).filter(ACT_ON) : (d.leaks || []).filter(l => PAGE[page].includes(l.area));
      if (!mine.length) { host.innerHTML = ''; return; }
      const act = mine.filter(ACT_ON), sum = act.reduce((s, l) => s + (l.cost || 0), 0), first = act[0] || mine[0];
      const lead = page === 'home' ? `${esc(d.brand)} is leaking about ${km(sum, d.currency)} a month` : `${AREA_LEAD[page]} is leaking${sum ? ` about ${km(sum, d.currency)} a month` : ''}`;
      host.innerHTML = window.LxKit.strip({ tone: sum >= 5000 ? 'bad' : 'warn', lead, n: `${mine.length} leak${mine.length === 1 ? '' : 's'}`, text: first ? esc(first.title) : '', fold: page === 'home' ? '' : (mine.length === 1 ? 'See it' : `See all ${mine.length}`), go: 'leaks', goLabel: page === 'home' ? 'Open leaks' : 'All leaks' });
      host.querySelectorAll('[data-go="leaks"]').forEach(b => b.onclick = () => H.show('leaks'));
      window.LxKit.wireStrip(host, body => {
        const max = Math.max(...mine.map(l => l.cost || 0), 1);
        body.innerHTML = `<section class="v2card lk-card"><div class="lk-rows">${mine.map(l => row(l, d.currency, max)).join('')}</div>
          <div class="lk-more"><span>${d.ai_check && d.ai_check.at ? `AI check ${esc(checkedOn(d))}.` : 'Not cross-checked yet.'}</span><button type="button" class="lk-link" data-lkhome="1">Every leak for ${esc(d.brand)} ›</button></div></section>`;
        wire(body, d, a, draw);
      });
    };
    draw();
  }

  const checkedOn = d => d.ai_check && d.ai_check.at ? new Date(d.ai_check.at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'America/Chicago' }) : null;
  const ACT_ON = l => l.verdict !== 'not_the_cause' && l.verdict !== 'measurement';

  /* ---------- Home > Overview, one brand: every leak, ranked (2026-10-14: moved from Day check to Overview) ----------
     Cole: "it's not on the overview? ... it only shows one suggestion?" The card opens on the top 3 to act on; "Show all
     N" opens every leak in place: the ones to act on ranked by money, then "Look elsewhere first" and "Check the
     numbers" in their own group. Nothing is hidden behind a page change. */
  async function full(host, h) {
    H = h; css();
    if (!host) return;
    const a = H.S.act !== 'all' ? (H.S.accounts || []).find(x => x.act_id === H.S.act) : null;
    if (!a) { host.innerHTML = ''; return; }
    const t = H.RUN();
    host.innerHTML = `<section class="v2card lk-card"><div class="v2h"><h3>Where ${esc(a.name)} is losing money</h3></div><p class="v2hint">Reading Google Ads, Meta, GA4 and Klaviyo… The first read of the hour takes about 20 seconds.</p></section>`;
    let d; try { d = await load(a.act_id); } catch (e) { d = { error: e.message }; }
    if (t !== H.RUN()) return;
    if (!d || d.error) { host.innerHTML = `<section class="v2card lk-card"><div class="v2h"><h3>Where ${esc(a.name)} is losing money</h3></div><p class="v2bad">${esc(d?.error || 'No answer.')}</p></section>`; return; }
    const draw = fresh => {
      if (fresh) return load(a.act_id, fresh).then(x => { d = x; draw(); }).catch(e => toast(e.message));
      CHECKED = checkedOn(d);
      const all = d.leaks || [], open = host.dataset.all === '1', max = Math.max(...all.map(l => l.cost || 0), 1);
      const act = all.filter(ACT_ON), later = all.filter(l => !ACT_ON(l));
      const shown = open ? act : act.slice(0, 3), first = act[0] || all[0];
      const sum = act.reduce((s, l) => s + (l.cost || 0), 0);
      host.innerHTML = `<section class="v2card lk-card"><div class="v2h"><h3>Where ${esc(d.brand)} is losing money</h3><span class="cap">${all.length} leak${all.length === 1 ? '' : 's'} · last ${d.days} days · numbers refresh hourly</span></div>
        <p class="lx-lead" style="margin:0">${d.summary ? `<b>${esc(d.summary)}</b> ` : first ? `The biggest leak: <b>${esc(first.title)}</b>. ` : 'Nothing is leaking over the floors Locus uses. What was checked is below.'}${first ? esc(d.note) : ''}</p>
        ${first ? aiBar(d) : ''}
        ${shown.length ? `<div class="lk-rows">${shown.map(l => row(l, d.currency, max)).join('')}</div>` : ''}
        ${open && later.length ? `<div class="lk-group"><h4>Look elsewhere first, or check the numbers (${later.length})</h4><p class="v2hint" style="margin:0">The numbers are true, but the AI check points somewhere else first, or the number itself may be off. Kept here so nothing is hidden.</p><div class="lk-rows">${later.map(l => row(l, d.currency, max)).join('')}</div></div>` : ''}
        ${!open && all.length > shown.length ? `<div class="lk-more"><span>${shown.length} of ${all.length} shown${sum ? `; the ${act.length} to act on add up to about ${km(sum, d.currency)} a month, priced one by one` : ''}.</span><button type="button" class="btn" data-lkall="1">Show all ${all.length} leaks</button></div>` : ''}
        ${open ? `${status(d)}${lessons(d)}<p class="v2hint" style="margin:0">Benchmarks: Littledata, Oct 2026 (Shopify stores, by device) for add to cart, checkout and conversion; Klaviyo 2026 for flow revenue per recipient. Platform campaigns use ${esc(d.brand)}'s own cut line from Ads rules. Read ${new Date(d.as_of).toLocaleString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'America/Chicago' })} Central.</p><div class="lk-more"><span></span><button type="button" class="lk-link" data-lkless="1">Show fewer</button></div>` : ''}</section>`;
      wire(host, d, a, draw);
      host.querySelectorAll('[data-lkless]').forEach(b => b.onclick = () => { host.dataset.all = ''; draw(); host.scrollIntoView({ block: 'start', behavior: 'smooth' }); });
    };
    draw();
  }

  /* ---------- Home > Overview, All clients: each brand's biggest leak (2026-10-14) ----------
     One row per brand: its biggest leak to act on, what it is worth a month, how many leaks it has, when its AI check
     ran. Each brand is its own read (the plain list: no AI cost, cached an hour), three at a time; a click opens that
     brand's Overview with the full list. */
  async function brands(host, h, accts, pick) {
    H = h; css();
    if (!host) return;
    const list = (accts || []).filter(a => !/golf sock|harborline/i.test(a.name || '') && (a.conn_kinds || ['x']).length);
    if (!list.length) { host.innerHTML = ''; return; }
    const t = H.RUN();
    host.innerHTML = `<section class="v2card lk-card"><div class="v2h"><h3>Where each brand is losing money</h3><span class="cap">biggest leak to act on, per brand</span></div><p class="v2hint">Reading each brand's leaks…</p></section>`;
    const out = new Array(list.length); let i = 0;
    const work = async () => { while (i < list.length) { const k = i++; out[k] = await load(list[k].act_id).catch(e => ({ error: e.message })); } };
    await Promise.all([work(), work(), work()]);
    if (t !== H.RUN()) return;
    const rows = list.map((a, k) => ({ a, d: out[k] })).filter(x => x.d && !x.d.error).map(x => { const act = (x.d.leaks || []).filter(ACT_ON); return { ...x, top: act[0] || null, n: (x.d.leaks || []).length }; })
      .sort((p, q) => ((q.top && q.top.cost) || 0) - ((p.top && p.top.cost) || 0));
    if (!rows.some(r => r.n)) { host.innerHTML = ''; return; }
    host.innerHTML = `<section class="v2card lk-card"><div class="v2h"><h3>Where each brand is losing money</h3><span class="cap">biggest leak to act on, per brand · click a brand for its full list</span></div>
      <div class="v2tbl"><table class="lk-btbl"><thead><tr><th>Brand</th><th>Biggest leak to act on</th><th class="n">A month, est.</th><th class="n">Leaks</th><th>AI check</th></tr></thead><tbody>
      ${rows.map(r => { const v = r.top && VERDICT[r.top.verdict]; const [an, ac] = r.top ? (AREA[r.top.area] || [r.top.area, '--c-else']) : ['', '']; return `<tr class="link" tabindex="0" data-lkbrand="${esc(r.a.act_id)}"><td><b>${esc(r.a.name)}</b></td>
        <td>${r.top ? `<span class="lk-chip"><i style="background:var(${ac})"></i>${esc(an)}</span>${v ? ` <span class="lk-chip lk-v ${v[1]}">${v[0]}</span>` : ''} ${esc(r.top.title)}` : '<span class="faint">Nothing over the floors</span>'}</td>
        <td class="n">${r.top && r.top.cost != null ? km(r.top.cost, r.d.currency) : '–'}</td><td class="n">${r.n}</td>
        <td>${r.d.ai_check && r.d.ai_check.at ? esc(checkedOn(r.d)) : '<span class="faint">not yet</span>'}</td></tr>`; }).join('')}
      </tbody></table></div>
      <p class="v2hint" style="margin:0">The AI check runs for every brand on Monday's morning card, or on a brand's Overview with Run the AI check (about 6 cents). Between checks the list is the plain rules plus the last check's verdicts, free.</p></section>`;
    host.querySelectorAll('[data-lkbrand]').forEach(tr => { const go = () => pick ? pick(tr.dataset.lkbrand, 'leaks') : null; tr.onclick = go; tr.onkeydown = e => { if (e.key === 'Enter') go(); }; });
  }

  window.LeaksCard = { top, strip, full, brands, drop: act => CACHE.delete(act), load, addAll, setHost: h => { H = h; css(); } };
})();

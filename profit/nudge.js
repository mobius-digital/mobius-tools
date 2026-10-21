/* THE NUDGE CARD (2026-10-11, docs/two-products.md sections 4 and 5, session D).
 * "When your ads start bleeding, it taps you on the shoulder." A small badge in the top bar (the helper's face slot
 * and a count) that opens a stack of one-sentence, one-button items. It is a VIEW over two things Locus already
 * computes, never a third source of truth: the media buyer's calls (profit worker /api/hub/today, buyerList: cut,
 * trim, scale, refresh, fix) and what moved yesterday (/api/hub/moved). Every change goes through the propose and
 * confirm path Ads > Meta uses (account-health /api/meta/write: a dry run first, the modal shows before and after,
 * then the write with `expect`, logged in the Change Log, Undo for 24 hours). Done writes the same manual Change Log
 * line Ads > Today writes (/api/activities). Not now snoozes the item for 24 hours per person, stored in the worker
 * (/api/me/prefs), not localStorage, so it follows the person to every device.
 * The face: <span class="lx-face" data-state="asleep | thinking | found | clear"> is a plain dot in the Locus blue
 * until the brand kit lands; swap the span's content, keep the states.
 * index.html calls window.LxNudge.refresh(host helpers) at the end of every show(). */
(() => {
  let H = null;
  const ST = { key: null, at: 0, items: [], all: [], prefs: null, open: false, loading: false, live: null, liveAt: 0, liveAct: null };
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const sym = c => (!c || c === 'USD' ? '$' : c === 'GBP' ? '£' : c === 'EUR' ? '€' : c === 'CAD' ? 'CA$' : c === 'AUD' ? 'A$' : c + ' ');
  const money = (n, c) => n == null || !isFinite(n) ? '–' : sym(c) + Math.round(n).toLocaleString('en-US');
  const sales = n => `${Math.round(n || 0)} sale${Math.round(n || 0) === 1 ? '' : 's'}`;
  const DAY = 86400e3;
  const MOVED_TAB = { rev: 'store', o: 'store', aov: 'store', mer: 'channels', sp: 'channels', cac: 'customers' };
  const keyOf = r => r.key;

  /* ---------- the items: one sentence each, from the calls and the moves ---------- */
  function build(today, moved) {
    const out = [];
    const rows = (today && today.rows) || [];
    const by = {}; for (const r of rows) (by[r.act_id] ??= []).push(r);
    for (const [act, rs] of Object.entries(by)) {
      const cuts = rs.filter(r => r.kind === 'cut' && r.adset_id && !r.ad_id);
      const cur = rs[0].currency, $ = v => money(v, cur), brand = rs[0].brand;
      if (cuts.length >= 2) {
        const sp = cuts.reduce((s, r) => s + (r.spend || 0), 0);
        out.push({ kind: 'cut', group: true, act_id: act, brand, currency: cur, rows: cuts, stake: cuts.reduce((s, r) => s + (r.stake || 0), 0), key: `cut-group|${act}|${cuts.map(r => r.adset_id).sort().join(',')}`,
          text: `${brand} is losing money on ${cuts.length} ad sets. Pausing them would save about ${$(sp / 7)} a day.` });
      }
      for (const r of rs) {
        if (r.kind === 'cut' && cuts.length >= 2 && cuts.includes(r)) continue;
        const key = `${r.kind}|${r.act_id}|${r.adset_id || ''}|${r.ad_id || ''}`;
        let text = '';
        if (r.kind === 'cut') text = `${brand}: "${r.adset}" is losing money, ${$(r.spend)} for ${sales(r.orders)} in 7 days. Pausing it would save about ${$((r.spend || 0) / 7)} a day.`;
        else if (r.kind === 'trim') text = `${brand}: "${r.ad}" is dragging "${r.adset}", ${r.orders ? `${$(r.cpa)} a sale against the ${$(r.goal)} goal` : `no sale on ${$(r.spend)}`}. Pausing this one ad would save about ${$((r.spend || 0) / 7)} a day.`;
        else if (r.kind === 'scale') text = `${brand}: "${r.adset}" is working, ${sales(r.orders)} at ${$(r.cpa)} against the ${$(r.goal)} goal. Raise its budget 20% and watch three days.`;
        else if (r.kind === 'refresh') text = `${brand}: the main ad in "${r.adset}" is tiring, ${r.ctr != null && r.prev_ctr ? `clicks down ${Math.round((1 - r.ctr / r.prev_ctr) * 100)}% on the week` : 'fewer clicks than last week'}. Brief a new version; do not switch it off.`;
        else if (r.kind === 'mixed') text = `${brand}: "${r.adset}" is mixed and needs your call. ${r.why || ''}`.trim();
        else if (r.kind === 'fix') text = `${brand}: ${r.why || 'something needs fixing on the ad account.'}`;
        else continue;
        out.push({ ...r, key, text });
      }
    }
    for (const m of (moved && moved.items) || []) {
      const $ = v => money(v, m.currency), pc = Math.abs(Math.round((m.change || 0) * 100));
      const val = m.metric === 'mer' ? `${(m.value || 0).toFixed(2)}x` : m.metric === 'o' ? Math.round(m.value) : $(m.value);
      const nrm = m.metric === 'mer' ? `${(m.normal || 0).toFixed(2)}x` : m.metric === 'o' ? Math.round(m.normal) : $(m.normal);
      out.push({ kind: 'moved', act_id: m.act_id, brand: m.name, currency: m.currency, metric: m.metric, good: m.good, stake: Math.abs(m.z || 0) * 100, key: `moved|${m.act_id}|${m.metric}|${m.date}`,
        text: `${m.name}: ${m.label.toLowerCase()} was ${pc}% ${m.change >= 0 ? 'up' : 'down'} yesterday, ${val} against a normal ${nrm}${m.why ? `, ${m.why}` : ''}.` });
    }
    return out.sort((p, q) => (q.stake || 0) - (p.stake || 0));
  }
  const hidden = it => { const p = ST.prefs && ST.prefs.nudge && ST.prefs.nudge[it.key]; return !!(p && (p.state === 'done' || (p.state === 'snoozed' && p.until > Date.now()))); };
  const visible = () => ST.all.filter(it => !hidden(it));

  /* ---------- the badge and the stack ---------- */
  function host() {
    let h = document.getElementById('lxNudgeHost');
    if (h) return h;
    const right = document.querySelector('.topbar .hd-right'); if (!right) return null;
    h = document.createElement('div'); h.id = 'lxNudgeHost'; h.className = 'lx-nudge-host';
    h.innerHTML = `<button type="button" class="lx-nudge" id="lxNudge" aria-haspopup="dialog" aria-expanded="false" title="What Locus found"><span class="lx-face" data-state="asleep" aria-hidden="true"></span><span class="lx-nudge-t">Locus</span></button><div class="lx-nudge-pop" id="lxNudgePop" hidden role="dialog" aria-label="What Locus found"></div>`;
    right.insertBefore(h, right.firstChild);
    /* The ask bar carries the helper too (the plan: "it lives in the ask bar, blinks while thinking, lights up when it
       has a call for you"), left of the search mark, the same state as the badge. */
    const ask = document.getElementById('v2ask');
    if (ask && !ask.querySelector('.lx-face')) { const f = document.createElement('span'); f.className = 'lx-face lx-helper lx-ask-face'; f.dataset.state = 'asleep'; f.setAttribute('aria-hidden', 'true'); ask.insertBefore(f, ask.firstChild); }
    h.querySelector('#lxNudge').onclick = e => { e.stopPropagation(); toggle(!ST.open); };
    document.addEventListener('click', e => { if (ST.open && !e.target.closest('#lxNudgeHost') && !e.target.closest('.modal-wrap')) toggle(false); });
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && ST.open && !document.querySelector('.modal-wrap')) toggle(false); });
    return h;
  }
  function face(state) { document.querySelectorAll('#lxNudge .lx-face, .lx-ask-face').forEach(f => { f.dataset.state = state; }); }
  function badge() {
    const b = document.getElementById('lxNudge'); if (!b) return;
    const n = visible().length, t = b.querySelector('.lx-nudge-t');
    face(ST.loading ? 'thinking' : !ST.key ? 'asleep' : n ? 'found' : 'clear');
    t.textContent = ST.loading && !ST.all.length ? 'Looking' : !ST.key ? 'Locus' : n ? `${n} to do` : 'All clear';
    b.classList.toggle('has', n > 0);
  }
  function toggle(open) {
    ST.open = open; const p = document.getElementById('lxNudgePop'), b = document.getElementById('lxNudge'); if (!p) return;
    p.hidden = !open; if (b) b.setAttribute('aria-expanded', String(open));
    if (open) paint();
  }
  const act = it => it.act_id;
  function paint() {
    const p = document.getElementById('lxNudgePop'); if (!p) return;
    const list = visible(), shown = list.slice(0, 6);
    const btn = (k, label, cls = '') => `<button type="button" class="ds-btn${cls ? ' ' + cls : ''}" data-nk="${k}">${label}</button>`;
    const row = it => {
      const acts = it.kind === 'cut' || it.kind === 'trim' ? btn('pause', it.group ? 'Pause them' : 'Pause', 'primary')
        : it.kind === 'scale' ? btn('scale', 'Scale', 'primary')
        : it.kind === 'refresh' ? btn('brief', 'Brief it', 'primary')
        : it.kind === 'fix' ? (amLink(it) ? `<a class="ds-btn primary" href="${esc(amLink(it))}" target="_blank" rel="noopener">Open in Ads Manager</a>` : '')
        : it.kind === 'moved' ? btn('look', 'Look') : '';
      return `<div class="lx-nudge-it" data-key="${esc(it.key)}"><span class="lx-nudge-k ${esc(it.kind)}${it.kind === 'moved' ? (it.good === false ? ' bad' : it.good ? ' good' : '') : ''}">${esc(it.kind === 'moved' ? 'Moved' : it.kind === 'refresh' ? 'Tiring' : it.kind === 'fix' ? 'Fix' : it.kind)}</span><p>${esc(it.text)}</p><div class="lx-nudge-a">${acts}${btn('later', 'Not now', 'ghost')}${btn('done', 'Done', 'ghost')}</div></div>`;
    };
    p.innerHTML = `<div class="lx-nudge-h"><span class="lx-face" data-state="${ST.loading ? 'thinking' : list.length ? 'found' : 'clear'}" aria-hidden="true"></span><b>${ST.loading && !ST.all.length ? 'Reading the calls' : list.length ? `${list.length} thing${list.length === 1 ? '' : 's'} worth a tap` : 'Nothing to change right now'}</b><button type="button" class="ds-iconbtn lx-nudge-x" aria-label="Close" data-nk="close">×</button></div>
      ${shown.map(row).join('') || `<p class="lx-nudge-empty">${ST.loading ? '' : 'No ad set crossed a rule and nothing moved out of the ordinary. The full list is on Ads > Today.'}</p>`}
      ${list.length > shown.length ? `<p class="lx-nudge-more">${list.length - shown.length} more on Ads > Today.</p>` : ''}
      <div class="lx-nudge-f"><button type="button" class="v2link" data-nk="today">Open Ads &gt; Today ›</button><span>Every change is proposed first and logged. Not now hides an item for 24 hours.</span></div>`;
    p.querySelectorAll('[data-nk]').forEach(b => b.onclick = e => { e.stopPropagation(); const it = ST.all.find(x => x.key === b.closest('[data-key]')?.dataset.key); on(b.dataset.nk, it); });
  }
  const amLink = r => { const n = String(r.meta_act || '').replace(/^act_/, ''); return n ? `https://adsmanager.facebook.com/adsmanager/manage/${r.ad_id ? 'ads' : 'adsets'}?act=${n}${r.adset_id ? `&selected_adset_ids=${r.adset_id}` : ''}${r.ad_id ? `&selected_ad_ids=${r.ad_id}` : ''}` : null; };
  function pickAct(id, tab) { H.S.act = id; try { localStorage.setItem('pf_act', id); } catch {} const cp = document.getElementById('clientPick'); if (cp) cp.value = id; H.show(tab); }

  async function on(k, it) {
    if (k === 'close') return toggle(false);
    if (k === 'today') { toggle(false); return H.show('today'); }
    if (!it) return;
    if (k === 'later') return setPref(it, 'snoozed', Date.now() + DAY);
    if (k === 'done') return done(it);
    if (k === 'look') { toggle(false); return pickAct(act(it), MOVED_TAB[it.metric] || 'overview'); }
    if (k === 'brief') { toggle(false); if (H.AskUI) H.AskUI.ask(`For ${it.brand}: the anchor ad "${it.ad}" in ad set "${it.adset}" is tiring (${it.why}). Brief three iterations of it as an Asana brief: same angle, new hooks.`); return; }
    if (k === 'pause') return pause(H, it, { reason: 'From the nudge', onDone: () => setPref(it, 'done', Date.now() + 7 * DAY).then(dropCaches), onUndo: () => setPref(it, null) });
    if (k === 'scale') return budget(H, it, { reason: 'From the nudge', onDone: () => setPref(it, 'done', Date.now() + 7 * DAY).then(dropCaches), onUndo: () => setPref(it, null), onCampaign: () => { toggle(false); pickAct(it.act_id, 'campaigns'); } });
  }
  async function setPref(it, state, until) {
    ST.prefs = ST.prefs || { morning_dm: false, nudge: {} }; ST.prefs.nudge[it.key] = { state, until };
    paint(); badge();
    try { const r = await H.apiAH('/api/me/prefs', { method: 'PUT', body: JSON.stringify({ nudge: { [it.key]: { state, until } } }) }); if (r && r.prefs) ST.prefs = r.prefs; }
    catch (e) { toast(`Could not save that: ${e.message}`, true); }
  }
  /* Done = the same manual Change Log line Ads > Today writes, then the item is marked done for this person. */
  async function done(it) {
    if (['cut', 'trim', 'scale', 'refresh', 'fix'].includes(it.kind)) {
      const verb = { scale: 'Scaled', cut: 'Cut', trim: 'Switched off', fix: 'Fixed', refresh: 'Briefed an iteration of' }[it.kind] || 'Acted on';
      const what = it.group ? `${it.rows.length} ad sets (${it.rows.map(r => `"${r.adset}"`).join(', ')})` : it.ad ? `"${it.ad}"` : it.adset ? `ad set "${it.adset}"` : 'the account';
      try { await H.apiAH('/api/activities', { method: 'POST', body: JSON.stringify({ act_id: it.act_id, category: 'manual', summary: `${verb} ${what} (from the nudge)`, reason: it.group ? it.rows.map(r => r.why).join(' ') : it.why || null, actor: 'Locus nudge' }) }); }
      catch (e) { toast(`Could not log it: ${e.message}`, true); return; }
    }
    await setPref(it, 'done', Date.now() + 7 * DAY);
    toast('Done, and in the Change Log.');
  }

  /* ---------- the writes: propose, confirm, write, undo (the Ads > Meta path, one code path on the server) ----------
   * Shared with Ads > Today (desk.js, 2026-10-13) as window.LxMetaWrite, so the nudge card and Today's calls run the SAME
   * dry-run, modal, write-with-expect and Undo flow. `host` is the page's helpers (apiAH), `it` is a buyerList row
   * ({act_id, brand, currency, adset_id, adset, ad_id, ad, why, campaign_id}) or a nudge group ({group, rows, text}).
   * opts: reason (the Change Log prefix, "From the nudge" / "From Today"), pct (budget rise, default 0.2), amount (a
   * fixed new budget), onDone(writes) after a successful write, onUndo() after a successful undo, onCampaign() when the
   * ad set runs on its campaign's budget (the caller opens Campaigns). */
  function modal(title, body, cta) {
    const w = document.createElement('div'); w.className = 'modal-wrap';
    w.innerHTML = `<div class="modal lx-nudge-m" role="dialog" aria-modal="true"><h3>${esc(title)}</h3><div class="lx-nudge-mb">${body}</div><p class="lx-nudge-err" data-err hidden></p>
      <div class="row lx-nudge-ma"><span class="faint">Written to Meta and logged in the Change Log. Undo for 24 hours.</span><button class="btn" data-m="no" type="button">Cancel</button><button class="btn primary" data-m="yes" type="button" disabled>${esc(cta)}</button></div></div>`;
    document.body.appendChild(w);
    const close = () => { w.remove(); document.removeEventListener('keydown', key); };
    const key = e => { if (e.key === 'Escape') close(); };
    document.addEventListener('keydown', key);
    w.addEventListener('mousedown', e => { if (e.target === w) close(); });
    w.querySelector('[data-m="no"]').onclick = close;
    return { w, close, yes: w.querySelector('[data-m="yes"]'), err: w.querySelector('[data-err]'), body: w.querySelector('.lx-nudge-mb') };
  }
  const write = (host, body) => host.apiAH('/api/meta/write', { method: 'POST', body: JSON.stringify(body) });
  const step = s => (s || []).map(x => `<span class="lx-ba"><span>${esc(x.from ?? 'none')}</span><i>→</i><b>${esc(x.to ?? 'none')}</b></span>`).join('');
  async function pause(host, it, opts = {}) {
    const targets = it.group ? it.rows : [it], from = opts.reason || 'From the nudge';
    const m = modal(it.group ? `Pause ${targets.length} ad sets on ${it.brand}?` : `Pause this ${it.ad_id ? 'ad' : 'ad set'}?`, targets.map((r, i) => `<div class="lx-nudge-t1" data-i="${i}"><b>${esc(r.ad || r.adset)}</b><span class="faint">Checking with Meta…</span></div>`).join(''), it.group ? 'Pause them' : 'Pause it');
    const plans = [];
    for (const [i, r] of targets.entries()) {
      const body = { act: r.act_id, kind: 'pause', level: r.ad_id ? 'ad' : 'adset', object: r.ad_id || r.adset_id, reason: `${from}: ${r.why || it.text || ''}` };
      let d; try { d = await write(host, { ...body, dry: true }); } catch (e) { d = { error: e.message }; }
      const el = m.w.querySelector(`[data-i="${i}"] span`); if (!el) return;
      if (!d || d.error) { el.className = 'v2bad'; el.textContent = d && d.error ? d.error : 'Meta did not answer.'; continue; }
      el.className = ''; el.innerHTML = `${step(d.step)} <span class="faint">${esc(d.detail || '')}</span>`;
      plans.push({ body, expect: d.before && d.before.status != null ? { status: d.before.status } : undefined, name: d.name });
    }
    if (!plans.length) { m.err.textContent = 'Nothing can be paused from here; open it in Ads Manager.'; m.err.hidden = false; return; }
    m.yes.disabled = false;
    m.yes.onclick = async () => {
      m.yes.disabled = true; m.yes.textContent = 'Writing to Meta…'; m.err.hidden = true;
      const writes = [], fails = [];
      for (const p of plans) { let r; try { r = await write(host, { ...p.body, expect: p.expect }); } catch (e) { r = { error: e.message }; } if (!r || r.error) fails.push(`${p.name || ''}: ${r && r.error || 'no answer'}`); else writes.push(r); }
      if (fails.length && !writes.length) { m.err.textContent = fails.join(' '); m.err.hidden = false; m.yes.disabled = false; m.yes.textContent = it.group ? 'Pause them' : 'Pause it'; return; }
      m.close(); if (opts.onDone) await opts.onDone(writes);
      toast(`Paused${writes.length > 1 ? ` ${writes.length} ad sets` : ''}.${fails.length ? ` ${fails.length} failed: ${fails.join(' ')}` : ''}`, false, writes.some(w => w.write) ? () => undo(host, writes, it, opts.onUndo) : null);
    };
  }
  async function budget(host, it, opts = {}) {
    const pct = opts.pct ?? 0.2, label = `+${Math.round(pct * 100)}%`;
    const m = modal(`Raise the budget on "${it.adset}"?`, `<p class="faint">Reading the live budget from Meta…</p>`, 'Raise it');
    let live; try { live = await metaLive(host, it.act_id); } catch (e) { m.err.textContent = e.message; m.err.hidden = false; return; }
    const o = live && live.adsets && live.adsets[it.adset_id];
    if (!o) { m.err.textContent = 'Meta did not return this ad set; it may have been removed.'; m.err.hidden = false; return; }
    if (!o.daily && !o.lifetime) {
      m.body.innerHTML = `<p>This ad set runs on its campaign's budget, so the ${label} goes on the campaign. Raise it on Ads &gt; Meta &gt; Campaigns, where the campaign budget is editable.</p>`;
      m.yes.disabled = false; m.yes.textContent = 'Open Campaigns'; m.yes.onclick = () => { m.close(); if (opts.onCampaign) opts.onCampaign(); }; return;
    }
    const daily = !!o.daily, from = o.daily || o.lifetime, cur = it.currency, keyB = daily ? 'daily_budget' : 'lifetime_budget';
    const to = opts.amount > 0 ? Math.round(opts.amount) : Math.round(from * (1 + pct));
    const ba = (v, tag) => `<span class="lx-ba"><span>${money(from, cur)}${daily ? '/day' : ' total'}</span><i>→</i><b>${money(v, cur)}${daily ? '/day' : ' total'}</b> <em>${tag}</em></span>`;
    m.body.innerHTML = `<label class="lx-nudge-in"><span>New ${daily ? 'daily' : 'lifetime'} budget</span><span class="v2in"><i>${esc(sym(cur))}</i><input type="number" min="1" step="1" inputmode="decimal" value="${to}"></span></label><div data-ba>${ba(to, `${to >= from ? '+' : ''}${Math.round((to - from) / from * 100)}%`)}</div><p class="faint" data-note>Meta's rule of thumb is 20 to 50% a step, or it may restart learning.</p>`;
    const inp = m.body.querySelector('input'), bab = m.body.querySelector('[data-ba]');
    inp.oninput = () => { const v = +inp.value; const ok = v > 0 && Math.abs(v - from) >= 1; bab.innerHTML = ok ? ba(v, `${v >= from ? '+' : ''}${Math.round((v - from) / from * 100)}%`) : '<span class="faint">Type the new amount.</span>'; m.yes.disabled = !ok; };
    m.yes.disabled = false;
    m.yes.onclick = async () => {
      const amount = +inp.value; if (!(amount > 0)) return;
      m.yes.disabled = true; m.yes.textContent = 'Checking…'; m.err.hidden = true;
      const body = { act: it.act_id, kind: 'budget', level: 'adset', object: it.adset_id, amount, reason: `${opts.reason || 'From the nudge'}: ${it.why || ''}` };
      let d; try { d = await write(host, { ...body, dry: true }); } catch (e) { d = { error: e.message }; }
      if (!d || d.error) { m.err.textContent = d && d.error || 'Meta did not answer.'; m.err.hidden = false; m.yes.disabled = false; m.yes.textContent = 'Raise it'; return; }
      m.yes.textContent = 'Writing to Meta…';
      let r; try { r = await write(host, { ...body, expect: d.before && d.before[keyB] != null ? { [keyB]: d.before[keyB] } : undefined }); } catch (e) { r = { error: e.message }; }
      if (!r || r.error) { m.err.textContent = r && r.error || 'Meta did not answer.'; m.err.hidden = false; m.yes.disabled = false; m.yes.textContent = 'Raise it'; return; }
      m.close(); if (opts.onDone) await opts.onDone([r]);
      toast(String(r.summary || 'Budget raised.').replace(/^[^:]+:\s*/, ''), false, r.write ? () => undo(host, [r], it, opts.onUndo) : null);
    };
  }
  async function undo(host, writes, it, onUndo) {
    toast('Undoing…', false, null, 1500);
    const fails = [];
    for (const w of writes.filter(w => w.write)) { let r; try { r = await host.apiAH('/api/meta/undo', { method: 'POST', body: JSON.stringify({ act: it.act_id, write: w.write }) }); } catch (e) { r = { error: e.message }; } if (!r || r.error) fails.push(r && r.error || 'no answer'); }
    if (!fails.length && onUndo) await onUndo();
    toast(fails.length ? `Could not undo: ${fails.join(' ')}` : 'Undone. Meta has the old value back.', fails.length > 0);
  }
  async function metaLive(host, actId) {
    if (ST.live && ST.liveAct === actId && Date.now() - ST.liveAt < 5 * 60e3) return ST.live;
    const r = await host.apiAH(`/api/meta/live?act=${encodeURIComponent(actId)}`); if (r && r.error) throw new Error(r.error);
    ST.live = r; ST.liveAct = actId; ST.liveAt = Date.now(); return r;
  }
  const dropCaches = () => { ST.at = 0; };
  function toast(msg, bad, undoFn, ms) {
    document.querySelectorAll('.lx-toast.lx-nt').forEach(x => x.remove());
    const t = document.createElement('div'); t.className = 'lx-toast lx-nt' + (bad ? ' bad' : ''); t.setAttribute('role', 'status');
    t.innerHTML = `<span>${esc(msg)}</span>${undoFn ? '<button type="button">Undo</button>' : ''}`;
    if (undoFn) t.querySelector('button').onclick = () => { t.remove(); undoFn(); };
    document.body.appendChild(t); setTimeout(() => t.remove(), ms || (undoFn ? 12000 : bad ? 6000 : 3000));
  }
  /* ONE CHANGE WITHOUT A MODAL (2026-10-15, Today's calls "Do all N calls": Cole confirms the whole list once, in one
     sheet). The SAME server path as pause() / budget(): a dry run first, then the write with `expect` from that dry run,
     so a change Meta already moved is refused as stale. kind 'pause' (ad set, or the ad when it.ad_id) or 'budget'
     (amount = the new budget). Never throws: { ok, write, summary } or { ok: false, error }. */
  async function run(host, it, { kind, amount, reason } = {}) {
    const body = kind === 'budget'
      ? { act: it.act_id, kind: 'budget', level: 'adset', object: it.adset_id, amount, reason: `${reason || 'From Today'}: ${it.why || ''}` }
      : { act: it.act_id, kind: 'pause', level: it.ad_id ? 'ad' : 'adset', object: it.ad_id || it.adset_id, reason: `${reason || 'From Today'}: ${it.why || ''}` };
    let d; try { d = await write(host, { ...body, dry: true }); } catch (e) { d = { error: e.message }; }
    if (!d || d.error) return { ok: false, error: d && d.error || 'Meta did not answer.' };
    const keyB = d.before && d.before.daily_budget != null ? 'daily_budget' : 'lifetime_budget';
    const expect = kind === 'budget' ? (d.before && d.before[keyB] != null ? { [keyB]: d.before[keyB] } : undefined) : (d.before && d.before.status != null ? { status: d.before.status } : undefined);
    let r; try { r = await write(host, { ...body, expect }); } catch (e) { r = { error: e.message }; }
    if (!r || r.error) return { ok: false, error: r && r.error || 'Meta did not answer.' };
    return { ok: true, write: r, summary: String(r.summary || '').replace(/^[^:]+:\s*/, '') };
  }
  window.LxMetaWrite = { pause, budget, undo, toast, metaLive, run };

  /* ---------- refresh: on every show(), for the brand on screen ---------- */
  async function refresh(host2) {
    if (host2) H = host2;
    if (!H || !H.S || !H.S.tok || document.body.classList.contains('nochrome')) { const h = document.getElementById('lxNudgeHost'); if (h) h.hidden = true; return; }
    const h = host(); if (!h) return; h.hidden = false;
    const key = H.S.act || 'all';
    if (ST.key === key && Date.now() - ST.at < 5 * 60e3) { badge(); if (ST.open) paint(); return; }
    ST.key = key; ST.loading = true; badge(); if (ST.open) paint();
    const mine = key;
    try {
      const [today, moved, prefs] = await Promise.all([
        H.api(`/api/hub/today?act=${encodeURIComponent(key)}`).catch(() => null),
        H.api(`/api/hub/moved?act=${encodeURIComponent(key)}`).catch(() => null),
        ST.prefs ? Promise.resolve({ prefs: ST.prefs }) : H.apiAH('/api/me/prefs').catch(() => ({ prefs: { morning_dm: false, nudge: {} } })),
      ]);
      if (ST.key !== mine) return;
      ST.prefs = (prefs && prefs.prefs) || ST.prefs || { morning_dm: false, nudge: {} };
      ST.all = build(today, moved); ST.at = Date.now();
    } finally { if (ST.key === mine) { ST.loading = false; badge(); if (ST.open) paint(); } }
  }
  window.LxNudge = { refresh, build, open: () => toggle(true), state: ST };
})();

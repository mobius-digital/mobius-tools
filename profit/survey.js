/* "How customers say they found you" (2026-10-10): the post-purchase survey card on Store > Customers.
 * Reads account-health GET /api/survey (survey.js there): Fairing or KnoCommerce answers grouped into channels and,
 * for the same orders, what Triple Whale lastPlatformClick credited. Triple Whale stays the attribution; this card is
 * the reality check beside it. One function: window.SurveyCard.mount(host, { act, from, to, api, esc, client, onConnect }).
 */
(function () {
  const pctTxt = v => v == null ? ' - ' : `${Math.round(v)}%`;
  const n = v => (v || 0).toLocaleString();

  function chart(rows, esc) {
    const max = Math.max(1, ...rows.map(r => Math.max(r.said_share || 0, r.tw_share || 0)));
    const bar = (v, color, tip) => `<div style="height:9px;border-radius:3px;background:${color};width:${((v || 0) / max * 100).toFixed(1)}%;min-width:${v ? 2 : 0}px" title="${esc(tip)}"></div>`;
    return `<div style="display:grid;grid-template-columns:minmax(120px,170px) 1fr 52px;gap:6px 12px;align-items:center;margin:4px 0 6px">
      ${rows.map(r => `<div style="font-size:13px">${esc(r.label)}</div>
        <div style="display:flex;flex-direction:column;gap:3px">${bar(r.said_share, 'var(--brand)', `Customers said: ${pctTxt(r.said_share)}`)}${bar(r.tw_share, 'var(--muted)', `Triple Whale credited: ${pctTxt(r.tw_share)}`)}</div>
        <div class="tiny" style="text-align:right">${pctTxt(r.said_share)}<br>${pctTxt(r.tw_share)}</div>`).join('')}
    </div>
    <div class="tiny" style="display:flex;gap:14px;margin-bottom:10px"><span><i style="display:inline-block;width:10px;height:10px;border-radius:2px;background:var(--brand);vertical-align:-1px"></i> What the customer said</span><span><i style="display:inline-block;width:10px;height:10px;border-radius:2px;background:var(--muted);vertical-align:-1px"></i> What Triple Whale credited (last platform click)</span></div>`;
  }

  function empty(o, r) {
    const esc = o.esc;
    const link = !o.client ? `<button class="btn primary" type="button" data-sv-connect style="margin-top:10px">Connect Fairing or KnoCommerce</button>` : '';
    return `<div class="card"><h3 style="margin-bottom:2px">How customers say they found you</h3>
      <p class="hint" style="margin:0">${r && r.error && r.error !== 'not_linked' ? esc(r.error) : o.client
        ? 'Not connected yet. When your post-purchase survey ("How did you hear about us?") is linked, this shows what customers say next to what the ad tracking credited, order by order. Ask your Mobius team to connect it.'
        : 'Not connected. Paste the brand\'s Fairing API secret token (or KnoCommerce client_id:client_secret) on Brand settings > Integrations > Post-purchase survey. Locus then lines up "How did you hear about us?" answers with Triple Whale for the same orders.'}</p>${link}</div>`;
  }

  async function mount(host, o) {
    if (!host) return;
    const esc = o.esc;
    let r;
    try { r = await o.api(`/api/survey?act=${encodeURIComponent(o.act)}${o.from ? `&from=${o.from}` : ''}${o.to ? `&to=${o.to}` : ''}`); }
    catch (e) { r = { error: e.message }; }
    if (!host.isConnected) return;
    if (!r || r.error) { host.innerHTML = empty(o, r); wire(host, o, r); return; }
    if (!r.responses) {
      host.innerHTML = `<div class="card"><h3 style="margin-bottom:2px">How customers say they found you</h3><p class="hint" style="margin:0">${esc(r.provider_name)} is connected, but no survey answers landed in this window yet.${r.sync_error ? ` Last read: ${esc(r.sync_error)}` : ''}</p></div>`;
      return;
    }
    const rows = (r.channels || []).filter(c => c.said || c.tw || c.said_all);
    const twOther = (r.tw_other || []).filter(x => x.tw);
    const M = r.matched;
    const line = M
      ? `Customers and Triple Whale name the same channel on <b>${pctTxt(r.agreement)}</b> of ${n(M)} orders both know about${r.paid_matched ? ` (<b>${pctTxt(r.agreement_paid)}</b> of the ${n(r.paid_matched)} Triple Whale credits to an ad)` : ''}.`
      : `None of the ${n(r.responses)} answers match an order Triple Whale has yet, so only what customers said is shown.`;
    const biggest = rows.filter(c => c.gap_pts != null && Math.abs(c.gap_pts) >= 10).sort((a, b) => Math.abs(b.gap_pts) - Math.abs(a.gap_pts))[0];
    const gapTxt = biggest && M >= 30 ? ` <b>${esc(biggest.label)}</b>: customers name it ${biggest.gap_pts > 0 ? 'more' : 'less'} than Triple Whale credits it (${pctTxt(biggest.said_share)} vs ${pctTxt(biggest.tw_share)}), ${biggest.gap_pts > 0 ? 'so it introduces more buyers than its clicks show' : 'so it mostly closes buyers someone else introduced'}.` : '';
    const qSel = !o.client && (r.questions || []).length > 1 ? `<label class="tiny" style="display:flex;gap:6px;align-items:center;margin-top:8px">Question read
        <select data-sv-q style="max-width:420px">${r.questions.map(q => `<option value="${esc(q.id)}"${r.question && q.id === r.question.id ? ' selected' : ''}>${esc(q.text || q.id)} (${n(q.n)})</option>`).join('')}</select></label>` : '';
    host.innerHTML = `<div class="card"><h3 style="margin-bottom:2px">How customers say they found you</h3>
      <p class="hint" style="margin-bottom:8px">"${esc(r.question?.text || 'How did you hear about us?')}" from ${esc(r.provider_name)}, ${n(r.responses)} answers in this window. Triple Whale stays the attribution on every screen; this is what customers remember, set beside it for the same orders.</p>
      <p style="margin:0 0 10px;font-size:13.5px;color:var(--ink-2);line-height:1.6">${line}${gapTxt}</p>
      ${r.thin ? `<div class="notice warn" style="margin-bottom:10px"><div><b>Only ${n(M)} orders to compare.</b> Under 30 the split swings on a handful of people; widen the date range before reading the gaps.</div></div>` : ''}
      ${M ? chart(rows.filter(c => c.said || c.tw), esc) : ''}
      <div class="tbl-wrap"><table>
        <thead><tr><th>Channel</th><th class="num">Customers said</th><th class="num">Triple Whale credited</th><th class="num">Both agree</th><th class="num">All answers</th></tr></thead>
        <tbody>${rows.map(c => `<tr><td><b>${esc(c.label)}</b></td><td class="num">${n(c.said)} <span class="tiny">${pctTxt(c.said_share)}</span></td><td class="num">${n(c.tw)} <span class="tiny">${pctTxt(c.tw_share)}</span></td><td class="num">${n(c.agree)}</td><td class="num">${n(c.said_all)} <span class="tiny">${pctTxt(c.said_all_share)}</span></td></tr>`).join('')}
        ${twOther.map(x => `<tr style="color:var(--ink-2)"><td>${esc(x.label)} <span class="tiny">(Triple Whale only)</span></td><td class="num"> - </td><td class="num">${n(x.tw)} <span class="tiny">${pctTxt(x.tw_share)}</span></td><td class="num"> - </td><td class="num"> - </td></tr>`).join('')}</tbody></table></div>
      <p class="tiny" style="margin-top:8px">Customers said, Triple Whale credited and Both agree count only the ${n(M)} orders found in both (matched by order id${r.match_rate != null ? `, ${pctTxt(r.match_rate)} of answers` : ''}). All answers counts every answer in the window. A survey is memory, not tracking: use it to spot channels clicks miss (podcasts, word of mouth, creators, video), not to work out a cost per order.</p>
      ${(r.answers || []).length ? `<details class="footnote" style="margin-top:8px"><summary>The answers as given</summary><div class="fn-body">${r.answers.map(a => `${esc(a.answer)} <span class="tiny">(${n(a.n)}, read as ${esc((rows.find(c => c.key === a.channel) || { label: 'Other' }).label)})</span>`).join('<br>')}</div></details>` : ''}
      ${qSel}
      ${r.sync_error ? `<p class="tiny" style="margin-top:6px;color:var(--warn)">Last read from ${esc(r.provider_name)} failed: ${esc(r.sync_error)} Showing what was already stored.</p>` : ''}</div>`;
    wire(host, o, r);
  }

  function wire(host, o, r) {
    const c = host.querySelector('[data-sv-connect]'); if (c && o.onConnect) c.onclick = () => o.onConnect();
    const q = host.querySelector('[data-sv-q]');
    if (q) q.onchange = async () => {
      q.disabled = true;
      try { await o.api('/api/survey', { method: 'PUT', body: JSON.stringify({ act: o.act, question_id: q.value }) }); } catch (e) { q.disabled = false; return; }
      mount(host, o);
    };
  }

  window.SurveyCard = { mount };
})();

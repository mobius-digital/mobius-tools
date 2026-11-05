/* ADS > TRYBE (2026-11-05). Every approved creator video gets a fair test in Meta.
 *   Queue    approved videos that never ran: not in Meta yet, or in Meta and Meta never spent on them. Oldest first.
 *   Live     videos whose ads spent in the last 30 days, on Triple Whale sales. Tap one for what the creator says.
 *   Creators the same numbers per creator; Rebook = beats the account's cost per sale and has gone quiet.
 *   Rules    the team's written rules for creator ads, per brand.
 * Agency view lists every brand with a Trybe key. A client login reads Live and Creators for its own brand.
 * Data: account-health /api/trybe (src/trybe.js). Tokens only, no em dashes. */
(() => {
  let H = null, DATA = null, VIEW = 'queue', OPEN = null;
  const $ = s => document.querySelector(s);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const CL = () => !!(H && H.S && H.S.role === 'client');
  const HERE = () => !!(H && H.S && H.S.tab === 'trybe');
  const ah = (p, body, method) => H.apiAH(p, body ? { method: method || 'POST', body: JSON.stringify(body) } : undefined);
  const money = n => (n == null ? '' : '$' + Math.round(+n).toLocaleString('en-US'));
  const pct = n => (n == null ? '' : Math.round(n * 100) + '%');
  const ago = iso => { if (!iso) return 'never'; const h = (Date.now() - Date.parse(iso)) / 36e5; return h < 1 ? 'just now' : h < 24 ? `${Math.round(h)}h ago` : `${Math.round(h / 24)}d ago`; };
  const VIEWS = () => (CL() ? [['live', 'Live'], ['creators', 'Creators']] : [['queue', 'Queue'], ['live', 'Live'], ['creators', 'Creators'], ['rules', 'Rules']]);

  function css() {
    if (document.getElementById('tbcss')) return;
    const st = document.createElement('style'); st.id = 'tbcss';
    st.textContent = `
.tb .tb-top{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;margin:0 0 14px}
.tb .tb-stat{padding:14px 16px}
.tb .tb-stat b{display:block;font-size:22px;line-height:1.15;font-variant-numeric:tabular-nums}
.tb .tb-stat span{display:block;font-size:12.5px;color:var(--muted);margin-top:3px}
.tb .tb-stat.bad b{color:var(--bad)} .tb .tb-stat.good b{color:var(--good)}
.tb .tb-seg{margin:0 0 12px}
.tb .tb-row{display:grid;grid-template-columns:46px minmax(0,1fr) auto;gap:12px;align-items:center;padding:10px 0;border-top:1px solid var(--line)}
.tb .tb-row:first-child{border-top:0}
.tb .tb-row.tap{cursor:pointer}
.tb .tb-th{width:46px;height:80px;border-radius:8px;object-fit:cover;background:var(--panel-2,rgba(127,127,127,.12));display:block}
.tb .tb-nm{font-weight:600;overflow-wrap:anywhere}
.tb .tb-sub{font-size:12.5px;color:var(--muted);margin-top:2px;overflow-wrap:anywhere}
.tb .tb-line{font-size:13px;margin-top:5px;color:var(--text);opacity:.82;overflow-wrap:anywhere}
.tb .tb-nums{display:flex;gap:16px;text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}
.tb .tb-nums div b{display:block;font-size:14.5px} .tb .tb-nums div span{display:block;font-size:11.5px;color:var(--muted)}
.tb .tb-nums .good b{color:var(--good)} .tb .tb-nums .bad b{color:var(--bad)}
.tb .tb-tags{display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end}
.tb .tb-full{grid-column:1 / -1;font-size:13.5px;line-height:1.5;padding:2px 0 6px 58px;white-space:pre-wrap;overflow-wrap:anywhere}
.tb .tb-key{display:flex;gap:8px;flex-wrap:wrap;margin-top:10px}
.tb .tb-key input{flex:1 1 260px;min-width:0;padding:10px 12px;border-radius:10px;border:1px solid var(--line);background:transparent;color:inherit;font:inherit}
.tb textarea{width:100%;min-height:220px;padding:12px;border-radius:10px;border:1px solid var(--line);background:transparent;color:inherit;font:inherit;line-height:1.5;resize:vertical;box-sizing:border-box}
.tb .tb-foot{display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-top:10px}
.tb .v2tbl td.num,.tb .v2tbl th.num{text-align:right;font-variant-numeric:tabular-nums}
.tb .tb-g{color:var(--good)} .tb .tb-b{color:var(--bad)}
.tb .tb-av{width:28px;height:28px;border-radius:50%;object-fit:cover;vertical-align:middle;margin-right:8px;background:var(--panel-2,rgba(127,127,127,.12))}
@media (max-width:900px){
  .tb .tb-top{grid-template-columns:repeat(2,minmax(0,1fr))}
  .tb .tb-row{grid-template-columns:46px minmax(0,1fr)}
  .tb .tb-nums,.tb .tb-tags{grid-column:2;justify-content:flex-start;text-align:left;flex-wrap:wrap;gap:12px}
  .tb .tb-full{padding-left:0}
  .tb .v2btn,.tb .v2jobs button{min-height:44px}
}`;
    document.head.appendChild(st);
  }
  function toast(msg) { const t = document.createElement('div'); t.className = 'lx-toast'; t.textContent = msg; document.body.appendChild(t); setTimeout(() => t.remove(), 2600); }
  const brandName = () => ((H.S.accounts || []).find(a => a.act_id === H.S.act) || {}).name || '';
  const shell = body => `<div class="v2 tb">${H.pageHead('trybe', H.S.act !== 'all' ? `Trybe: ${esc(brandName())}` : 'Trybe')}${body}</div>`;

  async function render(host, first) {
    H = host; css();
    const t = H.RUN();
    const act = H.S.act !== 'all' ? H.S.act : 'all';
    if (first || !DATA || DATA.act !== act) $('#main').innerHTML = shell('<section class="v2card"><p class="v2hint">Reading Trybe…</p></section>');
    let d;
    try { d = await H.apiAH(`/api/trybe?act=${encodeURIComponent(act)}`); if (d && d.error) throw new Error(d.error); }
    catch (e) {
      if (t === H.RUN()) { $('#main').innerHTML = shell(`<section class="v2card"><h3>Could not load Trybe</h3><p class="v2bad">${esc(e.message)}</p><button type="button" class="v2btn" id="tbRetry">Try again</button></section>`); const b = $('#tbRetry'); if (b) b.onclick = () => render(H, true); }
      return;
    }
    if (t !== H.RUN() || !HERE()) return;
    DATA = d; paint();
  }

  function paint() {
    const d = DATA;
    if (d.act === 'all') return paintAll();
    if (!VIEWS().some(v => v[0] === VIEW)) VIEW = VIEWS()[0][0];
    if (!d.has_key) { $('#main').innerHTML = shell(keyCard()); wire(); if (H.pageActions) H.pageActions(''); return; }
    const seg = `<div class="v2jobs tb-seg" role="tablist">${VIEWS().map(([id, label]) => `<button type="button" role="tab" data-tbv="${id}" class="${VIEW === id ? 'on' : ''}" aria-selected="${VIEW === id}">${label}${id === 'queue' && d.counts.queue ? ` (${d.counts.queue})` : ''}</button>`).join('')}</div>`;
    const body = VIEW === 'queue' ? queue() : VIEW === 'live' ? live() : VIEW === 'creators' ? creators() : rules();
    $('#main').innerHTML = shell(`${top()}${seg}${body}<p class="v2hint">Trybe read ${esc(ago(d.synced_at))}. Sales are Triple Whale, spend is Meta, last ${d.account.days} days.</p>`);
    if (H.pageActions) H.pageActions(CL() ? '' : `<button type="button" class="btn" id="tbSync">Read Trybe now</button>${d.portal ? `<a class="btn primary" id="tbOpen" href="${esc(d.portal)}" target="_blank" rel="noopener">Launch in Trybe</a>` : ''}`);
    wire();
  }

  function top() {
    const d = DATA, a = d.account, c = d.counts;
    const cmp = a.trybe_cpa != null && a.cpa != null ? (a.trybe_cpa <= a.cpa ? 'good' : 'bad') : '';
    const cells = [];
    if (!CL()) cells.push(`<div class="v2card tb-stat ${c.stale ? 'bad' : ''}"><b>${c.queue}</b><span>approved, never run${c.queue ? `. Oldest ${c.oldest} days` : ''}</span></div>`);
    cells.push(`<div class="v2card tb-stat"><b>${a.share == null ? '0%' : pct(a.share)}</b><span>of Meta spend is creator videos (${money(a.trybe_spend)} of ${money(a.spend)})</span></div>`);
    cells.push(`<div class="v2card tb-stat ${cmp}"><b>${a.trybe_cpa == null ? 'No sales yet' : money(a.trybe_cpa)}</b><span>a sale on creator videos${a.cpa != null ? `. The account: ${money(a.cpa)}` : ''}</span></div>`);
    cells.push(`<div class="v2card tb-stat"><b>${c.live}</b><span>videos live from ${c.creators} creator${c.creators === 1 ? '' : 's'}</span></div>`);
    if (!CL()) cells.push(`<div class="v2card tb-stat"><b>${c.rebook}</b><span>creator${c.rebook === 1 ? '' : 's'} to rebook</span></div>`);
    return `<div class="tb-top">${cells.slice(0, 4).join('')}</div>`;
  }

  const thumb = r => (r.thumb ? `<img class="tb-th" loading="lazy" alt="" src="${esc(r.thumb)}">` : '<span class="tb-th"></span>');
  function queue() {
    const d = DATA, q = d.queue || [];
    if (!q.length) return `<section class="v2card"><div class="v2h"><h3>Nothing is waiting</h3></div><p class="v2hint">Every approved video has run as an ad.</p></section>`;
    const rows = q.map(r => `<div class="tb-row">${thumb(r)}
      <div><div class="tb-nm">${esc(r.creator)}</div><div class="tb-sub">${esc([r.product, r.program].filter(Boolean).join(' · '))}</div>${r.line ? `<div class="tb-line">${esc(r.line)}</div>` : ''}</div>
      <div class="tb-tags"><span class="v2pill ${r.days >= d.stale_days ? 'bad' : ''}">${r.days} day${r.days === 1 ? '' : 's'} waiting</span><span class="v2pill ${r.state === 'no_delivery' ? 'warn' : ''}">${r.state === 'no_delivery' ? `In Meta, no spend${r.meta_on ? '' : ' (off)'}` : 'Not in Meta'}</span>${r.creator_orders > 0 ? `<span class="v2pill good">Creator has ${Math.round(r.creator_orders)} sales</span>` : ''}</div>
    </div>`).join('');
    return `<section class="v2card"><div class="v2h"><h3>${q.length} approved video${q.length === 1 ? '' : 's'} never ran</h3><span class="cap">${d.counts.not_in_meta} not in Meta · ${d.counts.no_delivery} in Meta with no spend</span></div>
      <p class="v2hint">Oldest first. Launch them from Trybe (Ads, Build Ads, the Ready rows), so each runs as a partnership ad and the creator gets paid. A video leaves this list once Meta spends on it.</p>${rows}</section>`;
  }
  function live() {
    const d = DATA, v = d.live || [], a = d.account;
    if (!v.length) return `<section class="v2card"><div class="v2h"><h3>No creator video spent in the last ${a.days} days</h3></div><p class="v2hint">A video shows here once an ad named with its Trybe id spends.</p></section>`;
    const rows = v.map(r => {
      const cls = r.cpa != null && a.cpa != null ? (r.cpa <= a.cpa ? 'good' : 'bad') : '';
      return `<div class="tb-row ${r.transcript ? 'tap' : ''}" data-tbopen="${esc(r.sub_id)}">${thumb(r)}
      <div><div class="tb-nm">${esc(r.creator)}</div><div class="tb-sub">${esc([r.product, `${r.on} of ${r.ads} ad${r.ads === 1 ? '' : 's'} on`].filter(Boolean).join(' · '))}</div>${r.line ? `<div class="tb-line">${esc(r.line)}</div>` : ''}</div>
      <div class="tb-nums"><div><b>${money(r.spend)}</b><span>spent</span></div><div><b>${Math.round(r.orders * 10) / 10}</b><span>sales</span></div><div class="${cls}"><b>${r.cpa == null ? 'none' : money(r.cpa)}</b><span>a sale</span></div><div><b>${r.roas == null ? '' : r.roas.toFixed(2)}</b><span>ROAS</span></div></div>
      ${OPEN === r.sub_id && r.transcript ? `<div class="tb-full">${esc(r.transcript)}</div>` : ''}</div>`;
    }).join('');
    return `<section class="v2card"><div class="v2h"><h3>${v.length} video${v.length === 1 ? '' : 's'} live</h3><span class="cap">Biggest spend first${a.cpa != null ? ` · the account pays ${money(a.cpa)} a sale` : ''}</span></div>${CL() ? '' : '<p class="v2hint">Tap a video to read what the creator says. The line that works goes in next week\'s brief.</p>'}${rows}</section>`;
  }
  function creators() {
    const d = DATA, c = d.creators || [], a = d.account;
    if (!c.length) return `<section class="v2card"><div class="v2h"><h3>No creator has a live video yet</h3></div></section>`;
    const rows = c.map(r => `<tr><td>${r.avatar ? `<img class="tb-av" loading="lazy" alt="" src="${esc(r.avatar)}">` : ''}<span class="nm">${esc(r.name)}</span>${r.rebook && !CL() ? ' <span class="v2pill good">Rebook</span>' : ''}</td>
      <td class="num" data-l="Videos">${r.videos}</td><td class="num" data-l="Spent">${money(r.spend)}</td><td class="num" data-l="Sales">${Math.round(r.orders * 10) / 10}</td>
      <td class="num" data-l="A sale">${r.cpa == null ? 'none' : `<span class="${a.cpa != null ? (r.cpa <= a.cpa ? 'tb-g' : 'tb-b') : ''}">${money(r.cpa)}</span>`}</td><td class="num" data-l="Revenue">${money(r.revenue)}</td>
      <td class="num" data-l="Last video">${r.quiet_days == null ? '' : `${r.quiet_days}d ago`}</td></tr>`).join('');
    return `<section class="v2card"><div class="v2h"><h3>Creators by revenue</h3><span class="cap">Triple Whale, last ${a.days} days</span></div>
      ${CL() ? '' : `<p class="v2hint">Rebook = at least 2 sales at or under the account's cost per sale${a.cpa != null ? ` (${money(a.cpa)})` : ''}, and no new video in ${d.rebook_days} days.</p>`}
      <div class="v2tbl"><table><thead><tr><th>Creator</th><th class="num">Videos</th><th class="num">Spent</th><th class="num">Sales</th><th class="num">A sale</th><th class="num">Revenue</th><th class="num">Last video</th></tr></thead><tbody>${rows}</tbody></table></div></section>`;
  }
  function rules() {
    const d = DATA;
    return `<section class="v2card"><div class="v2h"><h3>The rules for creator ads</h3><span class="cap">${d.rules_default ? 'The starting set. Edit them for this brand.' : 'Set for this brand'}</span></div>
      <p class="v2hint">Written the way you would hand them to a new buyer. One rule per line.</p>
      <textarea id="tbRules" spellcheck="true">${esc(d.rules || '')}</textarea>
      <div class="tb-foot"><button type="button" class="v2btn" id="tbRulesSave">Save rules</button><span class="v2hint">Trybe key checked ${esc(ago(d.key_at))}. <button type="button" class="v2link" id="tbKeyNew">Change the key</button></span></div></section>`;
  }
  function keyCard() {
    if (CL()) return `<section class="v2card"><div class="v2h"><h3>Trybe is not connected yet</h3></div><p class="v2hint">Your Mobius team connects it. Your creators' results show here once they do.</p></section>`;
    return `<section class="v2card"><div class="v2h"><h3>Connect ${esc(brandName())} to Trybe</h3></div>
      <p class="v2hint">Paste this brand's Trybe API key (Trybe brand portal, Settings, API). It starts with tk_live_. Locus checks it with Trybe before keeping it, and never shows it again.</p>
      <div class="tb-key"><input id="tbKey" type="password" autocomplete="off" placeholder="tk_live_..." aria-label="Trybe API key"><button type="button" class="v2btn" id="tbKeySave">Connect</button></div>
      <p class="v2bad" id="tbKeyErr" hidden></p></section>`;
  }
  function paintAll() {
    const d = DATA, b = d.brands || [];
    const rows = b.map(r => `<tr class="link" data-tbact="${esc(r.act_id)}"><td><span class="nm">${esc(r.name)}</span>${r.has_key ? '' : ' <span class="v2pill warn">No key</span>'}</td>
      <td class="num" data-l="Never run">${r.queue}</td><td class="num" data-l="Over ${d.stale_days} days">${r.stale ? `<span class="tb-b">${r.stale}</span>` : '0'}</td><td class="num" data-l="Oldest">${r.queue ? `${r.oldest}d` : ''}</td><td class="num" data-l="Waiting on review">${r.pending}</td><td class="num" data-l="Approved">${r.approved}</td><td class="num" data-l="Read">${esc(ago(r.synced_at))}</td></tr>`).join('');
    const waiting = b.reduce((s, r) => s + r.queue, 0);
    const none = (d.no_key || []).map(x => `<button type="button" class="v2link" data-tbact="${esc(x.act_id)}">${esc(x.name)}</button>`).join(', ');
    $('#main').innerHTML = shell(`<section class="v2card"><div class="v2h"><h3>${waiting} approved video${waiting === 1 ? '' : 's'} never ran</h3><span class="cap">across ${b.length} brand${b.length === 1 ? '' : 's'}</span></div>
      ${b.length ? `<div class="v2tbl"><table><thead><tr><th>Brand</th><th class="num">Never run</th><th class="num">Over ${d.stale_days} days</th><th class="num">Oldest</th><th class="num">Waiting on review</th><th class="num">Approved</th><th class="num">Read</th></tr></thead><tbody>${rows}</tbody></table></div>` : '<p class="v2hint">No brand has a Trybe key yet. Open a brand to connect it.</p>'}
      ${none ? `<p class="v2hint">Not connected: ${none}</p>` : ''}</section>`);
    if (H.pageActions) H.pageActions('');
    wire();
  }

  function wire() {
    const root = $('#main'); if (!root) return;
    root.querySelectorAll('[data-tbv]').forEach(b => { b.onclick = () => { VIEW = b.dataset.tbv; OPEN = null; paint(); }; });
    root.querySelectorAll('[data-tbopen]').forEach(r => { r.onclick = () => { OPEN = OPEN === r.dataset.tbopen ? null : r.dataset.tbopen; paint(); }; });
    root.querySelectorAll('[data-tbact]').forEach(r => { r.onclick = () => { if (H.setViewAct) H.setViewAct(r.dataset.tbact); H.show('trybe'); }; });
    const sync = document.getElementById('tbSync');
    if (sync) sync.onclick = async () => { sync.disabled = true; sync.textContent = 'Reading…'; try { await ah('/api/trybe/sync', { act: H.S.act }); toast('Trybe read'); await render(H, false); } catch (e) { toast(e.message); sync.disabled = false; sync.textContent = 'Read Trybe now'; } };
    const save = $('#tbRulesSave');
    if (save) save.onclick = async () => { save.disabled = true; try { const r = await ah('/api/trybe/rules', { act: H.S.act, rules: $('#tbRules').value }, 'PUT'); DATA.rules = r.rules; DATA.rules_default = r.rules_default; toast('Rules saved'); paint(); } catch (e) { toast(e.message); save.disabled = false; } };
    const kn = $('#tbKeyNew'); if (kn) kn.onclick = () => { DATA.has_key = false; paint(); };
    const ks = $('#tbKeySave');
    if (ks) ks.onclick = async () => {
      const err = $('#tbKeyErr'); err.hidden = true; ks.disabled = true; ks.textContent = 'Checking with Trybe…';
      try { await ah('/api/trybe/key', { act: H.S.act, key: $('#tbKey').value }, 'PUT'); toast('Connected'); await render(H, true); }
      catch (e) { err.textContent = e.message; err.hidden = false; ks.disabled = false; ks.textContent = 'Connect'; }
    };
  }

  window.TrybeTab = { render };
})();

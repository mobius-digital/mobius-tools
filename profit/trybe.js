/* ADS > TRYBE (2026-11-05, v3 the same day after Cole's first look). Every approved creator video gets a fair test in Meta.
 *   Queue    approved videos Trybe has never seen deliver. "Not launched" is the backlog; the rest are in Meta already
 *            (on with no spend yet, scheduled, in review, off). Press a thumbnail to watch the video.
 *   Live     videos whose ads spent in the last 30 days, on Triple Whale sales. On now / Off / All.
 *   Creators the same numbers per creator. "Ask for more" = beats the account's CPA and has gone quiet. A name opens the creator.
 *   Rules    the team's written rules for creator ads, per brand.
 * Every list has a search box, a filter and a sort. Decisions on an ad (scale, cut) stay on Ads > Calls, where the call
 * rules and the Change Log live; this page shows what to launch, who is winning and who to ask for more.
 * Agency view lists every brand with a Trybe key. A client login reads Live and Creators for its own brand.
 * Data: account-health /api/trybe (src/trybe.js). Tokens only, no em dashes. */
(() => {
  let H = null, DATA = null, VIEW = 'queue';
  const UI = { queue: { q: '', f: 'not_launched', p: '', s: 'wait' }, live: { q: '', f: 'on', p: '', s: 'spend' }, creators: { q: '', f: 'all', s: 'revenue' } };
  const $ = s => document.querySelector(s);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const CL = () => !!(H && H.S && H.S.role === 'client');
  const HERE = () => !!(H && H.S && H.S.tab === 'trybe');
  const ah = (p, body, method) => H.apiAH(p, body ? { method: method || 'POST', body: JSON.stringify(body) } : undefined);
  const money = n => (n == null ? '' : '$' + Math.round(+n).toLocaleString('en-US'));
  const pct = n => (n == null ? '' : Math.round(n * 100) + '%');
  const n1 = n => String(Math.round((+n || 0) * 10) / 10);
  const ago = iso => { if (!iso) return 'never'; const h = (Date.now() - Date.parse(iso)) / 36e5; return h < 1 ? 'just now' : h < 24 ? `${Math.round(h)}h ago` : `${Math.round(h / 24)}d ago`; };
  /* Briefs = the creator link page (page id amb), opened as its own page; the shell draws this same switch above it. */
  const VIEWS = () => (CL() ? [['live', 'Live'], ['creators', 'Creators'], ['briefs', 'Briefs']] : [['review', 'Review'], ['queue', 'Queue'], ['live', 'Live'], ['creators', 'Creators'], ['follow', 'Follow up'], ['recuts', 'Recuts'], ['discord', 'Discord'], ['briefs', 'Briefs'], ['rules', 'Rules']]);
  const STATE = { not_launched: ['Not launched', 'bad'], no_spend: ['Launched, no spend yet', 'warn'], scheduled: ['Scheduled', ''], review: ['In Meta review', ''], rejected: ['Rejected by Meta', 'bad'], off: ['In Meta, turned off', ''] };

  function css() {
    if (document.getElementById('tbcss')) return;
    const st = document.createElement('style'); st.id = 'tbcss';
    st.textContent = `
.tb .tb-meta{font-size:12.5px;color:var(--muted);margin:-4px 0 14px}
.tb .tb-top{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;margin:0 0 14px}
.tb .tb-stat{padding:12px 16px}
.tb .tb-stat .l{display:block;font-size:11.5px;font-weight:600;letter-spacing:.04em;text-transform:uppercase;color:var(--muted)}
.tb .tb-stat b{display:block;font-size:26px;line-height:1.2;margin-top:4px;font-variant-numeric:tabular-nums}
.tb .tb-stat .s{display:block;font-size:12px;color:var(--muted);margin-top:2px;min-height:15px}
.tb .tb-stat.bad b{color:var(--bad)} .tb .tb-stat.good b{color:var(--good)} .tb .tb-stat.warn b{color:var(--warn,#d9a441)}
.tb .tb-seg{margin:0 0 12px}
.tb .tb-bar{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin:0 0 6px}
.tb .tb-bar input,.tb .tb-bar select{padding:8px 10px;border-radius:9px;border:1px solid var(--line);background:var(--panel,transparent);color:inherit;font:inherit;font-size:13.5px;min-width:0}
.tb .tb-bar input{flex:1 1 180px}
.tb .tb-bar label{font-size:12px;color:var(--muted);display:flex;align-items:center;gap:6px}
.tb .tb-row{display:grid;grid-template-columns:54px minmax(0,1fr) auto;gap:14px;align-items:center;padding:12px 0;border-top:1px solid var(--line)}
.tb .tb-play{position:relative;width:54px;height:96px;padding:0;border:0;border-radius:8px;overflow:hidden;background:var(--panel-2,rgba(127,127,127,.14));cursor:pointer;display:block}
.tb .tb-play img{width:100%;height:100%;object-fit:cover;display:block}
.tb .tb-play::after{content:'';position:absolute;left:50%;top:50%;margin:-7px 0 0 -4px;border-style:solid;border-width:7px 0 7px 11px;border-color:transparent transparent transparent #fff;filter:drop-shadow(0 0 3px rgba(0,0,0,.7))}
.tb .tb-nm{overflow-wrap:anywhere;background:none;border:0;padding:0;color:inherit;font:inherit;font-weight:600;cursor:pointer;text-align:left}
.tb .tb-nm:hover{text-decoration:underline}
.tb .tb-sub{font-size:12.5px;color:var(--muted);margin-top:2px;overflow-wrap:anywhere}
.tb .tb-line{font-size:13px;margin-top:5px;opacity:.85;overflow-wrap:anywhere;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.tb .tb-nums{display:grid;grid-template-columns:repeat(4,64px);gap:6px;text-align:right;font-variant-numeric:tabular-nums}
.tb .tb-nums div span{display:block;font-size:11px;font-weight:600;letter-spacing:.04em;text-transform:uppercase;color:var(--muted)}
.tb .tb-nums div b{display:block;font-size:15px;margin-top:1px}
.tb .tb-g{color:var(--good)} .tb .tb-b{color:var(--bad)}
.tb .tb-tags{display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end;max-width:300px}
.tb .tb-key{display:flex;gap:8px;flex-wrap:wrap;margin-top:10px}
.tb .tb-key input{flex:1 1 260px;min-width:0;padding:10px 12px;border-radius:10px;border:1px solid var(--line);background:transparent;color:inherit;font:inherit}
.tb textarea{width:100%;min-height:220px;padding:12px;border-radius:10px;border:1px solid var(--line);background:transparent;color:inherit;font:inherit;line-height:1.5;resize:vertical;box-sizing:border-box}
.tb .tb-foot{display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-top:10px}
.tb .v2tbl td.num,.tb .v2tbl th.num{text-align:right;font-variant-numeric:tabular-nums}
.tb .tb-av,.tb-pop .tb-av{width:28px;height:28px;border-radius:50%;object-fit:cover;vertical-align:middle;margin-right:8px;background:var(--panel-2,rgba(127,127,127,.12))}
.tb-pop{position:fixed;inset:0;z-index:1000;background:rgba(0,0,0,.6);display:flex;align-items:center;justify-content:center;padding:20px}
.tb-pop .tb-sheet{background:var(--panel,#1c1c20);color:var(--text,inherit);border:1px solid var(--line);border-radius:16px;width:min(720px,100%);max-height:90vh;overflow:auto;padding:20px;box-sizing:border-box}
.tb-pop .tb-sheet.vid{width:min(400px,100%)}
.tb-pop video,.tb-pop .tb-img{width:100%;max-height:62vh;border-radius:10px;background:#000;display:block}
.tb-pop h3{margin:0 0 4px;font-size:18px} .tb-pop .x{float:right;background:none;border:0;color:inherit;font-size:22px;line-height:1;cursor:pointer;padding:4px 8px}
.tb-pop .tb-sub{font-size:12.5px;color:var(--muted);margin-top:2px;overflow-wrap:anywhere}
.tb-pop .tb-g{color:var(--good)} .tb-pop .tb-b{color:var(--bad)}
.tb-pop .tb-play{position:relative;width:40px;height:70px;padding:0;border:0;border-radius:8px;overflow:hidden;background:rgba(127,127,127,.14);cursor:pointer;display:block}
.tb-pop .tb-play img{width:100%;height:100%;object-fit:cover;display:block}
.tb-pop .tb-kv{display:grid;grid-template-columns:repeat(auto-fit,minmax(110px,1fr));gap:10px;margin:14px 0}
.tb-pop .tb-kv div{border:1px solid var(--line);border-radius:10px;padding:10px 12px}
.tb-pop .tb-kv span{display:block;font-size:11px;font-weight:600;letter-spacing:.04em;text-transform:uppercase;color:var(--muted)}
.tb-pop .tb-kv b{display:block;font-size:18px;margin-top:2px;font-variant-numeric:tabular-nums}
.tb-pop .tb-said{font-size:13.5px;line-height:1.5;margin-top:12px;white-space:pre-wrap;overflow-wrap:anywhere}
.tb .tb-mini{display:grid;grid-template-columns:auto minmax(0,1fr) 120px;gap:14px;align-items:center;padding:12px 0;border-top:1px solid var(--line)}
.tb .tb-mini .v2btn{width:100%;justify-content:center}
@media (max-width:640px){.tb .tb-mini{grid-template-columns:minmax(0,1fr)}.tb .tb-mini>div:first-child:empty{display:none}}
.tb-pop .tb-mini{display:grid;grid-template-columns:40px minmax(0,1fr) auto;gap:10px;align-items:center;padding:8px 0;border-top:1px solid var(--line);font-size:13px}
.tb-pop .tb-foot{display:flex;gap:10px;margin-top:14px}
.tb .tb-sw{display:inline-flex;border:1px solid var(--line);border-radius:10px;padding:2px;gap:2px;background:var(--panel-2,rgba(127,127,127,.08))}
.tb .tb-sw button{border:0;background:none;color:var(--muted);font:inherit;font-size:13px;font-weight:600;padding:6px 12px;border-radius:8px;cursor:pointer;white-space:nowrap}
.tb .tb-sw button.on{background:var(--panel,#fff);color:var(--text,inherit);box-shadow:0 1px 2px rgba(0,0,0,.18)}
.tb .tb-sc-h{display:flex;flex-wrap:wrap;gap:10px;align-items:center;justify-content:space-between}.tb .tb-sc-h h3{margin:0}
.tb .tb-sc-ctl{display:flex;gap:8px;flex-wrap:wrap}
.tb .tb-sc-strip{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:1px;background:var(--line);border:1px solid var(--line);border-radius:12px;overflow:hidden;margin:4px 0 14px}
.tb .tb-sc-strip>div{background:var(--panel,transparent);padding:12px 14px}
.tb .tb-sc-strip span,.tb .tb-pc-nums span{display:block;font-size:11px;font-weight:600;letter-spacing:.04em;text-transform:uppercase;color:var(--muted)}
.tb .tb-sc-strip b{display:block;font-size:22px;margin-top:2px;font-variant-numeric:tabular-nums}
.tb .tb-sc-strip i{display:block;font-style:normal;font-size:12px;color:var(--muted)}
.tb .tb-pcs{display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:12px}
.tb .tb-pc{display:flex;flex-direction:column;gap:10px;text-align:left;font:inherit;color:inherit;background:var(--panel,transparent);border:1px solid var(--line);border-left:4px solid var(--line);border-radius:12px;padding:14px 16px;cursor:default;width:100%;box-sizing:border-box}
.tb button.tb-pc{cursor:pointer}.tb button.tb-pc:hover{border-color:var(--muted)}
.tb .tb-pc.good{border-left-color:var(--good)}.tb .tb-pc.bad{border-left-color:var(--bad)}
.tb .tb-pc-h{display:flex;gap:8px;align-items:center;flex-wrap:wrap}.tb .tb-pc-h b{font-size:15.5px;margin-right:auto}
.tb .tb-pc-cpa b{font-size:30px;line-height:1.1;font-variant-numeric:tabular-nums;margin-right:8px}.tb .tb-pc-cpa span{font-size:12.5px;color:var(--muted)}
.tb .tb-pc-bar{height:5px;border-radius:3px;background:var(--panel-2,rgba(127,127,127,.15));overflow:hidden}.tb .tb-pc-bar i{display:block;height:100%;background:currentColor;opacity:.55}
.tb .tb-pc.good .tb-pc-bar i{background:var(--good);opacity:1}.tb .tb-pc.bad .tb-pc-bar i{background:var(--bad);opacity:1}
.tb .tb-pc-nums{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:6px;font-variant-numeric:tabular-nums}.tb .tb-pc-nums b{display:block;font-size:14.5px;margin-top:1px}
.tb .tb-pc-flow{display:flex;gap:6px;flex-wrap:wrap;align-items:center;font-size:12.5px;color:var(--muted)}.tb .tb-pc-flow b{color:var(--text,inherit)}
.tb .tb-pc-foot{display:flex;gap:6px 14px;flex-wrap:wrap;font-size:12.5px;color:var(--muted);border-top:1px solid var(--line);padding-top:8px}
.tb .tb-qgrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:10px}
.tb .tb-q{display:flex;flex-direction:column;gap:8px;text-align:left;font:inherit;color:inherit;background:var(--panel,transparent);border:1px solid var(--line);border-radius:12px;padding:12px 14px;cursor:pointer}
.tb .tb-q:hover{border-color:var(--muted)}.tb .tb-q.late{border-left:4px solid var(--bad)}.tb .tb-q.clear{opacity:.8}
.tb .tb-q-nm{font-weight:700}.tb .tb-q-big{display:flex;align-items:baseline;gap:8px}.tb .tb-q-big b{font-size:28px;line-height:1;font-variant-numeric:tabular-nums}.tb .tb-q-big span{font-size:13px;color:var(--muted)}
.tb .tb-q.late .tb-q-big b{color:var(--bad)}.tb .tb-q-chips{display:flex;gap:6px;flex-wrap:wrap}
.tb .tb-alert{justify-content:space-between;border-top:1px solid var(--line);padding-top:12px;margin-top:14px}
.tb .tb-job{display:flex;gap:14px;align-items:center;padding:10px 0;border-top:1px solid var(--line)}.tb .tb-job-n{text-align:right;flex:none;min-width:56px}.tb .tb-job-n b{font-size:22px}
.tb .tb-week{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:10px}.tb .tb-day{padding:12px 14px}.tb .tb-day.on{outline:2px solid var(--accent,#2f6bff)}
.tb .tb-rules{margin:0;padding-left:20px;line-height:1.5}.tb .tb-rules li{margin:0 0 6px}
.tb .tb-rc{display:grid;grid-template-columns:auto auto minmax(0,1fr);gap:10px;align-items:start;padding:12px 0;border-top:1px solid var(--line)}.tb .tb-rc-pick{padding-top:4px}.tb .tb-rc-main{display:grid;gap:6px;min-width:0}.tb .tb-rc-row{display:flex;gap:8px;align-items:center;flex-wrap:wrap}.tb .tb-rc-row select{font:inherit;padding:5px 8px;border-radius:8px;border:1px solid var(--line);background:transparent;color:inherit}.tb .tb-rc-why{flex:1 1 220px;min-width:0}.tb .tb-rc .tb-note{width:100%}.tb .tb-recut{margin-top:12px;display:grid;gap:8px}
.tb .tb-fu-g{margin-top:14px}.tb .tb-fu{padding:12px 0;border-top:1px solid var(--line);display:grid;gap:8px}
.tb .tb-fu-who{display:flex;align-items:center;gap:4px 10px;flex-wrap:wrap}.tb .tb-fu-who .tb-av{margin:0}
.tb .tb-fu-msg{min-height:96px}.tb .tb-fu-act a.v2btn{text-decoration:none}.tb .tb-fu-act{display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end}
@media (max-width:900px){
  .tb .tb-top{grid-template-columns:repeat(2,minmax(0,1fr))}
  .tb .tb-row{grid-template-columns:54px minmax(0,1fr)}
  .tb .tb-nums{grid-column:1 / -1;grid-template-columns:repeat(4,1fr);text-align:left}
  .tb .tb-tags{grid-column:1 / -1;justify-content:flex-start;max-width:none}
  .tb .v2btn,.tb .v2jobs button,.tb .tb-bar input,.tb .tb-bar select{min-height:44px}
  .tb .tb-sc-strip{grid-template-columns:repeat(2,minmax(0,1fr))}
  .tb .tb-pcs,.tb .tb-qgrid{grid-template-columns:minmax(0,1fr)}
  .tb .tb-sw button{min-height:40px}
  .tb .tb-sc-h{flex-direction:column;align-items:flex-start}.tb .tb-sc-ctl{width:100%}.tb .tb-sc-ctl .tb-sw{flex:1 1 auto}.tb .tb-sc-ctl .tb-sw button{flex:1}
  .tb .tb-fu-msg{min-height:140px}
  .tb .tb-fu-act .v2btn{flex:1 1 auto;justify-content:center}
  .tb-pop{align-items:flex-end;padding:0}
  .tb-pop .tb-sheet,.tb-pop .tb-sheet.vid{width:100%;max-height:92vh;border-radius:18px 18px 0 0;border-bottom:0}
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

  function paint(keepFocus) {
    const d = DATA;
    if (d.act === 'all') return paintAll();
    if (VIEW === 'briefs' || !VIEWS().some(v => v[0] === VIEW)) VIEW = VIEWS()[0][0];
    if (H.S.act === 'brand_lucky_golf' && !CL()) return paintLucky();
    if (!d.has_key) { $('#main').innerHTML = shell(keyCard()); wire(); if (H.pageActions) H.pageActions(''); return; }
    const c = d.counts;
    const badge = { review: c.pending, queue: c.not_launched, live: c.live, creators: c.creators };
    const seg = `<div class="v2jobs tb-seg" role="tablist">${VIEWS().map(([id, label]) => `<button type="button" role="tab" data-tbv="${id}" class="${VIEW === id ? 'on' : ''}" aria-selected="${VIEW === id}">${label}${badge[id] != null ? ` (${badge[id]})` : ''}</button>`).join('')}</div>`;
    const body = VIEW === 'queue' ? queue() : VIEW === 'live' ? live() : VIEW === 'creators' ? creators() : VIEW === 'discord' ? '<section class="v2card" id="tbDc"><p class="v2hint">Reading the Discord…</p></section>' : VIEW === 'review' ? '<section class="v2card" id="tbRv"><p class="v2hint">Getting the videos waiting in Trybe…</p></section>' : VIEW === 'follow' ? '<section class="v2card" id="tbFu"><p class="v2hint">Reading creators and samples from Trybe…</p></section>' : VIEW === 'recuts' ? '<section class="v2card" id="tbRc"><p class="v2hint">Reading last month&rsquo;s best sellers…</p></section>' : rules();
    const meta = `<p class="tb-meta">Updated ${esc(ago(d.synced_at))}. ${CL() ? '' : 'Locus reads Trybe and Meta once a day; press Update for now. '}Sales and revenue are Triple Whale, spend is Meta, last ${d.account.days} days.</p>`;
    $('#main').innerHTML = shell(`${meta}${top()}${seg}${body}`);
    if (H.pageActions) H.pageActions(CL() ? '' : `<button type="button" class="btn" id="tbSync">Update</button>${d.portal ? `<a class="btn primary" id="tbOpen" href="${esc(d.portal)}" target="_blank" rel="noopener">Launch in Trybe</a>` : ''}`);
    wire();
    if (VIEW === 'discord') discordView();
    if (VIEW === 'review') reviewView();
    if (VIEW === 'follow') followView();
    if (VIEW === 'recuts') recutView();
    if (keepFocus) { const el = document.getElementById(keepFocus); if (el) { el.focus(); try { el.setSelectionRange(el.value.length, el.value.length); } catch {} } }
  }

  function top() {
    const d = DATA, a = d.account, c = d.counts;
    const tile = (l, b, s, cls) => `<div class="v2card tb-stat ${cls || ''}"><span class="l">${l}</span><b>${b}</b><span class="s">${s || ''}</span></div>`;
    const cmp = a.trybe_cpa != null && a.cpa != null ? (a.trybe_cpa <= a.cpa ? 'good' : 'bad') : '';
    const t = [];
    if (!CL()) t.push(tile('Not launched', c.not_launched, c.not_launched ? `oldest ${c.oldest} days` : 'nothing waiting', c.stale ? 'bad' : ''));
    if (!CL()) t.push(tile('Launched, no spend', c.no_spend, c.other ? `${c.other} more off or scheduled` : 'on in Meta, waiting', c.no_spend ? 'warn' : ''));
    t.push(tile('Share of Meta spend', a.share == null ? '0%' : pct(a.share), `${money(a.trybe_spend)} of ${money(a.spend)}`));
    t.push(tile('Creator CPA', a.trybe_cpa == null ? 'none' : money(a.trybe_cpa), a.cpa != null ? `account CPA ${money(a.cpa)}` : '', cmp));
    t.push(tile('Live videos', c.live, `${c.creators} creator${c.creators === 1 ? '' : 's'}`));
    if (!CL()) t.push(tile('Ask for more', c.rebook, 'winners gone quiet', c.rebook ? 'good' : ''));
    return `<div class="tb-top">${t.join('')}</div>`;
  }

  /* ---- Review (2026-11-05): the videos waiting in Trybe, approved or sent back from here (account-health /api/trybe/review).
     Approving pays the creator for that video and notifies them, exactly like the button in Trybe. ---- */
  async function reviewView() {
    const box = document.getElementById('tbRv'); if (!box) return;
    const act = H.S.act;
    let r;
    try { r = await H.apiAH('/api/trybe/review?act=' + encodeURIComponent(act)); if (r && r.error) throw new Error(r.error); }
    catch (e) { box.innerHTML = `<p class="v2bad">${esc(e.message)}</p>`; return; }
    const items = r.items || [];
    box.innerHTML = `<div class="v2h"><h3>${items.length} video${items.length === 1 ? '' : 's'} waiting for review</h3><span class="cap">oldest first</span></div>
      <p class="v2hint">Approve pays the creator for the video and tells them, the same as in Trybe. Changes and Reject send your note to the creator.</p>` +
      (items.length ? items.map(v => `<div class="tb-mini" data-rid="${esc(v.id)}">${v.thumb ? `<button type="button" class="tb-th" data-rvplay="${esc(v.id)}" style="width:56px;height:84px;border:0;border-radius:8px;cursor:pointer;background:#000 center/cover no-repeat;background-image:url('${esc(v.thumb)}')" aria-label="Watch"></button>` : '<div></div>'}<div><div><b>${esc(v.creator)}</b> ${esc(v.product || '')}${v.angle ? ` · ${esc(v.angle)}` : ''}</div><div class="tb-sub">${esc(v.created_at ? ago(v.created_at) : '')}${v.line ? ` · "${esc(v.line)}"` : ''}</div><input class="tb-note" placeholder="Note to the creator" style="width:100%;margin-top:6px;padding:6px 8px;border-radius:8px;border:1px solid var(--line);background:transparent;color:inherit;font:inherit;font-size:13px"></div><div style="display:flex;flex-direction:column;gap:6px"><button type="button" class="v2btn" data-rd="approve">Approve</button><button type="button" class="v2btn ghost" data-rd="changes">Changes</button><button type="button" class="v2btn ghost" data-rd="reject">Reject</button></div></div>`).join('') : '<p class="v2hint">Nothing waiting.</p>');
    box.querySelectorAll('[data-rvplay]').forEach(b => { b.onclick = () => watchSub(b.dataset.rvplay); });
    box.querySelectorAll('[data-rd]').forEach(b => { b.onclick = async () => {
      const row = b.closest('[data-rid]'); const comment = row.querySelector('.tb-note').value.trim();
      if (b.dataset.rd === 'changes' && !comment) return toast('Say what to change');
      row.querySelectorAll('button').forEach(x => { x.disabled = true; });
      try { const x = await H.apiAH('/api/trybe/review', { method: 'POST', body: JSON.stringify({ act, id: row.dataset.rid, decision: b.dataset.rd, comment }) }); if (x && x.error) throw new Error(x.error); toast(b.dataset.rd === 'approve' ? 'Approved in Trybe' : 'Sent to the creator'); row.remove(); }
      catch (e) { toast(e.message); row.querySelectorAll('button').forEach(x => { x.disabled = false; }); }
    }; });
  }
  /* Recut from any video popup (2026-11-06 v2): makes one pipeline card for Ravo with the full brief. */
  function recutUI(box, sub) {
    const el = document.createElement('div');
    el.className = 'tb-recut';
    el.innerHTML = `<p class="v2hint">Recut this video: a card goes into the pipeline for Ravo with the numbers, the test and the original file. The original keeps running.</p>
      <textarea class="tb-note" rows="2" placeholder="Note for Ravo, e.g. open on the line at 0:12"></textarea>
      <div class="tb-foot"><span></span><button type="button" class="v2btn">Add a recut card</button></div>`;
    box.appendChild(el);
    const btn = el.querySelector('button');
    btn.onclick = async () => {
      btn.disabled = true; btn.textContent = 'Making the card…';
      try {
        const c = await makeRecutCard(H.S.act, { sub_id: sub, note: el.querySelector('textarea').value.trim() });
        await H.apiAH('/api/trybe/recut-announce', { method: 'POST', body: JSON.stringify({ act: H.S.act, cards: [c] }) }).catch(() => null);
        btn.textContent = `Card #${c.num} made`; toast('In the pipeline, Ravo told in Slack');
      } catch (e) { toast(e.message); btn.disabled = false; btn.textContent = 'Add a recut card'; }
    };
  }
  async function watchSub(sub) {
    const w = pop(`<h3>Video</h3><div id="tbVid"><p class="v2hint">Getting the video from Trybe…</p></div>`, 'vid');
    try {
      const v = await H.apiAH(`/api/trybe/video?act=${encodeURIComponent(H.S.act)}&sub=${encodeURIComponent(sub)}`);
      const box = w.querySelector('#tbVid'); if (!box) return;
      box.innerHTML = !v.url ? '<p class="v2bad">Trybe has no file for this one.</p>' : v.media === 'image' ? `<img class="tb-img" alt="" src="${esc(v.url)}">` : `<video controls autoplay playsinline src="${esc(v.url)}"></video>`;
      if (v.url && v.media !== 'image') recutUI(box, sub);
    } catch (e) { const box = w.querySelector('#tbVid'); if (box) box.innerHTML = `<p class="v2bad">${esc(e.message)}</p>`; }
  }

  /* ---- Lucky (2026-11-05): Lucky's creators live in its own app. This view reads the app live and acts through it
     (account-health /api/lucky/*, src/lucky.js): review videos, this week's board, creators, the Clubhouse and announcements. */
  let LV = 'review';
  const LVIEWS = [['review', 'Review'], ['week', 'This week'], ['lcreators', 'Creators'], ['clubhouse', 'Discord']];
  async function paintLucky() {
    const seg = `<div class="v2jobs tb-seg" role="tablist">${LVIEWS.map(([id, l]) => `<button type="button" role="tab" data-lv="${id}" class="${LV === id ? 'on' : ''}">${l}</button>`).join('')}</div>`;
    $('#main').innerHTML = shell(`<p class="tb-meta">Lucky runs its own creator app, not Trybe. Everything here is read live from the app, and every button runs inside the app. Money and creator pay stay in the app.</p>${seg}<section class="v2card" id="tbLucky"><p class="v2hint">Reading the Lucky app…</p></section>`);
    if (H.pageActions) H.pageActions(`<a class="btn primary" href="https://creators.luckygolf.com/staff" target="_blank" rel="noopener">Open the Lucky app</a>`);
    document.querySelectorAll('[data-lv]').forEach(b => { b.onclick = () => { LV = b.dataset.lv; paintLucky(); }; });
    const box = document.getElementById('tbLucky');
    const get = p => H.apiAH('/api/lucky/' + p);
    try {
      if (LV === 'review') {
        const r = await get('review-queue');
        const items = r.items || r.queue || r.videos || [];
        box.innerHTML = `<div class="v2h"><h3>${items.length} video${items.length === 1 ? '' : 's'} waiting for review</h3></div>` + (items.length ? items.slice(0, 60).map(v => `<div class="tb-mini" data-lid="${esc(v.id)}"><div></div><div><div><b>${esc(v.creator_first_name || 'Creator')}</b> <span class="v2pill">${esc(v.level || '')}</span> ${esc(v.product || '')}${v.campaign ? ` · ${esc(v.campaign)}` : ''}</div><div class="tb-sub">${esc(v.submitted_at ? ago(v.submitted_at) : '')}${v.video_file ? ` · <a href="${esc(v.video_file)}" target="_blank" rel="noopener">Watch</a>` : (v.post_links && v.post_links[0] ? ` · <a href="${esc(v.post_links[0])}" target="_blank" rel="noopener">Watch</a>` : v.open_in_app ? ` · <a href="${esc(v.open_in_app)}" target="_blank" rel="noopener">Open in the app</a>` : '')}</div><input class="tb-note" placeholder="Note to the creator (optional)" style="width:100%;margin-top:6px;padding:6px 8px;border-radius:8px;border:1px solid var(--line);background:transparent;color:inherit;font:inherit;font-size:13px"></div><div style="text-align:right;display:flex;flex-direction:column;gap:6px"><button type="button" class="v2btn" data-ld="approve">Approve</button><button type="button" class="v2btn ghost" data-ld="changes">Changes</button><button type="button" class="v2btn ghost" data-ld="reject">Reject</button></div></div>`).join('') : '<p class="v2hint">Nothing waiting.</p>');
        box.querySelectorAll('[data-ld]').forEach(b => { b.onclick = async () => {
          const row = b.closest('[data-lid]'); const note = row.querySelector('.tb-note').value.trim();
          if (b.dataset.ld !== 'approve' && !note) return toast('Add a note so the creator knows why');
          row.querySelectorAll('button').forEach(x => { x.disabled = true; });
          try { const x = await H.apiAH('/api/lucky/review', { method: 'POST', body: JSON.stringify({ id: row.dataset.lid, decision: b.dataset.ld, note }) }); if (x && x.error) throw new Error(x.error); toast(b.dataset.ld === 'approve' ? 'Approved in the Lucky app' : 'Sent to the creator'); row.remove(); }
          catch (e) { toast(e.message); row.querySelectorAll('button').forEach(x => { x.disabled = false; }); }
        }; });
      } else if (LV === 'week') {
        const r = await get('this-week');
        const camps = r.campaigns || [], ideas = r.ideas || [];
        box.innerHTML = `<div class="v2h"><h3>What Lucky creators are asked to film</h3></div>${camps.map(c => `<p><b>${esc(c.title || c.name)}</b>${c.due || c.film_by ? ` · film by ${esc(c.due || c.film_by)}` : ''}${c.aces_only ? ' · Aces only' : ''}</p>`).join('')}
          <div class="v2tbl"><table><thead><tr><th>Idea</th><th>First line</th><th>Club</th></tr></thead><tbody>${ideas.slice(0, 40).map(i => `<tr><td>${i.hot ? '<span class="v2pill good">Team pick</span> ' : ''}${esc(i.title)}</td><td>${esc(i.opener || '')}</td><td>${esc(i.club || '')}</td></tr>`).join('')}</tbody></table></div><p class="v2hint">Change the board in the Lucky app (Staff, Board).</p>`;
      } else if (LV === 'lcreators') {
        const r = await get('creators');
        const list = r.creators || r.items || [];
        box.innerHTML = `<div class="v2h"><h3>${list.length} creators</h3></div><div class="v2tbl"><table><thead><tr><th>Creator</th><th>Level</th><th class="num">Uploaded</th><th class="num">Approved</th><th class="num">Ad sales, 30 days</th><th class="num">Last video</th></tr></thead><tbody>${list.map(c => `<tr><td>${esc(c.first_name)}</td><td>${esc(c.level)}</td><td class="num">${c.videos_uploaded ?? ''}</td><td class="num">${c.videos_approved ?? ''}</td><td class="num">${money(c.ad_sales_30d)}</td><td class="num">${esc(c.last_video_at ? ago(c.last_video_at) : 'never')}</td></tr>`).join('')}</tbody></table></div>`;
      } else {
        const r = await get('discord-recap');
        const un = r.unanswered_questions || [];
        const ch = r.channels || [];
        const nx = r.next || [];
        box.innerHTML = `<div class="v2h"><h3>Lucky Clubhouse</h3><span class="cap">${r.members ?? ''} members</span></div>
          <h3 style="font-size:14px;margin:6px 0">Waiting on an answer (${un.length})</h3>${un.length ? un.map(q => `<div class="tb-mini"><div></div><div><b>${esc(q.author_first_name || 'Creator')} in #${esc(q.channel || '')}</b><div class="tb-sub">${esc(q.text || '')}</div></div><div>${q.link ? `<a class="v2btn ghost" href="${esc(q.link)}" target="_blank" rel="noopener">Answer</a>` : ''}</div></div>`).join('') : '<p class="v2hint">Nobody is waiting.</p>'}
          <h3 style="font-size:14px;margin:16px 0 6px">This week</h3><div class="v2tbl"><table><thead><tr><th>Channel</th><th class="num">Creator messages, 7 days</th></tr></thead><tbody>${(Array.isArray(ch) ? ch : Object.entries(ch).map(([name, count]) => ({ name, count }))).map(c => `<tr><td>#${esc(c.channel || c.name)}</td><td class="num">${c.from_creators ?? c.messages ?? ''}</td></tr>`).join('')}</tbody></table></div>
          <p class="v2hint">Next: ${(Array.isArray(nx) ? nx : []).map(n => esc(n.label || n.what)).join(' · ')}</p>
          <h3 style="font-size:14px;margin:16px 0 6px">Post an announcement</h3>
          <p class="v2hint">Goes on every creator's Home in the app with a push, and in Discord if you pick a channel.</p>
          <input id="tbLaTitle" placeholder="Title (optional)" style="width:100%;margin:0 0 8px;padding:8px 10px;border-radius:9px;border:1px solid var(--line);background:transparent;color:inherit;font:inherit">
          <textarea id="tbLaTxt" rows="4" style="width:100%;padding:10px;border-radius:9px;border:1px solid var(--line);background:transparent;color:inherit;font:inherit" placeholder="What creators should know"></textarea>
          <div class="tb-foot"><select id="tbLaDc" aria-label="Also post in Discord"><option value="none">App only</option><option value="announcements">Also in #announcements</option><option value="wins">Also in #wins</option></select><button type="button" class="v2btn" id="tbLaPost">Post it</button></div>`;
        const btn = document.getElementById('tbLaPost');
        btn.onclick = async () => {
          const text = document.getElementById('tbLaTxt').value.trim(); if (!text) return toast('Write the announcement first');
          if (!confirm('This pushes to every Lucky creator. Post it?')) return;
          btn.disabled = true;
          try { const x = await H.apiAH('/api/lucky/announce', { method: 'POST', body: JSON.stringify({ text, title: document.getElementById('tbLaTitle').value.trim(), discord: document.getElementById('tbLaDc').value }) }); if (x && x.error) throw new Error(x.error); toast('Posted'); document.getElementById('tbLaTxt').value = ''; }
          catch (e) { toast(e.message); }
          btn.disabled = false;
        };
      }
    } catch (e) { box.innerHTML = `<p class="v2bad">${esc(e.message)}</p>`; }
  }

  /* ---- Discord (2026-11-05): who is waiting on an answer, what each channel did this week, what posts next, and a box
     to post as the brand's mascot. Reads profit /api/amb/discord/recap; posting uses /api/amb/discord/post. ---- */
  /* Members (2026-11-06): the join link, who is in, VIP, what the daily check would do, the switch, the VIP bar and
     the Discord sign-in secret (pasted here by Cole once; Locus never shows it again). */
  async function membersPanel(box, act) {
    let m;
    try { m = await H.apiAH('/api/trybe/discord-members?act=' + encodeURIComponent(act)); if (m && m.error) throw new Error(m.error); }
    catch (e) { return; }
    const last = m.last || {};
    const list = (arr, why) => (arr || []).map(r => `<li>${esc(r.name || 'A creator')}${why ? `: ${esc(r.why || why)}` : ''}${r.sales_60d != null ? ` <span class="tb-sub">($${r.sales_60d} in 60 days, ${r.approval}% approved)</span>` : ''}</li>`).join('');
    const el = document.createElement('section');
    el.className = 'tb-members';
    el.innerHTML = `<h3 style="font-size:16px;margin:22px 0 6px">Members</h3>
      <div class="tb-top">
        <div class="v2card tb-stat"><span class="l">Joined</span><b>${m.joined}</b><span class="s">of ${m.roster ?? '?'} on the Trybe roster</span></div>
        <div class="v2card tb-stat"><span class="l">VIP</span><b>${m.vip}</b><span class="s">at $${m.vip_bar} in sales over 60 days</span></div>
        <div class="v2card tb-stat ${m.auto ? 'good' : ''}"><span class="l">Daily check</span><b>${m.auto ? 'On' : 'Off'}</b><span class="s">${m.auto ? 'roles and removals run daily' : 'shows what it would do, does nothing'}</span></div>
      </div>
      <p class="v2hint">Join link (send this, not the Discord invite): ${m.join_link ? `<a href="${esc(m.join_link)}" target="_blank" rel="noopener">${esc(m.join_link)}</a> <button type="button" class="v2btn ghost" id="tbJoinCopy">Copy</button>` : 'no hub yet'}</p>
      ${m.oauth_ready ? '' : `<div class="v2card" style="padding:12px 14px;margin:8px 0"><b>One step for Cole: Discord sign-in</b>
        <ol class="v2hint" style="margin:6px 0 8px;padding-left:18px"><li>Discord Developer Portal, the Locus app, OAuth2.</li><li>Redirects: add <code>https://mobius-account-health.mobius-digital.workers.dev/join/callback</code>, save.</li><li>Client Secret: Reset Secret, copy it, paste it here.</li></ol>
        <div class="tb-foot"><input type="password" id="tbOauth" placeholder="Client Secret" aria-label="Discord client secret" style="flex:1;padding:8px 10px;border-radius:8px;border:1px solid var(--line);background:transparent;color:inherit;font:inherit"><button type="button" class="v2btn" id="tbOauthSave">Save</button></div></div>`}
      ${last.today ? `<p class="v2hint">Last check ${esc(last.today)}${last.dry ? ' (dry run, nothing changed)' : ''}: ${last.remove?.length || 0} to remove, ${last.warn?.length || 0} to warn, ${last.vip_on?.length || 0} to VIP, ${last.vip_off?.length || 0} back to Core.</p>
        ${last.remove?.length ? `<ul class="v2hint">${list(last.remove, 'remove')}</ul>` : ''}${last.vip_on?.length ? `<p class="v2hint">New VIP:</p><ul class="v2hint">${list(last.vip_on)}</ul>` : ''}` : ''}
      <div class="tb-foot"><span class="v2hint">VIP bar $<input id="tbVipBar" type="number" min="50" step="50" value="${m.vip_bar}" style="width:90px;padding:4px 6px;border-radius:6px;border:1px solid var(--line);background:transparent;color:inherit;font:inherit"> in 60 days</span>
        <button type="button" class="v2btn ghost" id="tbVipSave">Save bar</button><button type="button" class="v2btn ghost" id="tbDry">Run a dry check</button></div>`;
    box.appendChild(el);
    const $q = s => el.querySelector(s);
    if ($q('#tbJoinCopy')) $q('#tbJoinCopy').onclick = async () => { try { await navigator.clipboard.writeText(m.join_link); toast('Copied'); } catch { toast(m.join_link); } };
    if ($q('#tbOauthSave')) $q('#tbOauthSave').onclick = async () => {
      const v = $q('#tbOauth').value.trim(); if (!v) return toast('Paste the Client Secret');
      try { const x = await H.apiAH('/api/trybe/discord-oauth', { method: 'PUT', body: JSON.stringify({ secret: v }) }); if (x && x.error) throw new Error(x.error); toast('Saved'); $q('#tbOauth').value = ''; } catch (e) { toast(e.message); }
    };
    $q('#tbVipSave').onclick = async () => {
      try { const x = await H.apiAH('/api/trybe/vip-bar', { method: 'PUT', body: JSON.stringify({ act, sales: +$q('#tbVipBar').value }) }); if (x && x.error) throw new Error(x.error); toast('VIP bar saved'); } catch (e) { toast(e.message); }
    };
    $q('#tbDry').onclick = async () => {
      try { const x = await H.apiAH('/api/trybe/discord-sync?act=' + encodeURIComponent(act)); if (x && x.error) throw new Error(x.error); toast(`Dry check: ${x.remove?.length || 0} remove, ${x.warn?.length || 0} warn, ${x.vip_on?.length || 0} VIP`); } catch (e) { toast(e.message); }
    };
  }
  async function discordView() {
    const box = document.getElementById('tbDc'); if (!box) return;
    const act = H.S.act;
    let r;
    try { r = await H.api('/api/amb/discord/recap?act=' + encodeURIComponent(act)); if (r && r.error) throw new Error(r.error); }
    catch (e) { box.innerHTML = `<h3>Discord</h3><p class="v2hint">${esc(/server first|Pick this brand/i.test(e.message) ? 'This brand has no creator Discord yet. Build one in Briefs, Start here, Creator Discord.' : e.message)}</p>`; return; }
    const when = iso => iso ? new Date(iso).toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '';
    const wait = r.waiting.length ? r.waiting.map(w => `<div class="tb-mini"><div></div><div><div><b>${esc(w.who)}</b> in #${esc(w.channel)}${w.files ? `, ${w.files} file${w.files === 1 ? '' : 's'}` : ''}</div><div class="tb-sub">${esc(w.text || '(no text)')}</div></div><div style="text-align:right"><a class="v2btn ghost" href="${esc(w.link)}" target="_blank" rel="noopener">Answer</a><div class="tb-sub">${esc(when(w.at))}</div></div></div>`).join('') : '<p class="v2hint">Nobody is waiting on an answer.</p>';
    const ch = r.channels.map(c => `<tr><td>#${esc(c.name)}</td><td class="num" data-l="Creator messages, 7 days">${c.creator_messages_7d}</td><td class="num" data-l="Last message">${esc(c.last_at ? ago(c.last_at) : 'none')}</td></tr>`).join('');
    const opts = ['announcements', 'this-week', 'winners', 'questions', 'vip'].map(c => `<option value="${c}">#${c}</option>`).join('');
    box.innerHTML = `<div class="v2h"><h3>${esc(r.guild_name)}</h3><span class="cap">${r.members} member${r.members === 1 ? '' : 's'}, ${r.online} online</span></div>
      <div class="tb-top">
        <div class="v2card tb-stat ${r.waiting.length ? 'bad' : 'good'}"><span class="l">Waiting on an answer</span><b>${r.waiting.length}</b><span class="s">${r.waiting.length ? 'answer in Discord' : 'all answered'}</span></div>
        <div class="v2card tb-stat"><span class="l">Next video set</span><b>${esc(r.next_posts.monday.slice(5))}</b><span class="s">Monday, posted by ${esc(r.look.mascot)}</span></div>
        <div class="v2card tb-stat"><span class="l">Next winners post</span><b>${esc(r.next_posts.friday.slice(5))}</b><span class="s">Friday, if a creator video sold</span></div>
      </div>
      <h3 style="font-size:14px;margin:6px 0">Waiting on an answer</h3>${wait}
      <h3 style="font-size:14px;margin:16px 0 6px">This week</h3><div class="v2tbl"><table><thead><tr><th>Channel</th><th class="num">Creator messages, 7 days</th><th class="num">Last message</th></tr></thead><tbody>${ch}</tbody></table></div>
      <h3 style="font-size:14px;margin:16px 0 6px">Post as ${esc(r.look.mascot)}</h3>
      <div class="tb-bar"><select id="tbDcCh" aria-label="Channel">${opts}</select></div>
      <textarea id="tbDcTxt" rows="4" style="width:100%;padding:10px;border-radius:9px;border:1px solid var(--line);background:var(--panel,transparent);color:inherit;font:inherit" placeholder="What ${esc(r.look.mascot)} says. Goes out right away."></textarea>
      <div class="tb-foot"><span class="v2hint">${r.invite ? `Invite link: <a href="${esc(r.invite)}" target="_blank" rel="noopener">${esc(r.invite)}</a>` : ''}</span><button type="button" class="v2btn" id="tbDcPost">Post it</button></div>`;
    const btn = document.getElementById('tbDcPost');
    btn.onclick = async () => {
      const text = document.getElementById('tbDcTxt').value.trim(); if (!text) return toast('Write the message first');
      btn.disabled = true;
      try { const x = await H.api('/api/amb/discord/post', { method: 'POST', body: JSON.stringify({ act, channel: document.getElementById('tbDcCh').value, text }) }); if (x && x.error) throw new Error(x.error); toast('Posted'); document.getElementById('tbDcTxt').value = ''; }
      catch (e) { toast(e.message); }
      btn.disabled = false;
    };
    if (!CL()) membersPanel(box, act);
  }

  /* ---- the bar: search, filter, sort ---- */
  const products = rows => [...new Set(rows.flatMap(r => String(r.product || '').split(', ').filter(Boolean)))].sort();
  const sel = (id, val, opts) => `<select id="${id}">${opts.map(([v, l]) => `<option value="${esc(v)}" ${v === val ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>`;
  function bar(view, rows, filters, sorts) {
    const u = UI[view];
    return `<div class="tb-bar"><input id="tbQ" type="search" placeholder="Search a creator${view === 'creators' ? '' : ', product or words'}" value="${esc(u.q)}" aria-label="Search">
      <label>Show ${sel('tbF', u.f, filters)}</label>
      ${view === 'creators' ? '' : `<label>Product ${sel('tbP', u.p, [['', 'All'], ...products(rows).map(p => [p, p])])}</label>`}
      <label>Sort ${sel('tbS', u.s, sorts)}</label></div>`;
  }
  const hit = (r, q) => !q || [r.creator, r.name, r.product, r.line, r.transcript, r.adset].some(x => String(x || '').toLowerCase().includes(q.toLowerCase()));
  const byProduct = (r, p) => !p || String(r.product || '').split(', ').includes(p);
  const play = r => `<button type="button" class="tb-play" data-tbplay="${esc(r.sub_id)}" aria-label="Watch ${esc(r.creator)}'s video">${r.thumb ? `<img loading="lazy" alt="" src="${esc(r.thumb)}">` : ''}</button>`;
  const who = r => `<button type="button" class="tb-nm" data-tbwho="${esc(r.creator_id)}">${esc(r.creator)}</button>`;

  function queue() {
    const d = DATA, all = d.queue || [], u = UI.queue;
    if (!all.length) return `<section class="v2card"><div class="v2h"><h3>Nothing is waiting</h3></div><p class="v2hint">Every approved video has run as an ad.</p></section>`;
    const rows = all.filter(r => (u.f === 'all' || r.state === u.f || (u.f === 'other' && !['not_launched', 'no_spend'].includes(r.state))) && byProduct(r, u.p) && hit(r, u.q))
      .sort(u.s === 'new' ? (a, b) => a.days - b.days : u.s === 'sales' ? (a, b) => b.creator_orders - a.creator_orders || b.days - a.days : u.s === 'name' ? (a, b) => a.creator.localeCompare(b.creator) : (a, b) => b.days - a.days);
    const list = rows.map(r => {
      const [label, cls] = STATE[r.state] || [r.state, ''];
      const where = r.state === 'not_launched' ? `Approved ${r.days} day${r.days === 1 ? '' : 's'} ago` : `${r.launched ? `Launched ${r.launched_days === 0 ? 'today' : r.launched_days === 1 ? 'yesterday' : `${r.launched_days} days ago`}` : 'In Meta'}${r.adset ? ` in ${esc(r.adset)}` : ''}${r.state === 'scheduled' && r.starts ? `, starts ${esc(r.starts)}` : ''}`;
      return `<div class="tb-row">${play(r)}
      <div>${who(r)}<div class="tb-sub">${r.product ? `Product: ${esc(r.product)}` : 'No product tagged'}</div><div class="tb-sub">${where}</div>${r.line ? `<div class="tb-line">${esc(r.line)}</div>` : ''}</div>
      <div class="tb-tags"><span class="v2pill ${cls}">${label}</span>${r.state === 'not_launched' && r.days >= d.stale_days ? `<span class="v2pill bad">Over ${d.stale_days} days</span>` : ''}${r.creator_orders > 0 ? `<span class="v2pill good">Creator has ${Math.round(r.creator_orders)} sales</span>` : ''}</div></div>`;
    }).join('');
    return `<section class="v2card"><div class="v2h"><h3>${d.counts.not_launched} not launched, ${d.counts.no_spend} launched with no spend yet</h3><span class="cap">${rows.length} shown</span></div>
      <p class="v2hint">Not launched = nobody has built the ad. Launch it in Trybe (Ads, Build Ads) so it runs as a partnership ad and the creator gets paid. A video leaves this list once Meta spends on it.</p>
      ${bar('queue', all, [['not_launched', 'Not launched'], ['no_spend', 'Launched, no spend yet'], ['other', 'Scheduled, in review or off'], ['all', 'Everything']], [['wait', 'Longest waiting'], ['new', 'Newest'], ['sales', "Creator's sales"], ['name', 'Creator A to Z']])}
      ${list || '<p class="v2hint">Nothing matches.</p>'}</section>`;
  }
  function live() {
    const d = DATA, all = d.live || [], a = d.account, u = UI.live;
    if (!all.length) return `<section class="v2card"><div class="v2h"><h3>No creator video spent in the last ${a.days} days</h3></div><p class="v2hint">A video shows here once an ad named with its Trybe id spends.</p></section>`;
    const cmpv = k => (x, y) => (y[k] ?? -1) - (x[k] ?? -1);
    const rows = all.filter(r => (u.f === 'all' || (u.f === 'on' ? r.on > 0 : r.on === 0)) && byProduct(r, u.p) && hit(r, u.q))
      .sort(u.s === 'sales' ? cmpv('orders') : u.s === 'roas' ? cmpv('roas') : u.s === 'cpa' ? (x, y) => (x.cpa ?? 1e9) - (y.cpa ?? 1e9) : u.s === 'name' ? (x, y) => x.creator.localeCompare(y.creator) : cmpv('spend'));
    const list = rows.map(r => {
      const cls = r.cpa != null && a.cpa != null ? (r.cpa <= a.cpa ? 'tb-g' : 'tb-b') : '';
      return `<div class="tb-row">${play(r)}
      <div>${who(r)}<div class="tb-sub">${r.product ? `Product: ${esc(r.product)}` : ''}</div><div class="tb-sub"><span class="v2pill ${r.on ? 'good' : ''}">${r.on ? 'On' : 'Off'}</span> ${r.ads > 1 ? `${r.on} of ${r.ads} ads on. ` : ''}${r.adset ? esc(r.adset) : ''}</div>${r.line ? `<div class="tb-line">${esc(r.line)}</div>` : ''}</div>
      <div class="tb-nums"><div><span>Spend</span><b>${money(r.spend)}</b></div><div><span>Sales</span><b>${n1(r.orders)}</b></div><div><span>CPA</span><b class="${cls}">${r.cpa == null ? 'none' : money(r.cpa)}</b></div><div><span>ROAS</span><b>${r.roas == null ? '' : r.roas.toFixed(2)}</b></div></div></div>`;
    }).join('');
    const on = all.filter(r => r.on > 0).length;
    return `<section class="v2card"><div class="v2h"><h3>${on} on now, ${all.length - on} turned off</h3><span class="cap">${rows.length} shown${a.cpa != null ? ` · account CPA ${money(a.cpa)}` : ''}</span></div>
      <p class="v2hint">Every video whose ads spent in the last ${a.days} days. A video that gets turned off stays here marked Off until it has no spend in that window.${CL() ? '' : ' Scale and cut calls are made on Ads, Calls.'}</p>
      ${bar('live', all, [['on', 'On now'], ['off', 'Turned off'], ['all', 'Everything']], [['spend', 'Most spend'], ['sales', 'Most sales'], ['cpa', 'Lowest CPA'], ['roas', 'Highest ROAS'], ['name', 'Creator A to Z']])}
      ${list || '<p class="v2hint">Nothing matches.</p>'}</section>`;
  }
  function creators() {
    const d = DATA, all = d.creators || [], a = d.account, u = UI.creators;
    if (!all.length) return `<section class="v2card"><div class="v2h"><h3>No creator has a live video yet</h3></div></section>`;
    const cmpv = k => (x, y) => (y[k] ?? -1) - (x[k] ?? -1);
    const rows = all.filter(r => (u.f === 'all' || (u.f === 'rebook' ? r.rebook : r.beats)) && hit(r, u.q))
      .sort(u.s === 'spend' ? cmpv('spend') : u.s === 'sales' ? cmpv('orders') : u.s === 'cpa' ? (x, y) => (x.cpa ?? 1e9) - (y.cpa ?? 1e9) : u.s === 'quiet' ? cmpv('quiet_days') : cmpv('revenue'));
    const trs = rows.map(r => `<tr class="link" data-tbwho="${esc(r.creator_id)}"><td>${r.avatar ? `<img class="tb-av" loading="lazy" alt="" src="${esc(r.avatar)}">` : ''}<span class="nm">${esc(r.name)}</span>${r.rebook && !CL() ? ' <span class="v2pill good" title="Beats the account CPA and has not posted in a while">Ask for more</span>' : ''}</td>
      <td class="num" data-l="Live videos">${r.videos}</td><td class="num" data-l="Spend">${money(r.spend)}</td><td class="num" data-l="Sales">${n1(r.orders)}</td>
      <td class="num" data-l="CPA">${r.cpa == null ? 'none' : `<span class="${a.cpa != null ? (r.cpa <= a.cpa ? 'tb-g' : 'tb-b') : ''}">${money(r.cpa)}</span>`}</td><td class="num" data-l="ROAS">${r.roas == null ? '' : r.roas.toFixed(2)}</td><td class="num" data-l="Revenue">${money(r.revenue)}</td>
      <td class="num" data-l="Last video">${r.quiet_days == null ? '' : `${r.quiet_days}d ago`}</td></tr>`).join('');
    return `<section class="v2card"><div class="v2h"><h3>${all.length} creator${all.length === 1 ? '' : 's'} with live videos</h3><span class="cap">${rows.length} shown${a.cpa != null ? ` · account CPA ${money(a.cpa)}` : ''}</span></div>
      ${CL() ? '' : `<p class="v2hint">Ask for more = at least 2 sales at or under the account CPA, and no new video in ${d.rebook_days} days. Message them for another video. Tap a name for their videos.</p>`}
      ${bar('creators', all, CL() ? [['all', 'Everyone'], ['beats', 'Beats account CPA']] : [['all', 'Everyone'], ['rebook', 'Ask for more'], ['beats', 'Beats account CPA']], [['revenue', 'Most revenue'], ['spend', 'Most spend'], ['sales', 'Most sales'], ['cpa', 'Lowest CPA'], ['quiet', 'Longest quiet']])}
      <div class="v2tbl"><table><thead><tr><th>Creator</th><th class="num">Live videos</th><th class="num">Spend</th><th class="num">Sales</th><th class="num">CPA</th><th class="num">ROAS</th><th class="num">Revenue</th><th class="num">Last video</th></tr></thead><tbody>${trs}</tbody></table></div></section>`;
  }
  function rules() {
    const d = DATA;
    return `<section class="v2card"><div class="v2h"><h3>The rules for creator ads</h3><span class="cap">${d.rules_default ? 'The starting set. Edit them for this brand.' : 'Set for this brand'}</span></div>
      <p class="v2hint">Written the way you would hand them to a new buyer. One rule per line. The numbers behind scale and cut calls are the brand's goals (Brand settings, Goals and ad rules); these lines are the team's playbook for creator videos.</p>
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
    const aseg = `<div class="v2jobs tb-seg" role="tablist">${[['week', 'This week'], ['numbers', 'Scorecard and queue']].map(([id, l]) => `<button type="button" role="tab" data-av="${id}" class="${AV === id ? 'on' : ''}">${l}</button>`).join('')}</div>`;
    const wireAv = () => document.querySelectorAll('[data-av]').forEach(x => { x.onclick = () => { AV = x.dataset.av; paintAll(); }; });
    if (AV === 'week') { $('#main').innerHTML = shell(`${aseg}<div id="tbWeek"><p class="v2hint">Getting today's numbers…</p></div>`); wireAv(); if (H.pageActions) H.pageActions(''); weekView(); return; }
    const waiting = b.reduce((s, r) => s + r.queue, 0), stale = b.reduce((s, r) => s + (r.stale || 0), 0);
    const none = (d.no_key || []).filter(x => x.act_id !== 'brand_lucky_golf').map(x => `<button type="button" class="v2link" data-tbact="${esc(x.act_id)}">${esc(x.name)}</button>`).join(', ');
    const qcard = r => `<button type="button" class="tb-q ${r.stale ? 'late' : r.queue ? '' : 'clear'}" data-tbact="${esc(r.act_id)}">
        <span class="tb-q-nm">${esc(r.name)}${r.has_key ? '' : ' <span class="v2pill warn">No key</span>'}</span>
        <span class="tb-q-big"><b>${r.queue}</b><span>${r.queue === 1 ? 'video' : 'videos'} not launched</span></span>
        <span class="tb-q-chips">${r.stale ? `<span class="v2pill bad">${r.stale} over ${d.stale_days} days</span>` : ''}${r.queue ? `<span class="v2pill">oldest ${r.oldest}d</span>` : '<span class="v2pill good">all launched</span>'}${r.no_spend ? `<span class="v2pill warn">${r.no_spend} on, no spend</span>` : ''}${r.pending ? `<span class="v2pill">${r.pending} to review</span>` : ''}</span>
        <span class="tb-sub">${r.approved} approved in all · updated ${esc(ago(r.synced_at))}</span></button>`;
    $('#main').innerHTML = shell(`${aseg}<section class="v2card tb-sc" id="tbScore"><div class="v2h"><h3>Creator scorecard</h3><span class="cap">Getting the numbers…</span></div></section>
      <section class="v2card"><div class="v2h"><h3>Launch queue</h3><span class="cap">${waiting} not launched${stale ? `, <span class="tb-b">${stale} late</span>` : ''}</span></div>
      <p class="v2hint">Approved videos with no ad yet. Every one gets launched within ${d.stale_days} days. Tap a brand to launch.</p>
      ${b.length ? `<div class="tb-qgrid">${b.map(qcard).join('')}</div>` : '<p class="v2hint">No brand has a Trybe key yet. Open a brand to connect it.</p>'}
      ${none ? `<p class="v2hint" style="margin-top:12px">Not connected: ${none}</p>` : ''}
      <div class="tb-foot tb-alert"><span class="v2hint">Slack lines are <b>${d.alerts ? 'on' : 'off'}</b>: each brand's channel hears when videos sit ${d.stale_days} days, reviews wait 2 days or Discord goes unanswered.</span><button type="button" class="v2btn ghost" id="tbAlerts">${d.alerts ? 'Turn off' : 'Turn on'}</button></div></section>`);
    if (H.pageActions) H.pageActions('');
    wire(); wireAv();
    score();
  }

  /* This week (2026-11-05): the weekly creator program routine as a week, today lit up, with the live counts that
     turn each line into a job (account-health /api/trybe/week). Roles: owner (Cole: scorecard, calls), media buyer
     (launches, keep or cut), creative strategists (Ahsan, Noma: review videos, notes, next week's set), creator manager
     (Cole until hired: accept creators and samples daily, invites, follow ups, Discord replies). Locus does the posts.
     Round 3 (Cole, 11-05): samples are daily, invites are daily (Cole 11-06: we invite every day) with written rules, Thursday is follow ups. */
  let AV = 'week';
  const ROLES = { owner: ['Owner', 'Cole'], buyer: ['Media buyer', 'Cole for now'], strat: ['Creative strategists', 'Ahsan, Noma'], mgr: ['Creator manager', 'Cole until hired'], locus: ['Locus', 'runs itself'] };
  const DAILY = [
    { who: 'strat', what: 'Review new videos', how: 'Ads, Trybe, a brand, Review. Approve, or send back with a note.', n: 'review' },
    { who: 'mgr', what: 'Answer Discord', how: 'Ads, Trybe, a brand, Discord. Clear "Waiting on an answer".', n: 'discord' },
    { who: 'mgr', what: 'Accept creators and approve samples', how: 'In Trybe: Creators (applications) and the sample requests. Approve a sample only for a creator with a plan for a video. Lucky: in the Lucky app.' },
    { who: 'mgr', what: 'Invite new creators', how: 'Trybe, Discovery, by the invite rules below. Use the day’s invite credits every day.' },
    { who: 'buyer', what: 'Launch approved videos', how: 'Ads, Trybe, a brand, Queue. Then keep or cut on Ads, Calls.', n: 'launch' },
  ];
  const WEEK = [
    { d: 1, name: 'Monday', jobs: [
      { who: 'owner', what: 'Scorecard, in the morning', how: 'This tab, Scorecard and queue, 15 minutes before the day starts. Which program is off goal, which has videos waiting. Not for the calls.' },
      { who: 'locus', what: 'Posts the week’s videos in every Discord', how: 'Morning, as each mascot, with the deal and the call time.' },
      { who: 'owner', what: 'Creator calls, 4:30 to 7:00', how: 'Grunk 4:30, Dartee 5:00, Ice & Gold 5:30, Party Patch 6:00, Lucky 6:30. Show the videos that sold (a brand, Live, sort by Most sales, press play), then this week’s set.' },
      { who: 'owner', what: 'Record the calls', how: 'Upload unlisted to YouTube, paste the link in Briefs, Start here, recordings.' } ] },
    { d: 2, name: 'Tuesday', jobs: [
      { who: 'strat', what: 'Notes before upload', how: 'Reply in each Discord’s #feedback-before-upload.' } ] },
    { d: 3, name: 'Wednesday', jobs: [
      { who: 'buyer', what: 'Creator ads on Calls', how: 'Ads, Calls. Creator ads follow the same wait, scale and cut rules as every ad.' } ] },
    { d: 4, name: 'Thursday', jobs: [
      { who: 'strat', what: 'Find what’s selling for next week', how: 'Our winners (Scorecard), competitor ads, inspo. Pick next week’s 5 ideas.' },
      { who: 'mgr', what: 'Follow ups', how: 'Ads, Trybe, a brand, Follow up: videos sold then went quiet, quiet with no sale, sample with no video. Locus drafts each message, Cole says yes, Claude sends it in Trybe Chat.' } ] },
    { d: 5, name: 'Friday', jobs: [
      { who: 'locus', what: 'Posts the winners in every Discord', how: 'Creator videos with a Triple Whale sale in the last 7 days, with the videos.' },
      { who: 'strat', what: 'Set next week’s videos', how: 'Ads, Trybe, Briefs, Start here: title, deal, 5 ideas. Lucky: the board in the Lucky app.' },
      { who: 'owner', what: 'Pick VIPs', how: 'Creators whose videos sold move up. Tell Claude who, or invite them to the VIP program in Trybe.' } ] },
    { d: 6, name: 'Saturday', jobs: [] },
    { d: 0, name: 'Sunday', jobs: [] },
  ];
  /* The invite rules Claude follows in Trybe Discovery (Phil Kiel's playbook, 2026-11-05). */
  const INVITE = [
    ['Month 1: go wide', 'Use every invite credit, every day. Many mid-size creators beat a few big ones: you are looking for who sells, and you only learn that from videos.'],
    ['Skip the top tier', 'Over about $20k Trybe sales in 30 days = busy with many brands, slow to film. Start in the middle: some sales, lots of videos.'],
    ['Fit first', 'Their niche and their videos fit the product. They talk to camera like a person, not an ad.'],
    ['Look at Trybe’s numbers', 'Approval 50% or more, and 4 or more videos in the last 30 days.'],
    ['An invite is not a sample', 'Inviting costs nothing. A sample is approved later, daily, only for a creator with a plan for a video.'],
    ['Keep the ones who deliver', 'After a month, keep a creator who makes 10 or more videos a month, or $5k or more in sales, with 50% or more approved, and a first video within 14 days of a sample. Below that: no more samples.'],
      ];
  async function weekView() {
    const box = document.getElementById('tbWeek'); if (!box) return;
    let w;
    try { w = await H.apiAH('/api/trybe/week'); if (w && w.error) throw new Error(w.error); }
    catch (e) { box.innerHTML = `<p class="v2bad">${esc(e.message)}</p>`; return; }
    const tot = k => w.programs.reduce((a, p) => a + (+p[k] || 0), 0);
    const per = k => w.programs.filter(p => +p[k] > 0).map(p => `<button type="button" class="v2link" data-wk="${esc(p.act_id)}">${esc(p.name)} ${p[k]}</button>`).join(', ');
    const tag = r => `<span class="v2pill" title="${esc(ROLES[r][1])}">${esc(ROLES[r][0])}</span>`;
    const today = WEEK.find(x => x.d === w.dow) || WEEK[0];
    const dailyRows = DAILY.map(j => { const n = j.n ? tot(j.n) : null; return `<div class="tb-job"><div style="flex:1;min-width:0"><div><b>${esc(j.what)}</b> ${tag(j.who)}</div><div class="tb-sub">${esc(j.how)}</div>${n ? `<div class="tb-sub" style="margin-top:4px">${per(j.n)}</div>` : ''}</div>${n == null ? '' : `<div class="tb-job-n"><b class="${n ? 'tb-b' : 'tb-g'}">${n}</b><div class="tb-sub">${n ? 'to do' : 'clear'}</div></div>`}</div>`; }).join('');
    const todayRows = today.jobs.length ? today.jobs.map(j => `<div class="tb-job"><div style="flex:1;min-width:0"><div><b>${esc(j.what)}</b> ${tag(j.who)}</div><div class="tb-sub">${esc(j.how)}</div></div></div>`).join('') : '<p class="v2hint">Nothing extra today. Just the daily four.</p>';
    const cols = WEEK.filter(x => x.d >= 1 && x.d <= 5).map(x => `<div class="v2card tb-day${x.d === w.dow ? ' on' : ''}"><div style="font-weight:700;margin-bottom:6px">${esc(x.name)}${x.d === w.dow ? ' <span class="v2pill good">Today</span>' : ''}</div>${x.jobs.map(j => `<div style="margin:0 0 8px"><div style="font-size:13.5px">${esc(j.what)}</div><div class="tb-sub">${esc(ROLES[j.who][0])}</div></div>`).join('')}<div class="tb-sub" style="border-top:1px solid var(--line);padding-top:6px">Every day: review, Discord, samples, launch</div></div>`).join('');
    const roles = Object.values(ROLES).map(([r, who]) => `<li><b>${esc(r)}</b>: ${esc(who)}</li>`).join('');
    const disc = w.programs.filter(p => p.portal).map(p => `<a class="v2btn ghost" href="${esc(p.portal.replace('/brand?', '/brand/discovery?'))}" target="_blank" rel="noopener">${esc(p.name)}</a>`).join('');
    box.innerHTML = `<section class="v2card"><div class="v2h"><h3>Today, ${esc(today.name)}</h3><span class="cap">live from Trybe, the Lucky app and Discord</span></div>
        <h3 style="font-size:14px;margin:4px 0 6px">Every day</h3>${dailyRows}
        <h3 style="font-size:14px;margin:14px 0 6px">Also today</h3>${todayRows}</section>
      <section class="v2card"><div class="v2h"><h3>The week</h3><span class="cap">the creator program routine</span></div>
        <div class="tb-week">${cols}</div>
        <p class="v2hint" style="margin-top:10px">Weekends: one look at Discord is enough.</p></section>
      <section class="v2card" id="tbInvite"><div class="v2h"><h3>Invite rules</h3><span class="cap">Every day, in Trybe Discovery</span></div>
        <ol class="tb-rules">${INVITE.map(([h, t]) => `<li><b>${esc(h)}.</b> ${esc(t)}</li>`).join('')}</ol>
        ${disc ? `<div class="tb-foot" style="flex-wrap:wrap"><span class="v2hint">Open Discovery:</span>${disc}</div>` : ''}</section>
      <section class="v2card"><div class="v2h"><h3>Who does what</h3></div><ul style="margin:0;padding-left:18px">${roles}</ul>
        <p class="v2hint">The creator manager is the one hire: accepts creators, approves samples, invites, follows up, answers Discord. Strategists judge the videos and give notes before upload.</p></section>`;
    box.querySelectorAll('[data-wk]').forEach(b => { b.onclick = () => { if (H.setViewAct) H.setViewAct(b.dataset.wk); H.show('trybe'); }; });
  }

  /* The scorecard (2026-11-05; redesigned in round 3): one card per creator program. Triple Whale is the standard
     (Phil ranks creators on third party numbers); Meta's own purchases are a second opinion on a switch. Spend is Meta. */
  const SCORE = {}; let SCORE_W = '7', SCORE_M = 'tw';
  async function score() {
    const box = document.getElementById('tbScore'); if (!box) return;
    const sw = (id, val, opts) => `<div class="tb-sw" role="group" id="${id}">${opts.map(([v, l]) => `<button type="button" data-v="${v}" class="${v === val ? 'on' : ''}" aria-pressed="${v === val}">${l}</button>`).join('')}</div>`;
    const head = `<div class="v2h tb-sc-h"><h3>Creator scorecard</h3><div class="tb-sc-ctl">${sw('tbScW', SCORE_W, [['7', '7 days'], ['30', '30 days']])}${sw('tbScM', SCORE_M, [['tw', 'Triple Whale'], ['meta', 'Meta']])}</div></div>`;
    const wireSw = () => {
      box.querySelectorAll('#tbScW button').forEach(x => { x.onclick = () => { SCORE_W = x.dataset.v; score(); }; });
      box.querySelectorAll('#tbScM button').forEach(x => { x.onclick = () => { SCORE_M = x.dataset.v; score(); }; });
    };
    if (!SCORE[SCORE_M]) { box.innerHTML = `${head}<p class="v2hint">Getting the numbers…</p>`; wireSw(); }
    try { if (!SCORE[SCORE_M]) SCORE[SCORE_M] = await H.apiAH('/api/trybe/scorecard?model=' + SCORE_M); if (SCORE[SCORE_M].error) throw new Error(SCORE[SCORE_M].error); }
    catch (e) { box.innerHTML = `${head}<p class="v2bad">${esc(e.message)}</p>`; wireSw(); delete SCORE[SCORE_M]; return; }
    const S = SCORE[SCORE_M], k = SCORE_W === '7' ? 'last_7' : 'last_30';
    const ok = S.cards.filter(c => !c.error);
    const sum = f => ok.reduce((a, c) => a + (+((c[k] || {})[f]) || 0), 0);
    const tSpend = sum('spend'), tOrders = sum('orders'), tSales = sum('sales');
    const onGoal = ok.filter(c => (c[k] || {}).on_goal === true).length, judged = ok.filter(c => +((c[k] || {}).spend) > 0).length;
    const strip = `<div class="tb-sc-strip">
        <div><span>Creator ad spend</span><b>${money(tSpend)}</b></div>
        <div><span>Sales</span><b>${money(tSales)}</b><i>${n1(tOrders)} orders</i></div>
        <div><span>Cost per sale</span><b>${tOrders > 0 ? money(tSpend / tOrders) : 'none'}</b><i>all programs</i></div>
        <div><span>On goal</span><b>${onGoal} of ${judged || ok.length}</b><i>programs</i></div></div>`;
    const card = c => {
      if (c.error) return `<div class="tb-pc"><div class="tb-pc-h"><b>${esc(c.name)}</b></div><p class="v2hint">${esc(c.error)}</p></div>`;
      const w = c[k] || {};
      const st = w.cpa == null ? (w.spend > 0 ? ['No sale yet', 'bad'] : ['No spend', '']) : w.on_goal == null ? ['No goal set', ''] : w.on_goal ? ['On goal', 'good'] : ['Over goal', 'bad'];
      const bar = w.cpa != null && w.goal_cpa ? Math.min(100, Math.round(w.goal_cpa / w.cpa * 100)) : 0;
      return `<${c.source === 'trybe' ? 'button type="button"' : 'div'} class="tb-pc ${st[1]}"${c.source === 'trybe' ? ` data-tbact="${esc(c.act_id)}"` : ''}>
        <div class="tb-pc-h"><b>${esc(c.name)}</b>${c.source === 'lucky_app' ? '<span class="v2pill">Lucky app</span>' : ''}<span class="v2pill ${st[1]}">${st[0]}</span></div>
        <div class="tb-pc-cpa"><b class="${st[1] === 'good' ? 'tb-g' : st[1] === 'bad' ? 'tb-b' : ''}">${w.cpa == null ? 'none' : money(w.cpa)}</b><span>cost per sale${w.goal_cpa ? ` · goal ${money(w.goal_cpa)}` : ''}</span></div>
        ${w.goal_cpa ? `<div class="tb-pc-bar" title="Goal divided by cost per sale"><i style="width:${bar}%"></i></div>` : ''}
        <div class="tb-pc-nums"><div><span>Spend</span><b>${money(w.spend)}</b></div><div><span>Sales</span><b>${money(w.sales)}</b></div><div><span>Orders</span><b>${n1(w.orders)}</b></div><div><span>ROAS</span><b>${w.roas == null ? '' : w.roas.toFixed(2)}</b></div></div>
        <div class="tb-pc-flow"><span><b>${w.videos_in ?? ''}</b> in</span><span>›</span><span><b>${w.approved ?? ''}</b> approved</span><span>›</span><span><b>${w.launched ?? ''}</b> launched</span>${SCORE_W === '7' && w.winners != null ? `<span>›</span><span><b>${w.winners}</b> sold</span>` : ''}</div>
        <div class="tb-pc-foot">${c.waiting != null ? `<span class="${c.waiting > 0 ? 'tb-b' : ''}">${c.waiting} waiting to launch</span>` : ''}${c.creators_active != null ? `<span>${c.creators_active} active creators</span>` : ''}${c.discord != null ? `<span>${c.discord} in Discord</span>` : ''}</div>
      </${c.source === 'trybe' ? 'button' : 'div'}>`;
    };
    box.innerHTML = `${head}
      <p class="v2hint">Creator ads only, ${SCORE_W === '7' ? 'last 7 days' : 'last 30 days'}. ${SCORE_M === 'tw' ? 'Sales from Triple Whale (the standard), spend from Meta.' : 'Sales as Meta counts them (a second opinion; Meta counts more than Triple Whale). Spend from Meta.'} Monday morning read: which program is off goal, which has videos waiting.</p>
      ${strip}<div class="tb-pcs">${S.cards.map(card).join('')}</div>`;
    wireSw();
    box.querySelectorAll('[data-tbact]').forEach(r => { r.onclick = () => { if (H.setViewAct) H.setViewAct(r.dataset.tbact); H.show('trybe'); }; });
  }

  /* ---- Follow up (round 3, 2026-11-05): three lists of creators to message one by one in Trybe Chat. Trybe's API has
     no messages, so Locus drafts each one; Claude sends them in Chrome after Cole's yes, or anyone copies and sends.
     "Sent" hides the creator for 14 days (account-health /api/trybe/followups). ---- */
  /* Recuts (2026-11-06, Cole): once a month the strategist picks up to 10 of last month's best selling creator videos,
     keeps or changes the suggested test, and puts them in the pipeline as cards for Ravo, each with the full brief.
     One Slack line then tells the team the cards are there and why. */
  const pctx = x => (x == null ? '–' : `${(x * 100).toFixed(1)}%`);
  async function makeRecutCard(act, p) {
    const br = await H.apiAH('/api/trybe/recut-brief', { method: 'POST', body: JSON.stringify({ act, sub_id: p.sub_id, test: p.test, note: p.note || '', why: p.why || '' }) });
    if (br && br.error) throw new Error(br.error);
    const made = await H.apiAH('/api/production/brief', { method: 'POST', body: JSON.stringify({ act, text: br.title, owner: br.owner, due: br.due }) });
    if (made && made.error) throw new Error(made.error);
    const sv = await H.apiAH('/api/production/save', { method: 'POST', body: JSON.stringify({ id: made.id, brief: { v: 2, html: br.html, format: br.format, sizes: [] } }) });
    if (sv && sv.error) throw new Error(sv.error);
    return { num: made.num, id: made.id, title: br.title, test: br.test };
  }
  async function recutView() {
    const box = document.getElementById('tbRc'); if (!box) return;
    const act = H.S.act;
    let r;
    try { r = await H.apiAH('/api/trybe/recut-picks?act=' + encodeURIComponent(act)); if (r && r.error) throw new Error(r.error); }
    catch (e) { box.innerHTML = `<p class="v2bad">${esc(e.message)}</p>`; return; }
    const picks = r.picks || [], tests = r.tests || {}, avg = r.brand_avg || {};
    const opts = cur => Object.entries(tests).map(([k, l]) => `<option value="${k}"${k === cur ? ' selected' : ''}>${esc(l)}</option>`).join('');
    box.innerHTML = `<div class="v2h"><h3>Recuts: last 30 days' best sellers</h3><span class="cap">monthly, up to 10</span></div>
      <p class="v2hint">Each tick becomes a card in the pipeline for Ravo with the numbers, the goal, what to change and the original file. Locus suggests the test from the video's own numbers against the brand's creator videos (watch 3s ${pctx(avg.hook)}, watch through ${pctx(avg.hold)}, click ${pctx(avg.ctr)}). Change it if you know better.${r.recently ? ` ${r.recently} video${r.recently === 1 ? ' was' : 's were'} recut in the last 60 days and ${r.recently === 1 ? 'is' : 'are'} left out.` : ''}</p>` +
      (picks.length ? picks.map((p, i) => `<div class="tb-rc" data-sub="${esc(p.sub_id)}">
        <label class="tb-rc-pick"><input type="checkbox" checked aria-label="Recut ${esc(p.creator)}'s video"></label>
        ${p.thumb ? `<button type="button" class="tb-th" data-rcplay="${esc(p.sub_id)}" style="width:52px;height:78px;border:0;border-radius:8px;cursor:pointer;background:#000 center/cover url('${esc(p.thumb)}')" aria-label="Play"></button>` : '<div></div>'}
        <div class="tb-rc-main"><b>${esc(p.creator)}</b> <span class="tb-sub">${esc(p.product || '')} · ${p.orders} sale${p.orders === 1 ? '' : 's'}, ${money(p.cpa)} a sale · watch 3s ${pctx(p.hook)} · through ${pctx(p.hold)} · click ${pctx(p.ctr)}</span>
          <div class="tb-rc-row"><select aria-label="Test">${opts(p.test)}</select><span class="tb-sub tb-rc-why">${esc(p.why)}</span></div>
          <textarea class="tb-note" rows="1" placeholder="Note for Ravo (optional), e.g. open on the line at 0:12"></textarea></div></div>`).join('') +
        `<div class="tb-foot"><span class="v2hint" id="tbRcMsg"></span><button type="button" class="v2btn" id="tbRcGo">Add to the pipeline</button></div>`
        : '<p class="v2hint">No creator video sold in the last 30 days that has not been recut already.</p>');
    box.querySelectorAll('[data-rcplay]').forEach(b => { b.onclick = () => watchSub(b.dataset.rcplay); });
    box.querySelectorAll('.tb-rc select').forEach(s => { s.onchange = () => { s.closest('.tb-rc').querySelector('.tb-rc-why').textContent = s.value === picks.find(p => p.sub_id === s.closest('.tb-rc').dataset.sub).test ? picks.find(p => p.sub_id === s.closest('.tb-rc').dataset.sub).why : 'Your call: the card explains this test.'; }; });
    const go = document.getElementById('tbRcGo'); if (!go) return;
    go.onclick = async () => {
      const rows = [...box.querySelectorAll('.tb-rc')].filter(x => x.querySelector('input[type=checkbox]').checked);
      if (!rows.length) return toast('Tick at least one video');
      go.disabled = true;
      const msg = document.getElementById('tbRcMsg'), made = [];
      for (const [i, row] of rows.entries()) {
        const p = picks.find(x => x.sub_id === row.dataset.sub);
        const test = row.querySelector('select').value;
        msg.textContent = `Making card ${i + 1} of ${rows.length}…`;
        try { made.push(await makeRecutCard(act, { sub_id: p.sub_id, test, note: row.querySelector('textarea').value.trim(), why: test === p.test ? p.why : '' })); row.style.opacity = .5; }
        catch (e) { toast(`${p.creator}: ${e.message}`); }
      }
      if (made.length) await H.apiAH('/api/trybe/recut-announce', { method: 'POST', body: JSON.stringify({ act, cards: made }) }).catch(() => null);
      msg.textContent = made.length ? `${made.length} card${made.length === 1 ? '' : 's'} in the pipeline (${made.map(m => '#' + m.num).join(', ')}), Ravo told in Slack.` : 'No card was made.';
      go.textContent = 'Done';
    };
  }
  async function followView() {
    const box = document.getElementById('tbFu'); if (!box) return;
    const act = H.S.act;
    let r;
    try { r = await H.apiAH('/api/trybe/followups?act=' + encodeURIComponent(act)); if (r && r.error) throw new Error(r.error); }
    catch (e) { box.innerHTML = `<p class="v2bad">${esc(e.message)}</p>`; return; }
    const chat = (r.portal || 'https://jointrybe.com/brand').replace('/brand?', '/brand/chat?');
    const item = c => `<div class="tb-fu" data-cid="${esc(c.creator_id)}">
        <div class="tb-fu-who">${c.avatar ? `<img class="tb-av" loading="lazy" alt="" src="${esc(c.avatar)}">` : ''}<b>${esc(c.name)}</b>
          <span class="tb-sub">${c.kind === 'sold' ? `${c.orders} sale${c.orders === 1 ? '' : 's'}${c.cpa != null ? `, ${money(c.cpa)} a sale` : ''}, last video ${c.days} days ago` : c.kind === 'quiet' ? `${c.approved} approved, no sale, last video ${c.days} days ago` : c.state === 'needs_resubmit' ? 'video sent back, new cut owed' : `video was due ${esc(c.due)}${c.days > 0 ? ` (${c.days} days late)` : ''}`}</span></div>
        <textarea class="tb-fu-msg" rows="3" aria-label="Message to ${esc(c.first)}">${esc(c.message)}</textarea>
        <div class="tb-fu-act"><button type="button" class="v2btn ghost" data-fu="copy">Copy</button><a class="v2btn ghost" href="${esc(chat)}" target="_blank" rel="noopener">Open Trybe Chat</a><button type="button" class="v2btn" data-fu="sent">Sent</button></div></div>`;
    const group = (title, why, list) => `<div class="tb-fu-g"><div class="v2h"><h3>${title} (${list.length})</h3></div><p class="v2hint">${why}</p>${list.length ? list.map(item).join('') : '<p class="v2hint">Nobody right now.</p>'}</div>`;
    box.innerHTML = `<div class="v2h"><h3>Follow up</h3><span class="cap">Thursdays · one message per creator, in Trybe Chat</span></div>
      <p class="v2hint">Locus writes each message. Edit it if you like, send it in Trybe Chat, then press Sent (hides them for ${r.rules.snooze_days} days). Claude can send the whole list in Chrome once Cole says yes.${r.note ? ` ${esc(r.note)}` : ''}</p>
      ${group('Sold, then went quiet', `Their videos made sales (Triple Whale, 30 days) and no new video in ${r.rules.sold_days} days. Ask for more of the same.`, r.sold)}
      ${group('Quiet, no sale', `Approved videos, nothing sold, no new video in ${r.rules.quiet_days} days. Ask what happened and show what is selling.`, r.quiet)}
      ${group('Sample, no video', 'Trybe says they owe a video for a sample: past due, or sent back for a new cut.', r.sample)}`;
    box.querySelectorAll('[data-fu]').forEach(b => { b.onclick = async () => {
      const row = b.closest('[data-cid]'), msg = row.querySelector('.tb-fu-msg').value;
      if (b.dataset.fu === 'copy') { try { await navigator.clipboard.writeText(msg); toast('Copied'); } catch { toast('Select the text and copy it'); } return; }
      b.disabled = true;
      try { const x = await H.apiAH('/api/trybe/followups/sent', { method: 'POST', body: JSON.stringify({ act, creator_id: row.dataset.cid }) }); if (x && x.error) throw new Error(x.error); row.remove(); toast('Marked sent'); }
      catch (e) { toast(e.message); b.disabled = false; }
    }; });
  }

  /* ---- pop ups: a bottom sheet on a phone ---- */
  function pop(html, cls) {
    closePop();
    const w = document.createElement('div'); w.className = 'tb-pop'; w.id = 'tbPop';
    w.innerHTML = `<div class="tb-sheet ${cls || ''}" role="dialog" aria-modal="true"><button type="button" class="x" aria-label="Close">×</button>${html}</div>`;
    w.onclick = e => { if (e.target === w || e.target.classList.contains('x')) closePop(); };
    document.body.appendChild(w);
    return w;
  }
  function closePop() { const w = document.getElementById('tbPop'); if (w) { const v = w.querySelector('video'); if (v) v.pause(); w.remove(); } }
  const find = sub => [...(DATA.queue || []), ...(DATA.live || [])].find(r => r.sub_id === sub);
  async function watch(sub) {
    const r = find(sub) || {};
    const w = pop(`<h3>${esc(r.creator || 'Video')}</h3><div class="tb-sub">${r.product ? `Product: ${esc(r.product)}` : ''}</div><div id="tbVid" style="margin-top:12px"><p class="v2hint">Getting the video from Trybe…</p></div>${r.transcript || r.line ? `<div class="tb-said">${esc(r.transcript || r.line)}</div>` : ''}`, 'vid');
    try {
      const v = await H.apiAH(`/api/trybe/video?act=${encodeURIComponent(H.S.act)}&sub=${encodeURIComponent(sub)}`);
      if (v && v.error) throw new Error(v.error);
      const box = w.querySelector('#tbVid'); if (!box) return;
      box.innerHTML = !v.url ? '<p class="v2bad">Trybe has no file for this one.</p>' : v.media === 'image' ? `<img class="tb-img" alt="" src="${esc(v.url)}">` : `<video controls autoplay playsinline poster="${esc(v.thumb || '')}" src="${esc(v.url)}"></video>`;
      if (v.url && v.media !== 'image') recutUI(box, sub);
    } catch (e) { const box = w.querySelector('#tbVid'); if (box) box.innerHTML = `<p class="v2bad">${esc(e.message)}</p>`; }
  }
  function creator(id) {
    const d = DATA, a = d.account;
    const c = (d.creators || []).find(x => x.creator_id === id);
    const lv = (d.live || []).filter(x => x.creator_id === id), qv = (d.queue || []).filter(x => x.creator_id === id);
    const name = (c && c.name) || (lv[0] || qv[0] || {}).creator || 'Creator';
    const kv = c ? `<div class="tb-kv"><div><span>Spend</span><b>${money(c.spend)}</b></div><div><span>Sales</span><b>${n1(c.orders)}</b></div><div><span>CPA</span><b class="${c.cpa != null && a.cpa != null ? (c.cpa <= a.cpa ? 'tb-g' : 'tb-b') : ''}">${c.cpa == null ? 'none' : money(c.cpa)}</b></div><div><span>ROAS</span><b>${c.roas == null ? 'none' : c.roas.toFixed(2)}</b></div><div><span>Revenue</span><b>${money(c.revenue)}</b></div>${c.earnings != null ? `<div><span>Paid by Trybe</span><b>${money(c.earnings)}</b></div>` : ''}</div>` : `<p class="v2hint">No ad of theirs has spent in the last ${a.days} days.</p>`;
    const mini = (r, right) => `<div class="tb-mini">${play(r)}<div><div>${r.product ? esc(r.product) : 'Video'}</div><div class="tb-sub">${esc(r.line || '')}</div></div><div style="text-align:right">${right}</div></div>`;
    const why = c && !CL() ? (c.rebook ? `<p class="v2hint"><b>Ask for more.</b> Their CPA (${money(c.cpa)}) beats the account (${money(a.cpa)}) and their last video was ${c.quiet_days} days ago.</p>` : c.beats ? `<p class="v2hint">Beats the account CPA. Last video ${c.quiet_days} days ago, so no nudge needed yet.</p>` : '') : '';
    pop(`<h3>${c && c.avatar ? `<img class="tb-av" alt="" src="${esc(c.avatar)}">` : ''}${esc(name)}</h3>
      <div class="tb-sub">${c ? `${c.approved} approved video${c.approved === 1 ? '' : 's'}, ${c.videos} live${c.last_video ? `, last video ${esc(c.last_video)}` : ''}` : ''}</div>${why}${kv}
      ${lv.length ? `<h3 style="font-size:14px;margin-top:14px">Live (${lv.length})</h3>${lv.map(r => mini(r, `<b>${money(r.spend)}</b><div class="tb-sub">${n1(r.orders)} sales${r.cpa != null ? `, CPA ${money(r.cpa)}` : ''}</div>`)).join('')}` : ''}
      ${qv.length && !CL() ? `<h3 style="font-size:14px;margin-top:14px">Not run yet (${qv.length})</h3>${qv.map(r => mini(r, `<span class="v2pill ${(STATE[r.state] || [])[1] || ''}">${(STATE[r.state] || [r.state])[0]}</span>`)).join('')}` : ''}
      ${d.portal && !CL() ? `<div class="tb-foot"><a class="v2btn ghost" href="${esc(d.portal)}" target="_blank" rel="noopener">Message them in Trybe</a></div>` : ''}`);
    const w = document.getElementById('tbPop');
    if (w) w.querySelectorAll('[data-tbplay]').forEach(b => { b.onclick = e => { e.stopPropagation(); watch(b.dataset.tbplay); }; });
  }

  function wire() {
    const root = $('#main'); if (!root) return;
    root.querySelectorAll('[data-tbv]').forEach(b => { b.onclick = () => { if (b.dataset.tbv === 'briefs') return H.show('amb'); VIEW = b.dataset.tbv; paint(); }; });
    root.querySelectorAll('[data-tbplay]').forEach(b => { b.onclick = e => { e.stopPropagation(); watch(b.dataset.tbplay); }; });
    root.querySelectorAll('[data-tbwho]').forEach(b => { b.onclick = () => creator(b.dataset.tbwho); });
    root.querySelectorAll('[data-tbact]').forEach(r => { r.onclick = () => { if (H.setViewAct) H.setViewAct(r.dataset.tbact); H.show('trybe'); }; });
    const u = UI[VIEW];
    if (u) {
      const q = $('#tbQ'); if (q) q.oninput = () => { u.q = q.value; paint('tbQ'); };
      for (const [id, k] of [['tbF', 'f'], ['tbP', 'p'], ['tbS', 's']]) { const el = document.getElementById(id); if (el) el.onchange = () => { u[k] = el.value; paint(); }; }
    }
    const sync = document.getElementById('tbSync');
    if (sync) sync.onclick = async () => { sync.disabled = true; sync.textContent = 'Updating…'; try { await ah('/api/trybe/sync', { act: H.S.act }); toast('Updated'); await render(H, false); } catch (e) { toast(e.message); sync.disabled = false; sync.textContent = 'Update'; } };
    const save = $('#tbRulesSave');
    if (save) save.onclick = async () => { save.disabled = true; try { const r = await ah('/api/trybe/rules', { act: H.S.act, rules: $('#tbRules').value }, 'PUT'); DATA.rules = r.rules; DATA.rules_default = r.rules_default; toast('Rules saved'); paint(); } catch (e) { toast(e.message); save.disabled = false; } };
    const al = $('#tbAlerts');
    if (al) al.onclick = async () => { al.disabled = true; try { const r = await ah('/api/trybe/alerts', { on: !DATA.alerts }, 'PUT'); DATA.alerts = r.alerts; toast(r.alerts ? 'Slack lines on' : 'Slack lines off'); paint(); } catch (e) { toast(e.message); al.disabled = false; } };
    const kn = $('#tbKeyNew'); if (kn) kn.onclick = () => { DATA.has_key = false; paint(); };
    const ks = $('#tbKeySave');
    if (ks) ks.onclick = async () => {
      const err = $('#tbKeyErr'); err.hidden = true; ks.disabled = true; ks.textContent = 'Checking with Trybe…';
      try { await ah('/api/trybe/key', { act: H.S.act, key: $('#tbKey').value }, 'PUT'); toast('Connected'); await render(H, true); }
      catch (e) { err.textContent = e.message; err.hidden = false; ks.disabled = false; ks.textContent = 'Connect'; }
    };
  }

  window.TrybeTab = { render, setView: v => { VIEW = v; } };
})();

/* THE BUYER LIST (2026-10-26, Cole approved in chat). Ads > Buyer list, the first page under Ads, in Agency view (every
 * brand) and for one brand. ONE list sorted by money at stake: the ad calls (hub.js buyerList: Scale, Cut, Trim,
 * Refresh, Mixed), test minimums due off, and Production cards in Ready with approved ads not on Meta yet.
 * Each row: brand, the ad set or ad, the action in plain words, one line of why, and Do / Skip / Open.
 *   Do    Scale / Cut / Trim: the shared Meta write (nudge.js window.LxMetaWrite: dry run, before and after, write, Undo).
 *         Test minimum: /api/meta/write kind min_spend, min 0 (the same dry run, then the write with expect, Undo).
 *         Launch: the existing Launch to Meta window (launch.js), the ads go up paused.
 *         Refresh: asks Locus to brief the new version. Mixed has no Do: Done marks it decided.
 *   Skip  quiet until tomorrow, for everyone. Done is quiet 3 days. A change written to Meta in the last 3 days hides
 *         the call too (watch 3 days). The state is on the server (account-health buyerlist.js, p_buyer_state), shared
 *         with Ads > Today's calls; never localStorage.
 *   Open  the ad set on Campaigns, the ad on Ads, the card on Production.
 * Server: account-health GET /api/buyer-list, POST /api/buyer-list/state, PUT /api/buyer-list/settings,
 * GET /api/buyer-list/preview (the one daily Slack post, settings buyerPost / buyerChannel / buyerOwner).
 * Launch days (2026-10-26, Cole): Ready cards are Launch rows only on a launch day (settings.launchDays, default Mon and
 * Thu) or on and after their own launch_on date; other days a quiet "Next launch: Thursday, N cards" line. Below the list,
 * "Launched and scheduled": Scheduled (dated cards, cards waiting for the next launch day) and Launched (p_launch, last 30
 * days, newest first; status read live from Meta after the page paints, GET /api/buyer-list/launched?refresh=1). A search
 * box filters both by brand, card or ad. A tap on a row opens its details (a bottom sheet on a phone).
 * REVIEW FLOW (2026-10-26, account-health buyerai.js): every ad call row opens to show the ad set's ads (cover, name, 7-day
 * numbers each; a tap on a picture = the bigger view, playing when Meta gives a video). Agree = the Do above (the shared
 * Meta write, logged, Undo). Disagree = "Why not?" -> Locus answers once in two sentences (drops it, or holds with
 * numbers) -> Go with mine / Go with Locus; every disagreement is saved as a buyer lesson the morning read follows.
 * The morning read (Opus, before the daily post) marks each rule row keep / change / drop and adds the calls the rules
 * missed (kind 'ai', "From the morning read").
 * The host passes { S, api, apiAH, show, pageHead, pageActions, confirmModal, AskUI, RUN }. */
(() => {
  let H = null;
  const $ = s => document.querySelector(s);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const sym = c => (!c || c === 'USD' ? '$' : c === 'GBP' ? '£' : c === 'EUR' ? '€' : c === 'CAD' ? 'CA$' : c === 'AUD' ? 'A$' : c + ' ');
  const money = (n, c) => n == null || !isFinite(n) ? '' : sym(c) + Math.round(n).toLocaleString('en-US');
  const kmoney = (n, c) => Math.abs(n) >= 1e4 ? `${sym(c)}${(n / 1e3).toFixed(1)}K` : money(n, c);
  const OWNERS = ['Cole', 'Ahsan', 'Noma', 'William', 'Ravo', 'Radhesh', 'Hamza'];
  const KIND_LABEL = { all: 'All', cut: 'Cut', scale: 'Scale', trim: 'Trim', refresh: 'Refresh', mixed: 'Your call', minoff: 'Test minimums', launch: 'Launch', ai: 'Morning read' };
  const CHIP = { cut: 'CUT', scale: 'SCALE', trim: 'TRIM', refresh: 'REFRESH', mixed: 'YOUR CALL', minoff: 'MINIMUM', launch: 'LAUNCH', ai: 'MORNING READ' };
  const DO_LABEL = { budget: 'Agree', pause: 'Agree', minoff: 'Agree', launch: 'Launch', brief: 'Agree' };
  const AI_SAYS = { keep: 'agrees', change: 'says change it', drop: 'says drop it' };
  const ROLE = { opener: 'Opens journeys', closer: 'Closes sales', both: 'Opens and closes' };
  let OPEN = new Set(), ADS = new Map();
  const DO_TIP = { budget: 'Raise this ad set\'s budget 20%. You see the number and confirm before anything is written.', pause: 'Turn it off in Meta. You see it first and confirm.',
    minoff: 'Set the test minimum to $0 in Meta. You see it first and confirm.', launch: 'Opens Launch to Meta for this card. The ads go up paused.', brief: 'Ask Locus to brief a new version of the main ad.' };
  let KIND = 'all', SHOWQ = false, DATA = null, BUSY = false, LQ = '', LALL = false, LREAD = '';
  const DAYS = [['mon', 'Monday'], ['tue', 'Tuesday'], ['wed', 'Wednesday'], ['thu', 'Thursday'], ['fri', 'Friday'], ['sat', 'Saturday'], ['sun', 'Sunday']];
  const daysWords = v => { const on = String(v || 'mon,thu').split(','); const n = DAYS.filter(([k]) => on.includes(k)).map(([, w]) => w); return n.length > 1 ? `${n.slice(0, -1).join(', ')} and ${n[n.length - 1]}` : n[0] || ''; };
  const ymdShort = ymd => { const t = new Date(ymd + 'T12:00:00Z'); return isNaN(t) ? ymd : t.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' }); };
  const whenCT = iso => { const t = new Date(iso); return isNaN(t) ? '' : t.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'America/Chicago' }).replace(' AM', 'am').replace(' PM', 'pm'); };
  /* Meta's effective_status in plain words; a launch never read again is just "Created paused". */
  function statusOf(l) {
    if (!l.checked) return { t: 'Created paused', c: '' };
    const e = String(l.eff_status || l.status || '').toUpperCase();
    if (e === 'ACTIVE') return { t: 'On', c: 'good' };
    if (e === 'PAUSED') return { t: 'Paused', c: '' };
    if (e === 'ADSET_PAUSED') return { t: 'Paused (ad set off)', c: '' };
    if (e === 'CAMPAIGN_PAUSED') return { t: 'Paused (campaign off)', c: '' };
    if (e === 'PENDING_REVIEW' || e === 'IN_PROCESS' || e === 'PREAPPROVED') return { t: 'In review at Meta', c: 'warn' };
    if (e === 'DISAPPROVED') return { t: 'Rejected by Meta', c: 'bad' };
    if (e === 'WITH_ISSUES') return { t: 'Has issues', c: 'bad' };
    if (e === 'DELETED' || e === 'ARCHIVED') return { t: e === 'DELETED' ? 'Deleted' : 'Archived', c: 'bad' };
    return { t: e ? e.charAt(0) + e.slice(1).toLowerCase().replace(/_/g, ' ') : 'Created paused', c: '' };
  }

  function css() {
    if (document.getElementById('bycss')) return;
    const st = document.createElement('style'); st.id = 'bycss';
    st.textContent = `
      .by .by-lead{margin:0 0 12px}
      .by .by-own{display:inline-flex;gap:6px;align-items:center;flex-wrap:wrap}
      .by .by-chips{margin:0 0 12px}
      .by .by-chips button{display:inline-flex;gap:6px;align-items:center}
      .by .by-chips button b{font-variant-numeric:tabular-nums}
      .by .by-row{display:grid;grid-template-columns:150px minmax(0,1.1fr) minmax(0,1.6fr) 96px 300px;gap:12px;align-items:center;padding:11px 0;border-top:1px solid var(--line)}
      .by .by-row:first-of-type{border-top:0}
      .by .by-row.head{font-size:11.5px;color:var(--muted);padding:2px 0 6px;border-top:0}
      .by .by-br{font-weight:600;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      .by .by-nm{min-width:0}
      .by .by-nm .n{font-weight:550;display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:2;overflow:hidden;word-break:break-word}
      .by .by-nm .s{font-size:12px;color:var(--muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      .by .by-what{min-width:0;display:flex;flex-direction:column;gap:4px}
      .by .by-act{display:flex;gap:8px;align-items:center;flex-wrap:wrap;font-weight:600}
      .by .by-why{font-size:12.5px;color:var(--muted);display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:2;overflow:hidden}
      .by .by-st{text-align:right;font-variant-numeric:tabular-nums;font-weight:600}
      .by .by-st small{display:block;font-size:11px;font-weight:400;color:var(--muted)}
      .by .by-k{font-size:10px;font-weight:700;letter-spacing:.05em;padding:3px 6px;border-radius:5px;background:var(--surface-2);color:var(--ink)}
      .by .by-k.scale{background:var(--good-bg);color:var(--good)}.by .by-k.cut{background:var(--bad-bg);color:var(--bad)}.by .by-k.trim,.by .by-k.minoff{background:var(--warn-bg);color:var(--warn)}
      .by .by-k.refresh,.by .by-k.launch{background:var(--brand-soft);color:var(--brand)}
      .by .by-btns{display:flex;gap:6px;justify-content:flex-end}
      .by .by-btns .v2btn{margin:0;min-width:64px}
      .by .by-q{opacity:.75}
      .by .by-ai{font-size:12.5px;color:var(--ink);background:var(--surface-2);border-radius:6px;padding:4px 8px}
      .by .by-ai b{font-weight:650}.by .by-ai.drop b{color:var(--bad)}.by .by-ai.change b{color:var(--warn)}.by .by-ai.keep b{color:var(--good)}
      .by .by-k.ai{background:var(--brand-soft);color:var(--brand)}
      .by .by-tog{background:none;border:0;padding:0;margin-top:3px;font:inherit;font-size:12px;color:var(--brand);cursor:pointer;min-height:24px}
      .by .by-ads{grid-column:1/-1;padding:4px 0 6px}
      .by .by-adg{display:grid;grid-template-columns:repeat(auto-fill,minmax(210px,1fr));gap:10px}
      .by .by-ad{border:1px solid var(--line);border-radius:10px;overflow:hidden;background:var(--surface);display:flex;flex-direction:column}
      .by .by-ad.hit{border-color:var(--warn);box-shadow:0 0 0 1px var(--warn)}
      .by .by-adth{aspect-ratio:1/1;background:var(--surface-2) center/cover no-repeat;border:0;padding:0;cursor:zoom-in;position:relative;width:100%}
      .by .by-adth span{position:absolute;left:6px;top:6px;font-size:10.5px;font-weight:650;background:rgba(0,0,0,.6);color:#fff;border-radius:5px;padding:2px 6px}
      .by .by-adb{padding:8px 10px 10px;display:flex;flex-direction:column;gap:6px}
      .by .by-adn{font-weight:600;font-size:13px;display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:2;overflow:hidden;word-break:break-word}
      .by .by-adtags{display:flex;gap:4px;flex-wrap:wrap}.by .by-adtags i{font-style:normal;font-size:10.5px;padding:2px 6px;border-radius:5px;background:var(--surface-2);color:var(--muted)}
      .by .by-adm{display:grid;grid-template-columns:auto 1fr;gap:2px 10px;font-size:12px;margin:0}.by .by-adm dt{color:var(--muted)}.by .by-adm dd{margin:0;text-align:right;font-variant-numeric:tabular-nums}
      .by .by-adm dd.good{color:var(--good)}.by .by-adm dd.bad{color:var(--bad)}
      .by-say{font-size:14.5px;line-height:1.5;background:var(--surface-2);border-radius:8px;padding:10px 12px;margin:0 0 12px}
      .by-form textarea{min-height:90px;resize:vertical;font:inherit}
      .by-ls{list-style:none;margin:0 0 12px;padding:0;max-height:60vh;overflow:auto}.by-ls li{border-top:1px solid var(--line);padding:10px 0;font-size:13.5px}.by-ls li:first-child{border-top:0}
      .by-ls .m{font-size:12px;color:var(--muted)}
      .by .by-q .by-why{-webkit-line-clamp:1}
      .by .by-foot{display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin-top:10px;font-size:12.5px;color:var(--muted)}
      .by .by-notes{font-size:12px;color:var(--muted);margin-top:8px}
      .by-form label{display:flex;flex-direction:column;gap:4px;margin:0 0 12px;font-size:13px}
      .by-form label.row{flex-direction:row;align-items:center;gap:8px}
      .by-form label.row input{width:auto}
      .by-pre{white-space:pre-wrap;font:12.5px/1.5 var(--mono,ui-monospace,monospace);background:var(--surface-2);border:1px solid var(--line);border-radius:8px;padding:10px 12px;max-height:260px;overflow:auto;margin:0 0 12px}
      .by .by-next{margin:-4px 0 12px;font-size:13px;color:var(--muted)}
      .by .by-lnch .v2h{display:flex;gap:10px;align-items:center;flex-wrap:wrap;justify-content:space-between}
      .by .by-lnch .by-find{max-width:260px;flex:1 1 180px;min-height:36px}
      .by .by-lnch h4{margin:14px 0 4px;font-size:12px;font-weight:650;letter-spacing:.03em;color:var(--muted);text-transform:uppercase}
      .by .by-l{display:grid;grid-template-columns:118px 140px minmax(0,1fr) 150px 72px;gap:12px;align-items:center;padding:9px 0;border-top:1px solid var(--line);cursor:pointer}
      .by .by-l:hover{background:var(--surface-2)}
      .by .by-l .w{font-variant-numeric:tabular-nums;font-size:12.5px}
      .by .by-l .b{font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      .by .by-l .a{min-width:0}.by .by-l .a .n{font-weight:550;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      .by .by-l .a .s{font-size:12px;color:var(--muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      .by .by-l .st{font-size:12px}.by .by-l .st.good{color:var(--good)}.by .by-l .st.warn{color:var(--warn)}.by .by-l .st.bad{color:var(--bad)}
      .by .by-l .v2btn{margin:0;min-width:60px}
      .by .by-lmore{margin-top:8px}
      .by-dl{display:grid;grid-template-columns:110px 1fr;gap:6px 12px;margin:0 0 12px;font-size:13.5px}.by-dl dt{color:var(--muted)}.by-dl dd{margin:0;word-break:break-word}
      .by-days{display:flex;flex-wrap:wrap;gap:8px}.by-days label{flex-direction:row;align-items:center;gap:6px;margin:0;border:1px solid var(--line);border-radius:8px;padding:8px 10px;min-height:44px}
      @media (max-width:900px){
        .by .by-l{grid-template-columns:1fr auto;grid-template-areas:"w st" "b b" "a a";gap:2px 10px;padding:12px 0}
        .by .by-l .w{grid-area:w}.by .by-l .st{grid-area:st;text-align:right}.by .by-l .b{grid-area:b}.by .by-l .a{grid-area:a}.by .by-l .v2btn{display:none}
        .by .by-lnch .by-find{max-width:none;flex-basis:100%;min-height:44px}
        .by .by-row{grid-template-columns:1fr auto;grid-template-areas:"br st" "nm nm" "what what" "btns btns";gap:6px 10px;padding:14px 0}
        .by .by-row.head{display:none}
        .by .by-br{grid-area:br}.by .by-st{grid-area:st}.by .by-nm{grid-area:nm}.by .by-what{grid-area:what}.by .by-btns{grid-area:btns;justify-content:stretch}
        .by .by-btns .v2btn{flex:1;min-height:44px;min-width:0}
        .by .by-btns{flex-wrap:wrap}
        .by .by-adg{grid-template-columns:repeat(2,minmax(0,1fr))}
        .by .by-tog{min-height:44px}
        .by .by-st small{display:inline;margin-left:4px}
      }`;
    document.head.appendChild(st);
  }
  const toast = (msg, bad, undo) => {
    document.querySelectorAll('.lx-toast.by-t').forEach(x => x.remove());
    const t = document.createElement('div'); t.className = `lx-toast by-t${bad ? ' bad' : ''}`; t.setAttribute('role', 'status');
    t.innerHTML = `<span>${esc(msg)}</span>${undo ? '<button type="button">Undo</button>' : ''}`;
    if (undo) t.querySelector('button').onclick = () => { t.remove(); undo(); };
    document.body.appendChild(t); setTimeout(() => t.remove(), undo ? 10000 : bad ? 6000 : 3000);
  };
  /* One in-app modal (a .modal-wrap: centred on a computer, a bottom sheet on a phone). onYes returns a promise; an error
     stays in the modal. */
  function modal(title, hint, body, cta, onYes) {
    const w = document.createElement('div'); w.className = 'modal-wrap';
    w.innerHTML = `<div class="modal lx-nudge-m" role="dialog" aria-modal="true"><h3>${esc(title)}</h3>${hint ? `<p class="hint">${hint}</p>` : ''}<div class="by-form lx-nudge-mb">${body}</div><p class="lx-nudge-err" data-err hidden></p>
      <div class="row lx-nudge-ma"><button class="btn" data-m="no" type="button">${cta ? 'Cancel' : 'Close'}</button>${cta ? `<button class="btn primary" data-m="yes" type="button">${esc(cta)}</button>` : ''}</div></div>`;
    document.body.appendChild(w);
    const yes = w.querySelector('[data-m="yes"]'), err = w.querySelector('[data-err]');
    const close = () => { w.remove(); document.removeEventListener('keydown', key); };
    const key = e => { if (e.key === 'Escape') close(); };
    document.addEventListener('keydown', key);
    w.addEventListener('mousedown', e => { if (e.target === w) close(); });
    w.querySelector('[data-m="no"]').onclick = close;
    if (yes) yes.onclick = async () => {
      yes.disabled = true; const was = yes.textContent; yes.textContent = 'Working…'; err.hidden = true;
      try { await onYes(w); close(); } catch (e) { err.textContent = e.message || 'That did not work.'; err.hidden = false; yes.disabled = false; yes.textContent = was; }
    };
    return { w, close, yes, err };
  }
  const ah = (path, body, method) => H.apiAH(path, body ? { method: method || 'POST', body: JSON.stringify(body) } : undefined);
  const state = (r, status) => ah('/api/buyer-list/state', { act: r.act_id, object: r.object, action: r.kind, status, name: r.name });
  const pickAct = (id, tab) => { H.S.act = id; try { localStorage.setItem('pf_act', id); } catch {} const cp = document.getElementById('clientPick'); if (cp) cp.value = id; H.show(tab); };
  const firstName = e => { const s = String(e || ''); if (!s.includes('@')) return s; const n = s.split('@')[0].split(/[._-]/)[0]; return n ? n[0].toUpperCase() + n.slice(1) : s; };

  async function render(host, first) {
    H = host; css();
    const t = H.RUN();
    const one = H.S.act !== 'all' ? H.S.accounts.find(a => a.act_id === H.S.act) : null;
    const title = one ? `Buyer list: ${esc(one.name)}` : 'Buyer list';
    const shell = body => `<div class="v2 by">${H.pageHead('buyer', title).replace(/<p class="ph-sub">[\s\S]*?<\/p>/, '')}${body}</div>`;
    if (first || !DATA || DATA.act !== (one ? one.act_id : 'all')) $('#main').innerHTML = shell('<section class="v2card"><p class="v2hint">Reading every brand&rsquo;s calls, test minimums and cards ready to launch&hellip;</p></section>');
    let d;
    try { d = await H.apiAH(`/api/buyer-list?act=${encodeURIComponent(one ? one.act_id : 'all')}`); if (d && d.error) throw new Error(d.error); }
    catch (e) { if (t === H.RUN()) $('#main').innerHTML = shell(`<section class="v2card"><h3>Could not load the list</h3><p class="v2bad">${esc(e.message)}</p><button type="button" class="v2btn" id="byRetry">Try again</button></section>`); const b = $('#byRetry'); if (b) b.onclick = () => render(H, true); return; }
    if (t !== H.RUN()) return;
    DATA = d; LREAD = ''; paint();
    if ((d.launched || []).length) readLaunched(d.act);
  }

  function paint() {
    const d = DATA, one = d.act !== 'all';
    const rows = d.rows || [];
    const shown = rows.filter(r => KIND === 'all' || r.kind === KIND);
    const kinds = ['all', 'cut', 'scale', 'trim', 'refresh', 'mixed', 'ai', 'minoff', 'launch'].filter(k => k === 'all' || (d.counts || {})[k]);
    const chips = kinds.length > 2 ? `<div class="v2jobs by-chips" role="group" aria-label="Kind">${kinds.map(k => `<button type="button" class="${KIND === k ? 'on' : ''}" data-k="${k}" aria-pressed="${KIND === k}"><b>${k === 'all' ? rows.length : d.counts[k]}</b>${KIND_LABEL[k]}</button>`).join('')}</div>` : '';
    const stake = d.stake > 0 ? `, <b>${esc(kmoney(d.stake, d.currency))}</b> at stake` : '';
    const nx = d.next_launch || {};
    const next = !d.launch_today && nx.n ? `<p class="by-next">Next launch: <b>${esc(nx.day)}</b>, ${nx.n} card${nx.n === 1 ? '' : 's'} (${nx.n_ads} approved ad${nx.n_ads === 1 ? '' : 's'}). Ready cards go out on launch days, ${esc(daysWords(d.launch_days))}.</p>`
      : d.launch_today && (d.counts || {}).launch ? `<p class="by-next">Launch day today: ${d.counts.launch} card${d.counts.launch === 1 ? '' : 's'} to launch.</p>` : '';
    const lead = `<p class="v2say lead by-lead"><b>${d.n} to do</b>${one ? '' : ` across ${d.n_brands} brand${d.n_brands === 1 ? '' : 's'}`}${stake}. <span class="by-own">Owner: <b>${esc(d.owner)}</b> <button type="button" class="v2link" id="byOwner">Change</button></span></p>`;
    const head = `<div class="by-row head" aria-hidden="true"><span>Brand</span><span>Ad set or ad</span><span>What to do, and why</span><span style="text-align:right">At stake</span><span></span></div>`;
    const list = shown.length ? `<section class="v2card">${head}${shown.map(row).join('')}</section>`
      : `<section class="v2card"><h3>Nothing to do</h3><p class="v2hint">${KIND === 'all' ? 'No ad set crossed a rule, no test minimum is due off and no card is waiting to launch. Done and skipped calls come back when they are due.' : 'Nothing of this kind right now.'}</p></section>`;
    const h = d.hidden || {}, nq = (h.done || 0) + (h.skipped || 0) + (h.watched || 0);
    const foot = `<div class="by-foot"><span>Sorted by money at stake. A minimum counts a week of it; launches have no money yet.</span>${one ? '<button type="button" class="v2link" id="byCalls">Your calls</button>' : ''}${nq ? `<button type="button" class="v2link" id="byQuiet">${SHOWQ ? 'Hide' : 'Show'} ${nq} quiet: ${[h.done ? `${h.done} done` : '', h.skipped ? `${h.skipped} skipped until tomorrow` : '', h.watched ? `${h.watched} changed in Meta in the last 3 days` : ''].filter(Boolean).join(', ')}</button>` : ''}</div>`;
    const quiet = SHOWQ && nq ? `<section class="v2card"><div class="v2h"><h3>Quiet for now</h3><span class="find">Done stays quiet 3 days, Skip until tomorrow, and a change made in Meta is watched 3 days before it is judged again.</span></div>${(d.quiet || []).map(qrow).join('')}</section>` : '';
    /* Tracking gap (hub.js buyerList banners): one line per brand whose cuts are on hold. */
    const banners = (d.banners || []).map(b => `<p class="v2say by-gap" role="note"><b>${esc(b.brand)}</b>: ${esc(b.text)}</p>`).join('');
    /* The morning read: one line, the brand summaries when one brand is open. */
    const ai = d.ai || {};
    const aiLine = !ai.on ? '' : ai.n_read ? `<p class="by-next">Morning read: ${ai.n_read} of ${ai.n_brands} brand${ai.n_brands === 1 ? '' : 's'} read today.${one && (ai.brands || [])[0] ? ` ${esc(ai.brands[0].summary)}` : ''}</p>`
      : `<p class="by-next">The morning read has not run today yet.</p>`;
    const notes = (d.notes || []).length ? `<p class="by-notes">Could not read everything: ${esc(d.notes.join(' · '))}</p>` : '';
    const lsec = `<section class="v2card by-lnch" id="byLaunch"><div class="v2h"><h3>Launched and scheduled</h3><input type="search" class="by-find" id="byFind" placeholder="${one ? 'Find a card or ad' : 'Find a brand, card or ad'}" value="${esc(LQ)}" aria-label="Find in launched and scheduled"></div>
      <p class="v2hint" style="margin:4px 0 0">Launch days: ${esc(daysWords(d.launch_days))} (Central). A card with its own date goes out on that date. <button type="button" class="v2link" id="byDays">Change launch days</button></p><div id="byLBody">${launchBody()}</div></section>`;
    $('#main').innerHTML = `<div class="v2 by">${H.pageHead('buyer', one ? `Buyer list: ${esc((H.S.accounts.find(a => a.act_id === d.act) || {}).name || '')}` : 'Buyer list').replace(/<p class="ph-sub">[\s\S]*?<\/p>/, '')}${lead}${banners}${aiLine}${next}${chips}${list}${foot}${quiet}${lsec}${notes}</div>`;
    if (typeof H.pageActions === 'function') H.pageActions('<button type="button" class="btn" id="bySlack" title="The one Buyer list post a day in Slack: where it goes, on or off, and what it says now.">Slack post</button>');
    wire();
  }
  const LSHOW = 25;
  const hit = (...xs) => { const q = LQ.trim().toLowerCase(); return !q || xs.some(x => String(x || '').toLowerCase().includes(q)); };
  function launchBody() {
    const d = DATA, one = d.act !== 'all';
    const sch = (d.scheduled || []).filter(s => hit(s.brand, s.name));
    const lau = (d.launched || []).filter(l => hit(l.brand, l.ad_name, l.adset, l.card));
    const sRows = sch.map(s => `<div class="by-l" role="button" tabindex="0" data-ls="${esc(s.key)}">
        <span class="w">${esc(ymdShort(s.date))}</span><span class="b">${one ? '' : esc(s.brand)}</span>
        <div class="a"><div class="n" title="${esc(s.name)}">${esc(s.name)}</div><div class="s">${s.board === 'review' ? 'In review' : s.n_ads ? `${s.n_ads} approved ad${s.n_ads === 1 ? '' : 's'}, Ready` : 'Ready'}</div></div>
        <span class="st">${s.dated ? 'Its own date' : 'Next launch day'}</span><button type="button" class="v2btn ghost" data-lopen="${esc(s.card_id)}" data-lact="${esc(s.act_id)}">Open</button></div>`).join('');
    const lShown = LALL ? lau : lau.slice(0, LSHOW);
    const lRows = lShown.map(l => { const st = statusOf(l); return `<div class="by-l" role="button" tabindex="0" data-ll="${esc(l.id)}">
        <span class="w">${esc(whenCT(l.at))}</span><span class="b">${one ? '' : esc(l.brand)}</span>
        <div class="a"><div class="n" title="${esc(l.ad_name)}">${esc(l.ad_name || 'Ad')}</div><div class="s">${esc([l.adset ? `in ${l.adset}` : '', l.by ? `by ${firstName(l.by)}` : ''].filter(Boolean).join(', '))}</div></div>
        <span class="st ${st.c}">${esc(st.t)}</span>${l.card_id ? `<button type="button" class="v2btn ghost" data-lopen="${esc(l.card_id)}" data-lact="${esc(l.act_id)}">Card</button>` : '<span></span>'}</div>`; }).join('');
    const q = LQ.trim();
    return `<h4>Scheduled (${sch.length})</h4>${sRows || `<p class="v2hint">${q ? 'Nothing scheduled matches.' : 'No card is waiting for a launch day or a date.'}</p>`}
      <h4>Launched, last 30 days (${lau.length})</h4>${lRows || `<p class="v2hint">${q ? 'No launch matches.' : 'Nothing launched from Locus in the last 30 days.'}</p>`}
      ${lau.length > LSHOW ? `<button type="button" class="v2link by-lmore" id="byLAll">${LALL ? 'Show fewer' : `Show all ${lau.length}`}</button>` : ''}
      ${LREAD ? `<p class="by-notes">${esc(LREAD)}</p>` : ''}`;
  }
  function paintLaunch() { const b = document.getElementById('byLBody'); if (!b) return; b.innerHTML = launchBody(); wireLaunch(); }
  function wireLaunch() {
    const root = document.getElementById('byLaunch'); if (!root) return;
    const all = document.getElementById('byLAll'); if (all) all.onclick = () => { LALL = !LALL; paintLaunch(); };
    root.querySelectorAll('[data-lopen]').forEach(b => b.onclick = e => { e.stopPropagation(); openCard(b.dataset.lact, b.dataset.lopen); });
    const tap = (el, fn) => { el.onclick = fn; el.onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fn(); } }; };
    root.querySelectorAll('[data-ll]').forEach(el => tap(el, () => launchedSheet((DATA.launched || []).find(l => l.id === el.dataset.ll))));
    root.querySelectorAll('[data-ls]').forEach(el => tap(el, () => schedSheet((DATA.scheduled || []).find(s => s.key === el.dataset.ls))));
  }
  function openCard(act, id) { window.PD_CARD = id; pickAct(act, 'production'); }
  function launchedSheet(l) {
    if (!l) return;
    const st = statusOf(l);
    const m = modal(l.ad_name || 'Launched ad', esc(l.brand), `<dl class="by-dl">
      <dt>Launched</dt><dd>${esc(whenCT(l.at))} Central${l.by ? `, by ${esc(firstName(l.by))}` : ''}</dd>
      <dt>Ad set</dt><dd>${esc(l.adset || 'Not recorded')}</dd>
      <dt>In Meta now</dt><dd>${esc(st.t)}${l.checked && l.checked_at ? ` <span class="faint">(read ${esc(whenCT(l.checked_at))})</span>` : ' <span class="faint">(not read since)</span>'}</dd>
      <dt>Card</dt><dd>${l.card ? esc(l.card) : 'No Production card'}</dd></dl>
      <div class="row" style="gap:8px;flex-wrap:wrap">${l.card_id ? '<button type="button" class="btn" data-x="card">Open the card</button>' : ''}${l.ads_manager ? `<a class="btn" href="${esc(l.ads_manager)}" target="_blank" rel="noopener">Open in Ads Manager</a>` : ''}</div>`, null, null);
    const c = m.w.querySelector('[data-x="card"]'); if (c) c.onclick = () => { m.close(); openCard(l.act_id, l.card_id); };
  }
  function schedSheet(s) {
    if (!s) return;
    const m = modal(s.name, esc(s.brand), `<dl class="by-dl">
      <dt>Goes out</dt><dd>${esc(ymdShort(s.date))}${s.dated ? ' (its own date)' : ' (the next launch day)'}</dd>
      <dt>On Production</dt><dd>${s.board === 'review' ? 'In review' : 'Ready'}${s.n_ads ? `, ${s.n_ads} approved ad${s.n_ads === 1 ? '' : 's'} not on Meta yet` : ''}</dd></dl>
      <p class="v2hint">It shows on the Buyer list as a Launch row on that day. To change the date, set Launch on the card.</p>
      <div class="row"><button type="button" class="btn" data-x="card">Open the card</button></div>`, null, null);
    m.w.querySelector('[data-x="card"]').onclick = () => { m.close(); openCard(s.act_id, s.card_id); };
  }
  function daysModal() {
    const on = String(DATA.launch_days || 'mon,thu').split(',');
    modal('Launch days', 'Ready cards with approved ads show as Launch rows on these days (Central). A card with its own launch date goes out on that date, any weekday.',
      `<div class="by-days">${DAYS.map(([k, w]) => `<label><input type="checkbox" name="d" value="${k}"${on.includes(k) ? ' checked' : ''}> ${w}</label>`).join('')}</div>`, 'Save', async w => {
        const v = [...w.querySelectorAll('input[name="d"]:checked')].map(x => x.value);
        if (!v.length) throw new Error('Pick at least one day.');
        const j = await ah('/api/buyer-list/settings', { launchDays: v.join(',') }, 'PUT');
        if (!j || j.error) throw new Error((j && j.error) || 'Locus did not answer.');
        toast(`Launch days: ${daysWords(j.settings.launchDays)}.`); reload();
      });
  }
  /* Meta status for the launches, read after the page paints so the list never waits on Meta. */
  async function readLaunched(act) {
    try {
      const j = await H.apiAH(`/api/buyer-list/launched?act=${encodeURIComponent(act)}&refresh=1`);
      if (!DATA || DATA.act !== act || !j || !Array.isArray(j.launched)) return;
      DATA.launched = j.launched; LREAD = j.error ? `Could not read the status from Meta: ${j.error}` : '';
      if (H.S.tab === 'buyer') paintLaunch();
    } catch {}
  }

  function row(r) {
    const k = esc(r.key), cur = r.currency || 'USD';
    const sub = r.kind === 'launch' ? (r.launch_on ? `Production, Ready, dated ${ymdShort(r.launch_on)}` : 'Production, Ready') : r.set ? `in ${r.set}` : r.level === 'adset' ? 'Ad set' : '';
    const primary = r.do ? `<button type="button" class="v2btn" data-do="${k}" title="${esc(DO_TIP[r.do] || '')}">${DO_LABEL[r.do] || 'Agree'}</button>`
      : `<button type="button" class="v2btn" data-done="${k}" title="${r.kind === 'ai' ? 'You made this change (or will). It stays quiet 3 days.' : 'Mark it decided. It stays quiet 3 days.'}">${r.kind === 'ai' || r.kind === 'mixed' ? 'Done' : 'Agree'}</button>`;
    const canAds = r.kind !== 'launch' && (r.adset_id || r.ad_id);
    const tog = canAds ? `<button type="button" class="by-tog" data-ads="${k}" aria-expanded="${OPEN.has(r.key)}">${OPEN.has(r.key) ? 'Hide the ads' : 'Show the ads'}</button>` : '';
    const ai = r.ai ? `<div class="by-ai ${esc(r.ai.verdict)}" title="${esc(r.ai.reason)}"><b>Morning read ${esc(AI_SAYS[r.ai.verdict] || r.ai.verdict)}${r.ai.verdict === 'change' && r.ai.change ? `: ${esc(r.ai.change)}` : ''}.</b> ${esc(r.ai.reason)}</div>`
      : r.kind === 'ai' ? '<div class="by-ai"><b>From the morning read.</b> The rules did not flag this; Locus did.</div>' : '';
    const dis = r.kind !== 'launch' ? `<button type="button" class="v2btn ghost" data-dis="${k}" title="Say why not. Locus answers once, then your call stands and it remembers it.">Disagree</button>` : '';
    return `<div class="by-row" data-key="${k}">
      <span class="by-br" title="${esc(r.brand)}">${esc(r.brand)}</span>
      <div class="by-nm"><div class="n" title="${esc(r.name)}">${esc(r.name)}</div>${sub ? `<div class="s" title="${esc(sub)}">${esc(sub)}</div>` : ''}${tog}</div>
      <div class="by-what"><div class="by-act"><span class="by-k ${esc(r.kind)}">${CHIP[r.kind] || esc(r.kind.toUpperCase())}</span>${esc(r.action)}</div><div class="by-why" title="${esc(r.why_full || r.why)}">${esc(r.why)}</div>${ai}</div>
      <span class="by-st">${r.stake > 0 ? esc(money(r.stake, cur)) : '&ndash;'}<small>${r.stake > 0 ? 'at stake' : r.kind === 'launch' ? 'new ads' : ''}</small></span>
      <div class="by-btns">${primary}${dis}<button type="button" class="v2btn ghost" data-skip="${k}" title="Hide it for everyone until tomorrow.">Skip</button><button type="button" class="v2btn ghost" data-open="${k}" title="${r.kind === 'launch' ? 'Open the card on Production.' : 'Open it in Locus.'}">Open</button></div>
      ${canAds && OPEN.has(r.key) ? `<div class="by-ads" data-adsbox="${k}">${adsHtml(r)}</div>` : ''}</div>`;
  }
  /* ---------- the ads under a row ---------- */
  const fmtN = (v, d = 0) => v == null ? '&ndash;' : Number(v).toLocaleString('en-US', { maximumFractionDigits: d, minimumFractionDigits: d });
  function adsHtml(r) {
    const st = ADS.get(r.key);
    if (!st || st.loading) return '<p class="v2hint">Reading the ads&hellip;</p>';
    if (st.error) return `<p class="v2bad">${esc(st.error)}</p>`;
    if (!st.ads.length) return '<p class="v2hint">No ad in this set spent in the last 7 days.</p>';
    const cur = r.currency || 'USD', roasGoal = r.metric === 'roas';
    const goal = roasGoal ? r.goal_roas : r.goal;
    const card = a => {
      const vs = roasGoal ? (a.roas == null ? '' : goal ? (a.roas >= goal ? 'good' : 'bad') : '') : (a.cpa == null ? (a.spend > 0 && goal && a.spend >= goal ? 'bad' : '') : goal ? (a.cpa <= goal ? 'good' : 'bad') : '');
      const tags = [a.status && a.status !== 'ACTIVE' ? a.status.charAt(0) + a.status.slice(1).toLowerCase().replace(/_/g, ' ') : '', ROLE[a.role] || '', a.video ? 'Video' : 'Image'].filter(Boolean);
      const big = (r.kind === 'trim' && a.ad_id === String(r.ad_id)) ? ' hit' : '';
      return `<div class="by-ad${big}">
        <button type="button" class="by-adth" data-thumb="${esc(a.ad_id)}" data-play="${esc(a.ad_id)}" data-row="${esc(r.key)}"${a.cover ? ` style="background-image:url('${esc(a.cover)}')"` : ''} aria-label="See the ad ${esc(a.name)} bigger">${big ? '<span>This call</span>' : ''}</button>
        <div class="by-adb"><div class="by-adn" title="${esc(a.name)}">${esc(a.name)}</div><div class="by-adtags">${tags.map(t => `<i>${esc(t)}</i>`).join('')}</div>
        <dl class="by-adm"><dt>Spend</dt><dd>${esc(money(a.spend, cur))}</dd><dt>Sales</dt><dd>${fmtN(a.sales, a.sales % 1 ? 1 : 0)}</dd>
          ${roasGoal ? `<dt>ROAS${goal ? ` (goal ${fmtN(goal, 1)}x)` : ''}</dt><dd class="${vs}">${a.roas == null ? '&ndash;' : `${fmtN(a.roas, 2)}x`}</dd>`
            : `<dt>CPA${goal ? ` (goal ${esc(money(goal, cur))})` : ''}</dt><dd class="${vs}">${a.cpa == null ? (a.spend > 0 ? 'no sale' : '&ndash;') : esc(money(a.cpa, cur))}</dd>`}
          <dt>CTR</dt><dd>${a.ctr == null ? '&ndash;' : `${fmtN(a.ctr, 2)}%`}</dd><dt>CPM</dt><dd>${a.cpm == null ? '&ndash;' : esc(money(a.cpm, cur))}</dd>
          <dt>Frequency</dt><dd>${fmtN(a.freq, 2)}</dd>${a.video ? `<dt>Hook rate</dt><dd>${a.hook == null ? '&ndash;' : `${fmtN(a.hook, 1)}%`}</dd>` : ''}</dl></div></div>`;
    };
    return `<p class="v2hint" style="margin:0 0 8px">Last 7 days (${esc(st.from || '')} to ${esc(st.to || '')}). Sales are Triple Whale last click. Tap a picture to see it bigger.</p><div class="by-adg">${st.ads.map(card).join('')}</div>`;
  }
  async function loadAds(r) {
    ADS.set(r.key, { loading: true });
    const qs = new URLSearchParams({ act: r.act_id });
    if (r.adset_id) qs.set('adset', r.adset_id);
    if (r.ad_id) qs.set('ad', r.ad_id);
    if (r.meta_act) qs.set('meta_act', r.meta_act);
    try { const j = await H.apiAH(`/api/buyer-list/ads?${qs}`); if (!j || j.error) throw new Error((j && j.error) || 'Locus did not answer.'); ADS.set(r.key, { ads: j.ads || [], from: j.from, to: j.to }); }
    catch (e) { ADS.set(r.key, { error: `Could not read the ads: ${e.message}` }); }
    paintAds(r);
  }
  function paintAds(r) {
    const box = document.querySelector(`[data-adsbox="${CSS.escape(r.key)}"]`); if (!box) return;
    box.innerHTML = adsHtml(r);
    const st = ADS.get(r.key) || {};
    /* a cover not stored yet comes from /api/ad-creatives (the same cache the Ads page uses) */
    const miss = (st.ads || []).filter(a => !a.cover).map(a => a.ad_id);
    if (miss.length && window.V2 && window.V2.thumbs) window.V2.thumbs(box, miss, r.act_id, H);
    box.querySelectorAll('[data-play]').forEach(b => b.onclick = () => {
      const a = (st.ads || []).find(x => x.ad_id === b.dataset.play); if (!a) return;
      if (!window.V2 || !window.V2.playAd) { window.V2PENDING = { ad: a.ad_id }; return pickAct(r.act_id, 'adcreative'); }
      window.V2.playAd({ id: a.ad_id, name: a.name, act: r.act_id, note: `${r.brand}, in "${r.adset || r.name}". Last 7 days: ${money(a.spend, r.currency)} spent, ${a.sales} sales.` }, H, () => { window.V2PENDING = { ad: a.ad_id }; pickAct(r.act_id, 'adcreative'); });
    });
  }
  function toggleAds(r) {
    if (OPEN.has(r.key)) OPEN.delete(r.key); else { OPEN.add(r.key); if (!ADS.has(r.key) || ADS.get(r.key).error) loadAds(r); }
    paint();
    if (OPEN.has(r.key) && ADS.has(r.key) && !ADS.get(r.key).loading) paintAds(r);
  }
  /* ---------- Disagree: why not -> Locus answers once -> his call ---------- */
  function disagreeModal(r) {
    const m = modal(`Why not? ${r.action}`, `${esc(r.brand)}, "${esc(r.name)}". Locus answers once with the numbers, then your call stands and it remembers it.`,
      `<label>Why not<textarea name="why" maxlength="1200" placeholder="Say it the way you would to a person. For example: it just launched, give it till Friday."></textarea></label><div data-ans></div>`, 'Tell Locus', async w => {
        const why = w.querySelector('[name="why"]').value.trim();
        if (why.length < 4) throw new Error('Say why, in a few words.');
        const j = await ah('/api/buyer-list/disagree', { act: r.act_id, why, row: { key: r.key, kind: r.kind, object: r.object, action: r.action, name: r.name, set: r.set, adset: r.adset, adset_id: r.adset_id, ad_id: r.ad_id, meta_act: r.meta_act,
          why: r.why, why_full: r.why_full, stake: r.stake, goal: r.goal, goal_roas: r.goal_roas, metric: r.metric, role: r.role, ai: r.ai || null } });
        if (!j || j.error) throw new Error((j && j.error) || 'Locus did not answer.');
        answerModal(r, j);
      });
    setTimeout(() => { const t = m.w.querySelector('textarea'); if (t) t.focus(); }, 30);
  }
  function answerModal(r, j) {
    if (j.stance === 'drop') {
      modal('Locus agrees', esc(r.brand), `<p class="by-say">${esc(j.answer)}</p><p class="v2hint">Your call is saved. Locus follows it from now on, and this row is quiet for 3 days.</p>`, null, null);
      drop(r.key, 'done');
      return;
    }
    const m = modal('Locus still thinks so', esc(r.brand), `<p class="by-say">${esc(j.answer)}</p><p class="v2hint">Your call is final either way, and Locus remembers it.</p>
      <div class="row" style="gap:8px;flex-wrap:wrap"><button type="button" class="btn" data-x="mine">Go with mine</button>${r.do ? '<button type="button" class="btn primary" data-x="locus">Go with Locus</button>' : '<button type="button" class="btn primary" data-x="locus">Go with Locus</button>'}</div>`, null, null);
    const go = async dec => {
      m.w.querySelectorAll('[data-x]').forEach(b => { b.disabled = true; });
      try {
        const k = await ah('/api/buyer-list/decide', { act: r.act_id, id: j.id, decision: dec });
        if (!k || k.error) throw new Error((k && k.error) || 'Locus did not answer.');
        m.close();
        if (dec === 'mine') { drop(r.key, 'done'); toast('Going with yours. Locus will remember it.'); }
        else if (r.do) doIt(r);
        else toast('Going with Locus. Make the change, then tap Done.');
      } catch (e) { m.err.textContent = e.message; m.err.hidden = false; m.w.querySelectorAll('[data-x]').forEach(b => { b.disabled = false; }); }
    };
    m.w.querySelector('[data-x="mine"]').onclick = () => go('mine');
    m.w.querySelector('[data-x="locus"]').onclick = () => go('locus');
  }
  async function lessonsModal() {
    const act = DATA.act;
    const m = modal('Your calls', 'Every time you disagreed with Locus on this brand. The morning read and every later answer follow these.', '<p class="v2hint" data-l>Reading&hellip;</p>', null, null);
    try {
      const j = await H.apiAH(`/api/buyer-list/lessons?act=${encodeURIComponent(act)}`); if (!j || j.error) throw new Error((j && j.error) || 'Locus did not answer.');
      const el = m.w.querySelector('[data-l]'); if (!el) return;
      const dec = l => l.decision === 'mine' ? (l.stance === 'drop' ? 'Locus agreed' : 'Went with yours') : l.decision === 'locus' ? 'Went with Locus' : 'Not decided';
      el.outerHTML = (j.lessons || []).length ? `<ul class="by-ls">${j.lessons.map(l => `<li><div><b>${esc(l.name || '')}</b> <span class="m">${esc(String(l.at || '').slice(0, 10))}, ${esc(dec(l))}</span></div><div>You: &ldquo;${esc(l.text)}&rdquo;</div>${l.answer ? `<div class="m">Locus: ${esc(l.answer)}</div>` : ''}</li>`).join('')}</ul>` : '<p class="v2hint">No disagreements yet.</p>';
    } catch (e) { const el = m.w.querySelector('[data-l]'); if (el) { el.className = 'v2bad'; el.textContent = e.message; } }
  }
  function qrow(r) {
    const hb = r.hidden || {}, when = hb.at ? new Date(hb.at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '';
    const why = hb.why === 'done' ? `Done by ${firstName(hb.by) || 'someone'} ${when}, quiet until ${hb.until}` : hb.why === 'skipped' ? `Skipped by ${firstName(hb.by) || 'someone'}, back tomorrow` : `Changed in Meta ${when} by ${firstName(hb.by) || 'someone'}${hb.summary ? `: ${hb.summary}` : ''}. Watched 3 days.`;
    return `<div class="by-row by-q" data-key="${esc(r.key)}"><span class="by-br">${esc(r.brand)}</span><div class="by-nm"><div class="n">${esc(r.name)}</div></div>
      <div class="by-what"><div class="by-act"><span class="by-k ${esc(r.kind)}">${CHIP[r.kind] || ''}</span>${esc(r.action)}</div><div class="by-why" title="${esc(why)}">${esc(why)}</div></div>
      <span class="by-st">${r.stake > 0 ? esc(money(r.stake, r.currency)) : '&ndash;'}</span>
      <div class="by-btns">${hb.why === 'watched' ? '' : `<button type="button" class="v2btn ghost" data-back="${esc(r.key)}" title="Put it back on the list now.">Put it back</button>`}</div></div>`;
  }

  const find = k => (DATA.rows || []).find(r => r.key === k) || (DATA.quiet || []).find(r => r.key === k);
  async function reload() { if (H && H.S.tab === 'buyer') await render(H, false); }
  /* The row leaves the list at once (the server already has it) and the totals follow; no second read of every brand. */
  function drop(k, why = 'done') {
    const i = (DATA.rows || []).findIndex(r => r.key === k); if (i < 0) return;
    const [r] = DATA.rows.splice(i, 1);
    DATA.quiet = [{ ...r, hidden: { why, by: H.S.meEmail || 'you', at: new Date().toISOString(), until: why === 'done' ? 'in 3 days' : 'tomorrow' } }, ...(DATA.quiet || [])];
    DATA.n = DATA.rows.length; DATA.stake = DATA.rows.reduce((s, x) => s + (x.stake || 0), 0); DATA.n_brands = new Set(DATA.rows.map(x => x.act_id)).size;
    DATA.counts = { ...DATA.counts, [r.kind]: Math.max(0, (DATA.counts[r.kind] || 1) - 1) };
    DATA.hidden = { ...DATA.hidden, [why]: (DATA.hidden[why] || 0) + 1 };
    if (H.S.tab === 'buyer') paint();
  }

  function wire() {
    const root = $('#main');
    root.querySelectorAll('[data-k]').forEach(b => b.onclick = () => { KIND = b.dataset.k; paint(); });
    const q = $('#byQuiet'); if (q) q.onclick = () => { SHOWQ = !SHOWQ; paint(); };
    const o = $('#byOwner'); if (o) o.onclick = ownerModal;
    const sl = document.getElementById('bySlack'); if (sl) sl.onclick = slackModal;
    const dy = $('#byDays'); if (dy) dy.onclick = daysModal;
    const fd = $('#byFind'); if (fd) fd.oninput = () => { LQ = fd.value; paintLaunch(); };
    wireLaunch();
    root.querySelectorAll('[data-skip]').forEach(b => b.onclick = async () => {
      const r = find(b.dataset.skip); if (!r || BUSY) return;
      b.disabled = true;
      try { const j = await state(r, 'skipped'); if (j && j.error) throw new Error(j.error); drop(r.key, 'skipped'); toast('Skipped until tomorrow, for everyone.', false, async () => { await state(r, 'clear').catch(() => {}); reload(); }); }
      catch (e) { b.disabled = false; toast(`Could not skip it: ${e.message}`, true); }
    });
    root.querySelectorAll('[data-done]').forEach(b => b.onclick = async () => {
      const r = find(b.dataset.done); if (!r) return;
      b.disabled = true;
      try { const j = await state(r, 'done'); if (j && j.error) throw new Error(j.error); drop(r.key, 'done'); toast('Done. Quiet for 3 days.', false, async () => { await state(r, 'clear').catch(() => {}); reload(); }); }
      catch (e) { b.disabled = false; toast(`Could not save it: ${e.message}`, true); }
    });
    root.querySelectorAll('[data-back]').forEach(b => b.onclick = async () => {
      const r = find(b.dataset.back); if (!r) return;
      b.disabled = true;
      try { await state(r, 'clear'); reload(); } catch (e) { b.disabled = false; toast(e.message, true); }
    });
    root.querySelectorAll('[data-open]').forEach(b => b.onclick = () => { const r = find(b.dataset.open); if (r) open(r); });
    root.querySelectorAll('[data-do]').forEach(b => b.onclick = () => { const r = find(b.dataset.do); if (r) doIt(r); });
    root.querySelectorAll('[data-dis]').forEach(b => b.onclick = () => { const r = find(b.dataset.dis); if (r) disagreeModal(r); });
    root.querySelectorAll('[data-ads]').forEach(b => b.onclick = () => { const r = find(b.dataset.ads); if (r) toggleAds(r); });
    for (const k of OPEN) { const r = find(k); if (r && ADS.has(k) && !ADS.get(k).loading) paintAds(r); }
    const yc = $('#byCalls'); if (yc) yc.onclick = lessonsModal;
  }
  function open(r) {
    if (r.kind === 'launch') return pickAct(r.act_id, 'production');
    if (r.ad_id) { window.V2PENDING = { ad: r.ad_id }; return pickAct(r.act_id, 'adcreative'); }
    if (r.adset_id) { window.V2PENDING = { ...(r.campaign_id ? { campaign: r.campaign_id } : {}), adset: r.adset_id }; return pickAct(r.act_id, 'campaigns'); }
    pickAct(r.act_id, 'channels');
  }
  /* After a change is written: Done for everyone (the write is also in p_meta_write, which watches it 3 days). */
  const afterDo = r => async () => { await state(r, 'done').catch(() => {}); drop(r.key, 'done'); };
  const afterUndo = r => async () => { await state(r, 'clear').catch(() => {}); reload(); };
  function doIt(r) {
    const W = window.LxMetaWrite;
    const it = { act_id: r.act_id, brand: r.brand, currency: r.currency, adset_id: r.adset_id, adset: r.adset || r.name, ad_id: r.kind === 'trim' ? r.ad_id : null, ad: r.kind === 'trim' ? r.ad : null, why: r.why_full || r.why, campaign_id: r.campaign_id, meta_act: r.meta_act };
    if (r.do === 'pause' || r.do === 'budget') {
      if (!W) return toast('The Meta write helper did not load. Hard-refresh (Ctrl+Shift+R).', true);
      const opts = { reason: 'From the Buyer list', onDone: afterDo(r), onUndo: afterUndo(r), onCampaign: () => open(r) };
      return r.do === 'budget' ? W.budget(H, it, { ...opts, pct: 0.2, amount: r.suggested_budget > 0 ? r.suggested_budget : undefined }) : W.pause(H, it, opts);
    }
    if (r.do === 'minoff') return minOff(r, it);
    if (r.do === 'brief') {
      if (!H.AskUI) return toast('Locus could not open the ask bar here.', true);
      H.AskUI.ask(`For ${r.brand}: the main ad "${r.ad || ''}" in ad set "${r.adset || ''}" is tiring (${r.why_full || r.why}). Brief three iterations of it as an Asana brief: same angle, new hooks.`);
      state(r, 'done').then(() => drop(r.key, 'done')).catch(() => {});
      return;
    }
    if (r.do === 'launch') {
      const L = window.LaunchToMeta; if (!L) return toast('The Launch window did not load. Hard-refresh (Ctrl+Shift+R).', true);
      const onDone = () => { state(r, 'done').catch(() => {}); drop(r.key, 'done'); setTimeout(reload, 400); };
      if (!r.work && r.studio_ad) return L.open({ act: r.act_id, tok: H.S.tok, studioAd: r.studio_ad, onDone });
      if (!L.openBatch) return toast('The Launch window did not load. Hard-refresh (Ctrl+Shift+R).', true);
      return L.openBatch({ act: r.act_id, tok: H.S.tok, cardId: r.card_id, onDone, onBrief: () => pickAct(r.act_id, 'production') });
    }
  }
  /* Take the test minimum off: a dry run shows the minimum now and after, then the write with expect (stale = refused). */
  async function minOff(r, it) {
    const body = { act: r.act_id, kind: 'min_spend', level: 'adset', object: r.adset_id, min: 0, reason: `From the Buyer list: ${r.why_full || r.why}` };
    const m = modal(`Take the test minimum off "${r.name}"?`, `${esc(r.brand)}. Meta stops having to spend a set amount on it each day; the budget stays as it is.`, '<p class="faint" data-s>Checking with Meta…</p>', 'Take it off', async () => {
      if (!m.plan) throw new Error('Meta did not answer the check.');
      const w = await ah('/api/meta/write', { ...body, expect: m.plan });
      if (!w || w.error) throw new Error((w && w.error) || 'Meta did not answer.');
      await afterDo(r)();
      const W = window.LxMetaWrite;
      toast('Test minimum taken off.', false, w.write && W ? () => W.undo(H, [w], it, afterUndo(r)) : null);
    });
    m.yes.disabled = true;
    let dry; try { dry = await ah('/api/meta/write', { ...body, dry: true }); } catch (e) { dry = { error: e.message }; }
    const s = m.w.querySelector('[data-s]'); if (!s) return;
    if (!dry || dry.error) { s.className = 'v2bad'; s.textContent = (dry && dry.error) || 'Meta did not answer.'; return; }
    s.className = ''; s.innerHTML = (dry.step || []).map(x => `<span class="lx-ba"><span>${esc(x.from ?? 'none')}</span><i>→</i><b>${esc(x.to ?? 'none')}</b></span>`).join('') + (dry.detail ? ` <span class="faint">${esc(dry.detail)}</span>` : '');
    m.plan = dry.before && dry.before.daily_min_spend_target != null ? { daily_min_spend_target: dry.before.daily_min_spend_target } : {};
    m.yes.disabled = false;
  }
  function ownerModal() {
    const cur = DATA.owner;
    modal('Who owns the Buyer list?', 'Shown on this page and tagged on the daily Slack post.', `<label>Owner<select name="owner">${[...new Set([cur, ...OWNERS])].map(o => `<option${o === cur ? ' selected' : ''}>${esc(o)}</option>`).join('')}</select></label>`, 'Save', async w => {
      const v = w.querySelector('select').value;
      const j = await ah('/api/buyer-list/settings', { buyerOwner: v }, 'PUT');
      if (!j || j.error) throw new Error((j && j.error) || 'Locus did not answer.');
      DATA.owner = v; paint(); toast(`${v} owns the Buyer list.`);
    });
  }
  async function slackModal() {
    const s = DATA.settings || {};
    const m = modal('The daily Slack post', 'ONE post a day at the morning hour: the count, the money at stake, the owner, the top 5 and an Open in Locus button. While it is on, the brand morning cards carry no ad calls.',
      `<label class="row"><input type="checkbox" name="on"${s.buyerPost ? ' checked' : ''}> Post the Buyer list every morning</label>
       <label class="row"><input type="checkbox" name="ai"${s.buyerAI !== false ? ' checked' : ''}> Morning read first (one AI read per brand before the post, up to $5 a day)</label>
       <p class="v2hint" data-spend style="margin:-6px 0 12px"></p>
       <label>Slack channel id<input type="text" name="ch" value="${esc(s.buyerChannel || '')}" placeholder="C0C8UA53U3W" maxlength="20" autocomplete="off"><small>Default #daily-briefs (C0C8UA53U3W).</small></label>
       <div><small class="faint">What it would say now</small><pre class="by-pre" data-pre>Reading…</pre></div>`, 'Save', async w => {
        const ch = w.querySelector('[name="ch"]').value.trim();
        const j = await ah('/api/buyer-list/settings', { buyerPost: w.querySelector('[name="on"]').checked, buyerAI: w.querySelector('[name="ai"]').checked, buyerChannel: ch }, 'PUT');
        if (!j || j.error) throw new Error((j && j.error) || 'Locus did not answer.');
        DATA.settings = j.settings; toast('Saved.');
      });
    H.apiAH('/api/buyer-list/ai/spend').then(x => { const el = m.w.querySelector('[data-spend]'); if (el && x && !x.error) el.textContent = `Morning read cost today: $${(+x.today || 0).toFixed(2)} of $${x.cap}. This month: $${(+(x.month || {}).usd || 0).toFixed(2)}.`; }).catch(() => {});
    try { const p = await H.apiAH('/api/buyer-list/preview'); const pre = m.w.querySelector('[data-pre]'); if (pre) pre.textContent = p.error ? p.error : `${p.text}${p.last && p.last.done ? `\n\n(Today: ${p.last.done})` : ''}`; }
    catch (e) { const pre = m.w.querySelector('[data-pre]'); if (pre) pre.textContent = e.message; }
  }

  window.BuyerTab = { render };
})();

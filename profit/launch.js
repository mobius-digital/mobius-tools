/* Locus - Launch to Meta (2026-10-10). Closes the creative loop.
 *
 * An approved Studio ad (or a creator asset) goes to Meta from Locus, the way the team would do it by hand:
 *   1. the ad set: the test's own ad set is suggested (else the brand's testing ad set); the person can change it;
 *   2. the name: "<test> <letter> | <Format>" ("415 B | Still"), creator ads "<test> <letter> | @handle";
 *   3. primary text, headline and link prefilled from the brief, the ad and the ad set's own ads;
 *   4. a dry run shows the ad set before and after; then Create paused. It stays off until someone turns it on.
 * Then the ad is tied to its test in the test library, judged there as usual, and the learning is filed onto
 * the angle when the media buyer makes the call.
 *
 * Server: account-health src/launch.js (/api/launch/prep | preview | create | list), which makes the ad through
 * metawrite.js meta_create_ad (one Meta write path with Locus and Ads > Meta). Turning it on and undo use
 * the existing /api/meta/write (kind resume) and /api/meta/undo.
 *
 *   window.LaunchToMeta.open({ act, tok, studioAd | asset, onDone })   the Launch window
 *   window.LaunchToMeta.chip(studioAdId)                                 status chip HTML from the cache
 *   window.LaunchToMeta.watch(act, tok, repaint)                         load the brand's launches (2 min cache)
 * The test library rows (brand.js `.lb-row[data-b]`) get a status chip from here, without touching brand.js.
 */
(function () {
'use strict';

const AH_URL = (/^(localhost|127\.0\.0\.1)$/.test(location.hostname) && (() => { try { return localStorage.getItem('pf_ah'); } catch { return null; } })()) || 'https://mobius-account-health.mobius-digital.workers.dev';
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const CTAS = [['SHOP_NOW', 'Shop now'], ['LEARN_MORE', 'Learn more'], ['ORDER_NOW', 'Order now'], ['BUY_NOW', 'Buy now'], ['GET_OFFER', 'Get offer'], ['SIGN_UP', 'Sign up'], ['SUBSCRIBE', 'Subscribe'], ['CONTACT_US', 'Contact us'], ['SEE_MORE', 'See more'], ['NO_BUTTON', 'No button']];
const STALE = 120e3;
const L = { tok: '', acts: new Map(), all: null, allAt: 0, byAd: new Map(), byBatch: new Map(), loading: new Map() };

function ls(k) { try { return localStorage.getItem(k); } catch { return null; } }
const tok = () => L.tok || ls('mobius_session') || ls('pf_token') || '';
async function ah(path, opts = {}) {
  const res = await fetch(AH_URL + path, { ...opts, headers: { Authorization: 'Bearer ' + tok(), ...(opts.body ? { 'Content-Type': 'application/json' } : {}) } });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(j.error || ('HTTP ' + res.status));
  return j;
}
const postAH = (p, b) => ah(p, { method: 'POST', body: JSON.stringify(b) });

/* ---------------- the cache: launches by Studio ad and by test ---------------- */
function index(list) {
  for (const l of list || []) {
    if (l.studio_ad) { const a = L.byAd.get(l.studio_ad) || []; if (!a.some(x => x.id === l.id)) a.push(l); else a.splice(a.findIndex(x => x.id === l.id), 1, l); L.byAd.set(l.studio_ad, a); }
    if (l.batch_id) { const b = L.byBatch.get(l.batch_id) || []; if (!b.some(x => x.id === l.id)) b.push(l); else b.splice(b.findIndex(x => x.id === l.id), 1, l); L.byBatch.set(l.batch_id, b); }
  }
  for (const m of [L.byAd, L.byBatch]) for (const v of m.values()) v.sort((x, y) => String(y.at).localeCompare(String(x.at)));
}
async function load(act, { refresh = false, force = false } = {}) {
  const key = act || '*';
  const at = act ? L.acts.get(act) || 0 : L.allAt;
  if (!force && !refresh && Date.now() - at < STALE) return false;
  if (L.loading.has(key)) return L.loading.get(key);
  const p = ah(`/api/launch/list${act ? `?act=${encodeURIComponent(act)}${refresh ? '&refresh=1' : ''}` : ''}`)
    .then(r => { index(r.launches); if (act) L.acts.set(act, Date.now()); else L.allAt = Date.now(); return true; })
    .catch(() => { if (act) L.acts.set(act, Date.now()); else L.allAt = Date.now(); return false; })
    .finally(() => L.loading.delete(key));
  L.loading.set(key, p);
  return p;
}

/* ---------------- status, said plainly ---------------- */
function statusOf(l) {
  if (l.verdict) return { word: `Judged: ${l.verdict === 'winner' ? 'Winner' : l.verdict === 'loser' ? 'Loser' : 'Cancelled'}`, tone: l.verdict === 'winner' ? 'good' : l.verdict === 'loser' ? 'bad' : '', say: l.learning ? `Learning filed: ${l.learning}` : 'The media buyer made the call.' };
  const e = String(l.eff_status || l.status || '').toUpperCase();
  if (e === 'ACTIVE') return { word: 'Live on Meta', tone: 'good', say: 'Turned on and delivering.' };
  if (['PENDING_REVIEW', 'IN_PROCESS', 'PREAPPROVED'].includes(e)) return { word: 'In review at Meta', tone: '', say: 'Meta is still reviewing it.' };
  if (['DISAPPROVED', 'WITH_ISSUES'].includes(e)) return { word: e === 'DISAPPROVED' ? 'Rejected by Meta' : 'Has issues at Meta', tone: 'bad', say: 'Open it in Ads Manager to see why.' };
  if (['ARCHIVED', 'DELETED'].includes(e)) return { word: 'Taken down', tone: '', say: 'Archived or deleted in Meta.' };
  if (e === 'CAMPAIGN_PAUSED' || e === 'ADSET_PAUSED') return { word: 'On Meta, set is off', tone: 'warn', say: 'The ad is on, but its ad set or campaign is off.' };
  return { word: 'On Meta, paused', tone: 'warn', say: 'Made paused. Nobody has turned it on yet.' };
}
const chipFor = l => { const s = statusOf(l); return `<span class="v2pill ln-chip ${s.tone}" data-ln-open="${esc(l.id)}" role="button" tabindex="0" title="${esc(`${l.ad_name} in ${l.adset_name}. ${s.say} Click for details.`)}">${esc(s.word)}</span>`; };
const findLaunch = id => { for (const v of L.byAd.values()) { const l = v.find(x => x.id === id); if (l) return l; } for (const v of L.byBatch.values()) { const l = v.find(x => x.id === id); if (l) return l; } return null; };

/* ---------------- styles (tokens only, scoped to ln-) ---------------- */
function css() {
  if (document.getElementById('ln-css')) return;
  const st = document.createElement('style');
  st.id = 'ln-css';
  st.textContent = `
.ln-modal .modal{max-width:820px;width:calc(100vw - 32px);max-height:calc(100vh - 48px);overflow:auto}
.ln-modal h3{margin:0 0 4px;font-size:16px;font-weight:650;color:var(--ink)}
.ln-modal .ln-say{color:var(--muted);font-size:13px;line-height:1.5;margin:0 0 14px}
.ln-grid{display:grid;grid-template-columns:200px minmax(0,1fr);gap:18px}
@media (max-width:700px){.ln-grid{grid-template-columns:1fr}}
.ln-pic{width:100%;aspect-ratio:4/5;object-fit:cover;border-radius:var(--r-md,10px);border:1px solid var(--line);background:var(--surface-2)}
.ln-vid{display:flex;align-items:center;justify-content:center;aspect-ratio:4/5;border-radius:var(--r-md,10px);border:1px solid var(--line);background:var(--surface-2);color:var(--muted);font-size:12.5px;text-align:center;padding:10px}
.ln-f{display:block;font-size:12px;font-weight:600;color:var(--ink-2);margin:0 0 10px}
.ln-f small{display:block;font-weight:500;color:var(--muted);margin-top:3px;line-height:1.4}
.ln-in{display:block;width:100%;box-sizing:border-box;margin-top:5px;border:1px solid var(--line-strong);border-radius:var(--r-sm,8px);padding:8px 10px;font:inherit;font-size:13.5px;font-weight:500;color:var(--ink);background:var(--surface)}
.ln-in:focus{outline:none;border-color:var(--brand);box-shadow:0 0 0 3px var(--brand-soft)}
textarea.ln-in{min-height:64px;resize:vertical;line-height:1.45}
.ln-row2{display:grid;grid-template-columns:minmax(0,1fr) 160px;gap:10px}
@media (max-width:520px){.ln-row2{grid-template-columns:1fr}}
.ln-test{font-size:13px;color:var(--ink);margin:0 0 12px;line-height:1.45}
.ln-warn{margin:0 0 12px;padding:8px 10px;border-radius:var(--r-sm,8px);background:var(--warn-bg);color:var(--ink);font-size:12.5px;line-height:1.45}
.ln-warn p{margin:0}.ln-warn p+p{margin-top:4px}
.ln-ba{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin:4px 0 12px}
@media (max-width:520px){.ln-ba{grid-template-columns:1fr}}
.ln-ba > div{border:1px solid var(--line);border-radius:var(--r-md,10px);padding:10px 12px;background:var(--surface-2);font-size:12.5px;line-height:1.5;color:var(--ink-2);min-width:0}
.ln-ba b.cap{display:block;font-size:10.5px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:var(--muted);margin-bottom:4px}
.ln-ba .new{color:var(--ink);font-weight:600}
.ln-ba ul{margin:4px 0 0;padding-left:16px}
.ln-msg{font-size:12.5px;margin:10px 0 0;color:var(--muted)}
.ln-msg.bad{color:var(--bad)}.ln-msg.ok{color:var(--good)}
.ln-msg:empty{display:none}
.ln-foot{display:flex;justify-content:flex-end;gap:8px;margin-top:14px;flex-wrap:wrap}
.ln-foot a.btn{text-decoration:none;display:inline-flex;align-items:center}
.ln-chip{cursor:pointer}
.lb-res .ln-chip{margin-left:6px}
.ln-kv{display:grid;grid-template-columns:110px minmax(0,1fr);gap:4px 10px;font-size:13px;margin:0 0 12px}
.ln-kv dt{color:var(--muted)}.ln-kv dd{margin:0;color:var(--ink);overflow-wrap:anywhere}
`;
  document.head.appendChild(st);
}

/* ---------------- an in-app window ---------------- */
function sheet(inner) {
  css();
  const w = document.createElement('div');
  w.className = 'modal-wrap ln-modal';
  w.style.zIndex = 90;
  w.innerHTML = `<div class="modal" role="dialog" aria-modal="true">${inner}</div>`;
  document.body.appendChild(w);
  const close = () => { w.remove(); document.removeEventListener('keydown', k); };
  const k = e => { if (e.key === 'Escape' && w === [...document.querySelectorAll('.modal-wrap')].pop()) close(); };
  document.addEventListener('keydown', k);
  w.addEventListener('mousedown', e => { if (e.target === w) close(); });
  return { w, box: w.querySelector('.modal'), close };
}
const msg = (root, t, tone) => { const m = root.querySelector('[data-ln="msg"]'); if (m) { m.textContent = t || ''; m.className = 'ln-msg ' + (tone || ''); } };

/* ---------------- the Launch window ---------------- */
function open(o) {
  if (o.tok) L.tok = o.tok;
  const src = o.studioAd ? { studio_ad: o.studioAd } : { asset: o.asset };
  const { box, close } = sheet(`<h3>Launch to Meta</h3><p class="ln-say">Reading the brand's ad sets and the test. A few seconds.</p>`);
  const done = changed => { close(); if (changed && o.onDone) o.onDone(); };
  postAH('/api/launch/prep', { act: o.act, ...src }).then(p => form(p)).catch(e => {
    box.innerHTML = `<h3>Launch to Meta</h3><p class="ln-msg bad">${esc(e.message)}</p><div class="ln-foot"><button class="btn" data-ln="close">Close</button></div>`;
    box.querySelector('[data-ln="close"]').onclick = () => done(false);
  });

  function form(p) {
    if (p.error) throw new Error(p.error);
    const f = p.fields || {};
    const pic = p.source.image_url ? `<img class="ln-pic" src="${esc(p.source.image_url)}" alt="The ad">` : `<div class="ln-vid">Meta video ${esc(p.source.video_id)}${p.source.handle ? `<br>${esc(p.source.handle)}` : ''}</div>`;
    const test = p.test?.id ? `<p class="ln-test"><b>Test #${esc(p.test.num)}</b>: ${esc(p.test.title || '')}. The ad is tied to this test in the test library.</p>`
      : p.test?.num ? `<p class="ln-test"><b>Test #${esc(p.test.num)}</b>, not in the test library yet. The number in the name ties it once Asana syncs.</p>` : '';
    const opt = s => `<option value="${esc(s.id)}" ${s.id === p.suggested ? 'selected' : ''}>${esc(s.name)} · ${esc(s.status === 'ACTIVE' ? 'on' : 'off')}${s.campaign ? ` · ${esc(s.campaign)}` : ''}${s.id === p.suggested ? ' (suggested)' : ''}</option>`;
    box.innerHTML = `<h3>Launch to Meta</h3>
      <p class="ln-say">Made <b>paused</b>, so nothing spends until someone turns it on. Check it first: the dry run shows the ad set before and after.</p>
      ${test}
      ${(p.warnings || []).length ? `<div class="ln-warn">${p.warnings.map(w => `<p>${esc(w)}</p>`).join('')}</div>` : ''}
      <div class="ln-grid"><div>${pic}</div><div>
        <label class="ln-f">Ad set<select class="ln-in" data-f="adset">${(p.adsets || []).map(opt).join('')}</select><small data-ln="why">${esc(p.why || '')}</small></label>
        <label class="ln-f">Ad name<input class="ln-in" data-f="name" value="${esc(p.name)}"><small>Test number first, then the letter, then the format after the |. Locus ties results to the test by that number.</small></label>
        <label class="ln-f">Primary text<textarea class="ln-in" data-f="primary_text" rows="3" placeholder="The words above the ad">${esc(f.primary_text)}</textarea><small>From the brief's post copy, else the copy the ad set already runs.</small></label>
        <div class="ln-row2"><label class="ln-f">Headline<input class="ln-in" data-f="headline" value="${esc(f.headline)}"></label>
          <label class="ln-f">Button<select class="ln-in" data-f="cta">${CTAS.map(([k, l]) => `<option value="${k}" ${k === (f.cta || 'SHOP_NOW') ? 'selected' : ''}>${l}</option>`).join('')}</select></label></div>
        <label class="ln-f">Link<input class="ln-in" data-f="link" value="${esc(f.link)}" placeholder="https://"><small>The product page, not the homepage.</small></label>
        <label class="ln-f">Description <span style="font-weight:500;color:var(--muted)">(optional)</span><input class="ln-in" data-f="description" value="${esc(f.description)}"></label>
      </div></div>
      <div data-ln="dry"></div>
      <p class="ln-msg" data-ln="msg"></p>
      <div class="ln-foot"><button class="btn" data-ln="close">Cancel</button><button class="btn primary" data-ln="go" ${p.can === false ? 'disabled title="Locus can only read this ad account. See the note above."' : ''}>Check it (dry run)</button></div>`;
    const val = () => { const o2 = { act: o.act, ...src }; box.querySelectorAll('[data-f]').forEach(el => { o2[el.dataset.f] = el.value; }); return o2; };
    const go = box.querySelector('[data-ln="go"]');
    let checked = null;
    const reset = () => { if (!checked) return; checked = null; box.querySelector('[data-ln="dry"]').innerHTML = ''; go.textContent = 'Check it (dry run)'; msg(box, ''); };
    box.querySelectorAll('[data-f]').forEach(el => { el.addEventListener('input', reset); el.addEventListener('change', reset); });
    box.querySelector('[data-f="adset"]').addEventListener('change', e => { const w = box.querySelector('[data-ln="why"]'); w.textContent = e.target.value === p.suggested ? p.why : 'Your pick. The suggestion was the test’s own ad set or the testing campaign.'; });
    box.querySelector('[data-ln="close"]').onclick = () => done(false);
    go.onclick = async () => {
      go.disabled = true;
      const body = val();
      try {
        if (!checked) {
          msg(box, 'Checking with Meta. Nothing is written.');
          const r = await postAH('/api/launch/preview', body);
          if (r.error) throw new Error(r.error);
          checked = JSON.stringify(body);
          box.querySelector('[data-ln="dry"]').innerHTML = dry(r);
          go.textContent = 'Create paused';
          msg(box, 'Looks right? Create it. It stays paused until someone turns it on.', 'ok');
        } else {
          if (checked !== JSON.stringify(body)) { reset(); go.disabled = false; return; }
          msg(box, 'Making the ad in Meta.');
          const r = await postAH('/api/launch/create', body);
          if (r.error) throw new Error(r.error);
          index([{ ...r.launch, act: o.act, studio_ad: o.studioAd || null, source: o.studioAd ? 'studio' : 'creator', adset_name: r.launch.adset_name, ads_manager: r.ads_manager }]);
          made(r);
          return;
        }
      } catch (e) { msg(box, e.message, 'bad'); }
      go.disabled = false;
    };
  }
  function dry(r) {
    const list = n => n.length ? `<ul>${n.map(x => `<li>${esc(x)}</li>`).join('')}</ul>` : '<div>No ads yet.</div>';
    return `${(r.warnings || []).length ? `<div class="ln-warn">${r.warnings.map(w => `<p>${esc(w)}</p>`).join('')}</div>` : ''}
      <div class="ln-ba"><div><b class="cap">Before</b>"${esc(r.before.adset)}": ${r.before.ads} ad${r.before.ads === 1 ? '' : 's'}${list(r.before.names || [])}</div>
      <div><b class="cap">After</b>"${esc(r.after.adset)}": ${r.after.ads} ads<ul>${(r.before.names || []).map(x => `<li>${esc(x)}</li>`).join('')}<li class="new">${esc(r.after.ad_name)} (new, ${esc(r.after.status === 'PAUSED' ? 'paused' : r.after.status)})</li></ul>
      <div style="margin-top:6px">Headline: ${esc(r.after.headline || 'none')} · Button: ${esc((CTAS.find(c => c[0] === r.after.cta) || [0, r.after.cta])[1])}<br>Link: ${esc(r.after.link)}</div></div></div>`;
  }
  function made(r) {
    const l = r.launch;
    box.innerHTML = `<h3>Made in Meta, paused</h3>
      <p class="ln-say">"${esc(l.ad_name)}" is in "${esc(l.adset_name)}". It spends nothing until someone turns it on.${l.batch_id ? ` It is tied to test #${esc(l.num)} in the test library; when the media buyer makes the call there, the learning is filed onto the angle.` : ''}</p>
      <p class="ln-msg" data-ln="msg"></p>
      <div class="ln-foot"><a class="btn" href="${esc(r.ads_manager)}" target="_blank" rel="noopener">Open in Ads Manager</a>
        ${l.write ? '<button class="btn" data-ln="undo">Undo</button>' : ''}<button class="btn" data-ln="on">Turn it on now</button><button class="btn primary" data-ln="close">Done</button></div>`;
    wireAfter(box, { act: o.act, ...l }, () => done(true));
  }
}

/* Turn on (the existing resume write, dry first) and Undo (the existing undo), from the result or the status window. */
function wireAfter(box, l, finish) {
  const on = box.querySelector('[data-ln="on"]'), undo = box.querySelector('[data-ln="undo"]');
  box.querySelector('[data-ln="close"]').onclick = finish;
  if (on) on.onclick = async () => {
    on.disabled = true;
    try {
      if (!on.dataset.ok) {
        const d = await postAH('/api/meta/write', { act: l.act, kind: 'resume', level: 'ad', object: l.ad_id, reason: `Approved in Locus after Launch to Meta${l.num ? ` (test ${l.num})` : ''}`, dry: true });
        if (d.error) throw new Error(d.error);
        on.dataset.ok = JSON.stringify(d.before || {});
        on.textContent = 'Yes, turn it on';
        msg(box, `${d.summary}. This starts spending. Press again to confirm.`, '');
      } else {
        const r = await postAH('/api/meta/write', { act: l.act, kind: 'resume', level: 'ad', object: l.ad_id, reason: `Approved in Locus after Launch to Meta${l.num ? ` (test ${l.num})` : ''}`, expect: JSON.parse(on.dataset.ok) });
        if (r.error) throw new Error(r.error);
        index([{ ...l, status: 'ACTIVE', eff_status: 'ACTIVE' }]);
        msg(box, 'Turned on. Logged in the Change Log as you.', 'ok'); on.remove(); return;
      }
    } catch (e) { msg(box, e.message, 'bad'); }
    on.disabled = false;
  };
  if (undo) undo.onclick = async () => {
    undo.disabled = true;
    try {
      const r = await postAH('/api/meta/undo', { act: l.act, write: l.write });
      if (r.error) throw new Error(r.error);
      index([{ ...l, status: 'ARCHIVED', eff_status: 'ARCHIVED' }]);
      msg(box, 'Undone: the ad is archived in Meta.', 'ok'); undo.remove(); on?.remove(); return;
    } catch (e) { msg(box, e.message, 'bad'); }
    undo.disabled = false;
  };
}

/* ---------------- the status window (click a chip) ---------------- */
function status(id, onDone) {
  const l = findLaunch(id); if (!l) return;
  const { box, close } = sheet('');
  const paint = () => {
    const cur = findLaunch(id) || l, st = statusOf(cur);
    box.innerHTML = `<h3>${esc(cur.ad_name)}</h3><p class="ln-say">${esc(st.say)}</p>
      <dl class="ln-kv"><dt>Status</dt><dd><span class="v2pill ${st.tone}">${esc(st.word)}</span>${cur.checked_at ? ` <span style="color:var(--muted);font-size:12px">checked ${esc(String(cur.checked_at).slice(0, 16).replace('T', ' '))} UTC</span>` : ''}</dd>
        <dt>Ad set</dt><dd>${esc(cur.adset_name)}</dd><dt>Test</dt><dd>${cur.num ? `#${esc(cur.num)}` : 'none'}</dd>
        <dt>Launched</dt><dd>${esc(String(cur.at).slice(0, 10))}${cur.by ? ` by ${esc(cur.by)}` : ''}</dd>${cur.learning ? `<dt>Learning</dt><dd>${esc(cur.learning)}</dd>` : ''}</dl>
      <p class="ln-msg" data-ln="msg"></p>
      <div class="ln-foot">${cur.ads_manager ? `<a class="btn" href="${esc(cur.ads_manager)}" target="_blank" rel="noopener">Open in Ads Manager</a>` : ''}<button class="btn" data-ln="check">Check status now</button>
        ${String(cur.eff_status || cur.status || '').toUpperCase() === 'PAUSED' && !cur.verdict ? '<button class="btn" data-ln="on">Turn it on</button>' : ''}<button class="btn primary" data-ln="close">Close</button></div>`;
    wireAfter(box, cur, () => { close(); onDone && onDone(); });
    box.querySelector('[data-ln="check"]').onclick = async e => { e.target.disabled = true; await load(cur.act, { refresh: true }); paint(); onDone && onDone(); };
  };
  paint();
}
document.addEventListener('click', e => {
  const c = e.target.closest?.('[data-ln-open]');
  if (!c) return;
  e.preventDefault(); e.stopPropagation();
  status(c.dataset.lnOpen, () => decorate(true));
}, true);

/* ---------------- the test library rows (brand.js, untouched): a chip per launched ad ---------------- */
let deco = 0;
function decorate(again = false) {
  const rows = document.querySelectorAll('.lb-row[data-b]');
  if (!rows.length) return;
  if (Date.now() - L.allAt > STALE) { load(null).then(ok => ok && decorate(true)); }
  rows.forEach(r => {
    if (r.dataset.ln && !again) return;
    r.dataset.ln = '1';
    r.querySelectorAll('.ln-chip').forEach(x => x.remove());
    const list = L.byBatch.get(r.dataset.b);
    if (!list?.length) return;
    const res = r.querySelector('.lb-res') || r;
    const live = list.filter(l => !['ARCHIVED', 'DELETED'].includes(String(l.eff_status || '').toUpperCase()));
    res.insertAdjacentHTML('beforeend', chipFor(live[0] || list[0]) + (live.length > 1 ? `<span class="v2pill ln-chip" data-ln-open="${esc(live[1].id)}" title="${esc(live.length + ' ads launched from Locus for this test')}">+${live.length - 1}</span>` : ''));
  });
}
new MutationObserver(() => { clearTimeout(deco); deco = setTimeout(() => decorate(), 120); }).observe(document.documentElement, { childList: true, subtree: true });
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => decorate()); else setTimeout(() => decorate(), 0);

window.LaunchToMeta = {
  open,
  /* The status chip for one Studio ad (its newest launch), or '' when it was never launched. */
  chip: studioAdId => { const l = (L.byAd.get(studioAdId) || [])[0]; return l ? chipFor(l) : ''; },
  launched: studioAdId => (L.byAd.get(studioAdId) || []).length,
  /* Studio calls this on every paint: loads the brand's launches with live status (2 min cache), then repaints once. */
  watch: (act, t, repaint) => { if (t) L.tok = t; if (!act || act === 'all') return; load(act, { refresh: !L.acts.has(act) || Date.now() - (L.acts.get(act) || 0) > STALE }).then(ch => { if (ch && repaint) repaint(); }); },
  load,
};
})();

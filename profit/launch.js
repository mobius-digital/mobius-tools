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
 *   window.LaunchToMeta.open({ act, tok, studioAd | asset | workFile, onDone })   the Launch window, one ad
 *   window.LaunchToMeta.openBatch({ act, tok, cardId, onDone, onBrief, queue, step, total })  every approved ad of a Production card (2026-10-14):
 *       queue = [{cardId, act, num, title}] more cards to launch after this one (the board's bulk Launch, 2026-10-15):
 *       one window per card in turn, each test picks its own ad set; Done reads "Next card" while the queue holds any.
 *       one ad set, the brief's copy (shared lines, or the lines under an ad's own heading), names "5-2 | Still",
 *       Check it (a dry run per ad), Create N paused. An ad whose brief has no headline or primary text cannot be
 *       picked until the brief has it (nothing is typed here); onBrief opens the brief.
 *   window.LaunchToMeta.openCarousel({ act, tok, batchId, order, onDone })  a Studio carousel batch as ONE carousel ad (2026-10-21)
 *   window.LaunchToMeta.chip(studioAdId)                               status chip HTML from the cache
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
    /* a carousel launch (2026-10-21) is one ad made of several Studio ads: each card counts as launched */
    for (const c of Array.isArray(l.cards) ? l.cards : []) if (c !== l.studio_ad) { const a = (L.byAd.get(c) || []).filter(x => x.id !== l.id); a.push(l); L.byAd.set(c, a); }
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
.ln-where{display:grid;grid-template-columns:minmax(0,1fr) 170px;gap:12px;margin:0 0 6px}
@media (max-width:560px){.ln-where{grid-template-columns:1fr}}
.lnb-head{display:flex;align-items:center;gap:10px;margin:10px 0 0;padding:8px 0;border-bottom:1px solid var(--line);font-size:12px;font-weight:600;color:var(--ink-2)}
.lnb-head .n{color:var(--muted);font-weight:500}
.lnb-row{display:grid;grid-template-columns:22px 64px minmax(0,1fr);gap:12px;padding:12px 0;border-bottom:1px solid var(--line);align-items:start}
.lnb-row.off{opacity:.55}
.lnb-row.short{opacity:1}
.lnb-tick{margin:2px 0 0;width:16px;height:16px;accent-color:var(--brand)}
.lnb-pic{width:64px;aspect-ratio:4/5;object-fit:cover;border-radius:var(--r-sm,8px);border:1px solid var(--line);background:var(--surface-2);display:block}
.lnb-car{display:flex;gap:4px;max-width:180px;overflow-x:auto;scrollbar-width:thin}
.lnb-car span{position:relative;flex:0 0 auto}
.lnb-car img,.lnb-car i{width:40px;aspect-ratio:4/5;object-fit:cover;border-radius:4px;border:1px solid var(--line);background:var(--surface-2);display:block}
.lnb-car b{position:absolute;left:3px;bottom:3px;font-size:10px;line-height:1;padding:2px 4px;border-radius:3px;background:rgba(0,0,0,.6);color:#fff;font-weight:600}
.lnb-cards{margin:3px 0 0;padding:6px 8px 6px 26px;border:1px dashed var(--line-strong);border-radius:var(--r-sm,8px);font-size:13px;font-weight:500;color:var(--ink);background:var(--surface-2);line-height:1.5}
.lnb-cards .none{color:var(--bad)}
.lnb-vid{width:64px;aspect-ratio:4/5;border-radius:var(--r-sm,8px);border:1px solid var(--line);background:var(--surface-2);display:flex;align-items:center;justify-content:center;color:var(--muted);font-size:11px}
.lnb-top{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin:0 0 6px;font-size:13px;color:var(--ink)}
.lnb-top b{font-weight:650}
.lnb-top .lnb-step{font-size:12px;font-weight:500;color:var(--muted);margin-left:8px}
.lnb-done{font-size:11.5px;color:var(--muted)}
.lnb-top .lnb-done a{color:inherit}
.lnb-g{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:8px 12px}
@media (max-width:640px){.lnb-g{grid-template-columns:1fr}}
.lnb-f{display:block;font-size:11.5px;font-weight:600;color:var(--ink-2);min-width:0}
.lnb-f .ln-in{margin-top:3px;padding:6px 8px;font-size:13px}
.lnb-f.wide{grid-column:1 / -1}
.lnb-ro{display:block;margin-top:3px;padding:6px 8px;border:1px dashed var(--line-strong);border-radius:var(--r-sm,8px);font-size:13px;font-weight:500;color:var(--ink);background:var(--surface-2);white-space:pre-line;line-height:1.4;max-height:96px;overflow:auto}
.lnb-ro.none{color:var(--bad);border-color:var(--bad);font-weight:500}
.lnb-tag{display:inline-block;margin:3px 0 0;font-size:11px;font-weight:500;color:var(--muted)}
.lnb-tag.bad{color:var(--bad)}
.lnb-tag button{all:unset;cursor:pointer;color:var(--brand);font-weight:600;margin-left:6px}
.lnb-tag button:hover{text-decoration:underline}
.lnb-res{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:6px 12px;align-items:center;padding:8px 0;border-bottom:1px solid var(--line);font-size:13px}
.lnb-res .ok{color:var(--good);font-weight:600}.lnb-res .bad{color:var(--bad)}
.lnb-res .acts{display:flex;gap:6px;flex-wrap:wrap}
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
  const src = o.studioAd ? { studio_ad: o.studioAd } : o.workFile ? { work_file: o.workFile } : { asset: o.asset };   // workFile: a finished ad from Production (2026-10-14)
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

/* ---------------- the batch window: every approved ad of a Production card (2026-10-14) ---------------- */
const SRC_TAG = { shared: 'from the brief', ad: "this ad's own line in the brief", set: 'from the ad set', none: 'Write it in the brief' };
const MISSING_SAY = { headline: 'No headline in the brief', primary_text: 'No primary text in the brief', cards: 'A carousel needs 2 to 10 cards', video: 'A carousel takes pictures, not video' };
function openBatch(o) {
  if (o.tok) L.tok = o.tok;
  const { box, close } = sheet(`<h3>Launch to Meta</h3><p class="ln-say">Reading the card, the brief and the brand's ad sets. A few seconds.</p>`);
  const queue = Array.isArray(o.queue) ? o.queue : [];
  const stepNote = o.total > 1 ? ` <span class="lnb-step">Card ${o.step || 1} of ${o.total}</span>` : '';
  const nextCard = () => { const q = queue[0]; openBatch({ ...o, act: q.act || o.act, cardId: q.cardId, queue: queue.slice(1), step: (o.step || 1) + 1, onBrief: null }); };
  const done = changed => { close(); if (queue.length) { nextCard(); return; } if ((changed || o.changed) && o.onDone) o.onDone(); };
  const fail = e => {
    box.innerHTML = `<h3>Launch to Meta${stepNote}</h3><p class="ln-msg bad">${esc(e.message)}</p><div class="ln-foot"><button class="btn" data-ln="close">${queue.length ? 'Skip to the next card' : 'Close'}</button></div>`;
    box.querySelector('[data-ln="close"]').onclick = () => done(false);
  };
  let P = null, picked = new Set(), checked = null, made = false;
  const prep = adset => postAH('/api/launch/batch-prep', { act: o.act, card_id: o.cardId, ...(adset ? { adset } : {}) });
  prep().then(p => { if (p.error) throw new Error(p.error); P = p; picked = new Set(p.ads.filter(a => !a.missing.length).map(a => a.file_id)); form(); }).catch(fail);

  const n = () => picked.size;
  const title = () => `Launch ${n()} to Meta`;
  function rowHtml(a, i) {
    const short = a.missing.length > 0, on = picked.has(a.file_id);
    /* a Carousel card's ad = its cards in swipe order, one Meta carousel (2026-10-21) */
    const pic = a.carousel ? `<div class="lnb-car" title="${a.cards.length} cards, in swipe order">${a.cards.map(c => `<span>${c.thumb ? `<img src="${esc(c.thumb)}" alt="Card ${c.k}" loading="lazy">` : '<i></i>'}<b>${c.k}</b></span>`).join('')}</div>`
      : a.video ? `<div class="lnb-vid">Video</div>` : `<img class="lnb-pic" src="${esc(a.thumb)}" alt="" loading="lazy">`;
    const why = a.missing.map(k => MISSING_SAY[k]).filter(Boolean).join('; ');
    const donePill = a.launched.length ? `<span class="lnb-done">Already in Meta: ${a.launched.map(l => l.ads_manager ? `<a href="${esc(l.ads_manager)}" target="_blank" rel="noopener">${esc(l.ad_name)}</a>` : esc(l.ad_name)).join(', ')} (${esc(a.launched[0].adset_name)})</span>` : '';
    const tag = (f, k) => `<span class="lnb-tag${f.source === 'none' ? ' bad' : ''}">${esc(SRC_TAG[f.source] || '')}${f.source === 'none' && o.onBrief ? '<button type="button" data-brief>Open the brief</button>' : ''}${k === 'link' && f.value && P.ads.length > 1 ? `<button type="button" data-linkall="${esc(a.file_id)}">Use this link for all</button>` : ''}</span>`;
    const ro = (f, cls = '') => `<span class="lnb-ro${f.value ? '' : ' none'}${cls}">${esc(f.value || 'Not in the brief yet')}</span>`;
    return `<div class="lnb-row${on ? '' : ' off'}${short ? ' short' : ''}" data-row="${esc(a.file_id)}">
      <input type="checkbox" class="lnb-tick" data-pick="${esc(a.file_id)}" ${on ? 'checked' : ''} ${short ? `disabled title="${esc(why)}"` : ''} aria-label="Launch ${esc(a.ad ? 'ad ' + a.ad : 'this ad')}">
      <div>${pic}</div>
      <div style="min-width:0">
        <div class="lnb-top"><b>${esc(a.ad ? `Ad ${a.ad}` : 'The ad')}</b><span style="color:var(--muted);font-size:12px">${a.carousel ? `${a.cards.length} cards · one carousel ad` : `v${esc(a.version)} · ${esc(a.format)}`}</span>${donePill}</div>
        <div class="lnb-g">
          <label class="lnb-f">Name in Meta<input class="ln-in" data-name="${esc(a.file_id)}" value="${esc(a.name)}"></label>
          <label class="lnb-f">Link<input class="ln-in" data-link="${esc(a.file_id)}" value="${esc(a.link.value)}" placeholder="https://" ${short ? 'disabled' : ''}>${tag(a.link, 'link')}</label>
          ${a.carousel ? `<div class="lnb-f">Card headlines<ol class="lnb-cards">${a.cards.map(c => `<li${c.headline ? '' : ' class="none"'}>${esc(c.headline || 'No headline: name the file "card k of n <headline>" or write a Headline in the brief')}</li>`).join('')}</ol><span class="lnb-tag">From each card's file name, else the brief's Headline</span></div>` : `<div class="lnb-f">Headline${ro(a.headline)}${tag(a.headline)}</div>`}
          ${short && a.missing.some(k => k === 'cards' || k === 'video') ? `<div class="lnb-f" style="color:var(--bad)">${esc(why)}</div>` : ''}
          <div class="lnb-f">Primary text${ro(a.primary_text)}${tag(a.primary_text)}</div>
        </div>
      </div></div>`;
  }
  function form() {
    const p = P;
    const opt = s => `<option value="${esc(s.id)}" ${s.id === p.suggested ? 'selected' : ''}>${esc(s.name)} · ${esc(s.status === 'ACTIVE' ? 'on' : 'off')}${s.campaign ? ` · ${esc(s.campaign)}` : ''}${s.id === p.suggested ? ' (suggested)' : ''}</option>`;
    const test = p.test ? `<p class="ln-test"><b>Test #${esc(p.test.num)}</b>${p.test.title ? `: ${esc(p.test.title)}` : ''}. Every ad is tied to this test in the test library by its name.</p>` : '';
    box.innerHTML = `<h3 data-ln="title">${esc(title())}${stepNote}</h3>
      <p class="ln-say">Every ad goes into ONE ad set, made <b>paused</b>, so nothing spends until someone turns it on. The words come from the brief: a Headline, Primary text or Landing page line written once is shared; the same line under an ad's own heading is that ad's. Check it first: the dry run shows the ad set before and after.</p>
      ${p.carousel ? '<p class="ln-say">This card is a <b>carousel</b>: its cards go out as ONE Meta ad, in swipe order (Meta is told not to reorder them).</p>' : ''}
      ${test}
      ${(p.warnings || []).length ? `<div class="ln-warn">${p.warnings.map(w => `<p>${esc(w)}</p>`).join('')}</div>` : ''}
      <div class="ln-where">
        <label class="ln-f">Ad set<select class="ln-in" data-f="adset">${(p.adsets || []).map(opt).join('')}</select><small data-ln="why">${esc(p.why || '')}</small></label>
        <label class="ln-f">Button<select class="ln-in" data-f="cta">${CTAS.map(([k, l]) => `<option value="${k}" ${k === (p.cta || 'SHOP_NOW') ? 'selected' : ''}>${l}</option>`).join('')}</select><small>Same button on every ad.</small></label>
      </div>
      <div class="lnb-head">The ads <span class="n" data-ln="count">${n()} of ${p.ads.length} picked</span><span style="flex:1"></span>${p.ads.length > 1 ? '<button type="button" class="btn sm" data-ln="all">Pick all</button><button type="button" class="btn sm" data-ln="none">Pick none</button>' : ''}</div>
      <div data-ln="rows">${p.ads.map(rowHtml).join('')}</div>
      <div data-ln="dry"></div>
      <p class="ln-msg" data-ln="msg"></p>
      <div class="ln-foot"><button class="btn" data-ln="close">Cancel</button><button class="btn primary" data-ln="go" ${p.can === false ? 'disabled title="Locus can only read this ad account. See the note above."' : ''}>Check ${n()} (dry run)</button></div>`;
    const go = box.querySelector('[data-ln="go"]');
    const sync = () => {
      box.querySelector('[data-ln="title"]').textContent = title();
      box.querySelector('[data-ln="count"]').textContent = `${n()} of ${p.ads.length} picked`;
      go.textContent = checked ? `Create ${n()} paused` : `Check ${n()} (dry run)`;
      go.disabled = p.can === false || n() === 0;
      box.querySelectorAll('[data-row]').forEach(r => r.classList.toggle('off', !picked.has(r.dataset.row)));
    };
    const val = () => ({ act: o.act, card_id: o.cardId, adset: box.querySelector('[data-f="adset"]').value, cta: box.querySelector('[data-f="cta"]').value,
      ads: p.ads.filter(a => picked.has(a.file_id)).map(a => ({ file_id: a.file_id, name: box.querySelector(`[data-name="${a.file_id}"]`).value, link: box.querySelector(`[data-link="${a.file_id}"]`).value })) });
    const reset = () => { if (!checked) return; checked = null; box.querySelector('[data-ln="dry"]').innerHTML = ''; msg(box, ''); sync(); };
    box.querySelectorAll('[data-pick]').forEach(t => t.addEventListener('change', e => { if (e.target.checked) picked.add(e.target.dataset.pick); else picked.delete(e.target.dataset.pick); reset(); sync(); }));
    box.querySelectorAll('[data-name],[data-link]').forEach(el => el.addEventListener('input', reset));
    box.querySelector('[data-f="cta"]').addEventListener('change', reset);
    box.querySelector('[data-f="adset"]').addEventListener('change', async e => {
      const w = box.querySelector('[data-ln="why"]'); w.textContent = e.target.value === p.suggested ? p.why : 'Your pick. Reading the links this ad set already uses.';
      reset();
      /* a link that came from the ad set follows the ad set; typed links and the brief's own stay */
      try {
        const q = await prep(e.target.value);
        if (q.error) throw new Error(q.error);
        for (const a of q.ads) {
          const old = p.ads.find(x => x.file_id === a.file_id); if (!old) continue;
          const inp = box.querySelector(`[data-link="${a.file_id}"]`);
          if (inp && (old.link.source === 'set' || old.link.source === 'none') && inp.value === old.link.value) { inp.value = a.link.value; }
          old.link = a.link;
        }
        if (e.target.value !== p.suggested) w.textContent = 'Your pick.';
      } catch (err) { msg(box, err.message, 'bad'); }
    });
    const all = box.querySelector('[data-ln="all"]'), none = box.querySelector('[data-ln="none"]');
    if (all) all.onclick = () => { p.ads.filter(a => !a.missing.length).forEach(a => picked.add(a.file_id)); box.querySelectorAll('[data-pick]:not(:disabled)').forEach(t => { t.checked = true; }); reset(); sync(); };
    if (none) none.onclick = () => { picked.clear(); box.querySelectorAll('[data-pick]').forEach(t => { t.checked = false; }); reset(); sync(); };
    box.querySelectorAll('[data-brief]').forEach(b => b.onclick = () => { done(false); o.onBrief && o.onBrief(); });
    box.querySelectorAll('[data-linkall]').forEach(b => b.onclick = () => { const v = box.querySelector(`[data-link="${b.dataset.linkall}"]`).value; box.querySelectorAll('[data-link]').forEach(i => { if (!i.disabled) i.value = v; }); reset(); });
    box.querySelector('[data-ln="close"]').onclick = () => done(made);
    go.onclick = async () => {
      go.disabled = true;
      const body = val();
      try {
        if (!checked) {
          msg(box, `Checking ${body.ads.length} ad${body.ads.length === 1 ? '' : 's'} with Meta. Nothing is written.`);
          const r = await postAH('/api/launch/batch-preview', body);
          if (r.error) throw new Error(r.error);
          checked = JSON.stringify(body);
          box.querySelector('[data-ln="dry"]').innerHTML = dryBatch(r);
          const bad = r.rows.filter(x => !x.ok);
          msg(box, bad.length ? `${bad.length} ad${bad.length === 1 ? ' would' : 's would'} fail (see above). Fix ${bad.length === 1 ? 'it' : 'them'} or leave ${bad.length === 1 ? 'it' : 'them'} out.` : 'Looks right? Create them. They stay paused until someone turns them on.', bad.length ? 'bad' : 'ok');
          sync(); go.disabled = p.can === false || !r.rows.some(x => x.ok);
          return;
        }
        if (checked !== JSON.stringify(body)) { reset(); return; }
        msg(box, `Making ${body.ads.length} ad${body.ads.length === 1 ? '' : 's'} in Meta, one after the other.`);
        const r = await postAH('/api/launch/batch-create', body);
        if (r.error) throw new Error(r.error);
        index(r.rows.filter(x => x.ok).map(x => ({ ...x.launch, act: o.act, studio_ad: null, source: 'asset', ads_manager: x.ads_manager })));
        made = r.made > 0;
        madeBatch(r);
      } catch (e) { msg(box, e.message, 'bad'); go.disabled = false; }
    };
    sync();
  }
  function dryBatch(r) {
    const list = names => names.length ? `<ul>${names.map(x => `<li>${esc(x)}</li>`).join('')}</ul>` : '<div>No ads yet.</div>';
    const rows = r.rows.map(x => x.ok ? `<li class="new">${esc(x.name)} (new${x.carousel ? ` carousel, ${x.cards.length} cards` : ''}, paused)${x.carousel ? `<ol style="margin:4px 0 0;padding-left:18px">${x.cards.map(c => `<li>${esc(c.headline || '(no headline)')}</li>`).join('')}</ol>` : ''}</li>` : `<li style="color:var(--bad)">${esc(x.name || x.ad)}: ${esc(x.error)}</li>`).join('');
    return `${(r.warnings || []).length ? `<div class="ln-warn">${r.warnings.map(w => `<p>${esc(w)}</p>`).join('')}</div>` : ''}
      <div class="ln-ba"><div><b class="cap">Before</b>"${esc(r.before.adset)}": ${r.before.ads} ad${r.before.ads === 1 ? '' : 's'}${list(r.before.names || [])}</div>
      <div><b class="cap">After</b>"${esc(r.after.adset)}": ${r.after.ads} ads<ul>${(r.before.names || []).map(x => `<li>${esc(x)}</li>`).join('')}${rows}</ul>
      ${r.rows.filter(x => x.ok).slice(0, 1).map(x => `<div style="margin-top:6px">Button: ${esc((CTAS.find(c => c[0] === x.cta) || [0, x.cta])[1])}</div>`).join('')}</div></div>`;
  }
  function madeBatch(r) {
    const ok = r.rows.filter(x => x.ok), bad = r.rows.filter(x => !x.ok);
    box.innerHTML = `<h3>${ok.length ? `Made ${ok.length} in Meta, paused` : 'Nothing was made'}</h3>
      <p class="ln-say">${ok.length ? `${ok.length === 1 ? 'It is' : 'They are'} in "${esc(r.adset)}" and spend nothing until someone turns ${ok.length === 1 ? 'it' : 'them'} on.` : ''}${bad.length ? ` ${bad.length} ${bad.length === 1 ? 'was' : 'were'} not made; the reason is beside each.` : ''}</p>
      <div>${r.rows.map(x => `<div class="lnb-res" data-res="${esc(x.file_id)}"><div>${x.ok ? `<span class="ok">Made</span> ${esc(x.name)}` : `<span class="bad">Not made</span> ${esc(x.name || x.ad)}: ${esc(x.error)}`}</div>
        <div class="acts">${x.ok && x.ads_manager ? `<a class="btn sm" href="${esc(x.ads_manager)}" target="_blank" rel="noopener">Ads Manager</a>` : ''}${x.ok && x.launch.write ? `<button class="btn sm" data-undo="${esc(x.file_id)}">Undo</button>` : ''}</div></div>`).join('')}</div>
      <p class="ln-msg" data-ln="msg"></p>
      <div class="ln-foot"><button class="btn primary" data-ln="close">${queue.length ? `Next card (${(o.step || 1) + 1} of ${o.total})` : 'Done'}</button></div>`;
    if (made) o.changed = true;
    box.querySelector('[data-ln="close"]').onclick = () => done(made);
    box.querySelectorAll('[data-undo]').forEach(b => b.onclick = async () => {
      const x = ok.find(y => y.file_id === b.dataset.undo); if (!x) return;
      b.disabled = true;
      try {
        const u = await postAH('/api/meta/undo', { act: o.act, write: x.launch.write });
        if (u.error) throw new Error(u.error);
        index([{ ...x.launch, act: o.act, source: 'asset', status: 'ARCHIVED', eff_status: 'ARCHIVED' }]);
        b.closest('[data-res]').querySelector('.ok').textContent = 'Undone'; b.remove();
        msg(box, `"${x.name}" is archived in Meta.`, 'ok');
      } catch (e) { msg(box, e.message, 'bad'); b.disabled = false; }
    });
  }
}

/* ---------------- the carousel window: a Studio carousel batch = ONE Meta carousel ad (2026-10-21) ----------------
   The cards come in the order set on Studio's Approve step. Ad set, name ("420 A | Carousel"), primary text, button and
   the ad's link once; each card its headline (shown under the card) and, only when it differs, its own link. The same
   dry run then Create paused as one ad, then Ads Manager / Undo / Turn it on. */
function openCarousel(o) {
  if (o.tok) L.tok = o.tok;
  const { box, close } = sheet(`<h3>Launch the carousel to Meta</h3><p class="ln-say">Reading the cards, the brand's ad sets and the test. A few seconds.</p>`);
  const done = changed => { close(); if (changed && o.onDone) o.onDone(); };
  const base = { act: o.act, studio_batch: o.batchId, order: o.order || [] };
  postAH('/api/launch/carousel-prep', base).then(p => { if (p.error) throw new Error(p.error); form(p); }).catch(e => {
    box.innerHTML = `<h3>Launch the carousel to Meta</h3><p class="ln-msg bad">${esc(e.message)}</p><div class="ln-foot"><button class="btn" data-ln="close">Close</button></div>`;
    box.querySelector('[data-ln="close"]').onclick = () => done(false);
  });

  function form(p) {
    const f = p.fields || {};
    const test = p.test?.id ? `<p class="ln-test"><b>Test #${esc(p.test.num)}</b>: ${esc(p.test.title || '')}. The carousel is tied to this test in the test library.</p>`
      : p.test?.num ? `<p class="ln-test"><b>Test #${esc(p.test.num)}</b>, not in the test library yet. The number in the name ties it once Asana syncs.</p>` : '';
    const opt = s => `<option value="${esc(s.id)}" ${s.id === p.suggested ? 'selected' : ''}>${esc(s.name)} · ${esc(s.status === 'ACTIVE' ? 'on' : 'off')}${s.campaign ? ` · ${esc(s.campaign)}` : ''}${s.id === p.suggested ? ' (suggested)' : ''}</option>`;
    const card = (c, i) => `<div class="lnb-row" data-card="${esc(c.studio_ad)}" style="grid-template-columns:28px 64px minmax(0,1fr)">
      <b style="font-size:13px;color:var(--muted);padding-top:2px">${i + 1}</b><div><img class="lnb-pic" src="${esc(c.image_url)}" alt="Card ${i + 1}" loading="lazy"></div>
      <div class="lnb-g"><label class="lnb-f">Card headline<input class="ln-in" data-ch="${esc(c.studio_ad)}" value="${esc(c.headline)}" maxlength="255" placeholder="Shown under the card"></label>
        <label class="lnb-f">Link <span style="font-weight:500;color:var(--muted)">(only if not the ad's)</span><input class="ln-in" data-cl="${esc(c.studio_ad)}" value="${esc(c.link || '')}" placeholder="Same as the ad's link"></label></div></div>`;
    box.innerHTML = `<h3>Launch the carousel to Meta</h3>
      <p class="ln-say">ONE ad with ${p.cards.length} cards, shown in this order (Meta is told not to reorder them). Made <b>paused</b>, so nothing spends until someone turns it on. Check it first: the dry run shows the ad set before and after.</p>
      ${test}
      ${(p.warnings || []).length ? `<div class="ln-warn">${p.warnings.map(w => `<p>${esc(w)}</p>`).join('')}</div>` : ''}
      <div class="ln-where">
        <label class="ln-f">Ad set<select class="ln-in" data-f="adset">${(p.adsets || []).map(opt).join('')}</select><small data-ln="why">${esc(p.why || '')}</small></label>
        <label class="ln-f">Button<select class="ln-in" data-f="cta">${CTAS.filter(([k]) => k !== 'NO_BUTTON').map(([k, l]) => `<option value="${k}" ${k === (f.cta || 'SHOP_NOW') ? 'selected' : ''}>${l}</option>`).join('')}</select><small>On every card.</small></label>
      </div>
      <label class="ln-f">Ad name<input class="ln-in" data-f="name" value="${esc(p.name)}"><small>Test number first, then the letter, then Carousel after the |.</small></label>
      <label class="ln-f">Primary text<textarea class="ln-in" data-f="primary_text" rows="3" placeholder="The words above the cards">${esc(f.primary_text)}</textarea><small>From the brief's post copy, else the copy the ad set already runs.</small></label>
      <label class="ln-f">Link<input class="ln-in" data-f="link" value="${esc(f.link)}" placeholder="https://"><small>Where every card goes unless a card has its own.</small></label>
      <div class="lnb-head">The cards <span class="n">${p.cards.length}, in swipe order</span></div>
      <div>${p.cards.map(card).join('')}</div>
      <div data-ln="dry"></div>
      <p class="ln-msg" data-ln="msg"></p>
      <div class="ln-foot"><button class="btn" data-ln="close">Cancel</button><button class="btn primary" data-ln="go" ${p.can === false ? 'disabled title="Locus can only read this ad account. See the note above."' : ''}>Check it (dry run)</button></div>`;
    const val = () => {
      const b = { ...base, order: p.cards.map(c => c.studio_ad) };
      box.querySelectorAll('[data-f]').forEach(el => { b[el.dataset.f] = el.value; });
      b.cards = p.cards.map(c => ({ studio_ad: c.studio_ad, headline: box.querySelector(`[data-ch="${c.studio_ad}"]`).value, link: box.querySelector(`[data-cl="${c.studio_ad}"]`).value.trim() }));
      return b;
    };
    const go = box.querySelector('[data-ln="go"]');
    let checked = null;
    const reset = () => { if (!checked) return; checked = null; box.querySelector('[data-ln="dry"]').innerHTML = ''; go.textContent = 'Check it (dry run)'; msg(box, ''); };
    box.querySelectorAll('[data-f],[data-ch],[data-cl]').forEach(el => { el.addEventListener('input', reset); el.addEventListener('change', reset); });
    box.querySelector('[data-f="adset"]').addEventListener('change', e => { box.querySelector('[data-ln="why"]').textContent = e.target.value === p.suggested ? p.why : 'Your pick. The suggestion was the test’s own ad set or the testing campaign.'; });
    box.querySelector('[data-ln="close"]').onclick = () => done(false);
    go.onclick = async () => {
      go.disabled = true;
      const body = val();
      try {
        if (!checked) {
          msg(box, `Checking ${body.cards.length} cards with Meta. Nothing is written.`);
          const r = await postAH('/api/launch/carousel-preview', body);
          if (r.error) throw new Error(r.error);
          checked = JSON.stringify(body);
          box.querySelector('[data-ln="dry"]').innerHTML = dry(r);
          go.textContent = 'Create paused';
          msg(box, 'Looks right? Create it. It stays paused until someone turns it on.', 'ok');
        } else {
          if (checked !== JSON.stringify(body)) { reset(); go.disabled = false; return; }
          msg(box, 'Making the carousel in Meta.');
          const r = await postAH('/api/launch/carousel-create', body);
          if (r.error) throw new Error(r.error);
          index([{ ...r.launch, act: o.act, source: 'studio', ads_manager: r.ads_manager }]);
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
      <div><b class="cap">After</b>"${esc(r.after.adset)}": ${r.after.ads} ads<ul>${(r.before.names || []).map(x => `<li>${esc(x)}</li>`).join('')}<li class="new">${esc(r.after.ad_name)} (new carousel, ${r.after.cards.length} cards, ${esc(r.after.status === 'PAUSED' ? 'paused' : r.after.status)})</li></ul>
      <ol style="margin:6px 0 0;padding-left:18px">${r.after.cards.map(c => `<li>${esc(c.headline || '(no headline)')}${c.link !== r.after.link ? ` <span style="color:var(--muted)">→ ${esc(c.link)}</span>` : ''}</li>`).join('')}</ol>
      <div style="margin-top:6px">Button: ${esc((CTAS.find(c => c[0] === r.after.cta) || [0, r.after.cta])[1])} · Link: ${esc(r.after.link)}</div></div></div>`;
  }
  function made(r) {
    const l = r.launch;
    box.innerHTML = `<h3>Made in Meta, paused</h3>
      <p class="ln-say">The carousel "${esc(l.ad_name)}" (${(l.cards || []).length} cards) is in "${esc(l.adset_name)}". It spends nothing until someone turns it on.${l.batch_id ? ` It is tied to test #${esc(l.num)} in the test library.` : ''}</p>
      <p class="ln-msg" data-ln="msg"></p>
      <div class="ln-foot"><a class="btn" href="${esc(r.ads_manager)}" target="_blank" rel="noopener">Open in Ads Manager</a>
        ${l.write ? '<button class="btn" data-ln="undo">Undo</button>' : ''}<button class="btn" data-ln="on">Turn it on now</button><button class="btn primary" data-ln="close">Done</button></div>`;
    wireAfter(box, { act: o.act, ...l }, () => done(true));
  }
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
  openBatch,
  openCarousel,
  /* The status chip for one Studio ad (its newest launch), or '' when it was never launched. */
  chip: studioAdId => { const l = (L.byAd.get(studioAdId) || [])[0]; return l ? chipFor(l) : ''; },
  launched: studioAdId => (L.byAd.get(studioAdId) || []).length,
  /* Studio calls this on every paint: loads the brand's launches with live status (2 min cache), then repaints once. */
  watch: (act, t, repaint) => { if (t) L.tok = t; if (!act || act === 'all') return; load(act, { refresh: !L.acts.has(act) || Date.now() - (L.acts.get(act) || 0) > STALE }).then(ch => { if (ch && repaint) repaint(); }); },
  load,
};
})();

/* Load a card's approved ads into Meta, in v5. The same flow and bodies as old Locus (profit/launch.js openBatch):
     1. POST /api/launch/batch-prep    { act, card_id, adset? }                    the approved ads, their copy from the brief, the ad sets
     2. POST /api/launch/batch-preview { act, card_id, adset, cta, ads: [{ file_id, name, link }] }   a dry run, nothing written
     3. POST /api/launch/batch-create  the same body                              the ads, made PAUSED, one line each in Changes made
     Undo on a made ad: POST /api/meta/undo { act, write }.
   All on the account-health worker. Only approved ads come back from step 1 (the server checks, and refuses the whole
   batch if a picked ad is not approved or has no headline or primary text). Up to 12 ads in one go, as the server allows.
   Two taps: "Check" runs the dry run and shows the ad set before and after; "Load N paused" makes them.
   Sample mode calls none of these: it builds the same answers from production/_sample/launch.json. */

import { h, sheet, button, statusDot, toast, skeleton, addStyles, put } from '../../kit.js';
import { fixture } from '../../data.js';
import { APP_NAME } from '../../config.js';
import { picture, plural } from './_ui.js';
import { write, why, canWrite, SAMPLE, SAMPLE_SAID, css as paCss } from './_act.js';

const CTAS = [['SHOP_NOW', 'Shop now'], ['LEARN_MORE', 'Learn more'], ['ORDER_NOW', 'Order now'], ['BUY_NOW', 'Buy now'], ['GET_OFFER', 'Get offer'], ['SIGN_UP', 'Sign up'], ['SUBSCRIBE', 'Subscribe'], ['CONTACT_US', 'Contact us'], ['SEE_MORE', 'See more'], ['NO_BUTTON', 'No button']];
const MISSING_SAY = { headline: 'No headline in the brief', primary_text: 'No primary text in the brief', cards: 'A carousel needs 2 to 10 cards', video: 'A carousel takes pictures, not video' };
const SRC_SAY = { shared: 'from the brief', ad: "this ad's own line in the brief", set: 'from the ad set', cards: "from each card's file name", none: 'not in the brief yet' };
const MAX_GO = 12;

/* ---------- sample answers, made from the card row and one small file ---------- */
async function sampleWorld(card) {
  const f = await fixture('production/_sample/launch.json');
  const num = card.num || '0';
  const adsets = f.adsets.map(s => ({ ...s, name: s.name.replace('{num}', num) }));
  const n = Math.max(1, Math.min(+card.files || 3, 4));
  const video = card.format === 'Video' || card.format === 'UGC';
  const ads = Array.from({ length: n }, (_, i) => {
    const ad = `${num}-${i + 1}`, held = n >= 3 && i === n - 1;
    return { file_id: `sample${num}x${i + 1}`, ad, version: 1, format: video ? 'Video' : 'Still', video, thumb: null, art: card.art || null,
      name: `${ad} | ${video ? 'Video' : 'Still'}`,
      headline: held ? { value: '', source: 'none' } : { value: f.headline, source: 'shared' },
      primary_text: held ? { value: '', source: 'none' } : { value: f.primary_text, source: 'shared' },
      link: { value: f.link, source: 'shared' }, missing: held ? ['headline', 'primary_text'] : [], launched: [] };
  });
  const prep = { ok: true, can: true, card: { id: card.id, num, title: card.title }, adsets, suggested: adsets[0].id, why: f.why, cta: f.cta,
    set: { id: adsets[0].id, name: adsets[0].name, count: f.set_count, names: f.set_names }, ads,
    warnings: ads.some(a => a.missing.length) ? ['1 of ' + ads.length + ' ads has no headline and primary text in the brief. Write them in the brief, shared or under the ad\'s own heading, and open this again.'] : [] };
  return { f, prep };
}

/** openLoad(ctx, { act, card: { id, num, title, format, files, thumb, art }, onDone }) : the Load sheet. */
export function openLoad(ctx, { act, card, onDone } = {}) {
  css(); paCss();
  if (!canWrite(ctx)) { toast('Loading ads is for the team.'); return null; }
  const box = h('div', { class: 'ld' }, h('p', { class: 'ld-say' }, 'Reading the card, the brief and the brand\'s ad sets. A few seconds.'), skeleton('row', 3));
  let made = false;
  const sh = sheet({ title: card.num ? `Load ${card.num} into Meta` : 'Load into Meta', body: box, class: 'ld-sheet', onClose: () => { if (made && onDone) onDone(); } });
  let world = null;
  const prep = async adset => {
    if (SAMPLE) {
      world = world || await sampleWorld(card);
      const p = JSON.parse(JSON.stringify(world.prep));
      if (adset) { const s = p.adsets.find(x => x.id === adset); if (s) { p.suggested = s.id; p.why = 'Your pick.'; p.set = { id: s.id, name: s.name, count: s.id === world.prep.suggested ? world.f.set_count : 3, names: [] }; } }
      return p;
    }
    return write('/api/launch/batch-prep', { act, card_id: card.id, ...(adset ? { adset } : {}) });
  };
  prep().then(p => form(p), e => put(box, h('p', { class: 'ld-msg bad' }, why(e)), h('div', { class: 'ld-foot' }, button('Close', { large: true, class: 'pa-btn', onclick: () => sh.close() }))));

  function form(P) {
    const picked = new Set(P.ads.filter(a => !a.missing.length).slice(0, MAX_GO).map(a => a.file_id));
    const names = {}, links = {};
    P.ads.forEach(a => { names[a.file_id] = a.name; links[a.file_id] = (a.link && a.link.value) || ''; });
    let checked = null, dry = null;
    const adsetSel = h('select', { class: 'lx-input ld-sel', 'aria-label': 'Ad set' },
      (P.adsets || []).map(s => h('option', { value: s.id, selected: s.id === P.suggested || null },
        `${s.name}, ${s.status === 'ACTIVE' ? 'on' : 'off'}${s.campaign ? ', ' + s.campaign : ''}${s.id === P.suggested ? ' (suggested)' : ''}`)));
    const ctaSel = h('select', { class: 'lx-input ld-sel', 'aria-label': 'Button' }, CTAS.map(([k, l]) => h('option', { value: k, selected: k === (P.cta || 'SHOP_NOW') || null }, l)));
    const whyLine = h('small', { class: 'ld-why' }, P.why || '');
    const rows = h('div', { class: 'ld-ads' });
    const dryBox = h('div');
    const msg = h('p', { class: 'ld-msg', role: 'status' });
    const go = button('', { large: true, primary: true, class: 'pa-btn' });
    const setMsg = (t, tone = '') => { msg.textContent = t || ''; msg.className = 'ld-msg ' + tone; };
    const body = () => ({ act, card_id: card.id, adset: adsetSel.value, cta: ctaSel.value,
      ads: P.ads.filter(a => picked.has(a.file_id)).map(a => ({ file_id: a.file_id, name: names[a.file_id], link: links[a.file_id] })) });
    const reset = () => { if (!checked) return; checked = null; dry = null; put(dryBox); setMsg(''); sync(); };
    const sync = () => {
      const n = picked.size;
      go.textContent = checked ? `Load ${n} into Meta, paused` : `Check ${n} first (nothing is written)`;
      go.disabled = P.can === false || n === 0 || n > MAX_GO || (checked && dry && !dry.rows.some(x => x.ok));
      rows.querySelectorAll('[data-row]').forEach(r => r.classList.toggle('off', !picked.has(r.dataset.row)));
    };
    const field = (label, f) => h('div', { class: 'ld-f' }, h('span', { class: 'lx-cap' }, label),
      h('p', { class: f && f.value ? '' : 'none' }, (f && f.value) || 'Not in the brief yet'), h('small', null, SRC_SAY[(f && f.source) || 'none'] || ''));
    const row = a => {
      const held = a.missing.length > 0;
      const tick = h('input', { type: 'checkbox', class: 'ld-tick', checked: picked.has(a.file_id) || null, disabled: held || null, 'aria-label': 'Load ' + (a.ad ? 'ad ' + a.ad : 'this ad'),
        onchange: e => { if (e.target.checked) picked.add(a.file_id); else picked.delete(a.file_id); if (picked.size > MAX_GO) setMsg(`Up to ${MAX_GO} ads in one go.`, 'bad'); reset(); sync(); } });
      const nameIn = h('input', { class: 'lx-input', value: names[a.file_id] != null ? names[a.file_id] : a.name, 'aria-label': 'Name in Meta', oninput: e => { names[a.file_id] = e.target.value; reset(); } });
      const linkIn = h('input', { class: 'lx-input', value: links[a.file_id], placeholder: 'https://', disabled: held || null, 'aria-label': 'Link', oninput: e => { links[a.file_id] = e.target.value; reset(); } });
      return h('div', { class: 'ld-ad' + (held ? ' held' : ''), dataset: { row: a.file_id } },
        h('label', { class: 'ld-pick' }, tick),
        picture({ src: a.thumb, art: a.art, video: !!a.video, ratio: '4/5' }),
        h('div', { class: 'ld-adb' },
          h('div', { class: 'ld-adh' }, h('b', null, a.ad ? 'Ad ' + a.ad : 'The ad'), h('span', null, a.carousel ? plural((a.cards || []).length, 'card') + ', one carousel ad' : `v${a.version || 1}, ${a.format || ''}`),
            held ? statusDot('bad', a.missing.map(k => MISSING_SAY[k]).filter(Boolean).join('; ')) : null,
            (a.launched || []).length ? statusDot('warn', 'Already in Meta: ' + a.launched.map(l => l.ad_name).join(', ')) : null),
          h('label', { class: 'ld-f' }, h('span', { class: 'lx-cap' }, 'Name in Meta'), nameIn),
          field('Headline', a.headline), field('Primary text', a.primary_text),
          h('label', { class: 'ld-f' }, h('span', { class: 'lx-cap' }, 'Link'), linkIn, h('small', null, SRC_SAY[(a.link && a.link.source) || 'none'] || ''))));
    };
    put(rows, P.ads.map(row));
    adsetSel.addEventListener('change', async () => {
      whyLine.textContent = 'Your pick. Reading the links this ad set already uses.';
      reset();
      try {
        const q = await prep(adsetSel.value);
        for (const a of q.ads) {
          const old = P.ads.find(x => x.file_id === a.file_id); if (!old) continue;
          if ((old.link.source === 'set' || old.link.source === 'none') && links[a.file_id] === old.link.value) links[a.file_id] = a.link.value;
          old.link = a.link;
        }
        P.set = q.set;
        put(rows, P.ads.map(row)); sync();
        whyLine.textContent = adsetSel.value === P.suggested ? (P.why || '') : 'Your pick.';
      } catch (e) { setMsg(why(e), 'bad'); }
    });
    ctaSel.addEventListener('change', reset);

    go.onclick = async () => {
      if (go.disabled) return;
      const b = body();
      go.disabled = true;
      try {
        if (!checked) {
          setMsg(`Checking ${plural(b.ads.length, 'ad')} with Meta. Nothing is written.`);
          const r = SAMPLE ? samplePreview(b, P) : await write('/api/launch/batch-preview', b);
          checked = JSON.stringify(b); dry = r;
          put(dryBox, dryView(r, b));
          const bad = r.rows.filter(x => !x.ok);
          setMsg(bad.length ? `${plural(bad.length, 'ad')} would fail (see above). Leave ${bad.length === 1 ? 'it' : 'them'} out or fix the brief.` : 'Looks right? Tap Load. They go in switched off and spend nothing until someone turns them on.', bad.length ? 'bad' : 'ok');
          return;
        }
        if (checked !== JSON.stringify(b)) { reset(); return; }
        setMsg(`Making ${plural(b.ads.length, 'ad')} in Meta, one after the other.`);
        const r = SAMPLE ? sampleCreate(b, P) : await write('/api/launch/batch-create', b);
        made = r.made > 0;
        result(r);
      } catch (e) { setMsg(why(e), 'bad'); }
      finally { if (go.isConnected) sync(); }
    };

    const setName = (P.adsets || []).find(s => s.id === P.suggested);
    put(box,
      h('div', { class: 'ld-top' }, picture({ src: card.thumb, art: card.art, video: card.format === 'Video' || card.format === 'UGC', ratio: '1/1' }),
        h('div', null, h('b', null, card.title || 'Untitled card'), h('small', null, [card.num && 'Card ' + card.num, plural(P.ads.length, 'approved ad')].filter(Boolean).join(', ')))),
      h('div', { class: 'ld-box' }, h('b', null, 'Every picked ad goes into one ad set, switched off (paused).'),
        h('p', null, 'Nothing spends until someone turns it on. The headline and words come from the brief. Each ad is written to Changes, with an undo.')),
      (P.warnings || []).length ? h('div', { class: 'ld-warn' }, P.warnings.map(w => h('p', null, w))) : null,
      P.can === false ? h('p', { class: 'ld-msg bad' }, 'Our Meta login can read this ad account but cannot change it, so loading is off until that is fixed in Meta.') : null,
      h('div', { class: 'ld-where' },
        h('label', { class: 'ld-f' }, h('span', { class: 'lx-cap' }, 'Ad set it goes into'), adsetSel, whyLine,
          setName && setName.status !== 'ACTIVE' ? statusDot('warn', 'This ad set is off. Ads loaded here will not run until it is turned on.') : null),
        h('label', { class: 'ld-f' }, h('span', { class: 'lx-cap' }, 'Button'), ctaSel, h('small', null, 'The same button on every ad.'))),
      h('div', { class: 'ld-h' }, h('h3', null, 'The ads'), h('span', null, 'Only approved ads are listed. An ad with no headline or words in its brief is held back.')),
      rows, dryBox, msg,
      h('div', { class: 'ld-foot' }, button('Cancel', { large: true, class: 'pa-btn', onclick: () => sh.close() }), go),
      ctx.legacy ? h('p', { class: 'ld-old' }, h('a', { href: ctx.legacy + (card.id ? '&card=' + encodeURIComponent(card.id) : ''), target: '_blank', rel: 'noopener' }, 'Open in old ' + APP_NAME + ' instead')) : null);
    sync();
  }

  function dryView(r, b) {
    const okRows = r.rows.filter(x => x.ok);
    return h('div', { class: 'ld-dry' },
      (r.warnings || []).length ? h('div', { class: 'ld-warn' }, r.warnings.map(w => h('p', null, w))) : null,
      h('div', { class: 'ld-ba' },
        h('div', null, h('span', { class: 'lx-cap' }, 'Before'), h('b', null, r.before.adset || 'The ad set'), h('p', null, plural(r.before.ads || 0, 'ad'))),
        h('div', null, h('span', { class: 'lx-cap' }, 'After'), h('b', null, r.after.adset || 'The ad set'), h('p', null, plural(r.after.ads || 0, 'ad')))),
      h('ul', { class: 'ld-new' }, r.rows.map(x => x.ok
        ? h('li', null, h('b', null, x.name), ' ', statusDot('off', 'new, paused'))
        : h('li', { class: 'bad' }, h('b', null, x.name || x.ad || 'An ad'), ': ' + (x.error || 'would fail')))),
      okRows[0] ? h('small', null, 'Button: ' + ((CTAS.find(c => c[0] === (okRows[0].cta || b.cta)) || [0, b.cta])[1])) : null);
  }

  function result(r) {
    const ok = r.rows.filter(x => x.ok), bad = r.rows.filter(x => !x.ok);
    const line = x => {
      const undo = x.ok && x.launch && x.launch.write ? button('Undo', { class: 'pa-btn', onclick: async e => {
        const b = e.currentTarget; b.disabled = true;
        try {
          await write('/api/meta/undo', { act, write: x.launch.write }, () => ({ ok: true }));
          b.replaceWith(statusDot('off', 'Undone, archived in Meta'));
          if (!SAMPLE) toast(`"${x.name}" is archived in Meta.`);
        } catch (err) { b.disabled = false; toast(why(err), { tone: 'bad', ms: 6000 }); }
      } }) : null;
      return h('div', { class: 'ld-res' },
        h('div', null, x.ok ? statusDot('good', 'Made') : statusDot('bad', 'Not made'), ' ', h('b', null, x.name || x.ad || 'An ad'), x.ok ? null : ': ' + (x.error || '')),
        h('div', { class: 'ld-res-a' }, x.ok && x.ads_manager ? button('Ads Manager', { href: x.ads_manager, target: '_blank', class: 'pa-btn' }) : null, undo));
    };
    put(box,
      h('h3', { class: 'ld-done' }, ok.length ? `Made ${plural(ok.length, 'ad')} in Meta, paused` : 'Nothing was made'),
      h('p', { class: 'ld-say' }, (ok.length ? `${ok.length === 1 ? 'It is' : 'They are'} in "${r.adset || 'the ad set'}" and spend nothing until someone turns ${ok.length === 1 ? 'it' : 'them'} on.` : '') +
        (bad.length ? ` ${bad.length} ${bad.length === 1 ? 'was' : 'were'} not made; the reason is beside each.` : '') + (SAMPLE ? ' ' + SAMPLE_SAID + '.' : '')),
      h('div', { class: 'ld-ress' }, r.rows.map(line)),
      h('div', { class: 'ld-foot' }, button('Done', { large: true, primary: true, class: 'pa-btn', onclick: () => sh.close() })));
  }
  return sh;
}

function samplePreview(b, P) {
  const set = (P.adsets || []).find(s => s.id === b.adset) || {};
  const count = (P.set && P.set.count) || 0;
  const rows = b.ads.map(x => ({ file_id: x.file_id, ok: true, name: x.name, cta: b.cta }));
  return { ok: true, dry: true, adset: set.name, before: { adset: set.name, ads: count, names: [] }, after: { adset: set.name, ads: count + rows.length, names: rows.map(r => r.name) }, rows, warnings: [] };
}
function sampleCreate(b, P) {
  const set = (P.adsets || []).find(s => s.id === b.adset) || {};
  const rows = b.ads.map(x => ({ file_id: x.file_id, ok: true, name: x.name, launch: { ad_name: x.name, adset_name: set.name, write: 'sample' }, ads_manager: null }));
  return { ok: true, made: rows.length, failed: 0, adset: set.name, rows };
}

const CSS = `
.lx-sheet.ld-sheet{width:min(720px,100%)}
.ld{display:grid;gap:18px;min-width:0}
.ld-say{font-size:13.5px;color:var(--ink-2);line-height:1.5}
.ld-top{display:grid;grid-template-columns:72px minmax(0,1fr);gap:14px;align-items:center}
.ld-top b{display:block;font-size:17px;font-weight:600;letter-spacing:-.02em;overflow-wrap:anywhere}
.ld-top small{display:block;margin-top:3px;color:var(--muted);font-size:13px}
.ld-box{display:grid;gap:4px;padding:14px 16px;border-radius:14px;background:var(--bg-sunk)}
.ld-box p{font-size:13px;color:var(--ink-2)}
.ld-warn{display:grid;gap:6px;padding:12px 14px;border-radius:12px;background:var(--warn-bg);color:var(--ink);font-size:13px}
.ld-where{display:grid;grid-template-columns:minmax(0,2fr) minmax(0,1fr);gap:14px}
.ld-f{display:grid;gap:5px;min-width:0}
.ld-f p{font-size:13.5px;overflow-wrap:anywhere}
.ld-f p.none{color:var(--bad)}
.ld-f small,.ld-why{font-size:12px;color:var(--muted)}
.ld-sel{appearance:auto}
.ld-h{display:flex;align-items:baseline;gap:10px;flex-wrap:wrap;padding-bottom:6px;border-bottom:1px solid var(--line)}
.ld-h h3{font-size:15px;font-weight:600}
.ld-h span{font-size:12.5px;color:var(--muted)}
.ld-ads{display:grid;gap:12px}
.ld-ad{display:grid;grid-template-columns:44px 96px minmax(0,1fr);gap:14px;align-items:start;padding:12px;border:1px solid var(--line);border-radius:14px;min-width:0}
.ld-ad.off{opacity:.55}
.ld-ad.held{background:var(--bg-sunk)}
.ld-pick{display:grid;place-items:center;width:44px;height:44px;cursor:pointer}
.ld-tick{width:22px;height:22px;accent-color:var(--ink)}
.ld-adb{display:grid;gap:10px;min-width:0}
.ld-adh{display:flex;align-items:center;gap:8px;flex-wrap:wrap;font-size:13px;color:var(--muted)}
.ld-adh b{color:var(--ink);font-size:14.5px}
.ld-dry{display:grid;gap:12px;padding:14px 16px;border-radius:14px;border:1px solid var(--line-strong)}
.ld-ba{display:grid;grid-template-columns:1fr 1fr;gap:14px}
.ld-ba>div{display:grid;gap:3px;min-width:0}
.ld-ba b{overflow-wrap:anywhere}
.ld-ba p{font-size:13px;color:var(--muted)}
.ld-new{display:grid;gap:6px;padding-left:18px;font-size:13.5px}
.ld-new li.bad{color:var(--bad)}
.ld-msg{font-size:13.5px;min-height:1em}
.ld-msg.bad{color:var(--bad);font-weight:500}
.ld-msg.ok{color:var(--good)}
.ld-foot{display:flex;gap:10px;justify-content:flex-end;flex-wrap:wrap;position:sticky;bottom:0;padding:12px 0 4px;background:var(--surface,#fff)}
.ld-old{font-size:12.5px;color:var(--muted);text-align:right}
.ld-old a{color:var(--muted)}
.ld-done{font-size:18px;font-weight:600}
.ld-ress{display:grid}
.ld-res{display:flex;justify-content:space-between;gap:12px;align-items:center;flex-wrap:wrap;padding:10px 0;border-top:1px solid var(--line);font-size:13.5px}
.ld-res:first-child{border-top:0}
.ld-res-a{display:flex;gap:8px}
@media (max-width:759px){
  .ld-where{grid-template-columns:minmax(0,1fr)}
  .ld-ad{grid-template-columns:44px 64px minmax(0,1fr);gap:10px;padding:10px}
  .ld-ad .ld-adb{grid-column:1/-1}
  .ld-foot .lx-btn{flex:1 1 140px}
  .ld-ba{grid-template-columns:minmax(0,1fr)}
}
`;
const css = () => addStyles('ld-css', CSS);

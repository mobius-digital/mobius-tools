/* One card, opened as a sheet: where it is, who has it, the ads, the brief, the files and the notes.
   Read only. Anything that would change the card (move, note, upload, send to the client) opens old Locus.
   Data: GET /api/production/card?id= on the account-health worker. Sample mode reads production/_sample/card.json
   (a map of card id to that same answer) and builds a thin sheet for a card the file does not carry. */

import { APP_NAME } from '../../config.js';
import { put } from '../../kit.js';
import { h, sheet, statusDot, button, relativeTime, skeleton, empty, addStyles } from '../../kit.js';
import { fixture, cached, api, SAMPLE } from '../../data.js';
import { STEPS, stepOf, day, daysFrom, kb, picture, who, cardLink, oldLocus, plural } from './_ui.js';

/* ---------- the brief: the page's own html, read as plain lines (never put in the page as html) ---------- */
export function briefLines(html) {
  if (!html) return [];
  const doc = new DOMParser().parseFromString('<div>' + html + '</div>', 'text/html');
  const out = [];
  let label = '';
  const text = n => (n.textContent || '').replace(/\s+/g, ' ').trim();
  for (const n of doc.body.firstChild.children) {
    const t = text(n);
    if (!t) continue;
    const strong = n.children.length === 1 && /^(B|STRONG)$/.test(n.children[0].tagName) && text(n.children[0]) === t;
    if (/^H[1-6]$/.test(n.tagName) || strong) { label = t.replace(/:$/, ''); continue; }
    const m = /^([A-Z][A-Za-z' ]{2,28}):\s+(.+)$/.exec(t);
    if (m && !label) out.push({ label: m[1], text: m[2] });
    else if (/^(UL|OL)$/.test(n.tagName)) [...n.children].forEach((li, i) => out.push({ label: i ? '' : label, text: text(li) }));
    else out.push({ label, text: t });
    label = '';
  }
  return out.slice(0, 14);
}
const lineOf = (lines, re) => (lines.find(l => re.test(l.label)) || {}).text || '';

const AD_STATE = { approved: ['good', 'Approved'], changes: ['warn', 'Changes asked'], review: ['off', 'To review'] };
export const adState = a => AD_STATE[a.status] || AD_STATE.review;
/** The file to show for an ad: its newest version. */
export const fileOf = (sh, ad) => (sh.files || []).find(f => f.id === ad.file_id) || null;
const pinOf = c => { const p = c.shape; if (!p) return null; const x = +(p.x ?? (p[0] && p[0].x)), y = +(p.y ?? (p[0] && p[0].y)); return isFinite(x) && isFinite(y) && x >= 0 && x <= 1 && y >= 0 && y <= 1 ? { x, y } : null; };

/* ---------- reading one card ---------- */
function thin(card) {      // a sheet for a sample card the fixture has no page for
  return { card: { ...card, owner: card.assignee || '', share: null }, brief: { html: '', format: card.format, blank: true }, files: [], comments: [], ads: [], thin: true };
}
export async function readCard(card, onFresh) {
  if (SAMPLE) { const all = await fixture('production/_sample/card.json'); return all[card.id] || thin(card); }
  const rec = await cached('card|' + card.id, () => api('/api/production/card?id=' + encodeURIComponent(card.id), { worker: 'ah' }), onFresh && (r => onFresh(r.data)));
  return rec.data;
}

/* ---------- drawing ---------- */
function track(card) {
  const now = stepOf(card);
  return h('ol', { class: 'ps-track' }, STEPS.map((name, i) => h('li', { class: i < now ? 'done' : i === now ? 'now' : '' }, name)));
}
function facts(sh, photos, today) {
  const c = sh.card, waitsOn = c.needs_client ? 'The client' : c.owner || '';
  const since = c.client_sent_at && c.needs_client ? daysFrom(c.client_sent_at, today) : null;
  const cell = (label, value) => h('div', null, h('span', { class: 'lx-cap' }, label), h('b', null, value));
  return h('div', { class: 'ps-facts' },
    cell('Has it now', [c.needs_client ? null : who(c.owner, photos, 20), ' ', waitsOn || 'Nobody yet', since != null ? ', ' + plural(since, 'day') : '']),
    cell('Ads due', c.due ? day(c.due, true) : 'No date'),
    cell('Goes live', c.launch_on ? day(c.launch_on, true) : 'Not set'),
    cell('Approved by', c.approved_by || 'Not yet'));
}

function adBlock(sh, state, redraw) {
  const ads = sh.ads || [];
  if (!ads.length) return null;
  const ad = ads[Math.min(state.ad, ads.length - 1)], f = fileOf(sh, ad) || {}, st = adState(ad);
  const lines = briefLines(sh.brief && sh.brief.html);
  const notes = (sh.comments || []).filter(c => c.file_id === f.id && !c.parent_id && (c.kind === 'note' || c.kind === 'change_request'));
  const pic = picture({ src: f.view || f.thumb || (f.video ? null : f.url), art: f.art, video: !!f.video, ratio: f.video ? '9/16' : '4/5', alt: 'Ad ' + ad.ad });
  notes.forEach((c, i) => { const p = pinOf(c); if (p) pic.append(h('span', { class: 'ps-pin', style: { left: p.x * 100 + '%', top: p.y * 100 + '%' } }, i + 1)); });
  const word = (label, re) => { const t = lineOf(lines, re); return t ? h('div', null, h('span', { class: 'lx-cap' }, label), h('p', null, t)) : null; };
  return h('section', { class: 'ps-ad' },
    h('div', { class: 'ps-ad-pic' }, pic,
      f.download || f.url ? h('a', { class: 'ps-link', href: f.download || f.url, target: '_blank', rel: 'noopener' }, 'Download the original') : null),
    h('div', { class: 'ps-ad-side' },
      h('div', { class: 'ps-ad-h' }, h('b', null, 'Ad ' + (ad.ad || '1')), statusDot(st[0], st[1] + (ad.by ? ', ' + ad.by : ''))),
      h('div', { class: 'ps-ver' }, h('b', null, 'v' + (ad.version || 1)), h('span', null, [f.by, f.created_at ? relativeTime(f.created_at) : ''].filter(Boolean).join(', ')),
        ad.versions > 1 ? h('small', null, plural(ad.versions, 'version')) : null),
      word('Headline', /headline/i), word('Text', /^(text|primary|copy)/i), word('Goes to', /(goes to|link|landing)/i),
      ad.open ? statusDot('warn', plural(ad.open, 'open note')) : null),
    h('div', { class: 'ps-strip' }, ads.map((a, i) => h('button', { type: 'button', class: i === state.ad ? 'on' : '', onclick: () => { state.ad = i; redraw(); } },
      h('b', null, a.ad || String(i + 1)), statusDot(adState(a)[0], 'v' + (a.version || 1))))));
}

function briefBlock(sh, ctx) {
  const lines = briefLines(sh.brief && sh.brief.html).filter(l => !/headline|^(text|primary|copy)|goes to|link|landing/i.test(l.label));
  return h('section', null,
    h('div', { class: 'ps-h' }, h('h3', null, 'Brief'), sh.card.brief_url && !ctx.isClient ? h('a', { class: 'ps-link', href: sh.card.brief_url, target: '_blank', rel: 'noopener' }, 'Read the full brief') : null),
    lines.length ? h('dl', { class: 'ps-brief' }, lines.slice(0, 8).map(l => [h('dt', { class: 'lx-cap' }, l.label), h('dd', null, l.text)]))
      : h('p', { class: 'ps-none' }, sh.thin ? 'The brief for this card is not in the sample file.' : 'No brief written yet.'));
}

function filesBlock(sh, state) {
  const all = sh.files || [];
  if (!all.length) return h('section', null, h('div', { class: 'ps-h' }, h('h3', null, 'Files')), h('p', { class: 'ps-none' }, 'No files on this card yet.'));
  const ad = (sh.ads || [])[state.ad];
  const mine = ad ? all.filter(f => f.kind === 'version' && (f.ad || '') === (ad.ad || '')) : [];
  const rows = (mine.length ? mine : all).slice().sort((a, b) => (b.version || 0) - (a.version || 0)).slice(0, 12);
  const newest = Math.max(...rows.map(f => f.version || 0));
  return h('section', null,
    h('div', { class: 'ps-h' }, h('h3', null, 'Files'), h('span', null, mine.length ? `Ad ${ad.ad}. ${rows.length} of the card's ${all.length}.` : plural(all.length, 'file'))),
    h('div', { class: 'ps-files' }, rows.map(f => h('a', { class: f.kind === 'version' && (f.version || 0) < newest ? 'old' : '', href: f.download || f.url || null, target: '_blank', rel: 'noopener' },
      h('b', null, f.name || 'File'),
      h('span', { class: 'hide-sm' }, f.px || (f.video ? 'Video' : (f.mime || '').replace(/^image\//, '').toUpperCase())),
      h('span', null, kb(f.size)),
      f.kind !== 'version' ? statusDot('off', f.kind === 'inspo' ? 'Reference' : 'Attached') : (f.version || 0) < newest ? statusDot('off', 'Older version') : statusDot('good', 'Current')))));
}

function notesBlock(sh, photos) {
  const all = (sh.comments || []).filter(c => !c.parent_id);
  const replies = id => (sh.comments || []).filter(c => c.parent_id === id);
  const fileName = id => { const f = (sh.files || []).find(x => x.id === id); return f ? `${f.ad || 'the ad'} v${f.version || 1}` : ''; };
  const row = c => {
    const sys = c.kind === 'system';
    const verb = c.kind === 'approval' ? ' approved' : c.kind === 'change_request' ? ' asked for changes' : c.kind === 'reopen' ? ' reopened it' : '';
    return h('div', { class: 'ps-note' + (sys ? ' sys' : '') },
      sys ? h('span', { class: 'ps-note-dot' }) : who(c.who, photos, 28),
      h('div', null,
        h('div', { class: 'ps-note-h' }, sys ? null : h('b', null, c.who || 'Someone'), verb,
          c.file_id && fileName(c.file_id) ? h('span', null, ' on ' + fileName(c.file_id)) : null,
          h('time', null, c.created_at ? relativeTime(c.created_at) : '')),
        c.body ? h('p', null, c.body) : null,
        c.kind === 'note' || c.kind === 'change_request' ? statusDot(c.fixed ? 'good' : 'warn', c.fixed ? 'Fixed' : 'Open') : null,
        replies(c.id).map(r => h('p', { class: 'ps-reply' }, h('b', null, r.who || 'Someone'), ' ', r.body))));
  };
  return h('section', null,
    h('div', { class: 'ps-h' }, h('h3', null, 'Notes'), h('span', null, all.length ? String(all.length) : '')),
    all.length ? h('div', { class: 'ps-notes' }, all.slice(-12).map(row)) : h('p', { class: 'ps-none' }, 'No notes yet.'));
}

function body(sh, ctx, photos, today, state, redraw) {
  const c = sh.card;
  const share = c.share && !ctx.isClient ? button('Open the client review link', { href: c.share, target: '_blank' }) : null;
  return [
    h('div', { class: 'ps-top' },
      h('div', { class: 'ps-kicker' }, h('b', null, 'Card ' + c.num), h('span', null, (sh.brief && sh.brief.format) || c.format || ''),
        (sh.ads || []).length ? h('span', null, plural(sh.ads.length, 'ad')) : null, c.brand && ctx.view === 'agency' ? h('span', null, c.brand) : null),
      h('h2', null, c.title || 'Untitled card'),
      track(c)),
    facts(sh, photos, today),
    adBlock(sh, state, redraw),
    briefBlock(sh, ctx),
    filesBlock(sh, state),
    notesBlock(sh, photos),
    ctx.isClient ? null : h('div', { class: 'ps-foot' },
      oldLocus(ctx, { href: cardLink(ctx, c.id), label: 'Open in old ' + APP_NAME, large: true }), share,
      h('p', null, 'Read only here. Move the card, add a note, upload a version or send it to the client in old ' + APP_NAME + '.')),
  ];
}

/** openCard(ctx, card, { photos, today }) : the sheet. card is one row of the board (id, num, title, board...). */
export function openCard(ctx, card, { photos = {}, today } = {}) {
  css();
  const box = h('div', { class: 'ps' }, skeleton('title'), skeleton('row', 4));
  const sh = sheet({ title: ' ', body: box, class: 'ps-sheet' });
  sh.el.querySelector('.lx-sheet-h h2').textContent = '';
  const state = { ad: 0 };
  let open = true;
  const paint = data => { if (!open) return; const redraw = () => paint(data); put(box, ...body(data, ctx, photos, today, state, redraw).filter(Boolean)); };
  readCard(card, paint).then(paint, e => {
    put(box, empty({ title: 'This card could not load', text: (e && e.message) || 'Something went wrong.', action: oldLocus(ctx, { href: cardLink(ctx, card.id) }) }));
  });
  return sh;
}

const CSS = `
.lx-sheet.ps-sheet{width:min(760px,100%)}
.ps-sheet .lx-sheet-h{padding:10px 12px 0 24px;position:absolute;right:0;top:0;z-index:2;background:none}
.ps-sheet .lx-sheet-b{padding-top:22px;position:relative}
.ps{display:grid;gap:26px;min-width:0}
.ps section{display:grid;gap:12px;min-width:0}
.ps-top{display:grid;gap:10px;padding-right:44px}
.ps-kicker{display:flex;gap:10px;flex-wrap:wrap;font-size:12.5px;color:var(--muted)}
.ps-kicker b{color:var(--ink)}
.ps-top h2{font-size:22px;font-weight:600;letter-spacing:-.025em;line-height:1.2}
.ps-track{display:grid;grid-template-columns:repeat(8,minmax(0,1fr));gap:4px;list-style:none;margin:6px -44px 0 0;padding:0}
.ps-track li{padding-top:8px;border-top:3px solid var(--line-strong);font-size:11.5px;line-height:1.25;color:var(--faint);overflow-wrap:anywhere}
.ps-track li.done{border-color:var(--slate);color:var(--muted)}
.ps-track li.now{border-color:var(--ink);color:var(--ink);font-weight:600}
.ps-facts{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:16px;padding:16px 18px;border-radius:14px;background:var(--band)}
.ps-facts>div{display:grid;gap:4px;min-width:0}
.ps-facts b{display:flex;align-items:center;gap:6px;flex-wrap:wrap;font-weight:600;font-size:13.5px}
.ps-ad{grid-template-columns:minmax(0,240px) minmax(0,1fr);column-gap:22px!important;align-items:start}
.ps-ad-pic{display:grid;gap:8px}
.ps-ad-pic .pd-pic{border-radius:12px;box-shadow:0 0 0 1px var(--line)}
.ps-ad-side{display:grid;gap:12px;align-content:start;min-width:0}
.ps-ad-side p{font-size:13.5px;overflow-wrap:anywhere}
.ps-ad-h{display:flex;align-items:center;gap:10px;flex-wrap:wrap}
.ps-ad-h b{font-size:16px;font-weight:600}
.ps-ver{display:flex;align-items:baseline;gap:10px;padding:10px 0;border-top:1px solid var(--line);border-bottom:1px solid var(--line);font-size:13px;color:var(--muted);flex-wrap:wrap}
.ps-ver b{color:var(--ink)}
.ps-ver small{margin-left:auto}
.ps-strip{grid-column:1/-1;display:grid;grid-template-columns:repeat(auto-fill,minmax(78px,1fr));gap:8px}
.ps-strip button{display:grid;gap:3px;padding:8px 10px;border:0;border-radius:10px;background:#fff;box-shadow:inset 0 0 0 1px var(--line-strong);text-align:left;cursor:pointer;font-size:13px}
.ps-strip button.on{box-shadow:inset 0 0 0 2px var(--ink)}
.ps-pin{position:absolute;width:22px;height:22px;margin:-11px 0 0 -11px;border-radius:50%;background:var(--ink);color:#fff;font-size:11.5px;font-weight:700;display:grid;place-items:center;box-shadow:0 0 0 2px #fff}
.ps-h{display:flex;align-items:baseline;gap:10px;padding-bottom:8px;border-bottom:1px solid var(--line)}
.ps-h h3{font-size:15px;font-weight:600}
.ps-h span{font-size:12.5px;color:var(--muted)}
.ps-h a{margin-left:auto}
.ps-link{font-size:12.5px;font-weight:550;color:var(--ink);text-decoration:underline;text-underline-offset:3px}
.ps-none{font-size:13px;color:var(--muted)}
.ps-brief{display:grid;grid-template-columns:96px minmax(0,1fr);gap:8px 14px;margin:0}
.ps-brief dt{padding-top:3px;white-space:normal}
.ps-brief dd{margin:0;font-size:13.5px;overflow-wrap:anywhere}
.ps-files{display:grid}
.ps-files a{display:grid;grid-template-columns:minmax(0,1fr) 110px 70px 120px;gap:12px;align-items:center;padding:9px 0;border-top:1px solid var(--line);font-size:13px;color:var(--ink-2);text-decoration:none}
.ps-files a:first-child{border-top:0}
.ps-files b{font-weight:550;color:var(--ink);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.ps-files a.old b,.ps-files a.old{color:var(--muted)}
.ps-files span{font-variant-numeric:tabular-nums}
.ps-notes{display:grid}
.ps-note{display:grid;grid-template-columns:28px minmax(0,1fr);gap:12px;padding:12px 0;border-top:1px solid var(--line)}
.ps-note:first-child{border-top:0}
.ps-note>div{display:grid;gap:4px;min-width:0}
.ps-note-h{font-size:13px;color:var(--ink-2)}
.ps-note-h b{color:var(--ink)}
.ps-note-h span{color:var(--muted)}
.ps-note-h time{float:right;font-size:12px;color:var(--faint);margin-left:10px}
.ps-note p{font-size:13.5px;overflow-wrap:anywhere}
.ps-note.sys p{color:var(--muted)}
.ps-note-dot{width:8px;height:8px;margin:7px 0 0 10px;border-radius:50%;background:var(--line-strong)}
.ps-reply{padding-left:12px;border-left:2px solid var(--line-strong);color:var(--ink-2)}
.ps-foot{display:flex;gap:10px;align-items:center;flex-wrap:wrap;padding-top:18px;border-top:1px solid var(--line)}
.ps-foot p{flex:1 1 100%;font-size:12.5px;color:var(--muted)}
@media (max-width:759px){
  .ps-track{grid-template-columns:repeat(4,minmax(0,1fr));row-gap:10px;margin-right:0}
  .ps-top{padding-right:36px}
  .ps-facts{grid-template-columns:1fr 1fr}
  .ps-ad{grid-template-columns:minmax(0,1fr)}
  .ps-ad-pic{max-width:260px}
  .ps-brief{grid-template-columns:minmax(0,1fr);gap:2px}
  .ps-brief dd{margin-bottom:8px}
  .ps-files a{grid-template-columns:minmax(0,1fr) auto auto}
  .ps-files .hide-sm{display:none}
  .ps-foot .lx-btn{flex:1 1 100%}
}
`;
const css = () => addStyles('ps-css', CSS);

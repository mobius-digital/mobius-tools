/* One card, opened as a sheet: where it is, who has it, the ads, the brief, the files and the notes.
   The team does the daily jobs here, with the same routes and bodies as old Locus (profit/production.js, prodsheet.js),
   all on the account-health worker:
     Move to a stage        POST /api/production/move     { id, to }   to = brief | making | review | ready | scheduled | live | off
     Who has it             POST /api/production/field    { id, owner }
     Approve one ad         POST /api/production/decide   { id, file_id, ok: true, reset: false, body: '' }
     Ask for changes        POST /api/production/decide   { id, file_id, ok: false, reset: false, body }
     Open for review again  POST /api/production/decide   { id, file_id, ok: false, reset: true, body: '' }
     Approve all            POST /api/production/decide   { id, all: true }
     Add a note             POST /api/production/comment  { id, body }
     Send to the client     POST /api/production/send     { id, what: 'ad' | 'idea' }, take back with what ''   (confirm first)
     Copy client link       POST /api/production/share    { id }
     Load into Meta         the Load sheet (_load.js)
   Clients, "See as client" and read only viewers get no write buttons (_act.js canWrite). Sample mode calls no route.
   Uploading a new version still happens in old Locus (a small link at the foot).
   Data: GET /api/production/card?id= on the account-health worker. Sample mode reads production/_sample/card.json
   (a map of card id to that same answer) and builds a thin sheet for a card the file does not carry. */

import { APP_NAME } from '../../config.js';
import { put } from '../../kit.js';
import { h, sheet, statusDot, button, relativeTime, skeleton, empty, addStyles, tabs } from '../../kit.js';
import { toast } from '../../kit.js';
import { fixture, cached, api, SAMPLE } from '../../data.js';
import { STEPS, stepOf, day, daysFrom, kb, picture, who, cardLink, oldLocus, plural, teamTag } from './_ui.js';
import { canWrite, write, confirm, why, keepCard, act, css as paCss } from './_act.js';
import { openLoad } from './_load.js';

const MOVES = [['brief', 'Brief'], ['making', 'Making'], ['review', 'Review'], ['ready', 'Ready'], ['scheduled', 'Scheduled'], ['live', 'Live'], ['off', 'Off']];
const MOVE_LABEL = Object.fromEntries(MOVES);

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
    cell('Has it now', [c.needs_client || !c.owner ? null : who(c.owner, photos, 20), ' ', waitsOn || 'Nobody yet', since != null ? ', ' + plural(since, 'day') : '']),
    cell('Ads due', c.due ? day(c.due, true) : 'No date'),
    cell('Goes live', c.launch_on ? day(c.launch_on, true) : 'Not set'),
    cell('Approved by', c.approved_by || 'Not yet'));
}

function adBlock(sh, state, redraw, ops) {
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
      ad.open ? statusDot('warn', plural(ad.open, 'open note')) : null,
      ops ? adActs(ad, ops) : null),
    h('div', { class: 'ps-strip' }, ads.map((a, i) => h('button', { type: 'button', class: i === state.ad ? 'on' : '', onclick: () => { state.ad = i; redraw(); } },
      h('b', null, a.ad || String(i + 1)), statusDot(adState(a)[0], 'v' + (a.version || 1))))));
}

/* ---------- the buttons (team only) ---------- */
function adActs(ad, ops) {
  if (!ad.file_id) return null;
  if (ad.status === 'review' || !ad.status) return h('div', { class: 'ps-acts' },
    act('Approve', () => ops.decide(ad, true), { primary: true, iconLeft: 'check' }),
    act('Ask for changes', () => ops.askChanges(ad)));
  return h('div', { class: 'ps-acts' }, act('Open for review again', () => ops.decide(ad, null)));
}
function workBlock(sh, ops) {
  const c = sh.card, ads = sh.ads || [];
  const waiting = ads.filter(a => a.status === 'review' || !a.status).length;
  const owner = c.owner != null ? c.owner : c.assignee || '';
  const names = [...new Set([...(ops.team || []), owner].filter(Boolean))];
  const ownerSel = h('select', { class: 'lx-input ps-sel', 'aria-label': 'Who has it', onchange: e => ops.assign(e.target.value, e.target) },
    h('option', { value: '', selected: !owner || null }, 'Nobody yet'), names.map(n => h('option', { value: n, selected: n === owner || null }, n)));
  const toClient = ads.length ? 'ad' : 'idea';
  return h('section', { class: 'ps-do' },
    h('div', { class: 'ps-do-row' }, h('span', { class: 'lx-cap' }, 'Move to'),
      h('div', { class: 'ps-moves', role: 'group', 'aria-label': 'Move to' }, MOVES.map(([k, l]) => h('button', { type: 'button', class: k === c.board ? 'on' : '', 'aria-pressed': String(k === c.board),
        disabled: k === c.board || null, onclick: e => ops.move(k, e.currentTarget) }, l)))),
    h('div', { class: 'ps-do-row' }, h('span', { class: 'lx-cap' }, 'Who has it'), ownerSel),
    h('div', { class: 'ps-acts' },
      c.board === 'review' && waiting > 1 ? act(`Approve all ${waiting}`, () => ops.approveAll(waiting), { primary: true, iconLeft: 'check' }) : null,
      c.board === 'ready' ? act('Load into Meta', () => ops.load(), { primary: true }) : null,
      c.needs_client ? act('Take back from the client', () => ops.send(''))
        : act(toClient === 'ad' ? 'Send the ads to the client' : 'Send the idea to the client', () => ops.send(toClient)),
      act('Copy client link', () => ops.share())));
}
function noteBox(ops) {
  const ta = h('textarea', { class: 'lx-input ps-ta', rows: '3', placeholder: 'Write a note for the team', 'aria-label': 'Add a note' });
  return h('div', { class: 'ps-add' }, ta, h('div', { class: 'ps-acts' }, act('Post note', async () => {
    const text = ta.value.trim();
    if (!text) { ta.focus(); toast('Write the note first.'); return; }
    await ops.note(text);
  }, { primary: true })));
}

function briefBlock(sh, ctx) {
  const lines = briefLines(sh.brief && sh.brief.html).filter(l => !/headline|^(text|primary|copy)|goes to|link|landing/i.test(l.label));
  return h('section', null,
    sh.card.brief_url && !ctx.isClient ? h('div', { class: 'ps-h' }, h('a', { class: 'ps-link', href: sh.card.brief_url, target: '_blank', rel: 'noopener' }, 'Read the full brief')) : null,
    lines.length ? h('dl', { class: 'ps-brief' }, lines.slice(0, 8).map(l => [h('dt', { class: 'lx-cap' }, l.label), h('dd', null, l.text)]))
      : h('p', { class: 'ps-none' }, sh.thin ? 'The brief for this card is not in the sample file.' : 'No brief written yet.'));
}

function filesBlock(sh, state, ctx, ops) {
  const c = sh.card;
  const links = ctx.isClient ? null : h('div', { class: 'ps-links' },
    c.share ? h('a', { class: 'ps-link', href: c.share, target: '_blank', rel: 'noopener', title: 'The page the client sees, opens in a new tab' }, 'Open the client review link') : null,
    ctx.legacy ? h('a', { class: 'ps-link', href: cardLink(ctx, c.id), target: '_blank', rel: 'noopener', title: 'Opens old ' + APP_NAME + ' in a new tab' }, ops ? 'Upload a new version in old ' + APP_NAME : 'Open in old ' + APP_NAME) : null);
  const all = sh.files || [];
  if (!all.length) return h('section', null, h('p', { class: 'ps-none' }, 'No files on this card yet.'), links);
  const ad = (sh.ads || [])[state.ad];
  const mine = ad ? all.filter(f => f.kind === 'version' && (f.ad || '') === (ad.ad || '')) : [];
  const rows = (mine.length ? mine : all).slice().sort((a, b) => (b.version || 0) - (a.version || 0)).slice(0, 12);
  const newest = Math.max(...rows.map(f => f.version || 0));
  return h('section', null,
    h('div', { class: 'ps-h' }, h('span', null, mine.length ? `Ad ${ad.ad}: ${rows.length} of the card's ${all.length} files` : plural(all.length, 'file'))),
    h('div', { class: 'ps-files' }, rows.map(f => h('a', { class: f.kind === 'version' && (f.version || 0) < newest ? 'old' : '', href: f.download || f.url || null, target: '_blank', rel: 'noopener' },
      h('b', null, f.name || 'File'),
      h('span', { class: 'hide-sm' }, f.px || (f.video ? 'Video' : (f.mime || '').replace(/^image\//, '').toUpperCase())),
      h('span', null, kb(f.size)),
      f.kind !== 'version' ? statusDot('off', f.kind === 'inspo' ? 'Reference' : 'Attached') : (f.version || 0) < newest ? statusDot('off', 'Older version') : statusDot('good', 'Current')))),
    links);
}

function notesBlock(sh, photos, ops) {
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
    all.length ? h('div', { class: 'ps-notes' }, all.slice(-12).map(row)) : h('p', { class: 'ps-none' }, 'No notes yet.'),
    ops ? noteBox(ops) : null);
}

function body(sh, ctx, photos, today, state, redraw, ops) {
  const c = sh.card;
  const notes = (sh.comments || []).filter(x => !x.parent_id).length, files = (sh.files || []).length;
  const pick = state.tab || 'brief';
  const panel = pick === 'files' ? filesBlock(sh, state, ctx, ops) : pick === 'notes' ? notesBlock(sh, photos, ops) : briefBlock(sh, ctx);
  return [
    h('div', { class: 'ps-top' },
      h('div', { class: 'ps-kicker' }, h('span', null, (sh.brief && sh.brief.format) || c.format || ''),
        (sh.ads || []).length ? h('span', null, plural(sh.ads.length, 'ad')) : null, c.brand && ctx.view === 'agency' ? h('span', null, c.brand) : null),
      track(c)),
    adBlock(sh, state, redraw, ops),
    facts(sh, photos, today),
    ops ? h('div', { class: 'ps-team' }, h('span', { class: 'ps-team-h' }, 'Change this card', teamTag()), workBlock(sh, ops)) : null,
    h('div', { class: 'ps-tabs' }, tabs([{ id: 'brief', label: 'Brief' }, { id: 'files', label: 'Files', count: files || null }, { id: 'notes', label: 'Notes', count: notes || null }], pick, id => { state.tab = id; redraw(); })),
    panel,
    !ops && !sh.thin && !ctx.isClient ? h('p', { class: 'ps-none' }, 'You can look here. Changes are made by the team.') : null,
  ];
}

/** openCard(ctx, card, { photos, today, team, onChange }) : the sheet. card is one row of the board (id, num, title, board...).
    onChange runs after a write landed, so the page under the sheet can draw the card where it now is. */
export function openCard(ctx, card, { photos = {}, today, team = [], onChange } = {}) {
  css(); paCss();
  const box = h('div', { class: 'ps' }, skeleton('title'), skeleton('row', 4));
  const sh = sheet({ title: 'Card ' + (card.num || '') + ', ' + (card.title || 'Untitled card'), body: box, class: 'ps-sheet', onClose: () => { open = false; } });
  const state = { ad: 0, tab: 'brief' };
  let open = true, cur = null;
  const ops = canWrite(ctx) ? makeOps() : null;
  const paint = data => { if (!open || !data) return; cur = data; const redraw = () => paint(data); put(box, ...body(data, ctx, photos, today, state, redraw, ops && !data.thin ? ops : null).filter(Boolean)); };
  readCard(card, paint).then(paint, e => {
    put(box, empty({ title: 'This card could not load', text: (e && e.message) || 'Something went wrong.', action: oldLocus(ctx, { href: cardLink(ctx, card.id) }) }));
  });

  function makeOps() {
    const id = card.id;
    const me = (ctx.me && (ctx.me.name || ctx.me.email)) || 'You';
    /* the board row follows the card, so the page under the sheet can redraw it in place */
    const follow = d => {
      const c = (d && d.card) || {};
      Object.assign(card, { board: c.board || card.board, assignee: c.owner != null ? c.owner || '' : card.assignee, needs_client: c.needs_client || '', approved_by: c.approved_by || null });
    };
    const done = async say => {
      if (SAMPLE) { follow(cur); paint(cur); }
      else {
        try { const d = await api('/api/production/card?id=' + encodeURIComponent(id), { worker: 'ah' }); keepCard(id, d); follow(d); paint(d); }
        catch { /* the write landed; the sheet catches up on the next open */ }
        if (say) toast(say);
      }
      if (onChange) { try { onChange(card); } catch { /* the page redraws on its next read */ } }
    };
    const clientNote = () => (cur && cur.card && cur.card.needs_client ? 'It is waiting on the client. Approving here answers for them and takes it off their list. ' : '');
    const allApproved = () => (cur.ads || []).length > 0 && cur.ads.every(a => a.status === 'approved');
    const simApprove = () => { if (allApproved()) Object.assign(cur.card, { board: 'ready', approved_by: me, needs_client: '' }); };
    return {
      team,
      async move(to, btn) {
        if (btn) btn.disabled = true;
        try {
          const r = await write('/api/production/move', { id, to }, () => { cur.card.board = to; return { ok: true, to }; });
          await done(`Moved to ${MOVE_LABEL[to] || to}.` + (r.asana && r.asana.moved ? ' Moved in Asana too.' : ''));
        } catch (e) { toast(why(e), { tone: 'bad', ms: 6000 }); if (btn && btn.isConnected) btn.disabled = false; }
      },
      async assign(name, sel) {
        if (sel) sel.disabled = true;
        try {
          const r = await write('/api/production/field', { id, owner: name }, () => { cur.card.owner = name; cur.card.assignee = name; return { ok: true }; });
          const asanaWhy = r.asana && !r.asana.written && r.asana.why && !/mirror is off|no Asana task/.test(r.asana.why) ? ' Asana: ' + r.asana.why : '';
          await done((name ? `${name} has it now.` : 'Nobody has it now.') + asanaWhy);
        } catch (e) { toast(why(e), { tone: 'bad', ms: 6000 }); paint(cur); }
      },
      async send(what) {
        const c = cur.card;
        const ok = await confirm(what
          ? { title: what === 'idea' ? 'Send the idea to the client?' : 'Send the ads to the client?',
              text: what === 'idea' ? 'It goes on their Needs you list for a yes or changes, due in 3 working days.' : 'The newest version of each ad goes on their Needs you list for notes, a yes or changes, due in 3 working days.',
              lines: [{ label: 'Waiting on', before: c.needs_client ? 'The client' : c.owner || 'The team', after: 'The client' }], ok: 'Send it' }
          : { title: 'Take it back from the client?', text: 'It leaves their Needs you list.', lines: [{ label: 'Waiting on', before: 'The client', after: c.owner || 'The team' }], ok: 'Take it back' });
        if (!ok) return;
        await write('/api/production/send', { id, what }, () => {
          Object.assign(cur.card, { needs_client: what, client_sent_at: what ? new Date().toISOString() : null });
          if (what === 'ad' && cur.card.board !== 'review') cur.card.board = 'review';
          return { ok: true, needs_client: what };
        });
        await done(what ? 'Sent. It is waiting on the client.' : 'Taken back from the client.');
      },
      async decide(ad, ok) {
        const reset = ok === null;
        if (ok === true && cur.card.needs_client && !(await confirm({ title: 'Approve for the client?', text: clientNote() + 'Use this only when the client said yes some other way.', ok: 'Approve' }))) return;
        const r = await write('/api/production/decide', { id, file_id: ad.file_id, ok: ok === true, reset, body: '' }, () => {
          const a = (cur.ads || []).find(x => x.file_id === ad.file_id);
          if (a) Object.assign(a, { status: reset ? 'review' : 'approved', by: reset ? null : me });
          if (!reset) simApprove(); else if (cur.card.board === 'ready') cur.card.board = 'review';
          return { ok: true, all_approved: !reset && allApproved() };
        });
        await done(reset ? 'Open for review again.' : r.all_approved ? 'Every ad is approved. The card moved to Ready.' : 'Approved.');
      },
      askChanges(ad) {
        return new Promise(resolve => {
          const ta = h('textarea', { class: 'lx-input ps-ta', rows: '4', placeholder: 'Say what needs to change', 'aria-label': 'What should change' });
          let s2 = null;
          const sendIt = act('Send it back', async () => {
            const text = ta.value.trim();
            if (!text) { ta.focus(); toast('Say what needs to change.'); return; }
            await write('/api/production/decide', { id, file_id: ad.file_id, ok: false, reset: false, body: text }, () => {
              const a = (cur.ads || []).find(x => x.file_id === ad.file_id);
              if (a) Object.assign(a, { status: 'changes', by: me });
              (cur.comments = cur.comments || []).push({ id: 'tmp' + Date.now(), who: me, kind: 'change_request', body: text, file_id: ad.file_id, created_at: new Date().toISOString(), parent_id: null });
              cur.card.board = 'making';
              return { ok: true };
            });
            s2.close();
            await done('Sent back to be fixed. The card moved to Making.');
          }, { primary: true });
          s2 = sheet({ title: 'Ask for changes on ' + (ad.ad ? 'ad ' + ad.ad : 'this ad'), side: 'center', onClose: () => resolve(),
            body: h('div', { class: 'pa-confirm' }, h('p', null, 'The card goes back to Making and whoever has it is told.'), ta,
              h('div', { class: 'pa-row' }, button('Cancel', { large: true, class: 'pa-btn', onclick: () => s2.close() }), sendIt)) });
          setTimeout(() => ta.focus(), 50);
        });
      },
      async approveAll(n) {
        if (!(await confirm({ title: `Approve all ${n} ads?`, text: clientNote() + 'Every ad still waiting is approved and the card moves to Ready.', ok: 'Approve all' }))) return;
        await write('/api/production/decide', { id, all: true }, () => {
          (cur.ads || []).forEach(a => { if (a.status === 'review' || !a.status) Object.assign(a, { status: 'approved', by: me }); });
          simApprove();
          return { ok: true, all_approved: true };
        });
        await done('Every ad is approved. The card moved to Ready.');
      },
      async note(text) {
        const r = await write('/api/production/comment', { id, body: text }, () => {
          (cur.comments = cur.comments || []).push({ id: 'tmp' + Date.now(), who: me, kind: 'comment', body: text, created_at: new Date().toISOString(), parent_id: null });
          return { ok: true, mentions: [] };
        });
        const told = (r.mentions || []).filter(m => m.sent).map(m => m.name);
        await done(r.mentions && r.mentions.length ? (told.length ? `Note posted. ${told.join(', ')} told in Slack.` : 'Note posted. Slack did not find the people named.') : 'Note posted.');
      },
      async share() {
        const r = await write('/api/production/share', { id }, () => ({ ok: true, url: '' }));
        if (!r.url) return;
        try { await navigator.clipboard.writeText(r.url); toast('Client link copied. It opens with no login.'); }
        catch { toast('The link: ' + r.url, { ms: 9000 }); }
      },
      load() {
        const c = cur.card;
        openLoad(ctx, { act: c.act_id || card.act_id || (ctx.brand && ctx.brand.id), card: { id, num: c.num || card.num, title: c.title || card.title, format: c.format || card.format,
          files: (cur.ads || []).length || +card.versions || 0, thumb: card.thumb || null, art: c.art || card.art || null }, onDone: () => done('') });
      },
    };
  }
  return sh;
}

const CSS = `
.ps{display:grid;gap:20px;min-width:0}
.ps-team{display:grid;gap:8px}
.ps-team-h{display:flex;align-items:center;gap:8px;font-size:12.5px;font-weight:600;color:var(--muted)}
.ps-tabs .lx-tabs{margin:0}
.ps-links{display:flex;gap:16px;flex-wrap:wrap;padding-top:6px}
.ps section{display:grid;gap:12px;min-width:0}
.ps-top{display:grid;gap:10px}
.ps-kicker{display:flex;gap:10px;flex-wrap:wrap;font-size:12.5px;color:var(--muted)}
.ps-kicker b{color:var(--ink)}
.ps-top h2{font-size:var(--num-m);font-weight:600;letter-spacing:-.025em;line-height:1.2}
.ps-track{display:grid;grid-template-columns:repeat(8,minmax(0,1fr));gap:4px;list-style:none;margin:0;padding:0}
.ps-track li{padding-top:8px;border-top:3px solid var(--line-strong);font-size:11.5px;line-height:1.25;color:var(--faint);overflow-wrap:anywhere}
.ps-track li.done{border-color:var(--slate);color:var(--muted)}
.ps-track li.now{border-color:var(--ink);color:var(--ink);font-weight:600}
.ps-facts{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;padding:12px 16px;border-radius:14px;background:var(--band)}
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
.ps-strip button{display:grid;gap:3px;padding:8px 10px;border:0;border-radius:10px;background:var(--surface);color:var(--ink);box-shadow:inset 0 0 0 1px var(--line-strong);text-align:left;cursor:pointer;font-size:13px}
.ps-strip button.on{box-shadow:inset 0 0 0 2px var(--ink)}
.ps-pin{position:absolute;width:22px;height:22px;margin:-11px 0 0 -11px;border-radius:50%;background:var(--ink);color:#fff;font-size:11.5px;font-weight:700;display:grid;place-items:center;box-shadow:0 0 0 2px #fff}
.ps-h{display:flex;align-items:baseline;gap:10px;padding-bottom:8px;border-bottom:1px solid var(--line)}
.ps-h h3{font-size:15px;font-weight:600}
.ps-h span{font-size:12.5px;color:var(--muted)}
.ps-h a{margin-left:auto}
.ps-link{font-size:12.5px;font-weight:500;color:var(--ink);text-decoration:underline;text-underline-offset:3px}
.ps-none{font-size:13px;color:var(--muted)}
.ps-brief{display:grid;grid-template-columns:96px minmax(0,1fr);gap:8px 14px;margin:0}
.ps-brief dt{padding-top:3px;white-space:normal}
.ps-brief dd{margin:0;font-size:13.5px;overflow-wrap:anywhere}
.ps-files{display:grid}
.ps-files a{display:grid;grid-template-columns:minmax(0,1fr) 110px 70px 120px;gap:12px;align-items:center;padding:9px 0;border-top:1px solid var(--line);font-size:13px;color:var(--ink-2);text-decoration:none}
.ps-files a:first-child{border-top:0}
.ps-files b{font-weight:500;color:var(--ink);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
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
.ps-do{display:grid;gap:14px;padding:16px 18px;border-radius:14px;border:1px solid var(--line-strong)}
.ps-do-row{display:grid;grid-template-columns:96px minmax(0,1fr);gap:12px;align-items:center}
.ps-moves{display:flex;gap:6px;flex-wrap:wrap}
.ps-moves button{min-height:38px;padding:0 12px;border:0;border-radius:999px;background:var(--bg-sunk);color:var(--ink-2);font:550 13px var(--sans);cursor:pointer}
.ps-moves button.on{background:var(--ink);color:#fff;cursor:default}
.ps-moves button:disabled:not(.on){opacity:.5}
.ps-sel{max-width:280px;appearance:auto}
.ps-acts{display:flex;gap:8px;flex-wrap:wrap;align-items:center}
.ps-ta{height:auto;min-height:84px;padding:10px 14px;line-height:1.45;resize:vertical;font:500 14px var(--sans)}
.ps-add{display:grid;gap:8px;padding-top:6px}
.ps-foot{display:flex;gap:10px;align-items:center;flex-wrap:wrap;padding-top:18px;border-top:1px solid var(--line)}
.ps-foot p{flex:1 1 100%;font-size:12.5px;color:var(--muted)}
@media (max-width:759px){
  .ps-track{grid-template-columns:repeat(4,minmax(0,1fr));row-gap:10px;margin-right:0}
  .ps-facts{grid-template-columns:1fr 1fr}
  .ps-ad{grid-template-columns:minmax(0,1fr)}
  .ps-ad-pic{max-width:260px}
  .ps-brief{grid-template-columns:minmax(0,1fr);gap:2px}
  .ps-brief dd{margin-bottom:8px}
  .ps-files a{grid-template-columns:minmax(0,1fr) auto auto}
  .ps-files .hide-sm{display:none}
  .ps-foot .lx-btn{flex:1 1 100%}
  .ps-do{padding:14px}
  .ps-do-row{grid-template-columns:minmax(0,1fr);gap:6px}
  .ps-moves button{min-height:44px;flex:1 1 auto}
  .ps-sel{max-width:none}
  .ps-acts .lx-btn{flex:1 1 100%;min-height:44px}
}
`;
const css = () => addStyles('ps-css', CSS);

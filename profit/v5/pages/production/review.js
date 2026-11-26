/* The client's review page. "Which of these ads are good to go?"
   What waits on the client, one ad at a time, large, with the words that run with it and the notes so far.
   Approve and Request changes sit in a bar that never leaves the screen. For a client signed in, one tap saves the
   answer for the ad on screen (account-health POST /api/production/decide { id, file_id, ok, body }) and moves to the
   next ad waiting. The team's "See as client" keeps the old link buttons: a team press would answer as the team and
   clear the client's flag. Sample mode changes the ad on the page only.
   Shown for Production > Board when a client is signed in or "See as client" is on.
   Data: GET /api/production?act= (a client login gets its own Needs you and Coming up; the team's answer is
   the whole board and the same two lists are read out of it), then GET /api/production/card?id= for up to
   three waiting cards. Both on the account-health worker. */

import { h, statusDot, button, empty, em, card, relativeTime, skeleton, sheet, toast } from '../../kit.js';
import { put, css, day, daysFrom, todayOf, picture, who, cardLink, plural, lucide } from './_ui.js';
import { briefLines, adState, fileOf } from './_sheet.js';
import { addStyles } from '../../kit.js';

const STAGE = { brief: 'Idea', making: 'Making', review: 'Making', ready: 'Ready', scheduled: 'Ready', live: 'Live' };

/** The two lists, from either answer of GET /api/production. */
export function lists(b) {
  if (!b) return { needs: [], coming: [] };
  if (b.client || !b.cards) return { needs: b.needs || [], coming: b.coming || [] };
  const row = c => ({ id: c.id, num: c.num, title: c.title, format: c.format, thumb: c.thumb, art: c.art, launch: c.launch_on || c.due || (c.board === 'live' ? c.since : '') });
  const open = b.cards.filter(c => STAGE[c.board]);
  return {
    needs: open.filter(c => c.needs_client).map(c => ({ ...row(c), what: c.needs_client, due: c.client_due || c.due || '' })),
    coming: open.filter(c => !c.needs_client).map(c => ({ ...row(c), stage: STAGE[c.board] }))
      .sort((a, z) => (a.stage === 'Live') - (z.stage === 'Live') || String(a.launch || '9').localeCompare(String(z.launch || '9'))),
  };
}
async function shape(b, readSheet) {
  const { needs, coming } = lists(b);
  const sheets = {};
  await Promise.all(needs.slice(0, 3).map(async n => { try { sheets[n.id] = await readSheet(n.id); } catch { /* the list still draws */ } }));
  return { review: true, today: b.today || null, brand: b.brand || '', needs, coming, sheets, board: b.cards ? b : null };
}

/* ---------- parts ---------- */
function progress(ads, at, onPick) {
  const n = k => ads.filter(a => a.status === k).length;
  const done = n('approved') + n('changes');
  return h('div', { class: 'rv-prog' },
    h('div', { class: 'rv-prog-h' }, h('b', null, `${done} of ${ads.length} reviewed`),
      h('span', null, statusDot('good', n('approved') + ' approved'), statusDot('warn', n('changes') + ' with changes'), statusDot('off', (ads.length - done) + ' to go'))),
    h('div', { class: 'rv-segs' }, ads.map((a, i) => h('button', { type: 'button', class: a.status + (i === at ? ' on' : ''), 'aria-label': 'Ad ' + a.ad, onclick: () => onPick(i) }))));
}

function listOf(sh, at, onPick) {
  return h('aside', { class: 'rv-list' },
    h('div', { class: 'rv-list-h' }, 'All ads', h('span', null, sh.ads.length)),
    sh.ads.map((a, i) => {
      const f = fileOf(sh, a) || {}, st = i === at ? ['info', 'Looking now'] : adState(a);
      return h('button', { type: 'button', class: i === at ? 'on' : '', onclick: () => onPick(i) },
        picture({ src: f.thumb, art: f.art, video: !!f.video, ratio: '1/1' }),
        h('div', null, h('b', null, 'Ad ' + a.ad), statusDot(st[0], st[1])),
        h('small', null, 'v' + (a.version || 1)));
    }));
}

function stage(sh, at, onPick) {
  const ad = sh.ads[at], f = fileOf(sh, ad) || {};
  const notes = (sh.comments || []).filter(c => c.file_id === f.id && !c.parent_id && (c.kind === 'note' || c.kind === 'change_request'));
  const pic = picture({ src: f.view || (f.video ? f.thumb : f.url), art: f.art, video: !!f.video, ratio: f.video ? '9/16' : '4/5', alt: 'Ad ' + ad.ad });
  notes.forEach((c, i) => { const p = c.shape; if (p && isFinite(+p.x) && isFinite(+p.y)) pic.append(h('span', { class: 'ps-pin', style: { left: p.x * 100 + '%', top: p.y * 100 + '%' } }, i + 1)); });
  const nav = (dir, label) => h('button', { type: 'button', class: 'rv-nav ' + (dir < 0 ? 'prev' : 'next'), 'aria-label': label, disabled: at + dir < 0 || at + dir >= sh.ads.length, onclick: () => onPick(at + dir) }, lucide('chevron'));
  return h('section', { class: 'rv-stage' },
    h('div', { class: 'rv-stage-h' }, h('b', null, 'Ad ' + ad.ad), h('span', null, `${at + 1} of ${sh.ads.length}`)),
    h('div', { class: 'rv-canvas' }, nav(-1, 'The ad before'), h('div', { class: 'rv-frame' + (f.video ? ' tall' : '') }, pic), nav(1, 'The next ad')),
    h('div', { class: 'rv-stage-f' }, h('span', null, [f.px, f.name].filter(Boolean).join(', ') || 'The newest version'),
      f.download || f.url ? h('a', { class: 'ps-link', href: f.download || f.url, target: '_blank', rel: 'noopener' }, 'Download original') : null));
}

function side(sh, at, photos) {
  const ad = sh.ads[at], f = fileOf(sh, ad) || {};
  const lines = briefLines(sh.brief && sh.brief.html);
  const word = (label, re) => { const l = lines.find(x => re.test(x.label)); return l ? h('div', null, h('span', { class: 'lx-cap' }, label), h('p', null, l.text)) : null; };
  const words = [word('Headline', /headline/i), word('Text', /^(text|primary|copy)/i), word('Goes to', /(goes to|link|landing)/i)].filter(Boolean);
  const notes = (sh.comments || []).filter(c => c.file_id === f.id && !c.parent_id && (c.kind === 'note' || c.kind === 'change_request'));
  const replies = id => (sh.comments || []).filter(c => c.parent_id === id);
  const sizes = (sh.brief && sh.brief.sizes) || [];
  return h('aside', { class: 'rv-side' },
    h('div', { class: 'rv-box' },
      h('div', { class: 'rv-kv' }, h('span', { class: 'lx-cap' }, 'Version'), h('b', null, 'v' + (ad.version || 1) + (ad.versions > 1 ? ' of ' + ad.versions : ''))),
      sizes.length ? h('div', { class: 'rv-kv' }, h('span', { class: 'lx-cap' }, 'Sizes'), h('b', null, sizes.join(' and '))) : null,
      sizes.length > 1 ? h('p', { class: 'rv-quiet' }, 'One answer covers every size.') : null),
    words.length ? h('div', { class: 'rv-box' }, h('h3', null, 'The words that run with it'), words) : null,
    h('div', { class: 'rv-box' },
      h('h3', null, 'Notes', h('span', null, notes.length ? `${notes.length}, ${notes.filter(c => !c.fixed).length} still open` : 'none yet')),
      notes.map((c, i) => h('div', { class: 'rv-note' }, h('span', { class: 'rv-n' + (c.fixed ? ' ok' : '') }, i + 1),
        h('div', null,
          h('div', { class: 'rv-note-h' }, who(c.who, photos, 20), h('b', null, c.who || 'Someone'), h('span', null, c.created_at ? relativeTime(c.created_at) : '')),
          h('p', null, c.body),
          replies(c.id).map(r => h('p', { class: 'ps-reply' }, h('b', null, r.who || 'Someone'), ' ', r.body)),
          statusDot(c.fixed ? 'good' : 'warn', c.fixed ? 'Fixed' : 'Open'))))));
}

function comingUp(coming, today) {
  if (!coming.length) return null;
  return card({ title: 'Coming up', note: plural(coming.length, 'card') },
    h('div', { class: 'pd-list' }, coming.slice(0, 8).map(c => h('div', { class: 'pd-line', style: { cursor: 'default' } },
      h('span', { class: 'n' }, c.num),
      h('span', { class: 't' }, h('b', null, c.title), h('small', null, c.format || '')),
      h('span', { class: 'w' }, statusDot(c.stage === 'Live' ? 'good' : c.stage === 'Ready' ? 'info' : 'off', c.stage)),
      h('span', { class: 'd' }, !c.launch ? 'No date' : c.stage === 'Live' ? 'Since ' + day(c.launch) : (c.launch >= today ? 'Goes live ' : 'Planned for ') + day(c.launch))))));
}

const CSS = `
.rv-head{display:flex;align-items:flex-end;gap:16px 28px;flex-wrap:wrap}
.rv-head h2{font-size:20px;font-weight:600;letter-spacing:-.02em}
.rv-head p{color:var(--muted);font-size:13.5px;margin-top:2px}
.rv-prog{margin-left:auto;display:grid;gap:8px;min-width:min(420px,100%)}
.rv-prog-h{display:flex;align-items:center;gap:8px 16px;flex-wrap:wrap}
.rv-prog-h b{font-size:15px;font-weight:600}
.rv-prog-h>span{display:flex;gap:14px;flex-wrap:wrap}
.rv-segs{display:flex;gap:4px}
.rv-segs button{flex:1;height:6px;padding:0;border:0;border-radius:999px;background:var(--line-strong);cursor:pointer}
.rv-segs .approved{background:var(--good)}
.rv-segs .changes{background:var(--watch)}
.rv-segs .on{box-shadow:0 0 0 2px var(--surface),0 0 0 3.500px var(--ink)}
.rv{display:grid;grid-template-columns:216px minmax(0,1fr) 320px;gap:18px;align-items:start}
.rv-list,.rv-stage,.rv-side{background:var(--surface);border-radius:18px;box-shadow:var(--sh-1);min-width:0;overflow:hidden}
.rv-list-h{display:flex;justify-content:space-between;padding:14px 16px;font-weight:600;font-size:13.5px}
.rv-list-h span{color:var(--muted);font-weight:500}
.rv-list button{display:grid;grid-template-columns:40px minmax(0,1fr) auto;gap:12px;align-items:center;width:100%;padding:10px 16px;border:0;border-top:1px solid var(--line);background:none;text-align:left;cursor:pointer;font:inherit}
.rv-list button.on{background:var(--surface-2);box-shadow:inset 3px 0 0 var(--ink)}
.rv-list button b{display:block;font-size:13.5px;font-weight:600}
.rv-list button small{font-size:12px;color:var(--faint)}
.rv-list .pd-pic{border-radius:8px}
.rv-list .pd-admock{padding:4px}
.rv-list .pd-admock>:not(svg){display:none}
.rv-stage-h,.rv-stage-f{display:flex;align-items:center;gap:10px;padding:14px 18px;font-size:13px;color:var(--muted)}
.rv-stage-h b{color:var(--ink);font-size:15px}
.rv-stage-f a{margin-left:auto;white-space:nowrap}
.rv-stage-f span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0}
.rv-canvas{display:grid;grid-template-columns:44px minmax(0,1fr) 44px;gap:12px;align-items:center;padding:22px 14px;background:var(--band)}
.rv-frame{width:100%;max-width:470px;margin:0 auto}
.rv-frame.tall{max-width:300px}
.rv-frame .pd-pic{border-radius:6px;box-shadow:var(--sh-2)}
.rv-nav{width:38px;height:38px;border:0;border-radius:11px;background:var(--surface);color:var(--ink);box-shadow:var(--sh-1);display:grid;place-items:center;cursor:pointer;justify-self:center}
.rv-nav:disabled{opacity:.35;cursor:default}
.rv-nav.prev .lx-ic{transform:rotate(90deg)}
.rv-nav.next .lx-ic{transform:rotate(-90deg)}
.rv-box{display:grid;gap:12px;padding:18px 20px;border-top:1px solid var(--line)}
.rv-box:first-child{border-top:0}
.rv-box h3{display:flex;align-items:baseline;gap:8px;font-size:14px;font-weight:600}
.rv-box h3 span{font-size:12.5px;font-weight:400;color:var(--muted)}
.rv-box p{font-size:13.5px;overflow-wrap:anywhere}
.rv-kv{display:flex;align-items:center;gap:12px}
.rv-kv .lx-cap{width:62px}
.rv-quiet{color:var(--muted);font-size:12.5px!important}
.rv-note{display:grid;grid-template-columns:22px minmax(0,1fr);gap:10px}
.rv-note>div{display:grid;gap:5px;min-width:0}
.rv-note-h{display:flex;align-items:center;gap:7px;font-size:13px;flex-wrap:wrap}
.rv-note-h span{color:var(--muted);font-size:12px}
.rv-n{width:22px;height:22px;border-radius:50%;background:var(--ink);color:var(--surface);font-size:11.5px;font-weight:700;display:grid;place-items:center}
.rv-n.ok{background:var(--surface);color:var(--good);box-shadow:inset 0 0 0 1.500px var(--good)}
.rv-bar{position:sticky;bottom:16px;z-index:5;display:flex;align-items:center;gap:12px;padding:12px 14px 12px 20px;border-radius:18px;background:var(--surface);box-shadow:var(--sh-3)}
.rv-bar p{font-size:13px;color:var(--muted);min-width:0}
.rv-bar p b{color:var(--ink)}
.rv-bar .lx-btn{white-space:nowrap}
.rv-bar .lx-btn.primary{min-width:150px}
.rv-bar .rv-short{display:none}
.rv-ask{display:grid;gap:12px}
.rv-ask .lx-input{width:100%;font-size:15px}
@media (max-width:1040px){
  .rv{grid-template-columns:minmax(0,1fr) 300px}
  .rv-list{display:none}
}
@media (max-width:759px){
  .rv{grid-template-columns:minmax(0,1fr)}
  .rv-prog{min-width:100%}
  .rv-canvas{grid-template-columns:minmax(0,1fr);padding:14px}
  .rv-nav{display:none}
  .rv-bar{bottom:calc(var(--tabbar-h) + env(safe-area-inset-bottom,0px) + 10px);padding:10px;gap:8px}
  .rv-bar p{display:none}
  .rv-bar .lx-btn{flex:1;height:48px;font-size:15px;min-width:0!important;justify-content:center}
}
@media (max-width:399px){
  .rv-bar .rv-long{display:none}
  .rv-bar .rv-short{display:inline}
}
`;

export default {
  title: () => ['Which of these ads ', em('are good to go?')],
  eyebrow: (ctx, data) => { const n = data && data.needs ? data.needs.length : 0; return n ? plural(n, 'card') + ' waiting on you' : 'Ad review'; },
  ranges: false,

  async load(ctx) {
    const b = await ctx.api('/api/production?act=' + encodeURIComponent(ctx.brand.id), { worker: 'ah', signal: ctx.signal });
    return shape(b, id => ctx.api('/api/production/card?id=' + encodeURIComponent(id), { worker: 'ah', signal: ctx.signal }));
  },
  async sample(ctx) {
    const [b, sheets] = await Promise.all([ctx.fixture('board.json'), ctx.fixture('card.json')]);
    return shape(b, async id => { if (!sheets[id]) throw new Error('none'); return sheets[id]; });
  },
  skeleton(el) { put(el, skeleton('chart'), skeleton('row', 4)); },

  render(el, data, ctx) {
    css(); addStyles('rv-css', CSS);
    if (data && !data.review) data = { review: true, today: data.today, ...lists(data), sheets: {} };
    data = data || { needs: [], coming: [], sheets: {} };
    const today = todayOf(data), photos = {};
    const ready = data.needs.filter(n => data.sheets[n.id] && (data.sheets[n.id].ads || []).length);
    if (!ready.length) {
      const waiting = data.needs.length;
      put(el,
        empty(waiting
          ? { title: plural(waiting, 'card') + ' waiting on you', text: 'The ads are still loading into the card. Open the review link to see them.', action: button('Open the review', { primary: true, large: true, href: cardLink(ctx, data.needs[0].id), target: '_blank' }) }
          : { title: 'Nothing is waiting on you', text: 'When ads are ready for your yes, they show here, one at a time, with Approve always in reach.' }),
        comingUp(data.coming, today));
      return;
    }
    const st = { card: ready[0].id, ad: -1 };
    const root = h('div', { style: { display: 'grid', gap: 'var(--sp-6)' } });
    /* One tap answers for a real client login (and in sample mode); the team's preview keeps the link. */
    const oneTap = ctx.isClient && (ctx.sample || !ctx.asClient);
    let busy = false;
    const nextWaiting = ads => { const after = ads.findIndex((a, i) => i > st.ad && a.status === 'review'); return after >= 0 ? after : Math.max(0, ads.findIndex(a => a.status === 'review')); };
    async function answer(need, sh, ad, ok, note) {
      if (busy) return false;
      busy = true; draw();
      try {
        let all = false;
        if (ctx.sample) { ad.status = ok ? 'approved' : 'changes'; toast('Sample: nothing saved'); }
        else {
          const r = await ctx.api('/api/production/decide', { worker: 'ah', method: 'POST', body: { id: need.id, file_id: ad.file_id, ok, ...(ok ? {} : { body: note }) } });
          /* An idea card answers for the whole idea and the server sends no ads back: every ad on it takes the answer. */
          const idea = need.what === 'idea' || (sh.card && sh.card.needs_client === 'idea');
          if (r && Array.isArray(r.ads) && r.ads.length) sh.ads = r.ads;
          else if (idea) sh.ads.forEach(a => { a.status = ok ? 'approved' : 'changes'; });
          else ad.status = ok ? 'approved' : 'changes';
          all = !!(r && r.all_approved);
          toast(ok ? (all ? 'All approved. Thank you.' : 'Approved') : 'Sent to the team');
        }
        if (!ok && note) (sh.comments = sh.comments || []).push({ id: 'local' + Date.now(), file_id: ad.file_id, kind: 'change_request', body: note, who: 'You', created_at: new Date().toISOString() });
        busy = false;
        st.ad = nextWaiting(sh.ads);
        draw();
        return true;
      } catch (e) {
        busy = false; draw();
        toast('Not saved: ' + ((e && e.message) || 'no answer from the server.'), { tone: 'bad', ms: 6000 });
        return false;
      }
    }
    function askChanges(need, sh, ad) {
      const box = h('textarea', { class: 'lx-input', rows: 5, placeholder: 'What should change on this ad?', 'aria-label': 'What should change' });
      const send = button('Send', { primary: true, large: true, disabled: true });
      box.addEventListener('input', () => { send.disabled = !box.value.trim(); });
      const panel = sheet({ title: 'Ask for changes on Ad ' + ad.ad, body: h('div', { class: 'rv-ask' }, box, send) });
      send.addEventListener('click', async () => {
        const note = box.value.trim();
        if (!note) return;
        send.disabled = true;
        if (await answer(need, sh, ad, false, note)) panel.close(); else send.disabled = false;
      });
      setTimeout(() => box.focus(), 50);
    }
    const draw = () => {
      const need = ready.find(n => n.id === st.card) || ready[0], sh = data.sheets[need.id], ads = sh.ads;
      if (st.ad < 0 || st.ad >= ads.length) st.ad = Math.max(0, ads.findIndex(a => a.status === 'review'));
      const pick = i => { st.ad = i; draw(); };
      const ad = ads[st.ad], left = ads.filter(a => a.status === 'review').length;
      const link = sh.card.share || cardLink(ctx, need.id);
      const dueIn = need.due ? daysFrom(today, need.due) : null;
      const say = [h('b', null, 'Ad ' + ad.ad), ad.status === 'approved' ? ' is approved.' : ad.status === 'changes' ? ' has changes asked.' : ` is waiting. ${left} of ${ads.length} to go.`];
      put(root,
        h('div', { class: 'rv-head' },
          h('div', null,
            ready.length > 1 ? h('div', { class: 'pd-chips', style: { marginBottom: '10px' } }, ready.map(n => h('button', { type: 'button', class: n.id === need.id ? 'on' : '', onclick: () => { st.card = n.id; st.ad = -1; draw(); } }, n.title))) : null,
            h('h2', null, sh.card.title || need.title),
            h('p', null, [plural(ads.length, 'ad') + '.', need.launch ? ` Goes live ${day(need.launch, true)}.` : '', need.due ? ` Please look by ${day(need.due, true)}${dueIn != null && dueIn <= 1 ? (dueIn < 0 ? ', now overdue' : dueIn === 0 ? ', today' : ', tomorrow') : ''}.` : ''])),
          progress(ads, st.ad, pick)),
        h('div', { class: 'rv' }, listOf(sh, st.ad, pick), stage(sh, st.ad, pick), side(sh, st.ad, photos)),
        h('div', { class: 'rv-bar' },
          h('p', null, say, oneTap ? ' One tap saves your answer.' : ' The answer is saved on the review link.'),
          h('span', { class: 'lx-sp' }),
          oneTap ? button(h('span', null, h('span', { class: 'rv-long' }, 'Request changes'), h('span', { class: 'rv-short' }, 'Changes')), { large: true, disabled: busy, onclick: () => askChanges(need, sh, ad) })
            : button('Request changes', { large: true, href: link, target: '_blank' }),
          oneTap ? button(ad.status === 'approved' ? 'Approved' : 'Approve', { primary: true, large: true, iconLeft: 'check', disabled: busy || ad.status === 'approved', onclick: () => answer(need, sh, ad, true, '') })
            : button('Approve', { primary: true, large: true, iconLeft: 'check', href: link, target: '_blank' })),
        comingUp(data.coming, today));
    };
    draw();
    put(el, root);
  },
};

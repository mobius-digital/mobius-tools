/* "Waiting on your yes": one list of everything that waits on a person, each row labeled with its kind and its action.
   Used by the brand Home (one brand) and Agency > Today (every brand). Team only; a client gets null (Home keeps the
   client's own "Needs you" rows from automations/_notices.js).

   Where the rows come from (all read only, nothing new on the workers):
     bell.js loadWaiting()   the bell's waiting list, one read per kind, kept 5 minutes and shared with the bell:
                               ad calls        account-health /api/buyer-list?act=all&ads=0   (Meta rows not decided)
                               War Room        account-health /api/standing                    (budget changes not approved)
                               client updates  account-health /api/briefs?act=all, /api/reports?act=all (drafts not sent)
                               ad review, load account-health /api/production?act=all          (cards in Review, cards Ready)
                               requests        account-health /api/requests?act=all            (open with the team)
     bell.js readNotices()   account-health /api/notices: rows an automation left (alerts, suggested changes, held client
                             messages, notes). Their buttons are automations/_auto.js noticeActions (POST /api/notices/done).
     google/_g.js loadSuggestions()  account-health /api/leaks?act&days=30, Google rows only. Brand Home, real mode, only
                             when the page passed no Google count; read after the card draws.
   On a brand Home the ad calls count is the brand's own buyer list (the page already read /api/buyer-list?act=<brand>).
   A row that covers several brands (client updates, the War Room check-in, requests) shows on a brand Home when its
   act_ids include the brand, or when it names only this brand. Sample mode reads the same fixtures the bell does.

   Counts: every row carries n, the number of things it stands for (4 ad calls is one row with n 4). The kind chips and
   the header add up n, so a chip never disagrees with the row under it. The chips filter the list. */

import { h, card, button, addStyles, staleStamp, relativeTime } from '../../kit.js';
import { loadWaiting, readNotices, forgetWaiting, forgetNotices } from '../../bell.js';

/* kind -> [label, order]. Order puts money at risk first, then the calls that move money, then the rest. */
const KIND = {
  alert: ['Alert', 0], war: ['War Room', 1], calls: ['Meta ad calls', 2], google: ['Google suggestions', 3],
  send: ['Client update', 4], release: ['Client message', 5], review: ['Ad review', 6], load: ['Ads to load', 7],
  requests: ['Client request', 8], proposal: ['Suggested change', 9], tell: ['Notice', 10],
};
const kindOf = k => KIND[k] || ['Notice', 11];
const many = (n, one, more) => n + ' ' + (n === 1 ? one : more || one + 's');

const CSS = `
.hy-list{display:grid}
.hy-row{display:grid;grid-template-columns:132px minmax(0,1fr) auto;gap:6px 16px;align-items:center;padding:12px 28px;border-top:1px solid var(--line);min-width:0}
.hy-row:first-child{border-top:0}
.hy-row.go{cursor:pointer}
.hy-row.go:hover{background:var(--row-hover)}
.hy-k{justify-self:start;display:inline-flex;align-items:center;height:22px;padding:0 8px;border-radius:var(--r-chip,6px);background:var(--bg-sunk);color:var(--ink-2);font-size:12px;font-weight:600;white-space:nowrap}
.hy-k.alert{background:var(--bad-bg,#FBE9E7);color:var(--bad)}
.hy-k.war,.hy-k.calls{background:var(--warn-bg);color:var(--warn)}
.hy-t{display:grid;gap:2px;min-width:0}
.hy-t b{font-size:var(--fs-card,14px);font-weight:600;line-height:1.35;overflow-wrap:anywhere}
.hy-t p{margin:0;font-size:13px;line-height:1.45;color:var(--ink-2);white-space:pre-line;overflow-wrap:anywhere}
.hy-t span{font-size:var(--fs-small,12.5px);color:var(--muted)}
.hy-a{display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end}
.hy-a .lx-btn{white-space:nowrap}
.hy-none{margin:0;padding:6px 28px 22px;color:var(--muted);font-size:13.5px}
.hy-more{padding:10px 28px 18px}
.hy-sum{display:flex;flex-wrap:wrap;gap:6px;padding:0 28px 12px}
.hy-f{display:inline-flex;align-items:center;gap:6px;height:26px;padding:0 10px;border:1px solid var(--line);border-radius:var(--r-chip,6px);background:var(--surface);color:var(--ink-2);font:inherit;font-size:12px;font-weight:600;white-space:nowrap;cursor:pointer}
.hy-f:hover{background:var(--row-hover)}
.hy-f b{font-weight:600;color:var(--muted);font-variant-numeric:tabular-nums}
.hy-f[aria-pressed="true"]{border-color:var(--ink);background:var(--ink);color:var(--surface)}
.hy-f[aria-pressed="true"] b{color:inherit;opacity:.75}
.hy-tot{font-size:var(--fs-small,12.5px);color:var(--muted);white-space:nowrap}
@media (max-width:759px){
  .hy-row{grid-template-columns:minmax(0,1fr);padding:14px 16px;gap:6px}
  .hy-a{justify-content:flex-start}
  .hy-none,.hy-more{padding-left:16px;padding-right:16px}
  .hy-sum{padding:0 16px 10px}
}`;

const isTeam = ctx => !!ctx && !ctx.isClient && ctx.role !== 'client';

/** A bell row on one brand's Home: null when it is another brand's, else the row reworded for this brand. */
function forBrand(it, brand) {
  if (it.act_id) return it.act_id === brand.id ? it : null;
  const ids = Array.isArray(it.act_ids) ? it.act_ids : null;
  if (ids ? !ids.includes(brand.id) : it.brand !== brand.name) return null;
  /* a row that counts several brands: say only this brand's part (by_brand carries it when the bell has it) */
  const own = it.by_brand && Number.isFinite(+it.by_brand[brand.id]) ? +it.by_brand[brand.id] : null;
  if (!ids || ids.length < 2 && own == null) return it;
  if (it.kind === 'send') return { ...it, n: own || 1, text: own ? many(own, 'client update') + ' waiting to send' : 'A client update for ' + brand.name + ' waits to send' };
  if (it.kind === 'war') return { ...it, n: 1, text: 'War Room check-in: ' + brand.name + ' waits on Approve' };
  if (it.kind === 'requests') return { ...it, n: own || 1, text: own ? many(own, 'client request') + ' waiting on the team' : 'A client request from ' + brand.name + ' waits on the team' };
  return { ...it, n: own || it.n };
}

/** The card. opts: { brand (ctx.brand or null), calls (this brand's Meta call count), google (count), max } */
export function waitingYes(ctx, { brand = null, calls = null, google = null, max = 6, onCount } = {}) {
  if (!isTeam(ctx)) return null;
  addStyles('hy-css', CSS);
  const body = h('div', { class: 'hy-list' }, h('p', { class: 'hy-none' }, 'Reading what waits on the team.'));
  const head = h('span', null);
  const stampBox = h('span', null);
  const box = card({ title: 'Waiting on your yes', note: brand ? brand.name : 'every brand', action: h('span', { style: { display: 'inline-flex', alignItems: 'center', gap: '10px' } }, stampBox, head), flush: true, class: 'hy' }, body);
  let open = false, only = null, rows = [], failed = [];
  /* Google on a brand Home in real mode: the page has no count of its own, so the card reads it after it draws */
  let gCount = google, gAsked = false;

  const draw = () => {
    const total = rows.reduce((t, r) => t + r.n, 0);
    if (onCount) onCount(total);
    head.replaceChildren(rows.length ? h('span', { class: 'hy-tot', title: 'Everything the rows stand for, added up' }, many(total, 'thing') + ' waiting') : '');
    const kinds = [...new Set(rows.map(r => r.kind))];
    if (only && !kinds.includes(only)) only = null;
    const list = only ? rows.filter(r => r.kind === only) : rows;
    const shown = open || only ? list : list.slice(0, max);
    const sum = k => rows.filter(r => r.kind === k).reduce((t, r) => t + r.n, 0);
    const chip = (k, label, n) => h('button', { type: 'button', class: 'hy-f', 'aria-pressed': String(only === k), title: k ? 'Show only ' + label.toLowerCase() : 'Show every kind',
      onclick: () => { only = only === k || !k ? null : k; draw(); } }, label, h('b', null, String(n)));
    const row = (r, i) => {
      /* orange only on the first thing to do; every other row's buttons are plain */
      if (i > 0) for (const b of r.acts) if (b && b.classList) b.classList.remove('primary');
      const first = r.acts.find(b => b && b.tagName === 'A' && b.getAttribute('href') && b.getAttribute('href') !== '#');
      /* the whole row opens its first link. A row whose first button writes (I did it, Send) is not clickable. */
      const go = first && r.acts[0] === first;
      return h('div', { class: 'hy-row' + (go ? ' go' : ''), onclick: go ? e => { if (!e.target.closest('a,button')) first.click(); } : null },
        h('span', { class: 'hy-k ' + r.kind }, kindOf(r.kind)[0]),
        h('div', { class: 'hy-t' }, h('b', null, r.title), r.body ? h('p', null, r.body) : null, r.sub ? h('span', null, r.sub) : null),
        h('div', { class: 'hy-a' }, r.acts));
    };
    body.replaceChildren(...[
      kinds.length > 1 ? h('div', { class: 'hy-sum', role: 'group', 'aria-label': 'Show one kind' }, chip(null, 'All', total), kinds.map(k => chip(k, kindOf(k)[0], sum(k)))) : null,
      ...(rows.length ? shown.map(row) : [h('p', { class: 'hy-none' }, failed.length ? 'Nothing found in what could be read.' : 'Nothing waits on a yes right now.')]),
      !only && list.length > max ? h('div', { class: 'hy-more' }, button(open ? 'Show fewer' : `Show all ${list.length}`, { onclick: () => { open = !open; draw(); } })) : null,
      failed.length ? h('p', { class: 'hy-none' }, 'Could not read: ' + failed.join(', ') + '.') : null,
    ].filter(Boolean));
  };

  const fill = async () => {
    const [w, n, auto] = await Promise.all([
      loadWaiting({ brands: ctx.brands, role: ctx.role }).catch(() => null),
      readNotices().catch(() => null),
      import('../automations/_auto.js').catch(() => null),
    ]);
    const out = [];
    for (const raw of (w && w.items) || []) {
      const it = brand ? forBrand(raw, brand) : raw;
      if (!it) continue;
      if (brand && it.kind === 'calls' && calls != null) continue;       // the brand's own buyer list wins, below
      out.push({ kind: it.kind, n: Math.max(1, +it.n || 1), title: it.text, sub: [brand ? '' : it.brand, it.by].filter(Boolean).join(', '),
        acts: [button(it.btn && it.btn.label || 'Open', { href: it.btn && it.btn.href || '#', primary: !!(it.btn && it.btn.primary), icon: 'arrow' })] });
    }
    if (brand && calls > 0) out.push({ kind: 'calls', n: calls, title: `${many(calls, 'Meta ad call')} waiting on Yes or No`, sub: 'Locus ad rules, from the buyer list',
      acts: [button('Make the calls', { href: ctx.href('meta', 'suggestions'), primary: true, icon: 'arrow' })] });
    if (brand && gCount > 0) out.push({ kind: 'google', n: gCount, title: `${many(gCount, 'Google suggestion')} waiting`, sub: 'Google Ads, last 30 days',
      acts: [button('Review', { href: ctx.href('google', 'suggestions'), icon: 'arrow' })] });
    const name = id => ((ctx.brands || []).find(b => b.id === id) || {}).name || '';
    const again = () => { forgetNotices(); fill(); };
    for (const r of ((n && n.home) || []).filter(r => r && r.state === 'open' && r.title)) {
      if (brand && r.brand_id && r.brand_id !== brand.id) continue;
      out.push({ kind: r.kind === 'alert' ? 'alert' : r.kind === 'proposal' ? 'proposal' : r.kind === 'release' ? 'release' : 'tell', n: 1,
        title: r.title, body: r.body || '', sub: [brand ? '' : name(r.brand_id), ctx.sample ? r.when : relativeTime(Date.parse(r.created_at))].filter(Boolean).join(', '),
        acts: auto ? auto.noticeActions(r, ctx, again) : [] });
    }
    out.sort((a, b) => kindOf(a.kind)[1] - kindOf(b.kind)[1]);
    rows = out; failed = (w && w.failed) || [];
    stampBox.replaceChildren(staleStamp({ at: Date.now(), onRefresh: async () => { forgetWaiting(); forgetNotices(); await fill(); } }));
    draw();
    if (brand && gCount == null && !gAsked && !ctx.sample && ctx.brand) {
      gAsked = true;
      import('../google/_g.js').then(m => m.loadSuggestions(ctx)).then(g => {
        const k = g && g.state === 'connected' && g.suggestions ? (g.suggestions.decide || []).length : 0;
        if (k > 0 && box.isConnected) { gCount = k; fill(); }
      }).catch(() => {});
    }
  };
  fill().catch(() => { body.replaceChildren(h('p', { class: 'hy-none' }, 'The list could not be read just now.')); });
  return box;
}

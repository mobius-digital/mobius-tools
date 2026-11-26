/* Black Friday > War Room: the check-in the Slack DM sends every few hours, with the Approve button in v5.
   Shared by the agency page (a-black-friday/war-room.js, every brand) and the brand page (black-friday/war-room.js, one).

   Reads (account-health, one request each, never in parallel):
     GET  /api/standing                 the latest check-in record (per brand: last 6 hours, today, this week, the sale so
                                        far, every live campaign, the suggested call naming its campaign, what was approved)
     GET  /api/standing/brand?act=<id>  the sale campaign's ad sets and ads (brand page, on a tap)
   Writes (account-health, the same body the old War Room in desk.js sends):
     POST /api/standing/approve {slot, act}
          approve() in standing.js: checks the campaign budget in Meta is still what the check-in saw, then writes the
          new daily budget through the Change Log as the signed in person (Undo for 24 hours), stores it on the record
          as approved, and makes the client update draft for the owner to send or skip (nothing goes to a client).
   Never calls /api/standing/run or anything that posts to Slack. Sample mode never calls a write route. */

import { APP_NAME } from '../../config.js';
import { h, put, money, x, pct, statusDot, pill, button, card, hero, empty, sheet, toast, addStyles, platformChip } from '../../kit.js';
import { fixture } from '../../data.js';
import { undoSheet } from '../meta/_write.js';
import { forgetWaiting } from '../../bell.js';

const CSS = `
.wrm{display:grid;gap:14px;min-width:0}
.wrm-top{display:flex;flex-wrap:wrap;align-items:center;gap:10px 16px}
.wrm-top .grow{flex:1;min-width:200px;display:grid;gap:4px}
.wrm-top .when{font-size:20px;font-weight:650;letter-spacing:-.02em}
.wrm-top .sub{font-size:13px;color:var(--muted)}
.wrm-top .btns{display:flex;flex-wrap:wrap;gap:8px;align-items:center}
.wrm-old{font-size:12.5px;color:var(--muted);text-decoration:underline}
.wrm-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(100%,520px),1fr));gap:14px;align-items:start}
.wrm-b{display:grid;gap:14px;min-width:0}
.wrm-b.need{box-shadow:0 0 0 2px var(--ink),var(--sh-1)}
.wrm-h{display:flex;flex-wrap:wrap;align-items:center;gap:6px 12px}
.wrm-h .nm{font-size:19px;font-weight:650;letter-spacing:-.02em}
.wrm-h .goal{font-size:12.5px;color:var(--muted);font-variant-numeric:tabular-nums}
.wrm-w{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}
.wrm-w>div{background:var(--surface-2);border-radius:14px;padding:10px 12px;display:grid;gap:3px;min-width:0}
.wrm-w .lab{font-size:12px;color:var(--muted)}
.wrm-w .mer{font-size:22px;font-weight:650;letter-spacing:-.03em;font-variant-numeric:tabular-nums}
.wrm-w .mer.good{color:var(--good)}.wrm-w .mer.bad{color:var(--bad)}.wrm-w .mer.off{color:var(--muted);font-size:15px}
.wrm-w .ln{font-size:12.5px;color:var(--ink-2);font-variant-numeric:tabular-nums;overflow-wrap:anywhere}
.wrm-so{font-size:13px;color:var(--ink-2);font-variant-numeric:tabular-nums;line-height:1.5}
.wrm-c{display:grid;border-top:1px solid var(--line)}
.wrm-c>div{display:grid;grid-template-columns:minmax(0,1.6fr) minmax(0,1fr) minmax(0,1fr);gap:4px 10px;padding:9px 0;border-bottom:1px solid var(--line);font-size:13px;font-variant-numeric:tabular-nums;align-items:baseline}
.wrm-c .hd{font-size:10.5px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:var(--faint);padding:7px 0}
.wrm-c .nm{min-width:0;overflow-wrap:anywhere}
.wrm-c .nm small{display:block;font-size:11.5px;color:var(--muted)}
.wrm-c .pick{font-weight:650}
.wrm-c .dim{color:var(--muted)}
.wrm-call{display:grid;gap:6px;background:var(--surface-2);border-radius:14px;padding:12px 14px}
.wrm-call b{font-size:15px;letter-spacing:-.01em}
.wrm-call b.good{color:var(--good)}.wrm-call b.bad{color:var(--bad)}
.wrm-call p{margin:0;font-size:13px;line-height:1.5;color:var(--ink-2)}
.wrm-call p.note{color:var(--muted)}
.wrm-act{display:flex;flex-wrap:wrap;gap:8px;align-items:center}
.wrm-act .lx-btn{min-height:44px}
.wrm-done{display:grid;gap:4px;font-size:13px;color:var(--ink-2)}
.wrm-ch{display:grid;gap:10px}
.wrm-ch dl{display:grid;grid-template-columns:auto minmax(0,1fr);gap:8px 14px;margin:0;font-size:14px}
.wrm-ch dt{color:var(--muted)}
.wrm-ch dd{margin:0;font-weight:600;font-variant-numeric:tabular-nums;overflow-wrap:anywhere}
.wrm-ch .big{font-size:22px;font-weight:650;letter-spacing:-.02em}
.wrm-ch ul{margin:0;padding-left:18px;display:grid;gap:6px;font-size:13px;color:var(--ink-2);line-height:1.45}
.wrm-ch .btns{display:flex;flex-wrap:wrap;gap:8px}
.wrm-ch .btns .lx-btn{min-height:48px;flex:1 1 180px}
.wrm-ch .err{background:var(--bad-bg);color:var(--bad);border-radius:12px;padding:10px 12px;font-size:13.5px}
.wrm-ch .ok{background:var(--good-bg);color:var(--good);border-radius:12px;padding:10px 12px;font-size:13.5px}
.wrm-det{display:grid;gap:12px}
.wrm-det .set{display:grid;gap:6px;padding-top:10px;border-top:1px solid var(--line)}
.wrm-det .set b{font-size:14px}
.wrm-det .ad{display:grid;grid-template-columns:auto minmax(0,1fr);gap:2px 10px;font-size:12.5px;align-items:baseline}
.wrm-det .ad span{overflow-wrap:anywhere}
.wrm-det .ad small{grid-column:2;color:var(--muted)}
.wrm-foot{font-size:12.5px;color:var(--muted);line-height:1.5}
@media (max-width:759px){
  .wrm-w{grid-template-columns:1fr}
  .wrm-w>div{grid-template-columns:auto 1fr;align-items:baseline;column-gap:12px}
  .wrm-w .mer{grid-row:span 3;font-size:20px}
  .wrm-c>div{grid-template-columns:minmax(0,1fr) auto}
  .wrm-c .hd{display:none}
  .wrm-c .wk{grid-column:1/-1;color:var(--muted)}
  .wrm-top .btns{width:100%}
  .wrm-top .btns .lx-btn{flex:1;min-height:44px}
  .wrm-act .lx-btn{flex:1}
}`;

const ok = n => n != null && isFinite(n);
const CALL = { scale: 'Raise 50%', raise: 'Raise 25%', hold: 'Hold', cut: 'Cut 25%' };
const KIND = { sale: 'sale', evergreen: 'evergreen', leads: 'leads', creators: 'creators', other: 'other' };
const SAMPLE_MSG = 'Sample: nothing was changed';

/** Who may press Approve: the team, never a client or a read only viewer. The worker refuses viewers too. */
export function canWrite(ctx) {
  const me = ctx.me || {};
  return !ctx.isClient && me.role !== 'viewer' && me.access !== 'viewer' && !me.viewer;
}

/** One read of the latest check-in. Sample mode reads the fixture. */
export async function readStanding(ctx) {
  if (ctx.sample) {
    const f = await fixture('a-black-friday/_sample/war-room.json');
    if (f.standing) f.standing.at = new Date(Date.now() - 40 * 60e3).toISOString();   // a fresh check-in, so Approve can be tried
    return { standing: f.standing || null, detail: f.detail || null, fetched_at: Date.now() };
  }
  const r = await ctx.api('/api/standing', { worker: 'ah', signal: ctx.signal });
  return { standing: (r && r.standing) || null, fetched_at: Date.now() };
}

/* ---------- reading one brand of the record ---------- */
const lineOf = b => b.hold ?? (ok(b.kpi) ? b.kpi * 0.8 : null);
const toneOf = (mer, b) => !ok(mer) || !ok(b.kpi) ? '' : mer >= b.kpi ? 'good' : ok(lineOf(b)) && mer < lineOf(b) ? 'bad' : '';
const ageHours = rec => rec && rec.at ? (Date.now() - Date.parse(rec.at)) / 3600e3 : 0;

/** What the Approve would change, or null when there is nothing to approve. Mirrors the checks in approve(). */
function moveOf(rec, b) {
  const g = b.suggest || {}, camp = b.meta && b.meta.camp;
  if (!g.to || !camp || !camp.daily) return null;
  return { camp, from: camp.daily, to: g.to, pct: (g.to - camp.daily) / camp.daily, up: g.to > camp.daily, why: g.why || '', note: g.note || '' };
}
function statusOf(rec, b) {
  const ap = (rec.approved || {})[b.act_id], mv = moveOf(rec, b);
  if (ap) return { tone: 'good', text: 'Approved' };
  if (b.watch) return { tone: 'off', text: 'Watch only' };
  if (b.error) return { tone: 'warn', text: 'No live numbers' };
  if (b.meta && b.meta.error) return { tone: 'warn', text: 'Meta did not answer' };
  if (mv) return { tone: 'info', text: 'Needs your yes' };
  if (b.mode === 'after') return { tone: 'off', text: 'Sale ended' };
  return { tone: 'good', text: 'Hold' };
}
const RANK = (rec, b) => (rec.approved || {})[b.act_id] ? 3 : moveOf(rec, b) ? (moveOf(rec, b).up ? 1 : 0) : b.watch ? 5 : 4;

/* ---------- parts ---------- */
function windowBox(label, p, b) {
  if (!p || (!ok(p.sales) && !ok(p.spend))) return h('div', null, h('span', { class: 'lab' }, label), h('span', { class: 'mer off' }, 'No data yet'));
  const merTxt = ok(p.mer) ? x(p.mer) : b.no_sales ? 'No sales source' : 'No read';
  return h('div', null,
    h('span', { class: 'lab' }, label + (p.hours && label.startsWith('Last') && p.hours !== 6 ? ` (${p.hours}h with data)` : '')),
    h('span', { class: 'mer ' + (ok(p.mer) ? toneOf(p.mer, b) : 'off'), title: 'MER: store sales over all ad spend' }, merTxt),
    h('span', { class: 'ln' }, 'Sales ' + (ok(p.sales) ? money(p.sales) : 'n/a')),
    h('span', { class: 'ln' }, 'Ad spend ' + (ok(p.spend) ? money(p.spend) : 'n/a')));
}

function campaignList(b) {
  const m = b.meta || {}, camps = m.camps || [];
  if (m.error) return h('p', { class: 'wrm-foot' }, 'Meta did not answer: ' + m.error);
  if (!camps.length) return h('p', { class: 'wrm-foot' }, m.camp ? 'Only the sale campaign was read.' : 'No live campaign in Meta.');
  const pickId = m.camp && m.camp.id;
  return h('div', { class: 'wrm-c', role: 'table', 'aria-label': b.name + ' campaigns' },
    h('div', { class: 'hd', role: 'row' }, h('span', null, 'Campaign'), h('span', null, 'Today'), h('span', { class: 'wk' }, 'This week')),
    camps.map(c => h('div', { role: 'row' },
      h('span', { class: 'nm' + (c.id === pickId ? ' pick' : '') }, c.name, h('small', null, (KIND[c.kind] || 'other') + (c.id === pickId ? ', the call is on this one' : ''))),
      h('span', null, `${money(c.spent || 0)}${c.daily ? ' of ' + money(c.daily) : ' (ad set budgets)'}`, h('small', { class: 'dim', style: { display: 'block' } }, ok(c.t_roas) ? `${x(c.t_roas)}, ${c.t_ord || 0} orders` : 'no return yet')),
      h('span', { class: 'wk' }, ok(c.w_spend) ? `${money(c.w_spend)} spent` : 'spend n/a', ', ', ok(c.w_roas) ? `${x(c.w_roas)}, ${c.w_ord || 0} orders` : 'no return'))));
}

function callBox(rec, b, ctx, state) {
  const g = b.suggest || {}, ap = (rec.approved || {})[b.act_id], mv = moveOf(rec, b), cn = b.meta && b.meta.camp ? b.meta.camp.name : null;
  const write = canWrite(ctx);
  if (ap) {
    return h('div', { class: 'wrm-call' },
      h('b', { class: 'good' }, `Approved: ${cn || 'the sale campaign'} ${money(ap.from)} to ${money(ap.to)} a day`),
      h('p', null, `By ${ap.by || 'the team'}${ap.at ? ', ' + new Date(ap.at).toLocaleString('en-US', { weekday: 'short', hour: 'numeric', minute: '2-digit', timeZone: 'America/Chicago' }) + ' CT' : ''}. It is in the Change Log.`),
      ap.summary ? h('p', { class: 'note' }, ap.summary) : null);
  }
  const head = mv
    ? h('b', { class: mv.up ? 'good' : 'bad' }, `${mv.up ? 'Raise' : 'Cut'} ${mv.camp.name}: ${money(mv.from)} to ${money(mv.to)} a day (${mv.up ? '+' : ''}${Math.round(mv.pct * 100)}%)`)
    : h('b', null, `${CALL[g.call] && g.call !== 'hold' ? CALL[g.call] : 'Hold'}${cn ? ' ' + cn : ''}`);
  const old = ageHours(rec) > 6;
  let act = null;
  if (mv && write) {
    act = old
      ? h('p', { class: 'note' }, 'This check-in is over 6 hours old, so it cannot be approved. Refresh, or wait for the next one.')
      : h('div', { class: 'wrm-act' }, button(`${mv.up ? 'Approve raise' : 'Approve cut'} to ${money(mv.to)}`, { primary: true, large: true, onclick: () => confirmSheet(rec, b, ctx, state), aria: `Approve ${b.name}: ${money(mv.from)} to ${money(mv.to)} a day` }));
  } else if (mv && !write) act = h('p', { class: 'note' }, 'Your access is read only, so you cannot approve this.');
  return h('div', { class: 'wrm-call' }, head,
    g.why ? h('p', null, g.why) : null,
    g.note ? h('p', { class: 'note' }, g.note) : null,
    act);
}

function brandCard(rec, b, ctx, state) {
  const st = statusOf(rec, b), so = b.so_far || {}, m = b.meta || {}, line = lineOf(b);
  const mv = moveOf(rec, b), ap = (rec.approved || {})[b.act_id];
  const goalTxt = [ok(b.kpi) ? 'goal ' + x(b.kpi) : null, ok(line) ? 'break-even ' + x(line) : null].filter(Boolean).join(', ');
  const soTxt = ok(so.sales)
    ? `Sale so far${so.days ? ` (${so.days} day${so.days === 1 ? '' : 's'})` : ''}: ${money(so.sales)}${ok(b.goal) ? ' of ' + money(b.goal) : ''}, MER ${ok(so.mer) ? x(so.mer) : 'n/a'}${ok(so.new_mer) ? `, new customers ${x(so.new_mer)}${ok(b.be_new) ? ' (break-even ' + x(b.be_new) + ')' : ''}` : ''}.`
    : b.no_sales ? 'No sales source connected.' : '';
  const limTxt = ok(m.limit) ? `Live budgets ${money(m.on || 0)} a day of the ${money(m.limit)} Meta daily limit${m.limit_src === 'known' ? ' (the last known figure)' : ''}, ${money(m.headroom)} room.` : '';
  const detailBtn = state.one && canWrite(ctx) ? button('What is running', { onclick: () => detailSheet(b, ctx, state) }) : null;
  return card({ class: 'wrm-b' + (mv && !ap ? ' need' : ''), },
    h('div', { class: 'wrm-h' }, h('span', { class: 'nm' }, b.name), statusDot(st.tone, st.text), goalTxt ? h('span', { class: 'goal' }, goalTxt) : null),
    h('div', { class: 'wrm-w' }, windowBox('Last 6 hours', b.last6, b), windowBox('Today', b.today, b), windowBox('This week', b.week, b)),
    soTxt ? h('p', { class: 'wrm-so' }, soTxt) : null,
    callBox(rec, b, ctx, state),
    h('div', null, h('div', { class: 'wrm-h', style: { marginBottom: '4px' } }, platformChip('meta'), h('span', { class: 'goal' }, 'Campaigns. Returns are Triple Whale last click.')), campaignList(b)),
    limTxt ? h('p', { class: 'wrm-foot' }, limTxt) : null,
    detailBtn ? h('div', { class: 'wrm-act' }, detailBtn) : null);
}

/** A sheet closes when the person moves to another page. */
function closeOnLeave(s) {
  const off = () => { window.removeEventListener('hashchange', off); if (s.el.isConnected) s.close(); };
  window.addEventListener('hashchange', off);
  return s;
}

/* ---------- approve: the confirm sheet, then the write ---------- */
function confirmSheet(rec, b, ctx, state) {
  const mv = moveOf(rec, b);
  if (!mv) return;
  const body = h('div', { class: 'wrm-ch' });
  const s = sheet({ title: `Approve ${b.name}?`, body, side: 'right' });
  closeOnLeave(s);
  const draw = (phase, msg) => {
    const facts = h('dl', null,
      h('dt', null, 'Campaign'), h('dd', null, mv.camp.name),
      h('dt', null, 'Daily budget'), h('dd', { class: 'big' }, `${money(mv.from)} to ${money(mv.to)}`),
      h('dt', null, 'Change'), h('dd', null, `${mv.up ? '+' : ''}${Math.round(mv.pct * 100)}%, ${mv.up ? '+' : ''}${money(mv.to - mv.from)} a day`),
      h('dt', null, 'Check-in'), h('dd', null, rec.label || rec.slot));
    const what = h('ul', null,
      h('li', null, `First it checks Meta: if ${mv.camp.name} is no longer ${money(mv.from)} a day, nothing is written.`),
      h('li', null, 'The new budget goes to Meta as you, into the Change Log, with Undo for 24 hours.'),
      h('li', null, 'A client update draft is made for the owner to send or skip. Nothing goes to the client from here.'),
      h('li', null, 'Nothing else changes: no other campaign, ad set or ad.'));
    const why = mv.why ? h('p', { class: 'wrm-foot' }, mv.why) : null;
    const note = mv.note ? h('p', { class: 'wrm-foot' }, mv.note) : null;
    if (phase === 'ask' || phase === 'busy' || phase === 'error') {
      put(body, facts, why, note, what,
        phase === 'error' ? h('div', { class: 'err', role: 'alert' }, 'Not changed. ' + msg) : null,
        h('div', { class: 'btns' },
          button(phase === 'busy' ? 'Writing to Meta...' : `Change it to ${money(mv.to)} a day`, { primary: true, large: true, disabled: phase === 'busy', onclick: go }),
          button(phase === 'error' ? 'Close' : 'Cancel', { large: true, onclick: () => s.close() })));
    } else {
      const r = msg;
      put(body,
        h('div', { class: 'ok', role: 'status' }, ctx.sample ? SAMPLE_MSG + '.' : 'Done. Meta took the new budget.'),
        h('ul', null, h('li', null, `${mv.camp.name}: ${money(r.from)} to ${money(r.to)} a day${ctx.sample ? ' (sample, not written)' : ', in the Change Log'}.`)),
        r.summary ? h('p', { class: 'wrm-foot' }, r.summary) : null,
        h('div', { class: 'btns' },
          r.write || ctx.sample ? button('Undo', { large: true, onclick: undo }) : null,
          button('Close', { large: true, onclick: () => s.close() })));
    }
  };
  async function go() {
    draw('busy');
    let r;
    if (ctx.sample) {
      r = { ok: true, by: (ctx.me && ctx.me.name) || 'Sample', at: new Date().toISOString(), from: mv.from, to: mv.to, summary: '' };
      toast(SAMPLE_MSG);
    } else {
      try { r = await ctx.api('/api/standing/approve', { worker: 'ah', method: 'POST', body: { slot: rec.slot, act: b.act_id } }); }
      catch (e) { r = { error: (e && e.message) || 'Meta did not answer.' }; }
    }
    if (!r || r.error || !r.ok) { draw('error', (r && r.error) || 'The server did not say why.'); toast((r && r.error) || 'Not changed', { tone: 'bad', ms: 5000 }); return; }
    rec.approved = rec.approved || {};
    rec.approved[b.act_id] = { by: r.by, at: r.at, from: r.from, to: r.to, write: r.write || null, summary: r.summary || '' };
    if (!ctx.sample) forgetWaiting();
    draw('done', r);
    if (!ctx.sample) toast(`${b.name}: ${money(r.from)} to ${money(r.to)} a day`, { tone: 'good' });
    state.redraw();
  }
  /* Undo: the same confirm sheet and route as Changes made (POST /api/meta/undo {act, write}). */
  function undo() {
    const a = (rec.approved || {})[b.act_id] || {};
    s.close();
    undoSheet(ctx, { act: b.act_id, write: a.write || 'sample', what: `${mv.camp.name}: back to ${money(a.from != null ? a.from : mv.from)} a day`, name: b.name }, okd => {
      if (!okd) return;
      if (!ctx.sample) forgetWaiting();
      if (rec.approved) delete rec.approved[b.act_id];
      state.redraw();
    });
  }
  draw('ask');
}

/* ---------- brand page: what is running (ad sets and ads), read on a tap ---------- */
async function detailSheet(b, ctx, state) {
  const body = h('div', { class: 'wrm-det' }, h('p', { class: 'wrm-foot' }, 'Reading Meta and the ad calls...'));
  closeOnLeave(sheet({ title: `${b.name}: what is running`, body, side: 'right' }));
  let D;
  try {
    D = ctx.sample ? (state.detail || { error: 'No sample ad sets.' }) : await ctx.api('/api/standing/brand?act=' + encodeURIComponent(b.act_id), { worker: 'ah' });
  } catch (e) { D = { error: (e && e.message) || 'Meta did not answer.' }; }
  if (!D || D.error) return put(body, h('p', { class: 'wrm-foot' }, 'Could not read it: ' + ((D && D.error) || 'no answer')));
  const LAB = { cut: ['bad', 'Cut'], wait: ['', 'Wait'], keep: ['good', 'Keep'] };
  put(body,
    h('p', { class: 'wrm-so' }, D.structure || ''),
    D.from ? h('p', { class: 'wrm-foot' }, `Numbers are ${D.from} to ${D.to}, Triple Whale last click. Cut means today's ad call says so.`) : null,
    (D.sets || []).map(st => h('div', { class: 'set' },
      h('b', null, st.name),
      h('span', { class: 'wrm-foot' }, [st.daily ? money(st.daily) + ' a day' : null, ok(st.spend) ? money(st.spend) + ' spent' : null, ok(st.sales) ? st.sales + (st.sales === 1 ? ' sale' : ' sales') : null, ok(st.roas) ? x(st.roas) : null, ok(st.share) ? st.share + '% of spend' : null].filter(Boolean).join(', ')),
      st.call ? h('p', { class: 'wrm-foot' }, 'Set call: ' + (st.call.action || '') + (st.call.why ? '. ' + st.call.why : '')) : null,
      (st.ads || []).slice(0, 12).map(a => h('div', { class: 'ad' },
        pill((LAB[a.label] || LAB.keep)[0], (LAB[a.label] || LAB.keep)[1]),
        h('span', null, `${a.name}: ${ok(a.spend) ? money(a.spend) : '$0'}${ok(a.sales) ? ', ' + a.sales + (a.sales === 1 ? ' sale' : ' sales') : ''}${ok(a.roas) ? ', ' + x(a.roas) : ''}`),
        a.note ? h('small', null, a.note) : null)))),
    D.ads_manager && !ctx.sample ? h('a', { class: 'wrm-old', href: D.ads_manager, target: '_blank', rel: 'noopener' }, 'Open in Ads Manager') : null);
}

/* ---------- the page ---------- */
export function renderWarRoom(el, data, ctx, { one = null } = {}) {
  addStyles('wrm-css', CSS);
  const state = { one, detail: data && data.detail, data };
  state.redraw = () => draw();

  async function refresh(btn) {
    if (btn) { btn.disabled = true; btn.textContent = 'Reading...'; }
    try {
      const fresh = await readStanding({ ...ctx, signal: undefined });
      state.data = { ...fresh, detail: fresh.detail || state.detail };
      if (ctx.sample) toast('Sample: read the sample check-in again');
      draw();
    } catch (e) {
      toast('Could not read the check-in: ' + ((e && e.message) || 'no answer'), { tone: 'bad', ms: 5000 });
      if (btn) { btn.disabled = false; btn.textContent = 'Refresh'; }
    }
  }

  function draw() {
    const d = state.data || {}, rec = d.standing;
    const refreshBtn = button('Refresh', { large: true, onclick: e => refresh(e.currentTarget) });
    const oldLink = !ctx.isClient && ctx.legacy ? h('a', { class: 'wrm-old', href: ctx.legacy }, 'Open in old ' + APP_NAME) : null;
    if (!rec) {
      return put(el, h('div', { class: 'wrm' }, empty({ title: 'No check-in yet', text: d.error || 'The War Room fills in at the first check-in of the season. The Slack DM sends it on its own schedule.', action: refreshBtn }), oldLink));
    }
    let list = [...(rec.brands || [])];
    if (one) list = list.filter(b => b.act_id === one);
    if (!list.length) {
      return put(el, h('div', { class: 'wrm' }, empty({ title: 'This brand is not in the check-in', text: 'Only brands with a Black Friday sale in the War Room are checked.', action: refreshBtn }), oldLink));
    }
    list = list.map((b, i) => [b, i]).sort((p, q) => RANK(rec, p[0]) - RANK(rec, q[0]) || p[1] - q[1]).map(p => p[0]);
    const need = list.filter(b => moveOf(rec, b) && !(rec.approved || {})[b.act_id]).length;
    const doneN = list.filter(b => (rec.approved || {})[b.act_id]).length;
    const age = ageHours(rec);
    const top = hero({ line: true },
      h('div', { class: 'wrm-top' },
        h('div', { class: 'grow' },
          h('span', { class: 'when' }, `Checked ${rec.label || rec.slot}`),
          h('span', { class: 'sub' }, [
            rec.next ? `Next check-in ${rec.next}.` : 'No more check-ins this season.',
            need ? ` ${need} ${need === 1 ? 'brand needs' : 'brands need'} your yes.` : ' Nothing needs your yes.',
            doneN ? ` ${doneN} approved.` : '',
            age > 6 ? ' This check-in is over 6 hours old.' : '',
            rec.dry ? ' Dry run: no sale has started, so these are today\'s numbers.' : ''].join(''))),
        h('div', { class: 'btns' }, refreshBtn, oldLink)));
    put(el, h('div', { class: 'wrm' },
      top,
      h('div', { class: 'wrm-grid' }, list.map(b => brandCard(rec, b, ctx, state))),
      h('p', { class: 'wrm-foot' }, 'MER is store sales over all ad spend (Triple Whale), against each brand\'s goal and break-even. Campaign returns are Triple Whale last click; spend and budgets are Meta at the check-in. Nothing changes until someone taps Approve, and only the one campaign budget named in the call.')));
  }
  draw();
}

/* Agency > Meta > Suggestions. Every brand's Meta calls for today, grouped by brand, most money first.
   Each row has Yes and No (../meta/_write.js: the same routes and bodies as old Locus buyer.js), so a buyer
   can work through every brand from one list. A viewer sees the list with no buttons.
   Real: account-health GET /api/buyer-list?act=all&ads=0 (rows not yet decided today). */
import { h, statusDot, addStyles } from '../../kit.js';
import { world } from '../a-today/_ag.js';
import { renderSuggestions } from '../a-today/_more.js';
import { canWrite, yesNo } from '../meta/_write.js';
import { polishSuggestions } from '../platforms/_ads.js';

const callOf = r => ({ key: r.key, kind: r.kind, act_id: r.act_id, brand: r.brand, currency: r.currency, object: r.object, level: r.level, name: r.name, set: r.set, action: r.action,
  why: r.why, why_full: r.why_full, stake: r.stake, do: r.do || null, then: r.then || null, meta_act: r.meta_act, adset_id: r.adset_id, adset: r.adset, ad_id: r.ad_id, ad: r.ad,
  campaign_id: r.campaign_id, suggested_budget: r.suggested_budget, budget: r.budget, goal: r.goal, goal_roas: r.goal_roas, metric: r.metric, role: r.role, ai: r.ai || null, card: r.card ? { do: r.card.do } : null });

async function load(ctx) {
  const d = await ctx.api('/api/buyer-list?act=all&ads=0', { worker: 'ah', signal: ctx.signal });
  const all = (d.rows || []).filter(r => !r.decided);
  const rows = all.filter(r => r.kind !== 'launch' && !/google|tiktok/i.test(r.platform || '')).map(r => {
    const c = r.card || {};
    return { id: `${r.act_id}|${c.object || r.name}|${r.kind}`, brand_id: r.act_id, brand: r.brand, kind: c.kind || r.kind,
      action: c.do || r.action || '', name: c.object || r.name || '', why: c.because || r.why || '', stake: r.stake ?? null, call: callOf(r) };
  });
  return { as_of: d.as_of, rows, load: all.filter(r => r.kind === 'launch').length };
}
/* Sample: the shared made up world; each row gets a made up move so Yes and No can be clicked through. Nothing is sent. */
async function sample() {
  const w = await world();
  const rows = w.suggestions.meta.filter(r => r.kind !== 'launch').map((r, i) => ({ ...r, call: {
    key: r.id, kind: r.kind, act_id: r.brand_id, brand: r.brand, currency: 'USD', object: String(200000000000 + i), level: 'adset', name: r.name, action: r.action, why: r.why,
    do: r.kind === 'cut' || r.kind === 'trim' ? 'pause' : r.kind === 'scale' || r.kind === 'raise' ? 'budget' : null, adset_id: String(200000000000 + i), budget: 40, suggested_budget: 50 } }));
  return { as_of: w.suggestions.as_of, rows, load: w.suggestions.meta.filter(r => r.kind === 'launch').length };
}

const CSS = `
.am-act{grid-column:2/-1;display:flex;align-items:center;gap:10px;flex-wrap:wrap}
@media (max-width:759px){.am-act{grid-column:1/-1}.am-act .mw-act{width:100%}}`;

function render(el, d, ctx) {
  renderSuggestions(el, d, ctx, 'meta');
  polishSuggestions(el, d, { platform: 'meta', days: 7 });
  if (!canWrite(ctx)) return;
  addStyles('am-css', CSS);
  /* Each row's buttons go on the row with its own id, never by position. A row whose id is missing or not unique stays read only. */
  const byId = new Map(), twice = new Set();
  for (const r of (d && d.rows) || []) { const k = r.id != null ? String(r.id) : ''; if (byId.has(k)) twice.add(k); else byId.set(k, r); }
  el.querySelectorAll('.ag-sg-r').forEach(n => {
    const k = n.getAttribute('data-id');
    const r = k && !twice.has(k) ? byId.get(k) : null; if (!r || !r.call) return;
    const box = h('div', { class: 'am-act' });
    const fill = res => {
      if (!res || !res.decision) return box.replaceChildren(yesNo(ctx, r.call, fill));
      box.replaceChildren(res.decision === 'yes' ? statusDot('good', 'Done' + (res.summary ? ': ' + res.summary : '')) : statusDot('off', 'Said no' + (res.note ? ': ' + res.note : '')));
    };
    fill(null);
    n.append(box);
  });
}

export default {
  title: 'Suggestions for Meta, all brands',
  eyebrow: 'Meta, all brands',
  ranges: false,
  asOf: d => d && d.as_of,
  load, sample, render,
};

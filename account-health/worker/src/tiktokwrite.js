/**
 * THE STRATEGIST'S TIKTOK HANDS (2026-10-17), with the metawrite.js rules: look the object up first inside the brand's
 * own advertiser, before -> after, a p_ext_write row with the before-state, a Change Log line, undo_change.
 *
 *   tiktok_read     live campaigns and ad groups with status and budget
 *   tiktok_status   turn a campaign, ad group or ad on or off
 *   tiktok_budget   a campaign's or ad group's budget (over 50% in one step only when asked outright)
 *
 * NOT CONNECTABLE YET: TikTok's app review is done only when Cole sets TIKTOK_APP_ID and TIKTOK_APP_SECRET and signs
 * in once (Ads > TikTok > Connect TikTok). Until then every card says so. None of this has run against the real API.
 */
import { tt, tiktokLink } from './tiktok.js';
import { recordWrite, registerUndo, doneNote, brandOf } from './extwrite.js';

const P = 'tiktok';
const clip = (s, n) => String(s ?? '').slice(0, n);
const $ = v => `$${(+v).toLocaleString('en-US', { minimumFractionDigits: v % 1 ? 2 : 0, maximumFractionDigits: 2 })}`;
const REASON = { type: 'string', description: 'Why, in one line with the number behind it.' };
const q = p => Object.entries(p).map(([k, v]) => `${k}=${encodeURIComponent(typeof v === 'string' ? v : JSON.stringify(v))}`).join('&');
const LV = {
  campaign: { get: '/campaign/get/', id: 'campaign_id', ids: 'campaign_ids', name: 'campaign_name', status: '/campaign/status/update/', word: 'campaign' },
  adgroup: { get: '/adgroup/get/', id: 'adgroup_id', ids: 'adgroup_ids', name: 'adgroup_name', status: '/adgroup/status/update/', word: 'ad group' },
  ad: { get: '/ad/get/', id: 'ad_id', ids: 'ad_ids', name: 'ad_name', status: '/ad/status/update/', word: 'ad' },
};

async function prep(env, d, input, ctx) {
  const t = await env.DB.prepare(`SELECT value FROM settings WHERE key = 'tiktok_tokens'`).first().catch(() => null);
  let tok = null; try { tok = JSON.parse(t?.value || 'null'); } catch {}
  if (!env.TIKTOK_APP_ID || !env.TIKTOK_APP_SECRET) return { error: 'TikTok is not connected: the TikTok app keys are not set on the server yet (Cole: set TIKTOK_APP_ID and TIKTOK_APP_SECRET, then Ads > TikTok > Connect TikTok).' };
  if (!tok?.access_token) return { error: 'TikTok is not connected yet: Cole signs in once on Ads > TikTok > Connect TikTok.' };
  const brand = await brandOf(env, d, input.brand, ctx);
  if (!brand) return { error: `Which brand? No brand called "${input.brand || ''}".` };
  const link = await tiktokLink(env, brand.act_id);
  if (!link.advertiser_id) return { error: `${brand.name} has no TikTok advertiser linked (Brand settings > Integrations > TikTok).` };
  return { brand, adv: link.advertiser_id, token: tok.access_token };
}
async function find(env, r, level, target) {
  const L = LV[level]; if (!L) return { error: 'level is campaign, adgroup or ad.' };
  const t = String(target || '').trim(); if (!t) return { error: 'Name it or give its id.' };
  const filtering = /^\d{8,}$/.test(t) ? { [L.ids]: [t] } : {};
  const j = await tt(env, `${L.get}?${q({ advertiser_id: r.adv, filtering, page_size: 200 })}`, { token: r.token });
  const rows = (j.list || []).filter(x => x[L.id] && x.operation_status !== 'DELETE');
  const lw = t.toLowerCase();
  const exact = rows.filter(x => String(x[L.id]) === t || String(x[L.name] || '').toLowerCase() === lw);
  const hits = exact.length ? exact : rows.filter(x => String(x[L.name] || '').toLowerCase().includes(lw));
  if (hits.length === 1) return { obj: hits[0], L };
  if (!hits.length) return { error: `No TikTok ${L.word} like "${t}" in ${r.brand.name}'s advertiser.` };
  return { error: `"${t}" matches ${hits.length}: ${hits.slice(0, 8).map(x => `${x[L.name]} (${x[L.id]})`).join('; ')}. Say which, by id.` };
}

const statusAction = d => ({
  name: 'tiktok_status',
  description: 'Turn ONE TikTok campaign, ad group or ad on or off.',
  input_schema: { type: 'object', properties: { brand: { type: 'string' }, level: { type: 'string', enum: Object.keys(LV) }, target: { type: 'string' }, status: { type: 'string', enum: ['off', 'on'] }, reason: REASON }, required: ['brand', 'level', 'target', 'status', 'reason'] },
  propose: async (env, i, h, ctx) => {
    const r = await prep(env, d, i, ctx); if (r.error) return r;
    let f; try { f = await find(env, r, i.level, i.target); } catch (e) { return { error: `TikTok said: ${e.message}` }; } if (f.error) return f;
    const to = i.status === 'off' ? 'DISABLE' : 'ENABLE';
    if (f.obj.operation_status === to) return { error: `It is already ${i.status}.` };
    const line = `Turn ${i.status} TikTok ${f.L.word} "${f.obj[f.L.name]}"`;
    return { summary: `${r.brand.name}: ${line}`, detail: `${String(f.obj.operation_status || '').toLowerCase()} → ${to.toLowerCase()}.\nWhy: ${clip(i.reason, 300)}`,
      patch: { brand: r.brand.act_id, adv: r.adv, level: i.level, id: String(f.obj[f.L.id]), name: f.obj[f.L.name], from: f.obj.operation_status, to, line, reason: clip(i.reason, 300) } };
  },
  apply: async (env, p, h, ctx) => {
    const r = await prep(env, d, { brand: p.brand }, ctx); if (r.error) return r;
    try { await tt(env, LV[p.level].status, { method: 'POST', token: r.token, body: { advertiser_id: p.adv, [LV[p.level].ids]: [p.id], operation_status: p.to } }); }
    catch (e) { return { error: `TikTok refused it: ${e.message}` }; }
    const id = await recordWrite(env, { platform: P, brand: p.brand, object: p.id, name: p.name, action: 'tiktok_status', before: { status: p.from }, after: { status: p.to }, undo: { op: 'status', adv: p.adv, level: p.level, id: p.id, status: p.from === 'DISABLE' ? 'DISABLE' : 'ENABLE' }, summary: p.line, reason: p.reason, category: p.to === 'DISABLE' ? 'campaign_paused' : 'campaign_relaunched', objectType: `TIKTOK_${p.level.toUpperCase()}`, ctx });
    return { ok: true, note: doneNote(`${p.line}: done.`, id) };
  },
});
const budgetAction = d => ({
  name: 'tiktok_budget',
  description: 'Change a TikTok campaign\'s or ad group\'s budget (dollars, daily or total, whichever it runs on). Over 50% in one step only when the person asked for exactly that (big: true).',
  input_schema: { type: 'object', properties: { brand: { type: 'string' }, level: { type: 'string', enum: ['campaign', 'adgroup'] }, target: { type: 'string' }, amount: { type: 'number' }, big: { type: 'boolean' }, reason: REASON }, required: ['brand', 'level', 'target', 'amount', 'reason'] },
  propose: async (env, i, h, ctx) => {
    const r = await prep(env, d, i, ctx); if (r.error) return r;
    let f; try { f = await find(env, r, i.level, i.target); } catch (e) { return { error: `TikTok said: ${e.message}` }; } if (f.error) return f;
    const from = +f.obj.budget || 0, to = Math.round(+i.amount * 100) / 100;
    if (!from || /INFINITE/.test(f.obj.budget_mode || '')) return { error: `"${f.obj[f.L.name]}" has no budget of its own (${String(f.obj.budget_mode || 'unlimited').toLowerCase()}). ${i.level === 'adgroup' ? 'Its campaign holds it.' : 'Its ad groups hold the budgets.'}` };
    if (!(to > 0) || to === from) return { error: 'Give a new budget above zero.' };
    const step = Math.abs(to - from) / from;
    if (step > 0.5 && !i.big) return { error: `That is ${Math.round((to - from) / from * 100)}% (${$(from)} → ${$(to)}). Propose a smaller step, or big: true if the person asked for exactly this.` };
    const per = /DAY/.test(f.obj.budget_mode || '') ? '/day' : ' total';
    const line = `TikTok ${f.L.word} "${f.obj[f.L.name]}" budget ${$(from)}${per} → ${$(to)}${per}`;
    return { summary: `${r.brand.name}: ${line}`, detail: `Why: ${clip(i.reason, 300)}`, patch: { brand: r.brand.act_id, adv: r.adv, level: i.level, id: String(f.obj[f.L.id]), name: f.obj[f.L.name], from, to, line, reason: clip(i.reason, 300) } };
  },
  apply: async (env, p, h, ctx) => {
    const r = await prep(env, d, { brand: p.brand }, ctx); if (r.error) return r;
    try { await setBudget(env, r.token, p.adv, p.level, p.id, p.to); } catch (e) { return { error: `TikTok refused it: ${e.message}` }; }
    const id = await recordWrite(env, { platform: P, brand: p.brand, object: p.id, name: p.name, action: 'tiktok_budget', before: { budget: p.from }, after: { budget: p.to }, undo: { op: 'budget', adv: p.adv, level: p.level, id: p.id, budget: p.from }, summary: p.line, reason: p.reason, category: 'budget', objectType: `TIKTOK_${p.level.toUpperCase()}`, ctx });
    return { ok: true, note: doneNote(`${p.line}.`, id) };
  },
});
const setBudget = (env, token, adv, level, id, budget) => level === 'campaign'
  ? tt(env, '/campaign/update/', { method: 'POST', token, body: { advertiser_id: adv, campaign_id: id, budget } })
  : tt(env, '/adgroup/budget/update/', { method: 'POST', token, body: { advertiser_id: adv, budget: [{ adgroup_id: id, budget }] } });

export function tiktokTools(d) {
  return [{
    def: { name: 'tiktok_read', description: 'Read a brand\'s TikTok ad account LIVE: campaigns and ad groups with status and budget (performance is the tiktok_ads view). Read before any tiktok_* change.',
      input_schema: { type: 'object', properties: { brand: { type: 'string' } } } },
    run: async (env, input, ctx) => {
      const r = await prep(env, d, input, ctx); if (r.error) return { is_error: true, text: r.error };
      try {
        const [c, g] = await Promise.all(['campaign', 'adgroup'].map(l => tt(env, `${LV[l].get}?${q({ advertiser_id: r.adv, page_size: 200 })}`, { token: r.token })));
        const s = JSON.stringify({ brand: r.brand.name, advertiser: r.adv,
          campaigns: (c.list || []).map(x => ({ id: x.campaign_id, name: x.campaign_name, status: x.operation_status, objective: x.objective_type, budget: x.budget, budget_mode: x.budget_mode })),
          adgroups: (g.list || []).map(x => ({ id: x.adgroup_id, name: x.adgroup_name, campaign: x.campaign_id, status: x.operation_status, budget: x.budget, budget_mode: x.budget_mode, optimization: x.optimization_goal })) });
        return { text: s.slice(0, 20000) };
      } catch (e) { return { is_error: true, text: `TikTok said: ${e.message}` }; }
    },
  }];
}
registerUndo(P, async (env, d, row, u) => {
  const r = await prep(env, d, { brand: row.brand }, null); if (r.error) return r;
  try {
    if (u.op === 'status') await tt(env, LV[u.level].status, { method: 'POST', token: r.token, body: { advertiser_id: u.adv, [LV[u.level].ids]: [u.id], operation_status: u.status } });
    else if (u.op === 'budget') await setBudget(env, r.token, u.adv, u.level, u.id, u.budget);
    else return { error: `Unknown TikTok undo ${u.op}.` };
  } catch (e) { return { error: `TikTok said: ${e.message}` }; }
  return { ok: true, note: `Undone: ${row.summary}.` };
});
export function tiktokActions(d) { return [statusAction(d), budgetAction(d)]; }
export async function tiktokAccess(env) {
  const t = await env.DB.prepare(`SELECT value FROM settings WHERE key = 'tiktok_tokens'`).first().catch(() => null);
  const app = !!(env.TIKTOK_APP_ID && env.TIKTOK_APP_SECRET);
  return { can_write: app && /access_token/.test(t?.value || ''), app_keys: app, signed_in: /access_token/.test(t?.value || ''),
    fix: !app ? 'Cole: business-api.tiktok.com > My apps > Locus by Mobius Digital: copy the App ID and Secret; then in a terminal in account-health/worker run npx.cmd wrangler secret put TIKTOK_APP_ID and TIKTOK_APP_SECRET (or ask Claude Code to set the ID). Then Locus > Ads > TikTok > Connect TikTok and tick every ad account.' : !/access_token/.test(t?.value || '') ? 'Cole: Locus > Ads > TikTok > Connect TikTok, sign in, tick every ad account.' : null };
}

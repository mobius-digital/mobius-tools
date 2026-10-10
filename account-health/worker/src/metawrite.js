/**
 * The Strategist's hands (2026-10-09): it can CHANGE things in Meta Ads, Asana and Google Drive, the way
 * Viktor does, and every change is an Apply card first (ask/engine.js ACTIONS: propose describes, a person
 * taps Apply, apply writes). Cole: "If he suggests doing something we approve it or change it up."
 *
 *   meta_read (tool)          live campaigns / ad sets / ads with budgets, bid strategy, targeting, creative ids
 *   meta_pause / meta_resume  campaign, ad set or ad
 *   meta_budget               daily or lifetime budget; a change over 50% is refused unless big: true
 *   meta_min_spend            an ad set's daily minimum and daily cap (set or clear)
 *   meta_rename
 *   meta_duplicate_adset      a deep copy into the same campaign, PAUSED, with a new name
 *   meta_create_ad            image (fetched, uploaded to adimages) or an existing video id; PAUSED unless live
 *   meta_undo                 reverts one write within 24 hours (p_meta_write keeps the before-state)
 *   asana_task / asana_comment / asana_complete
 *   drive_list (tool) / drive_copy_to / drive_share
 *
 * Rules every Meta write keeps:
 *   - look the object up first (by name or id) and show the exact before and after on the card;
 *   - only the brand's own ad accounts (the object's account_id must be one of the brand's Meta connections);
 *   - the token must hold MANAGE or ADVERTISE on the account (`metaCan`, cached an hour), else the card is
 *     refused with the exact fix;
 *   - re-read the object at Apply and refuse when it changed since the card was made;
 *   - one row in p_meta_write (for undo) and one manual line in `activities` (the Change Log) naming who
 *     approved it.
 * All HTTP goes through d.xfetch (counted, see THE SUBREQUEST BUDGET in account-health/CLAUDE.md).
 */
import { resolveBrandId } from './brands.js';
import { asana, asanaAll, numOf, googleToken } from './asana-brand.js';

const GRAPH = 'https://graph.facebook.com/v23.0';
const BUSINESS_ID = '695359915477596';
const OWNER = 'cole@go-mobius-digital.com';
const DRIVE_RO = 'https://www.googleapis.com/auth/drive.readonly';
const DRIVE_RW = 'https://www.googleapis.com/auth/drive';
const UNDO_HOURS = 24;
const BIG_STEP = 0.5;

const clip = (s, n) => String(s ?? '').slice(0, n);
const rid = p => p + crypto.randomUUID().replace(/-/g, '').slice(0, 12);
const parse = (v, fb) => { if (v == null) return fb; if (typeof v !== 'string') return v; try { return JSON.parse(v); } catch { return fb; } };

/* ---------------- money ---------------- */
export function money(cents, cur = 'USD') {
  if (cents == null || cents === '' || +cents <= 0) return 'none';
  const v = +cents / 100;
  const s = v.toLocaleString('en-US', { minimumFractionDigits: v % 1 ? 2 : 0, maximumFractionDigits: 2 });
  return (cur === 'USD' ? '$' : `${cur} `) + s;
}
/* An image on our own profit worker (Studio ads, Strategist images) cannot be fetched over its workers.dev URL from this
   worker (same account: Cloudflare refuses it, which read as a 404 on the first live Launch to Meta, 2026-10-10). The
   PROFIT service binding reaches it; anything else goes out through xfetch as before. */
const PROFIT_HOST = 'mobius-profit.mobius-digital.workers.dev';
function fetchImage(env, d, url) {
  try { if (env.PROFIT && new URL(url).host === PROFIT_HOST) return env.PROFIT.fetch(new Request(url)); } catch {}
  return d.xfetch(url);
}
const pctText = (from, to) => { const p = Math.round((to - from) / from * 100); return `${p >= 0 ? '+' : ''}${p}%`; };

/* ---------------- Graph API ---------------- */
function graphError(j, status) {
  const e = j?.error || {};
  return Object.assign(new Error(`Meta said: ${e.error_user_msg || e.message || `HTTP ${status}`}`), { code: e.code, status });
}
async function gget(d, env, path, params = {}) {
  if (!env.META_TOKEN) throw new Error('META_TOKEN is not set on the worker.');
  const url = new URL(`${GRAPH}/${String(path).replace(/^\//, '')}`);
  for (const [k, v] of Object.entries(params)) if (v != null) url.searchParams.set(k, typeof v === 'string' ? v : JSON.stringify(v));
  url.searchParams.set('access_token', env.META_TOKEN);
  const res = await d.xfetch(url.toString());
  const j = await res.json().catch(() => ({}));
  if (!res.ok || j.error) throw graphError(j, res.status);
  return j;
}
async function gall(d, env, path, params = {}, maxPages = 3) {
  const out = [];
  let page = await gget(d, env, path, params);
  for (let n = 0; page; n++) {
    out.push(...(page.data || []));
    const next = page.paging?.next;
    if (!next || n + 1 >= maxPages) break;
    const res = await d.xfetch(next);
    page = await res.json().catch(() => ({}));
    if (page.error) throw graphError(page, res.status);
  }
  return out;
}
async function gpost(d, env, path, params = {}) {
  if (!env.META_TOKEN) throw new Error('META_TOKEN is not set on the worker.');
  const body = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v != null) body.set(k, typeof v === 'string' ? v : typeof v === 'number' ? String(v) : JSON.stringify(v));
  body.set('access_token', env.META_TOKEN);
  const res = await d.xfetch(`${GRAPH}/${String(path).replace(/^\//, '')}`, { method: 'POST', body });
  const j = await res.json().catch(() => ({}));
  if (!res.ok || j.error) throw graphError(j, res.status);
  return j;
}

/* ---------------- brands and their Meta accounts ---------------- */
async function brandOf(env, d, want, ctx) {
  const w = String(want || ctx?.screen?.act_id || ctx?.screen?.act || '').trim();
  if (!w) return null;
  const accts = await d.listAccounts(env, false);
  const id = await resolveBrandId(env, w).catch(() => w);
  const lw = w.toLowerCase();
  return accts.find(a => a.act_id === id || a.meta_act === w) || accts.find(a => String(a.name).toLowerCase() === lw) || accts.find(a => String(a.name).toLowerCase().includes(lw)) || null;
}
async function metaActs(env, brandId) {
  const r = await env.DB.prepare(`SELECT c.external_id AS act, a.name AS name FROM connections c LEFT JOIN accounts a ON a.act_id = c.external_id
    WHERE c.brand_id = ?1 AND c.kind = 'meta' ORDER BY c.is_primary DESC, c.added_at`).bind(brandId).all().catch(() => ({ results: [] }));
  return (r.results || []).map(x => ({ act: x.act, name: x.name || x.act }));
}

/* ---------------- A. can Locus write to this ad account? ---------------- */
/** The token's own tasks on the account (MANAGE / ADVERTISE) and its ads_management scope. A yes is cached an
 *  hour in settings `metaCan:<act>`; a no for five minutes, so a grant made in Business settings shows quickly. */
export async function metaCan(env, act, d, name) {
  const key = `metaCan:${act}`;
  const hit = parse(await d.getSetting(env, key).catch(() => null), null);
  const fresh = hit && Date.now() - Date.parse(hit.at) < (hit.can ? 3600e3 : 300e3);
  let r = fresh ? hit : null;
  if (!r) {
    r = { at: new Date().toISOString(), tasks: [], scopes: null, error: null };
    try {
      const u = await gget(d, env, act, { fields: 'user_tasks,name' });
      r.tasks = u.user_tasks || u.tasks || [];
      r.name = u.name || null;
    } catch (e) { r.error = e.message; }
    try {
      const p = await gget(d, env, 'me/permissions');
      if (Array.isArray(p.data)) r.scopes = p.data.filter(x => x.status === 'granted').map(x => x.permission);
    } catch { /* a system-user token may not list permissions: the tasks decide */ }
    r.can = !r.error && r.tasks.some(t => t === 'MANAGE' || t === 'ADVERTISE') && (!r.scopes || r.scopes.includes('ads_management'));
    await d.putSetting(env, key, JSON.stringify(r)).catch(() => {});
  }
  const label = `${name || r.name || act} (${act})`;
  if (r.can) return { can: true, tasks: r.tasks };
  const fix = r.scopes && !r.scopes.includes('ads_management') && r.tasks.some(t => t === 'MANAGE' || t === 'ADVERTISE')
    ? `Locus can only read ${label}: the Meta token has no ads_management permission. Make a new Mobius Tools system user token with ads_management in Business settings > Users > System users (Business ID ${BUSINESS_ID}) and put it on the worker as META_TOKEN.`
    : `Locus can only read ${label}${r.error ? ` (${r.error})` : ''}. Give the Mobius Tools system user Manage campaigns on ${label} in Business settings > Ad accounts > Assign partners (Business ID ${BUSINESS_ID}), then ask again.`;
  return { can: false, tasks: r.tasks, fix };
}

/* ---------------- finding the object ---------------- */
const LEVELS = {
  campaign: { edge: 'campaigns', type: 'CAMPAIGN', fields: 'id,name,status,effective_status,objective,daily_budget,lifetime_budget,bid_strategy,account_id' },
  adset: { edge: 'adsets', type: 'ADSET', fields: 'id,name,status,effective_status,campaign_id,campaign{id,name,daily_budget,lifetime_budget},daily_budget,lifetime_budget,daily_min_spend_target,daily_spend_cap,bid_strategy,optimization_goal,account_id' },
  ad: { edge: 'ads', type: 'AD', fields: 'id,name,status,effective_status,adset_id,campaign_id,adset{id,name},creative{id},account_id' },
};
const LEVEL_WORD = { campaign: 'campaign', adset: 'ad set', ad: 'ad' };
/** The one object a write is about, by id or by name, inside the brand's own ad accounts. */
async function findObject(env, d, brand, target, level) {
  const metas = await metaActs(env, brand.act_id);
  if (!metas.length) return { error: `${brand.name} has no Meta ad account connected in Locus.` };
  const levels = level && LEVELS[level] ? [level] : ['adset', 'campaign', 'ad'];
  const t = String(target || '').trim();
  if (!t) return { error: 'Name the campaign, ad set or ad (or give its id).' };
  if (/^\d{6,}$/.test(t)) {
    let lastErr = null;
    for (const lv of levels) {
      try {
        const o = await gget(d, env, t, { fields: LEVELS[lv].fields });
        const act = `act_${o.account_id}`;
        const m = metas.find(x => x.act === act);
        if (!m) return { error: `${t} is in ad account ${act}, which is not ${brand.name}'s. Nothing outside the brand is touched.` };
        return { level: lv, obj: o, act, actName: m.name };
      } catch (e) { lastErr = e; }
    }
    return { error: `No ${levels.map(l => LEVEL_WORD[l]).join(' or ')} with id ${t} that Locus can read${lastErr ? ` (${lastErr.message})` : ''}.` };
  }
  const hits = [];
  for (const m of metas) for (const lv of levels) {
    const rows = await gall(d, env, `${m.act}/${LEVELS[lv].edge}`, { fields: 'id,name,effective_status', filtering: [{ field: `${lv}.name`, operator: 'CONTAIN', value: t }], limit: '50' }, 2).catch(() => []);
    for (const r of rows) hits.push({ level: lv, id: r.id, name: r.name, status: r.effective_status, act: m.act, actName: m.name });
  }
  const exact = hits.filter(h => String(h.name).toLowerCase() === t.toLowerCase());
  const pick = exact.length === 1 ? exact[0] : (!exact.length && hits.length === 1 ? hits[0] : null);
  if (!pick) {
    if (!hits.length) return { error: `Nothing in ${brand.name}'s Meta account is named like "${t}". Read the structure with meta_read and use the exact name or the id.` };
    const list = (exact.length ? exact : hits).slice(0, 8).map(h => `${LEVEL_WORD[h.level]} "${h.name}" (${h.id}, ${h.status})`).join('; ');
    return { error: `"${t}" matches more than one: ${list}. Say which, by id.` };
  }
  const obj = await gget(d, env, pick.id, { fields: LEVELS[pick.level].fields });
  return { level: pick.level, obj, act: pick.act, actName: pick.actName };
}
/** Brand, object and permission, in that order. Every Meta write's propose starts here. */
async function prep(env, d, input, ctx, level) {
  const brand = await brandOf(env, d, input.brand, ctx);
  if (!brand) return { error: `Which brand? No brand called "${input.brand || ''}".` };
  const f = await findObject(env, d, brand, input.target, level || input.level);
  if (f.error) return f;
  const can = await metaCan(env, f.act, d, f.actName);
  if (!can.can) return { error: can.fix };
  return { brand, cur: brand.currency || 'USD', ...f };
}

/* ---------------- the record: p_meta_write (undo) + activities (Change Log) ---------------- */
const WRITE_SQL = `CREATE TABLE IF NOT EXISTS p_meta_write (id TEXT PRIMARY KEY, act TEXT NOT NULL, brand TEXT, level TEXT, object TEXT NOT NULL,
  name TEXT, action TEXT NOT NULL, field TEXT, before TEXT, after TEXT, summary TEXT, by TEXT, at TEXT NOT NULL DEFAULT (datetime('now')), undone TEXT)`;
let tabled = false;
async function ensureTable(env) {
  if (tabled) return;
  await env.DB.prepare(WRITE_SQL).run();
  await env.DB.prepare(`CREATE INDEX IF NOT EXISTS p_meta_write_brand ON p_meta_write (brand, at)`).run().catch(() => {});
  tabled = true;
}
const approver = ctx => ctx?.who || 'someone in Locus';
async function record(env, p, ctx, { before, after, object, summary, category }) {
  await ensureTable(env);
  const id = rid('mw_');
  const by = approver(ctx);
  await env.DB.prepare(`INSERT INTO p_meta_write (id, act, brand, level, object, name, action, field, before, after, summary, by, at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13)`)
    .bind(id, p.act, p.brand, p.level, object || p.id, p.name || null, p.action, Object.keys(after || {}).join(','), before ? JSON.stringify(before) : null, after ? JSON.stringify(after) : null, summary, by, new Date().toISOString()).run();
  await logChange(env, p, { summary, category, by, object: object || p.id, via: ctx?.via, note: `Write ${id}. ${p.proposer && ctx?.via !== 'locus' ? `Proposed for ${p.proposer}. ` : ''}Undo within ${UNDO_HOURS}h${ctx?.via === 'locus' ? ' from the toast in Locus or' : ''} with meta_undo.` });
  return id;
}
async function logChange(env, p, { summary, category, by, object, note, via }) {
  /* A change made by hand on a Locus screen (ctx.via 'locus') is logged as that person's, not the Strategist's. */
  const locus = via === 'locus';
  await env.DB.prepare(`INSERT INTO activities (id, act_id, event_time, event_type, category, summary, reason, note, confirmed, manual, actor, object_type, object_id, object_name)
    VALUES (?1, ?2, ?3, ?12, ?4, ?5, ?6, ?7, 1, 1, ?8, ?9, ?10, ?11)`)
    .bind(`manual:${crypto.randomUUID()}`, p.act, new Date().toISOString(), category || 'other', summary, p.reason || null, note || null,
      locus ? `${by} in Locus` : `the Strategist, approved by ${by}`, LEVELS[p.level]?.type || null, object || p.id, p.name || null, locus ? 'locus_write' : 'strategist_write').run().catch(() => {});
}
/** Apply re-reads the object: a card made before someone else changed it must not overwrite that change. */
async function unchanged(env, d, p) {
  const keys = Object.keys(p.before || {});
  if (!keys.length) return null;
  const now = await gget(d, env, p.id, { fields: keys.join(',') });
  for (const k of keys) {
    const was = p.before[k] == null || p.before[k] === '' ? '0' : String(p.before[k]);
    const is = now[k] == null || now[k] === '' ? '0' : String(now[k]);
    if (was !== is) return `${p.name} changed since this card was made (${k} was ${was}, now ${is}). Nothing was written; ask again for a fresh card.`;
  }
  return null;
}
async function applyUpdate(env, d, p, ctx) {
  const moved = await unchanged(env, d, p);
  if (moved) return { error: moved };
  await gpost(d, env, p.id, p.after);
  const wid = await record(env, p, ctx, { before: p.before, after: p.after, summary: p.logLine, category: p.category });
  return { ok: true, write: wid, note: `${p.done} Logged in the Change Log (undo: ${wid}).` };
}

/* ---------------- B. the Meta actions ---------------- */
const TARGET = { type: 'string', description: 'The exact name, or the id, of the campaign / ad set / ad (read it with meta_read first).' };
const LEVEL = { type: 'string', enum: ['campaign', 'adset', 'ad'], description: 'Which kind it is. Give it whenever you know.' };
const REASON = { type: 'string', description: 'Why, in one line with the number behind it (shown on the card and written in the Change Log).' };
const base = (extra, req = []) => ({ type: 'object', properties: { brand: { type: 'string' }, target: TARGET, level: LEVEL, reason: REASON, ...extra }, required: ['brand', 'target', 'reason', ...req] });
const statusLine = o => `${o.status}${o.effective_status && o.effective_status !== o.status ? ` (delivering: ${o.effective_status})` : ''}`;
const common = (r, action, input, ctx) => ({ action, act: r.act, brand: r.brand.act_id, level: r.level, id: r.obj.id, name: r.obj.name, reason: clip(input.reason, 300), proposer: ctx?.who || null });

function statusAction(d, name, to) {
  const verb = to === 'PAUSED' ? 'Pause' : 'Turn on';
  return {
    name,
    description: `${verb} one campaign, ad set or ad in Meta. Name exactly one; nothing else is touched. Judge the ad set first; never ${to === 'PAUSED' ? 'pause the anchor of a working set' : 'turn on something paused for a reason without saying the reason is gone'}.`,
    input_schema: base({}),
    propose: async (env, input, h, ctx) => {
      const r = await prep(env, d, input, ctx); if (r.error) return r;
      if (r.obj.status === to) return { error: `${LEVEL_WORD[r.level]} "${r.obj.name}" is already ${to}.` };
      const parent = r.level !== 'campaign' && /^(CAMPAIGN|ADSET)_PAUSED$/.test(r.obj.effective_status || '') && to === 'ACTIVE'
        ? ` Its ${r.obj.effective_status === 'CAMPAIGN_PAUSED' ? 'campaign' : 'ad set'} is paused, so it will not deliver until that is on too.` : '';
      const cat = r.level === 'ad' ? (to === 'PAUSED' ? 'ad_paused' : 'ad_relaunched') : (to === 'PAUSED' ? 'campaign_paused' : 'campaign_relaunched');
      const line = `${verb} ${LEVEL_WORD[r.level]} "${r.obj.name}"`;
      return { summary: `${r.brand.name}: ${line}`, detail: `${r.obj.status} → ${to}. ${LEVEL_WORD[r.level]} ${r.obj.id} in ${r.actName}.${parent}\nWhy: ${clip(input.reason, 300)}`,
        patch: { ...common(r, name, input, ctx), before: { status: r.obj.status }, after: { status: to }, category: cat, logLine: `${line}: ${r.obj.status} → ${to}`, done: `${line}: done.` } };
    },
    apply: (env, p, h, ctx) => applyUpdate(env, d, p, ctx),
  };
}

const budgetAction = d => ({
  name: 'meta_budget',
  description: 'Change a campaign or ad set budget in Meta (daily or lifetime, whichever it runs on). Give the new amount in dollars. The card shows old and new and the % change. A change of more than 50% in one step is refused unless the person asked for it outright (then big: true). An ad set inside an Advantage campaign budget has no budget of its own: change the campaign.',
  input_schema: base({ amount: { type: 'number', description: 'The new budget in the account currency (dollars, not cents).' }, kind: { type: 'string', enum: ['daily', 'lifetime'] }, big: { type: 'boolean', description: 'Only when the person explicitly asked for a jump over 50%.' } }, ['amount']),
  propose: async (env, input, h, ctx) => {
    const r = await prep(env, d, input, ctx); if (r.error) return r;
    if (r.level === 'ad') return { error: 'Ads have no budget. Name the ad set or the campaign.' };
    const o = r.obj;
    const kind = +o.daily_budget > 0 ? 'daily' : +o.lifetime_budget > 0 ? 'lifetime' : null;
    if (!kind) return { error: r.level === 'adset' ? `"${o.name}" has no budget of its own: the campaign "${o.campaign?.name || o.campaign_id}" holds it (Advantage campaign budget). Change the campaign instead.` : `"${o.name}" has no campaign budget: its ad sets carry the budgets. Change an ad set.` };
    if (input.kind && input.kind !== kind) return { error: `"${o.name}" runs on a ${kind} budget, not a ${input.kind} one.` };
    const field = `${kind}_budget`, from = +o[field], to = Math.round(+input.amount * 100);
    if (!(to > 0)) return { error: 'The new budget must be more than zero.' };
    if (to === from) return { error: `The budget is already ${money(from, r.cur)}.` };
    const pc = pctText(from, to), step = Math.abs(to - from) / from;
    if (step > BIG_STEP && !input.big) return { error: `That is a ${pc} change (${money(from, r.cur)} → ${money(to, r.cur)}). The house rule is 50% or less a step so learning holds. Propose a smaller step, or big: true if the person asked for exactly this.` };
    const per = kind === 'daily' ? '/day' : ' lifetime';
    const line = `${LEVEL_WORD[r.level]} "${o.name}" budget ${money(from, r.cur)}${per} → ${money(to, r.cur)}${per} (${pc})`;
    return { summary: `${r.brand.name}: ${line}`, detail: `${LEVEL_WORD[r.level]} ${o.id} in ${r.actName}, ${statusLine(o)}${o.bid_strategy ? `, ${o.bid_strategy}` : ''}.${step > BIG_STEP ? ' Over 50% in one step, asked for outright.' : ''}\nWhy: ${clip(input.reason, 300)}`,
      patch: { ...common(r, 'meta_budget', input, ctx), before: { [field]: String(from) }, after: { [field]: String(to) }, category: 'budget', logLine: `Budget: ${line}`, done: `Budget changed: ${money(from, r.cur)}${per} → ${money(to, r.cur)}${per}.` } };
  },
  apply: (env, p, h, ctx) => applyUpdate(env, d, p, ctx),
});

const minSpendAction = d => ({
  name: 'meta_min_spend',
  description: 'Set or clear an ad set\'s daily minimum spend (daily_min_spend_target) and/or daily cap (daily_spend_cap) in Meta. Dollars; 0 clears it. Only ad sets inside an Advantage campaign budget have these.',
  input_schema: base({ min: { type: 'number', description: 'Daily minimum in dollars; 0 clears it. Omit to leave it.' }, cap: { type: 'number', description: 'Daily cap in dollars; 0 clears it. Omit to leave it.' } }),
  propose: async (env, input, h, ctx) => {
    const r = await prep(env, d, { ...input, level: 'adset' }, ctx, 'adset'); if (r.error) return r;
    const o = r.obj;
    if (input.min == null && input.cap == null) return { error: 'Give min, cap or both (0 clears).' };
    if (!(+o.campaign?.daily_budget > 0 || +o.campaign?.lifetime_budget > 0)) return { error: `"${o.name}" is not inside an Advantage campaign budget, so it has no minimum or cap to set.` };
    const before = {}, after = {}, parts = [];
    for (const [k, v, word] of [['daily_min_spend_target', input.min, 'Minimum'], ['daily_spend_cap', input.cap, 'Cap']]) {
      if (v == null) continue;
      const from = +o[k] || 0, to = Math.max(0, Math.round(+v * 100));
      if (from === to) continue;
      before[k] = String(from); after[k] = String(to);
      parts.push(`${word} ${money(from, r.cur)} → ${money(to, r.cur)}${to ? '/day' : ''}`);
    }
    if (!parts.length) return { error: 'Nothing would change: it is already set that way.' };
    const camp = +o.campaign.daily_budget > 0 ? `${money(+o.campaign.daily_budget, r.cur)}/day` : `${money(+o.campaign.lifetime_budget, r.cur)} lifetime`;
    const line = `ad set "${o.name}": ${parts.join(', ')}`;
    return { summary: `${r.brand.name}: ${line}`, detail: `Campaign "${o.campaign.name}" budget ${camp}. Ad set ${o.id}, ${statusLine(o)}.\nWhy: ${clip(input.reason, 300)}`,
      patch: { ...common(r, 'meta_min_spend', input, ctx), before, after, category: 'budget', logLine: `Spend limits: ${line}`, done: `Done: ${parts.join(', ')}.` } };
  },
  apply: (env, p, h, ctx) => applyUpdate(env, d, p, ctx),
});

const renameAction = d => ({
  name: 'meta_rename',
  description: 'Rename one campaign, ad set or ad in Meta. Keep the team\'s naming pattern (the number, the angle, the format after the last |).',
  input_schema: base({ new_name: { type: 'string' } }, ['new_name']),
  propose: async (env, input, h, ctx) => {
    const r = await prep(env, d, input, ctx); if (r.error) return r;
    const to = clip(String(input.new_name || '').trim(), 400);
    if (!to) return { error: 'Give the new name.' };
    if (to === r.obj.name) return { error: 'That is already its name.' };
    const line = `Rename ${LEVEL_WORD[r.level]} "${r.obj.name}" → "${to}"`;
    return { summary: `${r.brand.name}: ${line}`, detail: `${LEVEL_WORD[r.level]} ${r.obj.id} in ${r.actName}.\nWhy: ${clip(input.reason, 300)}`,
      patch: { ...common(r, 'meta_rename', input, ctx), before: { name: r.obj.name }, after: { name: to }, category: 'name', logLine: line, done: `Renamed to "${to}".` } };
  },
  apply: (env, p, h, ctx) => applyUpdate(env, d, p, ctx),
});

const duplicateAction = d => ({
  name: 'meta_duplicate_adset',
  description: 'Copy an ad set WITH its ads into the same campaign, PAUSED, under a new name; optionally with its own daily budget (an ad set that carries its own budget). Use it to scale a winner in a fresh set or to rerun a test. The copy stays paused until someone turns it on (meta_resume).',
  input_schema: base({ new_name: { type: 'string' }, daily_budget: { type: 'number', description: 'Dollars per day for the copy, when the set carries its own budget. Omit to keep the same.' } }, ['new_name']),
  propose: async (env, input, h, ctx) => {
    const r = await prep(env, d, { ...input, level: 'adset' }, ctx, 'adset'); if (r.error) return r;
    const o = r.obj, to = clip(String(input.new_name || '').trim(), 400);
    if (!to) return { error: 'Give the copy a name.' };
    if (input.daily_budget != null && !(+o.daily_budget > 0)) return { error: `"${o.name}" has no daily budget of its own (the campaign holds it), so the copy cannot take one.` };
    const ads = await gall(d, env, `${o.id}/ads`, { fields: 'id,effective_status', limit: '100' }, 2).catch(() => []);
    const nb = input.daily_budget != null ? Math.round(+input.daily_budget * 100) : null;
    const line = `Copy ad set "${o.name}" as "${to}" (PAUSED)`;
    return { summary: `${r.brand.name}: ${line}`, detail: `Into campaign "${o.campaign?.name || o.campaign_id}", with its ${ads.length} ad${ads.length === 1 ? '' : 's'}. Budget: ${+o.daily_budget > 0 ? `${money(nb ?? +o.daily_budget, r.cur)}/day${nb != null ? ` (the original runs ${money(+o.daily_budget, r.cur)}/day)` : ''}` : 'the campaign\'s'}. Stays paused until turned on.\nWhy: ${clip(input.reason, 300)}`,
      patch: { ...common(r, 'meta_duplicate_adset', input, ctx), new_name: to, daily_budget: nb, ads: ads.length, logLine: line } };
  },
  apply: async (env, p, h, ctx) => {
    const c = await gpost(d, env, `${p.id}/copies`, { deep_copy: 'true', status_option: 'PAUSED' });
    const nid = c.copied_adset_id || c.id;
    if (!nid) return { error: 'Meta did not return the copy\'s id.' };
    await gpost(d, env, nid, { name: p.new_name, ...(p.daily_budget ? { daily_budget: String(p.daily_budget) } : {}) });
    const wid = await record(env, { ...p, level: 'adset', name: p.new_name }, ctx, { before: null, after: { created: nid, from: p.id }, object: nid, summary: `${p.logLine}: new ad set ${nid}`, category: 'new_adset' });
    return { ok: true, write: wid, created: nid, note: `Copied: "${p.new_name}" (${nid}), paused, ${(c.ad_object_ids || []).length || p.ads} ads. Logged (undo: ${wid}).` };
  },
});

const CTAS = ['SHOP_NOW', 'LEARN_MORE', 'ORDER_NOW', 'BUY_NOW', 'GET_OFFER', 'SIGN_UP', 'SUBSCRIBE', 'DOWNLOAD', 'CONTACT_US', 'SEE_MORE', 'NO_BUTTON'];
/** The Facebook page (and Instagram account) an ad set's ads already run as; else the account's promotable page. */
async function pageFor(env, d, act, adsetId) {
  const ads = await gget(d, env, `${adsetId}/ads`, { fields: 'creative{object_story_spec,effective_object_story_id}', limit: '5' }).catch(() => ({ data: [] }));
  for (const a of ads.data || []) {
    const s = a.creative?.object_story_spec || {};
    const page = s.page_id || String(a.creative?.effective_object_story_id || '').split('_')[0];
    if (page) return { page_id: page, ig: s.instagram_user_id || s.instagram_actor_id || null, from: 'the ads already in this ad set' };
  }
  const pages = await gget(d, env, `${act}/promote_pages`, { fields: 'id,name', limit: '10' }).catch(() => ({ data: [] }));
  if ((pages.data || []).length === 1) return { page_id: pages.data[0].id, page_name: pages.data[0].name, ig: null, from: 'the ad account\'s page' };
  return { error: (pages.data || []).length ? `The ad account can run as ${pages.data.length} pages (${pages.data.map(p => `${p.name} ${p.id}`).join(', ')}). Say which with page_id.` : 'No Facebook page found for this ad account. Give page_id.' };
}
const createAdAction = d => ({
  name: 'meta_create_ad',
  description: 'Make a new ad in a named ad set: from an image URL the worker can download (a Studio final PNG, a Locus asset link; it is uploaded to the ad account) or an existing Meta video id, with the headline, primary text, link and button. It is created PAUSED unless live: true. The page and Instagram account are taken from the ads already in that set.',
  input_schema: { type: 'object', properties: {
    brand: { type: 'string' }, adset: { type: 'string', description: 'The ad set, exact name or id.' },
    image_url: { type: 'string' }, video_id: { type: 'string', description: 'An advideos id already in the ad account (instead of image_url).' },
    headline: { type: 'string' }, primary_text: { type: 'string' }, description: { type: 'string' },
    link: { type: 'string', description: 'The landing page URL.' }, cta: { type: 'string', enum: CTAS },
    ad_name: { type: 'string', description: 'The team\'s naming pattern; default the headline.' }, page_id: { type: 'string' },
    live: { type: 'boolean', description: 'Only when the person said to launch it live.' }, reason: REASON },
    required: ['brand', 'adset', 'primary_text', 'link', 'reason'] },
  propose: async (env, input, h, ctx) => {
    if (!input.image_url === !input.video_id) return { error: 'Give exactly one of image_url or video_id.' };
    if (!/^https:\/\//.test(input.link || '')) return { error: 'The link must be a full https:// URL.' };
    const r = await prep(env, d, { ...input, target: input.adset, level: 'adset' }, ctx, 'adset'); if (r.error) return r;
    const pg = input.page_id ? { page_id: String(input.page_id), ig: null, from: 'given' } : await pageFor(env, d, r.act, r.obj.id);
    if (pg.error) return pg;
    let media;
    if (input.image_url) {
      if (!/^https?:\/\//.test(input.image_url)) return { error: 'image_url must be a full URL the worker can download.' };
      const res = await fetchImage(env, d, input.image_url).catch(e => ({ ok: false, status: e.message }));
      const type = res.headers?.get?.('content-type') || '';
      if (!res.ok || !/^image\//.test(type)) return { error: `The worker could not download an image from ${input.image_url} (${res.ok ? type || 'not an image' : `HTTP ${res.status}`}). Give a public or Locus asset link.` };
      media = { image_url: input.image_url };
    } else {
      const v = await gget(d, env, String(input.video_id), { fields: 'id,title,picture' }).catch(e => ({ error: e.message }));
      if (v.error || !v.picture) return { error: `Meta video ${input.video_id} could not be read${v.error ? ` (${v.error})` : ' (no thumbnail yet; is it still processing?)'}.` };
      media = { video_id: String(v.id), thumb: v.picture };
    }
    const cta = CTAS.includes(input.cta) ? input.cta : 'SHOP_NOW';
    const status = input.live ? 'ACTIVE' : 'PAUSED';
    const name = clip(input.ad_name || input.headline || `New ad ${new Date().toISOString().slice(0, 10)}`, 300);
    return { summary: `${r.brand.name}: new ad "${name}" in "${r.obj.name}" (${status})`,
      detail: `${media.image_url ? `Image: ${media.image_url}` : `Video: ${media.video_id}`}\nHeadline: ${input.headline || '(none)'}\nPrimary text: ${clip(input.primary_text, 400)}\nLink: ${input.link} · Button: ${cta}\nPage ${pg.page_id}${pg.ig ? ` + Instagram ${pg.ig}` : ''} (${pg.from}).\nWhy: ${clip(input.reason, 300)}`,
      patch: { ...common(r, 'meta_create_ad', input, ctx), ad_name: name, media, page_id: pg.page_id, ig: pg.ig, headline: clip(input.headline, 255), primary_text: clip(input.primary_text, 3000), description: clip(input.description, 255), link: input.link, cta, status } };
  },
  apply: async (env, p, h, ctx) => {
    const cta = p.cta === 'NO_BUTTON' ? null : { type: p.cta, value: { link: p.link } };
    let spec;
    if (p.media.image_url) {
      const res = await fetchImage(env, d, p.media.image_url);
      if (!res.ok) return { error: `The image could not be downloaded any more (HTTP ${res.status}).` };
      const bytes = new Uint8Array(await res.arrayBuffer());
      let bin = ''; for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
      const up = await gpost(d, env, `${p.act}/adimages`, { bytes: btoa(bin) });
      const hash = Object.values(up.images || {})[0]?.hash;
      if (!hash) return { error: 'Meta took the image but returned no hash.' };
      spec = { page_id: p.page_id, ...(p.ig ? { instagram_user_id: p.ig } : {}), link_data: { image_hash: hash, link: p.link, message: p.primary_text, ...(p.headline ? { name: p.headline } : {}), ...(p.description ? { description: p.description } : {}), ...(cta ? { call_to_action: cta } : {}) } };
    } else {
      spec = { page_id: p.page_id, ...(p.ig ? { instagram_user_id: p.ig } : {}), video_data: { video_id: p.media.video_id, image_url: p.media.thumb, message: p.primary_text, ...(p.headline ? { title: p.headline } : {}), ...(p.description ? { link_description: p.description } : {}), call_to_action: cta || { type: 'LEARN_MORE', value: { link: p.link } } } };
    }
    const cr = await gpost(d, env, `${p.act}/adcreatives`, { name: p.ad_name, object_story_spec: spec });
    const ad = await gpost(d, env, `${p.act}/ads`, { name: p.ad_name, adset_id: p.id, creative: { creative_id: cr.id }, status: p.status });
    const wid = await record(env, { ...p, level: 'ad', name: p.ad_name }, ctx, { before: null, after: { created: ad.id, creative: cr.id }, object: ad.id, summary: `New ad "${p.ad_name}" in "${p.name}" (${p.status})`, category: 'new_creative' });
    return { ok: true, write: wid, created: ad.id, creative: cr.id, note: `Ad "${p.ad_name}" made (${ad.id}), ${p.status}. Ads Manager: https://adsmanager.facebook.com/adsmanager/manage/ads?act=${p.act.replace('act_', '')}&selected_ad_ids=${ad.id} (undo: ${wid}).` };
  },
});

const undoAction = d => ({
  name: 'meta_undo',
  description: 'Undo one of your own Meta writes from the last 24 hours: puts back the before-state (status, budget, minimum, name), or archives what was created (a copied ad set, a new ad). Give the write id from the Apply note, or "last" with the brand.',
  input_schema: { type: 'object', properties: { brand: { type: 'string' }, write: { type: 'string', description: 'mw_... id, or "last".' }, reason: REASON }, required: ['write'] },
  propose: async (env, input, h, ctx) => {
    await ensureTable(env);
    const since = new Date(Date.now() - UNDO_HOURS * 3600e3).toISOString();
    let w;
    if (/^last$/i.test(input.write || '')) {
      const brand = await brandOf(env, d, input.brand, ctx);
      if (!brand) return { error: 'Which brand\'s last write?' };
      w = await env.DB.prepare(`SELECT * FROM p_meta_write WHERE brand = ?1 AND undone IS NULL AND action != 'meta_undo' ORDER BY at DESC LIMIT 1`).bind(brand.act_id).first();
    } else w = await env.DB.prepare(`SELECT * FROM p_meta_write WHERE id = ?1`).bind(String(input.write || '')).first();
    if (!w) return { error: 'No write by that id (or nothing to undo for that brand).' };
    if (w.undone) return { error: `That write was already undone (${w.undone}).` };
    if (w.at < since) return { error: `That write is older than ${UNDO_HOURS} hours (${w.at}). Make the change again as a new card instead.` };
    const can = await metaCan(env, w.act, d); if (!can.can) return { error: can.fix };
    const after = parse(w.after, {}), before = parse(w.before, null);
    const created = !before && after.created;
    const params = created ? { status: 'ARCHIVED' } : before;
    let warn = '';
    if (!created) {
      const now = await gget(d, env, w.object, { fields: Object.keys(before).join(',') }).catch(() => null);
      if (now && Object.keys(after).some(k => String(now[k] ?? '0') !== String(after[k]))) warn = ' It has been changed again since; undoing puts back the state before your write anyway.';
    }
    return { summary: `Undo: ${clip(w.summary, 120)}`, detail: `${created ? `Archive ${w.level === 'ad' ? 'ad' : 'ad set'} ${w.object} (made by this write).` : `Put back ${Object.entries(before).map(([k, v]) => `${k} = ${v}`).join(', ')} on ${w.name || w.object}.`} Approved by ${w.by} at ${w.at.slice(0, 16).replace('T', ' ')} UTC.${warn}${input.reason ? `\nWhy: ${clip(input.reason, 300)}` : ''}`,
      patch: { write: w.id, object: w.object, params, act: w.act, brand: w.brand, level: w.level, name: w.name, summary: w.summary, reason: clip(input.reason, 300) } };
  },
  apply: async (env, p, h, ctx) => {
    await ensureTable(env);
    const w = await env.DB.prepare(`SELECT undone FROM p_meta_write WHERE id = ?1`).bind(p.write).first();
    if (w?.undone) return { error: 'Already undone.' };
    await gpost(d, env, p.object, p.params);
    const by = approver(ctx);
    await env.DB.prepare(`UPDATE p_meta_write SET undone = ?2 WHERE id = ?1`).bind(p.write, `${new Date().toISOString()} by ${by}`).run();
    await logChange(env, { ...p, id: p.object }, { summary: `Undone: ${p.summary}`, category: 'other', by, object: p.object, via: ctx?.via, note: `Undo of ${p.write}.` });
    return { ok: true, note: `Undone: ${p.summary}.` };
  },
});

/* ---------------- E. meta_read (a tool, reads only) ---------------- */
const LIVE = ['ACTIVE', 'IN_PROCESS', 'WITH_ISSUES', 'PENDING_REVIEW', 'PREAPPROVED'];
function targetingSummary(t) {
  if (!t) return null;
  const g = t.geo_locations || {};
  const out = {
    ages: t.age_min || t.age_max ? `${t.age_min || 18}-${t.age_max || 65}` : undefined,
    genders: t.genders?.length ? (t.genders.includes(1) && t.genders.includes(2) ? 'all' : t.genders.includes(1) ? 'men' : 'women') : 'all',
    where: [...(g.countries || []), ...(g.regions || []).map(r => r.name), ...(g.cities || []).map(c => c.name)].slice(0, 8).join(', ') || undefined,
    audiences: (t.custom_audiences || []).map(a => a.name || a.id).slice(0, 6),
    excluded: (t.excluded_custom_audiences || []).map(a => a.name || a.id).slice(0, 6),
    interests: (t.flexible_spec || []).flatMap(f => (f.interests || []).map(i => i.name)).slice(0, 8),
    advantage_audience: t.targeting_automation?.advantage_audience === 1 ? true : undefined,
    placements: t.publisher_platforms ? t.publisher_platforms.join(', ') : 'Advantage+ placements',
  };
  for (const k of Object.keys(out)) if (out[k] === undefined || (Array.isArray(out[k]) && !out[k].length)) delete out[k];
  return out;
}
export function metaTools(d) {
  return [{
    def: { name: 'meta_read',
      description: 'Read a brand\'s Meta ad account LIVE from Meta: every campaign and ad set with status, budget (dollars), bid strategy, optimisation, minimum / cap and a targeting summary; ads (with creative ids) when asked or for one ad set. Read this BEFORE proposing any Meta change, so the card names the right thing with the right numbers. Performance numbers are not here: use the views and query_locus for those (Triple Whale attributed).',
      input_schema: { type: 'object', properties: {
        brand: { type: 'string' }, status: { type: 'string', enum: ['live', 'all'], description: 'live (default) = delivering or about to; all = paused too.' },
        campaign: { type: 'string', description: 'Only this campaign (words in its name, or its id).' },
        adset: { type: 'string', description: 'Only this ad set, with its ads.' }, ads: { type: 'boolean', description: 'Include the ads under every ad set listed.' } } } },
    run: async (env, input, ctx) => {
      const brand = await brandOf(env, d, input.brand, ctx);
      if (!brand) return { is_error: true, text: 'Which brand?' };
      const metas = await metaActs(env, brand.act_id);
      if (!metas.length) return { is_error: true, text: `${brand.name} has no Meta ad account connected.` };
      const cur = brand.currency || 'USD';
      const live = input.status !== 'all';
      const eff = live ? [{ field: 'effective_status', operator: 'IN', value: LIVE }] : null;
      const m$ = c => +c > 0 ? money(+c, cur) : undefined;
      const accounts = [];
      for (const m of metas) {
        try {
          const camps = await gall(d, env, `${m.act}/campaigns`, { fields: LEVELS.campaign.fields, limit: '100', ...(eff ? { filtering: eff } : {}) }, 3);
          const sets = await gall(d, env, `${m.act}/adsets`, { fields: LEVELS.adset.fields.replace('campaign{id,name,daily_budget,lifetime_budget},', '') + ',targeting', limit: '100', ...(eff ? { filtering: eff } : {}) }, 3);
          const cw = String(input.campaign || '').toLowerCase(), sw = String(input.adset || '').toLowerCase();
          const campsF = camps.filter(c => !cw || c.id === input.campaign || String(c.name).toLowerCase().includes(cw));
          const setsF = sets.filter(s => (!cw || campsF.some(c => c.id === s.campaign_id)) && (!sw || s.id === input.adset || String(s.name).toLowerCase().includes(sw)));
          let ads = [];
          if (input.ads || input.adset) {
            const ids = setsF.map(s => s.id).slice(0, 50);
            if (ids.length) ads = await gall(d, env, `${m.act}/ads`, { fields: 'id,name,adset_id,status,effective_status,creative{id,name}', limit: '100',
              filtering: [{ field: 'adset.id', operator: 'IN', value: ids }, ...(eff || [])] }, 3);
          }
          accounts.push({ ad_account: m.act, name: m.name, campaigns: campsF.map(c => ({
            id: c.id, name: c.name, status: c.effective_status || c.status, objective: c.objective, bid_strategy: c.bid_strategy,
            budget: m$(c.daily_budget) ? `${m$(c.daily_budget)}/day (campaign budget)` : m$(c.lifetime_budget) ? `${m$(c.lifetime_budget)} lifetime (campaign budget)` : 'set on the ad sets',
            adsets: setsF.filter(s => s.campaign_id === c.id).map(s => ({
              id: s.id, name: s.name, status: s.effective_status || s.status,
              budget: m$(s.daily_budget) ? `${m$(s.daily_budget)}/day` : m$(s.lifetime_budget) ? `${m$(s.lifetime_budget)} lifetime` : undefined,
              min_per_day: m$(s.daily_min_spend_target), cap_per_day: m$(s.daily_spend_cap), bid_strategy: s.bid_strategy, optimisation: s.optimization_goal,
              targeting: targetingSummary(s.targeting),
              ads: ads.length ? ads.filter(a => a.adset_id === s.id).map(a => ({ id: a.id, name: a.name, status: a.effective_status || a.status, creative: a.creative?.id })) : undefined,
            })),
          })) });
        } catch (e) { accounts.push({ ad_account: m.act, name: m.name, error: e.message }); }
      }
      const s = JSON.stringify({ brand: brand.name, currency: cur, read: new Date().toISOString(), showing: live ? 'live only (status all for paused)' : 'everything not deleted', accounts });
      return { text: s.length > 20000 ? s.slice(0, 20000) + '... (trimmed: narrow it with campaign or adset)' : s };
    },
  }];
}

/* ---------------- C. Asana ---------------- */
const asanaDoc = async (env, act) => parse((await env.DB.prepare(`SELECT data_json FROM p_br_doc WHERE act_id = ?1 AND line_id = '' AND key = 'asana'`).bind(act).first().catch(() => null))?.data_json, null);
async function asanaUserByName(env, doc, name) {
  if (!name || !doc?.workspace) return null;
  const list = await asanaAll(env, `/users?workspace=${doc.workspace}&opt_fields=name,email`).catch(() => []);
  const w = String(name).toLowerCase().trim();
  return (list || []).find(u => String(u.name || '').toLowerCase() === w) || (list || []).find(u => String(u.name || '').toLowerCase().startsWith(w)) || null;
}
/** A task by gid, Asana link, brief number or words in its name (open tasks of the brand's project). */
async function findTask(env, d, input, ctx) {
  const t = String(input.task || '').trim();
  const gid = /^\d{10,}$/.test(t) ? t : (t.match(/app\.asana\.com\/\S*?(\d{10,})(?:\/f)?\/?(?:\?|$)/) || t.match(/task\/(\d{10,})/) || [])[1];
  if (gid) return { task: await asana(env, `/tasks/${gid}?opt_fields=name,completed,permalink_url,assignee.name,projects.name`) };
  const brand = await brandOf(env, d, input.brand, ctx);
  if (!brand) return { error: 'Which brand? (or give the task link)' };
  const doc = await asanaDoc(env, brand.act_id);
  if (!doc?.project_gid) return { error: `${brand.name} is not connected to Asana yet (Locus, Brand tab, Brand info).` };
  const list = await asanaAll(env, `/tasks?project=${doc.project_gid}&completed_since=now&opt_fields=name,permalink_url,completed`).catch(() => []);
  const num = /^\d{1,5}$/.test(t) ? +t : null;
  const hits = num != null ? list.filter(x => parseInt(numOf(x.name), 10) === num) : list.filter(x => String(x.name).toLowerCase().includes(t.toLowerCase()));
  if (hits.length !== 1) return { error: hits.length ? `"${t}" matches ${hits.length} open tasks: ${hits.slice(0, 6).map(x => x.name).join('; ')}. Give the link.` : `No open task in ${brand.name}'s project matches "${t}".` };
  return { task: hits[0] };
}
export function asanaActions(d) {
  return [
    { name: 'asana_task',
      description: 'Make a task in a brand\'s Asana project (a to-do for the team: fix a page, send footage, check a test). For creative briefs use create_brief instead. Section by name (default the project\'s first), assignee by first name, due date.',
      input_schema: { type: 'object', properties: { brand: { type: 'string' }, name: { type: 'string' }, notes: { type: 'string' }, section: { type: 'string' }, assignee: { type: 'string' }, due: { type: 'string', description: 'YYYY-MM-DD' } }, required: ['brand', 'name'] },
      propose: async (env, i, h, ctx) => {
        const brand = await brandOf(env, d, i.brand, ctx); if (!brand) return { error: `No brand called "${i.brand}".` };
        const doc = await asanaDoc(env, brand.act_id);
        if (!doc?.project_gid) return { error: `${brand.name} is not connected to Asana yet (Locus, Brand tab, Brand info).` };
        const secs = await asana(env, `/projects/${doc.project_gid}/sections?opt_fields=name`).catch(() => []);
        const sec = i.section ? (secs || []).find(s => String(s.name).toLowerCase().includes(String(i.section).toLowerCase())) : null;
        if (i.section && !sec) return { error: `No section like "${i.section}". Sections: ${(secs || []).map(s => s.name).join(', ')}.` };
        const user = i.assignee ? await asanaUserByName(env, doc, i.assignee) : null;
        if (i.assignee && !user) return { error: `No Asana user called "${i.assignee}".` };
        if (i.due && !/^\d{4}-\d{2}-\d{2}$/.test(i.due)) return { error: 'due is YYYY-MM-DD.' };
        const name = clip(i.name, 200);
        return { summary: `${brand.name}: Asana task "${name}"`, detail: `${sec ? sec.name : 'First section'}${user ? `, assigned to ${user.name}` : ''}${i.due ? `, due ${i.due}` : ''}.${i.notes ? `\n${clip(i.notes, 600)}` : ''}`,
          patch: { project_gid: doc.project_gid, section_gid: sec?.gid || null, name, notes: clip(i.notes, 6000) || '', assignee: user?.gid || null, due: i.due || null } };
      },
      apply: async (env, p) => {
        const t = await asana(env, '/tasks?opt_fields=name,permalink_url', { method: 'POST', body: { name: p.name, projects: [p.project_gid], notes: p.notes, ...(p.assignee ? { assignee: p.assignee } : {}), ...(p.due ? { due_on: p.due } : {}) } });
        if (p.section_gid) await asana(env, `/sections/${p.section_gid}/addTask`, { method: 'POST', body: { task: t.gid } }).catch(() => {});
        return { ok: true, note: `Task made: ${t.permalink_url || t.gid}` };
      } },
    { name: 'asana_comment',
      description: 'Comment on an Asana task (by link, brief number or words in its name): a result, a decision, a nudge. Plain words; it is posted under the Asana account the worker holds.',
      input_schema: { type: 'object', properties: { brand: { type: 'string' }, task: { type: 'string' }, text: { type: 'string' } }, required: ['task', 'text'] },
      propose: async (env, i, h, ctx) => {
        const f = await findTask(env, d, i, ctx); if (f.error) return f;
        return { summary: `Comment on "${clip(f.task.name, 80)}"`, detail: clip(i.text, 1000), patch: { gid: f.task.gid, url: f.task.permalink_url, text: clip(i.text, 8000) } };
      },
      apply: async (env, p) => { await asana(env, `/tasks/${p.gid}/stories`, { method: 'POST', body: { text: p.text } }); return { ok: true, note: `Commented${p.url ? `: ${p.url}` : '.'}` }; } },
    { name: 'asana_complete',
      description: 'Mark an Asana task complete (by link, brief number or words in its name).',
      input_schema: { type: 'object', properties: { brand: { type: 'string' }, task: { type: 'string' } }, required: ['task'] },
      propose: async (env, i, h, ctx) => {
        const f = await findTask(env, d, i, ctx); if (f.error) return f;
        if (f.task.completed) return { error: `"${f.task.name}" is already complete.` };
        return { summary: `Complete "${clip(f.task.name, 80)}"`, detail: f.task.permalink_url || f.task.gid, patch: { gid: f.task.gid, url: f.task.permalink_url, name: f.task.name } };
      },
      apply: async (env, p) => { await asana(env, `/tasks/${p.gid}`, { method: 'PUT', body: { completed: true } }); return { ok: true, note: `Completed: ${p.name}` }; } },
  ];
}

/* ---------------- D. Google Drive (as Cole, through the service account's delegation) ---------------- */
const driveIdOf = s => { const t = String(s || '').trim(); return (t.match(/\/folders\/([\w-]{10,})/) || t.match(/\/d\/([\w-]{10,})/) || t.match(/[?&]id=([\w-]{10,})/) || (/^[\w-]{10,}$/.test(t) ? [0, t] : []))[1] || null; };
async function brandFolder(env, brandId) {
  const c = await env.DB.prepare(`SELECT external_id FROM connections WHERE brand_id = ?1 AND kind = 'drive' LIMIT 1`).bind(brandId).first().catch(() => null);
  if (c?.external_id) return driveIdOf(c.external_id);
  const p = parse((await env.DB.prepare(`SELECT data_json FROM p_br_doc WHERE act_id = ?1 AND line_id = '' AND key = 'profile'`).bind(brandId).first().catch(() => null))?.data_json, {});
  if (p?.drive) return driveIdOf(p.drive);
  const n = await env.DB.prepare(`SELECT drive_url FROM p_newclient WHERE act_id = ?1 AND drive_url IS NOT NULL LIMIT 1`).bind(brandId).first().catch(() => null);
  return n?.drive_url ? driveIdOf(n.drive_url) : null;
}
async function gdrive(env, d, scope, path, init = {}) {
  let tok;
  try { tok = await googleToken(env, OWNER, scope); }
  catch (e) { throw new Error(scope === DRIVE_RW ? `Locus may only READ Google Drive. In Google Admin (Security > API controls > Domain-wide delegation) add the scope ${DRIVE_RW} to the Locus service account. (${e.message})` : e.message); }
  const res = await d.xfetch(`https://www.googleapis.com/drive/v3/${path}`, { method: init.method || 'GET', headers: { Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json' }, body: init.body ? JSON.stringify(init.body) : undefined });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Google Drive: ${j.error?.message || res.status}`);
  return j;
}
const FILE_FIELDS = 'id,name,mimeType,modifiedTime,webViewLink,size';
export function driveTools(d) {
  return [{
    def: { name: 'drive_list',
      description: 'List a Google Drive folder (the brand\'s own folder by default, or any folder link) or search Drive by name. Returns names, kinds, dates and links. Read before copying or sharing.',
      input_schema: { type: 'object', properties: { brand: { type: 'string' }, folder: { type: 'string', description: 'A folder link or id; default the brand\'s folder.' }, q: { type: 'string', description: 'Words in the file name.' } } } },
    run: async (env, input, ctx) => {
      let folder = driveIdOf(input.folder);
      if (!folder && !input.q) {
        const brand = await brandOf(env, d, input.brand, ctx);
        if (!brand) return { is_error: true, text: 'Which brand, folder or search?' };
        folder = await brandFolder(env, brand.act_id);
        if (!folder) return { is_error: true, text: `${brand.name} has no Drive folder linked (Locus Settings > Connections).` };
      }
      const q = [folder ? `'${folder}' in parents` : null, input.q ? `name contains '${String(input.q).replace(/'/g, "\\'")}'` : null, 'trashed = false'].filter(Boolean).join(' and ');
      try {
        const j = await gdrive(env, d, DRIVE_RO, `files?supportsAllDrives=true&includeItemsFromAllDrives=true&pageSize=100&orderBy=folder,modifiedTime desc&fields=files(${FILE_FIELDS})&q=${encodeURIComponent(q)}`);
        const rows = (j.files || []).map(f => ({ id: f.id, name: f.name, kind: f.mimeType === 'application/vnd.google-apps.folder' ? 'folder' : f.mimeType.replace('application/vnd.google-apps.', 'google ').replace(/^(image|video|application)\//, '$1 '), modified: String(f.modifiedTime || '').slice(0, 10), link: f.webViewLink }));
        return { text: JSON.stringify({ folder, files: rows }).slice(0, 16000) };
      } catch (e) { return { is_error: true, text: e.message }; }
    },
  }];
}
export function driveActions(d) {
  return [
    { name: 'drive_copy_to',
      description: 'Copy a Google Drive file into a folder (the brand\'s folder by default, or a subfolder of it by name, or any folder link), optionally renamed. Files only, not folders.',
      input_schema: { type: 'object', properties: { brand: { type: 'string' }, file: { type: 'string', description: 'File link or id.' }, to: { type: 'string', description: 'Folder link or id; default the brand\'s folder.' }, subfolder: { type: 'string', description: 'A folder name inside the destination.' }, name: { type: 'string' } }, required: ['file'] },
      propose: async (env, i, h, ctx) => {
        const fid = driveIdOf(i.file); if (!fid) return { error: 'Give the file link or id.' };
        let to = driveIdOf(i.to), brand = null;
        if (!to) { brand = await brandOf(env, d, i.brand, ctx); if (!brand) return { error: 'Which folder or brand?' }; to = await brandFolder(env, brand.act_id); if (!to) return { error: `${brand.name} has no Drive folder linked.` }; }
        const f = await gdrive(env, d, DRIVE_RO, `files/${fid}?supportsAllDrives=true&fields=${FILE_FIELDS}`);
        if (f.mimeType === 'application/vnd.google-apps.folder') return { error: 'That is a folder; only files can be copied.' };
        let dest = await gdrive(env, d, DRIVE_RO, `files/${to}?supportsAllDrives=true&fields=id,name,webViewLink`);
        if (i.subfolder) {
          const kids = (await gdrive(env, d, DRIVE_RO, `files?supportsAllDrives=true&includeItemsFromAllDrives=true&fields=files(id,name,webViewLink)&q=${encodeURIComponent(`'${to}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`)}`)).files || [];
          const sub = kids.find(k => k.name.toLowerCase() === String(i.subfolder).toLowerCase()) || kids.find(k => k.name.toLowerCase().includes(String(i.subfolder).toLowerCase()));
          if (!sub) return { error: `No folder "${i.subfolder}" in ${dest.name}. Folders there: ${kids.map(k => k.name).join(', ') || 'none'}.` };
          dest = sub;
        }
        const name = clip(i.name || f.name, 300);
        return { summary: `Copy "${clip(f.name, 60)}" to ${clip(dest.name, 60)}`, detail: `${f.webViewLink || fid} → ${dest.webViewLink || dest.id}${name !== f.name ? `, named "${name}"` : ''}.`, patch: { fid, dest: dest.id, destName: dest.name, name } };
      },
      apply: async (env, p) => {
        const c = await gdrive(env, d, DRIVE_RW, `files/${p.fid}/copy?supportsAllDrives=true&fields=id,name,webViewLink`, { method: 'POST', body: { name: p.name, parents: [p.dest] } });
        return { ok: true, note: `Copied to ${p.destName}: ${c.webViewLink || c.id}` };
      } },
    { name: 'drive_share',
      description: 'Share a Google Drive file or folder with one email address as viewer, commenter or editor. Someone outside Mobius is a CLIENT-FACING step: say so in the reason.',
      input_schema: { type: 'object', properties: { file: { type: 'string', description: 'File or folder link or id.' }, email: { type: 'string' }, role: { type: 'string', enum: ['reader', 'commenter', 'writer'] }, notify: { type: 'boolean', description: 'Send Google\'s share email (default no).' } }, required: ['file', 'email'] },
      propose: async (env, i) => {
        const fid = driveIdOf(i.file); if (!fid) return { error: 'Give the file or folder link.' };
        const email = String(i.email || '').trim().toLowerCase();
        if (!/^[^@\s]+@[^@\s]+\.[a-z]{2,}$/.test(email)) return { error: 'That is not an email address.' };
        const role = ['reader', 'commenter', 'writer'].includes(i.role) ? i.role : 'reader';
        const f = await gdrive(env, d, DRIVE_RO, `files/${fid}?supportsAllDrives=true&fields=${FILE_FIELDS}`);
        const outside = !email.endsWith('@go-mobius-digital.com');
        const word = { reader: 'view', commenter: 'comment', writer: 'edit' }[role];
        return { summary: `Share "${clip(f.name, 60)}" with ${email} (${word})${outside ? ', outside Mobius' : ''}`, detail: `${f.webViewLink || fid}. ${i.notify ? 'Google emails them.' : 'No email is sent; send them the link.'}${outside ? ' This person is not on the Mobius domain.' : ''}`,
          patch: { fid, email, role, notify: !!i.notify, name: f.name, link: f.webViewLink } };
      },
      apply: async (env, p) => {
        await gdrive(env, d, DRIVE_RW, `files/${p.fid}/permissions?supportsAllDrives=true&sendNotificationEmail=${p.notify}`, { method: 'POST', body: { type: 'user', role: p.role, emailAddress: p.email } });
        return { ok: true, note: `Shared "${p.name}" with ${p.email}.${p.link ? ` ${p.link}` : ''}` };
      } },
  ];
}

/* ---------------- assembly ---------------- */
export function metaActions(d) {
  return [statusAction(d, 'meta_pause', 'PAUSED'), statusAction(d, 'meta_resume', 'ACTIVE'), budgetAction(d), minSpendAction(d), renameAction(d), duplicateAction(d), createAdAction(d), undoAction(d)];
}
/** Everything here for strategist.js: `tools` (reads) and `actions` (Apply cards). */
export function writeTools(d) { return [...metaTools(d), ...driveTools(d)]; }
export function writeActions(d) { return [...metaActions(d), ...asanaActions(d), ...driveActions(d)]; }
/* ---------------- C. the same writes from a Locus screen (2026-10-09) ----------------
   Ads > Meta > Campaigns edits in place: a status switch, the budget, the minimum, a rename, a copy of an ad set.
   The route (worker.js POST /api/meta/write) runs the SAME propose and apply as the Strategist's Apply card, so the
   lookup, the brand check, the Manage check, the before/after, the p_meta_write row (undo) and the Change Log line
   are one code path. Two calls: dry (the confirm modal shows the summary and detail), then the write itself, which
   proposes again from a fresh read and refuses when the before-state is not what the modal showed (`expect`). The
   person typed the exact budget, so a step over 50% is allowed (big) and the modal says so. */
const KIND = { pause: 'meta_pause', resume: 'meta_resume', budget: 'meta_budget', min_spend: 'meta_min_spend', rename: 'meta_rename', duplicate: 'meta_duplicate_adset' };
export const LOCUS_KINDS = Object.keys(KIND);
function locusInput(b) {
  const lv = ['campaign', 'adset', 'ad'].includes(b.level) ? b.level : undefined;
  const base = { brand: String(b.act || ''), target: String(b.object || ''), level: lv, reason: clip(b.reason || 'Changed by hand in Locus', 300) };
  if (b.kind === 'budget') return { ...base, amount: +b.amount, big: true };
  if (b.kind === 'min_spend') return { ...base, ...(b.min != null && b.min !== '' ? { min: +b.min } : {}), ...(b.cap != null && b.cap !== '' ? { cap: +b.cap } : {}) };
  if (b.kind === 'rename') return { ...base, new_name: b.name };
  if (b.kind === 'duplicate') return { ...base, new_name: b.name, ...(b.daily_budget != null && b.daily_budget !== '' ? { daily_budget: +b.daily_budget } : {}) };
  return base;
}
export async function locusWrite(env, d, b, ctx) {
  const name = KIND[b.kind];
  if (!name) return { error: 'Unknown change.' };
  if (!/^\d{6,}$/.test(String(b.object || ''))) return { error: 'Which campaign, ad set or ad? (id missing)' };
  const act = metaActions(d).find(a => a.name === name);
  const c = { ...ctx, via: 'locus', screen: { act_id: b.act } };
  const p = await act.propose(env, locusInput(b), null, c);
  if (p.error) return { error: p.error };
  const step = p.patch.before && p.patch.after ? Object.keys(p.patch.after).map(k => ({ field: k, from: p.patch.before[k] ?? null, to: p.patch.after[k] })) : null;
  if (b.dry) return { ok: true, dry: true, summary: p.summary, detail: p.detail, level: p.patch.level, name: p.patch.name, step, before: p.patch.before || null };
  if (b.expect && p.patch.before) {
    for (const [k, v] of Object.entries(b.expect)) if (k in p.patch.before && String(p.patch.before[k] ?? '0') !== String(v ?? '0'))
      return { error: `"${p.patch.name}" changed since you opened this (${k} is now ${p.patch.before[k]}, was ${v}). Nothing was written; look again.`, stale: true };
  }
  const r = await act.apply(env, p.patch, null, c);
  if (r.error) return { error: r.error };
  return { ok: true, summary: p.summary, note: r.note, write: r.write || null, created: r.created || null, level: p.patch.level, object: p.patch.id, name: p.patch.name, after: p.patch.after || null, act: p.patch.act };
}
/** Undo from the toast: the write must be this brand's and under 24 hours old (meta_undo's own checks). */
export async function locusUndo(env, d, b, ctx) {
  await ensureTable(env);
  const w = await env.DB.prepare(`SELECT id, brand, object, level, before, after FROM p_meta_write WHERE id = ?1`).bind(String(b.write || '')).first();
  if (!w) return { error: 'Nothing to undo by that id.' };
  if (b.act && w.brand !== b.act) return { error: 'That change belongs to another brand.' };
  const act = metaActions(d).find(a => a.name === 'meta_undo');
  const c = { ...ctx, via: 'locus' };
  const p = await act.propose(env, { write: w.id, reason: 'Undone from the toast in Locus' }, null, c);
  if (p.error) return { error: p.error };
  const r = await act.apply(env, p.patch, null, c);
  if (r.error) return { error: r.error };
  return { ok: true, note: r.note, object: w.object, level: w.level, before: parse(w.before, null), after: parse(w.after, null) };
}
/** Live state for the Campaigns screen: status, budgets and spend limits straight from Meta, plus whether the token
 *  may write, so a read-only account says why on the controls instead of failing at the click. */
export async function metaLive(env, d, brandId) {
  const metas = await metaActs(env, brandId);
  if (!metas.length) return { error: 'No Meta ad account connected.' };
  const out = { accounts: [], campaigns: {}, adsets: {}, ads: {} };
  const c2 = v => (v == null || v === '' || !(+v > 0) ? null : +v / 100);
  for (const m of metas) {
    const can = await metaCan(env, m.act, d, m.name);
    out.accounts.push({ act: m.act, name: m.name, can: can.can, fix: can.can ? null : can.fix });
    const [cs, ss, as] = await Promise.all([
      gall(d, env, `${m.act}/campaigns`, { fields: 'id,name,status,effective_status,daily_budget,lifetime_budget', limit: '200' }, 3).catch(() => []),
      gall(d, env, `${m.act}/adsets`, { fields: 'id,name,status,effective_status,campaign_id,daily_budget,lifetime_budget,daily_min_spend_target,daily_spend_cap', limit: '300' }, 3).catch(() => []),
      gall(d, env, `${m.act}/ads`, { fields: 'id,status,effective_status', limit: '500' }, 4).catch(() => []),
    ]);
    for (const c of cs) out.campaigns[c.id] = { act: m.act, name: c.name, status: c.status, eff: c.effective_status, daily: c2(c.daily_budget), lifetime: c2(c.lifetime_budget) };
    for (const s of ss) out.adsets[s.id] = { act: m.act, name: s.name, status: s.status, eff: s.effective_status, campaign: s.campaign_id, daily: c2(s.daily_budget), lifetime: c2(s.lifetime_budget), min: c2(s.daily_min_spend_target), cap: c2(s.daily_spend_cap) };
    for (const a of as) out.ads[a.id] = { act: m.act, status: a.status, eff: a.effective_status };
  }
  out.can = out.accounts.some(a => a.can);
  return out;
}
/* Read helpers for launch.js (Launch to Meta, 2026-10-10): the same Graph reads and the brand's Meta accounts. */
export { gget, gall, metaActs };
export const _test = { findObject, driveIdOf, targetingSummary, WRITE_SQL, resetTable: () => { tabled = false; } };

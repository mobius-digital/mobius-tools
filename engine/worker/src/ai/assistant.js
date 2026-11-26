/* Group ai, the assistant: the free lookup list, its settings, its usage, what it found, the agency brief.
   All of this is the agency team's. A client login never reaches it (the route rows say so). */
// from account-health/worker/src/lookups.js (lookupDoor GET, lookupMode, lookupShare)
// from account-health/worker/src/worker.js (the /api/ask/settings, usage, findings and brief routes)
// from account-health/worker/src/stratmem.js (usageSummary) and ask/engine.js (openFindings, memory, pendingList, getBrief, getPlaybook)
import { isEngineError } from '../platform/errors.js';
import { safeJson, isPlainObject } from '../platform/text.js';
import { dayIn } from '../platform/time.js';
import { swallowed } from '../platform/log.js';
import { pct } from '../numbers/defs.js';
import { LOOKUPS, LOOKUP_SETTING, REVENUE_DEF, PRESETS, ASK_KEYS, ASK_TZ } from './fixed.js';

const DAY = 86400e3;
const SEVERITY = { high: 3, med: 2, low: 1 };
const since = (ctx, days) => new Date(ctx.now.getTime() - days * DAY).toISOString();
const listOf = (text) => safeJson(text, []) || [];

/* The share of questions each lane took in the last 30 days. null when it cannot be read, as before. */
async function lookupShare(ctx, days = 30) {
  let rows;
  try {
    rows = await ctx.db.all('ai.share', { since: since(ctx, days) });
  } catch (e) {
    if (isEngineError(e)) throw e;
    swallowed('the lookup share could not be read, so the answer goes out without it, as the old route did', e);
    return null;
  }
  const by = Object.fromEntries(rows.map(x => [x.kind, x]));
  const free = (by.lookup && by.lookup.n) || 0, big = (by.assistant && by.assistant.n) || 0;
  const share = pct(free, free + big);
  return { days, lookups: free, assistant: big, share_pct: share == null ? null : Math.round(1000 * share) / 10,
    lookup_cost: ((by.lookup && by.lookup.cost) || 0) + ((by.router && by.router.cost) || 0),
    assistant_cost: (by.assistant && by.assistant.cost) || 0 };
}

/** GET /api/lookups: the questions that are answered free, and whether that is switched on. */
export async function listLookups(ctx) {
  const v = await ctx.settings.get(LOOKUP_SETTING);
  const mode = v === 'on' || v === 'code' ? v : null;
  const out = { on: !!mode, mode: mode || 'off', setting: LOOKUP_SETTING, revenue: REVENUE_DEF, free: true,
    lookups: LOOKUPS.map(l => ({ ...l, page: { ...l.page } })) };
  if (mode) out.share = await lookupShare(ctx);
  return out;
}

/** GET /api/ask/settings: the depth, the standing instructions, the channels it reads. */
export async function askSettings(ctx) {
  return { model: (await ctx.settings.get(ASK_KEYS.model)) || 'smart', presets: PRESETS,
    instructions: (await ctx.settings.get(ASK_KEYS.instructions)) || '',
    indexChannels: (await ctx.settings.get(ASK_KEYS.indexChannels)) || '',
    channel: await ctx.settings.get(ASK_KEYS.channel) };
}

/** GET /api/ask/usage?days=30: answers and cost, by day, person, model and brand, and the last 40. */
export async function askUsage(ctx, input) {
  const days = Math.min(90, Number(input.query.days) || 30);
  const p = { since: since(ctx, days) };
  const [total, by_day, by_person, by_model, by_brand, recent] = await ctx.db.batch([['ai.usageTotal', p], ['ai.usageByDay', p],
    ['ai.usageByPerson', p], ['ai.usageByModel', p], ['ai.usageByBrand', p], ['ai.usageRecent', p]]);
  return { days, ...(total[0] || {}), by_day, by_person, by_model, by_brand, recent };
}

function evidenceOf(text) {
  try {
    return JSON.parse(text || '{}');
  } catch {
    return {};   // not JSON: the old code showed an empty object for it too
  }
}

async function openFindings(ctx) {
  const rows = await ctx.db.all('ai.findingsOpen', { today: dayIn(ASK_TZ, ctx.now) });
  return rows.map(r => ({ ...r, evidence: evidenceOf(r.evidence) }))
    .sort((a, b) => (SEVERITY[b.severity] || 0) - (SEVERITY[a.severity] || 0) || (b.amount || 0) - (a.amount || 0));
}

/** GET /api/ask/findings: what the assistant found, what it remembers, the agency brief and playbook.
 *  The brief and the playbook have a default text that lives in old code. When neither was ever saved
 *  here, this one request goes to the old worker. */
export async function askFindings(ctx) {
  const get = key => ctx.settings.get(ASK_KEYS[key]);
  const brief = await get('brief'), playbook = await get('playbook');
  if (!brief || !playbook) return ctx.forward('the default brief or playbook text lives in old code');
  const cutoff = ctx.now.getTime() - 24 * 3600e3;
  return { findings: await openFindings(ctx), briefing: safeJson(await get('lastBriefing'), null),
    memory: { notes: listOf(await get('notes')), watches: listOf(await get('watches')), muted: listOf(await get('muted')) },
    brief, channel: await get('channel'), playbook,
    pending: listOf(await get('pending')).filter(x => x && Date.parse(x.at) > cutoff)
      // card words only: a held input (patch, preview, rows) never reaches a team screen (main PR 336, pendingCards)
      .map(p => ({ id: p.id, action: p.action, ...(p.tool ? { tool: true } : {}), summary: p.summary, detail: p.detail, at: p.at })) };
}

/** PUT /api/ask/brief {text}: the "about your agency" text every answer reads. One settings row. */
export async function saveBrief(ctx, input) {
  const body = isPlainObject(input.body) ? input.body : {};
  await ctx.settings.put(ASK_KEYS.brief, String(body.text || '').slice(0, 4000));
  return { ok: true };
}

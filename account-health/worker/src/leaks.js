/* THE LEAK FINDER (2026-10-13, docs/handoffs/leak-finder.md). Cole: "Is there anything where we can see where things
 * are leaking? Google Ads, PMax search terms, YouTube, TikTok, Meta, the general funnel, landing pages, conversion rate
 * drop-offs against the industry... at the top of each thing." It also replaces Viktor's weekly Search Term Report: the
 * negative keyword suggestions here carry an Apply that adds the negative in Google Ads.
 *
 * ONE engine, one ranked list per brand: GET /api/leaks?act=<brand>&days=30 returns leaks, each
 *   { id, area, title, number, benchmark, cost, cost_how, fix, who, apply, go, items? }
 * ranked by `cost` (estimated dollars a month). Areas: google_search | google_pmax | google_video | meta | tiktok |
 * funnel | landing_page | email. Every benchmark names its source and year (BENCH below); a brand under a stated data
 * floor reads "not enough data yet" in `areas[area]` instead of a verdict. Cached an hour per brand and window in
 * settings (`leaks:<brand>:<days>`).
 *
 * Sources, all read through code that already exists (nothing here recomputes another screen's rule):
 *   Google   google.js leakAds (search terms with no conversion, PMax search categories, video and Demand Gen views,
 *            every campaign) + the brand's own cut line (Ads rules: cr_cut_zero_x / cr_cut_spend_x / cr_cut_cpa_x, the
 *            same numbers Meta's calls use) applied to Google's own conversions.
 *   Meta     the media buyer's list (profit hub.js buyerList, read over the PROFIT binding like todaypost.js): its Cut
 *            and Trim rows, money at stake x 30/7. Not recomputed.
 *   TikTok   tiktok.js tiktokReport when linked (the same cut line on TikTok's own purchases); else one line.
 *   Funnel   google.js leakFunnel: GA4 sessions with add_to_cart / begin_checkout / purchase by device, the window
 *            against the 90 days before it. A step is a leak when it is more than 20% under its benchmark AND under
 *            the brand's own 90 days. Cost = the orders the step would add at the benchmark rate (carried down the
 *            rest of the funnel at the brand's own rates) x the brand's AOV.
 *   Landing  paid landing pages (GA4, paid channel groups) with 500+ paid sessions converting under 70% of the paid
 *            site rate. Cost = sessions x the gap x paid AOV. Top 5.
 *   Email    Klaviyo flows (klaviyo.js): a core flow missing, or a flow switched off that earned and was not replaced.
 *
 * JUDGED FROM CONTEXT, NEVER A WORD LIST (Cole's rule): ONE Sonnet call per brand per hour reads the short brand brain
 * (what the brand sells) and labels every non-converting search term and PMax category irrelevant / relevant / brand,
 * and reads the flow list to say which core flows are missing and what replaced a switched-off flow.
 *
 * Writes: POST /api/leaks/apply {act, id, term, confirm} adds an exact-match negative keyword on the term's campaign
 * (google.js adsNegative: validateOnly first, then the write), files a Change Log line, and returns `undo`;
 * POST /api/leaks/undo {act, resource} removes it. Clients reach the same routes for their own brand (brandguard),
 * which today allows Google writes (/api/google/write is on CLIENT_RULES).
 */
import { leakAds, leakFunnel, adsNegative, linkFor } from './google.js';
import { klaviyoView } from './klaviyo.js';
import { tiktokReport } from './tiktok.js';
import { brandBrain } from './brain.js';
import { readToday } from './todaypost.js';
import { teamOf } from './calendar.js';
import { contextFor, review, mergeReview, lessonsFor, lessonsText, addLesson, deleteLesson, decideLesson, meter } from './leakctx.js';

const MODEL = 'claude-sonnet-5-5';
const TTL = 3600e3;   // the plain list: no AI, so an hour (the Google and GA4 reads under it cache an hour too)
/* THE AI CHECK IS ON DEMAND (Cole, 2026-10-13: "make it a button... that way we don't have to waste money"). Measured on
   Lucky and Bonk the same day: one AI check = the search-term judge (~3 cents) + the cross-check (~3 cents), about 6 cents
   a brand. It runs when someone presses "Run the AI check" (ai=1), and on Monday's morning card for every brand (the
   weekly check that replaces Viktor's report). Every other read is the plain list plus the LAST check's labels and
   verdicts, stored in `leaksAI:<brand>:<days>`, at no AI cost. A search term or a leak the last check never saw is shown
   as not checked yet. */
const SKIP = /golf sock|harborline/i;

/* ---------- benchmarks: every number names its source and year ----------
   Littledata publishes medians for Shopify stores on GA4, by device, over a rolling 90 days (captured 2026-10-07:
   Jul 6 to Oct 3, 2026, 423 to 426 stores). No publisher puts out an add to cart to checkout rate; that step is
   derived from Littledata's own medians (conversion / (add to cart x checkout completion)) and says so. Sources and
   dates are in docs/strategist-brain/knowledge/website-cro.md section 2. */
export const BENCH = {
  atc: { label: 'Add to cart', all: 0.068, mobile: 0.054, desktop: 0.099, src: 'Littledata, Oct 2026, median of 423 Shopify stores' },
  checkout: { label: 'Cart to checkout', all: 0.40, mobile: 0.45, desktop: 0.38, src: 'estimated from Littledata medians, Oct 2026; no one publishes this step' },
  purchase: { label: 'Checkout to purchase', all: 0.52, mobile: 0.62, desktop: 0.40, src: 'Littledata, Oct 2026, median of 425 Shopify stores' },
};
/* Klaviyo's 2026 Omnichannel Benchmark Report (published 2026-10-02): email revenue per recipient by flow. */
export const FLOW_RPR = { welcome: 5.75, abandoned_cart: 6.77, browse_abandonment: 2.08, post_purchase: 1.80, winback: 0.82 };
const FLOW_SRC = 'Klaviyo 2026 Omnichannel Benchmark Report, email revenue per recipient';
const CORE = { welcome: 'welcome', abandoned_cart: 'abandoned cart', browse_abandonment: 'browse abandonment', post_purchase: 'post purchase', winback: 'win-back' };

/* Floors: under these a step or page says "not enough data yet" instead of a verdict (website-cro.md section 3). */
export const FLOOR = { sessions: 1000, events: 300, lp_sessions: 500, term_spend: 1, pmax_clicks: 10, cost: 50 };

const WHO = { google_search: 'Google buyer', google_pmax: 'Google buyer', google_video: 'Google buyer', meta: 'Meta buyer', tiktok: 'TikTok buyer', funnel: 'Strategist (site)', landing_page: 'Strategist (site)', email: 'Email owner' };
/* Who owns it: the brand's own roster (the season call sheet: strategist, buyer, email owner; calendar.js teamOf). */
const ROLE = { google_search: 'buyer', google_pmax: 'buyer', google_video: 'buyer', meta: 'buyer', tiktok: 'buyer', funnel: 'strat', landing_page: 'strat', email: 'email' };
const GO = { google_search: 'gterms', google_pmax: 'gcampaigns', google_video: 'gcampaigns', meta: 'today', tiktok: 'tiktok', funnel: 'website', landing_page: 'website', email: 'email' };
export const AREA_PAGE = { google: ['google_search', 'google_pmax', 'google_video'], meta: ['meta'], tiktok: ['tiktok'], website: ['funnel', 'landing_page'], email: ['email'] };

const r2 = v => Math.round(v * 100) / 100;
const pc = (v, d = 1) => v == null || !isFinite(v) ? '–' : `${(v * 100).toFixed(d)}%`;
const sym = c => (!c || c === 'USD' ? '$' : c === 'GBP' ? '£' : c === 'EUR' ? '€' : c === 'CAD' ? 'CA$' : c === 'AUD' ? 'A$' : c + ' ');
const safe = (s, fb) => { try { return s ? JSON.parse(s) : fb; } catch { return fb; } };
const addDays = (d, n) => new Date(Date.parse(d + 'T12:00:00Z') + n * 864e5).toISOString().slice(0, 10);
const yesterday = () => new Date(Date.now() - 864e5).toISOString().slice(0, 10);

/* ---------- the judge: one Sonnet call per brand per hour ---------- */
const JUDGE_SCHEMA = {
  type: 'object', additionalProperties: false, required: ['terms', 'categories', 'flows'],
  properties: {
    terms: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['i', 'label', 'why'], properties: { i: { type: 'integer' }, label: { type: 'string', enum: ['irrelevant', 'relevant', 'brand'] }, why: { type: 'string' } } } },
    categories: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['i', 'label', 'why'], properties: { i: { type: 'integer' }, label: { type: 'string', enum: ['irrelevant', 'relevant', 'brand'] }, why: { type: 'string' } } } },
    flows: { type: 'object', additionalProperties: false, required: ['missing', 'replaced'],
      properties: { missing: { type: 'array', items: { type: 'string', enum: Object.keys(CORE) } },
        replaced: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['off', 'by'], properties: { off: { type: 'string' }, by: { type: 'string' } } } } } },
  },
};
export function judgeSystem(brand, brain, lessons = '') {
  return `You audit wasted money for ${brand}, a brand Mobius Digital runs ads for. Plain words, no em dashes.

WHAT THE BRAND SELLS (its brain; judge every search from this, never from a word list):
${brain || '(no brain yet: judge from the brand name and the campaign names)'}

TASK 1, search terms. Each line is a Google search that cost money and did not convert. Label each:
- brand: the person searched for this brand or its own products by name (misspellings too).
- relevant: a shopper could plausibly want what this brand sells (its category, a product type it makes, a use it serves), even if this click did not buy.
- irrelevant: the brand does not sell this, or the searcher wants something else (another brand's own product line, a different product type, jobs, free, DIY, a different sport, a different meaning of a word). These become negative keywords, so be sure: when in doubt, relevant.
"why" = a few plain words a media buyer can check ("another brand's putter", "a hybrid, they sell wedges"). Every fact in "why" must be true from the brain above; never say the brand does not sell something unless the brain shows its whole range.

TASK 2, Performance Max search categories (Google groups searches into categories). Same three labels, same care.

TASK 3, email flows. From the flow list (name, trigger, status, revenue over 90 days), say which CORE flows the account has NO live version of: welcome (new subscriber), abandoned_cart (cart or checkout abandonment), browse_abandonment, post_purchase (thank you, cross-sell, review ask after an order), winback (lapsed customers). Judge from what each flow is for, not its exact words. Then for every flow that is NOT live but earned revenue, name the live flow that replaced it (its id) in "replaced", or leave it out when nothing replaced it.
${lessons ? `
THE TEAM'S LESSONS (follow the ones marked HOLDS or PARTLY):
${lessons}
` : ''}Return JSON only.`;
}
export async function judge(env, d, brand, brain, terms, cats, flows, lessons = '') {
  if (!terms.length && !cats.length && !flows.length) return { terms: [], categories: [], flows: { missing: [], replaced: [] } };
  if (!env.ANTHROPIC_API_KEY) throw new Error('no model key');
  const user = [
    `SEARCH TERMS (i | search | campaign | spend | clicks):\n${terms.map((t, i) => `${i} | ${t.term} | ${t.campaign} | $${t.spend.toFixed(2)} | ${t.clicks}`).join('\n') || '(none)'}`,
    `PERFORMANCE MAX CATEGORIES (i | category | campaign | clicks):\n${cats.map((c, i) => `${i} | ${c.label} | ${c.campaign} | ${c.clicks}`).join('\n') || '(none)'}`,
    `FLOWS (id | name | trigger | status | revenue 90 days):\n${flows.map(f => `${f.id} | ${f.name} | ${f.trigger || ''} | ${f.status} | $${Math.round(f.revenue || 0)}`).join('\n') || '(no Klaviyo)'}`,
  ].join('\n\n');
  const r = await d.xfetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({ model: MODEL, max_tokens: 8000, system: judgeSystem(brand, brain, lessons), output_config: { effort: 'low', format: { type: 'json_schema', schema: JUDGE_SCHEMA } }, messages: [{ role: 'user', content: user }] }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error?.message || `Claude HTTP ${r.status}`);
  const out = safe((j.content || []).filter(b => b.type === 'text').map(b => b.text).join(''), null);
  if (!out) throw new Error('The judge came back empty.');
  out.usd = await meter(env, j.usage, 'judge'); out.usage = j.usage || null;
  return out;
}

/* ---------- the brand's own rules (the cut line Meta's calls use) ---------- */
const RULE_DEF = { cr_cut_zero_x: 3, cr_cut_spend_x: 2, cr_cut_cpa_x: 1.5 };
async function brandRow(env, act) {
  const a = await env.DB.prepare(`SELECT act_id, name, currency, tz, target_cpa FROM brand_accounts WHERE act_id = ?1`).bind(act).first().catch(() => null);
  if (!a) return null;
  const doc = await env.DB.prepare(`SELECT data_json FROM p_br_doc WHERE act_id = ?1 AND line_id = '' AND key = 'rules'`).bind(act).first().catch(() => null);
  const tool = await env.DB.prepare(`SELECT value FROM settings WHERE key = ?1`).bind(`emailTool:${act}`).first().catch(() => null);
  a.email_tool = tool?.value || 'klaviyo';
  const R = { ...RULE_DEF }; const dj = safe(doc?.data_json, {}) || {};
  for (const k of Object.keys(RULE_DEF)) if (+dj[k] > 0) R[k] = +dj[k];
  R.goal = +dj.target_cpa > 0 ? +dj.target_cpa : +a.target_cpa > 0 ? +a.target_cpa : null;
  return { ...a, R };
}
/** Over the cut line: no sale after cut_zero_x goals, or cut_cpa_x the goal after cut_spend_x goals. Cost = what was
 *  spent beyond goal x sales, a month. */
export function overCutLine(R, spend, conv) {
  if (!R.goal || !(spend > 0)) return null;
  if (conv < 0.5 && spend >= R.cr_cut_zero_x * R.goal) return { why: 'no_sale', excess: spend };
  const cpa = conv > 0 ? spend / conv : null;
  if (cpa != null && spend >= R.cr_cut_spend_x * R.goal && cpa > R.cr_cut_cpa_x * R.goal) return { why: 'cpa', cpa, excess: Math.max(0, spend - R.goal * conv) };
  return null;
}

/* ---------- the funnel against the benchmarks ---------- */
const STEPS = [['atc', 'sessions', 'atc', FLOOR.sessions], ['checkout', 'atc', 'checkout', FLOOR.events], ['purchase', 'checkout', 'purchase', FLOOR.events]];
const DEV_LABEL = { mobile: 'phones', desktop: 'desktop', tablet: 'tablets' };
export function funnelLeaks(f, days, money, cur) {
  const out = [], notes = [];
  const scale = 30 / days;
  for (const [dev, v] of Object.entries(f.devices || {})) {
    if (!BENCH.atc[dev]) continue;   // tablets and smart TVs: no published benchmark, too few sessions anyway
    const c = v.cur || {}, b = v.base || {};
    const aov = c.purchases ? c.revenue / c.purchases : b.purchases ? b.revenue / b.purchases : null;
    for (const [k, den, numK, floor] of STEPS) {
      const n = c[den] || 0, rate = n ? (c[numK] || 0) / n : null, bn = b[den] || 0, base = bn ? (b[numK] || 0) / bn : null;
      const bench = BENCH[k][dev];
      if (n < floor) { notes.push(`${BENCH[k].label} on ${DEV_LABEL[dev]}: ${n.toLocaleString('en-US')} ${den === 'sessions' ? 'sessions' : den === 'atc' ? 'carts' : 'checkouts'}, under the ${floor.toLocaleString('en-US')} floor.`); continue; }
      if (rate == null || !(rate < bench * 0.8) || !(base == null || rate < base)) continue;
      /* The orders the step would add at the benchmark, carried down the rest of the funnel at the brand's own rates. */
      const down = k === 'atc' ? (c.atc ? (c.purchase || 0) / c.atc : 0) : k === 'checkout' ? (c.checkout ? (c.purchase || 0) / c.checkout : 0) : 1;
      const orders = n * (bench - rate) * down;
      if (!aov || !(orders > 0)) continue;
      const cost = orders * aov * scale;
      out.push({ id: `funnel:${dev}:${k}`, area: 'funnel',
        title: `${BENCH[k].label} on ${DEV_LABEL[dev]}: ${pc(rate)}, the benchmark is ${pc(bench)}`,
        number: `${pc(rate)} of ${n.toLocaleString('en-US')} ${den === 'sessions' ? 'sessions' : den === 'atc' ? 'carts' : 'checkouts'} (GA4, last ${days} days); your own 90 days before: ${pc(base)}`,
        benchmark: `${pc(bench)} on ${DEV_LABEL[dev]} (${BENCH[k].src})`,
        cost, cost_how: `${Math.round(orders * scale)} more orders a month if this step hit ${pc(bench)}, carried down your own funnel, x ${money(aov)} AOV on ${DEV_LABEL[dev]}`,
        fix: k === 'atc' ? `Worth a look at the product pages people land on from ${DEV_LABEL[dev]}: price, shipping and returns above the fold, reviews near the button, a sticky add to cart.`
          : k === 'checkout' ? `Worth a look at the cart on ${DEV_LABEL[dev]}: a surprise shipping cost, a slow cart drawer, or a discount box that sends people looking for codes; express checkout buttons in the cart often help.`
            : `Worth comparing shipping cost and delivery time at checkout with what the product page promised on ${DEV_LABEL[dev]}, and checking that Shop Pay and Apple Pay show.`,
        rate, base, bench, device: dev, step: k });
    }
  }
  return { leaks: out, notes };
}

/* ---------- the list for one brand ---------- */
export async function leaksFor(env, d, act, { days = 30, fresh = false, ai = false } = {}) {
  const key = `leaks:${act}:${days}`, aiKey = `leaksAI:${act}:${days}`;
  if (!fresh && !ai) { const hit = safe(await d.getSetting(env, key), null); if (hit && Date.now() - Date.parse(hit.as_of) < TTL) return { ...hit, cached: true }; }
  const a = await brandRow(env, act);
  if (!a) return { error: 'unknown brand' };
  const to = yesterday(), from = addDays(to, -(days - 1)), bto = addDays(from, -1), bfrom = addDays(bto, -89);
  const cur = a.currency || 'USD', money = v => v == null || !isFinite(v) ? '–' : `${sym(cur)}${Math.round(v).toLocaleString('en-US')}`;
  const scale = 30 / days;
  const areas = {}, leaks = [];
  const link = await linkFor(env, act).catch(() => ({}));
  const R = a.R;
  const team = (await teamOf(env, [act]).catch(() => ({})))[act] || {};
  const ownerOf = area => { const n = team[ROLE[area]]; return n && !/^the /.test(n) ? n : ''; };
  const lessons = await lessonsFor(env, act).catch(() => []);
  const last = ai ? null : safe(await d.getSetting(env, aiKey), null);   // the last AI check (labels and verdicts)

  /* Every read in parallel; a source that fails says so in `areas` and never sinks the rest. */
  const [g, f, kl, today, tt, store] = await Promise.all([
    link.ads ? leakAds(env, act, from, to).catch(e => ({ error: e.message })) : null,
    link.ga4 ? leakFunnel(env, act, from, to, bfrom, bto).catch(e => ({ error: e.message })) : null,
    a.email_tool === 'attentive' ? null : Promise.all([(d.klaviyo || klaviyoView)(env, act, 'flows_report'), (d.klaviyo || klaviyoView)(env, act, 'daily')]).catch(e => [{ error: e.message }, null]),
    (d.profit || env.PROFIT) ? readToday(env, d, act).catch(e => ({ error: e.message })) : null,
    (d.tiktok || tiktokReport)(env, act, from, to).catch(e => ({ error: e.message })),
    env.DB.prepare(`SELECT SUM(CASE WHEN metric = 'totalOrders' THEN value END) orders, SUM(CASE WHEN metric = 'tiktok_spend' OR metric = 'tiktokAdsSpend' THEN value END) tt_spend FROM tw_daily WHERE act_id = ?1 AND date BETWEEN ?2 AND ?3`).bind(act, from, to).first().catch(() => null),
  ]);
  const flowsR = kl && kl[0] && !kl[0].error ? kl[0] : null, daily = kl && kl[1] && !kl[1].error ? kl[1] : null;

  /* ONE judge call over the search terms, the PMax categories and the flows. */
  const terms = g && !g.error ? (g.terms || []).filter(t => t.spend >= FLOOR.term_spend).slice(0, 150) : [];
  const cats = g && !g.error ? (g.pmax || []).flatMap(p => (p.categories || []).filter(c => c.clicks >= FLOOR.pmax_clicks && c.conversions < 0.5).map(c => ({ ...c, campaign: p.campaign, campaign_id: p.campaign_id, cpc: p.clicks ? p.spend / p.clicks : null }))) : [];
  const flows = flowsR ? (flowsR.flows || []) : [];
  let J = null, judgeErr = null, aiUsd = 0, aiUse = {};
  const tKey = t => `${t.term}|${t.campaign_id}`, cKey = c => `${c.label}|${c.campaign_id}`;
  let labels = last && last.labels ? last.labels : null;
  if (ai) {
    try {
      if (d.canAfford && !d.canAfford(3)) throw new Error('out of budget this hour');
      const brain = (await brandBrain(env, act, { short: true, creator: false, voice: false }).catch(() => ({ md: '' }))).md || '';
      J = await judge(env, d, a.name, brain.slice(0, 9000), terms, cats, flows, lessonsText(lessons, ['google_search', 'google_pmax', 'email']));
      labels = { terms: {}, cats: {}, flows: J.flows || { missing: [], replaced: [] } };
      for (const x of J.terms || []) if (terms[x.i]) labels.terms[tKey(terms[x.i])] = { label: x.label, why: x.why };
      for (const x of J.categories || []) if (cats[x.i]) labels.cats[cKey(cats[x.i])] = { label: x.label, why: x.why };
    } catch (e) { judgeErr = e.message; }
  } else if (!labels) judgeErr = 'not checked yet';
  const labelT = i => labels && labels.terms[tKey(terms[i])], labelC = i => labels && labels.cats[cKey(cats[i])];
  const unseen = labels ? terms.filter(t => !labels.terms[tKey(t)]).length : terms.length;
  if (!J && labels) J = { flows: labels.flows };

  /* --- Google --- */
  if (!link.ads) areas.google = { state: 'not_linked', note: 'Google Ads is not linked for this brand (Brand settings > Integrations).' };
  else if (!g || g.error) areas.google = { state: 'error', note: g?.error || 'Google Ads did not answer.', fix: g?.fix || null };
  else {
    areas.google = { state: 'ok' };
    /* Search terms: the irrelevant ones become ONE leak with a negative keyword per term. */
    if (judgeErr === 'not checked yet') areas.google.note = 'Search terms are judged by the AI check (every Monday, or Run the AI check on Home > Day check).';
    else if (judgeErr) areas.google.note = `Search terms were not judged: ${judgeErr}.`;
    else if (unseen && !ai) areas.google.note = `${unseen} search term${unseen === 1 ? '' : 's'} with spend came in since the last AI check; the next check judges ${unseen === 1 ? 'it' : 'them'}.`;
    const bad = terms.map((t, i) => ({ t, l: labelT(i) })).filter(x => x.l && x.l.label === 'irrelevant').map(({ t, l }) => ({ term: t.term, campaign: t.campaign, campaign_id: t.campaign_id, campaign_type: t.campaign_type, ad_group: t.ad_group, spend: r2(t.spend), clicks: t.clicks, why: l.why, status: t.status }))
      .filter(x => x.status !== 'excluded' && x.status !== 'added excluded');
    if (bad.length) {
      const sp = bad.reduce((s, x) => s + x.spend, 0);
      leaks.push({ id: 'google_search:negatives', area: 'google_search', title: `${bad.length} search${bad.length === 1 ? '' : 'es'} that ${bad.length === 1 ? 'has' : 'have'} nothing to do with ${a.name}`,
        number: `${money(sp)} spent on them in the last ${days} days, no conversion (Google Ads)`, benchmark: 'Any spend on a search for something the brand does not sell is waste.',
        cost: sp * scale, cost_how: `what they cost in the last ${days} days, as a month`,
        fix: 'Worth blocking each as an exact negative keyword on its campaign. Add negative does it in Google Ads after you confirm; leave any you want to keep.', apply: { kind: 'negative', count: bad.length }, items: bad.slice(0, 40) });
    }
    /* PMax search categories with clicks and no sale, judged irrelevant: no API write for a category, so the fix
       names the account-level negative list in Google Ads. */
    const pbad = cats.map((c, i) => ({ c, l: labelC(i) })).filter(x => x.l && x.l.label === 'irrelevant').map(({ c, l }) => ({ label: c.label, campaign: c.campaign, clicks: c.clicks, est: c.cpc != null ? r2(c.clicks * c.cpc) : null, why: l.why }));
    if (pbad.length) {
      const sp = pbad.reduce((s, x) => s + (x.est || 0), 0);
      leaks.push({ id: 'google_pmax:categories', area: 'google_pmax', title: `Performance Max shows up for ${pbad.length} search${pbad.length === 1 ? '' : 'es'} the brand does not sell`,
        number: `${pbad.reduce((s, x) => s + x.clicks, 0)} clicks, no conversion (Google Ads search categories, last ${days} days)`, benchmark: 'Any spend on a search for something the brand does not sell is waste.',
        cost: sp * scale, cost_how: 'Google gives no cost per category, so clicks x the campaign’s own cost per click',
        fix: 'Worth adding these to the account-level negative keyword list in Google Ads (Tools > Shared library > Negative keyword lists). Google does not let Locus add negatives to Performance Max by API.', items: pbad.slice(0, 30), keep: true });
    }
    /* Campaigns over the brand's cut line on Google's own conversions: PMax, video and Demand Gen, Search. */
    for (const c of g.campaigns || []) {
      const over = overCutLine(R, c.spend, c.conversions);
      if (!over) continue;
      const area = c.type === 'PERFORMANCE_MAX' ? 'google_pmax' : (c.type === 'VIDEO' || c.type === 'DEMAND_GEN') ? 'google_video' : 'google_search';
      const v = (g.video || []).find(x => x.id === c.id);
      leaks.push({ id: `${area}:camp:${c.id}`, area, title: `"${c.name}" costs ${over.why === 'no_sale' ? 'money with no sale' : `${(over.cpa / R.goal).toFixed(1)}x the goal per sale`}`,
        number: `${money(c.spend)} spent, ${c.conversions.toFixed(1)} conversions${over.cpa ? `, ${money(over.cpa)} each` : ''} (Google Ads, its own count, last ${days} days)${v && v.views ? `; ${v.views.toLocaleString('en-US')} views, ${pc(v.view_rate)} view rate, ${sym(cur)}${(v.cpv || 0).toFixed(2)} per view` : ''}`,
        benchmark: `${a.name}'s goal: ${money(R.goal)} per sale. Cut line: ${over.why === 'no_sale' ? `${R.cr_cut_zero_x}x the goal spent with no sale` : `${R.cr_cut_cpa_x}x the goal per sale after ${R.cr_cut_spend_x}x the goal spent`} (Brand settings > Ads rules, the same line Meta's calls use)`,
        cost: over.excess * scale, cost_how: over.why === 'no_sale' ? 'everything it spent, as a month' : `spend beyond ${money(R.goal)} x its conversions, as a month`,
        fix: area === 'google_video' ? 'Worth considering a smaller budget, or moving it to what converts. Video often opens journeys others close, so it is worth checking its Triple Whale first-click credit first.'
          : area === 'google_pmax' ? 'Worth considering a 20 to 30% lower daily budget, and a look at the product feed and asset groups; if the brand’s Shopping searches convert, they could be split out.' : 'Worth considering lower bids or budget, and a read of its search terms.',
        go_id: c.id });
    }
    if (!R.goal) areas.google.note = `${areas.google.note ? areas.google.note + ' ' : ''}No goal cost per sale is set, so Google campaigns are not judged (Brand settings > Goals).`;
    if (g.video_error) areas.google.video_note = g.video_error;
  }

  /* --- Meta: the buyer's list, not recomputed --- */
  if (!today) areas.meta = { state: 'off', note: 'The media buyer’s list is not reachable from here.' };
  else if (today.error) areas.meta = { state: 'error', note: today.error };
  else {
    areas.meta = { state: 'ok' };
    const rows = (today.rows || []).filter(r => (r.kind === 'cut' || r.kind === 'trim') && r.act_id === act && r.stake > 0);
    for (const r of rows) leaks.push({ id: `meta:${r.kind}:${r.ad_id || r.adset_id}`, area: 'meta', adset_id: r.adset_id, ad_id: r.ad_id || null, meta_act: r.meta_act || null,
      title: r.kind === 'cut' ? `Ad set "${r.adset}" is on the cut line` : `The ad "${r.ad}" in "${r.adset}" is over the line`,
      number: `${r.why} (Triple Whale, last platform click, ${r.from} to ${r.to})`,
      benchmark: `${money(r.goal)} goal per sale; cut line from the brand's Ads rules, the same as Today's calls`,
      cost: r.stake * 30 / 7, cost_how: 'the money at stake on Today’s calls (7 days), as a month',
      fix: r.kind === 'cut' ? 'One option is turning the ad set off or lowering its budget; the call is yours on Ads > Today’s calls.' : 'One option is turning off this ad only, since the set keeps working; the call is yours on Ads > Today’s calls.' });
  }

  /* --- TikTok --- */
  if (tt && !tt.error) {
    areas.tiktok = { state: 'ok' };
    for (const c of tt.campaigns || []) {
      const over = overCutLine(R, c.spend, c.purchases || 0);
      if (over) leaks.push({ id: `tiktok:camp:${c.id}`, area: 'tiktok', title: `TikTok campaign "${c.name}" ${over.why === 'no_sale' ? 'spends with no sale' : `costs ${(over.cpa / R.goal).toFixed(1)}x the goal per sale`}`,
        number: `${money(c.spend)} spent, ${c.purchases || 0} purchases (TikTok, its own count, last ${days} days)`, benchmark: `${money(R.goal)} goal per sale, the brand's cut line`,
        cost: over.excess * scale, cost_how: 'spend beyond the goal x purchases, as a month', fix: 'Worth considering a smaller budget or new creative; checking its Triple Whale first-click credit first is a good idea.' });
    }
  } else areas.tiktok = +(store?.tt_spend || 0) > 0 ? { state: 'not_linked', note: `TikTok spent ${money(store.tt_spend)} in ${days} days (Triple Whale), but it is not connected directly, so Locus cannot judge its campaigns. Connect TikTok (Ads > TikTok).` } : { state: 'off', note: 'No TikTok spend.' };

  /* --- the funnel and landing pages (GA4) --- */
  if (!link.ga4) { areas.funnel = areas.landing_page = { state: 'not_linked', note: 'Google Analytics is not linked for this brand (Brand settings > Integrations > GA4).' }; }
  else if (!f || f.error) { areas.funnel = areas.landing_page = { state: 'error', note: f?.error || 'GA4 did not answer.' }; }
  else {
    const fl = funnelLeaks(f, days, money, cur);
    leaks.push(...fl.leaks);
    areas.funnel = { state: 'ok', note: fl.notes.length ? `Not enough data yet: ${fl.notes.join(' ')}` : null, devices: f.devices, bench: BENCH };
    const P = f.paid;
    if (!P || P.sessions < FLOOR.lp_sessions || !P.purchases) areas.landing_page = { state: 'thin', note: `Not enough paid traffic yet (${(P?.sessions || 0).toLocaleString('en-US')} paid sessions; the floor is ${FLOOR.lp_sessions} a page).` };
    else {
      areas.landing_page = { state: 'ok' };
      const site = P.purchases / P.sessions, aov = P.revenue / P.purchases;
      const lp = (f.landing || []).filter(x => x.sessions >= FLOOR.lp_sessions && x.page && x.page !== '(not set)').map(x => ({ ...x, rate: x.purchases / x.sessions }))
        .filter(x => x.rate < site * 0.7).map(x => ({ ...x, cost: x.sessions * (site - x.rate) * aov * scale })).sort((p, q) => q.cost - p.cost).slice(0, 5);
      for (const x of lp) leaks.push({ id: `landing_page:${x.page}`, area: 'landing_page', title: `Paid visitors to ${x.page} rarely buy`,
        number: `${pc(x.rate, 2)} of ${x.sessions.toLocaleString('en-US')} paid sessions bought (GA4, last ${days} days)`, benchmark: `${pc(site, 2)}, the site's own paid sessions (GA4)`,
        cost: x.cost, cost_how: `sessions x the gap to the site's paid rate x ${money(aov)} paid AOV, as a month`,
        fix: 'Worth trying: point the ads that land here at a page that converts, or improve this page (the offer and price above the fold, the same promise the ad made).', page: x.page });
    }
  }

  /* --- email (Klaviyo) --- */
  if (a.email_tool === 'attentive') areas.email = { state: 'off', note: 'This brand runs Attentive; Locus reads Klaviyo only.' };
  else if (!flowsR) areas.email = { state: /not connected/i.test(kl?.[0]?.error || '') ? 'not_linked' : 'error', note: kl?.[0]?.error || 'Klaviyo did not answer.' };
  else if (judgeErr) areas.email = { state: judgeErr === 'not checked yet' ? 'thin' : 'error', note: judgeErr === 'not checked yet' ? 'Flows are read by the AI check (every Monday, or Run the AI check).' : `Flows were not judged: ${judgeErr}.` };
  else {
    areas.email = { state: 'ok' };
    const gained = daily ? (daily.days || []).filter(x => x.date >= from && x.date <= to).reduce((s, x) => s + (x.gained || 0), 0) : null;
    const orders = +(store?.orders || 0);
    for (const k of J.flows?.missing || []) {
      const recips = k === 'welcome' ? gained : k === 'post_purchase' ? orders : null;
      const cost = recips != null ? recips * FLOW_RPR[k] * scale : null;
      leaks.push({ id: `email:missing:${k}`, area: 'email', title: `No live ${CORE[k]} flow`,
        number: k === 'welcome' && gained != null ? `${gained.toLocaleString('en-US')} people joined the list in ${days} days (Klaviyo)` : k === 'post_purchase' ? `${orders.toLocaleString('en-US')} orders in ${days} days (Shopify through Triple Whale)` : 'Klaviyo, the flow list',
        benchmark: `${sym(cur)}${FLOW_RPR[k].toFixed(2)} per recipient (${FLOW_SRC})`,
        cost, cost_how: cost != null ? `${k === 'welcome' ? 'new subscribers' : 'orders'} a month x the benchmark revenue per recipient` : 'not priced: Locus cannot count who would enter this flow',
        fix: `Worth building and switching on a ${CORE[k]} flow in Klaviyo.` });
    }
    /* A flow switched off that earned, with no live replacement: what it earned a month before it went off, less what
       the replacement earns since (by_flow, 120 days of Klaviyo's own attribution). */
    const byFlow = (daily && daily.by_flow) || {}, start = daily?.attr_from;
    const dayOf = i => addDays(start, i);
    const monthly = (id, lo, hi) => { const arr = byFlow[id]; if (!arr || !start) return null; let s = 0, n = 0; arr.forEach((v, i) => { const dt = dayOf(i); if (dt >= lo && dt <= hi) { s += +v || 0; n++; } }); return n ? s / n * 30 : null; };
    const repl = Object.fromEntries((J.flows?.replaced || []).map(x => [x.off, x.by]));
    for (const fw of flows.filter(x => x.status !== 'live' && (x.revenue || 0) > 0)) {
      const off = String(fw.updated || '').slice(0, 10) || to;
      const before = monthly(fw.id, addDays(off, -30), addDays(off, -1)) || (fw.revenue || 0) / 3;   // its last 30 days before going off; when those were empty, a third of its 90-day revenue
      const by = flows.find(x => x.id === repl[fw.id]);
      const since = by ? monthly(by.id, off, to) ?? 0 : 0;
      const cost = Math.max(0, before - since);
      if (cost < FLOOR.cost || (by && since >= before * 0.85)) continue;   // replaced by a flow that earns about as much: not a leak
      leaks.push({ id: `email:off:${fw.id}`, area: 'email', title: `"${fw.name}" is ${fw.status} but it earned`,
        number: `${money(before)} a month before it went ${fw.status} on ${off}${by ? `; "${by.name}" took its place and earns ${money(since)} a month` : ''} (Klaviyo, its own attribution)`,
        benchmark: 'What this flow itself earned before it stopped.', cost, cost_how: by ? 'what it earned a month, less what its replacement earns' : 'what it earned a month before it stopped',
        fix: by ? `Worth comparing the two flows, or switching "${fw.name}" back on.` : `Worth switching "${fw.name}" back on, or replacing it, unless it was switched off on purpose.` });
    }
  }

  /* Rank by money; unpriced leaks after the priced ones; drop the trivial ones (search negatives always stay: they
     are what Viktor's report used to post). */
  let out = leaks.filter(l => l.cost == null || l.cost >= FLOOR.cost || l.apply || l.keep)
    .map(l => { const owner = ownerOf(l.area); return { ...l, cost: l.cost == null ? null : Math.round(l.cost), owner, who: owner ? `${owner}, ${(WHO[l.area] || '').toLowerCase()}` : WHO[l.area], go: GO[l.area] }; })
    .sort((p, q) => (q.cost ?? -1) - (p.cost ?? -1));
  /* THE CROSS-CHECK (leakctx.js): every leak read against the other channels, the tracking, the Change Log and the
     team's lessons by one Sonnet call before anyone acts on it. A failed review leaves the list as found, marked so. */
  let context = null, summary = '', reviewErr = null, stored = null;
  try {
    if (!out.length) throw new Error('nothing to review');
    const metaActs = (await env.DB.prepare(`SELECT external_id FROM connections WHERE brand_id = ?1 AND kind = 'meta'`).bind(act).all().catch(() => ({ results: [] }))).results.map(r => r.external_id);
    const ctx = await contextFor(env, act, { from, to, leaks: out, f: f && !f.error ? f : null, g: g && !g.error ? g : null, store, metaActs });
    context = ctx.brand;
    out = out.map(l => ({ ...l, ctx: ctx.per[l.id] || null }));
    if (ai) {
      if (d.canAfford && !d.canAfford(4)) throw new Error('out of budget this hour');
      const rv = await (d.review || review)(env, d, a.name, out, ctx, lessons);
      out = mergeReview(out, rv); summary = rv.summary || ''; aiUsd += rv.usd || 0; aiUse.review = rv.usage || null;
      stored = { leaks: rv.leaks || [], summary };
    } else if (last && last.review) {
      /* The last check's verdicts, for the leaks it saw; a new leak reads "not checked yet". */
      out = mergeReview(out, last.review); summary = last.review.summary || '';
    } else throw new Error('not checked yet');
  } catch (e) { if (out.length) reviewErr = e.message; }
  const check = ai ? { at: new Date().toISOString(), usd: Math.round((aiUsd + (J?.usd || 0)) * 10000) / 10000, ok: !reviewErr && !judgeErr }
    : last ? { at: last.at, usd: last.usd, ok: true } : null;
  if (ai && (labels || stored)) await d.putSetting(env, aiKey, JSON.stringify({ at: check.at, usd: check.usd, labels: labels || (last && last.labels) || null, review: stored })).catch(() => {});
  const res = { act, brand: a.name, currency: cur, days, from, to, base_from: bfrom, base_to: bto, as_of: new Date().toISOString(), leaks: out, areas,
    note: 'Each leak is priced on its own. They overlap (a better cart page also lifts checkout), so do not add them up.', judged: !judgeErr,
    reviewed: !reviewErr && out.length > 0, review_error: reviewErr, summary, context, ai_check: check, ai: ai ? { usd: check.usd, judge: J?.usage || null, review: aiUse.review || null } : null,
    lessons: lessons.map(l => ({ id: l.id, act_id: l.act_id, area: l.area, text: l.text, author: l.author, role: l.role, status: l.status, why: l.verdict_why, rule: l.rule, at: l.created_at, decision: l.decision || null, decided_by: l.decided_by || null, decided_at: l.decided_at || null })) };
  await d.putSetting(env, key, JSON.stringify(res)).catch(() => {});
  return res;
}

/* ---------- Apply: a negative keyword, proposed then written, with a Change Log line and undo ---------- */
export async function applyNegative(env, d, act, b, who) {
  const L = safe(await d.getSetting(env, `leaks:${act}:${+b.days || 30}`), null);
  const leak = (L?.leaks || []).find(x => x.id === 'google_search:negatives');
  const item = leak && (leak.items || []).find(x => x.term === b.term && (!b.campaign_id || x.campaign_id === String(b.campaign_id)));
  if (!item) return { error: 'That search term is not on the leak list any more. Refresh the list.' };
  const summary = `Add "${item.term}" as an exact negative keyword on Google campaign "${item.campaign}"`;
  if (!b.confirm) {
    const v = await adsNegative(env, act, { campaign_id: item.campaign_id, text: item.term, validate: true });
    if (v.error) return v;
    return { ok: true, propose: true, summary, detail: `It spent ${sym(L.currency)}${item.spend.toFixed(2)} on ${item.clicks} click${item.clicks === 1 ? '' : 's'} in the last ${L.days} days with no conversion. Why it is irrelevant: ${item.why}.`, item };
  }
  const r = await adsNegative(env, act, { campaign_id: item.campaign_id, text: item.term });
  if (r.error) return r;
  await logChange(env, act, summary, `Leak finder: ${item.why}`, who, item.campaign_id, item.campaign);
  /* The term leaves the list at once; the next read rebuilds it. */
  leak.items = leak.items.filter(x => x !== item);
  if (!leak.items.length) L.leaks = L.leaks.filter(x => x !== leak);
  else { leak.cost = Math.max(0, Math.round(leak.cost - item.spend * 30 / L.days)); leak.title = `${leak.items.length} search${leak.items.length === 1 ? '' : 'es'} that ${leak.items.length === 1 ? 'has' : 'have'} nothing to do with ${L.brand}`; }
  await d.putSetting(env, `leaks:${act}:${L.days}`, JSON.stringify(L)).catch(() => {});
  return { ok: true, summary, undo: r.resource, item };
}
export async function undoNegative(env, d, act, resource, who) {
  const r = await adsNegative(env, act, { remove: resource });
  if (r.error) return r;
  await logChange(env, act, `Removed a negative keyword the leak finder added (${resource.split('/').pop()})`, 'Undo in Locus', who, null, null);
  await env.DB.prepare(`DELETE FROM settings WHERE key LIKE ?1`).bind(`leaks:${act}:%`).run().catch(() => {});
  return { ok: true };
}
async function logChange(env, act, summary, reason, who, objId, objName) {
  const m = await env.DB.prepare(`SELECT external_id FROM connections WHERE brand_id = ?1 AND kind = 'meta' ORDER BY rowid LIMIT 1`).bind(act).first().catch(() => null);
  await env.DB.prepare(`INSERT INTO activities (id, act_id, event_time, event_type, category, summary, reason, note, confirmed, manual, actor, object_type, object_id, object_name)
    VALUES (?1, ?2, ?3, 'google_write', 'keywords', ?4, ?5, 'Changed in Google Ads from Locus (leak finder).', 1, 1, ?6, 'campaign', ?7, ?8)`)
    .bind(`manual:${crypto.randomUUID()}`, m?.external_id || act, new Date().toISOString(), summary, reason || null, `${who || 'someone'} in Locus`, objId, objName).run().catch(() => {});
}

/* ---------- routes ---------- */
export async function handleLeaks(request, env, url, path, json, h) {
  if (!['/api/leaks', '/api/leaks/apply', '/api/leaks/undo', '/api/leaks/lesson', '/api/leaks/lessons', '/api/leaks/decide'].includes(path)) return null;
  if (!(await h.isAdmin(request, env))) return json({ error: 'unauthorized' }, 401);
  const email = await h.sessionEmail(env, request).catch(() => null);
  const only = await h.brandsFor(env, email).catch(() => null);
  const body = request.method === 'POST' ? await request.json().catch(() => ({})) : {};
  const act = await h.resolveBrandId(env, String((request.method === 'POST' ? body.act : url.searchParams.get('act')) || '')).catch(() => '');
  if (!/^[\w-]{3,80}$/.test(act)) return json({ error: 'Pick a brand first.' }, 400);
  if (only && !only.has(act)) return json({ error: 'You do not have access to this brand.' }, 403);
  const d = h.deps();
  try {
    if (path === '/api/leaks') {
      const days = [7, 14, 30, 60, 90].includes(+url.searchParams.get('days')) ? +url.searchParams.get('days') : 30;
      const cl = !!(h.isClient && h.isClient(request));
      return json(await leaksFor(env, d, act, { days, fresh: url.searchParams.get('fresh') === '1' && !cl, ai: url.searchParams.get('ai') === '1' && !cl }));
    }
    const client = !!(h.isClient && h.isClient(request));
    if (path === '/api/leaks/lessons') return json({ lessons: (await lessonsFor(env, act)).map(l => ({ ...l, mine: l.act_id === act })) });
    if (path === '/api/leaks/lesson' && request.method === 'DELETE') {
      const r = await deleteLesson(env, String(url.searchParams.get('id') || body.id || ''), client ? act : null);
      if (r.ok) await env.DB.prepare(`DELETE FROM settings WHERE key LIKE ?1`).bind(`leaks:${act}:%`).run().catch(() => {});
      return json(r);
    }
    if (request.method !== 'POST') return json({ error: 'method not allowed' }, 405);
    const who = email || 'someone';
    if (path === '/api/leaks/lesson') return json(await lessonFromLeak(env, d, act, body, who, client));
    if (path === '/api/leaks/decide') return json(await decideLesson(env, act, String(body.id || ''), body.decision, who, client));
    if (path === '/api/leaks/apply') return json(await applyNegative(env, d, act, body, who));
    if (path === '/api/leaks/undo') return json(await undoNegative(env, d, act, String(body.resource || ''), who));
  } catch (e) { return json({ error: e.message }, 502); }
  return null;
}

/** A teammate's pushback on one leak (or on an area): saved, judged against the leak and its context, returned with the
 *  verdict. Every brand (scope 'all') only for the team; a client's pushback is always its own brand's. */
export async function lessonFromLeak(env, d, act, b, who, client = false) {
  const L = safe(await d.getSetting(env, `leaks:${act}:${+b.days || 30}`), null);
  const leak = b.leak_id ? (L?.leaks || []).find(x => x.id === b.leak_id) || null : null;
  const all = b.scope === 'all' && !client;
  return addLesson(env, d, { final: !!b.final && !client, act: all ? '' : act, area: leak ? leak.area : String(b.area || ''), leak_id: leak ? leak.id : null, text: b.text, author: b.author, role: b.role, added_by: who,
    brand: L?.brand || act, leak, context: { leak: leak ? leak.ctx : null, brand: L?.context || null } });
}

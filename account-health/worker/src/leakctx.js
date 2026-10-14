/* THE LEAK FINDER'S CROSS-CHECK AND ITS LESSONS (2026-10-13, second pass). Cole, after the first build: "it's not just
 * one platform... if an ad has a really low ROAS, it doesn't necessarily mean turn that ad off. What if the CTR is
 * great, but it's going to a completely separate website, or that website's getting a lot of bounces because it's brand
 * new? ... It's all context based. You need all the context to come to a conclusion." And: "if my Google guy goes, no,
 * we shouldn't do that, I'll tell you... is that true? Can we learn from it?"
 *
 * 1. CONTEXT (`contextFor`, plain reads, no model): for every leak the facts from the OTHER channels that could explain
 *    it. A Meta ad set: its click rate against the brand's other ad sets, CPM, frequency, first-click against
 *    last-click credit (an opener the last click under-credits), and the page its ads send people to with that page's
 *    paid conversion and engagement against the site. A Google campaign: Google's own conversion value against what
 *    Triple Whale credits Google, and its landing pages in GA4. A funnel step: engagement on that device now against
 *    before. For the brand: tracking (GA4 purchases against Shopify orders), traffic against before, the last 21 days of
 *    changes (Change Log), dates live or ending in the window (Calendar), and the team's lessons.
 * 2. REVIEW (`review`, ONE Sonnet call per brand per read): reads every leak with that context and the lessons, and
 *    says per leak: real | check_first | not_the_cause | measurement, the cross-channel why in plain words, what to
 *    look at before acting, and a shared root when several leaks are one problem (Meta, PMax and the funnel all landing
 *    on one weak page). It never invents a number: only the facts it was given.
 * 3. LESSONS (`p_leak_lesson`): a teammate's pushback ("our Google lead says never block competitor names in the brand
 *    campaign"), saved from the Push back button, the Strategist (Apply card `leak_lesson`) or Claude Code. Each is
 *    judged once against the data and what is known about how the platform works (`judgeLesson`): holds | partly |
 *    does_not_hold, with the why. Every later review and search-term judge reads them: a lesson that holds is a rule,
 *    one that does not hold is shown beside the leak with the counter-evidence, so the team sees both sides.
 */
const MODEL = 'claude-sonnet-5-5';
/* What one call cost, from the API's own usage (Sonnet 5.5: $2 in, $10 out, $0.20 cache reads per million tokens). Every
   leak-finder call adds to settings `aiSpend:leaks:<YYYY-MM>` = {calls, in, out, usd}, so the monthly bill for this
   feature is a number, not a guess. */
const PRICE = { in: 2 / 1e6, out: 10 / 1e6, read: 0.2 / 1e6 };
export function costOf(u) { u = u || {}; return (u.input_tokens || 0) * PRICE.in + (u.cache_creation_input_tokens || 0) * PRICE.in * 1.25 + (u.cache_read_input_tokens || 0) * PRICE.read + (u.output_tokens || 0) * PRICE.out; }
export async function meter(env, u, what) {
  const usd = costOf(u), month = new Date().toISOString().slice(0, 7), key = `aiSpend:leaks:${month}`;
  try {
    const r = await env.DB.prepare(`SELECT value FROM settings WHERE key = ?1`).bind(key).first();
    const t = safe(r?.value, {}) || {};
    t.calls = (t.calls || 0) + 1; t.in = (t.in || 0) + (u?.input_tokens || 0); t.out = (t.out || 0) + (u?.output_tokens || 0); t.usd = Math.round(((t.usd || 0) + usd) * 10000) / 10000;
    (t.by ||= {})[what] = Math.round(((t.by[what] || 0) + usd) * 10000) / 10000;
    await env.DB.prepare(`INSERT INTO settings (key, value) VALUES (?1, ?2) ON CONFLICT(key) DO UPDATE SET value = excluded.value`).bind(key, JSON.stringify(t)).run();
  } catch {}
  return usd;
}
const safe = (s, fb) => { try { return s ? JSON.parse(s) : fb; } catch { return fb; } };
const clip = (s, n) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, n);
const pathOf = u => { try { const x = new URL(u, 'https://x.invalid'); return (x.pathname || '/').replace(/\/+$/, '') || '/'; } catch { return String(u || '').split('?')[0]; } };
const pct = (v, d = 1) => v == null || !isFinite(v) ? null : +(v * 100).toFixed(d);
const ratio = (a, b) => (b ? a / b : null);

/* ---------- lessons ---------- */
const LESSON_SQL = `CREATE TABLE IF NOT EXISTS p_leak_lesson (id TEXT PRIMARY KEY, act_id TEXT NOT NULL DEFAULT '', area TEXT NOT NULL DEFAULT '',
  leak_id TEXT, text TEXT NOT NULL, author TEXT, role TEXT, added_by TEXT, status TEXT NOT NULL DEFAULT 'open', verdict_why TEXT, rule TEXT,
  created_at TEXT NOT NULL, judged_at TEXT)`;
export const AREAS = ['google_search', 'google_pmax', 'google_video', 'meta', 'tiktok', 'funnel', 'landing_page', 'email', ''];
async function ensure(env) {
  await env.DB.prepare(LESSON_SQL).run().catch(() => {});
  /* The final call (second pass): when Locus does not agree with a pushback, a person decides once whose view stands. */
  for (const c of ['decision TEXT', 'decided_by TEXT', 'decided_at TEXT']) await env.DB.prepare(`ALTER TABLE p_leak_lesson ADD COLUMN ${c}`).run().catch(() => {});
}
/** THE FINAL CALL. Locus judges a pushback once (holds / partly / does not hold); it never argues again. When it did not
 *  fully agree, a person makes the call: 'team' = the team's view stands and every later list follows it, even where the
 *  data disagreed; 'locus' = the data stands, the leak keeps showing, and the lesson stays on record. A client decides
 *  only its own brand's lessons. */
export async function decideLesson(env, act, id, decision, who, client = false) {
  await ensure(env);
  if (!['team', 'locus'].includes(decision)) return { error: 'Pick the team or Locus.' };
  const r = await env.DB.prepare(`SELECT act_id FROM p_leak_lesson WHERE id = ?1`).bind(id).first().catch(() => null);
  if (!r) return { error: 'No such lesson.' };
  if (r.act_id ? r.act_id !== act : client) return { error: 'That lesson belongs to another brand.' };
  await env.DB.prepare(`UPDATE p_leak_lesson SET decision = ?2, decided_by = ?3, decided_at = ?4 WHERE id = ?1`).bind(id, decision, clip(who, 120), new Date().toISOString()).run();
  await env.DB.prepare(`DELETE FROM settings WHERE key LIKE ?1`).bind(r.act_id ? `leaks:${r.act_id}:%` : 'leaks:%').run().catch(() => {});
  return { ok: true, id, decision };
}
/** The lessons that apply to a brand: its own and the agency-wide ones (act_id ''). */
export async function lessonsFor(env, act) {
  await ensure(env);
  const { results } = await env.DB.prepare(`SELECT * FROM p_leak_lesson WHERE act_id = ?1 OR act_id = '' ORDER BY created_at DESC LIMIT 60`).bind(act || '').all().catch(() => ({ results: [] }));
  return results || [];
}
export async function deleteLesson(env, id, act) {
  await ensure(env);
  const r = await env.DB.prepare(`SELECT act_id FROM p_leak_lesson WHERE id = ?1`).bind(id).first().catch(() => null);
  if (!r) return { error: 'No such lesson.' };
  if (act && r.act_id !== act) return { error: r.act_id ? 'That lesson belongs to another brand.' : 'That lesson is the team’s, for every brand.' }; /* a client (act set) removes only its own brand's */
  await env.DB.prepare(`DELETE FROM p_leak_lesson WHERE id = ?1`).bind(id).run();
  return { ok: true };
}
const LESSON_SCHEMA = { type: 'object', additionalProperties: false, required: ['status', 'why', 'rule', 'area'],
  properties: { status: { type: 'string', enum: ['holds', 'partly', 'does_not_hold'] }, why: { type: 'string' }, rule: { type: 'string' }, area: { type: 'string', enum: AREAS } } };
/** Judge one pushback against the data and platform knowledge. `leak` (optional) is the leak it was said about, with
 *  its context. Fair both ways: practitioners are often right about things the numbers cannot see. */
export async function judgeLesson(env, d, { brand, text, author, role, leak, context }) {
  if (!env.ANTHROPIC_API_KEY) throw new Error('no model key');
  const system = `You are the head of performance at a DTC ecommerce agency. A teammate pushed back on something the leak finder suggested. Decide, fairly, whether the pushback holds. Plain words, no em dashes.
- "holds": it is right (established platform practice, or the data supports it, or it covers something the numbers cannot see, like a deal with a partner, a launch, a client request). Say why.
- "partly": right in some cases; say exactly when it applies and when it does not.
- "does_not_hold": the data or how the platform works says otherwise. Give the specific evidence from the facts below, never a vague appeal.
Never invent a number: use only the facts given. "rule" = the lesson rewritten as ONE standing rule the leak finder follows from now on (for does_not_hold: the rule stays as the evidence, e.g. "Show the leak, and say that X believes Y but Z"). "area" = which part it is about (google_search, google_pmax, google_video, meta, tiktok, funnel, landing_page, email, or '' for all).`;
  const user = `BRAND: ${brand || 'every brand'}\nWHO: ${author || 'a teammate'}${role ? ` (${role})` : ''}\nWHAT THEY SAID: ${text}\n\nTHE LEAK IT WAS ABOUT:\n${leak ? JSON.stringify({ title: leak.title, number: leak.number, benchmark: leak.benchmark, fix: leak.fix, cost: leak.cost, verdict: leak.verdict, why: leak.why_ctx }) : '(none named)'}\n\nCONTEXT:\n${context ? JSON.stringify(context).slice(0, 12000) : '(none)'}`;
  const r = await d.xfetch('https://api.anthropic.com/v1/messages', {
    method: 'POST', headers: { 'x-api-key': env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({ model: MODEL, max_tokens: 3000, system, output_config: { effort: 'medium', format: { type: 'json_schema', schema: LESSON_SCHEMA } }, messages: [{ role: 'user', content: user }] }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error?.message || `Claude HTTP ${r.status}`);
  await meter(env, j.usage, 'lesson');
  const out = safe((j.content || []).filter(b => b.type === 'text').map(b => b.text).join(''), null);
  if (!out) throw new Error('The judge came back empty.');
  return out;
}
/** Save a lesson, judge it, return it with the verdict. A failed judgement still saves it ('open'), so nothing is lost. */
export async function addLesson(env, d, { act = '', area = '', leak_id = null, text, author, role, added_by, brand, leak, context, final = false }) {
  await ensure(env);
  const t = clip(text, 1200);
  if (t.length < 8) return { error: 'Say what they said, in a sentence.' };
  const id = `ll_${crypto.randomUUID().slice(0, 12)}`, now = new Date().toISOString();
  await env.DB.prepare(`INSERT INTO p_leak_lesson (id, act_id, area, leak_id, text, author, role, added_by, status, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, 'open', ?9)`)
    .bind(id, act || '', AREAS.includes(area) ? area : '', leak_id, t, clip(author, 60) || null, clip(role, 60) || null, clip(added_by, 120) || null, now).run();
  let v = null, err = null;
  try { v = await judgeLesson(env, d, { brand, text: t, author, role, leak, context }); } catch (e) { err = e.message; }
  if (v) await env.DB.prepare(`UPDATE p_leak_lesson SET status = ?2, verdict_why = ?3, rule = ?4, area = CASE WHEN area = '' THEN ?5 ELSE area END, judged_at = ?6 WHERE id = ?1`)
    .bind(id, v.status, clip(v.why, 1500), clip(v.rule, 600), v.area || '', new Date().toISOString()).run();
  /* "Go with ours regardless" said up front (the Strategist's `final`): recorded as the team's final call at once. */
  if (final) await env.DB.prepare(`UPDATE p_leak_lesson SET decision = 'team', decided_by = ?2, decided_at = ?3 WHERE id = ?1`).bind(id, clip(added_by, 120), new Date().toISOString()).run();
  /* Every cached list for the brand (or every brand) is dropped, so the next read follows the lesson. */
  await env.DB.prepare(`DELETE FROM settings WHERE key LIKE ?1`).bind(act ? `leaks:${act}:%` : 'leaks:%').run().catch(() => {});
  return { ok: true, id, status: v ? v.status : 'open', why: v ? v.why : null, rule: v ? v.rule : null, error: err, decision: final ? 'team' : null };
}
/** The lessons as the prompts read them. */
export function lessonsText(list, area) {
  const rows = (list || []).filter(l => !area || !l.area || l.area === area || (Array.isArray(area) && area.includes(l.area)));
  if (!rows.length) return '';
  const tag = { holds: 'HOLDS, follow it', partly: 'PARTLY, follow it where it applies', does_not_hold: 'DOES NOT HOLD, show both sides', open: 'NOT JUDGED YET, weigh it' };
  const final = l => l.decision === 'team' ? "THE TEAM'S FINAL CALL: follow it, even where the data disagreed; you may note the data once, never argue" : l.decision === 'locus' ? 'SETTLED: the team agreed the data stands; keep showing the leak and mention their view in one line' : null;
  return rows.map(l => `- [${final(l) || tag[l.status] || l.status}] ${l.author ? `${l.author}${l.role ? `, ${l.role}` : ''}` : 'The team'}${l.act_id ? '' : ' (every brand)'}${l.area ? ` on ${l.area}` : ''}: "${clip(l.text, 400)}"${l.rule ? ` Rule: ${clip(l.rule, 300)}` : ''}${l.status === 'does_not_hold' && l.verdict_why ? ` Evidence: ${clip(l.verdict_why, 300)}` : ''}`).join('\n');
}

/* ---------- context: the other channels' facts for every leak (D1 + what leaksFor already read; no new API calls) ---------- */
export async function contextFor(env, act, { from, to, leaks, f, g, store, metaActs = [] }) {
  const q = (sql, ...b) => env.DB.prepare(sql).bind(...b).all().then(r => r.results || []).catch(() => []);
  const brand = {};
  /* Tracking: GA4 purchases against Shopify paid orders. Under ~70% means GA4 misses orders, so every GA4 rate reads low. */
  if (f && f.devices) {
    const tot = k => Object.values(f.devices).reduce((s, v) => s + ((v.cur || {})[k] || 0), 0), totB = k => Object.values(f.devices).reduce((s, v) => s + ((v.base || {})[k] || 0), 0);
    const days = Math.round((Date.parse(to) - Date.parse(from)) / 864e5) + 1;
    brand.tracking = { ga4_purchases: tot('purchases'), shopify_orders: +(store?.orders || 0) || null, ga4_capture: ratio(tot('purchases'), +(store?.orders || 0)) };
    brand.traffic = { sessions_a_day: Math.round(tot('sessions') / days), sessions_a_day_90d_before: Math.round(totB('sessions') / 90), engaged_now_pct: pct(ratio(tot('engaged'), tot('sessions'))), engaged_before_pct: pct(ratio(totB('engaged'), totB('sessions'))) };
  }
  /* What changed (the Change Log) and what was live (the Calendar), 21 days back from the window end. */
  const since = new Date(Date.parse(to) - 21 * 864e5).toISOString().slice(0, 10);
  const acts = [act, ...metaActs];
  brand.changes = (await q(`SELECT substr(event_time, 1, 10) day, category, summary FROM activities WHERE act_id IN (${acts.map((_, i) => `?${i + 2}`).join(',')}) AND substr(event_time, 1, 10) >= ?1 ORDER BY event_time DESC LIMIT 25`, since, ...acts))
    .map(r => `${r.day} ${r.category || ''}: ${clip(r.summary, 140)}`);
  /* Paid landing pages from GA4, keyed by path, so any leak can be tied to the page it sends people to. */
  const pages = new Map(), P = f && f.paid, siteRate = P && P.sessions ? P.purchases / P.sessions : null;
  for (const x of (f && f.landing) || []) pages.set(pathOf(x.page), { page: x.page, paid_sessions: x.sessions, buy_pct: pct(ratio(x.purchases, x.sessions), 2), engaged_pct: pct(ratio(x.engaged, x.sessions)) });
  brand.site_paid = siteRate != null ? { buy_pct: pct(siteRate, 2), engaged_pct: null } : null;
  const pageFacts = urls => [...new Set((urls || []).map(pathOf))].slice(0, 3).map(p => pages.get(p) || { page: p, note: 'not among the top paid landing pages in GA4' });

  const per = {};
  /* Meta ad sets: delivery against the brand's other sets, first-click credit, and where the ads send people. */
  const metaLeaks = leaks.filter(l => l.area === 'meta' && l.adset_id);
  if (metaLeaks.length && metaActs.length) {
    const IN = metaActs.map((_, i) => `?${i + 3}`).join(',');
    const sets = await q(`SELECT x.adset_id, SUM(d.spend) spend, SUM(d.impressions) impr, SUM(d.link_clicks) clicks, SUM(d.reach) reach, SUM(d.outbound_clicks) out FROM ad_daily d JOIN ads x ON x.act_id = d.act_id AND x.ad_id = d.ad_id
      WHERE d.date BETWEEN ?1 AND ?2 AND d.act_id IN (${IN}) GROUP BY x.adset_id HAVING spend > 0`, addDays(to, -6), to, ...metaActs);
    const ctrs = sets.filter(s => s.impr >= 2000).map(s => s.clicks / s.impr).sort((a, b) => a - b), med = ctrs.length ? ctrs[Math.floor(ctrs.length / 2)] : null;
    for (const l of metaLeaks) {
      const s = sets.find(x => x.adset_id === l.adset_id) || {};
      const ads = await q(`SELECT ad_id FROM ads WHERE adset_id = ?1 LIMIT 30`, l.adset_id);
      const ids = ads.map(r => r.ad_id);
      let links = [], fc = null, lc = null;
      if (ids.length) {
        const IN2 = ids.map((_, i) => `?${i + 1}`).join(',');
        links = (await q(`SELECT json FROM ad_creative WHERE ad_id IN (${IN2})`, ...ids)).map(r => safe(r.json, {})?.link).filter(Boolean);
        const cr = await q(`SELECT model, SUM(revenue) rev, SUM(orders) ord FROM tw_ad_attr WHERE act_id = ?${ids.length + 1} AND date BETWEEN ?${ids.length + 2} AND ?${ids.length + 3} AND ad_id IN (${IN2}) AND model IN ('lastPlatformClick', 'fullFirstClick') GROUP BY model`, ...ids, act, addDays(to, -6), to);
        fc = cr.find(r => r.model === 'fullFirstClick') || null; lc = cr.find(r => r.model === 'lastPlatformClick') || null;
      }
      per[l.id] = {
        set_ctr_pct: pct(ratio(s.clicks, s.impr), 2), brand_median_set_ctr_pct: pct(med, 2), cpm: s.impr ? +(s.spend * 1000 / s.impr).toFixed(2) : null, frequency: s.reach ? +(s.impr / s.reach).toFixed(2) : null,
        first_click_revenue: fc ? Math.round(fc.rev) : null, last_click_revenue: lc ? Math.round(lc.rev) : null,
        /* Worked out here, never left to the model (it once read $819 first click against $1,315 last click as an opener).
           The same 1.3x line as the Opener / Closer chips on Ads > Meta > Ads. */
        role: !fc || !lc ? null : fc.rev >= lc.rev * 1.3 ? 'opener' : lc.rev >= fc.rev * 1.3 ? 'closer' : 'both',
        lands_on: links.length ? pageFacts(links) : 'no landing link cached for these ads', site_paid_buy_pct: pct(siteRate, 2),
      };
    }
  }
  /* Google campaigns: Google's own value against Triple Whale's credit to Google, and where they land. */
  const gl = leaks.filter(l => /^google_/.test(l.area) && l.go_id);
  if (gl.length) {
    const tw = await q(`SELECT SUM(revenue) rev, SUM(orders) ord FROM tw_ad_attr WHERE act_id = ?1 AND date BETWEEN ?2 AND ?3 AND model = 'lastPlatformClick' AND platform = 'google'`, act, from, to);
    const gval = ((g && g.campaigns) || []).reduce((s, c) => s + (c.value || 0), 0);
    brand.google_measurement = { google_reported_value: Math.round(gval), triple_whale_google_revenue: tw[0] && tw[0].rev != null ? Math.round(tw[0].rev) : null };
    for (const l of gl) per[l.id] = { lands_on: (g && g.final_urls && g.final_urls[l.go_id]) ? pageFacts(g.final_urls[l.go_id]) : 'landing pages not read for this campaign type', site_paid_buy_pct: pct(siteRate, 2) };
  }
  /* Funnel steps: engagement on the device now against before. Landing pages: who sends traffic there. */
  for (const l of leaks.filter(x => x.area === 'funnel' && x.device)) {
    const v = (f && f.devices && f.devices[l.device]) || {};
    per[l.id] = { device: l.device, engaged_now_pct: pct(ratio(v.cur?.engaged, v.cur?.sessions)), engaged_before_pct: pct(ratio(v.base?.engaged, v.base?.sessions)),
      /* Per day, never raw totals: the window is 30 days and the baseline 90, and raw totals once read as a 74% traffic drop. */
      sessions_a_day_now: v.cur?.sessions ? Math.round(v.cur.sessions / dayCount(from, to)) : null, sessions_a_day_90d_before: v.base?.sessions ? Math.round(v.base.sessions / 90) : null };
  }
  for (const l of leaks.filter(x => x.area === 'landing_page' && x.page)) {
    const p = pathOf(l.page);
    const senders = [...metaLeaks.filter(m => (per[m.id]?.lands_on || []).some?.(x => pathOf(x.page) === p)).map(m => `Meta: ${m.title}`), ...gl.filter(x => (per[x.id]?.lands_on || []).some?.(y => pathOf(y.page) === p)).map(x => `Google: ${x.title}`)];
    per[l.id] = { ...(pages.get(p) || {}), site_paid_buy_pct: pct(siteRate, 2), sent_by_flagged_campaigns: senders };
  }
  return { brand, per };
}
function dayCount(a, b) { return Math.round((Date.parse(b) - Date.parse(a)) / 864e5) + 1; }
function addDays(d, n) { return new Date(Date.parse(d + 'T12:00:00Z') + n * 864e5).toISOString().slice(0, 10); }

/* ---------- the review: one call, every leak in context ---------- */
const REVIEW_SCHEMA = { type: 'object', additionalProperties: false, required: ['leaks', 'summary'],
  properties: { summary: { type: 'string' },
    leaks: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['id', 'verdict', 'why', 'check', 'root'],
      properties: { id: { type: 'string' }, verdict: { type: 'string', enum: ['real', 'check_first', 'not_the_cause', 'measurement'] }, why: { type: 'string' }, check: { type: 'string' }, root: { type: 'string' } } } } } };
export function reviewSystem(brand) {
  return `You are the head of performance at a DTC ecommerce agency, reviewing an automatic leak list for ${brand} before the team acts on it. Each leak was found by ONE rule on ONE platform. Your job is the context: the same number can mean different things.
How to think (Cole's rule): never blame a platform from its own number alone. Before calling a leak real, look across channels:
- An ad or campaign with a poor cost per sale but a strong click rate usually means the problem is AFTER the click: the landing page, the offer, stock, a broken or new site. Then the leak is the page, not the ad; say so and point at it.
- Each Meta ad set's "role" is worked out for you, never re-derive it: opener = first-click credit 1.3x+ its last-click credit (it starts journeys other channels finish); closer = the reverse (it finishes journeys others started); both = within 30%. An opener prospects for the other channels; cutting it can lower branded search, email and direct later. Say "check first" and name the second-order effect.
- Tracking: if GA4 captures far fewer purchases than Shopify, GA4 rates read low; if Google's own conversion value is far above what Triple Whale credits Google, Google is over-claiming. That is "measurement".
- Compare rates and per-day numbers, never raw totals from windows of different length.
- Change Log and the calendar: a change or a promo ending in the window explains a drop; a new campaign under 7 days old is still learning.
- Several leaks landing on the same page or step are ONE problem: give them the same short "root" (e.g. "the gold wedge page"), and leave root '' when a leak stands alone.
Verdicts: real (act on it as written) | check_first (likely real, but one named thing must be ruled out first) | not_the_cause (the number is true but the problem is elsewhere; say where) | measurement (the number itself is unreliable; say why).
"why" = two sentences at most, plain words, citing only the facts given (never invent a number). "check" = the one thing to look at before acting ('' when real). Follow the team's lessons marked HOLDS or PARTLY; where a lesson DOES NOT HOLD and it touches a leak, say in "why" what the teammate believes and what the data says.
- Voice: these are SUGGESTIONS to a team that makes the calls, never orders or bans. Write "I'd suggest fixing X first", "worth checking Y before cutting", never "don't cut", "never", "you must". Cutting, scaling and pausing always stay the team's call; when something else should come first, say you would do it first and why.
"summary" = one sentence in that voice: the single most important thing for this brand, across channels. No em dashes.`;
}
export async function review(env, d, brand, leaks, ctx, lessons) {
  if (!leaks.length) return { leaks: [], summary: '' };
  if (!env.ANTHROPIC_API_KEY) throw new Error('no model key');
  const slim = leaks.map(l => ({ id: l.id, area: l.area, title: l.title, number: l.number, benchmark: l.benchmark, cost_a_month: l.cost, fix: l.fix, context: ctx.per[l.id] || null }));
  const user = `BRAND-WIDE CONTEXT:\n${JSON.stringify(ctx.brand)}\n\nTHE TEAM'S LESSONS:\n${lessonsText(lessons) || '(none yet)'}\n\nLEAKS (ranked by money):\n${JSON.stringify(slim)}`;
  const r = await d.xfetch('https://api.anthropic.com/v1/messages', {
    method: 'POST', headers: { 'x-api-key': env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({ model: MODEL, max_tokens: 8000, system: reviewSystem(brand), output_config: { effort: 'medium', format: { type: 'json_schema', schema: REVIEW_SCHEMA } }, messages: [{ role: 'user', content: user.slice(0, 60000) }] }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error?.message || `Claude HTTP ${r.status}`);
  const out = safe((j.content || []).filter(b => b.type === 'text').map(b => b.text).join(''), null);
  if (!out || !Array.isArray(out.leaks)) throw new Error('The review came back empty.');
  out.usd = await meter(env, j.usage, 'review'); out.usage = j.usage || null;
  return out;
}
/** Merge the review into the leaks: verdict, the cross-channel why, the check, the root. not_the_cause and measurement
 *  rank after the leaks to act on (they stay visible, folded under the rest). */
export function mergeReview(leaks, rv) {
  const by = new Map((rv?.leaks || []).map(x => [x.id, x]));
  const RANK = { real: 0, check_first: 0, measurement: 1, not_the_cause: 1 };
  return leaks.map(l => { const x = by.get(l.id); return x ? { ...l, verdict: x.verdict, why_ctx: clip(x.why, 500), check: clip(x.check, 300), root: clip(x.root, 80) } : l; })
    .sort((p, q) => (RANK[p.verdict] ?? 0) - (RANK[q.verdict] ?? 0) || (q.cost ?? -1) - (p.cost ?? -1));
}

/**
 * Locus: the Strategist.
 *
 * The account strategist who lives inside Locus, on the shared Ask engine
 * (../../../ask/engine.js). Is every client's brand making money, are the
 * ads working, what changed and who did it, what did we tell the client. It
 * runs in this worker because this worker already holds the data (Meta,
 * Triple Whale, the change log, every brief and report), the model key and
 * the Slack app, and is the auth server every Mobius tool delegates to.
 *
 * Two doors: the Locus dashboard, and an @-mention in a brand's INTERNAL
 * Slack channel, so Ahsan, Noma and Robbo get answers without going through
 * Cole. The client channel is never one of its doors.
 *
 * The rules it is born with (Cole's, and not negotiable):
 *   - attribution is Triple Whale's, always, never a platform's own count;
 *   - blended store money and Meta-reported ads never share a sentence
 *     without saying which is which;
 *   - The Golf Sock is paused and is never flagged.
 */

import { createAssistant, makeAppView, makeSecretKey, routeAction } from '../../../ask/engine.js';

const WHO = `
You are the Strategist for Mobius Digital, a marketing agency run by Cole
with a team of account strategists (Ahsan, Noma, Robbo). You work inside
Locus, the platform that watches every client brand. You answer for the
whole book of clients or for one brand: is the brand making money, are the
ads working, what changed on the account and who changed it, what we told
the client and when, are we on pace against the plan.
`;

const SCHEMA = `
## Tables (every row carries act_id, the Meta ad account id; accounts.name is the brand)

accounts        one row per client brand: act_id, name, currency, tz, active,
                monthly_budget, budgets_json ({"2026-09": 15000}), target_cpa,
                target_roas, slack_channel (the team's channel), brief_channel
                (the CLIENT's channel), tw_shop, goals_json, brief_enabled,
                last_sync_insights, last_error
daily_insights  Meta-reported, one row per account per day: date, spend,
                impressions, reach, clicks, link_clicks, purchases, revenue.
                THESE ARE META'S OWN NUMBERS. Use spend, impressions, clicks
                freely; never quote Meta's purchases or revenue as attribution.
tw_daily        Triple Whale, one row per account per day per metric: date,
                metric, value. Store-level metrics: netSales, totalSales,
                newCustomerSales, blendedAds (all ad spend), ga_adCost,
                grossProfit, totalProductCosts. Per-channel attributed
                purchases and revenue live here too under the pixel model.
                Pivot with SUM(CASE WHEN metric = 'netSales' THEN value END).
activities      the change log: event_time, category ('budget', 'new_campaign',
                'campaign_paused', 'bid_strategy', 'targeting', ...), summary,
                actor, object_name, reason, note, confirmed (-1 = dismissed)
ads             every ad: ad_id, name, adset_id, campaign_id, created_time,
                first_spend_date, status
ad_daily        per ad per day: spend, impressions, link_clicks, purchases,
                revenue, video_thruplay, reach, outbound_clicks
briefs          the Daily Brief sent to each client: date, posted_at, channel,
                status, text
reports         weekly and monthly reports: period, period_start, period_end,
                status, sent_at, summary
p_plan          the plan and goals per account per month
p_cohorts       customer cohorts per account
p_sku_costs, p_cost_health   product costs and whether contribution margin can be trusted
`;

const RULES = `
## Rules that make the numbers right
- ATTRIBUTION IS TRIPLE WHALE'S, ALWAYS. Any purchases, revenue or ROAS for a
  channel comes from tw_daily (the pixel), never from daily_insights.revenue or
  ad_daily.revenue. Those are Meta's own claims. Use them only when asked
  explicitly for "what Meta reports".
- Two kinds of number, never mixed in one sentence without labels: BLENDED
  store money (tw_daily netSales, blendedAds, MER = netSales / blendedAds)
  answers "is the brand making money"; META-REPORTED (daily_insights spend,
  clicks, CPM, CTR) answers "are the Meta ads working". Say which one you
  are giving.
- MER = netSales / blendedAds. AMER = newCustomerSales / blendedAds.
  CPA = spend / purchases. ROAS is attributed revenue / spend, and for a
  channel it is only ever Triple Whale attributed.
- Money is in the account's currency (accounts.currency). Never add across
  currencies without saying so.
- "This month" is the account's own calendar month in its timezone.
- The Golf Sock is a paused test account. Never flag it, never list it as a
  problem, and leave it out of totals unless asked by name.
- When comparing periods, name both periods.
`;

const TABLES = ['accounts', 'daily_insights', 'hourly_insights', 'tw_daily', 'activities', 'ads', 'ad_daily', 'briefs', 'reports',
                'p_plan', 'p_cohorts', 'p_sku_costs', 'p_cost_health', 'p_profit_share', 'p_ad_share'];

const DEFAULT_BRIEF = `Mobius Digital runs paid media for a handful of DTC brands (Dartee, Grunk Dolfer, Party Patch, Galway Bay, Lucky Golf, InStyler and others). Each brand has a Meta ad account, a Triple Whale store, an internal Slack channel for the team and a client channel. Every morning a Daily Brief goes to each client; every week and month a report. Strategists (Ahsan, Noma, Robbo) run the accounts day to day and log what they change and why. The plan per brand sets a monthly sales and spend goal; the target ROAS and CPA are the client's own lines.`;

/* How a good strategist thinks. Read before every answer; the copy in
 * Settings wins over this one. The creative half is Mobius's own framework
 * (Angle, Concept, What We're Testing) and the angles-hub hierarchy rule. */
const PLAYBOOK = `
READING AN ACCOUNT
- Is the brand making money: blended (Triple Whale) first, MER and aMER against the plan. Then are the ads working: Meta-reported delivery (spend, CPM, CTR, hook, hold). Say which lens you are using.
- Pace is spend against the month's budget by day of month; a brand under pace late in the month is throttled or broken, not "saving".
- When a number moves, look at the change log before guessing: who touched what, and when.
- The client's own lines (target ROAS, target CPA) are the bar. A day under the bar is noise; three days is a finding; a week is a conversation with the client.
- A ROAS on fewer than two conversions is not a result. Withhold it and say why.
- Never mix currencies, never quote Meta's purchases as attribution, never flag The Golf Sock.

BUILDING CREATIVE (Mobius's framework, three words only)
- ANGLE = the argument: the reason to buy, said in one sentence to a specific person, something you could say at a bar. Not a persona, not a topic, not a feature, not a format.
- CONCEPT = the idea we build to deliver the angle, specific enough to shoot without questions.
- WHAT WE'RE TESTING = the one piece that changes. Never two levels at once.
- New angle: 3 concepts that argue it in genuinely different ways (prove it with evidence, show it happening, make the alternative look ridiculous), 1 ad each, and say what each teaches if it wins. Proven concept: change one piece (hook, person, headline, edit). Winner fatigues: new concepts first, new angle if those die.
- Copy: lead with the customer's words, one claim per ad, the product as the way out of a specific moment, no jargon, no adjectives doing the work of a proof.

THE ANGLES HUB (what creators see)
- Two levels, never nested. A SECTION answers one question: why would a creator film this today. Three legal kinds, all at the same level: Hot right now (pinned), a dated window (Halloween, Black Friday, the Masters; it retires itself), and a durable lane (a product line, or a standing theme). Five or six sections per brand, max.
- Everything describing the video itself is a CHIP on the card: format first, then product. "Split screen" is a chip. "Black Friday" is a section.
- A section is named after a product only when the buyer chooses BETWEEN products (wedge vs putter). One-product brands get occasions.
- Each angle carries: title, the argument, who it is for, products (short), format, the lever (staff only), three openers (first lines that stop the scroll), the shots, the on-screen text, a do and a don't.
- Before writing new angles, read the brand context, the current angles (to not repeat them) and what actually sold (Triple Whale attributed revenue by ad). Angles come from evidence, then taste.
`.trim();

const VIEW_BLURBS = {
  accounts: 'every client brand with its targets, budget, channels, whether the brief is on, and when it last synced. Start here to resolve a brand name to an account.',
  overview: 'the Overview tab: each active brand over the window with sales, spend, MER, AMER, new-customer revenue and contribution margin, all blended (Triple Whale). Use it for "how is the book doing".',
  account: 'one brand, the same numbers the Daily Brief is built from: month to date and last month, sales, spend, MER, per-channel attributed revenue (Triple Whale), pace against the plan. Pass the brand name or act_id in `brand`.',
  series: 'one brand day by day over a range: Meta spend, impressions, clicks, and Triple Whale netSales and blendedAds per day. Pass `brand` and `days` (default 30).',
  changes: 'what was changed on one account and by whom: budgets, campaigns paused or launched, bid strategy, targeting. Pass `brand` and `days`.',
  creatives: 'the ads on one account over the last days: spend, Meta-reported clicks and CTR, thruplays, with the last 3 days against the prior 14 so fatigue shows. Pass `brand` and `days`.',
  briefs: 'the Daily Briefs already sent to one client, newest first: what we told them. Pass `brand`.',
  reports: 'the weekly and monthly reports for one client, newest first, with their summaries. Pass `brand`.',
  data_health: 'whether one brand\'s data can be trusted right now: sync age, gaps, the last error. Pass `brand`.',
  plan: 'the plan and goals for one brand by month. Pass `brand`.',
  angles: 'the brand\'s angles hub as creators see it: every section and every angle (title, argument, who, products, format, status). Pass `brand`. Read it before proposing new angles or archiving old ones.',
  what_worked: 'the ads that actually sold for one brand over the last 90 days, by Triple Whale attributed revenue (lastPlatformClick), with Meta spend and CTR beside them. Pass `brand`. This is the evidence new angles come from.',
  brand_context: 'what we know about one brand for creative work: who buys and why, the voice, the products, the claims, the KPIs. Pass `brand`. Written by Cole; empty means ask him or read the angles hub\'s intro.',
  findings: 'everything the nightly checks currently have open.',
  config: 'how the Strategist is set up: which Slack channel it briefs in, the brief hour.',
};

/* ------------------------------------------------------------------ */
/*  the views                                                          */
/* ------------------------------------------------------------------ */

function buildViews(d) {
  const resolve = async (env, want) => {
    const accounts = await d.listAccounts(env, false);
    const w = String(want || '').toLowerCase().trim();
    if (!w) return null;
    return accounts.find(a => a.act_id === want) || accounts.find(a => a.name.toLowerCase() === w) || accounts.find(a => a.name.toLowerCase().includes(w)) || null;
  };
  const need = async (env, a) => {
    const acct = await resolve(env, a.brand || a.id || a.account || a.q);
    if (!acct) throw new Error('Which brand? Give its name or act_id. Read the accounts view for the list.');
    return acct;
  };
  const strip = a => ({ act_id: a.act_id, name: a.name, currency: a.currency, tz: a.tz, active: a.active, monthly_budget: a.monthly_budget,
    budgets: d.safeJson(a.budgets_json, {}), target_cpa: a.target_cpa, target_roas: a.target_roas, team_channel: a.slack_channel, client_channel: a.brief_channel,
    tw_shop: a.tw_shop, brief_enabled: a.brief_enabled, last_sync: a.last_sync_insights, last_error: a.last_error });
  return {
    accounts: async env => ({ accounts: (await d.listAccounts(env, false)).map(strip), how_to_read: VIEW_BLURBS.accounts }),
    overview: async env => ({ accounts: await d.overview(env), how_to_read: VIEW_BLURBS.overview + ' window is the selected range; cm is null when costs cannot be trusted.' }),
    account: async (env, a) => {
      const acct = await need(env, a);
      const today = d.localDate(acct.tz);
      return { account: strip(acct), brief_numbers: await d.briefData(env, acct, today), how_to_read: 'These are the numbers the Daily Brief uses, with Triple Whale attribution per channel. mtd = month to date, lm = last month to the same day.' };
    },
    series: async (env, a) => {
      const acct = await need(env, a);
      const days = Math.min(120, Math.max(7, Number(a.days) || 30));
      const to = d.localDate(acct.tz), from = d.addDays(to, -days + 1);
      const { results: meta } = await env.DB.prepare(`SELECT date, spend, impressions, link_clicks, clicks FROM daily_insights WHERE act_id = ?1 AND date >= ?2 AND date <= ?3 ORDER BY date`).bind(acct.act_id, from, to).all();
      const { results: tw } = await env.DB.prepare(`SELECT date, SUM(CASE WHEN metric = 'netSales' THEN value END) AS netSales, SUM(CASE WHEN metric = 'blendedAds' THEN value END) AS blendedAds,
        SUM(CASE WHEN metric = 'newCustomerSales' THEN value END) AS newCustomerSales FROM tw_daily WHERE act_id = ?1 AND date >= ?2 AND date <= ?3 GROUP BY date ORDER BY date`).bind(acct.act_id, from, to).all();
      const byDay = {};
      for (const r of meta || []) byDay[r.date] = { date: r.date, meta_spend: r.spend, impressions: r.impressions, link_clicks: r.link_clicks };
      for (const r of tw || []) Object.assign(byDay[r.date] ||= { date: r.date }, { netSales: r.netSales, blendedAds: r.blendedAds, newCustomerSales: r.newCustomerSales });
      return { brand: acct.name, currency: acct.currency, from, to, days: Object.values(byDay).sort((x, y) => x.date < y.date ? -1 : 1), how_to_read: 'meta_spend is Meta-reported; netSales and blendedAds are Triple Whale (store-level). MER for a day = netSales / blendedAds.' };
    },
    changes: async (env, a) => {
      const acct = await need(env, a);
      const days = Math.min(90, Math.max(1, Number(a.days) || 14));
      const { results } = await env.DB.prepare(`SELECT event_time, category, summary, actor, object_name, reason, note FROM activities WHERE act_id = ?1 AND event_time >= datetime('now', ?2) AND confirmed != -1 ORDER BY event_time DESC LIMIT 60`).bind(acct.act_id, `-${days} days`).all();
      return { brand: acct.name, changes: results || [], how_to_read: VIEW_BLURBS.changes };
    },
    creatives: async (env, a) => {
      const acct = await need(env, a);
      const days = Math.min(60, Math.max(7, Number(a.days) || 14));
      const to = d.localDate(acct.tz), from = d.addDays(to, -days + 1), recent = d.addDays(to, -2);
      const { results } = await env.DB.prepare(`SELECT ad.ad_id, ad.name, ad.status, SUM(x.spend) AS spend, SUM(x.impressions) AS impressions, SUM(x.link_clicks) AS link_clicks, SUM(x.video_thruplay) AS thruplays,
          SUM(CASE WHEN x.date >= ?4 THEN x.spend END) AS spend3, SUM(CASE WHEN x.date >= ?4 THEN x.impressions END) AS imp3, SUM(CASE WHEN x.date >= ?4 THEN x.link_clicks END) AS clicks3
        FROM ad_daily x JOIN ads ad ON ad.act_id = x.act_id AND ad.ad_id = x.ad_id WHERE x.act_id = ?1 AND x.date >= ?2 AND x.date <= ?3 GROUP BY ad.ad_id ORDER BY spend DESC LIMIT 40`).bind(acct.act_id, from, to, recent).all();
      const rows = (results || []).map(r => ({ ...r, ctr: r.impressions ? r.link_clicks / r.impressions : null, ctr_last3: r.imp3 ? r.clicks3 / r.imp3 : null }));
      return { brand: acct.name, from, to, ads: rows, how_to_read: 'Meta-reported only (spend, impressions, link CTR). No purchases or ROAS here on purpose; attribution is Triple Whale\'s and is store-level. ctr_last3 well under ctr means the ad is tiring.' };
    },
    briefs: async (env, a) => {
      const acct = await need(env, a);
      const { results } = await env.DB.prepare(`SELECT date, posted_at, status, substr(text, 1, 1200) AS text FROM briefs WHERE act_id = ?1 ORDER BY date DESC LIMIT 7`).bind(acct.act_id).all();
      return { brand: acct.name, briefs: results || [], how_to_read: VIEW_BLURBS.briefs };
    },
    reports: async (env, a) => {
      const acct = await need(env, a);
      const { results } = await env.DB.prepare(`SELECT period, period_start, period_end, status, sent_at, substr(summary, 1, 1500) AS summary FROM reports WHERE act_id = ?1 ORDER BY period_end DESC LIMIT 8`).bind(acct.act_id).all();
      return { brand: acct.name, reports: results || [], how_to_read: VIEW_BLURBS.reports };
    },
    data_health: async (env, a) => { const acct = await need(env, a); return { brand: acct.name, health: await d.dataHealth(env, acct), how_to_read: VIEW_BLURBS.data_health }; },
    plan: async (env, a) => {
      const acct = await need(env, a);
      const { results } = await env.DB.prepare(`SELECT * FROM p_plan WHERE act_id = ?1 ORDER BY 2 DESC LIMIT 24`).bind(acct.act_id).all().catch(() => ({ results: [] }));
      return { brand: acct.name, goals: d.safeJson(acct.goals_json, {}), plan: results || [], how_to_read: VIEW_BLURBS.plan };
    },
    angles: async (env, a) => {
      const acct = await need(env, a);
      const { results: secs } = await env.DB.prepare(`SELECT id, name, line, pinned, enabled, sort FROM p_amb_section WHERE act_id = ?1 ORDER BY pinned DESC, sort`).bind(acct.act_id).all();
      const { results: angs } = await env.DB.prepare(`SELECT id, section_id, hot, status, title, argument, who, products, format, trend FROM p_amb_angle WHERE act_id = ?1 ORDER BY sort`).bind(acct.act_id).all();
      const hub = await env.DB.prepare(`SELECT slug, live, intro, about, audience, avoid_json, rules_json, season_json FROM p_amb_brand WHERE act_id = ?1`).bind(acct.act_id).first();
      return { brand: acct.name, hub: hub ? { ...hub, avoid: d.safeJson(hub.avoid_json, []), rules: d.safeJson(hub.rules_json, []), season: d.safeJson(hub.season_json, null) } : null,
        sections: (secs || []).map(x => ({ ...x, angles: (angs || []).filter(g => g.section_id === x.id).length })), angles: angs || [], how_to_read: VIEW_BLURBS.angles + ' status draft = archived, not shown to creators.' };
    },
    what_worked: async (env, a) => {
      const acct = await need(env, a);
      const to = d.localDate(acct.tz), from = d.addDays(to, -90);
      const { results } = await env.DB.prepare(`SELECT ad.ad_id, ad.name, SUM(t.revenue) AS tw_revenue, SUM(t.orders) AS tw_orders,
          (SELECT SUM(spend) FROM ad_daily x WHERE x.act_id = t.act_id AND x.ad_id = t.ad_id AND x.date >= ?2 AND x.date <= ?3) AS spend,
          (SELECT SUM(link_clicks) * 1.0 / NULLIF(SUM(impressions), 0) FROM ad_daily x WHERE x.act_id = t.act_id AND x.ad_id = t.ad_id AND x.date >= ?2 AND x.date <= ?3) AS ctr
        FROM tw_ad_attr t JOIN ads ad ON ad.act_id = t.act_id AND ad.ad_id = t.ad_id
        WHERE t.act_id = ?1 AND t.model = 'lastPlatformClick' AND t.date >= ?2 AND t.date <= ?3 GROUP BY t.ad_id ORDER BY tw_revenue DESC LIMIT 25`).bind(acct.act_id, from, to).all();
      return { brand: acct.name, from, to, ads: (results || []).map(r => ({ ...r, roas: r.spend ? Math.round(r.tw_revenue / r.spend * 100) / 100 : null })),
        how_to_read: 'Revenue and orders are Triple Whale attributed (lastPlatformClick). spend and ctr are Meta-reported. The ad NAME carries the angle and the format after the last |; read the names for what the winning arguments were.' };
    },
    brand_context: async (env, a) => {
      const acct = await need(env, a);
      const key = `brandContext:${acct.act_id}`;
      let text = await d.getSetting(env, key);
      /* Nothing written: work it out from what the app already holds (the
         hub, the angles, the ads that sold, the briefs and reports we sent)
         and keep it, marked as derived, so Cole corrects rather than writes. */
      if (!text) {
        text = await deriveBrandContext(env, d, acct).catch(e => '');
        if (text) await d.putSetting(env, key, text);
      }
      return { brand: acct.name, context: text || '', how_to_read: text ? VIEW_BLURBS.brand_context + (text.startsWith('(Derived') ? ' This one was derived by the Strategist from the app\'s own data; treat it as a good first draft and correct it in the chat.' : '')
        : 'Nothing could be worked out for this brand yet (no hub, no angles, no ads, no briefs). Ask Cole.' };
    },
    findings: async (env, a, ctx, engine) => ({ open: await engine.openFindings(env, d.h()), how_to_read: VIEW_BLURBS.findings }),
    config: async env => ({ briefing_channel: await d.getSetting(env, 'strategistChannel'), brief_hour: await d.briefHour(env), how_to_read: VIEW_BLURBS.config }),
  };
}

/* What we know about a brand, worked out from the app itself: the hub's own
 * words, the angles already written, the ads that sold, what we told the
 * client. One model call, kept until Cole corrects it. */
async function deriveBrandContext(env, d, acct) {
  const hub = await env.DB.prepare(`SELECT intro, about, audience, avoid_json, rules_json, season_json FROM p_amb_brand WHERE act_id = ?1`).bind(acct.act_id).first();
  const { results: angs } = await env.DB.prepare(`SELECT a.title, a.argument, a.who, a.products, a.format, s.name AS section FROM p_amb_angle a LEFT JOIN p_amb_section s ON s.id = a.section_id WHERE a.act_id = ?1 AND a.status = 'live' ORDER BY a.sort LIMIT 60`).bind(acct.act_id).all();
  const to = d.localDate(acct.tz), from = d.addDays(to, -120);
  const { results: won } = await env.DB.prepare(`SELECT ad.name, SUM(t.revenue) AS rev, SUM(t.orders) AS ord FROM tw_ad_attr t JOIN ads ad ON ad.act_id = t.act_id AND ad.ad_id = t.ad_id
    WHERE t.act_id = ?1 AND t.model = 'lastPlatformClick' AND t.date >= ?2 AND t.date <= ?3 GROUP BY t.ad_id ORDER BY rev DESC LIMIT 20`).bind(acct.act_id, from, to).all();
  const { results: adNames } = await env.DB.prepare(`SELECT name FROM ads WHERE act_id = ?1 ORDER BY first_spend_date DESC LIMIT 80`).bind(acct.act_id).all();
  const { results: briefs } = await env.DB.prepare(`SELECT substr(text, 1, 1500) AS text FROM briefs WHERE act_id = ?1 AND text IS NOT NULL ORDER BY date DESC LIMIT 3`).bind(acct.act_id).all();
  const { results: reports } = await env.DB.prepare(`SELECT substr(summary, 1, 1500) AS summary FROM reports WHERE act_id = ?1 AND summary IS NOT NULL ORDER BY period_end DESC LIMIT 2`).bind(acct.act_id).all();
  const have = (hub?.about || hub?.intro) || (angs || []).length || (won || []).length || (briefs || []).length;
  if (!have) return '';
  const system = `You write the brand context a marketing strategist needs before writing ads for a client. From the material given, produce a plain-prose brief with these headings: WHAT THEY SELL; WHO BUYS AND WHY; THE VOICE (with three example phrases lifted from the material); WHAT HAS WORKED (the arguments behind the ads that sold, read from the ad names and the angles); CLAIMS AND RULES; KPIs AND TARGETS (only if stated). Say only what the material supports; where it is silent, write "not known yet". No em dashes, no exclamation marks, under 600 words.`;
  const user = `BRAND: ${acct.name} (${acct.currency}, target ROAS ${acct.target_roas ?? 'unset'}, target CPA ${acct.target_cpa ?? 'unset'})\n\nHUB INTRO: ${hub?.intro || ''}\nABOUT: ${hub?.about || ''}\nAUDIENCE: ${hub?.audience || ''}\nAVOID: ${hub?.avoid_json || ''}\nRULES: ${hub?.rules_json || ''}\nSEASON: ${hub?.season_json || ''}\n\nLIVE ANGLES:\n${(angs || []).map(a => `- [${a.section || ''}] ${a.title}: ${a.argument || ''} (${a.who || ''}; ${a.products || ''}; ${a.format || ''})`).join('\n')}\n\nADS THAT SOLD (Triple Whale attributed, 120 days):\n${(won || []).map(w => `- ${w.name}: $${Math.round(w.rev)} / ${w.ord} orders`).join('\n')}\n\nRECENT AD NAMES:\n${(adNames || []).map(a => a.name).join(' | ')}\n\nLAST BRIEFS TO THE CLIENT:\n${(briefs || []).map(b => b.text).join('\n---\n')}\n\nLAST REPORT SUMMARIES:\n${(reports || []).map(r => r.summary).join('\n---\n')}`;
  const text = await d.claude(env, { system, user, maxTokens: 2500 });
  return text ? `(Derived by the Strategist on ${to} from the hub, the angles, the ads and the briefs. Correct it in the chat: "Grunk's context: ...")\n\n${String(text).trim()}` : '';
}

/* ------------------------------------------------------------------ */
/*  the checks: plain SQL over what the syncs wrote                    */
/* ------------------------------------------------------------------ */

const PAUSED = /golf ?sock/i;
const money = (n, cur) => { try { return new Intl.NumberFormat('en-US', { style: 'currency', currency: cur || 'USD', maximumFractionDigits: 0 }).format(n); } catch { return '$' + Math.round(n); } };

async function runChecks(env, h, d) {
  const out = [];
  const accounts = (await d.listAccounts(env, true)).filter(a => !PAUSED.test(a.name));
  const all = async (sql, ...b) => (await env.DB.prepare(sql).bind(...b).all()).results || [];
  for (const a of accounts) {
    const today = d.localDate(a.tz), ym = today.slice(0, 7), dom = Number(today.slice(8));
    const cur = a.currency;

    /* 1. The sync is failing, so every other number is stale. */
    const stale = a.last_sync_insights && d.ymdDiff(today, a.last_sync_insights.slice(0, 10)) >= 2;
    if (a.last_error || stale)
      out.push({ key: `sync:${a.act_id}`, kind: 'sync', severity: 'high', amount: null, month: ym,
        title: `${a.name}: the Meta sync is ${a.last_error ? 'failing' : 'stale'}${a.last_error ? ' (' + String(a.last_error).slice(0, 60) + ')' : ''}`,
        detail: `Last synced ${a.last_sync_insights || 'never'}. Until it is fixed the brief and the reports for ${a.name} are built on old numbers.`, evidence: {} });

    /* 2. The brief did not go out. */
    if (a.brief_enabled) {
      const last = await env.DB.prepare(`SELECT MAX(date) AS d FROM briefs WHERE act_id = ?1 AND posted_at IS NOT NULL`).bind(a.act_id).first();
      if (!last?.d || d.ymdDiff(today, last.d) >= 2)
        out.push({ key: `brief:${a.act_id}:${today}`, kind: 'brief-missing', severity: 'med', amount: null, month: ym,
          title: `${a.name} has not had a Daily Brief since ${last?.d || 'ever'}`,
          detail: 'The client is used to one every morning. Check the review queue in Slack and the data health for the brand.', evidence: {} });
    }

    /* 3. Pacing against the month's budget. */
    const budget = Number(d.safeJson(a.budgets_json, {})[ym] ?? a.monthly_budget) || 0;
    if (budget && dom >= 5) {
      const mtd = (await env.DB.prepare(`SELECT SUM(spend) AS s FROM daily_insights WHERE act_id = ?1 AND date >= ?2 AND date <= ?3`).bind(a.act_id, ym + '-01', today).first())?.s || 0;
      const expected = budget * dom / d.daysInMonth(today);
      const ratio = expected ? mtd / expected : 0;
      if (ratio >= 1.15 || (dom >= 10 && ratio <= 0.7))
        out.push({ key: `pace:${a.act_id}:${ym}`, kind: 'pacing', severity: ratio >= 1.3 ? 'high' : 'med', amount: Math.round(mtd - expected), month: ym,
          title: `${a.name} is ${ratio >= 1 ? 'over' : 'under'} pace: ${money(mtd, cur)} spent by day ${dom}, ${Math.round(ratio * 100)}% of where the ${money(budget, cur)} budget should be`,
          detail: `Meta-reported spend against the month's budget. ${ratio >= 1 ? 'At this rate the month ends around ' + money(mtd / dom * d.daysInMonth(today), cur) + '.' : 'Either the budget is wrong or the campaigns are throttled.'}`, evidence: {} });
    }

    /* 4. Blended ROAS under the client's line three days running (Triple Whale, store-level). */
    if (a.target_roas) {
      const rows = await all(`SELECT date, SUM(CASE WHEN metric = 'netSales' THEN value END) AS sales, SUM(CASE WHEN metric = 'blendedAds' THEN value END) AS ads
        FROM tw_daily WHERE act_id = ?1 AND date >= ?2 AND date < ?3 GROUP BY date ORDER BY date DESC LIMIT 3`, a.act_id, d.addDays(today, -4), today);
      const mers = rows.filter(r => r.ads > 50).map(r => r.sales / r.ads);
      if (mers.length === 3 && mers.every(m => m < a.target_roas))
        out.push({ key: `roas:${a.act_id}:${rows[0].date}`, kind: 'roas', severity: 'high', amount: null, month: ym,
          title: `${a.name}: blended ROAS under ${a.target_roas}x three days running (${mers.map(m => m.toFixed(2)).join(', ')})`,
          detail: 'Triple Whale store-level MER, netSales over all ad spend. Look at what changed on the account this week and at the creatives.', evidence: { days: rows.map(r => r.date) } });
    }

    /* 5. A creative tiring: link CTR over the last 3 days well under its prior 14. */
    const tired = await all(`SELECT ad.name, SUM(CASE WHEN x.date >= ?3 THEN x.spend END) AS spend3,
        SUM(CASE WHEN x.date >= ?3 THEN x.link_clicks END) * 1.0 / NULLIF(SUM(CASE WHEN x.date >= ?3 THEN x.impressions END), 0) AS ctr3,
        SUM(CASE WHEN x.date < ?3 THEN x.link_clicks END) * 1.0 / NULLIF(SUM(CASE WHEN x.date < ?3 THEN x.impressions END), 0) AS ctr14
      FROM ad_daily x JOIN ads ad ON ad.act_id = x.act_id AND ad.ad_id = x.ad_id
      WHERE x.act_id = ?1 AND x.date >= ?2 AND x.date <= ?4 GROUP BY x.ad_id HAVING spend3 >= 150 AND ctr14 > 0 AND ctr3 < ctr14 * 0.6`, a.act_id, d.addDays(today, -17), d.addDays(today, -2), today);
    for (const t of tired.slice(0, 3))
      out.push({ key: `fatigue:${a.act_id}:${String(t.name).slice(0, 40)}:${ym}`, kind: 'fatigue', severity: 'med', amount: Math.round(t.spend3), month: ym,
        title: `${a.name}: "${String(t.name).slice(0, 50)}" is tiring, link CTR ${(t.ctr3 * 100).toFixed(2)}% vs ${(t.ctr14 * 100).toFixed(2)}% before`,
        detail: `${money(t.spend3, cur)} on it in the last three days. Meta-reported CTR. Rotate it or refresh the hook before the CPA follows.`, evidence: {} });
  }
  return out;
}

async function snapshot(env, h, d) {
  const accounts = (await d.overview(env)).filter(a => !PAUSED.test(a.name));
  return { accounts: accounts.map(a => ({ name: a.name, currency: a.currency, window: a.window })) };
}

/* ------------------------------------------------------------------ */
/*  actions: each one proposes; a tap applies                          */
/* ------------------------------------------------------------------ */

const rid = () => crypto.randomUUID().replace(/-/g, '').slice(0, 16);
const clip = (v, n) => v == null ? null : String(v).slice(0, n);

/* Locus's own buttons, through its own routes. Nothing here reaches a client:
 * a redrafted brief or a generated report goes to the internal review queue
 * and waits for a person to send it, exactly as it does from the screen. */
const BUTTONS = (d) => {
  const resolve = async (env, want) => {
    const accounts = await d.listAccounts(env, false);
    const w = String(want || '').toLowerCase().trim();
    return accounts.find(a => a.act_id === want) || accounts.find(a => a.name.toLowerCase() === w) || accounts.find(a => a.name.toLowerCase().includes(w)) || null;
  };
  const brandOr = async (env, b) => { const a = await resolve(env, b); if (!a) throw new Error(`No brand called "${b}". The accounts view lists them.`); return a; };
  const safe = fn => async (env, i, h, ctx) => { try { return await fn(env, i, h, ctx); } catch (e) { return { error: e.message }; } };
  return [
    routeAction({ name: 'set_account',
      description: 'Change a brand\'s account settings (Settings, the brand row): target ROAS, target CPA, the monthly budget or one month\'s budget, whether the Daily Brief runs, the team\'s internal Slack channel id. Never the client channel.',
      input_schema: { type: 'object', properties: { brand: { type: 'string' }, target_roas: { type: 'number' }, target_cpa: { type: 'number' }, monthly_budget: { type: 'number' },
        month: { type: 'string', description: "'YYYY-MM' for a one-month budget override" }, month_budget: { type: 'number' }, brief_enabled: { type: 'boolean' }, team_channel: { type: 'string' }, summary: { type: 'string' } }, required: ['brand', 'summary'] },
      describe: safe(async (env, i) => {
        const a = await brandOr(env, i.brand);
        const body = {}, lines = [];
        if (i.target_roas !== undefined) { body.target_roas = Number(i.target_roas); lines.push(`target ROAS ${a.target_roas ?? 'unset'} → ${body.target_roas}`); }
        if (i.target_cpa !== undefined) { body.target_cpa = Number(i.target_cpa); lines.push(`target CPA ${a.target_cpa ?? 'unset'} → ${body.target_cpa}`); }
        if (i.monthly_budget !== undefined) { body.monthly_budget = Number(i.monthly_budget); lines.push(`monthly budget ${a.monthly_budget ?? 'unset'} → ${body.monthly_budget}`); }
        if (i.month && i.month_budget !== undefined) {
          if (!/^\d{4}-\d{2}$/.test(i.month)) return { error: "month must be 'YYYY-MM'." };
          const budgets = d.safeJson(a.budgets_json, {}) || {}; budgets[i.month] = Number(i.month_budget); body.budgets = budgets; lines.push(`${i.month} budget → ${i.month_budget}`);
        }
        if (i.brief_enabled !== undefined) { body.brief_enabled = !!i.brief_enabled; lines.push(`Daily Brief ${i.brief_enabled ? 'on' : 'off'}`); }
        if (i.team_channel !== undefined) { body.slack_channel = String(i.team_channel).trim(); lines.push(`team channel → ${body.slack_channel}`); }
        if (!lines.length) return { error: 'Nothing to change.' };
        return { summary: i.summary, detail: `${a.name}: ${lines.join(', ')}.`, request: { method: 'PUT', path: `/api/accounts/${a.act_id}`, body } };
      }), done: () => 'Account updated.' }),
    routeAction({ name: 'set_brief_time',
      description: 'Change the hour (Central) the Daily Brief is drafted every morning, 0 to 23.',
      input_schema: { type: 'object', properties: { hour: { type: 'integer' }, summary: { type: 'string' } }, required: ['hour', 'summary'] },
      describe: async (env, i) => Number.isInteger(i.hour) && i.hour >= 0 && i.hour <= 23 ? { summary: i.summary, detail: `The Daily Brief drafts at ${i.hour}:00 Central from tomorrow.`, request: { method: 'PUT', path: '/api/brief-time', body: { hour: i.hour } } } : { error: 'hour must be 0 to 23.' },
      done: () => 'Brief time updated.' }),
    routeAction({ name: 'log_change',
      description: 'Write a change into a brand\'s change log by hand (the Changes tab): what was done on the account and why, so the brief and the team see it. Use it when someone says "log that we ...".',
      input_schema: { type: 'object', properties: { brand: { type: 'string' }, summary: { type: 'string', description: 'What changed, one line.' }, reason: { type: 'string' },
        category: { type: 'string', enum: ['budget', 'new_campaign', 'campaign_paused', 'campaign_relaunched', 'bid_strategy', 'targeting', 'creative', 'other'] }, when: { type: 'string', description: "ISO date-time, default now" } }, required: ['brand', 'summary'] },
      describe: safe(async (env, i) => {
        const a = await brandOr(env, i.brand);
        return { summary: `Log on ${a.name}: ${i.summary}`, detail: `${i.category || 'other'} · ${i.summary}${i.reason ? `\nWhy: ${i.reason}` : ''}`,
          request: { method: 'POST', path: '/api/activities', body: { act_id: a.act_id, summary: i.summary, reason: i.reason || null, category: i.category || 'other', event_time: i.when || undefined, actor: 'the Strategist, for the team' } } };
      }), done: () => 'Logged.' }),
    routeAction({ name: 'redraft_brief',
      description: 'Write a brand\'s Daily Brief again, optionally steered ("lead with the Google drop", "shorter"). It goes to the INTERNAL review queue as a draft; nothing is sent to the client.',
      input_schema: { type: 'object', properties: { brand: { type: 'string' }, date: { type: 'string', description: "'YYYY-MM-DD', default yesterday" }, steer: { type: 'string' }, summary: { type: 'string' } }, required: ['brand', 'summary'] },
      describe: safe(async (env, i) => {
        const a = await brandOr(env, i.brand);
        return { summary: i.summary, detail: `Redraft ${a.name}'s brief${i.date ? ` for ${i.date}` : ''}${i.steer ? `, steered: "${i.steer}"` : ''}. It lands in the review queue; a person still sends it.`,
          request: { method: 'POST', path: '/api/brief-draft', body: { act: a.act_id, date: i.date || undefined, steer: i.steer || undefined } } };
      }), done: () => 'Draft written. It is waiting in the review queue.' }),
    routeAction({ name: 'draft_report',
      description: 'Generate a weekly or monthly client report as a DRAFT for review (the Reports tab). Default: the last complete period. Nothing is sent to the client.',
      input_schema: { type: 'object', properties: { brand: { type: 'string' }, period: { type: 'string', enum: ['weekly', 'monthly'] }, start: { type: 'string', description: "'YYYY-MM-DD', optional" }, summary: { type: 'string' } }, required: ['brand', 'summary'] },
      describe: safe(async (env, i) => {
        const a = await brandOr(env, i.brand);
        return { summary: i.summary, detail: `Draft ${a.name}'s ${i.period || 'weekly'} report${i.start ? ` from ${i.start}` : ' for the last complete period'}. It waits for review; nothing reaches the client.`,
          request: { method: 'POST', path: '/api/report-generate', body: { act: a.act_id, period: i.period || 'weekly', start: i.start || undefined } } };
      }), done: () => 'Report drafted for review.' }),
  ];
};

const ACTIONS = (d) => {
  const resolve = async (env, want) => {
    const accounts = await d.listAccounts(env, false);
    const w = String(want || '').toLowerCase().trim();
    return accounts.find(a => a.act_id === want) || accounts.find(a => a.name.toLowerCase() === w) || accounts.find(a => a.name.toLowerCase().includes(w)) || null;
  };
  return [
    { name: 'set_goals',
      description: 'Set the monthly goals the Daily Brief paces against for one brand: sales, spend, aMER, contribution margin percent. Any field left out keeps its value. Look at the plan view first.',
      input_schema: { type: 'object', properties: {
        brand: { type: 'string' }, month: { type: 'string', description: "'YYYY-MM', or 'default' for the standing goals." },
        sales: { type: 'number' }, spend: { type: 'number' }, amer: { type: 'number' }, cm_pct: { type: 'number', description: 'e.g. 0.32 for 32%' },
        summary: { type: 'string' } }, required: ['brand', 'month', 'summary'] },
      propose: async (env, input) => {
        const acct = await resolve(env, input.brand); if (!acct) return { error: `No brand called "${input.brand}".` };
        const month = input.month === 'default' || /^\d{4}-\d{2}$/.test(input.month || '') ? input.month : null;
        if (!month) return { error: "month must be 'YYYY-MM' or 'default'." };
        const goals = d.safeJson(acct.goals_json, {}) || {};
        const cur = goals[month] || {};
        const next = { ...cur }; const lines = [];
        for (const k of ['sales', 'spend', 'amer', 'cm_pct']) if (input[k] !== undefined) { next[k] = Number(input[k]); lines.push(`${k} ${cur[k] ?? 'unset'} → ${next[k]}`); }
        if (!lines.length) return { error: 'Nothing to change.' };
        return { summary: input.summary, detail: `${acct.name}, ${month}: ${lines.join(', ')}.`, patch: { act_id: acct.act_id, month, goals: next } };
      },
      apply: async (env, patch) => {
        const row = await env.DB.prepare('SELECT goals_json FROM accounts WHERE act_id = ?1').bind(patch.act_id).first();
        const goals = d.safeJson(row?.goals_json, {}) || {};
        goals[patch.month] = patch.goals;
        await env.DB.prepare('UPDATE accounts SET goals_json = ?2 WHERE act_id = ?1').bind(patch.act_id, JSON.stringify(goals)).run();
        return { ok: true, note: 'Goals updated. The next brief paces against them.' };
      } },

    { name: 'set_brand_context',
      description: 'Write or extend what the Strategist knows about a brand for creative work (who buys, why, the voice, the products, the claims, the KPIs). Use it when Cole tells you something about a brand that should shape every future angle.',
      input_schema: { type: 'object', properties: {
        brand: { type: 'string' }, text: { type: 'string', description: 'The context, in plain prose.' },
        mode: { type: 'string', enum: ['append', 'replace'], description: 'append (default) adds a paragraph; replace rewrites the whole thing.' },
        summary: { type: 'string' } }, required: ['brand', 'text', 'summary'] },
      propose: async (env, input) => {
        const acct = await resolve(env, input.brand); if (!acct) return { error: `No brand called "${input.brand}".` };
        return { summary: input.summary, detail: `${acct.name}: ${input.mode === 'replace' ? 'replace the brand context with' : 'add to the brand context'}: "${clip(input.text, 300)}${String(input.text).length > 300 ? '…' : ''}"`,
          patch: { act_id: acct.act_id, text: clip(input.text, 12000), mode: input.mode || 'append' } };
      },
      apply: async (env, patch) => {
        const key = `brandContext:${patch.act_id}`;
        const cur = (await d.getSetting(env, key)) || '';
        await d.putSetting(env, key, patch.mode === 'replace' || !cur ? patch.text : cur + '\n\n' + patch.text);
        return { ok: true, note: 'Brand context updated.' };
      } },

    { name: 'archive_angles',
      description: 'Take angles off the brand\'s hub (they become drafts, not deleted): everything whose title, argument, products or section matches a theme, e.g. "Halloween". A dated section left empty is switched off. Read the angles view first so you can name what will go.',
      input_schema: { type: 'object', properties: {
        brand: { type: 'string' }, matching: { type: 'string', description: 'A theme, a section name, or a word from the titles.' },
        ids: { type: 'array', items: { type: 'string' }, description: 'Exact angle ids instead of a match, when you have them.' },
        summary: { type: 'string' } }, required: ['brand', 'summary'] },
      propose: async (env, input) => {
        const acct = await resolve(env, input.brand); if (!acct) return { error: `No brand called "${input.brand}".` };
        const { results: angs } = await env.DB.prepare(`SELECT a.id, a.title, a.products, a.argument, a.section_id, s.name AS section FROM p_amb_angle a LEFT JOIN p_amb_section s ON s.id = a.section_id WHERE a.act_id = ?1 AND a.status = 'live'`).bind(acct.act_id).all();
        const w = String(input.matching || '').toLowerCase().trim();
        const hit = (input.ids?.length ? (angs || []).filter(x => input.ids.includes(x.id))
          : w ? (angs || []).filter(x => [x.title, x.products, x.argument, x.section].some(v => String(v || '').toLowerCase().includes(w))) : []);
        if (!hit.length) return { error: `No live angle matches "${input.matching || (input.ids || []).join(', ')}".` };
        const secs = [...new Set(hit.map(x => x.section_id).filter(Boolean))].filter(sid => (angs || []).filter(x => x.section_id === sid).every(x => hit.some(h => h.id === x.id)));
        return { summary: input.summary, detail: `${acct.name}: archive ${hit.length} angle${hit.length > 1 ? 's' : ''}: ${hit.map(x => x.title).join('; ')}.${secs.length ? ` The section${secs.length > 1 ? 's' : ''} left empty (${[...new Set(hit.filter(x => secs.includes(x.section_id)).map(x => x.section))].join(', ')}) will be switched off.` : ''}`,
          patch: { act_id: acct.act_id, ids: hit.map(x => x.id), sections: secs } };
      },
      apply: async (env, patch) => {
        for (const id of patch.ids) await env.DB.prepare(`UPDATE p_amb_angle SET status = 'draft', hot = 0, updated_at = datetime('now') WHERE id = ?1 AND act_id = ?2`).bind(id, patch.act_id).run();
        for (const sid of patch.sections || []) await env.DB.prepare(`UPDATE p_amb_section SET enabled = 0 WHERE id = ?1 AND act_id = ?2`).bind(sid, patch.act_id).run();
        return { ok: true, note: `${patch.ids.length} archived${patch.sections?.length ? `, ${patch.sections.length} section${patch.sections.length > 1 ? 's' : ''} off` : ''}.` };
      } },

    { name: 'edit_angle',
      description: 'Change ONE live angle on a brand\'s hub: pin it to Hot right now or unpin it, rename it, rewrite its argument, who, products, format, openers, on-screen text, do or don\'t. Find it by title. Read the angles view first.',
      input_schema: { type: 'object', properties: { brand: { type: 'string' }, angle: { type: 'string', description: 'Its title, or enough of it.' }, hot: { type: 'boolean' },
        title: { type: 'string' }, argument: { type: 'string' }, who: { type: 'string' }, products: { type: 'string' }, format: { type: 'string' },
        openers: { type: 'array', items: { type: 'string' } }, on_screen: { type: 'string' }, do_text: { type: 'string' }, dont_text: { type: 'string' }, summary: { type: 'string' } }, required: ['brand', 'angle', 'summary'] },
      propose: async (env, input) => {
        const acct = await resolve(env, input.brand); if (!acct) return { error: `No brand called "${input.brand}".` };
        const w = String(input.angle || '').toLowerCase();
        const { results } = await env.DB.prepare(`SELECT id, title FROM p_amb_angle WHERE act_id = ?1 AND status = 'live'`).bind(acct.act_id).all();
        const hits = (results || []).filter(x => x.title.toLowerCase().includes(w));
        if (!hits.length) return { error: `No live angle called "${input.angle}".` };
        if (hits.length > 1) return { error: `"${input.angle}" matches ${hits.length} angles: ${hits.map(x => x.title).join('; ')}. Be more specific.` };
        const patch = { act_id: acct.act_id, id: hits[0].id, set: {} }, lines = [];
        const map = { title: 'title', argument: 'argument', who: 'who', products: 'products', format: 'format', on_screen: 'on_screen', do_text: 'do_text', dont_text: 'dont_text' };
        for (const [k, col] of Object.entries(map)) if (input[k] !== undefined) { patch.set[col] = clip(input[k], 400); lines.push(`${k} → ${clip(input[k], 80)}`); }
        if (input.openers) { patch.set.openers_json = JSON.stringify(input.openers.slice(0, 5).map(o => clip(o, 200))); lines.push(`${input.openers.length} new openers`); }
        if (input.hot !== undefined) { patch.set.hot = input.hot ? 1 : 0; lines.push(input.hot ? 'pinned to Hot right now' : 'unpinned from Hot'); }
        if (!lines.length) return { error: 'Nothing to change.' };
        return { summary: input.summary, detail: `${acct.name}, "${hits[0].title}": ${lines.join('; ')}.`, patch };
      },
      apply: async (env, patch) => {
        const cols = Object.keys(patch.set);
        await env.DB.prepare(`UPDATE p_amb_angle SET ${cols.map((c, i) => `${c} = ?${i + 3}`).join(', ')}, updated_at = datetime('now') WHERE id = ?1 AND act_id = ?2`)
          .bind(patch.id, patch.act_id, ...cols.map(c => patch.set[c])).run();
        return { ok: true, note: 'Angle updated on the hub.' };
      } },

    { name: 'edit_section',
      description: 'Change one section of a brand\'s hub: rename it, change its one-line subtitle, or switch it on or off.',
      input_schema: { type: 'object', properties: { brand: { type: 'string' }, section: { type: 'string' }, name: { type: 'string' }, line: { type: 'string' }, enabled: { type: 'boolean' }, summary: { type: 'string' } }, required: ['brand', 'section', 'summary'] },
      propose: async (env, input) => {
        const acct = await resolve(env, input.brand); if (!acct) return { error: `No brand called "${input.brand}".` };
        const w = String(input.section || '').toLowerCase();
        const { results } = await env.DB.prepare(`SELECT id, name, line, enabled FROM p_amb_section WHERE act_id = ?1`).bind(acct.act_id).all();
        const sec = (results || []).find(x => x.name.toLowerCase() === w) || (results || []).find(x => x.name.toLowerCase().includes(w));
        if (!sec) return { error: `No section called "${input.section}".` };
        const patch = { act_id: acct.act_id, id: sec.id, name: input.name ?? sec.name, line: input.line ?? sec.line, enabled: input.enabled === undefined ? sec.enabled : (input.enabled ? 1 : 0) };
        return { summary: input.summary, detail: `${acct.name}, section "${sec.name}"${input.name ? ` → "${input.name}"` : ''}${input.line !== undefined ? `, line "${input.line}"` : ''}${input.enabled !== undefined ? (input.enabled ? ', on' : ', off') : ''}.`, patch };
      },
      apply: async (env, p) => {
        await env.DB.prepare(`UPDATE p_amb_section SET name = ?3, line = ?4, enabled = ?5 WHERE id = ?1 AND act_id = ?2`).bind(p.id, p.act_id, clip(p.name, 60), clip(p.line, 120), p.enabled).run();
        return { ok: true, note: 'Section updated.' };
      } },

    { name: 'create_angles',
      description: 'Write new angles for a brand\'s hub from the evidence (brand context, what sold, the current angles) using Mobius\'s Angle / Concept / Testing framework, and put them in a section (existing by name, or a new one). The proposal shows every angle in full for review before anything is published. Use it for "make N angles for X".',
      input_schema: { type: 'object', properties: {
        brand: { type: 'string' }, theme: { type: 'string', description: 'What the angles are for, e.g. "Black Friday", "gifting", "the new putter". Include any direction Cole gave.' },
        count: { type: 'integer', description: '1 to 10. Default 6.' },
        section: { type: 'string', description: 'The section they go in. An existing section name, or a new one (a dated window like "Black Friday" or a durable lane).' },
        section_line: { type: 'string', description: 'One line under the section name, for a new section.' },
        summary: { type: 'string' } }, required: ['brand', 'theme', 'section', 'summary'] },
      propose: async (env, input, h) => {
        const acct = await resolve(env, input.brand); if (!acct) return { error: `No brand called "${input.brand}".` };
        const n = Math.min(10, Math.max(1, Number(input.count) || 6));
        let context = (await d.getSetting(env, `brandContext:${acct.act_id}`)) || '';
        if (!context) { context = await deriveBrandContext(env, d, acct).catch(() => ''); if (context) await d.putSetting(env, `brandContext:${acct.act_id}`, context); }
        const hub = await env.DB.prepare(`SELECT intro, about, audience, avoid_json, rules_json FROM p_amb_brand WHERE act_id = ?1`).bind(acct.act_id).first();
        const { results: secs } = await env.DB.prepare(`SELECT id, name, line, enabled FROM p_amb_section WHERE act_id = ?1`).bind(acct.act_id).all();
        const { results: angs } = await env.DB.prepare(`SELECT a.title, a.argument, a.who, a.format, s.name AS section FROM p_amb_angle a LEFT JOIN p_amb_section s ON s.id = a.section_id WHERE a.act_id = ?1 AND a.status = 'live' ORDER BY a.sort LIMIT 60`).bind(acct.act_id).all();
        const to = d.localDate(acct.tz), from = d.addDays(to, -90);
        const { results: won } = await env.DB.prepare(`SELECT ad.name, SUM(t.revenue) AS rev, SUM(t.orders) AS ord FROM tw_ad_attr t JOIN ads ad ON ad.act_id = t.act_id AND ad.ad_id = t.ad_id
          WHERE t.act_id = ?1 AND t.model = 'lastPlatformClick' AND t.date >= ?2 AND t.date <= ?3 GROUP BY t.ad_id ORDER BY rev DESC LIMIT 15`).bind(acct.act_id, from, to).all();
        const existing = (secs || []).find(x => x.name.toLowerCase() === String(input.section).toLowerCase());
        const system = `You are the Strategist at Mobius Digital writing angles for ${acct.name}'s creator hub. Follow the framework exactly:
- An ANGLE is the argument: the reason to buy, one sentence, to a specific person, sayable at a bar. Not a persona, topic, feature or format.
- Each angle carries: title (short, punchy), argument (one sentence), who (who it is for), products (a few words), format (one: e.g. "Talking head", "Split screen", "Get ready with me", "Unboxing", "POV", "Static"), lever (the psychological lever, staff only), openers (3 first lines that stop the scroll, in the customer's words), shots (3 to 5 {label, text}), on_screen (the text overlay), do (one line), dont (one line).
- Angles must be genuinely different arguments, not one argument in five formats. No two may share a lever and a who.
- Evidence first: the ads that sold tell you which arguments work for this brand. Build on them; do not repeat a live angle.
- Plain English, the brand's voice, no jargon, no em dashes, no exclamation marks, no claims outside the rules.
Return ONLY a JSON array of ${n} objects with exactly those keys. No prose.`;
        const user = `THEME / DIRECTION: ${input.theme}\nSECTION: ${input.section}${existing ? ' (existing)' : ' (new)'}\n\nBRAND CONTEXT:\n${context || '(none written)'}\n\nHUB INTRO: ${hub?.intro || ''}\nABOUT: ${hub?.about || ''}\nAUDIENCE: ${hub?.audience || ''}\nAVOID: ${JSON.stringify(d.safeJson(hub?.avoid_json, []))}\nRULES: ${JSON.stringify(d.safeJson(hub?.rules_json, []))}\n\nLIVE ANGLES NOW (do not repeat):\n${(angs || []).map(a => `- [${a.section || 'no section'}] ${a.title}: ${a.argument || ''} (${a.who || ''}; ${a.format || ''})`).join('\n') || '(none)'}\n\nWHAT SOLD, LAST 90 DAYS (Triple Whale attributed; the ad name carries the angle and format):\n${(won || []).map(w => `- ${w.name}: $${Math.round(w.rev)} from ${w.ord} orders`).join('\n') || '(no attribution rows yet)'}`;
        let text;
        try { text = await d.claude(env, { system, user, maxTokens: 6000 }); } catch (e) { return { error: 'The writer could not run: ' + e.message }; }
        const m = String(text || '').match(/\[[\s\S]*\]/);
        let list; try { list = JSON.parse(m ? m[0] : '[]'); } catch { return { error: 'The writer did not return a clean list. Try again, or narrow the theme.' }; }
        list = (Array.isArray(list) ? list : []).filter(x => x && x.title && x.argument).slice(0, n);
        if (!list.length) return { error: 'No usable angles came back. Try again with a narrower theme.' };
        const preview = list.map((x, i) => `${i + 1}. ${x.title}\n   ${x.argument}\n   For: ${x.who || ''} · ${x.format || ''} · ${x.products || ''}\n   Openers: ${(x.openers || []).slice(0, 3).map(o => `"${o}"`).join(' / ')}`).join('\n\n');
        return { summary: input.summary, detail: `${acct.name}: ${list.length} new angle${list.length > 1 ? 's' : ''} for ${input.section}${existing ? '' : ' (new section)'}. Review them below; Apply publishes them live on the hub.`, preview,
          patch: { act_id: acct.act_id, section: existing ? { id: existing.id } : { name: clip(input.section, 60), line: clip(input.section_line || input.theme, 120) }, angles: list } };
      },
      apply: async (env, patch) => {
        let sid = patch.section.id;
        if (!sid) {
          sid = rid();
          const mx = await env.DB.prepare(`SELECT COALESCE(MAX(sort),0)+1 AS n FROM p_amb_section WHERE act_id = ?1`).bind(patch.act_id).first();
          await env.DB.prepare(`INSERT INTO p_amb_section (id, act_id, name, line, icon, icon_svg, color, enabled, sort) VALUES (?1,?2,?3,?4,NULL,NULL,?5,1,?6)`)
            .bind(sid, patch.act_id, patch.section.name, patch.section.line || null, '#E86A33', mx?.n || 1).run();
        } else await env.DB.prepare(`UPDATE p_amb_section SET enabled = 1 WHERE id = ?1 AND act_id = ?2`).bind(sid, patch.act_id).run();
        let made = 0;
        for (const x of patch.angles) {
          const mx = await env.DB.prepare(`SELECT COALESCE(MAX(sort),0)+1 AS n FROM p_amb_angle WHERE act_id = ?1`).bind(patch.act_id).first();
          await env.DB.prepare(`INSERT INTO p_amb_angle (id, act_id, section_id, hot, status, title, argument, who, products, format, lever, openers_json, shots_json, on_screen, do_text, dont_text, trend, sort, hot_sort)
            VALUES (?1,?2,?3,0,'live',?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,NULL,?15,0)`)
            .bind(rid(), patch.act_id, sid, clip(x.title, 120), clip(x.argument, 400), clip(x.who, 200), clip(x.products, 120), clip(x.format, 60), clip(x.lever, 120),
              JSON.stringify((x.openers || []).slice(0, 5).map(o => clip(o, 200))), JSON.stringify((x.shots || []).slice(0, 8).map(sh => ({ label: clip(sh.label, 40), text: clip(sh.text, 300) }))),
              clip(x.on_screen, 200), clip(x.do || x.do_text, 300), clip(x.dont || x.dont_text, 300), mx?.n || 1).run();
          made++;
        }
        return { ok: true, note: `${made} angle${made > 1 ? 's' : ''} live on the hub.` };
      } },
  ];
};

/* ------------------------------------------------------------------ */
/*  assembly                                                           */
/* ------------------------------------------------------------------ */

/**
 * @param d  from worker.js: getSetting, putSetting, safeJson, listAccounts,
 *           overview, briefData, dataHealth, localDate, addDays, ymdDiff,
 *           daysInMonth, briefHour, slack (slackApi)
 */
export function buildStrategist(d) {
  const secretKey = makeSecretKey(['passwordHash', 'allowedEmails', 'reportTokens', 'metaToken', 'sessionSecret']);
  let engine;
  const rawViews = buildViews(d);
  const views = Object.fromEntries(Object.entries(rawViews).map(([k, fn]) => [k, (env, a, ctx) => fn(env, a, ctx, engine)]));
  const app = makeAppView({ views, blurbs: VIEW_BLURBS, secretKey, getSetting: d.getSetting, safeJson: d.safeJson, fallbackTables: TABLES });
  const h = () => ({
    getSetting: d.getSetting, putSetting: d.putSetting, safeJson: d.safeJson,
    centralDate: () => d.localDate('America/Chicago'), monthOf: x => String(x).slice(0, 7),
    slack: (env, method, params) => d.slack(env, method, params),
    ...app,
  });
  d.h = h;
  engine = createAssistant({
    name: 'Strategist', app: 'Locus', memoryPrefix: 'strategist', repoPath: 'profit/ for the screens (index.html, meta.js, amb.js), account-health/worker/src for the data and this assistant',
    slackName: 'Strategist',
    who: WHO, schema: SCHEMA, rules: RULES, tables: TABLES, sqlTool: 'query_locus',
    blobColumns: ['data_json', 'extra_json', 'budgets_json', 'goals_json', 'google_spend_json', 'report_config_json'],
    brief: DEFAULT_BRIEF,
    liveContext: async env => {
      const names = (await d.listAccounts(env, true)).map(a => `${a.name} (${a.act_id}, ${a.currency})`);
      return '## The active brands right now\n' + names.join('\n');
    },
    actions: [...ACTIONS(d), ...BUTTONS(d)],
    playbook: PLAYBOOK,
    slackApp: 'locus',
    checkKinds: ['sync', 'brief-missing', 'pacing', 'roas', 'fatigue'],
    checks: (env, hh) => runChecks(env, hh, d),
    snapshot: (env, hh) => snapshot(env, hh, d),
    briefingHow: `- Slack mrkdwn: *bold* with single asterisks, bullets are "• ", no headings, no tables.
- Open with one line on the book: which brands are up, which are down, blended (Triple Whale).
- Then EVERY finding worth the team's time, one bullet each, worst first, drawn ONLY from the findings given. Each bullet: the brand, what happened, the number, what to do and who should do it.
- Say "Meta-reported" or "Triple Whale" whenever a number could be either. Never invent a number. Never use em dashes. Plain English.`,
  });
  return { engine, h, views: app };
}

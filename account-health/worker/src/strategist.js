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

import { createAssistant, makeAppView, makeSecretKey } from '../../../ask/engine.js';

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
    findings: async (env, a, ctx, engine) => ({ open: await engine.openFindings(env, d.h()), how_to_read: VIEW_BLURBS.findings }),
    config: async env => ({ briefing_channel: await d.getSetting(env, 'strategistChannel'), brief_hour: await d.briefHour(env), how_to_read: VIEW_BLURBS.config }),
  };
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
    name: 'Strategist', app: 'Locus', memoryPrefix: 'strategist',
    slackName: 'Strategist',
    who: WHO, schema: SCHEMA, rules: RULES, tables: TABLES, sqlTool: 'query_locus',
    blobColumns: ['data_json', 'extra_json', 'budgets_json', 'goals_json', 'google_spend_json', 'report_config_json'],
    brief: DEFAULT_BRIEF,
    liveContext: async env => {
      const names = (await d.listAccounts(env, true)).map(a => `${a.name} (${a.act_id}, ${a.currency})`);
      return '## The active brands right now\n' + names.join('\n');
    },
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

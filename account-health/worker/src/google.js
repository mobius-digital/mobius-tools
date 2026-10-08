/**
 * Google, read directly (Locus, 2026-10-08): GA4 (website analytics), Search Console (organic search)
 * and Google Ads, through the SAME service account that already reads Drive and sends Gmail
 * (GOOGLE_SA_KEY, domain-wide delegation, acting as a Mobius person who has access).
 *
 * What each needs, once:
 *   GA4            scope analytics.readonly on the delegation; the Analytics Data API and Analytics
 *                  Admin API enabled on the Cloud project; the person we act as (GOOGLE_AS, default
 *                  Cole) is a Viewer on each client's GA4 property.
 *   Search Console scope webmasters.readonly; the Search Console API enabled; that person is a user on
 *                  each client's property.
 *   Google Ads     scope adwords; the Google Ads API enabled; a developer token from the Mobius
 *                  manager account (secret GOOGLE_ADS_DEV_TOKEN) and its id (var GOOGLE_ADS_MCC);
 *                  each client account linked under that manager.
 * AdSense is NOT needed: it is for sites that SHOW ads, not brands that buy them.
 *
 * Per brand the ids live in p_br_doc key 'google' {ga4, gsc, ads} (Settings > Connections, or
 * auto-matched by /api/google/match from the properties this person can see).
 */
import { googleToken } from './asana-brand.js';

let F = fetch;
export function useFetch(f) { F = f; }
const safeJson = (s, fb) => { try { return s ? JSON.parse(s) : fb; } catch { return fb; } };
const AS = env => env.GOOGLE_AS || 'cole@go-mobius-digital.com';
export const SCOPES = {
  ga: 'https://www.googleapis.com/auth/analytics.readonly',
  gsc: 'https://www.googleapis.com/auth/webmasters.readonly',
  ads: 'https://www.googleapis.com/auth/adwords',
};
const ADS_V = 'v25';

async function gfetch(env, scope, url, init = {}) {
  const tok = await googleToken(env, AS(env), scope);
  const headers = { Authorization: `Bearer ${tok}`, ...(init.body ? { 'Content-Type': 'application/json' } : {}), ...(init.headers || {}) };
  const res = await F(url, { method: init.method || (init.body ? 'POST' : 'GET'), headers, body: init.body ? JSON.stringify(init.body) : undefined });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) {
    const e = j.error || {}; const msg = e.message || e.status || (typeof j.error === 'string' ? j.error : '') || `HTTP ${res.status}`;
    throw Object.assign(new Error(msg), { status: res.status, body: j });
  }
  return j;
}
/* Developer tokens were retired on 2026-09-09: access belongs to the Cloud project (mobius-tools-506114) now,
   so the header is sent only if one is still set. */
const adsHeaders = env => ({ ...(env.GOOGLE_ADS_DEV_TOKEN ? { 'developer-token': env.GOOGLE_ADS_DEV_TOKEN } : {}), ...(env.GOOGLE_ADS_MCC ? { 'login-customer-id': String(env.GOOGLE_ADS_MCC).replace(/\D/g, '') } : {}) });

/** Which of the three can we read today, and what can we see. Never throws. */
export async function googleProbe(env) {
  const k = safeJson(env.GOOGLE_SA_KEY, {}) || {};
  /* Not secrets: the ids Cole needs to find the right screens. The private key never leaves. */
  const out = { acting_as: AS(env), service_account: k.client_id ? `client id ${k.client_id}` : 'missing', client_id: k.client_id || null, client_email: k.client_email || null, project_id: k.project_id || null };
  const step = async (k, fn) => { try { out[k] = { ok: true, ...(await fn()) }; } catch (e) { out[k] = { ok: false, error: e.message, fix: fixFor(k, e.message) }; } };
  await step('ga4', async () => {
    const j = await gfetch(env, SCOPES.ga, 'https://analyticsadmin.googleapis.com/v1beta/accountSummaries?pageSize=200');
    const props = (j.accountSummaries || []).flatMap(a => (a.propertySummaries || []).map(p => ({ id: p.property.replace('properties/', ''), name: p.displayName, account: a.displayName })));
    return { properties: props };
  });
  await step('gsc', async () => {
    const j = await gfetch(env, SCOPES.gsc, 'https://www.googleapis.com/webmasters/v3/sites');
    return { sites: (j.siteEntry || []).map(s => ({ url: s.siteUrl, level: s.permissionLevel })) };
  });
  await step('ads', async () => {
    const j = await gfetch(env, SCOPES.ads, `https://googleads.googleapis.com/${ADS_V}/customers:listAccessibleCustomers`, { headers: adsHeaders(env) });
    return { customers: (j.resourceNames || []).map(r => r.replace('customers/', '')) };
  });
  return out;
}
function fixFor(k, msg) {
  const m = String(msg || '');
  if (/unauthorized_client|not authorized|delegation/i.test(m)) return `Add the ${k === 'ga4' ? 'analytics.readonly' : k === 'gsc' ? 'webmasters.readonly' : 'adwords'} scope to the service account's domain-wide delegation (Google Workspace admin > Security > API controls > Domain-wide delegation).`;
  if (/has not been used|is disabled|SERVICE_DISABLED|API has not/i.test(m)) return `Enable the ${k === 'ga4' ? 'Google Analytics Data API and Google Analytics Admin API' : k === 'gsc' ? 'Google Search Console API' : 'Google Ads API'} on the Google Cloud project that owns the service account.`;
  if (/developer token|access level|test account|DEVELOPER_TOKEN|AUTHORIZATION_ERROR|NOT_APPROVED/i.test(m)) return 'Google Cloud console > project mobius-tools-506114 > APIs and services > Google Ads API > Overview: complete brand verification and apply for Basic access (developer tokens were retired on 2026-09-09).';
  if (k === 'ads' && /permission|PERMISSION_DENIED|403/i.test(m)) return 'The Cloud project is still on Test access, which cannot read real ad accounts. Google Cloud console > project mobius-tools-506114 > APIs and services > Google Ads API > Overview: complete brand verification and apply for Basic access.';
  if (/permission|PERMISSION_DENIED|403/i.test(m)) return `Give ${'the person Locus acts as'} access to that property.`;
  return '';
}

export async function linkFor(env, act) {
  const r = await env.DB.prepare(`SELECT data_json FROM p_br_doc WHERE act_id = ?1 AND line_id = '' AND key = 'google'`).bind(act).first().catch(() => null);
  return safeJson(r?.data_json, {}) || {};
}
export async function setLink(env, act, patch) {
  const cur = await linkFor(env, act);
  const next = { ...cur };
  for (const k of ['ga4', 'gsc', 'ads']) if (k in patch) next[k] = patch[k] ? String(patch[k]).trim() : null;
  await env.DB.prepare(`INSERT INTO p_br_doc (act_id, line_id, key, data_json, status, source, updated_at) VALUES (?1, '', 'google', ?2, 'approved', 'staff', datetime('now'))
    ON CONFLICT(act_id, line_id, key) DO UPDATE SET data_json = excluded.data_json, updated_at = excluded.updated_at`).bind(act, JSON.stringify(next)).run();
  return next;
}
/** Match every brand to the GA4 property and Search Console site whose name or URL carries its
 *  store domain or name. Only fills what is empty; never overwrites a link someone set. */
export async function autoMatch(env) {
  const probe = await googleProbe(env);
  const { results: accts } = await env.DB.prepare(`SELECT act_id, name, tw_shop FROM brand_accounts WHERE active = 1`).all().catch(() => ({ results: [] }));
  const norm = s => String(s || '').toLowerCase().replace(/https?:\/\/|www\.|sc-domain:|\.myshopify\.com|[^a-z0-9]/g, '');
  const done = [];
  for (const a of accts || []) {
    const link = await linkFor(env, a.act_id); const keys = [norm(a.name), norm((a.tw_shop || '').split('.')[0])].filter(x => x.length > 3);
    const hit = (txt) => keys.some(k => norm(txt).includes(k) || k.includes(norm(txt)) && norm(txt).length > 4);
    const patch = {};
    if (!link.ga4 && probe.ga4?.ok) { const p = probe.ga4.properties.find(p => hit(p.name) || hit(p.account)); if (p) patch.ga4 = p.id; }
    if (!link.gsc && probe.gsc?.ok) { const s = probe.gsc.sites.find(s => hit(s.url)); if (s) patch.gsc = s.url; }
    if (Object.keys(patch).length) { await setLink(env, a.act_id, patch); done.push({ brand: a.name, ...patch }); }
  }
  return { matched: done, probe };
}

/* ---------- readers, cached an hour per brand + window ---------- */
async function cached(env, key, ttlMs, fn) {
  const row = await env.DB.prepare(`SELECT value FROM settings WHERE key = ?1`).bind(key).first().catch(() => null);
  if (row?.value) { try { const v = JSON.parse(row.value); if (v.at && Date.now() - Date.parse(v.at) < ttlMs) return { ...v.data, cached_at: v.at }; } catch {} }
  const data = await fn();
  if (!data?.error) await env.DB.prepare(`INSERT INTO settings (key, value) VALUES (?1, ?2) ON CONFLICT(key) DO UPDATE SET value = excluded.value`).bind(key, JSON.stringify({ at: new Date().toISOString(), data })).run().catch(() => {});
  return data;
}
const num = v => v == null ? null : +v;
const ga4 = (env, prop, body) => gfetch(env, SCOPES.ga, `https://analyticsdata.googleapis.com/v1beta/properties/${prop}:runReport`, { body });
const rowsOf = (j, dims, mets) => (j.rows || []).map(r => Object.fromEntries([...dims.map((d, i) => [d, r.dimensionValues[i].value]), ...mets.map((m, i) => [m, num(r.metricValues[i].value)])]));

/** GA4 for one brand and window: totals against the window before, by day, channel groups,
 *  landing pages, devices, and the shopping funnel. */
export async function websiteReport(env, act, from, to, pfrom, pto) {
  const link = await linkFor(env, act);
  if (!link.ga4) return { error: 'not_linked', what: 'ga4' };
  return cached(env, `g4:${act}:${link.ga4}:${from}:${to}:${pfrom || ""}`, 3600e3, async () => {
    const P = link.ga4; const range = [{ startDate: from, endDate: to }];
    const M = ['sessions', 'totalUsers', 'newUsers', 'engagedSessions', 'engagementRate', 'averageSessionDuration', 'ecommercePurchases', 'purchaseRevenue', 'addToCarts', 'checkouts'];
    const [tot, prev, byDay, chan, land, dev, src] = await Promise.all([
      ga4(env, P, { dateRanges: range, metrics: M.map(name => ({ name })) }),
      pfrom ? ga4(env, P, { dateRanges: [{ startDate: pfrom, endDate: pto }], metrics: M.map(name => ({ name })) }).catch(() => null) : null,
      ga4(env, P, { dateRanges: range, dimensions: [{ name: 'date' }], metrics: ['sessions', 'ecommercePurchases', 'purchaseRevenue'].map(name => ({ name })), orderBys: [{ dimension: { dimensionName: 'date' } }] }),
      ga4(env, P, { dateRanges: range, dimensions: [{ name: 'sessionDefaultChannelGroup' }], metrics: ['sessions', 'engagementRate', 'ecommercePurchases', 'purchaseRevenue'].map(name => ({ name })), orderBys: [{ metric: { metricName: 'sessions' }, desc: true }], limit: 12 }),
      ga4(env, P, { dateRanges: range, dimensions: [{ name: 'landingPagePlusQueryString' }], metrics: ['sessions', 'engagementRate', 'ecommercePurchases', 'purchaseRevenue'].map(name => ({ name })), orderBys: [{ metric: { metricName: 'sessions' }, desc: true }], limit: 15 }),
      ga4(env, P, { dateRanges: range, dimensions: [{ name: 'deviceCategory' }], metrics: ['sessions', 'ecommercePurchases', 'purchaseRevenue'].map(name => ({ name })) }),
      ga4(env, P, { dateRanges: range, dimensions: [{ name: 'sessionSourceMedium' }], metrics: ['sessions', 'ecommercePurchases', 'purchaseRevenue'].map(name => ({ name })), orderBys: [{ metric: { metricName: 'sessions' }, desc: true }], limit: 15 }),
    ]);
    const one = j => { const r = rowsOf(j, [], M)[0] || {}; return r; };
    const days = rowsOf(byDay, ['date'], ['sessions', 'ecommercePurchases', 'purchaseRevenue']).map(r => ({ date: `${r.date.slice(0, 4)}-${r.date.slice(4, 6)}-${r.date.slice(6)}`, sessions: r.sessions, purchases: r.ecommercePurchases, revenue: r.purchaseRevenue }));
    return { property: P, cur: one(tot), prev: prev ? one(prev) : null, days,
      channels: rowsOf(chan, ['group'], ['sessions', 'engagementRate', 'ecommercePurchases', 'purchaseRevenue']),
      landing: rowsOf(land, ['page'], ['sessions', 'engagementRate', 'ecommercePurchases', 'purchaseRevenue']),
      devices: rowsOf(dev, ['device'], ['sessions', 'ecommercePurchases', 'purchaseRevenue']),
      sources: rowsOf(src, ['source'], ['sessions', 'ecommercePurchases', 'purchaseRevenue']) };
  });
}

/** Search Console for one brand and window: totals, by day, top queries split brand vs not, top pages. */
export async function searchReport(env, act, from, to, pfrom, pto, brandWords = []) {
  const link = await linkFor(env, act);
  if (!link.gsc) return { error: 'not_linked', what: 'gsc' };
  return cached(env, `gsc:${act}:${encodeURIComponent(link.gsc)}:${from}:${to}:${pfrom || ""}`, 3600e3, async () => {
    const site = encodeURIComponent(link.gsc);
    const q = body => gfetch(env, SCOPES.gsc, `https://www.googleapis.com/webmasters/v3/sites/${site}/searchAnalytics/query`, { body });
    const [tot, prev, byDay, queries, pages] = await Promise.all([
      q({ startDate: from, endDate: to }),
      pfrom ? q({ startDate: pfrom, endDate: pto }).catch(() => null) : null,
      q({ startDate: from, endDate: to, dimensions: ['date'] }),
      q({ startDate: from, endDate: to, dimensions: ['query'], rowLimit: 200 }),
      q({ startDate: from, endDate: to, dimensions: ['page'], rowLimit: 15 }),
    ]);
    const t = r => r && r.rows && r.rows[0] ? { clicks: r.rows[0].clicks, impressions: r.rows[0].impressions, ctr: r.rows[0].ctr, position: r.rows[0].position } : { clicks: 0, impressions: 0, ctr: null, position: null };
    const words = brandWords.map(w => String(w).toLowerCase()).filter(w => w.length > 2);
    const isBrand = s => words.some(w => s.toLowerCase().replace(/\s+/g, '').includes(w.replace(/\s+/g, '')));
    const qs = (queries.rows || []).map(r => ({ query: r.keys[0], clicks: r.clicks, impressions: r.impressions, ctr: r.ctr, position: r.position, brand: isBrand(r.keys[0]) }));
    const split = qs.reduce((s, r) => { const k = r.brand ? 'brand' : 'other'; s[k].clicks += r.clicks; s[k].impressions += r.impressions; return s; }, { brand: { clicks: 0, impressions: 0 }, other: { clicks: 0, impressions: 0 } });
    return { site: link.gsc, cur: t(tot), prev: prev ? t(prev) : null,
      days: (byDay.rows || []).map(r => ({ date: r.keys[0], clicks: r.clicks, impressions: r.impressions, position: r.position })),
      queries: qs.slice(0, 40), split, pages: (pages.rows || []).map(r => ({ page: r.keys[0], clicks: r.clicks, impressions: r.impressions, ctr: r.ctr, position: r.position })) };
  });
}

/** Google Ads for one brand: campaigns with type, spend, conversions, value, by day. Needs the developer token. */
export async function adsReport(env, act, from, to) {
  const link = await linkFor(env, act);
  if (!link.ads) return { error: 'not_linked', what: 'ads' };
  return cached(env, `gads:${act}:${link.ads}:${from}:${to}`, 3600e3, async () => {
    const cid = String(link.ads).replace(/\D/g, '');
    const search = query => gfetch(env, SCOPES.ads, `https://googleads.googleapis.com/${ADS_V}/customers/${cid}/googleAds:search`, { body: { query }, headers: adsHeaders(env) });
    const camps = await search(`SELECT campaign.id, campaign.name, campaign.status, campaign.advertising_channel_type, metrics.cost_micros, metrics.impressions, metrics.clicks, metrics.conversions, metrics.conversions_value FROM campaign WHERE segments.date BETWEEN '${from}' AND '${to}' AND metrics.cost_micros > 0 ORDER BY metrics.cost_micros DESC`);
    const days = await search(`SELECT segments.date, metrics.cost_micros, metrics.clicks, metrics.conversions, metrics.conversions_value FROM customer WHERE segments.date BETWEEN '${from}' AND '${to}'`);
    return { customer: cid,
      campaigns: (camps.results || []).map(r => ({ id: r.campaign.id, name: r.campaign.name, status: r.campaign.status, type: r.campaign.advertisingChannelType, spend: (+r.metrics.costMicros || 0) / 1e6, impressions: +r.metrics.impressions || 0, clicks: +r.metrics.clicks || 0, conversions: +r.metrics.conversions || 0, value: +r.metrics.conversionsValue || 0 })),
      days: (days.results || []).map(r => ({ date: r.segments.date, spend: (+r.metrics.costMicros || 0) / 1e6, clicks: +r.metrics.clicks || 0, conversions: +r.metrics.conversions || 0, value: +r.metrics.conversionsValue || 0 })) };
  });
}

/** Turn on the four Google APIs in the service account's own project (Service Usage API), acting as
 *  the service account itself. Works only if the account has that permission on its project; if
 *  not, Google says so and Cole presses Enable in the console instead. Never throws. */
export async function enableApis(env) {
  const k = safeJson(env.GOOGLE_SA_KEY, {}) || {};
  const apis = ['analyticsdata.googleapis.com', 'analyticsadmin.googleapis.com', 'searchconsole.googleapis.com', 'googleads.googleapis.com'];
  try {
    const tok = await googleToken(env, undefined, 'https://www.googleapis.com/auth/cloud-platform');
    const res = await F(`https://serviceusage.googleapis.com/v1/projects/${k.project_id}/services:batchEnable`, { method: 'POST', headers: { Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ serviceIds: apis }) });
    const j = await res.json().catch(() => ({}));
    return res.ok ? { ok: true, project: k.project_id, apis, operation: j.name || null } : { ok: false, project: k.project_id, error: j.error?.message || `HTTP ${res.status}` };
  } catch (e) { return { ok: false, project: k.project_id, error: e.message }; }
}

/** Every client account under the Mobius manager account, with names (for matching to brands). */
export async function adsAccounts(env) {
  const mcc = String(env.GOOGLE_ADS_MCC || '').replace(/\D/g, '');
  if (!mcc) return { error: 'GOOGLE_ADS_MCC is not set' };
  try {
    const j = await gfetch(env, SCOPES.ads, `https://googleads.googleapis.com/${ADS_V}/customers/${mcc}/googleAds:search`, { body: { query: 'SELECT customer_client.id, customer_client.descriptive_name, customer_client.manager, customer_client.status, customer_client.currency_code FROM customer_client WHERE customer_client.level <= 1' }, headers: adsHeaders(env) });
    return { accounts: (j.results || []).map(r => ({ id: String(r.customerClient.id), name: r.customerClient.descriptiveName || '', manager: !!r.customerClient.manager, status: r.customerClient.status, currency: r.customerClient.currencyCode })) };
  } catch (e) { return { error: e.message, fix: fixFor('ads', e.message) }; }
}

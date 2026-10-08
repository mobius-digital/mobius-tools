/**
 * TikTok Ads read directly (Locus, 2026-10-08). Until this is connected, Ads > TikTok shows Triple Whale's
 * daily totals; once it is, each linked brand also gets its campaigns from TikTok's Marketing API.
 *
 * Setup (Cole, once): create a developer app at business-api.tiktok.com (Marketing API, scopes: Ad Account
 * Management read, Reporting), set its redirect URL to <this worker>/tiktok/callback, then set the secrets
 * TIKTOK_APP_ID and TIKTOK_APP_SECRET on the account-health worker. Then Settings > Connections > TikTok >
 * Connect: Cole signs in to TikTok for Business and ticks the ad accounts. One sign-in covers every ad account
 * the Mobius Business Center can see.
 *
 * Token: settings `tiktok_tokens` {access_token, refresh_token, advertiser_ids, since}. Per brand:
 * p_br_doc key 'tiktok' {advertiser_id} (Connections paste box, or matched by name).
 */
let F = fetch;
export function useFetch(f) { F = f; }
const API = 'https://business-api.tiktok.com/open_api/v1.3';
const safeJson = (s, fb) => { try { return s ? JSON.parse(s) : fb; } catch { return fb; } };
const getS = async (env, k) => (await env.DB.prepare(`SELECT value FROM settings WHERE key = ?1`).bind(k).first().catch(() => null))?.value || null;
const putS = (env, k, v) => env.DB.prepare(`INSERT INTO settings (key, value) VALUES (?1, ?2) ON CONFLICT(key) DO UPDATE SET value = excluded.value`).bind(k, v).run();

export async function tiktokStatus(env) {
  const t = safeJson(await getS(env, 'tiktok_tokens'), null);
  return { app: !!(env.TIKTOK_APP_ID && env.TIKTOK_APP_SECRET), connected: !!t?.access_token, since: t?.since || null, advertisers: (t?.advertisers || []).map(a => ({ id: a.id, name: a.name })) };
}
export async function tiktokStart(env, origin) {
  if (!env.TIKTOK_APP_ID) throw new Error('Set TIKTOK_APP_ID and TIKTOK_APP_SECRET on the account-health worker first.');
  const state = crypto.randomUUID().replace(/-/g, '');
  await putS(env, 'tiktok_state', JSON.stringify({ state, at: Date.now() }));
  return { url: `https://business-api.tiktok.com/portal/auth?app_id=${encodeURIComponent(env.TIKTOK_APP_ID)}&state=${state}&redirect_uri=${encodeURIComponent(origin + '/tiktok/callback')}` };
}
async function tt(env, path, { method = 'GET', body, token } = {}) {
  const res = await F(`${API}${path}`, { method, headers: { 'Content-Type': 'application/json', ...(token ? { 'Access-Token': token } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const j = await res.json().catch(() => ({}));
  if (!res.ok || (j.code && j.code !== 0)) throw new Error(j.message || `TikTok ${res.status}`);
  return j.data || {};
}
/** The public callback: swap the code, remember the token and the ad accounts with their names. */
export async function tiktokCallback(env, url) {
  const st = safeJson(await getS(env, 'tiktok_state'), null);
  if (!st || st.state !== url.searchParams.get('state') || Date.now() - st.at > 20 * 60e3) throw new Error('That sign-in link expired. Start again from Locus.');
  const d = await tt(env, '/oauth2/access_token/', { method: 'POST', body: { app_id: env.TIKTOK_APP_ID, secret: env.TIKTOK_APP_SECRET, auth_code: url.searchParams.get('auth_code') || url.searchParams.get('code') } });
  const ids = (d.advertiser_ids || []).map(String);
  let advertisers = ids.map(id => ({ id, name: null }));
  try { const info = await tt(env, `/advertiser/info/?advertiser_ids=${encodeURIComponent(JSON.stringify(ids))}&fields=${encodeURIComponent(JSON.stringify(['advertiser_id', 'name', 'currency']))}`, { token: d.access_token });
    advertisers = (info.list || []).map(a => ({ id: String(a.advertiser_id), name: a.name, currency: a.currency })); } catch {}
  await putS(env, 'tiktok_tokens', JSON.stringify({ access_token: d.access_token, refresh_token: d.refresh_token || null, advertiser_ids: ids, advertisers, since: new Date().toISOString() }));
  await putS(env, 'tiktok_state', '');
  return { advertisers };
}
export async function tiktokLink(env, act) {
  const r = await env.DB.prepare(`SELECT data_json FROM p_br_doc WHERE act_id = ?1 AND line_id = '' AND key = 'tiktok'`).bind(act).first().catch(() => null);
  return safeJson(r?.data_json, {}) || {};
}
export async function setTiktokLink(env, act, advertiser_id) {
  await env.DB.prepare(`INSERT INTO p_br_doc (act_id, line_id, key, data_json, status, source, updated_at) VALUES (?1, '', 'tiktok', ?2, 'approved', 'staff', datetime('now'))
    ON CONFLICT(act_id, line_id, key) DO UPDATE SET data_json = excluded.data_json, updated_at = excluded.updated_at`).bind(act, JSON.stringify({ advertiser_id: String(advertiser_id || '').replace(/\D/g, '') || null })).run();
}
/** Campaigns for one brand and window, from TikTok's own reporting (cached an hour). */
export async function tiktokReport(env, act, from, to) {
  const t = safeJson(await getS(env, 'tiktok_tokens'), null);
  if (!t?.access_token) return { error: 'not_connected' };
  const link = await tiktokLink(env, act);
  if (!link.advertiser_id) return { error: 'not_linked' };
  const key = `ttr:${act}:${link.advertiser_id}:${from}:${to}`;
  const hit = safeJson(await getS(env, key), null);
  if (hit && Date.now() - Date.parse(hit.at) < 3600e3) return hit.data;
  const q = p => Object.entries(p).map(([k, v]) => `${k}=${encodeURIComponent(typeof v === 'string' ? v : JSON.stringify(v))}`).join('&');
  const metrics = ['campaign_name', 'spend', 'impressions', 'clicks', 'ctr', 'cpm', 'conversion', 'cost_per_conversion', 'complete_payment', 'complete_payment_roas', 'total_complete_payment_rate'];
  const camp = await tt(env, `/report/integrated/get/?${q({ advertiser_id: link.advertiser_id, report_type: 'BASIC', data_level: 'AUCTION_CAMPAIGN', dimensions: ['campaign_id'], metrics, start_date: from, end_date: to, page_size: 200 })}`, { token: t.access_token });
  const days = await tt(env, `/report/integrated/get/?${q({ advertiser_id: link.advertiser_id, report_type: 'BASIC', data_level: 'AUCTION_ADVERTISER', dimensions: ['stat_time_day'], metrics: ['spend', 'impressions', 'clicks', 'complete_payment'], start_date: from, end_date: to, page_size: 400 })}`, { token: t.access_token });
  const n = v => +v || 0;
  const data = { advertiser_id: link.advertiser_id,
    campaigns: (camp.list || []).map(r => ({ id: r.dimensions?.campaign_id, name: r.metrics?.campaign_name, spend: n(r.metrics?.spend), impressions: n(r.metrics?.impressions), clicks: n(r.metrics?.clicks), ctr: n(r.metrics?.ctr) / 100, cpm: n(r.metrics?.cpm), purchases: n(r.metrics?.complete_payment), roas: n(r.metrics?.complete_payment_roas) })).filter(c => c.spend > 0).sort((a, b) => b.spend - a.spend),
    days: (days.list || []).map(r => ({ date: String(r.dimensions?.stat_time_day || '').slice(0, 10), spend: n(r.metrics?.spend), impressions: n(r.metrics?.impressions), clicks: n(r.metrics?.clicks), purchases: n(r.metrics?.complete_payment) })).sort((a, b) => a.date < b.date ? -1 : 1) };
  await putS(env, key, JSON.stringify({ at: new Date().toISOString(), data })).catch(() => {});
  return data;
}
